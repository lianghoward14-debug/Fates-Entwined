import assert from 'node:assert/strict';
import {createInitialState,reduceCommand,projectEvents,projectStateForPlayer} from '../../shared/engine/index.mjs';
import {applyOperation} from '../../shared/engine/operations.mjs';
import {command} from './test-helpers.mjs';
for(const faceDown of [false,true]) for(const consolidate of [false,true]){
let state=createInitialState({matchId:'anne-flow',seed:'anne-flow',handSize:10,activePlayer:0,players:[{id:'p0',deckIds:['102']},{id:'p1',deckIds:['65','65','103']}],cardDefinitions:[{id:'102',name:'Anne',type:'Improvisor',aff:'eventide',fate:4,cost:1},{id:'65',name:'Marines',type:'Supporter',aff:'eventide',fate:1,cost:0},{id:'103',name:'General',type:'Initiator',aff:'third_great_war',fate:4,cost:1}]});
const anne=state.players[0].hand.pop();anne.faceDown=faceDown;state.board[0][2][0]=anne;
const existingIndex=state.players[1].hand.findIndex(c=>c.id==='65');
const existing=state.players[1].hand.splice(existingIndex,1)[0];state.board[0][1][1]=existing;
let n=0;function run(player,type,payload){const result=reduceCommand(state,command(state,player,++n,type,payload),{playerId:player});assert.equal(result.ok,true,JSON.stringify(result));state=result.state;return result;}
run('p0','ACTIVATE_EFFECT',{sourceIid:anne.iid,userActivated:true});
const result=run('p0','ANSWER_PROMPT',{promptId:state.pendingPrompt.promptId,destinations:[{z:0,r:1,c:1},{z:1,r:1,c:1},{z:2,r:1,c:1}]});
assert.equal(state.geometry.squareStatuses.length,3);
assert.equal(state.board[0][1][1]?.iid,existing.iid,'arming an occupied square leaves its supporter in place');
assert(!result.events.some(e=>e.type==='HIDDEN_BOMB_EXPLODED')); 
assert.equal(projectStateForPlayer(state,1).geometry.squareStatuses.length,0);
run('p0','END_TURN',{});
assert.equal(state.board[0][1][1]?.iid,existing.iid,'starting opponent turn does not detonate an occupied mine');
const victim=existing;
let placed;
if(consolidate){
 placed=state.players[1].hand.find(c=>c.id==='103');
}else{
 applyOperation({state,events:[],ruleEvents:[]},{type:'DISCARD_CARD',targetIid:existing.iid,sourceController:1});
 assert.equal(state.geometry.squareStatuses.length,3,'removing the old supporter does not consume the mine');
 placed=state.players[1].hand.find(c=>c.id==='65');
}
const blast=consolidate
? run('p1','CONSOLIDATE_CARD',{cardIid:placed.iid,tributeIids:[victim.iid],destination:{z:0,r:1,c:1}})
: run('p1','SET_CARD',{cardIid:placed.iid,destination:{z:0,r:1,c:1}});
assert.equal(state.board[0][1][1],null);
assert(state.players[1].discard.some(c=>c.iid===placed.iid));
for(const p of [0,1]) { const events=projectEvents(blast.events,p); assert(events.some(e=>e.type==='HIDDEN_BOMB_EXPLODED'),'both players see explosion'); assert(events.some(e=>e.type==='CARD_DISCARDED'&&e.cardIid===placed.iid&&e.reason==='THE_BLACK_ROSE_BOMB'),'both players receive the mine discard'); }
assert(!blast.events.some(e=>e.type==='EFFECT_ACTIVATED'&&e.sourceIid===placed.iid));
}
console.log('Anne face-up/face-down activation, turn transition, placement/consolidation discard, effect suppression and public explosion passed');


