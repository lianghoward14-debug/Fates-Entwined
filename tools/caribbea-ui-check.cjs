const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),ui=fs.readFileSync(path.join(root,'src/scripts/06-rendering-and-helpers.js'),'utf8');
function fn(name){const start=ui.indexOf('function '+name+'(');assert.ok(start>=0);const end=ui.indexOf('\nfunction ',start+10);return ui.slice(start,end);}
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});try{
 const page=await browser.newPage({viewport:{width:1000,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://caribbea.local/**',route=>{const file=path.join(root,decodeURIComponent(new URL(route.request().url()).pathname));return fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({body:fs.readFileSync(file)}):route.fulfill({body:'<html><body></body></html>',contentType:'text/html'});});
 await page.goto('http://caribbea.local/');
 await page.setContent('<body class="in-game"><div id="s-game" class="active"></div><div id="modal" class="on"><div class="modal"><div id="modal-title"></div><div id="modal-body"></div><div id="modal-acts"></div></div></div></body>');
 for(const file of ['game.css','99-ui-final.css','zz-codex-last.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'src/styles',file),'utf8')});
 await page.addScriptTag({content:`var G={};window.escapeHtml=s=>String(s);window.isHandLimitDiscardModalOpen=()=>false;window.shouldUseCardEffectModal=()=>false;window.resetModalChrome=()=>{};window.playSfx=()=>{};window.closeModal=()=>document.getElementById('modal').classList.remove('on');`+fn('showModal')+fn('showJorgeTypeDeclarationPicker')+fn('buildCardDetailTrackerHTML')});
 await page.evaluate(()=>showJorgeTypeDeclarationPicker(['Initiator','Improvisor','Coordinator','Dauntless'].map(label=>({label,action:()=>window.selectedType=label}))));
 await page.locator('.jorge-declaration img').evaluate(img=>img.decode());
 fs.mkdirSync(path.join(root,'artifacts/caribbea-ui'),{recursive:true});
 await page.screenshot({path:path.join(root,'artifacts/caribbea-ui/jorge-picker.png')});
 for(const type of ['Initiator','Improvisor','Coordinator','Dauntless']){await page.getByRole('button',{name:type,exact:true}).click();assert.equal(await page.evaluate(()=>window.selectedType),type);}
 await page.setViewportSize({width:390,height:750});
 assert.equal(await page.evaluate(()=>document.querySelector('#modal .modal').scrollWidth>document.querySelector('#modal .modal').clientWidth),false);
 await page.screenshot({path:path.join(root,'artifacts/caribbea-ui/jorge-picker-mobile.png')});
 await page.setViewportSize({width:1000,height:800});
 await page.evaluate(()=>{showModal('Jose Garcia',buildCardDetailTrackerHTML({id:'106',owner:0,counters:{joseFieldTurns:5}},0,false),[],{immediate:true});});
 const bounds=await page.evaluate(()=>{const v=document.querySelector('.cd-live-tracker-value').getBoundingClientRect(),s=document.querySelector('.cd-live-tracker-sub').getBoundingClientRect();return {bottom:v.bottom,top:s.top,text:document.querySelector('.cd-live-tracker').textContent};});assert.ok(bounds.top>=bounds.bottom);assert.ok(bounds.text.includes('Aura: +1 Fate'));
 await page.screenshot({path:path.join(root,'artifacts/caribbea-ui/jose-tracker.png')});
 await page.addScriptTag({content:fs.readFileSync(path.join(root,'src/scripts/render-v2/22-activation-banner.js'),'utf8')});
 for(const id of ['104','105','106'])for(const stale of [false,true]){
 const src=await page.evaluate(({id,stale})=>{FateActivationBanner.play({id,type:'Improvisor',name:id,...(stale?{cinematicPortrait:'pfp/pfp104.png'}:{})},{sfx:false});return document.querySelector('.fate-activation-film-cut img').getAttribute('src');},{id,stale});
 assert.equal(src,'pfp/card-'+id+'-portrait.png?v=20261009');await page.locator('.fate-activation-film-cut img').first().evaluate(img=>img.decode());await page.evaluate(()=>FateActivationBanner.dismiss());
 }
 assert.deepEqual(errors,[]);console.log('PASS: four Jorge choices, narrow layout, Jose supplementary line, 104-106 actual banner portraits with missing/stale metadata.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
