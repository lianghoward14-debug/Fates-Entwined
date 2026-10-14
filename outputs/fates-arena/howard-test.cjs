const A=require('./tidebound-engine.js'),assert=require('node:assert/strict');
function setup(){let s=A.create('howard');s.countdown=0;s.walls=[];s.fighters[0].x=400;s.fighters[1].x=600;s.fighters[1].hp=s.fighters[1].maxHp=10000;return s}
function tick(s,t,input={}){for(let n=0;n<Math.round(t/.02);n++){s.hitstop=0;A.step(s,.02,input,false)}}
let s=setup(),[p,b]=s.fighters;A.basic(s,p,900,350);assert.equal(s.shots[0].kind,'rock');
s=setup();[p,b]=s.fighters;b.armor=100;A.cast(s,p,0,900,350);tick(s,.5);assert(Math.abs(10000-b.hp-32/1.5)<.001);assert.equal(b.x,780);
s=setup();[p,b]=s.fighters;A.cast(s,p,1,900,350);A.basic(s,p,900,350);tick(s,.3);assert.equal(b.bleeds.length,1);p.basicCd=0;A.basic(s,p,900,350);tick(s,.3);assert.equal(b.bleeds.length,2);let hp=b.hp;tick(s,6);assert.equal(b.bleeds.length,0);assert(Math.abs(hp-b.hp-48/1.15)<.001);tick(s,3.4);assert(p.knives<.001);
s=setup();[p,b]=s.fighters;A.cast(s,p,2,900,350);for(let i=0;i<3;i++){p.basicCd=0;A.basic(s,p,900,350);assert.equal(s.shots.at(-1).kind,'football')}assert.equal(p.footballs,0);tick(s,.4);assert(p.haste>0);assert.equal(p.hastePower,1);p.basicCd=0;A.basic(s,p,900,350);assert.equal(s.shots.at(-1).kind,'rock');tick(s,2.1);assert.equal(p.haste,0);
s=setup();[p,b]=s.fighters;A.cast(s,p,3,900,350);tick(s,.02,{ax:900,ay:350});assert.equal(s.shots.length,3);assert.deepEqual(s.shots.map(q=>q.kind),['arrow','knife','football']);assert(s.shots.every(q=>q.penetration===1&&q.bleed===2&&q.knock===360&&q.speedBuff===2));tick(s,6,{ax:900,ay:350});assert.equal(p.fury,0);s.events=[];tick(s,.2);assert.equal(s.events.filter(e=>e.type==='basic').length,0);
console.log('PASS: rock default, 50% armor penetration and knockback, independent six-tick bleeds, knife expiry, three footballs, speed expiry, triple mixed double-potency ultimate and expiry');

// Ultimate cadence is intentionally readable: four volleys in the first second.
s=setup();[p,b]=s.fighters;b.x=1100;b.y=600;A.cast(s,p,3,900,200);let volleys=0;for(let n=0;n<50;n++){s.events=[];s.hitstop=0;A.step(s,.02,{ax:900,ay:200},false);volleys+=s.events.filter(e=>e.type==='basic').length}assert.equal(volleys,4);assert(s.shots.every(q=>q.speed<=902.001));console.log('PASS: reduced ultimate cadence and projectile speed');
