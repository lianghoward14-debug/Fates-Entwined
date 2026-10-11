(function(){
'use strict';
const titles=[['Torch of tomorrow','Seeds of a brighter future','The sun reunites'],['One common cause','Rise together','Unbreakable solidarity']];
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
 if(r===0&&v===0){
  // A torch rises; its flame separates into two crisp tongues.
  const rise=ease(seg(.04,.5));c.save();c.translate(0,55*(1-rise));
  line([[-15,4],[-10,81],[10,81],[15,4]],col);line([[-24,-6],[-18,9],[18,9],[24,-6],[-24,-6]],gold,a,2);
  const q=ease(seg(.18,.67));
  curve(z=>[-22*Math.sin(z*Math.PI)+9*Math.sin(z*TAU),-7-77*z*q],1,gold);
  curve(z=>[27*Math.sin(z*Math.PI)-12*Math.sin(z*TAU),-7-77*z*q],1,gold);
  curve(z=>[12*Math.sin(z*TAU),-8-48*z*q],1,col);
  for(let i=0;i<5;i++){const p=seg(.36+i*.05,.76+i*.035);star((i-2)*20*p,-52-42*p,2,a*Math.sin(p*Math.PI))}c.restore();
 }
 if(r===0&&v===1){
  // A seed opens into a young plant under a slowly rising sun.
  const q=ease(seg(.12,.72));line([[-89,69],[89,69]],col,a*.6);
  curve(z=>[8*Math.sin(z*Math.PI),65-102*z],q,gold);
  for(const s of [-1,1]){const p=ease(seg(s<0?.2:.35,s<0?.62:.77)),y=s<0?21:-5;c.save();c.translate(5,y);c.scale(p,p);curve(z=>[s*60*z,-34*Math.sin(z*Math.PI/2)],1,col);curve(z=>[s*60*(1-z),-34+34*z*z],1,col);c.restore()}
  const sy=-32-40*ease(seg(.05,.55));ring(0,sy,19,19,gold);for(let i=0;i<7;i++){const z=Math.PI+i*Math.PI/6;line([[Math.cos(z)*27,sy+Math.sin(z)*27],[Math.cos(z)*36,sy+Math.sin(z)*36]],col,a*q)}
 }
 if(r===0&&v===2){
  // A sun is assembled from rotating segments, then locks into a crest.
  const q=ease(seg(.08,.67));for(let i=0;i<8;i++){const z=i*TAU/8,rad=98-55*q,rot=z+(1-q)*.8;
   curve(p=>[Math.cos(rot+p*.53)*rad,Math.sin(rot+p*.53)*rad],1,gold);
   line([[Math.cos(z+.26)*(rad+10),Math.sin(z+.26)*(rad+10)],[Math.cos(z+.26)*(rad+27),Math.sin(z+.26)*(rad+27)]],col);
  }star(0,0,12,a*q);burst(0,0,seg(.62,.96));
 }
 if(r===1&&v===0){
  // Three separate standards converge into one common base.
  const q=ease(seg(.08,.64));for(let i=0;i<3;i++){c.save();c.translate((i-1)*(93-35*q),i===1?-24:7);flag(-10,0,q,.65);c.restore()}
  const join=ease(seg(.48,.78));line([[-87*join,75],[87*join,75]],gold,a*join,2);line([[-58,61],[-58,75],[58,75],[58,61]],col,a*join);star(0,75,6,a*join);burst(0,75,seg(.65,.97));
 }
 if(r===1&&v===1){
  // A raised fist closes and rises as the rally's central emblem.
  const q=ease(seg(.08,.62));c.save();c.translate(0,49*(1-q));
  line([[-27,78],[-27,23],[-48,4],[-48,-19],[-38,-27],[-20,-11]],col,a,2);
  line([[-20,-11],[-24,-45],[-18,-54],[-6,-54],[0,-46],[0,-20]],gold,a,2);
  line([[0,-46],[5,-62],[18,-62],[24,-54],[24,-20]],gold,a,2);
  line([[24,-54],[31,-54],[40,-47],[40,-15]],gold,a,2);
  line([[40,-42],[48,-39],[52,-30],[52,2],[31,25],[31,78]],col,a,2);
  line([[-27,63],[31,63]],gold);line([[-20,-10],[9,-14],[23,-3],[12,13],[-4,10]],col);
  c.restore();for(let i=0;i<7;i++){const z=Math.PI+i*Math.PI/6;line([[Math.cos(z)*87,Math.sin(z)*87-9],[Math.cos(z)*(87+18*q),Math.sin(z)*(87+18*q)-9]],gold,a*q)}
 }
 if(r===1&&v===2){
  // Separate links join into a single strong chain.
  const q=ease(seg(.06,.65));for(let i=0;i<3;i++){c.save();c.translate((i-1)*(102-52*q),0);c.rotate((i-1)*(.65-.25*q));
   curve(z=>[Math.cos(z*TAU)*42,Math.sin(z*TAU)*24],1,i===1?gold:col);
   curve(z=>[Math.cos(z*TAU)*32,Math.sin(z*TAU)*14],1,i===1?gold:col,a*.7);c.restore();
  }for(const s of [-1,1])burst(s*26,0,seg(.62,.95));
  const p=ease(seg(.55,.8));line([[-14,60],[0,46-9*p],[14,60]],gold,a*p);line([[-14,-60],[0,-46+9*p],[14,-60]],gold,a*p);
 }

c.restore();
}
window.RevolutionBannerSamplesThree={draw,titles};
})();