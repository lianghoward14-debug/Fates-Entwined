const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');
const adapter = fs.readFileSync('src/scripts/render-v2/04-match-renderer-adapter.js','utf8');
const sounds = [], pulses = [], callbacks = [];
const runtime = {
 window:{playSfx:type=>sounds.push(type), markCardEffectFlash:()=>true,
 FateMatchRendererAdapter:{renderFromGameState(){},presentFateDelta:p=>pulses.push(p)}},
 G:{},Date,Set,Map,
 deferredCardEffectFlashBypass:true,
 deferredCoordinatorFatePulseByIid:new Map(),
 coordinatorAuraFateDelayUntilByIid:new Map(),
 coordinatorAuraFateSoundModeByIid:new Map(),
 setTimeout:fn=>{callbacks.push(fn);return callbacks.length;},clearTimeout(){},
 getTimeline:()=>({clearForCardKind(){}}),presentFateDelta:p=>pulses.push(p),scheduleRender(){},
 getBoardCardPosition:()=>({z:0,r:0,c:0}),
 playResolvedFateChangeSfx:()=>sounds.push('resolved')
};
vm.createContext(runtime);
vm.runInContext(core.slice(core.indexOf('function flashCardEffect('),core.indexOf('window.flashCardEffect =')),runtime);
for(const [before,after,expected] of [[2,5,0],[5,2,1]]){
 sounds.length=0;
 const card={iid:'paired',_pendingFateOverlaySync:{seq:1,before,after,at:Date.now()},_effectFateVisualDelta:{seq:1,before,after}};
 assert.equal(runtime.flashCardEffect(card,'coord_kvetka_bloom'),true);
 assert.equal(sounds.length,expected,'paired overlay owns gain audio, while loss feedback remains');
 assert.equal(pulses.at(-1).delta,after-before,'Fate motion remains synchronized');
}
vm.runInContext(adapter.slice(adapter.indexOf('  function postConsolidationAnimationUntil('),adapter.indexOf('  function coordinatorCinematicDelayUntil(')),runtime);
vm.runInContext(adapter.slice(adapter.indexOf('  function deferCoordinatorFatePulse('),adapter.indexOf('  function placementFateRevealUntil(')),runtime);
for(const [mode,delta,expected] of [['overlay',3,[]],['kvetka',3,[]],['generic',3,['fateGain']],['overlay',-3,['fateLose']]]){
 sounds.length=0;
 runtime.coordinatorAuraFateSoundModeByIid.set('target',mode);
 runtime.deferCoordinatorFatePulse('target',5,5+delta,delta,Date.now());
 callbacks.pop()();
 assert.deepEqual(sounds,expected,mode+' '+delta);
 assert.equal(pulses.at(-1).delta,delta);
}
assert.match(adapter,/delta > 0 && incomingCoordinatorFeedback\.flashed/,'incoming coordinator overlays own gain audio');
for(const [key,guard] of [['paired-gain','shown'],['bh19-gain','shown'],['bh15-gain','overlayShown']]){
 assert.match(core,new RegExp('if\\(!'+guard+'\\)\\{\\s*if\\(typeof playFateSfxOnce[^\\n]+'+key),'queued overlay retains a generic fallback only if no overlay is shown');
}
console.log('Overlay Fate audio ownership regression passed.');
