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
  let viewportHoverHit = null;
  let redrawRaf = 0;
  let hoverRaf = 0;
  let pendingDirtyMask = 0;
  let pendingDirtySources = [];
  const pendingTextureTimers = {};
  let lastCanvasMetrics = null;
  let lastLayout = null;
  let stableBoardViewport = null;
  const zoneScroll = {};
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
    if(s.indexOf('consolidat') >= 0 || s.indexOf('tribute') >= 0) return DIRTY_BOARD_CARDS | DIRTY_HOVER | DIRTY_HAND | DIRTY_EFFECTS;
    if(s.indexOf('hand-hover') >= 0 || s.indexOf('viewport-hover') >= 0) return DIRTY_HAND | DIRTY_OPP_HAND | DIRTY_PILES;
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
    board.style.left = '';
    board.style.top = '';
    board.style.width = '';
    board.style.height = '';
    board.style.minHeight = 'min(70vh, 760px)';
    board.style.maxHeight = '';
    board.style.overflow = 'hidden';
    board.style.pointerEvents = '';
    board.style.zIndex = '';
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

  function getStableBoardViewport(board, measuredRect){
    const fallback = measuredRect || {left:0, top:0, width:window.innerWidth || 1280, height:window.innerHeight || 720};
    const winW = Math.max(1, Math.round(window.innerWidth || fallback.width || 1280));
    const winH = Math.max(1, Math.round(window.innerHeight || fallback.height || 720));
    const key = winW + 'x' + winH;
    const measured = {
      key,
      left:Number(fallback.left) || 0,
      top:Number(fallback.top) || 0,
      width:Math.max(1, Number(fallback.width) || (board && board.clientWidth) || winW),
      height:Math.max(1, Number(fallback.height) || (board && board.clientHeight) || winH)
    };
    if(stableBoardViewport && stableBoardViewport.key === key) {
      const dx = Math.abs(measured.left - stableBoardViewport.left);
      const dy = Math.abs(measured.top - stableBoardViewport.top);
      const dw = Math.abs(measured.width - stableBoardViewport.width);
      const dh = Math.abs(measured.height - stableBoardViewport.height);
      if(dx < 36 && dy < 36 && dw < 72 && dh < 72) return stableBoardViewport;
    }
    stableBoardViewport = {
      key:measured.key,
      left:measured.left,
      top:measured.top,
      width:measured.width,
      height:measured.height
    };
    return stableBoardViewport;
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
    const size = Math.max(24, Math.min(34, r.w * .24));
    const x = r.x + r.w - size - 3;
    const y = r.y + 3;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8,9,14,.98)';
    ctx.fill();
    ctx.lineWidth = 1.35;
    ctx.strokeStyle = visual && visual.isHidden ? '#ffd95c' : '#ffd95c';
    ctx.stroke();
    ctx.fillStyle = '#ffd95c';
    ctx.font = '900 ' + Math.max(10, Math.round(size * .52)) + 'px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(visual && visual.isHidden ? '-' : fate, x + size / 2, y + size / 2 + 1);
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
      const entryZ = Number(entry.z);
      const entryR = Number(entry.r);
      const entryC = Number(entry.c);
      const entryIid = getCardIid(entry.card);
      const entryId = entry && entry.card && entry.card.id != null ? String(entry.card.id) : '';
      const idx = all.findIndex(function(s){
        const card = s && s.card;
        const sameCoords = s && Number(s.z) === entryZ && Number(s.r) === entryR && Number(s.c) === entryC;
        const sameIid = entryIid && card && card.iid != null && String(card.iid) === entryIid;
        const sameIdAtCoords = sameCoords && entryId && card && card.id != null && String(card.id) === entryId;
        return sameIid || sameIdAtCoords || sameCoords;
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
      return '';
    } catch(e) {
      return '';
    }
  }

  function drawTributeCue(ctx, r, state){
    if(!state) return;
    const selected = state === 'selected';
    const placement = state === 'placement';
    const ready = state === 'ready';
    if(!selected && !placement && !ready) return;
    const color = ready ? 'rgba(146,230,255,.96)' : selected ? 'rgba(255,244,132,.96)' : placement ? 'rgba(255,225,92,.92)' : 'rgba(255,220,72,.86)';
    const radius = Math.max(5, Math.min(10, r.w * .06));
    const inset = 2.4;
    ctx.save();
    roundedPath(ctx, r.x + inset, r.y + inset, Math.max(1, r.w - inset * 2), Math.max(1, r.h - inset * 2), radius);
    ctx.lineWidth = ready ? 3.4 : (selected ? 3.1 : 2.4);
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
  }

  function drawConsolidationCardOverlay(ctx, r, state){
    return;
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
    if(!opts.hideFateBadge) drawFateBadge(ctx, visual, r);
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

  function drawTopCornerRails(ctx, r, color, alpha){
    const len = Math.max(24, Math.min(42, r.w * .076));
    const inset = 15;
    const y = r.y + inset;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.35;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(r.x + inset, r.y + len);
    ctx.lineTo(r.x + inset, y);
    ctx.lineTo(r.x + len, y);
    ctx.moveTo(r.x + r.w - len, y);
    ctx.lineTo(r.x + r.w - inset, y);
    ctx.lineTo(r.x + r.w - inset, r.y + len);
    ctx.stroke();
    ctx.restore();
  }

  function drawCellHatch(ctx, r, color){
    return;
  }

  function drawZonePanel(ctx, zone, zoneRect, headerRect, snapshot){
    const ownerTint = 'rgba(74,76,70,.20)';
    const panelGrad = ctx.createLinearGradient(zoneRect.x, zoneRect.y, zoneRect.x, zoneRect.y + zoneRect.h);
    panelGrad.addColorStop(0, 'rgba(20,22,22,.48)');
    panelGrad.addColorStop(.38, ownerTint);
    panelGrad.addColorStop(1, 'rgba(8,10,12,.45)');

    roundedPath(ctx, zoneRect.x, zoneRect.y, zoneRect.w, zoneRect.h, 8);
    ctx.fillStyle = panelGrad;
    ctx.fill();
    const innerGlow = ctx.createLinearGradient(zoneRect.x, zoneRect.y, zoneRect.x + zoneRect.w, zoneRect.y + zoneRect.h);
    innerGlow.addColorStop(0, 'rgba(255,244,194,.035)');
    innerGlow.addColorStop(.55, 'rgba(255,255,255,.012)');
    innerGlow.addColorStop(1, 'rgba(8,8,8,.055)');
    roundedPath(ctx, zoneRect.x + 2, zoneRect.y + 2, zoneRect.w - 4, zoneRect.h - 4, 6);
    ctx.fillStyle = innerGlow;
    ctx.fill();
    ctx.lineWidth = 1.95;
    ctx.strokeStyle = 'rgba(255,224,92,.98)';
    ctx.stroke();

    drawTopCornerRails(ctx, zoneRect, 'rgba(255,226,96,.95)', .9);

    const badgeW = Math.min(118, Math.max(94, zoneRect.w * .24));
    const badgeX = headerRect.x + headerRect.w / 2 - badgeW / 2;
    const badgeH = 18;
    const badgeY = Math.max(2, headerRect.y - 7);
    roundedPath(ctx, badgeX, badgeY, badgeW, badgeH, 6);
    const badgeGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + badgeH);
    badgeGrad.addColorStop(0, 'rgba(18,18,15,.96)');
    badgeGrad.addColorStop(1, 'rgba(2,3,6,.88)');
    ctx.fillStyle = badgeGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,224,116,.76)';
    ctx.stroke();
    ctx.fillStyle = '#f2d778';
    ctx.font = '800 8px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ZONE ' + (zone.z + 1), headerRect.x + headerRect.w / 2, badgeY + badgeH / 2);

    const s0 = zoneScore(zone.z, 0);
    const s1 = zoneScore(zone.z, 1);
    const scoreW = Math.min(302, Math.max(226, zoneRect.w * .62));
    const scoreX = headerRect.x + headerRect.w / 2 - scoreW / 2;
    const scoreY = headerRect.y + 29;
    roundedPath(ctx, scoreX, scoreY, scoreW, 25, 12.5);
    const scoreGrad = ctx.createLinearGradient(scoreX, scoreY, scoreX + scoreW, scoreY + 25);
    scoreGrad.addColorStop(0, 'rgba(13,13,11,.94)');
    scoreGrad.addColorStop(.48, 'rgba(5,5,6,.96)');
    scoreGrad.addColorStop(1, 'rgba(18,14,8,.94)');
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
    ctx.fillText('FATE', scoreX + scoreW / 2, scoreY + 12);
    ctx.fillStyle = 'rgba(255,229,136,.34)';
    ctx.fillRect(scoreX + 60, scoreY + 18, scoreW - 120, 1);
  }

  function drawZoneCellPerimeter(ctx, zone, originX, originY, scrollY, clip){
    return;
    const rows = zone && Array.isArray(zone.rows) ? zone.rows : [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    rows.forEach(function(row){
      (row.cells || []).forEach(function(cell){
        const r = rect(cell.rect, originX, originY);
        r.y -= Number(scrollY) || 0;
        if(clip && !intersects(r, clip)) return;
        if(!r || !r.w || !r.h) return;
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.w);
        maxY = Math.max(maxY, r.y + r.h);
      });
    });
    if(!Number.isFinite(minX) || !Number.isFinite(minY) || maxX <= minX || maxY <= minY) return;
    return;
  }

  function intersects(a, b){
    return !!(a && b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y);
  }

  function intersectRect(a, b){
    if(!intersects(a, b)) return null;
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const maxX = Math.min(a.x + a.w, b.x + b.w);
    const maxY = Math.min(a.y + a.h, b.y + b.h);
    return {x, y, w:Math.max(0, maxX - x), h:Math.max(0, maxY - y)};
  }

  function zoneScrollMax(zone){
    const rows = zone && zone.rowsRect ? zone.rowsRect : null;
    const content = zone && zone.rowsContentRect ? zone.rowsContentRect : rows;
    if(!rows || !content) return 0;
    return Math.max(0, (Number(content.h) || 0) - (Number(rows.h) || 0));
  }

  function getZoneScroll(zone){
    if(!zone) return 0;
    const max = zoneScrollMax(zone);
    const z = String(zone.z);
    const value = Math.max(0, Math.min(max, Number(zoneScroll[z]) || 0));
    zoneScroll[z] = value;
    return value;
  }

  function drawZoneScrollRail(ctx, zone, clip){
    const max = zoneScrollMax(zone);
    if(max <= 0 || !clip) return;
    const scrollY = getZoneScroll(zone);
    const railX = clip.x + clip.w - 8;
    const railY = clip.y + 8;
    const railH = Math.max(20, clip.h - 16);
    const thumbH = Math.max(24, railH * (clip.h / (clip.h + max)));
    const thumbY = railY + (railH - thumbH) * (scrollY / max);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,226,96,.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(railX, railY);
    ctx.lineTo(railX, railY + railH);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,226,96,.54)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(railX, thumbY);
    ctx.lineTo(railX, thumbY + thumbH);
    ctx.stroke();
    ctx.restore();
  }

  function drawTableAtmosphere(ctx, cssW, cssH, boardRect){
    return;
  }

  function drawHoverCue(ctx, hit){
    if(!hit || !hit.rect) return;
    const cardLikeCell = hit.kind === 'cell' && hit.hasCard && hit.cardRect;
    const r = cardLikeCell ? hit.cardRect : (hit.visualRect || hit.rect);
    const good = hit.dragState !== 'invalid';
    ctx.save();
    if(hit.kind === 'card' || cardLikeCell){
      roundedPath(ctx, r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3, 6);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = good ? 'rgba(255,224,96,.86)' : 'rgba(255,101,115,.82)';
      ctx.shadowColor = good ? 'rgba(255,218,80,.35)' : 'rgba(255,101,115,.35)';
      ctx.shadowBlur = 8;
      ctx.stroke();
    } else {
      roundedPath(ctx, r.x, r.y, Math.max(0, r.w), Math.max(0, r.h), 5);
      ctx.lineWidth = good ? 1.6 : 2.1;
      ctx.strokeStyle = good ? 'rgba(255,238,142,.76)' : 'rgba(255,101,115,.82)';
      ctx.stroke();
      ctx.fillStyle = good ? 'rgba(236,203,101,.055)' : 'rgba(255,80,92,.08)';
      ctx.fill();
    }
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
    ctx.strokeStyle = 'rgba(255,226,105,.62)';
    ctx.stroke();
    ctx.save();
    ctx.globalAlpha = .72;
    ctx.strokeStyle = 'rgba(255,226,105,.58)';
    ctx.lineWidth = 1.25;
    roundedPath(ctx, r.x + r.w * .14, r.y + r.h * .13, r.w * .72, r.h * .74, Math.max(3, r.w * .04));
    ctx.stroke();
    ctx.restore();
  }

  function drawPileLabelStrip(ctx, pile, r){
    const label = pile && pile.pile === 'deck' ? 'Deck' : 'Discard';
    const count = String(Number(pile && pile.count) || 0);
    const stripH = Math.max(21, Math.min(29, r.h * .23));
    const stripY = r.y + r.h - stripH - 3;
    roundedPath(ctx, r.x + 5, stripY, Math.max(1, r.w - 10), stripH, 4);
    ctx.fillStyle = 'rgba(2,3,7,.88)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(239,205,91,.54)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#d7bd60';
    ctx.font = '800 ' + Math.max(10, Math.round(stripH * .42)) + 'px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label + ' (' + count + ')', r.x + r.w / 2, stripY + stripH / 2 + 1);
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
    if(isDeck) {
      ctx.strokeStyle = 'rgba(224,188,84,.42)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    const cardR = {x:r.x + 5, y:r.y + 5, w:Math.max(1, r.w - 10), h:Math.max(1, r.h - 10)};
    if(isDeck) {
      drawCardBack(ctx, cardR, 'Deck', 'deck.png');
    } else if(!top) {
      drawEmptyPileSlot(ctx, cardR);
    } else {
      drawCardContent(ctx, {card:top}, top.visual || top, cardR, function(){ scheduleTextureRender('pile-texture-ready'); }, {pulse:false, tilt:0, hideFateBadge:true});
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
    ctx.fillStyle = 'rgba(18,20,24,.52)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = 'rgba(120,120,120,.9)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(218,218,205,.34)';
    ctx.lineWidth = 1.1;
    roundedPath(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, Math.max(4, r.w * .048));
    ctx.stroke();
    ctx.restore();
  }

  function drawHoveredHandCard(ctx, entry, visual, r, onChange, disabled){
    const scale = 1.06;
    const lift = Math.max(8, r.h * .06);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    ctx.save();
    ctx.translate(cx, cy - lift);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
    drawCardVisual(ctx, entry, visual, r, onChange, {pulse:false, tilt:0, lift:.65, hideFateBadge:true});
    if(disabled) drawDisabledCardOverlay(ctx, r);
    ctx.restore();
  }

  function drawHandPanel(ctx, handRect, snapshot, count){
    if(!handRect) return;
    const r = handRect;
    ctx.save();
    roundedPath(ctx, r.x, r.y, r.w, r.h, 8);
    const bg = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    bg.addColorStop(0, 'rgba(12,13,16,.58)');
    bg.addColorStop(.46, 'rgba(3,4,8,.70)');
    bg.addColorStop(1, 'rgba(10,10,12,.56)');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,226,105,.82)';
    ctx.stroke();
    roundedPath(ctx, r.x + 10, r.y + 10, Math.max(1, r.w - 20), Math.max(1, r.h - 20), 5);
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = 'rgba(255,226,105,.58)';
    ctx.stroke();
    drawCornerRails(ctx, {x:r.x + 17, y:r.y + 17, w:Math.max(1, r.w - 34), h:Math.max(1, r.h - 34)}, 'rgba(255,226,105,.90)', .94);
    const viewer = Number(snapshot && snapshot.viewer) || 0;
    const player = snapshot && snapshot.players && snapshot.players[viewer] ? snapshot.players[viewer] : null;
    const name = player && player.name ? String(player.name) : 'Your';
    const title = name.toUpperCase() + "'S HAND (" + (Number(count) || 0) + ')';
    const tabW = Math.min(260, Math.max(178, title.length * 7.3));
    const tabH = 28;
    const tabX = r.x + r.w / 2 - tabW / 2;
    const tabY = r.y - 14;
    roundedPath(ctx, tabX, tabY, tabW, tabH, 7);
    const tabGrad = ctx.createLinearGradient(tabX, tabY, tabX, tabY + tabH);
    tabGrad.addColorStop(0, 'rgba(29,24,13,.96)');
    tabGrad.addColorStop(1, 'rgba(2,3,7,.94)');
    ctx.fillStyle = tabGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,226,105,.76)';
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.fillStyle = '#d9bb61';
    ctx.font = '800 11px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, r.x + r.w / 2, tabY + tabH / 2 + 1);
    ctx.restore();
  }

  function drawCommandGlyph(ctx, command, rect, color){
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const s = Math.min(rect.w, rect.h);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1.3, s * .075);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if(command === 'end-turn'){
      ctx.beginPath();
      ctx.moveTo(cx - s * .25, cy - s * .20);
      ctx.lineTo(cx + s * .18, cy);
      ctx.lineTo(cx - s * .25, cy + s * .20);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - s * .06, cy - s * .28);
      ctx.lineTo(cx + s * .34, cy);
      ctx.lineTo(cx - s * .06, cy + s * .28);
      ctx.stroke();
    } else if(command === 'consolidate'){
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * .34);
      ctx.lineTo(cx + s * .34, cy);
      ctx.lineTo(cx, cy + s * .34);
      ctx.lineTo(cx - s * .34, cy);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - s * .18, cy);
      ctx.lineTo(cx + s * .18, cy);
      ctx.moveTo(cx, cy - s * .18);
      ctx.lineTo(cx, cy + s * .18);
      ctx.stroke();
    } else if(command === 'audio'){
      ctx.beginPath();
      ctx.moveTo(cx - s * .34, cy - s * .12);
      ctx.lineTo(cx - s * .14, cy - s * .12);
      ctx.lineTo(cx + s * .08, cy - s * .30);
      ctx.lineTo(cx + s * .08, cy + s * .30);
      ctx.lineTo(cx - s * .14, cy + s * .12);
      ctx.lineTo(cx - s * .34, cy + s * .12);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + s * .08, cy, s * .20, -0.75, 0.75);
      ctx.arc(cx + s * .10, cy, s * .34, -0.68, 0.68);
      ctx.stroke();
    } else if(command === 'world-chat'){
      roundedPath(ctx, cx - s * .34, cy - s * .24, s * .68, s * .46, s * .11);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - s * .12, cy + s * .22);
      ctx.lineTo(cx - s * .24, cy + s * .36);
      ctx.lineTo(cx + s * .05, cy + s * .22);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - s * .16, cy - s * .02);
      ctx.lineTo(cx + s * .16, cy - s * .02);
      ctx.stroke();
    } else if(command === 'end-game'){
      ctx.beginPath();
      ctx.moveTo(cx - s * .24, cy - s * .24);
      ctx.lineTo(cx + s * .24, cy + s * .24);
      ctx.moveTo(cx + s * .24, cy - s * .24);
      ctx.lineTo(cx - s * .24, cy + s * .24);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCommandButton(ctx, hitMap, command, label, rect, opts){
    const options = opts || {};
    const disabled = !!options.disabled;
    const primary = !!options.primary;
    const active = !!options.active;
    const danger = !!options.danger;
    const compact = !!options.compact;
    const glyph = options.glyph || command;
    ctx.save();
    const grad = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
    if(primary){
      grad.addColorStop(0, disabled ? 'rgba(48,50,56,.92)' : 'rgba(198,148,50,.97)');
      grad.addColorStop(.42, disabled ? 'rgba(30,32,38,.96)' : 'rgba(84,53,22,.98)');
      grad.addColorStop(1, disabled ? 'rgba(14,16,21,.98)' : 'rgba(7,9,14,.99)');
    } else if(danger) {
      grad.addColorStop(0, disabled ? 'rgba(31,34,39,.88)' : 'rgba(92,33,35,.95)');
      grad.addColorStop(1, disabled ? 'rgba(14,16,20,.94)' : 'rgba(17,8,11,.97)');
    } else if(active) {
      grad.addColorStop(0, disabled ? 'rgba(31,34,39,.88)' : 'rgba(31,83,67,.95)');
      grad.addColorStop(1, disabled ? 'rgba(14,16,20,.94)' : 'rgba(8,17,19,.97)');
    } else {
      grad.addColorStop(0, disabled ? 'rgba(31,34,39,.88)' : 'rgba(28,42,58,.95)');
      grad.addColorStop(1, disabled ? 'rgba(14,16,20,.94)' : 'rgba(7,10,17,.97)');
    }
    roundedPath(ctx, rect.x, rect.y, rect.w, rect.h, primary ? 10 : 7);
    ctx.shadowColor = disabled ? 'transparent' : (active ? 'rgba(102,238,183,.24)' : primary ? 'rgba(255,210,88,.18)' : 'rgba(96,168,255,.12)');
    ctx.shadowBlur = disabled ? 0 : (primary ? 14 : 9);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = primary ? 1.7 : 1.15;
    ctx.strokeStyle = disabled ? 'rgba(156,156,150,.34)' : (active ? 'rgba(123,220,165,.82)' : danger ? 'rgba(255,143,128,.62)' : 'rgba(236,203,101,.68)');
    ctx.stroke();
    ctx.save();
    ctx.globalAlpha = disabled ? .13 : .30;
    ctx.strokeStyle = primary ? 'rgba(255,246,184,.42)' : 'rgba(255,236,159,.22)';
    ctx.beginPath();
    ctx.moveTo(rect.x + 12, rect.y + 8);
    ctx.lineTo(rect.x + rect.w - 12, rect.y + 8);
    ctx.moveTo(rect.x + 12, rect.y + rect.h - 8);
    ctx.lineTo(rect.x + rect.w - 12, rect.y + rect.h - 8);
    ctx.stroke();
    ctx.restore();
    if(glyph){
      const iconSize = primary ? Math.min(34, rect.h - 18) : Math.min(19, rect.h - 11);
      const iconRect = primary
        ? {x:rect.x + 16, y:rect.y + (rect.h - iconSize) / 2, w:iconSize, h:iconSize}
        : {x:rect.x + 9, y:rect.y + (rect.h - iconSize) / 2, w:iconSize, h:iconSize};
      drawCommandGlyph(ctx, glyph, iconRect, disabled ? 'rgba(214,214,206,.36)' : (danger ? 'rgba(255,194,184,.86)' : active ? 'rgba(146,245,198,.88)' : 'rgba(255,224,112,.88)'));
    }
    ctx.fillStyle = disabled ? 'rgba(200,200,192,.48)' : (danger ? '#ffc4b8' : active ? '#a4f2c8' : '#f2d778');
    const labelScale = String(label || '').length > 13 ? .22 : (compact ? .28 : .25);
    ctx.font = '800 ' + Math.max(8, Math.round(rect.h * labelScale)) + 'px Cinzel, serif';
    ctx.textAlign = glyph ? 'left' : 'center';
    ctx.textBaseline = 'middle';
    const textX = glyph ? rect.x + (primary ? 62 : 34) : rect.x + rect.w / 2;
    ctx.fillText(label, textX, rect.y + rect.h / 2 + 1);
    if(primary && options.subLabel){
      ctx.fillStyle = disabled ? 'rgba(210,210,204,.34)' : 'rgba(255,238,168,.48)';
      ctx.font = '700 8px Cinzel, serif';
      ctx.fillText(String(options.subLabel).toUpperCase(), textX, rect.y + rect.h / 2 + 17);
    }
    ctx.restore();
    hitMap.uiCommands.push({kind:'ui-command', command, disabled, rect});
  }

  function drawCommandDock(ctx, hitMap, snapshot, cssW, cssH){
    const interaction = snapshot && snapshot.interaction ? snapshot.interaction : {};
    const canEndTurn = interaction.currentPlayer === snapshot.viewer;
    const w = clamp(cssW * .218, 268, 312);
    const h = 186;
    const x = Math.max(12, cssW - w - 42);
    const y = Math.max(92, cssH - h - 34);
    const r = {x, y, w, h};
    function dockPath(px, py, pw, ph, cut){
      ctx.beginPath();
      ctx.moveTo(px + cut, py);
      ctx.lineTo(px + pw - cut * .82, py);
      ctx.lineTo(px + pw, py + cut * .82);
      ctx.lineTo(px + pw, py + ph - cut * 1.08);
      ctx.lineTo(px + pw - cut * 1.08, py + ph);
      ctx.lineTo(px + cut * .74, py + ph);
      ctx.lineTo(px, py + ph - cut * .74);
      ctx.lineTo(px, py + cut);
      ctx.closePath();
    }
    ctx.save();
    dockPath(x, y, w, h, 22);
    const bg = ctx.createLinearGradient(x, y, x + w, y + h);
    bg.addColorStop(0, 'rgba(45,35,17,.97)');
    bg.addColorStop(.26, 'rgba(7,11,18,.985)');
    bg.addColorStop(.70, 'rgba(5,8,14,.985)');
    bg.addColorStop(1, 'rgba(18,40,50,.94)');
    ctx.fillStyle = bg;
    ctx.shadowColor = 'rgba(0,0,0,.46)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(255,222,92,.82)';
    ctx.lineWidth = 1.45;
    ctx.stroke();
    dockPath(x + 9, y + 9, w - 18, h - 18, 15);
    ctx.strokeStyle = 'rgba(255,226,105,.34)';
    ctx.lineWidth = 1;
    ctx.stroke();
    hitMap.uiCommands.push({kind:'ui-command', command:'dock', disabled:true, rect:r});

    const sealCx = x + 42;
    const sealCy = y + 40;
    const sealR = 20;
    const sealGrad = ctx.createRadialGradient(sealCx - 8, sealCy - 9, 2, sealCx, sealCy, sealR);
    sealGrad.addColorStop(0, canEndTurn ? 'rgba(255,249,198,.95)' : 'rgba(160,166,172,.38)');
    sealGrad.addColorStop(.32, canEndTurn ? 'rgba(222,177,55,.96)' : 'rgba(62,66,72,.80)');
    sealGrad.addColorStop(.64, canEndTurn ? 'rgba(22,30,28,.98)' : 'rgba(31,33,38,.92)');
    sealGrad.addColorStop(1, canEndTurn ? 'rgba(5,7,12,.98)' : 'rgba(7,8,12,.96)');
    ctx.beginPath();
    ctx.arc(sealCx, sealCy, sealR, 0, Math.PI * 2);
    ctx.fillStyle = sealGrad;
    ctx.shadowColor = canEndTurn ? 'rgba(255,210,88,.18)' : 'transparent';
    ctx.shadowBlur = canEndTurn ? 9 : 0;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = canEndTurn ? 'rgba(255,226,105,.92)' : 'rgba(190,190,184,.36)';
    ctx.stroke();
    ctx.save();
    ctx.translate(sealCx, sealCy);
    ctx.beginPath();
    ctx.arc(0, 0, sealR - 7, 0, Math.PI * 2);
    ctx.strokeStyle = canEndTurn ? 'rgba(255,246,188,.24)' : 'rgba(210,210,204,.12)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = canEndTurn ? 'rgba(255,239,147,.95)' : 'rgba(220,220,212,.38)';
    ctx.beginPath();
    ctx.moveTo(-6, -8);
    ctx.lineTo(8, 0);
    ctx.lineTo(-6, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    hitMap.uiCommands.push({
      kind:'ui-command',
      command:'end-turn',
      disabled:!canEndTurn,
      rect:{x:sealCx - sealR - 8, y:sealCy - sealR - 8, w:(sealR + 8) * 2, h:(sealR + 8) * 2}
    });

    ctx.fillStyle = '#f2d778';
    ctx.font = '900 15px Cinzel, serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('END TURN', x + 78, y + 30);
    ctx.fillStyle = 'rgba(255,232,132,.42)';
    ctx.font = '700 8px Cinzel, serif';
    ctx.fillText(interaction.consolidating ? 'TRIBUTE SELECTION' : (canEndTurn ? 'READY' : 'WAITING'), x + 78, y + 47);
    ctx.strokeStyle = 'rgba(255,226,105,.26)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 18, y + 70);
    ctx.lineTo(x + w - 18, y + 70);
    ctx.stroke();

    const gap = 9;
    const innerX = x + 18;
    const innerW = w - 36;
    const smallH = 34;
    const row1Y = y + 82;
    const row2Y = row1Y + smallH + 8;
    const row3Y = row2Y + smallH + 8;
    const colW = (innerW - gap) / 2;
    const buttons = [];
    if(interaction.consolidating) buttons.push({command:'consolidate', label:'STOP CONSOLIDATION', active:true});
    buttons.push({command:'audio', label:'AUDIO'});
    buttons.push({command:'world-chat', label:'CHAT'});
    buttons.push({command:'end-game', label:'END GAME', danger:true});
    buttons.forEach(function(button, index){
      const col = index % 2;
      const row = Math.floor(index / 2);
      const isLastOdd = buttons.length % 2 === 1 && index === buttons.length - 1;
      const rect = {
        x:isLastOdd ? innerX : innerX + col * (colW + gap),
        y:row === 0 ? row1Y : (row === 1 ? row2Y : row3Y),
        w:isLastOdd ? innerW : colW,
        h:smallH
      };
      drawCommandButton(ctx, hitMap, button.command, button.label, rect, {
        active:!!button.active,
        danger:!!button.danger,
        disabled:!!button.disabled,
        compact:true
      });
    });
    ctx.fillStyle = interaction.consolidating ? 'rgba(143,244,196,.76)' : 'rgba(255,232,132,.42)';
    ctx.font = '700 7px Cinzel, serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.restore();
  }

  function drawSceneUi(ctx, layout, snapshot, cssW, cssH){
    const hitMap = {handCards:[], opponentHandCards:[], piles:[], uiCommands:[]};
    if(!ctx || !layout || !snapshot) return hitMap;
    const handCards = layout.hand && Array.isArray(layout.hand.cards) ? layout.hand.cards : [];
    if(layout.hand && layout.hand.rect) drawHandPanel(ctx, layout.hand.rect, snapshot, handCards.length);
    let hoveredHandItem = null;
    function drawHandItem(item){
      if(!item || !item.card || !item.rect) return;
      const visual = item.card.visual || item.card;
      const disabled = isSupporterLimitDisabled(item, snapshot);
      const isHovered = !!(viewportHoverHit && viewportHoverHit.kind === 'hand-card' && Number(viewportHoverHit.index) === Number(item.index));
      if(isHovered && hoveredHandItem !== item) {
        hoveredHandItem = item;
        return;
      }
      const entry = {card:item.card, c:item.index, r:0, z:0};
      const onChange = function(){ scheduleTextureRender('hand-texture-ready'); };
      if(isHovered) {
        drawHoveredHandCard(ctx, entry, visual, item.rect, onChange, disabled);
      } else {
        drawCardVisual(ctx, entry, visual, item.rect, onChange, {pulse:false, tilt:0, lift:0, hideFateBadge:true});
        if(disabled) drawDisabledCardOverlay(ctx, item.rect);
      }
      hitMap.handCards.push({kind:'hand-card', index:item.index, iid:item.iid, rect:item.hitRect || item.rect, card:item.card, disabled});
    }
    handCards.forEach(drawHandItem);
    if(hoveredHandItem) drawHandItem(hoveredHandItem);

    const oppCards = layout.opponentHand && Array.isArray(layout.opponentHand.cards) ? layout.opponentHand.cards : [];
    oppCards.forEach(function(item){
      if(!item || !item.rect) return;
      if(item.faceDown || !item.card || item.card.hidden) drawCardBack(ctx, item.rect, '', 'back.png');
      else drawCardContent(ctx, {card:item.card}, item.card.visual || item.card, item.rect, function(){ scheduleTextureRender('opponent-hand-texture-ready'); }, {pulse:false, hideFateBadge:true});
      hitMap.opponentHandCards.push({kind:'opponent-hand-card', index:item.index, iid:item.iid, playerIndex:item.playerIndex, rect:item.rect, card:item.card || null});
    });

    const piles = layout.piles && Array.isArray(layout.piles.items) ? layout.piles.items : [];
    piles.forEach(function(pile){
      if(!pile || !pile.rect) return;
      drawPile(ctx, pile);
      hitMap.piles.push({kind:'pile', playerIndex:pile.playerIndex, pile:pile.pile, rect:pile.hitRect || pile.rect, count:pile.count});
    });
    drawCommandDock(ctx, hitMap, snapshot, cssW, cssH);
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
    const zoneById = {};
    zones.forEach(function(zone){
      zoneById[String(zone.z)] = zone;
      const zr = rect(zone.rect, originX, originY);
      const hr = rect(zone.headerRect, originX, originY);
      const rowClip = rect(zone.rowsRect, originX, originY);
      const scrollY = getZoneScroll(zone);
      drawZonePanel(ctx, zone, zr, hr, snapshot);

      ctx.save();
      roundedPath(ctx, rowClip.x, rowClip.y, rowClip.w, rowClip.h, 5);
      ctx.clip();
      (zone.rows || []).forEach(function(row){
        const rr = rect(row.rect, originX, originY);
        const cells = row.cells || [];

        cells.forEach(function(cell){
          const cr = rect(cell.rect, originX, originY);
          cr.y -= scrollY;
          if(!intersects(cr, rowClip)) return;
          const hitRect = intersectRect(cr, rowClip);
          hitMap.cells.push({
            z:cell.z,
            r:cell.r,
            c:cell.c,
            rect:hitRect || cr,
            visualRect:cr,
            cardRect:(function(){
              const rr = rect(cell.cardRect || cell.rect, originX, originY);
              rr.y -= scrollY;
              return rr;
            })(),
            hasCard:!!cell.card,
            blocked:cell.blocked || null,
            markSafe:!!cell.markSafe
          });
          roundedPath(ctx, cr.x, cr.y, cr.w, cr.h, 5);
          ctx.fillStyle = row.owner === snapshot.viewer ? 'rgba(45,136,184,.15)' : row.owner < 0 ? 'rgba(184,153,54,.13)' : 'rgba(166,62,76,.14)';
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = cell.card ? 'rgba(255,232,141,.42)' : (row.owner === snapshot.viewer ? 'rgba(122,202,255,.26)' : row.owner < 0 ? 'rgba(242,214,126,.25)' : 'rgba(255,128,144,.26)');
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
      drawZoneCellPerimeter(ctx, zone, originX, originY, scrollY, rowClip);
      ctx.restore();
      drawZoneScrollRail(ctx, zone, rowClip);
    });

    let cards = 0;
    const onChange = function(rec, reason){
      if(reason === 'bitmap-ready') return;
      scheduleTextureRender('texture-ready');
    };
    const movingCards = [];
    const depthSortedCards = (layout.cardRects || []).slice().sort(function(a, b){
      const az = a ? zoneById[String(a.z)] : null;
      const bz = b ? zoneById[String(b.z)] : null;
      const ar = rect((a && (a.cardRect || a.rect)) || null, originX, originY);
      const br = rect((b && (b.cardRect || b.rect)) || null, originX, originY);
      ar.y -= getZoneScroll(az);
      br.y -= getZoneScroll(bz);
      return (ar.y + ar.h) - (br.y + br.h);
    });
    depthSortedCards.forEach(function(entry){
      if(!entry || !entry.card) return;
      const zone = zoneById[String(entry.z)];
      const rowClip = zone ? rect(zone.rowsRect, originX, originY) : null;
      const r = rect(entry.cardRect || entry.rect, originX, originY);
      r.y -= getZoneScroll(zone);
      if(rowClip && !intersects(r, rowClip)) return;
      const visibleHitRect = rowClip ? intersectRect(r, rowClip) : r;
      hitMap.cards.push({
        z:entry.z,
        r:entry.r,
        c:entry.c,
        rect:visibleHitRect || r,
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
        if(rowClip){ ctx.save(); roundedPath(ctx, rowClip.x, rowClip.y, rowClip.w, rowClip.h, 5); ctx.clip(); }
        drawCardVisual(ctx, entry, visual, r, onChange, {tributeState, boardH:boardRect.h, opponent:entry.card && entry.card.owner !== snapshot.viewer});
        if(rowClip) ctx.restore();
      }
      cards++;
    });
    movingCards.forEach(function(item){
      const zone = zoneById[String(item.entry.z)];
      const rowClip = zone ? rect(zone.rowsRect, originX, originY) : null;
      const r = rectFromMove(item.move, item.rect);
      const raw = Number(item.move && item.move.progress) || 0;
      const arc = Math.sin(Math.PI * Math.max(0, Math.min(1, raw)));
      const lift = item.move && item.move.flight ? (.36 + arc * .9) : (.22 + arc * .36);
      if(rowClip){ ctx.save(); roundedPath(ctx, rowClip.x, rowClip.y, rowClip.w, rowClip.h, 5); ctx.clip(); }
      drawCardVisual(ctx, item.entry, item.visual, r, onChange, {tributeState:item.tributeState, boardH:boardRect.h, lift, opponent:item.entry.card && item.entry.card.owner !== snapshot.viewer});
      if(rowClip) ctx.restore();
    });
    depthSortedCards.forEach(function(entry){
      if(!entry || !entry.card) return;
      const tributeState = getTributeState(entry);
      if(!tributeState) return;
      const zone = zoneById[String(entry.z)];
      const rowClip = zone ? rect(zone.rowsRect, originX, originY) : null;
      const r = rect(entry.cardRect || entry.rect, originX, originY);
      r.y -= getZoneScroll(zone);
      if(rowClip && !intersects(r, rowClip)) return;
      if(rowClip){ ctx.save(); roundedPath(ctx, rowClip.x, rowClip.y, rowClip.w, rowClip.h, 5); ctx.clip(); }
      drawConsolidationCardOverlay(ctx, r, tributeState);
      if(rowClip) ctx.restore();
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
      layer.__fateCssW = cssW;
      layer.__fateCssH = cssH;
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
      uiLayer.__fateCssW = uiW;
      uiLayer.__fateCssH = uiH;
      uiLayer.style.width = uiW + 'px';
      uiLayer.style.height = uiH + 'px';
    }
    const hoverCanvas = layers.hover || document.getElementById(hoverCanvasId);
    if(!hoverCanvas || !canvas) return null;
    const pxW = Math.max(1, Math.round(cssW * dpr));
    const pxH = Math.max(1, Math.round(cssH * dpr));
    if(hoverCanvas.width !== pxW) hoverCanvas.width = pxW;
    if(hoverCanvas.height !== pxH) hoverCanvas.height = pxH;
    hoverCanvas.__fateCssW = cssW;
    hoverCanvas.__fateCssH = cssH;
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

    const measuredBoardRect = board.getBoundingClientRect ? board.getBoundingClientRect() : {left:0, top:0, width:board.clientWidth || 1280, height:board.clientHeight || 720};
    const boardRect = getStableBoardViewport(board, measuredBoardRect);
    const viewportW = Math.max(1, boardRect.width || board.clientWidth || 1280);
    const viewportH = Math.max(1, boardRect.height || board.clientHeight || 720);
    const cssW = viewportW;
    const cssH = viewportH;
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
    lastLayout = layout;
    const dpr = effectiveDpr;
    const pxW = Math.max(1, Math.round(cssW * dpr));
    const pxH = Math.max(1, Math.round(cssH * dpr));
    let canvasResized = false;
    if(canvas.width !== pxW || canvas.height !== pxH){
      canvas.width = pxW;
      canvas.height = pxH;
      canvasResized = true;
    }
    canvas.__fateCssW = cssW;
    canvas.__fateCssH = cssH;
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
      refreshHoverHitFromHitMap(lastHitMap);
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
    function keyFor(item){
      if(!item) return '';
      const r = item.visualRect || item.rect || item.cardRect || {};
      return [
        item.kind,
        item.z,
        item.r,
        item.c,
        item.dragState || '',
        Math.round(Number(r.x) || 0),
        Math.round(Number(r.y) || 0),
        Math.round(Number(r.w) || 0),
        Math.round(Number(r.h) || 0)
      ].join(':');
    }
    const prevKey = keyFor(prev);
    const nextKey = keyFor(next);
    if(prevKey === nextKey) return;
    hoverHit = next;
    scheduleHoverDraw();
  }

  function viewportHoverKey(hit){
    if(!hit) return '';
    if(hit.kind === 'hand-card' || hit.kind === 'opponent-hand-card') return [hit.kind, hit.index || 0].join(':');
    if(hit.kind === 'pile') return [hit.kind, hit.playerIndex, hit.pile || ''].join(':');
    if(hit.kind === 'ui-command') return [hit.kind, hit.command || ''].join(':');
    return hit.kind || '';
  }

  function setViewportHoverHit(hit){
    const next = hit && hit.kind === 'hand-card' ? hit : null;
    if(viewportHoverKey(viewportHoverHit) === viewportHoverKey(next)) return;
    viewportHoverHit = next;
    scheduleRender('hand-hover');
  }

  function scrollZoneAtClient(clientX, clientY, deltaY){
    if(!lastLayout || !Array.isArray(lastLayout.zones)) return false;
    const zone = lastLayout.zones.find(function(item){
      const r = item && item.rowsRect;
      return r && clientX >= r.x && clientX <= r.x + r.w && clientY >= r.y && clientY <= r.y + r.h;
    });
    if(!zone) return false;
    const max = zoneScrollMax(zone);
    if(max <= 0) return false;
    const key = String(zone.z);
    const current = getZoneScroll(zone);
    const next = Math.max(0, Math.min(max, current + (Number(deltaY) || 0) * .72));
    if(Math.abs(next - current) < .5) return true;
    zoneScroll[key] = next;
    scheduleRender('zone-scroll');
    return true;
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
    setViewportHoverHit,
    scrollZoneAtClient,
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
