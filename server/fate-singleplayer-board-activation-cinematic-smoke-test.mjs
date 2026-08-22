import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const gameplay = fs.readFileSync(new URL('../src/scripts/05-gameplay-core.js', import.meta.url), 'utf8');
const metadata = fs.readFileSync(new URL('../src/scripts/02-effect-rule-metadata.js', import.meta.url), 'utf8');
const rendering = fs.readFileSync(new URL('../src/scripts/06-rendering-and-helpers.js', import.meta.url), 'utf8');
const data = fs.readFileSync(new URL('../src/scripts/01-data-and-state.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function between(startText, endText) {
  const start = gameplay.indexOf(startText);
  const end = gameplay.indexOf(endText, start + startText.length);
  assert.notEqual(start, -1, `${startText} must exist`);
  assert.notEqual(end, -1, `${endText} must follow ${startText}`);
  return gameplay.slice(start, end);
}

const characterActivation = between('async function triggerCharacterEffect', 'function shouldShowManualCharacterEffectButton');
const pendingActivation = between('async function activatePendingWhenSetEffect', 'async function triggerWhenSet');
const wodnyActivation = between('async function activateWodnyPotokYouth', 'window.activateWodnyPotokYouth = activateWodnyPotokYouth;');
const expeditionaryActivation = between('async function activateExpeditionaryMove', 'function activateLandscapeEventideMove');
const busserActivation = between('async function activateBusserMove', '//  REACTION SYSTEM');

for(const [label, source] of [
  ['generic manual card effects', characterActivation],
  ['deferred set effects', pendingActivation],
  ['Snowball Fight', wodnyActivation],
  ['ALPINE Expeditionary', expeditionaryActivation],
  ['Bussing', busserActivation]
]) {
  assert.match(source, /await playEffectActivationCinematic\(/,
    `${label} must await the shared activation cinematic`);
}

assert.match(data, /FATE_PLAYER_TIMED_MANUAL_EFFECT_CARD_IDS = Object\.freeze\(\['26', '38', '40', '93'\]\)/,
  'Christopher Erbs must remain registered as a player-timed manual effect');
assert.match(rendering, /bc\.type==='Improvisor' && String\(bc\.id \|\| ''\) !== '40'[\s\S]{0,900}triggerCharacterEffect\(bc,z,r,c\)/,
  'Christopher Erbs must retain the generic Activate Effect button route');
assert.match(characterActivation, /await playEffectActivationCinematic[\s\S]*case '40':[\s\S]*G\.erbsActive\[cp\] = true/,
  'Christopher Erbs must finish the generic cinematic before arming the next draw');
assert.match(wodnyActivation, /await playEffectActivationCinematic[\s\S]*await beginManualSupporterEffectActivation[\s\S]*pickCardFromAnyZone/,
  'Snowball Fight must finish its cinematic before reactions and target selection');
assert.match(expeditionaryActivation, /await playEffectActivationCinematic[\s\S]*await beginManualSupporterEffectActivation[\s\S]*G\._expMoving/,
  'ALPINE Expeditionary must finish its cinematic before reactions and movement selection');
assert.match(busserActivation, /await playEffectActivationCinematic[\s\S]*G\._busserMovingCard/,
  'Bussing must finish its cinematic before movement selection');
assert.match(metadata, /activateVigilantes:'supporter_effect'[\s\S]*activateExpeditionaryMove:'supporter_effect'[\s\S]*activateBusserMove:'supporter_effect'[\s\S]*activateWodnyPotokYouth:'supporter_effect'/,
  'the audited dedicated handlers must remain registered as card-effect activations');

for(const source of [wodnyActivation, expeditionaryActivation, busserActivation]) {
  assert.match(source, /!G\._onlineRoomCode && typeof playEffectActivationCinematic/,
    'single-player additions must not duplicate multiplayer authoritative cinematics');
}

const wodnyEvents = [];
const wodnyCard = {id:'93', iid:'wodny-youth', owner:0, effectUsedThisTurn:false};
const wodnyContext = {
  card:wodnyCard,
  G:{currentPlayer:0, _onlineRoomCode:''},
  toast:()=>{}, renderGame:()=>{}, Date,
  playEffectActivationCinematic:async ()=>{ wodnyEvents.push('cinematic'); await Promise.resolve(); },
  beginManualSupporterEffectActivation:async ()=>{ wodnyEvents.push('reaction-gate'); return true; },
  showEffectActivationGlow:()=>wodnyEvents.push('glow'),
  pickCardFromAnyZone:()=>wodnyEvents.push('target-picker')
};
vm.runInNewContext(wodnyActivation, wodnyContext);
await Promise.all([
  vm.runInNewContext('activateWodnyPotokYouth(card, 2, 1, 0)', wodnyContext),
  vm.runInNewContext('activateWodnyPotokYouth(card, 2, 1, 0)', wodnyContext)
]);
assert.deepEqual(wodnyEvents, ['cinematic', 'reaction-gate', 'glow', 'target-picker'],
  'Snowball Fight must play exactly one cinematic before opening its picker');

const expeditionaryEvents = [];
const expeditionaryCard = {id:'73', iid:'expeditionary', owner:0};
const emptyZone = ()=>[[null, null, null], [null, null, null], [null, null, null]];
const expeditionaryContext = {
  card:expeditionaryCard,
  G:{currentPlayer:0, _onlineRoomCode:'', board:[emptyZone(), emptyZone(), emptyZone()]},
  window:{FateMatchRendererAdapter:{scheduleRender:()=>{}}},
  document:{querySelector:()=>({classList:{add:()=>{}}})},
  Date,
  isLocalPlayerActionTurn:()=>true,
  playEffectActivationCinematic:async ()=>{ expeditionaryEvents.push('cinematic'); await Promise.resolve(); },
  beginManualSupporterEffectActivation:async ()=>{ expeditionaryEvents.push('reaction-gate'); return true; },
  showEffectActivationGlow:()=>expeditionaryEvents.push('glow'),
  toast:()=>expeditionaryEvents.push('movement-prompt'),
  clearBoardTargetSelection:()=>{}, clearPlaceHighlights:()=>{},
  isBlocked:()=>false, isContestedOrOwnSafeSquare:()=>true
};
vm.runInNewContext(expeditionaryActivation, expeditionaryContext);
await Promise.all([
  vm.runInNewContext('activateExpeditionaryMove(card, 1, 2, 0)', expeditionaryContext),
  vm.runInNewContext('activateExpeditionaryMove(card, 1, 2, 0)', expeditionaryContext)
]);
assert.deepEqual(expeditionaryEvents.slice(0, 4), ['cinematic', 'reaction-gate', 'glow', 'movement-prompt'],
  'ALPINE Expeditionary must play exactly one cinematic before opening movement selection');

const busserEvents = [];
const busserCard = {id:'07', iid:'busser-mover', owner:0, name:'Mover', _busserTurnsLeft:3};
const busserContext = {
  card:busserCard,
  G:{currentPlayer:0, _onlineRoomCode:'', board:[emptyZone(), emptyZone(), emptyZone()]},
  window:{}, Date,
  toast:message=>{ if(/^Click an open square/.test(message)) busserEvents.push('movement-prompt'); },
  getBusserTurnsLeft:()=>3, isStoredEffectSourceSuppressed:()=>false, isBlocked:()=>false,
  clearPlaceHighlights:()=>{},
  playEffectActivationCinematic:async ()=>{ busserEvents.push('cinematic'); await Promise.resolve(); },
  fateFastShowMovementTargets:()=>busserEvents.push('movement-targets'),
  showEffectActivationGlow:()=>busserEvents.push('glow'),
  showBusserStatusBanner:()=>{}, refreshStatusEffectsNow:()=>{}
};
vm.runInNewContext(busserActivation, busserContext);
await Promise.all([
  vm.runInNewContext('activateBusserMove(card, 1, 2, 0)', busserContext),
  vm.runInNewContext('activateBusserMove(card, 1, 2, 0)', busserContext)
]);
assert.deepEqual(busserEvents, ['cinematic', 'movement-prompt', 'movement-targets', 'glow'],
  'Bussing must play exactly one cinematic before opening movement selection');

assert.match(index, /05-gameplay-core\.js\?v=1787630002/,
  'the complete single-player button-cinematic fix must be cache-busted');

console.log('single-player board activation cinematic smoke passed');
