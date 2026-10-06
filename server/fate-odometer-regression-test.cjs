const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const adapter = fs.readFileSync('src/scripts/render-v2/04-match-renderer-adapter.js', 'utf8');
const core = fs.readFileSync('src/scripts/05-gameplay-core.js', 'utf8');
let now = 10000, reduced = false, blockedUntil = 0, frames = 0;
const glyphs = [], sounds = [], timers = new Map();
let timerId = 0;
const runtime = {
  window:{matchMedia:()=>({matches:reduced}), getFateFeedbackPresentationBlockUntil:()=>blockedUntil},
  Date:{now:()=>now}, G:{}, nowMs:()=>now, animationsOff:()=>false,
  fateOdometersByIid:new Map(), localizeCanvasText:s=>s,
  enqueueRender:()=>frames++, DIRTY_BOARD_CARDS:4,
  playSfx:type=>sounds.push(type),
  setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},
  clearTimeout:id=>timers.delete(id)
};
vm.createContext(runtime);
vm.runInContext(adapter.slice(adapter.indexOf('  function fateDigitLayout('), adapter.indexOf('  function getTimeline(')), runtime);
const styles=[];
const ctx = {fillStyle:'#7fff90',save(){styles.push(this.fillStyle);},restore(){this.fillStyle=styles.pop();},beginPath(){},rect(){},clip(){},measureText:text=>({width:[...text].reduce((sum,d)=>sum+(d==='1'?6:10),0)}),fillText(text,x,y){glyphs.push({text,x,y,color:this.fillStyle});}};
const draw = value => {glyphs.length=0;return runtime.drawFateOdometer(ctx,'card',String(value),50,20,30,36);};
assert.equal(draw(18),false,'initial board value must not animate');
assert.equal(draw(25),true,'gain must roll in the badge');
assert.deepEqual(glyphs.filter(g=>g.y===20).map(g=>g.text),['1','8'],'first rolling frame keeps the old value');
now+=450;
assert.equal(draw(25),true);
assert.ok(glyphs.some(g=>g.y!==20),'digits move vertically inside the clip');
const previousStart=runtime.fateOdometersByIid.get('card').start;
draw(25);
assert.equal(runtime.fateOdometersByIid.get('card').start,previousStart,'repaint must not restart animation');
draw(30);
assert.ok(runtime.fateOdometersByIid.get('card').from>=18 && runtime.fateOdometersByIid.get('card').from<25,'rapid gain continues from visible count');
now+=1200;
assert.equal(draw(30),false,'animation settles exactly at the target');
assert.equal(draw(12),true,'loss rolls down');
assert.ok(glyphs.every(g=>g.color==='#ff6060'),'decreasing digits are red even when final badge is green');
now+=100;
draw(12);
assert.ok(glyphs.some(g=>g.y>20 && g.y<44.6),'outgoing digits move downward');
now+=1100;
assert.equal(draw(12),false,'loss settles at target');
assert.equal(ctx.fillStyle,'#7fff90','settled rendering retains the normal above-base green');
reduced=true;
assert.equal(draw(19),false,'reduced motion snaps directly');
reduced=false;
assert.equal(draw('-'),false,'hidden Fate cancels stored animation');
assert.equal(draw(50),false,'revealing hidden Fate must not expose a prior value');
draw(99);now+=1200;draw(99);draw(102);
assert.deepEqual(glyphs.filter(g=>g.y===20).map(g=>g.text),['','9','9'],'digit carry adds a blank leading slot');
assert.ok(frames>0,'rolling requests subsequent card frames');

for(const [from,to] of [[1,16],[99,102],[102,9]]) {
  const iid='layout-'+from+'-'+to;
  runtime.drawFateOdometer(ctx,iid,String(from),50,20,30,36);
  runtime.drawFateOdometer(ctx,iid,String(to),50,20,30,36);
  now+=1099;glyphs.length=0;
  runtime.drawFateOdometer(ctx,iid,String(to),50,20,30,36);
  const rollingX=[...new Set(glyphs.map(g=>g.x))];
  glyphs.length=0;
  runtime.drawSettledFateDigits(ctx,String(to),50,20,36);
  assert.deepEqual(glyphs.map(g=>g.x),[50],'ordinary settled Fate stays centered');
  const label=String(to),left=50-ctx.measureText(label).width/2;
  const expected=[...label].map((d,i)=>left+ctx.measureText(label.slice(0,i+1)).width-ctx.measureText(d).width/2);
  assert.deepEqual(rollingX.slice(-label.length),expected,'rolling glyphs land at the original centered text positions');
}

const ticks=[];
Object.assign(runtime, {getCardIid:c=>c.iid,deferredPlacementFatePulseByIid:new Map(),completedPlacementFateRevealAtByIid:new Map(),deferredCoordinatorFatePulseByIid:new Map()});
vm.runInContext(adapter.slice(adapter.indexOf('  function coordinatorFatePresentationVisual('),adapter.indexOf('  function drawFateBadge(')),runtime);
for(const id of ['87','32']) {
  const card={id,iid:'timing-'+id,fate:1,_placementFateReveal:{fromValue:5,createdAt:now}};
  const visual={displayFate:'5',currentFate:5};
  let held=runtime.coordinatorFatePresentationVisual(card,visual);
  assert.equal(held.displayFate,'1','first placement paint holds base before observer registers timer');
  assert.equal(held._placementFateHeld,true);
  runtime.deferredPlacementFatePulseByIid.set(card.iid,{fromValue:5,until:now-1});
  held=runtime.coordinatorFatePresentationVisual(card,visual);
  assert.equal(held.displayFate,'1','expired timestamp does not release until completion callback');
  runtime.completedPlacementFateRevealAtByIid.set(card.iid,now);
  runtime.deferredPlacementFatePulseByIid.delete(card.iid);
  assert.equal(runtime.coordinatorFatePresentationVisual(card,visual).displayFate,'5','completion releases final value even with stale snapshot metadata');
}
vm.runInContext(core.slice(core.indexOf('function preparePlacementFateReveal('),core.indexOf('function playAlpineInfantryFateGainSound(')),runtime);
for(const mode of ['set','consolidation']) for(const [base,final,wci] of [[1,8,false],[3,10,false],[1,6,false],[2,4,true],[5,2,false],[1,1,false]]) {
  const source={fate:base,currentFate:final,_wciBonus:wci};
  const placed={id:'94',iid:mode+'-'+base+'-'+final,fate:base,currentFate:final};
  runtime.preparePlacementFateReveal(placed,source,mode);
  assert.equal(placed._placementFateReveal.fromValue,base,'hand/deck boosts and WCI do not skip the printed starting value');
  assert.equal(runtime.drawFateOdometer(ctx,placed.iid,String(base),50,20,30,36,placed),false,'deferred placement holds printed Fate');
  assert.equal(runtime.drawFateOdometer(ctx,placed.iid,String(final),50,20,30,36,placed),base!==final,'final reveal animates every modified placement');
  now+=1200;
  assert.equal(runtime.drawFateOdometer(ctx,placed.iid,String(final),50,20,30,36,placed),false);
}
runtime.window.playFateCountTick=(progress,remaining,decreasing)=>ticks.push({progress,remaining,decreasing});
const mailman={iid:'hugh-mailman',fate:1};
assert.equal(runtime.drawFateOdometer(ctx,mailman.iid,'8',50,20,30,36,mailman),true,'boosted Mailman rolls on its first board paint');
assert.equal(runtime.fateOdometersByIid.get(mailman.iid).from,1);
assert.equal(runtime.fateOdometersByIid.get(mailman.iid).to,8);
assert.equal(ticks.at(-1).decreasing,false,'placement gain has counting audio');
now+=1200;
assert.equal(runtime.drawFateOdometer(ctx,mailman.iid,'8',50,20,30,36,mailman),false);
assert.equal(runtime.drawFateOdometer(ctx,mailman.iid,'8',50,20,30,36,mailman),false,'repaints do not replay placement gain');
const weakened={iid:'weakened-arrival',fate:5};
assert.equal(runtime.drawFateOdometer(ctx,weakened.iid,'2',50,20,30,36,weakened),true);
assert.equal(runtime.fateOdometersByIid.get(weakened.iid).decreasing,true,'below-base arrival rolls down');
ticks.length=0;
const baseCard={iid:'base-card',fate:1};
const drawBase=value=>runtime.drawFateOdometer(ctx,baseCard.iid,String(value),50,20,30,36,baseCard);
drawBase(15);now+=1200;drawBase(15);ticks.length=0;drawBase(16);
assert.equal(runtime.fateOdometersByIid.get(baseCard.iid).from,1,'gain counts from printed base rather than previous 15');
assert.equal(ticks.at(-1).decreasing,false);
now+=500;drawBase(16);
assert.equal(ticks.length,2,'sound continues during the roll');
now+=650;drawBase(16);
assert.equal(ticks.length,2,'sound stops when count settles');
drawBase(12);
assert.equal(ticks.at(-1).decreasing,true,'loss uses descending sound');
baseCard._effectFlash={at:now,duration:1200};
const beforeOverlay=ticks.length;
now+=200;drawBase(12);
assert.equal(ticks.length,beforeOverlay,'overlay sound owns audio during decrease');
blockedUntil=now+1000;
drawBase(18);
assert.equal(ticks.length,beforeOverlay+1,'gain sound plays alongside overlay audio and presentation locks');
now+=200;drawBase(18);
assert.equal(ticks.length,beforeOverlay+2,'gain ticks continue while overlay is active');
now+=1000;drawBase(18);
assert.equal(ticks.length,beforeOverlay+2,'overlapping gain sound still ends with its count');
blockedUntil=0;
delete baseCard._effectFlash;
delete runtime.window.playFateCountTick;

// Exercise the production gain branch with a layer that rejects any popup.
Object.assign(runtime, {
  activeBoardSurface:()=>({}), ensureFateNumberLayer:()=>({appendChild(){throw Error('gain popup created');}}),
  postConsolidationAnimationUntil:()=>0, recentFateNumbersByKey:new Map(),
  renderCounters:{fateNumberDuplicatesSuppressed:0},clearFateNumberPresentation(){},scheduleRender(){},
  document:{createElement(){throw Error('gain popup created');}}
});
vm.runInContext(adapter.slice(adapter.indexOf('  function presentFateDelta('), adapter.indexOf('  function ensureCanvas(')), runtime);
assert.equal(runtime.presentFateDelta({iid:'card',fromValue:18,toValue:25,delta:7}),true);
assert.equal(runtime.presentFateDelta({iid:'card',fromValue:18,toValue:25,delta:7}),true);
assert.equal(runtime.renderCounters.fateNumberDuplicatesSuppressed,1,'duplicate gain is consumed without a popup');
assert.equal(runtime.presentFateDelta({iid:'card',fromValue:25,toValue:18,delta:-7}),true,'loss has no popup either');

vm.runInContext(adapter.slice(adapter.indexOf('  function numericFateValue('),adapter.indexOf('  function coordinatorFatePresentationVisual(')),runtime);
assert.equal(runtime.fateBadgeState({fate:10},{fate:10,currentFate:12}),'up','settled loss above base is green');
assert.equal(runtime.fateBadgeState({fate:10},{fate:10,currentFate:10}),'','settled loss at base uses normal color');
assert.equal(runtime.fateBadgeState({fate:10},{fate:10,currentFate:8}),'down','settled loss below base stays red');

vm.runInContext(core.slice(core.indexOf('function playResolvedFateChangeSfx('),core.indexOf('function playFateChangeSound(')),runtime);
const card={iid:'sound-card',owner:0};
blockedUntil=now+800;
runtime.playResolvedFateChangeSfx(card,18,25,0);
runtime.playResolvedFateChangeSfx(card,25,30,0);
assert.deepEqual(sounds,[],'generic gain stays silent during presentation');
assert.equal(timers.size,1,'blocked gains coalesce with the displayed change');
const flush=()=>{const callbacks=[...timers.values()];timers.clear();callbacks.forEach(fn=>fn());};
now+=824;blockedUntil=now+300;flush();
assert.deepEqual(sounds,[],'extended presentation keeps sound deferred');
now+=324;blockedUntil=0;flush();
assert.deepEqual(sounds,['fateGain'],'gain cue plays once when presentation releases');
blockedUntil=now+500;
runtime.playResolvedFateChangeSfx(card,30,35,0);
runtime.G={};now+=524;blockedUntil=0;flush();
assert.equal(sounds.length,1,'old match must not play deferred audio');
const recipes=fs.readFileSync('src/scripts/render-v2/13-vfx-recipes.js','utf8');
runtime.P=()=>({soundCue:options=>options});
vm.runInContext(recipes.slice(recipes.indexOf('  function fateGain('),recipes.indexOf('  function fateLoss(')),runtime);
assert.equal(runtime.fateGain({suppressMotionAudio:true}).length,0,'successful overlay owns the gain recipe audio');
assert.equal(runtime.fateGain({})[0].cue,'fate_gain','gain without overlay retains its sound');
console.log('Fate odometer and synchronized gain audio regression passed.');
