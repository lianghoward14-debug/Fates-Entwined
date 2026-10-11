const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const core=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');
const start=core.indexOf('async function triggerWhenSet('),end=core.indexOf('\nasync function resolveWhenSetEffect(',start);
(async()=>{
 for(const outer of [false,true]){
  const order=[];let finish;
  const card={_onlineSetResolutionInFlight:outer};
  const box={G:{players:[]},beginHiddenEffectPresentation:()=>()=>order.push('presentation-finished'),resolveWhenSetEffect:async()=>{order.push('arriving-effect-start');await new Promise(resolve=>finish=resolve);order.push('arriving-effect-end');},resolveJorgeConsolidationArrival:async()=>order.push('call-to-arms')};
  vm.createContext(box);vm.runInContext(core.slice(start,end),box);
  const pending=box.triggerWhenSet(card,0,0,0);
  await Promise.resolve();assert.deepEqual(order,['arriving-effect-start'],'Jorge must not open before arriving effect');
  finish();await pending;
  assert.deepEqual(order,outer?['arriving-effect-start','arriving-effect-end','presentation-finished']:['arriving-effect-start','arriving-effect-end','presentation-finished','call-to-arms']);
 }
 console.log('PASS actual placement effect wrapper: pending effect completes before Jorge; outer placement owns one call.');
})().catch(error=>{console.error(error);process.exitCode=1;});
