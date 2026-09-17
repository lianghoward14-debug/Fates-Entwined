const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const adapter = read('src/scripts/render-v2/04-match-renderer-adapter.js');
const core = read('src/scripts/05-gameplay-core.js');
const sounds = [];
const runtime = {
  window: {}, G: {}, Date,
  playSfx: sound => sounds.push(sound),
  lastCardFateByIid: new Map(), lastFlowerBlessedByIid: new Map(),
  lastSupporterAuraPresentationByIid: new Map(), coordinatorAuraFateDelayUntilByIid: new Map(),
  getTimeline: () => ({clearForCardKind(){}}),
  getCardIid: card => card.iid,
  getCardFateValue: (card, visual) => visual.fate,
  deferPlacementFateReveal: card => !!card._placementFateReveal,
  presentFateDelta(){}, animationsOff: () => false
};
vm.createContext(runtime);
vm.runInContext(core.slice(core.indexOf('function playResolvedFateChangeSfx('), core.indexOf('function playFateChangeSound(')), runtime);
vm.runInContext(adapter.slice(adapter.indexOf('  function observeCardForAnimations('), adapter.indexOf('  function getTributeState(')), runtime);
const card = {id:'88', iid:'rozsi-youth', owner:0};
const observe = value => runtime.observeCardForAnimations(card, {fate:value}, {});
observe(4);
assert.equal(sounds.length, 0, 'initial board observation is not a gain');
runtime.G._cinematicUiLockUntil = Date.now() + 5000;
observe(6);
observe(8);
assert.deepEqual(sounds, ['fateGain', 'fateGain'], 'distinct rapid passive gains during arrivals must both sound');
observe(8);
observe(6);
assert.equal(sounds.length, 2, 'repaints and losses must not produce gain cues');
runtime.animationsOff = () => true;
observe(10);
assert.equal(sounds.length, 3, 'disabling animations must not silence passive gains');
card._suppressNextFatePulse = true;
observe(12);
assert.equal(sounds.length, 3, 'a paired overlay owns its feedback');
card._effectFateVisualDelta = {before:12, after:14, at:Date.now()};
observe(14);
assert.equal(sounds.length, 3, 'explicit effect feedback must not be duplicated');
delete card._effectFateVisualDelta;
card._pendingFateOverlaySync = {before:14, after:16};
observe(16);
assert.equal(sounds.length, 3, 'pending explicit feedback owns its sound');
delete card._pendingFateOverlaySync;
card._placementFateReveal = {fromValue:16};
observe(18);
assert.equal(sounds.length, 3, 'placement reveal retains sound ownership');
runtime.playResolvedFateChangeSfx({iid:'alpine',owner:0}, 1, 6, 0);
runtime.playResolvedFateChangeSfx({iid:'alpine',owner:0}, 1, 6, 0);
assert.equal(sounds.length, 4, 'duplicate reports of the same gain remain deduplicated');
console.log('Naked Fate gain audio regression tests passed.');
