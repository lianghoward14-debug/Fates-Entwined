#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const source = read('src/scripts/53-caribbea-translations.js');
const index = read('index.html');
const sandbox = {window:{FateJapaneseCatalog:{},FateChineseContent:[]}};
vm.runInNewContext(source, sandbox);

const japanese = sandbox.window.FateJapaneseCatalog;
const chinese = new Map(sandbox.window.FateChineseContent);
const required = [
  'Sofia', 'Don Julio', 'Sebastian', 'Fish Counter', 'Fresh Catch',
  'West Caribbea Villager', 'Destitute Farmers',
  'Caribbea Revolutionary', 'Revolutionary Spirit',
  'Old Elite Oligarch', 'Elite Influence',
  'Infantry of Havano', 'Military Blockade',
  'Caribba Loyalist', 'Loyalist Call',
  'Choose a different landscape.', 'Landscape selection is unavailable.',
  'Original deck unavailable; start a new match to use Sofia',
  'Rolled ZXQ0QXZ', 'Die showing ZXQ0QXZ on its large front face'
];

for(const english of required){
  assert(japanese[english], `missing Japanese translation for: ${english}`);
  assert(chinese.get(english), `missing Chinese translation for: ${english}`);
  assert.notStrictEqual(japanese[english], english, `Japanese translation unchanged for: ${english}`);
  assert.notStrictEqual(chinese.get(english), english, `Chinese translation unchanged for: ${english}`);
}

for(const id of ['108','109','110','111','112','113','114','115']){
  const cardMatch = read('src/scripts/01-data-and-state.js').match(new RegExp("\\{id:'" + id + "'[\\s\\S]*?(?=\\n  \\{id:|\\n  //)"));
  assert(cardMatch, `card ${id} missing from catalog`);
  for(const field of ['name','ability','effect']){
    const match = cardMatch[0].match(new RegExp(field + ":'([^']*(?:\\\\'[^']*)*)'"));
    assert(match, `card ${id} missing ${field}`);
    const english = match[1].replace(/\\'/g, "'");
    assert(japanese[english], `card ${id} ${field} missing Japanese translation: ${english}`);
    assert(chinese.get(english), `card ${id} ${field} missing Chinese translation: ${english}`);
  }
}

assert.match(index, /53-caribbea-translations\.js\?v=20261022-card120/);
console.log('cards 108-115 Japanese and Chinese localization smoke passed');
