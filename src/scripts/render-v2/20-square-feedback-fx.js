(function(){
  'use strict';
  const sets = new Map(), clicks = new Map();
  const duration = 850, hammerDuration = 760, clickDuration = 320;
  let frame = 0;
  const key = target => [target.z, target.r, target.c].join(':');
  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => 1 - Math.pow(1 - clamp(value), 3);
  // These trajectories never change between impacts. Keep their original
  // distribution without repeating trigonometry for every spark on every frame.
  const sparks = Array.from({length:24}, (_, i) => {
    const random = Math.abs(Math.sin(i * 127.1 + 31.7) * 43758.5) % 1;
    return {cos:Math.cos(i * 2.399), sin:Math.sin(i * 2.399), distance:12 + random * 95,
      alpha:.4 + random * .6, width:i % 5 ? 1.5 : 3, color:'#ffffff'};
  });
  const glowCache = new WeakMap();
  function reduced(){
    return ['fate-animations-off','fate-super-performance-mode','fate-reduced-motion'].some(name =>
      document.documentElement.classList.contains(name) || document.body?.classList.contains(name)) ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
      (function(){try{return localStorage.getItem('fateReducedMotion') === '1';}catch(e){return false;}})();
  }
  function tick(){
    frame = 0;
    const now = performance.now();
    const off = reduced() || document.hidden;
    let restore = false;
    sets.forEach((item, id) => {
      if(off || now-item.start>=item.duration){item.canvas?.remove();sets.delete(id);restore=true;}
      else if(item.texture) paintOverlay(item, true);
    });
    clicks.forEach((item, id) => {
      if(off || now-item.start>=clickDuration){item.canvas?.remove();clicks.delete(id);}
      else paintOverlay(item, false);
    });
    // Only restore the settled card once. Animation frames never redraw the board.
    if(restore) window.FateMatchRendererAdapter?.scheduleRender?.('square-feedback');
    if(sets.size || clicks.size) frame = requestAnimationFrame(tick);
  }
  function wake(){ if(!frame) frame = requestAnimationFrame(tick); }
  function playSet(target, card, style){
    if(!target || !card || reduced()) return false;
    sets.get(key(target))?.canvas?.remove();
    sets.set(key(target), {start:performance.now(), iid:String(card.iid), target:{...target},style,duration:style==='hammer-lock'?hammerDuration:duration});
    window.FateMatchRendererAdapter?.scheduleRender?.('square-feedback');
    wake();
    return true;
  }
  function playClick(target){
    if(!target || reduced()) return false;
    clicks.get(key(target))?.canvas?.remove();
    clicks.set(key(target), {start:performance.now(), target:{...target}});
    wake();
    return true;
  }
  function surface(item, rect, isSet){
    const board=document.getElementById('fate-match-v2-canvas');
    if(!board || !board.isConnected) return null;
    const bounds=board.getBoundingClientRect(),sx=bounds.width/(board.__fateCssW||board.clientWidth||bounds.width),sy=bounds.height/(board.__fateCssH||board.clientHeight||bounds.height);
    // Corners stay inside the cell. Set padding covers the lifted card and
    // rotated seal, without allocating a large empty halo around every click.
    const pad=isSet?Math.max(120,Math.min(rect.w,rect.h)*.85):12;
    const w=rect.w+pad*2,h=rect.h+pad*2,dpr=Math.min(2,window.devicePixelRatio||1);
    if(!item.canvas){item.canvas=document.createElement('canvas');item.canvas.style.cssText='position:fixed;pointer-events:none;z-index:12980';item.canvas.setAttribute('aria-hidden','true');item.canvas.dataset.squareFeedback='true';document.body.appendChild(item.canvas);}
    const canvas=item.canvas;
    if(canvas.width!==Math.ceil(w*dpr)||canvas.height!==Math.ceil(h*dpr)){canvas.width=Math.ceil(w*dpr);canvas.height=Math.ceil(h*dpr);}
    const placement=[bounds.left+(rect.x-pad)*sx,bounds.top+(rect.y-pad)*sy,w*sx,h*sy];
    if(!item.placement || placement.some((value,i)=>value!==item.placement[i])){
      canvas.style.left=placement[0]+'px';canvas.style.top=placement[1]+'px';canvas.style.width=placement[2]+'px';canvas.style.height=placement[3]+'px';item.placement=placement;
    }
    const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.translate(pad-rect.x,pad-rect.y);
    return ctx;
  }
  function paintOverlay(item, isSet){
    const map=window.FateMatchRendererAdapter?.getHitMap?.();
    const hits=isSet?map?.cards:map?.cells;
    const hit=hits?.find(h=>key(h)===key(item.target));
    if(!hit || (isSet && String(hit.card?.iid)!==item.iid)){item.canvas?.remove();item.canvas=null;return;}
    const rect=isSet?hit.rect:(hit.visualRect||hit.rect),ctx=surface(item,rect,isSet);
    if(!ctx)return;
    if(!isSet){drawClick(ctx,item.target,rect);return;}
    const entry={...item.target,card:hit.card},p=pose(entry,rect);if(!p)return;
    drawSet(ctx,entry,rect);ctx.save();const cx=rect.x+rect.w/2,cy=rect.y+rect.h/2;
    ctx.translate(cx,cy+p.y);ctx.rotate(p.angle);ctx.scale(p.scale,p.scale);
    ctx.drawImage(item.texture,-rect.w/2-item.margin,-rect.h/2-item.margin,rect.w+item.margin*2,rect.h+item.margin*2);ctx.restore();
  }
  function captureSet(entry, rect, paint){
    const item=sets.get(key(entry));
    if(!item || progress(entry)===null)return false;
    if(!item.texture){
      const margin=24,dpr=Math.min(2,window.devicePixelRatio||1),texture=document.createElement('canvas');
      texture.width=Math.ceil((rect.w+margin*2)*dpr);texture.height=Math.ceil((rect.h+margin*2)*dpr);
      const ctx=texture.getContext('2d');if(!ctx)return false;
      ctx.setTransform(dpr,0,0,dpr,(margin-rect.x)*dpr,(margin-rect.y)*dpr);paint(ctx);
      item.texture=texture;item.margin=margin;
    }
    return true;
  }
  function progress(entry){
    if(!sets.size) return null;
    const item = sets.get(key(entry));
    if(!item || reduced() || item.iid !== String(entry.card?.iid)) return null;
    const t = (performance.now() - item.start) / item.duration;
    return t >= 1 ? null : clamp(t);
  }
  function pose(entry, rect){
    const t = progress(entry);
    if(t === null) return null;
    const hammer=sets.get(key(entry))?.style==='hammer-lock',hit=hammer?.27:.32;
    const fall = clamp(t / hit), q = (t - hit) / (1-hit);
    const bounce = q < 0 ? 0 : Math.sin(q * Math.PI * 3) * Math.exp(-q * 8);
    return {
      y:q < 0 ? -Math.min(hammer?110:96, rect.h * .95) * (1 - fall * fall) : -bounce * 9,
      scale:q < 0 ? 1 + (1 - fall) * .1 : 1 - bounce * .045,
      angle:q < 0 ? (hammer?.03:-.1)*(1-fall) : Math.sin(q * 20) * Math.exp(-q * 9) * .015
    };
  }
  function drawClick(ctx, entry, rect){
    if(!clicks.size) return;
    const item = clicks.get(key(entry));
    if(!item || reduced()) return;
    const t = (performance.now() - item.start) / clickDuration;
    if(t >= 1) return;
    const size = Math.min(rect.w, rect.h), inset = size * (.085 - .065 * (1 - ease(t * 2)));
    const len = Math.min(19, size * .19), x = rect.x, y = rect.y;
    ctx.save();
    ctx.globalAlpha = 1 - clamp((t - .5) * 2);
    ctx.strokeStyle = '#edc679'; ctx.lineWidth = 2.5;
    ctx.shadowColor = '#edc679'; ctx.shadowBlur = 6;
    for(const sx of [-1,1]) for(const sy of [-1,1]){
      const cx = sx < 0 ? x + inset : x + rect.w - inset;
      const cy = sy < 0 ? y + inset : y + rect.h - inset;
      ctx.beginPath(); ctx.moveTo(cx - sx * len, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy - sy * len); ctx.stroke();
    }
    ctx.restore();
  }
  function drawSet(ctx, entry, rect){
    const t = progress(entry);
    if(t === null) return;
    if(sets.get(key(entry))?.style==='hammer-lock'){drawHammer(ctx,rect,t);return;}
    const x = rect.x + rect.w / 2, y = rect.y + rect.h / 2;
    const unit = Math.min(rect.w, rect.h) / 90, q = (t - .32) / .68;
    ctx.save(); ctx.translate(x,y);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 * unit;
    ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 5;
    if(q < 0){
      const fall = clamp(t / .32);
      ctx.globalAlpha = fall; ctx.rotate((1 - fall) * .7);
      ctx.strokeRect(-rect.w * .52, -rect.h * .52, rect.w * 1.04, rect.h * 1.04);
    } else {
      // Gradients retain their creation coordinates: key the bounded cache by
      // position, scale and canvas transform so resize/scroll remain correct.
      const transform = ctx.getTransform?.();
      const glowKey = [x,y,unit,transform?.a,transform?.b,transform?.c,transform?.d,transform?.e,transform?.f].join(':');
      let cache = glowCache.get(ctx);
      if(!cache){ cache = new Map(); glowCache.set(ctx, cache); }
      let glow = cache.get(glowKey);
      if(!glow){
        glow = ctx.createRadialGradient(0,0,0,0,0,110*unit);
        glow.addColorStop(0,'#ffffff88'); glow.addColorStop(1,'#ffffff00');
        if(cache.size >= 12) cache.clear();
        cache.set(glowKey, glow);
      }
      ctx.globalAlpha = (1-q)*.65; ctx.fillStyle=glow;
      ctx.fillRect(-110*unit,-110*unit,220*unit,220*unit);
      ctx.save(); ctx.rotate(q*.22); ctx.globalAlpha=1-q; ctx.lineWidth=3*unit;
      ctx.strokeRect(-rect.w*.54,-rect.h*.54,rect.w*1.08,rect.h*1.08);
      const expand=ease(q)*32*unit;
      ctx.globalAlpha=(1-q)*.6; ctx.lineWidth=unit;
      ctx.strokeRect(-rect.w*.54-expand,-rect.h*.54-expand,rect.w*1.08+expand*2,rect.h*1.08+expand*2);
      ctx.restore();
      const travel = ease(q)*unit, tailX = (3+9*(1-q))*unit, tailY = 6*(1-q)*unit;
      // The seal retains its glow; small moving sparks do not need blur passes.
      ctx.shadowBlur=0;
      for(const spark of sparks){
        const d=spark.distance*travel, px=spark.cos*d, py=spark.sin*d*.65;
        ctx.globalAlpha=(1-q)*spark.alpha; ctx.lineWidth=spark.width*unit;
        ctx.strokeStyle=spark.color;
        ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(px-spark.cos*tailX,py-spark.sin*tailY); ctx.stroke();
      }
    }
    ctx.restore();
  }
  function drawHammer(ctx,rect,t){
    const x=rect.x+rect.w/2,y=rect.y+rect.h/2,unit=Math.min(rect.w,rect.h)/90,q=(t-.27)/.73,fall=clamp(t/.27);
    ctx.save();ctx.translate(x,y);ctx.strokeStyle='#fff1c4';ctx.shadowColor='#edc679';ctx.shadowBlur=5;ctx.lineWidth=(q<0?2:3)*unit;
    const d=q<0?rect.w*.54+(1-fall)*36*unit:rect.w*.51+Math.max(0,1-q*7)*18*unit;
    ctx.globalAlpha=q<0?fall:1-q;
    for(const side of [-1,1])ctx.strokeRect(side*d-4*unit,-rect.h*.51,8*unit,rect.h*1.02);
    if(q>=0){
      ctx.save();ctx.scale(1,.75);ctx.globalAlpha=(1-q)*.7;ctx.strokeStyle='#edc679';ctx.lineWidth=2*unit;ctx.beginPath();ctx.arc(0,0,(40+ease(q)*60)*unit,0,Math.PI*2);ctx.stroke();ctx.restore();
      ctx.shadowBlur=0;
      for(const spark of sparks){const r=spark.distance*ease(q)*unit,px=spark.cos*r,py=spark.sin*r*.65;ctx.globalAlpha=(1-q)*spark.alpha;ctx.strokeStyle='#edc679';ctx.lineWidth=spark.width*unit;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px-spark.cos*(3+9*(1-q))*unit,py-spark.sin*6*(1-q)*unit);ctx.stroke();}
    }
    ctx.restore();
  }
  window.FateSquareFeedbackFx = {playSet, playClick, pose, drawClick, drawSet, captureSet, duration, hammerDuration};
})();
