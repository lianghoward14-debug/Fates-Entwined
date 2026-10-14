const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
let now=1000,picker=true,cinematic=false;
const timers=[],shown=[],presentationOrder=[];
const context={window:{flashCardEffect:()=>{shown.push(now);presentationOrder.push('overlay-sound');},renderGame:()=>presentationOrder.push('render'),addEventListener:()=>{}},
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
  assert.deepEqual(presentationOrder.slice(-3),['render','overlay-sound','render'],'fish is rendered before its one overlay sound');
  await context.window.presentSebastianFishAfterResolution({iid:'sebastian'},'test',[fish.iid]);
  assert.equal(shown.length,1,'the same fish event cannot play its overlay sound twice');
  console.log('PASS: fish reveal waits for pickers, renders before its overlay, and plays one sound per event.');
})().catch(error=>{console.error(error);process.exitCode=1;});
