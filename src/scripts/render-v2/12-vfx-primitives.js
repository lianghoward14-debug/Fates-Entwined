(function(){
  'use strict';

  if(typeof window === 'undefined') return;
  if(window.FateVfxPrimitives) return;

  const VERSION = 1;
  const REQUIRED = [
    'cardMove',
    'cardLift',
    'cardFlip',
    'cardGlow',
    'cardShake',
    'cardDissolve',
    'cardSummon',
    'cardTrail',
    'shockwaveRing',
    'particleBurst',
    'beam',
    'boardDim',
    'spotlight',
    'screenShake',
    'screenFlash',
    'numberPop',
    'statusIconPop',
    'pilePulse',
    'handFanPulse',
    'soundCue',
    'hitStop'
  ];

  function primitive(kind, options){
    return Object.assign({
      kind,
      startOffset:0,
      duration:360,
      easing:'out-cubic',
      priority:'normal',
      layer:'effects'
    }, options || {});
  }

  const api = {
    version:VERSION,
    cardMove:function(options){ return primitive('cardMove', options); },
    cardLift:function(options){ return primitive('cardLift', options); },
    cardFlip:function(options){ return primitive('cardFlip', options); },
    cardGlow:function(options){ return primitive('cardGlow', options); },
    cardShake:function(options){ return primitive('cardShake', options); },
    cardDissolve:function(options){ return primitive('cardDissolve', options); },
    cardSummon:function(options){ return primitive('cardSummon', options); },
    cardTrail:function(options){ return primitive('cardTrail', options); },
    shockwaveRing:function(options){ return primitive('shockwaveRing', options); },
    particleBurst:function(options){ return primitive('particleBurst', options); },
    beam:function(options){ return primitive('beam', options); },
    boardDim:function(options){ return primitive('boardDim', options); },
    spotlight:function(options){ return primitive('spotlight', options); },
    screenShake:function(options){ return primitive('screenShake', options); },
    screenFlash:function(options){ return primitive('screenFlash', options); },
    numberPop:function(options){ return primitive('numberPop', options); },
    statusIconPop:function(options){ return primitive('statusIconPop', options); },
    pilePulse:function(options){ return primitive('pilePulse', options); },
    handFanPulse:function(options){ return primitive('handFanPulse', options); },
    soundCue:function(options){ return primitive('soundCue', Object.assign({layer:'audio', duration:1}, options || {})); },
    hitStop:function(options){ return primitive('hitStop', Object.assign({layer:'control'}, options || {})); },
    names:function(){ return REQUIRED.slice(); },
    has:function(name){ return typeof api[String(name || '')] === 'function'; },
    report:function(){
      const missing = REQUIRED.filter(function(name){ return typeof api[name] !== 'function'; });
      return {
        available:true,
        version:VERSION,
        required:REQUIRED.slice(),
        missing,
        count:REQUIRED.length,
        pass:missing.length === 0
      };
    }
  };
  window.FateVfxPrimitives = api;
  window.fateVfxPrimitivesReport = api.report;
})();
