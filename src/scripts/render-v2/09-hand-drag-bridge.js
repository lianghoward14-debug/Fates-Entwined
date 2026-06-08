(function(){
  'use strict';

  if(typeof window === 'undefined') return;
  if(window.FateMatchHandDragBridge) return;

  const BRIDGE_VERSION = 1;
  const DRAG_THRESHOLD = 10;
  let state = null;
  let blockClickUntil = 0;
  let pendingHover = null;
  let hoverRaf = 0;
  let moveRaf = 0;
  const DROP_PREVIEW_INTERVAL_MS = 42;
  const DROP_PREVIEW_MIN_DELTA = 12;

  function adapter(){
    return window.FateMatchRendererAdapter || null;
  }

  function ownsBoard(){
    const scene = adapter();
    return !!(scene && typeof scene.ownsBoard === 'function' && scene.ownsBoard());
  }

  function activeGame(){
    const gs = document.getElementById('s-game');
    return !!(gs && gs.classList.contains('active'));
  }

  function clamp(value, min, max){
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function handIndex(el){
    const hand = document.getElementById('hand-cards');
    return hand ? Array.prototype.indexOf.call(hand.children, el) : -1;
  }

  function currentHandCard(idx){
    if(typeof G === 'undefined' || !G || !G.players) return null;
    const cp = typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : G.currentPlayer;
    const p = G.players[cp];
    return p && p.hand ? p.hand[idx] : null;
  }

  function isFreeSetCard(card){
    if(!card || typeof G === 'undefined' || !G) return false;
    if(G._linaFreeIids && G._linaFreeIids.has(card.iid)) return true;
    try {
      if(card.type !== 'Supporter' && Number(card.cost) > 0 && typeof getDisplayedCardCost === 'function') {
        return Number(getDisplayedCardCost(card)) <= 0;
      }
    } catch(e) {}
    return false;
  }

  function displayedCost(card){
    if(!card) return 0;
    if(isFreeSetCard(card)) return 0;
    try {
      if(typeof getDisplayedCardCost === 'function') return Number(getDisplayedCardCost(card)) || 0;
    } catch(e) {}
    return Number(card.cost) || 0;
  }

  function availableReinforcementFor(card){
    if(!card || card.type === 'Supporter' || typeof G === 'undefined' || !G || !G.board) return Infinity;
    if(G._linaFreeIids && G._linaFreeIids.has(card.iid)) return Infinity;
    const cp = G.currentPlayer;
    let total = 0;
    try {
      G.board.forEach(function(zone, z){
        (zone || []).forEach(function(row, r){
          (row || []).forEach(function(cell, c){
            if(!cell || cell.owner !== cp || cell.noConsolidate) return;
            if(typeof canUseAsConsolidationTribute === 'function' && !canUseAsConsolidationTribute(cell, cp)) return;
            if(cell.type === 'Supporter'){
              let value = 1;
              try {
                value = typeof getSupportReinforcementValue === 'function' ? getSupportReinforcementValue(cell) : (Number(cell.reinforcement) || 1);
              } catch(e) {}
              try {
                if(typeof countFriendlyRalphAdjacency === 'function') value += countFriendlyRalphAdjacency(z, r, c, cp);
              } catch(e) {}
              total += Number(value) || 1;
            }
          });
        });
      });
    } catch(e) {}
    return total;
  }

  function hasEnoughReinforcement(card){
    const cost = displayedCost(card);
    return cost <= 0 || availableReinforcementFor(card) >= cost;
  }

  function canStartDrag(ev, cardEl, idx, card){
    if(!ownsBoard() || !activeGame()) return false;
    if(!ev || ev.button !== 0) return false;
    if(cardEl && cardEl.classList && cardEl.classList.contains('dim') && !isFreeSetCard(card)) return false;
    if(typeof G === 'undefined' || !G || G.phase !== 'main') return false;
    if(G._isSpectator) return false;
    const cp = typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : G.currentPlayer;
    if(cp !== G.currentPlayer) return false;
    if(G.aiEnabled && (G.currentPlayer === G.aiPlayer || G._aiRunning)) return false;
    if(G._boardTargeting || G._wolfCreekMoving || G._expMoving || G._berkeleyMoving || G._bh01Moving || G._busserMoving || G._busserMovingCard || G._markSelecting) return false;
    return idx >= 0 && !!card;
  }

  function viewportHandHitFromPoint(clientX, clientY){
    const scene = adapter();
    const map = scene && typeof scene.getHitMap === 'function' ? scene.getHitMap() : null;
    const handCards = map && Array.isArray(map.handCards) ? map.handCards : [];
    for(let i = handCards.length - 1; i >= 0; i--){
      const hit = handCards[i];
      const r = hit && hit.rect;
      if(r && clientX >= r.x && clientX <= r.x + r.w && clientY >= r.y && clientY <= r.y + r.h) return hit;
    }
    return null;
  }

  function boardPointFromClient(clientX, clientY){
    const cached = state && state.boardCache;
    const canvas = cached && cached.canvas ? cached.canvas : document.getElementById('fate-match-v2-canvas');
    const r = cached && cached.rect ? cached.rect : (canvas && canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null);
    if(!canvas || !r || !r.width || !r.height) return null;
    const cssW = cached && cached.cssW ? cached.cssW : (canvas.__fateCssW || canvas.clientWidth || r.width || 1);
    const cssH = cached && cached.cssH ? cached.cssH : (canvas.__fateCssH || canvas.clientHeight || r.height || 1);
    return {
      x:(clientX - r.left) * (cssW / Math.max(1, r.width)),
      y:(clientY - r.top) * (cssH / Math.max(1, r.height)),
      canvasRect:r,
      cssW,
      cssH
    };
  }

  function handRectInBoardSpace(el){
    const canvas = document.getElementById('fate-match-v2-canvas');
    if(!canvas || !el || !el.getBoundingClientRect || !canvas.getBoundingClientRect) return null;
    const er = el.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    const sx = (canvas.__fateCssW || canvas.clientWidth || cr.width || 1) / Math.max(1, cr.width || 1);
    const sy = (canvas.__fateCssH || canvas.clientHeight || cr.height || 1) / Math.max(1, cr.height || 1);
    return {
      x:(er.left - cr.left) * sx,
      y:(er.top - cr.top) * sy,
      w:er.width * sx,
      h:er.height * sy
    };
  }

  function viewportRectInBoardSpace(vr){
    const canvas = document.getElementById('fate-match-v2-canvas');
    if(!canvas || !vr || !canvas.getBoundingClientRect) return null;
    const cr = canvas.getBoundingClientRect();
    const sx = (canvas.__fateCssW || canvas.clientWidth || cr.width || 1) / Math.max(1, cr.width || 1);
    const sy = (canvas.__fateCssH || canvas.clientHeight || cr.height || 1) / Math.max(1, cr.height || 1);
    return {
      x:(vr.x - cr.left) * sx,
      y:(vr.y - cr.top) * sy,
      w:vr.w * sx,
      h:vr.h * sy
    };
  }

  function hitFromPoint(clientX, clientY){
    const scene = adapter();
    const p = boardPointFromClient(clientX, clientY);
    const map = state && state.hitMap ? state.hitMap : (scene && typeof scene.getHitMap === 'function' ? scene.getHitMap() : null);
    if(!p || !map) return null;
    const cells = Array.isArray(map.cells) ? map.cells : [];
    const cards = Array.isArray(map.cards) ? map.cards : [];
    for(let i = cards.length - 1; i >= 0; i--){
      const hit = cards[i];
      const r = hit && hit.rect;
      if(r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return Object.assign({kind:'card'}, hit);
    }
    for(let j = cells.length - 1; j >= 0; j--){
      const hit = cells[j];
      const r = hit && hit.rect;
      if(r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return Object.assign({kind:'cell'}, hit);
    }
    return null;
  }

  function boardCardAt(hit){
    if(!hit || typeof G === 'undefined' || !G || !G.board) return null;
    return G.board[hit.z] && G.board[hit.z][hit.r] ? G.board[hit.z][hit.r][hit.c] : null;
  }

  function hitDropState(card, hit){
    if(!card || !hit) return 'invalid';
    const boardCard = boardCardAt(hit);
    if(isFreeSetCard(card)) return boardCard ? 'invalid' : 'valid';
    if(card.type === 'Supporter') return boardCard ? 'invalid' : 'valid';
    if(state && state.card === card && state.canPayReinforcement === false) return 'invalid';
    if(!(state && state.card === card) && !hasEnoughReinforcement(card)) return 'invalid';
    return boardCard && boardCard.owner === G.currentPlayer && boardCard.type === 'Supporter' && !boardCard.noConsolidate ? 'valid' : 'invalid';
  }

  function setSceneHover(hit, dragState){
    pendingHover = hit ? Object.assign({}, hit, {dragState:dragState || 'valid'}) : null;
    if(hoverRaf) return;
    hoverRaf = requestAnimationFrame(function(){
      hoverRaf = 0;
      const scene = adapter();
      if(!scene || typeof scene.setHoverHit !== 'function') return;
      scene.setHoverHit(pendingHover);
    });
  }

  function drawCanvasGhost(canvas, el, card){
    if(!canvas) return;
    const w = Math.max(1, Math.round(Number(canvas.__cssW) || canvas.width || 120));
    const h = Math.max(1, Math.round(Number(canvas.__cssH) || canvas.height || 170));
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    if(canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
    if(canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext && canvas.getContext('2d');
    if(!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.fillStyle = 'rgba(5,7,12,.04)';
    ctx.strokeStyle = 'rgba(255,225,120,.62)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const radius = Math.max(6, Math.min(10, w * .055));
    ctx.roundRect ? ctx.roundRect(0.5, 0.5, w - 1, h - 1, radius) : ctx.rect(0.5, 0.5, w - 1, h - 1);
    ctx.fill();
    ctx.stroke();
    ctx.clip();
    const visual = card && (card.visual || card);
    const texture = window.FateCardTextureCache && typeof window.FateCardTextureCache.getBaseCardTexture === 'function'
      ? window.FateCardTextureCache.getBaseCardTexture(card, {w, h}, {
        visual,
        dpr:2,
        preferFullArt:true,
        onChange:function(){ if(canvas.isConnected) drawCanvasGhost(canvas, el, card); }
      })
      : null;
    if(texture && texture.loaded && texture.canvas){
      try {
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(texture.canvas, 0, 0, w, h);
        ctx.restore();
        return;
      } catch(e) {}
    }
    const imgEl = el && el.querySelector ? el.querySelector('.bc-art img') : null;
    let src = imgEl && (imgEl.currentSrc || imgEl.src);
    if(!src && card) {
      src = (visual && (visual.runtimeImg || visual.img)) || card.runtimeImg || card.img || '';
      try {
        if(src && typeof getRuntimeCardImageSrc === 'function') src = getRuntimeCardImageSrc(src, 'hand');
      } catch(e) {}
    }
    function drawImage(img){
      try {
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
      } catch(e) {}
      drawFate();
    }
    function drawFate(){
      const fateText = String((el && el.querySelector && el.querySelector('.bc-fate') && el.querySelector('.bc-fate').textContent) || (visual && visual.displayFate) || (card && (card.currentFate || card.fate)) || '');
      if(fateText){
        const current = Number((visual && visual.currentFate != null) ? visual.currentFate : (card && card.currentFate != null ? card.currentFate : fateText));
        const base = Number((visual && visual.fate != null) ? visual.fate : (card && card.fate != null ? card.fate : fateText));
        const up = Number.isFinite(current) && Number.isFinite(base) && current > base;
        const down = Number.isFinite(current) && Number.isFinite(base) && current < base;
        const accent = up ? '#7fff90' : down ? '#ff6060' : '#f1c40f';
        const glow = up ? 'rgba(127,255,144,.70)' : down ? 'rgba(255,96,96,.66)' : 'rgba(241,196,15,.64)';
        const bh = Math.max(24, Math.min(34, w * .215));
        const bw = Math.max(bh, Math.min(43, bh + Math.max(0, fateText.length - 1) * 5.4));
        const bx = w - bw - Math.max(1, bh * .04);
        const by = Math.max(1, bh * .035);
        const cx = bx + bw / 2;
        const cy = by + bh / 2;
        ctx.save();
        ctx.beginPath();
        if(ctx.roundRect) ctx.roundRect(bx, by, bw, bh, bh / 2);
        else ctx.rect(bx, by, bw, bh);
        ctx.shadowColor = glow;
        ctx.shadowBlur = Math.max(4, bh * .18);
        ctx.fillStyle = 'rgba(5,6,10,.96)';
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = accent;
        ctx.lineWidth = Math.max(2.1, bh * .085);
        ctx.stroke();
        ctx.fillStyle = accent;
        ctx.font = '950 ' + Math.max(15, Math.round(fateText.length > 1 ? bh * .60 : bh * .72)) + 'px Cinzel, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = glow;
        ctx.shadowBlur = Math.max(7, bh * .28);
        ctx.fillText(fateText, cx, cy + bh * .11);
        ctx.shadowColor = 'rgba(0,0,0,.85)';
        ctx.shadowBlur = 1.5;
        ctx.fillText(fateText, cx, cy + bh * .11);
        ctx.restore();
      }
    }
    if(imgEl && imgEl.complete && imgEl.naturalWidth) {
      drawImage(imgEl);
    } else if(src) {
      const img = new Image();
      img.onload = function(){ if(canvas.isConnected) drawImage(img); };
      img.src = src;
      drawFate();
    } else {
      ctx.fillStyle = 'rgba(8,12,20,.96)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,.72)';
      ctx.font = '900 ' + Math.round(w * .18) + 'px Cinzel, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((visual && visual.name ? String(visual.name).slice(0, 1) : 'F'), w / 2, h / 2);
      drawFate();
    }
    ctx.restore();
  }

  function makeGhost(el, ev){
    clearGhost();
    const r = state && state.sourceBoardRect ? Object.assign({}, state.sourceBoardRect) : null;
    const p = boardPointFromClient(ev.clientX, ev.clientY);
    const cellRect = state && state.hitMap && Array.isArray(state.hitMap.cells)
      ? state.hitMap.cells.map(h => h && (h.cardRect || h.visualRect || h.rect)).find(cr => cr && cr.w > 0 && cr.h > 0)
      : null;
    const ghostW = cellRect ? cellRect.w : (r ? r.w * 1.55 : 146);
    const ghostH = cellRect ? cellRect.h : (r ? r.h * 1.55 : 204);
    const ghost = {canvasOwned:true};
    if(state){
      const gripXPct = p && r ? clamp((p.x - r.x) / Math.max(1, r.w), .16, .84) : .5;
      const gripYPct = p && r ? clamp((p.y - r.y) / Math.max(1, r.h), .16, .84) : .5;
      state.gripX = ghostW * gripXPct;
      state.gripY = ghostH * gripYPct;
      state.ghostW = ghostW;
      state.ghostH = ghostH;
    }
    if(window.FateVfxDirector && typeof window.FateVfxDirector.setDragPreview === 'function'){
      window.FateVfxDirector.setDragPreview({card:state && state.card, rect:r ? {x:r.x, y:r.y, w:ghostW, h:ghostH} : r, invalid:false, scale:1});
    }
    moveGhost(ghost, ev.clientX, ev.clientY, 0);
    return ghost;
  }

  function buildDragCache(){
    const canvas = document.getElementById('fate-match-v2-canvas');
    const rect = canvas && canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    const scene = adapter();
    return {
      canvas,
      rect,
      cssW:canvas ? (canvas.__fateCssW || canvas.clientWidth || (rect && rect.width) || 1) : 1,
      cssH:canvas ? (canvas.__fateCssH || canvas.clientHeight || (rect && rect.height) || 1) : 1,
      hitMap:scene && typeof scene.getHitMap === 'function' ? scene.getHitMap() : null
    };
  }

  function moveGhost(ghost, x, y, progress){
    if(!ghost) return;
    const w = state && state.ghostW ? state.ghostW : 120;
    const h = state && state.ghostH ? state.ghostH : 170;
    const lift = Math.min(1, Math.max(0, Number(progress) || 0));
    const gx = state && Number.isFinite(state.gripX) ? state.gripX : w / 2;
    const gy = state && Number.isFinite(state.gripY) ? state.gripY : h / 2;
    const p = boardPointFromClient(x, y);
    if(!p) return;
    if(window.FateVfxDirector && typeof window.FateVfxDirector.updateDragPreview === 'function'){
      window.FateVfxDirector.updateDragPreview({
        card:state && state.card,
        rect:{x:p.x - gx, y:p.y - gy - lift * 8, w, h}
      });
    }
  }

  function clearGhost(){
    if(window.FateVfxDirector && typeof window.FateVfxDirector.clearDragPreview === 'function') window.FateVfxDirector.clearDragPreview();
  }

  function cleanup(options){
    const opts = options || {};
    if(state && state.el) state.el.classList.remove('fate-v2-drag-source');
    clearGhost();
    if(hoverRaf) {
      cancelAnimationFrame(hoverRaf);
      hoverRaf = 0;
    }
    if(moveRaf) {
      cancelAnimationFrame(moveRaf);
      moveRaf = 0;
    }
    pendingHover = null;
    setSceneHover(null);
    document.body.classList.remove('fate-v2-dragging-card');
    if(opts.clearPlacement && typeof G !== 'undefined' && G){
      G.selectedHandCard = null;
      G.placing = false;
      if(typeof clearPlaceHighlights === 'function') clearPlaceHighlights();
      if(typeof renderHand === 'function') renderHand();
    }
    state = null;
  }

  function updateDropPreview(x, y, force){
    if(!state || !state.dragging) return null;
    const now = (window.performance && performance.now) ? performance.now() : Date.now();
    const lx = Number(state.lastPreviewX);
    const ly = Number(state.lastPreviewY);
    const movedEnough = !Number.isFinite(lx) || !Number.isFinite(ly)
      || Math.abs(x - lx) >= DROP_PREVIEW_MIN_DELTA
      || Math.abs(y - ly) >= DROP_PREVIEW_MIN_DELTA;
    if(!force && now - (Number(state.lastPreviewAt) || 0) < DROP_PREVIEW_INTERVAL_MS) {
      return state.lastDropPreview || null;
    }
    if(!force && !movedEnough) {
      return state.lastDropPreview || null;
    }
    state.lastPreviewAt = now;
    state.lastPreviewX = x;
    state.lastPreviewY = y;
    const hit = hitFromPoint(x, y);
    const dragState = hitDropState(state.card, hit);
    state.lastDropPreview = {hit, dragState};
    setSceneHover(hit, dragState);
    if(state.ghost && state.lastInvalidDrop !== (dragState === 'invalid')){
      state.lastInvalidDrop = dragState === 'invalid';
      if(window.FateVfxDirector && typeof window.FateVfxDirector.updateDragPreview === 'function'){
        window.FateVfxDirector.updateDragPreview({invalid:state.lastInvalidDrop});
      }
    }
    return state.lastDropPreview;
  }

  function scheduleDragFrame(clientX, clientY, dist){
    if(!state || !state.dragging) return;
    state.pendingX = clientX;
    state.pendingY = clientY;
    state.pendingDist = dist;
    if(moveRaf) return;
    moveRaf = requestAnimationFrame(function(){
      moveRaf = 0;
      if(!state || !state.dragging) return;
      const x = state.pendingX;
      const y = state.pendingY;
      const d = state.pendingDist || 0;
      moveGhost(state.ghost, x, y, Math.min(1, d / 120));
      updateDropPreview(x, y, false);
    });
  }

  function beginDrag(ev){
    if(!state || state.dragging) return;
    state.dragging = true;
    const cache = buildDragCache();
    state.boardCache = cache;
    state.hitMap = cache.hitMap;
    state.canPayReinforcement = state.card && state.card.type !== 'Supporter' ? hasEnoughReinforcement(state.card) : true;
    state.ghost = makeGhost(state.el, ev);
    if(state.el) state.el.classList.add('fate-v2-drag-source');
    document.body.classList.add('fate-v2-dragging-card');
    if(typeof playSfx === 'function') playSfx('dragStart');
    G.selectedHandCard = state.idx;
    G.placing = true;
    if(typeof clearPlaceHighlights === 'function') clearPlaceHighlights();
  }

  function onPointerDown(ev){
    if(Date.now() < blockClickUntil) return;
    const handHit = viewportHandHitFromPoint(ev.clientX, ev.clientY);
    if(!handHit) return;
    const el = null;
    const idx = Number(handHit.index);
    const card = currentHandCard(idx);
    if(handHit && handHit.disabled && !isFreeSetCard(card)) return;
    if(!canStartDrag(ev, el, idx, card)) return;
    state = {
      el,
      idx,
      card,
      sx:ev.clientX,
      sy:ev.clientY,
      dragging:false,
      ghost:null,
      sourceViewportRect:handHit && handHit.rect ? Object.assign({}, handHit.rect) : null,
      sourceBoardRect:handHit && handHit.rect ? viewportRectInBoardSpace(handHit.rect) : null
    };
  }

  function onPointerMove(ev){
    if(!state) return;
    if(typeof ev.buttons === 'number' && (ev.buttons & 1) === 0){ cleanup({clearPlacement:true}); return; }
    const dx = ev.clientX - state.sx;
    const dy = ev.clientY - state.sy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if(!state.dragging){
      if(dist < DRAG_THRESHOLD) return;
      beginDrag(ev);
    }
    if(!state || !state.dragging) return;
    ev.preventDefault();
    scheduleDragFrame(ev.clientX, ev.clientY, dist);
  }

  function finishSupporterDrop(hit){
    const iid = state.card && state.card.iid;
    const from = state.sourceBoardRect || handRectInBoardSpace(state.el);
    const idx = state.idx;
    const scene = adapter();
    cleanup({clearPlacement:false});
    G.selectedHandCard = idx;
    G.placing = true;
    if(scene && typeof scene.queuePlacementMotion === 'function') scene.queuePlacementMotion(iid, from);
    if(typeof playSfx === 'function') playSfx('dragDrop');
    if(typeof clickCell === 'function') clickCell(Number(hit.z), Number(hit.r), Number(hit.c));
  }

  function finishConsolidationDrop(hit){
    const target = boardCardAt(hit);
    const idx = state.idx;
    cleanup({clearPlacement:false});
    G.selectedHandCard = idx;
    G.placing = false;
    if(typeof clearPlaceHighlights === 'function') clearPlaceHighlights();
    if(typeof playSfx === 'function') playSfx('dragDrop');
    if(typeof initiateConsolidate === 'function') initiateConsolidate();
    if(target && typeof handleConsolidateClick === 'function'){
      setTimeout(function(){ handleConsolidateClick(Number(hit.z), Number(hit.r), Number(hit.c)); }, 20);
    }
  }

  function onPointerUp(ev){
    if(!state) return;
    if(!state.dragging){ cleanup(); return; }
    ev.preventDefault();
    ev.stopPropagation();
    if(ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    blockClickUntil = Date.now() + 260;
    const preview = updateDropPreview(ev.clientX, ev.clientY, true);
    const hit = preview ? preview.hit : hitFromPoint(ev.clientX, ev.clientY);
    const dragState = preview ? preview.dragState : hitDropState(state.card, hit);
    if(!hit || dragState === 'invalid'){
      if(typeof toast === 'function') {
        if(state.card && state.card.type !== 'Supporter' && !hasEnoughReinforcement(state.card)){
          toast('Not enough reinforcement to consolidate ' + (state.card.name || 'that card') + '.');
        } else {
          toast(state.card && state.card.type === 'Supporter' ? 'Drop on an empty cell.' : 'Drop on one of your Supporters to consolidate.');
        }
      }
      cleanup({clearPlacement:true});
      return;
    }
    if(state.card.type === 'Supporter' || isFreeSetCard(state.card)) finishSupporterDrop(hit);
    else finishConsolidationDrop(hit);
  }

  function blockGhostClick(ev){
    if(Date.now() >= blockClickUntil) return;
    ev.preventDefault();
    ev.stopPropagation();
    if(ev.stopImmediatePropagation) ev.stopImmediatePropagation();
  }

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointermove', onPointerMove, {capture:true, passive:false});
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('click', blockGhostClick, true);
  window.addEventListener('blur', function(){ if(state) cleanup({clearPlacement:true}); });
  document.addEventListener('visibilitychange', function(){ if(document.hidden && state) cleanup({clearPlacement:true}); });

  window.FateMatchHandDragBridge = {
    version:BRIDGE_VERSION,
    usesDomHand:false,
    usesHitMap:true,
    report:function(){
      return {
        available:true,
        version:BRIDGE_VERSION,
        active:!!state,
        dragging:!!(state && state.dragging),
        ownsBoard:ownsBoard(),
        usesDomHand:false,
        usesHitMap:true
      };
    }
  };
  window.fateMatchHandDragReport = window.FateMatchHandDragBridge.report;
})();
