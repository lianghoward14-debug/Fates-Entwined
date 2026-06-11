(function(){
  'use strict';

  if(typeof window === 'undefined') return;
  if(window.FateVfxDirector) return;

  const VERSION = 1;
  const VFX_BUDGET = {
    maxActiveParticles:180,
    maxActiveParticlesLow:36,
    maxShockwaves:8,
    maxBeams:6,
    maxCardMotions:12,
    maxNumberPops:12,
    maxVfxMs:4,
    maxVfxMsLow:2
  };

  let activeRecipes = [];
  let activePrimitives = [];
  let recentRecipes = [];
  let nextId = 1;
  let lowEffectsMode = false;
  let lastTickAt = 0;
  let lastVfxMs = 0;
  let maxVfxMs = 0;
  let droppedEffects = 0;
  let skippedLowPriorityEffects = 0;
  let draws = 0;
  const vfxMsSamples = [];
  const spawnedParticlePrimitiveIds = new Set();
  let dragPreview = null;
  const eventBridgeStats = {
    acceptedGameEvents:0,
    localIntents:0,
    promptsCreated:0,
    promptsResolved:0,
    stateDiffs:0,
    byType:{},
    recent:[]
  };

  function nowMs(){
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function clamp(value, min, max){
    return Math.max(min, Math.min(max, value));
  }

  function ease(name, t){
    const x = clamp(Number(t) || 0, 0, 1);
    if(name === 'linear') return x;
    if(name === 'in-cubic') return x * x * x;
    if(name === 'in-quart') return x * x * x * x;
    if(name === 'out-quint') return 1 - Math.pow(1 - x, 5);
    if(name === 'in-out-cubic') return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    if(name === 'out-back-soft'){
      const c1 = 1.28;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    }
    return 1 - Math.pow(1 - x, 3);
  }

  function reducedMotionEnabled(){
    try {
      if(document.documentElement.classList.contains('fate-animations-off') ||
        document.documentElement.classList.contains('fate-reduced-motion')) return true;
    } catch(e) {}
    try {
      if(localStorage.getItem('fateReducedMotion') === '1') return true;
    } catch(e) {}
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch(e) {
      return false;
    }
  }

  function animationsOff(){
    try {
      return document.documentElement.classList.contains('fate-animations-off') ||
        (document.body && document.body.classList && document.body.classList.contains('fate-animations-off'));
    } catch(e) {
      return false;
    }
  }

  function lowEffectsEnabled(){
    if(lowEffectsMode) return true;
    try {
      if(animationsOff()) return true;
    } catch(e) {}
    try {
      if(localStorage.getItem('fateLowEffects') === '1') return true;
    } catch(e) {}
    return document.documentElement.classList.contains('fate-low-effects');
  }

  function rect(input){
    if(!input) return null;
    const x = Number(input.x != null ? input.x : input.left);
    const y = Number(input.y != null ? input.y : input.top);
    const w = Number(input.w != null ? input.w : input.width);
    const h = Number(input.h != null ? input.h : input.height);
    if(!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    return {x, y, w, h};
  }

  function roundedPath(ctx, x, y, w, h, radius){
    const r = Math.max(0, Math.min(Number(radius) || 0, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function center(r){
    const rr = rect(r) || {x:0, y:0, w:0, h:0};
    return {x:rr.x + rr.w / 2, y:rr.y + rr.h / 2};
  }

  function lerp(a, b, t){
    return (Number(a) || 0) + ((Number(b) || 0) - (Number(a) || 0)) * t;
  }

  function lerpRect(a, b, t){
    const from = rect(a) || rect(b);
    const to = rect(b) || from;
    if(!from || !to) return null;
    return {
      x:lerp(from.x, to.x, t),
      y:lerp(from.y, to.y, t),
      w:lerp(from.w, to.w, t),
      h:lerp(from.h, to.h, t)
    };
  }

  function rectFromCenter(cx, cy, w, h){
    return {x:cx - w / 2, y:cy - h / 2, w, h};
  }

  function pointBetween(a, b, t){
    return {
      x:lerp(Number(a && a.x) || 0, Number(b && b.x) || 0, t),
      y:lerp(Number(a && a.y) || 0, Number(b && b.y) || 0, t)
    };
  }

  function cardMoveRect(p, raw, eased){
    const from = rect(p.fromRect) || rect(p.rect) || rect(p.toRect);
    const to = rect(p.toRect) || rect(p.rect) || from;
    if(!from || !to) return null;
    const fromC = center(from);
    const toC = center(to);
    const path = String(p.path || 'arc').toLowerCase();
    const overshoot = clamp(Number(p.overshoot) || 0, 0, .32);
    let travel = eased;
    let cx;
    let cy;
    if(overshoot > 0 && raw > .76){
      const overX = toC.x + (toC.x - fromC.x) * overshoot;
      const overY = toC.y + (toC.y - fromC.y) * overshoot;
      const settleT = clamp((raw - .76) / .24, 0, 1);
      const a = pointBetween(fromC, {x:overX, y:overY}, clamp(eased / .96, 0, 1));
      cx = lerp(a.x, toC.x, ease('out-back-soft', settleT));
      cy = lerp(a.y, toC.y, ease('out-back-soft', settleT));
    } else {
      const c = pointBetween(fromC, toC, travel);
      cx = c.x;
      cy = c.y;
    }
    const w = lerp(from.w, to.w, travel);
    const h = lerp(from.h, to.h, travel);
    const dist = Math.hypot(toC.x - fromC.x, toC.y - fromC.y);
    const arcBase = Math.max(18, Math.min(180, dist * .18));
    const pathArc = path === 'direct' ? 0
      : path === 'snap' ? .08
      : path === 'drop' ? -.18
      : path === 'withdraw' ? .12
      : path === 'overshoot' ? .22
      : .18;
    const arc = Number.isFinite(Number(p.arc)) ? Number(p.arc) : pathArc;
    const lift = Number.isFinite(Number(p.lift)) ? Number(p.lift) : (path === 'direct' ? .04 : .18);
    const liftY = Math.sin(Math.PI * raw) * lift * Math.max(16, h * .30);
    const arcY = Math.sin(Math.PI * raw) * arc * arcBase;
    if(path === 'drop') cy += Math.abs(arcY) * .72;
    else cy -= liftY + arcY;
    return rectFromCenter(cx, cy, w, h);
  }

  function scheduleRender(reason){
    const adapter = window.FateMatchRendererAdapter;
    if(adapter && typeof adapter.scheduleRender === 'function') adapter.scheduleRender(reason || 'vfx-animation');
  }

  function normalizePrimitive(effectId, recipeType, primitive, now){
    const p = Object.assign({}, primitive || {});
    p.id = p.id || ('vfxp:' + effectId + ':' + (nextId++));
    p.effectId = effectId;
    p.recipeType = recipeType;
    p.start = now + (Number(p.startOffset) || 0);
    p.duration = Math.max(1, Number(p.duration) || 360);
    p.easing = p.easing || 'out-cubic';
    p.layer = p.layer || 'effects';
    p.progress = 0;
    p.eased = 0;
    p.done = false;
    if(p.kind === 'cardMove' || p.kind === 'cardImpact' || p.kind === 'cardLift') primeMotionTexture(p);
    return p;
  }

  function keepWithinBudgets(primitives){
    const counts = {cardMove:0, shockwaveRing:0, beam:0, numberPop:0};
    const kept = [];
    primitives.forEach(function(p){
      const kind = p && p.kind;
      if(counts[kind] != null){
        counts[kind]++;
        const limit = kind === 'cardMove' ? VFX_BUDGET.maxCardMotions
          : kind === 'shockwaveRing' ? VFX_BUDGET.maxShockwaves
          : kind === 'beam' ? VFX_BUDGET.maxBeams
          : VFX_BUDGET.maxNumberPops;
        if(counts[kind] > limit){
          droppedEffects++;
          return;
        }
      }
      if(lowEffectsEnabled() && p.priority === 'low'){
        skippedLowPriorityEffects++;
        return;
      }
      kept.push(p);
    });
    return kept;
  }

  function play(type, payload, options){
    const recipeType = String(type || '').toUpperCase();
    if(animationsOff() && recipeType !== 'CONSOLIDATE') return null;
    const recipes = window.FateVfxRecipes;
    if(!recipes || typeof recipes.expand !== 'function' || !recipes.has(recipeType)) return null;
    const now = nowMs();
    const id = 'vfx:' + recipeType + ':' + (nextId++);
    let primitives = recipes.expand(recipeType, payload || {}) || [];
    if(reducedMotionEnabled()){
      primitives = primitives.filter(function(p){
        return ['screenShake', 'screenFlash'].indexOf(p.kind) < 0;
      }).map(function(p){
        const next = Object.assign({}, p);
        if(next.kind === 'cardMove') {
          next.arc = 0;
          next.lift = Math.min(.16, Number(next.lift) || .16);
          next.duration = Math.min(Number(next.duration) || 320, 320);
        }
        if(next.kind === 'particleBurst') next.count = Math.max(1, Math.floor((Number(next.count) || 8) * .18));
        return next;
      });
    }
    const normalized = keepWithinBudgets(primitives.map(function(p){ return normalizePrimitive(id, recipeType, p, now); }));
    normalized.forEach(function(p){
      if(p.kind === 'soundCue' && window.FateVfxAudioSync && typeof window.FateVfxAudioSync.playCue === 'function'){
        window.FateVfxAudioSync.playCue({
          cue:p.cue,
          at:p.start,
          volume:p.volume,
          pitch:p.pitch,
          priority:p.priority
        });
      }
    });
    activeRecipes.push({id, type:recipeType, startedAt:now, payload:payload || {}, primitiveCount:normalized.length});
    activePrimitives = activePrimitives.concat(normalized);
    recentRecipes.unshift({
      id,
      type:recipeType,
      at:Math.round(now),
      primitiveCount:normalized.length,
      payloadSummary:summarizePayload(payload)
    });
    recentRecipes = recentRecipes.slice(0, 18);
    scheduleRender('vfx-' + recipeType.toLowerCase());
    return id;
  }

  function queue(type, payload, options){
    const opts = options || {};
    const delay = Math.max(0, Number(opts.delay) || 0);
    if(!delay) return play(type, payload, options);
    const id = 'vfxq:' + String(type || '').toUpperCase() + ':' + (nextId++);
    setTimeout(function(){ play(type, payload, options); }, delay);
    return id;
  }

  function cancel(id){
    const key = String(id || '');
    const before = activePrimitives.length;
    activePrimitives = activePrimitives.filter(function(p){ return p.effectId !== key && p.id !== key; });
    activeRecipes = activeRecipes.filter(function(r){ return r.id !== key; });
    return before - activePrimitives.length;
  }

  function cancelForCard(iid){
    const key = String(iid == null ? '' : iid);
    if(!key) return 0;
    const before = activePrimitives.length;
    activePrimitives = activePrimitives.filter(function(p){ return String(p.iid == null ? '' : p.iid) !== key; });
    return before - activePrimitives.length;
  }

  function clear(){
    activeRecipes = [];
    activePrimitives = [];
    spawnedParticlePrimitiveIds.clear();
    dragPreview = null;
    if(window.FateVfxParticlePool && typeof window.FateVfxParticlePool.clear === 'function') window.FateVfxParticlePool.clear();
  }

  function summarizePayload(payload){
    const p = payload || {};
    return {
      iid:p.iid || p.targetIid || p.resultCardIid || '',
      card:p.card && p.card.name || p.targetCard && p.targetCard.name || p.resultCard && p.resultCard.name || '',
      tributes:Array.isArray(p.tributes) ? p.tributes.length : 0,
      amount:p.amount || 0
    };
  }

  function tick(now){
    const t = Number(now) || nowMs();
    const dt = lastTickAt ? t - lastTickAt : 16;
    lastTickAt = t;
    const active = [];
    activePrimitives.forEach(function(p){
      const raw = clamp((t - p.start) / p.duration, 0, 1);
      p.progress = raw;
      p.eased = ease(p.easing, raw);
      p.done = raw >= 1;
      if(t >= p.start && p.kind === 'particleBurst' && !spawnedParticlePrimitiveIds.has(p.id)){
        spawnedParticlePrimitiveIds.add(p.id);
        spawnParticleBurst(p);
      }
      if(!p.done || t < p.start) active.push(p);
    });
    activePrimitives = active;
    activeRecipes = activeRecipes.filter(function(recipe){
      return activePrimitives.some(function(p){ return p.effectId === recipe.id; });
    });
    if(window.FateVfxParticlePool && typeof window.FateVfxParticlePool.tick === 'function') window.FateVfxParticlePool.tick(dt);
    return {
      activeRecipes:activeRecipes.length,
      activePrimitives:activePrimitives.length,
      activeParticles:window.FateVfxParticlePool && window.FateVfxParticlePool.active ? window.FateVfxParticlePool.active.length : 0
    };
  }

  function spawnParticleBurst(p){
    const pool = window.FateVfxParticlePool;
    if(!pool || typeof pool.burst !== 'function') return 0;
    return pool.burst({
      x:Number(p.x) || center(p.rect || p.targetRect).x,
      y:Number(p.y) || center(p.rect || p.targetRect).y,
      count:p.count,
      color:p.color,
      speed:p.speed,
      spread:p.spread,
      gravity:p.gravity,
      life:p.life,
      size:p.size,
      kind:p.particleKind || 'spark'
    });
  }

  function activeAtDraw(p){
    return p && p.progress >= 0 && p.progress <= 1 && nowMs() >= p.start;
  }

  function activeScreenShakeOffset(){
    let x = 0;
    let y = 0;
    activePrimitives.forEach(function(p){
      if(!p || p.kind !== 'screenShake' || !activeAtDraw(p) || reducedMotionEnabled()) return;
      const amp = (Number(p.amplitude) || 4) * (1 - p.progress);
      const pulse = Math.sin(p.progress * Math.PI * 18);
      x += pulse * amp;
      y += Math.cos(p.progress * Math.PI * 14) * amp * .55;
    });
    return {x, y};
  }

  function drawCardBack(ctx, r){
    if(!ctx || !r) return;
    ctx.save();
    const grd = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    grd.addColorStop(0, '#1b1f2d');
    grd.addColorStop(.5, '#10131d');
    grd.addColorStop(1, '#312416');
    ctx.fillStyle = grd;
    rounded(ctx, r.x, r.y, r.w, r.h, Math.max(7, r.w * .055));
    ctx.fill();
    ctx.strokeStyle = 'rgba(247,210,116,.82)';
    ctx.lineWidth = Math.max(1.2, r.w * .018);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,232,154,.88)';
    ctx.font = '900 ' + Math.max(18, Math.round(r.w * .24)) + 'px Cinzel, Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FE', r.x + r.w / 2, r.y + r.h / 2);
    ctx.restore();
  }

  function rounded(ctx, x, y, w, h, radius){
    const r = Math.min(radius || 8, w / 2, h / 2);
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else {
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
    }
  }

  function drawCard(ctx, card, r, options){
    const opts = options || {};
    if(!ctx || !r) return;
    if(opts.faceDown || !card){
      drawCardBack(ctx, r);
      return;
    }
    const visual = (card && card.visual) || card;
    const textureSize = rect(opts.textureSize) || r;
    const texture = window.FateCardTextureCache && typeof window.FateCardTextureCache.getBaseCardTexture === 'function'
      ? window.FateCardTextureCache.getBaseCardTexture(card, {w:textureSize.w, h:textureSize.h}, {
        visual,
        dpr:Number(opts.textureDpr) || Math.min(1.25, Math.max(1, window.devicePixelRatio || 1)),
        preferFullArt:true,
        source:'vfx-card',
        onChange:function(){ scheduleRender('vfx-texture-ready'); }
      })
      : null;
    if(texture && texture.loaded && texture.canvas){
      try {
        ctx.drawImage(texture.canvas, r.x, r.y, r.w, r.h);
        return;
      } catch(e) {}
    }
    ctx.save();
    const grd = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    grd.addColorStop(0, '#20293d');
    grd.addColorStop(1, '#10131d');
    ctx.fillStyle = grd;
    rounded(ctx, r.x, r.y, r.w, r.h, Math.max(7, r.w * .055));
    ctx.fill();
    ctx.strokeStyle = 'rgba(247,210,116,.7)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,244,204,.86)';
    ctx.font = '800 ' + Math.max(11, Math.round(r.w * .11)) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(visual && visual.name || 'Card').slice(0, 18), r.x + r.w / 2, r.y + r.h / 2);
    ctx.restore();
  }

  function stableMotionTextureSize(p, fallback){
    const from = rect(p && p.fromRect);
    const to = rect(p && p.toRect);
    const base = rect(p && (p.textureRect || p.rect)) || to || from || fallback;
    if(!base) return fallback;
    const w = Math.max(
      1,
      Math.round(Math.max(Number(base.w) || 0, from ? from.w : 0, to ? to.w : 0))
    );
    const h = Math.max(
      1,
      Math.round(Math.max(Number(base.h) || 0, from ? from.h : 0, to ? to.h : 0))
    );
    return {x:0, y:0, w, h};
  }

  function primeMotionTexture(p){
    if(!p || !p.card || p.faceDown) return;
    if(!window.FateCardTextureCache || typeof window.FateCardTextureCache.getBaseCardTexture !== 'function') return;
    const size = stableMotionTextureSize(p, rect(p.toRect || p.rect || p.fromRect));
    if(!size) return;
    p.textureSize = size;
    try {
      window.FateCardTextureCache.getBaseCardTexture(p.card, {w:size.w, h:size.h}, {
        visual:(p.card && p.card.visual) || p.card,
        dpr:Math.min(1.25, Math.max(1, window.devicePixelRatio || 1)),
        preferFullArt:true,
        source:'vfx-card-prime',
        onChange:function(){ scheduleRender('vfx-texture-ready'); }
      });
    } catch(e) {}
  }

  function drawGlowRect(ctx, r, color, alpha){
    if(!ctx || !r) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = color || 'rgba(255,220,120,1)';
    ctx.shadowBlur = lowEffectsEnabled() ? 0 : Math.max(14, r.w * .18);
    ctx.strokeStyle = color || 'rgba(255,220,120,.8)';
    ctx.lineWidth = Math.max(2, r.w * .025);
    rounded(ctx, r.x - 2, r.y - 2, r.w + 4, r.h + 4, Math.max(8, r.w * .06));
    ctx.stroke();
    ctx.restore();
  }

  function drawCardMotionShadow(ctx, r, raw, liftAmount){
    if(!ctx || !r) return;
    const lift = clamp(Number(liftAmount) || 0, 0, 1);
    const alpha = Math.max(.10, .28 - lift * .12) * (1 - Math.max(0, Math.abs(raw - .5) - .42) * 2);
    const shadowW = r.w * (1.04 + lift * .22);
    const shadowH = Math.max(6, r.h * (.075 + lift * .025));
    const x = r.x + r.w / 2;
    const y = r.y + r.h - shadowH * .22 + lift * r.h * .10;
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, .34);
    ctx.fillStyle = 'rgba(0,0,0,.34)';
    ctx.beginPath();
    ctx.ellipse(x, y, shadowW / 2, shadowH / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPrimitive(ctx, p, metrics){
    if(!ctx || !p || !activeAtDraw(p)) return;
    const t = p.eased;
    if(p.kind === 'boardDim'){
      const alpha = (Number(p.alpha) || .24) * Math.sin(Math.PI * p.progress);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,' + clamp(alpha, 0, .65) + ')';
      ctx.fillRect(0, 0, metrics.cssW, metrics.cssH);
      ctx.restore();
      return;
    }
    if(p.kind === 'screenFlash'){
      if(lowEffectsEnabled() && p.priority !== 'high') return;
      const alpha = (Number(p.alpha) || .14) * (1 - p.progress);
      ctx.save();
      ctx.fillStyle = p.color || 'rgba(255,255,255,1)';
      ctx.globalAlpha = clamp(alpha, 0, .4);
      ctx.fillRect(0, 0, metrics.cssW, metrics.cssH);
      ctx.restore();
      return;
    }
    if(p.kind === 'spotlight'){
      const r = rect(p.rect);
      if(!r) return;
      const c = center(r);
      const radius = Math.max(r.w, r.h) + (Number(p.feather) || 50);
      const alpha = .26 * Math.sin(Math.PI * p.progress);
      ctx.save();
      const grd = ctx.createRadialGradient(c.x, c.y, Math.max(10, Math.min(r.w, r.h) * .35), c.x, c.y, radius);
      grd.addColorStop(0, 'rgba(255,232,160,' + alpha + ')');
      grd.addColorStop(.52, 'rgba(255,232,160,' + alpha * .22 + ')');
      grd.addColorStop(1, 'rgba(255,232,160,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(c.x - radius, c.y - radius, radius * 2, radius * 2);
      ctx.restore();
      return;
    }
    if(p.kind === 'cardGlow' || p.kind === 'pilePulse' || p.kind === 'handFanPulse'){
      const r = rect(p.rect);
      drawGlowRect(ctx, r, p.color, Math.sin(Math.PI * p.progress));
      return;
    }
    if(p.kind === 'cardTrail'){
      const from = rect(p.fromRect);
      const to = rect(p.toRect);
      if(!from || !to) return;
      const steps = Math.max(2, Math.min(8, Number(p.steps) || 5));
      ctx.save();
      for(let i = 0; i < steps; i++){
        const f = (i + 1) / (steps + 1);
        const rr = lerpRect(from, to, Math.max(0, t - f * .08));
        if(!rr) continue;
        ctx.globalAlpha = (1 - f) * .22 * Math.sin(Math.PI * p.progress);
        drawGlowRect(ctx, rr, p.color || 'rgba(255,225,120,.78)', 1);
      }
      ctx.restore();
      return;
    }
    if(p.kind === 'shockwaveRing'){
      const rs = Number(p.radiusStart) || 8;
      const re = Number(p.radiusEnd) || 80;
      const radius = lerp(rs, re, t);
      const alpha = 1 - p.progress;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = p.color || 'rgba(255,225,120,.9)';
      ctx.lineWidth = (Number(p.lineWidth) || 3) * (1 - p.progress * .45);
      if(p.glow && !lowEffectsEnabled()){
        ctx.shadowColor = p.color || 'rgba(255,225,120,1)';
        ctx.shadowBlur = 18;
      }
      ctx.beginPath();
      ctx.arc(Number(p.x) || 0, Number(p.y) || 0, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if(p.kind === 'beam'){
      const from = p.from || center(p.fromRect);
      const to = p.to || center(p.toRect);
      const pulse = .55 + Math.sin(p.progress * Math.PI) * .45;
      ctx.save();
      ctx.globalAlpha = (1 - Math.abs(p.progress - .5) * 1.2);
      ctx.strokeStyle = p.color || 'rgba(120,210,255,.9)';
      ctx.lineWidth = (Number(p.width) || 5) * pulse;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(lerp(from.x, to.x, t), lerp(from.y, to.y, t));
      ctx.stroke();
      ctx.restore();
      return;
    }
    if(p.kind === 'statusIconPop'){
      const r = rect(p.rect);
      if(!r) return;
      const text = String(p.text || '');
      const fade = Math.sin(Math.PI * p.progress);
      const hold = p.progress > .16 && p.progress < .78 ? 1 : fade;
      const fontSize = Math.max(12, Math.min(18, Math.round(r.w * .05)));
      const boxW = Math.max(250, Math.min(470, text.length * fontSize * .62 + 62));
      const boxH = Math.max(48, fontSize + 30);
      const x = r.x + r.w / 2 - boxW / 2;
      const y = r.y + r.h * .20 - boxH / 2 - (Number(p.rise) || 18) * p.progress;
      ctx.save();
      ctx.globalAlpha = clamp(hold, 0, 1);
      roundedPath(ctx, x, y, boxW, boxH, 7);
      const bg = ctx.createLinearGradient(x, y, x, y + boxH);
      bg.addColorStop(0, 'rgba(20,18,28,.98)');
      bg.addColorStop(.46, 'rgba(8,9,16,.98)');
      bg.addColorStop(1, 'rgba(2,3,8,.96)');
      ctx.shadowColor = p.color || 'rgba(255,158,165,.62)';
      ctx.shadowBlur = 18;
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.55;
      ctx.strokeStyle = p.color || 'rgba(255,158,165,.86)';
      ctx.stroke();
      ctx.save();
      ctx.globalAlpha = .72;
      ctx.strokeStyle = 'rgba(255,238,176,.42)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 16, y + 9);
      ctx.lineTo(x + 58, y + 9);
      ctx.moveTo(x + boxW - 58, y + boxH - 9);
      ctx.lineTo(x + boxW - 16, y + boxH - 9);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = p.color || '#ff9ea5';
      ctx.font = '800 ' + fontSize + 'px Cinzel, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,.88)';
      ctx.shadowBlur = 5;
      ctx.fillText(text, x + boxW / 2, y + boxH / 2 + 1, boxW - 28);
      ctx.restore();
      return;
    }
    if(p.kind === 'numberPop'){
      const r = rect(p.rect);
      if(!r) return;
      const text = String(p.text || '');
      const isFateDelta = p.theme === 'fate-delta' || p.theme === 'fate-loss' || p.theme === 'fate-gain' || /^[-+]/.test(text);
      const isLoss = p.theme === 'fate-loss' || /^-/.test(text);
      const rise = Number(p.rise) || (isFateDelta ? Math.max(42, r.h * .34) : 38);
      const hold = isFateDelta
        ? (p.progress < .06 ? (p.progress / .06) : (p.progress > .88 ? (1 - p.progress) / .12 : 1))
        : Math.sin(Math.PI * p.progress);
      const pop = isFateDelta ? Math.min(1, p.progress / .18) : p.progress;
      const scale = isFateDelta
        ? (.72 + ease('out-back-soft', pop) * .38 - Math.max(0, p.progress - .36) * .06)
        : (1 + Math.sin(Math.PI * p.progress) * .18);
      const x = isFateDelta ? (r.x + r.w * .82) : (r.x + r.w / 2);
      const y = isFateDelta ? (r.y - 8 - rise * t) : (r.y + r.h * .22 - rise * t);
      const color = p.color || (isFateDelta ? (isLoss ? '#ff6060' : '#7fff90') : '#ffe37a');
      const glow = isFateDelta ? (isLoss ? 'rgba(255,96,96,.62)' : 'rgba(127,255,144,.62)') : 'rgba(255,226,105,.28)';
      ctx.save();
      ctx.globalAlpha = clamp(hold, 0, 1);
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.fillStyle = color;
      ctx.strokeStyle = isFateDelta ? 'rgba(0,0,0,.92)' : 'rgba(0,0,0,.82)';
      ctx.lineWidth = isFateDelta ? Math.max(5, Math.round(r.w * .04)) : 4;
      ctx.shadowColor = glow;
      ctx.shadowBlur = isFateDelta ? Math.max(12, r.w * .10) : 0;
      ctx.font = '950 ' + Math.max(24, Math.round(r.w * (isFateDelta ? .255 : .17))) + 'px Cinzel, Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeText(text, 0, 0);
      ctx.fillText(text, 0, 0);
      if(isFateDelta){
        ctx.shadowBlur = 0;
        ctx.globalAlpha *= .55;
        ctx.strokeStyle = isLoss ? 'rgba(255,190,196,.80)' : 'rgba(210,255,220,.80)';
        ctx.lineWidth = 1.2;
        ctx.strokeText(text, 0, 0);
      }
      ctx.restore();
      return;
    }
    if(p.kind === 'cardMove' || p.kind === 'cardDissolve' || p.kind === 'cardLift'){
      const raw = clamp(Number(p.progress) || 0, 0, 1);
      const holdPortion = p.kind === 'cardMove' ? clamp((Number(p.holdMs) || 0) / Math.max(1, Number(p.duration) || 1), 0, .38) : 0;
      const moveRaw = holdPortion ? clamp(raw / Math.max(.001, 1 - holdPortion), 0, 1) : raw;
      const moveEase = holdPortion ? ease(p.easing || 'out-cubic', moveRaw) : t;
      let rr = p.kind === 'cardMove' ? cardMoveRect(p, moveRaw, moveEase) : lerpRect(p.fromRect, p.toRect, t);
      if(!rr) rr = rect(p.rect);
      if(!rr) return;
      const liftFactor = p.kind === 'cardLift' ? (Number(p.lift) || .18) : (Number(p.lift) || .35);
      if(p.kind !== 'cardMove'){
        const lift = Math.sin(Math.PI * raw) * liftFactor * Math.max(20, rr.h * .34);
        const arc = Math.sin(Math.PI * raw) * (Number(p.arc) || 0) * Math.max(20, rr.h * .22);
        rr.y -= lift + arc;
      }
      const settleStart = clamp(1 - ((Number(p.settleMs) || 0) / Math.max(1, Number(p.duration) || 1)), .52, 1);
      const settleT = raw > settleStart ? clamp((raw - settleStart) / Math.max(.001, 1 - settleStart), 0, 1) : 0;
      const rotation = lerp(
        (Number(p.startRotate) || 0),
        (Number(p.endRotate) || 0),
        t
      ) * Math.PI / 180 + (Number(p.rotate) || 0) * Math.PI / 180 * Math.sin(Math.PI * raw) * (1 - settleT * .7);
      const peakScale = Number(p.scale) || 1;
      const endScale = Number(p.endScale) || 1;
      let scale = lerp(1, peakScale, Math.sin(Math.PI * raw));
      if(raw > .72) scale = lerp(scale, endScale, clamp((raw - .72) / .28, 0, 1));
      if(p.settleMs) scale += Math.sin(Math.PI * settleT) * .018;
      ctx.save();
      let alpha = 1;
      if(p.fadeIn) alpha *= clamp(raw / .18, 0, 1);
      if(p.fadeOutLate) alpha *= raw < .58 ? 1 : Math.max(0, 1 - ((raw - .58) / .42) * .95);
      else if(p.kind === 'cardDissolve' || p.fadeOut) alpha *= Math.max(0, 1 - raw * .92);
      ctx.globalAlpha = alpha;
      if(p.kind === 'cardMove') drawCardMotionShadow(ctx, rr, raw, Math.sin(Math.PI * raw));
      ctx.translate(rr.x + rr.w / 2, rr.y + rr.h / 2);
      ctx.rotate(rotation);
      ctx.scale(scale, scale);
      drawCard(ctx, p.card, {x:-rr.w / 2, y:-rr.h / 2, w:rr.w, h:rr.h}, {faceDown:p.faceDown, textureSize:p.textureSize || stableMotionTextureSize(p, rr)});
      ctx.restore();
      return;
    }
    if(p.kind === 'cardFlip' || p.kind === 'cardSummon'){
      const r = rect(p.rect || p.toRect || p.fromRect);
      if(!r) return;
      const sx = p.kind === 'cardFlip' ? Math.max(.05, Math.abs(Math.cos(Math.PI * p.progress))) : (.82 + Math.sin(Math.PI * p.progress) * .24);
      ctx.save();
      ctx.globalAlpha = p.kind === 'cardSummon' ? Math.sin(Math.PI * Math.min(1, p.progress + .18)) : 1;
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
      ctx.scale(sx, .98 + Math.sin(Math.PI * p.progress) * .04);
      drawCard(ctx, p.card, {x:-r.w / 2, y:-r.h / 2, w:r.w, h:r.h}, {faceDown:p.kind === 'cardFlip' && p.progress < .5});
      ctx.restore();
      if(!p.noGlow) drawGlowRect(ctx, r, p.color || 'rgba(255,232,150,.82)', Math.sin(Math.PI * p.progress) * .8);
      return;
    }
    if(p.kind === 'cardImpact'){
      const r = rect(p.rect || p.targetRect || p.toRect);
      if(!r) return;
      const amp = Number(p.amplitude) || .055;
      const hit = Math.sin(Math.PI * p.progress);
      const settle = Math.sin(Math.PI * Math.min(1, p.progress * 1.45));
      const sx = 1 + amp * hit;
      const sy = 1 - amp * .55 * settle;
      ctx.save();
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
      ctx.scale(sx, sy);
      if(p.card || p.faceDown) {
        drawCard(ctx, p.card || null, {x:-r.w / 2, y:-r.h / 2, w:r.w, h:r.h}, {faceDown:p.faceDown, textureSize:p.textureSize || stableMotionTextureSize(p, r)});
      } else {
        const rr = {x:-r.w / 2, y:-r.h / 2, w:r.w, h:r.h};
        roundedPath(ctx, rr.x + 2, rr.y + 2, Math.max(1, rr.w - 4), Math.max(1, rr.h - 4), Math.max(6, rr.w * .045));
        ctx.globalAlpha = Math.max(.18, .44 * (1 - p.progress));
        ctx.strokeStyle = p.color || 'rgba(255,232,150,.62)';
        ctx.lineWidth = Math.max(1.5, Math.min(3.5, rr.w * .018));
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    if(p.kind === 'cardShake'){
      const r = rect(p.rect);
      if(!r) return;
      const amp = (Number(p.amplitude) || 5) * (1 - p.progress);
      drawGlowRect(ctx, {x:r.x + Math.sin(p.progress * Math.PI * 12) * amp, y:r.y, w:r.w, h:r.h}, 'rgba(255,95,95,.8)', Math.sin(Math.PI * p.progress));
    }
  }

  function drawDragPreview(ctx){
    if(!ctx || !dragPreview) return false;
    const r = rect(dragPreview.rect);
    if(!r) return false;
    const scale = Number(dragPreview.scale) || 1;
    const w = r.w * scale;
    const h = r.h * scale;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
    ctx.rotate((dragPreview.invalid ? -2 : 1.2) * Math.PI / 180);
    drawCardMotionShadow(ctx, {x:-w / 2, y:-h / 2, w, h}, .32, .18);
    drawCard(ctx, dragPreview.card, {x:-w / 2, y:-h / 2, w, h}, {textureDpr:2});
    ctx.restore();
    return true;
  }

  function draw(options){
    const opts = options || {};
    const started = nowMs();
    if(animationsOff()){
      activePrimitives = activePrimitives.filter(function(p){ return p && p.recipeType === 'CONSOLIDATE'; });
      activeRecipes = activeRecipes.filter(function(r){ return r && r.type === 'CONSOLIDATE'; });
      dragPreview = null;
    }
    const metrics = {
      cssW:Number(opts.cssW) || 1,
      cssH:Number(opts.cssH) || 1,
      dpr:Number(opts.dpr) || 1
    };
    tick(started);
    const effectsCtx = opts.effectsCtx || null;
    const particleCtx = opts.particleCtx || null;
    if(effectsCtx){
      const shake = activeScreenShakeOffset();
      effectsCtx.save();
      effectsCtx.translate(shake.x, shake.y);
      activePrimitives.forEach(function(p){
        if(p.layer === 'audio' || p.layer === 'control' || p.kind === 'particleBurst' || p.kind === 'screenShake') return;
        drawPrimitive(effectsCtx, p, metrics);
      });
      drawDragPreview(effectsCtx);
      effectsCtx.restore();
    }
    if(particleCtx && window.FateVfxParticlePool && typeof window.FateVfxParticlePool.draw === 'function'){
      window.FateVfxParticlePool.draw(particleCtx);
    }
    draws++;
    lastVfxMs = nowMs() - started;
    maxVfxMs = Math.max(maxVfxMs, lastVfxMs);
    vfxMsSamples.push(lastVfxMs);
    while(vfxMsSamples.length > 36) vfxMsSamples.shift();
    if(hasActiveEffects()) scheduleRender('vfx-animation');
    return report();
  }

  function hasActiveEffects(){
    const particles = window.FateVfxParticlePool && window.FateVfxParticlePool.active ? window.FateVfxParticlePool.active.length : 0;
    return activePrimitives.length > 0 || particles > 0 || !!dragPreview;
  }

  function setLowEffectsMode(enabled){
    lowEffectsMode = !!enabled;
    try {
      if(enabled) localStorage.setItem('fateLowEffects', '1');
      else localStorage.removeItem('fateLowEffects');
    } catch(e) {}
    if(document && document.documentElement) document.documentElement.classList.toggle('fate-low-effects', !!enabled);
    scheduleRender('vfx-low-effects-mode');
    return report();
  }

  function setReducedMotionMode(enabled){
    try {
      if(enabled) localStorage.setItem('fateReducedMotion', '1');
      else localStorage.removeItem('fateReducedMotion');
    } catch(e) {}
    if(document && document.documentElement) document.documentElement.classList.toggle('fate-reduced-motion', !!enabled);
    scheduleRender('vfx-reduced-motion-mode');
    return report();
  }

  function avgVfxMs(){
    if(!vfxMsSamples.length) return 0;
    return vfxMsSamples.reduce(function(total, ms){ return total + ms; }, 0) / vfxMsSamples.length;
  }

  function countKind(kind){
    return activePrimitives.filter(function(p){ return p.kind === kind; }).length;
  }

  function domGhostCount(){
    try {
      return document.querySelectorAll('.fate-v2-motion-card, #fate-v2-drag-ghost, .fate-v2-canvas-drag-ghost').length;
    } catch(e) {
      return 0;
    }
  }

  function report(){
    const pool = window.FateVfxParticlePool && typeof window.FateVfxParticlePool.report === 'function'
      ? window.FateVfxParticlePool.report()
      : {active:0, lastParticleMs:0, particlesAllocated:0, particlesReused:0, droppedEffects:0};
    const recipeNames = window.FateVfxRecipes && typeof window.FateVfxRecipes.names === 'function' ? window.FateVfxRecipes.names() : [];
    const recipeKinds = window.FateVfxRecipes && typeof window.FateVfxRecipes.describe === 'function' ? window.FateVfxRecipes.describe() : {};
    const texture = window.FateCardTextureCache && typeof window.FateCardTextureCache.report === 'function' ? window.FateCardTextureCache.report() : null;
    const primitives = window.FateVfxPrimitives && typeof window.FateVfxPrimitives.report === 'function'
      ? window.FateVfxPrimitives.report()
      : null;
    return {
      available:true,
      version:VERSION,
      mode:{
        rendererV2:!!(window.FateMatchRendererAdapter && window.FateMatchRendererAdapter.ownsBoard && window.FateMatchRendererAdapter.ownsBoard()),
        lowEffects:lowEffectsEnabled(),
        reducedMotion:reducedMotionEnabled()
      },
      capabilities:{
        lowEffectsToggle:true,
        reducedMotionToggle:true,
        dirtyLayerVfx:true,
        particleBudget:true,
        audioSync:!!window.FateVfxAudioSync,
        primitiveReport:!!primitives
      },
      ownership:{
        domGhostsAllowed:false,
        domGhostsActive:domGhostCount(),
        usesCanvasEffects:true,
        usesDomMotionFallback:false,
        mirrorsToAnimationTimeline:false
      },
      active:{
        recipes:activeRecipes.length,
        primitives:activePrimitives.length,
        particles:pool.active || 0,
        cardMoves:countKind('cardMove') + (dragPreview ? 1 : 0),
        beams:countKind('beam'),
        shockwaves:countKind('shockwaveRing'),
        numberPops:countKind('numberPop')
      },
      performance:{
        lastVfxMs:Math.round(lastVfxMs * 10) / 10,
        avgVfxMs:Math.round(avgVfxMs() * 10) / 10,
        maxVfxMs:Math.round(maxVfxMs * 10) / 10,
        lastParticleMs:pool.lastParticleMs || 0,
        particlesAllocated:pool.particlesAllocated || 0,
        particlesReused:pool.particlesReused || 0,
        droppedEffects:droppedEffects + (pool.droppedEffects || 0),
        skippedLowPriorityEffects,
        draws,
        budgetMs:lowEffectsEnabled() ? VFX_BUDGET.maxVfxMsLow : VFX_BUDGET.maxVfxMs
      },
      recipes:{
        registered:recipeNames,
        registeredCount:recipeNames.length,
        primitiveKinds:recipeKinds
      },
      primitives,
      recent:{
        lastRecipe:recentRecipes[0] ? recentRecipes[0].type : '',
        lastRecipePayloadSummary:recentRecipes[0] ? recentRecipes[0].payloadSummary : null,
        recentRecipes:recentRecipes.slice(0, 10)
      },
      eventBridge:{
        acceptedGameEvents:eventBridgeStats.acceptedGameEvents,
        localIntents:eventBridgeStats.localIntents,
        promptsCreated:eventBridgeStats.promptsCreated,
        promptsResolved:eventBridgeStats.promptsResolved,
        stateDiffs:eventBridgeStats.stateDiffs,
        byType:Object.assign({}, eventBridgeStats.byType),
        recent:eventBridgeStats.recent.slice(0, 10)
      },
      textureCache:texture ? {
        baseHits:texture.baseHits,
        baseMisses:texture.baseMisses,
        baseRequests:texture.baseRequests,
        hitRate:texture.baseRequests ? Math.round((texture.baseHits / texture.baseRequests) * 1000) / 10 : null
      } : null,
      pass:domGhostCount() === 0,
      blockers:domGhostCount() === 0 ? [] : ['dom-ghosts-active']
    };
  }

  function setDragPreview(payload){
    dragPreview = Object.assign({}, payload || {});
    scheduleRender('vfx-drag-preview');
    return true;
  }

  function updateDragPreview(payload){
    if(!dragPreview) dragPreview = {};
    Object.assign(dragPreview, payload || {});
    scheduleRender('vfx-drag-preview');
    return true;
  }

  function clearDragPreview(){
    dragPreview = null;
    scheduleRender('vfx-drag-preview-clear');
  }

  function recordBridge(kind, type, payload){
    const eventType = String(type || '').toUpperCase();
    eventBridgeStats[kind] = (Number(eventBridgeStats[kind]) || 0) + 1;
    if(eventType) eventBridgeStats.byType[eventType] = (eventBridgeStats.byType[eventType] || 0) + 1;
    eventBridgeStats.recent.unshift({
      kind,
      type:eventType,
      at:Math.round(nowMs()),
      payloadSummary:summarizePayload(payload)
    });
    eventBridgeStats.recent = eventBridgeStats.recent.slice(0, 18);
  }

  window.FateVfxDirector = {
    version:VERSION,
    budgets:VFX_BUDGET,
    play,
    queue,
    cancel,
    cancelForCard,
    clear,
    tick,
    draw,
    hasActiveEffects,
    setLowEffectsMode,
    setReducedMotionMode,
    report,
    getRecentRecipes:function(){ return recentRecipes.slice(); },
    setDragPreview,
    updateDragPreview,
    clearDragPreview
  };

  window.FateVfxEventBridge = {
    onAcceptedGameEvent:function(event){
      if(!event) return null;
      recordBridge('acceptedGameEvents', event.type, event.payload || event);
      return play(event.type, event.payload || event, event.options || {});
    },
    onLocalIntent:function(intent){
      if(!intent) return null;
      recordBridge('localIntents', intent.type, intent.payload || intent);
      return play(intent.type, intent.payload || intent, intent.options || {});
    },
    onPromptCreated:function(prompt){
      if(!prompt) return null;
      recordBridge('promptsCreated', 'SUPPORTER_ACTIVATE', prompt);
      return play('SUPPORTER_ACTIVATE', prompt);
    },
    onPromptResolved:function(prompt, choice){
      if(!prompt) return null;
      recordBridge('promptsResolved', 'SUPPORTER_ACTIVATE', Object.assign({}, prompt, {choice}));
      return play('SUPPORTER_ACTIVATE', Object.assign({}, prompt, {choice}));
    },
    onStateDiff:function(diff){
      if(!diff) return null;
      if(diff.fateDelta > 0) {
        recordBridge('stateDiffs', 'FATE_GAIN', diff);
        return play('FATE_GAIN', diff);
      }
      if(diff.fateDelta < 0) {
        const payload = Object.assign({}, diff, {amount:Math.abs(diff.fateDelta)});
        recordBridge('stateDiffs', 'FATE_LOSS', payload);
        return play('FATE_LOSS', payload);
      }
      return null;
    },
    report:function(){
      return {
        available:true,
        acceptedGameEvents:eventBridgeStats.acceptedGameEvents,
        localIntents:eventBridgeStats.localIntents,
        promptsCreated:eventBridgeStats.promptsCreated,
        promptsResolved:eventBridgeStats.promptsResolved,
        stateDiffs:eventBridgeStats.stateDiffs,
        byType:Object.assign({}, eventBridgeStats.byType),
        recent:eventBridgeStats.recent.slice(0, 10)
      };
    }
  };

  window.fateVfxReport = report;
  window.fateVfxSetLowEffectsMode = setLowEffectsMode;
  window.fateVfxSetReducedMotionMode = setReducedMotionMode;
  window.fateVfxEventBridgeReport = window.FateVfxEventBridge.report;
})();
