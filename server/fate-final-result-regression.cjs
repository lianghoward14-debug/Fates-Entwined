const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/scripts/render-v2/04-match-renderer-adapter.js','utf8');
function extract(name){const start=source.indexOf('  function '+name+'(');return source.slice(start,source.indexOf('\n  }',start)+4);}
let now=0,id=0;const timers=new Map(),shown=[];
const context={window:{},Date:{now:()=>now},deferredFateNumbersByKey:new Map(),setTimeout(fn,ms){timers.set(++id,{fn,at:now+ms});return id;},clearTimeout(id){timers.delete(id);},presentFateDelta(p){if(p.delta)shown.push(p);}};
vm.createContext(context);vm.runInContext(extract('fateNumberPresentationKey')+'\n'+extract('deferFateNumberUntilPresentationEnds'),context);
function tick(end){while(true){const entry=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!entry||entry[1].at>end)break;timers.delete(entry[0]);now=entry[1].at;entry[1].fn();}now=end;}
function queue(p){context.deferFateNumberUntilPresentationEnds(p,now+80);}
queue({iid:'a',before:1,after:5,delta:4});queue({iid:'a',fromValue:5,toValue:9,delta:4});tick(200);
assert.equal(shown.length,1);assert.equal(shown[0].delta,8);assert.equal(shown[0].fromValue,1);
queue({iid:'a',before:9,after:4,delta:-5});queue({iid:'a',before:4,after:6,delta:2});tick(400);assert.equal(shown[1].delta,-3);
queue({iid:'a',before:6,after:10,delta:4});queue({iid:'a',before:10,after:6,delta:-4});tick(600);assert.equal(shown.length,2);
const card={_flipResolutionPromise:{}};queue({iid:'a',card,before:6,after:8,delta:2});tick(900);assert.equal(shown.length,2);delete card._flipResolutionPromise;tick(1100);assert.equal(shown.length,3);
queue({iid:'a',before:8,after:9,delta:1});queue({iid:'b',before:2,after:5,delta:3});tick(1300);assert.equal(shown.length,5);
console.log('PASS: stacked gains, mixed gain/loss, zero net, flip wait, separate cards and later changes.');
// Reuse the flip presentation harness without its unrelated HTML cache rewrite.
let paired=fs.readFileSync('server/revolutionary-presentation-wait-regression.cjs','utf8').split('let html=')[0];
paired=paired.replace("tick(1000);", "context.queuePairedOverlayFateGain(target,{kind:'revolutionary_spirit',before:5,after:9});\ntick(1000);");
paired=paired.replace('assert.equal(numbers[0][1],5)','assert.equal(numbers[0][1],9)');
vm.runInNewContext(paired,{require,console});
