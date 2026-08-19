import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {
  assertInvariants,
  createInitialState,
  legalCommandTemplates,
  reduceCommand
} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const require = createRequire(import.meta.url);
const DEFINITIONS = getActiveDefinitions();
const SUPPORTERS = DEFINITIONS.filter(card=>String(card.type || '') === 'Supporter');

function getActiveDefinitions(){
  const {getCardCatalog} = require('../fate-card-catalog.js');
  return getCardCatalog().cards
    .filter(card=>card.retired !== true && card.temporarilyDisabled !== true)
    .map(card=>({...card}));
}

function removeCard(player, predicate){
  for(const pileName of ['hand','deck','discard']){
    const pile = player[pileName];
    const index = pile.findIndex(predicate);
    if(index >= 0) return pile.splice(index, 1)[0];
  }
  throw new Error('fixture card was not found');
}

function prepareFixture(targetIds, suffix){
  const ids = ['13', '32', '27', ...targetIds];
  if(targetIds.includes('32')) ids.push('32');
  const state = createInitialState({
    matchId:`P7JOHNATHAN${suffix}`,
    seed:`p7-johnathan-${suffix}`,
    handSize:99,
    activePlayer:0,
    cardDefinitions:DEFINITIONS,
    players:[
      {id:'p0', deckIds:ids},
      {id:'p1', deckIds:['65','32','32','32']}
    ]
  });
  const player = state.players[0];
  const tribute = removeCard(player, card=>String(card.id) === '32');
  tribute.controller = 0;
  state.board[0][2][0] = tribute;

  const targetCards = targetIds.map(id=>removeCard(player, card=>String(card.id) === String(id)));
  player.deck.push(...targetCards);
  const nonSupporter = removeCard(player, card=>String(card.id) === '27');
  player.deck.push(nonSupporter);

  const johnathan = player.hand.find(card=>String(card.id) === '13');
  assert(johnathan, 'Johnathan must begin in hand');
  const set = legalCommandTemplates(state, 0).find(item=>
    ['SET_CARD','CONSOLIDATE_CARD'].includes(item.type)
      && String(item.payload?.cardIid || '') === String(johnathan.iid)
  );
  assert(set, 'Johnathan must have a legal placement command');
  const placed = reduceCommand(state, command(state, 'p0', 1, set.type, set.payload), {playerId:'p0'});
  assert.equal(placed.ok, true, 'Johnathan placement must be accepted');
  assert.equal(placed.state.pendingPrompt?.type, 'CARD_SELECTION');
  assert.equal(placed.state.pendingPrompt?.min, 0);
  assert.equal(placed.state.pendingPrompt?.max, 2);
  assert.deepEqual(
    new Set(placed.state.pendingPrompt.eligibleIids.map(String)),
    new Set(targetCards.map(card=>String(card.iid))),
    'the picker must expose every controller-deck Supporter and exclude the non-Supporter'
  );
  assert.equal(
    placed.state.pendingPrompt.eligibleIids.map(String).includes(String(nonSupporter.iid)),
    false,
    'the picker must exclude non-Supporters'
  );
  assertInvariants(placed.state);
  return {state:placed.state, targetCards, nonSupporter};
}

function submitSelection(state, selectedIids, sequence=2, expectedRevision=state.revision){
  const answer = command(state, 'p0', sequence, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIids:selectedIids.map(String)
  });
  answer.expectedRevision = expectedRevision;
  return reduceCommand(state, answer, {playerId:'p0'});
}

function assertExactTransfer(before, result, selectedCards){
  assert.equal(result.ok, true, `selection should be accepted: ${JSON.stringify(result.rejection || {})}`);
  const selected = new Set(selectedCards.map(card=>String(card.iid)));
  const hand = new Set(result.state.players[0].hand.map(card=>String(card.iid)));
  const deck = new Set(result.state.players[0].deck.map(card=>String(card.iid)));
  for(const card of selectedCards){
    assert(hand.has(String(card.iid)), `${card.name} (${card.iid}) must move to hand`);
    assert(!deck.has(String(card.iid)), `${card.name} (${card.iid}) must leave deck`);
  }
  for(const iid of before.pendingPrompt.eligibleIids.map(String)){
    if(selected.has(iid)) continue;
    assert(deck.has(iid), `unselected eligible instance ${iid} must remain in deck`);
  }
  assert.equal(result.state.pendingPrompt, null, 'the search prompt must close after an accepted answer');
  assertInvariants(result.state);
}

// Every active Supporter identity must be accepted as a one-card Johnathan
// search result. This catches filters that accidentally key off affiliation,
// expansion, rarity, or a short allow-list rather than the Supporter type.
for(const [index, supporter] of SUPPORTERS.entries()){
  const fixture = prepareFixture([String(supporter.id)], `SINGLE${index}`);
  const result = submitSelection(fixture.state, [fixture.targetCards[0].iid]);
  assertExactTransfer(fixture.state, result, fixture.targetCards);
}

// Diverse two-card selections, including reversed choice order.
const pairIds = [
  ['05','31'],
  ['32','54'],
  ['79','97'],
  ['20','44'],
  ['24','96']
];
for(const [index, ids] of pairIds.entries()){
  const fixture = prepareFixture(ids, `PAIR${index}`);
  const selected = index % 2 ? [...fixture.targetCards].reverse() : fixture.targetCards;
  const legal = legalCommandTemplates(fixture.state, 0).find(item=>
    item.type === 'ANSWER_PROMPT'
      && Array.isArray(item.payload?.selectedIids)
      && new Set(item.payload.selectedIids.map(String)).size === selected.length
      && selected.every(card=>item.payload.selectedIids.map(String).includes(String(card.iid)))
  );
  assert(legal, `the authority must issue the exact mixed pair command for ${ids.join(' + ')}`);
  const result = submitSelection(fixture.state, selected.map(card=>card.iid));
  assertExactTransfer(fixture.state, result, fixture.targetCards);
}

// Duplicate copies of one card ID remain separately selectable by canonical IID.
{
  const fixture = prepareFixture(['31','31'], 'DUPLICATECOPIES');
  assert.notEqual(fixture.targetCards[0].iid, fixture.targetCards[1].iid);
  const result = submitSelection(fixture.state, fixture.targetCards.map(card=>card.iid));
  assertExactTransfer(fixture.state, result, fixture.targetCards);
}

// "Up to two" permits the player to search for nothing.
{
  const fixture = prepareFixture(['31','54'], 'EMPTY');
  const result = submitSelection(fixture.state, []);
  assertExactTransfer(fixture.state, result, []);
}

// A stale answer is rejected without consuming the prompt. Reissuing the exact
// same authority-listed IID selection at the current revision must succeed.
{
  const fixture = prepareFixture(['31','54'], 'STALERETRY');
  const chosen = fixture.targetCards[1];
  const stale = submitSelection(fixture.state, [chosen.iid], 2, fixture.state.revision - 1);
  assert.equal(stale.ok, false);
  assert.equal(stale.rejection?.code, 'STALE_REVISION');
  assert.equal(fixture.state.pendingPrompt?.type, 'CARD_SELECTION');
  const retried = submitSelection(fixture.state, [chosen.iid], 3);
  assertExactTransfer(fixture.state, retried, [chosen]);
}

// These are the only cases that should produce a legality rejection.
{
  const fixture = prepareFixture(['31','54','79'], 'INVALIDCHOICES');
  const [first, second, third] = fixture.targetCards;
  const opponentSupporter = fixture.state.players[1].hand.find(card=>String(card.type) === 'Supporter');
  const invalidSelections = [
    [fixture.nonSupporter.iid],
    [opponentSupporter.iid],
    [first.iid, first.iid],
    [first.iid, second.iid, third.iid],
    ['missing-supporter-iid']
  ];
  for(const selectedIids of invalidSelections){
    const result = submitSelection(fixture.state, selectedIids);
    assert.equal(result.ok, false, `invalid selection ${selectedIids.join(',')} must be rejected`);
    assert.equal(result.rejection?.code, 'INVALID_CHOICE');
    assert.equal(fixture.state.pendingPrompt?.type, 'CARD_SELECTION', 'an invalid answer must not consume the live prompt');
  }
}

console.log(JSON.stringify({
  result:'phase7 Johnathan Kirby search matrix passed',
  activeSupporterIdentities:SUPPORTERS.length,
  mixedPairCases:pairIds.length,
  duplicateInstanceCase:true,
  emptySelectionCase:true,
  staleRetryCase:true,
  intentionallyRejectedCases:5
}, null, 2));
