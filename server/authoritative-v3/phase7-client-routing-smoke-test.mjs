import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInitialState} from '../../shared/engine/index.mjs';
import {AuthoritativeRoomActor} from './room-actor.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const rooms = fs.readFileSync(path.join(root, 'src', 'scripts', '18-online-rooms.js'), 'utf8');
const gameplay = fs.readFileSync(path.join(root, 'src', 'scripts', '05-gameplay-core.js'), 'utf8');
const renderingHelpers = fs.readFileSync(path.join(root, 'src', 'scripts', '06-rendering-and-helpers.js'), 'utf8');
const client = fs.readFileSync(
  path.join(root, 'src', 'scripts', 'authoritative-v3-phase7-beta-client.mjs'),
  'utf8'
);
const fullUiE2e = fs.readFileSync(
  path.join(root, 'src', 'scripts', 'authoritative-v3-phase7-full-ui-e2e.mjs'),
  'utf8'
);
const matchSceneInput = fs.readFileSync(
  path.join(root, 'src', 'scripts', 'render-v2', '06-match-scene-input.js'),
  'utf8'
);
const actor = fs.readFileSync(path.join(root, 'server', 'authoritative-v3', 'room-actor.mjs'), 'utf8');
const authorityServer = fs.readFileSync(path.join(root, 'server', 'authoritative-v3', 'server.mjs'), 'utf8');
const finalStyles = fs.readFileSync(path.join(root, 'src', 'styles', 'zz-codex-last.css'), 'utf8');
const sceneInput = fs.readFileSync(path.join(root, 'src', 'scripts', 'render-v2', '06-match-scene-input.js'), 'utf8');
const rendererAdapter = fs.readFileSync(path.join(root, 'src', 'scripts', 'render-v2', '04-match-renderer-adapter.js'), 'utf8');
const smoothness = fs.readFileSync(path.join(root, 'src', 'scripts', '21-smoothness-core.js'), 'utf8');
const electronMain = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');
const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
const defaultFly = fs.readFileSync(path.join(root, 'fly.toml'), 'utf8');

assert.match(
  rooms,
  /const phase7ServerOwnsBoard = g\._phase7CurrentMultiplayer === true;[\s\S]*if\(phase7ServerOwnsBoard\) clearOnlineMoreBoardPreference\('phase7-server-board-authority'\)/,
  'Phase 7 must clear retired local-board preservation state before projecting an authoritative snapshot'
);
assert.match(
  rooms,
  /state = phase7ServerOwnsBoard\s*\? state\s*:\s*preferMoreOnlineBoardCards/,
  'Phase 7 must use the exact server board and never revive a locally richer legacy board'
);
assert.match(index, /params\.get\('fateV3UnrankedBeta'\) !== '0'/);
assert.match(
  gameplay,
  /function isTurnTimerInteractionPaused\(\)[\s\S]*_phase7PendingPrompt[\s\S]*getElementById\('modal'\)[\s\S]*function getTurnTimerPausedMs/,
  'every live effect window must suspend the shared turn clock and preserve its elapsed pause'
);
assert.match(
  gameplay,
  /if\(updateTurnTimerPauseState\(turnTimerPauseNow\(\)\)\)\{[\s\S]*updateTimerDisplay\(\);[\s\S]*return;/,
  'the countdown loop must not consume a second while any interaction window is open'
);
assert.match(
  authorityServer,
  /function suspendTurnTimer[\s\S]*remainingMs[\s\S]*function armTurnTimer[\s\S]*pendingPrompt \|\| actor\.state\.pendingHandLimit\) suspendTurnTimer/,
  'the authoritative landscape clock must resume from its remaining time after prompts and hand-limit windows'
);
assert.match(
  rooms,
  /inflightCommandPromises:new Map[\s\S]*function phase7CurrentEquivalentCommand[\s\S]*adapter\?\.view[\s\S]*function phase7SubmitCommand[\s\S]*inflight\.has\(key\)/,
  'coin choices and other visible commands must deduplicate clicks and rebase from the latest rejection snapshot'
);
assert.match(
  rooms,
  /#coin-btns button[\s\S]*button\.disabled = true[\s\S]*phase7SubmitCommand\(command\)/,
  'the coin winner choices must lock immediately while the authoritative command is in flight'
);
assert.match(
  finalStyles,
  /extra board space never resizes[\s\S]*board-target-picker-modal\.is-multi-zone-picker[\s\S]*height:min\(820px[\s\S]*has-extra-cells[\s\S]*overflow-x:auto/,
  'extra rows and cells must scroll inside a stable picker frame'
);
assert.match(
  finalStyles,
  /board-target-cell\.is-square-target\.is-empty[\s\S]*rgba\(238,205,105[\s\S]*is-square-target\.is-selected[\s\S]*rgba\(255,224,129/,
  'all square-target picker states must use the current single-player gold selection treatment'
);
assert.match(rooms, /\['51','66','77','90'\][\s\S]{0,1400}phase7AuthoritativeAffiliationBound[\s\S]{0,500}capture:true/, 'authoritative affiliation prompts must bind their reused visual picker after presentation deferral and guard duplicate submissions');
assert.match(rooms, /sourceId === 'bh04'[\s\S]{0,1800}bindTypeButtons[\s\S]{0,900}phase7AuthoritativeBh04Bound[\s\S]{0,500}capture:true/, 'Destruction of Paradise must bind its deferred single-player type picker and submit the exact authoritative choice once');
assert.match(electronMain, /const PHASE7_UNRANKED_BETA_ENABLED = true/);
assert.match(electronMain, /process\.argv\.includes\('--phase7-test-auth'\)/);
assert.match(electronMain, /process\.argv\.includes\('--phase7-fast-ui-test'\)/);
assert.match(electronMain, /process\.argv\.includes\('--phase7-presentation-test'\)/);
assert.match(electronMain, /PHASE7_FAST_UI_TEST_ENABLED && PHASE7_PRESENTATION_TEST_ENABLED/);
assert.match(electronMain, /fateV3FullUiE2E/);
assert.match(electronMain, /fateV3PresentationE2E/);
assert.match(packageJson, /electron:beta:e2e:fast:a/);
assert.match(packageJson, /electron:beta:e2e:fast:b/);
assert.match(packageJson, /electron:beta:e2e:timing:a/);
assert.match(packageJson, /electron:beta:e2e:timing:b/);
assert.match(electronMain, /PHASE7_UNRANKED_BETA_ENABLED[\s\S]*fateV3BetaTestAuth/);
assert.match(electronMain, /fates-entwined-profiles/);
assert.match(electronMain, /isolateMultiInstanceUserData\(\);\s*applyPerformanceSwitches\(\);/);
assert.match(electronMain, /err\.code === 'ERR_ABORTED'[\s\S]*initial-navigation-reload-continued/);
assert.match(
  electronMain,
  /if \(PHASE7_UNRANKED_BETA_ENABLED\)[\s\S]*fateV3UnrankedBeta[\s\S]*else \{[\s\S]*electronAuthorityConfig\(\)/,
  'Electron launches must set only the authoritative route before considering legacy authority parameters'
);
assert.match(
  index,
  /phase7Conflict = phase7Beta[\s\S]*fateAuthority[\s\S]*flyWs[\s\S]*fateV3SinglePlayer/,
  'Phase 7 must reject every competing authority route'
);
assert.match(
  index,
  /if\(phase7Conflict\)\{[\s\S]*FATE_AUTHORITY_ROUTE_BLOCKED = true[\s\S]*FATE_PHASE7_UNRANKED_BETA_BLOCKED = true[\s\S]*FATE_WS_AUTHORITY_URL = ''/,
  'Phase 7 route conflicts must fail closed'
);
assert.match(
  index,
  /else if\(phase7Beta\)\{[\s\S]*FATE_PHASE7_UNRANKED_BETA = true[\s\S]*FATE_LEGACY_MULTIPLAYER_BLOCKED = true[\s\S]*FATE_WS_AUTHORITY_ENABLED = false/,
  'the standard Phase 7 route must explicitly block legacy authority'
);
assert.match(
  index,
  /FATE_PHASE7_UNRANKED_BETA !== true[\s\S]*FATE_PHASE7_UNRANKED_BETA_BLOCKED[\s\S]*authoritative-v3-phase7-beta-client\.mjs/,
  'the Phase 7 client module must load only on its conflict-free authoritative route'
);
assert.match(index, /FATE_LEGACY_MULTIPLAYER_RETIRED = true/, 'the legacy multiplayer route must be retired globally');
assert.doesNotMatch(index, /fateV3ShadowSoak|fates-entwined-v3-shadow-soak/, 'the retired shadow route settings must be absent');

assert.match(
  rooms,
  /function phase7UnrankedBetaEnabled\(\)\{[\s\S]*FATE_PHASE7_UNRANKED_BETA === true/
);
assert.match(
  rooms,
  /if\(phase7UnrankedBetaEnabled\(\)\)\{[\s\S]*const settings = pendingFreePlayRoomGameSettings\(mode\)[\s\S]*startUnrankedMatchmaking\([\s\S]*deckIds:deck\.deckIds[\s\S]*gameSettings:settings/,
  'the existing Free Play queue must enter Phase 7 matchmaking with the selected deck and complete normalized game settings'
);
assert.match(
  rooms,
  /Phase 7 beta uses Random Free Play matchmaking; room codes are unavailable\./,
  'room-code actions must explain the Phase 7 unranked-only boundary instead of falling through to legacy RTDB'
);
assert.match(
  rooms,
  /function authorityHttpBaseUrl\(\)\{[\s\S]*phase7UnrankedBetaBlocked\(\) \|\| phase7UnrankedBetaEnabled\(\)[\s\S]*return ''/
);
assert.match(
  rooms,
  /function configuredAuthorityUrl\(\)\{[\s\S]*phase7UnrankedBetaBlocked\(\) \|\| phase7UnrankedBetaEnabled\(\)[\s\S]*return ''/
);
assert.match(
  rooms,
  /if\(phase7UnrankedBetaEnabled\(\)\) return window\.fateGetWebSocketAuthorityStatus\(\);/,
  'generic test parameters must not persist or replace the Phase 7 route'
);

assert.match(client, /CLIENT_VERSION = '1\.39\.95-phase7-beta\.1'/);
assert.match(client, /wss:\/\/fates-entwined-main\.fly\.dev\/v3\/beta\/socket/);
assert.doesNotMatch(client, /fates-entwined-v3-unranked-beta\.fly\.dev|fates-entwined-v3-shadow-soak\.fly\.dev/);
assert.match(client, /legacyFallback:false/);
assert.match(client, /TEST_AUTH_ENABLED = params\.get\('electron'\) === '1'[\s\S]*fateV3BetaTestAuth/);
assert.match(
  client,
  /async function firebaseIdToken\(\)\{[\s\S]{0,260}if\(TEST_AUTH_ENABLED\) return \(await temporaryTestIdentity\(\)\)\.idToken;[\s\S]{0,500}FATE_ONLINE/,
  'the isolated test client must use a disposable identity before considering a real signed-in user'
);
assert.match(
  client,
  /resetInheritedFullUiE2ECredential[\s\S]*fateV3FullUiE2E[\s\S]*e2eFresh[\s\S]*sessionStorage\.removeItem\(CREDENTIAL_KEY\)/,
  'the full-UI runner must clear inherited tab credentials once per explicit fresh batch'
);
assert.match(client, /accounts:signUp[\s\S]*accounts:delete/);
assert.match(client, /securetoken\.googleapis\.com\/v1\/token[\s\S]*grant_type:'refresh_token'[\s\S]*expiresAt:Date\.now\(\) \+ expiresInMs/, 'long-running full-UI clients must refresh expiring temporary Firebase identities');
assert.match(client, /containsForbiddenPostState[\s\S]*Phase 7 commands cannot contain client postState/);
assert.match(client, /scheduleReconnect[\s\S]*connect\(\)/);
assert.match(client, /const enterQueue = \(\)=>matchmakingRequest\('\/v3\/beta\/matchmaking\/enter'/, 'matchmaking must retain the exact queue payload for recovery');
assert.match(client, /result\.status === 'idle' && resetRetries < 3[\s\S]*result = await enterQueue\(\)/, 'a transient host restart must re-enter a waiting player instead of failing with idle');
assert.doesNotMatch(client, /FateAuthoritativeV3SinglePlayerScreen/);
assert.match(client, /FatePhase7CurrentMultiplayerUi/);
assert.match(client, /waitForInitialView/);
assert.match(client, /dispatchLegalCommand\(command\)[\s\S]*sendCommand\(command\.type, command\.payload \|\| \{\}\)/);
assert.match(client, /mountGameScreen\(\)/);
assert.match(client, /runAiTurn\(\)[\s\S]*REMOTE_OPPONENT/);
assert.match(rooms, /FatePhase7CurrentMultiplayerUi = Object\.freeze/);
assert.match(rooms, /startOnlineServerBootstrappedGame/);
assert.match(
  rooms,
  /startOnlineServerBootstrappedGame\(\{[\s\S]*forceCoinChoice:String\(view\.state\.phase \|\| ''\) === 'coin'/,
  'both Phase 7 clients must explicitly enter the existing coin screen from authoritative phase'
);
assert.match(
  fs.readFileSync(path.join(root, 'src', 'scripts', '04-game-setup.js'), 'utf8'),
  /pendingOnlineTurnChoice = opts\.forceCoinChoice === true[\s\S]*showScreen\('s-coin'\)[\s\S]*doCoinFlip/,
  'the shared bootstrap must preserve the existing coin screen when authority requires turn choice'
);
assert.match(rooms, /phase7ProjectionToLegacy/);
assert.match(
  rooms,
  /function phase7CardToLegacy\(card(?:, projectedState)?\)[\s\S]{0,700}projectedController = Number\(card\.controller \?\? card\.owner\)[\s\S]{0,500}next\.owner = projectedController[\s\S]{0,160}next\.controller = projectedController/,
  'the shipping UI must score transferred cards for their authoritative controller while preserving printed ownership separately'
);
assert.doesNotMatch(
  rooms,
  /phase7DispatchLegacyIntent/,
  'Phase 7 must never translate or execute a legacy multiplayer intent'
);
assert.match(
  rooms,
  /phase7-non-authoritative-action-blocked/,
  'any non-authoritative multiplayer action that reaches Phase 7 must fail closed'
);
assert.match(
  rooms,
  /window\.showModal = function[\s\S]*phase7CurrentUiActive\(\)[\s\S]*_phase7CurrentMultiplayer === true[\s\S]*_onlineServerPromptBypass[\s\S]*return originals\.showModal\.apply/,
  'Phase 7 modal actions must bypass the legacy client-authoritative MODAL_ACTION wrapper'
);
assert.match(
  rooms,
  /function clientResolvedGameplayEnabled\(\)\{[\s\S]*phase7CurrentUiActive\(\)[\s\S]*_phase7CurrentMultiplayer === true[\s\S]*return false/,
  'Phase 7 must disable the legacy client-resolved ACTION_RESULT watchdog'
);
assert.match(
  rooms,
  /function resolveOnlineLocalPlayerIndex\(reason\)\{[\s\S]*if\(phase7CurrentUiActive\(\)\)[\s\S]*phase7CurrentUiSession\.view\?\.playerIndex[\s\S]*g\.viewerPlayerIndex = authorityIndex[\s\S]*return authorityIndex/,
  'Phase 7 player identity must not be overwritten by stale legacy lobby identity'
);
assert.match(
  rooms,
  /applyOnlineCanonicalState\(legacy[\s\S]*g\._coinWinner = \[0, 1\]\.includes\(Number\(view\.state\.coinFlip\?\.winner\)\)/,
  'the existing coin screen must receive the authoritative winner after canonical-state translation'
);
assert.match(
  gameplay,
  /function shouldShowManualCharacterEffectButton\(card\)[\s\S]*_phase7CurrentMultiplayer === true[\s\S]*fatePhase7CanActivateSource\(card\.iid\)/,
  'Phase 7 activation controls must be driven by exact server-issued legal commands'
);
assert.match(
  renderingHelpers,
  /function queueLandscapeOutsideDrawBonus\(player, drawnCard\)\s*\{[\s\S]{0,520}_phase7CurrentMultiplayer === true\) return false/,
  'West Coast Dreaming must not use the legacy client-owned draw bonus in a Phase 7 match'
);
assert.match(
  renderingHelpers,
  /function processLandscapeDrawQueue\(\)\s*\{[\s\S]{0,420}_phase7CurrentMultiplayer === true\)[\s\S]{0,220}_landscapeDrawQueue = \[\]/,
  'a stale legacy West Coast Dreaming queue must be discarded when Phase 7 authority is active'
);
assert.match(
  gameplay,
  /function getBaseZoneScore\(z, player\)[\s\S]*_phase7CurrentMultiplayer === true[\s\S]*_phase7Statuses[\s\S]*ZONE_FATE_MODIFIER[\s\S]*status\.playerIndex/,
  'Phase 7 zone Fate must include the authority projection status modifiers'
);
assert.match(
  rooms,
  /'_phase7CoinFlip','_phase7PendingPrompt','_phase7PendingHandLimit','_phase7Outcome','_phase7Geometry','_phase7Statuses','_phase7Revision','_phase7ViewerIndex'/,
  'canonical-state application must copy Phase 7 status and interaction metadata before rendering'
);
assert.match(
  rooms,
  /function phase7CardToLegacy\(card(?:, projectedState)?\)[\s\S]*counters\?\.copiedPassiveId[\s\S]*next\.copiedPassiveId = copiedPassiveId[\s\S]*next\._copiedPassiveId = copiedPassiveId/,
  'authoritative copied passives must use the established single-player scoring compatibility fields'
);
assert.match(
  rooms,
  /function phase7CardToLegacy\(card(?:, projectedState)?\)[\s\S]*counters\?\.declaredAffiliation[\s\S]*next\.declaredAffiliation = declaredAffiliation[\s\S]*next\._declaredAff = declaredAffiliation/,
  'authoritative Duncan declarations must use the established single-player scoring compatibility fields'
);
assert.match(
  rooms,
  /function phase7BeginDestinationChoice\(commands, label\)[\s\S]{0,900}closeModal\(\{forceHandLimitClose:true, deferQueuedModals:true\}\)/,
  'authoritative destination selection must clear a stale shipping hand-limit modal before accepting board input'
);
assert.match(
  rooms,
  /supportersSetTotal:cloneOnlinePlain\(projected\.supportersSetTotal \|\| \[0, 0\]\)[\s\S]{0,500}supportersSetP:cloneOnlinePlain\(projected\.supportersSetTotal \|\| \[0, 0\]\)/,
  'authoritative supporter-set totals must populate the established single-player counter used by continuous Fate helpers'
);
assert.match(
  gameplay,
  /function getZoneScore\(z, player\)[\s\S]*_phase7CurrentMultiplayer === true\) return score/,
  'Phase 7 zone Fate must not re-run legacy client multipliers after authoritative scoring'
);
assert.match(rooms, /renderer:'current-multiplayer-ui'/);
assert.match(
  rooms,
  /function phase7RenderAuthoritativeOutcome[\s\S]*showScreen\('s-win'\)[\s\S]*win-title[\s\S]*win-zones[\s\S]*win-rewards/,
  'Phase 7 authoritative outcomes must populate the current endgame-redesign-v2 screen'
);
assert.match(
  rooms,
  /function phase7PresentAuthoritativeOutcome[\s\S]*showFinalZoneReveal/,
  'normal Phase 7 matches must preserve the current final-zone reveal presentation'
);
assert.doesNotMatch(
  rooms,
  /showModal\(title, String\(outcome\.reason/,
  'Phase 7 must not replace the current end screen with a generic modal'
);
assert.match(fullUiE2e, /fateV3FullUiE2E/);
assert.match(fullUiE2e, /fateV3PresentationE2E/);
assert.match(fullUiE2e, /fastUiMode !== timingUiMode/);
assert.match(fullUiE2e, /production-presentation-timing/);
assert.match(fullUiE2e, /presentationTimingViolations/);
assert.match(fullUiE2e, /presentationTrace/);
assert.match(fullUiE2e, /overlayKinds/);
assert.match(fullUiE2e, /FATE_DISABLE_EFFECT_ACTIVATION_CINEMATIC = false/);
assert.match(index, /fateV3FullUiE2E[\s\S]*fateV3PresentationE2E[\s\S]*authoritative-v3-phase7-full-ui-e2e/);
assert.match(fullUiE2e, /dispatchEvent\(new PointerEvent/);
assert.match(fullUiE2e, /clickHandCard[\s\S]*clickPhase7CardAction\('place'[\s\S]*clickBoardDestinationWithRevision/);
assert.match(fullUiE2e, /function clickBoardDestinationWithRevision[\s\S]*clickBoardPosition[\s\S]*lastCommandResult/);
assert.match(fullUiE2e, /function chooseCommand\(view\)[\s\S]*openModalCommands[\s\S]*phase7ModalCommandButton\(command\)[\s\S]*return choices/,
  'an open authoritative landscape modal must be answered before unrelated board commands');
assert.match(fullUiE2e, /function organicRequiredMatches\(cardId\)\{[\s\S]*return 10;[\s\S]*baselineMatches:10[\s\S]*highRiskAdditionalMatches:0/,
  'every non-exempt card must retain the requested ten full-UI certification matches');
assert.match(rooms, /function phase7GuardHandLimitPicker[\s\S]*discard selected[\s\S]*if\(shell && confirm\)[\s\S]*phase7SyncInteractionUi\(\)/,
  'the authoritative hand-limit guard must rebuild incomplete modal chrome, including a missing action row');
assert.match(fullUiE2e, /function organicCardSort[\s\S]*\.sort\(organicCardSort\)/,
  'card certification must use natural numeric order so card 100 never appears between 10 and 11');
assert.match(fullUiE2e, /ORGANIC_VARIANTS\.flatMap[\s\S]*organicCampaignCardIds\.map/, 'card campaign schedule must interleave cards by variant');
assert.match(fullUiE2e, /Math\.min\(1070,[\s\S]*Math\.min\(1069,[\s\S]*ORGANIC_FULL_MATCH_EXEMPT_CARD_IDS = new Set\(\['06','60'\]\)/,
  'the strict campaign must run ten matches for all 107 non-basic-search cards');
assert.match(fullUiE2e, /ORGANIC_ROTATING_SUPPORTER_IDS[\s\S]*ORGANIC_ROTATING_CHARACTER_IDS[\s\S]*function exactOrganicScenarioDeck[\s\S]*rotatedScenarioIds/, 'exact decks must rotate diverse Supporter and Character interaction scaffolds');
assert.doesNotMatch(fullUiE2e, /new Map\(\[\['10',\s*\d+\]\]\)/, 'Post-Modernist Dylan must never be fixed universal scaffolding');
assert.match(fullUiE2e, /reinforcementPolicyForScenario[\s\S]*BASELINE_REAL_RULES[\s\S]*REINFORCEMENT_SENSITIVE_ORACLE[\s\S]*EFFECT_FOCUS_OPTIMIZATION/, 'fixture cost shortcuts must fail closed for baseline and reinforcement-sensitive rules');
assert.match(fullUiE2e, /cardCertificationObligations[\s\S]*UNOBSERVED_RULE_OBLIGATIONS/, 'card certification must fail closed when a positive or negative oracle obligation lacks evidence');
assert.match(rooms, /function phase7EnsureCoinPresentation\(view\)[\s\S]*coinPresentationKey[\s\S]*window\.doCoinFlip\(\)/, 'Phase 7 must initialize the production coin UI even when its screen was already active');
assert.match(fullUiE2e, /exactScenarioDeck:!!exactScenario[\s\S]*scenarioCardIds/);
assert.doesNotMatch(
  fullUiE2e,
  /const organicSeed = organicCardCampaign[\s\S]*ORGANIC_ADVERSARIAL_PARTNERS/,
  'strict organic decks must not add unrelated random/adversarial filler cards'
);
assert.match(fullUiE2e, /failureClassifications[\s\S]*failureBundles[\s\S]*replayKey/);
assert.match(fullUiE2e, /fateAuthorityV3CrossSeat:[\s\S]*Opponent private hand leaked/);
assert.match(fullUiE2e, /fateAuthorityV3FullUiCheckpoint:[\s\S]*writeCheckpoint/);
assert.match(fullUiE2e, /CANARY_CONTRACTS[\s\S]*THIRTY_CONSECUTIVE_CLEAN_MATCHES_REQUIRED/);
assert.match(fullUiE2e, /organicDeckHeldTargets[\s\S]*\['07','28'\]/);
assert.match(
  fullUiE2e,
  /new Set\(\[\.\.\.base, \.\.\.specific\]\)[\s\S]*\.slice\(0, 2\)/,
  'organic variants must prioritize their decisive partners and keep setup feasible in twenty turns'
);
assert.match(
  fullUiE2e,
  /if\(organicTargetOption\) return organicTargetOption;[\s\S]*type === 'CONSOLIDATE_CARD' && organicTargetSetupPending[\s\S]*if\(organicPartnerOption\) return organicPartnerOption/,
  'organic certification must establish the target before a partner can consume consolidation resources'
);
assert.match(fullUiE2e, /fateAuthorityV3Phase7FullUiActiveRun:\$\{runId\}/);
assert.match(fullUiE2e, /isVisible\(candidate\)[\s\S]*board-target-picker/);
assert.match(fullUiE2e, /if\(await waitForRevisionChange\(before, 500\)\)/);
assert.match(
  fullUiE2e,
  /consolidation:choose-destination-picker[\s\S]*selectBoardPickerDestinations\(\[destination\]\)[\s\S]*lastCommandResult/,
  'the full-UI driver must submit a consolidation destination picker instead of closing it as an incidental modal'
);
assert.match(
  fullUiE2e,
  /clickBoardCardWhenReady\(iid, 4000, true, true\)[\s\S]*clickBoardCardWhenReady\(iid, 4000, true, true\)/,
  'consolidation tribute clicks must close late-remounting detail modals and route both normal and retry input through the owned canvas'
);
assert.match(
  fullUiE2e,
  /function phase7ModalCommandButton[\s\S]*phase7CommandPayload[\s\S]*submitPhase7ModalCommandWhenShown\(command, beforeRevision/,
  'the full-UI driver must complete a post-destination authoritative choice instead of dismissing it as incidental'
);
assert.match(
  fullUiE2e,
  /function restartOnBoardConsolidation[\s\S]*revision\) !== Number\(beforeRevision\)[\s\S]*consolidation:reenter[\s\S]*selectOnBoardConsolidation/,
  'a same-revision presentation recommit may re-enter the visible consolidation action instead of using a diagnostic fallback'
);
assert.match(
  fullUiE2e,
  /lastCommandResult\?\.ok === true[\s\S]*lastCommandResult\.revision\) > Number\(before\)/,
  'an accepted command must count as progress while production presentation holds the old visible revision'
);
assert.match(rooms, /button\.dataset\.phase7Action[\s\S]*button\.dataset\.phase7Iid/);
assert.match(
  client,
  /message\.kind === 'snapshot' \|\| message\.kind === 'accepted' \|\| message\.kind === 'rejected'[\s\S]*state = clone\(message\.state\)[\s\S]*revision = Math\.max/,
  'a rejected command must consume the authoritative replacement projection and revision before the UI offers another prompt action'
);
assert.match(
  rooms,
  /function phase7CurrentEquivalentCommand[\s\S]*phase7CommandKey[\s\S]*STALE_REVISION[\s\S]*retryOnStale:false/,
  'a stale prompt click may retry only the exact refreshed server-issued command once'
);
assert.match(rooms, /button\.dataset\.phase7PromptId[\s\S]*phase7PromptCancel/);
assert.match(rooms, /button\.dataset\.phase7CommandType[\s\S]*phase7CommandPayload[\s\S]*phase7CommandKey/);
assert.match(rooms, /phase7CommandRevision/);
assert.match(rooms, /const actions = choices\.map[\s\S]*Target [^\n]*name[\s\S]*Discard [^\n]*name[\s\S]*button\.dataset\.phase7CommandPayload/);
assert.match(rooms, /showModal\(label \|\| 'Choose Action'[\s\S]*onOpen:function\(\)[\s\S]*phase7CommandKey/);
assert.doesNotMatch(rooms, /commands\.filter[\s\S]{0,180}ACTIVATE_LANDSCAPE[\s\S]{0,180}\.slice\(0, 8\)/);
assert.match(rooms, /sameInteractionRevision[\s\S]*if\(!sameInteractionRevision\)\{[\s\S]*phase7ClearDestinationChoice\(\)[\s\S]*phase7ClearConsolidation/);
assert.match(rooms, /prompt\.type === 'BOARD_TARGET'[\s\S]*phase7OpenBoardPromptPicker[\s\S]*commandField:'selectedIid'/);
assert.match(rooms, /BOARD_DESTINATION[\s\S]*phase7OpenBoardPromptPicker[\s\S]*commandField:'destination'/);
assert.match(rooms, /phase7PromptCancel = 'true'/);
assert.match(fullUiE2e, /exactCancel = await waitFor/);
assert.match(fullUiE2e, /promptType === 'BOARD_TARGET'[\s\S]*clickBoardPickerConfirmWhenReady\(\)[\s\S]*clickVisualPickerConfirmWhenReady\(\)/);
assert.match(fullUiE2e, /function commandKey[\s\S]*phase7CommandKey[\s\S]*wantedCommandKey/);
assert.match(fullUiE2e, /clickUiCommand\('phase7-activate-landscape'\)/);
assert.match(fullUiE2e, /wantedRevision[\s\S]*phase7CommandRevision/);
assert.match(sceneInput, /G\._phase7CurrentMultiplayer === true[\s\S]*openCardDetail\(card, true, false\)/);
assert.match(
  sceneInput,
  /handleWheel\(ev\)[\s\S]*pointFromClient\(ev\.clientX, ev\.clientY\)[\s\S]*scrollZoneAtClient\(point\.x, point\.y, ev\.deltaY\)/,
  'zone wheel input must convert viewport coordinates to the board-local layout space'
);
assert.match(
  rendererAdapter,
  /function scrollZoneAtClient\(clientX, clientY, deltaY\)[\s\S]*rect\(item\.rowsRect, originX, originY\)/,
  'zone scrolling must normalize absolute layout row rectangles into canvas-local coordinates'
);
assert.match(
  fullUiE2e,
  /scrollBoardPositionIntoView[\s\S]*new WheelEvent\('wheel'[\s\S]*clickBoardCardWhenReady/,
  'the true full-UI runner must scroll clipped production board rows through real wheel input'
);
assert.match(
  fullUiE2e,
  /modal.*classList\.contains\('on'\)[\s\S]*!view\.state\.pendingPrompt[\s\S]*!view\.state\.pendingHandLimit[\s\S]*closeIncidentalModalBeforeBoardInput/,
  'the true full-UI runner must close completed presentation modals before the next command'
);
assert.match(smoothness, /FatePhase7CurrentMultiplayerUi\?\.active\?\.\(\) === true/);
assert.match(rooms, /phase === 'main'[\s\S]*screenRecoveryKey[\s\S]*showScreen\('s-coin'\)[\s\S]*chooseTurn\(goFirst\)/);
assert.doesNotMatch(fullUiE2e, /dispatchLegalCommand/);
assert.match(
  fullUiE2e,
  /if\(!driven\)[\s\S]*result\.uiDriveRetries \+= 1[\s\S]*result\.lastUiDriveFailure = [\s\S]*submitDiagnosticFallback/,
  'the full-UI runner must retain retry diagnostics without failing a match that a later genuine UI gesture completes'
);
assert.match(
  fullUiE2e,
  /if\(Date\.now\(\) - lastProgressAt > stallTimeoutMs\)[\s\S]*abandonStalledMatch/,
  'a repeated displayed-control failure must still become a strict recorded failure at the bounded stall deadline'
);
assert.match(
  fullUiE2e,
  /function submitDiagnosticFallback[\s\S]*result\.uiFallbacks\.push\(entry\)[\s\S]*beta\(\)\.sendCommand/,
  'the anti-stall fallback must remain explicitly diagnostic and visible in the test results'
);
assert.match(actor, /privateActionCardsForLegalCommands/);
assert.match(actor, /\.filter\(command=>String\(command\?\.type \|\| ''\) === 'SET_CARD_FROM_DECK'\)/);
assert.match(client, /privateActionCards:clone\(privateActionCards\)/);
assert.match(rooms, /view\?\.privateActionCards/);
assert.match(fullUiE2e, /view\.privateActionCards \|\| \[\]/);
assert.match(
  rooms,
  /function phase7BeginConsolidation[\s\S]*_phase7Authoritative:true[\s\S]*phase7RefreshConsolidationUi/,
  'Phase 7 consolidation must use the original on-board interaction while retaining server command ownership'
);
assert.match(rooms, /function phase7HandleConsolidationClick[\s\S]*phase7ConsolidationExactCommands[\s\S]*phase7SubmitCommand/);
assert.match(
  matchSceneInput,
  /phase7-board-click-consumed[\s\S]*phase7ConsumedBoardClickUntil[\s\S]*stopImmediatePropagation[\s\S]*board-dispatch[\s\S]*phase7ConsumedBoardClickUntil[\s\S]*stopImmediatePropagation/,
  'authoritative board-selection input must not bubble into the legacy card-detail click route'
);
assert.match(
  matchSceneInput,
  /function isAuthoritativeConsolidationActive|isAuthoritativeConsolidationActive\(\)/,
  'authoritative consolidation activity must not depend on legacy local-turn projection'
);
assert.match(matchSceneInput, /authoritativeUi\?\.active === true && authoritativeUi\?\.consolidationActive === true/);
assert.match(
  matchSceneInput,
  /isAuthoritativeBoardSelectionActive\(\)[\s\S]*destinationCommandCount[\s\S]*phase7-board-capture-down/,
  'authoritative set and move destinations must take board-input priority over the overlapping command dock'
);
assert.match(
  matchSceneInput,
  /phase7-board-capture-down[\s\S]*handlePointerDown\(ev\)[\s\S]*phase7-board-capture-up[\s\S]*handlePointerUp\(ev\)/,
  'authoritative board selection must be consumed in capture phase before legacy target listeners'
);
assert.match(
  rooms,
  /Chaparral Hoplite[\s\S]*Normal Set[\s\S]*Set Face Down[\s\S]*phase7CommandPayload/,
  'the shipping Hoplite face-up\/face-down picker must expose the exact authoritative choices to UI automation'
);
assert.match(rooms, /phase7PlayActivationCinematics[\s\S]*phase7PresentBatch[\s\S]*modal-gate:open/);
assert.match(rooms, /consolidation-motion:start[\s\S]*consolidation-motion:end/);
assert.match(rooms, /phase7ExactEffectOverlayDescriptor/);
assert.doesNotMatch(rooms, /flashCardEffect\([^\n]+phase7_(?:effect|reaction|state|fate)/);
assert.match(rooms, /presentationBusy[\s\S]*setTimeout\(phase7SyncInteractionUi, 80\)/);
assert.doesNotMatch(
  fs.readFileSync(path.join(root, 'src', 'scripts', '05-gameplay-core.js'), 'utf8'),
  /Choose Consolidation Tributes/,
  'Phase 7 consolidation work must not alter the single-player consolidation flow'
);

const privateChoiceState = createInitialState({
  matchId:'PHASE7PRIVATECHOICES',
  seed:'phase7-private-choice-order',
  handSize:0,
  cardDefinitions:[
    {id:'07', name:'Maja Kaminska', type:'Initiator', aff:'third_great_war', fate:3, cost:1},
    {id:'28', name:'2nd Polish-Lithuanian Army', type:'Supporter', aff:'third_great_war', fate:1, cost:0},
    {id:'32', name:'Temecula Resident', type:'Supporter', aff:'reality', fate:1, cost:0}
  ],
  players:[
    {id:'p0', deckIds:['32', '28', '07']},
    {id:'p1', deckIds:['32']}
  ]
});
const privateChoiceActor = new AuthoritativeRoomActor({state:privateChoiceState, store:null});
const privateChoiceOwner = privateChoiceActor.snapshotForPlayer(0);
const privateChoiceOpponent = privateChoiceActor.snapshotForPlayer(1);
assert.deepEqual(
  new Set(privateChoiceOwner.privateActionCards.map(card=>card.id)),
  new Set(['07', '28']),
  'the acting player must receive display data for only currently legal private deck choices'
);
assert.equal(
  privateChoiceOwner.privateActionCards.some(card=>card.id === '32'),
  false,
  'ordinary cards in the private deck must stay hidden'
);
assert.equal(
  JSON.stringify(privateChoiceOpponent).includes(privateChoiceState.players[0].deck.find(card=>card.id === '28').iid),
  false,
  'an opponent must not receive another player private deck choice metadata'
);
assert.doesNotMatch(client, /localStorage/);
assert.match(
  defaultFly,
  /app = 'node server\/authoritative-v3\/phase7-beta-server\.mjs'[\s\S]*FATE_SERVER_AUTHORITATIVE_V3_PHASE7_BETA_ENABLED = '1'/,
  'the default deployment must run only the Phase 7 authoritative server'
);

console.log('authoritative v3 Phase 7 client routing smoke test passed');
