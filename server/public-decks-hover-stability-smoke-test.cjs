const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../src/scripts/20-online-economy.js'), 'utf8');

assert.match(source, /function publicDeckFeedSignature\(decks\)[\s\S]{0,700}\.sort\(\)\.join\('\|'\)/,
  'public-deck equality must ignore unstable server ordering');
assert.match(source, /const nextPublicDecks = Object\.entries\(raw\)[\s\S]{0,700}const publicDecksChanged = !wasLoaded/,
  'Firebase updates must compare the next feed before rendering');
assert.match(source, /if\(publicDecksChanged && publicDecksHubOpen\(\) && !publicDeckOpeningId\) showPublicDecks\(publicDecksPage\)/g,
  'both polling transports must render only when visible feed data changed');

const authHandler = source.match(/window\.addEventListener\('fate-online-auth',[\s\S]*?\n  \}\);/);
assert.ok(authHandler, 'online-auth handler must remain installed');
assert.doesNotMatch(authHandler[0], /showPublicDecks\(/,
  'routine authentication events must not replace hovered Public Deck buttons');

console.log('Public decks hover stability smoke test passed.');
