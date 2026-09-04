import assert from 'node:assert/strict';
import {
  createInitialState,
  reduceCommand,
  stableStringify
} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const DEFINITIONS = [
  {id:'14', name:'Alondra', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0, rarity:'circle'},
  {id:'03', name:'Howard', type:'Initiator', aff:'reality', fate:5, cost:2, rarity:'star'},
  {id:'16', name:'MINAE Death Squad', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0, rarity:'circle'},
  {id:'32', name:'Temecula Resident', type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'circle'},
  {id:'38', name:'Jake', type:'Dauntless', aff:'reality', fate:1, cost:3, rarity:'triangle'},
  {id:'42', name:'West German Soldier', type:'Supporter', aff:'third_great_war', fate:1, cost:0, rarity:'circle'},
  {id:'62', name:'Berkeley Homeless', type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'circle'},
  {id:'76', name:'ALPINE Infantry', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0, rarity:'circle'},
  {id:'80', name:'Apparition of Berkeley', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0, rarity:'circle'}
];

function stateFor(matchId, player0, player1 = ['32']){
  return createInitialState({
    matchId,
    seed:`${matchId}-seed`,
    handSize:0,
    cardDefinitions:DEFINITIONS,
    players:[
      {id:'p0', deckIds:player0},
      {id:'p1', deckIds:player1}
    ]
  });
}

function takeCard(state, playerIndex, cardId, destinationPile = 'hand'){
  for(const pile of ['hand', 'deck', 'discard']){
    const index = state.players[playerIndex][pile].findIndex(card=>card.id === cardId);
    if(index < 0) continue;
    const card = state.players[playerIndex][pile].splice(index, 1)[0];
    state.players[playerIndex][destinationPile].push(card);
    return card;
  }
  throw new Error(`missing ${cardId} for player ${playerIndex}`);
}

function moveToBoard(state, playerIndex, cardId, destination){
  const card = takeCard(state, playerIndex, cardId, 'hand');
  state.players[playerIndex].hand.pop();
  card.controller = playerIndex;
  state.board[destination.z][destination.r][destination.c] = card;
  return card;
}

// MINAE offers only mutable opponent Supporters in its zone, and the prompt
// continuation survives canonical serialization.
let state = stateFor('P4DISCARD16', ['16'], ['32', '76']);
const minae = takeCard(state, 0, '16');
const minaeTarget = moveToBoard(state, 1, '32', {z:0, r:0, c:0});
const immuneSupporter = moveToBoard(state, 1, '76', {z:0, r:0, c:1});
let result = reduceCommand(
  state,
  command(state, 'p0', 1, 'SET_CARD', {
    cardIid:minae.iid,
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'BOARD_TARGET');
assert.deepStrictEqual(result.prompt.eligibleIids, [minaeTarget.iid]);
assert.equal(result.prompt.eligibleIids.includes(immuneSupporter.iid), false);
state = JSON.parse(stableStringify(result.state));
result = reduceCommand(
  state,
  command(state, 'p0', 2, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIid:minaeTarget.iid
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.board[0][0][0], null);
assert(result.state.players[1].discard.some(card=>card.iid === minaeTarget.iid));
assert(result.events.some(event=>
  event.type === 'CARD_DISCARDED'
  && event.cardIid === minaeTarget.iid
  && event.reason === 'MINAE_DEATH_SQUAD'
));

// Optional when-set discard effects resolve cleanly when no legal target exists.
state = stateFor('P4DISCARD16NONE', ['16'], ['03']);
const emptyMinae = takeCard(state, 0, '16');
moveToBoard(state, 1, '03', {z:0, r:0, c:0});
result = reduceCommand(
  state,
  command(state, 'p0', 3, 'SET_CARD', {
    cardIid:emptyMinae.iid,
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt, null);
assert(result.events.some(event=>
  event.type === 'EFFECT_SKIPPED'
  && event.sourceIid === emptyMinae.iid
  && event.reason === 'NO_LEGAL_TARGETS'
));
assert.equal(result.events.some(event=>event.type === 'EFFECT_ACTIVATED'), false);
assert.equal(result.events.some(event=>event.type === 'EFFECT_RESOLVED'), false);

// Jake sacrifices a controlled Supporter anywhere on the field, gains 4 Fate,
// and cannot resolve again in the same authoritative turn.
state = stateFor('P4DISCARD38', ['38', '32', '76']);
const jake = moveToBoard(state, 0, '38', {z:0, r:2, c:0});
const jakeSacrifice = moveToBoard(state, 0, '32', {z:2, r:2, c:0});
const immutableSacrifice = moveToBoard(state, 0, '76', {z:1, r:2, c:0});
result = reduceCommand(
  state,
  command(state, 'p0', 4, 'ACTIVATE_EFFECT', {sourceIid:jake.iid}),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert(result.prompt.eligibleIids.includes(jakeSacrifice.iid));
assert.equal(result.prompt.eligibleIids.includes(immutableSacrifice.iid), false);
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 5, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIid:jakeSacrifice.iid
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.board[0][2][0].currentFate, 5);
assert(result.state.players[0].discard.some(card=>card.iid === jakeSacrifice.iid));
assert.deepStrictEqual(
  result.events.filter(event=>['CARD_DISCARDED', 'FATE_CHANGED'].includes(event.type)).map(event=>event.type),
  ['CARD_DISCARDED', 'FATE_CHANGED']
);
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 6, 'ACTIVATE_EFFECT', {sourceIid:jake.iid}),
  {playerId:'p0'}
);
assert.equal(result.ok, false);
assert.equal(result.rejection.code, 'USE_LIMIT_REACHED');

// West German Soldier draws two, then requires one atomic batch containing
// exactly the lesser of two and the current hand size.
state = stateFor('P4DISCARD42', ['42', '32', '32']);
const westGerman = takeCard(state, 0, '42');
result = reduceCommand(
  state,
  command(state, 'p0', 7, 'SET_CARD', {
    cardIid:westGerman.iid,
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'HAND_SELECTION');
assert.equal(result.prompt.min, 2);
assert.equal(result.prompt.max, 2);
const forcedDiscards = [...result.prompt.eligibleIids];
const forcedState = result.state;
result = reduceCommand(
  forcedState,
  command(forcedState, 'p0', 8, 'ANSWER_PROMPT', {
    promptId:forcedState.pendingPrompt.promptId,
    selectedIids:[forcedDiscards[0]]
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, false);
assert.equal(result.rejection.code, 'INVALID_CHOICE');
assert.equal(forcedState.players[0].discard.length, 0, 'partial batch answers must not discard anything');
state = forcedState;
result = reduceCommand(
  state,
  command(state, 'p0', 9, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIids:forcedDiscards
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.players[0].hand.length, 0);
assert.equal(result.state.players[0].discard.length, 2);
assert.equal(result.events.filter(event=>event.type === 'CARD_DISCARDED').length, 2);

state = stateFor('P4DISCARD42IMMUNE', ['42', '76', '32']);
const immutableWestGermanCost = state.players[0].deck.find(card=>card.id === '76');
const mutableWestGermanCost = state.players[0].deck.find(card=>card.id === '32');
const filteringWestGerman = takeCard(state, 0, '42');
result = reduceCommand(
  state,
  command(state, 'p0', 10, 'SET_CARD', {
    cardIid:filteringWestGerman.iid,
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'HAND_SELECTION');
assert.deepEqual(result.prompt.eligibleIids, [mutableWestGermanCost.iid]);
assert.equal(result.prompt.eligibleIids.includes(immutableWestGermanCost.iid), false);
assert.equal(result.prompt.min, 1, 'exact-up-to-available must count only legal discard targets');
assert.equal(result.prompt.max, 1);

// Apparition's selected discard and two-card activated draw resolve in one
// frame, with no draw if the optional selection is declined.
state = stateFor('P4DISCARD80', ['80', '03', '32', '32']);
const apparitionCharacter = moveToBoard(state, 0, '03', {z:1, r:2, c:0});
const apparition = takeCard(state, 0, '80');
result = reduceCommand(
  state,
  command(state, 'p0', 10, 'SET_CARD', {
    cardIid:apparition.iid,
    destination:{z:1, r:2, c:1}
  }),
  {playerId:'p0'}
);
assert.equal(result.prompt.type, 'BOARD_TARGET');
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 11, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIid:apparitionCharacter.iid
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert(result.state.players[0].discard.some(card=>card.iid === apparitionCharacter.iid));
assert.equal(result.state.players[0].hand.length, 2);
assert.equal(result.events.filter(event=>event.type === 'CARD_DRAWN').length, 2);

// Automatic multi-card discards use the same Berkeley surcharge continuation
// as direct targeted discards instead of rejecting the parent set command.
state = stateFor('P4DISCARDBERKELEYMASS', ['14', '32', '42'], ['62']);
const alondra = takeCard(state, 0, '14');
takeCard(state, 0, '32');
takeCard(state, 0, '42');
const massBerkeley = moveToBoard(state, 1, '62', {z:0, r:0, c:0});
result = reduceCommand(
  state,
  command(state, 'p0', 14, 'SET_CARD', {
    cardIid:alondra.iid,
    destination:{z:0, r:1, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'HAND_SELECTION');
assert.equal(result.prompt.min, 2);
assert.equal(result.prompt.max, 2);
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 15, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIids:[...state.pendingPrompt.eligibleIids]
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert(result.state.players[1].discard.some(card=>card.iid === massBerkeley.iid));

console.log('authoritative-v3 Phase 4 discard/removal family smoke test passed');
