import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {cardRule} from '../shared/engine/cards/registry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const core = read('src/scripts/05-gameplay-core.js');
const rendering = read('src/scripts/06-rendering-and-helpers.js');
const ai = read('src/scripts/07-ai.js');
const online = read('src/scripts/18-online-rooms.js');
const data = read('src/scripts/01-data-and-state.js');

function sourceSet(name){
  const match = core.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  assert.ok(match, `${name} must be declared in the browser gameplay core`);
  return new Set(Array.from(match[1].matchAll(/'([^']+)'/g), item=>item[1]));
}

const ids = [
  ...Array.from({length:100}, (_, index)=>String(index + 1).padStart(2, '0')),
  ...Array.from({length:25}, (_, index)=>'bh' + String(index + 1).padStart(2, '0'))
];
const engineActivate = new Set(ids.filter(id=>cardRule(id)?.timings?.includes('ACTIVATE')));
const engineWhenSet = new Set(ids.filter(id=>cardRule(id)?.timings?.includes('WHEN_SET')));
assert.deepEqual(sourceSet('AUTHORITATIVE_ACTIVATE_EFFECT_IDS'), engineActivate, 'single-player ACTIVATE timing must exactly mirror the authoritative registry');
assert.deepEqual(sourceSet('AUTHORITATIVE_WHEN_SET_EFFECT_IDS'), engineWhenSet, 'single-player WHEN_SET timing must exactly mirror the authoritative registry');

assert.match(core, /const _hasWhenSet = AUTHORITATIVE_WHEN_SET_EFFECT_IDS\.has[\s\S]{0,900}await playEffectActivationCinematic[\s\S]{0,900}await triggerCharacterEffect/, 'automatic Character effects must await activation presentation before resolving');
assert.match(core, /async function runWhenSetEffect[\s\S]{0,6000}opts\.fromSet === true[\s\S]{0,700}await playEffectActivationCinematic[\s\S]{0,2600}checkReactions/, 'automatic non-Character effects must await activation presentation before reactions and results');
assert.doesNotMatch(core.match(/async function triggerWhenSet[\s\S]*?\n}/)?.[0] || '', /queueDeferredWhenSetEffect/, 'WHEN_SET placement must never create a manual activation action');
assert.match(data, /window\.fateAutoActivateEffectsEnabled[\s\S]{0,900}return true;/, 'automatic effects must be enabled by default behind one reversible flag');
assert.match(data, /window\.setFateAutoActivateEffects = function\(enabled\)/, 'the automatic-effects flag must have a reversible runtime setter');
assert.match(core, /function shouldShowManualCharacterEffectButton\(card\)[\s\S]{0,300}if\(automaticBoardEffectsEnabled\(\)\) return false;[\s\S]{0,160}canUseManualCharacterEffect/, 'single-player manual effect buttons must be hidden only while the reversible automatic mode is enabled');
assert.match(core, /resolveSetCardAfterPlacement[\s\S]{0,3600}fateQueueAutomaticBoardEffectResolution\('post-placement'\)/, 'automatic activation must begin only after placement resolution completes');
assert.match(online, /function phase7ScheduleAutomaticEffectResolution[\s\S]{0,1800}ACTIVATE_EFFECT[\s\S]{0,1000}phase7SubmitCommand/, 'authoritative multiplayer must auto-submit only a server-issued activation command');

const boardModalStart = rendering.indexOf('if(boardDetail){');
const boardModalEnd = rendering.indexOf("document.getElementById('modal').classList.add('on');", boardModalStart);
const boardModal = boardModalStart >= 0 && boardModalEnd > boardModalStart
  ? rendering.slice(boardModalStart, boardModalEnd)
  : '';
assert.ok(boardModal, 'board detail actions must be extractable');
assert.doesNotMatch(boardModal, /activatePendingWhenSetEffect|canActivateDeferredSetEffect/, 'board details must not expose the retired deferred WHEN_SET action');

const predecessorStart = rendering.indexOf('function effectActivationPredecessorRemaining');
const predecessorEnd = rendering.indexOf('function scheduleEffectActivationCinematicDrain', predecessorStart);
const predecessor = predecessorStart >= 0 && predecessorEnd > predecessorStart
  ? rendering.slice(predecessorStart, predecessorEnd)
  : '';
for(const required of ['_placementUiLockUntil', '_cinematicUiLockUntil', '_scheduledCharacterSetCinematicCount > 0', '_consolidationCinematicQueue.length > 0', 'presenter.isActive']) {
  assert.ok(predecessor.includes(required), `activation predecessor barrier must include ${required}`);
}
assert.match(rendering, /function showEffectActivationCinematic[\s\S]{0,900}effectActivationPredecessorRemaining\(\) > 0[\s\S]{0,200}queueEffectActivationCinematic/, 'all direct activation-cinematic callers must pass through the predecessor barrier');
assert.match(rendering, /function scheduleEffectActivationCinematicDrain[\s\S]{0,900}effectActivationPredecessorRemaining\(\) > 0[\s\S]{0,200}scheduleEffectActivationCinematicDrain/, 'queued activation cinematics must re-check the barrier before starting');

assert.match(ai, /hasAutomaticSetActivation = typeof hasAuthoritativeWhenSetEffect[\s\S]{0,800}await playEffectActivationCinematic/, 'single-player AI must use the same rules-mode-aware automatic WHEN_SET presentation rule');
assert.match(ai, /Collect only genuine ACTIVATE characters[\s\S]{0,600}shouldShowManualCharacterEffectButton\(card\)/, 'single-player AI must not activate WHEN_SET cards a second time');
assert.match(online, /await phase7PlayCardSetPresentations\(view, events\)[\s\S]{0,240}await phase7PlayActivationCinematics\(view, events\)[\s\S]{0,240}await phase7PresentBatch\(view, events\)/, 'authoritative multiplayer must preserve set cinematic, activation cinematic, then results ordering');

const triggerStart = core.indexOf('async function triggerWhenSet');
const triggerEnd = core.indexOf('function markInitialEffectResolved', triggerStart);
assert.ok(triggerStart >= 0 && triggerEnd > triggerStart, 'triggerWhenSet must be extractable');
const order = [];
let lastWhenSetOptions = null;
const context = {
  G:{currentPlayer:0, turn:3, selectedBoardCard:null},
  AUTHORITATIVE_WHEN_SET_EFFECT_IDS:engineWhenSet,
  isFaceDownCard:()=>false,
  applyPermanentEffectImmunity:()=>{},
  isCardSupporterForRules:card=>card.type === 'Supporter',
  applyRiveraBuffToPlacedCard:()=>{},
  isEffectImmuneSource:()=>true,
  applyWodnyPotokLumberjackSuppression:()=>false,
  playEffectActivationCinematic:async()=>{
    order.push('activation:start');
    await new Promise(resolve=>setTimeout(resolve, 5));
    order.push('activation:end');
  },
  triggerCharacterEffect:async()=>{ order.push('character:resolve'); },
  runWhenSetEffect:async(card, z, r, c, options)=>{
    lastWhenSetOptions = options;
    order.push('when-set:resolve');
  },
  markInitialEffectResolved:()=>{},
  setTimeout,
  console
};
vm.createContext(context);
vm.runInContext(core.slice(triggerStart, triggerEnd), context);

await context.triggerWhenSet({id:'96', iid:'snow-shoveler', type:'Supporter', owner:0}, 0, 2, 0);
assert.deepEqual(order, ['when-set:resolve'], 'automatic Supporters must route directly into their WHEN_SET resolver');
assert.equal(lastWhenSetOptions?.fromSet, true, 'automatic Supporters must enable the resolver presentation gate');
order.length = 0;
await context.triggerWhenSet({id:'04', iid:'zoe', type:'Initiator', owner:0, effectUsedInitial:false}, 0, 2, 0);
assert.deepEqual(order, ['activation:start','activation:end','character:resolve'], 'automatic Character results must wait until activation presentation finishes');
order.length = 0;
await context.triggerWhenSet({id:'26', iid:'ucpd', type:'Supporter', owner:0}, 0, 2, 0);
assert.deepEqual(order, [], 'genuine ACTIVATE cards must not resolve from placement');

console.log('fate activation presentation order smoke passed');
