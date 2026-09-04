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
const finalCss = read('src/styles/zz-codex-last.css');

assert.match(profileSource, /const PFP_CATALOG_SIZE = 125;/, 'profile booster catalog must include the 25 Brave Horizons portraits');
assert.match(profileSource, /length:PFP_CATALOG_SIZE/, 'profile booster pool must use the full profile-picture catalog');
assert.match(profileSource, /n<=PFP_CATALOG_SIZE/, 'owned profile normalization must retain every catalog ID');
assert.match(challengerSource, /generateProfilePack\(\)[\s\S]*grantProfilePictures\(pack\)/, 'store booster must draw and grant from the shared profile pool');
assert.match(challengerSource, /profile-pack-full-art[\s\S]*PFP_PATH\(pfpId\)[\s\S]*full art/, 'profile booster rewards must display their complete rectangular artwork');
assert.doesNotMatch(challengerSource, /renderProfilePackReveal\(pfpIds\)[\s\S]{0,1600}PFP_PATH\(pfpId, 'square'\)/, 'profile booster reveal must not request a square crop');
assert.match(finalCss, /profile-pack-art[\s\S]*aspect-ratio:5\/7[\s\S]*object-fit:contain/, 'profile booster pack art must retain its complete portrait artwork');
assert.match(finalCss, /profile-pack-full-art[\s\S]*aspect-ratio:591\/453[\s\S]*object-fit:contain/, 'profile picture rewards must retain their complete landscape artwork');
assert.match(challengerV2Source, /generateProfilePack\(\)[\s\S]*grantProfilePictures\(pack\)/, 'alternate store renderer must draw and grant from the shared profile pool');
assert.match(indexSource, /03-profile-and-progression\.js\?v=\d+/, 'profile pool release and preset order polish must be cache-busted');

for(let id = 80; id <= 100; id += 1) {
  const cardPath = `${id}.png`;
  const pfpPath = `pfp/pfp${id}.png`;
  assert(fs.existsSync(path.join(root, cardPath)), `${cardPath} must exist`);
  assert(fs.existsSync(path.join(root, pfpPath)), `${pfpPath} must exist`);
  const dimensions = pngDimensions(pfpPath);
  assert(dimensions.width >= 570 && dimensions.height >= 440, `${pfpPath} must retain a full rectangular art crop`);
  if(id >= 81) assert.deepStrictEqual(dimensions, {width:591, height:453}, `${pfpPath} must match the pfp80 crop template`);
}

for(let id = 101; id <= 125; id += 1) {
  const braveHorizonsId = id - 100;
  const cardPath = `bh${braveHorizonsId}.png`;
  const pfpPath = `pfp/pfp${id}.png`;
  const thumbPath = `optimized/pfp-thumbs/pfp${id}.jpg`;
  assert(fs.existsSync(path.join(root, cardPath)), `${cardPath} must exist`);
  assert(fs.existsSync(path.join(root, pfpPath)), `${pfpPath} must exist`);
  assert(fs.existsSync(path.join(root, thumbPath)), `${thumbPath} must exist`);
  assert.deepStrictEqual(pngDimensions(pfpPath), {width:591, height:453}, `${pfpPath} must match the profile art crop template`);
}

console.log('fate profile picture booster smoke passed (pfp1-pfp125)');
