(function(){'use strict';
const names={109:['The Rolling Six','Double Down','The Dice Cup']};
function draw(c,id,t,w=700,h=430,v=0){
 t=Math.max(0,Math.min(1,t));
 const clamp=x=>Math.max(0,Math.min(1,x)),seg=(a,b)=>clamp((t-a)/(b-a)),ease=x=>1-(1-clamp(x))**3,pi=Math.PI;
 const a=ease(seg(0,.1))*(1-ease(seg(.88,1))),gold='#edc56d',blue='#90bfde';
 c.clearRect(0,0,w,h);c.save();c.translate(w/2,h/2);c.scale(Math.min(w/390,h/290),Math.min(w/390,h/290));
 function line(p,col=gold,alpha=a,width=1.6){c.save();c.strokeStyle=col;c.lineWidth=width;c.lineJoin='round';c.lineCap='round';c.globalAlpha=alpha;c.shadowColor=col;c.shadowBlur=6;c.beginPath();p.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.stroke();c.shadowBlur=0;c.lineWidth=.7;c.stroke();c.restore();}
 function ring(x,y,rx,ry,col=blue,alpha=a){line(Array.from({length:49},(_,i)=>[x+Math.cos(i*pi/24)*rx,y+Math.sin(i*pi/24)*ry]),col,alpha);}
 const dots={1:[[0,0]],2:[[-.45,-.45],[.45,.45]],3:[[-.45,-.45],[0,0],[.45,.45]],4:[[-.45,-.45],[.45,-.45],[-.45,.45],[.45,.45]],5:[[-.45,-.45],[.45,-.45],[0,0],[-.45,.45],[.45,.45]],6:[[-.45,-.48],[.45,-.48],[-.45,0],[.45,0],[-.45,.48],[.45,.48]]};
 function die(x,y,r,s,n,depth=10){c.save();c.translate(x,y);c.rotate(r);line([[-s,-s],[s,-s],[s,s],[-s,s],[-s,-s]],gold,a,2);line([[-s,-s],[-s+depth,-s-depth],[s+depth,-s-depth],[s,-s]],blue);line([[s+depth,-s-depth],[s+depth,s-depth],[s,s]],blue);for(const [dx,dy] of dots[n])ring(dx*s,dy*s,s*.085,s*.085,blue);c.restore();}
 function shine(x,y,p){for(let j=0;j<8;j++){const z=j*pi/4,r=35+45*ease(p);line([[x+Math.cos(z)*r,y+Math.sin(z)*r],[x+Math.cos(z)*(r+9),y+Math.sin(z)*(r+9)]],gold,a*Math.sin(p*pi));}}
 line([[-138,78],[138,78]],blue,a*.28);
 if(v===0){
  const p=ease(seg(.08,.67)),x=-112+112*p;
  const bounce=t<.38?42*Math.abs(Math.sin(seg(.08,.38)*pi)):t<.56?19*Math.sin(seg(.38,.56)*pi):9*Math.sin(seg(.56,.67)*pi);
  die(x,24-bounce,(1-p)*-pi*2.25,43,t<.67?1+Math.floor(t*19)%6:6);
  if(t>.67){ring(0,76,29+63*seg(.67,.87),6,blue,a*(1-seg(.67,.88)));shine(0,20,seg(.67,.9));}
 }else if(v===1){
  const p=ease(seg(.06,.59)),q=ease(seg(.13,.71));
  die(-126+77*p,28-74*Math.sin(p*pi),(1-p)*pi*2,31,t<.59?1+Math.floor(t*21)%6:6,8);
  die(127-78*q,28-102*Math.sin(q*pi),-(1-q)*pi*2,31,t<.71?1+Math.floor(t*23+2)%6:6,8);
  if(t>.59)shine(-49,28,seg(.59,.82));if(t>.71)shine(49,28,seg(.71,.94));
 }else{
  const shake=t<.4?Math.sin(t*76)*.1*(1-seg(.32,.4)):0,lift=ease(seg(.4,.64));
  c.save();c.translate(-50-28*lift,-3-64*lift);c.rotate(shake-.7*lift);
  line([[-30,-48],[30,-48],[40,35],[-40,35],[-30,-48]],gold,a*(1-seg(.67,.84)),2);ring(0,-48,30,7,gold,a*(1-seg(.67,.84)));line([[-22,-30],[-28,23]],blue,a*.5);c.restore();
  if(t>.4){const p=ease(seg(.4,.74));die(-34+105*p,36-49*Math.sin(p*pi),(1-p)*-pi*1.6,32,t<.74?1+Math.floor(t*25)%6:6,8);}
  if(t>.74)shine(71,36,seg(.74,.95));
 }
 c.restore();
}
window.FateCaribbeaActivationArt={names,draw};
})();
