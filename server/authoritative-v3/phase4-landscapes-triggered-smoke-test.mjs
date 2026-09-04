import assert from 'node:assert/strict';
import {
  assertInvariants,
  createInitialState,
  queueLandscapeRuleEventFrame,
  reduceCommand,
  stableStringify
} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const DEFINITIONS = [
  {id:'26', name:'UCPD', type:'Supporter', aff:'reality', fate:1, cost:0},
  {id:'27', name:'Kazumi', type:'Initiator', aff:'eventide', fate:5, cost:1},
  {id:'39', name:'Juan Carlos', type:'Initiator', aff:'expanded_worlds', fate:3, cost:2}
];

function stateFor(landscapeId, matchId, handSize = 0){
  return createInitialState({
    matchId,
    seed:matchId,
    handSize,
    maxTurns:20,
    landscapeId,
    cardDefinitions:DEFINITIONS,
    players:[
      {id:'p0', deckIds:['27', '26', '39']},
      {id:'p1', deckIds:['27', '26', '39']}
    ]
  });
}

function takeFromPileToBoard(state, playerIndex, pileName, destination){
  const card = state.players[playerIndex][pileName].shift();
  if(!card) throw new Error(`missing ${pileName} fixture card`);
  card.controller = playerIndex;
  state.board[destination.z][destination.r][destination.c] = card;
  return card;
}

// West Coast Dreaming opens a resumable optional prompt only for an effect draw.
let state = stateFor('igb9', 'P4LAND-IGB9');
const dreamTarget = takeFromPileToBoard(state, 0, 'deck', {z:0, r:2, c:0});
const beforeDreamFate = dreamTarget.currentFate;
let result = reduceCommand(
  state,
  command(state, 'p0', 1, 'DRAW_CARD', {
    playerIndex:0,
    count:1,
    activatedEffect:true
  }),
  {playerId:'p0', allowDebugCommands:true}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'BOARD_TARGET');
assert.equal(result.prompt.playerIndex, 0);
assert.equal(result.prompt.cancellable, true);
assert(result.prompt.eligibleIids.includes(dreamTarget.iid));
state = JSON.parse(stableStringify(result.state));
result = reduceCommand(
  state,
  command(state, 'p0', 2, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIid:dreamTarget.iid
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.board[0][2][0].currentFate, beforeDreamFate + 3);
assert.equal(result.state.pendingPrompt, null);
assert.equal(result.state.effectStack.length, 0);

// A multi-card effect draw still opens only one West Coast Dreaming prompt.
state = stateFor('igb9', 'P4LAND-IGB9-MULTI');
const multiDreamTarget = takeFromPileToBoard(state, 0, 'deck', {z:0, r:2, c:0});
const beforeMultiDreamFate = multiDreamTarget.currentFate;
result = reduceCommand(
  state,
  command(state, 'p0', 1, 'DRAW_CARD', {
    playerIndex:0,
    count:2,
    activatedEffect:true
  }),
  {playerId:'p0', allowDebugCommands:true}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'BOARD_TARGET');
state = JSON.parse(stableStringify(result.state));
result = reduceCommand(
  state,
  command(state, 'p0', 2, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIid:multiDreamTarget.iid
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.board[0][2][0].currentFate, beforeMultiDreamFate + 3);
assert.equal(result.state.pendingPrompt, null, 'multi-card draw must not queue a second West Coast prompt');
assert.equal(result.state.effectStack.length, 0, 'multi-card draw resolves exactly one West Coast frame');

// Multiple DRAW_CARD operations belonging to the same effect activation also
// resolve West Coast Dreaming only once. This covers effects/copies whose
// program emits individual draws instead of one count-N operation.
state = stateFor('igb9', 'P4LAND-IGB9-SPLIT-DRAW');
takeFromPileToBoard(state, 0, 'deck', {z:0, r:2, c:0});
const splitDrawEvent = {
  type:'CARD_DRAWN',
  playerIndex:0,
  activatedEffect:true,
  sourceIid:'kazumi-source-1',
  effectActivationId:'split-draw-frame-1'
};
queueLandscapeRuleEventFrame(state, splitDrawEvent);
assert.equal(state.effectStack.length, 1);
queueLandscapeRuleEventFrame(state, {...splitDrawEvent, effectActivationId:'split-draw-frame-2'});
queueLandscapeRuleEventFrame(state, {...splitDrawEvent, effectActivationId:'split-draw-frame-3'});
assert.equal(state.effectStack.length, 1, 'one effect activation must queue exactly one West Coast frame');

// An ordinary draw-phase draw does not invoke West Coast Dreaming.
state = stateFor('igb9', 'P4LAND-IGB9-NORMAL');
takeFromPileToBoard(state, 0, 'deck', {z:0, r:2, c:0});
result = reduceCommand(
  state,
  command(state, 'p0', 1, 'DRAW_CARD', {
    playerIndex:0,
    count:1,
    activatedEffect:false
  }),
  {playerId:'p0', allowDebugCommands:true}
);
assert.equal(result.ok, true);
assert.equal(result.prompt, null);

// Battle of Pella claims 20 Fate once, lets the winner discard any mutable field card,
// and records the choice in canonical state before later thresholds can open.
state = stateFor('igb20', 'P4LAND-IGB20', 99);
const scoringCard = takeFromPileToBoard(state, 0, 'hand', {z:0, r:2, c:0});
scoringCard.currentFate = 19;
const discardTarget = takeFromPileToBoard(state, 1, 'hand', {z:0, r:0, c:0});
result = reduceCommand(
  state,
  command(state, 'p0', 1, 'MODIFY_FATE', {
    targetIid:scoringCard.iid,
    amount:1,
    reason:'THRESHOLD_TEST'
  }),
  {playerId:'p0', allowDebugCommands:true}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'BOARD_TARGET');
assert.equal(result.prompt.playerIndex, 0);
assert.equal(result.state.landscapeState.fateThresholdClaims['20'].choiceResolved, false);
state = JSON.parse(stableStringify(result.state));
result = reduceCommand(
  state,
  command(state, 'p0', 2, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIid:discardTarget.iid
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert(result.state.players[1].discard.some(card=>card.iid === discardTarget.iid));
assert.deepEqual(result.state.landscapeState.fateThresholdClaims['20'], {
  threshold:20,
  winner:0,
  winningTotal:20,
  choiceResolved:true,
  declined:false,
  discardedIid:discardTarget.iid
});
assert.equal(result.state.pendingPrompt, null);
assertInvariants(result.state);

console.log('authoritative-v3 Phase 4 triggered landscape smoke test passed');
