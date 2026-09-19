'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const banner = fs.readFileSync('src/scripts/render-v2/22-activation-banner.js', 'utf8');
assert.match(
  banner,
  /id === 'whisper17'[\s\S]{0,100}'pfp\/pfp-shizuku\.png'/,
  'Shizuku activation banners must use the portrait cropped from her card art'
);
assert.ok(fs.existsSync('pfp/pfp-shizuku.png'), 'Shizuku portrait crop must exist');

console.log('Shizuku activation banner uses her card-art portrait crop');
