#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'latin1');
const challengerSource = read('src/scripts/09-challenger-mode.js');
const challengerV2Source = read('src/scripts/09-challenger-v2.js');
const profileSource = read('src/scripts/03-profile-and-progression.js');
const catalogSource = read('src/scripts/01-data-and-state.js');
const indexSource = read('index.html');

const catalogMatch = catalogSource.match(/const CARDS\s*=\s*(\[[\s\S]*?\r?\n\];)/);
assert(catalogMatch, 'card catalog must be extractable');
const cards = vm.runInNewContext(`(${catalogMatch[1].slice(0, -1)})`);

const boosterBlockMatch = challengerSource.match(/function getBooster2CardPool\(\)[\s\S]*?(?=\r?\n\/\/ Add owned cards)/);
assert(boosterBlockMatch, 'Booster 2 generator must be extractable');

const scriptedMath = Object.create(Math);
const context = vm.createContext({
  CARDS: cards,
  Math: scriptedMath,
  isRetiredChallengerCard: () => false,
});
vm.runInContext('function getChallengerCardPool(){ return CARDS.filter(c=>!isRetiredChallengerCard(c)); }', context);
vm.runInContext(boosterBlockMatch[0], context);

const cardById = new Map(cards.map(card => [card.id, card]));
const expansionPool = vm.runInContext('getBooster2CardPool()', context);
assert.strictEqual(expansionPool.length, 21, 'Booster 2 pool must contain cards 80-100');
assert(expansionPool.every(card => Number(card.id) >= 80 && Number(card.id) <= 100), 'Booster 2 must not draw outside cards 80-100');

function generateWith(sequence) {
  let index = 0;
  scriptedMath.random = () => sequence[index++] ?? 0.5;
  return vm.runInContext('generateBooster2Pack()', context);
}

function classify(ids) {
  assert.strictEqual(ids.length, 3, 'every Booster 2 pack must contain exactly three cards');
  assert.strictEqual(new Set(ids).size, 3, 'a Booster 2 pack must not repeat a card');
  const opened = ids.map(id => cardById.get(id));
  assert(opened.every(Boolean), 'every generated Booster 2 card must exist');
  return {
    supporters: opened.filter(card => card.type === 'Supporter').length,
    triangles: opened.filter(card => card.type !== 'Supporter' && card.rarity === 'triangle').length,
    squares: opened.filter(card => card.type !== 'Supporter' && card.rarity === 'square').length,
  };
}

assert.deepStrictEqual(classify(generateWith([0.74, 0.1, 0.2, 0.3])), {supporters:1, triangles:2, squares:0}, 'the 75% recipe must be one Supporter and two Triangles');
assert.deepStrictEqual(classify(generateWith([0.75, 0.1, 0.2, 0.3])), {supporters:1, triangles:1, squares:1}, 'the 25% recipe must be one Supporter, one Triangle, and one Square Character');

const baseDescription = "The base set of the game, consisting of 80 cards from all corners of Howard's creative world.";
const exactDescription = "The second expansion of Fates Entwined - Winter mornings, icy rivers, snowy forests - Felicyta's youth in Wodny Potok was filled with memories of not only her childhood, but an ancient sadness.";
for(const [label, source] of [['primary store', challengerSource], ['alternate store', challengerV2Source]]) {
  assert.match(source, /const BOOSTER2_COST_STARLIGHT = 150;/, `${label} must price Booster 2 at 150 Starlight`);
  assert(source.includes(baseDescription), `${label} must use the supplied base booster description`);
  assert.match(source, /Fates Entwined Booster[\s\S]*8 cards from the Fates Entwined base set\./, `${label} must keep base booster contents descriptive, not probability-heavy`);
  assert(source.includes(exactDescription), `${label} must use the supplied Booster 2 description`);
  assert.match(source, /<img src="booster2\.png" alt="Snow on the Carpathians Booster"/, `${label} must display booster2.png with the Snow on the Carpathians name`);
  assert.match(source, /Snow on the Carpathians Booster[\s\S]*3 cards from the Snow on the Carpathians set\./, `${label} must hide Booster 2 probability text from the store`);
  assert.doesNotMatch(source, /<div class="booster-name"[^>]*>[^<]*Favored|Open Favored|onclick="(?:buyFavoredPack|openNextFavoredPack)/, `${label} must not show the retired Favored pack in the store`);
  assert.doesNotMatch(source, /booster-contents">[^<]*(75%|25%|chance at a Star)/, `${label} store pack content copy must not show probability text`);
  assert.match(source, /function buyBooster2Pack\(\)[\s\S]*unopenedBooster2Packs[\s\S]*BOOSTER2_COST_STARLIGHT/, `${label} must purchase and persist unopened Booster 2 packs`);
  assert.match(source, /function openNextBooster2Pack\(\)[\s\S]*generateBooster2Pack\(\)[\s\S]*grantCardsToProfile\(ids\)[\s\S]*showPackOpening\(results, 'booster2'\)/, `${label} must grant and reveal Booster 2 cards`);
}

assert(fs.existsSync(path.join(root, 'booster2.png')), 'booster2.png must exist');
assert.match(profileSource, /unopenedBooster2Packs:\s*0/, 'new profiles must initialize the Booster 2 counter');
assert.match(profileSource, /USER_PROFILE\.unopenedBooster2Packs\s*=\s*0/, 'profile reset must clear the Booster 2 counter');
assert.match(indexSource, /99-ui-final\.css\?v=1784394001/, 'full-art booster store CSS must be cache-busted');
assert.match(indexSource, /09-challenger-mode\.js\?v=1784394001/, 'Snow on the Carpathians Booster store release must be cache-busted');

console.log('fate Booster 2 smoke passed (cards 80-100, 75/25 composition, store purchase/open flow)');
