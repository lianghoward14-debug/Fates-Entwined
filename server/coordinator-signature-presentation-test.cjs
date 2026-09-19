const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/scripts/render-v2/19-signature-activation-fx.js','utf8');
const code=source.slice(source.indexOf('function playPlacement('),source.indexOf('window.FateSignatureActivationFx='));
let start=0,dispose=0,banner=0,removed=0,callback,disabled=false;
const sandbox={G:{},Date:{now:()=>1000},mount:()=>disabled?null:{start(){start++;},dispose(){dispose++;}},document:{hidden:false,documentElement:{classList:{contains:()=>false}},createElement:()=>({style:{},setAttribute(){},remove(){removed++;}}),body:{appendChild(){}},addEventListener(){},removeEventListener(){}},window:{FateActivationBanner:{play(){banner++;}}},setTimeout:fn=>callback=fn};
vm.createContext(sandbox);vm.runInContext(code,sandbox);
for(const owner of [0,1])for(const id of ['01','bh07','bh11','10','19','bh12','11','bh02','bh08','57','12','23','15','34','77']){assert.equal(sandbox.playCoordinator({id,owner}),true);assert.equal(sandbox.G._coordinatorSignatureUntil,3000);assert.equal(sandbox.G._postConsolidationFateFeedbackUntil,3000);callback();assert.equal(sandbox.G._coordinatorSignatureUntil,0);}
assert.equal(start,30);assert.equal(banner,30);assert.equal(dispose,30);assert.equal(removed,30);assert.equal(sandbox.playCoordinator({id:'bh15'}),false);disabled=true;assert.equal(sandbox.playCoordinator({id:'01'}),false);assert.equal(start,30);
const helpers=fs.readFileSync('src/scripts/06-rendering-and-helpers.js','utf8'),core=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');assert.ok(helpers.includes('playCoordinator(card,{sfx:opts.playSfx !== false})'));assert.ok(core.includes('Number(G._coordinatorSignatureUntil || 0) > Date.now()'));
disabled=false;
for(const owner of [0,1]){
  assert.equal(sandbox.playPlacement({id:'89',type:'Dauntless',owner}),true);
  assert.equal(sandbox.G._postConsolidationFateFeedbackUntil,3000);
  callback();
}
assert.equal(start,32);assert.equal(banner,32);assert.equal(dispose,32);
assert.equal(sandbox.playPlacement({id:'89',faceDown:true}),false);
assert.equal(sandbox.playPlacement({id:'84'}),false);
assert.ok(helpers.includes('playPlacement(card,{sfx:opts.playSfx !== false})'));
assert.ok(!core.includes("'88','41','89','55'"),'Youth tiara must not also run from the late placement callback');
console.log('PASS Coordinator and Zsofia Youth signatures for both owners, shared banner timing, two-second hold and cleanup.');
