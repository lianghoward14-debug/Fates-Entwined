'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const starter=require('../shared/starter-choice.js');
const profile={_fateAccountUid:'A',starterChosen:true,starterDeckId:'a',cardCollectionResetVersion:'20260908a',_clientUpdatedAt:10};
assert.equal(starter.merge(profile,{starterChosen:false,cardCollectionResetVersion:'20260908a',_clientUpdatedAt:99}).starterDeckId,'a');
async function main(){
  const storage=new Map(),timers=new Map();let id=0,resolveLoad,posts=0,fail=false;
  const context={console:{log(){},warn(){}},window:null,USER_PROFILE:{},PRESET_DECKS:{},PUBLIC_DECKS:[],LEADERBOARD:[],
    FateStarterChoice:starter,createDefaultUserProfile:()=>({starterChosen:false}),
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k),length:0},
    setTimeout:(f,ms)=>{timers.set(++id,{f,ms});return id},clearTimeout:i=>timers.delete(i),
    location:{hostname:'test'},document:{getElementById:()=>null,querySelector:()=>null},__fateStartupLoadingManaged:true,
    dispatchEvent(){},CustomEvent:function(){},FateOnline:{auth:{currentUser:{uid:'A',getIdToken:async()=>''}}},
    fetch:async(url,options)=>{if(options.method==='POST'){posts++;return {ok:true,text:async()=>JSON.stringify({data:{profile}})}}if(fail)throw Error('offline');return new Promise(resolve=>{resolveLoad=resolve})}};
  context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync('src/scripts/14-cloud-save.js','utf8'),context);
  const tick=()=>new Promise(resolve=>setImmediate(resolve));
  const loading=context.FateCloudSave.onSignIn('A');await tick();
  [...timers.values()].find(t=>t.ms===30000).f();
  context.FateCloudSave.saveProfile();context.FateCloudSave.saveAll();
  assert.equal(context._fateCloudReady,false,'overlay timeout is not successful account load');assert.equal(posts,0);
  resolveLoad({ok:true,text:async()=>JSON.stringify({data:{profile}})});await loading;
  assert.equal(context.USER_PROFILE.starterDeckId,'a');assert.equal(context._fateCloudReady,true);
  const accepted=await context.FateCloudSave.saveStarterChoice({...profile,starterDeckId:'b'});
  assert.equal(accepted.starterDeckId,'a','use canonical server choice');
  fail=true;await context.FateCloudSave.onSignIn('A');
  assert.equal(context._fateCloudReady,false,'failed load cannot authorize empty account saves');
  const before=posts;context.FateCloudSave.saveProfile();context.FateCloudSave.saveAll();assert.equal(posts,before);

  const source=fs.readFileSync('src/scripts/09-challenger-mode.js','utf8');
  const ready=source.slice(source.indexOf('function starterAccountIsReady()'),source.indexOf('function openChallengerMenu()'));
  const pick=source.slice(source.indexOf('let _starterChoicePending'),source.indexOf('// ─── CHALLENGER HUB UI'));
  let complete,claims=0,saves=0;
  Object.assign(context,{STARTER_DECKS:[{id:'a',name:'A',ids:['01','01'],displayCardIds:['01']}],G:{p1Deck:[]},
    USER_PROFILE:{_fateAccountUid:'A',starterChosen:false},toast(){},createChallengerDeckId:()=> 'chosen',saveProfile(){saves++},showScreen(){},switchChTab(){}});
  vm.runInContext(ready+pick,context);
  await context.pickStarterDeck('a');assert.equal(saves,0,'selection blocked until cloud load succeeds');
  context._fateCloudReady=true;
  context.FateCloudSave.saveStarterChoice=async p=>{claims++;return new Promise(resolve=>complete=()=>resolve(p))};
  const claim=context.pickStarterDeck('a');await context.pickStarterDeck('a');
  assert.equal(claims,1,'double click sends one claim');assert.equal(context.USER_PROFILE.starterChosen,false,'no local grant before acknowledgment');
  complete();await claim;
  assert.equal(context.USER_PROFILE.starterDeckId,'a');assert.equal(context.USER_PROFILE.ownedCards['01'],2);assert.equal(context.USER_PROFILE.unopenedPacks,3);
  await context.pickStarterDeck('a');assert.equal(claims,1,'already chosen cannot grant twice');
  context.USER_PROFILE={_fateAccountUid:'A',starterChosen:false};context.FateCloudSave.saveStarterChoice=async()=>{throw Error('offline')};
  await context.pickStarterDeck('a');assert.equal(context.USER_PROFILE.starterChosen,false);assert.equal(context.USER_PROFILE.ownedCards,undefined,'failed request grants nothing');
  console.log('PASS: slow/failed login cannot overwrite cloud data, fresh login restores choice, canonical acknowledgment, double clicks, failed claims.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
