import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import http from 'node:http';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'warfront-seat-rotation-'));
process.env.FATE_FLY_DATA_API_DIR=dir;
fs.writeFileSync(path.join(dir,'rooms.json'),JSON.stringify({warfrontEvent:{mapCode:'WF-TEST',sequence:1,status:'enrollment',createdAt:Date.now(),teams:{a:{name:'A'},b:{name:'B'}},zones:Array.from({length:5},(_,i)=>({id:'zone-'+i,a:null,b:null,matches:[],landscape:{id:'igb1'},bans:{a:[],b:[]},bansLocked:{a:false,b:false}})),archives:[]}}));
const originalFetch=globalThis.fetch;
const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
globalThis.fetch=async()=>({ok:true,headers:new Headers(),json:async()=>({test:publicKey.export({type:'spki',format:'pem'})})});
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function token(uid){const project='fates-entwined-41491',input=`${encode({alg:'RS256',kid:'test'})}.${encode({sub:uid,aud:project,iss:`https://securetoken.google.com/${project}`,exp:Math.floor(Date.now()/1000)+3600})}`;return `${input}.${crypto.sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url')}`;}
const source=fs.readFileSync('src/scripts/47-challenger-war-event.js','utf8');
let api,server;const live=new Map();
try{
  const {createFlyDataApi}=await import('./fly-data-api.mjs');
  const makeApi=()=>createFlyDataApi({resolveMatchState:id=>live.get(id),readBody:async req=>req.body,writeJson:(res,status,body)=>Object.assign(res,{status,body})});
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
  // A poll can release the post before the game-over callback awards XP/drops.
  const callback=source.slice(source.indexOf('window.fateCompleteWarfrontMatch='),source.indexOf('window.enterWarEventQueue='));
  const c={window:{FATE_PENDING_WAR_MATCH:{mapCode:'WF',zoneId:'z',team:'b',participants:{a:{uid:'ai'},b:{uid:'human'}}},fateClanEventReportMatch:p=>{assert.equal(p.winnerTeam,'b');return true;}},state:{mapCode:'WF',zones:[{id:'z',a:null,b:null,matches:[]}]},seat:()=>null,me:()=>({uid:'human'}),opposite:t=>t==='a'?'b':'a',warMatchReward:()=>({xpGained:99}),Date};
  vm.createContext(c);vm.runInContext(callback,c);
  assert.equal(c.window.fateCompleteWarfrontMatch({playerIndex:1,state:{matchId:'late'}},{winner:1,totalFate:[1,2]}).reward.xpGained,99);
  const command=action=>request('alpha','/api/warfront/command',{method:'POST',body:{uid:'alpha',action}});
  const deploy=(uid,zoneId,team)=>request(uid,'/api/warfront/deploy',{method:'POST',body:{uid,zoneId,team}});
  const read=async()=> (await request('alpha','/api/warfront/state')).state;
  await command('deployment');let state=await read();const zoneId=state.zones[0].id;
  await deploy('alpha',zoneId,'a');await command('start');state=await read();
  const start=async(uid,zoneId,id)=>{
    const state=await read(),z=state.zones.find(z=>z.id===zoneId),team=z.a?.uid===uid?'a':'b',ai=z[team==='a'?'b':'a'];
    const key=[state.mapCode,zoneId,...[uid,ai.uid].sort()].join('|');
    assert(api.warfrontCanQueue(key,uid));
    const match={matchId:id,warfrontMatch:true,warfrontMatchmakingKey:key,warfrontAiSeats:[0],players:[{id:ai.uid},{id:uid+'@session'}]};live.set(id,match);
    assert(api.bindWarfrontAiMatch(id,uid,uid+'@session',key));return match;
  };
  const first=await start('alpha',zoneId,'first');const oldAI=state.zones[0].b.uid;
  await deploy('bravo',zoneId,'b');
  await assert.rejects(deploy('intruder',zoneId,'b'),/occupied/);
  first.outcome={winner:1,totalFate:[10,30]};assert(api.settleWarfrontForfeit(first));
  state=await read();assert.equal(state.zones[0].a,null);assert.equal(state.zones[0].b.uid,'bravo');
  assert.equal(state.zones[0].matches[0].participants.b.uid,oldAI);
  assert.equal(state.service.alpha.matchIds.length,1);assert.equal(state.service.bravo.matchIds.length,0);
  assert(api.settleWarfrontForfeit(first));assert.equal((await read()).service.alpha.matchIds.length,1);
  await assert.rejects(deploy('alpha',state.zones[1].id,'b'),/alliance/);
  for(let i=1;i<5;i++){
    state=await read();const z=state.zones[i];const displaced=z.a.uid;
    await deploy('alpha',z.id,'a');state=await read();
    assert(state.zones.some(row=>row.a?.uid===displaced),'displaced AI finds a free allied post');
    const match=await start('alpha',z.id,'match-'+i);match.outcome={winner:i===4?null:1,totalFate:[10,20]};
    assert(api.settleWarfrontForfeit(match));
    state=await read();assert(!state.zones.some(z=>z.a?.uid==='alpha'||z.b?.uid==='alpha'));
  }
  assert.equal(state.service.alpha.matchIds.length,5,'draw also consumes one of five matches');
  await assert.rejects(deploy('alpha',zoneId,'a'),/five matches/);
  api.close();api=makeApi();assert.equal((await read()).service.alpha.matchIds.length,5,'allowance survives restart');
  await assert.rejects(deploy('alpha',zoneId,'a'),/five matches/);
  await command('end');state=await read();assert(state.lastResult.players.some(p=>p.uid==='alpha'&&p.matches===5));
  assert.equal(state.lastResult.achievements.find(a=>a.id==='fate').leader.uid,'alpha');
  console.log('Warfront live AI replacement, relocation, human protection, release, attribution, five-match cap, draws and restart passed');
}finally{if(server)await new Promise(resolve=>server.close(resolve));api?.close();globalThis.fetch=originalFetch;fs.rmSync(dir,{recursive:true,force:true});}
