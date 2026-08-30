'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'src/scripts/05-gameplay-core.js'), 'utf8');
const modifiers = fs.readFileSync(path.join(root, 'shared/engine/modifiers.mjs'), 'utf8');

assert.match(core,
  /Cathy \(23\): \+2 to cards currently classified as Characters[\s\S]{0,360}isCardCharacterForRules\(card, card\.owner\)/,
  'legacy Cathy must grant Fate to Supporters reclassified as Characters by Blame Game');
assert.match(core,
  /Anne Stone \(11\): \+3 to cards currently classified as Supporters[\s\S]{0,320}isCardSupporterForRules\(card, card\.owner\)/,
  'legacy Blame Game must remove converted cards from Anne Stone supporter-aura eligibility');
assert.match(core,
  /Maroon Knights \(59\): \+1 to all Supporters[\s\S]{0,280}isCardSupporterForRules\(card, card\.owner\)/,
  'legacy Blame Game must remove converted cards from Maroon Knights supporter-aura eligibility');

assert.match(modifiers,
  /SUPPORTERS_AS_CHARACTERS[\s\S]{0,360}structuralType === 'Supporter'\) return 'Character'/,
  'authoritative classification must project Blame Game Supporters as Characters');
assert.match(modifiers,
  /const targetType = effectiveCardType\(state, card\)[\s\S]{0,5000}sourceId === '23' && targetType !== 'Supporter'/,
  'authoritative Cathy must consume the effective Blame Game classification');

console.log('Blame Game Cathy classification smoke test passed.');
