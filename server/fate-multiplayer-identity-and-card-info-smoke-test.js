'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file=>fs.readFileSync(path.join(root, file), 'utf8');
const auth = read('src/scripts/15-online-auth.js');
const rooms = read('src/scripts/18-online-rooms.js');
const rendering = read('src/scripts/06-rendering-and-helpers.js');

assert.match(auth,
  /function localPhoto\(profile\)[\s\S]{0,900}const explicit = value\.profileImg \|\| value\.photoURL \|\| value\.pfp \|\| value\.img[\s\S]{0,700}getProfileImgSrc/,
  'multiplayer profile resolution must prefer the supplied player photo before the local account fallback');
assert.match(rooms,
  /mergeRoomPublicProfile\(room\.hostUid, hostNode, hostNode\.profileSnapshot, hostNode\.profile, liveProfiles\.get\(room\.hostUid\)\)/,
  'host in-game identity must include top-level room player fields');
assert.match(rooms,
  /mergeRoomPublicProfile\(room\.guestUid, guestNode, guestNode\.profileSnapshot, guestNode\.profile, liveProfiles\.get\(room\.guestUid\)\)/,
  'guest in-game identity must include top-level room player fields');
assert.match(rendering,
  /The Blame Game', 'Your Supporters are classified as Characters\.'/,
  'Rozsi and Zsofia Youth status banner must state the full classification rule');
assert.doesNotMatch(rendering,
  /The Blame Game', 'Supporters are classified as Characters for consolidation\.'/,
  'Rozsi and Zsofia Youth status banner must not retain the obsolete consolidation-only wording');
assert.match(rendering,
  /const isAdaptiveTacticsToken = typeof isAchillesAdaptiveToken[\s\S]{0,220}!isAdaptiveTacticsToken\)/,
  'Adaptive Tactics token card information must suppress the voice button');

console.log('Multiplayer identity and card-information smoke test passed.');
