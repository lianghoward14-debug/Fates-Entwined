// Canvas-backed deck-builder collection grids.
// The canvas paints the card visuals; lightweight buttons preserve click/right-click behavior.
(function(){
  const imageCache = new Map();

  function isEnhancedVisualFxOn() {
    try {
      if(typeof window.isEnhancedVisualFxEnabled === 'function') return window.isEnhancedVisualFxEnabled();
      return document.documentElement.classList.contains('fate-enhanced-fx');
    } catch(e) {
      return false;
    }
  }

  function getImage(src, redraw) {
    if(!src) return null;
    let img = imageCache.get(src);
    if(img) return img;
    img = new Image();
    img.decoding = 'async';
    img.loading = 'eager';
    img.onload = function(){
      if(typeof redraw === 'function') {
        if(typeof requestAnimationFrame === 'function') requestAnimationFrame(function(){ redraw(false); });
        else redraw(false);
      }
    };
    img.onerror = function(){
      const fallback = typeof window.getFullCardImageFallbackSrc === 'function'
        ? window.getFullCardImageFallbackSrc(img.src)
        : '';
      if(!img.__fateFullFallbackTried && fallback && fallback !== img.src){
        img.__fateFullFallbackTried = true;
        img.src = fallback;
        return;
      }
      if(typeof redraw === 'function') redraw(false);
    };
    img.src = src;
    imageCache.set(src, img);
    return img;
  }

  function px(value, fallback) {
    const n = parseFloat(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  function roundedRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
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

  function drawImageContain(ctx, img, x, y, w, h) {
    if(!img || !img.complete || img.naturalWidth === 0) return false;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    const scale = Math.min(w / Math.max(1, srcW), h / Math.max(1, srcH));
    const dw = srcW * scale;
    const dh = srcH * scale;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    return true;
  }

  function drawBadge(ctx, text, x, y, opts) {
    opts = opts || {};
    ctx.save();
    ctx.font = opts.font || '700 14px Cinzel, serif';
    const padX = opts.padX || 9;
    const padY = opts.padY || 4;
    const metrics = ctx.measureText(text);
    const w = Math.ceil(metrics.width + padX * 2);
    const h = opts.height || 24;
    const bx = opts.align === 'right' ? x - w : x;
    roundedRect(ctx, bx, y, w, h, opts.radius || 5);
    ctx.fillStyle = opts.fill || 'rgba(0,0,0,.82)';
    ctx.fill();
    ctx.lineWidth = opts.lineWidth || 1;
    ctx.strokeStyle = opts.stroke || 'rgba(236,205,105,.72)';
    ctx.stroke();
    ctx.fillStyle = opts.color || '#f8eebd';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + w / 2, y + h / 2 + (opts.textOffsetY || 0));
    ctx.restore();
  }

  function drawStarSheenFallback(ctx, rect) {
    return;
  }

  function drawCard(ctx, entry, rect, state) {
    const card = entry.card;
    const count = Number(entry.count || 0);
    const ownedText = entry.ownedText || '';
    const rarity = card && card.rarity;
    const inDeck = count > 0;
    const hovered = state.hoveredIndex === entry.index;
    const border = inDeck ? 'rgba(112,255,143,.72)' : 'rgba(201,168,76,.36)';

    ctx.save();
    roundedRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.clip();

    const aff = (window.AFF_COLOR && card && AFF_COLOR[card.aff]) || '#2a2a3a';

    const img = card && card.img ? getImage(card.img, state.redraw) : null;
    const artPad = 4;
    if(!drawImageContain(ctx, img, rect.x + artPad, rect.y + artPad, rect.w - artPad * 2, rect.h - artPad * 2)) {
      ctx.fillStyle = 'rgba(214,180,89,.08)';
      ctx.fillRect(rect.x + artPad, rect.y + artPad, rect.w - artPad * 2, rect.h - artPad * 2);
    }

    if(entry.locked) {
      ctx.fillStyle = 'rgba(0,0,0,.62)';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      if(!state.suppressLockedGlyph) {
        ctx.fillStyle = 'rgba(255,255,255,.17)';
        ctx.font = '700 ' + Math.max(34, Math.floor(rect.w * .34)) + 'px Cinzel, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', rect.x + rect.w / 2, rect.y + rect.h / 2);
      }
    }

    if(inDeck) {
      ctx.fillStyle = 'rgba(76,175,80,.18)';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
    if(hovered) {
      ctx.fillStyle = 'rgba(255,244,190,.08)';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
    if(rarity === 'star') drawStarSheenFallback(ctx, rect);
    ctx.restore();

    ctx.save();
    roundedRect(ctx, rect.x + .5, rect.y + .5, rect.w - 1, rect.h - 1, 8);
    ctx.lineWidth = hovered ? 2 : 1.25;
    ctx.strokeStyle = hovered ? 'rgba(255,230,150,.72)' : border;
    ctx.stroke();
    if(inDeck) {
      roundedRect(ctx, rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 4, 7);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(122,255,142,.38)';
      ctx.stroke();
      drawBadge(ctx, 'x' + count, rect.x + rect.w - 7, rect.y + rect.h - 31, {
        align:'right',
        fill:'rgba(18,46,24,.93)',
        stroke:'rgba(122,255,142,.62)',
        color:'#dcffe3',
        font:'700 14px Cinzel, serif'
      });
    }
    if(ownedText) {
      drawBadge(ctx, ownedText, rect.x + rect.w - 7, rect.y + 7, {
        align:'right',
        fill:'rgba(0,0,0,.82)',
        stroke:'rgba(236,205,105,.68)',
        color:'#fff7cf',
        font:'700 12px Cinzel, serif',
        height:22,
        padX:7
      });
    }
    ctx.restore();
  }

  function renderCanvasDeckCollection(container, entries, opts) {
    if(!container || !window.HTMLCanvasElement) return false;
    opts = opts || {};
    entries = Array.isArray(entries) ? entries : [];
    if(!entries.length) return false;

    if(typeof container.__fateCanvasGridCleanup === 'function') {
      try { container.__fateCanvasGridCleanup(); } catch(e) {}
      container.__fateCanvasGridCleanup = null;
    }
    if(container.__fateCanvasGridResizeObserver) {
      try { container.__fateCanvasGridResizeObserver.disconnect(); } catch(e) {}
      container.__fateCanvasGridResizeObserver = null;
    }
    const virtualize = !!opts.virtualize;
    const lowScroll = virtualize || !!opts.lowScroll;
    const maxDpr = Math.max(1, Number(opts.maxDpr) || (lowScroll ? 1 : 2.5));
    const hoverRedraw = opts.hoverRedraw !== false && !lowScroll;
    container.classList.add('canvas-card-grid-mode');
    container.classList.toggle('canvas-card-grid-virtualized', virtualize);
    container.classList.toggle('canvas-card-grid-low-scroll', lowScroll);
    container.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'canvas-card-grid-wrap';
    const canvas = document.createElement('canvas');
    canvas.className = 'canvas-card-grid-surface';
    const sheenLayer = document.createElement('div');
    sheenLayer.className = 'canvas-card-grid-sheen-layer';
    const hitLayer = document.createElement('div');
    hitLayer.className = 'canvas-card-grid-hit-layer';
    wrap.appendChild(canvas);
    wrap.appendChild(sheenLayer);
    wrap.appendChild(hitLayer);
    container.appendChild(wrap);

    const ctx = canvas.getContext('2d', { alpha:true });
    const state = { hoveredIndex:-1, redraw:null, suppressLockedGlyph:!!opts.suppressLockedGlyph };
    let rects = [];
    let resizeTimer = 0;
    let scrollRaf = 0;
    let lastVirtualKey = '';
    const useStarSheen = !lowScroll && isEnhancedVisualFxOn() && entries.some(function(entry){
      return entry && entry.card && entry.card.rarity === 'star';
    });

    function computeLayout() {
      const cs = getComputedStyle(container);
      const cardW = px(cs.getPropertyValue('--dbcw'), 185);
      const cardH = px(cs.getPropertyValue('--dbch'), 260);
      const gap = Math.max(6, px(cs.columnGap || cs.gap, 7));
      const measuredW = wrap.clientWidth || container.clientWidth || 1;
      const width = Math.max(cardW, measuredW);
      const cols = Math.max(1, Math.floor((width + gap) / (cardW + gap)));
      const usedW = cols * cardW + (cols - 1) * gap;
      const startX = opts.align === 'left' ? 0 : Math.max(0, Math.floor((width - usedW) / 2));
      const rows = Math.ceil(entries.length / cols);
      const height = rows * cardH + Math.max(0, rows - 1) * gap;
      return { width, height, cardW, cardH, gap, cols, rows, startX };
    }

    function computePaintWindow(layout) {
      if(!virtualize) {
        return { top:0, height:layout.height, startIndex:0, endIndex:entries.length, key:'full' };
      }
      const rowStep = layout.cardH + layout.gap;
      const viewportH = Math.max(1, container.clientHeight || Math.min(layout.height, 760));
      const scrollTop = Math.max(0, container.scrollTop || 0);
      const overscanRows = Math.max(1, Number(opts.overscanRows) || 2);
      const startRow = Math.max(0, Math.floor(scrollTop / rowStep) - overscanRows);
      const endRow = Math.min(layout.rows, Math.ceil((scrollTop + viewportH) / rowStep) + overscanRows);
      const visibleRows = Math.max(1, endRow - startRow);
      const paintH = visibleRows * layout.cardH + Math.max(0, visibleRows - 1) * layout.gap;
      const top = startRow * rowStep;
      return {
        top,
        height:Math.max(1, paintH),
        startIndex:Math.min(entries.length, startRow * layout.cols),
        endIndex:Math.min(entries.length, endRow * layout.cols),
        key:[layout.width, layout.cols, startRow, endRow, top].join('|')
      };
    }

    function syncHitboxes(layout) {
      hitLayer.innerHTML = '';
      sheenLayer.innerHTML = '';
      rects.forEach(function(rect){
        const i = rect.entryIndex;
        const entry = entries[i];
        if(useStarSheen && entry && entry.card && entry.card.rarity === 'star') {
          const sheen = document.createElement('span');
          sheen.className = 'canvas-card-grid-sheen';
          const sweep = document.createElement('span');
          sweep.className = 'canvas-card-grid-sheen-sweep';
          sheen.appendChild(sweep);
          sheen.style.left = rect.x + 'px';
          sheen.style.top = rect.y + 'px';
          sheen.style.width = rect.w + 'px';
          sheen.style.height = rect.h + 'px';
          sheenLayer.appendChild(sheen);
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'canvas-card-grid-hitbox';
        btn.style.left = rect.x + 'px';
        btn.style.top = rect.y + 'px';
        btn.style.width = rect.w + 'px';
        btn.style.height = rect.h + 'px';
        btn.dataset.cardId = entry.card && entry.card.id || '';
        btn.title = entry.title || '';
        btn.setAttribute('aria-label', entry.ariaLabel || (entry.card && entry.card.name) || 'Card');
        let pointerOpened = false;
        function openFromPointer(ev) {
          ev.preventDefault();
          ev.stopPropagation();
          if(typeof opts.onClick === 'function') opts.onClick(entry.card, entry, ev);
          else if(typeof opts.onContextMenu === 'function') opts.onContextMenu(entry.card, entry, ev);
          else if(typeof window.showCardInfoOverlay === 'function') window.showCardInfoOverlay(entry.card);
        }
        btn.onpointerup = function(ev){
          if(ev.button !== 0) return;
          pointerOpened = true;
          openFromPointer(ev);
          setTimeout(function(){ pointerOpened = false; }, 0);
        };
        btn.onclick = function(ev){
          if(pointerOpened) {
            ev.preventDefault();
            ev.stopPropagation();
            return;
          }
          openFromPointer(ev);
        };
        btn.oncontextmenu = function(ev){
          ev.preventDefault();
          ev.stopPropagation();
          if(typeof opts.onContextMenu === 'function') opts.onContextMenu(entry.card, entry, ev);
        };
        if(hoverRedraw) {
          btn.onmouseenter = function(){ state.hoveredIndex = i; draw(false); };
          btn.onmouseleave = function(){ if(state.hoveredIndex === i){ state.hoveredIndex = -1; draw(false); } };
        }
        hitLayer.appendChild(btn);
      });
      hitLayer.style.width = layout.width + 'px';
      hitLayer.style.height = (virtualize ? Math.max(1, canvas.clientHeight || 1) : layout.height) + 'px';
      sheenLayer.style.width = layout.width + 'px';
      sheenLayer.style.height = (virtualize ? Math.max(1, canvas.clientHeight || 1) : layout.height) + 'px';
    }

    let sheenFirstPaintDone = false;
    function forceSheenFirstPaint() {
      if(!useStarSheen || sheenFirstPaintDone || !sheenLayer || !sheenLayer.childElementCount || !wrap.isConnected) return;
      sheenFirstPaintDone = true;
      sheenLayer.style.transform = 'translateZ(0)';
      sheenLayer.style.willChange = 'opacity';
      if(typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function(){
          if(!sheenLayer.isConnected) return;
          sheenLayer.style.opacity = '1';
        });
      } else {
        sheenLayer.style.opacity = '1';
      }
    }

    function draw(syncHits, scrollOnly) {
      if(!ctx) return;
      if(syncHits === undefined) syncHits = true;
      state.time = (window.performance && performance.now) ? performance.now() : Date.now();
      const layout = computeLayout();
      const paintWindow = computePaintWindow(layout);
      const dpr = Math.max(1, Math.min(maxDpr, window.devicePixelRatio || 1));
      const virtualKey = virtualize ? (paintWindow.key + '|' + dpr) : '';
      if(scrollOnly && virtualize && virtualKey === lastVirtualKey) return;
      const pxW = Math.max(1, Math.round(layout.width * dpr));
      const pxH = Math.max(1, Math.round(paintWindow.height * dpr));
      if(canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW;
        canvas.height = pxH;
      }
      canvas.style.width = layout.width + 'px';
      canvas.style.height = paintWindow.height + 'px';
      if(virtualize) {
        canvas.style.position = 'absolute';
        canvas.style.left = '0';
        canvas.style.top = paintWindow.top + 'px';
        hitLayer.style.top = paintWindow.top + 'px';
        sheenLayer.style.top = paintWindow.top + 'px';
      } else {
        canvas.style.position = '';
        canvas.style.left = '';
        canvas.style.top = '';
        hitLayer.style.top = '';
        sheenLayer.style.top = '';
      }
      wrap.style.minHeight = layout.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, layout.width, paintWindow.height);
      rects = [];
      for(let i = paintWindow.startIndex; i < paintWindow.endIndex; i++) {
        const entry = entries[i];
        entry.index = i;
        const col = i % layout.cols;
        const row = Math.floor(i / layout.cols);
        const y = row * (layout.cardH + layout.gap);
        rects.push({
          x: layout.startX + col * (layout.cardW + layout.gap),
          y: virtualize ? y - paintWindow.top : y,
          w: layout.cardW,
          h: layout.cardH,
          entryIndex: i
        });
      }
      rects.forEach(function(rect){ drawCard(ctx, entries[rect.entryIndex], rect, state); });
      lastVirtualKey = virtualKey;
      if(syncHits) {
        syncHitboxes(layout);
        forceSheenFirstPaint();
      }
    }
    state.redraw = function(){ draw(false); };
    draw();
    const repaintAfterImageWarmup = function(){ draw(true); forceSheenFirstPaint(); };
    if(typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(repaintAfterImageWarmup);
    }
    if(!lowScroll) {
      [180, 640].forEach(function(ms){ setTimeout(repaintAfterImageWarmup, ms); });
    }

    function onScroll() {
      if(!virtualize) return;
      if(scrollRaf) return;
      scrollRaf = requestAnimationFrame(function(){
        scrollRaf = 0;
        draw(true, true);
      });
    }
    if(virtualize) container.addEventListener('scroll', onScroll, { passive:true });

    if(typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(function(){
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(draw, 40);
      });
      ro.observe(container);
      container.__fateCanvasGridResizeObserver = ro;
    }
    container.__fateCanvasGridCleanup = function(){
      if(scrollRaf) cancelAnimationFrame(scrollRaf);
      scrollRaf = 0;
      if(virtualize) container.removeEventListener('scroll', onScroll);
      if(container.__fateCanvasGridResizeObserver) {
        try { container.__fateCanvasGridResizeObserver.disconnect(); } catch(e) {}
        container.__fateCanvasGridResizeObserver = null;
      }
    };
    container.__fateCanvasGridState = { entries, draw };
    return true;
  }

  function trimText(ctx, text, maxW) {
    text = String(text || '');
    if(ctx.measureText(text).width <= maxW) return text;
    let lo = 0, hi = text.length;
    while(lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if(ctx.measureText(text.slice(0, mid) + '...').width <= maxW) lo = mid;
      else hi = mid - 1;
    }
    return text.slice(0, Math.max(0, lo)) + '...';
  }

  function renderCanvasDeckList(container, entries, opts) {
    if(!container || !window.HTMLCanvasElement) return false;
    opts = opts || {};
    entries = Array.isArray(entries) ? entries : [];
    if(container.__fateCanvasDeckListResizeObserver) {
      try { container.__fateCanvasDeckListResizeObserver.disconnect(); } catch(e) {}
      container.__fateCanvasDeckListResizeObserver = null;
    }
    container.classList.add('canvas-deck-list-mode');
    container.innerHTML = '';
    if(!entries.length) return true;

    const wrap = document.createElement('div');
    wrap.className = 'canvas-deck-list-wrap';
    const canvas = document.createElement('canvas');
    canvas.className = 'canvas-deck-list-surface';
    const hitLayer = document.createElement('div');
    hitLayer.className = 'canvas-deck-list-hit-layer';
    wrap.appendChild(canvas);
    wrap.appendChild(hitLayer);
    container.appendChild(wrap);

    const ctx = canvas.getContext('2d', { alpha:true });
    const compact = !!opts.compact;
    const state = { hoveredIndex:-1, redraw:null };
    let rowRects = [];
    let resizeTimer = 0;

    function layout() {
      const measuredW = wrap.clientWidth || container.clientWidth || 1;
      const width = Math.max(compact ? 300 : 360, measuredW);
      const rowH = compact ? 126 : 136;
      const gap = compact ? 8 : 10;
      const pad = 4;
      const height = pad * 2 + entries.length * rowH + Math.max(0, entries.length - 1) * gap;
      return { width, rowH, gap, pad, height };
    }

    function drawRow(entry, rect, index) {
      const card = entry.card || {};
      const hovered = state.hoveredIndex === index;
      const rarityColor = (window.RARITY_COLOR && RARITY_COLOR[card.rarity]) || 'rgba(201,168,76,.48)';
      ctx.save();
      roundedRect(ctx, rect.x, rect.y, rect.w, rect.h, 7);
      ctx.fillStyle = hovered ? 'rgba(255,255,255,.075)' : 'rgba(6,8,14,.62)';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = hovered ? 'rgba(201,168,76,.28)' : 'rgba(201,168,76,.16)';
      ctx.stroke();

      const thumbW = compact ? 84 : 88;
      const thumbH = compact ? 118 : 123;
      const thumbX = rect.x + 10;
      const thumbY = rect.y + Math.round((rect.h - thumbH) / 2);
      roundedRect(ctx, thumbX, thumbY, thumbW, thumbH, 5);
      ctx.save();
      roundedRect(ctx, thumbX, thumbY, thumbW, thumbH, 5);
      ctx.clip();
      const img = card.img ? getImage(card.img, state.redraw) : null;
      if(!drawImageContain(ctx, img, thumbX + 2, thumbY + 2, thumbW - 4, thumbH - 4)) {
        ctx.fillStyle = 'rgba(214,180,89,.08)';
        ctx.fillRect(thumbX, thumbY, thumbW, thumbH);
      }
      ctx.restore();
      roundedRect(ctx, thumbX + .5, thumbY + .5, thumbW - 1, thumbH - 1, 5);
      ctx.strokeStyle = rarityColor;
      ctx.stroke();

      const textX = thumbX + thumbW + 14;
      const removeW = opts.removeWidth || (opts.removeLabel ? 64 : 48);
      const qtyW = 52;
      const rightPad = 12;
      const textW = Math.max(60, rect.w - (textX - rect.x) - qtyW - removeW - rightPad - 12);
      ctx.font = compact ? '700 15px Cinzel, serif' : '700 16px Cinzel, serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(trimText(ctx, card.name || '', textW), textX, rect.y + (compact ? 48 : 52));
      ctx.font = compact ? '13px Crimson Pro, serif' : '14px Crimson Pro, serif';
      ctx.fillStyle = 'rgba(236,224,190,.68)';
      const sub = entry.subtitle || (card.type || '') + (card.cost > 0 ? ' (' + (card.xCost ? 'X' : card.cost) + ')' : '');
      ctx.fillText(trimText(ctx, sub, textW), textX, rect.y + (compact ? 70 : 76));

      drawBadge(ctx, 'x' + (entry.count || 0), rect.x + rect.w - removeW - rightPad - 8, rect.y + Math.round((rect.h - 26) / 2), {
        fill:'rgba(18,46,24,.92)',
        stroke:'rgba(122,255,142,.55)',
        color:'#d9ffe0',
        font:'700 13px Cinzel, serif',
        height:26,
        padX:10
      });

      ctx.font = opts.removeFont || (compact ? '700 16px Cinzel, serif' : '700 13px Cinzel, serif');
      ctx.fillStyle = opts.removeColor || 'rgba(226,78,78,.86)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(opts.removeLabel || 'Remove', rect.x + rect.w - removeW / 2 - 8, rect.y + rect.h / 2);
      ctx.restore();
    }

    function syncHitboxes() {
      hitLayer.innerHTML = '';
      rowRects.forEach(function(rect, i){
        const entry = entries[i];
        const removeW = opts.removeWidth || (opts.removeLabel ? 72 : 56);
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'canvas-deck-list-hitbox canvas-deck-list-open';
        open.style.left = rect.x + 'px';
        open.style.top = rect.y + 'px';
        open.style.width = Math.max(1, rect.w - removeW - 10) + 'px';
        open.style.height = rect.h + 'px';
        open.dataset.cardId = entry.id || (entry.card && entry.card.id) || '';
        open.title = entry.title || 'Click to view details';
        open.setAttribute('aria-label', 'View ' + ((entry.card && entry.card.name) || 'card'));
        open.onclick = function(ev){ ev.preventDefault(); if(typeof opts.onOpen === 'function') opts.onOpen(entry.card, entry, ev); };
        open.onmouseenter = function(){ state.hoveredIndex = i; draw(); };
        open.onmouseleave = function(){ if(state.hoveredIndex === i){ state.hoveredIndex = -1; draw(); } };
        hitLayer.appendChild(open);

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'canvas-deck-list-hitbox canvas-deck-list-remove';
        remove.style.left = (rect.x + rect.w - removeW - 6) + 'px';
        remove.style.top = rect.y + 'px';
        remove.style.width = removeW + 'px';
        remove.style.height = rect.h + 'px';
        remove.dataset.cardId = open.dataset.cardId;
        remove.title = 'Remove';
        remove.setAttribute('aria-label', 'Remove ' + ((entry.card && entry.card.name) || 'card'));
        remove.onclick = function(ev){ ev.preventDefault(); ev.stopPropagation(); if(typeof opts.onRemove === 'function') opts.onRemove(entry.id || entry.card.id, entry, ev); };
        remove.onmouseenter = function(){ state.hoveredIndex = i; draw(); };
        remove.onmouseleave = function(){ if(state.hoveredIndex === i){ state.hoveredIndex = -1; draw(); } };
        hitLayer.appendChild(remove);
      });
      const box = layout();
      hitLayer.style.width = box.width + 'px';
      hitLayer.style.height = box.height + 'px';
    }

    function draw() {
      if(!ctx) return;
      const box = layout();
      const dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
      const pxW = Math.max(1, Math.round(box.width * dpr));
      const pxH = Math.max(1, Math.round(box.height * dpr));
      if(canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW;
        canvas.height = pxH;
      }
      canvas.style.width = box.width + 'px';
      canvas.style.height = box.height + 'px';
      wrap.style.minHeight = box.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, box.width, box.height);
      rowRects = entries.map(function(entry, i){
        return {
          x: box.pad,
          y: box.pad + i * (box.rowH + box.gap),
          w: box.width - box.pad * 2,
          h: box.rowH
        };
      });
      entries.forEach(function(entry, i){ drawRow(entry, rowRects[i], i); });
      syncHitboxes();
    }

    state.redraw = draw;
    draw();
    if(typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(function(){
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(draw, 40);
      });
      ro.observe(container);
      container.__fateCanvasDeckListResizeObserver = ro;
    }
    container.__fateCanvasDeckListState = { entries, draw };
    return true;
  }

  function drawImageCover(ctx, img, x, y, w, h, cropY) {
    if(!img || !img.complete || img.naturalWidth === 0) return false;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    const srcRatio = srcW / Math.max(1, srcH);
    const dstRatio = w / Math.max(1, h);
    let sx = 0, sy = 0, sw = srcW, sh = srcH;
    if(srcRatio > dstRatio) {
      sw = srcH * dstRatio;
      sx = (srcW - sw) / 2;
    } else {
      sh = srcW / dstRatio;
      const yBias = Number.isFinite(cropY) ? Math.max(0, Math.min(1, cropY)) : 0.25;
      sy = Math.max(0, (srcH - sh) * yBias);
      if(sy + sh > srcH) sy = srcH - sh;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    return true;
  }

  function renderCanvasDeckPreviewTile(tile, opts) {
    if(!tile || !window.HTMLCanvasElement) return false;
    opts = opts || {};
    const heroCanvas = tile.querySelector('.canvas-deck-preview-hero');
    const minisCanvas = tile.querySelector('.canvas-deck-preview-minis');
    if(!heroCanvas && !minisCanvas) return false;
    const hero = opts.hero || null;
    const minis = Array.isArray(opts.minis) ? opts.minis : [];
    const redraw = function(){ renderCanvasDeckPreviewTile(tile, opts); };
    const dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));

    if(heroCanvas) {
      const parent = heroCanvas.parentElement || heroCanvas;
      const rect = parent.getBoundingClientRect ? parent.getBoundingClientRect() : null;
      const canvasRect = heroCanvas.getBoundingClientRect ? heroCanvas.getBoundingClientRect() : null;
      const cssW = Math.max(1, Math.round((rect && rect.width) || parent.clientWidth || (canvasRect && canvasRect.width) || heroCanvas.clientWidth || 320));
      const cssH = Math.max(1, Math.round((rect && rect.height) || parent.clientHeight || (canvasRect && canvasRect.height) || heroCanvas.clientHeight || 150));
      const pxW = Math.round(cssW * dpr);
      const pxH = Math.round(cssH * dpr);
      if(heroCanvas.width !== pxW || heroCanvas.height !== pxH) {
        heroCanvas.width = pxW;
        heroCanvas.height = pxH;
      }
      heroCanvas.style.width = '100%';
      heroCanvas.style.height = '100%';
      const ctx = heroCanvas.getContext('2d', { alpha:true });
      if(ctx) {
        ctx.setTransform(dpr,0,0,dpr,0,0);
        ctx.clearRect(0,0,cssW,cssH);
        ctx.fillStyle = '#080910';
        ctx.fillRect(0,0,cssW,cssH);
        const img = hero && hero.img ? getImage(hero.img, redraw) : null;
        if(!drawImageCover(ctx, img, 0, 0, cssW, cssH)) {
          ctx.fillStyle = 'rgba(214,180,89,.08)';
          ctx.fillRect(0,0,cssW,cssH);
        }
      }
    }

    if(minisCanvas) {
      const miniW = 56, miniH = 78, gap = 6;
      const count = Math.max(1, Math.min(7, minis.length || 1));
      const cssW = count * miniW + Math.max(0, count - 1) * gap;
      const cssH = miniH;
      const pxW = Math.round(cssW * dpr);
      const pxH = Math.round(cssH * dpr);
      if(minisCanvas.width !== pxW || minisCanvas.height !== pxH) {
        minisCanvas.width = pxW;
        minisCanvas.height = pxH;
      }
      minisCanvas.style.width = cssW + 'px';
      minisCanvas.style.height = cssH + 'px';
      const ctx = minisCanvas.getContext('2d', { alpha:true });
      if(ctx) {
        ctx.setTransform(dpr,0,0,dpr,0,0);
        ctx.clearRect(0,0,cssW,cssH);
        for(let i=0; i<count; i++) {
          const card = minis[i];
          const x = i * (miniW + gap);
          roundedRect(ctx, x, 0, miniW, miniH, 4);
          ctx.fillStyle = '#080910';
          ctx.fill();
          ctx.save();
          roundedRect(ctx, x, 0, miniW, miniH, 4);
          ctx.clip();
          const img = card && card.img ? getImage(card.img, redraw) : null;
          if(!drawImageCover(ctx, img, x, 0, miniW, miniH)) {
            ctx.fillStyle = 'rgba(214,180,89,.08)';
            ctx.fillRect(x, 0, miniW, miniH);
          }
          ctx.restore();
          roundedRect(ctx, x + .5, .5, miniW - 1, miniH - 1, 4);
          ctx.lineWidth = 1;
          ctx.strokeStyle = 'rgba(255,255,255,.16)';
          ctx.stroke();
        }
      }
    }
    return true;
  }

  function scheduleCanvasDeckPreviewTile(tile, opts) {
    const draw = function(){ renderCanvasDeckPreviewTile(tile, opts); };
    requestAnimationFrame(function(){
      draw();
      requestAnimationFrame(draw);
    });
    setTimeout(draw, 120);
  }

  function renderCanvasImage(canvas, src, opts) {
    if(!canvas || !canvas.getContext || !window.HTMLCanvasElement) return false;
    opts = opts || {};
    const parent = opts.parent || canvas.parentElement || canvas;
    const rect = parent.getBoundingClientRect ? parent.getBoundingClientRect() : null;
    const cssW = Math.max(1, Math.round(opts.width || (rect && rect.width) || parent.clientWidth || canvas.clientWidth || 96));
    const cssH = Math.max(1, Math.round(opts.height || (rect && rect.height) || parent.clientHeight || canvas.clientHeight || 96));
    const dpr = Math.max(1, Math.min(opts.maxDpr || 2.5, window.devicePixelRatio || 1));
    const pxW = Math.round(cssW * dpr);
    const pxH = Math.round(cssH * dpr);
    const redraw = function(){ renderCanvasImage(canvas, src, opts); };
    const img = src ? getImage(src, redraw) : null;
    const imageState = img && img.complete && img.naturalWidth
      ? ['ready', img.naturalWidth, img.naturalHeight].join(':')
      : (src ? 'pending' : 'none');
    const sig = [
      src || '',
      cssW,
      cssH,
      dpr,
      opts.mode || 'cover',
      opts.cropY == null ? '' : opts.cropY,
      opts.background || '',
      opts.styleWidth || '',
      opts.styleHeight || '',
      opts.fallbackText || '',
      imageState
    ].join('|');
    if(canvas.__fateCanvasImageSig === sig && canvas.__fateCanvasImageDrawn) return true;
    if(canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }
    canvas.style.width = opts.styleWidth || '100%';
    canvas.style.height = opts.styleHeight || '100%';
    const ctx = canvas.getContext('2d', { alpha:true });
    if(!ctx) return false;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0,0,cssW,cssH);
    if(opts.background !== 'transparent') {
      ctx.fillStyle = opts.background || '#080910';
      ctx.fillRect(0,0,cssW,cssH);
    }
    const mode = opts.mode || 'cover';
    const ok = mode === 'contain'
      ? drawImageContain(ctx, img, 0, 0, cssW, cssH)
      : drawImageCover(ctx, img, 0, 0, cssW, cssH, opts.cropY);
    if(!ok && opts.fallbackText) {
      ctx.fillStyle = opts.fallbackFill || 'rgba(236,224,190,.62)';
      ctx.font = opts.fallbackFont || '700 13px Cinzel, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(opts.fallbackText).slice(0, 18), cssW / 2, cssH / 2);
    }
    canvas.__fateCanvasImageSig = sig;
    canvas.__fateCanvasImageDrawn = true;
    return true;
  }

  function renderCanvasSelectableCardGrid(container, cards, opts) {
    if(!container || !Array.isArray(cards) || !cards.length || typeof renderCanvasDeckCollection !== 'function') return false;
    opts = opts || {};
    container.style.setProperty('--dbcw', opts.cardWidth || '92px');
    container.style.setProperty('--dbch', opts.cardHeight || '129px');
    const entries = cards.map(function(card, index){
      const selected = typeof opts.isSelected === 'function' ? opts.isSelected(card, index) : false;
      return {
        card,
        count: 0,
        ownedText: selected ? (typeof opts.selectedLabel === 'function' ? opts.selectedLabel(card, index) : (opts.selectedLabel || 'SEL')) : '',
        title: card && card.name || '',
        ariaLabel: card && card.name || 'Card'
      };
    });
    return renderCanvasDeckCollection(container, entries, {
      onClick: function(card, entry, ev){ if(typeof opts.onSelect === 'function') opts.onSelect(card, entry, ev); },
      onContextMenu: function(card){ if(typeof opts.onInspect === 'function') opts.onInspect(card); else if(typeof window.showCardInfoOverlay === 'function') window.showCardInfoOverlay(card); }
    });
  }

  function fitSavePresetPickerCards(container, count, opts) {
    opts = opts || {};
    count = Math.max(1, Number(count) || 1);
    if(!container) return { cardWidth:'72px', cardHeight:'101px' };

    const gap = Math.max(4, Number(opts.gap) || 6);
    const maxW = Math.max(28, Number(opts.maxCardWidth) || 72);
    const minW = Math.max(18, Number(opts.minCardWidth) || 28);
    const ratio = Math.max(1.2, Number(opts.heightRatio) || 1.403);
    const rect = container.getBoundingClientRect ? container.getBoundingClientRect() : null;
    const width = Math.max(240, Math.floor((rect && rect.width) || container.clientWidth || 900));
    const height = Math.max(76, Math.floor((rect && rect.height) || container.clientHeight || opts.fallbackHeight || 148));
    const maxRows = Math.max(1, Math.min(count, Number(opts.maxRows) || 4));
    let best = { w:minW, h:Math.round(minW * ratio), rows:count };

    for(let rows = 1; rows <= maxRows; rows++) {
      const cols = Math.ceil(count / rows);
      const byWidth = Math.floor((width - Math.max(0, cols - 1) * gap) / cols);
      const byHeight = Math.floor((height - Math.max(0, rows - 1) * gap) / rows / ratio);
      const w = Math.max(minW, Math.min(maxW, byWidth, byHeight));
      const h = Math.round(w * ratio);
      const actualCols = Math.max(1, Math.floor((width + gap) / (w + gap)));
      const actualRows = Math.ceil(count / actualCols);
      const totalH = actualRows * h + Math.max(0, actualRows - 1) * gap;
      if(totalH <= height && w > best.w) best = { w, h, rows:actualRows };
    }

    container.style.setProperty('--save-picker-card-w', best.w + 'px');
    container.style.setProperty('--save-picker-card-h', best.h + 'px');
    container.style.setProperty('--dbcw', best.w + 'px');
    container.style.setProperty('--dbch', best.h + 'px');
    container.style.gap = gap + 'px';
    return { cardWidth:best.w + 'px', cardHeight:best.h + 'px' };
  }

  window.renderCanvasDeckCollection = renderCanvasDeckCollection;
  window.renderCanvasDeckList = renderCanvasDeckList;
  window.renderCanvasDeckPreviewTile = renderCanvasDeckPreviewTile;
  window.scheduleCanvasDeckPreviewTile = scheduleCanvasDeckPreviewTile;
  window.renderCanvasImage = renderCanvasImage;
  window.renderCanvasSelectableCardGrid = renderCanvasSelectableCardGrid;
  window.fitSavePresetPickerCards = fitSavePresetPickerCards;
  window.refreshCanvasDeckCollectionCounts = function(container, updater) {
    const state = container && container.__fateCanvasGridState;
    if(!state || !Array.isArray(state.entries)) return false;
    state.entries.forEach(function(entry){
      if(typeof updater === 'function') updater(entry);
    });
    state.draw();
    return true;
  };

  window.addEventListener('fate-screen-changed', function(ev){
    if(!ev || !ev.detail || ev.detail.to !== 's-deck') return;
    const redraw = function(){
      try {
        const state = document.getElementById('db-collection')?.__fateCanvasGridState;
        if(state && typeof state.draw === 'function') state.draw(true);
      } catch(e) {}
    };
    if(typeof requestAnimationFrame === 'function') requestAnimationFrame(function(){ requestAnimationFrame(redraw); });
    [80, 260, 620].forEach(function(ms){ setTimeout(redraw, ms); });
  });
})();
