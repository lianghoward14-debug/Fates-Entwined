import assert from 'node:assert/strict';
import {
  assertInvariants,
  createInitialState,
  effectiveReinforcement,
  findBoardCard,
  reduceCommand,
  stableStringify
} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const DEFINITIONS = [
  {id:'09', name:'United Nations 5th Army', type:'Supporter', aff:'third_great_war', fate:1, cost:0},
  {id:'32', name:'Temecula Resident', type:'Supporter', aff:'reality', fate:1, cost:0},
  {id:'custom-character', name:'Custom Character', type:'Initiator', aff:'reality', fate:4, cost:2}
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
  matchId:'P4CUSTOM09',
  seed:'p4-custom-seed',
  handSize:99,
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['09', 'custom-character']},
    {id:'p1', deckIds:['32']}
  ]
});
const army = putOnBoard(state, 0, '09', {z:0, r:2, c:0});
assert.equal(effectiveReinforcement(state, findBoardCard(state, army.iid), 0), 2);
army.statuses.push('EFFECTS_SUPPRESSED');
assert.equal(
  effectiveReinforcement(state, findBoardCard(state, army.iid), 0),
  2,
  'the printed reinforcement value is intrinsic rather than an activated effect'
);
const character = state.players[0].hand.find(card=>card.id === 'custom-character');
let result = reduceCommand(
  state,
  command(state, 'p0', 1, 'CONSOLIDATE_CARD', {
    cardIid:character.iid,
    tributeIids:[army.iid],
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.board[0][2][0].iid, character.iid);
assert.equal(result.state.players[0].discard.some(card=>card.iid === army.iid), true);
assertInvariants(result.state);

state = createInitialState({
  matchId:'P4CUSTOM09LANDSCAPE',
  seed:'p4-custom-landscape',
  handSize:99,
  landscapeId:'igb10',
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['09']},
    {id:'p1', deckIds:['32']}
  ]
});
const landscapeArmy = putOnBoard(state, 0, '09', {z:0, r:2, c:0});
assert.equal(
  effectiveReinforcement(state, findBoardCard(state, landscapeArmy.iid), 0),
  3,
  'the intrinsic value and eligible landscape bonus must compose in one query'
);
landscapeArmy.controller = 1;
assert.equal(effectiveReinforcement(state, findBoardCard(state, landscapeArmy.iid), 0), 0);
assert.equal(effectiveReinforcement(state, findBoardCard(state, landscapeArmy.iid), 1), 3);

state = JSON.parse(stableStringify(state));
assertInvariants(state);
assert.equal(effectiveReinforcement(state, findBoardCard(state, landscapeArmy.iid), 1), 3);

console.log('authoritative-v3 Phase 4 custom-effects family smoke test passed');
