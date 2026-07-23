const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const core = read('src/scripts/05-gameplay-core.js');
const rendering = read('src/scripts/06-rendering-and-helpers.js');
const ai = read('src/scripts/07-ai.js');
const audio = read('src/scripts/08-audio-and-meta-ui.js');
const snapshot = read('src/scripts/render-v2/01-render-snapshot.js');
const adapter = read('src/scripts/render-v2/04-match-renderer-adapter.js');
const css = read('src/styles/zz-codex-last.css');
const rooms = read('src/scripts/18-online-rooms.js');
const authorityReducer = read('server/fate-authority-reducer.js');

assert.match(core, /case '38': \{[\s\S]*G\.board[\s\S]*showBoardTargetPicker\([\s\S]*zones:\[0,1,2\][\s\S]*discardBoardCard\(liveSpent, spent\.z, spent\.r, spent\.c\)[\s\S]*modifyFate\(jake, 4, 'permanent', cp\)[\s\S]*jake\.effectUsedThisTurn = true/, 'Jake must use the three-zone field picker, discard the chosen live Supporter, and resolve +4 Fate atomically');
assert.match(core, /_onlineSetResolutionPending = true[\s\S]*async function resolveSetCardAfterPlacement[\s\S]*_onlineSetResolutionInFlight = true[\s\S]*await triggerWhenSet[\s\S]*delete inst\._onlineSetResolutionPending/, 'placements must expose an in-flight marker until automatic when-set effects such as Alondra finish');
assert.match(rooms, /function waitForOnlineSetResolution[\s\S]*_onlineSetResolutionPending[\s\S]*_onlineSetResolutionInFlight[\s\S]*await waitForOnlineSetResolution\(outbound\)/, 'multiplayer placement capture must wait for automatic when-set mutations');
assert.match(rooms, /authority rejection resync\|rejected action rollback\|fly rejected action rollback[\s\S]*onlineIntentionalBoardRemovalKeys\.clear\(\)[\s\S]*return incomingState/, 'authoritative rejection rollback must restore the exact board instead of preserving a locally removed Supporter');
assert.match(rooms, /function canCaptureClientResolvedBeforeLocalPromise[\s\S]*return actionType === 'CHOOSE_TURN'/, 'async draw and effect actions must not be captured before their local promise settles');
assert.match(core, /case '42'[\s\S]*onlineParentAction: true[\s\S]*case '38'[\s\S]*await new Promise[\s\S]*showBoardTargetPicker/, 'West German Soldier and Jake must keep their awaited picker inside the parent multiplayer action');
assert.match(rooms, /_onlineClientOwnedBoardActionPickerDepth > 0 && opts\?\.onlineParentAction === true[\s\S]*originals\.pickCardsVisual/, 'only explicitly awaited pickers may bypass the nested multiplayer picker action');

assert.match(rendering, /function markCardEffectFlash[\s\S]*card\._effectFlash[\s\S]*function getActiveCardEffectFlash/, 'shared card-effect flash lifecycle must exist');
assert.match(rendering, /TEMPORARY_CARD_OVERLAY_MS = 3500[\s\S]*duration:cleanKind === 'kvetka_ballad' \? 0[\s\S]*turn:cleanKind === 'kvetka_ballad'[\s\S]*persistentForTurn:true/, 'temporary card overlays must last 3.5 seconds while Kvetka Ballad remains through the current turn');
assert.match(rendering, /getActiveCardEffectFlash[\s\S]*cleanKind === 'kvetka_ballad'[\s\S]*Number\(G\.turn\)[\s\S]*return flash/, 'Kvetka Ballad must expire from the active overlay when the turn changes');
assert.match(rendering, /waitForConsolidationCinematic[\s\S]*_actionPresentationLockUntil[\s\S]*_cinematicUiLockUntil[\s\S]*cinematic-lock[\s\S]*scheduleCardEffectFlashVisibilityPoll[\s\S]*return null/, 'all requested overlays must wait until consolidation presentation and cinematic locks finish');
assert.match(css, /fate-kvetka-ballad-turn-pulse[\s\S]*effect-flash-kvetka_ballad::after[\s\S]*infinite!important/, 'Kvetka Ballad must lightly pulse for the rest of the turn');
assert.doesNotMatch(css, /effect-flash-kvetka_ballad[\s\S]{0,500}M14 20/, 'Kvetka Ballad must not retain the detached up-arrow stroke');
assert.match(rendering, /CARD_STATUS_VISUAL_PRIORITY = Object\.freeze\(\[[\s\S]*'effect_flash'[\s\S]*'snowball'[\s\S]*'negated'[\s\S]*function getCardStatusVisualState[\s\S]*CARD_STATUS_VISUAL_PRIORITY/, 'transient flashes must temporarily win visual priority and then yield');
assert.match(snapshot, /effectFlashKind[\s\S]*effectFlashAt/, 'renderer-v2 snapshot must carry transient flash state');
assert.match(adapter, /drawEffectFlashCardOverlay[\s\S]*drawEffectFlashIcon/, 'renderer-v2 must draw card-specific transient icons');

const allOverlayKinds = [
  'specter_ghost', 'kvetka_ballad', 'marie_deterrence',
  'rozsi_dance', 'rivera_crest', 'movement_boot', 'anicka_voyager_boat',
  'oathbound_crescent', 'isaac_beaker',
  'coord_anne_trio', 'coord_postmodern_dylan', 'coord_kvetka_bloom', 'coord_cathy_cardigan',
  'coord_felicyta_eagle', 'coord_zsofia_river', 'coord_jeremiah_snowseal',
  'coord_heyward_compass', 'phil_crown', 'wintertide', 'idyllic_polish_village', 'maria_target'
];
allOverlayKinds.forEach(kind => {
  assert.match(css, new RegExp('effect-flash-' + kind), `${kind} DOM overlay must be styled`);
});
const flashAudioMap = (audio.match(/const typeByKind = \{[\s\S]*?\n  \};/) || [''])[0];
['kvetka_ballad', 'coord_kvetka_bloom'].forEach(kind => {
  assert.match(flashAudioMap, new RegExp(kind + ":'cardFlash"), `${kind} must retain its Kvetka overlay sound`);
});
allOverlayKinds.filter(kind => kind !== 'kvetka_ballad' && kind !== 'coord_kvetka_bloom').forEach(kind => {
  assert.doesNotMatch(flashAudioMap, new RegExp(kind + ":'cardFlash"), `${kind} overlay must be silent so only the ordinary Fate-change sound plays`);
});

assert.match(core, /nextKvetkaBalladPitchStep[\s\S]*pitchStep[\s\S]*kvetka_ballad/, 'Kvetka Ballad activations must retain an ascending pitch step');
assert.match(core, /function flashCardEffect[\s\S]*scheduleRender\('card-effect-flash-started'\)/, 'every transient effect flash must immediately invalidate the shared renderer');
assert.match(core, /tickCarpathianSpecters[\s\S]*flashCardEffect\(card, 'specter_ghost'/, 'Carpathian Specter must flash on a Fate tick');
assert.match(core, /function noteBalladConsolidation[\s\S]*card\.currentFate = before \+ 3[\s\S]*flashCardEffect\(card, 'kvetka_ballad'/, 'Kvetka Ballad must flash each consolidation as it immediately gains 3 Fate');
assert.match(core, /cell&&cell\.id==='36'[\s\S]*flashCardEffect\(cell, 'marie_deterrence'/, 'Marie must flash when Deterrance resolves');
assert.match(core, /function triggerRozsiPassive[\s\S]*'rozsi_dance'/, 'Rozsi must replace the ordinary boot with Hungarian Dance feedback');
assert.match(core, /applyRiveraBuffToPlacedCard[\s\S]*'rivera_crest'/, 'Rivera must flash cards receiving his affiliation bonus');
assert.match(core, /const currentPlayer = G\.currentPlayer[\s\S]*await drawCard\(currentPlayer, 1[\s\S]*card\.id==='46' && card\.owner===currentPlayer[\s\S]*'phil_crown'/, 'Phil must grow and flash only during the captured owner Draw Phase');
assert.match(core, /tickWintertideForCurrentPlayer[\s\S]*'wintertide'/, 'Wintertide must use its distinct snowflake');
assert.match(css, /effect-flash-wintertide[\s\S]*M32 32V5M32 11l-4 5[\s\S]*rotate\(300 32 32\)[\s\S]*circle cx='32' cy='32' r='3\.2'/, 'Wintertide DOM overlay must use the open six-arm snowflake without a web-like center');
assert.match(adapter, /kind === 'wintertide'[\s\S]*arm<6[\s\S]*arm\*Math\.PI\/3[\s\S]*\[\[0,-21\],\[-4,-16\]\][\s\S]*arc\(32,32,3\.2/, 'Wintertide canvas overlay must match the open six-arm snowflake');
assert.match(core, /function applyIdyllicPolishVillageDrawPhase[\s\S]*modifyFate\(card, 1, 'permanent', player\)[\s\S]*flashCardEffect\(card, 'idyllic_polish_village'/, 'Wodny Potok landscape Fate gains must flash the synced village snowflake on affected Expanded Worlds Characters');
assert.match(css, /effect-flash-idyllic_polish_village[\s\S]*M32 8v48M8 32h48[\s\S]*M32 25l7 7-7 7-7-7z/, 'Wodny Potok DOM overlay must use the compact eight-arm village snowflake variant');
assert.match(adapter, /kind === 'idyllic_polish_village'[\s\S]*arm<8[\s\S]*arm\*Math\.PI\/4[\s\S]*\[\[32,25\],\[39,32\],\[32,39\],\[25,32\],\[32,25\]\]/, 'Wodny Potok canvas overlay must match the compact eight-arm village snowflake variant');
assert.match(core, /function applyMariaSongPreciseShot[\s\S]*reduceStoredCardFateBy\(target, 7, sourceOwner\)[\s\S]*'maria_target'/, 'Maria Song must reduce every matching copy and flash matching board cards');
assert.match(authorityReducer, /AUTHORITY_CHARACTER_AFFECTS_OPPONENT = new Set\(\[[^\]]*'61'/, 'Maria Song must be classified as opponent-affecting by the authority reducer');
assert.match(core, /markMovementEffectFlash[\s\S]*movement_boot/, 'effect movement must use the shared boot flash');
assert.match(core, /resolveAnickaVoyagerMove[\s\S]*flashCardEffect\(card, 'anicka_voyager_boat'[\s\S]*label:'Brave Horizons'/, 'Brave Horizons must use the selected 77A boat movement overlay');
assert.match(css, /effect-flash-anicka_voyager_boat[\s\S]*--effect-flash-color:rgba\(142,231,255,\.98\)[\s\S]*--effect-flash-glow:rgba\(62,190,255,\.62\)/, 'Brave Horizons 77A overlay must use the selected sea-blue styling');
assert.match(core, /case '05'[\s\S]*modifyFate\(tgt,3,'permanent'\)[\s\S]*flashCardEffect\(tgt, 'british_union_jack'[\s\S]*label:'Liberators of Rwanda'/, '17th British Regiment must play the ordinary Fate-gain sound and place the silent regiment overlay on its recipient');
assert.match(css, /effect-flash-british_union_jack[\s\S]*M13 14H51V38C47 48 40 55 32 59C24 55 17 48 13 38Z[\s\S]*M15 33L32 19L49 33M16 44L32 31L48 44[\s\S]*M24 52H40/, 'the DOM 17th British overlay must use the approved framed sergeant insignia design');
assert.match(adapter, /movement_boot'[\s\S]*moveTo\(25,15\)[\s\S]*bezierCurveTo\(40,25,40,33,43,41\)[\s\S]*line\(\[\[8,24\],\[1,24\]\]/, 'movement feedback must use the approved outline wing-boot icon');
assert.match(adapter, /anicka_voyager_boat:\{color:'rgba\(142,231,255,\.98\)'[\s\S]*fillRect\(29\.2,13,6\.6,47\)[\s\S]*bezierCurveTo\(20,78,26,78,32,76\)/, 'Brave Horizons canvas overlay must use the selected sea-blue 77A short-mast soft-water boat icon');
assert.match(adapter, /kind === 'british_union_jack'[\s\S]*moveTo\(13,14\)[\s\S]*lineTo\(51,38\)[\s\S]*bezierCurveTo\(47,48,40,55,32,59\)[\s\S]*line\(\[\[15,33\],\[32,19\],\[49,33\]\][\s\S]*line\(\[\[24,52\],\[40,52\]\]/, 'the canvas 17th British overlay must match the approved framed sergeant insignia design');
assert.match(core, /case '31'[\s\S]*pickCardInZone[\s\S]*flashCardEffect\(tgt, 'oathbound_crescent'/, 'Oathbound must flash the approved sword icon on the selected target');
assert.match(adapter, /kind === 'oathbound_crescent'[\s\S]*moveTo\(32,0\)[\s\S]*bezierCurveTo\(22,40,42,40,47,47\)/, 'Oathbound canvas overlay must use the approved raised crescent-guard sword');
assert.match(core, /COORDINATOR_PLACEMENT_FLASH_KIND_BY_ID[\s\S]*'01':'coord_felicyta_eagle'[\s\S]*'10':'coord_postmodern_dylan'[\s\S]*'57':'coord_jeremiah_snowseal'[\s\S]*function getCoordinatorPlacementFlashTargets[\s\S]*scheduleCoordinatorPlacementFlash\(inst/, 'approved coordinator placement overlays must be scheduled from the shared placement-resolution path onto affected cards');
assert.match(core, /function coordinatorAuraAffectsTarget[\s\S]*source\.id === '10'[\s\S]*target\.owner !== source\.owner[\s\S]*source\.id === '01'[\s\S]*Math\.abs[\s\S]*source\.id === '11'[\s\S]*isCardSupporterForRules[\s\S]*source\.id === '19'[\s\S]*target\.type === 'Coordinator'[\s\S]*source\.id === '23'[\s\S]*isCardCharacterForRules/, 'each continuous coordinator placement sigil must target the cards that actually receive that zone aura');
assert.match(core, /function applyZsofiaCoordinatorSetTrigger[\s\S]*String\(placedCard\.type \|\| ''\) !== 'Coordinator'[\s\S]*getZsofiaCoordinatorSetSources[\s\S]*modifyFate\(target, amount, 'permanent'\)[\s\S]*coord_zsofia_river/, 'Zsofia must use a dedicated Coordinator-set trigger that permanently gives friendly cards Fate');
assert.match(core, /function getCoordinatorPlacementFlashTargets[\s\S]*source\.id === '57'[\s\S]*coordinatorAuraAffectsTarget\(aura[\s\S]*receivesBoostedAura[\s\S]*window\.getCoordinatorPlacementFlashTargets/, 'Jeremiah must flash the cards receiving boosted coordinator auras, not merely the coordinator sources');
assert.match(core, /scheduleCoordinatorPlacementFlash[\s\S]*let liveSource = G[\s\S]*forEachBoardCard[\s\S]*const liveAffected = getCoordinatorPlacementFlashTargets[\s\S]*waitForConsolidationCinematic:true/, 'delayed coordinator flashes must re-resolve live board objects after multiplayer state replacement and wait for the cinematic');
assert.match(core, /function getIncomingCoordinatorEffectSources[\s\S]*coordinatorAuraAffectsTarget[\s\S]*function flashIncomingCoordinatorEffects[\s\S]*uniqueKinds[\s\S]*index \* 850[\s\S]*window\.flashIncomingCoordinatorEffects/, 'newly placed cards must flash every applicable existing Coordinator overlay at the Fate reveal moment, sequencing distinct icons');
assert.match(adapter, /timeline\.add\(\{[\s\S]*kind:'fate-pulse'[\s\S]*flashIncomingCoordinatorEffects\(record\.iid[\s\S]*incomingCoordinatorFeedback[\s\S]*kvetkaOnlyGain[\s\S]*playSfx\(delta > 0 \? 'fateGain' : 'fateLose'\)/, 'incoming Coordinator overlays and their combined Fate gain or decrease must begin in one reveal callback');
assert.match(adapter, /prepareCoordinatorAuraFateDelays[\s\S]*soundMode = String\(source\.id \|\| ''\) === '19' \? 'kvetka' : 'generic'[\s\S]*deferCoordinatorFatePulse[\s\S]*pending\.soundMode !== 'kvetka'[\s\S]*playSfx\(Number\(pending\.delta\) > 0 \? 'fateGain' : 'fateLose'\)[\s\S]*coordinator-fate-after-cinematic/, 'coordinator Fate changes must wait for the character cinematic, use the ordinary Fate sound for non-Kvetka overlays, and preserve Kvetka as the sole special-sound exception');
assert.match(adapter, /function coordinatorFatePresentationVisual[\s\S]*deferredCoordinatorFatePulseByIid\.get\(iid\)[\s\S]*displayFate:String\(pending\.fromValue\)[\s\S]*function drawFateBadge[\s\S]*coordinatorFatePresentationVisual\(card, visual\)/, 'the visible Fate badge must retain its pre-aura value until the delayed coordinator Fate pulse begins');
const coordinatorHelperStart = core.indexOf('const COORDINATOR_PLACEMENT_FLASH_KIND_BY_ID');
const coordinatorHelperEnd = core.indexOf('function nextKvetkaBalladPitchStep', coordinatorHelperStart);
assert.ok(coordinatorHelperStart >= 0 && coordinatorHelperEnd > coordinatorHelperStart, 'coordinator target helpers must be extractable for runtime coverage');
const coordinatorRuntime = {
  window:{},
  G:{board:[]},
  isFaceDownCard:card=>!!card?.faceDown,
  isCardEffectImmutable:card=>String(card?.id || '') === '76',
  isCoordinatorSuppressedAt:()=>false,
  isCardSupporterForRules:card=>card?.type === 'Supporter',
  isCardCharacterForRules:card=>card?.type !== 'Supporter'
};
vm.createContext(coordinatorRuntime);
vm.runInContext(core.slice(coordinatorHelperStart, coordinatorHelperEnd), coordinatorRuntime);
const coordinatorCard = (id, iid, owner, type='Coordinator', extra={})=>Object.assign({id, iid, owner, type, aff:'eventide'}, extra);
const runtimeTargets = (source, board, r=1, c=1)=>{
  coordinatorRuntime.G.board = [board];
  return Array.from(coordinatorRuntime.getCoordinatorPlacementFlashTargets(source, 0, r, c), card=>card.iid).sort();
};
const incomingSourceKinds = (target, board, r=1, c=1)=>{
  coordinatorRuntime.G.board = [board];
  return Array.from(
    coordinatorRuntime.getIncomingCoordinatorEffectSources(target, 0, r, c),
    entry=>entry.kind
  ).sort();
};
{
  const anne = coordinatorCard('11', 'anne', 0);
  const allySupporter = coordinatorCard('60', 'ally-supporter', 0, 'Supporter');
  const allyCharacter = coordinatorCard('06', 'ally-character', 0, 'Initiator');
  const enemySupporter = coordinatorCard('60', 'enemy-supporter', 1, 'Supporter');
  const alpine = coordinatorCard('76', 'alpine', 0, 'Supporter');
  assert.deepStrictEqual(runtimeTargets(anne, [[allySupporter, allyCharacter, enemySupporter], [null, anne, alpine]]), ['ally-supporter'], 'Anne overlay must reach every eligible friendly Supporter and skip non-targets');
}
{
  const dylan = coordinatorCard('10', 'postmodern-dylan', 0);
  const ally = coordinatorCard('06', 'ally', 0, 'Initiator');
  const enemyA = coordinatorCard('60', 'enemy-a', 1, 'Supporter');
  const enemyB = coordinatorCard('06', 'enemy-b', 1, 'Initiator');
  assert.deepStrictEqual(runtimeTargets(dylan, [[ally, enemyA, enemyB], [null, dylan, null]]), ['enemy-a','enemy-b'], 'Post-Modernist Dylan overlay must reach every opposing card in the zone');
}
{
  const jeremiah = coordinatorCard('57', 'jeremiah', 0);
  const anne = coordinatorCard('11', 'anne-aura', 0);
  const allySupporter = coordinatorCard('60', 'boosted-supporter', 0, 'Supporter');
  const allyCharacter = coordinatorCard('06', 'unboosted-character', 0, 'Initiator');
  assert.deepStrictEqual(runtimeTargets(jeremiah, [[allySupporter, allyCharacter, null], [anne, jeremiah, null]]), ['boosted-supporter'], 'Jeremiah overlay must follow the boosted aura through to its actual recipient');
}
{
  const anne = coordinatorCard('11', 'existing-anne', 0);
  const incomingSupporter = coordinatorCard('60', 'incoming-supporter', 0, 'Supporter');
  assert.deepStrictEqual(
    incomingSourceKinds(incomingSupporter, [[anne, null, null], [null, incomingSupporter, null]]),
    ['coord_anne_trio'],
    'a newly placed friendly Supporter must flash the existing Anne Coordinator overlay with its Fate gain'
  );
}
{
  const dylan = coordinatorCard('10', 'existing-postmodern-dylan', 0);
  const incomingEnemy = coordinatorCard('60', 'incoming-enemy', 1, 'Supporter');
  assert.deepStrictEqual(
    incomingSourceKinds(incomingEnemy, [[dylan, null, null], [null, incomingEnemy, null]]),
    ['coord_postmodern_dylan'],
    'a newly placed opposing card must flash Post-Modernist Dylan with its Fate decrease'
  );
}
{
  const kvetka = coordinatorCard('19', 'existing-kvetka', 0);
  const jeremiah = coordinatorCard('57', 'existing-jeremiah', 0);
  const incomingCoordinator = coordinatorCard('23', 'incoming-coordinator', 0);
  assert.deepStrictEqual(
    incomingSourceKinds(incomingCoordinator, [[kvetka, jeremiah, null], [null, incomingCoordinator, null]]),
    ['coord_jeremiah_snowseal','coord_kvetka_bloom'],
    'a Jeremiah-enhanced existing Kvetka aura must sequence both contributing overlays with the combined Fate gain'
  );
}
{
  const anne = coordinatorCard('11', 'existing-anne-for-alpine', 0);
  const alpine = coordinatorCard('76', 'incoming-alpine', 0, 'Supporter');
  assert.deepStrictEqual(
    incomingSourceKinds(alpine, [[anne, null, null], [null, alpine, null]]),
    [],
    'an immutable newly placed card must not flash an inapplicable Coordinator overlay'
  );
}
const coordinatorFlashMap = (core.match(/COORDINATOR_PLACEMENT_FLASH_KIND_BY_ID = Object\.freeze\(\{[\s\S]*?\}\);/) || [''])[0];
assert.doesNotMatch(coordinatorFlashMap, /'34':|'12':|'81':/, 'Rozsi, Makenna, and the reworked Initiator Wojciech must remain excluded from automatic coordinator placement flashes');
assert.doesNotMatch(core + css + adapter + audio, /leader_free_world|dylan_annihilation/, 'Post-Modernist Dylan overlay must not use the Dylan Kirby/preview-label name');
assert.match(core, /case '22'[\s\S]*const isaacTargets = \[\][\s\S]*modifyFate\(target,3,'permanent'\)[\s\S]*flashCardEffect\(target, 'isaac_beaker'[\s\S]*soundKey:'isaac:' \+ String\(card[\s\S]*renderEffectResolutionForPlayer\(cp, \{hand:false\}\)/, 'Isaac must apply Fate with the ordinary gain chime, then apply the silent beaker overlay in the same per-target moment');
assert.doesNotMatch(core, /soundKey:'isaac:' \+ String\(inst/, 'Isaac must not reference an undefined inst variable while resolving its targets');
assert.doesNotMatch(core, /flashIsaacTargets|requestAnimationFrame\(function\(\)\{ setTimeout\(flashIsaacTargets/, 'Isaac beaker overlay must not be delayed behind the Fate pop');
assert.match(core, /'77':'coord_heyward_compass'[\s\S]*case '77'[\s\S]*showAffiliationPickerVisual[\s\S]*scheduleCoordinatorPlacementFlash\(inst,[\s\S]*source:'heyward-affiliation-picker'/, 'Duncan Heyward must flash the approved compass on every aura recipient after his affiliation picker resolves');
assert.doesNotMatch(core, /case '77': \{[\s\S]*?showAffChangeOverlay\(inst, aff\)[\s\S]*?case '61'/, 'Duncan Heyward must not use the affiliation board-notice motion that makes his card jump');
assert.match(adapter, /kind === 'isaac_beaker'[\s\S]*bezierCurveTo\(13,53,16,56,21,56\)[\s\S]*dot\(39,38,2\)/, 'Isaac canvas overlay must use the approved free-floating bubble beaker');
assert.match(adapter, /kind === 'coord_zsofia_river'[\s\S]*circle\(32,32,24\)[\s\S]*bezierCurveTo\(18,y-6,25,y\+6,32,y\)/, 'Zsofia canvas overlay must use the approved circled river motif');
assert.match(adapter, /kind === 'coord_jeremiah_snowseal'[\s\S]*circle\(32,32,24\)[\s\S]*bezierCurveTo\(21,35,24,44,28,39\)/, 'Jeremiah canvas overlay must use the approved snowbound mountain seal');
assert.match(adapter, /kind === 'coord_postmodern_dylan'[\s\S]*line\(\[\[32,9\],\[54,32\],\[32,55\],\[10,32\],\[32,9\]\]/, 'Post-Modernist Dylan canvas overlay must use the approved annihilation diamond');
assert.match(ai, /case '31'[\s\S]*flashCardEffect\(target, 'oathbound_crescent'[\s\S]*case '22'[\s\S]*chosen\.forEach\(function\(target, idx\)[\s\S]*flashCardEffect\(target, 'isaac_beaker'[\s\S]*case '77'[\s\S]*scheduleCoordinatorPlacementFlash\(card,[\s\S]*source:'heyward-ai-affiliation'/, 'AI picker-equivalent effects must emit target-side Oathbound/Isaac overlays and Heyward aura-recipient feedback');
assert.match(ai, /case '05'[\s\S]*modifyFate\(target, 3, 'permanent'\)[\s\S]*flashCardEffect\(target, 'british_union_jack'/, 'AI 17th British Regiment must use the ordinary Fate-gain sound with its silent Union Jack overlay');
assert.match(core, /function playFateChangeSound[\s\S]*markEffectFateVisualDelta[\s\S]*playSfx\(after > before \? 'fateGain'/, 'ordinary Fate changes must preserve the generic Fate gain/loss audio path');
assert.match(core, /triggerRozsiPassive[\s\S]*modifyFate\(card, 3, 'permanent'\)[\s\S]*rozsi_dance/, 'Rozsi overlay gains must use the ordinary Fate-gain sound');
assert.match(core, /tickCarpathianSpecters[\s\S]*modifyFate\(card, 1, 'permanent'\)[\s\S]*specter_ghost/, 'Specter overlay gains must use the ordinary Fate-gain sound');
assert.match(ai, /case '22'[\s\S]*modifyFate\(target,3,'permanent'\)[\s\S]*isaac_beaker/, 'AI Isaac overlay gains must use the ordinary Fate-gain sound');
assert.match(core, /applyRiveraBuffToPlacedCard[\s\S]*fateBeforeBuffs[\s\S]*playFateChangeSound\(inst, fateBeforeBuffs, inst\.currentFate, ownerNum\)[\s\S]*rivera_crest/, 'Rivera direct Fate gains must play the ordinary Fate-gain sound');
assert.match(core, /card\.id==='46'[\s\S]*const before[\s\S]*playFateChangeSound\(card, before, card\.currentFate, currentPlayer\)[\s\S]*phil_crown/, 'Phil direct Fate gains must play the ordinary Fate-gain sound');
assert.match(core, /tickWintertideForCurrentPlayer[\s\S]*playFateChangeSound\(card, before, card\.currentFate, currentPlayer\)[\s\S]*wintertide/, 'Wintertide direct Fate gains must play the ordinary Fate-gain sound');
assert.doesNotMatch(audio, /cardFlashSpecter|cardFlashMarie|cardFlashRozsi|cardFlashRivera|cardFlashBoot|cardFlashOathbound|cardFlashScience|cardFlashCompass|cardFlashCrown|cardFlashWintertide|cardFlashTarget/, 'non-Kvetka overlay sound synthesizers must be removed');
assert.doesNotMatch(ai, /flashIsaacAiTargets|requestAnimationFrame\(function\(\)\{ setTimeout\(flashIsaacAiTargets/, 'AI Isaac beaker overlay must not be delayed behind the Fate pop');
assert.match(rooms, /if\(k === '_effectFlash' \|\| k === '_coordinatorPlacementFlashPlayed'\) return;/, 'client-only overlay state must not enter authoritative multiplayer card state');
assert.match(rooms, /function onlineTargetEffectSourceId[\s\S]*Liberators of Rwanda[\s\S]*return '05'[\s\S]*sourceId === '05'[\s\S]*british_union_jack[\s\S]*sourceId === '22' \? 'isaac_beaker'[\s\S]*sourceId === '31' \? 'oathbound_crescent'[\s\S]*kind === 'isaac_beaker' \|\| kind === 'british_union_jack' \? delta > 0 : delta < 0[\s\S]*scheduleOnlineClientCardFlash\(\s*after\.card,\s*kind/, 'multiplayer must reconstruct 17th British, Isaac, and Oathbound overlays on cards whose authoritative Fate actually changed');
assert.match(rooms, /function scheduleOnlineClientCardFlash[\s\S]*return window\.flashCardEffect\(card, kind[\s\S]*soundKey:'online-client:' \+ key/, 'multiplayer reconstructed target overlays must fire immediately instead of waiting behind the Fate pop');
assert.match(rooms, /function reconcileOnlinePostState[\s\S]*collectOnlineFateSnapshot[\s\S]*maybeFlashOnlineTargetEffectDeltas[\s\S]*function applyAuthoritativePostState[\s\S]*collectOnlineFateSnapshot[\s\S]*maybeFlashOnlineTargetEffectDeltas/, 'both reconciliation and direct authoritative multiplayer paths must rebuild target overlays');
assert.match(rooms, /scheduleCoordinatorPlacementFlash\(card, \{[\s\S]*z:entry\.z[\s\S]*r:entry\.r[\s\S]*c:entry\.c[\s\S]*onlineConsolidationCinematicTotalMs\(\) \+ 90/, 'remote coordinator aura overlays must receive the placed coordinates and wait for the character cinematic');
assert.match(rooms, /function maybePlayOnlineRemoteBoardChangeAudio[\s\S]*kvetkaCoordinatorGain[\s\S]*String\(entry\.card\.id \|\| ''\) === '19'[\s\S]*if\(fateUp && !kvetkaCoordinatorGain\)[\s\S]*'FATE_GAIN'/, 'multiplayer must retain generic Fate-gain audio for non-Kvetka overlays while suppressing it for Kvetka coordinator gains');
assert.match(rooms, /primeOnlineCharacterFatePresentationLock[\s\S]*estimateOnlineConsolidationMotionMs[\s\S]*_cinematicUiLockUntil[\s\S]*primeOnlineCharacterFatePresentationLock\(g, previousBoard, action, previousHandFateByIid\)[\s\S]*renderOnlineAuthoritativeState/, 'multiplayer must establish the cinematic lock before rendering authoritative coordinator Fate changes');
assert.match(rooms, /function maybeFlashOnlineAutomaticEffectDeltas[\s\S]*after\.id === '77'[\s\S]*getCoordinatorPlacementFlashTargets\(after\.card, after\.z, after\.r, after\.c\)[\s\S]*scheduleOnlineClientCardFlash\(\s*target,\s*'coord_heyward_compass'[\s\S]*movement_boot[\s\S]*specter_ghost[\s\S]*wintertide[\s\S]*idyllic_polish_village[\s\S]*phil_crown[\s\S]*maybeFlashOnlineAutomaticEffectDeltas\(action, previousFate/, 'multiplayer clients must reconstruct Heyward on every aura recipient plus movement, recurring Fate, Wodny Potok, and owner-only Phil flashes from accepted state deltas');
assert.match(rooms, /online-consolidation-completed[\s\S]*onlineConsolidationCinematicTotalMs\(\) \+ 260[\s\S]*kvetka_ballad[\s\S]*waitForConsolidationCinematic:true/, 'remote consolidation must locally schedule coordinator aura flashes and the persistent Kvetka Ballad overlay after its cinematic');
assert.match(ai, /marie_deterrence/, 'AI consolidation must emit Marie feedback');
['sebastyen', 'great_oak_sword', 'un_globe'].forEach(kind => {
  [core, ai, audio, adapter, css].forEach(source => assert.doesNotMatch(source, new RegExp(kind), `${kind} overlay code must be removed`));
});

console.log('Card effect flash smoke test passed.');
