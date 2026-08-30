'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const online = fs.readFileSync(path.join(root, 'src/scripts/18-online-rooms.js'), 'utf8');
const rendering = fs.readFileSync(path.join(root, 'src/scripts/06-rendering-and-helpers.js'), 'utf8');

assert.match(online,
  /String\(card\.id \|\| ''\) === 'bh05'[\s\S]{0,1500}_bh05CopiedCardId = taylorCopiedId[\s\S]{0,800}_bh05CopiedPrintedEffect/,
  'authoritative Taylor projection must expose its resolved copied effect to both players');
assert.match(online,
  /without exposing the source pile or iid/,
  'Taylor projection must document the hidden-information boundary');
assert.match(rendering,
  /function buildTaylorCopyBannerHTML\(card\)[\s\S]{0,600}_bh05CopiedPrintedEffect/,
  'Taylor card information must render the publicly projected copied effect');
assert.match(rendering,
  /!hideCard \? buildWhisperTokenCopyBannerHTML\(card\) \+ buildTaylorCopyBannerHTML\(card\) : ''/,
  'either player must receive Taylor copy details when the board card is visible');

console.log('Taylor opponent copy visibility smoke test passed.');
