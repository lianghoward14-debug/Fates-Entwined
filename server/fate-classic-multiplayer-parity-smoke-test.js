'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const setup = read('src/scripts/04-game-setup.js');
const data = read('src/scripts/01-data-and-state.js');
const core = read('src/scripts/05-gameplay-core.js');
const rendering = read('src/scripts/06-rendering-and-helpers.js');
const ai = read('src/scripts/07-ai.js');
const online = read('src/scripts/18-online-rooms.js');
const authority = read('server/fate-authority-reducer.js');

// Christopher Erbs must not leave END_TURN waiting on a modal owned by the
// incoming browser. The outgoing client records the prompt; the incoming one
// resolves the choice, performs the draw, and publishes the resulting state.
assert.match(setup, /function chooseOptionalImprovisorActivation[\s\S]*shouldDeferOnlineChoice[\s\S]*kind:'christopherErbsDrawChoice'[\s\S]*resolve\('defer-online-draw'\)/, 'Erbs must create a canonical deferred online draw choice');
assert.match(setup, /if\(activate === 'defer-online-draw'\) return \{onlineDrawDeferred:true\}/, 'a deferred Erbs draw must release the outgoing turn action');
assert.match(setup, /function findReadyChristopherErbs[\s\S]*cardActsAsPassive\(c, '40'\)/, 'Taylor copying Erbs must be recognized by the automatic draw prompt');
assert.match(online, /async function applyOnlineDeferredErbsDrawChoice[\s\S]*_serverPendingModalAction = null[\s\S]*window\.drawCard\(player, 1,[\s\S]*skipOptionalImprovisors:true/, 'the incoming player must resolve the deferred Erbs draw exactly once');
assert.match(online, /function sendOnlineDeferredErbsDrawChoice[\s\S]*sendOptimisticAction\('MODAL_ACTION'[\s\S]*applyOnlineDeferredErbsDrawChoice/, 'the Erbs choice and draw must be synchronized as one multiplayer action');

// Evaluate the shared copied-card identity layer. All continuous and reusable
// rules consume this layer rather than special-casing Taylor or Ledger.
const identityStart = core.indexOf('const FRENCH_FUSILIERS_COPYABLE_PASSIVE_IDS');
const identityEnd = core.indexOf('function canFrenchFusiliersCopyPassive', identityStart);
assert(identityStart >= 0 && identityEnd > identityStart, 'could not extract copied-card identity helpers');
const identitySandbox = {Set};
vm.createContext(identitySandbox);
vm.runInContext(
  core.slice(identityStart, identityEnd) +
    '\nthis.cardActsAsPassive = cardActsAsPassive;' +
    '\nthis.getCardRuntimeEffectId = getCardRuntimeEffectId;',
  identitySandbox,
  {filename:'fate-copy-identity-runtime.js'}
);
assert.equal(identitySandbox.cardActsAsPassive({id:'bh05', _bh05CopiedPassiveId:'44'}, '44'), true, 'Taylor must act as its copied ongoing card');
assert.equal(identitySandbox.cardActsAsPassive({id:'75', _ledgerCopiedSourceId:'73'}, '73'), true, 'Ledger must retain its copied Supporter identity');
assert.equal(identitySandbox.cardActsAsPassive({id:'bh05', _bh05CopiedPassiveId:'37', _copiedPassiveId:'93'}, '93'), true, 'Taylor copying French Fusiliers must retain the nested passive');
assert.equal(identitySandbox.cardActsAsPassive({id:'bh05', _bh05CopiedPassiveId:'44', _lydiaSuppressed:true}, '44'), false, 'suppression must still disable copied passives');
assert.equal(identitySandbox.getCardRuntimeEffectId({id:'bh05', _bh05CopiedPassiveId:'38'}), '38');
assert.equal(identitySandbox.getCardRuntimeEffectId({id:'75', _ledgerCopiedSourceId:'73'}), '73');

for(const id of ['01','02','10','11','14','15','19','21','23','34','36','38','41','44','46','55','57','63','70','73','77','78']){
  assert.match(core, new RegExp(`cardActsAsPassive\\([^\\n]*'${id}'\\)`), `classic copied effect ${id} must use the shared identity layer`);
}
assert.match(core, /const jake = liveJake && cardActsAsPassive\(liveJake, '38'\)/, 'Taylor copying Jake must update the live Taylor card');
assert.match(ai, /const effectId = typeof getCardRuntimeEffectId[\s\S]*reusableCopiedEffect[\s\S]*switch\(effectId\)/, 'AI must activate Taylor-copied reusable character effects by runtime identity');

// Ledger must bind the selected effect to the exact Ledger instance, and its
// copied identity must survive restoration of the printed card id.
assert.match(rendering, /function activateLedgerCopiedSupporterEffect\(player, ledgerZone, sourceSupporterInfo, ledgerRef\)[\s\S]*requestedLedgerIid[\s\S]*String\(cell\.iid \|\| ''\) === requestedLedgerIid[\s\S]*_ledgerCopiedSourceId/, 'Ledger copy resolution must target the chosen instance and retain its source id');
assert.match(core, /case '75':[\s\S]{0,220}pickBoardSupporterEffect\(cp,z,inst\)/, 'Ledger must pass its own instance into the copy picker');
assert.match(rendering, /cardActsAsPassive\(bc, '73'\)[\s\S]{0,900}activateExpeditionaryMove/, 'Ledger copying ALPINE Expeditionary must retain the movement follow-up');

// Alexander is a live equation, not a placement snapshot.
const alexanderStart = core.indexOf('function getAlexanderSupporterFateTotal');
const alexanderEnd = core.indexOf("if(typeof window !== 'undefined') window.getAlexanderSupporterFateTotal", alexanderStart);
assert(alexanderStart >= 0 && alexanderEnd > alexanderStart, 'could not extract Alexander helper');
const alexander = {id:'35', iid:'alexander', owner:0, currentFate:99};
const supporterA = {id:'44', iid:'supporter-a', owner:0, type:'Supporter', currentFate:3};
const supporterB = {id:'73', iid:'supporter-b', owner:0, type:'Supporter', currentFate:4};
const enemySupporter = {id:'63', iid:'enemy-supporter', owner:1, type:'Supporter', currentFate:20};
const alexanderSandbox = {
  G:{board:[[[alexander, supporterA, supporterB], [enemySupporter]], [], []]},
  isFaceDownCard:card=>!!card.faceDown,
  isCardSupporterForRules:card=>card.type === 'Supporter',
  getEffectiveFate:card=>Number(card.currentFate || 0),
  Math,
  Number,
  Array
};
vm.createContext(alexanderSandbox);
vm.runInContext(core.slice(alexanderStart, alexanderEnd) + '\nthis.total = getAlexanderSupporterFateTotal;', alexanderSandbox, {filename:'fate-alexander-runtime.js'});
assert.equal(alexanderSandbox.total(alexander, 0), 7, 'Alexander must total only friendly Supporters in his zone');
supporterA.currentFate = 8;
assert.equal(alexanderSandbox.total(alexander, 0), 12, 'Alexander must change immediately when a Supporter changes Fate');
alexanderSandbox.G.board[0][0][2] = null;
assert.equal(alexanderSandbox.total(alexander, 0), 8, 'Alexander must change immediately when a Supporter leaves');
assert.match(core, /const dynamicAlexanderFate = cardActsAsPassive\(card, '35'\)[\s\S]*getAlexanderSupporterFateTotal\(card, z\)[\s\S]*const baseFate = dynamicAlexanderFate/, 'effective Fate must consume Alexander\'s live total');
assert.match(ai, /case '35'[\s\S]{0,260}getAlexanderSupporterFateTotal\(inst, z\)/, 'AI Alexander must use the same live setup path');

// Boleslaw must see every classic search path in human, AI, and authority play.
for(const id of ['07','29','68']){
  assert.match(core, new RegExp(`searchSourceCardId:'${id}'`), `human card ${id} search must carry authority metadata`);
  assert.match(ai, new RegExp(`resolveBoleslawOpponentSearch\\(cp, \\{sourceCardId:'${id}'\\}\\)`), `AI card ${id} search must trigger Boleslaw`);
}
assert.match(core, /addAffFromDeckDiscard\(cp,'expanded_worlds',\{sourceCardId:'48'\}\)/, 'Cosmic GF must identify card 48 as its search source');
assert.match(ai, /resolveBoleslawOpponentSearch\(cp, \{sourceCardId:'48'\}\)/, 'AI Cosmic GF must trigger Boleslaw for a deck search');
assert.match(rendering, /function addAffFromDeckDiscard\(player, aff, searchOptions=\{\}\)[\s\S]*opponentSearch:true[\s\S]*searchSourceCardId:String\(searchOptions\.sourceCardId \|\| ''\)/, 'Cosmic GF deck picker must publish Boleslaw metadata');
assert.match(data, /id:'48'[\s\S]*non-Star "Expanded Worlds" card from the discard pile/, 'Cosmic GF rules text must explain that discard recovery cannot take Star cards');
assert.match(rendering, /function addAffFromDeckDiscard\(player, aff, searchOptions=\{\}\)[\s\S]*recoverableDiscardEligible = c=>affiliationEligible\(c\) && String\(c\.rarity \|\| ''\)\.toLowerCase\(\) !== 'star'[\s\S]*Choose one non-Star \$\{label\} card from your discard pile/, 'Cosmic GF human discard picker must exclude Star cards while leaving the deck picker unrestricted');
assert.match(ai, /case '48'[\s\S]*zoneName !== 'discard' \|\| String\(c\.rarity \|\| ''\)\.toLowerCase\(\) !== 'star'/, 'AI Cosmic GF must not recover Star cards from discard');
assert.doesNotMatch(authority, /AUTHORITY_CARD_SEARCH_SOURCE_IDS/, 'authority must recognize completed searches semantically instead of maintaining a brittle card whitelist');
assert.match(authority, /const selectedWasAdded = selectedIids\.length[\s\S]{0,420}if\(!selectedWasAdded\) return null/, 'authority must require the selected search result to reach hand before Boleslaw triggers');

// Previously incorrect AI-only mappings.
assert.match(ai, /case '34': \/\/ Rozsi Szocs: passive movement trigger is handled by triggerRozsiPassive\.\s*break;/, 'AI Rozsi must not execute the obsolete Fate boost');
assert.match(ai, /case '69'[\s\S]{0,850}_busserTurnsLeft = Math\.max\(3,[\s\S]{0,350}_busserSourceIid/, 'AI Busser must grant the same three-turn movement state as human play');
assert.doesNotMatch(ai, /case '69'[\s\S]{0,900}triggerRozsiPassive/, 'AI Busser must not immediately move or retrigger its target');
assert.match(ai, /case '31'[\s\S]{0,900}const target = opponents\[0\] \|\| friendly\[0\]/, 'mandatory AI Hemorrhaging Wound must fall back to a friendly target');
assert.match(ai, /case '03'[\s\S]{0,260}cell && cell\.owner===cp/, 'mandatory AI Howard must include its own card as a valid target');

console.log('Classic multiplayer parity smoke test passed.');
