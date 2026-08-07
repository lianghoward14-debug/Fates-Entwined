import assert from 'node:assert/strict';
import {
  applyOperation,
  assertInvariants,
  canUseAsConsolidationTribute,
  createInitialState,
  findBoardCard,
  legalCommandTemplates,
  reduceCommand,
  stableStringify
} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const DEFINITIONS = [
  {id:'10', name:'Post-Modernist Dylan', type:'Coordinator', aff:'expanded_worlds', fate:5, cost:2},
  {id:'15', name:'Zsofia Szocs', type:'Coordinator', aff:'third_great_war', fate:3, cost:2},
  {id:'32', name:'Temecula Resident', type:'Supporter', aff:'reality', fate:1, cost:0},
  {id:'49', name:'Irvine Businessman', type:'Supporter', aff:'reality', fate:1, cost:0},
  {id:'57', name:'Jeremiah Jones', type:'Coordinator', aff:'expanded_worlds', fate:3, cost:3},
  {id:'76', name:'ALPINE Infantry', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0},
  {id:'query-character', name:'Query Character', type:'Initiator', aff:'reality', fate:4, cost:1}
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
  matchId:'P4EXPANSION15',
  seed:'p4-expansion-15',
  handSize:99,
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['15', '57', '32', '76', '10']},
    {id:'p1', deckIds:['32']}
  ]
});
const zsofia = putOnBoard(state, 0, '15', {z:0, r:2, c:0});
const jeremiah = putOnBoard(state, 0, '57', {z:0, r:2, c:1});
const friendly = putOnBoard(state, 0, '32', {z:0, r:2, c:2});
const immutable = putOnBoard(state, 0, '76', {z:0, r:1, c:0});
const incoming = state.players[0].hand.find(card=>card.id === '10');
const ctx = {state, events:[], ruleEvents:[]};
applyOperation(ctx, {
  type:'SET_CARD',
  playerIndex:0,
  cardIid:incoming.iid,
  destination:{z:0, r:1, c:1},
  sourceController:0
});
assert.equal(zsofia.currentFate, 5);
assert.equal(jeremiah.currentFate, 5);
assert.equal(friendly.currentFate, 3);
assert.equal(incoming.currentFate, 7);
assert.equal(immutable.currentFate, 1);
assert(ctx.events.some(event=>
  event.type === 'FATE_CHANGED'
  && event.sourceIid === zsofia.iid
  && event.reason === 'BLUE_DANUBE_WALTZ'
));
zsofia.statuses.push('EFFECTS_SUPPRESSED');
const before = incoming.currentFate;
const secondIncoming = {
  ...incoming,
  iid:`${incoming.iid}:copy`,
  statuses:[],
  counters:{},
  currentFate:5
};
state.players[0].hand.push(secondIncoming);
applyOperation(ctx, {
  type:'SET_CARD',
  playerIndex:0,
  cardIid:secondIncoming.iid,
  destination:{z:0, r:1, c:2},
  sourceController:0
});
assert.equal(incoming.currentFate, before, 'suppressed Zsofia must stop observing Coordinator sets');
state = JSON.parse(stableStringify(state));
assertInvariants(state);

state = createInitialState({
  matchId:'P4EXPANSION49',
  seed:'p4-expansion-49',
  handSize:99,
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['49', 'query-character', 'query-character']},
    {id:'p1', deckIds:['32']}
  ]
});
const businessman = putOnBoard(state, 0, '49', {z:0, r:2, c:0});
const characterTribute = putOnBoard(state, 0, 'query-character', {z:0, r:2, c:1});
const characterToSet = state.players[0].hand.find(card=>card.id === 'query-character');
let eligibility = canUseAsConsolidationTribute(
  state,
  findBoardCard(state, characterTribute.iid),
  0
);
assert.equal(eligibility.ok, true);
assert.equal(eligibility.reinforcement, 1);
assert(legalCommandTemplates(state, 0).some(template=>
  template.type === 'CONSOLIDATE_CARD'
  && template.payload.cardIid === characterToSet.iid
  && template.payload.tributeIids.includes(characterTribute.iid)
));
let result = reduceCommand(
  state,
  command(state, 'p0', 1, 'CONSOLIDATE_CARD', {
    cardIid:characterToSet.iid,
    tributeIids:[characterTribute.iid],
    destination:{z:0, r:2, c:1}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.board[0][2][1].iid, characterToSet.iid);
assertInvariants(result.state);

businessman.statuses.push('EFFECTS_SUPPRESSED');
eligibility = canUseAsConsolidationTribute(
  state,
  findBoardCard(state, characterTribute.iid),
  0
);
assert.equal(eligibility.ok, false);
assert.equal(eligibility.rejection.code, 'INVALID_TRIBUTE_TYPE');

console.log('authoritative-v3 Phase 4 event/query expansion smoke test passed');
