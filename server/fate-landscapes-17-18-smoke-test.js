#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {getCardCatalog} = require('./fate-card-catalog');
const {buildInitialAuthorityState} = require('./fate-authority-bootstrap');
const {canonicalStateHash, reduceServerAction} = require('./fate-authority-reducer');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const data = read('src/scripts/01-data-and-state.js');
const structural = read('src/scripts/00-structural-helpers.js');
const core = read('src/scripts/05-gameplay-core.js');
const rendering = read('src/scripts/06-rendering-and-helpers.js');
const handDragBridge = read('src/scripts/render-v2/09-hand-drag-bridge.js');
const ai = read('src/scripts/07-ai.js');
const audio = read('src/scripts/08-audio-and-meta-ui.js');
const online = read('src/scripts/18-online-rooms.js');
const css = read('src/styles/zz-codex-last.css');
const index = read('index.html');
const pkg = JSON.parse(read('package.json'));
const dockerfile = read('Dockerfile');
const dockerignore = read('.dockerignore');

for(const asset of [
  'whisper.png',
  'optimized/card-thumbs/whisper.jpg',
  'igb17/board17.mp3',
  'ingamebackgrouds/igb18.png',
  'setvoicelines/board18.mp3',
  ...Array.from({length:10}, (_, i)=>`igb17/${i + 1}.png`)
]) {
  assert(fs.existsSync(path.join(root, asset)), `${asset} must exist`);
}
assert(fs.statSync(path.join(root, 'optimized/card-thumbs/whisper.jpg')).size > 1000,
  'Whisper optimized thumbnail must contain rendered token art');
assert(pkg.build.files.includes('igb17/**/*'), 'Electron packaging must include the complete IGB17 asset folder');
assert.match(dockerfile, /COPY igb17 \.\/igb17/, 'Fly deployment must copy the complete IGB17 asset folder');
assert.match(dockerignore, /!igb17\/\*\*/, 'Fly deployment context must allow IGB17 assets');

assert.match(data, /id:'whisper17',name:'Shizuku',ability:'Concrete Roads',type:'Coordinator'[^\n]*[\s\S]{0,180}fate:5,cost:0/,
  'Whisper must be a zero-cost 5 Fate Coordinator token');
assert.match(rendering, /name: String\(card\.id \|\| ''\) === 'whisper17' \? 'Shizuku' : card\.name/,
  'the information window must display the token card name as Shizuku, including older live token snapshots');
assert.match(data, /igb17:\s*\{[\s\S]{0,260}Tama City: Concrete Roads[\s\S]{0,260}Once per game/,
  'IGB17 catalog metadata must rename the landscape to Tama City');
assert.doesNotMatch(rendering, /Eligible Coordinator Required/,
  'IGB17 landscape panel must not show the old eligible-Coordinator status line');
assert.match(rendering, /const buttonText = spent \? 'Token Created' : 'Create Shizuku Token'/,
  'IGB17 action button must change to Token Created after the landscape use is consumed');
assert.match(css, /landscape-whisper-action[\s\S]{0,120}transform:translateY\(6px\)[\s\S]{0,120}margin:\.02rem auto 0/,
  'IGB17 action pill must sit 6px lower after the latest nudge');
assert.match(css, /landscape-whisper-button[\s\S]{0,180}padding:\.2rem \.48rem/,
  'IGB17 action button text padding must be restored before moving the whole pill');
assert.match(rendering, /"whisper17": "Tomorrow, I’ll be the same old me\."/,
  'Shizuku Token cinematic must use its requested subtitle');
assert.match(data, /igb18:\s*\{[\s\S]{0,260}Wodny Potok: An Idyllic Polish Village[\s\S]{0,260}Draw Phases/,
  'IGB18 catalog metadata must describe its Draw Phase Fate gain');
assert.match(structural, /Math\.min\(20, parseInt\(String\(song/,
  'landscape setup must accept boards 17 through 20');
assert.match(structural, /rotationStartedAt: id === 'igb17' \? Date\.now\(\) : null/,
  'landscape setup must initialize the synchronized IGB17 clock');
assert.match(structural, /function isWhisperOfTheHeartToken[\s\S]{0,180}whisper17/,
  'Shizuku Token classification must be shared across gameplay and rendering');

assert.match(audio, /GAME_SONGS = Array\.from\(\{length:20\}/, 'the song pool must include boards 17 through 20');
assert.match(audio, /board17:'\.\.\/igb17\/board17'/, 'board17 must play the music stored in its special asset folder');
assert.match(audio, /IGB17_BACKGROUND_FILES[\s\S]{0,320}'igb17\/1\.png'[\s\S]{0,320}'igb17\/10\.png'/,
  'IGB17 must enumerate the ten supplied rotating images');
assert.doesNotMatch(audio, /igb17\/12\.png|igb17\/11\.jpeg/,
  'IGB17 must not reference stale deleted background files');
assert.match(audio, /Math\.floor\(elapsed \/ 30000\)[\s\S]{0,120}IGB17_BACKGROUND_FILES\.length/,
  'IGB17 must rotate against a synchronized 30-second clock');
assert.match(audio, /function crossfadeIgb17ScreenBackground\(screen, bgImg, coin, force\)[\s\S]{0,1500}igb17-bg-fade-layer[\s\S]{0,900}transition:opacity 1400ms ease-in-out[\s\S]{0,900}applyLandscapeBackgroundToScreen\(screen, bgImg, coin\)/,
  'IGB17 rotating pictures must fade between images instead of hard-swapping backgrounds');
assert.match(audio, /if\(bgNum === 17\)[\s\S]{0,220}applyIgb17RotatingBackground\(false\)[\s\S]{0,220}scheduleIgb17BackgroundRotation\(pickedSong, \{skipApply:true\}\)/,
  'board17 must route through the crossfade helper instead of hard-swapping in the generic background path');
assert.match(audio, /whisperConsolidation:\s*\{src:'setvoicelines\/whisper\.mp3'/,
  'Shizuku Token consolidation must have a dedicated whisper.mp3 audio mapping');
assert.doesNotMatch(audio, /whisperConsolidation:\s*\{src:'setvoicelines\/whisper\.mp3'[\s\S]{0,80}fallbackTone:'whisper'/,
  'Shizuku Token consolidation must not layer a generated fallback over whisper.mp3');
assert.match(audio, /let _lastWhisperConsolidationSfxAt = 0;/,
  'Shizuku Token consolidation audio must keep a de-dupe timestamp');
assert.match(audio, /if\(nowMs - _lastWhisperConsolidationSfxAt < 900\) return;/,
  'Shizuku Token consolidation audio must be de-duped across placement and cinematic routes');
assert.match(audio, /function playWhisperTokenTone[\s\S]{0,900}triangle/,
  'Shizuku Token audio must have an audible fallback if whisper.mp3 is missing');
assert.doesNotMatch(audio, /if\(type === 'whisperConsolidation'\)[\s\S]{0,180}playFateSampleSfx\(type, isMenuSound, effectiveVol\);\s*playWhisperTokenTone\(effectiveVol\)/,
  'Shizuku Token audio must not play the sample and fallback tone at the same time');
assert.match(audio, /function playCardSound\(cardId\)[\s\S]{0,180}String\(cardId \|\| ''\) === 'whisper17'[\s\S]{0,180}playSfx\('whisperConsolidation'\)/,
  'the Shizuku Token information-window audio button must route to Whisper audio');
assert.match(rendering, /opts\.playSfx !== false && String\(card && card\.id \|\| ''\) !== 'whisper17' && typeof playSfx === 'function'/,
  'Shizuku Token cinematic must not layer the generic Coordinator set SFX over whisper.mp3');
assert.match(read('src/scripts/render-v2/15-vfx-audio-sync.js'), /whisper_consolidate:'whisperConsolidation'/,
  'the VFX audio bridge must route the Whisper consolidation cue to whisper.mp3');
const vfxRecipes = read('src/scripts/render-v2/13-vfx-recipes.js');
assert.match(vfxRecipes, /resultIsWhisper = String\(resultCard[\s\S]{0,120}whisper17/,
  'the consolidation recipe must recognize a Whisper result card');
assert.match(vfxRecipes, /fitMode:'contain'/,
  'the consolidation recipe must contain the full result-card artwork');
assert.match(vfxRecipes, /cue:resultIsWhisper \? 'whisper_consolidate' : 'consolidate_impact'/,
  'the consolidation recipe must use the Whisper cue');
assert.match(audio, /n === 18\) path = 'ingamebackgrouds\/igb18\.png'/, 'IGB18 must use its supplied background');

assert.match(core, /function commitWhisperLandscapeConversion[\s\S]{0,1500}chosen\.length !== 2/,
  'Concrete Roads must require exactly two hand cards');
assert.match(core, /fatePushDiscard\(player, liveSource[\s\S]{0,500}hand\.push\(token\)[\s\S]{0,120}ensureWhisperLandscapeUses\(\)\[player\] = 1/,
  'Concrete Roads must discard its Coordinator and hand costs before creating and consuming the token use');
assert.match(core, /function commitWhisperLandscapeConversion[\s\S]*G\.board\[sourceEntry\.z\]\[sourceEntry\.r\]\[sourceEntry\.c\] = null;[\s\S]*invalidateFateRenderCaches[\s\S]*renderGameImmediate/,
  'Concrete Roads must immediately remove and render away its Coordinator when the token is created');
assert.match(core, /token\.currentFate = 5[\s\S]{0,180}token\.whisperLandscapeToken = true[\s\S]{0,260}_whisperCopiedEffectId/,
  'the created token must retain a validated copied-effect identity at 5 Fate');
assert.match(core, /function countFieldWideCoordinators[\s\S]{0,350}card\.type !== 'Coordinator'/,
  'field-wide Coordinator counting must include Whisper because its type is Coordinator');
for(const copiedId of ['10','11','15','19','23','57','77']) {
  assert(core.includes(`'${copiedId}'`), `field-wide support must include Coordinator ${copiedId}`);
}
assert.match(core, /WHISPER_UNCOPYABLE_COORDINATOR_IDS = new Set\(\['01', '02', '12', '34'\]\)/,
  'Concrete Roads must identify Felicyta, Anicka, Makenna, and Rozsi as uncopyable');
assert.match(core, /function getWhisperCoordinatorEntries[\s\S]{0,1100}WHISPER_UNCOPYABLE_COORDINATOR_IDS\.has\(String\(card\.id/,
  'Felicyta, Anicka, Makenna, and Rozsi must be excluded from the Concrete Roads source picker');
assert.match(core, /function getZsofiaCoordinatorSetSources[\s\S]*getActiveWhisperTokens\(owner, '15'\)\.forEach\(function\(entry\)\{ addSource\(entry, true\); \}\);[\s\S]*function applyZsofiaCoordinatorSetTrigger[\s\S]*if\(source\.fieldWide\)/,
  'copied Zsofia must expand into a field-wide Coordinator-set trigger');
assert.doesNotMatch(core, /copiedId === '01'/,
  'Concrete Roads must not retain stale copied Felicyta behavior');
assert.match(core, /function resolveWhisperTokenPlacement[\s\S]{0,3200}copiedId === '77'/,
  'copied Duncan must resolve when the token is set');
assert.match(core, /function resolveWhisperTokenPlacement[\s\S]{0,1600}playSfx\('whisperConsolidation'\)/,
  'setting a Shizuku Token must play its dedicated Whisper audio');
assert.match(rendering, /isWhisperOfTheHeartToken\(card\)[\s\S]{0,220}isDirectSetCard/,
  'the token must use direct board placement rather than consolidation');
assert.match(handDragBridge, /function isDirectSetCard\(card\)[\s\S]{0,500}isWhisperOfTheHeartToken\(card\)/,
  'dragging a Shizuku Token must use direct board placement rather than consolidation');
assert.match(rendering, /function buildWhisperTokenCopyBannerHTML[\s\S]{0,600}Copied Effect[\s\S]{0,220}Field-wide/,
  'the information window must identify copied effects in a field-wide banner');
assert.doesNotMatch(rendering, /buildWhisperTokenCopyBannerHTML[\s\S]{0,420}_whisperCopiedFieldEffect[\s\S]{0,160}cd-live-tracker-sub/,
  'the copied-effect banner must not repeat the copied effect body above the main effect text');
assert.doesNotMatch(rendering, /isFelicytaCopy/,
  'the information window must not retain stale copied Felicyta presentation');
assert.match(css, /whisper-token-copy-banner[\s\S]{0,220}border-color/,
  'the copied-effect information banner must have a distinct visual treatment');
assert.match(css, /whisper-token-copy-banner \.cd-live-tracker-label[\s\S]{0,220}transform:translateY\(-3px\)/,
  'the copied-effect banner label and Field-wide text must sit 3px higher');

assert.match(core, /function applyIdyllicPolishVillageDrawPhase[\s\S]{0,650}isLandscapeActive\('igb18'\)[\s\S]{0,500}card\.aff !== 'expanded_worlds'[\s\S]{0,500}modifyFate\(card, 1, 'permanent'(?:, player)?\)/,
  'IGB18 must permanently grant 1 Fate to each controlled Expanded Worlds Character');
const idyllicDrawPhaseIndex = core.indexOf('applyIdyllicPolishVillageDrawPhase(G.currentPlayer)');
const normalDrawIndex = core.indexOf('drawCard(currentPlayer, 1, { drawPhase: true', idyllicDrawPhaseIndex);
assert(idyllicDrawPhaseIndex >= 0 && normalDrawIndex > idyllicDrawPhaseIndex,
  'IGB18 must resolve at the start of the Draw Phase before the draw');
assert.match(ai, /activateWhisperOfTheHeartLandscape\(\{auto:true, playerIndex:G\.aiPlayer\}\)/,
  'single-player AI must be able to use Concrete Roads');
assert.match(ai, /const freeCharacters = hand\.filter[\s\S]{0,420}isCardCharacterForRules[\s\S]{0,220}getDisplayedCardCost[\s\S]{0,80}<= 0/,
  'single-player AI must consider the zero-cost Whisper Coordinator token for direct placement');
assert.match(ai, /async function aiDoPlace[\s\S]{0,7000}await resolveSetCardAfterPlacement\(inst, choice\.z, choice\.r, choice\.c\)/,
  'single-player AI placement must resolve the Shizuku Token copied effect');

assert.match(online, /_whisperLandscapeUses:cloneOnlinePlain[\s\S]{0,700}_wojciechTurnPlacementCounts/,
  'online canonical capture must include Concrete Roads usage');
assert.match(online, /function pickSongForSeed[\s\S]{0,180}Math\.floor\(rng\(\) \* 20\) \+ 1/,
  'seeded multiplayer landscape selection must include IGB17 through IGB20');
assert.match(online, /const cardId = String\(card\.id \|\| ''\);[\s\S]*\['token1','whisper17'\]\.includes\(cardId\)/,
  'online card compaction must preserve the dynamic Shizuku Token effect text');
assert.match(online, /window\.activateWhisperOfTheHeartLandscape = function[\s\S]{0,1000}sendOptimisticAction\('HAND_ACTION'[\s\S]{0,1000}_onlineClientOwnedBoardActionPickerDepth/,
  'multiplayer must resolve both Concrete Roads choices inside one authoritative action');
assert.match(index, /00-structural-helpers\.js\?v=1785160801[\s\S]*01-data-and-state\.js\?v=1785160801[\s\S]*05-gameplay-core\.js\?v=1785165001[\s\S]*06-rendering-and-helpers\.js\?v=1785165501[\s\S]*07-ai\.js\?v=1785162601[\s\S]*08-audio-and-meta-ui\.js\?v=1785032407[\s\S]*18-online-rooms\.js\?v=1785165401&sync=1785165401/,
  'all landscape runtime surfaces must be cache-busted together');

const catalog = getCardCatalog();
const deck = catalog.cards.filter(card=>card && !card.retired && !card.temporarilyDisabled).slice(0, 40).map(card=>card.id);
const boot17 = buildInitialAuthorityState({catalog, seed:'igb17-smoke', song:'board17', decks:{0:deck, 1:deck}});
assert.strictEqual(boot17.state.landscapeId, 'igb17');
assert.strictEqual(boot17.state.landscapeBgNum, 17);
assert(Number.isFinite(Number(boot17.state._landscapeState.rotationStartedAt)), 'server bootstrap must timestamp IGB17 rotation');
assert.deepStrictEqual(boot17.state._whisperLandscapeUses, [0, 0]);
const boot18 = buildInitialAuthorityState({catalog, seed:'igb18-smoke', song:'board18', decks:{0:deck, 1:deck}});
assert.strictEqual(boot18.state.landscapeId, 'igb18');
assert.strictEqual(boot18.state.landscapeBgNum, 18);

function clone(value){ return JSON.parse(JSON.stringify(value)); }
function emptyBoard(){ return Array.from({length:3}, ()=>Array.from({length:3}, ()=>Array.from({length:3}, ()=>null))); }
function card(id, owner, iid, type){
  return {id:String(id), owner, iid:String(iid), type:type || 'Supporter', fate:1, currentFate:1, name:`Card ${id}`};
}
function baseWhisperState(){
  const state = {
    v:2,
    landscapeId:'igb17',
    landscapeBgNum:17,
    _landscapeState:{id:'igb17', rotationStartedAt:1700000000000},
    _whisperLandscapeUses:[0,0],
    phase:'main',
    turn:1,
    currentPlayer:0,
    players:[
      {hand:[card('05',0,'hand-a'),card('06',0,'hand-b'),card('07',0,'hand-c')],deck:[],discard:[]},
      {hand:[],deck:[],discard:[]}
    ],
    board:emptyBoard(),
    selectedHandCard:null,
    selectedBoardCard:null,
    placing:false,
    blockingCell:false,
    pendingEffect:null,
    pendingInteraction:null
  };
  state.board[0][2][0] = card('11',0,'coord-source','Coordinator');
  return state;
}
function whisperToken(iid, copiedId='11'){
  return {
    id:'whisper17',iid,owner:0,name:'Shizuku',ability:'Concrete Roads',
    type:'Coordinator',aff:'expanded_worlds',fate:5,currentFate:5,cost:0,
    whisperLandscapeToken:true,_whisperCopiedEffectId:copiedId,
    _whisperCopiedSourceName:'Anne Stone',_whisperCopiedAbility:'Coordination'
  };
}
function reduce(baseState, postState, type='HAND_ACTION', extra={}){
  const baseStateHash = canonicalStateHash(baseState);
  return reduceServerAction({canonicalState:baseState, canonicalHash:baseStateHash}, {
    type,
    payload:Object.assign({
      fn:'activateWhisperOfTheHeartLandscape',playerIndex:0,turn:1,
      baseStateHash,postState,stateHash:canonicalStateHash(postState)
    }, extra)
  }, {mode:'client-resolved', requireBaseHash:true});
}

const beforeUse = baseWhisperState();
const afterUse = clone(beforeUse);
const source = afterUse.board[0][2][0];
const discardedA = afterUse.players[0].hand.shift();
const discardedB = afterUse.players[0].hand.shift();
afterUse.board[0][2][0] = null;
afterUse.players[0].discard.push(source, discardedA, discardedB);
afterUse.players[0].hand.push(whisperToken('whisper-token-1'));
afterUse._whisperLandscapeUses[0] = 1;
const acceptedUse = reduce(beforeUse, afterUse);
assert.strictEqual(acceptedUse.ok, true, acceptedUse.reason);

const delayedCoordinatorPayment = clone(afterUse);
delayedCoordinatorPayment.board[0][2][0] = clone(source);
delayedCoordinatorPayment.players[0].discard = delayedCoordinatorPayment.players[0].discard.filter(entry=>entry.iid !== source.iid);
const rejectedDelayedPayment = reduce(beforeUse, delayedCoordinatorPayment);
assert.strictEqual(rejectedDelayedPayment.ok, false, 'multiplayer must not defer the Coordinator discard until token placement');
assert.match(rejectedDelayedPayment.reason, /discard exactly one controlled Coordinator/);

const bh2Before = baseWhisperState();
bh2Before.board[0][2][0] = card('bh02',0,'joie-source','Coordinator');
const bh2After = clone(bh2Before);
const bh2Source = bh2After.board[0][2][0];
const bh2DiscardA = bh2After.players[0].hand.shift();
const bh2DiscardB = bh2After.players[0].hand.shift();
bh2After.board[0][2][0] = null;
bh2After.players[0].discard.push(bh2Source, bh2DiscardA, bh2DiscardB);
bh2After.players[0].hand.push(whisperToken('whisper-bh2', 'bh02'));
bh2After._whisperLandscapeUses[0] = 1;
const acceptedBh2Use = reduce(bh2Before, bh2After);
assert.strictEqual(acceptedBh2Use.ok, true, acceptedBh2Use.reason);

for(const blockedCopyId of ['01', '02', '12', '34']) {
  const blockedBefore = baseWhisperState();
  blockedBefore.board[0][2][0] = card(blockedCopyId, 0, `blocked-source-${blockedCopyId}`, 'Coordinator');
  const blockedAfter = clone(blockedBefore);
  const blockedSource = blockedAfter.board[0][2][0];
  const blockedDiscardA = blockedAfter.players[0].hand.shift();
  const blockedDiscardB = blockedAfter.players[0].hand.shift();
  blockedAfter.board[0][2][0] = null;
  blockedAfter.players[0].discard.push(blockedSource, blockedDiscardA, blockedDiscardB);
  blockedAfter.players[0].hand.push(whisperToken(`blocked-whisper-${blockedCopyId}`, blockedCopyId));
  blockedAfter._whisperLandscapeUses[0] = 1;
  const blockedResult = reduce(blockedBefore, blockedAfter);
  assert.strictEqual(blockedResult.ok, false, `Concrete Roads must reject copied Coordinator ${blockedCopyId}`);
  assert.match(blockedResult.reason, /invalid Coordinator effect/);
}

const badUse = clone(afterUse);
badUse.players[0].discard = badUse.players[0].discard.slice(0, 2);
const rejectedUse = reduce(beforeUse, badUse);
assert.strictEqual(rejectedUse.ok, false);
assert.match(rejectedUse.reason, /discard pile|costs/);

const beforePlacement = clone(afterUse);
const placedToken = beforePlacement.players[0].hand.find(entry=>entry.id === 'whisper17');
const afterPlacement = clone(beforePlacement);
afterPlacement.players[0].hand = afterPlacement.players[0].hand.filter(entry=>entry.iid !== placedToken.iid);
afterPlacement.board[1][2][1] = clone(placedToken);
const acceptedPlacement = reduce(beforePlacement, afterPlacement, 'PLACE_CARD', {
  fn:undefined,
  selectedHand:placedToken,
  z:1,r:2,c:1
});
assert.strictEqual(acceptedPlacement.ok, true, acceptedPlacement.reason);

const malformedPlacement = clone(afterPlacement);
malformedPlacement.board[1][2][1].type = 'Supporter';
const rejectedPlacement = reduce(beforePlacement, malformedPlacement, 'PLACE_CARD', {
  fn:undefined,
  selectedHand:placedToken,
  z:1,r:2,c:1
});
assert.strictEqual(rejectedPlacement.ok, false);
assert.match(rejectedPlacement.reason, /Shizuku Token placement state/);

console.log('Landscapes 17 and 18 smoke passed.');
