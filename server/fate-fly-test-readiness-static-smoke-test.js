#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(rel){
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const roomsText = read('src/scripts/18-online-rooms.js');
const indexText = read('index.html');
const pkg = JSON.parse(read('package.json'));
const docs = read('WEBSOCKET_AUTHORITATIVE_SERVER.md') + '\n' + read('ARCHITECTURE_MIGRATION_PROGRESS.md');
const authorityText = read('server/fate-ws-authority.js');

assert.match(indexText, /host\s*!==\s*'fates-entwined-main\.fly\.dev'/, 'hosted game bootstrap must target the Fly production hostname');
assert.match(indexText, /window\.FATE_WS_AUTHORITY_ENABLED\s*=\s*true[\s\S]*window\.FATE_WS_AUTHORITY_URL\s*=\s*origin\.replace\(\//, 'hosted game bootstrap must auto-configure WebSocket authority from the page origin');
assert.match(indexText, /window\.FATE_FLY_API_URL\s*=\s*origin/, 'hosted game bootstrap must auto-configure Fly HTTP API URL from the page origin');
assert.match(indexText, /window\.FATE_RTDB_DISABLED\s*=\s*true[\s\S]*window\.FATE_FLY_ROOMS_ENABLED\s*=\s*true[\s\S]*window\.FATE_FLY_ACTION_REPLAY\s*=\s*true[\s\S]*window\.FATE_FLY_AUTHORITY_ONLY\s*=\s*true/, 'hosted game bootstrap must force Fly-primary no-RTDB multiplayer mode');
assert.match(roomsText, /window\.fateEnableLocalFlyAuthorityForTesting\s*=\s*function\(opts\)/, 'browser must expose local Fly authority test helper');
assert.match(roomsText, /ws:\/\/127\.0\.0\.1:8787/, 'local Fly authority helper must default to ws://127.0.0.1:8787');
assert.match(roomsText, /apiUrl[\s\S]*url\.replace\(\/\^wss:\/i,\s*'https:'\)[\s\S]*replace\(\/\^ws:\/i,\s*'http:'\)/, 'local Fly authority helper must derive HTTP API URL from WS URL');
assert.match(roomsText, /rtdbDisabled:opts\.rtdbDisabled\s*!==\s*false/, 'local Fly authority helper must enable RTDB-disabled mode by default');
assert.match(roomsText, /authorityOnly:opts\.authorityOnly\s*!==\s*false/, 'local Fly authority helper must enable authority-only mode by default');
assert.match(roomsText, /opts\s*&&\s*opts\.rooms\s*===\s*false[\s\S]*localStorage\.removeItem\('fateFlyRoomsEnabled'\)/, 'Fly enable helper must allow room transport override cleanup');
assert.match(roomsText, /opts\s*&&\s*opts\.rtdbDisabled\s*===\s*false[\s\S]*localStorage\.removeItem\('fateRtdbDisabled'\)/, 'Fly enable helper must allow RTDB-disabled override cleanup');
assert.match(roomsText, /opts\s*&&\s*opts\.apiUrl[\s\S]*localStorage\.setItem\('fateFlyApiUrl'[\s\S]*else\s+localStorage\.removeItem\('fateFlyApiUrl'\)/, 'Fly enable helper must clear stale explicit API URL when omitted');
assert.match(roomsText, /window\.fateApplyFlyAuthorityTestParams\s*=\s*function\(\)/, 'browser must expose URL-param Fly authority test helper');
assert.match(roomsText, /params\.has\('flyTest'\)[\s\S]*params\.get\('fateAuthority'\)\s*===\s*'local'[\s\S]*params\.get\('fateAuthority'\)\s*===\s*'fly'/, 'URL-param helper must support flyTest and fateAuthority modes');
assert.match(roomsText, /params\.get\('flyWs'\)[\s\S]*params\.get\('fateWsAuthorityUrl'\)[\s\S]*params\.get\('wsAuthority'\)/, 'URL-param helper must support explicit WS authority URL');
assert.match(roomsText, /params\.get\('flyApi'\)[\s\S]*params\.get\('fateFlyApiUrl'\)[\s\S]*params\.get\('authorityApi'\)/, 'URL-param helper must support explicit HTTP API URL');
assert.match(roomsText, /window\.fateDisableFlyAuthority[\s\S]*localStorage\.removeItem\('fateFlyApiUrl'\)[\s\S]*localStorage\.removeItem\('fateWsAuthorityUrl'\)[\s\S]*localStorage\.removeItem\('fateWsAuthorityEnabled'\)[\s\S]*closeAuthoritySocket\(\)/, 'disable helper must clear local Fly authority test state and close the socket');

const statusIndex = roomsText.indexOf('window.fateGetWebSocketAuthorityStatus = function()');
const applyIndex = roomsText.indexOf('window.fateApplyFlyAuthorityTestParams();');
assert.ok(statusIndex >= 0 && applyIndex > statusIndex, 'URL-param helper must run after status diagnostics are registered');

assert.match(indexText, /18-online-rooms\.js\?v=1782060101/, 'index must cache-bust the online rooms script for test helpers');
assert.match(indexText, /04-game-setup\.js\?v=1782060101/, 'index must cache-bust the match setup script for preload gate changes');
assert.match(indexText, /21-smoothness-core\.js\?v=1782052601/, 'index must cache-bust the smoothness script for warmup policy changes');
assert.match(read('src/scripts/04-game-setup.js'), /function startOnlineServerBootstrappedGame\(options\)[\s\S]*showScreen\('s-game'\)[\s\S]*window\.startOnlineServerBootstrappedGame/, 'online server bootstrap must enter the game without the coin screen');
assert.match(authorityText, /firstPlayer[\s\S]*buildInitialAuthorityState\([\s\S]*phase:'main'[\s\S]*status:'playing'/, 'Fly MATCH_START must create a directly playable main-phase server state');
assert.match(roomsText, /function maybePrejoinLobbyAuthority\(room\)[\s\S]*ensureAuthorityJoined\(code\)/, 'Fly lobby clients must prejoin the WebSocket authority before host start');
assert.match(roomsText, /function handleLobbyMatchStartAccepted\(accepted\)[\s\S]*MATCH_START[\s\S]*startRoomGame\(nextRoom\)/, 'accepted MATCH_START must hand off lobby clients into the match');
assert.match(roomsText, /if\(handleLobbyMatchStartAccepted\(accepted\)\) return;[\s\S]*bufferOnlineAction\(bufferedAction\)/, 'lobby MATCH_START must not be swallowed by in-match replay buffering');
assert.match(read('src/scripts/render-v2/04-match-renderer-adapter.js'), /chat-unread[\s\S]*DIRTY_UI/, 'render-v2 chat notification must use UI-only dirty work');
assert.match(roomsText, /function applyAuthoritativePostState[\s\S]*applyOnlineCanonicalState[\s\S]*isStrictCompactAuthorityAction\(type\)[\s\S]*applyAuthoritativePostState/, 'strict Fly accepted actions must apply server canonical postState directly');
assert.match(roomsText, /async function withLegacyRemoteReplayAction\(fn, playerIndex\)/, 'legacy online replay helper must be explicitly named as legacy');
assert.doesNotMatch(roomsText, /withRemoteAction/, 'legacy replay helper must not keep the ambiguous withRemoteAction name');
assert.match(roomsText, /Strict Fly authority action is missing canonical server state; skipping local replay[\s\S]*resyncRejectedOnlineAction[\s\S]*return;[\s\S]*await withLegacyRemoteReplayAction/, 'strict Fly accepted actions without postState must not fall into legacy local replay');
assert.match(roomsText, /window\.fateAuthorityRenderReport\s*=\s*function\(\)/, 'browser must expose authority render convergence diagnostics');
assert.match(roomsText, /function renderedAuthorityBoardReport\(\)[\s\S]*rendererAvailable[\s\S]*rendererOwnsBoard[\s\S]*rendererCards[\s\S]*rendererExpectedCards[\s\S]*renderSnapshotBoardCount[\s\S]*domBoardCount/, 'authority render diagnostics must expose renderer, snapshot, and DOM count sources');
assert.match(roomsText, /renderedBoardSource[\s\S]*renderedBoardMatchesCanonical[\s\S]*renderMismatchReason[\s\S]*lastRenderDirtyMask[\s\S]*lastRenderDirtySource/, 'authority render diagnostics must report convergence status and render dirtiness');
assert.match(roomsText, /function applyOnlineCanonicalState\(state, reason\)[\s\S]*invalidateFateRenderCaches\(\)[\s\S]*renderGame\(\{force:true\}\)/, 'canonical server state apply must invalidate caches and force a render');
assert.match(read('server/fate-authority-reducer.js'), /function normalizedPendingInteraction\(state\)[\s\S]*state\.pendingInteraction = normalizedPendingInteraction\(state\)[\s\S]*function reducedResult/, 'server reducer must derive normalized pendingInteraction before canonical hashing');
assert.match(roomsText, /pendingInteraction:cloneOnlinePlain\(g\.pendingInteraction\)[\s\S]*'pendingInteraction'[\s\S]*pendingInteractionPromptId/, 'browser must capture, apply, and report normalized pendingInteraction');
assert.match(read('server/fate-authority-reducer.js'), /function toAuthorityIntent\(type, payload, state\)[\s\S]*PLACE_CARD[\s\S]*SELECT_CONSOLIDATION_TRIBUTE[\s\S]*SELECT_PENDING_MOVE_CELL[\s\S]*RESOLVE_ZONE_PICK/, 'server reducer must bridge legacy action names to normalized authority intents');
assert.match(read('server/fate-authority-reducer.js'), /const intent = toAuthorityIntent\(type, msg\?\.payload \|\| null, room\?\.canonicalState\)[\s\S]*intent === 'PLACE_CARD'[\s\S]*intent === 'RESOLVE_MODAL'[\s\S]*intent === 'RESOLVE_ZONE_PICK'/, 'server reducer dispatch must route normalized authority intents');
assert.match(roomsText, /function toAuthorityIntent\(type, payload, g\)[\s\S]*PLACE_CARD[\s\S]*SELECT_CONSOLIDATION_TRIBUTE[\s\S]*SELECT_PENDING_MOVE_CELL[\s\S]*RESOLVE_AFFILIATION_PICK/, 'browser must bridge legacy action names to normalized authority intents for gating');
assert.match(roomsText, /function strictAuthorityIntentForSend\(type, payload, g\)[\s\S]*isStrictCompactAuthorityAction\(actionType\)[\s\S]*toAuthorityIntent\(actionType, payload \|\| null, g \|\| gameState\(\)\)/, 'browser must send normalized authority intents for strict Fly actions');
assert.match(roomsText, /const authorityActionType = authorityEnabled && !allowFirebaseFallback[\s\S]*strictAuthorityIntentForSend\(actionType, payload, gameState\(\)\)[\s\S]*sendActionViaAuthority\(authorityActionType, payload\)/, 'WebSocket authority sends must use normalized strict intent names');
assert.match(authorityText, /CLICK_CELL\|PLACE_CARD\|SELECT_CONSOLIDATION_TRIBUTE\|SELECT_PENDING_MOVE_CELL[\s\S]*RESOLVE_MODAL[\s\S]*RESOLVE_ZONE_PICK[\s\S]*RESOLVE_AFFILIATION_PICK/, 'WebSocket authority validator must allow normalized strict intent names');
assert.match(read('server/fate-authority-two-client-placement-smoke-test.js'), /assert\.strictEqual\(host\.canonicalState\.phase, 'main'\)[\s\S]*sendIntent\(firstClient, 'PLACE_CARD'[\s\S]*expectAcceptedOnBoth\(firstClient, secondClient, 'PLACE_CARD'/, 'two-client placement proof must place immediately after direct MATCH_START');
assert.match(read('server/fate-authority-reducer-smoke-test.js'), /msg\('SELECT_CONSOLIDATION_TRIBUTE'[\s\S]*msg\('RESOLVE_ZONE_PICK'[\s\S]*msg\('RESOLVE_CARD_PICK'[\s\S]*msg\('SELECT_PENDING_MOVE_CELL'[\s\S]*msg\('RESOLVE_AFFILIATION_PICK'[\s\S]*msg\('RESOLVE_MODAL'/, 'authority reducer smoke must cover canonical pending-resolution intents');
assert.match(roomsText, /function normalizedClientPendingInteraction\(g\)[\s\S]*function actionMatchesPendingInteraction\(type, pending\)[\s\S]*function pendingInteractionLabel\(pending\)/, 'browser must normalize pendingInteraction for local action gating');
assert.match(roomsText, /function canSendLocalAction\(g, type\)[\s\S]*normalizedClientPendingInteraction\(g\)[\s\S]*actionMatchesPendingInteraction\(actionType, pending\)[\s\S]*Resolve /, 'browser must block unrelated local actions while a server pending interaction exists');
assert.match(roomsText, /function sendOptimisticAction\(type, payload, applyLocal\)[\s\S]*canSendLocalAction\(latestBeforeLocal, type\)[\s\S]*preflightAuthorityCatchupBeforeLocal/, 'optimistic actions must pass pending-aware local action gate before local mutation');
assert.match(read('server/fate-authority-reducer.js'), /function pendingInteractionMatchesIntent\(type, pending\)[\s\S]*function pendingInteractionBlockReason\(type, pending\)[\s\S]*blocked by pendingInteraction=/, 'server reducer must block unrelated intents with pendingInteraction diagnostics');
assert.match(read('server/fate-authority-reducer.js'), /const pendingBlock = pendingInteractionBlockReason\(type, normalizedPendingInteraction\(room\?\.canonicalState\)\)[\s\S]*if\(pendingBlock\)/, 'server reducer dispatch must apply the shared pendingInteraction gate before intent reducers');
assert.match(authorityText, /profileCropFocusX:safeNullableNumber[\s\S]*profileCropZoom:safeNullableNumber/, 'Fly public profiles must preserve profile crop metadata');
assert.match(read('src/scripts/16-online-core.js'), /profileCropFocusX[\s\S]*cropFocusX[\s\S]*transform:scale/, 'browser profile helper must apply Fly crop metadata');
assert.match(indexText, /fates-entwined-main\.fly\.dev'[\s\S]*serviceWorker\.getRegistrations/, 'hosted Fly game must unregister old service workers so phone browsers pick up fresh builds');
assert.strictEqual(pkg.scripts['smoke:fly-test-readiness'], 'node server/fate-fly-test-readiness-static-smoke-test.js', 'package must expose Fly test readiness smoke');
assert.strictEqual(pkg.scripts['hotfix:fly-static'], 'node tools/publish-static-hotfix.js --url https://fates-entwined-main.fly.dev', 'package must expose phone-test static hotfix publisher');
assert.ok((pkg.scripts['smoke:fly-cutover'] || '').includes('fate-fly-cutover-preflight-smoke-test.js'), 'cutover smoke must remain the combined gate');
assert.match(authorityText, /FATE_STATIC_HOTFIX_TOKEN/, 'authority server must keep static hotfix uploads token-gated');
assert.match(authorityText, /parts\[1\] === 'static-overrides'/, 'authority server must expose static override upload route');
assert.match(authorityText, /pathname === '\/index\.html'[\s\S]*pathname === '\/src\/scripts\/18-online-rooms\.js'[\s\S]*pathname\.startsWith\('\/src\/'\)[\s\S]*return ''/, 'authority server must not let persisted static overrides mask game entrypoint or source files');
assert.match(authorityText, /shouldFinalizeDisconnectImmediately[\s\S]*canonicalState[\s\S]*canonicalHash/, 'active Fly room disconnects must be eligible for immediate server-side match end');
assert.match(authorityText, /markSocketDisconnected\(ws, \{immediate:!shuttingDown\}\)/, 'socket cleanup must end player disconnects immediately except during graceful server shutdown');
assert.match(docs, /fateEnableLocalFlyAuthorityForTesting\(\)/, 'docs must mention the local Fly authority test helper');
assert.match(docs, /\?flyTest=1/, 'docs must mention the URL-param Fly test mode');
assert.match(docs, /fateGetWebSocketAuthorityStatus\(\)/, 'docs must mention the browser authority status diagnostic');
assert.match(docs, /hotfix:fly-static/, 'docs must mention the phone-test static hotfix workflow');

console.log('fate-fly-test-readiness-static smoke passed');
