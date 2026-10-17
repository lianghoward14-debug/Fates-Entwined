/* Recorded landscape layers and sparse designed cues. See soundeffects/landscapes/CREDITS.md. */
(function () {
  'use strict';
  const files={ocean:'ocean.flac',ocean2:'ocean2.flac',river:'river.mp3',birds:'birds.ogg',wind:'wind.wav',crickets:'crickets.mp3',machine:'machine.wav',engine:'engine.ogg',paper:'paper.mp3',boom:'boom.wav',gull1:'gull1.wav',gull2:'gull2.wav',gull3:'gull3.wav',conversation:'conversation.mp3',leaves:'leaves.mp3',tokyo:'tokyo.mp3'};
  const base=new URL('../../soundeffects/landscapes/',document.currentScript.src).href;
  for(const key of ['shipwood','canvas','marching','towerbell','nightcrickets','artillery','woodsteps','typing','pavement','dove','pinetrees','winterbird'])files[key]=key+'.mp3';
  const L=(key,volume,rate=1,pan=0,cutoff=18000)=>({key,volume,rate,pan,cutoff});
  const E=(key,volume,every,rate=1,pan=0,cutoff=18000)=>({...L(key,volume,rate,pan,cutoff),every});
  const gull=(volume,every=16,cutoff=6500)=>({...E('gull1',volume,Math.min(every,18),1,0,cutoff),variants:['gull1','gull2','gull3'],wander:true,irregular:true});
  const occasional=(key,volume,every,rate=1,cutoff=18000)=>({...E(key,volume,every,rate,0,cutoff),irregular:true,wander:true});
  const water=(volume)=>({...L('river',volume),water:true});
  const excerpt=(key,volume,every,duration,cutoff=12000)=>({...occasional(key,volume,every,1,cutoff),duration,randomOffset:true,rateSpread:.08});
  const canvas=(volume)=>({...occasional('canvas',volume,8),burst:5,rateSpread:.22});
  const profiles=[
    ['Peaceful Seas','Irregular soft water · passing swells · open sea',[water(.48),L('wind',.06)],[]],
    ['ALPINE Headquarters','Snowy mountain air · exposed ridge gusts · faint wind howl',[L('wind',.5,1.06,0,4200)],[occasional('howl',.16,38,1.15)]],
    ['Anchorage, 2052','Winter Alaskan shore · cold wind · muted waves',[L('ocean2',.4,.88,-.2,2400),L('wind',.32,1.08,.25,3100)],[occasional('ice',.12,35)]],
    ['Zion Canyon','Dry canyon winds · lonely mourning dove · distant hollow howls',[L('wind',.19,.86,0,2400)],[excerpt('dove',.8,12,8,7000),occasional('howl',.2,24,.75),occasional('stone',.12,31)]],
    ['Polish River','Recorded river ripples · birds along the bank',[L('river',.75),L('birds',.28,1,-.35)],[]],
    ['Great Oak Highschool','Sunny foothills · breeze through trees · scattered birds',[L('leaves',.4,1,-.2),L('wind',.1,1,.3,2500)],[occasional('birds',.22,58)]],
    ['Founding of Pacifica','Water along the hull · snapping canvas · recorded timber creaks · seagulls',[water(.3)],[canvas(.85),excerpt('shipwood',.8,12,7,9000),gull(.4,10)]],
    ['Qingdao, 2033','Offshore artillery · intermittent passing engines · coastal water',[water(.22)],[excerpt('artillery',1,26,21,4500),{...excerpt('engine',.65,22,5,2600),rateSpread:.3}]],
    ['Californian Sunsets','Gentle irregular surf · frequent varied seagulls',[water(.48)],[gull(.48,8)]],
    ['Bremen, 2052','Open plains · distant marching and mustering · occasional military vehicles',[L('leaves',.16,.94),L('wind',.12,.96,0,2100)],[excerpt('marching',.62,38,10,3300),excerpt('engine',.28,60,6,1400),occasional('birds',.2,48)]],
    ['Sather Gate','College plaza · overlapping pedestrian footsteps · resonant tower bells',[L('leaves',.07)],[excerpt('pavement',.7,9,6),{...excerpt('pavement',.42,13,4),rate:.85},excerpt('towerbell',.65,43,18,10000)]],
    ['Vault of the Ledger Keepers','Old port · timber dock footsteps · hulls and rigging · gulls and bells',[water(.19)],[excerpt('woodsteps',.8,9,6),excerpt('shipwood',.72,13,8,8500),canvas(.48),gull(.5,11,6500),occasional('bell',.55,24,.65)]],
    ['Big Sur, 2041','Sea wind over open plains · mountain gusts · surf far below',[L('wind',.56,.9),L('leaves',.15,.9,0,2800),L('ocean2',.16,.83,0,1300)],[occasional('howl',.14,41,.85)]],
    ['Lone Pine Drive','Sunny palm-lined neighborhood · rustling foliage · garden birds',[L('leaves',.32,1,0,6500),L('wind',.07,1,0,1800)],[occasional('birds',.25,61)]],
    ['Snow on the Carpathians','Pine needles rustling · cold ridge air · scattered winter bird calls',[L('pinetrees',.5),L('wind',.12,1.18)],[{...occasional('winterbird',.4,13),rateSpread:.12}]],
    ['Santa Anna Treasure Port','Lively harbor · wooden dock footsteps · ship bells · canvas and gulls',[water(.24)],[excerpt('woodsteps',.75,8,7),gull(.55,9),canvas(.65),excerpt('shipwood',.62,14,7),occasional('bell',.65,17,.65)]],
    ['Tama City','Japanese street recording · close pedestrians · traffic and crossing signals',[L('tokyo',1.05,1,0,16000)],[excerpt('pavement',.65,9,5),occasional('crossing',.75,17)]],
    ['Wodny Potok','Winter village · church peals · footsteps at wooden doorways · sleigh bells',[L('wind',.07,.9,0,1700),L('conversation',.13,1,0,2300)],[occasional('sleigh',.65,12),excerpt('towerbell',.5,39,15,7500),occasional('snow',.55,12),excerpt('woodsteps',.55,14,5),occasional('door',.48,19)]],
    ['Californique Ruins','Ancient shoreline · distant gulls · wind through weathered ruins',[L('ocean2',.34,.82,0,2600),L('wind',.2,.72,0,1200)],[gull(.17,43,4000),occasional('creak',.13,53),occasional('stone',.08,67)]],
    ['Battle of Pella','Open mountain valley · wind along the ridges · distant birds',[L('wind',.4,.93,0,3000),L('leaves',.13,.95)],[occasional('howl',.12,49,.8),occasional('birds',.12,75,1,3800)]],
    ['Moffitt Library','Quiet study room · keyboard typing · pages · low collaborative conversation',[L('conversation',.27,1,0,5200)],[excerpt('typing',.52,10,6),{...occasional('paper',.75,6),burst:3},occasional('chair',.3,19),excerpt('pavement',.16,24,3,2400)]],
    ['Chihuahuan Desert','Dry desert air · distant artillery bursts · marching and military vehicles',[L('wind',.12,.9)],[excerpt('artillery',.82,30,21,2400),excerpt('marching',.4,29,7,2200),excerpt('engine',.38,27,5,1800)]],
    ['Shores of La Helena','Fresh field-recorded night cricket chorus',[L('nightcrickets',.7,1,0,18000)],[]],
    ['Moscow, 2025','Winter plaza · peaceful crowd murmur · footsteps · distant tower bells',[L('wind',.07,.82,0,1800),L('conversation',.38,1,0,4500)],[occasional('snow',.5,10),excerpt('pavement',.42,13,5,5000),excerpt('towerbell',.38,39,14,6500),occasional('door',.3,23)]]
  ];
  let ctx,bus,active=null,selected=null,level=.35,unlocked=false,revision=0,pending=null,error=null;
  const cache=new Map(),retiring=new Set();
  function notify(){window.dispatchEvent(new CustomEvent('fate-ambience-state'));}
  async function sample(key){
    if(cache.has(key))return cache.get(key);
    const promise=(async()=>{
      const response=await fetch(base+files[key]);
      if(!response.ok)throw new Error('Could not load '+files[key]);
      const raw=await ctx.decodeAudioData(await response.arrayBuffer());
      // Bounded excerpts, DC removal and conservative RMS normalization.
      const length=Math.min(raw.length,Math.floor(raw.sampleRate*(['conversation','leaves','tokyo','river','pinetrees','nightcrickets','shipwood','towerbell','dove'].includes(key)?150:40)));
      const b=ctx.createBuffer(raw.numberOfChannels,length,raw.sampleRate);
      let squares=0,peak=0;
      for(let c=0;c<b.numberOfChannels;c++){
        const d=b.getChannelData(c);d.set(raw.getChannelData(c).subarray(0,length));
        let mean=0;for(const v of d)mean+=v;mean/=length;
        for(let i=0;i<length;i++){d[i]-=mean;squares+=d[i]*d[i];peak=Math.max(peak,Math.abs(d[i]));}
      }
      const gain=Math.min(8,.15/Math.max(.0001,Math.sqrt(squares/(length*b.numberOfChannels))),.75/Math.max(.0001,peak));
      for(let c=0;c<b.numberOfChannels;c++){const d=b.getChannelData(c);for(let i=0;i<length;i++)d[i]*=gain;}
      return b;
    })();
    cache.set(key,promise);
    try{return await promise;}catch(e){cache.delete(key);throw e;}
  }
  function dispose(layer){
    clearTimeout(layer.cleanup);layer.timers.forEach(clearTimeout);layer.timers.clear();
    layer.nodes.forEach(n=>{try{n.stop();}catch(_){}n.disconnect();});layer.nodes.clear();
    layer.gain.disconnect();retiring.delete(layer);
  }
  function retire(layer,immediate=false){
    if(!layer)return;
    layer.timers.forEach(clearTimeout);layer.timers.clear();
    const t=ctx.currentTime;layer.gain.gain.cancelAndHoldAtTime(t);
    layer.gain.gain.linearRampToValueAtTime(0,t+(immediate?.04:1.2));
    retiring.add(layer);layer.cleanup=setTimeout(()=>dispose(layer),immediate?60:1300);
  }
  function later(layer,fn,seconds){
    const timer=setTimeout(()=>{layer.timers.delete(timer);if(active===layer)fn();},seconds*1000);layer.timers.add(timer);
  }
  function track(layer,nodes,source){
    nodes.forEach(n=>layer.nodes.add(n));source.onended=()=>nodes.forEach(n=>{n.disconnect();layer.nodes.delete(n);});
  }
  function recorded(layer,spec,buffer,loop=false){
    if(active!==layer)return;
    const source=ctx.createBufferSource(),g=ctx.createGain(),pan=ctx.createStereoPanner(),filter=ctx.createBiquadFilter();
    source.buffer=buffer;source.playbackRate.value=spec.rate;filter.type='lowpass';filter.frequency.value=spec.cutoff;filter.Q.value=.5;pan.pan.value=spec.pan;
    if(['crickets','nightcrickets'].includes(spec.key)){filter.type='highpass';filter.frequency.value=2200;}
    source.connect(filter);filter.connect(g);g.connect(pan);pan.connect(layer.gain);
    const offset=spec.offset||0,t=ctx.currentTime,d=Math.min(spec.duration||buffer.duration,buffer.duration-offset)/spec.rate,fade=Math.min(spec.water?1.8:.7,d*.16),passing=!loop&&spec.key==='engine';
    const attack=['boom','paper','canvas','artillery','pavement','woodsteps'].includes(spec.key)?Math.min(.008,d*.05):passing?d*.4:fade;
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(spec.volume,t+attack);
    g.gain.setValueAtTime(spec.volume,t+d-(passing?d*.45:fade));g.gain.linearRampToValueAtTime(0,t+d);
    if(passing){pan.pan.setValueAtTime(-.8,t);pan.pan.linearRampToValueAtTime(.8,t+d);}
    source.start(t,offset);source.stop(t+d);track(layer,[source,g,pan,filter],source);
    // Overlap recordings to remove clicks and gaps at loop boundaries.
    if(loop)later(layer,()=>recorded(layer,spec,buffer,true),Math.max(.1,d-fade));
  }
  // Long recordings are sampled from different positions, lengths and stereo locations.
  // This avoids replaying the same short crashing wave on a fixed rhythm.
  function waterLayer(layer,spec,buffers){
    const buffer=buffers.river;
    const duration=Math.min(buffer.duration,12+Math.random()*17),offset=Math.random()*Math.max(0,buffer.duration-duration);
    const rate=.9+Math.random()*.17,volume=spec.volume*(.7+Math.random()*.3);
    recorded(layer,{...spec,key:'river',water:true,duration,offset,rate,volume,pan:Math.random()*.7-.35},buffer);
    later(layer,()=>waterLayer(layer,spec,buffers),Math.max(.1,duration/rate-1.4));
  }
  let textureBuffer;
  function texture(layer,duration,volume,frequency,pan=0,delay=0,flutter=0){
    if(!textureBuffer){textureBuffer=ctx.createBuffer(1,ctx.sampleRate*8,ctx.sampleRate);const data=textureBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;}
    const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain(),p=ctx.createStereoPanner(),t=ctx.currentTime+delay;
    s.buffer=textureBuffer;f.type='bandpass';f.frequency.value=frequency;f.Q.value=.65;p.pan.value=pan;
    s.connect(f);f.connect(g);g.connect(p);p.connect(layer.gain);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+Math.min(.03,duration*.15));
    if(flutter)for(let k=.08;k<duration-.05;k+=.08)g.gain.linearRampToValueAtTime(volume*(.25+Math.random()*.75),t+k);
    g.gain.linearRampToValueAtTime(.00001,t+duration);s.start(t);s.stop(t+duration);track(layer,[s,f,g,p],s);
  }
  function tone(layer,freq,duration,volume,pan=0,ratio=1,delay=0,attack=.008){
    const osc=ctx.createOscillator(),g=ctx.createGain(),p=ctx.createStereoPanner(),t=ctx.currentTime+delay;
    osc.frequency.setValueAtTime(freq,t);osc.frequency.exponentialRampToValueAtTime(Math.max(20,freq*ratio),t+duration);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+attack);g.gain.exponentialRampToValueAtTime(.00001,t+duration);
    p.pan.value=pan;osc.connect(g);g.connect(p);p.connect(layer.gain);osc.start(t);osc.stop(t+duration+.02);track(layer,[osc,g,p],osc);
  }
  function foley(layer,spec){
    const v=spec.volume,p=spec.pan||Math.random()*.8-.4;
    switch(spec.key){
      case 'hull':for(let i=0;i<7;i++){tone(layer,80+i*21,.65,v*.09,p,1.15,i*.14,.12);texture(layer,.12,v*.08,420,p,i*.18);}break;
      case 'sail':texture(layer,2.5,v*.18,900,p,0,true);break;
      case 'pine':texture(layer,4.5,v*.14,2300,p,0,true);break;
      case 'desertBird':tone(layer,630,1.4,v*.15,p,.76,0,.12);tone(layer,480,1.7,v*.11,-p,.88,1.7,.15);tone(layer,430,1.9,v*.045,p,.92,3.7,.2);break;
      case 'dockSteps':for(let i=0;i<7;i++){tone(layer,180,.17,v*.28,p,.55,i*.51);texture(layer,.075,v*.12,1300,p,i*.51);}break;
      case 'march':for(let i=0;i<12;i++){tone(layer,75,.13,v*.35,p,.6,i*.47);texture(layer,.1,v*.08,700,p,i*.47);}break;
      case 'traffic':texture(layer,6.5,v*.2,400,p,0,true);tone(layer,95,6,v*.1,p,.7,0,2);break;
      case 'door':tone(layer,110,.24,v*.32,p,.5);texture(layer,.12,v*.13,800,p);tone(layer,1200,.035,v*.12,p,.6,.28);break;
      case 'chair':texture(layer,.7,v*.16,650,p,0,true);tone(layer,240,.45,v*.1,p,1.3);break;
      case 'pencil':for(let i=0;i<7;i++)texture(layer,.16,v*.09,2100,p,i*.26,true);break;
      case 'howl':tone(layer,170*spec.rate,7,v*.07,p,1.24,0,2.6);tone(layer,283*spec.rate,6,v*.025,-p,.87,.7,2);break;
      case 'ice':tone(layer,1800,.18,v*.1,p,.7);tone(layer,450,.6,v*.06,-p,.65,.12);break;
      case 'sleigh':for(let i=0;i<8;i++)[2200,3100,4700].forEach((f,j)=>tone(layer,f,.15,v*.045/(j+1),p,1,i*.22));break;
      case 'bell':[1,2.76,5.4].forEach((n,i)=>tone(layer,440*n*spec.rate,4/(i+1),v*.32/(i+1),p));break;
      case 'clock':tone(layer,950,.025,v*.18,p,.6);break;
      case 'relay':tone(layer,1700,.04,v*.1,-.2);tone(layer,900,.05,v*.08,.2,1,.13);break;
      case 'drip':tone(layer,1400,.15,v*.16,p,.38);tone(layer,1400,.22,v*.055,-p,.38,.23);break;
      case 'crossing':for(let i=0;i<6;i++)tone(layer,880,.18,v*.12,.4,1,i*.6);break;
      case 'creak':for(let i=0;i<5;i++)tone(layer,160+i*57,.7,v*.055,p,1.5,i*.07);break;
      case 'steps':for(let i=0;i<6;i++){tone(layer,95,.1,v*.4,p,.5,i*.52);texture(layer,.07,v*.12,1800,p,i*.52+.04);}break;
      case 'stone':for(let i=0;i<8;i++)tone(layer,1000+Math.random()*2200,.025,v*.12,p,.5,i*.06);break;
      case 'snow':for(let i=0;i<28;i++)tone(layer,400+Math.random()*2200,.045,v*.065,p,.4,Math.floor(i/7)*.6+(i%7)*.035);break;
    }
  }
  function event(layer,spec,buffers){
    if(active!==layer)return;
    const variants=spec.variants||[spec.key],previous=layer.lastVariants.get(spec),choices=variants.filter(k=>k!==previous);
    const key=(choices.length?choices:variants)[Math.floor(Math.random()*(choices.length||variants.length))];layer.lastVariants.set(spec,key);
    const played={...spec,key,rate:spec.rate*(1+(Math.random()-.5)*2*(spec.rateSpread||0)),pan:spec.wander?Math.random()*1.2-.6:spec.pan,volume:spec.volume*(spec.irregular?.8+Math.random()*.2:1)};
    if(buffers[key]&&spec.randomOffset)played.offset=Math.random()*Math.max(0,buffers[key].duration-(spec.duration||buffers[key].duration));
    if(buffers[key])recorded(layer,played,buffers[key]);else foley(layer,played);
    // Uneven short clusters make canvas flaps and page handling feel like gestures.
    if(buffers[key]&&spec.burst){let delay=0;for(let i=1;i<spec.burst;i++){
      delay+=buffers[key].duration/played.rate*(.65+Math.random()*.6);
      later(layer,()=>recorded(layer,{...played,rate:played.rate*(.85+Math.random()*.3),volume:played.volume*(.6+Math.random()*.4)},buffers[key]),delay);
    }}
    const interval=spec.every*(spec.irregular?.75+Math.random()*.65:.85+Math.random()*.3);
    const duration=buffers[key]?Math.min(spec.duration||buffers[key].duration,buffers[key].duration-(played.offset||0))/played.rate:0;
    later(layer,()=>event(layer,spec,buffers),Math.max(interval,duration+3));
  }
  async function sync(){
    if(!ctx||!unlocked)return;
    bus.gain.setTargetAtTime(level,ctx.currentTime,.06);
    const id=document.hidden?null:selected;
    if(pending===id&&id)return;
    if(active?.id===id&&id){if(pending){++revision;pending=null;notify();}return;}
    const run=++revision;pending=null;
    if(!id){for(const layer of [...retiring])dispose(layer);retire(active,true);active=null;notify();return;}
    const profile=profiles[Number(id.replace('igb',''))-1];if(!profile)return;
    pending=id;error=null;notify();
    try{
      const keys=[...new Set([...profile[2],...profile[3]].flatMap(s=>s.water||['ocean','ocean2'].includes(s.key)?['river']:s.variants||[s.key]).filter(k=>files[k]))];
      const results=await Promise.all(keys.map(async k=>[k,await sample(k)]));if(run!==revision)return;
      const buffers=Object.fromEntries(results);retire(active);
      const gain=ctx.createGain();gain.connect(bus);
      const layer={id,gain,nodes:new Set(),timers:new Set(),lastVariants:new Map()};active=layer;pending=null;
      gain.gain.setValueAtTime(0,ctx.currentTime);gain.gain.linearRampToValueAtTime(1,ctx.currentTime+.65);
      profile[2].forEach(spec=>spec.water||['ocean','ocean2'].includes(spec.key)?waterLayer(layer,spec,buffers):recorded(layer,spec,buffers[spec.key],true));
      profile[3].forEach((spec,i)=>later(layer,()=>event(layer,spec,buffers),spec.irregular?1+Math.random()*1.5+i*1.2:.45+i*.65));notify();
    }catch(e){if(run!==revision)return;pending=null;error=e.message;retire(active,true);active=null;notify();console.warn('Landscape ambience:',e);}
  }
  async function unlock(){
    if(!ctx){ctx=new(window.AudioContext||window.webkitAudioContext)();bus=ctx.createGain();const compressor=ctx.createDynamicsCompressor();
      compressor.threshold.value=-12;compressor.knee.value=12;compressor.ratio.value=4;bus.connect(compressor);compressor.connect(ctx.destination);}
    await ctx.resume();unlocked=true;await sync();
  }
  window.FateLandscapeAmbience={profiles,
    play(id){selected=/^igb([1-9]|1\d|2[0-4])$/.test(id)?id:null;return sync();},
    stop(){selected=null;error=null;return sync();},volume(value){level=Math.max(0,Math.min(1,Number(value)||0));return sync();},unlock,
    getState(){return {selected,playing:active?.id||null,loading:pending,error,volume:level,version:2};}
  };
  document.addEventListener('pointerdown',()=>{if(!unlocked)unlock().catch(()=>{});});
  document.addEventListener('keydown',()=>{if(!unlocked)unlock().catch(()=>{});});
  document.addEventListener('visibilitychange',()=>{sync();});
  window.addEventListener('pagehide',()=>{selected=null;sync();});
})();
