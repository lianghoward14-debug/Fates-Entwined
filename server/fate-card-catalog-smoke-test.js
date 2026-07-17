#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {getCardCatalog} = require('./fate-card-catalog');

const catalog = getCardCatalog();
assert(catalog.cards.length >= 90, 'expected real card catalog to load');
assert(catalog.byId.get('05'), 'expected card 05 in catalog');
assert.strictEqual(catalog.byId.get('05').type, 'Supporter');
assert(catalog.byId.get('05').effect, 'expected card 05 effect metadata');
assert(catalog.byId.get('14'), 'expected Alondra in catalog');
const duncan = catalog.byId.get('77');
assert(duncan, 'expected Duncan Heyward in catalog');
assert.strictEqual(duncan.fate, 6, 'Duncan Heyward must have 6 printed Fate');
assert.match(duncan.effect, /declared affiliation gains 4 Fate\./, 'Duncan Heyward must grant 4 Fate to the declared affiliation');
console.log(`fate-card-catalog smoke passed (${catalog.cards.length} cards)`);
