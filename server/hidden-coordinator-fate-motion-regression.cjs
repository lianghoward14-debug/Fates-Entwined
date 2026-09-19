'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const core=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');
const helpers=fs.readFileSync('src/scripts/06-rendering-and-helpers.js','utf8');
function fn(source,name){const start=source.indexOf('function '+name+'(');assert.ok(start>=0);return source.slice(start,source.indexOf('\n}',start)+2);}
for(const onlineRemote of [false,true]) for(const owner of [0,1]) for(const fallback of [false,true]){
  const target={iid:'target',owner,currentFate:4},source={iid:'source',owner,type:'Coordinator',faceDown:true};
  const timers=[],motions=[],overlays=[];
  const context={window:{},G:{},pairedOverlayFateQueues:new Map(),bh15OverlayQueues:new Map(),bh19OverlayQueues:new Map(),
    findBoardCardByIid:()=>source,resolveSequentialFateDisplayTarget:()=>target,
    beginSequentialFateDisplay(){},advanceSequentialFateDisplay(){},finishSequentialFateDisplay(){},
    effectChoicePresentationUiOpen:()=>false,getBoardCardPosition:()=>({z:0,r:0,c:0}),
    flashCardEffect:()=>{overlays.push(1);return true;},
    setTimeout:callback=>{timers.push(callback);},
  };
  context.window.FateV2CardMotionFx={fateChange:(card,z,r,c,before,after)=>{if(fallback)return false;motions.push([before,after]);return true;}};
  context.window.FateMatchRendererAdapter={presentFateDelta:p=>{motions.push([p.fromValue,p.toValue]);return true;}};
  vm.createContext(context);
  vm.runInContext(fn(core,'queuePairedOverlayFateGain')+'\n'+fn(helpers,'getAuthoritativeEffectOverlayDescriptor'),context);
  assert.equal(context.getAuthoritativeEffectOverlayDescriptor({type:'FATE_CHANGED',sourceIid:'source',semanticSourceCardId:'19'},source,target),null);
  assert.equal(context.queuePairedOverlayFateGain(target,{kind:'coord_kvetka_bloom',sourceIid:'source',before:4,after:7,onlineRemote}),true);
  for(let i=0;timers.length&&i<10;i++)timers.shift()();
  assert.equal(overlays.length,0,'concealed source must not show its overlay');
  assert.deepEqual(motions,[[4,7]],'gain must play once even without overlay or primary VFX');
}
const recipeContext={window:{innerWidth:1280,innerHeight:720}};
vm.createContext(recipeContext);
for(const file of ['12-vfx-primitives.js','13-vfx-recipes.js'])vm.runInContext(fs.readFileSync('src/scripts/render-v2/'+file,'utf8'),recipeContext);
const payload={fromRect:{x:10,y:10,w:70,h:98},toRect:{x:500,y:500,w:70,h:98}};
const draw=recipeContext.window.FateVfxRecipes.expand('DRAW_CARD',payload);
const search=recipeContext.window.FateVfxRecipes.expand('SEARCH_TO_HAND',payload);
assert.ok(draw.every(p=>p.flipStart===undefined));
assert.ok(search.some(p=>p.flipStart===180));
assert.ok(draw.some(p=>p.cue==='draw_card'));
assert.ok(search.some(p=>p.cue==='search_found'));
console.log('PASS: hidden Coordinator gain survives suppressed overlay in local/online queues, both owners and VFX fallback; draw/search recipes remain distinct.');
