const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const adapter=fs.readFileSync('src/scripts/render-v2/04-match-renderer-adapter.js','utf8');
const core=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');
let now=1000,callback;const pulses=[],sounds=[];
const r={G:{},Date:{now:()=>now},window:{playSfx:s=>sounds.push(s)},
 deferredCoordinatorFatePulseByIid:new Map(),coordinatorAuraFateDelayUntilByIid:new Map(),coordinatorAuraFateSoundModeByIid:new Map(),
 setTimeout:fn=>{callback=fn;return 1},clearTimeout(){},getTimeline:()=>({clearForCardKind(){}}),presentFateDelta:p=>pulses.push(p),scheduleRender(){}};
vm.createContext(r);
for(const [start,end] of [['postConsolidationAnimationUntil','coordinatorCinematicDelayUntil'],['deferCoordinatorFatePulse','placementFateRevealUntil'],['placementFateRevealUntil','clearLivePlacementFateReveal']])vm.runInContext(adapter.slice(adapter.indexOf('  function '+start+'('),adapter.indexOf('  function '+end+'(')),r);
for(const mode of ['singleplayer','multiplayer']){
 r.G={_online:mode==='multiplayer'};pulses.length=0;sounds.length=0;now=1000;
 r.deferCoordinatorFatePulse('target',2,5,3,1100);
 // The follow-up begins after the original Fate timer was scheduled.
 now=1100;r.G._coordinatorSignatureUntil=3100;r.G._postConsolidationFateFeedbackUntil=3100;
 callback();assert.equal(pulses.length,0);assert.equal(sounds.length,0);
 assert.ok(r.placementFateRevealUntil({},1100)>3100);
 // An extended/queued animation must be rechecked, not just delayed once.
 now=3100;r.G._postConsolidationFateFeedbackUntil=4100;callback();assert.equal(pulses.length,0);
 now=4124;callback();assert.equal(pulses.length,1);assert.deepEqual(sounds,['fateGain']);
}
vm.runInContext(core.slice(core.indexOf('function consolidationOverlayGateIsActive('),core.indexOf('function scheduleDeferredCardEffectFlashDrain(')),r);
r.G={_postConsolidationFateFeedbackUntil:5000};assert.equal(r.consolidationOverlayGateIsActive(),true);
console.log('Post-consolidation Fate timing regression passed for local and online state.');
