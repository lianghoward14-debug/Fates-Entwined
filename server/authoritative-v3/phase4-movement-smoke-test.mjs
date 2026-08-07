import assert from 'node:assert/strict';
import {
  createInitialState,
  legalCommandTemplates,
  reduceCommand,
  stableStringify
} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const DEFINITIONS = [
  {id:'32', name:'Temecula Resident', type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'circle'},
  {id:'34', name:'Rozsi Szocs', type:'Coordinator', aff:'third_great_war', fate:3, cost:2, rarity:'triangle'},
  {id:'39', name:'Juan Carlos', type:'Initiator', aff:'expanded_worlds', fate:3, cost:2, rarity:'triangle'},
  {id:'54', name:'Wolf Creek Light Infantry', type:'Supporter', aff:'third_great_war', fate:2, cost:0, rarity:'circle'},
  {id:'76', name:'ALPINE Infantry', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0, rarity:'circle'},
  {id:'69', name:'Breakfast Republic Busser', type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'circle'},
  {id:'bh01', name:'Anička', type:'Improvisor', aff:'expanded_worlds', fate:4, cost:3, rarity:'triangle'}
];

function moveToBoard(state, cardId, destination){
  for(const pile of ['hand', 'deck', 'discard']){
    const index = state.players[0][pile].findIndex(card=>card.id === cardId);
    if(index < 0) continue;
    const card = state.players[0][pile].splice(index, 1)[0];
    card.controller = 0;
    state.board[destination.z][destination.r][destination.c] = card;
    return card;
  }
  throw new Error(`missing ${cardId}`);
}

let state = createInitialState({
  matchId:'P4MOVE69',
  seed:'p4-movement-busser',
  handSize:0,
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['69', '32', '34']},
    {id:'p1', deckIds:['32']}
  ]
});
const target = moveToBoard(state, '32', {z:1, r:2, c:1});
const rozsi = moveToBoard(state, '34', {z:0, r:2, c:0});
const busserIndex = state.players[0].deck.findIndex(card=>card.id === '69');
const busser = state.players[0].deck.splice(busserIndex, 1)[0];
state.players[0].hand.push(busser);

let result = reduceCommand(
  state,
  command(state, 'p0', 1, 'SET_CARD', {
    cardIid:busser.iid,
    destination:{z:1, r:1, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'BOARD_TARGET');
assert(result.prompt.eligibleIids.includes(target.iid));
state = JSON.parse(stableStringify(result.state));
result = reduceCommand(
  state,
  command(state, 'p0', 2, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIid:target.iid
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
let grant = result.state.statuses.find(status=>status.type === 'MOVEMENT_GRANT');
assert(grant);
assert.equal(grant.targetIid, target.iid);
assert.equal(grant.remainingOwnerTurns, 3);

state = JSON.parse(stableStringify(result.state));
result = reduceCommand(
  state,
  command(state, 'p0', 3, 'MOVE_CARD', {
    cardIid:target.iid,
    destination:{z:0, r:2, c:1}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.board[0][2][1].iid, target.iid);
assert.equal(result.state.board[0][2][1].currentFate, 4, 'Rozsi must observe granted movement');
assert(result.events.some(event=>
  event.type === 'CARD_MOVED'
  && event.cardIid === target.iid
  && event.sourceIid === target.iid
  && event.effectSourceIid === busser.iid
  && event.reason === 'MOVEMENT_GRANT'
));
assert(result.events.some(event=>
  event.type === 'FATE_CHANGED'
  && event.sourceIid === rozsi.iid
  && event.cardIid === target.iid
  && event.semanticSourceCardId === '34'
));
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 4, 'MOVE_CARD', {
    cardIid:target.iid,
    destination:{z:1, r:2, c:2}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, false);
assert.equal(result.rejection.code, 'USE_LIMIT_REACHED');

result = reduceCommand(state, command(state, 'p0', 5, 'END_TURN'), {playerId:'p0'});
assert.equal(result.ok, true);
grant = result.state.statuses.find(status=>status.type === 'MOVEMENT_GRANT');
assert.equal(grant.remainingOwnerTurns, 2);
state = result.state;
result = reduceCommand(state, command(state, 'p1', 6, 'END_TURN'), {playerId:'p1'});
assert.equal(result.ok, true);
state = result.state;

result = reduceCommand(
  state,
  command(state, 'p0', 7, 'MOVE_CARD', {
    cardIid:target.iid,
    destination:{z:2, r:2, c:1}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, false);
assert.equal(result.rejection.code, 'INVALID_DESTINATION', 'Busser movement cannot skip a zone');
result = reduceCommand(
  state,
  command(state, 'p0', 8, 'MOVE_CARD', {
    cardIid:target.iid,
    destination:{z:1, r:1, c:2}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
state = result.state;

result = reduceCommand(state, command(state, 'p0', 9, 'END_TURN'), {playerId:'p0'});
assert.equal(result.ok, true);
assert.equal(
  result.state.statuses.find(status=>status.type === 'MOVEMENT_GRANT').remainingOwnerTurns,
  1
);
state = result.state;
result = reduceCommand(state, command(state, 'p1', 10, 'END_TURN'), {playerId:'p1'});
assert.equal(result.ok, true);
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 11, 'MOVE_CARD', {
    cardIid:target.iid,
    destination:{z:2, r:2, c:1}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
state = result.state;
result = reduceCommand(state, command(state, 'p0', 12, 'END_TURN'), {playerId:'p0'});
assert.equal(result.ok, true);
assert.equal(result.state.statuses.some(status=>status.type === 'MOVEMENT_GRANT'), false);
assert(result.events.some(event=>event.type === 'STATUS_EXPIRED'));
state = result.state;
result = reduceCommand(state, command(state, 'p1', 13, 'END_TURN'), {playerId:'p1'});
assert.equal(result.ok, true);
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 14, 'MOVE_CARD', {
    cardIid:target.iid,
    destination:{z:1, r:2, c:1}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, false);
assert.equal(result.rejection.code, 'MOVE_NOT_AVAILABLE');

state = createInitialState({
  matchId:'P4MOVE39TARGETS',
  seed:'p4-movement-juan-targets',
  handSize:0,
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['39', '32']},
    {id:'p1', deckIds:['76', '32']}
  ]
});
function movePlayerCardToBoard(targetState, playerIndex, cardId, destination){
  for(const pile of ['hand', 'deck', 'discard']){
    const index = targetState.players[playerIndex][pile].findIndex(card=>card.id === cardId);
    if(index < 0) continue;
    const card = targetState.players[playerIndex][pile].splice(index, 1)[0];
    card.controller = playerIndex;
    targetState.board[destination.z][destination.r][destination.c] = card;
    return card;
  }
  throw new Error(`missing player ${playerIndex} card ${cardId}`);
}
const juan = movePlayerCardToBoard(state, 0, '39', {z:0, r:2, c:0});
const immuneTarget = movePlayerCardToBoard(state, 1, '76', {z:0, r:0, c:0});
const movableTarget = movePlayerCardToBoard(state, 1, '32', {z:0, r:0, c:1});
result = reduceCommand(
  state,
  command(state, 'p0', 1, 'ACTIVATE_EFFECT', {sourceIid:juan.iid}),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'BOARD_TARGET');
assert.deepEqual(result.prompt.eligibleIids, [movableTarget.iid]);
assert(!result.prompt.eligibleIids.includes(immuneTarget.iid), 'immune targets must not enter Juan Carlos movement prompts');

state = createInitialState({
  matchId:'P4MOVE39FULL',
  seed:'p4-movement-juan-full-zone',
  handSize:0,
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['39', '32', '32', '32', '32', '32']},
    {id:'p1', deckIds:['32', '32', '32', '32']}
  ]
});
const fullJuan = movePlayerCardToBoard(state, 0, '39', {z:0, r:2, c:0});
let p0Column = 1;
let p1Column = 0;
for(const destination of [
  {z:0,r:2,c:1},{z:0,r:2,c:2},{z:0,r:1,c:0},{z:0,r:1,c:1},
  {z:0,r:1,c:2},{z:0,r:0,c:0},{z:0,r:0,c:1},{z:0,r:0,c:2}
]){
  const playerIndex = destination.r === 0 ? 1 : 0;
  movePlayerCardToBoard(state, playerIndex, '32', destination);
  if(playerIndex === 0) p0Column += 1;
  else p1Column += 1;
}
assert.equal(p0Column + p1Column, 9);
result = reduceCommand(
  state,
  command(state, 'p0', 2, 'ACTIVATE_EFFECT', {sourceIid:fullJuan.iid}),
  {playerId:'p0'}
);
assert.equal(result.ok, false);
assert.equal(result.rejection.code, 'NO_LEGAL_TARGETS');
assert.equal(state.pendingPrompt, null, 'a full zone must not leave a Juan Carlos prompt open');
assert.equal(
  legalCommandTemplates(state, 0).some(template=>template.type === 'ACTIVATE_EFFECT' && template.payload.sourceIid === fullJuan.iid),
  false,
  'a full zone must not advertise an activation that cannot open its mandatory target prompt'
);

state = createInitialState({
  matchId:'P4MOVE54TARGETS',
  seed:'p4-movement-wolf-creek-targets',
  handSize:0,
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['54', '76', '32']},
    {id:'p1', deckIds:['32']}
  ]
});
const wolfCreek = state.players[0].deck.splice(state.players[0].deck.findIndex(card=>card.id === '54'), 1)[0];
state.players[0].hand.push(wolfCreek);
const immutableFriendly = movePlayerCardToBoard(state, 0, '76', {z:0, r:2, c:0});
const movableFriendly = movePlayerCardToBoard(state, 0, '32', {z:0, r:1, c:0});
result = reduceCommand(
  state,
  command(state, 'p0', 1, 'SET_CARD', {
    cardIid:wolfCreek.iid,
    destination:{z:0, r:2, c:1}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'BOARD_TARGET');
assert(result.prompt.eligibleIids.includes(movableFriendly.iid));
assert(
  !result.prompt.eligibleIids.includes(immutableFriendly.iid),
  'immutable friendly cards must not enter Wolf Creek movement prompts'
);
state = JSON.parse(stableStringify(result.state));
result = reduceCommand(
  state,
  command(state, 'p0', 2, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIid:movableFriendly.iid
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'BOARD_DESTINATION');
assert(result.prompt.eligible.length > 0);

state = createInitialState({
  matchId:'P4MOVEBH01IMMUNE',
  seed:'p4-movement-anicka-immutable',
  handSize:0,
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['bh01', '34', '32']},
    {id:'p1', deckIds:['32']}
  ]
});
const anicka = movePlayerCardToBoard(state, 0, 'bh01', {z:0, r:2, c:0});
movePlayerCardToBoard(state, 0, '34', {z:1, r:2, c:0});
result = reduceCommand(
  state,
  command(state, 'p0', 3, 'MOVE_CARD', {
    cardIid:anicka.iid,
    destination:{z:1, r:2, c:1}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true, 'Rozsi must not reject Anička\'s intrinsic movement');
assert.equal(result.state.board[1][2][1].currentFate, 4, 'Rozsi must skip its bonus on immutable Anička');

console.log('authoritative-v3 Phase 4 movement family smoke test passed');
