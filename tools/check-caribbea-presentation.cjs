const fs=require('fs'),assert=require('node:assert/strict'),vm=require('vm');
const {chromium}=require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path='C:/Users/user/.codex/visualizations/2026/10/13/01a1375b-1f2f-74f2-baae-2db06e0d220c/caribbea-animation-samples.html';
(async()=>{
 let fragment=fs.readFileSync(path,'utf8');
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 const preview=await browser.newPage({viewport:{width:192,height:148}});
 const portraits={};
 for(const id of ['108','109','110']){
  await preview.setContent('<style>body{margin:0}img{width:192px;height:148px}</style><img src="data:image/svg+xml;base64,'+fs.readFileSync('pfp/card-'+id+'-portrait.svg').toString('base64')+'">');
  await preview.waitForFunction(()=>document.images[0].complete&&document.images[0].naturalWidth);
  portraits[id]='data:image/jpeg;base64,'+(await preview.screenshot({type:'jpeg',quality:85})).toString('base64');
 }
 await preview.close();
 fragment=fragment.replace('/* CARIBBEA_ART */',()=>fs.readFileSync('src/scripts/render-v2/19-caribbea-activation-art.js','utf8')).replace('/* PORTRAITS */{}',()=>JSON.stringify(portraits));
 fragment=fragment.replace(/const portraits=.*;/,'const portraits='+JSON.stringify(portraits)+';');
 fs.writeFileSync(path,fragment);assert(Buffer.byteLength(fragment)<1000000);
 const ctx={window:{}};vm.runInNewContext(fs.readFileSync('src/scripts/53-caribbea-translations.js','utf8'),ctx);
 const catalog=require('../server/fate-card-catalog.js').getCardCatalog();
 for(const id of ['108','109','110']){const c=catalog.byId.get(id);for(const key of ['name','ability','effect','flavor']){assert(ctx.window.FateJapaneseCatalog[c[key]],id+' Japanese '+key);assert(ctx.window.FateChineseContent.some(r=>r[0]===c[key]),id+' Chinese '+key);}assert.equal(c.pfpId,Number(id)+25);}
 const page=await browser.newPage({viewport:{width:1000,height:1150}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<style>body{background:#17191e;color:#eee;font:14px Arial}button{padding:8px} .viz-controls{display:flex;gap:15px;align-items:center}</style>'+fragment);
 await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));
 assert.equal(await page.locator('canvas').count(),9);
 fs.mkdirSync('artifacts/caribbea-108-110',{recursive:true});
 await page.screenshot({path:'artifacts/caribbea-108-110/nine-samples.png',fullPage:true});
 for(const button of await page.locator('section button').all()){await button.click();await page.waitForTimeout(70);}
 await page.locator('[data-slow]').check();await page.locator('[data-play-all]').click();await page.waitForTimeout(600);
 assert.equal(await page.locator('section button').first().textContent(),'Replay');
 await page.setViewportSize({width:320,height:900});await page.waitForTimeout(100);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.addScriptTag({content:fs.readFileSync('src/scripts/render-v2/19-approved-activation-art.js','utf8')});
 await page.addScriptTag({content:fs.readFileSync('src/scripts/render-v2/19-signature-activation-fx.js','utf8')});
 await page.evaluate(()=>{
  for(const id of ['108','109','110']){
   if(!FateApprovedActivationArt.handles(id)||FateSignatureActivationFx.durationFor({id})!==2000)throw Error('Missing signature '+id);
   const overlay=document.createElement('div');overlay.style.cssText='width:700px;height:430px';document.body.append(overlay);
   const fx=FateSignatureActivationFx.mount(overlay,{id},{sfx:false});if(!fx)throw Error('Mount failed '+id);fx.start();fx.dispose();overlay.remove();
  }
  for(const [id,type] of [['109','Dauntless'],['110','Improvisor']])if(!FateSignatureActivationFx.playPlacement({id,type},{sfx:false}))throw Error('Post-cinematic routing failed '+id);
 });
 assert.deepEqual(errors,[]);await browser.close();
 console.log('PASS: nine animations, replay, half speed, 320px layout, portrait loading, and complete Japanese/Chinese card copy; '+Buffer.byteLength(fragment)+' bytes');
})().catch(e=>{console.error(e);process.exitCode=1});
