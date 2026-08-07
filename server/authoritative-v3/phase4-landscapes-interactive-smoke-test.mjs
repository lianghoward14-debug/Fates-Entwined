import assert from 'node:assert/strict';
import {
  assertInvariants,
  createInitialState,
  effectiveFate,
  findBoardCard,
  reduceCommand,
  stableStringify,
  zoneScore
} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';
import {AuthoritativeRoomActor} from './room-actor.mjs';

const DEFINITIONS = [
  {id:'11', name:'Southeastern Mystics', type:'Coordinator', aff:'expanded_worlds', fate:2, cost:1},
  {id:'26', name:'UCPD', type:'Supporter', aff:'reality', fate:1, cost:0},
  {id:'27', name:'Kazumi', type:'Initiator', aff:'eventide', fate:5, cost:1}
];

function stateFor(landscapeId, matchId){
  return createInitialState({
    matchId,
    seed:matchId,
    handSize:99,
    maxTurns:20,
    landscapeId,
    cardDefinitions:DEFINITIONS,
    players:[
      {id:'p0', deckIds:['27', '26']},
      {id:'p1', deckIds:['27', '26']}
    ]
  });
}

// ALPINE Headquarters pauses turn 14 for the consolidation winner's zone choice.
let state = stateFor('igb2', 'P4LAND-IGB2');
state.turn = 14;
state.landscapeState.consolidations = [3, 1];
let result = reduceCommand(state, command(state, 'p0', 1, 'END_TURN'), {playerId:'p0'});
assert.equal(result.ok, true);
assert.equal(result.status, 'NEEDS_CHOICE');
assert.equal(result.state.turn, 14, 'turn transition must wait for the landscape owner');
assert.equal(result.prompt.type, 'ZONE_SELECTION');
assert.equal(result.prompt.playerIndex, 0);
assert.deepEqual(result.prompt.eligibleZones, [0, 1, 2]);
state = JSON.parse(stableStringify(result.state));
result = reduceCommand(
  state,
  command(state, 'p0', 2, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    zone:2
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.turn, 15);
assert.equal(result.state.activePlayer, 1);
assert.equal(zoneScore(result.state, 2, 0), 12);
assert(result.state.statuses.some(status=>
  status.statusId === 'landscape:igb2:reward:p0'
  && status.zone === 2
  && status.value === 12
));
assert.equal(result.state.effectStack.length, 0);
assert.equal(result.state.pendingPrompt, null);

// Qingdao uses its server-rolled target zone and resumes after choosing a reward zone.
state = stateFor('igb8', 'P4LAND-IGB8');
state.turn = 10;
const targetZone = state.landscapeState.targetZone;
const cardIndex = state.players[1].hand.findIndex(card=>card.id === '27');
const controlled = state.players[1].hand.splice(cardIndex, 1)[0];
controlled.controller = 1;
state.board[targetZone][0][0] = controlled;
result = reduceCommand(state, command(state, 'p0', 1, 'END_TURN'), {playerId:'p0'});
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'ZONE_SELECTION');
assert.equal(result.prompt.playerIndex, 1);
assert.equal(result.state.turn, 10);
state = JSON.parse(stableStringify(result.state));
result = reduceCommand(
  state,
  command(state, 'p1', 2, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    zone:1
  }),
  {playerId:'p1'}
);
assert.equal(result.ok, true);
assert.equal(result.state.turn, 11);
assert.equal(result.state.activePlayer, 1);
assert.equal(result.state.board[1].length, 4);
assert.deepEqual(result.state.geometry.rowOwners[1], [1, -1, 0, 1]);
assert.equal(result.state.geometry.playableExtraSquares.filter(square=>
  square.z === 1 && square.r === 3 && square.owner === 1
).length, 3);
assertInvariants(result.state);

// Ties resolve without opening a prompt or interrupting the normal turn boundary.
state = stateFor('igb2', 'P4LAND-IGB2-TIE');
state.turn = 14;
state.landscapeState.consolidations = [2, 2];
result = reduceCommand(state, command(state, 'p0', 1, 'END_TURN'), {playerId:'p0'});
assert.equal(result.ok, true);
assert.equal(result.state.turn, 15);
assert.equal(result.prompt, null);
assert(result.events.some(event=>
  event.type === 'LANDSCAPE_RESOLVED'
  && event.landscapeId === 'igb2'
  && event.tied === true
));

// Lone Pine exposes a server-owned 30-second END_TURN command, never a client clock.
state = stateFor('igb14', 'P4LAND-IGB14');
const actor = new AuthoritativeRoomActor({state, store:null});
const timeout = actor.turnTimeoutCommand();
assert.equal(timeout.timeoutMs, 30000);
assert.equal(timeout.playerId, 'p0');
assert.equal(timeout.command.type, 'END_TURN');
assert.equal(timeout.command.expectedRevision, state.revision);
state.pendingPrompt = {
  promptId:'test-prompt',
  type:'ZONE_SELECTION',
  playerIndex:0,
  eligibleZones:[0],
  timeoutPolicy:'FIRST_ELIGIBLE'
};
state.effectStack.push({
  frameId:'test-frame',
  instructionIndex:0,
  waitingFor:'ZONE_SELECTION',
  program:[{kind:'SELECT_ZONE', local:'zone'}]
});
assert.equal(actor.turnTimeoutCommand(), null, 'turn timeout pauses while a server prompt owns input');

// Santa Anna resolves the discard cost and +4 Fate atomically.
state = stateFor('igb16', 'P4LAND-IGB16');
const targetIndex = state.players[0].hand.findIndex(card=>card.id === '27');
const santaTarget = state.players[0].hand.splice(targetIndex, 1)[0];
santaTarget.controller = 0;
state.board[0][2][0] = santaTarget;
const santaCost = state.players[0].hand.find(card=>card.id === '26');
result = reduceCommand(
  state,
  command(state, 'p0', 1, 'ACTIVATE_LANDSCAPE', {
    discardIids:[santaCost.iid],
    targetIid:santaTarget.iid
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.board[0][2][0].currentFate, 9);
assert(result.state.players[0].discard.some(card=>card.iid === santaCost.iid));
assert(result.events.some(event=>
  event.type === 'LANDSCAPE_ACTIVATED' && event.landscapeId === 'igb16'
));

// Concrete Roads pays all three discard costs, creates one 5-Fate Shizuku,
// and expands the copied Coordinator aura from one zone to the whole field.
state = createInitialState({
  matchId:'P4LAND-IGB17',
  seed:'P4LAND-IGB17',
  handSize:99,
  maxTurns:20,
  landscapeId:'igb17',
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['11', '26', '26', '26']},
    {id:'p1', deckIds:['27']}
  ]
});
const mysticIndex = state.players[0].hand.findIndex(card=>card.id === '11');
const mystic = state.players[0].hand.splice(mysticIndex, 1)[0];
mystic.controller = 0;
state.board[0][2][0] = mystic;
const distantSupporterIndex = state.players[0].hand.findIndex(card=>card.id === '26');
const distantSupporter = state.players[0].hand.splice(distantSupporterIndex, 1)[0];
distantSupporter.controller = 0;
state.board[2][2][0] = distantSupporter;
const concreteCosts = state.players[0].hand.slice(0, 2);
result = reduceCommand(
  state,
  command(state, 'p0', 1, 'ACTIVATE_LANDSCAPE', {
    sourceIid:mystic.iid,
    discardIids:concreteCosts.map(card=>card.iid)
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.landscapeState.oncePerGameUses[0], 1);
assert(result.state.players[0].discard.some(card=>card.iid === mystic.iid));
assert(concreteCosts.every(cost=>
  result.state.players[0].discard.some(card=>card.iid === cost.iid)
));
const shizuku = result.state.players[0].hand.find(card=>card.id === 'whisper17');
assert(shizuku);
assert.equal(shizuku.currentFate, 5);
assert.equal(shizuku.counters.copiedPassiveId, '11');
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 2, 'SET_CARD', {
    cardIid:shizuku.iid,
    destination:{z:0, r:2, c:1}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
const distantEntry = findBoardCard(result.state, distantSupporter.iid);
assert.equal(
  effectiveFate(result.state, distantEntry),
  distantSupporter.currentFate + 3,
  'Shizuku must apply the copied aura outside her own zone'
);
state = result.state;
const unusedCost = state.players[0].hand[0];
result = reduceCommand(
  state,
  command(state, 'p0', 3, 'ACTIVATE_LANDSCAPE', {
    sourceIid:shizuku.iid,
    discardIids:unusedCost ? [unusedCost.iid, unusedCost.iid] : []
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, false);
assert.equal(result.rejection.code, 'USE_LIMIT_REACHED');

console.log('authoritative-v3 Phase 4 interactive landscape smoke test passed');
