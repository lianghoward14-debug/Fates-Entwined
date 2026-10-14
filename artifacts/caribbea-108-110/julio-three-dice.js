(function(){'use strict';
const names={109:['Triple Tumble','Orbit of Fortune','Three from the Cup']};
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

 if(v===2){
  const lift=ease(seg(.34,.58));
  c.save();c.translate(-96-24*lift,-50-40*lift);c.rotate((t<.34?Math.sin(t*90)*.12:0)-lift*.9);
  const opacity=a*(1-seg(.5,.63));
  line([[-25,-35],[25,-35],[33,29],[-33,29],[-25,-35]],gold,opacity,2);ring(0,-35,25,6,gold,opacity);c.restore();
 }
 for(let i=0;i<3;i++){
  const end=.59+i*.075,start=v===2?.34+i*.045:.06+i*.055;
  const raw=clamp((t-start)/(end-start)),p=ease(raw),target=(i-1)*87;
  let x,y,rot;
  if(v===0){x=target+(i===1?105:-100)*(1-p);y=22-(75+i*15)*Math.abs(Math.sin(raw*pi*2))*(1-raw);rot=(1-p)*pi*(i===1?-3:3);}
  else if(v===1){const angle=i*pi*2/3+(1-p)*pi*2;const radius=110*(1-p);x=target*p+Math.cos(angle)*radius;y=22*p+Math.sin(angle)*radius;rot=(1-p)*pi*3;}
  else{x=-90+(target+90)*p;y=-35+57*p-65*Math.sin(raw*pi);rot=(1-p)*pi*(2+i*.4);}
  if(t>=start)die(x,y,rot,26,t<end?1+Math.floor(t*25+i*2)%6:6,7);
  if(t>end)shine(target,22,seg(end,end+.18));
 }
 c.restore();
}
window.FateCaribbeaActivationArt={names,draw};
})();
