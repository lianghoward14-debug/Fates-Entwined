const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync('src/scripts/06-rendering-and-helpers.js','utf8');
const start=source.indexOf('window.showFaceDownPlacementChoice=function');
const end=source.indexOf('\n};',start)+4;
for(const type of ['Supporter','Coordinator']){
  let prompts=[],placed=null;
  const context={window:{},showFaceDownEffectChoice:(card,up,down,options)=>prompts.push({up,down,options})};
  vm.runInNewContext(source.slice(start,end),context);
  const open=()=>context.window.showFaceDownPlacementChoice({type},choices=>placed={faceDown:false,...choices},choices=>placed={faceDown:true,...choices});
  open();prompts[0].up();
  assert.equal(prompts.length,1);assert.equal(placed.faceDown,false);assert.equal(placed.contributesFate,true);
  prompts=[];placed=null;open();prompts[0].down();
  assert.equal(prompts[1].options.title,'Contribute Fate?');prompts[1].down();
  if(type==='Coordinator'){assert.equal(prompts[2].options.title,'Contribute Zone Auras?');prompts[2].up();}
  assert.equal(placed.faceDown,true);assert.equal(placed.contributesFate,false);
}
console.log('Face-up placement skips contribution prompts; face-down Fate and aura choices preserved.');
