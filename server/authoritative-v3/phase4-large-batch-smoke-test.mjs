import assert from 'node:assert/strict';
import {
  applyOperation,
  assertInvariants,
  canUseAsConsolidationTribute,
  createInitialState,
  effectiveConsolidationCost,
  effectiveCost,
  effectiveFate,
  legalCommandTemplates,
  reduceCommand,
  stableStringify
} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const DEFINITIONS = [
  {id:'11', name:'Anne Stone', type:'Coordinator', aff:'eventide', fate:6, cost:2},
  {id:'12', name:'Makenna', type:'Coordinator', aff:'expanded_worlds', fate:4, cost:1},
  {id:'32', name:'Temecula Resident', type:'Supporter', aff:'reality', fate:1, cost:0},
  {id:'33', name:'West Caribbea Infantry', type:'Supporter', aff:'eventide', fate:1, cost:0},
  {id:'35', name:'Alexander the Magnificient', type:'Dauntless', aff:'third_great_war', fate:0, cost:4},
  {id:'46', name:'Phil', type:'Dauntless', aff:'reality', fate:4, cost:3},
  {id:'59', name:'Czechoslovak Maroon Knights', type:'Supporter', aff:'third_great_war', fate:1, cost:0},
  {id:'76', name:'ALPINE Infantry', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0},
  {id:'87', name:'Květka Svoboda (Ukulele)', type:'Initiator', aff:'expanded_worlds', fate:3, cost:2},
  {id:'92', name:'Wodny Potok Lumberjack', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0},
  {id:'95', name:'Carpathian Specter', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0},
  {id:'97', name:'Visegrad Politician', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0},
  {id:'batch-character', name:'Batch Character', type:'Initiator', aff:'reality', fate:4, cost:1}
];

function newState(matchId, player0, player1, options = {}){
  return createInitialState({
    matchId,
    seed:`${matchId.toLowerCase()}-seed`,
    handSize:99,
    maxTurns:options.maxTurns || 20,
    activePlayer:options.activePlayer || 0,
    cardDefinitions:DEFINITIONS,
    players:[
      {id:'p0', deckIds:player0},
      {id:'p1', deckIds:player1}
    ]
  });
}

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

function boardCard(state, iid){
  return state.board.flat(2).find(card=>card?.iid === iid);
}

let state = newState('P4LARGEMAKENNA', ['12', '32', '32'], ['32']);
const makennaTribute = putOnBoard(state, 0, '32', {z:0, r:2, c:0});
const makennaTarget = putOnBoard(state, 0, '32', {z:0, r:2, c:1});
const makenna = state.players[0].hand.find(card=>card.id === '12');
let result = reduceCommand(
  state,
  command(state, 'p0', 1, 'CONSOLIDATE_CARD', {
    cardIid:makenna.iid,
    tributeIids:[makennaTribute.iid],
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'BOARD_TARGET');
assert.deepStrictEqual(
  new Set(result.prompt.eligibleIids),
  new Set([makenna.iid, makennaTarget.iid])
);
state = JSON.parse(stableStringify(result.state));
assertInvariants(state);
result = reduceCommand(
  state,
  command(state, 'p0', 2, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIids:[makenna.iid, makennaTarget.iid]
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert(boardCard(result.state, makenna.iid).statuses.includes('IMMUNE_TO_OPPONENT_EFFECTS'));
assert(boardCard(result.state, makennaTarget.iid).statuses.includes('IMMUNE_TO_OPPONENT_EFFECTS'));
assertInvariants(result.state);

state = newState(
  'P4LARGEARRIVAL',
  ['33', '33', 'batch-character', 'batch-character'],
  ['32']
);
const arrivalCharacters = state.players[0].hand.filter(card=>card.id === 'batch-character');
const drawCharacter = arrivalCharacters[0];
const transferCharacter = arrivalCharacters[1];
state.players[0].hand = state.players[0].hand.filter(card=>card.iid !== drawCharacter.iid);
state.players[0].deck.unshift(drawCharacter);
const westCaribA = state.players[0].hand.find(card=>card.id === '33');
result = reduceCommand(
  state,
  command(state, 'p0', 1, 'SET_CARD', {
    cardIid:westCaribA.iid,
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert(result.state.statuses.some(status=>status.type === 'NEXT_CHARACTER_HAND_ARRIVAL'));
state = result.state;
const arrivalCtx = {state, events:[], ruleEvents:[]};
applyOperation(arrivalCtx, {type:'DRAW_CARD', playerIndex:0, count:1});
const arrivedDrawCharacter = state.players[0].hand.find(card=>card.iid === drawCharacter.iid);
assert.equal(arrivedDrawCharacter.currentFate, 6);
assert.equal(effectiveCost(state, arrivedDrawCharacter), 0);
assert.equal(state.statuses.some(status=>status.type === 'NEXT_CHARACTER_HAND_ARRIVAL'), false);
const westCaribB = state.players[0].hand.find(card=>card.id === '33');
result = reduceCommand(
  state,
  command(state, 'p0', 2, 'SET_CARD', {
    cardIid:westCaribB.iid,
    destination:{z:0, r:2, c:1}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
state = result.state;
state.players[0].hand = state.players[0].hand.filter(card=>card.iid !== transferCharacter.iid);
state.players[0].deck.push(transferCharacter);
const transferCtx = {state, events:[], ruleEvents:[]};
applyOperation(transferCtx, {
  type:'TRANSFER_CARDS',
  targetIid:transferCharacter.iid,
  playerIndex:0,
  destinationPile:'hand'
});
assert.equal(transferCharacter.currentFate, 6);
assert.equal(effectiveCost(state, transferCharacter), 0);
assert(transferCtx.events.some(event=>event.type === 'HAND_ARRIVAL_MODIFIED'));
assert(transferCtx.events.some(event=>event.type === 'DECK_SEARCHED'));
assertInvariants(state);

state = newState('P4LARGEARRIVALBLOCK', ['33', 'batch-character'], ['32']);
const blockedArrival = state.players[0].hand.find(card=>card.id === 'batch-character');
state.players[0].hand = state.players[0].hand.filter(card=>card.iid !== blockedArrival.iid);
state.players[0].deck.unshift(blockedArrival);
const blockedWestCarib = state.players[0].hand.find(card=>card.id === '33');
result = reduceCommand(
  state,
  command(state, 'p0', 1, 'SET_CARD', {
    cardIid:blockedWestCarib.iid,
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
state = result.state;
boardCard(state, blockedWestCarib.iid).statuses.push('EFFECTS_SUPPRESSED');
const blockedArrivalCtx = {state, events:[], ruleEvents:[]};
applyOperation(blockedArrivalCtx, {type:'DRAW_CARD', playerIndex:0, count:1});
const blockedArrivedCharacter = state.players[0].hand.find(card=>card.iid === blockedArrival.iid);
assert.equal(blockedArrivedCharacter.currentFate, 4);
assert.equal(effectiveCost(state, blockedArrivedCharacter), 1);
assert(blockedArrivalCtx.events.some(event=>
  event.type === 'STATUS_REMOVED' && event.reason === 'SOURCE_SUPPRESSED'
));

state = newState('P4LARGEALEXANDER', ['35', '11', '32', '59'], ['32']);
const alexander = putOnBoard(state, 0, '35', {z:0, r:2, c:0});
putOnBoard(state, 0, '11', {z:0, r:2, c:1});
const alexanderSupporter = putOnBoard(state, 0, '32', {z:0, r:1, c:0});
const maroon = putOnBoard(state, 0, '59', {z:0, r:1, c:1});
assert.equal(effectiveFate(state, alexanderSupporter), 5);
assert.equal(effectiveFate(state, maroon), 5);
assert.equal(alexander.currentFate, 0);
assert.equal(effectiveFate(state, alexander), 10);
alexander.statuses.push('EFFECTS_SUPPRESSED');
assert.equal(effectiveFate(state, alexander), 0);

state = newState('P4LARGEPHIL', ['32'], ['46', '32']);
const phil = putOnBoard(state, 1, '46', {z:1, r:0, c:0});
result = reduceCommand(state, command(state, 'p0', 1, 'END_TURN'), {playerId:'p0'});
assert.equal(result.ok, true);
assert.equal(boardCard(result.state, phil.iid).currentFate, 6);
assert(result.events.some(event=>
  event.type === 'FATE_CHANGED' && event.reason === 'MONARCHIST_MANIFESTO'
));
state = result.state;
boardCard(state, phil.iid).statuses.push('EFFECTS_SUPPRESSED');
result = reduceCommand(state, command(state, 'p1', 2, 'END_TURN'), {playerId:'p1'});
assert.equal(result.ok, true);
state = result.state;
result = reduceCommand(state, command(state, 'p0', 3, 'END_TURN'), {playerId:'p0'});
assert.equal(result.ok, true);
assert.equal(boardCard(result.state, phil.iid).currentFate, 6);

state = newState(
  'P4LARGEBALLAD',
  ['87', '32', '32', '32', '32', '32', 'batch-character', 'batch-character'],
  ['32']
);
const balladTributeA = putOnBoard(state, 0, '32', {z:0, r:2, c:0});
const balladTributeB = putOnBoard(state, 0, '32', {z:0, r:2, c:1});
const firstLaterTribute = putOnBoard(state, 0, '32', {z:1, r:2, c:0});
const secondLaterTribute = putOnBoard(state, 0, '32', {z:1, r:2, c:1});
const kvetka = state.players[0].hand.find(card=>card.id === '87');
result = reduceCommand(
  state,
  command(state, 'p0', 1, 'CONSOLIDATE_CARD', {
    cardIid:kvetka.iid,
    tributeIids:[balladTributeA.iid, balladTributeB.iid],
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
const initialBalladStatus = result.state.statuses.find(status=>status.type === 'CONSOLIDATION_FATE_BONUS');
assert(initialBalladStatus);
assert.deepEqual(initialBalladStatus.affectedIids, [kvetka.iid], 'Kvetka must retain her music-note overlay while her Ballad status is active');
assert.equal(boardCard(result.state, kvetka.iid).currentFate, 6, 'Kvetka Ukulele must benefit from the Ballad created by her own consolidation');
state = result.state;
const firstBalladCharacter = state.players[0].hand.find(card=>card.id === 'batch-character');
result = reduceCommand(
  state,
  command(state, 'p0', 2, 'CONSOLIDATE_CARD', {
    cardIid:firstBalladCharacter.iid,
    tributeIids:[firstLaterTribute.iid],
    destination:{z:1, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(boardCard(result.state, firstBalladCharacter.iid).currentFate, 7);
assert(result.state.statuses.find(status=>status.type === 'CONSOLIDATION_FATE_BONUS')?.affectedIids.includes(firstBalladCharacter.iid), 'later Ballad targets must retain the music-note overlay');
state = result.state;
const endingSupporter = state.players[0].hand.find(card=>card.id === '32');
result = reduceCommand(
  state,
  command(state, 'p0', 3, 'SET_CARD', {
    cardIid:endingSupporter.iid,
    destination:{z:2, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.statuses.some(status=>status.type === 'CONSOLIDATION_FATE_BONUS'), false);
state = result.state;
const secondBalladCharacter = state.players[0].hand.find(card=>card.id === 'batch-character');
result = reduceCommand(
  state,
  command(state, 'p0', 4, 'CONSOLIDATE_CARD', {
    cardIid:secondBalladCharacter.iid,
    tributeIids:[secondLaterTribute.iid],
    destination:{z:1, r:2, c:1}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(boardCard(result.state, secondBalladCharacter.iid).currentFate, 4);
assertInvariants(result.state);

state = newState('P4LARGELUMBERJACK', ['92', '32', '76'], ['32']);
const lumberjack = putOnBoard(state, 0, '92', {z:0, r:2, c:0});
const suppressedResident = state.players[0].hand.find(card=>card.id === '32');
result = reduceCommand(
  state,
  command(state, 'p0', 1, 'SET_CARD', {
    cardIid:suppressedResident.iid,
    destination:{z:0, r:2, c:1}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
let suppressedEntry = {
  zone:'board',
  z:0,
  r:2,
  c:1,
  card:boardCard(result.state, suppressedResident.iid)
};
assert(suppressedEntry.card.statuses.includes('EFFECTS_SUPPRESSED'));
assert(suppressedEntry.card.statuses.includes('REINFORCEMENT:1'));
assert.equal(result.state.supporterEffectsActivated[0], 0);
assert.equal(canUseAsConsolidationTribute(result.state, suppressedEntry, 0).reinforcement, 2);
state = result.state;
const alpine = state.players[0].hand.find(card=>card.id === '76');
result = reduceCommand(
  state,
  command(state, 'p0', 2, 'SET_CARD', {
    cardIid:alpine.iid,
    destination:{z:0, r:2, c:2}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(boardCard(result.state, alpine.iid).currentFate, 5);
assert.equal(boardCard(result.state, alpine.iid).statuses.includes('EFFECTS_SUPPRESSED'), false);
state = result.state;
const lumberjackDiscardCtx = {state, events:[], ruleEvents:[]};
applyOperation(lumberjackDiscardCtx, {
  type:'DISCARD_CARD',
  targetIid:lumberjack.iid,
  sourceIid:lumberjack.iid,
  sourceController:0,
  reason:'LUMBERJACK_LEAVES'
});
suppressedEntry = {
  zone:'board',
  z:0,
  r:2,
  c:1,
  card:boardCard(state, suppressedResident.iid)
};
assert.equal(canUseAsConsolidationTribute(state, suppressedEntry, 0).reinforcement, 2);
assertInvariants(state);

state = newState('P4LARGESPECTER', ['95'], ['32'], {maxTurns:20});
const specter = putOnBoard(state, 0, '95', {z:0, r:2, c:0});
for(let turnChange = 1; turnChange <= 14; turnChange += 1){
  const playerIndex = state.activePlayer;
  const playerId = state.players[playerIndex].id;
  result = reduceCommand(
    state,
    command(state, playerId, turnChange, 'END_TURN'),
    {playerId}
  );
  assert.equal(result.ok, true);
  state = result.state;
  if(turnChange === 1) assert.equal(boardCard(state, specter.iid).currentFate, 1);
  if(turnChange === 2) assert.equal(boardCard(state, specter.iid).currentFate, 2);
}
assert.equal(boardCard(state, specter.iid).currentFate, 7);
assert.equal(boardCard(state, specter.iid).counters.specterFateGains, 6);
assertInvariants(state);

state = newState(
  'P4LARGEBLOAT',
  ['97', '32'],
  ['batch-character', 'batch-character', '32', '32', '32', '32']
);
const politician = state.players[0].hand.find(card=>card.id === '97');
result = reduceCommand(
  state,
  command(state, 'p0', 1, 'SET_CARD', {
    cardIid:politician.iid,
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert(result.state.statuses.some(status=>
  status.type === 'CONSOLIDATION_COST_MODIFIER'
  && status.playerIndex === 1
  && status.remaining === 2
));
state = JSON.parse(stableStringify(result.state));
assertInvariants(state);
result = reduceCommand(state, command(state, 'p0', 2, 'END_TURN'), {playerId:'p0'});
assert.equal(result.ok, true);
state = result.state;
const bloatSupports = [
  putOnBoard(state, 1, '32', {z:0, r:0, c:0}),
  putOnBoard(state, 1, '32', {z:0, r:0, c:1}),
  putOnBoard(state, 1, '32', {z:1, r:0, c:0}),
  putOnBoard(state, 1, '32', {z:1, r:0, c:1})
];
const bloatCharacters = state.players[1].hand.filter(card=>card.id === 'batch-character');
assert.equal(effectiveConsolidationCost(state, bloatCharacters[0], 1), 2);
assert.equal(legalCommandTemplates(state, 1).some(template=>
  template.type === 'CONSOLIDATE_CARD'
  && template.payload.cardIid === bloatCharacters[0].iid
  && template.payload.tributeIids.length === 1
), false);
const rejected = reduceCommand(
  state,
  command(state, 'p1', 3, 'CONSOLIDATE_CARD', {
    cardIid:bloatCharacters[0].iid,
    tributeIids:[bloatSupports[0].iid],
    destination:{z:0, r:0, c:0}
  }),
  {playerId:'p1'}
);
assert.equal(rejected.ok, false);
assert.equal(rejected.rejection.code, 'INSUFFICIENT_REINFORCEMENT');
result = reduceCommand(
  state,
  command(state, 'p1', 4, 'CONSOLIDATE_CARD', {
    cardIid:bloatCharacters[0].iid,
    tributeIids:[bloatSupports[0].iid, bloatSupports[1].iid],
    destination:{z:0, r:0, c:0}
  }),
  {playerId:'p1'}
);
assert.equal(result.ok, true);
let bloatStatus = result.state.statuses.find(status=>status.type === 'CONSOLIDATION_COST_MODIFIER');
assert.equal(bloatStatus.remaining, 1);
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p1', 5, 'CONSOLIDATE_CARD', {
    cardIid:bloatCharacters[1].iid,
    tributeIids:[bloatSupports[2].iid, bloatSupports[3].iid],
    destination:{z:1, r:0, c:0}
  }),
  {playerId:'p1'}
);
assert.equal(result.ok, true);
bloatStatus = result.state.statuses.find(status=>status.type === 'CONSOLIDATION_COST_MODIFIER');
assert.equal(bloatStatus, undefined);
assertInvariants(result.state);

console.log('authoritative-v3 Phase 4 large-batch smoke test passed');
