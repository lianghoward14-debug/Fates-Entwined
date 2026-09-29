import assert from 'node:assert/strict';
import * as E from '../../shared/engine/index.mjs';
import {eligibleBoardTargets} from '../../shared/engine/prompts.mjs';
import catalog from '../fate-card-catalog.js';
import fs from 'node:fs';
import vm from 'node:vm';
let seq=0; const results=[];
function fixture(ids,opp=[]){return E.createInitialState({matchId:'expanded'+(++seq),seed:'expanded',handSize:99,cardDefinitions:catalog.getCardCatalog().cards,players:[{id:'p0',deckIds:ids},{id:'p1',deckIds:opp}]});}
function place(s,id,c=0,p=0,z=0){const i=s.players[p].hand.findIndex(x=>x.id===id);const card=s.players[p].hand.splice(i,1)[0];s.board[z][p?0:2][c]=card;return card;}
function abed(s,n=1){for(let i=0;i<n;i++)s.statuses.push({statusId:'abed'+i,type:'PERMANENT_FATE_GAIN_POTENCY',playerIndex:0,remainingOwnerTurns:1});}
function op(s,o){const ctx={state:s,events:[],ruleEvents:[]};E.applyOperation(ctx,o);return ctx;}
function probe(name,run){try{results.push({name,...run()});}catch(e){results.push({name,error:e.stack});}}
probe('Two Abed statuses: actual Joie gain versus recorded history',()=>{const s=fixture(['bh02']);const j=place(s,'bh02');abed(s,2);const before=j.currentFate;E.emitRuleEvent({state:s,events:[],ruleEvents:[]},{type:'DRAW_EFFECT_ACTIVATED',playerIndex:0});return {gain:j.currentFate-before,history:j.counters.triggeredFateHistoryTotal};});
probe('Hsei aura rider under Abed',()=>{const s=fixture(['bh15','05','11']);place(s,'bh15',0,0,1);const target=place(s,'05');abed(s);const aura=s.players[0].hand[0];const before=target.currentFate;op(s,{type:'SET_CARD',playerIndex:0,cardIid:aura.iid,destination:{z:0,r:2,c:1}});return {permanentRider:target.currentFate-before,expectedPermanentRider:1,effectiveFate:E.effectiveFate(s,target)};});
probe('Panacea target eligibility under face-down and Chloe types',()=>{const s=fixture(['15','bh05','bh23']);const z=place(s,'15');const t=place(s,'bh05',1);const p=place(s,'bh23',2);t.counters.copiedPassiveId='15';t.statuses.push('TYPE:Coordinator');z.statuses.push('TYPE:Supporter');const frame={sourceIid:p.iid,controller:0,cardId:'bh23'};const filter=E.cardRule('bh23',s).program[0].filter;const first=eligibleBoardTargets(s,frame,filter).map(x=>x.card?.id??x.id??x.iid??x);z.statuses=[];z.faceDown=true;return {reclassifiedTargets:first,faceDownTargets:eligibleBoardTargets(s,frame,filter),copiedCoordinatorIid:t.iid,originalCoordinatorIid:z.iid};});
probe('Maja under Abed multiplayer',()=>{const s=fixture(['bh08'],['05']);const m=place(s,'bh08');const enemy=place(s,'05',0,1);abed(s);const before=m.currentFate;E.emitRuleEvent({state:s,events:[],ruleEvents:[]},{type:'EFFECT_REACTED',mode:'SUPPRESS',playerIndex:0,sourceIid:enemy.iid});return {gain:m.currentFate-before,history:m.counters.triggeredFateHistoryTotal};});
probe('Maja under Abed singleplayer actual gain and recorded history',()=>{const core=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');function fn(n){const start=core.indexOf('function '+n+'(');if(start<0)throw Error(n);return core.slice(start,core.indexOf('\n}',start)+2);}const m={id:'bh08',iid:'maja',owner:0,currentFate:4};const noop=()=>{};const c={window:{},G:{turn:8,currentPlayer:0,board:[[[m]]],_bh19HighTStatuses:[{playerIndex:0,turn:8}]},cardActsAsPassive:(x,id)=>x.id===id,clampCardToLandscapeFateCap:noop,playFateChangeSound:noop,queueHighTPotencyOverlay:noop,queuePairedOverlayFateGain:()=>false,toast:noop,renderEffectResolutionForPlayer:noop};vm.createContext(c);for(const n of ['getCardRuntimeEffectId','getHighTPotencyCount','adjustedTriggeredFateHistoryGain','modifyFate','applyPairedOverlayFateGain','triggerMajaMischievousActivities'])vm.runInContext(fn(n),c);c.triggerMajaMischievousActivities(0,{sourceCard:{owner:1}});return {gain:m.currentFate-4,history:m._triggeredFateHistoryTotal};});
probe('Copied Alondra placement legal-command parity',()=>{const s=fixture(['05'],['bh05']);const copied=place(s,'bh05',0,1);copied.counters.copiedPassiveId='14';const supporter=s.players[0].hand[0];const destination={z:0,r:1,c:0};const offered=E.legalCommandTemplates(s,0).some(c=>c.type==='SET_CARD'&&c.payload.cardIid===supporter.iid&&JSON.stringify(c.payload.destination)===JSON.stringify(destination));const result=E.reduceCommand(s,{commandId:'copied-alondra',matchId:s.matchId,expectedRevision:s.revision,type:'SET_CARD',payload:{cardIid:supporter.iid,destination}},{playerIndex:0});return {offered,accepted:result.ok,rejection:result.rejection};});

for(const r of results) assert(!r.error,r.error);
const [abedResult,aura,targets,multi,legacy,alondra]=results;
assert.equal(abedResult.gain,2);assert.equal(abedResult.history,2);
assert.equal(aura.permanentRider,1);
assert.deepEqual(targets.reclassifiedTargets,[targets.copiedCoordinatorIid]);
assert.deepEqual(targets.faceDownTargets,[targets.originalCoordinatorIid,targets.copiedCoordinatorIid]);
for(const r of [multi,legacy]){assert.equal(r.gain,2);assert.equal(r.history,2);}
assert.equal(alondra.offered,false);assert.equal(alondra.accepted,false);
// Resolve Panacea through public commands, including the inheritance interpreter.
for(const copied of [false,true]){
 let s=fixture([copied?'bh05':'15','bh23']);const source=place(s,copied?'bh05':'15');
 source.faceDown=true;source.counters.triggeredFateHistoryTotal=4;
 if(copied){source.counters.copiedPassiveId='15';source.statuses.push('TYPE:Coordinator');}
 const militia=s.players[0].hand[0];
 function command(type,payload){const r=E.reduceCommand(s,{type,payload,commandId:'panacea'+(++seq),matchId:s.matchId,expectedRevision:s.revision},{playerIndex:0});assert(r.ok,JSON.stringify(r.rejection));s=r.state;}
 command('SET_CARD',{cardIid:militia.iid,destination:{z:0,r:2,c:1}});
 command('ANSWER_PROMPT',{promptId:s.pendingPrompt.promptId,selectedIids:[source.iid]});
 assert.equal(E.findBoardCard(s,militia.iid).card.counters.bh23InheritedFate,4);
 assert.equal(E.findBoardCard(s,militia.iid).card.currentFate,5);
}
// Suppression must remove the copied placement lock in both legality and execution.
{
 const s=fixture(['05'],['bh05']);const source=place(s,'bh05',0,1);
 source.counters.copiedPassiveId='14';source.statuses.push('EFFECTS_SUPPRESSED');
 const card=s.players[0].hand[0],destination={z:0,r:1,c:0};
 assert(E.legalCommandTemplates(s,0).some(c=>c.type==='SET_CARD'&&c.payload.cardIid===card.iid&&JSON.stringify(c.payload.destination)===JSON.stringify(destination)));
 const r=E.reduceCommand(s,{type:'SET_CARD',payload:{cardIid:card.iid,destination},commandId:'suppressed-lock',matchId:s.matchId,expectedRevision:s.revision},{playerIndex:0});assert(r.ok,JSON.stringify(r.rejection));
}
// Legacy human/AI share this eligibility helper; copy identity alone is insufficient.
{
 const core=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');
 function fn(n){const start=core.indexOf('function '+n+'(');return core.slice(start,core.indexOf('\n}',start)+2);}
 const c={cardHasEffectType:(card,type)=>(card._bh14DeclaredType||card.type)===type};vm.createContext(c);
 vm.runInContext(fn('getCardRuntimeEffectId')+'\n'+fn('isTriggeredFateCoordinator'),c);
 assert(!c.isTriggeredFateCoordinator({id:'bh05',type:'Initiator',_bh05CopiedPassiveId:'15'}));
 assert(c.isTriggeredFateCoordinator({id:'bh05',type:'Initiator',_bh14DeclaredType:'Coordinator',_bh05CopiedPassiveId:'15',faceDown:true}));
 assert(!c.isTriggeredFateCoordinator({id:'15',type:'Coordinator',_bh14DeclaredType:'Supporter'}));
}
console.log('PASS expanded card audit: Maja/Abed and history parity, Hsei aura rider, Panacea eligibility/inheritance, copied Alondra and suppression.');
