const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/scripts/render-v2/04-match-renderer-adapter.js', 'utf8');
const extract = name => source.match(new RegExp(`function ${name}\\([^]*?\\n  \\}`))[0];
const flags = Object.fromEntries([...source.matchAll(/const (DIRTY_\w+) = 1 << (\d+);/g)].map(m => [m[1], 1 << Number(m[2])]));
const calls = {scene:0, vfx:0};
const snapshot = {}, layout = {};
const context = {
  ...flags, DIRTY_ALL:65535, DIRTY_VFX_ONLY:flags.DIRTY_EFFECTS | flags.DIRTY_PARTICLES,
  lastReport:{available:true}, lastLayout:layout, lastSnapshot:snapshot,
  lastCanvasMetrics:{cssW:1280, cssH:720, dpr:2},
  ctx:{setTransform(){}, clearRect(){}}, layers:{}, lastHitMap:{handCards:['preserved']},
  drawScene(ctx, l, s){
    assert.equal(l, layout); assert.equal(s, snapshot); calls.scene++;
    return {cards:3, zones:1, hitMap:{cards:[], cells:[]}};
  },
  drawVfxLayers(){calls.vfx++;}, refreshHoverHitFromHitMap(){}, drawHoverOverlay(){},
  renderCounters:new Proxy({}, {get:(o,k)=>o[k] || 0}), drawCount:0,
  nowMs:()=>1, started:0, recordFrameMs(){}, layerIds:[], totalLayerPixelArea:()=>0,
  roundMs:x=>x, averageFrameMs:()=>1, maxFrameMs:()=>1,
  averageRafGapMs:()=>1, maxRafGapMs:()=>1, rafGapSamples:[], rafLongIdleGaps:0
};
vm.createContext(context);
vm.runInContext(extract('dirtyMaskForSource') + '\n' + extract('isCardOverlayPulseSource'), context);
const start = source.indexOf('    const sourceText = sourceLower;');
const end = source.indexOf('    const snapshot = options && options.snapshot', start);
vm.runInContext(`function frame(source, dirtyMask){const sourceLower=source.toLowerCase();${source.slice(start,end)}return 'rebuild';}`, context);
for(const name of ['low-morale-supporter-pulse', 'high-t-beat']) {
  assert.equal(context.dirtyMaskForSource(name), flags.DIRTY_BOARD_CARDS);
  for(let i=0;i<100;i++) assert.notEqual(context.frame(name, flags.DIRTY_BOARD_CARDS), 'rebuild');
}
assert.equal(calls.scene, 200);
assert.equal(calls.vfx, 0, 'persistent pulses must leave VFX layers alone');
assert.deepEqual(context.lastHitMap.handCards, ['preserved']);
assert.notEqual(context.frame('high-t-beat+low-morale-supporter-pulse', flags.DIRTY_BOARD_CARDS), 'rebuild');
assert.equal(context.frame('low-morale-supporter-pulse+board-commit', flags.DIRTY_BOARD_CARDS), 'rebuild');
assert.equal(context.frame('high-t-beat+resize', 65535), 'rebuild');
context.lastReport = null;
assert.equal(context.frame('low-morale-supporter-pulse', flags.DIRTY_BOARD_CARDS), 'rebuild');
console.log('PASS: 200 pulse frames reuse layout/state, preserve hand and VFX, and gameplay/resize/initial frames rebuild.');
