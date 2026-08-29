'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const core = read('src/scripts/05-gameplay-core.js');
const renderer = read('src/scripts/06-rendering-and-helpers.js');
const ai = read('src/scripts/07-ai.js');
const moraleUi = read('src/scripts/27-morale-pressure-ui.js');
const matchUi = read('src/scripts/45-match-ui-codex.js');
const matchUiCss = read('src/styles/zzzzzzzzzzzzzzzzzzzzzzz-match-ui-svg-v20.css');
const registry = read('shared/engine/cards/registry.mjs');

assert.match(
  core,
  /function pressureCardReworkTimingActive\(\)[\s\S]{0,260}gameSettings\?\.pressureCardReworks===true[\s\S]{0,180}_freePlayGameSettings\?\.pressureCardReworks===true/,
  'client rework behavior must follow the live match settings as well as the bootstrap flag'
);

assert.match(
  core,
  /if\(!pressureCardReworkTimingActive\(\)\) \{[\s\S]{0,420}getCookIslandsDuelistTarget\(cell, z\)[\s\S]{0,180}bonus -= 3/,
  'Duelist must not keep reducing adjacent Fate while its Morale rework is active'
);
assert.match(
  moraleUi,
  /String\(card\.id\|\|''\)==='64'\) card\._doubleNextMoraleDamage=true/,
  'Duelist must arm its next-Morale-calculation double on set'
);

assert.match(
  core,
  /case '45':[\s\S]{0,220}pressureCardReworkTimingActive\(\)[\s\S]{0,900}before-50[\s\S]{0,1200}discardBoardCard\(target,tz,tr,tc\)/,
  'local Chingachlook must pay 50 Morale and discard the selected field card'
);
assert.match(
  ai,
  /case '45':[\s\S]{0,800}before-50[\s\S]{0,1800}discardBoardCard\(target\.card,target\.z,target\.r,target\.c\)/,
  'AI Chingachlook must resolve the same reworked effect instead of recovering a discard card'
);
assert.doesNotMatch(
  ai.slice(ai.indexOf("case '45':"), ai.indexOf("case '46':", ai.indexOf("case '45':"))),
  /discard\.pop\(|addCardToHand/,
  'AI Chingachlook must not retain its obsolete discard-recovery implementation'
);
assert.match(renderer, /const runtimeRework = reworkActive && window\.FATE_PRESSURE_CARD_REWORKS/);
assert.match(renderer, /window\.FATE_PRESSURE_CARD_REWORKS\[String\(card\.id \|\| ''\)\]/);
assert.match(
  renderer,
  /effect: taylorHasCopiedEffect \?[^\n]+: String\(runtimeRework\?\.effect \|\| card\.effect \|\| ''\)/,
  'card details must display the active rework text carried by the match settings'
);

assert.match(core, /G\._majaSupportBoost = \{owner:cp, turn:Number\(G\.turn\), extraSupports:2, sourceIid:String\(card\.iid/);
assert.match(ai, /G\._majaSupportBoost = \{owner:cp, turn:Number\(G\.turn\), extraSupports:2/);
assert.match(renderer, /const localMajaBoost = G\._majaSupportBoost/);
assert.match(renderer, /extraClass:'effect-pill-maja'/);
assert.match(renderer, /JSON\.stringify\(G\._majaSupportBoost \|\| null\)/, 'Maja must invalidate the top-bar status cache when her local boost starts or expires');
assert.match(
  renderer,
  /statusInstanceKey:'maja-extra-supporters:' \+ majaOwner/,
  'Maja must publish a current-turn Oblique Order status in local matches'
);
const majaCase = core.slice(core.indexOf("case '07':"), core.indexOf("case '08':", core.indexOf("case '07':")));
assert.doesNotMatch(majaCase, /\binst\b/, 'Maja must use triggerCharacterEffect\'s card argument instead of an undefined placement variable');
assert.match(majaCase, /await new Promise\(function\(resolveMajaSearch\)/, 'Maja must keep placement resolution pending while Oblique Order owns the shared picker');
assert.match(majaCase, /onCancel:finish/, 'cancelling Maja must release the pending placement resolver');
assert.doesNotMatch(majaCase, /minCount\s*:/, 'legacy single-player Maja must not require a minimum supporter count');
assert.match(majaCase, /lockUntilAnswered:true/, 'Maja must retain ownership of the shared modal until her picker is answered');
assert.match(majaCase, /await resolveBoleslawAfterSearchSelection/, 'follow-up search resolution must finish before Maja releases the shared modal lifecycle');
assert.match(majaCase, /FateCodexUi\?\.update/, 'Maja must publish her status into the current HUD immediately');
const executableMajaCase = majaCase.replace(/\/\/.*$/gm, '');
assert.match(majaCase, /pickCardsVisual\(matches,[\s\S]{0,3600}renderTopbarEffects/, 'Maja must mount her supporter picker before the targeted status presentation refresh');
assert.doesNotMatch(executableMajaCase, /refreshStatusEffectsNow\s*\(/, 'Maja must not run broad continuous-effect reconciliation before opening her picker');
assert.match(matchUi, /function statusRailSummary\(key\)/, 'the new match HUD must read canonical top-bar status pills directly');
assert.match(matchUi, /count=Math\.max\(summaryCount,rail\.count\)/, 'the new HUD must not remain at STATUS 0 when its Morale summary is stale');
assert.match(matchUi, /statusBanner\.textContent=statusLabels\.join\(' · '\)/, 'the current match HUD must publish canonical effect names such as Oblique Order');
assert.match(renderer, /effectPickerLocked[\s\S]{0,220}visual-picker-body/, 'unrelated modal work must not replace a resolving effect picker');
assert.match(renderer, /existingPickerLock && existingPickerLock !== incomingPickerKey[\s\S]{0,500}pickCardsVisual\(cards, opts, onConfirm\)/, 'a second card picker must wait behind the unanswered effect picker');

const authoritativeMaja = registry.slice(registry.indexOf("'07':{"), registry.indexOf("'08':{", registry.indexOf("'07':{")));
assert.match(authoritativeMaja, /min:0,[\s\S]{0,80}max:3,[\s\S]{0,80}optional:true/, 'shared multiplayer/single-player Maja must accept zero to three supporters');
assert.doesNotMatch(authoritativeMaja, /exactUpToAvailable/, 'shared Maja must not force every available slot to be selected');

assert.match(
  core,
  /cardActsAsPassive\(source,'44'\)[\s\S]{0,260}getSovietGrenadierTarget\(source\)[\s\S]{0,220}bonus\+=3\*getSuperiorMarksMultiplier\(z,source\.owner\)/,
  'Soviet Grenadiers must grant the selected adjacent card its paired +3 Fate'
);

const taylorBannerStart = renderer.indexOf('function buildTaylorCopyBannerHTML');
const taylorBannerEnd = renderer.indexOf('\nfunction ', taylorBannerStart + 20);
assert(taylorBannerStart >= 0 && taylorBannerEnd > taylorBannerStart, 'Taylor copy banner helper must be extractable');
const sandbox = {escapeHtml:value=>String(value)};
vm.runInNewContext(renderer.slice(taylorBannerStart, taylorBannerEnd) + '\nthis.build = buildTaylorCopyBannerHTML;', sandbox);
const taylorBanner = sandbox.build({
  id:'bh05',
  _bh05CopiedCardId:'64',
  _bh05CopiedCardName:'Cook Islands Duelist',
  _bh05CopiedAbility:'Blade Dance',
  _bh05CopiedPrintedEffect:'Double the next Morale Damage Calculation.'
});
assert.match(taylorBanner, /cd-live-tracker taylor-copy-banner/);
assert.match(taylorBanner, /Copied Effect/);
assert.match(taylorBanner, /Cook Islands Duelist/);
assert.match(taylorBanner, /Blade Dance/);
assert.equal(sandbox.build({id:'bh05'}), '');
assert.equal((renderer.match(/buildTaylorCopyBannerHTML\(card\)/g) || []).length, 3, 'both card-detail routes must include Taylor\'s copied-effect tracker');

console.log('Reported card UI and rework regression smoke test passed');
