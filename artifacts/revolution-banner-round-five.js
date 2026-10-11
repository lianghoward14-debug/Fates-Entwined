(function(){
'use strict';
const titles=[['Palms of Caribbea — twin sunrise','Palms of Caribbea — island arch','Palms of Caribbea — sea breeze']];
function draw(c,r,v,t,w=700,h=430){
 const cl=x=>Math.max(0,Math.min(1,x)),seg=(a,b)=>cl((t-a)/(b-a)),ease=x=>1-(1-cl(x))**3,TAU=Math.PI*2;
 const a=ease(seg(0,.18))*(1-ease(seg(.8,1))),u=ease(seg(.08,.62)),col=['#8fc9dd','#d4b47b','#baa7d9'][r],gold='#efd29a';
 c.clearRect(0,0,w,h);c.save();c.translate(w/2,h/2);c.scale(Math.min(w/460,h/300),Math.min(w/460,h/300));
 function line(p,color=col,alpha=a,width=1.5){c.save();c.beginPath();p.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.strokeStyle=color;c.globalAlpha=cl(alpha*.34);c.lineWidth=width+4;c.shadowColor=color;c.shadowBlur=7;c.stroke();c.globalAlpha=cl(alpha*1.2);c.lineWidth=width;c.shadowBlur=0;c.stroke();c.restore()}
 function curve(fn,q=1,color=col,alpha=a,width=1.5){line(Array.from({length:61},(_,i)=>fn(q*i/60)),color,alpha,width)}
 function ring(x,y,rx,ry=rx,color=col,alpha=a){curve(z=>[x+Math.cos(z*TAU)*rx,y+Math.sin(z*TAU)*ry],1,color,alpha)}
 function star(x,y,s=5,alpha=a){line([[x-s,y],[x+s,y]],gold,alpha);line([[x,y-s],[x,y+s]],gold,alpha)}
 function box(x,y,alpha=a){line([[x-15,y-22],[x+15,y-22],[x+15,y+22],[x-15,y+22],[x-15,y-22]],col,alpha);star(x,y,5,alpha)}
 function burst(x,y,p){for(let i=0;i<16;i++){const z=i*2.4,d=70*ease(p);line([[x+Math.cos(z)*d,y+Math.sin(z)*d],[x+Math.cos(z)*(d+5),y+Math.sin(z)*(d+5)]],gold,a*Math.sin(p*Math.PI))}}
 function sun(x,y,rad){ring(x,y,rad,rad,gold);for(let i=0;i<12;i++){const z=i*TAU/12;line([[x+Math.cos(z)*(rad+9),y+Math.sin(z)*(rad+9)],[x+Math.cos(z)*(rad+20),y+Math.sin(z)*(rad+20)]],col)}}
 function flag(x,y,q,scale=1){c.save();c.translate(x,y);c.scale(scale,scale);line([[0,65],[0,65-145*q]],gold);const yy=65-145*q;if(q>.01){curve(z=>[z*67,yy+Math.sin(z*6-t*8)*5],1);curve(z=>[z*67,yy+41+Math.sin(z*6-t*8)*5],1);line([[67,yy+Math.sin(6-t*8)*5],[67,yy+41+Math.sin(6-t*8)*5]])}c.restore()}
 function palmTree(side,baseX,baseY,height,lean,delay){
  const q=ease(seg(.05+delay,.47+delay)),leaf=ease(seg(.25+delay,.66+delay));
  const tx=side*(baseX-lean),ty=baseY-height;
  curve(z=>[side*(baseX-lean*z*z),baseY-height*z],q,gold,a,1.7);
  for(const dir of [-1,1])for(let j=0;j<3;j++){
   const width=43-j*6,dy=-19+j*16;
   curve(z=>[tx+dir*width*z*leaf,ty+(dy*z+26*z*z)*leaf],1,col,a*leaf);
  }
  for(let j=0;j<2;j++)ring(tx+(j?4:-4),ty+6,3,4,gold,a*leaf);
 }
 function sea(y,span){for(let j=0;j<3;j++)curve(z=>[-span+2*span*z,y+j*11+Math.sin(z*TAU*2-t*4+j*.5)*2.4],1,col,a*(.7-j*.18))}
 if(v===0){
  // Balanced palms grow first; a complete sun lifts between them.
  palmTree(-1,77,58,109,15,0);palmTree(1,77,58,109,15,.04);
  const q=ease(seg(.24,.7)),y=23-48*q;
  ring(0,y,22,22,gold,a*q);
  for(let j=0;j<12;j++){const z=j*TAU/12;line([[Math.cos(z)*30,y+Math.sin(z)*30],[Math.cos(z)*(30+9*q),y+Math.sin(z)*(30+9*q)]],col,a*q)}
  sea(70,109);curve(z=>[-93+186*z,59-6*Math.sin(z*Math.PI)],u,gold,a*.55);
 }
 if(v===1){
  // Taller, inward-curving palms form an arch around the radiant sun.
  palmTree(-1,92,75,138,35,0);palmTree(1,92,75,138,35,.06);
  const q=ease(seg(.22,.68));c.save();c.translate(0,-24);c.scale(.4+.6*q,.4+.6*q);sun(0,0,26);c.restore();
  const arc=ease(seg(.48,.77));curve(z=>[Math.cos(Math.PI*z)*107,70+Math.sin(Math.PI*z)*20],arc,gold,a*.7);
  sea(68,55);burst(0,-24,seg(.65,.95));
 }
 if(v===2){
  // Fronds sway in a sea breeze as a half-sun emerges over the horizon.
  const sway=Math.sin(t*TAU)*2.6;
  c.save();c.translate(sway,0);palmTree(-1,82,58,118,19,0);c.restore();
  c.save();c.translate(sway*.7,0);palmTree(1,83,58,103,10,.08);c.restore();
  const q=ease(seg(.2,.68)),rad=32*q;
  curve(z=>[Math.cos(Math.PI+z*Math.PI)*rad,22+Math.sin(Math.PI+z*Math.PI)*rad],1,gold);
  line([[-49,22],[49,22]],gold,a*.8);
  for(let j=0;j<7;j++){const z=Math.PI+j*Math.PI/6;line([[Math.cos(z)*(rad+8),22+Math.sin(z)*(rad+8)],[Math.cos(z)*(rad+18),22+Math.sin(z)*(rad+18)]],col,a*q)}
  for(let j=0;j<3;j++)line([[-(21-j*6),33+j*8],[(21-j*6),33+j*8]],gold,a*q*.6);
  sea(70,111);
 }

c.restore();
}
window.RevolutionBannerSamplesFive={draw,titles};
})();