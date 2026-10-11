const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/scripts/render-v2/04-match-renderer-adapter.js','utf8');
const frames=new Map(),timers=new Map(),paints=[];let id=0,active=true;
const ctx={requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:id=>timers.delete(id),ownsBoard:()=>true,
isActiveMatchScreen:()=>active,DIRTY_BOARD_CARDS:4,renderFromGameState:opts=>paints.push(opts),
enqueueRender:()=>{throw Error('Animation must never enter the deferred gameplay queue');}};
vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('  let fateOdometerRaf ='),source.indexOf('  // Only animation-only batches')),ctx);
ctx.scheduleFateOdometerFrame();ctx.scheduleFateOdometerFrame();assert.equal(frames.size,1);
[...frames.values()][0]();assert.equal(paints.length,1);assert.equal(timers.size,0);
assert.equal(paints[0].source,'fate-odometer');assert.equal(paints[0].dirtyMask,4);
ctx.scheduleFateOdometerFrame();[...timers.values()][0]();assert.equal(paints.length,2);assert.equal(frames.size,0);
active=false;ctx.scheduleFateOdometerFrame();[...frames.values()][0]();assert.equal(paints.length,2);
console.log('PASS independent Fate badge frames, coalescing isolation, watchdog and offscreen cleanup.');
