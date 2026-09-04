(function(){
  'use strict';

  const EXCLUDED = new Set([
    51,53,55,56,57,58,59,60,61,62,63,70,72,74,91,92,94,95,97,98,
    137,214,215,216,217,218,219,340,
    261,262,263,264,266,267,268,269,286,287,288,289,290,291,
    308,309,311,312,337,349,350,351,352
  ]);
  const MERGED = [
    'merged-261-262.mp3','merged-263-264.mp3','merged-266-267.mp3',
    'merged-268-269.mp3','merged-288-289.mp3','merged-290-291.mp3',
    'merged-308-309.mp3','merged-311-312.mp3','merged-349-350.mp3',
    'merged-351-352.mp3'
  ];
  const LATE_EXCLUDED = new Set([
    366,367,368,369,370,371,372,373,380,382,383,384,385,387,388,
    393,394,395,396,397,398,400,401,447,448
  ]);
  const LATE_MERGED = [
    'merged-368-369.mp3','merged-370-371.mp3','merged-372-373.mp3',
    'merged-382-383.mp3','merged-384-385.mp3','merged-393-394.mp3',
    'merged-395-396.mp3','merged-397-398.mp3'
  ];
  const ALL_FILES = [];
  for(let clip=1; clip<=360; clip++){
    if(!EXCLUDED.has(clip)) ALL_FILES.push('voice-line-' + String(clip).padStart(3, '0') + '.mp3');
  }
  ALL_FILES.push(...MERGED, 'split-337-b.mp3');
  for(let clip=361; clip<=473; clip++){
    if(!LATE_EXCLUDED.has(clip)) ALL_FILES.push('voice-line-' + String(clip).padStart(3, '0') + '.mp3');
  }
  ALL_FILES.push(...LATE_MERGED);
  const POST_473_REPLACED = new Set([474,476,479,480,481]);
  for(let clip=474; clip<=481; clip++){
    if(!POST_473_REPLACED.has(clip)) ALL_FILES.push('voice-line-' + String(clip).padStart(3, '0') + '.mp3');
  }
  ALL_FILES.push(
    'split-474-01.mp3','split-474-02.mp3','split-474-03.mp3','split-474-04.mp3','split-474-05.mp3','split-474-06.mp3',
    'split-476-01.mp3','split-476-02.mp3','split-476-03.mp3','split-476-05.mp3','split-476-06.mp3',
    'split-479-01.mp3','split-479-02.mp3','split-479-03.mp3',
    'split-480-01.mp3','split-480-02.mp3',
    'split-481-01.mp3','split-481-02.mp3','split-481-03.mp3','split-481-04.mp3'
  );

  // Approved 482–605 revisions, tracked in approved-late-manifest.json.
  // Excludes 549, 572, 605, 586-2 and 598-recut; superseded cuts are not loaded.
  for(let clip=1; clip<=149; clip++){
    ALL_FILES.push('approved-late-' + String(clip).padStart(3, '0') + '.mp3');
  }

  let shuffleBag = [];
  let activeVoice = null;

  function refill(){
    shuffleBag = ALL_FILES.slice();
    for(let i=shuffleBag.length-1; i>0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [shuffleBag[i], shuffleBag[j]] = [shuffleBag[j], shuffleBag[i]];
    }
  }

  function volume(){
    const master = typeof _masterVol === 'number' ? _masterVol : 1;
    const sfx = typeof _sfxVol === 'number' ? _sfxVol : 0.8;
    return Math.max(0, Math.min(1, master * sfx));
  }

  function play(){
    if(document.body.classList.contains('war-replay-active')
      || (typeof G !== 'undefined' && G && G._warReplayMode === true)) return false;
    if(!shuffleBag.length) refill();
    const filename = shuffleBag.pop();
    if(!filename) return false;
    try {
      if(activeVoice){ activeVoice.pause(); activeVoice.currentTime = 0; }
      const audio = new Audio('soundeffects/free-world-zone-voices/' + filename);
      audio.volume = volume();
      activeVoice = audio;
      audio.addEventListener('ended', function(){ if(activeVoice === audio) activeVoice = null; }, {once:true});
      const attempt = audio.play();
      if(attempt && typeof attempt.catch === 'function') attempt.catch(function(){});
      return true;
    } catch(error) {
      return false;
    }
  }

  window.playFateFreeWorldZoneVoice = play;
  window.fateFreeWorldZoneVoiceReport = function(){
    return {eligible:ALL_FILES.length, excluded:Array.from(EXCLUDED), lateExcluded:Array.from(LATE_EXCLUDED), merged:MERGED.concat(LATE_MERGED), remainingBeforeReshuffle:shuffleBag.length, playing:!!activeVoice};
  };
})();
