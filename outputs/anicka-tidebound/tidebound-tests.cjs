const A=require('./tidebound-engine.js'),assert=require('node:assert/strict');
function scene(){let s=A.create();s.countdown=0;s.walls=[];return s}
function run(s,n,input={}){for(let i=0;i<n;i++)A.step(s,.02,input,false)}
let s=scene(),p=s.fighters[0],b=s.fighters[1];
assert(A.cast(s,p,0,900,350));run(s,25,{ax:900,ay:350});assert(p.x>350);let y=p.y;run(s,25,{ax:p.x,ay:600});assert(p.y>y+30);run(s,140,{ax:900,ay:350});assert.equal(p.sail,0);
s=scene();[p,b]=s.fighters;b.x=450;A.cast(s,p,1,900,350);run(s,35);assert(b.hp<b.maxHp);assert(b.x>480,'Wave sweeps target forward');
s=scene();[p,b]=s.fighters;p.hp=150;b.x=300;assert(A.cast(s,p,2,600,350));assert.equal(A.addStar(s,p,800,350),false);run(s,20,{x:1});assert.equal(p.x,190);for(const pt of [[350,350],[450,450],[300,450],[190,350]])assert(A.addStar(s,p,...pt));let hp=p.hp;A.damage(s,p,100,1);assert.equal(p.hp,hp);for(let i=0;i<100&&p.phase;i++){A.damage(s,p,10,1);A.step(s,.02,{},false)}assert.equal(p.hp,185,'Heal once per unique target');assert.equal(p.phase,null);run(s,10);A.damage(s,p,20,1);assert(p.hp<185,'Invulnerability ends');
s=scene();p=s.fighters[0];A.cast(s,p,2,500,350);run(s,1,{cancelPath:true});assert.equal(p.path,null);run(s,60);assert(A.cast(s,p,2,500,350));run(s,510);assert.equal(p.path,null,'Incomplete planning times out');
s=scene();[p,b]=s.fighters;b.x=650;A.cast(s,p,3,550,350);run(s,40);assert(s.zones.some(z=>z.maelstrom));assert(s.shots.filter(q=>q.wave).length>=8);assert(b.x<650,'Whirlpool pulls inward');run(s,60);assert(b.hp<b.maxHp);
for(const kind of ['anicka','howard']){s=A.create(kind);for(let i=0;i<8000&&!s.done;i++)A.step(s,.02,{ax:s.fighters[1].x,ay:s.fighters[1].y,basic:true,abilities:i%100===0?[i/100%4]:[]},true);for(const f of s.fighters)assert(Number.isFinite(f.hp)&&Number.isFinite(f.x));}
console.log('PASS: boat steering, wave sweep, 4-click range, planning lock/cancel/timeout, phase immunity and unique healing, ultimate pull/pulses, both bot kits.');
