#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const {spawn} = require('child_process');

const PORT = Number(process.env.FATE_SERVER_RANK_SMOKE_PORT || 8824);
const HOST = '127.0.0.1';
const ROOT = path.resolve(__dirname, '..');
const BASE = `http://${HOST}:${PORT}`;

function delay(ms){ return new Promise(resolve=>setTimeout(resolve, ms)); }

function startServer(){
  const child = spawn(process.execPath, ['server/fate-ws-authority.js'], {
    cwd:ROOT,
    env:Object.assign({}, process.env, {
      PORT:String(PORT),
      FATE_WS_REQUIRE_TOKEN:'0',
      FATE_WS_DURABLE_WRITES:'off',
      FATE_WS_DISABLE_FIREBASE_RTDB:'1',
      FATE_WS_FLY_STORE:'0',
      FATE_WS_PING_MS:'60000'
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
    const timer = setTimeout(resolve, 5000);
    child.once('exit', ()=>{ clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}

async function waitForHealth(child){
  const deadline = Date.now() + 6000;
  let lastErr = null;
  while(Date.now() < deadline){
    if(child.exitCode !== null) throw new Error('server exited early:\n' + child.fateLog());
    try{
      const res = await fetch(`${BASE}/health`);
      if(res.ok) return await res.json();
    }catch(e){ lastErr = e; }
    await delay(100);
  }
  throw new Error('server did not become healthy' + (lastErr ? ': ' + lastErr.message : '') + '\n' + child.fateLog());
}

async function requestJson(method, requestPath, body){
  const res = await fetch(`${BASE}${requestPath}`, {
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

async function main(){
  const child = startServer();
  try{
    await waitForHealth(child);
    const uid = 'ranklive-user';

    const first = await requestJson('POST', '/api/challenger-results', {
      uid,
      didWin:true,
      opponentElo:1000,
      source:'ai',
      profile:{uid, username:'Rank Owner', challengerElo:1800, challengerWins:99, challengerLosses:4, matchesPlayed:103}
    });
    assert.strictEqual(first.result.oldElo, 600, 'first result must start from server default, not stale profile ELO');
    assert.ok(first.result.newElo > 600, 'win should raise server ELO');
    assert.strictEqual(first.profile.challengerWins, 1);
    assert.strictEqual(first.profile.challengerLosses, 0);

    const staleProfileSync = await requestJson('POST', `/api/profiles/${encodeURIComponent(uid)}`, {
      uid,
      profile:{uid, username:'Renamed Rank Owner', challengerElo:2400, challengerWins:500, challengerLosses:0, matchesPlayed:500}
    });
    assert.strictEqual(staleProfileSync.profile.username, 'Renamed Rank Owner', 'cosmetic profile sync should still apply');
    assert.strictEqual(staleProfileSync.profile.challengerElo, first.result.newElo, 'profile sync must not overwrite server ELO');
    assert.strictEqual(staleProfileSync.profile.challengerWins, 1, 'profile sync must not overwrite server wins');
    assert.strictEqual(staleProfileSync.profile.challengerLosses, 0, 'profile sync must not overwrite server losses');

    const second = await requestJson('POST', '/api/challenger-results', {
      uid,
      didWin:false,
      opponentElo:1000,
      source:'ai',
      profile:{uid, username:'Renamed Rank Owner', challengerElo:100, challengerWins:0, challengerLosses:99, matchesPlayed:99}
    });
    assert.strictEqual(second.result.oldElo, first.result.newElo, 'next result must continue from server ELO');
    assert.strictEqual(second.profile.challengerWins, 1);
    assert.strictEqual(second.profile.challengerLosses, 1);

    await requestJson('POST', '/api/challenger-results', {
      uid:'corrupt-tyranus-user',
      didWin:true,
      opponentElo:1000,
      source:'ai',
      profile:{uid:'corrupt-tyranus-user', username:'Sic Kemper Tyranus'}
    });
    await requestJson('POST', '/api/challenger-results', {
      uid:'safe-tyrannis-user',
      didWin:true,
      opponentElo:1000,
      source:'ai',
      profile:{uid:'safe-tyrannis-user', username:'Sic Semper Tyrannis'}
    });

    const board = await requestJson('GET', '/api/leaderboards/challenger?limit=20');
    const entry = board.leaderboard.find(row=>row.uid === uid);
    assert(entry, 'leaderboard should include ranked user');
    assert.strictEqual(entry.elo, second.result.newElo);
    assert.strictEqual(entry.wins, 1);
    assert.strictEqual(entry.losses, 1);
    assert(!board.leaderboard.some(row=>row.uid === 'corrupt-tyranus-user'), 'corrupted Sic Kemper Tyranus entry should be hidden');
    assert(board.leaderboard.some(row=>row.uid === 'safe-tyrannis-user'), 'Tyrannis entries must not be removed by Tyranus cleanup');
    const purgedCorruptProfile = await requestJson('GET', '/api/profiles/corrupt-tyranus-user');
    assert.notStrictEqual(purgedCorruptProfile.profile.username, 'Sic Kemper Tyranus', 'corrupted Sic Kemper Tyranus profile should be purged from server leaderboard profiles');

    console.log('Server authoritative rank smoke test passed.');
  }finally{
    await stopServer(child);
  }
}

main().catch(error=>{
  console.error(error);
  process.exitCode = 1;
});
