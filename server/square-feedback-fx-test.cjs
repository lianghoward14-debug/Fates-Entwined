const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let now=0,reduced=false,callback=null,renders=0;
const classes={contains:()=>false};const window={matchMedia:()=>({matches:reduced}),FateMatchRendererAdapter:{scheduleRender(){renders++}}};
vm.runInNewContext(fs.readFileSync('src/scripts/render-v2/20-square-feedback-fx.js','utf8'),{window,document:{documentElement:{classList:classes},body:{classList:classes}},localStorage:{getItem:()=>null},performance:{now:()=>now},requestAnimationFrame:fn=>(callback=fn,1)});
const fx=window.FateSquareFeedbackFx,entry={z:0,r:2,c:1,card:{iid:'a'}},rect={x:20,y:30,w:90,h:120};
assert.equal(fx.playSet(entry,entry.card),true);assert.equal(fx.pose(entry,rect).y,-96);assert.equal(fx.pose({...entry,card:{iid:'b'}},rect),null);
now=272;assert.ok(Math.abs(fx.pose(entry,rect).y)<1e-8);let saves=0,segments=0;const ctx=new Proxy({save(){saves++},restore(){saves--},lineTo(){segments++},createRadialGradient(){return{addColorStop(){}}}},{get:(o,k)=>o[k]||(()=>{})});
fx.drawSet(ctx,entry,rect);assert.equal(saves,0);assert.equal(segments,24);fx.playClick(entry);fx.drawClick(ctx,entry,rect);assert.equal(saves,0);
now=900;assert.equal(fx.pose(entry,rect),null);callback();assert.ok(renders>0);reduced=true;assert.equal(fx.playSet(entry,entry.card),false);assert.equal(fx.playClick(entry),false);console.log('PASS target-only origin, impact timing, stale card guard, balanced canvas state, expiration, reduced motion.');

// Repeated impact frames reuse their gradient; changed geometry gets a fresh one.
reduced=false;now=1000;fx.playSet(entry,entry.card);now=1400;let gradients=0;
const cachedCtx=new Proxy({createRadialGradient(){gradients++;return{addColorStop(){}}}},{get:(o,k)=>o[k]||(()=>{})});
fx.drawSet(cachedCtx,entry,rect);fx.drawSet(cachedCtx,entry,rect);assert.equal(gradients,1);
fx.drawSet(cachedCtx,entry,{...rect,x:rect.x+10});assert.equal(gradients,2);
const adapter=fs.readFileSync('src/scripts/render-v2/04-match-renderer-adapter.js','utf8');
const maskFunction=adapter.match(/function dirtyMaskForSource\(source\)\{[\s\S]*?\n  \}/)[0];
const flags=Object.fromEntries([...adapter.matchAll(/const (DIRTY_\w+) = 1 << (\d+);/g)].map(m=>[m[1],1<<Number(m[2])]));
const maskContext={...flags,DIRTY_ALL:65535};vm.runInNewContext(maskFunction,maskContext);
assert.equal(maskContext.dirtyMaskForSource('square-feedback'),flags.DIRTY_BOARD_CARDS);
console.log('PASS gradient reuse, geometry invalidation, board-only effect frame routing.');

now=2000;fx.playSet(entry,entry.card,'hammer-lock');
assert.equal(fx.pose(entry,rect).y,-110);
now=2000+fx.hammerDuration*.27;assert.ok(Math.abs(fx.pose(entry,rect).y)<1e-8);
fx.drawSet(ctx,entry,rect);assert.equal(saves,0);
now=2000+fx.hammerDuration;assert.equal(fx.pose(entry,rect),null);
const presenter=fs.readFileSync('src/scripts/render-v2/17-action-presentation.js','utf8');
const calls=[],routing={window:{FateSquareFeedbackFx:{playSet:(...args)=>calls.push(args)}}};
vm.runInNewContext(presenter.match(/function beginSetCard\(options\)\{[\s\S]*?\n  \}/)[0],routing);
let committed=false;
routing.beginSetCard({inst:entry.card,target:entry,freeCharacterSet:true,commit(){committed=true}});
assert.equal(committed,true);assert.equal(calls[0][2],'hammer-lock');
routing.beginSetCard({inst:entry.card,target:entry,commit(){}});assert.equal(calls[1][2],undefined);
console.log('PASS Hammer Lock origin, impact, duration, balanced drawing and free-set-only routing.');
