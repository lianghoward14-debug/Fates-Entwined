#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {getCardCatalog} = require('./fate-card-catalog');

const ROOT = path.resolve(__dirname, '..');
const challengerPath = path.join(ROOT, 'src/scripts/09-challenger-mode.js');
const aiPath = path.join(ROOT, 'src/scripts/07-ai.js');
const challengerSource = fs.readFileSync(challengerPath, 'utf8');
const aiSource = fs.readFileSync(aiPath, 'utf8');

function extractArrayLiteral(source, marker){
  const start = source.indexOf(marker);
  assert(start >= 0, `${marker} should exist`);
  const arrayStart = source.indexOf('[', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for(let i=arrayStart; i<source.length; i++){
    const ch = source[i];
    if(quote){
      if(escaped) escaped = false;
      else if(ch === '\\') escaped = true;
      else if(ch === quote) quote = '';
      continue;
    }
    if(ch === "'" || ch === '"' || ch === '`'){ quote = ch; continue; }
    if(ch === '[') depth++;
    else if(ch === ']' && --depth === 0) return source.slice(arrayStart, i+1);
  }
  throw new Error(`${marker} array did not close`);
}

const literal = extractArrayLiteral(challengerSource, 'const AI_ONLY_RANDOM_DECKS =');
const decks = vm.runInNewContext(`(${literal})`, Object.create(null), {timeout:1000});
assert(Array.isArray(decks), 'advanced AI deck pool should evaluate to an array');

const expected = {
  ai_kvetka_chain:'ai_kvetka_chain',
  ai_total_blackout:'ai_total_blackout',
  ai_jake_compound_interest:'ai_fat_jake',
  ai_living_formation:'ai_living_formation',
  ai_rozsi_relay:'ai_movement'
};
const {byId} = getCardCatalog();
const allIds = new Set();
decks.forEach(deck=>{
  assert(deck && deck.id, 'every advanced AI deck should have an id');
  assert(!allIds.has(deck.id), `advanced AI deck id ${deck.id} should be unique`);
  allIds.add(deck.id);
});

for(const [deckId, strategy] of Object.entries(expected)){
  const deck = decks.find(entry=>entry.id === deckId);
  assert(deck, `${deckId} should be available in the advanced AI pool`);
  assert.strictEqual(deck.baseStrategy, strategy, `${deckId} should use its intentional AI pilot`);
  assert.strictEqual(deck.ids.length, 40, `${deckId} should contain exactly 40 cards`);
  const counts = new Map();
  let stars = 0;
  let characters = 0;
  deck.ids.forEach(id=>{
    const card = byId.get(String(id));
    assert(card, `${deckId} references missing card ${id}`);
    assert(!card.retired && !card.temporarilyDisabled, `${deckId} should not use unavailable card ${id}`);
    counts.set(String(id), (counts.get(String(id)) || 0) + 1);
    if(card.rarity === 'star') stars++;
    if(card.type !== 'Supporter') characters++;
  });
  assert.strictEqual(stars, 1, `${deckId} should contain exactly one Star card`);
  assert.strictEqual(characters, 16, `${deckId} should retain the designed 16/24 character-supporter split`);
  for(const [id,count] of counts){
    const card = byId.get(id);
    assert(count <= (card.rarity === 'star' ? 1 : 3), `${deckId} exceeds the copy limit for ${id}`);
  }
}

for(const strategy of ['ai_kvetka_chain','ai_total_blackout','ai_living_formation']){
  assert(aiSource.includes(`${strategy}: {`), `${strategy} should define search priorities`);
  assert(aiSource.includes(`deckId === '${strategy}'`), `${strategy} should define move-scoring priorities`);
}
assert(/return advancedPool/.test(challengerSource), 'eligible AI opponents should draw from the advanced deck pool');
assert(/const protectedRanks = new Set\(\['Footman'\]\)/.test(challengerSource), 'Footman opponents should remain on starter decks');

console.log('AI custom deck pool smoke test passed.');
