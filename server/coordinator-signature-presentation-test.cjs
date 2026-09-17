const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/scripts/render-v2/19-signature-activation-fx.js','utf8');
const code=source.slice(source.indexOf('function playCoordinator('),source.indexOf('window.FateSignatureActivationFx='));
let start=0,dispose=0,banner=0,removed=0,callback,disabled=false;
const sandbox={G:{},Date:{now:()=>1000},mount:()=>disabled?null:{start(){start++;},dispose(){dispose++;}},document:{hidden:false,documentElement:{classList:{contains:()=>false}},createElement:()=>({style:{},setAttribute(){},remove(){removed++;}}),body:{appendChild(){}},addEventListener(){},removeEventListener(){}},window:{FateActivationBanner:{play(){banner++;}}},setTimeout:fn=>callback=fn};
vm.createContext(sandbox);vm.runInContext(code,sandbox);
for(const owner of [0,1])for(const id of ['01','bh07','bh11','10','19','bh12','11','bh02','bh08','57','12','23','15','34']){assert.equal(sandbox.playCoordinator({id,owner}),true);assert.equal(sandbox.G._coordinatorSignatureUntil,3000);assert.equal(sandbox.G._postConsolidationFateFeedbackUntil,3000);callback();assert.equal(sandbox.G._coordinatorSignatureUntil,0);}
assert.equal(start,28);assert.equal(banner,28);assert.equal(dispose,28);assert.equal(removed,28);assert.equal(sandbox.playCoordinator({id:'77'}),false);disabled=true;assert.equal(sandbox.playCoordinator({id:'01'}),false);assert.equal(start,28);
const helpers=fs.readFileSync('src/scripts/06-rendering-and-helpers.js','utf8'),core=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');assert.ok(helpers.includes('playCoordinator(card,{sfx:opts.playSfx !== false})'));assert.ok(core.includes('Number(G._coordinatorSignatureUntil || 0) > Date.now()'));
console.log('PASS fourteen Coordinator signatures, both owners, banner shared start, 2-second overlay hold, cleanup and disabled fallback.');
