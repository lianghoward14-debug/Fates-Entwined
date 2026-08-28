'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const rendering = read('src', 'scripts', '06-rendering-and-helpers.js');
const smoothness = read('src', 'scripts', '21-smoothness-core.js');
const structural = read('src', 'scripts', '00-structural-helpers.js');
const renderer = read('src', 'scripts', 'render-v2', '04-match-renderer-adapter.js');
const motionFx = read('src', 'scripts', 'render-v2', '10-card-motion-fx.js');
const director = read('src', 'scripts', 'render-v2', '11-vfx-director.js');
const recipes = read('src', 'scripts', 'render-v2', '13-vfx-recipes.js');
const presenter = read('src', 'scripts', 'render-v2', '17-action-presentation.js');
const online = read('src', 'scripts', '18-online-rooms.js');

assert.match(
  rendering,
  /document\.body\.appendChild\(overlay\);\s*document\.body\.classList\.add\('cinematic-lock'\);[\s\S]{0,1400}showCinematicSubtitle\(subtitle,[\s\S]{0,900}overlay\.appendChild\(subEl\)/,
  'the subtitle must mount synchronously inside the same live overlay as the consolidation card'
);
assert.doesNotMatch(
  rendering.match(/function showConsolidationCinematic\(card, opts\)[\s\S]*?\n}\n\nfunction requestCharacterSetCinematic/)?.[0] || '',
  /setTimeout\(function\(\)\{[\s\S]{0,300}showCinematicSubtitle/,
  'consolidation subtitle mounting must not depend on a timer race'
);
assert.match(
  smoothness,
  /sel === '\.cinematic-subtitle-live'[\s\S]{0,260}inside-consolidation-cinematic[\s\S]{0,180}closest\('\.cc-overlay-v2'\)/,
  'focus/visibility cleanup must preserve a subtitle owned by a live consolidation overlay'
);

assert.match(structural, /function triggerPlacementAnimation\(\) \{\s*purgeRetiredCardSetMotion\(\);\s*return 0;/,
  'the legacy DOM placement entry point must remain inert');
assert.match(renderer, /function queuePlacementMotion\(iid, fromRect\)\{\s*return false;/,
  'the renderer placement timeline entry point must remain inert');
assert.match(motionFx, /if\(BOARD_PLACEMENT_RECIPES\.has\(recipe\)\) return false;/,
  'the card-motion facade must reject placement recipes');
assert.match(presenter, /function beginMotionOnly\(type, payload, options\)[\s\S]{0,180}if\(BOARD_PLACEMENT_RECIPES\.has\(recipe\)\) return null;/,
  'motion-only presentation must reject placement recipes');
assert.match(director, /function play\(type, payload, options\)[\s\S]{0,500}if\(BOARD_PLACEMENT_RECIPES\.has\(recipeType\)\) return null;/,
  'the director must reject placement recipes');
assert.match(director, /onLocalIntent:function\(intent\)[\s\S]{0,180}suppressAcceptedBridgeMotion\(intent\.type, intent\.options \|\| \{\}\)/,
  'local VFX intents must use the placement suppression boundary');
assert.match(recipes, /if\(RETIRED_BOARD_PLACEMENT_RECIPES\.has\(recipeName\)\) return \[\];/,
  'direct recipe expansion must produce no placement primitives');
assert.match(online, /const boardPlacement = type === 'PLAY_CARD'[\s\S]{0,180}if\(boardPlacement\) return false;/,
  'authoritative online presentation must reject placement motion');

console.log('consolidation subtitle and retired set-motion smoke test passed');
