import assert from 'node:assert/strict';
import {createInitialState, reduceCommand, stableStringify} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const definitions = [
  {id:'bh02', name:'Joie', type:'Coordinator', aff:'reality', fate:1, cost:4},
  {id:'bh23', name:'Panacea Militia', type:'Supporter', aff:'eventide', fate:1, cost:0},
  {id:'32', name:'Temecula Resident', type:'Supporter', aff:'reality', fate:1, cost:0}
];

let state = createInitialState({
  matchId:'BH23-PANACEA', seed:'BH23-PANACEA', handSize:99,
  cardDefinitions:definitions,
  players:[{id:'p0',deckIds:['bh02','bh23','32']},{id:'p1',deckIds:['32']}]
});
const joieIndex = state.players[0].hand.findIndex(card=>card.id === 'bh02');
const joie = state.players[0].hand.splice(joieIndex, 1)[0];
joie.controller = 0;
joie.counters.triggeredFateHistoryTotal = 7;
state.board[0][2][0] = joie;
const militia = state.players[0].hand.find(card=>card.id === 'bh23');

let result = reduceCommand(state, command(state, 'p0', 1, 'SET_CARD', {
  cardIid:militia.iid, destination:{z:0,r:2,c:1}
}), {playerId:'p0'});
assert.equal(result.ok, true);
assert.equal(result.status, 'NEEDS_CHOICE');
assert.deepEqual(result.prompt.eligibleIids, [joie.iid]);

state = JSON.parse(stableStringify(result.state));
result = reduceCommand(state, command(state, 'p0', 2, 'ANSWER_PROMPT', {
  promptId:state.pendingPrompt.promptId, selectedIids:[joie.iid]
}), {playerId:'p0'});
assert.equal(result.ok, true);
const placed = result.state.board[0][2][1];
assert.equal(placed.currentFate, 8);
assert.equal(placed.counters.bh23InheritedFate, 7);
assert.equal(placed.counters.bh23InheritedCoordinatorIid, joie.iid);

console.log('BH23 Panacea Militia smoke test passed');
