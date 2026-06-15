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

console.log('fate-authority-bootstrap smoke passed');
