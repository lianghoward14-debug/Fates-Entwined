(function(){
  'use strict';

  if(typeof window === 'undefined') return;

  const canUseCanvas = () => {
    try {
      if(typeof window.shouldUseCanvasBoardVisuals === 'function') return window.shouldUseCanvasBoardVisuals();
      return !!(window.HTMLCanvasElement && window.requestAnimationFrame);
    } catch(e) {
      return false;
    }
  };

  function getRenderV2Mode(){
    try {
      return window.FateRenderV2Flags && typeof window.FateRenderV2Flags.getMode === 'function'
        ? window.FateRenderV2Flags.getMode()
        : '';
    } catch(e) {
      return '';
    }
  }

  function shouldUseRenderV2Scene(){
    return getRenderV2Mode() === 'scene'
      && typeof window.fateBuildRenderSnapshot === 'function'
      && typeof window.fateBuildMatchLayout === 'function';
  }

  function shouldDrawRenderV2DebugScene(){
    try {
      const params = new URLSearchParams(window.location.search || '');
      if(params.get('renderV2DebugScene') === '1') return true;
      return localStorage.getItem('fateRenderV2DebugScene') === '1';
    } catch(e) {
      return false;
    }
  }

  if(!canUseCanvas()){
    document.documentElement.classList.remove('fate-canvas-board-mode');
    window.FATE_USE_CANVAS_BOARD = false;
    window.fateCanvasBoardReport = function(){
      return {
        enabled:false,
        reason:'canvas-board-unavailable',
        domBoardFallbackUrl: location.pathname + location.search + (location.search ? '&' : '?') + 'domBoard=1'
      };
    };
    return;
  }

  document.documentElement.classList.add('fate-canvas-board-mode');
  window.FATE_USE_CANVAS_BOARD = true;

  const imageCache = new Map();
  const fateAnimByIid = new Map();
  const CANVAS_FATE_PULSE_MS = 420;
  const LAYOUT_RETRY_MS = 900;
  const backBuffer = document.createElement('canvas');
  const retainedFrame = document.createElement('canvas');
  let drawRaf = 0;
  let lastReport = { draws:0, cards:0, imagesPending:0, lastMs:0, skippedEmptyFrames:0 };
  let lastSceneReport = { enabled:false, reason:'not-drawn', builds:0, mode:'dom-canvas' };
  const drawSourceCounts = {};
  let scheduleRequests = 0;
  let skippedScheduleRequests = 0;
  let lastScheduleSource = '';
  let layoutRetryUntil = 0;
  let boardRebuildInProgress = false;
  let textureCacheCallback = null;

  function roundMs(ms){
    return Math.round((Number(ms) || 0) * 10) / 10;
  }

  function scheduleDraw(source){
    const drawSource = source || 'unknown';
    scheduleRequests++;
    drawSourceCounts[drawSource] = (drawSourceCounts[drawSource] || 0) + 1;
    lastScheduleSource = drawSource;
    if(drawRaf || boardRebuildInProgress) {
      skippedScheduleRequests++;
      return;
    }
    drawRaf = requestAnimationFrame(function(){
      drawRaf = 0;
      if(boardRebuildInProgress) return;
      drawNow(drawSource);
    });
  }

  function ensureCanvas(board){
    let canvas = document.getElementById('fate-board-canvas');
    if(!canvas){
      canvas = document.createElement('canvas');
      canvas.id = 'fate-board-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      board.appendChild(canvas);
    } else if(canvas.parentNode !== board) {
      board.appendChild(canvas);
    }
    canvas.style.display = 'block';
    return canvas;
  }

  function getImage(src){
    if(!src) return null;
    if(window.FateCardTextureCache && typeof window.FateCardTextureCache.get === 'function'){
      if(!textureCacheCallback) {
        textureCacheCallback = function(rec, reason){
          scheduleDraw(reason === 'bitmap-ready' ? 'texture-bitmap-ready' : 'texture-cache-change');
        };
      }
      const texture = window.FateCardTextureCache.get(src, {
        source:'board-canvas',
        onChange:textureCacheCallback
      });
      if(texture) return texture;
    }
    const key = String(src);
    let rec = imageCache.get(key);
    if(rec) {
      if(!rec.loaded && !rec.failed && rec.img.complete && (rec.img.naturalWidth || rec.img.width)) {
        rec.loaded = true;
      }
      return rec;
    }
    const img = new Image();
    rec = { img, loaded:false, failed:false, fallbackTried:false };
    imageCache.set(key, rec);
    const fallbackSrc = (typeof window.getFullCardImageFallbackSrc === 'function')
      ? window.getFullCardImageFallbackSrc(key)
      : key.replace(/(?:^|\/)optimized\/card-thumbs\/([A-Za-z0-9_-]+)\.jpg(?:[?#].*)?$/, '$1.png');
    const tryFallback = function(){
      if(rec.loaded || rec.fallbackTried || !fallbackSrc || fallbackSrc === key) return;
      rec.fallbackTried = true;
      rec.failed = false;
      img.src = fallbackSrc;
    };
    img.decoding = 'async';
    img.loading = 'eager';
    try { img.fetchPriority = 'high'; } catch(e) {}
    img.onload = function(){ rec.loaded = true; scheduleDraw('image-load'); };
    img.onerror = function(){
      if(!rec.fallbackTried && fallbackSrc && fallbackSrc !== key){ tryFallback(); return; }
      rec.failed = true;
      scheduleDraw('image-complete');
    };
    img.src = key;
    if(img.complete && (img.naturalWidth || img.width)) rec.loaded = true;
    setTimeout(function(){
      if(!rec.loaded && !rec.failed) tryFallback();
    }, 850);
    return rec;
  }

  function getTextureCacheReport(){
    if(window.FateCardTextureCache && typeof window.FateCardTextureCache.report === 'function') {
      try { return window.FateCardTextureCache.report(); } catch(e) {}
    }
    return null;
  }

  function getPendingTextureCount(){
    const report = getTextureCacheReport();
    if(report) return report.pending || 0;
    let pending = 0;
    imageCache.forEach(function(rec){ if(!rec.loaded && !rec.failed) pending++; });
    return pending;
  }

  function getTextureCacheSize(){
    const report = getTextureCacheReport();
    return report ? report.entries : imageCache.size;
  }

  function preloadVisibleTextures(snapshot, layout){
    if(!window.FateCardTextureCache || typeof window.FateCardTextureCache.preloadVisible !== 'function') return null;
    try { return window.FateCardTextureCache.preloadVisible(snapshot, layout); }
    catch(e) { return null; }
  }

  function getBaseCardTexture(card, visual, rect){
    if(!window.FateCardTextureCache || typeof window.FateCardTextureCache.getBaseCardTexture !== 'function') return null;
    try {
      if(!textureCacheCallback) {
        textureCacheCallback = function(rec, reason){
          scheduleDraw(reason === 'bitmap-ready' || reason === 'base-ready' ? 'texture-ready' : 'texture-cache-change');
        };
      }
      return window.FateCardTextureCache.getBaseCardTexture(card, {w:rect.w, h:rect.h}, {
        visual,
        dpr:window.devicePixelRatio || 1,
        onChange:textureCacheCallback
      });
    } catch(e) {
      return null;
    }
  }

  function roundedPath(ctx, x, y, w, h, r){
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  function drawImageCover(ctx, img, x, y, w, h){
    const iw = img.naturalWidth || img.width || 1;
    const ih = img.naturalHeight || img.height || 1;
    const scale = Math.max(w / iw, h / ih);
    const sw = w / scale;
    const sh = h / scale;
    const sx = Math.max(0, (iw - sw) / 2);
    const sy = Math.max(0, (ih - sh) * 0.22);
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  function drawFallback(ctx, visual, x, y, w, h){
    const grd = ctx.createLinearGradient(x, y, x + w, y + h);
    grd.addColorStop(0, '#182032');
    grd.addColorStop(1, '#080a10');
    ctx.fillStyle = grd;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = Math.max(18, Math.round(w * .26)) + 'px Cinzel, serif';
    const aff = (visual && visual.aff && visual.aff !== 'hidden') ? String(visual.aff).slice(0, 1).toUpperCase() : '?';
    ctx.fillText(aff, x + w / 2, y + h / 2);
  }

  function offsetRect(r, originX, originY, scrollX, scrollY){
    return {
      x:(Number(r && r.x) || 0) - originX + scrollX,
      y:(Number(r && r.y) || 0) - originY + scrollY,
      w:Number(r && r.w) || 0,
      h:Number(r && r.h) || 0
    };
  }

  function strokeRoundedRect(ctx, rect, radius, fill, stroke, lineWidth){
    if(!rect || rect.w <= 0 || rect.h <= 0) return;
    roundedPath(ctx, rect.x, rect.y, rect.w, rect.h, radius || 4);
    if(fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if(stroke) {
      ctx.lineWidth = lineWidth || 1;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }

  function drawSceneText(ctx, text, x, y, opts){
    const o = opts || {};
    ctx.save();
    ctx.fillStyle = o.color || 'rgba(246,232,190,.9)';
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = o.baseline || 'middle';
    ctx.font = o.font || '700 13px system-ui, sans-serif';
    ctx.fillText(String(text || ''), x, y);
    ctx.restore();
  }

  function ownerLabel(owner){
    if(owner === 0) return 'P1';
    if(owner === 1) return 'P2';
    return 'Mid';
  }

  function sceneRuntimeCard(publicCard){
    if(!publicCard) return null;
    const flags = publicCard.flags || {};
    return {
      iid:publicCard.iid,
      owner:publicCard.owner,
      fate:publicCard.fate,
      currentFate:publicCard.currentFate,
      _markedForDeath:!!flags.markedForDeath,
      faceDown:!!flags.faceDown,
      xFate:!!flags.xFate,
      xCost:!!flags.xCost
    };
  }

  function measureSceneDomAlignment(layout, board, originX, originY, scrollX, scrollY){
    if(!layout || !board || !Array.isArray(layout.cardRects)) return null;
    const samples = [];
    let maxDx = 0;
    let maxDy = 0;
    let maxDw = 0;
    let maxDh = 0;
    layout.cardRects.forEach(function(entry){
      if(!entry || !entry.hasCard) return;
      const cell = board.querySelector('.cell[data-z="' + entry.z + '"][data-r="' + entry.r + '"][data-c="' + entry.c + '"]');
      const visual = cell && cell.querySelector ? (cell.querySelector('.bc') || cell) : null;
      if(!visual || !visual.getBoundingClientRect) return;
      const dom = visual.getBoundingClientRect();
      const math = offsetRect(entry.cardRect || entry.rect, originX, originY, scrollX, scrollY);
      const domRect = {
        x:dom.left - originX + scrollX,
        y:dom.top - originY + scrollY,
        w:dom.width,
        h:dom.height
      };
      const dx = roundMs(math.x - domRect.x);
      const dy = roundMs(math.y - domRect.y);
      const dw = roundMs(math.w - domRect.w);
      const dh = roundMs(math.h - domRect.h);
      maxDx = Math.max(maxDx, Math.abs(dx));
      maxDy = Math.max(maxDy, Math.abs(dy));
      maxDw = Math.max(maxDw, Math.abs(dw));
      maxDh = Math.max(maxDh, Math.abs(dh));
      if(samples.length < 5) {
        samples.push({
          z:entry.z,
          r:entry.r,
          c:entry.c,
          dx,
          dy,
          dw,
          dh,
          math:{x:roundMs(math.x), y:roundMs(math.y), w:roundMs(math.w), h:roundMs(math.h)},
          dom:{x:roundMs(domRect.x), y:roundMs(domRect.y), w:roundMs(domRect.w), h:roundMs(domRect.h)}
        });
      }
    });
    return {
      samples:samples.length,
      maxDx:roundMs(maxDx),
      maxDy:roundMs(maxDy),
      maxDw:roundMs(maxDw),
      maxDh:roundMs(maxDh),
      first:samples[0] || null
    };
  }

  function drawRenderV2Scene(ctx, layout, snapshot, board){
    const sceneStart = performance.now();
    if(!layout || !snapshot || !board) {
      lastSceneReport = { enabled:false, reason:'scene-input-unavailable', builds:lastSceneReport.builds || 0, mode:getRenderV2Mode() || 'unknown' };
      return null;
    }

    const originX = Number(layout.boardRect && layout.boardRect.x) || 0;
    const originY = Number(layout.boardRect && layout.boardRect.y) || 0;
    const scrollX = Number(board.scrollLeft) || 0;
    const scrollY = Number(board.scrollTop) || 0;
    const boardRect = offsetRect(layout.boardRect, originX, originY, scrollX, scrollY);
    const domAlignment = measureSceneDomAlignment(layout, board, originX, originY, scrollX, scrollY);
    const preloadReport = preloadVisibleTextures(snapshot, layout);
    const expectedCards = snapshot.counts && Number(snapshot.counts.boardCards) || 0;
    const layoutCards = Array.isArray(layout.cardRects) ? layout.cardRects.length : 0;
    if(expectedCards !== layoutCards) {
      lastSceneReport = {
        enabled:false,
        reason:'snapshot-layout-card-mismatch',
        builds:lastSceneReport.builds || 0,
        mode:getRenderV2Mode() || 'unknown',
        expectedCards,
        layoutCards,
        snapshotSignature:snapshot.signature || '',
        layoutSignature:layout.snapshotSignature || ''
      };
      return null;
    }

    const layers = { background:0, zones:0, rows:0, cells:0, cards:0, overlays:0 };
    const debugScene = shouldDrawRenderV2DebugScene();
    ctx.save();
    if(debugScene){
      const bg = ctx.createLinearGradient(boardRect.x, boardRect.y, boardRect.x, boardRect.y + boardRect.h);
      bg.addColorStop(0, 'rgba(10,14,23,.97)');
      bg.addColorStop(.58, 'rgba(8,10,16,.98)');
      bg.addColorStop(1, 'rgba(6,8,13,.99)');
      ctx.fillStyle = bg;
      ctx.fillRect(boardRect.x, boardRect.y, boardRect.w, boardRect.h);
      layers.background++;
    }

    const zones = Array.isArray(layout.zones) ? layout.zones : [];
    zones.forEach(function(zone, index){
      const zr = offsetRect(zone.rect, originX, originY, scrollX, scrollY);
      const hr = offsetRect(zone.headerRect, originX, originY, scrollX, scrollY);
      const zoneHue = index === 0 ? 'rgba(79,118,174,' : index === 1 ? 'rgba(169,132,72,' : 'rgba(118,158,105,';
      if(debugScene){
        strokeRoundedRect(ctx, zr, 7, zoneHue + '.11)', zoneHue + '.34)', 1.2);
        layers.zones++;

        const headerFill = ctx.createLinearGradient(hr.x, hr.y, hr.x, hr.y + hr.h);
        headerFill.addColorStop(0, zoneHue + '.32)');
        headerFill.addColorStop(1, 'rgba(8,10,15,.72)');
        strokeRoundedRect(ctx, hr, 6, headerFill, 'rgba(230,207,142,.28)', 1);
        drawSceneText(ctx, 'Zone ' + (zone.z + 1), hr.x + hr.w / 2, hr.y + hr.h / 2, {
          font:'800 ' + Math.max(12, Math.min(18, Math.round(hr.h * .36))) + 'px Cinzel, serif',
          color:'rgba(250,235,190,.94)'
        });
      }

      const rows = Array.isArray(zone.rows) ? zone.rows : [];
      rows.forEach(function(row){
        const rr = offsetRect(row.rect, originX, originY, scrollX, scrollY);
        const lr = offsetRect(row.labelRect, originX, originY, scrollX, scrollY);
        if(debugScene){
          strokeRoundedRect(ctx, rr, 5, 'rgba(255,255,255,.028)', 'rgba(255,255,255,.07)', 1);
          strokeRoundedRect(ctx, lr, 5, 'rgba(0,0,0,.20)', 'rgba(255,255,255,.06)', 1);
          drawSceneText(ctx, ownerLabel(row.owner), lr.x + lr.w / 2, lr.y + lr.h / 2, {
            font:'800 ' + Math.max(10, Math.min(13, Math.round(lr.h * .22))) + 'px system-ui, sans-serif',
            color:row.owner === snapshot.viewer ? 'rgba(153,211,255,.92)' : 'rgba(236,217,176,.84)'
          });
          layers.rows++;
        }

        (row.cells || []).forEach(function(cell){
          const cr = offsetRect(cell.rect, originX, originY, scrollX, scrollY);
          const hasCard = !!cell.card;
          const fill = hasCard ? 'rgba(255,255,255,.045)' : 'rgba(255,255,255,.018)';
          const stroke = cell.blocked ? 'rgba(210,70,76,.55)' : cell.markSafe ? 'rgba(105,190,255,.55)' : 'rgba(255,255,255,.08)';
          if(debugScene){
            strokeRoundedRect(ctx, cr, 4, fill, stroke, cell.blocked || cell.markSafe ? 1.4 : .9);
            layers.cells++;

            if(cell.blocked){
              drawSceneText(ctx, 'X', cr.x + cr.w / 2, cr.y + cr.h / 2, {
                font:'900 ' + Math.max(12, Math.round(Math.min(cr.w, cr.h) * .24)) + 'px system-ui, sans-serif',
                color:'rgba(255,145,145,.74)'
              });
              layers.overlays++;
            } else if(cell.markSafe) {
              ctx.save();
              ctx.beginPath();
              ctx.arc(cr.x + cr.w - Math.max(7, cr.w * .12), cr.y + Math.max(7, cr.w * .12), Math.max(3, cr.w * .045), 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(105,190,255,.75)';
              ctx.fill();
              ctx.restore();
              layers.overlays++;
            }
          }
        });
      });
    });

    let cards = 0;
    let animatingFate = false;
    const animateFateBadges = shouldAnimateCanvasFateBadges();
    const cardLoopStart = performance.now();
    (layout.cardRects || []).forEach(function(entry){
      if(!entry || !entry.card) return;
      const card = sceneRuntimeCard(entry.card);
      const visual = entry.card.visual || null;
      const rect = offsetRect(entry.cardRect || entry.rect, originX, originY, scrollX, scrollY);
      const fateAnim = getFateAnim(card, visual && visual.displayFate);
      if(animateFateBadges && fateAnim && fateAnim.changedAt && performance.now() - fateAnim.changedAt < CANVAS_FATE_PULSE_MS) animatingFate = true;
      if(drawCard(ctx, visual, card, rect, false, { viewerP:snapshot.viewer, fateAnim, textureCard:entry.card })) {
        cards++;
        layers.cards++;
      }
    });
    ctx.restore();

    lastSceneReport = {
      enabled:true,
      mode:getRenderV2Mode() || 'scene',
      builds:(lastSceneReport.builds || 0) + 1,
      version:1,
      snapshotSignature:snapshot.signature || '',
      layoutSignature:layout.snapshotSignature || '',
      expectedCards,
      layoutCards,
      cards,
      zones:zones.length,
      rows:zones.reduce(function(total, zone){ return total + ((zone.rows && zone.rows.length) || 0); }, 0),
      cells:zones.reduce(function(total, zone){
        return total + (zone.rows || []).reduce(function(rowTotal, row){ return rowTotal + ((row.cells && row.cells.length) || 0); }, 0);
      }, 0),
      visualMode:debugScene ? 'debug-full-scene' : 'production-card-layer',
      domAlignment,
      preload:preloadReport ? {requested:preloadReport.requested, items:preloadReport.items} : null,
      layers,
      cardLoopMs:roundMs(performance.now() - cardLoopStart),
      lastMs:roundMs(performance.now() - sceneStart)
    };
    return { cards, animatingFate, report:lastSceneReport };
  }

  function drawTributeCue(ctx, rect, state){
    if(!state) return;
    const x = rect.x, y = rect.y, w = rect.w, h = rect.h;
    const selected = state === 'selected';
    const placement = state === 'placement';
    const ready = state === 'ready';
    const color = ready ? 'rgba(105,190,255,.96)' : selected ? 'rgba(255,225,96,.96)' : placement ? 'rgba(255,215,86,.9)' : 'rgba(255,215,0,.68)';
    const fill = ready ? 'rgba(80,170,255,.06)' : selected ? 'rgba(255,215,0,.055)' : placement ? 'rgba(255,215,0,.035)' : 'rgba(255,215,0,.018)';
    const radius = Math.max(5, Math.min(10, w * .06));
    ctx.save();
    const outerPad = (selected || ready) ? 2.5 : 1.5;
    roundedPath(ctx, x - outerPad, y - outerPad, w + outerPad * 2, h + outerPad * 2, radius + 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = ready ? 2.45 : (selected ? 2.35 : (placement ? 1.75 : 1.25));
    ctx.setLineDash([]);
    ctx.strokeStyle = color;
    ctx.shadowColor = ready ? 'rgba(80,170,255,.42)' : 'rgba(255,215,0,.34)';
    ctx.shadowBlur = ready ? 7 : (selected ? 6 : (placement ? 4 : 2));
    ctx.stroke();
    ctx.restore();

    if(selected || placement || ready){
      ctx.save();
      ctx.strokeStyle = ready ? 'rgba(210,238,255,.5)' : 'rgba(255,246,190,.42)';
      ctx.lineWidth = ready ? 1.05 : .95;
      roundedPath(ctx, x + 2.5, y + 2.5, w - 5, h - 5, Math.max(4, radius - 1));
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawFateBadge(ctx, visual, card, rect, selected, fateAnim){
    const fate = visual && visual.displayFate != null ? String(visual.displayFate) : '';
    if(!fate) return;
    const x = rect.x, y = rect.y, w = rect.w;
    const printed = Number(card && card.fate);
    const shown = Number(fate);
    const buffed = Number.isFinite(printed) && Number.isFinite(shown) && shown > printed;
    const debuffed = Number.isFinite(printed) && Number.isFinite(shown) && shown < printed;
    const color = buffed ? '#7fff90' : debuffed ? '#ff6060' : '#ffd95c';
    const glow = buffed ? 'rgba(127,255,144,.50)' : debuffed ? 'rgba(255,96,96,.52)' : 'rgba(241,196,15,.48)';
    let pulse = 0;
    let deltaText = '';
    if(fateAnim && fateAnim.changedAt){
      const elapsed = performance.now() - fateAnim.changedAt;
      if(elapsed >= 0 && elapsed < CANVAS_FATE_PULSE_MS) {
        pulse = 1 - (elapsed / CANVAS_FATE_PULSE_MS);
        if(fateAnim.delta) deltaText = (fateAnim.delta > 0 ? '+' : '') + fateAnim.delta;
      }
    }
    const badgeH = Math.max(19, Math.min(26, w * .22));
    const standardBadgeW = Math.max(32, Math.min(36, w * .27));
    const badgeW = Math.max(standardBadgeW, Math.min(42, standardBadgeW + Math.max(0, fate.length - 1) * 4));
    const bx = x + w - badgeW - 2;
    const by = y + 2;
    const r = badgeH / 2;

    const fill = ctx.createLinearGradient(bx, by, bx, by + badgeH);
    fill.addColorStop(0, 'rgba(34,25,5,.98)');
    fill.addColorStop(.55, 'rgba(9,10,14,.98)');
    fill.addColorStop(1, 'rgba(2,3,6,.98)');

    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = selected ? 10 : 7;
    ctx.shadowOffsetY = 2;
    if(pulse > 0){
      const grow = 1 + pulse * .14;
      ctx.translate(bx + badgeW / 2, by + badgeH / 2);
      ctx.scale(grow, grow);
      ctx.translate(-(bx + badgeW / 2), -(by + badgeH / 2));
    }
    roundedPath(ctx, bx, by, badgeW, badgeH, r);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = Math.max(1.15, badgeH * .07);
    ctx.strokeStyle = selected ? 'rgba(255,232,132,.98)' : color;
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.globalAlpha = .55;
    roundedPath(ctx, bx + 2, by + 1.5, badgeW - 4, Math.max(2, badgeH * .24), r);
    ctx.fillStyle = 'rgba(255,246,191,.18)';
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = color;
    ctx.font = '900 ' + Math.max(10, Math.round(badgeH * .58)) + 'px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = glow;
    ctx.shadowBlur = 5;
    const hiddenFate = visual && visual.isHidden;
    if(hiddenFate){
      ctx.beginPath();
      ctx.lineWidth = Math.max(2.8, badgeH * .14);
      ctx.lineCap = 'round';
      ctx.strokeStyle = color;
      ctx.moveTo(bx + badgeW * .37, by + badgeH / 2 + 1);
      ctx.lineTo(bx + badgeW * .63, by + badgeH / 2 + 1);
      ctx.stroke();
    } else {
      ctx.fillText(fate, bx + badgeW / 2, by + badgeH / 2 + 1);
    }
    ctx.restore();

    if(pulse > 0){
      ctx.save();
      const ringPad = 2 + (1 - pulse) * 8;
      roundedPath(ctx, bx - ringPad, by - ringPad, badgeW + ringPad * 2, badgeH + ringPad * 2, r + ringPad);
      ctx.globalAlpha = Math.max(0, pulse * .65);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = color;
      ctx.shadowColor = glow;
      ctx.shadowBlur = 8;
      ctx.stroke();
      if(deltaText){
        ctx.globalAlpha = Math.max(0, pulse);
        ctx.fillStyle = color;
        ctx.font = '900 ' + Math.max(10, Math.round(badgeH * .45)) + 'px Cinzel, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(deltaText, bx + badgeW / 2, by - 5 - (1 - pulse) * 12);
      }
      ctx.restore();
    }
  }

  function drawCard(ctx, visual, card, rect, selected, options){
    const x = rect.x, y = rect.y, w = rect.w, h = rect.h;
    if(w <= 2 || h <= 2) return false;

    const radius = Math.max(3, Math.min(8, w * .045));

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.28)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;
    roundedPath(ctx, x, y, w, h, radius);
    ctx.fillStyle = '#070910';
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundedPath(ctx, x, y, w, h, radius);
    ctx.clip();
    const src = visual && (visual.runtimeImg || visual.img);
    const baseTexture = getBaseCardTexture((options && options.textureCard) || card, visual, rect);
    if(baseTexture && baseTexture.loaded && !baseTexture.failed && baseTexture.canvas) {
      ctx.drawImage(baseTexture.canvas, x, y, w, h);
    } else {
      const rec = getImage(src);
      const drawable = rec && (rec.bitmap || rec.img);
      if(rec && rec.loaded && !rec.failed && drawable) drawImageCover(ctx, drawable, x, y, w, h);
      else drawFallback(ctx, visual, x, y, w, h);

      const fade = ctx.createLinearGradient(x, y + h * .52, x, y + h);
      fade.addColorStop(0, 'rgba(0,0,0,0)');
      fade.addColorStop(1, 'rgba(0,0,0,.22)');
      ctx.fillStyle = fade;
      ctx.fillRect(x, y, w, h);
    }

    if(options && typeof options.viewerP === 'number' && card && card.owner !== options.viewerP){
      ctx.fillStyle = 'rgba(196,38,48,.24)';
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();

    drawTributeCue(ctx, rect, options && options.tributeState);
    drawFateBadge(ctx, visual, card, rect, false, options && options.fateAnim);

    if(card && card._markedForDeath){
      ctx.save();
      roundedPath(ctx, x, y, w, h, radius);
      ctx.fillStyle = 'rgba(80,0,0,.28)';
      ctx.fill();
      ctx.restore();
    }

    return true;
  }

  function getVisual(card, z, r, c, viewerP){
    try {
      if(typeof getCardVisualData === 'function') {
        return getCardVisualData(card, viewerP, {forceBoardHidden:true, boardPos:{z,r,c}});
      }
    } catch(e) {}
    return card ? {
      name: card.name,
      aff: card.aff,
      displayFate: card.currentFate || card.fate,
      runtimeImg: card.img,
      img: card.img
    } : null;
  }

  function countBoardCards(){
    let total = 0;
    try {
      if(typeof G === 'undefined' || !G || !G.board) return 0;
      G.board.forEach(function(zone){
        if(!zone) return;
        zone.forEach(function(row){
          if(!row) return;
          row.forEach(function(card){ if(card) total++; });
        });
      });
    } catch(e) {}
    return total;
  }

  function shouldAnimateCanvasFateBadges(){
    try {
      if(document.documentElement.classList.contains('fate-animations-off')) return false;
      if(typeof isEnhancedVisualFxEnabled === 'function') return isEnhancedVisualFxEnabled();
    } catch(e) {}
    return false;
  }

  function getFateAnim(card, fateValue){
    if(!card || !card.iid) return null;
    const key = String(card.iid);
    const nextFate = String(fateValue == null ? '' : fateValue);
    let rec = fateAnimByIid.get(key);
    if(!rec){
      rec = { fate: nextFate, changedAt: 0, delta: 0 };
      fateAnimByIid.set(key, rec);
      return rec;
    }
    if(rec.fate !== nextFate){
      const prevNum = Number(rec.fate);
      const nextNum = Number(nextFate);
      rec.delta = Number.isFinite(prevNum) && Number.isFinite(nextNum) ? nextNum - prevNum : 0;
      rec.fate = nextFate;
      rec.changedAt = shouldAnimateCanvasFateBadges() ? performance.now() : 0;
    }
    return rec;
  }

  function drawNow(source){
    const start = performance.now();
    const board = document.getElementById('board');
    if(!board || typeof G === 'undefined' || !G || !G.board) return;
    if(!canUseCanvas()){
      document.documentElement.classList.remove('fate-canvas-board-mode');
      document.documentElement.classList.remove('fate-render-v2-card-layer-mode');
      window.FATE_USE_CANVAS_BOARD = false;
      const canvas = document.getElementById('fate-board-canvas');
      if(canvas) {
        const ctx = canvas.getContext('2d');
        if(ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.style.display = 'none';
      }
      return;
    }
    document.documentElement.classList.add('fate-canvas-board-mode');
    window.FATE_USE_CANVAS_BOARD = true;
    const usingRenderV2Scene = shouldUseRenderV2Scene();
    document.documentElement.classList.toggle('fate-render-v2-card-layer-mode', usingRenderV2Scene);

    const cssW = Math.max(board.scrollWidth, board.clientWidth, 1);
    const cssH = Math.max(board.scrollHeight, board.clientHeight, 1);
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const pxW = Math.max(1, Math.round(cssW * dpr));
    const pxH = Math.max(1, Math.round(cssH * dpr));

    const viewerP = typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : 0;
    let layoutReadMs = 0;
    let expectedCards = 0;
    let cells = null;
    let boardRect = null;
    const now = performance.now();
    let canStartLayoutRetry = true;

    const canvas = ensureCanvas(board);
    const ctx = canvas.getContext('2d', { alpha:true });
    const backCtx = backBuffer.getContext('2d', { alpha:true });
    if(!ctx || !backCtx) return;

    if(canvas.width !== pxW || canvas.height !== pxH){
      canvas.width = pxW;
      canvas.height = pxH;
    }
    if(backBuffer.width !== pxW || backBuffer.height !== pxH){
      backBuffer.width = pxW;
      backBuffer.height = pxH;
    }
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';

    backCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    backCtx.clearRect(0, 0, cssW, cssH);

    if(usingRenderV2Scene){
      const sceneLayoutStart = performance.now();
      const snapshot = window.fateBuildRenderSnapshot();
      const layout = snapshot ? window.fateBuildMatchLayout({ snapshot }) : null;
      layoutReadMs = performance.now() - sceneLayoutStart;
      expectedCards = snapshot && snapshot.counts ? (Number(snapshot.counts.boardCards) || 0) : countBoardCards();
      const sceneResult = drawRenderV2Scene(backCtx, layout, snapshot, board);
      if(sceneResult){
        if(retainedFrame.width !== pxW || retainedFrame.height !== pxH){
          retainedFrame.width = pxW;
          retainedFrame.height = pxH;
        }
        const retCtx = retainedFrame.getContext('2d', {alpha:true});
        let retainCopyMs = 0;
        if(retCtx){
          const retainStart = performance.now();
          retCtx.setTransform(1,0,0,1,0,0);
          retCtx.clearRect(0,0,pxW,pxH);
          retCtx.drawImage(backBuffer,0,0);
          retainCopyMs = performance.now() - retainStart;
        }

        const visibleCopyStart = performance.now();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(backBuffer, 0, 0);
        const visibleCopyMs = performance.now() - visibleCopyStart;

        const pending = getPendingTextureCount();
        if(pending === 0) {
          document.documentElement.classList.add('fate-canvas-board-ready');
          if(document.body) document.body.classList.add('fate-canvas-board-ready');
        } else {
          document.documentElement.classList.remove('fate-canvas-board-ready');
          if(document.body) document.body.classList.remove('fate-canvas-board-ready');
        }
        lastReport = {
          draws: (lastReport.draws || 0) + 1,
          renderer:'render-v2-scene',
          cards:sceneResult.cards,
          expectedCards,
          domCardCells:null,
          zeroRectCards:0,
          imagesPending: pending,
          cacheSize: getTextureCacheSize(),
          textureCache:getTextureCacheReport(),
          canvas: { width: canvas.width, height: canvas.height, cssW, cssH, dpr },
          canvasPixels: canvas.width * canvas.height,
          skippedEmptyFrames:lastReport.skippedEmptyFrames || 0,
          scheduleRequests,
          skippedScheduleRequests,
          lastSource:source || lastScheduleSource || 'unknown',
          drawSources:Object.assign({}, drawSourceCounts),
          layoutReadMs:roundMs(layoutReadMs),
          cardLoopMs:lastSceneReport.cardLoopMs || 0,
          visibleCopyMs:roundMs(visibleCopyMs),
          retainCopyMs:roundMs(retainCopyMs),
          lastMs: roundMs(performance.now() - start),
          renderV2Scene:Object.assign({}, lastSceneReport)
        };
        if(sceneResult.animatingFate) scheduleDraw('fate-animation');
        return;
      }
    }

    const layoutStart = performance.now();
    boardRect = board.getBoundingClientRect();
    cells = board.querySelectorAll('.cell.has-card[data-z][data-r][data-c]');
    layoutReadMs = performance.now() - layoutStart;
    expectedCards = countBoardCards();
    if(expectedCards > cells.length && !layoutRetryUntil) layoutRetryUntil = now + LAYOUT_RETRY_MS;
    if((cells.length === 0 && lastReport.cards > 0) || (expectedCards > cells.length && now < layoutRetryUntil)){
      lastReport = Object.assign({}, lastReport, {
        skippedEmptyFrames:(lastReport.skippedEmptyFrames || 0) + 1,
        expectedCards,
        domCardCells: cells.length,
        lastMs:roundMs(performance.now() - start),
        lastSource:source || lastScheduleSource || 'unknown',
        layoutReadMs:roundMs(layoutReadMs),
        renderV2Scene:Object.assign({}, lastSceneReport)
      });
      requestAnimationFrame(function(){ scheduleDraw('layout-retry-empty'); });
      return;
    }
    if(layoutRetryUntil && now >= layoutRetryUntil) {
      layoutRetryUntil = 0;
      canStartLayoutRetry = false;
    }

    let cards = 0;
    let zeroRectCards = 0;
    let animatingFate = false;
    const animateFateBadges = shouldAnimateCanvasFateBadges();

    const cardLoopStart = performance.now();
    cells.forEach(function(cell){
      const z = Number(cell.dataset.z);
      const r = Number(cell.dataset.r);
      const c = Number(cell.dataset.c);
      const card = G.board && G.board[z] && G.board[z][r] ? G.board[z][r][c] : null;
      const bc = cell.querySelector('.bc');
      if(!card || !bc) return;
      const br = bc.getBoundingClientRect();
      if(br.width <= 1 || br.height <= 1){
        zeroRectCards++;
        return;
      }
      const rect = {
        x: br.left - boardRect.left + board.scrollLeft,
        y: br.top - boardRect.top + board.scrollTop,
        w: br.width,
        h: br.height
      };
      const selected = false;
      const tributeState = cell.classList.contains('placeable')
        ? 'placement'
        : cell.classList.contains('tribute-cell-ready') || bc.classList.contains('tribute-ready')
        ? 'ready'
        : cell.classList.contains('tribute-cell-selected') || bc.classList.contains('tribute-selected')
        ? 'selected'
        : (cell.classList.contains('tribute-cell-available') || bc.classList.contains('tribute-available') ? 'available' : '');
      const visual = getVisual(card, z, r, c, viewerP);
      const fateAnim = getFateAnim(card, visual && visual.displayFate);
      if(animateFateBadges && fateAnim && fateAnim.changedAt && performance.now() - fateAnim.changedAt < CANVAS_FATE_PULSE_MS) animatingFate = true;
      if(drawCard(backCtx, visual, card, rect, selected, { tributeState, fateAnim, viewerP })) cards++;
    });
    const cardLoopMs = performance.now() - cardLoopStart;

    const afterDrawNow = performance.now();
    if((zeroRectCards || expectedCards > cards) && !layoutRetryUntil && canStartLayoutRetry) layoutRetryUntil = afterDrawNow + LAYOUT_RETRY_MS;
    if((zeroRectCards || expectedCards > cards) && afterDrawNow < layoutRetryUntil){
      lastReport = Object.assign({}, lastReport, {
        skippedEmptyFrames:(lastReport.skippedEmptyFrames || 0) + 1,
        expectedCards,
        domCardCells: cells.length,
        zeroRectCards,
        cards,
        lastMs: roundMs(performance.now() - start),
        lastSource:source || lastScheduleSource || 'unknown',
        layoutReadMs:roundMs(layoutReadMs),
        cardLoopMs:roundMs(cardLoopMs)
      });
      requestAnimationFrame(function(){ scheduleDraw('layout-retry-zero-rect'); });
      return;
    }
    if(layoutRetryUntil && afterDrawNow >= layoutRetryUntil) layoutRetryUntil = 0;
    if(expectedCards > cards){
      window.FATE_RUNTIME_FORCE_DOM_BOARD = true;
      window.FATE_FORCE_DOM_BOARD_UNTIL = performance.now() + 3000;
      document.documentElement.classList.remove('fate-canvas-board-mode');
      document.documentElement.classList.remove('fate-canvas-board-ready');
      if(document.body) document.body.classList.remove('fate-canvas-board-ready');
      window.FATE_USE_CANVAS_BOARD = false;
      const canvas = document.getElementById('fate-board-canvas');
      if(canvas) canvas.style.display = 'none';
      if(typeof window.invalidateFateRenderCaches === 'function') window.invalidateFateRenderCaches();
      if(typeof window.renderBoard === 'function') setTimeout(window.renderBoard, 0);
      return;
    }

    if(retainedFrame.width !== pxW || retainedFrame.height !== pxH){
      retainedFrame.width = pxW;
      retainedFrame.height = pxH;
    }
    const retCtx = retainedFrame.getContext('2d', {alpha:true});
    let retainCopyMs = 0;
    if(retCtx){
      const retainStart = performance.now();
      retCtx.setTransform(1,0,0,1,0,0);
      retCtx.clearRect(0,0,pxW,pxH);
      retCtx.drawImage(backBuffer,0,0);
      retainCopyMs = performance.now() - retainStart;
    }

    const visibleCopyStart = performance.now();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(backBuffer, 0, 0);
    const visibleCopyMs = performance.now() - visibleCopyStart;

    const pending = getPendingTextureCount();
    if(pending === 0) {
      document.documentElement.classList.add('fate-canvas-board-ready');
      if(document.body) document.body.classList.add('fate-canvas-board-ready');
    } else {
      document.documentElement.classList.remove('fate-canvas-board-ready');
      if(document.body) document.body.classList.remove('fate-canvas-board-ready');
    }
    lastReport = {
      draws: (lastReport.draws || 0) + 1,
      renderer:'dom-canvas',
      cards,
      expectedCards,
      domCardCells: cells.length,
      zeroRectCards,
      imagesPending: pending,
      cacheSize: getTextureCacheSize(),
      textureCache:getTextureCacheReport(),
      canvas: { width: canvas.width, height: canvas.height, cssW, cssH, dpr },
      canvasPixels: canvas.width * canvas.height,
      skippedEmptyFrames:lastReport.skippedEmptyFrames || 0,
      scheduleRequests,
      skippedScheduleRequests,
      lastSource:source || lastScheduleSource || 'unknown',
      drawSources:Object.assign({}, drawSourceCounts),
      layoutReadMs:roundMs(layoutReadMs),
      cardLoopMs:roundMs(cardLoopMs),
      visibleCopyMs:roundMs(visibleCopyMs),
      retainCopyMs:roundMs(retainCopyMs),
      renderV2Scene:Object.assign({}, lastSceneReport),
      lastMs: roundMs(performance.now() - start)
    };
    if(animateFateBadges && animatingFate) scheduleDraw('fate-animation');
  }

  function installObservers(){
    const board = document.getElementById('board');
    if(board && !board.__fateCanvasBoardListeners){
      board.__fateCanvasBoardListeners = true;
      board.addEventListener('scroll', function(){ scheduleDraw('board-scroll'); }, {passive:true});
      if(window.ResizeObserver){
        const ro = new ResizeObserver(function(){ scheduleDraw('board-resize-observer'); });
        ro.observe(board);
        board.__fateCanvasBoardResizeObserver = ro;
      }
      if(window.MutationObserver){
        const mo = new MutationObserver(function(){ scheduleDraw('board-mutation-observer'); });
        mo.observe(board, {subtree:true, childList:true, attributes:true, attributeFilter:['class','data-z','data-r','data-c']});
        board.__fateCanvasBoardMutationObserver = mo;
      }
    }
  }

  window.fateCanvasPreseedFate = function(iid, baseFate){
    if(!iid) return;
    const key = String(iid);
    fateAnimByIid.set(key, { fate: String(baseFate == null ? '' : baseFate), changedAt: 0, delta: 0 });
  };
  window.fateCanvasBoardPauseDrawing = function(){
    boardRebuildInProgress = true;
    if(drawRaf){ cancelAnimationFrame(drawRaf); drawRaf = 0; }
    document.documentElement.classList.remove('fate-canvas-board-ready');
    if(document.body) document.body.classList.remove('fate-canvas-board-ready');
  };
  window.fateCanvasBoardResumeDrawing = function(){
    boardRebuildInProgress = false;
    scheduleDraw('resume-drawing');
  };
  window.fateRenderBoardCanvas = function(){
    boardRebuildInProgress = false;
    installObservers();
    scheduleDraw('renderBoard');
  };
  window.fatePreloadBoardCanvasImage = function(src){
    getImage(src);
  };
  window.fateCanvasBoardReport = function(){
    return Object.assign({}, lastReport, {
      enabled: canUseCanvas(),
      sourceCounts:Object.assign({}, drawSourceCounts),
      scheduleRequests,
      skippedScheduleRequests,
      renderV2Scene:Object.assign({}, lastSceneReport),
      textureCache:getTextureCacheReport(),
      domBoardFallbackUrl: location.pathname + location.search + (location.search ? '&' : '?') + 'domBoard=1'
    });
  };
  window.fateRenderV2SceneReport = function(){
    return Object.assign({}, lastSceneReport, {
      available:!!(lastSceneReport && lastSceneReport.enabled),
      mode:getRenderV2Mode() || 'snapshot',
      canvasBoardEnabled:canUseCanvas()
    });
  };
  window.fateDisableCanvasBoard = function(){
    try { localStorage.setItem('fateDisableCanvasBoard', '1'); } catch(e) {}
    location.reload();
  };
  window.fateEnableCanvasBoard = function(){
    try { localStorage.removeItem('fateDisableCanvasBoard'); } catch(e) {}
    try { localStorage.setItem('fateEnableCanvasBoard', '1'); } catch(e) {}
    location.reload();
  };

  window.addEventListener('resize', function(){ scheduleDraw('window-resize'); }, {passive:true});
  document.addEventListener('visibilitychange', function(){ if(!document.hidden) scheduleDraw('visibility-return'); }, {passive:true});
  document.addEventListener('DOMContentLoaded', function(){
    installObservers();
    scheduleDraw('startup');
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ scheduleDraw('fonts-ready'); }).catch(function(){});
  });
})();
