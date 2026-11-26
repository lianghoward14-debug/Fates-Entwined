import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const card=require('../fate-card-catalog.js').getCardCatalog().byId.get('103');
assert.equal(card.type,'Improvisor');
assert.equal(card.fate,3);
assert.equal(card.cost,2);
await import('./boleslaw-santiago-regression.mjs');
