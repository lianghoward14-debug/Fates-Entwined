'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const main = read('electron/main.js');
const index = read('index.html');
const setup = read('src/scripts/04-game-setup.js');
const smoothness = read('src/scripts/21-smoothness-core.js');
const legacyBoard = read('src/scripts/23-board-canvas-renderer.js');
const textureCache = read('src/scripts/render-v2/03-card-texture-cache.js');
const adapter = read('src/scripts/render-v2/04-match-renderer-adapter.js');
const vfx = read('src/scripts/render-v2/11-vfx-director.js');

assert.match(main, /fullscreen:\s*START_FULLSCREEN/, 'desktop must not force exclusive fullscreen');
assert.match(main, /win\.maximize\(\)/, 'desktop should retain a maximized presentation');
assert.match(main, /render-process-gone/, 'renderer crashes must be logged');
assert.match(main, /child-process-gone/, 'GPU/child process crashes must be logged');

assert.match(adapter, /ELECTRON_LAYER_PIXEL_BUDGET\s*=\s*26000000/, 'match canvases need an aggregate pixel budget');
assert.match(adapter, /canvas\.width = 1[\s\S]{0,100}canvas\.height = 1/, 'layer prewarm must remain allocation-light');
assert.match(adapter, /__fateSkipNextRendererV2ScreenEnter/, 'screen-entry duplicate render guard is missing');

const helper = setup.match(/function showGameScreenForInitialRender\(\) \{([\s\S]*?)\n\}/);
assert.ok(helper, 'safe game-screen helper is missing');
assert.match(helper[1], /showScreen\('s-game'\)/, 'safe helper must enter the game screen');
assert.doesNotMatch(helper[1], /showGameScreenForInitialRender\(\)/, 'safe helper must not recurse');
assert.strictEqual((setup.match(/showGameScreenForInitialRender\(\);/g) || []).length, 2, 'both local and online entry paths must use the safe helper');
assert.match(setup, /requestAnimationFrame\(function\(\)\{ requestAnimationFrame\(run\); \}\)/, 'initial render must wait for stable layout');

assert.match(textureCache, /maxPixels:32000000/, 'texture cache memory cap regressed');
assert.match(textureCache, /const boardDpr = Math\.min\(1\.5, Math\.max\(1,/, 'visible texture DPR must remain bounded');
[smoothness, legacyBoard, vfx, adapter].forEach(source => {
  assert.doesNotMatch(source, /Math\.max\(2\.25,\s*(?:Number\()?window\.devicePixelRatio/, 'a match texture path still forces excessive DPR');
});

assert.match(index, /04-game-setup\.js\?v=1787390001/, 'match-entry cache stamp is stale');
assert.match(index, /04-match-renderer-adapter\.js\?v=1787630001/, 'renderer cache stamp is stale');

console.log('match-entry crash guard smoke passed');
