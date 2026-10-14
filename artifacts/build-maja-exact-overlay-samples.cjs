const fs=require('fs'),path=require('path');
const {chromium}=require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const src=fs.readFileSync('src/scripts/render-v2/04-match-renderer-adapter.js','utf8');
function fn(name){const a=src.indexOf('  function '+name+'('),b=src.indexOf('\n  }',a);if(a<0||b<0)throw Error(name);return src.slice(a,b+4);}
const palette=src.slice(src.indexOf('  const CARD_EFFECT_FLASH_PALETTE ='),src.indexOf('  function getEffectFlashPalette('));
let icon=fn('drawEffectFlashIcon');
icon=icon.replace("    if(kind === 'jorge_pineapple') {",`    if(kind === 'maja_tank') {
      ctx.lineWidth=4.2;
      ctx.beginPath();ctx.roundRect(9,34,46,18,9);ctx.stroke();
      line([[14,33],[20,23],[43,23],[50,33]],false);
      line([[26,23],[26,15],[39,15],[44,23]],false);
      line([[40,18],[58,18]],false);
      circle(21,43,3);circle(32,43,3);circle(43,43,3);
    } else if(kind === 'maja_ranks') {
      ctx.lineWidth=4.2;
      line([[9,44],[21,32],[33,44]],false);
      line([[21,32],[33,20],[45,32]],false);
      line([[33,20],[45,8],[57,20]],false);
      line([[9,54],[21,42],[33,54]],false);
      line([[33,40],[45,28],[57,40]],false);
    } else if(kind === 'maja_ribbon') {
      ctx.lineWidth=4.2;
      circle(32,30,6);
      ctx.beginPath();ctx.moveTo(26,28);ctx.bezierCurveTo(5,8,5,37,25,34);ctx.stroke();
      ctx.beginPath();ctx.moveTo(38,28);ctx.bezierCurveTo(59,8,59,37,39,34);ctx.stroke();
      line([[27,36],[19,55],[29,50],[32,57],[35,37]],false);
      line([[37,36],[47,54]],false);
    } else if(kind === 'jorge_pineapple') {`);
const renderer=palette+fn('roundedPath')+`\nfunction getEffectFlashPalette(kind){return kind.startsWith('maja_')?CARD_EFFECT_FLASH_PALETTE.british_union_jack:(CARD_EFFECT_FLASH_PALETTE[kind]||DEFAULT_EFFECT_FLASH_PALETTE);}\n`+icon+fn('drawEffectFlashCardOverlay');
const img=fs.readFileSync('9.png').toString('base64');
const html=`<!doctype html><meta charset="utf-8"><title>Maja overlay samples — game renderer</title><style>*{box-sizing:border-box}body{margin:0;background:#0c0e14;color:#e8dfcb;font-family:Georgia;padding:28px}h1{font-size:25px;font-weight:400;margin:0 0 10px}p{color:#aaa49b;font:14px Arial;margin:0 0 28px}.grid{display:flex;gap:24px}.sample{width:280px;text-align:center}h2{font-size:18px;font-weight:400;margin:0 0 18px}canvas{width:240px;height:336px;display:block;margin:auto}.note{font:12px Arial;color:#aaa49b;margin-top:18px}</style><h1>Maja Kaminska · Supporter boost</h1><p>Actual game overlay renderer · same icon scale, line weight, glow and tint</p><div class="grid">${['1 · Tank','2 · Oblique ranks','3 · Ribbon'].map((n,i)=>`<div class="sample"><h2>${n}</h2><canvas id="c${i}" width="480" height="672"></canvas><div class="note">Overlay on the affected Supporter</div></div>`).join('')}</div><script>${renderer}\nconst image=new Image();image.onload=()=>{['maja_tank','maja_ranks','maja_ribbon'].forEach((kind,i)=>{const ctx=document.getElementById('c'+i).getContext('2d');ctx.scale(4,4);ctx.drawImage(image,0,0,120,168);drawEffectFlashCardOverlay(ctx,{x:0,y:0,w:120,h:168},kind);});window.ready=true;};image.src='data:image/png;base64,${img}';</script>`;
fs.writeFileSync('artifacts/maja-supporter-overlay/exact-style-samples.html',html);
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});try{const page=await browser.newPage({viewport:{width:944,height:550},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setContent(html);await page.waitForFunction(()=>window.ready===true);if(errors.length)throw Error(errors.join(';'));await page.screenshot({path:'artifacts/maja-supporter-overlay/exact-style-samples.png'});console.log('Rendered three samples with the actual game overlay functions');}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
