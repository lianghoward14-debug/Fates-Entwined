(function(){
'use strict';
function draw(c,v,t,w,h){
 const clamp=x=>Math.max(0,Math.min(1,x)),seg=(a,b)=>clamp((t-a)/(b-a)),ease=x=>1-(1-clamp(x))**3;
 const a=ease(seg(0,.14))*(1-ease(seg(.82,1))),jade='#99d5ba',gold='#efd29a';
 c.clearRect(0,0,w,h);c.save();c.translate(w/2,h/2);let scale=Math.min(w/350,h/255);c.scale(scale,scale);
 function line(p,col=jade,alpha=a,width=1.5){c.save();c.beginPath();p.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.lineJoin='round';c.lineCap='round';c.strokeStyle=col;c.globalAlpha=clamp(alpha*.3);c.lineWidth=width+4;c.shadowColor=col;c.shadowBlur=8;c.stroke();c.globalAlpha=clamp(alpha);c.lineWidth=width;c.shadowBlur=0;c.stroke();c.restore()}
 function curve(fn,q=1,col=jade,alpha=a){line(Array.from({length:65},(_,i)=>fn(q*i/64)),col,alpha)}
 function ring(x,y,r,alpha=a){curve(z=>[x+Math.cos(z*Math.PI*2)*r,y+Math.sin(z*Math.PI*2)*r],1,gold,alpha)}
 function star(x,y,r=6,alpha=a){line([[x-r,y],[x+r,y]],gold,alpha);line([[x,y-r],[x,y+r]],gold,alpha)}
 function burst(x,y,p){for(let i=0;i<12;i++){let z=i*2.4,d=15+55*ease(p);line([[x+Math.cos(z)*d,y+Math.sin(z)*d],[x+Math.cos(z)*(d+4),y+Math.sin(z)*(d+4)]],gold,a*Math.sin(p*Math.PI))}}
 function flag(x,y,q){line([[x,y+30],[x,y+30-65*q]],gold);if(q>0){curve(z=>[x+z*37,y+30-65*q+Math.sin(z*6-t*8)*3]);curve(z=>[x+z*37,y+51-65*q+Math.sin(z*6-t*8)*3]);line([[x+37,y+30-65*q+Math.sin(6-t*8)*3],[x+37,y+51-65*q+Math.sin(6-t*8)*3]])}}
 if(v===0){
  let unfold=ease(seg(.02,.26));c.save();c.scale(.4+.6*unfold,unfold);
  line([[-79,85],[-79,-85],[60,-85],[79,-66],[79,85],[-79,85]]);line([[60,-85],[60,-66],[79,-66]],gold);
  for(let i=0;i<3;i++)line([[-60,-63+i*12],[-28+i*6,-63+i*12]],jade,a*.4);c.restore();
  const route=z=>[-47+94*z,58-97*z+12*Math.sin(z*Math.PI*3)],q=ease(seg(.2,.69));curve(route,q,gold);let [x,y]=route(q);
  if(t<.75){c.save();c.translate(x,y);c.rotate(.65);c.fillStyle='#0c1920';c.globalAlpha=a;c.beginPath();c.moveTo(0,0);c.lineTo(-5,-14);c.lineTo(-5,-58);c.lineTo(5,-58);c.lineTo(5,-14);c.closePath();c.fill();line([[0,0],[-5,-14],[-5,-58],[5,-58],[5,-14],[0,0]],gold);line([[-5,-14],[5,-14]],jade);c.restore()}
  star(47,-39,9,a*ease(seg(.64,.77)));ring(47,-39,17,a*ease(seg(.66,.78)));burst(47,-39,seg(.65,.94));
 }
 if(v===1){
  const q=ease(seg(.08,.65)),path=z=>[-111+211*z,65-102*z+24*Math.sin(z*Math.PI*2)];
  for(let i=0;i<2;i++){curve(z=>[-64+z*122,55-z*(i?5:125)],ease(seg(.12,.42)),jade,a*.35*(1-seg(.4,.7)));}
  curve(path,q,gold);for(let i=0;i<4;i++){let z=i/3,p=path(z);ring(p[0],p[1],4,a*ease(seg(.08+z*.4,.18+z*.4)));}
  let p=path(q);star(p[0],p[1],6,a*(1-seg(.66,.8)));flag(100,-68,ease(seg(.48,.76)));burst(100,-40,seg(.66,.96));
 }
 if(v===2){
  let q=ease(seg(.08,.6));
  for(let i=0;i<3;i++){let angle=Math.PI/2+i*Math.PI*2/3;const route=z=>[Math.cos(angle+.45*z)*(105-78*z),Math.sin(angle+.45*z)*(105-78*z)];curve(route,q,jade,a*.7);let [x,y]=route(q);line([[x,y-7],[x+7,y],[x,y+7],[x-7,y],[x,y-7]],gold,a*(1-seg(.6,.75)));}
  ring(0,0,25,a*ease(seg(.3,.6)));ring(0,0,40+25*seg(.58,.9),a*.5*(1-seg(.58,.9)));flag(-12,-17,ease(seg(.44,.73)));burst(0,0,seg(.6,.96));
 }
 c.restore();
}
window.AnneRevolutionSamples={draw,titles:['Drafted revolution','Chosen path','Coordinated uprising']};
})();
