import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {multiplayerEligibleCardIds} from '../../shared/engine/index.mjs';

const source=fs.readFileSync('src/scripts/authoritative-v3-phase7-beta-client.mjs','utf8');
const sessionCode=source.slice(source.indexOf("let fallbackMatchmakingSession="),source.indexOf('async function matchmakingIdentityToken'));
const queueCode=source.slice(source.indexOf('async function startUnrankedMatchmaking('),source.indexOf('async function leaveMatchmaking('));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'warfront-queue-entry-')),port=25000+process.pid%1000,base=`http://127.0.0.1:${port}`;
const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function token(uid){const raw=`${encode({alg:'RS256',kid:'test'})}.${encode({sub:uid,aud:'fates-entwined-41491',iss:'https://securetoken.google.com/fates-entwined-41491',exp:Math.floor(Date.now()/1000)+3600})}`;return `${raw}.${crypto.sign('RSA-SHA256',Buffer.from(raw),privateKey).toString('base64url')}`;}
const zones=['north-gate','silver-crossing','heartland','sunken-road','crown-reach'].map(id=>({id,a:id==='heartland'?{uid:'alpha'}:null,b:id==='heartland'?{uid:'bravo'}:null,matches:[],landscape:{id:'igb1'},bans:{a:[],b:[]},bansLocked:{a:false,b:false}}));
fs.writeFileSync(path.join(dir,'rooms.json'),JSON.stringify({warfrontEvent:{mapCode:'WF-QUEUE',sequence:1,status:'active',endsAt:Date.now()+3600000,zones,archives:[]}}));
const boot=path.join(dir,'boot.mjs');
fs.writeFileSync(boot,`const original=globalThis.fetch;globalThis.fetch=(url,...args)=>String(url).includes('googleapis.com')?Promise.resolve({ok:true,headers:new Headers(),json:async()=>({test:${JSON.stringify(publicKey.export({type:'spki',format:'pem'}))}})}):original(url,...args);await import(${JSON.stringify(pathToFileURL(path.resolve('server/authoritative-v3/phase7-beta-server.mjs')).href)});`);
const child=spawn(process.execPath,[boot],{env:{...process.env,FATE_AUTHORITY_V3_PHASE7_BUILD_ID:'warfront-queue-regression',FATE_AUTHORITY_V3_PHASE7_CLIENT_VERSION:'1.39.0-phase7-beta.1',FATE_SERVER_AUTHORITATIVE_V3_ENABLED:'0',FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED:'0',FATE_SERVER_AUTHORITATIVE_V3_PHASE7_BETA_ENABLED:'1',FATE_AUTHORITY_V3_HOST:'127.0.0.1',FATE_AUTHORITY_V3_PORT:String(port),FATE_AUTHORITY_V3_DATA_DIR:dir,FATE_FLY_DATA_API_DIR:dir,FATE_FLY_DATA_API_ENABLED:'1',FATE_AUTHORITY_V3_ALLOW_TEST_MATCHES:'0',FATE_AUTHORITY_V3_PHASE7_ALLOW_TEST_IDENTITIES:'0',FATE_WARFRONT_AUTHORITY_BASELINE_RESET:'0'},stdio:['ignore','pipe','pipe']});
const clients=[];let timeout;let logs='';child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const version='1.39.0-phase7-beta.1';
async function jsonRequest(route,headers,options={}){const res=await fetch(base+route,{method:options.method||'GET',headers:{'content-type':'application/json','x-fate-client-version':version,...headers},body:options.body?JSON.stringify(options.body):undefined});const body=await res.json();if(!res.ok)throw Object.assign(new Error(body.error),{status:res.status});return body;}
try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/health')).ok){ready=true;break;}}catch{}await delay(50);}assert(ready,logs);
  function client(uid,sessionName){
    const storage=new Map(),statuses=[];let mounted=false,interrupted=false;
    const c={location:{search:'?electronSession='+sessionName},URLSearchParams,sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},crypto,Date,Math,console,AbortSignal,AbortController,
      setTimeout,clearTimeout,FATE_PHASE7_UNRANKED_BETA:true,
      document:{getElementById:()=>null},
      fetch:(url,options)=>{if(uid==='alpha'&&!interrupted&&String(url).endsWith('/matchmaking/enter')){interrupted=true;return Promise.resolve(new Response(JSON.stringify({ok:false,error:'Temporary connection interruption'}),{status:503}));}return fetch(String(url).replace('https://fates-entwined-main.fly.dev',base),options);},
      WebSocket:class extends WebSocket{constructor(url){super(String(url).replace('wss://fates-entwined-main.fly.dev','ws://127.0.0.1:'+port));}},
      FATE_PENDING_WAR_MATCH:{mapCode:'WF-QUEUE',zoneId:'heartland'},FateOnline:{flyApiRequest:(route,options)=>jsonRequest(route,{authorization:'Bearer '+token(uid)},options)},
      FatePhase7CurrentMultiplayerUi:{mount({adapter}){const view=adapter.view();assert.equal(view.state.phase,'coin');assert.equal(view.queueMode,'warfront');mounted=true;return {render(){},unmount(){}};}}};
    vm.createContext(c);vm.runInContext(source,c);clients.push(c);
    return {c,statuses,mounted:()=>mounted};
  }
  const a=client('alpha','player1'),b=client('bravo','player2');
  assert.notEqual(a.c.matchmakingClientSession(),b.c.matchmakingClientSession(),'two accounts in distinct desktop partitions must have distinct queue identities');
  assert.equal(a.c.matchmakingClientSession(),a.c.matchmakingClientSession(),'polls must retain identity');
  const warSource=fs.readFileSync('src/scripts/47-challenger-war-event.js','utf8');
  const prepareCode=warSource.slice(warSource.indexOf('async function prepareWarfrontQueue('),warSource.indexOf('const warQueueWithoutWaitingScreen='));
  for(const [client,uid] of [[a,'alpha'],[b,'bravo']]){
    Object.assign(client.c,{clone:structuredClone,me:()=>({uid}),warfrontRequest:(route,options)=>client.c.FateOnline.flyApiRequest(route,options),adoptRemoteState:()=>{},score:()=>({played:0}),opposite:t=>t==='a'?'b':'a'});
    vm.runInContext(prepareCode,client.c);
    const prepared=await client.c.prepareWarfrontQueue({mapCode:'STALE',zoneId:'heartland',opponentUid:'old-account'});
    assert.equal(prepared.mapCode,'WF-QUEUE');assert.equal(prepared.opponentUid,uid==='alpha'?'bravo':'alpha');
  }
  const request={deckIds:multiplayerEligibleCardIds().slice(0,40),queueMode:'warfront',matchmakingKey:'WF-QUEUE|heartland|alpha|bravo',landscapeId:'igb1'};
  const results=await Promise.race([Promise.all([a.c.startUnrankedMatchmaking({...request,onStatus:s=>a.statuses.push(s)}),b.c.startUnrankedMatchmaking({...request,onStatus:s=>b.statuses.push(s)})]),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Both players failed to enter a reserved match')),12000);})]);
  assert(a.statuses.some(s=>s.reconnecting),'temporary request failures recover visibly');assert(results.every(x=>x.ok));assert.equal(results[0].credential.matchId,results[1].credential.matchId);assert.notEqual(results[0].connection.playerIndex,results[1].connection.playerIndex);assert(a.mounted()&&b.mounted());
  const state=await jsonRequest('/api/warfront/state',{authorization:`Bearer ${token('alpha')}`});assert.equal(state.state.zones[2].activeMatch.matchId,results[0].credential.matchId);
  console.log('Two accounts in player1/player2 desktop sessions enter, match, bind their accounts, receive private coin-phase views over WebSockets and reach the UI bridge through the full production client');
}finally{clearTimeout(timeout);for(const c of clients)c.fateAuthorityV3Beta.disconnect({forget:true});child.kill();await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));fs.rmSync(dir,{recursive:true,force:true});}
