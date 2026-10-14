(function(){'use strict';
// Cue offsets are seconds on the same two-second visual timeline.
const cues={
 // Three from the Cup: weight at the lift, a sustained dice spill, three
 // exact table contacts, then a bright result flourish.
 '109':[['click',.3,.18,165],['roll',.34,.48,920],['click',.59,.14,310],['click',.665,.14,255],['click',.74,.16,205],['bell',.82,.52,659],['bell',.91,.58,988],['swell',1.02,.72,392]],
 '108':[['swell',.2,1.1,420],['bell',.5,.42,523],['bell',.66,.42,659],['bell',.82,.42,784],['bell',.98,.42,1047],['bell',1.14,.42,1319],['spark',1.24,.55,1800]],
 // Harbor Tide: an audible wave bed follows the full sweep, with three
 // splashes matching the fish crossings and a clear star/chime finish.
 '110':[['water',.06,1.62,520],['cast',.1,.46,1050],['splash',.5,.24,1450],['splash',.74,.25,1250],['splash',.98,.27,1080],['bell',1.12,.46,740],['spark',1.25,.48,1650]],
 'dice-0':[['click',.16,.1,420],['roll',.2,.51,800],['click',.76,.12,310],['roll',.8,.26,700],['click',1.12,.12,250],['click',1.34,.2,170],['bell',1.4,.42,880]],
 'dice-1':[['roll',.12,.8,820],['roll',.26,.95,1050],['click',1.18,.18,220],['click',1.42,.2,180],['bell',1.48,.43,988]],
 'dice-2':[['roll',.1,.64,600],['cast',.8,.32,650],['click',.88,.12,370],['roll',.9,.5,870],['click',1.48,.18,190],['bell',1.54,.4,880]]
};
function schedule(ac,destination,key,volume=.5,stretch=1){
 const rows=cues[String(key)];if(!rows)return null;const nodes=[],sources=[],start=ac.currentTime+.015;
 // These three signature cinematics follow a voiced card-set sequence and
 // need enough headroom to remain unmistakable beneath music and dialogue.
 const cinematicGain=String(key)==='108'?.88:String(key)==='109'?1:String(key)==='110'?.92:.32;
 const out=ac.createGain();out.gain.value=volume*cinematicGain;out.connect(destination);nodes.push(out);
 for(const [kind,at,duration,f] of rows){
  const when=start+at*stretch,dur=duration*stretch,g=ac.createGain();g.connect(out);nodes.push(g);
  g.gain.setValueAtTime(.0001,when);g.gain.exponentialRampToValueAtTime(kind==='water'?.11:kind==='click'?.7:.3,when+Math.min(.025,dur*.15));g.gain.exponentialRampToValueAtTime(.0001,when+dur);
  if(['bell','swell','click'].includes(kind)){
   const o=ac.createOscillator();o.type=kind==='click'?'triangle':'sine';o.frequency.setValueAtTime(f,when);o.frequency.exponentialRampToValueAtTime(kind==='click'?f*.45:kind==='swell'?f*2:f*1.005,when+dur);o.connect(g);o.start(when);o.stop(when+dur+.02);sources.push(o);
  }else{
   const n=Math.ceil(ac.sampleRate*dur),b=ac.createBuffer(1,n,ac.sampleRate),data=b.getChannelData(0);let seed=17,low=0;
   for(let i=0;i<n;i++){seed=(seed*1664525+1013904223)>>>0;const x=seed/2147483648-1;low=low*.92+x*.08;const sec=i/ac.sampleRate;data[i]=kind==='water'?low*3:kind==='roll'?x*Math.pow(Math.max(0,Math.sin(sec*95)),12):kind==='reel'?x*(.1+.9*Math.pow(Math.max(0,Math.sin(sec*150)),8)):x;}
   const s=ac.createBufferSource(),filter=ac.createBiquadFilter();s.buffer=b;filter.type=kind==='water'?'lowpass':'bandpass';filter.frequency.setValueAtTime(f,when);filter.Q.value=.7;s.connect(filter);filter.connect(g);s.start(when);sources.push(s);nodes.push(filter);
  }
 }
 let timer;const stop=()=>{clearTimeout(timer);for(const s of sources)try{s.stop();}catch(e){}for(const n of nodes)try{n.disconnect();}catch(e){}};timer=setTimeout(stop,2200*stretch);return{stop};
}
function play(id){try{const master=typeof _masterVol==='number'?_masterVol:1,sfx=typeof _sfxVol==='number'?_sfxVol:.8;if(master<=0||sfx<=0||document.hidden||typeof getAudioCtx!=='function'||typeof getSfxBus!=='function')return null;const ac=getAudioCtx();return schedule(ac,getSfxBus(ac).input,id,master*sfx);}catch(e){return null;}}
window.FateCaribbeaActivationSfx={schedule,play,cues,handles:id=>!!cues[String(id)]};
})();
