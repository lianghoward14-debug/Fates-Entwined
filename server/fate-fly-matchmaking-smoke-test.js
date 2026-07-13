#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {spawn} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {getCardCatalog} = require('./fate-card-catalog');

const PORT = Number(process.env.FATE_FLY_MATCHMAKING_SMOKE_PORT || 8801);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ROOT = path.resolve(__dirname, '..');

function sleep(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(route, opts={}){
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(new Error(`timed out fetching ${route}`)), Number(opts.timeoutMs || 10000));
  try{
    const res = await fetch(ORIGIN + route, {
      method:opts.method || 'GET',
      headers:{'content-type':'application/json'},
      body:opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal:controller.signal
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if(!res.ok || json.ok === false) throw new Error(`${opts.method || 'GET'} ${route} failed ${res.status}: ${json.error || text}`);
    return json;
  }finally{
    clearTimeout(timer);
  }
}

async function waitForHealth(child, log){
  const started = Date.now();
  while(Date.now() - started < 10000){
    if(child.exitCode !== null) throw new Error(`authority exited early (${child.exitCode}): ${log()}`);
    try{
      const health = await fetchJson('/health', {timeoutMs:1000});
      if(health.ok !== false) return health;
    }catch(_){}
    await sleep(100);
  }
  throw new Error(`authority did not become healthy: ${log()}`);
}

function startServer(dataDir){
  let output = '';
  const child = spawn(process.execPath, ['server/fate-ws-authority.js'], {
    cwd:ROOT,
    env:Object.assign({}, process.env, {
      FATE_WS_HOST:'127.0.0.1',
      FATE_WS_PORT:String(PORT),
      FATE_WS_REQUIRE_TOKEN:'0',
      FATE_WS_DISABLE_FIREBASE_RTDB:'1',
      FATE_RTDB_DISABLED:'1',
      FATE_WS_DURABLE_WRITES:'off',
      FATE_WS_STATE_GATE:'1',
      FATE_WS_REDUCER_MODE:'client-resolved',
      FATE_WS_DATA_DIR:dataDir,
      FATE_WS_DISCONNECT_TIMEOUT_MS:'60000',
      FATE_WS_PING_MS:'60000'
    }),
    stdio:['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  return {child, log:()=>output.slice(-4000)};
}

function stopServer(child){
  if(!child || child.exitCode !== null) return Promise.resolve();
  return new Promise(resolve=>{
    const timer = setTimeout(()=>{
      try{ child.kill(); }catch(_){}
      resolve();
    }, 3000);
    child.once('exit', ()=>{
      clearTimeout(timer);
      resolve();
    });
    try{ child.kill('SIGTERM'); }catch(_){ clearTimeout(timer); resolve(); }
  });
}

function profile(name){
  return {displayName:name, username:name, challengerElo:600, challengerWins:0, challengerLosses:0};
}

function deckChoice(name){
  const ids = getCardCatalog().cards.map(card => String(card.id || '')).filter(Boolean).slice(0, 40);
  assert.strictEqual(ids.length, 40, 'card catalog must provide a 40-card smoke deck');
  return {ready:true, name, deckIds:ids};
}

async function main(){
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fate-fly-matchmaking-smoke-'));
  const {child, log} = startServer(dataDir);
  try{
    const health = await waitForHealth(child, log);
    assert.strictEqual(health.reducerMode, 'client-resolved');
    assert.strictEqual(health.firebaseRtdbDisabled, true);

    const hostUid = 'matchmaking-host';
    const guestUid = 'matchmaking-guest';
    const hostEnter = await fetchJson('/api/matchmaking/enter', {
      method:'POST',
      body:{
        uid:hostUid,
        mode:'ranked',
        profile:profile('Queue Host'),
        deckChoice:deckChoice('Host Deck')
      }
    });
    assert.strictEqual(hostEnter.matched, false);
    assert.strictEqual(hostEnter.role, 'host');
    assert.strictEqual(hostEnter.room.hostUid, hostUid);
    const code = String(hostEnter.room.roomCode || hostEnter.room.code || '');
    assert.ok(/^[A-Z0-9]{6}$/.test(code), 'host queue room should expose a room code');

    const waiting = await fetchJson('/api/matchmaking?mode=ranked');
    assert.strictEqual(waiting.entries.length, 1, 'host should be visible in ranked matchmaking');

    const guestEnter = await fetchJson('/api/matchmaking/enter', {
      method:'POST',
      body:{
        uid:guestUid,
        mode:'ranked',
        profile:profile('Queue Guest'),
        deckChoice:deckChoice('Guest Deck')
      }
    });
    assert.strictEqual(guestEnter.matched, true);
    assert.strictEqual(guestEnter.role, 'guest');
    assert.strictEqual(String(guestEnter.room.roomCode || guestEnter.room.code || ''), code);
    assert.strictEqual(guestEnter.room.guestUid, guestUid);

    const room = await fetchJson(`/api/rooms/${encodeURIComponent(code)}`);
    assert.strictEqual(room.room.guestUid, guestUid, 'host room watch should be able to see the matched guest');
    assert.strictEqual(room.room.players[hostUid].deckChoice.ready, true);
    assert.strictEqual(room.room.players[guestUid].deckChoice.ready, true);
    assert.strictEqual(room.room.players[hostUid].deckChoice.deckCount, 40);
    assert.strictEqual(room.room.players[guestUid].deckChoice.deckCount, 40);

    const afterMatch = await fetchJson('/api/matchmaking?mode=ranked');
    assert.strictEqual(afterMatch.entries.length, 0, 'matched queue entries should be cleared');

    const started = await fetchJson(`/api/rooms/${encodeURIComponent(code)}/start`, {
      method:'POST',
      body:{uid:hostUid, seed:'matchmaking-smoke-seed', song:'board1', mode:'ranked'}
    });
    assert.strictEqual(String(started.accepted?.action?.type || ''), 'MATCH_START');
    assert.ok(started.room.status === 'starting' || started.room.status === 'playing');

    console.log('fate-fly-matchmaking smoke passed');
  }finally{
    await stopServer(child);
  }
}

main().catch(err=>{
  console.error(err);
  process.exit(1);
});
