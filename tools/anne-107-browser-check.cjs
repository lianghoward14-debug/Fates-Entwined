const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const ui=read('src/scripts/06-rendering-and-helpers.js');
function fn(name){const start=ui.indexOf('function '+name+'(');assert.ok(start>=0);return ui.slice(start,ui.indexOf('\nfunction ',start+10));}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge',args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage({viewport:{width:1320,height:820}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://anne.local/**',route=>{
   const file=path.join(root,decodeURIComponent(new URL(route.request().url()).pathname));
   const types={'.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg'};
   return fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||'text/plain'}):route.fulfill({body:'<html><body></body></html>',contentType:'text/html'});
  });
  await page.goto('http://anne.local/');
  await page.setContent('<body style="margin:0"><img src="/artifacts/anne-107/planning-samples.svg" style="display:block;width:1320px;height:820px"></body>');
  await page.locator('img').evaluate(img=>img.decode());
  await page.screenshot({path:path.join(root,'artifacts/anne-107/planning-samples.png')});
  await page.setViewportSize({width:800,height:500});
  await page.setContent('<body style="margin:0"><img src="/artifacts/anne-107/planning-c-revised.svg" style="display:block;width:800px;height:500px"></body>');
  await page.locator('img').evaluate(img=>img.decode());
  await page.screenshot({path:path.join(root,'artifacts/anne-107/planning-c-revised.png')});
  await page.setViewportSize({width:1000,height:850});
  await page.setContent('<body class="in-game"><div id="s-game" class="active"></div><div id="modal" class="on"><div class="modal"><div id="modal-title"></div><div id="modal-body"></div><div id="modal-acts"></div></div></div></body>');
  for(const file of ['game.css','99-ui-final.css','zz-codex-last.css'])await page.addStyleTag({content:read('src/styles/'+file)});
  await page.addScriptTag({content:`var G={};window.escapeHtml=s=>String(s);window.isHandLimitDiscardModalOpen=()=>false;window.shouldUseCardEffectModal=()=>false;window.resetModalChrome=()=>{};window.playSfx=()=>{};window.closeModal=()=>document.getElementById('modal').classList.remove('on');`+fn('showModal')+fn('showAnneActionDeclarationPicker')});
  await page.addScriptTag({content:`window.anneOptions=['Draw','Search','Fate Increase/Decrease','Movement','Status Effect Activation','Morale Increase/Decrease'];window.openAnne=()=>showAnneActionDeclarationPicker(anneOptions.map(label=>({label,action:()=>window.selectedAction=label})),{promptId:'anne-test'});openAnne();`});
  await page.locator('.anne-declaration img').evaluate(img=>img.decode());
  assert.equal(await page.locator('#modal-acts button').count(),6);
  await page.screenshot({path:path.join(root,'artifacts/anne-107/picker-en.png')});
  for(const label of ['Draw','Search','Fate Increase/Decrease','Movement','Status Effect Activation','Morale Increase/Decrease']){
   await page.evaluate(()=>openAnne());await page.getByRole('button',{name:label==='Draw'?'Draw Cards':label==='Search'?'Search Cards':label,exact:true}).click();assert.equal(await page.evaluate(()=>selectedAction),label);
  }
  for(const file of ['53-japanese-catalog.js','53-japanese-card-updates.js','54-localization.js'])await page.addScriptTag({content:read('src/scripts/'+file)});
  await page.evaluate(()=>{FateI18n.setLanguage('ja');openAnne();});await page.waitForTimeout(250);
  const labels=await page.locator('#modal-acts button').allTextContents();assert(labels.every(label=>!/[A-Za-z]/.test(label)),labels.join(', '));
  assert.equal(await page.locator('#modal-title').textContent(),'革命の戦略');
  assert.equal(labels[0],'ドロー');assert.equal(labels[1],'サーチ');
  assert(!/[A-Za-z]/.test(await page.locator('.anne-declaration').textContent()),'picker copy is fully Japanese');
  await page.screenshot({path:path.join(root,'artifacts/anne-107/picker-ja.png')});
  await page.setViewportSize({width:390,height:750});
  assert.equal(await page.locator('#modal .modal').evaluate(el=>el.scrollWidth>el.clientWidth),false);
  for(let i=0;i<6;i++){
   await page.evaluate(()=>openAnne());await page.waitForTimeout(80);
   await page.locator('#modal-acts button').nth(i).click();assert.equal(await page.evaluate(()=>selectedAction),await page.evaluate(i=>anneOptions[i],i));
  }
  await page.evaluate(()=>openAnne());await page.waitForTimeout(150);
  await page.screenshot({path:path.join(root,'artifacts/anne-107/picker-ja-mobile.png')});
  await page.addScriptTag({content:read('src/scripts/render-v2/22-activation-banner.js')});
  await page.evaluate(()=>FateActivationBanner.play({id:'107',type:'Initiator',name:'Anne Stone (Revolutionary)',cinematicPortrait:'pfp/pfp107.png'},{sfx:false}));
  assert.equal(await page.locator('.fate-activation-film-cut img').first().getAttribute('src'),'pfp/card-107-portrait.svg?v=20261010');
  await page.locator('.fate-activation-film-cut img').first().evaluate(img=>img.decode());
  const duration=await page.evaluate(()=>new Promise((resolve,reject)=>{const a=new Audio('/setvoicelines/107.mp3');a.onloadedmetadata=()=>resolve(a.duration);a.onerror=reject;}));
  assert.ok(duration>0);assert.deepEqual(errors,[]);
  console.log('PASS Anne browser: six English/Japanese selections, mobile fit, matching cinematic portrait, audio decode, and three planning banner samples. Audio seconds:',duration);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
