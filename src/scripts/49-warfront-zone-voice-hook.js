(function(){
  'use strict';

  function currentPlayerWarfrontTeam(){
    try {
      if(typeof window.getFateWarfrontCurrentPlayerTeam === 'function'){
        const liveTeam = window.getFateWarfrontCurrentPlayerTeam();
        if(liveTeam === 'a' || liveTeam === 'b') return liveTeam;
      }
    } catch(error) {}
    try {
      const baseKey = 'fate_warfront_monthly_team_v1';
      const key = typeof _fateStorageKey === 'function' ? _fateStorageKey(baseKey) : baseKey;
      const lock = JSON.parse(localStorage.getItem(key) || 'null');
      const now = new Date();
      const month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
      return lock && lock.month === month && (lock.team === 'a' || lock.team === 'b') ? lock.team : null;
    } catch(error) {
      return null;
    }
  }

  function install(){
    const original = window.openWarZone;
    if(typeof original !== 'function' || original.__fateVoiceWrapped) return false;

    function openWarZoneWithVoice(id){
      const sourceEvent = window.event;
      const sourceElement = sourceEvent?.target?.closest
        ? sourceEvent.target.closest('[data-war-zone].war2-objective')
        : null;
      const enteredFromMap = !!(sourceEvent?.isTrusted && sourceElement);
      const replayActive = document.body.classList.contains('war-replay-active')
        || (typeof G !== 'undefined' && G && G._warReplayMode === true);
      const team = currentPlayerWarfrontTeam();
      if(enteredFromMap && !replayActive && team === 'a'
        && typeof window.playFateWarfrontZoneVoice === 'function'){
        window.playFateWarfrontZoneVoice();
      } else if(enteredFromMap && !replayActive && team === 'b'
        && typeof window.playFateFreeWorldZoneVoice === 'function'){
        window.playFateFreeWorldZoneVoice();
      }
      return original.apply(this, arguments);
    }
    openWarZoneWithVoice.__fateVoiceWrapped = true;
    window.openWarZone = openWarZoneWithVoice;
    return true;
  }

  if(!install()) window.addEventListener('load', install, {once:true});
  window.isFateWarfrontCominternVoiceEligible = function(){ return currentPlayerWarfrontTeam() === 'a'; };
  window.isFateWarfrontFreeWorldVoiceEligible = function(){ return currentPlayerWarfrontTeam() === 'b'; };
})();
