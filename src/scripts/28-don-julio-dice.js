/* Don Julio: stationary monochrome Loaded Verdict with a final red seal. */
(function(){
  let queue=Promise.resolve();
  const seen=new Set();
  const fateHolds=new Map();
  window.holdDonJulioFate=function(event){
    const iid=String(event.sourceIid||event.cardIid||'');
    if(!iid || fateHolds.has(iid))return;
    fateHolds.set(iid,{before:event.before,callbacks:[]});
  };
  window.donJulioHeldFate=iid=>fateHolds.get(String(iid))?.before;
  window.deferDonJulioFate=function(iid,callback){
    const hold=fateHolds.get(String(iid));if(!hold)return false;
    hold.callbacks.push(callback);return true;
  };
  const pending=[];
  const pendingFish=[];
  const presentedFishKeys=new Set();
  const hiddenFish=new Set();
  window.holdSebastianFishCards=iids=>{for(const iid of iids||[])hiddenFish.add(String(iid));};
  window.isSebastianFishHidden=card=>hiddenFish.has(String(card?.iid));
  window.queueSebastianFishOverlay=(card,key,iids=[])=>{
    if(!card)return false;
    const normalizedKey=String(key||'');
    if(normalizedKey&&(presentedFishKeys.has(normalizedKey)||pendingFish.some(item=>String(item.key||'')===normalizedKey)))return false;
    window.holdSebastianFishCards(iids);
    pendingFish.push({card,key:normalizedKey,iids});
    return true;
  };
  window.presentSebastianFishAfterResolution=async function(card,key,iids=[]){
    const normalizedKey=String(key||'');
    if(normalizedKey&&presentedFishKeys.has(normalizedKey))return false;
    if(normalizedKey){
      presentedFishKeys.add(normalizedKey);
      if(presentedFishKeys.size>160)presentedFishKeys.delete(presentedFishKeys.values().next().value);
    }
    window.holdSebastianFishCards(iids);
    // Pickers can hand off to another picker after their closing animation.
    // Keep both the effect and the new hand card hidden throughout that handoff.
    let quietSince=0;
    while(true){
      const pickerOpen=typeof effectChoicePresentationUiOpen==='function' && effectChoicePresentationUiOpen();
      const delay=typeof getChoicePresentationDelayMs==='function'?getChoicePresentationDelayMs():0;
      const busy=pickerOpen || delay>0 || document.querySelector?.('#modal.on, .cc-overlay-v2, .effect-activation-cinematic');
      if(busy) quietSince=0;
      else {
        if(!quietSince) quietSince=Date.now();
        if(Date.now()-quietSince>=200) break;
      }
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    for(const iid of iids)hiddenFish.delete(String(iid));
    window.renderGame?.({board:true,hand:true,oppHand:true});
    await new Promise(resolve=>{
      if(typeof requestAnimationFrame==='function')requestAnimationFrame(resolve);
      else setTimeout(resolve,0);
    });
    window.flashCardEffect?.(card,'sebastian_fish',{label:'Fishmonger',soundKey:normalizedKey,onlineRemote:true});
    window.renderGame?.({board:true,hand:true,oppHand:true});
    return true;
  };
  window.flushSebastianFishOverlays=async function(state){
    if(state?.pendingPrompt || state?.pendingHandLimit || state?.effectStack?.length)return;
    for(const item of pendingFish.splice(0)) await window.presentSebastianFishAfterResolution(item.card,item.key,item.iids);
  };
  window.queueDonJulioDieRoll=function(event,key,card){
    if(event?.type==='FATE_DIE_ROLLED'){window.holdDonJulioFate(event);pending.push({event,key,card});}
  };
  window.flushDonJulioDieRolls=async function(state){
    if(state?.pendingPrompt || state?.pendingHandLimit || state?.effectStack?.length) return;
    const ready=pending.splice(0);
    for(const item of ready) await window.presentDonJulioDieRoll(item.event,item.key,item.card);
  };
  async function waitForSupporterPresentation(){
    // The caller has finished the effect/pickers. Its last cinematic may still
    // be fading or queued, so wait before taking the dice input lock.
    while(true){
      const delay=typeof getChoicePresentationDelayMs==='function'?getChoicePresentationDelayMs():0;
      const busy=document.querySelector?.('.cc-overlay-v2, .effect-activation-cinematic');
      if(!busy && delay<=0) return;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
  }
  function blockInput(event){
    if(!window.donJulioDiceBusy) return;
    event.preventDefault();event.stopImmediatePropagation();
  }
  for(const type of ['pointerdown','pointerup','click','dblclick','keydown','keyup','wheel','touchstart'])
    window.addEventListener?.(type,blockInput,{capture:true,passive:false});
  window.presentDonJulioDieRoll=function(event,batchKey,card){
    if(event?.type!=='FATE_DIE_ROLLED'||!Number.isInteger(event.roll)||event.roll<1||event.roll>6)return;
    const key=batchKey==null?null:String(batchKey)+':'+event.sourceIid+':'+event.roll;
    if(key&&seen.has(key))return;
    if(key){seen.add(key);if(seen.size>512)seen.delete(seen.values().next().value);}
    window.holdDonJulioFate(event);
    queue=queue.catch(()=>{}).then(async()=>{
      await waitForSupporterPresentation();
      window.donJulioDiceBusy=true;
      try{
      return await animate(event.roll);
      }finally{
        window.donJulioDiceBusy=false;
        const iid=String(event.sourceIid),hold=fateHolds.get(iid);fateHolds.delete(iid);
        for(const callback of hold?.callbacks||[])callback();
        const liveCard=window.findBoardCardByIid?.(iid) || card;
        if(liveCard) window.flashCardEffect?.(liveCard,'don_julio_dice',{label:'Don Julio',onlineRemote:true,soundKey:key});
        window.renderGame?.({board:true,scores:true});
      }
    });
    return queue;
  };
  function animate(roll){return new Promise(resolve=>{
    const scene=document.createElement('div');
    scene.className='don-julio-dice-overlay';
    scene.style.cssText='position:fixed;inset:0;z-index:2147483600;pointer-events:auto;background:radial-gradient(ellipse,#080b1065,#020406f5);display:grid;place-items:center';
    scene.innerHTML='<canvas role="img" style="width:100%;height:100%;position:absolute;inset:0"></canvas><output aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)"></output>';
    document.body.appendChild(scene);
    const canvas=scene.querySelector('canvas'),ctx=canvas.getContext('2d'),out=scene.querySelector('output');
    if(!ctx){scene.remove();resolve(false);return;}
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const times=[0,160,320,490,680,900,1160,1460,1810,2220],duration=reduced?0:3200;
    const result=roll,patterns={1:[[0,0]],2:[[-32,-32],[32,32]],3:[[-32,-32],[0,0],[32,32]],4:[[-32,-32],[32,-32],[-32,32],[32,32]],5:[[-32,-32],[32,-32],[0,0],[-32,32],[32,32]],6:[[-32,-32],[32,-32],[-32,0],[32,0],[-32,32],[32,32]]};
    let w=0,h=0,step=-1,lastTick=-999,value=1,locked=false,playing=true;
    function pips(n,color,rad){ctx.fillStyle=color;for(const [x,y] of patterns[n]){ctx.beginPath();ctx.arc(x,y,rad,0,7);ctx.fill();}}
    function draw(t){
      const width=canvas.clientWidth||window.innerWidth||600,height=canvas.clientHeight||window.innerHeight||510;
      if(w!==width||h!==height){w=width;h=height;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);}
      ctx.clearRect(0,0,w,h);ctx.save();ctx.translate(w/2,h/2-25);
      const since=t-lastTick,after=t-duration;
      const ink='#111111';
const strike=playing&&!locked?Math.max(0,1-since/160):locked?Math.max(0,1-after/200):0;
const scale=Math.min(w*.62,h*.43)/118;
ctx.save();
ctx.textAlign='center';ctx.textBaseline='middle';
const titleY=-h*.36,subtitleY=-h*.285,titleSize=Math.min(58,w*.105);
const gold=ctx.createLinearGradient(0,titleY-titleSize*.6,0,titleY+titleSize*.6);
gold.addColorStop(0,'#fff0b7');gold.addColorStop(.4,'#efd085');gold.addColorStop(.58,'#b88032');gold.addColorStop(1,'#f5d895');
ctx.font='500 '+titleSize+'px Georgia, serif';
ctx.letterSpacing=Math.min(7,w*.012)+'px';
ctx.shadowColor='#000000';ctx.shadowBlur=5;ctx.shadowOffsetY=3;
ctx.fillStyle=gold;ctx.fillText('DON JULIO',0,titleY);
ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.letterSpacing='1px';
ctx.font='italic '+Math.min(23,w*.045)+'px Georgia, serif';ctx.fillStyle='#e6bf72';
ctx.fillText('An Oligarch’s Gamble',0,subtitleY);
// Fine gold rules frame the name without competing with the dice reveal.
const ruleY=titleY-titleSize*.85,ruleWidth=Math.min(w*.23,170);
ctx.strokeStyle='#bb8c466e';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-ruleWidth,ruleY);ctx.lineTo(-10,ruleY);ctx.moveTo(10,ruleY);ctx.lineTo(ruleWidth,ruleY);ctx.stroke();
ctx.fillStyle='#e6bf72';ctx.beginPath();ctx.moveTo(0,ruleY-4);ctx.lineTo(4,ruleY);ctx.lineTo(0,ruleY+4);ctx.lineTo(-4,ruleY);ctx.closePath();ctx.fill();
ctx.restore();
ctx.save();ctx.scale(scale,scale);ctx.translate(0,-5-strike*9);ctx.globalAlpha=1-strike*.5;
ctx.fillStyle='#ffffff';ctx.beginPath();ctx.roundRect(-59,-59,118,118,12);ctx.fill();ctx.strokeStyle=ink;ctx.lineWidth=5;ctx.stroke();pips(value,ink,9);ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(-53,-53,106,106,8);ctx.stroke();ctx.restore();
if(strike>0){ctx.fillStyle=ink;for(let i=0;i<28;i++){const angle=i*2.399,r=scale*68+(1-strike)*35;ctx.globalAlpha=strike*.7;ctx.fillRect(Math.cos(angle)*r,Math.sin(angle)*r-5,2+i%3,2);}ctx.globalAlpha=1;}
if(locked){
 const settle=reduced?1:Math.min(1,after/180),sw=Math.min(w*.81,490);
 ctx.save();ctx.translate(0,scale*65+55);ctx.rotate(-.035);ctx.globalAlpha=.9;ctx.scale(1+(1-settle)*.12,1+(1-settle)*.12);
 ctx.fillStyle='#8d2622';ctx.fillRect(-sw/2,-27,sw,54);ctx.strokeStyle='#e0b488';ctx.lineWidth=2;ctx.strokeRect(-sw/2,-27,sw,54);ctx.lineWidth=1;ctx.strokeRect(-sw/2+6,-21,sw-12,42);
 ctx.fillStyle='#f6e4c5';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`500 ${w<440?21:28}px Georgia`;ctx.fillText('FATE SEALED  /  +'+result,0,0);ctx.restore();
}
      ctx.restore();
    }
    window.playDonJulioDiceSfx?.('enter');
    const start=performance.now();
    function frame(now){
      try{
        const t=Math.max(0,now-start);
        if(!reduced&&t<duration){let changed=false;while(step+1<times.length&&t>=times[step+1]){step++;value=(step*5+6)%6+1;lastTick=times[step];changed=true;}if(changed)window.playDonJulioDiceSfx?.('impact',step);}
        if(t>=duration&&!locked){locked=true;value=roll;window.playDonJulioDiceSfx?.('land');out.textContent='Fate Sealed / +'+roll;canvas.setAttribute('aria-label','Die showing '+roll+'; Fate Sealed, gain '+roll+' Fate');}
        draw(t);
        if(t<duration+1500)requestAnimationFrame(frame);
        else{window.playDonJulioDiceSfx?.('exit');scene.remove();resolve(true);}
      }catch(error){scene.remove();resolve(false);console.warn('Don Julio dice presentation failed',error);}
    }
    requestAnimationFrame(frame);
  });}
})();
