import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {startWarfrontBattle,warfrontDueMatch,relocateWarfrontAI,WARFRONT_PHASE_MS} from './warfront-lifecycle.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'warfront-human-'));
process.env.FATE_FLY_DATA_API_DIR=dir;
const originalFetch=globalThis.fetch;
const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
globalThis.fetch=async()=>({ok:true,headers:new Headers(),json:async()=>({test:publicKey.export({type:'spki',format:'pem'})})});
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const project='fates-entwined-41491',input=`${encode({alg:'RS256',kid:'test'})}.${encode({sub:'human',aud:project,iss:`https://securetoken.google.com/${project}`,exp:Math.floor(Date.now()/1000)+3600})}`;
const token=`${input}.${crypto.sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url')}`;
const initial={version:2,sequence:1,mapCode:'WF-HUMAN-TEST',status:'active',archives:[],zones:Array.from({length:5},(_,i)=>({id:'zone-'+i,a:{uid:'ai-'+i,isAI:true},b:null,matches:[]}))};
fs.writeFileSync(path.join(dir,'rooms.json'),JSON.stringify({warfrontEvent:initial}));
const {createFlyDataApi}=await import('./fly-data-api.mjs');
const make=()=>createFlyDataApi({readBody:async req=>req.body,writeJson:(res,status,body)=>Object.assign(res,{status,body})});
let api=make();
async function request(route,body,auth=true){const res={};await api.handle({method:'POST',headers:auth?{authorization:`Bearer ${token}`}:{},body:{uid:'human',...body}},res,new URL('/api/warfront/'+route,'http://localhost'));return res;}
try{
  const denied=await request('command',{action:'human'},false);
  assert.equal(denied.status,401);
  let res=await request('command',{action:'human'});
  assert.equal(res.status,200);
  let state=res.body.state;
  assert.equal(state.status,'enrollment');assert.equal(state.humanOnly,true);
  assert.notEqual(state.mapCode,initial.mapCode);
  assert(state.zones.every(z=>!z.a&&!z.b&&!z.matches.length));
  res=await request('deploy',{zoneId:'zone-0',team:'a',profile:{name:'Human',isAI:true}});
  assert.equal(res.status,200);assert(!res.body.state.zones[0].a.isAI);
  const forged=structuredClone(res.body.state);forged.humanOnly=false;forged.zones[1].a={uid:'fake-ai',isAI:true};
  res=await request('state',{state:forged});assert.equal(res.body.state.humanOnly,true);assert.equal(res.body.state.zones[1].a,null);
  api.flush();api.close();api=make();
  res=await request('command',{action:'start'});state=res.body.state;
  assert.equal(res.status,200);assert.equal(state.humanOnly,true);assert.equal(state.status,'active');
  assert.equal(state.zones.flatMap(z=>[z.a,z.b]).filter(Boolean).length,1);
  assert(state.zones.every(z=>z.aiSchedule.length===0));
  assert.equal(warfrontDueMatch(state,state.endsAt),null);
  state.waitingAI=[{team:'b',player:{uid:'ai',isAI:true}}];relocateWarfrontAI(state);assert.equal(state.waitingAI.length,0);assert.equal(state.zones[0].b,null);
  res=await request('command',{action:'human'});
  const realNow=Date.now;
  try{Date.now=()=>res.body.state.createdAt+WARFRONT_PHASE_MS;await api.tickWarfront();}finally{Date.now=realNow;}
  api.flush();state=JSON.parse(fs.readFileSync(path.join(dir,'rooms.json'))).warfrontEvent;
  assert.equal(state.status,'active');assert(state.zones.every(z=>!z.a&&!z.b));
  res=await request('command',{action:'deployment'});assert.equal(res.body.state.humanOnly,false);
  state=res.body.state;startWarfrontBattle(state,Date.now());assert.equal(state.zones.flatMap(z=>[z.a,z.b]).filter(p=>p.isAI).length,10);
  console.log('Human-only Warfront: authenticated reset, human deployment, sync protection, restart, forced/timed start and normal reset passed');
}finally{api.close();globalThis.fetch=originalFetch;}
