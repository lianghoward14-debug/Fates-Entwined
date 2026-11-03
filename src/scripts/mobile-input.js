(function(){
  'use strict';
  const isTouchLayout = ()=>!!window.matchMedia?.('(pointer: coarse)').matches && !window.FateElectronZoom;
  // Fit a complete board into the available phone viewport, including landscape.
  // Native browser magnification stays enabled for reading cards closely.
  function fitDimensions(width,height){
    const w = Math.max(1,Number(width)||1), h = Math.max(1,Number(height)||1);
    const layoutWidth = Math.ceil(Math.max(1280,w*720/h));
    return {width:layoutWidth, scale:w/layoutWidth, height:h*layoutWidth/w};
  }
  let fittedSize = '';
  let fittedHeight = 0;
  let mobileZoom = 1;
  function setZoom(value){ mobileZoom = value; document.body.style.zoom = ""; fitViewport(true); }
  function gameHeight(){ return isTouchLayout() && fittedHeight ? fittedHeight : window.innerHeight; }
  function fitViewport(force){
    if(!isTouchLayout()) return;
    if(document.activeElement?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
    const vv = window.visualViewport;
    const width = vv ? vv.width*vv.scale : window.innerWidth;
    const height = vv ? vv.height*vv.scale : window.innerHeight;
    if(!width || !height) return;
    const key = Math.round(width)+'x'+Math.round(height);
    if(!force && key === fittedSize) return;
    const viewport = document.querySelector('meta[name="viewport"]');
    if(!viewport) return;
    fittedSize = key;
    const fit = fitDimensions(width,Math.max(160,height-32));
    fit.width = Math.ceil(fit.width/mobileZoom);
    fit.scale = width/fit.width;
    fit.height = Math.max(160,height-32)/fit.scale;
    fittedHeight = fit.height;
    document.documentElement.style.setProperty('--fate-mobile-game-height',fit.height+'px');
    document.documentElement.style.setProperty('--fate-mobile-bottom-gap',(32/fit.scale)+'px');
    viewport.setAttribute('content','width='+fit.width+', initial-scale='+fit.scale.toFixed(6));
    document.documentElement.classList.add('fate-mobile-fit');
    window.FateMatchRendererAdapter?.scheduleRender?.('mobile-fit-resize');
  }
  function metrics(){
    if(!isTouchLayout()) return null;
    const canvas = document.getElementById('fate-match-v2-ui-canvas');
    if(!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const width = canvas.__fateCssW || canvas.clientWidth;
    const height = canvas.__fateCssH || canvas.clientHeight;
    if(!rect.width || !rect.height || !width || !height) return null;
    return {rect, sx:width/rect.width, sy:height/rect.height};
  }
  function uiPoint(x,y){
    const m = metrics();
    return m ? {x:(x-m.rect.left)*m.sx, y:(y-m.rect.top)*m.sy} : {x,y};
  }
  function uiRectToClient(r){
    const m = metrics();
    return m ? {x:r.x/m.sx+m.rect.left, y:r.y/m.sy+m.rect.top, w:r.w/m.sx, h:r.h/m.sy} : r;
  }
  function installZoomControls(){
    if(!isTouchLayout() || document.getElementById('fate-mobile-zoom')) return;
    const root = document.createElement('div');
    root.id = 'fate-mobile-zoom';
    root.setAttribute('data-scene-input','ignore');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = 'Zoom';
    toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('aria-controls','fate-mobile-zoom-panel');
    const panel = document.createElement('div');
    panel.id = 'fate-mobile-zoom-panel';
    panel.hidden = true;
    panel.setAttribute('role','group');
    panel.setAttribute('aria-label','Game size');
    const output = document.createElement('output');
    output.setAttribute('aria-live','polite');
    function sync(){
      const zoom = window.fateGetGameZoom?.() || 1;
      output.textContent = Math.round(zoom*100)+'%';
      // Keep these controls finger-sized even when the game uses CSS zoom.
      const nativeScale = window.visualViewport?.scale || 1;
      root.style.zoom = String(1/nativeScale);
    }
    [['−','Make game smaller',-.1], ['Fit','Fit the whole game on screen',0], ['+','Make game larger',.1]].forEach(([text,label,delta])=>{
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      button.setAttribute('aria-label',label);
      button.addEventListener('click',event=>{
        event.stopPropagation();
        if(delta) window.fateSetGameZoom(window.fateGetGameZoom()+delta);
        else { window.fateResetGameZoom(); fitViewport(true); }
        sync();
        window.dispatchEvent(new Event('resize'));
      });
      panel.appendChild(button);
    });
    panel.appendChild(output);
    const hint = document.createElement('div');
    hint.className = 'mobile-zoom-hint';
    hint.textContent = 'Fit shows the whole game. Pinch to magnify. Drag cards with one finger.';
    panel.appendChild(hint);
    toggle.addEventListener('click',event=>{
      event.stopPropagation();
      panel.hidden = !panel.hidden;
      toggle.setAttribute('aria-expanded',String(!panel.hidden));
      sync();
    });
    root.append(toggle,panel);
    document.body.appendChild(root);
    window.visualViewport?.addEventListener('resize',sync);
    window.addEventListener('fate-screen-changed',()=>{
      panel.hidden = true;
      toggle.setAttribute('aria-expanded','false');
      sync();
    });
    const titleHint = document.querySelector('#s-title .logo-sub');
    if(titleHint) titleHint.textContent = 'Pinch to zoom. Tap Zoom to adjust game size. Drag cards with one finger.';
    sync();
  }
  const touchSlop = (pixels=12)=>pixels/Math.max(.1,window.visualViewport?.scale || 1);
  window.FateMobileInput = {uiPoint,uiRectToClient,installZoomControls,fitDimensions,fitViewport,touchSlop,gameHeight,setZoom,isTouchLayout};
  if(isTouchLayout()){
    let fitTimer;
    const scheduleFit = ()=>{
      window.clearTimeout(fitTimer);
      fitTimer = window.setTimeout(()=>fitViewport(false),160);
    };
    window.addEventListener('resize',scheduleFit);
    window.addEventListener('orientationchange',scheduleFit);
    window.visualViewport?.addEventListener('resize',scheduleFit);
    fitViewport(false);
  }
})();
