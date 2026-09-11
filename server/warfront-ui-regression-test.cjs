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
const roster=source.slice(source.indexOf('function players('),source.indexOf('function seat('))+source.slice(source.indexOf('function briefingRosterRows('),source.indexOf('function briefing('));
function render(uid,elo){
  const context={state:{zones:[{a:{uid:'alpha',name:'A',elo:970}},{a:{uid:'bravo',name:'B',elo:687}},{a:{uid:'zero',elo:0}},{a:{uid:'unknown',elo:null}}]},me:()=>({uid,elo}),meta:()=>({name:'Zone'}),avatar:()=>'',esc:x=>x};
  vm.createContext(context);vm.runInContext(roster,context);return context.briefingRoster('a');
}
assert.equal(render('alpha',12),render('bravo',999),'local player overrides cannot change roster ratings');
assert.match(render('alpha',12),/0 ELO/);assert.match(render('alpha',12),/RATING UNAVAILABLE/);
const retained={state:{zones:[{id:'front',a:null,b:null}],service:{alpha:{uid:'alpha',name:'Alice',team:'a',zoneId:'front',matchIds:['one']}}},meta:z=>({name:z.id}),avatar:()=>'',esc:String};
vm.createContext(retained);vm.runInContext(roster,retained);
assert.match(retained.briefingRoster('a'),/Alice/);assert.match(retained.briefingRoster('a'),/Unassigned/);assert.match(retained.briefingRoster('a'),/1\/5 MATCHES PLAYED/);assert.equal(retained.state.zones[0].a,null);
retained.state.zones[0].a={uid:'replacement',name:'Replacement'};assert.equal(retained.briefingRosterRows('a').length,2);
retained.state.zones.push({id:'next',a:{uid:'alpha',name:'Alice'},b:null});assert.equal(retained.briefingRosterRows('a').filter(r=>r.player?.uid==='alpha').length,1);
retained.state.service={};retained.state.zones=[{id:'fresh',a:null,b:null}];assert(!retained.briefingRoster('a').includes('Alice'));
let replacements=0,drawerWrites=0,drawerHtml='<section>same zone</section>';
const open={scrollTop:42,get innerHTML(){return drawerHtml;},set innerHTML(v){drawerWrites++;drawerHtml=v;}};
const shade={},oldBackground={remove(){}},newDrawer={innerHTML:drawerHtml},freshBackground={matches:()=>false};
const next={className:'updated',children:[freshBackground],querySelector:()=>newDrawer};
const current={children:[oldBackground,shade,open],querySelector:selector=>selector==='.war2-drawer'?open:shade,insertBefore(){}};
const pane={querySelector:()=>current,set innerHTML(v){replacements++;}};
const dom={drawer:'zone',document:{createElement:()=>({set innerHTML(v){},firstElementChild:next})}};
vm.createContext(dom);vm.runInContext(source.slice(source.indexOf('function renderWarfrontHtml('),source.indexOf('function render(content)')),dom);
dom.renderWarfrontHtml(pane,'updated map');assert.equal(replacements,0);assert.equal(drawerWrites,0,'unchanged zone contents remain mounted');assert.equal(open.scrollTop,42);
newDrawer.innerHTML='<section>new occupant</section>';dom.renderWarfrontHtml(pane,'changed map');assert.equal(drawerWrites,1);assert.equal(replacements,0);assert.equal(open.scrollTop,42);
for(const type of ['zone','matches','archive','awards','rules','record','match-detail']){
  dom.drawer=type;newDrawer.innerHTML=drawerHtml;const before=drawerWrites;
  dom.renderWarfrontHtml(pane,'poll');assert.equal(drawerWrites,before);assert.equal(replacements,0,type+' keeps its window mounted');
  // Image fallback handlers mutate the actual DOM; compare future polls to
  // the previous generated contents instead of treating those mutations as news.
  drawerHtml='runtime image fallback';dom.renderWarfrontHtml(pane,'poll');assert.equal(drawerWrites,before,type+' does not reload images on unchanged polls');drawerHtml=newDrawer.innerHTML;
}
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
