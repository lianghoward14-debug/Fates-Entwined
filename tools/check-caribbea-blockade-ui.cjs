const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {chromium}=require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
function extract(s,name){let start=s.indexOf('function '+name+'(');assert(start>=0,name);return s.slice(start,s.indexOf('\n}',start)+2);}
(async()=>{
 const ui=read('src/scripts/06-rendering-and-helpers.js'),core=read('src/scripts/05-gameplay-core.js');
 const target={iid:'target',id:'32',type:'Supporter',owner:1,_setTurn:1},a={id:'114',owner:0},b={id:'114',owner:0};
 const ctx={G:{turn:3,board:[[[a,b],[target]]]},window:{},cardActsAsPassive:(c,id)=>c.id===id,isTargetImmuneToEffectOwner:()=>false,isSupporterAuraSuppressed:c=>!!c.suppressed,isCardEffectSuppressed:()=>false,sanitizeCardEffectFlashKind:x=>x||''};vm.createContext(ctx);
 vm.runInContext(extract(core,'getMilitaryBlockadeTurns'),ctx);ctx.window.getMilitaryBlockadeTurns=ctx.getMilitaryBlockadeTurns;
 vm.runInContext(extract(ui,'getActiveCardEffectFlash'),ctx);
 assert.equal(ctx.getMilitaryBlockadeTurns(target,0),1);
 assert.equal(ctx.getActiveCardEffectFlash(target),null,'blockade must not occupy the central overlay slot');
 ctx.G.turn=5;assert.equal(ctx.getMilitaryBlockadeTurns(target,0),0);
 ctx.G.turn=3;b.suppressed=true;assert.equal(ctx.getMilitaryBlockadeTurns(target,0),0);
 b.suppressed=false;b.faceDown=true;assert.equal(ctx.getMilitaryBlockadeTurns(target,0),0);
 b.faceDown=false;ctx.G.board[0][0]=[];assert.equal(ctx.getMilitaryBlockadeTurns(target,0),0);
 vm.runInContext(extract(ui,'getAuthoritativeEffectOverlayDescriptor'),ctx);
 assert.equal(ctx.getAuthoritativeEffectOverlayDescriptor({type:'FATE_CHANGED',reason:'REVOLUTIONARY_SPIRIT',before:1,after:5},null,target).kind,'revolutionary_spirit');
 assert.equal(ctx.getAuthoritativeEffectOverlayDescriptor({type:'EFFECT_ACTIVATED'}, {id:'112'},target),null);
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1200,height:850}});
 await page.setContent('<body></body>');await page.addStyleTag({content:read('src/styles/ledger-archive.css')});await page.addScriptTag({content:read('src/scripts/51-ledger-archive.js')});
 const panelCards=['32','114','112','113','115'].map((id,i)=>({id,iid:i===0?'a':'c'+i,name:i===0?'Supporter':i===1?'Infantry of Havano':'Card '+id,img:'data:image/png;base64,'+fs.readFileSync(path.join(root,id+'.png')).toString('base64')}));
 await page.evaluate(cards=>{window.openLedgerArchive(cards,{opponentDeck:true,title:'Elite Influence'});},panelCards);
 assert(await page.locator('#ledger-archive.oligarch-archive').count());
 await page.getByRole('button',{name:'Move Supporter later'}).click();
 assert.equal(await page.locator('.ledger-card strong').first().textContent(),'Infantry of Havano');
 await page.locator('.ledger-card img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
 fs.mkdirSync(path.join(root,'artifacts/caribbea-followup'),{recursive:true});
 await page.screenshot({path:path.join(root,'artifacts/caribbea-followup/oligarch.png')});
 await page.addScriptTag({content:read('src/scripts/render-v2/19-approved-activation-sfx.js')});
 const audio=await page.evaluate(async()=>{const ac=new OfflineAudioContext(1,96000,48000);FateApprovedActivationSfx.schedule(ac,ac.destination,'military-blockade',1);const data=(await ac.startRendering()).getChannelData(0);return {peak:data.reduce((a,x)=>Math.max(a,Math.abs(x)),0),finite:data.every(Number.isFinite)};});
 assert(audio.finite&&audio.peak>0&&audio.peak<1,JSON.stringify(audio));
 await page.setViewportSize({width:390,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const fragment=fs.readFileSync('C:/Users/user/.codex/visualizations/2026/10/13/01a1378a-ec64-7012-a409-89ef77972e4d/caribbea-effect-samples.html','utf8');
 await page.setContent(fragment);
 assert.equal(await page.locator('[data-variant]').count(),6);
 for(const width of [390,736]){
  await page.setViewportSize({width,height:1100});
  for(let i=0;i<6;i++){
   await page.evaluate(i=>{document.querySelectorAll('[data-variant]').forEach((el,n)=>el.hidden=n!==i);},i);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
 }
 await page.locator('.fe-unlock:visible').click();assert.equal(await page.locator('.fe-gain:visible').textContent(),'READY');
 await page.locator('.fe-unlock:visible').click();assert.equal(await page.locator('.fe-gain:visible').textContent(),'BLOCKADED');
 console.log('PASS: persistent blockade expiry/removal/suppression, revolutionary target route, Oligarch ordering/mobile fit, finite unclipped blockade sound.',audio);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
