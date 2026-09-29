(function(){
  'use strict';
  function disabled(){return document.documentElement.classList.contains('fate-animations-off') || document.documentElement.classList.contains('fate-super-performance-mode') || document.documentElement.classList.contains('fate-reduced-motion') || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);}
  function rect(target){
    const adapter=window.FateMatchRendererAdapter,board=document.getElementById('fate-match-v2-canvas');
    if(!adapter || !board || !target)return null;
    const map=adapter.getHitMap();if(!map)return null;
    const hits=(map.cards||[]).concat(map.cells||[],map.handCards||[],map.opponentHandCards||[]);
    const hit=hits.find(function(h){return target.iid ? String(h.iid || h.card && h.card.iid || '')===String(target.iid) : h.z===target.z && h.r===target.r && h.c===target.c;});
    if(!hit)return null;
    const r=hit.cardRect||hit.rect,b=board.getBoundingClientRect(),sx=b.width/Math.max(1,board.clientWidth),sy=b.height/Math.max(1,board.clientHeight);
    return {x:b.left+r.x*sx,y:b.top+r.y*sy,w:(r.w||r.width)*sx,h:(r.h||r.height)*sy};
  }
  function play(kind,source,target){
    if(disabled())return false;
    const initial=rect(target);if(!initial)return false;
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)return false;
    const bannerCard = typeof CARDS !== 'undefined' ? CARDS.find(card=>String(card.id)===(kind==='scope'?'61':kind==='possibility'?'17':'04')) : null;
    window.FateActivationBanner?.play(bannerCard, {sfx:false});
    const sound=window.FateApprovedActivationSfx?.play(kind==='scope'?'61':kind==='possibility'?'17':'04');
    const dpr=Math.min(2,window.devicePixelRatio||1);
    canvas.style.cssText='position:fixed;pointer-events:none;z-index:12990';canvas.setAttribute('aria-hidden','true');canvas.dataset.characterBoardEffect=kind;document.body.appendChild(canvas);
    let bounds=null;
    function fitSurface(r,src){
      const pad=Math.max(r.w,r.h)/67*110+32;
      const left=Math.max(0,Math.floor(Math.min(r.x-pad,src?src.x-pad:r.x-pad)));
      const top=Math.max(0,Math.floor(Math.min(r.y-pad,src?src.y-pad:r.y-pad)));
      const right=Math.min(window.innerWidth,Math.ceil(Math.max(r.x+r.w+pad,src?src.x+src.w+pad:r.x+r.w+pad)));
      const bottom=Math.min(window.innerHeight,Math.ceil(Math.max(r.y+r.h+pad,src?src.y+src.h+pad:r.y+r.h+pad)));
      const next={x:left,y:top,w:Math.max(1,right-left),h:Math.max(1,bottom-top)};
      if(!bounds||Object.keys(next).some(k=>next[k]!==bounds[k])){
        bounds=next;canvas.width=Math.ceil(next.w*dpr);canvas.height=Math.ceil(next.h*dpr);
        canvas.style.left=next.x+'px';canvas.style.top=next.y+'px';canvas.style.width=next.w+'px';canvas.style.height=next.h+'px';
      }
    }
    // Carolyn and Zoe's newly-added board cinematics intentionally hold for a
    // full two seconds. Keep this local instead of inheriting the global
    // activation speed so later tuning elsewhere cannot shorten them again.
    const duration=2000;
    const start=performance.now(),color=kind==='scope'?'#ff6b70':kind==='possibility'?'#68ef9a':'#bc9bff';let frame=0,dead=false;
    const cl=x=>Math.max(0,Math.min(1,x));
    function finish(){if(dead)return;dead=true;sound?.stop();cancelAnimationFrame(frame);canvas.remove();}
    function draw(now){
      if(dead)return;if(disabled()){finish();return;}
      const t=cl((now-start)/duration),r=rect(target)||initial,cx=r.x+r.w/2,cy=r.y+r.h/2,scale=Math.max(r.w,r.h)/67;
      const sourceRect=kind==='scope'?rect(source):null;
      fitSurface(r,sourceRect);
      ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.setTransform(dpr,0,0,dpr,-bounds.x*dpr,-bounds.y*dpr);ctx.strokeStyle=color;ctx.shadowColor=color;ctx.shadowBlur=10;ctx.lineWidth=2;
      function line(points,a=1){ctx.globalAlpha=cl(a);ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.stroke();}
      function ring(radius,a){ctx.globalAlpha=cl(a);ctx.beginPath();ctx.arc(cx,cy,Math.max(1,radius),0,Math.PI*2);ctx.stroke();}
      if(kind==='scope'){
        const q=cl(t/.54),radius=(52-29*(1-Math.pow(1-q,3)))*scale,charge=Math.sin(Math.PI*cl(t/.59));
        ring(radius,charge);line([[cx-radius-9*scale,cy],[cx+radius+9*scale,cy]],charge);line([[cx,cy-radius-9*scale],[cx,cy+radius+9*scale]],charge);
        if(t>.49&&t<.77){const src=sourceRect,sx=src?src.x+src.w/2:cx-90*scale,sy=src?src.y+src.h/2:cy+65*scale,k=cl((t-.49)/.11);ctx.lineWidth=4;line([[sx,sy],[sx+(cx-sx)*k,sy+(cy-sy)*k]],1-cl((t-.60)/.17));ctx.lineWidth=2;}
      }else if(kind==='possibility'){
        const q=1-Math.pow(1-cl(t/.70),3),fade=Math.sin(Math.PI*cl(t/.82));
        for(let k=0;k<7;k++){
          const a=k*Math.PI*2/7+t*3,x=cx+Math.cos(a)*(78*(1-q))*scale,y=cy+Math.sin(a)*(54*(1-q))*scale;
          ctx.save();ctx.globalAlpha=fade*(.34+k*.06);ctx.strokeStyle=color;ctx.shadowColor=color;ctx.shadowBlur=8;ctx.strokeRect(x-18*scale,y-24*scale,36*scale,48*scale);ctx.restore();
          line([[x,y],[cx,cy]],fade*.48,1.2);
        }
        ring(25*scale+10*scale*Math.sin(t*18),fade);
      }else{
        const q=1-Math.pow(1-cl(t/.65),3),spread=(1-q)*38*scale,charge=Math.sin(Math.PI*cl(t/.8));
        for(let k=0;k<4;k++){const x=r.x+k*r.w/3,y=r.y+k*r.h/3;line([[x,r.y-spread],[x,r.y+r.h+spread]],charge*.8);line([[r.x-spread,y],[r.x+r.w+spread,y]],charge*.6);}
        if(t>.48){ctx.globalAlpha=cl((t-.48)/.25)*(1-cl((t-.85)/.15));ctx.strokeRect(r.x-3,r.y-3,r.w+6,r.h+6);}
      }
      const p=cl((t-(kind==='scope'?.59:kind==='possibility'?.55:.48))/(kind==='scope'?.41:kind==='possibility'?.45:.52));
      if(p>0&&p<1){ring((8+(1-Math.pow(1-p,3))*45)*scale,1-p);for(let k=0;k<26;k++){const a=k*2.4,d=(10+k%7*6)*(1-Math.pow(1-p,3))*scale;line([[cx+Math.cos(a)*d,cy+Math.sin(a)*d],[cx+Math.cos(a)*(d+6*scale),cy+Math.sin(a)*(d+6*scale)]],(1-p)**2);}}
      if(t<1)frame=requestAnimationFrame(draw);else finish();
    }
    frame=requestAnimationFrame(draw);setTimeout(finish,duration+500);return true;
  }
  window.FateCharacterBoardEffects={play,handles:card=>['04','17','61'].includes(String(card&&card.id||''))};
})();
