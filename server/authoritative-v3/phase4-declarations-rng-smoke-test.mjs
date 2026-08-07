import assert from 'node:assert/strict';
import {
  applyOperation,
  assertInvariants,
  createInitialState,
  effectiveFate,
  legalCommandTemplates,
  multiplayerEligibleCardIds,
  projectEvents,
  projectEventsForSpectator,
  reduceCommand,
  stableStringify
} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const DEFINITIONS = [
  {id:'51', name:'Rivera', type:'Initiator', aff:'eventide', fate:3, cost:2, rarity:'square'},
  {id:'56', name:'Lydia', type:'Improvisor', aff:'expanded_worlds', fate:7, cost:2, rarity:'star'},
  {id:'57', name:'Jeremiah Jones', type:'Coordinator', aff:'reality', fate:3, cost:2, rarity:'triangle'},
  {id:'66', name:'Mark Menz', type:'Initiator', aff:'reality', fate:3, cost:1, rarity:'triangle'},
  {id:'67', name:'Mr. Secules', type:'Improvisor', aff:'reality', fate:4, cost:1, rarity:'star'},
  {id:'77', name:'Duncan Heyward', type:'Coordinator', aff:'eventide', fate:6, cost:3, rarity:'square'},
  {id:'90', name:'Wojciech (Fisherman)', type:'Initiator', aff:'expanded_worlds', fate:3, cost:1, rarity:'triangle'},
  {id:'96', name:'Wodny Potok Snow Shoveler', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0, rarity:'triangle'},
  {id:'bh02', name:'Joie', type:'Coordinator', aff:'reality', fate:1, cost:5, rarity:'square'},
  {id:'bh04', name:'Anicka Konvicka (Selva Island)', type:'Initiator', aff:'eventide', fate:6, cost:4, rarity:'triangle'},
  {id:'support', name:'Test Supporter', type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'triangle'},
  {id:'reality-character', name:'Reality Character', type:'Dauntless', aff:'reality', fate:4, cost:1, rarity:'triangle'},
  {id:'eventide-character', name:'Eventide Character', type:'Initiator', aff:'eventide', fate:4, cost:1, rarity:'triangle'},
  {id:'catch-a', name:'Catch A', type:'Coordinator', aff:'reality', fate:4, cost:1, rarity:'triangle'},
  {id:'catch-b', name:'Catch B', type:'Dauntless', aff:'reality', fate:5, cost:2, rarity:'triangle'},
  {id:'catch-c', name:'Catch C', type:'Improvisor', aff:'reality', fate:6, cost:2, rarity:'triangle'},
  {id:'other-catch', name:'Other Catch', type:'Initiator', aff:'eventide', fate:7, cost:2, rarity:'triangle'},
  {id:'discard-a', name:'Discard A', type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'triangle'},
  {id:'discard-b', name:'Discard B', type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'triangle'},
  {id:'discard-c', name:'Discard C', type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'triangle'},
  {id:'discard-d', name:'Discard D', type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'triangle'},
  {id:'discard-e', name:'Discard E', type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'triangle'},
  {id:'discard-star', name:'Discard Star', type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'star'},
  {id:'split-target', name:'Split Target', type:'Initiator', aff:'reality', fate:10, cost:1, rarity:'triangle'}
];

function newState(matchId, player0, player1 = []){
  return createInitialState({
    matchId,
    seed:`${matchId.toLowerCase()}-seed`,
    handSize:99,
    maxTurns:20,
    cardDefinitions:DEFINITIONS,
    players:[
      {id:'p0', deckIds:player0},
      {id:'p1', deckIds:player1}
    ]
  });
}

function takeCard(state, playerIndex, cardId){
  for(const pile of ['hand', 'deck', 'discard']){
    const index = state.players[playerIndex][pile].findIndex(card=>String(card.id) === String(cardId));
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

function boardCard(state, iid){
  return state.board.flat(2).find(card=>String(card?.iid) === String(iid));
}

function answer(state, playerId, sequence, payload){
  return reduceCommand(
    state,
    command(state, playerId, sequence, 'ANSWER_PROMPT', {
      promptId:state.pendingPrompt.promptId,
      ...payload
    }),
    {playerId}
  );
}

for(const cardId of ['51', '66', '77', '90', '96', 'bh04']){
  assert(multiplayerEligibleCardIds().includes(cardId), `${cardId} must be v3 eligible`);
}

let state = newState(
  'P4DECLRIVERA',
  ['51', 'support', 'support', 'eventide-character', 'reality-character', '66']
);
const riveraTributeA = putOnBoard(state, 0, 'support', {z:0, r:2, c:0});
const riveraTributeB = putOnBoard(state, 0, 'support', {z:0, r:2, c:1});
const rivera = state.players[0].hand.find(card=>card.id === '51');
let result = reduceCommand(
  state,
  command(state, 'p0', 1, 'CONSOLIDATE_CARD', {
    cardIid:rivera.iid,
    tributeIids:[riveraTributeA.iid, riveraTributeB.iid],
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'MODAL_CHOICE');
assert.deepStrictEqual(result.prompt.options.map(option=>option.value), [
  'reality',
  'third_great_war',
  'expanded_worlds',
  'eventide'
]);
assert.equal(
  legalCommandTemplates(result.state, 0).filter(item=>item.type === 'ANSWER_PROMPT').length,
  4
);
state = JSON.parse(stableStringify(result.state));
result = answer(state, 'p0', 2, {choice:'eventide'});
assert.equal(result.ok, true);
state = result.state;
const riveraStatus = state.statuses.find(status=>status.type === 'RIVERA_AFFILIATION_BONUS');
assert.equal(riveraStatus.affiliation, 'eventide');
assert.equal(riveraStatus.remainingOwnerTurns, 3);

const arriving = takeCard(state, 0, 'eventide-character');
state.players[0].hand.push(arriving);
const riveraCtx = {state, events:[], ruleEvents:[]};
applyOperation(riveraCtx, {
  type:'SET_CARD',
  playerIndex:0,
  cardIid:arriving.iid,
  destination:{z:0, r:2, c:1}
});
assert.equal(boardCard(state, arriving.iid).currentFate, 8);
assert(boardCard(state, arriving.iid).statuses.some(status=>status.startsWith('RIVERA_BONUS:')));

const changedByMark = putOnBoard(state, 0, 'reality-character', {z:0, r:1, c:0});
const markForChange = putOnBoard(state, 0, '66', {z:0, r:1, c:1});
const markCtx = {state, events:[], ruleEvents:[]};
applyOperation(markCtx, {
  type:'CHANGE_ZONE_AFFILIATION',
  sourceIid:markForChange.iid,
  sourceController:0,
  playerIndex:0,
  affiliation:'eventide'
});
assert.equal(changedByMark.affiliation, 'eventide');
assert.equal(changedByMark.currentFate, 8, 'Rivera must include Characters changed to the declaration');
assert(markCtx.events.some(event=>
  event.type === 'AFFILIATION_CHANGED' && event.cardIid === changedByMark.iid
));

for(const [sequence, playerId] of [[3, 'p0'], [4, 'p1'], [5, 'p0'], [6, 'p1'], [7, 'p0']]){
  result = reduceCommand(state, command(state, playerId, sequence, 'END_TURN'), {playerId});
  assert.equal(result.ok, true);
  state = result.state;
}
assert.equal(
  state.statuses.some(status=>status.type === 'RIVERA_AFFILIATION_BONUS'),
  false,
  'the resolving owner turn plus two later owner turns must exhaust Rivera'
);

state = newState('P4DECLMARK', ['66', 'support', 'reality-character', 'reality-character']);
const markTribute = putOnBoard(state, 0, 'support', {z:1, r:2, c:0});
const markTarget = putOnBoard(state, 0, 'reality-character', {z:1, r:2, c:1});
const immutableTarget = putOnBoard(state, 0, 'reality-character', {z:1, r:1, c:0});
immutableTarget.statuses.push('EFFECT_IMMUTABLE');
const mark = state.players[0].hand.find(card=>card.id === '66');
result = reduceCommand(
  state,
  command(state, 'p0', 1, 'CONSOLIDATE_CARD', {
    cardIid:mark.iid,
    tributeIids:[markTribute.iid],
    destination:{z:1, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
state = JSON.parse(stableStringify(result.state));
result = answer(state, 'p0', 2, {choice:'eventide'});
assert.equal(result.ok, true);
assert.equal(boardCard(result.state, markTarget.iid).affiliation, 'eventide');
assert.equal(boardCard(result.state, immutableTarget.iid).affiliation, 'reality');
assert.equal(boardCard(result.state, mark.iid).affiliation, 'eventide');
assert.equal(boardCard(result.state, mark.iid).currentFate, 5);
assert.equal(result.events.filter(event=>event.type === 'AFFILIATION_CHANGED').length, 2);

state = newState(
  'P4DECLDUNCAN',
  ['77', 'support', 'support', 'support', 'eventide-character', '57']
);
const duncanTributes = [
  putOnBoard(state, 0, 'support', {z:2, r:2, c:0}),
  putOnBoard(state, 0, 'support', {z:2, r:2, c:1}),
  putOnBoard(state, 0, 'support', {z:2, r:2, c:2})
];
const duncanTarget = putOnBoard(state, 0, 'eventide-character', {z:2, r:1, c:0});
putOnBoard(state, 0, '57', {z:2, r:1, c:1});
const duncan = state.players[0].hand.find(card=>card.id === '77');
result = reduceCommand(
  state,
  command(state, 'p0', 1, 'CONSOLIDATE_CARD', {
    cardIid:duncan.iid,
    tributeIids:duncanTributes.map(card=>card.iid),
    destination:{z:2, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
result = answer(result.state, 'p0', 2, {choice:'eventide'});
assert.equal(result.ok, true);
assert.equal(boardCard(result.state, duncan.iid).counters.declaredAffiliation, 'eventide');
assert.equal(effectiveFate(result.state, boardCard(result.state, duncanTarget.iid)), 9);
assert.equal(effectiveFate(result.state, boardCard(result.state, duncan.iid)), 11);
boardCard(result.state, duncan.iid).statuses.push('EFFECTS_SUPPRESSED');
assert.equal(effectiveFate(result.state, boardCard(result.state, duncanTarget.iid)), 4);

state = newState(
  'P4DECLFISHER',
  ['90', 'support', 'catch-a', 'catch-b', 'catch-c', 'other-catch', 'bh02'],
  ['56']
);
const fisherTribute = putOnBoard(state, 0, 'support', {z:0, r:2, c:0});
const joie = putOnBoard(state, 0, 'bh02', {z:0, r:2, c:1});
putOnBoard(state, 1, '56', {z:1, r:0, c:0});
for(const id of ['catch-a', 'catch-b', 'catch-c', 'other-catch']){
  state.players[0].deck.push(takeCard(state, 0, id));
}
const fisherman = state.players[0].hand.find(card=>card.id === '90');
result = reduceCommand(
  state,
  command(state, 'p0', 1, 'CONSOLIDATE_CARD', {
    cardIid:fisherman.iid,
    tributeIids:[fisherTribute.iid],
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'REACTION');
state = JSON.parse(stableStringify(result.state));
result = answer(state, 'p1', 2, {choice:'DECLINE'});
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'MODAL_CHOICE');
const fishermanChoiceState = JSON.parse(stableStringify(result.state));
const rngBeforeFisherman = fishermanChoiceState.rngState.counter;
const fishermanA = answer(
  JSON.parse(stableStringify(fishermanChoiceState)),
  'p0',
  3,
  {choice:'reality'}
);
const fishermanB = answer(
  JSON.parse(stableStringify(fishermanChoiceState)),
  'p0',
  3,
  {choice:'reality'}
);
assert.equal(fishermanA.ok, true);
assert.equal(stableStringify(fishermanA.state), stableStringify(fishermanB.state));
assert.equal(fishermanA.state.rngState.counter - rngBeforeFisherman, 3);
const caught = fishermanA.state.players[0].hand.filter(card=>
  ['catch-a', 'catch-b', 'catch-c'].includes(card.id)
);
assert.equal(caught.length, 2);
assert(caught.every(card=>card.currentFate === card.baseFate + 3));
assert.equal(boardCard(fishermanA.state, joie.iid).currentFate, 2);
assert.equal(
  fishermanA.events.filter(event=>event.type === 'DRAW_EFFECT_ACTIVATED').length,
  1,
  'Joie observes one activated draw effect, not one event per caught card'
);
assert(fishermanA.events.some(event=>event.type === 'DECK_SHUFFLED'));
assert.equal(
  projectEvents(fishermanA.events, 1).some(event=>event.type === 'RANDOM_TRANSFER_RESOLVED'),
  false
);
assert.equal(
  projectEventsForSpectator(fishermanA.events).some(event=>event.type === 'RANDOM_TRANSFER_RESOLVED'),
  false
);
assertInvariants(fishermanA.state);

state = newState(
  'P4DECLSHOVEL',
  [
    '96',
    'discard-a',
    'discard-b',
    'discard-c',
    'discard-d',
    'discard-e',
    'discard-star',
    'catch-a',
    'catch-b'
  ],
  ['67']
);
putOnBoard(state, 1, '67', {z:1, r:0, c:0});
for(const id of ['discard-a', 'discard-b', 'discard-c', 'discard-d', 'discard-e', 'discard-star']){
  state.players[0].discard.push(takeCard(state, 0, id));
}
const existingDeckOrder = ['catch-a', 'catch-b'].map(id=>{
  const card = takeCard(state, 0, id);
  state.players[0].deck.push(card);
  return card.iid;
});
const shoveler = state.players[0].hand.find(card=>card.id === '96');
result = reduceCommand(
  state,
  command(state, 'p0', 1, 'SET_CARD', {
    cardIid:shoveler.iid,
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'REACTION');
state = JSON.parse(stableStringify(result.state));
const rngBeforeShovel = state.rngState.counter;
result = answer(state, 'p1', 2, {choice:'DECLINE'});
assert.equal(result.ok, true);
assert.equal(result.state.rngState.counter - rngBeforeShovel, 8);
assert.equal(result.state.players[0].deck.length, 6);
assert.equal(result.state.players[0].discard.length, 2);
assert(result.state.players[0].discard.some(card=>card.id === 'discard-star'));
assert.equal(result.events.some(event=>event.type === 'DECK_SHUFFLED'), false);
assert.deepStrictEqual(
  result.state.players[0].deck
    .filter(card=>existingDeckOrder.includes(card.iid))
    .map(card=>card.iid),
  existingDeckOrder,
  'seeded insertions must preserve the relative order of existing deck cards'
);
assertInvariants(result.state);

state = newState(
  'P4DECLSELVA',
  ['bh04', 'support', 'support', 'support', 'support'],
  ['split-target', 'split-target', 'split-target', 'split-target', 'split-target']
);
const selvaTributes = [
  putOnBoard(state, 0, 'support', {z:0, r:2, c:0}),
  putOnBoard(state, 0, 'support', {z:0, r:2, c:1}),
  putOnBoard(state, 0, 'support', {z:0, r:2, c:2}),
  putOnBoard(state, 0, 'support', {z:0, r:1, c:0})
];
const splitTargets = [
  putOnBoard(state, 1, 'split-target', {z:0, r:0, c:0}),
  putOnBoard(state, 1, 'split-target', {z:0, r:0, c:1}),
  putOnBoard(state, 1, 'split-target', {z:0, r:0, c:2})
];
const immuneSplitTarget = putOnBoard(state, 1, 'split-target', {z:0, r:1, c:1});
immuneSplitTarget.statuses.push('EFFECT_IMMUTABLE');
const opponentImmuneSplitTarget = putOnBoard(state, 1, 'split-target', {z:0, r:1, c:2});
opponentImmuneSplitTarget.statuses.push('IMMUNE_TO_OPPONENT_EFFECTS');
const selva = state.players[0].hand.find(card=>card.id === 'bh04');
result = reduceCommand(
  state,
  command(state, 'p0', 1, 'CONSOLIDATE_CARD', {
    cardIid:selva.iid,
    tributeIids:selvaTributes.map(card=>card.iid),
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'MODAL_CHOICE');
assert.equal(result.prompt.options.length, 5);
state = JSON.parse(stableStringify(result.state));
result = answer(state, 'p0', 2, {choice:'Initiator'});
assert.equal(result.ok, true);
for(const target of splitTargets){
  assert.equal(boardCard(result.state, target.iid).currentFate, 3);
}
assert.equal(boardCard(result.state, immuneSplitTarget.iid).currentFate, 10);
assert.equal(boardCard(result.state, opponentImmuneSplitTarget.iid).currentFate, 10);
const splitEvent = result.events.find(event=>event.type === 'SPLIT_FATE_LOSS_RESOLVED');
assert.equal(splitEvent.lossEach, 7);
assert.equal(splitEvent.targetIids.length, 3);
assertInvariants(result.state);

console.log('authoritative-v3 Phase 4 declaration and deterministic-random smoke test passed');
