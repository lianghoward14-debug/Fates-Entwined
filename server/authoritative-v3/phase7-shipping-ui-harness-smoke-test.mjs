import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const read = relative=>fs.readFileSync(path.join(root, relative), 'utf8');
const harness = read('src/scripts/authoritative-v3-phase7-full-ui-e2e.mjs');
const rendering = read('src/scripts/06-rendering-and-helpers.js');
const gameplayCore = read('src/scripts/05-gameplay-core.js');
const cardMotion = read('src/scripts/render-v2/10-card-motion-fx.js');
const renderer = read('src/scripts/render-v2/04-match-renderer-adapter.js');
const cardData = read('src/scripts/01-data-and-state.js');
const onlineRooms = read('src/scripts/18-online-rooms.js');
const styles = read('src/styles/zz-codex-last.css');
const supervisor = read('tools/phase7-functional-campaign-supervisor.mjs');
const electronMain = read('electron/main.js');

assert.match(harness, /const exactShippingPathMode = timingUiMode;/, 'only production-presentation mode may be exact shipping-path evidence');
assert.match(harness, /const diagnosticFallbackEnabled = fastUiMode && params\.get\('e2eAllowDiagnosticFallback'\) === '1';/, 'direct-command fallback must be explicit and diagnostic-only');
assert.match(harness, /if\(!diagnosticFallbackEnabled\)[\s\S]{0,700}Direct command fallback is forbidden[\s\S]{0,900}beta\(\)\?\.sendCommand/, 'shipping path must reject fallback before the direct send command');
assert.match(harness, /NON_SHIPPING_PRESENTATION_MODE/, 'fast presentation-bypassed runs must fail the release gate');
assert.match(harness, /RENDERED_UI_ORACLE_VIOLATION/, 'rendered UI findings must fail the release gate');
assert.match(harness, /FAILED_OR_STALLED_SCENARIOS/, 'stalled scenarios must fail the release gate');
assert.match(harness, /function compactElectronProgress\(\)[\s\S]*heartbeatAt:Date\.now\(\)[\s\S]*recentErrors:result\.errors\.slice\(-12\)/, 'persistent campaigns must write bounded progress heartbeats');
assert.match(harness, /const electronHeartbeatTimer = globalThis\.setInterval[\s\S]*publishElectronDiagnostic\(false\)[\s\S]*3000/, 'persistent clients must heartbeat even while waiting for the opponent');
assert.doesNotMatch(harness, /const snapshot = JSON\.parse\(JSON\.stringify\(result\)\)/, 'persistent heartbeats must not append the entire growing result');
assert.match(supervisor, /pairCount = Math\.max\(1, Math\.min\(2,/, 'campaign supervisor must cap parallel load at two pairs');
assert.match(supervisor, /async function restartPair[\s\S]*heartbeat-stale/, 'campaign supervisor must restart stale pairs');
assert.match(supervisor, /lastProgressSignature[\s\S]*progressStale[\s\S]*'progress-stale'/, 'campaign supervisor must distinguish healthy heartbeats from meaningful campaign progress');
assert.match(supervisor, /Math\.min\(Number\(a\.completedGames[\s\S]*Number\(b\.completedGames/, 'campaign progress must require agreement from both seats');
assert.match(supervisor, /function segmentCommon\(pair\)\{\s*if\(!pair\.segment\) return \{processed:0, completed:0, failed:0\};/, 'finished segments must not be counted twice in aggregate progress');
assert.match(electronMain, /PHASE7_E2E_BACKGROUND_RUN[\s\S]*showInactive\(\)[\s\S]*win\.minimize\(\)/, 'persistent E2E windows must remain rendered without taking desktop focus');
assert.match(onlineRooms, /function phase7GuardOptionPrompt[\s\S]*phase7PromptModalMatches[\s\S]*phase7CurrentUiSession\.pickerKey = ''[\s\S]*phase7SyncInteractionUi/, 'authoritative option prompts must restore their production modal after a late close');
assert.match(onlineRooms, /'hand-limit',[\s\S]*String\(state\.matchId[\s\S]*String\(handLimit\.playerIndex\)[\s\S]*String\(handLimit\.required/, 'hand-limit picker identity must remain stable across unrelated authoritative revisions');
assert.match(harness, /const opponentPanelCount = Math\.min\(opponentHandCount, 12\)[\s\S]*OPPONENT_HAND_PROJECTED_COUNT/, 'opponent hand oracle must distinguish the 12-card visual panel cap from the full projected count');
assert.match(harness, /function renderedUiReachedOracleFrame[\s\S]*pendingPrompt[\s\S]*MODAL_CHOICE[\s\S]*BOARD_DESTINATION[\s\S]*BOARD_TARGET[\s\S]*classList\.contains\('on'\)[\s\S]*board-target-picker[\s\S]*return false/, 'prompt visibility oracle must wait for the bounded production modal and board-picker mount frame');
assert.match(harness, /ORGANIC_VARIANTS\.flatMap[\s\S]*organicCampaignCardIds\.map/, 'the campaign must cover the catalog breadth-first rather than repeat one card ten times');
assert.match(harness, /ORGANIC_FULL_MATCH_EXEMPT_CARD_IDS = new Set\(\['06','60'\]\)[\s\S]*organicCampaignCardIds\.length !== 107/, 'only Jorge and IB Student may skip the 107-card organic campaign');
assert.match(harness, /cardCertificationObligations[\s\S]*FORBIDDEN:[\s\S]*plannedObligationsForScenario[\s\S]*UNOBSERVED_RULE_OBLIGATIONS/, 'every card must expose fail-closed positive and negative rule obligations');
assert.match(harness, /function auditNegativePromptObligations[\s\S]*IMMUNE_TARGET_EXCLUSION[\s\S]*CONTROL_DIRECTION_EXCLUSION[\s\S]*SOURCE_ZONE_EXCLUSION/, 'real prompt commands must prove immunity, ownership, and source-zone exclusions');
assert.match(harness, /function auditUseLimitObligations[\s\S]*REPEATED_ACTIVATION_ACCEPTED_WITHOUT_PRINTED_LIMIT[\s\S]*REACTION_LIMIT_REMOVES_REAL_PROMPT_OPTION[\s\S]*SAME_TURN_REACTIVATION_NOT_LEGAL[\s\S]*EXHAUSTED_CARD_REACTIVATION_NOT_LEGAL/, 'use-limit evidence must come from repeated accepted activations or the real legal-command surface excluding an otherwise viable retry');
assert.match(harness, /AUTHORITATIVE_RESOLUTION_PASSED_RULE_ORACLE[\s\S]*ANICKA_CANONICAL_ROW_GEOMETRY[\s\S]*HOWARD_SINGLE_EXACT_MUTATION[\s\S]*BRITISH_REGIMENT_EXACT_PLUS_THREE/, 'state-evidence obligations must be credited only from exact authoritative outcomes checked by the rule oracle');
assert.match(harness, /TIMED_STATUS_CONTRACTS[\s\S]*function auditTimedStatusObligations[\s\S]*FULL_CANONICAL_STATUS_COUNTDOWN_AND_REMOVAL/, 'duration evidence must observe the complete authoritative countdown and final removal');
assert.match(harness, /function cardMatchesDeckPrerequisite[\s\S]*function emptyPrerequisiteDeckFillers[\s\S]*useEmptyDeckFixture[\s\S]*useEmptyDeckFixture \? 1 : focusedTargetCopies/, 'empty-prerequisite variants must physically remove eligible deck targets rather than merely choose cancel');
assert.match(cardData, /window\.FATE_CARD_DEFINITIONS = CARDS/, 'the ES-module harness needs a read-only catalog bridge to classify deterministic fixture fillers');
assert.match(harness, /resolvedEffectCardIds[\s\S]*resolvedEffectDelta[\s\S]*mechanicallyObservedObligations/, 'a skipped effect must never be credited as an eligible resolved branch');
assert.match(harness, /function auditNoTriggerUiObligations[\s\S]*NO_TARGET_SKIP_LEFT_NO_MODAL_CINEMATIC_OR_MUTATION/, 'no-trigger evidence must inspect the settled shipping UI for absent modal, cinematic, and mutation');
assert.match(harness, /function coinPresentationReachedOracleFrame[\s\S]*phase7CoinPresentationKey[\s\S]*coin-result[\s\S]*Go First[\s\S]*Go Second/, 'coin certification must wait for the current match production result and both winner choices');
assert.match(harness, /five-pair certification layout[\s\S]{0,1000}oracleFrameTimeoutMs = 15000/, 'all shipping frames must retain a bounded 15-second allowance under the five-pair production-presentation load');
assert.match(onlineRooms, /finish\(true\); \}, 30000\)/, 'shipping consolidation must allow production texture preflight and compositor completion before failing open under multi-client load');
assert.match(onlineRooms, /\['BOARD_DESTINATION','BOARD_TARGET'\][\s\S]{0,500}phase7PickerKey[\s\S]{0,200}'prompt:' \+ promptId/, 'board prompts must identify their own mounted production picker to the recovery guard');
assert.match(onlineRooms, /BOARD_DESTINATION[\s\S]{0,1800}phase7GuardOptionPrompt\(promptKey, prompt\)[\s\S]{0,300}BOARD_TARGET[\s\S]{0,1800}phase7GuardOptionPrompt\(promptKey, prompt\)/, 'board destination and board target prompts must remount their shipping picker after a late modal close');
assert.match(onlineRooms, /phase7EnsureCoinPresentation[\s\S]*phase7CoinPresentationKey = key[\s\S]*coinResult\.textContent = ''[\s\S]*coinWinnerText\.textContent = ''[\s\S]*coinButtons\.style\.display = 'none'/, 'a consecutive match must clear the prior match coin frame before its animation begins');
assert.match(harness, /function auditPileSelectionObligations[\s\S]*REAL_PICKER_EXCLUDES_SEEDED_INELIGIBLE_PILE_CARDS[\s\S]*REAL_PICKER_ENFORCES_CARDINALITY_WITH_EXTRA_ELIGIBLE_CHOICES/, 'search/pile exclusions and cardinality must be proven from the real picker with seeded eligible and ineligible cards present');
assert.match(harness, /function commandSelectedIids[\s\S]*filter\(value=>value !== undefined && value !== null && String\(value\) !== ''\)\.map\(String\)/, 'missing prompt payload fields must not become a fake "undefined" selected card');
assert.match(harness, /organicTargetSetupPending[\s\S]*Search across action types before applying generic action-type priority[\s\S]*directTarget/, 'a legal focused placement/consolidation must outrank unrelated action types');
assert.match(harness, /function clickHandCardWhenReady[\s\S]*hasClickableHandCard[\s\S]*consolidation:click-hand[\s\S]*clickHandCardWhenReady/, 'dense-hand focused cards must be driven through a visible production hand hit');
assert.match(harness, /focusedEvidenceFailures[\s\S]*Focused scenario reached the end screen without exercising its required target\/partner evidence[\s\S]*failedScenarioIndexes[\s\S]*writeCheckpoint\(currentOrganicGameIndex\(\)\)/, 'missing target or partner evidence must be recorded while the unattended paired campaign advances to the next scenario');
assert.match(harness, /ABANDON_BARRIER_PREFIX[\s\S]*writeAbandonBarrier[\s\S]*waitForPeerAbandonBarrier[\s\S]*Peer seat abandoned the same stalled production-UI scenario/, 'paired clients must abandon and checkpoint a stalled fixture together before either queues the next match');
assert.match(harness, /noPartnerEvidenceExpected = Object\.keys\(partnerEvidence\)\.length === 0[\s\S]*matchStart\.organicVariant === 'EMPTY_OR_INELIGIBLE_PREREQUISITE'[\s\S]*requestedFocusedScenario[\s\S]*const allPartnersObserved = noPartnerEvidenceExpected/, 'intentional empty-prerequisite and explicit combined focused scenarios may certify without inventing a duplicate self-partner');
assert.match(harness, /observedActionCardIds[\s\S]*\['CARD_SET','CARD_CONSOLIDATED'\][\s\S]*organicObservedActionStart[\s\S]*targetActionObserved = commandDelta > 0 \|\| observedActionDelta > 0[\s\S]*exchangeFocusedEvidence[\s\S]*sharedTargetActionObserved[\s\S]*&& sharedTargetActionObserved/, 'both seats must merge authoritative public placement evidence before certifying a focused card');
assert.match(harness, /renderedStatusCounts[\s\S]*expectedRenderedEffects\(view\)[\s\S]*renderedStatusCounts\.get\(key\)[\s\S]*return false/, 'the projection oracle frame must wait for authoritative status pills before applying its bounded missing-banner failure');
assert.match(harness, /function effectGroupKey[\s\S]*effect-pill-flex-tail[\s\S]*semanticGroupClass\.toLowerCase/, 'responsive flex-tail layout classes must not change a status banner semantic identity');
assert.match(harness, /PROMPT_CANCELLED[\s\S]*CANCEL_WITHOUT_DEFAULT_MUTATION[\s\S]*EFFECT_SKIPPED[\s\S]*INELIGIBLE_EFFECT_SKIPPED_CLEANLY[\s\S]*REACTION_BLOCKED_WITHOUT_MUTATION/, 'cancel, empty/no-trigger, and reaction cleanup obligations must require explicit authoritative event evidence');
assert.match(harness, /const reactingCardId = reacted[\s\S]*queuedOrganicPartners\.includes\(reactingCardId\)[\s\S]*REACTION_BLOCKED_WITHOUT_MUTATION/, 'generic status blocking must not masquerade as the deliberately queued Improvisor reaction probe');
assert.match(harness, /reinforcementPolicyForScenario[\s\S]*zeroReinforcementCost[\s\S]*REAL_REINFORCEMENT_BASELINE/, 'test-only zero cost must be auditable and retain a real-rules baseline');
assert.match(harness, /const observedFromAuthoritativeStart = startRevision <= 1;[\s\S]{0,500}if\(observedFromAuthoritativeStart && canonicalReinforcementPolicy !== queuedReinforcementPolicy\.key\)/, 'a late-joining observer must not fail an in-flight fixture using stale local scenario policy metadata');
assert.match(harness, /A Supporter-related effect is not automatically a reinforcement test[\s\S]*REINFORCEMENT\|TRIBUTE\|CONSOLIDATION_COST/, 'ordinary Supporter effects must retain the accelerated zero-cost fixture');
assert.match(harness, /function zeroCostOpeningScaffoldIds[\s\S]*openingScaffoldIds[\s\S]*testOpeningCardIds/, 'zero-cost Character scenarios must stage one real Supporter so production consolidation UI remains exercisable');
assert.match(harness, /Only[\s\S]*Havano is a hand reaction[\s\S]*id !== '79'/, 'Lydia and Secules must be staged on field while only Havano is held for a hand reaction');
assert.match(harness, /fieldReactionPartnersPending[\s\S]*directFieldReactionPartner[\s\S]*reactionScaffold/, 'field Improvisors must be consolidated before the focused source opens its reaction window');
assert.match(harness, /organicPartnerOption[\s\S]{0,800}queuedOrganicPartners\.includes\(cardId\)[\s\S]{0,300}!organicPartnerCommandsThisMatch\.has\(cardId\)/, 'already-observed partner copies must not outrank a still-unobserved required interaction partner');
assert.match(harness, /queuedOpeningScaffoldIds[\s\S]*contestedScaffold[\s\S]*destination\?\.r\) === 1/, 'focused automatic target effects must build their real contested-row prerequisite before placement');
assert.doesNotMatch(harness, /return \/SUPPORTER\|REINFORCEMENT/, 'bare Supporter targeting must not force every focused match back to production consolidation costs');
assert.match(onlineRooms, /FATE_CHANGED[\s\S]*phase7ShowExactEffectOverlay\(view, event, target, eventIndex, resultFeedbackFrameAt\)[\s\S]*fate-motion:start/, 'the production overlay must be installed before its paired authoritative Fate motion');
assert.match(onlineRooms, /if\(!fateMotionShown && window\.FateMatchRendererAdapter[\s\S]{0,900}presentFateDelta[\s\S]{0,900}fromValue:fateBefore[\s\S]{0,900}toValue:fateAfter/, 'a busy VFX recipe must fall back to the production Fate-number adapter instead of dropping visible Fate feedback');
assert.match(onlineRooms, /function phase7ShowExactEffectOverlay[\s\S]{0,3800}eventId:String\(event\?\.eventId \?\? event\?\.id \?\? eventIndex \?\? ''\)/, 'multi-event batches must preserve zero-valued event indexes when correlating Fate motion and overlays');
assert.match(harness, /resultFeedbackStarts[\s\S]*deltaMs > 34[\s\S]*same frame window[\s\S]*matching visible Fate number animation/, 'presentation certification must compare visible Fate-number and overlay start times and reject missing pairs');
assert.match(rendering, /JSON\.stringify\(G\._phase7Statuses \|\| \[\]\)/, 'canonical Phase 7 status changes must invalidate the production top-bar banner render signature');
assert.match(rendering, /CONSOLIDATION_COST_MODIFIER[\s\S]{0,700}effect-pill-administrative-bloat/, 'Visegrad must render directly from the canonical two-charge authority status');
assert.match(harness, /CONSOLIDATION_COST_MODIFIER:Object\.freeze\(\{cardId:'97', groupClass:'effect-pill-administrative-bloat'/, 'the shipping DOM oracle must fail when Visegrad authority exists without its banner');
assert.match(harness, /Authoritative Fate change produced more than one visible Fate animation/, 'the presentation oracle must reject duplicate Fate animations for one authoritative event');
assert.match(harness, /set-from-deck:open-deck-window[\s\S]{0,700}data-phase7-deck-set-card-id/, 'set-from-deck coverage must click the card-specific button in the real deck window');
assert.match(rendering, /data-phase7-deck-set-card-id="28"[\s\S]{0,500}data-phase7-deck-set-card-id="07"/, 'the real deck window must expose distinct Polish-Lithuanian and Maja authority actions');
assert.match(harness, /'status-presentations':[\s\S]{0,900}groups:Object\.freeze[\s\S]{0,900}\['51','87','99','86','07'\]/, 'the combined status run must partition sources into bounded real matches instead of relying on impossible all-card draws');
assert.match(harness, /Four accepted non-End-Turn actions[\s\S]{0,500}successfulTurnActionCounts\.get\(successfulTurnActionKey\(view\)\)[\s\S]{0,260}boundedEndTurn/, 'post-coverage organic play must end bounded turns instead of cycling every distinct movement');
assert.match(rendering, /const chaparralCard[\s\S]{0,1200}phase7Statuses\.some[\s\S]{0,300}FACE_DOWN_CONSOLIDATION_PERMISSION[\s\S]{0,500}allEffects\.push/, 'canonical Chaparral permission must suppress its compatibility banner copy in authoritative multiplayer');
assert.match(styles, /board-target-zone\.has-extra-rows[\s\S]{0,220}overflow-y:auto!important/, 'only expanded picker geometry may enable vertical zone scrolling');
assert.match(rendering, /pickerCanvas\.dataset\.selectedIids = JSON\.stringify\(selected/, 'the production card picker must expose the canonical selection actually made on its canvas');
assert.match(harness, /CARD_PICKER_CANONICAL_ELIGIBILITY[\s\S]{0,500}picker omitted eligible authority IIDs/, 'the shipping DOM oracle must fail when a card picker omits an authority-eligible card');
assert.match(harness, /canvas\.dataset\.selectedIids[\s\S]{0,250}includes\(iid\)/, 'the full-UI driver must prove the requested canonical card was selected before confirming');
assert.match(harness, /selectBoardPickerDestinations[\s\S]{0,800}classList\.contains\('is-selected'\)/, 'the full-UI driver must prove Mark and other destination squares visibly select before confirming');
assert.match(onlineRooms, /phase7FindRawProjectedCard[\s\S]{0,900}_snowballFightHitAt/, 'Wodny Potok must carry its transient overlay marker into the incoming authoritative card');
assert.match(onlineRooms, /projectedTarget\._effectFlash = cloneOnlinePlain\(liveTarget\._effectFlash\)/, 'mapped card overlays must survive the authoritative snapshot commit');
assert.match(onlineRooms, /projectedTarget\._suppressNextFatePulse = true/, 'explicit Fate feedback must suppress the post-commit generic pulse even for newly materialized cards');
assert.match(harness, /A draw animation started before the preceding draw animation finished[\s\S]{0,3000}Result presentation began before every sequential draw animation finished/, 'Kazumi and other multi-draw effects must fail certification unless every draw is sequential and completes before results');
assert.match(onlineRooms, /function phase7ConsolidationPresentationView[\s\S]{0,2400}projected\.currentFate = before/, 'consolidation presentation must mask Great Oak Fate until its visible result feedback begins');
assert.match(onlineRooms, /projected\._phase7DeferredCanonicalFate = Math\.max\(0, Number\(fateEvents\.at\(-1\)\?\.after\)/, 'consolidation presentation must retain Great Oak final Fate as deferred authority data');
assert.match(onlineRooms, /await phase7PresentBatch\(view, events\)[\s\S]{0,320}Reveal the final authoritative number only after its synchronized/, 'the final consolidated Fate value must commit only after result presentation');
assert.match(harness, /VIGILANTES_OVERLAY_PRESENT[\s\S]{0,350}rendered Marked for Death overlay flag/, 'Vigilantes certification must inspect the rendered marked-card overlay');
assert.match(harness, /renderedUiReachedOracleFrame[\s\S]{0,2600}VIGILANTES_MARK:[\s\S]{0,700}markedForDeath/, 'the shipping oracle must wait for the marked-card canvas frame before auditing it');
assert.match(harness, /['"]93['"]\s*:\s*['"]snowball['"]/, 'Wodny Potok certification must require its exact snowball overlay');
assert.match(harness, /fateNumberDomEvents:\[\]/, 'shipping certification must retain the rendered Fate-number DOM evidence');
assert.match(harness, /One authoritative Fate change rendered more than one DOM Fate number/, 'shipping certification must reject authoritative/generic Fate-number duplicates');
assert.match(renderer, /recent\.authoritative === true[\s\S]{0,260}!authorityEventKey[\s\S]{0,260}Number\(recent\.delta\) === delta/, 'the renderer must suppress a generic Fate number following its authoritative counterpart');
assert.doesNotMatch(rendering, /_topbarEffectsLastHtml === nextHtml[\s\S]{0,300}return;/, 'status rendering must not skip exact resynchronization merely because its state signature is unchanged');
assert.match(rendering, /syncEffectPills\(leftBar, myEffects, 'left'\)[\s\S]{0,220}syncEffectPills\(rightBar, oppEffects, 'right'\)/, 'every status render must exactly resynchronize both production banner sides');
assert.match(onlineRooms, /scheduleOnlineLocalHandLimitPrompt[\s\S]{0,500}updateTopBar[\s\S]{0,500}renderTopbarEffects/, 'a committed authoritative status must render its production top-bar pill in the same canonical frame');
assert.match(onlineRooms, /const blameGameEffects = \[0, 1\]\.map[\s\S]{0,700}SUPPORTERS_AS_CHARACTERS/, 'authoritative Blame Game must derive the existing single-player Supporter-as-Character rule state');
assert.match(onlineRooms, /_blameGameEffects:blameGameEffects/, 'authoritative Blame Game must project into the existing single-player rule helpers');
assert.match(onlineRooms, /const pos = phase7FindBoardCard\(target\.iid\) \|\| phase7FindProjectedEntry\(view, target\.iid\)[\s\S]{0,1000}synchronizeResultFeedback:true/, 'same-batch Fate changes must animate at the authoritative projected destination before the view commit');
assert.match(onlineRooms, /const fateBefore = Math\.max\(0, Number\(event\.before\)[\s\S]{0,420}if\(fateBefore === fateAfter\) return;/, 'zero-delta authoritative Fate events must exit before visible feedback');
assert.match(onlineRooms, /card\.counters\?\.permanentFateCeiling[\s\S]{0,700}next\._permanentFateCeiling[\s\S]{0,500}next\._permanentFateDebuffed = true/, 'authoritative permanent Fate ceilings must project into the unchanged single-player effective-Fate contract');
{
  const fateBlockStart = onlineRooms.indexOf('if(fateBefore === fateAfter) return;');
  const fateBlockEnd = onlineRooms.indexOf("if(type === 'CARD_MOVED'", fateBlockStart);
  const fateBlock = onlineRooms.slice(fateBlockStart, fateBlockEnd);
  assert.ok(fateBlockStart >= 0 && fateBlockEnd > fateBlockStart, 'the authoritative Fate presentation block must remain discoverable');
  assert.ok(fateBlock.indexOf('phase7ShowExactEffectOverlay') >= 0, 'nonzero Fate changes must install the paired production overlay');
  assert.ok(fateBlock.indexOf('playFateChangeSound') > fateBlock.indexOf('phase7ShowExactEffectOverlay'), 'the paired overlay must be installed before its fallback result sound');
}
assert.match(onlineRooms, /'93':\{kind:'snowball', label:'Snowball Fight'\}/, 'Wodny Potok Youth must map to its production Snowball Fight overlay');
assert.match(onlineRooms, /descriptor\.kind === 'snowball'[\s\S]{0,500}markSnowballFightHit/, 'authoritative Snowball Fight feedback must reuse the single-player status-overlay marker');
assert.match(harness, /['"]93['"]\s*:\s*['"]snowball['"]/, 'the full-UI harness must require Wodny Potok Youth card-specific overlay parity');
assert.match(harness, /organicPartnerObservedActionStart[\s\S]*observedActionCardIds\[partnerId\]/, 'both observer seats must accept authoritative partner placement evidence');
assert.doesNotMatch(harness, /focusedEvidenceFailures\.length\)\{[\s\S]{0,180}stopped\s*=\s*true/, 'a focused evidence failure must not stop an unattended campaign');
assert.match(harness, /else if\(focusedEvidenceFailures\.length\)\{[\s\S]{0,360}failedScenarioIndexes[\s\S]{0,520}writeCheckpoint\(currentOrganicGameIndex\(\)\)/, 'failed scenarios must be recorded while the paired campaign advances');
assert.doesNotMatch(harness, /if\(!driven\)\{[\s\S]{0,220}attemptedTurnCommandKeys\.add/, 'a missed UI gesture must not blacklist the still-legal command from retry');
assert.match(onlineRooms, /function phase7SuppressWineCountryHandFateDelta[\s\S]{0,1000}String\(pos\?\.zone \|\| ''\)\.toLowerCase\(\) === 'hand'[\s\S]{0,1000}_suppressNextFatePulse = true/, 'authoritative Fate changes must suppress floating Fate-number presentation for every card still in hand');
assert.match(cardMotion, /fateChangeAtLocation,/, 'the off-board Fate motion must be exported through the production motion facade');
assert.match(onlineRooms, /fateChangeAtLocation\(target, pos, fateBefore, fateAfter, fateOptions\)/, 'Phase 7 must route non-board Fate changes through the off-board production motion path');
assert.match(onlineRooms, /const resultFeedbackFrameAt = Date\.now\(\)[\s\S]{0,1200}phase7ShowExactEffectOverlay\(view, event, target, eventIndex, resultFeedbackFrameAt\)[\s\S]{0,5000}fate-motion:start[\s\S]{0,500}resultFeedbackFrameAt/, 'the exact overlay and Fate number motion must share a paint-frame timestamp, with the overlay installed first');
assert.match(onlineRooms, /whisperLandscapeToken === true[\s\S]{0,1400}_whisperCopiedEffectId = whisperCopiedId[\s\S]{0,900}_whisperCopiedSourceName/, 'authoritative Concrete Roads tokens must project the copied identity used by production field-wide scoring and card details');
assert.match(rendering, /RIVERA_AFFILIATION_BONUS[\s\S]{0,700}effect-pill-rivera'[\s\S]{0,120}aff-[\s\S]{0,120}affClass/, 'authoritative Rivera banners must retain the production affiliation class');
assert.match(onlineRooms, /if\(isNewFrame\)[\s\S]{0,500}coinButtons\.querySelectorAll\('button'\)[\s\S]{0,180}button\.disabled = false/, 'each consecutive authoritative match must re-enable the reused production coin-choice buttons');
assert.match(harness, /Go First' && !button\.disabled[\s\S]{0,300}Go Second' && !button\.disabled/, 'the shipping coin oracle must require both choices to be visible and enabled');
assert.match(harness, /function captureTargetAvailability[\s\S]*locations[\s\S]*renderedHand[\s\S]*legalCommands[\s\S]*lastTargetAvailabilityDiagnostic/, 'focused failures must expose the target card across authoritative piles, rendered hand hits, and legal commands');
assert.match(gameplayCore, /function getAlexanderSupporterFateTotal[\s\S]{0,900}supporterController !== controller[\s\S]{0,300}isCardSupporterForRules\(supporter, controller\)/, 'Alexander UI Fate must count current controller rather than printed owner after control-changing effects');
assert.match(onlineRooms, /runtimePassiveId === '41'[\s\S]{0,700}_phase7JimmyReductionEffectUses[\s\S]{0,300}projectedState\.fateReductionEffectUses/, 'Jimmy must carry its authoritative reduction count on the same projected card revision');
assert.match(gameplayCore, /projectedJimmyUses[\s\S]{0,420}G\?\._phase7CurrentMultiplayer === true[\s\S]{0,420}reductionUses \* 3/, 'Phase 7 Jimmy Fate must prefer the count carried by its canonical card snapshot');
assert.match(onlineRooms, /runtimePassiveId === '88'[\s\S]{0,2200}_phase7RozsiYouthCharacterCount = projectedCharacterCount/, 'Rozsi Youth must carry its canonical effective-Character count on the projected card revision');
assert.match(gameplayCore, /projectedCharacterCount = Number\(card\._phase7RozsiYouthCharacterCount\)[\s\S]{0,650}bonus \+= charCount \* 2/, 'Phase 7 Rozsi Youth Fate must prefer the canonical snapshot Character count');
assert.match(gameplayCore, /function isSupporterEffectSuppressed\(card\)[\s\S]{0,500}card\.statuses[\s\S]{0,300}EFFECTS_SUPPRESSED/, 'shipping Fate and action projection must honor canonical authoritative suppression statuses');
assert.match(rendering, /SUPPORTERS_AS_CHARACTERS[\s\S]{0,600}allEffects\[allEffects\.length - 1\]\.owner = affected/, 'Blame Game canonical status must share the affected player owner with its compatibility mirror so one banner is rendered');
assert.match(rendering, /G\._phase7CurrentMultiplayer === true[\s\S]{0,500}SUPPORTERS_AS_CHARACTERS[\s\S]{0,300}return;/, 'authoritative Blame Game compatibility state must not render as an additional status instance');
assert.match(harness, /'SUPPORTERS_AS_CHARACTERS'[\s\S]{0,180}'SELVA_EXTRA_SUPPORTER'[\s\S]{0,180}'MAJA_EXTRA_SUPPORTERS'[\s\S]{0,300}\.includes\(type\)[\s\S]{0,180}\? affected/, 'the rendered-status oracle must expect controller-benefit statuses, including Blame Game, Selva, and Maja, on their affected controller side');
assert.match(onlineRooms, /const selvaSupportBoosts = \[0, 1\]\.map/, 'authoritative Selva grants must derive the existing single-player banner state');
assert.match(onlineRooms, /_selvaSupportBoosts:selvaSupportBoosts/, 'authoritative Selva grants must feed the existing single-player banner state');
assert.match(onlineRooms, /const majaExtraSupporterStatus =/, 'the authoritative Maja status adapter must be declared');
assert.match(onlineRooms, /_majaSupportBoost:majaSupportBoost/, 'authoritative Maja grants must feed the existing single-player banner state');
assert.match(onlineRooms, /offeredCards\.map\(phase7PresentationCard\)/, 'deck-set visual pickers must restore production card artwork');
assert.match(onlineRooms, /commands\.map\(function\(command\)\{ return phase7DeckSetCommandCardId\(command, offeredCards\)/, 'deck-set buttons must derive their card identity from the command or its authoritative private card');
assert.match(onlineRooms, /construct only the presentation shell from the public card[\s\S]{0,900}cards\.push\(phase7PresentationCard/, 'deck-set picker artwork must have a catalog fallback when the private card list is delayed');
assert.match(onlineRooms, /type === 'CARD_TRANSFERRED'[\s\S]{0,220}String\(event\.from[\s\S]{0,160}'deck'[\s\S]{0,160}String\(event\.to[\s\S]{0,160}'hand'/, 'Maja deck transfers must join the sequential draw-presentation queue');
assert.match(onlineRooms, /drawFromPile\(0, owner/, 'sequential multi-draw presentation must use the shared production hand anchor');
assert.match(onlineRooms, /pickerNode = document\.querySelector\('#modal \.board-target-picker'\)[\s\S]{0,500}getClientRects\(\)\.length > 0[\s\S]{0,900}pickerKey = ''/, 'a hidden or replaced production board picker must reopen for the unchanged authoritative prompt');
assert.match(onlineRooms, /pickerOwnsKey = String\(pickerNode\?\.dataset\?\.phase7PickerKey[\s\S]{0,300}pickerOwnsKey\) return/, 'a live board picker must be tied to the exact authoritative prompt key');
assert.match(onlineRooms, /selected combination has left the board picker[\s\S]{0,300}pickerKey = ''/, 'a submitted board picker must clear its guard so an unchanged prompt can recover after a no-op');
assert.match(onlineRooms, /queued card-detail shell[\s\S]{0,1200}closeModal\(\{forceHandLimitClose:true, deferQueuedModals:true\}\)/, 'placement destination selection must close a synchronously queued incidental card-detail shell');
assert.match(onlineRooms, /Consecutive authoritative result batches[\s\S]{0,900}waitForIdle\(\{minQuietMs:34, timeoutMs:9000\}\)/, 'consecutive consolidation motions must wait for the production action presenter to become idle');
assert.match(onlineRooms, /beginWhenIdle\(startPresentation\)/, 'consolidation presentation must enter through the idle gate');
assert.match(rendering, /c\.id === '56'[\s\S]{0,500}c\.controller \?\? c\.owner[\s\S]{0,700}c\.id === '67'[\s\S]{0,500}c\.controller \?\? c\.owner/, 'Lydia and Secules status banners must follow current controller after control-changing effects');
assert.match(gameplayCore, /if\(current && G\?\._phase7CurrentMultiplayer !== true\) return current;[\s\S]{0,500}getStablePassiveTargetRank[\s\S]{0,300}localeCompare/, 'Phase 7 Cook Islands Duelist targeting must rederive the authoritative stable target instead of keeping stale single-player randomness');

for(const invariant of [
  'COIN_SCREEN_ACTIVE',
  'COIN_RESULT_VISIBLE',
  'COIN_CHOICES_VISIBLE',
  'ENDGAME_SCREEN_ACTIVE',
  'ENDGAME_TITLE_VISIBLE',
  'ENDGAME_ZONE_REPORT',
  'TURN_HUD_NUMBER',
  'TURN_HUD_OWNER',
  'LOCAL_HAND_RENDER_COUNT',
  'OPPONENT_HAND_RENDER_COUNT',
  'OPPONENT_HAND_PROJECTED_COUNT',
  'OPPONENT_HAND_HIDDEN',
  'ADAPTIVE_TOKEN_ART',
  'VISIBLE_IMAGE_ASSETS',
  'STATUS_ICON_PRESENT',
  'STATUS_MULTIPLICITY_LABEL',
  'STATUS_BANNER_UNIQUE',
  'STATUS_BANNER_PRESENT',
  'STATUS_BANNER_COUNT',
  'LOCAL_PROMPT_VISIBLE',
  'OPPONENT_REACTION_WAIT_VISIBLE'
]){
  assert.ok(harness.includes(`'${invariant}'`), `shipping DOM oracle must enforce ${invariant}`);
}

assert.match(harness, /async function abandonStalledMatch[\s\S]{0,2600}result\.failedGames \+= 1[\s\S]{0,2600}queueNextMatch/, 'stall watchdog must record the failure and continue with the next scenario');
assert.match(harness, /installShippingErrorObservers[\s\S]{0,1800}unhandledrejection[\s\S]{0,1800}console\.error/, 'browser exceptions, rejected promises, and console errors must be captured');

for(const field of [
  'effectOwner',
  'effectCardName',
  'effectAbility',
  'effectSourceIid',
  'effectStatusKey',
  'effectCount',
  'effectGroupClass'
]){
  assert.ok(rendering.includes(`pill.dataset.${field}`), `production status pills must expose ${field} to the semantic UI oracle`);
}

console.log('authoritative-v3 Phase 7 shipping UI harness smoke test passed');
