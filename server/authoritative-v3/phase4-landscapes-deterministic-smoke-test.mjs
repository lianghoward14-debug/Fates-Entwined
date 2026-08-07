import assert from 'node:assert/strict';
import {
  applyOperation,
  assertInvariants,
  createInitialState,
  emitRuleEvent,
  legalCommandTemplates,
  reduceCommand,
  stableStringify
} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const DEFINITIONS = [
  {id:'03', name:'Alpine Field Medic', type:'Supporter', aff:'third_great_war', fate:1, cost:0},
  {id:'05', name:'3rd Marine Regiment', type:'Supporter', aff:'third_great_war', fate:1, cost:0},
  {id:'26', name:'UCPD', type:'Supporter', aff:'reality', fate:1, cost:0},
  {id:'27', name:'Kazumi', type:'Initiator', aff:'eventide', fate:1, cost:1},
  {id:'39', name:'Juan Carlos', type:'Initiator', aff:'expanded_worlds', fate:3, cost:2},
  {id:'54', name:'Wolf Creek Light Infantry', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0},
  {id:'67', name:'Mr. Secules', type:'Improvisor', aff:'reality', fate:4, cost:1}
];

function makeState(landscapeId, options = {}){
  return createInitialState({
    matchId:options.matchId || `P4LAND-${landscapeId}`,
    seed:options.seed || `p4-land-${landscapeId}`,
    handSize:options.handSize ?? 99,
    maxTurns:options.maxTurns || 20,
    landscapeId,
    cardDefinitions:DEFINITIONS,
    players:[
      {id:'p0', deckIds:options.player0 || ['27', '26', '39', '54', '67']},
      {id:'p1', deckIds:options.player1 || ['27', '26', '39', '54']}
    ]
  });
}

function context(state){
  return {state, events:[], ruleEvents:[]};
}

function takeToBoard(state, playerIndex, cardId, destination){
  const player = state.players[playerIndex];
  const index = player.hand.findIndex(card=>String(card.id) === String(cardId));
  if(index < 0) throw new Error(`missing ${cardId} in player ${playerIndex} hand`);
  const card = player.hand.splice(index, 1)[0];
  card.controller = playerIndex;
  state.board[destination.z][destination.r][destination.c] = card;
  return card;
}

// Random landscape setup is deterministic and serialized.
let state = makeState('igb3', {matchId:'P4LAND-IGB3-A', seed:'anchorage-seed'});
const repeated = makeState('igb3', {matchId:'P4LAND-IGB3-A', seed:'anchorage-seed'});
assert.equal(state.landscapeState.targetZone, repeated.landscapeState.targetZone);
assert([0, 1, 2].includes(state.landscapeState.targetZone));
let ctx = context(state);
const consolidated = takeToBoard(
  state,
  0,
  '27',
  {z:state.landscapeState.targetZone, r:2, c:0}
);
emitRuleEvent(ctx, {
  type:'CARD_CONSOLIDATED',
  playerIndex:0,
  cardIid:consolidated.iid,
  destination:{z:state.landscapeState.targetZone, r:2, c:0}
});
assert.equal(state.landscapeState.consolidations[0], 1);
assert.equal(consolidated.currentFate, 5);
assert(consolidated.statuses.includes('LANDSCAPE_BONUS:igb3'));

// Zion Canyon blocks every path out of discard, including random recovery.
state = makeState('igb4');
ctx = context(state);
const discarded = state.players[0].hand.find(card=>card.id === '27');
applyOperation(ctx, {type:'DISCARD_CARD', targetIid:discarded.iid, sourceController:0});
let transfer = applyOperation(ctx, {
  type:'TRANSFER_CARDS',
  targetIid:discarded.iid,
  playerIndex:0,
  destinationPile:'hand',
  sourceController:0
});
assert.equal(transfer.blocked, true);
assert(state.players[0].discard.some(card=>card.iid === discarded.iid));
transfer = applyOperation(ctx, {
  type:'RANDOM_TRANSFER_CARDS',
  playerIndex:0,
  sourcePile:'discard',
  destinationPile:'deckRandom',
  count:1
});
assert.equal(transfer.blocked, true);
assert(state.players[0].discard.some(card=>card.iid === discarded.iid));

// Flowing Currents evaluates the live board leader after the set.
state = makeState('igb5');
ctx = context(state);
takeToBoard(state, 0, '67', {z:0, r:2, c:0});
const leaderSet = state.players[0].hand.find(card=>card.id === '26');
applyOperation(ctx, {
  type:'SET_CARD',
  playerIndex:0,
  cardIid:leaderSet.iid,
  destination:{z:0, r:2, c:1},
  sourceController:0
});
assert.equal(leaderSet.currentFate, 3);
assert(leaderSet.statuses.includes('LANDSCAPE_BONUS:igb5'));

// Panacea grants each Eventide card one ordinary move per turn.
state = makeState('igb7', {matchId:'P4LAND-IGB7'});
const eventide = takeToBoard(state, 0, '27', {z:0, r:2, c:0});
assert(legalCommandTemplates(state, 0).some(template=>
  template.type === 'MOVE_CARD' && template.payload.cardIid === eventide.iid
));
let result = reduceCommand(
  state,
  command(state, 'p0', 1, 'MOVE_CARD', {
    cardIid:eventide.iid,
    destination:{z:1, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 2, 'MOVE_CARD', {
    cardIid:eventide.iid,
    destination:{z:2, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, false);
assert.equal(result.rejection.code, 'USE_LIMIT_REACHED');

// A separately granted movement remains usable after the card has spent its
// Panacea move; reducer and legal-command generation must use grant precedence.
state.statuses.push({
  statusId:`movement-grant:${eventide.iid}`,
  type:'MOVEMENT_GRANT',
  targetIid:eventide.iid,
  sourceIid:eventide.iid,
  playerIndex:0,
  remainingOwnerTurns:3,
  lastMoveTurn:null
});
assert(legalCommandTemplates(state, 0).some(template=>
  template.type === 'MOVE_CARD'
  && template.payload.cardIid === eventide.iid
  && template.payload.destination.z === 2
));
result = reduceCommand(
  state,
  command(state, 'p0', 3, 'MOVE_CARD', {
    cardIid:eventide.iid,
    destination:{z:2, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.board[2][2][0].iid, eventide.iid);

// Big Sur skips each player's second, fourth, ... draw phase.
state = makeState('igb13', {
  matchId:'P4LAND-IGB13',
  handSize:0,
  player0:['26', '54', '67'],
  player1:['26', '54', '67']
});
const initialDeckCounts = state.players.map(player=>player.deck.length);
for(const [index, playerId] of ['p0', 'p1', 'p0'].entries()){
  result = reduceCommand(state, command(state, playerId, index + 1, 'END_TURN'), {playerId});
  assert.equal(result.ok, true);
  state = result.state;
}
assert.equal(state.players[1].deck.length, initialDeckCounts[1] - 1);
assert(result.events.some(event=>event.type === 'DRAW_PHASE_SKIPPED' && event.playerIndex === 1));

// Snow on the Carpathians permits exactly one resolved Supporter effect per player turn.
state = makeState('igb15', {
  matchId:'P4LAND-IGB15',
  player0:['26', '26'],
  player1:['27']
});
const firstUcpd = takeToBoard(state, 0, '26', {z:0, r:2, c:0});
const secondUcpd = takeToBoard(state, 0, '26', {z:1, r:2, c:0});
result = reduceCommand(
  state,
  command(state, 'p0', 1, 'ACTIVATE_EFFECT', {sourceIid:firstUcpd.iid}),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.landscapeState.supporterEffectsThisTurn[0], 1);
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 2, 'ACTIVATE_EFFECT', {sourceIid:secondUcpd.iid}),
  {playerId:'p0'}
);
assert.equal(result.ok, false);
assert.equal(result.rejection.code, 'EFFECT_PERMISSION_BLOCKED');

// A second automatic WHEN_SET Supporter effect under Snow is terminally
// blocked: the card remains set, no effect frame or prompt survives, and the
// player can immediately end the turn. This is the exact historical stall
// regression, not merely an ACTIVATE_EFFECT permission check.
state = makeState('igb15', {
  matchId:'P4LAND-IGB15-WHEN-SET',
  player0:['05', '05'],
  player1:['27']
});
let firstMarine = state.players[0].hand.find(card=>card.id === '05');
let firstSet = legalCommandTemplates(state, 0).find(entry=>
  entry.type === 'SET_CARD'
  && entry.payload.cardIid === firstMarine.iid
  && entry.payload.destination.z === 0
);
assert(firstSet, 'first Snow WHEN_SET Supporter must be placeable');
result = reduceCommand(state, command(state, 'p0', 31, firstSet.type, firstSet.payload), {playerId:'p0'});
assert.equal(result.ok, true);
state = result.state;
if(state.pendingPrompt){
  const answer = legalCommandTemplates(state, 0).find(entry=>entry.type === 'ANSWER_PROMPT');
  assert(answer, 'first Snow WHEN_SET prompt must be answerable');
  result = reduceCommand(state, command(state, 'p0', 32, answer.type, answer.payload), {playerId:'p0'});
  assert.equal(result.ok, true);
  state = result.state;
}
const secondMarine = state.players[0].hand.find(card=>card.id === '05');
const secondSet = legalCommandTemplates(state, 0).find(entry=>
  entry.type === 'SET_CARD'
  && entry.payload.cardIid === secondMarine.iid
);
assert(secondSet, 'second Snow WHEN_SET Supporter card must remain placeable');
result = reduceCommand(state, command(state, 'p0', 33, secondSet.type, secondSet.payload), {playerId:'p0'});
assert.equal(result.ok, true, result.rejection?.reason);
assert(result.events.some(event=>event.type === 'EFFECT_BLOCKED' && event.sourceIid === secondMarine.iid));
assert.equal(result.state.pendingPrompt, null, 'blocked Snow WHEN_SET effect must not leave a prompt');
assert.equal(result.state.effectStack.length, 0, 'blocked Snow WHEN_SET effect must not leave a frame');
assert(legalCommandTemplates(result.state, 0).some(entry=>entry.type === 'END_TURN'), 'turn must remain endable immediately');

// Idyllic Polish Village affects only the active player's face-up Expanded Worlds Characters.
state = makeState('igb18');
ctx = context(state);
const expandedCharacter = takeToBoard(state, 0, '39', {z:0, r:2, c:0});
const expandedSupporter = takeToBoard(state, 0, '54', {z:0, r:2, c:1});
emitRuleEvent(ctx, {type:'TURN_STARTED', playerIndex:0, turn:2});
assert.equal(expandedCharacter.currentFate, 4);
assert.equal(expandedSupporter.currentFate, 1);

// Californique discards Characters after their third completed owner turn.
state = makeState('igb19', {
  matchId:'P4LAND-IGB19',
  player0:['27', '26'],
  player1:['26'],
  maxTurns:10
});
const expiring = state.players[0].hand.find(card=>card.id === '27');
assert.equal(expiring.counters.igb19HandTurnsRemaining, 3);
const turnPlayers = ['p0', 'p1', 'p0', 'p1', 'p0'];
for(let index = 0; index < turnPlayers.length; index += 1){
  const playerId = turnPlayers[index];
  result = reduceCommand(state, command(state, playerId, index + 1, 'END_TURN'), {playerId});
  assert.equal(result.ok, true);
  state = result.state;
}
assert(!state.players[0].hand.some(card=>card.iid === expiring.iid));
assert(state.players[0].discard.some(card=>card.iid === expiring.iid));
assert(result.events.some(event=>
  event.type === 'CARD_DISCARDED'
  && event.cardIid === expiring.iid
));

state = JSON.parse(stableStringify(state));
assertInvariants(state);
console.log('authoritative-v3 Phase 4 deterministic landscape smoke test passed');
