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
const recipes = read('src', 'scripts', 'render-v2', '13-vfx-recipes.js');
const renderer = read('src', 'scripts', 'render-v2', '04-match-renderer-adapter.js');
const titleCss = read('src', 'styles', 'zz-codex-last.css');
const matchUiCss = read('src', 'styles', 'zzzzzzzzzzzzzzzzzzzzzzz-match-ui-svg-v20.css');
const smoothness = read('src', 'scripts', '21-smoothness-core.js');
const gameplay = read('src', 'scripts', '05-gameplay-core.js');
const onlineRooms = read('src', 'scripts', '18-online-rooms.js');
const moraleUi = read('src', 'scripts', '27-morale-pressure-ui.js');
const endgameCss = read('src', 'styles', 'endgame.css');
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
  rendering,
  /document\.body\.classList\.add\('cinematic-lock'\);[\s\S]{0,1200}showCinematicSubtitle\(subtitle,[\s\S]{0,900}overlay\.appendChild\(subEl\)/,
  'consolidation subtitles must mount synchronously inside their owning overlay'
);
assert.match(
  smoothness,
  /sel === '\.cinematic-subtitle-live'[\s\S]{0,260}inside-consolidation-cinematic[\s\S]{0,180}closest\('\.cc-overlay-v2'\)/,
  'visibility recovery must preserve subtitles owned by a live consolidation overlay'
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
  director,
  /onLocalIntent:function\(intent\)[\s\S]{0,180}suppressAcceptedBridgeMotion\(intent\.type, intent\.options \|\| \{\}\)/,
  'local VFX intents must use the same absolute board-placement suppression as accepted events'
);
assert.match(
  recipes,
  /RETIRED_BOARD_PLACEMENT_RECIPES[\s\S]*if\(RETIRED_BOARD_PLACEMENT_RECIPES\.has\(recipeName\)\) return \[\];/,
  'direct recipe expansion must not recreate retired board-placement motion'
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
assert.match(
  moraleUi,
  /function runAfterMoraleCalculationPresentation[\s\S]*window\.runAfterMoraleCalculationPresentation=runAfterMoraleCalculationPresentation/,
  'start-of-turn overlays must have a shared Morale Calculation presentation barrier'
);
assert.match(
  moraleUi,
  /function enqueueMoralePressurePresentation[\s\S]*if\(reserved\)beginMoraleCalculationPresentation\(\);[\s\S]*singlePlayerPresentationQueue=singlePlayerPresentationQueue/,
  'single-player Morale Calculation must reserve its barrier before the next turn begins synchronously'
);
assert.match(
  moraleUi,
  /function positionMoraleFloater[\s\S]*#fate-match-ui-v8 \[data-morale=[\s\S]*#fate-match-ui-v5 \[data-morale=[\s\S]*Math\.min\(viewportWidth-edgePadding,Math\.max\(edgePadding,centerX\)\)/,
  'Morale floaters must use the visible match-layout Morale panel and remain clamped inside the viewport'
);
assert.match(
  moraleUi,
  /function commitMoralePresentationValue[\s\S]*renderMoralePressureHud\(working\);[\s\S]*refreshVisibleMatchMoraleSurface\(\);/,
  'Morale gain/loss numbers and themed-shell health values must commit in the same presentation frame'
);
assert.match(
  renderer,
  /const commandUi = !!document\.querySelector\([\s\S]*#fate-match-ui-v8[\s\S]*#fate-atlas-ui[\s\S]*if\(!commandUi\) drawCommandDock/,
  'fresh match shells must suppress the legacy canvas command dock by mounted root, not timing-sensitive class alone'
);
assert.match(
  gameplay,
  /const readDisplayedFate=function\(\)\{return position&&typeof getEffectiveFate==='function'[\s\S]*const before = readDisplayedFate\(\)[\s\S]*const finalValue = readDisplayedFate\(\)/,
  'paired Fate overlays must animate effective displayed values without replaying continuous aura modifiers'
);
assert.match(
  onlineRooms,
  /const moraleCalculationFirst = events\.some[\s\S]*await window\.presentMoralePressureEvents\(events, view\);[\s\S]*events\.forEach/,
  'authoritative start-turn result overlays must wait for Morale Calculation presentation'
);
assert.match(
  onlineRooms,
  /before:displayedFateBefore,[\s\S]*after:displayedBaseFateAfter,[\s\S]*finalValue:displayedFinalFate/,
  'authoritative paired overlays must preserve only the event delta under continuous auras'
);
assert.match(
  endgameCss,
  /\.win-zone-controller \{[\s\S]*overflow-wrap: anywhere;/,
  'long end-screen controller names must wrap before the final Fate panel'
);
assert.match(
  gameplay,
  /function fitEndgameWinnerTitle\(\)[\s\S]*title\.scrollWidth > availableWidth[\s\S]*title\.style\.fontSize = size \+ 'px'/,
  'the end-screen winner heading must measure and shrink long commander names to its actual column'
);
assert.match(
  rendering,
  /function getLowMoraleSupporterExpiryState[\s\S]*moraleSupporterExpiryTurns[\s\S]*turnsLeft:Math\.max\(0, 2 - turnsCompleted\)/,
  'low-Morale supporter overlays and card details must share the authoritative expiry countdown'
);
assert.match(
  rendering,
  /bc-low-morale-expiry[\s\S]*lowMoraleExpiryBanner[\s\S]*buildLowMoraleSupporterWarningHTML/,
  'low-Morale supporters must keep a board warning and expose remaining turns in card information'
);
assert.match(
  renderer,
  /function scheduleLowMoraleSupporterPulse[\s\S]*function drawLowMoraleSupporterOverlay/,
  'the canvas board must render and slowly refresh the persistent low-Morale supporter warning'
);
assert(matchUiCss.includes('overflow-wrap:anywhere!important'), 'long card names must wrap beside the low-Morale warning');
assert(matchUiCss.includes('left:auto!important;right:-1px!important'), 'the low-Morale tooltip must open leftward inside the card panel');
assert(matchUiCss.includes('transform:translateY(0)!important'), 'the anchored low-Morale tooltip must not recenter beyond the panel edge');

const lowMoraleStateStart = rendering.indexOf('function getLowMoraleSupporterExpiryState');
const lowMoraleStateEnd = rendering.indexOf('\nfunction buildLowMoraleSupporterWarningHTML', lowMoraleStateStart);
assert(lowMoraleStateStart >= 0 && lowMoraleStateEnd > lowMoraleStateStart, 'low-Morale supporter countdown helper must be extractable');
const lowMoraleSandbox = {};
vm.createContext(lowMoraleSandbox);
vm.runInContext(rendering.slice(lowMoraleStateStart, lowMoraleStateEnd) + '\nthis.readExpiry = getLowMoraleSupporterExpiryState;', lowMoraleSandbox);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(lowMoraleSandbox.readExpiry({_moraleSupporterExpiryStartedTurn:6, _moraleSupporterExpiryTurns:1}))),
  {active:true, turnsCompleted:1, turnsLeft:1, startedTurn:6},
  'legacy low-Morale supporters must report one turn remaining after their first completed turn'
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(lowMoraleSandbox.readExpiry({counters:{moraleSupporterExpiryStartedTurn:8, moraleSupporterExpiryTurns:1}}))),
  {active:true, turnsCompleted:1, turnsLeft:1, startedTurn:8},
  'authoritative low-Morale supporters must use the same remaining-turn calculation'
);
assert.strictEqual(lowMoraleSandbox.readExpiry({}).active, false, 'supporters without an expiry counter must not show the warning');
assert.match(
  rendering,
  /duelist: `<svg class="cook-islands-duelist-icon" viewBox="0 0 64 64"[\s\S]{0,900}stroke="currentColor"[\s\S]{0,900}<\/svg>`/,
  'Cook Islands Duelist must use the selected native crossed-blades status glyph'
);

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
