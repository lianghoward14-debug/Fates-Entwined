#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {canonicalStateHash} = require('./fate-authority-reducer');
const {getCardCatalog} = require('./fate-card-catalog');
const {buildInitialAuthorityState} = require('./fate-authority-bootstrap');

function validDeck(){
  return getCardCatalog().cards
    .filter(card=>card && !card.retired && !card.temporarilyDisabled)
    .slice(0, 40)
    .map(card=>card.id);
}

function validDeckWithSelva(){
  const deck = ['74'];
  getCardCatalog().cards
    .filter(card=>card && !card.retired && !card.temporarilyDisabled && String(card.id) !== '74')
    .slice(0, 39)
    .forEach(card=>deck.push(card.id));
  return deck;
}

const catalog = getCardCatalog();
const deck = validDeck();
const boot = buildInitialAuthorityState({
  catalog,
  seed:'bootstrap-smoke-seed',
  decks:{0:deck, 1:deck}
});

assert(boot.state, 'expected initial state');
assert.strictEqual(boot.state.players.length, 2);
assert.strictEqual(boot.state.players[0].hand.length, 6);
assert.strictEqual(boot.state.players[0].deck.length, 34);
assert(!Object.prototype.hasOwnProperty.call(boot.state.players[0].hand[0], 'effect'), 'compact state cards must omit effect text');
assert(!Object.prototype.hasOwnProperty.call(boot.state.players[0].hand[0], 'flavor'), 'compact state cards must omit flavor text');
assert(boot.state.players[0].hand[0].img, 'compact state cards should preserve render-relevant image metadata');
assert.strictEqual(boot.state.players[1].hand.length, 6);
assert.strictEqual(boot.state.players[1].deck.length, 34);
assert.strictEqual(boot.state.currentPlayer, 0);
assert.strictEqual(boot.state.turn, 1);
assert.strictEqual(boot.state.instanceCounter, 80);
assert.strictEqual(canonicalStateHash(boot.state), boot.stateHash);

const again = buildInitialAuthorityState({
  catalog,
  seed:'bootstrap-smoke-seed',
  decks:{0:deck, 1:deck}
});
assert.strictEqual(again.stateHash, boot.stateHash, 'same seed/decks should bootstrap deterministically');

const selvaDeck = validDeckWithSelva();
const selvaBoot = buildInitialAuthorityState({
  catalog,
  seed:'selva-bootstrap-1',
  song:'board8',
  decks:{0:selvaDeck, 1:deck}
});
assert(selvaBoot.state.players[0].hand.some(card=>String(card.id) === '74'), 'test seed should put Selva Islands Pirate in the opening hand');
assert.strictEqual(selvaBoot.state._pendingSelvaSupportBoost[0], 1, 'opening-hand Selva should queue a supporter boost for its owner');
assert.strictEqual(selvaBoot.state.players[0].hand.find(card=>String(card.id) === '74')._selvaOpeningQueued, true);
assert.strictEqual(selvaBoot.state.landscapeId, 'igb8', 'server bootstrap should derive landscape from the selected song');
assert.strictEqual(selvaBoot.state.landscapeBgNum, 8);
assert.strictEqual(selvaBoot.state._landscapeState.id, 'igb8');
assert(Number.isInteger(selvaBoot.state._landscapeState.targetZone), 'target-zone landscapes should be initialized server-side');
assert.strictEqual(canonicalStateHash(selvaBoot.state), selvaBoot.stateHash);

assert.throws(()=>buildInitialAuthorityState({
  catalog,
  seed:'bad-deck-seed',
  decks:{0:Array.from({length:40}, (_, i)=>`missing-${i}`), 1:deck}
}), /unknown card/);

assert.throws(()=>buildInitialAuthorityState({
  catalog,
  seed:'duplicate-deck-seed',
  decks:{0:Array.from({length:40}, ()=>'02'), 1:deck}
}), /too many copies/);

const duplicateFreePlayBoot = buildInitialAuthorityState({
  catalog,
  seed:'duplicate-freeplay-deck-seed',
  mode:'freeplay',
  decks:{0:Array.from({length:40}, ()=>'02'), 1:deck}
});
assert(duplicateFreePlayBoot.state, 'Free Play bootstrap should allow sandbox decks with extra copies');
assert.strictEqual(duplicateFreePlayBoot.state.players[0].hand.length, 6);

const squareCard = catalog.cards.find(card=>card && !card.retired && !card.temporarilyDisabled && String(card.rarity || '').toLowerCase() === 'square');
assert(squareCard, 'test catalog should include at least one available square card');
const squareId = String(squareCard.id);
const squareThreeDeck = deck.filter(id=>String(id) !== squareId).slice(0, 37).concat([squareId, squareId, squareId]);
const squareFourDeck = deck.filter(id=>String(id) !== squareId).slice(0, 36).concat([squareId, squareId, squareId, squareId]);
const squareThreeBoot = buildInitialAuthorityState({
  catalog,
  seed:'square-three-copy-seed',
  decks:{0:squareThreeDeck, 1:deck}
});
assert(squareThreeBoot.state, 'multiplayer bootstrap should allow three copies of a square card');
assert.throws(()=>buildInitialAuthorityState({
  catalog,
  seed:'square-four-copy-seed',
  decks:{0:squareFourDeck, 1:deck}
}), /too many copies/);

console.log('fate-authority-bootstrap smoke passed');
