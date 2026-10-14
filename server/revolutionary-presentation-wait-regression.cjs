const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');
const start=source.indexOf('function queuePairedOverlayFateGain('),end=source.indexOf('\n}',start)+2;
let now=0,busy=0,consolidating=false,morale=false;const timers=[],shown=[],numbers=[];
const target={iid:'flip',currentFate:5,_flipResolutionPromise:{}};
const context={window:{},Date:{now:()=>now},setTimeout:(fn,ms)=>timers.push({fn,at:now+ms}),pairedOverlayFateQueues:new Map(),bh15OverlayQueues:new Map(),bh19OverlayQueues:new Map(),
 resolveSequentialFateDisplayTarget:()=>target,beginSequentialFateDisplay:()=>{},finishSequentialFateDisplay:()=>{},advanceSequentialFateDisplay:(c,n)=>numbers.push([now,n]),
 consolidationOverlayGateIsActive:()=>false,consolidationCinematicIsActive:()=>consolidating,getChoicePresentationDelayMs:()=>busy,effectChoicePresentationUiOpen:()=>false,
 flashCardEffect:(c,kind)=>{shown.push([now,kind]);return true;}};
context.window.isMoraleCalculationPresentationActive=()=>morale;vm.createContext(context);vm.runInContext(source.slice(start,end),context);
function tick(until){while(true){timers.sort((a,b)=>a.at-b.at);if(!timers.length||timers[0].at>until)break;const item=timers.shift();now=item.at;item.fn();}now=until;}
context.queuePairedOverlayFateGain(target,{kind:'revolutionary_spirit',before:1,after:5});
tick(1000);assert.equal(shown.length,0,'wait for scheduled flip cinematic');
consolidating=true;delete target._flipResolutionPromise;tick(4000);assert.equal(shown.length,0);
consolidating=false;busy=80;tick(6000);assert.equal(shown.length,0,'follow-up activation queue');
busy=0;morale=true;tick(7500);assert.equal(shown.length,0,'follow-up morale animation');
morale=false;tick(7600);assert.equal(shown.length,0,'quiet handoff gap');
busy=80;tick(8000);assert.equal(shown.length,0,'new animation restarts quiet interval');
busy=0;tick(8400);assert.equal(shown.length,1);assert.equal(numbers.length,1);assert.equal(shown[0][0],numbers[0][0],'flame and Fate start in the same task');assert.equal(numbers[0][1],5);
console.log('PASS: delayed flip cinematic, follow-up queue, morale and renewed animations all finish before paired flame/+4 Fate.');
let html=fs.readFileSync('index.html','utf8');for(const name of ['05-gameplay-core.js','authoritative-v3-single-player-screen.mjs'])html=html.replace(new RegExp('('+name.replaceAll('.','\\.')+'\\?v=)[^"\\s]+','g'),'$120261014-revolution-after-flip');fs.writeFileSync('index.html',html);
