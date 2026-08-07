import assert from 'node:assert/strict';
import {
  assertInvariants,
  createInitialState,
  reduceCommand,
  stableStringify
} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const DEFINITIONS = [
  {id:'27', name:'Kazumi', type:'Initiator', aff:'eventide', fate:1, cost:1},
  {id:'30', name:'Santiago Sharpshooter', type:'Initiator', aff:'third_great_war', fate:3, cost:2},
  {id:'32', name:'Temecula Resident', type:'Supporter', aff:'reality', fate:1, cost:0},
  {id:'56', name:'Lydia', type:'Improvisor', aff:'expanded_worlds', fate:7, cost:2},
  {id:'57', name:'Jeremiah Jones', type:'Coordinator', aff:'expanded_worlds', fate:3, cost:3},
  {id:'67', name:'Mr. Secules', type:'Improvisor', aff:'reality', fate:4, cost:1},
  {id:'76', name:'ALPINE Infantry', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0},
  {id:'79', name:'Havano Citizen', type:'Supporter', aff:'eventide', fate:1, cost:0},
  {id:'bh08', name:'Maja Kaminska (University)', type:'Coordinator', aff:'expanded_worlds', fate:4, cost:3}
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
  matchId:'P4REACTIONBH08',
  seed:'p4-reaction-seed',
  handSize:99,
  activePlayer:1,
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['56', '57', '76', 'bh08']},
    {id:'p1', deckIds:['27', '32', '32', '32']}
  ]
});
const lydia = putOnBoard(state, 0, '56', {z:0, r:2, c:0});
const jeremiah = putOnBoard(state, 0, '57', {z:0, r:2, c:1});
const maja = putOnBoard(state, 0, 'bh08', {z:0, r:2, c:2});
const alpine = putOnBoard(state, 0, '76', {z:0, r:1, c:0});
const kazumi = putOnBoard(state, 1, '27', {z:1, r:0, c:0});

let result = reduceCommand(
  state,
  command(state, 'p1', 1, 'ACTIVATE_EFFECT', {sourceIid:kazumi.iid}),
  {playerId:'p1'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'REACTION');
state = JSON.parse(stableStringify(result.state));
assertInvariants(state);
result = reduceCommand(
  state,
  command(state, 'p0', 2, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    choice:'NEGATE',
    reactionIid:lydia.iid
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert(result.events.some(event=>
  event.type === 'EFFECT_REACTED'
  && event.mode === 'NEGATE'
  && event.playerIndex === 0
));
assert.equal(result.state.board[0][2][2].currentFate, 7);
assert.equal(result.state.board[0][2][1].currentFate, 6);
assert.equal(result.state.board[0][2][0].currentFate, 10);
assert.equal(result.state.board[0][1][0].currentFate, 1, 'immutable cards must ignore the reaction bonus');
assert(result.events.some(event=>
  event.type === 'FATE_CHANGED'
  && event.sourceIid === maja.iid
  && event.reason === 'MISCHIEVOUS_ACTIVITIES'
));

state = result.state;
// Reuse the fixture source to exercise a second reaction mode without making
// the shipping one-shot Kazumi effect repeatable.
state.board[1][0][0].counters.effectUses = 0;
result = reduceCommand(
  state,
  command(state, 'p1', 3, 'ACTIVATE_EFFECT', {sourceIid:kazumi.iid}),
  {playerId:'p1'}
);
assert.equal(result.ok, true);
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 4, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    choice:'SUPPRESS',
    reactionIid:lydia.iid
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert(result.state.board[1][0][0].statuses.includes('EFFECTS_SUPPRESSED'));
assert.equal(result.state.board[0][2][2].currentFate, 10);
assert.equal(result.state.board[0][2][1].currentFate, 9);
assert.equal(result.state.board[0][2][0].currentFate, 13);

let automaticState = createInitialState({
  matchId:'P4REACTIONAUTO',
  seed:'p4-reaction-auto',
  handSize:99,
  activePlayer:1,
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['57', 'bh08']},
    {id:'p1', deckIds:['32', '32']}
  ]
});
automaticState.turn = 2;
const automaticJeremiah = putOnBoard(automaticState, 0, '57', {z:0, r:2, c:0});
const automaticMaja = putOnBoard(automaticState, 0, 'bh08', {z:0, r:2, c:1});
automaticState.statuses.push({
  statusId:'timed-player:supporter_effects_blocked:p1',
  type:'TIMED_PLAYER_STATUS',
  statusType:'SUPPORTER_EFFECTS_BLOCKED',
  playerIndex:1,
  sourceIid:'semper-fixture',
  sourceController:0,
  createdTurn:1,
  activeFromTurn:2,
  remainingTargetTurns:1
});
const resident = automaticState.players[1].hand.find(card=>card.id === '32');
result = reduceCommand(
  automaticState,
  command(automaticState, 'p1', 1, 'SET_CARD', {
    cardIid:resident.iid,
    destination:{z:1, r:0, c:0}
  }),
  {playerId:'p1'}
);
assert.equal(result.ok, true);
assert(result.events.some(event=>
  event.type === 'EFFECT_REACTED'
  && event.reactionKind === 'TIMED_PERMISSION'
  && event.mode === 'SUPPRESS'
));
assert.equal(result.state.board[0][2][1].currentFate, 7);
assert.equal(result.state.board[0][2][0].currentFate, 6);
assert.equal(result.state.board[1][0][0].currentFate, 1);
assert.equal(automaticMaja.currentFate, 4, 'accepted commands must not mutate the input snapshot');
assert.equal(automaticJeremiah.currentFate, 3);
assertInvariants(result.state);

// Mr. Secules must be selectable—not merely advertised—and must prevent the
// activated draw from resolving.
state = createInitialState({
  matchId:'P4REACTIONSECULES',
  seed:'p4-reaction-secules',
  handSize:99,
  activePlayer:1,
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['67']},
    {id:'p1', deckIds:['27', '32', '32', '32']}
  ]
});
const secules = putOnBoard(state, 0, '67', {z:0, r:2, c:0});
const seculesKazumi = putOnBoard(state, 1, '27', {z:1, r:0, c:0});
const handBeforeSecules = state.players[1].hand.length;
result = reduceCommand(
  state,
  command(state, 'p1', 5, 'ACTIVATE_EFFECT', {sourceIid:seculesKazumi.iid}),
  {playerId:'p1'}
);
assert.equal(result.ok, true);
assert(result.prompt.options.some(option=>option.kind === 'SECULES' && option.reactionIid === secules.iid));
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 6, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    choice:'NEGATE',
    reactionIid:secules.iid
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.players[1].hand.length, handBeforeSecules);
assert.equal(result.state.board[0][2][0].counters.reactionUses, 1);
assert(result.events.some(event=>
  event.type === 'EFFECT_REACTED'
  && event.reactionKind === 'SECULES'
  && event.mode === 'NEGATE'
));

// Havano interrupts a targeted discard, then enters play through its own
// resumable destination prompt before the original effect is finalized.
state = createInitialState({
  matchId:'P4REACTIONHAVANO',
  seed:'p4-reaction-havano',
  handSize:99,
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['30']},
    {id:'p1', deckIds:['79', '32']}
  ]
});
const santiago = putOnBoard(state, 0, '30', {z:0, r:2, c:0});
const havanoTarget = putOnBoard(state, 1, '32', {z:0, r:1, c:0});
const havano = state.players[1].hand.find(card=>card.id === '79');
result = reduceCommand(
  state,
  command(state, 'p0', 7, 'ACTIVATE_EFFECT', {sourceIid:santiago.iid}),
  {playerId:'p0'}
);
assert.equal(result.prompt.type, 'BOARD_TARGET');
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 8, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIid:havanoTarget.iid
  }),
  {playerId:'p0'}
);
assert.equal(result.prompt.type, 'REACTION');
assert(result.prompt.options.some(option=>option.kind === 'HAVANO' && option.reactionIid === havano.iid));
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p1', 9, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    choice:'NEGATE',
    reactionIid:havano.iid
  }),
  {playerId:'p1'}
);
assert.equal(result.prompt.type, 'BOARD_DESTINATION');
assert.equal(result.prompt.context, 'HAVANO_SET');
assert(result.events.some(event=>
  event.type === 'EFFECT_REACTED'
  && event.reactionKind === 'HAVANO'
  && event.mode === 'NEGATE'
));
state = JSON.parse(stableStringify(result.state));
result = reduceCommand(
  state,
  command(state, 'p1', 10, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    destination:{z:2, r:0, c:0}
  }),
  {playerId:'p1'}
);
assert.equal(result.ok, true);
assert.equal(result.state.board[0][1][0].iid, havanoTarget.iid);
assert.equal(result.state.board[2][0][0].iid, havano.iid);
assertInvariants(result.state);

console.log('authoritative-v3 Phase 4 reactions family smoke test passed');
