import assert from 'node:assert/strict';
import {
  applyOperation,
  assertInvariants,
  createInitialState,
  effectiveFate,
  projectStateForPlayer,
  projectStateForSpectator,
  reduceCommand,
  stableStringify
} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const DEFINITIONS = [
  {id:'26', name:'UCPD', type:'Supporter', aff:'reality', fate:1, cost:0},
  {id:'32', name:'Temecula Resident', type:'Supporter', aff:'reality', fate:1, cost:0},
  {id:'56', name:'Lydia', type:'Improvisor', aff:'expanded_worlds', fate:7, cost:2},
  {id:'85', name:'Felicyta Janowicz (Specters)', type:'Dauntless', aff:'expanded_worlds', fate:1, cost:4},
  {id:'89', name:'Zsofia Szocs (Youth)', type:'Dauntless', aff:'expanded_worlds', fate:7, cost:2}
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

function newState(matchId, player0, player1){
  return createInitialState({
    matchId,
    seed:`${matchId.toLowerCase()}-seed`,
    handSize:99,
    cardDefinitions:DEFINITIONS,
    players:[
      {id:'p0', deckIds:player0},
      {id:'p1', deckIds:player1}
    ]
  });
}

let state = newState('P4COUNTERSETS', ['85', '89', '32'], ['32', '32']);
const felicyta = putOnBoard(state, 0, '85', {z:0, r:2, c:0});
const zsofia = putOnBoard(state, 0, '89', {z:0, r:2, c:1});
const placementCtx = {state, events:[], ruleEvents:[]};
for(const destination of [{z:1, r:0, c:0}, {z:1, r:0, c:1}]){
  const supporter = state.players[1].hand.find(card=>card.id === '32');
  applyOperation(placementCtx, {
    type:'SET_CARD',
    playerIndex:1,
    cardIid:supporter.iid,
    destination,
    sourceController:1
  });
}
assert.deepStrictEqual(state.supportersSetTotal, [0, 2]);
assert.equal(felicyta.currentFate, 1, 'cumulative Fate must not mutate stored Fate');
assert.equal(effectiveFate(state, felicyta), 3);
assert.equal(effectiveFate(state, zsofia), 14);
assert.deepStrictEqual(projectStateForPlayer(state, 0).supportersSetTotal, [0, 2]);
assert.deepStrictEqual(projectStateForSpectator(state).supporterEffectsActivated, [0, 0]);
state = JSON.parse(stableStringify(state));
assertInvariants(state);
assert.equal(effectiveFate(state, state.board[0][2][0]), 3, 'counter-derived Fate must survive recovery');

state = newState('P4COUNTERACTIVATE', ['89', '26'], ['32']);
const activationZsofia = putOnBoard(state, 0, '89', {z:0, r:2, c:0});
const ucpd = putOnBoard(state, 0, '26', {z:0, r:2, c:1});
for(let use = 1; use <= 10; use += 1){
  const result = reduceCommand(
    state,
    command(state, 'p0', use, 'ACTIVATE_EFFECT', {sourceIid:ucpd.iid}),
    {playerId:'p0'}
  );
  assert.equal(result.ok, true);
  assert.equal(result.prompt, null);
  assert.equal(result.state.supporterEffectsActivated[0], use);
  state = result.state;
}
assert.equal(effectiveFate(state, activationZsofia), 7, 'the tenth activation must remove Zsofia Youth bonus');
assert.equal(activationZsofia.currentFate, 7);
assertInvariants(state);

state = newState('P4COUNTERNEGATE', ['89', '26'], ['56']);
const protectedZsofia = putOnBoard(state, 0, '89', {z:0, r:2, c:0});
const reactedUcpd = putOnBoard(state, 0, '26', {z:0, r:2, c:1});
const lydia = putOnBoard(state, 1, '56', {z:1, r:0, c:0});
let result = reduceCommand(
  state,
  command(state, 'p0', 1, 'ACTIVATE_EFFECT', {sourceIid:reactedUcpd.iid}),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'REACTION');
assert.equal(result.state.supporterEffectsActivated[0], 0, 'a pending reaction is not a completed activation');
state = JSON.parse(stableStringify(result.state));
assertInvariants(state);
result = reduceCommand(
  state,
  command(state, 'p1', 2, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    choice:'NEGATE',
    reactionIid:lydia.iid
  }),
  {playerId:'p1'}
);
assert.equal(result.ok, true);
assert.equal(result.state.supporterEffectsActivated[0], 0, 'negated Supporter effects must not count');
assert.equal(effectiveFate(result.state, protectedZsofia), 14);
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 3, 'ACTIVATE_EFFECT', {sourceIid:reactedUcpd.iid}),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p1', 4, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    choice:'SUPPRESS',
    reactionIid:lydia.iid
  }),
  {playerId:'p1'}
);
assert.equal(result.ok, true);
assert.equal(result.state.supporterEffectsActivated[0], 0, 'suppressed Supporter effects must not count');

state = newState('P4COUNTERDECLINE', ['89', '26'], ['56']);
const declinedUcpd = putOnBoard(state, 0, '26', {z:0, r:2, c:0});
putOnBoard(state, 0, '89', {z:0, r:2, c:1});
putOnBoard(state, 1, '56', {z:1, r:0, c:0});
result = reduceCommand(
  state,
  command(state, 'p0', 1, 'ACTIVATE_EFFECT', {sourceIid:declinedUcpd.iid}),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
state = JSON.parse(stableStringify(result.state));
result = reduceCommand(
  state,
  command(state, 'p1', 2, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    choice:'DECLINE'
  }),
  {playerId:'p1'}
);
assert.equal(result.ok, true);
assert.equal(result.state.supporterEffectsActivated[0], 1, 'a proceeded reaction-window effect must count once');
assertInvariants(result.state);

state = newState('P4COUNTERWHENSET', ['32', '32'], ['32']);
const resident = state.players[0].hand.find(card=>card.id === '32');
result = reduceCommand(
  state,
  command(state, 'p0', 1, 'SET_CARD', {
    cardIid:resident.iid,
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.deepStrictEqual(result.state.supportersSetTotal, [1, 0]);
assert.deepStrictEqual(result.state.supporterEffectsActivated, [1, 0]);
assertInvariants(result.state);

state = newState('P4COUNTERBLOCKED', ['32'], ['32']);
state.turn = 2;
state.statuses.push({
  statusId:'timed-player:supporter_effects_blocked:p0',
  type:'TIMED_PLAYER_STATUS',
  statusType:'SUPPORTER_EFFECTS_BLOCKED',
  playerIndex:0,
  sourceIid:'semper-fixture',
  sourceController:1,
  createdTurn:1,
  activeFromTurn:2,
  remainingTargetTurns:1
});
const blockedResident = state.players[0].hand.find(card=>card.id === '32');
result = reduceCommand(
  state,
  command(state, 'p0', 1, 'SET_CARD', {
    cardIid:blockedResident.iid,
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.deepStrictEqual(result.state.supportersSetTotal, [1, 0]);
assert.deepStrictEqual(result.state.supporterEffectsActivated, [0, 0]);
assert(result.events.some(event=>event.type === 'EFFECT_BLOCKED'));
assertInvariants(result.state);

console.log('authoritative-v3 Phase 4 cumulative-counter smoke test passed');
