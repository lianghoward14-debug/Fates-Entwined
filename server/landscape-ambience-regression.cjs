const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const timers=new Map(),events={},nodes=[];let next=0,hold=null,fail=false;
const param=()=>({value:0,setValueAtTime(){},setTargetAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelAndHoldAtTime(){}});
function node(){const n={gain:param(),frequency:param(),pan:param(),Q:param(),playbackRate:param(),threshold:param(),knee:param(),ratio:param(),connect(){},disconnect(){this.disconnected=true;},start(...args){this.startArgs=args;},stop(){}};nodes.push(n);return n;}
function buffer(ch=1,length=100,rate=100){const d=Array.from({length:ch},()=>Float32Array.from({length},(_,i)=>Math.sin(i)*.2));return {numberOfChannels:ch,length,sampleRate:rate,duration:length/rate,getChannelData:c=>d[c]};}
class Context{constructor(){this.currentTime=0;this.sampleRate=100;this.destination=node();}resume(){return Promise.resolve();}createGain(){return node();}createDynamicsCompressor(){return node();}createBufferSource(){return node();}createStereoPanner(){return node();}createBiquadFilter(){return node();}createOscillator(){return node();}createBuffer(...a){return buffer(...a);}decodeAudioData(){return Promise.resolve(buffer(1,10000,100));}}
const window={AudioContext:Context,dispatchEvent(){},addEventListener(){}};
const document={hidden:false,currentScript:{src:'http://localhost/src/scripts/08-landscape-ambience.js'},addEventListener:(n,f)=>events[n]=f};
const c=vm.createContext({window,document,URL,CustomEvent:class{},console:{warn(){}},setTimeout:(fn)=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id),fetch:async()=>{if(hold)await hold;if(fail)return {ok:false};return {ok:true,arrayBuffer:async()=>new ArrayBuffer(0)};}});
vm.runInContext(fs.readFileSync('src/scripts/08-landscape-ambience.js','utf8'),c);
const a=window.FateLandscapeAmbience,tick=()=>new Promise(setImmediate);
(async()=>{
 await a.unlock();assert.equal(a.profiles.length,24);
 await a.play('igb6');assert.equal(a.getState().playing,'igb6');
 let release;hold=new Promise(r=>release=r);const pending=a.play('igb1');await tick();assert.equal(a.getState().loading,'igb1');
 await a.play('igb6');release();hold=null;await pending;assert.equal(a.getState().playing,'igb6','Returning to active scene cancels stale load');
 hold=new Promise(r=>release=r);const delayed=a.play('igb2');await tick();await a.stop();release();hold=null;await delayed;assert.equal(a.getState().playing,null,'Stop cancels pending load');
 fail=true;await a.play('igb8');assert.ok(a.getState().error);assert.equal(a.getState().playing,null);fail=false;
 for(let i=1;i<=24;i++){
   await a.play('igb'+i);assert.equal(a.getState().playing,'igb'+i);assert.equal(a.getState().error,null);
   // Exercise each recipe's scheduled cues, including gull variants and new foley.
   for(const [id,fn] of [...timers])if(timers.has(id)){timers.delete(id);fn();}
 }
 assert.ok(nodes.some(n=>n.startArgs?.[1]>0),'Water starts at varying interior positions');
 const moscow=a.profiles[23];assert.deepEqual(Array.from(moscow[2],x=>x.key),['wind','conversation']);assert.ok(moscow[3].every(x=>['snow','towerbell','door','pavement'].includes(x.key)),'Moscow is a peaceful populated winter plaza');
 assert.equal(a.profiles[0][3].length,0,'Peaceful Seas has no ship cues');
 assert.ok(a.profiles[7][2].every(s=>s.key!=='engine'),'Qingdao engines are intermittent');
 assert.ok(a.profiles[14][3].every(s=>s.key!=='snow'),'No snow crunch in Carpathians');
 assert.deepEqual(Array.from(a.profiles[22][2],s=>s.key),['nightcrickets'],'Helena removes both old brushing sources');
 assert.ok(a.profiles[10][3].some(s=>s.key==='towerbell'),'Sather uses recorded tower bells');
 for(const i of [1,2,3,5,6,8,10,11,12,13,15,16,17,18,19,20,22,23]){
   const p=a.profiles[i];assert.ok([...p[2],...p[3]].every(s=>!['engine','machine','boom','crowd'].includes(s.key)),p[0]+' follows scenery, not conflict');
 }
 for(const i of [6,8,18])assert.ok(a.profiles[i][3].some(s=>s.variants?.length===3),'Coastal gulls use varied actual calls');
 assert.ok(a.profiles[16][2].some(s=>s.key==='tokyo'),'Tama uses a Japanese city recording');
 assert.ok(a.profiles[10][2].every(s=>s.key!=='conversation'),'No conversation at Sather');
 assert.ok(a.profiles[20][2].some(s=>s.key==='conversation'&&s.volume<=.3),'Study conversation stays restrained');
 await a.volume(0);assert.equal(a.getState().volume,0);await a.volume(5);assert.equal(a.getState().volume,1);
 document.hidden=true;events.visibilitychange();await tick();assert.equal(a.getState().playing,null);
 document.hidden=false;events.visibilitychange();await tick();assert.equal(a.getState().playing,'igb24');
 await a.stop();for(const [id,fn]of [...timers]){timers.delete(id);fn();}assert.equal(timers.size,0,'Stop cleans up scheduling');
 assert.ok(nodes.slice(3).every(n=>n.disconnected),'All scene audio nodes disconnect');
 console.log('PASS: 24 scenes, stale loading cancellation, stop, retry, mute, hidden tabs, cleanup, and snowy Moscow.');
})().catch(e=>{console.error(e);process.exitCode=1;});
