import assert from 'node:assert/strict';
import {
  createInitialState,
  projectStateForPlayer,
  reduceCommand
} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const DEFINITIONS = [
  {id:'05', name:'17th British Regiment', type:'Supporter', aff:'third_great_war', fate:1, cost:0, rarity:'circle'},
  {id:'06', name:'Jorge Alvarez', type:'Initiator', aff:'eventide', fate:1, cost:1, rarity:'square'},
  {id:'13', name:'Johnathan Kirby', type:'Initiator', aff:'third_great_war', fate:2, cost:1, rarity:'square'},
  {id:'27', name:'Kazumi', type:'Initiator', aff:'eventide', fate:1, cost:1, rarity:'star'},
  {id:'29', name:'Dylan Kirby', type:'Initiator', aff:'third_great_war', fate:3, cost:2, rarity:'square'},
  {id:'31', name:'Oathbound Noble Fighter', type:'Supporter', aff:'eventide', fate:1, cost:0, rarity:'circle'},
  {id:'32', name:'Temecula Resident', type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'circle'},
  {id:'40', name:'Christopher Erbs', type:'Improvisor', aff:'expanded_worlds', fate:6, cost:2, rarity:'square'},
  {id:'48', name:'Cosmic GF', type:'Initiator', aff:'expanded_worlds', fate:3, cost:2, rarity:'square'},
  {id:'58', name:'Crossroads Worker', type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'circle'},
  {id:'60', name:'IB Student', type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'circle'},
  {id:'68', name:'Great Oak High Schooler', type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'circle'},
  {id:'76', name:'ALPINE Infantry', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0, rarity:'circle'}
];

function stateFor(matchId, player0){
  return createInitialState({
    matchId,
    seed:`${matchId}-seed`,
    handSize:0,
    cardDefinitions:DEFINITIONS,
    players:[
      {id:'p0', deckIds:player0},
      {id:'p1', deckIds:['32']}
    ]
  });
}

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

let state = stateFor('P4SEARCH06', ['06', '05', '27', '32']);
const jorge = moveToBoard(state, '06', {z:0, r:2, c:0});
let result = reduceCommand(
  state,
  command(state, 'p0', 1, 'ACTIVATE_EFFECT', {sourceIid:jorge.iid}),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'CARD_SELECTION');
assert.equal(result.prompt.eligibleCards.some(card=>card.id === '27'), false, 'Jorge cannot search Star cards');
const searched = result.prompt.eligibleCards.find(card=>card.id === '05');
assert(searched);
const opponentProjection = projectStateForPlayer(result.state, 1);
assert.equal(Object.hasOwn(opponentProjection.pendingPrompt, 'eligibleCards'), false, 'deck search choices must remain private');
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 2, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIid:searched.iid
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.players[0].hand.some(card=>card.iid === searched.iid), true);
assert(result.events.some(event=>event.type === 'CARD_TRANSFERRED'));
assert(result.events.some(event=>event.type === 'DECK_SEARCHED'));

state = stateFor('P4SEARCH13', ['13', '05', '31', '32', '27']);
const johnathan = moveToBoard(state, '13', {z:0, r:2, c:0});
result = reduceCommand(
  state,
  command(state, 'p0', 3, 'ACTIVATE_EFFECT', {sourceIid:johnathan.iid}),
  {playerId:'p0'}
);
assert.equal(result.prompt.type, 'CARD_SELECTION');
assert.equal(result.prompt.max, 2);
assert(result.prompt.eligibleCards.every(card=>card.type === 'Supporter'));
const twoSupporters = result.prompt.eligibleIids.slice(0, 2);
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 4, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIids:twoSupporters
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert(twoSupporters.every(iid=>result.state.players[0].hand.some(card=>card.iid === iid)));

state = stateFor('P4RECOVER58', ['58', '05', '32']);
const workerIndex = state.players[0].deck.findIndex(card=>card.id === '58');
const worker = state.players[0].deck.splice(workerIndex, 1)[0];
state.players[0].hand.push(worker);
const recoveredIndex = state.players[0].deck.findIndex(card=>card.id === '05');
const recovered = state.players[0].deck.splice(recoveredIndex, 1)[0];
state.players[0].discard.push(recovered);
result = reduceCommand(
  state,
  command(state, 'p0', 5, 'SET_CARD', {
    cardIid:worker.iid,
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.prompt.type, 'CARD_SELECTION');
assert.deepStrictEqual(result.prompt.eligibleIids, [recovered.iid]);
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 6, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIid:recovered.iid
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.players[0].hand.some(card=>card.iid === recovered.iid), true);
assert.equal(result.events.some(event=>event.type === 'DECK_SEARCHED'), false, 'discard recovery is not a deck search');

state = stateFor('P4SEARCH48', ['48', '40', '76']);
const cosmic = moveToBoard(state, '48', {z:0, r:2, c:0});
const discardCandidateIndex = state.players[0].deck.findIndex(card=>card.id === '76');
const discardCandidate = state.players[0].deck.splice(discardCandidateIndex, 1)[0];
state.players[0].discard.push(discardCandidate);
result = reduceCommand(
  state,
  command(state, 'p0', 7, 'ACTIVATE_EFFECT', {sourceIid:cosmic.iid}),
  {playerId:'p0'}
);
assert.equal(result.prompt.eligibleCards.length, 1);
assert.equal(result.prompt.eligibleCards[0].id, '40');
const deckCandidate = result.prompt.eligibleCards[0];
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 8, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIid:deckCandidate.iid
  }),
  {playerId:'p0'}
);
assert.equal(result.status, 'NEEDS_CHOICE');
assert.equal(result.prompt.eligibleCards[0].id, '76');
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 9, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIid:discardCandidate.iid
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.players[0].hand.some(card=>card.iid === deckCandidate.iid), true);
assert.equal(result.state.players[0].hand.some(card=>card.iid === discardCandidate.iid), true);

console.log('authoritative-v3 Phase 4 draw/search family smoke test passed');
