/* Local Howard Dev fixtures. Never registered in CARDS or the network catalog. */
(function(){
  'use strict';
  const prefix='howard-perspective-';
  const names=['Charcoal curls','Wind-swept silk','Graveyard vapour'];
  let layer=null, frame=0, state=null;
  function enabled(){return typeof isHowardDevMode==='function'&&isHowardDevMode();}
  function isTest(card){return !!card&&String(card.id||'').startsWith(prefix);}
  window.isHowardPerspectiveTestCard=isTest;
  window.getHowardPerspectiveTestCards=function(){
    if(!enabled())return [];
    const base={type:'Supporter',aff:'expanded_worlds',fate:0,cost:0,rarity:'circle',img:'assets/ui/veil-of-silence-dev.svg',devOnly:true};
    const mist=names.map((name,i)=>({...base,id:prefix+'mist-'+i,name:'Veil of Silence (Opponent / '+(i+1)+')',ability:name,effect:'HOWARD DEV ONLY. On set: show '+name.toLowerCase()+' over the opponent’s field as though they played Veil of Silence. Lasts until this turn ends. Actions and activation visuals are concealed. Test fixture: 0 Fate, 0 cost.'}));
    const oktai=typeof CARDS!=='undefined'?CARDS.find(c=>c.id==='bh21'):null;
    if(oktai)mist.push({...oktai,id:prefix+'oktai',name:'Oktai (Opponent Test)',devOnly:true,effect:'HOWARD DEV ONLY. On set: apply The Vast Taklamakan to YOU immediately, as if the opponent activated Oktai. Uses the normal four affected-turn duration.'});
    return mist;
  };
  function active(){return !!(state&&enabled()&&typeof G!=='undefined'&&G===state.game&&Number(G.turn)===state.turn&&document.getElementById('s-game')?.classList.contains('active'));}
  window.isHowardMistConcealed=active;
  function clear(){state=null;cancelAnimationFrame(frame);frame=0;layer?.remove();layer=null;document.documentElement.classList.remove('howard-mist-active');}
  window.clearHowardMistPreview=clear;
  function areas(){
    const layout=window.FateMatchLayoutEngine?.last();
    const regions=[];
    if(layout?.zones){
      for(const zone of layout.zones)for(const row of zone.rows){
        // Cover complete opposing rows, plus their cards in contested rows.
        if(Number(row.owner)===state.source&&row.owner!=null)regions.push(row.rect);
        else for(const cell of row.cells||[]){if(Number(cell.card?.owner)===state.source)regions.push(cell.rect);}
      }
    }
    if(!regions.length){const b=document.getElementById('codex-board-v19')||document.getElementById('board');const r=b?.getBoundingClientRect();if(r?.width)regions.push({x:r.x,y:r.y,w:r.width,h:r.height/3});}
    regions.sort((a,b)=>a.y-b.y||a.x-b.x);
    return regions.reduce((out,r)=>{const last=out[out.length-1];if(last&&Math.abs(last.y-r.y)<1&&Math.abs(last.h-r.h)<1&&r.x-last.x-last.w<40)last.w=r.x+r.w-last.x;else out.push({...r});return out;},[]);
  }
  const smokeTextures=new Map();
  function smokeTexture(variant,seed){
    const key=variant+':'+seed;
    if(smokeTextures.has(key))return smokeTextures.get(key);
    const tex=document.createElement('canvas');tex.width=384;tex.height=256;
    const c=tex.getContext('2d'),data=c.createImageData(tex.width,tex.height);
    function hash(x,y){const n=Math.sin(x*127.1+y*311.7+seed*83.3)*43758.5453;return n-Math.floor(n);}
    function noise(x,y){const ix=Math.floor(x),iy=Math.floor(y);let fx=x-ix,fy=y-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);return (hash(ix,iy)*(1-fx)+hash(ix+1,iy)*fx)*(1-fy)+(hash(ix,iy+1)*(1-fx)+hash(ix+1,iy+1)*fx)*fy;}
    function fractal(x,y){return noise(x,y)*.56+noise(x*2,y*2)*.27+noise(x*4,y*4)*.12+noise(x*8,y*8)*.05;}
    for(let y=0;y<256;y++)for(let x=0;x<384;x++){
      const u=x/384,v=y/256;
      // Warped noise produces curled, broken filaments; transparent edges on all sides.
      const warp=fractal(u*4+12,v*4+8),n=fractal(u*5+warp*2,v*4+warp*1.8);
      const envelope=Math.pow(Math.max(0,Math.sin(Math.PI*u)*Math.sin(Math.PI*v)),1.4);
      const filament=Math.pow(Math.max(0,Math.min(1,(n-.30)*3.1)),1.35);
      const shade=12+n*34,i=(y*384+x)*4;
      data.data[i]=shade;data.data[i+1]=shade+(variant===1?-2:1);data.data[i+2]=shade+(variant===1?12:7);
      data.data[i+3]=Math.round(envelope*filament*235);
    }
    c.putImageData(data,0,0);smokeTextures.set(key,tex);return tex;
  }
  window.drawHowardMist=function(ctx,rect,variant,time){
    const {x,y,w,h}=rect;ctx.save();
    // Three different silhouettes and motions, all over the same frozen field.
    if(variant===0){
      // Broken, rounded soot clouds: irregular clusters with large clear gaps.
      const count=Math.max(3,Math.ceil(w/230));
      for(let i=0;i<count;i++){
        const phase=time*.13+i*2.17,px=x+(i+.5)*w/count+Math.sin(phase)*24;
        const py=y+h*(.35+.3*Math.sin(i*4.1))+Math.cos(phase*.8)*10;
        const size=Math.min(w*.7,280)*(1+.18*Math.sin(i*5));
        ctx.save();ctx.translate(px,py);ctx.rotate(Math.sin(phase)*.3);
        ctx.globalAlpha=.95;ctx.drawImage(smokeTexture(0,i%4),-size*.6,-h*.55,size*1.2,h*1.1);
        ctx.drawImage(smokeTexture(0,(i+1)%4),-size*.35,-h*.3,size*.85,h*.9);ctx.restore();
      }
    }else if(variant===1){
      // Long calligraphic ribbons, following a moving wind rather than billowing.
      ctx.lineCap='round';ctx.lineJoin='round';
      for(let i=0;i<7;i++){
        const left=x+w*((i%3)*.26)-20,len=w*(.34+.07*(i%2));
        const base=y+h*(.18+(i%4)*.2),phase=time*.26+i*1.7;
        for(let pass=0;pass<3;pass++){
          ctx.beginPath();for(let k=0;k<=50;k++){const t=k/50,px=left+t*len,py=base+Math.sin(t*6+phase)*h*.12+Math.sin(t*11+phase*.6)*h*.025;if(k===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);}
          ctx.filter=pass===0?'blur(9px)':pass===1?'blur(3px)':'blur(1px)';
          ctx.lineWidth=pass===0?24:pass===1?10:2;
          const gradient=ctx.createLinearGradient(left,0,left+len,0);const color=pass===2?'160,145,190':pass===1?'35,27,52':'9,9,18';
          gradient.addColorStop(0,'rgba('+color+',0)');gradient.addColorStop(.25,'rgba('+color+','+(pass===2?.36:.6)+')');gradient.addColorStop(.7,'rgba('+color+','+(pass===2?.32:.5)+')');gradient.addColorStop(1,'rgba('+color+',0)');ctx.strokeStyle=gradient;ctx.stroke();
        }
      }
    }else{
      // Narrow cool plumes rising from below the cards, with airy drifting tops.
      const count=Math.max(4,Math.ceil(w/120));
      for(let i=0;i<count;i++){
        const phase=time*.2+i*1.9,px=x+(i+.5)*w/count;
        const height=h*(.8+.55*((i*7%9)/9));
        ctx.save();ctx.translate(px+Math.sin(phase)*12,y+h*.97);ctx.rotate(Math.sin(phase*.6)*.18);
        ctx.globalAlpha=.9;ctx.drawImage(smokeTexture(2,i%4),-65,-height,130,height);
        const g=ctx.createLinearGradient(0,0,0,-height);g.addColorStop(0,'rgba(150,190,184,0)');g.addColorStop(.22,'rgba(150,190,184,.28)');g.addColorStop(.7,'rgba(130,164,169,.16)');g.addColorStop(1,'rgba(130,164,169,0)');
        ctx.beginPath();ctx.moveTo(-18,0);ctx.bezierCurveTo(30,-height*.3,-28,-height*.64,Math.sin(phase)*25,-height);ctx.bezierCurveTo(-8,-height*.65,15,-height*.3,18,0);ctx.fillStyle=g;ctx.filter='blur(5px)';ctx.fill();ctx.restore();
      }
    }
    ctx.restore();
  };
  function paint(time){
    if(!active()){clear();return;}
    if(layer.width!==innerWidth||layer.height!==innerHeight){layer.width=innerWidth;layer.height=innerHeight;}
    const ctx=layer.getContext('2d');ctx.clearRect(0,0,layer.width,layer.height);
    if(state.snapshot){
      const box=document.getElementById('fate-match-v2-canvas')?.getBoundingClientRect();
      if(box?.width)ctx.drawImage(state.snapshot,box.x,box.y,box.width,box.height);
    }
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const regions=areas();for(const rect of regions)window.drawHowardMist(ctx,rect,state.variant,reduced?0:time/1000);
    if(regions.length){const r=regions[0];ctx.fillStyle='#d5ccdf';ctx.font='11px Georgia';ctx.textAlign='center';ctx.fillText('ACTIONS CONCEALED',r.x+r.w/2,r.y+20);}
    frame=requestAnimationFrame(paint);
  }
  window.activateHowardPerspectiveTestCard=function(card){
    if(!isTest(card)||!enabled()||card._howardPerspectiveResolved)return false;
    const viewer=typeof getPerspectivePlayerIndex==='function'?Number(getPerspectivePlayerIndex()):0;
    const source=1-viewer;
    if(card.id===prefix+'oktai'){
      G._bh21Concealment={statusType:'BH21_FATE_MORALE_CONCEALMENT',sourceIid:String(card.iid||''),sourceController:source,targetPlayer:viewer,activeFromTurn:Number(G.turn),remainingTargetTurns:4,backgroundFile:'oktai.png',statusIcon:'oktai_conceal',howardDevOnly:true};
      window.invalidateFateRenderCaches?.();
      window.renderGameImmediate?.();window.syncBh21ViewerPresentation?.();
      window.FateMatchRendererAdapter?.renderFromGameState({source:'howard-opponent-oktai'});
    }else{
      const variant=Number(card.id.slice(-1));if(!Number.isInteger(variant)||variant<0||variant>2)return false;
      clear();state={game:G,turn:Number(G.turn),source,variant};
      const live=document.getElementById('fate-match-v2-canvas');
      if(live?.width){const copy=document.createElement('canvas');copy.width=live.width;copy.height=live.height;copy.getContext('2d').drawImage(live,0,0);state.snapshot=copy;}
      layer=document.createElement('canvas');layer.id='howard-mist-overlay';layer.setAttribute('aria-label','Veil of Silence: opposing actions concealed');layer.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483000';document.body.append(layer);document.documentElement.classList.add('howard-mist-active');paint(performance.now());
    }
    card._howardPerspectiveResolved=true;return true;
  };
  // Skip visual entry points, while allowing the actual rules to keep resolving.
  for(const name of ['playEffectActivationCinematic','showConsolidationCinematic','showBlockedAnimation','playCardSound','playCardSetAudio']){
    const original=window[name];if(typeof original!=='function')continue;
    window[name]=function(...args){if(active())return name==='playEffectActivationCinematic'?Promise.resolve():undefined;return original.apply(this,args);};
  }
  const style=document.createElement('style');style.textContent='.howard-mist-active :is(#fate-match-v2-canvas,#fate-match-v2-effect-canvas,#fate-match-v2-particle-canvas,#fate-match-v2-top-effect-canvas,#fate-match-v2-hover-canvas,#fate-match-v2-fate-number-layer,.consolidation-cinematic-overlay,.cc-overlay-v2,.placement-anim-ghost,.placement-anim-card,.draw-fly-card,.fate-v2-motion-card,.effect-activation-overlay,.fate-activation-banner){visibility:hidden!important}';document.head.append(style);
  window.addEventListener('fate-screen-changed',e=>{if(e.detail?.to!=='s-game')clear();});
})();

