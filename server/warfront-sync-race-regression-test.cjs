const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/scripts/47-challenger-war-event.js','utf8');
const sync=source.slice(source.indexOf('async function pushRemoteState(){'),source.indexOf('window.refreshFateWarfrontState='));
function setup(){
  const pending=[],timers=new Map(),adopted=[];
  const c={remoteWriteVersion:0,remoteAcknowledgedVersion:0,remotePushBusy:false,remotePushQueued:false,remotePushTimer:null,remotePullBusy:false,remoteGeneration:0,remoteLastSuccess:0,remoteError:'',state:{result:0},remoteEligible:()=>true,onlineIdentity:()=>({uid:'player'}),remoteCopy:s=>({...s}),rerender:()=>{},adoptRemoteState:s=>{adopted.push(s);c.state=s;return true;},warfrontRequest:(_route,options)=>new Promise((resolve,reject)=>pending.push({options,resolve,reject})),setTimeout:(fn,delay)=>{const id={};timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id)};
  c.resetRemoteWritesIfNeeded=()=>{};
  vm.createContext(c);vm.runInContext(sync,c);return {c,pending,timers,adopted};
}
(async()=>{
  {
    const {c,pending,adopted}=setup();const pull=c.pullRemoteState();
    c.state={result:1};c.scheduleRemotePush();pending[0].resolve({ok:true,state:{result:0}});await pull;
    assert.equal(c.state.result,1,'late poll must not erase a pending result');assert.equal(adopted.length,0);
  }
  {
    const {c,pending,adopted,timers}=setup();c.remoteWriteVersion=1;const push=c.pushRemoteState();
    c.state={result:2};c.scheduleRemotePush();pending[0].resolve({ok:true,state:{result:1}});await push;
    assert.equal(c.state.result,2,'old upload response must not erase newer edits');assert.equal(adopted.length,0);assert.equal(timers.size,1);
  }
  {
    const {c,pending,timers}=setup();c.remoteWriteVersion=1;const push=c.pushRemoteState();pending[0].reject(new Error('offline'));await push;
    assert.equal(c.remoteAcknowledgedVersion,0);assert.equal([...timers.values()][0].delay,2000,'failed uploads retry');
    const timer=[...timers.values()][0];timer.fn();pending[1].resolve({ok:true,state:{result:1}});await new Promise(resolve=>setImmediate(resolve));
    assert.equal(c.remoteAcknowledgedVersion,1);
  }
  console.log('Warfront refresh races, concurrent edits, and upload retry passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
