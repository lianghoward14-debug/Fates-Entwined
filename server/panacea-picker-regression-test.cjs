const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');
let picker;
const runtime = {
  pressureCardReworkTimingActive:()=>false,
  recalcCoordinatorEffects(){},toast(){},renderEffectResolutionForPlayer(){},
  isTriggeredFateCoordinator:c=>['15','bh02','bh08'].includes(c.id),
  pickCardInZone:(z,title,choose,filter,cancel,source)=>{picker={z,title,choose,filter,cancel,source};return true;},
  modifyFate:(c,n)=>{c.currentFate+=n;}
};
vm.createContext(runtime);
vm.runInContext(core.slice(core.indexOf('function resolvePanaceaMilitia('),core.indexOf('function recalcCoordinatorEffects(')),runtime);
(async()=>{
  for(const id of ['15','bh02','bh08']) {
    const card={id:'bh23',iid:'militia',owner:0,currentFate:1};
    let settled=false;
    const task=runtime._executeWhenSetSwitch(card,0,2,1,0,1,'bh23').then(()=>{settled=true;});
    assert(picker,'when-set route opens coordinator picker');
    await Promise.resolve();assert.equal(settled,false,'resolution waits for the choice');
    const target={id,iid:'target',owner:0,_triggeredFateHistoryTotal:7};
    assert(picker.filter(target));
    assert(!picker.filter({...target,owner:1}));
    assert(!picker.filter({...target,faceDown:true}));
    picker.choose(target);await task;
    assert.equal(card.currentFate,8);
    assert.equal(card._bh23InheritedCoordinatorIid,'target');
  }
  runtime.pickCardInZone=()=>false;
  await runtime.resolvePanaceaMilitia({id:'bh23'},0,0);
  console.log('Panacea local when-set picker, awaited choice, eligibility and inheritance passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
