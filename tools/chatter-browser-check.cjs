const {chromium}=require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'msedge',args:['--autoplay-policy=no-user-gesture-required']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:720}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('http://chatter.local/**',async route=>{
      const pathname=new URL(route.request().url()).pathname;
      if(pathname==='/')return route.fulfill({contentType:'text/html',body:'<html><head><link rel="stylesheet" href="/src/styles/idle-chatter.css"></head><body style="margin:0;background:#1a222b"><div id="s-game" class="active"><aside class="codex-v19-command" style="position:fixed;right:20px;bottom:20px;width:280px;height:170px"></aside></div><script>window.g={board:[[[{id:"02",owner:0}]]],phase:"main",turn:1,currentPlayer:0};window.getFateGameState=()=>g;window.getPerspectivePlayerIndex=()=>0;window.fateAudioReport=()=>({voiceVolume:.5,masterVolume:1});window.clockOffset=0;const realNow=Date.now;Date.now=()=>realNow()+window.clockOffset;</script><script src="/src/scripts/47-idle-chatter.js"></script></body></html>'});
      const file=path.join(__dirname,'..',pathname);
      const types={'.js':'text/javascript','.css':'text/css','.png':'image/png','.mp3':'audio/mpeg'};
      await route.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]});
    });
    await page.goto('http://chatter.local/');
    const durations=await page.evaluate(async()=>Promise.all(['Anicka','Felicyta'].flatMap(character=>[1,2,3,4,5].map(i=>new Promise((resolve,reject)=>{
      const a=new Audio('/assets/audio/chatter/'+character+i+'.mp3');a.onloadedmetadata=()=>resolve(a.duration);a.onerror=()=>reject(new Error('Unreadable clip '+character+i));
    })))));
    await page.waitForTimeout(300);await page.evaluate(()=>{window.clockOffset=20000;});
    await page.locator('#fate-idle-chatter').waitFor({state:'visible'});
    await page.waitForTimeout(500);
    assert.ok(await page.locator('#fate-idle-chatter').evaluate(el=>{const r=el.getBoundingClientRect(),a=document.querySelector('.codex-v19-command').getBoundingClientRect();return r.width===330&&r.bottom<=a.top&&Math.abs(r.right-a.right)<1;}));
    assert.equal(await page.locator('#fate-idle-chatter img').evaluate(img=>img.complete&&img.naturalWidth>0),true);
    fs.mkdirSync(path.join(__dirname,'../artifacts/chatter'),{recursive:true});
    await page.locator('#fate-idle-chatter').screenshot({path:path.join(__dirname,'../artifacts/chatter/mariner-frame.png')});
    await page.setViewportSize({width:360,height:640});
    // Longest subtitle must fit without cropping at a narrow viewport.
    await page.locator('#fate-idle-chatter p').evaluate(p=>{p.textContent='I collected seashells, built sandcastles, and watched the sun fall beneath the waves.';});
    const fits=await page.locator('#fate-idle-chatter').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&el.scrollWidth<=el.clientWidth;});
    assert.ok(fits);
    await page.locator('#fate-idle-chatter').screenshot({path:path.join(__dirname,'../artifacts/chatter/mariner-frame-mobile.png')});
    await page.evaluate(()=>{g.currentPlayer=1;});
    await page.mouse.click(10,10);
    await page.waitForTimeout(750);
    assert.equal(await page.locator('#fate-idle-chatter').isVisible(),true,'board input and turn changes preserve chatter');
    assert.equal(await page.evaluate(()=>FateIdleChatter.report().used),0);
    await page.evaluate(()=>{g.consolidating=true;});
    await page.locator('#fate-idle-chatter').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>FateIdleChatter.report().remaining),5,'canceled chatter stays available');
    assert.deepEqual(errors,[]);
    console.log('PASS browser: all ten chatter MP3s decode, portrait, desktop/mobile layout, board-action persistence and consolidation cancellation. Durations:',durations.map(n=>n.toFixed(1)).join(', '));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
