const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative=>fs.readFileSync(path.join(root, relative), 'utf8');
const renderer = read('src/scripts/render-v2/04-match-renderer-adapter.js');
const motion = read('src/scripts/render-v2/10-card-motion-fx.js');
const recipes = read('src/scripts/render-v2/13-vfx-recipes.js');
const index = read('index.html');

assert.match(renderer, /rect:item\.hitRect \|\| item\.rect, motionRect:item\.rect/, 'hand hit maps must retain a separate unwarped motion rectangle');
assert.match(motion, /slot\.motionRect \|\| slot\.rect/, 'hand arrivals must target the visual card plane instead of its padded hit box');
assert.match(motion, /hit\.motionRect \|\| hit\.rect/, 'hand departures must also originate from the visual card plane');
assert.match(recipes, /function fitCardAspect\(rect\)[\s\S]{0,700}const aspect = 1\.4/, 'card arrivals must have a canonical 5:7 aspect fitter');
assert.match(recipes, /const from = fitCardAspect\(payloadRect\(p, \['fromRect', 'deckRect', 'sourceRect'\]\)\);[\s\S]{0,180}const to = fitCardAspect/, 'draw animation endpoints must be aspect-normalized');
assert.match(recipes, /function searchToHand[\s\S]{0,260}const from = fitCardAspect[\s\S]{0,180}const to = fitCardAspect/, 'searched cards entering hand must also remain unwarped');
assert.match(index, /13-vfx-recipes\.js\?v=1788129101[\s\S]*04-match-renderer-adapter\.js\?v=1788129101[\s\S]*10-card-motion-fx\.js\?v=1788129101/, 'the fixed motion stack must be cache-busted together');

console.log('hand arrival aspect-ratio smoke test passed');
