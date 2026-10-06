const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/scripts/render-v2/22-activation-banner.js','utf8');
let cinematic=false,overlay=false,created=0;
const nodes=[];
function element(){const el={style:{},classList:{add(){}},setAttribute(){},append(){},cloneNode:element,remove(){this.removed=true;}};nodes.push(el);return el;}
const context={window:{addEventListener(){},removeEventListener(){}},G:{matchId:'test'},
 document:{querySelector:()=>overlay?{}:null,documentElement:{classList:{contains:()=>false}},body:{classList:{contains:()=>false},appendChild(){}},getElementById:()=>null,createElement(){created++;return element();}},
 consolidationCinematicIsActive:()=>cinematic,localStorage:{getItem:()=>null},setTimeout:()=>1,clearTimeout(){}};
vm.createContext(context);vm.runInContext(source,context);
const api=context.window.FateActivationBanner,card={id:'15',iid:'ai-card',type:'Coordinator',owner:1};
api.play(card);assert.ok(created>0,'normal activation renders');
const count=created;cinematic=true;
assert.equal(api.play(card),null);assert.equal(created,count);assert.ok(nodes.find(n=>n.className==='fate-activation-film-cut').removed,'active banner is dismissed');
const confirm=api.pickerConfirmation({...card,iid:'picker'});confirm();assert.equal(created,count,'picker cannot bypass consolidation');
cinematic=false;overlay=true;assert.equal(api.play(card),null);assert.equal(created,count,'DOM overlay also blocks banner');
overlay=false;api.play(card);assert.ok(created>count,'banner works after cinematic');api.dismiss();
assert.ok(nodes.filter(n=>n.className==='fate-activation-film-cut').every(n=>n.removed));
const helpers=fs.readFileSync('src/scripts/06-rendering-and-helpers.js','utf8');
assert.match(helpers,/_consolidationCinematicShowing = true;\s*\/\/[^\n]+\s*window\.FateActivationBanner\?\.dismiss\(\)/,'consolidation clears existing banner before mounting');
console.log('Consolidation banner exclusion regression passed.');
