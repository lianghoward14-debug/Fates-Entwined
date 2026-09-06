import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {
  createInitialState,
  legalCommandTemplates,
  projectStateForPlayer,
  reduceCommand
} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';
import {privateActionCardsForLegalCommands} from './room-actor.mjs';

const require = createRequire(import.meta.url);
const {getCardCatalog} = require('../fate-card-catalog.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const online = fs.readFileSync(path.join(ROOT, 'src/scripts/18-online-rooms.js'), 'utf8');
const data = fs.readFileSync(path.join(ROOT, 'src/scripts/01-data-and-state.js'), 'utf8');
const harness = fs.readFileSync(path.join(ROOT, 'src/scripts/authoritative-v3-phase7-full-ui-e2e.mjs'), 'utf8');
const renderer = fs.readFileSync(path.join(ROOT, 'src/scripts/render-v2/04-match-renderer-adapter.js'), 'utf8');
const rendering = fs.readFileSync(path.join(ROOT, 'src/scripts/06-rendering-and-helpers.js'), 'utf8');
const economy = fs.readFileSync(path.join(ROOT, 'src/scripts/20-online-economy.js'), 'utf8');
const gameplay = fs.readFileSync(path.join(ROOT, 'src/scripts/05-gameplay-core.js'), 'utf8');
const betaClient = fs.readFileSync(path.join(ROOT, 'src/scripts/authoritative-v3-phase7-beta-client.mjs'), 'utf8');
const engineState = fs.readFileSync(path.join(ROOT, 'shared/engine/state.mjs'), 'utf8');
const engineOperations = fs.readFileSync(path.join(ROOT, 'shared/engine/operations.mjs'), 'utf8');
const styles = fs.readFileSync(path.join(ROOT, 'src/styles/zz-codex-last.css'), 'utf8');
const definitions = getCardCatalog().cards
  .filter(card=>card.retired !== true && card.temporarilyDisabled !== true)
  .map(card=>({...card}));

function initial(matchId, p0, p1, handSize = 99){
  return createInitialState({
    matchId,
    seed:`${matchId}-seed`,
    handSize,
    activePlayer:0,
    cardDefinitions:definitions,
    players:[{id:'p0', deckIds:p0}, {id:'p1', deckIds:p1}]
  });
}

function take(state, playerIndex, id){
  for(const pile of ['hand', 'deck', 'discard']){
    const index = state.players[playerIndex][pile].findIndex(card=>String(card.id) === String(id));
    if(index >= 0) return state.players[playerIndex][pile].splice(index, 1)[0];
  }
  throw new Error(`missing card ${id}`);
}

function put(state, playerIndex, id, destination){
  const card = take(state, playerIndex, id);
  card.controller = playerIndex;
  state.board[destination.z][destination.r][destination.c] = card;
  return card;
}

function submit(state, playerId, sequence, type, payload){
  return reduceCommand(state, command(state, playerId, sequence, type, payload), {playerId});
}

// Manual discard is visible only for controlled cards on the acting player's
// main phase, rejects the opponent's card, and retains ALPINE's exception.
{
  let state = initial('P7MANUALDISCARD', ['32', '76'], ['32']);
  const own = put(state, 0, '32', {z:0, r:2, c:0});
  const alpine = put(state, 0, '76', {z:1, r:2, c:0});
  const enemy = put(state, 1, '32', {z:0, r:0, c:0});
  const legal = legalCommandTemplates(state, 0);
  const discard = legal.find(item=>item.type === 'DISCARD_CARD' && item.payload.targetIid === own.iid);
  assert(discard, 'the controlled Temecula Resident must expose Discard');
  assert.equal(legal.some(item=>item.type === 'DISCARD_CARD' && item.payload.targetIid === alpine.iid), false);
  assert.equal(legal.some(item=>item.type === 'DISCARD_CARD' && item.payload.targetIid === enemy.iid), false);
  const result = submit(state, 'p0', 1, discard.type, discard.payload);
  assert.equal(result.ok, true, result.rejection?.reason);
  assert(result.state.players[0].discard.some(card=>card.iid === own.iid));
  assert(result.events.some(event=>event.type === 'CARD_DISCARDED' && event.cardIid === own.iid));
  assert.equal(legalCommandTemplates(result.state, 1).some(item=>item.type === 'DISCARD_CARD'), false);
}

// Both special deck-set cards must be disclosed to their owner, appear as
// legal deck choices, and execute from the deck through authority.
for(const [cardId, label] of [['07', 'Maja Kaminska'], ['28', '2nd Polish-Lithuanian Army']]){
  let state = initial(`P7DECKSET${cardId}`, [cardId, '32', '32'], ['32'], 0);
  const legal = legalCommandTemplates(state, 0);
  const card = state.players[0].deck.find(item=>item.id === cardId);
  const choices = legal.filter(item=>item.type === 'SET_CARD_FROM_DECK' && item.payload.cardIid === card.iid);
  assert(choices.length, `${label} must appear as a Set From Deck choice`);
  assert(choices.every(item=>item.cardId === cardId), `${label} legal commands must identify the visible deck action without depending on a second payload`);
  const privateCards = privateActionCardsForLegalCommands(state, 0, legal);
  assert(privateCards.some(item=>item.iid === card.iid), `${label} must reach the private visual picker`);
  assert.equal(JSON.stringify(projectStateForPlayer(state, 1)).includes(card.iid), false, `${label} must stay private from the opponent`);
  const result = submit(state, 'p0', 1, choices[0].type, choices[0].payload);
  assert.equal(result.ok, true, `${label}: ${result.rejection?.reason || ''}`);
  assert(result.state.board.flat(2).some(item=>item?.iid === card.iid), `${label} must be set onto the board`);
}

// Vigilantes must create the real durable mark and the multiplayer projection
// bridge must turn that exact status into the existing marked-card overlay.
{
  let state = initial('P7VIGILANTESOVERLAY', ['52', '32'], ['32', '32']);
  const target = put(state, 1, '32', {z:0, r:0, c:0});
  const vigilantes = state.players[0].hand.find(card=>card.id === '52');
  const set = legalCommandTemplates(state, 0).find(item=>
    item.type === 'SET_CARD'
      && item.payload.cardIid === vigilantes.iid
      && item.payload.destination.z === 0
  );
  assert(set);
  let result = submit(state, 'p0', 1, set.type, set.payload);
  assert.equal(result.ok, true);
  assert.equal(result.state.pendingPrompt?.type, 'BOARD_TARGET');
  state = result.state;
  result = submit(state, 'p0', 2, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIid:target.iid
  });
  assert.equal(result.ok, true, result.rejection?.reason);
  const marked = result.state.board[0][0][0];
  assert(marked.statuses.some(status=>status.startsWith(`VIGILANTES_MARK:${vigilantes.iid}:0`)));
  assert(result.events.some(event=>event.type === 'CARD_MARKED' && event.cardIid === target.iid));
  assert.match(online, /VIGILANTES_MARK:[\s\S]{0,200}next\._markedForDeath = true/);
}

// A submitted prompt remains intentionally closed during the network round
// trip. The recovery watchdog may remount only after a rejection clears it.
assert.match(online, /const submittedPromptId = String\(command\?\.type[\s\S]{0,1800}phase7DispatchCommandAttempt/);
assert.match(online, /phase7CurrentUiSession\.submittingPromptId === promptId[\s\S]{0,180}setTimeout\(check, 80\)/);
assert.match(online, /phase7CurrentUiSession\.submittingPromptId === String\(prompt\.promptId \|\| ''\)[\s\S]{0,220}Resolving your selection/);

// Isaac's optional two-card window must preserve zero as a legal choice in
// single player and accept server-eligible card batches in multiplayer even if
// a refreshed legal-command catalogue does not contain that exact batch.
assert.match(rendering, /function pickMultipleInZone\([^)]*minCount=1\)[\s\S]{0,420}sourceCard, minCount\)/);
assert.match(gameplay, /case '22':[\s\S]{0,1500}pickMultipleInZone\([^;]+card,0\)/);
assert.match(online, /const eligibleIids = new Set\([^;]+eligibleIids[\s\S]{0,700}selected\.every\(function\(iid\)\{ return eligibleIids\.has/);
assert.match(online, /opts\.squareTargets[\s\S]{0,260}selectedIids:selected\.slice\(\)/);

// The production full-UI driver knows both the visual picker and the card-
// specific Wodny overlay; neither is accepted as a server-only rule result.
assert.match(harness, /['"]93['"]\s*:\s*['"]snowball['"]/);
assert.match(harness, /canvas\.dataset\.pickerCardIids[\s\S]{0,500}renderedPickerIids\.map\(iid=>\(\{iid\}\)\)/);
assert.match(harness, /renderedCard\._markedForDeath === true[\s\S]{0,220}visual\?\._markedForDeath === true/);
assert.match(online, /'93':\{kind:'snowball', label:'Snowball Fight'\}/);
assert.match(online, /descriptor\.kind === 'snowball'[\s\S]{0,450}markSnowballFightHit/);
assert.match(online, /phase7Action:'discard'/);

// Card-specific deck buttons must keep working when the transport supplies the
// authoritative iid and private card identity without duplicating cardId on
// every legal command. This is the payload shape that previously made the
// visible Maja/Polish buttons report that no eligible card was available.
assert.match(online, /function phase7DeckSetCommandCardId\(command, offeredCards\)[\s\S]{0,420}String\(privateCard\?\.id \|\| ''\)/);
assert.match(online, /commands = commands\.filter\(function\(command\)\{[\s\S]{0,180}phase7DeckSetCommandCardId\(command, offeredCards\) === requestedId/);

// Stop Consolidation is the shipping button path, not merely an internal
// cleanup helper. It must remain visible in consolidation mode and dispatch to
// the Phase 7 cleanup before falling back to the single-player implementation.
assert.match(online, /function phase7ClearConsolidation\(options\)[\s\S]{0,700}cancel\.style\.display = 'none'/);
assert.match(online, /phase7CurrentUiSession\.consolidation = con;[\s\S]{0,420}cancel\.style\.display = ''/);
assert.match(online, /cancel\.onclick = function\(event\)[\s\S]{0,220}phase7ClearConsolidation\(\{force:true\}\)/, 'the visible Stop Consolidation control must own a direct production click handler');
assert.match(online, /window\.cancelConsolidation = function\(\)\{[\s\S]{0,420}phase7ClearConsolidation\(/);
assert.match(online, /closest\('#cancel-consolidate-btn'\)[\s\S]{0,180}stopImmediatePropagation\(\)[\s\S]{0,160}phase7ClearConsolidation\(/, 'the visible Stop Consolidation button must dispatch directly to Phase 7 regardless of script load order');
{
  const input = fs.readFileSync(path.join(ROOT, 'src/scripts/render-v2/06-match-scene-input.js'), 'utf8');
  assert.ok(input.includes("viewportHit?.kind !== 'ui-command'"), 'authoritative board capture must distinguish command-dock clicks');
  assert.ok(input.includes("this.viewportPointerDownHit?.kind !== 'ui-command'"), 'authoritative pointer-up capture must preserve command-dock clicks');
}
assert.doesNotMatch(online, /actions\.push\(\{command:'phase7-set-from-deck', label:'SET FROM DECK'\}\)/, 'the shipping action dock must not invent a generic Set From Deck button');
assert.match(online, /function phase7CanvasActions\(\)[\s\S]{0,260}return \[\];/, 'the shipping command dock must not invent a Landscape shortcut');
assert.match(online, /phase7FindAnyCard\(sourceIid\) \|\| phase7FindRawProjectedCard\(view, sourceIid\)[\s\S]{0,300}sourceIid && source && !phase7RequiresManualActivation\(source, command\)/, 'automatic activation must wait until the source identity and authority rule id are known so Christopher Erbs remains manual on first use');
assert.match(data, /function\(cardOrId\)[\s\S]{0,500}copiedEffectId[\s\S]{0,500}FATE_PLAYER_TIMED_MANUAL_EFFECT_CARD_IDS\.includes/, 'the centralized manual-only invariant must recognize copied as well as printed identities');
assert.match(online, /function phase7RequiresManualActivation\(card, command\)[\s\S]{0,1400}privateCard\?\.counters\?\.copiedEffectId[\s\S]{0,650}fateEffectRequiresManualActivationId/, 'Christopher manual classification must combine server, projected, private, copied, and rendered identities');
assert.match(online, /const currentCandidate = phase7CurrentEquivalentCommand\(candidate\)[\s\S]{0,500}phase7RequiresManualActivation\(currentSource, currentCandidate\)/, 'the automatic scheduler must recheck Christopher after the card identity has committed');
assert.match(online, /const requiresManualActivation = phase7RequiresManualActivation\(source, command\)[\s\S]{0,180}requiresManualActivation && submitOptions\.manualActivationIntent !== true[\s\S]{0,700}manual-activation-without-user-intent-blocked/, 'manual effects must be rejected at the final submit boundary unless a production click supplied explicit intent');
assert.match(online, /if\(requiresManualActivation && phase7RequiresAuthorityManualIntent\(source, command\)\)[\s\S]{0,900}command\.payload = Object\.assign\(\{\}, command\.payload, \{userActivated:true\}\)/, 'an explicit manual click must carry its intent across the authority boundary');
assert.match(online, /function phase7ResyncStatusBannersWhenGameReady[\s\S]{0,900}s-game[\s\S]{0,300}match-entry-loading-veil[\s\S]{0,900}renderTopbarEffects/, 'opening-turn status banners must repaint only after the production game screen transition is settled');
assert.match(online, /phase7ChooseCommand\(activations, activationPresentation\.prompt, \{manualActivationIntent:true\}\)/, 'the rendered Activate Effect action must be the source of the explicit manual intent');
assert.match(online, /phase7SubmitBoardFunction[\s\S]{0,700}manualActivationIntent:true/, 'the shipping board button path must carry explicit manual intent');
assert.match(harness, /activate:christopher-manual-pause[\s\S]{0,1500}Christopher Erbs activated before the visible Activate Effect button was clicked/, 'the full-UI test must wait without clicking and fail if Christopher activates automatically');
assert.match(online, /Require the prompt to be continuously absent before a single[\s\S]{0,800}promptGuardKey = ''[\s\S]{0,200}setTimeout\(phase7SyncInteractionUi, 0\)/, 'generic discard/card prompt recovery must be single-owner and cannot reopen every poll');
assert.doesNotMatch(online, /handLimitMissingSince = 0;\s*modal\.classList\.add\('on'\)/, 'the hand-limit polling guard must not fight presentation ownership by forcing the shared modal visible');
assert.match(rendering, /data-phase7-deck-set-card-id="28"[\s\S]{0,520}data-phase7-deck-set-card-id="07"/, 'Maja and Polish retain only their named deck-window controls');

// Server-issued placement and movement destinations must be visible in the
// production canvas, not only on the retired DOM board hidden underneath it.
assert.match(online, /g\._phase7DestinationOptions = destinations/);
assert.match(online, /scheduleRender\('phase7-destination-highlighted'\)/);
assert.match(renderer, /squareMatchesOption\(G\._phase7DestinationOptions, z, r, c\)/);
for(const namedMovement of ['Bussing', 'Brave Horizons', 'Global Missions', 'Panacea Sailors', 'Elusive Movements', 'Snowball Fight']){
  assert.ok(online.includes(namedMovement), `multiplayer must retain the single-player movement name ${namedMovement}`);
}

// A normal three-row zone is entirely visible without a scrollbar. Extra
// geometry reuses the same-sized frame and scrolls inside it.
assert.match(styles, /third card row[\s\S]{0,900}block-size:clamp\(360px, calc\(100vh - 340px\), 500px\)!important/);
assert.match(styles, /board-target-zone:not\(\.has-extra-rows\):not\(\.has-extra-cells\)[\s\S]{0,220}overflow:hidden!important/);
assert.match(styles, /board-target-zone\.has-extra-rows[\s\S]{0,160}overflow-y:auto!important/);
assert.match(styles, /@media \(max-height:820px\)[\s\S]{0,180}--board-target-cell-w:88px!important/);
assert.match(styles, /board pickers size to their actual rows[\s\S]{0,520}height:auto!important[\s\S]{0,650}#modal-acts[\s\S]{0,180}margin-top:\.62rem!important/, 'ordinary board pickers must shrink-wrap their rows and keep the footer inside the modal');
assert.match(styles, /All three zone frames must remain exactly equal[\s\S]{0,180}never changes that frame's height/, 'all three zone frames must retain identical height while added geometry scrolls internally');
assert.doesNotMatch(styles, /board-target-zone\.no-extra-board-space\{[\s\S]{0,180}align-self:start!important/, 'an ordinary zone must not opt out of equal-height stretching');

// Card presentation routing is verified by its real authority event family.
// Mapping the image name alone previously allowed these regressions through.
assert.match(online, /sourceId === '93' \|\| sourceId === '31'/, 'Oathbound must not flash its target-only overlay on the source activation');
assert.match(online, /type === 'STATUS_CREATED'[\s\S]{0,2200}MARIE_DETERRANCE[\s\S]{0,360}semanticSourceCardId:'36'/, 'Marie must route its status-created event into the production overlay');
assert.match(online, /function phase7PresentJimmyCounterGain[\s\S]{0,900}fateReductionEffectUses[\s\S]{0,900}jimmy_wrath/, 'Jimmy must route passive counter growth into the production overlay');
assert.match(online, /function phase7PresentCardSetAuraOverlays[\s\S]{0,900}scheduleCoordinatorPlacementFlash[\s\S]{0,600}flashIncomingCoordinatorEffects/, 'authoritative card sets must reuse both production coordinator-aura overlay directions');
assert.match(online, /applied = phase7CommitCurrentView\(view, reason\);[\s\S]{0,100}phase7PresentCardSetAuraOverlays\(events\)/, 'coordinator aura overlays must start from the committed authoritative board');
assert.match(online, /reason \|\| ''\)\.toUpperCase\(\) !== 'MOVE_AND_DRAW'[\s\S]{0,950}authoritative Anicka movement preview[\s\S]{0,650}setTimeout\(resolve, 3540\)/, 'Anicka must finish movement and its overlay before draw presentation');
assert.match(online, /WINE_COUNTRY_GUERILLA[\s\S]{0,480}showWineCountryGuerillaSentBanner/, 'Wine Country transfer must have a visible notification');
assert.match(online, /WINE_COUNTRY_GUERILLA[\s\S]{0,420}view\?\.playerIndex[\s\S]{0,360}showWineCountryGuerillaFateBanner/, 'only the recipient hand view may name the card hit by Wine Country');
assert.ok(
  engineOperations.indexOf("type:'WINE_COUNTRY_GUERILLA_INFILTRATION'") >= 0
    && engineOperations.indexOf("type:'WINE_COUNTRY_GUERILLA_INFILTRATION'") < engineOperations.indexOf('type:RULE_EVENT_TYPES.CARD_TRANSFERRED', engineOperations.indexOf("type:'WINE_COUNTRY_GUERILLA_INFILTRATION'")),
  'Wine Country must publish a canonical status before its public transfer event'
);
assert.match(rendering, /type === 'WINE_COUNTRY_GUERILLA_INFILTRATION'[\s\S]{0,420}effect-pill-guerilla/, 'both clients must render Wine Country from the same public status');
assert.match(engineState, /openingSelvaCards[\s\S]{0,900}SELVA_EXTRA_SUPPORTER[\s\S]{0,500}extraSupportersThisTurn/, 'opening-hand Selva must create its banner status and immediate starting-player bonus');
assert.match(betaClient, /function resetForNextMatch\(nextCredential\)[\s\S]{0,900}revision = 0[\s\S]{0,500}presentationBatch = null/, 'a consecutive match must not inherit the previous match revision or presentation batch');
assert.match(betaClient, /const connectedSocket = new WebSocket[\s\S]{0,300}socket !== connectedSocket/, 'a closing previous-match socket must not reconnect or update the new match');

// Every production card-effect overlay used by single-player must remain
// reachable through the authoritative presentation adapter. Mark Menz's four
// kinds are intentionally generated by the shared affiliation helper, so the
// online route calls that helper rather than duplicating its literal strings.
const singlePlayerOverlayKinds = new Set(
  [...gameplay.matchAll(/flashCardEffect\([^,]+,\s*['"]([a-z0-9_]+)['"]/g)].map(match=>match[1])
    .concat([...rendering.matchAll(/kind:\s*['"]([a-z0-9_]+)['"]/g)].map(match=>match[1]))
    .filter(kind=>styles.includes(`effect-flash-${kind}`) && !kind.startsWith('mark_menz_'))
);
for(const kind of singlePlayerOverlayKinds){
  assert.ok(
    online.includes(`'${kind}'`) || online.includes(`"${kind}"`),
    `authoritative presentation is missing the single-player overlay kind ${kind}`
  );
  assert.ok(renderer.includes(`${kind}:`) || renderer.includes(`kind === '${kind}'`), `renderer is missing ${kind}`);
}
for(const kind of ['mark_menz_reality','mark_menz_third_great_war','mark_menz_expanded_worlds','mark_menz_eventide']){
  assert.ok(rendering.includes(`${kind}'`) && styles.includes(`effect-flash-${kind}`), `single-player is missing ${kind}`);
}
assert.match(online, /type === 'AFFILIATION_DECLARED'[\s\S]{0,300}AFFILIATION_CHANGED events below own those overlays/, 'authoritative Mark Menz declaration must defer presentation to its changed-card events');
assert.match(online, /type === 'AFFILIATION_CHANGED'[\s\S]{0,500}sourceCardId === '66'[\s\S]{0,260}showMarkMenzAffiliationOverlay\(target, affiliation/, 'authoritative Mark Menz must present the chosen affiliation over every card that actually changed');

// Repeated canvas/DOM click delivery cannot rebuild the pile inspector, and
// hand-limit cards retain independent toggles for exact multi-card selection.
assert.ok(rendering.includes("let _lastDiscardPileInspectorOpen = {key:'', at:0}"));
assert.ok(rendering.includes("modal.dataset.pileInspectorKey === key"));
assert.ok(rendering.includes("showCanvasCardGalleryModal(title, disc"));
assert.match(online, /selectedIids\.size < required[\s\S]{0,1200}nextCount < required/, 'hand-limit discard must enable confirmation at the minimum while allowing additional selected cards');
assert.doesNotMatch(online, /nextCount !== required/, 'hand-limit discard must not force an exact one-card selection');
assert.match(online, /if\(phase7CurrentUiSession\.pickerKey === key && existing\) return;/, 'normal snapshots must never rebuild the same mounted hand-discard window');
assert.match(online, /if\(phase7CurrentUiSession\.pickerKey === key && !existing\)[\s\S]{0,220}pickerKey = ''/, 'a genuinely missing hand-discard window must clear stale ownership so it can recover');
assert.ok(online.includes('handLimitSelectedIids:new Set()'), 'hand-discard selection must survive DOM replacement');
assert.match(online, /const submission = phase7SubmitCommand\(command\);[\s\S]{0,220}closeModal/, 'hand-discard submission ownership must be established before closing');
assert.ok(online.includes('lastHandLimitSubmission:null'), 'hand-limit UI must retain a stale-snapshot submission latch');
assert.match(online, /viewRevision <= Number\(lastHandLimitSubmission\.revision\)[\s\S]{0,520}forceHandLimitClose:true/, 'a pre-submit snapshot must not reopen a resolved hand-limit picker');
assert.match(online, /visual-picker-body[\s\S]{0,900}phase7PickerKey/, 'card and hand selection pickers must expose stable prompt ownership to the recovery guard');
assert.match(online, /\['CARD_SELECTION','HAND_SELECTION'\][\s\S]{0,700}visual-picker-body/, 'card and hand selection prompts must recognize their still-mounted production picker');
assert.match(online, /phase7OpenCardPicker\([\s\S]{0,700}phase7GuardOptionPrompt\(promptKey, prompt\)/, 'card and hand selection prompts must use the bounded recovery guard');
assert.ok(rendering.includes("btn.addEventListener('pointerdown'"));
assert.ok(rendering.includes('selected < needed'), 'single-player hand-limit confirmation must also allow every selection at or above the minimum');
assert.ok(rendering.includes("classList.toggle('is-selected')"), 'single-player hand-limit cards must remain independently toggleable');

// Picker information and Public Deck controls must remain owned by their live
// modal content rather than stale global handlers.
assert.match(rendering, /function bindPickerEffectMarker[\s\S]{0,500}pointerenter[\s\S]{0,500}pointerleave/, 'picker information markers must bind direct hover handlers');
assert.match(rendering, /MutationObserver[\s\S]{0,300}bindPickerEffectMarkers/, 'rebuilt picker cards must receive information hover handlers');
assert.match(rendering, /if\(pickerMarker\)[\s\S]{0,500}rect\.top - estimatedHeight - 10/, 'picker information must anchor directly above its card');
{
  const boardPickerStart = rendering.indexOf('function showBoardTargetPicker');
  const boardPickerEnd = rendering.indexOf('function showZonePicker(', boardPickerStart);
  const boardPicker = rendering.slice(boardPickerStart, boardPickerEnd);
  assert.ok(boardPickerStart >= 0 && boardPickerEnd > boardPickerStart, 'zone picker source must remain discoverable');
  assert.doesNotMatch(boardPicker, /buildHandEffectMarkerHTML/, 'zone pickers must not render information icons');
}
assert.match(economy, /function bindPublicDeckHubActions\(hub\)[\s\S]{0,1200}hub\.addEventListener\('click'/, 'Public Deck controls must bind to the live hub');
assert.match(economy, /if\(publicDecksHubOpen\(\)\) showPublicDecks/, 'account refresh must not replace an open deck detail window with the hub');
assert.doesNotMatch(economy, /window\.addEventListener\('click'[\s\S]{0,260}pd-library-v3/, 'Public Deck controls must not use a page-wide capture handler');

console.log('Phase 7 current interaction acceptance smoke test passed');
