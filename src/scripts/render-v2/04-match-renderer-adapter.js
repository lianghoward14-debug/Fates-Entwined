(function(){
  'use strict';

  if(typeof window === 'undefined') return;
  if(window.FateMatchRendererAdapter) return;

  const ADAPTER_VERSION = 1;
  const canvasId = 'fate-match-v2-canvas';
  const hoverCanvasId = 'fate-match-v2-hover-canvas';
  let drawCount = 0;
  let lastReport = {available:false, reason:'not-rendered', version:ADAPTER_VERSION};
  let lastHitMap = {cards:[], cells:[]};
  let lastCardFateByIid = new Map();
  let lastCardRectByIid = new Map();
  let pendingPlacementRectByIid = new Map();
  let lastMoveSnapshotSignature = '';
  let input = null;
  let hoverHit = null;
  let redrawRaf = 0;
  let hoverRaf = 0;
  let lastCanvasMetrics = null;

  function nowMs(){
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function roundMs(value){
    return Math.round((Number(value) || 0) * 10) / 10;
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
    return localGet('fateEnableMatchRendererV2') === '1';
  }

  function enable(){
    localSet('fateEnableMatchRendererV2', '1');
    localSet('fateDisableMatchRendererV2', null);
    return report();
  }

  function disable(){
    localSet('fateEnableMatchRendererV2', null);
    localSet('fateDisableMatchRendererV2', '1');
    const gameScreen = document.getElementById('s-game');
    if(gameScreen) gameScreen.classList.remove('fate-renderer-v2');
    const board = document.getElementById('board');
    if(board) board.classList.remove('fate-match-v2-owned-board');
    document.documentElement.classList.remove('fate-match-renderer-v2-mode');
    return report();
  }

  function ensureCanvas(board){
    if(!board) return null;
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

    let canvas = document.getElementById(canvasId);
    if(!canvas){
      canvas = document.createElement('canvas');
      canvas.id = canvasId;
      canvas.setAttribute('aria-label', 'Fates Entwined match board');
    }
    let hoverCanvas = document.getElementById(hoverCanvasId);
    if(!hoverCanvas){
      hoverCanvas = document.createElement('canvas');
      hoverCanvas.id = hoverCanvasId;
      hoverCanvas.setAttribute('aria-hidden', 'true');
    }
    Array.from(board.children).forEach(function(child){
      if(child !== canvas && child !== hoverCanvas) child.remove();
    });
    if(canvas.parentNode !== board) board.appendChild(canvas);
    if(hoverCanvas.parentNode !== board) board.appendChild(hoverCanvas);

    board.style.position = 'relative';
    board.style.minHeight = 'min(70vh, 760px)';
    board.style.overflow = 'auto';
    canvas.style.position = 'relative';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.pointerEvents = 'auto';
    canvas.style.zIndex = '1';
    hoverCanvas.style.position = 'absolute';
    hoverCanvas.style.left = '0';
    hoverCanvas.style.top = '0';
    hoverCanvas.style.width = canvas.style.width;
    hoverCanvas.style.height = canvas.style.height;
    hoverCanvas.style.display = 'block';
    hoverCanvas.style.pointerEvents = 'none';
    hoverCanvas.style.zIndex = '3';
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

  function observeCardForAnimations(card, visual){
    const timeline = getTimeline();
    const iid = getCardIid(card);
    if(!timeline || !iid) return;
    const fateValue = getCardFateValue(card, visual);
    const prev = lastCardFateByIid.get(iid);
    if(prev != null && prev !== fateValue){
      const prevNum = Number(prev);
      const nextNum = Number(fateValue);
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
        delta:Number.isFinite(prevNum) && Number.isFinite(nextNum) ? nextNum - prevNum : 0
      });
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
    const color = ready ? 'rgba(105,190,255,.96)' : selected ? 'rgba(255,225,96,.96)' : placement ? 'rgba(255,215,86,.9)' : 'rgba(255,215,0,.68)';
    const fill = ready ? 'rgba(80,170,255,.07)' : selected ? 'rgba(255,215,0,.06)' : placement ? 'rgba(255,215,0,.04)' : 'rgba(255,215,0,.02)';
    const radius = Math.max(5, Math.min(10, r.w * .06));
    const outerPad = (selected || ready || placement) ? 2.6 : 1.6;
    ctx.save();
    roundedPath(ctx, r.x - outerPad, r.y - outerPad, r.w + outerPad * 2, r.h + outerPad * 2, radius + 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = ready ? 2.45 : (selected ? 2.35 : (placement ? 1.85 : 1.3));
    ctx.strokeStyle = color;
    ctx.stroke();
    if(selected || placement || ready){
      roundedPath(ctx, r.x + 2.5, r.y + 2.5, r.w - 5, r.h - 5, Math.max(4, radius - 1));
      ctx.strokeStyle = ready ? 'rgba(210,238,255,.5)' : 'rgba(255,246,190,.42)';
      ctx.lineWidth = ready ? 1.05 : .95;
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
      ctx.strokeStyle = 'rgba(218,190,255,.88)';
      ctx.lineWidth = Math.max(2, r.w * .028);
      ctx.beginPath();
      ctx.moveTo(cx - r.w * .16, cy - r.h * .11);
      ctx.lineTo(cx + r.w * .16, cy + r.h * .11);
      ctx.moveTo(cx + r.w * .16, cy - r.h * .11);
      ctx.lineTo(cx - r.w * .16, cy + r.h * .11);
      ctx.stroke();
      ctx.fillStyle = '#ddc7ff';
      ctx.font = '800 ' + Math.max(6, Math.round(r.w * .045)) + 'px Cinzel, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('NO CONSOLIDATE', cx, cy + r.h * .22);
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
    const ownerTint = zone.z === 0 ? 'rgba(20,42,66,.18)' : zone.z === 1 ? 'rgba(55,37,25,.16)' : 'rgba(24,52,43,.18)';
    const panelGrad = ctx.createLinearGradient(zoneRect.x, zoneRect.y, zoneRect.x, zoneRect.y + zoneRect.h);
    panelGrad.addColorStop(0, 'rgba(10,14,22,.62)');
    panelGrad.addColorStop(.42, ownerTint);
    panelGrad.addColorStop(1, 'rgba(6,8,14,.68)');

    roundedPath(ctx, zoneRect.x, zoneRect.y, zoneRect.w, zoneRect.h, 8);
    ctx.fillStyle = panelGrad;
    ctx.fill();
    const innerGlow = ctx.createLinearGradient(zoneRect.x, zoneRect.y, zoneRect.x + zoneRect.w, zoneRect.y + zoneRect.h);
    innerGlow.addColorStop(0, 'rgba(255,240,176,.045)');
    innerGlow.addColorStop(.55, 'rgba(255,255,255,0)');
    innerGlow.addColorStop(1, 'rgba(0,0,0,.16)');
    roundedPath(ctx, zoneRect.x + 2, zoneRect.y + 2, zoneRect.w - 4, zoneRect.h - 4, 6);
    ctx.fillStyle = innerGlow;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(220,188,82,.74)';
    ctx.stroke();

    ctx.save();
    ctx.globalAlpha = .18;
    ctx.strokeStyle = 'rgba(201,168,76,.44)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(zoneRect.x + 14, zoneRect.y + 38);
    ctx.lineTo(zoneRect.x + zoneRect.w - 14, zoneRect.y + 38);
    ctx.moveTo(zoneRect.x + 14, zoneRect.y + zoneRect.h - 14);
    ctx.lineTo(zoneRect.x + zoneRect.w - 14, zoneRect.y + zoneRect.h - 14);
    ctx.stroke();
    ctx.restore();
    drawCornerRails(ctx, zoneRect, 'rgba(221,190,84,.72)', .92);

    const badgeW = Math.min(136, Math.max(112, zoneRect.w * .30));
    const badgeX = headerRect.x + headerRect.w / 2 - badgeW / 2;
    const badgeH = 28;
    const badgeY = Math.max(2, headerRect.y - 15);
    roundedPath(ctx, badgeX, badgeY, badgeW, badgeH, 7);
    const badgeGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + badgeH);
    badgeGrad.addColorStop(0, 'rgba(12,13,10,.95)');
    badgeGrad.addColorStop(1, 'rgba(0,0,0,.86)');
    ctx.fillStyle = badgeGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,219,102,.68)';
    ctx.stroke();
    ctx.fillStyle = '#f2d778';
    ctx.font = '800 10px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ZONE ' + (zone.z + 1), headerRect.x + headerRect.w / 2, badgeY + badgeH / 2);

    const s0 = zoneScore(zone.z, 0);
    const s1 = zoneScore(zone.z, 1);
    const scoreW = Math.min(208, Math.max(168, zoneRect.w * .42));
    const scoreX = headerRect.x + headerRect.w / 2 - scoreW / 2;
    const scoreY = headerRect.y + 19;
    roundedPath(ctx, scoreX, scoreY, scoreW, 22, 11);
    ctx.fillStyle = 'rgba(2,4,10,.88)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,218,108,.32)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const leftScore = snapshot.viewer === 1 ? s1 : s0;
    const rightScore = snapshot.viewer === 1 ? s0 : s1;
    ctx.font = '900 14px system-ui, sans-serif';
    ctx.fillStyle = '#70bdff';
    ctx.fillText(String(leftScore), scoreX + 30, scoreY + 11);
    ctx.fillStyle = '#ff7182';
    ctx.fillText(String(rightScore), scoreX + scoreW - 30, scoreY + 11);
    ctx.fillStyle = 'rgba(231,206,118,.58)';
    ctx.font = '700 7px Cinzel, serif';
    ctx.fillText('vs', scoreX + scoreW / 2, scoreY + 8);
    ctx.fillStyle = 'rgba(231,206,118,.42)';
    ctx.fillRect(scoreX + 54, scoreY + 15, scoreW - 108, 1);
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

  function drawScene(ctx, layout, snapshot, cssW, cssH, dpr){
    const originX = Number(layout.boardRect && layout.boardRect.x) || 0;
    const originY = Number(layout.boardRect && layout.boardRect.y) || 0;
    const boardRect = rect(layout.boardRect, originX, originY);
    const hitMap = {cards:[], cells:[]};
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
          roundedPath(ctx, cr.x, cr.y, cr.w, cr.h, 4);
          ctx.fillStyle = row.owner === snapshot.viewer ? 'rgba(42,119,168,.070)' : row.owner < 0 ? 'rgba(136,126,70,.060)' : 'rgba(142,52,67,.070)';
          ctx.fill();
          drawCellHatch(ctx, cr, row.owner === snapshot.viewer ? 'rgba(122,189,243,.24)' : row.owner < 0 ? 'rgba(232,205,112,.20)' : 'rgba(238,132,142,.22)');
          ctx.lineWidth = 1;
          ctx.strokeStyle = cell.card ? 'rgba(255,232,141,.44)' : 'rgba(235,217,153,.24)';
          ctx.stroke();
          if(!cell.card){
            ctx.save();
            ctx.globalAlpha = .06;
            ctx.strokeStyle = 'rgba(255,255,255,.35)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cr.x + 12, cr.y + 12);
            ctx.lineTo(cr.x + cr.w - 12, cr.y + cr.h - 12);
            ctx.moveTo(cr.x + cr.w - 12, cr.y + 12);
            ctx.lineTo(cr.x + 12, cr.y + cr.h - 12);
            ctx.stroke();
            ctx.restore();
          }
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
      scheduleRender('texture-ready');
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
      observeCardForAnimations(entry.card, visual);
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
    lastHitMap = hitMap;
    return {cards, zones:zones.length, boardRect, hitMap};
  }

  function syncHoverCanvas(canvas, cssW, cssH, dpr){
    const hoverCanvas = document.getElementById(hoverCanvasId);
    if(!hoverCanvas || !canvas) return null;
    const pxW = Math.max(1, Math.round(cssW * dpr));
    const pxH = Math.max(1, Math.round(cssH * dpr));
    if(hoverCanvas.width !== pxW) hoverCanvas.width = pxW;
    if(hoverCanvas.height !== pxH) hoverCanvas.height = pxH;
    hoverCanvas.style.width = cssW + 'px';
    hoverCanvas.style.height = cssH + 'px';
    lastCanvasMetrics = {cssW, cssH, dpr};
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

  function drawHoverOverlay(){
    const metrics = lastCanvasMetrics;
    const hoverCanvas = document.getElementById(hoverCanvasId);
    const ctx = hoverCanvas && hoverCanvas.getContext ? hoverCanvas.getContext('2d', {alpha:true}) : null;
    if(!ctx || !metrics) return false;
    ctx.setTransform(metrics.dpr, 0, 0, metrics.dpr, 0, 0);
    ctx.clearRect(0, 0, metrics.cssW, metrics.cssH);
    drawHoverCue(ctx, hoverHit);
    return true;
  }

  function scheduleHoverDraw(){
    if(hoverRaf) return;
    hoverRaf = requestAnimationFrame(function(){
      hoverRaf = 0;
      drawHoverOverlay();
    });
  }

  function ensureInput(canvas){
    if(!canvas || !ownsBoard()) return;
    if(!window.FateMatchSceneInput) return;
    if(!input) input = new window.FateMatchSceneInput(window.FateMatchRendererAdapter);
    else if(typeof input.updateScene === 'function') input.updateScene(window.FateMatchRendererAdapter);
    input.attach(canvas);
  }

  function renderFromGameState(options){
    const started = nowMs();
    const board = document.getElementById('board');
    if(!board) return null;
    const canvas = ensureCanvas(board);
    const ctx = canvas && canvas.getContext ? canvas.getContext('2d', {alpha:true}) : null;
    if(!ctx) return null;

    const snapshot = typeof window.fateBuildRenderSnapshot === 'function' ? window.fateBuildRenderSnapshot() : null;
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
    const layout = typeof window.fateBuildMatchLayout === 'function'
      ? window.fateBuildMatchLayout({
        snapshot,
        viewport:{
          x:boardRect.left || 0,
          y:boardRect.top || 0,
          w:cssW,
          h:cssH,
          dpr:window.devicePixelRatio || 1,
          renderScale:1,
          windowW:window.innerWidth || cssW,
          windowH:window.innerHeight || viewportH
        }
      })
      : null;
    if(!layout) {
      lastReport = {available:false, reason:'layout-unavailable', version:ADAPTER_VERSION};
      return lastReport;
    }
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const pxW = Math.max(1, Math.round(cssW * dpr));
    const pxH = Math.max(1, Math.round(cssH * dpr));
    if(canvas.width !== pxW || canvas.height !== pxH){
      canvas.width = pxW;
      canvas.height = pxH;
    }
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    syncHoverCanvas(canvas, cssW, cssH, dpr);
    ensureInput(canvas);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const draw = drawScene(ctx, layout, snapshot, cssW, cssH, dpr);
    refreshHoverHitFromHitMap(draw.hitMap);
    drawHoverOverlay();
    drawCount++;
    const domCells = board.querySelectorAll('.cell').length;
    const domCards = board.querySelectorAll('.bc').length;
    lastReport = {
      available:true,
      version:ADAPTER_VERSION,
      ownsBoard:ownsBoard(),
      draws:drawCount,
      cards:draw.cards,
      expectedCards:snapshot.counts && snapshot.counts.boardCards || 0,
      zones:draw.zones,
      domCells,
      domCards,
      hitMap:{cards:lastHitMap.cards.length, cells:lastHitMap.cells.length},
      hover:hoverHit ? {kind:hoverHit.kind, z:hoverHit.z, r:hoverHit.r, c:hoverHit.c} : null,
      animations:getTimeline() && typeof getTimeline().report === 'function' ? getTimeline().report() : null,
      canvas:{width:canvas.width, height:canvas.height, cssW, cssH, dpr},
      snapshotSignature:snapshot.signature || '',
      layoutSignature:layout.snapshotSignature || '',
      lastMs:roundMs(nowMs() - started),
      source:options && options.source || ''
    };
    if(getTimeline() && getTimeline().hasActiveAnimations && getTimeline().hasActiveAnimations()) scheduleRender('animation');
    return lastReport;
  }

  function scheduleRender(source){
    if(redrawRaf) return;
    redrawRaf = requestAnimationFrame(function(){
      redrawRaf = 0;
      if(ownsBoard()) renderFromGameState({source:source || 'scheduled'});
    });
  }

  function report(){
    return Object.assign({
      available:true,
      version:ADAPTER_VERSION,
      ownsBoard:ownsBoard(),
      enableFlag:localGet('fateEnableMatchRendererV2') === '1',
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
    renderFromGameState,
    scheduleRender,
    getHitMap,
    setHoverHit,
    queuePlacementMotion,
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
})();
