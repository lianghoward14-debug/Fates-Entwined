import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const betaServer = path.join(path.dirname(fileURLToPath(import.meta.url)), 'phase7-beta-server.mjs');
const clientVersion = '1.39.0-phase7-beta.1';
const adminToken = 'phase7-local-admin';
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fate-authority-v3-phase7-'));
const port = 20000 + (process.pid % 1000);
let child = null;
let childOutput = '';

const disabled = spawnSync(process.execPath, [betaServer], {
  encoding:'utf8',
  env:{...process.env, FATE_SERVER_AUTHORITATIVE_V3_PHASE7_BETA_ENABLED:''}
});
assert.notEqual(disabled.status, 0);
assert.match(disabled.stderr, /Phase 7 unranked beta is isolated and disabled/);

const conflicting = spawnSync(process.execPath, [betaServer], {
  encoding:'utf8',
  env:{
    ...process.env,
    FATE_SERVER_AUTHORITATIVE_V3_PHASE7_BETA_ENABLED:'1',
    FATE_SERVER_AUTHORITATIVE_V3_ENABLED:'1',
    FATE_AUTHORITY_V3_PHASE7_CLIENT_VERSION:clientVersion
  }
});
assert.notEqual(conflicting.status, 0);
assert.match(conflicting.stderr, /owns its authority route/);

function delay(ms){
  return new Promise(resolve=>setTimeout(resolve, ms));
}

function startServer(){
  childOutput = '';
  child = spawn(process.execPath, [betaServer], {
    env:{
      ...process.env,
      FATE_SERVER_AUTHORITATIVE_V3_ENABLED:'',
      FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED:'',
      FATE_SERVER_AUTHORITATIVE_V3_PHASE7_BETA_ENABLED:'1',
      FATE_AUTHORITY_V3_PHASE7_CLIENT_VERSION:clientVersion,
      FATE_AUTHORITY_V3_PHASE7_BUILD_ID:'phase7-local-smoke-build',
      FATE_AUTHORITY_V3_PHASE7_ALLOW_TEST_IDENTITIES:'1',
      FATE_AUTHORITY_V3_PHASE7_ALLOW_ORGANIC_TEST_FIXTURES:'1',
      FATE_AUTHORITY_V3_ALLOW_TEST_MATCHES:'1',
      FATE_AUTHORITY_V3_ADMIN_TOKEN:adminToken,
      FATE_AUTHORITY_V3_HOST:'127.0.0.1',
      FATE_AUTHORITY_V3_PORT:String(port),
      FATE_AUTHORITY_V3_DATA_DIR:dataDir,
      FATE_AUTHORITY_V3_SNAPSHOT_INTERVAL:'1',
      FATE_AUTHORITY_V3_RETAINED_MATCHES:'10',
      FATE_AUTHORITY_V3_PHASE7_QUEUE_STALE_MS:'1000'
    },
    stdio:['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk=>{ childOutput += chunk; });
  child.stderr.on('data', chunk=>{ childOutput += chunk; });
}

async function stopServer(){
  if(!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  for(let attempt = 0; attempt < 60 && child.exitCode === null; attempt += 1) await delay(50);
  if(child.exitCode === null) child.kill('SIGKILL');
}

async function waitForHealth(){
  for(let attempt = 0; attempt < 100; attempt += 1){
    if(child?.exitCode !== null) throw new Error(`Phase 7 server exited early: ${childOutput}`);
    try{
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if(response.ok) return response.json();
    }catch{}
    await delay(50);
  }
  throw new Error(`timed out waiting for Phase 7 server: ${childOutput}`);
}

function socketHarness(pathname = '/v3/beta/socket'){
  const socket = new WebSocket(`ws://127.0.0.1:${port}${pathname}`);
  const messages = [];
  const waiters = [];
  socket.addEventListener('message', event=>{
    const message = JSON.parse(String(event.data || '{}'));
    messages.push(message);
    for(const waiter of [...waiters]){
      if(!waiter.predicate(message)) continue;
      waiters.splice(waiters.indexOf(waiter), 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  });
  return {
    socket,
    messages,
    opened:new Promise((resolve, reject)=>{
      socket.addEventListener('open', resolve, {once:true});
      socket.addEventListener('error', reject, {once:true});
    }),
    waitFor(predicate, timeout = 4000){
      const existing = messages.find(predicate);
      if(existing) return Promise.resolve(existing);
      return new Promise((resolve, reject)=>{
        const waiter = {
          predicate,
          resolve,
          timer:setTimeout(()=>{
            waiters.splice(waiters.indexOf(waiter), 1);
            reject(new Error(
              `timed out waiting for Phase 7 WebSocket message on ${pathname}; `
              + `received ${JSON.stringify(messages).slice(0, 1200)}`
            ));
          }, timeout)
        };
        waiters.push(waiter);
      });
    }
  };
}

function betaHeaders(version = clientVersion){
  return {
    authorization:`Bearer ${adminToken}`,
    'content-type':'application/json',
    'x-fate-client-version':version
  };
}

function identityHeaders(uid){
  return {
    authorization:`Bearer test:${uid}`,
    'content-type':'application/json',
    'x-fate-client-version':clientVersion
  };
}

function fixtureHeaders(uid){
  return {...identityHeaders(uid), 'x-fate-organic-fixture':'1'};
}

const {default:vm}=await import('node:vm');
const {createDeltaDecoder}=await import('../../shared/multiplayer-delta.mjs');
const source=fs.readFileSync('src/scripts/authoritative-v3-phase7-beta-client.mjs','utf8').replace(/^import .*;\r?\n/,'');
const clients=[];
const contexts=[];let uiErrors=0;
function client(seat){
  const values=new Map();
  const context={console:{...console,error:(...args)=>{if(String(args[0]).includes('board render failed'))uiErrors++;else console.error(...args);}},URLSearchParams,WebSocket,fetch,AbortSignal,crypto:globalThis.crypto,performance,setTimeout,clearTimeout,createDeltaDecoder,
    FATE_PHASE7_UNRANKED_BETA:true,
    location:{search:'?electron=1&fateV3BetaTestAuth=1&e2eOrganicCardCampaign=1&e2eStrictCardCertification=1&fateV3FullUiE2E=1&e2eRunId=repeat-match&e2eSeat='+seat+'&fateV3BetaTestApiUrl=http://127.0.0.1:'+port},
    sessionStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}};
  vm.createContext(context);vm.runInContext(source,context);contexts.push(context);return context.fateAuthorityV3Beta;
}
try{
  startServer();await waitForHealth();clients.push(client('a'),client('b'));
  const seen=new Set();let maxHealthMs=0;
  for(let game=0;game<20;game++){
    const mode=game%2?'ranked':'freeplay';
    const result=await Promise.all(clients.map(c=>c.startUnrankedMatchmaking({deckIds:Array(40).fill('32'),queueMode:mode})));
    const id=result[0].credential.matchId;assert.equal(id,result[1].credential.matchId);assert(!seen.has(id));seen.add(id);
    // Reproduce a stale/throwing board presenter without letting it poison the connection.
    for(const context of contexts)vm.runInContext('activeScreen={render(){throw new Error("injected board failure");},unmount(){}};',context);
    const coin=clients.find(c=>c.report().legalCommands.some(x=>x.type==='CHOOSE_TURN_ORDER'));
    const choice=coin.report().legalCommands.find(x=>x.type==='CHOOSE_TURN_ORDER');await coin.sendCommand(choice.type,choice.payload);
    await delay(30);
    const active=clients.find(c=>c.report().playerIndex===c.report().state.activePlayer);
    const end=await active.sendCommand('CONCEDE',{});assert(end.state.outcome);
    await delay(30);for(const c of clients){assert(c.report().state.outcome);c.disconnect({forget:true});}
    await delay(30);const started=performance.now();const health=await waitForHealth();maxHealthMs=Math.max(maxHealthMs,performance.now()-started);assert.equal(health.activeSockets,0);
    console.log('Completed and requeued cycle',game+1,mode);
  }
  assert(uiErrors>0);
  for(const context of contexts)assert.equal(vm.runInContext('activeScreen',context),null);
  console.log('PASS: 20 matches through actual client, same sessions, fresh match IDs, no retained sockets; max health latency',Math.round(maxHealthMs),'ms');
}finally{
  for(const c of clients)c.disconnect({forget:true});await stopServer();fs.rmSync(dataDir,{recursive:true,force:true});
}
