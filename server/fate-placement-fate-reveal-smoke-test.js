const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const core = read('src/scripts/05-gameplay-core.js');
const ai = read('src/scripts/07-ai.js');
const tutorial = read('src/scripts/11-tutorial.js');
const snapshot = read('src/scripts/render-v2/01-render-snapshot.js');
const adapter = read('src/scripts/render-v2/04-match-renderer-adapter.js');
const rooms = read('src/scripts/18-online-rooms.js');
const structuralHelpers = read('src/scripts/00-structural-helpers.js');

assert.doesNotMatch(
  structuralHelpers,
  /isAlpineInfantryCard\(card\)\) return printedFate \+ 4/,
  'ALPINE Infantry must not retain the retired intrinsic +4 placement bonus in addition to its current +5 when-set effect'
);
assert.match(
  core,
  /case '76':[\s\S]{0,500}getPlacedCardFate\(inst\)[\s\S]{0,120}\+ 5/,
  'ALPINE Infantry must receive exactly its current +5 when-set gain'
);

assert.match(
  core,
  /function preparePlacementFateReveal\(inst, sourceCard, mode\)[\s\S]*fromValue[\s\S]*_placementFateReveal[\s\S]*window\.preparePlacementFateReveal/,
  'placement Fate reveal metadata must retain the card’s pre-placement visible Fate'
);
assert.match(
  core,
  /inst\.currentFate = getPlacedCardFate\(card\);[\s\S]*preparePlacementFateReveal\(inst, card, 'set'\)[\s\S]*applyLandscapePlacementBonuses/,
  'ordinary sets must arm delayed Fate presentation before placement bonuses resolve'
);
assert.match(
  core,
  /inst\.currentFate = getPlacedCardFate\(card, \{bonusFate, tributeCount: tributes\.length\}\);[\s\S]*preparePlacementFateReveal\(inst, card, 'consolidation'\)[\s\S]*noteBalladConsolidation\(cp, inst\)/,
  'consolidations must retain the pre-consolidation Fate through tribute and Kvetka bonuses'
);
assert.match(
  ai,
  /preparePlacementFateReveal\(inst, card, 'set'\)[\s\S]*preparePlacementFateReveal\(inst, choice\.card, 'consolidation'\)/,
  'AI placements and consolidations must use the same delayed Fate presentation'
);
assert.match(
  tutorial,
  /preparePlacementFateReveal\(inst, source, 'set'\)[\s\S]*preparePlacementFateReveal\(inst, source, 'consolidation'\)/,
  'tutorial placements must use the shared Fate presentation timing'
);
assert.match(
  adapter,
  /deferredPlacementFatePulseByIid[\s\S]*function placementFateRevealUntil[\s\S]*mode === 'consolidation'[\s\S]*getConsolidationCinematicTotalMs[\s\S]*_cinematicUiLockUntil[\s\S]*_actionPresentationLockUntil/,
  'placement Fate presentation must wait for both card setting and the full consolidation cinematic'
);
assert.match(
  adapter,
  /function deferPlacementFateReveal[\s\S]*fromValue[\s\S]*schedulePlacementFateReveal[\s\S]*function observeCardForAnimations[\s\S]*deferPlacementFateReveal\(card, fateValue\)[\s\S]*lastCardFateByIid\.set\(iid, fateValue\)[\s\S]*return/,
  'placement-time Fate changes must be withheld from the normal immediate Fate pulse path'
);
assert.match(
  adapter,
  /function coordinatorFatePresentationVisual[\s\S]*placementPending[\s\S]*coordinatorPending[\s\S]*displayFate:String\(pending\.fromValue\)/,
  'the badge must show its pre-placement value without replacing the existing Coordinator delay'
);

assert.match(
  core,
  /function preparePlacementFateReveal[\s\S]*source\._wciBonus[\s\S]*createdAt:Date\.now\(\)/,
  'the pre-placement value must match the Fate shown in hand and carry a stable placement timestamp'
);
assert.match(
  snapshot,
  /if\(card\._placementFateReveal\)[\s\S]*base\._placementFateReveal[\s\S]*fromValue[\s\S]*mode[\s\S]*createdAt[\s\S]*genericSoundRequested[\s\S]*kvetkaGainAmount/,
  'render snapshots must preserve placement Fate reveal metadata instead of exposing the final Fate immediately'
);
assert.match(
  adapter,
  /const delta = Number\(pending\.toValue\) - Number\(pending\.fromValue\)[\s\S]*fromValue:pending\.fromValue[\s\S]*toValue:pending\.toValue[\s\S]*record\.toValue = String\(fateValue\)/,
  'every immediate placement source must be combined into one final Fate jump'
);
assert.match(
  core,
  /function playFateChangeSound[\s\S]*if\(card\._placementFateReveal\)[\s\S]*genericSoundRequested = true;[\s\S]*return;/,
  'placement-time Fate audio must wait for the combined reveal instead of playing early'
);
assert.match(
  adapter,
  /kvetkaGainAmount[\s\S]*pending\.genericSoundRequested[\s\S]*kvetkaOnlyGain[\s\S]*window\.playSfx\(delta > 0 \? 'fateGain' : 'fateLose'\)/,
  'the combined reveal must play ordinary Fate audio while preserving the Kvetka-only sound exception'
);
assert.match(
  adapter,
  /timeline\.add\(\{[\s\S]*kind:'fate-pulse'[\s\S]*Number\.isFinite\(delta\) && delta !== 0 && typeof window\.flashIncomingCoordinatorEffects[\s\S]*window\.flashIncomingCoordinatorEffects\(record\.iid,[\s\S]*fromValue:pending\.fromValue[\s\S]*toValue:pending\.toValue[\s\S]*window\.playSfx/,
  'an existing Coordinator overlay must start in the same reveal callback as the newly placed card Fate gain or decrease'
);
assert.match(
  rooms,
  /function primeOnlineCharacterFatePresentationLock\(g, previousBoard, action, previousHandFateByIid\)[\s\S]*!entry\.card\.faceDown[\s\S]*card\._placementFateReveal[\s\S]*previousHandFateByIid = new Map\(\)[\s\S]*primeOnlineCharacterFatePresentationLock\(g, previousBoard, action, previousHandFateByIid\)/,
  'multiplayer must arm the same broad Fate reveal for every newly placed face-up card'
);
assert.match(
  rooms,
  /if\(k === '_placementFateReveal'\) return;/,
  'the renderer-only placement marker must not enter authoritative multiplayer card state'
);

const prepareStart = core.indexOf('function preparePlacementFateReveal');
const prepareEnd = core.indexOf("if(typeof window !== 'undefined') window.preparePlacementFateReveal", prepareStart);
assert.ok(prepareStart >= 0 && prepareEnd > prepareStart, 'placement Fate reveal helper must be extractable');
const prepareRuntime = {
  Date,
  isCardEffectImmutable:card => String(card && card.id || '') === '76'
};
vm.createContext(prepareRuntime);
vm.runInContext(core.slice(prepareStart, prepareEnd), prepareRuntime);
const alpine = {id:'76', fate:1, currentFate:6};
prepareRuntime.preparePlacementFateReveal(alpine, {id:'76', fate:1, currentFate:1}, 'set');
assert.strictEqual(alpine._placementFateReveal.fromValue, 1, 'ALPINE Infantry must first show 1 before its combined reveal reaches 6');
assert.strictEqual(alpine._placementFateReveal.genericSoundRequested, true, 'ALPINE Infantry must request the delayed Fate-gain sound');
const greatOakResult = {id:'35', fate:8, currentFate:11};
prepareRuntime.preparePlacementFateReveal(greatOakResult, {id:'35', fate:8, currentFate:8}, 'consolidation');
assert.strictEqual(greatOakResult._placementFateReveal.fromValue, 8, 'a Great Oak consolidation must first show the original 8 before its combined reveal reaches 11');
assert.strictEqual(greatOakResult._placementFateReveal.genericSoundRequested, true, 'Great Oak consolidation Fate must request the delayed Fate-gain sound');
const handBoostResult = {id:'35', fate:8, currentFate:10};
prepareRuntime.preparePlacementFateReveal(handBoostResult, {id:'35', fate:8, currentFate:8, _wciBonus:true}, 'set');
assert.strictEqual(handBoostResult._placementFateReveal.fromValue, 10, 'bonuses already visible in hand must remain part of the initial displayed Fate');

console.log('Placement Fate reveal smoke test passed.');
