const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('src/scripts/06-rendering-and-helpers.js','utf8');
const start=source.indexOf('function showAffiliationPickerVisual(');
const code=source.slice(start,source.indexOf('function showZonePickerVisual(',start));
for(const fail of [false,true]){
  const choices=['reality','third_great_war','expanded_worlds','eventide'].map(aff=>({dataset:{aff}}));
  let opened=false,chosen,reset=false;
  const body={style:{},querySelectorAll:()=>choices};
  const modal={style:{},classList:{add(){}}};
  const nodes={'modal-body':body,'modal-title':{},'modal-acts':{},modal:{classList:{add(){opened=true}}}};
  const context={window:{applyDeclarationPickerDesign(){if(fail)throw Error('presentation');}},console:{warn(){}},
    document:{getElementById:id=>nodes[id],querySelector:()=>modal},deferPickerUntilAnimationFinishes:()=>false,
    resetModalChrome(){reset=true},closeModal(){},localPickerSource(){throw Error('Must not inspect effect session');}};
  vm.runInNewContext(code,context);
  context.showAffiliationPickerVisual(value=>chosen=value);
  assert.ok(opened);assert.ok(reset);
  choices[2].onclick();assert.equal(chosen,'expanded_worlds');
  opened=false;
  context.deferPickerUntilAnimationFinishes=()=>true;
  context.getInteractionAnimationDelayMs=()=>0;
  context.showAffiliationPickerVisual(value=>chosen=value,{id:'66'});
  assert.ok(opened,'Mark must open when only queued presentation remains');
  choices[0].onclick();assert.equal(chosen,'reality');
  opened=false;
  let retry;
  context.getInteractionAnimationDelayMs=()=>100;
  context.setTimeout=fn=>{retry=fn;};
  context.showAffiliationPickerVisual(()=>{},{id:'66'});
  assert.equal(opened,false,'Mark must still wait for active animation');
  context.getInteractionAnimationDelayMs=()=>0;
  retry();assert.ok(opened);
}
console.log('Affiliation picker opens and selects, including when presentation fails.');
