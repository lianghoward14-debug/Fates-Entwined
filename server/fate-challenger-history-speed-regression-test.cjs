#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

for(const file of ['09-challenger-mode.js', '09-challenger-v2.js']){
  const source = fs.readFileSync(path.join(root, 'src/scripts', file), 'utf8');
  const leaderboardStart = source.indexOf('showLeaderboard = async function');
  const leaderboard = source.slice(leaderboardStart, source.indexOf('\n};', leaderboardStart) + 3);
  assert.doesNotMatch(leaderboard, /await window\.FateOnlineReady|await window\.FateOnline\.syncSharedAIRoster|await window\.FateOnline\.refreshFlyLeaderboard/,
    `${file} must paint the cached leaderboard without waiting for network hydration`);
  assert.match(leaderboard, /Promise\.all\(refreshes\)[\s\S]*showLeaderboard\(page, \{skipFresh:true\}\)/,
    `${file} must refresh an open leaderboard after background hydration`);
  assert.match(source, /activeImg[\s\S]{0,600}currentName[\s\S]{0,300}return activeImg/,
    `${file} must save the active user's portrait into recent match history`);
  assert.match(source, /m\.p1Img \|\| \(m\.p1 === USER_PROFILE\?\.username[\s\S]{0,300}getProfileImgSrc\('square'\)/,
    `${file} must repair older recent-match rows from the active profile`);
}

const endgame = fs.readFileSync(path.join(root, 'src/styles/endgame.css'), 'utf8');
assert.match(endgame, /win-reward-rank-box\s*\{[\s\S]{0,180}grid-column: auto;[\s\S]{0,180}justify-self: start;[\s\S]{0,180}width: max-content;/,
  'desktop end-screen rank panel must not span empty reward columns');
assert.match(endgame, /win-rank-badge-large[\s\S]{0,180}width: max-content;/,
  'end-screen rank badge wrapper must shrink to its badge');
assert.match(endgame, /grid-template-columns: auto max-content;[\s\S]{0,180}justify-content: start;/,
  'end-screen rank badge must not stretch an empty label column');

console.log('Challenger history portraits, immediate leaderboard, and end-screen rank pill checks passed');
