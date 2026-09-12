#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const setup = fs.readFileSync(path.join(root, 'src/scripts/04-game-setup.js'), 'utf8');
const rendering = fs.readFileSync(path.join(root, 'src/scripts/06-rendering-and-helpers.js'), 'utf8');

assert.match(setup, /function clearCompletedOnlineSessionBeforeLocalGame\(\)[\s\S]*G\.playerProfiles = null;/,
  'starting single-player must clear online and Warfront seat profile snapshots');
assert.match(rendering, /const isLocalHuman = !!G\.aiEnabled && Number\(playerIndex\) !== Number\(G\.aiPlayer\);[\s\S]{0,180}if\(isLocalHuman\)/,
  'single-player banner identity must be selected by the human seat, not a hard-coded player index');
assert.match(rendering, /if\(isLocalHuman\)[\s\S]{0,500}name: USER_PROFILE\.username[\s\S]{0,500}img: getProfileImgSrc\(\)/,
  'single-player human banner must use the active local name and portrait');
assert.match(rendering, /const matchProfile = G\.playerProfiles && G\.playerProfiles\[playerIndex\];[\s\S]{0,120}normalizeOnlineBannerProfile/,
  'multiplayer banners must continue using authoritative per-seat profiles');

console.log('Single-player and multiplayer match profile identity regression checks passed');
