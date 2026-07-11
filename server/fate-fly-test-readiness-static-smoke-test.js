#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const indexText = read('index.html');
const roomsText = read('src/scripts/18-online-rooms.js');
const rendererText = read('src/scripts/06-rendering-and-helpers.js');
const coreText = read('src/scripts/05-gameplay-core.js');
const coreV2Text = read('src/scripts/05-gameplay-core-v2.js');
const reducerText = read('server/fate-authority-reducer.js');
const flyToml = read('fly.toml');
const pkg = JSON.parse(read('package.json'));

assert.match(indexText, /window\.__fateClientBuildStamp = 'leaderboard-reset-20260711a-1783782001'/, 'index must expose the current Electron/client parity build stamp');
assert.match(indexText, /window\.FATE_GAMEPLAY_AUTHORITY = window\.FATE_GAMEPLAY_AUTHORITY \|\| 'client-resolved'/, 'browser and Electron must default gameplay to client-resolved');
assert.match(indexText, /06-rendering-and-helpers\.js\?v=1783778701/, 'renderer cache bust must include the live card-detail overlay parity build');
assert.match(indexText, /05-gameplay-core\.js\?v=1783783201/, 'gameplay core cache bust must include the effect activation guard build');
assert.match(indexText, /18-online-rooms\.js\?v=1783783401&sync=1783783401/, 'online rooms cache bust must include the narrow resolving-effect gate build');
assert.match(indexText, /electron-immediate/, 'Electron must load online multiplayer modules immediately');
assert.match(indexText, /fateMultiplayerClientReport/, 'client must expose multiplayer parity diagnostics');

assert.match(flyToml, /FATE_WS_REDUCER_MODE = 'client-resolved'/, 'Fly must not run the stale strict gameplay reducer');
assert.match(flyToml, /FATE_WS_GAMEPLAY_AUTHORITY = 'client-resolved'/, 'Fly gameplay authority must be client-resolved');
assert.ok(!pkg.scripts['smoke:authority-reducer'], 'package must not expose the stale authority reducer smoke');
assert.ok(!pkg.scripts['smoke:authority-strict-reducer'], 'package must not expose the stale strict reducer smoke');
assert.ok(!pkg.scripts['smoke:authority-two-client-placement'], 'package must not expose server-authoritative placement reducer smoke');

assert.match(roomsText, /function clientResolvedGameplayEnabled\(\)/, 'online client must keep a client-resolved gameplay gate');
assert.match(roomsText, /return \/\^\(CHOOSE_TURN\|BOARD_ACTION\|HAND_ACTION\)\$\/i\.test\(actionType\)/, 'END_TURN must not be captured before its local async turn-boundary flow settles');
assert.match(roomsText, /if\(clientResolvedLocalCommitPending > 0\)[\s\S]*scheduleClientResolvedAutoCommit\(reason \|\| 'local-commit-pending-retry', 90\)/, 'auto-commit watchdog must not race an in-progress client-resolved local action');
assert.match(roomsText, /function shouldUseStrictServerFirstBoardAction\(payload\)[\s\S]*if\(clientResolvedGameplayEnabled\(\)\) return false;/, 'client-resolved board effects must not be hijacked by strict server-first reducers');
assert.match(roomsText, /function isServerAuthoritativeBoardIntent\(type, payload, g\)[\s\S]*if\(clientResolvedGameplayEnabled\(\)\) return false;/, 'client-resolved placement, movement, and consolidation must not be forced through stale server reducers');
assert.match(roomsText, /window\.__fateSendEffectActivationCinematic = function[\s\S]*resolveOnlineLocalPlayerIndex\('effect-cinematic'\)[\s\S]*sendAction\('EFFECT_CINEMATIC'/, 'effect activation cinematic broadcasts must remain best-effort local visual sends');
assert.doesNotMatch(roomsText, /__fateSendEffectActivationCinematic[\s\S]{0,220}canSendLocalAction\(g, 'EFFECT_CINEMATIC'\)/, 'effect activation cinematic broadcasts must not use the gameplay action gate');
assert.match(roomsText, /k === '_effectActivationInFlight' \|\| k === '_pendingWhenSetActivationInFlight'/, 'online card snapshots must omit transient effect activation locks');
assert.match(roomsText, /function resolvingEffectGateProtectsAction\(type\)[\s\S]*END_TURN\|CLICK_CELL\|PLACE_CARD\|SELECT_PENDING_MOVE_CELL\|SELECT_CONSOLIDATION_TRIBUTE/, 'resolving-effect gate must only protect board and turn commits');
assert.match(roomsText, /resolvingEffectGateProtectsAction\(actionType\) && clientResolvedGameplayEnabled\(\) && clientResolvedLocalCommitPending > 0/, 'pending local commits must not block effect picker continuations');
assert.match(roomsText, /if\(!resolvingEffectGateProtectsAction\(type\)\) return function noopOnlineLocalActionGate/, 'non-board effect actions must not open the resolving-effect action gate');
assert.match(roomsText, /const finalConsolidationClick = pendingConsolidation && isOnlineFinalConsolidationClick/, 'final consolidation clicks must be identified before routing');
assert.match(roomsText, /if\(pendingConsolidation && !finalConsolidationClick\)/, 'final consolidation clicks must avoid the old local-only tribute toggle path');
assert.doesNotMatch(roomsText, /strict server-first board effect/i, 'online rooms must not describe board effects as strict server-first');
assert.doesNotMatch(roomsText, /server-authoritative set\/move\/consolidate/i, 'online rooms must not preserve server-authoritative set/move/consolidate language');

assert.match(coreText, /G\._turnStartedAt = \(typeof window !== 'undefined' && typeof window\.fateAuthorityServerNow === 'function'\)/, 'online next turn must refresh synced turn timer start in core');
assert.match(coreText, /function repairStaleOnlineTurnStartedAt\(limit\)/, 'online timer must repair stale turn-start timestamps before auto-ending');
assert.match(coreV2Text, /G\._turnStartedAt = \(typeof window !== 'undefined' && typeof window\.fateAuthorityServerNow === 'function'\)/, 'online next turn must refresh synced turn timer start in core v2');
assert.match(coreV2Text, /function repairStaleOnlineTurnStartedAt\(limit\)/, 'online timer must repair stale turn-start timestamps before auto-ending in core v2');
assert.match(coreText, /function findLiveConsolidationTributeEntry[\s\S]*function sendConsolidationTributeToDiscard[\s\S]*function spendConsolidationTributesAtomically[\s\S]*spendConsolidationTributesAtomically\(tributes, cp\)/, 'core consolidation must atomically remove every selected tribute before placing the result');
assert.match(coreV2Text, /function findLiveConsolidationTributeEntry[\s\S]*function sendConsolidationTributeToDiscard[\s\S]*function spendConsolidationTributesAtomically[\s\S]*spendConsolidationTributesAtomically\(tributes, cp\)/, 'core v2 consolidation must atomically remove every selected tribute before placing the result');
assert.doesNotMatch(coreText, /discardBoardCard\(t\.card,\s*t\.z,\s*t\.r,\s*t\.c\)/, 'core consolidation must not use the old per-tribute discardBoardCard path');
assert.doesNotMatch(coreV2Text, /discardBoardCard\(t\.card,\s*t\.z,\s*t\.r,\s*t\.c\)/, 'core v2 consolidation must not use the old per-tribute discardBoardCard path');

assert.match(rendererText, /function openInteractiveCardDetailFromPicker/, 'renderer must route live picker cards to the real card detail UI');
assert.match(rendererText, /function showCardInfoOverlay\(card\)[\s\S]*openInteractiveCardDetailFromPicker\(card, null\)/, 'direct card info overlays must converge on live card detail when possible');

assert.match(reducerText, /function validateProposedTransition/, 'authority reducer must be reduced to client-resolved transition validation');
assert.match(reducerText, /client-resolved action requires postState/, 'authority reducer must require posted canonical states');
assert.match(reducerText, /function collectConsolidationTributeRefs[\s\S]*function validateConsolidationPostState[\s\S]*consolidation left a consumed supporter on the board[\s\S]*consolidation did not move every consumed supporter to discard[\s\S]*function validateActionSpecificPostState/, 'client-resolved reducer must reject consolidation postStates that leave selected supporters on board or outside discard');
assert.match(reducerText, /function validatePlacementPostState[\s\S]*PLACE_CARD result card is missing from target square[\s\S]*function validatePendingMovePostState[\s\S]*movement result card is missing from target square/, 'client-resolved reducer must keep action-specific guards for placement and movement postStates');
assert.doesNotMatch(reducerText, /dedicated server reducer|server reducer is not implemented|reduceStartConsolidate|reduceBoardAction|reduceHandAction|reducePickCardsVisualAction/, 'stale card/effect/consolidation reducer paths must be removed');

console.log('fate-fly-test-readiness-static smoke passed');
