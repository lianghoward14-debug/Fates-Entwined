import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import http from 'node:http';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'warfront-two-client-'));
process.env.FATE_FLY_DATA_API_DIR=dir;
const originalFetch=globalThis.fetch;
const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
globalThis.fetch=async()=>({ok:true,headers:new Headers(),json:async()=>({test:publicKey.export({type:'spki',format:'pem'})})});
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function token(uid){const project='fates-entwined-41491',input=`${encode({alg:'RS256',kid:'test'})}.${encode({sub:uid,aud:project,iss:`https://securetoken.google.com/${project}`,exp:Math.floor(Date.now()/1000)+3600})}`;return `${input}.${crypto.sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url')}`;}
const source=fs.readFileSync('src/scripts/47-challenger-war-event.js','utf8');
let api,server;
try{
  const {createFlyDataApi}=await import('./fly-data-api.mjs');
  const makeApi=()=>createFlyDataApi({readBody:async req=>req.body,writeJson:(res,status,body)=>Object.assign(res,{status,body})});
  api=makeApi();
  server=http.createServer(async(req,res)=>{
    try{
      let input='';for await(const chunk of req)input+=chunk;
      req.body=input?JSON.parse(input):{};const output={};
      await api.handle(req,output,new URL(req.url,'http://localhost'));
      res.writeHead(output.status||404,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(output.body));
    }catch(error){res.writeHead(500);res.end(JSON.stringify({error:error.message}));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const baseUrl=`http://127.0.0.1:${server.address().port}`;
  async function request(uid,route,options={}){
    const res=await originalFetch(baseUrl+route,{method:options.method||'GET',headers:{authorization:`Bearer ${token(uid)}`,'content-type':'application/json'},signal:options.signal,body:options.body?JSON.stringify(options.body):undefined});
    const body=await res.json();if(res.status!==200)throw new Error(JSON.stringify(body));return body;
  }
  function client(uid){
    const data=new Map(),timers=new Map(),events={},toasts=[];let nextTimer=0;
    let html='',writes=0;const pane={get innerHTML(){return html;},set innerHTML(value){html=value;writes++;},get writes(){return writes;},classList:{contains:()=>true}};
    const c={console,Date,Math,JSON,AbortController,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
      localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},
      document:{readyState:'loading',hidden:false,addEventListener(){},getElementById:()=>null,querySelector:selector=>selector.startsWith('#ch-content >')?pane:null},
      setTimeout:(fn,ms)=>{timers.set(++nextTimer,{fn,ms});return nextTimer;},clearTimeout:id=>timers.delete(id),setInterval:()=>1,clearInterval(){},toast:m=>toasts.push(m)};
    c.window=c;c.FATE_ONLINE={user:{uid},profile:{displayName:uid}};c.USER_PROFILE={username:uid};c.toast=m=>toasts.push(m);
    c.FateOnline={flyApiRequest:(route,options)=>request(uid,route,options)};
    c.addEventListener=(name,fn)=>{events[name]=fn;};c.dispatchEvent=()=>{};
    vm.createContext(c);
    const end=source.lastIndexOf('})();');
    assert(end>0);
    vm.runInContext(source.slice(0,end)+`window.testWar={archive,pull:pullRemoteState,push:pushRemoteState,command:runWarfrontServerCommand,setState:s=>state=s,select:t=>selectedTeam=t,adopt:adoptRemoteState,backup:backupSimulation,notice:warfrontSyncNotice,busy:()=>remotePullBusy};\n`+source.slice(end),c);
    return {c,data,timers,events,toasts,pane,war:c.testWar,state:()=>JSON.parse(JSON.stringify(c.getFateClanEventState()))};
  }
  const a=client('alpha'),b=client('bravo');
  await a.war.push();await Promise.all([a.war.pull(),b.war.pull()]);
  const shared=c=>JSON.parse(JSON.stringify(c.state(),(key,value)=>key==='localReward'?undefined:value));
  const same=label=>assert.deepEqual(shared(a),shared(b),label);
  same('initial campaign');
  a.c.openWarZone('heartland');const writes=a.pane.writes;
  await a.war.pull();await a.war.pull();assert.equal(a.pane.writes,writes,'unchanged polls must not rebuild the open zone drawer');
  a.c.closeWarDrawer();
  a.war.select('a');b.war.select('b');
  await Promise.all([a.c.joinWarEventZone('heartland','a'),b.c.joinWarEventZone('heartland','b')]);
  await Promise.all([a.war.pull(),b.war.pull()]);same('concurrent deployments');
  assert.equal(a.state().zones.filter(z=>z.a||z.b).length,1);
  assert.equal(a.state().zones[2].a.uid,'alpha');assert.equal(a.state().zones[2].b.uid,'bravo');
  const enrollment=b.state();
  await a.war.command('start');await b.war.pull();same('start visible to both players');assert.equal(b.state().status,'active');
  assert.match(a.pane.innerHTML,/CAMPAIGN ACTIVE/);assert.match(b.pane.innerHTML,/CAMPAIGN ACTIVE/);
  assert.equal(b.war.adopt(enrollment),false,'late enrollment snapshot cannot undo start');
  // A permanently unresolved network operation must not disable all later polls.
  const normal=b.c.FateOnline.flyApiRequest;b.c.FateOnline.flyApiRequest=()=>new Promise(()=>{});
  const stalled=b.war.pull();assert(b.war.busy());
  [...b.timers.values()].find(t=>t.ms===12000).fn();await stalled;
  assert.equal(b.war.busy(),false);assert.match(b.war.notice(),/interrupted/);
  b.c.FateOnline.flyApiRequest=normal;await b.war.pull();same('reconnect after stalled request');assert.equal(b.war.notice(),'');
  for(let i=0;i<5;i++){
    assert(a.c.fateClanEventReportMatch({zoneId:'heartland',matchId:'played-'+i,winnerTeam:i%2?'b':'a',stats:{fateDifferential:10,durationMs:40000,consolidations:2},replay:{version:1,hands:{a:[],b:[]},actions:[{team:'a',cardId:'1'}]}}));
    await a.war.push();await Promise.all([a.war.pull(),b.war.pull()]);same('shared result '+i);
  }
  assert.equal(b.state().zones[2].matches.length,5);
  assert.equal(b.state().zones[2].matches[0].replay.actions.length,1);
  // A saved simulation backup does not opt a newly opened client out of live state.
  b.data.set('fate_war_simulation_backup_v1','{}');await b.war.pull();same('old simulation marker cannot disable polling');b.data.delete('fate_war_simulation_backup_v1');
  const liveReport=JSON.parse(JSON.stringify(a.war.archive('command')));
  b.war.backup();assert.match(b.war.notice(),/SIMULATION/);await b.war.command('end');await a.war.pull();same('live command exits simulation and restores shared state');
  assert(b.state().lastResult);assert.equal(b.data.has('fate_war_simulation_backup_v1'),false);
  assert.deepEqual(b.state().lastResult.score,liveReport.score,'final server score matches the live map');
  assert.deepEqual(b.state().lastResult.achievements,liveReport.achievements,'final commendations match the live map');
  // The authoritative API canonicalizes legacy AI roster entries with the
  // same default rating/photo fields used for newly enrolled players.
  const normalizePlayer=player=>{
    const normalized={...player,elo:player.elo??600,photo:player.photo??'blank.png'};
    if(normalized.isAI) delete normalized.photo;
    return normalized;
  };
  assert.deepEqual(b.state().lastResult.players.map(normalizePlayer),liveReport.players.map(normalizePlayer),'final player statistics match the live map');
  assert.equal(b.state().lastResult.matches,5);assert(b.state().lastResult.achievements.length>0,'commendations are archived');
  const old=enrollment;old.zones[2].matches=[{id:'old-match',winnerTeam:'a',starValue:5}];
  await request('alpha','/api/warfront/state',{method:'POST',body:{uid:'alpha',state:old}});
  await Promise.all([a.war.pull(),b.war.pull()]);same('late previous-campaign upload');assert.equal(a.state().zones[2].matches.length,5);assert.equal(a.state().zones[2].matches.some(match=>match.id==='old-match'),false);
  assert.equal(a.war.adopt(enrollment),false,'old campaign response cannot replace new campaign');
  await a.war.command('deployment');await b.war.pull();same('fresh deployment');assert.equal(a.state().lastResult,null);
  api.flush();api=makeApi();await Promise.all([a.war.pull(),b.war.pull()]);same('server restart preserves shared campaign');
  // Complete all 25 battles across every front and compare the final report
  // against the live client score, including commendation stars.
  for(const [i,zone] of a.state().zones.entries())for(const team of ['a','b']){
    const uid=i===0?(team==='a'?'alpha':'bravo'):team+i;
    await request(uid,'/api/warfront/deploy',{method:'POST',body:{uid,zoneId:zone.id,team,profile:{displayName:uid}}});
  }
  await a.war.command('start');await b.war.pull();same('ten commanders enrolled');
  let finished;
  for(let zoneIndex=0;zoneIndex<5;zoneIndex++)for(let battle=0;battle<5;battle++){
    const next=a.state(),zone=next.zones[zoneIndex];
    zone.matches.push({id:`full-${zoneIndex}-${battle}`,winnerTeam:battle%2?'b':'a',completedAt:Date.now(),playerStats:{a:{fateDifferential:zoneIndex+1,consolidations:2,durationMs:40000},b:{fateDifferential:0,consolidations:1,durationMs:50000}}});
    finished=await request('alpha','/api/warfront/state',{method:'POST',body:{uid:'alpha',state:next}});
    await Promise.all([a.war.pull(),b.war.pull()]);same(`full campaign ${zoneIndex}/${battle}`);
  }
  assert.equal(finished.state.lastResult.matches,25);assert.equal(a.state().status,'enrollment');
  assert.equal(a.state().lastResult.score.match.a,20);assert.equal(a.state().lastResult.score.match.b,10);
  assert.equal(a.state().lastResult.score.award.a,2);assert.equal(a.state().lastResult.winner,'a');
  assert.match(a.pane.innerHTML,/22/);assert.match(b.pane.innerHTML,/22/);
  const rewardCounts=[a.c.USER_PROFILE.warfrontParticipations,b.c.USER_PROFILE.warfrontParticipations];
  await Promise.all([a.war.pull(),b.war.pull()]);assert.deepEqual([a.c.USER_PROFILE.warfrontParticipations,b.c.USER_PROFILE.warfrontParticipations],rewardCounts,'repeated archive refresh cannot grant rewards twice');
  await a.war.command('deployment');
  await request('alpha','/api/warfront/deploy',{method:'POST',body:{uid:'alpha',zoneId:'heartland',team:'a'}});
  await a.war.command('start');
  const now=Date.now;try{
    const expiry=a.state().endsAt;Date.now=()=>expiry+1;
    await Promise.all([a.war.pull(),b.war.pull()]);same('48-hour expiry');assert(a.state().lastResult);
  }finally{Date.now=now;}
  console.log('Two real Warfront client runtimes: concurrent deployment, start, stale responses, stalled poll recovery, simulation exit, end/archive, old upload rejection, reset and restart passed');
}finally{server?.closeAllConnections();if(server)await new Promise(resolve=>server.close(resolve));api?.flush();globalThis.fetch=originalFetch;fs.rmSync(dir,{recursive:true,force:true});}
