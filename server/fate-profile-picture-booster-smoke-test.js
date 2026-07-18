#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'latin1');

function pngDimensions(relativePath) {
  const file = fs.readFileSync(path.join(root, relativePath));
  assert(file.length > 24, `${relativePath} must be a valid PNG`);
  assert.strictEqual(file.subarray(1, 4).toString('ascii'), 'PNG', `${relativePath} must have a PNG signature`);
  return {width:file.readUInt32BE(16), height:file.readUInt32BE(20)};
}

const profileSource = read('src/scripts/03-profile-and-progression.js');
const challengerSource = read('src/scripts/09-challenger-mode.js');
const challengerV2Source = read('src/scripts/09-challenger-v2.js');
const indexSource = read('index.html');

assert.match(profileSource, /const ALL_PFP_IDS = Array\.from\(\{length:100\}/, 'profile booster pool must include IDs 1-100');
assert.match(profileSource, /filter\(n=>n>=1 && n<=100\)/, 'owned profile normalization must retain IDs 81-100');
assert.match(challengerSource, /generateProfilePack\(\)[\s\S]*grantProfilePictures\(pack\)/, 'store booster must draw and grant from the shared profile pool');
assert.match(challengerV2Source, /generateProfilePack\(\)[\s\S]*grantProfilePictures\(pack\)/, 'alternate store renderer must draw and grant from the shared profile pool');
assert.match(indexSource, /03-profile-and-progression\.js\?v=1784390001/, 'profile pool release must be cache-busted');

for(let id = 80; id <= 100; id += 1) {
  const cardPath = `${id}.png`;
  const pfpPath = `pfp/pfp${id}.png`;
  assert(fs.existsSync(path.join(root, cardPath)), `${cardPath} must exist`);
  assert(fs.existsSync(path.join(root, pfpPath)), `${pfpPath} must exist`);
  const dimensions = pngDimensions(pfpPath);
  assert(dimensions.width >= 570 && dimensions.height >= 440, `${pfpPath} must retain a full rectangular art crop`);
  if(id >= 81) assert.deepStrictEqual(dimensions, {width:591, height:453}, `${pfpPath} must match the pfp80 crop template`);
}

console.log('fate profile picture booster smoke passed (pfp1-pfp100)');
