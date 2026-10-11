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
  const q=ease(seg(.08,.6));ring(0,0,69);ring(0,0,77,a*.35);
  for(let i=0;i<8;i++){let z=i*Math.PI/4;line([[Math.sin(z)*61,-Math.cos(z)*61],[Math.sin(z)*68,-Math.cos(z)*68]],jade,a*.6)}
  c.save();c.rotate(-2.3*(1-q));line([[0,-54],[13,0],[0,54],[-13,0],[0,-54]],gold);line([[0,-54],[0,54]],jade);c.restore();ring(0,0,5);
  curve(z=>[Math.sin(z*2.5)*17,-78-25*z],ease(seg(.56,.77)),gold);star(0,-103,7,a*seg(.6,.76));burst(0,0,seg(.6,.94));
 }
 if(v===1){
  const q=ease(seg(.06,.38));c.save();c.scale(q,1);
  line([[-105,-53],[-38,-70],[35,-49],[105,-69],[105,62],[35,81],[-38,60],[-105,78],[-105,-53]]);
  line([[-38,-70],[-38,60]],jade,a*.4);line([[35,-49],[35,81]],jade,a*.4);c.restore();
  const route=z=>[-83+159*z,45-65*z+15*Math.sin(z*9)],p=ease(seg(.24,.7));curve(route,p,gold);let [x,y]=route(p);star(x,y,5);ring(76,-14,12,a*seg(.58,.74));burst(76,-14,seg(.64,.96));
 }
 if(v===2){
  let q=ease(seg(.24,.67));
  for(let i=-2;i<=2;i++){line([[-104,39+i*17],[104,39+i*17]],jade,a*.22);line([[i*37-15,5],[i*45+15,87]],jade,a*.22)}
  const x=-64+128*q,y=22-33*Math.sin(q*Math.PI);ring(x,y-32,11);
  line([[x-8,y-21],[x-19,y+12],[x+19,y+12],[x+8,y-21]],gold);line([[x-24,y+12],[x+24,y+12],[x+28,y+23],[x-28,y+23],[x-24,y+12]],gold);
  curve(z=>[-65+128*z,13-38*Math.sin(z*Math.PI)],q,jade,a*.6);line([[47,-9],[64,-20],[81,-9]],gold,a*seg(.5,.7));burst(64,20,seg(.65,.96));
 }
 if(v===3){
  const q=ease(seg(.12,.55)),gap=34*ease(seg(.44,.72));
  for(const side of [-1,1]){c.save();c.translate(side*gap,0);line([[side*5,-52],[side*60,-52],[side*60,45],[side*5,45]],jade,a);for(let i=0;i<3;i++)line([[side*12,-29+i*23],[side*51,-29+i*23]],jade,a*.35);c.restore()}
  curve(z=>[-110+220*z,72-25*Math.sin(z*Math.PI)],q,gold);
  const rise=ease(seg(.47,.78));line([[0,48],[0,48-123*rise]],gold);line([[-14,-59],[0,-75],[14,-59]],gold,a*rise);burst(0,-36,seg(.62,.95));
 }
 if(v===4){
  const q=ease(seg(.04,.35));line([[-64,78],[-64,-72*q],[44,-72*q],[65,-51*q],[65,78],[-64,78]]);line([[44,-72*q],[44,-51*q],[65,-51*q]],gold);
  for(let i=0;i<3;i++){let y=-35+i*25,p=ease(seg(.2+i*.08,.42+i*.08));line([[-43,y],[35*p-35,y]],jade,a*.5)}
  let stamp=ease(seg(.4,.64));c.save();c.translate(18,32-52*(1-stamp));c.scale(1.45-.45*stamp,1.45-.45*stamp);ring(0,0,24,a*stamp);ring(0,0,29,a*.45*stamp);line([[-12,0],[-3,9],[14,-12]],gold,a*stamp,2);c.restore();burst(18,32,seg(.63,.96));
 }
 if(v===5){
  const q=ease(seg(.1,.67));
  for(let i=0;i<5;i++){const x=-108+i*49,y=39-19*i,p=ease(seg(.09+i*.07,.33+i*.07));ring(x,y,8,a*p);line([[x-8,y+18],[x+8,y+18]],jade,a*p*.5);if(i<4)curve(z=>[x+49*z,y-19*z-22*Math.sin(z*Math.PI)],ease(seg(.18+i*.07,.46+i*.07)),jade,a*.6)}
  const z=q*4,i=Math.min(3,Math.floor(z)),r=z-i;star(-108+i*49+49*r,39-i*19-19*r-22*Math.sin(r*Math.PI),6,a*(1-seg(.7,.8)));
  flag(88,-67,ease(seg(.57,.79)));burst(88,-37,seg(.67,.97));
 }

 c.restore();
}
window.AnneRevolutionMore={draw};
})();