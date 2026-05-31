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

  if(!canUseCanvas()){
    document.documentElement.classList.remove('fate-canvas-board-mode');
    window.FATE_USE_CANVAS_BOARD = false;
    return;
  }

  document.documentElement.classList.add('fate-canvas-board-mode');
  window.FATE_USE_CANVAS_BOARD = true;

  const imageCache = new Map();
  const fateAnimByIid = new Map();
  const LAYOUT_RETRY_MS = 900;
  const backBuffer = document.createElement('canvas');
  const retainedFrame = document.createElement('canvas');
  let drawRaf = 0;
  let lastReport = { draws:0, cards:0, imagesPending:0, lastMs:0, skippedEmptyFrames:0 };
  let layoutRetryUntil = 0;
  let boardRebuildInProgress = false;

  function scheduleDraw(){
    if(drawRaf || boardRebuildInProgress) return;
    drawRaf = requestAnimationFrame(function(){
      drawRaf = 0;
      if(boardRebuildInProgress) return;
      drawNow();
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
    const key = String(src);
    let rec = imageCache.get(key);
    if(rec) {
      if(!rec.loaded && !rec.failed && rec.img.complete && (rec.img.naturalWidth || rec.img.width)) {
        rec.loaded = true;
      }
      return rec;
    }
    const img = new Image();
    rec = { img, loaded:false, failed:false };
    imageCache.set(key, rec);
    img.decoding = 'async';
    img.loading = 'eager';
    try { img.fetchPriority = 'high'; } catch(e) {}
    img.onload = function(){ rec.loaded = true; scheduleDraw(); };
    img.onerror = function(){ rec.failed = true; scheduleDraw(); };
    img.src = key;
    if(img.complete && (img.naturalWidth || img.width)) rec.loaded = true;
    return rec;
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
      if(elapsed >= 0 && elapsed < 1100) {
        pulse = 1 - (elapsed / 1100);
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
    const rec = getImage(src);
    if(rec && rec.loaded && !rec.failed) drawImageCover(ctx, rec.img, x, y, w, h);
    else drawFallback(ctx, visual, x, y, w, h);

    const fade = ctx.createLinearGradient(x, y + h * .52, x, y + h);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,.22)');
    ctx.fillStyle = fade;
    ctx.fillRect(x, y, w, h);

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
      rec.changedAt = performance.now();
    }
    return rec;
  }

  function drawNow(){
    const start = performance.now();
    const board = document.getElementById('board');
    if(!board || typeof G === 'undefined' || !G || !G.board) return;
    if(!canUseCanvas()){
      document.documentElement.classList.remove('fate-canvas-board-mode');
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

    const cssW = Math.max(board.scrollWidth, board.clientWidth, 1);
    const cssH = Math.max(board.scrollHeight, board.clientHeight, 1);
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const pxW = Math.max(1, Math.round(cssW * dpr));
    const pxH = Math.max(1, Math.round(cssH * dpr));

    const boardRect = board.getBoundingClientRect();
    const viewerP = typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : 0;
    const cells = board.querySelectorAll('.cell.has-card[data-z][data-r][data-c]');
    const expectedCards = countBoardCards();
    const now = performance.now();
    let canStartLayoutRetry = true;
    if(expectedCards > cells.length && !layoutRetryUntil) layoutRetryUntil = now + LAYOUT_RETRY_MS;
    if((cells.length === 0 && lastReport.cards > 0) || (expectedCards > cells.length && now < layoutRetryUntil)){
      lastReport = Object.assign({}, lastReport, {
        skippedEmptyFrames:(lastReport.skippedEmptyFrames || 0) + 1,
        expectedCards,
        domCardCells: cells.length,
        lastMs:Math.round((performance.now() - start) * 10) / 10
      });
      requestAnimationFrame(scheduleDraw);
      return;
    }
    if(layoutRetryUntil && now >= layoutRetryUntil) {
      layoutRetryUntil = 0;
      canStartLayoutRetry = false;
    }

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

    let cards = 0;
    let zeroRectCards = 0;
    let animatingFate = false;

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
      if(fateAnim && fateAnim.changedAt && performance.now() - fateAnim.changedAt < 1100) animatingFate = true;
      if(drawCard(backCtx, visual, card, rect, selected, { tributeState, fateAnim, viewerP })) cards++;
    });

    const afterDrawNow = performance.now();
    if((zeroRectCards || expectedCards > cards) && !layoutRetryUntil && canStartLayoutRetry) layoutRetryUntil = afterDrawNow + LAYOUT_RETRY_MS;
    if((zeroRectCards || expectedCards > cards) && afterDrawNow < layoutRetryUntil){
      lastReport = Object.assign({}, lastReport, {
        skippedEmptyFrames:(lastReport.skippedEmptyFrames || 0) + 1,
        expectedCards,
        domCardCells: cells.length,
        zeroRectCards,
        cards,
        lastMs: Math.round((performance.now() - start) * 10) / 10
      });
      requestAnimationFrame(scheduleDraw);
      return;
    }
    if(layoutRetryUntil && afterDrawNow >= layoutRetryUntil) layoutRetryUntil = 0;
    if(expectedCards > cards){
      window.FATE_RUNTIME_FORCE_DOM_BOARD = true;
      window.FATE_FORCE_DOM_BOARD_UNTIL = performance.now() + 3000;
      document.documentElement.classList.remove('fate-canvas-board-mode');
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
    if(retCtx){
      retCtx.setTransform(1,0,0,1,0,0);
      retCtx.clearRect(0,0,pxW,pxH);
      retCtx.drawImage(backBuffer,0,0);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(backBuffer, 0, 0);

    let pending = 0;
    imageCache.forEach(function(rec){ if(!rec.loaded && !rec.failed) pending++; });
    lastReport = {
      draws: (lastReport.draws || 0) + 1,
      cards,
      expectedCards,
      domCardCells: cells.length,
      zeroRectCards,
      imagesPending: pending,
      cacheSize: imageCache.size,
      canvas: { width: canvas.width, height: canvas.height, cssW, cssH, dpr },
      skippedEmptyFrames:lastReport.skippedEmptyFrames || 0,
      lastMs: Math.round((performance.now() - start) * 10) / 10
    };
    if(animatingFate) scheduleDraw();
  }

  function installObservers(){
    const board = document.getElementById('board');
    if(board && !board.__fateCanvasBoardListeners){
      board.__fateCanvasBoardListeners = true;
      board.addEventListener('scroll', scheduleDraw, {passive:true});
      if(window.ResizeObserver){
        const ro = new ResizeObserver(scheduleDraw);
        ro.observe(board);
        board.__fateCanvasBoardResizeObserver = ro;
      }
      if(window.MutationObserver){
        const mo = new MutationObserver(scheduleDraw);
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
  };
  window.fateCanvasBoardResumeDrawing = function(){
    boardRebuildInProgress = false;
    scheduleDraw();
  };
  window.fateRenderBoardCanvas = function(){
    boardRebuildInProgress = false;
    installObservers();
    scheduleDraw();
  };
  window.fatePreloadBoardCanvasImage = function(src){
    getImage(src);
  };
  window.fateCanvasBoardReport = function(){
    return Object.assign({}, lastReport, {
      enabled: canUseCanvas(),
      domBoardFallbackUrl: location.pathname + location.search + (location.search ? '&' : '?') + 'domBoard=1'
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

  window.addEventListener('resize', scheduleDraw, {passive:true});
  document.addEventListener('visibilitychange', function(){ if(!document.hidden) scheduleDraw(); }, {passive:true});
  document.addEventListener('DOMContentLoaded', function(){
    installObservers();
    scheduleDraw();
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleDraw).catch(function(){});
  });
})();
