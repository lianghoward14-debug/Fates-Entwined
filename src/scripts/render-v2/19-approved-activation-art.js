(function(){'use strict';
// Approved two-second designs, copied exactly from the reviewed samples.
const names=[["01","Felicyta Janowicz","The eagle claims the crown","#fff0ef"],["bh07","Agent-K","The core goes live","#b5c8f2"],["bh11","Felicyta Janowicz (University)","The sealed accord","#f3e7e4"],["45","Chingachlook","Sunset over the mountains","#c6baaa"],["22","Isaac Perez","Excited nucleus","#77b8ff"],["02","Anicka Konvicka","The starlit orbit","#a9d8f4"],["86","Boleslaw Kopewicz","Cascading fireworks","#eab2ec"],["bh04","Anicka Konvicka (Selva Island)","Eye of the maelstrom","#8fd9ed"],["bh20","Makenna (Bird Cult)","Three birds in flight","#acd9ed"],["bh19","Abed","Double charge","#b9dfa1"],["bh01","Anicka Konvicka (Voyager)","A voyage at sunrise","#a4dede"],["14","Alondra Hopkins","Clear the perimeter","#eea697"],["bh09","Alondra Hopkins (Mercenary)","Spear orbit","#eea697"],["66","Mark Menz","The seal of allegiance","#beb5ef"],["87","Květka Svoboda (Ukulele)","The written melody","#c7dfa1"],["67","Mr. Secules","You just said nothing","#efa899"],["bh21","Oktai","The high desert sun","#e9b77a"],["38","Jake","The perfect stack","#edbd82"],["bh22","Jaime","The healing crescent","#a1d7ee"],["56","Lydia","Sever the spell","#ef6571"],["bh05","Taylor","The unfolding double","#b6a9ec"],["bh13","Hugh Roberts","The gilded portfolio","#b7dfa7"],["61","Maria Song","Precise Shot","#ff929b"],["13","Johnathan Kirby","Signed Christmas Charter","#ecd09a"],["43","Mark Kemper","An impossible elephant","#f1c68d"],["51","Rivera","The binding promise","#7ed6c0"],["81","Wojciech","Fold, crimp, scatter","#f3cc8b"],["83","Sebastyen Janowicz","Pillars of Visegrad","#efa7ae"],["90","Wojciech (Fisherman)","The constellation net","#80d9d4"],["21","Henry Dong","Break the chain","#ee847c"],["29","Dylan Kirby","Wings of the free world","#89bfff"],["30","Santiago","The piercing tide","#fa8e83"],["84","Květka Svoboda (Youth)","Winter butterfly garden","#c6e9a0"],["99","Rozsi and Zsofia (Youth)","The accusation scales","#d4acfa"],["07","Maja Kaminska","Tank advance","#b6d9de"],["82","Felicyta Janowicz (Youth)","Winter in glass","#a6dfff"],["bh06","Achille Laurent","Three adaptive tokens","#a9c9ef"],["bh16","Li-Hua (Battle-Ready)","Blade-driven tearing sweeps","#82cfff"],["bh10","Francisek","A passenger from the catalog","#b4dddf"],["bh14","Chloe Kirk","One declaration, many cards","#a3c8f4"],["10","Post-Modernist Dylan","Six fragments collapse","#c99ae9"],["19","Květka Svoboda","The bridge over the Vltava","#a0d5bc"],["bh12","Louis LeJeune","The seven-petal coronation","#b5d790"],["35","Alexander the Magnificient","The shield and growing laurels","#e2af79"],["88","Rozsi Szocs (Youth)","A Carpathian winter tale","#a9c8e9"],["11","Anne Stone","Three treaties fall into place","#99d5d0"],["46","Phil","The crowned empire rises","#c0a5e4"],["41","Jimmy","The fractured reflection","#d393a7"],["89","Zsofia Szocs (Youth)","The frost-set tiara","#d1b0e4"],["55","Bobby Jones","The four-arm spiral galaxy","#a5bde9"],["85","Felicyta Janowicz (Specters)","Three ghosts rise","#b0d6dc"],["36","Marie L’amboure","Three shields lock together","#afc7be"],["bh02","Joie","Instagram comes into focus","#dc9bbb"],["bh08","Maja Kaminska (University)","The smirk breaks into laughter","#e2b68d"],["57","Jeremiah Jones","The alpine clockwork","#b5c0e3"],["12","Makenna","The winged military insignia","#b3c59d"],["23","Cathy","The geometric fan unfolds","#d9aac9"],["15","Zsofia Szocs","The embroidered rosette blooms","#daa6ba"],["34","Rozsi Szocs","The Hungarian dancing silhouettes","#d88b94"],["bh17","Jakob Eltzholtz","The battering ram strikes","#bfaddf"],["77","Duncan Heyward","Canyon river","#cbb6a3"],["100","Felicyta and Květka (Youth)","Snowfall in the mountain pines","#add7e6"],["bh18","Jimmy (Post-Cynthia Hug)","Rage","#f0a083"]];
const cardPalettes={"13":["#edb052","#ffdf9b"],"14":["#d68c9d","#ead1c0"],"17":["#b9d675","#f3e8b8"],"21":["#db6871","#ead4bb"],"22":["#e4c659","#a7d9f1"],"29":["#8cacd2","#ecbfc3"],"30":["#cedee4","#e5a48f"],"38":["#ed9e60","#eccc8e"],"39":["#dbc477","#92cbbd"],"40":["#bfc575","#e6a367"],"43":["#81b5df","#d2e6f5"],"45":["#d7b196","#edbe7d"],"48":["#ae99dc","#a2d2e6"],"51":["#88d19d","#d8edac"],"56":["#719ce8","#eed075"],"66":["#cbd170","#eece9c"],"67":["#b89de2","#d7e4fc"],"81":["#b5cd8a","#efd4a1"],"82":["#8bb8df","#e1efff"],"83":["#a8c878","#dfddb0"],"87":["#cf9dcd","#e8c58e"],"90":["#78acd1","#bae0db"],"99":["#e1a581","#f0d29e"],"01":["#fff1ee","#e25b65"],"bh11":["#f2ede8","#c74858"],"bh07":["#b4c4f0","#80d2db"],"02":["#77d6e3","#d9f1f2"],"03":["#e1ac56","#e7d1b3"],"04":["#b594ed","#e5c9ff"],"07":["#799feb","#d3e3f6"],"08":["#edce61","#a9d3f0"],"bh04":["#8faec9","#dcb184"],"bh05":["#d296ad","#e0bea5"],"bh06":["#8faeee","#dca6a2"],"bh09":["#b8d48e","#e6d9a6"],"bh10":["#8abea1","#ccd4b1"],"bh13":["#d2ad7a","#eed6a3"],"bh14":["#8caaeb","#bddff1"],"bh16":["#82cfff","#b2bff5"],"bh20":["#c2dbea","#e8ce9e"],"bh22":["#b8a1ec","#92cde9"]};
const clamp=x=>Math.max(0,Math.min(1,x)),seg=(t,a,b)=>clamp((t-a)/(b-a)),ease=x=>1-(1-clamp(x))**3,PI=Math.PI,TAU=PI*2;
  function drawHseiLing(ctx,t,w=700,h=430){
    const variant='wave-cross';
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
    }
    ctx.restore();
  }

function draw(ctx,id,t,w=700,h=430){
if(String(id)==='bh15')return drawHseiLing(ctx,t,w,h);
ctx.clearRect(0,0,w,h);ctx.save();ctx.translate(w/2,h/2);ctx.scale(Math.min(w/460,h/300),Math.min(w/460,h/300));
const color=cardPalettes[id]?.[0]||names.find(n=>n[0]===id)[3],gold=cardPalettes[id]?.[1]||'#efd29a',a=ease(seg(t,0,.13))*(1-ease(seg(t,.83,1))),q=ease(seg(t,.1,.65));
function line(pts,c=color,alpha=a,width=1.4,close=false){ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=c;ctx.lineWidth=width;ctx.shadowColor=c;ctx.shadowBlur=7;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));if(close)ctx.closePath();ctx.stroke();ctx.shadowBlur=0;ctx.globalAlpha=alpha*.7;ctx.lineWidth=.65;ctx.stroke();ctx.restore();}
function curve(fn,u=1,c=color,alpha=a,width=1.4){line(Array.from({length:61},(_,i)=>fn(i/60*u)),c,alpha,width);}
function oval(x,y,rx,ry,c=color,alpha=a,rot=0){curve(v=>{let z=v*TAU,xx=Math.cos(z)*rx,yy=Math.sin(z)*ry;return[x+xx*Math.cos(rot)-yy*Math.sin(rot),y+xx*Math.sin(rot)+yy*Math.cos(rot)]},1,c,alpha);}
function box(x,y,w,h,c=color,alpha=a){line([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],c,alpha,1.4,true);}
function star(x,y,r=4,c=gold,alpha=a){line([[x-r,y],[x+r,y]],c,alpha);line([[x,y-r],[x,y+r]],c,alpha);}
function at(x,y,rot,fn){ctx.save();ctx.translate(x,y);ctx.rotate(rot);fn();ctx.restore();}
function card(x,y,rot=0,alpha=a){at(x,y,rot,()=>{box(-12,-18,24,36,gold,alpha);line([[-7,0],[0,-9],[7,0],[0,9]],color,alpha,1,true);});}
function cross(x,y,r,alpha=a){const b=r*.32;line([[x-b,y-r],[x+b,y-r],[x+b,y-b],[x+r,y-b],[x+r,y+b],[x+b,y+b],[x+b,y+r],[x-b,y+r],[x-b,y+b],[x-r,y+b],[x-r,y-b],[x-b,y-b],[x-b,y-r]],'#a8f0cc',alpha,2.4);}
function note(x,y,rot,alpha=a){at(x,y,rot,()=>{oval(-5,10,6,4,color,alpha,-.3);line([[1,10],[1,-16],[12,-9],[12,-2]],gold,alpha,2);});}
function burger(spread=0,bite=0){
 curve(v=>[-62+124*v,-10-32*spread-Math.sin(v*PI)*39],1,gold,a,2.6);line([[-62,-10-32*spread],[62,-10-32*spread]],gold,a,2.2);
 for(let j=0;j<7;j++){const xx=(j-3)*13,yy=-27-32*spread-(1-Math.abs(j-3)/4)*10;line([[xx-2,yy-2],[xx+2,yy+1]],'#fff0bc',a,1.5);}
 curve(v=>[-61+122*v,3-9*spread+Math.sin(v*PI*9)*4],1,'#b5d58c',a,2.4);
 line([[-57,13],[57,13],[42,28],[11,18],[-15,27],[-57,13]],'#ffd17e',a,2.2);
 oval(0,33+10*spread,59,9,'#e8a089',a);curve(v=>[-60+120*v,47+25*spread+Math.sin(v*PI)*16],1,gold,a,2.8);line([[-60,47+25*spread],[60,47+25*spread]],gold,a,2);
 if(bite){ctx.save();ctx.globalCompositeOperation='destination-out';ctx.beginPath();ctx.arc(61,-17,26*bite,0,TAU);ctx.fill();ctx.restore();}
}
function spear(x,y,rot,alpha=a){at(x,y,rot,()=>{line([[0,48],[0,-26]],gold,alpha,3);line([[0,-51],[-9,-23],[0,-29],[9,-23],[0,-51]],color,alpha,2.3);line([[-4,31],[4,31],[-4,37],[4,37]],color,alpha,1.4);});}
function bird(x,y,s,flap=1){at(x,y,0,()=>{curve(v=>[-s+s*v,-Math.sin(v*PI)*s*.55*flap],1,color,a,2.2);curve(v=>[s*v,-Math.sin(v*PI)*s*.55*flap],1,color,a,2.2);line([[-s*.16,0],[0,s*.22],[s*.16,0]],gold,a,1.8);});}
function eagle(x,y,scale,phase){at(x,y,Math.sin(t*TAU*2+phase)*.055,()=>{ctx.scale(scale,scale);const flap=.25+.75*(.5+.5*Math.cos(t*TAU*3+phase));for(const side of [-1,1]){line([[0,-29],[side*23,-12],[side*119,-66*flap],[side*88,-8],[side*31,25],[0,41]],color,a,2.4);for(let j=0;j<4;j++)line([[side*(35+j*17),3-j*9],[side*(51+j*17),-28*flap-j*5]],gold,a,1.5);}line([[0,-29],[12,-40],[28,-35],[13,-27],[0,-29]],gold,a,2);for(const side of [-1,1])line([[side*8,34],[side*24,70],[0,52]],gold,a,2);});}
function burst(cx,cy,r,p,c=color){for(let j=0;j<12;j++){const z=j*TAU/12;line([[cx+Math.cos(z)*r*p,cy+Math.sin(z)*r*p],[cx+Math.cos(z)*(r*p+9),cy+Math.sin(z)*(r*p+9)]],c,a*Math.sin(p*PI),2);}}
function moteBurst(x,y,r,u){for(let j=0;j<14;j++){const z=j*2.39996,rr=r*ease(u);star(x+Math.cos(z)*rr,y+Math.sin(z)*rr*.7,2,j%2?gold:color,a*Math.sin(u*PI));}}
function music(x,y,rot=0,alpha=a){at(x,y,rot,()=>{oval(-5,9,6,4,color,alpha,-.3);line([[1,9],[1,-18],[12,-13],[12,-6]],gold,alpha,1.7);});}
function approvedSparks(x,y,r,p){for(let j=0;j<12;j++){const z=j*2.4;star(x+Math.cos(z)*r*p,y+Math.sin(z)*r*p,2,j%2?color:gold,a*Math.sin(p*PI));}}
function snowfall(strength=1){for(let j=0;j<28;j++){const x=-130+(j*47%260)+Math.sin(t*6+j)*9,y=-113+((j*31+t*(68+j%3*15))%218);if(j%5===0){for(let k=0;k<3;k++){const z=k*PI/3;line([[x-Math.cos(z)*3,y-Math.sin(z)*3],[x+Math.cos(z)*3,y+Math.sin(z)*3]],'#d9f2ff',a*.65*strength);}}else oval(x,y,1,1,'#d9f2ff',a*.55*strength);}}
function laurel(side,p){curve(v=>[side*(52+24*Math.sin(v*PI)),68-132*v],p,gold,a);for(let j=0;j<6;j++){const v=(j+.3)/6;if(v>p)continue;at(side*(52+24*Math.sin(v*PI)),68-132*v,side*(-.8+v*.6),()=>{oval(side*6,-4,5,12,color,a);});}}
function winterFlakes(level=.7){for(let j=0;j<25;j++){const x=-126+(j*47%252)+Math.sin(t*5+j)*7,y=-115+(j*31+t*89)%223;if(j%4===0)star(x,y,2.3,'#d9f3ff',a*level);else oval(x,y,1,1,'#d9f3ff',a*level*.7);}}
if(id==='77'){const previewId='77b';
 const variant=previewId==='77'?0:previewId==='77b'?1:2,reveal=ease(seg(t,.04,.65)),sunY=-69+19*reveal,sunX=variant===1?-8:5;
 oval(sunX,sunY,variant===2?32:25,variant===2?32:25,'#f2c77f',a*.95);
 for(let j=0;j<7;j++){const z=.22+j*PI/8,rr=33+4*Math.sin(t*8+j);line([[sunX+Math.cos(z)*rr,sunY+Math.sin(z)*rr],[sunX+Math.cos(z)*(rr+25+12*reveal),sunY+Math.sin(z)*(rr+25+12*reveal)]],'#e8c78e',a*.24);}
 for(const side of [-1,1])at(side*14*(1-reveal),0,0,()=>{
 const pts=variant===0?[[137,105],[119,49],[105,8],[108,-71],[76,-88],[61,-68],[62,-14],[43,10],[37,62],[23,103]]:variant===1?[[140,105],[131,47],[106,35],[99,-43],[81,-60],[63,-48],[60,-13],[47,18],[42,56],[22,101]]:[[143,106],[123,47],[118,-30],[101,-77],[78,-92],[58,-73],[51,-30],[44,1],[33,56],[19,102]];
 line(pts.map(([x,y])=>[x*side,y]),side<0?color:'#dfb697',a,2.2);
 for(let j=0;j<4;j++)line([[side*(107+j*4),-39+j*33],[side*(85+j*2),-44+j*33],[side*(61-j*7),-31+j*34]],j%2?'#d9bb9c':color,a*.55);
 
 });
 if(variant===0)for(let j=0;j<2;j++)curve(v=>[-18+36*v,104-9*Math.sin(v*PI)+j*5],1,'#dbba8c',a*.6);
 if(variant===1)for(let j=0;j<3;j++)curve(v=>[Math.sin(v*PI*1.8+t*.6)*14+(j-1)*(2+7*v),27+81*v],1,'#8dd5db',a*.8);
 if(variant===2){for(let j=0;j<10;j++){const p=(t*.7+j/10)%1;star(-16+32*p,24+80*((j*.31+t*.32)%1),1.2,j%2?'#efcc91':'#cdb7e7',a*.65);}line([[-17,102],[0,93],[18,103]],'#e1bf8c',a*.6);}
 }
else if(id==='100'){const previewId='100';function snow(){for(let j=0;j<25;j++){const x=-127+(j*47%254)+5*Math.sin(t*5+j),y=-113+(j*31+t*78)%221;star(x,y,j%4?1:2.6,'#e0f4ff',a*.7);}}

 const reveal=ease(seg(t,.04,.65));
 at(0,10*(1-reveal),0,()=>{
 line([[-138,49],[-77,-69],[-31,-10]],'#b9c9ec',a,2);
 line([[-66,48],[18,-91],[93,26]],'#b9c9ec',a,2);
 line([[93,26],[133,-29],[153,42]],'#b9c9ec',a,2);
 line([[-101,-22],[-77,-69],[-49,-33],[-63,-40],[-76,-28],[-87,-38],[-101,-22]],'#edf5ff',a,1.8);
 line([[-8,-48],[18,-91],[47,-45],[27,-53],[15,-41],[5,-51],[-8,-48]],'#e9f6ff',a,1.8);
 line([[119,-10],[133,-29],[143,-9],[136,-13],[130,-5],[126,-13],[119,-10]],'#eaf5ff',a,1.8);
 });
 for(let j=0;j<5;j++){const x=[-111,-70,83,119,48][j],y=[78,90,84,96,101][j],s=[.73,.47,.7,.48,.35][j];at(x,y,Math.sin(t*5+j)*.025,()=>{ctx.scale(s,s);line([[0,9],[0,-91]],'#d7bd9c',a,2);for(let k=0;k<4;k++){const yy=-83+k*23,w=14+k*11;line([[-w,yy+25],[0,yy],[w,yy+25]],'#9bd5c6',a,2);line([[-w+3,yy+20],[0,yy+1],[w-3,yy+20]],'#e6f4fc',a*.9,1.6);}});}
 for(let j=0;j<2;j++)curve(u=>[-146+292*u,101+j*8+Math.sin(u*PI*3+j)*5],1,'#d0e7f3',a*.55);
 snow();
}
else if(id==='bh18'){const previewId='bh18b';
 const v=previewId==='bh18'?0:previewId==='bh18b'?1:2,p=ease(seg(t,.07,.64)),heat=['#ed827f','#f5bb76','#d39abc'];
 if(v===0){at(Math.sin(t*88)*2*p,8-17*p,0,()=>{line([[-48,34],[-55,0],[-53,-40],[-35,-49],[-22,-42],[-5,-49],[11,-42],[28,-46],[44,-34],[48,8],[32,43],[22,62],[-30,62],[-48,34]],color,a,2.4);for(let j=0;j<3;j++)line([[-29+j*23,-39],[-27+j*23,-12]],'#efbb8b',a,2);line([[-52,0],[-25,-5],[-4,14],[-19,33],[-41,24]],'#f1c591',a,2);});}
 if(v===1){at(Math.sin(t*75)*2,0,0,()=>{oval(0,9,68,68,color,a,2.2);line([[-56,-20],[-22,-7],[-9,-12]],color,a,3);line([[56,-20],[22,-7],[9,-12]],color,a,3);line([[-46,-4],[-21,4],[-14,-3]],'#f6c685',a,2);line([[46,-4],[21,4],[14,-3]],'#f6c685',a,2);line([[-32,43],[-17,30],[17,30],[32,43],[-32,43]],'#e9aa99',a,2);for(let j=0;j<4;j++)line([[-19+j*13,31],[-19+j*13,41]],color,a);});}
 if(v===2){for(let j=0;j<5;j++){const q=ease(seg(t,.1+j*.06,.58+j*.05)),x=(j-2)*29;curve(u=>[x+14*Math.sin(u*6+t*7+j),69-146*u*q],1,heat[j%3],a,2.5);}line([[-56,75],[-25,86],[4,76],[37,89],[62,73]],'#f5bd7c',a,2);}
 for(let j=0;j<11;j++){const z=j*TAU/11,q=seg(t,.28+j%3*.1,.83+j%3*.05),r=72+36*q;line([[Math.cos(z)*r,Math.sin(z)*r*.8],[Math.cos(z)*(r+14+12*p),Math.sin(z)*(r+14+12*p)*.8]],heat[j%3],a*Math.sin(q*PI),2);}
}
else if(id==='bh16'){const previewId='bh16b';
 const ice='#bdeeff',blue='#75bfdc',violet='#b6a6ed';
 function blade(x,y,z,s,alpha,c){at(x,y,z,()=>{ctx.scale(s,s);line([[0,-74],[-8,-48],[-5,29],[0,38],[5,29],[8,-48],[0,-74]],c,alpha,2);line([[0,-62],[0,29]],ice,alpha*.55);line([[-20,31],[-12,26],[12,26],[20,31]],violet,alpha,2.5);line([[0,34],[0,58]],c,alpha,4);oval(0,61,4,4,ice,alpha);});}
 function slash(z,p,c,width=4){at(0,0,z,()=>{const vis=Math.sin(p*PI);curve(v=>[-145+290*v,-23+46*v-34*Math.sin(v*PI)],ease(seg(p,0,.55)),c,a*vis,width);curve(v=>[-145+290*v,-17+46*v-34*Math.sin(v*PI)],ease(seg(p,.04,.6)),ice,a*vis*.4,1);});}

 if(previewId==='bh16'){
 // Three descending swords make a staggered fan of cuts, then a broad finishing sweep.
 for(let j=0;j<3;j++){const q=seg(t,.03+j*.16,.47+j*.16),x=(j-1)*62;blade(x,-98+173*ease(q),(j-1)*-.23,.82,a*Math.sin(q*PI),[ice,violet,blue][j]);curve(v=>[x+(j-1)*18*v,-112+204*v],ease(seg(q,.12,.7)),[blue,violet,ice][j],a*Math.sin(q*PI),3.2);}
 const q=seg(t,.57,.97);at(0,40,0,()=>{curve(v=>[-140+280*v,-15+41*Math.sin(v*PI)],ease(seg(q,0,.6)),ice,a*Math.sin(q*PI),4);});
 }else if(previewId==='bh16b'){
 const colors=[blue,violet,ice];
 // Each ribbon is the swept area between two points on the moving blade.
 function pose(j,q){const side=j===1?-1:1;return {x:side*(-83+166*q),y:(j-1)*22+30*Math.sin(q*PI),z:side*(-1.35+3.5*q)+(j===2?1.1:0)};}
 function point(p,d){return [p.x-Math.sin(p.z)*d,p.y+Math.cos(p.z)*d];}
 for(let j=0;j<3;j++){
 const q=seg(t,.07+j*.19,.48+j*.2),opacity=Math.sin(q*PI);if(opacity<=0)continue;
 const now=pose(j,q),tail=Math.max(0,q-.28),outer=[],inner=[];
 for(let k=0;k<=20;k++){const u=tail+(q-tail)*k/20,poseAt=pose(j,u);outer.push(point(poseAt,-69));inner.push(point(poseAt,-25-(k%3)*3));}
 ctx.save();ctx.beginPath();outer.forEach(([x,y],k)=>k?ctx.lineTo(x,y):ctx.moveTo(x,y));inner.reverse().forEach(([x,y])=>ctx.lineTo(x,y));ctx.closePath();ctx.fillStyle=colors[j];ctx.globalAlpha=a*opacity*.4;ctx.shadowColor=colors[j];ctx.shadowBlur=15;ctx.fill();ctx.restore();
 line(outer,ice,a*opacity*.7,1.5);
 blade(now.x,now.y,now.z,1,a*opacity,colors[j]);
 // Sparks leave the cutting edge and retain the direction of the strike.
 for(let k=0;k<8;k++){const lag=(k+1)*.018,u=Math.max(0,q-lag),past=pose(j,u),edge=point(past,-63),age=q-u,dir=past.z+(j===1?-1:1)*PI/2;const x=edge[0]+Math.cos(dir)*age*240,y=edge[1]+Math.sin(dir)*age*240;line([[x,y],[x+Math.cos(dir)*5,y+Math.sin(dir)*5]],k%2?ice:colors[j],a*opacity*.65,1.2);}
 }
 }else{
 // Three blades rise in a crown, pivot together, and sweep down like a breaking wave.
 const rise=ease(seg(t,.03,.29)),sweep=ease(seg(t,.3,.78));
 for(let j=0;j<3;j++){const z=(j-1)*.46+sweep*2.2,x=(j-1)*57+Math.sin(sweep*PI)*34,y=67-85*rise+sweep*39;blade(x,y,z,.83,a*(1-ease(seg(t,.8,.99))),[violet,ice,blue][j]);const q=seg(t,.3+j*.06,.9+j*.02);curve(v=>{const zz=-2.5+3.5*q*v;return[(j-1)*35+Math.cos(zz)*88,Math.sin(zz)*79+12]},1,[violet,ice,blue][j],a*Math.sin(q*PI),3);}
 }
}else if(id==='bh17'){function burst(x,y,r,p){for(let j=0;j<14;j++){const z=j*2.4;star(x+Math.cos(z)*r*p,y+Math.sin(z)*r*p,2,j%2?gold:color,a*Math.sin(p*PI));}}
 const ram=ease(seg(t,.08,.67));at(-88+120*ram,1,0,()=>{line([[-62,-16],[32,-16],[54,0],[32,16],[-62,16],[-62,-16]],color,a,2);for(let j=0;j<4;j++)line([[-47+j*20,-16],[-47+j*20,16]],gold,a*.55);line([[-45,18],[-45,51],[28,51],[28,18]],gold,a,2);oval(-39,58,10,10,color,a);oval(24,58,10,10,color,a);});const hit=ease(seg(t,.54,.78));for(let j=0;j<4;j++)at(102+hit*j*5,(j-1.5)*38,hit*(j%2?.2:-.2),()=>box(-11,-16,22,32,color,a));burst(95,0,56,seg(t,.56,.96));
}else if(['15','34'].includes(id)){
function glints(r,p){for(let j=0;j<12;j++){const z=j*2.4;star(Math.cos(z)*r*p,Math.sin(z)*r*p,2,j%2?gold:color,a*Math.sin(p*PI));}}
function note(x,y,alpha=a){oval(x-5,y+8,6,4,color,alpha,-.3);line([[x+1,y+8],[x+1,y-19],[x+13,y-12]],gold,alpha,1.7);}
if(id==='15'){
 const bloom=ease(seg(t,.08,.65));for(let j=0;j<6;j++){const z=j*PI/3;at(0,0,z+t*.08,()=>{curve(v=>[Math.sin(v*PI)*18,-17-75*v*bloom],1,j%2?'#e8dfcb':'#d88b99',a,2);curve(v=>[-Math.sin(v*PI)*18,-17-75*v*bloom],1,j%2?'#e8dfcb':'#d88b99',a,2);line([[0,-23],[0,-84*bloom]],'#a4cda4',a*.7);});}oval(0,0,14,14,gold,a);for(const side of [-1,1]){curve(v=>[side*(26+68*Math.sin(v*PI)),107-56*v],1,'#9fc6a3',a);for(let j=0;j<3;j++)at(side*(45+j*19),83-j*8,side*.65,()=>oval(0,0,7,14,'#9fc6a3',a));}glints(116,seg(t,.64,.98));
}
else if(id==='34'){
 const turn=ease(seg(t,.08,.77));for(let j=0;j<2;j++){const color=j===0?'#da8b95':'#9bc9a6',gold='#f3ebdf';const z=turn*TAU*.7+j*PI,x=Math.cos(z)*42,y=Math.sin(z)*20;at(x,y,Math.sin(z)*.16,()=>{oval(0,-53,9,10,gold,a);if(j===0){line([[-5,-41],[-27,24],[-37,53],[37,53],[27,24],[5,-41]],color,a,2);curve(v=>[-37+74*v,53+13*Math.sin(v*PI)],1,gold,a);}else{line([[-12,-39],[-17,4],[-10,53],[0,24],[12,53],[16,4],[12,-39]],color,a,2);}line([[-10,-26],[-32,-8],[9,-2],[27,-26]],gold,a);});}for(let j=0;j<3;j++)curve(v=>{const z=v*TAU*.85+t*.7;return[Math.cos(z)*(91+j*12),Math.sin(z)*(59+j*9)]},turn,['#da8b95','#f3ebdf','#9bc9a6'][j],a*.55);note(-102,-82,a);note(103,-62,a);
}
}else if(["55","85","36","bh02","bh08","57","12","23"].includes(id)){
function dust(x,y,r,p){for(let j=0;j<16;j++){const z=j*2.4;star(x+Math.cos(z)*r*p,y+Math.sin(z)*r*p,2,j%2?gold:color,a*Math.sin(p*PI));}}
function snow(){for(let j=0;j<24;j++){const x=-127+(j*47%254)+7*Math.sin(t*5+j),y=-105+(j*29+t*87)%212;star(x,y,j%4?1:2.5,'#dff4ff',a*.5);}}
function ghost(x,y,size,phase){at(x,y+Math.sin(t*7+phase)*7,Math.sin(t*4+phase)*.08,()=>{ctx.scale(size,size);curve(v=>[-31+62*v,32-77*Math.sin(v*PI)],1,color,a,2);curve(v=>[-31+62*v,32+Math.sin(v*PI*5+t*7+phase)*7],1,gold,a,1.7);oval(-10,-10,3,6,gold,a);oval(10,-10,3,6,gold,a);oval(0,10,4,6,color,a);});}
function shield(x,y,size,rotation=0){at(x,y,rotation,()=>{ctx.scale(size,size);line([[-53,-61],[0,-78],[53,-61],[46,20],[24,57],[0,78],[-24,57],[-46,20],[-53,-61]],color,a,2.3);line([[-42,-52],[0,-66],[42,-52],[35,17],[18,45],[0,63],[-18,45],[-35,17],[-42,-52]],gold,a*.6);});}
function gear(x,y,r,teeth,rot){at(x,y,rot,()=>{const pts=[];for(let j=0;j<=teeth*4;j++){const z=j*TAU/(teeth*4),rr=j%4===0||j%4===3?r*.82:r;pts.push([Math.cos(z)*rr,Math.sin(z)*rr]);}line(pts,color,a,2);oval(0,0,r*.56,r*.56,gold,a);oval(0,0,r*.2,r*.2,color,a);for(let j=0;j<4;j++){const z=j*PI/2;line([[Math.cos(z)*r*.2,Math.sin(z)*r*.2],[Math.cos(z)*r*.55,Math.sin(z)*r*.55]],gold,a*.7);}});}
function instagram(size,rotation=0){at(0,0,rotation,()=>{const r=size*.25;curve(v=>{const z=v*TAU;return[Math.sign(Math.cos(z))*Math.pow(Math.abs(Math.cos(z)),.28)*size,Math.sign(Math.sin(z))*Math.pow(Math.abs(Math.sin(z)),.28)*size]},1,color,a,2.5);oval(0,0,size*.48,size*.48,gold,a);oval(size*.51,-size*.51,size*.12,size*.12,'#edaceb',a);});}
function eagle(x,y,s,phase){at(x,y,Math.sin(t*5+phase)*.04,()=>{ctx.scale(s,s);const flap=.6+.4*Math.sin(t*11+phase);for(const side of [-1,1]){line([[0,-14],[side*23,-5],[side*91,-47*flap],[side*66,5],[side*20,24],[0,13]],color,a,2);for(let j=0;j<4;j++)line([[side*(25+j*14),-4-j*3],[side*(31+j*14),12-j*6]],gold,a*.75);}line([[0,-14],[9,-25],[22,-19],[10,-13]],gold,a);line([[-8,15],[-17,44],[0,32],[17,44],[8,15]],gold,a);});}
if(id==='55'){
 const form=ease(seg(t,.06,.61));at(0,0,-.15+t*.6,()=>{for(let j=0;j<4;j++){const offset=j*PI/2;curve(v=>{const z=offset+v*TAU*1.15,rr=9+105*v*form;return[Math.cos(z)*rr,Math.sin(z)*rr*.75]},1,j%2?gold:color,a*.85,1.8);for(let k=0;k<13;k++){const v=(k+.4)/13,z=offset+v*TAU*1.15,rr=9+105*v*form;star(Math.cos(z)*rr,Math.sin(z)*rr*.75,1.4,j%2?color:gold,a*.65);}}oval(0,0,10+5*Math.sin(t*7),8,gold,a);});for(let j=0;j<12;j++)star(Math.sin(j*32)*128,Math.cos(j*19)*105,1.5,color,a*.5);

for(let j=0;j<23;j++){const x=-126+(j*43%252),y=-112+(j*19%55);star(x+Math.sin(t*2+j)*2,y,1.2+j%4*.45,j%2?gold:color,a*(.45+.35*Math.sin(t*5+j)**2));}
}
else if(id==='85'){
 const rise=ease(seg(t,.07,.67));for(let j=0;j<3;j++)ghost((j-1)*79,47-76*rise+(j===1?-13:12),j===1?1.05:.74,j*2);snow();
}
else if(id==='36'){
 const join=ease(seg(t,.08,.6));for(let j=0;j<3;j++)shield((j-1)*(110-50*join),(j===1?-12:13),j===1?.85:.62,(j-1)*.12*(1-join));dust(0,0,123,seg(t,.64,.98));
}
else if(id==='bh02'){
 const focus=ease(seg(t,.08,.57));at(0,0,.3*(1-focus),()=>{ctx.scale(.65+.35*focus,.65+.35*focus);instagram(64);});for(let j=0;j<3;j++){const p=seg(t,.4+j*.11,.76+j*.08);oval(0,0,70+48*p,70+48*p,['#d0a0ee','#f2a594','#eac27c'][j],a*Math.sin(p*PI)*.55);}
}
else if(id==='bh08'){
 const laugh=ease(seg(t,.36,.7)),bounce=Math.sin(t*22)*3*laugh;at(0,bounce,Math.sin(t*13)*.045*laugh,()=>{oval(0,0,72,75,color,a);line([[-41,-24],[-16,-30]],gold,a,2);curve(v=>[17+27*v,-23-8*Math.sin(v*PI)],1,gold,a,2);curve(v=>[-38+79*v,16+Math.sin(v*PI)*(10+20*laugh)-v*13],1,gold,a,2.5);if(laugh>.05)curve(v=>[-38+79*v,16+Math.sin(v*PI)*(7+43*laugh)-v*13],1,color,a,2);line([[-41,10],[-49,17]],color,a);line([[39,0],[49,6]],color,a);});for(const side of [-1,1])for(let j=0;j<2;j++)curve(v=>[side*(89+j*14+5*Math.sin(v*PI)), -30+62*v],1,gold,a*laugh*.6);
}
else if(id==='57'){
 line([[-129,93],[-65,1],[-27,48],[21,-14],[126,93]],color,a,2);line([[-84,28],[-65,1],[-44,29],[-58,22],[-69,31],[-84,28]],'#e3f5ff',a);line([[1,20],[21,-14],[48,25],[30,13],[16,21],[1,20]],'#dff4ff',a);
 if(false){gear(-38,-65,34,10,t*1.5);gear(24,-56,30,9,-t*1.67);gear(68,-89,23,7,t*2.14);}else{gear(0,-69,45,12,t*1.5);gear(-70,-44,28,8,-t*2.25);gear(69,-45,28,8,-t*2.25);}
 snow();
}
else if(id==='12'){
 const salute=ease(seg(t,.1,.61));eagle(0,-33,1,0);for(let j=0;j<3;j++)line([[-39,35+j*15],[0,54+j*15],[39,35+j*15]],gold,a*salute,2);for(const side of [-1,1])line([[side*69,83],[side*103,8],[side*69,-79]],color,a*.55);oval(0,-28,15,18,gold,a*.55);
}
else if(id==='23'){
 const unfold=ease(seg(t,.07,.66));for(let j=0;j<5;j++){const z=-PI/2+(j-2)*.47*unfold;at(0,61,z+PI/2,()=>{line([[0,0],[-19,-48],[0,-127],[19,-48],[0,0]],j%2?gold:color,a,2);line([[0,-13],[0,-107]],color,a*.55);});}oval(0,61,12,12,gold,a);dust(0,0,127,seg(t,.63,.98));
}
}else if(id==='41'){
 const fracture=ease(seg(t,.22,.68));for(let j=0;j<6;j++){const z=j*PI/3;at(Math.cos(z)*17*fracture,Math.sin(z)*17*fracture,0,()=>{line([[0,0],[Math.cos(z)*76,Math.sin(z)*91],[Math.cos(z+PI/3)*76,Math.sin(z+PI/3)*91],[0,0]],j%2?gold:color,a,2);});}curve(v=>[-32+64*v,-4-15*Math.sin(v*PI)],1,gold,a,2);curve(v=>[-32+64*v,-4+15*Math.sin(v*PI)],1,color,a,2);oval(0,-4,6,11,gold,a);approvedSparks(0,0,120,seg(t,.62,.97));
}else if(id==='89'){
 const open=ease(seg(t,.08,.6));oval(0,39,81,19,color,a);line([[-79,36],[-94,-34*open],[-47,-5],[-33,-62*open],[0,-21], [33,-62*open],[47,-5],[94,-34*open],[79,36]],gold,a,2);for(let j=0;j<5;j++){const x=(j-2)*32,y=j%2?-40:-11;at(x,y,0,()=>{line([[0,-9],[-6,0],[0,9],[6,0],[0,-9]],color,a);});}for(let j=0;j<3;j++){const p=seg(t,.29+j*.15,.68+j*.09);star((j-1)*63,-91,5,'#e0f5ff',a*Math.sin(p*PI));}winterFlakes(.75);
}else if(id==='35'){
 const lock=ease(seg(t,.07,.5)),wreath=ease(seg(t,.29,.8));for(const side of [-1,1])at(side*(110-58*lock),8,side*(.7-.48*lock),()=>{line([[0,92],[0,-80]],gold,a,2);line([[0,-103],[-8,-80],[0,-71],[8,-80],[0,-103]],color,a,2);});
 at(0,25*(1-lock),id==='35b'?Math.sin(t*6)*.08:0,()=>{oval(0,0,47,59,color,a);oval(0,0,39,51,gold,a*.55);oval(0,0,13,16,gold,a);for(let j=0;j<8;j++){const z=j*TAU/8;line([[Math.cos(z)*22,Math.sin(z)*27],[Math.cos(z)*33,Math.sin(z)*42]],color,a*lock,1.5);}});
 if(id==='35'){for(const side of [-1,1])laurel(side,wreath);}else{const strike=ease(seg(t,.35,.71));at(-92+176*strike,-68+106*strike,-.85,()=>{line([[0,-55],[0,39]],gold,a,3);line([[0,-79],[-8,-56],[8,-56],[0,-79]],color,a,2);});curve(v=>[-111+222*v,79-Math.sin(v*PI)*24],strike,color,a,2);approvedSparks(0,0,116,seg(t,.59,.94));}
}else if(id==='88'){
 const draw=ease(seg(t,.1,.59));line([[-105,63],[-18,82],[0,68],[18,82],[105,63],[94,35],[17,49],[0,39],[-17,49],[-94,35],[-105,63]],color,a,2);line([[0,39],[0,68]],gold,a);for(const side of [-1,1])for(let j=0;j<3;j++)line([[side*19,57+j*6],[side*88,45+j*6]],gold,a*.45);
 // Snow settles on the page edges while the wooden sword lifts free.
 for(const side of [-1,1])curve(v=>[side*(18+76*v),48-13*v-3*Math.sin(v*PI*4)],1,'#dff5ff',a*.9,2);
 at(0,31-63*draw,.15*(1-draw),()=>{line([[0,-89],[-10,-67],[-8,5],[8,5],[10,-67],[0,-89]],color,a,2);line([[-28,9],[28,9]],gold,a,4);box(-5,12,10,28,gold,a);oval(0,45,8,6,color,a);line([[-25,6],[-12,4],[0,6],[12,3],[25,6]],'#dff5ff',a);});
 if(id==='88'){for(const side of [-1,1])line([[side*42,31],[side*71,-29],[side*108,27]],'#93c8e8',a*.55);for(const side of [-1,1])line([[side*60,-6],[side*71,-29],[side*86,-3],[side*76,-9],[side*69,-2],[side*60,-6]],'#e5f6ff',a*.65);}
 snowfall();
}else if(id==='11'){
 const align=ease(seg(t,.08,.57));for(let j=0;j<3;j++)at((j-1)*65,20+(j%2?35:-35)*(1-align),(j-1)*.25*(1-align),()=>{line([[-24,-52],[24,-52],[24,41],[-24,41],[-24,-52]],color,a);for(let k=0;k<4;k++)line([[-14,-35+k*13],[14,-35+k*13]],gold,a*.5);oval(0,23,10,10,gold,a);line([[-6,32],[-10,49],[0,43],[10,49],[6,32]],color,a);});}else if(id==='46'){
 const rise=ease(seg(t,.08,.53));for(let j=0;j<3;j++){const x=(j-1)*76,h=(j===1?109:71)*rise;box(x-17,71-h,34,h,color,a);line([[x-25,71-h],[x+25,71-h]],gold,a,3);for(let k=0;k<3;k++)line([[x-10+k*10,80-h],[x-10+k*10,65]],gold,a*.35);}line([[-118,83],[118,83]],color,a,2);at(0,-55*rise,0,()=>{line([[-43,0],[-56,-37],[-17,-20],[0,-51],[17,-20],[56,-37],[43,0],[-43,0]],gold,a,2);});approvedSparks(0,-49,83,seg(t,.55,.93));
}else if(id==='10'){
 const pull=ease(seg(t,.2,.72)),r=77*(1-pull*.85);for(let j=0;j<6;j++){const z=j*PI/3+t*.7;at(Math.cos(z)*r,Math.sin(z)*r,z,()=>{line([[-22,-29],[19,-22],[28,15],[-14,28],[-22,-29]],j%2?gold:color,a,1.8);line([[-22,-29],[3,0],[28,15]],color,a*.6);});}oval(0,0,18+20*Math.sin(pull*PI),18+20*Math.sin(pull*PI),gold,a);for(let j=0;j<3;j++)curve(v=>{const z=v*TAU*.85+j*TAU/3+t*2;const rr=110*(1-v)+12;return[Math.cos(z)*rr,Math.sin(z)*rr]},pull,color,a*.35);approvedSparks(0,0,132,seg(t,.67,.97));
}else if(id==='19'){
 const build=ease(seg(t,.06,.49));line([[-126,2],[126,2]],gold,a,2);line([[-126,-10],[126,-10]],color,a);for(let j=0;j<3;j++){const x=(j-1)*78;curve(v=>[x-32+64*v,57-48*Math.sin(v*PI)*build],1,color,a,2);line([[x-38,2],[x-38,60]],gold,a);}for(let j=0;j<11;j++)line([[-120+j*24,-10],[-120+j*24,-28]],color,a*build);line([[-125,-29],[125,-29]],gold,a*build);for(let j=0;j<3;j++)curve(v=>[-132+264*v,75+j*10+5*Math.sin(v*TAU*2-t*8+j)],1,j%2?gold:color,a*.65);for(let j=0;j<3;j++)star(-95+((t*150+j*76)%210),65+j*9,2,gold,a);
}else if(id==='bh12'){
 const bloom=ease(seg(t,.08,.65));line([[0,96],[0,-33]],color,a,2);for(const side of [-1,1])curve(v=>[side*Math.sin(v*PI)*25,64-35*v],1,color,a);at(0,-47,0,()=>{for(let j=0;j<7;j++){const z=j*TAU/7-PI/2;at(0,0,z,()=>{curve(v=>[Math.sin(v*PI)*13*bloom,-7-43*v*bloom],1,j%2?gold:color,a,2);curve(v=>[-Math.sin(v*PI)*13*bloom,-7-43*v*bloom],1,j%2?gold:color,a,2);});}oval(0,0,9,9,gold,a);});approvedSparks(0,-47,64,seg(t,.59,.96));
}else if(id==='01'){

 const open=ease(seg(t,.06,.57)),land=ease(seg(t,.44,.77));
 at(0,-18+18*land,0,()=>{for(const side of [-1,1]){line([[0,5],[side*25,-8],[side*(42+67*open),-45-20*open],[side*87,9],[side*39,18],[side*12,33]],color,a,2);for(let k=0;k<4;k++)line([[side*(48+k*13),-16-k*7*open],[side*(42+k*12),17-k*3]],gold,a*open,1.3);}line([[-8,5],[-8,-21],[2,-29],[17,-24],[6,-17],[7,6],[0,19],[-8,5]],gold,a,1.7);});
 line([[-42,72],[-48,43],[-22,54],[0,35],[22,54],[48,43],[42,72],[-42,72]],gold,a*land,2);for(let j=0;j<3;j++)star((j-1)*28,62,3,color,a*land);moteBurst(0,-20,108,seg(t,.57,.95));
}else if(id==='bh07'){

 const assemble=ease(seg(t,.07,.53));at(0,0,PI/4,()=>{box(-39,-39,78,78,color,a);box(-23,-23,46,46,gold,a);for(let j=0;j<5;j++)for(const side of [-1,1]){const xx=-28+j*14;line([[xx,side*39],[xx,side*(39+20*assemble)]],color,a,2);line([[side*39,xx],[side*(39+20*assemble),xx]],color,a,2);}});
 for(let j=0;j<4;j++){const z=j*PI/2,rr=105-47*ease(seg(t,.13+j*.07,.55+j*.07));at(Math.cos(z)*rr,Math.sin(z)*rr,z,()=>{line([[-8,-8],[0,0],[-8,8]],gold,a,2);});}for(let j=0;j<3;j++){const p=seg(t,.45+j*.07,.78+j*.05);oval(0,0,24+102*p,24+102*p,color,a*Math.sin(p*PI)*.3);}
}else if(id==='bh11'){

 const unfurl=ease(seg(t,.06,.53)),seal=ease(seg(t,.48,.76));
 box(-80,-62,160*unfurl,121,color,a);for(const side of [-1,1]){oval(side*80*unfurl,-62,9,6,gold,a);line([[side*80*unfurl,-62],[side*80*unfurl,53]],gold,a,2);}
 for(let j=0;j<4;j++)line([[-59,-37+j*17],[-59+(j===3?70:117)*ease(seg(t,.14+j*.07,.45+j*.07)),-37+j*17]],gold,a*.65);
 at(35,33-45*(1-seal),-.15*(1-seal),()=>{oval(0,0,22,22,gold,a*seal);line([[-9,21],[-15,47],[0,38],[14,47],[9,21]],color,a*seal);star(0,0,9,color,a*seal);});moteBurst(35,33,58,seg(t,.62,.94));
}else if(id==='45'){
const reveal=ease(seg(t,.03,.38)),settle=ease(seg(t,.15,.84)),sunY=-72+34*settle;
// The sun sinks behind the horizon; the cliffs remain in the foreground.
ctx.save();ctx.beginPath();ctx.rect(-160,-150,320,171);ctx.clip();
oval(0,sunY,43*reveal,43*reveal,'#f4bc7f',a,0);
for(let j=0;j<5;j++){const yy=sunY+13+j*6,half=Math.sqrt(Math.max(0,43*43-(yy-sunY)**2))*reveal;line([[-half,yy],[half,yy]],j%2?'#ed9d8d':'#efd29a',a*.5,1.2);}
for(let j=0;j<9;j++){const wave=.5+.5*Math.sin(t*TAU*2.2-j*.65),fan=ease(seg(t,.03+j*.025,.22+j*.025)),z=PI+j*PI/8+Math.sin(t*TAU*1.6-j*.4)*.065,inner=49+5*wave,outer=inner+(11+19*wave)*fan,c=j%2?gold:'#f4bc7f';line([[Math.cos(z)*inner,sunY+Math.sin(z)*inner],[Math.cos(z)*outer,sunY+Math.sin(z)*outer]],c,a*fan*(.65+.35*wave),1.6+1.2*wave);const glint=seg(t,.2+j*.025,.63+j*.025),rr=inner+(outer-inner)*glint;star(Math.cos(z)*rr,sunY+Math.sin(z)*rr,2.5,c,a*Math.sin(glint*PI)*.65);}
ctx.restore();
const back=[[-143,70],[-105,15],[-76,45],[-30,1],[3,39],[46,-7],[87,42],[109,17],[143,70]];
line(back,'#bcabb8',a*reveal*.5,1.4);
const ridge=[[-143,85],[-85,-5],[-35,57],[34,16],[76,-17],[143,85]];

line(ridge,color,a*reveal,2);
line([[-85,-5],[-73,29],[-86,46],[-61,80]],gold,a*reveal*.5,1.25);
line([[76,-17],[62,23],[76,42],[60,80]],gold,a*reveal*.5,1.25);
line([[-103,22],[-91,18],[-84,27],[-77,19],[-66,20]],'#efcfab',a*reveal*.7,1.2);
line([[59,6],[68,10],[77,2],[85,11],[95,9]],'#efcfab',a*reveal*.7,1.2);
line([[-129,88],[130,88]],gold,a*reveal*.25,1);
}else if(id==='22'){
const mode=1,isIsaac=true,bloom=ease(seg(t,.04,.42)),pulse=Math.sin(PI*seg(t,.36,.82));
const blue=isIsaac?'#9bdfff':'#d2ebc1',accent=isIsaac?'#557cff':'#edcb91';
function glow(x,y,r,c,alpha){ctx.save();ctx.globalAlpha=alpha;const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,c);g.addColorStop(1,c+'00');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,2*r,2*r);ctx.restore();}
function atom(cx,cy,size,turn,alpha){at(cx,cy,turn,()=>{for(let j=0;j<3;j++){const rot=j*PI/3+(mode===2&&isIsaac?t*.3:0),rx=size*bloom,ry=size*.34*bloom;oval(0,0,rx,ry,j===1?accent:color,alpha*.8,rot);const z=t*(isIsaac?11:7)+j*TAU/3,xx=Math.cos(z)*rx,yy=Math.sin(z)*ry,x=xx*Math.cos(rot)-yy*Math.sin(rot),y=xx*Math.sin(rot)+yy*Math.cos(rot);glow(x,y,9,blue,alpha*.5);oval(x,y,3.5,3.5,blue,alpha);}
 glow(0,0,23,accent,alpha*.4);for(let k=0;k<3;k++){const z=k*TAU/3+t*1.5;oval(Math.cos(z)*5,Math.sin(z)*5,5,5,k%2?blue:accent,alpha);} });}
if(isIsaac&&mode===1){
 atom(0,0,88+13*pulse,0,a);const p=seg(t,.45,.86);for(let j=0;j<3;j++){const z=j*TAU/3-PI/2,r=18+107*ease(p);line([[Math.cos(z)*(r-17),Math.sin(z)*(r-17)],[Math.cos(z)*r,Math.sin(z)*r]],blue,a*Math.sin(p*PI),2);glow(Math.cos(z)*r,Math.sin(z)*r,7,blue,a*Math.sin(p*PI)*.6);}oval(0,0,18+91*ease(p),18+91*ease(p),accent,a*Math.sin(p*PI)*.23);
}
}else if(id==='02'){
 const mode=1,sets=[[],[[-91,46],[-57,-30],[-3,-83],[52,-32],[27,18],[83,51]],[[-111,40],[-69,-23],[-17,-70],[31,-26],[77,-62],[118,-12]],[[-104,58],[-75,-7],[-30,-55],[17,-22],[56,38],[108,4]]],pts=sets[mode];
 for(let j=1;j<pts.length;j++){const p=ease(seg(t,.05+j*.065,.28+j*.065)),[x,y]=pts[j-1],[xx,yy]=pts[j];line([[x,y],[x+(xx-x)*p,y+(yy-y)*p]],j%2?gold:color,a*.85,1.8);}
 pts.forEach(([x,y],j)=>{const p=ease(seg(t,.06+j*.06,.23+j*.06)),glint=.8+.2*Math.sin(t*18-j);star(x,y,(j%3===0?8:5)*p*glint,j%2?gold:color,a*p);oval(x,y,11*p,11*p,color,a*p*.22);});
 const sweep=seg(t,.3,.83),idx=Math.min(pts.length-2,Math.floor(sweep*(pts.length-1))),u=sweep*(pts.length-1)-idx,from=pts[idx],to=pts[idx+1];star(from[0]+(to[0]-from[0])*u,from[1]+(to[1]-from[1])*u,7,gold,a*Math.sin(sweep*PI));
 if(mode===1)curve(v=>{const z=-PI*.9+v*TAU;return[Math.cos(z)*121,Math.sin(z)*107]},ease(seg(t,.17,.65)),gold,a*.3,1.1);
 if(mode===2){for(let j=0;j<2;j++){const p=seg(t,.5+j*.12,.8+j*.1);curve(v=>[-124+227*v,81-j*12-25*Math.sin(v*PI)],p,j?color:gold,a*Math.sin(p*PI)*.65,1.7);}}
 if(mode===3){for(let j=1;j<5;j++){const [x,y]=pts[j],p=ease(seg(t,.38+j*.05,.61+j*.05)),side=j%2?1:-1;line([[x,y],[x+side*15*p,y-29*p]],color,a*p*.6,1.2);star(x+side*15*p,y-29*p,3,gold,a*p);}}
}else if(id==='86'){

 const mode=3,count=mode===1?3:mode===2?5:3;
 for(let j=0;j<count;j++){
 const start=.035+j*(mode===2?.075:.12),launch=seg(t,start,start+.23),p=seg(t,start+.19,start+.62),xx=mode===2?(j-2)*51:(j-1)*83,yy=mode===2?-67+Math.abs(j-2)*31:(j===1?-51:-5),c=j%2?gold:color;
 if(launch<1){const y=91+(yy-91)*ease(launch);line([[xx,y+24*(1-launch)],[xx,y]],gold,a*Math.sin(launch*PI),2.4);star(xx,y,3,c,a*Math.sin(launch*PI));}
 if(p>0&&p<1){const r=(mode===3?62:48)*ease(p),fade=a*Math.sin(p*PI),n=mode===3?16:12;for(let k=0;k<n;k++){const z=k*TAU/n,fall=mode===3?39*p*p:12*p*p;line([[xx+Math.cos(z)*r*.8,yy+Math.sin(z)*r*.8+fall],[xx+Math.cos(z)*r,yy+Math.sin(z)*r+fall]],k%3?c:gold,fade,2);if(mode===3)curve(v=>[xx+Math.cos(z)*r*(.55+.45*v),yy+Math.sin(z)*r*(.55+.45*v)+fall*v*v],1,c,fade*.5,1);if(mode===2&&k%3===0)star(xx+Math.cos(z)*r,yy+Math.sin(z)*r+fall,3,gold,fade);}}
 }
 if(mode===1){const p=seg(t,.58,.94);for(let j=0;j<9;j++){const z=j*TAU/9;star(Math.cos(z)*123*ease(p),Math.sin(z)*78*ease(p),3,gold,a*Math.sin(p*PI));}}
}else if(id==='bh04'){
 const mode=2,power=ease(seg(t,.16,.72));
 if(mode===1){for(let j=0;j<4;j++)curve(v=>{const z=-PI+v*PI*1.8,r=100-j*16-51*v;return[-75+149*power+Math.cos(z)*r,14+Math.sin(z)*r]},q,j%2?'#c4ebfa':color,a*(1-j*.14),3-j*.4);for(let j=0;j<11;j++){const p=seg(t,.38+j*.025,.7+j*.02);line([[6+92*p,Math.sin(j*3)*45+22*p],[13+92*p,Math.sin(j*3)*45+25*p]],gold,a*Math.sin(p*PI),1.6);}}
 if(mode===2){for(let j=0;j<4;j++){const angle=j*TAU/4;at(0,0,angle,()=>curve(v=>{const z=v*PI*1.6;return[Math.cos(z)*(103-74*v)*power,Math.sin(z)*(103-74*v)*power]},q,j%2?gold:color,a,2.4));}oval(0,0,17+13*power,17+13*power,'#d6f0ff',a);burst(0,0,115,seg(t,.56,.9));}
 if(mode===3){for(let j=0;j<5;j++){const p=ease(seg(t,.07+j*.085,.45+j*.085)),xx=-118+j*56;curve(v=>[xx+Math.sin(v*PI)*22,101-211*v*p],q,j%2?gold:color,a,2.5);curve(v=>[xx+9+Math.sin(v*PI)*22,101-193*v*p],q,'#ccefff',a*.45,1.2);}for(let j=0;j<3;j++)oval(0,74,34+88*power,8+j*9,color,a*power*.5);}
 if(mode===4){const snap=ease(seg(t,.43,.81));for(const side of [-1,1])at(side*32*snap,0,side*.25*snap,()=>{curve(v=>{const z=(side===1?-PI/2:PI/2)+v*PI;return[Math.cos(z)*77,Math.sin(z)*88]},q,color,a,2.8);line([[0,-88],[side*15,-42],[-side*8,0],[side*15,42],[0,88]],gold,a,2.4);});for(let j=0;j<24;j++){const z=j*2.39996,rr=30+95*snap;line([[Math.cos(z)*rr,Math.sin(z)*rr*.7],[Math.cos(z)*(rr+7),Math.sin(z)*(rr+7)*.7]],j%2?gold:color,a*snap,1.7);}}
}else if(id==='43'){
 // A flat paper strip folds into an elephant, then stamps a new floor tile.
 const fold=ease(seg(t,.08,.56)),yy=35*(1-fold);at(0,yy,(1-fold)*-.4,()=>{const pts=[[-65,25],[-65,-23],[-34,-45],[32,-39],[56,-20],[68,-3],[70,38],[56,45],[49,34],[55,16],[41,4],[30,21],[24,52],[10,52],[9,20],[-30,20],[-35,52],[-49,52],[-47,17]];line(pts.map(([x,y])=>[x,y*fold]),gold,a,1.8,true);line([[19,-33],[0,-12],[21,8],[38,-12],[19,-33]],color,a*fold);star(44,-12,2,color);line([[-65,-16],[-80,-3],[-82,8]],gold,a);});
 const stamp=ease(seg(t,.57,.8));line([[-90,70],[-30,50],[90,70],[30,93]],color,a*stamp,2,true);for(let j=0;j<3;j++)line([[-90-j*12,70+j*4],[-30,50-j*4],[90+j*12,70+j*4]],gold,a*stamp*(.4-j*.1));
}else if(id==='51'){
 let weave=ease(seg(t,.07,.74));for(let j=0;j<3;j++){curve(v=>[-120+v*240,Math.sin(v*TAU*1.5+t*1.5+j*TAU/3)*(28*(1-weave)+12)+j*4],weave,j===1?gold:color,a,2);}
 for(let side of [-1,1])at(side*(95-55*q),0,side*.25,()=>{line([[-16,-25],[16,-25],[16,25],[-16,25]],gold,a,1.5,true);line([[-16,-9],[16,9]],color,a);});
 for(let j=0;j<2;j++)oval((j?1:-1)*12,0,25,16,gold,a*seg(t,.35,.7),(j?1:-1)*.6);for(let side of [-1,1])card(side*90,-55,.15*side,a*seg(t,.56,.8));
}else if(id==='81'){
 const fold=ease(seg(t,.12,.48)),scatter=ease(seg(t,.58,.92));for(let j=0;j<5;j++){const z=-PI*.85+j*PI*.17,xx=Math.cos(z)*130*scatter,yy=20+Math.sin(z)*110*scatter;at(xx,yy,(j-2)*scatter*.5,()=>{const rx=32*(j===2?1:.65);curve(v=>[Math.cos(v*PI)*rx,Math.sin(v*PI)*rx*.62],1,gold,a);curve(v=>[Math.cos(v*PI)*rx,-Math.sin(v*PI)*rx*.62*(1-fold)],1,color,a);for(let k=1;k<8;k++){let r=k*PI/8;line([[Math.cos(r)*rx*.9,Math.sin(r)*rx*.55],[Math.cos(r)*rx*1.04,Math.sin(r)*rx*.69]],gold,a*fold);}});}
 for(let j=0;j<3;j++)curve(v=>[(j-1)*22+Math.sin(v*8+t*4)*5,10-v*65],q,color,a*(1-scatter)*.45);
}else if(id==='83'){
 const mode=3,unite=ease(seg(t,.19,.72));
 if(mode===1){
 for(let j=0;j<4;j++){const xx=(j-1.5)*47,yy=30-20*ease(seg(t,.1+j*.08,.5+j*.07));line([[xx-18,48],[xx-18,yy-47],[xx-10,yy-47],[xx-10,yy-59],[xx+10,yy-59],[xx+10,yy-47],[xx+18,yy-47],[xx+18,48]],j%2?gold:color,a,2);line([[xx,yy-19],[xx,yy-2]],gold,a,2);}
 line([[-109,58],[109,58]],gold,a*unite,2.5);curve(v=>[-105+210*v,82-Math.sin(v*PI)*12],q,color,a*unite,2);
 }else if(mode===2){
 for(let j=0;j<4;j++){const z=j*PI/2+PI/4,rr=40*(1-unite)+51;at(Math.cos(z)*rr,Math.sin(z)*rr,z-PI/4,()=>{line([[-19,-29],[19,-29],[17,7],[0,28],[-17,7],[-19,-29]],j%2?color:gold,a,2.3);line([[-7,-10],[7,-10]],gold,a,2);});}
 oval(0,0,70,70,gold,a*unite*.7);for(const side of [-1,1])line([[side*8,-10],[side*8,10]],'#ffd6cd',a*unite,3);
 }else{
 line([[-104,60],[104,60],[-104,60],[-104,44],[104,44],[104,60]],gold,a,2);
 for(let j=0;j<4;j++){const xx=(j-1.5)*49,rise=ease(seg(t,.08+j*.1,.48+j*.08));box(xx-11,44-89*rise,22,89*rise,color,a);line([[xx-17,40-89*rise],[xx+17,40-89*rise]],gold,a,2.5);}
 line([[-115,-56],[0,-94*unite-56*(1-unite)],[115,-56],[-115,-56]],gold,a*unite,2.4);
 }
}else if(id==='90'){
 const net=ease(seg(t,.07,.55)),haul=ease(seg(t,.5,.86));for(let j=0;j<7;j++){let xx=(j-3)*24;curve(v=>[xx*(1-haul*.5)+Math.sin(v*PI)*xx*.2,-55+v*105*net-haul*18],1,color,a*.65);curve(v=>[-90+v*180,-50+j*16*net+Math.sin(v*PI)*20*net-haul*18],1,gold,a*.4);}
 for(let j=0;j<2;j++){let xx=(j?1:-1)*(45-15*haul),yy=j*28-12-haul*20;curve(v=>[xx+Math.cos(v*TAU)*22,yy+Math.sin(v*TAU)*10],1,gold,a);line([[xx+21,yy],[xx+34,yy-12],[xx+34,yy+12],[xx+21,yy]],color,a,1.5,true);star(xx-10,yy-2,2,gold);}
 for(let j=0;j<7;j++)star((j-3)*24*(1-haul*.5),-55-haul*18,3,color,a);
}else if(id==='21'){
 const rise=ease(seg(t,.05,.48)),breakage=ease(seg(t,.44,.79));
 for(const side of [-1,1])for(let j=0;j<4;j++){const xx=side*(18+j*25+breakage*38),yy=10+breakage*j*j*3;oval(xx,yy,17,8,j%2?gold:color,a,side*breakage*.9);}
 at(0,50*(1-rise),0,()=>{line([[-26,50],[-26,9],[-36,-4],[-36,-20],[-25,-22],[-25,-43],[-13,-47],[-5,-44],[7,-48],[18,-43],[29,-44],[37,-33],[35,-7],[24,15],[24,50]],gold,a,2,true);line([[-25,-22],[-11,-22],[-1,-11],[-1,2]],color,a);for(let j=0;j<3;j++)line([[-12+j*13,-43],[-12+j*13,-24]],color,a);});
 for(let j=0;j<8;j++){const z=j*TAU/8,d=35+breakage*38;line([[Math.cos(z)*d,Math.sin(z)*d],[Math.cos(z)*(d+9),Math.sin(z)*(d+9)]],color,a*Math.sin(breakage*PI));}
}else if(id==='29'){
 const open=ease(seg(t,.08,.55)),lift=seg(t,.5,.88);at(0,-lift*18,0,()=>{
 line([[0,-24],[10,-37],[24,-32],[11,-26],[14,-5],[8,17],[0,32],[-8,17],[-14,-5],[-10,-23],[0,-24]],gold,a,2);
 for(const side of [-1,1])for(let j=0;j<7;j++){let span=(43+j*11)*open,yy=-20+j*5;curve(v=>[side*(10+v*span),yy-Math.sin(v*PI)*25*open-v*(35-j*6)*open],1,j%2?color:gold,a,1.8);}
 for(let j=-1;j<=1;j++)line([[j*5,15],[j*13,44],[0,32]],color,a);});
 for(let j=0;j<5;j++)star((j-2)*31,67-Math.abs(j-2)*8,3+open*2,color,a*seg(t,.35,.7));
}else if(id==='30'){
 const thrust=ease(seg(t,.14,.57)),split=ease(seg(t,.5,.8));
 for(const side of [-1,1])at(side*split*45,-side*split*15,side*split*.3,()=>line([[0,-49],[side*30,-49],[side*30,49],[0,49],[side*8,26],[-side*5,7],[side*8,-12],[0,-49]],color,a,1.7,true));
 at(-100+175*thrust,52-92*thrust,-.5,()=>{line([[-100,0],[17,0]],gold,a,3);line([[17,0],[-3,-13],[3,0],[-3,13],[17,0]],gold,a,2,true);for(let j=0;j<3;j++)line([[-85-j*7,-5],[-85-j*7,5]],color,a);});
 for(let j=0;j<4;j++)curve(v=>[-115+v*225,55+j*9-Math.sin(v*PI)*split*28],thrust,color,a*.4);
}else if(id==='84'){const color='#9bcfe9',gold='#bdc4f2';

 // A butterfly emerges from folded petals and visits three blossoms.
 const fly=ease(seg(t,.16,.8)),xx=-90+180*fly,yy=-30-Math.sin(fly*PI)*35;
 for(let j=0;j<3;j++){let px=(j-1)*75,flower=ease(seg(t,.14+j*.18,.38+j*.18));line([[px,65],[px,30]],gold,a);for(let k=0;k<5;k++){let z=k*TAU/5;oval(px+Math.cos(z)*8*flower,26+Math.sin(z)*8*flower,7*flower,4*flower,color,a,z);}star(px,26,2,gold);}
 at(xx,yy,.15*Math.sin(t*10),()=>{let wing=.25+.75*Math.abs(Math.sin(t*18));for(const side of [-1,1]){curve(v=>[side*Math.sin(v*PI)*30*wing,-Math.sin(v*TAU)*20],1,color,a,2);curve(v=>[side*Math.sin(v*PI)*19*wing,10-Math.sin(v*TAU)*12],1,gold,a);}line([[0,-10],[0,18]],gold,a,2);line([[-7,-19],[0,-10],[7,-19]],color,a);});

for(let j=0;j<25;j++){const x=-118+(j*47%236)+4*Math.sin(t*5+j),y=-94+(j*29+t*77)%185;star(x,y,j%4?1:2,'#e3f5ff',a*.65);}
for(let j=0;j<3;j++)curve(v=>[(j-1)*75-12+24*v,21-3*Math.sin(v*PI)],1,'#e7f6ff',a*.7,1.4);}else if(id==='99'){
 // Toy scales pass a heavy accusation back and forth, then tip together.
 const swing=Math.sin(seg(t,.12,.87)*TAU)*.36;line([[0,-54],[0,65],[-23,76],[23,76],[0,65]],gold,a,2);at(0,-28,swing,()=>{line([[-87,0],[87,0]],gold,a,2);for(const side of [-1,1]){const xx=side*73;line([[xx,0],[xx-24,48],[xx+24,48],[xx,0]],color,a,1.4);curve(v=>[xx-24+48*v,48+Math.sin(v*PI)*13],1,gold,a,2);}});
 const p=ease(seg(t,.28,.7)),xx=-70+140*p,yy=5-Math.sin(p*PI)*75;at(xx,yy,t*3,()=>{box(-11,-11,22,22,color,a);line([[-6,0],[6,0]],gold,a);});oval(0,-28,7,7,color,a);}else if(id==='07'){
 // Three mechanized units advance on the same oblique command.
 for(let j=0;j<3;j++){const p=ease(seg(t,.06+j*.11,.53+j*.1)),xx=(j-1)*76,yy=-(j-1)*27;at(xx-65*(1-p),yy,0,()=>{
 line([[-29,8],[-23,-10],[13,-10],[30,4],[30,16],[-29,16]],color,a*p,1.8,true);line([[-14,-10],[-8,-22],[9,-22],[16,-10]],gold,a*p,1.6,true);line([[8,-19],[38,-27]],gold,a*p,2.5);
 oval(0,21,29,8,gold,a*p);for(let k=0;k<5;k++)oval(-21+k*10,21,3.5,3.5,color,a*p);line([[-25,-3],[14,-3]],gold,a*p*.5);
 });}
 for(let j=0;j<3;j++)line([[(j-1)*76-21,-57-(j-1)*27],[(j-1)*76,-78-(j-1)*27],[(j-1)*76+21,-57-(j-1)*27]],gold,a*q,2.2);
}else if(id==='82'){
 // A glass snow globe, with parallax flakes, a warm cottage and cut-glass base.
 const grow=ease(seg(t,.02,.25)),swirl=1-ease(seg(t,.37,.86));at(0,-12,Math.sin(t*10)*.025*swirl,()=>{
 ctx.save();ctx.beginPath();ctx.arc(0,0,76*grow,0,TAU);ctx.clip();
 for(let j=0;j<3;j++)curve(v=>[-84+v*168,44+j*7+Math.sin(v*6+j)*5],1,color,a*(.2+j*.14));
 line([[-33,34],[-33,0],[-3,-25],[26,0],[26,34]],gold,a,1.6);line([[-41,3],[-3,-32],[34,3]],color,a,2);box(-20,7,11,13,gold,a);box(4,7,11,13,gold,a);box(-5,20,10,14,gold,a);line([[10,-22],[10,-36],[20,-36],[20,-13]],gold,a*.7);
 for(const side of [-1,1]){const xx=side*51;line([[xx,40],[xx,-12],[xx-13,12],[xx-7,12],[xx-18,30],[xx+18,30],[xx+7,12],[xx+13,12],[xx,-12]],color,a*.7,1.2);}
 for(let j=0;j<62;j++){const phase=j*2.39996+t*(1+swirl*5),radius=18+(j%9)*7,xx=Math.cos(phase)*radius,yy=((j*23+t*50)%144)-72;const drift=xx*(.4+.6*swirl)+Math.sin(j*6)*35*(1-swirl);if(drift*drift+yy*yy<5200){if(j%8===0)star(drift,yy,2,'#e8f6ff',a*.85);else oval(drift,yy,1.1,1.1,'#d6efff',a*.7);}}
 ctx.restore();oval(0,0,76*grow,76*grow,color,a);
 });oval(0,59,46,8,gold,a);line([[-46,59],[-53,76],[53,76],[46,59]],gold,a,2);oval(0,77,53,8,gold,a);for(let j=-3;j<=3;j++)line([[j*12-4,64],[j*12,72],[j*12+4,64]],color,a*.5);
}else if(id==='bh06'){
 // Three adaptive tokens each morph through circle, triangle, square and star.
 const deal=ease(seg(t,.09,.52));for(let j=0;j<3;j++){const xx=(j-1)*77*deal,yy=-Math.sin(deal*PI)*j*9;at(xx,yy,(j-1)*(1-deal)*.4,()=>{box(-26,-40,52,80,gold,a);for(let k=0;k<4;k++)line([[-17+k*11,29],[-12+k*11,29]],color,a*.5);const phase=seg(t,.24+j*.05,.78+j*.035)*3,index=Math.min(2,Math.floor(phase)),blend=phase-index;const point=(kind,v)=>{if(kind===0)return[Math.cos(v*TAU)*16,Math.sin(v*TAU)*16];const count=kind===1?3:kind===2?4:10,part=v*count,corner=Math.floor(part)%count,f=part-Math.floor(part);const p=k=>{let rr=kind===3&&k%2?8:18;return[Math.cos(k*TAU/count-PI/2)*rr,Math.sin(k*TAU/count-PI/2)*rr];};let aa=p(corner),bb=p((corner+1)%count);return[aa[0]+(bb[0]-aa[0])*f,aa[1]+(bb[1]-aa[1])*f];};curve(v=>{const aa=point(index,v),bb=point(index+1,v);return[aa[0]+(bb[0]-aa[0])*blend,aa[1]+(bb[1]-aa[1])*blend];},1,color,a,2);});}

 // Each adaptive card carries two rank chevrons through its entrance.
 for(let cardIndex=0;cardIndex<3;cardIndex++){
   const xx=(cardIndex-1)*77*deal,yy=-Math.sin(deal*PI)*cardIndex*9;
   at(xx,yy,(cardIndex-1)*(1-deal)*.4,()=>{
     for(let j=0;j<2;j++){const settle=ease(seg(t,.15+j*.12,.48+j*.12)),y=-91+j*17-15*(1-settle);line([[-23,y],[0,y+13],[23,y]],j?'#abcbd2':'#dfc596',a*settle,2.4);}
   });
 }
}else if(id==='bh16'){
 // A spiral of blades tightens into a coordinated downward storm.
 const gather=ease(seg(t,.06,.45)),strike=ease(seg(t,.48,.86));for(let j=0;j<12;j++){const z=j*TAU/12+t*1.3*(1-strike),r=(94-28*gather)*(1-strike*.6),xx=Math.cos(z)*r,yy=Math.sin(z)*r*.65+strike*38;at(xx,yy,z+PI/2+(PI-z-PI/2)*strike,()=>{line([[0,-25],[5,-12],[3,19],[0,26],[-3,19],[-5,-12]],['#82cfff','#aaa5f3','#77ddd8','#cee9ff'][j%4],a,1.3,true);line([[-9,-12],[9,-12]],'#d3d7ff',a);line([[0,-12],[0,-31]],'#d3d7ff',a,2);});}
 for(let j=0;j<3;j++)curve(v=>[-100+v*200,78+j*7+Math.sin(v*PI*3)*9*strike],1,['#7c8ce8','#82dadd','#b9c7f5'][j],a*strike*.6);for(let j=0;j<9;j++)line([[(j-4)*18,26],[(j-4)*18,26+48*strike]],'#d3d7ff',a*strike*(1-strike)*2,1);}else if(id==='bh10'){
 // The chauffeur collects a chosen passenger from the catalog.
 const arrive=ease(seg(t,.03,.4)),pick=ease(seg(t,.3,.7)),depart=ease(seg(t,.7,.98));
 for(let j=0;j<3;j++){const xx=(j-1)*39,yy=-48;card(xx,yy,0,a*(j===1?1:.35)*(1-depart));}
 at(-80+80*arrive+depart*75,27,0,()=>{line([[-53,7],[-49,-8],[-28,-12],[-12,-29],[21,-29],[38,-10],[56,-3],[59,12],[43,12]],gold,a,1.7);line([[-35,12],[28,12]],gold,a,1.7);line([[-12,-24],[-24,-10],[34,-10],[19,-24],[-12,-24]],color,a,1.4,true);line([[6,-24],[6,-10]],gold,a*.6);oval(-35,12,9,9,gold,a);oval(36,12,9,9,gold,a);for(let side of [-1,1])oval(side*35,12,4,4,color,a);line([[53,0],[58,0]],color,a,3);});
 if(pick>0&&depart<.5){const yy=-48+68*pick;box(-10,yy-15,20,30,color,a*Math.sin(pick*PI));}
 for(let j=0;j<3;j++)line([[-120,45+j*8],[-70+depart*45,45+j*8]],color,a*depart*.45);
}else if(id==='bh14'){
 // A declared type seal is impressed on a selected fan of hand cards.
 const fan=ease(seg(t,.08,.4)),stamp=ease(seg(t,.3,.65));
 for(let j=0;j<4;j++){const xx=(j-1.5)*48*fan;at(xx,34,(j-1.5)*.13,()=>{box(-19,-27,38,54,gold,a);if(stamp>.2){const r=11*stamp;line([[0,-r],[r,r],[-r,r],[0,-r]],color,a*stamp,1.7,true);}});}
 at(0,-65+30*stamp,0,()=>{line([[-13,-16],[13,-16],[9,3],[27,13],[27,21],[-27,21],[-27,13],[-9,3],[-13,-16]],gold,a,1.8,true);oval(0,-17,13,5,color,a);});
 for(let j=0;j<4;j++)curve(v=>[(j-1.5)*48*v,-14+v*48],stamp,color,a*stamp*.45);
 for(const side of [-1,1])for(let j=0;j<5;j++)oval(side*(93+Math.sin(j*.45)*6),27-j*16,9,3,color,a*.55,side*-.65);
}else if(id==='61'){
 // A symbolic shot into field center; no hand or field card geometry required.
 const shot=ease(seg(t,.04,.27)),main=ease(seg(t,.22,.43)),split=ease(seg(t,.42,.7));
 function target(xx,yy,r,alpha,width=1.6){
   oval(xx,yy,r,r,color,alpha);
   oval(xx,yy,r*.72,r*.72,gold,alpha*.4);
   for(const side of [-1,1]){
     line([[xx+side*(r+7),yy],[xx+side*(r-6),yy]],gold,alpha,width);
     line([[xx,yy+side*(r+7)],[xx,yy+side*(r-6)]],gold,alpha,width);
   }
 }
 if(shot>0)line([[-135,76],[-135+135*shot,76-76*shot]],'#fff0d2',a*(1-seg(t,.3,.5)),2.8);
 if(main>0)target(0,0,34*main,a*main,2.1);
 const ends=[[0,-91],[-109,57],[109,57]];
 for(let j=0;j<ends.length;j++){
   const [xx,yy]=ends[j],distance=Math.hypot(xx,yy),ux=xx/distance,uy=yy/distance;
   const grow=ease(seg(t,.42+j*.045,.66+j*.045));
   const start=40,end=distance-17;
   if(grow>0){const rr=start+(end-start)*grow;line([[ux*start,uy*start],[ux*rr,uy*rr]],color,a*split,1.15);}
   const lock=ease(seg(t,.61+j*.035,.76+j*.035));
   if(lock>0)target(xx,yy,16*lock,a*lock,1.15);
 }
 if(main>0&&main<1)oval(0,0,8+main*41,8+main*41,gold,a*(1-main));
}else if(id==='13'){
 // A charter is signed by a luminous pen stroke; two folded orders peel away.
 const sign=ease(seg(t,.06,.4)),fold=ease(seg(t,.37,.79));
 at(0,0,-.08,()=>{box(-45,-66,90,123,gold,a);line([[-34,-51],[26,-51]],color,a*.6);for(let j=0;j<4;j++)line([[-31,-34+j*12],[33,-34+j*12]],gold,a*.35);curve(v=>[-29+v*58,25+Math.sin(v*PI*5)*8],sign,color,a,2);});
 for(const side of [-1,1])at(side*90*fold,-24*fold,side*fold*.12,()=>{line([[-21,-18],[21,-18],[21,18],[-21,18]],gold,a*fold,1.5,true);line([[-21,-18],[0,1],[21,-18]],color,a*fold);line([[-21,18],[0,1],[21,18]],gold,a*fold*.5);});
}else if(id==='56'){
 // A blade cuts a spell sigil across its center; both halves recoil.
 const cut=ease(seg(t,.24,.62));
 for(const side of [-1,1])at(side*24*cut,side*12*cut,side*.2*cut,()=>{curve(v=>{const z=(side===1?-PI/2:PI/2)+v*PI;return[Math.cos(z)*54,Math.sin(z)*54]},1,color,a,2.4);line([[0,-54],[side*37,-19],[side*37,19],[0,54]],gold,a*.8,1.8);});
 at(-112+224*cut,-88+176*cut,-.68,()=>{line([[0,44],[-6,-41],[6,-41],[0,44]],'#d5e5ff',a*(1-seg(t,.65,.85)),2.7);line([[-21,-37],[21,-37]],gold,a,2.5);line([[0,-37],[0,-62]],color,a,3);});
 for(let j=0;j<6;j++){const z=j*TAU/6,rr=65+cut*26;line([[Math.cos(z)*rr,Math.sin(z)*rr],[Math.cos(z)*(rr+10),Math.sin(z)*(rr+10)]],gold,a*cut*(1-cut)*4,2);}
}else if(id==='bh05'){
 // A paper silhouette unfolds into a pair of matching identities.
 const unfold=ease(seg(t,.17,.73));
 for(const side of [-1,1])at(side*62*unfold,0,side*.09*unfold,()=>{line([[-29,-46],[29,-46],[29,46],[-29,46],[-29,-46]],gold,a,2.2);oval(0,-13,11,13,color,a);curve(v=>[-19+38*v,27-Math.sin(v*PI)*19],q,color,a,2.4);line([[-20,35],[20,35]],gold,a*.6);});
 line([[0,-62],[0,62]],color,a*(1-unfold),2.5);
}else if(id==='bh13'){
 // Three investments return as gold-edged cards in a closing portfolio.
 const deposit=ease(seg(t,.2,.75));
 line([[-74,17],[-74,68],[74,68],[74,17],[-74,17]],gold,a,2.4);line([[-24,17],[-24,3],[24,3],[24,17]],color,a,2);
 for(let j=0;j<3;j++){const p=ease(seg(t,.06+j*.11,.49+j*.12)),xx=(j-1)*78*(1-p),yy=-68+107*p;at(xx,yy,(j-1)*.2*(1-p),()=>{box(-18,-26,36,52,gold,a*(1-p));line([[-8,-9],[9,-9],[-2,11]],color,a*(1-p),2.6);});}
 line([[-74,17],[-48,44],[48,44],[74,17]],color,a*deposit,2);box(-9,38,18,14,gold,a*deposit);
 for(let j=0;j<3;j++)star((j-1)*49,-20,6,color,a*deposit);
}else if(id==='bh21'){
 const mode=2,rise=ease(seg(t,.05,.6)),sunX=mode===1?45:mode===2?-45:0,sunY=-24-39*rise;
 oval(sunX,sunY,mode===3?31:25,mode===3?31:25,'#ffd18c',a);
 if(mode===2)for(let j=0;j<10;j++){const z=j*TAU/10;line([[sunX+Math.cos(z)*34,sunY+Math.sin(z)*34],[sunX+Math.cos(z)*41,sunY+Math.sin(z)*41]],gold,a*rise,1.6);}
 const levels=mode===1?3:4;
 for(let j=0;j<levels;j++){
 const sweep=ease(seg(t,.04+j*.08,.5+j*.08));
 curve(v=>[-139+278*v,28+j*19-Math.sin(v*PI+(j%2)*.95)*29+Math.sin(v*TAU+j+mode)*8],sweep,j%2?color:gold,a,2.1);
 if(mode===3)curve(v=>[-130+260*v,34+j*19-Math.sin(v*PI+(j%2)*.95)*29+Math.sin(v*TAU+j+mode)*8],sweep,color,a*.35,1);
 }
}else if(id==='38'){
 const mode=1,build=ease(seg(t,.13,.62));
 at(0,-4,0,()=>{
 if(mode===1)burger((1-build)*1.5);
 if(mode===2){burger(0,ease(seg(t,.45,.76)));for(let j=0;j<6;j++){const p=seg(t,.45,.8);const xx=75+Math.sin(j*3)*p*27,yy=-25+j*8+p*21;line([[xx,yy],[xx+4,yy+3]],gold,a*Math.sin(p*PI),2);}}
 if(mode===3){const open=ease(seg(t,.13,.56));line([[-71,68],[-100*open,17],[0,56],[100*open,17],[71,68],[-71,68]],'#c8dbe8',a,2);ctx.save();ctx.translate(0,42*(1-build));ctx.scale(.82,.82);burger(0);ctx.restore();}
 });
 if(mode!==2)for(let j=0;j<4;j++){const z=PI*1.12+j*.25;line([[Math.cos(z)*90,Math.sin(z)*100],[Math.cos(z)*103,Math.sin(z)*113]],gold,a*build,2);}
}else if(id==='bh22'){
 const mode=1,heal=ease(seg(t,.28,.7));
 if(mode===1){
   curve(v=>[Math.cos(v*PI)*67,-9+Math.sin(v*PI)*62],q,color,a,2.5);curve(v=>[Math.cos(v*PI)*67,-9+Math.sin(v*PI)*43],q,gold,a,1.8);cross(0,-30,46*heal);
 }else if(mode===2){
   curve(v=>{const z=v*TAU;return[Math.pow(Math.sin(z),3)*64,-5-(13*Math.cos(z)-5*Math.cos(2*z)-2*Math.cos(3*z)-Math.cos(4*z))*4]},q,color,a,2.2);cross(0,-5,20*heal);
 }else{
   line([[-51,-56],[51,-56],[47,22],[0,64],[-47,22],[-51,-56]],color,a,2.3);cross(0,-7,26*heal);oval(0,-7,38,38,gold,a*heal*.5);
 }
 for(let j=0;j<3;j++)curve(v=>[-124+248*v,82+j*7+Math.sin(v*TAU-t*2)*4],q,j%2?gold:color,a*.55,1.6);
 for(let j=0;j<3;j++){const p=seg(t,.4+j*.07,.74+j*.07);line([[(j-1)*60,58-40*p],[(j-1)*60,48-40*p]],'#b7efd5',a*Math.sin(p*PI),2);}
}else if(id==='87'){
 // Only a five-line staff and notes; the phrase writes from left to right.
 const write=ease(seg(t,.05,.55));
 for(let j=0;j<5;j++)line([[-138,(j-2)*15],[-138+276*write,(j-2)*15]],gold,a*.8,1.7);
 for(let j=0;j<7;j++){const p=ease(seg(t,.15+j*.065,.36+j*.06)),xx=-109+j*35,yy=[15,0,-15,0,15,-15,-30][j],bounce=seg(t,.36+j*.035,.78+j*.012),lift=bounce<.67?Math.sin(bounce/.67*PI)*38:Math.sin((bounce-.67)/.33*PI)*13;
 at(xx,yy-lift,Math.sin(bounce*TAU)*.1,()=>{oval(-5,0,7*p,5*p,j%2?color:gold,a*p,-.3);line([[2,0],[2,-35*p]],color,a*p,2.2);if(j%3!==1)line([[2,-35*p],[14,-28*p],[13,-18*p]],gold,a*p,2);});}
}else if(id==='67'){
 // A rebuttal erases the incoming statement, leaving no words to resolve.
 const erase=ease(seg(t,.3,.73)),collapse=ease(seg(t,.7,.92));
 at(0,0,0,()=>{line([[-100,-56],[100,-56],[100,37],[15,37],[-15,65],[-15,37],[-100,37],[-100,-56]],gold,a*(1-collapse),2.2);
 for(let j=0;j<3;j++){const start=-72+erase*150,end=72-j*15;if(start<end)line([[start,-30+j*20],[end,-30+j*20]],color,a*(1-collapse),2.7);}
 });
 at(-96+190*erase,-8,-.2,()=>{box(-15,-48,30,82,color,a*(1-collapse));line([[-15,17],[15,17]],gold,a,2);});
 for(let j=0;j<12;j++){const p=seg(t,.3+j*.025,.64+j*.02);line([[-75+j*13,-4+Math.sin(j*4)*28+23*p],[-72+j*13,-1+Math.sin(j*4)*28+23*p]],color,a*Math.sin(p*PI),1.5);}
 line([[-57,10],[57,10]],'#ffd3c5',a*collapse,2.7);
}else if(id==='14'){
 const mode=3,repel=ease(seg(t,.25,.72));
 line([[-29,-41],[29,-41],[26,18],[0,47],[-26,18],[-29,-41]],gold,a,2.5);
 for(let j=0;j<4;j++){const z=j*PI/2+PI/4,rr=68+42*repel;at(Math.cos(z)*rr,Math.sin(z)*rr*.65,z,()=>box(-11,-16,22,32,color,a*(1-repel*.8)));}
 if(mode===1){curve(v=>{const z=-PI*.8+v*TAU*repel;return[Math.cos(z)*74,Math.sin(z)*58]},1,'#ffc4ad',a,2.5);const z=-PI*.8+TAU*repel;spear(Math.cos(z)*74,Math.sin(z)*58,z);}
 if(mode===2){for(const side of [-1,1]){curve(v=>{const z=-PI/2+side*v*PI*repel;return[Math.cos(z)*77,Math.sin(z)*63]},1,color,a,2.5);const z=-PI/2+side*PI*repel;spear(Math.cos(z)*77,Math.sin(z)*63,z+(side===1?0:PI));}}
 if(mode===3){spear(0,-82+106*repel,0);oval(0,20,20+91*repel,12+57*repel,color,a*repel*(1-repel)*3);for(let j=0;j<4;j++){const z=j*PI/2+PI/4;line([[Math.cos(z)*49,20+Math.sin(z)*35],[Math.cos(z)*(49+55*repel),20+Math.sin(z)*(35+35*repel)]],color,a*repel,2.3);const ex=Math.cos(z)*(49+55*repel),ey=20+Math.sin(z)*(35+35*repel);at(ex,ey,z+PI/2,()=>line([[0,-10],[-5,3],[0,0],[5,3],[0,-10]],gold,a*repel,1.8));}}
}else if(id==='bh09'){
 const mode=1,repel=ease(seg(t,.25,.72));
 line([[-29,-41],[29,-41],[26,18],[0,47],[-26,18],[-29,-41]],gold,a,2.5);
 for(let j=0;j<4;j++){const z=j*PI/2+PI/4,rr=68+42*repel;at(Math.cos(z)*rr,Math.sin(z)*rr*.65,z,()=>box(-11,-16,22,32,color,a*(1-repel*.8)));}
 if(mode===1){curve(v=>{const z=-PI*.8+v*TAU*repel;return[Math.cos(z)*74,Math.sin(z)*58]},1,'#ffc4ad',a,2.5);const z=-PI*.8+TAU*repel;spear(Math.cos(z)*74,Math.sin(z)*58,z);}
 if(mode===2){for(const side of [-1,1]){curve(v=>{const z=-PI/2+side*v*PI*repel;return[Math.cos(z)*77,Math.sin(z)*63]},1,color,a,2.5);const z=-PI/2+side*PI*repel;spear(Math.cos(z)*77,Math.sin(z)*63,z+(side===1?0:PI));}}
 if(mode===3){spear(0,-82+106*repel,0);oval(0,20,20+91*repel,12+57*repel,color,a*repel*(1-repel)*3);for(let j=0;j<4;j++){const z=j*PI/2+PI/4;line([[Math.cos(z)*49,20+Math.sin(z)*35],[Math.cos(z)*(49+55*repel),20+Math.sin(z)*(35+35*repel)]],color,a*repel,2.3);}}
}else if(id==='66'){
 const seal=ease(seg(t,.17,.65));
 for(let j=0;j<3;j++){const xx=(j-1)*76,p=ease(seg(t,.25+j*.1,.52+j*.1));at(xx,26,0,()=>{box(-24,-32,48,64,gold,a);oval(0,0,15,15,color,a*p);line([[-8,0],[0,-9],[8,0],[0,9],[-8,0]],color,a*p,2);});}
 at(-78+156*seal,-60+18*Math.sin(seal*PI),0,()=>{box(-21,0,42,13,gold,a);line([[-8,0],[-8,-22],[8,-22],[8,0]],color,a,2);oval(0,-28,13,8,gold,a);});
}else if(id==='bh19'){
 const fill=ease(seg(t,.13,.68));
 for(const side of [-1,1]){box(side*46-25,-49,50,99,gold,a);box(side*46-11,-59,22,10,color,a);for(let j=0;j<5;j++){const p=ease(seg(t,.14+j*.07,.42+j*.07));line([[side*46-16,35-j*17],[side*46-16+32*p,35-j*17]],color,a*p,6);}}
 line([[-14,-9],[0,-23],[14,-9],[0,-9],[0,30]],gold,a*fill,3);
 for(const side of [-1,1])line([[side*88,24],[side*101,0],[side*91,0],[side*105,-24]],color,a*fill,2.5);
}else if(id==='bh01'){
 const travel=ease(seg(t,.13,.77)),xx=-55+110*travel,yy=21-Math.sin(travel*PI)*12;
 at(xx,yy,Math.sin(t*9)*.05,()=>{line([[-44,3],[44,3],[28,26],[-28,26],[-44,3]],gold,a,2.5);line([[0,3],[0,-84]],gold,a,2.4);line([[6,-76],[39,-5],[6,-5],[6,-76]],color,a,2.3);line([[-7,-62],[-32,-6],[-7,-6]],gold,a,1.8);});
 for(let j=0;j<3;j++)curve(v=>[-138+276*v,68+j*9+Math.sin(v*TAU-t*3+j)*5],q,color,a*.6,1.6);
 const sunY=-69-8*Math.sin(t*PI),radius=23+1.5*Math.sin(t*TAU);
 oval(-101,sunY,radius,radius,gold,a);oval(-101,sunY,radius+6,radius+6,gold,a*.2*(.6+.4*Math.sin(t*PI)));
 for(let j=0;j<3;j++){const bx=52+j*32+6*Math.sin(t*PI),by=-108+j%2*10+2*Math.sin(t*TAU+j),flap=.4+.35*Math.sin(t*TAU*2+j*.7);curve(v=>[bx-10+10*v,by-Math.sin(v*PI)*6*flap],1,color,a,1.6);curve(v=>[bx+10*v,by-Math.sin(v*PI)*6*flap],1,color,a,1.6);}
}else if(id==='bh20'){
 const enter=ease(seg(t,.06,.38)),lift=ease(seg(t,.4,.8));
 eagle(0,13-21*lift+Math.sin(t*TAU*2)*6,.72,0);
 for(const side of [-1,1])eagle(side*(142-18*enter),-27-21*lift+Math.sin(t*TAU*2+side)*9,.32,side*.7);
}
ctx.restore();
}
window.FateApprovedActivationArt={handles:id=>String(id)==='bh15'||names.some(n=>n[0]===String(id)),draw};
})();

