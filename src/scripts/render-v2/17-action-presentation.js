(function(){
  'use strict';

  if(typeof window === 'undefined') return;
  if(window.FateActionPresentation) return;

  const VERSION = 1;
  const recent = [];
  let active = null;
  let nextId = 1;

  function nowMs(){
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function textureReport(){
    try {
      if(window.FateCardTextureCache && typeof window.FateCardTextureCache.report === 'function') {
        return window.FateCardTextureCache.report() || null;
      }
    } catch(e) {}
    return null;
  }

  function textureCounter(report, key){
    return Number(report && report[key]) || 0;
  }

  function schedule(fn, delay){
    const ms = Math.max(0, Number(delay) || 0);
    if(ms <= 0) {
      requestAnimationFrame(function(){ fn(); });
      return;
    }
    setTimeout(function(){ requestAnimationFrame(function(){ fn(); }); }, ms);
  }

  function markActive(tx){
    active = tx;
    try {
      if(window.G) {
        window.G._actionPresentationActive = tx;
        window.G._actionPresentationLockUntil = Date.now() + Math.max(120, Number(tx.lockMs) || 240);
      }
    } catch(e) {}
  }

  function clearActive(tx){
    if(active && tx && active.id !== tx.id) return;
    active = null;
    try {
      if(window.G && window.G._actionPresentationActive && window.G._actionPresentationActive.id === tx.id) {
        window.G._actionPresentationActive = null;
      }
    } catch(e) {}
  }

  function finish(tx, status){
    tx.finishedAt = nowMs();
    tx.totalMs = Math.round((tx.finishedAt - tx.startedAt) * 10) / 10;
    tx.status = status || tx.status || 'complete';
    tx.textureAfter = textureReport();
    tx.textureDelta = {
      baseRequests:textureCounter(tx.textureAfter, 'baseRequests') - textureCounter(tx.textureBefore, 'baseRequests'),
      baseMisses:textureCounter(tx.textureAfter, 'baseMisses') - textureCounter(tx.textureBefore, 'baseMisses'),
      requests:textureCounter(tx.textureAfter, 'requests') - textureCounter(tx.textureBefore, 'requests'),
      misses:textureCounter(tx.textureAfter, 'misses') - textureCounter(tx.textureBefore, 'misses')
    };
    recent.unshift({
      id:tx.id,
      type:tx.type,
      status:tx.status,
      totalMs:tx.totalMs,
      presentMs:tx.presentMs || 0,
      commitMs:tx.commitMs || 0,
      renderHint:tx.renderHint || '',
      textureDelta:tx.textureDelta,
      at:Math.round(tx.startedAt)
    });
    recent.length = Math.min(recent.length, 16);
    clearActive(tx);
    return tx;
  }

  function createTransaction(type, options){
    const opts = options || {};
    const tx = {
      id:'action-tx:' + (nextId++),
      type:String(type || 'action'),
      status:'active',
      startedAt:nowMs(),
      textureBefore:textureReport(),
      lockMs:opts.lockMs,
      renderHint:opts.renderHint || ''
    };
    markActive(tx);
    return tx;
  }

  function suppressInitialPlacement(iid, duration){
    try {
      const adapter = window.FateMatchRendererAdapter;
      if(adapter && typeof adapter.suppressInitialPlacementMotion === 'function') {
        adapter.suppressInitialPlacementMotion(iid, duration || 420);
      }
    } catch(e) {}
  }

  function beginSetCard(options){
    const opts = options || {};
    if(active) return false;
    if(typeof opts.commit !== 'function') return false;
    const delay = Math.max(0, Number(opts.delayMs == null ? 32 : opts.delayMs) || 0);
    const tx = createTransaction('set-card', {
      lockMs:delay + 360,
      renderHint:'one commit render after hand-to-board mutation'
    });
    tx.cardName = opts.card && opts.card.name || opts.inst && opts.inst.name || '';
    tx.target = opts.target || null;
    suppressInitialPlacement(opts.inst && opts.inst.iid, delay + 420);
    try {
      if(opts.sourceCard) opts.sourceCard._presentationDeparting = true;
    } catch(e) {}
    schedule(function(){
      const commitStart = nowMs();
      try {
        if(opts.sourceCard) delete opts.sourceCard._presentationDeparting;
      } catch(e) {}
      try {
        opts.commit(tx);
        tx.commitMs = Math.round((nowMs() - commitStart) * 10) / 10;
        finish(tx, 'complete');
      } catch(err) {
        tx.error = String(err && err.message || err);
        console.error('Set-card presentation transaction failed', err);
        try { if(typeof opts.rollback === 'function') opts.rollback(tx, err); } catch(e) {}
        finish(tx, 'failed');
      }
    }, delay);
    return true;
  }

  function beginConsolidation(options){
    const opts = options || {};
    if(active) return false;
    if(typeof opts.commit !== 'function') return false;
    const tx = createTransaction('consolidation', {
      lockMs:Number(opts.lockMs) || 1200,
      renderHint:'presentation before tribute removal and result commit'
    });
    tx.tributeCount = Array.isArray(opts.tributes) ? opts.tributes.length : 0;
    let delay = 0;
    const presentStart = nowMs();
    try {
      if(typeof opts.present === 'function') delay = Math.max(0, Number(opts.present(tx)) || 0);
    } catch(err) {
      tx.presentError = String(err && err.message || err);
      console.warn('Consolidation presentation failed; committing without presentation', err);
      delay = 0;
    }
    tx.presentMs = Math.round((nowMs() - presentStart) * 10) / 10;
    tx.lockMs = delay + 500;
    schedule(function(){
      const commitStart = nowMs();
      try {
        opts.commit(tx, delay);
        tx.commitMs = Math.round((nowMs() - commitStart) * 10) / 10;
        finish(tx, 'complete');
      } catch(err) {
        tx.error = String(err && err.message || err);
        console.error('Consolidation presentation transaction failed', err);
        try { if(typeof opts.rollback === 'function') opts.rollback(tx, err); } catch(e) {}
        finish(tx, 'failed');
      }
    }, delay);
    return true;
  }

  function report(){
    return {
      available:true,
      version:VERSION,
      active:active ? {
        id:active.id,
        type:active.type,
        elapsedMs:Math.round((nowMs() - active.startedAt) * 10) / 10,
        renderHint:active.renderHint || '',
        tributeCount:active.tributeCount || 0
      } : null,
      recent:recent.slice(0, 10)
    };
  }

  window.FateActionPresentation = {
    version:VERSION,
    beginSetCard,
    beginConsolidation,
    suppressInitialPlacement,
    report
  };
  window.fateActionPerfReport = report;
})();
