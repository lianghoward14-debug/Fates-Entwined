#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(rel){
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function assertContains(file, pattern, message){
  const text = read(file);
  assert.match(text, pattern, `${file}: ${message}`);
}

function assertNotContains(file, pattern, message){
  const text = read(file);
  assert.doesNotMatch(text, pattern, `${file}: ${message}`);
}

assertContains('src/scripts/15-online-auth.js',
  /const\s+rawRtdb\s*=\s*rtdbDisabledMode\(\)\s*\?\s*null\s*:\s*getDatabase\(app\)/,
  'must not initialize getDatabase when RTDB-disabled mode is active');
assertContains('src/scripts/15-online-auth.js',
  /rtdbAvailable\(\)[\s\S]*!\s*rtdbDisabledMode\(\)\s*&&\s*!!rtdb/,
  'must expose an RTDB availability helper that respects the kill switch');

assertContains('src/scripts/14-cloud-save.js',
  /function\s+_rtdbDisabledMode\(\)[\s\S]*fateRtdbDisabled[\s\S]*FATE_RTDB_DISABLED/,
  'cloud save must explicitly know RTDB-disabled mode');
assertContains('src/scripts/14-cloud-save.js',
  /if\(_useFlyCloudSave\(\)\s*\|\|\s*_rtdbDisabledMode\(\)\)\s*return\s+null/,
  'cloud save must fail closed instead of using Firebase when RTDB is disabled');

assertContains('src/scripts/16-online-core.js',
  /function\s+rtdbDisabledMode\(\)[\s\S]*fateRtdbDisabled[\s\S]*FATE_RTDB_DISABLED/,
  'profile core must explicitly know RTDB-disabled mode');
assertContains('src/scripts/16-online-core.js',
  /if\(rtdbDisabledMode\(\)\s*\|\|\s*!FO\.rtdb\)\s*return\s*\(\)\s*=>\s*\{\}/,
  'profile subscriptions must not fall back to publicProfiles RTDB when disabled');

assertContains('src/scripts/17-online-social.js',
  /function\s+firebaseSocialAllowed\(\)[\s\S]*!\s*rtdbDisabledMode\(\)[\s\S]*FO\.rtdb/,
  'social Firebase fallback must be gated by the RTDB kill switch');
assertContains('src/scripts/17-online-social.js',
  /if\(!u\s*\|\|\s*!firebaseSocialAllowed\(\)\)/,
  'social listeners must fail closed when Firebase social fallback is forbidden');
assertContains('src/scripts/17-online-social.js',
  /if\(!firebaseSocialAllowed\(\)\s*\|\|\s*!FO\.push\)\{\s*throw\s+new\s+Error\('World chat service is not ready'\)/,
  'world chat sends must not write to RTDB when disabled');
assertContains('src/scripts/17-online-social.js',
  /if\(!firebaseSocialAllowed\(\)\s*\|\|\s*!FO\.push\s*\|\|\s*!FO\.update\)/,
  'direct messages must not write to RTDB when disabled');

assertContains('src/scripts/18-online-rooms.js',
  /function\s+firebaseRoomTransportAllowed\(\)[\s\S]*!\s*rtdbDisabledMode\(\)\s*&&\s*!\s*flyRoomsEnabled\(\)/,
  'legacy Firebase room transport must be disabled in Fly or RTDB-disabled mode');
assertContains('src/scripts/18-online-rooms.js',
  /firebaseRoomTransportAllowed:\s*firebaseRoomTransportAllowed\(\)/,
  'authority diagnostics must expose Firebase room fallback status');

assertContains('src/scripts/19-online-elo.js',
  /function\s+firebaseLeaderboardAllowed\(\)[\s\S]*!\s*rtdbDisabledMode\(\)[\s\S]*FO\.rtdb/,
  'leaderboard/shared-AI Firebase fallback must be gated by the RTDB kill switch');
assertContains('src/scripts/19-online-elo.js',
  /if\(!firebaseLeaderboardAllowed\(\)\s*\|\|\s*lbUnsub\)\s*return/,
  'leaderboard listener must not subscribe to RTDB when disabled');

assertContains('src/scripts/20-online-economy.js',
  /function\s+rtdbDisabledMode\(\)[\s\S]*fateRtdbDisabled[\s\S]*FATE_RTDB_DISABLED/,
  'economy/community feeds must explicitly know RTDB-disabled mode');
assertContains('src/scripts/20-online-economy.js',
  /return\s+!flyEconomyEnabled\(\)\s*&&\s*!rtdbDisabledMode\(\)\s*&&\s*!!\(FO\.rtdb/,
  'economy/community Firebase fallback must be gated by the RTDB kill switch');

assertContains('src/scripts/22-spectator.js',
  /function\s+firebaseSpectatorAllowed\(\)[\s\S]*!\s*rtdbDisabledMode\(\)[\s\S]*f\.rtdb/,
  'spectator/live-match Firebase fallback must be gated by the RTDB kill switch');
assertContains('src/scripts/22-spectator.js',
  /if\(!firebaseSpectatorAllowed\(\)\s*\|\|\s*!FO\(\)\.onValue\)\s*return/,
  'spectator listeners must not subscribe to RTDB when disabled');

assertContains('src/scripts/10-init.js',
  /function\s+missionFirebaseLiveAllowed\(FO\)[\s\S]*!\s*missionRtdbDisabledMode\(\)[\s\S]*FO\.rtdb/,
  'Mission Control live-match fallback must be gated by the RTDB kill switch');

assertContains('fly.toml',
  /FATE_WS_DISABLE_FIREBASE_RTDB\s*=\s*['"]1['"][\s\S]*FATE_RTDB_DISABLED\s*=\s*['"]1['"]/,
  'Fly config must deploy with server and client RTDB kill switches enabled');
assertContains('Dockerfile',
  /CMD\s+\["node",\s*"server\/fate-ws-authority\.js"\]/,
  'Fly image must start the authority server');
assertNotContains('Dockerfile',
  /solo-static-server|electron/i,
  'Fly image must not launch desktop/static-server tooling');
assertContains('.dockerignore',
  /^\*[\s\S]*^!index\.html[\s\S]*^!server\/\*\*[\s\S]*^!src\/\*\*[\s\S]*^!optimized\/\*\*[\s\S]*^!soundeffects\/\*\*[\s\S]*^!fates-entwined-website\/\*\*/m,
  'Docker build context must remain default-deny with explicit playable-game and authority allowlists');

console.log('fate-rtdb-disconnect-static smoke passed');
