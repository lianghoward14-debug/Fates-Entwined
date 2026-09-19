const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/scripts/render-v2/19-signature-activation-fx.js'), 'utf8');
const data = fs.readFileSync(path.join(root, 'src/scripts/01-data-and-state.js'), 'utf8');
const added = ['bh03','45','02','86','bh04','bh20','bh19','bh01','14','bh09','66','87','67','bh21','38','bh22','56','bh05','bh13','13','07','08','21','29','30','43','51','81','82','83','84','90','99','bh06','bh10','bh14','bh16'];
const existing = ['77','100','bh18','bh17','15','34',"55","85","36","bh02","bh08","57","12","23",'41','89','35','88','11','46','10','19','bh12','01','bh07','bh11','03','06','22','27','40','48'];
let callback, draws = 0, reduced = false;
const context = new Proxy({}, {get(target, key) {
  if(key === 'createRadialGradient') return () => ({addColorStop(){}});
  return target[key] || ((...args) => { assert.ok(args.every(v => typeof v !== 'number' || Number.isFinite(v)), `${String(key)} has finite coordinates`); draws++; });
}});
const sandbox = {
  window:{}, document:{documentElement:{classList:{contains:()=>reduced}}, createElement:()=>({style:{},setAttribute(){},getContext:()=>context})},
  localStorage:{getItem:()=>null}, matchMedia:()=>({matches:false}),
  innerWidth:700, innerHeight:430, devicePixelRatio:1, performance:{now:()=>0},
  requestAnimationFrame:fn=>{callback=fn;return 1;}, cancelAnimationFrame:()=>{callback=null;},
  addEventListener(){}, removeEventListener(){}, setTimeout(){}
};
vm.runInNewContext(fs.readFileSync(path.join(root,'src/scripts/render-v2/19-approved-activation-art.js'),'utf8'),sandbox);
vm.runInNewContext(source, sandbox);
const api = sandbox.window.FateSignatureActivationFx;
assert.equal(api.approved.length, 69);
assert.deepEqual([...api.approved].sort(), [...added,...existing].sort());
for(const id of [...added,'77','100','bh18','bh17','15','34',"55","85","36","bh02","bh08","57","12","23",'41','89','35','88','11','46','10','19','bh12','01','bh07','bh11','22']) {
  const entry = data.slice(data.indexOf(`{id:'${id}'`));
  assert.ok(entry.length < data.length && entry.length > 0, `${id} exists`);
  const type = entry.match(/type:'([^']+)'/)[1];
  assert.ok(['01','bh07','bh11','10','19','bh12','11','bh02','bh08','57','12','23','15','34','77'].includes(id) || !['Supporter','Coordinator'].includes(type), `${id} has character activation routing`);
  assert.equal(api.durationFor({id}), 2000);
  const overlay = {childNodes:[],style:{},dataset:{},clientWidth:700,clientHeight:430,isConnected:true,replaceChildren(){}};
  const animation = api.mount(overlay,{id},{duration:2000,sfx:false});
  assert.ok(animation);
  const before = draws;
  animation.start();
  for(const time of [0,100,400,800,1200,1600,1999]) {
    const next = callback; callback = null; assert.ok(next); next(time);
  }
  assert.ok(draws > before, `${id} renders`);
  const final = callback; callback = null; final(2000);
  assert.equal(callback,null, `${id} ends at two seconds`);
  animation.dispose();
  assert.equal(api.mount(overlay,{id},{perfLite:true}),null);
  reduced = true;
  assert.equal(api.mount(overlay,{id},{}),null);
  reduced = false;
}
assert.equal(api.durationFor({id:'05'}),0);
assert.equal(api.durationFor({id:'04'}),0);
// New sound cues start once with their animation and stop on disposal.
let soundStarts=0,soundStops=0;
sandbox.window.FateApprovedActivationSfx={handles:()=>true,play:()=>{soundStarts++;return {stop(){soundStops++;}};}};
for(const id of added){
  const overlay={childNodes:[],style:{},dataset:{},clientWidth:700,clientHeight:430,isConnected:true,replaceChildren(){}};
  const audible=api.mount(overlay,{id},{sfx:true});const before=soundStarts;
  audible.start();audible.start();assert.equal(soundStarts,before+1);audible.dispose();audible.dispose();assert.equal(soundStops,soundStarts);
  const silent=api.mount(overlay,{id},{sfx:false});silent.start();silent.dispose();assert.equal(soundStarts,before+1,'sfx:false prevents the new cue');
}
for(const id of ['61','39'])assert.equal(api.durationFor({id}),0,`${id} must not play a rejected/retired centered draft`);
console.log('PASS: 37 approved character animations render, finish at 2000 ms, and respect performance/reduced-motion settings; other existing signatures preserved.');
