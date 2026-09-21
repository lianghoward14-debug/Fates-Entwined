'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const sync=require('../shared/preset-sync.js');
const deck=(name,time)=>({name,ids:Array(40).fill('01'),_presetUpdatedAt:time});
let merged=sync.merge({presets:{a:deck('new',20),b:deck('other device',5)}},{presets:{a:deck('stale',10),c:deck('offline',25)}});
assert.equal(merged.presets.a.name,'new');assert.equal(Object.keys(merged.presets).length,3);
merged=sync.merge(merged,{presetTombstones:{a:30}});
assert.equal(merged.presets.a,undefined);
assert.equal(sync.merge(merged,{presets:{a:deck('stale',20)}}).presets.a,undefined);
assert.equal(sync.merge(merged,{presets:{a:deck('recreated',31)}}).presets.a.name,'recreated');
assert.equal(Object.keys(sync.merge(merged,{presets:{}}).presets).length,2,'empty client must not wipe cloud');
const edit=sync.recordEdit({a:deck('one',1),b:deck('two',2)},{a:deck('changed',1)},{},50);
assert.equal(edit.presets.a._presetUpdatedAt,50);assert.equal(edit.presetTombstones.b,50);

async function main(){
  const storage=new Map(),timers=new Map();let nextTimer=0,offline=false,requestHook=null;
  const remote={presets:{remote:deck('cloud only',10)},presetTombstones:{}};
  const context={console:{log(){},warn(){}},window:null,USER_PROFILE:{_fateAccountUid:'A'},PRESET_DECKS:{},PUBLIC_DECKS:[],LEADERBOARD:[],
    createDefaultUserProfile:()=>({}),FatePresetSync:sync,
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
    setTimeout:(f,ms)=>{const id=++nextTimer;timers.set(id,{f,ms});return id;},clearTimeout:id=>timers.delete(id),
    location:{hostname:'test'},document:{},
    FateOnline:{auth:{currentUser:{uid:'A',getIdToken:async()=>''}}},
    fetch:async(url,options)=>{
      if(offline)throw Error('offline');
      if(options.method==='POST'){
        const payload=JSON.parse(options.body).data;Object.assign(remote,sync.merge(remote,payload));
        if(requestHook){const hook=requestHook;requestHook=null;hook();}
      }
      return {ok:true,text:async()=>JSON.stringify({data:remote})};
    }};
  context.window=context;vm.createContext(context);
  let source=fs.readFileSync('src/scripts/14-cloud-save.js','utf8');
  source=source.replace('  // ─── EXPOSE ───',`  window.testPresets={apply:_applyCloudData,sync:_syncPresets,session:function(uid){_cloudUid=uid;_cloudSessionId++;return _cloudSessionId;}};\n  // ─── EXPOSE ───`);
  vm.runInContext(source,context);
  const session=context.testPresets.session('A');
  storage.set('fate_user_presets_A',JSON.stringify({local:deck('local only',20)}));
  storage.set('fate_user_presets_B',JSON.stringify({secret:deck('other account',100)}));
  context.testPresets.apply(remote,'A',session);
  assert.ok(context.PRESET_DECKS.local && context.PRESET_DECKS.remote);
  assert.equal(context.PRESET_DECKS.secret,undefined);
  assert.ok(storage.has('fate_presets_backup_A'));
  offline=true;await context.testPresets.sync('A',session);
  assert.equal(storage.get('fate_presets_pending_A'),'1');
  assert.ok([...timers.values()].some(t=>t.ms===30000),'failed upload must retry');
  offline=false;await context.testPresets.sync('A',session);
  assert.ok(remote.presets.local && remote.presets.remote);
  assert.equal(storage.has('fate_presets_pending_A'),false);
  requestHook=()=>storage.set('fate_user_presets_A',JSON.stringify({...remote.presets,local:deck('edit during upload',30)}));
  await context.testPresets.sync('A',session);
  assert.equal(context.PRESET_DECKS.local.name,'edit during upload');
  assert.equal(storage.get('fate_presets_pending_A'),'1');
  await context.testPresets.sync('A',session);
  assert.equal(remote.presets.local.name,'edit during upload');
  // A reply after changing accounts must never populate the new account.
  requestHook=()=>{context.testPresets.session('B');context.FateOnline.auth.currentUser.uid='B';context.PRESET_DECKS={};};
  await context.testPresets.sync('A',session);
  assert.equal(Object.keys(context.PRESET_DECKS).length,0);
  assert.ok(JSON.parse(storage.get('fate_user_presets_B')).secret);
  console.log('PASS: cloud merge, stale/empty clients, offline retries, in-flight edits, deletion markers, recreation, backups and account isolation.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
