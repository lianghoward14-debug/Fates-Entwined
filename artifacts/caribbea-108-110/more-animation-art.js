(function(){'use strict';
const names={108:['Catch a Falling Star','Ribbon of Wishes','A World in Bloom'],109:['Wheel of Fortune','The Golden Toss','Fortune Unsealed'],110:['The Pier Cast','The Lift Net','The Big Catch']};
const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>1-(1-clamp(x))**3;
function draw(c,id,t,w=700,h=430,v=0){
 id=String(id);const pi=Math.PI,T=pi*2,seg=(s,e)=>clamp((t-s)/(e-s)),a=ease(seg(0,.12))*(1-ease(seg(.86,1)));
 const [ink,gold]=({108:['#c6a4ec','#f5dfad'],109:['#90bfde','#edc56d'],110:['#8bd6d0','#e9c497']})[id];
 c.clearRect(0,0,w,h);c.save();c.translate(w/2,h/2);c.scale(Math.min(w/390,h/290),Math.min(w/390,h/290));
 function line(p,col=ink,alpha=a,width=1.6){c.save();c.strokeStyle=col;c.lineWidth=width;c.globalAlpha=alpha;c.lineCap='round';c.lineJoin='round';c.shadowColor=col;c.shadowBlur=6;c.beginPath();p.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.stroke();c.shadowBlur=0;c.lineWidth=.7;c.stroke();c.restore();}
 function curve(fn,p=1,col=ink,alpha=a,width=1.6){line(Array.from({length:65},(_,i)=>fn(i/64*p)),col,alpha,width);}
 function ring(x,y,rx,ry,col=ink,alpha=a){curve(q=>[x+Math.cos(q*T)*rx,y+Math.sin(q*T)*ry],1,col,alpha);}
 function at(x,y,r,fn){c.save();c.translate(x,y);c.rotate(r);fn();c.restore();}
 function star(x,y,r,col=gold,alpha=a){line(Array.from({length:9},(_,i)=>{const z=-pi/2+i*pi/4,rr=i%2?r*.28:r;return[x+Math.cos(z)*rr,y+Math.sin(z)*rr];}),col,alpha);}
 function sparks(x,y,p){for(let j=0;j<10;j++){const z=j*2.4,r=12+65*ease(p);star(x+Math.cos(z)*r,y+Math.sin(z)*r,2.7,gold,a*Math.sin(p*pi));}}
 function fish(x,y,r=0,s=.7){at(x,y,r,()=>{c.save();c.scale(s,s);curve(q=>[-25+50*q,-15*Math.sin(q*pi)]);curve(q=>[-25+50*q,15*Math.sin(q*pi)]);line([[-25,0],[-41,-14],[-35,0],[-41,14],[-25,0]],gold);ring(13,-4,2,2,gold);curve(q=>[3+4*Math.sin(q*pi),-11+22*q],1,gold);c.restore();});}
 function water(){for(let j=0;j<3;j++)curve(q=>[-144+288*q,80+j*12+Math.sin(q*T*2-t*7+j)*3],1,ink,a*(.6-j*.13));}
 function pier(){line([[-146,24],[-28,24],[-28,32],[-146,32]],gold,a,2.2);for(let j=0;j<5;j++)line([[-139+j*25,24],[-139+j*25,32]],gold,a*.7);for(const x of [-127,-48]){line([[x,32],[x,97],[x+6,97],[x+6,32]],gold);line([[x,37],[x+5,57]],ink,a*.4);} }
 function fisher(lean=0){at(-61,0,lean,()=>{ring(0,-45,10,11,gold);line([[-13,-54],[13,-54]],gold);curve(q=>[-8+16*q,-55-6*Math.sin(q*pi)],1,gold);line([[-4,-32],[-13,-6],[9,-6],[4,-32],[-4,-32]],ink);line([[-10,-5],[-7,14],[7,23]],gold);line([[7,-5],[18,8],[14,24]],gold);line([[4,-26],[18,-15],[31,-26]],gold);});}
 function coin(x,y,r,spin=1){ring(x,y,Math.max(2,r*Math.abs(Math.cos(spin))),r,gold);ring(x,y,Math.max(1,(r-5)*Math.abs(Math.cos(spin))),r-5,gold,a*.45);star(x,y,Math.max(3,r*.4),ink);}
 if(id==='110'){
  pier();water();
  if(v===0){
   const cast=ease(seg(.12,.39)),lift=ease(seg(.53,.81)),fx=87-31*lift,fy=75-139*lift;
   fisher(-.09*Math.sin(t*pi));
   curve(q=>[-31+107*q,-27-77*Math.sin(q*pi*.55)+16*lift*q],1,gold);
   const tip=[76,-27-77*Math.sin(pi*.55)+16*lift];
   curve(q=>[tip[0]+(fx-tip[0])*q,tip[1]+(fy-tip[1])*q+22*Math.sin(q*pi)*(1-lift)],cast,ink,a*.8);
   if(t>.37){fish(fx,fy+.8,-pi/2+Math.sin(t*25)*.13,.62);ring(87,79,12+29*seg(.4,.65),3+5*seg(.4,.65),ink,a*(1-seg(.45,.7)));}
   for(let j=0;j<4;j++){const q=seg(.54,.8);line([[87+(j-1.5)*9,70-22*Math.sin(q*pi)+j*3],[87+(j-1.5)*9,73-22*Math.sin(q*pi)+j*3]],ink,a*Math.sin(q*pi));}
  }else if(v===1){
   fisher(.02);const lift=ease(seg(.36,.8)),ny=73-107*lift;
   line([[-30,-27],[45,-79]],gold,a,2);line([[45,-79],[67,ny]],gold);
   ring(67,ny,45,9,gold);curve(q=>[22+90*q,ny+Math.sin(q*pi)*29],1,ink);
   for(let j=1;j<6;j++){const x=22+j*15,depth=Math.sin(j*pi/6)*29;line([[x,ny],[67+(x-67)*.55,ny+depth]],ink,a*.55);}
   fish(55,ny+9,.1,.47);fish(78,ny+17,pi-.15,.43);
   if(lift>0)for(let j=0;j<5;j++){const p=(seg(.45,.86)+j*.17)%1;line([[38+j*14,ny+34+p*30],[38+j*14,ny+38+p*30]],ink,a*(1-p)*lift);}
  }else{
   const tug=ease(seg(.35,.7)),jump=seg(.39,.8),fx=110-100*ease(jump),fy=77-159*Math.sin(jump*pi/2);
   fisher(-.17*tug);curve(q=>[-30+122*q,-27-116*q+49*q*q+Math.sin(q*pi)*20*tug],1,gold, a,2);
   curve(q=>[92+(fx-92)*q,-94+(fy+94)*q],1,ink,a*.8);
   fish(fx,fy,-pi/2+.6*tug,.96);ring(109,81,17+27*jump,4+5*jump,ink,a*(1-jump));
   if(t>.55)sparks(fx,fy,seg(.57,.9));
  }
 }else if(id==='109'){
  if(v===0){
   const p=ease(seg(.06,.74)),rot=pi*5*p;
   ring(0,0,83,83,gold);ring(0,0,73,73,ink,a*.6);
   at(0,0,rot,()=>{for(let j=0;j<8;j++){const z=j*T/8;line([[0,0],[Math.cos(z)*73,Math.sin(z)*73]],gold,a*.65);star(Math.cos(z+pi/8)*54,Math.sin(z+pi/8)*54,6,j%2?ink:gold);}ring(0,0,12,12,gold);});
   line([[-10,-101],[0,-84],[10,-101],[-10,-101]],gold,a,2.2);
   if(t>.69)sparks(0,-55,seg(.69,.93));
   line([[-36,97],[36,97]],gold,a*.6);
  }else if(v===1){
   const p=ease(seg(.06,.78)),y=55-128*Math.sin(p*pi);
   coin(0,y,35,p*pi*6);curve(q=>[-59+118*q,79-Math.sin(q*pi)*13],1,ink);
   line([[-59,79],[-43,91],[34,91],[59,79]],gold);
   for(let j=0;j<3;j++)curve(q=>[(j-1)*15,-15-44*q],seg(.1,.4),ink,a*(1-seg(.4,.65))*.5);
   if(t>.72){ring(0,68,32+25*seg(.72,.92),9,gold,a*(1-seg(.72,.93)));sparks(0,55,seg(.72,.95));}
  }else{
   const open=ease(seg(.13,.53));
   line([[-67,2],[67,2],[67,71],[-67,71],[-67,2]],gold,a,2);
   at(0,2,-open*1.02,()=>{line([[-67,0],[-67,-36],[67,-36],[67,0],[-67,0]],gold);line([[-48,-34],[-48,0],[48,0],[48,-34]],ink,a*.65);});
   line([[-8,3],[-8,23],[8,23],[8,3]],ink);
   for(let j=0;j<5;j++){const p=ease(seg(.31+j*.065,.64+j*.04));coin((j-2)*29,12-77*p+Math.abs(j-2)*9,12,t*9+j);}
   for(let j=0;j<3;j++){const p=seg(.5+j*.07,.88);star((j-1)*54,-103+Math.abs(j-1)*14,8,gold,a*Math.sin(p*pi));}
  }
 }else{
  if(v===0){
   const p=ease(seg(.05,.67)),x=-117+167*p,y=-74+98*p-43*Math.sin(p*pi);
   curve(q=>[-117+167*q,-74+98*q-43*Math.sin(q*pi)],p,ink,a*.48);
   star(x,y,18,gold);for(let j=1;j<5;j++){const q=Math.max(0,p-j*.07);star(-117+167*q,-74+98*q-43*Math.sin(q*pi),3,ink,a*(1-j/5));}
   line([[-78,68],[-39,45],[-18,22],[-8,28],[-24,49],[21,31],[39,26],[61,29],[81,37],[77,47],[45,47],[10,71],[-36,82],[-78,68]],gold);
   if(t>.6)sparks(50,24,seg(.6,.9));
  }else if(v===1){
   const p=ease(seg(.07,.75));
   curve(q=>[-126+252*q,25+Math.sin(q*T*1.4)*35],p,ink,a,2);
   curve(q=>[-126+252*q,34+Math.sin(q*T*1.4)*35],p,gold,a*.6);
   for(let j=0;j<5;j++){const q=(j+.5)/5,show=ease(seg(.15+j*.1,.38+j*.09));star(-126+252*q,-22+Math.sin(q*T*1.4)*35,8+5*show,gold,a*show);line([[-126+252*q,-11+Math.sin(q*T*1.4)*35],[-126+252*q,25+Math.sin(q*T*1.4)*35]],ink,a*show*.65);}
   at(-126+252*p,25+Math.sin(p*T*1.4)*35,.4,()=>{line([[0,0],[15,-9],[11,11],[0,0],[-12,-12],[-15,8],[0,0]],gold);});
  }else{
   const p=ease(seg(.1,.65));ring(0,5,63*p,63*p,ink);ring(0,5,24*p,63*p,gold,a*.5);ring(0,5,63*p,20*p,gold,a*.5);
   for(let j=0;j<6;j++){const z=j*T/6-pi/2,q=ease(seg(.25+j*.04,.66+j*.03));
    curve(s=>[Math.cos(z)*(66+27*s),5+Math.sin(z)*(66+27*s)],q,ink);
    const x=Math.cos(z)*94,y=5+Math.sin(z)*94;star(x,y,11*q,gold,a*q);
   }
   star(0,5,23*p,gold);if(t>.62)sparks(0,5,seg(.62,.94));
  }
 }
 c.restore();
}
window.FateCaribbeaActivationArt={names,draw};
})();
