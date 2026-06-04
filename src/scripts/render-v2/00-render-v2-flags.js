(function(){
  'use strict';

  if(typeof window === 'undefined') return;

  const FLAGS = Object.freeze({
    disabled: 'disabled',
    snapshot: 'snapshot',
    board: 'board',
    scene: 'scene'
  });

  function getParams(){
    try { return new URLSearchParams(window.location.search || ''); }
    catch(e) { return new URLSearchParams(''); }
  }

  function readStorage(key){
    try { return localStorage.getItem(key); }
    catch(e) { return null; }
  }

  function writeStorage(key, value){
    try {
      if(value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch(e) {}
  }

  function getMode(){
    const params = getParams();
    const queryMode = String(params.get('renderV2') || '').trim().toLowerCase();
    if(queryMode) return queryMode;
    const storedMode = String(readStorage('fateRenderV2Mode') || '').trim().toLowerCase();
    return storedMode || FLAGS.snapshot;
  }

  function getTrialDesign(){
    const params = getParams();
    const queryTrial = String(params.get('trial') || '').trim().toLowerCase();
    const pathTrial = String((window.location && window.location.pathname) || '').toLowerCase().match(/trial\s*([123])|trial([123])/);
    const storedTrial = String(readStorage('fateMatchTrialDesign') || '').trim().toLowerCase();
    const raw = queryTrial || (pathTrial && (pathTrial[1] || pathTrial[2])) || storedTrial || '1';
    const match = String(raw).match(/[123]/);
    return match ? match[0] : '1';
  }

  function applyTrialClass(){
    const trial = getTrialDesign();
    try {
      document.documentElement.classList.remove('fate-match-trial1', 'fate-match-trial2', 'fate-match-trial3');
      document.documentElement.classList.add('fate-match-trial' + trial);
    } catch(e) {}
    return trial;
  }

  function isEnabled(){
    const mode = getMode();
    return mode !== FLAGS.disabled && mode !== '0' && mode !== 'false' && mode !== 'off';
  }

  function shouldBuildSnapshots(){
    const mode = getMode();
    return isEnabled() && (mode === FLAGS.snapshot || mode === FLAGS.board || mode === FLAGS.scene || mode === '1' || mode === 'true' || mode === 'on');
  }

  function setMode(mode){
    const next = String(mode || FLAGS.snapshot).trim().toLowerCase();
    writeStorage('fateRenderV2Mode', next);
    return getReport();
  }

  function setTrialDesign(trial){
    const next = String(trial || '1').match(/[123]/);
    writeStorage('fateMatchTrialDesign', next ? next[0] : '1');
    return getReport();
  }

  function getReport(){
    return {
      mode:getMode(),
      trial:getTrialDesign(),
      enabled:isEnabled(),
      snapshots:shouldBuildSnapshots()
    };
  }

  window.FateRenderV2Flags = {
    FLAGS,
    getMode,
    getTrialDesign,
    setMode,
    setTrialDesign,
    isEnabled,
    shouldBuildSnapshots,
    report:getReport
  };
  applyTrialClass();
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyTrialClass, {once:true});
})();
