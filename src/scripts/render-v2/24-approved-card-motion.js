(function(){'use strict';
const clamp=x=>Math.max(0,Math.min(1,x)),seg=(x,a,b)=>clamp((x-a)/(b-a)),ease=x=>1-(1-clamp(x))**3,smooth=x=>{x=clamp(x);return x*x*(3-2*x)},mix=(a,b,q)=>a+(b-a)*q,rand=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v)};
let c,design,images,color;const tint=()=>color;
function path(poly){c.beginPath();poly.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath()}
function stroke(poly,a=1,width=2){c.save();c.globalAlpha=clamp(a);c.strokeStyle=color;c.lineWidth=width;c.beginPath();poly.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.stroke();c.restore()}
function clipHalf(poly,nx,ny,d){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],va=a[0]*nx+a[1]*ny-d,vb=b[0]*nx+b[1]*ny-d;if(va<=0)out.push(a);if((va<=0)!==(vb<=0)){const q=va/(va-vb);out.push([mix(a[0],b[0],q),mix(a[1],b[1],q)])}}return out}
const bounds=[[-100,-140],[100,-140],[100,140],[-100,140]];
const seeds=Array.from({length:24},(_,i)=>[-94+188*rand(i+1),-132+264*rand(i+65)]);
const porcelain=seeds.map((a,i)=>{let p=bounds;seeds.forEach((b,j)=>{if(i!==j)p=clipHalf(p,b[0]-a[0],b[1]-a[1],(b[0]*b[0]+b[1]*b[1]-a[0]*a[0]-a[1]*a[1])/2)});return p}).filter(p=>p.length>2);
const seam=[[-14,-140],[8,-110],[-9,-88],[18,-53],[-12,-20],[7,8],[-20,40],[4,76],[-15,108],[9,140]],fault=[];
for(let i=0;i<3;i++){const a=i*3,b=(i+1)*3,chain=seam.slice(a,b+1);fault.push([[-100,chain[0][1]],...chain,[-100,chain.at(-1)[1]]]);fault.push([[100,chain[0][1]],...chain,[100,chain.at(-1)[1]]])}
const grid=Array.from({length:6},(_,j)=>Array.from({length:5},(_,i)=>[-100+i*50+(i>0&&i<4?(rand(i+j*9)-.5)*38:0),-140+j*56+(j>0&&j<5?(rand(i+j*13+7)-.5)*36:0)])),mosaic=[];
for(let j=0;j<5;j++)for(let i=0;i<4;i++){const a=grid[j][i],b=grid[j][i+1],d=grid[j+1][i],e=grid[j+1][i+1];if((i+j)%3===0){mosaic.push([a,b,d],[b,e,d])}else mosaic.push([a,b,e,d])}
const meshes=[porcelain,fault,mosaic].map(polys=>polys.map(poly=>({poly,x:poly.reduce((s,p)=>s+p[0],0)/poly.length,y:poly.reduce((s,p)=>s+p[1],0)/poly.length})));
// Fragment images are prepared a few at a time during anticipation, not at impact.
function fracture(t,p,texture){
 if(t>=.91)return;
 const cache=p._porcelainSprites||(p._porcelainSprites=[]),mesh=meshes[0];
 if(t<.48){for(let budget=0;budget<2&&cache.length<mesh.length;budget++){
  const shard=mesh[cache.length],poly=shard.poly,x=Math.min(...poly.map(v=>v[0]))-2,y=Math.min(...poly.map(v=>v[1]))-2,w=Math.max(...poly.map(v=>v[0]))-x+2,h=Math.max(...poly.map(v=>v[1]))-y+2;
  const sprite=document.createElement('canvas'),density=Math.min(1.5,texture.width/200);sprite.width=Math.ceil(w*density);sprite.height=Math.ceil(h*density);const sc=sprite.getContext('2d');
  sc.scale(density,density);sc.translate(-x,-y);sc.beginPath();poly.forEach((v,i)=>i?sc.lineTo(...v):sc.moveTo(...v));sc.closePath();sc.clip();sc.drawImage(texture,-100,-140,200,280);sc.strokeStyle='#171a22';sc.lineWidth=2.1;sc.stroke();sc.strokeStyle='#e7e0d5';sc.lineWidth=.7;sc.stroke();cache.push({sprite,x,y,w,h});
 }}
 c.save();c.translate(500,315);
 if(t<.48){
  c.drawImage(texture,-100,-140,200,280);
  for(const shard of mesh){const reveal=seg(t,.08+Math.hypot(shard.x+32,shard.y+45)/240*.12,.34);if(reveal<=0)continue;c.save();c.setLineDash([700*reveal,1000]);path(shard.poly);c.strokeStyle='#171a22';c.lineWidth=1.05;c.stroke();c.strokeStyle='#e7e0d5';c.lineWidth=.35;c.globalAlpha=.9;c.stroke();c.restore()}
 }else{
 const alpha=1-smooth(seg(t,.63,.91));
 for(let i=0;i<mesh.length;i++){const shard=mesh[i],q=seg(t,.48+rand(i)*.014,.71+rand(i)*.014),e=1-(1-q)**4,dx=(shard.x*2.2+(rand(i+30)-.5)*45)*e,dy=shard.y*1.25*e+65*q*q;
 c.save();c.translate(shard.x+dx,shard.y+dy);c.rotate((rand(i+1)-.5)*2.2*e);c.translate(-shard.x,-shard.y);c.globalAlpha=alpha;
 const entry=cache[i];if(entry)c.drawImage(entry.sprite,entry.x,entry.y,entry.w,entry.h);
 else{path(shard.poly);c.clip();c.drawImage(texture,-100,-140,200,280);c.strokeStyle='#e7e0d5';c.lineWidth=.7;c.stroke()}
 c.restore();}
 }
 if(t>.48&&t<.8){const burst=seg(t,.48,.70),kick=1-(1-burst)**4;for(let i=0;i<38;i++){const ang=i*2.399,r=(70+rand(i)*235)*kick;stroke([[Math.cos(ang)*r,Math.sin(ang)*r*.8],[Math.cos(ang)*(r-10*(1-burst)),Math.sin(ang)*(r-10*(1-burst))*.8]],(1-seg(t,.5,.8))*.65,i%3?1:2)}}c.restore();
}
function sparks(x,y,t,kind=0){
 if(t<=0||t>=1)return;const q=ease(t),fade=(1-t)**1.3,mode=design===3?2:design-3;
 // Distinct emission geometry, shared crisp white impact language.
 for(let i=0;i<84;i++){
 const r=rand(i+5),angle=i*2.399,v=100+r*215;let dx,dy,ang=angle;
 if(mode===0){dx=Math.cos(angle)*v*q;dy=Math.sin(angle)*v*q*.7-35*Math.sin(t*Math.PI)}
 else if(mode===1){dx=(i%2?1:-1)*(35+v*q);dy=(r-.5)*120*q+110*t*t;ang=i%2?0:Math.PI}
 else if(mode===2){ang=angle+2.4*(1-t);dx=Math.cos(ang)*v*q;dy=Math.sin(ang)*v*q*.78}
 else if(mode===3){ang=Math.PI/4+(i%4)*Math.PI/2+(r-.5)*.28;dx=Math.cos(ang)*v*q;dy=Math.sin(ang)*v*q}
 else if(mode===4){ang=-Math.PI*.9+r*Math.PI*.8;dx=Math.cos(ang)*v*q;dy=Math.sin(ang)*v*q+170*t*t}
 else{ang=(i%2?0:Math.PI)+(r-.5)*.22;dx=Math.cos(ang)*v*q;dy=Math.sin(ang)*v*q+(i%3-1)*55*q}
 const len=(14+r*26)*(1-t);stroke([[x+dx,y+dy],[x+dx-Math.cos(ang)*len,y+dy-Math.sin(ang)*len]],fade*(.5+r*.5),mode===2?(i%7?2.2:4.2):(i%7?1.7:3.6));
 if(i%4===0){c.save();c.globalAlpha=fade*.8;c.fillStyle=tint();c.translate(x+dx,y+dy);c.rotate(ang+t);c.fillRect(-2,-2,4+r*3,4+r*3);c.restore()}
 }
 c.save();c.translate(x,y);c.strokeStyle=tint();
 for(let j=0;j<3;j++){const p=seg(t,j*.07,1),radius=50+ease(p)*(175+j*26);c.globalAlpha=(1-p)*.55;c.lineWidth=4-j;c.beginPath();if(mode===3){c.moveTo(0,-radius);c.lineTo(radius,0);c.lineTo(0,radius);c.lineTo(-radius,0);c.closePath()}else if(mode===5){c.moveTo(-radius,-22-j*14);c.lineTo(radius,22+j*14)}else{c.ellipse(0,0,radius,radius*(mode===2?.8:.28),mode===2?j*.5:0,0,Math.PI*2)}c.stroke()}
 const flash=1-seg(t,0,.16);if(flash>0){const g=c.createRadialGradient(0,0,0,0,0,135);g.addColorStop(0,'#ffffffb0');g.addColorStop(.35,tint()+'40');g.addColorStop(1,tint()+'00');c.globalAlpha=flash;c.fillStyle=g;c.fillRect(-135,-135,270,270)}c.restore();
}

function draw(ctx,p,texture){
c=ctx;const t=clamp(p.progress||0),r=p.toRect||p.fromRect;if(!r)return;
color=({star:'#efca85',square:'#aa9bbd',triangle:'#9cb5a5',circle:'#c7ced7'})[p.rarity||p.card?.rarity]||'#c7ced7';
if(p.fracture){const f=p.fromRect;images=[texture,texture];c.save();c.translate(f.x+f.w/2,f.y+f.h/2);c.scale(f.w/200,f.h/280);c.translate(-500,-315);fracture(t,p,texture);c.restore();return;}
const multi=p.consolidationStyle==='crown',cx=r.x+r.w/2,cy=r.y+r.h/2,impact=multi?.70:.53;
let x=cx,y=cy,sx=1,sy=1,angle=0,a=1;
if(p.tribute){const f=p.fromRect;
 if(multi){const count=Math.max(1,p.tributeCount||1),start=.06+(p.tributeIndex||0)*(.27/Math.max(1,count-1)),q=ease(seg(t,start,start+.22));x=mix(f.x+f.w/2,cx,q);y=mix(f.y+f.h/2,cy,q)-Math.sin(q*Math.PI)*r.h*135/162;angle=((p.tributeIndex||0)-(count-1)/2)*.35*Math.sin(q*Math.PI);sx=mix(f.w/r.w,1,q);sy=mix(f.h/r.h,1,q);a=1-seg(t,start+.22,start+.27)}
 else{const q=seg(t,.06,.32);x=f.x+f.w/2;y=f.y+f.h/2+r.h*(-65*Math.sin(q*Math.PI)+120*q*q)/162;sx=f.w/r.w*(1-.25*q);sy=f.h/r.h*(1-.25*q);angle=.2*q;a=1-seg(t,.24,.34)}
}else{
 const enter=multi?.54:.30;if(t<enter)return;const q=seg(t,enter,impact),slam=q**4,settle=seg(t,impact,impact+.16),recoil=Math.sin(settle*Math.PI*2)*Math.exp(-settle*4);
 if(multi){const wind=seg(t,enter,enter+.07),hit=seg(t,enter+.07,impact)**4;y=cy-r.h*(115*(1-hit)+35*Math.sin(wind*Math.PI))/162;x=cx+r.w*40/116*(1-hit);angle=.3*(1-hit);sx=sy=1+.22*(1-hit)}
 else{y=cy-r.h*190/162*(1-slam);angle=-.18*(1-slam);sx=sy=1+.38*(1-slam)}
 if(t>=impact){y-=recoil*r.h*(multi?22:10)/162;x+=multi?recoil*r.w*10/116:0;angle+=recoil*(multi?.09:.025)}
 const squash=t>=impact?Math.sin(seg(t,impact,impact+.08)*Math.PI)*.14:0;sx*=1+squash;sy*=1-squash;
}
if(a>0){c.save();c.translate(x,y);c.rotate(angle);c.scale(sx,sy);c.globalAlpha=a;c.drawImage(texture,-r.w/2,-r.h/2,r.w,r.h);c.restore()}
if(!p.tribute){design=multi?3:6;c.save();c.translate(cx,cy);c.scale(r.w/116,r.h/162);sparks(0,0,seg(t,impact,1));c.restore()}

}
window.FateApprovedCardMotion={draw};})();
