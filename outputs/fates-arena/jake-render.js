// Canvas animation based on Fates Entwined card 38: olive hair, glasses,
// brown collared shirt, broad belly and the original triangular hands/feet.
const JakeView=(()=>{
function shape(g,path,color){g.beginPath();path(g);g.fillStyle=color;g.fill();g.strokeStyle='#302a20';g.lineWidth=2;g.stroke()}
function oval(g,x,y,rx,ry,c){shape(g,p=>p.ellipse(x,y,rx,ry,0,0,Math.PI*2),c)}
function poly(g,points,c){shape(g,p=>{points.forEach(([x,y],i)=>i?p.lineTo(x,y):p.moveTo(x,y));p.closePath()},c)}
function food(g,x,y,size,taco=false){g.save();g.translate(x,y);g.scale(size/50,size/50);if(taco){oval(g,0,0,25,18,'#4d8238');oval(g,0,-2,23,14,'#a05232');shape(g,p=>{p.arc(0,0,25,0,Math.PI);p.closePath()},'#d8b75d');for(let i=0;i<7;i++)oval(g,-17+i*5,6+(i%3)*4,1,1,'#876c36')}else{oval(g,0,15,43,12,'#dba356');poly(g,[[-41,6],[-28,1],[0,6],[26,0],[42,6],[36,13],[-34,13]],'#65923e');oval(g,0,3,40,9,'#633a25');poly(g,[[-39,-5],[40,-5],[22,8],[0,1],[-22,8]],'#f1c94a');oval(g,0,-9,40,10,'#b94f36');shape(g,p=>{p.moveTo(-43,-10);p.bezierCurveTo(-42,-49,42,-49,43,-10);p.closePath()},'#e5b766');for(let i=0;i<9;i++)oval(g,-29+(i%5)*14,-20-Math.floor(i/5)*10,2,1,'#fff1bc')}g.restore()}
const sheet=new Image();sheet.src='JAKE_SPRITE';const bounds=JAKE_BOUNDS;
function pose(f,s,reduced){
 let frame=1,sx=1,sy=1,angle=0,lift=0;
 if(f.belly){let t=f.belly.age/.65;frame=t<.18?6:7;lift=t<.18?0:Math.sin((t-.18)/.82*Math.PI)*72;angle=t>.65?(t-.65)*.28:0;}
 else if(f.landing>0){frame=8;let t=1-f.landing/.28;sx=1+.1*(1-t);sy=1-.07*(1-t);}
 else if(f.charge){let c=f.charge;if(c.windup>0){frame=11;let t=1-c.windup/.55;sx=1+.035*t;sy=1-.035*t;angle=-.025*t;}else{let phase=c.age*(7+Math.min(1,c.age/4)*7);frame=12+Math.floor(phase)%2;lift=reduced?0:Math.abs(Math.sin(phase*Math.PI))*3;}}
 else if(f.meal){let t=f.meal.age/.65;frame=t<.65?14:15;sy=t<.65?1+.025*Math.sin(t/.65*Math.PI):1-.045*Math.sin((t-.65)/.35*Math.PI);}
 else if(f.mealRecovery>0){frame=15;sy=1-.05*f.mealRecovery/.3;}
 else if(f.eating>0){let t=.85-f.eating;frame=t<.22||t>.72?9:10;angle=reduced?0:Math.sin(t*24)*.012;}
 else if(f.punch>0){let t=.38-f.punch;frame=t<.1?4:t<.28?5:4;angle=t<.1?-.035:.03;}
 else if(f.moving){frame=Math.floor(f.animation)%4;lift=reduced?0:Math.sin(f.animation*Math.PI)*1.5;}
 else {sy=reduced?1:1+Math.sin(s.time*2.6)*.008;}
 if(reduced){sx=sy=1;angle=0;if(!f.belly)lift=0;}
 return {frame,sx,sy,angle,lift};
}
function body(g,f,s,reduced){if(!sheet.complete||!sheet.naturalWidth)return;let p=pose(f,s,reduced),fr=bounds.frames[p.frame],sc=bounds.scale;g.save();g.translate(0,-p.lift);g.rotate(p.angle);g.scale(p.sx,p.sy);g.drawImage(sheet,fr.x,fr.y,fr.w,fr.h,-fr.anchor*sc,-fr.h*sc,fr.w*sc,fr.h*sc);g.restore()}
function effects(g,s){for(const f of s.fighters){if(f.belly){g.save();g.strokeStyle='#eac384';g.setLineDash([7,5]);g.beginPath();g.arc(f.belly.tx,f.belly.ty,90,0,7);g.stroke();g.restore()}if(f.meal){let m=f.meal;g.save();g.strokeStyle='#edbb75';g.fillStyle='#e7ad5925';g.beginPath();g.arc(m.x,m.y,88,0,7);g.fill();g.stroke();let t=m.age/.65,rise=Math.min(1,t/.3),fall=Math.max(0,(t-.58)/.42);let lift=135*rise*(1-fall*fall);g.globalAlpha=Math.min(1,t*8);food(g,m.x,m.y-lift,95*(.35+.65*rise));g.restore()}}for(const f of s.fx)if(f.type==='burger'){g.save();g.globalAlpha=Math.min(1,f.life*3);g.translate(f.x,f.y-12);let t=1-f.life/f.max;g.scale(1+.12*Math.sin(Math.min(1,t*4)*Math.PI),1-.12*Math.sin(Math.min(1,t*4)*Math.PI));food(g,0,0,95);g.restore()}}
function status(g,f,s){g.save();if(f.stun>0){g.fillStyle='#ffe29a';g.font='bold 12px system-ui';g.textAlign='center';g.fillText('STUNNED',f.x,f.y-150);for(let i=0;i<3;i++){let a=s.time*5+i*2.1;g.fillText('✦',f.x+Math.cos(a)*25,f.y-137+Math.sin(a)*6)}}if(f.charge){g.strokeStyle=f.charge.windup>0?'#d99d5e':'#fff1bd';g.lineWidth=4;g.beginPath();g.ellipse(f.x,f.y-45,47,67,0,0,7);g.stroke()}if(f.armorBuff>0){g.strokeStyle='#b5eb91';g.lineWidth=3;g.beginPath();g.arc(f.x,f.y,37,0,Math.PI*2*f.armorBuff/6);g.stroke()}g.restore()}
return {body,effects,status,pose};})();
