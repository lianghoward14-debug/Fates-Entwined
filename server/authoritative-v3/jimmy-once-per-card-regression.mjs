import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,applyOperation,effectiveFate,reduceCommand} from '../../shared/engine/index.mjs';
import {recordDylanReductionUses} from '../../shared/engine/modifiers.mjs';
const cards=createRequire(import.meta.url)('../fate-card-catalog.js').getCardCatalog().cards;
function fresh(){return createInitialState({matchId:'jimmy-once',seed:'jimmy',handSize:99,cardDefinitions:cards,players:[{id:'p0',deckIds:['10','10','41','70','31']},{id:'p1',deckIds:['10','10','76']}]});}
function board(s,p,id,c){const i=s.players[p].hand.findIndex(x=>x.id===id),card=s.players[p].hand.splice(i,1)[0];s.board[0][p?0:2][c]=card;return card;}
{
 const s=fresh(),d=board(s,0,'10',0),j=board(s,0,'41',1);
 recordDylanReductionUses(s);assert.equal(s.fateReductionEffectUses[0],0,'no opponent, no credit');
 const t=board(s,1,'10',0);t.statuses.push('EFFECTS_SUPPRESSED');t.currentFate=0;
 recordDylanReductionUses(s);assert.equal(s.fateReductionEffectUses[0],0,'zero Fate, no actual loss');
 t.currentFate=8;recordDylanReductionUses(s);assert.equal(s.fateReductionEffectUses[0],1);assert.equal(effectiveFate(s,j),3);
 for(let n=0;n<20;n++){effectiveFate(s,t);recordDylanReductionUses(s);}assert.equal(s.fateReductionEffectUses[0],1);
 const d2=board(s,0,'10',2);recordDylanReductionUses(s);assert.equal(s.fateReductionEffectUses[0],2,'each copy counts once');
 const ctx={state:s,events:[],ruleEvents:[]};applyOperation(ctx,{type:'DISCARD_CARD',targetIid:d.iid,sourceController:0});
 assert.equal(s.fateReductionEffectUses[0],2,'credit survives leaving the board');
 applyOperation(ctx,{type:'TRANSFER_CARDS',targetIid:d.iid,playerIndex:0,destinationPile:'hand'});
 assert(!d.counters.jimmyReductionEffectCounted,'recycling restores eligibility');
 s.players[0].hand.splice(s.players[0].hand.indexOf(d),1);s.board[0][2][0]=d;recordDylanReductionUses(s);assert.equal(s.fateReductionEffectUses[0],3);
}
for(const sourceId of ['70','31']){
 const s=fresh(),source=s.players[0].hand.find(c=>c.id===sourceId),t=board(s,1,'10',0);t.statuses.push('EFFECTS_SUPPRESSED');t.currentFate=30;
 const ctx={state:s,events:[],ruleEvents:[]};
 const reduce=()=>applyOperation(ctx,{type:'MODIFY_FATE',targetIid:t.iid,amount:-2,sourceIid:source.iid,sourceController:0});
 for(let n=0;n<5;n++)reduce();assert.equal(s.fateReductionEffectUses[0],1,sourceId+' repeated reductions count once');
 applyOperation(ctx,{type:'TRANSFER_CARDS',targetIid:source.iid,playerIndex:0,destinationPile:'deckBottom'});
 reduce();assert.equal(s.fateReductionEffectUses[0],1,'hand/deck movement does not renew credit');
 applyOperation(ctx,{type:'DISCARD_CARD',targetIid:source.iid,sourceController:0,disableReplacement:true});
 // Transfer from discard is the renewal boundary, regardless of next destination.
 applyOperation(ctx,{type:'TRANSFER_CARDS',targetIid:source.iid,playerIndex:0,destinationPile:'deckBottom'});
 reduce();assert.equal(s.fateReductionEffectUses[0],2,'recycled card can contribute again');
}
console.log('PASS: Dylan actual-loss/once-per-copy/history, repeated Guerilla and Wound reductions, non-discard movement, and discard recycling.');

