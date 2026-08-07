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
const rendererV2 = read('src/scripts/render-v2/04-match-renderer-adapter.js');
const inputV2 = read('src/scripts/render-v2/06-match-scene-input.js');
const authority = read('server/fate-ws-authority.js');
const css = read('src/styles/99-ui-final.css');
const index = read('index.html');

assert.match(spectator,
  /\/resume\?after=0&limit=500&includeState=1&spectator=1/,
  'Fly spectators must bootstrap from a spectator-redacted canonical state');
assert.match(spectator,
  /const canonicalState = resume\?\.canonicalState \|\| null;[\s\S]*showScreen\('s-game'\)[\s\S]*applySpectatorCanonicalState\(canonicalState, 'spectator initial canonical state'/,
  'spectators must enter directly from current canonical state without a fake local game bootstrap');
assert.doesNotMatch(spectator.match(/async function spectateFlyMatch[\s\S]*?\n  }\n\n  function applySpectatorCanonicalState/)?.[0] || '', /startGame\(/,
  'Fly spectator bootstrap must not run the normal local match start flow');
assert.match(spectator,
  /\/events\?after=\$\{encodeURIComponent\(spectatorLastActionSeq\)\}&limit=120&spectator=1[\s\S]*events\.forEach\(item=>consumeCanonicalAction/,
  'live spectator polling must consume each accepted action in order without downloading unchanged canonical state');
assert.match(spectator,
  /spectatorChatMessages\.set[\s\S]*\[\.\.\.spectatorChatMessages\.values\(\)\]/,
  'incremental spectator chat polls must accumulate instead of replacing visible history');
assert.match(spectator,
  /spectatorEndLeaveTimer[\s\S]*leaveSpectating\(\{expectedCode:code\}\)/,
  'terminal room cleanup must be idempotent and scoped to the room that ended');
assert.match(spectator,
  /addEventListener\('pagehide'[\s\S]*signalSpectatorLeave/,
  'browser refresh and close must send a keepalive spectator leave signal');
assert.match(spectator,
  /function getUser\(\)[\s\S]*getEphemeralMultiplayerGuestUser[\s\S]*async function flyApiRequest[\s\S]*const user = getUser\(\)[\s\S]*x-fate-guest-session/,
  'player spectator-count polling must authenticate Electron guest seats instead of repeatedly receiving 403 responses');
assert.doesNotMatch(spectator, /\bsendAction\s*\(/,
  'spectator transport must never send a gameplay action');
assert.doesNotMatch(spectator, /applySpectatorAction|__fateOnlineOriginalFns|drainSpectatorActions|spectatorActionReplayQueue/,
  'the stale client-side gameplay replayer must not remain in spectator mode');

assert.match(rooms,
  /window\.fateApplySpectatorCanonicalState = function\(state, reason, action\)[\s\S]*g\._isSpectator[\s\S]*g\._onlineRole !== 'spectator'[\s\S]*Number\.isInteger\(g\._onlinePlayerIndex\)[\s\S]*maybePlayOnlineRemoteStatePresentation/,
  'the canonical-state bridge must fail closed unless the local session is an unseated spectator');
assert.match(rooms,
  /if\(!g\._isSpectator && g\._onlineRole !== 'spectator' && typeof window\.startTurnTimer/,
  'authority state must not start a gameplay timer for spectators');
assert.match(rooms,
  /function resolvePayloadEffectCinematicCard[\s\S]*expectedIid[\s\S]*expandOnlineCard\(identity\)[\s\S]*function showPayloadEffectCinematic[\s\S]*resolvePayloadEffectCinematicCard/,
  'remote supporter activation cinematics must survive a newer canonical board snapshot by reconstructing the source card from the presentation payload');
assert.match(rooms,
  /function resetClientResolvedActionLocks[\s\S]*clientResolvedLocalCommitPending = 0[\s\S]*onlineLocalActionGate = null[\s\S]*terminal room cleanup:[\s\S]*new room bootstrap:/,
  'new and completed matches must clear stale resolving-effect locks');

assert.match(spectator,
  /controls\.innerHTML = \[0, 1\]\.map[\s\S]*data-spectator-perspective/,
  'spectator mode must render exactly one perspective button for each player');
assert.match(spectator,
  /function setSpectatorPerspective\(playerIndex, announce=true\)[\s\S]*g\.viewerPlayerIndex = next;[\s\S]*invalidateFateRenderCaches[\s\S]*renderBoardActionForPlayer/,
  'perspective switching must update only the local viewer and force a perspective-safe render');
assert.match(css, /\.spectator-perspective-controls\s*\{[\s\S]*position:absolute;top:8px;right:12px/,
  'perspective buttons must sit in the game screen top-right');

assert.match(renderer,
  /if\(!G\._isSpectator && typeof enforceHandLimit === 'function'\) enforceHandLimit\(cp\)/,
  'rendering either spectator perspective must never open a discard prompt or mutate a hand');
assert.match(rendererV2,
  /if\(item\.card\.hidden \|\| item\.card\._spectatorHidden\)\{[\s\S]*drawCardBack[\s\S]*disabled:true/,
  'both spectator hand perspectives must draw authority placeholders as non-interactive card backs');
assert.match(inputV2,
  /if\(G\._isSpectator\)\{[\s\S]*if\(card\.hidden \|\| card\._spectatorHidden\) return;/,
  'hidden spectator hand placeholders must never open a card-detail action');

assert.match(authority,
  /function spectatorSafeCanonicalState[\s\S]*next\.deck = Array\.from[\s\S]*next\.hand = Array\.from[\s\S]*card\.faceDown[\s\S]*spectatorHiddenCard/,
  'authority spectator snapshots must redact ordered decks, both hands, and face-down board identities');
assert.match(authority,
  /spectators:\{\}[\s\S]*stable viewer UIDs never leave the authority process/,
  'public room payloads must expose only an aggregate spectator count');
assert.match(authority,
  /const spectatorView = url\.searchParams\.get\('spectator'\) === '1'[\s\S]*spectatorSafeAcceptedEvent/,
  'spectator event and resume endpoints must return redacted events');
assert.match(authority,
  /SPECTATOR_STALE_MS[\s\S]*function pruneStaleRoomSpectators/,
  'the authority must reap spectators whose heartbeat disappeared');

assert.match(index, /06-rendering-and-helpers\.js\?v=1785605800/, 'spectator-safe renderer must be cache-busted');
assert.match(index, /render-v2\/04-match-renderer-adapter\.js\?v=1785600200/, 'hidden spectator hand renderer and Boleslaw overlays must be cache-busted');
assert.match(index, /render-v2\/06-match-scene-input\.js\?v=1785604200/, 'hidden spectator hand input guard and live board-selector release contract must be cache-busted');
assert.match(index, /18-online-rooms\.js\?v=1785606400&sync=1785606400/, 'canonical spectator bridge must be cache-busted');
assert.match(index, /22-spectator\.js\?v=1785072425/, 'spectator runtime must be cache-busted');

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
