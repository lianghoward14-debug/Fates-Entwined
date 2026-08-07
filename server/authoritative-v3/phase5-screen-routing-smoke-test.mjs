import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  fateV3CommandsForCard,
  fateV3ScreenCommandLabel
} from '../../src/scripts/authoritative-v3-single-player-screen.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = relative=>fs.readFileSync(path.join(root, ...relative.split('/')), 'utf8');
const indexSource = read('index.html');
const setupSource = read('src/scripts/04-game-setup.js');
const renderSource = read('src/scripts/06-rendering-and-helpers.js');
const matchRendererSource = read('src/scripts/render-v2/04-match-renderer-adapter.js');
const handDragSource = read('src/scripts/render-v2/09-hand-drag-bridge.js');
const adapterSource = read('src/scripts/authoritative-v3-single-player-adapter.mjs');
const screenSource = read('src/scripts/authoritative-v3-single-player-screen.mjs');

assert.match(
  indexSource,
  /if\(params\.get\('fateV3SinglePlayer'\) !== '1'\) return;\s*import\('\.\/src\/scripts\/authoritative-v3-single-player-adapter\.mjs'\)/
);
assert.match(
  setupSource,
  /get\('fateV3SinglePlayer'\) === '1'[\s\S]{0,600}return authority\.startFromLegacyUi\(\{vsAI:vsAI === true\}\)/
);
assert(
  setupSource.indexOf("get('fateV3SinglePlayer') === '1'")
    < setupSource.indexOf('const keepHowardDevMode'),
  'v3 route must claim start before legacy setup mutates match state'
);
assert.doesNotMatch(setupSource, /import\(['"].*authoritative-v3/);

assert.match(
  matchRendererSource,
  /fate-authority-v3-single-player-active'\)\) return false/,
  'canvas renderer must relinquish board, hand, opponent hand, and piles'
);
assert(
  (renderSource.match(/FateAuthorityV3SinglePlayer\?\.currentScreen\?\.\(\)/g) || []).length >= 4,
  'legacy render entry points must delegate to the active v3 screen'
);
assert(
  (handDragSource.match(/fate-authority-v3-single-player-active/g) || []).length >= 5,
  'legacy hand input capture must relinquish pointer, click, and context-menu ownership'
);

assert.match(adapterSource, /startFromLegacyUi\(options = \{\}\)/);
assert.match(adapterSource, /new FateAuthoritativeV3SinglePlayerScreen/);
assert.match(screenSource, /this\.adapter\.dispatchLegalCommand\(command\)/);
assert.match(screenSource, /this\.adapter\.runAiTurn\(\)/);
assert.match(screenSource, /dataset\.fateV3Cell\s*=\s*'1'/);
assert.doesNotMatch(screenSource, /\bG\b|selectHandCard\(|clickCell\(|\bendTurn\(/);
assert.doesNotMatch(screenSource, /\bWebSocket\b|\/v3\/socket|FATE_SERVER_AUTHORITATIVE_V3_ENABLED/);

const sampleCommands = [
  {type:'SET_CARD', payload:{cardIid:'card-a', destination:{z:0, r:2, c:1}}},
  {type:'MOVE_CARD', payload:{cardIid:'card-b', destination:{z:1, r:1, c:2}}},
  {type:'ACTIVATE_EFFECT', payload:{sourceIid:'card-b'}},
  {type:'END_TURN', payload:{}}
];
assert.deepEqual(fateV3CommandsForCard(sampleCommands, 'card-a'), [sampleCommands[0]]);
assert.deepEqual(fateV3CommandsForCard(sampleCommands, 'card-b'), [sampleCommands[1], sampleCommands[2]]);
assert.equal(fateV3CommandsForCard(sampleCommands, 'missing').length, 0);
assert.equal(fateV3ScreenCommandLabel(sampleCommands[0]), 'Set card — Zone 1, Row 3, Square 2');
assert.equal(fateV3ScreenCommandLabel(sampleCommands[1]), 'Move card — Zone 2, Row 2, Square 3');
assert.equal(fateV3ScreenCommandLabel(sampleCommands[2]), 'Activate effect');

console.log('authoritative v3 Phase 5 screen routing smoke test passed');
