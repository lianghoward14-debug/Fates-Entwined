#!/usr/bin/env node
'use strict';

const assert = require('assert');
const http = require('http');
const https = require('https');

const ORIGIN = String(process.env.FATE_FLY_LIVE_URL || process.argv[2] || 'https://fates-entwined-main.fly.dev').replace(/\/+$/, '');

function fetchText(url){
  return new Promise((resolve, reject)=>{
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(url, {headers:{'user-agent':'fate-fly-live-readiness-smoke/1'}}, res=>{
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk=>{ body += chunk; });
      res.on('end', ()=>resolve({status:res.statusCode || 0, headers:res.headers || {}, body}));
    });
    req.setTimeout(15000, ()=>{
      req.destroy(new Error(`timed out fetching ${url}`));
    });
    req.on('error', reject);
  });
}

async function fetchOk(path){
  const url = ORIGIN + path;
  const res = await fetchText(url);
  assert.strictEqual(res.status, 200, `${url} returned ${res.status}`);
  return res;
}

async function main(){
  const healthRes = await fetchOk('/health');
  const health = JSON.parse(healthRes.body);
  assert.strictEqual(health.ok, true, 'live health must report ok:true');
  assert.strictEqual(health.reducerMode, 'strict', 'live authority must run strict reducer mode');
  assert.strictEqual(health.firebaseRtdbDisabled, true, 'live authority must disable Firebase RTDB gameplay');
  assert.strictEqual(health.flyDurableStore, true, 'live authority must use the Fly durable store');
  assert.strictEqual(health.flyDurableStoreReady, true, 'live Fly durable store must be ready');
  assert.strictEqual(health.flyActionReplay, true, 'live authority must expose action replay');
  assert.strictEqual(health.flyResumeReplay, true, 'live authority must expose resume replay');

  const indexRes = await fetchOk('/index.html');
  const indexText = indexRes.body;
  assert.match(indexText, /window\.FATE_WS_AUTHORITY_ENABLED\s*=\s*true[\s\S]*window\.FATE_WS_AUTHORITY_URL\s*=\s*origin\.replace\(\//, 'live index must auto-configure WebSocket authority from origin');
  assert.match(indexText, /window\.FATE_RTDB_DISABLED\s*=\s*true[\s\S]*window\.FATE_FLY_ROOMS_ENABLED\s*=\s*true[\s\S]*window\.FATE_FLY_ACTION_REPLAY\s*=\s*true[\s\S]*window\.FATE_FLY_AUTHORITY_ONLY\s*=\s*true/, 'live index must force Fly-primary no-RTDB multiplayer mode');
  const roomsMatch = indexText.match(/src=["']([^"']*18-online-rooms\.js\?v=[^"']+)["']/)
    || indexText.match(/["']([^"']*18-online-rooms\.js\?v=[^"']+)["']/);
  assert.ok(roomsMatch, 'live index must reference versioned 18-online-rooms.js');
  const roomsPath = roomsMatch[1].replace(/^\.\//, '/');
  const roomsUrl = roomsPath.startsWith('http') ? roomsPath : ORIGIN + (roomsPath.startsWith('/') ? roomsPath : '/' + roomsPath);
  const roomsRes = await fetchText(roomsUrl);
  assert.strictEqual(roomsRes.status, 200, `${roomsUrl} returned ${roomsRes.status}`);
  const roomsText = roomsRes.body;
  assert.match(roomsText, /function shouldApplyServerStateDirectly\(actionType, payload\)[\s\S]*payload\.postState[\s\S]*payload\.stateHash/, 'live online rooms script must include strict direct server-state apply guard');
  assert.match(roomsText, /Strict Fly authority action is missing canonical server state; skipping local replay[\s\S]*resyncRejectedOnlineAction[\s\S]*return;/, 'live online rooms script must quarantine strict actions without postState');
  assert.match(roomsText, /window\.fateAuthorityRenderReport\s*=\s*function\(\)/, 'live online rooms script must expose authority render diagnostics');

  console.log(JSON.stringify({
    ok:true,
    origin:ORIGIN,
    reducerMode:health.reducerMode,
    firebaseRtdbDisabled:health.firebaseRtdbDisabled,
    roomsScript:roomsUrl
  }, null, 2));
}

main().catch(err=>{
  console.error(err && err.stack || err);
  process.exit(1);
});
