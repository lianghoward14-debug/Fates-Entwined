const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/scripts/06-rendering-and-helpers.js','utf8');
const code=source.slice(source.indexOf('function deferPickerUntilAnimationFinishes('),source.indexOf('function pickCardInZone('));
let now=1000,timers=[],opened=0,predecessor=0;
const sandbox={G:{_coordinatorSignatureUntil:3000},Date:{now:()=>now},getInteractionAnimationDelayMs:()=>0,effectActivationPredecessorRemaining:()=>predecessor,_effectActivationCinematicQueue:[],_effectActivationCinematicShowing:false,setTimeout:(fn,delay)=>timers.push({fn,delay})};
vm.createContext(sandbox);vm.runInContext(code,sandbox);
function open(){if(!sandbox.deferPickerUntilAnimationFinishes(open))opened++;}
open();assert.equal(opened,0);assert.equal(timers[0].delay,2000);
now=3000;sandbox.G._coordinatorSignatureUntil=4000;timers.shift().fn();assert.equal(opened,0,'a new animation extends the wait');
now=4000;timers.shift().fn();assert.equal(opened,1);assert.equal(sandbox.G._deferredCardPickers,0);
sandbox._effectActivationCinematicQueue.push({});open();assert.equal(opened,1);sandbox._effectActivationCinematicQueue=[];timers.shift().fn();assert.equal(opened,2);
predecessor=80;open();const old=sandbox.G;sandbox.G={};predecessor=0;timers.shift().fn();assert.equal(opened,2,'stale match cannot open a picker');assert.equal(old._deferredCardPickers,0);
for(const name of ['pickCardsVisual','showBoardTargetPicker','showZonePickerVisual','showAffiliationPickerVisual','showZonePicker']){
  const start=source.indexOf('function '+name+'(');
  assert.match(source.slice(start,start+430),/if\(deferPickerUntilAnimationFinishes/,name+' must gate even immediate pickers');
}
console.log('PASS picker timing: Coordinator signatures, extended animations, queued activations, stale matches, and all shared picker gates.');
