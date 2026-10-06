(function(){
  'use strict';
  // Preview candidates only; the selected design can use the same draw API in game.
  function draw(ctx,variant,t,w=700,h=430){
    const clamp=x=>Math.max(0,Math.min(1,x)),seg=(a,b)=>clamp((t-a)/(b-a)),ease=x=>1-(1-clamp(x))**3;
    const a=ease(seg(0,.13))*(1-ease(seg(.83,1))),q=ease(seg(.08,.65));
    const jade='#a8c9b4',gold='#efd29a',ice='#d2e8e0',TAU=Math.PI*2;
    ctx.clearRect(0,0,w,h);ctx.save();ctx.translate(w/2,h/2);ctx.scale(Math.min(w/460,h/300),Math.min(w/460,h/300));
    function line(points,color=jade,alpha=a,width=1.4){
      ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.shadowColor=color;ctx.shadowBlur=7;ctx.beginPath();
      points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.stroke();ctx.shadowBlur=0;ctx.globalAlpha=alpha*.7;ctx.lineWidth=.65;ctx.stroke();ctx.restore();
    }
    function curve(fn,u=1,color=jade,alpha=a,width=1.4){line(Array.from({length:61},(_,i)=>fn(i/60*u)),color,alpha,width);}
    function ring(x,y,rx,ry,color=jade,alpha=a){curve(v=>[x+Math.cos(v*TAU)*rx,y+Math.sin(v*TAU)*ry],1,color,alpha);}
    function star(x,y,r=4,alpha=a){line([[x-r,y],[x+r,y]],gold,alpha);line([[x,y-r],[x,y+r]],gold,alpha);}
    function arrow(x,y,angle,alpha=a){ctx.save();ctx.translate(x,y);ctx.rotate(angle);line([[-10,-6],[0,0],[-10,6]],gold,alpha,2);ctx.restore();}
    function sparks(x,y,p){for(let j=0;j<12;j++){const z=j*2.4,r=68*ease(p);star(x+Math.cos(z)*r,y+Math.sin(z)*r,2,a*Math.sin(p*Math.PI));}}
    if(['wave-sides','wave-rows','wave-cross'].includes(variant)){
      // Symmetric lanes terminate outside the central frame; icons never overlap.
      const box=(x,y,hw,hh,c=jade,alpha=a)=>line([[x-hw,y-hh],[x+hw,y-hh],[x+hw,y+hh],[x-hw,y+hh],[x-hw,y-hh]],c,alpha,1.7);
      box(0,0,29,43,gold);box(0,0,22,35,jade,a*.55);
      const boost=ease(seg(.58,.8));
      line([[-12,1],[0,-10],[12,1]],ice,a,2);
      line([[-12,16-5*boost],[0,5-5*boost],[12,16-5*boost]],gold,a*boost,2);
      let lanes;
      if(variant==='wave-sides')lanes=[[-1,-26,0],[-1,26,0],[1,-26,1],[1,26,1]].map(([side,y,wave])=>({sx:side*128,sy:y,ex:side*52,ey:y,wave}));
      else if(variant==='wave-rows')lanes=[[-16,-1,0],[16,-1,0],[-16,1,1],[16,1,1]].map(([x,side,wave])=>({sx:x,sy:side*111,ex:x,ey:side*66,wave}));
      else lanes=[{sx:-130,sy:0,ex:-52,ey:0,wave:0},{sx:130,sy:0,ex:52,ey:0,wave:0},{sx:0,sy:-112,ex:0,ey:-66,wave:1},{sx:0,sy:112,ex:0,ey:66,wave:1}];
      for(const lane of lanes){
        const begin=.08+lane.wave*.27,p=Math.max(0,Math.min(1,(t-begin)/.36)),move=ease(p);
        const alpha=a*(1-ease(Math.max(0,(p-.72)/.28)));
        const x=lane.sx+(lane.ex-lane.sx)*move,y=lane.sy+(lane.ey-lane.sy)*move;
        line([[lane.sx,lane.sy],[lane.ex,lane.ey]],jade,a*.18);
        box(x,y,10,14,jade,alpha);
        // Identical centered rank marks keep every reserve card upright.
        line([[x-5,y+2],[x,y-3],[x+5,y+2]],gold,alpha,1.4);
        const hit=Math.max(0,Math.min(1,(t-(begin+.26))/.2));
        const edgeX=lane.ex===0?0:Math.sign(lane.ex)*29,edgeY=lane.ey===0?0:Math.sign(lane.ey)*43;
        if(variant==='wave-sides')line([[Math.sign(lane.ex)*29,lane.ey-8],[Math.sign(lane.ex)*29,lane.ey+8]],gold,a*Math.sin(hit*Math.PI),2.5);
        else if(variant==='wave-rows')line([[lane.ex-7,Math.sign(lane.ey)*43],[lane.ex+7,Math.sign(lane.ey)*43]],gold,a*Math.sin(hit*Math.PI),2.5);
        else if(lane.ex)line([[edgeX,-9],[edgeX,9]],gold,a*Math.sin(hit*Math.PI),2.5);
        else line([[-9,edgeY],[9,edgeY]],gold,a*Math.sin(hit*Math.PI),2.5);
      }
      const finish=seg(.68,.96);box(0,0,33+9*finish,47+9*finish,gold,a*Math.sin(finish*Math.PI)*.4);
    }else if(variant==='landing'){
      // Landing craft crosses the waves, opens its ramp, then raises a standard.
      for(let j=0;j<3;j++)curve(v=>[-138+276*v,57+j*15+Math.sin(v*TAU*2-t*7+j)*4],1,j%2?gold:jade,a*.6);
      const x=-89+87*ease(seg(.05,.55)),ramp=ease(seg(.45,.72));
      ctx.save();ctx.translate(x,0);line([[-69,20],[49,20],[37,49],[-49,49],[-69,20]],jade,a,2.2);
      line([[-39,19],[-39,-13],[3,-13],[3,19]],gold,a,1.8);line([[-31,-6],[-9,-6]],ice,a);line([[12,18],[12,-25],[33,-25],[33,18]],jade,a);
      line([[49,20],[51+33*ramp,20+28*ramp]],gold,a,2.4);ctx.restore();
      const rise=ease(seg(.48,.79));line([[83,58],[83,58-137*rise]],gold,a,2);
      if(rise>0)curve(v=>[83+48*v,58-137*rise+Math.sin(v*7+t*5)*4],1,jade,a,2);
      line([[83,58-137*rise],[130,84-137*rise],[83,87-137*rise]],jade,a*rise);
      for(let j=0;j<3;j++){const p=seg(.57+j*.05,.85+j*.025);arrow(12+p*67,37-j*9,-.3,a*Math.sin(p*Math.PI));}
      sparks(84,-42,seg(.7,.98));
    }else if(variant==='fleet'){
      for(let j=0;j<4;j++)curve(v=>[-145+290*v,35+j*19+Math.sin(v*TAU*2-t*8+j)*4],1,j%2?gold:jade,a*.5);
      for(let j=0;j<3;j++){
        const advance=ease(seg(.06+j*.07,.58+j*.05)),x=-92+advance*109,y=-47+j*42;
        ctx.save();ctx.translate(x,y);ctx.scale(.65,.65);
        line([[-61,0],[48,0],[34,26],[-43,26],[-61,0]],jade,a,2);
        line([[-30,0],[-30,-29],[6,-29],[6,0]],gold,a);line([[-21,-20],[-4,-20]],ice,a);
        const ramp=ease(seg(.52+j*.04,.78+j*.03));line([[48,0],[48+38*ramp,25*ramp]],gold,a,2);
        ctx.restore();arrow(x+55,y+4,0,a*seg(.55,.75));
      }
      curve(v=>[112+Math.sin(v*8)*9,-100+205*v],1,gold,a*.8);
      const rise=ease(seg(.58,.8));line([[115,6],[115,6-89*rise],[151,-62*rise],[115,-49*rise]],gold,a*rise,2);
      sparks(113,-50,seg(.7,.98));
    }else if(variant==='beachhead'){
      // Head-on landing: the bow approaches, ramp unfolds toward the viewer.
      const approach=ease(seg(.04,.55)),ramp=ease(seg(.42,.73));
      ctx.save();ctx.translate(0,-30+approach*24);ctx.scale(.5+.5*approach,.5+.5*approach);
      for(const side of [-1,1])for(let j=0;j<3;j++)curve(v=>[side*(52+v*(55+j*13)),15+v*35+Math.sin(v*5-t*8)*3],1,jade,a*.5);
      line([[-55,-37],[55,-37],[46,38],[-46,38],[-55,-37]],jade,a,2.2);
      line([[-39,-37],[-33,-69],[33,-69],[39,-37]],gold,a,2);
      for(let j=0;j<3;j++)line([[-24+j*20,-58],[-12+j*20,-58]],ice,a,2);
      line([[-37,14],[37,14],[47,24+77*ramp],[-47,24+77*ramp],[-37,14]],gold,a,2);
      for(let j=0;j<5;j++){const yy=23+j*14*ramp;line([[-36-j*2,yy],[36+j*2,yy]],jade,a*ramp*.65);}
      for(let j=0;j<3;j++){const p=seg(.53+j*.06,.83+j*.03);arrow((j-1)*20,22+64*p,Math.PI/2,a*Math.sin(p*Math.PI));}
      ctx.restore();
      const raise=ease(seg(.59,.82));line([[90,63],[90,63-143*raise]],gold,a,2);
      curve(v=>[90+48*v,63-143*raise+Math.sin(v*7+t*6)*5],1,jade,a*raise,2);
      line([[138,63-143*raise],[130,91-143*raise],[90,91-143*raise]],jade,a*raise);
      sparks(90,-55,seg(.72,.99));
    }else if(variant==='rally'){
      // A command standard rises and sends a pulse through three allied ranks.
      const rise=ease(seg(.06,.43));
      line([[0,8],[0,8-105*rise]],gold,a,2);
      curve(v=>[55*v,8-105*rise+Math.sin(v*7-t*7)*5],1,jade,a*rise,2);
      line([[55,8-105*rise],[47,34-105*rise],[0,34-105*rise]],jade,a*rise);
      for(let j=0;j<3;j++){
        const x=(j-1)*79,p=seg(.3+j*.07,.71+j*.07),boost=ease(seg(.48+j*.07,.75+j*.06));
        curve(v=>[x*v,5+54*v],ease(p),gold,a*.55);
        const y=61-boost*9;
        line([[x-22,y-29],[x+22,y-29],[x+22,y+30],[x-22,y+30],[x-22,y-29]],jade,a,1.8);
        line([[x-12,y+2],[x,y-9],[x+12,y+2]],ice,a,1.8);
        line([[x-12,y+17-boost*8],[x,y+6-boost*8],[x+12,y+17-boost*8]],gold,a*boost,2);
        ring(x,y,27+18*p,34+15*p,gold,a*Math.sin(p*Math.PI)*.5);
      }
      sparks(0,-47,seg(.67,.98));
    }else if(variant==='column'){
      // Reserve cards march in behind an allied card, which gains a bright rank.
      const advance=ease(seg(.08,.64));
      for(let j=0;j<3;j++){
        const x=-126+j*32+advance*(78-j*13),y=37-j*18-advance*15;
        line([[x-17,y-25],[x+17,y-25],[x+17,y+25],[x-17,y+25],[x-17,y-25]],jade,a*(.45+j*.17),1.6);
        arrow(x,y,0,a*.75);
      }
      curve(v=>[-133+218*v,79+Math.sin(v*Math.PI)*9],advance,gold,a*.6);
      const lift=ease(seg(.48,.8)),x=69,y=-8-lift*9;
      line([[x-31,y-45],[x+31,y-45],[x+31,y+45],[x-31,y+45],[x-31,y-45]],gold,a,2);
      line([[x-23,y-36],[x+23,y-36],[x+23,y+36],[x-23,y+36],[x-23,y-36]],jade,a*.7);
      line([[x-16,y+2],[x,y-13],[x+16,y+2]],ice,a,2);
      line([[x-16,y+20-10*lift],[x,y+5-10*lift],[x+16,y+20-10*lift]],gold,a*lift,2.3);
      const pulse=seg(.61,.97);ring(x,y,36+47*pulse,50+39*pulse,jade,a*Math.sin(pulse*Math.PI)*.6);
      sparks(x,y,seg(.65,.98));
    }else if(variant==='command'){
      // General's cap and rank emerge inside a closing laurel wreath.
      const rise=ease(seg(.06,.51));ctx.save();ctx.translate(0,18*(1-rise));ctx.scale(.7+.3*rise,.7+.3*rise);
      curve(v=>[-67+134*v,-21-43*Math.sin(v*Math.PI)],1,jade,a,2.3);
      line([[-67,-21],[-50,0],[50,0],[67,-21],[-67,-21]],gold,a,1.8);
      curve(v=>[-50+100*v,2+25*Math.sin(v*Math.PI)],1,ice,a,2.4);
      ring(0,-27,12,12,gold,a);star(0,-27,7);
      for(let j=0;j<3;j++){const p=ease(seg(.26+j*.07,.54+j*.07));line([[-26,39+j*15],[0,53+j*15],[26,39+j*15]],j===1?gold:jade,a*p,2);}
      ctx.restore();
      for(const side of [-1,1]){
        curve(v=>[side*(69+24*Math.sin(v*Math.PI)),83-151*v],q,gold,a);
        for(let j=0;j<7;j++){const v=(j+.3)/7;if(v>q)continue;const x=side*(69+24*Math.sin(v*Math.PI)),y=83-151*v;
          line([[x,y],[x+side*17,y-16],[x+side*20,y-3],[x,y]],jade,a,1.6);}
      }
      sparks(0,-28,seg(.65,.97));
    }else{
      // Three reinforcements feed an extra rank into the central allied card.
      const merge=ease(seg(.15,.68));
      line([[-31,-49],[31,-49],[31,49],[-31,49],[-31,-49]],gold,a,2);
      line([[-23,-40],[23,-40],[23,40],[-23,40],[-23,-40]],jade,a*.65);
      const spiral=variant==='spiral',waves=variant==='waves',count=waves?6:3;
      for(let j=0;j<count;j++){
        const phase=waves?ease(seg(.08+(j>=3?.23:0),.55+(j>=3?.23:0))):merge;
        const base=-Math.PI/2+j*TAU/(waves?3:3)+(waves&&j>=3?Math.PI/3:0);
        const angle=base+(spiral?(1-phase)*1.35:0),dx=Math.cos(angle),dy=Math.sin(angle),radius=124-78*phase,x=dx*radius,y=dy*radius;
        const alpha=a*(1-ease(Math.max(0,(phase-.8)/.2))*.8);
        ctx.save();ctx.translate(x,y);ctx.rotate(spiral?(1-phase)*.65:0);
        line([[-12,-16],[12,-16],[12,16],[-12,16],[-12,-16]],jade,alpha,1.8);ctx.restore();
        curve(v=>{const z=base+(spiral?(1-v)*1.35:0),r=124-78*v;return[Math.cos(z)*r,Math.sin(z)*r];},phase,jade,a*.45);
        arrow(dx*(radius-17),dy*(radius-17),angle+Math.PI,alpha);
      }
      const rank=ease(seg(.47,.78));line([[-14,6],[0,-7],[14,6]],ice,a,2);
      line([[-14,22-14*rank],[0,9-14*rank],[14,22-14*rank]],gold,a*rank,2.2);
      const pulse=seg(.61,.98);ring(0,0,44+64*pulse,58+55*pulse,gold,a*Math.sin(pulse*Math.PI)*.65);
      sparks(0,0,seg(.64,.98));
    }
    ctx.restore();
  }
  window.HseiLingAnimationSamples={draw};
})();
