import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {cardRule, multiplayerEligibleCardIds} from '../shared/engine/cards/registry.mjs';

const require = createRequire(import.meta.url);
const {getCardCatalog} = require('./fate-card-catalog.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataSource = fs.readFileSync(path.join(root, 'src/scripts/01-data-and-state.js'), 'utf8');
const challengerSource = fs.readFileSync(path.join(root, 'src/scripts/09-challenger-mode.js'), 'utf8');

assert.match(
  dataSource,
  /TEMP_DISABLED_CARD_IDS\s*=\s*new Set\(\[['"]101['"],\s*['"]102['"],\s*['"]103['"]\]\)/,
  'the browser must retire cards 101-103 through the shared card-pool gate'
);

const eligible = new Set(multiplayerEligibleCardIds());
for(const id of ['101', '102', '103']){
  assert(getCardCatalog().byId.has(id), `card ${id} definition must remain in the catalog`);
  assert(cardRule(id), `card ${id} authoritative effect implementation must remain registered`);
  assert(!eligible.has(id), `card ${id} must be rejected from authoritative multiplayer decks`);
}

assert.match(challengerSource, /function getChallengerCardPool\(\)[\s\S]*?isRetiredChallengerCard/);
assert.match(challengerSource, /function getPackCardPool\(\)[\s\S]*?getChallengerCardPool/);
assert.match(challengerSource, /function getBooster2CardPool\(\)[\s\S]*?getChallengerCardPool/);
assert.match(challengerSource, /function getBooster3CardPool\(\)[\s\S]*?getChallengerCardPool/);

console.log('cards 101-103 remain implemented but are retired from game and booster pools');
