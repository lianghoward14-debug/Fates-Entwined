import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {cardCoverageInventory} from '../../shared/engine/cards/registry.mjs';

const require = createRequire(import.meta.url);
const {getCardCatalog} = require('../fate-card-catalog.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const engineRoot = path.join(root, 'shared', 'engine');

function files(dir){
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(entry=>{
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? files(target) : [target];
  });
}

const engineSource = files(engineRoot).map(file=>fs.readFileSync(file, 'utf8')).join('\n');
assert.doesNotMatch(engineSource, /\bMath\.random\s*\(/, 'shared engine must not use Math.random');
assert.doesNotMatch(engineSource, /\bDate\.now\s*\(/, 'shared engine must not read wall-clock time');
assert.doesNotMatch(engineSource, /\bdocument\.|\bwindow\.|localStorage|WebSocket/, 'shared engine must not access browser or transport APIs');
assert.doesNotMatch(engineSource, /setTimeout|setInterval/, 'shared engine must not store timer-driven rules');

const legacyServer = fs.readFileSync(path.join(root, 'server', 'fate-ws-authority.js'), 'utf8');
assert.doesNotMatch(legacyServer, /authoritative-v3|FATE_SERVER_AUTHORITATIVE_V3_ENABLED/, 'legacy server must not dispatch into v3');
const v3Server = fs.readFileSync(path.join(root, 'server', 'authoritative-v3', 'server.mjs'), 'utf8');
assert.match(v3Server, /FATE_SERVER_AUTHORITATIVE_V3_ENABLED\s*!==\s*'1'/);
assert.doesNotMatch(v3Server, /fate-authority-reducer|fate-ws-authority/, 'v3 must not import legacy authority code');

const inventory = cardCoverageInventory(getCardCatalog().cards);
assert.equal(inventory.length, getCardCatalog().cards.length);
assert.equal(inventory.every(item=>['vertical-slice-beta', 'unsupported'].includes(item.multiplayerEligibility)), true);
assert.equal(
  inventory.every(item=>item.multiplayerEligibility === 'vertical-slice-beta'),
  true,
  'the completed Phase 4 registry must cover every catalog card'
);

console.log('authoritative v3 architecture smoke test passed');
