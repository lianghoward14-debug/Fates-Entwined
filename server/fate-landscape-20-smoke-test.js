#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {getCardCatalog} = require('./fate-card-catalog');
const {buildInitialAuthorityState} = require('./fate-authority-bootstrap');

const root = path.resolve(__dirname, '..');
const read = file=>fs.readFileSync(path.join(root, file), 'utf8');
const data = read('src/scripts/01-data-and-state.js');
const structural = read('src/scripts/00-structural-helpers.js');
const core = read('src/scripts/05-gameplay-core.js');
const rendering = read('src/scripts/06-rendering-and-helpers.js');
const audio = read('src/scripts/08-audio-and-meta-ui.js');
const online = read('src/scripts/18-online-rooms.js');

for(const asset of ['ingamebackgrouds/igb20.png', 'setvoicelines/board20.mp3']){
  const full = path.join(root, asset);
  assert(fs.existsSync(full), `${asset} must exist`);
  assert(fs.statSync(full).size > 1000, `${asset} must contain supplied media`);
}

assert.match(data, /igb20:\s*\{[\s\S]{0,180}name:'The Battle of Pella, 2052'[\s\S]{0,120}shortName:'The Battle of Pella, 2052'[\s\S]{0,260}first player to reach 20, 35, and 50 total Fate can discard any one card/i);
assert.doesNotMatch(data, /name:'The Battle of Pella, 2052: Charge of the Greek War Carts'/);
assert.match(structural, /Math\.min\(20, parseInt\(String\(song/);
assert.match(audio, /GAME_SONGS = Array\.from\(\{length:20\}/);
assert.match(audio, /n === 20\) path = 'ingamebackgrouds\/igb20\.png'/);
assert.match(online, /function pickSongForSeed[\s\S]{0,180}Math\.floor\(rng\(\) \* 20\) \+ 1/);
assert.match(rendering, /getBattleOfPellaFateThresholdPanelNote[\s\S]{0,1800}pella-fate-threshold[\s\S]{0,500}Fate races[\s\S]{0,160}<br>Your Fate:[\s\S]{0,120}Opp:/);
assert.doesNotMatch(rendering, /Claimed:/);
assert.match(rendering, /function isBattleOfPellaDiscardableCard[\s\S]{0,300}isFullyEffectImmuneCard/);
assert.match(rendering, /getActiveLandscapeFateDiscardConfig[\s\S]{0,720}id:'igb20'[\s\S]{0,220}thresholds:BATTLE_OF_PELLA_FATE_DISCARD_THRESHOLDS/);
assert.match(rendering, /function maybeResolveBattleOfPellaThreshold\([\s\S]{0,1600}totals\[player\] >= threshold/);
assert.match(rendering, /function resolveBattleOfPellaDiscard[\s\S]{0,1800}discardBoardCard\(live, z, r, c\)/);
assert.match(rendering, /onlineClientOwnedChoice:true/);
assert.match(online, /function maybePlayOnlineNewCharacterCinematic[\s\S]{0,240}isOnlineBoardRemovalPresentationAction\(action\)[\s\S]{0,40}return false/, 'Pella discard commits must not replay a character cinematic from a coalesced board snapshot');
assert.match(core, /function ignoreBattleOfPellaThresholdsReachedBeforeEntry[\s\S]{0,1500}highestAlreadyReached[\s\S]{0,900}ignoredOnEntry:true/, 'entering Pella mid-game must mark already-reached thresholds as ignored');
assert.match(core, /case '82'[\s\S]{0,2200}previousLandscapeId[\s\S]{0,500}ignoreBattleOfPellaThresholdsReachedBeforeEntry/, 'Felicyta landscape changes into Pella must initialize the next eligible Fate race');

const catalog = getCardCatalog();
const deck = catalog.cards.filter(card=>card && !card.retired && !card.temporarilyDisabled).slice(0, 40).map(card=>card.id);
const boot = buildInitialAuthorityState({catalog, seed:'igb20-smoke', song:'board20', decks:{0:deck, 1:deck}});
assert.strictEqual(boot.state.landscapeId, 'igb20');
assert.strictEqual(boot.state.landscapeBgNum, 20);
assert.deepStrictEqual(boot.state._landscapeState.igb20FateThresholdClaims, {});
assert.strictEqual(boot.state._landscapeState.igb20PendingFateThreshold, null);

const start = rendering.indexOf('let _battleOfPellaThresholdTimer');
const endMarker = 'window.resolveBattleOfPellaDiscard = resolveBattleOfPellaDiscard;';
const end = rendering.indexOf(endMarker, start) + endMarker.length;
assert(start >= 0 && end > start, 'Battle of Pella runtime block must be extractable');
const landscapeState = {id:'igb20', igb20FateThresholdClaims:{}, igb20PendingFateThreshold:null, igb20Winner:null, igb20ChoiceResolved:false, igb20Declined:false};
const highCard = {id:'03', iid:'high', name:'High Fate Hero', owner:0, fate:20, currentFate:20};
const targetCard = {id:'05', iid:'target', name:'Target Supporter', owner:1, fate:12, currentFate:12};
const immuneCard = {id:'bh01', iid:'immune', name:'Ani\u010dka', owner:1, fate:4, currentFate:4, immuneFlag:true};
const board = Array.from({length:3}, ()=>Array.from({length:3}, ()=>Array.from({length:3}, ()=>null)));
board[0][2][0] = highCard;
board[1][0][0] = targetCard;
board[2][0][0] = immuneCard;
const sandbox = {
  G:{
    landscapeId:'igb20', phase:'main', currentPlayer:0, aiEnabled:true, aiPlayer:0,
    players:[{name:'P1', discard:[]}, {name:'P2', discard:[]}], board
  },
  window:{}, document:{getElementById:()=>null},
  isLandscapeActive:id=>id === 'igb20',
  getLandscapeState:()=>landscapeState,
  getLandscapeTotalFate:player=>board.flat(2).filter(card=>card && card.owner === player).reduce((sum, card)=>sum + Number(card.currentFate || card.fate || 0), 0),
  getAllBoardCardEntries:filter=>{
    const entries = [];
    board.forEach((zone,z)=>zone.forEach((row,r)=>row.forEach((card,c)=>{
      if(card && (!filter || filter(card,z,r,c))) entries.push({card,z,r,c});
    })));
    return entries;
  },
  getEffectiveFate:card=>Number(card.currentFate || card.fate || 0),
  isWojciechPierogiCounter:()=>false,
  isFullyEffectImmuneCard:card=>!!(card && card.immuneFlag),
  discardBoardCard:(card,z,r,c)=>{ board[z][r][c] = null; sandbox.G.players[card.owner].discard.push(card); },
  renderGame:()=>{}, triggerLandscapeFlash:()=>{}, toast:()=>{}, log:()=>{}, showBoardTargetPicker:()=>{},
  setTimeout:()=>1, clearTimeout:()=>{}
};
vm.runInNewContext(rendering.slice(start, end), sandbox, {filename:'fate-landscape-20-runtime.js'});
assert.strictEqual(sandbox.window.maybeResolveBattleOfPellaThreshold(), true);
assert.strictEqual(landscapeState.igb20FateThresholdClaims['20'].winner, 0);
assert.strictEqual(landscapeState.igb20FateThresholdClaims['20'].choiceResolved, true);
assert.strictEqual(board[1][0][0], null);
assert.strictEqual(board[2][0][0], immuneCard);
assert.strictEqual(sandbox.G.players[1].discard[0].iid, 'target');

const coreHelperStart = core.indexOf('function ignoreBattleOfPellaThresholdsReachedBeforeEntry');
const coreHelperEnd = core.indexOf('function ensureMailDeliveryState', coreHelperStart);
assert(coreHelperStart >= 0 && coreHelperEnd > coreHelperStart, 'Pella entry-threshold helper must be extractable');
const entryLandscapeState = {id:'igb20', igb20FateThresholdClaims:{}, igb20PendingFateThreshold:null};
const entrySandbox = {
  window:{},
  G:{landscapeId:'igb20', _landscapeState:entryLandscapeState},
  getLandscapeState:()=>entryLandscapeState,
  getLandscapeTotalFate:player=>player === 0 ? 36 : 14
};
vm.runInNewContext(core.slice(coreHelperStart, coreHelperEnd), entrySandbox, {filename:'fate-landscape-20-entry-runtime.js'});
assert.deepStrictEqual(
  Array.from(entrySandbox.window.ignoreBattleOfPellaThresholdsReachedBeforeEntry('igb3')),
  [20, 35],
  'Pella must ignore every threshold already reached before the landscape change'
);
assert.strictEqual(entryLandscapeState.igb20FateThresholdClaims['20'].ignored, true);
assert.strictEqual(entryLandscapeState.igb20FateThresholdClaims['35'].choiceResolved, true);
assert.strictEqual(entryLandscapeState.igb20FateThresholdClaims['50'], undefined, 'the next threshold must remain eligible');

console.log('Landscape 20 Battle of Pella smoke passed.');
