// Jake: all damage originates at his body or an adjacent melee impact.
kits.jake={name:'Jake',hp:460,armor:40,speed:175,color:'#d9a15d',skills:[['Belly Slam',8,'Leap up to 180 · impact 36 damage · knock up + stun 1.4s'],['Consume',12,'Eat a taco · heal 85 · +60 armor for 6s'],['Momentum Charge',16,'Wind up · steer for 5s · accelerate · damage + CC immune'],['Munchie Meal Special',22,'Slam a giant burger in front · 65 damage · stun 3s']]};
function jakeBusy(f){return !!(f.belly||f.charge||f.meal)}
function jakeImmune(f){return !!(f.charge&&f.charge.windup<=0&&f.charge.left>0)}
function jakeCC(s,o,duration,up=0,dx=0,dy=0){if(o.invulnerable>0||jakeImmune(o))return;o.stun=Math.max(o.stun||0,duration);o.knockup=Math.max(o.knockup||0,up);o.sail=0;o.dash=0;o.belly=null;o.meal=null;o.charge=null;o.vx=o.vy=0;for(let n=0;n<10;n++)move(s,o,dx/10,dy/10);}
function jakeCast(s,f,i,ax,ay){
 f.punch=0;f.punchPending=false;f.landing=0;f.mealRecovery=0;f.eating=0;
 if(i===0){let a=f.aim,d=Math.min(180,Math.hypot(ax-f.x,ay-f.y)),tx=clamp(f.x+Math.cos(a)*d,85,1115),ty=clamp(f.y+Math.sin(a)*d,130,610);while(blocked(s,tx,ty,f.r)&&d>0){d=Math.max(0,d-5);tx=clamp(f.x+Math.cos(a)*d,85,1115);ty=clamp(f.y+Math.sin(a)*d,130,610)}f.belly={x:f.x,y:f.y,tx,ty,age:0};f.cast=f.castMax=.65;}
 if(i===1){f.hp=Math.min(f.maxHp,f.hp+85);f.armorBuff=6;f.eating=.85;fx(s,'heal',f.x,f.y,'#a8f4ac',65,.8);}
 if(i===2){f.charge={windup:.55,left:5,age:0,hits:[]};f.vx=f.vy=0;f.cast=f.castMax=.55;}
 if(i===3){f.meal={age:0,angle:f.aim,x:f.x+Math.cos(f.aim)*82,y:f.y+Math.sin(f.aim)*82};f.cast=f.castMax=.85;}
}
function jakeStep(s,f,dt,input){
 if(f.punchPending&&f.punch<=.28){f.punchPending=false;if(!f.stun&&!f.freeze&&!jakeBusy(f)){let a=f.punchAngle;fx(s,'impact',f.x+Math.cos(a)*45,f.y+Math.sin(a)*45,'#e9bb7a',25,.25);for(const o of s.fighters)if(o.id!==f.id&&Math.hypot(o.x-f.x,o.y-f.y)<70+o.r&&(o.x-f.x)*Math.cos(a)+(o.y-f.y)*Math.sin(a)>0)damage(s,o,24,f.id);}}

 if(f.belly){let b=f.belly;b.age+=dt;let t=Math.min(1,b.age/.65);let travel=Math.max(0,(t-.18)/.82);f.x=b.x+(b.tx-b.x)*travel;f.y=b.y+(b.ty-b.y)*travel;if(t===1){f.belly=null;f.landing=.28;fx(s,'burst',f.x,f.y,'#e9bb7a',90,.65);s.shake=9;for(const o of s.fighters)if(o.id!==f.id&&Math.hypot(o.x-f.x,o.y-f.y)<90+o.r){damage(s,o,36,f.id);jakeCC(s,o,1.4,.55);}}}
 if(f.charge){let c=f.charge;if(c.windup>0){c.windup=Math.max(0,c.windup-dt);return}let span=Math.min(dt,c.left);c.age+=span;c.left=Math.max(0,c.left-span);f.freeze=f.slow=f.sweep=f.stun=f.knockup=0;f.aim=Math.atan2((input.ay??f.y)-f.y,(input.ax??f.x+100)-f.x);let speed=240+Math.min(1,c.age/4)*400;f.chargeSpeed=speed;f.moving=true;let dx=Math.cos(f.aim),dy=Math.sin(f.aim);for(let k=0;k<4;k++){move(s,f,dx*speed*span/4,dy*speed*span/4);for(const o of s.fighters)if(o.id!==f.id&&!c.hits.includes(o.id)&&Math.hypot(o.x-f.x,o.y-f.y)<f.r+o.r+10){c.hits.push(o.id);damage(s,o,42,f.id);jakeCC(s,o,1.8,.25,dx*110,dy*110);}}fx(s,'ghost',f.x-dx*25,f.y-dy*25,'#eec78c',25,.25);if(c.left<=0)f.charge=null;}
 if(f.meal){let m=f.meal;m.age+=dt;if(m.age>=.65){fx(s,'burger',m.x,m.y,'#e8ad58',88,.8);s.shake=10;for(const o of s.fighters)if(o.id!==f.id&&Math.hypot(o.x-m.x,o.y-m.y)<88+o.r&&(o.x-f.x)*Math.cos(m.angle)+(o.y-f.y)*Math.sin(m.angle)>=0){damage(s,o,65,f.id);jakeCC(s,o,3);}f.meal=null;f.mealRecovery=.3;}}
}
