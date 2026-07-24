'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = relative=>fs.readFileSync(path.join(root, relative), 'utf8');
const core = read('src/scripts/05-gameplay-core.js');
const rendering = read('src/scripts/06-rendering-and-helpers.js');
const ai = read('src/scripts/07-ai.js');
const online = read('src/scripts/18-online-rooms.js');
const transactionSource = read('src/scripts/18a-online-effect-transactions.js');
const authority = read('server/fate-authority-reducer.js');
const effectRules = require('../src/scripts/02-effect-rule-metadata.js');
const css = read('src/styles/zz-codex-last.css');
const adapter = read('src/scripts/render-v2/04-match-renderer-adapter.js');

assert.match(core, /function chooseDestructionOfParadiseType[\s\S]{0,2600}const actions = BRAVE_HORIZONS_DECLARABLE_CARD_TYPES\.map[\s\S]{0,1200}__fateCurrentModalActions/, 'BH4 type choices must travel through multiplayer modal actions');
assert.match(core, /case 'bh25'[\s\S]{0,500}showModal[\s\S]{0,500}pickAnyBoardCard[\s\S]{0,300}discardBoardCard/, 'BH25 must retain a multiplayer-wrapped modal and board picker path');
assert.match(authority, /AUTHORITY_CHARACTER_AFFECTS_OPPONENT = new Set\(\[[^\]]*'bh25'/, 'authority must classify BH25 as an opponent-affecting effect');
assert.match(core, /case '84'[\s\S]{0,2400}opponentSearch:true[\s\S]{0,300}searchSourceCardId:'84'/, 'Flower Picking must identify its opponent search');
assert.match(core, /case '94'[\s\S]{0,1800}opponentSearch:true[\s\S]{0,300}searchSourceCardId:'94'/, 'Mail Delivery must identify its opponent search');
assert.doesNotMatch(authority, /AUTHORITY_CARD_SEARCH_SOURCE_IDS/, 'Boleslaw must not depend on a brittle hard-coded list of search cards');
assert.match(authority, /transactionalSearch = type === 'BOARD_ACTION'[\s\S]{0,260}effectTransactionVersion[\s\S]{0,260}!transactionalSearch/, 'authority must detect searches completed inside an atomic activation');
assert.match(authority, /const selectedWasAdded = selectedIids\.length[\s\S]{0,420}if\(!selectedWasAdded\) return null/, 'Boleslaw must trigger only after the chosen searched card actually reaches hand');
assert.match(rendering, /function pickFromDiscard\([\s\S]{0,1200}resolveBoleslawAfterSearchSelection/, 'discard-pile searches must use the same completed-search notification as deck searches');
assert.match(core, /case '68'[\s\S]{0,1400}resolveBoleslawAfterSearchSelection\(cp, \[chosen\], \{sourceCardId:'68'\}\)/, 'Great Oak High Schooler must explicitly report its successfully added Coordinator');
assert.match(core, /case '84'[\s\S]{0,1800}resolveBoleslawAfterSearchSelection\(cp, \[found\], \{sourceCardId:'84'\}\)/, 'Kvetka must report the searched card after it reaches hand and before free placement');
assert.match(core, /case '07'[\s\S]{0,6000}resolveBoleslawAfterSearchSelection\(cp, addedCards, \{sourceCardId:'07'\}\)/, 'Maja custom searches must use the shared completed-search notifier');
assert.match(core, /case '29'[\s\S]{0,2200}resolveBoleslawAfterSearchSelection\(cp, addedCards, \{sourceCardId:'29'\}\)/, 'Dylan custom searches must use the shared completed-search notifier');
assert.match(rendering, /function addAffFromDeckDiscard[\s\S]{0,2600}searchedCardsAddedToHand[\s\S]{0,1600}resolveBoleslawAfterSearchSelection\(player, searchedCardsAddedToHand, searchOptions\)/, 'Cosmic GF deck and discard browsing must converge on one completed-search notification');
assert.match(core, /function resolveBoleslawAfterSearchSelection[\s\S]{0,700}handIids[\s\S]{0,500}handIids\.has\(iid\)/, 'the shared notifier must ignore chosen cards that never actually reached hand');
assert.match(core, /function resolveBoleslawAfterSearchSelection[\s\S]{0,1400}FateOnlineEffectTransactions[\s\S]{0,500}captureSearchSelection/, 'completed online searches must report into the active transaction without resolving Boleslaw locally');
assert.match(transactionSource, /function captureSearchSelection[\s\S]{0,700}new Set\(existing\.concat/, 'multi-stage searches must accumulate selections instead of replacing the earlier picker');
assert.match(transactionSource, /function finalizePayload[\s\S]{0,3200}searchableOriginIids[\s\S]{0,1200}addedFromSearchableOrigin[\s\S]{0,900}opponentSearch = tx\.payload\.searchCompleted/, 'search completion must be inferred from selected cards that actually moved from deck or discard into hand');
assert.doesNotMatch(ai, /resolveBoleslawOpponentSearch/, 'AI search effects must not trigger Boleslaw before a selected card reaches hand');
for(const id of ['48','58','60','68','84','06','07','29','08','13']){
  assert.match(ai, new RegExp(`resolveBoleslawAfterSearchSelection\\(cp,[\\s\\S]{0,100}\\{sourceCardId:'${id}'\\}`), `AI search source ${id} must use the shared completed-search notifier`);
}
for(const id of ['04','10','14','16','17','18','21','26','30','31','36','39','50','52','53','61','62','64','71','72','91','93','97','bh04','bh25']){
  assert(effectRules.HAVANO_TARGETING_SOURCE_IDS.includes(id), `shared Havano targeting metadata must include ${id}`);
}
for(const fn of ['triggerCharacterEffect','activatePendingWhenSetEffect','activateVigilantes','activateExpeditionaryMove','activateBusserMove','activateWodnyPotokYouth']){
  assert(effectRules.BOARD_ACTIVATION_CLASSES[fn], `shared board activation metadata must include ${fn}`);
}
assert.match(core, /function activateWodnyPotokYouth[\s\S]{0,1800}pickCardInZone\(z,[\s\S]{0,1800}cell\.owner === opp/, 'Snowball Fight must target only the source zone');
assert.match(rendering, /cardActsAsPassive\(bc, '93'\)[\s\S]{0,250}snowBtn\.textContent='Snowball Fight'/, 'Taylor copied Snowball Fight must remain activatable');
for(const id of ['85', '88', '89', '100']){
  assert.match(core, new RegExp(`cardActsAsPassive\\(card, '${id}'\\)`), `Taylor must retain copied passive ${id}`);
}
assert.match(core, /tickCarpathianSpecters[\s\S]{0,300}cardActsAsPassive\(card, '95'\)/, 'Taylor must retain copied Specter growth');
assert.match(core, /getReadyBoleslawSearchReactions[\s\S]{0,500}cardActsAsPassive\(card, '86'\)/, 'Taylor must retain copied Boleslaw reactions');
assert.match(core, /resolveBoleslawOpponentSearch[\s\S]*flashCardEffect\(live, 'boleslaw_exclaim', \{label:'!!!'\}\)/, 'singleplayer Boleslaw search reactions must use the dedicated three-exclamation overlay');
assert.match(authority, /applyBoleslawSearchAuthorityReaction[\s\S]*'boleslaw_exclaim'[\s\S]*'!!!'/, 'authority-resolved multiplayer Boleslaw search reactions must emit the dedicated three-exclamation overlay');
assert.doesNotMatch(authority, /_effectFlash\s*=/, 'authority presentation must not leak transient effect overlays into canonical card state');
assert.match(css, /effect-flash-boleslaw_exclaim[\s\S]*--effect-flash-mask:url\([\s\S]*rect x='14'[\s\S]*circle cx='45'/, 'DOM Boleslaw overlay must render the three-exclamation glyph');
assert.doesNotMatch(css, /effect-flash-boleslaw_exclaim::after[\s\S]{0,180}display:none/, 'DOM Boleslaw overlay must not hide its effect icon');
assert.match(adapter, /kind === 'boleslaw_exclaim'[\s\S]*\[\[18,13,20,40\],[\s\S]*\[\[20,52\],[\s\S]*ctx\.fill\(\)/, 'canvas Boleslaw overlay must render the same three-exclamation glyph');
assert.match(online, /parentEffectTransaction[\s\S]*effectTransactions\.snapshot\(\)[\s\S]*parentEffectTransaction\.localResolved !== true[\s\S]*return originals\[fnName\]\.apply\(this, arguments\)/, 'Initiator, Vigilantes, and nested board operations must remain inside their parent effect transaction');
assert.doesNotMatch(online, /internalWhenSetInitiatorResolution|internalWhenSetVigilantesResolution/, 'nested effect ownership must not depend on card-specific bypasses');
assert.match(core, /if\(G\._actionPresentationActive && !G\._markSelecting\) return;/, 'a visible Mark square choice must accept the first click during the presentation cleanup frame');
assert.match(
  read('src/scripts/render-v2/06-match-scene-input.js'),
  /function|class[\s\S]*isLiveBoardSelectionActive\(\)[\s\S]{0,1500}if\(!this\.isLiveBoardSelectionActive\(\) && \([\s\S]{0,300}!started[\s\S]{0,300}ended\.z !== started\.z/,
  'live board selectors must trust the current pointer-release hit when a render rebuilds the hit map between pointer-down and pointer-up'
);
assert.match(core, /getBh07AdjacentDauntlessCount[\s\S]{0,600}_bh05CopiedPassiveId[\s\S]{0,1600}_bh05CopiedPassiveId/, 'Taylor must retain copied Agent-K adjacency');
assert.match(core, /triggerMajaMischievousActivities[\s\S]{0,800}cardActsAsPassive\(card, 'bh08'\)/, 'Taylor must retain copied Maja reactions');
assert.match(core, /case '05'[\s\S]*await new Promise[\s\S]*pickCardInZone[\s\S]*modifyFate\(tgt,3,'permanent'\)[\s\S]*finish\(true\)[\s\S]*function\(\)\{ finish\(false\); \}/, '17th British Regiment must keep its parent multiplayer activation pending until the target picker confirms or cancels');
assert.match(core, /const requiresSupporterButton = instIsSupporterForRules && WINDOWED_WHEN_SET_EFFECT_IDS\.has[\s\S]*!opts\.forceImmediate && \(requiresSupporterButton \|\| whenSetEffectsAreDeferred\(\)\)[\s\S]*queueDeferredWhenSetEffect/, 'button-based Supporter effects must remain pending even if one client has the old immediate-mode debug flag persisted');
assert.match(core, /function chooseTaylorCopiedEffect[\s\S]*return new Promise[\s\S]*onlineParentAction:true[\s\S]*resolve\(await resolveTaylorCopiedEffect[\s\S]*case 'bh05':[\s\S]*await chooseTaylorCopiedEffect/, 'Taylor activation must keep the parent multiplayer action open until her copy choice and copied effect finish');
assert.match(online, /ONLINE_ALI_REVEAL_MS = 5000[\s\S]*function resumeOnlinePendingAliTransfers[\s\S]{0,900}_onlineAliTransfersReady !== true[\s\S]{0,900}!onlineGameScreenIsActive\(\) \|\| !onlineMatchHasFirstSet\(state\)[\s\S]{0,1800}playerIndex !== localIndex[\s\S]{0,1800}submitOnlineAliTransfer/, 'Ali transfers must wait for readiness, the active game screen, and the first set, remain visible for five seconds, and submit only from the source player client');
assert.doesNotMatch(online, /onlineSubmittedEffectActivations|fateOnlineEffectActivationWasSubmitted|rememberOnlineEffectActivation/, 'stale pre-resolution effect submission latches must stay removed');
assert.match(online, /function submitOnlineAliTransfer[\s\S]{0,2600}onlineAliTransferInFlightIids\.has[\s\S]{0,1800}sendOptimisticAction\('ALI_INDOMITABLE_TRANSFER'[\s\S]{0,800}monitorOnlineAliTransferCommit/, 'Ali must have only one tracked serialized multiplayer submission in flight');
assert.doesNotMatch(online, /publishCompletedOnlineAliTransfer|onlineAliTransferResumeIids/, 'the stale Ali rescheduler must be removed');
assert.match(online, /function resumeOnlinePendingTaylorOpeningCopies[\s\S]{0,2200}_onlineAliTransfersReady !== true[\s\S]{0,2200}sendOptimisticAction\('TAYLOR_OPENING_COPY'/, 'opening Taylor must wait for both playable clients and duplicate through one serialized authority action');
assert.match(authority, /function validateTaylorOpeningCopyPostState[\s\S]{0,2600}_bh05OpeningCopyPending/, 'authority must validate the delayed linked Taylor copy source');
assert.match(authority, /if\(type === 'TAYLOR_OPENING_COPY'\) return validateTaylorOpeningCopyPostState/, 'the delayed Taylor copy action must use its dedicated authority validator');
assert.match(online, /function scheduleOnlineLocalHandLimitPrompt[\s\S]{0,700}getActiveHandLimit\(localIndex\)[\s\S]{0,900}latestHandLimit/, 'online hand-limit prompts must honor Ali\'s six-card cap');

function sliceBetween(startText, endText){
  const start = authority.indexOf(startText);
  const end = authority.indexOf(endText, start);
  assert(start >= 0 && end > start, `could not extract ${startText}`);
  return authority.slice(start, end);
}

const runtimeSource = [
  sliceBetween('function authorityCardActsAsPassive', 'function authorityCardIsReadyBoleslaw'),
  sliceBetween('function authorityCardIsReadyBoleslaw', 'function authorityZsofiaSetSources'),
  sliceBetween('function appendAuthorityCardEffectFlash', 'function resolveAuthorityBoleslawSearch'),
  sliceBetween('function appendAuthorityTaylorSelfCopy', 'function reduceReactionChoice'),
  'this.applyAuthorityJoieDrawEffectPassive = applyAuthorityJoieDrawEffectPassive;',
  'this.applyAuthorityMajaMischievousActivities = applyAuthorityMajaMischievousActivities;',
  'this.applyBoleslawSearchAuthorityReaction = applyBoleslawSearchAuthorityReaction;'
].join('\n');

function entries(state){
  const result = [];
  (state.board || []).forEach((zone, z)=>(zone || []).forEach((row, r)=>(row || []).forEach((card, c)=>{
    if(card) result.push({card, z, r, c});
  })));
  return result;
}

const sandbox = {
  Date,
  cloneState:value=>JSON.parse(JSON.stringify(value)),
  boardEntries:entries,
  isFaceDownAuthorityCard:card=>!!(card && card.faceDown),
  isAuthorityFullyEffectImmuneCard:card=>!!(card && (String(card.id || '') === 'bh01' || String(card.id || '') === '76')),
  findBoardEntryByRef:(state, ref)=>entries(state).find(entry=>String(entry.card.iid || '') === String(ref && (ref.iid || ref.card && ref.card.iid) || '')) || null
};
vm.createContext(sandbox);
vm.runInContext(runtimeSource, sandbox, {filename:'fate-recent-authority-runtime.js'});

const maja = {id:'bh08', iid:'maja', owner:0, type:'Coordinator', currentFate:2};
const ally = {id:'05', iid:'ally', owner:0, currentFate:3};
const faceDownAlly = {id:'07', iid:'face-down-ally', owner:0, currentFate:1, faceDown:true};
const enemy = {id:'06', iid:'enemy', owner:1, currentFate:4};
const majaEvents = [];
const majaState = {turn:1, board:[[[maja, ally, faceDownAlly], [enemy, null, null]], [[null]], [[null]]]};
assert.strictEqual(sandbox.applyAuthorityMajaMischievousActivities(majaState, 0, majaEvents), 6, 'Maja should grant 2 Fate to each friendly card, including face-down cards');
assert.strictEqual(ally.currentFate, 5);
assert.strictEqual(faceDownAlly.currentFate, 3, 'Maja must affect friendly face-down cards');
assert.strictEqual(enemy.currentFate, 4, 'Maja must never buff the opponent');
assert.strictEqual(majaEvents.length, 3, 'Maja must emit one presentation event per affected card');

const taylorMaja = {id:'bh05', iid:'taylor-maja', owner:0, currentFate:1, _bh05CopiedPassiveId:'bh08'};
const taylorAlly = {id:'05', iid:'taylor-ally', owner:0, currentFate:2};
const taylorMajaState = {turn:2, board:[[[taylorMaja, taylorAlly, null]], [[null]], [[null]]]};
assert.strictEqual(sandbox.applyAuthorityMajaMischievousActivities(taylorMajaState, 0), 4, 'Taylor must act as copied Maja for authority reactions');
assert.strictEqual(taylorAlly.currentFate, 4);

const joie = {id:'bh02', iid:'joie', owner:0, type:'Coordinator', currentFate:2};
const friendlyShield = {id:'20', iid:'shield-wall', owner:0, currentFate:3, immuneFlag:true};
const fullyImmune = {id:'76', iid:'fully-immune', owner:0, currentFate:5, faceDown:true};
const joieState = {turn:3, board:[[[joie, friendlyShield, fullyImmune]], [[null]], [[null]]]};
sandbox.applyAuthorityJoieDrawEffectPassive(joieState, 0, {id:'86', iid:'draw-source'}, []);
assert.strictEqual(friendlyShield.currentFate, 4, 'friendly opponent-only immunity must not block Joie');
assert.strictEqual(fullyImmune.currentFate, 5, 'full effect immunity must still block Joie while face-down');

const jeremiah = {id:'57', iid:'jeremiah', owner:0, type:'Coordinator', currentFate:2};
const copiedJeremiah = {id:'bh05', iid:'taylor-jeremiah', owner:0, type:'Initiator', currentFate:2, _bh05CopiedPassiveId:'57'};
const joieTarget = {id:'05', iid:'joie-target', owner:0, currentFate:1};
const joieBoostState = {turn:3, board:[[[joie, jeremiah, copiedJeremiah], [joieTarget, null, null]], [[null]], [[null]]]};
sandbox.applyAuthorityJoieDrawEffectPassive(joieBoostState, 0, {id:'86', iid:'draw-source-2'}, []);
assert.strictEqual(joieTarget.currentFate, 4, 'actual and Taylor-copied Jeremiah auras must both strengthen an actual Coordinator');

const taylorJoie = {id:'bh05', iid:'taylor-joie', owner:0, type:'Initiator', currentFate:2, _bh05CopiedPassiveId:'bh02'};
const taylorJoieTarget = {id:'05', iid:'taylor-joie-target', owner:0, currentFate:1};
const taylorJoieState = {turn:3, board:[[[taylorJoie, jeremiah, taylorJoieTarget]], [[null]], [[null]]]};
sandbox.applyAuthorityJoieDrawEffectPassive(taylorJoieState, 0, {id:'86', iid:'draw-source-3'}, []);
assert.strictEqual(taylorJoieTarget.currentFate, 2, 'Jeremiah must not strengthen Taylor because Taylor remains an Initiator');

const taylorBoleslaw = {id:'bh05', iid:'taylor-boleslaw', owner:1, currentFate:1, _bh05CopiedPassiveId:'86'};
const drawnTaylor = {id:'bh05', iid:'drawn-taylor', owner:1, currentFate:1};
const boleslawState = {
  turn:4,
  instanceCounter:40,
  landscapeId:'igb9',
  players:[
    {deck:[], hand:[], discard:[]},
    {deck:[drawnTaylor], hand:[], discard:[]}
  ],
  board:[[[taylorBoleslaw, null, null]], [[null]], [[null]]]
};
const boleslawEvents = [];
assert.strictEqual(sandbox.applyBoleslawSearchAuthorityReaction(boleslawState, {iid:taylorBoleslaw.iid}, {playerIndex:1}, boleslawEvents), '');
assert.strictEqual(taylorBoleslaw.currentFate, 3, 'Taylor copied Boleslaw must gain 2 Fate');
assert.strictEqual(taylorBoleslaw._effectFlash, undefined, 'authority Boleslaw presentation must not be stored in canonical card state');
assert.strictEqual(boleslawEvents[0].kind, 'boleslaw_exclaim', 'authority Boleslaw reaction must emit its synchronized effect flash kind');
assert.strictEqual(boleslawEvents[0].label, '!!!', 'authority Boleslaw reaction must reserve the three-exclamation presentation label');
assert(boleslawEvents.some(event=>event.type === 'LANDSCAPE_OUTSIDE_DRAW_BONUS' && event.playerIndex === 1), 'authority-resolved draws must preserve the West Coast Dreaming optional picker');
assert.strictEqual(boleslawState.players[1].hand.length, 2, 'authority draws of Taylor must create the second copy');
assert.strictEqual(boleslawState.players[1].hand[1]._bh05GeneratedCopy, true);
assert.notStrictEqual(String(boleslawState.players[1].hand[0].iid), String(boleslawState.players[1].hand[1].iid), 'Taylor copies need unique instance ids');

console.log('Recent card multiplayer parity smoke test passed.');
