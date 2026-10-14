const assert=require('node:assert/strict'),A=require('./engine.js');
let s=A.create();assert(A.cast(s,s.fighters[0],0,980,350));assert(!A.cast(s,s.fighters[0],0,980,350));assert.equal(s.shots.length,1);
s=A.create();let f=s.fighters[0];A.damage(s,f,100,1);assert(Math.abs(f.hp-(220-100/1.15))<.001);A.cast(s,f,2,0,0);const hp=f.hp;A.damage(s,f,10,1);assert.equal(f.hp,hp);assert(f.shield<45);
s=A.create();f=s.fighters[0];f.x=380;f.y=200;A.move(s,f,50,0);assert.equal(f.x,388);
s=A.create();s.fighters[0].x=200;s.fighters[0].y=70;s.fighters[1].x=400;s.fighters[1].y=70;A.cast(s,s.fighters[0],0,400,70);for(let i=0;i<40;i++)A.step(s,.02,{},false);assert(s.fighters[1].hp<250);assert.equal(s.fighters[0].hp,220);
s=A.create();s.fighters[0].x=200;s.fighters[0].y=200;s.fighters[1].x=600;s.fighters[1].y=200;A.cast(s,s.fighters[0],0,600,200);for(let i=0;i<70;i++)A.step(s,.02,{},false);assert.equal(s.fighters[1].hp,250);
s=A.create('howard');s.fighters[1].x=300;A.cast(s,s.fighters[0],3,300,350);assert(s.fighters[1].hp<220);
s=A.create();A.damage(s,s.fighters[1],10000,0);assert(s.done);assert.equal(s.winner,0);assert(!A.cast(s,s.fighters[0],0,0,0));
for(const kind of ['anicka','howard']){s=A.create(kind);for(let i=0;i<15000&&!s.done;i++){let p=s.fighters[0],b=s.fighters[1];A.step(s,.02,{ax:b.x,ay:b.y,abilities:[0,1,2,3]},true);assert(Number.isFinite(p.x)&&Number.isFinite(b.hp))}assert(s.done,kind+' simulated match finishes')}
console.log('Passed: cooldown, armor, shield, wall movement, projectile hit, cover blocking, burst, death and two complete simulated matches.');
