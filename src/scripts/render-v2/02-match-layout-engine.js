(function(){
  'use strict';

  if(typeof window === 'undefined') return;

  const LAYOUT_VERSION = 1;
  let lastLayout = null;
  let lastReport = null;
  let buildCount = 0;

  function nowMs(){
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function round(value){
    return Math.round((Number(value) || 0) * 10) / 10;
  }

  function rect(x, y, w, h){
    return {
      x:round(x),
      y:round(y),
      w:round(Math.max(0, w)),
      h:round(Math.max(0, h))
    };
  }

  function clamp(value, min, max){
    return Math.max(min, Math.min(max, value));
  }

  const MATCH_ZONE_SIZE_SCALE = 0.965;
  const MATCH_ZONE_VERTICAL_ALIGN = 0.21;

  function getRemPx(){
    try {
      const size = parseFloat(getComputedStyle(document.documentElement).fontSize);
      if(Number.isFinite(size) && size > 0) return size;
    } catch(e) {}
    return 16;
  }

  function buildProductionBoardMetrics(vp, opts){
    const rem = Number.isFinite(opts.rem) ? opts.rem : (Number.isFinite(vp.rem) ? vp.rem : getRemPx());
    const windowW = Number.isFinite(opts.windowW) ? opts.windowW : (Number.isFinite(vp.windowW) ? vp.windowW : (window.innerWidth || vp.w || 1280));
    const zoneScale = Number.isFinite(opts.zoneScale) ? opts.zoneScale : MATCH_ZONE_SIZE_SCALE;
    const boardPadX = Number.isFinite(opts.boardPadX) ? opts.boardPadX : rem * 0.28;
    const boardGap = Number.isFinite(opts.boardGap) ? opts.boardGap : rem * 0.34;
    const zonePadX = Number.isFinite(opts.zonePadX) ? opts.zonePadX : rem * 0.52 * zoneScale;
    const cellGap = Number.isFinite(opts.cellGap) ? opts.cellGap : rem * 0.18 * zoneScale;
    const rowGap = Number.isFinite(opts.rowGap) ? opts.rowGap : 0;
    const rowLabelW = Number.isFinite(opts.rowLabelW) ? opts.rowLabelW : 0;
    const rowLabelGap = Number.isFinite(opts.rowLabelGap) ? opts.rowLabelGap : 0;
    const zoneCount = Math.max(1, Number(opts.zoneCount) || 3);
    const targetCw = clamp(windowW * 0.079 * zoneScale, 110, 151);
    const availableZoneW = Math.max(260, ((Number(vp.w) || windowW) - boardPadX * 2 - boardGap * Math.max(0, zoneCount - 1)) / zoneCount);
    const maxCwByZone = Math.max(92, (availableZoneW - zonePadX * 2 - rowLabelW - rowLabelGap - cellGap * 2 - 12) / 3);
    const cw = Number.isFinite(opts.cardW) ? opts.cardW : clamp(Math.min(targetCw, maxCwByZone), 96, 151);
    const ch = Number.isFinite(opts.cardH) ? opts.cardH : Math.round(cw * 1.4);
    const rowH = Number.isFinite(opts.rowH) ? opts.rowH : (ch + rem * 0.34 * zoneScale);
    const zoneFitW = Number.isFinite(opts.zoneFitW)
      ? opts.zoneFitW
      : Math.min(availableZoneW, cw * 3 + cellGap * 2 + rowLabelW + rowLabelGap + zonePadX * 2 + 12);
    return {
      productionCss:true,
      rem,
      windowW,
      cardW:cw,
      cardH:ch,
      rowH,
      cellGap,
      rowGap,
      rowLabelW,
      rowLabelGap,
      boardPadX,
      boardPadTop:Number.isFinite(opts.boardPadTop) ? opts.boardPadTop : rem * 0.34,
      boardPadBottom:Number.isFinite(opts.boardPadBottom) ? opts.boardPadBottom : rem * 0.18,
      boardGap,
      zonePadX,
      zonePadTop:Number.isFinite(opts.zonePadTop) ? opts.zonePadTop : rem * 1.66 * zoneScale,
      zonePadBottom:Number.isFinite(opts.zonePadBottom) ? opts.zonePadBottom : rem * 1.02 * zoneScale,
      cardOffsetY:Number.isFinite(opts.cardOffsetY) ? opts.cardOffsetY : 0,
      headerTrackH:Number.isFinite(opts.headerTrackH) ? opts.headerTrackH : 36 * zoneScale,
      zoneVerticalAlign:Number.isFinite(opts.zoneVerticalAlign) ? opts.zoneVerticalAlign : MATCH_ZONE_VERTICAL_ALIGN,
      zoneFitW
    };
  }

  function getSnapshot(){
    if(typeof window.fateBuildRenderSnapshot === 'function') return window.fateBuildRenderSnapshot();
    if(window.FateRenderSnapshot && typeof window.FateRenderSnapshot.last === 'function') {
      const existing = window.FateRenderSnapshot.last();
      if(existing) return existing;
    }
    return null;
  }

  function getBoardViewport(){
    const dpr = Math.max(1, Number(window.devicePixelRatio || 1));
    const fallback = {x:0, y:0, w:window.innerWidth || 1280, h:window.innerHeight || 720, dpr, renderScale:1};
    const board = document.getElementById('board');
    if(!board || !board.getBoundingClientRect) return fallback;
    const r = board.getBoundingClientRect();
    return {
      x:r.left || 0,
      y:r.top || 0,
      w:Math.max(1, r.width || board.clientWidth || fallback.w),
      h:Math.max(1, r.height || board.clientHeight || fallback.h),
      dpr,
      renderScale:1,
      windowW:window.innerWidth || fallback.w,
      windowH:window.innerHeight || fallback.h,
      rem:getRemPx()
    };
  }

  function elementViewportRect(selector, fallback){
    try {
      const el = document.querySelector(selector);
      if(el && el.getBoundingClientRect) {
        const r = el.getBoundingClientRect();
        if(r.width > 1 && r.height > 1) return rect(r.left, r.top, r.width, r.height);
      }
    } catch(e) {}
    return fallback;
  }

  function buildPeripheralLayout(snap, vp, metrics){
    const winW = Math.max(1, Number(vp.windowW) || window.innerWidth || vp.w || 1280);
    const winH = Math.max(1, Number(vp.windowH) || window.innerHeight || vp.h || 720);
    const viewer = Number(snap.viewer) || 0;
    const opponent = viewer === 0 ? 1 : 0;
    const players = Array.isArray(snap.players) ? snap.players : [];
    const own = players[viewer] || {hand:[], handCount:0};
    const opp = players[opponent] || {hand:[], handCount:0};
    const handCards = Array.isArray(own.hand) ? own.hand.slice(0, 9) : [];
    const oppCards = Array.isArray(opp.hand) ? opp.hand : [];
    const cardW = clamp(winW * 0.047, 76, 100);
    const cardH = Math.round(cardW * 1.4);
    const handCount = handCards.length;
    const handFallbackW = Math.min(1040, Math.max(600, winW - 800));
    const desiredHandRect = rect((winW - handFallbackW) / 2, winH - cardH - 74, handFallbackW, cardH + 48);
    const handRect = desiredHandRect;
    const maxHandW = Math.max(1, Math.min(handRect.w - 34, winW - 620));
    const naturalGap = clamp(winW * 0.0035, 4, 9);
    let gap = naturalGap;
    let handStartX = handRect.x;
    if(handCount > 1) {
      const free = maxHandW - cardW * handCount;
      gap = Math.min(naturalGap, Math.max(-cardW * .52, free / (handCount - 1)));
    }
    const totalHandW = handCount ? (cardW * handCount + gap * Math.max(0, handCount - 1)) : 0;
    handStartX = handRect.x + handRect.w / 2 - totalHandW / 2;
    const handY = handRect.y + Math.max(0, handRect.h - cardH - 18);
    const hand = {
      rect:handRect,
      cards:handCards.map(function(card, index){
        return {
          index,
          iid:card && card.iid != null ? String(card.iid) : '',
          card,
          rect:rect(handStartX + index * (cardW + gap), handY, cardW, cardH),
          hitRect:rect(handStartX + index * (cardW + gap), handY, cardW, cardH)
        };
      })
    };

    const oppCount = oppCards.length;
    const denseOppHand = oppCount >= 9;
    const oppGap = denseOppHand ? 5 : 6;
    const oppCols = Math.min(4, Math.max(1, oppCount || 1));
    const oppRows = Math.max(1, Math.ceil(Math.max(1, oppCount) / 4));
    const hasRevealedOppCards = oppCards.some(function(card){ return !!(card && card.revealed); });
    const denseOppCardMaxW = denseOppHand ? (oppCount >= 9 ? 42 : 50) : 54;
    const denseOppCardMinW = denseOppHand ? (oppCount >= 9 ? 30 : 32) : 34;
    const baseOppCardW = hasRevealedOppCards && !denseOppHand
      ? clamp(winW * 0.038, 56, 66)
      : clamp(winW * (denseOppHand ? 0.027 : 0.034), denseOppCardMinW, denseOppCardMaxW);
    const baseOppCardH = Math.round(baseOppCardW * 1.4);
    const oppFallbackW = Math.max(190, baseOppCardW * oppCols + oppGap * Math.max(0, oppCols - 1) + 16);
    const oppFallbackH = baseOppCardH * oppRows + oppGap * Math.max(0, oppRows - 1) + 14;
    const oppFallback = rect(22, denseOppHand ? 134 : 146, oppFallbackW, oppFallbackH);
    let oppRect = elementViewportRect('#opp-hand', oppFallback);
    if(denseOppHand) {
      const denseInsetY = oppCount >= 9 ? 6 : 18;
      oppRect = rect(oppRect.x, oppRect.y + denseInsetY, oppRect.w, Math.max(1, oppRect.h - denseInsetY));
    }
    const minOppW = baseOppCardW * oppCols + oppGap * Math.max(0, oppCols - 1) + 16;
    const minOppH = baseOppCardH * oppRows + oppGap * Math.max(0, oppRows - 1) + 14;
    if(oppRows > 1 && oppRect.h < minOppH) {
      oppRect = rect(oppRect.x, oppRect.y, oppRect.w, minOppH);
    }
    const fitOppCardW = oppCount
      ? Math.max(30, Math.floor((oppRect.w - 16 - oppGap * Math.max(0, oppCols - 1)) / oppCols))
      : baseOppCardW;
    const oppCardW = Math.min(baseOppCardW, fitOppCardW);
    const oppCardH = Math.round(oppCardW * 1.4);
    const totalOppH = oppRows * oppCardH + oppGap * Math.max(0, oppRows - 1);
    const oppStartY = oppRect.y + Math.max(0, (oppRect.h - totalOppH) / 2);
    const opponentHand = {
      rect:oppRect,
      cards:oppCards.map(function(card, index){
        const row = Math.floor(index / 4);
        const col = index % 4;
        const rowCount = row === oppRows - 1 ? (oppCount - row * 4) : 4;
        const totalRowW = oppCardW * rowCount + oppGap * Math.max(0, rowCount - 1);
        const rowStartX = oppRect.x + Math.max(0, (oppRect.w - totalRowW) / 2);
        return {
          index,
          iid:card && card.iid != null ? String(card.iid) : '',
          card,
          playerIndex:opponent,
          faceDown:!(card && card.revealed),
          rect:rect(rowStartX + col * (oppCardW + oppGap), oppStartY + row * (oppCardH + oppGap), oppCardW, oppCardH)
        };
      })
    };

    function pile(playerIndex, pileName, selector){
      const player = players[playerIndex] || {};
      const isDeck = pileName === 'deck';
      const elRect = elementViewportRect(selector, null);
      if(!elRect) return null;
      return {
        playerIndex,
        pile:pileName,
        rect:elRect,
        hitRect:elRect,
        count:Number(isDeck ? player.deckCount : player.discardCount) || 0,
        topCard:isDeck ? null : (player.topDiscard || null)
      };
    }

    return {
      hand,
      opponentHand,
      piles:{
        items:[
          pile(viewer, 'deck', '#my-deck'),
          pile(viewer, 'discard', '#my-discard'),
          pile(opponent, 'deck', '#opp-deck'),
          pile(opponent, 'discard', '#opp-discard')
        ].filter(Boolean)
      }
    };
  }

  function rowDisplayOrder(rows, viewer){
    const base = rows.filter(function(row){ return row && row.r < 3; });
    const extras = rows.filter(function(row){ return row && row.r >= 3; });
    const ordered = viewer === 1
      ? [2, 1, 0].map(function(r){ return base.find(function(row){ return row.r === r; }); }).filter(Boolean)
      : [0, 1, 2].map(function(r){ return base.find(function(row){ return row.r === r; }); }).filter(Boolean);
    extras.forEach(function(row){
      if(row.owner === viewer) ordered.push(row);
      else ordered.unshift(row);
    });
    return ordered;
  }

  function buildLayout(snapshot, viewport, options){
    const started = nowMs();
    const snap = snapshot || getSnapshot();
    if(!snap || !Array.isArray(snap.board)) {
      lastLayout = null;
      lastReport = {
        available:false,
        reason:'snapshot-unavailable',
        builds:buildCount,
        lastMs:0
      };
      return null;
    }

    const vp = Object.assign({x:0, y:0, w:1280, h:720, dpr:1, renderScale:1}, viewport || {});
    const opts = options || {};
    const zoneCount = Math.max(1, snap.board.length);
    const useProductionCss = opts.productionCss !== false;
    const cssMetrics = useProductionCss ? buildProductionBoardMetrics(vp, Object.assign({}, opts, {zoneCount})) : null;
    const pad = cssMetrics ? cssMetrics.boardPadX : (Number.isFinite(opts.padding) ? opts.padding : clamp(vp.w * 0.008, 8, 18));
    const zoneGap = cssMetrics ? cssMetrics.boardGap : (Number.isFinite(opts.zoneGap) ? opts.zoneGap : clamp(vp.w * 0.007, 8, 16));
    const rowGap = cssMetrics ? cssMetrics.rowGap : (Number.isFinite(opts.rowGap) ? opts.rowGap : clamp(vp.h * 0.006, 4, 8));
    const cellGap = cssMetrics ? cssMetrics.cellGap : (Number.isFinite(opts.cellGap) ? opts.cellGap : clamp(vp.w * 0.003, 4, 7));
    const headerH = cssMetrics ? cssMetrics.headerTrackH : (Number.isFinite(opts.headerH) ? opts.headerH : clamp(vp.h * 0.055, 34, 48));
    const labelW = cssMetrics ? cssMetrics.rowLabelW : (Number.isFinite(opts.rowLabelW) ? opts.rowLabelW : clamp(vp.w * 0.045, 54, 76));
    const boardRect = rect(vp.x, vp.y, vp.w, vp.h);
    const innerX = vp.x + pad;
    const innerY = vp.y + (cssMetrics ? cssMetrics.boardPadTop : pad);
    const innerW = Math.max(1, vp.w - pad * 2);
    const innerH = Math.max(1, vp.h - (cssMetrics ? cssMetrics.boardPadTop + cssMetrics.boardPadBottom : pad * 2));
    const fluidZoneW = Math.max(1, (innerW - zoneGap * (zoneCount - 1)) / zoneCount);
    const zoneW = cssMetrics ? Math.min(cssMetrics.zoneFitW, fluidZoneW) : fluidZoneW;
    const cardRects = [];
    const totalZoneW = zoneW * zoneCount + zoneGap * Math.max(0, zoneCount - 1);
    const firstZoneX = cssMetrics ? (innerX + Math.max(0, (innerW - totalZoneW) / 2)) : innerX;

    const zones = snap.board.map(function(zone, zoneIndex){
      const z = typeof zone.z === 'number' ? zone.z : zoneIndex;
      const rowsSource = Array.isArray(zone.rows) ? zone.rows : [];
      const rowsOrdered = rowDisplayOrder(rowsSource, snap.viewer);
      const rowCount = Math.max(1, rowsOrdered.length || 3);
      const visibleRowCount = Math.min(3, Math.max(1, rowCount));
      const rowH = cssMetrics
        ? cssMetrics.rowH
        : (rowsOrdered.length ? Math.max(1, (innerH - headerH - rowGap * rowsOrdered.length) / rowsOrdered.length) : innerH);
      const rowsAreaH = cssMetrics
        ? (rowH * visibleRowCount + rowGap * Math.max(0, visibleRowCount - 1))
        : Math.max(1, innerH - headerH - rowGap);
      const zoneH = cssMetrics
        ? (cssMetrics.zonePadTop + headerH + rowsAreaH + cssMetrics.zonePadBottom)
        : innerH;
      const zoneX = firstZoneX + zoneIndex * (zoneW + zoneGap);
      const zoneY = cssMetrics ? (innerY + Math.max(0, (innerH - zoneH) * cssMetrics.zoneVerticalAlign)) : innerY;
      const rowsAreaY = zoneY + (cssMetrics ? cssMetrics.zonePadTop : 0) + headerH;

      const rows = rowsOrdered.map(function(row, rowIndex){
        const rowY = rowsAreaY + rowIndex * (rowH + rowGap);
        const cells = Array.isArray(row.cells) ? row.cells : [];
        const colCount = Math.max(1, cells.length || 3);
        const cellsW = cssMetrics
          ? (cssMetrics.cardW * colCount + cellGap * Math.max(0, colCount - 1))
          : Math.max(1, zoneW - labelW);
        const rawCellW = Math.max(1, (cellsW - cellGap * Math.max(0, colCount - 1)) / colCount);
        const cardH = cssMetrics ? cssMetrics.cardH : Math.max(1, rowH);
        const idealCardW = cardH * (5 / 7);
        const cellW = cssMetrics ? cssMetrics.cardW : Math.min(rawCellW, idealCardW);
        const usedCellsW = cellW * colCount + cellGap * Math.max(0, colCount - 1);
        const rowContentW = labelW + (cssMetrics ? cssMetrics.rowLabelGap : 0) + usedCellsW;
        const rowContentStartX = cssMetrics
          ? zoneX + cssMetrics.zonePadX + Math.max(0, (zoneW - cssMetrics.zonePadX * 2 - rowContentW) / 2)
          : zoneX;
        const cellsX = cssMetrics ? rowContentStartX + labelW + cssMetrics.rowLabelGap : zoneX + labelW;
        const startX = cellsX + Math.max(0, (cellsW - usedCellsW) / 2);
        const cards = cells.map(function(cell, cellIndex){
          const cellX = startX + cellIndex * (cellW + cellGap);
          const cardY = rowY + Math.max(0, (rowH - cardH) / 2) + (cssMetrics ? cssMetrics.cardOffsetY : 0);
          const addedCell = !!(cell && (cell.extra || cell.markSafe || row.r >= 3));
          const cardInset = addedCell ? Math.max(2, Math.min(5, cellW * .035)) : 0;
          const cardDrift = addedCell ? (((cellIndex % 2) ? 1 : -1) * Math.max(1.5, Math.min(4, cellW * .025))) : 0;
          const cellRect = rect(cellX, cardY, cellW, cardH);
          const cardRect = rect(
            cellX + cardInset + cardDrift,
            cardY + cardInset,
            Math.max(1, cellW - cardInset * 2),
            Math.max(1, cardH - cardInset * 2)
          );
          const entry = {
            z,
            r:row.r,
            c:typeof cell.c === 'number' ? cell.c : cellIndex,
            rect:cellRect,
            cardRect,
            hasCard:!!cell.card,
            blocked:cell.blocked || null,
            markSafe:!!cell.markSafe,
            extra:!!cell.extra,
            card:cell.card || null
          };
          if(entry.hasCard) cardRects.push(entry);
          return entry;
        });
        return {
          z,
          r:row.r,
          owner:row.owner,
          fullExtraRow:!!row.fullExtraRow,
          rect:rect(zoneX, rowY, zoneW, rowH),
          labelRect:rect(rowContentStartX, rowY, labelW, rowH),
          cellsRect:rect(cellsX, rowY, cellsW, rowH),
          cells:cards
        };
      });

      return {
        z,
        rect:rect(zoneX, zoneY, zoneW, zoneH),
        headerRect:rect(zoneX, zoneY, zoneW, headerH),
        rowsRect:rect(zoneX, rowsAreaY, zoneW, rowsAreaH),
        rowsContentRect:rect(zoneX, rowsAreaY, zoneW, rowH * rowCount + rowGap * Math.max(0, rowCount - 1)),
        hasExtraRows:rowCount > visibleRowCount,
        rows
      };
    });

    const peripheral = buildPeripheralLayout(snap, Object.assign({}, vp, {windowW:vp.windowW, windowH:vp.windowH}), cssMetrics || {});
    const layout = {
      version:LAYOUT_VERSION,
      snapshotSignature:snap.signature || '',
      createdAt:Date.now(),
      viewport:{
        x:round(vp.x),
        y:round(vp.y),
        w:round(vp.w),
        h:round(vp.h),
        dpr:round(vp.dpr || 1),
        renderScale:round(vp.renderScale || 1)
      },
      metrics:{
        productionCss:!!cssMetrics,
        cardW:cssMetrics ? round(cssMetrics.cardW) : undefined,
        cardH:cssMetrics ? round(cssMetrics.cardH) : undefined,
        padding:round(pad),
        zoneGap:round(zoneGap),
        rowGap:round(rowGap),
        cellGap:round(cellGap),
        headerH:round(headerH),
        rowLabelW:round(labelW),
        rowLabelGap:cssMetrics ? round(cssMetrics.rowLabelGap) : undefined,
        cardOffsetY:cssMetrics ? round(cssMetrics.cardOffsetY) : undefined,
        zoneVerticalAlign:cssMetrics ? round(cssMetrics.zoneVerticalAlign) : undefined,
        zoneFitW:cssMetrics ? round(cssMetrics.zoneFitW) : undefined
      },
      boardRect,
      zones,
      cardRects,
      hand:peripheral.hand,
      opponentHand:peripheral.opponentHand,
      piles:peripheral.piles
    };

    buildCount++;
    lastLayout = layout;
    lastReport = {
      available:true,
      version:LAYOUT_VERSION,
      builds:buildCount,
      snapshotSignature:layout.snapshotSignature,
      viewport:layout.viewport,
      zones:zones.length,
      rows:zones.reduce(function(total, zone){ return total + zone.rows.length; }, 0),
      cells:zones.reduce(function(total, zone){
        return total + zone.rows.reduce(function(rowTotal, row){ return rowTotal + row.cells.length; }, 0);
      }, 0),
      cards:cardRects.length,
      handCards:layout.hand && layout.hand.cards ? layout.hand.cards.length : 0,
      opponentHandCards:layout.opponentHand && layout.opponentHand.cards ? layout.opponentHand.cards.length : 0,
      piles:layout.piles && layout.piles.items ? layout.piles.items.length : 0,
      lastMs:round(nowMs() - started)
    };
    return layout;
  }

  function buildFromCurrent(options){
    const opts = options || {};
    const snapshot = opts.snapshot || (opts.useLastSnapshot && window.FateRenderSnapshot && typeof window.FateRenderSnapshot.last === 'function'
      ? window.FateRenderSnapshot.last()
      : getSnapshot());
    return buildLayout(snapshot, opts.viewport || getBoardViewport(), opts);
  }

  function getReport(){
    buildFromCurrent();
    return lastReport ? Object.assign({}, lastReport) : {available:false, reason:'not-built'};
  }

  window.FateMatchLayoutEngine = {
    version:LAYOUT_VERSION,
    build:buildLayout,
    buildFromCurrent,
    report:getReport,
    getBoardViewport,
    last:function(){ return lastLayout; }
  };
  window.fateBuildMatchLayout = buildFromCurrent;
  window.fateMatchLayoutReport = getReport;
})();
