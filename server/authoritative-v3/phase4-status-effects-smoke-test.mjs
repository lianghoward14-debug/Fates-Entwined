import assert from 'node:assert/strict';
import {
  applyOperation,
  assertInvariants,
  createInitialState,
  reduceCommand,
  stableStringify
} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const DEFINITIONS = [
  {id:'18', name:'1st US Marines', type:'Supporter', aff:'third_great_war', fate:1, cost:0},
  {id:'20', name:'South Wind Spearman', type:'Supporter', aff:'eventide', fate:1, cost:0},
  {id:'32', name:'Temecula Resident', type:'Supporter', aff:'reality', fate:1, cost:0},
  {id:'53', name:'Colombo Thug', type:'Supporter', aff:'eventide', fate:1, cost:0},
  {id:'76', name:'ALPINE Infantry', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0},
  {id:'status-test-character', name:'Status Test Character', type:'Initiator', aff:'reality', fate:4, cost:2}
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

function putInHand(state, playerIndex, cardId){
  const card = takeCard(state, playerIndex, cardId);
  state.players[playerIndex].hand.push(card);
  return card;
}

let state = createInitialState({
  matchId:'P4STATUS18',
  seed:'p4-status-seed',
  handSize:99,
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['18', '18', '18', '18']},
    {id:'p1', deckIds:['32', '76', '32']}
  ]
});
const firstMarine = state.players[0].hand.find(card=>card.id === '18');
let result = reduceCommand(
  state,
  command(state, 'p0', 1, 'SET_CARD', {
    cardIid:firstMarine.iid,
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
let suppression = result.state.statuses.find(status=>status.statusType === 'SUPPORTER_EFFECTS_BLOCKED');
assert(suppression);
assert.equal(suppression.playerIndex, 1);
assert.equal(suppression.activeFromTurn, 2);
assert.equal(suppression.remainingTargetTurns, 1);
assert.equal(
  result.state.statuses.find(status=>status.ruleKey === 'SEMPER_FIDELIS').uses,
  1
);

state = JSON.parse(stableStringify(result.state));
assertInvariants(state);
const secondMarine = state.players[0].hand.find(card=>card.id === '18');
result = reduceCommand(
  state,
  command(state, 'p0', 2, 'SET_CARD', {
    cardIid:secondMarine.iid,
    destination:{z:1, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(
  result.state.statuses.filter(status=>status.statusType === 'SUPPORTER_EFFECTS_BLOCKED').length,
  1,
  'repeated Semper Fidelis must refresh one lock rather than stack durations'
);
assert.equal(
  result.state.statuses.find(status=>status.ruleKey === 'SEMPER_FIDELIS').uses,
  2
);

state = JSON.parse(stableStringify(result.state));
result = reduceCommand(state, command(state, 'p0', 3, 'END_TURN'), {playerId:'p0'});
assert.equal(result.ok, true);
assert.equal(result.state.activePlayer, 1);
assert(result.state.statuses.some(status=>status.statusType === 'SUPPORTER_EFFECTS_BLOCKED'));

state = result.state;
const resident = state.players[1].hand.find(card=>card.id === '32');
result = reduceCommand(
  state,
  command(state, 'p1', 4, 'SET_CARD', {
    cardIid:resident.iid,
    destination:{z:0, r:0, c:0}
  }),
  {playerId:'p1'}
);
assert.equal(result.ok, true, 'the card set itself remains legal');
assert(result.events.some(event=>
  event.type === 'EFFECT_BLOCKED'
  && event.sourceIid === resident.iid
  && event.reason === 'SUPPORTER_EFFECTS_BLOCKED'
));
assert.equal(result.state.effectStack.length, 0);

state = result.state;
const alpine = state.players[1].hand.find(card=>card.id === '76');
result = reduceCommand(
  state,
  command(state, 'p1', 5, 'SET_CARD', {
    cardIid:alpine.iid,
    destination:{z:1, r:0, c:0}
  }),
  {playerId:'p1'}
);
assert.equal(result.ok, true);
assert.equal(
  result.state.board[1][0][0].currentFate,
  5,
  'an intrinsically effect-immune Supporter must ignore the opponent lock'
);

state = JSON.parse(stableStringify(result.state));
result = reduceCommand(state, command(state, 'p1', 6, 'END_TURN'), {playerId:'p1'});
assert.equal(result.ok, true);
assert.equal(
  result.state.statuses.some(status=>status.statusType === 'SUPPORTER_EFFECTS_BLOCKED'),
  false
);
assert(result.events.some(event=>
  event.type === 'STATUS_EXPIRED'
  && event.statusType === 'SUPPORTER_EFFECTS_BLOCKED'
));

state = result.state;
const thirdMarine = state.players[0].hand.find(card=>card.id === '18');
result = reduceCommand(
  state,
  command(state, 'p0', 7, 'SET_CARD', {
    cardIid:thirdMarine.iid,
    destination:{z:2, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.statuses.find(status=>status.ruleKey === 'SEMPER_FIDELIS').uses, 3);

state = result.state;
const fourthMarine = state.players[0].hand.find(card=>card.id === '18');
result = reduceCommand(
  state,
  command(state, 'p0', 8, 'SET_CARD', {
    cardIid:fourthMarine.iid,
    destination:{z:2, r:2, c:1}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true, 'the fourth card may be set even though its limited effect cannot run');
assert.equal(result.state.statuses.find(status=>status.ruleKey === 'SEMPER_FIDELIS').uses, 3);
assert(result.events.some(event=>
  event.type === 'EFFECT_SKIPPED'
  && event.sourceIid === fourthMarine.iid
  && event.reason === 'USE_LIMIT_REACHED'
));

const immunityState = createInitialState({
  matchId:'P4STATUS20',
  seed:'p4-status-immunity',
  handSize:99,
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['20']},
    {id:'p1', deckIds:['32']}
  ]
});
const spearman = putOnBoard(immunityState, 0, '20', {z:0, r:2, c:0});
const opponentSource = putOnBoard(immunityState, 1, '32', {z:0, r:0, c:0});
const immunityCtx = {state:immunityState, events:[], ruleEvents:[]};
assert.throws(
  ()=>applyOperation(immunityCtx, {
    type:'MODIFY_FATE',
    targetIid:spearman.iid,
    amount:-1,
    sourceIid:opponentSource.iid,
    sourceController:1
  }),
  error=>error.code === 'TARGET_IMMUNE'
);
applyOperation(immunityCtx, {
  type:'MODIFY_FATE',
  targetIid:spearman.iid,
  amount:2,
  sourceIid:spearman.iid,
  sourceController:0
});
assert.equal(spearman.currentFate, 3);
assertInvariants(immunityState);

const colomboState = createInitialState({
  matchId:'P4STATUS53',
  seed:'p4-status-colombo',
  handSize:99,
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['32', '32', 'status-test-character']},
    {id:'p1', deckIds:['53']}
  ]
});
const localTribute = putOnBoard(colomboState, 0, '32', {z:0, r:2, c:0});
const remoteTribute = putOnBoard(colomboState, 0, '32', {z:1, r:2, c:0});
const colombo = putOnBoard(colomboState, 1, '53', {z:0, r:0, c:0});
const character = putInHand(colomboState, 0, 'status-test-character');
result = reduceCommand(
  colomboState,
  command(colomboState, 'p0', 1, 'CONSOLIDATE_CARD', {
    cardIid:character.iid,
    tributeIids:[localTribute.iid, remoteTribute.iid],
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, false);
assert.equal(result.rejection.code, 'CROSS_ZONE_TRIBUTE_PREVENTED');

colombo.statuses.push('EFFECTS_SUPPRESSED');
result = reduceCommand(
  colomboState,
  command(colomboState, 'p0', 2, 'CONSOLIDATE_CARD', {
    cardIid:character.iid,
    tributeIids:[localTribute.iid, remoteTribute.iid],
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.board[0][2][0].iid, character.iid);
assertInvariants(result.state);

console.log('authoritative-v3 Phase 4 status-effects family smoke test passed');
