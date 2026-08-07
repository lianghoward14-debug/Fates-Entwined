import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = fs.readFileSync(
  path.join(root, 'server', 'authoritative-v3', 'phase5-browser-interaction-harness.html'),
  'utf8'
);
const source = fs.readFileSync(
  path.join(root, 'server', 'authoritative-v3', 'phase5-browser-interaction-harness.mjs'),
  'utf8'
);

assert.match(html, /phase5-browser-interaction-harness\.mjs/);
assert.match(source, /params\.get\('fateV3BrowserCoverage'\) === '1'/);
assert.match(source, /authorityRoutingChanged:false/);
for(const scenario of [
  'consolidation',
  'adaptive',
  'movement',
  'activation',
  'hand-limit',
  'landscape',
  'geometry',
  'multi-card',
  'multi-square',
  'resume'
]){
  assert.match(source, new RegExp(`name === '${scenario}'`));
}
for(const commandType of [
  'CONSOLIDATE_CARD',
  'SET_ADAPTIVE_TOKEN',
  'MOVE_CARD',
  'ACTIVATE_EFFECT',
  'DISCARD_TO_HAND_LIMIT',
  'ACTIVATE_LANDSCAPE'
]){
  assert.match(source, new RegExp(commandType));
}
assert.match(source, /FateAuthoritativeV3SinglePlayerAdapter\.recover/);
assert.match(source, /refreshHandLimitRequirement/);
assert.doesNotMatch(source, /\bWebSocket\b|\/v3\/socket|FATE_SERVER_AUTHORITATIVE_V3_ENABLED/);
assert.doesNotMatch(source, /fateV3SinglePlayer=1|fateV3Recorder=1|fateV3LegacyCorpus=1/);

console.log('authoritative v3 Phase 5 browser interaction harness smoke test passed');
