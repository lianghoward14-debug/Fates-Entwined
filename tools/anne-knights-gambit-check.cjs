const fs=require('fs'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<div id="overlay" style="width:700px;height:430px"></div>');
 for(const file of ['artifacts/anne-107/activation-chess-samples.js','src/scripts/render-v2/19-approved-activation-art.js','src/scripts/render-v2/19-signature-activation-fx.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
 const result=await page.evaluate(()=>{
  const art=FateApprovedActivationArt,fx=FateSignatureActivationFx;
  if(!art.handles('107')||!fx.approved.includes('107')||fx.durationFor({id:'107'})!==2000)throw Error('107 registration missing');
  const a=document.createElement('canvas'),b=document.createElement('canvas');a.width=b.width=700;a.height=b.height=430;
  for(const t of [0,.15,.35,.5,.7,.85,1]){AnneRevolutionChess.draw(a.getContext('2d'),1,t,700,430);art.draw(b.getContext('2d'),'107',t,700,430);if(a.toDataURL()!==b.toDataURL())throw Error('Approved sample mismatch at '+t)}
  const overlay=document.getElementById('overlay'),mounted=fx.mount(overlay,{id:'107',type:'Initiator'},{sfx:false});
  if(!mounted||overlay.dataset.signatureActivation!=='107')throw Error('Mount failed');mounted.start();window.testFx=mounted;return true;
 });assert(result);await page.waitForTimeout(900);assert.equal(await page.locator('#overlay canvas').count(),1);
 await page.evaluate(()=>testFx.dispose());assert.deepEqual(errors,[]);console.log('PASS: card107 registered, exact approved animation across seven frames, live signature mount');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
