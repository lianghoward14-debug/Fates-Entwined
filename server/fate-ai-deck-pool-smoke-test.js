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
  ai_snowball_fight_club:{strategy:'ai_snowball_fight_club', characters:13, stars:1},
  ai_crown_of_five:{strategy:'ai_crown_of_five', characters:16, stars:1},
  ai_wintertide_family_reunion:{strategy:'ai_wintertide_family_reunion', characters:25, stars:0},
  ai_last_mohicans_ledger:{strategy:'ai_last_mohicans_ledger', characters:7},
  ai_hellenic_heartbreaker:{strategy:'ai_hellenic_heartbreaker', characters:10},
  ai_hungarian_war_dance:{strategy:'ai_hungarian_war_dance', characters:19},
  ai_great_oak_salvo:{strategy:'ai_great_oak_salvo', characters:10},
  ai_adjacency_doctrine:{strategy:'ai_adjacency_doctrine', characters:25},
  ai_hand_quarantine:{strategy:'ai_hand_quarantine', characters:7},
  ai_high_t_draw_mill:{strategy:'ai_high_t_draw_mill', characters:22},
  ai_university_counterbattery:{strategy:'ai_university_counterbattery', characters:16},
  ai_selva_tidal_strike:{strategy:'ai_selva_tidal_strike', characters:19}
};
assert.strictEqual(decks.length, Object.keys(expected).length, 'advanced AI pool should contain only the approved replacement decks');
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
  assert.strictEqual(stars, design.stars == null ? 1 : design.stars, `${deckId} should retain its designed Star count`);
  assert.strictEqual(characters, design.characters, `${deckId} should retain its designed character/supporter split`);
  for(const [id,count] of counts){
    const card = byId.get(id);
    assert(count <= (card.rarity === 'star' ? 1 : 3), `${deckId} exceeds the copy limit for ${id}`);
  }
}

const exactDeckCounts = {
  ai_crown_of_five:{'07':1,'19':3,'15':3,'01':3,'57':3,'77':3,'09':3,'24':3,'49':3,'92':3,'28':3,'68':3,'74':3,'60':3},
  ai_snowball_fight_club:{'bh05':1,'93':3,'37':3,'41':3,'08':3,'48':3,'31':3,'58':3,'60':3,'13':3,'32':3,'42':3,'05':3,'71':3},
  ai_wintertide_family_reunion:{'100':3,'98':3,'88':3,'99':3,'89':3,'82':3,'84':3,'94':3,'92':3,'06':3,'27':2,'28':3,'60':3,'90':2},
  ai_great_oak_salvo:{'07':1,'47':3,'64':3,'75':3,'58':3,'60':3,'13':3,'32':3,'69':3,'33':3,'20':3,'65':3,'35':3,'bh22':3}
};
for(const [deckId, blueprint] of Object.entries(exactDeckCounts)){
  const deck = decks.find(entry=>entry.id === deckId);
  const actual = {};
  deck.ids.forEach(id=>{ actual[id] = (actual[id] || 0) + 1; });
  assert.deepStrictEqual(actual, blueprint, `${deckId} should retain its approved exact card list`);
}

for(const strategy of [
  'ai_snowball_fight_club',
  'ai_crown_of_five',
  'ai_wintertide_family_reunion',
  'ai_last_mohicans_ledger',
  'ai_hellenic_heartbreaker',
  'ai_hungarian_war_dance',
  'ai_great_oak_salvo',
  'ai_adjacency_doctrine',
  'ai_hand_quarantine',
  'ai_high_t_draw_mill',
  'ai_university_counterbattery',
  'ai_selva_tidal_strike'
]){
  assert(aiSource.includes(`${strategy}: {`), `${strategy} should define search priorities`);
  assert(aiSource.includes(`deckId === '${strategy}'`), `${strategy} should define move-scoring priorities`);
}
assert(aiSource.includes("strat === 'ai_alis_handcuffs' || strat === 'ai_hand_quarantine'"), 'Hand Quarantine should deliberately discard Wine Country Guerilla');
assert(aiSource.includes("strat === 'ai_snowball_fight_club'"), 'Snowball pilot should make Taylor copy Wodny Potok Youth');
assert(aiSource.includes("strat === 'ai_wintertide_family_reunion'"), 'Wintertide pilot should make Snow and family-specific effect choices');
assert(aiSource.includes('remainingSnowballs'), 'Snowball pilot should focus enough shots to remove a reachable target');
assert(aiSource.includes("ai_crown_of_five:['09','24','49']"), 'Crown pilot should diversify Maja searches across its reinforcement engine');
assert(aiSource.includes("id === '99' && conversionActive"), 'Wintertide pilot should preserve the active Blame Game source');
const advancedHeuristicMarkers = {
  ai_last_mohicans_ledger:'westCaribArmed',
  ai_hellenic_heartbreaker:'supporterFateHere',
  ai_hungarian_war_dance:'bestFormation',
  ai_great_oak_salvo:'oakTributes',
  ai_adjacency_doctrine:'adjacencySourcesHere',
  ai_hand_quarantine:'westGermanAvailable',
  ai_high_t_draw_mill:'highTActive',
  ai_university_counterbattery:'reactiveHavanoInHand',
  ai_selva_tidal_strike:'largestTypeCluster'
};
for(const [strategy, marker] of Object.entries(advancedHeuristicMarkers)){
  assert(aiSource.includes(marker), `${strategy} should include its stateful advanced-pilot decisions`);
}
for(const effectId of ['bh10','bh12','bh13','bh19']){
  assert(aiSource.includes(`case '${effectId}'`), `AI should explicitly resolve ${effectId}'s automatic engine effect`);
}
assert(aiSource.includes("cardActsAsPassive(card, '93')"), 'AI should activate copied Snowball Fight sources each turn');
assert(gameplaySource.includes("'92','93'"), 'French Fusiliers should be able to copy Snowball Fight');
assert(aiSource.includes("strat === 'ai_last_mohicans_ledger'"), 'Last Mohican pilot should make Howard prioritize Chingachlook');
assert(aiSource.includes("strat === 'ai_hellenic_heartbreaker'"), 'Hellenic pilot should make Howard prioritize Alexander');
assert(aiSource.includes("strat === 'ai_hungarian_war_dance'"), 'Hungarian pilot should force its Third Great War declaration');
assert(aiSource.includes("strat === 'ai_hungarian_war_dance' || strat === 'ai_crown_of_five'"), 'Crown pilot should force its Third Great War declaration');
assert(aiSource.includes("strat === 'ai_selva_tidal_strike'"), 'Selva pilot should force its Eventide declaration');
assert(aiSource.includes("if(!resolvedOpp._deckStrategy && Array.isArray(resolvedOpp.deck)"), 'monthly and persisted AI decks should recover their built-in pilot by deck signature');
assert(/return advancedPool/.test(challengerSource), 'eligible AI opponents should draw from the advanced deck pool');
assert(/const protectedRanks = new Set\(\['Footman'\]\)/.test(challengerSource), 'Footman opponents should remain on starter decks');

console.log('AI custom deck pool smoke test passed.');
