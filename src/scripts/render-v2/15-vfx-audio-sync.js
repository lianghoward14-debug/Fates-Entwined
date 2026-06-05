(function(){
  'use strict';

  if(typeof window === 'undefined') return;
  if(window.FateVfxAudioSync) return;

  const VERSION = 1;
  const scheduled = [];
  const missing = {};
  let played = 0;
  let skipped = 0;

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
        playSfx(cue);
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
