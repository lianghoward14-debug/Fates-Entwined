(function(){
  'use strict';

  const FIRST_CLIP = 1;
  const LAST_CLIP = 180;
  const EXCLUDED_CLIPS = new Set([29, 30, 59, 79, 80, 81, 82, 123, 177]);
  let shuffleBag = [];
  let activeVoice = null;

  function refillShuffleBag(){
    shuffleBag = [];
    for(let clip=FIRST_CLIP; clip<=LAST_CLIP; clip++){
      if(!EXCLUDED_CLIPS.has(clip)) shuffleBag.push(clip);
    }
    for(let i=shuffleBag.length-1; i>0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [shuffleBag[i], shuffleBag[j]] = [shuffleBag[j], shuffleBag[i]];
    }
  }

  function currentVolume(){
    const master = typeof _masterVol === 'number' ? _masterVol : 1;
    const sfx = typeof _sfxVol === 'number' ? _sfxVol : 0.8;
    return Math.max(0, Math.min(1, master * sfx));
  }

  function playWarfrontZoneVoice(){
    if(document.body.classList.contains('war-replay-active')
      || (typeof G !== 'undefined' && G && G._warReplayMode === true)) return false;
    if(!shuffleBag.length) refillShuffleBag();
    const clip = shuffleBag.pop();
    if(!clip) return false;

    try {
      if(activeVoice){
        activeVoice.pause();
        activeVoice.currentTime = 0;
      }
      const filename = 'voice-line-' + String(clip).padStart(2, '0') + '.mp3';
      const audio = new Audio('soundeffects/zone-voices/' + filename);
      audio.volume = currentVolume();
      activeVoice = audio;
      audio.addEventListener('ended', function(){
        if(activeVoice === audio) activeVoice = null;
      }, {once:true});
      const attempt = audio.play();
      if(attempt && typeof attempt.catch === 'function') attempt.catch(function(){});
      return true;
    } catch(error) {
      return false;
    }
  }

  window.playFateWarfrontZoneVoice = playWarfrontZoneVoice;
  window.fateWarfrontZoneVoiceReport = function(){
    return {
      first:FIRST_CLIP,
      last:LAST_CLIP,
      excluded:Array.from(EXCLUDED_CLIPS),
      eligible:(LAST_CLIP - FIRST_CLIP + 1) - EXCLUDED_CLIPS.size,
      remainingBeforeReshuffle:shuffleBag.length,
      playing:!!activeVoice
    };
  };
})();
