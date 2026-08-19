import assert from 'node:assert/strict';
import {
  applyOperation,
  assertInvariants,
  createInitialState,
  effectiveFate,
  reduceCommand,
  stableStringify
} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const DEFINITIONS = [
  {id:'10', name:'Post-Modernist Dylan', type:'Coordinator', aff:'expanded_worlds', fate:5, cost:2},
  {id:'19', name:'Kvetka Svoboda', type:'Coordinator', aff:'expanded_worlds', fate:4, cost:3},
  {id:'32', name:'Temecula Resident', type:'Supporter', aff:'reality', fate:1, cost:0},
  {id:'47', name:'Great Oak Infantry', type:'Supporter', aff:'reality', fate:1, cost:0},
  {id:'55', name:'Bobby Jones', type:'Dauntless', aff:'reality', fate:12, cost:3},
  {id:'57', name:'Jeremiah Jones', type:'Coordinator', aff:'expanded_worlds', fate:3, cost:3},
  {id:'63', name:'Greek Hoplite', type:'Supporter', aff:'eventide', fate:1, cost:0},
  {id:'76', name:'ALPINE Infantry', type:'Supporter', aff:'reality', fate:1, cost:0},
  {id:'88', name:'Rozsi Szocs (Youth)', type:'Dauntless', aff:'expanded_worlds', fate:6, cost:3},
  {id:'expansion-character', name:'Expansion Character', type:'Initiator', aff:'reality', fate:4, cost:1}
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
  matchId:'P4EXPANSIONFATE',
  seed:'p4-expansion-fate',
  handSize:99,
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['19', '57', '10', '55', '32', '32', '32', '63', '63', '88', 'expansion-character', '76']},
    {id:'p1', deckIds:['32']}
  ]
});
const kvetka = putOnBoard(state, 0, '19', {z:0, r:2, c:0});
putOnBoard(state, 0, '57', {z:0, r:2, c:1});
const coordinator = putOnBoard(state, 0, '10', {z:0, r:2, c:2});
assert.equal(effectiveFate(state, coordinator), 9, 'Jeremiah must increase Kvetka aura potency');
assert.equal(effectiveFate(state, kvetka), 8, 'Kvetka must receive her own Coordinator aura');
kvetka.statuses.push('EFFECTS_SUPPRESSED');
assert.equal(effectiveFate(state, coordinator), 5);

const bobby = putOnBoard(state, 0, '55', {z:1, r:2, c:0});
const peerA = putOnBoard(state, 0, '32', {z:1, r:2, c:1});
const peerB = putOnBoard(state, 0, '32', {z:1, r:2, c:2});
const peerC = putOnBoard(state, 0, 'expansion-character', {z:1, r:1, c:0});
assert.equal(effectiveFate(state, bobby), 17);
const removalCtx = {state, events:[], ruleEvents:[]};
applyOperation(removalCtx, {
  type:'DISCARD_CARD',
  targetIid:peerC.iid,
  sourceIid:peerC.iid,
  sourceController:0
});
assert.equal(effectiveFate(state, bobby), 12, "Bobby's live condition must disappear below three peers");

const hopliteA = putOnBoard(state, 0, '63', {z:2, r:2, c:0});
const hopliteB = putOnBoard(state, 0, '63', {z:2, r:2, c:1});
assert.equal(effectiveFate(state, hopliteA), 5);
assert.equal(effectiveFate(state, hopliteB), 5);
hopliteB.statuses.push('EFFECTS_SUPPRESSED');
assert.equal(effectiveFate(state, hopliteA), 3);
assert.equal(effectiveFate(state, hopliteB), 1);

const youth = putOnBoard(state, 0, '88', {z:2, r:1, c:0});
const immutable = putOnBoard(state, 0, '76', {z:2, r:1, c:1});
assert.equal(
  effectiveFate(state, youth),
  16,
  'Rozsi Youth must count five mutable Characters across the field, including itself'
);
immutable.type = 'Initiator';
assert.equal(effectiveFate(state, youth), 16, 'Rozsi must not count an effect-immutable card even if it is classified as a Character');
state = JSON.parse(stableStringify(state));
assertInvariants(state);
assert.equal(effectiveFate(state, state.board[2][1][0]), 16);

state = createInitialState({
  matchId:'P4EXPANSION47',
  seed:'p4-expansion-47',
  handSize:99,
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['47', 'expansion-character']},
    {id:'p1', deckIds:['32']}
  ]
});
const infantry = putOnBoard(state, 0, '47', {z:0, r:2, c:0});
const consolidated = state.players[0].hand.find(card=>card.id === 'expansion-character');
const result = reduceCommand(
  state,
  command(state, 'p0', 1, 'CONSOLIDATE_CARD', {
    cardIid:consolidated.iid,
    tributeIids:[infantry.iid],
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.board[0][2][0].currentFate, 7);
assert(result.events.some(event=>
  event.type === 'FATE_CHANGED'
  && event.sourceIid === infantry.iid
  && event.reason === 'GREAT_OAK_CONSOLIDATION'
));
assertInvariants(result.state);

console.log('authoritative-v3 Phase 4 coverage expansion smoke test passed');
