(function(){'use strict';
const names={108:['Homeward Star','Pear Constellation','A New Hand'],109:['Gilded Crown','Loaded Fortune','Scales of Power'],110:['The Morning Catch','Cast the Net','Harbor Tide']};
const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>1-(1-clamp(x))**3;
function draw(ctx,id,t,w=700,h=430,variant=0){
  if(String(id)==='109'&&window.FateJulioDiceArt)return window.FateJulioDiceArt.draw(ctx,id,t,w,h,2);
  id=String(id);if(['108','110'].includes(id)&&window.FateCaribbeaSelectedArt)return window.FateCaribbeaSelectedArt.draw(ctx,id,t,w,h,2);if(!names[id])return;
  const seg=(a,b)=>clamp((t-a)/(b-a)),a=ease(seg(0,.12))*(1-ease(seg(.82,1)));
  const colors={108:['#c7a8ed','#f3dfab'],109:['#8dbbdf','#e8c267'],110:['#8bd2cf','#e6c394']};
  const [ink,gold]=colors[id],pi=Math.PI,tau=pi*2;
  ctx.clearRect(0,0,w,h);ctx.save();ctx.translate(w/2,h/2);ctx.scale(Math.min(w/390,h/290),Math.min(w/390,h/290));
  function line(points,color=ink,alpha=a,width=1.6){ctx.save();ctx.strokeStyle=color;ctx.globalAlpha=alpha;ctx.lineWidth=width;ctx.lineJoin='round';ctx.lineCap='round';ctx.shadowColor=color;ctx.shadowBlur=7;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.stroke();ctx.shadowBlur=0;ctx.lineWidth=.65;ctx.stroke();ctx.restore();}
  function curve(fn,p=1,col=ink,alpha=a){line(Array.from({length:61},(_,j)=>fn(j/60*p)),col,alpha);}
  function ring(x,y,rx,ry,col=ink,alpha=a){curve(v=>[x+Math.cos(v*tau)*rx,y+Math.sin(v*tau)*ry],1,col,alpha);}
  function at(x,y,r,fn){ctx.save();ctx.translate(x,y);ctx.rotate(r);fn();ctx.restore();}
  function star(x,y,r,col=gold,alpha=a){const pts=[];for(let j=0;j<=8;j++){const z=-pi/2+j*pi/4,rr=j%2?r*.27:r;pts.push([x+Math.cos(z)*rr,y+Math.sin(z)*rr]);}line(pts,col,alpha);}
  function burst(x,y,p){for(let j=0;j<12;j++){const z=j*2.4,r=20+65*ease(p);star(x+Math.cos(z)*r,y+Math.sin(z)*r,2.8,gold,a*Math.sin(p*pi));}}
  function card(x,y,r,s=1,alpha=a){at(x,y,r,()=>{ctx.save();ctx.scale(s,s);line([[-20,-29],[20,-29],[20,29],[-20,29],[-20,-29]],ink,alpha);star(0,0,11,gold,alpha);ctx.restore();});}
  function crown(p){line([[-61,20],[-70,-32],[-32,-8],[0,-54],[32,-8],[70,-32],[61,20],[-61,20]],gold,a*p,2.2);line([[-59,30],[59,30]],ink,a*p,2);for(let j=-1;j<=1;j++)ring(j*35,13,3,4,gold,a*p);}
  function coin(x,y,p=1){ring(x,y,13*Math.max(.13,Math.abs(Math.cos(p*pi*2))),13,gold);line([[x,y-6],[x,y+6]],gold);}
  function fish(x,y,r,s=1,alpha=a){at(x,y,r,()=>{ctx.save();ctx.scale(s,s);curve(v=>[-25+50*v,-Math.sin(v*pi)*14],1,ink,alpha);curve(v=>[-25+50*v,Math.sin(v*pi)*14],1,ink,alpha);line([[-25,0],[-39,-13],[-35,0],[-39,13],[-25,0]],gold,alpha);ring(13,-3,2,2,gold,alpha);curve(v=>[3+Math.sin(v*pi)*4,-10+20*v],1,gold,alpha);ctx.restore();});}
  function waves(y,p=1){for(let j=0;j<3;j++)curve(v=>[-130+260*v,y+j*10+Math.sin(v*tau*2-t*7+j)*4],p,ink,a*(.7-j*.15));}
  if(id==='108'){
    if(variant===0){const p=ease(seg(.05,.57));curve(v=>[-128+128*v,-64+64*v*v],p,ink,a*.7);star(-128+128*p,-64+64*p*p,10+14*p);for(let j=0;j<5;j++){const q=ease(seg(.38+j*.045,.69+j*.025));card((j-2)*43*q,48+Math.abs(j-2)*6,(j-2)*.12,.66,a*q);}burst(0,0,seg(.5,.85));}
    if(variant===1){const p=ease(seg(.07,.56));curve(v=>{const z=v*tau;return[Math.sin(z)*(26+15*(1+Math.cos(z))),-Math.cos(z)*48+8];},p,gold);curve(v=>[4+v*21,-40-19*Math.sin(v*pi)],ease(seg(.24,.6)));line([[0,-41],[4,-59]],gold,a*p);for(let j=0;j<5;j++){const z=j*tau/5-pi/2,q=ease(seg(.3+j*.04,.66+j*.025));star(Math.cos(z)*93,Math.sin(z)*86,6,gold,a*q);curve(v=>[Math.cos(z)*93*(1-v),Math.sin(z)*86*(1-v)],q,ink,a*.23);}burst(0,4,seg(.61,.9));}
    if(variant===2){const out=ease(seg(.04,.34)),arrive=ease(seg(.35,.77));for(let j=0;j<5;j++){card((j-2)*25-100*out,20+65*out,(j-2)*.1-out*.7,.65,a*(1-out));card((j-2)*49*arrive,20-15*Math.sin(arrive*pi), (j-2)*.12,.76,a*arrive);}star(0,-65,22*arrive);curve(v=>[-115+230*v,-51-22*Math.sin(v*pi)],arrive,gold,a*.5);}
  }else if(id==='109'){
    if(variant===0){const p=ease(seg(.12,.52));at(0,-18+30*(1-p),0,()=>crown(p));for(let j=0;j<5;j++){const q=ease(seg(.32+j*.06,.58+j*.06));coin((j-2)*35,70-24*q,q);}burst(0,-25,seg(.55,.9));}
    if(variant===1){const p=ease(seg(.07,.62));at(0,0,(1-p)*pi*1.4,()=>{const s=.35+.65*p;ctx.save();ctx.scale(s,s);line([[-48,-48],[48,-48],[48,48],[-48,48],[-48,-48]],gold,a,2.2);for(const x of [-24,24])for(const y of [-26,0,26])ring(x,y,4,4,ink);ctx.restore();});for(let j=0;j<3;j++){const q=ease(seg(.43+j*.08,.73+j*.045));coin((j-1)*64,83-15*q,q);}burst(0,0,seg(.59,.92));}
    if(variant===2){const p=ease(seg(.05,.45)),tilt=.27*ease(seg(.36,.72));line([[0,75],[0,-64]],gold,a*p,2);line([[-45,77],[45,77]],gold,a*p);at(0,-40,tilt,()=>{line([[-94,0],[94,0]],gold,a*p,2);for(const side of [-1,1]){line([[side*81,0],[side*81-25,63],[side*81+25,63],[side*81,0]],ink,a*p);curve(v=>[side*81-25+50*v,63+Math.sin(v*pi)*13],1,gold,a*p);if(side===1)coin(side*81,48,p);}});star(0,-79,9,gold,a*p);}
  }else{
    if(variant===0){const p=ease(seg(.08,.7));line([[-63,42],[-48,81],[48,81],[63,42],[-63,42]],gold);for(let j=-2;j<=2;j++)line([[j*20,44],[j*15,79]],gold,a*.6);for(let j=0;j<3;j++){const q=ease(seg(.1+j*.12,.52+j*.11));fish(-113+139*q,34-Math.sin(q*pi)*103+j*8,-.55+q*1.3,.7,a*(1-ease(clamp((q-.9)*10))));}waves(101,p);}
    if(variant===1){const p=ease(seg(.06,.56));ring(0,0,96*p,63*p,gold);for(let j=-3;j<=3;j++){const x=j*23,yy=63*Math.sqrt(Math.max(0,1-(x/96)**2));line([[x*p,-yy*p],[x*p,yy*p]],ink,a*.45);const y=j*15,xx=96*Math.sqrt(Math.max(0,1-(y/63)**2));line([[-xx*p,y*p],[xx*p,y*p]],ink,a*.45);}fish(-37+15*p,-15,-.2,.7);fish(37-15*p,23,pi+.2,.7);curve(v=>[96+v*40,Math.sin(v*pi)*20],p,gold);burst(0,0,seg(.6,.93));}
    if(variant===2){const p=ease(seg(.08,.79));waves(56,p);for(let j=0;j<3;j++){const q=ease(seg(.05+j*.12,.5+j*.12));fish(-133+240*q,-16-j*24+Math.sin(q*tau)*7,.08*Math.sin(t*8+j),.75,a*Math.sin(q*pi));}star(-88,-85,14);curve(v=>[-116+45*v,-86+Math.sin(v*pi)*9],p,gold,a*.5);}
  }
  ctx.restore();
}
window.FateCaribbeaActivationArt={draw,names,handles:id=>!!names[String(id)],selected:{108:0,109:0,110:0}};
})();
