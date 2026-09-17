(function(){
  'use strict';
  // Times are fractions of the cinematic, so performance timing stays in sync.
  const scores={
    fracture:[['crack',0,.52,1700,.52],['hit',0,.48,135,.34],['hit',.018,.30,230,.14],['bell',.045,.46,820,.045],['crack',.10,.72,3400,.16]],
    square:[['air',.04,.28,380,.09],['hit',.12,.12,100,.12],['hit',.20,.12,125,.12],['hit',.28,.12,150,.12],['bell',.39,.28,220,.10],['bell',.43,.32,330,.07]],
    star:[['air',.05,.38,950,.075],['rise',.08,.38,150,.055],['bell',.46,.30,392,.10],['bell',.50,.29,587,.07],['bell',.55,.27,784,.045]],
    triangle:[['air',.10,.24,650,.08],['hit',.19,.12,180,.10],['hit',.27,.12,225,.10],['hit',.35,.12,270,.10],['bell',.40,.28,440,.085],['bell',.44,.30,660,.055]]
  };
  const noiseBuffers=new WeakMap();
  function schedule(ac,destination,rarity,durationMs,volume=1){
    const score=scores[rarity];if(!score||volume<=0)return null;
    const length=durationMs/1000,now=ac.currentTime,out=ac.createGain(),nodes=[out],sources=[];
    out.gain.setValueAtTime(Math.min(1,volume)*.7,now);out.connect(destination);
    let stopped=false;
    const stop=()=>{if(stopped)return;stopped=true;for(const source of sources)try{source.stop();}catch(e){}for(const node of nodes)try{node.disconnect();}catch(e){}};
    function tone(type,at,dur,f0,f1,level,attack=.012){
      const source=ac.createOscillator(),gain=ac.createGain();nodes.push(source,gain);sources.push(source);source.type=type;
      source.frequency.setValueAtTime(f0,now+at);source.frequency.exponentialRampToValueAtTime(f1,now+at+dur);
      gain.gain.setValueAtTime(0,now+at);gain.gain.linearRampToValueAtTime(level,now+at+attack);gain.gain.exponentialRampToValueAtTime(.0001,now+at+dur);
      source.connect(gain);gain.connect(out);source.start(now+at);source.stop(now+at+dur+.01);
    }
    try{
      for(const [kind,position,span,f,level] of score){
        const at=position*length,dur=span*length;
        if(kind==='air'||kind==='crack'){
          let buffer=noiseBuffers.get(ac);if(!buffer){buffer=ac.createBuffer(1,Math.ceil(ac.sampleRate*.35),ac.sampleRate);const data=buffer.getChannelData(0);let seed=8128;for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed/2147483648-1;}noiseBuffers.set(ac,buffer)}
          const source=ac.createBufferSource(),filter=ac.createBiquadFilter(),gain=ac.createGain();nodes.push(source,filter,gain);sources.push(source);
          source.buffer=buffer;source.loop=true;filter.type=kind==='crack'?'highpass':'bandpass';filter.Q.value=.7;filter.frequency.setValueAtTime(f*.6,now+at);filter.frequency.exponentialRampToValueAtTime(f*(kind==='crack'?.35:2),now+at+dur);
          gain.gain.setValueAtTime(0,now+at);gain.gain.linearRampToValueAtTime(level,now+at+(kind==='crack'?.003:dur*.6));
          if(kind==='crack')gain.gain.exponentialRampToValueAtTime(.0001,now+at+dur);else gain.gain.linearRampToValueAtTime(0,now+at+dur);
          source.connect(filter);filter.connect(gain);gain.connect(out);source.start(now+at);source.stop(now+at+dur);
        }else if(kind==='hit'){
          tone('sine',at,dur,f,f*.35,level);tone('triangle',at,dur*.45,f*2.7,f,level*.25);
        }else if(kind==='rise')tone('sine',at,dur,f,f*2,level,dur*.65);
        else{tone('sine',at,dur,f,f*.998,level);tone('sine',at,dur*.65,f*2.76,f*2.75,level*.22)}
      }
      return {stop};
    }catch(error){stop();return null;}
  }
  function play(rarity,durationMs){
    try{
      const master=typeof _masterVol==='number'?_masterVol:1,sfx=typeof _sfxVol==='number'?_sfxVol:.8;
      if(document.hidden||master<=0||sfx<=0||typeof getAudioCtx!=='function'||typeof getSfxBus!=='function')return null;
      const ac=getAudioCtx(),sound=schedule(ac,getSfxBus(ac).input,rarity,durationMs,master*sfx);if(!sound)return null;
      let timer;const stop=()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',hidden);sound.stop()};
      const hidden=()=>{if(document.hidden)stop()};document.addEventListener('visibilitychange',hidden);timer=setTimeout(stop,durationMs);return {stop};
    }catch(error){return null;}
  }
  window.FateConsolidationSfx={play,schedule};
})();
