#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {spawn} = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const HOST = '127.0.0.1';
const PORT = Number(process.env.FATE_FLY_LOCAL_RUNTIME_SMOKE_PORT || 8824);
const BASE_URL = `http://${HOST}:${PORT}`;
const TMP_ROOT = path.join(ROOT, '.tmp');

function delay(ms){ return new Promise(resolve=>setTimeout(resolve, ms)); }

async function waitForHealth(){
  const deadline = Date.now() + 6000;
  let lastErr = null;
  while(Date.now() < deadline){
    try{
      const res = await fetch(`${BASE_URL}/health`);
      if(res.ok) return await res.json();
    }catch(e){ lastErr = e; }
    await delay(100);
  }
  throw new Error('Fly local runtime server did not become healthy' + (lastErr ? ': ' + lastErr.message : ''));
}

async function requestJson(method, requestPath, body){
  const res = await fetch(`${BASE_URL}${requestPath}`, {
    method,
    headers:{'content-type':'application/json'},
    body:body === undefined ? undefined : JSON.stringify(body || {})
  });
  const text = await res.text();
  let json = null;
  try{ json = text ? JSON.parse(text) : null; }catch(e){}
  if(!res.ok || json?.ok === false){
    throw new Error(`${method} ${requestPath} failed ${res.status}: ${json?.error || text.slice(0, 200)}`);
  }
  return json;
}

function startServer(dataDir){
  const child = spawn(process.execPath, ['server/fate-fly-authority-local.js'], {
    cwd:ROOT,
    env:Object.assign({}, process.env, {
      FATE_WS_HOST:HOST,
      FATE_WS_PORT:String(PORT),
      FATE_WS_DATA_DIR:dataDir,
      FATE_WS_REQUIRE_TOKEN:'0',
      FATE_WS_PING_MS:'60000',
      FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({
        client_email:'unused@example.com',
        private_key:'-----BEGIN PRIVATE KEY-----\\nunused\\n-----END PRIVATE KEY-----\\n'
      })
    }),
    stdio:['ignore', 'pipe', 'pipe']
  });
  let log = '';
  child.stdout.on('data', chunk=>{ log += chunk.toString(); });
  child.stderr.on('data', chunk=>{ log += chunk.toString(); });
  child.fateLog = ()=>log;
  return child;
}

function stopServer(child){
  return new Promise(resolve=>{
    if(!child || child.killed || child.exitCode !== null) return resolve();
    const timer = setTimeout(()=>{
      try{ child.kill('SIGKILL'); }catch(e){}
      resolve();
    }, 7000);
    child.once('exit', ()=>{ clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}

(async function main(){
  fs.mkdirSync(TMP_ROOT, {recursive:true});
  const dataDir = fs.mkdtempSync(path.join(TMP_ROOT, 'fate-fly-local-runtime-'));
  let child = null;
  try{
    child = startServer(dataDir);
    const health = await waitForHealth();
    assert.strictEqual(health.reducerMode, 'strict');
    assert.strictEqual(health.firebaseRtdbDisabled, true);
    assert.strictEqual(health.firebaseDurableWrites, false);
    assert.strictEqual(health.durableWrites, false);
    assert.strictEqual(health.flyDurableStore, true);
    assert.strictEqual(health.flyDurableStoreReady, true);
    assert.strictEqual(path.resolve(health.flyDataDir), path.resolve(dataDir));

    const created = await requestJson('POST', '/api/rooms', {
      uid:'runtime-host',
      mode:'freeplay',
      profile:{displayName:'Runtime Host'},
      deckChoice:{name:'Runtime Deck', deckIds:[]}
    });
    const code = String(created.room?.roomCode || created.room?.code || '');
    assert.match(code, /^[A-Z0-9]{6}$/);
    assert.strictEqual(created.room.hostUid, 'runtime-host');

    await stopServer(child);
    child = null;

    const roomsFile = path.join(dataDir, 'rooms.json');
    assert.ok(fs.existsSync(roomsFile), 'local Fly wrapper should persist rooms.json');
    const snapshot = JSON.parse(fs.readFileSync(roomsFile, 'utf8'));
    assert.ok(Array.isArray(snapshot.rooms), 'rooms.json should contain rooms array');
    assert.ok(snapshot.rooms.some(room=>room.code === code && room.hostUid === 'runtime-host'), 'rooms.json should include created room');
    console.log('fate-fly-local-runtime smoke passed');
  }finally{
    await stopServer(child);
    fs.rmSync(dataDir, {recursive:true, force:true});
  }
})().catch(err=>{
  console.error(err && err.stack || err);
  process.exit(1);
});
