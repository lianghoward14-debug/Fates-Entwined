import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {canonicalHash, createInitialState} from '../../shared/engine/index.mjs';
import {AuthoritativeRoomActor} from './room-actor.mjs';
import {SQLiteAuthorityStore} from './storage.mjs';
import {TEST_DEFINITIONS, command, takeFromHandToBoard} from './test-helpers.mjs';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fate-authority-v3-'));
const databasePath = path.join(tempDir, 'authority.sqlite');

function initial(){
  const state = createInitialState({
    matchId:'RECOVERYV3',
    seed:'recovery-seed',
    handSize:20,
    cardDefinitions:TEST_DEFINITIONS,
    players:[
      {id:'p0', deckIds:['54', '34', '32']},
      {id:'p1', deckIds:['32', '79']}
    ]
  });
  takeFromHandToBoard(state, 0, '34', {z:0, r:2, c:1});
  return state;
}

let store = new SQLiteAuthorityStore(databasePath);
const state = initial();
store.createMatch(state, canonicalHash(state), [
  {playerId:'p0', seat:0, tokenHash:'a'},
  {playerId:'p1', seat:1, tokenHash:'b'}
]);
let actor = new AuthoritativeRoomActor({state, store, snapshotInterval:50});
const wolf = actor.state.players[0].hand.find(card=>card.id === '54');
let outcome = await actor.dispatch(
  'p0',
  command(actor.state, 'p0', 1, 'SET_CARD', {cardIid:wolf.iid, destination:{z:0, r:2, c:0}})
);
assert.equal(outcome.response.status, 'NEEDS_CHOICE');
const promptBeforeRestart = outcome.response.state.pendingPrompt;
assert.equal(promptBeforeRestart.type, 'BOARD_TARGET');

const duplicate = await actor.dispatch(
  'p0',
  {...command(state, 'p0', 1, 'SET_CARD', {cardIid:wolf.iid, destination:{z:0, r:2, c:0}})}
);
assert.equal(duplicate.idempotentReplay, true);
assert.deepEqual(duplicate.response, outcome.response, 'lost acknowledgement retry must return the original response');
const collision = await actor.dispatch(
  'p1',
  {...command(state, 'p1', 1, 'END_TURN'), commandId:'p0:1'}
);
assert.equal(collision.response.kind, 'rejected');
assert.equal(collision.response.rejection.code, 'COMMAND_ID_COLLISION');
assert.equal(Object.hasOwn(collision.response, 'state'), false, 'a commandId collision must not leak the original private response');

store.close();
store = new SQLiteAuthorityStore(databasePath);
actor = AuthoritativeRoomActor.recover({matchId:'RECOVERYV3', store, snapshotInterval:50});
assert.ok(actor);
assert.equal(actor.state.pendingPrompt.promptId, promptBeforeRestart.promptId, 'restart must preserve the exact prompt');
assert.equal(actor.state.revision, 1);

const target = actor.state.board[0][2][1];
outcome = await actor.dispatch(
  'p0',
  command(actor.state, 'p0', 2, 'ANSWER_PROMPT', {
    promptId:actor.state.pendingPrompt.promptId,
    selectedIid:target.iid
  })
);
assert.equal(outcome.response.status, 'NEEDS_CHOICE');
assert.equal(outcome.response.state.pendingPrompt.type, 'BOARD_DESTINATION');
const destinationPromptBeforeRestart = actor.state.pendingPrompt;
store.close();
store = new SQLiteAuthorityStore(databasePath);
actor = AuthoritativeRoomActor.recover({matchId:'RECOVERYV3', store, snapshotInterval:50});
assert.equal(
  actor.state.pendingPrompt.promptId,
  destinationPromptBeforeRestart.promptId,
  'restart must preserve an open destination prompt and its continuation frame'
);
const deterministicTimeout = actor.promptTimeoutCommand();
assert.equal(deterministicTimeout.playerId, 'p0');
assert.deepEqual(
  deterministicTimeout.command.payload.destination,
  actor.state.pendingPrompt.eligible[0],
  'mandatory destination timeout must use the deterministic first legal choice'
);

const stale = await actor.dispatch(
  'p0',
  {
    commandId:'p0:stale',
    matchId:'RECOVERYV3',
    expectedRevision:0,
    type:'END_TURN',
    payload:{}
  }
);
assert.equal(stale.response.kind, 'rejected');
assert.equal(stale.response.rejection.code, 'STALE_REVISION');
assert.equal(actor.state.revision, 2, 'rejected stale commands must not mutate state');

store.close();
fs.rmSync(tempDir, {recursive:true, force:true});
console.log('authoritative v3 actor recovery smoke test passed');
