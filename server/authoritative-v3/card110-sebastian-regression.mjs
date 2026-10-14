import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,applyOperation,legalCommandTemplates,reduceCommand,assertInvariants} from '../../shared/engine/index.mjs';
import {collectTriggeredOperations} from '../../shared/engine/triggers.mjs';
import {command,takeFromHandToBoard} from './test-helpers.mjs';
const {cards,byId}=createRequire(import.meta.url)('../fate-card-catalog.js').getCardCatalog();
assert.equal(byId.get('110').type,'Improvisor');
assert.equal(byId.get('110').fate,2);assert.equal(byId.get('110').cost,2);
assert(!byId.has('token-fish'));
for(const seat of [0,1]){
 let state=createInitialState({matchId:'fish'+seat,seed:'fish',handSize:99,activePlayer:seat,cardDefinitions:cards,
   players:[0,1].map(p=>({id:'p'+p,deckIds:['110','110','67','32']}))});
 const r=seat===0?2:0;
 const source=takeFromHandToBoard(state,seat,'110',{z:0,r,c:0});
 const arrived=takeFromHandToBoard(state,seat,'32',{z:0,r,c:1});
 const event={type:'CARD_CONSOLIDATED',playerIndex:seat,cardIid:arrived.iid,destination:{z:0,r,c:1}};
 const fishOps=()=>collectTriggeredOperations(state,event).filter(op=>op.tokenKind==='FISH');
 assert.equal(fishOps().length,1);
 assert.equal(collectTriggeredOperations(state,{...event,playerIndex:1-seat}).filter(op=>op.tokenKind==='FISH').length,0);
 assert.equal(collectTriggeredOperations(state,{...event,cardIid:source.iid}).filter(op=>op.tokenKind==='FISH').length,0);
 source.faceDown=true;assert.equal(fishOps().length,0);source.faceDown=false;
 source.statuses.push('EFFECTS_SUPPRESSED');assert.equal(fishOps().length,0);source.statuses=[];
 takeFromHandToBoard(state,seat,'110',{z:1,r,c:0});assert.equal(fishOps().length,2);
 const ctx={state,events:[],ruleEvents:[]};for(const op of fishOps())applyOperation(ctx,op);
 const fish=state.players[seat].hand.filter(c=>c.counters.fishCounter);
 assert.equal(fish.length,2);assert(fish.every(c=>c.currentFate===0&&c.cost===0&&c.type==='Counter'));
 state.supportersSetThisTurn[seat]=5;state.supportersSetForCapThisTurn[seat]=5;
 let n=0;
 for(const f of fish){
   const move=legalCommandTemplates(state,seat).find(c=>c.type==='SET_CARD'&&c.payload.cardIid===f.iid&&c.payload.destination.z===2&&c.payload.destination.r===r);
   assert(move,'Fish remains free after Supporter cap');
   assert(!legalCommandTemplates(state,seat).some(c=>c.type==='CONSOLIDATE_CARD'&&c.payload.cardIid===f.iid));
   const result=reduceCommand(state,command(state,'p'+seat,++n,move.type,move.payload),{playerId:'p'+seat});
   assert.equal(result.ok,true,JSON.stringify(result.rejection));state=result.state;
 }
 assert.equal(state.supportersSetThisTurn[seat],5);
 const target=state.players[seat].hand.find(c=>c.id==='67');
 const moves=legalCommandTemplates(state,seat).filter(c=>c.type==='CONSOLIDATE_CARD'&&c.payload.cardIid===target.iid);
 assert(!moves.some(c=>c.payload.tributeIids.length===1&&fish.some(f=>f.iid===c.payload.tributeIids[0])));
 const paid=moves.find(c=>c.payload.tributeIids.length===2&&c.payload.tributeIids.every(i=>fish.some(f=>f.iid===i)));
 assert(paid,'Two half-Reinforcements pay one cost');
 const result=reduceCommand(state,command(state,'p'+seat,++n,paid.type,paid.payload),{playerId:'p'+seat});
 assert.equal(result.ok,true,JSON.stringify(result.rejection));state=result.state;
 assert.equal(state.players[seat].hand.filter(c=>c.counters.fishCounter).length,2,'Each Sebastian triggers on the committed consolidation');
 assertInvariants(state);
}
console.log('Sebastian: both seats, suppression, hidden sources, stacked triggers, free Fish sets, half-Reinforcement payment and consolidation integration passed.');
