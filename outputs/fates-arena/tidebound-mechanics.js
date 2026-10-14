function tidalCast(s,f,i,tx,ty){
 if(i===0){f.sail=3;f.sailAngle=f.aim;f.wake=0;f.sailHits=[];f.attackLock=0;}
 if(i===1){f.cast=f.castMax=.6;f.attackLock=.25;for(let j=-1;j<=1;j++)shot(s,f,f.aim,{x:f.x-Math.sin(f.aim)*j*62,y:f.y+Math.cos(f.aim)*j*62,speed:660,r:46,damage:19,life:1.4,kind:'wave',wave:true,pierce:true,group:s.time,sweep:true});s.shake=4;}
 if(i===2){f.path={points:[],age:0};f.vx=f.vy=0;f.attackLock=0;}
 if(i===3){f.cast=f.castMax=1;f.attackLock=.7;zone(s,f,'vortex',tx,ty,195,.65,5.5,{maelstrom:true,pulse:0});s.shake=9;}
}
function addStar(s,f,x,y){
 if(!f.path||s.done||s.countdown>0||!Number.isFinite(x)||!Number.isFinite(y))return false;
 let p=f.path.points.at(-1)||f,d=Math.hypot(x-p.x,y-p.y);
 if(d>230||d<24||x<85||x>1115||y<130||y>610){f.path.invalid=.55;return false;}
 f.path.points.push({x,y});s.events.push({type:'star',kind:'anicka',skill:2,n:f.path.points.length});
 if(f.path.points.length===4){f.phase={points:f.path.points,index:0,hits:[],trail:[],windup:.35};f.path=null;f.invulnerable=.4;f.freeze=0;f.sweep=0;f.soaked=0;f.slow=0;}
 return true;
}
function basic(s,f,x,y){if(f.basicCd>0||f.path||f.phase||f.sail||f.freeze||f.attackLock>0||s.done||s.countdown>0)return;f.basicCd=.65;if(f.kind==='anicka'){f.aim=Math.atan2(y-f.y,x-f.x);shot(s,f,f.aim,{damage:12,soak:true});f.cast=f.castMax=.25;s.events.push({type:'basic',kind:f.kind,skill:0});}else if(f.cd[0]<=0)cast(s,f,0,x,y);}
function tidalStep(s,f,dt,input){
 if(f.sweep>0&&!f.phase){f.sweep-=dt;move(s,f,f.sweepX*420*dt,f.sweepY*420*dt);}
 if(f.path){f.path.age+=dt;f.path.invalid=Math.max(0,(f.path.invalid||0)-dt);if(f.id===1&&f.path.age>.7){let p=f.path.points.at(-1)||f;addStar(s,f,clamp(p.x+(f.x<600?100:-100),85,1115),clamp(p.y+Math.sin(s.time*4)*100,130,610));}if(f.path&&f.path.age>10){f.path=null;f.cd[2]=1;}}
 if(f.phase){let ph=f.phase;f.invulnerable=.15;f.freeze=0;ph.windup-=dt;if(ph.windup>0)return;let p=ph.points[ph.index],dx=p.x-f.x,dy=p.y-f.y,d=Math.hypot(dx,dy),travel=Math.min(d,850*dt),old={x:f.x,y:f.y};f.x+=dx/(d||1)*travel;f.y+=dy/(d||1)*travel;f.aim=Math.atan2(dy,dx);ph.trail.push({x:f.x,y:f.y});if(ph.trail.length>22)ph.trail.shift();fx(s,'ghost',old.x,old.y,'#d3c4ff',24,.38);
 for(const o of s.fighters){if(o.id===f.id||ph.hits.includes(o.id))continue;let vx=f.x-old.x,vy=f.y-old.y,u=clamp(((o.x-old.x)*vx+(o.y-old.y)*vy)/(vx*vx+vy*vy||1),0,1);if(Math.hypot(o.x-old.x-vx*u,o.y-old.y-vy*u)<f.r+o.r){ph.hits.push(o.id);let heal=Math.min(35,f.maxHp-f.hp);f.hp+=heal;fx(s,'heal',f.x,f.y,'#baffdf',65,.7);s.fx.push({type:'text',x:f.x,y:f.y-70,text:'+'+Math.round(heal),color:'#c8ffe3',life:1,max:1});s.events.push({type:'heal',kind:'anicka',skill:2});}}
 if(d<=travel+.01){ph.index++;if(ph.index===4){f.phase=null;f.invulnerable=.05;f.cd[2]=11;if(blocked(s,f.x,f.y,f.r)){for(let radius=24;radius<160;radius+=12){let found=false;for(let a=0;a<6.28;a+=.4){let x=clamp(f.x+Math.cos(a)*radius,85,1115),y=clamp(f.y+Math.sin(a)*radius,130,610);if(!blocked(s,x,y,f.r)){f.x=x;f.y=y;found=true;break}}if(found)break}}fx(s,'burst',f.x,f.y,'#f0dfff',70,.5);}}}
 if(f.sail>0){f.sail-=dt;let target=Math.atan2((input.ay??f.y)-f.y,(input.ax??f.x+100)-f.x),diff=Math.atan2(Math.sin(target-f.sailAngle),Math.cos(target-f.sailAngle));f.sailAngle+=clamp(diff,-dt*3.8,dt*3.8);f.aim=f.sailAngle;move(s,f,Math.cos(f.aim)*390*dt,Math.sin(f.aim)*390*dt);f.moving=true;f.wake-=dt;if(f.wake<=0){f.wake=.045;fx(s,'wake',f.x-Math.cos(f.aim)*32,f.y-Math.sin(f.aim)*32,'#a5f4f5',32,.65);}for(const o of s.fighters)if(o.id!==f.id&&!f.sailHits.includes(o.id)&&Math.hypot(o.x-f.x,o.y-f.y)<65){damage(s,o,24,f.id);o.sweep=.24;o.sweepX=Math.cos(f.aim);o.sweepY=Math.sin(f.aim);f.sailHits.push(o.id);}if(f.sail<=0){f.sail=0;fx(s,'splash',f.x,f.y,'#d6ffff',75,.6);}}
}
