import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  canonicalHash,
  createInitialState,
  multiplayerEligibleCardIds
} from '../../shared/engine/index.mjs';
import {AuthoritativeRoomActor} from './room-actor.mjs';
import {SQLiteAuthorityStore} from './storage.mjs';
import {TEST_DEFINITIONS, command, takeFromHandToBoard} from './test-helpers.mjs';

const PHASE3_DEFINITIONS = [
  ...TEST_DEFINITIONS,
  {id:'test-p3-chain', name:'Phase 3 Chain', type:'Initiator', fate:1, cost:1},
  {id:'test-p3-card-selection', name:'Phase 3 Card Selection', type:'Initiator', fate:1, cost:1},
  {id:'test-p3-board-multi', name:'Phase 3 Board Multi', type:'Initiator', fate:1, cost:1},
  {id:'test-p3-optional', name:'Phase 3 Optional', type:'Initiator', fate:1, cost:1}
];

assert.equal(
  multiplayerEligibleCardIds().some(id=>id.startsWith('test-p3-')),
  false,
  'Phase 3 harness cards must never become multiplayer eligible'
);

function makeState(matchId, player0, player1 = ['32']){
  return createInitialState({
    matchId,
    seed:`${matchId}-seed`,
    handSize:12,
    cardDefinitions:PHASE3_DEFINITIONS,
    players:[
      {id:'p0', deckIds:player0},
      {id:'p1', deckIds:player1}
    ]
  });
}

function createHarness(state){
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fate-p3-'));
  const databasePath = path.join(tempDir, 'authority.sqlite');
  let store = new SQLiteAuthorityStore(databasePath);
  store.createMatch(state, canonicalHash(state), [
    {playerId:'p0', seat:0, tokenHash:'a'},
    {playerId:'p1', seat:1, tokenHash:'b'}
  ]);
  let actor = new AuthoritativeRoomActor({state, store, snapshotInterval:50});
  return {
    get actor(){ return actor; },
    restart(){
      store.close();
      store = new SQLiteAuthorityStore(databasePath);
      actor = AuthoritativeRoomActor.recover({matchId:state.matchId, store, snapshotInterval:50});
      return actor;
    },
    close(){
      store.close();
      fs.rmSync(tempDir, {recursive:true, force:true});
    }
  };
}

let state = makeState('P3CHAIN', ['test-p3-chain', '32', '31']);
const chainSource = takeFromHandToBoard(state, 0, 'test-p3-chain', {z:0, r:2, c:0});
let harness = createHarness(state);
let outcome = await harness.actor.dispatch(
  'p0',
  command(harness.actor.state, 'p0', 1, 'ACTIVATE_EFFECT', {sourceIid:chainSource.iid})
);
assert.equal(outcome.response.state.pendingPrompt.type, 'MODAL_CHOICE');
const modalPromptId = outcome.response.state.pendingPrompt.promptId;
harness.restart();
assert.equal(harness.actor.state.pendingPrompt.promptId, modalPromptId);
const revisionBeforeInvalidCancel = harness.actor.state.revision;
outcome = await harness.actor.dispatch('p0', command(harness.actor.state, 'p0', 99, 'ANSWER_PROMPT', {
  promptId:modalPromptId,
  cancel:true
}));
assert.equal(outcome.response.kind, 'rejected');
assert.equal(outcome.response.rejection.code, 'PROMPT_NOT_CANCELLABLE');
assert.equal(harness.actor.state.revision, revisionBeforeInvalidCancel);
outcome = await harness.actor.dispatch('p0', command(harness.actor.state, 'p0', 2, 'ANSWER_PROMPT', {
  promptId:modalPromptId,
  choice:'BOLD'
}));
assert.equal(outcome.response.state.pendingPrompt.type, 'ZONE_SELECTION');
const zonePromptId = harness.actor.state.pendingPrompt.promptId;
harness.restart();
assert.equal(harness.actor.state.pendingPrompt.promptId, zonePromptId);
let timeout = harness.actor.promptTimeoutCommand();
assert.equal(timeout.command.payload.zone, 0);
outcome = await harness.actor.dispatch(timeout.playerId, timeout.command);
assert.equal(outcome.response.state.pendingPrompt.type, 'HAND_SELECTION');
const handPromptId = harness.actor.state.pendingPrompt.promptId;
harness.restart();
assert.equal(harness.actor.state.pendingPrompt.promptId, handPromptId);
const selectedHandIid = harness.actor.state.pendingPrompt.eligibleIids[0];
const beforeFate = harness.actor.state.players[0].hand.find(card=>card.iid === selectedHandIid).currentFate;
timeout = harness.actor.promptTimeoutCommand();
outcome = await harness.actor.dispatch(timeout.playerId, timeout.command);
assert.equal(outcome.response.status, 'ACCEPTED');
assert.equal(harness.actor.state.pendingPrompt, null);
assert.equal(
  harness.actor.state.players[0].hand.find(card=>card.iid === selectedHandIid).currentFate,
  beforeFate + 1
);
harness.close();

state = makeState('P3CARDMULTI', ['test-p3-card-selection', '32', '31']);
const cardSource = takeFromHandToBoard(state, 0, 'test-p3-card-selection', {z:0, r:2, c:0});
harness = createHarness(state);
outcome = await harness.actor.dispatch(
  'p0',
  command(harness.actor.state, 'p0', 1, 'ACTIVATE_EFFECT', {sourceIid:cardSource.iid})
);
assert.equal(outcome.response.state.pendingPrompt.type, 'CARD_SELECTION');
assert.equal(outcome.response.state.pendingPrompt.min, 2);
assert.equal(outcome.response.state.pendingPrompt.max, 2);
harness.restart();
timeout = harness.actor.promptTimeoutCommand();
assert.equal(timeout.command.payload.selectedIids.length, 2);
outcome = await harness.actor.dispatch(timeout.playerId, timeout.command);
assert.equal(outcome.response.status, 'ACCEPTED');
harness.close();

state = makeState('P3BOARDMULTI', ['test-p3-board-multi', '32', '31']);
const boardSource = takeFromHandToBoard(state, 0, 'test-p3-board-multi', {z:0, r:2, c:0});
const boardA = takeFromHandToBoard(state, 0, '32', {z:1, r:2, c:0});
const boardB = takeFromHandToBoard(state, 0, '31', {z:2, r:2, c:0});
harness = createHarness(state);
outcome = await harness.actor.dispatch(
  'p0',
  command(harness.actor.state, 'p0', 1, 'ACTIVATE_EFFECT', {sourceIid:boardSource.iid})
);
assert.equal(outcome.response.state.pendingPrompt.type, 'BOARD_TARGET');
harness.restart();
outcome = await harness.actor.dispatch('p0', command(harness.actor.state, 'p0', 2, 'ANSWER_PROMPT', {
  promptId:harness.actor.state.pendingPrompt.promptId,
  selectedIids:[boardA.iid, boardB.iid]
}));
assert.equal(outcome.response.status, 'ACCEPTED');
harness.close();

state = makeState('P3OPTIONAL', ['test-p3-optional', '32']);
const optionalSource = takeFromHandToBoard(state, 0, 'test-p3-optional', {z:0, r:2, c:0});
harness = createHarness(state);
outcome = await harness.actor.dispatch(
  'p0',
  command(harness.actor.state, 'p0', 1, 'ACTIVATE_EFFECT', {sourceIid:optionalSource.iid})
);
assert.equal(outcome.response.state.pendingPrompt.cancellable, true);
assert.equal(outcome.response.state.pendingPrompt.timeoutPolicy, 'CANCEL');
harness.restart();
timeout = harness.actor.promptTimeoutCommand();
assert.equal(timeout.command.payload.cancel, true);
outcome = await harness.actor.dispatch(timeout.playerId, timeout.command);
assert.equal(outcome.response.status, 'ACCEPTED');
assert(outcome.response.events.some(event=>event.type === 'PROMPT_CANCELLED'));
harness.close();

state = makeState('P3REACTION', ['27', '32'], ['56', '32']);
const kazumi = takeFromHandToBoard(state, 0, '27', {z:0, r:2, c:0});
takeFromHandToBoard(state, 1, '56', {z:1, r:0, c:0});
harness = createHarness(state);
outcome = await harness.actor.dispatch(
  'p0',
  command(harness.actor.state, 'p0', 1, 'ACTIVATE_EFFECT', {sourceIid:kazumi.iid})
);
assert.equal(outcome.response.state.pendingPrompt.type, 'REACTION');
harness.restart();
timeout = harness.actor.promptTimeoutCommand();
assert.equal(timeout.playerId, 'p1');
assert.equal(timeout.command.payload.choice, 'DECLINE');
outcome = await harness.actor.dispatch(timeout.playerId, timeout.command);
assert.equal(outcome.response.status, 'ACCEPTED');
assert.equal(harness.actor.state.pendingPrompt, null);
harness.close();

console.log('authoritative-v3 Phase 3 prompt and recovery gate passed');
