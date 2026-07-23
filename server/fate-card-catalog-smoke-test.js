#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {getCardCatalog} = require('./fate-card-catalog');

const catalog = getCardCatalog();
assert(catalog.cards.length >= 90, 'expected real card catalog to load');
assert(catalog.byId.get('05'), 'expected card 05 in catalog');
assert.strictEqual(catalog.byId.get('05').type, 'Supporter');
assert(catalog.byId.get('05').effect, 'expected card 05 effect metadata');
const felicyta = catalog.byId.get('01');
assert(felicyta, 'expected Felicyta Janowicz in catalog');
assert.strictEqual(felicyta.fate, 6, 'Felicyta must match the new 6-Fate card art');
assert.strictEqual(felicyta.effect, 'All cards you control that are adjacent to this card gains 4 Fate.', 'Felicyta rules text must match the new +4-Fate card art');
const cosmicGf = catalog.byId.get('48');
assert(cosmicGf, 'expected Cosmic GF in catalog');
assert.strictEqual(cosmicGf.fate, 3, 'Cosmic GF must match the new 3-Fate card art');
assert.match(cosmicGf.effect, /deck[\s\S]*non-Star "Expanded Worlds" card from the discard pile/, 'Cosmic GF effect must keep deck Star searches legal but block Star discard recovery');
const root = path.resolve(__dirname, '..');
const activeGameplay = fs.readFileSync(path.join(root, 'src/scripts/05-gameplay-core.js'), 'utf8');
assert.match(activeGameplay, /cardActsAsPassive\(cell, '01'\)[\s\S]{0,160}bonus \+= 4 \+ jeremiahBoost;/, 'active gameplay must apply Felicyta and Taylor-copied Felicyta as a +4 adjacent Fate aura');
const majaStart = activeGameplay.indexOf("case '07':");
const majaEnd = activeGameplay.indexOf("case '08':", majaStart);
assert(majaStart >= 0 && majaEnd > majaStart, 'active gameplay must contain Maja Kaminska effect handling');
const majaEffect = activeGameplay.slice(majaStart, majaEnd);
const majaBonus = majaEffect.indexOf('G.extraSupportsThisTurn = (Number(G.extraSupportsThisTurn) || 0) + 2;');
const majaPicker = majaEffect.indexOf('pickCardsVisual(matches');
assert(majaBonus >= 0 && majaBonus < majaPicker, 'Maja must grant two extra Supporter placements before the optional supporter picker opens');
assert.strictEqual((majaEffect.match(/G\.extraSupportsThisTurn\s*=/g) || []).length, 1, 'Maja must grant the placement bonus exactly once');
assert.doesNotMatch(majaEffect, /minCount\s*:\s*[1-9]/, 'Maja supporter selection must remain optional');
assert(catalog.byId.get('14'), 'expected Alondra in catalog');
const duncan = catalog.byId.get('77');
assert(duncan, 'expected Duncan Heyward in catalog');
assert.strictEqual(duncan.fate, 6, 'Duncan Heyward must have 6 printed Fate');
assert.match(duncan.effect, /declared affiliation gains 4 Fate\./, 'Duncan Heyward must grant 4 Fate to the declared affiliation');
console.log(`fate-card-catalog smoke passed (${catalog.cards.length} cards)`);
