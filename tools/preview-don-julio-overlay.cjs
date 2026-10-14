const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const {chromium}=require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path=require('path'),root=path.resolve(__dirname,'..');
const src=fs.readFileSync('src/scripts/render-v2/04-match-renderer-adapter.js','utf8');
function fn(name){const a=src.indexOf('  function '+name+'('),b=src.indexOf('\n  }',a);assert(a>=0);return src.slice(a,b+4);}
const palette=src.slice(src.indexOf('  const CARD_EFFECT_FLASH_PALETTE ='),src.indexOf('  function getEffectFlashPalette('));
const js=palette+fn('getEffectFlashPalette')+fn('roundedPath')+fn('drawEffectFlashIcon')+fn('drawEffectFlashCardOverlay')+fn('drawMilitaryBlockadeChains');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{const page=await browser.newPage();await page.setContent('<canvas width="440" height="616"></canvas>');await page.addScriptTag({content:js});const art=fs.readFileSync('109.png').toString('base64');
 const result=await page.evaluate(async art=>{let sounds=0;window.playCardEffectFlashSfx=()=>sounds++;const c=document.querySelector('canvas'),ctx=c.getContext('2d'),img=new Image();img.src='data:image/png;base64,'+art;await img.decode();ctx.scale(440/120,616/168);const r={x:0,y:0,w:120,h:168};ctx.drawImage(img,0,0,120,168);drawEffectFlashCardOverlay(ctx,r,'don_julio_dice');return {sounds,url:c.toDataURL()};},art);
 assert.equal(result.sounds,0);fs.writeFileSync(path.join(root,'artifacts/caribbea-game-style/don-julio-dice-overlay.png'),Buffer.from(result.url.split(',')[1],'base64'));console.log('PASS: Don Julio dice uses the existing card-overlay renderer.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
