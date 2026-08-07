'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const ai = read('src', 'scripts', '07-ai.js');
const rendering = read('src', 'scripts', '06-rendering-and-helpers.js');
const structural = read('src', 'scripts', '00-structural-helpers.js');
const director = read('src', 'scripts', 'render-v2', '11-vfx-director.js');
const titleCss = read('src', 'styles', 'zz-codex-last.css');
const smoothness = read('src', 'scripts', '21-smoothness-core.js');
const index = read('index.html');

assert.match(
  ai,
  /async function aiRunEffect[\s\S]*if\(card\._aiEffectResolutionInFlight\) return;[\s\S]*card\._aiEffectResolutionInFlight = true;[\s\S]*try \{[\s\S]*await checkReactions[\s\S]*finally \{[\s\S]*delete card\._aiEffectResolutionInFlight;/,
  'AI effect admission must lock a card before the first reaction await and release it in finally'
);
assert.match(
  rendering,
  /function pickBoardSupporterEffect\(player, z, ledgerRef\)[\s\S]*G\._onlinePlayerIndex[\s\S]*Number\(player\) !== localPlayer\) return false;[\s\S]*pickCardsVisual/,
  'Ledger-keepers must only open its private supporter picker for the owning online player'
);
assert.match(
  rendering,
  /const POST_CONSOLIDATION_FATE_FEEDBACK_DELAY_MS = 0;/,
  'post-cinematic Fate and overlay feedback must not have an artificial one-second hold'
);
assert.match(
  rendering,
  /function triggerLandscapeFlash[\s\S]*_landscapeFeedbackImmediateUntil = Date\.now\(\) \+ 900/,
  'landscape flashes must mark their matching Fate feedback for immediate presentation'
);
assert.match(
  structural,
  /landscapeImmediate > now && !cinematicActive\) return 0;/,
  'landscape feedback must bypass stale timestamp locks while respecting a real active cinematic'
);
assert.match(
  rendering,
  /function isBattleOfPellaBlockedByConsolidation\(\)[\s\S]*_scheduledCharacterSetCinematicCount > 0[\s\S]*_consolidationCinematicQueue\.length > 0[\s\S]*document\.querySelector\('\.cc-overlay-v2'\)/,
  'Pella must wait for real scheduled, queued, or active presentation work'
);
assert.doesNotMatch(
  rendering.match(/function isBattleOfPellaBlockedByConsolidation\(\)[\s\S]*?\n}/)?.[0] || '',
  /_cinematicUiLockUntil/,
  'Pella must not remain blocked by an expired cinematic timestamp'
);
assert.match(
  rendering,
  /_consolidationCinematicPendingKeys[\s\S]*_recentConsolidationCinematicAtByKey[\s\S]*_cinematicDedupAccepted:true/,
  'the shared cinematic queue must deduplicate both active and queued requests'
);
assert.match(
  rendering,
  /if\(_consolidationCinematicShowing && overlay\.isConnected\)/,
  'a stale cinematic safety timer must not tear down the next overlay in the queue'
);
assert.match(
  director,
  /if\(BOARD_PLACEMENT_RECIPES\.has\(recipeType\)\) return true;/,
  'caller flags must not reactivate retired horizontal board-placement motion'
);
assert.doesNotMatch(
  director.match(/function suppressAcceptedBridgeMotion[\s\S]*?function playQueued/)?.[0] || '',
  /BOARD_PLACEMENT_RECIPES[\s\S]*allowMatchActionMotion/,
  'board-placement suppression must not retain an escape hatch'
);
assert.match(
  rendering,
  /titleProfileRenderSig === renderSig[\s\S]*scheduleTitleAccountPosition\(40\);[\s\S]*return;/,
  'unchanged title profile state must not rebuild its expensive DOM'
);
assert.doesNotMatch(
  titleCss,
  /Keep the title screen on a stable compositor budget/,
  'title performance work must not change the title-screen appearance'
);
assert.match(
  smoothness,
  /const AUTOMATIC_UI_MINUTE_LOGGING_KEY = 'fateAutomaticUiMinuteLogging';[\s\S]*function automaticUiMinuteLoggingEnabled\(\)[\s\S]*localStorage\.getItem\(AUTOMATIC_UI_MINUTE_LOGGING_KEY\) === '1'/,
  'automatic Electron minute logging must be explicitly opted into'
);
assert.match(
  smoothness,
  /window\.fateStartMenuMinuteLog = function\(options\)[\s\S]*window\.fateEnableAutomaticUiMinuteLogging[\s\S]*window\.fateDisableAutomaticUiMinuteLogging/,
  'manual diagnostics must remain available after automatic logging is disabled'
);
assert.match(
  smoothness,
  /if\(automaticUiMinuteLoggingEnabled\(\) && !gameScreenActive\(\)\) startMenuMinuteLog\('startup-menu'\);/,
  'the startup menu profiler must not run by default'
);
assert.match(index, /window\.__fateClientBuildStamp\s*=\s*'[^']+'/,
  'the client must publish a concrete build stamp without pinning this regression to an obsolete revision');

async function verifyHowardSingleAdmission() {
  const functionStart = ai.indexOf('async function aiRunEffect');
  const functionEnd = ai.indexOf('\n// ', functionStart);
  assert(functionStart >= 0 && functionEnd > functionStart, 'aiRunEffect source must be extractable');
  const context = {
    G: null,
    getCardRuntimeEffectId: card => String(card.id || ''),
    getCharacterEffectAffectedOwners: () => [1],
    checkReactions: () => new Promise(resolve => setTimeout(() => resolve(true), 15)),
    isTargetImmuneToEffectOwner: () => false,
    renderBoardActionForPlayer: () => {},
    log: () => {},
    setTimeout,
    clearTimeout,
    console
  };
  vm.createContext(context);
  vm.runInContext(ai.slice(functionStart, functionEnd), context);
  const howard = {id:'03', iid:'howard-ai', type:'Initiator', owner:1, currentFate:2};
  const target = {id:'target', iid:'target-ai', type:'Dauntless', owner:1, currentFate:10, name:'Target'};
  context.G = {
    currentPlayer:1,
    aiPlayer:1,
    turn:1,
    board:[[[howard, target]]],
    players:[{deck:[], hand:[], discard:[]}, {deck:[], hand:[], discard:[]}],
    _selectedAI:{}
  };
  await Promise.all([
    context.aiRunEffect(howard, 0, 0, 0),
    context.aiRunEffect(howard, 0, 0, 0)
  ]);
  assert.strictEqual(target.currentFate, 25, 'concurrent Howard scheduling must apply its boost exactly once');
  assert.strictEqual(howard.effectUsedInitial, true, 'Howard must only become spent after the admitted resolution completes');
  assert.strictEqual(howard._aiEffectResolutionInFlight, undefined, 'AI effect admission must release after completion');
}

verifyHowardSingleAdmission().then(function(){
  console.log('fate presentation routing regression smoke passed');
}).catch(function(error){
  console.error(error);
  process.exitCode = 1;
});
