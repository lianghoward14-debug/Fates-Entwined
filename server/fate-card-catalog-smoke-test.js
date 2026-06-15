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
console.log(`fate-card-catalog smoke passed (${catalog.cards.length} cards)`);
