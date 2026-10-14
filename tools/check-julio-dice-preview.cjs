const fs=require('fs'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const b=await chromium.launch({headless:true,channel:'msedge'});try{
 const p=await b.newPage({viewport:{width:1000,height:650}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 const dir='C:/Users/user/.codex/visualizations/2026/10/13/01a1375b-1f2f-74f2-baae-2db06e0d220c/';
 for(const [file,count] of [['julio-dice-samples',3],['caribbea-approved-sound',2]]){
  await p.setContent('<style>body{background:#17191e;color:#eee;font:14px Arial}button{padding:9px}.viz-controls{display:flex;gap:16px}</style>'+fs.readFileSync(dir+file+'.html','utf8'));
  await p.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));assert.equal(await p.locator('canvas').count(),count);
  for(const btn of await p.locator('section button').all()){await btn.click();assert.equal(await btn.textContent(),'Replay');}
  await p.locator('[data-slow]').check();await p.locator('[data-play-all]').click();await p.waitForTimeout(800);
  await p.screenshot({path:'artifacts/caribbea-108-110/'+file+'.png',fullPage:true});
  const audio=await p.evaluate(async()=>{
   const results=[];
   for(const key of ['108','110','dice-0','dice-1','dice-2']){
    const ac=new OfflineAudioContext(1,48000*3,48000);FateCaribbeaActivationSfx.schedule(ac,ac.destination,key,.6);
    const data=(await ac.startRendering()).getChannelData(0);let peak=0,energy=0;for(const v of data){peak=Math.max(peak,Math.abs(v));energy+=v*v;}
    results.push({key,peak,energy});
   }return results;
  });for(const x of audio){assert(x.peak>0&&x.peak<1);assert(x.energy>.01);}
  await p.setViewportSize({width:320,height:900});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.setViewportSize({width:1000,height:650});
 }
 assert.deepEqual(errors,[]);console.log('PASS: five animated previews, replay, half speed, mobile layout, all five soundtracks render with signal and no clipping');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});

