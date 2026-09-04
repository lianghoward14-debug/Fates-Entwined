import assert from 'node:assert/strict';
import {
  applyOperation,
  activeHandLimit,
  assertInvariants,
  createInitialState,
  projectStateForPlayer,
  reduceCommand
} from '../../shared/engine/index.mjs';

const DEFINITIONS = [
  {id:'07', name:'Maja Kaminska', type:'Initiator', aff:'third_great_war', fate:3, cost:1, rarity:'star'},
  {id:'27', name:'Kazumi', type:'Initiator', aff:'eventide', fate:1, cost:1, rarity:'square'},
  {id:'32', name:'Temecula Resident', type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'circle'},
  {id:'70', name:'Wine Country Guerilla', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0, rarity:'circle'},
  {id:'74', name:'Selva Islands Pirate', type:'Supporter', aff:'eventide', fate:1, cost:0, rarity:'circle'},
  {id:'bh03', name:'Ali, The Indomitable', type:'Initiator', aff:'eventide', fate:5, cost:3, rarity:'star'}
];

function stateFor(matchId, player0, player1 = ['32']){
  return createInitialState({
    matchId,
    seed:`${matchId}:seed`,
    handSize:0,
    maxTurns:20,
    cardDefinitions:DEFINITIONS,
    players:[{id:'p0', deckIds:player0}, {id:'p1', deckIds:player1}]
  });
}

function command(state, playerId, sequence, type, payload = {}){
  return {
    commandId:`${playerId}:${sequence}`,
    matchId:state.matchId,
    expectedRevision:state.revision,
    type,
    payload
  };
}

function moveToBoard(state, playerIndex, cardId, destination){
  const deck = state.players[playerIndex].deck;
  const index = deck.findIndex(card=>String(card.id) === String(cardId));
  assert.notEqual(index, -1, `fixture must contain ${cardId}`);
  const [card] = deck.splice(index, 1);
  card.controller = playerIndex;
  state.board[destination.z][destination.r][destination.c] = card;
  return card;
}

// Maja: the real deck-set action may transfer zero to three distinct
// Supporters. Its independent +2 placement status must already be visible
// while the optional search prompt is open.
let state = stateFor('P7-PRESENT-MAJA', ['07', '32', '32', '32', '74']);
const maja = state.players[0].deck.find(card=>card.id === '07');
let result = reduceCommand(state, command(state, 'p0', 1, 'SET_CARD_FROM_DECK', {
  cardIid:maja.iid,
  destination:{z:0, r:2, c:0}
}), {playerId:'p0'});
assert.equal(result.ok, true);
assert.equal(result.status, 'NEEDS_CHOICE');
assert.equal(result.prompt.type, 'CARD_SELECTION');
assert.equal(result.prompt.min, 0);
assert.equal(result.prompt.max, 3);
assert.equal(result.prompt.cancellable, true);
assert.equal(result.state.extraSupportersThisTurn[0], 2);
assert.equal(result.state.statuses.filter(status=>status.type === 'MAJA_EXTRA_SUPPORTERS').length, 1, 'Oblique Order status must exist before the optional search is answered');
const selectedIids = result.prompt.eligibleIids.slice(0, 3);
assert.equal(selectedIids.length, 3);
state = result.state;
result = reduceCommand(state, command(state, 'p0', 2, 'ANSWER_PROMPT', {
  promptId:state.pendingPrompt.promptId,
  selectedIids
}), {playerId:'p0'});
assert.equal(result.ok, true);
const majaTransfers = result.events.filter(event=>
  event.type === 'CARD_TRANSFERRED'
  && String(event.from) === 'deck'
  && String(event.to) === 'hand'
);
assert.equal(majaTransfers.length, 3, 'Maja must expose exactly three sequential hand-arrival presentation events');
assert.deepEqual(majaTransfers.map(event=>event.cardIid), selectedIids, 'Maja presentation order must match the resolved selection order');
assert(majaTransfers.every(event=>String(event.semanticSourceCardId || '') === '07'), 'every Maja transfer must retain its semantic presentation source');
assert(selectedIids.every(iid=>Number(result.state.players[0].hand.find(card=>card.iid === iid)?.currentFate) === 5), 'each selected base-1 Supporter must have +4 permanent Fate');
assert.equal(result.state.extraSupportersThisTurn[0], 2);
assert.equal(result.state.statuses.filter(status=>status.type === 'MAJA_EXTRA_SUPPORTERS').length, 1);
assert.equal(result.state.statuses.some(status=>status.type === 'SELVA_EXTRA_SUPPORTER'), false, 'Maja counter changes must never masquerade as Selva');
assertInvariants(result.state);

// One supporter is a legal answer; the search must not force all three.
state = stateFor('P7-PRESENT-MAJA-ONE', ['07', '32', '32', '32', '74']);
const oneMaja = state.players[0].deck.find(card=>card.id === '07');
result = reduceCommand(state, command(state, 'p0', 1, 'SET_CARD_FROM_DECK', {
  cardIid:oneMaja.iid,
  destination:{z:0, r:2, c:0}
}), {playerId:'p0'});
const selectedOne = result.prompt.eligibleIids[0];
state = result.state;
result = reduceCommand(state, command(state, 'p0', 2, 'ANSWER_PROMPT', {
  promptId:state.pendingPrompt.promptId,
  selectedIids:[selectedOne]
}), {playerId:'p0'});
assert.equal(result.ok, true);
assert.equal(result.events.filter(event=>event.type === 'CARD_TRANSFERRED' && event.reason === 'OBLIQUE_ORDER').length, 1);
assert.equal(Number(result.state.players[0].hand.find(card=>card.iid === selectedOne)?.currentFate), 5);
assert.equal(result.state.extraSupportersThisTurn[0], 2);

// Cancelling is the zero-card answer and must preserve the independent status.
state = stateFor('P7-PRESENT-MAJA-ZERO', ['07', '32', '32', '74']);
const zeroMaja = state.players[0].deck.find(card=>card.id === '07');
result = reduceCommand(state, command(state, 'p0', 1, 'SET_CARD_FROM_DECK', {
  cardIid:zeroMaja.iid,
  destination:{z:0, r:2, c:0}
}), {playerId:'p0'});
state = result.state;
result = reduceCommand(state, command(state, 'p0', 2, 'ANSWER_PROMPT', {
  promptId:state.pendingPrompt.promptId,
  cancel:true
}), {playerId:'p0'});
assert.equal(result.ok, true);
assert.equal(result.events.some(event=>event.type === 'CARD_TRANSFERRED' && event.reason === 'OBLIQUE_ORDER'), false);
assert.equal(result.events.some(event=>event.type === 'PROMPT_CANCELLED'), true);
assert.equal(result.state.extraSupportersThisTurn[0], 2);
assert.equal(result.state.statuses.filter(status=>status.type === 'MAJA_EXTRA_SUPPORTERS').length, 1);
assertInvariants(result.state);

// Kazumi: one activation is one effect activation followed by exactly three
// ordered draw events, which the presentation adapter must animate separately.
// Only the first card carries activatedEffect=true so draw-trigger landscapes
// fire once for the draw effect rather than once per card.
state = stateFor('P7-PRESENT-KAZUMI', ['27', '32', '32', '32', '74']);
const kazumi = moveToBoard(state, 0, '27', {z:0, r:2, c:0});
result = reduceCommand(state, command(state, 'p0', 1, 'ACTIVATE_EFFECT', {
  sourceIid:kazumi.iid
}), {playerId:'p0'});
assert.equal(result.ok, true);
assert.equal(result.events.filter(event=>event.type === 'DRAW_EFFECT_ACTIVATED').length, 1);
const kazumiDraws = result.events.filter(event=>event.type === 'CARD_DRAWN' && String(event.sourceIid) === String(kazumi.iid));
assert.equal(kazumiDraws.length, 3, 'Kazumi must produce exactly three draw-animation inputs');
assert(kazumiDraws.every(event=>String(event.sourceIid) === String(kazumi.iid)));
assert.equal(new Set(kazumiDraws.map(event=>event.cardIid)).size, 3);
assert.equal(kazumiDraws.filter(event=>event.activatedEffect === true).length, 1);
assertInvariants(result.state);

// Selva while active: the source-specific status is visible immediately and
// expires when that controller ends the turn.
state = stateFor('P7-PRESENT-SELVA-ACTIVE', ['74', '32'], ['32', '32']);
const activeSelva = state.players[0].deck.find(card=>card.id === '74');
state.players[0].deck = [activeSelva, ...state.players[0].deck.filter(card=>card.iid !== activeSelva.iid)];
let ctx = {state, events:[], ruleEvents:[]};
applyOperation(ctx, {type:'DRAW_CARD', playerIndex:0, count:1});
let selvaStatus = state.statuses.find(status=>status.type === 'SELVA_EXTRA_SUPPORTER');
assert(selvaStatus);
assert.equal(selvaStatus.activeNow, true);
assert.equal(selvaStatus.remainingOwnerTurns, 1);
assert.equal(state.extraSupportersThisTurn[0], 1);
result = reduceCommand(state, command(state, 'p0', 1, 'END_TURN'), {playerId:'p0'});
assert.equal(result.ok, true);
assert.equal(result.state.statuses.some(status=>status.type === 'SELVA_EXTRA_SUPPORTER' && Number(status.playerIndex) === 0), false);

// Selva while inactive: it is queued without a premature banner, becomes active
// at that player's next turn start, and then has a one-owner-turn lifetime.
state = stateFor('P7-PRESENT-SELVA-QUEUED', ['32', '32'], ['74', '32']);
const queuedSelva = state.players[1].deck.find(card=>card.id === '74');
state.players[1].deck = [queuedSelva, ...state.players[1].deck.filter(card=>card.iid !== queuedSelva.iid)];
ctx = {state, events:[], ruleEvents:[]};
applyOperation(ctx, {type:'DRAW_CARD', playerIndex:1, count:1});
selvaStatus = state.statuses.find(status=>status.type === 'SELVA_EXTRA_SUPPORTER');
assert(selvaStatus);
assert.equal(selvaStatus.activeNow, false);
assert.equal(selvaStatus.remainingOwnerTurns, null);
assert.equal(state.queuedExtraSupporters[1], 1);
result = reduceCommand(state, command(state, 'p0', 1, 'END_TURN'), {playerId:'p0'});
assert.equal(result.ok, true);
selvaStatus = result.state.statuses.find(status=>status.type === 'SELVA_EXTRA_SUPPORTER');
assert(selvaStatus);
assert.equal(selvaStatus.activeNow, true);
assert.equal(selvaStatus.remainingOwnerTurns, 1);
assert.equal(result.state.queuedExtraSupporters[1], 0);
assert.equal(result.state.extraSupportersThisTurn[1], 1);
assertInvariants(result.state);

// Opening-hand arrival parity: the starting player receives Selva immediately;
// coin-order matches activate it only after the winner chooses the starter.
state = createInitialState({
  matchId:'P7-OPENING-SELVA-ACTIVE', seed:'opening-selva-active', handSize:1,
  activePlayer:0, cardDefinitions:DEFINITIONS,
  players:[{id:'p0', deckIds:['74']}, {id:'p1', deckIds:['32']}]
});
selvaStatus = state.statuses.find(status=>status.type === 'SELVA_EXTRA_SUPPORTER');
assert.equal(selvaStatus?.activeNow, true);
assert.equal(state.extraSupportersThisTurn[0], 1);
assert.equal(state.queuedExtraSupporters[0], 0);

state = createInitialState({
  matchId:'P7-OPENING-SELVA-COIN', seed:'opening-selva-coin', handSize:1,
  requireTurnChoice:true, coinWinner:0, cardDefinitions:DEFINITIONS,
  players:[{id:'p0', deckIds:['32']}, {id:'p1', deckIds:['74']}]
});
assert.equal(state.extraSupportersThisTurn[1], 0);
assert.equal(state.queuedExtraSupporters[1], 1);
result = reduceCommand(state, command(state, 'p0', 1, 'CHOOSE_TURN_ORDER', {goFirst:false}), {playerId:'p0'});
assert.equal(result.ok, true);
assert.equal(result.state.activePlayer, 1);
assert.equal(result.state.extraSupportersThisTurn[1], 1);
assert.equal(result.state.queuedExtraSupporters[1], 0);
assert.equal(result.state.statuses.find(status=>status.type === 'SELVA_EXTRA_SUPPORTER')?.activeNow, true);

// Ali's opening-hand transfer uses the same ownership, immunity and hand-limit
// metadata as a later hand arrival.
state = createInitialState({
  matchId:'P7-OPENING-ALI', seed:'opening-ali', handSize:1,
  activePlayer:0, cardDefinitions:DEFINITIONS,
  players:[{id:'p0', deckIds:['bh03']}, {id:'p1', deckIds:['32']}]
});
const openingAli = state.players[1].hand.find(card=>card.id === 'bh03');
assert(openingAli, 'opening Ali must transfer into the other hand');
assert.equal(openingAli.counters.aliTransferredFrom, 0);
assert(openingAli.statuses.includes('OPPONENT_HAND_LIMIT_6'));
assert(openingAli.statuses.includes('HAND_EFFECT_IMMUNE'));
assert.equal(openingAli.counters.aliHandLimitPendingUntilTurnStart, true);

// An opening Ali transfer must never open the six-card discard panel during
// the coin sequence or during the other player's first turn. It becomes
// mandatory exactly when the recipient's first turn starts.
state = createInitialState({
  matchId:'P7-OPENING-ALI-DEFERRED', seed:'opening-ali-deferred', handSize:13,
  requireTurnChoice:true, coinWinner:0, cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['bh03']},
    {id:'p1', deckIds:Array.from({length:13}, ()=> '32')}
  ]
});
assert.equal(state.phase, 'coin');
assert.equal(state.pendingHandLimit, null);
assert.equal(activeHandLimit(state, 1), 12, 'Ali cap remains dormant before recipient turn');
result = reduceCommand(state, command(state, 'p0', 1, 'CHOOSE_TURN_ORDER', {goFirst:true}), {playerId:'p0'});
assert.equal(result.ok, true);
assert.equal(result.state.activePlayer, 0);
assert.equal(result.state.pendingHandLimit, null, 'other player turn must not receive Ali discard prompt');
state = result.state;
result = reduceCommand(state, command(state, 'p0', 2, 'END_TURN'), {playerId:'p0'});
assert.equal(result.ok, true);
assert.equal(result.state.activePlayer, 1);
assert.deepStrictEqual(result.state.pendingHandLimit, {playerIndex:1, limit:6, required:8});
assert(result.events.some(event=>event.type === 'ALI_HAND_LIMIT_ACTIVATED' && event.playerIndex === 1));

state = createInitialState({
  matchId:'P7-OPENING-ALI-STARTS', seed:'opening-ali-starts', handSize:7,
  requireTurnChoice:true, coinWinner:0, cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['bh03']},
    {id:'p1', deckIds:Array.from({length:7}, ()=> '32')}
  ]
});
result = reduceCommand(state, command(state, 'p0', 1, 'CHOOSE_TURN_ORDER', {goFirst:false}), {playerId:'p0'});
assert.equal(result.ok, true);
assert.equal(result.state.activePlayer, 1);
assert.deepStrictEqual(result.state.pendingHandLimit, {playerIndex:1, limit:6, required:2});

// Wine Country's infiltration summary is public canonical status, so both
// clients render the same persistent banner despite the hand itself remaining
// private to its holder.
state = stateFor('P7-PRESENT-WINE-PUBLIC', ['70', '32'], ['32', '32']);
const wine = moveToBoard(state, 0, '70', {z:0, r:2, c:0});
ctx = {state, events:[], ruleEvents:[]};
applyOperation(ctx, {type:'DISCARD_CARD', targetIid:wine.iid, sourceIid:wine.iid, sourceController:0});
const wineStatus = state.statuses.find(status=>status.type === 'WINE_COUNTRY_GUERILLA_INFILTRATION');
assert(wineStatus);
assert.equal(wineStatus.playerIndex, 1);
assert.equal(wineStatus.sourceController, 0);
assert(projectStateForPlayer(state, 0).statuses.some(status=>status.statusId === wineStatus.statusId));
assert(projectStateForPlayer(state, 1).statuses.some(status=>status.statusId === wineStatus.statusId));
assertInvariants(state);
result = reduceCommand(state, command(state, 'p0', 1, 'END_TURN'), {playerId:'p0'});
assert.equal(result.ok, true);
assert.equal(result.state.statuses.find(status=>status.statusId === wineStatus.statusId)?.remaining, 4);
const infiltratingWine = result.state.players[1].hand.find(card=>card.iid === wine.iid);
assert.equal(infiltratingWine?.counters?.guerillaTurnsRemaining, 4);
state = result.state;
result = reduceCommand(state, command(state, 'p1', 2, 'END_TURN'), {playerId:'p1'});
assert.equal(result.ok, true);
assert.equal(result.state.statuses.find(status=>status.statusId === wineStatus.statusId)?.remaining, 4, 'Wine public status must not decrement again at turn end');

console.log('authoritative-v3 Phase 7 source-specific presentation status smoke test passed');
