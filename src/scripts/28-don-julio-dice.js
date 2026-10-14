/* Don Julio: selected sideways-tumble from the October 7 plain-dice-motion preview. */
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
    scene.style.cssText='position:fixed;inset:0;z-index:2147483600;pointer-events:auto;background:radial-gradient(ellipse,#080b1020,#07080ada);display:grid;place-items:center;color:#f0dfb7;font:25px Georgia,serif';
    scene.innerHTML='<div style="position:relative;width:min(700px,100vw);height:390px"><canvas role="img" style="width:100%;height:390px"></canvas><div style="position:absolute;top:26px;left:0;right:0;text-align:center;letter-spacing:.15em">DON JULIO</div><output aria-live="polite" style="position:absolute;top:342px;left:0;right:0;text-align:center;font-size:27px;color:#fff3d3"></output></div>';
    document.body.appendChild(scene);
    window.playDonJulioDiceSfx?.('enter');
    // The die touches the floor when |sin(t * 3π)| returns to zero: at one
    // third and two thirds of the 2.1-second tumble. The final contact is the
    // dedicated landing cue fired by the animation frame below.
    const impactTimers=[700,1400].map((delay,index)=>setTimeout(()=>window.playDonJulioDiceSfx?.('impact',index),delay));
    const canvas=scene.querySelector('canvas'),ctx=canvas.getContext('2d'),out=scene.querySelector('output');
    if(!ctx){impactTimers.forEach(clearTimeout);scene.remove();resolve(false);return;}
    const dots=[[4],[0,8],[0,4,8],[0,2,6,8],[0,2,4,6,8],[0,2,3,5,6,8]],W=canvas.clientWidth;
    let pose={x:0,y:0,rx:-.13,ry:.18,rz:0,scale:1};
    const dpr=Math.min(devicePixelRatio||1,2);canvas.width=W*dpr;canvas.height=390*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
    const faces=[{n:[0,0,1],u:[1,0,0],v:[0,1,0]},{n:[1,0,0],u:[0,0,-1],v:[0,1,0]},{n:[0,-1,0],u:[1,0,0],v:[0,0,1]},{n:[0,1,0],u:[1,0,0],v:[0,0,-1]},{n:[-1,0,0],u:[0,0,1],v:[0,1,0]},{n:[0,0,-1],u:[-1,0,0],v:[0,1,0]}];
function rotate(p){let[x,y,z]=p,c=Math.cos(pose.rx),s=Math.sin(pose.rx);[y,z]=[y*c-z*s,y*s+z*c];c=Math.cos(pose.ry);s=Math.sin(pose.ry);[x,z]=[x*c+z*s,-x*s+z*c];c=Math.cos(pose.rz);s=Math.sin(pose.rz);return[x*c-y*s,x*s+y*c,z]}
function project(p){const t=rotate(p),f=650/(650-t[2]);return[W/2+pose.x+t[0]*f,225+pose.y+t[1]*f]}
function draw(){ctx.clearRect(0,0,W,390);const h=55*pose.scale;ctx.save();ctx.translate(W/2+pose.x*.6,300);ctx.scale(1,.2);const shadow=ctx.createRadialGradient(0,0,8,0,0,90);shadow.addColorStop(0,'#0008');shadow.addColorStop(1,'#0000');ctx.fillStyle=shadow;ctx.fillRect(-100,-100,200,200);ctx.restore();const side=[1,2,3,4,5,6].filter(n=>n!==roll&&n!==7-roll);const values=[roll,side[0],side[1],7-side[1],7-side[0],7-roll];
faces.map((face,i)=>({face,i,n:rotate(face.n)})).filter(f=>f.n[2]>.01).sort((a,b)=>a.n[2]-b.n[2]).forEach(({face,i,n})=>{const local=(u,v)=>face.n.map((t,j)=>h*(t+face.u[j]*u+face.v[j]*v));const poly=[[-1,-1],[1,-1],[1,1],[-1,1]].map(p=>project(local(...p)));ctx.beginPath();poly.forEach((p,j)=>j?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();const shade=Math.round(175+70*n[2]-20*n[0]-10*n[1]);ctx.fillStyle='rgb('+shade+','+shade+','+(shade-5)+')';ctx.fill();ctx.strokeStyle='#777870';ctx.lineWidth=1.5;ctx.stroke();for(const d of dots[values[i]-1]){const u=(d%3-1)*.55,v=(Math.floor(d/3)-1)*.55;ctx.beginPath();for(let q=0;q<=24;q++){const a=q/24*Math.PI*2,p=project(local(u+Math.cos(a)*.12,v+Math.sin(a)*.12));q?ctx.lineTo(...p):ctx.moveTo(...p)}ctx.fillStyle='#181919';ctx.fill()}})}

    const start=performance.now(),duration=matchMedia('(prefers-reduced-motion: reduce)').matches?100:2100;
    function frame(now){
      const t=Math.min(1,(now-start)/duration),remain=Math.pow(1-t,3);
      pose={x:-Math.min(W*.35,220)*remain,y:-Math.abs(Math.sin(t*Math.PI*3))*55*(1-t),
        rx:-.13+remain*Math.PI*4,ry:.18,rz:remain*Math.PI*3,scale:1};
      draw();
      if(t<1) requestAnimationFrame(frame);
      else{
        impactTimers.forEach(clearTimeout);
        window.playDonJulioDiceSfx?.('land');
        out.textContent='Rolled '+roll;
        canvas.setAttribute('aria-label','Die showing '+roll+' on its large front face');
        setTimeout(()=>{window.playDonJulioDiceSfx?.('exit');scene.remove();resolve(true)},900);
      }
    }
    requestAnimationFrame(frame);
  });}
})();

