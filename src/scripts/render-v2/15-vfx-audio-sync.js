(function(){
  'use strict';

  if(typeof window === 'undefined') return;
  if(window.FateVfxAudioSync) return;

  const VERSION = 1;
  const scheduled = [];
  const missing = {};
  let played = 0;
  let skipped = 0;
  let lastPlayMs = 0;
  let maxPlayMs = 0;
  let longPlayCount = 0;
  let lastCue = '';

  function nowMs(){
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function isMuted(){
    try {
      return localStorage.getItem('fateAudioMuted') === '1'
        || localStorage.getItem('fateMute') === '1';
    } catch(e) {
      return false;
    }
  }

  function playNow(cue, options){
    if(isMuted()){
      skipped++;
      return false;
    }
    try {
      if(typeof playSfx === 'function'){
        const started = nowMs();
        playSfx(cue);
        const elapsed = nowMs() - started;
        lastPlayMs = Math.round(elapsed * 10) / 10;
        maxPlayMs = Math.max(maxPlayMs, lastPlayMs);
        lastCue = cue;
        if(elapsed >= 8) longPlayCount++;
        played++;
        return true;
      }
      missing[cue] = (missing[cue] || 0) + 1;
    } catch(e) {
      missing[cue] = (missing[cue] || 0) + 1;
    }
    return false;
  }

  function playCue(options){
    const opts = options || {};
    const cue = String(opts.cue || '');
    if(!cue) return false;
    const at = Number(opts.at) || nowMs();
    const delay = Math.max(0, at - nowMs());
    const rec = {
      cue,
      at,
      volume:Number.isFinite(Number(opts.volume)) ? Number(opts.volume) : 1,
      pitch:Number.isFinite(Number(opts.pitch)) ? Number(opts.pitch) : 1,
      priority:opts.priority || 'normal'
    };
    scheduled.push(rec);
    setTimeout(function(){
      playNow(cue, rec);
      const idx = scheduled.indexOf(rec);
      if(idx >= 0) scheduled.splice(idx, 1);
    }, delay);
    return true;
  }

  function report(){
    return {
      available:true,
      version:VERSION,
      scheduled:scheduled.length,
      played,
      skipped,
      muted:isMuted(),
      lastPlayMs,
      maxPlayMs,
      longPlayCount,
      lastCue,
      missingCueCount:Object.keys(missing).length,
      missingCues:Object.assign({}, missing)
    };
  }

  window.FateVfxAudioSync = {
    version:VERSION,
    playCue,
    report
  };
  window.fateVfxAudioReport = report;
})();
