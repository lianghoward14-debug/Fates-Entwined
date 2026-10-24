(function(){
 'use strict';
 let seed=118;
 function rand(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
 function cloud(ctx,x,y,rx,ry,kind){
 kind=1;
 {
 ctx.save();ctx.translate(x,y);ctx.rotate((rand()-.5)*.09);
 const length=rx*((kind===1?1.9:kind===2?1.7:1.4)+rand()*.65), height=ry*((kind===1?.65:kind===2?.75:1)+rand()*.3);
 const phase=rand()*6.28, slope=(rand()-.5)*.12;
 // Soft overlapping washes are baked once; only the finished layers drift.
 for(let p=0;p<35;p++){
  const u=p/34,xx=(u-.5)*length*2;
  const envelope=Math.pow(Math.sin(Math.PI*u),.85);
  const yy=Math.sin(u*6+phase)*height*.28+xx*slope;
  const wide=length*(.11+rand()*.11),tall=height*envelope*(.55+rand()*.65);
  if(tall<1)continue;
  ctx.save();ctx.translate(xx,yy);ctx.scale(wide,tall);
  const wash=ctx.createRadialGradient(-.12,-.2,.02,0,0,1);
  wash.addColorStop(0,kind===1?'rgba(19,24,31,.34)':'rgba(26,33,42,.28)');
  wash.addColorStop(.45,'rgba(30,38,48,.24)');
  wash.addColorStop(.78,'rgba(45,52,62,.1)');
  wash.addColorStop(1,'rgba(45,52,62,0)');
  ctx.fillStyle=wash;ctx.fillRect(-1,-1,2,2);ctx.restore();
 }
 // Irregular contour follows each cloud's own volume and tapers at both ends.
 const upper=[],lower=[];
 const lobes=Array.from({length:3+Math.floor(rand()*3)},()=>({u:.12+rand()*.76,w:.055+rand()*.075,h:.3+rand()*.65}));
 const belly=rand()*6.28,tailBias=.7+rand()*.9;
 for(let j=0;j<=48;j++){
  const u=j/48,xx=(u-.5)*length*2,env=Math.pow(Math.sin(Math.PI*u),.85);
  const cy=Math.sin(u*6+phase)*height*.28+xx*slope;
  let crest=.18;
  for(const lobe of lobes)crest+=lobe.h*Math.exp(-Math.pow((u-lobe.u)/lobe.w,2)*.5);
  upper.push([xx,cy-height*env*crest*(kind===0?1.5-u:.6+u*tailBias)]);
  lower.push([xx,cy+height*env*(.31+.12*Math.sin(u*15+belly)+.06*Math.sin(u*27+phase))-(kind===1&&u>.48?Math.sin((u-.48)/.52*Math.PI)*height*.42:0)]);
 }
 const rim=new Path2D(), contour=upper.concat(lower.reverse());
 rim.moveTo(contour[0][0],contour[0][1]);
 for(let j=1;j<=contour.length;j++){
  const a=contour[j%contour.length],b=contour[(j+1)%contour.length];
  rim.quadraticCurveTo(a[0],a[1],(a[0]+b[0])/2,(a[1]+b[1])/2);
 }
 rim.closePath();
 const bodyWash=ctx.createLinearGradient(0,-height*1.7,0,height*.5);
 bodyWash.addColorStop(0,'rgba(74,80,90,.69)');
 bodyWash.addColorStop(.55,'rgba(36,44,56,.57)');
 bodyWash.addColorStop(1,'rgba(15,24,36,.43)');
 ctx.fillStyle=bodyWash;ctx.fill(rim);
 ctx.strokeStyle='#0a111de6';ctx.lineWidth=1.9;ctx.stroke(rim);
 ctx.restore();
 }
}

 let canvas=null,ctx=null,layers=null,rects=[],frame=0,timer=0,last=0,opacity=0,wanted=false,key='',surfaceWidth=1,surfaceHeight=1;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const revealCards=new Map();
 let revealTimer=0;
 function prepareReveal(previous,next){
  if(previous?.matchId!==next?.matchId){revealCards.clear();clearTimeout(revealTimer);revealTimer=0;return;}
  if(!previous?.saboteurConcealment?.active || next?.saboteurConcealment?.active)return;
  revealCards.clear();clearTimeout(revealTimer);
  if(reduced)return;
  const before=new Map();
  (previous.board||[]).forEach((zone,z)=>zone.forEach((row,r)=>row.forEach((card,c)=>{if(card)before.set(z+':'+r+':'+c,JSON.stringify(card));})));
  const start=performance.now()+1500;
  (next.board||[]).forEach((zone,z)=>zone.forEach((row,r)=>row.forEach((card,c)=>{
   if(card?.iid && before.get(z+':'+r+':'+c)!==JSON.stringify(card))revealCards.set(String(card.iid),start);
  })));
  if(!revealCards.size)return;
  const tick=()=>{
   window.FateMatchRendererAdapter?.scheduleRender?.('saboteur-card-reveal');
   if(performance.now()<start+650)revealTimer=setTimeout(tick,50);
   else {revealCards.clear();revealTimer=0;}
  };
  // No repeated board painting while the mist is still fading out.
  revealTimer=setTimeout(tick,1500);
 }
 function cardAlpha(card){
  const start=revealCards.get(String(card?.iid));
  if(start==null)return 1;
  const progress=Math.max(0,Math.min(1,(performance.now()-start)/650));
  return progress*progress*(3-2*progress);
 }
 function veilKey(g){
  if(!g||g._phase7Outcome||g.outcome||g.winner!=null)return '';
  const projected=g._saboteurConcealment||g.saboteurConcealment;
  if(projected?.active && (projected.untilTurn==null || g.turn<=projected.untilTurn))return 'projected:'+projected.owner;
  const status=(g._phase7Statuses||g.statuses||[]).find(s=>String(s.type||s.statusType)==='SABOTEUR_FIELD_VEIL');
  if(status && (status.untilTurn==null || g.turn<=status.untilTurn))return 'status:'+status.playerIndex;
  if(g._saboteurCloudTurn<=g.turn && g.turn<=(g._saboteurCloudUntilTurn??g._saboteurCloudTurn))return String(g._saboteurCloudTurn)+':'+g._saboteurCloudOwner;
  return '';
 }
 function sound(enter){
  try{
   const volume=(typeof _masterVol==='number'?_masterVol:1)*(typeof _sfxVol==='number'?_sfxVol:.8);
   if(volume<=0||document.hidden||typeof getAudioCtx!=='function'||typeof getSfxBus!=='function')return;
   const ac=getAudioCtx();if(ac.state!=='running')return;
   const duration=enter?1.15:1.45,buffer=ac.createBuffer(1,Math.ceil(ac.sampleRate*duration),ac.sampleRate),data=buffer.getChannelData(0);
   let smooth=0;for(let i=0;i<data.length;i++){smooth=.94*smooth+.06*(Math.random()*2-1);data[i]=smooth*3;}
   const source=ac.createBufferSource(),filter=ac.createBiquadFilter(),gain=ac.createGain(),now=ac.currentTime;
   source.buffer=buffer;filter.type='bandpass';filter.Q.value=.55;
   filter.frequency.setValueAtTime(enter?230:1000,now);filter.frequency.exponentialRampToValueAtTime(enter?850:180,now+duration);
   gain.gain.setValueAtTime(.0001,now);gain.gain.linearRampToValueAtTime(volume*(enter?.24:.18),now+(enter?.35:.12));gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
   source.connect(filter).connect(gain).connect(getSfxBus(ac).input);
   source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};source.start();source.stop(now+duration);
  }catch(e){}
 }
 function build(){
  layers=[];
  for(let l=0;l<3;l++){
   const layer=document.createElement('canvas');layer.width=1000;layer.height=430;
   const c=layer.getContext('2d');seed=118+l*11;
   for(let j=0;j<5;j++){
    const x=72+j*228+(l%2)*78+(rand()-.5)*66,y=104+l*108+(rand()-.5)*32;
    cloud(c,x,y,85+rand()*48,39+rand()*17,1);
   }
   layers.push(layer);
  }
 }
 function cloudRects(board,b){
  const renderer=window.FateMatchRendererAdapter;
  if(renderer?.ownsBoard?.()){
   const bounds=document.getElementById('fate-match-v2-canvas')?.getBoundingClientRect();
   if(!bounds)return [];
   const viewer=typeof getPerspectivePlayerIndex==='function'?getPerspectivePlayerIndex():0;
   return (renderer.getHitMap()?.cells||[]).filter(cell=>{
    const owner=cell.r===0?1:cell.r===2?0:cell.r===1?-1:typeof getExtraSafeRowOwner==='function'?getExtraSafeRowOwner(cell.z,cell.r):viewer;
    return owner===-1 || owner!==viewer;
   }).map(cell=>{const r=cell.rect;return {x:bounds.left+r.x-b.left,y:bounds.top+r.y-b.top,w:r.w,h:r.h};}).filter(r=>r.w>0&&r.h>0);
  }
  return [...board.querySelectorAll('.brow.contested,.brow.p2safe')].map(row=>{const r=row.getBoundingClientRect();return {x:r.left-b.left,y:r.top-b.top,w:r.width,h:r.height};}).filter(r=>r.w>0&&r.h>0);
 }
 function boardSurface(){
  if(window.FateMatchRendererAdapter?.ownsBoard?.()){
   return document.getElementById('fate-match-v2-canvas')?.parentElement || document.getElementById('codex-board-v19') || document.getElementById('board');
  }
  return document.getElementById('board');
 }
 function measure(){
  const board=boardSurface();if(!board||!canvas)return;
  const b=board.getBoundingClientRect();
  canvas.style.left=b.left+'px';canvas.style.top=b.top+'px';canvas.style.width=b.width+'px';canvas.style.height=b.height+'px';
  surfaceWidth=b.width;surfaceHeight=b.height;
  // Mist is soft artwork: cap its backing resolution instead of repainting a
  // full-screen texture. CSS keeps its physical size unchanged.
  const scale=Math.min(1,1024/b.width);
  const width=Math.max(1,Math.round(b.width*scale)),height=Math.max(1,Math.round(b.height*scale));
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  rects=cloudBands(cloudRects(board,b),b.width);
 }
 function cloudBands(cells,width){
  const bands=[];
  for(const cell of [...cells].sort((a,b)=>a.y-b.y)){
   const previous=bands[bands.length-1];
   if(previous && cell.y<=previous.y+previous.h+12)previous.h=Math.max(previous.y+previous.h,cell.y+cell.h)-previous.y;
   else bands.push({x:0,y:cell.y,w:width,h:cell.h});
  }
  return bands;
 }
 function remove(){cancelAnimationFrame(frame);clearTimeout(timer);timer=0;frame=0;canvas?.remove();canvas=null;ctx=null;opacity=0;rects=[];}
 function draw(now){
  if(document.hidden){frame=0;return;}
  if(now-last>=66){
   const dt=Math.min(.15,(now-last)/1000);last=now;
   opacity=Math.max(0,Math.min(1,opacity+(wanted?dt/.9:-dt/1.3)));
   ctx.clearRect(0,0,canvas.width,canvas.height);
   if(rects.length){
    const left=Math.min(...rects.map(r=>r.x)),top=Math.min(...rects.map(r=>r.y)),right=Math.max(...rects.map(r=>r.x+r.w)),bottom=Math.max(...rects.map(r=>r.y+r.h));
    ctx.save();ctx.scale(canvas.width/surfaceWidth,canvas.height/surfaceHeight);ctx.beginPath();rects.forEach(r=>ctx.rect(r.x,r.y,r.w,r.h));ctx.clip();
    ctx.translate(left,top);ctx.scale((right-left)/868,(bottom-top)/344);ctx.translate(-16,-52);
    ctx.globalAlpha=opacity*.93;
    for(let i=0;i<3;i++){const t=reduced?0:now/1000;ctx.drawImage(layers[i],-48+Math.sin(t*(.14+i*.025)+i)*24,Math.sin(t*.21+i)*5);}
    ctx.restore();
   }
   if(!wanted&&opacity===0){remove();return;}
  }
  frame=0;
  timer=setTimeout(()=>{timer=0;frame=requestAnimationFrame(draw);},66);
 }
 function sync(){
  const g=window.FateAuthorityV3SinglePlayer?.currentScreen?.()?.view?.state || (typeof G==='undefined'?null:G),board=boardSurface();
  const visible=board&&board.getBoundingClientRect().width>0&&board.getBoundingClientRect().height>0;
  const next=visible?veilKey(g):'';
  if(next!==key){
   const was=!!key;key=next;wanted=!!next;
   if(wanted&&!canvas){
    if(!layers)build();canvas=document.createElement('canvas');canvas.id='saboteur-cloud-overlay';canvas.setAttribute('aria-hidden','true');
    canvas.style.cssText='position:fixed;pointer-events:none;z-index:405;';document.body.appendChild(canvas);ctx=canvas.getContext('2d');
   }
   if(wanted&&!was)sound(true);else if(was&&!wanted&&visible)sound(false);
  }
  if(!visible){remove();return;}
  if(canvas){measure();if(!frame&&!timer&&!document.hidden){last=performance.now();frame=requestAnimationFrame(draw);}}
 }
 window.FateSaboteurClouds={sync,veilKey,cloudRects,cloudBands,prepareReveal,cardAlpha};
 setInterval(sync,250);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);clearTimeout(timer);timer=0;frame=0;}else sync();});
})();

