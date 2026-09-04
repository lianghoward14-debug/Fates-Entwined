import assert from 'node:assert/strict';
import {
  applyOperation,
  createMoralePressureState,
  createInitialState,
  reduceCommand,
  resolveMoralePressureCycle
} from '../../shared/engine/index.mjs';
import {collectTriggeredOperations} from '../../shared/engine/triggers.mjs';

const DEFINITIONS = [
  {id:'bh17', name:'Jakob Eltzholtz', type:'Improvisor', aff:'expanded_worlds', fate:6, cost:3, rarity:'triangle'},
  {id:'bh18', name:'Jimmy (Post-Cynthia Hug)', type:'Improvisor', aff:'reality', fate:7, cost:3, rarity:'square'},
  {id:'bh19', name:'Abed', type:'Initiator', aff:'reality', fate:2, cost:2, rarity:'square'},
  {id:'s1', name:'First Card', type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'circle', testOnly:true},
  {id:'s2', name:'Second Card', type:'Supporter', aff:'reality', fate:4, cost:0, rarity:'circle', testOnly:true},
  {id:'s3', name:'Third Card', type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'circle', testOnly:true}
];

function stateFor(matchId){
  return createInitialState({
    matchId,
    seed:matchId + ':seed',
    handSize:0,
    maxTurns:20,
    cardDefinitions:DEFINITIONS,
    players:[
      {id:'p0', deckIds:['bh17','bh19','bh19','s1','s2','s3']},
      {id:'p1', deckIds:['bh18','s1','s2','s3']}
    ]
  });
}

function take(state, playerIndex, cardId){
  const deck = state.players[playerIndex].deck;
  const index = deck.findIndex(card=>String(card.id) === String(cardId));
  assert(index >= 0, 'missing ' + cardId);
  return deck.splice(index, 1)[0];
}

function board(state, playerIndex, cardId, destination){
  const card = take(state, playerIndex, cardId);
  card.controller = playerIndex;
  state.board[destination.z][destination.r][destination.c] = card;
  return card;
}

let state = stateFor('BH1719');
const jakob = board(state, 0, 'bh17', {z:0,r:2,c:0});
const consolidated = board(state, 0, 's1', {z:0,r:2,c:1});
const operations = collectTriggeredOperations(state, {
  type:'CARD_CONSOLIDATED',
  playerIndex:0,
  cardIid:consolidated.iid,
  destination:{z:0,r:2,c:1}
});
const crushing = operations.find(operation=>operation.reason === 'CRUSHING_MOMENTUM');
assert(crushing, 'BH17 must trigger while its controller leads in total Fate');
assert.equal(crushing.sourceIid, jakob.iid);
const bh17Ctx = {state, events:[], ruleEvents:[]};
applyOperation(bh17Ctx, crushing);
assert.equal(consolidated.currentFate, 4, 'BH17 must add exactly 3 Fate to the consolidated target');

const abedOne = board(state, 0, 'bh19', {z:1,r:2,c:0});
const abedTwo = board(state, 0, 'bh19', {z:1,r:2,c:1});
const highTCtx = {state, events:[], ruleEvents:[]};
for(const source of [abedOne, abedTwo]){
  applyOperation(highTCtx, {
    type:'CREATE_MATCH_STATUS',
    sourceIid:source.iid,
    sourceController:0,
    status:{
      type:'PERMANENT_FATE_GAIN_POTENCY',
      sourceIid:source.iid,
      playerIndex:0,
      value:1,
      remainingOwnerTurns:1,
      reason:'HIGH_T'
    }
  });
}
const beforeHighT = consolidated.currentFate;
applyOperation(highTCtx, {
  type:'MODIFY_FATE',
  targetIid:consolidated.iid,
  amount:4,
  sourceIid:jakob.iid,
  sourceController:0,
  reason:'TEST_HIGH_T_GAIN',
  bypassReaction:true
});
assert.equal(consolidated.currentFate, beforeHighT + 12, 'two BH19 copies must add two original +4 gains, not compound');

state = stateFor('BH18');
state.gameSettings = {healthPressureSeals:true};
state.moralePressure = createMoralePressureState(0);
state.turn = 4;
const jimmy = board(state, 1, 'bh18', {z:0,r:0,c:0});
const attacker = board(state, 0, 's2', {z:0,r:2,c:0});
attacker.currentFate = 20;
const moraleBefore = state.moralePressure.morale[1];
const moraleCtx = {state, events:[], ruleEvents:[]};
resolveMoralePressureCycle(moraleCtx);
assert(state.moralePressure.morale[1] < moraleBefore, 'BH18 controller must take Morale Calculation damage for the effect to trigger');
const reduction = state.statuses.find(status=>status.reason === 'GENESIS_OF_ALL_INCELDOM');
assert(reduction, 'BH18 must create a Zone Fate reduction after its controller takes calculation damage');
assert.equal(reduction.sourceIid, jimmy.iid);
assert.equal(reduction.playerIndex, 0);
assert.equal(reduction.zone, 0);
assert.equal(reduction.value, -3);
const cycleEvent = moraleCtx.events.find(event=>event.type === 'MORALE_CYCLE_RESOLVED');
assert.equal(cycleEvent.bh18ZoneFateReductions[0].sourceIid, jimmy.iid, 'BH18 overlay source must be carried by the Morale Calculation event');

console.log('authoritative-v3 BH17-BH19 smoke test passed');
