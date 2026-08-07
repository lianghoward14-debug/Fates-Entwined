import {cardRule, multiplayerEligibleCardIds} from '../../shared/engine/cards/registry.mjs';
import {
  auditRuleOraclePresentationBatch,
  auditRuleOracleState,
  cardRuleOracle,
  expectedEffectiveFateFromOracle,
  RULE_ORACLE_CONTINUOUS_BRANCH_CARD_IDS,
  validateRuleOracleCatalog
} from '../../shared/engine/rules-oracle.mjs?v=1785761006';

const params = new URLSearchParams(globalThis.location?.search || '');
const fastUiMode = params.get('fateV3FullUiE2E') === '1';
const timingUiMode = params.get('fateV3PresentationE2E') === '1';
const enabled = params.get('fateV3UnrankedBeta') === '1'
  && fastUiMode !== timingUiMode
  && params.get('electron') === '1'
  && params.get('fateV3BetaTestAuth') === '1';

if(!enabled) throw new Error('Phase 7 full-UI E2E requires exactly one isolated fast or presentation-timing flag');

const targetGames = Math.max(1, Math.min(1010, Number(params.get('e2eGames')) || 1));
const startGameIndex = Math.max(0, Math.min(1009, Number(params.get('e2eStartIndex')) || 0));
const maxRuntimeMs = Math.max(0, Math.min(300_000, Number(params.get('e2eMaxRuntimeMs')) || 0));
const maxActions = Math.max(0, Math.min(100_000, Number(params.get('e2eMaxActions')) || 0));
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
// Pure card-to-hand/deck transfer effects are covered by focused picker/state
// tests. They do not consume ten full organic matches. Lina is intentionally
// absent: her search creates a free-set/placement/reaction/effect chain.
const ORGANIC_FULL_MATCH_EXEMPT_CARD_IDS = new Set(['06','13','29','48','58','60','68','96']);
function organicCardSort(left, right){
  const leftNumeric = /^\d+$/.test(String(left)) ? Number(left) : Number.POSITIVE_INFINITY;
  const rightNumeric = /^\d+$/.test(String(right)) ? Number(right) : Number.POSITIVE_INFINITY;
  return leftNumeric - rightNumeric || String(left).localeCompare(String(right), undefined, {numeric:true});
}
const organicCampaignCardIds = (requestedOrganicTargetCardId
  ? [requestedOrganicTargetCardId]
  : eligibleCardIds.filter(id=>!ORGANIC_FULL_MATCH_EXEMPT_CARD_IDS.has(id)))
    .sort(organicCardSort);
if(organicCardCampaign && !requestedOrganicTargetCardId && organicCampaignCardIds.length !== 101){
  throw new Error(`Strict card certification requires exactly 101 non-exempt cards; found ${organicCampaignCardIds.length}`);
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
// Every non-exempt card receives ten full shipping-UI matches. Risk labels are
// retained for reporting and scenario design only; they must never reduce the
// per-card match count requested by the certification campaign.
const ORGANIC_EXPLICIT_HIGH_RISK_CARD_IDS = new Set([
  '02','03','04','05','07','09','10','11','12','14','15','16','17','18','19','20','21','23','24','25','28','30','31','34','35','37','39','41','44','45','47','49','50','51','52','53','54','55','56','57','59','61','62','63','64','65','66','67','69','70','72','73','74','75','76','77','78','79','81','82','83','85','87','88','89','91','92','93','94','95','97','98','99','100','bh01','bh03','bh04','bh05','bh06','bh07','bh08','bh25'
]);
const ORGANIC_HIGH_RISK_CARD_IDS = new Set(organicCampaignCardIds.filter(id=>
  ORGANIC_EXPLICIT_HIGH_RISK_CARD_IDS.has(id)
  || RULE_ORACLE_CONTINUOUS_BRANCH_CARD_IDS.includes(id)
  || (cardRule(id)?.prompts || []).length > 0
));

function organicRequiredMatches(cardId){
  return 10;
}

const organicCampaignSchedule = Object.freeze(organicCampaignCardIds.flatMap((cardId, cardIndex)=>
  Array.from({length:organicRequiredMatches(cardId)}, (_value, variantIndex)=>Object.freeze({
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
const activeOrganicSchedule = canaryMode ? ORGANIC_CANARY_SCHEDULE : organicCampaignSchedule;
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
  if(!['56','67','79'].includes(id)) return false;
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

function exactOrganicScenarioDeck(targets, partners){
  // Temecula Resident and Isaac Perez are deterministic setup scaffolding,
  // not random filler. Character targets need Supporter reinforcement, while
  // Supporter passives such as Great Oak Infantry need a cheap Character to
  // consolidate. They also give both seats stable opponent targets.
  const scenarioIds = [...new Set([...(targets || []), ...(partners || []), '32', '22'].map(String).filter(id=>eligibleCardIds.includes(id)))];
  if(!scenarioIds.length) throw new Error('Exact organic scenario deck has no eligible cards');
  // Test-auth matches deliberately bypass production rarity limits. Repeating
  // only the scenario cards makes every draw relevant while retaining a full
  // forty-card, twenty-turn match and the exact shipping UI/runtime path.
  const counts = new Map([['32', 16], ['22', 4]]);
  for(const id of (targets || []).map(String)) counts.set(id, (counts.get(id) || 0) + 8);
  for(const id of (partners || []).map(String)) counts.set(id, (counts.get(id) || 0) + 6);
  let deckIds = [...counts.entries()].flatMap(([id, count])=>Array.from({length:count}, ()=>id))
    .filter(id=>eligibleCardIds.includes(id));
  if(deckIds.length < 40) deckIds.push(...Array.from({length:40 - deckIds.length}, ()=>'32'));
  deckIds = deckIds.slice(0, 40);
  return {deckIds, scenarioIds};
}
// These are generated from the Phase 0/4 classification docs and intersected
// with the current multiplayer registry. Families whose executable registry
// grew beyond the original text classifier are explicitly widened below.
const EFFECT_FAMILY_FOCUS_GROUPS = Object.freeze({
  1:Object.freeze({family:'DRAW_AND_SEARCH', cardIds:Object.freeze(['06','07','08','13','27','29','32','40','42','46','48','60','68','71','74','80','84','86','90','bh01','bh02'])}),
  2:Object.freeze({family:'FATE_MODIFICATION', cardIds:Object.freeze(['01','02','03','05','07','10','11','14','15','19','22','23','31','33','34','35','36','38','40','41','44','46','47','51','55','57','59','61','63','64','65','66','70','76','77','83','85','86','87','88','89','90','93','95','100','bh02','bh07','bh08'])}),
  3:Object.freeze({family:'MOVEMENT', cardIds:Object.freeze(['34','39','54','62','69','70','73','bh01'])}),
  4:Object.freeze({family:'DISCARD_REMOVAL_AND_TRANSFER', cardIds:Object.freeze(['08','16','29','30','38','42','48','52','58','62','70','71','72','73','80','96','bh25'])}),
  5:Object.freeze({family:'STATUS_AND_IMMUNITY', cardIds:Object.freeze(['06','07','12','14','17','18','20','21','51','53','56','67','69','70','76','79','81','91','99','bh01','bh03','bh06','bh08'])}),
  6:Object.freeze({family:'CONTROL_CHANGES', cardIds:Object.freeze(['70','72','bh03'])}),
  7:Object.freeze({
    family:'CONTINUOUS_MODIFIERS',
    // Phase 0 text classification plus every live effectiveFate source in
    // the current authoritative modifier query.
    cardIds:Object.freeze(['01','10','11','14','15','19','20','21','23','24','35','37','41','44','49','53','55','57','59','61','63','64','77','83','85','88','89','92','93','95','100','bh02','bh07','bh08'])
  }),
  8:Object.freeze({
    family:'PLACEMENT_EFFECTS',
    // All current registry rules with WHEN_SET or DECK_SET timing.
    cardIds:Object.freeze(['02','04','05','07','08','12','14','16','17','18','21','25','28','31','32','33','37','42','43','50','51','52','54','58','60','61','62','65','66','68','69','71','72','73','75','76','77','78','80','81','82','84','87','90','91','94','96','97','99','bh04','bh05','bh06','bh25'])
  }),
  9:Object.freeze({
    family:'REACTIONS_AND_INTERRUPTS',
    // Phase 0 reaction observers + the complete Phase 7 reactor/source
    // matrix. Keeping both sides in the deck is required to open real
    // authoritative interrupt prompts instead of merely setting Improvisors.
    cardIds:Object.freeze(['14','16','18','26','30','39','40','51','52','56','61','66','67','79','90','91','93','96','bh02','bh04','bh08'])
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
  exactFlag:timingUiMode ? 'fateV3PresentationE2E=1' : 'fateV3FullUiE2E=1',
  identityMode:String(globalThis.FATE_PHASE7_TEST_IDENTITY_MODE || ''),
  runId,
  seat,
  targetGames,
  startGameIndex,
  maxRuntimeMs,
  maxActions,
  focusMapRevision:'phase4-families-20260802-2',
  focusGroup:requestedFocusGroup,
  focusFamily:focus?.family || 'ALL_EFFECT_FAMILIES',
  focusTargetCardIds:[...focusedCardIds],
  focusTargetLandscapeIds:[...focusedLandscapeIds],
  organicCardCampaign,
  strictCardCertification,
  canaryMode,
  requestedOrganicTargetCardId,
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
    presentationDurationCompressed:false,
    releaseCleanStreakRequired:30
  },
  organicTargetCoverage:{},
  oracleCatalog:oracleCatalogAudit,
  oracleChecks:0,
  oracleCardChecks:{},
  oracleCardBranches:{},
  oracleViolations:[],
  completedGames:0,
  warmupMatches:0,
  actions:0,
  fallbackActions:0,
  uiFallbacks:[],
  errors:[],
  commandTypes:{},
  answerVariants:{},
  promptTypes:{},
  cardIds:{},
  focusCardIds:{},
  eventTypes:{},
  effectEventCardIds:{},
  effectBranches:{},
  focusEffectBranches:{},
  landscapes:{},
  landscapeBranches:{},
  queuedDecks:[],
  presentationStages:0,
  presentationTimingViolations:[],
  presentationTrace:[],
  overlayKinds:{},
  failureClassifications:{},
  failureBundles:[],
  crossSeatChecks:0,
  crossSeatViolations:[],
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
let organicTargetCommandsThisMatch = new Set();
let organicPartnerCommandsThisMatch = new Set();
let lastProjectionOracleKey = '';

function currentOrganicGameIndex(){
  return startGameIndex + result.completedGames + result.warmupMatches;
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
      cleanMatches:0,
      evidencePassedMatches:0,
      oracleObservedMatches:0,
      adversarialPartnerObservedMatches:0,
      commands:0,
      effectEvents:0,
      landscapes:[],
      variants:[],
      branchKeys:[],
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
  if(coverage.matchEvidence.some(entry=>Number(entry.oracleViolations) > 0)) pending.push('ZERO_ORACLE_VIOLATIONS');
  if(new Set(coverage.landscapes).size < requiredMatches) pending.push('REQUIRED_DISTINCT_LANDSCAPES');
  if(new Set(coverage.variants).size < requiredMatches) pending.push('REQUIRED_ADVERSARIAL_VARIANTS');
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

const presentationTimingState = {cinematicDepth:0, resultsActive:false, lastResultsEndAt:0};
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
    result.presentationStages += 1;
    result.presentationTrace.push({stage, at:Number(detail.at) || Date.now(), details:detail.details || {}});
    if(result.presentationTrace.length > 160) result.presentationTrace.shift();
    if(stage === 'cinematic:start') presentationTimingState.cinematicDepth += 1;
    if(stage === 'cinematic:end') presentationTimingState.cinematicDepth = Math.max(0, presentationTimingState.cinematicDepth - 1);
    if(stage === 'results:start'){
      if(presentationTimingState.cinematicDepth > 0) recordPresentationTimingViolation('Result animation began before the cinematic finished', detail);
      presentationTimingState.resultsActive = true;
    }
    if(stage === 'results:end'){
      presentationTimingState.resultsActive = false;
      presentationTimingState.lastResultsEndAt = Date.now();
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
      note(result.overlayKinds, kind);
      if(kind.startsWith('phase7_')){
        recordPresentationTimingViolation('Generic Phase 7 overlay was used instead of a production overlay', detail);
      }
    }
    publish();
  });
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
    const snapshot = JSON.parse(JSON.stringify(result));
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
  if(result.oracleViolations.length > 0) reasons.push('UNRESOLVED_ORACLE_FINDING');
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
  if(/synthetic|hit map|test driver|coordinate/.test(haystack)) return 'TEST_DRIVER';
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
  const points = [
    [0.5, 0.12], [0.35, 0.18], [0.65, 0.18], [0.5, 0.3], [0.25, 0.3], [0.75, 0.3], [0.5, 0.5]
  ];
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
  for(const event of (batch.events || [])){
    const eventType = String(event?.type || 'UNKNOWN_EVENT');
    note(result.eventTypes, eventType);
    const landscapeId = eventLandscapeId(event);
    if(landscapeId){
      note(result.landscapeBranches, `${landscapeId}|${effectBranchKey(event)}`);
    }
    const eventSourceIid = eventType === 'EFFECT_REACTED'
      ? event?.reactionIid
      : (event?.effectSourceIid || event?.sourceIid);
    const reactionCardId = ({LYDIA:'56',SECULES:'67',HAVANO:'79'})[String(event?.reactionKind || '').toUpperCase()] || '';
    const sourceId = (eventType === 'EFFECT_REACTED' ? '' : String(event?.sourceCardId || ''))
      || sourceCardId(view, eventSourceIid)
      || (eventType === 'EFFECT_REACTED' ? reactionCardId : '')
      || ((eventType === 'EFFECT_ACTIVATED' || eventType === 'EFFECT_REACTED') ? String(event?.cardId || '') : '');
    if(sourceId){
      note(result.effectEventCardIds, sourceId);
      note(result.effectBranches, `${sourceId}|${effectBranchKey(event)}`);
      if(focusedCardIdSet.has(sourceId)){
        note(result.focusEffectBranches, `${sourceId}|${effectBranchKey(event)}`);
      }
    }
  }
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
  lastProjectionOracleKey = auditKey;
  exchangeCrossSeatSnapshot(view);
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
    if(String(canonicalEntry?.card?.id || '') === '55'){
      const expected = expectedEffectiveFateFromOracle(view.state, cardIid);
      if(Number(observed) !== Number(expected)){
        result.lastEffectiveFateDiagnostic = {
          cardId:'55', cardIid:String(cardIid || ''), expected:Number(expected), observed:Number(observed),
          zone:Number(canonicalEntry.z),
          source:{
            id:String(legacyEntry.id || ''), owner:legacyEntry.owner, controller:legacyEntry.controller,
            aff:legacyEntry.aff, affiliation:legacyEntry.affiliation, faceDown:legacyEntry.faceDown,
            noBonus:legacyEntry.noBonus,
            suppressedFlags:Object.fromEntries(Object.entries(legacyEntry).filter(([key, value])=>value === true && /suppress|negat|immune/i.test(key)))
          },
          peers:(legacy.board?.[canonicalEntry.z] || []).flat().filter(Boolean).map(card=>({
            iid:String(card.iid || ''), id:String(card.id || ''), owner:card.owner, controller:card.controller,
            aff:card.aff, affiliation:card.affiliation, faceDown:card.faceDown,
            immutable:typeof globalThis.isCardEffectImmutable === 'function' ? !!globalThis.isCardEffectImmutable(card) : false
          }))
        };
      }
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
}

function noteCommandCard(view, command){
  if(command?.type === 'ANSWER_PROMPT'){
    const payload = command.payload || {};
    note(result.answerVariants, payload.cancel === true
      ? 'CANCEL'
      : (payload.mode ? `MODE_${String(payload.mode).toUpperCase()}` : 'ACCEPT'));
  }
  const primaryIid = command?.payload?.cardIid || command?.payload?.sourceIid || command?.payload?.reactionIid;
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

function turnCommandAttemptKey(view, command){
  return [
    String(view?.state?.matchId || ''),
    Number(view?.state?.turn || 0),
    Number(view?.playerIndex ?? -1),
    String(command?.type || ''),
    commandKey(command)
  ].join(':');
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
  const priority = organicSetupPending
    ? ['SET_CARD_FROM_DECK','CONSOLIDATE_CARD','SET_CARD','SET_ADAPTIVE_TOKEN','ACTIVATE_EFFECT','ACTIVATE_LANDSCAPE','FLIP_CARD','MOVE_CARD','END_TURN']
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
        return !heldForReaction && queuedOrganicTargets.includes(cardId);
      }) : null;
      const organicPartnerOption = organicCardCampaign ? options.find(command=>{
        const iid = command.payload?.cardIid || command.payload?.sourceIid;
        const cardId = sourceCardId(view, iid);
        const heldForReaction = ['SET_CARD','SET_ADAPTIVE_TOKEN','CONSOLIDATE_CARD'].includes(type)
          && shouldHoldOrganicReactionCard(cardId);
        return !heldForReaction && queuedOrganicPartners.includes(cardId);
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
  const cards = Array.isArray(cardsOverride)
    ? cardsOverride
    : (view?.state?.pendingHandLimit
      ? (view.state.players?.[view.playerIndex]?.hand || [])
      : pickerCards(view));
  const wanted = (iids || []).map(String);
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
    for(let p = 0; p < page; p++){
      if(!clickButton('Prev', true)) return false;
      await sleep(100);
    }
  }
  return clickButton('Confirm') || clickButton('Choose Destination');
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
  const picker = await waitFor(()=>{
    const candidate = document.querySelector('.board-target-picker');
    return isVisible(candidate) ? candidate : null;
  });
  if(!picker) return false;
  for(const iid of (iids || [])){
    let pos = null;
    (view.state.board || []).forEach((zone,z)=>(zone || []).forEach((row,r)=>(row || []).forEach((card,c)=>{
      if(card && String(card.iid || '') === String(iid)) pos = `${z}:${r}:${c}`;
    })));
    const button = pos && picker.querySelector(`[data-picker-pos="${pos}"]`);
    if(!button) return false;
    button.click();
  }
  return clickButton('Confirm') || clickButton('Choose Destination');
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
      && (bridge?.consolidationSelectedIids || []).length === wanted.length;
  }, 1500);
  if(!destinationSelected) return false;
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
    if(!clickBoardPosition(destination, attempt > 0)) return false;
    const submitted = await submitPhase7ModalCommandWhenShown(command, beforeRevision, 900);
    if(submitted) return true;
    await sleep(160);
  }
  return false;
}

async function clickBoardDestinationWithRevision(destination, beforeRevision){
  for(let attempt = 0; attempt < 2; attempt += 1){
    if(!clickBoardPosition(destination, attempt > 0)) return false;
    const submitted = await waitFor(()=>{
      const authoritative = report();
      const bridge = globalThis.FatePhase7CurrentMultiplayerUi?.report?.();
      return Number(authoritative?.revision) !== Number(beforeRevision)
        || Number(bridge?.lastCommandResult?.revision || 0) > Number(beforeRevision);
    }, 900);
    if(submitted) return true;
    await sleep(160);
  }
  return false;
}

async function selectBoardPickerDestinations(destinations){
  const picker = await waitFor(()=>{
    const candidate = document.querySelector('.board-target-picker');
    return isVisible(candidate) ? candidate : null;
  });
  if(!picker) return false;
  for(const destination of (destinations || [])){
    const key = `${Number(destination.z)}:${Number(destination.r)}:${Number(destination.c)}`;
    const button = picker.querySelector(`[data-picker-pos="${key}"]`);
    if(!button) return false;
    button.click();
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
    if(!clickHandCard(payload.cardIid)) return false;
    result.lastStage = 'set:click-button';
    if(!await clickPhase7CardAction('place', payload.cardIid, ()=>clickHandCard(payload.cardIid))){ result.lastModal = captureModalDebug(); return false; }
    result.lastStage = 'set:wait-close';
    if(!await waitFor(()=>!document.getElementById('modal')?.classList.contains('on'))) return false;
    await sleep(120);
    result.lastStage = 'set:wait-destination';
    if(!await waitForBoardInteraction(payload.destination)) return false;
    result.lastStage = 'set:click-destination';
    return clickBoardDestinationWithRevision(payload.destination, view.revision);
  }
  if(command.type === 'CONSOLIDATE_CARD'){
    result.lastStage = 'consolidation:click-hand';
    if(!clickHandCard(payload.cardIid)) return false;
    result.lastStage = 'consolidation:click-button';
    if(!await clickPhase7CardAction('consolidate', payload.cardIid, ()=>clickHandCard(payload.cardIid))){ result.lastModal = captureModalDebug(); return false; }
    result.lastStage = 'consolidation:select-tributes';
    return selectOnBoardConsolidation(payload.tributeIids || [], payload.destination, view.revision, command);
  }
  if(command.type === 'ACTIVATE_EFFECT'){
    if(!await clickBoardCardWhenReady(payload.sourceIid)) return false;
    return clickPhase7CardAction('activate', payload.sourceIid, ()=>clickBoardCard(payload.sourceIid));
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
    result.lastStage = 'set-from-deck:open-picker';
    if(!await waitFor(()=>clickUiCommand('phase7-set-from-deck'), 4000)) return false;
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
  const replayKey = [runId, startGameIndex + result.completedGames + result.warmupMatches, matchId, revision, details.commandType || details.stage || 'unknown'].join(':');
  result.failureBundles.push({
    version:1,
    replayKey,
    classification,
    error:errorEntry,
    gameIndex:startGameIndex + result.completedGames + result.warmupMatches,
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
    inputTrace:(globalThis.__fatePerf?.sceneInputDebug || []).slice(-36),
    shippingUiReport:globalThis.FatePhase7CurrentMultiplayerUi?.report?.() || null
  });
  if(result.failureBundles.length > 100) result.failureBundles.shift();
  publish();
}

function beginMatch(view){
  const targets = queuedOrganicTargets.slice();
  targets.forEach(id=>{ organicCoverage(id).assignedMatches += 1; });
  matchStart = {
    matchId:String(view.state.matchId || ''),
    startTurn:Number(view.state.turn || 0),
    startRevision:Number(view.state.revision || 0),
    actions:result.actions,
    errors:result.errors.length,
    fallbackActions:result.fallbackActions,
    presentationTimingViolations:result.presentationTimingViolations.length,
    presentationTrace:result.presentationTrace.length,
    oracleViolations:result.oracleViolations.length,
    crossSeatViolations:result.crossSeatViolations.length,
    failureBundles:result.failureBundles.length,
    oracleCheckStart:Object.fromEntries(targets.map(id=>[id, Number(result.oracleCardChecks[id] || 0)])),
    oracleBranchStart:Object.fromEntries(targets.map(id=>[id, prefixedCountSnapshot(result.oracleCardBranches, id)])),
    landscapeId:String(view.state.landscapeId || ''),
    organicVariant:organicVariantContract().key,
    organicPartners:queuedOrganicPartners.slice(),
    organicTargets:targets,
    organicCommandStart:Object.fromEntries(targets.map(id=>[id, Number(result.cardIds[id] || 0)])),
    organicEffectStart:Object.fromEntries(targets.map(id=>[id, Number(result.effectEventCardIds[id] || 0)])),
    organicBranchStart:Object.fromEntries(targets.map(id=>[id, prefixedCountSnapshot(result.effectBranches, id)]))
    ,organicPartnerCommandStart:Object.fromEntries(queuedOrganicPartners.map(id=>[id, Number(result.cardIds[id] || 0)]))
    ,organicPartnerOracleStart:Object.fromEntries(queuedOrganicPartners.map(id=>[id, Number(result.oracleCardChecks[id] || 0)]))
  };
  note(result.landscapes, matchStart.landscapeId);
}

async function queueNextMatch(){
  const gameIndex = startGameIndex + result.completedGames + result.warmupMatches;
  const organicScenario = organicScenarioForGame(gameIndex);
  organicTargetCommandsThisMatch = new Set();
  organicPartnerCommandsThisMatch = new Set();
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
  const exactScenario = organicCardCampaign
    ? exactOrganicScenarioDeck(queuedOrganicTargets, queuedOrganicPartners)
    : null;
  const deckIds = exactScenario?.deckIds || [...new Set([...rotatedFocus, ...helperIds])].slice(0, 40);
  const landscapeId = focusedLandscapeIds.length
    ? focusedLandscapeIds[gameIndex % focusedLandscapeIds.length]
    : (organicCardCampaign
        ? organicLandscapeForGame(gameIndex, queuedOrganicTargets[0])
        : `igb${(gameIndex % 20) + 1}`);
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
        ), ...queuedOrganicPartners]
      : [],
    testDeckCardIds:organicCardCampaign ? organicDeckHeldTargets(queuedOrganicTargets) : [],
    testDeckTopCardIds:organicCardCampaign ? organicDeckTopTargets(queuedOrganicTargets) : []
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
  while(!stopped && result.completedGames < targetGames){
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
      auditCurrentUiProjection(view);
      ingestPresentationBatch(view);
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
        if(clickButton(label)){
          const before = Number(view.revision || 0);
          if(await waitForRevisionChange(before)){
            result.actions += 1;
            lastProgressAt = Date.now();
            note(result.commandTypes, command.type);
            publish();
          }else{
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
        crossSeatViolationCount:result.crossSeatViolations.length - matchStart.crossSeatViolations,
        failureBundleReplayKeys:result.failureBundles.slice(matchStart.failureBundles).map(bundle=>bundle.replayKey),
        presentationContract:{
          stages:result.presentationTrace.slice(matchStart.presentationTrace).map(entry=>entry.stage),
          timingViolations:result.presentationTimingViolations.length - matchStart.presentationTimingViolations
        },
        completeFromStart
      };
      for(const cardId of (matchStart.organicTargets || [])){
        const coverage = organicCoverage(cardId);
        const commandDelta = Math.max(0, Number(result.cardIds[cardId] || 0) - Number(matchStart.organicCommandStart?.[cardId] || 0));
        const effectDelta = Math.max(0, Number(result.effectEventCardIds[cardId] || 0) - Number(matchStart.organicEffectStart?.[cardId] || 0));
        const oracleCheckDelta = Math.max(0, Number(result.oracleCardChecks[cardId] || 0) - Number(matchStart.oracleCheckStart?.[cardId] || 0));
        const partnerEvidence = Object.fromEntries((matchStart.organicPartners || []).map(partnerId=>[
          partnerId,
          Math.max(0, Number(result.cardIds[partnerId] || 0) - Number(matchStart.organicPartnerCommandStart?.[partnerId] || 0))
            + Math.max(0, Number(result.oracleCardChecks[partnerId] || 0) - Number(matchStart.organicPartnerOracleStart?.[partnerId] || 0))
        ]));
        const partnerEvidenceCount = Object.values(partnerEvidence).reduce((sum, count)=>sum + Number(count || 0), 0);
        const allPartnersObserved = Object.keys(partnerEvidence).length > 0
          && Object.values(partnerEvidence).every(count=>Number(count || 0) > 0);
        coverage.completedMatches += completeFromStart ? 1 : 0;
        coverage.commands += commandDelta;
        coverage.effectEvents += effectDelta;
        if(commandDelta > 0) coverage.commandMatches += 1;
        if(effectDelta > 0) coverage.effectMatches += 1;
        if(oracleCheckDelta > 0) coverage.oracleObservedMatches += 1;
        if(allPartnersObserved) coverage.adversarialPartnerObservedMatches += 1;
        const branchKeys = [
          ...changedPrefixedKeys(result.effectBranches, matchStart.organicBranchStart?.[cardId], cardId),
          ...changedPrefixedKeys(result.oracleCardBranches, matchStart.oracleBranchStart?.[cardId], cardId)
        ];
        const clean = summary.errorCount === 0
          && summary.fallbackActionCount === 0
          && summary.presentationTimingViolationCount === 0
          && summary.oracleViolationCount === 0
          && summary.crossSeatViolationCount === 0;
        const requiresEffectEvidence = organicTargetRequiresEffectEvidence(cardId);
        const evidencePassed = completeFromStart
          && commandDelta > 0
          && (!requiresEffectEvidence || effectDelta > 0)
          && oracleCheckDelta > 0
          && allPartnersObserved
          && clean;
        if(clean && completeFromStart) coverage.cleanMatches += 1;
        if(evidencePassed) coverage.evidencePassedMatches += 1;
        if(!evidencePassed && coverage.requiredMatches < 10){
          coverage.requiredMatches = 10;
          coverage.escalatedAfterFailure = true;
        }
        if(completeFromStart && !coverage.landscapes.includes(matchStart.landscapeId)) coverage.landscapes.push(matchStart.landscapeId);
        if(completeFromStart && !coverage.variants.includes(matchStart.organicVariant)) coverage.variants.push(matchStart.organicVariant);
        for(const key of branchKeys) if(!coverage.branchKeys.includes(key)) coverage.branchKeys.push(key);
        coverage.matchEvidence.push({
          gameIndex:startGameIndex + result.completedGames,
          matchId:summary.matchId,
          landscapeId:summary.landscapeId,
          organicVariant:matchStart.organicVariant,
          organicPartners:matchStart.organicPartners,
          completeFromStart,
          commandDelta,
          effectDelta,
          oracleCheckDelta,
          partnerEvidenceCount,
          partnerEvidence,
          allPartnersObserved,
          errorCount:summary.errorCount,
          fallbackActionCount:summary.fallbackActionCount,
          presentationTimingViolations:summary.presentationTimingViolationCount,
          oracleViolations:result.oracleViolations.slice(matchStart.oracleViolations).filter(violation=>
            !violation.cardId || violation.cardId === cardId
          ).length,
          oracleContract:cardRuleOracle(cardId)?.resolution || '',
          evidencePassed
        });
        if(coverage.matchEvidence.length > 10) coverage.matchEvidence.shift();
        refreshOrganicAutomaticEvidence(cardId);
        summary.organicCoverage = summary.organicCoverage || {};
        summary.organicCoverage[cardId] = {commandDelta, effectDelta};
      }
      result.matches.push(summary);
      const cleanMatch = completeFromStart
        && summary.errorCount === 0
        && summary.fallbackActionCount === 0
        && summary.presentationTimingViolationCount === 0
        && summary.oracleViolationCount === 0
        && summary.crossSeatViolationCount === 0;
      result.consecutiveCleanMatches = cleanMatch ? result.consecutiveCleanMatches + 1 : 0;
      if(completeFromStart) result.completedGames += 1;
      else result.warmupMatches += 1;
      writeCheckpoint(startGameIndex + result.completedGames + result.warmupMatches);
      publish();
      if(result.completedGames >= targetGames) break;
      try{ await queueNextMatch(); }
      catch(error){ recordError(error?.message || error, {stage:'matchmaking'}); await sleep(500); }
      continue;
    }
    if(!currentUiReady()){ await sleep(50); continue; }
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
      if(localMustAct && Date.now() - lastProgressAt > 6000){
        recordError('No UI-drivable legal command was available', {revision:view.revision, turn:view.state.turn});
        lastProgressAt = Date.now();
      }
      await sleep(30);
      continue;
    }
    const before = Number(view.revision || 0);
    let driven = false;
    try{ driven = await driveCommand(view, command); }
    catch(error){ recordError(error?.message || error, {stage:'drive', commandType:command.type, revision:before}); }
    if(!driven){
      if(command.type !== 'END_TURN' && !view.state.pendingPrompt && !view.state.pendingHandLimit){
        attemptedTurnCommandKeys.add(turnCommandAttemptKey(view, command));
      }
      if(await waitForRevisionChange(before, 500)){
        result.actions += 1;
        lastProgressAt = Date.now();
        note(result.commandTypes, command.type);
        noteCommandCard(view, command);
        publish();
        continue;
      }
      const commandIid = command.payload?.cardIid || command.payload?.sourceIid;
      recordError('Could not drive the displayed UI for a legal command', {
        uiStage:result.lastStage,
        commandType:command.type,
        commandPayload:command.payload || {},
        commandCardId:sourceCardId(view, commandIid),
        commandCardPosition:boardPositionForIid(view, commandIid),
        tributePositions:(command.payload?.tributeIids || []).map(iid=>({iid, position:boardPositionForIid(view, iid)})),
        visibleBoardCardIids:(hitMap()?.cards || []).map(hit=>String(hit?.iid || hit?.card?.iid || '')),
        revision:before,
        pendingPrompt:view.state.pendingPrompt || null
      });
      if(await submitDiagnosticFallback(view, command, before, 'UI_DRIVE_FAILED')) continue;
      globalThis.closeModal?.({forceHandLimitClose:true});
      await sleep(100);
      continue;
    }
    if(!await waitForRevisionChange(before)){
      recordError('UI action did not produce an authoritative revision', {commandType:command.type, revision:before});
      if(await submitDiagnosticFallback(view, command, before, 'UI_NO_REVISION')) continue;
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
    publish();
    // Keep consecutive genuine UI gestures beyond the production canvas's
    // 80ms release guard. This remains fast while avoiding synthetic drops.
    await sleep(100);
  }
  result.running = false;
  result.finishedAt = Date.now();
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
  finishTestRunLock();
  publish();
});
