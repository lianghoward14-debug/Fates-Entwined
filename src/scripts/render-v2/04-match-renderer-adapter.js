(function(){
  'use strict';

  if(typeof window === 'undefined') return;
  if(window.FateMatchRendererAdapter) return;

  const ADAPTER_VERSION = 1;
  const canvasId = 'fate-match-v2-canvas';
  const backgroundCanvasId = 'fate-match-v2-background-canvas';
  const cardCanvasId = canvasId;
  const effectCanvasId = 'fate-match-v2-effect-canvas';
  const particleCanvasId = 'fate-match-v2-particle-canvas';
  const uiCanvasId = 'fate-match-v2-ui-canvas';
  const hoverCanvasId = 'fate-match-v2-hover-canvas';
  const layerIds = [backgroundCanvasId, cardCanvasId, effectCanvasId, particleCanvasId, uiCanvasId, hoverCanvasId];
  let drawCount = 0;
  let lastReport = {available:false, reason:'not-rendered', version:ADAPTER_VERSION};
  let lastHitMap = {cards:[], cells:[], handCards:[], opponentHandCards:[], piles:[], uiCommands:[]};
  let lastCardFateByIid = new Map();
  let lastCardRectByIid = new Map();
  let pendingPlacementRectByIid = new Map();
  let vfxHiddenBoardCardUntilByIid = new Map();
  let assetImageCache = new Map();
  let lastMoveSnapshotSignature = '';
  let input = null;
  let hoverHit = null;
  let redrawRaf = 0;
  let hoverRaf = 0;
  let pendingDirtyMask = 0;
  let pendingDirtySources = [];
  const pendingTextureTimers = {};
  let lastCanvasMetrics = null;
  let renderScale = 1;
  let lastScaleChangeMs = 0;
  let lastGameplayBurstMs = 0;
  let lastRafCallbackMs = 0;
  let rafLongIdleGaps = 0;
  const frameMsSamples = [];
  const rafGapSamples = [];
  const FRAME_SAMPLE_LIMIT = 36;
  const MIN_RENDER_SCALE = .84;
  const MAX_RENDER_SCALE = 1;
  const renderCounters = {
    fullSceneRedraws:0,
    dirtyDraws:0,
    backgroundLayerRedraws:0,
    cardLayerRedraws:0,
    effectLayerRedraws:0,
    particleLayerRedraws:0,
    uiLayerRedraws:0,
    hoverLayerRedraws:0,
    hoverOnlyDraws:0,
    vfxOnlyDraws:0,
    vfxFullSceneFallbacks:0,
    lastVfxLayerOnly:false,
    lastDirtyMask:0,
    lastDirtySource:''
  };
  const DIRTY_LAYOUT = 1 << 0;
  const DIRTY_BACKGROUND = 1 << 1;
  const DIRTY_BOARD_CARDS = 1 << 2;
  const DIRTY_HAND = 1 << 3;
  const DIRTY_OPP_HAND = 1 << 4;
  const DIRTY_PILES = 1 << 5;
  const DIRTY_EFFECTS = 1 << 6;
  const DIRTY_HOVER = 1 << 7;
  const DIRTY_MOTION = 1 << 8;
  const DIRTY_PARTICLES = 1 << 9;
  const DIRTY_ALL = 0xffff;

  function nowMs(){
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function roundMs(value){
    return Math.round((Number(value) || 0) * 10) / 10;
  }

  function clamp(value, min, max){
    return Math.max(min, Math.min(max, value));
  }

  function params(){
    try { return new URLSearchParams(window.location.search || ''); }
    catch(e) { return new URLSearchParams(''); }
  }

  function localGet(key){
    try { return localStorage.getItem(key); }
    catch(e) { return null; }
  }

  function localSet(key, value){
    try {
      if(value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch(e) {}
  }

  function ownsBoard(){
    const p = params();
    if(p.has('domBoard')) return false;
    if(p.get('matchRendererV2') === '0') return false;
    if(localGet('fateDisableMatchRendererV2') === '1') return false;
    if(p.get('matchRendererV2') === '1') return true;
    return true;
  }

  function ownsHand(){
    return ownsBoard();
  }

  function ownsOpponentHand(){
    return ownsBoard();
  }

  function ownsPiles(){
    return ownsBoard();
  }

  function getMaxDpr(){
    const lowEffects = document.documentElement.classList.contains('fate-low-effects');
    const raw = lowEffects ? 1.35 : 2;
    return Math.max(1, raw);
  }

  function getRenderScaleMetrics(){
    const rawDpr = Math.max(1, Number(window.devicePixelRatio || 1));
    const maxDpr = getMaxDpr();
    const baseDpr = clamp(rawDpr, 1, maxDpr);
    return {
      rawDpr,
      maxDpr,
      renderScale,
      effectiveDpr:Math.max(.7, baseDpr * renderScale)
    };
  }

  function averageFrameMs(){
    if(!frameMsSamples.length) return 0;
    return frameMsSamples.reduce(function(total, ms){ return total + ms; }, 0) / frameMsSamples.length;
  }

  function maxFrameMs(){
    return frameMsSamples.reduce(function(max, ms){ return Math.max(max, ms); }, 0);
  }

  function averageRafGapMs(){
    if(!rafGapSamples.length) return 0;
    return rafGapSamples.reduce(function(total, ms){ return total + ms; }, 0) / rafGapSamples.length;
  }

  function maxRafGapMs(){
    return rafGapSamples.reduce(function(max, ms){ return Math.max(max, ms); }, 0);
  }

  function recordFrameMs(ms){
    const value = Number(ms) || 0;
    frameMsSamples.push(value);
    while(frameMsSamples.length > FRAME_SAMPLE_LIMIT) frameMsSamples.shift();
  }

  function recordRafGap(){
    const now = nowMs();
    if(lastRafCallbackMs) {
      const gap = Math.max(0, now - lastRafCallbackMs);
      if(gap <= 500) {
        rafGapSamples.push(gap);
        while(rafGapSamples.length > FRAME_SAMPLE_LIMIT) rafGapSamples.shift();
      } else {
        rafLongIdleGaps++;
      }
    }
    lastRafCallbackMs = now;
  }

  function resetPerformanceSamples(){
    frameMsSamples.length = 0;
    rafGapSamples.length = 0;
    lastRafCallbackMs = 0;
    rafLongIdleGaps = 0;
    lastReport = Object.assign({}, lastReport || {}, {
      avgMs:0,
      maxMs:0,
      rafAvgGapMs:0,
      rafMaxGapMs:0,
      rafSamples:0,
      rafLongIdleGaps:0,
      fps:0
    });
    return report();
  }

  function maybeAdaptRenderScale(){
    if(frameMsSamples.length < 14) return false;
    const now = nowMs();
    if(now - lastGameplayBurstMs < 5000) return false;
    if(now - lastScaleChangeMs < 1800) return false;
    const avg = averageFrameMs();
    const peak = maxFrameMs();
    const rawDpr = Math.max(1, Number(window.devicePixelRatio || 1));
    const lowEffects = document.documentElement.classList.contains('fate-low-effects');
    let nextScale = renderScale;
    const severeAtNativeDpr = rawDpr <= 1 && lowEffects && (avg > 26 || peak > 70);
    const slowEnoughToScaleDown = rawDpr > 1 ? (avg > 14 || peak > 34) : severeAtNativeDpr;
    if(slowEnoughToScaleDown && renderScale > MIN_RENDER_SCALE) {
      nextScale = Math.max(MIN_RENDER_SCALE, Math.round((renderScale - .04) * 100) / 100);
    } else if(avg < 7 && peak < 18 && renderScale < MAX_RENDER_SCALE && frameMsSamples.length >= 24) {
      nextScale = Math.min(MAX_RENDER_SCALE, Math.round((renderScale + .03) * 100) / 100);
    }
    if(nextScale === renderScale) return false;
    renderScale = nextScale;
    lastScaleChangeMs = now;
    frameMsSamples.length = 0;
    return true;
  }

  function totalLayerPixelArea(){
    return layerIds.reduce(function(total, id){
      const canvas = document.getElementById(id);
      return total + (canvas ? (Number(canvas.width) || 0) * (Number(canvas.height) || 0) : 0);
    }, 0);
  }

  function dirtyMaskForSource(source){
    const s = String(source || '').toLowerCase();
    if(!s) return DIRTY_ALL;
    if(s.indexOf('vfx') >= 0) return DIRTY_EFFECTS | DIRTY_PARTICLES;
    if(s.indexOf('hover') >= 0) return DIRTY_HOVER;
    if(s === 'input' || s === 'viewport-input') return DIRTY_EFFECTS | DIRTY_HOVER;
    if(s.indexOf('resize') >= 0 || s.indexOf('screen-enter') >= 0 || s.indexOf('adaptive-render-scale') >= 0) return DIRTY_ALL | DIRTY_LAYOUT;
    if(s.indexOf('opponent') >= 0 || s.indexOf('opphand') >= 0 || s.indexOf('opp-hand') >= 0) return DIRTY_OPP_HAND;
    if(s.indexOf('hand') >= 0) return DIRTY_HAND | DIRTY_EFFECTS;
    if(s.indexOf('pile') >= 0 || s.indexOf('deck') >= 0 || s.indexOf('discard') >= 0) return DIRTY_PILES;
    if(s.indexOf('particle') >= 0) return DIRTY_PARTICLES | DIRTY_EFFECTS;
    if(s.indexOf('motion') >= 0 || s.indexOf('animation') >= 0) return DIRTY_MOTION | DIRTY_EFFECTS | DIRTY_PARTICLES;
    if(s.indexOf('asset') >= 0) return DIRTY_HAND | DIRTY_OPP_HAND | DIRTY_PILES;
    if(s.indexOf('texture') >= 0) return DIRTY_BOARD_CARDS;
    if(s.indexOf('board') >= 0 || s.indexOf('cell') >= 0 || s.indexOf('place') >= 0) return DIRTY_BOARD_CARDS | DIRTY_HAND | DIRTY_OPP_HAND | DIRTY_EFFECTS;
    return DIRTY_ALL;
  }

  function noteGameplayBurst(dirtyMask){
    if(dirtyMask & (DIRTY_BOARD_CARDS | DIRTY_HAND | DIRTY_OPP_HAND | DIRTY_PILES | DIRTY_MOTION)) {
      lastGameplayBurstMs = nowMs();
    }
  }

  function scheduleTextureRender(source){
    const key = String(source || 'texture-ready');
    if(pendingTextureTimers[key]) return;
    pendingTextureTimers[key] = setTimeout(function(){
      pendingTextureTimers[key] = 0;
      scheduleRender(key);
    }, 42);
  }

  function isActiveMatchScreen(){
    const gameScreen = document.getElementById('s-game');
    return !!(gameScreen && gameScreen.classList.contains('active'));
  }

  function clearCanvas(canvas){
    if(!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d', {alpha:true});
    if(!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width || 0, canvas.height || 0);
  }

  function teardownScene(reason){
    if(redrawRaf) {
      cancelAnimationFrame(redrawRaf);
      redrawRaf = 0;
    }
    if(hoverRaf) {
      cancelAnimationFrame(hoverRaf);
      hoverRaf = 0;
    }
    Object.keys(pendingTextureTimers).forEach(function(key){
      if(pendingTextureTimers[key]) clearTimeout(pendingTextureTimers[key]);
      pendingTextureTimers[key] = 0;
    });
    if(input && typeof input.detach === 'function') input.detach();
    hoverHit = null;
    lastHitMap = {cards:[], cells:[], handCards:[], opponentHandCards:[], piles:[], uiCommands:[]};
    layerIds.forEach(function(id){
      const canvas = document.getElementById(id);
      if(canvas) {
        clearCanvas(canvas);
        canvas.style.display = 'none';
      }
    });
    const ghost = document.getElementById('fate-v2-drag-ghost');
    if(ghost) ghost.remove();
    if(document.body) document.body.classList.remove('fate-v2-dragging-card');
    const gameScreen = document.getElementById('s-game');
    if(gameScreen && !gameScreen.classList.contains('active')) gameScreen.classList.remove('fate-renderer-v2');
    const board = document.getElementById('board');
    if(board && !isActiveMatchScreen()) board.classList.remove('fate-match-v2-owned-board');
    if(!isActiveMatchScreen()) document.documentElement.classList.remove('fate-match-renderer-v2-mode');
    lastReport = Object.assign({}, lastReport || {}, {
      available:false,
      reason:reason || 'inactive-match-screen',
      version:ADAPTER_VERSION,
      hand:{v2Cards:0},
      opponentHand:{v2Cards:0},
      piles:{v2Piles:false, v2PileCount:0},
      hitMap:{cards:0, cells:0, handCards:0, opponentHandCards:0, piles:0, uiCommands:0}
    });
    return lastReport;
  }

  function enable(){
    localSet('fateEnableMatchRendererV2', '1');
    localSet('fateDisableMatchRendererV2', null);
    return report();
  }

  function disable(){
    localSet('fateEnableMatchRendererV2', null);
    localSet('fateDisableMatchRendererV2', '1');
    teardownScene('disabled');
    const gameScreen = document.getElementById('s-game');
    if(gameScreen) gameScreen.classList.remove('fate-renderer-v2');
    const board = document.getElementById('board');
    if(board) board.classList.remove('fate-match-v2-owned-board');
    document.documentElement.classList.remove('fate-match-renderer-v2-mode');
    return report();
  }

  function makeLayerCanvas(id, label){
    let canvas = document.getElementById(id);
    if(!canvas){
      canvas = document.createElement('canvas');
      canvas.id = id;
      if(label) canvas.setAttribute('aria-label', label);
      else canvas.setAttribute('aria-hidden', 'true');
    }
    canvas.classList.add('fate-match-v2-layer-canvas');
    return canvas;
  }

  function ensureCanvas(board){
    if(!board) return null;
    if(!isActiveMatchScreen()) return null;
    board.classList.add('fate-match-v2-owned-board');
    const gameScreen = document.getElementById('s-game');
    if(gameScreen) gameScreen.classList.add('fate-renderer-v2');
    document.documentElement.classList.add('fate-match-renderer-v2-mode');
    document.documentElement.classList.remove('fate-canvas-board-mode');
    document.documentElement.classList.remove('fate-canvas-board-ready');
    document.documentElement.classList.remove('fate-render-v2-card-layer-mode');
    if(document.body) document.body.classList.remove('fate-canvas-board-ready');
    window.FATE_USE_CANVAS_BOARD = false;

    const legacyCanvas = document.getElementById('fate-board-canvas');
    if(legacyCanvas) legacyCanvas.remove();

    const backgroundCanvas = makeLayerCanvas(backgroundCanvasId);
    const canvas = makeLayerCanvas(cardCanvasId, 'Fates Entwined match board');
    const effectCanvas = makeLayerCanvas(effectCanvasId);
    const particleCanvas = makeLayerCanvas(particleCanvasId);
    const uiCanvas = makeLayerCanvas(uiCanvasId);
    const hoverCanvas = makeLayerCanvas(hoverCanvasId);
    const boardLayers = [backgroundCanvas, canvas, effectCanvas, particleCanvas, hoverCanvas];
    Array.from(board.children).forEach(function(child){
      if(boardLayers.indexOf(child) < 0) child.remove();
    });
    boardLayers.forEach(function(layer){
      if(layer.parentNode !== board) board.appendChild(layer);
    });
    if(document.body && uiCanvas.parentNode !== document.body) document.body.appendChild(uiCanvas);

    board.style.position = 'relative';
    board.style.minHeight = 'min(70vh, 760px)';
    board.style.overflow = 'auto';
    backgroundCanvas.style.position = 'absolute';
    backgroundCanvas.style.left = '0';
    backgroundCanvas.style.top = '0';
    backgroundCanvas.style.width = '100%';
    backgroundCanvas.style.height = '100%';
    backgroundCanvas.style.display = 'block';
    backgroundCanvas.style.pointerEvents = 'none';
    backgroundCanvas.style.zIndex = '0';
    canvas.style.position = 'relative';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.pointerEvents = 'auto';
    canvas.style.zIndex = '1';
    effectCanvas.style.position = 'absolute';
    effectCanvas.style.left = '0';
    effectCanvas.style.top = '0';
    effectCanvas.style.width = '100%';
    effectCanvas.style.height = '100%';
    effectCanvas.style.display = 'block';
    effectCanvas.style.pointerEvents = 'none';
    effectCanvas.style.zIndex = '2';
    particleCanvas.style.position = 'absolute';
    particleCanvas.style.left = '0';
    particleCanvas.style.top = '0';
    particleCanvas.style.width = '100%';
    particleCanvas.style.height = '100%';
    particleCanvas.style.display = 'block';
    particleCanvas.style.pointerEvents = 'none';
    particleCanvas.style.zIndex = '3';
    uiCanvas.style.position = 'absolute';
    uiCanvas.style.left = '0';
    uiCanvas.style.top = '0';
    uiCanvas.style.width = '100%';
    uiCanvas.style.height = '100%';
    uiCanvas.style.display = 'block';
    uiCanvas.style.pointerEvents = 'none';
    uiCanvas.style.zIndex = '3';
    uiCanvas.style.position = 'fixed';
    uiCanvas.style.right = 'auto';
    uiCanvas.style.bottom = 'auto';
    uiCanvas.style.zIndex = '90';
    hoverCanvas.style.position = 'absolute';
    hoverCanvas.style.left = '0';
    hoverCanvas.style.top = '0';
    hoverCanvas.style.width = canvas.style.width;
    hoverCanvas.style.height = canvas.style.height;
    hoverCanvas.style.display = 'block';
    hoverCanvas.style.pointerEvents = 'none';
    hoverCanvas.style.zIndex = '4';
    canvas.__fateLayers = {
      background:backgroundCanvas,
      cards:canvas,
      effects:effectCanvas,
      particles:particleCanvas,
      ui:uiCanvas,
      hover:hoverCanvas
    };
    return canvas;
  }

  function rect(r, originX, originY){
    return {
      x:(Number(r && r.x) || 0) - originX,
      y:(Number(r && r.y) || 0) - originY,
      w:Number(r && r.w) || 0,
      h:Number(r && r.h) || 0
    };
  }

  function roundedPath(ctx, x, y, w, h, radius){
    const r = Math.max(0, Math.min(radius || 4, w / 2, h / 2));
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

  function drawImageCover(ctx, img, x, y, w, h){
    try {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    } catch(e) {}
    const iw = img.naturalWidth || img.width || 1;
    const ih = img.naturalHeight || img.height || 1;
    const scale = Math.max(w / iw, h / ih);
    const sw = w / scale;
    const sh = h / scale;
    const sx = Math.max(0, (iw - sw) / 2);
    const sy = Math.max(0, (ih - sh) * 0.22);
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  function getAssetImage(src, onChange){
    const key = String(src || '');
    if(!key) return null;
    let rec = assetImageCache.get(key);
    if(rec) return rec;
    const img = new Image();
    rec = {img, loaded:false, failed:false};
    img.onload = function(){
      rec.loaded = true;
      if(typeof onChange === 'function') onChange();
    };
    img.onerror = function(){
      rec.failed = true;
      if(typeof onChange === 'function') onChange();
    };
    img.src = key;
    assetImageCache.set(key, rec);
    return rec;
  }

  function drawAssetCover(ctx, src, r, onChange){
    const rec = getAssetImage(src, onChange);
    if(rec && rec.loaded && !rec.failed && rec.img) {
      roundedPath(ctx, r.x, r.y, r.w, r.h, Math.max(4, r.w * .06));
      ctx.save();
      ctx.clip();
      drawImageCover(ctx, rec.img, r.x, r.y, r.w, r.h);
      ctx.restore();
      return true;
    }
    return false;
  }

  function drawFallbackCard(ctx, visual, r){
    const grd = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    grd.addColorStop(0, '#182032');
    grd.addColorStop(1, '#080a10');
    roundedPath(ctx, r.x, r.y, r.w, r.h, Math.max(3, Math.min(8, r.w * .045)));
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = Math.max(18, Math.round(r.w * .26)) + 'px Cinzel, serif';
    const aff = (visual && visual.aff && visual.aff !== 'hidden') ? String(visual.aff).slice(0, 1).toUpperCase() : '?';
    ctx.fillText(aff, r.x + r.w / 2, r.y + r.h / 2);
  }

  function getTexture(card, visual, r, onChange){
    if(!window.FateCardTextureCache || typeof window.FateCardTextureCache.getBaseCardTexture !== 'function') return null;
    try {
      return window.FateCardTextureCache.getBaseCardTexture(card, {w:r.w, h:r.h}, {
        visual,
        dpr:2,
        preferFullArt:true,
        onChange
      });
    } catch(e) {
      return null;
    }
  }

  function drawFateBadge(ctx, visual, r){
    const fate = visual && visual.displayFate != null ? String(visual.displayFate) : '';
    if(!fate) return;
    const badgeH = Math.max(19, Math.min(26, r.w * .22));
    const badgeW = Math.max(32, Math.min(42, Math.max(32, r.w * .27) + Math.max(0, fate.length - 1) * 4));
    const x = r.x + r.w - badgeW - 2;
    const y = r.y + 2;
    roundedPath(ctx, x, y, badgeW, badgeH, badgeH / 2);
    ctx.fillStyle = 'rgba(8,9,14,.98)';
    ctx.fill();
    ctx.lineWidth = 1.35;
    ctx.strokeStyle = visual && visual.isHidden ? '#ffd95c' : '#ffd95c';
    ctx.stroke();
    ctx.fillStyle = '#ffd95c';
    ctx.font = '900 ' + Math.max(10, Math.round(badgeH * .58)) + 'px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(visual && visual.isHidden ? '-' : fate, x + badgeW / 2, y + badgeH / 2 + 1);
  }

  function getTimeline(){
    return window.FateMatchAnimationTimeline || null;
  }

  function getCardIid(card){
    return card && card.iid != null ? String(card.iid) : '';
  }

  function getCardFateValue(card, visual){
    if(visual && visual.displayFate != null) return String(visual.displayFate);
    if(card && card.currentFate != null) return String(card.currentFate);
    if(card && card.fate != null) return String(card.fate);
    return '';
  }

  function observeCardForAnimations(card, visual, cardRect){
    const timeline = getTimeline();
    const iid = getCardIid(card);
    if(!timeline || !iid) return;
    const fateValue = getCardFateValue(card, visual);
    const prev = lastCardFateByIid.get(iid);
    if(prev != null && prev !== fateValue){
      const prevNum = Number(prev);
      const nextNum = Number(fateValue);
      const delta = Number.isFinite(prevNum) && Number.isFinite(nextNum) ? nextNum - prevNum : 0;
      if(delta && window.FateVfxEventBridge && typeof window.FateVfxEventBridge.onStateDiff === 'function'){
        window.FateVfxEventBridge.onStateDiff({
          iid,
          card,
          rect:cloneRect(cardRect),
          fateDelta:delta,
          amount:Math.abs(delta)
        });
      } else {
        if(typeof timeline.clearForCardKind === 'function') timeline.clearForCardKind(iid, 'fate-pulse');
        else timeline.clearForCard(iid, 'fate-pulse');
        timeline.add({
          kind:'fate-pulse',
          iid,
          start:nowMs(),
          duration:420,
          easing:'out-cubic',
          fromValue:prev,
          toValue:fateValue,
          delta
        });
      }
    }
    lastCardFateByIid.set(iid, fateValue);
  }

  function drawFatePulse(ctx, card, r){
    const timeline = getTimeline();
    const iid = getCardIid(card);
    if(!timeline || !iid || typeof timeline.getForCard !== 'function') return;
    const anim = timeline.getForCard(iid, 'fate-pulse');
    if(!anim) return;
    const t = 1 - (Number(anim.eased) || 0);
    const alpha = Math.max(0, Math.min(.72, t * .72));
    const pad = 3 + (1 - t) * 9;
    ctx.save();
    roundedPath(ctx, r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2, Math.max(5, r.w * .055) + pad);
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = Number(anim.delta) < 0 ? 'rgba(255,96,96,.95)' : 'rgba(255,226,105,.95)';
    ctx.stroke();
    if(anim.delta){
      ctx.fillStyle = Number(anim.delta) < 0 ? 'rgba(255,120,120,.95)' : 'rgba(255,226,105,.95)';
      ctx.font = '900 ' + Math.max(11, Math.round(r.w * .13)) + 'px Cinzel, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const deltaText = Number(anim.delta) > 0 ? '+' + anim.delta : String(anim.delta);
      ctx.fillText(deltaText, r.x + r.w / 2, r.y - 8 - (1 - t) * 12);
    }
    ctx.restore();
  }

  function getTributeState(entry){
    try {
      if(typeof G === 'undefined' || !G || !G._consolidating || !entry) return '';
      const con = G._consolidating;
      const all = Array.isArray(con.allPossible) ? con.allPossible : [];
      const idx = all.findIndex(function(s){
        return s && s.z === entry.z && s.r === entry.r && s.c === entry.c;
      });
      if(idx < 0) return '';
      const chosen = Array.isArray(con.chosenIdxs) && con.chosenIdxs.indexOf(idx) >= 0;
      const running = Array.isArray(con.chosenIdxs)
        ? con.chosenIdxs.reduce(function(sum, i){
          const possible = all[i];
          return sum + (possible && Number(possible.reinforcement) || 1);
        }, 0)
        : 0;
      const requirementsMet = con.phase === 'select_placement' || (running >= Number(con.cost || 0) && con.phase === 'select_tributes');
      if(chosen && con.phase === 'select_placement') return 'placement';
      if(chosen && requirementsMet) return 'ready';
      if(chosen) return 'selected';
      return 'available';
    } catch(e) {
      return '';
    }
  }

  function drawTributeCue(ctx, r, state){
    if(!state) return;
    const selected = state === 'selected';
    const placement = state === 'placement';
    const ready = state === 'ready';
    const color = ready ? 'rgba(114,205,255,1)' : selected ? 'rgba(255,232,104,1)' : placement ? 'rgba(255,224,94,.98)' : 'rgba(255,218,62,.90)';
    const fill = ready ? 'rgba(82,182,255,.18)' : selected ? 'rgba(255,218,62,.16)' : placement ? 'rgba(255,215,0,.12)' : 'rgba(255,215,0,.075)';
    const radius = Math.max(5, Math.min(10, r.w * .06));
    const outerPad = (selected || ready || placement) ? 4.2 : 2.7;
    ctx.save();
    ctx.shadowColor = ready ? 'rgba(104,199,255,.55)' : 'rgba(255,220,70,.52)';
    ctx.shadowBlur = ready ? 18 : 14;
    roundedPath(ctx, r.x - outerPad, r.y - outerPad, r.w + outerPad * 2, r.h + outerPad * 2, radius + 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = ready ? 3.25 : (selected ? 3.05 : (placement ? 2.45 : 2.05));
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.shadowBlur = 0;
    if(selected || placement || ready){
      roundedPath(ctx, r.x + 2.5, r.y + 2.5, r.w - 5, r.h - 5, Math.max(4, radius - 1));
      ctx.strokeStyle = ready ? 'rgba(222,245,255,.78)' : 'rgba(255,248,196,.68)';
      ctx.lineWidth = ready ? 1.35 : 1.15;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBlockOverlay(ctx, r, block){
    if(!block) return;
    const type = block.type === 'carolyn' ? 'carolyn' : 'zoe';
    const isCarolyn = type === 'carolyn';
    ctx.save();
    roundedPath(ctx, r.x + 1, r.y + 1, Math.max(0, r.w - 2), Math.max(0, r.h - 2), 5);
    ctx.fillStyle = isCarolyn ? 'rgba(88,12,18,.34)' : 'rgba(70,42,120,.22)';
    ctx.fill();
    ctx.lineWidth = isCarolyn ? 1.8 : 1.45;
    ctx.strokeStyle = isCarolyn ? 'rgba(255,86,92,.72)' : 'rgba(190,150,255,.66)';
    ctx.stroke();
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    if(isCarolyn){
      const lockW = Math.max(20, Math.min(32, r.w * .24));
      const lockH = Math.max(15, Math.min(24, r.h * .13));
      const lx = cx - lockW / 2;
      const ly = cy - lockH - 3;
      ctx.lineWidth = Math.max(1.4, lockW * .08);
      ctx.strokeStyle = 'rgba(255,220,220,.9)';
      ctx.beginPath();
      ctx.arc(cx, ly, lockW * .28, Math.PI, 0);
      ctx.stroke();
      roundedPath(ctx, lx, ly, lockW, lockH, 3);
      ctx.fillStyle = 'rgba(255,95,95,.22)';
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffd2d2';
      ctx.font = '800 ' + Math.max(7, Math.round(r.w * .06)) + 'px Cinzel, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('LOCKED', cx, cy + lockH * .75);
    } else {
      ctx.fillStyle = '#ddc7ff';
      ctx.font = '800 ' + Math.max(6, Math.round(r.w * .045)) + 'px Cinzel, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('NO CONSOLIDATE', cx, cy);
    }
    ctx.restore();
  }

  function sameRect(a, b){
    if(!a || !b) return false;
    return Math.abs(a.x - b.x) < .75
      && Math.abs(a.y - b.y) < .75
      && Math.abs(a.w - b.w) < .75
      && Math.abs(a.h - b.h) < .75;
  }

  function cloneRect(r){
    return {
      x:Number(r && r.x) || 0,
      y:Number(r && r.y) || 0,
      w:Number(r && r.w) || 0,
      h:Number(r && r.h) || 0
    };
  }

  function lerp(a, b, t){
    return (Number(a) || 0) + ((Number(b) || 0) - (Number(a) || 0)) * t;
  }

  function rectFromMove(anim, fallback){
    const from = anim && anim.fromRect ? anim.fromRect : fallback;
    const to = anim && anim.toRect ? anim.toRect : fallback;
    const t = Number(anim && anim.eased) || 0;
    return {
      x:lerp(from.x, to.x, t),
      y:lerp(from.y, to.y, t),
      w:lerp(from.w, to.w, t),
      h:lerp(from.h, to.h, t)
    };
  }

  function queuePlacementMotion(iid, fromRect){
    const key = String(iid == null ? '' : iid);
    if(!key || !fromRect) return false;
    pendingPlacementRectByIid.set(key, cloneRect(fromRect));
    return true;
  }

  function hideBoardCardForVfx(iid, duration){
    const key = String(iid == null ? '' : iid);
    if(!key) return;
    const ms = Math.max(120, Number(duration) || 460);
    vfxHiddenBoardCardUntilByIid.set(key, nowMs() + ms);
    setTimeout(function(){
      vfxHiddenBoardCardUntilByIid.delete(key);
      scheduleRender('board-commit');
    }, ms + 24);
  }

  function isBoardCardHiddenForVfx(iid){
    const key = String(iid == null ? '' : iid);
    if(!key) return false;
    const until = Number(vfxHiddenBoardCardUntilByIid.get(key)) || 0;
    if(!until) return false;
    if(nowMs() > until){
      vfxHiddenBoardCardUntilByIid.delete(key);
      return false;
    }
    return true;
  }

  function observeCardForMove(card, r, snapshotChanged){
    const timeline = getTimeline();
    const iid = getCardIid(card);
    if(!timeline || !iid || !r) return null;
    const nextRect = cloneRect(r);
    const prevRect = lastCardRectByIid.get(iid);
    lastCardRectByIid.set(iid, nextRect);
    const pendingPlacementRect = pendingPlacementRectByIid.get(iid);
    if(!prevRect && pendingPlacementRect){
      pendingPlacementRectByIid.delete(iid);
      if(window.FateVfxEventBridge && typeof window.FateVfxEventBridge.onAcceptedGameEvent === 'function'){
        window.FateVfxEventBridge.onAcceptedGameEvent({
          type:'PLAY_CARD',
          payload:{
            iid,
            card,
            fromRect:pendingPlacementRect,
            toRect:nextRect,
            targetRect:nextRect
          }
        });
        if((card && card.type) !== 'Supporter') hideBoardCardForVfx(iid, 320);
        else scheduleRender('supporter-board-commit');
        return null;
      }
      if(typeof timeline.clearForCardKind === 'function') timeline.clearForCardKind(iid, 'card-move');
      else if(typeof timeline.clearForCard === 'function') timeline.clearForCard(iid, 'card-move');
      return timeline.add({
        kind:'card-move',
        iid,
        start:nowMs(),
        duration:520,
        easing:'out-back-soft',
        fromRect:pendingPlacementRect,
        toRect:nextRect,
        flight:true
      });
    }
    if(!prevRect || sameRect(prevRect, nextRect)) return timeline.getForCard && timeline.getForCard(iid, 'card-move');
    if(!snapshotChanged) return timeline.getForCard && timeline.getForCard(iid, 'card-move');
    if(typeof timeline.clearForCardKind === 'function') timeline.clearForCardKind(iid, 'card-move');
    else if(typeof timeline.clearForCard === 'function') timeline.clearForCard(iid, 'card-move');
    return timeline.add({
      kind:'card-move',
      iid,
      start:nowMs(),
      duration:380,
      easing:'in-out-cubic',
      fromRect:prevRect,
      toRect:nextRect,
      flight:false
    });
  }

  function drawCardContent(ctx, entry, visual, r, onChange, options){
    const opts = options || {};
    const texture = getTexture(entry.card, visual, r, onChange);
    if(texture && texture.loaded && !texture.failed && texture.canvas) {
      ctx.drawImage(texture.canvas, r.x, r.y, r.w, r.h);
    } else {
      const fullArtSrc = visual && (visual.img || visual.runtimeImg);
      const art = window.FateCardTextureCache && typeof window.FateCardTextureCache.getArtBitmap === 'function'
        ? window.FateCardTextureCache.getArtBitmap(fullArtSrc, {source:'match-v2-full-art', onChange})
        : null;
      const img = art && (art.bitmap || art.img);
      if(art && art.loaded && !art.failed && img) {
        roundedPath(ctx, r.x, r.y, r.w, r.h, Math.max(3, Math.min(8, r.w * .045)));
        ctx.save();
        ctx.clip();
        drawImageCover(ctx, img, r.x, r.y, r.w, r.h);
        ctx.restore();
      } else {
        drawFallbackCard(ctx, visual, r);
      }
    }
    drawFateBadge(ctx, visual, r);
    drawTributeCue(ctx, r, opts.tributeState || '');
    if(opts.pulse !== false) drawFatePulse(ctx, entry.card, r);
  }

  function stableCardTilt(entry){
    const c = Number(entry && entry.c) || 0;
    const z = Number(entry && entry.z) || 0;
    const r = Number(entry && entry.r) || 0;
    const iid = getCardIid(entry && entry.card);
    let hash = 0;
    for(let i = 0; i < iid.length; i++) hash = ((hash << 5) - hash + iid.charCodeAt(i)) | 0;
    const jitter = ((Math.abs(hash) % 7) - 3) * .0022;
    return (c - 1) * .014 + (z - 1) * .007 + (r - 1) * .004 + jitter;
  }

  function drawCardContactShadow(ctx, r, options){
    const opts = options || {};
    const boardH = Math.max(1, Number(opts.boardH) || 720);
    const depth = Math.max(0, Math.min(1, r.y / boardH));
    const lift = Math.max(0, Math.min(1, Number(opts.lift) || 0));
    const shadowW = r.w * (1.08 + depth * .18 + lift * .18);
    const shadowH = Math.max(8, r.h * (.105 + depth * .035 + lift * .035));
    const x = r.x + r.w / 2 - shadowW / 2;
    const y = r.y + r.h - shadowH * (.38 - lift * .12);
    const grd = ctx.createRadialGradient(r.x + r.w / 2, y + shadowH / 2, 2, r.x + r.w / 2, y + shadowH / 2, shadowW / 2);
    grd.addColorStop(0, 'rgba(0,0,0,' + (.42 + depth * .12) + ')');
    grd.addColorStop(.58, 'rgba(0,0,0,.20)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(r.x + r.w / 2, y + shadowH / 2, shadowW / 2, shadowH / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCardPlaneGleam(ctx, r, tilt){
    const sheen = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    sheen.addColorStop(0, 'rgba(255,255,255,.16)');
    sheen.addColorStop(.18, 'rgba(255,255,255,0)');
    sheen.addColorStop(.68, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(255,235,155,.13)');
    ctx.save();
    roundedPath(ctx, r.x, r.y, r.w, r.h, Math.max(4, r.w * .052));
    ctx.clip();
    ctx.fillStyle = sheen;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = tilt < 0 ? 'rgba(118,196,255,.35)' : 'rgba(255,214,104,.34)';
    ctx.lineWidth = 1.1;
    roundedPath(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, Math.max(4, r.w * .048));
    ctx.stroke();
    ctx.restore();
  }

  function drawOpponentTint(ctx, r){
    ctx.save();
    roundedPath(ctx, r.x, r.y, r.w, r.h, Math.max(4, r.w * .052));
    ctx.clip();
    const tint = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    tint.addColorStop(0, 'rgba(255,52,66,.28)');
    tint.addColorStop(.52, 'rgba(255,52,66,.12)');
    tint.addColorStop(1, 'rgba(96,0,16,.30)');
    ctx.fillStyle = tint;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = 'rgba(255,104,124,.58)';
    ctx.lineWidth = 1.35;
    roundedPath(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, Math.max(4, r.w * .048));
    ctx.stroke();
    ctx.restore();
  }

  function drawCardVisual(ctx, entry, visual, r, onChange, options){
    const opts = options || {};
    const tilt = Number.isFinite(opts.tilt) ? opts.tilt : stableCardTilt(entry);
    const lift = Number(opts.lift) || 0;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    drawCardContactShadow(ctx, r, opts);
    ctx.save();
    ctx.translate(cx, cy - lift * 4);
    ctx.rotate(tilt);
    ctx.scale(1 + lift * .012, 1 - Math.abs(tilt) * .22 + lift * .008);
    ctx.translate(-cx, -cy);
    drawCardContent(ctx, entry, visual, r, onChange, opts);
    if(opts.opponent) drawOpponentTint(ctx, r);
    drawCardPlaneGleam(ctx, r, tilt);
    ctx.restore();
  }

  function zoneScore(z, player){
    try {
      if(typeof window.getCachedZoneScore === 'function') return window.getCachedZoneScore(z, player);
    } catch(e) {}
    return 0;
  }

  function drawCornerRails(ctx, r, color, alpha){
    const len = Math.max(24, Math.min(52, r.w * .09, r.h * .16));
    const inset = 8;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.moveTo(r.x + inset, r.y + len);
    ctx.lineTo(r.x + inset, r.y + inset);
    ctx.lineTo(r.x + len, r.y + inset);
    ctx.moveTo(r.x + r.w - len, r.y + inset);
    ctx.lineTo(r.x + r.w - inset, r.y + inset);
    ctx.lineTo(r.x + r.w - inset, r.y + len);
    ctx.moveTo(r.x + inset, r.y + r.h - len);
    ctx.lineTo(r.x + inset, r.y + r.h - inset);
    ctx.lineTo(r.x + len, r.y + r.h - inset);
    ctx.moveTo(r.x + r.w - len, r.y + r.h - inset);
    ctx.lineTo(r.x + r.w - inset, r.y + r.h - inset);
    ctx.lineTo(r.x + r.w - inset, r.y + r.h - len);
    ctx.stroke();
    ctx.restore();
  }

  function drawCellHatch(ctx, r, color){
    ctx.save();
    ctx.beginPath();
    roundedPath(ctx, r.x, r.y, r.w, r.h, 4);
    ctx.clip();
    ctx.globalAlpha = .035;
    ctx.strokeStyle = color || 'rgba(255,255,255,.18)';
    ctx.lineWidth = 1;
    const step = Math.max(9, Math.min(16, r.w * .12));
    for(let x = r.x - r.h; x < r.x + r.w + r.h; x += step){
      ctx.beginPath();
      ctx.moveTo(x, r.y);
      ctx.lineTo(x + r.h, r.y + r.h);
      ctx.stroke();
    }
    ctx.globalAlpha = .025;
    for(let x = r.x; x < r.x + r.w + r.h; x += step){
      ctx.beginPath();
      ctx.moveTo(x, r.y + r.h);
      ctx.lineTo(x - r.h, r.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawZonePanel(ctx, zone, zoneRect, headerRect, snapshot){
    const ownerTint = zone.z === 0 ? 'rgba(28,68,96,.14)' : zone.z === 1 ? 'rgba(92,70,36,.12)' : 'rgba(35,82,68,.14)';
    const panelGrad = ctx.createLinearGradient(zoneRect.x, zoneRect.y, zoneRect.x, zoneRect.y + zoneRect.h);
    panelGrad.addColorStop(0, 'rgba(9,13,20,.50)');
    panelGrad.addColorStop(.38, ownerTint);
    panelGrad.addColorStop(1, 'rgba(4,7,12,.58)');

    roundedPath(ctx, zoneRect.x, zoneRect.y, zoneRect.w, zoneRect.h, 8);
    ctx.fillStyle = panelGrad;
    ctx.fill();
    const innerGlow = ctx.createLinearGradient(zoneRect.x, zoneRect.y, zoneRect.x + zoneRect.w, zoneRect.y + zoneRect.h);
    innerGlow.addColorStop(0, 'rgba(255,240,176,.07)');
    innerGlow.addColorStop(.55, 'rgba(255,255,255,0)');
    innerGlow.addColorStop(1, 'rgba(0,0,0,.10)');
    roundedPath(ctx, zoneRect.x + 2, zoneRect.y + 2, zoneRect.w - 4, zoneRect.h - 4, 6);
    ctx.fillStyle = innerGlow;
    ctx.fill();
    ctx.lineWidth = 1.75;
    ctx.strokeStyle = 'rgba(255,220,82,.94)';
    ctx.stroke();

    ctx.save();
    ctx.globalAlpha = .72;
    ctx.strokeStyle = 'rgba(255,238,158,.30)';
    ctx.lineWidth = 1.1;
    roundedPath(ctx, zoneRect.x + 7, zoneRect.y + 7, zoneRect.w - 14, zoneRect.h - 14, 6);
    ctx.stroke();
    ctx.restore();
    drawCornerRails(ctx, zoneRect, 'rgba(255,219,77,.96)', 1);

    const badgeW = Math.min(150, Math.max(118, zoneRect.w * .32));
    const badgeX = headerRect.x + headerRect.w / 2 - badgeW / 2;
    const badgeH = 28;
    const badgeY = Math.max(2, headerRect.y - 15);
    roundedPath(ctx, badgeX, badgeY, badgeW, badgeH, 7);
    const badgeGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + badgeH);
    badgeGrad.addColorStop(0, 'rgba(18,18,15,.96)');
    badgeGrad.addColorStop(1, 'rgba(2,3,6,.88)');
    ctx.fillStyle = badgeGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,224,116,.76)';
    ctx.stroke();
    ctx.fillStyle = '#f2d778';
    ctx.font = '800 10px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ZONE ' + (zone.z + 1), headerRect.x + headerRect.w / 2, badgeY + badgeH / 2);

    const s0 = zoneScore(zone.z, 0);
    const s1 = zoneScore(zone.z, 1);
    const scoreW = Math.min(236, Math.max(188, zoneRect.w * .50));
    const scoreX = headerRect.x + headerRect.w / 2 - scoreW / 2;
    const scoreY = headerRect.y + 19;
    roundedPath(ctx, scoreX, scoreY, scoreW, 25, 12.5);
    const scoreGrad = ctx.createLinearGradient(scoreX, scoreY, scoreX + scoreW, scoreY + 25);
    scoreGrad.addColorStop(0, 'rgba(5,14,25,.92)');
    scoreGrad.addColorStop(.48, 'rgba(10,8,10,.94)');
    scoreGrad.addColorStop(1, 'rgba(24,7,12,.92)');
    ctx.fillStyle = scoreGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,224,103,.74)';
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,228,126,.12)';
    ctx.fillRect(scoreX + scoreW * .5 - .5, scoreY + 4, 1, 17);

    const leftScore = snapshot.viewer === 1 ? s1 : s0;
    const rightScore = snapshot.viewer === 1 ? s0 : s1;
    ctx.font = '900 15px system-ui, sans-serif';
    ctx.fillStyle = '#86c9ff';
    ctx.fillText(String(leftScore), scoreX + 34, scoreY + 13);
    ctx.fillStyle = '#ff8795';
    ctx.fillText(String(rightScore), scoreX + scoreW - 34, scoreY + 13);
    ctx.fillStyle = 'rgba(255,229,136,.76)';
    ctx.font = '800 7px Cinzel, serif';
    ctx.fillText('FATE', scoreX + scoreW / 2, scoreY + 9);
    ctx.fillStyle = 'rgba(255,229,136,.34)';
    ctx.fillRect(scoreX + 60, scoreY + 18, scoreW - 120, 1);
  }

  function drawTableAtmosphere(ctx, cssW, cssH, boardRect){
    return;
  }

  function drawHoverCue(ctx, hit){
    if(!hit || !hit.rect) return;
    const r = hit.rect;
    const good = hit.dragState !== 'invalid';
    const color = good ? 'rgba(236,203,101,.56)' : 'rgba(255,101,115,.78)';
    const fill = good ? 'rgba(236,203,101,.045)' : 'rgba(255,80,92,.10)';
    ctx.save();
    roundedPath(ctx, r.x - 4, r.y - 4, r.w + 8, r.h + 8, 8);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = good ? 1.35 : 2.2;
    ctx.strokeStyle = color;
    ctx.stroke();
    roundedPath(ctx, r.x + 5, r.y + 5, r.w - 10, r.h - 10, 5);
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = good ? 'rgba(255,242,178,.34)' : 'rgba(255,205,210,.38)';
    ctx.stroke();
    ctx.restore();
  }

  function drawCardBack(ctx, r, label, assetSrc){
    if(assetSrc && drawAssetCover(ctx, assetSrc, r, function(){ scheduleTextureRender('asset-ready'); })) {
      return;
    }
    const grd = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    grd.addColorStop(0, '#142338');
    grd.addColorStop(.48, '#070b15');
    grd.addColorStop(1, '#281420');
    roundedPath(ctx, r.x, r.y, r.w, r.h, Math.max(4, r.w * .06));
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = 'rgba(228,190,83,.72)';
    ctx.stroke();
    ctx.save();
    ctx.globalAlpha = .72;
    ctx.strokeStyle = 'rgba(228,190,83,.38)';
    ctx.lineWidth = 1;
    roundedPath(ctx, r.x + r.w * .12, r.y + r.h * .11, r.w * .76, r.h * .78, Math.max(3, r.w * .04));
    ctx.stroke();
    ctx.fillStyle = 'rgba(242,215,120,.78)';
    ctx.font = '800 ' + Math.max(10, Math.round(r.w * .14)) + 'px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if(label) ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
    ctx.restore();
  }

  function drawEmptyPileSlot(ctx, r){
    const grd = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    grd.addColorStop(0, 'rgba(14,18,29,.86)');
    grd.addColorStop(1, 'rgba(3,5,10,.92)');
    roundedPath(ctx, r.x, r.y, r.w, r.h, Math.max(4, r.w * .06));
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(228,190,83,.38)';
    ctx.stroke();
    ctx.save();
    ctx.globalAlpha = .34;
    ctx.strokeStyle = 'rgba(228,190,83,.32)';
    ctx.lineWidth = 1;
    roundedPath(ctx, r.x + r.w * .14, r.y + r.h * .13, r.w * .72, r.h * .74, Math.max(3, r.w * .04));
    ctx.stroke();
    ctx.restore();
  }

  function drawPileLabelStrip(ctx, pile, r){
    const label = pile && pile.pile === 'deck' ? 'DECK' : 'DISCARD';
    const count = String(Number(pile && pile.count) || 0);
    const stripH = Math.max(22, Math.min(32, r.h * .24));
    const stripY = r.y + r.h - stripH - 3;
    roundedPath(ctx, r.x + 5, stripY, Math.max(1, r.w - 10), stripH, 4);
    ctx.fillStyle = 'rgba(2,3,7,.88)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(239,205,91,.54)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#d7bd60';
    ctx.font = '800 ' + Math.max(10, Math.round(stripH * .44)) + 'px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label + ' ' + count, r.x + r.w / 2, stripY + stripH / 2 + 1);
  }

  function drawPile(ctx, pile){
    if(!pile || !pile.rect) return;
    const r = pile.rect;
    const isDeck = pile.pile === 'deck';
    const top = pile.topCard || null;
    ctx.save();
    roundedPath(ctx, r.x, r.y, r.w, r.h, 7);
    ctx.fillStyle = 'rgba(4,7,13,.78)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(224,188,84,.42)';
    ctx.lineWidth = 1;
    ctx.stroke();
    const cardR = {x:r.x + 5, y:r.y + 5, w:Math.max(1, r.w - 10), h:Math.max(1, r.h - 10)};
    if(isDeck) {
      drawCardBack(ctx, cardR, 'DECK', 'deck.png');
    } else if(!top) {
      drawEmptyPileSlot(ctx, cardR);
    } else {
      drawCardContent(ctx, {card:top}, top.visual || top, cardR, function(){ scheduleTextureRender('pile-texture-ready'); }, {pulse:false, tilt:0});
    }
    drawPileLabelStrip(ctx, pile, r);
    ctx.restore();
  }

  function freeSetIids(snapshot){
    return snapshot && snapshot.interaction && Array.isArray(snapshot.interaction.freeSetIids)
      ? snapshot.interaction.freeSetIids
      : [];
  }

  function isSupporterLimitDisabled(item, snapshot){
    const card = item && item.card;
    if(!card || card.type !== 'Supporter') return false;
    const interaction = snapshot && snapshot.interaction ? snapshot.interaction : {};
    if(!interaction.supporterLimitReached) return false;
    if(interaction.currentPlayer !== snapshot.viewer) return false;
    if((interaction.phase || '') !== 'main') return false;
    const iid = card.iid != null ? String(card.iid) : '';
    return freeSetIids(snapshot).indexOf(iid) < 0;
  }

  function drawDisabledCardOverlay(ctx, r, label){
    ctx.save();
    roundedPath(ctx, r.x, r.y, r.w, r.h, Math.max(4, r.w * .052));
    ctx.clip();
    ctx.fillStyle = 'rgba(18,20,24,.58)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = 'rgba(120,120,120,.9)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.globalCompositeOperation = 'source-over';
    const stripH = Math.max(22, r.h * .14);
    roundedPath(ctx, r.x + 8, r.y + r.h - stripH - 8, r.w - 16, stripH, 5);
    ctx.fillStyle = 'rgba(4,5,8,.82)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,190,190,.42)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(226,226,218,.82)';
    ctx.font = '800 ' + Math.max(9, Math.round(stripH * .42)) + 'px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label || 'LIMIT', r.x + r.w / 2, r.y + r.h - stripH / 2 - 8);
    ctx.restore();
  }

  function drawCommandButton(ctx, hitMap, command, label, rect, opts){
    const options = opts || {};
    const disabled = !!options.disabled;
    const primary = !!options.primary;
    const active = !!options.active;
    ctx.save();
    const grad = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
    if(primary){
      grad.addColorStop(0, disabled ? 'rgba(54,54,58,.92)' : 'rgba(177,127,43,.95)');
      grad.addColorStop(.48, disabled ? 'rgba(36,38,42,.94)' : 'rgba(84,55,24,.96)');
      grad.addColorStop(1, disabled ? 'rgba(20,22,26,.98)' : 'rgba(19,18,19,.98)');
    } else {
      grad.addColorStop(0, disabled ? 'rgba(31,34,39,.88)' : 'rgba(39,45,56,.94)');
      grad.addColorStop(1, disabled ? 'rgba(14,16,20,.94)' : 'rgba(8,10,17,.96)');
    }
    roundedPath(ctx, rect.x, rect.y, rect.w, rect.h, primary ? rect.h / 2 : 10);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = primary ? 2 : 1.25;
    ctx.strokeStyle = disabled ? 'rgba(156,156,150,.34)' : (active ? 'rgba(123,220,165,.82)' : 'rgba(236,203,101,.68)');
    ctx.stroke();
    if(primary && !disabled){
      ctx.beginPath();
      ctx.arc(rect.x + rect.w / 2, rect.y + rect.h / 2, Math.max(10, rect.h * .32), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,244,180,.28)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(rect.x + rect.w * .46, rect.y + rect.h * .36);
      ctx.lineTo(rect.x + rect.w * .46, rect.y + rect.h * .64);
      ctx.lineTo(rect.x + rect.w * .66, rect.y + rect.h * .50);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,245,190,.88)';
      ctx.fill();
    }
    ctx.fillStyle = disabled ? 'rgba(200,200,192,.48)' : '#f2d778';
    ctx.font = '800 ' + Math.max(9, Math.round(rect.h * (primary ? .16 : .28))) + 'px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + (primary ? rect.h * .27 : 1));
    ctx.restore();
    hitMap.uiCommands.push({kind:'ui-command', command, disabled, rect});
  }

  function drawCommandDock(ctx, hitMap, snapshot, cssW, cssH){
    const w = Math.min(330, Math.max(286, cssW * .23));
    const h = 96;
    const chatReserve = 86;
    const x = Math.max(14, cssW - w - chatReserve - 22);
    const y = Math.max(12, cssH - h - 18);
    const r = {x, y, w, h};
    const interaction = snapshot && snapshot.interaction ? snapshot.interaction : {};
    ctx.save();
    roundedPath(ctx, x, y, w, h, 18);
    const bg = ctx.createLinearGradient(x, y, x + w, y + h);
    bg.addColorStop(0, 'rgba(8,10,15,.86)');
    bg.addColorStop(.55, 'rgba(21,19,18,.92)');
    bg.addColorStop(1, 'rgba(3,5,9,.94)');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(236,203,101,.72)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,247,194,.18)';
    ctx.lineWidth = 1;
    roundedPath(ctx, x + 6, y + 6, w - 12, h - 12, 14);
    ctx.stroke();
    ctx.globalAlpha = .52;
    ctx.strokeStyle = 'rgba(236,203,101,.34)';
    ctx.beginPath();
    ctx.moveTo(x + 20, y + 16);
    ctx.lineTo(x + w - 20, y + 16);
    ctx.moveTo(x + 20, y + h - 16);
    ctx.lineTo(x + w - 20, y + h - 16);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const endRect = {x:x + w - 86, y:y + 11, w:74, h:74};
    const smallW = w - 112;
    const consolidateDisabled = interaction.currentPlayer !== snapshot.viewer || (interaction.phase || '') !== 'main';
    hitMap.uiCommands.push({kind:'ui-command', command:'dock', disabled:true, rect:r});
    drawCommandButton(ctx, hitMap, 'end-turn', 'END', endRect, {primary:true, disabled:interaction.currentPlayer !== snapshot.viewer});
    drawCommandButton(ctx, hitMap, 'consolidate', interaction.consolidating ? 'CANCEL' : 'CONSOLIDATE', {x:x + 16, y:y + 18, w:smallW, h:28}, {disabled:consolidateDisabled, active:interaction.consolidating});
    drawCommandButton(ctx, hitMap, 'audio', 'AUDIO', {x:x + 16, y:y + 53, w:smallW, h:25}, {disabled:false});
    ctx.restore();
  }

  function drawSceneUi(ctx, layout, snapshot, cssW, cssH){
    const hitMap = {handCards:[], opponentHandCards:[], piles:[], uiCommands:[]};
    if(!ctx || !layout || !snapshot) return hitMap;
    const handCards = layout.hand && Array.isArray(layout.hand.cards) ? layout.hand.cards : [];
    handCards.forEach(function(item){
      if(!item || !item.card || !item.rect) return;
      const visual = item.card.visual || item.card;
      const disabled = isSupporterLimitDisabled(item, snapshot);
      drawCardVisual(ctx, {card:item.card, c:item.index, r:0, z:0}, visual, item.rect, function(){ scheduleTextureRender('hand-texture-ready'); }, {pulse:false, tilt:0});
      if(disabled) drawDisabledCardOverlay(ctx, item.rect, 'SET LIMIT');
      hitMap.handCards.push({kind:'hand-card', index:item.index, iid:item.iid, rect:item.hitRect || item.rect, card:item.card, disabled});
    });

    const oppCards = layout.opponentHand && Array.isArray(layout.opponentHand.cards) ? layout.opponentHand.cards : [];
    oppCards.forEach(function(item){
      if(!item || !item.rect) return;
      if(item.faceDown || !item.card || item.card.hidden) drawCardBack(ctx, item.rect, '', 'back.png');
      else drawCardContent(ctx, {card:item.card}, item.card.visual || item.card, item.rect, function(){ scheduleTextureRender('opponent-hand-texture-ready'); }, {pulse:false});
      hitMap.opponentHandCards.push({kind:'opponent-hand-card', index:item.index, iid:item.iid, rect:item.rect, card:item.card || null});
    });

    const piles = layout.piles && Array.isArray(layout.piles.items) ? layout.piles.items : [];
    piles.forEach(function(pile){
      if(!pile || !pile.rect) return;
      drawPile(ctx, pile);
      hitMap.piles.push({kind:'pile', playerIndex:pile.playerIndex, pile:pile.pile, rect:pile.hitRect || pile.rect, count:pile.count});
    });
    return hitMap;
  }

  function drawScene(ctx, layout, snapshot, cssW, cssH, dpr){
    const originX = Number(layout.boardRect && layout.boardRect.x) || 0;
    const originY = Number(layout.boardRect && layout.boardRect.y) || 0;
    const boardRect = rect(layout.boardRect, originX, originY);
    const hitMap = {cards:[], cells:[], handCards:[], opponentHandCards:[], piles:[]};
    const timeline = getTimeline();
    if(timeline && typeof timeline.tick === 'function') timeline.tick(nowMs());
    const snapshotChangedForMove = !!(snapshot && snapshot.signature && lastMoveSnapshotSignature && snapshot.signature !== lastMoveSnapshotSignature);
    if(snapshot && snapshot.signature) lastMoveSnapshotSignature = snapshot.signature;
    try {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    } catch(e) {}
    ctx.clearRect(0, 0, cssW, cssH);
    drawTableAtmosphere(ctx, cssW, cssH, boardRect);

    const zones = Array.isArray(layout.zones) ? layout.zones : [];
    zones.forEach(function(zone){
      const zr = rect(zone.rect, originX, originY);
      const hr = rect(zone.headerRect, originX, originY);
      drawZonePanel(ctx, zone, zr, hr, snapshot);

      (zone.rows || []).forEach(function(row){
        const rr = rect(row.rect, originX, originY);
        const lr = rect(row.labelRect, originX, originY);
        const cells = row.cells || [];
        ctx.save();
        ctx.translate(lr.x + lr.w / 2, rr.y + rr.h / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = row.owner === snapshot.viewer ? 'rgba(156,211,255,.72)' : 'rgba(230,220,190,.55)';
        ctx.font = '700 9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(row.owner === snapshot.viewer ? 'YOUR SIDE' : row.owner < 0 ? 'CONTESTED' : 'OPPONENT', 0, 0);
        ctx.restore();

        cells.forEach(function(cell){
          const cr = rect(cell.rect, originX, originY);
          hitMap.cells.push({
            z:cell.z,
            r:cell.r,
            c:cell.c,
            rect:cr,
            hasCard:!!cell.card,
            blocked:cell.blocked || null,
            markSafe:!!cell.markSafe
          });
          roundedPath(ctx, cr.x, cr.y, cr.w, cr.h, 5);
          ctx.fillStyle = row.owner === snapshot.viewer ? 'rgba(45,136,184,.052)' : row.owner < 0 ? 'rgba(155,134,65,.047)' : 'rgba(166,62,76,.052)';
          ctx.fill();
          drawCellHatch(ctx, cr, row.owner === snapshot.viewer ? 'rgba(122,189,243,.24)' : row.owner < 0 ? 'rgba(232,205,112,.20)' : 'rgba(238,132,142,.22)');
          ctx.lineWidth = 1;
          ctx.strokeStyle = cell.card ? 'rgba(255,232,141,.38)' : 'rgba(235,217,153,.18)';
          ctx.stroke();
          ctx.save();
          ctx.globalAlpha = cell.card ? .10 : .16;
          ctx.strokeStyle = row.owner === snapshot.viewer ? 'rgba(122,202,255,.48)' : row.owner < 0 ? 'rgba(242,214,126,.42)' : 'rgba(255,128,144,.44)';
          ctx.beginPath();
          ctx.moveTo(cr.x + 8, cr.y + 8);
          ctx.lineTo(cr.x + 26, cr.y + 8);
          ctx.moveTo(cr.x + 8, cr.y + 8);
          ctx.lineTo(cr.x + 8, cr.y + 26);
          ctx.moveTo(cr.x + cr.w - 8, cr.y + cr.h - 8);
          ctx.lineTo(cr.x + cr.w - 26, cr.y + cr.h - 8);
          ctx.moveTo(cr.x + cr.w - 8, cr.y + cr.h - 8);
          ctx.lineTo(cr.x + cr.w - 8, cr.y + cr.h - 26);
          ctx.stroke();
          ctx.restore();
          if(cell.blocked){
            drawBlockOverlay(ctx, cr, cell.blocked);
          } else if(cell.markSafe) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(cr.x + cr.w - Math.max(7, cr.w * .12), cr.y + Math.max(7, cr.w * .12), Math.max(3, cr.w * .045), 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(105,190,255,.75)';
            ctx.fill();
            ctx.restore();
          }
        });
      });
    });

    let cards = 0;
    const onChange = function(rec, reason){
      if(reason === 'bitmap-ready') return;
      scheduleTextureRender('texture-ready');
    };
    const movingCards = [];
    const depthSortedCards = (layout.cardRects || []).slice().sort(function(a, b){
      const ar = rect((a && (a.cardRect || a.rect)) || null, originX, originY);
      const br = rect((b && (b.cardRect || b.rect)) || null, originX, originY);
      return (ar.y + ar.h) - (br.y + br.h);
    });
    depthSortedCards.forEach(function(entry){
      if(!entry || !entry.card) return;
      const r = rect(entry.cardRect || entry.rect, originX, originY);
      hitMap.cards.push({
        z:entry.z,
        r:entry.r,
        c:entry.c,
        rect:r,
        card:entry.card || null
      });
      const visual = entry.card.visual || null;
      const iid = getCardIid(entry.card);
      if(isBoardCardHiddenForVfx(iid)){
        cards++;
        return;
      }
      observeCardForAnimations(entry.card, visual, r);
      const tributeState = getTributeState(entry);
      const move = observeCardForMove(entry.card, r, snapshotChangedForMove);
      if(move && move.kind === 'card-move' && !move.done){
        movingCards.push({entry, visual, rect:r, move, tributeState});
      } else {
        drawCardVisual(ctx, entry, visual, r, onChange, {tributeState, boardH:boardRect.h, opponent:entry.card && entry.card.owner !== snapshot.viewer});
      }
      cards++;
    });
    movingCards.forEach(function(item){
      const r = rectFromMove(item.move, item.rect);
      const raw = Number(item.move && item.move.progress) || 0;
      const arc = Math.sin(Math.PI * Math.max(0, Math.min(1, raw)));
      const lift = item.move && item.move.flight ? (.36 + arc * .9) : (.22 + arc * .36);
      drawCardVisual(ctx, item.entry, item.visual, r, onChange, {tributeState:item.tributeState, boardH:boardRect.h, lift, opponent:item.entry.card && item.entry.card.owner !== snapshot.viewer});
    });
    return {cards, zones:zones.length, boardRect, hitMap};
  }

  function syncHoverCanvas(canvas, cssW, cssH, dpr, scaleMetrics){
    const layers = canvas && canvas.__fateLayers ? canvas.__fateLayers : {};
    const boardLayers = [layers.background, layers.effects, layers.particles, layers.hover].filter(Boolean);
    boardLayers.forEach(function(layer){
      const pxW = Math.max(1, Math.round(cssW * dpr));
      const pxH = Math.max(1, Math.round(cssH * dpr));
      if(layer.width !== pxW) layer.width = pxW;
      if(layer.height !== pxH) layer.height = pxH;
      layer.style.width = cssW + 'px';
      layer.style.height = cssH + 'px';
    });
    const uiLayer = layers.ui;
    if(uiLayer) {
      const uiW = Math.max(1, window.innerWidth || cssW);
      const uiH = Math.max(1, window.innerHeight || cssH);
      const uiPxW = Math.max(1, Math.round(uiW * dpr));
      const uiPxH = Math.max(1, Math.round(uiH * dpr));
      if(uiLayer.width !== uiPxW) uiLayer.width = uiPxW;
      if(uiLayer.height !== uiPxH) uiLayer.height = uiPxH;
      uiLayer.style.width = uiW + 'px';
      uiLayer.style.height = uiH + 'px';
    }
    const hoverCanvas = layers.hover || document.getElementById(hoverCanvasId);
    if(!hoverCanvas || !canvas) return null;
    const pxW = Math.max(1, Math.round(cssW * dpr));
    const pxH = Math.max(1, Math.round(cssH * dpr));
    if(hoverCanvas.width !== pxW) hoverCanvas.width = pxW;
    if(hoverCanvas.height !== pxH) hoverCanvas.height = pxH;
    hoverCanvas.style.width = cssW + 'px';
    hoverCanvas.style.height = cssH + 'px';
    lastCanvasMetrics = Object.assign({cssW, cssH, dpr}, scaleMetrics || {});
    return hoverCanvas;
  }

  function refreshHoverHitFromHitMap(hitMap){
    if(!hoverHit || !hitMap) return;
    const list = hoverHit.kind === 'card' ? hitMap.cards : hitMap.cells;
    const found = Array.isArray(list) ? list.find(function(hit){
      return hit && hit.z === hoverHit.z && hit.r === hoverHit.r && hit.c === hoverHit.c;
    }) : null;
    if(found) hoverHit = Object.assign({kind:hoverHit.kind, dragState:hoverHit.dragState || ''}, found, {dragState:hoverHit.dragState || ''});
  }

  function drawHoverOverlay(options){
    const opts = options || {};
    const metrics = lastCanvasMetrics;
    const hoverCanvas = document.getElementById(hoverCanvasId);
    const ctx = hoverCanvas && hoverCanvas.getContext ? hoverCanvas.getContext('2d', {alpha:true}) : null;
    if(!ctx || !metrics) return false;
    ctx.setTransform(metrics.dpr, 0, 0, metrics.dpr, 0, 0);
    ctx.clearRect(0, 0, metrics.cssW, metrics.cssH);
    drawHoverCue(ctx, hoverHit);
    renderCounters.hoverLayerRedraws++;
    if(opts.dirty !== false) {
      renderCounters.hoverOnlyDraws++;
      renderCounters.lastDirtyMask = DIRTY_HOVER;
      renderCounters.lastDirtySource = 'hover';
    }
    return true;
  }

  function drawVfxLayers(layers, cssW, cssH, dpr, options){
    const opts = options || {};
    const director = window.FateVfxDirector;
    if(!director || typeof director.draw !== 'function') return null;
    const effects = layers && layers.effects;
    const particles = layers && layers.particles;
    const effectsCtx = effects && effects.getContext ? effects.getContext('2d', {alpha:true}) : null;
    const particleCtx = particles && particles.getContext ? particles.getContext('2d', {alpha:true}) : null;
    if(effectsCtx){
      effectsCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if(opts.clearEffects !== false) {
        effectsCtx.clearRect(0, 0, effects.width / dpr, effects.height / dpr);
        renderCounters.effectLayerRedraws++;
      }
    }
    if(particleCtx){
      particleCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if(opts.clearParticles !== false) {
        particleCtx.clearRect(0, 0, particles.width / dpr, particles.height / dpr);
        renderCounters.particleLayerRedraws++;
      }
    }
    return director.draw({
      effectsCtx,
      particleCtx,
      cssW,
      cssH,
      dpr
    });
  }

  function scheduleHoverDraw(){
    if(hoverRaf) return;
    hoverRaf = requestAnimationFrame(function(){
      recordRafGap();
      hoverRaf = 0;
      drawHoverOverlay();
    });
  }

  function ensureInput(canvas){
    if(!canvas || !ownsBoard() || !isActiveMatchScreen()) return;
    if(!window.FateMatchSceneInput) return;
    if(!input) input = new window.FateMatchSceneInput(window.FateMatchRendererAdapter);
    else if(typeof input.updateScene === 'function') input.updateScene(window.FateMatchRendererAdapter);
    input.attach(canvas);
  }

  function renderFromGameState(options){
    const started = nowMs();
    const source = options && options.source || '';
    const dirtyMask = Number(options && options.dirtyMask) || dirtyMaskForSource(source);
    noteGameplayBurst(dirtyMask);
    if(!isActiveMatchScreen()) return teardownScene('inactive-match-screen');
    const board = document.getElementById('board');
    if(!board) return teardownScene('board-unavailable');
    const canvas = ensureCanvas(board);
    const layers = canvas && canvas.__fateLayers ? canvas.__fateLayers : {};
    const ctx = canvas && canvas.getContext ? canvas.getContext('2d', {alpha:true}) : null;
    if(!ctx) return null;

    const vfxOnly = !!(lastReport && lastReport.available && lastCanvasMetrics)
      && !!(dirtyMask & (DIRTY_EFFECTS | DIRTY_PARTICLES))
      && !(dirtyMask & (DIRTY_LAYOUT | DIRTY_BACKGROUND | DIRTY_BOARD_CARDS | DIRTY_HAND | DIRTY_OPP_HAND | DIRTY_PILES | DIRTY_MOTION));
    if(vfxOnly){
      const metrics = lastCanvasMetrics;
      drawVfxLayers(layers, metrics.cssW, metrics.cssH, metrics.dpr, {clearEffects:true, clearParticles:true});
      drawHoverOverlay({dirty:false});
      renderCounters.dirtyDraws++;
      renderCounters.vfxOnlyDraws++;
      renderCounters.lastVfxLayerOnly = true;
      renderCounters.lastDirtyMask = dirtyMask;
      renderCounters.lastDirtySource = source || '';
      const frameMs = nowMs() - started;
      recordFrameMs(frameMs);
      const layerCount = layerIds.reduce(function(total, id){ return total + (document.getElementById(id) ? 1 : 0); }, 0);
      lastReport = Object.assign({}, lastReport || {}, {
        dirtyDraws:renderCounters.dirtyDraws,
        fullSceneRedraws:renderCounters.fullSceneRedraws,
        backgroundLayerRedraws:renderCounters.backgroundLayerRedraws,
        cardLayerRedraws:renderCounters.cardLayerRedraws,
        effectLayerRedraws:renderCounters.effectLayerRedraws,
        particleLayerRedraws:renderCounters.particleLayerRedraws,
        uiLayerRedraws:renderCounters.uiLayerRedraws,
        hoverLayerRedraws:renderCounters.hoverLayerRedraws,
        hoverOnlyDraws:renderCounters.hoverOnlyDraws,
        vfxOnlyDraws:renderCounters.vfxOnlyDraws,
        vfxFullSceneFallbacks:renderCounters.vfxFullSceneFallbacks,
        lastVfxLayerOnly:renderCounters.lastVfxLayerOnly,
        lastDirtyMask:renderCounters.lastDirtyMask,
        lastDirtySource:renderCounters.lastDirtySource,
        canvas:Object.assign({}, lastReport.canvas || {}, {
          totalLayerPixelArea:totalLayerPixelArea(),
          layers:layerCount
        }),
        vfx:window.FateVfxDirector && typeof window.FateVfxDirector.report === 'function' ? window.FateVfxDirector.report() : null,
        lastMs:roundMs(frameMs),
        avgMs:roundMs(averageFrameMs()),
        maxMs:roundMs(maxFrameMs()),
        rafAvgGapMs:roundMs(averageRafGapMs()),
        rafMaxGapMs:roundMs(maxRafGapMs()),
        rafSamples:rafGapSamples.length,
        rafLongIdleGaps,
        fps:averageFrameMs() > 0 ? roundMs(1000 / averageFrameMs()) : 0,
        source
      });
      return lastReport;
    }

    const snapshot = options && options.snapshot
      ? options.snapshot
      : (typeof window.fateBuildRenderSnapshot === 'function' ? window.fateBuildRenderSnapshot() : null);
    if(!snapshot) {
      lastReport = {available:false, reason:'snapshot-unavailable', version:ADAPTER_VERSION};
      return lastReport;
    }

    const boardRect = board.getBoundingClientRect ? board.getBoundingClientRect() : {left:0, top:0, width:board.clientWidth || 1280, height:board.clientHeight || 720};
    const maxRows = Array.isArray(snapshot.board)
      ? snapshot.board.reduce(function(max, zone){ return Math.max(max, Array.isArray(zone && zone.rows) ? zone.rows.length : 0); }, 3)
      : 3;
    const viewportW = Math.max(1, board.clientWidth || board.scrollWidth || boardRect.width || 1280);
    const viewportH = Math.max(1, board.clientHeight || board.scrollHeight || boardRect.height || 720);
    const extraRows = Math.max(0, maxRows - 3);
    const cssW = viewportW;
    const cssH = Math.max(viewportH, viewportH + extraRows * Math.max(130, Math.min(190, viewportW * .105)));
    const scaleMetrics = getRenderScaleMetrics();
    const effectiveDpr = scaleMetrics.effectiveDpr;
    const layout = typeof window.fateBuildMatchLayout === 'function'
      ? window.fateBuildMatchLayout({
        snapshot,
        viewport:{
          x:boardRect.left || 0,
          y:boardRect.top || 0,
          w:cssW,
          h:cssH,
          dpr:scaleMetrics.rawDpr,
          renderScale:scaleMetrics.renderScale,
          effectiveDpr,
          windowW:window.innerWidth || cssW,
          windowH:window.innerHeight || viewportH
        }
      })
      : null;
    if(!layout) {
      lastReport = {available:false, reason:'layout-unavailable', version:ADAPTER_VERSION};
      return lastReport;
    }
    const dpr = effectiveDpr;
    const pxW = Math.max(1, Math.round(cssW * dpr));
    const pxH = Math.max(1, Math.round(cssH * dpr));
    let canvasResized = false;
    if(canvas.width !== pxW || canvas.height !== pxH){
      canvas.width = pxW;
      canvas.height = pxH;
      canvasResized = true;
    }
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    syncHoverCanvas(canvas, cssW, cssH, dpr, scaleMetrics);
    const uiOnly = !!(lastReport && lastReport.available && lastHitMap.cards && lastHitMap.cards.length)
      && !(dirtyMask & (DIRTY_LAYOUT | DIRTY_BACKGROUND | DIRTY_BOARD_CARDS | DIRTY_MOTION))
      && !!(dirtyMask & (DIRTY_HAND | DIRTY_OPP_HAND | DIRTY_PILES | DIRTY_EFFECTS));
    if(uiOnly){
      ensureInput(canvas);
      const uiLayer = layers.ui;
      const uiCtx = uiLayer && uiLayer.getContext ? uiLayer.getContext('2d', {alpha:true}) : null;
      if(uiCtx){
        uiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        uiCtx.clearRect(0, 0, uiLayer.width / dpr, uiLayer.height / dpr);
        renderCounters.uiLayerRedraws++;
      }
      const uiHitMap = uiCtx ? drawSceneUi(uiCtx, layout, snapshot, uiLayer.width / dpr, uiLayer.height / dpr) : {handCards:[], opponentHandCards:[], piles:[], uiCommands:[]};
      lastHitMap = {
        cards:lastHitMap.cards || [],
        cells:lastHitMap.cells || [],
        handCards:uiHitMap.handCards || [],
        opponentHandCards:uiHitMap.opponentHandCards || [],
        piles:uiHitMap.piles || [],
        uiCommands:uiHitMap.uiCommands || []
      };
      if(dirtyMask & (DIRTY_EFFECTS | DIRTY_PARTICLES | DIRTY_MOTION)) {
        drawVfxLayers(layers, cssW, cssH, dpr, {clearEffects:true, clearParticles:true});
      }
      drawHoverOverlay({dirty:false});
      renderCounters.dirtyDraws++;
      renderCounters.lastDirtyMask = dirtyMask;
      renderCounters.lastDirtySource = source || '';
      const frameMs = nowMs() - started;
      recordFrameMs(frameMs);
      const layerCount = layerIds.reduce(function(total, id){ return total + (document.getElementById(id) ? 1 : 0); }, 0);
      lastReport = Object.assign({}, lastReport, {
        draws:drawCount,
        dirtyDraws:renderCounters.dirtyDraws,
        fullSceneRedraws:renderCounters.fullSceneRedraws,
        backgroundLayerRedraws:renderCounters.backgroundLayerRedraws,
        cardLayerRedraws:renderCounters.cardLayerRedraws,
        effectLayerRedraws:renderCounters.effectLayerRedraws,
        particleLayerRedraws:renderCounters.particleLayerRedraws,
        uiLayerRedraws:renderCounters.uiLayerRedraws,
        hoverLayerRedraws:renderCounters.hoverLayerRedraws,
        hoverOnlyDraws:renderCounters.hoverOnlyDraws,
        vfxOnlyDraws:renderCounters.vfxOnlyDraws,
        vfxFullSceneFallbacks:renderCounters.vfxFullSceneFallbacks,
        lastVfxLayerOnly:renderCounters.lastVfxLayerOnly,
        lastDirtyMask:renderCounters.lastDirtyMask,
        lastDirtySource:renderCounters.lastDirtySource,
        hand:{v2Cards:lastHitMap.handCards.length},
        opponentHand:{v2Cards:lastHitMap.opponentHandCards.length},
        piles:{v2Piles:lastHitMap.piles.length > 0, v2PileCount:lastHitMap.piles.length},
        hitMap:{cards:lastHitMap.cards.length, cells:lastHitMap.cells.length, handCards:lastHitMap.handCards.length, opponentHandCards:lastHitMap.opponentHandCards.length, piles:lastHitMap.piles.length, uiCommands:lastHitMap.uiCommands.length},
        canvas:Object.assign({}, lastReport.canvas || {}, {
          dpr:scaleMetrics.rawDpr,
          maxDpr:scaleMetrics.maxDpr,
          renderScale:scaleMetrics.renderScale,
          effectiveDpr,
          totalLayerPixelArea:totalLayerPixelArea(),
          layers:layerCount
        }),
        lastMs:roundMs(frameMs),
        avgMs:roundMs(averageFrameMs()),
        maxMs:roundMs(maxFrameMs()),
        rafAvgGapMs:roundMs(averageRafGapMs()),
        rafMaxGapMs:roundMs(maxRafGapMs()),
        rafSamples:rafGapSamples.length,
        rafLongIdleGaps,
        fps:averageFrameMs() > 0 ? roundMs(1000 / averageFrameMs()) : 0,
        vfx:window.FateVfxDirector && typeof window.FateVfxDirector.report === 'function' ? window.FateVfxDirector.report() : null,
        source
      });
      if(maybeAdaptRenderScale()) scheduleRender('adaptive-render-scale');
      return lastReport;
    }
    ['background', 'effects', 'particles', 'ui'].forEach(function(name){
      const layer = layers[name];
      const layerCtx = layer && layer.getContext ? layer.getContext('2d', {alpha:true}) : null;
      const shouldClear = canvasResized
        || (name === 'background' && !!(dirtyMask & (DIRTY_LAYOUT | DIRTY_BACKGROUND)))
        || (name === 'effects' && !!(dirtyMask & (DIRTY_LAYOUT | DIRTY_EFFECTS | DIRTY_MOTION)))
        || (name === 'particles' && !!(dirtyMask & (DIRTY_LAYOUT | DIRTY_PARTICLES | DIRTY_EFFECTS | DIRTY_MOTION)))
        || (name === 'ui' && !!(dirtyMask & (DIRTY_LAYOUT | DIRTY_HAND | DIRTY_OPP_HAND | DIRTY_PILES)));
      if(!shouldClear) return;
      if(layerCtx){
        layerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        layerCtx.clearRect(0, 0, layer.width / dpr, layer.height / dpr);
        if(name === 'background') renderCounters.backgroundLayerRedraws++;
        else if(name === 'effects') renderCounters.effectLayerRedraws++;
        else if(name === 'particles') renderCounters.particleLayerRedraws++;
        else if(name === 'ui') renderCounters.uiLayerRedraws++;
      }
    });
    ensureInput(canvas);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const draw = drawScene(ctx, layout, snapshot, cssW, cssH, dpr);
    renderCounters.cardLayerRedraws++;
    const uiCtx = layers.ui && layers.ui.getContext ? layers.ui.getContext('2d', {alpha:true}) : null;
    const shouldDrawUi = canvasResized || !!(dirtyMask & (DIRTY_LAYOUT | DIRTY_HAND | DIRTY_OPP_HAND | DIRTY_PILES));
    const uiHitMap = shouldDrawUi && uiCtx ? drawSceneUi(uiCtx, layout, snapshot, layers.ui.width / dpr, layers.ui.height / dpr) : {
      handCards:lastHitMap.handCards || [],
      opponentHandCards:lastHitMap.opponentHandCards || [],
      piles:lastHitMap.piles || [],
      uiCommands:lastHitMap.uiCommands || []
    };
    lastHitMap = {
      cards:draw.hitMap.cards || [],
      cells:draw.hitMap.cells || [],
      handCards:uiHitMap.handCards || [],
      opponentHandCards:uiHitMap.opponentHandCards || [],
      piles:uiHitMap.piles || [],
      uiCommands:uiHitMap.uiCommands || []
    };
    drawVfxLayers(layers, cssW, cssH, dpr, {clearEffects:false, clearParticles:false});
    refreshHoverHitFromHitMap(draw.hitMap);
    drawHoverOverlay({dirty:false});
    drawCount++;
    renderCounters.fullSceneRedraws++;
    if(String(source || '').toLowerCase().indexOf('vfx') >= 0) {
      renderCounters.vfxFullSceneFallbacks++;
      renderCounters.lastVfxLayerOnly = false;
    }
    renderCounters.lastDirtyMask = dirtyMask;
    renderCounters.lastDirtySource = source || '';
    const domCells = board.querySelectorAll('.cell').length;
    const domCards = board.querySelectorAll('.bc').length;
    const layerCount = layerIds.reduce(function(total, id){ return total + (document.getElementById(id) ? 1 : 0); }, 0);
    const frameMs = nowMs() - started;
    recordFrameMs(frameMs);
    const layerPixelArea = totalLayerPixelArea();
    lastReport = {
      available:true,
      version:ADAPTER_VERSION,
      ownsBoard:ownsBoard(),
      draws:drawCount,
      dirtyDraws:renderCounters.dirtyDraws,
      fullSceneRedraws:renderCounters.fullSceneRedraws,
      backgroundLayerRedraws:renderCounters.backgroundLayerRedraws,
      cardLayerRedraws:renderCounters.cardLayerRedraws,
      effectLayerRedraws:renderCounters.effectLayerRedraws,
      particleLayerRedraws:renderCounters.particleLayerRedraws,
      uiLayerRedraws:renderCounters.uiLayerRedraws,
      hoverLayerRedraws:renderCounters.hoverLayerRedraws,
      hoverOnlyDraws:renderCounters.hoverOnlyDraws,
      vfxOnlyDraws:renderCounters.vfxOnlyDraws,
      vfxFullSceneFallbacks:renderCounters.vfxFullSceneFallbacks,
      lastVfxLayerOnly:renderCounters.lastVfxLayerOnly,
      lastDirtyMask:renderCounters.lastDirtyMask,
      lastDirtySource:renderCounters.lastDirtySource,
      cards:draw.cards,
      expectedCards:snapshot.counts && snapshot.counts.boardCards || 0,
      zones:draw.zones,
      domCells,
      domCards,
      layerCanvases:layerCount,
      layers:layerCount,
      ownsHand:ownsHand(),
      ownsOpponentHand:ownsOpponentHand(),
      ownsPiles:ownsPiles(),
      hand:{v2Cards:lastHitMap.handCards.length},
      opponentHand:{v2Cards:lastHitMap.opponentHandCards.length},
      piles:{v2Piles:lastHitMap.piles.length > 0, v2PileCount:lastHitMap.piles.length},
      hitMap:{cards:lastHitMap.cards.length, cells:lastHitMap.cells.length, handCards:lastHitMap.handCards.length, opponentHandCards:lastHitMap.opponentHandCards.length, piles:lastHitMap.piles.length, uiCommands:lastHitMap.uiCommands.length},
      hover:hoverHit ? {kind:hoverHit.kind, z:hoverHit.z, r:hoverHit.r, c:hoverHit.c} : null,
      animations:getTimeline() && typeof getTimeline().report === 'function' ? getTimeline().report() : null,
      vfx:window.FateVfxDirector && typeof window.FateVfxDirector.report === 'function' ? window.FateVfxDirector.report() : null,
      canvas:{
        width:canvas.width,
        height:canvas.height,
        cssW,
        cssH,
        dpr:scaleMetrics.rawDpr,
        maxDpr:scaleMetrics.maxDpr,
        renderScale:scaleMetrics.renderScale,
        effectiveDpr,
        pixelArea:canvas.width * canvas.height,
        totalLayerPixelArea:layerPixelArea,
        layers:layerCount
      },
      snapshotSignature:snapshot.signature || '',
      layoutSignature:layout.snapshotSignature || '',
      lastMs:roundMs(frameMs),
      avgMs:roundMs(averageFrameMs()),
      maxMs:roundMs(maxFrameMs()),
      rafAvgGapMs:roundMs(averageRafGapMs()),
      rafMaxGapMs:roundMs(maxRafGapMs()),
      rafSamples:rafGapSamples.length,
      rafLongIdleGaps,
      fps:averageFrameMs() > 0 ? roundMs(1000 / averageFrameMs()) : 0,
      source
    };
    if(maybeAdaptRenderScale()) scheduleRender('adaptive-render-scale');
    if(getTimeline() && getTimeline().hasActiveAnimations && getTimeline().hasActiveAnimations()) scheduleRender('animation');
    return lastReport;
  }

  function scheduleRender(source){
    const src = source || 'scheduled';
    pendingDirtyMask |= dirtyMaskForSource(src);
    if(pendingDirtySources.indexOf(src) < 0) pendingDirtySources.push(src);
    if(redrawRaf) return;
    redrawRaf = requestAnimationFrame(function(){
      recordRafGap();
      redrawRaf = 0;
      const dirtyMask = pendingDirtyMask || DIRTY_ALL;
      const sources = pendingDirtySources.join('+') || 'scheduled';
      pendingDirtyMask = 0;
      pendingDirtySources = [];
      if(!isActiveMatchScreen()) {
        teardownScene('scheduled-offscreen');
        return;
      }
      if(ownsBoard()) renderFromGameState({source:sources, dirtyMask});
    });
  }

  function report(){
    return Object.assign({
      available:true,
      version:ADAPTER_VERSION,
      ownsBoard:ownsBoard(),
      ownsHand:ownsHand(),
      ownsOpponentHand:ownsOpponentHand(),
      ownsPiles:ownsPiles(),
      enableFlag:localGet('fateEnableMatchRendererV2') === '1',
      defaultEnabled:true,
      disabled:localGet('fateDisableMatchRendererV2') === '1'
    }, lastReport || {});
  }

  function getHitMap(){
    return lastHitMap;
  }

  function setHoverHit(hit){
    const prev = hoverHit;
    const next = hit || null;
    const prevKey = prev ? [prev.kind, prev.z, prev.r, prev.c, prev.dragState || ''].join(':') : '';
    const nextKey = next ? [next.kind, next.z, next.r, next.c, next.dragState || ''].join(':') : '';
    if(prevKey === nextKey) return;
    hoverHit = next;
    scheduleHoverDraw();
  }

  window.FateMatchRendererAdapter = {
    version:ADAPTER_VERSION,
    ownsBoard,
    ownsHand,
    ownsOpponentHand,
    ownsPiles,
    renderFromGameState,
    scheduleRender,
    getHitMap,
    setHoverHit,
    queuePlacementMotion,
    teardownScene,
    resetPerformanceSamples,
    report,
    enable,
    disable
  };
  window.fateEnableMatchRendererV2 = function(){
    const result = enable();
    if(typeof window.renderBoard === 'function') setTimeout(window.renderBoard, 0);
    return result;
  };
  window.fateDisableMatchRendererV2 = function(){
    const result = disable();
    location.reload();
    return result;
  };
  window.fateMatchRendererV2Report = report;

  window.addEventListener('resize', function(){ if(ownsBoard()) scheduleRender('resize'); }, {passive:true});
  window.addEventListener('fate-screen-changed', function(ev){
    const to = ev && ev.detail ? ev.detail.to : '';
    if(to !== 's-game') teardownScene('screen-change');
    else if(ownsBoard()) scheduleRender('screen-enter');
  });
})();
