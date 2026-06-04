(function(){
  'use strict';

  if(typeof window === 'undefined') return;
  if(window.FatePhase8HandPileReport) return;

  const VERSION = 1;
  const slowThresholdMs = 8;
  const parts = {
    renderHand:createPartStats('renderHand'),
    renderOppHand:createPartStats('renderOppHand'),
    renderPiles:createPartStats('renderPiles')
  };

  function nowMs(){
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function round(value){
    return Math.round((Number(value) || 0) * 10) / 10;
  }

  function createPartStats(name){
    return {
      name,
      calls:0,
      totalMs:0,
      maxMs:0,
      slowCalls:0,
      lastMs:0,
      lastAt:0,
      recent:[]
    };
  }

  function record(name, ms){
    const stat = parts[name];
    if(!stat) return;
    stat.calls++;
    stat.totalMs += ms;
    stat.maxMs = Math.max(stat.maxMs, ms);
    stat.lastMs = ms;
    stat.lastAt = Date.now();
    if(ms >= slowThresholdMs) stat.slowCalls++;
    stat.recent.push({ms:round(ms), at:stat.lastAt});
    if(stat.recent.length > 16) stat.recent.shift();
  }

  function wrap(name){
    const fn = window[name];
    if(typeof fn !== 'function' || fn.__fatePhase8Wrapped) return false;
    const wrapped = function(){
      const started = nowMs();
      try {
        return fn.apply(this, arguments);
      } finally {
        record(name, nowMs() - started);
      }
    };
    wrapped.__fatePhase8Wrapped = true;
    wrapped.__fateOriginal = fn;
    window[name] = wrapped;
    return true;
  }

  function snapshotStats(){
    const out = {};
    Object.keys(parts).forEach(function(name){
      const stat = parts[name];
      out[name] = {
        calls:stat.calls,
        avgMs:stat.calls ? round(stat.totalMs / stat.calls) : 0,
        maxMs:round(stat.maxMs),
        slowCalls:stat.slowCalls,
        lastMs:round(stat.lastMs),
        lastAt:stat.lastAt,
        recent:stat.recent.slice()
      };
    });
    return out;
  }

  function domCounts(){
    return {
      ownHandCards:document.querySelectorAll('#hand-cards .hc').length,
      opponentHandCards:document.querySelectorAll('#opp-hand .opp-card-back, #opp-hand .hc, #opp-hand > *').length,
      pileCanvases:document.querySelectorAll('.pile-card-canvas').length,
      pileSlots:document.querySelectorAll('.pile-slot').length
    };
  }

  function recommendation(stats){
    const hand = stats.renderHand || {};
    const opp = stats.renderOppHand || {};
    const piles = stats.renderPiles || {};
    const hot = [
      hand.maxMs >= 12 || hand.avgMs >= 4 || hand.slowCalls >= 2,
      opp.maxMs >= 12 || opp.avgMs >= 4 || opp.slowCalls >= 2,
      piles.maxMs >= 8 || piles.avgMs >= 3 || piles.slowCalls >= 2
    ];
    if(hot.some(Boolean)) {
      return {
        migrateCandidate:true,
        reason:'hand-or-pile-render-cost-hot',
        detail:'Phase 8 should consider moving the hot hand/pile surface into the v2 scene or further reducing direct render calls.'
      };
    }
    return {
      migrateCandidate:false,
      reason:'hand-and-piles-not-hot',
      detail:'Keep hand/piles in DOM for now and continue the performance pass unless gameplay testing shows interaction-specific spikes.'
    };
  }

  function report(){
    wrap('renderHand');
    wrap('renderOppHand');
    wrap('renderPiles');
    const stats = snapshotStats();
    return {
      available:true,
      version:VERSION,
      phase:8,
      wrapped:{
        renderHand:!!(window.renderHand && window.renderHand.__fatePhase8Wrapped),
        renderOppHand:!!(window.renderOppHand && window.renderOppHand.__fatePhase8Wrapped),
        renderPiles:!!(window.renderPiles && window.renderPiles.__fatePhase8Wrapped)
      },
      stats,
      dom:domCounts(),
      renderer:window.fateMatchRendererV2Report ? window.fateMatchRendererV2Report() : null,
      recommendation:recommendation(stats)
    };
  }

  function cloneCounters(){
    const stats = snapshotStats();
    return {
      renderHand:stats.renderHand.calls,
      renderOppHand:stats.renderOppHand.calls,
      renderPiles:stats.renderPiles.calls,
      rendererDraws:window.fateMatchRendererV2Report ? (window.fateMatchRendererV2Report().draws || 0) : 0
    };
  }

  function idleReport(durationMs){
    const wait = Math.max(1000, Number(durationMs) || 5000);
    wrap('renderHand');
    wrap('renderOppHand');
    wrap('renderPiles');
    const before = cloneCounters();
    const started = Date.now();
    return new Promise(function(resolve){
      setTimeout(function(){
        const after = cloneCounters();
        const full = report();
        resolve(Object.assign({}, full, {
          idleWindowMs:Date.now() - started,
          deltas:{
            renderHand:after.renderHand - before.renderHand,
            renderOppHand:after.renderOppHand - before.renderOppHand,
            renderPiles:after.renderPiles - before.renderPiles,
            rendererDraws:after.rendererDraws - before.rendererDraws
          }
        }));
      }, wait);
    });
  }

  window.FatePhase8HandPileReport = {
    version:VERSION,
    wrapAll:function(){
      return {
        renderHand:wrap('renderHand'),
        renderOppHand:wrap('renderOppHand'),
        renderPiles:wrap('renderPiles')
      };
    },
    report,
    idleReport
  };

  window.fatePhase8HandPileReport = report;
  window.fatePhase8IdleReport = idleReport;

  window.FatePhase8HandPileReport.wrapAll();
})();
