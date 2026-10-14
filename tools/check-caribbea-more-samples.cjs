const fs=require('fs'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const path='C:/Users/user/.codex/visualizations/2026/10/13/01a1375b-1f2f-74f2-baae-2db06e0d220c/caribbea-more-animation-samples.html';
 const fragment=fs.readFileSync(path,'utf8');assert(Buffer.byteLength(fragment)<1000000);
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
 const page=await browser.newPage({viewport:{width:1000,height:1200}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<style>body{background:#17191e;color:#eee;font:14px Arial}button{padding:8px}.viz-controls{display:flex;gap:15px;align-items:center}</style>'+fragment);
 await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));
 assert.equal(await page.locator('canvas').count(),9);
 const hashes=await page.evaluate(()=>{
  const art=window.FateCaribbeaActivationArt,c=document.createElement('canvas');c.width=390;c.height=290;
  return Object.keys(art.names).flatMap(id=>[0,1,2].map(v=>{const frames=[];for(const t of [.1,.3,.55,.75,.95]){art.draw(c.getContext('2d'),id,t,390,290,v);frames.push(c.toDataURL());}if(new Set(frames).size!==5)throw Error('Frozen animation '+id+':'+v);return frames[2];}));
 });assert.equal(new Set(hashes).size,9);
 await page.screenshot({path:'artifacts/caribbea-108-110/nine-more-samples.png',fullPage:true});
 for(const button of await page.locator('section button').all()){await button.click();assert.equal(await button.textContent(),'Replay');}
 await page.locator('[data-slow]').check();await page.locator('[data-play-all]').click();await page.waitForTimeout(550);
 await page.setViewportSize({width:320,height:900});await page.waitForTimeout(100);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 console.log('PASS: nine distinct moving samples, individual replay, play all, half speed, portraits, and 320px layout');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
