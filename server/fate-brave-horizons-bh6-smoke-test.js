#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = relative=>fs.readFileSync(path.join(ROOT, relative), 'utf8');
const structural = read('src/scripts/00-structural-helpers.js');
const gameplay = read('src/scripts/05-gameplay-core.js');
const rendering = read('src/scripts/06-rendering-and-helpers.js');
const css = read('src/styles/zz-codex-last.css');
const index = read('index.html');

assert.strictEqual((css.match(/Adaptive Tactics token declaration — canonical picker layout/g) || []).length, 1, 'Adaptive Tactics must have one canonical CSS implementation');
assert.doesNotMatch(css, /Adaptive Tactics declaration v[1-4]|Achille Laurent .* intentionally isolated|BH6 declaration dossier|Adaptive Tactics final theme/, 'obsolete Adaptive Tactics picker generations must be removed');
assert.match(css, /\.achilles-token-picker\{[\s\S]*grid-template-columns:154px minmax\(0,1fr\)[\s\S]*grid-template-rows:auto/, 'desktop picker must have one dossier column and one fluid workspace column');
assert.match(css, /\.achilles-token-dossier\{[\s\S]*grid-column:1[\s\S]*grid-row:1[\s\S]*grid-template-columns:minmax\(0,1fr\)/, 'the dossier must reset the stale three-column internal grid');
assert.match(css, /\.achilles-token-identity\{[\s\S]*writing-mode:horizontal-tb[\s\S]*word-break:normal/, 'token identity text must remain horizontal and readable');
assert.match(css, /\.achilles-token-workspace\{[\s\S]*grid-column:2[\s\S]*grid-row:1/, 'the declaration workspace must occupy the second desktop column explicitly');
assert.doesNotMatch(gameplay, /BH6 TOKEN/, 'the token dossier label must simply read TOKEN');
assert.match(gameplay, /achilles-token-identity"><span>TOKEN<\/span>/, 'the token dossier must retain the simplified TOKEN label');
assert.match(gameplay, /const glyphMarkup = config\.kind === 'type' \? ''/, 'card-type entries must omit the I, I, D, C, and S glyph badges');
assert.match(gameplay, /type === 'Supporter' \? 'Supporter card' : 'Character card'/, 'the Supporter entry must use the full Supporter card description');
assert.match(gameplay, /note:'Counts as consolidated, no cost\.'/i, 'the consolidated placement option must use the concise no-cost description');
assert.doesNotMatch(gameplay, /No tribute is required/, 'the obsolete consolidated placement description must be removed');
assert.doesNotMatch(gameplay, /Anchors & anomalies|Front lines & banners|Beyond the known map|Twilight courts & oaths/, 'affiliation entries must not include decorative descriptions');
assert.match(css, /\.achilles-token-choice-index\{[^}]*font:600 1\.05rem\/1/, 'choice numbers must be substantially larger on every declaration page');
assert.match(css, /data-achilles-kind="type"[\s\S]*achilles-token-choice-name\{[^}]*white-space:nowrap/, 'Coordinator and the other card-type names must stay on one line');
assert.match(css, /data-achilles-kind="type"[\s\S]*achilles-token-choice-name\{[^}]*translateY\(3px\)[\s\S]*achilles-token-choice-note\{[^}]*translateY\(3px\)/, 'card-type names and descriptions must be lowered together by three pixels');
assert.match(css, /data-achilles-kind="affiliation"[\s\S]*achilles-token-choice-name\{[^}]*font-size:1rem/, 'affiliation names must be enlarged after removing their descriptions');
assert.match(css, /achilles-token-choice-reality \.achilles-token-choice-name[\s\S]*achilles-token-choice-eventide \.achilles-token-choice-name\{[^}]*translateY\(5px\)/, 'Reality and Eventide must be lowered by five pixels');

assert.match(structural, /function shouldSuppressConsolidationCinematic\(card\)[\s\S]*return isAchillesAdaptiveToken\(card\);/, 'every Adaptive Tactics token must categorically suppress character cinematics');
assert.doesNotMatch(structural, /function shouldSuppressConsolidationCinematic\(card\)[\s\S]{0,500}_achillesPlayMode/, 'cinematic suppression must not depend on the declared placement mode');
assert.ok((gameplay.match(/_suppressConsolidationCinematic = true;/g) || []).length >= 3, 'generated, configured, and placed token instances must retain cinematic suppression');
assert.match(rendering, /function showConsolidationCinematic\(card, opts\)[\s\S]*shouldSuppressConsolidationCinematic\(card\)/, 'the cinematic entry point must enforce token suppression');
assert.match(rendering, /function requestCharacterSetCinematic\(card, opts\)[\s\S]*shouldSuppressConsolidationCinematic\(card\)/, 'the character-cinematic request path must enforce token suppression');
assert.doesNotMatch(rendering, /Configure Token/, 'Adaptive Tactics must not expose a separate Configure Token hand action');
assert.match(rendering, /const isDirectSetCard = isAchillesToken[\s\S]*place\.textContent='Place on Board'[\s\S]*place\.onclick=\(\)=>placeSelected\(\)/, 'Adaptive Tactics must use the normal Place on Board hand action');

const cssVersion = Number((index.match(/zz-codex-last\.css\?v=(\d+)/) || [])[1]);
const structuralVersion = Number((index.match(/00-structural-helpers\.js\?v=(\d+)/) || [])[1]);
const gameplayVersion = Number((index.match(/05-gameplay-core\.js\?v=(\d+)/) || [])[1]);
const renderingVersion = Number((index.match(/06-rendering-and-helpers\.js\?v=(\d+)/) || [])[1]);
assert.ok(cssVersion >= 1785072302, 'the canonical token layout must be cache-busted');
assert.ok(structuralVersion >= 1785032470, 'the categorical cinematic guard must be cache-busted');
assert.ok(gameplayVersion >= 1785072303, 'token presentation and instance flags must be cache-busted');
assert.ok(renderingVersion >= 1785032474, 'the Adaptive Tactics hand action must be cache-busted');

const helperStart = structural.indexOf('function isAchillesAdaptiveToken');
const helperEnd = structural.indexOf('function isInnatelyFullyEffectImmuneCard', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'Adaptive Tactics helpers must be extractable');
const runtime = {};
vm.createContext(runtime);
vm.runInContext(structural.slice(helperStart, helperEnd), runtime);
['token2','token3','token4','token5'].forEach(id=>{
  assert.strictEqual(runtime.shouldSuppressConsolidationCinematic({id, type:'Dauntless', _achillesPlayMode:'set'}), true, id + ' must suppress a set-character cinematic');
  assert.strictEqual(runtime.shouldSuppressConsolidationCinematic({id, type:'Coordinator', _achillesPlayMode:'consolidated'}), true, id + ' must suppress a consolidated-character cinematic');
});
assert.strictEqual(runtime.shouldSuppressConsolidationCinematic({id:'06', type:'Dauntless'}), false, 'ordinary characters must retain their cinematic');

console.log('Brave Horizons BH6 smoke test passed.');
