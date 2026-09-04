const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,'src/scripts',name),'utf8');
for(const filename of ['09-challenger-mode.js','09-challenger-v2.js']){
  const source=read(filename),start=source.indexOf('function showMatchmakingScreen(opts={})'),end=source.indexOf('function updateMatchmakingBg()',start);
  const messages=[],toasts=[];
  let randomStarts=0,clears=0;
  const context={CURRENT_MODE:'challenger',clearMatchmakingTimers:()=>clears++,showScreen:()=>{},setMatchmakingStatus:s=>messages.push(s),updateMatchmakingBg:()=>{},setInterval:()=>1,document:{getElementById:()=>null},window:{toast:true},toast:s=>toasts.push(s),getOnlineQueueFunction:()=>{randomStarts++;return Promise.resolve(()=>{});}};
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);
  context.showMatchmakingScreen({onlineQueue:false,queueMode:'warfront',externallyManaged:true});
  assert.equal(randomStarts,0);assert.equal(clears,1);assert.deepEqual(toasts,[]);assert.match(messages.at(-1),/Warfront/);
  context.showMatchmakingScreen({onlineQueue:false});
  assert.equal(toasts.at(-1),'Random queue failed','real unsupported queue failures remain visible');
}
const source=read('47-challenger-war-event.js');
const roster=source.split(/\r?\n/).find(line=>line.startsWith('function briefingRoster('));
function render(uid,elo){
  const context={state:{zones:[{a:{uid:'alpha',name:'A',elo:970}},{a:{uid:'bravo',name:'B',elo:687}},{a:{uid:'zero',elo:0}},{a:{uid:'unknown',elo:null}}]},me:()=>({uid,elo}),meta:()=>({name:'Zone'}),avatar:()=>'',esc:x=>x};
  vm.createContext(context);vm.runInContext(roster,context);return context.briefingRoster('a');
}
assert.equal(render('alpha',12),render('bravo',999),'local player overrides cannot change roster ratings');
assert.match(render('alpha',12),/0 ELO/);assert.match(render('alpha',12),/RATING UNAVAILABLE/);
const client=read('authoritative-v3-phase7-beta-client.mjs');
const start=client.indexOf("let takeoverNoticeKey = ''"),end=client.indexOf('function applyServerMessage',start);
let notice=null,timer=null,created=0;
const context={document:{getElementById:id=>id==='s-game'?{appendChild:n=>{notice=n;}}:notice,createElement:()=>{created++;return {style:{},setAttribute:()=>{},remove(){if(notice===this)notice=null;}};}},setTimeout:fn=>{timer=fn;return 1;},clearTimeout:()=>{timer=null;}};
vm.createContext(context);vm.runInContext(client.slice(start,end),context);
const state={matchId:'one',aiTakeoverSeats:[0]};
context.updateTakeoverNotice(state,1);assert(notice);timer();assert.equal(notice,null);
context.updateTakeoverNotice(state,1);assert.equal(created,1,'subsequent snapshots must not recreate expired banner');
context.updateTakeoverNotice({...state,matchId:'two'},1);assert.equal(created,2);
context.updateTakeoverNotice({...state,matchId:'two',outcome:{}},1);assert.equal(notice,null);
console.log('Warfront roster, waiting-screen and transient takeover-banner regression passed');
