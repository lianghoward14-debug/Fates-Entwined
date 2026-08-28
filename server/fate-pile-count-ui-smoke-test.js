'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const codexUi = read('src', 'scripts', '45-match-ui-codex.js');
const onlineRooms = read('src', 'scripts', '18-online-rooms.js');

assert.match(
  onlineRooms,
  /active:phase7CurrentUiActive,\s*view\(\)\{\s*return phase7CurrentUiSession\.view \? cloneOnlinePlain\(phase7CurrentUiSession\.view\) : null;/,
  'the current multiplayer UI must expose its latest authoritative projection'
);
assert.match(
  codexUi,
  /function currentAuthoritativeView\(\)[\s\S]*FateAuthorityV3SinglePlayer[\s\S]*FatePhase7CurrentMultiplayerUi[\s\S]*multiplayer\.view\?\.\(\)/,
  'the visible pile counters must resolve both local and multiplayer authoritative views'
);
assert.match(
  codexUi,
  /const localState=invoke\('getFateGameState'\)\|\|window\.FATE_GAME_STATE\|\|null;[\s\S]*localState\?\.players\?\.\[seat\]/,
  'classic local games must read the lexical game state through its public bridge'
);
assert.doesNotMatch(
  codexUi,
  /window\.G/,
  'the Codex HUD must not read window.G because classic local state is a lexical global'
);
assert.match(
  codexUi,
  /const pilePlayer=currentPilePlayer\(self\);[\s\S]*const discardCards=pilePlayer\?\.discard;/,
  'the discard artwork must use the same current player projection as the counters'
);
assert.match(
  codexUi,
  /Number\.isFinite\(Number\(pilePlayer\.deckCount\)\)[\s\S]*Array\.isArray\(pilePlayer\.discard\)\?pilePlayer\.discard\.length/,
  'deck and discard labels must derive their values from the resolved pile projection'
);

console.log('pile count UI smoke test passed');
