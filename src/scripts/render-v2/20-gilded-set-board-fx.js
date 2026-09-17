(function(){
'use strict';if(window.FateGildedSetBoardFx)return;
const TAU=Math.PI*2,clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x)},ease=x=>1-Math.pow(1-clamp(x),3),seed=n=>{let x=Math.sin(n*91.7+17.4)*43758.5;return x-Math.floor(x)};
function reduced(){try{return document.documentElement.classList.contains('fate-animations-off')||document.documentElement.classList.contains('fate-super-performance-mode')||document.documentElement.classList.contains('fate-reduced-motion')||localStorage.getItem('fateReducedMotion')==='1'||matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){return false}}
function rectFor(target){
 try{
  let fx=window.FateV2CardMotionFx,local=fx&&fx.targetRectForBoardTarget?fx.targetRectForBoardTarget(target):null,board=document.getElementById('fate-match-v2-canvas');
  if(!local||!board||!board.getBoundingClientRect)return null;
  let bounds=board.getBoundingClientRect(),sx=bounds.width/Math.max(1,board.clientWidth||bounds.width),sy=bounds.height/Math.max(1,board.clientHeight||bounds.height);
  return{x:bounds.left+Number(local.x||0)*sx,y:bounds.top+Number(local.y||0)*sy,width:Number(local.width!=null?local.width:local.w||0)*sx,height:Number(local.height!=null?local.height:local.h||0)*sy};
 }catch(e){return null}
}
function play(target,attempt){
 if(reduced())return false;let rect=rectFor(target),tries=Math.max(0,Number(attempt)||0);if(!rect||rect.width<=0||rect.height<=0){if(tries<8)setTimeout(function(){play(target,tries+1)},45);return tries<8}
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)return false;let dpr=Math.min(2,devicePixelRatio||1),w=Math.max(1,innerWidth),h=Math.max(1,innerHeight),raf=0,dead=false,start=performance.now();canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.setAttribute('aria-hidden','true');canvas.dataset.genericSetStyle='gilded-impact';canvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:12990;pointer-events:none';ctx.setTransform(dpr,0,0,dpr,0,0);document.body.appendChild(canvas);
 const cx=rect.x+rect.width/2,cy=rect.y+rect.height/2,scale=Math.max(64,Math.min(150,Math.max(rect.width,rect.height)*1.7));
 function ring(r,lw,a){ctx.save();ctx.translate(cx,cy);ctx.scale(1,.55);ctx.globalAlpha=clamp(a);ctx.strokeStyle='#f7d481';ctx.lineWidth=lw;ctx.shadowColor='#efbd58';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(0,0,Math.max(.1,r),0,TAU);ctx.stroke();ctx.restore()}
 function glow(x,y,r,a){ctx.save();ctx.globalAlpha=clamp(a);ctx.globalCompositeOperation='screen';let g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'#fff0ae');g.addColorStop(.2,'#efbd58aa');g.addColorStop(1,'#efbd5800');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.restore()}
 function frame(now){if(dead)return;let t=clamp((now-start)/760),hit=smooth(t/.23),fade=1-smooth((t-.48)/.48),a=hit*fade;ctx.clearRect(0,0,w,h);glow(cx,cy,scale*.92,.42*a);for(let i=0;i<4;i++)ring(18+ease(hit)*(scale-i*13),i?1:2.5,a*(1-hit*.64));ctx.save();ctx.globalCompositeOperation='screen';for(let i=0;i<90;i++){let q=seed(i)*TAU,d=ease(hit)*(20+seed(i+40)*scale),x=cx+Math.cos(q)*d,y=cy+Math.sin(q)*d*.62,len=4+15*(1-hit);ctx.globalAlpha=a*(1-hit)*(.25+seed(i+5));ctx.strokeStyle=i%9?'#e9b955':'#fff1b2';ctx.lineWidth=i%9?1:2;ctx.shadowColor='#f4c765';ctx.shadowBlur=7;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-Math.cos(q)*len,y-Math.sin(q)*len*.62);ctx.stroke()}ctx.restore();let pulse=Math.exp(-Math.pow((t-.25)/.045,2));glow(cx,cy,scale*.72,pulse*.7);if(t<1)raf=requestAnimationFrame(frame);else dispose()}
 function dispose(){if(dead)return;dead=true;cancelAnimationFrame(raf);if(canvas.parentNode)canvas.remove()}
 raf=requestAnimationFrame(frame);setTimeout(dispose,1100);return true
}
window.FateGildedSetBoardFx={play};
})();
