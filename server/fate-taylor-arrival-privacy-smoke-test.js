'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const setup = fs.readFileSync(path.join(root, 'src/scripts/04-game-setup.js'), 'utf8');
const online = fs.readFileSync(path.join(root, 'src/scripts/18-online-rooms.js'), 'utf8');

assert.match(setup,
  /presentTaylorArrival = typeof isPerspectivePlayer !== 'function' \|\| isPerspectivePlayer\(targetPlayer\)[\s\S]{0,700}if\(presentTaylorArrival\) toast\('The Art of Mimicry created a second Taylor in your hand\.'\)/,
  'bot/single-player Taylor arrival feedback must only be shown to the owning perspective');
assert.match(online,
  /if\(Number\(entry\.playerIndex\) !== Number\(state\._onlinePlayerIndex\)\) return;[\s\S]{0,500}created a second Taylor in your hand/,
  'multiplayer Taylor arrival feedback must only be shown to the owning client');

console.log('Taylor arrival privacy smoke test passed.');
