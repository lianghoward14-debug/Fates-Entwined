const {chromium}=require('playwright'),fs=require('fs'),assert=require('assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1200,height:850}});
 await page.setContent('<style>body{margin:0;background:#35485b}#board{display:none}#codex-board-v19{position:absolute;left:100px;top:100px;width:1000px;height:600px;background:#c6bd94}#fate-match-v2-canvas{width:100%;height:100%}</style><div id="board"></div><div id="codex-board-v19"><canvas id="fate-match-v2-canvas"></canvas></div>');
 await page.addStyleTag({content:fs.readFileSync('src/styles/zz-codex-last.css','utf8')});
 await page.evaluate(()=>{
  window.G={turn:4,_phase7Statuses:[{type:'SABOTEUR_FIELD_VEIL',playerIndex:0,untilTurn:6}]};
  window.getPerspectivePlayerIndex=()=>0;
  window.FateMatchRendererAdapter={ownsBoard:()=>true,getHitMap:()=>({cells:[0,1,2].map(r=>({z:0,r,c:0,rect:{x:0,y:r*200,w:1000,h:190}}))})};
 });
 await page.addScriptTag({content:fs.readFileSync('src/scripts/51-saboteur-clouds.js','utf8')});
 await page.waitForFunction(()=>{const c=document.getElementById('saboteur-cloud-overlay');return c&&c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>40);});
 const pixels=await page.evaluate(()=>{const c=document.getElementById('saboteur-cloud-overlay'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let enemy=0,own=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(d[(y*c.width+x)*4+3]){if(y<400)enemy++;else own++;}return {enemy,own,width:c.width,height:c.height,pointer:getComputedStyle(c).pointerEvents};});
 assert(pixels.enemy>10000);assert.equal(pixels.own,0);assert.equal(pixels.pointer,'none');assert.equal(pixels.width,1000);
 const rendering=fs.readFileSync('src/scripts/06-rendering-and-helpers.js','utf8');
 await page.addScriptTag({content:rendering.slice(rendering.indexOf('function showMerchantDrawSkippedBanner'),rendering.indexOf('function getMerchantStatusBanners'))});
 await page.evaluate(()=>showMerchantDrawSkippedBanner(1));assert.equal(await page.locator('#merchant-draw-skipped-banner').count(),0);
 await page.evaluate(()=>showMerchantDrawSkippedBanner(0));await page.locator('#merchant-draw-skipped-banner.on').waitFor({state:'visible'});
 assert.match(await page.locator('#merchant-draw-skipped-banner').innerText(),/Your Draw Phase draw was skipped by Art of the Deal/);
 await page.screenshot({path:'.tmp/merchant-mist-check.png'});
 await page.evaluate(()=>{document.getElementById('codex-board-v19').style.width='1800px';FateSaboteurClouds.sync();});
 assert.equal(await page.locator('#saboteur-cloud-overlay').evaluate(c=>c.width),1024,'large boards use capped mist backing resolution');
 await page.setContent('<div id="modal"><div class="modal"><div class="sangre-morale-picker"><div class="payment-portrait"></div><div class="payment-controls"><input id="sangre-pay-slider" type="range"><div class="sangre-stepper" style="display:grid"><button>−15</button><output>Draw</output><button id="sangre-pay-plus">+15</button></div></div></div></div></div>');
 for(const file of ['game.css','santiago-payment.css','zz-codex-last.css'])await page.addStyleTag({content:fs.readFileSync('src/styles/'+file,'utf8')});
 const alignment=await page.evaluate(()=>{const slider=document.getElementById('sangre-pay-slider').getBoundingClientRect(),plus=document.getElementById('sangre-pay-plus').getBoundingClientRect();return {width:slider.width,gap:Math.abs(slider.right-plus.right)};});
 assert(alignment.width>300);assert(alignment.gap<2,'slider reaches +15 edge');
 console.log('Headless browser: visible mist pixels on enemy/contested rows, none on own row; hidden legacy board ignored; draw-skipped banner visible only for affected viewer.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
