#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const copy = read('src/scripts/53-japanese-card-updates.js');
const index = read('index.html');
for(const english of [
  'Felicyta and Květka (Youth)', 'Jorge Alvarez (El Hombre Piña)', 'Anne Stone (Anarchist)',
  'Santiago Alvarez (General)', 'Rivera (Revolutionary)', 'Jorge Alvarez (Revolutionary)',
  'Anne Stone (Revolutionary)', 'Strategy of a Revolution', 'Draw Cards', 'Search Cards', 'Jose Garcia', 'A Brighter Future', 'A Caribbea for All', 'The Long Game', 'Call to Arms',
  'Choose your reinforcement', 'Waiting for your opponent to resolve an effect',
  'Remember who you fight for!', 'Together, brothers and sisters, we advance toward Havano!',
  'These peasants call for revolution...without understanding that they must pay for it with their lives.'
]) assert(copy.includes(english), `missing reviewed Japanese entry for: ${english}`);

assert.match(copy, /window\.FateJapaneseCatalog = Object\.freeze/);
assert.match(copy, /window\.FateJapaneseSubtitles = Object\.assign/);
assert.match(index, /53-japanese-card-updates\.js\?v=20261010-anne107-planning-c/);
console.log('cards 100-106 and Call to Arms Japanese localization smoke passed');
