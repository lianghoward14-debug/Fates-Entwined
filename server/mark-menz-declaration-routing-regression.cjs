const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');
const routeStart=source.indexOf("    case '02':",source.indexOf('// Initiators',source.indexOf('async function triggerCharacterEffect')));
assert.ok(routeStart>=0);
const route=source.slice(routeStart,source.indexOf("    case '103':",routeStart));
const start=source.indexOf("    case '66': { // Mark Menz");
const branch=source.slice(start,source.indexOf("    case '68':",start));
(async()=>{
  const card={id:'66',iid:'mark',owner:0,aff:'reality'};
  const ally={owner:0,aff:'eventide'},enemy={owner:1,aff:'eventide'};
  let choose,bonus=0,routed=false,opened=false;
  const buttons=['reality','third_great_war','expanded_worlds','eventide'].map(aff=>({dataset:{aff}}));
  const body={style:{},querySelectorAll:()=>buttons};
  const nodes={'modal-body':body,'modal-title':{},'modal-acts':{},modal:{classList:{add(){opened=true;}}}};
  const ctx={card,inst:card,z:0,r:0,c:0,cp:0,opp:1,id:'66',G:{board:[[[card,ally,enemy]]],turn:1},
    showAffiliationPickerVisual(fn,sourceCard){assert.equal(sourceCard,card);choose=fn;},
    modifyFate(target,value){assert.equal(target,card);bonus+=value;},toast(){},log(){},AFF_LABEL:{},
    markInitialEffectResolved(){},renderEffectResolutionForPlayer(){},requestAnimationFrame(fn){fn();}};
  ctx._executeWhenSetSwitch=async()=>{routed=true;vm.runInNewContext('switch(id){'+branch+'}',ctx);};
  const rendering=fs.readFileSync('src/scripts/06-rendering-and-helpers.js','utf8');
  const pickerStart=rendering.indexOf('function showAffiliationPickerVisual(');
  Object.assign(ctx,{window:{},document:{getElementById:id=>nodes[id],querySelector:()=>({style:{},classList:{add(){}}})},
    deferPickerUntilAnimationFinishes:()=>true,getInteractionAnimationDelayMs:()=>0,resetModalChrome(){},closeModal(){opened=false;}});
  vm.runInNewContext(rendering.slice(pickerStart,rendering.indexOf('function showZonePickerVisual(',pickerStart)),ctx);
  await vm.runInNewContext('(async()=>{switch(id){'+route+'}})()',ctx);
  assert.ok(routed);assert.ok(opened,'Real affiliation picker must open');
  assert.equal(typeof buttons[1].onclick,'function');
  buttons[1].onclick();assert.equal(opened,false,'Selection closes picker');
  assert.equal(card.aff,'third_great_war');assert.equal(ally.aff,'third_great_war');assert.equal(enemy.aff,'eventide');
  assert.equal(bonus,2);assert.equal(card.effectUsedInitial,true);
  console.log('Mark Initiator routes to declaration; choice changes allies only and awards Fate.');
})().catch(error=>{console.error(error);process.exitCode=1;});
