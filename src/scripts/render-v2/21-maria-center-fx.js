(function(){
  'use strict';
  const duration=2000;
  function disabled(){
    return ['fate-animations-off','fate-super-performance-mode','fate-reduced-motion'].some(c=>document.documentElement.classList.contains(c)||document.body.classList.contains(c))||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }
  let active=null;
  function play(source){
    if(active)return active;
    if(document.hidden||disabled()||window.isHiddenEffectForViewer?.(source)||!window.FateApprovedActivationArt)return Promise.resolve(false);
    try{if(localStorage.getItem('fateReducedMotion')==='1'||localStorage.getItem('fateDisableEffectActivationCinematic')==='1'||window.FATE_DISABLE_EFFECT_ACTIVATION_CINEMATIC===true)return Promise.resolve(false);}catch(e){}
    const board=document.getElementById('fate-match-v2-canvas');
    if(!board)return Promise.resolve(false);
    const bounds=board.getBoundingClientRect();if(!bounds.width||!bounds.height)return Promise.resolve(false);
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)return Promise.resolve(false);
    const dpr=Math.min(2,window.devicePixelRatio||1),w=bounds.width,h=bounds.height;
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    canvas.style.cssText=`position:fixed;left:${bounds.left}px;top:${bounds.top}px;width:${w}px;height:${h}px;pointer-events:none;z-index:12990`;
    canvas.dataset.characterBoardEffect='maria-center';canvas.setAttribute('aria-hidden','true');document.body.appendChild(canvas);
    window.FateActivationBanner?.play(source, {sfx:false, hasCenterAnimation:true});
    const activationSound=window.FateApprovedActivationSfx?.play('61');
    active=new Promise(resolve=>{
      const start=performance.now(),game=typeof G!=='undefined'?G:null,lockUntil=Date.now()+duration+250;
      let raf=0,timer=0,dead=false;
      if(game)game._cinematicUiLockUntil=Math.max(Number(game._cinematicUiLockUntil)||0,lockUntil);
      function finish(){if(dead)return;dead=true;activationSound?.stop();cancelAnimationFrame(raf);clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);canvas.remove();if(game&&game._cinematicUiLockUntil===lockUntil)game._cinematicUiLockUntil=0;active=null;resolve(true);}
      function visibility(){if(document.hidden)finish();}
      function tick(now){if(dead)return;if(disabled()||!canvas.isConnected){finish();return;}try{const t=Math.min(1,Math.max(0,(now-start)/duration));ctx.setTransform(dpr,0,0,dpr,0,0);window.FateApprovedActivationArt.draw(ctx,'61',t,w,h);if(t<1)raf=requestAnimationFrame(tick);else finish();}catch(e){finish();}}
      document.addEventListener('visibilitychange',visibility);raf=requestAnimationFrame(tick);timer=setTimeout(finish,duration+250);
    });
    return active;
  }
  window.FateMariaCenterFx={play,duration};
})();
