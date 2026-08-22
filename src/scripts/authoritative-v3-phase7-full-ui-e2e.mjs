import {cardRule, multiplayerEligibleCardIds} from '../../shared/engine/cards/registry.mjs';
import {
  auditRuleOraclePresentationBatch,
  auditRuleOracleState,
  cardRuleOracle,
  expectedEffectiveFateFromOracle,
  landscapeRuleOracle,
  RULE_ORACLE_CONTINUOUS_BRANCH_CARD_IDS,
  validateRuleOracleCatalog
} from '../../shared/engine/rules-oracle.mjs?v=1786672600';

const params = new URLSearchParams(globalThis.location?.search || '');
const fastUiMode = params.get('fateV3FullUiE2E') === '1';
const timingUiMode = params.get('fateV3PresentationE2E') === '1';
// Only presentation mode is the shipping game. Fast mode is retained as a
// diagnostic accelerator, but it is never certification evidence because it
// deliberately disables presentation. Direct command fallback is opt-in and
// is forbidden in the exact shipping path.
const exactShippingPathMode = timingUiMode;
const diagnosticFallbackEnabled = fastUiMode && params.get('e2eAllowDiagnosticFallback') === '1';
const enabled = params.get('fateV3UnrankedBeta') === '1'
  && fastUiMode !== timingUiMode
  && params.get('electron') === '1'
  && params.get('fateV3BetaTestAuth') === '1';

if(!enabled) throw new Error('Phase 7 full-UI E2E requires exactly one isolated fast or presentation-timing flag');

const targetGames = Math.max(1, Math.min(1070, Number(params.get('e2eGames')) || 1));
const startGameIndex = Math.max(0, Math.min(1069, Number(params.get('e2eStartIndex')) || 0));
const maxRuntimeMs = Math.max(0, Math.min(300_000, Number(params.get('e2eMaxRuntimeMs')) || 0));
const maxActions = Math.max(0, Math.min(100_000, Number(params.get('e2eMaxActions')) || 0));
const stallTimeoutMs = Math.max(5000, Math.min(30000, Number(params.get('e2eStallMs')) || (timingUiMode ? 12000 : 6000)));
const seat = String(params.get('e2eSeat') || 'A').slice(0, 12);
const runId = String(params.get('e2eRunId') || 'local').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'local';
const organicCardCampaign = params.get('e2eOrganicCardCampaign') === '1';
const strictCardCertification = params.get('e2eStrictCardCertification') === '1';
const canaryMode = params.get('e2eCanaryMode') === '1';
if(organicCardCampaign !== strictCardCertification){
  throw new Error('Card campaigns require both e2eOrganicCardCampaign=1 and e2eStrictCardCertification=1');
}
if(/organic|card-cert/i.test(runId) && !organicCardCampaign){
  throw new Error('A card-certification run name cannot start without strict organic campaign flags');
}
const TEST_RUN_LOCK_KEY = `fateAuthorityV3Phase7FullUiActiveRun:${runId}`;
const TEST_RUN_FINISH_PREFIX = 'fateAuthorityV3Phase7FullUiFinished:';
const TEST_RUN_READY_PREFIX = 'fateAuthorityV3Phase7FullUiReady:';
const TEST_RUN_LOCK_TTL_MS = 15000;
const CROSS_SEAT_PREFIX = 'fateAuthorityV3CrossSeat:';
try{ localStorage.removeItem(TEST_RUN_FINISH_PREFIX + runId + ':' + seat); }catch(_){ }
try{ localStorage.setItem(TEST_RUN_READY_PREFIX + runId + ':' + seat, String(Date.now())); }catch(_){ }
// Older harness revisions wrote one full public snapshot per server revision.
// A long campaign could therefore exhaust localStorage and turn valid matches
// into false sync failures. Cross-seat exchange now uses two bounded slots per
// run, so clear the obsolete accumulated records before the run starts.
try{
  for(let index = localStorage.length - 1; index >= 0; index--){
    const key = String(localStorage.key(index) || '');
    if(key.startsWith(CROSS_SEAT_PREFIX)) localStorage.removeItem(key);
  }
}catch(_){ }

function claimTestRunLock(){
  const now = Date.now();
  try{
    const current = JSON.parse(localStorage.getItem(TEST_RUN_LOCK_KEY) || 'null');
    if(current?.runId && current.runId !== runId && Number(current.expiresAt) > now) return false;
    localStorage.setItem(TEST_RUN_LOCK_KEY, JSON.stringify({runId, expiresAt:now + TEST_RUN_LOCK_TTL_MS}));
    return true;
  }catch(_){ return true; }
}

function finishTestRunLock(){
  try{
    localStorage.setItem(TEST_RUN_FINISH_PREFIX + runId + ':' + seat, String(Date.now()));
    const seatAFinished = !!localStorage.getItem(TEST_RUN_FINISH_PREFIX + runId + ':A');
    const seatBFinished = !!localStorage.getItem(TEST_RUN_FINISH_PREFIX + runId + ':B');
    const current = JSON.parse(localStorage.getItem(TEST_RUN_LOCK_KEY) || 'null');
    if(seatAFinished && seatBFinished && current?.runId === runId){
      localStorage.removeItem(TEST_RUN_LOCK_KEY);
      localStorage.removeItem(TEST_RUN_FINISH_PREFIX + runId + ':A');
      localStorage.removeItem(TEST_RUN_FINISH_PREFIX + runId + ':B');
      localStorage.removeItem(TEST_RUN_READY_PREFIX + runId + ':A');
      localStorage.removeItem(TEST_RUN_READY_PREFIX + runId + ':B');
    }
  }catch(_){ }
}

async function waitForPeerTestClientReady(){
  if(!organicCardCampaign) return;
  const deadline = Date.now() + 15000;
  while(Date.now() < deadline){
    try{
      const seatAReady = !!localStorage.getItem(TEST_RUN_READY_PREFIX + runId + ':A');
      const seatBReady = !!localStorage.getItem(TEST_RUN_READY_PREFIX + runId + ':B');
      if(seatAReady && seatBReady) return;
    }catch(_){ return; }
    await sleep(50);
  }
}
const eligibleCardIds = multiplayerEligibleCardIds().map(String);
const requestedOrganicTargetCardId = String(params.get('e2eOrganicTargetCardId') || '').trim();
const requestedFocusedScenario = String(params.get('e2eFocusedScenario') || '').trim().toLowerCase();
const requestedLandscapeId = String(params.get('e2eLandscapeId') || '').trim().toLowerCase();
const oracleCatalogAudit = validateRuleOracleCatalog(
  eligibleCardIds,
  Array.from({length:20}, (_value, index)=>`igb${index + 1}`)
);
if(!oracleCatalogAudit.ok){
  throw new Error(`Rule oracle catalog is incomplete: ${oracleCatalogAudit.errors.join('; ')}`);
}
if(requestedOrganicTargetCardId && !organicCardCampaign){
  throw new Error('e2eOrganicTargetCardId requires the strict organic card campaign flags');
}
if(requestedOrganicTargetCardId && !eligibleCardIds.includes(requestedOrganicTargetCardId)){
  throw new Error(`Unknown multiplayer-eligible card requested: ${requestedOrganicTargetCardId}`);
}
const FOCUSED_SHIPPING_SCENARIOS = Object.freeze({
  // One real match deliberately carries every canonical status-banner source
  // plus the named source overlays that have regressed in multiplayer. The
  // server can pin only four opening cards per seat, so this remains one
  // combined test run but uses three bounded real matches. That makes every
  // source reachable before turn 20 instead of mistaking a lucky draw for
  // presentation coverage.
  'status-presentations':Object.freeze({
    groups:Object.freeze([
      Object.freeze({targets:Object.freeze(['71','18','50','91','33']), variantIndex:0}),
      Object.freeze({targets:Object.freeze(['69','93','94','97','74','78']), variantIndex:0}),
      Object.freeze({targets:Object.freeze(['51','87','99','86','07']), variantIndex:2})
    ])
  }),
  // Both production deck-window controls are exercised in the same match.
  'deck-set-controls':Object.freeze({
    targets:Object.freeze(['07','28']),
    variantIndex:0
  }),
  // Generic Johnathan searches, all three square-prompt effects, and both
  // three-card draw/search presentation paths share one rendered match.
  'search-square-draw':Object.freeze({
    targets:Object.freeze(['13','43','04','17','27','07']),
    variantIndex:0
  }),
  // Exact reported regressions: opening Selva, Mark's per-target affiliation
  // overlays, Christopher remaining manual, and a real two-card hand picker.
  'first-turn-ui-regressions':Object.freeze({
    targets:Object.freeze(['74','66','40','42']),
    variantIndex:0
  })
});
if(requestedFocusedScenario && !FOCUSED_SHIPPING_SCENARIOS[requestedFocusedScenario]){
  throw new Error(`Unknown focused shipping scenario: ${requestedFocusedScenario}`);
}
if(requestedFocusedScenario && !organicCardCampaign){
  throw new Error('e2eFocusedScenario requires the strict organic card campaign flags');
}
if(requestedLandscapeId && !/^igb(?:[1-9]|1\d|20)$/.test(requestedLandscapeId)){
  throw new Error(`Unknown landscape requested: ${requestedLandscapeId}`);
}
// The user explicitly allowed only the two basic deck-search cards to skip the
// ten-match organic campaign. Other search/draw cards remain in the campaign:
// their empty-source, ownership, picker, reaction, and presentation behavior is
// still observable only through the real shipping interaction path. Lina is
// intentionally included because her search continues into free placement.
const ORGANIC_FULL_MATCH_EXEMPT_CARD_IDS = new Set(['06','60']);
function organicCardSort(left, right){
  const leftNumeric = /^\d+$/.test(String(left)) ? Number(left) : Number.POSITIVE_INFINITY;
  const rightNumeric = /^\d+$/.test(String(right)) ? Number(right) : Number.POSITIVE_INFINITY;
  return leftNumeric - rightNumeric || String(left).localeCompare(String(right), undefined, {numeric:true});
}
const organicCampaignCardIds = (requestedOrganicTargetCardId
  ? [requestedOrganicTargetCardId]
  : eligibleCardIds.filter(id=>!ORGANIC_FULL_MATCH_EXEMPT_CARD_IDS.has(id)))
    .sort(organicCardSort);
if(organicCardCampaign && !requestedOrganicTargetCardId && organicCampaignCardIds.length !== 107){
  throw new Error(`Strict card certification requires exactly 107 non-exempt cards; found ${organicCampaignCardIds.length}`);
}
const ORGANIC_VARIANTS = Object.freeze([
  Object.freeze({key:'BASELINE_CONTROLLER_RESOLUTION', partners:['32']}),
  Object.freeze({key:'CANCEL_OR_DECLINE_WITHOUT_DEFAULT_MUTATION', partners:['31']}),
  Object.freeze({key:'LYDIA_NEGATE_WINDOW', partners:['56']}),
  Object.freeze({key:'LYDIA_SUPPRESS_WINDOW', partners:['56']}),
  Object.freeze({key:'HAVANO_TARGETED_INTERRUPT', partners:['79']}),
  Object.freeze({key:'IMMUNE_TARGET_EXCLUSION', partners:['76','20']}),
  Object.freeze({key:'USE_LIMIT_OR_DUPLICATE_ADMISSION', partners:['67']}),
  Object.freeze({key:'EMPTY_OR_INELIGIBLE_PREREQUISITE', partners:['58']}),
  Object.freeze({key:'LANDSCAPE_INTERACTION', partners:['82','91']}),
  Object.freeze({key:'OPPOSITE_SEAT_AND_CONTROL_DIRECTION', partners:['39','52']})
]);
// These effects use card-specific production status overlays. Their focused
// matches are not certified unless the exact overlay kind is observed; a
// generic effect flash is not equivalent to the shipping single-player UI.
const REQUIRED_SOURCE_OVERLAY_KINDS = Object.freeze({
  '01':'coord_felicyta_eagle',
  '05':'british_union_jack',
  '10':'coord_postmodern_dylan',
  '11':'coord_anne_trio',
  '15':'coord_zsofia_river',
  '19':'coord_kvetka_bloom',
  '22':'isaac_beaker',
  '23':'coord_cathy_cardigan',
  '31':'oathbound_crescent',
  '34':'rozsi_dance',
  '36':'marie_deterrence',
  '41':'jimmy_wrath',
  '51':'rivera_crest',
  '57':'coord_jeremiah_snowseal',
  '61':'maria_target',
  '66':Object.freeze(['mark-menz-reality','mark-menz-third_great_war','mark-menz-expanded_worlds','mark-menz-eventide']),
  '77':'coord_heyward_compass',
  '86':'boleslaw_exclaim',
  '87':'kvetka_ballad',
  '93':'snowball',
  'bh01':'anicka_voyager_boat',
  'bh02':'joie_thousand_reel',
  'bh04':'bh04_selva_paradise',
  'bh07':'bh07_overclock',
  'bh08':'bh08_mischief',
  'bh25':'jimmy_wrath'
});
function requiredOverlayKindsForCard(cardId){
  const configured = REQUIRED_SOURCE_OVERLAY_KINDS[String(cardId || '')];
  if(!configured) return [];
  return Array.isArray(configured) ? configured : [configured];
}
function sourceOverlayEvidenceCount(cardId){
  return requiredOverlayKindsForCard(cardId).reduce((sum, kind)=>
    sum + Number(result.sourceOverlayKinds[`${cardId}|${kind}`] || 0), 0
  );
}
// Every non-exempt card receives ten full shipping-UI matches. Risk labels are
// retained for reporting and scenario design only; they must never reduce the
// per-card match count requested by the certification campaign.
const ORGANIC_EXPLICIT_HIGH_RISK_CARD_IDS = new Set([
  '02','03','04','05','07','09','10','11','12','14','15','16','17','18','19','20','21','23','24','25','28','30','31','34','35','37','39','41','44','45','47','49','50','51','52','53','54','55','56','57','59','61','62','63','64','65','66','67','69','70','72','73','74','75','76','77','78','79','81','82','83','85','87','88','89','91','92','93','94','95','97','98','99','100','bh01','bh03','bh04','bh05','bh06','bh07','bh08','bh09','bh10','bh11','bh12','bh13','bh25'
]);
const ORGANIC_HIGH_RISK_CARD_IDS = new Set(organicCampaignCardIds.filter(id=>
  ORGANIC_EXPLICIT_HIGH_RISK_CARD_IDS.has(id)
  || RULE_ORACLE_CONTINUOUS_BRANCH_CARD_IDS.includes(id)
  || (cardRule(id)?.prompts || []).length > 0
));

function organicRequiredMatches(cardId){
  return 10;
}

// Interleave cards by variant. A stopped campaign therefore exercises a broad
// slice of the catalog instead of spending its first hundred matches on ten
// consecutive copies of the same few cards.
const organicCampaignSchedule = Object.freeze(ORGANIC_VARIANTS.flatMap((_variant, variantIndex)=>
  organicCampaignCardIds.map((cardId, cardIndex)=>Object.freeze({
    cardId,
    cardIndex,
    variantIndex,
    requiredMatches:organicRequiredMatches(cardId)
  }))
));
const organicCampaignScheduleSummary = Object.freeze(organicCampaignCardIds.map(cardId=>{
  const startIndex = organicCampaignSchedule.findIndex(entry=>entry.cardId === cardId);
  return Object.freeze({cardId, startIndex, requiredMatches:organicRequiredMatches(cardId)});
}));
const ORGANIC_CANARY_SCHEDULE = Object.freeze([
  {cardId:'32', cardIndex:organicCampaignCardIds.indexOf('32'), variantIndex:0, requiredMatches:1, partners:['01']},
  {cardId:'47', cardIndex:organicCampaignCardIds.indexOf('47'), variantIndex:0, requiredMatches:1, partners:['22']},
  {cardId:'16', cardIndex:organicCampaignCardIds.indexOf('16'), variantIndex:0, requiredMatches:1, partners:['31']},
  {cardId:'66', cardIndex:organicCampaignCardIds.indexOf('66'), variantIndex:1, requiredMatches:1, partners:['31']},
  {cardId:'39', cardIndex:organicCampaignCardIds.indexOf('39'), variantIndex:0, requiredMatches:1, partners:['32']},
  {cardId:'30', cardIndex:organicCampaignCardIds.indexOf('30'), variantIndex:2, requiredMatches:1, partners:['56']},
  {cardId:'37', cardIndex:organicCampaignCardIds.indexOf('37'), variantIndex:0, requiredMatches:1, partners:['59']},
  {cardId:'01', cardIndex:organicCampaignCardIds.indexOf('01'), variantIndex:0, requiredMatches:1, partners:['32']},
  {cardId:'82', cardIndex:organicCampaignCardIds.indexOf('82'), variantIndex:8, requiredMatches:1, partners:['91']},
  {cardId:'32', cardIndex:organicCampaignCardIds.indexOf('32'), variantIndex:9, requiredMatches:1, partners:['52']}
].map(Object.freeze));
const requestedFocusedScenarioDefinition = FOCUSED_SHIPPING_SCENARIOS[requestedFocusedScenario] || null;
const activeOrganicSchedule = requestedFocusedScenarioDefinition
  ? Object.freeze((requestedFocusedScenarioDefinition.groups
      || [requestedFocusedScenarioDefinition]
    ).map((group, groupIndex)=>Object.freeze({
      cardId:group.targets[0],
      targets:group.targets,
      cardIndex:groupIndex,
      variantIndex:group.variantIndex,
      requiredMatches:1,
      partners:Object.freeze([])
    })))
  : (canaryMode ? ORGANIC_CANARY_SCHEDULE : organicCampaignSchedule);
const ORGANIC_REACTION_SOURCE_CYCLES = Object.freeze({
  '56':Object.freeze(['14','16','30','39','51','52','61','66','90','93']),
  '67':Object.freeze(['16','30','39','52','96','16','30','39','52','96']),
  '79':Object.freeze(['30','39','52','93','30','39','52','93','30','39'])
});
const ORGANIC_SPECIAL_LANDSCAPES = Object.freeze({
  '18':'igb15', '92':'igb15', '100':'igb15',
  '34':'igb7', '39':'igb7', '54':'igb7', '62':'igb7', '69':'igb7', '70':'igb7', '73':'igb7', 'bh01':'igb7',
  '58':'igb4', '60':'igb4', '68':'igb4', '86':'igb4'
});

function organicPartnersForGame(gameIndex, targets){
  const scenario = organicScenarioForGame(gameIndex);
  const variant = scenario?.variantIndex
    ?? (Math.max(0, Number(gameIndex) || 0) % ORGANIC_VARIANTS.length);
  if(Array.isArray(scenario?.partners)) return scenario.partners.filter(id=>eligibleCardIds.includes(id));
  const targetId = String(targets?.[0] || '');
  const reactionCycle = ORGANIC_REACTION_SOURCE_CYCLES[targetId];
  if(reactionCycle) return [reactionCycle[variant]].filter(Boolean);
  const base = [...(ORGANIC_VARIANTS[variant]?.partners || [])];
  const specific = {
    '02':['43'], '03':['31'], '15':['01'], '18':['32'], '34':['31'],
    '35':['32'], '37':['59'], '41':['93'], '44':['14'], '47':['09','63'],
    '55':['39','54','57'], '64':['76'], '77':['31'], '87':['32'],
    '89':['26','73','93'], '92':['32'], 'bh05':['05'], 'bh07':['14']
  }[targetId] || [];
  if(targetId === '100'){
    const related = new Set(['01','19','82','84','85']);
    const filtered = base.filter(id=>!related.has(id));
    return [...new Set(variant % 2 === 0 ? ['01', ...filtered] : filtered)].slice(0, 2);
  }
  // The variant contract is the interaction being certified in this match.
  // Put those cards first and cap the setup at two; three Character partners
  // can consume more reinforcement than a 20-turn organic game can reliably
  // establish, which previously let the decisive control-direction partner
  // (card 52) remain unused behind a generic target helper.
  return [...new Set([...base, ...specific])]
    .filter(id=>eligibleCardIds.includes(id) && id !== targetId)
    .slice(0, 2);
}

function organicDeckHeldTargets(targets){
  return (targets || []).map(String).filter(id=>['07','28'].includes(id));
}

function organicDeckTopTargets(targets){
  return (targets || []).map(String).filter(id=>id === '74');
}

function shouldHoldOrganicReactionCard(cardId){
  const id = String(cardId || '');
  // Lydia and Secules react from the field, exactly as in single-player. Only
  // Havano is a hand reaction and must be preserved instead of set.
  if(id !== '79') return false;
  if(queuedOrganicTargets.includes(id)) return true;
  return queuedOrganicTargets.some(targetId=>(cardRule(targetId)?.prompts || []).includes('REACTION'));
}

function organicLandscapeForGame(gameIndex, targetId){
  const scenario = organicScenarioForGame(gameIndex);
  const targetIndex = scenario?.cardIndex
    ?? Math.max(0, organicCampaignCardIds.indexOf(String(targetId || '')));
  const variant = scenario?.variantIndex
    ?? (Math.max(0, Number(gameIndex) || 0) % ORGANIC_VARIANTS.length);
  const sequence = Array.from({length:10}, (_value, offset)=>`igb${((targetIndex * 11 + offset * 7) % 20) + 1}`);
  const special = ORGANIC_SPECIAL_LANDSCAPES[String(targetId || '')];
  if(special){
    const existing = sequence.indexOf(special);
    if(existing > 0) [sequence[0], sequence[existing]] = [sequence[existing], sequence[0]];
    else if(existing < 0) sequence[0] = special;
  }
  return sequence[variant];
}

function organicScenarioForGame(gameIndex){
  if(!organicCardCampaign) return null;
  const index = Math.max(0, Number(gameIndex) || 0);
  return activeOrganicSchedule[index] || null;
}

const ORGANIC_ROTATING_SUPPORTER_IDS = Object.freeze([
  '05','09','16','18','20','24','25','26','28','31','32','33','37','42','44','47',
  '49','50','52','53','54','58','59','62','63','64','69','70','71','72','73','74',
  '75','76','78','79','80','91','92','93','94','95','97','98'
].filter(id=>eligibleCardIds.includes(id)));
const ORGANIC_ROTATING_CHARACTER_IDS = Object.freeze([
  '01','02','03','04','06','07','08','10','11','12','13','14','15','17','19','21',
  '22','23','27','29','30','34','35','36','38','39','40','41','43','45','46','48',
  '51','55','56','57','61','66','67','77','81','82','83','84','85','86','87','88',
  '89','90','99','100','bh01','bh02','bh03','bh04','bh05','bh06','bh07','bh08','bh09','bh10','bh11','bh12','bh13','bh25'
].filter(id=>eligibleCardIds.includes(id)));

function rotatedScenarioIds(pool, gameIndex, seatOffset, count, excluded){
  if(!pool.length) return [];
  const start = (Math.max(0, Number(gameIndex) || 0) * 7 + seatOffset) % pool.length;
  const ordered = Array.from({length:pool.length}, (_value, index)=>pool[(start + index) % pool.length]);
  return ordered.filter(id=>!excluded.has(id)).slice(0, count);
}

function cardMatchesOracleSelection(card, targetText, targetId = ''){
  const target = String(targetText || '').toUpperCase();
  if(target.includes('OTHER_COPY') || target.includes('SOURCE_CARD')) return String(card?.id || '') === String(targetId || '');
  const type = String(card?.type || '').toUpperCase();
  const affiliation = String(card?.aff || card?.affiliation || '').toUpperCase();
  const rarity = String(card?.rarity || '').toUpperCase();
  if(target.includes('SUPPORTER') && type !== 'SUPPORTER') return false;
  if(target.includes('CHARACTER') && type === 'SUPPORTER') return false;
  if(target.includes('NON_STAR') && (type === 'STAR' || rarity === 'STAR')) return false;
  if(target.includes('TRIANGLE') && rarity !== 'TRIANGLE') return false;
  if(target.includes('THIRD_GREAT_WAR') && affiliation !== 'THIRD_GREAT_WAR') return false;
  if(target.includes('EXPANDED_WORLDS') && affiliation !== 'EXPANDED_WORLDS') return false;
  if(target.includes('REALITY') && affiliation !== 'REALITY') return false;
  if(target.includes('EVENTIDE') && affiliation !== 'EVENTIDE') return false;
  if(target.includes('OTHER_THAN_SOURCE_ID') && String(card?.id || '') === String(targetId || '')) return false;
  return true;
}

function cardMatchesDeckPrerequisite(card, targetText, targetId = ''){
  if(!String(targetText || '').toUpperCase().includes('DECK')) return false;
  return cardMatchesOracleSelection(card, targetText, targetId);
}

function emptyPrerequisiteDeckFillers(targetId, excluded){
  const targetText = String(cardRuleOracle(targetId)?.target || '').toUpperCase();
  if(!targetText.includes('DECK')) return [];
  return eligibleCardIds.filter(id=>{
    if(excluded.has(id)) return false;
    const definition = cardDefinition(id);
    return definition && !cardMatchesDeckPrerequisite(definition, targetText, targetId);
  });
}

function exactOrganicScenarioDeck(targets, partners, gameIndex, seatName, variantIndex = 0){
  const primary = [...new Set([...(targets || []), ...(partners || [])].map(String).filter(id=>eligibleCardIds.includes(id)))];
  const excluded = new Set(primary);
  const seatOffset = String(seatName || '').toUpperCase() === 'B' ? 17 : 0;
  const supporters = rotatedScenarioIds(ORGANIC_ROTATING_SUPPORTER_IDS, gameIndex, seatOffset, 10, excluded);
  const characters = rotatedScenarioIds(ORGANIC_ROTATING_CHARACTER_IDS, gameIndex, seatOffset + 5, 10, excluded);
  const emptyDeckFillers = Number(variantIndex) === 7 && targets?.length === 1
    ? emptyPrerequisiteDeckFillers(String(targets[0]), excluded)
    : [];
  const useEmptyDeckFixture = emptyDeckFillers.length > 0;
  const scenarioIds = [...new Set([...primary, ...(useEmptyDeckFixture ? emptyDeckFillers : [...supporters, ...characters])])];
  if(!scenarioIds.length) throw new Error('Exact organic scenario deck has no eligible cards');
  // Test-auth matches deliberately bypass production rarity limits. Repeating
  // only the scenario cards makes every draw relevant while retaining a full
  // forty-card, twenty-turn match and the exact shipping UI/runtime path.
  const counts = new Map();
  const focusedTargetCopies = requestedFocusedScenario
    ? Math.max(1, Math.min(4, Math.floor(32 / Math.max(1, (targets || []).length))))
    : 8;
  for(const id of (targets || []).map(String)) counts.set(id, (counts.get(id) || 0) + (useEmptyDeckFixture ? 1 : focusedTargetCopies));
  for(const id of (partners || []).map(String)) counts.set(id, (counts.get(id) || 0) + (useEmptyDeckFixture ? 1 : 5));
  if(!useEmptyDeckFixture){
    for(const id of supporters) counts.set(id, (counts.get(id) || 0) + 1);
    for(const id of characters) counts.set(id, (counts.get(id) || 0) + 1);
  }
  let deckIds = [...counts.entries()].flatMap(([id, count])=>Array.from({length:count}, ()=>id))
    .filter(id=>eligibleCardIds.includes(id));
  const fillers = useEmptyDeckFixture ? emptyDeckFillers : [...supporters, ...characters, ...primary];
  for(let index = 0; deckIds.length < 40 && fillers.length; index += 1){
    deckIds.push(fillers[index % fillers.length]);
  }
  deckIds = deckIds.slice(0, 40);
  return {deckIds, scenarioIds};
}

function oracleText(rule){
  return [
    ...(rule?.timing || []), ...(rule?.prerequisites || []), rule?.target,
    rule?.resolution, rule?.cardinality, rule?.duration, rule?.useLimit,
    ...(rule?.stateEvidence || []), ...(rule?.forbidden || [])
  ].filter(Boolean).join(' ').toUpperCase();
}

function requiresRealReinforcementRules(cardId, landscapeId){
  const cardText = oracleText(cardRuleOracle(cardId));
  const landscapeText = oracleText(landscapeRuleOracle(landscapeId));
  // A Supporter-related effect is not automatically a reinforcement test.
  // Keep the accelerated zero-cost fixture for targeting, search, suppression,
  // Fate, and other Supporter interactions; use production costs only when the
  // rule itself observes or changes reinforcement/tribute legality or value.
  return /REINFORCEMENT|TRIBUTE|CONSOLIDATION_COST|CONSOLIDATION_RULE|CONSOLIDATION_RESTRICTED|ZERO_COST/.test(cardText + ' ' + landscapeText);
}

function reinforcementPolicyForScenario(gameIndex, cardId, landscapeId){
  const scenario = organicScenarioForGame(gameIndex);
  const baselineRealRules = Number(scenario?.variantIndex ?? 0) === 0;
  const realRulesRequired = baselineRealRules || requiresRealReinforcementRules(cardId, landscapeId);
  return Object.freeze({
    key:realRulesRequired ? 'REAL' : 'ZERO_COST',
    zeroReinforcementCost:!realRulesRequired,
    reason:baselineRealRules
      ? 'BASELINE_REAL_RULES'
      : (realRulesRequired ? 'REINFORCEMENT_SENSITIVE_ORACLE' : 'EFFECT_FOCUS_OPTIMIZATION')
  });
}

function cardRequiresRealReinforcementRules(cardId){
  return requiresRealReinforcementRules(cardId, '');
}

function zeroCostOpeningScaffoldIds(targets, partners, deckIds){
  if(!queuedReinforcementPolicy.zeroReinforcementCost) return [];
  const reserved = new Set([...(targets || []), ...(partners || [])].map(String));
  const consolidationCount = [...reserved].filter(id=>
    String(cardDefinition(id)?.type || '') !== 'Supporter' && !shouldHoldOrganicReactionCard(id)
  ).length;
  if(consolidationCount <= 0) return [];
  return [...new Set((deckIds || []).map(String))].filter(id=>{
    const definition = cardDefinition(id);
    return !reserved.has(id) && String(definition?.type || '') === 'Supporter';
  }).slice(0, Math.min(2, consolidationCount));
}

function cardCertificationObligations(cardId){
  const rule = cardRuleOracle(cardId);
  if(!rule) return [];
  const obligations = [
    ...(rule.requiredBranches || []).map(value=>`BRANCH:${value}`),
    ...(rule.prerequisites || []).map(value=>`PREREQUISITE:${value}`),
    ...(rule.stateEvidence || []).map(value=>`STATE:${value}`),
    ...(rule.forbidden || []).map(value=>`FORBIDDEN:${value}`),
    ...(rule.presentation || []).map(value=>`PRESENTATION:${value}`),
    `BENEFICIARY:${rule.beneficiary}`,
    `TARGET:${rule.target}`,
    `CARDINALITY:${rule.cardinality}`,
    `DURATION:${rule.duration}`,
    `USE_LIMIT:${rule.useLimit}`
  ];
  return [...new Set(obligations.filter(value=>value
    && !value.endsWith(':AS_PRINTED')
    && !value.endsWith(':NO_ADDITIONAL_LIMIT')
  ))];
}

function obligationVariantIndex(obligation){
  const value = String(obligation || '').toUpperCase();
  if(/CANCEL|DECLIN/.test(value)) return 1;
  if(/NEGAT/.test(value)) return 2;
  if(/SUPPRESS|BLOCKED_EFFECT|PENDING_EFFECT/.test(value)) return 3;
  if(/IMMUNE|INELIGIBLE/.test(value)) return 5;
  if(/TWICE|DUPLICATE|SECOND_|THIRD_|FOURTH_|MORE_THAN|USE_LIMIT|RERENDER/.test(value)) return 6;
  if(/PREREQUISITE|EMPTY|WITHOUT_PRINTED|PRE_TURN|ABSENT|OFF_FIELD/.test(value)) return 7;
  if(/LANDSCAPE/.test(value)) return 8;
  if(/OPPONENT|CONTROLLER|OWNER|WRONG_PLAYER|WRONG_HAND|SEATS_DISAGREE/.test(value)) return 9;
  return 0;
}

function plannedObligationsForScenario(cardId, variantIndex){
  return cardCertificationObligations(cardId).filter(obligation=>
    obligationVariantIndex(obligation) === Number(variantIndex)
  );
}

function mechanicallyObservedObligations(cardId, evidence){
  const required = cardCertificationObligations(cardId);
  const observed = [];
  const addMatching = predicate=>{
    for(const obligation of required) if(predicate(obligation) && !observed.includes(obligation)) observed.push(obligation);
  };
  if(evidence.resolvedEffectDelta > 0 && evidence.oracleCheckDelta > 0 && evidence.oracleViolations === 0){
    addMatching(value=>value === 'BRANCH:ELIGIBLE_RESOLUTION'
      || value.startsWith('BENEFICIARY:')
      || value.startsWith('TARGET:')
      || value.startsWith('CARDINALITY:'));
    addMatching(value=>value === 'FORBIDDEN:EFFECT_BENEFITS_OPPONENT_UNLESS_TEXT_EXPLICITLY_ALLOWS_IT'
      || value === 'FORBIDDEN:SAME_COMMAND_RESOLVES_TWICE');
  }
  if(evidence.crossSeatViolations === 0){
    addMatching(value=>value === 'FORBIDDEN:SEATS_DISAGREE_ON_ACTIVE_PLAYER_OR_PUBLIC_STATE');
  }
  if(exactShippingPathMode && evidence.resolvedEffectDelta > 0 && evidence.presentationTimingViolations === 0){
    addMatching(value=>value.startsWith('PRESENTATION:')
      || value === 'FORBIDDEN:EFFECT_CINEMATIC_WITHOUT_A_LEGAL_RESOLUTION'
      || value === 'FORBIDDEN:PROMPT_OR_DRAW_MOTION_PRECEDES_REQUIRED_CINEMATIC');
  }
  // All remaining prerequisite, ineligible, immunity, ownership, duration,
  // cleanup, cancellation, and use-limit obligations require a dedicated
  // scenario probe. They intentionally remain unobserved here; a clean match
  // count is not evidence that a forbidden behavior was attempted and blocked.
  return observed;
}
// These are generated from the Phase 0/4 classification docs and intersected
// with the current multiplayer registry. Families whose executable registry
// grew beyond the original text classifier are explicitly widened below.
const EFFECT_FAMILY_FOCUS_GROUPS = Object.freeze({
  1:Object.freeze({family:'DRAW_AND_SEARCH', cardIds:Object.freeze(['06','07','08','13','27','29','32','40','42','46','48','60','68','71','74','80','84','86','90','bh01','bh02','bh10'])}),
  2:Object.freeze({family:'FATE_MODIFICATION', cardIds:Object.freeze(['01','02','03','05','07','10','11','14','15','19','22','23','31','33','34','35','36','38','40','41','44','46','47','51','55','57','59','61','63','64','65','66','70','76','77','83','85','86','87','88','89','90','93','95','100','bh02','bh07','bh08','bh09','bh11','bh12','bh13'])}),
  3:Object.freeze({family:'MOVEMENT', cardIds:Object.freeze(['34','39','54','62','69','70','73','bh01'])}),
  4:Object.freeze({family:'DISCARD_REMOVAL_AND_TRANSFER', cardIds:Object.freeze(['08','16','29','30','38','42','48','52','58','62','70','71','72','73','80','96','bh10','bh13','bh25'])}),
  5:Object.freeze({family:'STATUS_AND_IMMUNITY', cardIds:Object.freeze(['06','07','12','14','17','18','20','21','51','53','56','67','69','70','76','79','81','91','99','bh01','bh03','bh06','bh08'])}),
  6:Object.freeze({family:'CONTROL_CHANGES', cardIds:Object.freeze(['70','72','bh03'])}),
  7:Object.freeze({
    family:'CONTINUOUS_MODIFIERS',
    // Phase 0 text classification plus every live effectiveFate source in
    // the current authoritative modifier query.
    cardIds:Object.freeze(['01','10','11','14','15','19','20','21','23','24','35','37','41','44','49','53','55','57','59','61','63','64','77','83','85','88','89','92','93','95','100','bh02','bh07','bh08','bh11','bh12'])
  }),
  8:Object.freeze({
    family:'PLACEMENT_EFFECTS',
    // All current registry rules with WHEN_SET or DECK_SET timing.
    cardIds:Object.freeze(['02','04','05','07','08','12','14','16','17','18','21','25','28','31','32','33','37','42','43','50','51','52','54','58','60','61','62','65','66','68','69','71','72','73','75','76','77','78','80','81','82','84','87','90','91','94','96','97','99','bh04','bh05','bh06','bh09','bh10','bh12','bh13','bh25'])
  }),
  9:Object.freeze({
    family:'REACTIONS_AND_INTERRUPTS',
    // Phase 0 reaction observers + the complete Phase 7 reactor/source
    // matrix. Keeping both sides in the deck is required to open real
    // authoritative interrupt prompts instead of merely setting Improvisors.
    cardIds:Object.freeze(['14','16','18','26','30','39','40','51','52','56','61','66','67','79','90','91','93','96','bh02','bh04','bh08','bh12'])
  }),
  10:Object.freeze({
    family:'LANDSCAPES',
    cardIds:Object.freeze(['82','91']),
    landscapeIds:Object.freeze(Array.from({length:20}, (_, index)=>`igb${index + 1}`))
  }),
  11:Object.freeze({family:'UNUSUAL_CUSTOM_EFFECTS', cardIds:Object.freeze(['04','09','28','45','78','82','98','bh04'])})
});
const requestedFocusGroup = Math.max(0, Math.min(11, Number(params.get('e2eFocusGroup')) || 0));
const focus = EFFECT_FAMILY_FOCUS_GROUPS[requestedFocusGroup] || null;
const focusedCardIds = focus ? focus.cardIds.filter(id=>eligibleCardIds.includes(id)) : eligibleCardIds;
const focusedCardIdSet = new Set(focusedCardIds);
const focusedLandscapeIds = Array.isArray(focus?.landscapeIds) ? [...focus.landscapeIds] : [];
const result = {
  enabled:true,
  mode:timingUiMode ? 'production-presentation-timing' : 'fast-interaction',
  exactShippingPath:exactShippingPathMode,
  certificationEligible:exactShippingPathMode,
  diagnosticFallbackEnabled,
  exactFlag:timingUiMode ? 'fateV3PresentationE2E=1' : 'fateV3FullUiE2E=1',
  identityMode:String(globalThis.FATE_PHASE7_TEST_IDENTITY_MODE || ''),
  runId,
  seat,
  clientBuildStamp:String(globalThis.__fateClientBuildStamp || ''),
  electronBuild:String(params.get('electronBuild') || ''),
  targetGames,
  startGameIndex,
  maxRuntimeMs,
  maxActions,
  stallTimeoutMs,
  focusMapRevision:'phase4-families-20260802-2',
  focusGroup:requestedFocusGroup,
  focusFamily:focus?.family || 'ALL_EFFECT_FAMILIES',
  focusTargetCardIds:[...focusedCardIds],
  focusTargetLandscapeIds:[...focusedLandscapeIds],
  organicCardCampaign,
  strictCardCertification,
  canaryMode,
  requestedOrganicTargetCardId,
  requestedFocusedScenario,
  organicCampaignCardIds:[...organicCampaignCardIds],
  organicExemptCardIds:[...ORGANIC_FULL_MATCH_EXEMPT_CARD_IDS],
  organicHighRiskCardIds:[...ORGANIC_HIGH_RISK_CARD_IDS],
  organicCampaignScheduleLength:activeOrganicSchedule.length,
  organicCampaignScheduleSummary:[...organicCampaignScheduleSummary],
  testingPolicy:{
    revision:'designed-scenarios-5-plus-5-20260802',
    baselineMatches:10,
    highRiskAdditionalMatches:0,
    exactScenarioDecks:true,
    diagnosticFallbackCountsAsSuccess:false,
    directCommandFallbackEnabled:diagnosticFallbackEnabled,
    presentationDurationCompressed:false,
    certificationRequiresProductionPresentation:true,
    releaseCleanStreakRequired:30
  },
  organicTargetCoverage:{},
  oracleCatalog:oracleCatalogAudit,
  oracleChecks:0,
  oracleCardChecks:{},
  oracleCardBranches:{},
  obligationEvidenceCounts:{},
  obligationEvidence:[],
  pileAuditSamples:[],
  oracleViolations:[],
  domChecks:0,
  domViolations:[],
  domCheckKinds:{},
  completedGames:0,
  failedGames:0,
  failedScenarioIndexes:[],
  warmupMatches:0,
  actions:0,
  fallbackActions:0,
  uiFallbacks:[],
  uiDriveRetries:0,
  lastUiDriveFailure:null,
  errors:[],
  commandTypes:{},
  answerVariants:{},
  promptTypes:{},
  cardIds:{},
  observedActionCardIds:{},
  focusCardIds:{},
  eventTypes:{},
  effectEventCardIds:{},
  resolvedEffectCardIds:{},
  effectBranches:{},
  focusEffectBranches:{},
  landscapes:{},
  landscapeBranches:{},
  queuedDecks:[],
  presentationStages:0,
  presentationTimingViolations:[],
  presentationTrace:[],
  drawSequences:[],
  fateNumberDomEvents:[],
  boardPickerSelections:[],
  cardPickerSelections:[],
  manualActivationPauses:[],
  pickerOpenCounts:{},
  overlayKinds:{},
  sourceOverlayKinds:{},
  failureClassifications:{},
  failureBundles:[],
  crossSeatChecks:0,
  crossSeatViolations:[],
  targetAvailabilityDiagnostics:[],
  lastTargetAvailabilityDiagnostic:null,
  checkpoints:[],
  canaryStatus:{passed:false, missing:[]},
  consecutiveCleanMatches:0,
  releaseGate:{passed:false, reasons:[]},
  matches:[],
  running:false,
  startedAt:Date.now(),
  finishedAt:0,
  stopReason:''
};

function recordRuleObligationEvidence(cardId, obligation, detail){
  const id = String(cardId || '');
  const key = `${id}|${String(obligation || '')}`;
  if(!cardCertificationObligations(id).includes(String(obligation || ''))) return false;
  note(result.obligationEvidenceCounts, key);
  result.obligationEvidence.push({
    cardId:id,
    obligation:String(obligation || ''),
    matchId:String(report()?.state?.matchId || ''),
    revision:Number(report()?.state?.revision ?? report()?.revision ?? 0),
    detail:detail || null,
    at:Date.now()
  });
  if(result.obligationEvidence.length > 300) result.obligationEvidence.shift();
  return true;
}

function obligationEvidenceSnapshot(cardId){
  return prefixedCountSnapshot(result.obligationEvidenceCounts, cardId);
}

let loopPromise = null;
let stopped = false;
let matchStart = null;
let lastProgressAt = Date.now();
let lastFailureKey = '';
let lastFailureAt = 0;
let lastMatchmakingAttemptAt = 0;
let matchmakingInFlight = false;
let queuedOrganicTargets = [];
let queuedOrganicPartners = [];
let queuedOpeningScaffoldIds = [];
let queuedReinforcementPolicy = Object.freeze({key:'REAL',zeroReinforcementCost:false,reason:'NON_ORGANIC'});
let organicTargetCommandsThisMatch = new Set();
let organicPartnerCommandsThisMatch = new Set();
let manualDiscardCoveredThisMatch = false;
let lastProjectionOracleKey = '';
let projectionOracleCandidateKey = '';
let projectionOracleCandidateSince = 0;
let lastObservedProgressKey = '';
let lastTargetAvailabilityKey = '';
let abandonMatchInFlight = false;
const successfulActivationCounts = new Map();
const useLimitProbeKeys = new Set();
const timedStatusTrackers = new Map();

function currentOrganicGameIndex(){
  return startGameIndex + result.completedGames + result.failedGames + result.warmupMatches;
}

function organicVariant(){
  return organicScenarioForGame(currentOrganicGameIndex())?.variantIndex
    ?? (Math.max(0, currentOrganicGameIndex()) % ORGANIC_VARIANTS.length);
}

function organicVariantContract(){
  return ORGANIC_VARIANTS[organicVariant()] || ORGANIC_VARIANTS[0];
}

function organicTargetsForGame(gameIndex){
  const scenario = organicScenarioForGame(gameIndex);
  if(Array.isArray(scenario?.targets)) return scenario.targets.filter(id=>eligibleCardIds.includes(String(id))).map(String);
  return scenario?.cardId ? [scenario.cardId] : [];
}

function organicCoverage(cardId){
  const id = String(cardId || '');
  if(!result.organicTargetCoverage[id]){
    const requiredMatches = organicRequiredMatches(id);
    result.organicTargetCoverage[id] = {
      requiredMatches,
      assignedMatches:0,
      completedMatches:0,
      commandMatches:0,
      effectMatches:0,
      resolvedEffectMatches:0,
      cleanMatches:0,
      evidencePassedMatches:0,
      oracleObservedMatches:0,
      adversarialPartnerObservedMatches:0,
      commands:0,
      effectEvents:0,
      resolvedEffects:0,
      landscapes:[],
      variants:[],
      branchKeys:[],
      requiredObligations:cardCertificationObligations(id),
      observedObligations:[],
      plannedObligations:[],
      realRuleMatches:0,
      zeroCostMatches:0,
      matchEvidence:[],
      automaticEvidencePassed:false,
      certified:false,
      escalatedAfterFailure:false,
      pendingReasons:['REQUIRED_COMPLETE_MATCHES','TARGET_COMMAND_EVERY_MATCH','TARGET_EFFECT_EVIDENCE','ORACLE_OBSERVATION_EVERY_MATCH','ADVERSARIAL_PARTNER_EVERY_MATCH','ZERO_UI_FALLBACKS','ZERO_PRESENTATION_ERRORS','ZERO_ORACLE_VIOLATIONS','REQUIRED_DISTINCT_LANDSCAPES','REQUIRED_ADVERSARIAL_VARIANTS','FOCUSED_RULE_REVIEW']
    };
  }
  return result.organicTargetCoverage[id];
}

function organicTargetRequiresEffectEvidence(cardId){
  const rule = cardRuleOracle(cardId);
  if(!rule) return true;
  if(String(cardId) === '74') return true;
  return (rule.timing || []).some(timing=>![
    'PASSIVE','DECK_SET','OPENING_HAND','HAND_ARRIVAL'
  ].includes(String(timing).toUpperCase()));
}

function prefixedKeys(map, cardId){
  const prefix = String(cardId || '') + '|';
  return Object.keys(map || {}).filter(key=>key.startsWith(prefix));
}

function prefixedCountSnapshot(map, cardId){
  const prefix = String(cardId || '') + '|';
  return Object.fromEntries(Object.entries(map || {}).filter(([key])=>key.startsWith(prefix)));
}

function changedPrefixedKeys(map, before, cardId){
  const prefix = String(cardId || '') + '|';
  return Object.entries(map || {}).filter(([key, count])=>
    key.startsWith(prefix) && Number(count || 0) > Number(before?.[key] || 0)
  ).map(([key])=>key);
}

function refreshOrganicAutomaticEvidence(cardId){
  const coverage = organicCoverage(cardId);
  const requiredMatches = Number(coverage.requiredMatches || organicRequiredMatches(cardId));
  const requiresEffectEvidence = organicTargetRequiresEffectEvidence(cardId);
  const pending = [];
  if(coverage.assignedMatches < requiredMatches || coverage.completedMatches < requiredMatches) pending.push('REQUIRED_COMPLETE_MATCHES');
  if(coverage.commandMatches < requiredMatches) pending.push('TARGET_COMMAND_EVERY_MATCH');
  if(requiresEffectEvidence && coverage.effectMatches < requiredMatches) pending.push('TARGET_EFFECT_EVIDENCE');
  if(requiresEffectEvidence && coverage.branchKeys.length < 2) pending.push('MULTIPLE_RULE_BRANCHES');
  if(RULE_ORACLE_CONTINUOUS_BRANCH_CARD_IDS.includes(String(cardId || ''))){
    if(!coverage.branchKeys.includes(`${cardId}|CONTINUOUS_CONDITION_TRUE`)) pending.push('CONTINUOUS_POSITIVE_BRANCH');
    if(!coverage.branchKeys.includes(`${cardId}|CONTINUOUS_CONDITION_FALSE`)) pending.push('CONTINUOUS_NEGATIVE_BRANCH');
  }
  if(coverage.oracleObservedMatches < requiredMatches) pending.push('ORACLE_OBSERVATION_EVERY_MATCH');
  if(coverage.adversarialPartnerObservedMatches < requiredMatches) pending.push('ADVERSARIAL_PARTNER_EVERY_MATCH');
  if(coverage.cleanMatches < requiredMatches) pending.push('ZERO_UI_FALLBACKS');
  if(coverage.matchEvidence.some(entry=>Number(entry.presentationTimingViolations) > 0)) pending.push('ZERO_PRESENTATION_ERRORS');
  if(coverage.matchEvidence.some(entry=>Number(entry.domViolations) > 0)) pending.push('ZERO_RENDERED_UI_VIOLATIONS');
  if(coverage.matchEvidence.some(entry=>Number(entry.oracleViolations) > 0)) pending.push('ZERO_ORACLE_VIOLATIONS');
  if(new Set(coverage.landscapes).size < requiredMatches) pending.push('REQUIRED_DISTINCT_LANDSCAPES');
  if(new Set(coverage.variants).size < requiredMatches) pending.push('REQUIRED_ADVERSARIAL_VARIANTS');
  if(coverage.realRuleMatches < 1) pending.push('REAL_REINFORCEMENT_BASELINE');
  if(!cardRequiresRealReinforcementRules(cardId) && coverage.zeroCostMatches < 1) pending.push('ZERO_COST_EFFECT_FOCUS_VARIANT');
  const missingObligations = coverage.requiredObligations.filter(obligation=>
    !coverage.observedObligations.includes(obligation)
  );
  if(missingObligations.length) pending.push(`UNOBSERVED_RULE_OBLIGATIONS:${missingObligations.length}`);
  // Passing these mechanical checks is necessary but deliberately not enough
  // to certify a card. Focused rule/interaction review remains mandatory.
  coverage.automaticEvidencePassed = pending.length === 0;
  coverage.certified = false;
  coverage.pendingReasons = [...pending, 'FOCUSED_RULE_REVIEW'];
}

function beta(){ return globalThis.fateAuthorityV3Beta || null; }
function report(){ return beta()?.report?.() || null; }
function sleep(ms){ return new Promise(resolve=>setTimeout(resolve, ms)); }

function isVisible(node){
  if(!node || node.hidden || !node.getClientRects().length) return false;
  const style = getComputedStyle(node);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function currentUiReady(){
  if(!document.getElementById('s-game')?.classList.contains('active')) return false;
  if(document.getElementById('match-entry-loading-veil')?.classList.contains('on')) return false;
  const authoritative = report();
  const bridge = globalThis.FatePhase7CurrentMultiplayerUi?.report?.();
  // The transport can publish a new revision a frame before the current game
  // UI has committed it. Starting a gesture in that gap lets the subsequent
  // UI commit correctly clear the now-stale destination/picker interaction.
  if(!bridge?.active || Number(bridge.revision) !== Number(authoritative?.revision)) return false;
  if(bridge.presentationBusy) return false;
  return !!document.getElementById('fate-match-v2-canvas') && !!hitMap();
}

const presentationTimingState = {
  cinematicDepth:0,
  resultsActive:false,
  lastResultsEndAt:0,
  resultFeedbackStarts:new Map()
};
const drawPresentationState = new Map();
const submittedPickerKeys = new Set();
const openedPickerKeys = new Set();
const recentFateNumberDomByTarget = new Map();
function resultFeedbackKey(details){
  const value = details || {};
  return [
    String(value.batchId || ''),
    String(value.eventId || ''),
    String(value.sourceIid || ''),
    String(value.targetIid || ''),
    String(value.before ?? ''),
    String(value.after ?? '')
  ].join('|');
}
function noteResultFeedbackStart(kind, detail){
  const details = detail?.details || {};
  const key = resultFeedbackKey(details);
  if(!String(details.batchId || '') || !String(details.targetIid || '')) return;
  const current = presentationTimingState.resultFeedbackStarts.get(key) || {batchId:String(details.batchId || '')};
  if(Number.isFinite(current[kind])){
    recordPresentationTimingViolation(
      kind === 'fate'
        ? 'Authoritative Fate change produced more than one visible Fate animation'
        : 'Authoritative Fate change produced more than one effect overlay',
      {...details, kind, firstStartedAt:current[kind], duplicateStartedAt:Number(detail?.at) || Date.now()}
    );
  }
  current[kind] = Number(detail?.at) || Date.now();
  presentationTimingState.resultFeedbackStarts.set(key, current);
  if(Number.isFinite(current.fate) && Number.isFinite(current.overlay)){
    const deltaMs = Math.abs(current.fate - current.overlay);
    if(deltaMs > 34){
      recordPresentationTimingViolation('Fate number and effect overlay did not start in the same frame window', {
        ...details,
        fateStartedAt:current.fate,
        overlayStartedAt:current.overlay,
        deltaMs
      });
    }
  }
}
function recordPresentationTimingViolation(message, detail){
  const entry = {message:String(message || ''), detail:detail || null, at:Date.now()};
  result.presentationTimingViolations.push(entry);
  if(result.presentationTimingViolations.length > 100) result.presentationTimingViolations.shift();
  recordError(entry.message, {stage:'presentation-timing', detail:entry.detail});
}
if(timingUiMode){
  globalThis.addEventListener('fate-phase7-presentation-stage', function(event){
    const detail = event?.detail || {};
    const stage = String(detail.stage || '');
    lastProgressAt = Date.now();
    result.presentationStages += 1;
    result.presentationTrace.push({stage, at:Number(detail.at) || Date.now(), details:detail.details || {}});
    if(result.presentationTrace.length > 160) result.presentationTrace.shift();
    if(stage === 'picker:submit'){
      const key = String(detail?.details?.key || '');
      if(key) submittedPickerKeys.add(key);
    }
    if(stage === 'picker:open'){
      const key = String(detail?.details?.key || '');
      if(key){
        note(result.pickerOpenCounts, key);
        if(openedPickerKeys.has(key)){
          recordPresentationTimingViolation('The same authoritative picker opened more than once', {
            key,
            kind:String(detail?.details?.kind || '')
          });
        }
        openedPickerKeys.add(key);
      }
      if(key && submittedPickerKeys.has(key)){
        recordPresentationTimingViolation('A resolved picker reopened while its authoritative submission was in flight', {
          key,
          kind:String(detail?.details?.kind || '')
        });
      }
    }
    if(stage === 'cinematic:start') presentationTimingState.cinematicDepth += 1;
    if(stage === 'cinematic:end') presentationTimingState.cinematicDepth = Math.max(0, presentationTimingState.cinematicDepth - 1);
    if(stage === 'results:start'){
      if(presentationTimingState.cinematicDepth > 0) recordPresentationTimingViolation('Result animation began before the cinematic finished', detail);
      presentationTimingState.resultsActive = true;
    }
    if(stage === 'results:end'){
      presentationTimingState.resultsActive = false;
      presentationTimingState.lastResultsEndAt = Date.now();
      const batchId = String(detail?.details?.batchId || '');
      for(const [key, starts] of presentationTimingState.resultFeedbackStarts){
        if(starts.batchId !== batchId) continue;
        if(Number.isFinite(starts.overlay) && !Number.isFinite(starts.fate)){
          recordPresentationTimingViolation('Effect overlay appeared without the matching visible Fate number animation', {batchId, key});
        }
        presentationTimingState.resultFeedbackStarts.delete(key);
      }
    }
    if(stage === 'draw:start'){
      const batchId = String(detail?.details?.batchId || '');
      const drawIndex = Number(detail?.details?.drawIndex);
      const drawCount = Number(detail?.details?.drawCount);
      const current = drawPresentationState.get(batchId) || {expected:drawCount,nextIndex:0,active:false,ended:0,draws:[]};
      if(current.active) recordPresentationTimingViolation('A draw animation started before the preceding draw animation finished', detail);
      if(drawIndex !== current.nextIndex) recordPresentationTimingViolation('Draw animations did not run in authoritative event order', {...detail, expectedIndex:current.nextIndex});
      if(drawCount !== current.expected) recordPresentationTimingViolation('Draw animation count changed within one authoritative batch', detail);
      current.active = true;
      current.activeIndex = drawIndex;
      current.draws.push({
        drawIndex,
        cardIid:String(detail?.details?.cardIid || ''),
        sourceIid:String(detail?.details?.sourceIid || ''),
        sourceCardId:String(detail?.details?.sourceCardId || ''),
        eventType:String(detail?.details?.eventType || ''),
        startedAt:Number(detail?.at) || Date.now(),
        endedAt:0
      });
      drawPresentationState.set(batchId, current);
    }
    if(stage === 'draw:end'){
      const batchId = String(detail?.details?.batchId || '');
      const drawIndex = Number(detail?.details?.drawIndex);
      const current = drawPresentationState.get(batchId);
      if(!current?.active || current.activeIndex !== drawIndex) recordPresentationTimingViolation('Draw animation ended without its matching active draw', detail);
      if(current){
        const activeDraw = current.draws.find(candidate=>candidate.drawIndex === drawIndex && !candidate.endedAt);
        if(activeDraw) activeDraw.endedAt = Number(detail?.at) || Date.now();
        current.active = false;
        current.ended += 1;
        current.nextIndex += 1;
      }
    }
    if(stage === 'results:start'){
      const batchId = String(detail?.details?.batchId || '');
      const current = drawPresentationState.get(batchId);
      if(current && (current.active || current.ended !== current.expected)){
        recordPresentationTimingViolation('Result presentation began before every sequential draw animation finished', {...detail, drawState:{...current}});
      }
      if(current){
        result.drawSequences.push({
          batchId,
          expected:current.expected,
          ended:current.ended,
          draws:current.draws.map(draw=>({...draw}))
        });
        if(result.drawSequences.length > 80) result.drawSequences.shift();
        drawPresentationState.delete(batchId);
      }
    }
    if(stage === 'modal-gate:open'){
      if(presentationTimingState.cinematicDepth > 0 || presentationTimingState.resultsActive){
        recordPresentationTimingViolation('Modal gate opened before cinematic/result presentation finished', detail);
      }
    }
    if(stage === 'consolidation-motion:end'){
      const motion = detail?.details || {};
      const frames = Number(motion?.animation?.frameCount) || 0;
      if(motion.failedOpen || motion.motionDisabled || motion.degraded || !motion.vfxId || frames < 1){
        recordPresentationTimingViolation('Consolidation board motion did not render through the production VFX path', {
          ...motion,
          textureCache:globalThis.FateCardTextureCache?.report?.() || null
        });
      }
    }
    if(stage === 'overlay:start'){
      const kind = String(detail?.details?.kind || 'missing');
      const sourceCardId = String(detail?.details?.sourceCardId || '');
      note(result.overlayKinds, kind);
      if(sourceCardId) note(result.sourceOverlayKinds, `${sourceCardId}|${kind}`);
      if(kind.startsWith('phase7_')){
        recordPresentationTimingViolation('Generic Phase 7 overlay was used instead of a production overlay', detail);
      }
      if(String(detail?.details?.eventType || '').toUpperCase() === 'FATE_CHANGED') noteResultFeedbackStart('overlay', detail);
    }
    if(stage === 'fate-motion:start') noteResultFeedbackStart('fate', detail);
    publish();
  });

  // Observe the shipping DOM result itself in addition to presentation-stage
  // telemetry.  This catches the historical failure where one explicit
  // authority Fate number was followed by a second generic renderer number.
  // The two paths do not necessarily share an event id, so a same-target,
  // same-delta authority/generic pair inside one presentation window is a
  // duplicate even when its transition metadata differs.
  const observeFateNumberNode = function(node){
    if(!(node instanceof HTMLElement) || !node.classList.contains('fate-number-pop')) return;
    const entry = {
      id:String(node.dataset.fateNumberId || ''),
      targetKey:String(node.dataset.fateTargetKey || ''),
      transition:String(node.dataset.fateTransition || ''),
      delta:String(node.dataset.fateDelta || node.textContent || '').trim(),
      authorityEvent:String(node.dataset.fateAuthorityEvent || ''),
      at:Date.now()
    };
    result.fateNumberDomEvents.push(entry);
    if(result.fateNumberDomEvents.length > 160) result.fateNumberDomEvents.shift();
    const targetKey = entry.targetKey || 'global';
    const recent = recentFateNumberDomByTarget.get(targetKey);
    const sameAuthorityEvent = !!entry.authorityEvent && entry.authorityEvent === recent?.authorityEvent;
    const authorityGenericPair = entry.delta === recent?.delta
      && (!!entry.authorityEvent !== !!recent?.authorityEvent);
    if(recent && entry.at - recent.at < 6000 && (sameAuthorityEvent || authorityGenericPair)){
      recordPresentationTimingViolation('One authoritative Fate change rendered more than one DOM Fate number', {
        previous:recent,
        duplicate:entry
      });
    }
    recentFateNumberDomByTarget.set(targetKey, entry);
    publish();
  };
  const fateNumberObserver = new MutationObserver(function(records){
    records.forEach(function(record){
      record.addedNodes.forEach(function(node){
        observeFateNumberNode(node);
        if(node instanceof Element) node.querySelectorAll('.fate-number-pop').forEach(observeFateNumberNode);
      });
    });
  });
  fateNumberObserver.observe(document.documentElement, {subtree:true, childList:true});
}

function statusElement(){
  let node = document.getElementById('phase7-full-ui-e2e-status');
  if(!node){
    node = document.createElement('output');
    node.id = 'phase7-full-ui-e2e-status';
    node.hidden = true;
    document.body.appendChild(node);
  }
  return node;
}

function publish(){
  refreshOperationalGates();
  const node = statusElement();
  node.dataset.state = result.running ? 'running' : (result.finishedAt ? 'complete' : 'idle');
  node.dataset.completedGames = String(result.completedGames);
  node.dataset.actions = String(result.actions);
  node.dataset.errors = String(result.errors.length);
  node.textContent = JSON.stringify(result);
  globalThis.dispatchEvent(new CustomEvent('fate-phase7-full-ui-e2e-progress', {detail:JSON.parse(node.textContent)}));
  publishElectronDiagnostic(false);
}

let electronDiagnosticStarted = false;
let electronDiagnosticInFlight = false;
let lastElectronDiagnosticAt = 0;
function compactElectronProgress(){
  return {
    version:2,
    heartbeatAt:Date.now(),
    runId,
    seat,
    mode:result.mode,
    startGameIndex,
    targetGames,
    startedAt:result.startedAt,
    finishedAt:result.finishedAt,
    running:result.running,
    stopReason:result.stopReason,
    completedGames:result.completedGames,
    failedGames:result.failedGames,
    warmupMatches:result.warmupMatches,
    actions:result.actions,
    domChecks:result.domChecks,
    errorCount:result.errors.length,
    domViolationCount:result.domViolations.length,
    oracleViolationCount:result.oracleViolations.length,
    crossSeatViolationCount:result.crossSeatViolations.length,
    presentationTimingViolationCount:result.presentationTimingViolations.length,
    fallbackActionCount:result.fallbackActions,
    lastStage:result.lastStage,
    releaseGate:result.releaseGate,
    recentErrors:result.errors.slice(-12),
    recentDomViolations:result.domViolations.slice(-12),
    recentOracleViolations:result.oracleViolations.slice(-12),
    recentCrossSeatViolations:result.crossSeatViolations.slice(-12),
    lastCheckpoint:result.checkpoints.at(-1) || null,
    lastMatch:result.matches.at(-1) || null
  };
}
async function publishElectronDiagnostic(force){
  const api = globalThis.FateElectronDiagnostics;
  if(!api || electronDiagnosticInFlight || (!force && Date.now() - lastElectronDiagnosticAt < 3000)) return;
  electronDiagnosticInFlight = true;
  lastElectronDiagnosticAt = Date.now();
  const sessionId = `phase7-e2e-${runId}-${seat}`;
  try{
    if(!electronDiagnosticStarted){
      await api.startUiMinuteLog({sessionId, kind:'phase7-full-ui-e2e', runId, seat});
      electronDiagnosticStarted = true;
    }
    // Long campaigns publish every few seconds. Persist a bounded heartbeat
    // instead of repeatedly appending the entire growing in-memory result.
    const snapshot = compactElectronProgress();
    await api.appendUiMinuteLog({type:'phase7-full-ui-e2e-progress', at:new Date().toISOString(), sessionId, result:snapshot});
    if(force && result.finishedAt){
      await api.finishUiMinuteLog({type:'phase7-full-ui-e2e-finish', at:new Date().toISOString(), sessionId, result:snapshot});
    }
  }catch(_){
    // The hidden DOM status remains available when diagnostics are unavailable.
  }finally{
    electronDiagnosticInFlight = false;
  }
}
// Game events can be quiet while the opponent is choosing. Keep an independent
// disk heartbeat so the detached supervisor distinguishes a healthy waiting
// client from a suspended or crashed renderer.
const electronHeartbeatTimer = globalThis.setInterval(function(){
  publishElectronDiagnostic(false);
}, 3000);

function note(map, key, amount = 1){
  const value = String(key || 'unknown');
  map[value] = (Number(map[value]) || 0) + (Number(amount) || 0);
}

const CANARY_CONTRACTS = Object.freeze({
  NORMAL_SET:()=>Number(result.commandTypes.SET_CARD || 0) > 0,
  CONSOLIDATION:()=>Number(result.commandTypes.CONSOLIDATE_CARD || 0) > 0 && Number(result.eventTypes.CARD_CONSOLIDATED || 0) > 0,
  BOARD_TARGET:()=>Number(result.promptTypes.BOARD_TARGET || 0) > 0,
  CANCEL_WITHOUT_MUTATION:()=>Number(result.answerVariants.CANCEL || 0) > 0,
  MOVEMENT:()=>Number(result.commandTypes.MOVE_CARD || 0) > 0 || Number(result.eventTypes.CARD_MOVED || 0) > 0,
  REACTION:()=>Number(result.promptTypes.REACTION || 0) > 0 && Number(result.eventTypes.EFFECT_REACTED || 0) > 0,
  COPIED_EFFECT:()=>['37','75','bh05'].some(id=>Number(result.effectEventCardIds[id] || 0) > 0),
  CONTINUOUS_FATE:()=>Object.keys(result.oracleCardBranches).some(key=>key.endsWith('|CONTINUOUS_CONDITION_TRUE'))
    && Object.keys(result.oracleCardBranches).some(key=>key.endsWith('|CONTINUOUS_CONDITION_FALSE')),
  LANDSCAPE:()=>Object.keys(result.landscapeBranches).length > 0,
  ENDGAME:()=>result.matches.some(match=>!!match.outcome)
});

function refreshOperationalGates(){
  const missing = Object.entries(CANARY_CONTRACTS).filter(([,test])=>!test()).map(([key])=>key);
  result.canaryStatus = {passed:missing.length === 0, missing};
  const reasons = [];
  if(!result.canaryStatus.passed) reasons.push('INTERACTION_CANARIES_NOT_CLEAN');
  if(result.consecutiveCleanMatches < 30) reasons.push('THIRTY_CONSECUTIVE_CLEAN_MATCHES_REQUIRED');
  if(result.fallbackActions > 0) reasons.push('DIAGNOSTIC_FALLBACK_USED');
  if(result.failedGames > 0) reasons.push('FAILED_OR_STALLED_SCENARIOS');
  if(!result.certificationEligible) reasons.push('NON_SHIPPING_PRESENTATION_MODE');
  if(result.oracleViolations.length > 0) reasons.push('UNRESOLVED_ORACLE_FINDING');
  if(result.domViolations.length > 0) reasons.push('RENDERED_UI_ORACLE_VIOLATION');
  if(result.crossSeatViolations.length > 0) reasons.push('CROSS_SEAT_DIVERGENCE');
  if(result.presentationTimingViolations.length > 0) reasons.push('PRESENTATION_CONTRACT_VIOLATION');
  const incompleteCards = Object.values(result.organicTargetCoverage).filter(coverage=>!coverage.automaticEvidencePassed).length;
  if(organicCardCampaign && incompleteCards > 0) reasons.push('DESIGNED_CARD_EVIDENCE_INCOMPLETE');
  result.releaseGate = {passed:reasons.length === 0, reasons, incompleteCards};
}

function classifyFailure(message, details = {}){
  const haystack = `${message || ''} ${details.stage || ''} ${details.failureKind || ''} ${details.code || ''}`.toLowerCase();
  if(/network|websocket|authority url|matchmaking|fetch|connection|timeout.*server/.test(haystack)) return 'INFRASTRUCTURE_NETWORK';
  if(/presentation|cinematic|overlay|modal gate|consolidation.*motion|result animation/.test(haystack)) return 'PRESENTATION_ORDER';
  if(/oracle false positive/.test(haystack)) return 'ORACLE_FALSE_POSITIVE';
  if(/projection|revision|canonical.*ui|active player|private.*leak|cross.seat|legal command.*available/.test(haystack)) return 'SERVER_CLIENT_SYNC';
  if(/oracle|illegal|not legal|invalid reaction|wrong owner|wrong controller|fate/.test(haystack)) return 'GAME_RULE';
  if(/synthetic|hit map|test driver|coordinate|ui drive|gesture|pointer/.test(haystack)) return 'TEST_DRIVER';
  return 'SHIPPING_UI';
}

function publicCrossSeatSnapshot(view){
  const state = view?.state || {};
  const players = (state.players || []).map(player=>({
    id:String(player?.id || ''),
    handCount:Number(player?.handCount ?? player?.hand?.length ?? 0),
    deckCount:Number(player?.deckCount ?? player?.deck?.length ?? 0),
    discard:(player?.discard || []).map(card=>String(card?.iid || card?.id || '')).sort()
  }));
  const board = (state.board || []).map(zone=>(zone || []).map(row=>(row || []).map(card=>card ? {
    iid:String(card.iid || ''), id:card.faceDown ? '' : String(card.id || ''), owner:Number(card.owner), controller:Number(card.controller ?? card.owner),
    fate:Number(card.fate || 0), faceDown:!!card.faceDown, statuses:[...(card.statuses || [])].map(String).sort()
  } : null)));
  return stableCommandValue({
    matchId:String(state.matchId || ''), revision:Number(state.revision ?? view?.revision ?? 0), phase:String(state.phase || ''),
    turn:Number(state.turn || 0), activePlayer:Number(state.activePlayer), landscapeId:String(state.landscapeId || ''),
    outcome:state.outcome || null, players, board,
    pendingPrompt:state.pendingPrompt ? {type:String(state.pendingPrompt.type || ''), playerIndex:Number(state.pendingPrompt.playerIndex)} : null,
    pendingHandLimit:state.pendingHandLimit ? {playerIndex:Number(state.pendingHandLimit.playerIndex), required:Number(state.pendingHandLimit.required || 0)} : null,
    statuses:(state.statuses || []).map(status=>stableCommandValue({
      type:String(status?.type || ''), playerIndex:Number(status?.playerIndex), zone:Number(status?.zone),
      cardIid:String(status?.cardIid || status?.sourceIid || ''), value:Number(status?.value || 0)
    }))
  });
}

function exchangeCrossSeatSnapshot(view){
  const state = view?.state;
  if(!state?.matchId) return;
  const revision = Number(state.revision ?? view?.revision ?? 0);
  const ownSeat = String(seat).toUpperCase();
  const otherSeat = ownSeat === 'A' ? 'B' : 'A';
  const ownKey = `${CROSS_SEAT_PREFIX}${runId}:${ownSeat}`;
  const otherKey = `${CROSS_SEAT_PREFIX}${runId}:${otherSeat}`;
  const snapshot = publicCrossSeatSnapshot(view);
  try{
    localStorage.setItem(ownKey, JSON.stringify(snapshot));
    const other = JSON.parse(localStorage.getItem(otherKey) || 'null');
    if(other && String(other.matchId || '') === String(state.matchId) && Number(other.revision) === revision){
      result.crossSeatChecks += 1;
      if(JSON.stringify(other) !== JSON.stringify(snapshot)){
        const violation = {at:Date.now(), matchId:String(state.matchId), revision, seat:ownSeat, otherSeat, snapshot, other};
        result.crossSeatViolations.push(violation);
        if(result.crossSeatViolations.length > 100) result.crossSeatViolations.shift();
        recordError('Cross-seat public projection mismatch', {stage:'cross-seat', revision, matchId:String(state.matchId)});
      }
    }
    const opponentIndex = Number(view.playerIndex) === 0 ? 1 : 0;
    if(String(state.landscapeId || '') !== 'igb12' && Object.prototype.hasOwnProperty.call(state.players?.[opponentIndex] || {}, 'hand')){
      result.crossSeatViolations.push({at:Date.now(), matchId:String(state.matchId), revision, seat:ownSeat, detail:'opponent private hand leaked'});
      recordError('Opponent private hand leaked into authoritative player view', {stage:'cross-seat', revision, matchId:String(state.matchId)});
    }
  }catch(error){
    recordError('Cross-seat assertion exchange failed', {stage:'cross-seat', revision, detail:String(error?.message || error)});
  }
}

function writeCheckpoint(nextGameIndex){
  const checkpoint = {
    version:1, runId, seat, nextGameIndex:Number(nextGameIndex), completedGames:result.completedGames,
    warmupMatches:result.warmupMatches, lastMatch:result.matches.at(-1) || null, at:Date.now()
  };
  result.checkpoints.push(checkpoint);
  if(result.checkpoints.length > 30) result.checkpoints.shift();
  try{ localStorage.setItem(`fateAuthorityV3FullUiCheckpoint:${runId}:${seat}`, JSON.stringify(checkpoint)); }catch(_){ }
}

const ABANDON_BARRIER_PREFIX = 'fateAuthorityV3FullUiAbandon';
const FOCUSED_EVIDENCE_PREFIX = 'fateAuthorityV3FullUiFocusedEvidence';
function abandonBarrierKey(matchId, targetSeat){
  return `${ABANDON_BARRIER_PREFIX}:${runId}:${String(matchId || '')}:${String(targetSeat || '').toUpperCase()}`;
}
function writeAbandonBarrier(matchId, gameIndex, reason){
  try{
    localStorage.setItem(abandonBarrierKey(matchId, seat), JSON.stringify({
      runId, seat, matchId:String(matchId || ''), gameIndex:Number(gameIndex),
      reason:String(reason || ''), at:Date.now()
    }));
  }catch(_){ }
}
function readPeerAbandonBarrier(matchId){
  const peerSeat = String(seat).toUpperCase() === 'A' ? 'B' : 'A';
  try{ return JSON.parse(localStorage.getItem(abandonBarrierKey(matchId, peerSeat)) || 'null'); }
  catch(_){ return null; }
}
async function waitForPeerAbandonBarrier(matchId, gameIndex){
  const deadline = Date.now() + Math.max(4000, stallTimeoutMs);
  while(Date.now() < deadline){
    const peer = readPeerAbandonBarrier(matchId);
    if(peer && Number(peer.gameIndex) === Number(gameIndex)) return peer;
    await sleep(50);
  }
  return null;
}

function focusedEvidenceKey(matchId, gameIndex, cardId, targetSeat){
  return `${FOCUSED_EVIDENCE_PREFIX}:${runId}:${String(matchId || '')}:${Number(gameIndex)}:${String(cardId || '')}:${String(targetSeat || '').toUpperCase()}`;
}

async function exchangeFocusedEvidence(matchId, gameIndex, cardId, localEvidence){
  const ownSeat = String(seat).toUpperCase();
  const peerSeat = ownSeat === 'A' ? 'B' : 'A';
  try{
    localStorage.setItem(
      focusedEvidenceKey(matchId, gameIndex, cardId, ownSeat),
      JSON.stringify({...localEvidence, seat:ownSeat, at:Date.now()})
    );
  }catch(_){ }
  const deadline = Date.now() + Math.max(2000, Math.min(6000, stallTimeoutMs));
  while(Date.now() < deadline){
    try{
      const peer = JSON.parse(localStorage.getItem(
        focusedEvidenceKey(matchId, gameIndex, cardId, peerSeat)
      ) || 'null');
      if(peer) return peer;
    }catch(_){ }
    await sleep(25);
  }
  return null;
}

function visibleButtons(){
  return [...document.querySelectorAll('button')].filter(button=>{
    if(button.disabled) return false;
    const style = getComputedStyle(button);
    return style.display !== 'none' && style.visibility !== 'hidden' && button.getClientRects().length > 0;
  });
}

function clickButton(label, contains = false){
  const wanted = String(label || '').trim().toLowerCase();
  const button = visibleButtons().find(candidate=>{
    const text = String(candidate.textContent || '').trim().toLowerCase();
    return contains ? text.includes(wanted) : text === wanted;
  });
  if(!button) return false;
  button.click();
  return true;
}

function captureModalDebug(){
  const modal = document.getElementById('modal');
  return {
    open:!!modal?.classList.contains('on'),
    title:String(document.getElementById('modal-title')?.textContent || ''),
    buttons:visibleButtons().filter(button=>modal?.contains(button)).map(button=>String(button.textContent || '').trim()).slice(0, 20),
    text:String(modal?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500)
  };
}

function dispatchPointerAt(clientX, clientY, forceCanvas = false){
  const target = (forceCanvas ? document.getElementById('fate-match-v2-canvas') : null)
    || document.elementFromPoint(clientX, clientY)
    || document.getElementById('fate-match-v2-canvas')
    || document.body;
  result.lastPointer = {clientX, clientY, forceCanvas, target:String(target?.id || target?.className || target?.tagName || '')};
  const base = {bubbles:true, cancelable:true, composed:true, clientX, clientY, button:0, buttons:1, pointerId:71, pointerType:'mouse', isPrimary:true};
  target.dispatchEvent(new PointerEvent('pointerdown', base));
  target.dispatchEvent(new PointerEvent('pointerup', {...base, buttons:0}));
  target.dispatchEvent(new MouseEvent('click', {...base, buttons:0}));
}

function hitMap(){ return globalThis.FateMatchRendererAdapter?.getHitMap?.() || null; }

function viewportPointForHit(hit){
  const rect = hit?.rect;
  if(!rect) return null;
  const map = hitMap();
  const canvasControls = [
    ...(map?.uiCommands || []),
    ...(map?.handEffectIcons || []),
    ...(map?.piles || [])
  ];
  // Dense production hands expose narrow rotated edges. Sample those edges as
  // well as the card body so a focused card is not declared "unclickable"
  // merely because the old seven center-biased points fall under its neighbor.
  const points = [];
  for(const yRatio of [0.03,0.07,0.12,0.18,0.28,0.42,0.62,0.82]){
    for(const xRatio of [0.03,0.08,0.16,0.28,0.4,0.5,0.6,0.72,0.84,0.92,0.97]){
      points.push([xRatio,yRatio]);
    }
  }
  for(const [xRatio, yRatio] of points){
    const x = rect.x + rect.w * xRatio;
    const y = rect.y + rect.h * yRatio;
    const coveredByCanvasControl = canvasControls.some(control=>{
      if(control === hit) return false;
      const controlRect = control?.rect;
      return controlRect && x >= controlRect.x && x <= controlRect.x + controlRect.w
        && y >= controlRect.y && y <= controlRect.y + controlRect.h;
    });
    if(coveredByCanvasControl) continue;
    const topHandHit = [...(map?.handCards || [])].reverse().find(candidate=>{
      const candidateRect = candidate?.rect;
      return candidateRect && x >= candidateRect.x && x <= candidateRect.x + candidateRect.w
        && y >= candidateRect.y && y <= candidateRect.y + candidateRect.h;
    });
    if(hit.iid && topHandHit && String(topHandHit.iid || '') !== String(hit.iid || '')) continue;
    const target = document.elementFromPoint(x, y);
    if(!target?.closest?.('button, a, input, select, textarea, .side-panel, .hud-panel, .match-side-panel')){
      return {x, y};
    }
  }
  return null;
}

function clickViewportHit(hit){
  const point = viewportPointForHit(hit);
  if(!point) return false;
  dispatchPointerAt(point.x, point.y, true);
  return true;
}

function boardClientPoint(hit){
  const rect = hit?.rect;
  const canvas = document.getElementById('fate-match-v2-canvas');
  if(!rect || !canvas) return null;
  const bounds = canvas.getBoundingClientRect();
  const cssW = Number(canvas.__fateCssW || canvas.clientWidth || bounds.width) || 1;
  const cssH = Number(canvas.__fateCssH || canvas.clientHeight || bounds.height) || 1;
  return {
    x:bounds.left + (rect.x + rect.w / 2) * (bounds.width / cssW),
    y:bounds.top + (rect.y + rect.h / 2) * (bounds.height / cssH)
  };
}

function clickBoardHit(hit, forceCanvas = false){
  const point = boardClientPoint(hit);
  const canvas = document.getElementById('fate-match-v2-canvas');
  const bounds = canvas?.getBoundingClientRect?.();
  result.lastBoardHit = {
    found:!!hit,
    kind:String(hit?.kind || ''),
    z:hit?.z,
    r:hit?.r,
    c:hit?.c,
    rect:hit?.rect || null,
    point,
    canvas:bounds ? {left:bounds.left, top:bounds.top, width:bounds.width, height:bounds.height, cssW:canvas.__fateCssW, cssH:canvas.__fateCssH} : null
  };
  if(!point) return false;
  dispatchPointerAt(point.x, point.y, forceCanvas);
  return true;
}

function clickHandCard(iid){
  const hit = (hitMap()?.handCards || []).find(candidate=>String(candidate?.iid || '') === String(iid || ''));
  result.lastHandHit = {iid:String(iid || ''), found:!!hit, rect:hit?.rect || null, disabled:!!hit?.disabled};
  return clickViewportHit(hit);
}

function hasClickableHandCard(iid){
  const hit = (hitMap()?.handCards || []).find(candidate=>String(candidate?.iid || '') === String(iid || ''));
  return !!viewportPointForHit(hit);
}

function hasRenderedHandCard(iid){
  const hit = (hitMap()?.handCards || []).find(candidate=>String(candidate?.iid || '') === String(iid || ''));
  return !!hit && !hit.disabled && !hit.departing;
}

async function clickHandCardWhenReady(iid, timeoutMs = 2500){
  const ready = await waitFor(()=>hasClickableHandCard(iid), timeoutMs);
  return !!ready && clickHandCard(iid);
}

function clickBoardCard(iid, forceCanvas = false){
  return clickBoardHit((hitMap()?.cards || []).find(hit=>String(hit?.iid || hit?.card?.iid || '') === String(iid || '')), forceCanvas);
}

function clickBoardPosition(destination, forceCanvas = false){
  const map = hitMap();
  const same = hit=>Number(hit?.z) === Number(destination?.z)
    && Number(hit?.r) === Number(destination?.r)
    && Number(hit?.c) === Number(destination?.c);
  return clickBoardHit((map?.cards || []).find(same) || (map?.cells || []).find(same), forceCanvas);
}

function boardPositionForIid(view, iid){
  let found = null;
  for(let z = 0; z < (view?.state?.board || []).length; z += 1){
    for(let r = 0; r < (view.state.board[z] || []).length; r += 1){
      for(let c = 0; c < (view.state.board[z][r] || []).length; c += 1){
        const card = view.state.board[z][r][c];
        if(card && String(card.iid || '') === String(iid || '')) found = {z,r,c,id:String(card.id || '')};
      }
    }
  }
  return found;
}

async function scrollBoardPositionIntoView(view, destination, requiredIid = ''){
  const hasRequiredCard = ()=>!requiredIid || (hitMap()?.cards || []).some(hit=>
    String(hit?.iid || hit?.card?.iid || '') === String(requiredIid)
  );
  if(!destination || (hasBoardPosition(destination) && hasRequiredCard())) return !!destination;
  for(const deltaY of [-1200, 1200, -1200, 1200]){
    const anchor = (hitMap()?.cells || []).find(hit=>Number(hit?.z) === Number(destination.z));
    const point = boardClientPoint(anchor);
    const canvas = document.getElementById('fate-match-v2-canvas');
    if(!point || !canvas) return false;
    const rect = anchor?.rect || {};
    const localX = Number(rect.x || 0) + Number(rect.w || 0) / 2;
    const localY = Number(rect.y || 0) + Number(rect.h || 0) / 2;
    const adapterScrolled = globalThis.FateMatchRendererAdapter?.scrollZoneAtClient?.(localX, localY, deltaY) === true;
    if(!adapterScrolled){
      canvas.dispatchEvent(new WheelEvent('wheel', {
        bubbles:true, cancelable:true, composed:true,
        clientX:point.x, clientY:point.y, deltaY
      }));
    }
    await sleep(180);
    if(hasBoardPosition(destination) && hasRequiredCard()) return true;
  }
  return false;
}

function hasBoardPosition(destination){
  const map = hitMap();
  const same = hit=>Number(hit?.z) === Number(destination?.z)
    && Number(hit?.r) === Number(destination?.r)
    && Number(hit?.c) === Number(destination?.c);
  return !!((map?.cards || []).find(same) || (map?.cells || []).find(same));
}

async function waitForBoardInteraction(destination, timeoutMs = 4500){
  return !!await waitFor(()=>{
    if(!currentUiReady()) return false;
    if(document.getElementById('modal')?.classList.contains('on')) return false;
    return hasBoardPosition(destination);
  }, timeoutMs);
}

function boardPositionIsUnobscured(destination){
  const map = hitMap();
  const same = hit=>Number(hit?.z) === Number(destination?.z)
    && Number(hit?.r) === Number(destination?.r)
    && Number(hit?.c) === Number(destination?.c);
  const hit = (map?.cards || []).find(same) || (map?.cells || []).find(same);
  const point = boardClientPoint(hit);
  if(!point) return false;
  return !(map?.uiCommands || []).some(command=>{
    const rect = command?.rect;
    return rect && point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
  });
}

function clickUiCommand(command){
  const hit = (hitMap()?.uiCommands || []).find(candidate=>String(candidate?.command || '') === String(command || ''));
  const rect = hit?.rect;
  if(!rect) return false;
  dispatchPointerAt(rect.x + rect.w / 2, rect.y + rect.h / 2, true);
  return true;
}

async function waitFor(predicate, timeoutMs = 2500){
  const deadline = Date.now() + timeoutMs;
  while(Date.now() < deadline){
    const value = predicate();
    if(value) return value;
    await sleep(20);
  }
  return null;
}

const cardIdByIid = new Map();
const seenPresentationBatchIds = new Set();

function rememberCard(card){
  const iid = String(card?.iid || '');
  const id = String(card?.id || '');
  if(iid && id) cardIdByIid.set(iid, id);
}

function rememberViewCards(view){
  for(const player of (view?.state?.players || [])){
    for(const zone of ['hand','deck','discard']) for(const card of (player?.[zone] || [])) rememberCard(card);
  }
  for(const card of (view?.privateActionCards || [])) rememberCard(card);
  for(const zone of (view?.state?.board || [])) for(const row of (zone || [])) for(const card of (row || [])) rememberCard(card);
}

function sourceCardId(view, iid){
  rememberViewCards(view);
  for(const player of (view?.state?.players || [])){
    for(const zone of ['hand','deck','discard']){
      const card = (player?.[zone] || []).find(candidate=>String(candidate?.iid || '') === String(iid || ''));
      if(card) return String(card.id || '');
    }
  }
  for(const zone of (view?.state?.board || [])) for(const row of (zone || [])) for(const card of (row || [])){
    if(card && String(card.iid || '') === String(iid || '')) return String(card.id || '');
  }
  return String(cardIdByIid.get(String(iid || '')) || '');
}

function captureTargetAvailability(view, stage = 'revision'){
  const targets = matchStart?.organicTargets?.length
    ? matchStart.organicTargets
    : queuedOrganicTargets;
  if(!view?.state || !targets?.length) return null;
  const matchId = String(view.state.matchId || '');
  const revision = Number(view.state.revision ?? view.revision ?? 0);
  const key = `${matchId}:${revision}:${String(stage || '')}`;
  if(key === lastTargetAvailabilityKey) return result.lastTargetAvailabilityDiagnostic;
  lastTargetAvailabilityKey = key;
  rememberViewCards(view);
  const targetSet = new Set(targets.map(String));
  const locations = Object.fromEntries(targets.map(id=>[String(id), []]));
  const recordLocation = (card, location)=>{
    const id = String(card?.id || sourceCardId(view, card?.iid) || '');
    if(!targetSet.has(id)) return;
    locations[id].push({
      ...location,
      iid:String(card?.iid || ''),
      id,
      type:String(card?.type || ''),
      fate:Number(card?.fate ?? card?.baseFate ?? 0),
      reinforcementCost:Number(card?.reinforcementCost ?? card?.cost ?? 0)
    });
  };
  for(let playerIndex = 0; playerIndex < (view.state.players || []).length; playerIndex += 1){
    const player = view.state.players[playerIndex] || {};
    for(const pile of ['hand','deck','discard']){
      (player[pile] || []).forEach((card, index)=>recordLocation(card, {kind:'pile', playerIndex, pile, index}));
    }
  }
  for(let zoneIndex = 0; zoneIndex < (view.state.board || []).length; zoneIndex += 1){
    const zone = view.state.board[zoneIndex] || [];
    for(let rowIndex = 0; rowIndex < zone.length; rowIndex += 1){
      (zone[rowIndex] || []).forEach((card, slotIndex)=>recordLocation(card, {
        kind:'board', zoneIndex, rowIndex, slotIndex,
        owner:Number(card?.owner), controller:Number(card?.controller)
      }));
    }
  }
  (view.privateActionCards || []).forEach((card, index)=>recordLocation(card, {kind:'private-action', index}));
  const renderedHandIids = new Set((hitMap()?.handCards || []).map(hit=>String(hit?.iid || '')));
  const summarizedCommands = (view.legalCommands || []).map(command=>{
    const payload = command?.payload || {};
    const iids = [
      payload.cardIid,
      payload.sourceIid,
      payload.reactionIid,
      ...(payload.tributeIids || []),
      ...(payload.discardedIids || [])
    ].filter(value=>value !== undefined && value !== null && String(value) !== '').map(String);
    const cardIds = [...new Set(iids.map(iid=>sourceCardId(view, iid)).filter(Boolean))];
    return {
      type:String(command?.type || ''),
      iids,
      cardIds,
      targets:cardIds.filter(id=>targetSet.has(id))
    };
  });
  const commands = summarizedCommands.filter(command=>command.targets.length);
  const localPlayerIndex = Number(view.playerIndex);
  const localPlayer = view.state.players?.[localPlayerIndex] || {};
  const boardCards = [];
  for(let zoneIndex = 0; zoneIndex < (view.state.board || []).length; zoneIndex += 1){
    const zone = view.state.board[zoneIndex] || [];
    for(let rowIndex = 0; rowIndex < zone.length; rowIndex += 1){
      (zone[rowIndex] || []).forEach((card, slotIndex)=>boardCards.push({
        id:String(card?.id || sourceCardId(view, card?.iid) || ''),
        iid:String(card?.iid || ''),
        type:String(card?.type || ''),
        owner:Number(card?.owner),
        controller:Number(card?.controller),
        zoneIndex,
        rowIndex,
        slotIndex
      }));
    }
  }
  const diagnostic = {
    at:Date.now(),
    stage:String(stage || ''),
    gameIndex:Number(matchStart?.gameIndex ?? currentOrganicGameIndex()),
    matchId,
    revision,
    turn:Number(view.state.turn || 0),
    phase:String(view.state.phase || ''),
    playerIndex:Number(view.playerIndex),
    activePlayer:Number(view.state.activePlayer),
    testRules:view.state.testRules || null,
    pendingPrompt:view.state.pendingPrompt ? {
      type:String(view.state.pendingPrompt.type || ''),
      playerIndex:Number(view.state.pendingPrompt.playerIndex),
      sourceIid:String(view.state.pendingPrompt.sourceIid || '')
    } : null,
    targets:[...targetSet],
    locations,
    localHand:(localPlayer.hand || []).map(card=>({
      id:String(card?.id || sourceCardId(view, card?.iid) || ''),
      iid:String(card?.iid || ''),
      type:String(card?.type || ''),
      rendered:renderedHandIids.has(String(card?.iid || ''))
    })),
    boardCards,
    renderedHand:Object.fromEntries(targets.map(id=>[
      String(id),
      (locations[String(id)] || []).some(entry=>entry.pile === 'hand' && renderedHandIids.has(entry.iid))
    ])),
    legalCommandTypes:Object.fromEntries(summarizedCommands.reduce((entries, command)=>{
      entries.set(command.type, Number(entries.get(command.type) || 0) + 1);
      return entries;
    }, new Map())),
    legalActionCards:summarizedCommands.filter(command=>command.iids.length).slice(0, 80),
    legalCommands:commands
  };
  result.lastTargetAvailabilityDiagnostic = diagnostic;
  result.targetAvailabilityDiagnostics.push(diagnostic);
  if(result.targetAvailabilityDiagnostics.length > 60) result.targetAvailabilityDiagnostics.shift();
  publish();
  return diagnostic;
}

function effectBranchKey(event){
  return [
    String(event?.type || 'UNKNOWN_EVENT'),
    String(event?.timing || ''),
    String(event?.mode || event?.choice || ''),
    String(event?.status || event?.statusType || ''),
    String(event?.reason || '')
  ].filter(Boolean).join('|');
}

function eventLandscapeId(event){
  const direct = String(event?.landscapeId || event?.sourceCardId || '');
  if(/^igb(?:[1-9]|1[0-9]|20)$/.test(direct)) return direct;
  const sourceMatch = String(event?.sourceIid || '').match(/^landscape:(igb(?:[1-9]|1[0-9]|20))$/);
  if(sourceMatch) return sourceMatch[1];
  const reasonMatch = String(event?.reason || '').match(/LANDSCAPE_(IGB(?:[1-9]|1[0-9]|20))/i);
  return reasonMatch ? reasonMatch[1].toLowerCase() : '';
}

function ingestPresentationBatch(view){
  rememberViewCards(view);
  const batch = view?.presentationBatch;
  const batchId = String(batch?.id || '');
  if(!batchId || seenPresentationBatchIds.has(batchId)) return;
  seenPresentationBatchIds.add(batchId);
  const oracleAudit = auditRuleOraclePresentationBatch(view, batch);
  result.oracleChecks += Number(oracleAudit.checks || 0);
  for(const [cardId, count] of Object.entries(oracleAudit.cardChecks || {})){
    note(result.oracleCardChecks, cardId, Number(count || 0));
  }
  for(const violation of (oracleAudit.violations || [])){
    result.oracleViolations.push({
      ...violation,
      matchId:String(view?.state?.matchId || ''),
      revision:Number(view?.state?.revision ?? view?.revision ?? 0),
      seat
    });
  }
  const oracleViolationCardIds = new Set((oracleAudit.violations || []).map(violation=>String(violation?.cardId || '')));
  for(const event of (batch.events || [])){
    const eventType = String(event?.type || 'UNKNOWN_EVENT');
    note(result.eventTypes, eventType);
    const landscapeId = eventLandscapeId(event);
    if(landscapeId){
      note(result.landscapeBranches, `${landscapeId}|${effectBranchKey(event)}`);
    }
    const eventSourceIid = eventType === 'EFFECT_REACTED'
      ? event?.reactionIid
      : (event?.effectSourceIid || event?.sourceIid || event?.cardIid);
    const reactionCardId = ({LYDIA:'56',SECULES:'67',HAVANO:'79'})[String(event?.reactionKind || '').toUpperCase()] || '';
    const sourceId = (eventType === 'EFFECT_REACTED' ? '' : String(event?.sourceCardId || ''))
      || sourceCardId(view, eventSourceIid)
      || (eventType === 'EFFECT_REACTED' ? reactionCardId : '')
      || ((eventType === 'EFFECT_ACTIVATED' || eventType === 'EFFECT_REACTED') ? String(event?.cardId || '') : '');
    if(sourceId && ['CARD_SET','CARD_CONSOLIDATED'].includes(eventType)){
      note(result.observedActionCardIds, sourceId);
    }
    if(eventType === 'EFFECT_ACTIVATED' && eventSourceIid){
      const activationKey = `${String(view?.state?.matchId || '')}|${String(eventSourceIid)}`;
      successfulActivationCounts.set(activationKey, Number(successfulActivationCounts.get(activationKey) || 0) + 1);
    }
    if(sourceId){
      note(result.effectEventCardIds, sourceId);
      if(eventType === 'EFFECT_RESOLVED') note(result.resolvedEffectCardIds, sourceId);
      note(result.effectBranches, `${sourceId}|${effectBranchKey(event)}`);
      if(focusedCardIdSet.has(sourceId)){
        note(result.focusEffectBranches, `${sourceId}|${effectBranchKey(event)}`);
      }
      if(queuedOrganicTargets.includes(sourceId) && !oracleViolationCardIds.has(sourceId)){
        const stateObligations = cardCertificationObligations(sourceId).filter(value=>value.startsWith('STATE:'));
        if(eventType === 'EFFECT_RESOLVED'){
          for(const obligation of stateObligations.filter(value=>value === 'STATE:PUBLIC_STATE_MATCHES_PRINTED_RESULT')){
            recordRuleObligationEvidence(sourceId, obligation, {
              probe:'AUTHORITATIVE_RESOLUTION_PASSED_RULE_ORACLE',
              batchId,
              sourceIid:String(eventSourceIid || '')
            });
          }
        }
        if(sourceId === '02' && eventType === 'SAFE_ROW_ADDED'){
          const sourceCard = canonicalBoardEntries(view?.state).find(entry=>String(entry.card?.iid || '') === String(eventSourceIid || ''))?.card;
          const controller = sourceCard?.controller ?? sourceCard?.owner;
          const rowOwner = Number(view?.state?.geometry?.rowOwners?.[Number(event?.zone)]?.[Number(event?.row)]);
          const squares = (view?.state?.geometry?.playableExtraSquares || []).filter(square=>Number(square?.z) === Number(event?.zone) && Number(square?.r) === Number(event?.row));
          if(Number(event?.playerIndex) === Number(controller) && rowOwner === Number(controller) && squares.length === 3 && squares.every(square=>Number(square.owner) === Number(controller))){
            for(const obligation of stateObligations){
              recordRuleObligationEvidence(sourceId, obligation, {probe:'ANICKA_CANONICAL_ROW_GEOMETRY',batchId,zone:Number(event.zone),row:Number(event.row)});
            }
          }
        }
        if(sourceId === '03' && eventType === 'FATE_CHANGED'){
          const sourceActivations = (batch.events || []).filter(candidate=>String(candidate?.type || '').toUpperCase() === 'EFFECT_ACTIVATED' && String(candidate?.sourceIid || '') === String(eventSourceIid || ''));
          const sourceChanges = (batch.events || []).filter(candidate=>String(candidate?.type || '').toUpperCase() === 'FATE_CHANGED' && String(candidate?.effectSourceIid || candidate?.sourceIid || '') === String(eventSourceIid || ''));
          const sourceCard = canonicalBoardEntries(view?.state).find(entry=>String(entry.card?.iid || '') === String(eventSourceIid || ''))?.card;
          if(sourceActivations.length === 1 && sourceChanges.length === 1 && Number(event.after) === Number(event.before) * 2 + 5 && Number(sourceCard?.counters?.effectUses) === 1){
            for(const obligation of stateObligations){
              recordRuleObligationEvidence(sourceId, obligation, {probe:'HOWARD_SINGLE_EXACT_MUTATION',batchId,before:Number(event.before),after:Number(event.after)});
            }
          }
        }
        if(sourceId === '05' && eventType === 'FATE_CHANGED' && Number(event.after) - Number(event.before) === 3){
          for(const obligation of stateObligations.filter(value=>value === 'STATE:ONE_FATE_CHANGED_WITH_DELTA_PLUS_3')){
            recordRuleObligationEvidence(sourceId, obligation, {probe:'BRITISH_REGIMENT_EXACT_PLUS_THREE',batchId,before:Number(event.before),after:Number(event.after)});
          }
        }
      }
      if(queuedOrganicTargets.includes(sourceId) && eventType === 'PROMPT_CANCELLED'){
        for(const obligation of cardCertificationObligations(sourceId).filter(value=>/CANCEL/.test(value))){
          recordRuleObligationEvidence(sourceId, obligation, {
            probe:'CANCEL_WITHOUT_DEFAULT_MUTATION',
            batchId,
            promptId:String(event?.promptId || '')
          });
        }
      }
      if(queuedOrganicTargets.includes(sourceId) && eventType === 'EFFECT_SKIPPED'){
        const pendingSource = String(view?.state?.pendingPrompt?.sourceIid || '');
        const activated = (batch.events || []).some(candidate=>
          String(candidate?.type || '').toUpperCase() === 'EFFECT_ACTIVATED'
          && String(candidate?.sourceIid || '') === String(event?.sourceIid || '')
        );
        const mutationTypes = new Set(['CARD_DRAWN','CARD_DISCARDED','CARD_MOVED','CARD_TRANSFERRED','FATE_CHANGED','STATUS_CREATED','SAFE_ROW_ADDED','SAFE_SQUARE_ADDED','TOKENS_CREATED','CONTROL_CHANGED']);
        const leakedMutation = (batch.events || []).some(candidate=>
          mutationTypes.has(String(candidate?.type || '').toUpperCase())
          && String(candidate?.sourceIid || candidate?.effectSourceIid || '') === String(event?.sourceIid || '')
        );
        if((!pendingSource || pendingSource !== String(event?.sourceIid || '')) && !activated && !leakedMutation){
          for(const obligation of cardCertificationObligations(sourceId).filter(value=>
            value === 'BRANCH:INELIGIBLE_OR_EMPTY_CASE'
            || value.startsWith('PREREQUISITE:')
            || value === 'FORBIDDEN:EFFECT_TRIGGERS_WITHOUT_PRINTED_PREREQUISITE'
          )){
            recordRuleObligationEvidence(sourceId, obligation, {
              probe:'INELIGIBLE_EFFECT_SKIPPED_CLEANLY',
              batchId,
              reason:String(event?.reason || '')
            });
          }
        }
      }
      if(queuedOrganicTargets.includes(sourceId) && eventType === 'EFFECT_BLOCKED'){
        const reacted = (batch.events || []).find(candidate=>
          String(candidate?.type || '').toUpperCase() === 'EFFECT_REACTED'
          && String(candidate?.sourceIid || '') === String(event?.sourceIid || '')
        );
        const reactingCardId = reacted
          ? (sourceCardId(view, reacted?.reactionIid)
            || ({LYDIA:'56',SECULES:'67',HAVANO:'79'})[String(reacted?.reactionKind || '').toUpperCase()]
            || '')
          : '';
        const mutationTypes = new Set(['CARD_DRAWN','CARD_DISCARDED','CARD_MOVED','CARD_TRANSFERRED','FATE_CHANGED','STATUS_CREATED','SAFE_ROW_ADDED','SAFE_SQUARE_ADDED','TOKENS_CREATED','CONTROL_CHANGED']);
        const leakedMutation = (batch.events || []).some(candidate=>
          mutationTypes.has(String(candidate?.type || '').toUpperCase())
          && String(candidate?.sourceIid || candidate?.effectSourceIid || '') === String(event?.sourceIid || '')
        );
        const pendingSource = String(view?.state?.pendingPrompt?.sourceIid || '');
        if(reacted && queuedOrganicPartners.includes(reactingCardId) && !leakedMutation && pendingSource !== String(event?.sourceIid || '')){
          for(const obligation of cardCertificationObligations(sourceId).filter(value=>
            /NEGAT|SUPPRESS|BLOCKED_EFFECT|PENDING_EFFECT|RESOLVES_ANYWAY/.test(value)
          )){
            recordRuleObligationEvidence(sourceId, obligation, {
              probe:'REACTION_BLOCKED_WITHOUT_MUTATION',
              batchId,
              mode:String(reacted?.mode || '')
            });
          }
        }
      }
    }
  }
}

const AUTHORITY_STATUS_BANNER_RULES = Object.freeze({
  FORT_CALVIN_WATCHER:Object.freeze({cardId:'71', groupClass:'effect-pill-fort-calvin', requiresRemaining:true}),
  SUPPORTER_EFFECTS_BLOCKED:Object.freeze({cardId:'18', groupClass:'effect-pill-semper', requiresRemaining:true}),
  ZONE_ACTIONS_BLOCKED:Object.freeze({cardId:'50', groupClass:'effect-pill-berkeley', requiresRemaining:true}),
  LANDSCAPE_CHANGE_BLOCKED:Object.freeze({cardId:'91', groupClass:'effect-pill-house', requiresRemaining:true}),
  NEXT_CHARACTER_HAND_ARRIVAL:Object.freeze({cardId:'33', groupClass:'effect-pill-wci', requiresRemaining:false}),
  RIVERA_AFFILIATION_BONUS:Object.freeze({cardId:'51', groupClass:'effect-pill-rivera', requiresRemaining:true}),
  CONSOLIDATION_FATE_BONUS:Object.freeze({cardId:'87', groupClass:'effect-pill-music', requiresRemaining:false}),
  CONSOLIDATION_COST_MODIFIER:Object.freeze({cardId:'97', groupClass:'effect-pill-administrative-bloat', requiresRemaining:true}),
  DELAYED_HAND_DELIVERY:Object.freeze({cardId:'94', groupClass:'effect-pill-mail', requiresRemaining:true}),
  SUPPORTERS_AS_CHARACTERS:Object.freeze({cardId:'99', groupClass:'effect-pill-blame-game', requiresRemaining:true}),
  SELVA_EXTRA_SUPPORTER:Object.freeze({cardId:'74', groupClass:'effect-pill-selva', requiresRemaining:true}),
  MAJA_EXTRA_SUPPORTERS:Object.freeze({cardId:'07', groupClass:'effect-pill-maja', requiresRemaining:true}),
  FACE_DOWN_CONSOLIDATION_PERMISSION:Object.freeze({cardId:'78', groupClass:'effect-pill-chaparral', requiresRemaining:true}),
  MOVEMENT_GRANT:Object.freeze({cardId:'69', groupClass:'effect-pill-busser', requiresRemaining:true})
});

function normalizedUiText(value){
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cardDefinition(cardId){
  return (globalThis.FATE_CARD_DEFINITIONS || []).find(card=>String(card?.id || '') === String(cardId || '')) || null;
}

function effectGroupKey(effect){
  const semanticGroupClass = normalizedUiText(effect?.groupClass)
    .split(' ')
    .filter(className=>className && className !== 'effect-pill-flex-tail')
    .join(' ');
  return [
    String(effect?.side || ''),
    normalizedUiText(effect?.cardName).toLowerCase(),
    normalizedUiText(effect?.ability).replace(/\s+×\d+$/u, '').toLowerCase(),
    semanticGroupClass.toLowerCase()
  ].join('|');
}

function renderedEffectPills(){
  const out = [];
  for(const [containerId, side] of [['tp-status-left','left'], ['tp-status-right','right']]){
    const container = document.getElementById(containerId);
    for(const pill of (container ? [...container.children] : [])){
      if(!pill.classList?.contains('effect-pill')) continue;
      if(pill.classList.contains('effect-pill-overflow')){
        for(const effect of (pill._statusOverflowEffects || [])){
          out.push({
            side,
            cardName:String(effect?.cardName || ''),
            ability:String(effect?.cardAbility || effect?.label || ''),
            groupClass:String(effect?.extraClass || ''),
            count:Math.max(1, Number(effect?.effectInstanceCount) || 1),
            label:String(effect?.label || ''),
            iconHtml:String(effect?.icon || ''),
            overflow:true
          });
        }
        continue;
      }
      const icon = pill.querySelector('.effect-pill-icon');
      out.push({
        side,
        cardName:String(pill.dataset.effectCardName || pill.querySelector('.ept-name')?.textContent || ''),
        ability:String(pill.dataset.effectAbility || pill.querySelector('.ept-ability')?.textContent || pill.querySelector('.effect-pill-label')?.textContent || ''),
        groupClass:String(pill.dataset.effectGroupClass || ''),
        count:Math.max(1, Number(pill.dataset.effectCount) || 1),
        label:String(pill.querySelector('.effect-pill-label')?.textContent || ''),
        iconHtml:String(icon?.innerHTML || ''),
        sourceIid:String(pill.dataset.effectSourceIid || ''),
        statusKey:String(pill.dataset.effectStatusKey || ''),
        overflow:false
      });
    }
  }
  return out;
}

function canonicalBoardEntries(state){
  const entries = [];
  for(let z = 0; z < (state?.board || []).length; z += 1){
    for(let r = 0; r < (state.board[z] || []).length; r += 1){
      for(let c = 0; c < (state.board[z][r] || []).length; c += 1){
        const card = state.board[z][r][c];
        if(card) entries.push({card,z,r,c});
      }
    }
  }
  return entries;
}

function commandSelectedIids(command){
  const payload = command?.payload || {};
  return [
    payload.selectedIid,
    payload.targetIid,
    ...(payload.selectedIids || []),
    ...(payload.cardIids || [])
  ].filter(value=>value !== undefined && value !== null && String(value) !== '').map(String);
}

function auditNegativePromptObligations(view){
  if(!organicCardCampaign) return;
  const prompt = view?.state?.pendingPrompt;
  if(!prompt || Number(prompt.playerIndex) !== Number(view.playerIndex)) return;
  const sourceIid = String(prompt.sourceIid || '');
  const sourceEntry = canonicalBoardEntries(view.state).find(entry=>String(entry.card?.iid || '') === sourceIid);
  const cardId = String(sourceEntry?.card?.id || sourceCardId(view, sourceIid) || '');
  if(!queuedOrganicTargets.includes(cardId)) return;
  const rule = cardRuleOracle(cardId);
  if(!rule) return;
  const answers = (view.legalCommands || []).filter(command=>command.type === 'ANSWER_PROMPT');
  const selected = new Set(answers.flatMap(commandSelectedIids));
  if(!selected.size) return;
  const board = canonicalBoardEntries(view.state);
  const sourceController = Number(sourceEntry?.card?.controller ?? sourceEntry?.card?.owner);
  const scope = String(rule.target || '').toUpperCase();
  const opponent = sourceController === 0 ? 1 : 0;
  const controllerOf = entry=>Number(entry?.card?.controller ?? entry?.card?.owner);
  const canTargetOpponent = /OPPONENT|ANYWHERE|ANY_EFFECT|SELECTED_CARD/.test(scope);

  if(canTargetOpponent){
    const immuneOpponentCards = board.filter(entry=>
      controllerOf(entry) === opponent
      && (['20','76'].includes(String(entry.card?.id || ''))
        || entry.card?.immuneFlag === true
        || entry.card?.opponentEffectImmune === true)
    );
    const hasSelectableOpponent = board.some(entry=>controllerOf(entry) === opponent && selected.has(String(entry.card?.iid || '')));
    if(immuneOpponentCards.length && hasSelectableOpponent
      && immuneOpponentCards.every(entry=>!selected.has(String(entry.card?.iid || '')))){
      for(const obligation of cardCertificationObligations(cardId).filter(value=>/IMMUNE|INELIGIBLE/.test(value))){
        recordRuleObligationEvidence(cardId, obligation, {
          probe:'IMMUNE_TARGET_EXCLUSION',
          promptId:String(prompt.promptId || ''),
          excludedIids:immuneOpponentCards.map(entry=>String(entry.card.iid))
        });
      }
    }
  }

  const wrongControllerCards = board.filter(entry=>{
    const controller = controllerOf(entry);
    if(scope.includes('OPPONENT')) return controller === sourceController;
    if(scope.includes('CONTROLLER')) return controller === opponent;
    return false;
  });
  const hasCorrectControllerTarget = board.some(entry=>{
    const controller = controllerOf(entry);
    const correct = scope.includes('OPPONENT') ? controller === opponent : controller === sourceController;
    return correct && selected.has(String(entry.card?.iid || ''));
  });
  if(wrongControllerCards.length && hasCorrectControllerTarget
    && wrongControllerCards.every(entry=>!selected.has(String(entry.card?.iid || '')))){
    for(const obligation of cardCertificationObligations(cardId).filter(value=>
      /OPPONENT|CONTROLLER|OWNER|WRONG_PLAYER|WRONG_HAND/.test(value)
    )){
      recordRuleObligationEvidence(cardId, obligation, {
        probe:'CONTROL_DIRECTION_EXCLUSION',
        promptId:String(prompt.promptId || ''),
        excludedIids:wrongControllerCards.map(entry=>String(entry.card.iid))
      });
    }
  }

  if((scope.includes('SOURCE_ZONE') || scope.includes('IN_SOURCE_ZONE')) && Number.isInteger(Number(sourceEntry?.z))){
    const outside = board.filter(entry=>Number(entry.z) !== Number(sourceEntry.z));
    const hasInsideTarget = board.some(entry=>Number(entry.z) === Number(sourceEntry.z) && selected.has(String(entry.card?.iid || '')));
    if(outside.length && hasInsideTarget && outside.every(entry=>!selected.has(String(entry.card?.iid || '')))){
      for(const obligation of cardCertificationObligations(cardId).filter(value=>/OUTSIDE_SOURCE_ZONE|TARGET_OUTSIDE.*ZONE/.test(value))){
        recordRuleObligationEvidence(cardId, obligation, {
          probe:'SOURCE_ZONE_EXCLUSION',
          promptId:String(prompt.promptId || ''),
          sourceZone:Number(sourceEntry.z)
        });
      }
    }
  }
}

function auditPileSelectionObligations(view){
  if(!organicCardCampaign) return;
  const prompt = view?.state?.pendingPrompt;
  if(String(prompt?.type || '') !== 'CARD_SELECTION' || Number(prompt?.playerIndex) !== Number(view?.playerIndex)) return;
  const sourceIid = String(prompt?.sourceIid || '');
  const sourceEntry = canonicalBoardEntries(view?.state).find(entry=>String(entry.card?.iid || '') === sourceIid);
  const cardId = String(sourceEntry?.card?.id || sourceCardId(view, sourceIid) || '');
  if(!queuedOrganicTargets.includes(cardId)) return;
  const rule = cardRuleOracle(cardId);
  const target = String(rule?.target || '').toUpperCase();
  const answers = (view?.legalCommands || []).filter(command=>command.type === 'ANSWER_PROMPT' && command.payload?.cancel !== true);
  const selectedIids = new Set(answers.flatMap(commandSelectedIids));
  const offered = (prompt?.eligibleCards || []).filter(card=>selectedIids.has(String(card?.iid || '')));
  if(!offered.length || !offered.every(card=>cardMatchesOracleSelection(card, target, cardId))) return;

  const controller = Number(sourceEntry?.card?.controller ?? sourceEntry?.card?.owner);
  const ownPlayer = view?.state?.players?.[controller] || {};
  let candidateCards = [];
  if(target.includes('DISCARD')) candidateCards = [...(ownPlayer.discard || [])];
  else if(target.includes('HAND')) candidateCards = [...(ownPlayer.hand || [])];
  else if(target.includes('DECK')){
    const queued = result.queuedDecks[result.queuedDecks.length - 1];
    candidateCards = (queued?.deckIds || []).map(cardDefinition).filter(Boolean);
  }
  const ineligible = candidateCards.filter(card=>!cardMatchesOracleSelection(card, target, cardId));
  if(!ineligible.length) return;

  const exclusionPatterns = /NON_SUPPORTER_SELECTED|NON_CHARACTER_SELECTED|WRONG_AFFILIATION|STAR_CARD_ELIGIBLE|NON_TRIANGLE_SELECTED|COPY_OF_SOURCE_SELECTED|DISCARD_STAR_SELECTED/;
  for(const obligation of cardCertificationObligations(cardId).filter(value=>exclusionPatterns.test(value))){
    recordUseLimitProbe(cardId, sourceIid, obligation, 'REAL_PICKER_EXCLUDES_SEEDED_INELIGIBLE_PILE_CARDS', view);
  }

  const maxFromCardinality = /UP_TO_THREE/.test(String(rule?.cardinality || '')) ? 3
    : (/UP_TO_TWO|ZERO_TO_TWO/.test(String(rule?.cardinality || '')) ? 2
      : (/EXACTLY_ONE|ZERO_OR_ONE/.test(String(rule?.cardinality || '')) ? 1 : null));
  const largestSelection = answers.reduce((max, command)=>Math.max(max, new Set(commandSelectedIids(command)).size), 0);
  result.pileAuditSamples.push({
    matchId:String(view?.state?.matchId || ''),
    promptId:String(prompt?.promptId || ''),
    cardId,
    eligibleCount:Number(prompt?.eligibleIids?.length || 0),
    offeredCount:offered.length,
    ineligibleFixtureCount:ineligible.length,
    maxFromCardinality,
    largestLegalSelection:largestSelection
  });
  if(result.pileAuditSamples.length > 50) result.pileAuditSamples.shift();
  if(maxFromCardinality !== null && Number(prompt?.eligibleIids?.length || 0) > maxFromCardinality){
    if(largestSelection <= maxFromCardinality){
      for(const obligation of cardCertificationObligations(cardId).filter(value=>/MORE_THAN_ONE|MORE_THAN_TWO|MORE_THAN_THREE/.test(value))){
        recordUseLimitProbe(cardId, sourceIid, obligation, 'REAL_PICKER_ENFORCES_CARDINALITY_WITH_EXTRA_ELIGIBLE_CHOICES', view);
      }
    }
  }
}

function auditNoTriggerUiObligations(view){
  if(!organicCardCampaign) return;
  const batch = view?.presentationBatch;
  if(!batch?.events?.length) return;
  const mutationTypes = new Set(['CARD_DRAWN','CARD_DISCARDED','CARD_MOVED','CARD_TRANSFERRED','FATE_CHANGED','STATUS_CREATED','SAFE_ROW_ADDED','SAFE_SQUARE_ADDED','TOKENS_CREATED','CONTROL_CHANGED']);
  for(const skipped of batch.events.filter(event=>String(event?.type || '').toUpperCase() === 'EFFECT_SKIPPED')){
    const sourceIid = String(skipped?.sourceIid || '');
    const cardId = sourceCardId(view, sourceIid);
    if(!queuedOrganicTargets.includes(cardId)) continue;
    const activated = batch.events.some(event=>String(event?.type || '').toUpperCase() === 'EFFECT_ACTIVATED' && String(event?.sourceIid || '') === sourceIid);
    const leakedMutation = batch.events.some(event=>mutationTypes.has(String(event?.type || '').toUpperCase()) && String(event?.sourceIid || event?.effectSourceIid || '') === sourceIid);
    const promptOpen = String(view?.state?.pendingPrompt?.sourceIid || '') === sourceIid;
    const modalOpen = document.getElementById('modal')?.classList.contains('on') === true;
    const cinematicVisible = [...document.querySelectorAll('.effect-activation-cinematic')].some(node=>{
      const style = getComputedStyle(node);
      return node.isConnected && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0;
    });
    if(activated || leakedMutation || promptOpen || modalOpen || cinematicVisible) continue;
    for(const obligation of cardCertificationObligations(cardId).filter(value=>
      value === 'FORBIDDEN:EMPTY_SEARCH_OPENS_MODAL'
      || (exactShippingPathMode && (
        value === 'FORBIDDEN:EFFECT_CINEMATIC_WITHOUT_A_LEGAL_RESOLUTION'
        || value === 'PRESENTATION:ACTIVATION_CINEMATIC_ONLY_IF_RESOLUTION_IS_LEGAL'
      ))
    )){
      recordUseLimitProbe(cardId, sourceIid, obligation, 'NO_TARGET_SKIP_LEFT_NO_MODAL_CINEMATIC_OR_MUTATION', view);
    }
  }
}

function projectedPileCount(player, pile){
  const value = player?.[pile];
  if(Array.isArray(value)) return value.length;
  return Number(player?.[`${pile}Count`] || 0) || 0;
}

function hasConservativeActivationPrerequisite(view, sourceEntry, rule){
  const state = view?.state || {};
  const sourceController = Number(sourceEntry?.card?.controller ?? sourceEntry?.card?.owner);
  const player = state.players?.[sourceController] || {};
  const target = String(rule?.target || '').toUpperCase();
  const board = canonicalBoardEntries(state);
  const controllerOf = entry=>Number(entry?.card?.controller ?? entry?.card?.owner);
  if(target.includes('DECK') && projectedPileCount(player, 'deck') < 1) return false;
  if(target.includes('DISCARD') && projectedPileCount(player, 'discard') < 1) return false;
  if(target.includes('OPPONENT_HAND')){
    const opponent = state.players?.[sourceController === 0 ? 1 : 0] || {};
    if(projectedPileCount(opponent, 'hand') < 1) return false;
  }
  if(target.includes('OPPONENT_CARD')){
    const opponent = sourceController === 0 ? 1 : 0;
    if(!board.some(entry=>controllerOf(entry) === opponent)) return false;
  }
  if(target.includes('CONTROLLER_CONTROLS') || target.includes('CARD_CONTROLLER_CONTROLS')){
    if(!board.some(entry=>controllerOf(entry) === sourceController && String(entry.card?.iid || '') !== String(sourceEntry?.card?.iid || ''))) return false;
  }
  if((target.includes('SOURCE_ZONE') || target.includes('IN_SOURCE_ZONE')) && Number.isInteger(Number(sourceEntry?.z))){
    if(!board.some(entry=>Number(entry.z) === Number(sourceEntry.z) && String(entry.card?.iid || '') !== String(sourceEntry?.card?.iid || ''))) return false;
  }
  return true;
}

function recordUseLimitProbe(cardId, sourceIid, obligation, probe, view){
  const key = [String(view?.state?.matchId || ''), String(cardId || ''), String(obligation || ''), String(probe || '')].join('|');
  if(useLimitProbeKeys.has(key)) return;
  useLimitProbeKeys.add(key);
  recordRuleObligationEvidence(cardId, obligation, {
    probe,
    sourceIid:String(sourceIid || ''),
    turn:Number(view?.state?.turn || 0)
  });
}

function auditUseLimitObligations(view){
  if(!organicCardCampaign) return;
  const state = view?.state || {};
  const board = canonicalBoardEntries(state);
  const legal = Array.isArray(view?.legalCommands) ? view.legalCommands : [];
  const prompt = state.pendingPrompt;
  for(const entry of board){
    const cardId = String(entry.card?.id || '');
    if(!queuedOrganicTargets.includes(cardId)) continue;
    const rule = cardRuleOracle(cardId);
    const useLimit = String(rule?.useLimit || '').toUpperCase();
    if(!useLimit || useLimit === 'NO_ADDITIONAL_LIMIT') continue;
    const sourceIid = String(entry.card?.iid || '');
    const controller = Number(entry.card?.controller ?? entry.card?.owner);
    const effectUses = Number(entry.card?.counters?.effectUses || 0);
    const reactionUses = Number(entry.card?.counters?.reactionUses || 0);
    const activationCount = Number(successfulActivationCounts.get(`${String(state.matchId || '')}|${sourceIid}`) || 0);
    const useObligation = `USE_LIMIT:${rule.useLimit}`;

    if(useLimit === 'NO_PRINTED_LIMIT' && activationCount >= 2){
      recordUseLimitProbe(cardId, sourceIid, useObligation, 'REPEATED_ACTIVATION_ACCEPTED_WITHOUT_PRINTED_LIMIT', view);
      continue;
    }

    if((rule?.timing || []).includes('REACTION')){
      const maximum = useLimit === 'THREE_REACTIONS_PER_CARD' ? 3 : (useLimit === 'ONCE_PER_CARD' ? 1 : null);
      if(maximum === null || reactionUses < maximum || String(prompt?.type || '') !== 'REACTION' || Number(prompt?.playerIndex) !== controller) continue;
      const illegallyOffered = legal.some(command=>command.type === 'ANSWER_PROMPT' && String(command.payload?.reactionIid || '') === sourceIid);
      if(!illegallyOffered){
        recordUseLimitProbe(cardId, sourceIid, useObligation, 'REACTION_LIMIT_REMOVES_REAL_PROMPT_OPTION', view);
        for(const obligation of cardCertificationObligations(cardId).filter(value=>/FOURTH_REACTION|SECOND_REACTION/.test(value))){
          recordUseLimitProbe(cardId, sourceIid, obligation, 'REACTION_LIMIT_REMOVES_REAL_PROMPT_OPTION', view);
        }
      }
      continue;
    }

    if(!(rule?.timing || []).includes('ACTIVATE')
      || Number(state.activePlayer) !== controller
      || Number(view?.playerIndex) !== controller
      || prompt
      || state.pendingHandLimit
      || !hasConservativeActivationPrerequisite(view, entry, rule)) continue;
    const reachedPerCardLimit = useLimit === 'ONCE_PER_CARD' && effectUses >= 1
      || useLimit === 'TWO_USES_PER_CARD' && effectUses >= 2;
    const reachedTurnLimit = useLimit === 'ONCE_PER_TURN' && Number(entry.card?.counters?.lastEffectTurn) === Number(state.turn);
    if(!reachedPerCardLimit && !reachedTurnLimit) continue;
    const illegallyOffered = legal.some(command=>command.type === 'ACTIVATE_EFFECT' && String(command.payload?.sourceIid || '') === sourceIid);
    if(!illegallyOffered){
      recordUseLimitProbe(cardId, sourceIid, useObligation, reachedTurnLimit ? 'SAME_TURN_REACTIVATION_NOT_LEGAL' : 'EXHAUSTED_CARD_REACTIVATION_NOT_LEGAL', view);
      for(const obligation of cardCertificationObligations(cardId).filter(value=>/SECOND_ACTIVATION|SECOND_USE_SAME_TURN|MORE_THAN_ONE_USE_PER_TURN|ARMED_TWICE/.test(value))){
        recordUseLimitProbe(cardId, sourceIid, obligation, reachedTurnLimit ? 'SAME_TURN_REACTIVATION_NOT_LEGAL' : 'EXHAUSTED_CARD_REACTIVATION_NOT_LEGAL', view);
      }
    }
  }
}

const TIMED_STATUS_CONTRACTS = Object.freeze({
  SUPPORTER_EFFECTS_BLOCKED:Object.freeze({field:'remainingTargetTurns',initial:1}),
  ZONE_ACTIONS_BLOCKED:Object.freeze({field:'remainingTargetTurns',initial:1}),
  RIVERA_AFFILIATION_BONUS:Object.freeze({field:'remainingOwnerTurns',initial:3}),
  MOVEMENT_GRANT:Object.freeze({field:'remainingOwnerTurns',initial:3}),
  FORT_CALVIN_WATCHER:Object.freeze({field:'remaining',initial:3}),
  FACE_DOWN_CONSOLIDATION_PERMISSION:Object.freeze({field:'remaining',initial:1}),
  LANDSCAPE_CHANGE_BLOCKED:Object.freeze({field:'remainingTargetTurns',initial:5}),
  DELAYED_HAND_DELIVERY:Object.freeze({field:'deliveryTurnsRemaining',initial:4}),
  CONSOLIDATION_COST_MODIFIER:Object.freeze({field:'remaining',initial:2}),
  SUPPORTERS_AS_CHARACTERS:Object.freeze({field:'remainingTargetTurns',initial:5})
});

function auditTimedStatusObligations(view){
  if(!organicCardCampaign) return;
  const state = view?.state || {};
  const matchId = String(state.matchId || '');
  const presentKeys = new Set();
  for(const status of (state.statuses || [])){
    const type = String(status?.statusType || status?.type || '').toUpperCase();
    const contract = TIMED_STATUS_CONTRACTS[type];
    if(!contract) continue;
    const sourceIid = String(status?.sourceIid || '');
    const cardId = sourceCardId(view, sourceIid);
    if(!queuedOrganicTargets.includes(cardId)) continue;
    const statusId = String(status?.statusId || `${type}:${sourceIid}`);
    const key = `${matchId}|${statusId}`;
    presentKeys.add(key);
    const value = Number(status?.[contract.field]);
    if(!Number.isInteger(value) || value < 1) continue;
    let tracker = timedStatusTrackers.get(key);
    if(!tracker){
      tracker = {matchId,statusId,type,cardId,sourceIid,field:contract.field,initial:contract.initial,values:[],credited:false};
      timedStatusTrackers.set(key, tracker);
    }
    if(tracker.values[tracker.values.length - 1] !== value) tracker.values.push(value);
  }
  for(const [key, tracker] of timedStatusTrackers){
    if(tracker.matchId !== matchId || tracker.credited || presentKeys.has(key)) continue;
    const expected = Array.from({length:tracker.initial}, (_value, index)=>tracker.initial - index);
    if(tracker.values.length === expected.length && tracker.values.every((value, index)=>value === expected[index])){
      const obligation = `DURATION:${cardRuleOracle(tracker.cardId)?.duration || ''}`;
      if(cardCertificationObligations(tracker.cardId).includes(obligation)){
        recordUseLimitProbe(tracker.cardId, tracker.sourceIid, obligation, 'FULL_CANONICAL_STATUS_COUNTDOWN_AND_REMOVAL', view);
      }
      for(const forbidden of cardCertificationObligations(tracker.cardId).filter(value=>/PERSISTS_EXTRA_TURN|FOURTH_TURN|SIXTH_TURN|FOURTH_DRAW|THIRD_CONSOLIDATION|DELIVERED_EARLY_OR_LATE/.test(value))){
        recordUseLimitProbe(tracker.cardId, tracker.sourceIid, forbidden, 'FULL_CANONICAL_STATUS_COUNTDOWN_AND_REMOVAL', view);
      }
      tracker.credited = true;
    }
  }
}

function expectedRenderedEffects(view){
  const expected = new Map();
  const viewer = Number(view?.playerIndex);
  const add = function(owner, cardId, groupClass, amount = 1){
    const definition = cardDefinition(cardId);
    if(!definition) return;
    const effect = {
      side:Number(owner) === viewer ? 'left' : 'right',
      cardName:String(definition.name || ''),
      ability:String(definition.ability || ''),
      groupClass:String(groupClass || '')
    };
    const key = effectGroupKey(effect);
    expected.set(key, (expected.get(key) || 0) + Math.max(1, Number(amount) || 1));
  };
  for(const status of (view?.state?.statuses || [])){
    const type = String(status?.statusType || status?.type || '').toUpperCase();
    const rule = AUTHORITY_STATUS_BANNER_RULES[type];
    if(!rule) continue;
    const remaining = Math.max(0, Number(status?.remainingTargetTurns ?? status?.remainingOwnerTurns ?? status?.remaining ?? status?.deliveryTurnsRemaining) || 0);
    if(rule.requiresRemaining && remaining <= 0) continue;
    const sourceController = Number(status?.sourceController);
    const affected = Number(status?.playerIndex);
    // Most player statuses are opponent-facing locks, so an old snapshot that
    // lacks sourceController falls back to the player opposite the affected
    // seat. Blame Game is a benefit owned by the affected/controller seat.
    // Match the shipping renderer's explicit exception or the oracle looks on
    // the wrong side and reports a present banner as missing.
    const owner = [
      'NEXT_CHARACTER_HAND_ARRIVAL',
      'RIVERA_AFFILIATION_BONUS',
      'CONSOLIDATION_FATE_BONUS',
      'DELAYED_HAND_DELIVERY',
      'SUPPORTERS_AS_CHARACTERS',
      'SELVA_EXTRA_SUPPORTER',
      'MAJA_EXTRA_SUPPORTERS',
      'FACE_DOWN_CONSOLIDATION_PERMISSION',
      'MOVEMENT_GRANT'
    ].includes(type) && (affected === 0 || affected === 1)
      ? affected
      : (sourceController === 0 || sourceController === 1
        ? sourceController
        : ((affected === 0 || affected === 1) ? 1 - affected : viewer));
    const groupClass = type === 'RIVERA_AFFILIATION_BONUS'
      ? `${rule.groupClass} aff-${String(status?.affiliation || '').replace(/[^a-z0-9_-]/gi, '')}`
      : rule.groupClass;
    add(owner, rule.cardId, groupClass);
  }
  for(const {card} of canonicalBoardEntries(view?.state)){
    if(card?.faceDown) continue;
    const cardId = String(card?.id || '');
    if(cardId !== '56' && cardId !== '67') continue;
    const maxUses = cardId === '56' ? 3 : 1;
    if(Math.max(0, Number(card?.counters?.reactionUses) || 0) >= maxUses) continue;
    add(Number(card.controller ?? card.owner), cardId, cardId === '56' ? 'effect-pill-lydia' : 'effect-pill-secules');
  }
  return expected;
}

function auditRenderedShippingUi(view){
  const findings = [];
  const check = function(kind, condition, detail){
    result.domChecks += 1;
    note(result.domCheckKinds, kind);
    if(!condition) findings.push({code:kind, detail:String(detail || kind)});
  };
  const state = view?.state || {};
  // Coin choice and the final result have their own production screens. Board,
  // hand, status, and turn-HUD assertions begin only after the shipping match
  // screen is mounted. Their dedicated screens are checked separately here.
  if(String(state.phase || '') === 'coin'){
    if(!timingUiMode) return findings;
    check('COIN_SCREEN_ACTIVE', !!document.getElementById('s-coin')?.classList.contains('active'), 'production coin screen is not active');
    // The accelerated functional campaign still clicks the real production
    // turn-order buttons, but it does not certify the 1.8-second cosmetic coin
    // animation. Text/result timing remains mandatory in presentation mode.
    if(timingUiMode){
      check('COIN_RESULT_VISIBLE', normalizedUiText(document.getElementById('coin-result')?.textContent).length > 0, 'coin result text is missing');
      const localChooses = (view?.legalCommands || []).some(command=>String(command?.type || '') === 'CHOOSE_TURN_ORDER');
      if(localChooses){
        check('COIN_CHOICES_VISIBLE', visibleButtons().some(button=>normalizedUiText(button.textContent) === 'Go First' && !button.disabled) && visibleButtons().some(button=>normalizedUiText(button.textContent) === 'Go Second' && !button.disabled), 'coin winner cannot use both turn-order choices');
      }
    }
    return findings;
  }
  if(state.outcome){
    const winScreen = document.getElementById('s-win');
    check('ENDGAME_SCREEN_ACTIVE', !!winScreen?.classList.contains('active'), 'production endgame screen is not active');
    check('ENDGAME_TITLE_VISIBLE', normalizedUiText(document.getElementById('win-title')?.textContent).length > 0, 'endgame title is missing');
    check('ENDGAME_ZONE_REPORT', document.querySelectorAll('#win-zones .win-z').length === 3, 'endgame does not show all three zone results');
    return findings;
  }
  if(!document.getElementById('s-game')?.classList.contains('active')) return findings;
  const viewer = Number(view?.playerIndex);
  const opponent = viewer === 0 ? 1 : 0;
  const game = document.getElementById('s-game');
  const expectedOwnTurn = Number(state.activePlayer) === viewer;
  check('GAME_SCREEN_ACTIVE', !!game?.classList.contains('active'), 'shipping game screen is not active');
  check('TURN_HUD_NUMBER', normalizedUiText(document.getElementById('turn-hud-turn')?.textContent) === `Turn ${Number(state.turn || 0)}/${Number(state.maxTurns || 20)}`, 'turn number does not match authority');
  check('TURN_HUD_OWNER', normalizedUiText(document.getElementById('turn-hud-player')?.textContent) === (expectedOwnTurn ? "It's Your Turn!" : "Opponent's Turn"), 'turn owner label does not match viewer perspective');
  check('TURN_SCREEN_CLASS', !!game?.classList.contains(expectedOwnTurn ? 'own-turn' : 'opponent-turn'), 'turn ownership CSS class does not match authority');

  const map = hitMap();
  const localHandCount = Number(state.players?.[viewer]?.hand?.length ?? state.players?.[viewer]?.handCount ?? 0);
  const opponentHandCount = Number(state.players?.[opponent]?.handCount ?? state.players?.[opponent]?.hand?.length ?? 0);
  const opponentPanelCount = Math.min(opponentHandCount, 12);
  check('LOCAL_HAND_RENDER_COUNT', Number(map?.handCards?.length || 0) === localHandCount, `local rendered hand=${Number(map?.handCards?.length || 0)} authority=${localHandCount}`);
  check('OPPONENT_HAND_RENDER_COUNT', Number(map?.opponentHandCards?.length || 0) === opponentPanelCount, `opponent rendered hand=${Number(map?.opponentHandCards?.length || 0)} panel expectation=${opponentPanelCount} authority=${opponentHandCount}`);
  const projectedOpponentHandCount = Number(globalThis.FATE_GAME_STATE?.players?.[opponent]?.hand?.length || 0);
  check('OPPONENT_HAND_PROJECTED_COUNT', projectedOpponentHandCount === opponentHandCount, `opponent projected hand=${projectedOpponentHandCount} authority=${opponentHandCount}`);
  check('OPPONENT_HAND_HIDDEN', (map?.opponentHandCards || []).every(hit=>!hit?.card || hit.card.hidden === true || hit.card.faceDown === true || hit.card.revealed === true || hit.card._revealed === true || !hit.card.id), 'opponent hand exposes a face-up card without an authoritative reveal');

  for(const hit of [...(map?.handCards || []), ...(map?.cards || [])]){
    const visual = hit?.card?.visual || hit?.card;
    const cardId = String(visual?.id || hit?.card?.id || '');
    if(!['token2','token3','token4'].includes(cardId)) continue;
    check('ADAPTIVE_TOKEN_ART', !!(visual?.runtimeImg || visual?.img), `${cardId} is rendered without its production card image`);
  }
  for(const entry of canonicalBoardEntries(state)){
    const marked = (entry?.card?.statuses || []).some(status=>String(status || '').startsWith('VIGILANTES_MARK:'));
    if(!marked) continue;
    const projected = (map?.cards || []).find(hit=>String(hit?.card?.iid || '') === String(entry.card.iid || ''));
    const renderedCard = projected?.card || null;
    const visual = renderedCard?.visual || renderedCard || null;
    check(
      'VIGILANTES_OVERLAY_PRESENT',
      !!(renderedCard && (
        renderedCard._markedForDeath === true
        || renderedCard.flags?.markedForDeath === true
        || visual?._markedForDeath === true
        || visual?.flags?.markedForDeath === true
      )),
      `Vigilantes target ${entry.card.iid} has no rendered Marked for Death overlay flag`
    );
  }
  const brokenVisibleImages = [...document.querySelectorAll('#s-game img, #modal.on img')].filter(image=>
    isVisible(image) && image.complete && Number(image.naturalWidth) === 0
  );
  check('VISIBLE_IMAGE_ASSETS', brokenVisibleImages.length === 0, `broken visible images: ${brokenVisibleImages.map(image=>image.getAttribute('src') || '').join(', ')}`);

  const renderedEffects = renderedEffectPills();
  const expectedEffects = expectedRenderedEffects(view);
  result.lastStatusAudit = {
    matchId:String(state.matchId || ''),
    revision:Number(state.revision || 0),
    canonical:(state.statuses || []).map(status=>({
      type:String(status?.statusType || status?.type || ''),
      sourceIid:String(status?.sourceIid || ''),
      sourceController:status?.sourceController,
      playerIndex:status?.playerIndex,
      remaining:status?.remainingTargetTurns ?? status?.remainingOwnerTurns ?? status?.remaining ?? status?.deliveryTurnsRemaining
    })),
    projected:(globalThis.FATE_GAME_STATE?._phase7Statuses || []).map(status=>({
      type:String(status?.statusType || status?.type || ''),
      sourceIid:String(status?.sourceIid || ''),
      sourceController:status?.sourceController,
      playerIndex:status?.playerIndex,
      remaining:status?.remainingTargetTurns ?? status?.remainingOwnerTurns ?? status?.remaining ?? status?.deliveryTurnsRemaining
    })),
    rendered:renderedEffects.map(effect=>({
      side:effect.side,
      cardName:effect.cardName,
      ability:effect.ability,
      groupClass:effect.groupClass,
      count:effect.count
    }))
  };
  const renderedByKey = new Map();
  for(const effect of renderedEffects){
    const key = effectGroupKey(effect);
    if(!renderedByKey.has(key)) renderedByKey.set(key, []);
    renderedByKey.get(key).push(effect);
    check('STATUS_ICON_PRESENT', normalizedUiText(effect.iconHtml).length > 0, `status banner ${effect.cardName || effect.ability} has no icon`);
    check('STATUS_MULTIPLICITY_LABEL', effect.count <= 1 || new RegExp(`(?:×|Ã—|x)\\s*${effect.count}(?:\\D|$)`, 'iu').test(effect.label), `status banner ${effect.cardName || effect.ability} count=${effect.count} has no matching multiplier`);
  }
  for(const [key, effects] of renderedByKey){
    check('STATUS_BANNER_UNIQUE', effects.length === 1, `duplicate rendered status banners for ${key}: ${effects.length}`);
  }
  for(const [key, expectedCount] of expectedEffects){
    const effects = renderedByKey.get(key) || [];
    check('STATUS_BANNER_PRESENT', effects.length === 1, `expected one authoritative status banner for ${key}, rendered=${effects.length}`);
    if(effects.length === 1){
      check('STATUS_BANNER_COUNT', Number(effects[0].count) === Number(expectedCount), `status banner ${key} count=${effects[0].count} authority=${expectedCount}`);
    }
  }

  const prompt = state.pendingPrompt || null;
  const modalOpen = document.getElementById('modal')?.classList.contains('on') === true;
  const promptType = String(prompt?.type || '');
  const localPrompt = !!prompt && Number(prompt.playerIndex) === viewer;
  if(localPrompt && ['REACTION','MODAL_CHOICE','ZONE_SELECTION','CARD_SELECTION','HAND_SELECTION','BOARD_DESTINATION','BOARD_TARGET'].includes(promptType)){
    check('LOCAL_PROMPT_VISIBLE', modalOpen, `local ${prompt.type} prompt has no visible production modal`);
  }
  if(localPrompt && ['BOARD_DESTINATION','BOARD_TARGET'].includes(promptType)){
    const picker = document.querySelector('#modal.on .board-target-picker');
    check('BOARD_PICKER_VISIBLE', !!picker && isVisible(picker), `local ${promptType} prompt has no visible production board picker`);
    if(picker && isVisible(picker)){
      const zones = [...picker.querySelectorAll('.board-target-zone')];
      check('BOARD_PICKER_ALL_ZONES', zones.length === 3, `${promptType} picker rendered ${zones.length} zones instead of 3`);
      if(zones.length === 3){
        const zoneRects = zones.map(zone=>zone.getBoundingClientRect());
        const widths = zoneRects.map(rect=>rect.width);
        const heights = zoneRects.map(rect=>rect.height);
        check('BOARD_PICKER_STABLE_ZONE_WIDTH', Math.max(...widths) - Math.min(...widths) <= 2, `${promptType} picker zone widths changed: ${widths.map(value=>Math.round(value)).join(',')}`);
        check('BOARD_PICKER_STABLE_ZONE_HEIGHT', Math.max(...heights) - Math.min(...heights) <= 2, `${promptType} picker zone heights changed: ${heights.map(value=>Math.round(value)).join(',')}`);
        zones.forEach((zone, index)=>{
          const overflowY = getComputedStyle(zone).overflowY;
          const hasExtraGeometry = zone.classList.contains('has-extra-rows')
            || !!zone.querySelector('.board-target-row.has-extra-cells');
          if(hasExtraGeometry){
            if(zone.scrollHeight <= zone.clientHeight + 1) return;
            check('BOARD_PICKER_INTERNAL_SCROLL', overflowY === 'auto' || overflowY === 'scroll', `${promptType} Zone ${index + 1} extra geometry cannot scroll (client=${zone.clientHeight}, scroll=${zone.scrollHeight}, overflow-y=${overflowY})`);
            return;
          }
          check('BOARD_PICKER_DEFAULT_FITS', zone.scrollHeight <= zone.clientHeight + 4, `${promptType} Zone ${index + 1} clips its normal three rows (client=${zone.clientHeight}, scroll=${zone.scrollHeight})`);
          check('BOARD_PICKER_DEFAULT_NO_SCROLL', overflowY === 'hidden' || overflowY === 'clip', `${promptType} Zone ${index + 1} shows a default scrollbar (overflow-y=${overflowY})`);
        });
      }
      if(promptType === 'BOARD_DESTINATION'){
        const targets = [...picker.querySelectorAll('.board-target-cell.is-square-target.is-targetable')];
        check('BOARD_DESTINATION_HIGHLIGHTS', targets.length > 0, 'board destination prompt has no highlighted selectable squares');
        for(const target of targets){
          const marker = target.querySelector('.board-target-square-mark');
          check('BOARD_DESTINATION_NO_SQUARE_LABEL', !String(marker?.textContent || '').trim(), `board destination ${target.dataset.pickerPos || ''} displays filler text`);
          const borderedElement = marker || target;
          check('BOARD_DESTINATION_SOLID_BORDER', getComputedStyle(borderedElement).borderTopStyle === 'solid', `board destination ${target.dataset.pickerPos || ''} does not use a solid selection border`);
        }
      }
    }
  }
  if(localPrompt && ['CARD_SELECTION','HAND_SELECTION'].includes(promptType)){
    const canvas = document.querySelector('#modal.on #visual-page-canvas');
    check('CARD_PICKER_VISIBLE', !!canvas && isVisible(canvas), `local ${promptType} prompt has no visible production card picker`);
    if(canvas && isVisible(canvas)){
      let renderedIids = [];
      try{ renderedIids = JSON.parse(String(canvas.dataset.pickerCardIids || '[]')).map(String); }catch(error){}
      const missing = (prompt.eligibleIids || []).map(String).filter(iid=>!renderedIids.includes(iid));
      check('CARD_PICKER_CANONICAL_ELIGIBILITY', missing.length === 0, `${promptType} picker omitted eligible authority IIDs: ${missing.join(',')}`);
    }
  }
  if(prompt?.waitingForOpponent && String(prompt.type || '') === 'REACTION'){
    check('OPPONENT_REACTION_WAIT_VISIBLE', modalOpen && !!document.querySelector('#modal.on .phase7-reaction-waiting'), 'opponent reaction pause window is not visible');
  }
  return findings;
}

function coinPresentationReachedOracleFrame(view){
  const state = view?.state || {};
  const screen = document.getElementById('s-coin');
  const expectedKey = [String(state.matchId || ''), Number(state.revision || 0), Number(state.coinFlip?.winner)].join(':');
  if(!screen?.classList.contains('active') || screen.dataset.phase7CoinPresentationKey !== expectedKey) return false;
  if(normalizedUiText(document.getElementById('coin-result')?.textContent).length === 0) return false;
  if(normalizedUiText(document.getElementById('coin-winner-text')?.textContent).length === 0) return false;
  const localChooses = (view?.legalCommands || []).some(command=>String(command?.type || '') === 'CHOOSE_TURN_ORDER');
  if(!localChooses) return true;
  const buttons = visibleButtons();
  return buttons.some(button=>normalizedUiText(button.textContent) === 'Go First' && !button.disabled)
    && buttons.some(button=>normalizedUiText(button.textContent) === 'Go Second' && !button.disabled);
}

function renderedUiReachedOracleFrame(view){
  const state = view?.state || {};
  if(String(state.phase || '') === 'coin'){
    return !timingUiMode || coinPresentationReachedOracleFrame(view);
  }
  if(state.outcome){
    return !!document.getElementById('s-win')?.classList.contains('active')
      && document.querySelectorAll('#win-zones .win-z').length === 3;
  }
  if(!document.getElementById('s-game')?.classList.contains('active')) return false;
  const viewer = Number(view?.playerIndex);
  const opponent = viewer === 0 ? 1 : 0;
  const pendingPrompt = state.pendingPrompt || null;
  if(pendingPrompt
    && Number(pendingPrompt.playerIndex) === viewer
    && ['REACTION','MODAL_CHOICE','ZONE_SELECTION','CARD_SELECTION','HAND_SELECTION','BOARD_DESTINATION','BOARD_TARGET'].includes(String(pendingPrompt.type || ''))
    && document.getElementById('modal')?.classList.contains('on') !== true){
    // modal-gate:open is emitted before the production modal has necessarily
    // mounted. Keep the oracle candidate pending until that frame is visible;
    // auditCurrentUiProjection still records the violation after its bounded
    // 2.5-second deadline if the prompt UI genuinely never appears.
    return false;
  }
  if(pendingPrompt
    && Number(pendingPrompt.playerIndex) === viewer
    && ['BOARD_DESTINATION','BOARD_TARGET'].includes(String(pendingPrompt.type || ''))){
    const picker = document.querySelector('#modal.on .board-target-picker');
    if(!picker || !isVisible(picker)) return false;
  }
  const localHandCount = Number(state.players?.[viewer]?.hand?.length ?? state.players?.[viewer]?.handCount ?? 0);
  const opponentHandCount = Number(state.players?.[opponent]?.handCount ?? state.players?.[opponent]?.hand?.length ?? 0);
  const opponentPanelCount = Math.min(opponentHandCount, 12);
  const map = hitMap();
  if(Number(map?.handCards?.length || 0) !== localHandCount
    || Number(map?.opponentHandCards?.length || 0) !== opponentPanelCount) return false;
  // Durable card-status flags are applied to the projected board before the
  // render scheduler publishes a new hit map.  Do not compare a freshly
  // marked canonical card against the preceding canvas frame.  Waiting here
  // remains fail-closed: if the actual Marked for Death visual never reaches
  // the hit map, the normal bounded oracle timeout still records the failure.
  for(const entry of canonicalBoardEntries(state)){
    const marked = (entry?.card?.statuses || []).some(status=>String(status || '').startsWith('VIGILANTES_MARK:'));
    if(!marked) continue;
    const rendered = (map?.cards || []).find(hit=>String(hit?.card?.iid || '') === String(entry.card.iid || ''))?.card;
    const visual = rendered?.visual || rendered;
    if(!(rendered && (
      rendered._markedForDeath === true
      || rendered.flags?.markedForDeath === true
      || visual?._markedForDeath === true
      || visual?.flags?.markedForDeath === true
    ))) return false;
  }
  // Status pills are committed after the authoritative board/status projection
  // and can legitimately land a few animation frames after the hand hit map.
  // Treat them as part of the oracle frame: transiently absent pills wait for
  // the normal bounded projection deadline, while a genuinely missing or
  // duplicate banner still fails closed when that deadline expires.
  const renderedStatusCounts = new Map();
  for(const effect of renderedEffectPills()){
    const key = effectGroupKey(effect);
    renderedStatusCounts.set(key, (renderedStatusCounts.get(key) || 0) + 1);
  }
  for(const [key] of expectedRenderedEffects(view)){
    if(Number(renderedStatusCounts.get(key) || 0) !== 1) return false;
  }
  return true;
}

function auditCurrentUiProjection(view){
  const revision = Number(view?.state?.revision ?? view?.revision ?? 0);
  const auditKey = `${String(view?.state?.matchId || '')}:${revision}`;
  // The network adapter intentionally receives a revision before the
  // presentation queue commits that revision into the shipping UI. Comparing
  // those two different instants reports a false one-turn disagreement. Only
  // audit after the current UI has committed the same revision and completed
  // its presentation work.
  const bridge = globalThis.FatePhase7CurrentMultiplayerUi?.report?.();
  if(!view?.state
    || auditKey === lastProjectionOracleKey
    || !bridge?.active
    || Number(bridge.revision) !== revision
    || bridge.presentationBusy) return;
  if(projectionOracleCandidateKey !== auditKey){
    projectionOracleCandidateKey = auditKey;
    projectionOracleCandidateSince = Date.now();
    return;
  }
  // Give the production renderer at least two frames after the bridge commits
  // the authoritative revision. This is not a test-only rendering shortcut;
  // it prevents comparing the authority to the previous shipping frame.
  const candidateAge = Date.now() - projectionOracleCandidateSince;
  // A terminal revision is committed before the shipping result sequence has
  // finished its final fate/result motion and mounted the production win
  // screen. That sequence legitimately takes several seconds with full
  // presentation enabled. Keep the state-to-DOM oracle behind it instead of
  // auditing the outgoing board frame as though it were the final screen.
  // A cold production bootstrap must mount the coin screen and run its real
  // 1.8-second result animation before the winner buttons exist. Give that
  // dedicated presentation a bounded allowance that also tolerates Chromium's
  // background-tab timer throttling during parallel paired campaigns. The
  // five-pair certification layout can defer an otherwise-correct production
  // modal for more than ten seconds while another tab renders a cinematic, so
  // every shipping frame gets the same bounded allowance. This remains a
  // fail-closed DOM assertion; it only prevents scheduler delay from being
  // misclassified as a missing UI path.
  const warmReconnectFrame = matchStart?.matchId === String(view?.state?.matchId || '')
    && Number(matchStart?.startRevision || 0) > 3
    && revision === Number(matchStart?.startRevision || 0);
  const oracleFrameTimeoutMs = 15000;
  if(candidateAge < 50 || (!renderedUiReachedOracleFrame(view) && candidateAge < oracleFrameTimeoutMs)) return;
  lastProjectionOracleKey = auditKey;
  exchangeCrossSeatSnapshot(view);
  auditNegativePromptObligations(view);
  auditPileSelectionObligations(view);
  auditNoTriggerUiObligations(view);
  auditUseLimitObligations(view);
  auditTimedStatusObligations(view);
  const legacy = globalThis.FATE_GAME_STATE || globalThis.getFateGameState?.();
  if(!legacy) return;
  const violations = [];
  if(Number(legacy.currentPlayer) !== Number(view.state.activePlayer)){
    violations.push(`active player canonical=${view.state.activePlayer} ui=${legacy.currentPlayer}`);
  }
  if(Number(legacy._onlinePlayerIndex) !== Number(view.playerIndex)){
    violations.push(`viewer canonical=${view.playerIndex} ui=${legacy._onlinePlayerIndex}`);
  }
  const legacyBoardByIid = new Map();
  for(let z = 0; z < (legacy.board || []).length; z += 1){
    for(let r = 0; r < (legacy.board?.[z] || []).length; r += 1){
      for(let c = 0; c < (legacy.board?.[z]?.[r] || []).length; c += 1){
        const card = legacy.board[z][r][c];
        if(card?.iid) legacyBoardByIid.set(String(card.iid), {card,z,r,c});
      }
    }
  }
  for(let z = 0; z < (view.state.board || []).length; z += 1){
    for(let r = 0; r < (view.state.board?.[z] || []).length; r += 1){
      for(let c = 0; c < (view.state.board?.[z]?.[r] || []).length; c += 1){
        const canonical = view.state.board[z][r][c];
        if(!canonical?.iid) continue;
        const projected = legacyBoardByIid.get(String(canonical.iid));
        if(!projected){
          violations.push(`card ${canonical.id || ''} ${canonical.iid} missing from UI board at canonical ${z}:${r}:${c}`);
          continue;
        }
        if(projected.z !== z || projected.r !== r || projected.c !== c){
          violations.push(`card ${canonical.id || ''} ${canonical.iid} position canonical=${z}:${r}:${c} ui=${projected.z}:${projected.r}:${projected.c}`);
        }
        const canonicalController = Number(canonical.controller ?? canonical.owner);
        const projectedController = Number(projected.card.controller ?? projected.card.owner);
        if(canonicalController !== projectedController){
          violations.push(`card ${canonical.id || ''} ${canonical.iid} controller canonical=${canonicalController} ui=${projectedController}`);
        }
      }
    }
  }
  for(let z = 0; z < 3; z += 1){
    const canonicalOwners = view.state.geometry?.rowOwners?.[z] || [];
    const expectedExtraCount = Math.max(0, canonicalOwners.length - 3, Number(view.state.board?.[z]?.length || 0) - 3);
    if(Number(legacy.extraRows?.[z] || 0) !== expectedExtraCount){
      violations.push(`zone ${z} extra-row count canonical=${expectedExtraCount} ui=${legacy.extraRows?.[z]}`);
    }
    for(let offset = 0; offset < expectedExtraCount; offset += 1){
      const r = offset + 3;
      const canonicalSquares = (view.state.geometry?.playableExtraSquares || []).filter(square=>
        Number(square?.z) === z && Number(square?.r) === r
      );
      const canonicalOwner = Number(canonicalOwners[r]);
      const isFull = [0, 1, 2].every(c=>canonicalSquares.some(square=>Number(square?.c) === c && Number(square?.owner) === canonicalOwner));
      if(isFull && Number(legacy.extraRowOwners?.[z]?.[offset]) !== canonicalOwner){
        violations.push(`zone ${z} row ${r} owner canonical=${canonicalOwner} ui=${legacy.extraRowOwners?.[z]?.[offset]}`);
      }
      if(!isFull){
        for(const square of canonicalSquares){
          const match = (legacy.markSafeSquares || []).some(candidate=>
            Number(candidate?.z) === z
            && Number(candidate?.r) === r
            && Number(candidate?.c) === Number(square.c)
            && Number(candidate?.owner) === Number(square.owner)
          );
          if(!match) violations.push(`zone ${z} row ${r} column ${square.c} partial safe square missing or wrong owner`);
        }
      }
    }
    if(typeof globalThis.getZoneScore === 'function'){
      for(const playerIndex of [0, 1]){
        let expectedScore = 0;
        for(const row of (view.state.board?.[z] || [])) for(const card of (row || [])){
          if(!card || Number(card.controller ?? card.owner) !== playerIndex) continue;
          expectedScore += expectedEffectiveFateFromOracle(view.state, card.iid);
        }
        for(const status of (view.state.statuses || [])){
          if(status?.type !== 'ZONE_FATE_MODIFIER') continue;
          if(Number(status.zone) !== z || Number(status.playerIndex) !== playerIndex) continue;
          expectedScore += Number(status.value || 0) || 0;
        }
        expectedScore = Math.max(0, expectedScore);
        const observedScore = Number(globalThis.getZoneScore(z, playerIndex));
        if(Number.isFinite(observedScore) && observedScore !== expectedScore){
          violations.push(`zone ${z} player ${playerIndex} Fate canonical-oracle=${expectedScore} ui=${observedScore}`);
        }
      }
    }
  }
  const stateAudit = auditRuleOracleState(view, function(cardIid, canonicalEntry){
    let legacyEntry = null;
    for(const row of (legacy.board?.[canonicalEntry.z] || [])){
      const value = (row || []).find(candidate=>String(candidate?.iid || '') === String(cardIid || ''));
      if(value){ legacyEntry = value; break; }
    }
    if(!legacyEntry || typeof globalThis.getEffectiveFate !== 'function') return Number.NaN;
    const observed = globalThis.getEffectiveFate(legacyEntry, canonicalEntry.z);
    const expected = expectedEffectiveFateFromOracle(view.state, cardIid);
    if(Number(observed) !== Number(expected)){
        result.lastEffectiveFateDiagnostic = {
          cardId:String(canonicalEntry?.card?.id || ''), cardIid:String(cardIid || ''), expected:Number(expected), observed:Number(observed),
          zone:Number(canonicalEntry.z),
          canonical:{currentFate:canonicalEntry?.card?.currentFate, counters:canonicalEntry?.card?.counters, statuses:canonicalEntry?.card?.statuses, fateReductionEffectUses:view.state?.fateReductionEffectUses},
          source:{
            id:String(legacyEntry.id || ''), owner:legacyEntry.owner, controller:legacyEntry.controller,
            aff:legacyEntry.aff, affiliation:legacyEntry.affiliation, faceDown:legacyEntry.faceDown,
            noBonus:legacyEntry.noBonus,
            currentFate:legacyEntry.currentFate,
            phase7JimmyReductionEffectUses:legacyEntry._phase7JimmyReductionEffectUses,
            phase7CurrentMultiplayer:legacy._phase7CurrentMultiplayer,
            damageDoneP:legacy.damageDoneP,
            counters:legacyEntry.counters,
            permanentFateCeiling:legacyEntry._permanentFateCeiling,
            permanentFateDebuffAmount:legacyEntry._permanentFateDebuffAmount,
            suppressedFlags:Object.fromEntries(Object.entries(legacyEntry).filter(([key, value])=>value === true && /suppress|negat|immune/i.test(key)))
          },
          peers:(legacy.board || []).flat(2).filter(Boolean).map(card=>({
            iid:String(card.iid || ''), id:String(card.id || ''), owner:card.owner, controller:card.controller,
            aff:card.aff, affiliation:card.affiliation, faceDown:card.faceDown,
            immutable:typeof globalThis.isCardEffectImmutable === 'function' ? !!globalThis.isCardEffectImmutable(card) : false
          }))
        };
    }
    return observed;
  });
  for(const [cardId, count] of Object.entries(stateAudit.cardChecks || {})){
    note(result.oracleCardChecks, cardId, Number(count || 0));
  }
  for(const [branchKey, count] of Object.entries(stateAudit.cardBranches || {})){
    note(result.oracleCardBranches, branchKey, Number(count || 0));
  }
  for(const violation of stateAudit.violations) violations.push(violation);
  result.oracleChecks += 2 + stateAudit.checks + violations.length;
  for(const value of violations){
    const structured = value && typeof value === 'object' ? value : null;
    result.oracleViolations.push({
      code:String(structured?.code || 'CURRENT_UI_PROJECTION_MISMATCH'),
      cardId:String(structured?.cardId || ''),
      batchId:'',
      detail:String(structured?.detail || value),
      matchId:String(view.state.matchId || ''),
      revision,
      seat
    });
  }
  for(const finding of auditRenderedShippingUi(view)){
    const entry = {
      ...finding,
      matchId:String(view.state.matchId || ''),
      revision,
      seat,
      at:Date.now()
    };
    result.domViolations.push(entry);
    if(result.domViolations.length > 200) result.domViolations.shift();
    recordError(entry.detail, {stage:'shipping-dom-oracle', code:entry.code, revision});
  }
}

function noteCommandCard(view, command){
  if(command?.type === 'DISCARD_CARD') manualDiscardCoveredThisMatch = true;
  if(command?.type === 'ANSWER_PROMPT'){
    const payload = command.payload || {};
    note(result.answerVariants, payload.cancel === true
      ? 'CANCEL'
      : (payload.mode ? `MODE_${String(payload.mode).toUpperCase()}` : 'ACCEPT'));
  }
  const primaryIid = command?.payload?.cardIid || command?.payload?.sourceIid
    || command?.payload?.targetIid || command?.payload?.reactionIid;
  const iids = [primaryIid, ...(command?.payload?.tributeIids || [])].map(String).filter(Boolean);
  let primaryCardId = '';
  for(const [index, iid] of iids.entries()){
    const cardId = sourceCardId(view, iid);
    if(!cardId) continue;
    if(index === 0) primaryCardId = cardId;
    note(result.cardIds, cardId);
    if(queuedOrganicTargets.includes(cardId)) organicTargetCommandsThisMatch.add(cardId);
    if(queuedOrganicPartners.includes(cardId)) organicPartnerCommandsThisMatch.add(cardId);
    if(focusedCardIdSet.has(cardId)) note(result.focusCardIds, cardId);
  }
  return primaryCardId;
}

function stableCommandValue(value){
  if(Array.isArray(value)) return value.map(stableCommandValue);
  if(value && typeof value === 'object'){
    return Object.keys(value).sort().reduce((result, key)=>{
      result[key] = stableCommandValue(value[key]);
      return result;
    }, {});
  }
  return value;
}

function commandKey(command){
  return String(command?.type || '').toUpperCase() + ':' + JSON.stringify(stableCommandValue(command?.payload || {}));
}

const attemptedTurnCommandKeys = new Set();
const successfulTurnActionCounts = new Map();

function turnCommandAttemptKey(view, command){
  return [
    String(view?.state?.matchId || ''),
    Number(view?.state?.turn || 0),
    Number(view?.playerIndex ?? -1),
    String(command?.type || ''),
    commandKey(command)
  ].join(':');
}

function successfulTurnActionKey(view){
  return [
    String(view?.state?.matchId || ''),
    Number(view?.state?.turn || 0),
    Number(view?.playerIndex ?? -1)
  ].join(':');
}

function noteSuccessfulTurnAction(view, command){
  if(!command || command.type === 'END_TURN') return;
  const key = successfulTurnActionKey(view);
  successfulTurnActionCounts.set(key, Number(successfulTurnActionCounts.get(key) || 0) + 1);
}

function chooseCommand(view){
  const commands = Array.isArray(view?.legalCommands) ? view.legalCommands : [];
  // Some landscapes expose their authoritative choice as a shipping modal
  // without creating pendingPrompt. If that modal is already open, a human
  // must answer it before attempting a hand/board action behind the overlay.
  const openModalCommands = document.getElementById('modal')?.classList.contains('on')
    ? commands.filter(command=>phase7ModalCommandButton(command))
    : [];
  if(openModalCommands.length){
    const nonCancel = openModalCommands.filter(command=>command?.payload?.cancel !== true);
    const choices = nonCancel.length ? nonCancel : openModalCommands;
    return choices[(organicVariant() + Number(view?.state?.turn || 0)) % choices.length] || choices[0] || null;
  }
  const prompt = view?.state?.pendingPrompt;
  if(prompt && Number(prompt.playerIndex) === Number(view.playerIndex)){
    note(result.promptTypes, prompt.type);
    const answers = commands.filter(command=>command.type === 'ANSWER_PROMPT');
    const visibleAnswers = answers.filter(command=>{
      const payload = command.payload || {};
      if(payload.destination) return hasBoardPosition(payload.destination) && boardPositionIsUnobscured(payload.destination);
      if(payload.selectedIid && prompt.type === 'BOARD_TARGET'){
        return !!(hitMap()?.cards || []).find(hit=>String(hit?.iid || hit?.card?.iid || '') === String(payload.selectedIid));
      }
      return true;
    });
    const choices = visibleAnswers.length ? visibleAnswers : answers;
    if(organicCardCampaign){
      const variant = organicVariant();
      const cancel = choices.find(command=>command.payload?.cancel === true);
      if(cancel && [1, 7].includes(variant)) return cancel;
      const promptSourceId = String(prompt?.semanticSourceCardId || sourceCardId(view, prompt?.sourceIid) || '');
      if(requestedFocusedScenario === 'search-square-draw' && promptSourceId === '13'){
        // Johnathan is an up-to-two search, so an empty answer is legal. The
        // focused shipping scenario must deliberately exercise the real card
        // picker with actual Supporters instead of silently proving only the
        // zero-card branch.
        const nonEmptySearch = choices
          .filter(command=>command.payload?.cancel !== true && commandSelectedIids(command).length > 0)
          .sort((left, right)=>commandSelectedIids(right).length - commandSelectedIids(left).length)[0];
        if(nonEmptySearch) return nonEmptySearch;
      }
      if(String(prompt.type || '') === 'REACTION'){
        const partnerReactions = choices.filter(command=>{
          const reactionIid = String(command.payload?.reactionIid || '');
          return reactionIid && queuedOrganicPartners.includes(sourceCardId(view, reactionIid));
        });
        const reactionChoices = partnerReactions.length ? partnerReactions : choices;
        const reactionOrder = [
          ['DECLINE','PASS'],
          ['NEGATE'],
          ['SUPPRESS'],
          ['USE']
        ][variant % 4];
        for(const wanted of reactionOrder){
          const reaction = reactionChoices.find(command=>String(command.payload?.choice || '').toUpperCase() === wanted);
          if(reaction) return reaction;
        }
      }
      const nonCancel = choices.filter(command=>command.payload?.cancel !== true);
      if(nonCancel.length) return nonCancel[(variant + Number(view?.state?.turn || 0)) % nonCancel.length];
    }
    return choices.find(command=>command.payload?.choice === 'USE')
      || choices.find(command=>command.payload?.cancel !== true)
      || choices[0]
      || null;
  }
  const handLimit = view?.state?.pendingHandLimit;
  if(handLimit && Number(handLimit.playerIndex) === Number(view.playerIndex)){
    note(result.promptTypes, 'HAND_LIMIT');
    const options = commands.filter(command=>command.type === 'DISCARD_TO_HAND_LIMIT');
    const preserve = new Set([...queuedOrganicTargets, ...queuedOrganicPartners]);
    return options.sort((left, right)=>{
      const discardedTargetCount = command=>(command?.payload?.discardedIids || []).reduce((count, iid)=>
        count + (preserve.has(sourceCardId(view, iid)) ? 1 : 0), 0
      );
      return discardedTargetCount(left) - discardedTargetCount(right)
        || commandKey(left).localeCompare(commandKey(right));
    })[0] || null;
  }
  if(Number(view?.state?.activePlayer) !== Number(view?.playerIndex)) return null;
  const organicTargetSetupPending = organicCardCampaign
    && queuedOrganicTargets.some(id=>!organicTargetCommandsThisMatch.has(id));
  const organicSetupPending = organicCardCampaign && (
    organicTargetSetupPending
    || queuedOrganicPartners.some(id=>!shouldHoldOrganicReactionCard(id) && !organicPartnerCommandsThisMatch.has(id))
  );
  // Once every required target/partner has been established, keep organic play
  // representative without exhaustively walking every distinct movement or
  // repeatable activation command. Four accepted non-End-Turn actions is a
  // generous real turn; after that the shipping End Turn control advances the
  // match. Required setup is never curtailed by this budget.
  if(!organicSetupPending && Number(successfulTurnActionCounts.get(successfulTurnActionKey(view)) || 0) >= 4){
    const boundedEndTurn = commands.find(command=>command.type === 'END_TURN') || null;
    if(boundedEndTurn) return boundedEndTurn;
  }
  // Exercise the actual shipping card-detail Discard button once per organic
  // match, but only after the focused cards and adversarial partners have been
  // established. Never sacrifice those certification subjects for coverage.
  if(organicCardCampaign && !requestedFocusedScenario && !organicSetupPending && !manualDiscardCoveredThisMatch){
    const protectedIds = new Set([...queuedOrganicTargets, ...queuedOrganicPartners]);
    const manualDiscard = commands.find(command=>
      command?.type === 'DISCARD_CARD'
        && !attemptedTurnCommandKeys.has(turnCommandAttemptKey(view, command))
        && !protectedIds.has(sourceCardId(view, command.payload?.targetIid))
    );
    if(manualDiscard) return manualDiscard;
  }
  if(organicTargetSetupPending){
    const fieldReactionPartnersPending = queuedOrganicPartners.filter(id=>
      ['56','67'].includes(id) && !organicPartnerCommandsThisMatch.has(id)
    );
    if(fieldReactionPartnersPending.length){
      const directFieldReactionPartner = commands.find(command=>{
        const type = String(command?.type || '');
        if(!['SET_CARD_FROM_DECK','SET_CARD','CONSOLIDATE_CARD'].includes(type)) return false;
        const iid = command.payload?.cardIid;
        if(!fieldReactionPartnersPending.includes(sourceCardId(view, iid))) return false;
        if(type !== 'SET_CARD_FROM_DECK' && !hasRenderedHandCard(iid)) return false;
        return hasBoardPosition(command.payload?.destination) && boardPositionIsUnobscured(command.payload.destination);
      });
      if(directFieldReactionPartner) return directFieldReactionPartner;
      const reactionScaffold = commands.find(command=>
        command?.type === 'SET_CARD'
          && queuedOpeningScaffoldIds.includes(sourceCardId(view, command.payload?.cardIid))
          && Number(command.payload?.destination?.r) === 1
          && hasRenderedHandCard(command.payload?.cardIid)
          && boardPositionIsUnobscured(command.payload?.destination)
      );
      if(reactionScaffold) return reactionScaffold;
    }
    // Search across action types before applying generic action-type priority.
    // Otherwise an unrelated deck-set command can repeatedly outrank a legal
    // focused consolidation and let the match end without exercising its card.
    const directTarget = commands.find(command=>{
      const type = String(command?.type || '');
      if(!['SET_CARD_FROM_DECK','SET_CARD','SET_ADAPTIVE_TOKEN','CONSOLIDATE_CARD'].includes(type)) return false;
      if(attemptedTurnCommandKeys.has(turnCommandAttemptKey(view, command))) return false;
      const iid = command.payload?.cardIid;
      const cardId = sourceCardId(view, iid);
      if(!queuedOrganicTargets.includes(cardId) || organicTargetCommandsThisMatch.has(cardId)) return false;
      if(type !== 'SET_CARD_FROM_DECK' && !hasRenderedHandCard(iid)) return false;
      if(!hasBoardPosition(command.payload?.destination) || !boardPositionIsUnobscured(command.payload.destination)) return false;
      if(type === 'CONSOLIDATE_CARD'){
        const reinforcementTargets = new Set(queuedOrganicTargets.filter(id=>['47','70'].includes(id)));
        const protectedIds = new Set([
          ...queuedOrganicTargets.filter(id=>!reinforcementTargets.has(id)),
          ...queuedOrganicPartners.filter(id=>!organicPartnerCommandsThisMatch.has(id))
        ]);
        if((command.payload?.tributeIids || []).some(tributeIid=>protectedIds.has(sourceCardId(view, tributeIid)))) return false;
      }
      return true;
    });
    if(directTarget) return directTarget;
    const contestedScaffold = commands.find(command=>
      command?.type === 'SET_CARD'
        && queuedOpeningScaffoldIds.includes(sourceCardId(view, command.payload?.cardIid))
        && Number(command.payload?.destination?.r) === 1
        && hasRenderedHandCard(command.payload?.cardIid)
        && boardPositionIsUnobscured(command.payload?.destination)
    );
    if(contestedScaffold) return contestedScaffold;
  }
  const priority = organicSetupPending
    ? ['SET_CARD','SET_ADAPTIVE_TOKEN','SET_CARD_FROM_DECK','CONSOLIDATE_CARD','ACTIVATE_EFFECT','ACTIVATE_LANDSCAPE','FLIP_CARD','MOVE_CARD','END_TURN']
    : ['ACTIVATE_EFFECT','SET_CARD_FROM_DECK','ACTIVATE_LANDSCAPE','CONSOLIDATE_CARD','SET_CARD','SET_ADAPTIVE_TOKEN','FLIP_CARD','MOVE_CARD','END_TURN'];
  for(const type of priority){
    let options = commands.filter(command=>command.type === type);
    if(type !== 'END_TURN'){
      options = options.filter(command=>!attemptedTurnCommandKeys.has(turnCommandAttemptKey(view, command)));
    }
    if(['SET_CARD','SET_ADAPTIVE_TOKEN','CONSOLIDATE_CARD'].includes(type)){
      options = options.filter(command=>hasClickableHandCard(command.payload?.cardIid));
    }
    if(['SET_CARD','SET_CARD_FROM_DECK','SET_ADAPTIVE_TOKEN','CONSOLIDATE_CARD','MOVE_CARD'].includes(type)){
      options = options.filter(command=>hasBoardPosition(command.payload?.destination) && boardPositionIsUnobscured(command.payload?.destination));
    }
    if(type === 'CONSOLIDATE_CARD' && organicCardCampaign){
      const reinforcementTargets = new Set(queuedOrganicTargets.filter(id=>['47','70'].includes(id)));
      const protectedIds = new Set([
        ...queuedOrganicTargets.filter(id=>!reinforcementTargets.has(id)),
        ...queuedOrganicPartners.filter(id=>!organicPartnerCommandsThisMatch.has(id))
      ]);
      options = options.filter(command=>!(command.payload?.tributeIids || []).some(iid=>
        protectedIds.has(sourceCardId(view, iid))
      ));
    }
    if(type === 'END_TURN') options = options.filter(()=>!!(hitMap()?.uiCommands || []).find(hit=>hit.command === 'end-turn'));
    if(type === 'ACTIVATE_EFFECT' && organicCardCampaign){
      const setupPending = queuedOrganicPartners.some(id=>
        !shouldHoldOrganicReactionCard(id) && !organicPartnerCommandsThisMatch.has(id)
      );
      if(setupPending){
        options = options.filter(command=>!queuedOrganicTargets.includes(sourceCardId(view, command.payload?.sourceIid)));
      }
    }
    if(!options.length) continue;
    if(type === 'CONSOLIDATE_CARD' && organicCardCampaign){
      const focusAsReinforcement = options.find(command=>(command.payload?.tributeIids || []).some(iid=>
        ['47','70'].includes(sourceCardId(view, iid))
          && queuedOrganicTargets.includes(sourceCardId(view, iid))
      ));
      if(focusAsReinforcement) return focusAsReinforcement;
    }
    if(['SET_CARD','SET_CARD_FROM_DECK','SET_ADAPTIVE_TOKEN','CONSOLIDATE_CARD','ACTIVATE_EFFECT'].includes(type)){
      const organicTargetOption = organicCardCampaign ? options.find(command=>{
        const iid = command.payload?.cardIid || command.payload?.sourceIid;
        const cardId = sourceCardId(view, iid);
        const heldForReaction = ['SET_CARD','SET_ADAPTIVE_TOKEN','CONSOLIDATE_CARD'].includes(type)
          && shouldHoldOrganicReactionCard(cardId);
        return !heldForReaction
          && queuedOrganicTargets.includes(cardId)
          && (!organicTargetSetupPending || !organicTargetCommandsThisMatch.has(cardId));
      }) : null;
      const organicPartnerOption = organicCardCampaign ? options.find(command=>{
        const iid = command.payload?.cardIid || command.payload?.sourceIid;
        const cardId = sourceCardId(view, iid);
        const heldForReaction = ['SET_CARD','SET_ADAPTIVE_TOKEN','CONSOLIDATE_CARD'].includes(type)
          && shouldHoldOrganicReactionCard(cardId);
        // Once one adversarial partner has been exercised, do not let its
        // duplicate copies indefinitely outrank another required partner.
        // Every queued partner must contribute real command/event evidence in
        // this match before generic focused-card play resumes.
        return !heldForReaction
          && queuedOrganicPartners.includes(cardId)
          && !organicPartnerCommandsThisMatch.has(cardId);
      }) : null;
      if(organicTargetOption) return organicTargetOption;
      // A partner may build the board, but it must never consume consolidation
      // resources while the actual certification target is still waiting to be set.
      // Otherwise a nominal "card 02" match can finish without ever playing 02.
      if(type === 'CONSOLIDATE_CARD' && organicTargetSetupPending) continue;
      if(organicPartnerOption) return organicPartnerOption;
      if(type === 'CONSOLIDATE_CARD' && organicSetupPending) continue;
      const freshFocused = options.find(command=>{
        const iid = command.payload?.cardIid || command.payload?.sourceIid;
        const id = sourceCardId(view, iid);
        return focusedCardIdSet.has(id) && !result.focusCardIds[id];
      });
      if(freshFocused) return freshFocused;
      const focusedOption = options.find(command=>{
        const iid = command.payload?.cardIid || command.payload?.sourceIid;
        return focusedCardIdSet.has(sourceCardId(view, iid));
      });
      if(focusedOption) return focusedOption;
      const fresh = options.find(command=>{
        const iid = command.payload?.cardIid || command.payload?.sourceIid;
        const id = sourceCardId(view, iid);
        return id && !result.cardIds[id];
      });
      if(fresh) return fresh;
    }
    return options[(Number(view.state.revision) + result.actions) % options.length];
  }
  return null;
}

function pickerCards(view){
  const prompt = view?.state?.pendingPrompt || {};
  const eligible = new Set((prompt.eligibleIids || []).map(String));
  const cards = (prompt.eligibleCards || []).slice();
  const added = new Set(cards.map(card=>String(card?.iid || '')));
  for(const player of (view?.state?.players || [])){
    for(const zone of ['hand','discard']) for(const card of (player?.[zone] || [])){
      const iid = String(card?.iid || '');
      if(eligible.has(iid) && !added.has(iid)){ cards.push(card); added.add(iid); }
    }
  }
  for(const zone of (view?.state?.board || [])) for(const row of (zone || [])) for(const card of (row || [])){
    const iid = String(card?.iid || '');
    if(card && eligible.has(iid) && !added.has(iid)){ cards.push(card); added.add(iid); }
  }
  return cards;
}

async function selectVisualPickerIids(view, iids, cardsOverride = null){
  const canvas = await waitFor(()=>{
    const candidate = document.getElementById('visual-page-canvas');
    return isVisible(candidate) ? candidate : null;
  });
  if(!canvas) return false;
  // The shipping visual picker can show a filtered subset of the authority's
  // private action-card catalogue (notably SET_CARD_FROM_DECK). Drive the
  // exact order rendered by that picker instead of assuming the broader
  // private catalogue uses the same indexes.
  let renderedPickerIids = [];
  try{ renderedPickerIids = JSON.parse(String(canvas.dataset.pickerCardIids || '[]')).map(String); }
  catch(error){ renderedPickerIids = []; }
  const fallbackCards = Array.isArray(cardsOverride)
    ? cardsOverride
    : (view?.state?.pendingHandLimit
      ? (view.state.players?.[view.playerIndex]?.hand || [])
      : pickerCards(view));
  const cards = renderedPickerIids.length
    ? renderedPickerIids.map(iid=>({iid}))
    : fallbackCards;
  const wanted = (iids || []).map(String);
  const activeView = report() || view;
  const activePrompt = activeView?.state?.pendingPrompt || null;
  const promptSourceIid = String(activePrompt?.sourceIid || '');
  const promptSourceCardId = String(activePrompt?.semanticSourceCardId || sourceCardId(activeView, promptSourceIid) || '');
  for(const iid of wanted){
    const index = cards.findIndex(card=>String(card?.iid || '') === iid);
    if(index < 0) return false;
    const page = Math.floor(index / 8);
    for(let p = 0; p < page; p++){
      if(!clickButton('Next', true)) return false;
      await sleep(100);
    }
    const local = index % 8;
    const rect = canvas.getBoundingClientRect();
    const cols = 4;
    const x = rect.left + ((local % cols) + 0.5) * (rect.width / cols);
    const y = rect.top + (Math.floor(local / cols) + 0.5) * (rect.height / 2);
    dispatchPointerAt(x, y);
    // The production canvas rejects releases within 80ms of the preceding
    // handled action. Preserve that boundary for multi-card/page selection.
    await sleep(120);
    const selected = await waitFor(()=>{
      try{ return JSON.parse(String(canvas.dataset.selectedIids || '[]')).map(String).includes(iid); }
      catch(error){ return false; }
    }, 1200);
    if(!selected) return false;
    for(let p = 0; p < page; p++){
      if(!clickButton('Prev', true)) return false;
      await sleep(100);
    }
  }
  const submitted = clickButton('Confirm') || clickButton('Choose Destination');
  if(submitted){
    result.cardPickerSelections.push({
      at:Date.now(),
      promptSourceCardId,
      promptSourceIid,
      selectedIids:wanted.slice(),
      selectedByVisibleCanvasClick:true
    });
    if(result.cardPickerSelections.length > 80) result.cardPickerSelections.shift();
  }
  return submitted;
}

async function selectHandLimitIids(iids){
  const wanted = new Set((iids || []).map(String));
  const modalReady = modal=>!!(
    modal?.isConnected
    && modal.closest?.('#modal')?.classList?.contains('on')
  );
  // Result presentation can briefly replace the hand-limit modal between its
  // body mounting and its action row mounting. Reacquire that shipping modal
  // instead of treating the transient replacement as a failed legal action.
  for(let attempt = 0; attempt < 10; attempt++){
    result.lastStage = `hand-limit:wait-visible:${attempt + 1}`;
    const modal = await waitFor(()=>{
      const candidate = document.querySelector('#modal.on .phase7-hand-limit-discard');
      if(modalReady(candidate)) return candidate;
      globalThis.FatePhase7CurrentMultiplayerUi?.ensureInteractionUi?.();
      return null;
    }, 2500);
    if(!modal){ await sleep(80); continue; }
    result.lastStage = `hand-limit:normalize-selection:${attempt + 1}`;
    const cards = [...modal.querySelectorAll('.hand-limit-card[data-iid]')];
    if([...wanted].some(iid=>!cards.some(card=>String(card.dataset.iid || '') === iid))){
      if(!modalReady(modal)){ await sleep(120); continue; }
      result.lastStage = 'hand-limit:card-missing';
      return false;
    }
    let replaced = false;
    for(const button of cards){
      if(!modalReady(modal)){ replaced = true; break; }
      const shouldSelect = wanted.has(String(button.dataset.iid || ''));
      if(button.classList.contains('is-selected') !== shouldSelect){
        button.click();
        // Selection state and the confirm button update synchronously. Keep
        // this inside the same stable modal window before a late presentation
        // transition can temporarily hide and restore the shipping picker.
        await sleep(30);
      }
    }
    if(replaced || !modalReady(modal)){ await sleep(120); continue; }
    const confirm = await waitFor(()=>{
      if(!modalReady(modal)) return null;
      return [...document.querySelectorAll('#modal.on #modal-acts button')]
        .find(button=>String(button.textContent || '').trim().toLowerCase() === 'discard selected') || null;
    }, 1500);
    if(!confirm){
      if(!modalReady(modal)){ await sleep(120); continue; }
      result.lastStage = 'hand-limit:confirm-missing';
      return false;
    }
    if(!await waitFor(()=>modalReady(modal) && !confirm.disabled, 1500)){
      if(!modalReady(modal)){ await sleep(120); continue; }
      result.lastStage = 'hand-limit:confirm-disabled';
      return false;
    }
    result.lastStage = 'hand-limit:confirm-click';
    await sleep(100);
    if(!modalReady(modal)){ await sleep(120); continue; }
    confirm.click();
    result.lastStage = 'hand-limit:submitted';
    return true;
  }
  result.lastStage = 'hand-limit:modal-replaced-repeatedly';
  return false;
}

async function selectBoardPickerIids(view, iids){
  result.lastStage = 'prompt:BOARD_TARGET:wait-picker';
  const picker = await waitFor(()=>{
    const candidate = document.querySelector('#modal.on .board-target-picker');
    if(isVisible(candidate)) return candidate;
    // A completed cinematic can release the authoritative prompt one frame
    // before its production picker mounts. Ask the bridge to perform its
    // normal idempotent UI sync while waiting; never submit the prompt here.
    globalThis.FatePhase7CurrentMultiplayerUi?.ensureInteractionUi?.();
    return null;
  }, 10000);
  if(!picker) return false;
  for(const iid of (iids || [])){
    let pos = null;
    (view.state.board || []).forEach((zone,z)=>(zone || []).forEach((row,r)=>(row || []).forEach((card,c)=>{
      if(card && String(card.iid || '') === String(iid)) pos = `${z}:${r}:${c}`;
    })));
    let button = pos && picker.querySelector(`[data-picker-pos="${pos}"]`);
    if(!button){ result.lastStage = `prompt:BOARD_TARGET:missing:${iid}`; return false; }
    button.scrollIntoView({block:'center', inline:'center'});
    await sleep(80);
    button = document.querySelector(`#modal.on .board-target-picker [data-picker-pos="${pos}"]`);
    if(!button){ result.lastStage = `prompt:BOARD_TARGET:remounted:${iid}`; return false; }
    result.lastStage = `prompt:BOARD_TARGET:select:${iid}`;
    button.click();
    let selected = await waitFor(()=>{
      const current = document.querySelector(`#modal.on .board-target-picker [data-picker-pos="${pos}"]`);
      return current?.classList.contains('is-selected');
    }, 1200);
    if(!selected){
      button = document.querySelector(`#modal.on .board-target-picker [data-picker-pos="${pos}"]`);
      if(!button) return false;
      button.click();
      selected = await waitFor(()=>document.querySelector(
        `#modal.on .board-target-picker [data-picker-pos="${pos}"]`
      )?.classList.contains('is-selected'), 1200);
    }
    if(!selected) return false;
  }
  const confirm = await waitFor(()=>visibleButtons().find(button=>{
    if(!button.closest('#modal.on')) return false;
    const label = String(button.textContent || '').trim().toLowerCase();
    return label === 'confirm' || label === 'choose destination';
  }), 1200);
  if(!confirm) return false;
  result.lastStage = 'prompt:BOARD_TARGET:confirm';
  confirm.click();
  return true;
}

async function clickBoardCardWhenReady(iid, timeoutMs = 4000, forceCanvas = false, closeModalImmediatelyBeforeInput = false){
  let position = null;
  let hit = await waitFor(()=>(hitMap()?.cards || []).find(candidate=>
    String(candidate?.iid || candidate?.card?.iid || '') === String(iid || '')
  ), Math.min(timeoutMs, 900));
  position = boardPositionForIid(report(), iid);
  if(!hit && closeModalImmediatelyBeforeInput){
    if(!closeIncidentalModalForConsolidationInput()) return false;
    hit = (hitMap()?.cards || []).find(candidate=>
      String(candidate?.iid || candidate?.card?.iid || '') === String(iid || '')
    ) || null;
    // A visible cell record is not sufficient proof that the card itself is
    // clickable. With expanded/safe rows, a clipped card can share an
    // overlapping canvas point that dispatches to a different square. Let the
    // normal scroll-and-re-resolve path below expose the actual card hit first.
  }
  if(!hit){
    const view = report();
    position = position || boardPositionForIid(view, iid);
    if(position && await scrollBoardPositionIntoView(view, position, iid)){
      hit = await waitFor(()=>(hitMap()?.cards || []).find(candidate=>
        String(candidate?.iid || candidate?.card?.iid || '') === String(iid || '')
      ), Math.max(900, timeoutMs - 900));
    }
  }
  if(closeModalImmediatelyBeforeInput){
    if(!closeIncidentalModalForConsolidationInput()) return false;
    // Closing/remounting a detail modal can rebuild the canvas hit map. Resolve
    // the card again from the fresh geometry. The renderer rebuild can land a
    // frame after the modal reports closed, so wait briefly for the actual card
    // hit instead of falling through to a stale/overlapping cell coordinate.
    hit = (hitMap()?.cards || []).find(candidate=>
      String(candidate?.iid || candidate?.card?.iid || '') === String(iid || '')
    ) || hit;
    if(!hit){
      hit = await waitFor(()=>(hitMap()?.cards || []).find(candidate=>
        String(candidate?.iid || candidate?.card?.iid || '') === String(iid || '')
      ), 900);
    }
  }
  // A card at the clipped edge of the production canvas can have a visible
  // cell hit target while its sprite hit record is omitted. The canonical
  // position still identifies the exact occupied cell a human clicks. Use
  // that genuine board gesture only after scrolling/re-resolving the card.
  if(!hit){
    position = position || boardPositionForIid(report(), iid);
    if(position && hasBoardPosition(position)) return clickBoardPosition(position, forceCanvas);
  }
  return clickBoardHit(hit, forceCanvas);
}

async function closeIncidentalModalBeforeBoardInput(){
  // Card-detail presentation can remount after consolidation has already
  // entered board selection. Require a genuinely stable closed interval and
  // re-close every remount before sending the human-equivalent board click.
  const deadline = Date.now() + 2400;
  let closedSince = 0;
  while(Date.now() < deadline){
    const modal = document.getElementById('modal');
    if(modal?.classList.contains('on')){
      const view = globalThis.FatePhase7CurrentMultiplayerUi?.view?.();
      if(view?.state?.pendingPrompt) return false;
      globalThis.closeModal?.();
      closedSince = 0;
    }else{
      if(!closedSince) closedSince = Date.now();
      if(Date.now() - closedSince >= 500) return true;
    }
    await sleep(50);
  }
  return false;
}

function closeIncidentalModalForConsolidationInput(){
  const modal = document.getElementById('modal');
  if(!modal?.classList.contains('on')) return true;
  // An authoritative prompt owns its modal and must never be dismissed here.
  if(report()?.state?.pendingPrompt || report()?.state?.pendingHandLimit) return false;
  // Consolidation input is dispatched through the renderer canvas in the same
  // task. Close an incidental detail remount immediately so it cannot reclaim
  // the pointer between a long "stable closed" wait and the actual click.
  globalThis.closeModal?.();
  return !document.getElementById('modal')?.classList.contains('on');
}

function phase7ModalCommandButton(command){
  const wantedType = String(command?.type || '');
  const wantedPayload = JSON.stringify(command?.payload || {});
  return [...document.querySelectorAll('#modal.on #modal-acts button')].find(button=>{
    if(!isVisible(button) || button.disabled) return false;
    if(String(button.dataset.phase7CommandType || '') !== wantedType) return false;
    return String(button.dataset.phase7CommandPayload || '') === wantedPayload;
  }) || null;
}

async function submitPhase7ModalCommandWhenShown(command, beforeRevision, timeoutMs = 1200){
  const outcome = await waitFor(()=>{
    const authoritative = report();
    const bridge = globalThis.FatePhase7CurrentMultiplayerUi?.report?.();
    if(Number(authoritative?.revision) !== Number(beforeRevision)
      || Number(bridge?.lastCommandResult?.revision || 0) > Number(beforeRevision)) return {submitted:true};
    const button = phase7ModalCommandButton(command);
    return button ? {button} : null;
  }, timeoutMs);
  if(!outcome) return false;
  if(outcome.submitted) return true;
  outcome.button.click();
  return !!(await waitFor(()=>{
    const authoritative = report();
    const bridge = globalThis.FatePhase7CurrentMultiplayerUi?.report?.();
    return Number(authoritative?.revision) !== Number(beforeRevision)
      || Number(bridge?.lastCommandResult?.revision || 0) > Number(beforeRevision);
  }, 1800));
}

async function restartOnBoardConsolidation(command, beforeRevision, reentryAttempt){
  const current = report();
  const bridge = globalThis.FatePhase7CurrentMultiplayerUi?.report?.();
  if(Number(current?.revision) !== Number(beforeRevision)
    || Number(bridge?.lastCommandResult?.revision || 0) > Number(beforeRevision)) return true;
  if(reentryAttempt >= 3) return false;
  const cardIid = String(command?.payload?.cardIid || '');
  result.lastStage = `consolidation:reenter:${reentryAttempt + 1}`;
  if(!clickHandCard(cardIid)) return false;
  if(!await clickPhase7CardAction('consolidate', cardIid, ()=>clickHandCard(cardIid))) return false;
  const active = await waitFor(()=>globalThis.FatePhase7CurrentMultiplayerUi?.report?.().consolidationActive, 2500);
  if(!active) return false;
  return selectOnBoardConsolidation(
    command?.payload?.tributeIids || [],
    command?.payload?.destination,
    beforeRevision,
    command,
    reentryAttempt + 1
  );
}

async function selectOnBoardConsolidation(tributeIids, destination, beforeRevision, command, reentryAttempt = 0){
  const wanted = (tributeIids || []).map(String);
  const ready = await waitFor(()=>{
    const bridge = globalThis.FatePhase7CurrentMultiplayerUi?.report?.();
    // Entering consolidation is the readiness proof.  The production card
    // detail modal can be remounted one frame later; the per-tribute loop below
    // deliberately closes that incidental view before performing the same
    // board clicks a player would. Requiring the modal to already be closed
    // here prevented that recovery path from ever running.
    return bridge?.consolidationActive;
  }, 3500);
  if(!ready) return false;
  for(const iid of wanted){
    result.lastStage = `consolidation:select-tribute:${iid}`;
    // A card-detail modal can be remounted by the production presentation
    // pipeline after consolidation has already entered board selection. A
    // human closes that incidental detail view before choosing a tribute.
    // Never dismiss an authoritative prompt here.
    if(!closeIncidentalModalForConsolidationInput()) return false;
    if(!globalThis.FatePhase7CurrentMultiplayerUi?.report?.().consolidationActive){
      return restartOnBoardConsolidation(command, beforeRevision, reentryAttempt);
    }
    // Route consolidation tribute clicks through the owned renderer canvas.
    // At a clipped row edge elementFromPoint can resolve the underlying board
    // div even though the canvas owns the interaction; forcing the canvas is
    // equivalent to the user's visible card click and reaches the Phase 7
    // capture handler consistently.
    if(!await clickBoardCardWhenReady(iid, 4000, true, true)) return false;
    if(!globalThis.FatePhase7CurrentMultiplayerUi?.report?.().consolidationActive){
      return restartOnBoardConsolidation(command, beforeRevision, reentryAttempt);
    }
    let selected = await waitFor(()=>{
      const bridge = globalThis.FatePhase7CurrentMultiplayerUi?.report?.();
      return (bridge?.consolidationSelectedIids || []).map(String).includes(iid);
    }, 1500);
    // Canvas input can be intentionally ignored during its short release
    // guard or one-frame renderer handoff. A person naturally clicks again;
    // perform one genuine UI retry only after proving the first click did not
    // select the tribute.
    if(!selected){
      if(!closeIncidentalModalForConsolidationInput()) return false;
      if(!globalThis.FatePhase7CurrentMultiplayerUi?.report?.().consolidationActive){
        return restartOnBoardConsolidation(command, beforeRevision, reentryAttempt);
      }
      if(!await clickBoardCardWhenReady(iid, 4000, true, true)) return false;
      if(!globalThis.FatePhase7CurrentMultiplayerUi?.report?.().consolidationActive){
        return restartOnBoardConsolidation(command, beforeRevision, reentryAttempt);
      }
      selected = await waitFor(()=>{
        const bridge = globalThis.FatePhase7CurrentMultiplayerUi?.report?.();
        return (bridge?.consolidationSelectedIids || []).map(String).includes(iid);
      }, 1500);
    }
    if(!selected) return false;
  }
  const destinationSelected = await waitFor(()=>{
    const bridge = globalThis.FatePhase7CurrentMultiplayerUi?.report?.();
    return bridge?.consolidationActive
      && (bridge?.consolidationSelectedIids || []).length === wanted.length
      && (globalThis.FATE_GAME_STATE || globalThis.getFateGameState?.())?._consolidating?._phase7VisualReady === true;
  }, 2500);
  if(!destinationSelected) return false;
  // The tribute click updates the production input controller's release guard.
  // A human cannot physically press the destination in the same event frame;
  // preserve that real gesture spacing so the destination pointer-up is not
  // discarded as a duplicate of the tribute click.
  await sleep(120);
  result.lastStage = 'consolidation:choose-destination';
  for(let attempt = 0; attempt < 2; attempt += 1){
    // After the last tribute, the shipping UI can promote destination choice
    // into its board-target picker modal. That modal is part of consolidation,
    // not an incidental card-detail view; closing it cancels consolidation and
    // leaves the subsequent canvas click with no active command.
    const picker = document.querySelector('#modal.on .board-target-picker');
    if(isVisible(picker)){
      result.lastStage = 'consolidation:choose-destination-picker';
      if(!await selectBoardPickerDestinations([destination])) return false;
      const submittedFromPicker = await waitFor(()=>{
        const authoritative = report();
        const bridge = globalThis.FatePhase7CurrentMultiplayerUi?.report?.();
        return Number(authoritative?.revision) !== Number(beforeRevision)
          || Number(bridge?.lastCommandResult?.revision || 0) > Number(beforeRevision);
      }, 1500);
      if(submittedFromPicker) return true;
      await sleep(160);
      continue;
    }
    if(!await closeIncidentalModalBeforeBoardInput()) return false;
    if(!globalThis.FatePhase7CurrentMultiplayerUi?.report?.().consolidationActive){
      return restartOnBoardConsolidation(command, beforeRevision, reentryAttempt);
    }
    const destinationTributeIid = wanted.find(iid=>{
      const position = boardPositionForIid(report(), iid);
      return Number(position?.z) === Number(destination?.z)
        && Number(position?.r) === Number(destination?.r)
        && Number(position?.c) === Number(destination?.c);
    });
    const clicked = destinationTributeIid
      ? await clickBoardCardWhenReady(destinationTributeIid, 4000, true, true)
      : clickBoardPosition(destination, true);
    if(!clicked) return false;
    const submitted = await submitPhase7ModalCommandWhenShown(command, beforeRevision, 900);
    if(submitted) return true;
    await sleep(160);
  }
  return false;
}

async function clickBoardDestinationWithRevision(destination, beforeRevision){
  for(let attempt = 0; attempt < 2; attempt += 1){
    // Card-detail presentation may remount after a set/search picker closes.
    // A human dismisses that incidental modal before using the board; do the
    // same and re-check the live destination geometry before each attempt.
    if(document.getElementById('modal')?.classList.contains('on')){
      if(!await closeIncidentalModalBeforeBoardInput()) return false;
    }
    if(!await waitForBoardInteraction(destination)) return false;
    // Destination selection belongs to the renderer canvas even when an empty
    // cell's DOM board layer happens to be above it at elementFromPoint.
    if(!clickBoardPosition(destination, true)) return false;
    const submitted = await waitFor(()=>{
      const authoritative = report();
      const bridge = globalThis.FatePhase7CurrentMultiplayerUi?.report?.();
      return Number(authoritative?.revision) !== Number(beforeRevision)
        || Number(bridge?.lastCommandResult?.revision || 0) > Number(beforeRevision);
    }, 1800);
    if(submitted) return true;
    await sleep(160);
  }
  return false;
}

async function driveAdaptiveTokenDeclaration(payload, beforeRevision){
  const steps = [
    {kind:'placement', value:String(payload.placementType || '').toLowerCase()},
    {kind:'type', value:String(payload.declaredType || '').toLowerCase()},
    {kind:'rarity', value:String(payload.declaredRarity || '').toLowerCase()},
    {kind:'affiliation', value:String(payload.declaredAffiliation || '').toLowerCase()}
  ];
  for(const step of steps){
    result.lastStage = `adaptive-token:${step.kind}:wait`;
    const picker = await waitFor(()=>document.querySelector(
      `#modal.on .achilles-token-picker[data-achilles-kind="${step.kind}"]`
    ), 4000);
    if(!picker) return false;
    const button = [...picker.querySelectorAll('.achilles-token-choice[data-achilles-value]')].find(candidate=>
      String(candidate.dataset.achillesValue || '').toLowerCase() === step.value
    );
    if(!button || !isVisible(button) || button.disabled) return false;
    result.lastStage = `adaptive-token:${step.kind}:click`;
    button.click();
    await sleep(80);
  }
  result.lastStage = 'adaptive-token:wait-authority';
  const submitted = await waitFor(()=>Number(report()?.revision) !== Number(beforeRevision), 5000);
  if(!submitted) return false;
  result.lastStage = 'adaptive-token:verify-rendered-art';
  return !!await waitFor(()=>{
    const hit = (hitMap()?.cards || []).find(candidate=>
      String(candidate?.iid || candidate?.card?.iid || '') === String(payload.cardIid || '')
    );
    const card = hit?.card || hit;
    return !!String(card?.runtimeImg || card?.img || '').trim();
  }, 3000);
}

async function selectBoardPickerDestinations(destinations){
  const picker = await waitFor(()=>{
    const candidate = document.querySelector('.board-target-picker');
    return isVisible(candidate) ? candidate : null;
  });
  if(!picker) return false;
  const activeView = report();
  const prompt = activeView?.state?.pendingPrompt || null;
  const promptSourceIid = String(prompt?.sourceIid || '');
  const promptSourceCardId = String(prompt?.semanticSourceCardId || sourceCardId(activeView, promptSourceIid) || '');
  for(const destination of (destinations || [])){
    const key = `${Number(destination.z)}:${Number(destination.r)}:${Number(destination.c)}`;
    let button = picker.querySelector(`[data-picker-pos="${key}"]`);
    if(!button) return false;
    if(button.classList.contains('is-selected')){
      recordError('Board destination was preselected before the player clicked it', {
        stage:'board-picker-selection', promptSourceCardId, promptSourceIid, destination:key
      });
      return false;
    }
    button.click();
    let selected = await waitFor(()=>document.querySelector(
      `#modal.on .board-target-picker [data-picker-pos="${key}"]`
    )?.classList.contains('is-selected'), 1200);
    if(!selected){
      button = document.querySelector(`#modal.on .board-target-picker [data-picker-pos="${key}"]`);
      if(!button) return false;
      button.click();
      selected = await waitFor(()=>document.querySelector(
        `#modal.on .board-target-picker [data-picker-pos="${key}"]`
      )?.classList.contains('is-selected'), 1200);
    }
    if(!selected) return false;
    result.boardPickerSelections.push({
      at:Date.now(),
      promptSourceCardId,
      promptSourceIid,
      destination:key,
      selectedByVisibleClick:true
    });
    if(result.boardPickerSelections.length > 80) result.boardPickerSelections.shift();
  }
  return clickButton('Confirm');
}

async function clickBoardPickerConfirmWhenReady(){
  const button = await waitFor(()=>{
    const picker = document.querySelector('#modal.on .board-target-picker');
    if(!isVisible(picker)) return null;
    return [...document.querySelectorAll('#modal.on #modal-acts button')].find(candidate=>
      isVisible(candidate) && !candidate.disabled && String(candidate.textContent || '').trim().toLowerCase() === 'confirm'
    ) || null;
  }, 2500);
  if(!button) return false;
  button.click();
  return true;
}

async function clickVisualPickerConfirmWhenReady(){
  const button = await waitFor(()=>{
    const canvas = document.querySelector('#modal.on #visual-page-canvas');
    if(!isVisible(canvas)) return null;
    return [...document.querySelectorAll('#modal.on #modal-acts button')].find(candidate=>
      isVisible(candidate) && !candidate.disabled && String(candidate.textContent || '').trim().toLowerCase() === 'confirm'
    ) || null;
  }, 2500);
  if(!button) return false;
  button.click();
  return true;
}

async function drivePrompt(view, command){
  const payload = command.payload || {};
  const promptType = String(view.state.pendingPrompt?.type || '');
  const promptId = String(view.state.pendingPrompt?.promptId || '');
  result.lastStage = 'prompt:' + (promptType || 'unknown');
  result.lastPromptDrive = {promptType, promptId, payload};
  if(promptType === 'MODAL_CHOICE' && payload.choice !== undefined){
    // Cards 51/66/77/90 reuse the shipping single-player affiliation picker.
    // That picker can mount after the online bridge's first metadata pass, so
    // its visible buttons legitimately have data-aff before they receive the
    // optional Phase 7 prompt attributes. A player selects the declared
    // affiliation through data-aff; exercise that same exact control instead
    // of timing out and allowing a later board command behind the open modal.
    const affiliation = await waitFor(()=>[...document.querySelectorAll('#modal.on .aff-pick-square[data-aff]')]
      .find(button=>isVisible(button)
        && !button.disabled
        && String(button.dataset.phase7AuthoritativeAffiliationBound || '') === promptId
        && String(button.dataset.aff || '') === String(payload.choice)), 8000);
    if(affiliation){
      affiliation.click();
      // The presentation transaction closes the modal before releasing its
      // wrapped callback. Under a busy multi-tab run that release can outlive
      // the generic gesture window even though the player made the correct
      // visible selection, so wait for the authoritative acknowledgement here.
      return waitForRevisionChange(Number(view.revision || 0), 8000);
    }
  }
  if(promptType === 'MODAL_CHOICE' && /^igb\d+$/i.test(String(payload.choice || ''))){
    // The reused single-player landscape picker is paginated. Exercise its
    // real Next controls until the exact authoritative choice is visible;
    // never substitute the first legal landscape merely because it is on the
    // initial page.
    const pickerReady = await waitFor(()=>[...document.querySelectorAll('#modal.on .landscape-choice-card[data-landscape-id]')]
      .some(isVisible), 10000);
    if(pickerReady) for(let page = 0; page < 8; page += 1){
      const visibleCards = [...document.querySelectorAll('#modal.on .landscape-choice-card[data-landscape-id]')]
        .filter(isVisible);
      const card = visibleCards
        .find(button=>isVisible(button) && String(button.dataset.landscapeId || '') === String(payload.choice));
      if(card){ card.click(); return true; }
      const next = visibleButtons().find(button=>String(button.textContent || '').trim().toLowerCase() === 'next');
      if(!next) break;
      const priorIds = visibleCards.map(button=>String(button.dataset.landscapeId || '')).join(',');
      next.click();
      await waitFor(()=>{
        const nextIds = [...document.querySelectorAll('#modal.on .landscape-choice-card[data-landscape-id]')]
          .filter(isVisible).map(button=>String(button.dataset.landscapeId || '')).join(',');
        return nextIds && nextIds !== priorIds;
      }, 1000);
    }
  }
  if(payload.choice !== undefined || payload.zone !== undefined){
    const exact = await waitFor(()=>visibleButtons().find(button=>{
      if(String(button.dataset.phase7PromptId || '') !== promptId) return false;
      if(payload.choice !== undefined) return String(button.dataset.phase7PromptChoice || '') === String(payload.choice);
      return String(button.dataset.phase7PromptZone || '') === String(payload.zone);
    }), 2500);
    if(exact){ exact.click(); return true; }
  }
  if(payload.cancel === true){
    const exactCancel = await waitFor(()=>visibleButtons().find(button=>
      String(button.dataset.phase7PromptId || '') === promptId
        && String(button.dataset.phase7PromptCancel || '') === 'true'
    ), 2500);
    if(exactCancel){ exactCancel.click(); return true; }
  }
  if(Array.isArray(payload.destinations)) return selectBoardPickerDestinations(payload.destinations);
  if(payload.destination){
    const picker = await waitFor(()=>{
      const candidate = document.querySelector('.board-target-picker');
      return isVisible(candidate) ? candidate : null;
    }, 2500);
    return picker
      ? selectBoardPickerDestinations([payload.destination])
      : (await waitForBoardInteraction(payload.destination) && clickBoardPosition(payload.destination));
  }
  if(Array.isArray(payload.selectedIids)){
    if(payload.selectedIids.length === 0){
      return promptType === 'BOARD_TARGET'
        ? clickBoardPickerConfirmWhenReady()
        : clickVisualPickerConfirmWhenReady();
    }
    return promptType === 'BOARD_TARGET'
      ? selectBoardPickerIids(view, payload.selectedIids)
      : selectVisualPickerIids(view, payload.selectedIids);
  }
  if(payload.selectedIid){
    return promptType === 'BOARD_TARGET'
      ? selectBoardPickerIids(view, [payload.selectedIid])
      : selectVisualPickerIids(view, [payload.selectedIid]);
  }
  return clickButton(String(globalThis.fatePhase7CommandLabel?.(command) || payload.choice || (payload.cancel ? 'Cancel' : '')), false)
    || clickButton(String(payload.choice || ''), true)
    || (payload.zone !== undefined && clickButton('Zone ' + (Number(payload.zone) + 1), true))
    || (payload.cancel === true && clickButton('Cancel'));
}

async function clickPhase7CardAction(action, iid, reopen){
  const findButton = ()=>[...document.querySelectorAll('#modal.on [data-phase7-action]')].find(button=>
    isVisible(button)
      && String(button.dataset.phase7Action || '') === String(action || '')
      && String(button.dataset.phase7Iid || '') === String(iid || '')
  ) || null;
  let button = await waitFor(findButton, 2800);
  if(!button && typeof reopen === 'function'){
    globalThis.closeModal?.();
    await sleep(80);
    if(!reopen()) return false;
    button = await waitFor(findButton, 2800);
  }
  if(!button) return false;
  button.click();
  return true;
}

async function driveCommand(view, command){
  const payload = command.payload || {};
  if(command.type === 'DISCARD_TO_HAND_LIMIT'){
    // The current multiplayer UI deliberately reuses the single-player
    // hand-limit grid. A visual picker canvas can remain mounted from an
    // unrelated effect, so it is not evidence that the hand-limit UI is ready.
    result.lastStage = 'hand-limit:wait-picker';
    const picker = await waitFor(()=>{
      const candidate = document.querySelector('#modal.on .phase7-hand-limit-discard');
      if(candidate?.isConnected) return candidate;
      // Ask the production bridge to restore its own mandatory picker. This
      // is the same idempotent sync used after authoritative snapshots; it
      // never submits or bypasses a game command.
      globalThis.FatePhase7CurrentMultiplayerUi?.ensureInteractionUi?.();
      return null;
    }, 20000);
    return !!picker && await selectHandLimitIids(payload.discardedIids || []);
  }
  // A card effect prompt can remain serialized behind a mandatory hand-limit
  // choice.  The shipping UI presents the hand limit first, so the driver must
  // honor the selected legal command before considering pendingPrompt.
  if(view.state.pendingPrompt) return drivePrompt(view, command);
  if(['SET_CARD','SET_ADAPTIVE_TOKEN'].includes(command.type)){
    result.lastStage = 'set:click-hand';
    if(!await clickHandCardWhenReady(payload.cardIid)) return false;
    result.lastStage = 'set:click-button';
    if(!await clickPhase7CardAction('place', payload.cardIid, ()=>clickHandCard(payload.cardIid))){ result.lastModal = captureModalDebug(); return false; }
    result.lastStage = 'set:wait-close';
    if(!await waitFor(()=>!document.getElementById('modal')?.classList.contains('on'))) return false;
    await sleep(120);
    result.lastStage = 'set:wait-destination';
    if(!await waitForBoardInteraction(payload.destination)) return false;
    result.lastStage = 'set:click-destination';
    if(command.type === 'SET_ADAPTIVE_TOKEN'){
      if(!clickBoardPosition(payload.destination)) return false;
      return driveAdaptiveTokenDeclaration(payload, view.revision);
    }
    return clickBoardDestinationWithRevision(payload.destination, view.revision);
  }
  if(command.type === 'CONSOLIDATE_CARD'){
    result.lastStage = 'consolidation:click-hand';
    if(!await clickHandCardWhenReady(payload.cardIid)) return false;
    result.lastStage = 'consolidation:click-button';
    if(!await clickPhase7CardAction('consolidate', payload.cardIid, ()=>clickHandCard(payload.cardIid))){ result.lastModal = captureModalDebug(); return false; }
    result.lastStage = 'consolidation:select-tributes';
    return selectOnBoardConsolidation(payload.tributeIids || [], payload.destination, view.revision, command);
  }
  if(command.type === 'ACTIVATE_EFFECT'){
    if(sourceCardId(view, payload.sourceIid) === '40'){
      // Christopher is explicitly player-timed. Prove that merely waiting on
      // his legal Activate Effect button does not spend a use automatically.
      result.lastStage = 'activate:christopher-manual-pause';
      const beforePauseRevision = Number(view.revision);
      await sleep(650);
      const afterPause = report();
      const stillLegal = (afterPause?.legalCommands || []).some(candidate=>
        candidate?.type === 'ACTIVATE_EFFECT'
          && String(candidate?.payload?.sourceIid || '') === String(payload.sourceIid || '')
      );
      result.manualActivationPauses.push({
        cardId:'40',
        sourceIid:String(payload.sourceIid || ''),
        beforePauseRevision,
        afterPauseRevision:Number(afterPause?.revision),
        stillLegal,
        waitedMs:650
      });
      if(Number(afterPause?.revision) !== beforePauseRevision || !stillLegal){
        recordError('Christopher Erbs activated before the visible Activate Effect button was clicked', {
          stage:'christopher-negative-ui-oracle',
          sourceIid:String(payload.sourceIid || ''),
          beforePauseRevision,
          afterPauseRevision:Number(afterPause?.revision),
          stillLegal
        });
        return false;
      }
    }
    if(!await clickBoardCardWhenReady(payload.sourceIid)) return false;
    return clickPhase7CardAction('activate', payload.sourceIid, ()=>clickBoardCard(payload.sourceIid));
  }
  if(command.type === 'DISCARD_CARD'){
    result.lastStage = 'discard:click-card';
    if(!await clickBoardCardWhenReady(payload.targetIid)) return false;
    result.lastStage = 'discard:click-button';
    return clickPhase7CardAction('discard', payload.targetIid, ()=>clickBoardCard(payload.targetIid));
  }
  if(command.type === 'MOVE_CARD'){
    result.lastStage = 'move:click-card';
    if(!await clickBoardCardWhenReady(payload.cardIid)) return false;
    result.lastStage = 'move:click-button';
    if(!await clickPhase7CardAction('move', payload.cardIid, ()=>clickBoardCard(payload.cardIid))) return false;
    result.lastStage = 'move:wait-close';
    if(!await waitFor(()=>!document.getElementById('modal')?.classList.contains('on'))) return false;
    await sleep(120);
    result.lastStage = 'move:wait-destination';
    if(!await waitForBoardInteraction(payload.destination)) return false;
    result.lastStage = 'move:click-destination';
    return clickBoardDestinationWithRevision(payload.destination, view.revision);
  }
  if(command.type === 'FLIP_CARD'){
    if(!await clickBoardCardWhenReady(payload.cardIid)) return false;
    return clickPhase7CardAction('flip', payload.cardIid, ()=>clickBoardCard(payload.cardIid));
  }
  if(command.type === 'SET_CARD_FROM_DECK'){
    const privateCard = (view.privateActionCards || []).find(card=>String(card?.iid || '') === String(payload.cardIid || ''));
    const cardId = String(privateCard?.id || '');
    result.lastStage = 'set-from-deck:open-deck-window';
    const ownDeck = await waitFor(()=>{
      const node = document.getElementById('my-deck');
      return isVisible(node) ? node : null;
    }, 4000);
    if(!ownDeck) return false;
    ownDeck.click();
    result.lastStage = 'set-from-deck:click-card-action:' + cardId;
    const cardAction = await waitFor(()=>{
      const button = document.querySelector('#modal.on [data-phase7-deck-set-card-id="' + cardId + '"]');
      return isVisible(button) ? button : null;
    }, 4000);
    if(!cardAction) return false;
    cardAction.click();
    result.lastStage = 'set-from-deck:select-card';
    if(!await selectVisualPickerIids(view, [payload.cardIid], view.privateActionCards || [])) return false;
    result.lastStage = 'set-from-deck:wait-close';
    if(!await waitFor(()=>!document.getElementById('modal')?.classList.contains('on'))) return false;
    await sleep(120);
    result.lastStage = 'set-from-deck:wait-destination';
    if(!await waitForBoardInteraction(payload.destination)) return false;
    result.lastStage = 'set-from-deck:click-destination';
    return clickBoardDestinationWithRevision(payload.destination, view.revision);
  }
  if(command.type === 'ACTIVATE_LANDSCAPE'){
    const wantedCommandKey = commandKey(command);
    const wantedRevision = String(view?.revision ?? view?.state?.revision ?? '');
    let button = await waitFor(()=>visibleButtons().find(candidate=>
      String(candidate.dataset.phase7CommandType || '') === 'ACTIVATE_LANDSCAPE'
        && String(candidate.dataset.phase7CommandKey || '') === wantedCommandKey
        && String(candidate.dataset.phase7CommandRevision || '') === wantedRevision
    ), 300);
    if(button){ button.click(); return true; }
    result.lastStage = 'landscape:open-current-action';
    const opened = await waitFor(()=>clickUiCommand('phase7-activate-landscape'), 2500);
    if(!opened){
      result.lastLandscapeUi = {
        wantedCommandKey,
        wantedRevision,
        uiCommands:(hitMap()?.uiCommands || []).map(candidate=>String(candidate?.command || '')),
        buttons:visibleButtons().filter(candidate=>candidate.dataset.phase7CommandType).map(candidate=>({
          text:String(candidate.textContent || '').trim(),
          type:String(candidate.dataset.phase7CommandType || ''),
          key:String(candidate.dataset.phase7CommandKey || ''),
          revision:String(candidate.dataset.phase7CommandRevision || '')
        }))
      };
      return false;
    }
    result.lastStage = 'landscape:choose-exact-command';
    let autoSubmitted = false;
    button = await waitFor(()=>{
      const exact = visibleButtons().find(candidate=>
        String(candidate.dataset.phase7CommandType || '') === 'ACTIVATE_LANDSCAPE'
          && String(candidate.dataset.phase7CommandKey || '') === wantedCommandKey
          && String(candidate.dataset.phase7CommandRevision || '') === wantedRevision
      );
      if(exact) return exact;
      // A single legal landscape command is intentionally submitted directly
      // by the shipping UI and never opens a choice modal. Recognize that
      // accepted authoritative revision instead of waiting for nonexistent UI.
      const next = report();
      const bridge = globalThis.FatePhase7CurrentMultiplayerUi?.report?.();
      const accepted = (next && Number(next.revision) !== Number(view.revision))
        || (bridge && Number(bridge.revision) !== Number(view.revision))
        || (bridge?.lastCommandResult?.ok === true
          && Number(bridge.lastCommandResult.revision) > Number(view.revision));
      if(accepted){ autoSubmitted = true; return true; }
      return null;
    // Multi-choice landscapes still wait for and click the genuine modal.
    }, 6500);
    if(autoSubmitted) return true;
    if(!button){
      result.lastLandscapeUi = {
        wantedCommandKey,
        wantedRevision,
        modal:captureModalDebug(),
        buttons:visibleButtons().filter(candidate=>candidate.dataset.phase7CommandType).map(candidate=>({
          text:String(candidate.textContent || '').trim(),
          type:String(candidate.dataset.phase7CommandType || ''),
          key:String(candidate.dataset.phase7CommandKey || ''),
          revision:String(candidate.dataset.phase7CommandRevision || '')
        }))
      };
      return false;
    }
    button.click();
    return true;
  }
  if(command.type === 'END_TURN') return clickUiCommand('end-turn');
  return false;
}

async function waitForRevisionChange(before, timeoutMs = 3500){
  return !!await waitFor(()=>{
    const next = report();
    const bridge = globalThis.FatePhase7CurrentMultiplayerUi?.report?.();
    return (next && Number(next.revision) !== Number(before))
      || (bridge && Number(bridge.revision) !== Number(before))
      // Production presentation can intentionally hold the visible snapshot
      // at the old revision for longer than this gesture timeout. The shipping
      // UI bridge still records the accepted authoritative result immediately;
      // that is conclusive success and must not be retried as a stale command.
      || (bridge?.lastCommandResult?.ok === true
        && Number(bridge.lastCommandResult.revision) > Number(before));
  }, timeoutMs);
}

async function submitDiagnosticFallback(view, command, before, failureKind){
  const entry = {
    at:Date.now(),
    matchId:String(view?.state?.matchId || ''),
    turn:Number(view?.state?.turn || 0),
    revision:Number(before || 0),
    commandType:String(command?.type || ''),
    commandPayload:command?.payload || {},
    failureKind:String(failureKind || 'UI_DRIVE_FAILED'),
    advanced:false
  };
  result.uiFallbacks.push(entry);
  if(!diagnosticFallbackEnabled){
    entry.error = exactShippingPathMode
      ? 'Direct command fallback is forbidden in the exact shipping-path harness'
      : 'Direct command fallback is disabled; add e2eAllowDiagnosticFallback=1 only for diagnostic runs';
    publish();
    return false;
  }
  try{
    if(typeof beta()?.sendCommand !== 'function') throw new Error('Authoritative diagnostic fallback is unavailable');
    await beta().sendCommand(command.type, command.payload || {});
    entry.advanced = await waitForRevisionChange(before, 5000);
    if(!entry.advanced) throw new Error('Fallback command did not advance the authoritative revision');
    result.fallbackActions += 1;
    result.actions += 1;
    lastProgressAt = Date.now();
    note(result.commandTypes, command.type);
    noteCommandCard(view, command);
    globalThis.closeModal?.({forceHandLimitClose:true});
    publish();
    return true;
  }catch(error){
    entry.error = String(error?.message || error);
    publish();
    return false;
  }
}

function currentCrossSeatEvidence(view){
  const matchId = String(view?.state?.matchId || detailsMatchIdFallback() || '');
  const revision = Number(view?.state?.revision ?? view?.revision ?? 0);
  const evidence = {};
  if(!matchId) return evidence;
  try{
    for(const seatKey of ['A','B']){
      const value = localStorage.getItem(`${CROSS_SEAT_PREFIX}${runId}:${seatKey}`);
      if(!value) continue;
      const snapshot = JSON.parse(value);
      if(String(snapshot?.matchId || '') === matchId && Number(snapshot?.revision) === revision) evidence[seatKey] = snapshot;
    }
  }catch(_){ }
  return evidence;
}

function detailsMatchIdFallback(){
  return matchStart?.matchId || '';
}

function recordError(message, details = {}){
  const failureKey = JSON.stringify([
    String(message || 'unknown error'),
    details.stage || '',
    details.commandType || '',
    details.revision ?? ''
  ]);
  if(failureKey === lastFailureKey && Date.now() - lastFailureAt < 2000) return;
  lastFailureKey = failureKey;
  lastFailureAt = Date.now();
  const view = report();
  const classification = classifyFailure(message, details);
  note(result.failureClassifications, classification);
  const errorEntry = {
    at:Date.now(),
    message:String(message || 'unknown error'),
    classification,
    ...details,
    lastPointer:result.lastPointer || null,
    lastHandHit:result.lastHandHit || null,
    lastBoardHit:result.lastBoardHit || null,
    lastModal:result.lastModal || null,
    lastStage:result.lastStage || '',
    bridge:globalThis.FatePhase7CurrentMultiplayerUi?.report?.() || null,
    sceneInput:(globalThis.__fatePerf?.sceneInputDebug || []).slice(-36)
  };
  result.errors.push(errorEntry);
  if(result.errors.length > 200) result.errors.shift();
  const revision = Number(details.revision ?? view?.state?.revision ?? view?.revision ?? 0);
  const matchId = String(details.matchId || view?.state?.matchId || matchStart?.matchId || '');
  const replayKey = [runId, currentOrganicGameIndex(), matchId, revision, details.commandType || details.stage || 'unknown'].join(':');
  result.failureBundles.push({
    version:1,
    replayKey,
    classification,
    error:errorEntry,
    gameIndex:currentOrganicGameIndex(),
    matchId,
    revision,
    lastAcceptedRevision:revision,
    seat,
    deckFixture:result.queuedDecks.at(-1) || null,
    legalCommand:details.commandType ? {type:details.commandType, payload:details.commandPayload || {}} : null,
    modal:captureModalDebug(),
    crossSeatSnapshots:currentCrossSeatEvidence(view),
    presentationTrace:result.presentationTrace.slice(-48),
    oracleFindings:result.oracleViolations.slice(-24),
    domFindings:result.domViolations.slice(-24),
    renderedUi:{
      turnHud:normalizedUiText(document.getElementById('turn-hud-turn')?.textContent),
      turnOwner:normalizedUiText(document.getElementById('turn-hud-player')?.textContent),
      modal:captureModalDebug(),
      effects:renderedEffectPills(),
      hitMapCounts:Object.fromEntries(Object.entries(hitMap() || {}).filter(([,value])=>Array.isArray(value)).map(([key,value])=>[key,value.length]))
    },
    inputTrace:(globalThis.__fatePerf?.sceneInputDebug || []).slice(-36),
    shippingUiReport:globalThis.FatePhase7CurrentMultiplayerUi?.report?.() || null
  });
  if(result.failureBundles.length > 100) result.failureBundles.shift();
  publish();
}

function installShippingErrorObservers(){
  if(globalThis.__fatePhase7ShippingErrorObserversInstalled) return;
  globalThis.__fatePhase7ShippingErrorObserversInstalled = true;
  globalThis.addEventListener('error', event=>{
    if(result.finishedAt || abandonMatchInFlight) return;
    const message = String(event?.error?.stack || event?.error?.message || event?.message || 'Unhandled browser error');
    recordError(message, {stage:'browser-error', filename:String(event?.filename || ''), line:Number(event?.lineno || 0)});
  });
  globalThis.addEventListener('unhandledrejection', event=>{
    if(result.finishedAt || abandonMatchInFlight) return;
    const reason = event?.reason;
    recordError(String(reason?.stack || reason?.message || reason || 'Unhandled promise rejection'), {stage:'unhandled-rejection'});
  });
  const originalConsoleError = globalThis.console?.error?.bind(globalThis.console);
  if(originalConsoleError){
    globalThis.console.error = function(...args){
      originalConsoleError(...args);
      if(result.finishedAt || abandonMatchInFlight) return;
      const message = args.map(value=>{
        if(value instanceof Error) return value.stack || value.message;
        if(typeof value === 'string') return value;
        try { return JSON.stringify(value); } catch(_){ return String(value); }
      }).join(' ');
      recordError('Console error: ' + message, {stage:'console-error'});
    };
  }
}

installShippingErrorObservers();

function beginMatch(view){
  const targets = queuedOrganicTargets.slice();
  targets.forEach(id=>{ organicCoverage(id).assignedMatches += 1; });
  const startRevision = Number(view?.state?.revision || 0);
  const observedFromAuthoritativeStart = startRevision <= 1;
  const canonicalReinforcementPolicy = view?.state?.testRules?.zeroReinforcementCost === true
    ? 'ZERO_COST'
    : 'REAL';
  // A second seat can attach after the authority has already created the fixture.
  // Its locally queued scenario metadata is not evidence about that in-flight
  // match, which is already treated as a warm-up and excluded from certification.
  if(observedFromAuthoritativeStart && canonicalReinforcementPolicy !== queuedReinforcementPolicy.key){
    recordError('Authoritative fixture reinforcement policy differs from the requested scenario policy', {
      stage:'fixture-policy',
      requested:queuedReinforcementPolicy.key,
      canonical:canonicalReinforcementPolicy
    });
  }
  matchStart = {
    gameIndex:currentOrganicGameIndex(),
    matchId:String(view.state.matchId || ''),
    startTurn:Number(view.state.turn || 0),
    startRevision,
    actions:result.actions,
    errors:result.errors.length,
    fallbackActions:result.fallbackActions,
    presentationTimingViolations:result.presentationTimingViolations.length,
    presentationTrace:result.presentationTrace.length,
    oracleViolations:result.oracleViolations.length,
    domViolations:result.domViolations.length,
    crossSeatViolations:result.crossSeatViolations.length,
    failureBundles:result.failureBundles.length,
    drawSequences:result.drawSequences.length,
    boardPickerSelections:result.boardPickerSelections.length,
    cardPickerSelections:result.cardPickerSelections.length,
    oracleCheckStart:Object.fromEntries(targets.map(id=>[id, Number(result.oracleCardChecks[id] || 0)])),
    oracleBranchStart:Object.fromEntries(targets.map(id=>[id, prefixedCountSnapshot(result.oracleCardBranches, id)])),
    obligationEvidenceStart:Object.fromEntries(targets.map(id=>[id, obligationEvidenceSnapshot(id)])),
    landscapeId:String(view.state.landscapeId || ''),
    organicVariant:organicVariantContract().key,
    organicVariantIndex:organicVariant(),
    organicPartners:queuedOrganicPartners.slice(),
    organicTargets:targets,
    reinforcementPolicy:canonicalReinforcementPolicy,
    reinforcementPolicyReason:queuedReinforcementPolicy.reason,
    plannedObligations:Object.fromEntries(targets.map(cardId=>[
      cardId,
      plannedObligationsForScenario(cardId, organicVariant())
    ])),
    organicCommandStart:Object.fromEntries(targets.map(id=>[id, Number(result.cardIds[id] || 0)])),
    organicObservedActionStart:Object.fromEntries(targets.map(id=>[id, Number(result.observedActionCardIds[id] || 0)])),
    organicEffectStart:Object.fromEntries(targets.map(id=>[id, Number(result.effectEventCardIds[id] || 0)])),
    organicResolvedEffectStart:Object.fromEntries(targets.map(id=>[id, Number(result.resolvedEffectCardIds[id] || 0)])),
    organicSourceOverlayStart:Object.fromEntries(targets.map(id=>{
      return [id, sourceOverlayEvidenceCount(id)];
    })),
    organicBranchStart:Object.fromEntries(targets.map(id=>[id, prefixedCountSnapshot(result.effectBranches, id)]))
    ,organicPartnerCommandStart:Object.fromEntries(queuedOrganicPartners.map(id=>[id, Number(result.cardIds[id] || 0)]))
    ,organicPartnerObservedActionStart:Object.fromEntries(queuedOrganicPartners.map(id=>[id, Number(result.observedActionCardIds[id] || 0)]))
    ,organicPartnerEffectStart:Object.fromEntries(queuedOrganicPartners.map(id=>[id, Number(result.effectEventCardIds[id] || 0)]))
    ,organicPartnerOracleStart:Object.fromEntries(queuedOrganicPartners.map(id=>[id, Number(result.oracleCardChecks[id] || 0)]))
  };
  note(result.landscapes, matchStart.landscapeId);
  captureTargetAvailability(view, 'match-start');
}

async function abandonStalledMatch(view, reason, details = {}){
  if(abandonMatchInFlight) return false;
  abandonMatchInFlight = true;
  const stalledGameIndex = Number(matchStart?.gameIndex ?? currentOrganicGameIndex());
  const stalledMatchId = String(view?.state?.matchId || matchStart?.matchId || '');
  writeAbandonBarrier(stalledMatchId, stalledGameIndex, reason);
  const failure = {
    ...details,
    stage:'stall-watchdog',
    matchId:String(view?.state?.matchId || matchStart?.matchId || ''),
    revision:Number(view?.state?.revision ?? view?.revision ?? 0),
    turn:Number(view?.state?.turn || 0),
    pendingPrompt:view?.state?.pendingPrompt || null,
    pendingHandLimit:view?.state?.pendingHandLimit || null
  };
  recordError(String(reason || 'Shipping UI scenario stalled'), failure);
  result.failedGames += 1;
  result.matches.push({
    ...(matchStart || {}),
    failed:true,
    failureReason:String(reason || 'Shipping UI scenario stalled'),
    endRevision:failure.revision,
    actionCount:matchStart ? result.actions - matchStart.actions : 0,
    errorCount:matchStart ? result.errors.length - matchStart.errors : 1,
    completeFromStart:false
  });
  if(result.matches.length > 100) result.matches.shift();
  writeCheckpoint(currentOrganicGameIndex());
  publish();
  try{
    // A paired production-UI fixture is one certification unit. Do not let one
    // seat create the next match while its peer still drives this failed one.
    // The peer sees our barrier in its normal loop and records the same failed
    // scenario; both then leave matchmaking together.
    const peerBarrier = await waitForPeerAbandonBarrier(stalledMatchId, stalledGameIndex);
    if(!peerBarrier) recordError('Peer did not acknowledge the shared stalled-match barrier', {
      stage:'stall-recovery-barrier', matchId:stalledMatchId, gameIndex:stalledGameIndex
    });
    globalThis.closeModal?.({forceHandLimitClose:true});
    beta()?.unmountGameScreen?.();
    beta()?.disconnect?.({forget:true});
    await sleep(100);
    if(result.completedGames + result.failedGames < targetGames) await queueNextMatch();
  }catch(error){
    recordError(error?.message || error, {stage:'stall-recovery'});
  }finally{
    matchStart = null;
    lastProgressAt = Date.now();
    abandonMatchInFlight = false;
  }
  return true;
}

async function queueNextMatch(){
  const gameIndex = currentOrganicGameIndex();
  const organicScenario = organicScenarioForGame(gameIndex);
  organicTargetCommandsThisMatch = new Set();
  organicPartnerCommandsThisMatch = new Set();
  manualDiscardCoveredThisMatch = false;
  queuedOrganicTargets = organicTargetsForGame(gameIndex);
  const variantContract = ORGANIC_VARIANTS[organicScenario?.variantIndex ?? (Math.max(0, gameIndex) % ORGANIC_VARIANTS.length)];
  queuedOrganicPartners = organicCardCampaign
    ? organicPartnersForGame(gameIndex, queuedOrganicTargets)
    : [];
  const focusPool = focusedCardIds.length ? focusedCardIds : eligibleCardIds;
  const offset = (gameIndex * 17 + (seat.toUpperCase() === 'B' ? 31 : 0)) % focusPool.length;
  const rotatedFocus = Array.from({length:focusPool.length}, (_, index)=>focusPool[(offset + index) % focusPool.length]);
  // Production matchmaking enforces rarity-aware copy limits. Use every
  // focused card at most once, then fill a short family with unique helpers.
  const helperIds = eligibleCardIds.filter(id=>!focusedCardIdSet.has(id));
  const landscapeId = requestedLandscapeId || (focusedLandscapeIds.length
    ? focusedLandscapeIds[gameIndex % focusedLandscapeIds.length]
    : (organicCardCampaign
        ? organicLandscapeForGame(gameIndex, queuedOrganicTargets[0])
        : `igb${(gameIndex % 20) + 1}`));
  queuedReinforcementPolicy = organicCardCampaign
    ? reinforcementPolicyForScenario(gameIndex, queuedOrganicTargets[0], landscapeId)
    : Object.freeze({key:'REAL',zeroReinforcementCost:false,reason:'NON_ORGANIC'});
  const exactScenario = organicCardCampaign
    ? exactOrganicScenarioDeck(queuedOrganicTargets, queuedOrganicPartners, gameIndex, seat, organicScenario?.variantIndex ?? 0)
    : null;
  const deckIds = exactScenario?.deckIds || [...new Set([...rotatedFocus, ...helperIds])].slice(0, 40);
  queuedOpeningScaffoldIds = organicCardCampaign
    ? zeroCostOpeningScaffoldIds(queuedOrganicTargets, queuedOrganicPartners, deckIds)
    : [];
  result.queuedDecks.push({
    gameIndex,
    landscapeId,
    exactScenarioDeck:!!exactScenario,
    scenarioCardIds:exactScenario?.scenarioIds || [],
    deckIds:[...deckIds],
    deckCardCounts:Object.fromEntries([...new Set(deckIds)].map(id=>[id, deckIds.filter(value=>value === id).length])),
    focusCardIds:deckIds.filter(id=>focusedCardIdSet.has(id)),
    helperCardIds:deckIds.filter(id=>!focusedCardIdSet.has(id))
    ,organicTargets:queuedOrganicTargets.slice()
    ,organicVariant:variantContract.key
    ,organicVariantIndex:organicScenario?.variantIndex ?? 0
    ,organicRequiredMatches:organicScenario?.requiredMatches ?? 0
    ,organicPartners:queuedOrganicPartners.slice()
    ,openingScaffoldIds:queuedOpeningScaffoldIds.slice()
    ,plannedObligations:queuedOrganicTargets.flatMap(cardId=>plannedObligationsForScenario(cardId, organicScenario?.variantIndex ?? 0))
    ,reinforcementPolicy:queuedReinforcementPolicy
  });
  if(result.queuedDecks.length > 30) result.queuedDecks.shift();
  document.querySelectorAll('.effect-activation-cinematic').forEach(node=>node.remove());
  globalThis.closeModal?.();
  beta().unmountGameScreen?.();
  beta().disconnect?.({forget:true});
  await sleep(80);
  await beta().startUnrankedMatchmaking({
    deckIds,
    name:`E2E ${runId} ${seat}`,
    landscapeId,
    testOpeningCardIds:organicCardCampaign
      ? [...queuedOrganicTargets.filter(id=>
          !organicDeckHeldTargets(queuedOrganicTargets).includes(id)
          && !organicDeckTopTargets(queuedOrganicTargets).includes(id)
        ), ...queuedOrganicPartners, ...queuedOpeningScaffoldIds]
      : [],
    testDeckCardIds:organicCardCampaign ? organicDeckHeldTargets(queuedOrganicTargets) : [],
    testDeckTopCardIds:organicCardCampaign ? organicDeckTopTargets(queuedOrganicTargets) : [],
    testRules:organicCardCampaign && queuedReinforcementPolicy.zeroReinforcementCost
      ? {zeroReinforcementCost:true}
      : null
  });
  matchStart = null;
}

async function loop(){
  result.running = true;
  publish();
  await waitForPeerTestClientReady();
  while(!stopped && !claimTestRunLock()){
    result.stopReason = 'waiting-for-isolated-test-queue';
    publish();
    await sleep(200);
  }
  if(result.stopReason === 'waiting-for-isolated-test-queue') result.stopReason = '';
  if(fastUiMode){
    document.documentElement.classList.add('fate-animations-off', 'fate-super-performance-mode');
    globalThis.FATE_DISABLE_EFFECT_ACTIVATION_CINEMATIC = true;
  }else{
    document.documentElement.classList.remove('fate-animations-off', 'fate-super-performance-mode');
    document.documentElement.classList.remove('fate-disable-consolidation-motion');
    document.body?.classList.remove('fate-animations-off', 'fate-super-performance-mode', 'fate-disable-consolidation-motion');
    try{
      localStorage.removeItem('fateDisableMatchActionMotion');
      localStorage.removeItem('fateDisableConsolidationMotion');
      localStorage.setItem('fateEnableMatchActionMotion', '1');
    }catch(_){ }
    globalThis.FATE_DISABLE_EFFECT_ACTIVATION_CINEMATIC = false;
  }
  while(!stopped && result.completedGames + result.failedGames < targetGames){
    claimTestRunLock();
    if(maxRuntimeMs && Date.now() - result.startedAt >= maxRuntimeMs){
      result.stopReason = 'runtime-budget';
      break;
    }
    if(maxActions && result.actions >= maxActions){
      result.stopReason = 'action-budget';
      break;
    }
    const view = report();
    if(view?.state){
      const peerAbandon = readPeerAbandonBarrier(view.state.matchId);
      if(peerAbandon && Number(peerAbandon.gameIndex) === Number(matchStart?.gameIndex ?? currentOrganicGameIndex())){
        await abandonStalledMatch(view, 'Peer seat abandoned the same stalled production-UI scenario', {
          peerSeat:String(peerAbandon.seat || ''), peerReason:String(peerAbandon.reason || '')
        });
        continue;
      }
      const progressKey = `${String(view.state.matchId || '')}:${Number(view.state.revision ?? view.revision ?? 0)}`;
      if(progressKey !== lastObservedProgressKey){
        lastObservedProgressKey = progressKey;
        lastProgressAt = Date.now();
      }
      auditCurrentUiProjection(view);
      ingestPresentationBatch(view);
      if(matchStart?.matchId === String(view.state.matchId || '')) captureTargetAvailability(view, 'revision');
      const projectionAuditKey = `${String(view.state.matchId || '')}:${Number(view.state.revision ?? view.revision ?? 0)}`;
      if(projectionAuditKey !== lastProjectionOracleKey){
        await sleep(30);
        continue;
      }
    }
    if(!view?.state || !Number.isInteger(Number(view.playerIndex))){
      if(!matchmakingInFlight
        && Date.now() - result.startedAt > 3000
        && Date.now() - lastMatchmakingAttemptAt > 5000
        && beta()?.startUnrankedMatchmaking){
        matchmakingInFlight = true;
        lastMatchmakingAttemptAt = Date.now();
        try{ await queueNextMatch(); }
        catch(error){ recordError(error?.message || error, {stage:'initial-matchmaking'}); }
        finally{ matchmakingInFlight = false; }
      }
      await sleep(100);
      continue;
    }
    if(String(view.state.phase || '') === 'coin'){
      if(!matchStart || matchStart.matchId !== String(view.state.matchId || '')) beginMatch(view);
      const choices = (view.legalCommands || []).filter(command=>command.type === 'CHOOSE_TURN_ORDER');
      const coinDiagnostic = JSON.stringify({
        revision:Number(view.revision || 0),
        playerIndex:Number(view.playerIndex),
        winner:Number(view.state.coinFlip?.winner),
        legalTypes:(view.legalCommands || []).map(command=>String(command.type || '')),
        screen:document.getElementById('s-coin')?.classList.contains('active') ? 'coin' : ''
      });
      if(result.lastCoinDiagnostic !== coinDiagnostic){
        result.lastCoinDiagnostic = coinDiagnostic;
        publish();
      }
      if(timingUiMode && globalThis.FatePhase7CurrentMultiplayerUi?.report?.().presentationBusy){
        await sleep(30);
        continue;
      }
      if(choices.length){
        const preferFirst = ((result.completedGames + (seat === 'B' ? 1 : 0)) % 2) === 0;
        const command = choices.find(candidate=>candidate.payload?.goFirst === preferFirst) || choices[0];
        const label = command.payload?.goFirst ? 'Go First' : 'Go Second';
        const coinButton = visibleButtons().find(button=>normalizedUiText(button.textContent) === label);
        // The production coin buttons are mounted before their Phase 7
        // authoritative handlers are stamped. Clicking that cosmetic frame can
        // do nothing even though it looks enabled. Certify and click the same
        // bound control a player receives after the coin animation completes.
        const coinScreen = document.getElementById('s-coin');
        const expectedCoinKey = [String(view.state.matchId || ''), Number(view.revision || 0), Number(view.state.coinFlip?.winner)].join(':');
        const boundCoinButton = coinButton
          && coinScreen?.dataset.phase7CoinPresentationKey === expectedCoinKey
          && coinScreen?.dataset.phase7CoinFlipStartedKey === expectedCoinKey
          && typeof coinButton.onclick === 'function';
        if(boundCoinButton){
          coinButton.click();
          const before = Number(view.revision || 0);
          if(await waitForRevisionChange(before, 8000)){
            result.actions += 1;
            lastProgressAt = Date.now();
            note(result.commandTypes, command.type);
            publish();
          }else if(!globalThis.FatePhase7CurrentMultiplayerUi?.report?.().presentationBusy){
            recordError('Coin turn-order UI did not produce an authoritative revision', {revision:before, label});
          }
        }
      }
      await sleep(100);
      continue;
    }
    if(!matchStart || matchStart.matchId !== String(view.state.matchId || '')) beginMatch(view);
    if(view.state.outcome){
      // A seat can receive the first main-phase snapshot at revision 3 after
      // the opponent resolves coin choice and the automatic draw. No gameplay
      // placement/effect has occurred yet, so this is still a complete match.
      const completeFromStart = matchStart.startTurn <= 1 && matchStart.startRevision <= 3;
      const summary = {
        ...matchStart,
        endRevision:Number(view.state.revision || 0),
        outcome:view.state.outcome,
        actionCount:result.actions - matchStart.actions,
        errorCount:result.errors.length - matchStart.errors,
        fallbackActionCount:result.fallbackActions - matchStart.fallbackActions,
        presentationTimingViolationCount:result.presentationTimingViolations.length - matchStart.presentationTimingViolations,
        oracleViolationCount:result.oracleViolations.length - matchStart.oracleViolations,
        domViolationCount:result.domViolations.length - matchStart.domViolations,
        crossSeatViolationCount:result.crossSeatViolations.length - matchStart.crossSeatViolations,
        failureBundleReplayKeys:result.failureBundles.slice(matchStart.failureBundles).map(bundle=>bundle.replayKey),
        presentationContract:{
          stages:result.presentationTrace.slice(matchStart.presentationTrace).map(entry=>entry.stage),
          timingViolations:result.presentationTimingViolations.length - matchStart.presentationTimingViolations
        },
        completeFromStart
      };
      const focusedEvidenceFailures = [];
      for(const cardId of (matchStart.organicTargets || [])){
        const coverage = organicCoverage(cardId);
        const commandDelta = Math.max(0, Number(result.cardIds[cardId] || 0) - Number(matchStart.organicCommandStart?.[cardId] || 0));
        const observedActionDelta = Math.max(0, Number(result.observedActionCardIds[cardId] || 0) - Number(matchStart.organicObservedActionStart?.[cardId] || 0));
        const targetActionObserved = commandDelta > 0 || observedActionDelta > 0;
        const effectDelta = Math.max(0, Number(result.effectEventCardIds[cardId] || 0) - Number(matchStart.organicEffectStart?.[cardId] || 0));
        const resolvedEffectDelta = Math.max(0, Number(result.resolvedEffectCardIds[cardId] || 0) - Number(matchStart.organicResolvedEffectStart?.[cardId] || 0));
        const oracleCheckDelta = Math.max(0, Number(result.oracleCardChecks[cardId] || 0) - Number(matchStart.oracleCheckStart?.[cardId] || 0));
        const requiredOverlayKinds = requiredOverlayKindsForCard(cardId);
        const requiredOverlayKind = requiredOverlayKinds.join('|');
        const requiredOverlayDelta = requiredOverlayKinds.length
          ? Math.max(0, sourceOverlayEvidenceCount(cardId) - Number(matchStart.organicSourceOverlayStart?.[cardId] || 0))
          : 0;
        let localFocusedUiEvidence = true;
        let focusedUiEvidenceKind = '';
        if(requestedFocusedScenario === 'search-square-draw'){
          if(['27','07'].includes(cardId)){
            focusedUiEvidenceKind = 'THREE_SEQUENTIAL_DRAWS';
            localFocusedUiEvidence = result.drawSequences.slice(matchStart.drawSequences).some(sequence=>
              Number(sequence?.expected) === 3
                && Number(sequence?.ended) === 3
                && Array.isArray(sequence?.draws)
                && sequence.draws.length === 3
                && sequence.draws.every((draw, index)=>
                  Number(draw?.drawIndex) === index
                    && Number(draw?.endedAt) >= Number(draw?.startedAt)
                    && String(draw?.sourceCardId || '') === cardId
                )
            );
          }else if(['43','04','17'].includes(cardId)){
            focusedUiEvidenceKind = 'VISIBLE_BOARD_SQUARE_CLICK';
            localFocusedUiEvidence = result.boardPickerSelections.slice(matchStart.boardPickerSelections).some(selection=>
              String(selection?.promptSourceCardId || '') === cardId
                && selection?.selectedByVisibleClick === true
            );
          }else if(cardId === '13'){
            focusedUiEvidenceKind = 'VISIBLE_GENERIC_SUPPORTER_PICKER';
            localFocusedUiEvidence = result.cardPickerSelections.slice(matchStart.cardPickerSelections).some(selection=>
              String(selection?.promptSourceCardId || '') === '13'
                && selection?.selectedByVisibleCanvasClick === true
                && Array.isArray(selection?.selectedIids)
                && selection.selectedIids.length > 0
            );
          }
        }
        const localPartnerEvidence = Object.fromEntries((matchStart.organicPartners || []).map(partnerId=>[
          partnerId,
          Math.max(0, Number(result.cardIds[partnerId] || 0) - Number(matchStart.organicPartnerCommandStart?.[partnerId] || 0))
            + Math.max(0, Number(result.observedActionCardIds[partnerId] || 0) - Number(matchStart.organicPartnerObservedActionStart?.[partnerId] || 0))
            + Math.max(0, Number(result.effectEventCardIds[partnerId] || 0) - Number(matchStart.organicPartnerEffectStart?.[partnerId] || 0))
        ]));
        const clean = summary.errorCount === 0
          && summary.fallbackActionCount === 0
          && summary.presentationTimingViolationCount === 0
          && summary.oracleViolationCount === 0
          && summary.domViolationCount === 0
          && summary.crossSeatViolationCount === 0;
        const peerEvidence = await exchangeFocusedEvidence(summary.matchId, matchStart.gameIndex, cardId, {
          targetActionObserved,
          effectDelta,
          resolvedEffectDelta,
          oracleCheckDelta,
          requiredOverlayDelta,
          focusedUiEvidenceKind,
          focusedUiEvidenceObserved:localFocusedUiEvidence,
          partnerEvidence:localPartnerEvidence,
          clean,
          completeFromStart
        });
        const partnerEvidence = Object.fromEntries((matchStart.organicPartners || []).map(partnerId=>[
          partnerId,
          Number(localPartnerEvidence[partnerId] || 0) + Number(peerEvidence?.partnerEvidence?.[partnerId] || 0)
        ]));
        const partnerEvidenceCount = Object.values(partnerEvidence).reduce((sum, count)=>sum + Number(count || 0), 0);
        const sharedTargetActionObserved = targetActionObserved || peerEvidence?.targetActionObserved === true;
        const sharedEffectDelta = effectDelta + Number(peerEvidence?.effectDelta || 0);
        const sharedResolvedEffectDelta = resolvedEffectDelta + Number(peerEvidence?.resolvedEffectDelta || 0);
        const sharedOracleCheckDelta = oracleCheckDelta + Number(peerEvidence?.oracleCheckDelta || 0);
        const sharedRequiredOverlayDelta = requiredOverlayDelta + Number(peerEvidence?.requiredOverlayDelta || 0);
        const sharedFocusedUiEvidence = localFocusedUiEvidence || peerEvidence?.focusedUiEvidenceObserved === true;
        const sharedClean = clean && peerEvidence?.clean === true;
        const sharedCompleteFromStart = completeFromStart && peerEvidence?.completeFromStart === true;
        // Variant 7 deliberately certifies empty/ineligible prerequisites. When
        // the target is itself the variant's generic partner (card 58), the
        // scenario correctly removes that duplicate and has no partner to
        // exercise. Treat only that explicit no-partner contract as satisfied;
        // every other scenario must still observe every planned partner.
        const noPartnerEvidenceExpected = Object.keys(partnerEvidence).length === 0
          && (matchStart.organicVariant === 'EMPTY_OR_INELIGIBLE_PREREQUISITE'
            || !!requestedFocusedScenario);
        const allPartnersObserved = noPartnerEvidenceExpected
          || (Object.keys(partnerEvidence).length > 0
            && Object.values(partnerEvidence).every(count=>Number(count || 0) > 0));
        coverage.commands += commandDelta;
        coverage.effectEvents += effectDelta;
        coverage.resolvedEffects += resolvedEffectDelta;
        if(sharedTargetActionObserved) coverage.commandMatches += 1;
        if(sharedEffectDelta > 0) coverage.effectMatches += 1;
        if(sharedResolvedEffectDelta > 0) coverage.resolvedEffectMatches += 1;
        if(sharedOracleCheckDelta > 0) coverage.oracleObservedMatches += 1;
        if(allPartnersObserved) coverage.adversarialPartnerObservedMatches += 1;
        const branchKeys = [
          ...changedPrefixedKeys(result.effectBranches, matchStart.organicBranchStart?.[cardId], cardId),
          ...changedPrefixedKeys(result.oracleCardBranches, matchStart.oracleBranchStart?.[cardId], cardId)
        ];
        const observedObligations = mechanicallyObservedObligations(cardId, {
          resolvedEffectDelta,
          oracleCheckDelta,
          oracleViolations:summary.oracleViolationCount,
          presentationTimingViolations:summary.presentationTimingViolationCount,
          crossSeatViolations:summary.crossSeatViolationCount
        });
        const probedObligations = changedPrefixedKeys(
          result.obligationEvidenceCounts,
          matchStart.obligationEvidenceStart?.[cardId],
          cardId
        ).map(key=>key.slice(String(cardId).length + 1));
        for(const obligation of probedObligations){
          if(!observedObligations.includes(obligation)) observedObligations.push(obligation);
        }
        const requiresEffectEvidence = organicTargetRequiresEffectEvidence(cardId);
        const evidencePassed = sharedCompleteFromStart
          && sharedTargetActionObserved
          && (!requiresEffectEvidence || sharedEffectDelta > 0)
          && (!requiredOverlayKind || sharedRequiredOverlayDelta > 0)
          && sharedFocusedUiEvidence
          && sharedOracleCheckDelta > 0
          && allPartnersObserved
          && sharedClean;
        if(evidencePassed){
          coverage.completedMatches += 1;
          coverage.cleanMatches += 1;
          coverage.evidencePassedMatches += 1;
        }else if(organicCardCampaign){
          focusedEvidenceFailures.push({cardId, commandDelta, observedActionDelta, effectDelta, resolvedEffectDelta, oracleCheckDelta, requiredOverlayKind, requiredOverlayDelta, focusedUiEvidenceKind, localFocusedUiEvidence, sharedFocusedUiEvidence, partnerEvidence, noPartnerEvidenceExpected, allPartnersObserved, clean, completeFromStart, peerEvidence, sharedClean, sharedCompleteFromStart});
        }
        if(!evidencePassed && coverage.requiredMatches < 10){
          coverage.requiredMatches = 10;
          coverage.escalatedAfterFailure = true;
        }
        if(evidencePassed && !coverage.landscapes.includes(matchStart.landscapeId)) coverage.landscapes.push(matchStart.landscapeId);
        if(evidencePassed && !coverage.variants.includes(matchStart.organicVariant)) coverage.variants.push(matchStart.organicVariant);
        if(evidencePassed && matchStart.reinforcementPolicy === 'REAL') coverage.realRuleMatches += 1;
        if(evidencePassed && matchStart.reinforcementPolicy === 'ZERO_COST') coverage.zeroCostMatches += 1;
        for(const obligation of (matchStart.plannedObligations?.[cardId] || [])){
          if(!coverage.plannedObligations.includes(obligation)) coverage.plannedObligations.push(obligation);
        }
        for(const obligation of observedObligations){
          if(!coverage.observedObligations.includes(obligation)) coverage.observedObligations.push(obligation);
        }
        for(const key of branchKeys) if(!coverage.branchKeys.includes(key)) coverage.branchKeys.push(key);
        coverage.matchEvidence.push({
          gameIndex:currentOrganicGameIndex(),
          matchId:summary.matchId,
          landscapeId:summary.landscapeId,
          organicVariant:matchStart.organicVariant,
          organicVariantIndex:matchStart.organicVariantIndex,
          organicPartners:matchStart.organicPartners,
          reinforcementPolicy:matchStart.reinforcementPolicy,
          reinforcementPolicyReason:matchStart.reinforcementPolicyReason,
          plannedObligations:matchStart.plannedObligations?.[cardId] || [],
          observedObligations,
          probedObligations,
          completeFromStart,
          commandDelta,
          observedActionDelta,
          effectDelta,
          resolvedEffectDelta,
          requiredOverlayKind,
          requiredOverlayDelta,
          oracleCheckDelta,
          partnerEvidenceCount,
          partnerEvidence,
          noPartnerEvidenceExpected,
          allPartnersObserved,
          errorCount:summary.errorCount,
          fallbackActionCount:summary.fallbackActionCount,
          presentationTimingViolations:summary.presentationTimingViolationCount,
          domViolations:summary.domViolationCount,
          oracleViolations:result.oracleViolations.slice(matchStart.oracleViolations).filter(violation=>
            !violation.cardId || violation.cardId === cardId
          ).length,
          oracleContract:cardRuleOracle(cardId)?.resolution || '',
          evidencePassed
        });
        if(coverage.matchEvidence.length > 10) coverage.matchEvidence.shift();
        refreshOrganicAutomaticEvidence(cardId);
        summary.organicCoverage = summary.organicCoverage || {};
        summary.organicCoverage[cardId] = {commandDelta, observedActionDelta, effectDelta, resolvedEffectDelta};
      }
      summary.focusedEvidenceFailures = focusedEvidenceFailures;
      if(focusedEvidenceFailures.length){
        recordError('Focused scenario reached the end screen without exercising its required target/partner evidence', {
          stage:'focused-evidence-gate',
          gameIndex:matchStart.gameIndex,
          matchId:summary.matchId,
          failures:focusedEvidenceFailures
        });
        summary.errorCount = result.errors.length - matchStart.errors;
      }
      result.matches.push(summary);
      const cleanMatch = completeFromStart
        && focusedEvidenceFailures.length === 0
        && summary.errorCount === 0
        && summary.fallbackActionCount === 0
        && summary.presentationTimingViolationCount === 0
        && summary.oracleViolationCount === 0
        && summary.domViolationCount === 0
        && summary.crossSeatViolationCount === 0;
      result.consecutiveCleanMatches = cleanMatch ? result.consecutiveCleanMatches + 1 : 0;
      if(completeFromStart && focusedEvidenceFailures.length === 0) result.completedGames += 1;
      else if(focusedEvidenceFailures.length){
        result.failedGames += 1;
        if(!result.failedScenarioIndexes.includes(matchStart.gameIndex)) result.failedScenarioIndexes.push(matchStart.gameIndex);
      }
      else result.warmupMatches += 1;
      // A failed scenario is diagnostic evidence, not permission to strand the
      // paired unattended campaign. Both seats advance one schedule slot; the
      // failed index is retained for the post-fix replay pass.
      writeCheckpoint(currentOrganicGameIndex());
      publish();
      if(result.completedGames + result.failedGames >= targetGames) break;
      try{ await queueNextMatch(); }
      catch(error){ recordError(error?.message || error, {stage:'matchmaking'}); await sleep(500); }
      continue;
    }
    if(!currentUiReady()){
      const bridge = globalThis.FatePhase7CurrentMultiplayerUi?.report?.();
      if(!bridge?.presentationBusy && Date.now() - lastProgressAt > stallTimeoutMs){
        await abandonStalledMatch(view, 'Shipping UI did not become interactive before the stall deadline', {bridge});
      }
      await sleep(50);
      continue;
    }
    // Production effect/card-detail modals are intentionally the last visual
    // stage. Once no authoritative prompt or hand-limit choice owns that modal,
    // a human closes it before taking the next board/dock action. Do the same
    // here so a valid End Turn click is never fired into a blocking overlay.
    if(document.getElementById('modal')?.classList.contains('on')
      && !view.state.pendingPrompt
      && !view.state.pendingHandLimit){
      await closeIncidentalModalBeforeBoardInput();
      await sleep(30);
      continue;
    }
    const command = chooseCommand(view);
    if(!command){
      const pendingPromptPlayer = Number(view.state.pendingPrompt?.playerIndex);
      const pendingHandLimitPlayer = Number(view.state.pendingHandLimit?.playerIndex);
      // While a prompt belongs to the opponent, the active player can remain
      // local even though local input is correctly blocked. Do not mislabel
      // that reaction/choice window as a stalled local UI.
      const localMustAct = view.state.pendingPrompt
        ? pendingPromptPlayer === Number(view.playerIndex)
        : (view.state.pendingHandLimit
            ? pendingHandLimitPlayer === Number(view.playerIndex)
            : Number(view.state.activePlayer) === Number(view.playerIndex));
      if(localMustAct && Date.now() - lastProgressAt > stallTimeoutMs){
        await abandonStalledMatch(view, 'No UI-drivable legal command was available before the stall deadline', {
          revision:view.revision,
          turn:view.state.turn,
          legalCommandTypes:(view.legalCommands || []).map(candidate=>String(candidate?.type || ''))
        });
      }
      await sleep(30);
      continue;
    }
    const before = Number(view.revision || 0);
    let driven = false;
    try{ driven = await driveCommand(view, command); }
    catch(error){ recordError(error?.message || error, {stage:'drive', commandType:command.type, revision:before}); }
    if(!driven){
      if(await waitForRevisionChange(before, 500)){
        result.actions += 1;
        lastProgressAt = Date.now();
        note(result.commandTypes, command.type);
        noteCommandCard(view, command);
        noteSuccessfulTurnAction(view, command);
        publish();
        continue;
      }
      const commandIid = command.payload?.cardIid || command.payload?.sourceIid;
      result.uiDriveRetries += 1;
      result.lastUiDriveFailure = {
        message:'Could not drive the displayed UI for a legal command',
        uiStage:result.lastStage,
        commandType:command.type,
        commandPayload:command.payload || {},
        commandCardId:sourceCardId(view, commandIid),
        commandCardPosition:boardPositionForIid(view, commandIid),
        tributePositions:(command.payload?.tributeIids || []).map(iid=>({iid, position:boardPositionForIid(view, iid)})),
        visibleBoardCardIids:(hitMap()?.cards || []).map(hit=>String(hit?.iid || hit?.card?.iid || '')),
        revision:before,
        pendingPrompt:view.state.pendingPrompt || null,
        at:Date.now()
      };
      if(await submitDiagnosticFallback(view, command, before, 'UI_DRIVE_FAILED')) continue;
      if(Date.now() - lastProgressAt > stallTimeoutMs){
        await abandonStalledMatch(view, 'Repeated production UI drive failure exceeded the stall deadline', {commandType:command.type, commandPayload:command.payload || {}});
        continue;
      }
      globalThis.closeModal?.({forceHandLimitClose:true});
      // Do not blacklist a legal command merely because one physical gesture
      // missed. The next loop reopens the production interaction and retries
      // it until the bounded stall watchdog either observes a revision or
      // records/abandons the scenario.
      await sleep(100);
      continue;
    }
    if(!await waitForRevisionChange(before)){
      result.uiDriveRetries += 1;
      result.lastUiDriveFailure = {
        message:'UI action did not produce an authoritative revision',
        commandType:command.type,
        revision:before,
        at:Date.now()
      };
      if(await submitDiagnosticFallback(view, command, before, 'UI_NO_REVISION')) continue;
      if(Date.now() - lastProgressAt > stallTimeoutMs){
        await abandonStalledMatch(view, 'Production UI action failed to advance authority before the stall deadline', {commandType:command.type, commandPayload:command.payload || {}});
        continue;
      }
      globalThis.closeModal?.({forceHandLimitClose:true});
      await sleep(100);
      continue;
    }
    result.actions += 1;
    if(command.type !== 'END_TURN' && !view.state.pendingPrompt && !view.state.pendingHandLimit){
      attemptedTurnCommandKeys.add(turnCommandAttemptKey(view, command));
    }
    lastProgressAt = Date.now();
    note(result.commandTypes, command.type);
    noteCommandCard(view, command);
    noteSuccessfulTurnAction(view, command);
    publish();
    // Keep consecutive genuine UI gestures beyond the production canvas's
    // 80ms release guard. This remains fast while avoiding synthetic drops.
    await sleep(100);
  }
  result.running = false;
  result.finishedAt = Date.now();
  globalThis.clearInterval(electronHeartbeatTimer);
  if(!result.stopReason){
    result.stopReason = stopped ? 'requested-stop' : 'target-games-complete';
  }
  finishTestRunLock();
  publish();
  await publishElectronDiagnostic(true);
  return result;
}

globalThis.FatePhase7FullUiE2E = Object.freeze({
  start(){
    if(!loopPromise) loopPromise = loop();
    return loopPromise;
  },
  stop(){ stopped = true; return JSON.parse(JSON.stringify(result)); },
  report(){ return JSON.parse(JSON.stringify(result)); }
});

globalThis.FatePhase7FullUiE2E.start().catch(error=>{
  recordError(error?.stack || error, {stage:'fatal'});
  result.running = false;
  result.finishedAt = Date.now();
  globalThis.clearInterval(electronHeartbeatTimer);
  finishTestRunLock();
  publish();
});
