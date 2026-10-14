kits.alondras={name:'Alondras',hp:280,armor:10,speed:240,color:'#eaa5d7',skills:[['Spear Charge',10,'Three cursor-guided charges · 24 damage each · CC immune'],['Unseen Strikes',7,'Aim rectangle, then click · 32 damage · brief stun · hit resets cooldown'],['Blitzig Speed',16,'6 seconds · Shift dashes toward cursor every 0.5s'],['Queen of Pacifica',24,'Select an enemy within 330 · untargetable spear flurry for 3s']]};
function alondrasBusy(f){return !!(f.spearCharge||f.unseenLunge||f.queen)}
function ccImmune(f){return jakeImmune(f)||!!f.spearCharge||!!f.queen||f.invulnerable>0}
function alondrasTarget(s,f,x,y){return s.fighters.find(o=>o.id!==f.id&&o.hp>0&&!o.queen&&o.invulnerable<=0&&Math.hypot(o.x-f.x,o.y-f.y)<=330&&Math.hypot(o.x-x,o.y-y)<=o.r+30)}
function alondrasCast(s,f,i){f.attackLock=0;f.spearPose=.4;
 if(i===0){f.spearCharge={left:.22,gap:0,index:0,hits:[]};f.stun=f.freeze=f.slow=f.sweep=f.knockup=0;}
 if(i===1||i===3){f.alondrasAim=i;f.cd[i]=0;}
 if(i===2){f.blitz=6;f.dodgeCd=0;fx(s,'burst',f.x,f.y,'#edc6ff',80,.5);}
}
function alondrasConfirm(s,f,x,y){if(f.alondrasAim==null||f.stun>0||f.freeze>0||s.done||s.countdown>0)return false;
 const i=f.alondrasAim,a=Math.atan2(y-f.y,x-f.x);
 if(i===3){const target=alondrasTarget(s,f,x,y);if(!target)return false;f.queen={target:target.id,age:0,tick:0,strikes:0,origin:{x:f.x,y:f.y}};f.invulnerable=3;f.stun=f.freeze=f.slow=f.sweep=f.knockup=0;}
 else {f.aim=a;f.unseenLunge={x:f.x,y:f.y,a,age:0,hits:[]};f.spearPose=.35;}
 f.alondrasAim=null;f.cd[i]=kits.alondras.skills[i][1];f.vx=f.vy=0;return true;
}
function spearRect(o,x,y,a,length,width){const dx=o.x-x,dy=o.y-y,u=dx*Math.cos(a)+dy*Math.sin(a),v=-dx*Math.sin(a)+dy*Math.cos(a);return Math.hypot(u-clamp(u,0,length),v-clamp(v,-width/2,width/2))<=o.r;}
function spearTrail(s,f,x,y){s.fx.push({type:'spearTrail',x,y,tx:f.x,ty:f.y,angle:f.aim,color:'#f4bded',life:.3,max:.3});}
function alondrasBasic(s,f,x,y){f.basicCd=.48;f.spearPose=.28;f.aim=Math.atan2(y-f.y,x-f.x);s.events.push({type:'basic',kind:f.kind,skill:0});for(const o of s.fighters)if(o.id!==f.id&&spearRect(o,f.x,f.y,f.aim,80,28))damage(s,o,19,f.id);fx(s,'impact',f.x+Math.cos(f.aim)*65,f.y+Math.sin(f.aim)*65,'#ffe5ec',20,.22);}
function alondrasStep(s,f,dt,input){if(f.kind!=='alondras')return;f.blitz=Math.max(0,(f.blitz||0)-dt);f.spearPose=Math.max(0,(f.spearPose||0)-dt);
 if(f.stun>0||f.freeze>0){f.alondrasAim=null;f.unseenLunge=null;}
 if(f.spearCharge){const c=f.spearCharge;f.stun=f.freeze=f.slow=f.sweep=f.knockup=0;if(c.gap>0){c.gap=Math.max(0,c.gap-dt);return;}f.aim=Math.atan2((input.ay??f.y)-f.y,(input.ax??f.x+100)-f.x);let span=Math.min(dt,c.left),old={x:f.x,y:f.y};for(let k=0;k<5;k++){move(s,f,Math.cos(f.aim)*850*span/5,Math.sin(f.aim)*850*span/5);for(const o of s.fighters)if(o.id!==f.id&&!c.hits.includes(o.id)&&Math.hypot(o.x-f.x,o.y-f.y)<f.r+o.r+12){c.hits.push(o.id);damage(s,o,24,f.id);}}spearTrail(s,f,old.x,old.y);c.left=Math.max(0,c.left-span);f.moving=true;if(c.left<=.000001){c.index++;if(c.index===3)f.spearCharge=null;else {c.left=.22;c.gap=.16;c.hits=[];}}}
 if(f.unseenLunge){const l=f.unseenLunge,old={x:f.x,y:f.y};let span=Math.min(dt,.18-l.age);l.age+=span;f.aim=l.a;for(let k=0;k<5;k++)move(s,f,Math.cos(l.a)*1000*span/5,Math.sin(l.a)*1000*span/5);spearTrail(s,f,old.x,old.y);for(const o of s.fighters)if(o.id!==f.id&&!l.hits.includes(o.id)&&spearRect(o,l.x,l.y,l.a,Math.hypot(f.x-l.x,f.y-l.y)+55,46)){l.hits.push(o.id);if(o.invulnerable<=0&&!o.queen&&!jakeImmune(o)){damage(s,o,32,f.id);jakeCC(s,o,.55);if(f.id===0)f.cd[1]=0;fx(s,'burst',o.x,o.y,'#ffd5f1',72,.52);}}if(l.age>=.18-.000001)f.unseenLunge=null;}
 if(f.queen){const q=f.queen,t=s.fighters.find(o=>o.id===q.target);if(!t||t.hp<=0){f.queen=null;f.invulnerable=0;return;}q.age=Math.min(3,q.age+dt);q.tick-=dt;f.invulnerable=.12;f.stun=f.freeze=f.slow=f.sweep=f.knockup=0;let a=q.age*Math.PI*5,r=55+Math.sin(q.age*Math.PI*10)*32,old={x:f.x,y:f.y};let x=clamp(t.x+Math.cos(a)*r,85,1115),y=clamp(t.y+Math.sin(a)*r,130,610);if(!blocked(s,x,y,f.r)){f.x=x;f.y=y;}f.aim=Math.atan2(t.y-f.y,t.x-f.x);if(q.tick<=0&&q.strikes<12){q.tick+=.25;q.strikes++;damage(s,t,8,f.id);spearTrail(s,f,t.x,t.y);s.events.push({type:'basic',kind:f.kind,skill:3});}if(!input.reduced)spearTrail(s,f,old.x,old.y);if(q.age>=3){f.queen=null;f.invulnerable=0;f.attackLock=.1;}}
}
