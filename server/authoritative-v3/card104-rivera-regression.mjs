import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createInitialState,applyOperation,reduceCommand,effectiveFate} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';
const defs=[{id:'104',name:'Rivera (Revolutionary)',type:'Improvisor',aff:'eventide',fate:2,cost:2},{id:'05',name:'Soldier',type:'Supporter',aff:'eventide',fate:1,cost:0}];
let state=createInitialState({matchId:'rivera',seed:'rivera',handSize:9,players:[{id:'p0',deckIds:['104','05','05']},{id:'p1',deckIds:['05']}],cardDefinitions:defs});
let ctx={state,events:[],ruleEvents:[]};let rivera=state.players[0].hand.find(c=>c.id==='104');
applyOperation(ctx,{type:'SET_CARD',playerIndex:0,cardIid:rivera.iid,destination:{z:0,r:2,c:0},faceDown:true});
assert.equal(rivera.faceDown,true);
const victim=state.players[1].hand[0];applyOperation(ctx,{type:'SET_CARD',playerIndex:1,cardIid:victim.iid,destination:{z:0,r:0,c:0}});
let n=0;function run(player,type,payload){const r=reduceCommand(state,command(state,player,++n,type,payload),{playerId:player});assert.equal(r.ok,true,JSON.stringify(r));state=r.state;ctx={state,events:[],ruleEvents:[]};return r;}
run('p0','ACTIVATE_EFFECT',{sourceIid:rivera.iid,userActivated:true});
applyOperation(ctx,{type:'MODIFY_FATE',targetIid:victim.iid,amount:3});assert.equal(state.board[0][0][0].currentFate,4,'not active before next turn');
run('p0','END_TURN',{});
applyOperation(ctx,{type:'MODIFY_FATE',targetIid:victim.iid,amount:7});assert.equal(state.board[0][0][0].currentFate,11);assert.equal(state.board[0][2][0].currentFate,9);
applyOperation(ctx,{type:'MODIFY_FATE',targetIid:rivera.iid,amount:3});assert.equal(state.board[0][2][0].currentFate,12,'own gains unchanged');
const ally=state.players[0].hand[0];
applyOperation(ctx,{type:'SET_CARD',playerIndex:0,cardIid:ally.iid,destination:{z:1,r:2,c:0}});
const allyBefore=ally.currentFate;
applyOperation(ctx,{type:'MODIFY_FATE',targetIid:ally.iid,amount:4});
assert.equal(ally.currentFate,allyBefore+4,'allies keep their gains during the opponent turn');
assert.equal(state.board[0][2][0].currentFate,16);
assert.equal(state.board[0][2][0].counters.riveraFateTransferred,11,'tracker records only transferred Fate');
applyOperation(ctx,{type:'MODIFY_FATE',targetIid:victim.iid,amount:-2});assert.equal(state.board[0][0][0].currentFate,9,'losses unchanged');
assert.equal(state.board[0][2][0].currentFate,16,'Rivera does not copy losses');
run('p1','END_TURN',{});applyOperation(ctx,{type:'MODIFY_FATE',targetIid:victim.iid,amount:5});assert.equal(state.board[0][0][0].currentFate,14,'expired');
const flip=run('p0','FLIP_CARD',{cardIid:rivera.iid});assert.equal(state.board[0][2][0].faceDown,false);assert(flip.events.some(e=>e.type==='CARD_FLIPPED'));
const second=reduceCommand(state,command(state,'p0',++n,'ACTIVATE_EFFECT',{sourceIid:rivera.iid,userActivated:true}),{playerId:'p0'});
assert.equal(second.ok,false);assert.equal(second.rejection.code,'USE_LIMIT_REACHED');
console.log('PASS Rivera: hidden one-use activation, next-turn transfer, tracker total, own gains/losses, expiry and reveal.');

// A newly set Coordinator changes effective Fate without MODIFY_FATE.
for(const owner of [0,1]){
  const definitions=[...defs,{id:'22',name:'Isaac',type:'Initiator',fate:2,cost:1},
    {id:'11',name:'Louis',type:'Coordinator',fate:2,cost:1}];
  let s=createInitialState({matchId:'rivera-copy',seed:'rivera-copy',activePlayer:1-owner,handSize:9,
    players:[{id:'p0',deckIds:['104','05','22','11']},{id:'p1',deckIds:['104','05','22','11']}],cardDefinitions:definitions});
  const c={state:s,events:[],ruleEvents:[]};
  const row=p=>p===0?2:0;
  const place=(p,id,z,col)=>{
    const card=s.players[p].hand.find(x=>x.id===id);
    applyOperation(c,{type:'SET_CARD',playerIndex:p,cardIid:card.iid,destination:{z,r:row(p),c:col}});return card;
  };
  const r=place(owner,'104',2,0),target=place(1-owner,'05',0,0),isaac=place(1-owner,'22',0,1);
  s.statuses.push({type:'TIMED_PLAYER_STATUS',statusType:'RIVERA_FATE_TRANSFER',sourceIid:r.iid,
    sourceController:owner,playerIndex:1-owner,activeFromTurn:s.turn,remainingTargetTurns:1});
  function runCopy(type,payload){
    const result=reduceCommand(s,command(s,`p${1-owner}`,++n,type,payload),{playerId:`p${1-owner}`});
    assert(result.ok,JSON.stringify(result.rejection));s=result.state;c.state=s;return result;
  }
  runCopy('ACTIVATE_EFFECT',{sourceIid:isaac.iid});
  runCopy('ANSWER_PROMPT',{promptId:s.pendingPrompt.promptId,selectedIids:[target.iid,isaac.iid]});
  const find=iid=>s.board.flat(3).find(card=>card?.iid===iid);
  assert.equal(find(target.iid).currentFate,4,'Isaac target keeps +3');
  assert.equal(find(isaac.iid).currentFate,5,'Isaac keeps his own +3');
  assert.equal(find(r.iid).currentFate,8,'Rivera copies both Isaac gains');
  place(1-owner,'11',0,2);
  assert.equal(effectiveFate(s,find(target.iid)),7,'Louis aura still buffs the supporter');
  assert.equal(find(r.iid).currentFate,11,'Rivera copies the new +3 Coordinator aura');
  applyOperation(c,{type:'SET_CARD_COUNTER',targetIid:isaac.iid,counterKey:'unrelated',value:1});
  assert.equal(find(r.iid).currentFate,11,'unchanged continuous bonuses are not copied again');
  const louis=find(s.board[0][row(1-owner)][2].iid);
  applyOperation(c,{type:'DISCARD_CARD',targetIid:louis.iid});
  assert.equal(effectiveFate(s,find(target.iid)),4,'aura loss still applies normally');
  assert.equal(find(r.iid).currentFate,11,'aura loss never reduces Rivera');
}
console.log('PASS Rivera copy: actual Isaac activation, both recipients retain gains, new Coordinator aura, no repeated copy and no copied losses in both seats.');
const source=readFileSync(new URL('../../src/scripts/05-gameplay-core.js',import.meta.url),'utf8');
const localRivera={iid:'rivera',owner:0,currentFate:2},localTarget={iid:'target',owner:1,currentFate:1};
const local={G:{turn:2,currentPlayer:1,board:[[[localRivera,localTarget]]],_riveraFateTransfer:{sourceIid:'rivera',owner:0,turn:2}},
  getHighTPotencyCount:()=>0,clampCardToLandscapeFateCap:()=>{},playFateChangeSound:()=>{},setTimeout:()=>{}};
vm.createContext(local);
vm.runInContext(source.slice(source.indexOf('function copyLocalRiveraFateGain('),source.indexOf('function playResolvedFateChangeSfx(')),local);
vm.runInContext(source.slice(source.indexOf('const bh15DerivedFateSnapshots ='),source.indexOf('function setCardFateValue(')),local);
local.modifyFate(localTarget,3,'permanent');
assert.equal(localTarget.currentFate,4);assert.equal(localRivera.currentFate,5);
local.observeChineseMacArthurDerivedFate(localTarget,4);
local.observeChineseMacArthurDerivedFate(localTarget,7);
assert.equal(localRivera.currentFate,8,'local aura gain is copied');
local.observeChineseMacArthurDerivedFate(localTarget,7);
local.observeChineseMacArthurDerivedFate(localTarget,4);
assert.equal(localRivera.currentFate,8,'local repeated render and aura loss do not copy');
console.log('PASS local Rivera: original gain retained, aura copied once, losses ignored.');
