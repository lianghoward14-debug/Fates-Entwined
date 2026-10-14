import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createInitialState,applyOperation} from '../../shared/engine/index.mjs';
import {nextInt} from '../../shared/engine/rng.mjs';
import {projectEvents} from '../../shared/engine/projections.mjs';
const require=createRequire(import.meta.url),{cards,byId}=require('../fate-card-catalog.js').getCardCatalog();
assert.equal(byId.get('109').fate,2);assert.equal(byId.get('109').cost,4);assert.equal(byId.get('109').type,'Dauntless');
function fixture(seat=0,seed='julio'){
 const s=createInitialState({matchId:'julio',seed,handSize:10,players:[{id:'a',deckIds:['109','109','32','32','01']},{id:'b',deckIds:['109','109','32','32','01']}],cardDefinitions:cards});
 const source=s.players[seat].hand.splice(s.players[seat].hand.findIndex(c=>c.id==='109'),1)[0];s.board[0][seat?0:2][0]=source;
 return {state:s,events:[],ruleEvents:[],source};
}
function set(ctx,seat,id='32',zone=0,col=1,extra={}){const c=ctx.state.players[seat].hand.find(c=>c.id===id);return applyOperation(ctx,{type:'SET_CARD',playerIndex:seat,cardIid:c.iid,destination:{z:zone,r:seat?0:2,c:col},...extra});}
for(const seat of [0,1]){
 const ctx=fixture(seat);let expected=nextInt(structuredClone(ctx.state.rngState),6)+1;
 set(ctx,1-seat);assert.equal(ctx.source.currentFate,2+expected);assert.equal(ctx.events.find(e=>e.type==='FATE_DIE_ROLLED').roll,expected);
 for(const viewer of [0,1]) assert.equal(projectEvents(ctx.events,viewer).find(e=>e.type==='FATE_DIE_ROLLED').roll,expected);
 set(ctx,1-seat,'32',0,2);assert.equal(ctx.events.filter(e=>e.type==='FATE_DIE_ROLLED').length,2);
 for(const scenario of ['friendly','zone','character','consolidated','suppressed','hidden']){
  const c=fixture(seat);if(scenario==='suppressed')c.source.statuses.push('EFFECTS_SUPPRESSED');if(scenario==='hidden')c.source.faceDown=true;
  set(c,scenario==='friendly'?seat:1-seat,scenario==='character'?'01':'32',scenario==='zone'?1:0,1,scenario==='consolidated'?{consolidated:true}:{});
  assert.equal(c.source.currentFate,2,scenario);assert(!c.events.some(e=>e.type==='FATE_DIE_ROLLED'),scenario);
 }
 const multiple=fixture(seat),second=multiple.state.players[seat].hand.splice(multiple.state.players[seat].hand.findIndex(c=>c.id==='109'),1)[0];multiple.state.board[0][seat?0:2][2]=second;set(multiple,1-seat);assert.equal(multiple.events.filter(e=>e.type==='FATE_DIE_ROLLED').length,2);
 const failed=fixture(seat);assert.throws(()=>set(failed,seat,'32',0,0));assert.equal(failed.source.currentFate,2);
}
const rolls=new Set();for(let i=0;i<100;i++){const c=fixture(0,'seed'+i);set(c,1);rolls.add(c.events.find(e=>e.type==='FATE_DIE_ROLLED').roll);}assert.deepEqual([...rolls].sort(),[1,2,3,4,5,6]);
// Legacy local play uses the same trigger conditions and passes the rolled value to presentation.
const core=readFileSync('src/scripts/05-gameplay-core.js','utf8');
for(const seat of [0,1]){
 const source={id:'109',owner:seat,currentFate:2,iid:'local-julio'},events=[];
 const runtime={G:{_onlineRng:()=>.999},forEachBoardCard:fn=>fn(source,0,0,0),isCardEffectSuppressed:c=>!!c.suppressed,
  modifyFate:(c,n)=>{c.currentFate+=n},window:{presentDonJulioDieRoll:e=>events.push(e)}};
 vm.runInNewContext(core.slice(0,core.indexOf('function hasNoSuppressibleFieldEffect')),runtime);
 const placed={owner:1-seat};runtime.triggerDonJulioSupporterSet(placed,0);assert.equal(events.length,0);await runtime.resolveDonJulioSupporterArrival(placed);assert.equal(source.currentFate,8);assert.equal(events[0].roll,6);
 runtime.triggerDonJulioSupporterSet({owner:seat},0);runtime.triggerDonJulioSupporterSet({owner:1-seat},1);
 source.suppressed=true;runtime.triggerDonJulioSupporterSet({owner:1-seat},0);assert.equal(events.length,1);
}
// The selected canvas animation receives the authoritative result, never rerolls it.
for(let roll=1;roll<=6;roll++){
 let result='',aria='',removed=false,cinematics=0;
 const ctx=new Proxy({}, {get:(_,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
 const canvas={clientWidth:600,getContext:()=>ctx,setAttribute:(k,v)=>{aria=v}};
 const output={set textContent(v){result=v}};
 const scene={style:{},querySelector:s=>s==='canvas'?canvas:output,remove(){removed=true}};
 const runtime={window:{showEffectActivationCinematic:async()=>{cinematics++}},CARDS:cards,document:{createElement:()=>scene,body:{appendChild(){}}},devicePixelRatio:1,performance:{now:()=>0},matchMedia:()=>({matches:false}),requestAnimationFrame:fn=>fn(2200),setTimeout:fn=>fn(),clearTimeout(){}};
 vm.runInNewContext(readFileSync('src/scripts/28-don-julio-dice.js','utf8'),runtime);
 await runtime.window.presentDonJulioDieRoll({type:'FATE_DIE_ROLLED',roll,sourceIid:'julio'},'test');
 assert.equal(result,'Rolled '+roll);assert(aria.includes('showing '+roll));assert(removed);assert.equal(cinematics,0);
 assert.equal(runtime.window.presentDonJulioDieRoll({type:'FATE_DIE_ROLLED',roll,sourceIid:'julio'},'test'),undefined);
}
console.log('Don Julio: both seats, seeded rolls 1–6, repeated and multiple triggers, exclusions, illegal placement, dice-only sequencing, authoritative faces and dedupe passed.');
