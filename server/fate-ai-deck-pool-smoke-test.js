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
const gameplayPath = path.join(ROOT, 'src/scripts/05-gameplay-core.js');
const challengerSource = fs.readFileSync(challengerPath, 'utf8');
const aiSource = fs.readFileSync(aiPath, 'utf8');
const gameplaySource = fs.readFileSync(gameplayPath, 'utf8');

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
  ai_kvetka_chain:{strategy:'ai_kvetka_chain', characters:16},
  ai_total_blackout:{strategy:'ai_total_blackout', characters:16},
  ai_jake_compound_interest:{strategy:'ai_fat_jake', characters:16},
  ai_living_formation:{strategy:'ai_living_formation', characters:16},
  ai_rozsi_relay:{strategy:'ai_movement', characters:16},
  ai_snowbound_wintertide:{strategy:'ai_snowbound_wintertide', characters:19},
  ai_overclocked_dauntless:{strategy:'ai_overclocked_dauntless', characters:19},
  ai_thousand_reel_drawstorm:{strategy:'ai_thousand_reel_drawstorm', characters:13},
  ai_university_mischief:{strategy:'ai_university_mischief', characters:10},
  ai_alis_handcuffs:{strategy:'ai_alis_handcuffs', characters:7},
  ai_destruction_paradise:{strategy:'ai_destruction_paradise', characters:19},
  ai_taylors_perfect_mimic:{strategy:'ai_taylors_perfect_mimic', characters:22},
  ai_adaptive_formation:{strategy:'ai_adaptive_formation', characters:19},
  ai_pierogi_siege:{strategy:'ai_pierogi_siege', characters:19},
  ai_bombastic_search_punisher:{strategy:'ai_bombastic_search_punisher', characters:19}
};
const {byId} = getCardCatalog();
const allIds = new Set();
decks.forEach(deck=>{
  assert(deck && deck.id, 'every advanced AI deck should have an id');
  assert(!allIds.has(deck.id), `advanced AI deck id ${deck.id} should be unique`);
  allIds.add(deck.id);
});

for(const [deckId, design] of Object.entries(expected)){
  const deck = decks.find(entry=>entry.id === deckId);
  assert(deck, `${deckId} should be available in the advanced AI pool`);
  assert.strictEqual(deck.baseStrategy, design.strategy, `${deckId} should use its intentional AI pilot`);
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
  assert.strictEqual(characters, design.characters, `${deckId} should retain its designed character/supporter split`);
  for(const [id,count] of counts){
    const card = byId.get(id);
    assert(count <= (card.rarity === 'star' ? 1 : 3), `${deckId} exceeds the copy limit for ${id}`);
  }
}

for(const strategy of [
  'ai_kvetka_chain',
  'ai_total_blackout',
  'ai_living_formation',
  'ai_snowbound_wintertide',
  'ai_overclocked_dauntless',
  'ai_thousand_reel_drawstorm',
  'ai_university_mischief',
  'ai_alis_handcuffs',
  'ai_destruction_paradise',
  'ai_taylors_perfect_mimic',
  'ai_adaptive_formation',
  'ai_pierogi_siege',
  'ai_bombastic_search_punisher'
]){
  assert(aiSource.includes(`${strategy}: {`), `${strategy} should define search priorities`);
  assert(aiSource.includes(`deckId === '${strategy}'`), `${strategy} should define move-scoring priorities`);
}
assert(aiSource.includes("strat === 'ai_alis_handcuffs'"), 'Ali pilot should deliberately discard Wine Country Guerilla');
assert(aiSource.includes("strat === 'ai_overclocked_dauntless'"), 'Overclock pilot should use Wolf Creek formation movement');
assert(aiSource.includes("ai_taylors_perfect_mimic:['bh05','100','bh04','90']"), 'Taylor pilot should make Kvetka fetch Taylor first');
assert(aiSource.includes("move.card.id === 'bh06' && G.turn < 6"), 'Adaptive Formation should hold Achille until turn six');
assert(gameplaySource.includes("const plannedTypes = ['Coordinator','Dauntless','Supporter']"), 'Adaptive Formation should give the three Achille tokens complementary identities');
assert(aiSource.includes("if(!resolvedOpp._deckStrategy && Array.isArray(resolvedOpp.deck)"), 'monthly and persisted AI decks should recover their built-in pilot by deck signature');
assert(/return advancedPool/.test(challengerSource), 'eligible AI opponents should draw from the advanced deck pool');
assert(/const protectedRanks = new Set\(\['Footman'\]\)/.test(challengerSource), 'Footman opponents should remain on starter decks');

console.log('AI custom deck pool smoke test passed.');
