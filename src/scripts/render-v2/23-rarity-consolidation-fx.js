(function(){'use strict';
const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>1-(1-clamp(x))**3,seg=(t,a,b)=>clamp((t-a)/(b-a));
function mount(overlay,character,options){
 const ids={square:0,star:1,triangle:2},id=ids[options.rarity];if(id==null)return null;
 const cv=document.createElement('canvas'),c=cv.getContext('2d');if(!c)return null;
 const width=Math.min(innerWidth,innerHeight*1000/760),height=width*760/1000,dpr=Math.min(1.25,devicePixelRatio||1),scale=width/1000;
 cv.width=Math.ceil(width*dpr);cv.height=Math.ceil(height*dpr);cv.style.cssText='position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:'+width+'px;height:'+height+'px;pointer-events:none';cv.setAttribute('aria-hidden','true');overlay.appendChild(cv);
 cv.dataset.rarity=options.rarity;cv.dataset.tributeCount=String(Math.max(0,Math.floor(Number(options.tributeCount)||0)));
 const image=options.image,count=()=>Math.max(0,Math.floor(Number(options.tributeCount)||0));
 const gold=['#aa9bbd','#efca85','#9cb5a5'][id],white='#e1dbd0',blue=id===1?'#d1b177':gold;
 let raf=0,start=0,dead=false,sound=null,started=false;
 function line(points,color=gold,alpha=1,width=2,closed=false){if(alpha<=0)return;c.save();c.globalAlpha=clamp(alpha);c.strokeStyle=color;c.lineWidth=width;c.shadowColor=color;c.shadowBlur=4;c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));if(closed)c.closePath();c.stroke();c.restore()}
function ring(x,y,r,alpha=1,color=gold,ys=1,rot=0){c.save();c.translate(x,y);c.rotate(rot);c.scale(1,ys);c.globalAlpha=clamp(alpha);c.strokeStyle=color;c.lineWidth=2;c.shadowColor=color;c.shadowBlur=5;c.beginPath();c.arc(0,0,Math.max(.1,r),0,Math.PI*2);c.stroke();c.restore()}
function glow(x,y,r,alpha){c.save();c.globalAlpha=clamp(alpha);const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,gold+'55');g.addColorStop(1,gold+'00');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);c.restore()}
function card(x,y,s=1,a=1,rot=0,hero=false){if(!hero){
 // Abstract light converges in place of miniature tribute cards.
 glow(x,y,18*s,a*.8);line([[x-9*s,y],[x+9*s,y]],gold,a,2);return;
}c.save();c.translate(x,y);c.rotate(rot);c.scale(s,s);c.globalAlpha=clamp(a);if(image&&image.complete&&image.naturalWidth)c.drawImage(image,-42,-60,84,120);else{c.fillStyle='#1b2633';c.fillRect(-42,-60,84,120);c.fillStyle='#e1dbd0';c.textAlign='center';c.font='11px Georgia';c.fillText(character.name||'Character',0,0,78)}c.restore()}
function burst(t){if(t<=0||t>=1)return;for(let k=0;k<40;k++){const a=k*2.399,r=(45+k%9*12)*ease(t),x=350+Math.cos(a)*r,y=210+Math.sin(a)*r*.72;line([[x,y],[x+Math.cos(a)*12*(1-t),y+Math.sin(a)*12*(1-t)]],k%4?gold:white,1-t,k%5?1:2)}}

 function draw(t){c.setTransform(dpr*scale,0,0,dpr*scale,0,0);c.clearRect(0,0,1000,760);const collect=ease(seg(t,.05,.47)),reveal=ease(seg(t,.46,.64)),fade=1-ease(seg(t,.88,1));c.save();
 // Every rarity settles at the same 48% stage-height character size.
 c.translate(500,343);const designScale=[1,364.8/(120*1.18),.76][id];c.scale(designScale,designScale);c.translate(id===1?-350:-500,id===1?-205:-343);
 if(id===0){
 const open=ease(seg(t,.36,.68)),appear=ease(seg(t,.39,.59)),cool='#928ca8';
 glow(500,343,330,.35);
 // Cathedral Seal: five connected planes advance out of a vanishing point.
 for(let k=4;k>=0;k--){
  const p=ease(seg(t,.04+k*.045,.38+k*.045)),w=300+k*35,h=360+k*30,s=.35+.65*p;
  line([[500-w*s/2,343-h*s/2],[500+w*s/2,343-h*s/2],[500+w*s/2,343+h*s/2],[500-w*s/2,343+h*s/2]],k%2?cool:gold,.64-k*.095,k===0?3:1.5,true);
  if(k<4){const nw=335+k*35,nh=390+k*30;for(const sx of [-1,1])for(const sy of [-1,1])line([[500+sx*w*s/2,343+sy*h*s/2],[500+sx*nw*s/2,343+sy*nh*s/2]],gold,.2,1)}
 }
 for(const side of [-1,1])line([[500+side*(248+open*15),130],[500+side*(265+open*15),147],[500+side*(265+open*15),539],[500+side*(248+open*15),556]],gold,.6*open,3);
 if(t>.34&&t<.72){const q=seg(t,.34,.72);for(let k=0;k<20;k++){const a=k*2.399,r=165+ease(q)*145;line([[500+Math.cos(a)*r,343+Math.sin(a)*r*.87],[500+Math.cos(a)*(r+9),343+Math.sin(a)*(r+9)*.87]],gold,(1-q)*.5,1.5)}}
 if(appear>0)card(500,343+(1-appear)*28,3.04*(.9+.1*appear),appear,0,true);
}else if(id===1){
 const radius=105*(1-collect*.3);ring(350,205,radius,fade,gold);
 for(let k=0;k<3;k++){
  const a=k*Math.PI*2/3+collect*3,r=160*(1-collect),size=1.4*(1-.45*collect);
  c.save();c.translate(350+Math.cos(a)*r,205+Math.sin(a)*r);c.rotate(a+Math.PI);c.scale(size,size);
  c.globalAlpha=1-collect;c.strokeStyle=gold;c.lineWidth=1.8;c.shadowBlur=0;
  c.beginPath();c.moveTo(15,0);c.quadraticCurveTo(3,3,0,12);c.quadraticCurveTo(-3,3,-15,0);c.quadraticCurveTo(-3,-3,0,-12);c.quadraticCurveTo(3,-3,15,0);c.closePath();c.stroke();c.restore();
 }
 for(let k=0;k<24;k++){const a=k*Math.PI/12;line([[350+Math.cos(a)*90,205+Math.sin(a)*90],[350+Math.cos(a)*(92+reveal*45),205+Math.sin(a)*(92+reveal*45)]],gold,reveal*fade,1)}
 glow(350,205,150,reveal*fade*.6);if(reveal>0)card(350,205,1.18,reveal,0,true);ring(350,205,90+reveal*65,(1-reveal)*fade);burst(seg(t,.5,.85));
}else if(id===2){
 const pull=ease(seg(t,.1,.46)),release=ease(seg(t,.4,.75)),appear=ease(seg(t,.37,.57));
 glow(500,335,450,.36);
 // Full-size Triune Aperture: three offset triangles close, then open.
 for(let k=0;k<3;k++){
  const a=-Math.PI/2+k*Math.PI*2/3,shift=(1-pull)*130+release*32;
  const points=[0,1,2,0].map(j=>{const b=-Math.PI/2+j*Math.PI*2/3;return[500+Math.cos(b)*340+Math.cos(a)*shift,360+Math.sin(b)*340+Math.sin(a)*shift]});
  line(points,gold,.25+k*.17,3);line([points[k],points[k+1]],gold,.8,5);
 }
 glow(500,360,280,.6*(1-release)*pull);
 // Always three nested-triangle accents, independent of tribute cost.
 for(let k=0;k<3;k++){
  const a=k/3*Math.PI*2-Math.PI/2,size=3*(1-.35*pull);
  c.save();c.translate(500+Math.cos(a)*340*(1-pull),335+Math.sin(a)*275*(1-pull));c.rotate(a+Math.PI);c.scale(size,size);
  c.globalAlpha=1-seg(t,.32,.48);c.strokeStyle=gold;c.lineWidth=2.5;c.lineJoin='round';c.shadowBlur=0;c.beginPath();
  for(const r of [27,15]){c.moveTo(r,0);c.lineTo(-r*.5,r*.866);c.lineTo(-r*.5,-r*.866);c.closePath();}c.stroke();c.restore();
 }
 if(appear>0)card(500,343+(1-appear)*55,4*(.84+.16*appear),appear,0,true);
 if(t>.4&&t<.68){const p=seg(t,.4,.68);for(let k=0;k<20;k++){const a=k*2.399,r=190+ease(p)*220;line([[500+Math.cos(a)*r,335+Math.sin(a)*r*.8],[500+Math.cos(a)*(r+12),335+Math.sin(a)*(r+12)*.8]],gold,(1-p)*.65,2)}}
}

 c.restore();}
 function dispose(){dead=true;cancelAnimationFrame(raf);sound?.stop();cv.remove();}
 function tick(now){if(dead)return;if(!overlay.isConnected||document.hidden){dispose();return}draw(clamp((now-start)/options.duration));if(now-start<options.duration)raf=requestAnimationFrame(tick);}
 return {start(){if(started||dead)return;started=true;start=performance.now();if(options.playSfx!==false)sound=window.FateConsolidationSfx?.play(options.rarity,options.duration);raf=requestAnimationFrame(tick)},dispose};
}
window.FateRarityConsolidationFx={mount};})();
