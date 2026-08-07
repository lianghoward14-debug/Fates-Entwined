import assert from 'node:assert/strict';
import {
  canonicalHash,
  collectInvariantViolations,
  projectStateForPlayer,
  projectStateForSpectator,
  reduceCommand
} from '../../shared/engine/index.mjs';
import {command, takeFromHandToBoard, testState} from './test-helpers.mjs';

const a = testState({seed:'same-seed'});
const b = testState({seed:'same-seed'});
assert.equal(canonicalHash(a), canonicalHash(b), 'same seed and decks must create identical states');
assert.deepEqual(collectInvariantViolations(a), []);

const forbidden = reduceCommand(a, {
  ...command(a, 'p0', 1, 'END_TURN'),
  payload:{postState:a}
}, {playerId:'p0'});
assert.equal(forbidden.ok, false);
assert.equal(forbidden.rejection.code, 'CLIENT_STATE_FORBIDDEN');

let state = testState({player0:['32', '27', '34'], player1:['32', '79']});
const drawSource = state.players[0].hand.find(card=>card.id === '32');
const drawTarget = state.players[0].hand.find(card=>card.id === '27');
state.players[0].hand = state.players[0].hand.filter(card=>card.iid !== drawTarget.iid);
state.players[0].deck.unshift(drawTarget);
let result = reduceCommand(
  state,
  command(state, 'p0', 1, 'SET_CARD', {cardIid:drawSource.iid, destination:{z:0, r:2, c:0}}),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.players[0].hand.some(card=>card.iid === drawTarget.iid), true, 'when-set draw must use the shared operation');
assert.equal(result.events.some(event=>event.type === 'CARD_DRAWN'), true);
assert.equal(result.state.revision, 1);

state = testState({player0:['27', '30'], player1:['56', '67', '32']});
const kazumi = takeFromHandToBoard(state, 0, '27', {z:0, r:2, c:0});
const lydia = takeFromHandToBoard(state, 1, '56', {z:1, r:0, c:0});
takeFromHandToBoard(state, 1, '67', {z:1, r:0, c:1});
result = reduceCommand(
  state,
  command(state, 'p0', 2, 'ACTIVATE_EFFECT', {sourceIid:kazumi.iid}),
  {playerId:'p0'}
);
assert.equal(result.status, 'NEEDS_CHOICE');
assert.equal(result.prompt.playerIndex, 1);
assert.deepEqual(
  result.prompt.options.map(option=>option.kind).sort(),
  ['LYDIA', 'SECULES']
);
let reactionState = result.state;
result = reduceCommand(
  reactionState,
  command(reactionState, 'p1', 3, 'ANSWER_PROMPT', {
    promptId:reactionState.pendingPrompt.promptId,
    choice:'SUPPRESS',
    reactionIid:lydia.iid
  }),
  {playerId:'p1'}
);
assert.equal(result.ok, true);
assert.equal(result.state.pendingPrompt, null);
assert.equal(result.state.effectStack.length, 0);
assert.equal(result.state.board[0][2][0].statuses.includes('EFFECTS_SUPPRESSED'), true);
assert.equal(result.state.board[1][0][0].counters.reactionUses, 1);

state = testState({player0:['30'], player1:['79', '32']});
const santiago = takeFromHandToBoard(state, 0, '30', {z:0, r:2, c:0});
const target = takeFromHandToBoard(state, 1, '32', {z:0, r:1, c:0});
const havano = state.players[1].hand.find(card=>card.id === '79');
result = reduceCommand(
  state,
  command(state, 'p0', 4, 'ACTIVATE_EFFECT', {sourceIid:santiago.iid}),
  {playerId:'p0'}
);
assert.equal(result.prompt.type, 'BOARD_TARGET');
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 5, 'ANSWER_PROMPT', {promptId:state.pendingPrompt.promptId, selectedIid:target.iid}),
  {playerId:'p0'}
);
assert.equal(result.prompt.type, 'REACTION');
assert.equal(result.prompt.options[0].kind, 'HAVANO');
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p1', 6, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    choice:'NEGATE',
    reactionIid:havano.iid
  }),
  {playerId:'p1'}
);
assert.equal(result.prompt.context, 'HAVANO_SET');
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p1', 7, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    destination:{z:2, r:0, c:0}
  }),
  {playerId:'p1'}
);
assert.equal(result.ok, true);
assert.equal(result.state.board[0][1][0].iid, target.iid, 'Havano must negate the targeted discard');
assert.equal(result.state.board[2][0][0].iid, havano.iid, 'Havano must be set through a resumable destination prompt');

state = testState();
const playerProjection = projectStateForPlayer(state, 0);
const spectatorProjection = projectStateForSpectator(state);
const opponentSecretId = state.players[1].hand[0].id;
assert.equal(Object.hasOwn(playerProjection.players[0], 'deck'), false, 'a player must not receive their future deck order');
assert.equal(Object.hasOwn(playerProjection.players[1], 'hand'), false);
assert.equal(Object.hasOwn(playerProjection.players[1], 'deck'), false);
assert.equal(Object.hasOwn(spectatorProjection.players[0], 'hand'), false);
assert.equal(JSON.stringify(playerProjection.players[1]).includes(opponentSecretId), false);

state = testState({player0:['54', '34'], player1:['32']});
const identitySet = new Set(
  state.players.flatMap(player=>[...player.deck, ...player.hand, ...player.discard]).map(card=>card.iid)
);
const wolf = state.players[0].hand.find(card=>card.id === '54');
result = reduceCommand(
  state,
  command(state, 'p0', 8, 'SET_CARD', {cardIid:wolf.iid, destination:{z:0, r:2, c:0}}),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
const allAfterSet = [
  ...result.state.players.flatMap(player=>[...player.deck, ...player.hand, ...player.discard]),
  ...result.state.board.flat(2).filter(Boolean)
].map(card=>card.iid);
assert.deepEqual(new Set(allAfterSet), identitySet, 'commands must preserve total card identity');
assert.equal(allAfterSet.length, identitySet.size, 'a card instance must exist in exactly one zone');
const wrongPlayer = reduceCommand(
  result.state,
  command(result.state, 'p1', 9, 'ANSWER_PROMPT', {
    promptId:result.state.pendingPrompt.promptId,
    selectedIid:result.state.pendingPrompt.eligibleIids[0]
  }),
  {playerId:'p1'}
);
assert.equal(wrongPlayer.ok, false);
assert.equal(wrongPlayer.rejection.code, 'PROMPT_NOT_OWNED');
assert.equal(canonicalHash(result.state), result.stateHash, 'rejection must leave the authoritative state unchanged');

console.log('authoritative v3 engine smoke test passed');
