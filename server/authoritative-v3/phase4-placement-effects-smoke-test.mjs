import assert from 'node:assert/strict';
import {
  assertInvariants,
  createInitialState,
  legalCommandTemplates,
  reduceCommand,
  stableStringify
} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const DEFINITIONS = [
  {id:'27', name:'Kazumi', type:'Initiator', aff:'eventide', fate:1, cost:1},
  {id:'32', name:'Temecula Resident', type:'Supporter', aff:'reality', fate:1, cost:0},
  {id:'47', name:'Great Oak', type:'Supporter', aff:'eventide', fate:1, cost:0},
  {id:'50', name:'Berkeley CS Major', type:'Supporter', aff:'reality', fate:1, cost:0},
  {id:'bh01', name:'Anička', type:'Improvisor', aff:'expanded_worlds', fate:4, cost:3},
  {id:'placement-supporter', name:'Placement Supporter', type:'Supporter', aff:'reality', fate:1, cost:0},
  {id:'placement-character', name:'Placement Character', type:'Initiator', aff:'reality', fate:4, cost:2}
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
  matchId:'P4PLACEMENT50',
  seed:'p4-placement-seed',
  handSize:99,
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['50', '50']},
    {id:'p1', deckIds:['27', '32', '32', 'placement-supporter', 'placement-character', '32', '32', '32']}
  ]
});
const activationSource = putOnBoard(state, 1, '27', {z:1, r:0, c:0});
const tributeA = putOnBoard(state, 1, '32', {z:1, r:0, c:1});
const tributeB = putOnBoard(state, 1, '32', {z:1, r:0, c:2});

let major = state.players[0].hand.find(card=>card.id === '50');
let result = reduceCommand(
  state,
  command(state, 'p0', 1, 'SET_CARD', {
    cardIid:major.iid,
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'ZONE_SELECTION');
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 2, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    zone:1
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
let lock = result.state.statuses.find(status=>status.statusType === 'ZONE_ACTIONS_BLOCKED');
assert(lock);
assert.equal(lock.zone, 1);
assert.equal(lock.playerIndex, 1);
assert.equal(lock.activeFromTurn, 2);
assert.equal(lock.remainingTargetTurns, 1);

state = JSON.parse(stableStringify(result.state));
assertInvariants(state);
major = state.players[0].hand.find(card=>card.id === '50');
result = reduceCommand(
  state,
  command(state, 'p0', 3, 'SET_CARD', {
    cardIid:major.iid,
    destination:{z:2, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 4, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    zone:1
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(
  result.state.statuses.filter(status=>status.statusType === 'ZONE_ACTIONS_BLOCKED').length,
  1,
  'same-zone artillery locks must refresh rather than stack duration'
);

state = result.state;
result = reduceCommand(state, command(state, 'p0', 5, 'END_TURN'), {playerId:'p0'});
assert.equal(result.ok, true);
state = JSON.parse(stableStringify(result.state));
const legal = legalCommandTemplates(state, 1);
assert.equal(
  legal.some(template=>
    ['SET_CARD', 'CONSOLIDATE_CARD'].includes(template.type)
    && Number(template.payload?.destination?.z) === 1
  ),
  false
);
assert.equal(
  legal.some(template=>
    template.type === 'ACTIVATE_EFFECT'
    && template.payload?.sourceIid === activationSource.iid
  ),
  false
);

result = reduceCommand(
  state,
  command(state, 'p1', 6, 'ACTIVATE_EFFECT', {sourceIid:activationSource.iid}),
  {playerId:'p1'}
);
assert.equal(result.ok, false);
assert.equal(result.rejection.code, 'ZONE_ACTION_BLOCKED');

const blockedSupporter = state.players[1].hand.find(card=>card.id === 'placement-supporter');
result = reduceCommand(
  state,
  command(state, 'p1', 7, 'SET_CARD', {
    cardIid:blockedSupporter.iid,
    destination:{z:1, r:1, c:0}
  }),
  {playerId:'p1'}
);
assert.equal(result.ok, false);
assert.equal(result.rejection.code, 'ZONE_ACTION_BLOCKED');

const character = state.players[1].hand.find(card=>card.id === 'placement-character');
result = reduceCommand(
  state,
  command(state, 'p1', 8, 'CONSOLIDATE_CARD', {
    cardIid:character.iid,
    tributeIids:[tributeA.iid, tributeB.iid],
    destination:{z:1, r:0, c:1}
  }),
  {playerId:'p1'}
);
assert.equal(result.ok, false);
assert.equal(result.rejection.code, 'ZONE_ACTION_BLOCKED');

result = reduceCommand(
  state,
  command(state, 'p1', 9, 'SET_CARD', {
    cardIid:blockedSupporter.iid,
    destination:{z:0, r:0, c:0}
  }),
  {playerId:'p1'}
);
assert.equal(result.ok, true, 'the lock must not affect another zone');
state = result.state;
result = reduceCommand(state, command(state, 'p1', 10, 'END_TURN'), {playerId:'p1'});
assert.equal(result.ok, true);
assert.equal(result.state.statuses.some(status=>status.statusType === 'ZONE_ACTIONS_BLOCKED'), false);
assert(result.events.some(event=>
  event.type === 'STATUS_EXPIRED'
  && event.statusType === 'ZONE_ACTIONS_BLOCKED'
));

state = result.state;
result = reduceCommand(state, command(state, 'p0', 11, 'END_TURN'), {playerId:'p0'});
assert.equal(result.ok, true);
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p1', 12, 'ACTIVATE_EFFECT', {sourceIid:activationSource.iid}),
  {playerId:'p1'}
);
assert.equal(result.ok, true, 'zone activation must return after lock expiry');
assertInvariants(result.state);

state = createInitialState({
  matchId:'P4PLACEMENTRESERVEDCONSOLIDATION',
  seed:'p4-placement-reserved-consolidation',
  handSize:0,
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['bh01', '47', '32', '32']},
    {id:'p1', deckIds:['32']}
  ]
});
const anicka = takeCard(state, 0, 'bh01');
state.players[0].hand.push(anicka);
const greatOak = putOnBoard(state, 0, '47', {z:0, r:2, c:0});
const markedTribute = putOnBoard(state, 0, '32', {z:0, r:2, c:1});
const finalTribute = putOnBoard(state, 0, '32', {z:0, r:1, c:0});
markedTribute.statuses.push('VIGILANTES_MARK:test-source:1');
result = reduceCommand(
  state,
  command(state, 'p0', 13, 'CONSOLIDATE_CARD', {
    cardIid:anicka.iid,
    tributeIids:[greatOak.iid, markedTribute.iid, finalTribute.iid],
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true, 'tribute triggers must not discard the reserved consolidation card');
assert.equal(result.state.board[0][2][0].iid, anicka.iid);
assert.equal(
  result.state.board[0][2][0].currentFate,
  4,
  'Great Oak must skip its fate bonus on an immutable consolidated card'
);
assertInvariants(result.state);

console.log('authoritative-v3 Phase 4 placement-effects family smoke test passed');
