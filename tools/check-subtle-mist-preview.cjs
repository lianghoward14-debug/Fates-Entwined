const fs=require('fs'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:940,height:690}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent(fs.readFileSync('C:/Users/user/.codex/visualizations/2026/10/14/01a13a30-afc7-76c1-8766-3c8e46d4f8bd/saboteur-subtle-breaks.html','utf8'));
 await page.waitForTimeout(500);await page.screenshot({path:'.tmp/subtle-breaks.png'});
 if(errors.length)throw Error(errors.join('\n'));console.log('Preview renders without script errors.');
}finally{await browser.close();}})();
