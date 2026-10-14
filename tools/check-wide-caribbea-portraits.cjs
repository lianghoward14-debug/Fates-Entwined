const fs=require('fs'),assert=require('assert/strict');
const {chromium}=require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
const page=await browser.newPage({viewport:{width:1020,height:510}});
const imgs=[108,109,110].map(id=>'data:image/svg+xml;base64,'+fs.readFileSync(`pfp/card-${id}-portrait.svg`).toString('base64'));
await page.setContent('<style>body{background:#10131b;color:#e7dcc6;font:18px Georgia;display:flex;gap:24px;padding:20px}section{text-align:center;width:300px}img{width:300px;aspect-ratio:591/453;object-fit:contain}.avatar{width:110px;height:110px;object-fit:cover;border-radius:50%;margin-top:18px}</style>'+imgs.map((src,i)=>`<section><p>${['Sofia','Don Julio','Sebastian'][i]}</p><img src="${src}"><img class="avatar" src="${src}"></section>`).join(''));
await page.locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
assert.equal(await page.locator('img').count(),6);
await page.screenshot({path:'artifacts/caribbea-game-style/wide-portraits.png'});
console.log('PASS: three wide portraits and circular profile crops decode and render.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
