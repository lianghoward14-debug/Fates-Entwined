// Presentation-only animation. Never writes to combat state; bounded effects and deterministic particles.
const CombatPolish=(()=>{
const states=new WeakMap(),TAU=Math.PI*2,colors={anicka:'#81e9ee',howard:'#ffe0a1',jake:'#e9bf81',alondras:'#f1b4df',maja:'#a9d9f3',felicyta:'#e9bce9'};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function state(s){if(!states.has(s))states.set(s,{time:0,units:new Map(),effects:[],seen:new WeakSet(),banner:null,shake:0});return states.get(s);}
function add(v,type,x,y,color,r=55,angle=0,life=.6){
// Every combat cue gets a compact, deterministic burst with a bright core,
// directional sparks and slower embers. Keeping particles attached to the
// existing bounded cue list makes the effect cost predictable in team fights.
const seed=(v.time*13+x*.17+y*.31+v.effects.length*7.3)%997;
const count=type==='dust'?7:type==='heal'?13:type==='hit'||type==='muzzle'?18:type==='defeat'?30:20;
const particles=Array.from({length:count},(_,i)=>{const a=angle+(i/count)*TAU+Math.sin(seed+i*12.7)*.22,speed=(type==='dust'?28:88)+(i%4)*32+(seed%17);return{a,v:speed,size:2+(i%3)*1.15,delay:(i%4)*.018,spin:(i%2?1:-1)*(1.4+(i%5)*.3)};});
v.effects.push({type,x,y,color,r,angle,life,max:life,seed,particles});if(v.effects.length>160)v.effects.shift();}
function activate(v,s,f,i){const c=colors[f.kind],u=v.units.get(f.id);u.cast=.65;u.skill=i;u.angle=f.aim;
const styles={anicka:['wake','wave','stars','vortex'],howard:['aim','blades','speed','volley'],jake:['weight','heal','charge','weight'],alondras:['slash','slash','speed','crown'],maja:['mechanical','volley','command','command'],felicyta:['runes','runes','seal','verdict']};
add(v,styles[f.kind][i],f.x,f.y,c,i===3?110:60,f.aim,.75);if(f.id===0)v.banner={text:Arena.kits[f.kind].skills[i][0],color:c,left:1.45,max:1.45};}
function update(s,dt,reduced){const v=state(s);dt=clamp(dt,0,.05);if(!dt)return;v.time+=dt;v.shake*=Math.exp(-dt*20);if(v.banner&&(v.banner.left-=dt)<=0)v.banner=null;for(const e of v.effects)e.life-=dt;v.effects=v.effects.filter(e=>e.life>0);
for(const f of s.fighters){let u=v.units.get(f.id);if(!u){u={hp:f.hp,x:f.x,y:f.y,cd:[...f.cd],cast:0,recoil:0,step:0,trail:0,gesture:0,debate:0,landing:0};v.units.set(f.id,u);}u.cast=Math.max(0,u.cast-dt);u.recoil=Math.max(0,u.recoil-dt);u.step-=dt;u.trail-=dt;
if(f.hp>0){for(let i=0;i<4;i++)if(f.cd[i]>u.cd[i]+.1)activate(v,s,f,i);
if(f.felPose>0&&(u.gesture!==f.felGesture||u.felPose<=0)){u.cast=.5;u.skill=f.skill;if(f.felGesture>0)add(v,'verdict',f.x,f.y,colors.felicyta,150+f.felGesture*35,f.aim,.48);}
if(f.hp<u.hp){u.recoil=.18;const loss=u.hp-f.hp;add(v,'hit',f.x,f.y-45,loss>35?'#fff0cf':colors[f.kind],Math.min(75,25+loss),f.aim,.33);if(f.id===0)v.shake=Math.min(4,v.shake+loss*.035);}
if(f.hp>u.hp&&u.hp>0)add(v,'heal',f.x,f.y-20,'#acedd0',35,0,.8);
const distance=Math.hypot(f.x-u.x,f.y-u.y);if(!reduced&&distance>1&&distance<100&&u.step<=0){u.step=f.tank?.09:.16;add(v,'dust',f.x,f.y+5,'#d6c8a9',f.tank?25:12,Math.atan2(f.y-u.y,f.x-u.x),.45);}
if(!reduced&&u.trail<=0&&(f.sail||f.phase||f.spearCharge||f.unseenLunge||f.charge||f.dodge)){u.trail=.045;add(v,f.kind==='anicka'?'wake':f.kind==='jake'?'dust':'speed',f.x,f.y,colors[f.kind],f.charge?45:32,f.aim,.3);}
if(f.landing>0&&u.landing<=0){add(v,'weight',f.x,f.y,colors.jake,110,0,.7);v.shake=Math.max(v.shake,3);}
if(f.hp>0&&u.hp<=0)add(v,'stars',f.x,f.y,colors[f.kind],65,0,.9);
}else if(u.hp>0)add(v,'defeat',f.x,f.y-35,colors[f.kind],80,0,1);
u.hp=f.hp;u.x=f.x;u.y=f.y;u.cd=[...f.cd];u.gesture=f.felGesture;u.felPose=f.felPose;u.landing=f.landing;}
for(const q of s.shots){if(v.seen.has(q))continue;v.seen.add(q);const f=s.fighters.find(f=>f.id===q.owner),u=f&&v.units.get(f.id);if(u)u.cast=Math.max(u.cast,.22);if(!reduced&&q.kind==='bullet')add(v,'muzzle',q.x,q.y,'#fff0bd',18,Math.atan2(q.dy,q.dx),.13);}
}
function ring(g,x,y,r,c,w=2){g.strokeStyle=c;g.lineWidth=w;g.beginPath();g.arc(x,y,Math.max(1,r),0,TAU);g.stroke();}
function glow(g,x,y,r,c,alpha){const q=g.createRadialGradient(x,y,0,x,y,r);q.addColorStop(0,c);q.addColorStop(.35,c);q.addColorStop(1,'transparent');g.globalAlpha=alpha;g.fillStyle=q;g.beginPath();g.arc(x,y,r,0,TAU);g.fill();}
function shard(g,x,y,size,angle,color,alpha){g.save();g.translate(x,y);g.rotate(angle);g.globalAlpha=alpha;g.fillStyle=color;g.beginPath();g.moveTo(-size*.28,-size);g.lineTo(size*.35,-size*.3);g.lineTo(size*.2,size);g.lineTo(-size*.35,size*.35);g.closePath();g.fill();g.restore();}
function particles(g,e,p){const fade=Math.max(0,1-p);for(const q of e.particles){const age=clamp((p*e.max-q.delay)/Math.max(.08,e.max-q.delay),0,1);if(age<=0)continue;const d=q.v*e.max*(age-age*age*.28),a=q.a+age*q.spin,x=e.x+Math.cos(a)*d,y=e.y+Math.sin(a)*d;g.globalAlpha=fade*(1-age*.6);g.strokeStyle=age<.28?'#fff4d6':e.color;g.lineWidth=Math.max(.7,q.size*(1-age));g.beginPath();g.moveTo(x-Math.cos(a)*q.size*2,y-Math.sin(a)*q.size*2);g.lineTo(x+Math.cos(a)*q.size*2,y+Math.sin(a)*q.size*2);g.stroke();if(q.size>2&&age<.65)shard(g,x,y,q.size*1.6,a,e.color,fade*(1-age)*.7);}}
function star(g,x,y,r,c){g.fillStyle=c;g.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,rr=i%2?r*.28:r;i?g.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr):g.moveTo(x+rr,y);}g.closePath();g.fill();}
function ground(g,s,reduced){const v=state(s);g.save();for(const f of s.fighters){if(f.hp<=0)continue;const c=colors[f.kind],u=v.units.get(f.id);if(!u)continue;
// Sustained abilities carry a readable, character-specific silhouette.
if(f.kind==='anicka'&&f.sail>0){for(let i=0;i<3;i++){const d=25+i*17;g.globalAlpha=.35-i*.08;g.strokeStyle=c;g.lineWidth=2;g.beginPath();g.ellipse(f.x-Math.cos(f.aim)*d,f.y-Math.sin(f.aim)*d,20+i*9,8+i*5,f.aim,0,TAU);g.stroke();}}
if(f.kind==='howard'&&(f.knives||f.footballs||f.fury)){g.globalAlpha=.7;const count=f.fury?6:f.footballs||3;for(let i=0;i<count;i++){const a=i*TAU/count+(reduced?0:v.time*1.4);star(g,f.x+Math.cos(a)*36,f.y+Math.sin(a)*12,3,f.knives?'#efa5b5':c);}}
if(f.kind==='jake'&&f.charge){g.globalAlpha=.6;g.save();g.translate(f.x,f.y);g.rotate(f.aim);for(let i=0;i<3;i++){g.strokeStyle=c;g.lineWidth=3;g.beginPath();g.moveTo(40+i*20,-16);g.lineTo(52+i*20,0);g.lineTo(40+i*20,16);g.stroke();}g.restore();}
if(f.kind==='alondras'&&(f.blitz||f.queen)){g.globalAlpha=.65;for(let i=0;i<3;i++){const a=(reduced?0:v.time*3)+i*TAU/3;g.strokeStyle=c;g.lineWidth=2;g.beginPath();g.ellipse(f.x,f.y,36,15,0,a,a+1);g.stroke();}}
if(f.kind==='maja'&&(f.tank||f.commandPose>0)){g.globalAlpha=.5;g.strokeStyle=c;g.lineWidth=2;for(let i=0;i<4;i++){const a=i*Math.PI/2;g.beginPath();g.arc(f.x,f.y,45,a+.15,a+.8);g.stroke();}}
if(f.kind==='felicyta'&&f.debate>0){g.globalAlpha=.4;const radius=reduced?280:90+(v.time*.55%1)*230;ring(g,f.x,f.y,radius,c,1.5);}
g.globalAlpha=1;
}
for(const f of s.fighters){if(f.hp<=0)continue;
if(f.path){g.globalAlpha=.8;for(const [i,p]of f.path.points.entries()){star(g,p.x,p.y,7+(reduced?0:Math.sin(v.time*3+i)*1.5),'#e7daff');}}
if(f.kind==='jake'&&f.belly){const b=f.belly,p=clamp(b.age/.65,0,1);g.globalAlpha=.4;ring(g,b.tx,b.ty,90,'#e9bf81',2);g.globalAlpha=.2;g.fillStyle='#e9bf81';g.beginPath();g.arc(b.tx,b.ty,90*p,0,TAU);g.fill();}
if(f.kind==='maja'&&f.tank&&!reduced){g.globalAlpha=.25;g.strokeStyle='#2f4650';g.lineWidth=3;for(const side of [-1,1])for(let i=0;i<4;i++){const y=f.y+side*27,x=f.x-36+i*18+(f.moving?v.time*45%18:0);g.beginPath();g.moveTo(x,y);g.lineTo(x+8,y);g.stroke();}}
}g.globalAlpha=1;
for(const e of v.effects){if(!['dust','weight','mechanical','command','wake','seal'].includes(e.type))continue;const p=1-e.life/e.max,ease=1-(1-p)**3;g.globalAlpha=(1-p)*.65;if(e.type==='dust'){for(let i=0;i<(reduced?2:5);i++){const a=e.angle+Math.PI+(i-2)*.35;g.fillStyle=e.color;g.beginPath();g.ellipse(e.x+Math.cos(a)*p*e.r,e.y+Math.sin(a)*p*e.r,3+p*5,2+p*2,0,0,TAU);g.fill();}}else{glow(g,e.x,e.y,Math.min(150,e.r*.85)*(1-p*.6),e.color,.16*(1-p));ring(g,e.x,e.y,e.r*(.2+.8*ease),e.color,4*(1-p)+1);ring(g,e.x,e.y,e.r*(.12+.76*ease),'#fff2d2',1.2*(1-p));if(e.type==='weight'||e.type==='mechanical'||e.type==='command'){const n=e.type==='weight'?8:6;for(let i=0;i<n;i++){let a=i*TAU/n+(e.type==='command'?p*1.3:0),outer=e.r*(.18+.82*ease);g.strokeStyle=e.color;g.lineWidth=e.type==='weight'?2.2:1.5;g.beginPath();g.moveTo(e.x+Math.cos(a)*15,e.y+Math.sin(a)*15);g.lineTo(e.x+Math.cos(a)*outer,e.y+Math.sin(a)*outer);g.stroke();if(e.type==='command'){star(g,e.x+Math.cos(a)*outer,e.y+Math.sin(a)*outer,4,e.color);}}}if(!reduced)particles(g,e,p);}}
g.restore();}
function pose(g,f,s,reduced){if(reduced)return;const u=state(s).units.get(f.id);if(!u)return;const side=Math.cos(f.aim)<0?-1:1;let x=0,y=0,a=0,sx=1,sy=1;if(f.moving&&!f.belly&&!f.charge){a=Math.sin(f.animation*Math.PI)*.018;y=-Math.abs(Math.sin(f.animation*Math.PI))*1.1;}
if(u.cast>0&&!f.belly&&!f.charge&&!f.meal&&!f.eating){const p=1-u.cast/.65,anticipation=Math.sin(clamp(p/.22,0,1)*Math.PI),release=Math.sin(clamp((p-.2)/.8,0,1)*Math.PI);const weight=f.kind==='jake'?1.5:f.kind==='alondras'?1.2:1;a+=(-anticipation*.045+release*.035)*weight*side;x+=(-anticipation*2+release*3)*side;sy+=anticipation*.018-release*.025;sx-=anticipation*.015-release*.02;}
if(f.bow>0){a-=.04*(1-f.bow/.3)*side;x-=3*(1-f.bow/.3)*side;}
if(f.spearCharge||f.unseenLunge){a+=.055*side;sx*=1.025;sy*=.975;}
if(f.gunPose>0){x-=Math.min(1,f.gunPose/.18)*2*side;a-=.018*side;}
if(f.debate>0){y+=Math.sin(state(s).time*2.8)*.8;a+=Math.sin(state(s).time*2.8)*.008;}
if(u.recoil>0){a-=Math.sin(u.recoil/.18*Math.PI)*.045*side;x-=u.recoil/.18*3*side;}g.translate(x,y);g.rotate(a);g.scale(sx,sy);}
function foreground(g,s,reduced){const v=state(s);g.save();g.lineCap='round';
// Tapered trails indicate direction without obscuring targets.
if(!reduced)for(const q of s.shots){if(q.wave)continue;g.strokeStyle=q.color||colors[s.fighters[q.owner]?.kind]||'#fff';for(let i=0;i<3;i++){g.globalAlpha=.22*(1-i/3);g.lineWidth=Math.max(1,(q.r||5)*.65-i);g.beginPath();g.moveTo(q.x-q.dx*(8+i*12),q.y-q.dy*(8+i*12));g.lineTo(q.x-q.dx*(22+i*12),q.y-q.dy*(22+i*12));g.stroke();}}
for(const f of s.fighters){if(f.hp<=0)continue;if(f.bow>0){g.save();g.translate(f.x,f.y-55);g.rotate(f.aim);g.globalAlpha=.6;g.strokeStyle=colors.howard;g.lineWidth=2;g.beginPath();g.moveTo(20,-12);g.lineTo(80*(1-f.bow/.3)+20,0);g.lineTo(20,12);g.stroke();g.restore();}if(f.queen){const t=s.fighters.find(t=>t.id===f.queen.target);if(t){g.globalAlpha=.7;const a=reduced?0:v.time*9;g.strokeStyle=colors.alondras;g.lineWidth=3;g.beginPath();g.ellipse(t.x,t.y-50,45,65,a,0,Math.PI*.7);g.stroke();}}if(f.debate>0&&!reduced){g.globalAlpha=.65;g.fillStyle='#f5e5cf';for(let i=0;i<3;i++){const a=v.time*1.8+i*TAU/3;g.save();g.translate(f.x+Math.cos(a)*40,f.y-65+Math.sin(a)*20);g.rotate(a*.2);g.fillRect(-3,-5,6,10);g.restore();}}}
for(const e of v.effects){if(['dust','weight','mechanical','command','wake','seal'].includes(e.type))continue;const p=1-e.life/e.max,ease=1-(1-p)**3;g.globalAlpha=(1-p)*.85;g.save();g.translate(e.x,e.y);g.strokeStyle=e.color;g.fillStyle=e.color;
if(!reduced){glow(g,0,0,e.type==='defeat'?e.r*.75:e.r*.45,e.color,e.type==='heal'?.2:.28);particles(g,{...e,x:0,y:0},p);}
if(e.type==='hit'||e.type==='muzzle'){const r=e.r*(.3+ease*.7);g.globalAlpha*=Math.sin(Math.min(1,p*4)*Math.PI)*.65+.35;star(g,0,0,r*(1-p)*.5,'#fff8e4');for(let i=0;i<(reduced?3:10);i++){let a=e.angle+i*TAU/10;g.lineWidth=2.5*(1-p)+.5;g.beginPath();g.moveTo(Math.cos(a)*r*.28,Math.sin(a)*r*.28);g.lineTo(Math.cos(a)*r,Math.sin(a)*r);g.stroke();}ring(g,0,0,r*(.25+ease*.82),'#fff2d3',Math.max(.7,3*(1-p)));}
else if(e.type==='heal'){ring(g,0,0,e.r*(.3+ease*.8),'#d8ffe5',2*(1-p));for(let i=0;i<5;i++){let x=Math.sin(i*2.2+p*4)*22,y=-ease*(32+i*9);g.globalAlpha=(1-p)*.8;g.fillStyle=i%2?'#f5e5a2':'#baf7d2';g.beginPath();g.ellipse(x,y,3,7,-.3,0,TAU);g.fill();}}
else if(e.type==='wave'){g.rotate(e.angle);const r=e.r*(.3+.9*ease);for(let i=0;i<3;i++){g.globalAlpha=(1-p)*(.9-i*.18);g.lineWidth=12-i*2;g.beginPath();g.ellipse(r*.42,0,r*(.52+i*.14),r*(.42+i*.15),0,-1.02,1.02);g.stroke();g.strokeStyle=i===0?'#f5ffff':'#a9fbf2';g.lineWidth=2;g.beginPath();g.ellipse(r*.42,0,r*(.52+i*.14),r*(.42+i*.15),0,-1.02,1.02);g.stroke();}g.globalAlpha=(1-p)*.85;for(let i=-2;i<=2;i++){g.beginPath();g.moveTo(r*.45,i*r*.15);g.lineTo(r*(.9+ease*.25),i*r*.21);g.stroke();}}
else if(['slash','verdict','aim','volley','blades','charge','speed'].includes(e.type)){g.rotate(e.angle);const r=e.r*(.35+.65*ease),isHeavy=e.type==='verdict'||e.type==='charge';g.globalAlpha*=.7+Math.sin(p*Math.PI*3)*.3;g.lineWidth=(isHeavy?11:6)*(1-p)+1;g.beginPath();g.arc(0,0,r,-.88,.88);g.stroke();g.strokeStyle='#fff8e9';g.lineWidth=2*(1-p)+.5;g.beginPath();g.arc(0,0,r*.88,-.73,.73);g.stroke();g.lineWidth=1.5;g.beginPath();g.arc(0,0,r+13,-.6,.6);g.stroke();for(let i=0;i<5;i++){const a=-.72+i*.36,rr=r*(.55+(i%2)*.2);g.lineWidth=(i%2?2:3)*(1-p)+.5;g.beginPath();g.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);g.lineTo(Math.cos(a)*(r*1.24),Math.sin(a)*(r*1.24));g.stroke();}if(e.type==='verdict'){g.font='italic 26px Georgia';g.fillText('§',r-15,-10);}if(['speed','charge','volley'].includes(e.type))for(let i=-1;i<=1;i++){g.globalAlpha=(1-p)*.7;g.beginPath();g.moveTo(-35-ease*55,i*20);g.lineTo(-5,i*20);g.stroke();}}
else if(e.type==='runes'){for(let i=0;i<5;i++){const a=i*TAU/5+ease;g.save();g.translate(Math.cos(a)*e.r*ease,Math.sin(a)*e.r*ease-35);g.rotate(a);g.fillStyle='#f5e5cf';g.fillRect(-4,-6,8,12);g.restore();}}
else if(e.type==='crown'){const r=e.r*(.3+.7*ease);g.globalAlpha=(1-p)*.9;g.lineWidth=3*(1-p)+1;g.strokeStyle='#fff0c9';g.beginPath();g.moveTo(-r*.55,-r*.18);g.lineTo(-r*.5,-r*.52);g.lineTo(-r*.2,-r*.28);g.lineTo(0,-r*.62);g.lineTo(r*.2,-r*.28);g.lineTo(r*.5,-r*.52);g.lineTo(r*.55,-r*.18);g.closePath();g.stroke();g.fillStyle=e.color;g.globalAlpha=(1-p)*.65;g.fill();for(let i=-1;i<=1;i++)star(g,i*r*.35,-r*.54,5,'#fff2cb');ring(g,0,0,r*.82,e.color,2);}
else {for(let i=0;i<(reduced?3:10);i++){const a=i*TAU/10+e.seed;star(g,Math.cos(a)*e.r*ease,Math.sin(a)*e.r*ease-20,e.type==='crown'?7:5,e.color);}}
g.restore();}
g.restore();}
function camera(g,s,reduced){if(reduced)return;const v=state(s),strength=Math.min(3,Math.max(v.shake,s.shake*.35));g.translate(Math.sin(v.time*49)*strength,Math.cos(v.time*43)*strength*.5);}
function overlay(g,s,reduced){const v=state(s),b=v.banner;if(!b||s.countdown>0||s.done)return;const alpha=Math.min(1,b.left*4,(b.max-b.left)*8);g.save();g.globalAlpha=alpha;g.textAlign='center';g.font='600 13px system-ui';const w=Math.min(500,g.measureText(b.text).width+54),y=610+(reduced?0:Math.max(0,.15-(b.max-b.left))*35);g.fillStyle='#0a2034dd';g.beginPath();g.roundRect(600-w/2,y,w,31,6);g.fill();g.fillStyle=b.color;g.fillRect(600-w/2,y+5,2,21);g.fillStyle='#fff4db';g.fillText(b.text,600,y+20);g.restore();}
return{update,ground,foreground,pose,camera,overlay,stats:s=>({effects:state(s).effects.length,units:state(s).units.size})};})();
