(function(){
  'use strict';

  if(typeof window === 'undefined') return;
  if(window.FateActionPresentation) return;

  const VERSION = 7;
  const MATCH_ACTION_MOTION_DISABLED = true;
  const recent = [];
  let active = null;
  let nextId = 1;
  let lastAnimationEndedAt = 0;
  let lastActionFinishedAt = 0;

  function nowMs(){
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function round(value){
    return Math.round((Number(value) || 0) * 10) / 10;
  }

  function textureReport(){
    try {
      if(window.FateCardTextureCache && typeof window.FateCardTextureCache.report === 'function') {
        return window.FateCardTextureCache.report() || null;
      }
    } catch(e) {}
    return null;
  }

  function textureStat(report, key){
    const stats = report && report.stats || report || {};
    return Number(stats && stats[key]) || 0;
  }

  function rendererReport(){
    try {
      if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.report === 'function') {
        return window.FateMatchRendererAdapter.report() || null;
      }
    } catch(e) {}
    return null;
  }

  function perfCounters(){
    const perf = window.__fatePerf || {};
    return {
      renderRequests:Number(perf.renderRequests) || 0,
      broadRenderRequests:Number(perf.broadRenderRequests) || 0,
      scopedRenderRequests:Number(perf.scopedRenderRequests) || 0
    };
  }

  function longTaskSnapshot(){
    try {
      if(typeof window.fateLongTaskSnapshot === 'function') return window.fateLongTaskSnapshot();
    } catch(e) {}
    return null;
  }

  function animationsOff(){
    try {
      return document.documentElement.classList.contains('fate-animations-off') ||
        (document.body && document.body.classList && document.body.classList.contains('fate-animations-off'));
    } catch(e) {
      return false;
    }
  }

  function matchActionMotionDisabled(){
    if(MATCH_ACTION_MOTION_DISABLED) {
      try {
        return localStorage.getItem('fateEnableMatchActionMotion') !== '1';
      } catch(e) {
        return true;
      }
    }
    return animationsOff();
  }

  function motionFx(){
    return window.FateV2CardMotionFx || null;
  }

  function rawDirectorPlay(type, payload, options){
    const director = window.FateVfxDirector;
    if(!director || typeof director.play !== 'function') return null;
    return director.play(type, payload || {}, options || {});
  }

  function createTransaction(type, options){
    const opts = options || {};
    const tx = {
      id:'action-tx:' + (nextId++),
      type:String(type || 'action'),
      status:'active',
      phase:'preflight',
      startedAt:nowMs(),
      textureBefore:textureReport(),
      rendererBefore:rendererReport(),
      perfBefore:perfCounters(),
      lockMs:opts.lockMs || 0,
      renderHint:opts.renderHint || '',
      preflight:null,
      degraded:false,
      degradedReason:'',
      presentMs:0,
      commitMs:0,
      events:[],
      warnedKeys:Object.create(null),
      animation:{
        active:false,
        frameCount:0,
        maxFrameGapMs:0,
        fullSceneRedraws:0,
        layoutRebuilds:0,
        broadRenderRequests:0,
        broadRenderSchedules:0,
        textureMisses:0,
        domMutations:0,
        legacyActionDomMutations:0,
        forbiddenCount:0,
        startedAt:0,
        endedAt:0,
        durationMs:0
      }
    };
    active = tx;
    try {
      if(window.G) {
        window.G._actionPresentationActive = tx;
        window.G._actionPresentationLockUntil = Date.now() + Math.max(120, Number(tx.lockMs) || 240);
      }
    } catch(e) {}
    return tx;
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

  function pushEvent(tx, kind, details){
    if(!tx) return;
    const data = Object.assign({}, details || {});
    const event = Object.assign({
      kind:String(kind || 'event'),
      actionId:tx.id,
      actionType:tx.type,
      phase:tx.phase || '',
      elapsedMs:round(nowMs() - tx.startedAt)
    }, data);
    tx.events.unshift(event);
    tx.events.length = Math.min(tx.events.length, 32);
    return event;
  }

  function warnOnce(tx, key, event){
    if(!tx || !key || tx.warnedKeys[key]) return;
    tx.warnedKeys[key] = true;
    try {
      console.warn('[Fate action guard]', event);
    } catch(e) {}
  }

  function noteRendererEvent(kind, details){
    const tx = active;
    if(!tx) return;
    const event = pushEvent(tx, kind, details);
    if(tx.phase !== 'animating') return event;
    const animation = tx.animation;
    if(kind === 'full-scene-redraw') animation.fullSceneRedraws++;
    else if(kind === 'layout-rebuild') animation.layoutRebuilds++;
    else if(kind === 'broad-render-request') animation.broadRenderRequests++;
    else if(kind === 'renderer-broad-schedule') animation.broadRenderSchedules++;
    else if(kind === 'texture-miss') animation.textureMisses++;
    else if(kind === 'dom-mutation') {
      animation.domMutations += Math.max(1, Number(details && details.count) || 1);
      animation.legacyActionDomMutations += Math.max(0, Number(details && details.legacyActionNodes) || 0);
    }
    if(kind === 'full-scene-redraw' || kind === 'layout-rebuild' || kind === 'broad-render-request' ||
      kind === 'renderer-broad-schedule' || kind === 'texture-miss' ||
      (kind === 'dom-mutation' && Number(details && details.legacyActionNodes) > 0) ||
      kind === 'forbidden-render-during-action') {
      animation.forbiddenCount++;
      warnOnce(tx, kind + ':' + String(details && (details.source || details.stage || details.dirtySource) || ''), event);
    }
    return event;
  }

  function installMutationObserver(tx){
    if(!tx || typeof MutationObserver === 'undefined') return;
    try {
      const root = document.getElementById('s-game') || document.body;
      if(!root) return;
      tx._mutationObserver = new MutationObserver(function(records){
        if(!active || active.id !== tx.id || tx.phase !== 'animating') return;
        let count = 0;
        let legacy = 0;
        records.forEach(function(record){
          count += (record.addedNodes ? record.addedNodes.length : 0) + (record.removedNodes ? record.removedNodes.length : 0);
          [record.addedNodes, record.removedNodes].forEach(function(nodes){
            Array.prototype.forEach.call(nodes || [], function(node){
              if(!node || node.nodeType !== 1) return;
              const el = node;
              try {
                if(el.matches && el.matches('.placement-anim-ghost,.placement-anim-card,.draw-fly-card,.guerilla-transfer-fly,.fate-v2-motion-card,.consolidation-cinematic-overlay,.cc-overlay-v2,.cell,.bc,.hc,.mc,.visual-mc,.opp-card-back')) legacy++;
                if(el.querySelectorAll) legacy += el.querySelectorAll('.placement-anim-ghost,.placement-anim-card,.draw-fly-card,.guerilla-transfer-fly,.fate-v2-motion-card,.consolidation-cinematic-overlay,.cc-overlay-v2,.cell,.bc,.hc,.mc,.visual-mc,.opp-card-back').length;
              } catch(e) {}
            });
          });
        });
        if(count || legacy) {
          noteRendererEvent('dom-mutation', {source:'MutationObserver', count, legacyActionNodes:legacy});
        }
      });
      tx._mutationObserver.observe(root, {childList:true, subtree:true});
    } catch(e) {}
  }

  function beginAnimationPhase(tx, durationMs){
    if(!tx || active !== tx) return 0;
    const ms = Math.max(0, Number(durationMs) || 0);
    if(ms <= 0) return 0;
    tx.phase = 'animating';
    tx.animation.active = true;
    tx.animation.startedAt = nowMs();
    tx.animation.durationMs = round(ms);
    tx._lastAnimationFrameAt = tx.animation.startedAt;
    installMutationObserver(tx);
    const tick = function(){
      if(!active || active.id !== tx.id || tx.phase !== 'animating') return;
      const t = nowMs();
      const gap = tx._lastAnimationFrameAt ? Math.max(0, t - tx._lastAnimationFrameAt) : 0;
      tx._lastAnimationFrameAt = t;
      tx.animation.frameCount++;
      tx.animation.maxFrameGapMs = Math.max(tx.animation.maxFrameGapMs, round(gap));
      tx._frameRaf = requestAnimationFrame(tick);
    };
    tx._frameRaf = requestAnimationFrame(tick);
    return ms;
  }

  function endAnimationPhase(tx){
    if(!tx || !tx.animation || !tx.animation.active) return;
    tx.animation.active = false;
    tx.animation.endedAt = nowMs();
    lastAnimationEndedAt = tx.animation.endedAt;
    if(tx._frameRaf) {
      cancelAnimationFrame(tx._frameRaf);
      tx._frameRaf = 0;
    }
    if(tx._mutationObserver) {
      try { tx._mutationObserver.disconnect(); } catch(e) {}
      tx._mutationObserver = null;
    }
    tx.phase = 'committing';
  }

  function textureDelta(before, after){
    return {
      baseRequests:textureStat(after, 'baseRequests') - textureStat(before, 'baseRequests'),
      baseMisses:textureStat(after, 'baseMisses') - textureStat(before, 'baseMisses'),
      requests:textureStat(after, 'requests') - textureStat(before, 'requests'),
      misses:textureStat(after, 'misses') - textureStat(before, 'misses')
    };
  }

  function finish(tx, status){
    if(!tx) return tx;
    endAnimationPhase(tx);
    tx.phase = 'finished';
    tx.finishedAt = nowMs();
    lastActionFinishedAt = tx.finishedAt;
    tx.totalMs = round(tx.finishedAt - tx.startedAt);
    tx.status = status || tx.status || 'complete';
    tx.textureAfter = textureReport();
    tx.textureDelta = textureDelta(tx.textureBefore, tx.textureAfter);
    const perfAfter = perfCounters();
    tx.perfDelta = {
      renderRequests:perfAfter.renderRequests - tx.perfBefore.renderRequests,
      broadRenderRequests:perfAfter.broadRenderRequests - tx.perfBefore.broadRenderRequests,
      scopedRenderRequests:perfAfter.scopedRenderRequests - tx.perfBefore.scopedRenderRequests
    };
    recent.unshift({
      id:tx.id,
      type:tx.type,
      status:tx.status,
      totalMs:tx.totalMs,
      presentMs:tx.presentMs || 0,
      commitMs:tx.commitMs || 0,
      error:tx.error || '',
      presentError:tx.presentError || '',
      motionDisabled:!!tx.motionDisabled,
      motionDisabledReason:tx.motionDisabledReason || '',
      degraded:!!tx.degraded,
      degradedReason:tx.degradedReason || '',
      preflight:tx.preflight,
      animation:Object.assign({}, tx.animation, {
        maxFrameGapMs:round(tx.animation.maxFrameGapMs)
      }),
      perfDelta:tx.perfDelta,
      textureDelta:tx.textureDelta,
      forbidden:tx.events.filter(function(e){
        if(e.kind === 'dom-mutation') return Number(e.legacyActionNodes) > 0;
        return ['full-scene-redraw','layout-rebuild','broad-render-request','renderer-broad-schedule','texture-miss','forbidden-render-during-action'].indexOf(e.kind) >= 0;
      }).slice(0, 12),
      schedule:tx.schedule || null,
      renderHint:tx.renderHint || '',
      at:Math.round(tx.startedAt)
    });
    recent.length = Math.min(recent.length, 24);
    clearActive(tx);
    return tx;
  }

  function nextFrame(){
    return new Promise(function(resolve){ requestAnimationFrame(function(){ resolve(); }); });
  }

  function waitForPreflight(tx, recipeType, payload, timeoutMs){
    const director = window.FateVfxDirector;
    if(!director || typeof director.preflightMotionTextures !== 'function') {
      return Promise.resolve({ready:true, total:0, reason:'preflight-unavailable'});
    }
    const timeout = Math.max(0, Number(timeoutMs) || 0);
    const started = nowMs();
    function run(){
      let result = null;
      try {
        result = director.preflightMotionTextures(recipeType, payload || {}, {source:'action-preflight:' + tx.type});
      } catch(e) {
        result = {ready:false, total:0, reason:String(e && e.message || e), missing:[]};
      }
      tx.preflight = Object.assign({elapsedMs:round(nowMs() - started)}, result || {});
      if(!result || result.ready || timeout <= 0 || nowMs() - started >= timeout) return Promise.resolve(tx.preflight);
      return new Promise(function(resolve){ setTimeout(resolve, 24); }).then(run);
    }
    return run();
  }

  function scheduleCommit(tx, commit, delayMs){
    const delay = Math.max(0, Number(delayMs) || 0);
    const requestedAt = nowMs();
    tx.schedule = {
      requestedAt:round(requestedAt),
      delayMs:round(delay),
      expectedAt:round(requestedAt + delay),
      longTasksBefore:longTaskSnapshot()
    };
    const run = function(){
      requestAnimationFrame(function(rafNow){
        endAnimationPhase(tx);
        tx.schedule.firedAt = round(nowMs());
        tx.schedule.rafNow = round(Number(rafNow) || nowMs());
        tx.schedule.longTasksAtFire = longTaskSnapshot();
        const commitStart = nowMs();
        try {
          commit(tx, delay);
          tx.commitMs = round(nowMs() - commitStart);
          finish(tx, tx.degraded ? 'degraded-snap' : 'complete');
        } catch(err) {
          tx.error = String(err && err.message || err);
          try { console.error('Action presentation transaction failed', err); } catch(e) {}
          finish(tx, 'failed');
        }
      });
    };
    if(delay <= 0) run();
    else setTimeout(run, delay);
  }

  function commitWithoutPresentation(tx, commit, reason){
    if(!tx || active !== tx) return;
    tx.phase = 'committing';
    tx.motionDisabled = true;
    tx.motionDisabledReason = reason || 'match-action-motion-disabled';
    tx.presentMs = 0;
    tx.schedule = {
      requestedAt:round(nowMs()),
      delayMs:0,
      expectedAt:round(nowMs()),
      firedAt:round(nowMs()),
      motionDisabled:true,
      reason:tx.motionDisabledReason,
      longTasksBefore:longTaskSnapshot(),
      longTasksAtFire:longTaskSnapshot()
    };
    const commitStart = nowMs();
    try {
      commit(tx, 0);
      tx.commitMs = round(nowMs() - commitStart);
      finish(tx, 'complete');
    } catch(err) {
      tx.error = String(err && err.message || err);
      try { console.error('Action presentation transaction failed', err); } catch(e) {}
      finish(tx, 'failed');
    }
  }

  function suppressInitialPlacement(iid, duration){
    try {
      const adapter = window.FateMatchRendererAdapter;
      if(adapter && typeof adapter.suppressInitialPlacementMotion === 'function') {
        adapter.suppressInitialPlacementMotion(iid, duration || 420);
      }
    } catch(e) {}
  }

  function scopedRender(parts){
    try {
      if(typeof window.renderGame === 'function') window.renderGame(parts || {hand:true, topbar:true});
    } catch(e) {}
  }

  function ownerHandPart(owner){
    try {
      if(typeof window.getHandRenderPartForPlayer === 'function') return window.getHandRenderPartForPlayer(owner);
    } catch(e) {}
    try {
      const viewer = typeof window.getPerspectivePlayerIndex === 'function' ? window.getPerspectivePlayerIndex() : 0;
      return Number(owner) === Number(viewer) ? 'hand' : 'oppHand';
    } catch(e) {
      return 'hand';
    }
  }

  function actionSourceOwner(opts){
    if(opts && opts.owner != null) return Number(opts.owner);
    if(opts && opts.inst && opts.inst.owner != null) return Number(opts.inst.owner);
    if(opts && opts.sourceCard && opts.sourceCard.owner != null) return Number(opts.sourceCard.owner);
    try { return Number(window.G && window.G.currentPlayer) || 0; } catch(e) { return 0; }
  }

  function scopedSourceRender(opts, options){
    const o = options || {};
    const owner = actionSourceOwner(opts || {});
    const parts = {topbar:true};
    if(o.hand) parts[ownerHandPart(owner)] = true;
    if(o.piles) parts.piles = true;
    if(o.scores) parts.scores = true;
    scopedRender(parts);
  }

  function sourceRectForBoardPlacement(opts, targetRect){
    const fx = motionFx();
    if(opts.fromRect) return opts.fromRect;
    if(opts.sourceCard && fx && typeof fx.handRectForCard === 'function') {
      const handRect = fx.handRectForCard(opts.sourceCard);
      if(handRect) return handRect;
    }
    const owner = opts.owner != null ? opts.owner : opts.inst && opts.inst.owner;
    const source = String(opts.source || opts.sourceKind || '').toLowerCase();
    try {
      if(fx && source === 'discard' && typeof fx.pileRect === 'function') return fx.pileRect(owner, 'discard') || fx.pileRect(null, 'discard');
      if(fx && (source === 'deck' || source === 'search' || source === 'effect') && typeof fx.pileRect === 'function') return fx.pileRect(owner, 'deck') || fx.pileRect(null, 'deck');
    } catch(e) {}
    if(targetRect) {
      const w = Math.max(42, Math.min(86, targetRect.w || 70));
      const h = Math.max(58, Math.min(120, targetRect.h || Math.round(w * 1.38)));
      const fromLeft = Number(owner) === 1;
      return {
        x:fromLeft ? 38 : Math.max(38, (window.innerWidth || 1280) - w - 38),
        y:Math.max(70, Math.min((window.innerHeight || 720) - h - 70, targetRect.y - h * .35)),
        w,
        h
      };
    }
    return null;
  }

  function targetRectForBoardTarget(target){
    const fx = motionFx();
    let targetRect = null;
    try {
      targetRect = fx && typeof fx.targetRectForBoardTarget === 'function' ? fx.targetRectForBoardTarget(target) : null;
    } catch(e) {
      targetRect = null;
    }
    if(targetRect) return targetRect;
    try {
      const adapter = window.FateMatchRendererAdapter;
      const hitMap = adapter && typeof adapter.getHitMap === 'function' ? adapter.getHitMap() : null;
      const cells = hitMap && Array.isArray(hitMap.cells) ? hitMap.cells : [];
      const hit = cells.find(function(cell){
        return cell && Number(cell.z) === Number(target && target.z)
          && Number(cell.r) === Number(target && target.r)
          && Number(cell.c) === Number(target && target.c);
      });
      if(hit && hit.rect) return hit.rect;
    } catch(e) {}
    return null;
  }

  function estimateDuration(recipeType, payload){
    const type = String(recipeType || '').toUpperCase();
    const p = payload || {};
    if(type === 'CONSOLIDATE') {
      const n = Array.isArray(p.tributes) ? p.tributes.length : 0;
      if(n <= 1) return 500;
      return 54 + Math.max(0, n - 1) * (202 + 86) + 202 + 150;
    }
    if(type === 'PLAY_CARD' || type === 'DECK_TO_BOARD') return 540;
    if(type === 'DRAW_CARD' || type === 'DECK_TO_HAND' || type === 'DISCARD_TO_HAND') return 560;
    if(type === 'SEARCH_TO_HAND') return 760;
    if(type === 'DISCARD_CARD' || type === 'DESTROY_CARD' || type === 'HAND_DISCARD') return 430;
    if(type === 'FATE_GAIN' || type === 'FATE_LOSS') return 260;
    if(type === 'CARD_FLIP' || type === 'CARD_REVEAL') return 500;
    return Math.max(180, Math.min(700, Number(p.duration) || 360));
  }

  function buildSetMotion(opts){
    if(animationsOff()) return null;
    const fx = motionFx();
    if(!fx || typeof fx.playRecipe !== 'function') return null;
    const targetRect = targetRectForBoardTarget(opts.target);
    const fromRect = (typeof fx.handRectForCard === 'function' ? fx.handRectForCard(opts.sourceCard) : null)
      || sourceRectForBoardPlacement(Object.assign({source:'hand'}, opts), targetRect);
    if(!targetRect || !fromRect) return null;
    const travel = Math.max(372, Math.min(460, Number(opts.durationMs) || 392));
    const payload = {
      iid:opts.inst && opts.inst.iid,
      card:opts.sourceCard || opts.inst || null,
      faceDown:!!(opts.inst && opts.inst.faceDown),
      fromRect,
      toRect:targetRect,
      targetRect,
      duration:travel,
      arc:.28,
      lift:.30,
      suppressMotionAudio:true,
      sideArc:(opts.inst && opts.inst.owner === 1) ? -.42 : .42,
      rotate:(opts.inst && opts.inst.owner === 1) ? -13.0 : 13.0,
      bank:(opts.inst && opts.inst.owner === 1) ? -10.0 : 10.0
    };
    return {recipe:'PLAY_CARD', payload, duration:estimateDuration('PLAY_CARD', payload)};
  }

  function buildBoardPlacementMotion(opts){
    if(animationsOff()) return null;
    const fx = motionFx();
    if(!fx || typeof fx.playRecipe !== 'function') return null;
    const targetRect = typeof fx.targetRectForBoardTarget === 'function' ? fx.targetRectForBoardTarget(opts.target) : null;
    const fromRect = sourceRectForBoardPlacement(opts, targetRect);
    if(!targetRect || !fromRect) return null;
    const travel = Math.max(220, Math.min(420, Number(opts.durationMs) || 320));
    const recipe = String(opts.recipe || opts.motionType || '').toUpperCase() || (String(opts.source || '').toLowerCase() === 'deck' ? 'DECK_TO_BOARD' : 'PLAY_CARD');
    const payload = {
      iid:opts.inst && opts.inst.iid,
      card:opts.sourceCard || opts.inst || null,
      faceDown:!!(opts.inst && opts.inst.faceDown),
      fromRect,
      toRect:targetRect,
      targetRect,
      duration:travel,
      path:opts.path || 'overshoot',
      arc:Number(opts.arc == null ? .12 : opts.arc),
      lift:Number(opts.lift == null ? .12 : opts.lift),
      overshoot:Number(opts.overshoot == null ? .12 : opts.overshoot),
      source:opts.source || opts.sourceKind || 'effect'
    };
    return {recipe, payload, duration:estimateDuration(recipe, payload)};
  }

  function buildConsolidationPayload(opts){
    const fx = motionFx();
    if(!fx || typeof fx.targetRectForBoardTarget !== 'function') return null;
    const target = opts.target || {};
    const targetRect = fx.targetRectForBoardTarget(target);
    if(!targetRect) return null;
    const tributes = (Array.isArray(opts.tributes) ? opts.tributes : []).map(function(t, index){
      const rect = fx.targetRectForBoardTarget({z:t && t.z, r:t && t.r, c:t && t.c});
      return {
        iid:t && t.card && t.card.iid,
        card:t && t.card,
        rect,
        reinforcementValue:t && (t.reinforcementValue || t.reinforcement),
        index:t && t.index != null ? t.index : index
      };
    }).filter(function(item){ return !!item.rect; });
    return {
      targetRect,
      targetIid:target.card && target.card.iid,
      targetCard:target.card || null,
      resultCard:opts.inst || opts.card || target.card || null,
      resultCardIid:(opts.inst && opts.inst.iid) || (opts.card && opts.card.iid) || (target.card && target.card.iid),
      faceDown:!!opts.faceDown,
      tributes
    };
  }

  function runSetOrPlacement(tx, motion, opts, commit, rollback, sourceOptions){
    waitForPreflight(tx, motion ? motion.recipe : '', motion ? motion.payload : null, 180).then(function(preflight){
      if(!active || active.id !== tx.id) return;
      if(motion && preflight && preflight.ready === false && preflight.total > 0) {
        tx.degraded = true;
        tx.degradedReason = 'texture-preflight-timeout';
        pushEvent(tx, 'minimal-snap-path', {reason:tx.degradedReason, preflight});
      }
      if(motion && !tx.degraded && !animationsOff()){
        if(opts.sourceCard) {
          try {
            opts.sourceCard._presentationDeparting = true;
            tx.sourceMarkedDeparting = true;
          } catch(e) {}
        }
        if(sourceOptions) scopedSourceRender(opts, sourceOptions);
        return nextFrame().then(function(){
          if(!active || active.id !== tx.id) return;
          const duration = beginAnimationPhase(tx, motion.duration);
          rawDirectorPlay(motion.recipe, motion.payload);
          tx.presentMs = round(duration);
          suppressInitialPlacement(opts.inst && opts.inst.iid, duration + 420);
          scheduleCommit(tx, function(innerTx){
            try { if(opts.sourceCard) delete opts.sourceCard._presentationDeparting; } catch(e) {}
            commit(innerTx);
          }, duration);
        });
      }
      tx.degraded = true;
      tx.degradedReason = tx.degradedReason || (motion ? 'animation-disabled-or-preflight-degraded' : 'motion-rect-unavailable');
      pushEvent(tx, 'minimal-snap-path', {reason:tx.degradedReason});
      scheduleCommit(tx, function(innerTx){
        try { if(opts.sourceCard) delete opts.sourceCard._presentationDeparting; } catch(e) {}
        commit(innerTx);
      }, 0);
    }).catch(function(err){
      tx.error = String(err && err.message || err);
      try { if(typeof rollback === 'function') rollback(tx, err); } catch(e) {}
      finish(tx, 'failed');
    });
  }

  function beginSetCard(options){
    const opts = options || {};
    if(active) return false;
    if(typeof opts.commit !== 'function') return false;
    const tx = createTransaction('set-card', {
      lockMs:820,
      renderHint:'preflight, source-hand scoped render, compositor-only play-card, one commit render'
    });
    tx.cardName = opts.card && opts.card.name || opts.inst && opts.inst.name || '';
    tx.target = opts.target || null;
    if(matchActionMotionDisabled()) {
      commitWithoutPresentation(tx, opts.commit, 'set-card-motion-disabled');
      return true;
    }
    const motion = buildSetMotion(opts);
    runSetOrPlacement(tx, motion, opts, opts.commit, opts.rollback, {hand:true});
    return true;
  }

  function beginBoardPlacement(options){
    const opts = options || {};
    if(active) return false;
    if(typeof opts.commit !== 'function') return false;
    const tx = createTransaction('board-placement', {
      lockMs:760,
      renderHint:'preflight and compositor placement before board mutation'
    });
    tx.cardName = opts.sourceCard && opts.sourceCard.name || opts.inst && opts.inst.name || '';
    tx.target = opts.target || null;
    tx.source = opts.source || opts.sourceKind || 'effect';
    if(matchActionMotionDisabled()) {
      commitWithoutPresentation(tx, opts.commit, 'board-placement-motion-disabled');
      return true;
    }
    const motion = buildBoardPlacementMotion(opts);
    const source = String(opts.source || opts.sourceKind || '').toLowerCase();
    runSetOrPlacement(tx, motion, opts, opts.commit, opts.rollback, {
      hand:!!opts.sourceCard && (!source || source === 'hand'),
      piles:source === 'deck' || source === 'discard' || source === 'search' || source === 'effect'
    });
    return true;
  }

  function beginConsolidation(options){
    const opts = options || {};
    if(active) return false;
    if(typeof opts.commit !== 'function') return false;
    const tx = createTransaction('consolidation', {
      lockMs:Number(opts.lockMs) || 1300,
      renderHint:'preflight and compositor consolidation before tribute removal/result commit'
    });
    tx.tributeCount = Array.isArray(opts.tributes) ? opts.tributes.length : 0;
    if(matchActionMotionDisabled()) {
      commitWithoutPresentation(tx, opts.commit, 'consolidation-motion-disabled');
      return true;
    }
    const payload = buildConsolidationPayload(opts);
    const duration = payload ? estimateDuration('CONSOLIDATE', payload) : 0;
    waitForPreflight(tx, 'CONSOLIDATE', payload, 220).then(function(preflight){
      if(!active || active.id !== tx.id) return;
      let delay = 0;
      if(payload && preflight && preflight.ready !== false && !animationsOff()){
        delay = beginAnimationPhase(tx, duration);
        rawDirectorPlay('CONSOLIDATE', payload);
        tx.presentMs = round(delay);
        const adapter = window.FateMatchRendererAdapter;
        if(payload.resultCardIid && adapter && typeof adapter.suppressInitialPlacementMotion === 'function') {
          adapter.suppressInitialPlacementMotion(payload.resultCardIid, delay + 170);
        }
        if(payload.resultCardIid && !payload.faceDown && adapter && typeof adapter.hideBoardCardForVfx === 'function') {
          adapter.hideBoardCardForVfx(payload.resultCardIid, delay);
        }
      } else {
        tx.degraded = true;
        tx.degradedReason = payload ? 'texture-preflight-timeout' : 'motion-rect-unavailable';
        pushEvent(tx, 'minimal-snap-path', {reason:tx.degradedReason, preflight});
      }
      scheduleCommit(tx, function(innerTx){
        opts.commit(innerTx, delay);
      }, delay);
    }).catch(function(err){
      tx.error = String(err && err.message || err);
      try { if(typeof opts.rollback === 'function') opts.rollback(tx, err); } catch(e) {}
      finish(tx, 'failed');
    });
    return true;
  }

  function beginMotionOnly(type, payload, options){
    const recipe = String(type || '').toUpperCase();
    const opts = options || {};
    if(!recipe) return null;
    if(matchActionMotionDisabled()) return null;
    if(animationsOff() && recipe !== 'CONSOLIDATE') return null;
    if(active) {
      pushEvent(active, 'joined-motion-facade', {recipe});
      return rawDirectorPlay(recipe, payload || {}, opts);
    }
    const tx = createTransaction('motion-' + recipe.toLowerCase(), {
      lockMs:estimateDuration(recipe, payload),
      renderHint:'facade motion action; compositor-only frames'
    });
    const duration = estimateDuration(recipe, payload);
    waitForPreflight(tx, recipe, payload || {}, 140).then(function(preflight){
      if(!active || active.id !== tx.id) return;
      if(preflight && preflight.ready === false && preflight.total > 0) {
        tx.degraded = true;
        tx.degradedReason = 'texture-preflight-timeout';
        pushEvent(tx, 'minimal-snap-path', {reason:tx.degradedReason, preflight});
        finish(tx, 'degraded-snap');
        return;
      }
      const ms = beginAnimationPhase(tx, duration);
      const id = rawDirectorPlay(recipe, payload || {}, opts);
      tx.vfxId = id;
      tx.presentMs = round(ms);
      setTimeout(function(){
        finish(tx, 'complete');
      }, ms + 34);
    }).catch(function(err){
      tx.error = String(err && err.message || err);
      finish(tx, 'failed');
    });
    return tx.id;
  }

  function isActionAnimating(){
    return !!(active && active.phase === 'animating');
  }

  function msSinceLastActionAnimation(){
    if(!lastAnimationEndedAt) return Infinity;
    return Math.max(0, nowMs() - lastAnimationEndedAt);
  }

  function wasActionAnimatingRecently(ms){
    const windowMs = Math.max(0, Number(ms) || 0);
    return msSinceLastActionAnimation() <= windowMs;
  }

  function isActive(){
    return !!active;
  }

  function report(){
    return {
      available:true,
      version:VERSION,
      singlePipeline:true,
      active:active ? {
        id:active.id,
        type:active.type,
        phase:active.phase,
        elapsedMs:round(nowMs() - active.startedAt),
        renderHint:active.renderHint || '',
        degraded:!!active.degraded,
        degradedReason:active.degradedReason || '',
        motionDisabled:!!active.motionDisabled,
        motionDisabledReason:active.motionDisabledReason || '',
        preflight:active.preflight,
        animation:Object.assign({}, active.animation),
        recentEvents:active.events.slice(0, 8)
      } : null,
      lastAnimationEndedAt:round(lastAnimationEndedAt),
      lastActionFinishedAt:round(lastActionFinishedAt),
      msSinceLastActionAnimation:round(msSinceLastActionAnimation()),
      matchActionMotionDisabled:matchActionMotionDisabled(),
      recent:recent.slice(0, 12)
    };
  }

  window.FateActionPresentation = {
    version:VERSION,
    beginSetCard,
    beginBoardPlacement,
    beginConsolidation,
    beginMotionOnly,
    suppressInitialPlacement,
    noteRendererEvent,
    isActionAnimating,
    wasActionAnimatingRecently,
    msSinceLastActionAnimation,
    isActive,
    report
  };
  window.fateActionPerfReport = report;
})();
