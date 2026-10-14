const fs=require('fs'),assert=require('assert/strict');
const {chromium}=require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const source=fs.readFileSync('src/scripts/render-v2/04-match-renderer-adapter.js','utf8');
function fn(name){const a=source.indexOf('  function '+name+'('),b=source.indexOf('\n  }',a);return source.slice(a,b+4);}
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();await page.setContent('<canvas width="960" height="672"></canvas>');
  await page.addScriptTag({content:fn('roundedPath')+fn('drawMilitaryBlockadeChains')});
  const result=await page.evaluate(()=>{
   const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
   let strokes=0;const old=CanvasRenderingContext2D.prototype.stroke;
   CanvasRenderingContext2D.prototype.stroke=function(...args){strokes++;return old.apply(this,args)};
   drawMilitaryBlockadeChains(ctx,{x:0,y:0,w:120,h:168});
   const initial=strokes,texture=drawMilitaryBlockadeChains.texture;
   const start=performance.now();
   for(let frame=0;frame<120;frame++)for(let card=0;card<24;card++)
    drawMilitaryBlockadeChains(ctx,{x:(card%8)*120,y:Math.floor(card/8)*168,w:120,h:168});
   return {initial,repeatStrokes:strokes-initial,sameTexture:texture===drawMilitaryBlockadeChains.texture,ms:performance.now()-start};
  });
  assert(result.initial>0);assert.equal(result.repeatStrokes,0);assert(result.sameTexture);
  console.log('PASS: 24 chained cards over 120 frames reuse one texture with zero repeated link strokes.',result);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
