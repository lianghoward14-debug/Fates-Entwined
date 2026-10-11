const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/scripts/06-rendering-and-helpers.js','utf8');
const start=source.indexOf('function getChoicePresentationDelayMs('),end=source.indexOf('function deferPickerUntilAnimationFinishes(',start);
let now=1000,banner=false,predecessor=0,interaction=0,gap=0,queue=[],opened=0;
const ctx={G:{},window:{FateActivationBanner:{isActive:()=>banner}},Date:{now:()=>now},setTimeout:(fn,ms)=>queue.push({fn,at:now+ms}),getInteractionAnimationDelayMs:()=>interaction,effectActivationPredecessorRemaining:()=>predecessor,effectActivationConsolidationGapRemaining:()=>gap,_effectActivationCinematicQueue:[],_effectActivationCinematicShowing:false};
vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
async function advance(ms){const end=now+ms;while(queue.some(x=>x.at<=end)){queue.sort((a,b)=>a.at-b.at);const task=queue.shift();now=task.at;task.fn();for(let i=0;i<8;i++)await Promise.resolve();}now=end;for(let i=0;i<8;i++)await Promise.resolve();}
(async()=>{
 predecessor=80;ctx.waitForSupportCompanyPresentation().then(ok=>{if(ok)opened++;});
 await advance(500);assert.equal(opened,0,'consolidation must finish');
 predecessor=0;ctx._effectActivationCinematicQueue.push({});await advance(200);assert.equal(opened,0,'queued effect must drain');
 ctx._effectActivationCinematicQueue=[];banner=true;await advance(500);assert.equal(opened,0,'banner must finish');
 banner=false;interaction=80;await advance(300);assert.equal(opened,0,'companion motion must finish');
 interaction=0;await advance(240);assert.equal(opened,1,'opens after complete quiet handoff');
 let current=true;banner=true;const pending=ctx.waitForSupportCompanyPresentation(()=>current);current=false;await advance(80);assert.equal(await pending,false,'stale flow cancelled');
 // Reproduce the actual online/local authority handoff after the consolidation
 // DOM has gone away but its banner/signature is still alive.
 const online=fs.readFileSync('src/scripts/18-online-rooms.js','utf8');
 const begin=online.indexOf('  async function phase7WaitForPresentationIdle(');
 const finish=online.indexOf('  function phase7DiscardPresentationCard',begin);
 ctx.phase7FastPresentationMode=()=>false;ctx.gameState=()=>ctx.G;
 ctx.document={querySelector:()=>null};ctx.phase7NextFrame=async()=>{};
 vm.runInContext(online.slice(begin,finish),ctx);
 banner=true;let advanced=false;
 ctx.phase7WaitForPresentationIdle({timeoutMs:500}).then(()=>advanced=true);
 await advance(1000);assert.equal(advanced,false,'authority handoff cannot interrupt banner even after old timeout');
 banner=false;ctx.G._coordinatorSignatureUntil=now+400;
 await advance(300);assert.equal(advanced,false,'post-consolidation signature finishes before next effect');
 await advance(400);assert.equal(advanced,true,'authority flow resumes after signature and banner');
 const royal=fs.readFileSync('src/scripts/support-company-royal-seal.mjs','utf8').replace('export function pickRoyalSeal','function pickRoyalSeal');
 const royalContext={G:{},window:{getSupportCompanyPresentationDelayMs:()=>80,waitForSupportCompanyPresentation:async current=>{await Promise.resolve();return current();}},closeModal:()=>{throw Error('must not close modal before presentation ends');}};
 vm.createContext(royalContext);vm.runInContext(royal,royalContext);
 const cancel=royalContext.pickRoyalSeal([],{},()=>{});cancel();await Promise.resolve();await Promise.resolve();
 assert.equal(typeof cancel,'function','deferred picker remains cancellable');
 console.log('PASS shared Call to Arms gate: consolidation, queued effect, banner, animation, quiet handoff, cancellation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
