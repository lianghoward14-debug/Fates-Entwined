const {chromium}=require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try{
    const page=await browser.newPage({viewport:{width:900,height:300}});
    await page.route('http://portraits.local/**',async route=>{
      const pathname=decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//,'');
      if(!pathname) return route.fulfill({contentType:'text/html',body:`<body style="margin:0;background:#151923;display:flex;gap:12px;padding:12px">${[104,105,106].map(id=>`<img src="/pfp/card-${id}-portrait.png" style="width:276px;height:214px;object-fit:cover">`).join('')}</body>`});
      const file=path.join(__dirname,'..',pathname);
      return route.fulfill({body:fs.readFileSync(file),contentType:'image/png'});
    });
    await page.goto('http://portraits.local/');
    await page.locator('img').last().waitFor({state:'visible'});
    const loaded=await page.locator('img').evaluateAll(images=>images.map(image=>({complete:image.complete,width:image.naturalWidth,height:image.naturalHeight})));
    assert.ok(loaded.every(image=>image.complete&&image.width>0&&image.height>0));
    fs.mkdirSync(path.join(__dirname,'../artifacts/cards-104-106'),{recursive:true});
    await page.screenshot({path:path.join(__dirname,'../artifacts/cards-104-106/cinematic-portraits.png')});
    console.log('PASS 104-106 dedicated cinematic portraits load from their matching card artwork.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
