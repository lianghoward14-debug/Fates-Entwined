//  RENDER
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
let _renderGameScheduled = false;
let _renderGameDirty = null;
let _lastBoardRenderSignature = '';
let _lastHandRenderSignature = '';
let _lastHandLabelSignature = '';
let _lastOppHandRenderSignature = '';
let _lastPileRenderSignature = '';
let _lastLandscapeRenderSignature = '';
let _lastBoardStructureSignature = '';
let _lastBoardCellSignatures = null;
let _lastBlockOverlaySignature = '';
let _lastTopBarShellSignature = '';
let _lastPlayerBannersSignature = '';
let _lastTopBarEffectsSourceSignature = '';
let _lastActionBarLayoutSignature = '';
let _lastPlayerBannerActiveSignature = '';
let _renderCalcCache = null;
let _renderDiagnosticsEnabled = null;
const RENDER_ALL_PARTS = Object.freeze({
  board:true,
  hand:true,
  scores:true,
  piles:true,
  landscape:true,
  oppHand:true,
  blocks:true,
  topbar:true
});
function roundRenderMs(ms) {
  return Math.round((Number(ms) || 0) * 10) / 10;
}
function isFateSuperPerformanceMode() {
  const root = document.documentElement;
  const body = document.body;
  return !!(
    (root && root.classList && root.classList.contains('fate-super-performance-mode')) ||
    (body && body.classList && body.classList.contains('fate-super-performance-mode'))
  );
}
function getRenderDiagnosticsEnabled() {
  if(_renderDiagnosticsEnabled !== null) return _renderDiagnosticsEnabled;
  try { _renderDiagnosticsEnabled = localStorage.getItem('fateRenderDiagnosticsEnabled') === '1'; }
  catch(e) { _renderDiagnosticsEnabled = false; }
  return _renderDiagnosticsEnabled;
}
function shouldCollectRenderDiagnostics() {
  const perf = typeof window !== 'undefined' ? window.__fatePerf : null;
  return getRenderDiagnosticsEnabled() || !!(perf && perf.fpsWatchdogEnabled);
}
function setRenderDiagnosticsEnabled(enabled) {
  _renderDiagnosticsEnabled = !!enabled;
  try {
    if(enabled) localStorage.setItem('fateRenderDiagnosticsEnabled', '1');
    else localStorage.removeItem('fateRenderDiagnosticsEnabled');
  } catch(e) {}
  return _renderDiagnosticsEnabled;
}
if(typeof window !== 'undefined') {
  window.fateEnableRenderDiagnostics = function(){ return setRenderDiagnosticsEnabled(true); };
  window.fateDisableRenderDiagnostics = function(){ return setRenderDiagnosticsEnabled(false); };
}
function noteRenderBreakdown(totalMs, detail) {
  if(typeof window === 'undefined' || totalMs < 12) return;
  const perf = window.__fatePerf = window.__fatePerf || {};
  if(!Array.isArray(perf.renderBreakdowns)) perf.renderBreakdowns = [];
  perf.renderBreakdowns.push(Object.assign({
    totalMs: roundRenderMs(totalMs),
    screen: document.querySelector('.screen.active')?.id || '',
    inGame: !!document.getElementById('s-game')?.classList.contains('active'),
    at: Date.now()
  }, detail || {}));
  if(perf.renderBreakdowns.length > 40) perf.renderBreakdowns.splice(0, perf.renderBreakdowns.length - 40);
}
function noteRenderRequest(parts, normalized) {
  if(typeof window === 'undefined') return;
  const isBroad = !parts || parts === true || parts === 'all';
  const perf = window.__fatePerf = window.__fatePerf || {};
  const partList = Object.keys(normalized || {}).filter(k => normalized[k]).join(',');
  perf.renderRequests = (perf.renderRequests || 0) + 1;
  perf.lastRenderRequestParts = partList;
  if(isBroad) {
    perf.broadRenderRequests = (perf.broadRenderRequests || 0) + 1;
    perf.lastBroadRenderParts = partList;
    try {
      if(window.FateActionPresentation && typeof window.FateActionPresentation.noteRendererEvent === 'function') {
        window.FateActionPresentation.noteRendererEvent('broad-render-request', {
          source:'renderGame',
          parts:partList
        });
      }
    } catch(e) {}
  } else {
    perf.scopedRenderRequests = (perf.scopedRenderRequests || 0) + 1;
    perf.lastScopedRenderParts = partList;
  }
  if(!shouldCollectRenderDiagnostics()) return;
  let caller = 'unknown';
  try{
    const stack = String(new Error().stack || '').split('\n').map(s=>s.trim()).filter(Boolean);
    caller = stack.find(line => line.indexOf('noteRenderRequest') < 0 && line.indexOf('renderGame') < 0 && line.indexOf('Error') !== 0) || stack[3] || 'unknown';
    caller = caller.replace(/^at\s+/, '').slice(0, 180);
  }catch(e){}
  const stats = perf.renderCallerStats = perf.renderCallerStats || {};
  const item = stats[caller] || { count:0, broad:0, scoped:0, lastAt:0, parts:'' };
  item.count += 1;
  if(isBroad) item.broad += 1;
  else item.scoped += 1;
  item.lastAt = Date.now();
  item.parts = partList;
  stats[caller] = item;
}
function normalizeRenderParts(parts) {
  if(!parts || parts === true || parts === 'all') return {...RENDER_ALL_PARTS};
  if(typeof parts === 'string') return RENDER_ALL_PARTS[parts] ? {[parts]:true} : {};
  const out = {};
  Object.keys(parts || {}).forEach(k=>{
    if(parts[k] && RENDER_ALL_PARTS[k]) out[k] = true;
  });
  return out;
}
function getHandRenderPartForPlayer(player) {
  const viewer = typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : 0;
  return Number(player) === viewer ? 'hand' : 'oppHand';
}
function getBoardActionRenderPartsForPlayer(player, options) {
  const opts = options || {};
  const parts = {
    board:true,
    scores:opts.scores !== false,
    blocks:opts.blocks === true,
    topbar:opts.topbar === true
  };
  if(opts.hand !== false) parts[getHandRenderPartForPlayer(player)] = true;
  if(opts.oppHand) parts[getHandRenderPartForPlayer(1 - Number(player))] = true;
  if(opts.bothHands) {
    parts.hand = true;
    parts.oppHand = true;
  }
  if(opts.piles) parts.piles = true;
  if(opts.landscape) parts.landscape = true;
  if(opts.effects) parts.effects = true;
  if(opts.hover) parts.hover = true;
  return parts;
}
function renderBoardActionForPlayer(player, options) {
  const parts = getBoardActionRenderPartsForPlayer(player, options);
  if(typeof rendererV2OwnsBoardScene === 'function' && rendererV2OwnsBoardScene()){
    const partSource = renderPartSource(parts);
    try {
      const perf = window.__fatePerf = window.__fatePerf || {};
      perf.v2BoardActionFastPathRenders = (perf.v2BoardActionFastPathRenders || 0) + 1;
      perf.lastV2BoardActionFastPath = {
        parts:partSource,
        mode:'match-frame-scheduler',
        at:Date.now()
      };
    } catch(e) {}
    FateMatchFrameScheduler.request({
      dirty:parts,
      reason:'board-action-fast-path',
      adapterSource:'board-action-fast-path:' + partSource
    });
    return;
  }
  renderGame(parts);
}
function shouldDeferGameRenderForPointer(dirty) {
  if(!_pointerDown) return false;
  const parts = dirty || {};
  const gameplayDirty = !!(parts.board || parts.hand || parts.oppHand || parts.piles || parts.scores || parts.blocks || parts.topbar);
  if(!gameplayDirty) return true;
  try {
    const presenter = window.FateActionPresentation;
    if(presenter) {
      if(typeof presenter.isActive === 'function' && presenter.isActive()) return false;
      if(typeof presenter.wasActionRecently === 'function' && presenter.wasActionRecently(420)) return false;
    }
  } catch(e) {}
  try {
    if(typeof G !== 'undefined' && G && (G._actionPresentationActive || G._consolidating || G.placing)) return false;
  } catch(e) {}
  return true;
}
function notePointerRenderDecision(kind, dirty) {
  try {
    const perf = window.__fatePerf = window.__fatePerf || {};
    if(kind === 'deferred') perf.pointerDeferredGameRenders = (perf.pointerDeferredGameRenders || 0) + 1;
    else if(kind === 'bypassed') perf.pointerBypassedGameRenderDeferrals = (perf.pointerBypassedGameRenderDeferrals || 0) + 1;
    perf.lastPointerRenderDecision = {
      kind,
      parts:Object.keys(dirty || {}).filter(function(k){ return dirty[k]; }).join(','),
      at:Date.now()
    };
  } catch(e) {}
}
function mergeRenderParts(a, b) {
  const out = {...(a || {})};
  Object.keys(b || {}).forEach(k=>{ if(b[k]) out[k] = true; });
  return out;
}
function renderPartSource(parts) {
  return Object.keys(parts || {}).filter(function(k){ return parts[k]; }).join(',');
}
function isGameRenderScreenActive() {
  const game = document.getElementById('s-game');
  return !!(game && game.classList.contains('active'));
}
function noteSuppressedOffscreenGameRender(source) {
  if(typeof window === 'undefined') return;
  const perf = window.__fatePerf = window.__fatePerf || {};
  perf.suppressedOffscreenGameRenders = (perf.suppressedOffscreenGameRenders || 0) + 1;
  perf.lastSuppressedGameRender = {
    source: source || 'renderGame',
    screen: document.querySelector('.screen.active')?.id || '',
    at: Date.now()
  };
}
function invalidateRenderCaches() {
  _renderGameScheduled = false;
  _renderGameDirty = null;
  if(window.FateMatchFrameScheduler && typeof window.FateMatchFrameScheduler.reset === 'function') {
    window.FateMatchFrameScheduler.reset('invalidate-render-caches');
  }
  _lastBoardRenderSignature = '';
  _lastHandRenderSignature = '';
  _lastHandLabelSignature = '';
  _lastOppHandRenderSignature = '';
  _lastPileRenderSignature = '';
  _lastLandscapeRenderSignature = '';
  _lastBoardStructureSignature = '';
  _lastBoardCellSignatures = null;
  _lastBlockOverlaySignature = '';
  _lastTopBarShellSignature = '';
  _lastPlayerBannersSignature = '';
  _lastTopBarEffectsSourceSignature = '';
  _lastActionBarLayoutSignature = '';
  _lastPlayerBannerActiveSignature = '';
  _renderCalcCache = null;
}
window.invalidateFateRenderCaches = invalidateRenderCaches;

const FateMatchFrameScheduler = (function(){
  let scheduled = false;
  let flushing = false;
  let dirty = null;
  let adapterSources = [];
  let afterPaint = [];
  let nonCritical = [];
  let lastFlushAt = 0;
  let lastFlushMs = 0;
  let flushCount = 0;
  let requestCount = 0;
  let mergedRequestCount = 0;
  let lastReason = '';
  let lastDirty = '';
  let lastAdapterSources = '';

  function addUnique(list, value){
    const text = String(value || '').trim();
    if(text && list.indexOf(text) < 0) list.push(text);
  }
  function noteRequest(reason, parts){
    try {
      const perf = window.__fatePerf = window.__fatePerf || {};
      perf.matchFrameSchedulerRequests = (perf.matchFrameSchedulerRequests || 0) + 1;
      perf.lastMatchFrameSchedulerRequest = {
        reason:reason || '',
        parts:renderPartSource(parts),
        scheduled,
        at:Date.now()
      };
    } catch(e) {}
  }
  function enqueueTask(list, fn, label){
    if(typeof fn !== 'function') return;
    list.push({fn, label:label || fn.name || 'task'});
  }
  function enqueueTasks(list, tasks){
    if(!tasks) return;
    if(Array.isArray(tasks)) {
      tasks.forEach(function(task){
        if(typeof task === 'function') enqueueTask(list, task, task.name);
        else if(task && typeof task.fn === 'function') enqueueTask(list, task.fn, task.label);
      });
    } else if(typeof tasks === 'function') {
      enqueueTask(list, tasks, tasks.name);
    }
  }
  function runTaskList(list, budgetMs){
    if(!list.length) return 0;
    const started = performance.now ? performance.now() : Date.now();
    let ran = 0;
    while(list.length){
      const task = list.shift();
      try { task.fn(); } catch(err) { console.error('MatchFrameScheduler task failed:', task.label, err); }
      ran++;
      const now = performance.now ? performance.now() : Date.now();
      if(budgetMs && now - started >= budgetMs) {
        setTimeout(function(){ runTaskList(list, budgetMs); }, 0);
        break;
      }
    }
    return ran;
  }
  function v2OwnsMatchScene(){
    try {
      return typeof rendererV2OwnsBoardScene === 'function' && rendererV2OwnsBoardScene();
    } catch(e) {
      return false;
    }
  }
  function adapterOwnedParts(parts){
    return !!(parts && (parts.board || parts.hand || parts.oppHand || parts.piles || parts.scores || parts.blocks || parts.effects || parts.hover));
  }
  function domDirtyFrom(parts){
    const out = {};
    if(parts && parts.topbar) out.topbar = true;
    if(parts && parts.landscape) out.landscape = true;
    return out;
  }
  function schedule(){
    if(scheduled) return;
    scheduled = true;
    _renderGameScheduled = true;
    requestAnimationFrame(flush);
  }
  function request(options){
    const opts = options || {};
    const parts = normalizeRenderParts(opts.dirty || opts.parts || {});
    noteRequest(opts.reason || opts.source || 'request', parts);
    requestCount++;
    if(dirty) mergedRequestCount++;
    dirty = mergeRenderParts(dirty, parts);
    if(opts.adapterSource) addUnique(adapterSources, opts.adapterSource);
    enqueueTasks(afterPaint, opts.afterPaint);
    enqueueTasks(nonCritical, opts.nonCritical);
    lastReason = opts.reason || opts.source || lastReason || 'request';
    schedule();
  }
  function requestRender(parts, reason){
    request({dirty:parts, reason:reason || 'renderGame'});
  }
  function commit(options){
    const opts = options || {};
    if(typeof opts.stateMutation === 'function') opts.stateMutation();
    request({
      dirty:opts.dirty || opts.parts || {},
      reason:opts.reason || 'commit',
      adapterSource:opts.adapterSource,
      afterPaint:opts.afterPaint,
      nonCritical:opts.nonCritical
    });
  }
  function flush(){
    scheduled = false;
    _renderGameScheduled = false;
    if(flushing) return;
    if(!dirty && !adapterSources.length && !afterPaint.length && !nonCritical.length) return;
    flushing = true;
    const started = performance.now ? performance.now() : Date.now();
    const frameDirty = dirty || {};
    const frameSources = adapterSources.slice();
    dirty = null;
    adapterSources = [];
    _renderGameDirty = null;
    try {
      if(!isGameRenderScreenActive()){
        noteSuppressedOffscreenGameRender('MatchFrameScheduler');
        return;
      }
      if(shouldDeferGameRenderForPointer(frameDirty)){
        dirty = mergeRenderParts(dirty, frameDirty);
        frameSources.forEach(function(src){ addUnique(adapterSources, src); });
        _renderDeferredByPointer = true;
        notePointerRenderDecision('deferred', frameDirty);
        return;
      }
      if(_pointerDown) notePointerRenderDecision('bypassed', frameDirty);
      const ownsV2 = v2OwnsMatchScene();
      if(ownsV2 && adapterOwnedParts(frameDirty)) {
        const source = frameSources.join('+') || ('match-frame:' + renderPartSource(frameDirty));
        if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function') {
          window.FateMatchRendererAdapter.scheduleRender(source);
        }
        const domDirty = domDirtyFrom(frameDirty);
        if(domDirty.topbar && typeof updateTopBar === 'function') enqueueTask(afterPaint, function(){ updateTopBar(); }, 'updateTopBar');
        if(domDirty.landscape && typeof renderLandscapePanel === 'function') enqueueTask(afterPaint, function(){ renderLandscapePanel(); }, 'renderLandscapePanel');
      } else {
        performGameRender(frameDirty);
      }
      requestAnimationFrame(function(){
        runTaskList(afterPaint, 3);
        if(nonCritical.length) setTimeout(function(){ runTaskList(nonCritical, 4); }, 0);
      });
    } finally {
      flushing = false;
      const ended = performance.now ? performance.now() : Date.now();
      lastFlushAt = Date.now();
      lastFlushMs = roundRenderMs(ended - started);
      flushCount++;
      lastDirty = renderPartSource(frameDirty);
      lastAdapterSources = frameSources.join('+');
      try {
        const perf = window.__fatePerf = window.__fatePerf || {};
        perf.matchFrameSchedulerFlushes = flushCount;
        perf.matchFrameSchedulerLastFlushMs = lastFlushMs;
        perf.matchFrameSchedulerMergedRequests = mergedRequestCount;
        perf.lastMatchFrameSchedulerFlush = report();
      } catch(e) {}
      if(dirty || afterPaint.length || nonCritical.length) schedule();
    }
  }
  function reset(reason){
    scheduled = false;
    flushing = false;
    dirty = null;
    adapterSources = [];
    afterPaint = [];
    nonCritical = [];
    lastReason = reason || 'reset';
  }
  function report(){
    return {
      available:true,
      version:1,
      scheduled,
      flushing,
      dirty:renderPartSource(dirty || {}),
      adapterSources:adapterSources.join('+'),
      afterPaint:afterPaint.length,
      nonCritical:nonCritical.length,
      flushCount,
      requestCount,
      mergedRequestCount,
      lastFlushAt,
      lastFlushMs,
      lastReason,
      lastDirty,
      lastAdapterSources
    };
  }
  return {request, requestRender, commit, flush, reset, report};
})();
if(typeof window !== 'undefined') window.FateMatchFrameScheduler = FateMatchFrameScheduler;
function replaceElementChildren(el, childOrFrag) {
  if(!el) return;
  if(typeof el.replaceChildren === 'function') el.replaceChildren(childOrFrag);
  else {
    el.innerHTML = '';
    if(childOrFrag) el.appendChild(childOrFrag);
  }
}
function isElectronCardImageRuntime() {
  try {
    return location.protocol === 'file:' || /Electron/i.test(navigator.userAgent || '') || /\belectron=1\b/i.test(location.search || '');
  } catch(e) {
    return false;
  }
}
function getRuntimeCardImageSrc(src, role) {
  if(!src) return src;
  const raw = String(src);
  const m = raw.match(/^([A-Za-z0-9_-]+)\.png([?#].*)?$/);
  if(!m) return raw;
  if(isElectronCardImageRuntime() && (role === 'hand' || role === 'detail' || role === 'full')) return raw;
  return 'optimized/card-thumbs/' + m[1] + '.jpg' + (m[2] || '');
}
function getFullCardImageFallbackSrc(src) {
  if(!src) return '';
  const raw = String(src);
  const m = raw.match(/(?:^|\/)optimized\/card-thumbs\/([A-Za-z0-9_-]+)\.jpg(?:[?#].*)?$/);
  return (m && isElectronCardImageRuntime()) ? (m[1] + '.png') : raw;
}
window.getFullCardImageFallbackSrc = getFullCardImageFallbackSrc;
function shouldUseCanvasBoardVisuals() {
  try {
    if(window.FATE_RUNTIME_FORCE_DOM_BOARD) return false;
    if(window.FATE_FORCE_DOM_BOARD_UNTIL && typeof performance !== 'undefined' && performance.now && performance.now() < window.FATE_FORCE_DOM_BOARD_UNTIL) return false;
    if(/\bdomBoard=1\b/i.test(location.search || '')) return false;
    if(localStorage && localStorage.getItem('fateDisableCanvasBoard') === '1') return false;
    if(/\bcanvasBoard=1\b/i.test(location.search || '')) return true;
    if(localStorage && localStorage.getItem('fateEnableCanvasBoard') === '1') return true;
    if(typeof G !== 'undefined' && G && (G._markSelecting || (Array.isArray(G.extraRows) && G.extraRows.some(function(n){ return Number(n) > 0; })))) return false;
  } catch(e) {}
  return !!(window.HTMLCanvasElement && window.requestAnimationFrame);
}
window.shouldUseCanvasBoardVisuals = shouldUseCanvasBoardVisuals;
if(shouldUseCanvasBoardVisuals()) {
  document.documentElement.classList.add('fate-canvas-board-mode');
  window.FATE_USE_CANVAS_BOARD = true;
} else {
  document.documentElement.classList.remove('fate-canvas-board-mode');
  window.FATE_USE_CANVAS_BOARD = false;
}
const _cardDetailImagePreloadCache = new Set();
function preloadCardDetailImage(card) {
  if(!card || !card.img || typeof Image === 'undefined') return;
  const src = String(card.img);
  if(_cardDetailImagePreloadCache.has(src)) return;
  _cardDetailImagePreloadCache.add(src);
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  if(typeof img.decode === 'function') img.decode().catch(function(){});
}
function beginRenderCalculationFrame() {
  _renderCalcCache = { effectiveFate:new Map(), zoneScores:new Map(), baseScores:new Map() };
}
function getCachedEffectiveFate(card, z) {
  if(!card) return 0;
  if(!_renderCalcCache || typeof getEffectiveFate !== 'function') return getEffectiveFate(card, z);
  const key = String(z) + ':' + String(card.iid || card.id || '') + ':' + String(card.currentFate) + ':' + (card.faceDown ? 1 : 0) + ':' + (card.immuneFlag ? 1 : 0) + ':' + (card._markedForDeath ? 1 : 0) + ':' + (card.usesLeft || 0);
  if(_renderCalcCache.effectiveFate.has(key)) return _renderCalcCache.effectiveFate.get(key);
  const value = getEffectiveFate(card, z);
  _renderCalcCache.effectiveFate.set(key, value);
  return value;
}
function getCachedBaseZoneScore(z, player) {
  if(!_renderCalcCache || typeof getBaseZoneScore !== 'function') return getBaseZoneScore(z, player);
  const key = z + ':' + player;
  if(_renderCalcCache.baseScores.has(key)) return _renderCalcCache.baseScores.get(key);
  let score = 0;
  const zone = G.board?.[z] || [];
  zone.forEach((row)=> {
    if(!row) return;
    row.forEach((cell)=>{ if(cell && cell.owner === player) score += getCachedEffectiveFate(cell, z); });
  });
  const dm = G.fateModifiers?.['deterrance_z'+z] || 0;
  let deterranceOwner = -1;
  zone.forEach(row=>row && row.forEach(cell=>{ if(cell && cell.id === '36') deterranceOwner = cell.owner; }));
  if(deterranceOwner >= 0 && deterranceOwner !== player && dm < 0) score = Math.max(0, score + dm);
  if(typeof getLandscapeZoneFateBonus === 'function') score = Math.max(0, score + getLandscapeZoneFateBonus(player, z));
  _renderCalcCache.baseScores.set(key, score);
  return score;
}
function getCachedZoneScore(z, player) {
  if(!_renderCalcCache || typeof getZoneScore !== 'function') return getZoneScore(z, player);
  const key = z + ':' + player;
  if(_renderCalcCache.zoneScores.has(key)) return _renderCalcCache.zoneScores.get(key);
  let score = getCachedBaseZoneScore(z, player);
  const multiplier = typeof getPlayerZoneFateMultiplier === 'function' ? getPlayerZoneFateMultiplier(player) : 1;
  if(multiplier > 1) score = Math.ceil(score * multiplier);
  _renderCalcCache.zoneScores.set(key, score);
  return score;
}
function getBoardScrollSnapshot() {
  const board = document.getElementById('board');
  if(!board) return null;
  return {
    el: board,
    left: board.scrollLeft || 0,
    top: board.scrollTop || 0,
    winLeft: window.scrollX || document.documentElement.scrollLeft || document.body.scrollLeft || 0,
    winTop: window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
  };
}
function restoreBoardScrollSnapshot(snap) {
  if(!snap || !snap.el || !document.body.contains(snap.el)) return;
  snap.el.scrollLeft = snap.left;
  snap.el.scrollTop = snap.top;
  if(Number.isFinite(snap.winLeft) && Number.isFinite(snap.winTop) && typeof window.scrollTo === 'function') {
    window.scrollTo(snap.winLeft, snap.winTop);
  }
}
let _zoneRowManualScroll = [false, false, false];
let _zoneRowScrollTops = [0, 0, 0];
function captureZoneRowScrollSnapshots(root) {
  const board = root || document.getElementById('board');
  if(!board) return [];
  return Array.from(board.querySelectorAll('.zone')).map(function(zoneEl, idx){
    const z = Number(zoneEl.dataset.zone || idx);
    const rows = zoneEl.querySelector('.zone-rows');
    return {
      z,
      top: rows ? rows.scrollTop || 0 : 0,
      manual: !!_zoneRowManualScroll[z]
    };
  });
}
function restoreZoneRowScrollSnapshots(root, snaps) {
  const board = root || document.getElementById('board');
  if(!board) return;
  const byZone = {};
  (snaps || []).forEach(function(snap){ if(snap) byZone[snap.z] = snap; });
  Array.from(board.querySelectorAll('.zone')).forEach(function(zoneEl, idx){
    const z = Number(zoneEl.dataset.zone || idx);
    const rows = zoneEl.querySelector('.zone-rows');
    if(!rows) return;
    const snap = byZone[z] || {};
    const snapTop = Number(snap.top);
    const top = Number.isFinite(snapTop) ? snapTop : (snap.manual ? (_zoneRowScrollTops[z] || 0) : 0);
    rows.dataset.restoringScroll = '1';
    rows.scrollTop = top;
    _zoneRowScrollTops[z] = top;
    const finish = function(){
      if(!document.body.contains(rows)) return;
      rows.scrollTop = top;
      rows.dataset.restoringScroll = '0';
    };
    if(typeof requestAnimationFrame === 'function') requestAnimationFrame(finish);
    else setTimeout(finish, 0);
  });
}
function installZoneRowScrollGuard(rowsEl, z) {
  if(!rowsEl) return;
  rowsEl.dataset.zone = z;
  rowsEl.dataset.manualScroll = _zoneRowManualScroll[z] ? '1' : '0';
  const getMarkScrollLockTop = function(){
    if(!(window.FATE_SUPPRESS_MARK_SCROLL_UNTIL && Date.now() < window.FATE_SUPPRESS_MARK_SCROLL_UNTIL)) return null;
    const zoneSnaps = window.FATE_MARK_SCROLL_SNAP && window.FATE_MARK_SCROLL_SNAP.zones;
    const snap = Array.isArray(zoneSnaps) ? zoneSnaps.find(function(s){ return s && Number(s.z) === Number(z); }) : null;
    return snap ? (snap.top || 0) : 0;
  };
  const markManual = function(){
    const lockedTop = getMarkScrollLockTop();
    if(lockedTop !== null){
      window.FATE_SUPPRESS_MARK_SCROLL_UNTIL = 0;
    }
    _zoneRowManualScroll[z] = true;
    rowsEl.dataset.manualScroll = '1';
  };
  rowsEl.addEventListener('wheel', markManual, {passive:true});
  rowsEl.addEventListener('touchmove', markManual, {passive:true});
  rowsEl.addEventListener('pointerdown', markManual, {passive:true});
  rowsEl.addEventListener('keydown', markManual, {passive:true});
  rowsEl.addEventListener('scroll', function(){
    if(rowsEl.dataset.restoringScroll === '1') return;
    const lockedTop = getMarkScrollLockTop();
    if(lockedTop !== null){
      rowsEl.scrollTop = lockedTop;
      _zoneRowScrollTops[z] = lockedTop;
      return;
    }
    _zoneRowScrollTops[z] = rowsEl.scrollTop || 0;
  }, {passive:true});
}
function resetZoneRowScrollState(z) {
  const zi = Number(z);
  if(!Number.isFinite(zi)) return;
  _zoneRowManualScroll[zi] = false;
  _zoneRowScrollTops[zi] = 0;
}
window.resetZoneRowScrollState = resetZoneRowScrollState;
let _boardViewportLock = null;
function hasMarkExtraBoardGeometry() {
  if(typeof G === 'undefined' || !G) return false;
  if(Array.isArray(G.markSafeSquares) && G.markSafeSquares.length) return true;
  return Array.isArray(G.extraRows) && G.extraRows.some(v => Number(v || 0) > 0);
}
function captureBoardViewportLock() {
  const board = document.getElementById('board');
  if(!board || !hasMarkExtraBoardGeometry()) {
    _boardViewportLock = null;
    return null;
  }
  _boardViewportLock = {
    el: board,
    left: board.scrollLeft || 0,
    top: board.scrollTop || 0,
    zoneRows: captureZoneRowScrollSnapshots(board)
  };
  return _boardViewportLock;
}
function restoreBoardViewportLockSoon() {
  const snap = _boardViewportLock;
  if(!snap || !snap.el || !document.body.contains(snap.el)) return;
  restoreBoardScrollSnapshot(snap);
  restoreZoneRowScrollSnapshots(snap.el, snap.zoneRows);
  if(typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(function(){
      restoreBoardScrollSnapshot(snap);
      restoreZoneRowScrollSnapshots(snap.el, snap.zoneRows);
      requestAnimationFrame(function(){
        restoreBoardScrollSnapshot(snap);
        restoreZoneRowScrollSnapshots(snap.el, snap.zoneRows);
      });
    });
  } else {
    setTimeout(function(){
      restoreBoardScrollSnapshot(snap);
      restoreZoneRowScrollSnapshots(snap.el, snap.zoneRows);
    }, 0);
  }
  setTimeout(function(){
    if(_boardViewportLock === snap) _boardViewportLock = null;
  }, 120);
}
window.captureFateBoardViewportLock = captureBoardViewportLock;
window.restoreFateBoardViewportLockSoon = restoreBoardViewportLockSoon;
function performGameRender(parts) {
  if(!isGameRenderScreenActive()){
    noteSuppressedOffscreenGameRender('performGameRender');
    return;
  }
  const collectDiagnostics = shouldCollectRenderDiagnostics();
  const renderStart = collectDiagnostics ? performance.now() : 0;
  const dirty = normalizeRenderParts(parts);
  const breakdown = collectDiagnostics ? { parts: Object.keys(dirty).filter(function(k){ return dirty[k]; }).join(',') } : null;
  const timed = collectDiagnostics
    ? function(name, fn){
        const t0 = performance.now();
        try{ return fn(); }
        finally{
          const ms = performance.now() - t0;
          breakdown[name] = roundRenderMs((breakdown[name] || 0) + ms);
        }
      }
    : function(name, fn){ return fn(); };
  try{
    beginRenderCalculationFrame();
    const gameScreen = document.getElementById('s-game');
    const localConsolidationActive = typeof isLocalConsolidationActive === 'function' ? isLocalConsolidationActive() : !!G._consolidating;
    if(gameScreen) gameScreen.classList.toggle('is-consolidating', localConsolidationActive);
    const boardOwnedByRendererV2 = dirty.board && rendererV2OwnsBoardScene();
    const boardScrollSnap = dirty.board && !boardOwnedByRendererV2 ? timed('boardScrollSnap', getBoardScrollSnapshot) : null;
    if(dirty.board) {
      if(boardOwnedByRendererV2) {
        timed('renderBoardV2', renderBoard);
      } else {
        const boardState = timed('boardSignatures', getBoardRenderState);
        const nextBoardSig = boardState.renderSignature;
        const nextStructureSig = boardState.structureSignature;
        const nextCellSigs = boardState.cellSignatures;
        const boardEl = document.getElementById('board');
        const boardHasZones = !!(boardEl && boardEl.querySelector('.zone'));
        if(nextBoardSig !== _lastBoardRenderSignature || !boardEl || !boardHasZones){
          const patched = boardEl && boardEl.children.length && nextStructureSig === _lastBoardStructureSignature && _lastBoardCellSignatures
            ? timed('patchBoard', function(){ return patchChangedBoardCells(nextCellSigs, _lastBoardCellSignatures); })
            : false;
          if(breakdown) breakdown.boardPatched = !!patched;
          if(!patched) timed('renderBoard', renderBoard);
          _lastBoardRenderSignature = nextBoardSig;
          _lastBoardStructureSignature = nextStructureSig;
          _lastBoardCellSignatures = nextCellSigs;
          timed('restoreBoardScroll', function(){ restoreBoardScrollSnapshot(boardScrollSnap); });
          if(boardScrollSnap && (boardScrollSnap.left || boardScrollSnap.top) && typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(function(){ restoreBoardScrollSnapshot(boardScrollSnap); });
          }
        }
      }
    }
    if(dirty.hand) timed('renderHand', renderHand);
    // Toggle cancel-consolidation button visibility
    var cancelBtn = document.getElementById('cancel-consolidate-btn');
    if(cancelBtn) cancelBtn.style.display = localConsolidationActive ? '' : 'none';
    if(dirty.scores) timed('renderZoneScores', renderZoneScores);
    if(dirty.piles) timed('renderPiles', renderPiles);
    if((dirty.landscape || dirty.scores) && typeof renderLandscapePanel === 'function') timed('renderLandscapePanel', renderLandscapePanel);
    if(dirty.oppHand) timed('renderOppHand', renderOppHand);
    if(localConsolidationActive) timed('highlightTributeCards', highlightTributeCards);
    if(dirty.blocks && typeof refreshBlockOverlays === 'function') timed('refreshBlockOverlays', refreshBlockOverlays);
    if(dirty.topbar && typeof updateTopBar === 'function') timed('updateTopBar', updateTopBar);
    timed('restoreViewportLock', restoreBoardViewportLockSoon);
  } finally {
    _renderCalcCache = null;
    if(collectDiagnostics) noteRenderBreakdown(performance.now() - renderStart, breakdown);
  }
}

function isCardVisuallySuppressed(card, z, r, c) {
  if(!card) return false;
  if(isCardVisuallyNegated(card)) return false;
  try {
    if(typeof isCardEffectSuppressed === 'function' && isCardEffectSuppressed(card, z, r, c) && !card._effectNegatedByReaction) return true;
  } catch(e) {}
  try {
    if(card.type === 'Supporter' && typeof isSupporterEffectSuppressed === 'function' && isSupporterEffectSuppressed(card)) return true;
  } catch(e) {}
  try {
    if(card.type === 'Coordinator' && Number.isInteger(z) && Number.isInteger(r) && Number.isInteger(c)
      && typeof isCoordinatorSuppressedAt === 'function' && isCoordinatorSuppressedAt(z, r, c)) return true;
  } catch(e) {}
  return !!(card._effectSuppressedByReaction || card._lydiaSuppressed || card._reactionSuppressed || card._lumberjackSuppressed);
}
if(typeof window !== 'undefined') window.isCardVisuallySuppressed = isCardVisuallySuppressed;

function isCardVisuallyNegated(card) {
  return !!(card && card._effectNegatedByReaction);
}
if(typeof window !== 'undefined') window.isCardVisuallyNegated = isCardVisuallyNegated;

function isInnateProtectionIconHiddenCard(card) {
  const id = String(card && card.id || '');
  return id === '20' || id === '70' || id === '76' || id === 'bh01';
}

function shouldShowProtectionStatusIcon(card) {
  if(!card || isFaceDownCard(card) || isInnateProtectionIconHiddenCard(card)) return false;
  if(typeof frenchFusiliersCopies === 'function' && frenchFusiliersCopies(card, '20')) return true;
  return !!(card.immuneFlag || card.opponentEffectImmune);
}
if(typeof window !== 'undefined') window.shouldShowProtectionStatusIcon = shouldShowProtectionStatusIcon;

const CARD_STATUS_VISUAL_PRIORITY = Object.freeze([
  'effect_flash',
  'snowball',
  'negated',
  'suppressed',
  'blocked',
  'marked',
  'immune'
]);
const cardStatusVisualPrimarySeen = new Map();
const snowballFightStatusTimers = new Map();
const cardEffectFlashTimers = new Map();
const TEMPORARY_CARD_OVERLAY_MS = 3500;

function temporaryCardOverlayDurationMs(kind) {
  return TEMPORARY_CARD_OVERLAY_MS;
}

function sanitizeCardEffectFlashKind(kind) {
  return String(kind || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

function markCardEffectFlash(card, kind, options) {
  if(!card) return false;
  const opts = options || {};
  const cleanKind = sanitizeCardEffectFlashKind(kind);
  if(!cleanKind) return false;
  const at = Date.now();
  card._effectFlash = {
    kind:cleanKind,
    at,
    duration:cleanKind === 'kvetka_ballad' ? 0 : temporaryCardOverlayDurationMs(cleanKind),
    turn:cleanKind === 'kvetka_ballad' && typeof G !== 'undefined' && G ? Number(G.turn) || 0 : null,
    visibleAt:opts.waitForConsolidationCinematic ? at + 90 : at,
    waitForConsolidationCinematic:!!opts.waitForConsolidationCinematic,
    soundKey:String(opts.soundKey || (cleanKind + ':' + String(card.iid || card.id || 'card') + ':' + at)),
    pitchStep:Math.max(0, Number(opts.pitchStep) || 0),
    label:String(opts.label || cleanKind.replace(/[_-]+/g, ' '))
  };
  return true;
}
if(typeof window !== 'undefined') window.markCardEffectFlash = markCardEffectFlash;

function scheduleCardEffectFlashExpiry(card, flash) {
  if(typeof window === 'undefined' || !card || !flash || !flash.at) return;
  const key = String(card.iid || card.id || 'card');
  const previous = cardEffectFlashTimers.get(key);
  if(previous && previous.at === flash.at) return;
  if(previous && previous.timer) clearTimeout(previous.timer);
  if(sanitizeCardEffectFlashKind(flash.kind) === 'kvetka_ballad') {
    const flashTurn = Number(flash.turn) || 0;
    const pollMs = flash.waitForConsolidationCinematic ? 120 : 650;
    const timer = setInterval(function(){
      const current = cardEffectFlashTimers.get(key);
      const sameFlash = current && current.at === flash.at && card._effectFlash && card._effectFlash.at === flash.at;
      const sameTurn = typeof G !== 'undefined' && G && (Number(G.turn) || 0) === flashTurn;
      if(!sameFlash || !sameTurn) {
        clearInterval(timer);
        if(current && current.at === flash.at) cardEffectFlashTimers.delete(key);
        try { renderGame({board:true}); } catch(e) {}
        return;
      }
      try {
        if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function') {
          window.FateMatchRendererAdapter.scheduleRender('kvetka-ballad-overlay-pulse');
        }
      } catch(e) {}
    }, pollMs);
    cardEffectFlashTimers.set(key, {at:flash.at, timer, turn:flashTurn, persistentForTurn:true});
    return;
  }
  const remaining = Math.max(0, Number(flash.at) + temporaryCardOverlayDurationMs(flash.kind) - Date.now());
  const timer = setTimeout(function(){
    const current = cardEffectFlashTimers.get(key);
    if(!current || current.at !== flash.at) return;
    cardEffectFlashTimers.delete(key);
    try { renderGame({board:true}); } catch(e) {}
    try {
      if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function') {
        window.FateMatchRendererAdapter.scheduleRender('card-effect-flash-expired');
      }
    } catch(e) {}
  }, remaining);
  cardEffectFlashTimers.set(key, {at:flash.at, timer});
}

function scheduleCardEffectFlashVisibilityPoll(card, flash) {
  if(typeof window === 'undefined' || !card || !flash || !flash.at) return;
  const key = String(card.iid || card.id || 'card');
  const previous = cardEffectFlashTimers.get(key);
  if(previous && previous.at === flash.at && previous.waitingForCinematic) return;
  if(previous && previous.timer) {
    if(previous.persistentForTurn) clearInterval(previous.timer);
    else clearTimeout(previous.timer);
  }
  const timer = setTimeout(function(){
    const current = cardEffectFlashTimers.get(key);
    if(!current || current.at !== flash.at || !current.waitingForCinematic) return;
    cardEffectFlashTimers.delete(key);
    try {
      if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function') {
        window.FateMatchRendererAdapter.scheduleRender('card-effect-flash-cinematic-wait');
      } else if(typeof renderGame === 'function') {
        renderGame({board:true});
      }
    } catch(e) {}
  }, 120);
  cardEffectFlashTimers.set(key, {at:flash.at, timer, waitingForCinematic:true});
}

function getActiveCardEffectFlash(card) {
  const flash = card && card._effectFlash;
  if(!flash || !flash.at || !flash.kind) return null;
  const cleanKind = sanitizeCardEffectFlashKind(flash.kind);
  if(cleanKind === 'kvetka_ballad' && (typeof G === 'undefined' || !G || (Number(G.turn) || 0) !== (Number(flash.turn) || 0))) return null;
  if(flash.waitForConsolidationCinematic) {
    const now = Date.now();
    const actionPresentationActive = typeof G !== 'undefined' && G && (Number(G._actionPresentationLockUntil) || 0) > now;
    const cinematicLockActive = typeof G !== 'undefined' && G && (Number(G._cinematicUiLockUntil) || 0) > now;
    const cinematicDomActive = typeof document !== 'undefined' && !!document.body?.classList.contains('cinematic-lock');
    if(now < (Number(flash.visibleAt) || 0) || actionPresentationActive || cinematicLockActive || cinematicDomActive) {
      scheduleCardEffectFlashVisibilityPoll(card, flash);
      return null;
    }
    const oldAt = flash.at;
    flash.waitForConsolidationCinematic = false;
    flash.visibleAt = now;
    if(cleanKind !== 'kvetka_ballad') flash.at = now;
    const key = String(card.iid || card.id || 'card');
    const pending = cardEffectFlashTimers.get(key);
    if(pending && pending.at === oldAt && pending.timer) {
      if(pending.persistentForTurn) clearInterval(pending.timer);
      else clearTimeout(pending.timer);
    }
    if(pending && pending.at === oldAt) cardEffectFlashTimers.delete(key);
  }
  if(cleanKind === 'kvetka_ballad') {
    scheduleCardEffectFlashExpiry(card, flash);
    return flash;
  }
  if(Date.now() >= Number(flash.at) + temporaryCardOverlayDurationMs(flash.kind)) return null;
  scheduleCardEffectFlashExpiry(card, flash);
  return flash;
}
if(typeof window !== 'undefined') window.getActiveCardEffectFlash = getActiveCardEffectFlash;

function scheduleSnowballFightStatusExpiry(card, hitAt) {
  if(typeof window === 'undefined' || !card || !hitAt) return;
  const key = String(card.iid || card.id || 'card');
  const previous = snowballFightStatusTimers.get(key);
  if(previous && previous.hitAt === hitAt) return;
  if(previous && previous.timer) clearTimeout(previous.timer);
  const remaining = Math.max(0, hitAt + TEMPORARY_CARD_OVERLAY_MS - Date.now());
  const timer = setTimeout(function(){
    const current = snowballFightStatusTimers.get(key);
    if(!current || current.hitAt !== hitAt) return;
    snowballFightStatusTimers.delete(key);
    try { renderGame({board:true}); } catch(e) {}
    try {
      if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function') {
        window.FateMatchRendererAdapter.scheduleRender('snowball-fight-status-expired');
      }
    } catch(e) {}
  }, remaining);
  snowballFightStatusTimers.set(key, {hitAt, timer});
}

function isSnowballFightHitActive(card) {
  const hitAt = Number(card && card._snowballFightHitAt) || 0;
  if(!hitAt || Date.now() >= hitAt + TEMPORARY_CARD_OVERLAY_MS) return false;
  scheduleSnowballFightStatusExpiry(card, hitAt);
  return true;
}
if(typeof window !== 'undefined') window.isSnowballFightHitActive = isSnowballFightHitActive;

function queueCardStatusIconSfx(kind, cardKey, effectFlash) {
  if(kind !== 'immune' && kind !== 'marked' && kind !== 'blocked' && kind !== 'snowball' && kind !== 'effect_flash') return;
  if(typeof window === 'undefined') return;
  if(kind === 'effect_flash') {
    const flash = effectFlash || {};
    setTimeout(function(){
      try {
        if(typeof window.playCardEffectFlashSfx === 'function') window.playCardEffectFlashSfx(flash.kind, {
          key:flash.soundKey || ('effect-flash-' + String(cardKey || 'card') + '-' + String(flash.at || '')),
          pitchStep:flash.pitchStep
        });
      } catch(e) {}
    }, 0);
    return;
  }
  const type = kind === 'immune' ? 'immuneShield'
    : (kind === 'marked' ? 'statusMarked' : (kind === 'snowball' ? 'snowballFight' : 'statusBlocked'));
  const key = 'status-icon-' + kind + '-' + String(cardKey || 'card');
  setTimeout(function(){
    try {
      if(typeof window.playFateSfxOnce === 'function') window.playFateSfxOnce(type, key, 260);
      else if(typeof playSfx === 'function') playSfx(type);
    } catch(e) {}
  }, 0);
}

function getBoardCardStatusEligibility(card, z, r, c, isHidden) {
  const hidden = !!isHidden || !card;
  return {
    negated:!hidden && isCardVisuallyNegated(card),
    suppressed:!hidden && isCardVisuallySuppressed(card, z, r, c),
    snowball:!hidden && isSnowballFightHitActive(card),
    marked:!hidden && !!card._markedForDeath,
    blocked:!hidden && !!((G.blockedCells || []).find(function(b){ return b && b.z === z && b.r === r && b.c === c && b.type === 'zoe'; })),
    immune:!hidden && shouldShowProtectionStatusIcon(card),
    effectFlash:!hidden ? getActiveCardEffectFlash(card) : null
  };
}

function getCardStatusVisualState(card, statuses) {
  const active = statuses || {};
  const key = String(card && (card.iid || card.id) || '');
  const flash = active.effectFlash && active.effectFlash.kind ? active.effectFlash : null;
  let primary = '';
  for(let i = 0; i < CARD_STATUS_VISUAL_PRIORITY.length; i++) {
    const kind = CARD_STATUS_VISUAL_PRIORITY[i];
    if((kind === 'effect_flash' && flash) || (kind !== 'effect_flash' && active[kind])) {
      primary = kind;
      break;
    }
  }
  if(key) {
    const signature = primary === 'effect_flash'
      ? primary + ':' + String(flash && flash.at || '') + ':' + String(flash && flash.kind || '')
      : primary;
    if(cardStatusVisualPrimarySeen.get(key) !== signature) {
      cardStatusVisualPrimarySeen.set(key, signature);
      if(primary === 'effect_flash') queueCardStatusIconSfx(primary, key, flash);
      else if(primary && primary !== 'negated' && primary !== 'suppressed') queueCardStatusIconSfx(primary, key);
    }
  }
  return { primary, immune:primary === 'immune', flashKind:flash ? flash.kind : '' };
}
if(typeof window !== 'undefined') window.getCardStatusVisualState = getCardStatusVisualState;

function cardRenderSignature(card, z, r, c) {
  if(!card) return '0';
  let eff = '';
  try{ eff = z == null ? getLiveCardFate(card) : getCachedEffectiveFate(card, z); }catch(e){}
  return [
    card.iid, card.id, card.owner, card.type, card.rarity, card.aff,
    card.fate, card.xFate ? 1 : 0, card.currentFate, eff, card.faceDown ? 1 : 0,
    card.immuneFlag ? 1 : 0, card.opponentEffectImmune ? 1 : 0, card._markedForDeath ? 1 : 0,
    Number(card._snowballFightHitAt) || 0,
    card._effectFlash ? [card._effectFlash.kind, card._effectFlash.at, card._effectFlash.duration, card._effectFlash.pitchStep].join(',') : '',
    shouldShowProtectionStatusIcon(card) ? 1 : 0,
    isCardVisuallySuppressed(card, z, r, c) ? 1 : 0,
    isCardVisuallyNegated(card) ? 1 : 0,
    card.noConsolidate ? 1 : 0, card.usesLeft || 0, card._copiedPassiveId || card.copiedPassiveId || '',
    card.vigilanteUsed ? 1 : 0, card.wolfCreekUsed ? 1 : 0,
    card._expMoved ? 1 : 0, card._busserMovedThisTurn ? 1 : 0
  ].join(':');
}

function safeInteractionStateSignature(value) {
  try{
    const seen = new WeakSet();
    return JSON.stringify(value, function(key, val){
      if(key === 'card' && val && typeof val === 'object') return val.iid || val.id || 'card';
      if(val && typeof val === 'object'){
        if(seen.has(val)) return '[cycle]';
        seen.add(val);
      }
      return val;
    });
  }catch(e){
    return String(value && (value.iid || value.id || value.type || value.constructor?.name) || 'state');
  }
}

function getBoardRenderSignature() {
  return getBoardRenderState().renderSignature;
}

function appendBoardInteractionSignature(parts) {
  const viewer = typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : 0;
  parts.push('viewer', viewer, 'cur', G.currentPlayer, 'placing', G.placing ? 1 : 0, 'selH', G.selectedHandCard ?? '', 'con', G._consolidating ? 1 : 0);
  if(G.selectedBoardCard?.card) parts.push('selB', G.selectedBoardCard.card.iid);
  if(G._markSelecting) parts.push('mark', G._markSelecting.player, G._markSelecting.zone ?? '', G._markSelecting.row ?? '');
  ['_boardTargeting','_wolfCreekMoving','_expMoving','_berkeleyMoving','_bh01Moving','_landscapeMoving','_busserMoving','_busserMovingCard'].forEach(k=>{
    if(G[k]) parts.push(k, safeInteractionStateSignature(G[k]));
  });
  parts.push('extraRows', JSON.stringify(G.extraRows || []));
  parts.push('extraRowOwners', JSON.stringify(G.extraRowOwners || []));
  parts.push('extraCells', JSON.stringify(G.extraCells || []));
  parts.push('blocked', JSON.stringify(G.blockedCells || []));
}

function getBoardCellStateSignature(z, r, c, card) {
  const block = (G.blockedCells || []).find(function(b){ return b && b.z === z && b.r === r && b.c === c; });
  const fullExtraRow = typeof isFullExtraSafeRow === 'function' && isFullExtraSafeRow(z, r);
  let markState = '';
  if(r >= 3 && !fullExtraRow){
    if(typeof isMarkSafeSquare === 'function' && isMarkSafeSquare(z,r,c)) markState = 'safe';
    else if(G._markSelecting && G._markSelecting.player === G.currentPlayer && (typeof G._markSelecting.zone !== 'number' || G._markSelecting.zone === z) && (Number.isInteger(G._markSelecting.row) ? r === G._markSelecting.row : (typeof getMarkSafeSquareChoiceRow !== 'function' || r === getMarkSafeSquareChoiceRow(z, G.currentPlayer)))) markState = 'choice';
    else markState = 'inactive';
  }
  return [
    card ? 1 : 0,
    card && G.selectedBoardCard?.card?.iid === card.iid ? 1 : 0,
    c >= 3 ? 1 : 0,
    block?.type === 'carolyn' ? 1 : 0,
    block?.type === 'zoe' ? 1 : 0,
    markState
  ].join(':');
}

function applyBoardCellStateClasses(cellEl, z, r, c, card) {
  if(!cellEl) return;
  const block = (G.blockedCells || []).find(function(b){ return b && b.z === z && b.r === r && b.c === c; });
  const fullExtraRow = typeof isFullExtraSafeRow === 'function' && isFullExtraSafeRow(z, r);
  cellEl.classList.toggle('has-card', !!card);
  cellEl.classList.toggle('cell-empty', !card);
  cellEl.classList.toggle('blocked', !!block && block.type === 'carolyn');
  cellEl.classList.toggle('no-consolidate', !!block && block.type === 'zoe');
  cellEl.classList.toggle('extra-safe', c >= 3);
  cellEl.classList.remove('mark-safe-square','mark-safe-choice','mark-safe-inactive');
  if(r >= 3 && !fullExtraRow){
    if(typeof isMarkSafeSquare === 'function' && isMarkSafeSquare(z,r,c)) cellEl.classList.add('mark-safe-square');
    else if(G._markSelecting && G._markSelecting.player === G.currentPlayer && (typeof G._markSelecting.zone !== 'number' || G._markSelecting.zone === z) && (Number.isInteger(G._markSelecting.row) ? r === G._markSelecting.row : (typeof getMarkSafeSquareChoiceRow !== 'function' || r === getMarkSafeSquareChoiceRow(z, G.currentPlayer)))) cellEl.classList.add('mark-safe-choice');
    else cellEl.classList.add('mark-safe-inactive');
  }
}

function collectReusableBoardCards(boardEl) {
  const reuse = new Map();
  if(!boardEl || !boardEl.querySelectorAll) return reuse;
  boardEl.querySelectorAll('.bc[data-iid][data-board-card-sig]').forEach(function(el){
    const iid = el.dataset && el.dataset.iid;
    if(iid && !reuse.has(iid)) reuse.set(iid, el);
  });
  return reuse;
}

function boardCardDomSignature(card, z, r, c, visual, perspectivePlayer, isHidden, selected) {
  const block = (G.blockedCells || []).find(function(b){ return b && b.z === z && b.r === r && b.c === c; });
  const statusState = getCardStatusVisualState(card, getBoardCardStatusEligibility(card, z, r, c, isHidden));
  return [
    z, r, c, perspectivePlayer, isHidden ? 1 : 0, selected ? 1 : 0,
    block && block.type === 'zoe' ? 1 : 0, statusState.primary || '', statusState.immune ? 1 : 0,
    visual && visual.runtimeImg || '', visual && visual.img || '', visual && visual.name || '',
    visual && visual.displayFate || '',
    cardRenderSignature(card, z, r, c)
  ].join('|');
}

function getBoardRenderState() {
  if(typeof G === 'undefined' || !G) return {renderSignature:'', structureSignature:'', cellSignatures:new Map()};
  const parts = [];
  const structureParts = [];
  const cellSignatures = new Map();
  appendBoardInteractionSignature(parts);
  const viewer = typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : 0;
  structureParts.push('viewer', viewer, 'extraCells', JSON.stringify(G.extraCells || []));
  for(let z=0; z<3; z++){
    parts.push('z', z);
    const zone = G.board?.[z] || [];
    const extraRowCount = (G.extraRows && G.extraRows[z]) || 0;
    const showMarkChoiceRow = !!(G._markSelecting && (typeof G._markSelecting.zone !== 'number' || G._markSelecting.zone === z));
    const markChoiceRow = showMarkChoiceRow
      ? (Number.isInteger(G._markSelecting.row) ? G._markSelecting.row : (typeof getMarkSafeSquareChoiceRow === 'function' ? getMarkSafeSquareChoiceRow(z, G._markSelecting.player) : 3 + extraRowCount))
      : -1;
    const totalRows = Math.max(zone.length, 3 + extraRowCount, showMarkChoiceRow && markChoiceRow >= 3 ? markChoiceRow + 1 : 0);
    structureParts.push('z', z, 'rows', totalRows);
    for(let r=0; r<totalRows; r++){
      const extraCols = r<3?(r===2?G.extraCells?.[z]?.[r]?.p1:(r===0?G.extraCells?.[z]?.[r]?.p2:0)):0;
      const totalCols = 3 + (Number(extraCols) || 0);
      let rowOwner = r===0 ? 1 : (r===1 ? -1 : (r===2 ? 0 : 0));
      let fullExtraRow = false;
      if(r >= 3) {
        const isMarkChoiceRow = !!(showMarkChoiceRow && r === markChoiceRow);
        rowOwner = isMarkChoiceRow
          ? G._markSelecting.player
          : (typeof getExtraSafeRowOwner === 'function' ? getExtraSafeRowOwner(z, r) : 0);
        fullExtraRow = typeof isFullExtraSafeRow === 'function' && isFullExtraSafeRow(z, r);
      }
      structureParts.push('r', r, 'owner', rowOwner, 'full', fullExtraRow ? 1 : 0, 'len', totalCols);
    }
    for(let r=0; r<totalRows; r++){
      const row = zone[r] || [];
      const extraCols = r<3?(r===2?G.extraCells?.[z]?.[r]?.p1:(r===0?G.extraCells?.[z]?.[r]?.p2:0)):0;
      const totalCols = 3 + (Number(extraCols) || 0);
      parts.push('r', r, 'len', row.length);
      for(let c=0; c<totalCols; c++){
        const card = row[c] || null;
        const sig = cardRenderSignature(card, z, r, c) + ';cell=' + getBoardCellStateSignature(z, r, c, card);
        parts.push(c, sig);
        cellSignatures.set(z + ':' + r + ':' + c, sig);
      }
    }
  }
  return {
    renderSignature: parts.join('|'),
    structureSignature: structureParts.join('|'),
    cellSignatures
  };
}

function getBoardStructureSignature() {
  return getBoardRenderState().structureSignature;
}

function collectBoardCellSignatures() {
  return getBoardRenderState().cellSignatures;
}

function getBoardRenderSignatureLegacy() {
  if(typeof G === 'undefined' || !G) return '';
  const viewer = typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : 0;
  const parts = ['viewer', viewer, 'cur', G.currentPlayer, 'placing', G.placing ? 1 : 0, 'selH', G.selectedHandCard ?? '', 'con', G._consolidating ? 1 : 0];
  if(G.selectedBoardCard?.card) parts.push('selB', G.selectedBoardCard.card.iid);
  if(G._markSelecting) parts.push('mark', G._markSelecting.player, G._markSelecting.zone ?? '', G._markSelecting.row ?? '');
  ['_boardTargeting','_wolfCreekMoving','_expMoving','_berkeleyMoving','_bh01Moving','_landscapeMoving','_busserMoving','_busserMovingCard'].forEach(k=>{
    if(G[k]) parts.push(k, safeInteractionStateSignature(G[k]));
  });
  parts.push('extraRows', JSON.stringify(G.extraRows || []));
  parts.push('extraCells', JSON.stringify(G.extraCells || []));
  parts.push('blocked', JSON.stringify(G.blockedCells || []));
  for(let z=0; z<3; z++){
    parts.push('z', z);
    const zone = G.board?.[z] || [];
    for(let r=0; r<zone.length; r++){
      const row = zone[r] || [];
      parts.push('r', r, 'len', row.length);
      for(let c=0; c<row.length; c++) parts.push(c, cardRenderSignature(row[c], z, r, c));
    }
  }
  return parts.join('|');
}

function getHandRenderSignature() {
  if(typeof G === 'undefined' || !G) return '';
  const cp = getPerspectivePlayerIndex();
  const canActFromHand = !G._isSpectator && (cp === G.currentPlayer);
  const canInspectHand = !G._isSpectator || G._onlineRole === 'spectator';
  const force = G._forceHandEnterIids ? Array.from(G._forceHandEnterIids).sort().join(',') : '';
  const tutorialSig = typeof tutorialHandRenderStateSignature === 'function' ? tutorialHandRenderStateSignature() : '';
  const hand = G.players?.[cp]?.hand || [];
  return [
    cp, G.currentPlayer, G.phase, canActFromHand ? 1 : 0, canInspectHand ? 1 : 0, G.selectedHandCard ?? '',
    G.supportsPlacedThisTurn, G.maxSupportsPerTurn, G.extraSupportsThisTurn,
    G.majaEffectThisTurn ? 1 : 0, force, tutorialSig,
    hand.map(card=>[
      card.iid, card.id, card.owner, card.type, card.rarity, card.aff,
      card.fate, card.currentFate, card._wciBonus ? 1 : 0,
      card._handCostDelta || 0, card.guerilla_transferred ? 1 : 0,
      typeof getHandCardEffectModifiers === 'function' ? JSON.stringify(getHandCardEffectModifiers(card)) : ''
    ].join(':')).join(',')
  ].join('|');
}

function getOppHandRenderSignature() {
  if(typeof G === 'undefined' || !G) return '';
  const oppP = getPerspectiveOpponentIndex();
  const oppHand = G.players?.[oppP]?.hand || [];
  const revealed = G._revealedCards || {};
  const landscapeReveal = typeof isLandscapeActive === 'function' && isLandscapeActive('igb12') ? 1 : 0;
  return [oppP, landscapeReveal, oppHand.map(card=>card.iid + ':' + card.id + ':' + (landscapeReveal || revealed[card.iid] ? 1 : 0)).join(',')].join('|');
}

function applyOpponentHandDensity(container, count) {
  if(!container) return;
  const handCount = Math.max(0, Number(count) || 0);
  container.dataset.count = String(handCount);
  const large = handCount > 0 && handCount <= 4;
  const medium = handCount >= 5 && handCount <= 8;
  const compact = handCount >= 9;
  container.classList.toggle('opp-hand-large', large);
  container.classList.toggle('opp-hand-medium', medium);
  container.classList.toggle('opp-hand-compact', compact);
  if(large) {
    container.style.setProperty('--opp-hand-card-w', '68px');
    container.style.setProperty('--opp-hand-card-h', '95px');
  } else if(medium) {
    container.style.setProperty('--opp-hand-card-w', '56px');
    container.style.setProperty('--opp-hand-card-h', '78px');
  } else if(compact) {
    container.style.setProperty('--opp-hand-card-w', '50px');
    container.style.setProperty('--opp-hand-card-h', '70px');
  } else {
    container.style.removeProperty('--opp-hand-card-w');
    container.style.removeProperty('--opp-hand-card-h');
  }
}

var _pointerDown = false;
var _renderDeferredByPointer = false;
const RENDER_V2_LEGACY_LIVE_VISUAL_SELECTOR = '.placement-anim-ghost, .draw-fly-card, .guerilla-transfer-fly, .maria-discard-badge, .aff-change-overlay, .effect-activation-aura, .block-overlay, .effect-blocked-flash, .consolidation-cinematic-overlay, .cc-overlay-v2';

function buildHandEffectMarkerHTML(card) {
  const rows = typeof getHandCardEffectModifiers === 'function' ? getHandCardEffectModifiers(card) : [];
  if(!rows.length) return '';
  return '<div class="hand-effect-marker" aria-label="Card effect modifiers" onclick="event.stopPropagation();" onmouseenter="showHandEffectTooltip(event)" onmousemove="positionHandEffectTooltip(event)" onmouseleave="hideHandEffectTooltip()">' +
    '<span class="hand-effect-marker-icon" aria-hidden="true">i</span>' +
    '<div class="hand-effect-tooltip">' +
      rows.map(function(row){
        return '<div class="hand-effect-row">' +
          '<div class="hand-effect-name">' + escapePlacementAnimHtml(row.name || 'Effect') + '</div>' +
          '<div class="hand-effect-text">' + escapePlacementAnimHtml(row.text || 'Card modified.') + '</div>' +
        '</div>';
      }).join('') +
    '</div>' +
  '</div>';
}

let _handEffectTooltipPortal = null;
function getHandEffectTooltipPortal() {
  if(_handEffectTooltipPortal && _handEffectTooltipPortal.isConnected) return _handEffectTooltipPortal;
  _handEffectTooltipPortal = document.createElement('div');
  _handEffectTooltipPortal.className = 'hand-effect-tooltip hand-effect-tooltip-portal';
  document.body.appendChild(_handEffectTooltipPortal);
  return _handEffectTooltipPortal;
}

function positionHandEffectTooltip(ev) {
  if(!_handEffectTooltipPortal || !_handEffectTooltipPortal.isConnected) return;
  const marker = ev && ev.currentTarget ? ev.currentTarget : null;
  const card = marker && marker.closest ? marker.closest('.hc') : null;
  const rect = card && card.getBoundingClientRect ? card.getBoundingClientRect() : (marker && marker.getBoundingClientRect ? marker.getBoundingClientRect() : null);
  if(!rect) return;
  const width = Math.min(300, Math.max(240, window.innerWidth - 32));
  const gap = 24;
  let x = rect.left - width - gap;
  if(x < 12) x = Math.max(12, rect.left - Math.min(220, width - 40));
  let y = rect.top + Math.min(12, rect.height * .12) + 67;
  const estimatedHeight = Math.min(170, Math.max(96, _handEffectTooltipPortal.offsetHeight || 118));
  if(y + estimatedHeight > window.innerHeight - 12) y = window.innerHeight - estimatedHeight - 12;
  if(y < 12) y = 12;
  _handEffectTooltipPortal.style.width = width + 'px';
  _handEffectTooltipPortal.style.left = Math.round(x) + 'px';
  _handEffectTooltipPortal.style.top = Math.round(y) + 'px';
}

function showHandEffectTooltip(ev) {
  const marker = ev && ev.currentTarget ? ev.currentTarget : null;
  const source = marker && marker.querySelector ? marker.querySelector('.hand-effect-tooltip') : null;
  if(!source) return;
  const portal = getHandEffectTooltipPortal();
  portal.innerHTML = source.innerHTML;
  portal.classList.add('is-visible');
  positionHandEffectTooltip(ev);
}

function hideHandEffectTooltip() {
  if(!_handEffectTooltipPortal) return;
  _handEffectTooltipPortal.classList.remove('is-visible');
}

function rendererV2OwnsBoardScene() {
  return !!(window.FateMatchRendererAdapter
    && typeof window.FateMatchRendererAdapter.ownsBoard === 'function'
    && window.FateMatchRendererAdapter.ownsBoard());
}

function removeRenderV2LegacyLiveVisuals() {
  if(!rendererV2OwnsBoardScene()) return 0;
  let removed = 0;
  try {
    document.querySelectorAll(RENDER_V2_LEGACY_LIVE_VISUAL_SELECTOR).forEach(function(el){
      if(el && el.parentNode) {
        el.remove();
        removed++;
      }
    });
  } catch(e) {}
  return removed;
}

function cleanupStaleEffectActivationDomVisuals() {
  if(typeof document === 'undefined') return 0;
  let removed = 0;
  try {
    document.querySelectorAll('.effect-activation-aura').forEach(function(el){
      if(el && el.parentNode) {
        el.remove();
        removed++;
      }
    });
    document.querySelectorAll('.effect-activate-onfield,.effect-activate-star,.effect-activate-square,.effect-activate-triangle,.effect-activate-circle').forEach(function(el){
      el.classList.remove('effect-activate-onfield','effect-activate-star','effect-activate-square','effect-activate-triangle','effect-activate-circle');
    });
  } catch(e) {}
  return removed;
}

function _flushDeferredRender(){
  if(!_renderDeferredByPointer) return;
  _renderDeferredByPointer = false;
  if(_renderGameScheduled) return;
  const dirty = _renderGameDirty || {...RENDER_ALL_PARTS};
  _renderGameDirty = null;
  if(!isGameRenderScreenActive()){
    noteSuppressedOffscreenGameRender('renderGame:pointerFlush');
    return;
  }
  FateMatchFrameScheduler.requestRender(dirty, 'pointer-flush');
}
document.addEventListener('pointerdown', function(){ _pointerDown = true; }, true);
document.addEventListener('pointerup', function(){ _pointerDown = false; setTimeout(_flushDeferredRender, 80); }, true);
document.addEventListener('pointercancel', function(){ _pointerDown = false; setTimeout(_flushDeferredRender, 80); }, true);

function renderGame(parts) {
  cleanupStaleEffectActivationDomVisuals();
  if(!isGameRenderScreenActive()){
    _renderGameScheduled = false;
    _renderGameDirty = null;
    noteSuppressedOffscreenGameRender('renderGame');
    return;
  }
  const normalizedParts = normalizeRenderParts(parts);
  noteRenderRequest(parts, normalizedParts);
  _renderGameDirty = mergeRenderParts(_renderGameDirty, normalizedParts);
  FateMatchFrameScheduler.requestRender(normalizedParts, 'renderGame');
}
// Immediate render for critical moments (game start, turn change)
function renderGameImmediate(parts) {
  _renderGameScheduled = false;
  _renderGameDirty = null;
  FateMatchFrameScheduler.reset('renderGameImmediate');
  cleanupStaleEffectActivationDomVisuals();
  if(!isGameRenderScreenActive()){
    noteSuppressedOffscreenGameRender('renderGameImmediate');
    return;
  }
  performGameRender(parts);
}
function renderGameParts(parts) {
  renderGame(parts);
}

function renderPiles() {
  if(typeof G === 'undefined' || !G || !G.players) return;
  if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.ownsPiles === 'function' && window.FateMatchRendererAdapter.ownsPiles()){
    const myP = getPerspectivePlayerIndex();
    const oppP = getPerspectiveOpponentIndex();
    const myDeck = G.players[myP].deck.length;
    const myDisc = G.players[myP].discard.length;
    const oppDisc = G.players[oppP].discard.length;
    const set = (id,n,slotId)=>{
      const el=document.getElementById(id);
      if(el) el.textContent='('+n+')';
      const slot=document.getElementById(slotId);
      if(slot) slot.classList.toggle('empty', n===0);
    };
    set('my-deck-count',myDeck,'my-deck');
    set('my-discard-count',myDisc,'my-discard');
    set('opp-discard-count',oppDisc,'opp-discard');
    if(!renderPiles._v2DomCleared) {
      document.querySelectorAll('.pile-card-canvas').forEach(function(canvas){ canvas.remove(); });
      document.querySelectorAll('.pile-slot .pile-cards').forEach(function(slot){
        if(slot.textContent) slot.textContent = '';
        if(slot.style && slot.style.background) slot.style.background = '';
      });
      renderPiles._v2DomCleared = true;
    }
    const myDeckEl = document.getElementById('my-deck');
    const myDiscardEl = document.getElementById('my-discard');
    const oppDeckEl = document.getElementById('opp-deck');
    const oppDiscardEl = document.getElementById('opp-discard');
    if(myDeckEl) myDeckEl.onclick = () => showDeckInfo(myP);
    if(myDiscardEl) myDiscardEl.onclick = () => showDiscard(myP);
    if(oppDeckEl) oppDeckEl.onclick = () => showDeckInfo(oppP);
    if(oppDiscardEl) oppDiscardEl.onclick = () => showDiscard(oppP);
    if(typeof window.FateMatchRendererAdapter.scheduleRender === 'function') window.FateMatchRendererAdapter.scheduleRender('renderPiles');
    else window.FateMatchRendererAdapter.renderFromGameState({piles:true, source:'renderPiles'});
    return;
  }
  // Determine "my" and "opp" perspective (in AI mode, you're always P1)
  const myP = getPerspectivePlayerIndex();
  const oppP = getPerspectiveOpponentIndex();
  const myDeck = G.players[myP].deck.length;
  const oppDeck = G.players[oppP].deck.length;
  const myDisc = G.players[myP].discard.length;
  const oppDisc = G.players[oppP].discard.length;
  const lastDisc = G.players[myP].discard[G.players[myP].discard.length - 1];
  const oppLastDisc = G.players[oppP].discard[G.players[oppP].discard.length - 1];
  const nextSig = [myP, oppP, myDeck, oppDeck, myDisc, oppDisc, lastDisc && lastDisc.img || '', oppLastDisc && oppLastDisc.img || ''].join('|');
  if(nextSig === _lastPileRenderSignature) return;
  _lastPileRenderSignature = nextSig;
  const set = (id,n,slotId)=>{
    const el=document.getElementById(id);
    if(el) el.textContent='('+n+')';
    const slot=document.getElementById(slotId);
    if(slot) slot.classList.toggle('empty', n===0);
  };
  set('my-deck-count',myDeck,'my-deck');
  set('my-discard-count',myDisc,'my-discard');
  set('opp-discard-count',oppDisc,'opp-discard');

  const myDeckEl = document.getElementById('my-deck');
  const myDiscardEl = document.getElementById('my-discard');
  const oppDeckEl = document.getElementById('opp-deck');
  const oppDiscardEl = document.getElementById('opp-discard');
  if(myDeckEl) myDeckEl.onclick = () => showDeckInfo(myP);
  if(myDiscardEl) myDiscardEl.onclick = () => showDiscard(myP);
  if(oppDeckEl) oppDeckEl.onclick = () => showDeckInfo(oppP);
  if(oppDiscardEl) oppDiscardEl.onclick = () => showDiscard(oppP);
  
  // Show latest discarded cards with full PNGs; cover avoids thin letterbox seams in the pile slot.
  const paintDiscardSlot = (selector, card) => {
    const slot = document.querySelector(selector);
    if(!slot) return;
    const src = card && card.img ? getRuntimeCardImageSrc(card.img, 'full') : '';
    const paintKey = [
      src,
      Math.round(slot.clientWidth || 0),
      Math.round(slot.clientHeight || 0),
      Math.round((window.devicePixelRatio || 1) * 100) / 100
    ].join('|');
    if(typeof window.renderCanvasImage === 'function' && window.HTMLCanvasElement) {
      let canvas = slot.querySelector(':scope > canvas.pile-card-canvas');
      if(!canvas) {
        slot.textContent = '';
        slot.style.background = 'linear-gradient(135deg,#1a1a2a,#0a0a12)';
        canvas = document.createElement('canvas');
        canvas.className = 'pile-card-canvas';
        canvas.setAttribute('aria-hidden','true');
        slot.appendChild(canvas);
      }
      if(canvas.__fatePilePaintKey === paintKey && canvas.width > 0 && canvas.height > 0) return;
      canvas.__fatePilePaintKey = paintKey;
      window.renderCanvasImage(canvas, src, { mode:'cover', parent:slot, background:'#0a0a0f' });
      return;
    }
    if(slot.__fatePilePaintKey === paintKey) return;
    slot.__fatePilePaintKey = paintKey;
    if(src) slot.style.background = `#0a0a0f url('${src}') center/cover no-repeat`;
    else slot.style.background = 'linear-gradient(135deg,#1a1a2a,#0a0a12)';
  };
  paintDiscardSlot('#my-discard .pile-cards', lastDisc);
  paintDiscardSlot('#opp-discard .pile-cards', oppLastDisc);
}

function renderLandscapePanel() {
  const panel = document.getElementById('landscape-panel');
  if(!panel) return;
  let landscape = typeof getCurrentLandscape === 'function' ? getCurrentLandscape() : null;
  const tutorialLandscapeDisplay = !landscape && typeof _tutorialActive !== 'undefined' && _tutorialActive && typeof LANDSCAPES !== 'undefined' && LANDSCAPES && LANDSCAPES.igb1;
  if(tutorialLandscapeDisplay) landscape = LANDSCAPES.igb1;
  const st = typeof getLandscapeState === 'function' ? getLandscapeState() : null;
  if(!landscape) {
    panel.innerHTML = '';
    panel.classList.add('empty');
    panel.classList.remove('tutorial-landscape');
    return;
  }
  let note = '';
  if((landscape.id === 'igb3' || landscape.id === 'igb8') && st && typeof st.targetZone === 'number') {
    note = 'Chosen Zone: Zone ' + (st.targetZone + 1);
  } else if(landscape.id === 'igb2' && st && Array.isArray(st.consolidations)) {
    note = 'Consolidations: ' + (st.consolidations[0] || 0) + ' / ' + (st.consolidations[1] || 0);
  } else if(landscape.id === 'igb5') {
    const perspective = (typeof getPerspectivePlayerIndex === 'function') ? getPerspectivePlayerIndex() : 0;
    const myTotal = typeof getLandscapeTotalFate === 'function' ? getLandscapeTotalFate(perspective) : 0;
    const oppTotal = typeof getLandscapeTotalFate === 'function' ? getLandscapeTotalFate(1 - perspective) : 0;
    note = 'Total Fate: You ' + myTotal + ' / Opp ' + oppTotal;
  }
  const sig = [landscape.id, landscape.name, landscape.description, note, tutorialLandscapeDisplay ? 'tutorial' : 'live'].join('|');
  if(sig === _lastLandscapeRenderSignature && panel.children.length) return;
  _lastLandscapeRenderSignature = sig;
  panel.classList.remove('empty');
  panel.classList.toggle('tutorial-landscape', !!tutorialLandscapeDisplay);
  const landscapeNameHtml = escapeHtml(landscape.name).replace(/:\s+/, ':<br>');
  panel.innerHTML =
    '<div class="landscape-kicker">Landscape</div>' +
    '<div class="landscape-name">' + landscapeNameHtml + '</div>' +
    '<div class="landscape-desc">' + escapeHtml(landscape.description) + '</div>' +
    (note ? '<div class="landscape-note">' + escapeHtml(note) + '</div>' : '');
}

function showLandscapeChoiceModal(page, onChoose, promptState) {
  const choiceState = promptState || {committed:false};
  const entries = Object.keys(LANDSCAPES || {}).sort(function(a,b){
    return (parseInt(a.replace('igb',''),10)||0) - (parseInt(b.replace('igb',''),10)||0);
  }).map(function(id){
    const n = Math.max(1, Math.min(16, parseInt(id.replace('igb',''), 10) || 1));
    return {
      id:id,
      num:n,
      song:'board' + n,
      landscape:LANDSCAPES[id],
      img:(typeof INGAME_BG_PATH === 'function') ? INGAME_BG_PATH(n) : ('optimized/backgrounds/ingamebackgrouds_igb' + n + '.jpg')
    };
  });
  if(!entries.length){ toast('No landscapes available.'); return; }
  const perPage = 3;
  const maxPage = Math.max(0, Math.ceil(entries.length / perPage) - 1);
  const currentPage = Math.max(0, Math.min(maxPage, Number(page) || 0));
  const shown = entries.slice(currentPage * perPage, currentPage * perPage + perPage);
  const selectActionStart = currentPage > 0 ? 1 : 0;
  const body = '<div class="landscape-choice-grid">' + shown.map(function(entry, idx){
    const landscape = entry.landscape || {};
    const blockReason = choiceState.sourceCard && String(choiceState.sourceCard.id || '') === '82' && typeof getFelicitaLandscapeChangeBlockReason === 'function'
      ? getFelicitaLandscapeChangeBlockReason(entry.id)
      : '';
    return '<button type="button" class="landscape-choice-card' + (blockReason ? ' is-blocked' : '') + '" data-landscape-action-index="' + (selectActionStart + idx) + '" data-landscape-block-reason="' + escapeHtml(blockReason) + '">' +
      '<div class="landscape-choice-art"><img src="' + escapeHtml(entry.img) + '" alt=""></div>' +
      '<div class="landscape-choice-copy">' +
        '<div class="landscape-choice-kicker">Landscape ' + entry.num + '</div>' +
        '<div class="landscape-choice-title">' + escapeHtml(landscape.name || ('Landscape ' + entry.num)).replace(/:\s+/, ':<br>') + '</div>' +
        '<div class="landscape-choice-desc">' + escapeHtml(landscape.description || '') + '</div>' +
        (blockReason ? '<div class="landscape-choice-blocked">Unavailable during the final four turns</div>' : '') +
      '</div>' +
    '</button>';
  }).join('') + '</div>' +
  '<div class="landscape-choice-page">Page ' + (currentPage + 1) + ' / ' + (maxPage + 1) + '</div>';
  const actions = [];
  if(currentPage > 0) actions.push({label:'Prev', action:function(){ showLandscapeChoiceModal(currentPage - 1, onChoose, choiceState); }});
  shown.forEach(function(entry){
    actions.push({label:'Choose ' + (entry.landscape && entry.landscape.shortName ? entry.landscape.shortName : ('Landscape ' + entry.num)), pri:true, hidden:true, action:function(){
      if(choiceState.committed) return;
      if(choiceState.sourceCard && String(choiceState.sourceCard.id || '') === '82' && typeof getFelicitaLandscapeChangeBlockReason === 'function') {
        const blockReason = getFelicitaLandscapeChangeBlockReason(entry.id);
        if(blockReason) {
          if(typeof showFelicitaLandscapeChangeBlockedBanner === 'function') showFelicitaLandscapeChangeBlockedBanner(blockReason);
          return;
        }
      }
      choiceState.committed = true;
      document.querySelectorAll('#modal .landscape-choice-card').forEach(function(choiceCard){ choiceCard.disabled = true; });
      closeModal();
      if(typeof onChoose === 'function') onChoose(entry.song, entry.landscape, entry.num);
    }});
  });
  if(currentPage < maxPage) actions.push({label:'Next', action:function(){ showLandscapeChoiceModal(currentPage + 1, onChoose, choiceState); }});
  actions.push({label:'Cancel', action:closeModal});
  showModal('Choose Landscape', body, actions);
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox) modalBox.classList.add('landscape-choice-modal');
  const modalBody = document.getElementById('modal-body');
  if(modalBody) {
    modalBody.querySelectorAll('.landscape-choice-card[data-landscape-action-index]').forEach(function(cardEl){
      cardEl.addEventListener('click', function(e){
        const idx = Number(cardEl.dataset.landscapeActionIndex);
        const modalActions = Array.isArray(window.__fateCurrentModalActions) ? window.__fateCurrentModalActions : actions;
        const action = modalActions[idx];
        if(action && typeof action.action === 'function') action.action(e);
      });
    });
  }
}
window.showLandscapeChoiceModal = showLandscapeChoiceModal;

function triggerLandscapeFlash(label, sfxKind) {
  const panel = document.getElementById('landscape-panel');
  if(sfxKind !== 'none' && sfxKind !== false && typeof playSfx === 'function') {
    const now = Date.now();
    const type = sfxKind === 'major' ? 'landscapeMajor' : 'landscapePulse';
    if(!triggerLandscapeFlash._lastSfxAt) triggerLandscapeFlash._lastSfxAt = {};
    if(now - (triggerLandscapeFlash._lastSfxAt[type] || 0) > 180) {
      triggerLandscapeFlash._lastSfxAt[type] = now;
      playSfx(type);
    }
  }
  if(!panel) return;
  panel.classList.remove('landscape-flash');
  void panel.offsetWidth;
  panel.classList.add('landscape-flash');
  if(label) panel.dataset.flashLabel = label;
  clearTimeout(panel.__landscapeFlashTimer);
  panel.__landscapeFlashTimer = setTimeout(function(){ panel.classList.remove('landscape-flash'); }, 760);
}

function getAllBoardCardEntries(filter) {
  const entries = [];
  if(!G || !G.board) return entries;
  G.board.forEach(function(zone, z){
    if(!zone) return;
    zone.forEach(function(row, r){
      if(!row) return;
      row.forEach(function(card, c){
        if(card && (!filter || filter(card, z, r, c))) entries.push({card, z, r, c});
      });
    });
  });
  return entries;
}

function getSantaAnnaProsperityTargets(player) {
  if(player !== 0 && player !== 1) return [];
  if(!(typeof isLandscapeActive === 'function' && isLandscapeActive('igb16'))) return [];
  return getAllBoardCardEntries(function(card, z, r, c){
    if(!card || card.owner !== player || isFaceDownCard(card)) return false;
    return true;
  });
}

function resolveSantaAnnaProsperity(card, targetPayload) {
  const payloadPlayer = targetPayload && Number.isInteger(targetPayload.playerIndex) ? targetPayload.playerIndex : null;
  const player = payloadPlayer !== null ? payloadPlayer : (G._onlineRoomCode
    ? (Number.isInteger(G.localPlayerIndex) ? G.localPlayerIndex : G._onlinePlayerIndex)
    : getPerspectivePlayerIndex());
  if(player !== 0 && player !== 1 || !card) return false;
  const hand = G.players && G.players[player] ? G.players[player].hand : null;
  if(!Array.isArray(hand)) return false;
  let handIndex = hand.findIndex(function(c){ return c && card.iid && c.iid === card.iid; });
  if(handIndex < 0) handIndex = hand.findIndex(function(c){ return c && c.id === card.id; });
  if(handIndex < 0) return false;
  if(card.id==='70' && card.guerilla_transferred){
    toast('Wine Country Guerilla cannot be discarded while infiltrating.');
    return false;
  }
  const target = targetPayload && typeof targetPayload.z === 'number'
    ? { z:targetPayload.z, r:targetPayload.r, c:targetPayload.c, card:G.board?.[targetPayload.z]?.[targetPayload.r]?.[targetPayload.c] || null }
    : null;
  if(!target || !target.card || target.card.owner !== player || isFaceDownCard(target.card)) return false;
  const legal = getSantaAnnaProsperityTargets(player).some(function(entry){
    return entry.z === target.z && entry.r === target.r && entry.c === target.c && entry.card && entry.card.iid === target.card.iid;
  });
  if(!legal) {
    toast('Santa Anna can only increase Fate on cards you control.');
    return false;
  }
  const discarded = hand.splice(handIndex, 1)[0];
  fatePushDiscard(player, discarded);
  modifyFate(target.card, 3, 'permanent');
  G.selectedHandCard = null;
  if(typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('Santa Anna: Prosperity of a Treasure Port', 'minor');
  toast('Santa Anna: ' + discarded.name + ' was discarded. ' + target.card.name + ' gains 3 Fate.');
  renderGame({board:true, hand:true, scores:true, piles:true, landscape:true, topbar:true});
  return true;
}

function activateSantaAnnaProsperityFromHand(card, targetPayload) {
  if(!(typeof isLandscapeActive === 'function' && isLandscapeActive('igb16'))) {
    toast('Santa Anna is not the current landscape.');
    return false;
  }
  if(!card) return false;
  if(targetPayload) return resolveSantaAnnaProsperity(card, targetPayload);
  const player = G._onlineRoomCode
    ? (Number.isInteger(G.localPlayerIndex) ? G.localPlayerIndex : G._onlinePlayerIndex)
    : getPerspectivePlayerIndex();
  if(player !== 0 && player !== 1 || G._isSpectator || G._onlineRole === 'spectator') return false;
  const hand = G.players && G.players[player] ? G.players[player].hand : null;
  const handIndex = Array.isArray(hand) ? hand.findIndex(function(c){ return c && card.iid && c.iid === card.iid; }) : -1;
  if(handIndex < 0) {
    toast('Select a card in your hand to discard.');
    return false;
  }
  const targets = getSantaAnnaProsperityTargets(player);
  if(!targets.length) {
    toast('No cards on your side can gain Fate.');
    return false;
  }
  closeModal();
  showBoardTargetPicker({
    title:'Prosperity of a Treasure Port',
    prompt:'Select one card you control to gain 3 Fate.',
    confirmLabel:'+3 Fate',
    maxCount:1,
    viewerPlayerIndex:player,
    zones:[0,1,2],
    entries:targets
  }, function(selected){
    const target = selected && selected[0] ? selected[0] : null;
    if(!target) return;
    const handSnapshot = { index:handIndex, iid:card.iid || '', id:card.id || '' };
    const payload = {
      z:target.z,
      r:target.r,
      c:target.c,
      iid:target.card && target.card.iid,
      id:target.card && target.card.id,
      name:target.card && target.card.name,
      playerIndex:player
    };
    const applied = resolveSantaAnnaProsperity(card, payload);
    if(applied && G._onlineRoomCode && typeof window.__fateSendSantaAnnaAction === 'function') {
      window.__fateSendSantaAnnaAction(handSnapshot, payload);
    }
  });
  return true;
}
window.activateSantaAnnaProsperityFromHand = activateSantaAnnaProsperityFromHand;

function landscapeZonePromptKey(player, title, opts) {
  opts = opts || {};
  if(opts.promptKey) return String(opts.promptKey);
  const landscape = typeof getCurrentLandscape === 'function' ? getCurrentLandscape() : null;
  const matchKey = G && (G._onlineSeed || G._onlineRoomCode || G._matchStartedAt || G._turnStartedAt || G.song || G.landscapeId) || 'local';
  return [
    String(matchKey),
    String(G && G.landscapeId || landscape && landscape.id || ''),
    String(G && G.turn || 0),
    String(player),
    String(opts.kind || 'zone'),
    String(title || 'Choose Zone')
  ].join('|');
}

function landscapeZonePromptRegistry() {
  if(!window.__fateLandscapeZonePromptRegistry) {
    window.__fateLandscapeZonePromptRegistry = {active:Object.create(null), resolved:Object.create(null)};
  }
  return window.__fateLandscapeZonePromptRegistry;
}

function pruneLandscapeZonePromptRegistry(registry) {
  const cutoff = Date.now() - (10 * 60 * 1000);
  Object.keys(registry.resolved).forEach(function(key){
    if(Number(registry.resolved[key] || 0) < cutoff) delete registry.resolved[key];
  });
}

function isLandscapeZonePromptGuarded(key) {
  const registry = landscapeZonePromptRegistry();
  pruneLandscapeZonePromptRegistry(registry);
  return !!(registry.active[key] || registry.resolved[key]);
}

function beginLandscapeZonePrompt(key) {
  const registry = landscapeZonePromptRegistry();
  pruneLandscapeZonePromptRegistry(registry);
  if(registry.active[key] || registry.resolved[key]) return null;
  const token = {key:String(key), openedAt:Date.now(), settled:false};
  registry.active[key] = token;
  return token;
}

function finishLandscapeZonePrompt(token) {
  if(!token || token.settled) return false;
  token.settled = true;
  const registry = landscapeZonePromptRegistry();
  if(registry.active[token.key] === token) delete registry.active[token.key];
  registry.resolved[token.key] = Date.now();
  return true;
}

function releaseLandscapeZonePrompt(keyOrToken) {
  const key = String(keyOrToken && keyOrToken.key || keyOrToken || '');
  if(!key) return false;
  const registry = landscapeZonePromptRegistry();
  if(registry.active[key]) registry.active[key].settled = true;
  delete registry.active[key];
  delete registry.resolved[key];
  return true;
}

window.fateLandscapeZonePromptKey = landscapeZonePromptKey;
window.fateIsLandscapeZonePromptGuarded = isLandscapeZonePromptGuarded;
window.fateBeginLandscapeZonePrompt = beginLandscapeZonePrompt;
window.fateFinishLandscapeZonePrompt = finishLandscapeZonePrompt;
window.fateReleaseLandscapeZonePrompt = releaseLandscapeZonePrompt;

function chooseLandscapeZone(player, title, subtitle, onChoose, opts) {
  opts = opts || {};
  const available = [0, 1, 2].filter(function(z){
    return true;
  });
  if(!available.length) {
    toast('No zones can receive that landscape effect.');
    if(typeof onChoose === 'function') onChoose(null);
    return;
  }
  if(G.aiEnabled && player === G.aiPlayer) {
    let best = available[0];
    if(opts.kind === 'fate') {
      best = available.slice().sort(function(a,b){
        return (getZoneScore(b, 1-player) - getZoneScore(b, player)) - (getZoneScore(a, 1-player) - getZoneScore(a, player));
      })[0];
    } else {
      best = available.slice().sort(function(a,b){ return getZoneScore(b, player) - getZoneScore(a, player); })[0];
    }
    if(typeof onChoose === 'function') onChoose(best);
    return;
  }
  const promptKey = landscapeZonePromptKey(player, title, opts);
  const guardToken = opts._landscapePromptGuardToken || beginLandscapeZonePrompt(promptKey);
  if(!guardToken || guardToken.key !== promptKey || guardToken.settled) return false;
  const body =
    '<div class="landscape-zone-picker">' +
      '<div class="landscape-zone-subtitle">' + escapeHtml(subtitle || '') + '</div>' +
      '<div class="landscape-zone-buttons">' +
        available.map(function(z){
          const s0 = typeof getZoneScore === 'function' ? getZoneScore(z, 0) : 0;
          const s1 = typeof getZoneScore === 'function' ? getZoneScore(z, 1) : 0;
          return '<button type="button" class="landscape-zone-choice" data-zone="' + z + '">' +
            '<span>Zone ' + (z + 1) + '</span>' +
            '<em>' + s0 + ' vs ' + s1 + '</em>' +
          '</button>';
        }).join('') +
      '</div>' +
    '</div>';
  try {
    showModal(title || 'Choose Zone', body, [{label:'Wait', action:function(){}}], {immediate:true});
  } catch(err) {
    releaseLandscapeZonePrompt(guardToken);
    throw err;
  }
  const modal = document.getElementById('modal');
  if(modal) modal.dataset.landscapePromptKey = promptKey;
  const acts = document.getElementById('modal-acts');
  if(acts) acts.innerHTML = '';
  let choiceCommitted = false;
  document.querySelectorAll('#modal .landscape-zone-choice').forEach(function(btn){
    btn.onclick = function(){
      if(choiceCommitted || guardToken.settled) return;
      choiceCommitted = true;
      document.querySelectorAll('#modal .landscape-zone-choice').forEach(function(choiceBtn){ choiceBtn.disabled = true; });
      const z = Number(btn.dataset.zone);
      finishLandscapeZonePrompt(guardToken);
      closeModal();
      if(typeof onChoose === 'function') onChoose(z);
    };
  });
  return true;
}
window.chooseLandscapeZone = chooseLandscapeZone;

function maybeResolveLandscapeEndTurn() {
  const landscape = typeof getCurrentLandscape === 'function' ? getCurrentLandscape() : null;
  const st = typeof getLandscapeState === 'function' ? getLandscapeState() : null;
  if(!landscape || !st || !st.resolvedTurns) return false;

  function shouldAutoChooseLandscapeZone(player) {
    if(!G) return false;
    if(G.aiEnabled && Number.isInteger(G.aiPlayer) && player === G.aiPlayer) return true;
    const viewer = typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : G.currentPlayer;
    return !!(G.aiEnabled && player !== viewer);
  }

  function continueTurnAfterLandscapeResolution(){
    setTimeout(function(){
      if(G) G._turnInputLockUntil = 0;
      endTurn();
    }, 160);
  }

  function chooseBestLandscapeZoneForAI(player, opts) {
    const zones = [0, 1, 2].filter(function(zoneIndex){
      if(!opts || !opts.requireOpenExtraRow) return true;
      return !!(G.board && G.board[zoneIndex]);
    });
    if(!zones.length) return 0;
    return zones.map(function(zoneIndex){
      const myScore = typeof getZoneScore === 'function' ? getZoneScore(zoneIndex, player) : 0;
      const oppScore = typeof getZoneScore === 'function' ? getZoneScore(zoneIndex, 1 - player) : 0;
      const friendlyCards = G.board && G.board[zoneIndex]
        ? G.board[zoneIndex].reduce(function(total, row){
            return total + (Array.isArray(row) ? row.filter(function(card){ return card && card.owner === player; }).length : 0);
          }, 0)
        : 0;
      return {zone:zoneIndex, value:(friendlyCards * 8) + Math.max(0, myScore - oppScore) + myScore};
    }).sort(function(a,b){ return b.value - a.value; })[0].zone;
  }

  if(landscape.id === 'igb2' && G.turn >= 14 && !st.resolvedTurns.igb2) {
    st.resolvedTurns.igb2 = true;
    if(typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('Landscape resolving', 'major');
    const c0 = Number(st.consolidations && st.consolidations[0]) || 0;
    const c1 = Number(st.consolidations && st.consolidations[1]) || 0;
    if(c0 === c1) {
      toast('The Frontier of Innovation ends in a tie. No zone gains Fate.');
      if(typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('Landscape resolved');
      return false;
    }
    const winner = c0 > c1 ? 0 : 1;
    let frontierResolved = false;
    const resolveFrontier = function(z){
      if(frontierResolved) return false;
      frontierResolved = true;
      if(typeof z === 'number') {
        addLandscapeZoneFateBonus(winner, z, 12, 'major');
        toast(G.players[winner].name + ' gains 12 Fate in Zone ' + (z + 1) + '.');
      }
      continueTurnAfterLandscapeResolution();
      return true;
    };
    if(shouldAutoChooseLandscapeZone(winner)) resolveFrontier(chooseBestLandscapeZoneForAI(winner, {kind:'fate'}));
    else window.chooseLandscapeZone(winner, 'The Frontier of Innovation', G.players[winner].name + ' consolidated more times. Choose a zone to gain 12 Fate.', resolveFrontier, {kind:'fate'});
    return true;
  }

  if(landscape.id === 'igb8' && G.turn >= 10 && !st.resolvedTurns.igb8) {
    st.resolvedTurns.igb8 = true;
    if(typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('Landscape resolving', 'major');
    const z = typeof st.targetZone === 'number' ? st.targetZone : 0;
    const s0 = getZoneScore(z, 0);
    const s1 = getZoneScore(z, 1);
    if(s0 === s1) {
      toast('Qingdao is tied. No extra row is created.');
      if(typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('Landscape resolved');
      return false;
    }
    const winner = s0 > s1 ? 0 : 1;
    let qingdaoResolved = false;
    const resolveQingdao = function(targetZ){
      if(qingdaoResolved) return false;
      qingdaoResolved = true;
      if(typeof targetZ === 'number') {
        addFullExtraSafeRowForPlayer(targetZ, winner, 'Qingdao extra row', {sfxKind:'major'});
        toast(G.players[winner].name + ' gains an extra safe row in Zone ' + (targetZ + 1) + '.');
        renderGame({board:true, scores:true, blocks:true, landscape:true});
      }
      continueTurnAfterLandscapeResolution();
      return true;
    };
    if(shouldAutoChooseLandscapeZone(winner)) resolveQingdao(chooseBestLandscapeZoneForAI(winner, {kind:'row', requireOpenExtraRow:true}));
    else window.chooseLandscapeZone(winner, 'Qingdao Breakthrough', G.players[winner].name + ' controls more Fate in Zone ' + (z + 1) + '. Choose a zone for an extra safe row.', resolveQingdao, {kind:'row', requireOpenExtraRow:true});
    return true;
  }
  return false;
}

function queueLandscapeOutsideDrawBonus(player, drawnCard) {
  if(!(typeof isLandscapeActive === 'function' && isLandscapeActive('igb9'))) return false;
  if(G && G._onlineRoomCode) {
    const localPlayer = Number(G._onlinePlayerIndex);
    if(!Number.isInteger(localPlayer) || Number(player) !== localPlayer || G._onlineApplyingRemoteAction) return false;
  }
  if(!G._landscapeDrawQueue) G._landscapeDrawQueue = [];
  G._landscapeDrawQueue.push({player:player, cardName:drawnCard && drawnCard.name || 'a card'});
  processLandscapeDrawQueue();
  return true;
}

function resolveLiveLandscapeDrawTarget(choice) {
  if(!choice || !G || !G.board) return null;
  const z = Number(choice.z);
  const r = Number(choice.r);
  const c = Number(choice.c);
  const chosenIid = String(choice.card?.iid ?? choice.iid ?? '');
  if(Number.isInteger(z) && Number.isInteger(r) && Number.isInteger(c)) {
    const live = G.board?.[z]?.[r]?.[c] || null;
    if(live && (!chosenIid || String(live.iid ?? '') === chosenIid)) return {card:live, z, r, c};
  }
  if(chosenIid) {
    const byIid = getAllBoardCardEntries(function(card){
      return card && String(card.iid ?? '') === chosenIid;
    });
    if(byIid.length) return byIid[0];
  }
  // Offline board objects are stable, so preserve the legacy fallback there.
  if(!G._onlineRoomCode && choice.card) return {card:choice.card, z, r, c};
  return null;
}

function processLandscapeDrawQueue() {
  if(!G._landscapeDrawQueue || !G._landscapeDrawQueue.length || G._landscapeDrawPromptOpen) return;
  const presenter = window.FateActionPresentation;
  if(presenter && typeof presenter.isActive === 'function' && presenter.isActive()) {
    if(typeof presenter.waitForIdle === 'function') {
      presenter.waitForIdle({minQuietMs:90, timeoutMs:5200}).then(function(){
        setTimeout(processLandscapeDrawQueue, 0);
      });
    } else {
      setTimeout(processLandscapeDrawQueue, 180);
    }
    return;
  }
  if(document.getElementById('modal')?.classList.contains('on')) {
    setTimeout(processLandscapeDrawQueue, 180);
    return;
  }
  const item = G._landscapeDrawQueue.shift();
  const entries = getAllBoardCardEntries(function(card){ return card && !isFaceDownCard(card); });
  if(!entries.length) return;
  G._landscapeDrawPromptOpen = true;
  let drawPromptSettled = false;
  const finish = function(){
    if(drawPromptSettled) return false;
    drawPromptSettled = true;
    G._landscapeDrawPromptOpen = false;
    if(G._landscapeDrawQueue && G._landscapeDrawQueue.length) setTimeout(processLandscapeDrawQueue, 120);
    return true;
  };
  if(G.aiEnabled && item.player === G.aiPlayer) {
    const target = entries.filter(e=>e.card.owner===item.player).sort(function(a,b){
      return (getEffectiveFate(b.card, b.z) || 0) - (getEffectiveFate(a.card, a.z) || 0);
    })[0] || entries[0];
    modifyFate(target.card, 3, 'permanent');
    toast('West Coast Dreaming: ' + target.card.name + ' gains 3 Fate.');
    if(typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('West Coast Dreaming', 'minor');
    renderGame({board:true, scores:true, landscape:true});
    finish();
    return;
  }
  showBoardTargetPicker({
    title:'West Coast Dreaming',
    prompt:'You drew outside the Draw Phase. Select any card on the field to gain 3 Fate, or cancel.',
    maxCount:1,
    confirmLabel:'+3 Fate',
    viewerPlayerIndex:getPerspectivePlayerIndex(),
    zones:[0,1,2],
    entries:entries,
    showOpponentOverlay:true,
    onlineClientOwnedChoice:true,
    allowOptionalCancelServerAction:true,
    onCancel:finish
  }, function(chosen){
    if(!finish()) return;
    const targetEntry = resolveLiveLandscapeDrawTarget(chosen && chosen[0]);
    const target = targetEntry && targetEntry.card;
    if(target) {
      modifyFate(target, 3, 'permanent');
      toast('West Coast Dreaming: ' + target.name + ' gains 3 Fate.');
      if(typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('West Coast Dreaming', 'minor');
      renderGame({board:true, scores:true, landscape:true});
      if(typeof window.fatePublishClientOwnedState === 'function') {
        window.fatePublishClientOwnedState('west-coast-dreaming-fate-bonus');
      }
    }
  });
}

function createCompactPickerCardElement(card, viewerP, opts) {
  opts = opts || {};
  const visual = getCardVisualData(card, typeof viewerP === 'number' ? viewerP : getPerspectivePlayerIndex(), opts.visualOptions || {});
  const el = document.createElement('div');
  el.className = opts.className || 'mc visual-mc';
  if(opts.selected) el.classList.add('sel');
  el.dataset.iid = String(card && card.iid != null ? card.iid : '');
  el.dataset.cardId = String(card && card.id != null ? card.id : '');
  el.title = opts.title || ((visual.ability || visual.name || '') + (visual.effect ? ' - ' + visual.effect : ''));
  el.setAttribute('aria-label', visual.name || 'Card');
  if(opts.clickable !== false) el.style.cursor = 'pointer';

  const art = document.createElement('div');
  art.className = 'mc-art';
  if(visual.img) {
    const img = document.createElement('img');
    img.src = visual.img;
    img.alt = visual.name || '';
    img.loading = opts.loading || 'eager';
    img.decoding = 'async';
    if(opts.fetchPriority) img.fetchPriority = opts.fetchPriority;
    art.appendChild(img);
  } else {
    const fallback = document.createElement('span');
    fallback.className = 'mc-ico';
    fallback.textContent = getAffIcon(visual.aff);
    art.appendChild(fallback);
  }
  el.appendChild(art);

  if(opts.showFate) {
    const fate = document.createElement('div');
    fate.className = 'mc-fate';
    fate.textContent = typeof getPrintedFateLabel === 'function' ? getPrintedFateLabel(card) : (card.xFate ? 'X' : card.fate);
    el.appendChild(fate);
  }

  el.__fateVisualData = visual;
  return el;
}

function showCanvasCardGalleryModal(title, cards, opts) {
  opts = opts || {};
  if(!opts.immediate){
    const wait = (typeof getInteractionAnimationDelayMs === 'function' ? getInteractionAnimationDelayMs() : getPlacementUiDelayMs());
    if(wait > 0){
      setTimeout(function(){ showCanvasCardGalleryModal(title, cards, opts); }, wait);
      return;
    }
  }
  cards = Array.isArray(cards) ? cards : [];
  if(!cards.length) {
    showModal(title, '<div style="text-align:center;padding:2rem;color:var(--dim);font-style:italic;">No cards to show</div>', [{label:'Close', action:closeModal}], {immediate:true, silentOpen:!!opts.silentOpen});
    return;
  }

  showModal(title, '', [{label:'Close', action:closeModal}], {immediate:true, silentOpen:!!opts.silentOpen});
  const body = document.createElement('div');
  body.className = 'canvas-card-gallery visual-picker-v2';
  body.innerHTML =
    '<canvas class="canvas-card-gallery-surface" width="720" height="420" style="width:100%;max-width:720px;display:block;margin:0 auto;border-radius:10px;background:transparent;"></canvas>'+
    '<div class="canvas-card-gallery-footer" style="display:flex;align-items:center;justify-content:center;gap:1rem;margin-top:.7rem;color:var(--dim);font-family:Cinzel,serif;font-size:.78rem;"></div>'+
    (opts.hideCountText ? '' : '<p style="font-size:.75rem;color:var(--dim);text-align:center;margin-top:.45rem;">'+cards.length+' card'+(cards.length!==1?'s':'')+'</p>');
  const modalBody = document.getElementById('modal-body');
  if(modalBody) {
    modalBody.innerHTML = '';
    modalBody.appendChild(body);
  }

  const canvas = body.querySelector('.canvas-card-gallery-surface');
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d', { alpha:true }) : null;
  const footer = body.querySelector('.canvas-card-gallery-footer');
  const imageCache = new Map();
  let hitboxes = [];
  let page = 0;
  const perPage = 8;
  const totalPages = Math.max(1, Math.ceil(cards.length / perPage));
  let drawToken = 0;
  const viewerP = typeof opts.viewerPlayerIndex === 'number' ? opts.viewerPlayerIndex : getPerspectivePlayerIndex();

  function roundPath(x, y, w, h, r) {
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr, y);
    ctx.lineTo(x+w-rr, y);
    ctx.quadraticCurveTo(x+w, y, x+w, y+rr);
    ctx.lineTo(x+w, y+h-rr);
    ctx.quadraticCurveTo(x+w, y+h, x+w-rr, y+h);
    ctx.lineTo(x+rr, y+h);
    ctx.quadraticCurveTo(x, y+h, x, y+h-rr);
    ctx.lineTo(x, y+rr);
    ctx.quadraticCurveTo(x, y, x+rr, y);
    ctx.closePath();
  }
  function cover(img, x, y, w, h) {
    const srcRatio = img.width / Math.max(1, img.height);
    const dstRatio = w / Math.max(1, h);
    let sx = 0, sy = 0, sw = img.width, sh = img.height;
    if(srcRatio > dstRatio) {
      sw = img.height * dstRatio;
      sx = (img.width - sw) / 2;
    } else {
      sh = img.width / dstRatio;
      sy = Math.max(0, (img.height - sh) * 0.25);
      if(sy + sh > img.height) sy = img.height - sh;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }
  function load(src, token) {
    if(!src || imageCache.has(src)) return;
    const img = new Image();
    img.decoding = 'async';
    img.onload = function(){ imageCache.set(src, img); if(token === drawToken) draw(); };
    img.onerror = function(){ imageCache.set(src, null); };
    imageCache.set(src, img);
    img.src = src;
  }
  function point(ev) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    return {
      x: (ev.clientX - rect.left) * (canvas.width / Math.max(1, rect.width)) / dpr,
      y: (ev.clientY - rect.top) * (canvas.height / Math.max(1, rect.height)) / dpr
    };
  }
  function hit(ev) {
    const p = point(ev);
    for(let i=hitboxes.length-1; i>=0; i--) {
      const h = hitboxes[i];
      if(p.x >= h.x && p.x <= h.x+h.w && p.y >= h.y && p.y <= h.y+h.h) return h;
    }
    return null;
  }
  function draw() {
    if(!ctx) return;
    drawToken++;
    const token = drawToken;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const cssW = 720, cols = 4, rows = 2, gap = 14, pad = 14;
    const cardW = Math.floor((cssW - pad*2 - gap*(cols-1)) / cols);
    const cardH = Math.floor(cardW * 1.4);
    const cssH = pad*2 + rows*cardH + gap*(rows-1);
    const pxW = Math.round(cssW * dpr), pxH = Math.round(cssH * dpr);
    if(canvas.width !== pxW || canvas.height !== pxH) { canvas.width = pxW; canvas.height = pxH; }
    canvas.style.height = cssH + 'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,cssW,cssH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    hitboxes = [];
    const start = page * perPage;
    const end = Math.min(start + perPage, cards.length);
    for(let i=start; i<end; i++) {
      const card = cards[i];
      const visual = getCardVisualData(card, viewerP);
      const local = i - start;
      const x = pad + (local % cols) * (cardW + gap);
      const y = pad + Math.floor(local / cols) * (cardH + gap);
      hitboxes.push({x,y,w:cardW,h:cardH,card,visual});
      ctx.save();
      roundPath(x,y,cardW,cardH,8);
      ctx.clip();
      ctx.fillStyle = '#080910';
      ctx.fillRect(x,y,cardW,cardH);
      const galleryImg = opts.imageRole && card.img && typeof getRuntimeCardImageSrc === 'function'
        ? getRuntimeCardImageSrc(card.img, opts.imageRole)
        : visual.img;
      if(galleryImg) {
        const cached = imageCache.get(galleryImg);
        if(cached && cached.complete && cached.naturalWidth !== 0) cover(cached,x,y,cardW,cardH);
        else { load(galleryImg, token); ctx.fillStyle='rgba(214,180,89,.08)'; ctx.fillRect(x,y,cardW,cardH); }
      } else {
        ctx.fillStyle='rgba(214,180,89,.10)';
        ctx.fillRect(x,y,cardW,cardH);
        ctx.fillStyle='rgba(236,224,190,.55)';
        ctx.font='32px serif';
        ctx.textAlign='center';
        ctx.textBaseline='middle';
        ctx.fillText(getAffIcon(visual.aff), x+cardW/2, y+cardH/2);
      }
      ctx.restore();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(238,205,105,.35)';
      roundPath(x+1,y+1,cardW-2,cardH-2,8);
      ctx.stroke();
    }
    footer.innerHTML = '';
    if(totalPages > 1) {
      const prev = document.createElement('button');
      prev.className = 'btn sm';
      prev.textContent = 'Prev';
      prev.disabled = page === 0;
      prev.onclick = function(){ if(page > 0){ page--; draw(); } };
      const label = document.createElement('span');
      label.textContent = (page+1) + ' / ' + totalPages;
      const next = document.createElement('button');
      next.className = 'btn sm';
      next.textContent = 'Next';
      next.disabled = page >= totalPages - 1;
      next.onclick = function(){ if(page < totalPages - 1){ page++; draw(); } };
      footer.appendChild(prev); footer.appendChild(label); footer.appendChild(next);
    }
  }
  canvas.onclick = function(ev) {
    const h = hit(ev);
    if(h) openCardDetail(h.card);
  };
  canvas.onmousemove = function(ev) {
    const h = hit(ev);
    canvas.style.cursor = h ? 'pointer' : 'default';
    if(h) { showHoverPreview(h.visual, ev); positionHoverPreview(ev); }
    else removeHoverPreview();
  };
  canvas.onmouseleave = function(){ removeHoverPreview(); canvas.style.cursor = 'default'; };
  canvas.oncontextmenu = function(ev) {
    const h = hit(ev);
    if(!h) return;
    ev.preventDefault();
    ev.stopPropagation();
    removeHoverPreview();
    showCardInfoOverlay(h.card);
  };
  draw();
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox) {
    modalBox.classList.add('visual-card-picker-modal');
    modalBox.style.maxWidth = '880px';
  }
}

function renderOppHand() {
  // Show opponent's hand — revealed cards face-up, others face-down
  const container = document.getElementById('opp-hand');
  if(!container) return;
  if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.ownsOpponentHand === 'function' && window.FateMatchRendererAdapter.ownsOpponentHand()){
    const oppP = getPerspectiveOpponentIndex();
    const oppHand = G.players[oppP].hand;
    applyOpponentHandDensity(container, oppHand.length);
    if(container.firstChild) container.textContent = '';
    container.style.cursor = '';
    container.onclick = null;
    const lbl=document.getElementById('opp-hand-lbl');
    if(lbl) lbl.innerHTML=G.players[oppP].name+"'s Hand <span style='color:var(--dim);font-family:\"Crimson Pro\",serif;font-weight:400;font-size:.65rem;'>("+oppHand.length+")</span>";
    if(typeof window.FateMatchRendererAdapter.scheduleRender === 'function') window.FateMatchRendererAdapter.scheduleRender('renderOppHand');
    else window.FateMatchRendererAdapter.renderFromGameState({opponentHand:true, source:'renderOppHand'});
    return;
  }
  const nextSig = getOppHandRenderSignature();
  if(nextSig === _lastOppHandRenderSignature && container.children.length) return;
  _lastOppHandRenderSignature = nextSig;
  const oppP = getPerspectiveOpponentIndex();
  const oppHand = G.players[oppP].hand;
  applyOpponentHandDensity(container, oppHand.length);
  const revealed = G._revealedCards || {};
  const landscapeRevealsHands = typeof isLandscapeActive === 'function' && isLandscapeActive('igb12');
  const hasRevealed = landscapeRevealsHands || oppHand.some(c => revealed[c.iid]);
  const existingByIid = new Map();
  Array.from(container.children).forEach(function(child){
    if(child && child.dataset && child.dataset.iid) existingByIid.set(child.dataset.iid, child);
  });
  const frag = document.createDocumentFragment();
  oppHand.forEach((card,i)=>{
    const iidKey = String(card.iid);
    let el = existingByIid.get(iidKey);
    if(!el) el = document.createElement('div');
    el.dataset.iid = iidKey;
    if(landscapeRevealsHands || revealed[card.iid]) {
      // Show face-up with card art
      if(el.className !== 'opp-card-back opp-revealed') el.className='opp-card-back opp-revealed';
      const revealedStyle = 'width:var(--opp-hand-card-w,60px);height:var(--opp-hand-card-h,84px);border-radius:5px;flex-shrink:0;overflow:hidden;position:relative;border:1.5px solid rgba(255,180,50,.6);box-shadow:0 3px 10px rgba(0,0,0,.6),0 0 8px rgba(255,180,50,.25);cursor:pointer;transition:transform .15s;';
      if(el.style.cssText !== revealedStyle) el.style.cssText = revealedStyle;
      const oppImg = card.img ? getRuntimeCardImageSrc(card.img, 'detail') : '';
      const visualSig = [oppImg || '', card.name || ''].join('|');
      if(el.__fateOppHandVisualSig !== visualSig){
        el.__fateOppHandVisualSig = visualSig;
        el.innerHTML=(oppImg?'<img src="'+oppImg+'" style="width:100%;height:100%;object-fit:cover;object-position:center 25%;image-rendering:auto;" decoding="async" loading="eager" fetchpriority="high">':'<div style="display:flex;align-items:center;justify-content:center;height:100%;background:#0a0a0f;font-size:.6rem;color:var(--dim);">'+escapeHtml(card.name)+'</div>');
      }
      el.onclick=(ev)=>{ ev.stopPropagation(); openCardDetail(card); };
      el.title=card.name+' (revealed)';
    } else {
      if(el.className !== 'opp-card-back') el.className='opp-card-back';
      if(el.style.cssText) el.style.cssText = '';
      if(el.__fateOppHandVisualSig !== 'hidden'){
        el.__fateOppHandVisualSig = 'hidden';
        el.innerHTML = '';
      }
      el.onclick = null;
      el.removeAttribute('title');
    }
    frag.appendChild(el);
  });
  container.appendChild(frag);
  Array.from(container.children).forEach(function(child){
    if(!child.dataset || !oppHand.some(function(card){ return String(card.iid) === child.dataset.iid; })) child.remove();
  });
  // Make entire opponent hand area clickable to view revealed cards
  if(hasRevealed) {
    container.style.cursor = 'pointer';
    container.onclick = () => { if(typeof showRevealedHandWindow==='function') showRevealedHandWindow(oppP); };
  } else {
    container.style.cursor = '';
    container.onclick = null;
  }
  // Update label
  const lbl=document.getElementById('opp-hand-lbl');
  if(lbl) lbl.innerHTML=G.players[oppP].name+"'s Hand <span style='color:var(--dim);font-family:\"Crimson Pro\",serif;font-weight:400;font-size:.65rem;'>("+oppHand.length+")</span>";
}

// Show deck info (count + no content reveal — this is hidden info)
function showDeckInfo(player) {
  if(typeof window.playFateSfxOnce === 'function') window.playFateSfxOnce('uiClick', 'pile-inspect', 500);
  else if(typeof playSfx === 'function') playSfx('uiClick');
  const perspectivePlayer = typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : (G && typeof G.currentPlayer === 'number' ? G.currentPlayer : 0);
  const isDevDeckOwner = isPerspectivePlayer(player) || Number(player) === Number(perspectivePlayer) || (typeof G !== 'undefined' && G && typeof G.localPlayerIndex === 'number' && Number(player) === Number(G.localPlayerIndex));
  if(typeof isHowardDevMode === 'function' && isHowardDevMode() && isDevDeckOwner){
    showHowardDevDeckList(player);
    return;
  }
  const deck = G.players[player].deck;
  const hand = G.players[player].hand;
  const discard = G.players[player].discard;
  const isOwn = isPerspectivePlayer(player);
  const title = (isOwn ? 'Your' : G.players[player].name+"'s") + ' Deck';
  let boardCount = 0;
  G.board.forEach(function(zone){ zone.forEach(function(row){ if(row) row.forEach(function(cell){ if(cell && cell.owner === player) boardCount++; }); }); });
  const polishCards = isOwn ? deck.filter(c=>c.id==='28' && !c._deckSetNegatedByReaction) : [];
  const polishUses = Array.isArray(G.polishArmyUses) ? (G.polishArmyUses[player]||0) : 0;
  const canSetPolish = isOwn && player===G.currentPlayer && polishCards.length>0 && !G._polishUsedThisTurn && polishUses<2 && G.phase==='main' && !(typeof isSupporterEffectSuppressed === 'function' && isSupporterEffectSuppressed(polishCards[0]));
  const canSetMaja = isOwn && player===G.currentPlayer && deck.some(c=>c.id==='07' && !c._deckSetNegatedByReaction) && G.phase==='main';
  let polishHtml = '';
  if(canSetPolish){
    polishHtml = '<div class="di-action-panel"><div class="di-action-title">2nd Polish-Lithuanian Army</div><div class="di-action-desc">Set directly from deck (' + (2-polishUses) + ' game use' + ((2-polishUses)!==1?'s':'') + ' left)</div><button class="btn sm pri" onclick="setPolishFromDeck()">Set from Deck</button></div>';
  }
  let majaHtml = '';
  if(canSetMaja){
    majaHtml = '<div class="di-action-panel"><div class="di-action-title">Maja Kaminska</div><div class="di-action-desc">Set directly from deck at no cost.</div><button class="btn sm pri" onclick="setMajaFromDeck()">Set from Deck</button></div>';
  }
  const totalCards = deck.length + hand.length + discard.length + boardCount;
  showModal(title,
    '<div class="di-window">'
    + '<div class="di-count-row">'
    +   '<div class="di-count-main"><span class="di-count-num">' + deck.length + '</span><span class="di-count-label">In Deck</span></div>'
    +   '<div class="di-count-stats">'
    +     '<div class="di-stat"><span>' + (isOwn ? hand.length : '?') + '</span>In Hand</div>'
    +     '<div class="di-stat"><span>' + boardCount + '</span>On Board</div>'
    +     '<div class="di-stat"><span>' + discard.length + '</span>Discarded</div>'
    +   '</div>'
    + '</div>'
    + '<div class="di-progress-wrap"><div class="di-progress-bar" style="width:' + Math.round((deck.length / Math.max(1,totalCards)) * 100) + '%"></div><div class="di-progress-label">' + deck.length + ' / ' + totalCards + ' Cards Remaining</div></div>'
    + (isOwn ? '<p class="di-note">Deck contents are hidden — use search effects to look through specific cards.</p>' : '<p class="di-note">Opponent deck contents are hidden.</p>')
    + polishHtml
    + majaHtml
    + '</div>',
    [{label:'Close',action:closeModal}], {immediate:true, silentOpen:true});
}

function showHowardDevDeckList(player) {
  if(!G || !G.players || !G.players[player]) return;
  const cards = (typeof CARDS !== 'undefined' && Array.isArray(CARDS)) ? CARDS.filter(function(card){ return card && card.id; }) : [];
  if(!cards.length){
    showModal('Howard Dev Deck List',
      '<div class="di-window"><p class="di-note">No cards are available.</p></div>',
      [{label:'Close', action:closeModal}], {immediate:true});
    return;
  }
  pickCardsVisual(cards, {
    title: 'Howard Dev Deck List',
    subtitle: 'Select any card in the game to add to your hand.',
    maxCount: cards.length,
    minCount: 0,
    confirmLabel: 'Add to Hand',
    viewerPlayerIndex: player,
    immediate: true
  }, function(chosen){
    if(!chosen || !chosen.length) return;
    let added = 0;
    chosen.forEach(function(card){
      if(!card) return;
      const moved = typeof createCardInstance === 'function'
        ? createCardInstance(card, player)
        : Object.assign({}, card, { owner:player, iid:'dev-' + Date.now() + '-' + Math.random().toString(36).slice(2) });
      G.players[player].hand.push(moved);
      added++;
    });
    if(added && typeof toast === 'function') toast('Added ' + added + ' card' + (added === 1 ? '' : 's') + ' to hand.');
    if(typeof renderGame === 'function') renderGame({ hand:true, piles:true, topbar:true });
  });
}
window.showHowardDevDeckList = showHowardDevDeckList;

window.setPolishFromDeck = function() {
  const cp = G.currentPlayer;
  if(!isPerspectivePlayer(cp)){toast('You can only set from your deck on your turn.');return;}
  const deck = G.players[cp].deck;
  const idx = deck.findIndex(c=>c.id==='28' && !c._deckSetNegatedByReaction);
  if(idx===-1){toast('No Polish-Lithuanian Army in deck');closeModal();return;}
  const card = deck[idx];
  deck.splice(idx,1);
  if(typeof addCardToHand==='function') addCardToHand(cp, card, { announce:false });
  else G.players[cp].hand.push(card);
  if(typeof beginImmediateFreePlacement==='function') {
    beginImmediateFreePlacement(cp, card, 'Place ' + card.name + ' for free from your deck.', {
      key:'polish-lithuanian-deck-set',
      name:'2nd Polish-Lithuanian Army',
      ability:'The Army of Exiles',
      text:'Set directly from your deck at no cost.',
      freePlacementKind:'polishLithuanianDeckSet'
    });
  }
  G._polishUsedThisTurn = true;
  if(!Array.isArray(G.polishArmyUses)) G.polishArmyUses = [0,0];
  G.polishArmyUses[cp] = (G.polishArmyUses[cp]||0)+1;
  closeModal();
  toast('2nd Polish-Lithuanian Army is ready to set immediately for free!');
  renderBoardActionForPlayer(cp, {hand:true, piles:true});
};

window.setMajaFromDeck = function() {
  const cp = G.currentPlayer;
  if(!isPerspectivePlayer(cp)){toast('You can only set from your deck on your turn.');return;}
  const deck = G.players[cp].deck;
  const idx = deck.findIndex(c=>c.id==='07' && !c._deckSetNegatedByReaction);
  if(idx===-1){toast('No Maja Kaminska in deck');closeModal();return;}
  const card = deck[idx];
  deck.splice(idx,1);
  if(typeof addCardToHand==='function') addCardToHand(cp, card, { announce:false });
  else G.players[cp].hand.push(card);
  if(typeof beginImmediateFreePlacement==='function') {
    beginImmediateFreePlacement(cp, card, 'Place Maja Kaminska for free from your deck.', {
      key:'maja-deck-set',
      name:'Maja Kaminska',
      ability:'Oblique Order',
      text:'Set directly from your deck at no cost.',
      freePlacementKind:'majaDeckSet'
    });
  }
  closeModal();
  toast('Maja Kaminska is ready to set immediately for free!');
  renderBoardActionForPlayer(cp, {hand:true, piles:true});
};

// Show discard pile as a grid of card images
function showDiscard(player) {
  if(typeof window.playFateSfxOnce === 'function') window.playFateSfxOnce('uiClick', 'pile-inspect', 500);
  else if(typeof playSfx === 'function') playSfx('uiClick');
  const disc = G.players[player].discard;
  const isOwn = isPerspectivePlayer(player);
  const title = (isOwn ? 'Your' : G.players[player].name+"'s") + ' Discard Pile';
  if(disc.length===0){
    showModal(title,
      '<div style="text-align:center;padding:2rem;color:var(--dim);font-style:italic;">Discard pile is empty</div>',
      [{label:'Close',action:closeModal}], {immediate:true, silentOpen:true});
    return;
  }
  showCanvasCardGalleryModal(title, disc, { viewerPlayerIndex:getPerspectivePlayerIndex(), immediate:true, silentOpen:true });
}

window.showCardFromDiscard = function(player, idx) {
  const c = G.players[player].discard[idx];
  if(c) openCardDetail(c);
};

function renderZoneScoreMarkup(z, s0, s1, ctrl) {
  const total = s0 + s1 || 1;
  const p1pct = Math.round((s0 / total) * 100);
  const p2pct = 100 - p1pct;
  return `<span class="zone-score p1">${s0}</span>
        <span class="zone-score-vs">vs</span>
        <span class="zone-score p2">${s1}</span>
        <span class="zone-score-bar"><span class="zone-score-bar-p1" style="width:${p1pct}%"></span><span class="zone-score-bar-p2" style="width:${p2pct}%"></span></span>`;
}

function getZoneScoreTooltip(z, s0, s1) {
  const base0 = typeof getBaseZoneScore === 'function' ? getCachedBaseZoneScore(z, 0) : s0;
  const base1 = typeof getBaseZoneScore === 'function' ? getCachedBaseZoneScore(z, 1) : s1;
  const mult0 = typeof getPlayerZoneFateMultiplier === 'function' ? getPlayerZoneFateMultiplier(0) : 1;
  const mult1 = typeof getPlayerZoneFateMultiplier === 'function' ? getPlayerZoneFateMultiplier(1) : 1;
  const fmt = typeof formatFateMultiplier === 'function' ? formatFateMultiplier : function(n){ return (Number(n) || 1) + 'x'; };
  return 'Base Fate: P1 ' + base0 + ' / P2 ' + base1 + '\n' +
    'AI Fate Bonus: P1 ' + fmt(mult0) + ' / P2 ' + fmt(mult1) + '\n' +
    'Displayed Fate: P1 ' + s0 + ' / P2 ' + s1;
}

function installBoardClickDelegation(board) {
  if(!board || board.__fateBoardClickDelegated) return;
  board.__fateBoardClickDelegated = true;
  let pendingPointerCell = null;
  let lastHandledBoardClickAt = 0;
  board.addEventListener('pointerdown', function(e){
    const cell = e.target && e.target.closest ? e.target.closest('.cell[data-z][data-r][data-c]') : null;
    if(cell && board.contains(cell)) {
      captureBoardViewportLock();
      if(e.button === 0) {
        pendingPointerCell = {
          z:Number(cell.dataset.z),
          r:Number(cell.dataset.r),
          c:Number(cell.dataset.c),
          x:e.clientX,
          y:e.clientY,
          at:performance.now(),
          startedOnCard: !!(e.target.closest && e.target.closest('.bc'))
        };
      } else {
        pendingPointerCell = null;
      }
    }
  }, {passive:true});
  board.addEventListener('pointerup', function(e){
    if(!pendingPointerCell || e.button !== 0) return;
    const pending = pendingPointerCell;
    pendingPointerCell = null;
    if(Math.abs(e.clientX - pending.x) > 10 || Math.abs(e.clientY - pending.y) > 10) return;
    setTimeout(function(){
      if(performance.now() - lastHandledBoardClickAt < 80) return;
      if(window._lastBcClickAt && performance.now() - window._lastBcClickAt < 300) return;
      var boardCard = (typeof G!=='undefined'&&G&&G.board&&G.board[pending.z]&&G.board[pending.z][pending.r])?G.board[pending.z][pending.r][pending.c]:null;
      captureBoardViewportLock();
      const isCellActionMode = !!(G._consolidating || G.blockingCell || G._boardTargeting || G.placing || G._wolfCreekMoving || G._expMoving || G._berkeleyMoving || G._bh01Moving || G._landscapeMoving || G._busserMoving || G._busserMovingCard || G._markSelecting);
      if(G._isSpectator){
      if(boardCard) openCardDetail(boardCard, false, true);
      } else if(isCellActionMode) {
        clickCell(pending.z, pending.r, pending.c);
      } else if(boardCard && pending.startedOnCard) {
        activateBoardCard(boardCard, pending.z, pending.r, pending.c);
      }
      restoreBoardViewportLockSoon();
      lastHandledBoardClickAt = performance.now();
    }, 90);
  }, {passive:true});
  board.addEventListener('click', function(e){
    lastHandledBoardClickAt = performance.now();
    var cell = e.target && e.target.closest ? e.target.closest('.cell[data-z][data-r][data-c]') : null;
    if(!cell) return;
    var z = Number(cell.dataset.z), r = Number(cell.dataset.r), c = Number(cell.dataset.c);
    var orphaned = !board.contains(cell);
    if(orphaned){
      cell = board.querySelector('.cell[data-z="'+z+'"][data-r="'+r+'"][data-c="'+c+'"]');
      if(!cell) return;
    }
    var isCellTargetingMode = (typeof G !== 'undefined' && G && (G.blockingCell || G._boardTargeting || G._consolidating || G._wolfCreekMoving || G._expMoving || G._berkeleyMoving || G._bh01Moving || G._landscapeMoving || G._busserMoving || G._busserMovingCard || G._markSelecting));
    var clickedBc = e.target.closest && e.target.closest('.bc');
    if(!isCellTargetingMode && clickedBc && !orphaned) return;
    if(!isCellTargetingMode && clickedBc && orphaned){
      var boardCard = (typeof G!=='undefined'&&G&&G.board&&G.board[z]&&G.board[z][r])?G.board[z][r][c]:null;
      if(boardCard){
        captureBoardViewportLock();
        if(G._isSpectator) openCardDetail(boardCard, false, true);
        else activateBoardCard(boardCard,z,r,c);
        restoreBoardViewportLockSoon();
      }
      return;
    }
    captureBoardViewportLock();
    clickCell(z, r, c);
    restoreBoardViewportLockSoon();
  });
}

function patchChangedBoardCells(nextCellSigs, prevCellSigs) {
  if(!nextCellSigs || !prevCellSigs || nextCellSigs.size !== prevCellSigs.size) return false;
  const boardEl = document.getElementById('board');
  if(!boardEl) return false;
  let changed = 0;
  nextCellSigs.forEach(function(sig, key){
    if(prevCellSigs.get(key) !== sig) changed++;
  });
  if(changed === 0) return true;
  if(changed > 18) return false;
  if(window.fateCanvasBoardPauseDrawing) window.fateCanvasBoardPauseDrawing();
  nextCellSigs.forEach(function(sig, key){
    if(prevCellSigs.get(key) === sig) return;
    const parts = key.split(':').map(Number);
    const z = parts[0], r = parts[1], c = parts[2];
    const cellEl = boardEl.querySelector('.cell[data-z="'+z+'"][data-r="'+r+'"][data-c="'+c+'"]');
    if(!cellEl) return;
    const card = G.board?.[z]?.[r]?.[c] || null;
    const reuseMap = collectReusableBoardCards(cellEl);
    const nextCardEl = card ? createBoardCardEl(card, z, r, c, reuseMap) : null;
    Array.from(cellEl.querySelectorAll('.bc')).forEach(function(el){
      if(el !== nextCardEl) el.remove();
    });
    applyBoardCellStateClasses(cellEl, z, r, c, card);
    if(nextCardEl && nextCardEl.parentNode !== cellEl) cellEl.appendChild(nextCardEl);
  });
  if(window.fateCanvasBoardResumeDrawing) window.fateCanvasBoardResumeDrawing();
  return true;
}

function renderBoard() {
  const board = document.getElementById('board');
  if(!board || typeof G === 'undefined' || !G || !G.board) return;
  if(rendererV2OwnsBoardScene()){
    removeRenderV2LegacyLiveVisuals();
    if(typeof window.FateMatchRendererAdapter.scheduleRender === 'function') window.FateMatchRendererAdapter.scheduleRender('renderBoard');
    else window.FateMatchRendererAdapter.renderFromGameState({board:true, source:'renderBoard'});
    return;
  }
  document.documentElement.classList.remove('fate-canvas-board-ready');
  if(document.body) document.body.classList.remove('fate-canvas-board-ready');
  if(window.fateCanvasBoardPauseDrawing) window.fateCanvasBoardPauseDrawing();
  const useCanvasBoardNow = typeof shouldUseCanvasBoardVisuals === 'function' && shouldUseCanvasBoardVisuals();
  document.documentElement.classList.toggle('fate-canvas-board-mode', !!useCanvasBoardNow);
  window.FATE_USE_CANVAS_BOARD = !!useCanvasBoardNow;
  if(!useCanvasBoardNow) {
    const canvas = document.getElementById('fate-board-canvas');
    if(canvas) canvas.style.display = 'none';
  }
  installBoardClickDelegation(board);
  const zoneRowScrollSnap = captureZoneRowScrollSnapshots(board);
  const reusableBoardCards = collectReusableBoardCards(board);
  const frag = document.createDocumentFragment();
  const viewerP = typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : 0;
  const carolynBlockedCells = new Set();
  const zoeBlockedCells = new Set();
  (G.blockedCells || []).forEach(function(b){
    if(!b) return;
    const key = b.z + ':' + b.r + ':' + b.c;
    if(b.type === 'carolyn') carolynBlockedCells.add(key);
    if(b.type === 'zoe') zoeBlockedCells.add(key);
  });
  for(let z=0;z<3;z++){
    const s0=getCachedZoneScore(z,0), s1=getCachedZoneScore(z,1);
    const ctrl=s0>s1?0:s1>s0?1:-1;
    const scoreTip = escapeHtml(getZoneScoreTooltip(z, s0, s1));
    const zoneEl=document.createElement('div');
    zoneEl.className='zone'+(ctrl===0?' zone-p1':ctrl===1?' zone-p2':' zone-tied');
    zoneEl.dataset.zone=z;
    zoneEl.innerHTML=`<div class="zone-banner-over" aria-hidden="true">
      <span class="zone-hdr-ornament">◆</span><span class="zone-title">Zone ${z+1}</span><span class="zone-hdr-ornament">◆</span>
    </div>
    <div class="zone-hdr">
      <span class="zone-hdr-main"><span class="zone-hdr-ornament">◆</span><span class="zone-title">Zone ${z+1}</span><span class="zone-hdr-ornament">◆</span></span>
      <span class="zone-score-card${ctrl>=0?' ctrl':''}" data-zone="${z}" aria-label="${scoreTip}" data-tooltip="${scoreTip}">
        ${renderZoneScoreMarkup(z,s0,s1,ctrl)}
      </span>
    </div>`;
    const extraRowCount = (G.extraRows && G.extraRows[z]) || 0;
    const showMarkChoiceRow = !!(G._markSelecting && (typeof G._markSelecting.zone !== 'number' || G._markSelecting.zone === z));
    const markChoiceRow = showMarkChoiceRow
      ? (Number.isInteger(G._markSelecting.row) ? G._markSelecting.row : (typeof getMarkSafeSquareChoiceRow === 'function' ? getMarkSafeSquareChoiceRow(z, G._markSelecting.player) : 3 + extraRowCount))
      : -1;
    const rowsEl=document.createElement('div');
    rowsEl.className='zone-rows' + ((extraRowCount > 0 || showMarkChoiceRow) ? ' has-extra-rows' : '');
    installZoneRowScrollGuard(rowsEl, z);
    const baseRowClasses=['p2safe','contested','p1safe'];
    const totalRows = Math.max(3 + extraRowCount, showMarkChoiceRow && markChoiceRow >= 3 ? markChoiceRow + 1 : 0);
    const displayRows = viewerP === 1 ? [2,1,0] : [0,1,2];
    for(let r=3;r<totalRows;r++){
      const isMarkChoiceRow = !!(showMarkChoiceRow && r === markChoiceRow);
      const extraRowOwner = isMarkChoiceRow
        ? G._markSelecting.player
        : (typeof getExtraSafeRowOwner === 'function' ? getExtraSafeRowOwner(z, r) : 0);
      if(extraRowOwner === viewerP) displayRows.push(r);
      else displayRows.unshift(r);
    }
    for(const r of displayRows){
      const rowEl=document.createElement('div');
      let rowLabel, rowClass;
      if(r<3){
        const rowOwner = r===0 ? 1 : (r===2 ? 0 : -1);
        rowLabel = rowOwner < 0 ? 'Contested' : (rowOwner === viewerP ? 'Your Side' : 'Opponent');
        rowClass = rowOwner < 0 ? 'contested' : (rowOwner === viewerP ? 'p1safe' : 'p2safe');
      }
      else {
        const fullExtraRow = typeof isFullExtraSafeRow === 'function' && isFullExtraSafeRow(z, r);
        const isMarkChoiceRow = !!(showMarkChoiceRow && r === markChoiceRow);
        const extraRowOwner = isMarkChoiceRow
          ? G._markSelecting.player
          : (typeof getExtraSafeRowOwner === 'function' ? getExtraSafeRowOwner(z, r) : viewerP);
        rowLabel=(extraRowOwner===viewerP?'Your':'Opponent')+(fullExtraRow?' Extra Safe':' Safe Square');
        rowClass=extraRowOwner===viewerP?'p1safe':'p2safe';
      }
      rowEl.className='brow '+rowClass;
      rowEl.innerHTML='<div class="rl">'+rowLabel+'</div>';
      const cells=document.createElement('div');
      cells.className='rcells';
      const boardRow = G.board[z][r] || Array(3).fill(null);
      const extraRow = r<3 ? (G.extraCells?.[z]?.[r] || null) : null;
      const extraCols = extraRow?(r===2?extraRow.p1:(r===0?extraRow.p2:0)):0;
      const totalCols = 3+extraCols;
      for(let c=0;c<totalCols;c++){
        const cellEl=document.createElement('div');
        const blockKey = z + ':' + r + ':' + c;
        const carolynBlocked = carolynBlockedCells.has(blockKey);
        const zoeBlocked = zoeBlockedCells.has(blockKey);
        const card=boardRow[c];
        cellEl.className='cell '+(card ? 'has-card' : 'cell-empty')+(carolynBlocked?' blocked':'')+(zoeBlocked?' no-consolidate':'');
        if(c>=3) cellEl.classList.add('extra-safe');
        const fullExtraRow = typeof isFullExtraSafeRow === 'function' && isFullExtraSafeRow(z, r);
        if(r>=3 && !fullExtraRow){
          if(typeof isMarkSafeSquare === 'function' && isMarkSafeSquare(z,r,c)) cellEl.classList.add('mark-safe-square');
          else if(G._markSelecting && G._markSelecting.player === G.currentPlayer && (typeof G._markSelecting.zone !== 'number' || G._markSelecting.zone === z) && (Number.isInteger(G._markSelecting.row) ? r === G._markSelecting.row : (typeof getMarkSafeSquareChoiceRow !== 'function' || r === getMarkSafeSquareChoiceRow(z, G.currentPlayer)))) cellEl.classList.add('mark-safe-choice');
          else cellEl.classList.add('mark-safe-inactive');
        }
        cellEl.dataset.z=z;cellEl.dataset.r=r;cellEl.dataset.c=c;
        if(card){ cellEl.appendChild(createBoardCardEl(card,z,r,c,reusableBoardCards)); }
        else { /* cell labels removed */ }
        cells.appendChild(cellEl);
      }
      rowEl.appendChild(cells);
      rowsEl.appendChild(rowEl);
    }
    zoneEl.appendChild(rowsEl);
    ['tl','tr','bl','br'].forEach(function(pos){
      const corner = document.createElement('span');
      corner.className = 'zone-edge-corner '+pos;
      zoneEl.appendChild(corner);
    });
    frag.appendChild(zoneEl);
  }
  const existingCanvas = document.getElementById('fate-board-canvas');
  if(existingCanvas && existingCanvas.parentNode === board){
    Array.from(board.children).forEach(function(child){
      if(child !== existingCanvas) child.remove();
    });
    board.insertBefore(frag, existingCanvas);
  } else {
    replaceElementChildren(board, frag);
  }
  restoreZoneRowScrollSnapshots(board, zoneRowScrollSnap);
  syncFloatingZoneBanners();
  if(useCanvasBoardNow && window.fateRenderBoardCanvas) window.fateRenderBoardCanvas();
}

function syncFloatingZoneBanners(){
  const center = document.querySelector('#s-game .game-center');
  const board = document.getElementById('board');
  if(!center || !board) return;
  let layer = document.getElementById('zone-floating-banners');
  if(!layer){
    layer = document.createElement('div');
    layer.id = 'zone-floating-banners';
    layer.className = 'zone-floating-banners';
    center.appendChild(layer);
  }
  if(window.__fateFloatingZoneBannerRaf) cancelAnimationFrame(window.__fateFloatingZoneBannerRaf);
  window.__fateFloatingZoneBannerRaf = requestAnimationFrame(function(){
    window.__fateFloatingZoneBannerRaf = 0;
    if(!document.body.contains(layer)) return;
    const centerRect = center.getBoundingClientRect();
    const zones = Array.from(board.querySelectorAll('.zone'));
    zones.forEach(function(zoneEl, idx){
      const zoneRect = zoneEl.getBoundingClientRect();
      if(!zoneRect.width || !zoneRect.height) return;
      let banner = layer.children[idx];
      if(!banner){
        banner = document.createElement('div');
        banner.className = 'zone-floating-banner';
        banner.textContent = 'Zone ' + (idx + 1);
        layer.appendChild(banner);
      }
      banner.style.left = (zoneRect.left - centerRect.left + zoneRect.width / 2) + 'px';
      banner.style.top = (zoneRect.top - centerRect.top - 18) + 'px';
    });
    while(layer.children.length > zones.length) layer.removeChild(layer.lastElementChild);
  });
}

if(!window.__fateFloatingZoneBannerResize){
  window.__fateFloatingZoneBannerResize = true;
  window.addEventListener('resize', function(){
    if(document.getElementById('zone-floating-banners')) syncFloatingZoneBanners();
  }, {passive:true});
}

function getBoardCardPosition(card) {
  let found = null;
  if(!card) return found;
  forEachBoardCard((cell, z, r, c)=>{
    if(!found && cell && cell.iid===card.iid) found = {z, r, c};
  });
  return found;
}

function getCardVisualData(card, viewerP = getPerspectivePlayerIndex(), options = {}) {
  if(!card) return null;
  const boardPos = options.boardPos || getBoardCardPosition(card);
  const hiddenOnBoard = !!(boardPos && isFaceDownCard(card) && (options.forceBoardHidden || card.owner !== viewerP));
  if(!hiddenOnBoard){
    const displayedCost = typeof getDisplayedCardCost === 'function' ? getDisplayedCardCost(card) : card.cost;
    // Zoe's information copy follows her printed Initiator (2) art. Match-wide
    // consolidation modifiers still apply when the player actually sets her.
    const handCost = String(card.id || '') === '04' ? Math.max(0, Number(card.cost) || 0) : displayedCost;
    const immutable = typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(card);
    const handBonusFate = card._wciBonus && !immutable ? 2 : 0;
    const liveFate = (immutable && !boardPos ? (Number(card.fate) || 0) : getLiveCardFate(card)) + (!boardPos ? handBonusFate : 0);
    return {
      card,
      isHidden: false,
      name: card.name,
      ability: card.ability,
      effect: card.effect,
      type:typeof isCardCharacterForRules === 'function' && card.type === 'Supporter' && isCardCharacterForRules(card, card.owner) ? 'Character' : card.type,
      aff: card.aff,
      fate: typeof getPrintedFateLabel === 'function' ? getPrintedFateLabel(card) : (card.xFate ? 'X' : card.fate),
      currentFate: liveFate,
      displayFate: boardPos ? getCachedEffectiveFate(card, boardPos.z) : (card.xFate ? 'X' : liveFate),
      img: getRuntimeCardImageSrc(card.img, 'detail'),
      runtimeImg: getRuntimeCardImageSrc(card.img, boardPos ? 'board' : 'hand'),
      cost: handCost,
      xCost: card.xCost
    };
  }
  return {
    card,
    isHidden: true,
    name: 'Face-Down Card',
    ability: 'Hidden',
    effect: 'This card is face down. Its effect is inactive and its Fate is not counted until it is flipped face up.',
    type: 'Face Down',
    aff: 'hidden',
    fate: 0,
    currentFate: 0,
    displayFate: '—',
    img: 'back.png',
    runtimeImg: 'back.png',
    cost: 0,
    xCost: false
  };
}


function getAffIconImageSrc(aff) {
  return (typeof AFF_ICON_IMG !== 'undefined' && AFF_ICON_IMG && AFF_ICON_IMG[aff]) ? AFF_ICON_IMG[aff] : '';
}

function getStatusEffectIcon(kind) {
  const icons = {
    buff: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M32 10v44M10 32h44" stroke-width="5"/><path d="M20 20l24 24M44 20L20 44" stroke-width="3" opacity=".35"/></g></svg>`,
    debuff: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M14 32h36" stroke-width="6"/><path d="M44 18l8 14-8 14" stroke-width="4"/></g></svg>`,
    suppression: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18h36M14 46h36" stroke-width="4"/><path d="M20 26h24v12H20z" stroke-width="3.4"/><path d="M25 32h14" stroke-width="4.8"/></g></svg>`,
    protection: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 8l18 8v14c0 12-7.2 20.4-18 26-10.8-5.6-18-14-18-26V16l18-8z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M24 32l5 5 11-12" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    movement: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 32h36"/><path d="M34 18l14 14-14 14"/><circle cx="14" cy="32" r="6"/></g></svg>`,
    movement_debuff: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 32h28" opacity=".45"/><path d="M56 14L14 56"/><circle cx="18" cy="32" r="6"/><path d="M34 18l14 14-14 14" opacity=".45"/></g></svg>`,
    zone_lock: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"><rect x="12" y="18" width="40" height="34" rx="5"/><path d="M22 18v-4a10 10 0 0 1 20 0v4"/><circle cx="32" cy="35" r="4"/><path d="M32 39v7" stroke-linecap="round"/></g></svg>`,
    cell_lock: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="18" y="30" width="28" height="20" rx="4" stroke-width="4"/><path d="M24 30v-7a8 8 0 0 1 16 0v7" stroke-width="4"/><path d="M24 18h16" stroke-width="2.6" opacity=".45"/></g></svg>`,
    consolidation_block: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M18 18h28v28H18z" stroke-width="3.5"/><path d="M14 50L50 14" stroke-width="5"/><path d="M32 12v9M32 43v9M12 32h9M43 32h9" stroke-width="3" opacity=".55"/></g></svg>`,
    artillery_lock: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M10 43h28l13-13" stroke-width="4"/><path d="M21 43l-5 9M34 43l5 9" stroke-width="3"/><circle cx="47" cy="27" r="6" stroke-width="3.5"/><path d="M16 33h15" stroke-width="4"/></g></svg>`,
    scout: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><circle cx="28" cy="28" r="12"/><path d="M37 37l13 13"/><path d="M28 22v12M22 28h12" opacity=".7"/></g></svg>`,
    unlimited: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M9 37c4-9 10-13 16-13 8 0 10 8 16 8 4 0 8-2 14-9" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 27c4 9 10 13 16 13 8 0 10-8 16-8 4 0 8 2 14 9" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    ready: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><circle cx="32" cy="32" r="20"/><path d="M32 20v14l9 6"/><path d="M48 16l4-4"/></g></svg>`,
    affiliation_buff: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><circle cx="32" cy="32" r="18"/><path d="M32 18v28M18 32h28"/><path d="M20 20l8 8M44 20l-8 8" opacity=".35"/></g></svg>`,
    music: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M38 12v32" stroke-width="4"/><path d="M38 12l14 5v10l-14-5" stroke-width="4"/><ellipse cx="25" cy="46" rx="11" ry="7" stroke-width="4"/></g></svg>`,
    mail: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"><rect x="10" y="18" width="44" height="30" rx="4"/><path d="M12 21l20 16 20-16"/><path d="M12 46l15-14M52 46L37 32" stroke-linecap="round"/></g></svg>`,
    house: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 31L32 13l22 18"/><path d="M17 29v24h30V29"/><path d="M27 53V38h10v15"/><path d="M24 26h16" opacity=".45"/></g></svg>`,
    semper: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 18h40M12 46h40" stroke-width="4"/><path d="M22 26h20v12H22z" stroke-width="3.4"/><path d="M28 32h8" stroke-width="5"/><path d="M20 12l24 40" stroke-width="2.5" opacity=".38"/></g></svg>`,
    carolyn_lock: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="16" y="16" width="32" height="32" rx="4" stroke-width="3.5"/><path d="M24 24h16v16H24z" stroke-width="3"/><path d="M20 32h24M32 20v24" stroke-width="2.6" opacity=".45"/></g></svg>`,
    zoe_block: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 25V14h11M52 25V14H41M12 39v11h11M52 39v11H41" stroke-width="4"/><path d="M17 32c5-7 10-10 15-10s10 3 15 10c-5 7-10 10-15 10s-10-3-15-10z" stroke-width="3.5"/><circle cx="32" cy="32" r="4" stroke-width="3"/></g></svg>`,
    wci_bonus: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="32" cy="32" r="14" stroke-width="4"/><circle cx="32" cy="32" r="5" stroke-width="3.5"/><path d="M32 8v10M32 46v10M8 32h10M46 32h10M15 15l7 7M42 42l7 7M49 15l-7 7M22 42l-7 7" stroke-width="3.5"/></g></svg>`,
    shield_wall: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 8l18 8v14c0 12-7.2 20.4-18 26-10.8-5.6-18-14-18-26V16l18-8z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M21 30h22M24 39h16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
    maja_unlimited: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M10 46l14-14-14-14M24 46l14-14-14-14M38 46l14-14-14-14" stroke-width="4"/></g></svg>`,
    fort_calvin: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><circle cx="27" cy="27" r="12"/><path d="M36 36l14 14"/><path d="M24 27h6M27 24v6" opacity=".7"/><path d="M12 50h14" stroke-width="2.8" opacity=".45"/></g></svg>`,
    berkeley_lock: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 43h25l14-14" stroke-width="4"/><path d="M20 43l-5 9M34 43l5 9" stroke-width="3"/><rect x="42" y="16" width="12" height="12" rx="2" stroke-width="3.5"/><path d="M16 34h14" stroke-width="3.5"/></g></svg>`,
    erbs_ready: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M24 31c-6-6-6-15 0-21 6-6 16-6 22 0l4 4" stroke-width="4.2"/><path d="M40 33c6 6 6 15 0 21-6 6-16 6-22 0l-4-4" stroke-width="4.2"/><path d="M23 42L42 23" stroke-width="5"/><path d="M18 20l-5-5M46 49l5 5" stroke-width="2.8" opacity=".48"/></g></svg>`,
    selva: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M15 40a17 17 0 0 1 34 0" stroke-width="4"/><path d="M32 9v8M13 17l6 6M51 17l-6 6M16 35l-7-5M48 35l7-5" stroke-width="3.5"/><path d="M9 43c6-3 11-3 17 0s11 3 17 0 9-3 12-2M11 51c6-3 11-3 17 0s11 3 17 0 7-2 10-2" stroke-width="3"/></g></svg>`,
    guerilla: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M16 27h28l7 4-7 4H16z" stroke-width="2.8"/><path d="M16 28l-6-4v13l6-4" stroke-width="2.6"/><path d="M46 31h9" stroke-width="2.6"/><path d="M24 23h17" stroke-width="2.4"/><path d="M30 36h7l-2 10h-9z" stroke-width="2.6"/><path d="M40 36l7 8" stroke-width="2.6"/><circle cx="24" cy="31" r="1.8" stroke-width="2.4"/></g></svg>`,
    ballad: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M38 12v32" stroke-width="4"/><path d="M38 12l14 5v10l-14-5" stroke-width="4"/><ellipse cx="25" cy="46" rx="11" ry="7" stroke-width="4"/></g></svg>`,
    mail_delivery: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"><rect x="10" y="18" width="44" height="30" rx="4"/><path d="M12 21l20 16 20-16"/></g></svg>`,
    village_lock: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 31L32 13l22 18"/><path d="M17 29v24h30V29"/><path d="M27 53V38h10v15"/><path d="M19 18h10" opacity=".45"/></g></svg>`,
    rivera_aff: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><circle cx="32" cy="32" r="18"/><path d="M32 18v28M18 32h28"/><path d="M22 22l20 20M42 22L22 42" opacity=".35"/></g></svg>`,
    wojciech: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M17 40c0 8 7 13 15 13s15-5 15-13" stroke-width="4"/><path d="M17 40c5-9 25-9 30 0" stroke-width="4"/><path d="M22 31c1-8 7-13 14-13 5 0 9 2 12 6" stroke-width="3"/><path d="M21 40c4 3 18 3 22 0" stroke-width="2.5" opacity=".5"/></g></svg>`,
    lydia: `<svg class="lydia-berknomaly-icon" viewBox="0 0 64 64" aria-hidden="true"><g transform="translate(32 27) scale(.48)" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M-45 11C-37-31-8-47 0-47C8-47 37-31 45 11" stroke-width="7.5"/><path d="M-30 32L-47 50L-30 67" stroke-width="7.5"/><path d="M30 32L47 50L30 67" stroke-width="7.5"/><path d="M-17 5L0-14L17 5L0 24Z" stroke-width="6"/><path d="M0 31V76" stroke-width="7.5"/></g></svg>`,
    secules: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20h28M14 32h36M20 44h24" stroke-width="4"/><path d="M48 16L16 48" stroke-width="4"/><circle cx="32" cy="32" r="21" stroke-width="2.5" opacity=".38"/></g></svg>`,
    administrative_bloat: `<svg class="administrative-bloat-icon" viewBox="0 0 64 64" aria-hidden="true"><path d="M19 11h20l9 9v33H19z" fill="currentColor" opacity=".12"/><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M19 11h20l9 9v33H19z" stroke-width="4"/><path d="M39 11v10h9" stroke-width="4"/><path d="M25 29h17M25 36h17M25 43h12" stroke-width="3.5"/></g></svg>`,
    blame_game: `<svg class="blame-game-icon" viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="32" cy="32" r="22" stroke-width="3.5"/><path d="M32 5v9M32 50v9M5 32h9M50 32h9" stroke-width="3.5"/><circle cx="32" cy="25" r="6" stroke-width="3.5"/><path d="M21 46c1-10 5-15 11-15s10 5 11 15" stroke-width="4"/></g></svg>`,
    busser_boot: `<svg class="busser-boot-icon" viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M11 40h42M16 40c1-11 7-18 16-18s15 7 16 18" stroke-width="4"/><path d="M28 17h8M32 17v5M10 49h35" stroke-width="3.5"/><path d="M42 14h12M49 9l5 5-5 5" stroke-width="3.5"/></g></svg>`,
    marie_deterrence: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18h36v12c0 11-7 20-18 26-11-6-18-15-18-26V18z" stroke-width="4"/><path d="M22 35h20" stroke-width="5"/><path d="M20 13h24" stroke-width="3" opacity=".5"/></g></svg>`
  };
  return icons[kind] || icons.buff;
}

function renderAffBadgeHTML(aff, extraClass) {
  if(!aff || aff === 'hidden') return '';
  const label = (typeof AFF_LABEL !== 'undefined' && AFF_LABEL[aff]) ? AFF_LABEL[aff] : aff;
  const classes = String(extraClass || '');
  const isEffectBadge = classes.indexOf('aff-effect-badge') >= 0;
  const src = isEffectBadge ? '' : getAffIconImageSrc(aff);
  const svg = typeof getAffIcon === 'function' ? getAffIcon(aff) : '';
  const icon = src
    ? '<img src="' + src + '" alt="' + escapePlacementAnimHtml(label) + '" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">'
    : '';
  return '<div class="aff-badge ' + classes + ' aff-' + String(aff).replace(/[^a-z0-9_-]/gi,'') + '" title="' + escapePlacementAnimHtml(label) + '">' +
    icon + '<span class="aff-badge-fallback" style="' + (src ? 'display:none;' : 'display:flex;') + '">' + svg + '</span>' +
    '</div>';
}

function escapePlacementAnimHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
  });
}

function createBoardCardEl(card, z, r, c, reuseMap) {
  const rarity = card.rarity || 'circle';
  const perspectivePlayer = getPerspectivePlayerIndex();
  const visual = getCardVisualData(card, perspectivePlayer, {forceBoardHidden:true, boardPos:{z,r,c}});
  const isHidden = !!visual?.isHidden;
  const statusEligibility = getBoardCardStatusEligibility(card, z, r, c, isHidden);
  const statusState = getCardStatusVisualState(card, statusEligibility);
  const isSuppressed = statusState.primary === 'suppressed';
  const isNegated = statusState.primary === 'negated';
  const isImmune = statusState.primary === 'immune';
  const isSnowballHit = statusState.primary === 'snowball';
  const isEffectFlash = statusState.primary === 'effect_flash';
  const effectFlashKind = sanitizeCardEffectFlashKind(statusState.flashKind);
  const effectFlashLabel = statusEligibility.effectFlash && statusEligibility.effectFlash.label
    ? statusEligibility.effectFlash.label
    : effectFlashKind.replace(/[_-]+/g, ' ');
  const isMarkedForDeath = !!statusEligibility.marked;
  const showMarkedIcon = statusState.primary === 'marked';
  const isZoeBlocked = statusState.primary === 'blocked';
  const selected = !!(G.selectedBoardCard && G.selectedBoardCard.card && G.selectedBoardCard.card.iid === card.iid);
  const iidKey = String(card.iid || '');
  const domSig = boardCardDomSignature(card, z, r, c, visual, perspectivePlayer, isHidden, selected);
  if(iidKey && reuseMap && reuseMap.has(iidKey)) {
    const existing = reuseMap.get(iidKey);
    if(existing && existing.dataset && existing.dataset.boardCardSig === domSig) {
      reuseMap.delete(iidKey);
      existing.dataset.owner = String(card.owner);
      existing.dataset.iid = iidKey;
      existing.dataset.z = String(z);
      existing.dataset.r = String(r);
      existing.dataset.c = String(c);
      existing.setAttribute('aria-label', (visual.name || card.name || 'Card') + (isEffectFlash ? ', ' + effectFlashLabel + ' activated' : (isNegated ? ', negated' : (isSuppressed ? ', suppressed' : (isSnowballHit ? ', hit by Snowball Fight' : (isMarkedForDeath ? ', marked for death' : (isZoeBlocked ? ', blocked action' : (isImmune ? ', protected' : ''))))))));
      existing.classList.toggle('sel', selected);
      return existing;
    }
  }
  const el=document.createElement('div');
  el.dataset.owner=String(card.owner);
  el.dataset.iid=iidKey;
  el.dataset.z=String(z);
  el.dataset.r=String(r);
  el.dataset.c=String(c);
  el.dataset.boardCardSig=domSig;
  el.setAttribute('aria-label', (visual.name || card.name || 'Card') + (isEffectFlash ? ', ' + effectFlashLabel + ' activated' : (isNegated ? ', negated' : (isSuppressed ? ', suppressed' : (isSnowballHit ? ', hit by Snowball Fight' : (isMarkedForDeath ? ', marked for death' : (isZoeBlocked ? ', blocked action' : (isImmune ? ', protected' : ''))))))));
  el.className='bc own-'+(card.owner===0?'p1':'p2')
    +(isHidden?' face-down-card':'')
    +(card.immuneFlag?' immune':'')
    +(card.type==='Supporter'?' supporter-card':'')
    +(rarity==='star'?' star-card':'')
    +(rarity==='square'?' square-card':'')
    +(card.owner!==perspectivePlayer?' opponent-card':'')
    +(isNegated?' fate-negated':'')
    +(isSuppressed?' fate-suppressed':'')
    +(isSnowballHit?' fate-snowball-hit':'')
    +(isEffectFlash?' fate-effect-flash effect-flash-'+effectFlashKind:'')
    +(showMarkedIcon?' fate-marked-death':'')
    +(isZoeBlocked?' fate-blocked-action':'')
    +(isImmune?' fate-immune':'');
  if(selected) el.classList.add('sel');
  const eff=isHidden ? 0 : getCachedEffectiveFate(card,z);
  // Determine buff/debuff state — compare effective fate vs base (printed) fate
  const baseFate = card.fate;
  let fateStateCls = '';
  if(!isHidden){
    if(eff > baseFate) fateStateCls = ' buffed';
    else if(eff < baseFate) fateStateCls = ' debuffed';
  }
  // Track prior effective fate to pulse on change
  if(!G._cardFateMap) G._cardFateMap = {};
  const prev = G._cardFateMap[card.iid];
  const changed = !isHidden && prev!==undefined && prev!==eff;
  const delta = changed ? (eff - prev) : 0;
  G._cardFateMap[card.iid] = eff;
  // Mark Menz still changes affiliation, but no longer renders a persistent icon badge.
  const affBadge = '';
  if(isMarkedForDeath) el.classList.add('vigilante-muted'); else el.classList.remove('vigilante-muted');
  if(shouldUseCanvasBoardVisuals()){
    el.dataset.canvasVisual = '1';
    el.dataset.iid = String(card.iid || '');
    if(window.fatePreloadBoardCanvasImage) window.fatePreloadBoardCanvasImage(visual.runtimeImg || visual.img);
  }
  el.innerHTML=`
    <div class="bc-art">${visual.runtimeImg?`<img src="${visual.runtimeImg}" alt="" decoding="async" loading="eager" onerror="this.onerror=null;this.src='${visual.img || 'blank.png'}';">`:''}<span class="bc-ico" style="${visual.runtimeImg?'display:none':''}">${getAffIcon(visual.aff)}</span></div>
    ${affBadge}
    <div class="bc-fate${fateStateCls}${changed?' pulse':''}">${visual.displayFate}</div>`;
  // Spawn mini floater on the card if fate changed
  if(changed && !shouldUseCanvasBoardVisuals()){
    // Trigger damage/buff visual + sfx
    if(delta<0){
      el.classList.add('shake-damage');
      playSfx('debuff');
    } else if(delta>0){
      playSfx('buff');
    }
    setTimeout(()=>{el.classList.remove('shake-damage');},360);
    setTimeout(()=>{
      const f = document.createElement('div');
      f.className = 'card-fate-floater '+(delta>0?'up':'down');
      f.textContent = (delta>0?'+':'')+delta;
      el.appendChild(f);
      setTimeout(()=>f.remove(), 1400);
    },0);
  }
  el.onclick=(e)=>{
    e.stopPropagation();
    window._lastBcClickAt = performance.now();
    captureBoardViewportLock();
    // If consolidation is active, route to consolidation handler
    if(G._consolidating){
      window._lastBcClickAt = performance.now();
      clickCell(z,r,c);
      restoreBoardViewportLockSoon();
      return;
    }
    if(G._isSpectator){
      if(typeof playSfx === 'function') playSfx('boardCardClick');
      window.__fateSuppressNextCardInfoSfxUntil = Date.now() + 180;
      openCardDetail(card, false, true);
      restoreBoardViewportLockSoon();
      return;
    }
    if(typeof playSfx === 'function') playSfx('boardCardClick');
    window.__fateSuppressNextCardInfoSfxUntil = Date.now() + 180;
    activateBoardCard(card,z,r,c);
    restoreBoardViewportLockSoon();
  };
  return el;
}

function renderHand() {
  const cp = getPerspectivePlayerIndex();
  const canActFromHand = (cp === G.currentPlayer);
  const canInspectHand = !G._isSpectator || G._onlineRole === 'spectator';
  const hand = G.players[cp].hand;
  const hc = document.getElementById('hand-cards');
  if(!hc) return;
  if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.ownsHand === 'function' && window.FateMatchRendererAdapter.ownsHand()){
    if(hc.firstChild) hc.textContent = '';
    const countEl = document.getElementById('hand-count');
    const countText = `(${hand.length})`;
    if(countEl && countEl.textContent !== countText) countEl.textContent = countText;
    const lblEl = document.getElementById('hand-lbl');
    if(lblEl) {
      const showAiThinking = !canActFromHand && G.aiEnabled && cp === G.aiPlayer;
      const nameStr = canActFromHand ? G.players[cp].name+'\'s Hand' : G.players[cp].name+'\'s Hand' + (showAiThinking ? ' (AI thinking)' : '');
      const labelSig = [nameStr, countText].join('|');
      if(labelSig !== _lastHandLabelSignature) {
        _lastHandLabelSignature = labelSig;
        const countSpan = countEl ? countEl.outerHTML : '';
        lblEl.innerHTML = nameStr + ' ' + countSpan;
      }
    }
    if(!G._isSpectator && typeof enforceHandLimit === 'function') enforceHandLimit(cp);
    if(typeof window.FateMatchRendererAdapter.scheduleRender === 'function') window.FateMatchRendererAdapter.scheduleRender('renderHand');
    else window.FateMatchRendererAdapter.renderFromGameState({hand:true, source:'renderHand'});
    return;
  }
  const nextSig = getHandRenderSignature();
  if(nextSig === _lastHandRenderSignature && hc.children.length) return;
  _lastHandRenderSignature = nextSig;
  const existingByIid = new Map();
  Array.from(hc.children).forEach(function(child){
    if(child && child.dataset && child.dataset.iid) existingByIid.set(child.dataset.iid, child);
  });
  const frag = document.createDocumentFragment();
  hand.forEach((card,i)=>{
    const iidKey = String(card.iid);
    let el = existingByIid.get(iidKey);
    if(!el) el = document.createElement('div');
    const spectatorHidden = !!(card && (card.hidden || card._spectatorHidden));
    const canPlay = !spectatorHidden && canActFromHand && canPlayCard(card);
    const supporterLimitReached = canActFromHand && isSupporterLimitReachedForCard(card);
    const tutorialBlocked = canActFromHand && typeof tutorialCanPlayHandCardNow === 'function' && !tutorialCanPlayHandCardNow(card);
    const canSelectForDetailAction = (canPlay || supporterLimitReached) && !tutorialBlocked;
    const forceEnter = !!(G._forceHandEnterIids && G._forceHandEnterIids.has(card.iid));
    const isNew = forceEnter || !G._seenHandIids || !G._seenHandIids.has(card.iid);
    if(!G._seenHandIids) G._seenHandIids = new Set();
    G._seenHandIids.add(card.iid);
    if(forceEnter) G._forceHandEnterIids.delete(card.iid);
    const className = 'hc'
      +(G.selectedHandCard===i && canActFromHand?' sel':'')
      +((!canSelectForDetailAction || supporterLimitReached)?' dim':'')
      +(tutorialBlocked?' tutorial-blocked':'')
      +(supporterLimitReached?' supporter-limit-reached':'')
      +(isNew?' hc-entering':'')
      +(card.rarity==='star'?' star-card':'')
      +(card.rarity==='square'?' square-card':'');
    if(el.className !== className) el.className = className;
    el.dataset.iid = iidKey;
    if(isNew && !el.__fateHandEnterListener){
      el.__fateHandEnterListener = true;
      el.addEventListener('animationend',function(){
        el.classList.remove('hc-entering');
        el.__fateHandEnterListener = false;
      },{once:true});
    }
    const fate = getLiveCardFate(card);
    const runtimeImg = !spectatorHidden && card.img ? getRuntimeCardImageSrc(card.img, 'hand') : '';
    const handEffectRows = typeof getHandCardEffectModifiers === 'function' ? getHandCardEffectModifiers(card) : [];
    const handEffectSig = JSON.stringify(handEffectRows);
    const visualSig = [runtimeImg, card.img || '', card.name || '', card.aff || '', fate, handEffectSig].join('|');
    if(el.__fateHandVisualSig !== visualSig){
      el.__fateHandVisualSig = visualSig;
      el.innerHTML=spectatorHidden ? '<div class="opp-card-back" aria-label="Hidden card"></div>' : `
        <div class="bc-art">${card.img?`<img src="${runtimeImg}" alt="${escapePlacementAnimHtml(card.name)}" decoding="async" loading="eager" fetchpriority="high" data-full-src="${getFullCardImageFallbackSrc(runtimeImg)}" onerror="this.onerror=null;this.src=this.dataset.fullSrc||'${runtimeImg}';">`:''}<span class="bc-ico" style="${card.img?'display:none':''}">${getAffIcon(card.aff)}</span></div>
        <div class="bc-fate">${fate}</div>
        <div class="bc-name">${escapePlacementAnimHtml(card.name)}</div>
        ${buildHandEffectMarkerHTML(card)}`;
      const img = el.querySelector('.bc-art img');
      if(img && card.img) {
        const fallbackSrc = getFullCardImageFallbackSrc(runtimeImg);
        setTimeout(function(){
          if(!img.isConnected || img.src.endsWith('/' + fallbackSrc) || img.getAttribute('src') === fallbackSrc) return;
          if(!img.complete || !img.naturalWidth) img.src = fallbackSrc;
        }, 650);
      }
    }
    if(canInspectHand && !spectatorHidden) {
      el.onpointerenter = function(){ preloadCardDetailImage(card); };
      el.onclick=()=>{
      if(canSelectForDetailAction) {
        if(typeof playSfx === 'function') playSfx('cardSelect');
      } else if(typeof window.playFateSfxOnce === 'function') window.playFateSfxOnce('cardInfoOpen', 'card-info-open', 180);
      else if(typeof playSfx === 'function') playSfx('cardInfoOpen');
      // Keep card-info modal placement available: clicking a playable hand card
      // selects it before opening the detail modal, so Place on Board can appear.
      if(canSelectForDetailAction) {
        G.selectedHandCard = i;
        G.placing = false;
      }
      openCardDetail(card, true, false);
      };
    } else {
      el.onpointerenter = null;
      el.onclick = null;
    }
    frag.appendChild(el);
  });
  hc.appendChild(frag);
  Array.from(hc.children).forEach(function(child){
    if(!child.dataset || !hand.some(function(card){ return String(card.iid) === child.dataset.iid; })) child.remove();
  });
  const countEl = document.getElementById('hand-count');
  const countText = `(${hand.length})`;
  if(countEl && countEl.textContent !== countText) countEl.textContent = countText;
  const lblEl = document.getElementById('hand-lbl');
  if(lblEl) {
    const showAiThinking = !canActFromHand && G.aiEnabled && cp === G.aiPlayer;
    const nameStr = canActFromHand ? G.players[cp].name+'\'s Hand' : G.players[cp].name+'\'s Hand' + (showAiThinking ? ' (AI thinking)' : '');
    const labelSig = [nameStr, countText].join('|');
    if(labelSig !== _lastHandLabelSignature) {
      _lastHandLabelSignature = labelSig;
      const countSpan = countEl ? countEl.outerHTML : '';
      lblEl.innerHTML = nameStr + ' ' + countSpan;
    }
  }
  if(typeof enforceHandLimit === 'function') enforceHandLimit(cp);
}

function enforceHandLimit(player) {
  if(typeof G === 'undefined' || !G || !G.players || !G.players[player]) return false;
  if(G._isSpectator || G._onlineRole === 'spectator') return false;
  const handLimit = 12;
  const hand = G.players[player].hand || [];
  if(hand.length <= handLimit) return false;
  if(player !== getPerspectivePlayerIndex()){
    if(G._onlineRoomCode) return false;
    while(G.players[player].hand.length > handLimit){
      const card = G.players[player].hand.pop();
      if(card) {
        G.players[player].discard.push(card);
        log(player===0?'p1':'p2', 'Discarded ' + card.name + ' to hand limit');
      }
    }
    return true;
  }
  if(G._handLimitDiscard && G._handLimitDiscard.player === player) {
    const modal = document.getElementById('modal');
    const modalOpen = !!(modal && modal.classList && modal.classList.contains('on') && modal.querySelector && modal.querySelector('.hand-limit-discard'));
    const deferredActive = !!(G._handLimitDiscard.deferred && G._handLimitDiscardTimer);
    if(modalOpen || deferredActive) return true;
    G._handLimitDiscard = null;
  }
  const cinematicWait = Math.max(
    0,
    (Number(G._cinematicUiLockUntil) || 0) - Date.now(),
    document.body && document.body.classList.contains('cinematic-lock') ? 450 : 0
  );
  if(cinematicWait > 0) {
    G._handLimitDiscard = { player: player, deferred: true };
    if(G._handLimitDiscardTimer) clearTimeout(G._handLimitDiscardTimer);
    G._handLimitDiscardTimer = setTimeout(function(){
      G._handLimitDiscardTimer = null;
      if(G._handLimitDiscard && G._handLimitDiscard.player === player && G._handLimitDiscard.deferred) {
        G._handLimitDiscard = null;
      }
      enforceHandLimit(player);
    }, Math.min(3600, cinematicWait + 90));
    return true;
  }
  G._handLimitDiscard = { player: player };
  openHandLimitDiscardModal(player);
  return true;
}

function openHandLimitDiscardModal(player) {
  const p = G.players[player];
  if(!p || !Array.isArray(p.hand)) return;
  const handLimit = 12;
  const needed = Math.max(0, p.hand.length - handLimit);
  const viewer = getPerspectivePlayerIndex();
  const isViewer = player === viewer;
  const cards = p.hand.slice();
  const bodyHtml = `
    <div class="hand-limit-discard">
      <div class="hand-limit-copy">Your hand has ${cards.length} cards. Discard ${needed} card${needed===1?'':'s'} to return to 12.</div>
      <div class="hand-limit-count">0/${needed} selected</div>
      <div class="hand-limit-grid">
        ${cards.map(function(card, i){
          const visual = getCardVisualData(card, viewer, {forceBoardHidden:!isViewer});
          const img = visual.runtimeImg || visual.img || card.img || '';
          return `<button class="hand-limit-card" type="button" data-i="${i}" data-iid="${escapePlacementAnimHtml(String(card.iid || ''))}">
            <span class="hand-limit-art">${img ? `<img src="${img}" alt="${escapePlacementAnimHtml(visual.name || card.name)}" decoding="async" loading="eager">` : `<span>${getAffIcon(visual.aff || card.aff)}</span>`}</span>
            <span class="hand-limit-name">${escapePlacementAnimHtml(visual.name || card.name)}</span>
          </button>`;
        }).join('')}
      </div>
    </div>`;
  showModal('Discard Down to 12', bodyHtml, [{label:'Discard Selected', pri:true, action:function(){
    const selectedIids = Array.from(document.querySelectorAll('#modal .hand-limit-card.is-selected')).map(function(el){ return el.dataset.iid; }).filter(Boolean);
    const excess = Math.max(0, (G.players[player].hand || []).length - handLimit);
    if(selectedIids.length < excess){ toast('Select ' + excess + ' card' + (excess===1?'':'s') + ' to discard'); return; }
    selectedIids.forEach(function(iid){
      const idx = G.players[player].hand.findIndex(function(card){ return card && String(card.iid || '') === iid; });
      if(idx < 0) return;
      const card = G.players[player].hand[idx];
      if(!card) return;
      G.players[player].hand.splice(idx, 1);
      G.players[player].discard.push(card);
      log(player===0?'p1':'p2', 'Discarded ' + card.name + ' to hand limit');
    });
    G._handLimitDiscard = null;
    closeModal();
    renderHand();
    if(typeof updateTopBar === 'function') updateTopBar();
    if(typeof window.fateOnlineHandLimitResolved === 'function') window.fateOnlineHandLimitResolved(player);
    if((G.players[player].hand || []).length > handLimit) enforceHandLimit(player);
  }}], {immediate:true});
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox) modalBox.classList.add('hand-limit-discard-modal');
  const countEl = document.querySelector('#modal .hand-limit-count');
  const okBtn = document.querySelector('#modal-acts .btn.pri');
  if(okBtn) okBtn.disabled = true;
  document.querySelectorAll('#modal .hand-limit-card').forEach(function(btn){
    btn.onclick = function(){
      btn.classList.toggle('is-selected');
      const selected = document.querySelectorAll('#modal .hand-limit-card.is-selected').length;
      if(countEl) countEl.textContent = selected + '/' + needed + ' selected';
      if(okBtn) okBtn.disabled = selected < needed;
    };
    btn.oncontextmenu = function(ev){
      ev.preventDefault();
      const idx = Number(btn.dataset.i);
      const card = cards[idx];
      if(card && typeof showCardInfoOverlay === 'function') showCardInfoOverlay(card);
    };
  });
}
window.enforceHandLimit = enforceHandLimit;

function canPlayCard(card) {
  if(G.phase!=='main') return false;
  if(card && card.id==='70' && card.guerilla_transferred) return false;
  // Lina free-set: always playable
  if(G._linaFreeIids && G._linaFreeIids.has(card.iid)) return true;
  if(typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(card, card.owner) : card.type==='Supporter') {
    const max=G.maxSupportsPerTurn+G.extraSupportsThisTurn;
    if(!G.majaEffectThisTurn && G.supportsPlacedThisTurn>=max) return false;
  }
  return true;
}

function isSupporterLimitReachedForCard(card) {
  if(!card || !(typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(card, card.owner) : card.type === 'Supporter')) return false;
  if(G.phase !== 'main') return false;
  if(G._linaFreeIids && G._linaFreeIids.has(card.iid)) return false;
  if(G.majaEffectThisTurn) return false;
  const max = G.maxSupportsPerTurn + G.extraSupportsThisTurn;
  return G.supportsPlacedThisTurn >= max;
}

function renderZoneScores() {
  const zs=document.getElementById('zscore');
  if(zs) zs.innerHTML='';
  if(!G._prevZoneScores) G._prevZoneScores = {};
  if(!G._zoneScoreRenderSigs) G._zoneScoreRenderSigs = {};
  for(let z=0;z<3;z++){
    const s0=getCachedZoneScore(z,0),s1=getCachedZoneScore(z,1);
    const ctrl=s0>s1?0:s1>s0?1:-1;
    const el=document.querySelector('#board .zone[data-zone="'+z+'"] .zone-score-card');
    const zoneEl=document.querySelector('#board .zone[data-zone="'+z+'"]');
    if(el){
      const scoreTip = getZoneScoreTooltip(z, s0, s1);
      const sig = [s0, s1, ctrl, scoreTip].join('|');
      if(G._zoneScoreRenderSigs[z] !== sig) {
        G._zoneScoreRenderSigs[z] = sig;
        el.className='zone-score-card'+(ctrl>=0?' ctrl':'');
        el.removeAttribute('title');
        el.setAttribute('aria-label', scoreTip);
        el.dataset.tooltip = scoreTip;
        el.innerHTML=renderZoneScoreMarkup(z,s0,s1,ctrl);
      }
    }
    if(zoneEl){
      zoneEl.classList.toggle('zone-p1', ctrl===0);
      zoneEl.classList.toggle('zone-p2', ctrl===1);
      zoneEl.classList.toggle('zone-tied', ctrl<0);
    }
    // Check for control change
    if(!G._prevZoneCtrl) G._prevZoneCtrl = {};
    const prevCtrl = G._prevZoneCtrl[z];
    if(prevCtrl !== undefined && prevCtrl !== ctrl && ctrl >= 0){
      // Control just gained — trigger flash
      if(el){
        el.classList.add('control-gained');
        setTimeout(()=>el.classList.remove('control-gained'), 1000);
      }
    }
    G._prevZoneCtrl[z] = ctrl;
    // Check for change vs previous
    const prev0 = G._prevZoneScores['z'+z+'_0'];
    const prev1 = G._prevZoneScores['z'+z+'_1'];
    if(el && prev0!==undefined && prev0!==s0){
      const delta = s0 - prev0;
      spawnFloater(el, delta, 'p1');
    }
    if(el && prev1!==undefined && prev1!==s1){
      const delta = s1 - prev1;
      spawnFloater(el, delta, 'p2');
    }
    G._prevZoneScores['z'+z+'_0']=s0;
    G._prevZoneScores['z'+z+'_1']=s1;
  }
}

function spawnFloater(parentEl, delta, color){
  if(delta===0) return;
  const f = document.createElement('div');
  f.className='fate-floater '+(delta>0?'up':'down')+' '+(color||'');
  f.textContent = (delta>0?'+':'')+delta;
  const rect = parentEl.getBoundingClientRect();
  f.style.position = 'fixed';
  f.style.left = (rect.left + rect.width / 2) + 'px';
  f.style.top = (rect.top + rect.height / 2) + 'px';
  f.style.zIndex = '9999';
  document.body.appendChild(f);
  setTimeout(()=>f.remove(), 1500);
}

function updateTopBar() {
  const cp=G.currentPlayer;
  const isAITurn = G.aiEnabled && (G.currentPlayer===G.aiPlayer || G._aiRunning);
  const perspectivePlayer = typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : 0;
  const perspectiveOpponent = 1 - perspectivePlayer;
  const isOwnTurn = cp === perspectivePlayer;
  const displayName = isOwnTurn ? 'Your' : 'Opponent';
  const turnText = "Turn "+G.turn+"/"+G.maxTurns+" - "+displayName+" Turn";
  const hudTurnText = 'Turn '+G.turn+'/'+G.maxTurns;
  const hudPlayerText = isOwnTurn ? "It's Your Turn!" : "Opponent's Turn";
  const shellSig = [
    cp, G.turn, G.maxTurns, G.phase || '',
    isAITurn ? 1 : 0, isOwnTurn ? 1 : 0,
    displayName, hudTurnText, hudPlayerText
  ].join('|');
  if(shellSig !== _lastTopBarShellSignature){
    _lastTopBarShellSignature = shellSig;
    const gameScreen = document.getElementById('s-game');
    if(gameScreen){
      gameScreen.classList.toggle('ai-turn', isAITurn);
      gameScreen.classList.toggle('human-turn', !isAITurn);
      gameScreen.classList.toggle('own-turn', isOwnTurn);
      gameScreen.classList.toggle('opponent-turn', !isOwnTurn);
    }
    const curEl = document.getElementById('tp-cur');
    if(curEl && curEl.textContent !== turnText) {
      curEl.textContent = turnText;
      curEl.classList.toggle('turn-title-long', turnText.length > 34);
      curEl.classList.toggle('turn-title-xlong', turnText.length > 46);
    }
    const hudTurn = document.getElementById('turn-hud-turn');
    if(hudTurn && hudTurn.textContent !== hudTurnText) hudTurn.textContent = hudTurnText;
    const hudPlayer = document.getElementById('turn-hud-player');
    if(hudPlayer && hudPlayer.textContent !== hudPlayerText) hudPlayer.textContent = hudPlayerText;
    const phaseEl = document.getElementById('tp-phase');
    if(phaseEl && phaseEl.textContent) phaseEl.textContent='';
    const endBtn = document.getElementById('btn-end-turn');
    if(endBtn){
      if(endBtn.disabled !== isAITurn) endBtn.disabled = isAITurn;
      const btnText = isAITurn ? 'AI Thinking...' : 'End Turn';
      if(endBtn.textContent !== btnText) endBtn.textContent = btnText;
    }
  }
  const bannerSig = getPlayerBannersSignature(cp, perspectivePlayer);
  if(bannerSig !== _lastPlayerBannersSignature){
    _lastPlayerBannersSignature = bannerSig;
    updatePlayerBanners();
  } else {
    updatePlayerBannerActiveTurn(perspectivePlayer, perspectiveOpponent);
  }
  normalizeActionBarLayout();
  const effectsSig = getTopBarEffectsSourceSignature();
  if(effectsSig !== _lastTopBarEffectsSourceSignature){
    _lastTopBarEffectsSourceSignature = effectsSig;
    renderTopbarEffects();
  }
}


function showRiveraStatusBanner(aff, turnsLeft, owner) {
  const existing = document.getElementById('rivera-status-banner');
  if(existing) existing.remove();
  return; // Rivera should use only the existing golden topbar status pill.
}


function showBerkeleyStatusBanner(zone, owner) {
  // No floating popup; Berkeley is represented by the existing topbar status pill.
}

function showBusserStatusBanner(card, moves, owner) {
  const turns = Math.max(0, Number(moves) || 0);
  const effectCard = (typeof CARDS !== 'undefined' && Array.isArray(CARDS)) ? CARDS.find(c => c.id === '69') : null;
  const name = card && card.name ? card.name : 'Selected card';
  if(typeof renderTopbarEffects === 'function') renderTopbarEffects();
  if(typeof toast === 'function') toast(name + ' can move to adjacent zones' + (turns ? ' (' + turns + ' turn' + (turns === 1 ? '' : 's') + ' remaining)' : '') + '.');
  try {
    window.__fateLastBusserStatusBanner = {
      cardName:name,
      cardId:String(card && card.id || ''),
      sourceName:effectCard ? effectCard.name : 'Breakfast Republic Busser',
      turnsLeft:turns,
      owner:coerceStatusOwner(owner, typeof G !== 'undefined' && G ? G.currentPlayer : 0),
      at:Date.now()
    };
  } catch(e) {}
}

function coerceStatusOwner(value, fallback) {
  const num = Number(value);
  if(Number.isFinite(num) && (num === 0 || num === 1)) return num;
  return fallback;
}

let _topbarEffectsLastHtml = null;
let _effectTooltipPortal = null;
let _effectTooltipGlobalCleanupBound = false;
const TOPBAR_STATUS_TARGET_VISIBLE = 4;
const TOPBAR_STATUS_OVERFLOW_WIDTH = 116;
const TOPBAR_STATUS_FLEX_MIN_WIDTH = 92;

function clearNodeChildren(node) {
  if(!node) return;
  while(node.firstChild) node.removeChild(node.firstChild);
}

function getEffectTooltipPortal() {
  if(_effectTooltipPortal && _effectTooltipPortal.isConnected) return _effectTooltipPortal;
  _effectTooltipPortal = document.createElement('div');
  _effectTooltipPortal.className = 'effect-pill-tooltip effect-tooltip-portal';
  _effectTooltipPortal.setAttribute('aria-hidden', 'true');
  document.body.appendChild(_effectTooltipPortal);
  return _effectTooltipPortal;
}

function hideEffectTooltipPortal() {
  if(!_effectTooltipPortal) return;
  _effectTooltipPortal.className = 'effect-pill-tooltip effect-tooltip-portal';
  _effectTooltipPortal.classList.remove('is-visible');
  _effectTooltipPortal.style.display = 'none';
  _effectTooltipPortal.style.opacity = '0';
  _effectTooltipPortal.style.visibility = 'hidden';
  _effectTooltipPortal.innerHTML = '';
  _effectTooltipPortal.removeAttribute('data-side');
}

function bindEffectTooltipGlobalCleanup() {
  if(_effectTooltipGlobalCleanupBound) return;
  _effectTooltipGlobalCleanupBound = true;
  document.addEventListener('pointermove', function(ev) {
    if(!_effectTooltipPortal || _effectTooltipPortal.style.display === 'none') return;
    var pill = ev.target && ev.target.closest ? ev.target.closest('.effect-pill') : null;
    if(!pill) hideEffectTooltipPortal();
  }, {passive:true});
  window.addEventListener('blur', hideEffectTooltipPortal);
  document.addEventListener('visibilitychange', function(){
    if(document.hidden) hideEffectTooltipPortal();
  });
}

function positionEffectTooltipPortal(portal, pill, container) {
  if(!portal || !pill) return;
  var rect = pill.getBoundingClientRect();
  var tipW = 260;
  var tipH = Math.max(150, portal.offsetHeight || 170);
  var t = rect.bottom + 6;
  var l = rect.left;
  if(container && container.id === 'tp-status-right') l = rect.right - tipW;
  if(l + tipW > window.innerWidth - 8) l = window.innerWidth - tipW - 8;
  if(l < 8) l = 8;
  if(t + tipH > window.innerHeight - 8) t = rect.top - tipH - 6;
  if(t < 8) t = 8;
  portal.style.top = t + 'px';
  portal.style.left = l + 'px';
}

function ensureEffectTooltipPositioning(container) {
  if(!container || container.dataset.tooltipPositioningBound === '1') return;
  container.dataset.tooltipPositioningBound = '1';
  bindEffectTooltipGlobalCleanup();
  container.addEventListener('mouseover', function(ev) {
    var pill = ev.target && ev.target.closest ? ev.target.closest('.effect-pill') : null;
    if(!pill || !container.contains(pill)) return;
    if(pill.classList.contains('effect-pill-overflow')) {
      hideEffectTooltipPortal();
      return;
    }
    var tip = pill.querySelector('.effect-pill-tooltip');
    if(!tip || !tip.textContent.trim()) {
      hideEffectTooltipPortal();
      return;
    }
    var portal = getEffectTooltipPortal();
    var sideClass = pill.classList.contains('effect-pill-opp') ? ' effect-pill-opp' : ' effect-pill-mine';
    portal.className = 'effect-pill-tooltip effect-tooltip-portal is-visible' + sideClass;
    portal.innerHTML = tip.innerHTML;
    portal.dataset.side = container.id === 'tp-status-right' ? 'right' : 'left';
    portal.style.display = 'block';
    portal.style.opacity = '1';
    portal.style.visibility = 'visible';
    positionEffectTooltipPortal(portal, pill, container);
  });
  container.addEventListener('mousemove', function(ev) {
    var pill = ev.target && ev.target.closest ? ev.target.closest('.effect-pill') : null;
    if(!pill || !container.contains(pill) || !_effectTooltipPortal || _effectTooltipPortal.style.display === 'none') return;
    if(pill.classList.contains('effect-pill-overflow')) {
      hideEffectTooltipPortal();
      return;
    }
    positionEffectTooltipPortal(_effectTooltipPortal, pill, container);
  });
  container.addEventListener('mouseout', function(ev) {
    var pill = ev.target && ev.target.closest ? ev.target.closest('.effect-pill') : null;
    if(!pill || !container.contains(pill)) return;
    if(ev.relatedTarget && pill.contains(ev.relatedTarget)) return;
    hideEffectTooltipPortal();
  });
}

function createEffectPillNode() {
  var pill = document.createElement('div');
  var icon = document.createElement('span');
  var label = document.createElement('span');
  var tip = document.createElement('div');
  var header = document.createElement('div');
  var name = document.createElement('span');
  var ability = document.createElement('span');
  var effect = document.createElement('div');
  var owner = document.createElement('div');
  icon.className = 'effect-pill-icon';
  label.className = 'effect-pill-label';
  tip.className = 'effect-pill-tooltip';
  header.className = 'ept-header';
  name.className = 'ept-name';
  ability.className = 'ept-ability';
  effect.className = 'ept-effect';
  owner.className = 'ept-owner';
  header.appendChild(name);
  header.appendChild(ability);
  tip.appendChild(header);
  tip.appendChild(effect);
  tip.appendChild(owner);
  pill.appendChild(icon);
  pill.appendChild(label);
  pill.appendChild(tip);
  return pill;
}

function getStatusOverflowIcon() {
  return '<svg class="effect-overflow-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M5 7.5h14M5 12h14M5 16.5h14"/>' +
    '<path d="M3.5 7.5h.01M3.5 12h.01M3.5 16.5h.01"/>' +
  '</svg>';
}

function formatStatusOverflowEffects(effects) {
  const safeEffects = Array.isArray(effects) ? effects : [];
  return safeEffects.map(function(e) {
    return [
      e && e.label || '',
      e && e.cardName || '',
      e && e.cardAbility || '',
      e && e.cardEffect || '',
      e && e.printedEffect || '',
      e && e.extraClass || '',
      e && e.icon || '',
      e && e.sourceIid || '',
      e && e.statusInstanceKey || '',
      e && e.turnsLeft || ''
    ].join('|');
  }).join('||');
}

function formatStatusEffectCopyForSide(text, side) {
  let value = String(text || '');
  if(side !== 'right') return value;
  value = value.replace(/\bfrom your deck\b/gi, "from opponent's deck");
  value = value.replace(/\byour deck\b/gi, "opponent's deck");
  value = value.replace(/\bfrom your hand\b/gi, "from opponent's hand");
  value = value.replace(/\byour hand\b/gi, "opponent's hand");
  value = value.replace(/\byour discard pile\b/gi, "opponent's discard pile");
  value = value.replace(/\byour discard\b/gi, "opponent's discard");
  value = value.replace(/\byour opponent\b/gi, 'you');
  value = value.replace(/\bopponent's next turn\b/gi, 'your next turn');
  value = value.replace(/\bopponent draw-phase\b/gi, 'your draw-phase');
  return value;
}

function findStatusEffectSourceCard(entry) {
  if(!entry || !Array.isArray(CARDS)) return null;
  const cardName = String(entry.cardName || '');
  const ability = String(entry.cardAbility || entry.label || '');
  return CARDS.find(function(card) {
    return card && ((cardName && card.name === cardName) || (ability && card.ability === ability));
  }) || null;
}

function getStatusEntryPrintedEffect(entry) {
  const explicit = entry && entry.printedEffect ? String(entry.printedEffect) : '';
  if(explicit) return explicit;
  const sourceCard = findStatusEffectSourceCard(entry);
  return sourceCard && sourceCard.effect ? String(sourceCard.effect) : '';
}

function normalizeStatusEffectText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function measuredTopbarStatusWidth(container, count) {
  if(!container || count <= 0) return 0;
  const children = Array.from(container.children || []).slice(0, count);
  const style = typeof getComputedStyle === 'function' ? getComputedStyle(container) : null;
  const gap = style ? (parseFloat(style.columnGap || style.gap) || 0) : 0;
  return children.reduce(function(total, child) {
    const rect = child && child.getBoundingClientRect ? child.getBoundingClientRect() : null;
    return total + Math.ceil(rect && rect.width ? rect.width : (child && child.offsetWidth ? child.offsetWidth : 142));
  }, 0) + Math.max(0, children.length - 1) * gap;
}

function measuredTopbarStatusGap(container) {
  const style = container && typeof getComputedStyle === 'function' ? getComputedStyle(container) : null;
  return style ? (parseFloat(style.columnGap || style.gap) || 0) : 0;
}

function measuredTopbarChildWidth(container, index) {
  const child = container && container.children ? container.children[index] : null;
  if(!child) return 142;
  const rect = child.getBoundingClientRect ? child.getBoundingClientRect() : null;
  return Math.ceil(rect && rect.width ? rect.width : (child.offsetWidth || 142));
}

function getTopbarStatusAvailableWidth(container, side, horizontalPadding) {
  if(!container) return 0;
  const base = Math.max(0, Math.floor(container.clientWidth - (Number(horizontalPadding) || 0)));
  if(!container.getBoundingClientRect || typeof window === 'undefined') return base;
  const rect = container.getBoundingClientRect();
  const safeMargin = 8;
  const viewportWidth = Math.max(0, Number(window.innerWidth) || 0);
  const viewportRoom = side === 'left'
    ? Math.max(0, Math.floor(rect.right - safeMargin))
    : Math.max(0, Math.floor(viewportWidth - rect.left - safeMargin));
  return Math.max(0, Math.min(base, viewportRoom));
}

function cloneTopbarStatusEffect(entry, extra) {
  return Object.assign({}, entry || {}, extra || {});
}

function fitTopbarStatusTail(effects, container, visibleCount, availableWidth, includeOverflow) {
  if(!visibleCount) {
    const width = includeOverflow ? TOPBAR_STATUS_OVERFLOW_WIDTH : 0;
    return width <= availableWidth ? [] : null;
  }
  const gap = measuredTopbarStatusGap(container);
  const prefixCount = Math.max(0, visibleCount - 1);
  const prefixWidth = measuredTopbarStatusWidth(container, prefixCount);
  const gapBeforeTail = prefixCount > 0 ? gap : 0;
  const gapBeforeOverflow = includeOverflow ? gap : 0;
  const reservedOverflow = includeOverflow ? TOPBAR_STATUS_OVERFLOW_WIDTH : 0;
  const remainingForTail = Math.floor(availableWidth - prefixWidth - gapBeforeTail - gapBeforeOverflow - reservedOverflow);
  if(remainingForTail < TOPBAR_STATUS_FLEX_MIN_WIDTH) return null;
  const shown = effects.slice(0, visibleCount).map(function(e){ return cloneTopbarStatusEffect(e); });
  const tail = shown[shown.length - 1];
  const measuredTail = measuredTopbarChildWidth(container, visibleCount - 1);
  if(tail && measuredTail > remainingForTail) {
    tail.extraClass = String(tail.extraClass || '').replace(/\s*effect-pill-flex-tail\b/g, '') + ' effect-pill-flex-tail';
    tail.maxWidth = remainingForTail;
    tail.flexTail = true;
  }
  return shown;
}

function compactTopbarStatusEffects(effects, side, container) {
  const list = Array.isArray(effects) ? effects : [];
  if(list.length <= 1) return list.slice();

  const containerStyle = container && typeof getComputedStyle === 'function' ? getComputedStyle(container) : null;
  const horizontalPadding = containerStyle
    ? (parseFloat(containerStyle.paddingLeft) || 0) + (parseFloat(containerStyle.paddingRight) || 0)
    : 0;
  const availableWidth = container
    ? getTopbarStatusAvailableWidth(container, side, horizontalPadding)
    : 0;
  const allWidth = measuredTopbarStatusWidth(container, list.length);
  if(availableWidth > 0 && allWidth <= availableWidth) return list.slice();

  if(availableWidth > 0) {
    const allWithFlexibleTail = fitTopbarStatusTail(list, container, list.length, availableWidth, false);
    if(allWithFlexibleTail) return allWithFlexibleTail;
  }

  let visibleCount = Math.min(TOPBAR_STATUS_TARGET_VISIBLE, list.length - 1);
  if(availableWidth > 0) {
    while(visibleCount > 0) {
      const flexibleShown = fitTopbarStatusTail(list, container, visibleCount, availableWidth, true);
      if(flexibleShown) break;
      visibleCount--;
    }
    while(visibleCount < list.length - 1) {
      const nextFlexibleShown = fitTopbarStatusTail(list, container, visibleCount + 1, availableWidth, true);
      if(!nextFlexibleShown) break;
      visibleCount++;
    }
  }
  const shown = (availableWidth > 0 && fitTopbarStatusTail(list, container, visibleCount, availableWidth, true)) || list.slice(0, visibleCount);
  const hidden = list.slice(visibleCount);
  shown.push({
    isOverflow: true,
    overflowEffects: hidden,
    overflowSide: side,
    icon: getStatusOverflowIcon(),
    label: '+' + hidden.length + ' Effects',
    cardName: side === 'left' ? 'Your Active Effects' : "Opponent's Active Effects",
    cardAbility: 'Status Summary',
    cardEffect: hidden.map(function(e){ return e && e.label ? e.label : e && e.cardName ? e.cardName : 'Effect'; }).join(', '),
    owner: side === 'left' ? getPerspectivePlayerIndex() : 1 - getPerspectivePlayerIndex(),
    extraClass: 'effect-pill-overflow',
    overflowSig: formatStatusOverflowEffects(hidden)
  });
  return shown;
}

let _statusEffectOverflowDropdown = null;
let _statusEffectOverflowAnchor = null;
let _statusEffectOverflowCloseTimer = 0;

function closeStatusEffectOverflowDropdown() {
  if(_statusEffectOverflowCloseTimer) {
    clearTimeout(_statusEffectOverflowCloseTimer);
    _statusEffectOverflowCloseTimer = 0;
  }
  if(_statusEffectOverflowAnchor) _statusEffectOverflowAnchor.setAttribute('aria-expanded', 'false');
  if(_statusEffectOverflowDropdown) _statusEffectOverflowDropdown.remove();
  _statusEffectOverflowDropdown = null;
  _statusEffectOverflowAnchor = null;
}

function cancelStatusEffectOverflowClose() {
  if(_statusEffectOverflowCloseTimer) {
    clearTimeout(_statusEffectOverflowCloseTimer);
    _statusEffectOverflowCloseTimer = 0;
  }
}

function scheduleStatusEffectOverflowClose() {
  cancelStatusEffectOverflowClose();
  _statusEffectOverflowCloseTimer = setTimeout(function(){
    _statusEffectOverflowCloseTimer = 0;
    closeStatusEffectOverflowDropdown();
  }, 140);
}

function positionStatusEffectOverflowDropdown(dropdown, anchor, side) {
  if(!dropdown || !anchor || !anchor.isConnected) return;
  const anchorRect = anchor.getBoundingClientRect();
  const width = Math.min(430, Math.max(300, window.innerWidth - 24));
  dropdown.style.width = width + 'px';
  const measured = dropdown.getBoundingClientRect();
  let left = side === 'right' ? anchorRect.right - width : anchorRect.left;
  left = Math.max(12, Math.min(window.innerWidth - width - 12, left));
  let top = anchorRect.bottom + 9;
  if(top + measured.height > window.innerHeight - 12) top = Math.max(12, anchorRect.top - measured.height - 9);
  dropdown.style.left = Math.round(left) + 'px';
  dropdown.style.top = Math.round(top) + 'px';
}

function trimStatusOverflowActiveLead(effect, effectName) {
  let text = String(effect || '').trim();
  const name = String(effectName || '').trim();
  if(!text || !name) return text;
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp('^' + escapedName + '\\s+is\\s+active\\s*:\\s*', 'i'), '').trim();
}

function showStatusEffectOverflowDropdown(effects, side, anchor) {
  const list = Array.isArray(effects) ? effects : [];
  if(!list.length || !anchor) return;
  cancelStatusEffectOverflowClose();
  if(_statusEffectOverflowAnchor === anchor && _statusEffectOverflowDropdown) {
    positionStatusEffectOverflowDropdown(_statusEffectOverflowDropdown, anchor, side);
    return;
  }
  closeStatusEffectOverflowDropdown();
  const ownerLabel = side === 'left' ? 'Your additional effects' : "Opponent's additional effects";
  const sideClass = side === 'left' ? 'effect-pill-mine' : 'effect-pill-opp';
  const rows = list.map(function(e) {
    const icon = e && e.icon ? e.icon : getStatusOverflowIcon();
    const effectName = e && (e.cardAbility || e.label) ? (e.cardAbility || e.label) : 'Active Effect';
    const sourceName = e && e.cardName ? e.cardName : 'Card Effect';
    const formattedEffect = e && (e.cardEffect || e.label)
      ? formatStatusEffectCopyForSide(e.cardEffect || e.label, side)
      : 'This effect is currently active.';
    const effect = trimStatusOverflowActiveLead(formattedEffect, effectName);
    const printedEffect = formatStatusEffectCopyForSide(getStatusEntryPrintedEffect(e), side);
    const showPrinted = printedEffect && normalizeStatusEffectText(printedEffect) !== normalizeStatusEffectText(effect);
    const turnsLeft = e && e.turnsLeft != null && e.turnsLeft !== ''
      ? String(e.turnsLeft) + ' turn' + (Number(e.turnsLeft) === 1 ? '' : 's') + ' left'
      : '';
    const extraClass = e && e.extraClass ? String(e.extraClass) : '';
    return '<div class="status-overflow-dropdown-row">' +
      '<div class="status-overflow-banner effect-pill ' + sideClass + (extraClass ? ' ' + extraClass : '') + '">' +
        '<span class="effect-pill-icon status-overflow-dropdown-icon">' + icon + '</span>' +
        '<span class="status-overflow-title">' + escapeHtml(effectName) + '</span>' +
        (turnsLeft ? '<span class="status-overflow-duration">' + escapeHtml(turnsLeft) + '</span>' : '') +
        '<div class="status-overflow-dropdown-effect">' + escapeHtml(effect) + '</div>' +
        (showPrinted ? '<div class="status-overflow-dropdown-printed" title="' + escapeHtml(printedEffect) + '"></div>' : '') +
      '</div>' +
    '</div>';
  }).join('');
  const dropdown = document.createElement('div');
  dropdown.id = 'status-effect-overflow-dropdown';
  dropdown.className = 'status-overflow-dropdown status-overflow-dropdown-' + side;
  dropdown.setAttribute('role', 'dialog');
  dropdown.setAttribute('aria-label', ownerLabel);
  dropdown.innerHTML = '<div class="status-overflow-dropdown-head"><span>' + escapeHtml(ownerLabel) + '</span><b>' + list.length + '</b></div>' +
    '<div class="status-overflow-dropdown-list">' + rows + '</div>';
  dropdown.addEventListener('mouseenter', cancelStatusEffectOverflowClose);
  dropdown.addEventListener('mouseleave', scheduleStatusEffectOverflowClose);
  document.body.appendChild(dropdown);
  _statusEffectOverflowDropdown = dropdown;
  _statusEffectOverflowAnchor = anchor;
  anchor.setAttribute('aria-expanded', 'true');
  positionStatusEffectOverflowDropdown(dropdown, anchor, side);
  requestAnimationFrame(function(){ if(dropdown.isConnected) dropdown.classList.add('is-open'); });
}

if(typeof document !== 'undefined' && !window.__fateStatusOverflowDropdownBound) {
  window.__fateStatusOverflowDropdownBound = true;
  document.addEventListener('pointerdown', function(ev){
    if(!_statusEffectOverflowDropdown) return;
    if(_statusEffectOverflowDropdown.contains(ev.target) || (_statusEffectOverflowAnchor && _statusEffectOverflowAnchor.contains(ev.target))) return;
    closeStatusEffectOverflowDropdown();
  }, true);
  let statusResizeFrame = 0;
  window.addEventListener('resize', function(){
    closeStatusEffectOverflowDropdown();
    if(statusResizeFrame) cancelAnimationFrame(statusResizeFrame);
    statusResizeFrame = requestAnimationFrame(function(){
      statusResizeFrame = 0;
      _topbarEffectsLastHtml = null;
      if(typeof renderTopbarEffects === 'function') renderTopbarEffects();
    });
  }, {passive:true});
}

function syncEffectPills(container, effects, side) {
  if(!container) return '';
  if(!effects.length) hideEffectTooltipPortal();
  var sideClass = side === 'left' ? 'effect-pill-mine' : 'effect-pill-opp';
  var signatureParts = [];
  for(var i = 0; i < effects.length; i++) {
    var e = effects[i] || {};
    var displayEffect = formatStatusEffectCopyForSide(e.cardEffect || '', side);
    var extraClass = e.extraClass ? ' ' + e.extraClass : '';
    var sig = [
      sideClass,
      extraClass,
      e.icon || '',
      e.label || '',
      e.cardName || '',
      e.cardAbility || '',
      displayEffect,
      e.sourceIid || '',
      e.statusInstanceKey || '',
      e.isOverflow ? 'overflow' : '',
      e.overflowSig || '',
      e.flexTail ? 'flex-tail' : '',
      e.maxWidth || ''
    ].join('|');
    signatureParts.push(sig);
    var pill = container.children[i];
    if(!pill || !pill.classList || !pill.classList.contains('effect-pill')) {
      pill = createEffectPillNode();
      if(container.children[i]) container.insertBefore(pill, container.children[i]);
      else container.appendChild(pill);
    }
    if(e.isOverflow) {
      pill._statusOverflowEffects = Array.isArray(e.overflowEffects) ? e.overflowEffects.slice() : [];
      pill._statusOverflowSide = side;
      pill.setAttribute('role', 'button');
      pill.setAttribute('tabindex', '0');
      pill.setAttribute('aria-label', 'Additional active effects');
      pill.setAttribute('aria-haspopup', 'dialog');
      pill.setAttribute('aria-expanded', 'false');
      pill.onmouseenter = function() {
        hideEffectTooltipPortal();
        showStatusEffectOverflowDropdown(this._statusOverflowEffects || [], this._statusOverflowSide || side, this);
      };
      pill.onmouseleave = scheduleStatusEffectOverflowClose;
      pill.onfocus = pill.onmouseenter;
      pill.onblur = scheduleStatusEffectOverflowClose;
      pill.onclick = null;
      pill.onkeydown = function(ev) {
        if(ev && (ev.key === 'Enter' || ev.key === ' ')) {
          ev.preventDefault();
          showStatusEffectOverflowDropdown(this._statusOverflowEffects || [], this._statusOverflowSide || side, this);
        } else if(ev && ev.key === 'Escape') {
          closeStatusEffectOverflowDropdown();
        }
      };
    } else {
      pill._statusOverflowEffects = null;
      pill._statusOverflowSide = null;
      pill.removeAttribute('role');
      pill.removeAttribute('tabindex');
      pill.removeAttribute('aria-label');
      pill.removeAttribute('aria-haspopup');
      pill.removeAttribute('aria-expanded');
      pill.onmouseenter = null;
      pill.onmouseleave = null;
      pill.onfocus = null;
      pill.onblur = null;
      pill.onclick = null;
      pill.onkeydown = null;
    }
    if(pill.dataset.effectSig === sig) continue;
    pill.dataset.effectSig = sig;
    pill.className = 'effect-pill ' + sideClass + extraClass;
    var iconEl = pill.querySelector('.effect-pill-icon');
    var labelEl = pill.querySelector('.effect-pill-label');
    var nameEl = pill.querySelector('.ept-name');
    var abilityEl = pill.querySelector('.ept-ability');
    var effectEl = pill.querySelector('.ept-effect');
    var ownerEl = pill.querySelector('.ept-owner');
    if(iconEl && iconEl.dataset.iconHtml !== (e.icon || '')) {
      iconEl.dataset.iconHtml = e.icon || '';
      iconEl.innerHTML = e.icon || '';
    }
    if(labelEl) labelEl.textContent = e.label || '';
    if(nameEl) nameEl.textContent = e.cardName || '';
    if(abilityEl) {
      abilityEl.textContent = e.cardAbility || '';
      abilityEl.style.display = e.cardAbility ? '' : 'none';
    }
    if(effectEl) effectEl.textContent = displayEffect;
    if(ownerEl) ownerEl.textContent = side === 'left' ? 'Your effect' : "Opponent's effect";
    if(e.maxWidth) {
      pill.style.maxWidth = Math.max(TOPBAR_STATUS_FLEX_MIN_WIDTH, Number(e.maxWidth) || TOPBAR_STATUS_FLEX_MIN_WIDTH) + 'px';
    } else {
      pill.style.maxWidth = '';
    }
  }
  while(container.children.length > effects.length) {
    container.removeChild(container.lastElementChild);
  }
  ensureEffectTooltipPositioning(container);
  return signatureParts.join('||');
}

function playerBannerSignatureFor(playerIndex) {
  const p = G.players?.[playerIndex] || {};
  const profile = G.playerProfiles && G.playerProfiles[playerIndex] || {};
  return [
    playerIndex,
    p.name || '',
    profile.name || '',
    profile.img || '',
    profile.crop || '',
    profile.elo ?? '',
    profile.wins ?? '',
    profile.losses ?? '',
    USER_PROFILE?.username || '',
    USER_PROFILE?.challengerElo || 0,
    USER_PROFILE?.elo || 0,
    USER_PROFILE?.challengerWins || 0,
    USER_PROFILE?.wins || 0,
    USER_PROFILE?.challengerLosses || 0,
    USER_PROFILE?.losses || 0
  ].join(':');
}

function getPlayerBannersSignature(currentPlayer, perspectivePlayer) {
  const myP = Number.isInteger(perspectivePlayer) ? perspectivePlayer : 0;
  const oppP = 1 - myP;
  const ai = G._selectedAI || {};
  return [
    myP,
    oppP,
    G.aiEnabled ? 1 : 0,
    G.aiDifficulty || '',
    ai.name || '',
    ai.elo || '',
    ai.img || '',
    CURRENT_MODE || '',
    playerBannerSignatureFor(myP),
    playerBannerSignatureFor(oppP)
  ].join('|');
}

function updatePlayerBannerActiveTurn(myP, oppP) {
  const sig = [myP, oppP, G.currentPlayer].join('|');
  if(sig === _lastPlayerBannerActiveSignature) return;
  _lastPlayerBannerActiveSignature = sig;
  const myBanner = document.querySelector('.my-banner');
  const oppBanner = document.querySelector('.opp-banner');
  if(myBanner) myBanner.classList.toggle('active-turn', G.currentPlayer===myP);
  if(oppBanner) oppBanner.classList.toggle('active-turn', G.currentPlayer===oppP);
}

function getTopBarEffectsSourceSignature() {
  const boardBits = [];
  if(typeof forEachBoardCard === 'function') {
    forEachBoardCard(function(c, z, r, col){
      if(!c) return;
      if(c.id === '20' || c.id === '07' || c.id === '50' || c.id === '51' || c.id === '56' || c.id === '67' || c.id === '71' || c.id === '81' || c.id === '87' || c.id === '99'){
        boardBits.push([c.iid, c.id, c.owner, c.faceDown ? 1 : 0, z, r, col, c.usesLeft ?? '', c._seculesUsed ? 1 : 0].join(':'));
      }
    });
  }
  const handBits = [];
  if(G && Array.isArray(G.players)) {
    G.players.forEach(function(player, holder){
      const hand = player && Array.isArray(player.hand) ? player.hand : [];
      hand.forEach(function(c){
        if(!c || String(c.id) !== '70' || !c.guerilla_transferred) return;
        handBits.push([holder, c.iid || '', c.guerilla_owner ?? '', c.guerilla_turnsLeft ?? 0].join(':'));
      });
    });
  }
  return [
    typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : 0,
    JSON.stringify(G.blockedCells || []),
    G.oppSuppressedNextTurn ? 1 : 0,
    G.suppressTarget ?? '',
    JSON.stringify(G._westCaribNext || null),
    G.majaEffectThisTurn ? 1 : 0,
    JSON.stringify(G._fortCalvinActive || []),
    G._artilleryLockedZone ?? '',
    G._artilleryLockTurnsLeft ?? '',
    G._artilleryLockOwner ?? '',
    JSON.stringify(G.erbsActive || []),
    JSON.stringify(G._riveraActiveEffects || {}),
    JSON.stringify(G._balladEffects || []),
    JSON.stringify(G._mailDeliveries || []),
    JSON.stringify(G._blameGameEffects || []),
    JSON.stringify(G._administrativeBloatEffects || []),
    JSON.stringify(G._selvaSupportBoosts || []),
    handBits.join(','),
    boardBits.join(',')
  ].join('|');
}

function renderTopbarEffects() {
  const bar = document.getElementById('topbar-effects');
  const leftBar = document.getElementById('tp-status-left');
  const rightBar = document.getElementById('tp-status-right');
  const statusDock = document.getElementById('game-status-dock');
  const statusLeft = document.getElementById('game-status-left');
  const statusRight = document.getElementById('game-status-right');
  // Clear old central effects bar; effects now live in left/right.
  clearNodeChildren(bar);

  if(!leftBar || !rightBar) return;

  // Determine who "I" am and who the opponent is
  const myP = getPerspectivePlayerIndex();
  const oppP = 1 - myP;

  // Collect all active effects with ownership
  if(typeof normalizeRiveraEffects === 'function') normalizeRiveraEffects();
  const allEffects = [];

  // Suppression — applied BY suppressor TO suppressTarget
  if(G.oppSuppressedNextTurn && G.suppressTarget !== undefined) {
    const appliedBy = (G.suppressTarget === oppP) ? myP : oppP;
    const card = CARDS.find(c=>c.id==='18');
    allEffects.push({
      icon: getStatusEffectIcon('semper'), label: card ? card.ability : 'Semper Fidelis',
      cardName: card ? card.name : '1st US Marines',
      cardAbility: card ? card.ability : 'Semper Fidelis',
      cardEffect: card ? card.effect : 'Opponent cannot activate supporter when-set effects next turn.',
      owner: appliedBy
    });
  }

  // Blocked cells — determine owner from the card that caused each block
  if(G.blockedCells && G.blockedCells.length > 0) {
    const carolynBlocks = G.blockedCells.filter(b => b.type === 'carolyn');
    const zoeBlocks = G.blockedCells.filter(b => b.type === 'zoe');
    if(carolynBlocks.length > 0) {
      let cOwner = typeof carolynBlocks[0].owner === 'number' ? carolynBlocks[0].owner : oppP;
      const card = CARDS.find(c => c.id === '17');
      allEffects.push({
        icon: getStatusEffectIcon('carolyn_lock'), label: card ? card.ability : 'Entropic Chaos',
        cardName: card ? card.name : 'Carolyn',
        cardAbility: card ? card.ability : '',
        cardEffect: card ? card.effect : 'Permanently locked cells. No cards can be placed there.',
        owner: cOwner
      });
    }
    if(zoeBlocks.length > 0) {
      const card = CARDS.find(c => c.id === '04');
      zoeBlocks.forEach(function(block, index){
        const zOwner = typeof block.owner === 'number' ? block.owner : oppP;
        allEffects.push({
          icon: getStatusEffectIcon('zoe_block'), label: card ? card.ability : 'INTJ Stare',
          cardName: card ? card.name : 'Zoe',
          cardAbility: card ? card.ability : 'INTJ Stare',
          cardEffect: card ? card.effect : 'Opponent cannot consolidate on or from the selected square.',
          owner: zOwner,
          sourceIid:block.sourceIid,
          statusInstanceKey:'zoe:' + (block.sourceIid || [block.z, block.r, block.c, index].join(':'))
        });
      });
    }
  }

  // WCI Bonus — benefits the player who placed it (current player context)
  if(G._westCaribNext) {
    const card = CARDS.find(c => c.id === '33');
    const wciOwner = typeof G._westCaribNext === 'object' && typeof G._westCaribNext.owner === 'number' ? G._westCaribNext.owner : myP;
    allEffects.push({
      icon: getStatusEffectIcon('wci_bonus'), label: card ? card.ability : 'The West Caribbea Infantry',
      cardName: card ? card.name : 'West Caribbea Infantry',
      cardAbility: card ? card.ability : '',
      cardEffect: card ? card.effect : 'Next character added to your hand costs 1 less Reinforcement and gains 2 Fate.',
      owner: wciOwner
    });
  }

  const marieCard = CARDS.find(c => c.id === '36');
  forEachBoardCard((c, z) => {
    if(c && c.id === '36' && !isFaceDownCard(c) && !(typeof isCardEffectSuppressed === 'function' && isCardEffectSuppressed(c))) {
      const reductions = Math.max(0, Math.floor(Math.abs(Number(G.fateModifiers?.['deterrance_z' + z] || 0)) / 4));
      allEffects.push({
        icon: getStatusEffectIcon('marie_deterrence'),
        label: marieCard ? marieCard.ability : 'Deterrance',
        cardName: marieCard ? marieCard.name : "Marie L'amboure",
        cardAbility: marieCard ? marieCard.ability : 'Deterrance',
        cardEffect: marieCard ? marieCard.effect : "Opponent consolidations in this zone reduce that zone's total Fate by 4.",
        owner: c.owner,
        extraClass: 'effect-pill-marie'
      });
    }
  });

  const chaparralCard = CARDS.find(c => c.id === '78');
  forEachBoardCard(function(c, z){
    if(!c || String(c.id || '') !== '78' || c._chaparralAmbushUsed || isFaceDownCard(c)) return;
    if(typeof isSupporterEffectSuppressed === 'function' && isSupporterEffectSuppressed(c)) return;
    allEffects.push({
      icon:getStatusEffectIcon('chaparral'),
      label:chaparralCard ? chaparralCard.ability : 'Chaparral Ambush',
      cardName:chaparralCard ? chaparralCard.name : 'Chaparral Hoplite',
      cardAbility:chaparralCard ? chaparralCard.ability : 'Chaparral Ambush',
      cardEffect:(chaparralCard ? chaparralCard.effect : 'The next consolidation in this zone may be set face down.') + ' Ready in Zone ' + (z + 1) + '.',
      owner:c.owner,
      extraClass:'effect-pill-chaparral'
    });
  });

  // Maja unlimited supporters
  if(G.majaEffectThisTurn) {
    let majaOwner = myP;
    forEachBoardCard(c => { if(c.id === '07') majaOwner = c.owner; });
    const card = CARDS.find(c => c.id === '07');
    allEffects.push({
      icon: getStatusEffectIcon('maja_unlimited'), label: card ? card.ability : 'Oblique Order',
      cardName: card ? card.name : 'Maja Kaminska',
      cardAbility: card ? card.ability : '',
      cardEffect: card ? card.effect : 'Unlimited supporters this turn.',
      owner: majaOwner
    });
  }

  // Fort Calvin Watcher — reveals opponent's next draws
  // Selva Islands Pirate - extra Supporter placements this turn.
  if(Array.isArray(G._selvaSupportBoosts)) {
    const card = CARDS.find(c => c.id === '74');
    G._selvaSupportBoosts.forEach(function(fx, owner){
      if(!fx || fx.turn !== G.turn || owner !== G.currentPlayer) return;
      const extra = Math.max(0, Number(fx.extraSupports) || 0);
      if(extra <= 0) return;
      const total = Math.max(0, Number(G.maxSupportsPerTurn) || 0) + Math.max(0, Number(G.extraSupportsThisTurn) || 0);
      allEffects.push({
        icon: getStatusEffectIcon('selva'),
        label: card ? card.ability : 'A New Pacifica',
        cardName: card ? card.name : 'Selva Islands Pirate',
        cardAbility: card ? card.ability : 'A New Pacifica',
        cardEffect: '+' + extra + ' Supporter placement' + (extra === 1 ? '' : 's') + ' this turn. You can set up to ' + total + ' Supporters this turn.',
        owner: owner,
        extraClass: 'effect-pill-selva',
        turnsLeft: 1
      });
    });
  }

  const wineCountryCard = CARDS.find(c => c.id === '70');
  if(G && Array.isArray(G.players)) {
    G.players.forEach(function(player, holder){
      const hand = player && Array.isArray(player.hand) ? player.hand : [];
      const infiltrators = hand.filter(function(c){
        return c && String(c.id) === '70' && c.guerilla_transferred && (Number(c.guerilla_turnsLeft) || 0) > 0;
      });
      if(!infiltrators.length) return;
      const turns = Math.max(0, Math.max.apply(null, infiltrators.map(function(c){ return Number(c.guerilla_turnsLeft) || 0; })));
      const count = infiltrators.length;
      const sourceOwner = coerceStatusOwner(infiltrators[0].guerilla_owner, 1 - holder);
      allEffects.push({
        icon:getStatusEffectIcon('guerilla'),
        label:'A Gun Behind Every Grapevine',
        cardName:wineCountryCard ? wineCountryCard.name : 'Wine Country Guerilla',
        cardAbility:wineCountryCard ? wineCountryCard.ability : 'A Gun Behind Every Grapevine',
        cardEffect:'Wine Country Guerilla is infiltrating the opposing hand. At the start of that opponent\'s turn, it reduces a random eligible card in their hand by 2 Fate. ' + turns + ' turn' + (turns === 1 ? '' : 's') + ' remaining.',
        owner:sourceOwner,
        extraClass:'effect-pill-guerilla',
        turnsLeft:turns
      });
    });
  }

  // Fort Calvin Watcher - reveals opponent's next draws.
  if(G._fortCalvinActive && G._fortCalvinActive.length > 0) {
    G._fortCalvinActive.filter(w => w.remaining > 0).forEach(w => {
      const card = CARDS.find(c => c.id === '71');
      allEffects.push({
        icon: getStatusEffectIcon('fort_calvin'), label: card ? card.ability : 'All Eyes on the I-15',
        cardName: card ? card.name : 'Fort Calvin Watcher',
        cardAbility: card ? card.ability : 'All Eyes on the I-15',
        cardEffect: card ? card.effect : 'Next ' + w.remaining + ' opponent draw-phase cards will be revealed.',
        owner: w.owner
      });
    });
  }

  // Artillery Lock — Berkeley CS Major zone lock
  if(typeof G._artilleryLockedZone === 'number' && G._artilleryLockTurnsLeft > 0) {
    const sourceOwner = 1 - G._artilleryLockOwner;
    const card = CARDS.find(c => c.id === '50');
    allEffects.push({
      icon: getStatusEffectIcon('berkeley_lock'), label: card ? card.ability : 'Artillery Distance',
      cardName: card ? card.name : 'Berkeley CS Major',
      cardAbility: card ? card.ability : 'Artillery Distance',
      cardEffect: 'Zone ' + (G._artilleryLockedZone + 1) + ' is locked for opponent\'s next turn.',
      owner: sourceOwner,
      extraClass: 'effect-pill-berkeley',
      turnsLeft: G._artilleryLockTurnsLeft
    });
  }

  // Christopher Erbs — waiting for next draw
  if(G.erbsActive) {
    for(let p = 0; p < 2; p++) {
      if(G.erbsActive[p]) {
        const card = CARDS.find(c => c.id === '40');
        allEffects.push({
          icon: getStatusEffectIcon('erbs_ready'), label: card ? card.ability : 'Hard Times, Strong Men',
          cardName: card ? card.name : 'Christopher Erbs',
          cardAbility: card ? card.ability : 'Hard Times, Strong Men',
          cardEffect: card ? card.effect : 'Waiting — will activate on next draw phase.',
          owner: p
        });
      }
    }
  }

  // Rivera — 3 of owner's turns affiliation buff
  const wojciechStatusesByOwner = {0:[], 1:[]};
  const lydiaStatusesByOwner = {0:[], 1:[]};
  const securesStatusesByOwner = {0:[], 1:[]};
  if(typeof forEachBoardCard === 'function') {
    forEachBoardCard(function(c, z){
      if(!c || isFaceDownCard(c)) return;
      if(c.id === '81' && !(typeof isCardEffectSuppressed === 'function' ? isCardEffectSuppressed(c) : (c._lydiaSuppressed || c._reactionSuppressed))) {
        if(!wojciechStatusesByOwner[c.owner]) wojciechStatusesByOwner[c.owner] = [];
        wojciechStatusesByOwner[c.owner].push({ card: c, zone: z + 1 });
      }
      if(c.id === '56' && !c.immuneFlag) {
        const uses = Math.max(0, Number(c.usesLeft == null ? 5 : c.usesLeft) || 0);
        if(uses > 0) {
          if(!lydiaStatusesByOwner[c.owner]) lydiaStatusesByOwner[c.owner] = [];
          lydiaStatusesByOwner[c.owner].push({ card: c, uses: uses });
        }
      }
      if(c.id === '67' && !c.immuneFlag) {
        const uses = Math.max(0, Number(c.usesLeft == null ? (c._seculesUsed ? 0 : 1) : c.usesLeft) || 0);
        if(uses > 0) {
          if(!securesStatusesByOwner[c.owner]) securesStatusesByOwner[c.owner] = [];
          securesStatusesByOwner[c.owner].push({ card: c, uses: uses });
        }
      }
    });
  }
  const wojciechCard = CARDS.find(c => c.id === '81');
  [0,1].forEach(function(owner){
    (wojciechStatusesByOwner[owner] || []).forEach(function(entry){
      allEffects.push({
        icon: getStatusEffectIcon('wojciech'),
        label: wojciechCard ? wojciechCard.ability : 'Warm Pierogi',
        cardName: wojciechCard ? wojciechCard.name : 'Wojciech',
        cardAbility: wojciechCard ? wojciechCard.ability : 'Warm Pierogi',
        cardEffect: wojciechCard ? wojciechCard.effect : 'Character cards in this card\'s zone that cost 2 or more Reinforcement cost 1 less.',
        owner: owner,
        extraClass: 'effect-pill-wojciech',
        sourceIid: entry.card && entry.card.iid,
        statusInstanceKey: 'wojciech:' + (entry.card && entry.card.iid ? entry.card.iid : entry.zone)
      });
    });
  });
  const lydiaCard = CARDS.find(c => c.id === '56');
  [0,1].forEach(function(owner){
    (lydiaStatusesByOwner[owner] || []).forEach(function(entry){
      allEffects.push({
        icon: getStatusEffectIcon('lydia'),
        label: lydiaCard ? lydiaCard.ability : 'Berknomaly!?@#',
        cardName: lydiaCard ? lydiaCard.name : 'Lydia',
        cardAbility: lydiaCard ? lydiaCard.ability : 'Berknomaly!?@#',
        cardEffect: lydiaCard ? lydiaCard.effect : 'Can negate or suppress opponent Supporter effect activations.',
        owner: owner,
        extraClass: 'effect-pill-lydia',
        sourceIid: entry.card && entry.card.iid,
        statusInstanceKey: 'lydia:' + (entry.card && entry.card.iid ? entry.card.iid : entry.uses)
      });
    });
  });
  const seculesCard = CARDS.find(c => c.id === '67');
  [0,1].forEach(function(owner){
    (securesStatusesByOwner[owner] || []).forEach(function(entry){
      allEffects.push({
        icon: getStatusEffectIcon('secules'),
        label: seculesCard ? seculesCard.ability : '"You Just Said Nothing"',
        cardName: seculesCard ? seculesCard.name : 'Mr. Secules',
        cardAbility: seculesCard ? seculesCard.ability : '"You Just Said Nothing"',
        cardEffect: seculesCard ? seculesCard.effect : 'One-use negation is ready.',
        owner: owner,
        extraClass: 'effect-pill-secules',
        sourceIid: entry.card && entry.card.iid,
        statusInstanceKey: 'secules:' + (entry.card && entry.card.iid ? entry.card.iid : entry.uses)
      });
    });
  });

  if(Array.isArray(G._balladEffects)) {
    G._balladEffects.forEach(function(ownerEffects, owner){
      const effects = Array.isArray(ownerEffects) ? ownerEffects : (ownerEffects ? [ownerEffects] : []);
      effects.forEach(function(fx, index){
        if(!fx || !fx.active || fx.ended) return;
      const card = CARDS.find(c => c.id === '87');
      allEffects.push({
        icon: getStatusEffectIcon('ballad'),
        label: card ? card.ability : 'A Noble Effort at a Ballad',
        cardName: card ? card.name : 'Kvetka Svoboda',
        cardAbility: card ? card.ability : 'A Noble Effort at a Ballad',
        cardEffect: 'A Noble Effort at a Ballad is active: your consolidations gain 3 Fate until you set a Supporter.',
        printedEffect: card ? card.effect : 'Starting now, when you would consolidate a card, it gains 3 Fate, and this bonus continues until you set a Supporter.',
        owner: owner,
        extraClass: 'effect-pill-music',
        sourceIid: fx.sourceIid,
        statusInstanceKey: 'ballad:' + (fx.sourceIid || index)
      });
      });
    });
  }

  if(Array.isArray(G._mailDeliveries)) {
    const card = CARDS.find(c => c.id === '94');
    G._mailDeliveries.forEach(function(delivery){
      if(!delivery || delivery.player == null) return;
      const incoming = delivery.card && delivery.card.name ? delivery.card.name : 'Triangle card';
      allEffects.push({
        icon: getStatusEffectIcon('mail_delivery'),
        label: card ? card.ability : 'Mail Delivery',
        cardName: card ? card.name : 'Wodny Potok Mailman',
        cardAbility: card ? card.ability : 'Mail Delivery',
        cardEffect: incoming + ' will be added to hand when delivery completes.',
        owner: coerceStatusOwner(delivery.player, myP),
        extraClass: 'effect-pill-mail'
      });
    });
  }

  if(Array.isArray(G._blameGameEffects)) {
    const card = CARDS.find(c => c.id === '99');
    G._blameGameEffects.forEach(function(fx, owner){
      if(!fx || !fx.active || (Number(fx.turnsLeft) || 0) <= 0) return;
      const turns = Math.max(0, Number(fx.turnsLeft) || 0);
      allEffects.push({
        icon: getStatusEffectIcon('blame_game'),
        label: card ? card.ability : 'The Blame Game',
        cardName: card ? card.name : 'Rozsi and Zsofia (Youth)',
        cardAbility: card ? card.ability : 'The Blame Game',
        cardEffect: card ? card.effect : 'Supporters are classified as Characters for consolidation.',
        owner: coerceStatusOwner(owner, myP),
        extraClass: 'effect-pill-blame-game',
        turnsLeft: turns
      });
    });
  }

  if(Array.isArray(G._landscapeChangeLocks)) {
    const card = CARDS.find(c => c.id === '91');
    G._landscapeChangeLocks.forEach(function(turns, lockedPlayer){
      const turnsLeft = Math.max(0, Number(turns) || 0);
      if(turnsLeft <= 0) return;
      allEffects.push({
        icon: getStatusEffectIcon('village_lock'),
        label: card ? card.ability : 'A Snowy Village',
        cardName: card ? card.name : 'Wodny Potok Villager',
        cardAbility: card ? card.ability : 'A Snowy Village',
        cardEffect: 'Opponent cannot change the current landscape.',
        owner: coerceStatusOwner(1 - lockedPlayer, myP),
        extraClass: 'effect-pill-house',
        turnsLeft
      });
    });
  }

  if(G._riveraActiveEffects) {
    Object.keys(G._riveraActiveEffects).forEach(iid => {
      const eff = G._riveraActiveEffects[iid];
      if(eff && eff.turnsLeft > 0) {
        const card = CARDS.find(c => c.id === '51');
        const affLabel = AFF_LABEL[eff.aff] || eff.aff;
        allEffects.push({
          icon: getStatusEffectIcon('rivera_aff'),
          label: card ? card.ability : 'Jorge\'s Right Hand Man',
          cardName: card ? card.name : 'Rivera',
          cardAbility: card ? card.ability : 'Jorge\'s Right Hand Man',
          cardEffect: 'Character cards you set with ' + affLabel + ' gain 3 Fate. ' + eff.turnsLeft + ' of your turns remaining.',
          owner: coerceStatusOwner(eff.owner, myP),
          extraClass: 'effect-pill-rivera aff-' + String(eff.aff || '').replace(/[^a-z0-9_-]/gi,''),
          turnsLeft: eff.turnsLeft
        });
      }
    });
  }

  if(Array.isArray(G._administrativeBloatEffects)) {
    const card = CARDS.find(c => c.id === '97');
    G._administrativeBloatEffects.forEach(function(fx){
      if(!fx || (Number(fx.remaining) || 0) <= 0) return;
      const remaining = Math.max(0, Number(fx.remaining) || 0);
      allEffects.push({
        icon:getStatusEffectIcon('administrative_bloat'),
        label:card ? card.ability : 'Administrative Bloat',
        cardName:card ? card.name : 'Visegrad Politician',
        cardAbility:card ? card.ability : 'Administrative Bloat',
        cardEffect:remaining === 1
          ? 'The opponent\'s next consolidation costs 1 extra Reinforcement.'
          : 'The opponent\'s next ' + remaining + ' consolidations cost 1 extra Reinforcement.',
        owner:coerceStatusOwner(fx.sourceOwner, myP),
        extraClass:'effect-pill-administrative-bloat',
        turnsLeft:remaining
      });
    });
  }

  const busserMovesByOwner = {0:0, 1:0};
  if(typeof forEachBoardCard === 'function') {
    forEachBoardCard(function(c){
      if(!c || isFaceDownCard(c) || c.cantBeMoved || c.immuneFlag || String(c.id || '') === '76') return;
      if(c._busserSourceIid && typeof window.isStoredEffectSourceSuppressed === 'function' && window.isStoredEffectSourceSuppressed(c._busserSourceIid)) return;
      const moves = typeof getBusserTurnsLeft === 'function' ? getBusserTurnsLeft(c) : Math.max(0, Number(c._busserTurnsLeft || c._busserMoves || 0) || 0);
      if(moves <= 0) return;
      const owner = coerceStatusOwner(c._busserOwner == null ? c.owner : c._busserOwner, c.owner);
      busserMovesByOwner[owner] = (Number(busserMovesByOwner[owner]) || 0) + moves;
    });
  }
  const busserCard = CARDS.find(c => c.id === '69');
  [0,1].forEach(function(owner){
    const moves = Math.max(0, Number(busserMovesByOwner[owner]) || 0);
    if(!moves) return;
    allEffects.push({
      icon: getStatusEffectIcon('busser_boot'),
      label: busserCard ? busserCard.ability : 'Corner! Behind!',
      cardName: busserCard ? busserCard.name : 'Breakfast Republic Busser',
      cardAbility: busserCard ? busserCard.ability : 'Corner! Behind!',
      cardEffect: 'Friendly cards can use Busser movement once per turn for ' + moves + ' turn' + (moves === 1 ? '' : 's') + '.',
      owner: owner,
      extraClass: 'effect-pill-busser',
      turnsLeft: moves
    });
  });

  // Split effects by ownership
  const myEffects = allEffects.filter(e => coerceStatusOwner(e.owner, myP) === myP);
  const oppEffects = allEffects.filter(e => coerceStatusOwner(e.owner, oppP) === oppP);
  const mySig = myEffects.map(e => [e.icon, e.label, e.cardName, e.cardAbility, e.cardEffect, e.extraClass || '', e.sourceIid || '', e.statusInstanceKey || ''].join('|')).join('||');
  const oppSig = oppEffects.map(e => [e.icon, e.label, e.cardName, e.cardAbility, e.cardEffect, e.extraClass || '', e.sourceIid || '', e.statusInstanceKey || ''].join('|')).join('||');
  const nextHtml = mySig + '::' + oppSig;
  if(_topbarEffectsLastHtml === nextHtml) {
    return;
  }
  _topbarEffectsLastHtml = nextHtml;
  syncEffectPills(leftBar, myEffects, 'left');
  syncEffectPills(rightBar, oppEffects, 'right');
  const myVisibleEffects = compactTopbarStatusEffects(myEffects, 'left', leftBar);
  const oppVisibleEffects = compactTopbarStatusEffects(oppEffects, 'right', rightBar);
  leftBar.dataset.effectPillsSig = syncEffectPills(leftBar, myVisibleEffects, 'left');
  rightBar.dataset.effectPillsSig = syncEffectPills(rightBar, oppVisibleEffects, 'right');

  if(statusDock) {
    statusDock.classList.remove('active','has-both-sides');
    statusDock.style.display = 'none';
  }
  clearNodeChildren(statusLeft);
  clearNodeChildren(statusRight);
}

function applyWinScreenGameBackground() {
  const winScreen = document.getElementById('s-win');
  const gameScreen = document.getElementById('s-game');
  if(!winScreen) return;
  let gameBgVar = gameScreen ? gameScreen.style.getPropertyValue('--game-bg-img') : '';
  const lastBg = window.__fateLastGameBackground || null;
  if(!gameBgVar && typeof _lastGameSong !== 'undefined' && typeof INGAME_BG_PATH === 'function') {
    const bgNum = Math.max(1, Math.min(16, parseInt(String(_lastGameSong || 'board1').replace('board',''), 10) || 1));
    gameBgVar = `url(${INGAME_BG_PATH(bgNum)})`;
  }
  if(!gameBgVar && lastBg?.cssVar) gameBgVar = lastBg.cssVar;
  if(gameBgVar) {
    winScreen.style.setProperty('--game-bg-img', gameBgVar);
    winScreen.style.setProperty('background-image', `linear-gradient(rgba(3,3,6,.58),rgba(3,3,6,.78)), ${gameBgVar}`, 'important');
    winScreen.style.setProperty('background-size', 'cover, cover', 'important');
    winScreen.style.setProperty('background-position', 'center, center', 'important');
    winScreen.style.setProperty('background-repeat', 'no-repeat, no-repeat', 'important');
  } else if(gameScreen) {
    const gameBg = getComputedStyle(gameScreen).backgroundImage;
    if(gameBg && gameBg !== 'none') winScreen.style.setProperty('background-image', gameBg, 'important');
  } else if(lastBg?.backgroundImage) {
    winScreen.style.setProperty('background-image', lastBg.backgroundImage, 'important');
  }
  winScreen.classList.add('win-screen-game-bg');
}

function renderLevelBadge(level, opts={}){
  const safeLevel = Math.max(1, parseInt(level,10) || 1);
  const badge = getBadgeForLevel(safeLevel) || LEVEL_BADGES[0];
  const sm = opts.small ? ' sm' : '';
  const badgeLabel = opts.small ? badge.name.replace(/[^A-Za-z]/g,'').slice(0,3).toUpperCase() : badge.name.toUpperCase();
  return `<span class="level-badge${sm}" title="${escapeHtml(badge.name)} Tier" style="--badge-color:${badge.color};--badge-glow:${badge.glow};--badge-bg:linear-gradient(180deg,${badge.color},#1a1d27);">
    <span class="lb-crest"><span class="lb-icon">${badge.image?`<img src="${badge.image}" alt="${escapeHtml(badge.name)}">`:escapeHtml(badge.name.slice(0,1))}</span></span>
    <span class="lb-copy"><span class="lb-core"><span class="lb-label">${badgeLabel}</span><span class="lb-lv">${safeLevel}</span></span></span>
  </span>`;
}

function positionOnlineAccountBadgeNearTitleProfile() {
  const badge = document.getElementById('fate-online-account');
  if(!badge) return;
  if(document.getElementById('fate-corner-dock') && typeof window.scheduleFateCornerDock === 'function'){
    window.scheduleFateCornerDock();
    return;
  }
  badge.style.setProperty('position', 'fixed', 'important');
  badge.style.setProperty('left', 'auto', 'important');
  badge.style.setProperty('top', 'auto', 'important');
  badge.style.setProperty('right', '18px', 'important');
  badge.style.setProperty('bottom', '18px', 'important');
  badge.style.setProperty('transform', 'none', 'important');
  badge.style.setProperty('width', 'min(300px, calc(100vw - 24px))', 'important');
  badge.style.setProperty('max-width', '300px', 'important');
}
if(typeof window !== 'undefined') window.positionOnlineAccountBadgeNearTitleProfile = positionOnlineAccountBadgeNearTitleProfile;

let _titleAccountPositionTimer = 0;
let _titleAccountPositionRaf = 0;
function scheduleTitleAccountPosition(delay=40) {
  if(typeof window === 'undefined') return;
  if(_titleAccountPositionTimer) clearTimeout(_titleAccountPositionTimer);
  if(_titleAccountPositionRaf) cancelAnimationFrame(_titleAccountPositionRaf);
  _titleAccountPositionTimer = setTimeout(function(){
    _titleAccountPositionTimer = 0;
    _titleAccountPositionRaf = requestAnimationFrame(function(){
      _titleAccountPositionRaf = 0;
      positionOnlineAccountBadgeNearTitleProfile();
    });
  }, delay);
}
if(typeof window !== 'undefined') window.scheduleTitleAccountPosition = scheduleTitleAccountPosition;

function renderTitleProfile(){
  const el = document.getElementById('title-profile');
  if(!el) return;
  el.classList.remove('title-profile-fallback');
  const fallbackSrc = typeof getDefaultProfileImgSrc === 'function' ? getDefaultProfileImgSrc() : 'blank.png';
  const src = typeof getProfileImgSrc === 'function' ? (getProfileImgSrc() || fallbackSrc) : fallbackSrc;
  const cropStyle = typeof getProfileCropStyle==='function' ? getProfileCropStyle() : 'object-fit:cover;object-position:center 20%;';
  const elo = USER_PROFILE.challengerElo||600;
  const rank = typeof getRank === 'function' ? getRank(elo) : null;
  const picFrame = typeof getRankFrameStyle === 'function' ? getRankFrameStyle(elo,'icon') : '';
  const nextLevelXp = USER_PROFILE.level >= MAX_LEVEL ? 0 : getXpForLevel(USER_PROFILE.level+1);
  const xpPct = USER_PROFILE.level >= MAX_LEVEL ? 100 : Math.max(0, Math.min(100, Math.round(((USER_PROFILE.xp||0) / nextLevelXp) * 100)));
  const rankColor = rank && rank.color ? rank.color : '#c9a84c';
  const idx = typeof getRankTierIndex === 'function' && rank ? getRankTierIndex(rank) : 0;
  const rgb = typeof hexToRgb === 'function' ? hexToRgb(rankColor) : {r:201,g:168,b:76};
  const borderW = 2.5 + idx * 0.3;
  const glowR = 16 + idx * 6;
  const glowA = (0.18 + idx * 0.04).toFixed(2);
  const spreadW = (1.2 + idx * 0.25).toFixed(1);
  const spreadA = (0.06 + idx * 0.015).toFixed(3);
  const panelStyle = `border:${borderW.toFixed(1)}px solid ${rankColor}!important;box-shadow:0 14px 36px rgba(0,0,0,.6),0 0 ${glowR}px rgba(${rgb.r},${rgb.g},${rgb.b},${glowA}),0 0 0 ${spreadW}px rgba(${rgb.r},${rgb.g},${rgb.b},${spreadA}),inset 0 0 0 1px rgba(255,255,255,${(0.04+idx*0.01).toFixed(2)})!important;`;
  el.style.cssText = panelStyle + '--title-profile-rank-color:'+rankColor+';--title-profile-rank-r:'+rgb.r+';--title-profile-rank-g:'+rgb.g+';--title-profile-rank-b:'+rgb.b+';';
  el.innerHTML = `
    <div class="tp-pic" style="${picFrame}">${src?`<img src="${src}" style="${cropStyle}" alt="" onerror="this.onerror=null;this.src='${fallbackSrc}';">`:'<span class="pi-placeholder">Profile</span>'}</div>
    <div class="tp-info">
      <div class="tp-head">
        <div class="tp-name">${escapeHtml(USER_PROFILE.username||'Player')}</div>
      </div>
      <div class="tp-rank-block">
        <div class="tp-rank-row">${renderRankBadge(elo,'lg')}</div>
      </div>
      <div class="tp-bottom">
        <div class="tp-stat-row">
          ${renderLevelBadge(USER_PROFILE.level).replace('level-badge','level-badge title-level-badge')}
        </div>
        <div class="tp-xp-wrap">
          <div class="tp-xp"><div class="tp-xp-fill" style="width:${xpPct}%;"></div></div>
          <div class="tp-xp-copy">${USER_PROFILE.level >= MAX_LEVEL ? 'MAX LEVEL' : `${USER_PROFILE.xp||0} / ${nextLevelXp} XP`}</div>
        </div>
      </div>
    </div>`;
  scheduleTitleAccountPosition(40);
}

function updatePlayerStatBadge(el, opts) {
  if(!el) return;
  el.classList.add('in-game-rank-stat');
  const mode = opts && opts.mode ? opts.mode : 'local';
  const elo = opts ? opts.elo : null;
  const wins = opts ? (opts.wins || 0) : 0;
  const losses = opts ? (opts.losses || 0) : 0;
  const sig = [mode, elo ?? '', wins, losses].join('|');
  if(el.dataset.profileStatSig === sig) return;
  el.dataset.profileStatSig = sig;
  if(elo != null) {
    const nextHtml = renderRankBadge(elo, 'sm');
    if(el.innerHTML !== nextHtml) el.innerHTML = nextHtml;
    decorateInGameRankBadge(el);
  } else {
    if(el.textContent !== 'Local Player') el.textContent = 'Local Player';
  }
}

function decorateInGameRankBadge(el) {
  if(!el || !el.querySelector) return;
  const badge = el.querySelector('.rank-badge');
  const label = el.querySelector('.rank-badge-label');
  if(badge) badge.classList.add('in-game-rank-badge');
  if(!label) return;
  const raw = (label.dataset.rawRankName || label.textContent || '').replace(/\s+/g, ' ').trim();
  label.dataset.rawRankName = raw;
  if(badge) badge.classList.remove('rank-badge-two-line');
  label.classList.remove('rank-badge-label-two-line');
  if(badge) {
    badge.classList.add('in-game-rank-adaptive-v2');
    const rankKey = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if(rankKey) badge.classList.add('in-game-rank-name-' + rankKey);
    const icon = badge.querySelector('.rank-icon-img');
    const iconClass = icon && Array.from(icon.classList || []).find(cls => /^rank-icon-\d+$/.test(cls));
    if(iconClass) badge.classList.add('in-game-rank-' + iconClass);
  }
  let breakAt = raw.indexOf('-');
  let keepDelimiter = true;
  if(breakAt < 0) {
    keepDelimiter = false;
    const spaces = [];
    raw.replace(/\s/g, function(_, idx){ spaces.push(idx); return _; });
    if(spaces.length) {
      const mid = raw.length / 2;
      breakAt = spaces.reduce(function(best, idx){ return Math.abs(idx - mid) < Math.abs(best - mid) ? idx : best; }, spaces[0]);
    }
  }
  const shouldSplit = raw.length > 14 && breakAt > 0 && breakAt < raw.length - 1;
  if(shouldSplit) {
    const first = keepDelimiter ? raw.slice(0, breakAt + 1) : raw.slice(0, breakAt);
    const second = raw.slice(breakAt + 1).trim();
    applyInGameRankBadgeMetrics(badge, raw, [first.trim(), second]);
    if(badge) badge.classList.add('rank-badge-two-line');
    label.classList.add('rank-badge-label-two-line');
    label.innerHTML = '<span class="rank-badge-line rank-badge-line-main">' + escapeHtml(first.trim()) + '</span><span class="rank-badge-line rank-badge-line-sub">' + escapeHtml(second) + '</span>';
    return;
  }
  applyInGameRankBadgeMetrics(badge, raw, [raw]);
  label.innerHTML = escapeHtml(raw);
}

function estimateInGameRankLineUnits(text) {
  const value = String(text || '');
  let units = 0;
  for(let i = 0; i < value.length; i++) {
    const ch = value.charAt(i);
    if(ch === ' ') units += .32;
    else if(ch === '-' || ch === '/') units += .28;
    else if(/[MW]/.test(ch)) units += .78;
    else if(/[A-Z]/.test(ch)) units += .66;
    else if(/[ilI]/.test(ch)) units += .3;
    else if(/[0-9]/.test(ch)) units += .52;
    else units += .52;
  }
  return Math.max(1, units);
}

function applyInGameRankBadgeMetrics(badge, raw, lines) {
  if(!badge || !badge.style) return;
  const rawText = String(raw || '');
  const rankKey = rawText.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const rankLines = Array.isArray(lines) && lines.length ? lines : [raw || ''];
  const maxUnits = rankLines.reduce(function(max, line){
    return Math.max(max, estimateInGameRankLineUnits(line));
  }, 1);
  const twoLine = rankLines.length > 1;
  const labelWidthPx = twoLine ? 106 : 108;
  const fittedPx = labelWidthPx / maxUnits;
  const capPx = rankKey === 'high-marshall' ? 12.2 : (twoLine ? 13.2 : (rawText.length <= 8 ? 17 : 14.4));
  const floorPx = twoLine ? 10.6 : 11.4;
  const fontPx = Math.max(floorPx, Math.min(capPx, fittedPx));
  const baseIconShift = rawText.length <= 8 ? 0 : Math.max(2, Math.min(6, Math.round((14.8 - fontPx) * 1.05 + (twoLine ? 3 : 2))));
  const iconAdjust = rankKey === 'footman' ? 7 : (rankKey === 'captain-officer' ? 15 : (rankKey === 'high-marshall' ? -4 : 0));
  const iconShift = Math.max(-4, Math.min(17, baseIconShift + iconAdjust));
  const labelShift = (iconShift > 0 ? -1 : 0) + (rankKey === 'high-marshall' ? 1 : 0);
  const badgeShift = 0;
  const gapRem = iconShift > 0 ? .1 : .16;
  badge.style.setProperty('--rank-fit-font', (Math.round(fontPx * 100) / 100) + 'px');
  badge.style.setProperty('--rank-fit-line-height', twoLine ? '.88' : '1');
  badge.style.setProperty('--rank-fit-badge-shift', badgeShift + 'px');
  badge.style.setProperty('--rank-fit-icon-shift', iconShift + 'px');
  badge.style.setProperty('--rank-fit-label-shift', labelShift + 'px');
  badge.style.setProperty('--rank-fit-gap', gapRem + 'rem');
}

function shouldDeferMatchEntryCanvasPaint() {
  try {
    const perf = window.__fatePerf || {};
    const entry = perf.matchEntry;
    if(!entry || !entry.until) return false;
    const now = (performance && performance.now) ? performance.now() : Date.now();
    return now < Number(entry.until) + 260;
  } catch(e) {
    return false;
  }
}

function renderBannerCanvasImage(canvas, src, opts) {
  if(!canvas || !src || typeof window.renderCanvasImage !== 'function') return false;
  const options = opts || {};
  const sig = [
    src,
    options.mode || '',
    options.background || '',
    options.cropY == null ? '' : options.cropY,
    options.maxDpr == null ? '' : options.maxDpr
  ].join('|');
  if(canvas.dataset && canvas.dataset.profileCanvasSig === sig && canvas.__fateCanvasImageDrawn) return true;
  if(shouldDeferMatchEntryCanvasPaint()) {
    if(canvas.__fateProfileRenderTimer) clearTimeout(canvas.__fateProfileRenderTimer);
    canvas.__fateProfileRenderTimer = setTimeout(function(){
      canvas.__fateProfileRenderTimer = 0;
      if(!canvas.isConnected) return;
      window.renderCanvasImage(canvas, src, options);
      if(canvas.dataset) canvas.dataset.profileCanvasSig = sig;
    }, 220);
    return true;
  }
  const ok = window.renderCanvasImage(canvas, src, options);
  if(ok && canvas.dataset) canvas.dataset.profileCanvasSig = sig;
  return ok;
}

if(typeof window !== 'undefined' && !window.__fateTitleAccountPositionerInstalled){
  window.__fateTitleAccountPositionerInstalled = true;
  window.addEventListener('resize', ()=>scheduleTitleAccountPosition(40));
  window.addEventListener('fate-online-auth', ()=>scheduleTitleAccountPosition(40));
}

function updatePlayerBanners() {
  // Determine player indices
  const myP = getPerspectivePlayerIndex();
  const oppP = 1 - myP;
  const normalizeOnlineBannerProfile = (profile, playerIndex) => {
    const p = profile || {};
    const name = p.name || p.chosenUsername || p.displayName || p.username || p.baseCode || G.players[playerIndex]?.name || `Player ${playerIndex + 1}`;
    const img = window.FateOnline?.profilePhoto
      ? window.FateOnline.profilePhoto(p)
      : (p.img || p.photoURL || p.profileImg || p.pfp || 'blank.png');
    const crop = window.FateOnline?.profilePhotoCropStyle
      ? window.FateOnline.profilePhotoCropStyle(p, 'center 22%')
      : 'width:100%;height:100%;object-fit:cover;object-position:center 22%;';
    return {
      ...p,
      name,
      img,
      crop,
      elo:Number(p.elo ?? p.challengerElo ?? 600) || 600,
      wins:Number(p.wins ?? p.challengerWins ?? 0) || 0,
      losses:Number(p.losses ?? p.challengerLosses ?? 0) || 0
    };
  };
  const getBannerProfile = (playerIndex) => {
    const matchProfile = G.playerProfiles && G.playerProfiles[playerIndex];
    if(matchProfile) return normalizeOnlineBannerProfile(matchProfile, playerIndex);
    if(playerIndex === 0) {
      return {
        name: USER_PROFILE.username || G.players[0].name || 'Player 1',
        img: getProfileImgSrc(),
        crop: getProfileCropStyle(),
        elo: CURRENT_MODE==='challenger' ? (USER_PROFILE.challengerElo||600) : (USER_PROFILE.elo||600),
        wins: CURRENT_MODE==='challenger' ? (USER_PROFILE.challengerWins||0) : (USER_PROFILE.wins||0),
        losses: CURRENT_MODE==='challenger' ? (USER_PROFILE.challengerLosses||0) : (USER_PROFILE.losses||0)
      };
    }
    return {
      name: G.players[playerIndex]?.name || `Player ${playerIndex + 1}`,
      img: null,
      crop: '',
      elo: null,
      wins: null,
      losses: null
    };
  };
  const myProfile = getBannerProfile(myP);
  const myPicEl = document.getElementById('my-pic');
  const myNameEl = document.getElementById('my-name');
  const myStatEl = document.getElementById('my-stat');
  if(myPicEl){
    const _myFrameStyle = (myProfile.elo != null && typeof getRankFrameStyle === 'function') ? getRankFrameStyle(myProfile.elo,'icon') : '';
    if(myPicEl.style.cssText !== _myFrameStyle) myPicEl.style.cssText = _myFrameStyle;
    const _myPicSrc = myProfile.img || '';
    const _myPicCrop = myProfile.crop || '';
    if(typeof window.renderCanvasImage === 'function' && window.HTMLCanvasElement && _myPicSrc) {
      let canvas = myPicEl.querySelector(':scope > canvas.profile-pic-canvas');
      if(!canvas) {
        myPicEl.textContent = '';
        canvas = document.createElement('canvas');
        canvas.className = 'profile-pic-canvas';
        canvas.setAttribute('aria-hidden','true');
        myPicEl.appendChild(canvas);
      }
      renderBannerCanvasImage(canvas, _myPicSrc, { mode:'cover', parent:myPicEl, background:'#080910' });
    } else {
      const _myExImg = myPicEl.querySelector('img');
      if(!_myExImg || _myExImg.getAttribute('src') !== _myPicSrc || _myExImg.style.cssText !== _myPicCrop){
        myPicEl.innerHTML = _myPicSrc ? `<img src="${_myPicSrc}" style="${_myPicCrop}" alt="">` : '<span class="pi-placeholder">Profile</span>';
      }
    }
  }
  if(myNameEl) {
    const myNameText = myProfile.name || 'You';
    if(myNameEl.textContent !== myNameText) myNameEl.textContent = myNameText;
  }
  if(myStatEl){
    updatePlayerStatBadge(myStatEl, {
      mode: 'player',
      elo: myProfile.elo,
      wins: myProfile.wins,
      losses: myProfile.losses
    });
  }
  // Opponent banner
  const oppPicEl = document.getElementById('opp-pic');
  const oppNameEl = document.getElementById('opp-name');
  const oppStatEl = document.getElementById('opp-stat');
  if(G.aiEnabled){
    const ai = G._selectedAI;
    const d = G.aiDifficulty || 'medium';
    const aiName = ai ? ai.name : G.players[1].name;
    const aiElo = ai ? ai.elo : ({easy:800,medium:1000,hard:1200,extreme:1400}[d]||1000);
    if(oppPicEl){
      const _aiFrameStyle = typeof getRankFrameStyle === 'function' ? getRankFrameStyle(aiElo,'icon') : '';
      if(oppPicEl.style.cssText !== _aiFrameStyle) oppPicEl.style.cssText = _aiFrameStyle;
      const aiImg = ai && typeof getAIProfileImg === 'function' ? getAIProfileImg(ai, 'full') : (ai&&ai.img ? ai.img : 'blank.png');
      if(typeof window.renderCanvasImage === 'function' && window.HTMLCanvasElement && aiImg) {
        let canvas = oppPicEl.querySelector(':scope > canvas.profile-pic-canvas');
        if(!canvas) {
          oppPicEl.textContent = '';
          canvas = document.createElement('canvas');
          canvas.className = 'profile-pic-canvas';
          canvas.setAttribute('aria-hidden','true');
          oppPicEl.appendChild(canvas);
        }
        renderBannerCanvasImage(canvas, aiImg, { mode:'cover', parent:oppPicEl, background:'#080910' });
      } else {
        const _oppExImg = oppPicEl.querySelector('img');
        if(!_oppExImg || _oppExImg.getAttribute('src') !== aiImg){
          oppPicEl.innerHTML = `<img src="${aiImg}" style="width:100%;height:100%;object-fit:cover;object-position:center 25%;" alt="" onerror="this.onerror=null;this.src='blank.png';">`;
        }
      }
    }
    if(oppNameEl && oppNameEl.textContent !== aiName) oppNameEl.textContent = aiName;
    if(oppStatEl){
      updatePlayerStatBadge(oppStatEl, {
        mode: 'ai',
        elo: aiElo,
        wins: 0,
        losses: 0
      });
    }
  } else {
    const oppProfile = getBannerProfile(oppP);
    if(oppPicEl){
      const _oppFrameStyle = (oppProfile.elo != null && typeof getRankFrameStyle === 'function') ? getRankFrameStyle(oppProfile.elo,'icon') : '';
      if(oppPicEl.style.cssText !== _oppFrameStyle) oppPicEl.style.cssText = _oppFrameStyle;
      const _oppSrc = oppProfile.img || '';
      const _oppCrop = oppProfile.crop || '';
      if(typeof window.renderCanvasImage === 'function' && window.HTMLCanvasElement && _oppSrc) {
        let canvas = oppPicEl.querySelector(':scope > canvas.profile-pic-canvas');
        if(!canvas) {
          oppPicEl.textContent = '';
          canvas = document.createElement('canvas');
          canvas.className = 'profile-pic-canvas';
          canvas.setAttribute('aria-hidden','true');
          oppPicEl.appendChild(canvas);
        }
        renderBannerCanvasImage(canvas, _oppSrc, { mode:'cover', parent:oppPicEl, background:'#080910' });
      } else {
        const _oppExImg2 = oppPicEl.querySelector('img');
        if(!_oppExImg2 || _oppExImg2.getAttribute('src') !== _oppSrc || _oppExImg2.style.cssText !== _oppCrop){
          oppPicEl.innerHTML = _oppSrc ? `<img src="${_oppSrc}" style="${_oppCrop}" alt="">` : '<span class="pi-placeholder">Profile</span>';
        }
      }
    }
    if(oppNameEl) {
      const oppNameText = oppProfile.name || `Player ${oppP + 1}`;
      if(oppNameEl.textContent !== oppNameText) oppNameEl.textContent = oppNameText;
    }
    if(oppStatEl){
      updatePlayerStatBadge(oppStatEl, {
        mode: 'player',
        elo: oppProfile.elo,
        wins: oppProfile.wins,
        losses: oppProfile.losses
      });
    }
  }
  // Active turn highlight
  updatePlayerBannerActiveTurn(myP, oppP);
  // Auto-shrink long names
  fitBannerNames();
}

function fitBannerNames(){
  document.querySelectorAll('#s-game .pb-name').forEach(function(el){
    el.classList.remove('pb-name-fit-long');
    el.classList.remove('pb-name-wrap');
    el.style.fontSize = '';
    el.style.letterSpacing = '';
    el.style.maxWidth = '';
    el.style.transform = '';
    el.style.transformOrigin = '';
    el.style.webkitLineClamp = '';
    var text = (el.textContent || '').trim();
    if(!text) return;
    var computed = window.getComputedStyle ? getComputedStyle(el) : null;
    var maxSize = computed ? (parseFloat(computed.fontSize) || 13.6) : 13.6;
    var minSize = 6.75;
    var size = maxSize;
    el.style.fontSize = size + 'px';
    var parent = el.parentElement;
    if(!parent) return;
    var maxW = parent.clientWidth - 2;
    var banner = el.closest ? el.closest('.player-banner') : null;
    var pic = banner && banner.querySelector ? banner.querySelector('.pb-pic') : null;
    if(banner && pic && banner.getBoundingClientRect && pic.getBoundingClientRect){
      var br = banner.getBoundingClientRect();
      var pr = pic.getBoundingClientRect();
      var bs = window.getComputedStyle ? getComputedStyle(banner) : null;
      var gap = bs ? (parseFloat(bs.columnGap || bs.gap) || 12) : 12;
      var padR = bs ? (parseFloat(bs.paddingRight) || 0) : 0;
      maxW = Math.max(44, br.width - pr.width - gap - padR - 6);
    }
    if(maxW <= 0) return;
    var naturalWidth = el.scrollWidth;
    if(naturalWidth <= maxW + 1) {
      el.style.fontSize = '';
      el.style.maxWidth = '';
      return;
    }
    el.classList.add('pb-name-fit-long');
    el.classList.add('pb-name-wrap');
    el.style.maxWidth = maxW + 'px';
    el.style.letterSpacing = '0';
    var lineHeight = computed ? (parseFloat(computed.lineHeight) || size * 1.08) : size * 1.08;
    var maxH = Math.ceil(lineHeight * 2.22);
    while(el.scrollHeight > maxH && size > minSize){
      size -= 0.25;
      el.style.fontSize = size + 'px';
      lineHeight = computed ? (parseFloat(getComputedStyle(el).lineHeight) || size * 1.08) : size * 1.08;
      maxH = Math.ceil(lineHeight * 2.22);
    }
  });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  CARD DETAIL MODAL
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function activateSelvaIslandsPirateFromHand(card) {
  if(!card || card.id !== '74') return;
  toast('Selva Islands Pirate triggers when it is drawn or added to your hand.');
}

const ALLOW_MANUAL_SUPPORTER_DISCARD = true;

function getContinuousFateReductionCountForDetail(owner) {
  if(typeof G === 'undefined' || !G || !G._continuousDamageSources) return 0;
  let count = 0;
  G._continuousDamageSources.forEach(function(key){
    if(typeof key === 'string' && key.startsWith(owner + ':')) count++;
  });
  return count;
}

function buildCardDetailTrackerHTML(card, viewerP, hideCard) {
  if(hideCard || !card || typeof G === 'undefined' || !G) return '';
  const inMatch = !!document.getElementById('s-game')?.classList.contains('active');
  if(!inMatch) return '';
  const owner = (card.owner === 0 || card.owner === 1) ? card.owner : viewerP;
  if(owner !== 0 && owner !== 1) return '';
  let label = '';
  let value = '';
  let sub = '';

  if(card.id === '88') {
    let charCount = 0;
    if(typeof forEachBoardCard === 'function') {
      forEachBoardCard(function(cell){
        if(cell && cell.owner === owner && !isFaceDownCard(cell) && (typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(cell, owner) : cell.type !== 'Supporter')) charCount++;
      });
    }
    label = 'Characters Controlled';
    value = String(charCount);
    sub = '+2 Fate Each';
  } else if(card.id === '89') {
    const counts = Array.isArray(G._supporterEffectsActivatedP) ? G._supporterEffectsActivatedP : [0,0];
    const used = Math.max(0, Number(counts[owner]) || 0);
    label = 'Supporter Effects';
    value = used + ' / 10';
    sub = used < 10 ? 'Bonus Active' : 'Bonus Inactive';
  } else if(card.id === '41') {
    const manual = Math.max(0, Number(Array.isArray(G.damageDoneP) ? G.damageDoneP[owner] : 0) || 0);
    const continuous = getContinuousFateReductionCountForDetail(owner);
    const total = manual + continuous;
    label = 'Fate Reductions';
    value = String(total);
    sub = continuous ? manual + ' direct + ' + continuous + ' continuous' : 'opponent Fate reduced';
  } else if(card.id === '85') {
    const opponentSets = typeof getSupportersSetCountForPlayer === 'function'
      ? getSupportersSetCountForPlayer(1 - owner)
      : Math.max(0, Number(Array.isArray(G.supportersSetP) ? G.supportersSetP[1 - owner] : 0) || 0);
    label = 'Opponent Supporters Placed';
    value = String(opponentSets);
    sub = '+1 Fate Each';
  } else if(card.id === '36') {
    const pos = typeof getBoardCardPosition === 'function' ? getBoardCardPosition(card) : null;
    if(pos) {
      const reductions = Math.max(0, Math.floor(Math.abs(Number(G.fateModifiers?.['deterrance_z' + pos.z] || 0)) / 4));
      label = 'Deterrance Reductions:';
      value = String(reductions);
      sub = 'Zone ' + (pos.z + 1) + ', -' + (reductions * 4) + ' total Fate';
    }
  } else if(card.id === '18') {
    const used = typeof getUsMarinesUses === 'function'
      ? getUsMarinesUses(owner)
      : Math.max(0, Number(Array.isArray(G.usMarinesUses) ? G.usMarinesUses[owner] : 0) || 0);
    label = 'Semper Fidelis Uses';
    value = used + ' / 3';
    sub = used < 3 ? 'Suppression Uses Available' : 'Effect Expended';
  } else if(card.id === '28') {
    const counts = Array.isArray(G.polishArmyUses) ? G.polishArmyUses : [0,0];
    const used = Math.max(0, Number(counts[owner]) || 0);
    label = 'Army of Exiles Uses';
    value = used + ' / 2';
    sub = used < 2 ? 'Number of free set from deck uses available' : 'free deck set exhausted';
  } else if(card.id === '40') {
    const uses = Math.max(0, Number(card.usesLeft == null ? 2 : card.usesLeft) || 0);
    label = 'Hard Times Uses';
    value = (2 - uses) + ' / 2';
    sub = uses + ' Empowerment' + (uses === 1 ? '' : 's') + ' Remaining';
  } else if(card.id === '56') {
    const uses = Math.max(0, Math.min(3, Number(card.usesLeft == null ? 3 : card.usesLeft) || 0));
    label = 'Berknomaly Uses';
    value = (3 - uses) + ' / 3';
    sub = uses + ' Negation' + (uses === 1 ? '' : 's') + ' Remaining';
  } else if(card.id === '67') {
    const uses = Math.max(0, Number(card.usesLeft == null ? (card._seculesUsed ? 0 : 1) : card.usesLeft) || 0);
    label = 'Negation Uses';
    value = (1 - uses) + ' / 1';
    sub = uses ? 'Ready to Negate' : 'Effect Expended';
  } else if(card.id === '91') {
    const counts = Array.isArray(G._snowyVillageUses) ? G._snowyVillageUses : [0,0];
    const used = Math.max(0, Number(counts[owner]) || 0);
    label = 'Snowy Village Uses';
    value = used + ' / 2';
    sub = used < 2 ? 'landscape lock available' : 'landscape lock exhausted';
  } else if(card.id === '100') {
    const triggers = Math.max(0, Number(card._wintertideTriggerCount) || 0);
    label = 'Snow on the Carpathians:';
    value = triggers + ' Trigger' + (triggers === 1 ? '' : 's');
    sub = '+' + (triggers * 2) + ' Fate gained this match';
  } else if(card.id === '99') {
    const fx = Array.isArray(G._blameGameEffects) ? G._blameGameEffects[owner] : null;
    const turns = fx && fx.active ? Math.max(0, Number(fx.turnsLeft) || 0) : 0;
    label = 'The Blame Game';
    value = turns ? turns + ' Turn' + (turns === 1 ? '' : 's') : 'Inactive';
    sub = turns ? 'Supporters count as Characters' : 'Activate to classify Supporters as Characters';
  }

  if(!label) return '';
  return '<div class="cd-live-tracker">' +
    '<span class="cd-live-tracker-kicker">Match Tracker</span>' +
    '<span class="cd-live-tracker-label">' + escapeHtml(label) + '</span>' +
    '<span class="cd-live-tracker-value">' + escapeHtml(value) + '</span>' +
    (sub ? '<span class="cd-live-tracker-sub">' + escapeHtml(sub) + '</span>' : '') +
  '</div>';
}

function buildFrenchFusiliersCopyBannerHTML(copiedPassiveName, copiedPassiveEffect) {
  if(!copiedPassiveName) return '';
  return '<div class="cd-live-tracker french-fusiliers-copy-banner">' +
    '<span class="cd-live-tracker-kicker">Copied Effect</span>' +
    '<span class="cd-live-tracker-label">' + escapeHtml(copiedPassiveName) + '</span>' +
    '<span class="cd-live-tracker-value">Active</span>' +
    (copiedPassiveEffect ? '<span class="cd-live-tracker-sub">' + escapeHtml(copiedPassiveEffect) + '</span>' : '') +
  '</div>';
}

function playEffectActivationButtonSound() {
  if(typeof window !== 'undefined' && typeof window.playEffectActivationClickSfx === 'function') {
    return window.playEffectActivationClickSfx();
  }
  if(typeof playSfx === 'function') playSfx('effectActivate');
  return true;
}

function fateFastShowMovementTargets(options, classNames) {
  const list = Array.isArray(options) ? options : [];
  const classes = Array.isArray(classNames) && classNames.length ? classNames : ['placeable','move-target'];
  const board = document.getElementById('board');
  if(board && list.length) {
    for(let i = 0; i < list.length; i++){
      const opt = list[i] || {};
      const el = board.querySelector('.cell[data-z="'+Number(opt.z)+'"][data-r="'+Number(opt.r)+'"][data-c="'+Number(opt.c)+'"]');
      if(el) el.classList.add.apply(el.classList, classes);
    }
  }
  if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function'){
    window.FateMatchRendererAdapter.scheduleRender('movement-targets-fast');
    window.FateMatchRendererAdapter.scheduleRender('hover');
  }
  return list.length;
}

function canUseBusserMoveButton(card, actionPlayer) {
  if(!card || !Number.isInteger(actionPlayer)) return false;
  const moves = typeof getBusserTurnsLeft === 'function' ? getBusserTurnsLeft(card) : Number(card._busserTurnsLeft || card._busserMoves || 0) || 0;
  if(moves <= 0 || card._busserMovedThisTurn || card.cantBeMoved || card.immuneFlag || String(card.id || '') === '76') return false;
  if(card._busserSourceIid && typeof window.isStoredEffectSourceSuppressed === 'function' && window.isStoredEffectSourceSuppressed(card._busserSourceIid)) return false;
  const busserOwner = card._busserOwner == null ? card.owner : Number(card._busserOwner);
  return Number(busserOwner) === Number(actionPlayer) || Number(card.owner) === Number(actionPlayer);
}

function isBerkeleyHomelessEffectCard(card) {
  return !!(card && (card.berkeleyHomeless || String(card.id || '') === '62'));
}

function canDiscardBerkeleyHomelessEffect(card, z, r, c, player) {
  player = Number(player);
  if(!isBerkeleyHomelessEffectCard(card)) return false;
  if(!Number.isInteger(player) || Number(card.owner) === player) return false;
  if(!G || Number(G.currentPlayer) !== player) return false;
  if(G._isSpectator || G._onlineRole === 'spectator') return false;
  const rowOwner = typeof getBoardRowOwner === 'function'
    ? getBoardRowOwner(z, r)
    : (r === 0 ? 1 : (r === 2 ? 0 : -1));
  return Number(rowOwner) === player;
}

function discardBerkeleyHomelessWithHandCost(card, z, r, c) {
  const actionPlayer = G._onlineRoomCode && typeof window.fateResolveOnlineLocalPlayerIndex === 'function'
    ? Number(window.fateResolveOnlineLocalPlayerIndex('berkeley discard action'))
    : G.currentPlayer;
  if(!isBerkeleyHomelessEffectCard(card) || card.owner === actionPlayer) return false;
  if(!canDiscardBerkeleyHomelessEffect(card, z, r, c, actionPlayer)){
    toast('Berkeley Homeless can only be removed from your side of the field.');
    return true;
  }
  const hand = G.players[actionPlayer].hand;
  if(hand.length < 2){
    toast('Cannot discard Berkeley Homeless - you need 2 cards in hand to expend');
    return true;
  }
  pickCardsVisual(hand, {
    title: 'Discard 2 hand cards to remove Berkeley Homeless',
    subtitle: 'You must expend 2 cards from your hand to discard this card',
    maxCount: 2,
    minCount: 2,
    confirmLabel: 'Expend & Discard'
  }, (chosen)=>{
    if(chosen.length < 2) return;
    const chosenIds = new Set(chosen.map(ch=>ch.iid));
    G.players[actionPlayer].hand = G.players[actionPlayer].hand.filter(h=>!chosenIds.has(h.iid));
    chosen.forEach(ch=>fatePushDiscard(actionPlayer, ch, {sound:false}));
    G.board[z][r][c] = null;
    fatePushDiscard(card.owner, card);
    toast('2 cards expended to remove Berkeley Homeless');
    renderBoardActionForPlayer(actionPlayer, {hand:true, piles:true});
  });
  return true;
}

function openCardDetail(card, fromHand=false, fromBoard=false) {
  if(fromBoard && typeof G !== 'undefined' && G && G._consolidating) return;
  if(!card){
    if(G.selectedHandCard!==null) card=G.players[G.currentPlayer].hand[G.selectedHandCard];
    if(!card) return;
  }
  if(typeof G !== 'undefined' && G && G._cardDetailModalLockUntil && !window.__fateBypassCardDetailDelay) {
    const waitMs = Math.max(0, Number(G._cardDetailModalLockUntil) - Date.now());
    if(waitMs > 16) {
      clearTimeout(G._cardDetailModalDelayTimer);
      G._cardDetailModalDelayTimer = setTimeout(function(){
        window.__fateBypassCardDetailDelay = true;
        try { openCardDetail(card, fromHand, fromBoard); }
        finally { window.__fateBypassCardDetailDelay = false; }
      }, Math.min(waitMs, 1900));
      return;
    }
  }
  if(typeof resetModalChrome === 'function') resetModalChrome();
  const viewerP = getPerspectivePlayerIndex();
  const hideCard = !!(fromBoard && isFaceDownCard(card) && card.owner !== viewerP);
  const aff=AFF_COLOR[card.aff]||'#2a2a3a';
  const body=document.getElementById('modal-body');
  if(!body) return;
  const boardPos = getBoardCardPosition(card);
  const visual = getCardVisualData(card, viewerP, {boardPos});
  const modalEl = document.getElementById('modal');
  const modalBox = document.querySelector('#modal .modal');
  if(modalEl) modalEl.classList.add('card-detail-overlay');
  if(modalBox) modalBox.classList.add('card-detail-modal');
  preloadCardDetailImage(card);
  const useCanvasArt = !!(visual.img && typeof window.renderCanvasImage === 'function' && window.HTMLCanvasElement);
  const cardArt = visual.img
    ? (useCanvasArt ? '<canvas class="cd-img-canvas" aria-hidden="true"></canvas>' : `<img src="${visual.img}" alt="${escapeHtml(visual.name)}" width="280" height="392" decoding="async" loading="eager" fetchpriority="high">`)
    : `<span class="cd-fallback">${getAffIcon(visual.aff)}</span>`;
  const voiceButton = (!hideCard && visual.type !== 'Supporter')
    ? `<button type="button" class="card-voice-btn" title="Play voiceline" onclick="event.stopPropagation(); if(typeof playCardSound==='function') playCardSound('${escapeHtml(card.id)}');">♪</button>`
    : '';
  const trackerHtml = buildCardDetailTrackerHTML(card, viewerP, hideCard);
  const copiedPassiveName = (!hideCard && String(card.id || '') === '37') ? (card._copiedPassiveName || card.copiedPassiveName || '') : '';
  const copiedPassiveEffect = (!hideCard && String(card.id || '') === '37') ? (card._copiedPassiveEffect || card.copiedPassiveEffect || '') : '';
  const copiedPassiveBanner = buildFrenchFusiliersCopyBannerHTML(copiedPassiveName, copiedPassiveEffect);
  body.innerHTML=`
    <div class="cd-wrap">
      <div class="cd-img">
        ${cardArt}
      </div>
      <div class="cd-info">
        <div class="cd-name cd-name-with-audio">
          <span>${visual.name}</span>
          ${voiceButton}
        </div>
        <div class="cd-ability">${visual.ability}</div>
        <div class="cd-pills">
          <span class="pill type">${visual.type}${visual.cost>0?` (${visual.xCost?'X':visual.cost})`:''}</span>
          <span class="pill fate">${visual.fate} Fate</span>
          <span class="pill">${AFF_LABEL[visual.aff]||visual.aff}</span>
        </div>
        ${trackerHtml}
        ${copiedPassiveBanner}
        <div class="cd-eff">${visual.effect}</div>
        ${!hideCard && card.flavor?`<div class="cd-flavor">${card.flavor}</div>`:''}
      </div>
    </div>`;
  if(useCanvasArt) {
    const canvas = body.querySelector('.cd-img-canvas');
    if(canvas) requestAnimationFrame(()=>window.renderCanvasImage(canvas, visual.img, {mode:'contain', parent:canvas.parentElement, background:'#080910'}));
  }
  document.getElementById('modal-title').textContent=visual.name;
  const acts=document.getElementById('modal-acts');
  acts.innerHTML='';
  const close=document.createElement('button');
  close.className='btn sm';close.textContent='Close';close.onclick=closeModal;
  if(!hideCard && typeof window.hasCardLorePage === 'function' && window.hasCardLorePage(card) && typeof window.openCardLoreFromInfo === 'function'){
    const lore=document.createElement('button');
    lore.className='btn sm';
    lore.textContent='Lore';
    lore.onclick=(ev)=>{
      if(ev){
        ev.preventDefault();
        ev.stopPropagation();
      }
      window.openCardLoreFromInfo(card);
    };
    acts.appendChild(lore);
  }
  acts.appendChild(close);
  if(hideCard){
    document.getElementById('modal').classList.add('on');
    return;
  }
  const resolveOnlineActionPlayer = (reason)=>{
    if(!G._onlineRoomCode) return getPerspectivePlayerIndex();
    if(typeof window.fateResolveOnlineLocalPlayerIndex === 'function'){
      const resolved = Number(window.fateResolveOnlineLocalPlayerIndex(reason || 'card detail'));
      if(Number.isInteger(resolved)) return resolved;
    }
    if(Number.isInteger(G._onlinePlayerIndex)) return G._onlinePlayerIndex;
    if(Number.isInteger(G.localPlayerIndex)) return G.localPlayerIndex;
    if(Number.isInteger(G.viewerPlayerIndex)) return G.viewerPlayerIndex;
    return null;
  };
  const handActionPlayer = G._onlineRoomCode
    ? resolveOnlineActionPlayer('card detail hand actions')
    : getPerspectivePlayerIndex();
  const handActionIndex = G.players?.[handActionPlayer]?.hand?.findIndex(c=>c && card && c.iid===card.iid) ?? -1;
  const canUseHandCard = Number.isInteger(handActionPlayer) && handActionIndex > -1 && G.currentPlayer===handActionPlayer && G.phase==='main' && !G._isSpectator && G._onlineRole !== 'spectator';
  const canUseSantaAnnaLandscape = Number.isInteger(handActionPlayer)
    && handActionIndex > -1
    && !fromBoard
    && !(card.id==='70' && card.guerilla_transferred)
    && !G._isSpectator
    && G._onlineRole !== 'spectator'
    && typeof isLandscapeActive === 'function'
    && isLandscapeActive('igb16');
  if((fromHand||G.selectedHandCard!==null) && canUseSantaAnnaLandscape){
    const santa=document.createElement('button');
    santa.className='btn sm pri';
    santa.textContent='Prosperity';
    santa.onclick=()=>{playEffectActivationButtonSound(); activateSantaAnnaProsperityFromHand(card);};
    acts.appendChild(santa);
  }
  if((fromHand||G.selectedHandCard!==null) && !fromBoard && canUseHandCard){
    if(card.id==='70' && card.guerilla_transferred){
      toast(card.name + ' cannot be set - it is debuffing this hand.');
      document.getElementById('modal').classList.add('on');
      return;
    }
    if(typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(card, handActionPlayer) : card.type==='Supporter'){
      // Selva Islands Pirate (74) triggers on hand arrival; no manual action button.
      if(false && card.id==='74' && !(typeof isSupporterEffectSuppressed === 'function' && isSupporterEffectSuppressed(card))){
        const selva=document.createElement('button');
        selva.className='btn sm pri';selva.textContent='Activate Effect';
        selva.onclick=()=>{
          if(G._onlineRoomCode && typeof activateSelvaIslandsPirateFromHand === 'function'){
            activateSelvaIslandsPirateFromHand(card);
            return;
          }
          closeModal();
          const cp=G.currentPlayer;
          const idx=G.players[cp].hand.findIndex(c=>c.iid===card.iid);
          if(idx>-1){
            G.players[cp].hand.splice(idx,1);
            fatePushDiscard(cp, card);
            G.maxSupportsPerTurn = 3; // override for this turn
            G.selectedHandCard=null;
            toast('Selva Islands Pirate discarded — you can set 3 supporters this turn!');
            log(cp===0?'p1':'p2','Selva Islands Pirate: 3 supporters allowed this turn');
            playSfx('effect');
            renderGame({hand:true, topbar:true});
          }
        };
        acts.appendChild(selva);
      }
      const place=document.createElement('button');
      // Keep both input methods: modal Place on Board for precise selection,
      // plus hold/drag placement for faster play. Multiplayer-safe because
      // both routes use the same selected-hand-card placement state.
      place.className='btn sm pri'; place.dataset.placeFromHand='1'; place.textContent='Place on Board';
      place.onclick=()=>placeSelected();
      acts.appendChild(place);
    } else {
      const con=document.createElement('button');
      con.className='btn sm pri';con.textContent='Consolidate';
      con.onclick=()=>initiateConsolidate();
      acts.appendChild(con);
    }
  }
  const boardDetail = (()=>{
    const sameCard = (a,b)=>!!(a && b && (a === b || (a.iid && b.iid && a.iid === b.iid)));
    if(G.selectedBoardCard && sameCard(G.selectedBoardCard.card, card)) return G.selectedBoardCard;
    const pos = boardPos || (typeof getBoardCardPosition === 'function' ? getBoardCardPosition(card) : null);
    if(!pos) return null;
    const live = G.board && G.board[pos.z] && G.board[pos.z][pos.r] ? G.board[pos.z][pos.r][pos.c] : null;
    if(live && !sameCard(live, card)) return null;
    return {card:live || card, z:pos.z, r:pos.r, c:pos.c};
  })();
  if(boardDetail){
    const {card:bc,z,r,c}=boardDetail;
    const boardActionPlayer = G._onlineRoomCode
      ? resolveOnlineActionPlayer('card detail board actions')
      : getPerspectivePlayerIndex();
    const canUseBoardCard = Number.isInteger(boardActionPlayer)
      && bc.owner===boardActionPlayer
      && G.currentPlayer===boardActionPlayer
      && G.phase==='main'
      && !G._isSpectator
      && G._onlineRole !== 'spectator';
    const canDiscardBerkeleyHomeless = canDiscardBerkeleyHomelessEffect(bc, z, r, c, boardActionPlayer);
    const canActivateDeferredSetEffect = Number.isInteger(boardActionPlayer)
      && !isFaceDownCard(bc)
      && typeof canActivatePendingWhenSetEffect === 'function'
      && canActivatePendingWhenSetEffect(bc, z, r, c, boardActionPlayer);
    if(canDiscardBerkeleyHomeless){
      const berkeleyDisc=document.createElement('button');
      berkeleyDisc.className='btn sm danger';
      berkeleyDisc.textContent='Clearing Them Off';
      berkeleyDisc.onclick=()=>{
        closeModal();
        discardBerkeleyHomelessWithHandCost(bc, z, r, c);
      };
      acts.appendChild(berkeleyDisc);
    }
    if(isFaceDownCard(bc) && canUseBoardCard){
      const flip=document.createElement('button');
      flip.className='btn sm pri';
      flip.textContent='Flip Face Up';
      flip.onclick=()=>{
        closeModal();
        playEffectActivationButtonSound();
        const delay = flipFaceDownBoardCard(bc, z, r, c);
      };
      acts.appendChild(flip);
    }
    if(canActivateDeferredSetEffect){
      const setAct=document.createElement('button');
      setAct.className='btn sm pri';
      setAct.textContent='Activate Effect';
      setAct.onclick=()=>{
        setAct.disabled = true;
        setAct.textContent = 'Resolving...';
        playEffectActivationButtonSound();
        closeModal();
        activatePendingWhenSetEffect(bc,z,r,c);
      };
      acts.appendChild(setAct);
    }
    if(!canActivateDeferredSetEffect && canUseBoardCard && !isFaceDownCard(bc) && typeof shouldShowManualCharacterEffectButton === 'function' && shouldShowManualCharacterEffectButton(bc)){
      // Coordinators: passive, no manual activation needed
      if(false){
        // No button needed — coordinators are automatic
      } else if(bc.type==='Initiator' && bc.effectUsedInitial){
        // Initiator already fired — no button
      } else if((bc.type==='Improvisor' && String(bc.id || '') !== '40') || bc.id==='89'){
        // Improvisors are conditional/reactive and should not show a manual activation button.
      } else {
        const act=document.createElement('button');
        act.className='btn sm pri';act.textContent='Activate Effect';
        act.onclick=()=>{playEffectActivationButtonSound(); closeModal(); triggerCharacterEffect(bc,z,r,c);};
        acts.appendChild(act);
      }
    }
    // Show Discard button for your own board cards (except ALPINE Infantry).
    // Supporters can still be spent by consolidation and card effects, but are
    // no longer freely removable from their card info window.
    if(canUseBoardCard && bc.id!=='76'){
      const supporterActionsSuppressed = typeof isSupporterEffectSuppressed === 'function' && isSupporterEffectSuppressed(bc);
      if(!supporterActionsSuppressed && !isFaceDownCard(bc) && canUseBusserMoveButton(bc, boardActionPlayer)){
        const busBtn=document.createElement('button');
        busBtn.className='btn sm pri';busBtn.textContent='Bussing';
        busBtn.onclick=()=>{playEffectActivationButtonSound();closeModal();activateBusserMove(bc,z,r,c);};
        acts.appendChild(busBtn);
      }
      // Supporter active abilities — specific cards with board-activated effects
      if(!canActivateDeferredSetEffect && (typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(bc, boardActionPlayer) : bc.type==='Supporter') && !isFaceDownCard(bc)){
        // Vigilantes (52): when-set-only; only show if a deferred when-set effect is pending.
        if(!supporterActionsSuppressed && bc.id==='52' && bc._pendingWhenSetEffect && (typeof canActivateVigilantesWindow === 'function' ? canActivateVigilantesWindow(bc) : bc.whenSetActivated !== true)){
          const vigBtn=document.createElement('button');
          vigBtn.className='btn sm pri';vigBtn.textContent='Activate Effect';
          vigBtn.onclick=()=>{playEffectActivationButtonSound();closeModal();activateVigilantes(bc,z,r,c);};
          acts.appendChild(vigBtn);
        }
        // ALPINE Expeditionary (73): move once per turn
        if(!supporterActionsSuppressed && bc.id==='73' && bc._canMoveOncePerTurn && !bc._expMoved){
          const expBtn=document.createElement('button');
          expBtn.className='btn sm pri';expBtn.textContent='Activate Effect';
          expBtn.onclick=()=>{playEffectActivationButtonSound();closeModal();activateExpeditionaryMove(bc,z,r,c);};
          acts.appendChild(expBtn);
        }
        if(!supporterActionsSuppressed && (bc.id==='93' || (typeof frenchFusiliersCopies === 'function' && frenchFusiliersCopies(bc, '93'))) && !bc.effectUsedThisTurn){
          const snowBtn=document.createElement('button');
          snowBtn.className='btn sm pri';snowBtn.textContent='Snowball Fight';
          snowBtn.onclick=()=>{playEffectActivationButtonSound();closeModal();activateWodnyPotokYouth(bc,z,r,c);};
          acts.appendChild(snowBtn);
        }
      }
      if(canUseBoardCard && typeof isLandscapeActive === 'function' && isLandscapeActive('igb7') && typeof canUsePanaceaLandscapeMoveCard === 'function' && canUsePanaceaLandscapeMoveCard(bc) && bc._landscapeEventideMovedTurn !== G.turn && !bc.cantBeMoved){
        const landMove=document.createElement('button');
        landMove.className='btn sm pri';
        landMove.textContent='Panacea Sailors';
        landMove.onclick=()=>{playEffectActivationButtonSound();closeModal();activateLandscapeEventideMove(bc,z,r,c);};
        acts.appendChild(landMove);
      }
      if(!(typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(bc, boardActionPlayer) : bc.type==='Supporter') || ALLOW_MANUAL_SUPPORTER_DISCARD){
        const disc=document.createElement('button');
        disc.className='btn sm danger';disc.textContent='Discard';
        disc.onclick=()=>{
          if(!canUseBoardCard || bc.owner !== boardActionPlayer || G.currentPlayer !== boardActionPlayer){
            toast('You can only discard your own card during your turn.');
            return;
          }
          closeModal();
          discardBoardCard(bc, z, r, c);
          log(bc.owner===0?'p1':'p2',`Discarded ${bc.name} from Zone ${z+1}`);
          G.selectedBoardCard=null;
          renderBoardActionForPlayer(bc.owner, {hand:false, piles:true});
        };
        acts.appendChild(disc);
      }
    }
  }
  document.getElementById('modal').classList.add('on');
  if(typeof tutorialOnCardDetailOpened === 'function') {
    setTimeout(function(){ tutorialOnCardDetailOpened(card); }, 0);
  }
}

function openCardDetailFromDeckPreview(card, returnToPreview) {
  openCardDetail(card, false, false);
  const backToPreview = function(ev){
    if(ev && typeof ev.preventDefault === 'function') ev.preventDefault();
    if(ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
    if(typeof dismissCardInfoOverlay === 'function') dismissCardInfoOverlay();
    if(typeof returnToPreview === 'function') returnToPreview();
    const modalEl = document.getElementById('modal');
    if(modalEl) modalEl.classList.add('on');
  };
  const acts = document.getElementById('modal-acts');
  const closeBtn = acts && Array.from(acts.querySelectorAll('button')).find(btn => /^close$/i.test((btn.textContent || '').trim()));
  if(closeBtn) {
    closeBtn.textContent = 'Back';
    closeBtn.onclick = backToPreview;
  }
}
window.openCardDetailFromDeckPreview = openCardDetailFromDeckPreview;

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  HELPER MODALS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function resetModalChrome() {
  const modalEl = document.getElementById('modal');
  if(modalEl) {
    modalEl.classList.remove('match-overview-modal', 'online-match-overview-modal', 'no-edge-corners-modal', 'card-detail-overlay');
    delete modalEl.dataset.chooseDeckOpen;
  }
  if(document.body) document.body.classList.remove('choose-deck-open');
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox){
    modalBox.classList.remove(
      'leaderboard-modal',
      'recent-matches-modal',
      'social-profile-modal',
      'sell-card-modal',
      'sell-card-picker-modal',
      'online-room-deck-picker-modal',
      'choose-deck-canonical-modal',
      'choose-deck-runtime-modal',
      'challenger-my-decks-modal',
      'deck-slate-modal',
      'cdb-save-modal',
      'deck-inspect-compact-modal',
      'deck-inspect-fit-modal',
      'title-deck-preview-modal',
      'shared-deck-preview-modal',
      'challenger-deck-preview-modal',
      'deck-art-editor-modal',
      'challenger-deck-art-editor-modal',
      'title-deck-art-editor-modal',
      'division-pro-modal',
      'market-history-modal',
      'market-list-modal',
      'market-purchase-modal',
      'freeplay-mode-modal',
      'freeplay-title-preset-modal',
      'public-decks-modal',
      'public-deck-preview-modal',
      'public-deck-comments-modal',
      'public-deck-import-choice-modal',
      'share-deck-modal',
      'online-profile-modal-v17',
      'online-profile-modal-v18',
      'online-profile-modal-v19',
      'title-profile-modal',
      'profile-view-modal-v2',
      'profile-edit-modal-v2',
      'inspected-profile-modal-stable',
      'friend-requests-modal',
      'title-my-decks-modal',
      'daily-login-modal',
      'card-effect-modal',
      'card-detail-modal',
      'audio-settings-modal',
      'landscape-choice-modal',
      'affiliation-picker-modal',
      'board-target-picker-modal',
      'move-target-picker-modal',
      'hand-limit-discard-modal',
      'end-turn-warning-modal',
      'reaction-choice-modal',
      'status-overflow-modal'
    );
    delete modalBox.dataset.chooseDeckModal;
    modalBox.removeAttribute('style');
  }
  if(modalEl) delete modalEl.dataset.escapeLocked;
  const titleEl = document.getElementById('modal-title');
  if(titleEl) titleEl.removeAttribute('style');
  const actsEl = document.getElementById('modal-acts');
  if(actsEl) actsEl.removeAttribute('style');
  const bodyEl = document.getElementById('modal-body');
  if(bodyEl){
    bodyEl.removeAttribute('style');
  }
}

function shouldUseCardEffectModal(title, bodyHtml, actions) {
  const titleStr = typeof title === 'string' ? title : String(title || '');
  const bodyStr = String(bodyHtml || '');
  const cardEffectTitles = new Set([
    'Variable Cost',
    'Over-Reinforcement',
    'Chaparral Hoplite',
    'Artillery Distance',
    'Left Hook of the Incel',
    'Rearrange Top 5'
  ]);
  const inGame = !!document.getElementById('s-game')?.classList.contains('active');
  if(!inGame) return false;
  if(!cardEffectTitles.has(titleStr)) return false;
  if(/reaction-panel|cd-wrap|visual-grid|zone-picker-wrap|deck-pick-grid|profile-wrap|match-overview|pd-preview/i.test(bodyStr)) return false;
  if(/leave|surrender|disconnect|error|match overview/i.test(titleStr)) return false;
  return (actions || []).length > 0 && (actions || []).length <= 6;
}

function renderCardEffectModalBody(title, bodyHtml) {
  return '<div class="card-effect-window-shell">'+
    '<div class="card-effect-window-kicker">Card Effect</div>'+
    '<div class="card-effect-window-rule">'+bodyHtml+'</div>'+
  '</div>';
}

function showModal(title, bodyHtml, actions, opts) {
  const titleStr = typeof title === 'string' ? title : String(title||'');
  const effectModal = shouldUseCardEffectModal(titleStr, bodyHtml, actions);
  const skipDecorate = !!(opts && opts.skipDecorate);
  if(!(opts && opts.immediate)){
    const setEffectWait = effectModal && typeof G !== 'undefined' && G
      ? Math.max(0, (Number(G._setEffectModalLockUntil) || 0) - Date.now())
      : 0;
    const wait = Math.max((typeof getInteractionAnimationDelayMs === 'function' ? getInteractionAnimationDelayMs() : getPlacementUiDelayMs()), setEffectWait);
    if(wait > 0){
      setTimeout(()=>showModal(title, bodyHtml, actions, opts), wait);
      return;
    }
  }
  resetModalChrome();
  const titleEl = document.getElementById('modal-title');
  if(titleStr.includes('<')) titleEl.innerHTML = titleStr;
  else titleEl.textContent = titleStr;
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox && effectModal) modalBox.classList.add('card-effect-modal');
  document.getElementById('modal-body').innerHTML=effectModal ? renderCardEffectModalBody(titleStr, bodyHtml) : bodyHtml;
  const acts=document.getElementById('modal-acts');
  acts.innerHTML='';
  window.__fateCurrentModalActions = actions || [];
  (actions||[]).forEach(a=>{
    if(a && a.hidden) return;
    const btn=document.createElement('button');
    btn.className='btn sm'+(a.danger?' danger':'')+(a.pri?' pri':'');
    btn.textContent=a.label;
    btn.onclick=function(e){
      if(typeof playSfx === 'function' && !a.silent){
        const label = String(a.label || '').toLowerCase();
        const cancelLike = a.danger || /cancel|close|back|skip|decline|no|leave/.test(label);
        if(a.sfx) playSfx(a.sfx);
        else if(effectModal && !cancelLike) playEffectActivationButtonSound();
        else playSfx(cancelLike ? 'modalCancel' : 'modalConfirm');
      }
      if(typeof a.action === 'function') {
        const result = a.action(e);
        const finishDeferred = function(){
          if(typeof maybeCompleteDeferredTurnEnd === 'function') maybeCompleteDeferredTurnEnd('modal-action');
        };
        if(result && typeof result.then === 'function') {
          result.then(function(){ setTimeout(finishDeferred, 0); }, function(){ setTimeout(finishDeferred, 0); });
        } else {
          setTimeout(finishDeferred, 0);
        }
        return result;
      }
    };
    acts.appendChild(btn);
  });
  document.getElementById('modal').classList.add('on');
  const inGameModal = !!document.getElementById('s-game')?.classList.contains('active');
  if(!skipDecorate && !inGameModal && typeof FateSVG !== 'undefined' && FateSVG && typeof FateSVG.decorate === 'function'){
    const modalNode = document.getElementById('modal');
    const decorateModal = function(){ requestAnimationFrame(function(){ FateSVG.decorate(modalNode); }); };
    if(typeof requestIdleCallback === 'function') requestIdleCallback(decorateModal, {timeout:260});
    else setTimeout(decorateModal, 140);
  }
  if(!(opts && opts.silentOpen)) playSfx('menuOpen');
}

function closeModal(opts) {
  document.getElementById('modal').classList.remove('on');
  resetModalChrome();
  if(typeof dismissCardInfoOverlay === 'function') dismissCardInfoOverlay();
  if(!(opts && opts.silent) && typeof playSfx === 'function') playSfx('menuClose');
  if(typeof maybeCompleteDeferredTurnEnd === 'function') setTimeout(function(){ maybeCompleteDeferredTurnEnd('modal-close'); }, 0);
}

function openInteractiveCardDetailFromPicker(card, entry) {
  if(!card || typeof openCardDetail !== 'function' || typeof G === 'undefined' || !G) return false;
  const sameLiveCard = function(live, candidate) {
    if(!live || !candidate) return false;
    if(live === candidate) return true;
    return !!(live.iid && candidate.iid && live.iid === candidate.iid);
  };
  const openBoard = function(live, z, r, c) {
    G.selectedHandCard = null;
    G.selectedBoardCard = {card:live, z:z, r:r, c:c};
    openCardDetail(live, false, true);
    return true;
  };
  if(entry && Number.isInteger(entry.z) && Number.isInteger(entry.r) && Number.isInteger(entry.c)) {
    const live = G.board && G.board[entry.z] && G.board[entry.z][entry.r] ? G.board[entry.z][entry.r][entry.c] : null;
    if(sameLiveCard(live, card)) return openBoard(live, entry.z, entry.r, entry.c);
  }
  if(G.board && typeof forEachBoardCard === 'function') {
    let found = null;
    forEachBoardCard(function(live, z, r, c) {
      if(!found && sameLiveCard(live, card)) found = {live:live, z:z, r:r, c:c};
    });
    if(found) return openBoard(found.live, found.z, found.r, found.c);
  }
  const players = Array.isArray(G.players) ? G.players : [];
  const onlinePlayer = (G._onlineRoomCode && typeof window.fateResolveOnlineLocalPlayerIndex === 'function')
    ? window.fateResolveOnlineLocalPlayerIndex('picker card detail hand actions')
    : null;
  const preferred = [];
  if(Number.isInteger(onlinePlayer)) preferred.push(onlinePlayer);
  const perspective = typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : G.localPlayerIndex;
  if(Number.isInteger(perspective) && preferred.indexOf(perspective) < 0) preferred.push(perspective);
  if(Number.isInteger(G.currentPlayer) && preferred.indexOf(G.currentPlayer) < 0) preferred.push(G.currentPlayer);
  for(let p = 0; p < players.length; p++) if(preferred.indexOf(p) < 0) preferred.push(p);
  for(const p of preferred) {
    const hand = players[p] && Array.isArray(players[p].hand) ? players[p].hand : null;
    if(!hand) continue;
    const idx = hand.findIndex(function(live){ return sameLiveCard(live, card); });
    if(idx >= 0) {
      G.selectedBoardCard = null;
      G.selectedHandCard = idx;
      openCardDetail(hand[idx], true, false);
      return true;
    }
  }
  return false;
}

function inspectPickerCardDetail(card, entry) {
  if(openInteractiveCardDetailFromPicker(card, entry)) return;
  if(card && typeof showCardInfoOverlay === 'function') showCardInfoOverlay(card);
}

function pickAnyBoardCard(owner, callback) {
  const entries=[];
  forEachBoardCard((card,z,r,c)=>entries.push({card,z,r,c}));
  if(!entries.length){toast('No cards on the field');return;}
  // For any-board selection, fall back to the grid picker
  pickCardsVisual(entries.map(e=>e.card), {
    title: 'Select Target',
    subtitle: 'Any card on the field',
    maxCount: 1,
    confirmLabel: 'Confirm',
    positionEntries: entries
  }, (chosen)=>{
    if(!chosen.length) return;
    const picked = entries.find(e=>e.card===chosen[0]);
    if(picked && callback) callback(picked.card, picked.z, picked.r, picked.c);
  });
}

function pickCardInZone(z, prompt, callback, filter=null) {
  const viewerP = G.currentPlayer;
  const entries=[];
  G.board[z].forEach((row,r)=>row.forEach((cell,c)=>{
    if(cell&&(!filter||filter(cell,z,r,c))) entries.push({card:cell,z,r,c});
  }));
  if(entries.length===0){toast('No valid targets in this zone');return;}
  showZonePicker(z, prompt, entries, 1, viewerP, (chosen)=>{
    if(!chosen.length) return;
    const picked = chosen[0];
    callback(picked.card, picked.z, picked.r, picked.c);
  }, filter);
}

function pickMultipleInZone(z, max, prompt, callback, filter=null) {
  const viewerP = G.currentPlayer;
  const entries=[];
  G.board[z].forEach((row,r)=>row.forEach((cell,c)=>{
    if(cell&&(!filter||filter(cell,z,r,c))) entries.push({card:cell,z,r,c});
  }));
  if(!entries.length){toast('No valid targets in this zone');return;}
  showZonePicker(z, prompt, entries, max, viewerP, callback, filter);
}

function getBoardTargetPickerRowLabel(rowIndex, viewerP) {
  if(rowIndex === 1) return 'Contested';
  if(rowIndex === 0) return viewerP === 1 ? 'Your Side' : 'Opponent Side';
  if(rowIndex === 2) return viewerP === 0 ? 'Your Side' : 'Opponent Side';
  return rowIndex < 1 ? 'Opponent Side' : 'Your Side';
}

function showBoardTargetPicker(opts, onConfirm) {
  const viewerP = typeof opts.viewerPlayerIndex === 'number' ? opts.viewerPlayerIndex : getPerspectivePlayerIndex();
  const allowSquareTargets = !!(opts && opts.allowSquareTargets);
  const entries = (opts.entries || []).filter(function(entry){ return entry && (entry.card || allowSquareTargets); });
  if(!entries.length){ toast(opts.emptyMessage || 'No valid targets'); return; }
  const maxCount = Math.max(1, Math.min(opts.maxCount || 1, entries.length));
  const zones = (opts.zones && opts.zones.length ? opts.zones : [entries[0].z]).filter(function(z, idx, arr){
    return typeof z === 'number' && arr.indexOf(z) === idx;
  });
  const byPos = new Map();
  entries.forEach(function(entry){ byPos.set(entry.z + ':' + entry.r + ':' + entry.c, entry); });
  let selected = [];

  function openPickerCardInfo(ev, card, entry) {
    if(ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    inspectPickerCardDetail(card, entry);
  }

  function updateSelection(body) {
    body.querySelectorAll('.board-target-cell.is-selected').forEach(function(el){ el.classList.remove('is-selected'); });
    selected.forEach(function(entry){
      const el = body.querySelector('[data-picker-pos="' + entry.z + ':' + entry.r + ':' + entry.c + '"]');
      if(el) el.classList.add('is-selected');
    });
    const count = body.querySelector('.board-target-count');
    if(count) count.textContent = selected.length + '/' + maxCount + ' selected';
  }

  const body = document.createElement('div');
  body.className = 'board-target-picker' + (zones.length > 1 ? ' is-multi-zone' : '');
  if(opts.showOpponentOverlay) body.classList.add('show-opponent-overlay');

  const promptEl = document.createElement('div');
  promptEl.className = 'board-target-prompt';
  promptEl.textContent = opts.prompt || '';
  body.appendChild(promptEl);

  const countEl = document.createElement('div');
  countEl.className = 'board-target-count';
  countEl.textContent = '0/' + maxCount + ' selected';
  body.appendChild(countEl);

  const zonesEl = document.createElement('div');
  zonesEl.className = 'board-target-zones';
  body.appendChild(zonesEl);

  zones.forEach(function(z){
    const panel = document.createElement('section');
    panel.className = 'board-target-zone';
    let scrollIdleTimer = 0;
    panel.addEventListener('scroll', function(){
      panel.classList.add('is-scrolling');
      clearTimeout(scrollIdleTimer);
      scrollIdleTimer = setTimeout(function(){ panel.classList.remove('is-scrolling'); }, 100);
    }, {passive:true});
    const totalRows = G.board[z] ? G.board[z].length : 3;
    const hasExtraRows = totalRows > 3;
    let hasExtraCells = false;
    if(hasExtraRows) panel.classList.add('has-extra-rows');
    const baseDisplayRows = viewerP === 1 ? [2, 1, 0] : [0, 1, 2];
    const displayRows = baseDisplayRows.filter(function(row){ return row < totalRows; });
    for(let row = 3; row < totalRows; row++) displayRows.push(row);
    displayRows.forEach(function(r) {
      const rowEl = document.createElement('div');
      rowEl.className = 'board-target-row';

      const rowLabel = document.createElement('div');
      rowLabel.className = 'board-target-row-label';
      rowLabel.textContent = getBoardTargetPickerRowLabel(r, viewerP);
      rowEl.appendChild(rowLabel);

      const cells = document.createElement('div');
      cells.className = 'board-target-cells';
      const rowCap = typeof getBoardRowCapacity === 'function' ? getBoardRowCapacity(z, r) : 3;
      if(rowCap > 3) {
        hasExtraCells = true;
        rowEl.classList.add('has-extra-cells');
      }
      cells.style.gridTemplateColumns = 'repeat(' + rowCap + ', var(--board-target-cell-w, 118px))';

      for(let c = 0; c < rowCap; c++) {
        const posKey = z + ':' + r + ':' + c;
        const cell = G.board[z] && G.board[z][r] ? G.board[z][r][c] : null;
        const entry = byPos.get(posKey) || null;
        const cellEl = document.createElement(entry ? 'button' : 'div');
        cellEl.className = 'board-target-cell';
        cellEl.dataset.pickerPos = posKey;
        if(entry) {
          cellEl.classList.add('is-targetable');
          cellEl.setAttribute('type', 'button');
          if(entry.squareOnly || allowSquareTargets) cellEl.classList.add('is-square-target');
        }

        if(!cell) {
          cellEl.classList.add('is-empty');
          cellEl.innerHTML = entry
            ? '<div class="board-target-card board-target-square-mark"><span>Square</span></div>'
            : '<span>Empty</span>';
        } else {
          const visual = getCardVisualData(cell, viewerP, {forceBoardHidden:true, boardPos:{z:z, r:r, c:c}});
          const img = visual && (visual.runtimeImg || visual.img);
          cellEl.classList.add(entry ? 'is-targetable' : 'is-muted');
          if(cell.owner === viewerP) cellEl.classList.add('is-own-card');
          else cellEl.classList.add('is-opponent-card');
          cellEl.dataset.owner = String(cell.owner);
          cellEl.setAttribute('type', 'button');
          cellEl.innerHTML =
            '<div class="board-target-card">' +
              (img ? '<img src="' + img + '" alt="' + (visual.name || 'Card') + '" decoding="async" loading="lazy" fetchpriority="low">' : '<span class="board-target-aff">' + getAffIcon(visual.aff) + '</span>') +
              '<div class="board-target-fate' + (visual.isHidden ? ' is-hidden-fate' : '') + '">' + visual.displayFate + '</div>' +
            '</div>';
          if(entry) cellEl.oncontextmenu = function(ev){ openPickerCardInfo(ev, cell, entry); };
          else {
            cellEl.oncontextmenu = function(ev){ openPickerCardInfo(ev, cell, {card:cell, z:z, r:r, c:c}); };
          }
        }
        if(entry) {
          cellEl.onclick = function(ev){
            ev.preventDefault();
            ev.stopPropagation();
            const exists = selected.some(function(item){ return item.z === entry.z && item.r === entry.r && item.c === entry.c; });
            if(exists) {
              selected = selected.filter(function(item){ return !(item.z === entry.z && item.r === entry.r && item.c === entry.c); });
            } else if(maxCount === 1) {
              selected = [entry];
            } else if(selected.length < maxCount) {
              selected.push(entry);
            } else {
              toast('Max ' + maxCount + ' selected');
              return;
            }
            updateSelection(body);
          };
        }
        cells.appendChild(cellEl);
      }
      rowEl.appendChild(cells);
      panel.appendChild(rowEl);
    });
    if(hasExtraCells) panel.classList.add('has-extra-cells');
    if(!hasExtraRows && !hasExtraCells) panel.classList.add('no-extra-board-space');
    zonesEl.appendChild(panel);
  });

  showModal(opts.title || 'Select Target', '', [
    {label:'Cancel', action:function(){
      closeModal();
      if(typeof opts.onCancel === 'function') opts.onCancel();
    }},
    {label:opts.confirmLabel || 'Confirm', pri:true, action:function(){
      if(!selected.length){ toast(opts.emptySelectionMessage || (allowSquareTargets ? 'Select a square first' : 'Select a card first')); return; }
      closeModal();
      if(typeof onConfirm === 'function') onConfirm(selected.slice());
    }}
  ], {immediate:true});
  const bodySlot = document.getElementById('modal-body');
  if(bodySlot) {
    bodySlot.innerHTML = '';
    bodySlot.appendChild(body);
  }
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox) {
    modalBox.classList.add('board-target-picker-modal');
    modalBox.classList.toggle('is-multi-zone-picker', zones.length > 1);
  }
  updateSelection(body);
}

// Zone-shaped picker: shows the real zone with ownership rows and cell slots.
function showZonePicker(z, prompt, entries, maxCount, viewerP, onConfirm, filter) {
  const wait = (typeof getInteractionAnimationDelayMs === 'function' ? getInteractionAnimationDelayMs() : getPlacementUiDelayMs());
  if(wait > 0){
    setTimeout(()=>showZonePicker(z, prompt, entries, maxCount, viewerP, onConfirm, filter), wait);
    return;
  }
  const pickerEntries = (entries || []).filter(function(entry){ return entry && entry.card; });
  if(!pickerEntries.length){ toast('No valid targets in this zone'); return; }
  showBoardTargetPicker({
    title: 'Zone '+(z+1)+' - Select Target',
    prompt: prompt,
    maxCount: Math.max(1, Math.min(maxCount || 1, pickerEntries.length)),
    confirmLabel: 'Confirm',
    viewerPlayerIndex: viewerP,
    zones: [z],
    entries: pickerEntries,
    showOpponentOverlay: true,
    emptyMessage: 'No valid targets in this zone'
  }, function(chosen){
    onConfirm(chosen);
  });
  return;
  const body = document.createElement('div');
  body.innerHTML = `
    <p style="font-size:.85rem;color:var(--dim);font-style:italic;margin-bottom:.3rem;">${prompt}</p>
    <p style="font-size:.72rem;color:var(--dim);margin-bottom:.5rem;">
      <span style="color:var(--p1)">Blue = your cards</span>
      <span style="color:var(--p2);margin-left:1rem;">Red = opponent</span>
      <span style="color:#777;margin-left:1rem;">Grey = not targetable</span>
    </p>
    <div id="zp-count" style="font-family:'Cinzel',serif;color:var(--gold);font-size:.85rem;margin-bottom:.5rem;">0/${maxCount} selected</div>
    <div class="zone-picker-wrap"></div>`;
  const wrap = body.querySelector('.zone-picker-wrap');

  // Build a 3x3 grid of cells with ownership colour classes
  const rowLabels = ['Opponent','Contested','Yours'];
  // Orientation: if viewerP is P1 (0), row 0 = opp safe, row 2 = mine (as normal)
  // if viewerP is P2 (1), flip so row 0 = mine, row 2 = opp -- but keep rendering consistent
  let chosen = [];
  for(let r=0;r<3;r++){
    const rowEl = document.createElement('div');
    rowEl.className = 'zp-row';
    const rowLbl = document.createElement('div');
    rowLbl.className = 'zp-row-lbl';
    // Adjust labels based on viewer perspective
    const isViewerP1 = viewerP===0;
    const displayRow = isViewerP1 ? r : 2-r;
    rowLbl.textContent = '';
    rowEl.appendChild(rowLbl);
    const cells = document.createElement('div');
    cells.className = 'zp-cells';
    // Actual row in data: we iterate displayRow
    const dataRow = displayRow;
    const rowCapacity = G.board[z] && G.board[z][dataRow] ? G.board[z][dataRow].length : 3;
    for(let c=0;c<rowCapacity;c++){
      const cell = G.board[z]?.[dataRow]?.[c] || null;
      const cellEl = document.createElement('div');
      cellEl.className = 'zp-cell';
      if(!cell){
        cellEl.classList.add('zp-empty');
        cellEl.innerHTML = '<span style="color:#333;font-family:Cinzel,serif;font-size:.6rem;">empty</span>';
      } else {
        const ownClass = cell.owner===viewerP ? 'zp-mine' : 'zp-enemy';
        cellEl.classList.add(ownClass);
        const isTargetable = !filter || filter(cell,z,dataRow,c);
        if(!isTargetable){
          cellEl.classList.add('zp-notarget');
        } else {
          cellEl.classList.add('zp-targetable');
        }
        const entry = entries.find(e=>e.card===cell);
        const visual = getCardVisualData(cell, viewerP, {boardPos:{z, r:dataRow, c}});
        cellEl.innerHTML = `
          <div class="zp-card-art">${visual.img?`<img src="${visual.img}" alt="${visual.name}">`:`<span style="font-size:2rem;opacity:.4;">${getAffIcon(visual.aff)}</span>`}</div>
          <div class="zp-card-fate">${visual.displayFate}</div>`;
        if(isTargetable && entry){
          cellEl.onclick = ()=>{
            if(cellEl.classList.contains('sel')){
              cellEl.classList.remove('sel');
              chosen = chosen.filter(x=>x!==entry);
            } else {
              if(maxCount===1){
                // Single-select: replace
                wrap.querySelectorAll('.zp-cell.sel').forEach(x=>x.classList.remove('sel'));
                chosen=[entry];
              } else if(chosen.length<maxCount){
                chosen.push(entry);
              } else {
                toast(`Max ${maxCount} selected`);return;
              }
              cellEl.classList.add('sel');
            }
            const cntEl = document.getElementById('zp-count');
            if(cntEl) cntEl.textContent = `${chosen.length}/${maxCount} selected`;
          };
        }
      }
      cells.appendChild(cellEl);
    }
    rowEl.appendChild(cells);
    wrap.appendChild(rowEl);
  }

  if(typeof resetModalChrome === 'function') resetModalChrome();
  document.getElementById('modal-body').innerHTML='';
  document.getElementById('modal-body').appendChild(body);
  document.getElementById('modal-title').textContent = 'Zone '+(z+1)+' - Select Target';
  document.getElementById('modal-acts').innerHTML='';
  const ok = document.createElement('button');
  ok.className='btn sm pri';ok.textContent='Confirm';
  ok.onclick = ()=>{closeModal();onConfirm(chosen);};
  const cancel = document.createElement('button');
  cancel.className='btn sm';cancel.textContent='Cancel';cancel.onclick=closeModal;
  document.getElementById('modal-acts').appendChild(cancel);
  document.getElementById('modal-acts').appendChild(ok);
  document.getElementById('modal').classList.add('on');
  // Trim the modal tightly around the zone picker content
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox) Object.assign(modalBox.style, {maxWidth:'520px', width:'auto', padding:'1.2rem 1.4rem'});
}

function pickCardsFromHand(player, maxCount, prompt, callback) {
  const hand = G.players[player].hand;
  if(!hand.length){toast('Hand is empty');callback([]);return;}
  const effectiveMax = Math.min(maxCount, hand.length);
  pickCardsVisual(hand, {
    title: prompt,
    subtitle: maxCount>=999 ? `From your hand (any number)` : `From your hand — up to ${effectiveMax}`,
    maxCount: maxCount>=999 ? hand.length : effectiveMax,
    confirmLabel: 'Confirm'
  }, callback);
}

// Image-based card picker with pagination
function pickCardsVisual(cards, opts, onConfirm) {
  opts = opts || {};
  const allowAfterEffectCinematic = typeof G !== 'undefined' && G && G._allowImmediateEffectPickerUntil && Date.now() < G._allowImmediateEffectPickerUntil;
  const wait = (opts.immediate || allowAfterEffectCinematic) ? 0 : (typeof getInteractionAnimationDelayMs === 'function' ? getInteractionAnimationDelayMs() : getPlacementUiDelayMs());
  if(wait > 0){
    setTimeout(()=>pickCardsVisual(cards, opts, onConfirm), wait);
    return;
  }
  if(!cards.length){toast('No matching cards found');if(onConfirm) onConfirm([]); return;}
  if(typeof tutorialFilterCardPickerOptions === 'function') {
    const tutorialCards = tutorialFilterCardPickerOptions(cards, opts || {});
    if(Array.isArray(tutorialCards) && tutorialCards.length) cards = tutorialCards;
  }
  const maxCount = opts.maxCount || 1;
  const minCount = opts.minCount || 0;
  const viewerP = typeof opts.viewerPlayerIndex === 'number' ? opts.viewerPlayerIndex : getPerspectivePlayerIndex();
  const CARDS_PER_PAGE = 8;
  let selected=[];
  let page = 0;
  const totalPages = Math.ceil(cards.length / CARDS_PER_PAGE);
  const positionEntries = Array.isArray(opts.positionEntries) ? opts.positionEntries : null;

  function getPickerCardOwner(index) {
    const entry = positionEntries && positionEntries[index];
    const card = cards[index];
    if(entry && entry.owner !== undefined && Number.isInteger(Number(entry.owner))) return Number(entry.owner);
    if(card && card.owner !== undefined && Number.isInteger(Number(card.owner))) return Number(card.owner);
    return null;
  }

  function pickerCardIsOpponent(index) {
    const owner = getPickerCardOwner(index);
    const viewer = typeof viewerP === 'number' ? viewerP : getPerspectivePlayerIndex();
    return owner === 1 - viewer;
  }

  function getPickerRowLabel(entry) {
    if(!entry || typeof entry.r !== 'number') return '';
    if(entry.r === 1) return 'Contested';
    const viewer = typeof viewerP === 'number' ? viewerP : getPerspectivePlayerIndex();
    const owner = Number.isInteger(Number(entry.owner)) ? Number(entry.owner) : null;
    if(owner === viewer) return 'Your side';
    if(owner === 1 - viewer) return 'Opponent side';
    if(entry.r === 0) return viewer === 1 ? 'Your side' : 'Opponent side';
    if(entry.r === 2) return viewer === 0 ? 'Your side' : 'Opponent side';
    return 'Extra row';
  }

  function getPickerPositionLabel(index) {
    const entry = positionEntries && positionEntries[index];
    if(!entry || typeof entry.z !== 'number') return '';
    const rowLabel = getPickerRowLabel(entry);
    return 'Zone ' + (entry.z + 1) + (rowLabel ? ' - ' + rowLabel : '');
  }

  let zoneContextHtml = '';
  if(positionEntries && positionEntries.length) {
    const zones = [...new Set(positionEntries.map(e=>typeof e.z === 'number' ? e.z : null).filter(z=>z !== null))];
    zoneContextHtml = '<div class="visual-picker-zone-context">' + (zones.length === 1 ? 'ZONE ' + (zones[0] + 1) : 'MULTI-ZONE TARGETS') + '</div>';
  }

  const body=document.createElement('div');
  body.className = 'visual-picker-body visual-picker-v2 visual-picker-search-flow';
  const sub = opts.subtitle || (maxCount>1?`Select up to ${maxCount}`:'Select one');
  body.innerHTML=`
    <p style="font-size:.78rem;margin-bottom:.3rem;color:var(--dim);font-style:italic;text-align:center;">${sub}</p>
    ${zoneContextHtml}
    <div id="visual-count" style="font-family:'Cinzel',serif;color:var(--gold);font-size:.75rem;margin-bottom:.3rem;text-align:center;">0/${maxCount} selected</div>
    <canvas id="visual-page-canvas" class="visual-page-canvas" width="840" height="592" style="width:100%;max-width:840px;display:block;margin:0 auto;border-radius:8px;background:rgba(3,5,10,.45);"></canvas>
    ${totalPages>1?`<div id="visual-pagination" style="display:flex;align-items:center;justify-content:center;gap:.8rem;margin-top:.5rem;padding:.3rem 0;">
      <button class="btn sm" id="vp-prev" style="font-size:.72rem;padding:.3rem .7rem;min-width:60px;">◀ Prev</button>
      <span id="vp-page" style="font-family:'Cinzel',serif;font-size:.72rem;color:var(--dim);letter-spacing:.06em;">1 / ${totalPages}</span>
      <button class="btn sm" id="vp-next" style="font-size:.72rem;padding:.3rem .7rem;min-width:60px;">Next ▶</button>
    </div>`:''}`;

  const pickerCanvas = body.querySelector('#visual-page-canvas');
  const pickerCtx = pickerCanvas && pickerCanvas.getContext ? pickerCanvas.getContext('2d', { alpha:true }) : null;
  const pickerImageCache = new Map();
  let pickerHitboxes = [];
  let pickerDrawToken = 0;
  let pickerMotionTimer = 0;

  function triggerPickerMotion(className, duration) {
    if(!body || !className) return;
    body.classList.remove(className);
    void body.offsetWidth;
    body.classList.add(className);
    if(pickerMotionTimer) clearTimeout(pickerMotionTimer);
    pickerMotionTimer = setTimeout(function(){ body.classList.remove(className); }, duration || 520);
  }

  function loadPickerImage(src) {
    if(!src || pickerImageCache.has(src)) return;
    const img = new Image();
    img.decoding = 'async';
    img.onload = function(){ pickerImageCache.set(src, img); drawCanvasPage(); };
    img.onerror = function(){ pickerImageCache.set(src, null); };
    pickerImageCache.set(src, img);
    img.src = src;
  }

  function drawRoundedRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr, y);
    ctx.lineTo(x+w-rr, y);
    ctx.quadraticCurveTo(x+w, y, x+w, y+rr);
    ctx.lineTo(x+w, y+h-rr);
    ctx.quadraticCurveTo(x+w, y+h, x+w-rr, y+h);
    ctx.lineTo(x+rr, y+h);
    ctx.quadraticCurveTo(x, y+h, x, y+h-rr);
    ctx.lineTo(x, y+rr);
    ctx.quadraticCurveTo(x, y, x+rr, y);
    ctx.closePath();
  }

  function drawImageCover(ctx, img, x, y, w, h) {
    const srcRatio = img.width / Math.max(1, img.height);
    const dstRatio = w / Math.max(1, h);
    let sx = 0, sy = 0, sw = img.width, sh = img.height;
    if(srcRatio > dstRatio) {
      sw = img.height * dstRatio;
      sx = (img.width - sw) / 2;
    } else {
      sh = img.width / dstRatio;
      sy = Math.max(0, (img.height - sh) * 0.25);
      if(sy + sh > img.height) sy = img.height - sh;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  function drawImageContain(ctx, img, x, y, w, h) {
    const srcRatio = img.width / Math.max(1, img.height);
    const dstRatio = w / Math.max(1, h);
    let dw = w;
    let dh = h;
    if(srcRatio > dstRatio) dh = w / srcRatio;
    else dw = h * srcRatio;
    const dx = x + (w - dw) / 2;
    const dy = y + (h - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  function getCanvasPointer(ev) {
    const rect = pickerCanvas.getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left) * (pickerCanvas.width / Math.max(1, rect.width)) / Math.max(1, Math.min(3, window.devicePixelRatio || 1)),
      y: (ev.clientY - rect.top) * (pickerCanvas.height / Math.max(1, rect.height)) / Math.max(1, Math.min(3, window.devicePixelRatio || 1))
    };
  }

  function hitCanvasCard(ev) {
    const p = getCanvasPointer(ev);
    for(let i=pickerHitboxes.length-1; i>=0; i--) {
      const h = pickerHitboxes[i];
      if(p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) return h;
    }
    return null;
  }

  function drawCanvasPage() {
    if(!pickerCanvas || !pickerCtx) return;
    pickerDrawToken++;
    const token = pickerDrawToken;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const cssW = 840, cols = 4, rows = 2, gap = 16, pad = 16;
    const cardW = Math.floor((cssW - pad*2 - gap*(cols-1)) / cols);
    const cardH = Math.floor(cardW * 1.4);
    const cssH = pad*2 + rows*cardH + gap*(rows-1);
    const pxW = Math.round(cssW * dpr);
    const pxH = Math.round(cssH * dpr);
    if(pickerCanvas.width !== pxW || pickerCanvas.height !== pxH) {
      pickerCanvas.width = pxW;
      pickerCanvas.height = pxH;
    }
    pickerCanvas.style.height = cssH + 'px';
    pickerCtx.setTransform(dpr,0,0,dpr,0,0);
    pickerCtx.imageSmoothingEnabled = true;
    pickerCtx.imageSmoothingQuality = 'high';
    pickerCtx.clearRect(0, 0, cssW, cssH);
    pickerCtx.fillStyle = 'rgba(3,5,10,.38)';
    pickerCtx.fillRect(0, 0, cssW, cssH);
    pickerHitboxes = [];
    const start = page * CARDS_PER_PAGE;
    const end = Math.min(start + CARDS_PER_PAGE, cards.length);
    for(let i=start; i<end; i++) {
      const c = cards[i];
      const visual = getCardVisualData(c, viewerP);
      const local = i - start;
      const x = pad + (local % cols) * (cardW + gap);
      const y = pad + Math.floor(local / cols) * (cardH + gap);
      pickerHitboxes.push({ x, y, w:cardW, h:cardH, index:i, card:c, visual, entry: positionEntries && positionEntries[i] });
      pickerCtx.save();
      drawRoundedRectPath(pickerCtx, x, y, cardW, cardH, 8);
      pickerCtx.clip();
      pickerCtx.fillStyle = '#080910';
      pickerCtx.fillRect(x, y, cardW, cardH);
      if(visual.img) {
        const cached = pickerImageCache.get(visual.img);
        if(cached && cached.complete && cached.naturalWidth !== 0) drawImageContain(pickerCtx, cached, x, y, cardW, cardH);
        else {
          loadPickerImage(visual.img);
          pickerCtx.fillStyle = 'rgba(214,180,89,.08)';
          pickerCtx.fillRect(x, y, cardW, cardH);
        }
      } else {
        pickerCtx.fillStyle = 'rgba(214,180,89,.10)';
        pickerCtx.fillRect(x, y, cardW, cardH);
        pickerCtx.fillStyle = 'rgba(236,224,190,.55)';
        pickerCtx.font = '32px serif';
        pickerCtx.textAlign = 'center';
        pickerCtx.textBaseline = 'middle';
        pickerCtx.fillText(getAffIcon(visual.aff), x + cardW/2, y + cardH/2);
      }
      if(opts.showOpponentOverlay === true && pickerCardIsOpponent(i)) {
        pickerCtx.fillStyle = 'rgba(190,12,30,.34)';
        pickerCtx.fillRect(x, y, cardW, cardH);
        const grad = pickerCtx.createLinearGradient(x, y, x, y + cardH);
        grad.addColorStop(0, 'rgba(255,76,92,.28)');
        grad.addColorStop(1, 'rgba(110,0,18,.42)');
        pickerCtx.fillStyle = grad;
        pickerCtx.fillRect(x, y, cardW, cardH);
      }
      pickerCtx.restore();
      pickerCtx.lineWidth = selected.includes(i) ? 4 : 1.5;
      pickerCtx.strokeStyle = selected.includes(i) ? 'rgba(238,205,105,.98)' : 'rgba(238,205,105,.35)';
      drawRoundedRectPath(pickerCtx, x+1, y+1, cardW-2, cardH-2, 8);
      pickerCtx.stroke();
      const positionLabel = getPickerPositionLabel(i);
      if(positionLabel) {
        pickerCtx.save();
        pickerCtx.fillStyle = 'rgba(4,6,12,.82)';
        pickerCtx.fillRect(x + 6, y + 6, cardW - 12, 20);
        pickerCtx.strokeStyle = 'rgba(238,205,105,.45)';
        pickerCtx.lineWidth = 1;
        pickerCtx.strokeRect(x + 6.5, y + 6.5, cardW - 13, 19);
        pickerCtx.fillStyle = 'rgba(255,239,180,.94)';
        pickerCtx.font = '11px Cinzel, serif';
        pickerCtx.textAlign = 'center';
        pickerCtx.textBaseline = 'middle';
        pickerCtx.fillText(positionLabel.toUpperCase(), x + cardW/2, y + 16, cardW - 18);
        pickerCtx.restore();
      }
      if(selected.includes(i)) {
        pickerCtx.fillStyle = 'rgba(238,205,105,.16)';
        drawRoundedRectPath(pickerCtx, x+2, y+2, cardW-4, cardH-4, 7);
        pickerCtx.fill();
      }
    }
  }

  function renderPage() {
    if(pickerCtx) {
      drawCanvasPage();
      const pageLabel = body.querySelector('#vp-page');
      if(pageLabel) pageLabel.textContent = `${page+1} / ${totalPages}`;
      const prevBtn = body.querySelector('#vp-prev');
      const nextBtn = body.querySelector('#vp-next');
      if(prevBtn) prevBtn.disabled = page === 0;
      if(nextBtn) nextBtn.disabled = page >= totalPages - 1;
      return;
    }
    const grid = body.querySelector('#visual-page-grid');
    if(!grid) return;
    grid.innerHTML = '';
    const start = page * CARDS_PER_PAGE;
    const end = Math.min(start + CARDS_PER_PAGE, cards.length);
    for(let i=start; i<end; i++) {
      const c = cards[i];
      const visual = getCardVisualData(c, viewerP);
      const el = document.createElement('div');
      el.className = 'mc visual-mc' + (selected.includes(i)?' sel':'');
      el.innerHTML=`
        ${getPickerPositionLabel(i) ? `<div class="visual-card-zone-tag">${getPickerPositionLabel(i)}</div>` : ''}
        <div class="mc-art">${visual.img?`<img src="${visual.img}" alt="${visual.name}" loading="eager" decoding="async" fetchpriority="high">`:`<span class="mc-ico">${getAffIcon(visual.aff)}</span>`}</div>
        `;
      el.title = visual.ability+' — '+visual.effect;
      el.onmouseenter=(ev)=>showHoverPreview(visual,ev);
      el.onmousemove=(ev)=>positionHoverPreview(ev);
      el.onmouseleave=()=>removeHoverPreview();
      (function(_c, _entry){ el.oncontextmenu = function(ev){ ev.preventDefault(); ev.stopPropagation(); removeHoverPreview(); inspectPickerCardDetail(_c, _entry); }; })(c, positionEntries && positionEntries[i]);
      (function(_i, _el){
        _el.onclick=()=>{
          if(_el.classList.contains('sel')){
            _el.classList.remove('sel');
            selected=selected.filter(x=>x!==_i);
          } else if(selected.length<maxCount){
            _el.classList.add('sel');
            selected.push(_i);
          } else if(maxCount===1){
            grid.querySelectorAll('.visual-mc.sel').forEach(x=>x.classList.remove('sel'));
            selected=[_i];
            _el.classList.add('sel');
          }
          document.getElementById('visual-count').textContent=`${selected.length}/${maxCount} selected`;
          if(minCount > 0){
            const okBtn = document.getElementById('modal-acts').querySelector('.btn.pri');
            if(okBtn){ okBtn.disabled = selected.length < minCount; okBtn.style.opacity = selected.length < minCount ? '.4' : '1'; }
          }
          triggerPickerMotion('is-selection-pulse', 360);
        };
      })(i, el);
      grid.appendChild(el);
    }
    const pageLabel = body.querySelector('#vp-page');
    if(pageLabel) pageLabel.textContent = `${page+1} / ${totalPages}`;
    const prevBtn = body.querySelector('#vp-prev');
    const nextBtn = body.querySelector('#vp-next');
    if(prevBtn) prevBtn.disabled = page === 0;
    if(nextBtn) nextBtn.disabled = page >= totalPages - 1;
  }

  if(typeof resetModalChrome === 'function') resetModalChrome();
  document.getElementById('modal-body').innerHTML='';
  document.getElementById('modal-body').appendChild(body);
  if(pickerCanvas) {
    pickerCanvas.onclick = function(ev) {
      const hit = hitCanvasCard(ev);
      if(!hit) return;
      const idx = hit.index;
      if(selected.includes(idx)) selected = selected.filter(x=>x!==idx);
      else if(selected.length < maxCount) selected.push(idx);
      else if(maxCount === 1) selected = [idx];
      const countEl = document.getElementById('visual-count');
      if(countEl) countEl.textContent = `${selected.length}/${maxCount} selected`;
      if(minCount > 0){
        const okBtn = document.getElementById('modal-acts').querySelector('.btn.pri');
        if(okBtn){ okBtn.disabled = selected.length < minCount; okBtn.style.opacity = selected.length < minCount ? '.4' : '1'; }
      }
      triggerPickerMotion('is-selection-pulse', 360);
      drawCanvasPage();
    };
    pickerCanvas.onmousemove = function(ev) {
      const hit = hitCanvasCard(ev);
      pickerCanvas.style.cursor = hit ? 'pointer' : 'default';
      if(hit) {
        showHoverPreview(hit.visual, ev);
        positionHoverPreview(ev);
      } else {
        removeHoverPreview();
      }
    };
    pickerCanvas.onmouseleave = function(){ removeHoverPreview(); pickerCanvas.style.cursor = 'default'; };
    pickerCanvas.oncontextmenu = function(ev) {
      const hit = hitCanvasCard(ev);
      if(!hit) return;
      ev.preventDefault();
      ev.stopPropagation();
      removeHoverPreview();
      inspectPickerCardDetail(hit.card, hit.entry);
    };
  }
  renderPage();
  triggerPickerMotion('is-search-entering', 780);

  // Wire pagination
  const prevBtn = body.querySelector('#vp-prev');
  const nextBtn = body.querySelector('#vp-next');
  if(prevBtn) prevBtn.onclick = ()=>{ if(page>0){page--;renderPage();triggerPickerMotion('is-page-turning', 460);} };
  if(nextBtn) nextBtn.onclick = ()=>{ if(page<totalPages-1){page++;renderPage();triggerPickerMotion('is-page-turning', 460);} };

  document.getElementById('modal-title').textContent=opts.title||'Select a Card';
  document.getElementById('modal-acts').innerHTML='';
  const ok=document.createElement('button');
  ok.className='btn sm pri';ok.textContent=opts.confirmLabel||'Confirm';
  if(minCount > 0){ ok.disabled = true; ok.style.opacity = '.4'; }
  ok.onclick=()=>{
    if(minCount > 0 && selected.length < minCount){ toast('You must select at least '+minCount+' card(s)'); return; }
    closeModal();onConfirm(selected.map(i=>cards[i]));
  };
  const cl=document.createElement('button');
  cl.className='btn sm';cl.textContent='Cancel';
  cl.onclick=()=>{closeModal();if(opts.onCancel) opts.onCancel();};
  if(minCount <= 0) document.getElementById('modal-acts').appendChild(cl);
  document.getElementById('modal-acts').appendChild(ok);
  document.getElementById('modal').classList.add('on');
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox) {
    modalBox.classList.add('visual-card-picker-modal');
    modalBox.style.maxWidth = '880px';
  }
}

function queueSearchToHandMotion(player, card, source, handIndex, sequenceIndex, sequenceCount) {
  if(!card || !document.getElementById('s-game')?.classList.contains('active')) return false;
  const motion = window.FateV2CardMotionFx;
  if(!motion || typeof motion.searchCardToHand !== 'function') return false;
  const idx = handIndex == null && G && G.players && G.players[player] ? G.players[player].hand.length : handIndex;
  const seq = Math.max(0, Number(sequenceIndex) || 0);
  const count = Math.max(1, Number(sequenceCount) || 1);
  return !!motion.searchCardToHand(card, player, source || 'deck', {
    handIndex:idx,
    drawIndex:seq,
    drawCount:count,
    startOffset:seq * 170
  });
}

function searchDeckForType(player, type, prompt, maxCount=1) {
  const matches=G.players[player].deck.filter(c=>type === 'Supporter' && typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(c, player) : c.type===type);
  pickCardsVisual(matches, {title:prompt, subtitle:`From your deck — up to ${maxCount} ${type}(s)`, maxCount, confirmLabel:'Add to Hand', immediate:true},
    (chosen)=>{
      const baseHandIndex = G.players[player].hand.length;
      chosen.forEach((c, idx)=>{
        queueSearchToHandMotion(player, c, 'deck', baseHandIndex + idx, idx, chosen.length);
        if(typeof addCardToHand==='function') addCardToHand(player, c);
        else G.players[player].hand.push(c);
        G.players[player].deck = G.players[player].deck.filter(x=>x.iid!==c.iid);
      });
      shuffle(G.players[player].deck);
      if(typeof tutorialAfterDeckSearch === 'function') tutorialAfterDeckSearch(player, chosen);
      if(chosen.length && typeof playSfx === 'function') playSfx('searchFound');
      renderBoardActionForPlayer(player, {hand:true, piles:true});
      if(chosen.length) toast(`Added ${chosen.length} card(s) to hand`);
    });
}

function searchDeckForCard(player, filter, prompt, callback) {
  const matches=G.players[player].deck.filter(filter);
  pickCardsVisual(matches, {title:prompt, subtitle:'Search your deck', maxCount:1, confirmLabel:'Choose', immediate:true},
    (chosen)=>{
      if(!chosen.length) return;
      const c=chosen[0];
      queueSearchToHandMotion(player, c, 'deck', G.players[player].hand.length, 0, 1);
      G.players[player].deck = G.players[player].deck.filter(x=>x.iid!==c.iid);
      shuffle(G.players[player].deck);
      if(typeof playSfx === 'function') playSfx('searchFound');
      if(callback) callback(c, 'deck');
      renderBoardActionForPlayer(player, {hand:true, piles:true});
    });
}

function searchAnySource(player, filter, prompt, callback) {
  const recoverableDiscard = typeof getRecoverableDiscardCards === 'function' ? getRecoverableDiscardCards(player, filter) : G.players[player].discard.filter(filter);
  const matches=[...G.players[player].deck.filter(filter),...recoverableDiscard];
  pickCardsVisual(matches, {title:prompt, subtitle:'Search deck and discard', maxCount:1, confirmLabel:'Choose', immediate:true},
    (chosen)=>{
      if(!chosen.length) return;
      const c=chosen[0];
      const source = G.players[player].deck.some(x=>x && x.iid===c.iid) ? 'deck' : 'discard';
      queueSearchToHandMotion(player, c, source, G.players[player].hand.length, 0, 1);
      G.players[player].deck = G.players[player].deck.filter(x=>x.iid!==c.iid);
      G.players[player].discard = G.players[player].discard.filter(x=>x.iid!==c.iid);
      if(typeof playSfx === 'function') playSfx('searchFound');
      if(callback) callback(c, source);
    });
}

function pickFromDiscard(player, type, prompt, callback) {
  const filter = c=>!type||c.type===type;
  const matches=typeof getRecoverableDiscardCards === 'function' ? getRecoverableDiscardCards(player, filter) : G.players[player].discard.filter(filter);
  if(!matches.length && typeof isDiscardRecoveryBlockedByLandscape === 'function' && isDiscardRecoveryBlockedByLandscape()){
    toast('Zion Canyon prevents recovering discarded cards.');
  }
  pickCardsVisual(matches, {title:prompt, subtitle:'Pick from discard pile', maxCount:1, confirmLabel:'Choose', immediate:true},
    (chosen)=>{
      if(!chosen.length) return;
      queueSearchToHandMotion(player, chosen[0], 'discard', G.players[player].hand.length, 0, 1);
      if(callback) callback(chosen[0], 'discard');
    });
}

function drawAffiliated(player, aff, count) {
  const recoverableDiscard = typeof getRecoverableDiscardCards === 'function' ? getRecoverableDiscardCards(player, c=>c.aff===aff) : G.players[player].discard.filter(c=>c.aff===aff);
  const from=[...G.players[player].deck.filter(c=>c.aff===aff),...recoverableDiscard];
  if(!from.length){toast('No '+AFF_LABEL[aff]+' cards available');return;}
  let added=0;
  const baseHandIndex = G.players[player].hand.length;
  for(const c of from){
    if(added>=count) break;
    const source = G.players[player].deck.some(x=>x && x.iid===c.iid) ? 'deck' : 'discard';
    queueSearchToHandMotion(player, c, source, baseHandIndex + added, added, count);
    if(typeof addCardToHand==='function') addCardToHand(player, c);
    else G.players[player].hand.push(c);
    G.players[player].deck=G.players[player].deck.filter(x=>x.iid!==c.iid);
    G.players[player].discard=G.players[player].discard.filter(x=>x.iid!==c.iid);
    added++;
  }
  toast(`Added ${added} card(s) to hand`);renderHand();
}

function drawSupportersFromDeckOrDiscard(player, count, cb) {
  const supporterFilter = c=>typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(c, player) : c.type==='Supporter';
  const recoverableDiscard = typeof getRecoverableDiscardCards === 'function' ? getRecoverableDiscardCards(player, supporterFilter) : G.players[player].discard.filter(supporterFilter);
  const matches=[...G.players[player].deck.filter(supporterFilter),...recoverableDiscard];
  if(!matches.length){toast('No supporters available');if(cb)cb();return;}
  let added=0;
  const baseHandIndex = G.players[player].hand.length;
  for(const c of matches){
    if(added>=count) break;
    const source = G.players[player].deck.some(x=>x && x.iid===c.iid) ? 'deck' : 'discard';
    queueSearchToHandMotion(player, c, source, baseHandIndex + added, added, count);
    if(typeof addCardToHand==='function') addCardToHand(player, c);
    else G.players[player].hand.push(c);
    G.players[player].deck=G.players[player].deck.filter(x=>x.iid!==c.iid);
    G.players[player].discard=G.players[player].discard.filter(x=>x.iid!==c.iid);
    added++;
  }
  toast(`Added ${added} supporter(s) to hand`);renderHand();if(cb)cb();
}

function addAffFromDeckDiscard(player, aff) {
  const fromDeck=G.players[player].deck.filter(c=>c.aff===aff);
  const fromDiscard=typeof getRecoverableDiscardCards === 'function' ? getRecoverableDiscardCards(player, c=>c.aff===aff) : G.players[player].discard.filter(c=>c.aff===aff);
  const label = AFF_LABEL[aff] || aff;
  let added = 0;
  const baseHandIndex = G.players[player].hand.length;
  const addChosen = (card, source) => {
    if(!card) return;
    queueSearchToHandMotion(player, card, source || 'deck', baseHandIndex + added, added, 2);
    if(typeof addCardToHand==='function') addCardToHand(player, card);
    else G.players[player].hand.push(card);
    if(source === 'deck') G.players[player].deck=G.players[player].deck.filter(x=>x.iid!==card.iid);
    else G.players[player].discard=G.players[player].discard.filter(x=>x.iid!==card.iid);
    added++;
  };
  const finish = () => {
    if(G.players[player].deck.length) shuffle(G.players[player].deck);
    if(added && typeof playSfx === 'function') playSfx('searchFound');
    toast(`Added ${added} ${label} card(s) to hand`);
    renderBoardActionForPlayer(player, {hand:true, piles:true});
  };
  const chooseDiscard = () => {
    if(!fromDiscard.length){ finish(); return; }
    pickCardsVisual(fromDiscard, {
      title:'Cosmic GF - Discard Search',
      subtitle:`Choose one ${label} card from your discard pile`,
      maxCount:1,
      confirmLabel:'Add to Hand',
      immediate:true
    }, (picked)=>{
      if(picked.length) addChosen(picked[0], 'discard');
      finish();
    });
  };
  if(fromDeck.length){
    pickCardsVisual(fromDeck, {
      title:'Cosmic GF - Deck Search',
      subtitle:`Choose one ${label} card from your deck`,
      maxCount:1,
      confirmLabel:'Add to Hand',
      immediate:true
    }, (picked)=>{
      if(picked.length) addChosen(picked[0], 'deck');
      chooseDiscard();
    });
  } else if(fromDiscard.length){
    chooseDiscard();
  } else {
    toast(`No ${label} cards available`);
  }
}

function showTop5Rearrange(player) {
  const top5=G.players[player].deck.slice(0,5);
  let order=[...top5];
  let html=`<p style="font-size:.82rem;margin-bottom:.5rem">Drag to rearrange (simplified — click to move to top):</p>
    <div style="display:flex;flex-direction:column;gap:.25rem;" id="top5list">`;
  top5.forEach((c,i)=>html+=`<div class="tgt-item" style="cursor:pointer" onclick="moveTop5(${i})">${i+1}. ${c.name}</div>`);
  html+='</div>';
  window._top5=top5;window._top5Player=player;
  showModal('Rearrange Top 5',html,[
    {label:'Done (keep order)',action:()=>{
      G.players[player].deck=[...window._top5,...G.players[player].deck.slice(5)];
      closeModal();toast('Top 5 arranged.');
    }},{label:'Cancel',action:closeModal}]);
}
window.moveTop5=function(i){
  const c=window._top5.splice(i,1)[0];
  window._top5.unshift(c);
  const list=document.getElementById('top5list');
  if(list) list.innerHTML=window._top5.map((c,j)=>`<div class="tgt-item" style="cursor:pointer" onclick="moveTop5(${j})">${j+1}. ${c.name}</div>`).join('');
};

function showAffiliationPicker(callback) {
  // Use the icon-based picker everywhere an affiliation is declared.
  // This keeps Rivera, Duncan, Mark Menz, and any older text-picker callers consistent.
  return showAffiliationPickerVisual(callback);
}

// Visual affiliation picker with 4 icon squares (used by Duncan Heyward)
function showAffiliationPickerVisual(callback) {
  const wait = (typeof getInteractionAnimationDelayMs === 'function' ? getInteractionAnimationDelayMs() : (typeof getPlacementUiDelayMs === 'function' ? getPlacementUiDelayMs() : 0));
  if(wait > 0){ setTimeout(()=>showAffiliationPickerVisual(callback), wait); return; }
  const affs = [
    {key:'reality', label:'Reality', note:'Anchors and anomalies', accent:'#e2c657', glow:'226,198,87'},
    {key:'third_great_war', label:'Third Great War', note:'Front lines and banners', accent:'#e25a4f', glow:'226,90,79'},
    {key:'expanded_worlds', label:'Expanded Worlds', note:'Maps beyond the map', accent:'#49bf69', glow:'73,191,105'},
    {key:'eventide', label:'Eventide', note:'Twilight courts and oaths', accent:'#58c4f0', glow:'88,196,240'}
  ];
  const body = document.getElementById('modal-body');
  document.getElementById('modal-title').textContent = 'Declare Affiliation';
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox) {
    modalBox.classList.add('affiliation-picker-modal');
    modalBox.style.maxWidth = '458px';
  }
  if(body) body.style.overflow = 'visible';
  body.innerHTML = `
    <div class="aff-pick-shell">
      <div class="aff-pick-herald">
        <span class="aff-pick-herald-line"></span>
        <span class="aff-pick-herald-copy">Choose the banner this effect will name</span>
        <span class="aff-pick-herald-line"></span>
      </div>
      <div class="aff-pick-grid">
      ${affs.map(a=>`
        <button class="aff-pick-square" data-aff="${a.key}" type="button" style="--aff-accent:${a.accent};--aff-glow:${a.glow};" aria-label="Declare ${a.label}">
          <span class="aff-pick-icon-frame">
            ${typeof getAffIcon==='function' ? getAffIcon(a.key) : ''}
          </span>
          <span class="aff-pick-label">${a.label}</span>
          <span class="aff-pick-note">${a.note}</span>
        </button>
      `).join('')}
      </div>
    </div>`;
  body.querySelectorAll('.aff-pick-square').forEach(sq=>{
    sq.onclick=()=>{
      closeModal();
      if(typeof playSfx==='function') playSfx('effect');
      callback(sq.dataset.aff);
    };
  });
  document.getElementById('modal-acts').innerHTML = '';
  document.getElementById('modal').classList.add('on');
}


function showZonePickerVisual(options, callback) {
  options = options || {};
  const zoneCount = Array.isArray(G.board) ? G.board.length : 3;
  const title = options.title || 'Choose a Zone';
  const subtitle = options.subtitle || 'Select the zone for this effect.';
  const zoneNames = options.zoneNames || ['Left Zone','Center Zone','Right Zone','Zone 4','Zone 5'];
  const body = document.getElementById('modal-body');
  document.getElementById('modal-title').textContent = title;
  body.innerHTML = `
    <p class="zone-picker-subtitle">${escapePlacementAnimHtml(subtitle)}</p>
    <div class="zone-picker-grid" style="--zone-count:${zoneCount};">
      ${Array.from({length:zoneCount}, function(_, z){
        const hasCards = G.board[z] && G.board[z].some(row=>row.some(Boolean));
        return `
          <button class="zone-picker-tile ${hasCards?'has-cards':''}" data-zone="${z}" type="button">
            <span class="zone-picker-num">Zone ${z+1}</span>
            <span class="zone-picker-name">${escapePlacementAnimHtml(zoneNames[z] || ('Zone '+(z+1)))}</span>
            <span class="zone-picker-count">${countCardsInZone(z)} card${countCardsInZone(z)===1?'':'s'}</span>
          </button>`;
      }).join('')}
    </div>`;
  body.querySelectorAll('.zone-picker-tile').forEach(tile=>{
    tile.onclick = function(){
      const zone = Number(tile.dataset.zone);
      closeModal();
      if(typeof playSfx==='function') playSfx('effect');
      callback(zone);
    };
  });
  document.getElementById('modal-acts').innerHTML = '<button class="btn sm" onclick="closeModal()">Cancel</button>';
  document.getElementById('modal').classList.add('on');
}

function countCardsInZone(z) {
  let count = 0;
  if(!G.board || !G.board[z]) return 0;
  G.board[z].forEach(row=>row.forEach(cell=>{ if(cell) count++; }));
  return count;
}

// Show affiliation change overlay: circular icon faintly flashing over a card
function showAffChangeOverlay(cardInstance, newAff) {
  if(cardInstance){
    cardInstance._affChanged = newAff;
    cardInstance._affChangedBy = cardInstance._affChangedBy || 'affiliation_effect';
  }
  if(rendererV2OwnsBoardScene()){
    let pos = null;
    if(typeof forEachBoardCard === 'function') forEachBoardCard((c, z, r, col)=>{
      if(!pos && c && cardInstance && c.iid === cardInstance.iid) pos = {z, r, c:col};
    });
    if(pos && window.FateV2CardMotionFx && typeof window.FateV2CardMotionFx.boardNotice === 'function'){
      const label = (typeof AFF_LABEL !== 'undefined' && AFF_LABEL[newAff]) ? AFF_LABEL[newAff] : String(newAff || 'AFF');
      const color = (typeof AFF_COLOR !== 'undefined' && AFF_COLOR[newAff]) ? AFF_COLOR[newAff] : '#ffe89a';
      window.FateV2CardMotionFx.boardNotice(cardInstance, pos.z, pos.r, pos.c, label, {color});
    }
    return;
  }
  // Find the card's cell element on the board
  let cellEl = null;
  forEachBoardCard((c, z, r, col)=>{
    if(c.iid===cardInstance.iid) {
      cellEl = document.querySelector(`#board .cell[data-z="${z}"][data-r="${r}"][data-c="${col}"]`);
    }
  });
  if(!cellEl) return;

  // Remove any existing overlays
  cellEl.querySelectorAll('.aff-change-overlay').forEach(e=>e.remove());

  const color = AFF_COLOR[newAff]||'#ccc';
  const svgMarkup = typeof getAffIcon==='function' ? getAffIcon(newAff) : '';

  // Flash overlay: use the stable inline SVG icon, not PNG assets that can flicker/half-render.
  const overlay = document.createElement('div');
  overlay.className = 'aff-change-overlay aff-' + String(newAff).replace(/[^a-z0-9_-]/gi,'');
  if(svgMarkup){
    const colored = svgMarkup.replace('<svg ', '<svg width="24" height="24" style="color:'+color+'" ');
    overlay.innerHTML = '<span class="aff-badge-fallback" style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;color:'+color+';">' + colored + '</span>';
  } else return;
  overlay.style.cssText = 'position:absolute;top:34px;right:5px;width:30px;height:30px;border-radius:999px;overflow:hidden;display:flex;align-items:center;justify-content:center;opacity:0;z-index:54;pointer-events:none;animation:affChangeFlashCorner 1.65s ease forwards;filter:drop-shadow(0 0 10px '+color+');background:linear-gradient(180deg,rgba(12,14,22,.96),rgba(2,3,7,.92));border:1.5px solid rgba(255,232,154,.78);';
  cellEl.style.position = 'relative';
  cellEl.appendChild(overlay);

  setTimeout(()=>{ if(overlay.parentNode) overlay.remove(); }, 2600);
}

// Inject CSS for affiliation change flash animation
(function(){
  const style = document.createElement('style');
  style.textContent = `
    @keyframes affChangeFlash {
      0% { opacity:0; transform:scale(0.5); }
      20% { opacity:0.7; transform:scale(1.12); }
      40% { opacity:0.3; transform:scale(1); }
      60% { opacity:0.65; transform:scale(1.06); }
      80% { opacity:0.25; transform:scale(1); }
      100% { opacity:0; transform:scale(0.9); }
    }
    @keyframes affChangeFlashCorner {
      0% { opacity:0; transform:scale(.55); }
      18% { opacity:.95; transform:scale(1.16); }
      48% { opacity:.62; transform:scale(1); }
      72% { opacity:.88; transform:scale(1.08); }
      100% { opacity:0; transform:scale(.94); }
    }
  `;
  document.head.appendChild(style);
})();

function activateLedgerCopiedSupporterEffect(player, ledgerZone, sourceSupporterInfo) {
  const sourceSupporter = sourceSupporterInfo?.card || sourceSupporterInfo;
  if(!sourceSupporter) return;
  let ledger = null, ledgerRow = -1, ledgerCol = -1;
  G.board[ledgerZone].forEach((row, r)=>row.forEach((cell, c)=>{
    if(cell && cell.id === '75' && cell.owner === player){
      ledger = cell;
      ledgerRow = r;
      ledgerCol = c;
    }
  }));
  if(!ledger || isFaceDownCard(ledger)) return;

  const previousPlayer = G.currentPlayer;
  const previousSuppressPrompt = !!G._suppressEffectPrompt;
  const originalId = ledger.id;
  const originalWhenSetActivated = ledger.whenSetActivated;

  G.currentPlayer = player;
  G._suppressEffectPrompt = true;
  try {
    ledger.id = sourceSupporter.id;
    ledger.whenSetActivated = false;
    runWhenSetEffect(ledger, ledgerZone, ledgerRow, ledgerCol);
  } finally {
    ledger.id = originalId;
    ledger.whenSetActivated = originalWhenSetActivated;
    G._suppressEffectPrompt = previousSuppressPrompt;
    G.currentPlayer = previousPlayer;
  }
}

function pickBoardSupporterEffect(player, z) {
  // Ledger-keepers: copy a supporter effect — visual card picker
  const fallbackWhenSetIds = ['02','05','14','16','17','18','22','25','26','27','31','32','33','37','42','43','50','51','52','58','60','62','68','69','71','72','73','76','80','91','94'];
  const whenSetIds = (typeof WHEN_SET_IDS !== 'undefined' && WHEN_SET_IDS && typeof WHEN_SET_IDS.has === 'function')
    ? WHEN_SET_IDS
    : new Set(fallbackWhenSetIds);
  const supporters=[];
  forEachBoardCard((card,bz,r,c)=>{
    const id = String(card && card.id || '');
    if((typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(card, card.owner) : card.type==='Supporter') && id !== '75' && whenSetIds.has(id) && !isFaceDownCard(card)) supporters.push({card,z:bz,r,c});
  });
  if(!supporters.length){toast('No supporters on field');return;}
  window._ledgerSups=supporters;window._ledgerZ=z;window._ledgerPlayer=player;
  const cards = supporters.map(s=>s.card);
  pickCardsVisual(cards, {
    title:'Ledger-keepers: Copy Effect',
    subtitle:'Choose a Supporter on the field to copy its effect',
    maxCount:1,
    showOpponentOverlay:false,
    confirmLabel:'Copy Effect'
  }, (chosen)=>{
    if(!chosen.length) return;
    const idx = cards.indexOf(chosen[0]);
    if(idx<0) return;
    activateLedgerCopiedSupporterEffect(player, z, supporters[idx]);
  });
}
window.ledgerCopy=function(i){
  const s=window._ledgerSups[i];
  closeModal();
  activateLedgerCopiedSupporterEffect(window._ledgerPlayer, window._ledgerZ, s);
};

function showMoveTarget(card, fromZ, fromR, fromC, targetZ, options={}) {
  const open=[];
  const disallowRows = Array.isArray(options.disallowRows) ? new Set(options.disallowRows) : new Set();
  const disallowExtraSafeRows = options.disallowExtraSafeRows !== false;
  G.board[targetZ].forEach((row,r)=>row.forEach((cell,c)=>{
    if(!cell&&!isBlocked(targetZ,r,c) && !disallowRows.has(r) && !(disallowExtraSafeRows && r >= 3)) open.push({r,c});
  }));
  if(!open.length){toast('No open cells in Zone '+(targetZ+1));return;}
  const openKey = new Set(open.map(p=>`${p.r}:${p.c}`));
  const zoneRows = (G.board[targetZ]||[]).length || 3;
  const gridCols = 'repeat(3,var(--move-target-cell-w,112px))';
  const moveGridCards = [];
  const viewerP = getPerspectivePlayerIndex();
  const rowLabels = [];
  for(let r=0;r<zoneRows;r++) rowLabels.push(getBoardTargetPickerRowLabel(r, viewerP));
  const body = `
    <div class="move-target-picker">
      <p class="move-target-prompt">${options.prompt || `Move ${card.name} to an open square in Zone ${targetZ+1}:`}</p>
      <div class="move-target-zone" style="--move-target-rows:${zoneRows};">
        <div class="move-target-row-labels">
          ${rowLabels.map(label=>`<div>${label}</div>`).join('')}
        </div>
        <div class="move-target-zone-grid" style="grid-template-columns:${gridCols};">
      ${Array.from({length: zoneRows * 3}, (_, idx)=>{
        const r = Math.floor(idx / 3);
        const c = idx % 3;
        const row = G.board[targetZ] && G.board[targetZ][r];
        if(!row || c >= row.length){
          return '<div class="move-target-cell is-missing"></div>';
        }
        const cell = row[c];
        if(cell){
          const visual = getCardVisualData(cell, getPerspectivePlayerIndex(), {boardPos:{z:targetZ,r,c}});
          const cardIdx = moveGridCards.push(cell) - 1;
          return `<button type="button" class="move-target-cell has-card" data-move-card-index="${cardIdx}" onclick="return false;" oncontextmenu="return showMoveGridCardInfo(event, ${cardIdx});">
            <span class="move-target-card">
              ${visual.img?`<img src="${visual.img}" alt="" decoding="async" loading="eager">`:`<span class="move-target-aff">${getAffIcon(visual.aff)}</span>`}
              <span class="move-target-fate${visual.isHidden ? ' is-hidden-fate' : ''}">${visual.displayFate}</span>
            </span>
          </button>`;
        }
        const key = `${r}:${c}`;
        if(!openKey.has(key)){
          return '<div class="move-target-cell is-closed"></div>';
        }
        const openIndex = open.findIndex(p=>p.r===r&&p.c===c);
        return `<button type="button" class="move-target-cell is-open" onclick="doMove(${openIndex})"><span>Open</span></button>`;
      }).join('')}
        </div>
      </div>
    </div>`;
  window._moveGridCards=moveGridCards;window._moveCard=card;window._moveFrom={z:fromZ,r:fromR,c:fromC};window._moveDests=open;window._moveTargetZ=targetZ;window._moveSourceCard=options.sourceCard||null;
  showModal(options.title || 'Move Card',body,[{label:'Cancel',action:closeModal}]);
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox) modalBox.classList.add('move-target-picker-modal');
}
window.showMoveGridCardInfo = function(ev, idx){
  if(ev){ ev.preventDefault(); ev.stopPropagation(); }
  const card = window._moveGridCards && window._moveGridCards[idx];
  if(card && typeof showCardInfoOverlay === 'function') showCardInfoOverlay(card);
  return false;
};
window.doMove=function(i){
  const dest=window._moveDests[i];const from=window._moveFrom;
  if(window._moveCard && (window._moveCard.id === '76' || window._moveCard.immuneFlag)){toast('this card is immune');closeModal();return;}
  if(window._moveCard.cantBeMoved){toast('This card cannot be moved');closeModal();return;}
  G.board[from.z][from.r][from.c]=null;
  G.board[window._moveTargetZ][dest.r][dest.c]=window._moveCard;
  if(typeof window.markMovementEffectFlash === 'function') window.markMovementEffectFlash(window._moveCard, 'movement:target-picker:' + String(window._moveCard.iid || window._moveCard.id) + ':' + String(G.turn || 0));
  if(typeof triggerRozsiPassive === 'function') triggerRozsiPassive(window._moveCard, window._moveTargetZ);
  if(window._moveSourceCard && typeof markInitialEffectResolved === 'function') markInitialEffectResolved(window._moveSourceCard);
  closeModal();toast('Card moved');renderBoardActionForPlayer(window._moveCard && typeof window._moveCard.owner === 'number' ? window._moveCard.owner : G.currentPlayer, {hand:false});
};

function highlightForBlock(z, sourceCard) {
  const anyZone = Number(z) === -1;
  toast(anyZone ? 'Click any valid empty square to lock it permanently' : 'Click any square in this zone to stop your opponent consolidating on or from it');
  G.placing=true;
  G.blockingCell=true;
  G._blockingEffectSourceIid = sourceCard && sourceCard.iid;
  window._blockZone=z;
  if(typeof clearPlaceHighlights === 'function') clearPlaceHighlights();
  const owner = sourceCard && typeof sourceCard.owner === 'number' ? sourceCard.owner : G.currentPlayer;
  const zStart = anyZone ? 0 : Number(z);
  const zEnd = anyZone ? 2 : Number(z);
  for(let zz=zStart;zz<=zEnd;zz++) {
    const totalRows = G.board[zz]?G.board[zz].length:3;
    for(let r=0;r<totalRows;r++) {
      const rowCap = typeof getBoardRowCapacity === 'function' ? getBoardRowCapacity(zz, r) : 3;
      for(let c=0;c<rowCap;c++){
        const open = !!(G.board[zz] && G.board[zz][r] && G.board[zz][r][c] === null);
        const anyBlock = G.blockedCells.some(b=>b.z===zz&&b.r===r&&b.c===c);
        const allowed = anyZone
          ? (open && !anyBlock && !(typeof isOwnSafeRowSquare === 'function' && isOwnSafeRowSquare(zz, r, c, owner)))
          : (!anyBlock && (typeof isZoeBlockTargetAllowed === 'function' ? isZoeBlockTargetAllowed(zz, r, c, owner) : true));
        if(allowed){
          const el=document.querySelector(`#board .cell[data-z="${zz}"][data-r="${r}"][data-c="${c}"]`);
          if(el) el.classList.add('placeable','block-target-choice', anyZone ? 'carolyn-block-choice' : 'zoe-block-choice');
        }
      }
    }
  }
  if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function') {
    window.FateMatchRendererAdapter.scheduleRender('block-square-selection-state');
    window.FateMatchRendererAdapter.scheduleRender('block-square-selection-hover');
  }
}

function highlightAllOpenCells() {
  clearPlaceHighlights();
  for(let z=0;z<3;z++){
    const totalRows = G.board[z]?G.board[z].length:3;
    for(let r=0;r<totalRows;r++) for(let c=0;c<(G.board[z][r] ? G.board[z][r].length : 3);c++){
      if(G.board[z][r]&&G.board[z][r][c]===null && !isBlocked(z,r,c)){
        const el=document.querySelector(`#board .cell[data-z="${z}"][data-r="${r}"][data-c="${c}"]`);
        if(el) el.classList.add('placeable');
      }
    }
  }
}

function renderHandPreview(player) {
  const hand=G.players[player].hand;
  if(!hand.length) return '<em>Empty hand</em>';
  return `<div style="font-size:.82rem">${hand.map(c=>`<div style="padding:.15rem 0;border-bottom:1px solid rgba(255,255,255,.06)">${c.name} (${c.type}, Fate:${typeof getPrintedFateLabel === 'function' ? getPrintedFateLabel(c) : (c.xFate ? 'X' : c.fate)})</div>`).join('')}</div>`;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  HELPERS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function forEachBoardCard(cb) {
  G.board.forEach((zone,z)=>zone.forEach((row,r)=>{
    if(!row) return;
    row.forEach((cell,c)=>{if(cell) cb(cell,z,r,c);});
  }));
}

function getAdjacentCards(z,r,c) {
  // Orthogonal adjacency only (up/down/left/right) — this is the default "adjacent"
  const adj=[];
  const maxRow = G.board[z]?G.board[z].length:3;
  [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc])=>{
    const nr=r+dr,nc=c+dc;
    const rowCapacity = getBoardRowCapacity(z, nr);
    if(nr>=0&&nr<maxRow&&nc>=0&&nc<rowCapacity&&G.board[z][nr]&&G.board[z][nr][nc]) adj.push({card:G.board[z][nr][nc],r:nr,c:nc,z});
  });
  return adj;
}

function getAdjacentAndDiagonalCards(z,r,c) {
  // All 8 surrounding cells — for cards that specify "adjacent or diagonal"
  const adj=[];
  const maxRow = G.board[z]?G.board[z].length:3;
  [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr,dc])=>{
    const nr=r+dr,nc=c+dc;
    const rowCapacity = getBoardRowCapacity(z, nr);
    if(nr>=0&&nr<maxRow&&nc>=0&&nc<rowCapacity&&G.board[z][nr]&&G.board[z][nr][nc]) adj.push({card:G.board[z][nr][nc],r:nr,c:nc,z});
  });
  return adj;
}

function getAffIcon(aff) {
  return ({
    third_great_war: `<svg viewBox="0 0 64 64" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="32" cy="32" r="22" stroke-width="3" opacity=".22"/>
        <path d="M32 13l4 8-4 4-4-4 4-8z" stroke-width="2.8"/>
        <path d="M32 25v21" stroke-width="4"/>
        <path d="M24 31h16" stroke-width="3.2"/>
        <path d="M28 46h8" stroke-width="3.2"/>
        <path d="M18 22l6 6M46 22l-6 6M18 42l6-6M46 42l-6-6" stroke-width="2.8" opacity=".85"/>
      </g>
    </svg>`,
    reality: `<svg viewBox="0 0 64 64" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="32" cy="32" r="12" stroke-width="3.2"/>
        <path d="M32 8v10M32 46v10M8 32h10M46 32h10M15 15l7 7M42 42l7 7M49 15l-7 7M22 42l-7 7" stroke-width="3"/>
      </g>
    </svg>`,
    expanded_worlds: `<svg viewBox="0 0 64 64" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" transform="translate(0,-1.5)">
        <path d="M32 8L56 52H8Z" stroke-width="3.6"/>
        <path d="M32 50L19.5 33H44.5Z" stroke-width="3"/>
        <circle cx="32" cy="39.5" r="4" stroke-width="2.2"/>
      </g>
    </svg>`,
    eventide: `<svg viewBox="0 0 64 64" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path d="M32 8l5 19 19 5-19 5-5 19-5-19-19-5 19-5z" stroke-width="3.2"/>
        <circle cx="32" cy="32" r="7" stroke-width="2.6"/>
      </g>
    </svg>`
  })[aff] || `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="14" fill="none" stroke="currentColor" stroke-width="3.2"/></svg>`;
}

function renderCardHTML(card, count) {
  const aff=AFF_COLOR[card.aff]||'#2a2a3a';
  const fateLabel = typeof getPrintedFateLabel === 'function' ? getPrintedFateLabel(card) : (card.xFate ? 'X' : card.fate);
  return `
    <div class="mc-bg" style="background:linear-gradient(160deg,${aff}dd,${aff}44)"></div>
    <div class="mc-top">
      <div class="mc-name">${card.name}</div>
      <div class="mc-fate">${fateLabel}</div>
    </div>
    <div class="mc-art">${card.img?`<img src="${card.img}" alt="" decoding="async" loading="eager" fetchpriority="auto" onerror="this.style.display='none'">`:''}</div>
    <div class="mc-bot">
      <div class="mc-type">${card.type}${card.cost>0?` (${card.xCost?'X':card.cost})`:''}</div>
      <div class="mc-eff">${card.effect}</div>
    </div>
    ${count>0?`<div class="mc-limit">x${count}</div>`:''}`;
}

function log(type, msg) {
  const maxLogEntries = 180;
  G.gameLog.push({type,msg,turn:G.turn});
  if(G.gameLog.length > maxLogEntries) G.gameLog.splice(0, G.gameLog.length - maxLogEntries);
  const panel=document.getElementById('log-panel');
  if(!panel) return;
  const turn = G.turn;
  setTimeout(function(){
    if(!panel.isConnected) return;
    const el=document.createElement('div');
    el.className='le '+type;
    el.textContent=`T${turn}: ${msg}`;
    panel.appendChild(el);
    while(panel.children.length > maxLogEntries) panel.removeChild(panel.firstElementChild);
    panel.scrollTop=panel.scrollHeight;
  }, 0);
}

function fatePlayNextToast() {
  if(window.__fateToastActive) return;
  const queue = window.__fateToastQueue || [];
  const next = queue.shift();
  if(!next) return;
  const el=document.getElementById('toast');
  if(!el) {
    window.__fateToastQueue = queue;
    return;
  }
  window.__fateToastActive = true;
  window.__fateToastQueue = queue;
  el.textContent=next.text;
  el.classList.toggle('toast-effect-alert', next.isEffectAlert);
  el.classList.add('on');
  clearTimeout(window._toast);
  window._toast=setTimeout(()=>{
    el.classList.remove('on');
    el.classList.remove('toast-effect-alert');
    window._toast=setTimeout(()=>{
      window.__fateToastActive = false;
      fatePlayNextToast();
    }, 180);
  }, next.holdMs);
}

function fateMaybePlayToastSfx(text, isEffectAlert) {
  const msg = String(text || '');
  const lower = msg.toLowerCase();
  if(isEffectAlert) {
    const cue = /\bsuppress/.test(lower) ? 'effectSuppressed' : 'effectNegated';
    if(typeof window.playFateSfxOnce === 'function') window.playFateSfxOnce(cue, 'toast-effect-alert', 260);
    else if(typeof playSfx === 'function') playSfx(cue);
    return;
  }
  const gameActive = typeof document !== 'undefined' && !!document.getElementById('s-game')?.classList.contains('active');
  if(!gameActive) return;
  const invalidLike = /\b(cannot|can't|can only|not enough|no valid|no open|must |choose .*highlighted|select .*first|cell is|already moved|already used|limit reached|drop on|invalid)\b/i.test(msg);
  if(!invalidLike) return;
  if(typeof window.playFateSfxOnce === 'function') window.playFateSfxOnce('invalidAction', 'toast-invalid-action', 190);
  else if(typeof playSfx === 'function') playSfx('invalidAction');
}

function toast(msg, durationMs) {
  if(G._aiAbort) return;
  const text = String(msg || '');
  const isEffectAlert = /\b(negated|negate|suppressed|suppress)\b/i.test(text);
  fateMaybePlayToastSfx(text, isEffectAlert);
  const effectAlertMs = 2000;
  const holdMs = Math.max(isEffectAlert ? effectAlertMs : 900, Number(durationMs) || (isEffectAlert ? effectAlertMs : 4500));
  try {
    const perf = window.__fatePerf = window.__fatePerf || {};
    perf.lastToast = {at:Math.round(performance.now ? performance.now() : Date.now()), text, isEffectAlert};
  } catch(e) {}
  const queue = window.__fateToastQueue = window.__fateToastQueue || [];
  queue.push({text, isEffectAlert, holdMs});
  while(queue.length > 12) queue.shift();
  fatePlayNextToast();
}

function toggleLog() {
  document.getElementById('log-panel').classList.toggle('on');
}


function normalizeActionBarLayout() {
  const bar = document.getElementById('actbar');
  if(!bar) return;
  const sig = Array.from(bar.children).map(function(child){
    return [child.id || '', child.tagName || '', child.className || '', (child.textContent || '').trim()].join(':');
  }).join('|');
  if(sig === _lastActionBarLayoutSignature) return;
  _lastActionBarLayoutSignature = sig;
  // Remove the legacy View Selected button wherever older cached HTML left it.
  Array.from(bar.querySelectorAll('button')).forEach(btn=>{
    const attr = (btn.getAttribute('onclick') || '').replace(/\s+/g,'');
    const label = (btn.textContent || '').trim().toLowerCase();
    if(attr === 'openCardDetail(null)' || label === 'view selected') btn.remove();
  });
  let actions = bar.querySelector('.act-actions');
  if(!actions){
    actions = document.createElement('div');
    actions.className = 'act-actions';
    actions.id = 'act-actions';
    bar.appendChild(actions);
  }
  Array.from(bar.children).forEach(child=>{
    if(child.id === 'act-hint' || child === actions) return;
    if(child.tagName === 'BUTTON' || child.classList.contains('btn')) actions.appendChild(child);
  });
  _lastActionBarLayoutSignature = Array.from(bar.children).map(function(child){
    return [child.id || '', child.tagName || '', child.className || '', (child.textContent || '').trim()].join(':');
  }).join('|');
}

function setHint(msg) {
  if(typeof cleanupActionBar === 'function') cleanupActionBar();
  const el = document.getElementById('act-hint');
  if(!el) return;
  el.textContent = msg;
  el.title = msg || '';
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  DISCARD HELPER (handles French Fusiliers return)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function discardBoardCard(card, z, r, c) {
  if(G._aiAbort) return;
  if(!card) return;
  // ALPINE Infantry cannot be discarded
  if(card.id==='76'){toast(card.name+' cannot be discarded');return;}
  if(discardBerkeleyHomelessWithHandCost(card, z, r, c)) return;
  // Try to play discard animation on the DOM element before removing
  const suppressDiscardVfx = !!card._suppressDiscardVfx;
  if(!suppressDiscardVfx && window.FateV2CardMotionFx && typeof window.FateV2CardMotionFx.flyBoardCard === 'function'){
    window.FateV2CardMotionFx.flyBoardCard(card, z, r, c, 'discard');
  }
  const rendererV2OwnsBoard = rendererV2OwnsBoardScene();
  if(!suppressDiscardVfx && !rendererV2OwnsBoard){
    const cellEl = document.querySelector(`#board .cell[data-z="${z}"][data-r="${r}"][data-c="${c}"] .bc`);
    if(cellEl){
      // Fly toward the opponent's discard pile (roughly offscreen for now)
      const isMine = isPerspectivePlayer(card.owner);
      cellEl.style.setProperty('--dx', (isMine?'-200px':'200px'));
      cellEl.style.setProperty('--dy', '250px');
      cellEl.classList.add('discarding');
    }
  }
  G.board[z][r][c] = null;
  if(suppressDiscardVfx) delete card._suppressDiscardVfx;
  playDiscardSfx();
  // Berkeley CS Major (50): zone lock (set/consolidate block) persists for its duration,
  // but effect activation suppression stops when Berkeley leaves the field.
  if(card.id==='50' && typeof G._artilleryLockTurnsLeft==='number' && G._artilleryLockTurnsLeft>0){
    G._artilleryEffectBlockLifted = true;
    toast('Berkeley CS Major left the field — effect suppression lifted, but zone lock remains.');
  }
  // Lydia (56): when removed from the field, unsuppress all cards she suppressed
  if(card.id==='56'){
    let unsuppressCount = 0;
    if(typeof forEachBoardCard === 'function') forEachBoardCard(function(bc){
      if(bc && bc._lydiaSuppressed){
        bc._lydiaSuppressed = false;
        unsuppressCount++;
      }
    });
    if(unsuppressCount > 0){
      toast('Lydia left the field — '+unsuppressCount+' Supporter aura(s) restored');
    }
  }
  // Mr. Secules (67): one-use reaction state lives on the card instance.
  if(card.id==='70' && !card.guerilla_transferred){
    const originalOwner = card.owner;
    const holder = 1 - originalOwner;
    card.guerilla_transferred = true;
    card.guerilla_turnsLeft = 5;
    card.guerilla_owner = originalOwner;
    if(typeof addCardToHand === 'function') addCardToHand(holder, card, { announce:false, animate:false, forceHandOwner:holder });
    else G.players[holder].hand.push(card);
    if(typeof showWineCountryGuerillaSentBanner === 'function') showWineCountryGuerillaSentBanner();
    else toast('Wine Country Guerilla was sent to opponent\'s hand.');
    log(originalOwner===0?'p1':'p2', 'Wine Country Guerilla moved to opponent hand from discard');
    if(typeof renderHand === 'function') renderHand();
  } else if(false && card.id==='37' && !card._returnUsed){
    card._returnUsed = true;
    G.players[card.owner].hand.push(card);
    toast(card.name+' returned to hand! Reinforcement is now 0.5.');
    log(card.owner===0?'p1':'p2', card.name+' returned to hand instead of discard');
    renderHand();
  } else if(card._stolenByRobo) {
    // Robo en la Noche stolen cards return to opponent's deck
    const origOwner = card._roboOrigOwner;
    card._stolenByRobo = false;
    G.players[origOwner].deck.push(card);
    shuffleDeck(origOwner);
    toast(`${card.name} returned to opponent's deck`);
  } else {
    fatePushDiscard(card.owner, card, {sound:false});
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  HOVER PREVIEW (for picker/search cards)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
let _hoverPreviewEl = null;
let _hoverPreviewSize = null;
let _hoverPreviewRaf = null;
let _hoverPreviewPoint = null;
let _hoverPreviewAnchorRect = null;
function showHoverPreview(card, e) {
  removeHoverPreview();
  try {
    const game = document.getElementById('s-game');
    const v2Owns = typeof rendererV2OwnsBoardScene === 'function' && rendererV2OwnsBoardScene();
    if(game && game.classList && game.classList.contains('active') && v2Owns) return;
  } catch(_e) {}
  const el = document.createElement('div');
  el.className = 'card-hover-preview';
  el.innerHTML = `
    <div class="chp-art">${card.img?`<img src="${card.img}" alt="${card.name}">`:`<span style="font-size:2.5rem;opacity:.3">${getAffIcon(card.aff)}</span>`}</div>
    <div class="chp-info">
      <div class="chp-name">${card.name}</div>
      <div class="chp-ability">${card.ability}</div>
      <div class="chp-pills">
        <span class="chp-pill">${card.type}${card.cost>0?` (${card.xCost?'X':card.cost})`:''}</span>
        <span class="chp-pill" style="border-color:var(--fate);color:var(--fate);">⭐ ${typeof getPrintedFateLabel === 'function' ? getPrintedFateLabel(card) : (card.xFate ? 'X' : card.fate)}</span>
        <span class="chp-pill">${AFF_LABEL[card.aff]||card.aff}</span>
      </div>
      <div class="chp-eff">${card.effect}</div>
    </div>`;
  document.body.appendChild(el);
  _hoverPreviewEl = el;
  _hoverPreviewSize = null;
  positionHoverPreview(e);
}
function positionHoverPreview(e) {
  if(!_hoverPreviewEl) return;
  _hoverPreviewPoint = { x:e.clientX, y:e.clientY };
  const anchorEl = e && e.target && e.target.closest ? e.target.closest('.bc,.opp-card-back,.deck-slot,.discard-slot,.preset-browse-tile') : null;
  const currentEl = e && e.currentTarget && e.currentTarget.getBoundingClientRect ? e.currentTarget : null;
  const rectEl = anchorEl || currentEl;
  _hoverPreviewAnchorRect = rectEl && rectEl.getBoundingClientRect ? rectEl.getBoundingClientRect() : null;
  if(_hoverPreviewRaf) return;
  _hoverPreviewRaf = requestAnimationFrame(()=>{
    _hoverPreviewRaf = null;
    if(!_hoverPreviewEl || !_hoverPreviewPoint) return;
    if(!_hoverPreviewSize){
      const rect = _hoverPreviewEl.getBoundingClientRect();
      _hoverPreviewSize = { w:rect.width || 280, h:rect.height || 360 };
    }
    const p = _hoverPreviewPoint;
    const w = _hoverPreviewSize.w, h = _hoverPreviewSize.h;
    const anchor = _hoverPreviewAnchorRect;
    let x = anchor ? anchor.left - w - 34 : p.x - w - 96, y = p.y - 20;
    if(x < 10) x = p.x + 16;
    if(x + w > window.innerWidth - 10) x = window.innerWidth - w - 10;
    if(y + h > window.innerHeight - 10) y = window.innerHeight - h - 10;
    if(y < 10) y = 10;
    _hoverPreviewEl.style.transform = `translate3d(${Math.round(x)}px,${Math.round(y)}px,0)`;
  });
}
function removeHoverPreview() {
  if(_hoverPreviewRaf) { cancelAnimationFrame(_hoverPreviewRaf); _hoverPreviewRaf = null; }
  if(_hoverPreviewEl) { _hoverPreviewEl.remove(); _hoverPreviewEl = null; }
  _hoverPreviewSize = null;
  _hoverPreviewPoint = null;
  _hoverPreviewAnchorRect = null;
}

// ── CARD INFO OVERLAY (shows card detail on top of an open modal) ──
function showCardInfoOverlay(card) {
  if(!card) return;
  if(typeof openInteractiveCardDetailFromPicker === 'function' && openInteractiveCardDetailFromPicker(card, null)) return;
  dismissCardInfoOverlay();
  var visual = getCardVisualData(card, typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : 0);
  var useCanvasArt = !!(visual.img && typeof window.renderCanvasImage === 'function' && window.HTMLCanvasElement);
  var cardArt = visual.img
    ? (useCanvasArt ? '<canvas class="cd-img-canvas" aria-hidden="true"></canvas>' : '<img src="'+visual.img+'" alt="'+escapeHtml(visual.name)+'" decoding="async" loading="eager" fetchpriority="high">')
    : '<span class="cd-fallback">'+getAffIcon(visual.aff)+'</span>';
  var voiceButton = (visual.type !== 'Supporter')
    ? '<button type="button" class="card-voice-btn" title="Play voiceline" onclick="event.stopPropagation(); if(typeof playCardSound===\'function\') playCardSound(\''+escapeHtml(card.id)+'\');">&#9835;</button>'
    : '';
  var loreButton = (typeof window.hasCardLorePage === 'function' && window.hasCardLorePage(card))
    ? '<button type="button" class="btn sm cio-lore">Lore</button>'
    : '';
  var affLabel = (typeof AFF_LABEL !== 'undefined' && AFF_LABEL[visual.aff]) ? AFF_LABEL[visual.aff] : visual.aff;
  var copiedPassiveName = (String(card.id || '') === '37') ? (card._copiedPassiveName || card.copiedPassiveName || '') : '';
  var copiedPassiveEffect = (String(card.id || '') === '37') ? (card._copiedPassiveEffect || card.copiedPassiveEffect || '') : '';
  var copiedPassiveBanner = buildFrenchFusiliersCopyBannerHTML(copiedPassiveName, copiedPassiveEffect);
  var overlay = document.createElement('div');
  overlay.className = 'card-info-overlay';
  overlay.innerHTML =
    '<div class="card-info-overlay-backdrop"></div>'+
    '<div class="cio-modal">'+
      '<div class="cio-title"><span>'+escapeHtml(visual.name)+'</span></div>'+
      '<div class="cd-wrap">'+
        '<div class="cd-img">'+cardArt+'</div>'+
        '<div class="cd-info">'+
          '<div class="cd-name cd-name-with-audio"><span>'+visual.name+'</span>'+voiceButton+'</div>'+
          '<div class="cd-ability">'+visual.ability+'</div>'+
          '<div class="cd-pills">'+
            '<span class="pill type">'+visual.type+(visual.cost>0?' ('+(visual.xCost?'X':visual.cost)+')':'')+'</span>'+
            '<span class="pill fate">'+visual.fate+' Fate</span>'+
            '<span class="pill">'+affLabel+'</span>'+
          '</div>'+
          copiedPassiveBanner+
          '<div class="cd-eff">'+visual.effect+'</div>'+
          (card.flavor ? '<div class="cd-flavor">'+card.flavor+'</div>' : '')+
        '</div>'+
      '</div>'+
      '<div class="cio-acts">'+loreButton+'<button type="button" class="btn sm cio-close">Close</button></div>'+
    '</div>';
  overlay.querySelector('.card-info-overlay-backdrop').onclick = dismissCardInfoOverlay;
  overlay.querySelectorAll('.cio-close').forEach(function(btn){ btn.onclick = dismissCardInfoOverlay; });
  overlay.querySelectorAll('.cio-lore').forEach(function(btn){
    btn.onclick = function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      if(typeof window.openCardLoreFromInfo === 'function') window.openCardLoreFromInfo(card);
    };
  });
  overlay.querySelector('.cio-modal').onclick = function(ev){ ev.stopPropagation(); };
  document.body.appendChild(overlay);
  if(useCanvasArt) {
    var canvas = overlay.querySelector('.cd-img-canvas');
    if(canvas) requestAnimationFrame(function(){ window.renderCanvasImage(canvas, visual.img, {mode:'contain', parent:canvas.parentElement, background:'#080910'}); });
  }
  requestAnimationFrame(function(){ overlay.classList.add('on'); });
}
function dismissCardInfoOverlay() {
  var el = document.querySelector('.card-info-overlay');
  if(el) el.remove();
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  EFFECT ACTIVATION FLASH
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function showFinalZoneReveal(zResults, opts) {
  opts = opts || {};
  const zones = Array.isArray(zResults) ? zResults : [];
  const revealStepMs = 900;
  const renderV2Reveal = typeof rendererV2OwnsBoardScene === 'function' && rendererV2OwnsBoardScene();
  if(G && Array.isArray(G._finalZoneRevealTimers)){
    G._finalZoneRevealTimers.forEach(function(timer){ clearTimeout(timer); });
  }
  if(G) {
    G._finalZoneRevealTimers = [];
    G._finalZoneCanvasFlash = null;
  }
  if(!renderV2Reveal) {
    document.querySelectorAll('#board .zone.final-zone-board-flash').forEach(function(el){
      el.classList.remove('final-zone-board-flash','final-zone-board-p1','final-zone-board-p2','final-zone-board-tie');
      el.style.removeProperty('--final-zone-delay');
      el.removeAttribute('data-final-zone-label');
      el.removeAttribute('data-final-zone-score');
    });
  }
  zones.forEach(function(zr, i){
    const z = Number(zr.z);
    const ctrl = Number.isInteger(zr.ctrl) ? zr.ctrl : -1;
    const zoneEl = renderV2Reveal ? null : document.querySelector('#board .zone[data-zone="'+z+'"]');
    const label = ctrl === 0 ? (G.players?.[0]?.name || 'Player 1') : ctrl === 1 ? (G.players?.[1]?.name || 'Player 2') : 'Tied';
    if(zoneEl) {
      zoneEl.style.setProperty('--final-zone-delay', '0ms');
      zoneEl.dataset.finalZoneLabel = ctrl >= 0 ? (label + ' controls') : 'Zone tied';
      zoneEl.dataset.finalZoneScore = String(zr.s0 || 0) + ' - ' + String(zr.s1 || 0);
    }
    const addTimer = setTimeout(function(){
      if(zoneEl) {
        zoneEl.classList.remove('final-zone-board-flash','final-zone-board-p1','final-zone-board-p2','final-zone-board-tie');
        void zoneEl.offsetWidth;
        zoneEl.classList.add('final-zone-board-flash', ctrl === 0 ? 'final-zone-board-p1' : ctrl === 1 ? 'final-zone-board-p2' : 'final-zone-board-tie');
      }
      if(G) {
        G._finalZoneCanvasFlash = {
          z:z,
          ctrl:ctrl,
          s0:zr.s0 || 0,
          s1:zr.s1 || 0,
          start:(typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()),
          duration:1260
        };
      }
      if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function') {
        window.FateMatchRendererAdapter.scheduleRender('final-zone-flash');
      }
      if(typeof playSfx === 'function') playSfx('hover');
    }, i * revealStepMs);
    const removeTimer = setTimeout(function(){
      if(zoneEl) zoneEl.classList.remove('final-zone-board-flash','final-zone-board-p1','final-zone-board-p2','final-zone-board-tie');
      if(G && G._finalZoneCanvasFlash && Number(G._finalZoneCanvasFlash.z) === z) G._finalZoneCanvasFlash = null;
      if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function') {
        window.FateMatchRendererAdapter.scheduleRender('final-zone-flash');
      }
    }, i * revealStepMs + 1260);
    if(G && Array.isArray(G._finalZoneRevealTimers)) G._finalZoneRevealTimers.push(addTimer, removeTimer);
  });
  const doneTimer = setTimeout(function(){
    if(!renderV2Reveal) {
      document.querySelectorAll('#board .zone.final-zone-board-flash').forEach(function(el){
        el.classList.remove('final-zone-board-flash','final-zone-board-p1','final-zone-board-p2','final-zone-board-tie');
        el.style.removeProperty('--final-zone-delay');
        el.removeAttribute('data-final-zone-label');
        el.removeAttribute('data-final-zone-score');
      });
    }
    if(G) {
      G._finalZoneRevealTimers = [];
      G._finalZoneCanvasFlash = null;
    }
    if(typeof opts.onComplete === 'function') opts.onComplete();
  }, Math.max(2200, zones.length * revealStepMs + 900));
  if(G && Array.isArray(G._finalZoneRevealTimers)) G._finalZoneRevealTimers.push(doneTimer);
}

function showBlockedAnimation(msg) {
  if(G._aiAbort) return;
  playSfx('zoneBlock');
  const text = String(msg || 'BLOCKED').replace(/^\s*!\s*/, '').replace(/\s*!+\s*$/, '');
  try {
    const perf = window.__fatePerf = window.__fatePerf || {};
    perf.lastBlockedAnimation = {at:Math.round(performance.now ? performance.now() : Date.now()), text};
  } catch(e) {}
  if(rendererV2OwnsBoardScene()){
    if(typeof toast === 'function') toast(text + '!', 2000);
    return;
  }
  const flash = document.createElement('div');
  flash.className = 'effect-blocked-flash';
  flash.innerHTML = `<div class="ebf-inner">${escapeHtml(text)}!</div>`;
  document.body.appendChild(flash);
  setTimeout(()=>flash.remove(), 1550);
}

function showEffectNegatedBanner(msg) {
  if(G._aiAbort) return;
  const text = String(msg || 'EFFECT NEGATED').replace(/^\s*!\s*/, '').replace(/\s*!+\s*$/, '') || 'EFFECT NEGATED';
  try {
    const existing = document.querySelector('.effect-blocked-flash.effect-negated-banner');
    if(existing) return;
  } catch(e) {}
  try {
    const perf = window.__fatePerf = window.__fatePerf || {};
    perf.lastEffectNegatedBanner = {at:Math.round(performance.now ? performance.now() : Date.now()), text};
  } catch(e) {}
  const flash = document.createElement('div');
  flash.className = 'effect-blocked-flash effect-negated-banner';
  flash.innerHTML = `<div class="ebf-inner">${escapeHtml(text)}!</div>`;
  document.body.appendChild(flash);
  setTimeout(()=>flash.remove(), 1550);
}

function showEffectFlash(card) {
  return;
}

// Consolidation visual — golden energy swirl on the target cell
function showConsolidateVisual(z,r,c) {
  if(G._aiAbort) return;
  if(rendererV2OwnsBoardScene()){
    return;
  }
  const cellEl = document.querySelector(`#board .cell[data-z="${z}"][data-r="${r}"][data-c="${c}"]`);
  if(!cellEl) return;
  const fx = document.createElement('div');
  fx.style.cssText='position:absolute;inset:-4px;z-index:20;pointer-events:none;border-radius:6px;'+
    'background:radial-gradient(circle,rgba(201,168,76,.45),rgba(201,168,76,0) 70%);'+
    'animation:consolidate-burst .9s ease-out forwards;';
  cellEl.appendChild(fx);
  setTimeout(()=>fx.remove(),950);
}


function showMariaDiscardBadge(targetCard, count, z, r, c) {
  if(typeof document === 'undefined') return;
  const safeCount = Math.max(0, Number(count) || 0);
  const cardName = targetCard && targetCard.name ? targetCard.name : 'card';
  if(rendererV2OwnsBoardScene()){
    if(window.FateV2CardMotionFx && typeof window.FateV2CardMotionFx.boardNotice === 'function'){
      window.FateV2CardMotionFx.boardNotice(targetCard, z, r, c, 'x' + safeCount + ' discarded', {color:'#ffe89a'});
    }
    if(typeof playDiscardSfx === 'function') playDiscardSfx();
    return;
  }
  let host = null;
  const cellEl = (z != null && r != null && c != null)
    ? document.querySelector('#board .cell[data-z="'+z+'"][data-r="'+r+'"][data-c="'+c+'"]')
    : null;
  const badge = document.createElement('div');
  badge.className = 'maria-discard-badge';
  badge.innerHTML = '<div class="mdb-count">×'+safeCount+'</div><div class="mdb-label">'+escapeHtml(cardName)+' discarded</div>';
  if(cellEl){
    const rect = cellEl.getBoundingClientRect();
    badge.style.left = (rect.left + rect.width / 2) + 'px';
    badge.style.top = Math.max(72, rect.top - 10) + 'px';
    badge.classList.add('anchored');
  } else {
    badge.style.left = '50%';
    badge.style.top = '26%';
  }
  document.body.appendChild(badge);
  if(typeof playDiscardSfx === 'function') playDiscardSfx();
  setTimeout(function(){ badge.classList.add('out'); }, 1650);
  setTimeout(function(){ if(badge.parentNode) badge.remove(); }, 2150);
}


const CINEMATIC_VOICELINES = Object.freeze({
  "1": "Duty to one's country first",
  "2": "To the ends of the world",
  "3": "This reminds me of that one time we played the card game",
  "4": "You\u2019re very concerning",
  "6": "In Caribbea, the sun never sets",
  "7": "Hey look over there, your divisions are encircled",
  "8": "I got fired from my job over Chinese lesbians",
  "10": "Eternity draws ever closer to nothingness",
  "11": "Agree to these terms, or you might find an exploding pineapple on your doorstep one day",
  "12": "A robbery in the night...we must rescue the birds",
  "13": "The commonwealth will unite against this threat",
  "14": "you look exactly like the last 97 men I decapitated!",
  "15": "The sword of King Stephen I will fall upon you!",
  "17": "Ummmm....Lydia...I may have accidentally gave sentience to this chocolate chip cookie from croads.",
  "19": "Czechoslovakia, a lovers quarrel in a nation",
  "21": "All that is solid melts into air, all that is holy is profaned",
  "22": "Yeah, science is pretty dang cool",
  "23": "Riiiight",
  "27": "I wonder what happened in the old age...",
  "29": "Liberty, equality, and the pursuit of happiness",
  "30": "Cowards sink",
  "34": "I have a legacy, a country, to protect",
  "35": "The armies of Greece welcome you with open arms!",
  "36": "France will not fall this day",
  "38": "Hahahahahahahaaaaaa",
  "39": "Show no mercy to the tyrants!",
  "41": "I'm lagging, I'm lagging bro!",
  "43": "Anyone wanna fill me in on who this Hitler guy was",
  "45": "There is no more frontier, nowhere I can run",
  "46": "Which is more evil, the banker, or the money?",
  "48": "Before me, reality bows, darkness flees",
  "51": "Everything I do is to protect the one I love",
  "55": "Ahaha...every swing of my blade leaves a chasm in the cosmic fabric",
  "56": "Your godlike powers, versus my rusty sword and undeeeniable face card",
  "57": "We have things in these mountains you'd never dream of",
  "40": "I know it sucks watching me dismemeber, decapitate, and disembowel your mother like that, but for Christ's sake, she was a zombie!",
  "61": "There's no point trying to run. I'll just put a bullet through your skull.",
  "66": "Look at Curry man, so inspirational",
  "67": "You just said nothing",
  "77": "My heart no longer sings...I've walked a thousand lives of men",
  "81": "Eat some pierogi, and you'll never feel sad again.",
  "82": "Meet my friend, the snowman.",
  "83": "We stand alone against the imperialism of the European Union",
  "84": "What a pretty flower!",
  "85": "The night, the dark...its so cold",
  "86": "You really underestimate my willingness to overestimate!",
  "87": "Ready to be serenaded?",
  "88": "The next time Zsofia even thinks about touching my waffles, im stabbing her!",
  "89": "Daaaad! Rozsi is annoying me again!",
  "90": "Fishing - it is what all men secretly desire!",
  "99": "He's the one that started it first!\nWell Zsofia shouldn't have been putting her feet on my sword!",
  "100": "Step aside! The Winter queen, Felicyta Janowicz, has arrived"
});

function getCinematicVoiceline(card) {
  if(!card) return '';
  const rawId = card.id != null ? String(card.id).trim() : '';
  const imgId = card.img ? String(card.img).split('/').pop().replace(/\.[^.]+$/, '') : '';
  const candidates = [rawId, rawId.replace(/^0+/, ''), imgId, imgId.replace(/^0+/, '')]
    .map(function(v){ return String(v || '').trim(); })
    .filter(Boolean);
  for(const id of candidates){
    if(CINEMATIC_VOICELINES[id]) return CINEMATIC_VOICELINES[id];
    const digits = id.match(/\d+/);
    if(digits){
      const numericId = String(parseInt(digits[0], 10));
      if(CINEMATIC_VOICELINES[numericId]) return CINEMATIC_VOICELINES[numericId];
    }
  }
  return '';
}

function showCinematicSubtitle(cardOrLine, durationMs, rarity, fadeLeadMs) {
  if(typeof cardOrLine !== 'string' && cardOrLine && (cardOrLine.faceDown || cardOrLine._suppressCinematicSubtitle || (typeof isFaceDownCard === 'function' && isFaceDownCard(cardOrLine)))) return null;
  const line = typeof cardOrLine === 'string' ? cardOrLine : getCinematicVoiceline(cardOrLine);
  if(!line) return null;
  if(document.body && document.body.classList.contains('modal-open')) return null;
  document.querySelectorAll('.cinematic-subtitle-live').forEach(function(el){ el.remove(); });
  const el = document.createElement('div');
  el.className = 'cinematic-subtitle-live rarity-' + String(rarity || (cardOrLine && cardOrLine.rarity) || 'circle').toLowerCase();
  el.setAttribute('aria-live', 'polite');
  const hasManualLineBreak = /\r?\n/.test(line);
  el.textContent = '“' + line + '”';
  if(hasManualLineBreak) el.classList.add('multi-line', 'dialogue-linebreak');
  // Inline visibility is intentional: older patches hide cinematic text elements.
  el.style.cssText = 'display:block!important;visibility:visible!important;position:fixed!important;left:50%!important;bottom:27vh!important;transform:translateX(-50%)!important;z-index:2147483000!important;width:min(84vw,960px)!important;max-width:960px!important;text-align:center!important;pointer-events:none!important;opacity:1!important;font-size:clamp(1.2rem,2.15vw,1.75rem)!important;white-space:pre-line!important;';
  document.body.appendChild(el);
  try {
    const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
    const lineHeight = style ? (parseFloat(style.lineHeight) || (parseFloat(style.fontSize) * 1.18)) : 0;
    const h = el.getBoundingClientRect ? el.getBoundingClientRect().height : 0;
    if(lineHeight > 0 && h > lineHeight * 1.45) {
      el.classList.add('multi-line');
      el.style.setProperty('bottom', 'calc(24vh - 25px)', 'important');
    }
  } catch(e) {}
  const ttl = Math.max(800, Number(durationMs) || 2100);
  const fadeLead = Math.max(120, Number(fadeLeadMs) || 470);
  setTimeout(function(){ el.classList.add('fade-out'); }, Math.max(300, ttl - fadeLead));
  setTimeout(function(){ if(el.parentNode) el.remove(); }, ttl + 100);
  return el;
}

function _hexToRgb(hex) {
  hex = hex.replace('#','');
  if(hex.length===3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  var n = parseInt(hex,16);
  return ((n>>16)&255)+','+((n>>8)&255)+','+(n&255);
}

function getConsolidationCinematicTiming(perfLite) {
  if(perfLite) {
    return {
      subtitleDelay:80,
      overlayFadeAt:2520,
      overlayRemoveAt:2920,
      safetyAt:3360,
      lockMs:3000,
      fadeMs:400
    };
  }
  return {
    subtitleDelay:140,
    overlayFadeAt:2740,
    overlayRemoveAt:3180,
    safetyAt:3620,
    lockMs:3260,
    fadeMs:440
  };
}

function isConsolidationCinematicPerfLite() {
  var enhancedFx = typeof isEnhancedVisualFxEnabled === 'function' && isEnhancedVisualFxEnabled();
  return !!document.documentElement.classList.contains('fate-performance-plus-mode') && !enhancedFx;
}

function getConsolidationCinematicTotalMs(options) {
  var opts = options || {};
  var perfLite = Object.prototype.hasOwnProperty.call(opts, 'perfLite') ? !!opts.perfLite : isConsolidationCinematicPerfLite();
  return getConsolidationCinematicTiming(perfLite).lockMs;
}

if(typeof window !== 'undefined') {
  window.getConsolidationCinematicTotalMs = getConsolidationCinematicTotalMs;
}

let _consolidationCinematicQueue = [];
let _consolidationCinematicShowing = false;
let _lastConsolidationCinematicEndedAt = 0;
const _characterSetCinematicKeys = new Set();
if(typeof window !== 'undefined' && !window.__fateLegacyConsolidationQueueCleanupInstalled) {
  const previousConsolidationQueueCleanup = window.clearConsolidationCinematicQueues;
  window.clearConsolidationCinematicQueues = function(){
    if(typeof previousConsolidationQueueCleanup === 'function') previousConsolidationQueueCleanup();
    _consolidationCinematicQueue.length = 0;
    _consolidationCinematicShowing = false;
    _characterSetCinematicKeys.clear();
  };
  window.__fateLegacyConsolidationQueueCleanupInstalled = true;
}
function showConsolidationCinematic(card, opts) {
  if(typeof G !== 'undefined' && G && G._aiAbort && !document.getElementById('s-game')?.classList.contains('active')) return false;
  if(!card) return false;
  opts = opts || {};
  if(rendererV2OwnsBoardScene() && opts.allowRenderV2Cinematic !== true){
    try {
      if(window.FateActionPresentation && typeof window.FateActionPresentation.noteRendererEvent === 'function') {
        window.FateActionPresentation.noteRendererEvent('legacy-dom-motion-blocked', {
          source:'showConsolidationCinematic',
          iid:card && card.iid,
          card:card && card.name
        });
      }
    } catch(e) {}
    return false;
  }
  var activeOverlay = document.querySelector('.cc-overlay-v2');
  if(activeOverlay || _consolidationCinematicShowing){
    _consolidationCinematicQueue.push({card: card, opts: Object.assign({}, opts)});
    return true;
  }
  _consolidationCinematicShowing = true;
  var catalogCard = (typeof CARDS !== 'undefined' && Array.isArray(CARDS))
    ? CARDS.find(function(item){ return item && String(item.id || '') === String(card.id || ''); })
    : null;
  var rarity = String(card.rarity || (catalogCard && catalogCard.rarity) || 'circle').toLowerCase();
  var colorMap = { star:'#fff05a', square:'#d67fff', triangle:'#5ee37a', circle:'#f7f3e8' };
  var color = colorMap[rarity] || colorMap.circle;
  var cinematicImage = card.img || (catalogCard && catalogCard.img) || (card.id ? String(card.id) + '.png' : '');
  var imgSrc = cinematicImage ? (typeof getRuntimeCardImageSrc === 'function' ? getRuntimeCardImageSrc(cinematicImage, 'board') : cinematicImage) : '';
  var subtitle = getCinematicVoiceline(card);

  // Sigil shape: each rarity gets a unique outline —
  //   circle: circle outline (border-radius 50%)
  //   star:   5-pointed star outline via SVG
  //   square: rounded-square outline (border-radius 30px)
  //   triangle: triangle outline via SVG
  var useStarSvg = (rarity==='star');
  var useTriangleSvg = (rarity==='triangle');
  var sigilRadius = (rarity==='circle') ? '50%' : '30px';
  var enhancedFx = typeof isEnhancedVisualFxEnabled === 'function' && isEnhancedVisualFxEnabled();
  var perfLite = isConsolidationCinematicPerfLite();
  var timing = getConsolidationCinematicTiming(perfLite);

  var overlay = document.createElement('div');
  overlay.className = 'cc-overlay-v2' + (perfLite ? ' perf-lite' : '') + (enhancedFx ? ' fx-cinematic-v3 rarity-' + rarity : '');
  var rgbStr = _hexToRgb(color);
  overlay.setAttribute('style',
    'position:fixed;inset:0;z-index:13000;pointer-events:none;display:flex !important;' +
    'align-items:center;justify-content:center;opacity:0;visibility:visible !important;' +
    'transition:opacity '+(perfLite ? '.08s' : '.12s')+' ease-out;contain:layout style paint;' +
    'background:'+(perfLite ? 'rgba(0,0,0,.62)' : 'radial-gradient(circle at 50% 50%,rgba('+rgbStr+',.09),rgba(0,0,0,.7) 54%,rgba(0,0,0,.88))')+';'
  );

  var sigil = document.createElement('div');
  sigil.className = 'cc-sigil-v2 rarity-' + rarity;
  if(useStarSvg){
    // 5-pointed star outline centered
    sigil.innerHTML = '<svg viewBox="0 0 200 190" style="width:100%;height:100%;overflow:visible;filter:drop-shadow(0 0 10px rgba(255,230,70,.42));" xmlns="http://www.w3.org/2000/svg"><polygon points="100,5 123,68 190,68 135,110 155,175 100,138 45,175 65,110 10,68 77,68" fill="none" stroke="'+color+'" stroke-width="3" stroke-linejoin="round"/></svg>';
    sigil.setAttribute('style',
      'position:absolute;left:50%;top:50%;width:min(74vmin,720px);height:min(71vmin,690px);' +
      'transform:translate(-50%,-50%) scale(.3) rotate(-18deg);opacity:0;' +
      'transition:transform 1.55s cubic-bezier(.16,.86,.2,1),opacity 1.35s ease-out;pointer-events:none;will-change:transform,opacity;'
    );
  } else if(useTriangleSvg){
    // Triangle outline — square viewBox with centroid at exact center for proper alignment
    sigil.innerHTML = '<svg viewBox="0 0 200 200" style="width:100%;height:100%;overflow:visible;" xmlns="http://www.w3.org/2000/svg"><polygon points="100,0 187,150 13,150" fill="none" stroke="'+color+'" stroke-width="2" stroke-linejoin="round"/></svg>';
    sigil.setAttribute('style',
      'position:absolute;left:50%;top:50%;width:min(82vmin,780px);height:min(82vmin,780px);' +
      'transform:translate(-50%,-50%) scale(.3) rotate(-15deg);opacity:0;' +
      'transition:transform 1.55s cubic-bezier(.16,.86,.2,1),opacity 1.35s ease-out;pointer-events:none;will-change:transform,opacity;'
    );
  } else {
    var sigilSize = (rarity==='square') ? 'min(58vmin,540px)' : 'min(79vmin,760px)';
    sigil.setAttribute('style',
      'position:absolute;left:50%;top:50%;width:'+sigilSize+';height:'+sigilSize+';' +
      'transform:translate(-50%,-50%) scale(.3) rotate(-20deg);opacity:0;' +
      'border:'+(rarity==='square'?'6px':'3px')+' solid '+color+';border-radius:'+sigilRadius+';' +
      'transition:transform 1.55s cubic-bezier(.16,.86,.2,1),opacity 1.35s ease-out;pointer-events:none;will-change:transform,opacity;'
    );
  }
  overlay.appendChild(sigil);
  if(perfLite) sigil.style.display = 'none';

  var cardWrap = document.createElement('div');
  cardWrap.className = 'cc-card-wrap-v2' + (enhancedFx ? ' fx-cine-card-wrap' : '');
  cardWrap.setAttribute('style',
    'position:relative;z-index:2;width:min(74vw,800px);height:min(94vh,980px);' +
    'display:flex;align-items:center;justify-content:center;' +
    'transform:'+(perfLite ? 'translateY(18px) scale(.94)' : 'translateY(70px) scale(.45)')+';opacity:0;' +
    'transition:transform '+(perfLite ? '.28s ease-out' : '.72s cubic-bezier(.16,.88,.2,1)')+',opacity '+(perfLite ? '.14s' : '.28s')+' ease-out;will-change:transform,opacity;'
  );
  if(imgSrc){
    var imgEl = document.createElement('img');
    imgEl.src = imgSrc;
    imgEl.alt = card.name || (catalogCard && catalogCard.name) || 'Consolidated card';
    imgEl.setAttribute('style','max-width:100%!important;max-height:100%!important;object-fit:contain!important;display:block!important;visibility:visible!important;opacity:1!important;border-radius:10px;');
    imgEl.onerror = function(){
      if(cinematicImage && imgEl.src.indexOf(cinematicImage) === -1){
        imgEl.onerror = function(){ imgEl.style.display='none'; };
        imgEl.src = cinematicImage;
      } else { imgEl.style.display='none'; }
    };
    cardWrap.appendChild(imgEl);
  } else {
    var fb = document.createElement('div');
    fb.setAttribute('style','font-size:6rem;color:'+color+';');
    fb.textContent = typeof getAffIcon === 'function' ? getAffIcon(card.aff) : '*';
    cardWrap.appendChild(fb);
  }
  overlay.appendChild(cardWrap);
  document.body.appendChild(overlay);

  // Trigger the entrance transitions — use both rAF and setTimeout for maximum reliability.
  // The rAF throttle bug (now removed) previously starved these callbacks and prevented
  // the cinematic from ever becoming visible. The setTimeout fallback ensures it always fires.
  var _entranceTriggered = false;
  function triggerEntrance(){
    if(_entranceTriggered) return;
    _entranceTriggered = true;
    overlay.style.setProperty('display', 'flex', 'important');
    overlay.style.setProperty('visibility', 'visible', 'important');
    overlay.style.setProperty('opacity', '1', 'important');
    if(!perfLite){
      sigil.style.transform = 'translate(-50%,-50%) scale(' + (rarity === 'square' ? '1' : '1.15') + ') rotate(25deg)';
      sigil.style.opacity = rarity === 'star' ? '.48' : '.28';
    }
    cardWrap.style.setProperty('display', 'flex', 'important');
    cardWrap.style.setProperty('visibility', 'visible', 'important');
    cardWrap.style.setProperty('transform', 'translateY(0) scale(1)', 'important');
    cardWrap.style.setProperty('opacity', '1', 'important');
  }
  requestAnimationFrame(function(){ requestAnimationFrame(triggerEntrance); });
  setTimeout(triggerEntrance, 40); // Fallback: guaranteed to fire even if rAF is starved

  // Subtitle + card disappear together.  Total cinematic ≈ 3s.
  //   normal:   subtitle at 140ms, fade-out at 2150ms (.55s), remove at 2800ms
  //             subtitle duration = 2800 - 140 = 2660ms
  //   perfLite: subtitle at 80ms, fade-out at 1900ms (.45s), remove at 2400ms
  //             subtitle duration = 2400 - 80 = 2320ms
  if(subtitle && typeof showCinematicSubtitle === 'function') setTimeout(function(){
    var subtitleTtl = Math.max(800, timing.overlayRemoveAt - timing.subtitleDelay + 80);
    var fadeLead = Math.max(220, subtitleTtl - (timing.overlayFadeAt - timing.subtitleDelay));
    var subEl = showCinematicSubtitle(subtitle, subtitleTtl, rarity, fadeLead);
    if(subEl && overlay && overlay.isConnected){
      overlay.appendChild(subEl);
      subEl.classList.add('inside-consolidation-cinematic');
      subEl.style.setProperty('position', 'absolute', 'important');
      subEl.style.setProperty('left', '50%', 'important');
      var consolidationSubtitleBottom = perfLite ? '24vh' : '27vh';
      if(subEl.classList.contains('multi-line')) consolidationSubtitleBottom = 'calc(' + consolidationSubtitleBottom + ' - 25px)';
      subEl.style.setProperty('bottom', consolidationSubtitleBottom, 'important');
      subEl.style.setProperty('transform', 'translateX(-50%)', 'important');
      subEl.style.setProperty('z-index', '6', 'important');
    }
  }, timing.subtitleDelay);
  document.body.classList.add('cinematic-lock');
  if(typeof G !== 'undefined' && G) G._cinematicUiLockUntil = Math.max(G._cinematicUiLockUntil || 0, Date.now() + timing.lockMs);

  if(opts.playVoice !== false && typeof playCardSound === 'function') playCardSound(card.id);
  if(opts.playSfx !== false && typeof playSfx === 'function') {
    playSfx(typeof getCharacterSetSfxType === 'function' ? getCharacterSetSfxType(card) : 'characterSet');
  }

  // Fade-out: smooth transition so card + subtitle dissolve together
  setTimeout(function(){
    overlay.style.setProperty('transition', 'opacity '+(timing.fadeMs / 1000).toFixed(2)+'s ease-in-out', 'important');
    overlay.style.setProperty('opacity', '0', 'important');
  }, timing.overlayFadeAt);
  setTimeout(function(){
    overlay.remove();
    if(!document.querySelector('.cc-overlay-v2')) document.body.classList.remove('cinematic-lock');
    _consolidationCinematicShowing = false;
    _lastConsolidationCinematicEndedAt = Date.now();
    scheduleEffectActivationCinematicDrain();
    var next = _consolidationCinematicQueue.shift();
    if(next) setTimeout(function(){ showConsolidationCinematic(next.card, next.opts); }, 45);
  }, timing.overlayRemoveAt);

  // Safety: force-cleanup if stuck
  setTimeout(function(){
    if(_consolidationCinematicShowing){
      _consolidationCinematicShowing = false;
      document.querySelectorAll('.cc-overlay-v2').forEach(function(el){ el.remove(); });
      document.body.classList.remove('cinematic-lock');
      _lastConsolidationCinematicEndedAt = Date.now();
      scheduleEffectActivationCinematicDrain();
      var next = _consolidationCinematicQueue.shift();
      if(next) showConsolidationCinematic(next.card, next.opts);
    }
  }, timing.safetyAt);
  return true;
}

function requestCharacterSetCinematic(card, opts) {
  if(!card || card.faceDown || String(card.type || '') === 'Supporter') return false;
  const options = opts || {};
  const identity = String(card.iid || [card.id || '', card.owner ?? '', options.z ?? '', options.r ?? '', options.c ?? ''].join(':'));
  const key = 'character-set:' + identity;
  if(_characterSetCinematicKeys.has(key)) return false;
  _characterSetCinematicKeys.add(key);
  const delayMs = Math.max(0, Number(options.delayMs) || 90);
  try {
    if(typeof G !== 'undefined' && G) {
      G._cinematicUiLockUntil = Math.max(G._cinematicUiLockUntil || 0, Date.now() + delayMs + getConsolidationCinematicTotalMs());
    }
  } catch(e) {}
  setTimeout(function(){
    const shown = showConsolidationCinematic(card, {
      playVoice:options.playVoice !== false,
      playSfx:options.playSfx !== false,
      allowRenderV2Cinematic:true
    });
    if(shown === false) _characterSetCinematicKeys.delete(key);
  }, delayMs);
  return true;
}
if(typeof window !== 'undefined') window.requestCharacterSetCinematic = requestCharacterSetCinematic;

// Effect activation glow — subtle on-field pulse for manually/reactively activated characters.
function showEffectActivationGlow(z, r, c, card) {
  if(typeof document === 'undefined') return;
  if(rendererV2OwnsBoardScene()){
    if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.flashBoardCardActivation === 'function') {
      window.FateMatchRendererAdapter.flashBoardCardActivation(card, z, r, c, {duration:520});
    }
    if(window.FateV2CardMotionFx && typeof window.FateV2CardMotionFx.boardNotice === 'function'){
      window.FateV2CardMotionFx.boardNotice(card, z, r, c, 'ACTIVATE', {type:'SUPPORTER_ACTIVATE', color:'#ffd75a'});
    }
    return;
  }
  const cellEl = document.querySelector('#board .cell[data-z="'+z+'"][data-r="'+r+'"][data-c="'+c+'"]');
  if(!cellEl) return;
  const cardEl = cellEl.querySelector('.bc');
  if(!cardEl) return;
  const rarity = String((card && card.rarity) || '').toLowerCase() || 'circle';
  const aff = String((card && card.aff) || '').replace(/[^a-z0-9_-]/gi,'');
  cardEl.classList.remove('effect-activate-onfield','effect-activate-star','effect-activate-square','effect-activate-triangle','effect-activate-circle');
  void cardEl.offsetWidth;
  cardEl.classList.add('effect-activate-onfield','effect-activate-' + rarity);
  const pulse = document.createElement('div');
  pulse.className = 'effect-activation-aura rarity-' + rarity + (aff ? ' aff-' + aff : '');
  pulse.innerHTML = '<span class="eaa-ring"></span><span class="eaa-spark eaa-s1"></span><span class="eaa-spark eaa-s2"></span><span class="eaa-spark eaa-s3"></span>';
  cardEl.appendChild(pulse);
  const cleanup = function(){
    cardEl.classList.remove('effect-activate-onfield','effect-activate-star','effect-activate-square','effect-activate-triangle','effect-activate-circle');
    if(pulse.parentNode) pulse.remove();
  };
  setTimeout(cleanup, 780);
}

let _effectActivationCinematicShowing = false;
let _effectActivationCinematicQueue = [];
let _lastEffectActivationCinematicKey = '';
let _lastEffectActivationCinematicAt = 0;
let _effectActivationCinematicDrainTimer = 0;
const EFFECT_ACTIVATION_AFTER_CONSOLIDATION_GAP_MS = 1000;

function consolidationCinematicIsActive() {
  return _consolidationCinematicShowing || !!document.querySelector('.cc-overlay-v2:not(.effect-activation-cinematic)');
}

function effectActivationConsolidationGapRemaining() {
  if(!_lastConsolidationCinematicEndedAt) return 0;
  return Math.max(0, EFFECT_ACTIVATION_AFTER_CONSOLIDATION_GAP_MS - (Date.now() - _lastConsolidationCinematicEndedAt));
}

function scheduleEffectActivationCinematicDrain() {
  if(_effectActivationCinematicShowing || !_effectActivationCinematicQueue.length) return;
  if(_effectActivationCinematicDrainTimer) clearTimeout(_effectActivationCinematicDrainTimer);
  const delay = consolidationCinematicIsActive()
    ? 80
    : Math.max(0, effectActivationConsolidationGapRemaining());
  _effectActivationCinematicDrainTimer = setTimeout(function(){
    _effectActivationCinematicDrainTimer = 0;
    if(_effectActivationCinematicShowing) return;
    if(consolidationCinematicIsActive() || effectActivationConsolidationGapRemaining() > 0) {
      scheduleEffectActivationCinematicDrain();
      return;
    }
    const next = _effectActivationCinematicQueue.shift();
    if(next) showEffectActivationCinematic(next.card, next.opts).then(next.resolve);
  }, Math.max(0, delay));
}

function queueEffectActivationCinematic(card, options, key) {
  const alreadyQueued = _effectActivationCinematicQueue.some(function(item){ return item.key === key; });
  if(alreadyQueued) return Promise.resolve(false);
  return new Promise(function(resolve){
    _effectActivationCinematicQueue.push({card:card, opts:Object.assign({}, options), key:key, resolve:resolve});
    scheduleEffectActivationCinematicDrain();
  });
}

function showEffectActivationCinematic(card, opts) {
  const options = opts || {};
  if(typeof document === 'undefined' || !card) return Promise.resolve(false);
  const key = String(card.iid || card.id || card.name || 'card');
  const now = Date.now();
  if(key === _lastEffectActivationCinematicKey && now - _lastEffectActivationCinematicAt < 3200) {
    return Promise.resolve(false);
  }
  if(_effectActivationCinematicShowing || document.querySelector('.effect-activation-cinematic') ||
    consolidationCinematicIsActive() || effectActivationConsolidationGapRemaining() > 0) {
    return queueEffectActivationCinematic(card, options, key);
  }
  _lastEffectActivationCinematicKey = key;
  _lastEffectActivationCinematicAt = now;
  _effectActivationCinematicShowing = true;
  return new Promise(function(resolve){
    const perfLite = document.documentElement.classList.contains('fate-animations-off')
      || document.documentElement.classList.contains('fate-super-performance-mode')
      || document.body.classList.contains('fate-super-performance-mode');
    const duration = Math.max(1400, Math.min(2800, Number(options.duration) || (perfLite ? 1800 : 2300)));
    const rarity = String((card && card.rarity) || 'circle').toLowerCase();
    const color = '#ffd966';
    const imgSrc = card.img ? (typeof getRuntimeCardImageSrc === 'function' ? getRuntimeCardImageSrc(card.img, 'board') : card.img) : '';
    const overlay = document.createElement('div');
    overlay.className = 'cc-overlay-v2 effect-activation-cinematic rarity-' + rarity + (perfLite ? ' perf-lite' : '');
    overlay.setAttribute('style',
      'position:fixed;inset:0;z-index:999998;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,.48);opacity:0;pointer-events:none;overflow:hidden;' +
      'transition:opacity ' + (perfLite ? '.16s' : '.22s') + ' ease-out;'
    );
    const sigil = document.createElement('div');
    sigil.setAttribute('style',
      'position:absolute;left:50%;top:50%;width:min(48vmin,520px);height:min(48vmin,520px);' +
      'transform:translate(-50%,-50%) scale(.72);opacity:0;border:2px solid rgba(255,217,102,.58);' +
      'box-shadow:0 0 28px rgba(255,217,102,.28),inset 0 0 22px rgba(255,217,102,.12);' +
      'transition:transform ' + (perfLite ? '.42s' : '.72s') + ' cubic-bezier(.13,.92,.16,1),opacity .24s ease-out;'
    );
    overlay.appendChild(sigil);
    const cardWrap = document.createElement('div');
    cardWrap.setAttribute('style',
      'position:relative;z-index:2;width:min(46vw,360px);height:min(76vh,500px);display:flex;align-items:center;justify-content:center;' +
      'transform:translateY(0) scale(.72);opacity:0;transition:transform ' + (perfLite ? '.22s' : '.36s') + ' cubic-bezier(.14,.95,.18,1.03),opacity .16s ease-out;' +
      'filter:drop-shadow(0 0 18px rgba(255,217,102,.55));'
    );
    let imageReady = Promise.resolve(false);
    if(imgSrc) {
      const img = document.createElement('img');
      img.alt = card.name || 'Activating card';
      img.setAttribute('style','max-width:100%;max-height:100%;object-fit:contain;display:block;border-radius:10px;outline:2px solid rgba(255,217,102,.82);outline-offset:4px;');
      imageReady = new Promise(function(done){
        let settled = false;
        function finish(result){
          if(settled) return;
          settled = true;
          done(result);
        }
        img.onload = function(){ finish(true); };
        img.onerror = function(){
          if(card.img && img.src.indexOf(card.img) === -1) {
            img.src = card.img;
            setTimeout(function(){ finish(false); }, 160);
          } else {
            img.style.display = 'none';
            finish(false);
          }
        };
        setTimeout(function(){ finish(false); }, perfLite ? 220 : 360);
        setTimeout(function(){
          if(img.complete && img.naturalWidth > 0) finish(true);
        }, 0);
      });
      img.src = imgSrc;
      cardWrap.appendChild(img);
    } else {
      const fallback = document.createElement('div');
      fallback.setAttribute('style','font-size:5rem;color:'+color+';text-shadow:0 0 18px rgba(255,217,102,.7);');
      fallback.textContent = typeof getAffIcon === 'function' ? getAffIcon(card.aff) : '*';
      cardWrap.appendChild(fallback);
    }
    const cardSquare = document.createElement('div');
    cardSquare.setAttribute('style',
      'position:absolute;left:50%;top:50%;width:min(46vw,360px);height:min(76vh,500px);' +
      'transform:translate(-50%,-50%) scale(.88);opacity:0;border:2px solid rgba(255,217,102,.96);border-radius:6px;' +
      'box-shadow:0 0 18px rgba(255,217,102,.72),inset 0 0 16px rgba(255,217,102,.18);' +
      'transition:transform ' + Math.max(1.05, (duration - (perfLite ? 120 : 160)) / 1000).toFixed(2) + 's cubic-bezier(.18,.82,.18,1),opacity ' + Math.max(.65, (duration - (perfLite ? 360 : 480)) / 1000).toFixed(2) + 's ease-out;'
    );
    cardWrap.appendChild(cardSquare);
    const label = document.createElement('div');
    label.setAttribute('style',
      'position:absolute;left:50%;bottom:-7px;transform:translateX(-50%);z-index:3;color:#ffeaa0;text-align:center;' +
      'font-family:var(--serif,serif);letter-spacing:.12em;text-transform:uppercase;text-shadow:0 0 14px rgba(255,217,102,.65);' +
      'font-size:clamp(17px,2.1vw,28px);line-height:1;white-space:nowrap;opacity:0;transition:opacity .2s ease-out;'
    );
    label.textContent = 'Activate Effect';
    cardWrap.appendChild(label);
    overlay.appendChild(cardWrap);
    document.body.appendChild(overlay);
    document.body.classList.add('cinematic-lock');

    let done = false;
    function finish(result) {
      if(done) return;
      done = true;
      overlay.style.opacity = '0';
      setTimeout(function(){
        if(overlay.parentNode) overlay.remove();
        if(!document.querySelector('.cc-overlay-v2')) document.body.classList.remove('cinematic-lock');
        _effectActivationCinematicShowing = false;
        scheduleEffectActivationCinematicDrain();
        resolve(result);
      }, perfLite ? 160 : 220);
    }

    imageReady.then(function(){
      requestAnimationFrame(function(){
        requestAnimationFrame(function(){
        overlay.style.opacity = '1';
        sigil.style.opacity = perfLite ? '.18' : '.34';
        sigil.style.transform = 'translate(-50%,-50%) scale(1.28)';
        cardWrap.style.opacity = '1';
        cardWrap.style.transform = 'translateY(0) scale(1)';
        cardSquare.style.opacity = '1';
        cardSquare.style.transform = 'translate(-50%,-50%) scale(1.62)';
        label.style.opacity = perfLite ? '.78' : '1';
        });
      });
    });
    if(typeof playCardSound === 'function' && options.playVoice === true) playCardSound(card.id);
    if(options.sfx !== false) {
      if(typeof window !== 'undefined' && typeof window.playEffectActivationClickSfx === 'function') {
        window.playEffectActivationClickSfx({remote:!!options.remote, minGapMs:260});
      } else if(typeof playSfx === 'function') {
        playSfx('effectActivate');
      }
    }
    setTimeout(function(){
      cardWrap.style.transform = 'translateY(0) scale(1)';
      sigil.style.opacity = '0';
      cardSquare.style.opacity = '0';
      label.style.opacity = '0';
    }, Math.max(520, duration - (perfLite ? 260 : 340)));
    setTimeout(function(){ finish(true); }, duration);
    setTimeout(function(){ finish(false); }, duration + 900);
  });
}

function effectActivationCinematicDisabled() {
  if(typeof window !== 'undefined' && window.FATE_DISABLE_EFFECT_ACTIVATION_CINEMATIC === true) return true;
  try {
    return localStorage.getItem('fateDisableEffectActivationCinematic') === '1';
  } catch(e) {
    return false;
  }
}

function playEffectActivationCinematic(card, z, r, c, opts) {
  const options = opts || {};
  if(effectActivationCinematicDisabled()) return Promise.resolve(false);
  if(!options.remote && options.broadcast !== false && String(options.source || '') !== 'improvisor-reaction' && typeof window !== 'undefined' && typeof window.__fateSendEffectActivationCinematic === 'function') {
    try { window.__fateSendEffectActivationCinematic(card, z, r, c, options); } catch(e) {}
  }
  if(typeof showEffectActivationCinematic === 'function') {
    return showEffectActivationCinematic(card, options);
  }
  const delay = Math.max(0, Math.min(180, Number(options.duration) || 120));
  return new Promise(function(resolve){ setTimeout(function(){ resolve(false); }, delay); });
}

showEffectActivationGlow = function() {
  return false;
};

if(typeof window !== 'undefined') {
  window.showEffectActivationCinematic = showEffectActivationCinematic;
  window.playEffectActivationCinematic = playEffectActivationCinematic;
  window.showEffectActivationGlow = showEffectActivationGlow;
}


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


// ═══════════════════════════════════════════════════════════════
//  ACTIVE EFFECTS PANEL — shows persistent effects on screen
// ═══════════════════════════════════════════════════════════════
function updateActiveEffectsPanel() {
  // Effects now rendered in topbar via renderTopbarEffects()
}

// ═══════════════════════════════════════════════════════════════
//  LAST TURN BANNER — large brief announcement

// ═══════════════════════════════════════════════════════════════
//  BLOCK VISUAL — Carolyn lock / Zoe no-consolidation overlay
// ═══════════════════════════════════════════════════════════════


// ===================================================================
//  REVEALED HAND WINDOW — shows all revealed cards in opponent hand
// ===================================================================
function showRevealedHandWindow(playerIdx) {
  const hand = G.players[playerIdx].hand;
  const revealed = G._revealedCards || {};
  const revealedCards = hand.filter(c => revealed[c.iid]);

  if(revealedCards.length === 0) {
    toast('No revealed cards in ' + G.players[playerIdx].name + "'s hand");
    return;
  }

  showCanvasCardGalleryModal(G.players[playerIdx].name + "'s Revealed Cards", revealedCards, {
    viewerPlayerIndex: getPerspectivePlayerIndex(),
    imageRole: 'detail',
    hideCountText: true
  });
}

function normalizeBlockedCells() {
  if(!G || !Array.isArray(G.blockedCells)) { if(G) G.blockedCells = []; return []; }
  const seen = new Map();
  G.blockedCells.forEach(function(b){
    if(!b) return;
    const z = Number(b.z), r = Number(b.r), c = Number(b.c);
    if(!Number.isFinite(z) || !Number.isFinite(r) || !Number.isFinite(c)) return;
    const type = b.type === 'carolyn' ? 'carolyn' : 'zoe';
    const key = z + ':' + r + ':' + c;
    const prev = seen.get(key);
    // Carolyn is stronger; keep her if duplicate blocks ever exist.
    if(!prev || type === 'carolyn') seen.set(key, Object.assign({}, b, {z,r,c,type}));
  });
  G.blockedCells = Array.from(seen.values());
  return G.blockedCells;
}

function showBlockVisual(z, r, c, blockType) {
  if(rendererV2OwnsBoardScene()){
    if(typeof window.FateMatchRendererAdapter.scheduleRender === 'function') window.FateMatchRendererAdapter.scheduleRender('block-visual');
    return;
  }
  const cellEl = document.querySelector('#board .cell[data-z="'+z+'"][data-r="'+r+'"][data-c="'+c+'"]');
  if(!cellEl) return;

  // Remove every old block overlay on this cell. A single querySelector only
  // removed the first one, which could leave Zoe markers stacking after renders.
  cellEl.querySelectorAll('.block-overlay').forEach(function(el){ el.remove(); });

  const overlay = document.createElement('div');
  overlay.className = 'block-overlay block-' + blockType;
  overlay.dataset.blockKey = z + ':' + r + ':' + c;

  if(blockType === 'carolyn') {
    overlay.innerHTML = '<div class="block-icon carolyn-lock-icon" aria-label="Carolyn lock"></div>';
    overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:80;border-radius:4px;';
  } else {
    overlay.innerHTML = '<div class="block-icon">−</div><div class="block-label">NO CONSOLIDATE</div>';
    overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:82;border-radius:7px;';
  }

  cellEl.style.position = 'relative';
  cellEl.appendChild(overlay);
}

// Re-render block overlays after each renderGame
function refreshBlockOverlays() {
  const blocks = normalizeBlockedCells();
  if(rendererV2OwnsBoardScene()){
    removeRenderV2LegacyLiveVisuals();
    const signature = blocks.map(function(b){
      return [b.z, b.r, b.c, b.type || 'movement'].join(':');
    }).sort().join('|');
    if(signature === _lastBlockOverlaySignature) return;
    _lastBlockOverlaySignature = signature;
    if(typeof window.FateMatchRendererAdapter.scheduleRender === 'function') window.FateMatchRendererAdapter.scheduleRender('block-overlays');
    return;
  }
  const signature = blocks.map(function(b){
    return [b.z, b.r, b.c, b.type || 'movement'].join(':');
  }).sort().join('|');
  const board = document.getElementById('board') || document;
  const existingCount = board.querySelectorAll('.block-overlay').length;
  if(signature && signature === _lastBlockOverlaySignature && existingCount === blocks.length) return;
  if(!signature && !_lastBlockOverlaySignature && existingCount === 0) return;

  // Clear old board overlays first so persistent effects never stack.
  board.querySelectorAll('.block-overlay').forEach(function(el){ el.remove(); });
  _lastBlockOverlaySignature = signature;
  blocks.forEach(function(b){ showBlockVisual(b.z, b.r, b.c, b.type); });
}

// ═══════════════════════════════════════════════════════════════
function showLastTurnBanner(playerName, isFinalTurn) {
  const existing = document.getElementById('last-turn-banner');
  if(existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'last-turn-banner';
  const text = isFinalTurn ? 'FINAL TURN' : (playerName + '\'s LAST TURN');
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;z-index:9000;pointer-events:none;animation:lastTurnIn .6s ease;';
  banner.innerHTML = '<div style="font-family:Cinzel,serif;font-size:2.4rem;font-weight:900;color:#f6fbff;text-shadow:0 0 26px rgba(105,190,255,.75),0 0 62px rgba(255,80,80,.35),0 4px 12px rgba(0,0,0,.85);letter-spacing:.15em;text-transform:uppercase;animation:lastTurnPulse 1.5s ease;">' + text + '</div>';

  document.body.appendChild(banner);

  if(typeof playSfx === 'function') playSfx('lastTurn');

  setTimeout(() => {
    if(banner.parentNode) {
      banner.style.animation = 'lastTurnOut .5s ease forwards';
      setTimeout(() => { if(banner.parentNode) banner.remove(); }, 500);
    }
  }, 2000);
}

// Pick a card from ANY zone (for effects like Juan Carlos)
function pickCardFromAnyZone(prompt, callback, filter) {
  const wait = (typeof getInteractionAnimationDelayMs === 'function' ? getInteractionAnimationDelayMs() : (typeof getPlacementUiDelayMs === 'function' ? getPlacementUiDelayMs() : 0));
  if(wait > 0){
    setTimeout(function(){ pickCardFromAnyZone(prompt, callback, filter); }, wait);
    return;
  }
  const cp = G.currentPlayer;
  const viewerP = getPerspectivePlayerIndex();
  const entries = [];
  for(let z=0; z<3; z++) {
    const totalRows = G.board[z] ? G.board[z].length : 3;
    for(let r=0; r<totalRows; r++) {
      const rowCap = typeof getBoardRowCapacity === 'function' ? getBoardRowCapacity(z, r) : 3;
      for(let c=0; c<rowCap; c++) {
        const cell = G.board[z] && G.board[z][r] ? G.board[z][r][c] : null;
        if(cell && (!filter || filter(cell))) entries.push({card:cell, z:z, r:r, c:c});
      }
    }
  }
  if(!entries.length){ toast('No valid targets'); return; }
  showBoardTargetPicker({
    title: 'Select Target',
    prompt: prompt,
    maxCount: 1,
    confirmLabel: 'Confirm',
    viewerPlayerIndex: viewerP,
    zones: [0, 1, 2],
    entries: entries,
    showOpponentOverlay: !filter,
    emptyMessage: 'No valid targets'
  }, function(chosenEntries){
    if(!chosenEntries.length) return;
    const picked = chosenEntries[0];
    if(picked) callback(picked.card, picked.z, picked.r, picked.c);
  });
  return;
  const body = document.createElement('div');
  body.className = 'maria-any-zone-picker any-zone-picker-board';
  body.innerHTML = '<p style="font-size:.82rem;color:var(--dim);font-style:italic;margin-bottom:.5rem;">'+prompt+'</p>' +
    '<p style="font-size:.68rem;color:var(--dim);margin-bottom:.6rem;">' +
      '<span style="color:var(--p1)">● Your cards</span>' +
      '<span style="color:var(--p2);margin-left:1rem;">● Opponent</span>' +
      '<span style="color:#444;margin-left:1rem;">● Not targetable</span>' +
    '</p>';
  
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:row;gap:.8rem;align-items:flex-start;justify-content:center;flex-wrap:wrap;';
  
  let chosen = null;
  let chosenEl = null;
  
  for(let z=0;z<3;z++){
    const zoneWrap = document.createElement('div');
    zoneWrap.style.cssText = 'display:flex;flex-direction:column;gap:.35rem;align-items:center;flex:1 1 220px;max-width:260px;';
    const zLabel = document.createElement('div');
    zLabel.style.cssText = 'font-family:Cinzel,serif;font-size:.7rem;color:var(--gold);letter-spacing:.1em;text-transform:uppercase;';
    zLabel.textContent = 'Zone '+(z+1);
    zoneWrap.appendChild(zLabel);
    
    // Build the full visible zone, including extra safe rows from effects.
    const zoneGrid = document.createElement('div');
    zoneGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:5px;width:100%;max-width:360px;';
    const totalRows = G.board[z] ? G.board[z].length : 3;
    
    for(let r=0;r<totalRows;r++){
      const rowCap = typeof getBoardRowCapacity === 'function' ? getBoardRowCapacity(z, r) : 3;
      for(let c=0;c<rowCap;c++){
        var cell = G.board[z]&&G.board[z][r]?G.board[z][r][c]:null;
        var cellEl = document.createElement('div');
        cellEl.style.cssText = 'width:100%;aspect-ratio:3/4;background:rgba(0,0,0,.5);border:1.5px solid rgba(255,255,255,.1);border-radius:4px;overflow:hidden;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:border-color .15s,box-shadow .15s,transform .12s;position:relative;contain:layout style paint;';
        
        if(!cell){
          cellEl.innerHTML = '<span style="font-size:.5rem;color:#333;font-family:Cinzel,serif;">empty</span>';
          cellEl.style.cursor = 'default';
          cellEl.style.background = 'rgba(0,0,0,.3)';
        } else {
          var ok = !filter || filter(cell);
          var visual = getCardVisualData(cell, viewerP, {boardPos:{z,r,c}});
          cellEl.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#0a0a0f;">' +
            (visual.img?'<img src="'+visual.img+'" style="width:100%;height:100%;object-fit:cover;object-position:center 25%;" loading="lazy" decoding="async">':'<span style="font-size:1.4rem;opacity:.4;">'+getAffIcon(visual.aff)+'</span>') +
            '</div>' +
            '<div style="position:absolute;top:2px;right:2px;z-index:2;background:rgba(0,0,0,.85);border:1px solid var(--fate);color:var(--fate);font-family:Cinzel,serif;font-size:.6rem;font-weight:700;padding:.05rem .22rem;border-radius:2px;min-width:14px;text-align:center;">'+visual.displayFate+'</div>';
          if(!ok){
            cellEl.style.opacity = '.3';
            cellEl.style.cursor = 'not-allowed';
          } else {
            cellEl.style.borderColor = cell.owner===cp?'rgba(58,143,217,.6)':'rgba(217,74,74,.6)';
            cellEl.style.boxShadow = cell.owner===cp?'0 0 6px rgba(58,143,217,.2)':'0 0 6px rgba(217,74,74,.2)';
            (function(_cell,_z,_r,_c,_el){
              _el.onmouseenter = function(){ if(_el!==chosenEl) _el.style.transform='translateY(-2px)'; };
              _el.onmouseleave = function(){ if(_el!==chosenEl) _el.style.transform=''; };
              _el.onclick = function(){
                if(chosenEl){ chosenEl.style.boxShadow = chosenEl.dataset.origShadow||''; chosenEl.style.transform=''; }
                chosen = {card:_cell,z:_z,r:_r,c:_c};
                _el.dataset.origShadow = _el.style.boxShadow;
                chosenEl = _el;
                _el.style.boxShadow = '0 0 0 2px var(--gold),0 0 14px rgba(201,168,76,.4)';
                _el.style.transform = 'translateY(-2px)';
              };
            })(cell,z,r,c,cellEl);
          }
        }
        zoneGrid.appendChild(cellEl);
      }
    }
    zoneWrap.appendChild(zoneGrid);
    wrap.appendChild(zoneWrap);
  }
  body.appendChild(wrap);
  
  showModal('Select Target','',
    [{label:'Cancel',action:closeModal},
     {label:'Confirm',pri:true,action:function(){
       if(!chosen){toast('Select a card first');return;}
       closeModal();
       callback(chosen.card,chosen.z,chosen.r,chosen.c);
     }}]);
  document.getElementById('modal-body').innerHTML='';
  document.getElementById('modal-body').appendChild(body);
  // Trim modal width for a tighter fit
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox) Object.assign(modalBox.style, {maxWidth:'920px', padding:'1.2rem 1.4rem'});
}
