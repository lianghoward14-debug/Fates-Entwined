const A=require('./campus-engine.js'),assert=require('node:assert/strict');
function setup(){const s=A.create('felicyta','ffa');s.countdown=0;s.walls=[];const f=s.fighters[0],t=s.fighters[1];f.x=600;f.y=600;t.x=800;t.y=600;t.armor=100;t.hp=t.maxHp=1000;f.hp=100;for(const o of s.fighters.slice(2)){o.x=2000;o.y=1800;}return {s,f,t};}
function tick(s,n=1,input={}){for(let i=0;i<n;i++){s.hitstop=0;A.step(s,.04,input,false);}}
{let {s,f,t}=setup();assert(A.cast(s,f,0,t.x,t.y));assert(!A.felicytaConfirm(s,f,2500,1800));assert.equal(f.cd[0],0);assert(A.felicytaConfirm(s,f,t.x,t.y));assert.equal(f.armor,80);assert.equal(t.hp,950);assert.equal(f.hp,150);}
{let {s,f,t}=setup();A.cast(s,f,2,t.x,t.y);A.felicytaConfirm(s,f,t.x,t.y);let hit=A.damage(s,t,80,2);assert.equal(hit,50);assert.equal(f.hp,110);tick(s,151);assert.equal(t.rhetoric,null);}
{let {s,f,t}=setup();A.cast(s,f,1,t.x,t.y);let before=f.hp;A.damage(s,f,100,t.id);assert(Math.abs(before-f.hp-50*100/130)<1e-8);tick(s);assert(t.hp<1000);assert(f.hp>before-50*100/130);tick(s,1,{x:1});assert.equal(f.debate,0);}
{let {s,f,t}=setup();A.cast(s,f,3,t.x,t.y);for(let i=0;i<3;i++){assert(A.felicytaConfirm(s,f,t.x,t.y));assert.equal(f.felGesture,i+1);assert(!A.felicytaConfirm(s,f,t.x,t.y));tick(s,13);}assert.equal(f.felAim,null);assert(Math.abs(t.armor-100*.85**3)<1e-8);assert(Math.abs(f.armor-(130-t.armor))<1e-8);assert(Math.abs(t.rhetoricPower-.85**3)<1e-8);assert(t.hp<1000);}
{let {s,f,t}=setup();A.cast(s,f,1,t.x,t.y);A.damage(s,f,99999,t.id);assert.equal(f.debate,0);tick(s,110);assert.equal(f.armor,30);assert.equal(f.rhetoricPower,1);}
console.log('PASS: Felicyta targeting, armor gain, drain, ally amplification/healing/expiry, channel suppression/cancel, three independent cones/gestures/stacking, death and respawn');
// Amplification healing must account for shields and overkill.
{let {s,f,t}=setup();A.cast(s,f,2,t.x,t.y);A.felicytaConfirm(s,f,t.x,t.y);t.shield=45;A.damage(s,t,80,2);assert.equal(f.hp,105);t.hp=1;t.shield=0;A.damage(s,t,80,2);assert.equal(f.hp,105);}
