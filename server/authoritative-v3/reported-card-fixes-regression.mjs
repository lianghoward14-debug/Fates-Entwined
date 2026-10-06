import assert from 'node:assert/strict';
import {createInitialState,reduceCommand} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';
import {calculateMoraleOutcome} from '../../shared/engine/morale-pressure.mjs';
const definitions=[
  {id:'bh13',name:'Hugh Roberts',type:'Initiator',fate:1,cost:1},
  {id:'bh05',name:'Taylor',type:'Initiator',fate:1,cost:0},
  {id:'bh23',name:'Panacea Militia',type:'Supporter',fate:1,cost:0},
  {id:'32',name:'Temecula Resident',type:'Supporter',fate:1,cost:0}
];
const fresh=()=>createInitialState({matchId:'reported',seed:'reported',handSize:99,cardDefinitions:definitions,
  players:[{id:'p0',deckIds:['bh13','bh05','bh23','32','32','32','32']},{id:'p1',deckIds:['32']}]});
function send(state,type,payload){
  const result=reduceCommand(state,command(state,'p0',state.revision+1,type,payload),{playerId:'p0'});
  assert.equal(result.ok,true,JSON.stringify(result.rejection));return result.state;
}
for(const count of [0,1,3]){
  let state=fresh();
  const tribute=state.players[0].hand.splice(state.players[0].hand.findIndex(c=>c.id==='32'),1)[0];
  state.board[0][2][0]=tribute;
  state=send(state,'CONSOLIDATE_CARD',{cardIid:state.players[0].hand.find(c=>c.id==='bh13').iid,tributeIids:[tribute.iid],destination:{z:0,r:2,c:0}});
  const selected=state.players[0].hand.filter(c=>c.id==='32').slice(0,count).map(c=>c.iid);
  assert(state.pendingPrompt);
  state=send(state,'ANSWER_PROMPT',{promptId:state.pendingPrompt.promptId,selectedIids:selected});
  for(const iid of selected){assert.equal(state.players[0].deck.find(c=>c.iid===iid)?.currentFate,8);assert(!state.players[0].hand.some(c=>c.iid===iid));}
}
for(const copiedId of ['15','bh02','bh08']){
  let state=fresh();
  const index=state.players[0].hand.findIndex(c=>c.id==='bh05');
  const taylor=state.players[0].hand.splice(index,1)[0];
  taylor.counters.copiedPassiveId=copiedId;taylor.counters.triggeredFateHistoryTotal=7;
  state.board[0][2][0]=taylor;
  state=send(state,'SET_CARD',{cardIid:state.players[0].hand.find(c=>c.id==='bh23').iid,destination:{z:0,r:2,c:1}});
  assert(state.pendingPrompt.eligibleIids.includes(taylor.iid));
  state=send(state,'ANSWER_PROMPT',{promptId:state.pendingPrompt.promptId,selectedIids:[taylor.iid]});
  assert.equal(state.board[0][2][1].currentFate,8);
}
const state=fresh();state.moralePressure={morale:[0,100]};
const outcome=calculateMoraleOutcome(state);
assert.equal(outcome.winner,1);assert.equal(outcome.zoneResults.length,3);
console.log('Authoritative Hugh, copied Panacea and morale result regressions passed');
