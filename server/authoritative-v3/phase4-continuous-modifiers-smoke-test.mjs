import assert from 'node:assert/strict';
import {
  applyOperation,
  assertInvariants,
  createInitialState,
  effectiveFate,
  stableStringify,
  zoneScore
} from '../../shared/engine/index.mjs';

const DEFINITIONS = [
  {id:'10', name:'Post-Modernist Dylan', type:'Coordinator', aff:'expanded_worlds', fate:5, cost:2},
  {id:'11', name:'Anne Stone', type:'Coordinator', aff:'eventide', fate:6, cost:2},
  {id:'23', name:'Cathy', type:'Coordinator', aff:'reality', fate:3, cost:2},
  {id:'32', name:'Temecula Resident', type:'Supporter', aff:'reality', fate:1, cost:0},
  {id:'57', name:'Jeremiah Jones', type:'Coordinator', aff:'expanded_worlds', fate:3, cost:3},
  {id:'59', name:'Maroon Knights', type:'Supporter', aff:'third_great_war', fate:1, cost:0},
  {id:'76', name:'ALPINE Infantry', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0},
  {id:'continuous-character', name:'Continuous Character', type:'Initiator', aff:'reality', fate:4, cost:1}
];

function takeCard(state, playerIndex, cardId){
  for(const pile of ['hand', 'deck', 'discard']){
    const index = state.players[playerIndex][pile].findIndex(card=>card.id === cardId);
    if(index < 0) continue;
    return state.players[playerIndex][pile].splice(index, 1)[0];
  }
  throw new Error(`missing fixture card ${cardId}`);
}

function putOnBoard(state, playerIndex, cardId, destination){
  const card = takeCard(state, playerIndex, cardId);
  card.controller = playerIndex;
  state.board[destination.z][destination.r][destination.c] = card;
  return card;
}

let state = createInitialState({
  matchId:'P4CONTINUOUS',
  seed:'p4-continuous-seed',
  handSize:99,
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['11', '11', '23', '32', '32', '57', '57', '59', 'continuous-character']},
    {id:'p1', deckIds:['10', '32', '76']}
  ]
});

const anneA = putOnBoard(state, 0, '11', {z:0, r:2, c:0});
const anneB = putOnBoard(state, 0, '11', {z:0, r:2, c:1});
putOnBoard(state, 0, '57', {z:0, r:2, c:2});
const anneTarget = putOnBoard(state, 0, '32', {z:0, r:1, c:0});
assert.equal(anneTarget.currentFate, 1, 'continuous auras must not mutate stored Fate');
assert.equal(effectiveFate(state, anneTarget), 9, 'two Anne auras must each receive Jeremiah potency');
assert.equal(anneTarget.currentFate, 1);

anneA.statuses.push('EFFECTS_SUPPRESSED');
assert.equal(effectiveFate(state, anneTarget), 5, 'suppression must remove only that aura source');
const discardCtx = {state, events:[], ruleEvents:[]};
applyOperation(discardCtx, {
  type:'DISCARD_CARD',
  targetIid:anneB.iid,
  sourceIid:anneB.iid,
  sourceController:0,
  reason:'CONTINUOUS_SOURCE_LEAVE_FIXTURE'
});
assert.equal(effectiveFate(state, anneTarget), 1, 'an aura must disappear as soon as its source leaves');

const cathy = putOnBoard(state, 0, '23', {z:1, r:2, c:0});
putOnBoard(state, 0, '57', {z:1, r:2, c:1});
const character = putOnBoard(state, 0, 'continuous-character', {z:1, r:1, c:0});
assert.equal(effectiveFate(state, cathy), 6, 'Cathy must apply her boosted Character aura to herself');
assert.equal(effectiveFate(state, character), 7);

const maroon = putOnBoard(state, 0, '59', {z:2, r:2, c:0});
const maroonTarget = putOnBoard(state, 0, '32', {z:2, r:2, c:1});
assert.equal(effectiveFate(state, maroon), 2);
assert.equal(effectiveFate(state, maroonTarget), 2);

const dylan = putOnBoard(state, 1, '10', {z:2, r:0, c:0});
assert.equal(effectiveFate(state, maroonTarget), 0, 'opposing Dylan penalties must clamp each card at zero');
const alpine = putOnBoard(state, 1, '76', {z:2, r:0, c:1});
assert.equal(effectiveFate(state, alpine), 1, 'fully immutable cards must ignore continuous modifiers');
dylan.statuses.push('EFFECTS_SUPPRESSED');
assert.equal(effectiveFate(state, maroonTarget), 2);

const scoreBeforeRecovery = zoneScore(state, 1, 0);
state = JSON.parse(stableStringify(state));
assertInvariants(state);
assert.equal(zoneScore(state, 1, 0), scoreBeforeRecovery, 'effective scores must survive canonical recovery');
assert.equal(
  state.board[1][1][0].currentFate,
  4,
  'recovery must preserve stored Fate separately from effective Fate'
);

state.board[1][2][0].faceDown = true;
assert.equal(effectiveFate(state, state.board[1][2][0]), 0);
assert.equal(
  effectiveFate(state, state.board[1][1][0]),
  4,
  'a face-down continuous source must stop contributing immediately'
);

console.log('authoritative-v3 Phase 4 continuous-modifier family smoke test passed');
