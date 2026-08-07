'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const rendering = read('src/scripts/06-rendering-and-helpers.js');
const adapter = read('src/scripts/render-v2/04-match-renderer-adapter.js');
const css = read('src/styles/zz-codex-last.css');
const index = read('index.html');

assert.match(rendering, /function presentJimmyDynamicFateGain[\s\S]*cardActsAsPassive\(card, '41'\)[\s\S]*previous\.signature === signature[\s\S]*next\.value <= previous\.value[\s\S]*playFateChangeSound\(card, previous\.value, next\.value, card\.owner\)[\s\S]*flashCardEffect\(card, 'jimmy_wrath'[\s\S]*onlineRemote:true/, 'Jimmy must start the generic Fate gain and its overlay together only for a new reduction-count increase');
assert.match(rendering, /function getCachedEffectiveFate[\s\S]*getEffectiveFate\(card, z\)[\s\S]*presentJimmyDynamicFateGain\(card, value\)/, 'Jimmy detection must run through the shared effective-Fate renderer used by single-player and online state application');
assert.match(adapter, /jimmy_wrath:\{color:'rgba\(255,92,82,\.99\)'[\s\S]*kind === 'jimmy_wrath'[\s\S]*line\(\[\[10,14\],\[19,6\],\[45,6\]/, 'canvas cards must draw the selected red clenched-teeth Jimmy face');
assert.match(css, /effect-flash-jimmy_wrath[\s\S]*--effect-flash-color:rgba\(255,92,82,\.99\)[\s\S]*M17 48H46L41 55H23Z/, 'DOM cards must draw the matching red clenched-teeth Jimmy face');
assert.match(index, /06-rendering-and-helpers\.js\?v=1785354011[\s\S]*04-match-renderer-adapter\.js\?v=1785354012[\s\S]*jimmy-wrath-overlay-20260801-1785354013/, 'the Electron client must load the Jimmy overlay revision');

console.log('Jimmy wrath overlay smoke test passed');
