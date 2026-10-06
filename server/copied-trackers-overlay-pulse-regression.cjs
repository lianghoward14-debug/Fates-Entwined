const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const helpers = fs.readFileSync('src/scripts/06-rendering-and-helpers.js','utf8');
const adapter = fs.readFileSync('src/scripts/render-v2/04-match-renderer-adapter.js','utf8');
const section = (s,a,b) => s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
const timers=[], frames=[];
const runtime={G:{}, document:{getElementById:()=>({classList:{contains:()=>true}})},
  escapeHtml:String, formatJoieDrawEffectsActivated:String,
  DIRTY_BOARD_CARDS:4, lastReport:{available:true},lastLayout:{},lastSnapshot:{},lastCanvasMetrics:{},
  setTimeout:fn=>{timers.push(fn);return timers.length;}, ownsBoard:()=>true,isActiveMatchScreen:()=>true,
  renderFromGameState:opts=>{frames.push(opts);runtime.scheduleLowMoraleSupporterPulse();},
  scheduleRender:()=>assert.fail('pulse entered deferred gameplay queue')};
vm.createContext(runtime);
vm.runInContext(section(helpers,'function buildCardDetailTrackerHTML(','function refreshWojciechInformationBanners('),runtime);
for(const copy of [{id:'bh05',_bh05CopiedCardId:'bh02'}, {id:'token',_whisperCopiedEffectId:'bh02'}]){
  Object.assign(copy,{owner:0,_joieProcCount:7,_bh05CopiedTrackerState:{_joieProcCount:99}});
  const before=JSON.stringify(copy);
  assert.match(runtime.buildCardDetailTrackerHTML(copy,0,false),/>7</);
  assert.equal(JSON.stringify(copy),before,'tracker must not mutate its card');
  copy._joieProcCount=8;
  assert.match(runtime.buildCardDetailTrackerHTML(copy,0,false),/>8</);
  assert.equal(runtime.buildCardDetailTrackerHTML(copy,0,true),'');
}
const live={id:'bh05',owner:0,_bh05CopiedCardId:'36'};
runtime.getBoardCardPosition=card=>{assert.equal(card,live);return {z:1};};
runtime.G.fateModifiers={deterrance_z1:-8};
assert.match(runtime.buildCardDetailTrackerHTML(live,0,false),/>2</);
vm.runInContext(section(adapter,'  let lowMoralePulseTimer =','  function isHighTAnimationFrame('),runtime);
runtime.scheduleLowMoraleSupporterPulse();
for(let i=0;i<5;i++) timers.shift()();
assert.equal(frames.length,5,'pulse continues without a gameplay redraw');
for(const source of ['low-morale-supporter-pulse','high-t-beat','fate-odometer']){
  assert.equal(runtime.isPersistentOverlayAnimationFrame(source,4),true);
  assert.equal(runtime.isPersistentOverlayAnimationFrame(source+'+gameplay',4),false);
  assert.equal(runtime.isPersistentOverlayAnimationFrame(source,12),false);
}
Object.assign(runtime, {
  nowMs:()=>0,dirtyMaskForSource:()=>4,noteGameplayBurst(){},activeBoardSurface:()=>({}),
  ensureCanvas:()=>({getContext:()=>({})}),isActionAnimationActive:()=>true,
  isActionCommitRenderAllowed:()=>false,forbiddenActionDirtyMask:mask=>mask,
  deferActionDirtyRender:()=>frames.push('deferred'),drawActionCompositorOnlyFrame:()=>true
});
vm.runInContext(section(adapter,'  function renderFromGameState(options){','    const vfxOnly =')+'\nreturn "pulse";\n}',runtime);
for(const source of ['low-morale-supporter-pulse','high-t-beat','fate-odometer'])
  assert.equal(runtime.renderFromGameState({source,dirtyMask:4}),'pulse','cinematic must allow overlay frames');
assert.equal(runtime.renderFromGameState({source:'gameplay',dirtyMask:4}),true);
assert.equal(frames.filter(f=>f==='deferred').length,1,'gameplay still respects cinematic gate');
console.log('Copied tracker and continuous overlay pulse regressions passed.');
