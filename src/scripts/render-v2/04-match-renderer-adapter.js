(function(){
  'use strict';

  if(typeof window === 'undefined') return;
  if(window.FateMatchRendererAdapter) return;

  const ADAPTER_VERSION = 10;
  const canvasId = 'fate-match-v2-canvas';
  const backgroundCanvasId = 'fate-match-v2-background-canvas';
  const cardCanvasId = canvasId;
  const effectCanvasId = 'fate-match-v2-effect-canvas';
  const particleCanvasId = 'fate-match-v2-particle-canvas';
  const topEffectCanvasId = 'fate-match-v2-top-effect-canvas';
  const uiCanvasId = 'fate-match-v2-ui-canvas';
  const hoverCanvasId = 'fate-match-v2-hover-canvas';
  const fateNumberLayerId = 'fate-match-v2-fate-number-layer';
  const layerIds = [backgroundCanvasId, cardCanvasId, effectCanvasId, particleCanvasId, topEffectCanvasId, uiCanvasId, hoverCanvasId];
  let drawCount = 0;
  let lastReport = {available:false, reason:'not-rendered', version:ADAPTER_VERSION};
  let lastHitMap = {cards:[], cells:[], handCards:[], handEffectIcons:[], opponentHandCards:[], piles:[], uiCommands:[]};
  let lastCardFateByIid = new Map();
  let lastBoardCardIids = new Set();
  let deferredCoordinatorFatePulseByIid = new Map();
  let coordinatorAuraFateDelayUntilByIid = new Map();
  let coordinatorAuraFateSoundModeByIid = new Map();
  let deferredPlacementFatePulseByIid = new Map();
  let completedPlacementFateRevealAtByIid = new Map();
  let lastCardRectByIid = new Map();
  let pendingPlacementRectByIid = new Map();
  let vfxHiddenBoardCardUntilByIid = new Map();
  let vfxHiddenBoardCellUntilByKey = new Map();
  let suppressedInitialPlacementUntilByIid = new Map();
  let quarantinedBoardMotionIids = new Set();
  let assetImageCache = new Map();
  let lastMoveSnapshotSignature = '';
  let input = null;
  let hoverHit = null;
  let viewportHoverHit = null;
  let redrawRaf = 0;
  let hoverRaf = 0;
  let pendingDirtyMask = 0;
  let pendingDirtySources = [];
  let pendingPostFrameVfx = false;
  let actionVfxRaf = 0;
  let dedicatedVfxRaf = 0;
  let dedicatedVfxWatchdog = 0;
  let dedicatedVfxSource = '';
  let deferredActionDirtyMask = 0;
  let deferredActionSources = [];
  let deferredActionFlushTimer = 0;
  let postActionDirtyMask = 0;
  let postActionSources = [];
  let postActionRenderTimer = 0;
  let tutorialTargetPulseTimer = 0;
  let selectionTargetPulseTimer = 0;
  let selectionOptionCacheState = null;
  let selectionOptionCache = null;
  let lastResizeKey = '';
  const pendingTextureTimers = {};
  let lastCanvasMetrics = null;
  let lastHoverMetrics = null;
  let lastLayout = null;
  let lastSnapshot = null;
  let lastLayoutStructureKey = '';
  let activeActivationFlashes = [];
  let activeActivationCinematics = [];
  let pendingWhenSetPulseRaf = 0;
  let pendingWhenSetGlowStartedAtByKey = new Map();
  let fateNumberNodesByKey = new Map();
  let fateNumberTimersByKey = new Map();
  let recentFateNumbersByKey = new Map();
  let nextFateNumberId = 1;
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
    actionVfxOnlyDraws:0,
    actionVfxFrameRequests:0,
    vfxFullSceneFallbacks:0,
    zoneScrollOnlyDraws:0,
    cardLayerOnlyDraws:0,
    deferredVfxFrames:0,
    deferredActionDirtyFrames:0,
    postActionDeferredFrames:0,
    hoverDuringActionSkips:0,
    pendingWhenSetPulseSkips:0,
    fateNumberPresentations:0,
    fateNumberDuplicatesSuppressed:0,
    fateNumberMainThreadFramesAvoided:0,
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
  const DIRTY_UI = 1 << 10;
  const DIRTY_ALL = 0xffff;
  const DIRTY_VFX_ONLY = DIRTY_EFFECTS | DIRTY_PARTICLES;

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

  function animationsOff(){
    const root = document.documentElement;
    const body = document.body;
    return !!((root && root.classList && root.classList.contains('fate-animations-off')) ||
      (body && body.classList && body.classList.contains('fate-animations-off')));
  }

  function isElectronShell(){
    try{
      if(/[?&]electron=1(?:&|$)/.test(window.location.search || '')) return true;
      return /Electron/i.test(navigator.userAgent || '');
    }catch(e){
      return false;
    }
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
    const lowEffects = animationsOff() || document.documentElement.classList.contains('fate-low-effects');
    const electron = isElectronShell();
    if(animationsOff()) return 1;
    const raw = electron ? (lowEffects ? 1.35 : 2) : (lowEffects ? 1.25 : 1.5);
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
      effectiveDpr:Math.max(.7, baseDpr * renderScale),
      environment:isElectronShell() ? 'electron' : 'browser',
      dprCapped:rawDpr > maxDpr + .01
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
    const lowEffects = animationsOff() || document.documentElement.classList.contains('fate-low-effects');
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
    if(s.indexOf('final-zone-flash') >= 0) return DIRTY_EFFECTS;
    if(s.indexOf('consolidat') >= 0 || s.indexOf('tribute') >= 0) return DIRTY_BOARD_CARDS | DIRTY_HOVER | DIRTY_HAND | DIRTY_EFFECTS;
    if(s.indexOf('pile-hover') >= 0) return DIRTY_HOVER;
    if(s.indexOf('hand-hover') >= 0) return DIRTY_HAND | DIRTY_HOVER;
    if(s.indexOf('viewport-hover') >= 0) return DIRTY_HOVER;
    if(s.indexOf('zone-scroll') >= 0) return DIRTY_BOARD_CARDS | DIRTY_HOVER;
    if(s.indexOf('hover') >= 0) return DIRTY_HOVER;
    if(s.indexOf('activation-flash') >= 0) return DIRTY_EFFECTS | DIRTY_HOVER;
    if(s.indexOf('activation-cinematic') >= 0) return DIRTY_EFFECTS | DIRTY_HOVER;
    if(s.indexOf('pending-when-set') >= 0) return DIRTY_EFFECTS;
    if(s.indexOf('chat-unread') >= 0 || s.indexOf('ui-only') >= 0) return DIRTY_UI;
    if(s === 'input' || s === 'viewport-input') return DIRTY_EFFECTS | DIRTY_HOVER;
    if(s.indexOf('resize') >= 0 || s.indexOf('screen-enter') >= 0 || s.indexOf('adaptive-render-scale') >= 0) return DIRTY_ALL | DIRTY_LAYOUT;
    if(s.indexOf('board-action-fast-path') >= 0) {
      let mask = DIRTY_BOARD_CARDS;
      if(s.indexOf('hand') >= 0) mask |= DIRTY_HAND;
      if(s.indexOf('opphand') >= 0 || s.indexOf('opp-hand') >= 0) mask |= DIRTY_OPP_HAND;
      if(s.indexOf('pile') >= 0 || s.indexOf('deck') >= 0 || s.indexOf('discard') >= 0) mask |= DIRTY_PILES;
      if(s.indexOf('effects') >= 0 || s.indexOf('vfx') >= 0) mask |= DIRTY_EFFECTS;
      if(s.indexOf('hover') >= 0) mask |= DIRTY_HOVER;
      return mask;
    }
    if(s.indexOf('opponent-hand-texture-ready') >= 0 || s.indexOf('opp-hand-texture-ready') >= 0 || s.indexOf('opphand-texture-ready') >= 0) return DIRTY_OPP_HAND;
    if(s.indexOf('pile-texture-ready') >= 0) return DIRTY_PILES;
    if(s.indexOf('hand-texture-ready') >= 0) return DIRTY_HAND;
    if(s.indexOf('texture-ready') >= 0) return DIRTY_BOARD_CARDS;
    if(s.indexOf('opponent') >= 0 || s.indexOf('opphand') >= 0 || s.indexOf('opp-hand') >= 0) return DIRTY_OPP_HAND;
    if(s.indexOf('hand') >= 0) return DIRTY_HAND;
    if(s.indexOf('pile') >= 0 || s.indexOf('deck') >= 0 || s.indexOf('discard') >= 0) return DIRTY_PILES;
    if(s.indexOf('particle') >= 0) return DIRTY_PARTICLES | DIRTY_EFFECTS;
    if(s === 'animation') return DIRTY_BOARD_CARDS | DIRTY_HOVER;
    if(s.indexOf('motion') >= 0 || s.indexOf('animation') >= 0) return DIRTY_MOTION | DIRTY_EFFECTS | DIRTY_PARTICLES;
    if(s.indexOf('asset') >= 0) return DIRTY_HAND | DIRTY_OPP_HAND | DIRTY_PILES;
    if(s.indexOf('texture') >= 0) return DIRTY_BOARD_CARDS;
    if(s.indexOf('renderboard') >= 0 || s.indexOf('board-commit') >= 0) return DIRTY_BOARD_CARDS;
    if(s.indexOf('block') >= 0) return DIRTY_BOARD_CARDS | DIRTY_EFFECTS | DIRTY_HOVER;
    if(s.indexOf('board') >= 0 || s.indexOf('cell') >= 0 || s.indexOf('place') >= 0) return DIRTY_BOARD_CARDS | DIRTY_EFFECTS | DIRTY_HOVER;
    return DIRTY_ALL;
  }

  function isVfxOnlyDirty(mask){
    const value = Number(mask) || 0;
    return !!(value & DIRTY_VFX_ONLY) && !(value & ~DIRTY_VFX_ONLY);
  }

  function heavyActionDirtyMask(mask){
    return (Number(mask) || 0) & (DIRTY_LAYOUT | DIRTY_BACKGROUND | DIRTY_BOARD_CARDS | DIRTY_HAND | DIRTY_OPP_HAND | DIRTY_PILES | DIRTY_MOTION);
  }

  function addUniqueSource(list, source){
    const src = String(source || '').trim();
    if(src && list.indexOf(src) < 0) list.push(src);
  }

  function scheduleDeferredActionFlush(){
    if(deferredActionFlushTimer) return;
    deferredActionFlushTimer = setTimeout(function(){
      deferredActionFlushTimer = 0;
      if(!deferredActionDirtyMask) return;
      if(isActionAnimationActive()){
        scheduleDeferredActionFlush();
        return;
      }
      const mask = deferredActionDirtyMask;
      const sources = deferredActionSources.join('+') || 'action-deferred';
      deferredActionDirtyMask = 0;
      deferredActionSources = [];
      enqueueRender('action-deferred:' + sources, mask);
    }, 34);
  }

  function msSinceLastActionAnimation(){
    const presenter = actionPresenter();
    try {
      if(presenter && typeof presenter.msSinceLastActionAnimation === 'function') {
        return Number(presenter.msSinceLastActionAnimation());
      }
    } catch(e) {}
    return Infinity;
  }

  function msSinceLastAction(){
    const presenter = actionPresenter();
    try {
      if(presenter && typeof presenter.msSinceLastAction === 'function') {
        return Number(presenter.msSinceLastAction());
      }
    } catch(e) {}
    return msSinceLastActionAnimation();
  }

  function wasActionAnimatingRecently(ms){
    const presenter = actionPresenter();
    try {
      if(presenter && typeof presenter.wasActionAnimatingRecently === 'function') {
        return !!presenter.wasActionAnimatingRecently(ms);
      }
    } catch(e) {}
    return msSinceLastActionAnimation() <= Math.max(0, Number(ms) || 0);
  }

  function wasActionRecently(ms){
    const presenter = actionPresenter();
    try {
      if(presenter && typeof presenter.wasActionRecently === 'function') {
        return !!presenter.wasActionRecently(ms);
      }
    } catch(e) {}
    return msSinceLastAction() <= Math.max(0, Number(ms) || 0);
  }

  function schedulePostActionRender(source, dirtyMask, delayMs){
    const mask = Number(dirtyMask) || 0;
    if(!mask) return false;
    postActionDirtyMask |= mask;
    addUniqueSource(postActionSources, source || 'scheduled');
    renderCounters.postActionDeferredFrames++;
    if(postActionRenderTimer) return true;
    postActionRenderTimer = setTimeout(function(){
      postActionRenderTimer = 0;
      if(!postActionDirtyMask) return;
      const maskToFlush = postActionDirtyMask;
      const sources = postActionSources.join('+') || 'post-action';
      postActionDirtyMask = 0;
      postActionSources = [];
      enqueueRender('post-action-deferred:' + sources, maskToFlush);
    }, Math.max(18, Math.min(260, Number(delayMs) || 72)));
    return true;
  }

  function deferActionDirtyRender(source, dirtyMask){
    const mask = Number(dirtyMask) || 0;
    if(!mask) return false;
    deferredActionDirtyMask |= mask;
    addUniqueSource(deferredActionSources, source || 'scheduled');
    renderCounters.deferredActionDirtyFrames++;
    noteActionRendererEvent('renderer-dirty-deferred', {
      dirtySource:source || '',
      dirtyMask:mask,
      forbiddenMask:forbiddenActionDirtyMask(mask)
    });
    scheduleDeferredActionFlush();
    return true;
  }

  function noteGameplayBurst(dirtyMask){
    if(dirtyMask & (DIRTY_BOARD_CARDS | DIRTY_HAND | DIRTY_OPP_HAND | DIRTY_PILES | DIRTY_MOTION)) {
      lastGameplayBurstMs = nowMs();
    }
  }

  function scheduleTextureRender(source){
    const key = String(source || 'texture-ready');
    if(!(lastReport && lastReport.available)) return;
    if(isActionAnimationActive() || wasActionAnimatingRecently(180) || wasActionRecently(260)) {
      const dirtyMask = dirtyMaskForSource(key);
      schedulePostActionRender(key, dirtyMask, isActionAnimationActive() ? 180 : 160);
      return;
    }
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
    if(actionVfxRaf) {
      cancelAnimationFrame(actionVfxRaf);
      actionVfxRaf = 0;
    }
    if(dedicatedVfxRaf) {
      cancelAnimationFrame(dedicatedVfxRaf);
      dedicatedVfxRaf = 0;
    }
    if(dedicatedVfxWatchdog) {
      clearTimeout(dedicatedVfxWatchdog);
      dedicatedVfxWatchdog = 0;
    }
    dedicatedVfxSource = '';
    if(hoverRaf) {
      cancelAnimationFrame(hoverRaf);
      hoverRaf = 0;
    }
    Object.keys(pendingTextureTimers).forEach(function(key){
      if(pendingTextureTimers[key]) clearTimeout(pendingTextureTimers[key]);
      pendingTextureTimers[key] = 0;
    });
    deferredPlacementFatePulseByIid.forEach(function(record){
      if(record && record.timer) clearTimeout(record.timer);
    });
    deferredPlacementFatePulseByIid.clear();
    completedPlacementFateRevealAtByIid.clear();
    clearFateNumberPresentations();
    if(input && typeof input.detach === 'function') input.detach();
    hoverHit = null;
    lastHitMap = {cards:[], cells:[], handCards:[], handEffectIcons:[], opponentHandCards:[], piles:[], uiCommands:[]};
    lastLayout = null;
    lastSnapshot = null;
    lastHoverMetrics = null;
    lastLayoutStructureKey = '';
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
      hitMap:{cards:0, cells:0, handCards:0, handEffectIcons:0, opponentHandCards:0, piles:0, uiCommands:0}
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
    canvas.style.position = (id === uiCanvasId || id === hoverCanvasId || id === topEffectCanvasId) ? 'fixed' : 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.display = 'block';
    canvas.style.pointerEvents = 'none';
    canvas.style.contain = 'strict';
    return canvas;
  }

  function clearFateNumberPresentation(key){
    const node = fateNumberNodesByKey.get(key);
    if(node && node.parentNode) node.remove();
    fateNumberNodesByKey.delete(key);
    const timer = fateNumberTimersByKey.get(key);
    if(timer) clearTimeout(timer);
    fateNumberTimersByKey.delete(key);
  }

  function clearFateNumberPresentations(){
    Array.from(fateNumberNodesByKey.keys()).forEach(clearFateNumberPresentation);
    fateNumberNodesByKey.clear();
    fateNumberTimersByKey.clear();
    recentFateNumbersByKey.clear();
    const layer = document.getElementById(fateNumberLayerId);
    if(layer) layer.remove();
  }

  function ensureFateNumberLayer(board){
    if(!board) return null;
    let layer = document.getElementById(fateNumberLayerId);
    if(!layer){
      layer = document.createElement('div');
      layer.id = fateNumberLayerId;
      layer.setAttribute('aria-hidden', 'true');
    }
    layer.style.display = 'block';
    if(layer.parentNode !== board) board.appendChild(layer);
    return layer;
  }

  function fateNumberTargetRect(payload){
    const p = payload || {};
    const direct = p.rect || p.targetRect || p.cardRect;
    if(direct && Number(direct.w) > 0 && Number(direct.h) > 0) return direct;
    const iid = String(p.iid || p.targetIid || '');
    const cards = lastHitMap && Array.isArray(lastHitMap.cards) ? lastHitMap.cards : [];
    if(iid){
      const hit = cards.find(function(entry){
        return String(entry && (entry.iid || entry.card && entry.card.iid) || '') === iid;
      });
      if(hit && hit.rect) return hit.rect;
    }
    if(Number.isInteger(Number(p.z)) && Number.isInteger(Number(p.r)) && Number.isInteger(Number(p.c))){
      const hit = cards.find(function(entry){
        return entry && Number(entry.z) === Number(p.z) && Number(entry.r) === Number(p.r) && Number(entry.c) === Number(p.c);
      });
      if(hit && hit.rect) return hit.rect;
    }
    return null;
  }

  function presentFateDelta(payload){
    if(animationsOff()) return false;
    const p = payload || {};
    const delta = Number(p.delta != null ? p.delta : p.fateDelta != null ? p.fateDelta : p.amount);
    if(!Number.isFinite(delta) || delta === 0) return false;
    const board = document.getElementById('board');
    const layer = ensureFateNumberLayer(board);
    if(!layer) return false;
    const iid = String(p.iid || p.targetIid || '');
    const positionKey = Number.isInteger(Number(p.z)) && Number.isInteger(Number(p.r)) && Number.isInteger(Number(p.c))
      ? [p.z, p.r, p.c].join(':')
      : '';
    const key = iid ? 'iid:' + iid : positionKey ? 'cell:' + positionKey : 'global';
    const signature = (delta > 0 ? '+' : '') + String(delta);
    const now = Date.now();
    const recent = recentFateNumbersByKey.get(key);
    if(recent && recent.signature === signature && now - recent.at < 320){
      renderCounters.fateNumberDuplicatesSuppressed++;
      return true;
    }
    recentFateNumbersByKey.set(key, {signature, at:now});
    clearFateNumberPresentation(key);

    const target = fateNumberTargetRect(p);
    const fallbackW = Math.max(1, board.clientWidth || 960);
    const x = (target ? Number(target.x) + Number(target.w) - Math.max(4, Number(target.w) * .08) : fallbackW / 2) - 10;
    const fontSize = target ? Math.max(16, Math.min(25, Math.round(Number(target.w) * .20))) : 20;
    const y = target ? Math.max(4, Number(target.y) - Math.max(18, Number(target.h) * .11)) : 28;
    const duration = Math.max(640, Math.min(2531, Number(p.visualDuration) || 1860));
    const node = document.createElement('div');
    node.className = 'fate-number-pop ' + (delta < 0 ? 'is-loss' : 'is-gain');
    node.dataset.fateNumberId = String(nextFateNumberId++);
    node.textContent = signature;
    node.style.left = Math.round(x) + 'px';
    node.style.top = Math.round(y) + 'px';
    node.style.fontSize = fontSize + 'px';
    node.style.animationDuration = duration + 'ms';
    fateNumberNodesByKey.set(key, node);
    layer.appendChild(node);
    const finish = function(){
      if(fateNumberNodesByKey.get(key) === node) clearFateNumberPresentation(key);
      node.removeEventListener('animationend', finish);
    };
    node.addEventListener('animationend', finish, {once:true});
    fateNumberTimersByKey.set(key, setTimeout(finish, duration + 120));
    renderCounters.fateNumberPresentations++;
    renderCounters.fateNumberMainThreadFramesAvoided += Math.ceil(duration / 16.67);
    return true;
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
    const topEffectCanvas = makeLayerCanvas(topEffectCanvasId);
    const uiCanvas = makeLayerCanvas(uiCanvasId);
    const hoverCanvas = makeLayerCanvas(hoverCanvasId);
    const fateNumberLayer = ensureFateNumberLayer(board);
    const viewportW = Math.max(1, window.innerWidth || 1280);
    const viewportH = Math.max(1, window.innerHeight || 720);
    const boardLayers = [backgroundCanvas, canvas, effectCanvas, particleCanvas];
    Array.from(board.children).forEach(function(child){
      if(boardLayers.indexOf(child) < 0 && child !== fateNumberLayer) child.remove();
    });
    boardLayers.forEach(function(layer){
      if(layer.parentNode !== board) board.appendChild(layer);
    });
    uiCanvas.style.setProperty('position', 'fixed', 'important');
    uiCanvas.style.setProperty('left', '0', 'important');
    uiCanvas.style.setProperty('top', '0', 'important');
    uiCanvas.style.setProperty('right', 'auto', 'important');
    uiCanvas.style.setProperty('bottom', 'auto', 'important');
    uiCanvas.style.setProperty('width', viewportW + 'px', 'important');
    uiCanvas.style.setProperty('height', viewportH + 'px', 'important');
    uiCanvas.style.setProperty('display', 'block', 'important');
    uiCanvas.style.pointerEvents = 'none';
    uiCanvas.style.zIndex = '410';
    topEffectCanvas.style.setProperty('position', 'fixed', 'important');
    topEffectCanvas.style.setProperty('left', '0', 'important');
    topEffectCanvas.style.setProperty('top', '0', 'important');
    topEffectCanvas.style.setProperty('right', 'auto', 'important');
    topEffectCanvas.style.setProperty('bottom', 'auto', 'important');
    topEffectCanvas.style.setProperty('width', viewportW + 'px', 'important');
    topEffectCanvas.style.setProperty('height', viewportH + 'px', 'important');
    topEffectCanvas.style.setProperty('display', 'block', 'important');
    topEffectCanvas.style.pointerEvents = 'none';
    topEffectCanvas.style.zIndex = '415';
    hoverCanvas.style.setProperty('position', 'fixed', 'important');
    hoverCanvas.style.setProperty('left', '0', 'important');
    hoverCanvas.style.setProperty('top', '0', 'important');
    hoverCanvas.style.setProperty('right', 'auto', 'important');
    hoverCanvas.style.setProperty('bottom', 'auto', 'important');
    hoverCanvas.style.setProperty('width', viewportW + 'px', 'important');
    hoverCanvas.style.setProperty('height', viewportH + 'px', 'important');
    hoverCanvas.style.setProperty('display', 'block', 'important');
    hoverCanvas.style.pointerEvents = 'none';
    hoverCanvas.style.zIndex = '420';
    if(document.body && uiCanvas.parentNode !== document.body) document.body.appendChild(uiCanvas);
    if(document.body && topEffectCanvas.parentNode !== document.body) document.body.appendChild(topEffectCanvas);
    if(document.body && hoverCanvas.parentNode !== document.body) document.body.appendChild(hoverCanvas);

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
    canvas.__fateLayers = {
      background:backgroundCanvas,
      cards:canvas,
      effects:effectCanvas,
      particles:particleCanvas,
      topEffects:topEffectCanvas,
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
    if(stableBoardViewport) {
      const dWinW = Math.abs(winW - (stableBoardViewport.winW || winW));
      const dWinH = Math.abs(winH - (stableBoardViewport.winH || winH));
      const dx = Math.abs(measured.left - stableBoardViewport.left);
      const dy = Math.abs(measured.top - stableBoardViewport.top);
      const dw = Math.abs(measured.width - stableBoardViewport.width);
      const dh = Math.abs(measured.height - stableBoardViewport.height);
      if(dWinW <= 2 && dWinH <= 2 && dx < 36 && dy < 36 && dw < 72 && dh < 72) return stableBoardViewport;
    }
    stableBoardViewport = {
      key:measured.key,
      winW,
      winH,
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

  function drawImageContain(ctx, img, x, y, w, h, options){
    const opts = options || {};
    try {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    } catch(e) {}
    const iw = img.naturalWidth || img.width || 1;
    const ih = img.naturalHeight || img.height || 1;
    const scale = Math.min(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = x + (w - dw) / 2 + (Number(opts.offsetX) || 0);
    const dy = y + (h - dh) / 2 + (Number(opts.offsetY) || 0);
    ctx.drawImage(img, dx, dy, dw, dh);
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

  function prewarmAssetImages(srcs){
    const list = Array.isArray(srcs) ? srcs : [];
    const promises = list.map(function(src){
      const rec = getAssetImage(src);
      if(!rec || rec.loaded || rec.failed) return Promise.resolve({src, ready:!!(rec && rec.loaded), failed:!!(rec && rec.failed)});
      return new Promise(function(resolve){
        const img = rec.img;
        if(!img) return resolve({src, ready:false, failed:true});
        const finish = function(){
          resolve({src, ready:!!rec.loaded, failed:!!rec.failed});
        };
        const prevLoad = img.onload;
        const prevError = img.onerror;
        img.onload = function(){
          if(typeof prevLoad === 'function') prevLoad.apply(this, arguments);
          finish();
        };
        img.onerror = function(){
          if(typeof prevError === 'function') prevError.apply(this, arguments);
          finish();
        };
        if(img.complete) finish();
        setTimeout(finish, 2400);
      });
    });
    return Promise.all(promises);
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

  function runtimeArtSource(src){
    if(!src) return '';
    if(typeof window.getRuntimeCardImageSrc === 'function') return window.getRuntimeCardImageSrc(src, 'board');
    return String(src || '');
  }

  function isHandCardDragging(){
    return !!window.__fateV2DraggingCard ||
      !!(document.body && document.body.classList && document.body.classList.contains('fate-v2-dragging-card'));
  }

  function fullArtSource(card, visual){
    if(visual && visual.runtimeImg) return runtimeArtSource(visual.runtimeImg);
    if(card && card.runtimeImg) return runtimeArtSource(card.runtimeImg);
    if(card && card.visual && card.visual.runtimeImg) return runtimeArtSource(card.visual.runtimeImg);
    if(visual && visual.img) return runtimeArtSource(visual.img);
    if(card && card.visual && card.visual.img) return runtimeArtSource(card.visual.img);
    if(card && card.img) return runtimeArtSource(card.img);
    return '';
  }

  function getReadyTexture(card, visual, r){
    if(!window.FateCardTextureCache) return null;
    const size = {w:r.w, h:r.h};
    const dpr = Math.min(2.5, Math.max(2.25, Number(window.devicePixelRatio || 1)));
    const src = fullArtSource(card, visual);
    const options = {
      visual,
      src,
      dpr,
      preferFullArt:true,
      source:'match-v2-card'
    };
    try {
      if(typeof window.FateCardTextureCache.peekBaseCardTexture === 'function') {
        const exact = window.FateCardTextureCache.peekBaseCardTexture(card, size, options);
        if(exact && exact.loaded && exact.canvas && !exact.failed) return exact;
      }
      if(typeof window.FateCardTextureCache.findReadyBaseCardTexture === 'function') {
        const ready = window.FateCardTextureCache.findReadyBaseCardTexture(card, size, options);
        if(ready && ready.loaded && ready.canvas && !ready.failed) return ready;
      }
    } catch(e) {}
    return null;
  }

  function getTexture(card, visual, r, onChange, textureOptions){
    const texOpts = textureOptions || {};
    if(texOpts.readyOnly) return getReadyTexture(card, visual, r);
    if(!window.FateCardTextureCache || typeof window.FateCardTextureCache.getBaseCardTexture !== 'function') return null;
    const size = {w:r.w, h:r.h};
    const dpr = Math.min(2.5, Math.max(2.25, Number(window.devicePixelRatio || 1)));
    const src = fullArtSource(card, visual);
    const options = {
      visual,
      src,
      dpr,
      preferFullArt:true,
      source:'match-v2-card',
      onChange
    };
    try {
      if(typeof window.FateCardTextureCache.findReadyBaseCardTexture === 'function') {
        const ready = window.FateCardTextureCache.findReadyBaseCardTexture(card, size, options);
        if(ready) return ready;
      }
      return window.FateCardTextureCache.getBaseCardTexture(card, size, options);
    } catch(e) {
      return null;
    }
  }

  function numericFateValue(value){
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function fateBadgeState(card, visual){
    if(visual && visual.isHidden) return '';
    const current = numericFateValue(
      (visual && visual.displayFate != null) ? visual.displayFate :
      (visual && visual.currentFate != null) ? visual.currentFate :
      (card && card.currentFate != null) ? card.currentFate : null
    );
    const base = numericFateValue(
      (visual && visual.fate != null) ? visual.fate :
      (card && card.fate != null) ? card.fate : null
    );
    if(current == null || base == null) return '';
    if(current > base) return 'up';
    if(current < base) return 'down';
    return '';
  }

  function coordinatorFatePresentationVisual(card, visual){
    const iid = getCardIid(card);
    const placementPending = iid ? deferredPlacementFatePulseByIid.get(iid) : null;
    const coordinatorPending = iid ? deferredCoordinatorFatePulseByIid.get(iid) : null;
    const pending = placementPending && Date.now() < Number(placementPending.until || 0)
      ? placementPending
      : coordinatorPending;
    if(!pending || Date.now() >= Number(pending.until || 0)) return visual;
    return Object.assign({}, visual || {}, {
      displayFate:String(pending.fromValue),
      currentFate:pending.fromValue
    });
  }

  function drawFateBadge(ctx, visual, r, card){
    visual = coordinatorFatePresentationVisual(card, visual);
    const fate = visual && visual.displayFate != null ? String(visual.displayFate) : '';
    if(!fate) return;
    const deltaState = fateBadgeState(card, visual);
    const isUp = deltaState === 'up';
    const isDown = deltaState === 'down';
    const label = visual && visual.isHidden ? '-' : fate;
    const accent = isUp ? '#7fff90' : isDown ? '#ff6060' : '#f1c40f';
    const accentGlow = isUp ? 'rgba(127,255,144,.82)' : isDown ? 'rgba(255,96,96,.78)' : 'rgba(241,196,15,.76)';
    const badgeH = Math.max(24, Math.min(34, r.w * .255));
    const badgeW = Math.max(badgeH, Math.min(43, badgeH + Math.max(0, label.length - 1) * 5.4));
    const bx = r.x + r.w - badgeW - Math.max(1, badgeH * .04);
    const by = r.y + Math.max(1, badgeH * .035);
    const cx = bx + badgeW / 2;
    const cy = by + badgeH / 2;
    const radius = badgeH / 2;

    ctx.save();
    roundedPath(ctx, bx, by, badgeW, badgeH, radius);
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = Math.max(7, badgeH * .34);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = 'rgba(5,6,10,.96)';
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.lineWidth = Math.max(2.25, badgeH * .092);
    ctx.strokeStyle = accent;
    ctx.stroke();
    ctx.shadowBlur = 0;
    roundedPath(ctx, bx + 1.2, by + 1.2, badgeW - 2.4, badgeH - 2.4, Math.max(4, radius - 1.2));
    ctx.strokeStyle = 'rgba(255,246,190,.20)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.font = '950 ' + Math.max(15, Math.round(label.length > 1 ? badgeH * .60 : badgeH * .72)) + 'px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = Math.max(12, badgeH * .46);
    ctx.fillText(label, cx, cy + badgeH * .04);
    ctx.shadowColor = 'rgba(0,0,0,.85)';
    ctx.shadowBlur = 1.5;
    ctx.fillText(label, cx, cy + badgeH * .04);
    ctx.restore();
  }

  function getTimeline(){
    return window.FateMatchAnimationTimeline || null;
  }

  function actionPresenter(){
    return window.FateActionPresentation || null;
  }

  function isActionAnimationActive(){
    const presenter = actionPresenter();
    try {
      return !!(presenter && typeof presenter.isActionAnimating === 'function' && presenter.isActionAnimating());
    } catch(e) {
      return false;
    }
  }

  function isActionCommitRenderAllowed(){
    try {
      return typeof window !== 'undefined'
        && Number(window.__fateAllowActionCommitRenderUntil || 0) > nowMs();
    } catch(e) {
      return false;
    }
  }

  function noteActionRendererEvent(kind, details){
    const presenter = actionPresenter();
    try {
      if(presenter && typeof presenter.noteRendererEvent === 'function') {
        presenter.noteRendererEvent(kind, Object.assign({source:'FateMatchRendererAdapter'}, details || {}));
      }
    } catch(e) {}
  }

  function forbiddenActionDirtyMask(mask){
    return (Number(mask) || 0) & (DIRTY_LAYOUT | DIRTY_BACKGROUND | DIRTY_BOARD_CARDS | DIRTY_HAND | DIRTY_OPP_HAND | DIRTY_PILES | DIRTY_MOTION);
  }

  function layoutStructureKey(layout){
    if(!layout) return '';
    const parts = [];
    const vp = layout.viewport || {};
    parts.push('vp', Math.round(Number(vp.w) || 0), Math.round(Number(vp.h) || 0), Math.round((Number(vp.renderScale) || 1) * 100));
    const zones = Array.isArray(layout.zones) ? layout.zones : [];
    zones.forEach(function(zone){
      const rows = Array.isArray(zone.rows) ? zone.rows : [];
      parts.push('z', zone.z, 'rows', rows.length);
      rows.forEach(function(row){
        const cells = Array.isArray(row.cells) ? row.cells : [];
        parts.push('r', row.r, 'owner', row.owner, 'full', row.fullExtraRow ? 1 : 0, 'cells', cells.length);
      });
    });
    return parts.join('|');
  }

  function getCardIid(card){
    return card && card.iid != null ? String(card.iid) : '';
  }

  function boardCardIidCounts(entries){
    const counts = new Map();
    const list = Array.isArray(entries) ? entries : [];
    list.forEach(function(entry){
      const iid = getCardIid(entry && entry.card);
      if(!iid) return;
      counts.set(iid, (counts.get(iid) || 0) + 1);
    });
    return counts;
  }

  function clearBoardMotionStateForIid(iid){
    const key = String(iid == null ? '' : iid);
    if(!key) return;
    lastCardRectByIid.delete(key);
    pendingPlacementRectByIid.delete(key);
    suppressedInitialPlacementUntilByIid.delete(key);
    vfxHiddenBoardCardUntilByIid.delete(key);
    const timeline = getTimeline();
    if(timeline && typeof timeline.clearForCardKind === 'function') timeline.clearForCardKind(key, 'card-move');
    else if(timeline && typeof timeline.clearForCard === 'function') timeline.clearForCard(key, 'card-move');
    try {
      if(window.FateVfxEventBridge && typeof window.FateVfxEventBridge.cancelForCard === 'function') {
        window.FateVfxEventBridge.cancelForCard(key);
      }
      if(window.FateVfxDirector && typeof window.FateVfxDirector.cancelForCard === 'function') {
        window.FateVfxDirector.cancelForCard(key);
      }
    } catch(e) {}
  }

  function refreshBoardMotionIdentityQuarantine(iidCounts){
    const next = new Set();
    if(iidCounts && typeof iidCounts.forEach === 'function'){
      iidCounts.forEach(function(count, iid){
        if(Number(count) > 1){
          next.add(String(iid));
          clearBoardMotionStateForIid(iid);
        }
      });
    }
    quarantinedBoardMotionIids.forEach(function(iid){
      if(!next.has(iid)) clearBoardMotionStateForIid(iid);
    });
    quarantinedBoardMotionIids = next;
  }

  function canTrackBoardMotionIid(iid, iidCounts){
    const key = String(iid == null ? '' : iid);
    if(!key) return false;
    if(quarantinedBoardMotionIids.has(key)) return false;
    if(!iidCounts || typeof iidCounts.get !== 'function') return true;
    return Number(iidCounts.get(key) || 0) === 1;
  }

  function getCardFateValue(card, visual){
    if(visual && visual.displayFate != null) return String(visual.displayFate);
    if(card && card.currentFate != null) return String(card.currentFate);
    if(card && card.fate != null) return String(card.fate);
    return '';
  }

  function coordinatorCinematicDelayUntil(){
    let totalMs = 3260;
    try {
      if(typeof window.getConsolidationCinematicTotalMs === 'function') {
        totalMs = Math.max(totalMs, Number(window.getConsolidationCinematicTotalMs()) || 0);
      }
    } catch(e) {}
    const gameLockUntil = typeof G !== 'undefined' && G ? Number(G._cinematicUiLockUntil) || 0 : 0;
    return Math.max(Date.now() + totalMs + 140, gameLockUntil + 100);
  }

  function prepareCoordinatorAuraFateDelays(entries){
    const currentBoardCardIids = new Set();
    (entries || []).forEach(function(entry){
      const iid = getCardIid(entry && entry.card);
      if(iid) currentBoardCardIids.add(iid);
    });
    const hadPreviousBoard = lastBoardCardIids.size > 0;
    const previousBoardCardIids = lastBoardCardIids;
    lastBoardCardIids = currentBoardCardIids;
    if(!hadPreviousBoard || typeof window.getCoordinatorPlacementFlashTargets !== 'function') return;
    const coordinatorIds = new Set(['01','10','11','15','19','23','57']);
    (entries || []).forEach(function(entry){
      const source = entry && entry.card;
      const sourceIid = getCardIid(source);
      if(!source || !sourceIid || !coordinatorIds.has(String(source.id || '')) || previousBoardCardIids.has(sourceIid)) return;
      const until = coordinatorCinematicDelayUntil();
      const targets = window.getCoordinatorPlacementFlashTargets(source, Number(entry.z), Number(entry.r), Number(entry.c)) || [];
      targets.forEach(function(target){
        const targetIid = getCardIid(target);
        if(!targetIid) return;
        coordinatorAuraFateDelayUntilByIid.set(targetIid, Math.max(Number(coordinatorAuraFateDelayUntilByIid.get(targetIid)) || 0, until));
        const soundMode = String(source.id || '') === '19' ? 'kvetka' : 'generic';
        if(soundMode === 'generic' || !coordinatorAuraFateSoundModeByIid.has(targetIid)){
          coordinatorAuraFateSoundModeByIid.set(targetIid, soundMode);
        }
      });
    });
  }

  function deferCoordinatorFatePulse(iid, fromValue, toValue, delta, until){
    const key = String(iid || '');
    if(!key || !Number.isFinite(Number(delta)) || Number(delta) === 0) return false;
    const previous = deferredCoordinatorFatePulseByIid.get(key);
    if(previous && previous.timer) clearTimeout(previous.timer);
    const record = {
      fromValue:previous ? previous.fromValue : fromValue,
      toValue,
      delta:Number(toValue) - Number(previous ? previous.fromValue : fromValue),
      until:Math.max(Number(until) || 0, previous ? Number(previous.until) || 0 : 0),
      soundMode:coordinatorAuraFateSoundModeByIid.get(key) || (previous && previous.soundMode) || 'generic',
      timer:null
    };
    const waitMs = Math.max(0, record.until - Date.now());
    record.timer = setTimeout(function(){
      const pending = deferredCoordinatorFatePulseByIid.get(key);
      if(!pending || pending !== record) return;
      deferredCoordinatorFatePulseByIid.delete(key);
      coordinatorAuraFateDelayUntilByIid.delete(key);
      coordinatorAuraFateSoundModeByIid.delete(key);
      const timeline = getTimeline();
      if(!timeline || !Number.isFinite(Number(pending.delta)) || Number(pending.delta) === 0) return;
      if(typeof timeline.clearForCardKind === 'function') timeline.clearForCardKind(key, 'fate-pulse');
      else if(typeof timeline.clearForCard === 'function') timeline.clearForCard(key, 'fate-pulse');
      presentFateDelta({
        iid:key,
        fromValue:pending.fromValue,
        toValue:pending.toValue,
        delta:pending.delta
      });
      if(pending.soundMode !== 'kvetka'){
        try {
          if(typeof window.playSfx === 'function'){
            window.playSfx(Number(pending.delta) > 0 ? 'fateGain' : 'fateLose');
          }
        } catch(e) {}
      }
      scheduleRender('coordinator-fate-after-cinematic');
    }, waitMs);
    deferredCoordinatorFatePulseByIid.set(key, record);
    return true;
  }

  function placementFateRevealUntil(card, existingUntil){
    const now = Date.now();
    const meta = card && card._placementFateReveal;
    const mode = String(meta && meta.mode || 'set');
    const isFaceDown = !!(card && card.faceDown);
    const gameLockUntil = typeof G !== 'undefined' && G ? Number(G._cinematicUiLockUntil) || 0 : 0;
    const actionLockUntil = typeof G !== 'undefined' && G ? Number(G._actionPresentationLockUntil) || 0 : 0;
    let until = Math.max(0, Number(existingUntil) || 0);
    if(!until) {
      let settleMs = 340;
      if(mode === 'consolidation' && !isFaceDown) {
        let cinematicMs = 3260;
        try {
          if(typeof window.getConsolidationCinematicTotalMs === 'function') {
            cinematicMs = Math.max(cinematicMs, Number(window.getConsolidationCinematicTotalMs()) || 0);
          }
        } catch(e) {}
        settleMs = cinematicMs + 260;
      }
      const createdAt = Math.max(0, Number(meta && meta.createdAt) || now);
      until = createdAt + settleMs;
      if(until <= now) until = now + 180;
    }
    if(gameLockUntil > now) until = Math.max(until, gameLockUntil + 100);
    if(actionLockUntil > now) until = Math.max(until, actionLockUntil + 100);
    return until;
  }

  function clearLivePlacementFateReveal(iid){
    const key = String(iid || '');
    if(!key || typeof G === 'undefined' || !G || !Array.isArray(G.board)) return;
    G.board.forEach(function(zone){
      (zone || []).forEach(function(row){
        (row || []).forEach(function(card){
          if(card && String(card.iid || '') === key) {
            try { delete card._placementFateReveal; } catch(e) {}
          }
        });
      });
    });
  }

  function schedulePlacementFateReveal(card, record){
    if(!record) return;
    if(record.timer) clearTimeout(record.timer);
    record.timer = setTimeout(function finishPlacementFateReveal(){
      const pending = deferredPlacementFatePulseByIid.get(record.iid);
      if(!pending || pending !== record) return;
      const extendedUntil = placementFateRevealUntil(card, pending.until);
      const gameLockUntil = typeof G !== 'undefined' && G ? Number(G._cinematicUiLockUntil) || 0 : 0;
      const actionLockUntil = typeof G !== 'undefined' && G ? Number(G._actionPresentationLockUntil) || 0 : 0;
      if(extendedUntil > pending.until || gameLockUntil > Date.now() || actionLockUntil > Date.now()) {
        pending.until = Math.max(extendedUntil, gameLockUntil + 100, actionLockUntil + 100);
        schedulePlacementFateReveal(card, pending);
        return;
      }
      deferredPlacementFatePulseByIid.delete(record.iid);
      completedPlacementFateRevealAtByIid.set(record.iid, Number(record.createdAt) || Date.now());
      try { delete card._placementFateReveal; } catch(e) {}
      clearLivePlacementFateReveal(record.iid);
      const delta = Number(pending.toValue) - Number(pending.fromValue);
      const timeline = getTimeline();
      if(timeline && Number.isFinite(delta) && delta !== 0) {
        if(typeof timeline.clearForCardKind === 'function') timeline.clearForCardKind(record.iid, 'fate-pulse');
        else if(typeof timeline.clearForCard === 'function') timeline.clearForCard(record.iid, 'fate-pulse');
        presentFateDelta({
          iid:record.iid,
          fromValue:pending.fromValue,
          toValue:pending.toValue,
          delta
        });
      }
      let incomingCoordinatorFeedback = {flashed:false, hasNonKvetka:false, kvetkaGainAmount:0};
      try {
        if(Number.isFinite(delta) && delta !== 0 && typeof window.flashIncomingCoordinatorEffects === 'function') {
          incomingCoordinatorFeedback = window.flashIncomingCoordinatorEffects(record.iid, {
            createdAt:record.createdAt,
            fromValue:pending.fromValue,
            toValue:pending.toValue
          }) || incomingCoordinatorFeedback;
        }
      } catch(e) {}
      const kvetkaGainAmount = Math.max(0, Number(pending.kvetkaGainAmount) || 0)
        + Math.max(0, Number(incomingCoordinatorFeedback.kvetkaGainAmount) || 0);
      const genericSoundRequested = !!pending.genericSoundRequested || !!incomingCoordinatorFeedback.hasNonKvetka;
      const kvetkaOnlyGain = delta > 0
        && !genericSoundRequested
        && kvetkaGainAmount > 0
        && delta === kvetkaGainAmount;
      if(Number.isFinite(delta) && delta !== 0 && !kvetkaOnlyGain) {
        try {
          if(typeof window.playSfx === 'function') window.playSfx(delta > 0 ? 'fateGain' : 'fateLose');
        } catch(e) {}
      }
      scheduleRender('placement-fate-after-settle');
    }, Math.max(0, Number(record.until || 0) - Date.now()));
  }

  function deferPlacementFateReveal(card, fateValue){
    const iid = getCardIid(card);
    const meta = card && card._placementFateReveal;
    const createdAt = Math.max(0, Number(meta && meta.createdAt) || 0);
    const completedAt = iid ? Math.max(0, Number(completedPlacementFateRevealAtByIid.get(iid)) || 0) : 0;
    if(!iid || !meta || (completedAt && (!createdAt || completedAt >= createdAt))) return false;
    let record = deferredPlacementFatePulseByIid.get(iid);
    if(!record) {
      record = {
        iid,
        createdAt:createdAt || Date.now(),
        fromValue:String(meta.fromValue == null ? fateValue : meta.fromValue),
        toValue:String(fateValue),
        genericSoundRequested:!!meta.genericSoundRequested,
        kvetkaGainAmount:Math.max(0, Number(meta.kvetkaGainAmount) || 0),
        until:placementFateRevealUntil(card, 0),
        timer:null
      };
      deferredPlacementFatePulseByIid.set(iid, record);
    } else {
      record.toValue = String(fateValue);
      record.genericSoundRequested = record.genericSoundRequested || !!meta.genericSoundRequested;
      record.kvetkaGainAmount = Math.max(record.kvetkaGainAmount || 0, Number(meta.kvetkaGainAmount) || 0);
      record.until = placementFateRevealUntil(card, record.until);
    }
    schedulePlacementFateReveal(card, record);
    return Date.now() < Number(record.until || 0);
  }

  function observeCardForAnimations(card, visual, cardRect){
    const timeline = getTimeline();
    const iid = getCardIid(card);
    if(!timeline || !iid) return;
    const fateValue = getCardFateValue(card, visual);
    const prev = lastCardFateByIid.get(iid);
    const coordinatorDelayUntil = Number(coordinatorAuraFateDelayUntilByIid.get(iid)) || 0;
    if(deferPlacementFateReveal(card, fateValue)) {
      lastCardFateByIid.set(iid, fateValue);
      return;
    }
    if(prev == null && coordinatorDelayUntil > Date.now()){
      const storedFate = Number(card && (card.currentFate ?? card.fate));
      const displayedFate = Number(fateValue);
      const coordinatorDelta = Number.isFinite(storedFate) && Number.isFinite(displayedFate) ? displayedFate - storedFate : 0;
      if(coordinatorDelta !== 0) deferCoordinatorFatePulse(iid, storedFate, fateValue, coordinatorDelta, coordinatorDelayUntil);
    }
    if(card && card._suppressNextFatePulse && prev != null && prev !== fateValue) {
      delete card._suppressNextFatePulse;
      if(typeof timeline.clearForCardKind === 'function') timeline.clearForCardKind(iid, 'fate-pulse');
      else if(typeof timeline.clearForCard === 'function') timeline.clearForCard(iid, 'fate-pulse');
      lastCardFateByIid.set(iid, fateValue);
      return;
    }
    if(prev != null && prev !== fateValue && coordinatorDelayUntil > Date.now()){
      const prevNum = Number(prev);
      const nextNum = Number(fateValue);
      const coordinatorDelta = Number.isFinite(prevNum) && Number.isFinite(nextNum) ? nextNum - prevNum : 0;
      if(coordinatorDelta !== 0){
        deferCoordinatorFatePulse(iid, prev, fateValue, coordinatorDelta, coordinatorDelayUntil);
        lastCardFateByIid.set(iid, fateValue);
        return;
      }
    }
    if(animationsOff()){
      if(prev != null && prev !== fateValue){
        const prevNum = Number(prev);
        const nextNum = Number(fateValue);
        const delta = Number.isFinite(prevNum) && Number.isFinite(nextNum) ? nextNum - prevNum : 0;
        if(delta){
          if(typeof timeline.clearForCardKind === 'function') timeline.clearForCardKind(iid, 'fate-pulse');
          else if(typeof timeline.clearForCard === 'function') timeline.clearForCard(iid, 'fate-pulse');
          presentFateDelta({
            iid,
            fromValue:prev,
            toValue:fateValue,
            delta,
            numbersOnly:true
          });
          lastCardFateByIid.set(iid, fateValue);
          return;
        }
        if(window.FateVfxEventBridge && typeof window.FateVfxEventBridge.cancelForCard === 'function') {
          window.FateVfxEventBridge.cancelForCard(iid);
        }
      }
      if(typeof timeline.clearForCardKind === 'function') timeline.clearForCardKind(iid, 'fate-pulse');
      else if(typeof timeline.clearForCard === 'function') timeline.clearForCard(iid, 'fate-pulse');
      lastCardFateByIid.set(iid, fateValue);
      return;
    }
    if(prev != null && prev !== fateValue){
      const prevNum = Number(prev);
      const nextNum = Number(fateValue);
      const delta = Number.isFinite(prevNum) && Number.isFinite(nextNum) ? nextNum - prevNum : 0;
      if(delta){
        if(typeof timeline.clearForCardKind === 'function') timeline.clearForCardKind(iid, 'fate-pulse');
        else timeline.clearForCard(iid, 'fate-pulse');
        presentFateDelta({
          iid,
          rect:cardRect,
          fromValue:prev,
          toValue:fateValue,
          delta
        });
      }
    }
    lastCardFateByIid.set(iid, fateValue);
  }

  function getTributeState(entry){
    try {
      if(typeof G === 'undefined' || !G || !G._consolidating || !entry) return '';
      if(typeof isLocalConsolidationActive === 'function' && !isLocalConsolidationActive()) return '';
      const con = G._consolidating;
      const viewer = typeof getPerspectivePlayerIndex === 'function'
        ? Number(getPerspectivePlayerIndex())
        : (G && Number.isInteger(G.viewerPlayerIndex) ? Number(G.viewerPlayerIndex) : Number(G.currentPlayer || 0));
      if(entry.card && Number(entry.card.owner) !== viewer) return '';
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
          return sum + (possible ? Math.max(0, Number(possible.reinforcement) || 0) : 0);
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
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
  }

  function drawConsolidationCardOverlay(ctx, r, state){
    if(!ctx || !r || !state) return;
    const selected = state === 'selected';
    const ready = state === 'ready';
    const placement = state === 'placement';
    if(!selected && !ready && !placement) return;
    const color = selected
      ? 'rgba(255,244,132,.98)'
      : ready
        ? 'rgba(146,230,255,.96)'
        : 'rgba(255,225,92,.94)';
    const glow = selected
      ? 'rgba(255,215,64,.26)'
      : ready
        ? 'rgba(90,205,255,.22)'
        : 'rgba(255,205,55,.18)';
    const inset = Math.max(2, Math.min(4, r.w * .025));
    const radius = Math.max(6, Math.min(11, r.w * .07));
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = Math.max(3, r.w * .035);
    ctx.lineJoin = 'round';
    roundedPath(ctx, r.x + inset, r.y + inset, Math.max(1, r.w - inset * 2), Math.max(1, r.h - inset * 2), radius);
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function scheduleNonFateTimelineFrame(){
    const timeline = getTimeline();
    if(!timeline || typeof timeline.hasActiveAnimations !== 'function') return;
    if(timeline.hasActiveAnimations('card-move')) scheduleRender('animation');
  }

  function drawBlockOverlay(ctx, r, block){
    if(!block) return;
    const type = block.type === 'carolyn' ? 'carolyn' : 'zoe';
    const isCarolyn = type === 'carolyn';
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    ctx.save();
    roundedPath(ctx, r.x + 1, r.y + 1, Math.max(0, r.w - 2), Math.max(0, r.h - 2), 5);
    ctx.fillStyle = isCarolyn ? 'rgba(88,12,18,.34)' : 'rgba(70,42,120,.22)';
    ctx.fill();
    ctx.lineWidth = isCarolyn ? 1.8 : 1.45;
    ctx.strokeStyle = isCarolyn ? 'rgba(255,86,92,.72)' : 'rgba(190,150,255,.66)';
    ctx.stroke();
    if(isCarolyn){
      const size = Math.max(30, Math.min(44, Math.min(r.w, r.h) * .32));
      const bodyW = size * .66;
      const bodyH = size * .48;
      const bodyX = cx - bodyW / 2;
      const bodyY = cy - bodyH * .24;
      const shackleW = bodyW * .58;
      const shackleH = size * .42;
      const shackleY = bodyY - shackleH * .72;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx - shackleW / 2, bodyY + bodyH * .10);
      ctx.lineTo(cx - shackleW / 2, shackleY + shackleH * .56);
      ctx.quadraticCurveTo(cx - shackleW / 2, shackleY, cx, shackleY);
      ctx.quadraticCurveTo(cx + shackleW / 2, shackleY, cx + shackleW / 2, shackleY + shackleH * .56);
      ctx.lineTo(cx + shackleW / 2, bodyY + bodyH * .10);
      ctx.lineWidth = Math.max(2.6, size * .075);
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(250,252,255,.96)';
      ctx.stroke();
      roundedPath(ctx, bodyX, bodyY, bodyW, bodyH, Math.max(3, size * .10));
      ctx.fillStyle = 'rgba(245,248,252,.96)';
      ctx.fill();
      ctx.lineWidth = Math.max(1.4, size * .042);
      ctx.strokeStyle = 'rgba(198,206,216,.86)';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, bodyY + bodyH * .48, Math.max(2.2, size * .055), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(36,26,24,.90)';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, bodyY + bodyH * .52);
      ctx.lineTo(cx, bodyY + bodyH * .74);
      ctx.lineWidth = Math.max(1.4, size * .034);
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(36,26,24,.90)';
      ctx.stroke();
      ctx.restore();
    } else {
      const iconR = Math.max(9, Math.min(16, Math.min(r.w, r.h) * .13));
      ctx.beginPath();
      ctx.arc(cx, cy, iconR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(112,72,184,.95)';
      ctx.fill();
      ctx.lineWidth = Math.max(1.2, iconR * .12);
      ctx.strokeStyle = 'rgba(220,202,255,.78)';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - iconR * .54, cy);
      ctx.lineTo(cx + iconR * .54, cy);
      ctx.lineWidth = Math.max(2, iconR * .24);
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,.96)';
      ctx.stroke();
    }
    ctx.restore();
  }

  function getBoardCell(z, r, c){
    try {
      return G && G.board && G.board[z] && G.board[z][r] ? G.board[z][r][c] : null;
    } catch(e) {
      return null;
    }
  }

  function cellHasBlock(z, r, c, type){
    const list = G && Array.isArray(G.blockedCells) ? G.blockedCells : [];
    for(let i = 0; i < list.length; i++){
      const b = list[i];
      if(!b || Number(b.z) !== Number(z) || Number(b.r) !== Number(r) || Number(b.c) !== Number(c)) continue;
      if(!type || b.type === type) return true;
    }
    return false;
  }

  function isCellBlockedForTarget(z, r, c){
    if(typeof isBlocked === 'function') {
      try { return !!isBlocked(z, r, c); } catch(e) {}
    }
    return cellHasBlock(z, r, c);
  }

  function squareMatchesOption(options, z, r, c){
    return Array.isArray(options) && options.some(function(o){
      return o && Number(o.z) === Number(z) && Number(o.r) === Number(r) && Number(o.c) === Number(c);
    });
  }

  function isOpenSquareTarget(z, r, c){
    return !getBoardCell(z, r, c) && !isCellBlockedForTarget(z, r, c);
  }

  function selectionOptionForCell(mv, z, r, c){
    if(!mv || !Array.isArray(mv.options)) return null;
    if(selectionOptionCacheState !== mv){
      selectionOptionCacheState = mv;
      selectionOptionCache = new Map();
      mv.options.forEach(function(option){
        if(!option) return;
        selectionOptionCache.set(Number(option.z) + ':' + Number(option.r) + ':' + Number(option.c), option);
      });
    }
    return selectionOptionCache ? selectionOptionCache.get(Number(z) + ':' + Number(r) + ':' + Number(c)) || null : null;
  }

  function isSelectionTargetCell(cell){
    if(!cell || typeof G === 'undefined' || !G) return false;
    const z = Number(cell.z);
    const r = Number(cell.r);
    const c = Number(cell.c);
    if(G.blockingCell){
      const rawBlockZone = typeof window !== 'undefined' ? window._blockZone : null;
      const blockType = Number(rawBlockZone) === -1 ? 'carolyn' : 'zoe';
      const blockZ = blockType === 'carolyn' ? z : Number(rawBlockZone);
      const owner = Number(G.currentPlayer) || 0;
      if(blockType === 'zoe'){
        if(z !== blockZ || cellHasBlock(z, r, c)) return false;
        if(typeof isZoeBlockTargetAllowed === 'function') {
          try { if(!isZoeBlockTargetAllowed(blockZ, r, c, owner)) return false; } catch(e) {}
        }
        return true;
      }
      if(typeof isOwnSafeRowSquare === 'function') {
        try { if(isOwnSafeRowSquare(blockZ, r, c, owner)) return false; } catch(e) {}
      }
      return !getBoardCell(z, r, c) && !cellHasBlock(z, r, c, 'carolyn');
    }
    if(G._markSelecting){
      const sel = G._markSelecting;
      if(Number(sel.player) !== Number(G.currentPlayer)) return false;
      if(typeof sel.zone === 'number' && z !== Number(sel.zone)) return false;
      const expectedRow = Number.isInteger(sel.row)
        ? sel.row
        : (typeof getMarkSafeSquareChoiceRow === 'function' ? getMarkSafeSquareChoiceRow(z, Number(sel.player)) : (typeof getNextExtraRowIndex === 'function' ? getNextExtraRowIndex(z) : 3));
      return (cell && cell.markSafeChoice === true && !cell.markSafe) || (r === expectedRow && !cell.markSafe);
    }
    const havanoDeploying = G._havanoDeploying || G._onlineHavanoReactionDeploying || null;
    const havanoOptions = havanoDeploying && (havanoDeploying.options || havanoDeploying.deploymentOptions);
    if(havanoDeploying && squareMatchesOption(havanoOptions, z, r, c)){
      return isOpenSquareTarget(z, r, c);
    }
    const optionStates = [G._wolfCreekMoving, G._berkeleyMoving, G._landscapeMoving, G._busserMoving];
    for(let i = 0; i < optionStates.length; i++){
      const mv = optionStates[i];
      if(mv){
        const option = selectionOptionForCell(mv, z, r, c);
        if(option) {
          if(mv === G._wolfCreekMoving) return true;
          return String(option.kind || 'move') === 'swap' ? !!getBoardCell(z, r, c) : isOpenSquareTarget(z, r, c);
        }
      }
    }
    if(G._expMoving && (typeof isLocalPlayerActionTurn !== 'function' || isLocalPlayerActionTurn())) {
      const card = G._expMoving.card || null;
      const owner = card && typeof card.owner === 'number' ? card.owner : G.currentPlayer;
      if(Number(owner) !== Number(G.currentPlayer)) return false;
      if(typeof isContestedOrOwnSafeSquare === 'function') {
        try { if(!isContestedOrOwnSafeSquare(z, r, c, owner)) return false; } catch(e) {}
      }
      return isOpenSquareTarget(z, r, c);
    }
    if(G._bh01Moving) return isOpenSquareTarget(z, r, c);
    if(G._busserMovingCard){
      const mv = G._busserMovingCard;
      const cp = mv && mv.card && typeof mv.card._busserOwner === 'number' ? mv.card._busserOwner : G.currentPlayer;
      const ownerSafeRow = Number(cp) === 0 ? 2 : 0;
      const adjacent = Number.isFinite(Number(mv.fromZ)) && Math.abs(z - Number(mv.fromZ)) === 1;
      return adjacent && (r === 1 || r === ownerSafeRow) && isOpenSquareTarget(z, r, c);
    }
    return false;
  }

  function getSelectionTargetKind(cell){
    if(!isSelectionTargetCell(cell)) return '';
    const z = Number(cell.z);
    const r = Number(cell.r);
    const c = Number(cell.c);
    const optionStates = [G._wolfCreekMoving, G._berkeleyMoving, G._landscapeMoving, G._busserMoving];
    for(let i = 0; i < optionStates.length; i++){
      const mv = optionStates[i];
      const option = selectionOptionForCell(mv, z, r, c);
      if(option) {
        const kind = String(option.kind || 'move');
        return mv === G._wolfCreekMoving && kind !== 'swap' ? 'wolf-creek-move' : kind;
      }
    }
    if(G._bh01Moving) return 'brave-horizons-move';
    return getBoardCell(z, r, c) ? 'card' : 'move';
  }

  function isTutorialTargetCell(cell){
    if(!cell || typeof window.tutorialCurrentTargetSquare !== 'function') return false;
    let target = null;
    try { target = window.tutorialCurrentTargetSquare(); } catch(e) { target = null; }
    return !!(target
      && Number(target.z) === Number(cell.z)
      && Number(target.r) === Number(cell.r)
      && Number(target.c) === Number(cell.c));
  }

  function requestTutorialTargetPulseFrame(){
    if(tutorialTargetPulseTimer || animationsOff()) return;
    tutorialTargetPulseTimer = setTimeout(function(){
      tutorialTargetPulseTimer = 0;
      scheduleRender('tutorial-target-pulse');
    }, 90);
  }

  function requestSelectionTargetPulseFrame(){
    if(selectionTargetPulseTimer || animationsOff()) return;
    selectionTargetPulseTimer = setTimeout(function(){
      selectionTargetPulseTimer = 0;
      scheduleRender('selection-target-pulse');
    }, 90);
  }

  function drawWolfCreekOpenSquareCue(ctx, r){
    ctx.save();
    roundedPath(ctx, r.x + 1, r.y + 1, Math.max(0, r.w - 2), Math.max(0, r.h - 2), 5);
    ctx.fillStyle = 'rgba(201,168,76,.16)';
    ctx.fill();
    ctx.lineWidth = 1.45;
    ctx.strokeStyle = 'rgba(255,222,104,.72)';
    ctx.stroke();
    ctx.restore();
  }

  function drawSquareSelectionCue(ctx, r, kind){
    if(String(kind || '') === 'brave-horizons-move') {
      ctx.save();
      roundedPath(ctx, r.x + 2, r.y + 2, Math.max(0, r.w - 4), Math.max(0, r.h - 4), 5);
      ctx.fillStyle = 'rgba(93,190,224,.025)';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(116,207,237,.62)';
      ctx.stroke();
      ctx.restore();
      return;
    }
    if(String(kind || '') === 'wolf-creek-move') {
      drawWolfCreekOpenSquareCue(ctx, r);
      return;
    }
    const t = animationsOff() ? .5 : ((Math.sin(nowMs() / 210) + 1) / 2);
    const isSwap = String(kind || '') === 'swap' || String(kind || '') === 'card';
    ctx.save();
    roundedPath(ctx, r.x + 3, r.y + 3, Math.max(0, r.w - 6), Math.max(0, r.h - 6), 6);
    if(!isSwap) {
      ctx.fillStyle = 'rgba(255,216,96,' + (.07 + t * .04).toFixed(3) + ')';
      ctx.fill();
    }
    ctx.lineWidth = isSwap ? 1.35 : (2.2 + t * 1.05);
    ctx.strokeStyle = isSwap
      ? 'rgba(255,222,104,' + (.88 + t * .08).toFixed(3) + ')'
      : 'rgba(255,232,118,' + (.78 + t * .18).toFixed(3) + ')';
    ctx.shadowColor = 'rgba(255,211,74,' + (isSwap ? (.18 + t * .10) : (.32 + t * .25)).toFixed(3) + ')';
    ctx.shadowBlur = isSwap ? 5 + t * 3 : 12 + t * 10;
    ctx.stroke();
    ctx.restore();
    if(!isSwap) requestSelectionTargetPulseFrame();
  }

  function drawTutorialTargetCue(ctx, r){
    const t = animationsOff() ? .5 : ((Math.sin(nowMs() / 230) + 1) / 2);
    const alpha = .32 + t * .34;
    ctx.save();
    roundedPath(ctx, r.x + 4, r.y + 4, Math.max(0, r.w - 8), Math.max(0, r.h - 8), 6);
    ctx.fillStyle = 'rgba(255,216,96,' + (.045 + t * .035).toFixed(3) + ')';
    ctx.fill();
    ctx.lineWidth = 1.65 + t * .75;
    ctx.strokeStyle = 'rgba(255,226,122,' + alpha.toFixed(3) + ')';
    ctx.shadowColor = 'rgba(255,213,91,' + (.24 + t * .22).toFixed(3) + ')';
    ctx.shadowBlur = 13 + t * 10;
    ctx.stroke();
    ctx.restore();
    requestTutorialTargetPulseFrame();
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

  function transformedRectBounds(r, radians, pivot){
    if(!r) return null;
    const angle = Number(radians) || 0;
    if(!angle) return cloneRect(r);
    const cx = pivot && Number.isFinite(pivot.x) ? pivot.x : r.x + r.w / 2;
    const cy = pivot && Number.isFinite(pivot.y) ? pivot.y : r.y + r.h / 2;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const corners = [
      {x:r.x, y:r.y},
      {x:r.x + r.w, y:r.y},
      {x:r.x + r.w, y:r.y + r.h},
      {x:r.x, y:r.y + r.h}
    ].map(function(p){
      const dx = p.x - cx;
      const dy = p.y - cy;
      return {
        x:cx + dx * cos - dy * sin,
        y:cy + dx * sin + dy * cos
      };
    });
    const xs = corners.map(function(p){ return p.x; });
    const ys = corners.map(function(p){ return p.y; });
    const minX = Math.min.apply(Math, xs);
    const maxX = Math.max.apply(Math, xs);
    const minY = Math.min.apply(Math, ys);
    const maxY = Math.max.apply(Math, ys);
    return {x:minX, y:minY, w:Math.max(0, maxX - minX), h:Math.max(0, maxY - minY)};
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
    return false;
  }

  function fallbackBoardEntrySourceRect(card, targetRect){
    const owner = card && typeof card.owner === 'number' ? Number(card.owner) : null;
    const viewer = typeof G !== 'undefined' && G && typeof getPerspectivePlayerIndex === 'function'
      ? getPerspectivePlayerIndex()
      : (lastLayout && lastLayout.snapshot && Number(lastLayout.snapshot.viewer) || 0);
    const iid = getCardIid(card);
    const oldHands = owner === viewer ? lastHitMap.handCards : lastHitMap.opponentHandCards;
    const byIid = Array.isArray(oldHands) && iid
      ? oldHands.find(function(item){ return String(item && item.iid) === iid; })
      : null;
    const anySlot = Array.isArray(oldHands) && oldHands.length
      ? oldHands[Math.min(oldHands.length - 1, Math.max(0, Math.floor(oldHands.length / 2)))]
      : null;
    const source = byIid || anySlot;
    if(source && source.rect) return cloneRect(source.rect);
    const pileList = Array.isArray(lastHitMap.piles) ? lastHitMap.piles : [];
    const deck = pileList.find(function(item){
      return item && item.pile === 'deck' && (owner == null || Number(item.playerIndex) === owner);
    }) || pileList.find(function(item){ return item && item.pile === 'deck'; });
    if(deck && deck.rect) return cloneRect(deck.rect);
    if(!targetRect) return null;
    const w = Math.max(36, Math.min(84, targetRect.w * (owner === viewer ? .72 : .48)));
    const h = Math.round(w * 1.4);
    if(owner === viewer) return {x:targetRect.x, y:targetRect.y + targetRect.h + h * .72, w, h};
    return {x:34, y:130, w, h};
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

  function boardCellVfxKey(z, r, c){
    const zi = Number(z), ri = Number(r), ci = Number(c);
    if(!Number.isInteger(zi) || !Number.isInteger(ri) || !Number.isInteger(ci)) return '';
    return zi + ':' + ri + ':' + ci;
  }

  function hideBoardCellForVfx(z, r, c, duration){
    const key = boardCellVfxKey(z, r, c);
    if(!key) return;
    const ms = Math.max(120, Number(duration) || 460);
    vfxHiddenBoardCellUntilByKey.set(key, nowMs() + ms);
    setTimeout(function(){
      vfxHiddenBoardCellUntilByKey.delete(key);
      scheduleRender('board-commit');
    }, ms + 24);
  }

  function suppressInitialPlacementMotion(iid, duration){
    const key = String(iid == null ? '' : iid);
    if(!key) return;
    const ms = Math.max(120, Number(duration) || 560);
    suppressedInitialPlacementUntilByIid.set(key, nowMs() + ms);
    setTimeout(function(){
      suppressedInitialPlacementUntilByIid.delete(key);
    }, ms + 48);
  }

  function isInitialPlacementMotionSuppressed(iid){
    const key = String(iid == null ? '' : iid);
    if(!key) return false;
    const until = Number(suppressedInitialPlacementUntilByIid.get(key)) || 0;
    if(!until) return false;
    if(nowMs() > until){
      suppressedInitialPlacementUntilByIid.delete(key);
      return false;
    }
    return true;
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

  function isBoardCellHiddenForVfx(z, r, c){
    const key = boardCellVfxKey(z, r, c);
    if(!key) return false;
    const until = Number(vfxHiddenBoardCellUntilByKey.get(key)) || 0;
    if(!until) return false;
    if(nowMs() > until){
      vfxHiddenBoardCellUntilByKey.delete(key);
      return false;
    }
    return true;
  }

  function observeCardForMove(card, r, snapshotChanged, boardIidCounts){
    const timeline = getTimeline();
    const iid = getCardIid(card);
    if(!timeline || !iid || !r) return null;
    if(!canTrackBoardMotionIid(iid, boardIidCounts)){
      clearBoardMotionStateForIid(iid);
      return null;
    }
    const nextRect = cloneRect(r);
    const prevRect = lastCardRectByIid.get(iid);
    lastCardRectByIid.set(iid, nextRect);
    if(animationsOff()){
      pendingPlacementRectByIid.delete(iid);
      if(typeof timeline.clearForCardKind === 'function') timeline.clearForCardKind(iid, 'card-move');
      else if(typeof timeline.clearForCard === 'function') timeline.clearForCard(iid, 'card-move');
      return null;
    }
    if(!prevRect && isInitialPlacementMotionSuppressed(iid)){
      pendingPlacementRectByIid.delete(iid);
      return null;
    }
    const pendingPlacementRect = pendingPlacementRectByIid.get(iid);
    if(!prevRect && pendingPlacementRect){
      pendingPlacementRectByIid.delete(iid);
      return null;
    }
    if(!prevRect && lastReport && window.FateVfxEventBridge && typeof window.FateVfxEventBridge.onAcceptedGameEvent === 'function'){
      const fromRect = fallbackBoardEntrySourceRect(card, nextRect);
      if(fromRect){
        return null;
      }
    }
    if(!prevRect || sameRect(prevRect, nextRect)) return timeline.getForCard && timeline.getForCard(iid, 'card-move');
    if(!snapshotChanged) return timeline.getForCard && timeline.getForCard(iid, 'card-move');
    if(window.FateVfxEventBridge && typeof window.FateVfxEventBridge.onAcceptedGameEvent === 'function'){
      const vfxId = window.FateVfxEventBridge.onAcceptedGameEvent({
        type:'MOVE_CARD',
        payload:{
          iid,
          card,
          fromRect:prevRect,
          toRect:nextRect,
          targetRect:nextRect,
          duration:170,
          path:'direct',
          arc:0,
          lift:0,
          sideArc:0,
          rotate:0,
          bank:0,
          scale:1,
          textureScale:1,
          overshoot:0,
          settleMs:0,
          noShadow:true,
          fastBoardMove:true
        }
      });
      if(vfxId) hideBoardCardForVfx(iid, 190);
      return null;
    }
    if(typeof timeline.clearForCardKind === 'function') timeline.clearForCardKind(iid, 'card-move');
    else if(typeof timeline.clearForCard === 'function') timeline.clearForCard(iid, 'card-move');
    return timeline.add({
      kind:'card-move',
      iid,
      start:nowMs(),
      duration:170,
      easing:'out-cubic',
      fromRect:prevRect,
      toRect:nextRect,
      flight:false,
      profile:'board-fast'
    });
  }

  function isRenderFaceDownCard(card, visual){
    return !!((card && (card.faceDown || (card.flags && card.flags.faceDown))) || (visual && visual.isHidden));
  }

  function drawCardContent(ctx, entry, visual, r, onChange, options){
    const opts = options || {};
    if(isRenderFaceDownCard(entry && entry.card, visual)){
      drawCardBack(ctx, r, '', 'back.png');
      return;
    }
    const texture = getTexture(entry.card, visual, r, onChange, {readyOnly:!!opts.readyTextureOnly});
    if(texture && texture.loaded && !texture.failed && texture.canvas) {
      ctx.drawImage(texture.canvas, r.x, r.y, r.w, r.h);
    } else if(opts.readyTextureOnly) {
      drawFallbackCard(ctx, visual, r);
    } else {
      const fullArtSrc = fullArtSource(entry && entry.card, visual);
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
    if(!opts.hideFateBadge) drawFateBadge(ctx, visual, r, entry && entry.card);
    drawTributeCue(ctx, r, opts.tributeState || '');
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
    tint.addColorStop(0, 'rgba(255,52,66,.34)');
    tint.addColorStop(.52, 'rgba(255,52,66,.16)');
    tint.addColorStop(1, 'rgba(104,0,18,.36)');
    ctx.fillStyle = tint;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = 'rgba(255,104,124,.66)';
    ctx.lineWidth = 1.35;
    roundedPath(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, Math.max(4, r.w * .048));
    ctx.stroke();
    ctx.restore();
  }

  function cardHasPendingWhenSetVisual(card, hit){
    if(!card) return false;
    if(card._pendingWhenSetEffect || (card.flags && (card.flags.pendingWhenSet || card.flags.activationReady))) return true;
    if(hit && typeof window.canShowBoardActivateEffect === 'function') {
      try {
        const viewer = typeof getPerspectivePlayerIndex === 'function'
          ? getPerspectivePlayerIndex()
          : (G && Number.isInteger(G.viewerPlayerIndex) ? G.viewerPlayerIndex : G.currentPlayer);
        return !!window.canShowBoardActivateEffect(card, hit.z, hit.r, hit.c, viewer);
      } catch(e) {}
    }
    return false;
  }

  function liveBoardCardForHit(hit){
    if(!hit) return null;
    try {
      const g = (typeof G !== 'undefined' && G) ? G : null;
      if(g && g.board && Number.isFinite(hit.z) && Number.isFinite(hit.r) && Number.isFinite(hit.c)) {
        const live = g.board[hit.z] && g.board[hit.z][hit.r] ? g.board[hit.z][hit.r][hit.c] : null;
        if(live) return live;
      }
      const iid = hit.card && hit.card.iid != null ? String(hit.card.iid) : String(hit.iid || '');
      if(iid && typeof forEachBoardCard === 'function') {
        let found = null;
        forEachBoardCard(function(card){
          if(!found && card && String(card.iid || '') === iid) found = card;
        });
        return found;
      }
    } catch(e) {}
    return null;
  }

  function pendingWhenSetVisualCardForHit(hit){
    if(!hit) return null;
    const live = liveBoardCardForHit(hit);
    // If the card still exists on the live board, its current eligibility is
    // authoritative. Never revive a spent effect from an older render snapshot.
    if(live) return cardHasPendingWhenSetVisual(live, hit) ? live : null;
    if(cardHasPendingWhenSetVisual(hit.card, hit)) return hit.card;
    return null;
  }

  function drawPendingWhenSetGlow(ctx, r, card, startedAt){
    if(!card) return;
    const now = nowMs();
    const age = Math.max(0, now - (Number(startedAt) || now));
    const intro = Math.min(1, age / 650);
    const phasePulse = .5 + .5 * Math.sin(age / 720 - Math.PI / 2);
    const pulse = (.28 + phasePulse * .42) * intro;
    ctx.save();
    const rr = Math.max(4, r.w * .052);
    const outerInset = 2.5 + pulse * 1.4;
    roundedPath(ctx, r.x - outerInset, r.y - outerInset, r.w + outerInset * 2, r.h + outerInset * 2, rr + outerInset);
    ctx.shadowColor = 'rgba(174,93,255,' + (.26 + pulse * .14).toFixed(3) + ')';
    ctx.shadowBlur = 7 + pulse * 6;
    ctx.strokeStyle = 'rgba(196,126,255,' + (.50 + pulse * .16).toFixed(3) + ')';
    ctx.lineWidth = 1.2 + pulse * .55;
    ctx.stroke();
    ctx.shadowBlur = 0;
    roundedPath(ctx, r.x + .8, r.y + .8, r.w - 1.6, r.h - 1.6, Math.max(3, rr - .8));
    ctx.strokeStyle = 'rgba(242,222,255,' + (.22 + pulse * .18).toFixed(3) + ')';
    ctx.lineWidth = .8 + pulse * .32;
    ctx.stroke();
    ctx.restore();
    if(!pendingWhenSetPulseRaf) {
      pendingWhenSetPulseRaf = setTimeout(function(){
        pendingWhenSetPulseRaf = 0;
        scheduleRender('pending-when-set-pulse');
      }, 240);
    }
  }

  function shouldShowPendingWhenSetGlow(card, hit){
    if(!cardHasPendingWhenSetVisual(card, hit)) return false;
    const pending = card._pendingWhenSetEffect || {};
    const owner = Number.isInteger(card.owner) ? card.owner : Number(pending.owner);
    const viewer = typeof getPerspectivePlayerIndex === 'function'
      ? getPerspectivePlayerIndex()
      : (G && Number.isInteger(G.viewerPlayerIndex) ? G.viewerPlayerIndex : G.currentPlayer);
    return Number.isInteger(owner) ? owner === viewer : true;
  }

  function drawPendingWhenSetGlows(ctx){
    if(!ctx || !lastHitMap || !Array.isArray(lastHitMap.cards)) return;
    const seen = new Set();
    const activeKeys = new Set();
    const now = nowMs();
    lastHitMap.cards.forEach(function(hit){
      if(!hit || !hit.rect) return;
      const card = pendingWhenSetVisualCardForHit(hit);
      if(!shouldShowPendingWhenSetGlow(card, hit)) return;
      const iid = card && card.iid != null ? String(card.iid) : '';
      const key = iid ? 'iid:' + iid : 'cell:' + [hit.z, hit.r, hit.c].join(':');
      if(seen.has(key)) return;
      seen.add(key);
      activeKeys.add(key);
      if(!pendingWhenSetGlowStartedAtByKey.has(key)) pendingWhenSetGlowStartedAtByKey.set(key, now);
      drawPendingWhenSetGlow(ctx, hit.rect, card, pendingWhenSetGlowStartedAtByKey.get(key));
    });
    pendingWhenSetGlowStartedAtByKey.forEach(function(value, key){
      if(!activeKeys.has(key)) pendingWhenSetGlowStartedAtByKey.delete(key);
    });
  }

  function handEffectRows(card) {
    if(!card) return [];
    if(Array.isArray(card.handEffectModifiers)) return card.handEffectModifiers;
    if(typeof getHandCardEffectModifiers === 'function') {
      try { return getHandCardEffectModifiers(card); } catch(e) {}
    }
    return [];
  }

  function truncateCanvasText(ctx, text, maxW) {
    const raw = String(text || '');
    if(ctx.measureText(raw).width <= maxW) return raw;
    let out = raw;
    while(out.length > 3 && ctx.measureText(out + '...').width > maxW) out = out.slice(0, -1);
    return out.length > 3 ? out + '...' : raw.slice(0, 3);
  }

  function wrapCanvasText(ctx, text, maxW, maxLines) {
    const raw = String(text || '').trim();
    if(!raw) return [''];
    const words = raw.split(/\s+/);
    const lines = [];
    let line = '';
    function pushLine(value) {
      if(maxLines && lines.length >= maxLines) return false;
      lines.push(value);
      return true;
    }
    words.forEach(function(word){
      if(maxLines && lines.length >= maxLines) return;
      const next = line ? line + ' ' + word : word;
      if(ctx.measureText(next).width <= maxW) {
        line = next;
        return;
      }
      if(line) {
        if(!pushLine(line)) return;
        line = '';
      }
      if(ctx.measureText(word).width <= maxW) {
        line = word;
        return;
      }
      let chunk = '';
      for(let i = 0; i < word.length; i++) {
        const candidate = chunk + word[i];
        if(ctx.measureText(candidate).width > maxW && chunk) {
          if(!pushLine(chunk)) return;
          chunk = word[i];
        } else {
          chunk = candidate;
        }
      }
      line = chunk;
    });
    if(line && (!maxLines || lines.length < maxLines)) lines.push(line);
    return lines.length ? lines : [''];
  }

  function handEffectIconRect(cardRect) {
    const size = Math.max(17, Math.min(22, cardRect.w * .21));
    return {x:cardRect.x + cardRect.w - size - Math.max(4, cardRect.w * .055), y:cardRect.y + Math.max(4, cardRect.w * .055) + 2, w:size, h:size};
  }

  function drawHandEffectIcon(ctx, card, cardRect) {
    const rows = handEffectRows(card);
    if(!rows.length) return null;
    const r = handEffectIconRect(cardRect);
    ctx.save();
    ctx.beginPath();
    ctx.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8,10,16,.88)';
    ctx.fill();
    ctx.lineWidth = 1.15;
    ctx.strokeStyle = 'rgba(118,210,255,.78)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(218,244,255,.92)';
    ctx.font = '900 ' + Math.max(9, Math.round(r.h * .68)) + 'px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('i', r.x + r.w / 2, r.y + r.h / 2 + r.h * .03);
    ctx.restore();
    return r;
  }

  function drawHandEffectTooltip(ctx, hit) {
    const rows = hit && Array.isArray(hit.effects) ? hit.effects : handEffectRows(hit && hit.card);
    const anchor = hit && (hit.iconRect || hit.rect);
    if(!rows.length || !anchor) return;
    const cssW = Math.max(1, Number(window.innerWidth) || 1280);
    const cssH = Math.max(1, Number(window.innerHeight) || 720);
    const panelW = Math.min(320, Math.max(260, cssW - 24));
    const pad = 10;
    const textW = panelW - pad * 2;
    ctx.save();
    ctx.font = '600 11px Crimson Pro, serif';
    const preparedRows = rows.map(function(row){
      const textLines = wrapCanvasText(ctx, row.text || 'Card modified.', textW, 5);
      return {
        name:String(row.name || 'Effect'),
        textLines,
        h:22 + textLines.length * 13 + 4
      };
    });
    const panelH = pad * 2 + preparedRows.reduce(function(sum, row){ return sum + row.h; }, 0) + Math.max(0, preparedRows.length - 1) * 7;
    const cardAnchor = hit && hit.cardRect ? hit.cardRect : (hit && hit.kind === 'hand-card' ? hit.rect : anchor);
    const hoverLiftClearance = cardAnchor ? Math.max(30, cardAnchor.h * .38) : 0;
    let x = cardAnchor.x + cardAnchor.w / 2 - panelW / 2;
    let y = cardAnchor.y - hoverLiftClearance - panelH + 53;
    x = Math.max(10, Math.min(x, cssW - panelW - 10));
    y = Math.max(10, y);
    if(y + panelH > cssH - 10) y = Math.max(10, cssH - panelH - 10);
    roundedPath(ctx, x, y, panelW, panelH, 7);
    ctx.fillStyle = 'rgba(5,7,12,.95)';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(118,210,255,.42)';
    ctx.stroke();
    let cursorY = y + pad;
    preparedRows.forEach(function(row, idx){
      const ry = cursorY;
      if(idx > 0) {
        ctx.strokeStyle = 'rgba(255,246,191,.08)';
        ctx.beginPath();
        ctx.moveTo(x + pad, ry - 4);
        ctx.lineTo(x + panelW - pad, ry - 4);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(218,244,255,.96)';
      ctx.font = '800 11px Cinzel, serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(truncateCanvasText(ctx, row.name || 'Effect', panelW - pad * 2), x + pad, ry);
      ctx.fillStyle = 'rgba(231,226,205,.86)';
      ctx.font = '600 11px Crimson Pro, serif';
      row.textLines.forEach(function(line, lineIdx){
        ctx.fillText(line, x + pad, ry + 18 + lineIdx * 13);
      });
      cursorY += row.h + 7;
    });
    ctx.restore();
  }

  function getCardVisualStatusState(entry, statuses){
    if(typeof window !== 'undefined' && typeof window.getCardStatusVisualState === 'function') {
      try { return window.getCardStatusVisualState(entry && entry.card, statuses); } catch(e) {}
    }
    if(statuses && statuses.effectFlash) return {primary:'effect_flash', immune:false, flashKind:statuses.effectFlash.kind || ''};
    const order = ['snowball','negated','suppressed','blocked','marked','immune'];
    for(let i = 0; i < order.length; i++){
      if(statuses && statuses[order[i]]) return {primary:order[i], immune:order[i] === 'immune'};
    }
    return {primary:'', immune:false};
  }

  function drawCardVisual(ctx, entry, visual, r, onChange, options){
    const opts = options || {};
    const showStatus = opts.showStatus !== false;
    const tilt = Number.isFinite(opts.tilt) ? opts.tilt : stableCardTilt(entry);
    const lift = Number(opts.lift) || 0;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    if(!opts.noShadow) drawCardContactShadow(ctx, r, opts);
    ctx.save();
    ctx.translate(cx, cy - lift * 4);
    ctx.rotate(tilt);
    ctx.scale(1 + lift * .012, 1 - Math.abs(tilt) * .22 + lift * .008);
    ctx.translate(-cx, -cy);
    const flags = entry && entry.card && entry.card.flags ? entry.card.flags : {};
    const markedForDeath = !!(showStatus && entry && entry.card && (entry.card._markedForDeath || flags.markedForDeath));
    const suppressed = !!(showStatus && entry && entry.card && flags.suppressed);
    const negated = !!(showStatus && entry && entry.card && flags.negated);
    const snowballHit = !!(showStatus && entry && entry.card && flags.snowballHit);
    const effectFlashKind = showStatus && entry && entry.card && flags.effectFlashKind ? String(flags.effectFlashKind) : '';
    const immune = !!(showStatus && entry && entry.card && (flags.immune || (typeof window !== 'undefined' && typeof window.shouldShowProtectionStatusIcon === 'function' && window.shouldShowProtectionStatusIcon(entry.card))));
    const zoeBlocked = !!(showStatus && entry && entry.card && (flags.zoeBlocked || cellHasBlock(entry.z, entry.r, entry.c, 'zoe')));
    const statusState = getCardVisualStatusState(entry, {
      negated,
      suppressed,
      snowball:snowballHit,
      marked:markedForDeath,
      blocked:zoeBlocked,
      immune,
      effectFlash:effectFlashKind ? {kind:effectFlashKind, at:Number(flags.effectFlashAt) || 0} : null
    });
    const primaryStatus = statusState.primary || '';
    if(markedForDeath && typeof ctx.filter === 'string') ctx.filter = 'saturate(.68) brightness(.84) contrast(.97) sepia(.16) hue-rotate(325deg)';
    if(isRenderFaceDownCard(entry && entry.card, visual)){
      drawCardBack(ctx, r, '', 'back.png');
      drawCardPlaneGleam(ctx, r, tilt);
      ctx.restore();
      return;
    }
    const contentOpts = opts.hideFateBadge ? opts : Object.assign({}, opts, {hideFateBadge:true});
    drawCardContent(ctx, entry, visual, r, onChange, contentOpts);
    if(opts.opponent) drawOpponentTint(ctx, r);
    drawCardPlaneGleam(ctx, r, tilt);
    if(primaryStatus === 'negated') drawNegatedCardOverlay(ctx, r);
    else if(primaryStatus === 'suppressed') drawSuppressedCardOverlay(ctx, r);
    else if(primaryStatus === 'snowball') drawSnowballFightCardOverlay(ctx, r);
    else if(primaryStatus === 'effect_flash') drawEffectFlashCardOverlay(ctx, r, statusState.flashKind || effectFlashKind);
    else if(primaryStatus === 'marked') drawMarkedForDeathCardOverlay(ctx, r);
    else if(primaryStatus === 'blocked') drawBlockedActionCardOverlay(ctx, r);
    else if(primaryStatus === 'immune') drawImmuneCardOverlay(ctx, r);
    if(!opts.hideFateBadge) drawFateBadge(ctx, visual, r, entry && entry.card);
    ctx.restore();
  }

  function drawSuppressedCardOverlay(ctx, r){
    if(!ctx || !r) return;
    const radius = Math.max(3, Math.min(8, r.w * .08));
    ctx.save();
    roundedPath(ctx, r.x, r.y, r.w, r.h, radius);
    ctx.clip();
    // Codex 2026-07-14 reversible status-overlay v5: suppression uses a bare lock glyph.
    ctx.fillStyle = 'rgba(32,14,48,.18)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    drawStatusBadge(ctx, r, 'suppressed');
    ctx.restore();
  }

  function drawNegatedCardOverlay(ctx, r){
    if(!ctx || !r) return;
    const radius = Math.max(3, Math.min(8, r.w * .08));
    ctx.save();
    roundedPath(ctx, r.x, r.y, r.w, r.h, radius);
    ctx.clip();
    // Codex 2026-07-14 reversible status-overlay v5: negation uses a bare broken-link glyph.
    ctx.fillStyle = 'rgba(178,84,24,.14)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    drawStatusBadge(ctx, r, 'negated');
    ctx.restore();
  }

  function drawSnowballFightCardOverlay(ctx, r){
    if(!ctx || !r) return;
    const radius = Math.max(3, Math.min(8, r.w * .08));
    ctx.save();
    roundedPath(ctx, r.x, r.y, r.w, r.h, radius);
    ctx.clip();
    ctx.fillStyle = 'rgba(68,153,198,.15)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    drawStatusBadge(ctx, r, 'snowball');
    ctx.restore();
  }

  const CARD_EFFECT_FLASH_PALETTE = Object.freeze({
    specter_ghost:{color:'rgba(224,239,255,.98)',glow:'rgba(140,184,255,.58)',tint:'rgba(104,126,174,.16)'},
    kvetka_ballad:{color:'rgba(255,202,238,.98)',glow:'rgba(244,94,184,.60)',tint:'rgba(142,42,104,.16)'},
    marie_deterrence:{color:'rgba(255,225,211,.98)',glow:'rgba(225,105,78,.52)',tint:'rgba(170,78,64,.14)'},
    movement_boot:{color:'rgba(255,224,166,.98)',glow:'rgba(255,158,61,.60)',tint:'rgba(172,91,24,.15)'},
    rozsi_dance:{color:'rgba(255,208,242,.98)',glow:'rgba(246,108,203,.60)',tint:'rgba(142,51,119,.15)'},
    british_union_jack:{color:'rgba(232,246,255,.98)',glow:'rgba(126,183,255,.62)',tint:'rgba(48,91,168,.16)'},
    oathbound_crescent:{color:'rgba(255,185,177,.98)',glow:'rgba(240,93,82,.60)',tint:'rgba(146,36,40,.17)'},
    isaac_beaker:{color:'rgba(220,252,255,.98)',glow:'rgba(106,222,244,.58)',tint:'rgba(34,128,148,.15)'},
    coord_anne_trio:{color:'rgba(255,233,168,.98)',glow:'rgba(240,190,82,.58)',tint:'rgba(164,116,30,.15)'},
    coord_kvetka_bloom:{color:'rgba(226,255,224,.98)',glow:'rgba(118,232,126,.56)',tint:'rgba(44,134,63,.15)'},
    coord_cathy_cardigan:{color:'rgba(199,255,231,.98)',glow:'rgba(100,214,176,.58)',tint:'rgba(42,130,105,.15)'},
    coord_felicyta_eagle:{color:'rgba(255,239,224,.98)',glow:'rgba(240,123,91,.56)',tint:'rgba(163,67,38,.15)'},
    coord_zsofia_river:{color:'rgba(224,249,255,.98)',glow:'rgba(106,205,238,.56)',tint:'rgba(38,121,159,.15)'},
    coord_jeremiah_snowseal:{color:'rgba(235,247,255,.98)',glow:'rgba(164,214,255,.56)',tint:'rgba(72,119,157,.14)'},
    coord_heyward_compass:{color:'rgba(232,238,255,.98)',glow:'rgba(156,170,255,.56)',tint:'rgba(65,69,152,.16)'},
    coord_postmodern_dylan:{color:'rgba(242,226,255,.98)',glow:'rgba(182,126,255,.56)',tint:'rgba(94,50,154,.16)'},
    rivera_crest:{color:'rgba(204,255,216,.98)',glow:'rgba(99,219,132,.60)',tint:'rgba(40,126,65,.15)'},
    phil_crown:{color:'rgba(255,224,138,.98)',glow:'rgba(255,199,79,.62)',tint:'rgba(154,105,18,.15)'},
    wintertide:{color:'rgba(224,249,255,.98)',glow:'rgba(110,214,246,.58)',tint:'rgba(92,174,210,.14)'},
    maria_target:{color:'rgba(255,226,220,.98)',glow:'rgba(235,92,72,.56)',tint:'rgba(164,48,48,.16)'}
  });
  const DEFAULT_EFFECT_FLASH_PALETTE = Object.freeze({
    color:'rgba(255,246,210,.98)',
    glow:'rgba(235,194,92,.52)',
    tint:'rgba(210,174,82,.13)'
  });

  function getEffectFlashPalette(kind){
    return CARD_EFFECT_FLASH_PALETTE[kind] || DEFAULT_EFFECT_FLASH_PALETTE;
  }

  function drawEffectFlashCardOverlay(ctx, r, kind){
    if(!ctx || !r) return;
    const radius = Math.max(3, Math.min(8, r.w * .08));
    const palette = getEffectFlashPalette(kind);
    ctx.save();
    if(kind === 'kvetka_ballad') ctx.globalAlpha = .84 + Math.sin(Date.now() / 650 * Math.PI * 2) * .12;
    roundedPath(ctx, r.x, r.y, r.w, r.h, radius);
    ctx.clip();
    ctx.fillStyle = palette.tint;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    drawEffectFlashIcon(ctx, r.x + r.w / 2, r.y + r.h / 2, Math.max(60, Math.min(104, r.w * .88)), kind);
    ctx.restore();
  }

  function drawMarkedForDeathCardOverlay(ctx, r){
    if(!ctx || !r) return;
    const radius = Math.max(3, Math.min(8, r.w * .08));
    ctx.save();
    roundedPath(ctx, r.x, r.y, r.w, r.h, radius);
    ctx.clip();
    ctx.fillStyle = 'rgba(118,44,54,.16)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    drawStatusBadge(ctx, r, 'marked');
    ctx.restore();
  }

  function drawBlockedActionCardOverlay(ctx, r){
    if(!ctx || !r) return;
    const radius = Math.max(3, Math.min(8, r.w * .08));
    ctx.save();
    roundedPath(ctx, r.x, r.y, r.w, r.h, radius);
    ctx.clip();
    ctx.fillStyle = 'rgba(70,42,120,.16)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    drawStatusBadge(ctx, r, 'blocked');
    ctx.restore();
  }

  function drawImmuneCardOverlay(ctx, r){
    if(!ctx || !r) return;
    const radius = Math.max(3, Math.min(8, r.w * .08));
    ctx.save();
    roundedPath(ctx, r.x, r.y, r.w, r.h, radius);
    ctx.clip();
    ctx.fillStyle = 'rgba(32,95,124,.12)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    drawStatusBadge(ctx, r, 'immune');
    ctx.restore();
  }

  function drawStatusBadge(ctx, r, kind){
    const suppressed = kind === 'suppressed';
    const size = Math.max(60, Math.min(104, r.w * .88));
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    ctx.save();
    ctx.shadowColor = suppressed ? 'rgba(154,108,218,.42)'
      : kind === 'negated' ? 'rgba(235,135,45,.40)'
      : kind === 'snowball' ? 'rgba(138,224,255,.48)'
      : kind === 'marked' ? 'rgba(190,92,112,.34)'
      : kind === 'blocked' ? 'rgba(154,108,218,.38)'
      : 'rgba(108,208,226,.34)';
    ctx.shadowBlur = Math.max(6, size * .18);
    if(suppressed) drawSuppressionLockIcon(ctx, cx, cy, size);
    else if(kind === 'snowball') drawSnowballFightIcon(ctx, cx, cy, size);
    else if(kind === 'marked') drawMarkedForDeathIcon(ctx, cx, cy, size);
    else if(kind === 'blocked') drawBlockedActionIcon(ctx, cx, cy, size);
    else if(kind === 'immune') drawImmuneShieldIcon(ctx, cx, cy, size);
    else drawNegationBrokenLinkIcon(ctx, cx, cy, size);
    ctx.restore();
  }

  function drawSnowballFightIcon(ctx, cx, cy, size){
    const radius = size * .34;
    const branchStart = radius * .54;
    const branchLength = radius * .24;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(222,248,255,.98)';
    ctx.lineWidth = Math.max(2.4, size * .064);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for(let arm = 0; arm < 6; arm++){
      const angle = arm * Math.PI / 3 - Math.PI / 2;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      ctx.beginPath();
      ctx.moveTo(-dx * radius, -dy * radius);
      ctx.lineTo(dx * radius, dy * radius);
      ctx.stroke();
      const bx = dx * branchStart;
      const by = dy * branchStart;
      const left = angle + Math.PI * .76;
      const right = angle - Math.PI * .76;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(left) * branchLength, by + Math.sin(left) * branchLength);
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(right) * branchLength, by + Math.sin(right) * branchLength);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(222,248,255,.98)';
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(2.2, size * .048), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEffectFlashIcon(ctx, cx, cy, size, kind){
    const s = size / 64;
    const palette = getEffectFlashPalette(kind);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.translate(-32, -32);
    ctx.strokeStyle = palette.color;
    ctx.fillStyle = palette.color;
    ctx.lineWidth = 4.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = palette.glow;
    ctx.shadowBlur = 9;
    const line = function(points, close){
      if(!points || !points.length) return;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for(let i=1;i<points.length;i++) ctx.lineTo(points[i][0], points[i][1]);
      if(close) ctx.closePath();
      ctx.stroke();
    };
    const circle = function(x,y,r){ ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke(); };
    const dot = function(x,y,r){ ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); };

    if(kind === 'specter_ghost') {
      ctx.beginPath();
      ctx.moveTo(17,49); ctx.lineTo(17,29); ctx.bezierCurveTo(17,15,25,9,32,9); ctx.bezierCurveTo(41,9,48,17,48,29);
      ctx.lineTo(48,50); ctx.lineTo(41,44); ctx.lineTo(35,51); ctx.lineTo(29,44); ctx.lineTo(23,51); ctx.closePath(); ctx.stroke();
      circle(27,28,2); circle(38,28,2); line([[26,37],[32,34],[39,37]],false);
    } else if(kind === 'kvetka_ballad') {
      line([[38,11],[38,43]],false); line([[38,12],[52,16],[52,27],[38,23]],true);
      ctx.beginPath(); ctx.ellipse(25,46,11,7,-.15,0,Math.PI*2); ctx.stroke();
    } else if(kind === 'marie_deterrence') {
      line([[14,15],[50,15],[50,30],[47,40],[40,49],[32,55],[24,49],[17,40],[14,30]],true);
      line([[21,34],[43,34]],false); line([[25,26],[39,26]],false); line([[32,18],[32,47]],false);
    } else if(kind === 'movement_boot' || kind === 'rozsi_dance') {
      ctx.lineWidth = 4.2;
      ctx.beginPath();
      ctx.moveTo(25,15); ctx.lineTo(43,15); ctx.bezierCurveTo(40,25,40,33,43,41);
      ctx.lineTo(57,45); ctx.bezierCurveTo(61,46,63,49,63,53); ctx.lineTo(63,58); ctx.lineTo(12,58);
      ctx.lineTo(12,50); ctx.lineTo(24,50); ctx.lineTo(24,38); ctx.bezierCurveTo(24,31,24,24,25,15);
      ctx.stroke();
      line([[28,25],[39,25]],false); line([[14,58],[62,58]],false);
      ctx.lineWidth = 2.75;
      line([[17,50],[26,50],[26,58]],false); line([[8,24],[1,24]],false); line([[11,32],[1,32]],false); line([[13,40],[4,40]],false);
      ctx.lineWidth = 4.4;
    } else if(kind === 'british_union_jack') {
      ctx.lineWidth = 3.15;
      ctx.beginPath();
      ctx.moveTo(13,14);
      ctx.lineTo(51,14);
      ctx.lineTo(51,38);
      ctx.bezierCurveTo(47,48,40,55,32,59);
      ctx.bezierCurveTo(24,55,17,48,13,38);
      ctx.closePath();
      ctx.stroke();
      ctx.lineWidth = 4.2;
      line([[15,33],[32,19],[49,33]],false);
      line([[16,44],[32,31],[48,44]],false);
      ctx.lineWidth = 2.25;
      line([[24,52],[40,52]],false);
    } else if(kind === 'oathbound_crescent') {
      ctx.lineWidth = 4.2;
      ctx.beginPath(); ctx.moveTo(32,0); ctx.lineTo(39,10); ctx.lineTo(36,41); ctx.lineTo(28,41); ctx.lineTo(25,10); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(17,47); ctx.bezierCurveTo(25,55,39,55,47,47); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(17,47); ctx.bezierCurveTo(22,40,42,40,47,47); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(27,52); ctx.lineTo(37,52); ctx.lineTo(37,67); ctx.lineTo(27,67); ctx.closePath(); ctx.stroke();
      ctx.lineWidth = 4.4;
    } else if(kind === 'isaac_beaker') {
      ctx.lineWidth = 4.2;
      line([[24,9],[40,9]],false);
      ctx.beginPath(); ctx.moveTo(27,9); ctx.lineTo(27,26); ctx.lineTo(15,49); ctx.bezierCurveTo(13,53,16,56,21,56);
      ctx.lineTo(43,56); ctx.bezierCurveTo(48,56,51,53,49,49); ctx.lineTo(37,26); ctx.lineTo(37,9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(19,43); ctx.bezierCurveTo(27,40,36,46,45,43); ctx.stroke();
      dot(28,47,2); dot(39,38,2);
    } else if(kind === 'coord_anne_trio') {
      ctx.lineWidth = 4.2;
      circle(32,13,6); circle(13,47,6); circle(51,47,6);
      line([[29,19],[16,41]],false); line([[35,19],[48,41]],false); line([[19,47],[45,47]],false);
    } else if(kind === 'coord_kvetka_bloom') {
      ctx.lineWidth = 4.2;
      circle(32,32,6);
      ctx.beginPath(); ctx.moveTo(32,26); ctx.bezierCurveTo(27,16,30,9,32,7); ctx.bezierCurveTo(37,12,39,19,32,26); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(38,32); ctx.bezierCurveTo(48,27,55,30,57,32); ctx.bezierCurveTo(52,37,45,39,38,32); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(32,38); ctx.bezierCurveTo(37,48,34,55,32,57); ctx.bezierCurveTo(27,52,25,45,32,38); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(26,32); ctx.bezierCurveTo(16,37,9,34,7,32); ctx.bezierCurveTo(12,27,19,25,26,32); ctx.stroke();
    } else if(kind === 'coord_cathy_cardigan') {
      ctx.lineWidth = 4.2;
      line([[23,10],[32,18],[41,10],[53,18],[47,30],[47,56],[17,56],[17,30],[11,18],[23,10],[21,24],[32,18],[43,24],[41,10]],false);
      line([[32,18],[32,56]],false); dot(36,31,1.8); dot(36,40,1.8); dot(36,49,1.8);
    } else if(kind === 'coord_felicyta_eagle') {
      ctx.lineWidth = 4.2;
      ctx.beginPath(); ctx.moveTo(10,29); ctx.bezierCurveTo(20,28,26,32,32,41); ctx.bezierCurveTo(38,32,44,28,54,29);
      ctx.bezierCurveTo(50,39,43,46,32,52); ctx.bezierCurveTo(21,46,14,39,10,29); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(18,25); ctx.bezierCurveTo(23,18,28,15,32,11); ctx.bezierCurveTo(36,15,41,18,46,25); ctx.stroke();
      line([[18,25],[18,29]],false); line([[46,25],[46,29]],false); line([[29,28],[32,25],[35,28]],false);
    } else if(kind === 'coord_zsofia_river') {
      ctx.lineWidth = 4.2;
      circle(32,32,24);
      [[20],[32],[44]].forEach(function(yArr){
        const y = yArr[0];
        ctx.beginPath(); ctx.moveTo(11,y); ctx.bezierCurveTo(18,y-6,25,y+6,32,y); ctx.bezierCurveTo(39,y-6,46,y+6,53,y); ctx.stroke();
      });
    } else if(kind === 'coord_jeremiah_snowseal') {
      ctx.lineWidth = 4.2;
      circle(32,32,24);
      line([[13,47],[32,13],[51,47]],false);
      ctx.beginPath(); ctx.moveTo(17.5,39); ctx.bezierCurveTo(21,35,24,44,28,39); ctx.bezierCurveTo(31,34,34,45,38,39); ctx.bezierCurveTo(41,35,44,42,46.5,39); ctx.stroke();
    } else if(kind === 'coord_heyward_compass') {
      ctx.lineWidth = 4.2;
      circle(32,32,23);
      line([[32,15],[38,26],[49,32],[38,38],[32,49],[26,38],[15,32],[26,26],[32,15]],true);
      circle(32,32,5);
    } else if(kind === 'coord_postmodern_dylan') {
      ctx.lineWidth = 4.2;
      line([[32,9],[54,32],[32,55],[10,32],[32,9]],true);
      line([[32,19],[44,32],[32,45],[20,32],[32,19]],true);
      line([[10,32],[20,32]],false); line([[44,32],[54,32]],false);
    } else if(kind === 'phil_crown') {
      line([[12,21],[22,40],[32,18],[42,40],[52,21],[48,49],[16,49]],true);
      line([[17,43],[47,43]],false); circle(12,19,2); circle(32,16,2); circle(52,19,2);
    } else if(kind === 'wintertide') {
      ctx.lineWidth = 3.4;
      for(let arm=0;arm<6;arm++){
        ctx.save();
        ctx.translate(32,32);
        ctx.rotate(arm*Math.PI/3);
        line([[0,0],[0,-27]],false);
        line([[0,-21],[-4,-16]],false);
        line([[0,-21],[4,-16]],false);
        line([[0,-12],[-3.5,-8]],false);
        line([[0,-12],[3.5,-8]],false);
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(32,32,3.2,0,Math.PI*2); ctx.fill();
    } else if(kind === 'maria_target') {
      circle(32,32,16); circle(32,32,6);
      line([[32,8],[32,19]],false); line([[32,45],[32,56]],false); line([[8,32],[19,32]],false); line([[45,32],[56,32]],false);
    } else if(kind === 'rivera_crest') {
      circle(32,32,20); line([[32,14],[32,50]],false); line([[14,32],[50,32]],false);
      line([[21,21],[43,43]],false); line([[43,21],[21,43]],false);
    } else {
      // Fallback effect crest.
      line([[32,10],[48,17],[46,38],[32,54],[18,38],[16,17]],true);
      line([[19,24],[28,20],[32,28],[36,20],[45,24]],false); line([[32,28],[32,43]],false);
      line([[24,37],[32,43],[40,37]],false);
    }
    ctx.restore();
  }

  function drawSuppressionLockIcon(ctx, cx, cy, size){
    const bodyW = size * .44;
    const bodyH = size * .31;
    const bodyX = cx - bodyW / 2;
    const bodyY = cy - size * .05;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(242,226,255,.98)';
    ctx.lineWidth = Math.max(2.3, size * .075);
    ctx.beginPath();
    ctx.moveTo(cx - size * .156, bodyY);
    ctx.lineTo(cx - size * .156, cy - size * .14);
    ctx.quadraticCurveTo(cx - size * .156, cy - size * .30, cx, cy - size * .30);
    ctx.quadraticCurveTo(cx + size * .156, cy - size * .30, cx + size * .156, cy - size * .14);
    ctx.lineTo(cx + size * .156, bodyY);
    ctx.stroke();
    roundedPath(ctx, bodyX, bodyY, bodyW, bodyH, Math.max(4, size * .08));
    ctx.stroke();
    ctx.lineWidth = Math.max(2, size * .065);
    ctx.beginPath();
    ctx.moveTo(cx - size * .078, bodyY + bodyH * .50);
    ctx.lineTo(cx + size * .078, bodyY + bodyH * .50);
    ctx.stroke();
    ctx.restore();
  }

  function drawNegationBrokenLinkIcon(ctx, cx, cy, size){
    function px(v){ return cx + (v - 32) / 64 * size; }
    function py(v){ return cy + (v - 32) / 64 * size; }
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,202,124,.98)';
    ctx.lineWidth = Math.max(2.5, size * .0875);
    ctx.beginPath();
    ctx.moveTo(px(21), py(34));
    ctx.bezierCurveTo(px(16), py(29), px(16), py(21), px(21), py(16));
    ctx.bezierCurveTo(px(26), py(11), px(34), py(11), px(39), py(16));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px(43), py(30));
    ctx.bezierCurveTo(px(48), py(35), px(48), py(43), px(43), py(48));
    ctx.bezierCurveTo(px(38), py(53), px(30), py(53), px(25), py(48));
    ctx.stroke();
    ctx.lineWidth = Math.max(2.8, size * .09);
    ctx.beginPath();
    ctx.moveTo(px(20), py(48));
    ctx.lineTo(px(48), py(20));
    ctx.stroke();
    ctx.restore();
  }

  function drawImmuneShieldIcon(ctx, cx, cy, size){
    function px(v){ return cx + (v - 32) / 64 * size; }
    function py(v){ return cy + (v - 32) / 64 * size; }
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(214,246,255,.96)';
    ctx.lineWidth = Math.max(2.5, size * .082);
    ctx.beginPath();
    ctx.moveTo(px(32), py(9));
    ctx.lineTo(px(49), py(17));
    ctx.lineTo(px(49), py(31));
    ctx.bezierCurveTo(px(49), py(43), px(42), py(51), px(32), py(56));
    ctx.bezierCurveTo(px(22), py(51), px(15), py(43), px(15), py(31));
    ctx.lineTo(px(15), py(17));
    ctx.closePath();
    ctx.stroke();
    ctx.lineWidth = Math.max(2.1, size * .07);
    ctx.beginPath();
    ctx.moveTo(px(24), py(33));
    ctx.lineTo(px(30), py(39));
    ctx.lineTo(px(42), py(26));
    ctx.stroke();
    ctx.restore();
  }

  function drawMarkedForDeathIcon(ctx, cx, cy, size){
    function px(v){ return cx + (v - 32) / 64 * size; }
    function py(v){ return cy + (v - 32) / 64 * size; }
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(224,220,216,.96)';
    ctx.lineWidth = Math.max(2.4, size * .078);
    ctx.beginPath();
    ctx.moveTo(px(22), py(47));
    ctx.lineTo(px(22), py(39));
    ctx.bezierCurveTo(px(15), py(35), px(14), py(24), px(21), py(17));
    ctx.bezierCurveTo(px(27), py(10), px(37), py(10), px(43), py(17));
    ctx.bezierCurveTo(px(50), py(24), px(49), py(35), px(42), py(39));
    ctx.lineTo(px(42), py(47));
    ctx.lineTo(px(22), py(47));
    ctx.stroke();
    ctx.fillStyle = 'rgba(224,220,216,.96)';
    ctx.beginPath();
    ctx.arc(px(26), py(30), Math.max(2, size * .055), 0, Math.PI * 2);
    ctx.arc(px(38), py(30), Math.max(2, size * .055), 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(2, size * .064);
    ctx.beginPath();
    ctx.moveTo(px(32), py(35));
    ctx.lineTo(px(29), py(40));
    ctx.lineTo(px(35), py(40));
    ctx.lineTo(px(32), py(35));
    ctx.moveTo(px(27), py(47));
    ctx.lineTo(px(27), py(52));
    ctx.moveTo(px(32), py(47));
    ctx.lineTo(px(32), py(53));
    ctx.moveTo(px(37), py(47));
    ctx.lineTo(px(37), py(52));
    ctx.stroke();
    ctx.restore();
  }

  function drawBlockedActionIcon(ctx, cx, cy, size){
    function px(v){ return cx + (v - 32) / 64 * size; }
    function py(v){ return cy + (v - 32) / 64 * size; }
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(238,222,255,.96)';
    ctx.lineWidth = Math.max(2.4, size * .06);
    ctx.beginPath();
    ctx.arc(cx, cy, size * .33, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = Math.max(3.2, size * .105);
    ctx.beginPath();
    ctx.moveTo(px(24), py(24));
    ctx.lineTo(px(40), py(40));
    ctx.moveTo(px(40), py(24));
    ctx.lineTo(px(24), py(40));
    ctx.stroke();
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

    const badgeW = Math.min(136, Math.max(108, zoneRect.w * .28));
    const badgeX = headerRect.x + headerRect.w / 2 - badgeW / 2;
    const badgeH = 24;
    const badgeY = Math.max(2, headerRect.y - 11);
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
    const scoreW = Math.min(302, Math.max(226, zoneRect.w * .62));
    const scoreX = headerRect.x + headerRect.w / 2 - scoreW / 2;
    const scoreY = headerRect.y + 27;
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
    return;
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

  function drawPileDeckBack(ctx, r){
    const rec = getAssetImage('deck.png', function(){ scheduleTextureRender('asset-ready'); });
    if(rec && rec.loaded && !rec.failed && rec.img) {
      roundedPath(ctx, r.x, r.y, r.w, r.h, Math.max(4, r.w * .06));
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#07101d';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      drawImageContain(ctx, rec.img, r.x + 1, r.y + 1, Math.max(1, r.w - 2), Math.max(1, r.h - 2));
      ctx.restore();
      return;
    }
    drawCardBack(ctx, r, 'Deck', 'deck.png');
  }

  function drawPileDiscardCard(ctx, card, r){
    if(!card) return false;
    const visual = card.visual || card;
    const src = fullArtSource(card, visual);
    const rec = getAssetImage(src, function(){ scheduleTextureRender('pile-texture-ready'); });
    if(rec && rec.loaded && !rec.failed && rec.img) {
      roundedPath(ctx, r.x, r.y, r.w, r.h, Math.max(4, r.w * .06));
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#05070d';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      drawImageContain(ctx, rec.img, r.x + 1, r.y + 1, Math.max(1, r.w - 2), Math.max(1, r.h - 2));
      ctx.restore();
      return true;
    }
    return false;
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
    roundedPath(ctx, r.x + 2, stripY, Math.max(1, r.w - 4), stripH, 4);
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
    ctx.strokeStyle = 'rgba(224,188,84,.42)';
    ctx.lineWidth = 1;
    ctx.stroke();
    const cardR = {x:r.x + 1, y:r.y + 1, w:Math.max(1, r.w - 2), h:Math.max(1, r.h - 2)};
    if(isDeck) {
      drawPileDeckBack(ctx, cardR);
    } else if(!top) {
      drawEmptyPileSlot(ctx, cardR);
    } else if(drawPileDiscardCard(ctx, top, cardR)) {
      // The pile preview uses the source image directly for readability.
    } else {
      drawCardContent(ctx, {card:top}, top.visual || top, cardR, function(){ scheduleTextureRender('pile-texture-ready'); }, {pulse:false, tilt:0, hideFateBadge:true});
    }
    drawPileLabelStrip(ctx, pile, r);
    ctx.restore();
  }

  function isPileViewportHovered(pile){
    return !!(pile
      && viewportHoverHit
      && viewportHoverHit.kind === 'pile'
      && Number(viewportHoverHit.playerIndex) === Number(pile.playerIndex)
      && viewportHoverHit.pile === pile.pile);
  }

  function drawPileHoverBorder(ctx, pile, rectOverride){
    const r = rectOverride || (pile && pile.rect);
    if(!r || (pile && !isPileViewportHovered(pile))) return;
    ctx.save();
    roundedPath(ctx, r.x + 1.5, r.y + 1.5, Math.max(1, r.w - 3), Math.max(1, r.h - 3), 8);
    ctx.shadowColor = 'rgba(255,216,92,.54)';
    ctx.shadowBlur = 9;
    ctx.strokeStyle = 'rgba(255,226,100,.86)';
    ctx.lineWidth = 1.9;
    ctx.stroke();
    ctx.shadowBlur = 0;
    roundedPath(ctx, r.x + 5, r.y + 5, Math.max(1, r.w - 10), Math.max(1, r.h - 10), 6);
    ctx.strokeStyle = 'rgba(255,241,151,.36)';
    ctx.lineWidth = .85;
    ctx.stroke();
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

  function isTutorialHandCardDisabled(item, snapshot){
    const card = item && item.card;
    if(!card || typeof tutorialCanPlayHandCardNow !== 'function') return false;
    const interaction = snapshot && snapshot.interaction ? snapshot.interaction : {};
    if(interaction.currentPlayer !== snapshot.viewer) return false;
    return !tutorialCanPlayHandCardNow(card);
  }

  function handHoverEase(){
    return viewportHoverHit && (viewportHoverHit.kind === 'hand-card' || viewportHoverHit.kind === 'hand-effect-icon') ? 1 : 0;
  }

  function isViewportHoveredHandItem(item){
    if(!item || !viewportHoverHit || (viewportHoverHit.kind !== 'hand-card' && viewportHoverHit.kind !== 'hand-effect-icon')) return false;
    const hitIid = viewportHoverHit.iid != null ? String(viewportHoverHit.iid) : '';
    const itemIid = item.iid != null ? String(item.iid) : String(item.card && item.card.iid || '');
    if(hitIid && itemIid && hitIid === itemIid) return true;
    return Number(item.index) === Number(viewportHoverHit.index);
  }

  function hoverHandRect(item){
    if(!item || !item.rect) return null;
    const base = item.rect;
    const eased = handHoverEase();
    const scale = 1 + .025 * eased;
    const lift = 10 * eased;
    const r = {
      x:base.x + base.w / 2 - (base.w * scale) / 2,
      y:base.y - lift,
      w:base.w * scale,
      h:base.h * scale
    };
    const cssW = Math.max(1, Number(window.innerWidth) || 1280);
    const cssH = Math.max(1, Number(window.innerHeight) || 720);
    r.x = Math.max(8, Math.min(r.x, cssW - r.w - 8));
    r.y = Math.max(8, Math.min(r.y, cssH - r.h - 8));
    return r;
  }

  function drawDisabledCardOverlay(ctx, r, label){
    const radius = Math.max(5, r.w * .055);
    ctx.save();
    roundedPath(ctx, r.x, r.y, r.w, r.h, radius);
    ctx.clip();
    ctx.fillStyle = 'rgba(120,124,130,.38)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = 'rgba(7,8,11,.28)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.globalAlpha = .52;
    ctx.fillStyle = 'rgba(210,212,208,.16)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(218,218,205,.34)';
    ctx.lineWidth = 1.1;
    roundedPath(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, Math.max(4, r.w * .048));
    ctx.stroke();
    ctx.restore();
  }

  function drawHandFanCard(ctx, item, visual, onChange, disabled){
    const baseRect = item && item.rect;
    if(!baseRect) return null;
    const hovered = isViewportHoveredHandItem(item)
      && !isHandCardDragging()
      && !(item.card && item.card.flags && item.card.flags.presentationDeparting)
      && !disabled;
    const r = hovered ? (hoverHandRect(item) || baseRect) : baseRect;
    const angle = hovered ? (Number(item.angle) || 0) * .62 : Number(item.angle) || 0;
    const entry = {card:item.card, c:item.index, r:0, z:0};
    const drawOptions = {pulse:false, tilt:0, lift:hovered ? .06 : 0, hideFateBadge:true, noShadow:true, showStatus:false};
    if(!angle) {
      drawCardVisual(ctx, entry, visual, r, onChange, drawOptions);
      const plainIconRect = drawHandEffectIcon(ctx, item.card, r);
      if(disabled) drawDisabledCardOverlay(ctx, r);
      return plainIconRect ? {iconRect:plainIconRect, iconHitRect:plainIconRect, cardRect:r} : null;
    }
    const pivot = {x:r.x + r.w / 2, y:r.y + r.h / 2};
    let iconRect = null;
    ctx.save();
    ctx.translate(pivot.x, pivot.y);
    ctx.rotate(angle);
    ctx.translate(-pivot.x, -pivot.y);
    drawCardVisual(ctx, entry, visual, r, onChange, drawOptions);
    iconRect = drawHandEffectIcon(ctx, item.card, r);
    if(disabled) drawDisabledCardOverlay(ctx, r);
    ctx.restore();
    return iconRect
      ? {iconRect, iconHitRect:transformedRectBounds(iconRect, angle, pivot), cardRect:transformedRectBounds(r, angle, pivot)}
      : null;
  }

  function drawViewportHoverOverlay(ctx){
    if(!ctx || !viewportHoverHit || !lastLayout || !lastSnapshot) return;
    if(viewportHoverHit.kind === 'hand-effect-icon') {
      drawHandEffectTooltip(ctx, viewportHoverHit);
      return;
    }
    if(viewportHoverHit.kind === 'hand-card') {
      const handCards = lastLayout.hand && Array.isArray(lastLayout.hand.cards) ? lastLayout.hand.cards : [];
      const item = handCards.find(function(candidate){
        return candidate && viewportHoverHit.iid && String(candidate.iid || (candidate.card && candidate.card.iid) || '') === String(viewportHoverHit.iid);
      }) || handCards.find(function(candidate){ return candidate && Number(candidate.index) === Number(viewportHoverHit.index); });
      if(!item || !item.card || !item.rect) return;
      if(isHandCardDragging() || (item.card.flags && item.card.flags.presentationDeparting)) return;
      const disabled = isSupporterLimitDisabled(item, lastSnapshot) || isTutorialHandCardDisabled(item, lastSnapshot);
      if(disabled) return;
      const hoverRect = hoverHandRect(item) || viewportHoverHit.rect || item.rect;
      const effects = handEffectRows(item.card);
      if(effects.length) {
        drawHandEffectTooltip(ctx, {kind:'hand-card', rect:hoverRect, iconRect:handEffectIconRect(hoverRect), cardRect:hoverRect, card:item.card, effects});
      }
      return;
    }
    if(viewportHoverHit.kind === 'pile') {
      if(viewportHoverHit.rect) {
        drawPileHoverBorder(ctx, null, viewportHoverHit.rect);
        return;
      }
      const piles = lastLayout.piles && Array.isArray(lastLayout.piles.items) ? lastLayout.piles.items : [];
      const pile = piles.find(function(candidate){
        return candidate
          && Number(candidate.playerIndex) === Number(viewportHoverHit.playerIndex)
          && candidate.pile === viewportHoverHit.pile;
      });
      if(pile) drawPileHoverBorder(ctx, pile);
    }
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
      ctx.moveTo(cx - s * .32, cy - s * .24);
      ctx.lineTo(cx - s * .02, cy);
      ctx.lineTo(cx - s * .32, cy + s * .24);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - s * .02, cy - s * .30);
      ctx.lineTo(cx + s * .34, cy);
      ctx.lineTo(cx - s * .02, cy + s * .30);
      ctx.stroke();
      ctx.globalAlpha *= .55;
      ctx.beginPath();
      ctx.moveTo(cx - s * .38, cy);
      ctx.lineTo(cx - s * .25, cy);
      ctx.moveTo(cx + s * .26, cy);
      ctx.lineTo(cx + s * .40, cy);
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
    const labelText = String(label || '');
    ctx.fillStyle = disabled ? 'rgba(200,200,192,.48)' : (danger ? '#ffc4b8' : active ? '#a4f2c8' : '#f2d778');
    const labelScale = labelText.length > 13 ? .20 : (compact ? .28 : .25);
    const labelPx = labelText.length > 16 ? 7 : Math.max(8, Math.round(rect.h * labelScale));
    ctx.font = '800 ' + labelPx + 'px Cinzel, serif';
    ctx.textAlign = glyph ? 'left' : 'center';
    ctx.textBaseline = 'middle';
    const textX = glyph ? rect.x + (primary ? 62 : 34) : rect.x + rect.w / 2;
    const maxTextW = glyph ? Math.max(28, rect.w - (primary ? 72 : 42)) : Math.max(28, rect.w - 16);
    ctx.fillText(labelText, textX, rect.y + rect.h / 2 + 1, maxTextW);
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
    const canEndTurn = !!interaction.localActionTurn && !interaction.aiTurnLocked && (interaction.phase || 'main') === 'main';
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

    const turnKey = {x:x + 46, y:y + 17, w:w - 92, h:37};
    function turnKeyPath(rg){
      const cut = 8;
      const point = 17;
      ctx.beginPath();
      ctx.moveTo(rg.x + cut, rg.y);
      ctx.lineTo(rg.x + rg.w - point, rg.y);
      ctx.lineTo(rg.x + rg.w, rg.y + rg.h / 2);
      ctx.lineTo(rg.x + rg.w - point, rg.y + rg.h);
      ctx.lineTo(rg.x + cut, rg.y + rg.h);
      ctx.lineTo(rg.x, rg.y + rg.h - cut);
      ctx.lineTo(rg.x, rg.y + cut);
      ctx.closePath();
    }
    ctx.save();
    turnKeyPath(turnKey);
    const keyGrad = ctx.createLinearGradient(turnKey.x, turnKey.y, turnKey.x + turnKey.w, turnKey.y);
    keyGrad.addColorStop(0, canEndTurn ? 'rgba(37,31,18,.98)' : 'rgba(24,27,33,.90)');
    keyGrad.addColorStop(.16, 'rgba(7,10,16,.99)');
    keyGrad.addColorStop(.76, 'rgba(3,6,11,.99)');
    keyGrad.addColorStop(1, canEndTurn ? 'rgba(27,25,14,.98)' : 'rgba(5,7,12,.98)');
    ctx.shadowColor = canEndTurn ? 'rgba(255,211,83,.16)' : 'rgba(0,0,0,.20)';
    ctx.shadowBlur = canEndTurn ? 9 : 5;
    ctx.fillStyle = keyGrad;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.45;
    ctx.strokeStyle = canEndTurn ? 'rgba(255,220,94,.74)' : 'rgba(210,210,200,.26)';
    ctx.stroke();

    ctx.fillStyle = canEndTurn ? '#f3d46c' : 'rgba(210,210,202,.43)';
    ctx.font = '900 13px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('END TURN', turnKey.x + turnKey.w / 2 - 4, turnKey.y + turnKey.h / 2 + .5);

    const arrowX = turnKey.x + turnKey.w - 22;
    const arrowY = turnKey.y + turnKey.h / 2;
    ctx.beginPath();
    [-12, 0].forEach(function(offset){
      ctx.moveTo(arrowX + offset - 3, arrowY - 9);
      ctx.lineTo(arrowX + offset + 9, arrowY);
      ctx.lineTo(arrowX + offset - 3, arrowY + 9);
    });
    ctx.strokeStyle = canEndTurn ? 'rgba(255,231,128,.74)' : 'rgba(210,210,202,.18)';
    ctx.lineWidth = 1.9;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
    hitMap.uiCommands.push({
      kind:'ui-command',
      command:'end-turn',
      disabled:!canEndTurn,
      rect:turnKey
    });
    ctx.strokeStyle = 'rgba(255,226,105,.26)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 18, y + 63);
    ctx.lineTo(x + w - 18, y + 63);
    ctx.stroke();

    const gap = 9;
    const innerX = x + 18;
    const innerW = w - 36;
    const smallH = 34;
    const row1Y = y + 75;
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
    const hitMap = {handCards:[], handEffectIcons:[], opponentHandCards:[], piles:[], uiCommands:[]};
    if(!ctx || !layout || !snapshot) return hitMap;
    const handCards = layout.hand && Array.isArray(layout.hand.cards) ? layout.hand.cards : [];
    const handDrawCards = handCards.slice().sort(function(a, b){
      const ah = isViewportHoveredHandItem(a) ? 1 : 0;
      const bh = isViewportHoveredHandItem(b) ? 1 : 0;
      if(ah !== bh) return ah - bh;
      const af = Math.abs(Number(a && a.fanOffset) || 0);
      const bf = Math.abs(Number(b && b.fanOffset) || 0);
      return bf - af || (Number(a && a.index) || 0) - (Number(b && b.index) || 0);
    });
    function drawHandItem(item){
      if(!item || !item.card || !item.rect) return;
      if(item.card.hidden || item.card._spectatorHidden){
        drawCardBack(ctx, item.rect, '', 'back.png');
        hitMap.handCards.push({kind:'hand-card', index:item.index, iid:item.iid, rect:item.hitRect || item.rect, card:null, disabled:true});
        return;
      }
      if(item.card.flags && item.card.flags.presentationDeparting) {
        hitMap.handCards.push({kind:'hand-card', index:item.index, iid:item.iid, rect:item.hitRect || item.rect, card:item.card, disabled:true, departing:true});
        return;
      }
      const visual = item.card.visual || item.card;
      const disabled = isSupporterLimitDisabled(item, snapshot) || isTutorialHandCardDisabled(item, snapshot);
      hitMap.handCards.push({kind:'hand-card', index:item.index, iid:item.iid, rect:item.hitRect || item.rect, card:item.card, disabled});
      const onChange = function(){ scheduleTextureRender('hand-texture-ready'); };
      const effectIcon = drawHandFanCard(ctx, item, visual, onChange, disabled);
      if(effectIcon && effectIcon.iconRect) {
        hitMap.handEffectIcons.push({
          kind:'hand-effect-icon',
          index:item.index,
          iid:item.iid,
          rect:effectIcon.iconHitRect || effectIcon.iconRect,
          iconRect:effectIcon.iconHitRect || effectIcon.iconRect,
          cardRect:effectIcon.cardRect || item.visualBounds || item.rect,
          card:item.card,
          effects:handEffectRows(item.card)
        });
      }
    }
    handDrawCards.forEach(drawHandItem);

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

  function drawFinalZoneFlash(ctx, zone, zoneRect){
    const flash = (typeof G !== 'undefined' && G) ? G._finalZoneCanvasFlash : null;
    if(!flash || Number(flash.z) !== Number(zone && zone.z)) return;
    const now = nowMs();
    const start = Number(flash.start) || now;
    const duration = Math.max(120, Number(flash.duration) || 1260);
    const t = Math.max(0, Math.min(1, (now - start) / duration));
    const pulse = Math.sin(Math.PI * t);
    const ctrl = Number(flash.ctrl);
    const color = ctrl === 0 ? '86,165,255' : ctrl === 1 ? '255,104,104' : '232,196,82';
    ctx.save();
    roundedPath(ctx, zoneRect.x, zoneRect.y, zoneRect.w, zoneRect.h, 8);
    ctx.fillStyle = 'rgba(' + color + ',' + (.12 + pulse * .24).toFixed(3) + ')';
    ctx.fill();
    const sweepW = zoneRect.w * (.22 + .40 * pulse);
    const sweepX = zoneRect.x - sweepW + (zoneRect.w + sweepW * 2) * t;
    ctx.save();
    roundedPath(ctx, zoneRect.x, zoneRect.y, zoneRect.w, zoneRect.h, 8);
    ctx.clip();
    const sweep = ctx.createLinearGradient(sweepX, zoneRect.y, sweepX + sweepW, zoneRect.y + zoneRect.h);
    sweep.addColorStop(0, 'rgba(' + color + ',0)');
    sweep.addColorStop(.42, 'rgba(' + color + ',' + (.06 + pulse * .34).toFixed(3) + ')');
    sweep.addColorStop(1, 'rgba(' + color + ',0)');
    ctx.fillStyle = sweep;
    ctx.fillRect(sweepX, zoneRect.y, sweepW, zoneRect.h);
    ctx.restore();
    ctx.lineWidth = 2.8 + pulse * 2.2;
    ctx.strokeStyle = 'rgba(' + color + ',' + (.46 + pulse * .54).toFixed(3) + ')';
    ctx.shadowColor = 'rgba(' + color + ',' + (.34 + pulse * .56).toFixed(3) + ')';
    ctx.shadowBlur = 24 + pulse * 42;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,246,191,' + (.22 + pulse * .34).toFixed(3) + ')';
    roundedPath(ctx, zoneRect.x + 7, zoneRect.y + 7, zoneRect.w - 14, zoneRect.h - 14, 6);
    ctx.stroke();
    ctx.restore();
    if(t < 1) scheduleRender('final-zone-flash');
  }

  function drawFinalZoneFlashOverlay(ctx){
    const flash = (typeof G !== 'undefined' && G) ? G._finalZoneCanvasFlash : null;
    if(!ctx || !flash || !lastLayout) return;
    const layout = lastLayout;
    const originX = Number(layout.boardRect && layout.boardRect.x) || 0;
    const originY = Number(layout.boardRect && layout.boardRect.y) || 0;
    const zones = Array.isArray(layout.zones) ? layout.zones : [];
    const zone = zones.find(function(item){ return Number(item && item.z) === Number(flash.z); });
    if(!zone || !zone.rect) return;
    drawFinalZoneFlash(ctx, zone, rect(zone.rect, originX, originY));
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
          }
          const cellSelectionKind = getSelectionTargetKind(cell);
          if(cellSelectionKind) drawSquareSelectionCue(ctx, cr, cellSelectionKind);
          if(isTutorialTargetCell(cell)) drawTutorialTargetCue(ctx, cr);
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
    prepareCoordinatorAuraFateDelays(depthSortedCards);
    const boardIidCountsForMotion = boardCardIidCounts(layout.cardRects || []);
    refreshBoardMotionIdentityQuarantine(boardIidCountsForMotion);
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
      if(isBoardCardHiddenForVfx(iid) || isBoardCellHiddenForVfx(entry.z, entry.r, entry.c)){
        cards++;
        return;
      }
      observeCardForAnimations(entry.card, visual, r);
      const tributeState = getTributeState(entry);
      const move = observeCardForMove(entry.card, r, snapshotChangedForMove, boardIidCountsForMotion);
      if(move && move.kind === 'card-move' && !move.done){
        movingCards.push({entry, visual, rect:r, move, tributeState});
      } else {
        if(rowClip){ ctx.save(); roundedPath(ctx, rowClip.x, rowClip.y, rowClip.w, rowClip.h, 5); ctx.clip(); }
        drawCardVisual(ctx, entry, visual, r, onChange, {tributeState, boardH:boardRect.h, opponent:entry.card && entry.card.owner !== snapshot.viewer});
        const cardSelectionKind = getSelectionTargetKind(entry);
        if(cardSelectionKind) drawSquareSelectionCue(ctx, r, cardSelectionKind);
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
      const fastBoardMove = item.move && item.move.profile === 'board-fast';
      const lift = fastBoardMove ? 0 : (item.move && item.move.flight ? (.36 + arc * .9) : (.22 + arc * .36));
      const rotate = !fastBoardMove && item.move && item.move.profile === 'tcg-set'
        ? Math.sin(Math.PI * Math.max(0, Math.min(1, raw))) * (Number(item.move.rotatePeak) || 4) * Math.PI / 180
        : 0;
      if(rowClip){ ctx.save(); roundedPath(ctx, rowClip.x, rowClip.y, rowClip.w, rowClip.h, 5); ctx.clip(); }
      drawCardVisual(ctx, item.entry, item.visual, r, onChange, {tributeState:item.tributeState, boardH:boardRect.h, lift, tilt:rotate, opponent:item.entry.card && item.entry.card.owner !== snapshot.viewer});
      const movingSelectionKind = getSelectionTargetKind(item.entry);
      if(movingSelectionKind) drawSquareSelectionCue(ctx, r, movingSelectionKind);
      if(rowClip) ctx.restore();
    });
    depthSortedCards.forEach(function(entry){
      if(!entry || !entry.card) return;
      const tributeState = getTributeState(entry);
      if(!tributeState) return;
      const iid = getCardIid(entry.card);
      if(isBoardCardHiddenForVfx(iid) || isBoardCellHiddenForVfx(entry.z, entry.r, entry.c)) return;
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
    [layers.ui, layers.topEffects].filter(Boolean).forEach(function(uiLayer){
      const uiW = Math.max(1, window.innerWidth || cssW);
      const uiH = Math.max(1, window.innerHeight || cssH);
      const uiPxW = Math.max(1, Math.round(uiW * dpr));
      const uiPxH = Math.max(1, Math.round(uiH * dpr));
      if(uiLayer.width !== uiPxW) uiLayer.width = uiPxW;
      if(uiLayer.height !== uiPxH) uiLayer.height = uiPxH;
      uiLayer.__fateCssW = uiW;
      uiLayer.__fateCssH = uiH;
      uiLayer.style.setProperty('position', 'fixed', 'important');
      uiLayer.style.setProperty('left', '0', 'important');
      uiLayer.style.setProperty('top', '0', 'important');
      uiLayer.style.setProperty('right', 'auto', 'important');
      uiLayer.style.setProperty('bottom', 'auto', 'important');
      uiLayer.style.setProperty('width', uiW + 'px', 'important');
      uiLayer.style.setProperty('height', uiH + 'px', 'important');
    });
    const hoverCanvas = layers.hover || document.getElementById(hoverCanvasId);
    if(!hoverCanvas || !canvas) return null;
    const boardRect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : {left:0, top:0};
    const hoverW = Math.max(1, window.innerWidth || cssW);
    const hoverH = Math.max(1, window.innerHeight || cssH);
    const hoverPxW = Math.max(1, Math.round(hoverW * dpr));
    const hoverPxH = Math.max(1, Math.round(hoverH * dpr));
    if(hoverCanvas.width !== hoverPxW) hoverCanvas.width = hoverPxW;
    if(hoverCanvas.height !== hoverPxH) hoverCanvas.height = hoverPxH;
    hoverCanvas.__fateCssW = hoverW;
    hoverCanvas.__fateCssH = hoverH;
    hoverCanvas.style.setProperty('position', 'fixed', 'important');
    hoverCanvas.style.setProperty('left', '0', 'important');
    hoverCanvas.style.setProperty('top', '0', 'important');
    hoverCanvas.style.setProperty('right', 'auto', 'important');
    hoverCanvas.style.setProperty('bottom', 'auto', 'important');
    hoverCanvas.style.setProperty('width', hoverW + 'px', 'important');
    hoverCanvas.style.setProperty('height', hoverH + 'px', 'important');
    lastCanvasMetrics = Object.assign({cssW, cssH, dpr}, scaleMetrics || {});
    lastHoverMetrics = Object.assign({
      cssW:hoverW,
      cssH:hoverH,
      dpr,
      boardX:Number(boardRect.left) || 0,
      boardY:Number(boardRect.top) || 0
    }, scaleMetrics || {});
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
    const metrics = lastHoverMetrics || lastCanvasMetrics;
    const hoverCanvas = document.getElementById(hoverCanvasId);
    const ctx = hoverCanvas && hoverCanvas.getContext ? hoverCanvas.getContext('2d', {alpha:true}) : null;
    if(!ctx || !metrics) return false;
    ctx.setTransform(metrics.dpr, 0, 0, metrics.dpr, 0, 0);
    ctx.clearRect(0, 0, metrics.cssW, metrics.cssH);
    if(hoverHit) {
      ctx.save();
      ctx.translate(Number(metrics.boardX) || 0, Number(metrics.boardY) || 0);
      drawHoverCue(ctx, hoverHit);
      ctx.restore();
    }
    drawViewportHoverOverlay(ctx);
    if(window.FateVfxDirector && typeof window.FateVfxDirector.drawDragPreviewOverlay === 'function'){
      ctx.save();
      ctx.translate(Number(metrics.boardX) || 0, Number(metrics.boardY) || 0);
      window.FateVfxDirector.drawDragPreviewOverlay(ctx);
      ctx.restore();
    }
    renderCounters.hoverLayerRedraws++;
    if(opts.dirty !== false) {
      renderCounters.hoverOnlyDraws++;
      renderCounters.lastDirtyMask = DIRTY_HOVER;
      renderCounters.lastDirtySource = 'hover';
    }
    return true;
  }

  function activationFlashRect(flash){
    if(!flash) return null;
    const iid = String(flash.iid || '');
    const cards = lastHitMap && Array.isArray(lastHitMap.cards) ? lastHitMap.cards : [];
    let hit = null;
    if(iid) {
      hit = cards.find(function(item){ return String(item && item.card && item.card.iid) === iid; });
    }
    if(!hit && Number.isFinite(flash.z) && Number.isFinite(flash.r) && Number.isFinite(flash.c)) {
      hit = cards.find(function(item){
        return item && item.z === flash.z && item.r === flash.r && item.c === flash.c;
      });
    }
    return hit && hit.rect ? hit.rect : flash.rect || null;
  }

  function drawActivationFlashes(ctx){
    if(!ctx || !activeActivationFlashes.length) return;
    const now = nowMs();
    const remaining = [];
    activeActivationFlashes.forEach(function(flash){
      const duration = Math.max(80, Number(flash.duration) || 520);
      const age = now - (Number(flash.startedAt) || now);
      if(age > duration) return;
      remaining.push(flash);
      const r = activationFlashRect(flash);
      if(!r) return;
      const t = Math.max(0, Math.min(1, age / duration));
      const pulse = Math.sin(Math.PI * t);
      const inset = -Math.max(4, r.w * (.035 + pulse * .015));
      const rr = {
        x:r.x + inset,
        y:r.y + inset,
        w:r.w - inset * 2,
        h:r.h - inset * 2
      };
      ctx.save();
      roundedPath(ctx, rr.x, rr.y, rr.w, rr.h, Math.max(6, r.w * .065));
      ctx.shadowColor = 'rgba(255,215,90,.95)';
      ctx.shadowBlur = 10 + pulse * 20;
      ctx.strokeStyle = 'rgba(255,218,86,' + (.92 - t * .15).toFixed(3) + ')';
      ctx.lineWidth = Math.max(2.5, r.w * .034);
      ctx.stroke();
      ctx.shadowBlur = 0;
      roundedPath(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, Math.max(4, r.w * .052));
      ctx.strokeStyle = 'rgba(255,246,184,' + (.55 * pulse).toFixed(3) + ')';
      ctx.lineWidth = Math.max(1, r.w * .012);
      ctx.stroke();
      ctx.restore();
    });
    activeActivationFlashes = remaining;
    if(activeActivationFlashes.length) scheduleRender('activation-flash');
  }

  function flashBoardCardActivation(card, z, r, c, opts){
    const options = opts || {};
    const iid = getCardIid(card);
    const rect = activationFlashRect({iid, z, r, c});
    activeActivationFlashes.push({
      iid,
      z:Number(z),
      r:Number(r),
      c:Number(c),
      rect:rect ? cloneRect(rect) : null,
      startedAt:nowMs(),
      duration:Number(options.duration) || 520
    });
    if(activeActivationFlashes.length > 8) activeActivationFlashes.splice(0, activeActivationFlashes.length - 8);
    scheduleRender('activation-flash');
    return true;
  }

  function drawActivationCinematics(ctx){
    if(!ctx || !activeActivationCinematics.length) return;
    const pending = activeActivationCinematics.splice(0);
    pending.forEach(function(item){
      if(item && typeof item.resolve === 'function' && !item.resolved) {
        item.resolved = true;
        item.resolve(false);
      }
    });
  }

  function playEffectActivationCinematic(card, z, r, c, opts){
    return Promise.resolve(false);
  }

  function drawVfxLayers(layers, cssW, cssH, dpr, options){
    const opts = options || {};
    const director = window.FateVfxDirector;
    const effects = layers && layers.effects;
    const particles = layers && layers.particles;
    const topEffects = layers && layers.topEffects;
    const effectsCtx = effects && effects.getContext ? effects.getContext('2d', {alpha:true}) : null;
    const particleCtx = particles && particles.getContext ? particles.getContext('2d', {alpha:true}) : null;
    const topEffectsCtx = topEffects && topEffects.getContext ? topEffects.getContext('2d', {alpha:true}) : null;
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
    if(topEffectsCtx){
      topEffectsCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if(opts.clearTopEffects !== false) {
        topEffectsCtx.clearRect(0, 0, topEffects.width / dpr, topEffects.height / dpr);
      }
    }
    const result = director && typeof director.draw === 'function' ? director.draw({
      effectsCtx,
      particleCtx,
      topEffectsCtx,
      cssW,
      cssH,
      dpr
    }) : null;
    if(effectsCtx) {
      drawActivationFlashes(effectsCtx);
      drawActivationCinematics(effectsCtx);
      drawPendingWhenSetGlows(effectsCtx);
      drawFinalZoneFlashOverlay(effectsCtx);
    }
    return result;
  }

  function drawActionCompositorOnlyFrame(layers, source, dirtyMask, started){
    if(!(lastReport && lastReport.available && lastCanvasMetrics)) return null;
    const metrics = lastCanvasMetrics;
    drawVfxLayers(layers, metrics.cssW, metrics.cssH, metrics.dpr, {clearEffects:true, clearParticles:true});
    drawHoverOverlay({dirty:false});
    renderCounters.dirtyDraws++;
    renderCounters.vfxOnlyDraws++;
    renderCounters.actionVfxOnlyDraws++;
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
      actionVfxOnlyDraws:renderCounters.actionVfxOnlyDraws,
      actionVfxFrameRequests:renderCounters.actionVfxFrameRequests,
      vfxFullSceneFallbacks:renderCounters.vfxFullSceneFallbacks,
      deferredVfxFrames:renderCounters.deferredVfxFrames,
      lastVfxLayerOnly:renderCounters.lastVfxLayerOnly,
      lastDirtyMask:renderCounters.lastDirtyMask,
      lastDirtySource:renderCounters.lastDirtySource,
      canvas:Object.assign({}, lastReport.canvas || {}, {
        totalLayerPixelArea:totalLayerPixelArea(),
        layers:layerCount
      }),
      vfx:window.FateVfxDirector && typeof window.FateVfxDirector.report === 'function' ? window.FateVfxDirector.report() : null,
      animations:getTimeline() && typeof getTimeline().report === 'function' ? getTimeline().report() : null,
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

  function scheduleHoverDraw(){
    if(hoverRaf) return;
    hoverRaf = requestAnimationFrame(function(){
      recordRafGap();
      hoverRaf = 0;
      drawHoverOverlay();
    });
  }

  function ensureInput(canvas){
    const target = document.getElementById('board') || canvas;
    if(!target || !ownsBoard() || !isActiveMatchScreen()) return;
    if(!window.FateMatchSceneInput) return;
    if(!input) input = new window.FateMatchSceneInput(window.FateMatchRendererAdapter);
    else if(typeof input.updateScene === 'function') input.updateScene(window.FateMatchRendererAdapter);
    input.attach(target);
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

    const sourceLower = String(source || '').toLowerCase();
    const actionAnimating = isActionAnimationActive();
    const actionHandHover = sourceLower.indexOf('hand-hover') >= 0;
    const forbiddenMask = actionHandHover ? 0 : forbiddenActionDirtyMask(dirtyMask);
    if(actionAnimating && forbiddenMask && !isActionCommitRenderAllowed()){
      deferActionDirtyRender(source || 'action-active-render', dirtyMask);
      const compositorOnly = drawActionCompositorOnlyFrame(layers, source || 'action-forbidden-render', dirtyMask, started);
      if(compositorOnly) return compositorOnly;
    }

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
        actionVfxOnlyDraws:renderCounters.actionVfxOnlyDraws,
        actionVfxFrameRequests:renderCounters.actionVfxFrameRequests,
        vfxFullSceneFallbacks:renderCounters.vfxFullSceneFallbacks,
        deferredVfxFrames:renderCounters.deferredVfxFrames,
        deferredActionDirtyFrames:renderCounters.deferredActionDirtyFrames,
        postActionDeferredFrames:renderCounters.postActionDeferredFrames,
        hoverDuringActionSkips:renderCounters.hoverDuringActionSkips,
        pendingWhenSetPulseSkips:renderCounters.pendingWhenSetPulseSkips,
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
        vfx:window.FateVfxDirector && typeof window.FateVfxDirector.report === 'function' ? window.FateVfxDirector.report() : null,
        animations:getTimeline() && typeof getTimeline().report === 'function' ? getTimeline().report() : null,
        source
      });
      return lastReport;
  }

  function currentLayerSet(){
    const board = document.getElementById('board');
    if(!board) return null;
    const canvas = document.getElementById(canvasId) || ensureCanvas(board);
    return canvas && canvas.__fateLayers ? canvas.__fateLayers : null;
  }

  function scheduleActionVfxFrame(source, dirtyMask){
    if(actionVfxRaf) return true;
    renderCounters.actionVfxFrameRequests++;
    actionVfxRaf = requestAnimationFrame(function(){
      recordRafGap();
      actionVfxRaf = 0;
      if(!isActiveMatchScreen()) {
        teardownScene('action-vfx-offscreen');
        return;
      }
      const layers = currentLayerSet();
      if(!layers) {
        scheduleRender(source || 'vfx-animation');
        return;
      }
      drawActionCompositorOnlyFrame(layers, source || 'action-vfx-animation', dirtyMask || DIRTY_VFX_ONLY, nowMs());
    });
    return true;
  }

    const hoverOnly = !!(lastReport && lastReport.available && lastCanvasMetrics)
      && !!(dirtyMask & DIRTY_HOVER)
      && !(dirtyMask & (DIRTY_LAYOUT | DIRTY_BACKGROUND | DIRTY_BOARD_CARDS | DIRTY_HAND | DIRTY_OPP_HAND | DIRTY_PILES | DIRTY_EFFECTS | DIRTY_MOTION | DIRTY_PARTICLES));
    if(hoverOnly){
      drawHoverOverlay({dirty:true});
      renderCounters.dirtyDraws++;
      renderCounters.lastDirtyMask = dirtyMask;
      renderCounters.lastDirtySource = source || '';
      const frameMs = nowMs() - started;
      recordFrameMs(frameMs);
      lastReport = Object.assign({}, lastReport || {}, {
        dirtyDraws:renderCounters.dirtyDraws,
        hoverLayerRedraws:renderCounters.hoverLayerRedraws,
        hoverOnlyDraws:renderCounters.hoverOnlyDraws,
        lastDirtyMask:renderCounters.lastDirtyMask,
        lastDirtySource:renderCounters.lastDirtySource,
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

    const sourceText = sourceLower;
    const cardLayerOnly = (sourceText.indexOf('zone-scroll') >= 0 || sourceText.indexOf('texture-ready') >= 0)
      && !!(lastReport && lastReport.available && lastLayout && lastSnapshot && lastCanvasMetrics)
      && !!(dirtyMask & DIRTY_BOARD_CARDS)
      && !(dirtyMask & (DIRTY_LAYOUT | DIRTY_BACKGROUND | DIRTY_HAND | DIRTY_OPP_HAND | DIRTY_PILES | DIRTY_MOTION));
    if(cardLayerOnly){
      const metrics = lastCanvasMetrics;
      const cssW = metrics.cssW;
      const cssH = metrics.cssH;
      const dpr = metrics.dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      const draw = drawScene(ctx, lastLayout, lastSnapshot, cssW, cssH, dpr);
      renderCounters.cardLayerRedraws++;
      lastHitMap = {
        cards:draw.hitMap.cards || [],
        cells:draw.hitMap.cells || [],
        handCards:lastHitMap.handCards || [],
        handEffectIcons:lastHitMap.handEffectIcons || [],
        opponentHandCards:lastHitMap.opponentHandCards || [],
        piles:lastHitMap.piles || [],
        uiCommands:lastHitMap.uiCommands || []
      };
      drawVfxLayers(layers, cssW, cssH, dpr, {clearEffects:true, clearParticles:false});
      refreshHoverHitFromHitMap(draw.hitMap);
      drawHoverOverlay({dirty:false});
      drawCount++;
      renderCounters.dirtyDraws++;
      if(sourceText.indexOf('zone-scroll') >= 0) renderCounters.zoneScrollOnlyDraws++;
      else renderCounters.cardLayerOnlyDraws++;
      renderCounters.lastDirtyMask = dirtyMask;
      renderCounters.lastDirtySource = source || '';
      const frameMs = nowMs() - started;
      recordFrameMs(frameMs);
      const layerCount = layerIds.reduce(function(total, id){ return total + (document.getElementById(id) ? 1 : 0); }, 0);
      lastReport = Object.assign({}, lastReport, {
        draws:drawCount,
        dirtyDraws:renderCounters.dirtyDraws,
        cardLayerRedraws:renderCounters.cardLayerRedraws,
        zoneScrollOnlyDraws:renderCounters.zoneScrollOnlyDraws,
        cardLayerOnlyDraws:renderCounters.cardLayerOnlyDraws,
        deferredVfxFrames:renderCounters.deferredVfxFrames,
        deferredActionDirtyFrames:renderCounters.deferredActionDirtyFrames,
        postActionDeferredFrames:renderCounters.postActionDeferredFrames,
        hoverDuringActionSkips:renderCounters.hoverDuringActionSkips,
        pendingWhenSetPulseSkips:renderCounters.pendingWhenSetPulseSkips,
        lastDirtyMask:renderCounters.lastDirtyMask,
        lastDirtySource:renderCounters.lastDirtySource,
        cards:draw.cards,
        zones:draw.zones,
        hitMap:{cards:lastHitMap.cards.length, cells:lastHitMap.cells.length, handCards:lastHitMap.handCards.length, handEffectIcons:(lastHitMap.handEffectIcons || []).length, opponentHandCards:lastHitMap.opponentHandCards.length, piles:lastHitMap.piles.length, uiCommands:lastHitMap.uiCommands.length},
        canvas:Object.assign({}, lastReport.canvas || {}, {
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
        source
      });
      return lastReport;
    }

    const snapshot = options && options.snapshot
      ? options.snapshot
      : (typeof window.fateBuildRenderSnapshot === 'function' ? window.fateBuildRenderSnapshot() : null);
    if(actionAnimating) {
      noteActionRendererEvent('layout-rebuild', {dirtySource:source || '', dirtyMask});
    }
    if(!snapshot) {
      lastReport = {available:false, reason:'snapshot-unavailable', version:ADAPTER_VERSION};
      return lastReport;
    }
    lastSnapshot = snapshot;

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
    const prevLayoutStructureKey = lastLayoutStructureKey;
    const nextLayoutStructureKey = layoutStructureKey(layout);
    lastLayout = layout;
    lastLayoutStructureKey = nextLayoutStructureKey;
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
    const uiOnly = !!(lastReport && lastReport.available)
      && !(dirtyMask & (DIRTY_LAYOUT | DIRTY_BACKGROUND | DIRTY_BOARD_CARDS | DIRTY_MOTION))
      && !!(dirtyMask & (DIRTY_HAND | DIRTY_OPP_HAND | DIRTY_PILES | DIRTY_EFFECTS | DIRTY_UI));
    if(uiOnly){
      ensureInput(canvas);
      const uiLayer = layers.ui;
      const uiCtx = uiLayer && uiLayer.getContext ? uiLayer.getContext('2d', {alpha:true}) : null;
      if(uiCtx){
        uiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        uiCtx.clearRect(0, 0, uiLayer.width / dpr, uiLayer.height / dpr);
        renderCounters.uiLayerRedraws++;
      }
      const uiHitMap = uiCtx ? drawSceneUi(uiCtx, layout, snapshot, uiLayer.width / dpr, uiLayer.height / dpr) : {handCards:[], handEffectIcons:[], opponentHandCards:[], piles:[], uiCommands:[]};
      lastHitMap = {
        cards:lastHitMap.cards || [],
        cells:lastHitMap.cells || [],
        handCards:uiHitMap.handCards || [],
        handEffectIcons:uiHitMap.handEffectIcons || [],
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
        actionVfxOnlyDraws:renderCounters.actionVfxOnlyDraws,
        actionVfxFrameRequests:renderCounters.actionVfxFrameRequests,
        vfxFullSceneFallbacks:renderCounters.vfxFullSceneFallbacks,
        deferredVfxFrames:renderCounters.deferredVfxFrames,
        lastVfxLayerOnly:renderCounters.lastVfxLayerOnly,
        lastDirtyMask:renderCounters.lastDirtyMask,
        lastDirtySource:renderCounters.lastDirtySource,
        hand:{v2Cards:lastHitMap.handCards.length},
        opponentHand:{v2Cards:lastHitMap.opponentHandCards.length},
        piles:{v2Piles:lastHitMap.piles.length > 0, v2PileCount:lastHitMap.piles.length},
        hitMap:{cards:lastHitMap.cards.length, cells:lastHitMap.cells.length, handCards:lastHitMap.handCards.length, handEffectIcons:(lastHitMap.handEffectIcons || []).length, opponentHandCards:lastHitMap.opponentHandCards.length, piles:lastHitMap.piles.length, uiCommands:lastHitMap.uiCommands.length},
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

    const freshCardLayerOnly = !!(lastReport && lastReport.available)
      && !canvasResized
      && !!(dirtyMask & DIRTY_BOARD_CARDS)
      && prevLayoutStructureKey
      && prevLayoutStructureKey === nextLayoutStructureKey
      && !(dirtyMask & (DIRTY_LAYOUT | DIRTY_BACKGROUND | DIRTY_HAND | DIRTY_OPP_HAND | DIRTY_PILES | DIRTY_MOTION));
    if(freshCardLayerOnly){
      ensureInput(canvas);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      const draw = drawScene(ctx, layout, snapshot, cssW, cssH, dpr);
      renderCounters.cardLayerRedraws++;
      lastHitMap = {
        cards:draw.hitMap.cards || [],
        cells:draw.hitMap.cells || [],
        handCards:lastHitMap.handCards || [],
        handEffectIcons:lastHitMap.handEffectIcons || [],
        opponentHandCards:lastHitMap.opponentHandCards || [],
        piles:lastHitMap.piles || [],
        uiCommands:lastHitMap.uiCommands || []
      };
      if(dirtyMask & (DIRTY_EFFECTS | DIRTY_PARTICLES)) {
        drawVfxLayers(layers, cssW, cssH, dpr, {clearEffects:true, clearParticles:true});
      } else {
        drawVfxLayers(layers, cssW, cssH, dpr, {clearEffects:true, clearParticles:false});
      }
      refreshHoverHitFromHitMap(draw.hitMap);
      drawHoverOverlay({dirty:false});
      drawCount++;
      renderCounters.dirtyDraws++;
      renderCounters.cardLayerOnlyDraws++;
      renderCounters.lastDirtyMask = dirtyMask;
      renderCounters.lastDirtySource = source || '';
      const layerCount = layerIds.reduce(function(total, id){ return total + (document.getElementById(id) ? 1 : 0); }, 0);
      const frameMs = nowMs() - started;
      recordFrameMs(frameMs);
      lastReport = Object.assign({}, lastReport, {
        draws:drawCount,
        dirtyDraws:renderCounters.dirtyDraws,
        cardLayerRedraws:renderCounters.cardLayerRedraws,
        cardLayerOnlyDraws:renderCounters.cardLayerOnlyDraws,
        zoneScrollOnlyDraws:renderCounters.zoneScrollOnlyDraws,
        deferredVfxFrames:renderCounters.deferredVfxFrames,
        lastDirtyMask:renderCounters.lastDirtyMask,
        lastDirtySource:renderCounters.lastDirtySource,
        cards:draw.cards,
        expectedCards:snapshot.counts && snapshot.counts.boardCards || 0,
        zones:draw.zones,
        hitMap:{cards:lastHitMap.cards.length, cells:lastHitMap.cells.length, handCards:lastHitMap.handCards.length, handEffectIcons:(lastHitMap.handEffectIcons || []).length, opponentHandCards:lastHitMap.opponentHandCards.length, piles:lastHitMap.piles.length, uiCommands:lastHitMap.uiCommands.length},
        canvas:Object.assign({}, lastReport.canvas || {}, {
          dpr:scaleMetrics.rawDpr,
          maxDpr:scaleMetrics.maxDpr,
          renderScale:scaleMetrics.renderScale,
          effectiveDpr,
          totalLayerPixelArea:totalLayerPixelArea(),
          layers:layerCount
        }),
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
      });
      if(maybeAdaptRenderScale()) scheduleRender('adaptive-render-scale');
      scheduleNonFateTimelineFrame();
      return lastReport;
    }

    ['background', 'effects', 'particles', 'topEffects', 'ui'].forEach(function(name){
      const layer = layers[name];
      const layerCtx = layer && layer.getContext ? layer.getContext('2d', {alpha:true}) : null;
      const shouldClear = canvasResized
        || (name === 'background' && !!(dirtyMask & (DIRTY_LAYOUT | DIRTY_BACKGROUND)))
        || (name === 'effects' && !!(dirtyMask & (DIRTY_LAYOUT | DIRTY_EFFECTS | DIRTY_MOTION)))
        || (name === 'particles' && !!(dirtyMask & (DIRTY_LAYOUT | DIRTY_PARTICLES | DIRTY_EFFECTS | DIRTY_MOTION)))
        || (name === 'topEffects' && !!(dirtyMask & (DIRTY_LAYOUT | DIRTY_EFFECTS | DIRTY_MOTION)))
        || (name === 'ui' && !!(dirtyMask & (DIRTY_LAYOUT | DIRTY_HAND | DIRTY_OPP_HAND | DIRTY_PILES | DIRTY_UI)));
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
    const shouldDrawUi = canvasResized || !!(dirtyMask & (DIRTY_LAYOUT | DIRTY_HAND | DIRTY_OPP_HAND | DIRTY_PILES | DIRTY_UI));
    const uiHitMap = shouldDrawUi && uiCtx ? drawSceneUi(uiCtx, layout, snapshot, layers.ui.width / dpr, layers.ui.height / dpr) : {
      handCards:lastHitMap.handCards || [],
      handEffectIcons:lastHitMap.handEffectIcons || [],
      opponentHandCards:lastHitMap.opponentHandCards || [],
      piles:lastHitMap.piles || [],
      uiCommands:lastHitMap.uiCommands || []
    };
    lastHitMap = {
      cards:draw.hitMap.cards || [],
      cells:draw.hitMap.cells || [],
      handCards:uiHitMap.handCards || [],
      handEffectIcons:uiHitMap.handEffectIcons || [],
      opponentHandCards:uiHitMap.opponentHandCards || [],
      piles:uiHitMap.piles || [],
      uiCommands:uiHitMap.uiCommands || []
    };
    drawVfxLayers(layers, cssW, cssH, dpr, {clearEffects:true, clearParticles:false});
    refreshHoverHitFromHitMap(draw.hitMap);
    drawHoverOverlay({dirty:false});
    drawCount++;
    if(isActionAnimationActive()) {
      noteActionRendererEvent('full-scene-redraw', {dirtySource:source || '', dirtyMask});
    }
    renderCounters.fullSceneRedraws++;
    if(String(source || '').toLowerCase().indexOf('vfx') >= 0) {
      renderCounters.vfxFullSceneFallbacks++;
      renderCounters.lastVfxLayerOnly = false;
    }
    renderCounters.lastDirtyMask = dirtyMask;
    renderCounters.lastDirtySource = source || '';
    const domCells = 0;
    const domCards = 0;
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
      zoneScrollOnlyDraws:renderCounters.zoneScrollOnlyDraws,
      cardLayerOnlyDraws:renderCounters.cardLayerOnlyDraws,
      deferredVfxFrames:renderCounters.deferredVfxFrames,
      deferredActionDirtyFrames:renderCounters.deferredActionDirtyFrames,
      postActionDeferredFrames:renderCounters.postActionDeferredFrames,
      hoverDuringActionSkips:renderCounters.hoverDuringActionSkips,
      pendingWhenSetPulseSkips:renderCounters.pendingWhenSetPulseSkips,
      backgroundLayerRedraws:renderCounters.backgroundLayerRedraws,
      cardLayerRedraws:renderCounters.cardLayerRedraws,
      effectLayerRedraws:renderCounters.effectLayerRedraws,
      particleLayerRedraws:renderCounters.particleLayerRedraws,
      uiLayerRedraws:renderCounters.uiLayerRedraws,
      hoverLayerRedraws:renderCounters.hoverLayerRedraws,
      hoverOnlyDraws:renderCounters.hoverOnlyDraws,
      vfxOnlyDraws:renderCounters.vfxOnlyDraws,
      actionVfxOnlyDraws:renderCounters.actionVfxOnlyDraws,
      actionVfxFrameRequests:renderCounters.actionVfxFrameRequests,
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
      hitMap:{cards:lastHitMap.cards.length, cells:lastHitMap.cells.length, handCards:lastHitMap.handCards.length, handEffectIcons:(lastHitMap.handEffectIcons || []).length, opponentHandCards:lastHitMap.opponentHandCards.length, piles:lastHitMap.piles.length, uiCommands:lastHitMap.uiCommands.length},
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
        environment:scaleMetrics.environment,
        dprCapped:!!scaleMetrics.dprCapped,
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
    scheduleNonFateTimelineFrame();
    return lastReport;
  }

  function enqueueRender(source, dirtyMask){
    const src = source || 'scheduled';
    const nextMask = Number(dirtyMask) || dirtyMaskForSource(src);
    const srcLower = String(src || '').toLowerCase();
    const nextIsVfxOnly = isVfxOnlyDirty(nextMask);
    if(isActionAnimationActive() && !isActionCommitRenderAllowed()) {
      if(srcLower.indexOf('viewport-hover') >= 0 || srcLower.indexOf('pile-hover') >= 0) {
        renderCounters.hoverDuringActionSkips++;
        return;
      }
      const forbiddenMask = srcLower.indexOf('hand-hover') >= 0 ? 0 : forbiddenActionDirtyMask(nextMask);
      if(forbiddenMask) {
        deferActionDirtyRender(src, nextMask);
        return;
      }
    }
    if(srcLower.indexOf('hand-hover') < 0 && srcLower.indexOf('post-action-deferred') < 0 && !isActionAnimationActive() && wasActionAnimatingRecently(180) && heavyActionDirtyMask(nextMask)) {
      const age = msSinceLastActionAnimation();
      schedulePostActionRender(src, nextMask, Math.max(24, 180 - (Number.isFinite(age) ? age : 0)));
      return;
    }
    if(redrawRaf && nextIsVfxOnly && (pendingDirtyMask & ~DIRTY_VFX_ONLY)) {
      pendingPostFrameVfx = true;
      renderCounters.deferredVfxFrames++;
      return;
    }
    if(redrawRaf && !nextIsVfxOnly && isVfxOnlyDirty(pendingDirtyMask)) {
      pendingDirtyMask = 0;
      pendingDirtySources = [];
      pendingPostFrameVfx = true;
      renderCounters.deferredVfxFrames++;
    }
    pendingDirtyMask |= nextMask;
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
        pendingPostFrameVfx = false;
        teardownScene('scheduled-offscreen');
        return;
      }
      if(ownsBoard()) renderFromGameState({source:sources, dirtyMask});
      if(pendingPostFrameVfx) {
        pendingPostFrameVfx = false;
        scheduleRender('vfx-animation');
      }
    });
  }

  function scheduleRender(source){
    const src = source || 'scheduled';
    enqueueRender(src, dirtyMaskForSource(src));
  }

  function clearDedicatedVfxFrameRequest(){
    if(dedicatedVfxRaf) cancelAnimationFrame(dedicatedVfxRaf);
    if(dedicatedVfxWatchdog) clearTimeout(dedicatedVfxWatchdog);
    dedicatedVfxRaf = 0;
    dedicatedVfxWatchdog = 0;
  }

  function flushDedicatedVfxFrame(){
    const source = dedicatedVfxSource || 'vfx-animation';
    dedicatedVfxSource = '';
    clearDedicatedVfxFrameRequest();
    if(!isActiveMatchScreen()) return;
    const board = document.getElementById('board');
    const canvas = document.getElementById(canvasId) || (board ? ensureCanvas(board) : null);
    const layers = canvas && canvas.__fateLayers ? canvas.__fateLayers : null;
    if(!layers || !(lastReport && lastReport.available && lastCanvasMetrics)) {
      enqueueRender(source, DIRTY_VFX_ONLY);
      return;
    }
    drawActionCompositorOnlyFrame(layers, source, DIRTY_VFX_ONLY, nowMs());
  }

  // Fate deltas are functional feedback. Give them an independent compositor
  // clock so gameplay redraw coalescing, AI work, or a recovery frame cannot
  // strand a number halfway through its rise. The timeout is a watchdog for a
  // starved rAF; progress itself remains wall-clock based in FateVfxDirector.
  function scheduleVfxFrame(source){
    const src = source || 'vfx-animation';
    if(dedicatedVfxSource.indexOf(src) < 0) {
      dedicatedVfxSource = dedicatedVfxSource ? dedicatedVfxSource + '+' + src : src;
    }
    if(dedicatedVfxRaf || dedicatedVfxWatchdog) return true;
    dedicatedVfxRaf = requestAnimationFrame(flushDedicatedVfxFrame);
    dedicatedVfxWatchdog = setTimeout(flushDedicatedVfxFrame, 40);
    return true;
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
    }, lastReport || {}, {
      fateNumberPerformance:{
        presentations:renderCounters.fateNumberPresentations,
        duplicatesSuppressed:renderCounters.fateNumberDuplicatesSuppressed,
        mainThreadFramesAvoided:renderCounters.fateNumberMainThreadFramesAvoided,
        renderer:'css-compositor'
      }
    });
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
    const r = hit.rect || hit.iconRect || hit.cardRect || {};
    const rectKey = [
      Math.round(Number(r.x) || 0),
      Math.round(Number(r.y) || 0),
      Math.round(Number(r.w) || 0),
      Math.round(Number(r.h) || 0)
    ].join(',');
    if(hit.kind === 'hand-card' || hit.kind === 'hand-effect-icon' || hit.kind === 'opponent-hand-card') return [hit.kind, hit.iid || '', hit.index || 0, rectKey].join(':');
    if(hit.kind === 'pile') return [hit.kind, hit.playerIndex, hit.pile || '', rectKey].join(':');
    if(hit.kind === 'ui-command') return [hit.kind, hit.command || '', rectKey].join(':');
    return hit.kind || '';
  }

  function setViewportHoverHit(hit){
    const next = hit && (hit.kind === 'hand-card' || hit.kind === 'hand-effect-icon' || hit.kind === 'pile') ? hit : null;
    const prev = viewportHoverHit;
    if(viewportHoverKey(prev) === viewportHoverKey(next)) return;
    viewportHoverHit = next;
    const prevWasHand = !!(prev && (prev.kind === 'hand-card' || prev.kind === 'hand-effect-icon'));
    const nextIsHand = !!(next && (next.kind === 'hand-card' || next.kind === 'hand-effect-icon'));
    if(prevWasHand || nextIsHand) scheduleRender('hand-hover');
    else scheduleHoverDraw();
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

  function prewarmMatchEntryLayers(options){
    const opts = options || {};
    const started = nowMs();
    const board = document.getElementById('board');
    if(!board) return {ok:false, reason:'missing-board'};
    const cssW = Math.max(960, Math.round(Number(opts.width) || window.innerWidth || 1280));
    const cssH = Math.max(540, Math.round(Number(opts.height) || window.innerHeight || 720));
    const dpr = Math.min(2, Math.max(1, Number(window.devicePixelRatio || 1)));
    const pxW = Math.max(1, Math.round(cssW * dpr));
    const pxH = Math.max(1, Math.round(cssH * dpr));
    const ids = [backgroundCanvasId, cardCanvasId, effectCanvasId, particleCanvasId, topEffectCanvasId, hoverCanvasId, uiCanvasId];
    let prepared = 0;
    ids.forEach(function(id){
      const canvas = makeLayerCanvas(id, id === cardCanvasId ? 'Fates Entwined match board' : '');
      if((id === uiCanvasId || id === hoverCanvasId || id === topEffectCanvasId) && document.body && canvas.parentNode !== document.body) document.body.appendChild(canvas);
      else if(id !== uiCanvasId && id !== hoverCanvasId && id !== topEffectCanvasId && canvas.parentNode !== board) board.appendChild(canvas);
      if(canvas.width !== pxW) canvas.width = pxW;
      if(canvas.height !== pxH) canvas.height = pxH;
      canvas.__fatePrewarmed = true;
      canvas.__fatePrewarmCssW = cssW;
      canvas.__fatePrewarmCssH = cssH;
      canvas.style.display = 'none';
      try{
        const ctx = canvas.getContext && canvas.getContext('2d', {alpha:true});
        if(ctx) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, 1, 1);
          prepared += 1;
        }
      }catch(e){}
    });
    const report = {
      ok:true,
      source:opts.source || 'match-entry-prewarm',
      layers:prepared,
      cssW,
      cssH,
      dpr,
      pxW,
      pxH,
      ms:roundMs(nowMs() - started)
    };
    try{
      const perf = window.__fatePerf = window.__fatePerf || {};
      perf.matchEntryLayerPrewarm = report;
    }catch(e){}
    return report;
  }

  window.FateMatchRendererAdapter = {
    version:ADAPTER_VERSION,
    ownsBoard,
    ownsHand,
    ownsOpponentHand,
    ownsPiles,
    renderFromGameState,
    scheduleRender,
    scheduleVfxFrame,
    presentFateDelta,
    getHitMap,
    setHoverHit,
    setViewportHoverHit,
    scrollZoneAtClient,
    prewarmMatchEntryLayers,
    flashBoardCardActivation,
    playEffectActivationCinematic,
    prewarmAssetImages,
    queuePlacementMotion,
    suppressInitialPlacementMotion,
    hideBoardCardForVfx,
    hideBoardCellForVfx,
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

  window.addEventListener('resize', function(){
    if(!ownsBoard()) return;
    const key = Math.round(window.innerWidth || 0) + 'x' + Math.round(window.innerHeight || 0) + '@' + Math.round((window.devicePixelRatio || 1) * 100);
    if(key === lastResizeKey) return;
    lastResizeKey = key;
    scheduleRender('resize');
  }, {passive:true});
  window.addEventListener('fate-screen-changed', function(ev){
    const to = ev && ev.detail ? ev.detail.to : '';
    if(to !== 's-game') teardownScene('screen-change');
    else if(ownsBoard()) scheduleRender('screen-enter');
  });
})();
