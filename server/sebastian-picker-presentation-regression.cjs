const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
let now=1000,picker=true,cinematic=false;
const timers=[],shown=[];
const context={window:{flashCardEffect:()=>shown.push(now),renderGame:()=>{},addEventListener:()=>{}},
  Date:{now:()=>now},document:{querySelector:()=>cinematic},
  effectChoicePresentationUiOpen:()=>picker,getChoicePresentationDelayMs:()=>0,
  setTimeout:(fn,ms)=>timers.push({fn,at:now+ms})};
vm.createContext(context);
vm.runInContext(fs.readFileSync('src/scripts/28-don-julio-dice.js','utf8'),context);
async function tick(until){
  while(true){
    await Promise.resolve();
    timers.sort((a,b)=>a.at-b.at);
    if(!timers.length || timers[0].at>until)break;
    const timer=timers.shift();now=timer.at;timer.fn();
  }
  now=until;await Promise.resolve();
}
(async()=>{
  const fish={iid:'fish-1'};
  const reveal=context.window.presentSebastianFishAfterResolution({iid:'sebastian'},'test',[fish.iid]);
  await tick(2000);
  assert.equal(context.window.isSebastianFishHidden(fish),true);
  assert.equal(shown.length,0);
  picker=false;await tick(2100);picker=true;await tick(3000);
  assert.equal(shown.length,0,'second picker restarts settling period');
  picker=false;cinematic=true;await tick(3500);
  assert.equal(context.window.isSebastianFishHidden(fish),true);
  cinematic=false;await tick(3800);await reveal;
  assert.equal(shown.length,1);
  assert.equal(context.window.isSebastianFishHidden(fish),false);
  console.log('PASS: fish overlay and hand arrival wait for chained pickers and cinematics.');
})().catch(error=>{console.error(error);process.exitCode=1;});
