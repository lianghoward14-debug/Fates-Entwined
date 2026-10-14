const A=require('./tidebound-engine.js'),assert=require('node:assert/strict');
function setup(){let s=A.create('jake');s.countdown=0;s.walls=[];s.fighters[0].x=400;s.fighters[1].x=490;return s}
function tick(s,t,input={}){for(let n=0;n<Math.ceil(t/.02);n++){s.hitstop=0;A.step(s,.02,input,false)}}
let s=setup(),[p,b]=s.fighters;b.x=600;A.basic(s,p,1000,350);tick(s,.12);assert.equal(s.shots.length,0);assert.equal(b.hp,b.maxHp);p.basicCd=0;b.x=460;A.basic(s,p,460,350);assert.equal(b.hp,b.maxHp);tick(s,.12);assert(b.hp<b.maxHp);
s=setup();[p,b]=s.fighters;A.cast(s,p,0,490,350);tick(s,.66);assert(b.stun>1);assert(b.knockup>0);assert(Math.abs(p.x-490)<23);let bx=b.x;tick(s,.1);assert(Math.abs(b.x-bx)<1);assert.equal(A.cast(s,b,0,p.x,p.y),false);
s=setup();[p,b]=s.fighters;p.hp=200;A.cast(s,p,1,490,350);assert.equal(p.hp,285);assert.equal(p.armorBuff,6);let dealt=A.damage(s,p,100,1);assert.equal(dealt,50);tick(s,6.02);assert.equal(p.armorBuff,0);
s=setup();[p,b]=s.fighters;A.cast(s,p,2,1000,350);tick(s,.54,{ax:1000,ay:350});assert.equal(p.x,400);tick(s,.04,{ax:1000,ay:350});let hp=p.hp;assert.equal(A.damage(s,p,100,1),0);assert.equal(p.hp,hp);tick(s,.4,{ax:1000,ay:350});assert(b.stun>0);assert(b.x>490);let speed=p.chargeSpeed;tick(s,1,{ax:1000,ay:350});assert(p.chargeSpeed>speed);let y=p.y;tick(s,.2,{ax:p.x,ay:600});assert(p.y>y);tick(s,3,{ax:600,ay:350});assert(p.charge);tick(s,.5,{ax:600,ay:350});assert.equal(p.charge,null);assert(A.damage(s,p,100,1)>0);
s=setup();[p,b]=s.fighters;A.cast(s,p,3,1000,350);assert.equal(b.hp,b.maxHp);tick(s,.66);assert(b.hp<b.maxHp);assert(b.stun>2.9);assert.equal(s.shots.length,0);
s=setup();[p,b]=s.fighters;b.x=350;A.cast(s,p,3,1000,350);tick(s,.7);assert.equal(b.hp,b.maxHp);
for(const kind of ['anicka','howard','jake']){s=A.create(kind);s.countdown=0;for(let n=0;n<1200&&!s.done;n++){A.step(s,.02,{basic:true,ax:s.fighters[1].x,ay:s.fighters[1].y,abilities:n%100===0?[n/100%4]:[]},true)}assert(s.fighters.every(f=>Number.isFinite(f.hp)&&Number.isFinite(f.x)))}
console.log('PASS: melee, leap/knockup/stun, healing/armor expiry, charge windup/duration/steering/acceleration/immunity/knockback, directional burger, three-character simulation');



// Incoming control must not displace, stun, slow, or damage an active charge.
s=setup();[p,b]=s.fighters;b.x=900;A.cast(s,p,2,1000,350);tick(s,.58,{ax:1000,ay:350});hp=p.hp;s.shots.push({owner:1,x:p.x,y:p.y,dx:0,dy:0,speed:0,r:80,damage:50,life:1,hit:[],sweep:true,soak:true,freeze:true,mark:true});s.zones.push({owner:1,type:'vortex',x:p.x,y:p.y,r:180,delay:0,life:2,tick:0});tick(s,.02,{ax:1000,ay:350});assert.equal(p.hp,hp);for(const key of ['freeze','slow','sweep','stun','mark','soaked'])assert.equal(p[key],0,key);assert(p.charge);
console.log('PASS: active charge rejects incoming wave and vortex damage/control');
