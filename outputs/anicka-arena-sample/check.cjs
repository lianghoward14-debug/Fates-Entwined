const {chromium}=require('playwright');
const path=require('path');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const page=await browser.newPage({viewport:{width:1000,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('file:///'+path.join(__dirname,'index.html').replaceAll('\\','/'));
 await page.waitForFunction(()=>document.querySelector('#detail').textContent.startsWith('Idle'));
 for(let i=1;i<=4;i++){await page.locator('[data-mode="'+i+'"]').click();await page.waitForTimeout(1100);await page.screenshot({path:path.join(__dirname,'ability-'+i+'.png')});}
 await page.locator('#pause').click();
 await page.setViewportSize({width:360,height:700});await page.screenshot({path:path.join(__dirname,'mobile.png')});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 console.log(JSON.stringify({errors,overflow,abilities:4}));await browser.close();if(errors.length||overflow)process.exit(1);
})().catch(e=>{console.error(e);process.exit(1)});
