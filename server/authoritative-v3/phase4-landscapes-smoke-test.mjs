import assert from 'node:assert/strict';
import {
  applyOperation,
  assertInvariants,
  createInitialState,
  effectiveReinforcement,
  findBoardCard,
  multiplayerEligibleLandscapeIds,
  projectStateForPlayer,
  projectStateForSpectator,
  stableStringify
} from '../../shared/engine/index.mjs';

const DEFINITIONS = [
  {id:'27', name:'Kazumi', type:'Initiator', aff:'eventide', fate:1, cost:1},
  {id:'32', name:'Temecula Resident', type:'Supporter', aff:'reality', fate:1, cost:0},
  {id:'59', name:'Maroon Knights', type:'Supporter', aff:'third_great_war', fate:1, cost:0},
  {id:'76', name:'ALPINE Infantry', type:'Supporter', aff:'third_great_war', fate:1, cost:0}
];

function context(state){
  return {state, events:[], ruleEvents:[]};
}

function cardInHand(state, playerIndex, cardId){
  const card = state.players[playerIndex].hand.find(item=>item.id === cardId);
  if(!card) throw new Error(`missing fixture card ${cardId}`);
  return card;
}

assert.deepEqual(
  multiplayerEligibleLandscapeIds(),
  [
    'igb1', 'igb10', 'igb11', 'igb12', 'igb13', 'igb14', 'igb15',
    'igb16', 'igb17', 'igb18', 'igb19', 'igb2', 'igb20', 'igb3', 'igb4', 'igb5',
    'igb6', 'igb7', 'igb8', 'igb9'
  ]
);

let state = createInitialState({
  matchId:'P4LANDSCAPE6',
  seed:'p4-landscape-6',
  handSize:99,
  landscapeId:'igb6',
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['32', '59']},
    {id:'p1', deckIds:['32']}
  ]
});
let ctx = context(state);
const reality = cardInHand(state, 0, '32');
applyOperation(ctx, {
  type:'SET_CARD',
  playerIndex:0,
  cardIid:reality.iid,
  destination:{z:0, r:2, c:0},
  sourceController:0
});
assert.equal(reality.currentFate, 4);
assert(reality.statuses.includes('LANDSCAPE_BONUS:igb6'));
assert(ctx.events.some(event=>
  event.type === 'FATE_CHANGED'
  && event.reason === 'LANDSCAPE_IGB6_SET_BONUS'
));

applyOperation(ctx, {
  type:'DISCARD_CARD',
  targetIid:reality.iid,
  sourceIid:reality.iid,
  sourceController:0
});
applyOperation(ctx, {
  type:'TRANSFER_CARDS',
  targetIid:reality.iid,
  playerIndex:0,
  destinationPile:'hand',
  sourceController:0
});
applyOperation(ctx, {
  type:'SET_CARD',
  playerIndex:0,
  cardIid:reality.iid,
  destination:{z:1, r:2, c:0},
  sourceController:0
});
assert.equal(reality.currentFate, 4, 'the permanent landscape bonus must apply once per card instance');
assertInvariants(state);

state = createInitialState({
  matchId:'P4LANDSCAPE11',
  seed:'p4-landscape-11',
  handSize:99,
  landscapeId:'igb11',
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['27', '32']},
    {id:'p1', deckIds:['32']}
  ]
});
ctx = context(state);
const initiator = cardInHand(state, 0, '27');
applyOperation(ctx, {
  type:'SET_CARD',
  playerIndex:0,
  cardIid:initiator.iid,
  destination:{z:0, r:2, c:0},
  sourceController:0
});
assert.equal(initiator.currentFate, 4);
const ordinarySupporter = cardInHand(state, 0, '32');
applyOperation(ctx, {
  type:'SET_CARD',
  playerIndex:0,
  cardIid:ordinarySupporter.iid,
  destination:{z:0, r:2, c:1},
  sourceController:0
});
assert.equal(ordinarySupporter.currentFate, 1);

state = createInitialState({
  matchId:'P4LANDSCAPE10',
  seed:'p4-landscape-10',
  handSize:99,
  landscapeId:'igb10',
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['59', '76']},
    {id:'p1', deckIds:['32']}
  ]
});
const maroon = state.players[0].hand.shift();
maroon.controller = 0;
state.board[0][2][0] = maroon;
const alpine = state.players[0].hand.shift();
alpine.controller = 0;
state.board[0][2][1] = alpine;
assert.equal(effectiveReinforcement(state, findBoardCard(state, maroon.iid), 0), 2);
assert.equal(
  effectiveReinforcement(state, findBoardCard(state, alpine.iid), 0),
  1,
  'fully immutable cards must ignore the landscape reinforcement bonus'
);

state = createInitialState({
  matchId:'P4LANDSCAPE12',
  seed:'p4-landscape-12',
  handSize:1,
  landscapeId:'igb12',
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['32', '59']},
    {id:'p1', deckIds:['27', '32']}
  ]
});
const p0View = projectStateForPlayer(state, 0);
const p1View = projectStateForPlayer(state, 1);
assert.equal(p0View.players[1].hand.length, 1);
assert.equal(p1View.players[0].hand.length, 1);
assert.equal(projectStateForSpectator(state).players[0].hand, undefined);
assert.equal(p0View.landscapeId, 'igb12');
state = JSON.parse(stableStringify(state));
assertInvariants(state);
assert.equal(projectStateForPlayer(state, 0).players[1].hand.length, 1);

const peaceful = createInitialState({
  matchId:'P4LANDSCAPE1',
  seed:'p4-landscape-1',
  handSize:1,
  landscapeId:'igb1',
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['32']},
    {id:'p1', deckIds:['32']}
  ]
});
assert.equal(peaceful.landscapeId, 'igb1');
assertInvariants(peaceful);

console.log('authoritative-v3 Phase 4 landscape family smoke test passed');
