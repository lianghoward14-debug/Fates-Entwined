#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {getCardCatalog} = require('./fate-card-catalog');
const {buildInitialAuthorityState} = require('./fate-authority-bootstrap');
const {canonicalStateHash, validateProposedTransition} = require('./fate-authority-reducer');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const catalog = getCardCatalog();

const expanded = [];
for(let id = 80; id <= 100; id += 1){
  const card = catalog.byId.get(String(id));
  assert(card, `card ${id} must exist in the catalog`);
  assert.strictEqual(card.img, `${id}.png`, `card ${id} must use the matching card image`);
  assert.strictEqual(card.temporarilyDisabled, undefined, `card ${id} must be released into normal card pools`);
  assert.strictEqual(card.retired, undefined, `card ${id} must not be retired`);
  expanded.push(card);
}
assert.strictEqual(expanded.length, 21);
assert.strictEqual(catalog.byId.get('84').name, 'Květka Svoboda');
assert.strictEqual(catalog.byId.get('85').effect, 'This card gains 1 Fate for the total amount of times your opponent set a Supporter this game.');
assert.strictEqual(catalog.byId.get('89').fate, 7);
assert.strictEqual(catalog.byId.get('89').effect, 'As long as you activate less than 10 Supporter effects this game, this card gains 7 Fate.');
assert.strictEqual(catalog.byId.get('96').effect, 'Return four random cards in your discard pile to your deck.');
assert.strictEqual(catalog.byId.get('97').effect, "Your opponent's next two consolidations cost 1 extra Reinforcement.");
assert.strictEqual(catalog.byId.get('98').effect, 'This card will always appear in your opening hand as an additional card.');
assert.match(catalog.byId.get('99').effect, /Supporters are classified as Characters/);
assert.match(catalog.byId.get('100').effect, /gains 2 Fate[\s\S]*Snow on the Carpathians/);

const filler = catalog.cards.find(card=>card && !card.retired && !card.temporarilyDisabled && String(card.id) !== '98');
assert(filler, 'a filler card must exist');
const avalancheDeck = ['98'].concat(Array.from({length:39}, ()=>String(filler.id)));
const boot = buildInitialAuthorityState({
  catalog,
  seed:'expanded-worlds-avalanche-escape',
  mode:'freeplay',
  song:'board1',
  decks:{0:avalancheDeck, 1:avalancheDeck}
});
boot.state.players.forEach((player, index)=>{
  assert.strictEqual(player.hand.length, 7, `player ${index + 1} must receive six normal cards plus Avalanche Escape`);
  assert(player.hand.some(card=>String(card.id) === '98'), `player ${index + 1} opening hand must contain card 98`);
  assert.strictEqual(player.deck.length, 33);
});
assert.deepStrictEqual(boot.state._administrativeBloatEffects, []);
assert.strictEqual(boot.state._serverRngCounter, 0);

function validateLandscapeChange(preState, targetId){
  const postState = clone(preState);
  postState.landscapeId = targetId;
  postState.landscapeBgNum = Number(targetId.replace('igb',''));
  postState._landscapeState = Object.assign({}, postState._landscapeState, {id:targetId});
  const room = {canonicalState:preState, canonicalHash:canonicalStateHash(preState)};
  return validateProposedTransition(room, {type:'ACTION_RESULT', payload:{postState}}, {});
}

const alpineLocked = clone(boot.state);
alpineLocked.landscapeId = 'igb2';
alpineLocked.landscapeBgNum = 2;
alpineLocked.turn = 10;
alpineLocked._landscapeState = Object.assign({}, alpineLocked._landscapeState, {id:'igb2', resolvedTurns:{}});
assert.match(validateLandscapeChange(alpineLocked, 'igb1').reason || '', /final four turns/);

const alpineEarly = clone(alpineLocked);
alpineEarly.turn = 9;
assert.strictEqual(validateLandscapeChange(alpineEarly, 'igb1').ok, true, 'ALPINE may be changed away from before turn 10');

const qingdaoEntryLocked = clone(boot.state);
qingdaoEntryLocked.turn = 6;
assert.match(validateLandscapeChange(qingdaoEntryLocked, 'igb8').reason || '', /final four turns/);

const alpineResolved = clone(alpineLocked);
alpineResolved.turn = 14;
alpineResolved._landscapeState.resolvedTurns.igb2 = true;
assert.strictEqual(validateLandscapeChange(alpineResolved, 'igb1').ok, true, 'resolved ALPINE may be changed away from');

const core = read('src/scripts/05-gameplay-core.js');
const helpers = read('src/scripts/00-structural-helpers.js');
const rendering = read('src/scripts/06-rendering-and-helpers.js');
const ai = read('src/scripts/07-ai.js');
const rooms = read('src/scripts/18-online-rooms.js');
const data = read('src/scripts/01-data-and-state.js');
assert.match(data, /const TEMP_DISABLED_CARD_IDS = new Set\(\);/, 'the temporary card hold must be empty');
assert.match(core, /WINDOWED_WHEN_SET_EFFECT_IDS[\s\S]*'96','97'/, 'Snow Shoveler and Visegrad Politician must expose deferred Activate Effect actions');
assert.match(core, /case '96'[\s\S]*showSnowShovelerReturnedCards/, 'Snow Shoveler must show its random return result window');
assert.match(rendering, /Shovel - Cards Returned to the Deck|showCanvasCardGalleryModal/, 'random returned cards must use the standard card gallery window');
assert.match(helpers, /function isCardSupporterForRules[\s\S]*isBlameGameActive/, 'Blame Game must have a shared inverse Supporter classifier');
assert.match(ai, /case '96'[\s\S]*case '97'/, 'AI must implement cards 96 and 97');
assert.match(rooms, /_administrativeBloatEffects/, 'Administrative Bloat must synchronize in multiplayer state');
assert.match(rooms, /_serverRngCounter/, 'deterministic random effect state must synchronize in multiplayer');

console.log('fate expanded worlds cards 80-100 smoke passed');
