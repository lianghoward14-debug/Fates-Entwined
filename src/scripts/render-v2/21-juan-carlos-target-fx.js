(function(){
  'use strict';
  const duration=2000,clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>1-(1-clamp(x))**3;
  function draw(ctx,t,source,target,destination){
    const sx=source.x+source.w/2,sy=source.y+source.h/2,x=target.x+target.w/2,y=target.y+target.h/2;
    const scale=Math.max(target.w,target.h)/85,fade=ease(t/.12)*(1-ease((t-.82)/.18));
    const reach=ease(t/.35),bind=ease((t-.25)/.35),pull=ease((t-.55)/.4);
    function line(points,color,alpha=fade,width=1.6){ctx.save();ctx.globalAlpha=clamp(alpha);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.shadowColor=color;ctx.shadowBlur=9;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.stroke();ctx.restore();}
    function curve(fn,end,color,alpha,width){line(Array.from({length:65},(_,i)=>fn(i/64*end)),color,alpha,width);}
    // Two currents originate at Juan and meet on the chosen opponent card.
    for(const side of [-1,1])curve(v=>[sx+(x-sx)*v+Math.sin(v*Math.PI)*side*24*scale,sy+(y-sy)*v-Math.sin(v*Math.PI)*28*scale],reach,'#8cddd4',fade*(1-pull*.7),2);
    // Rectangular tidal bands visibly bind the card, rather than a centered emblem.
    for(let j=0;j<3;j++){
      const yy=y+(j-1)*target.h*.24,spread=(1-bind)*35*scale;
      curve(v=>[x+Math.cos(v*Math.PI*2+t*2)*(target.w*.62+spread),yy+Math.sin(v*Math.PI*2+t*2)*(9*scale+spread*.2)],bind,'#efd29a',fade*(.55+j*.15),1.8);
    }
    for(const side of [-1,1])for(const vertical of [-1,1]){
      const xx=x+side*(target.w/2+5*scale+(1-bind)*12*scale),yy=y+vertical*(target.h/2+5*scale);
      line([[xx-side*12*scale,yy],[xx,yy],[xx,yy-vertical*13*scale]],'#8cddd4',fade*bind,2);
    }
    if(destination){
      const dx=destination.x+destination.w/2,dy=destination.y+destination.h/2;
      for(let j=0;j<3;j++)curve(v=>[x+(dx-x)*v,y+(dy-y)*v+Math.sin(v*Math.PI)*(j-1)*18*scale],pull,'#8cddd4',fade*pull*.65,1.4);
      const radius=8+pull*12;
      curve(v=>[dx+Math.cos(v*Math.PI*2)*radius*scale,dy+Math.sin(v*Math.PI*2)*radius*.45*scale],1,'#efd29a',fade*pull,1.8);
    }
  }
  function disabled(){
    const classes=document.documentElement.classList;
    return classes.contains('fate-animations-off')||classes.contains('fate-super-performance-mode')||classes.contains('fate-reduced-motion')||document.body.classList.contains('fate-super-performance-mode')||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }
  function rect(position){
    const board=document.getElementById('fate-match-v2-canvas'),map=window.FateMatchRendererAdapter?.getHitMap?.();
    if(!board||!map||!position)return null;
    const hit=[...(map.cards||[]),...(map.cells||[])].find(h=>position.iid?String(h.iid||h.card?.iid||'')===String(position.iid):h.z===position.z&&h.r===position.r&&h.c===position.c);
    const r=hit?.cardRect||hit?.rect;if(!r)return null;
    const b=board.getBoundingClientRect(),sx=b.width/Math.max(1,board.clientWidth),sy=b.height/Math.max(1,board.clientHeight);
    return{x:b.left+r.x*sx,y:b.top+r.y*sy,w:(r.w||r.width)*sx,h:(r.h||r.height)*sy};
  }
  function play(source,target,destination){
    if(!source||!target||Number(source.controller??source.owner)===Number(target.controller??target.owner)||window.isHiddenEffectForViewer?.(source)||disabled())return Promise.resolve(false);
    try{if(localStorage.getItem('fateReducedMotion')==='1'||localStorage.getItem('fateDisableEffectActivationCinematic')==='1'||window.FATE_DISABLE_EFFECT_ACTIVATION_CINEMATIC===true)return Promise.resolve(false);}catch(e){}
    const initial=rect(target),initialSource=rect(source),initialDest=rect(destination);
    if(!initial||!initialSource)return Promise.resolve(false);
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)return Promise.resolve(false);
    const dpr=Math.min(2,window.devicePixelRatio||1),w=window.innerWidth,h=window.innerHeight;
    canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:12990';canvas.dataset.characterBoardEffect='juan-carlos';canvas.setAttribute('aria-hidden','true');document.body.appendChild(canvas);
    window.FateActivationBanner?.play(source, {sfx:false, hasCenterAnimation:true});
    const activationSound=window.FateApprovedActivationSfx?.play('39');
    return new Promise(resolve=>{
      const start=performance.now();let raf=0,timer=0,dead=false;
      const game=typeof G!=='undefined'?G:null,lockUntil=Date.now()+duration+250;
      if(game)game._cinematicUiLockUntil=Math.max(Number(game._cinematicUiLockUntil)||0,lockUntil);
      function finish(){if(dead)return;dead=true;activationSound?.stop();cancelAnimationFrame(raf);clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);if(game&&game._cinematicUiLockUntil===lockUntil)game._cinematicUiLockUntil=0;canvas.remove();resolve(true);}
      function visibility(){if(document.hidden)finish();}
      function tick(now){if(dead)return;if(disabled()||!canvas.isConnected){finish();return;}try{const t=clamp((now-start)/duration);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);draw(ctx,t,rect(source)||initialSource,rect(target)||initial,rect(destination)||initialDest);if(t<1)raf=requestAnimationFrame(tick);else finish();}catch(e){finish();}}
      document.addEventListener('visibilitychange',visibility);raf=requestAnimationFrame(tick);timer=setTimeout(finish,duration+250);
    });
  }
  window.FateJuanCarlosTargetFx={draw,play,duration};
})();
