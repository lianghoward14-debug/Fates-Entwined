const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('src/scripts/render-v2/11-vfx-director.js','utf8');
const start=source.indexOf('  function draw(options)'),end=source.indexOf('\n  function ',start+20);
assert(start>=0&&end>start);
const draws=[],transforms=[];
const context=name=>({name,save(){},restore(){},translate(x,y){transforms.push([name,x,y]);},scale(){}});
const ctx=vm.createContext({window:{},nowMs:()=>0,animationsOff:()=>false,tick(){},
  activePrimitives:[{kind:'cardMove',fracture:true,recipeType:'HAND_DISCARD',layer:'effects'}],
  activeScreenShakeOffset:()=>({x:0,y:0}),drawPrimitive:(c,p)=>draws.push(c.name),drawDragPreview(){},
  draws:0,lastVfxMs:0,maxVfxMs:0,vfxMsSamples:[],hasActiveEffects:()=>false,clearVfxWakeTimer(){},report:()=>({})});
vm.runInContext(source.slice(start,end),ctx);
ctx.draw({effectsCtx:context('board'),topEffectsCtx:context('fullscreen'),boardViewport:{x:10,y:20,sx:1,sy:1}});
assert.deepEqual(draws,['fullscreen'],'hand fragments are drawn once, outside the clipped board surface');
assert(transforms.some(([name,x,y])=>name==='fullscreen'&&x===10&&y===20),'board coordinates are translated into viewport coordinates');
console.log('Full-screen hand discard layer regression passed');
