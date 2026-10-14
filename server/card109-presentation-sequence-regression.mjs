import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync('src/scripts/28-don-julio-dice.js','utf8');
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
for(const viewer of [0,1]){
 const listeners={},timers=[],order=[];let predecessor=true,frame;
 const ctx=new Proxy({}, {get:(_,k)=>k==='createRadialGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
 const canvas={clientWidth:600,getContext:()=>ctx,setAttribute(){}};
 const scene={style:{},querySelector:s=>s==='canvas'?canvas:{},remove:()=>order.push('dice-end')};
 const runtime={window:{addEventListener:(k,fn)=>listeners[k]=fn,showEffectActivationCinematic:()=>assert.fail('No activation cinematic on dice rolls'),playDonJulioDiceSfx:stage=>order.push(stage)},document:{querySelector:()=>predecessor?{}:null,createElement:()=>scene,body:{appendChild:()=>order.push('dice-start')}},performance:{now:()=>0},devicePixelRatio:1,matchMedia:()=>({matches:false}),requestAnimationFrame:fn=>{frame=fn},setTimeout:(fn,ms)=>{const t={fn,ms};timers.push(t);return t},clearTimeout:t=>{t.cancelled=true}};
 vm.runInNewContext(code,runtime);
 runtime.window.queueDonJulioDieRoll({type:'FATE_DIE_ROLLED',sourceIid:'julio',roll:5,before:2},'match:1');
 assert(runtime.window.deferDonJulioFate('julio',()=>order.push('fate-gain')));
 await runtime.window.flushDonJulioDieRolls({pendingPrompt:{playerIndex:1-viewer}});assert.equal(order.length,0);
 await runtime.window.flushDonJulioDieRolls({pendingPrompt:{type:'SECOND_PICKER'}});assert.equal(order.length,0);
 const done=runtime.window.flushDonJulioDieRolls({});await settle();assert.equal(order.length,0,'Supporter cinematic must finish first');
 predecessor=false;timers.shift().fn();await settle();assert.deepEqual(order,['dice-start','enter']);assert(runtime.window.donJulioDiceBusy);
 assert.equal(runtime.window.donJulioHeldFate('julio'),2);
 let prevented=0;for(const type of ['click','keydown'])listeners[type]({preventDefault(){prevented++},stopImmediatePropagation(){prevented++}});assert.equal(prevented,4);
 for(const timer of timers.splice(0))timer.fn();assert.equal(order.filter(x=>x==='impact').length,2);
 frame(2200);assert.equal(order.at(-1),'land');assert(!order.includes('fate-gain'));
 timers.find(t=>t.ms===900).fn();await done;
 assert.equal(runtime.window.donJulioDiceBusy,false);assert.deepEqual(order.slice(-3),['exit','dice-end','fate-gain']);
 assert.equal(runtime.window.donJulioHeldFate('julio'),undefined);
}
console.log('Don Julio: both viewers wait for pickers/cinematic, dice-only cues play, input locks, Fate gain follows dice exit.');
