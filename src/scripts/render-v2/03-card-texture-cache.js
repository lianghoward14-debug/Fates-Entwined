(function(){
  'use strict';

  if(typeof window === 'undefined') return;
  if(window.FateCardTextureCache) return;

  const CACHE_VERSION = 4;
  const artRecords = new Map();
  const baseRecords = new Map();
  const stats = {
    requests:0,
    hits:0,
    misses:0,
    baseRequests:0,
    baseHits:0,
    baseFallbackHits:0,
    baseMisses:0,
    baseBuilds:0,
    basePending:0,
    loads:0,
    failures:0,
    fallbackLoads:0,
    decodeAttempts:0,
    decodeSuccesses:0,
    bitmapAttempts:0,
    bitmapSuccesses:0,
    evictions:0,
    clears:0
  };
  const defaults = {
    maxEntries:160,
    maxPixels:72000000,
    fallbackDelayMs:850
  };

  function nowMs(){
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function roundMs(value){
    return Math.round((Number(value) || 0) * 10) / 10;
  }

  function normalizeSrc(src){
    return String(src || '').trim();
  }

  function fallbackFor(src){
    const key = normalizeSrc(src);
    if(!key) return '';
    try {
      if(typeof window.getFullCardImageFallbackSrc === 'function') return window.getFullCardImageFallbackSrc(key) || '';
    } catch(e) {}
    try {
      if(location.protocol !== 'file:' && !/Electron/i.test(navigator.userAgent || '')) return key;
    } catch(e) {}
    return key.replace(/(?:^|\/)optimized\/card-thumbs\/([A-Za-z0-9_-]+)\.jpg(?:[?#].*)?$/, '$1.png');
  }

  function notify(rec, reason){
    rec.lastNotifyReason = reason || '';
    rec.callbacks.forEach(function(cb){
      try { cb(rec, reason || 'change'); } catch(e) {}
    });
  }

  function estimatePixels(rec){
    const img = rec.img;
    const w = img ? (img.naturalWidth || img.width || 0) : 0;
    const h = img ? (img.naturalHeight || img.height || 0) : 0;
    rec.width = w;
    rec.height = h;
    rec.pixels = Math.max(0, w * h);
    return rec.pixels;
  }

  function tryCloseBitmap(rec){
    try {
      if(rec && rec.bitmap && typeof rec.bitmap.close === 'function') rec.bitmap.close();
    } catch(e) {}
    if(rec) rec.bitmap = null;
  }

  function currentTotalPixels(){
    let total = 0;
    artRecords.forEach(function(rec){ total += Number(rec.pixels) || 0; });
    baseRecords.forEach(function(rec){ total += Number(rec.pixels) || 0; });
    return total;
  }

  function recordCount(){
    return artRecords.size + baseRecords.size;
  }

  function prune(){
    const maxEntries = defaults.maxEntries;
    const maxPixels = defaults.maxPixels;
    let totalPixels = currentTotalPixels();
    if(recordCount() <= maxEntries && totalPixels <= maxPixels) return 0;

    const candidates = Array.from(artRecords.entries()).map(function(pair){ return {type:'art', key:pair[0], rec:pair[1]}; })
      .concat(Array.from(baseRecords.entries()).map(function(pair){ return {type:'base', key:pair[0], rec:pair[1]}; }))
      .filter(function(item){ return !item.rec.pending; })
      .sort(function(a, b){ return (a.rec.lastUsed || 0) - (b.rec.lastUsed || 0); });

    let removed = 0;
    for(let i = 0; i < candidates.length; i++){
      if(recordCount() <= maxEntries && totalPixels <= maxPixels) break;
      const key = candidates[i].key;
      const rec = candidates[i].rec;
      totalPixels -= Number(rec.pixels) || 0;
      tryCloseBitmap(rec);
      if(candidates[i].type === 'base') baseRecords.delete(key);
      else artRecords.delete(key);
      removed++;
      stats.evictions++;
    }
    return removed;
  }

  function maybeDecode(rec){
    const img = rec.img;
    if(!img || rec.decodeAttempted) return;
    if(typeof img.decode !== 'function') return;
    rec.decodeAttempted = true;
    stats.decodeAttempts++;
    const started = nowMs();
    img.decode().then(function(){
      rec.decodeMs = roundMs(nowMs() - started);
      stats.decodeSuccesses++;
    }).catch(function(){});
  }

  function maybeBuildBitmap(rec){
    const img = rec.img;
    if(!img || rec.bitmapAttempted || typeof window.createImageBitmap !== 'function') return;
    if(!(img.naturalWidth || img.width)) return;
    rec.bitmapAttempted = true;
    stats.bitmapAttempts++;
    const started = nowMs();
    window.createImageBitmap(img).then(function(bitmap){
      rec.bitmap = bitmap;
      rec.bitmapMs = roundMs(nowMs() - started);
      stats.bitmapSuccesses++;
      notify(rec, 'bitmap-ready');
      prune();
    }).catch(function(){});
  }

  function startLoad(rec, src, isFallback){
    const img = rec.img || new Image();
    rec.img = img;
    rec.pending = true;
    rec.failed = false;
    rec.currentSrc = src;
    rec.startedAt = Date.now();
    rec.startedMs = nowMs();
    rec.decodeAttempted = false;
    rec.bitmapAttempted = false;
    tryCloseBitmap(rec);

    img.decoding = 'async';
    img.loading = 'eager';
    try { img.fetchPriority = 'high'; } catch(e) {}

    img.onload = function(){
      rec.loaded = true;
      rec.pending = false;
      rec.failed = false;
      rec.loadedAt = Date.now();
      rec.loadMs = roundMs(nowMs() - rec.startedMs);
      rec.lastUsed = nowMs();
      estimatePixels(rec);
      stats.loads++;
      if(isFallback) stats.fallbackLoads++;
      maybeDecode(rec);
      maybeBuildBitmap(rec);
      notify(rec, 'image-load');
      prune();
    };
    img.onerror = function(){
      if(!rec.fallbackTried && rec.fallbackSrc && rec.fallbackSrc !== rec.currentSrc) {
        rec.fallbackTried = true;
        startLoad(rec, rec.fallbackSrc, true);
        return;
      }
      rec.pending = false;
      rec.loaded = false;
      rec.failed = true;
      rec.failedAt = Date.now();
      stats.failures++;
      notify(rec, 'image-error');
    };
    img.src = src;
    if(img.complete && (img.naturalWidth || img.width)){
      rec.loaded = true;
      rec.pending = false;
      rec.failed = false;
      estimatePixels(rec);
      maybeDecode(rec);
      maybeBuildBitmap(rec);
    }
  }

  function getArtBitmap(src, options){
    const key = normalizeSrc(src);
    if(!key) return null;
    const opts = options || {};
    stats.requests++;
    let rec = artRecords.get(key);
    if(rec) {
      stats.hits++;
      rec.lastUsed = nowMs();
      rec.useCount++;
      if(typeof opts.onChange === 'function') rec.callbacks.add(opts.onChange);
      if(!rec.loaded && !rec.failed && rec.img && rec.img.complete && (rec.img.naturalWidth || rec.img.width)) {
        rec.loaded = true;
        rec.pending = false;
        estimatePixels(rec);
        maybeDecode(rec);
        maybeBuildBitmap(rec);
      }
      return rec;
    }

    stats.misses++;
    rec = {
      key,
      img:null,
      bitmap:null,
      loaded:false,
      pending:false,
      failed:false,
      fallbackTried:false,
      fallbackSrc:fallbackFor(key),
      currentSrc:key,
      callbacks:new Set(),
      createdAt:Date.now(),
      lastUsed:nowMs(),
      useCount:1,
      pixels:0,
      width:0,
      height:0,
      source:opts.source || ''
    };
    if(typeof opts.onChange === 'function') rec.callbacks.add(opts.onChange);
    artRecords.set(key, rec);
    startLoad(rec, key, false);
    setTimeout(function(){
      if(rec.loaded || rec.failed || rec.fallbackTried || !rec.fallbackSrc || rec.fallbackSrc === rec.currentSrc) return;
      rec.fallbackTried = true;
      startLoad(rec, rec.fallbackSrc, true);
    }, defaults.fallbackDelayMs);
    prune();
    return rec;
  }

  function preload(src, options){
    return getArtBitmap(src, options || {source:'preload'});
  }

  function dprBucket(value){
    const dpr = Number(value || window.devicePixelRatio || 1);
    if(dpr >= 2.4) return '2.5x';
    if(dpr >= 2.2) return '2.25x';
    if(dpr >= 2) return '2x';
    if(dpr >= 1.5) return '1.5x';
    return '1x';
  }

  function cardTextureSrc(card, options){
    const opts = options || {};
    const visual = opts.visual || (card && card.visual) || null;
    if(opts.preferFullArt) return normalizeSrc(opts.src || (visual && (visual.img || visual.runtimeImg)) || (card && (card.img || card.runtimeImg)) || '');
    return normalizeSrc(opts.src || (visual && (visual.runtimeImg || visual.img)) || (card && (card.runtimeImg || card.img)) || '');
  }

  function buildBaseKey(card, size, options){
    const opts = options || {};
    const visual = opts.visual || (card && card.visual) || null;
    const width = Math.max(1, Math.round(Number(size && size.w) || Number(size && size.width) || opts.width || 1));
    const height = Math.max(1, Math.round(Number(size && size.h) || Number(size && size.height) || opts.height || 1));
    const img = cardTextureSrc(card, opts);
    const hidden = !!(opts.faceDown || (card && (card.faceDown || card.hidden)) || (visual && visual.isHidden));
    const id = card && card.id != null ? card.id : (card && card.iid != null ? card.iid : '');
    const rarity = card && card.rarity ? card.rarity : '';
    const aff = card && card.aff ? card.aff : (visual && visual.aff ? visual.aff : '');
    const fitMode = String(opts.fitMode || opts.fit || 'cover').toLowerCase() === 'contain' ? 'contain' : 'cover';
    return [
      id,
      img,
      hidden ? 'down' : 'up',
      rarity,
      aff,
      fitMode,
      width,
      height,
      dprBucket(opts.dpr)
    ].join('|');
  }

  function baseIdentity(card, options){
    const opts = options || {};
    const visual = opts.visual || (card && card.visual) || null;
    const hidden = !!(opts.faceDown || (card && (card.faceDown || card.hidden)) || (visual && visual.isHidden));
    return {
      id:String(card && card.id != null ? card.id : (card && card.iid != null ? card.iid : '')),
      img:cardTextureSrc(card, opts),
      hidden:hidden ? 'down' : 'up',
      rarity:String(card && card.rarity ? card.rarity : ''),
      aff:String(card && card.aff ? card.aff : (visual && visual.aff ? visual.aff : '')),
      fitMode:String(opts.fitMode || opts.fit || 'cover').toLowerCase() === 'contain' ? 'contain' : 'cover',
      dpr:dprBucket(opts.dpr)
    };
  }

  function recordMatchesIdentity(rec, identity){
    if(!rec || !identity) return false;
    if(rec.cardId != null) {
      return String(rec.cardId) === identity.id &&
        String(rec.artSrc || '') === identity.img &&
        String(rec.hiddenKey || '') === identity.hidden &&
        String(rec.rarityKey || '') === identity.rarity &&
        String(rec.affKey || '') === identity.aff &&
        String(rec.fitMode || 'cover') === identity.fitMode &&
        String(rec.dprKey || dprBucket(rec.dpr)) === identity.dpr;
    }
    const parts = String(rec.key || '').split('|');
    return parts.length >= 9 &&
      parts[0] === identity.id &&
      parts[1] === identity.img &&
      parts[2] === identity.hidden &&
      parts[3] === identity.rarity &&
      parts[4] === identity.aff &&
      parts[5] === identity.fitMode &&
      parts[8] === identity.dpr;
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

  function drawImageContain(ctx, img, x, y, w, h){
    try {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    } catch(e) {}
    const iw = img.naturalWidth || img.width || 1;
    const ih = img.naturalHeight || img.height || 1;
    const scale = Math.min(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
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

  function buildBaseTexture(rec, artRec, visual){
    const img = artRec && (artRec.bitmap || artRec.img);
    if(!img || !artRec.loaded || artRec.failed) return false;
    const canvas = document.createElement('canvas');
    const dpr = rec.dpr;
    canvas.width = Math.max(1, Math.round(rec.width * dpr));
    canvas.height = Math.max(1, Math.round(rec.height * dpr));
    const ctx = canvas.getContext('2d', {alpha:true});
    if(!ctx) return false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rec.width;
    const h = rec.height;
    const radius = Math.max(3, Math.min(8, w * .045));

    if(rec.fitMode !== 'contain'){
      roundedPath(ctx, 0, 0, w, h, radius);
      ctx.fillStyle = '#070910';
      ctx.fill();
    }

    ctx.save();
    roundedPath(ctx, 0, 0, w, h, radius);
    ctx.clip();
    if(rec.fitMode === 'contain') drawImageContain(ctx, img, 0, 0, w, h);
    else drawImageCover(ctx, img, 0, 0, w, h);
    const fade = ctx.createLinearGradient(0, h * .52, 0, h);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,.22)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    rec.canvas = canvas;
    rec.loaded = true;
    rec.pending = false;
    rec.failed = false;
    rec.builtAt = Date.now();
    rec.lastUsed = nowMs();
    rec.pixels = canvas.width * canvas.height;
    rec.visualHidden = !!(visual && visual.isHidden);
    stats.baseBuilds++;
    notify(rec, 'base-ready');
    prune();
    return true;
  }

  function getBaseCardTexture(card, size, options){
    const opts = options || {};
    const visual = opts.visual || (card && card.visual) || null;
    const key = buildBaseKey(card, size, opts);
    const width = Math.max(1, Math.round(Number(size && size.w) || Number(size && size.width) || opts.width || 1));
    const height = Math.max(1, Math.round(Number(size && size.h) || Number(size && size.height) || opts.height || 1));
    const dpr = Math.max(1, Number(opts.dpr || window.devicePixelRatio || 1));
    stats.baseRequests++;
    let rec = baseRecords.get(key);
    if(rec){
      stats.baseHits++;
      rec.lastUsed = nowMs();
      rec.useCount++;
      if(typeof opts.onChange === 'function') rec.callbacks.add(opts.onChange);
      return rec;
    }
    if(opts.noCreate || opts.peekOnly) return null;

    stats.baseMisses++;
    rec = {
      key,
      type:'base',
      canvas:null,
      loaded:false,
      pending:true,
      failed:false,
      callbacks:new Set(),
      createdAt:Date.now(),
      lastUsed:nowMs(),
      useCount:1,
      width,
      height,
      dpr,
      dprKey:dprBucket(dpr),
      cardId:String(card && card.id != null ? card.id : (card && card.iid != null ? card.iid : '')),
      hiddenKey:baseIdentity(card, opts).hidden,
      rarityKey:String(card && card.rarity ? card.rarity : ''),
      affKey:String(card && card.aff ? card.aff : (visual && visual.aff ? visual.aff : '')),
      fitMode:String(opts.fitMode || opts.fit || 'cover').toLowerCase() === 'contain' ? 'contain' : 'cover',
      pixels:0,
      artSrc:cardTextureSrc(card, opts)
    };
    if(typeof opts.onChange === 'function') rec.callbacks.add(opts.onChange);
    baseRecords.set(key, rec);

    const artRec = getArtBitmap(rec.artSrc, {
      source:'base-texture',
      onChange:function(nextArt){
        buildBaseTexture(rec, nextArt, visual);
      }
    });
    if(!artRec || artRec.failed){
      rec.pending = false;
      rec.failed = true;
      notify(rec, 'base-art-unavailable');
    } else if(!buildBaseTexture(rec, artRec, visual)) {
      stats.basePending++;
    }
    prune();
    return rec;
  }

  function peekBaseCardTexture(card, size, options){
    const opts = Object.assign({}, options || {}, {noCreate:true, peekOnly:true});
    const key = buildBaseKey(card, size, opts);
    return baseRecords.get(key) || null;
  }

  function findReadyBaseCardTexture(card, size, options){
    const opts = options || {};
    const identity = baseIdentity(card, opts);
    const width = Math.max(1, Math.round(Number(size && size.w) || Number(size && size.width) || opts.width || 1));
    const height = Math.max(1, Math.round(Number(size && size.h) || Number(size && size.height) || opts.height || 1));
    let best = null;
    let bestScore = Infinity;
    baseRecords.forEach(function(rec){
      if(!rec || !rec.loaded || !rec.canvas || rec.failed) return;
      if(!recordMatchesIdentity(rec, identity)) return;
      const score = Math.abs((Number(rec.width) || 0) - width) + Math.abs((Number(rec.height) || 0) - height);
      if(score < bestScore) {
        best = rec;
        bestScore = score;
      }
    });
    if(best) {
      stats.baseFallbackHits++;
      best.lastUsed = nowMs();
      best.useCount++;
    }
    return best;
  }

  function isBaseCardTextureReady(card, size, options){
    const rec = peekBaseCardTexture(card, size, options || {});
    return !!(rec && rec.loaded && rec.canvas && !rec.failed);
  }

  function collectVisibleCards(snapshot, layout){
    const items = [];
    if(layout && Array.isArray(layout.cardRects)){
      layout.cardRects.forEach(function(entry){
        if(entry && entry.card) items.push({card:entry.card, rect:entry.cardRect || entry.rect, source:'board'});
      });
    }
    if(snapshot && Array.isArray(snapshot.players)){
      snapshot.players.forEach(function(player){
        (player.hand || []).forEach(function(card){
          if(card && card.revealed !== false) items.push({card, rect:null, source:player.isViewer ? 'own-hand' : 'visible-hand'});
        });
        if(player.topDiscard) items.push({card:player.topDiscard, rect:null, source:'discard'});
      });
    }
    return items;
  }

  function preloadVisible(snapshot, layout){
    const items = collectVisibleCards(snapshot, layout);
    const boardDpr = Math.min(2.5, Math.max(2.25, Number(window.devicePixelRatio || 1)));
    let requested = 0;
    items.forEach(function(item){
      const visual = item.card && item.card.visual;
      const src = cardTextureSrc(item.card, {visual});
      if(!src) return;
      preload(src, {source:item.source || 'visible'});
      if(item.rect) getBaseCardTexture(item.card, {w:item.rect.w, h:item.rect.h}, {
        visual,
        source:item.source || 'visible',
        preferFullArt:true,
        dpr:item.source === 'board' ? boardDpr : undefined
      });
      requested++;
    });
    return {requested, items:items.length, report:report()};
  }

  function clearUnused(activeKeys){
    const keep = new Set((activeKeys || []).map(String));
    let removed = 0;
    if(!keep.size) return {removed, report:report()};
    artRecords.forEach(function(rec, key){
      if(keep.has(key)) return;
      tryCloseBitmap(rec);
      artRecords.delete(key);
      removed++;
    });
    baseRecords.forEach(function(rec, key){
      if(keep.has(key) || keep.has(rec.artSrc)) return;
      baseRecords.delete(key);
      removed++;
    });
    return {removed, report:report()};
  }

  function pendingCount(){
    let pending = 0;
    artRecords.forEach(function(rec){ if(rec.pending && !rec.failed) pending++; });
    baseRecords.forEach(function(rec){ if(rec.pending && !rec.failed) pending++; });
    return pending;
  }

  function loadedCount(){
    let loaded = 0;
    artRecords.forEach(function(rec){ if(rec.loaded && !rec.failed) loaded++; });
    baseRecords.forEach(function(rec){ if(rec.loaded && !rec.failed) loaded++; });
    return loaded;
  }

  function bitmapCount(){
    let bitmaps = 0;
    artRecords.forEach(function(rec){ if(rec.bitmap) bitmaps++; });
    return bitmaps;
  }

  function failedCount(){
    let failed = 0;
    artRecords.forEach(function(rec){ if(rec.failed) failed++; });
    baseRecords.forEach(function(rec){ if(rec.failed) failed++; });
    return failed;
  }

  function report(){
    const totalPixels = currentTotalPixels();
    const recent = Array.from(artRecords.values()).concat(Array.from(baseRecords.values()))
      .sort(function(a, b){ return (b.lastUsed || 0) - (a.lastUsed || 0); })
      .slice(0, 8)
      .map(function(rec){
        return {
          key:rec.key,
          type:rec.type || 'art',
          loaded:!!rec.loaded,
          pending:!!rec.pending,
          failed:!!rec.failed,
          bitmap:!!rec.bitmap,
          canvas:!!rec.canvas,
          width:rec.width || 0,
          height:rec.height || 0,
          pixels:rec.pixels || 0,
          useCount:rec.useCount || 0,
          loadMs:rec.loadMs || 0,
          decodeMs:rec.decodeMs || 0,
          bitmapMs:rec.bitmapMs || 0,
          fallbackTried:!!rec.fallbackTried,
          currentSrc:rec.currentSrc || ''
        };
      });
    return {
      available:true,
      version:CACHE_VERSION,
      entries:recordCount(),
      artEntries:artRecords.size,
      baseEntries:baseRecords.size,
      loaded:loadedCount(),
      pending:pendingCount(),
      failed:failedCount(),
      bitmaps:bitmapCount(),
      totalPixels,
      estimatedBytes:totalPixels * 4,
      maxEntries:defaults.maxEntries,
      maxPixels:defaults.maxPixels,
      stats:Object.assign({}, stats),
      recent
    };
  }

  function clear(){
    artRecords.forEach(tryCloseBitmap);
    artRecords.clear();
    baseRecords.clear();
    stats.clears++;
    return report();
  }

  function configure(options){
    const opts = options || {};
    if(Number.isFinite(opts.maxEntries)) defaults.maxEntries = Math.max(16, Math.floor(opts.maxEntries));
    if(Number.isFinite(opts.maxPixels)) defaults.maxPixels = Math.max(1000000, Math.floor(opts.maxPixels));
    if(Number.isFinite(opts.fallbackDelayMs)) defaults.fallbackDelayMs = Math.max(100, Math.floor(opts.fallbackDelayMs));
    prune();
    return report();
  }

  window.FateCardTextureCache = {
    version:CACHE_VERSION,
    get:getArtBitmap,
    preload,
    preloadVisible,
    getBaseCardTexture,
    peekBaseCardTexture,
    findReadyBaseCardTexture,
    isBaseCardTextureReady,
    getArtBitmap,
    clearUnused,
    report,
    getReport:report,
    clear,
    configure,
    prune
  };
  window.fateCardTextureCacheReport = report;
  window.fateClearCardTextureCache = clear;
})();
