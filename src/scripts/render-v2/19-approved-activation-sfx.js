(function(){
  'use strict';
  // Cue times follow the reviewed two-second visual beats. Each character gets
  // a distinct attack, material texture and finishing accent.
  const cues={
    'support-call':[['wind',.03,.55,950],['chord',.16,.5,294],['chord',.48,.5,392],['chord',.8,.68,494],['metal',1.2,.48,587],['chord',1.38,.55,587]],
    'support-desperate':[['rumble',.02,.62,72],['crack',.4,.23,1400],['hit',.49,.3,82],['metal',.85,.38,230],['metal',1.12,.4,294],['chord',1.42,.5,196]],
 '77':[['wind',.04,.85,540],['water',.4,.85,440],['water',1.05,.84,610]],
 '100':[['wind',.04,.88,1150],['wind',.55,.84,1450],['ping',.74,.6,790],['wind',1.17,.72,950]],
 'bh18':[['rumble',.04,.85,72],['rise',.22,.7,130],['hit',.76,.33,65],['crack',1.02,.35,640],['rumble',1.3,.59,86]],
 'bh17':[['rumble',.05,.94,78],['metal',.24,.3,185],['metal',.58,.32,220],['hit',1.12,.46, 60],['crack',1.19,.46,760],['rumble',1.43,.48,90]],
 '15':[['ping',.12,.5,392],['ping',.32,.5,494],['ping',.52,.5,587],['ping',.78,.5,659],['chord',1.14,.7,392]],
 '34':[['metal',.08,.38,294],['metal',.35,.38,370],['metal',.62,.38,440],['metal',.9,.38,587],['chord',1.23,.61,440]],
 '55':[['rise',.04,.9,160],['ping',.3,.54,330],['ping',.57,.58,494],['ping',.83,.6,660],['chord',1.2,.67,220]],
 '85':[['wind',.04,.77,350],['rise',.31,.66,420],['rise',.58,.7,510],['wind',1.12,.73,640]],
 '36':[['metal',.08,.44,230],['metal',.35,.42,290],['hit',.79,.3,135],['metal',1.13,.6,390]],
 'bh02':[['glitch',.07,.38,370],['rise',.29,.52,520],['ping',.82,.42,880],['ping',1.03,.39,1040],['ping',1.28,.47,1200]],
 'bh08':[['rise',.09,.43,230],['hit',.65,.18,240],['hit',.87,.18,280],['hit',1.09,.19,260],['hit',1.31,.2,310],['wind',1.5,.34,500]],
 '57':[['metal',.06,.39,280],['metal',.34,.36,330],['metal',.61,.34,370],['metal',.89,.33,310],['metal',1.17,.36,420],['wind',1.46,.39,820]],
 '12':[['wind',.05,.46,610],['wind',.35,.5,740],['hit',.79,.24,190],['metal',1.08,.42,300],['wind',1.36,.5,850]],
 '23':[['rise',.06,.65,330],['ping',.27,.46,440],['ping',.5,.46,550],['ping',.73,.47,660],['metal',1.16,.61,790]],
 '41':[['rise',.05,.59,180],['crack',.44,.33,680],['crack',.76,.37,970],['hit',1.14,.4,210],['metal',1.4,.5,540]],
 '89':[['wind',.04,.65,920],['ping',.32,.5,660],['metal',.68,.46,880],['ping',1.05,.44,990],['wind',1.36,.52,1120]],
 '35':[['wind',.05,.46,310],['metal',.36,.44,270],['hit',.78,.3,140],['metal',1.04,.49,430],['wind',1.38,.48,700]],
 '88':[['paper',.04,.43,940],['wind',.27,.83,1250],['metal',.7,.48,790],['ping',1.09,.4,1040],['wind',1.35,.56,1200]],
 '11':[['paper',.04,.47,820],['paper',.28,.45,1080],['paper',.53,.42,1320],['hit',.97,.27,260],['paper',1.25,.51,930]],
 // Phil: ascending royal fifths as the pillars rise, then a crown bell.
 '46':[['royal',.08,.5,196],['royal',.36,.5,246.94],['royal',.64,.55,293.66],['crown',1.08,.84,587.33]],
 '10':[['rise',.07,1.02,105],['crack',.43,.45,230],['crack',.72,.42,290],['hit',1.29,.35,62],['wind',1.41,.5,420]],
 '19':[['water',.04,.75,440],['water',.51,.82,570],['water',1.03,.78,670],['ping',.93,.35,870],['ping',1.36,.4,1060]],
 'bh12':[['wind',.08,.5,720],['rise',.28,.77,540],['rise',.57,.69,670],['ping',1.12,.45,980],['wind',1.35,.53,1120]],
 '01':[['wind',.06,.5,540],['wind',.35,.58,740],['metal',.93,.45,430],['chord',1.2,.6,660]],
 'bh07':[['glitch',.06,.4,210],['rise',.32,.65,330],['metal',.78,.36,660],['ping',1.05,.45,880],['chord',1.3,.55,440]],
 'bh11':[['paper',.04,.55,1400],['scratch',.32,.5,1900],['hit',.98,.3,180],['metal',1.18,.45,330]],
 '45':[['wind',.03,.8,650],['rumble',.16,.64,95],['rise',.35,.68,170],['ping',.82,.5,392],['chord',1.12,.72,220]],
 '02':[['rise',.04,.7,190],['ping',.24,.4,392],['ping',.36,.4,494],['ping',.48,.4,587],['ping',.6,.4,659],['ping',.72,.4,784],['ping',.84,.4,880],['chord',1.3,.55,392]],
 '86':[['wind',.07,.38,1100],['wind',.31,.38,1500],['wind',.55,.38,1800],['hit',.47,.3,72],['crack',.49,.48,2100],['hit',.71,.3,85],['crack',.73,.5,2500],['hit',.95,.3,65],['crack',.97,.55,2900],['metal',1.27,.55,780]],
 'bh04':[['water',.04,.65,600],['rumble',.12,.85,75],['water',.42,.7,950],['rise',.68,.63,150],['hit',1.15,.35,70],['water',1.18,.62,1400]],
 '03':[['rise',.08,.65,210],['ping',.64,.5,660],['chord',1.08,.73,440]],
 '06':[['water',.08,.65,720],['metal',.58,.48,390],['ping',1.18,.55,784]],
 '22':[['rise',.04,.72,180],['ping',.34,.4,540],['ping',.58,.4,680],['ping',.82,.4,810],['hit',.94,.28,95],['wind',1.02,.42,1700],['chord',1.22,.62,540]],
 '27':[['paper',.08,.34,1800],['paper',.39,.34,2200],['ping',.73,.5,523],['chord',1.17,.63,392]],
 '40':[['rumble',.05,.5,85],['hit',.57,.36,72],['metal',.61,.63,430],['chord',1.25,.55,294]],
 '48':[['rise',.06,.72,160],['ping',.61,.5,660],['ping',.87,.48,880],['chord',1.2,.62,440]],
 '04':[['rumble',.02,.8,72],['metal',.18,.4,260],['hit',.37,.25,95],['metal',.53,.4,330],['hit',.71,.25,85],['metal',.83,.35,440],['hit',1.02,.42,65],['metal',1.21,.5,660]],
 '17':[['rumble',.02,.75,95],['rise',.06,.8,170],['ping',.48,.45,520],['ping',.8,.46,660],['hit',1.11,.42,65],['metal',1.14,.46,310],['chord',1.34,.56,392]],
 'bh20':[['wind',.06,.45,950],['wind',.42,.45,1200],['rise',.53,.55,260],['wind',.89,.43,1500],['chord',1.22,.61,440]],
 'bh19':[['rise',.04,.55,170],['metal',.39,.3,330],['metal',.63,.3,440],['hit',.98,.3,90],['chord',1.17,.62,440]],
 'bh01':[['water',.05,.62,850],['wind',.24,.68,1000],['water',.83,.51,1100],['ping',1.27,.38,1175],['ping',1.4,.36,1320]],
 '14':[['rise',.03,.43,150],['hit',.54,.4,65],['metal',.56,.5,390],['wind',.69,.55,1200],['metal',1.1,.5,620]],
 'bh09':[['wind',.08,.6,1100],['metal',.37,.3,440],['wind',.59,.6,1900],['metal',.9,.4,560],['hit',1.18,.4,85]],
 '66':[['paper',.05,.33,1800],['hit',.49,.22,130],['metal',.56,.3,390],['hit',.81,.22,160],['chord',1.18,.6,392]],
    '87':[['ping',.35,.45,392],['ping',.48,.45,494],['ping',.61,.45,587],['ping',.74,.45,659],['ping',.87,.45,784],['ping',1,.45,880],['chord',1.16,.65,392]],
    '67':[['paper',.04,.28,1800],['scratch',.6,.5,1700],['wind',.94,.46,1300],['hit',1.42,.3,105],['metal',1.44,.4,330]],
    'bh21':[['wind',.03,.6,700],['rumble',.25,.75,90],['wind',.64,.65,1200],['chord',1.12,.65,220]],
    '38':[['wind',.04,.4,850],['hit',.3,.24,135],['hit',.56,.25,110],['hit',.81,.3,85],['chord',1.17,.6,330]],
    'bh22':[['water',.04,.55,1000],['rise',.25,.55,230],['ping',.7,.55,660],['chord',1.03,.74,440]],
    '56':[['rise',.04,.43,170],['wind',.34,.35,2000],['crack',.52,.25,1900],['metal',.62,.52,310],['hit',1.05,.45,68]],
    'bh05':[['paper',.04,.38,1700],['paper',.37,.46,2100],['rise',.4,.56,230],['metal',1.02,.36,470],['chord',1.2,.57,392]],
    'bh13':[['paper',.06,.3,1700],['metal',.37,.28,330],['paper',.43,.3,1900],['metal',.67,.28,440],['paper',.75,.3,2100],['hit',1.05,.27,120],['chord',1.25,.55,523]],
    '07':[['rumble',0,.9,95],['hit',.24,.22,75],['hit',.5,.25,85],['hit',.77,.3,65],['metal',1.12,.55,310]],
    '08':[['glitch',.05,.24,180],['glitch',.37,.25,350],['rise',.64,.58,230],['chord',1.22,.65,330]],
    '13':[['paper',.05,.35,2400],['scratch',.22,.5,1600],['hit',.78,.18,180],['paper',.88,.33,1800],['chord',1.12,.63,392]],
    '21':[['rumble',.02,.55,80],['metal',.45,.26,190],['crack',.72,.28,1700],['hit',.74,.5,62],['metal',1.08,.6,530]],
    '29':[['wind',.04,.56,650],['wind',.48,.57,1100],['rise',.36,.7,220],['chord',1.1,.7,440]],
    '30':[['wind',.03,.56,600],['rise',.22,.5,170],['crack',.76,.25,2200],['hit',.78,.48,70],['water',1.05,.65,1000]],
    '39':[['water',.04,.65,850],['rise',.1,.58,150],['metal',.6,.25,390],['metal',.81,.25,490],['metal',1.02,.26,590],['wind',1.15,.6,700]],
    '43':[['paper',.05,.38,1700],['paper',.3,.38,2100],['hit',.72,.45,60],['hit',1.04,.4,78],['chord',1.27,.52,260]],
    '51':[['wind',.05,.55,750],['rise',.3,.6,185],['metal',.9,.34,370],['chord',1.13,.65,294]],
    '61':[['crack',.08,.2,2300],['hit',.43,.32,80],['metal',.47,.4,470],['ping',1.22,.4,660],['ping',1.29,.4,830],['ping',1.36,.44,990]],
    '81':[['paper',.04,.4,1250],['hit',.48,.19,180],['hit',.64,.19,230],['hit',.8,.2,280],['wind',1.05,.46,1600],['chord',1.28,.5,350]],
    '82':[['ping',.05,.6,660],['ping',.22,.64,880],['wind',.36,.85,1800],['ping',.62,.6,990],['chord',1.02,.78,440]],
    '83':[['hit',.12,.25,120],['hit',.35,.25,150],['hit',.58,.25,180],['hit',.81,.25,210],['rise',.48,.65,195],['chord',1.18,.65,392]],
    '84':[['wind',.04,.5,1600],['ping',.29,.46,523],['ping',.48,.46,659],['ping',.67,.48,784],['chord',1.03,.78,523]],
    '90':[['wind',.02,.5,750],['water',.4,.55,1200],['metal',.73,.33,310],['water',.93,.65,850],['chord',1.22,.58,330]],
    '99':[['metal',.13,.47,260],['metal',.5,.42,330],['hit',.84,.28,100],['metal',1,.54,520],['chord',1.22,.55,294]],
    'bh06':[['metal',.14,.38,330],['rise',.4,.42,250],['metal',.69,.38,440],['rise',.88,.4,330],['chord',1.25,.55,523]],
    'bh10':[['rise',.04,.72,92],['chord',.48,.48,294],['ping',.92,.36,587],['chord',1.24,.54,392]],
    'bh14':[['paper',.08,.36,1700],['hit',.56,.34,85],['metal',.57,.37,390],['ping',.9,.42,523],['ping',1.05,.42,659],['chord',1.23,.55,392]],
    'bh16':[['wind',.14,.58,1250],['metal',.37,.32,480],['wind',.52,.61,1650],['metal',.76,.32,620],['wind',.9,.65,2050],['metal',1.16,.4,790],['crack',1.41,.35,1150]]
  };
  // Motion beds are individually scored against normalized visual time, not a
  // generic opening sting. [material, pitch, peak time, pulse count, pan travel].
  const motion={
 '77':['surf',410,.58,3,.4], '100':['sand',990,.57,4,.3], 'bh18':['engine',85,.56,5,0],
 'bh17':['engine',85,.58,7,.65],
 '15':['glass',392,.57,6,.5], '34':['paper',460,.58,6,.6],
 '55':['glass',190,.59,4,.7], '85':['sand',560,.62,3,.6], '36':['steel',190,.49,3,0], 'bh02':['electric',520,.46,3,.3],
 'bh08':['silk',300,.6,5,.15], '57':['steel',310,.5,12,.3], '12':['wing',630,.47,3,.4], '23':['glass',440,.57,5,.5],
 '41':['glass',170,.61,6,.5], '89':['sand',880,.56,5,.3],
 '35':['steel',270,.46,3,.35], '88':['sand',1000,.52,4,.5], '11':['paper',940,.45,3,.3], '46':['stone',85,.5,3,0],
 '10':['electric',75,.66,6,-.5], '19':['surf',390,.6,3,.6], 'bh12':['silk',750,.58,7,.3],
 '01':['wing',650,.52,3,.35], 'bh07':['electric',220,.57,7,.5], 'bh11':['paper',1100,.5,5,.2],
 '45':['sand',370,.54,3,.3],
 '02':['glass',440,.65,6,.5], '86':['electric',170,.58,3,.8],
 'bh04':['surf',320,.65,4,.9],
    '03':['glass',260,.57,3,.2], '04':['steel',170,.63,4,0],
    '06':['surf',360,.58,2,.55], '07':['engine',83,.45,12,.55],
    '08':['electric',220,.53,9,-.6], '13':['paper',1150,.36,5,.55],
    '14':['steel',330,.53,1,0], '17':['glass',370,.65,7,-.6],
    '21':['steel',105,.49,4,0], '22':['electric',340,.58,3,.65],
    '27':['paper',950,.46,3,.45], '29':['wing',640,.43,4,0],
    '30':['surf',480,.57,2,.8], '38':['paper',680,.44,5,0],
    '39':['surf',470,.61,3,-.7], '40':['steel',110,.34,2,0],
    '43':['paper',1000,.41,5,.25], '48':['glass',260,.56,4,.6],
    '51':['silk',730,.6,3,-.7], '56':['steel',510,.47,1,.85],
    '61':['electric',380,.3,1,0], '66':['paper',930,.59,3,.65],
    '67':['paper',1700,.54,6,.8], '81':['paper',1100,.39,8,.5],
    '82':['glass',660,.56,6,.3], '83':['stone',105,.46,4,0],
    '84':['wing',1100,.52,8,.8], '87':['glass',392,.64,7,.65],
    '90':['surf',400,.57,7,-.4], '99':['steel',260,.58,2,-.45],
    'bh01':['surf',440,.5,3,.5], 'bh05':['paper',1150,.47,2,.6],
    'bh06':['electric',280,.52,3,.6], 'bh09':['steel',500,.51,2,.85],
    'bh10':['chauffeur',92,.5,2,.45], 'bh13':['paper',1100,.48,3,0],
    'bh14':['paper',970,.36,4,.5], 'bh16':['steel',680,.52,3,-.8],
    'bh19':['electric',175,.6,5,0], 'bh20':['wing',590,.57,6,.65],
    'bh21':['sand',620,.54,4,.55], 'bh22':['glass',440,.56,3,0]
  };
  const sampleBuffers = new Map();
  let sampleBufferBytes = 0;
  const MAX_SAMPLE_BYTES = 16 * 1024 * 1024;
  function cachedSamples(ac, key, duration, fill){
    key = ac.sampleRate + ':' + key;
    let buffer = sampleBuffers.get(key);
    if(buffer){ sampleBuffers.delete(key); sampleBuffers.set(key,buffer); return buffer; }
    buffer = ac.createBuffer(1,Math.ceil(ac.sampleRate*duration),ac.sampleRate);
    fill(buffer.getChannelData(0));
    const bytes = buffer.length * 4;
    if(bytes <= MAX_SAMPLE_BYTES){
      while(sampleBufferBytes + bytes > MAX_SAMPLE_BYTES && sampleBuffers.size){
        const oldest = sampleBuffers.keys().next().value;
        sampleBufferBytes -= sampleBuffers.get(oldest).length * 4;
        sampleBuffers.delete(oldest);
      }
      sampleBuffers.set(key,buffer); sampleBufferBytes += bytes;
    }
    return buffer;
  }
  function schedule(ac,destination,id,volume=1){
    const score=cues[String(id)];if(!score||volume<=0)return null;
    const now=ac.currentTime,out=ac.createGain(),nodes=[out],sources=[];
    // Stronger attacks than the old quiet signature tones; the game's existing
    // SFX bus supplies compression and room ambience. User volume is applied once.
    out.gain.setValueAtTime(Math.min(1,volume)*.72,now);out.connect(destination);
    let cueLevel=1;
    function voice(node,at,dur,level,attack=.008){
      const gain=ac.createGain();nodes.push(node,gain);sources.push(node);
      gain.gain.setValueAtTime(0,now+at);gain.gain.linearRampToValueAtTime(level*cueLevel,now+at+attack);gain.gain.exponentialRampToValueAtTime(.0001,now+at+dur);gain.gain.setValueAtTime(0,now+at+dur+.005);
      node.connect(gain);gain.connect(out);node.start(now+at);node.stop(now+at+dur+.01);return gain;
    }
    function tone(type,f0,f1,at,dur,level){const o=ac.createOscillator();o.type=type;o.frequency.setValueAtTime(f0,now+at);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),now+at+dur);voice(o,at,dur,level);}
    function noise(at,dur,freq,level,type='bandpass'){
      const source=ac.createBufferSource(),filter=ac.createBiquadFilter();nodes.push(filter);
      const buffer=cachedSamples(ac,['noise',at,dur,freq].join(':'),dur,function(data){
      let seed=7919+Math.round(at*1000+freq);for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=(seed/2147483648-1);}
      });
      source.buffer=buffer;filter.type=type;filter.frequency.setValueAtTime(freq,now+at);filter.frequency.exponentialRampToValueAtTime(Math.max(100,freq*.45),now+at+dur);filter.Q.value=.75;
      const gain=voice(source,at,dur,level,.012);source.disconnect();source.connect(filter);filter.connect(gain);
    }
    // Physical textures follow each score's existing motion beats. These replace
    // shared synth chords; Jorge retains his established sea score unchanged.
    const themes={
 '77':'river','100':'ice','bh18':'stone',
 'bh17':'stone',
      '15':'harp','34':'dance',
      '55':'space','85':'specter','36':'chain','bh02':'mechanism','bh08':'chuckle','57':'mechanism','12':'wing','23':'harp',
      '41':'glass','89':'ice',
      '35':'blade','88':'ice','11':'parchment',
      '10':'implosion','19':'river','bh12':'garden',
      '01':'wing','bh07':'circuit','bh11':'parchment','03':'wood','04':'chain','07':'engine','08':'glitch',
      '13':'writing','14':'blade','17':'glass','21':'chain','22':'circuit','27':'parchment','29':'wing','30':'blade',
      '38':'sizzle','39':'rope','40':'forge','43':'origami','45':'wind','48':'space','51':'cloth','56':'blade','61':'rifle',
      '66':'stamp','67':'eraser','81':'dough','82':'ice','83':'stone','84':'flutter','86':'fireworks','87':'ukulele',
      '90':'net','99':'balance','bh01':'sailing','bh04':'maelstrom','bh05':'origami','bh06':'mechanism','bh09':'blade',
      'bh10':'chauffeur','bh13':'coin','bh14':'stamp','bh16':'blade','bh19':'charge','bh20':'wing','bh21':'sand','bh22':'harp'
    };
    const preserveOriginal=['06','27','84','86','45','29'].includes(String(id));
    // Only these non-Carpathian cards receive the new material voices. The
    // existing scores, generators and mix for IDs 80–100 stay untouched.
    const diverseThemes={'03':'woodblock','08':'radio','13':'pencil','15':'plucked','21':'ratchet','34':'mallet','40':'anvil','48':'sonar','bh06':'relay','bh13':'coins'};
    const theme=preserveOriginal?null:(diverseThemes[String(id)] || themes[String(id)]);
    const materialGain={woodblock:1.5,radio:1.8,pencil:2.5,plucked:1.4,ratchet:2,mallet:1.4,anvil:1.2,sonar:1.3,coins:2,relay:2,dance:2.5,specter:2.5,chuckle:3,garden:3,writing:4,eraser:4,cloth:3.8,circuit:5,charge:5,origami:2.2,parchment:2.5,wind:2.2,flutter:3.3,rope:2.3,net:2.3,dough:2.1,sailing:2.5,maelstrom:2.2,wing:1.7,engine:1.5,chauffeur:2.2,chain:1.8,blade:1.4,sizzle:2,sand:1.8,glitch:2,rifle:1.3,wood:1.4};
    if(theme)out.gain.setValueAtTime(Math.min(1,volume)*.72*(materialGain[theme]||1)*(String(id)==='77'?1.8:1),now);
    function materialVoice(material,at,dur,f,level,role){
      dur=Math.min(dur,1.94-at);if(dur<=0)return;
      const source=ac.createBufferSource(),buffer=cachedSamples(ac,['material',material,at,dur,f,role].join(':'),dur,function(data){
      let seed=1337+Math.round(at*999+f),low=0,previous=0,phase=0;
      const tonal=['glass','ice','ukulele','harp','coin','balance','mechanism','forge','space'].includes(material);
      for(let i=0;i<data.length;i++){
        const sec=i/ac.sampleRate,u=sec/dur;seed=(Math.imul(seed,1664525)+1013904223)>>>0;
        const n=seed/2147483648-1;low=low*.985+n*.015;const high=n-previous;previous=n;
        phase+=Math.PI*2*f/ac.sampleRate;
        const strike=Math.exp(-sec*38),swell=Math.sin(Math.PI*u),flutter=.2+.8*Math.sin(sec*Math.PI*(material==='flutter'?28:7))**2;
        let sample=0;
        if(material==='woodblock'){
          sample=(Math.sin(phase*.65)*.65+Math.sin(phase*1.47)*.23)*Math.exp(-sec*28)+low*2*strike;
        }else if(material==='radio'){
          const gate=Math.floor(sec*23)%3!==0?1:.08;
          sample=(Math.sin(phase*(1+.16*Math.floor(sec*18)))*.27+high*.14)*gate*Math.exp(-sec*6);
        }else if(material==='pencil'){
          sample=high*.42*(.1+.9*Math.sin(sec*37)**12)*swell+Math.sin(phase*2.1)*.08*strike;
        }else if(material==='plucked'){
          sample=(Math.sin(phase)*.45+Math.sin(phase*2)*.2+Math.sin(phase*3)*.08)*Math.exp(-sec*10)+high*.12*strike;
        }else if(material==='ratchet'||material==='relay'){
          const pulse=Math.exp(-((sec*(material==='ratchet'?19:8))%1)*24);
          sample=(high*.3+Math.sin(phase*1.73)*.25)*pulse*Math.exp(-sec*5)+Math.sin(phase*.25)*.22*strike;
        }else if(material==='mallet'){
          sample=(Math.sin(phase)*.5+Math.sin(phase*2.76)*.22+Math.sin(phase*5.4)*.08)*Math.exp(-sec*9);
        }else if(material==='anvil'){
          sample=(Math.sin(phase)*.35+Math.sin(phase*2.41)*.25+Math.sin(phase*5.17)*.13)*Math.exp(-sec*7)+n*strike*.3;
        }else if(material==='sonar'){
          sample=Math.sin(phase*(1+.07*u))*.55*Math.exp(-sec*5)*Math.min(1,sec*90);
        }else if(material==='coins'){
          sample=(Math.sin(phase*2.3)*.28+Math.sin(phase*3.91)*.2)*Math.exp(-sec*18)+high*.18*strike;
        }else if(material==='dance'){
          sample=(Math.sin(phase)+Math.sin(phase*2)*.28+Math.sin(phase*3)*.13)*.28*swell*(.7+.3*Math.sin(sec*18));
          sample+=low*2*Math.exp(-sec*22);
        }else if(material==='specter'){
          sample=(Math.sin(phase*(.6+.08*Math.sin(sec*13)))*.24+Math.sin(phase*.89)*.1+low*3)*swell;
        }else if(material==='chuckle'){
          const pulse=Math.sin(sec*Math.PI*8)**4;
          sample=(Math.sin(phase*(1-.25*u))*.32+Math.sin(phase*2.07)*.12+n*.09)*pulse*swell;
        }else if(material==='implosion'){
          const suction=Math.sin(sec*Math.PI*2*(f+130*u));
          sample=role==='hit'?(Math.sin(sec*Math.PI*2*62)*.55+low*3)*Math.exp(-sec*13):(suction*.22+low*3+n*.08)*swell;
          if(role==='crack')sample+=high*.28*Math.exp(-sec*24);
        }else if(material==='river'){
          sample=(low*3.5+n*.11)*swell*(.55+.45*Math.sin(sec*11)**2);
          if(role==='ping')sample+=Math.sin(phase*(1-.32*u))*.29*Math.exp(-sec*17);
        }else if(material==='garden'){
          sample=(high*.12+n*.15)*swell*(.25+.75*Math.sin(sec*36)**6);
          sample+=Math.sin(phase*(1+.12*u))*.14*swell;
          if(role==='ping')sample+=Math.sin(phase*2)*.2*Math.exp(-sec*13);
        }else if(['origami','parchment','writing','eraser','cloth','rope','net','dough'].includes(material)){
          const rough=material==='origami'?21:material==='writing'?47:material==='eraser'?34:material==='cloth'?8:material==='dough'?12:18;
          sample=(high*.23+n*.18)*(.15+.85*Math.sin(sec*Math.PI*rough)**8)*swell;
          if(['dough','parchment','origami'].includes(material))sample+=Math.sin(sec*(Math.PI*2)*(material==='dough'?105:260))*strike*.2;
          if(material==='net'||material==='rope')sample+=low*2.5*swell+Math.sin(phase*.3)*Math.exp(-sec*12)*.1;
        }else if(['wing','flutter','wind','sand','sailing','maelstrom'].includes(material)){
          sample=(low*4.2+n*.17)*swell*(material==='wing'||material==='flutter'?flutter:1);
          if(material==='wing')sample+=Math.sin(sec*(Math.PI*2)*75)*Math.exp(-sec*15)*.23;
          if(material==='sand')sample+=high*.17*Math.sin(sec*53)**10;
          if(material==='sailing'||material==='maelstrom')sample+=Math.sin(phase*(1-u*.6))*.08*swell;
        }else if(material==='chauffeur'){
          // Smooth luxury-car glide with no sharp transient that could read as gunfire.
          sample=(Math.sin(phase*.55)*.18+Math.sin(phase*1.1)*.08+low*1.7)*swell;
          if(role==='ping'||role==='chord')sample+=Math.sin(phase*4)*.16*Math.exp(-sec*5);
        }else if(['blade','chain','rifle','fireworks','stone','stamp','engine','sizzle'].includes(material)){
          if(material==='blade')sample=n*.25*swell+(.28*Math.sin(phase)+.12*Math.sin(phase*2.71))*Math.exp(-sec*8);
          if(material==='chain')sample=(Math.sin(phase)+.5*Math.sin(phase*2.76)+.3*Math.sin(phase*4.1))*.23*Math.exp(-sec*11)+high*.12*strike;
          if(material==='rifle')sample=high*.43*strike+Math.sin(sec*(Math.PI*2)*83)*Math.exp(-sec*18)*.42+low*3*Math.exp(-sec*9);
          if(material==='fireworks')sample=(n*.4+low*3)*Math.exp(-sec*7)+high*.32*Math.sin(sec*107)**24*(1-u);
          if(material==='stone'||material==='stamp')sample=low*4*Math.exp(-sec*9)+Math.sin(sec*(Math.PI*2)*(material==='stone'?74:155))*Math.exp(-sec*20)*.4;
          if(material==='engine')sample=low*3+(.21*Math.sin(sec*(Math.PI*2)*(55+30*u))+.1*n)*(.3+.7*Math.sin(sec*(Math.PI*2)*13)**6);
          if(material==='sizzle')sample=high*.25*swell+n*.3*Math.sin(sec*137)**20;
        }else if(tonal){
          const harmonics=material==='ukulele'?[1,2,3,4,5]:material==='harp'?[1,2,3,6]:material==='space'?[1,1.004,1.501]:[1,2.76,4.08];
          harmonics.forEach((h,j)=>{sample+=Math.sin(phase*h)*Math.exp(-sec*(material==='ukulele'?6+j*3:2+j*3))*.38/(j+1);});
          sample+=n*strike*(material==='ukulele'?.16:.05);
          if(material==='ice')sample+=high*.15*Math.exp(-sec*35);
        }else if(material==='wood')sample=Math.sin(phase)*Math.exp(-sec*19)*.4+low*3*strike;
        else { // Digital clocks, relay closures and charging arcs.
          const step=Math.floor(sec*24)%4,base=material==='charge'?1+u*2:1+step*.25;
          sample=Math.sin(phase*base)*.2+Math.sin(phase*base*2.01)*.07+n*.08;
          sample*=material==='glitch'?(Math.floor(sec*45)%3===0?0:1):swell;
        }
        data[i]=Math.tanh(sample*1.6)*Math.min(1,u*70)*Math.min(1,(1-u)*50);
      }
      });
      source.buffer=buffer;voice(source,at,dur,level,.004);
    }

    // A continuous moving texture swells into the visual's main action and
    // breathes with repeating motion. Its filter opens, then settles at release.
    const profile=String(id)==='46'?null:motion[String(id)];
    if(profile){
      const [material,pitch,peak,pulses,pan]=profile;
      const source=ac.createBufferSource(),filter=ac.createBiquadFilter(),gain=ac.createGain(),stereo=ac.createStereoPanner();
      nodes.push(source,filter,gain,stereo);sources.push(source);
      const buffer=cachedSamples(ac,['motion',material,pitch].join(':'),1.98,function(data){
      let seed=3203,low=0;
      for(let i=0;i<data.length;i++){
        seed=(Math.imul(seed,1664525)+1013904223)>>>0;const white=seed/2147483648-1,sec=i/ac.sampleRate;low=low*.96+white*.04;
        const harmonic=Math.sin(sec*pitch*Math.PI*2)+.27*Math.sin(sec*pitch*2.013*Math.PI*2);
        data[i]=material==='glass'?harmonic*.34+white*.035:material==='electric'?harmonic*.27+white*.2:material==='chauffeur'?low*1.65+harmonic*.1:material==='engine'||material==='stone'?low*2.4+harmonic*.16:material==='steel'?white*.48+harmonic*.14:material==='surf'?low*2.7+white*.16:white*.65;
      }
      });
      source.buffer=buffer;filter.type=['glass','engine','chauffeur','stone','surf'].includes(material)?'lowpass':'bandpass';filter.Q.value=material==='steel'?1.8:.7;
      const curve=new Float32Array(121),frequencies=new Float32Array(121),pans=new Float32Array(121);
      for(let i=0;i<curve.length;i++){
        const t=i/(curve.length-1),rise=Math.sin(Math.min(1,t/peak)*Math.PI/2),release=t<peak?1:Math.pow(Math.max(0,1-(t-peak)/(1-peak)),.9);
        const pulse=.36+.64*Math.pow(.5-.5*Math.cos(t*Math.PI*2*pulses),material==='wing'?2:1);
        curve[i]=(theme?.12:.34)*rise*release*pulse;frequencies[i]=Math.max(100,pitch*(material==='glass'?5:3)*(1+2.8*rise*release));pans[i]=pan*Math.sin((t-.5)*Math.PI);
      }
      curve[0]=curve[curve.length-1]=0;gain.gain.setValueCurveAtTime(curve,now,1.98);filter.frequency.setValueCurveAtTime(frequencies,now,1.98);stereo.pan.setValueCurveAtTime(pans,now,1.98);
      source.connect(filter);filter.connect(gain);gain.connect(stereo);stereo.connect(out);source.start(now);source.stop(now+1.985);
    }
    for(const [kind,at,dur,f] of score){
      if(kind==='royal'){
        tone('triangle',f*.99,f,at,dur,.24);
        tone('sine',f*1.5,f*1.5,at+.015,dur-.015,.16);
        tone('sine',f*.5,f*.5,at,dur,.22);continue;
      }
      if(kind==='crown'){
        [1,2,3.01].forEach((n,j)=>tone('sine',f*n,f*n,at+j*.009,dur-j*.009,.27/(j+1)));
        tone('triangle',196,196,at,.66,.15);continue;
      }
      if(theme){materialVoice(theme,at,dur,f,.8,kind);continue;}
      if(kind==='hit'){tone('sine',f*2.4,f*.6,at,dur,.8);noise(at,Math.min(.14,dur),900,.3,'lowpass');}
      else if(kind==='crack'){noise(at,dur,f,.9);tone('triangle',210,65,at,dur,.36);}
      else if(kind==='metal'){[1,2.76,4.08].forEach((n,j)=>tone('sine',f*n,f*n*.985,at,dur,.43/(j+1)));noise(at,.06,3100,.2);}
      else if(kind==='chord'){[1,1.25,1.5,2].forEach((n,j)=>tone(j?'sine':'triangle',f*n,f*n,at+j*.022,dur-j*.022,.27/(1+j*.3)));}
      else if(kind==='ping'){tone('sine',f,f,at,dur,.5);tone('sine',f*2.01,f*2,at,dur*.6,.15);}
      else if(kind==='rise'){tone('triangle',f,f*3,at,dur,.3);noise(at,dur,1100,.22);}
      else if(kind==='rumble'){tone('sawtooth',f,f*.6,at,dur,.15);tone('sine',f*.7,40,at,dur,.38);noise(at,dur,280,.38,'lowpass');}
      else if(kind==='glitch'){for(let j=0;j<5;j++)tone('square',f*(1+j%3),f*(j%2?2:.6),at+j*.04,.065,.16);}
      else if(kind==='water'){noise(at,dur,f,.65,'lowpass');for(let j=0;j<4;j++)tone('sine',370+j*120,160+j*70,at+j*.085,.18,.19);}
      else if(kind==='scratch'){for(let j=0;j<5;j++)noise(at+j*.075,.12,f+j*170,.33);}
      else if(kind==='paper'){noise(at,dur,f,.65);noise(at+.035,dur*.7,f*1.8,.28,'highpass');}
      else if(kind==='wind')noise(at,dur,f,.66);
    }
    // Small, deliberately placed secondary contacts follow multipart artwork.
    // Times are seconds (the visual t is normalized over two seconds).
    const contacts={
      '07':[.32,.54,.76,1.02,1.26], '13':[.22,.37,.52,.67,1.02,1.3],
      '14':[.97,1.07,1.17,1.27], '17':[.28,.44,.6,.76,.92,1.08,1.24],
      '21':[.89,1.02,1.19,1.4], '38':[.48,.65,.83,1.02],
      '43':[.24,.42,.62,.84,1.22], '56':[1.05,1.18,1.31],
      '61':[.86,.95,1.04,1.22,1.29,1.36], '66':[.59,.79,.99],
      '67':[.66,.76,.86,.96,1.06,1.16,1.48], '81':[.31,.43,.55,.67,.79,.91,1.25],
      '83':[.35,.51,.67,.83,1.3], '87':[1.00,1.063,1.125,1.188,1.251,1.314,1.377,1.47,1.54,1.61],
      '90':[.34,.46,.58,.7,.82,.94,1.24], 'bh06':[.39,.83,1.25],
      'bh13':[.57,.79,1.01,1.48], 'bh14':[.7,1.03,1.18,1.33],
      'bh16':[.42,.82,1.22], 'bh19':[.46,.6,.74,.88,1.02],
      'bh20':[.31,.64,.97,1.3,1.63], 'bh22':[.58,.86,1.18,1.47]
    }[String(id)]||(preserveOriginal?[.47,.89,1.37]:[]);
    cueLevel=.28;
    contacts.forEach((at,i)=>{
      const material=profile?.[0],f=(profile?.[1]||330)*(1+(i%4)*.19);
      if(theme){materialVoice(theme,at,.17,f,.5,'contact');return;}
      if(id==='87'){tone('triangle',[392,494,587,659,784,880,988][i%7],f,at,.22,.52);}
      else if(material==='paper'||material==='sand')noise(at,.085,f*1.8,.55,'highpass');
      else if(material==='wing')noise(at,.22,750+i%3*250,.75,'lowpass');
      else if(material==='surf'){noise(at,.19,1300,.48);tone('sine',f*2,f,at,.2,.24);}
      else{tone('sine',f*2.02,f*2,at,.22,.46);noise(at,.055,2100,.3);}
    });
    let stopped=false;
    return {stop(){if(stopped)return;stopped=true;for(const s of sources)try{s.stop();}catch(e){}for(const n of nodes)try{n.disconnect();}catch(e){}}};
  }
  function play(id){
    try{
      const master=typeof _masterVol==='number'?_masterVol:1,sfx=typeof _sfxVol==='number'?_sfxVol:.8;
      if(master<=0||sfx<=0||document.hidden||typeof getAudioCtx!=='function'||typeof getSfxBus!=='function')return null;
      const ac=getAudioCtx(),sound=schedule(ac,getSfxBus(ac).input,id,master*sfx);if(!sound)return null;
      let timer;const stop=()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',hidden);sound.stop();};
      const hidden=()=>{if(document.hidden)stop();};document.addEventListener('visibilitychange',hidden);timer=setTimeout(stop,2000);return {stop};
    }catch(e){return null;}
  }
  window.FateApprovedActivationSfx={play,schedule,handles:id=>Object.hasOwn(cues,String(id)),ids:Object.keys(cues)};
})();
