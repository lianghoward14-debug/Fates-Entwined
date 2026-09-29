import assert from 'node:assert/strict';
import * as E from '../../shared/engine/index.mjs';
import catalog from '../fate-card-catalog.js';
import fs from 'node:fs';
import vm from 'node:vm';
const core=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8'),helpers=fs.readFileSync('src/scripts/00-structural-helpers.js','utf8'),rendering=fs.readFileSync('src/scripts/06-rendering-and-helpers.js','utf8');
let seq=0;const results=[];const noop=()=>{};
function fn(n,text=core){const i=text.indexOf('function '+n+'(');if(i<0)throw Error(n);return text.slice(i,text.indexOf('\n}',i)+2);}
function fixture(ids){return E.createInitialState({matchId:'bound'+(++seq),seed:'boundary',handSize:99,cardDefinitions:catalog.getCardCatalog().cards,players:[{id:'p0',deckIds:ids},{id:'p1',deckIds:[]}]});}
function put(s,id,z=0,c=0){const a=s.players[0].hand,i=a.findIndex(x=>x.id===id);const card=a.splice(i,1)[0];s.board[z][2][c]=card;return card;}
function command(s,type,payload){const r=E.reduceCommand(s,{type,payload,commandId:'b'+(++seq),matchId:s.matchId,expectedRevision:s.revision},{playerIndex:s.pendingPrompt?.playerIndex??s.activePlayer});if(!r.ok)throw Error(JSON.stringify(r.rejection));return r.state;}
function power(s){s.statuses.push({statusId:'abed',type:'PERMANENT_FATE_GAIN_POTENCY',playerIndex:0,remainingOwnerTurns:1});}
async function probe(name,run){try{results.push({name,...await run()});}catch(e){results.push({name,error:e.stack});}}
for(const id of ['07','90'])await probe(id+' public search bonus with Abed and Hsei',()=>{
 let s=fixture([id,'bh15','09']);put(s,'bh15',1);power(s);const target=s.players[0].hand.find(c=>c.id==='09'),before=target.currentFate;
 s.players[0].hand=s.players[0].hand.filter(c=>c!==target);s.players[0].deck=[target];const source=s.players[0].hand[0];source.cost=0;
 s=command(s,'CONSOLIDATE_CARD',{cardIid:source.iid,tributeIids:[],destination:{z:0,r:2,c:0}});
 s=command(s,'ANSWER_PROMPT',{promptId:s.pendingPrompt.promptId,...(id==='07'?{selectedIids:[target.iid]}:{choice:target.affiliation})});
 return {gain:E.findCard(s,target.iid).card.currentFate-before,expected:id==='07'?5:4};
});
for(const id of ['07','90','90-immune'])await probe(id+' legacy human search bonus with Abed and Hsei',async()=>{
 const effectId=id.split('-')[0];const target={id:id.endsWith('immune')?'76':'09',iid:'target',owner:0,type:'Supporter',aff:'reality',currentFate:1};
 const c={window:{},G:{turn:18,currentPlayer:0,players:[{hand:[],deck:[target]},{hand:[],deck:[]}],_bh19HighTStatuses:[{playerIndex:0,turn:18}]},card:{id:effectId,iid:'source'},cp:0,z:0,isCardEffectImmutable:card=>card.id==='76',
 toast:noop,updateTopBar:noop,renderEffectResolutionForPlayer:noop,renderHand:noop,deterministicOnlineRandomIndex:()=>0,AFF_LABEL:{reality:'Reality'},activeChineseMacArthurSources:()=>[{iid:'hsei'}],clampCardToLandscapeFateCap:noop,queueChineseMacArthurOverlay:noop};
 vm.createContext(c);vm.runInContext(['getCardStructuralType','getCardEffectType','cardHasEffectType','cardHasCurrentEffectType','isBlameGameActive'].map(n=>fn(n,helpers)).join('\n'),c);vm.runInContext(fn('getHighTPotencyCount')+'\n'+fn('applyChineseMacArthurFateRider'),c);
 c.pickCardsVisual=(_cards,_opts,callback)=>callback([target]);c.showAffiliationPickerVisual=callback=>callback('reality');
 const start=core.indexOf("    case '"+effectId+"':",core.indexOf("    case 'bh23':"));const end=core.indexOf("    case '",start+10);
 vm.runInContext('async function run(){switch(card.id){'+core.slice(start,end)+'}}',c);await c.run();
 return {gain:target.currentFate-1,expected:id==='07'?5:id.endsWith('immune')?0:4};
});
await probe('Henry suppression fails to trigger Maja University',()=>{
 let s=fixture(['21','bh08','15']);const maja=put(s,'bh08',0,1),enemy=put(s,'15',0,2);
 s.board[0][2][2]=null;s.board[0][1][0]=enemy;enemy.owner=1;enemy.controller=1;
 const henry=s.players[0].hand[0];henry.cost=0;const before=maja.currentFate;
 s=command(s,'CONSOLIDATE_CARD',{cardIid:henry.iid,tributeIids:[],destination:{z:0,r:2,c:0}});
 s=command(s,'ANSWER_PROMPT',{promptId:s.pendingPrompt.promptId,destinations:[{z:0,r:1,c:0}]});
 return {enemySuppressed:E.isEffectSourceSuppressed(s,E.findBoardCard(s,enemy.iid)),majaGain:E.findCard(s,maja.iid).card.currentFate-before,history:E.findCard(s,maja.iid).card.counters.triggeredFateHistoryTotal||0,expectedGain:2};
});
await probe('Opponent-immune Youth remains suppressed by Marines global status',()=>{
 const s=fixture(['93']);const youth=put(s,'93');youth.statuses.push('IMMUNE_TO_OPPONENT_EFFECTS');
 s.statuses.push({statusId:'marines',type:'TIMED_PLAYER_STATUS',statusType:'SUPPORTER_EFFECTS_BLOCKED',playerIndex:0,sourceController:1,sourceIid:'marines-source',activeFromTurn:1,remainingTargetTurns:1});
 const generated=E.legalCommandTemplates(s,0).some(c=>c.type==='ACTIVATE_EFFECT'&&c.payload.sourceIid===youth.iid);
 const result=E.reduceCommand(s,{commandId:'immune-youth',matchId:s.matchId,expectedRevision:s.revision,type:'ACTIVATE_EFFECT',payload:{sourceIid:youth.iid,userActivated:true}},{playerIndex:0});
 return {generated,suppressed:E.isEffectSourceSuppressed(s,E.findBoardCard(s,youth.iid)),accepted:result.ok,rejection:result.rejection};
});
await probe('Fisherman AI emits a draw trigger for its search',async()=>{
 const ai=fs.readFileSync('src/scripts/07-ai.js','utf8');const start=ai.indexOf("    case '90': { // Wojciech Fisherman");const end=ai.indexOf("    case '",start+10);let drawTriggers=0;
 const target={id:'09',iid:'target',owner:0,type:'Supporter',aff:'reality',currentFate:1};
 const c={G:{players:[{hand:[],deck:[target]},{hand:[],deck:[]}]},cp:0,inst:{id:'90',iid:'fisherman'},triggerJoieDrawEffectPassive:()=>drawTriggers++,deterministicOnlineRandomIndex:()=>0,log:noop,toast:noop,renderHand:noop,renderGame:noop};vm.createContext(c);
 vm.runInContext('async function run(){switch(inst.id){'+ai.slice(start,end)+'}}',c);await c.run();return {drawTriggers,expected:0};
});
await probe('Copied Chingachlook false legal consolidation from public copy command',()=>{
 let s=fixture(['bh05','45','05','67']);const t=s.players[0].hand.find(c=>c.id==='bh05');t.cost=0;
 s=command(s,'CONSOLIDATE_CARD',{cardIid:t.iid,tributeIids:[],destination:{z:0,r:2,c:0}});
 const ch=s.players[0].hand.find(c=>c.id==='45');s=command(s,'ANSWER_PROMPT',{promptId:s.pendingPrompt.promptId,selectedIids:[ch.iid]});
 const tribute=put(s,'05',0,1),target=s.players[0].hand.find(c=>c.id==='67');
 const payload={cardIid:target.iid,tributeIids:[tribute.iid],destination:{z:0,r:2,c:1}};
 const offered=E.legalCommandTemplates(s,0).some(c=>c.type==='CONSOLIDATE_CARD'&&JSON.stringify(c.payload)===JSON.stringify(payload));
 const r=E.reduceCommand(s,{type:'CONSOLIDATE_CARD',payload,commandId:'ching-public',matchId:s.matchId,expectedRevision:s.revision},{playerIndex:0});
 return {copied:E.findCard(s,t.iid).card.counters.copiedPassiveId,offered,accepted:r.ok,rejection:r.rejection};
});

for(const r of results){assert(!r.error,r.error);if(r.gain!==undefined)assert.equal(r.gain,r.expected,r.name);}
assert.equal(results.find(r=>r.name.startsWith('90-immune')).gain,0);
assert.equal(results.find(r=>r.name.startsWith('Fisherman AI')).drawTriggers,0);
const henry=results.find(r=>r.name.startsWith('Henry suppression'));assert.equal(henry.majaGain,2);assert.equal(henry.history,2);
assert.equal(results.find(r=>r.name.startsWith('Copied Chingachlook')).offered,false);
// Legacy automatic transfer is synchronous and never opens a modal or schedules a choice.
for(const suppressed of [false,true]){
 const card={id:'70',iid:'g',owner:0};const state={players:[{discard:[],hand:[]},{discard:[],hand:[]}]};
 const c={G:state,window:{},isSupporterEffectSuppressed:()=>suppressed,playDiscardSfx:noop};vm.createContext(c);vm.runInContext(fn('fatePushDiscard',helpers),c);
 c.fatePushDiscard(0,card);assert.equal(state.players[1].hand.includes(card),!suppressed);assert.equal(state.players[0].discard.includes(card),suppressed);assert.equal(state._guerillaChoices,undefined);
 if(!suppressed){assert.equal(card.guerilla_turnsLeft,5);state.players[1].hand=[];c.fatePushDiscard(0,card);assert(state.players[0].discard.includes(card));}
}
// Legacy Henry transition reconciliation counts entry once, then a renewed suppression once.
{
 const target={iid:'target',owner:1};let suppressed=true,count=0;
 const c={G:{board:[[[target]]]},isCardSuppressedByHenryDong:()=>suppressed,isDirectCardEffectSuppressed:()=>false,triggerMajaMischievousActivities:()=>count++};vm.createContext(c);vm.runInContext(fn('reconcileHenrySuppressionTriggers'),c);
 c.reconcileHenrySuppressionTriggers();c.reconcileHenrySuppressionTriggers();assert.equal(count,1);suppressed=false;c.reconcileHenrySuppressionTriggers();suppressed=true;c.reconcileHenrySuppressionTriggers();assert.equal(count,2);
}
{
 const s=fixture(['21','bh08','15']);const henry=put(s,'21'),maja=put(s,'bh08',0,1),target=put(s,'15',0,2);
 target.owner=1;target.controller=1;s.board[0][2][2]=null;s.board[0][1][0]=target;
 const ctx={state:s,events:[],ruleEvents:[]};
 const square={type:'CREATE_SQUARE_STATUS',destination:{z:0,r:1,c:0},statusType:'COORDINATOR_SUPPRESSED',blockedPlayer:1,sourceIid:henry.iid,sourceController:0};
 E.applyOperation(ctx,square);assert.equal(maja.counters.triggeredFateHistoryTotal,2);
 E.applyOperation(ctx,square);assert.equal(maja.counters.triggeredFateHistoryTotal,2);
 E.applyOperation(ctx,{type:'CREATE_STATUS',targetIid:henry.iid,status:'EFFECTS_SUPPRESSED',sourceIid:henry.iid,sourceController:0});
 E.applyOperation(ctx,{type:'REMOVE_STATUS',targetIid:henry.iid,status:'EFFECTS_SUPPRESSED',sourceIid:henry.iid,sourceController:0});
 assert.equal(maja.counters.triggeredFateHistoryTotal,4);
 assert.equal(ctx.events.filter(e=>e.reactionKind==='HENRY_SUPPRESSION').length,2);
}
console.log('PASS boundary fixes: Fisherman immunity/search, Henry triggers, copied Chingachlook, automatic Guerilla and suppression.');
