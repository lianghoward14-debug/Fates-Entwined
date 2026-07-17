#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const indexText = read('index.html');
const loreText = read('src/scripts/09-challenger-lore.js');
const exactText = read('src/scripts/09a-card-information-5-lore.js');
const sandbox = {window:{}};
vm.runInNewContext(exactText, sandbox, {filename:'09a-card-information-5-lore.js'});

const bodies = sandbox.window.CARD_INFORMATION_5_LORE_BODIES;
assert(bodies && typeof bodies === 'object', 'Card Information-5 exact lore body map must load');
assert.strictEqual(Object.keys(bodies).length, 12, 'exact lore body map must contain six revised and six new entries');

const minimumLengths = {
  santiago:8000,
  'oathbound-noble-fighter':5000,
  'temecula-resident':4000,
  'west-caribbea-infantry':5000,
  'rozsi-szocs':9000,
  'alexander-the-magnificient':12000
};
for(const [slug, minimum] of Object.entries(minimumLengths)){
  assert.strictEqual(typeof bodies[slug], 'string', `${slug} must have an exact lore body`);
  assert(bodies[slug].length >= minimum, `${slug} lore body must not be summarized or truncated`);
}

assert.match(bodies.santiago, /^Santiago’s origins in the Cook Islands are relatively unknown\./);
assert.match(bodies.santiago, /unexpected death of Alondra Hopkins, Santiago realized that this was his opportunity\.$/);
assert.match(bodies['oathbound-noble-fighter'], /^In 494 AC, Alondra Hopkins disbanded the Scarlet Legion/);
assert.match(bodies['temecula-resident'], /^Temecula is a city in Riverside County, California, United States/);
assert.match(bodies['west-caribbea-infantry'], /The Company’s Finest/);
assert.match(bodies['rozsi-szocs'], /Květka Svoboda/);
assert.match(bodies['alexander-the-magnificient'], /Hrístos Pantazátos/);
assert.doesNotMatch(exactText, /\bKvetka\b/, 'the canonical Czech spelling must remain Květka');
assert.doesNotMatch(bodies['johnathan-kirby'], /Alondra Hopkins\s+Affiliation:/, 'Johnathan lore must end before the next PDF entry');
assert.doesNotMatch(exactText, /\bJonathan\b/, 'the canonical spelling must remain Johnathan Kirby');
assert.doesNotMatch(bodies['anne-stone'], /Makenna and her allies/, 'Anne lore must end before the next PDF entry');

for(const [pfpId, slug] of [
  ['30', 'santiago'],
  ['31', 'oathbound-noble-fighter'],
  ['32', 'temecula-resident'],
  ['33', 'west-caribbea-infantry'],
  ['34', 'rozsi-szocs'],
  ['35', 'alexander-the-magnificient']
]){
  assert.match(
    loreText,
    new RegExp(`slug:'${slug}'[\\s\\S]{0,180}pfpId:'${pfpId}'`),
    `${slug} must be wired to card portrait ${pfpId}`
  );
}

assert.match(loreText, /slug:'johnathan-kirby', title:'Johnathan Kirby', pfpId:'13'/);
assert.match(loreText, /'Place of Birth':'Irvine, United States'/);
assert.match(loreText, /Relationships:'Zsofia Szocs, Felicyta Janowicz, Květka Svoboda'/);
assert.match(loreText, /Object\.assign\(DOCUMENT_EXACT_BODIES, window\.CARD_INFORMATION_5_LORE_BODIES \|\| \{\}\)/);
assert.match(indexText, /09a-card-information-5-lore\.js\?v=1784293501[\s\S]*09-challenger-lore\.js\?v=1784293501/);

console.log('Card Information-5 lore smoke passed');
