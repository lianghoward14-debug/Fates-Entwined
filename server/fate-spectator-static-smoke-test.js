#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const spectator = read('src/scripts/22-spectator.js');
const rooms = read('src/scripts/18-online-rooms.js');
const renderer = read('src/scripts/06-rendering-and-helpers.js');
const input = read('src/scripts/render-v2/06-match-scene-input.js');
const css = read('src/styles/99-ui-final.css');
const index = read('index.html');

assert.match(spectator,
  /\/resume\?after=\$\{encodeURIComponent\(spectatorLastActionSeq\)\}&limit=120&includeState=1/,
  'Fly spectators must poll the authority resume endpoint with canonical state');
assert.match(spectator,
  /const canonicalState = resume\?\.canonicalState \|\| startPayload\.postState \|\| null;[\s\S]*applySpectatorCanonicalState\(canonicalState, 'spectator initial canonical state'/,
  'spectators must bootstrap from current canonical state instead of replaying months-old client actions');
assert.match(spectator,
  /const hasCanonicalState = !!data\.canonicalState[\s\S]*applySpectatorCanonicalState\([\s\S]*data\.canonicalState/,
  'live spectator polling must prefer canonical state');
assert.doesNotMatch(spectator, /\bsendAction\s*\(/,
  'spectator transport must never send a gameplay action');
assert.doesNotMatch(spectator, /applySpectatorAction|__fateOnlineOriginalFns|drainSpectatorActions|spectatorActionReplayQueue/,
  'the stale client-side gameplay replayer must not remain in spectator mode');

assert.match(rooms,
  /window\.fateApplySpectatorCanonicalState = function\(state, reason, action\)[\s\S]*g\._isSpectator[\s\S]*g\._onlineRole !== 'spectator'[\s\S]*Number\.isInteger\(g\._onlinePlayerIndex\)[\s\S]*applyOnlineCanonicalState/,
  'the canonical-state bridge must fail closed unless the local session is an unseated spectator');
assert.match(rooms,
  /if\(!g\._isSpectator && g\._onlineRole !== 'spectator' && typeof window\.startTurnTimer/,
  'authority state must not start a gameplay timer for spectators');

assert.match(spectator,
  /controls\.innerHTML = \[0, 1\]\.map[\s\S]*data-spectator-perspective/,
  'spectator mode must render exactly one perspective button for each player');
assert.match(spectator,
  /function setSpectatorPerspective\(playerIndex, announce=true\)[\s\S]*g\.viewerPlayerIndex = next;[\s\S]*invalidateFateRenderCaches[\s\S]*renderBoardActionForPlayer/,
  'perspective switching must update only the local viewer and force a perspective-safe render');
assert.match(css, /\.spectator-perspective-controls\s*\{[\s\S]*position:absolute;top:8px;right:12px/,
  'perspective buttons must sit in the game screen top-right');

assert.match(renderer,
  /function enforceHandLimit\(player\)[\s\S]*if\(G\._isSpectator \|\| G\._onlineRole === 'spectator'\) return false;/,
  'rendering either spectator perspective must never open a discard prompt or mutate a hand');
assert.match(input,
  /if\(G\._isSpectator\)\{[\s\S]*openCardDetail\(card, false, false\);[\s\S]*return;/,
  'spectators may inspect the visible hand without entering the hand-action path');

assert.match(index, /99-ui-final\.css\?v=1783952401/, 'spectator CSS must be cache-busted');
assert.match(index, /06-rendering-and-helpers\.js\?v=1784118301/, 'spectator-safe renderer must be cache-busted');
assert.match(index, /render-v2\/06-match-scene-input\.js\?v=1784050402/, 'spectator hand input must be cache-busted');
assert.match(index, /18-online-rooms\.js\?v=1784118301&sync=1784118301/, 'canonical spectator bridge must be cache-busted');
assert.match(index, /22-spectator\.js\?v=1783952405/, 'spectator runtime must be cache-busted');

const spectatorState = {
  _isSpectator:true,
  _onlineRole:'spectator',
  _onlinePlayerIndex:null,
  viewerPlayerIndex:0,
  localPlayerIndex:0,
  players:[{name:'Host'}, {name:'Guest'}],
  playerProfiles:{0:{name:'Host'}, 1:{name:'Guest'}},
  selectedHandCard:3,
  selectedBoardCard:{z:0,r:0,c:0},
  placing:true
};
const renderCalls = [];
const sandboxWindow = {
  FATE_GAME_STATE:spectatorState,
  getFateGameState:()=>spectatorState,
  invalidateFateRenderCaches:()=>renderCalls.push({kind:'invalidate'}),
  renderBoardActionForPlayer:(player, options)=>renderCalls.push({kind:'render', player, options}),
  updatePlayerBanners:()=>renderCalls.push({kind:'banners'}),
  updateTopBar:()=>renderCalls.push({kind:'topbar'})
};
const sandbox = {
  window:sandboxWindow,
  document:{readyState:'loading', addEventListener(){}, getElementById(){ return null; }},
  location:{hostname:'127.0.0.1', origin:'http://127.0.0.1'},
  localStorage:{getItem(){ return null; }},
  console,
  setTimeout(){ return 1; },
  clearTimeout(){},
  setInterval(){ return 1; },
  clearInterval(){},
  fetch:async()=>{ throw new Error('unexpected network request'); }
};
vm.runInNewContext(spectator, sandbox, {filename:'22-spectator.js'});
assert.strictEqual(sandboxWindow.fateSetSpectatorPerspective(1, false), true, 'spectator perspective switch should succeed');
assert.strictEqual(spectatorState.viewerPlayerIndex, 1, 'perspective switch should update viewerPlayerIndex');
assert.strictEqual(spectatorState.localPlayerIndex, 1, 'perspective switch should update the local render perspective');
assert.strictEqual(spectatorState._onlinePlayerIndex, null, 'perspective switch must never seat the spectator');
assert.strictEqual(spectatorState.selectedHandCard, null, 'perspective switch should clear stale local hand selection');
assert.ok(renderCalls.some(call=>call.kind === 'render' && call.player === 1 && call.options.bothHands), 'perspective switch should request a full perspective render');

spectatorState._isSpectator = false;
spectatorState._onlineRole = 'host';
spectatorState._onlinePlayerIndex = 0;
spectatorState.viewerPlayerIndex = 0;
assert.strictEqual(sandboxWindow.fateSetSpectatorPerspective(1, false), false, 'perspective control must fail closed in a seated player session');
assert.strictEqual(spectatorState.viewerPlayerIndex, 0, 'a seated player perspective must not be changed by the spectator API');

console.log('fate spectator static smoke passed');
