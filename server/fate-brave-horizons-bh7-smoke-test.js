#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = relative=>fs.readFileSync(path.join(ROOT, relative), 'utf8');
const core = read('src/scripts/05-gameplay-core.js');
const rendering = read('src/scripts/06-rendering-and-helpers.js');
const css = read('src/styles/zz-codex-last.css');
const adapter = read('src/scripts/render-v2/04-match-renderer-adapter.js');
const index = read('index.html');

assert.doesNotMatch(rendering, /syncBh07OverclockAuras/, 'ordinary renders must never trigger Agent-K feedback');
assert.doesNotMatch(core, /function syncBh07OverclockAuras/, 'Agent-K must not use render-polled adjacency timing');
assert.match(adapter, /String\(source\.type \|\| ''\) !== 'Dauntless'[\s\S]*getBh07OverclockSourcesForPlacedDauntless/, 'a newly placed Dauntless must still start the full Agent-K presentation');
assert.match(core, /function getIncomingCoordinatorEffectSources[\s\S]*cardActsAsPassive\(source, 'bh07'\)[\s\S]*kind:'bh07_overclock'/, 'cards newly placed into an active Agent-K zone must receive the Overclock incoming overlay');
assert.match(core, /const targetIsAdjacentDauntless = String\(target\.type \|\| ''\) === 'Dauntless'[\s\S]*if\(targetIsAdjacentDauntless\) return;[\s\S]*kind:'bh07_overclock'/, 'an adjacent Dauntless must be reserved for the shared Overclock reveal instead of receiving a duplicate isolated reveal');
assert.match(adapter, /overclockUntil = Math\.max\(coordinatorCinematicDelayUntil\(\), placementFateRevealUntil\(source, 0\)\)/, 'Agent-K must wait through the full placement cinematic and Fate reveal');
assert.match(adapter, /coordinatorAuraFateDelayUntilByIid\.set\(targetIid[\s\S]*scheduleBh07OverclockPresentation\(source, sourceIids, targetIids, overclockUntil\)/, 'all affected Fate badges and overlays must share the Overclock deadline');
assert.match(adapter, /const revealBh07Overclock = function\(\)[\s\S]*placementFateRevealUntil\(placedCard, pending\.until\)[\s\S]*deferCoordinatorFatePulse\(targetIid[\s\S]*flashBh07OverclockTargets[\s\S]*record\.until - Date\.now\(\)/, 'Overclock and affected Fate pulses must follow any extension of the cinematic deadline');
assert.match(css, /effect-flash-bh07_overclock[\s\S]*--effect-flash-mask/, 'Agent-K must retain a DOM Overclock overlay');
assert.match(adapter, /bh07_overclock:\{color:[\s\S]*kind === 'bh07_overclock'/, 'Agent-K must retain a canvas Overclock overlay');
const gameplayVersion = Number((index.match(/05-gameplay-core\.js\?v=(\d+)/) || [])[1]);
const renderingVersion = Number((index.match(/06-rendering-and-helpers\.js\?v=(\d+)/) || [])[1]);
const adapterVersion = Number((index.match(/04-match-renderer-adapter\.js\?v=(\d+)/) || [])[1]);
assert.ok(gameplayVersion >= 1785032475, 'Agent-K gameplay must be cache-busted');
assert.ok(renderingVersion >= 1785032461, 'Agent-K render trigger removal must be cache-busted');
assert.ok(adapterVersion >= 1785032426, 'Agent-K presentation timing must be cache-busted');

const start = core.indexOf('function getBh07AdjacentDauntlessCount');
const endMarker = 'window.flashBh07OverclockTargets = flashBh07OverclockTargets;';
const end = core.indexOf(endMarker, start) + endMarker.length;
assert.ok(start >= 0 && end > start, 'Agent-K runtime helpers must be extractable');

const agentK = {id:'bh07', iid:'agent-k', owner:0, type:'Coordinator'};
const dauntless = {id:'06', iid:'dauntless-1', owner:0, type:'Dauntless'};
const ally = {id:'11', iid:'ally-1', owner:0, type:'Coordinator'};
const enemy = {id:'12', iid:'enemy-1', owner:1, type:'Initiator'};
const board = [[
  [ally, dauntless, null],
  [null, agentK, enemy],
  [null, null, null]
]];
const flashes = [];
const runtime = {
  window:{},
  G:{board, turn:4},
  isFaceDownCard:card=>!!card?.faceDown,
  isCoordinatorSuppressedAt:()=>false,
  isFullyEffectImmuneCard:()=>false,
  forEachBoardCard(callback){
    board.forEach((zone,z)=>zone.forEach((row,r)=>row.forEach((card,c)=>{ if(card) callback(card,z,r,c); })));
  },
  findBoardCardByIid(iid){
    let found = null;
    board.forEach(zone=>zone.forEach(row=>row.forEach(card=>{ if(card && card.iid === iid) found = card; })));
    return found;
  },
  getAdjacentCards(z,r,c){
    const entries = [];
    [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc])=>{
      const card = board[z]?.[r+dr]?.[c+dc];
      if(card) entries.push({card,z,r:r+dr,c:c+dc});
    });
    return entries;
  },
  flashCardEffect(card, kind, options){
    flashes.push({iid:card.iid, kind, label:options && options.label});
    return true;
  }
};
vm.createContext(runtime);
vm.runInContext(core.slice(start, end), runtime);

assert.strictEqual(flashes.length, 0, 'Agent-K alone and ordinary renders must not create feedback');
const sources = runtime.window.getBh07OverclockSourcesForPlacedDauntless(dauntless, 0, 0, 1);
assert.deepStrictEqual(Array.from(sources, entry=>entry.card.iid), ['agent-k'], 'the placed Dauntless must find only an adjacent active Agent-K');
const targets = runtime.window.getBh07OverclockTargets(sources[0]);
assert.deepStrictEqual(Array.from(targets, card=>card.iid).sort(), ['agent-k','ally-1','dauntless-1'], 'Overclock must cover every friendly card in Agent-K\'s zone and exclude enemies');
assert.strictEqual(runtime.window.flashBh07OverclockTargets(['agent-k'], targets.map(card=>card.iid), 'test-overclock'), true);
assert.deepStrictEqual(flashes.map(entry=>entry.iid).sort(), ['agent-k','ally-1','dauntless-1'], 'the deferred reveal must flash the complete affected set together');
assert.ok(flashes.every(entry=>entry.kind === 'bh07_overclock' && entry.label === 'Overclock'));

const incomingStart = core.indexOf('const COORDINATOR_PLACEMENT_FLASH_KIND_BY_ID');
const incomingEndMarker = 'if(typeof window !== \'undefined\') window.getIncomingCoordinatorEffectSources = getIncomingCoordinatorEffectSources;';
const incomingEnd = core.indexOf(incomingEndMarker, incomingStart) + incomingEndMarker.length;
assert.ok(incomingStart >= 0 && incomingEnd > incomingStart, 'Agent-K incoming coordinator helpers must be extractable');
const incomingRuntime = {
  window:{},
  G:{board, turn:4},
  isFaceDownCard:card=>!!card?.faceDown,
  isCoordinatorSuppressedAt:()=>false,
  isCardEffectImmutable:()=>false,
  isCardCharacterForRules:card=>card?.type !== 'Supporter',
  isCardSupporterForRules:card=>card?.type === 'Supporter',
  cardActsAsPassive(card, sourceId){
    return String(card?.id || '') === String(sourceId)
      || (String(card?.id || '') === 'bh05' && String(card?._bh05CopiedPassiveId || '') === String(sourceId));
  },
  getCardRuntimeEffectId(card){
    return String(card?.id || '') === 'bh05' && card?._bh05CopiedPassiveId
      ? String(card._bh05CopiedPassiveId)
      : String(card?.id || '');
  },
  getAdjacentCards:zrcRuntimeGetAdjacentCards
};
function zrcRuntimeGetAdjacentCards(z,r,c){
  const entries = [];
  [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc])=>{
    const card = board[z]?.[r+dr]?.[c+dc];
    if(card) entries.push({card,z,r:r+dr,c:c+dc});
  });
  return entries;
}
vm.createContext(incomingRuntime);
vm.runInContext(core.slice(incomingStart, incomingEnd), incomingRuntime);
const incomingSources = incomingRuntime.window.getIncomingCoordinatorEffectSources(ally, 0, 0, 0);
assert.ok(incomingSources.some(entry=>entry.card.iid === 'agent-k' && entry.kind === 'bh07_overclock'), 'a non-Dauntless card entering active Agent-K\'s zone must flash Overclock with its Fate gain');
const adjacentDauntlessSources = incomingRuntime.window.getIncomingCoordinatorEffectSources(dauntless, 0, 0, 1);
assert.ok(!adjacentDauntlessSources.some(entry=>entry.card.iid === 'agent-k'), 'an adjacent Dauntless must not receive a second isolated Agent-K overlay');
const nonAdjacentDauntless = {id:'44', iid:'dauntless-2', owner:0, type:'Dauntless'};
const nonAdjacentDauntlessSources = incomingRuntime.window.getIncomingCoordinatorEffectSources(nonAdjacentDauntless, 0, 2, 2);
assert.ok(nonAdjacentDauntlessSources.some(entry=>entry.card.iid === 'agent-k' && entry.kind === 'bh07_overclock'), 'a Dauntless placed away from Agent K must receive only the isolated incoming overlay while Overclock is active');
const adjacentNonDauntless = {id:'23', iid:'coordinator-2', owner:0, type:'Coordinator'};
const adjacentNonDauntlessSources = incomingRuntime.window.getIncomingCoordinatorEffectSources(adjacentNonDauntless, 0, 1, 0);
assert.ok(adjacentNonDauntlessSources.some(entry=>entry.card.iid === 'agent-k' && entry.kind === 'bh07_overclock'), 'a non-Dauntless placed adjacent to Agent K must receive the isolated incoming overlay while Overclock is active');

console.log('Brave Horizons BH7 smoke test passed.');
