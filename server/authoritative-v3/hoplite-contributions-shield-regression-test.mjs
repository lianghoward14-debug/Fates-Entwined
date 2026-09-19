import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createInitialState,reduceCommand,applyOperation,effectiveFate} from '../../shared/engine/index.mjs';
import {zoneScore} from '../../shared/engine/scoring.mjs';
import {command} from './test-helpers.mjs';
const definitions=[
  {id:'01',name:'Felicyta',type:'Coordinator',aff:'eventide',fate:5,cost:1},
  {id:'20',name:'South Wind Spearman',type:'Supporter',aff:'eventide',fate:1,cost:0},
  {id:'65',name:'West Caribbea Marines',type:'Supporter',aff:'eventide',fate:1,cost:0},
  {id:'09',name:'Supporter',type:'Supporter',aff:'eventide',fate:1,cost:0}
];
function fixture(){return createInitialState({matchId:'contributions',seed:'contributions',handSize:99,
  gameSettings:{healthPressureSeals:true,pressureCardReworks:true},cardDefinitions:definitions,
  players:[{id:'p0',deckIds:['01','20','09','09']},{id:'p1',deckIds:['65','09']}]});}
function put(state,player,id,z,r,c){const i=state.players[player].hand.findIndex(card=>card.id===id);assert(i>=0);const card=state.players[player].hand.splice(i,1)[0];state.board[z][r][c]=card;return card;}
for(const faceDown of [false,true])for(const contributesFate of [false,true])for(const contributesAuras of [false,true]){
  let state=fixture();const tribute=put(state,0,'09',0,2,0);const target=put(state,0,'09',0,2,1);
  state.statuses.push({statusId:'hoplite',type:'FACE_DOWN_CONSOLIDATION_PERMISSION',playerIndex:0,zone:0,remaining:1});
  const card=state.players[0].hand.find(card=>card.id==='01');
  const result=reduceCommand(state,command(state,'p0',1,'CONSOLIDATE_CARD',{cardIid:card.iid,tributeIids:[tribute.iid],destination:{z:0,r:2,c:0},faceDown,contributesFate,contributesAuras}),{playerId:'p0'});
  assert.equal(result.ok,true,JSON.stringify(result.rejection));state=result.state;
  const placed=state.board[0][2][0];assert.equal(placed.contributesFate,contributesFate);assert.equal(placed.contributesAuras,contributesAuras);
  assert.equal(effectiveFate(state,placed),contributesFate?5:0);
  assert.equal(effectiveFate(state,target),contributesAuras?5:1);
  assert.equal(zoneScore(state,0,0),(contributesFate?5:0)+(contributesAuras?5:1));
  if(faceDown){const flip=reduceCommand(state,command(state,'p0',2,'FLIP_CARD',{cardIid:placed.iid}),{playerId:'p0'});assert.equal(flip.ok,true);assert.equal(zoneScore(flip.state,0,0),zoneScore(state,0,0));}
}
// Activate Shield Wall, advance into the Marines' actual turn-start trigger, then expire it.
let state=fixture();const shield=put(state,0,'20',0,2,0);const marines=put(state,1,'65',0,0,0);
let seq=0;
function send(type,payload={}){const playerId='p'+state.activePlayer;const result=reduceCommand(state,command(state,playerId,++seq,type,payload),{playerId});assert.equal(result.ok,true,JSON.stringify(result.rejection));state=result.state;return result;}
send('ACTIVATE_EFFECT',{sourceIid:shield.iid,userActivated:true});
send('END_TURN');assert.equal(state.moralePressure.morale[0],200,'Marines turn-start damage is blocked');
let ctx={state,events:[],ruleEvents:[]};
for(const source of [{sourceIid:marines.iid},{sourceController:1},{}]){
 applyOperation(ctx,{type:'MODIFY_MORALE',playerIndex:0,amount:-10,...source});
 assert.equal(state.moralePressure.morale[0],200,'all incoming damage respects Shield Wall, even without source attribution');
}
applyOperation(ctx,{type:'MODIFY_MORALE',playerIndex:0,amount:-15,sourceIid:shield.iid,reason:'TEST_COST'});
assert.equal(state.moralePressure.morale[0],185,'Morale payments are still paid');
applyOperation(ctx,{type:'MODIFY_MORALE',playerIndex:0,amount:5});assert.equal(state.moralePressure.morale[0],190);
send('END_TURN');send('END_TURN');assert(state.moralePressure.morale[0]<190,'Marines damage resumes after expiry');
// No-client-trust: reject an invalid flag and choices without the Hoplite permission.
state=fixture();let tribute=put(state,0,'09',0,2,0);let card=state.players[0].hand.find(c=>c.id==='01');
for(const contributesFate of ['yes',true]){
 const result=reduceCommand(state,command(state,'p0',1,'CONSOLIDATE_CARD',{cardIid:card.iid,tributeIids:[tribute.iid],destination:{z:0,r:2,c:0},contributesFate}),{playerId:'p0'});assert.equal(result.ok,false);
}
// Exercise the real shared modal: no placement callback runs until all three choices finish.
const ui=fs.readFileSync(new URL('../../src/scripts/06-rendering-and-helpers.js',import.meta.url),'utf8');
const source=ui.slice(ui.indexOf('function showFaceDownEffectChoice('));
for(const faceDown of [false,true])for(const fate of [false,true])for(const auras of [false,true]){
 let callbacks={},shown=[],result=null;
 const sandbox={window:{},closeModal:()=>{},document:{querySelector:selector=>({addEventListener:(_event,fn)=>{callbacks[selector.includes('"flip"')?'flip':'activate']=fn;}})},
 showModal:(title,html,actions,options)=>{shown.push(title);assert(html.includes('tactical-choice'));callbacks={};options.onOpen();}};
 vm.createContext(sandbox);vm.runInContext(source,sandbox);
 sandbox.window.showFaceDownPlacementChoice({id:'01',name:'Felicyta',type:'Coordinator'},choices=>{result={faceDown:false,...choices};},choices=>{result={faceDown:true,...choices};});
 callbacks[faceDown?'activate':'flip']();assert.equal(result,null);
 callbacks[fate?'flip':'activate']();assert.equal(result,null);
 callbacks[auras?'flip':'activate']();assert.deepEqual(JSON.parse(JSON.stringify(result)),{faceDown,contributesFate:fate,contributesAuras:auras});
 assert.deepEqual(shown,['Choose your entrance','Contribute Fate?','Contribute Zone Auras?']);
}
// Local game helper has the same timing and blocks the Marines direct-damage branch.
const core=fs.readFileSync(new URL('../../src/scripts/05-gameplay-core.js',import.meta.url),'utf8');
function extract(name){const start=core.indexOf('function '+name+'(');return core.slice(start,core.indexOf('\n}',start)+2);}
const local={G:{turn:2,_southWindMoraleBlock:{targetPlayer:1,activeFromTurn:2,remainingTargetTurns:1}}};vm.createContext(local);vm.runInContext(extract('isLegacyMoraleDamageBlocked'),local);
assert.equal(local.isLegacyMoraleDamageBlocked(1),true);assert.equal(local.isLegacyMoraleDamageBlocked(0),false);local.G.turn=1;assert.equal(local.isLegacyMoraleDamageBlocked(1),false);
assert(core.includes('G._moralePressure&&!isLegacyMoraleDamageBlocked(currentPlayer)'));
// The local scorer must match the authoritative choices, including self auras.
for(const faceDown of [false,true])for(const contributesFate of [false,true])for(const contributesAuras of [false,true]){
 const source={id:'19',iid:'local-aura',owner:0,type:'Coordinator',fate:5,currentFate:5,faceDown,contributesFate,contributesAuras};
 const target={id:'01',iid:'local-target',owner:0,type:'Coordinator',fate:2,currentFate:2,contributesAuras:false};
 const context={G:{board:[[[source,target]]]},window:{},cardActsAsPassive:(card,id)=>card.id===id,
 isSupporterEffectSuppressed:()=>false,isCoordinatorSuppressedAt:()=>false,getSuperiorMarksMultiplier:()=>1,
 capEffectiveFateForLandscape:x=>x,capEffectiveFateForPermanentDebuff:(_card,x)=>x,getAdjacentCards:()=>[],
 forEachBoardCard:fn=>{fn(source,0,0,0);fn(target,0,0,1);}};
 vm.createContext(context);vm.runInContext(extract('getEffectiveFate'),context);
 assert.equal(context.getEffectiveFate(source,0),contributesFate?(contributesAuras?8:5):0);
 assert.equal(context.getEffectiveFate(target,0),contributesAuras?5:2);
}
console.log('Shield Wall damage protection and all eight Hoplite face/Fate/aura choices passed.');
