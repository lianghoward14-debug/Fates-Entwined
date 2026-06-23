#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');
const {canonicalStateHash} = require('./fate-authority-reducer');

const PORT = Number(process.env.FATE_TWO_CLIENT_PLACEMENT_SMOKE_PORT || 8813);
const HOST = '127.0.0.1';
const ROOT = path.resolve(__dirname, '..');
const HEALTH_URL = `http://${HOST}:${PORT}/health`;

function delay(ms){ return new Promise(resolve=>setTimeout(resolve, ms)); }

function writeSmokeCardData(){
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fate-authority-cards-'));
  const file = path.join(dir, 'cards.js');
  const cards = Array.from({length:14}, (_, index)=>({
    id:String(101 + index),
    name:`Smoke Plain Character ${index + 1}`,
    type:'Character',
    fate:3 + (index % 3),
    cost:0,
    rarity:'square',
    effect:'',
    aff:'',
    img:'',
    set:'smoke'
  }));
  fs.writeFileSync(file, 'const CARDS = ' + JSON.stringify(cards, null, 2) + ';\n');
  return file;
}

function smokeDeck(){
  const ids = Array.from({length:14}, (_, index)=>String(101 + index));
  const deck = [];
  ids.forEach(id=>{
    for(let i = 0; i < 3; i += 1) deck.push(id);
  });
  return deck.slice(0, 40);
}

function assertClientDirectApplyContract(){
  const roomsText = fs.readFileSync(path.join(ROOT, 'src', 'scripts', '18-online-rooms.js'), 'utf8');
  assert.match(roomsText, /function shouldApplyServerStateDirectly\(actionType, payload\)/);
  assert.match(roomsText, /if\(shouldApplyServerStateDirectly\(type, payload\)\)\{[\s\S]*?applyAuthoritativePostState\(action,[\s\S]*?return;/);
  assert.match(roomsText, /Strict Fly authority action is missing canonical server state; skipping local replay/);
  assert.match(roomsText, /window\.fateAuthorityRenderReport/);
  assert.match(roomsText, /renderedBoardMatchesCanonical[\s\S]*renderMismatchReason/);
  assert.match(roomsText, /rendererAvailable[\s\S]*rendererOwnsBoard[\s\S]*renderSnapshotBoardCount[\s\S]*domBoardCount/);
  const directApplyIndex = roomsText.indexOf('if(shouldApplyServerStateDirectly(type, payload))');
  const strictQuarantineIndex = roomsText.indexOf('Strict Fly authority action is missing canonical server state; skipping local replay');
  const legacyReplayIndex = roomsText.indexOf('await withRemoteAction(async ()=>');
  assert(directApplyIndex >= 0, 'strict direct-apply branch must exist');
  assert(strictQuarantineIndex > directApplyIndex, 'strict missing-postState quarantine must follow direct apply');
  assert(legacyReplayIndex > strictQuarantineIndex, 'strict quarantine must happen before legacy remote replay');
}

async function waitForHealth(){
  let lastError = null;
  for(let i = 0; i < 60; i += 1){
    try{
      const res = await fetch(HEALTH_URL);
      if(res.ok) return await res.json();
    }catch(err){
      lastError = err;
    }
    await delay(100);
  }
  throw new Error(`authority health check timed out${lastError ? ': ' + lastError.message : ''}`);
}

async function postJson(pathname, body){
  const res = await fetch(`http://${HOST}:${PORT}${pathname}`, {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(body || {})
  });
  const text = await res.text();
  let json = null;
  try{ json = text ? JSON.parse(text) : null; }catch(e){}
  if(!res.ok || json?.ok === false){
    throw new Error(`POST ${pathname} failed ${res.status}: ${json?.error || text.slice(0, 240)}`);
  }
  return json;
}

function waitForMessage(client, predicate, label, timeoutMs = 4000){
  const existing = client.messages.find(predicate);
  if(existing) return Promise.resolve(existing);
  return new Promise((resolve, reject)=>{
    const timer = setTimeout(()=>{
      cleanup();
      reject(new Error(`timed out waiting for ${label}`));
    }, timeoutMs);
    function onMessage(message){
      if(!predicate(message)) return;
      cleanup();
      resolve(message);
    }
    function cleanup(){
      clearTimeout(timer);
      client.listeners.delete(onMessage);
    }
    client.listeners.add(onMessage);
  });
}

function applyDirectServerState(client, msg){
  const payload = msg?.action?.payload || {};
  if(!payload.postState || !payload.stateHash) return;
  client.canonicalState = payload.postState;
  client.stateHash = String(payload.stateHash || msg.serverStateHash || '');
  client.seq = Math.max(client.seq || 0, Number(msg.action.seq || 0) || 0);
}

function createClient(uid, roomCode){
  const ws = new WebSocket(`ws://${HOST}:${PORT}`);
  const client = {uid, ws, roomCode, messages:[], listeners:new Set(), canonicalState:null, stateHash:'', seq:0};
  ws.addEventListener('message', event=>{
    const raw = typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8');
    const msg = JSON.parse(raw);
    client.messages.push(msg);
    if(msg.kind === 'accepted') applyDirectServerState(client, msg);
    client.listeners.forEach(listener=>listener(msg));
  });
  return new Promise((resolve, reject)=>{
    const timer = setTimeout(()=>reject(new Error(`open timeout for ${uid}`)), 3000);
    ws.addEventListener('open', async ()=>{
      clearTimeout(timer);
      ws.send(JSON.stringify({
        kind:'hello',
        roomCode,
        uid,
        idToken:'',
        lastSeq:0,
        stateHash:'',
        room:{hostUid:'host', guestUid:'guest', currentTurnUid:'host', lastActionSeq:0, playerOrder:{0:'host', 1:'guest'}}
      }));
      try{
        await waitForMessage(client, msg=>msg.kind === 'hello-ok', `${uid} hello-ok`);
        resolve(client);
      }catch(err){
        reject(err);
      }
    }, {once:true});
    ws.addEventListener('error', ()=>reject(new Error(`websocket error for ${uid}`)), {once:true});
  });
}

function sendIntent(client, type, payload){
  const requestId = `${client.uid}:${type}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  client.ws.send(JSON.stringify({
    kind:'intent',
    requestId,
    roomCode:client.roomCode,
    type,
    payload:Object.assign({}, payload, {clientActionId:payload.clientActionId || requestId}),
    clientActionId:payload.clientActionId || requestId
  }));
  return requestId;
}

async function expectAcceptedOnBoth(host, guest, type, requestId, label){
  const hostMsg = await waitForMessage(host, msg=>msg.kind === 'accepted' && msg.requestId === requestId && msg.action?.type === type, `${label} host accepted`);
  const seq = Number(hostMsg.action.seq || 0) || 0;
  const guestMsg = await waitForMessage(guest, msg=>msg.kind === 'accepted' && Number(msg.action?.seq || 0) === seq && msg.action?.type === type, `${label} guest observed`);
  assert(hostMsg.action.payload.postState, `${label} host accepted missing postState`);
  assert(guestMsg.action.payload.postState, `${label} guest accepted missing postState`);
  assert.strictEqual(host.stateHash, guest.stateHash, `${label} state hash mismatch`);
  assert.strictEqual(canonicalStateHash(host.canonicalState), host.stateHash, `${label} host hash is not canonical`);
  assert.strictEqual(canonicalStateHash(guest.canonicalState), guest.stateHash, `${label} guest hash is not canonical`);
  return hostMsg;
}

function boardCardAt(client, z, r, c){
  return client.canonicalState?.board?.[z]?.[r]?.[c] || null;
}

function firstHandCardPayload(client, playerIndex){
  const hand = client.canonicalState?.players?.[playerIndex]?.hand || [];
  assert(hand.length > 0, `player ${playerIndex} needs a hand card`);
  const card = hand[0];
  return {index:0, iid:card.iid || '', id:String(card.id || '')};
}

async function stopChild(child){
  return new Promise(resolve=>{
    if(!child || child.killed || child.exitCode !== null) return resolve();
    const timer = setTimeout(resolve, 1200);
    child.once('exit', ()=>{ clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}

async function main(){
  if(typeof WebSocket === 'undefined') throw new Error('This smoke requires a Node runtime with global WebSocket');
  assertClientDirectApplyContract();
  const cardDataPath = writeSmokeCardData();
  const child = spawn(process.execPath, ['server/fate-ws-authority.js'], {
    cwd:ROOT,
    env:Object.assign({}, process.env, {
      PORT:String(PORT),
      FATE_CARD_DATA_PATH:cardDataPath,
      FATE_WS_REQUIRE_TOKEN:'0',
      FATE_WS_DURABLE_WRITES:'off',
      FATE_WS_REQUIRE_DURABLE_WRITES:'0',
      FATE_WS_DISABLE_FIREBASE_RTDB:'1',
      FATE_RTDB_DISABLED:'1',
      FATE_WS_STATE_GATE:'1',
      FATE_WS_REDUCER_MODE:'strict',
      FATE_WS_FLY_STORE:'0',
      FATE_WS_PING_MS:'60000'
    }),
    stdio:['ignore', 'pipe', 'pipe']
  });
  let serverLog = '';
  child.stdout.on('data', chunk=>{ serverLog += chunk.toString(); });
  child.stderr.on('data', chunk=>{ serverLog += chunk.toString(); });
  const clients = [];
  try{
    const health = await waitForHealth();
    assert.strictEqual(health.reducerMode, 'strict');
    assert.strictEqual(health.firebaseRtdbDisabled, true);

    const deck = smokeDeck();
    const created = await postJson('/api/rooms', {
      uid:'host',
      mode:'freeplay',
      profile:{displayName:'Host'},
      deckChoice:{name:'Host Smoke Deck', deckIds:deck, ready:true}
    });
    const roomCode = created.room.code;
    await postJson(`/api/rooms/${roomCode}/join`, {
      uid:'guest',
      profile:{displayName:'Guest'},
      deckChoice:{name:'Guest Smoke Deck', deckIds:deck, ready:true}
    });

    const host = await createClient('host', roomCode);
    const guest = await createClient('guest', roomCode);
    clients.push(host, guest);

    const started = await postJson(`/api/rooms/${roomCode}/start`, {uid:'host', seed:'two-client-placement-smoke', song:'smoke'});
    const startSeq = Number(started.accepted.action.seq || 0) || 0;
    await waitForMessage(host, msg=>msg.kind === 'accepted' && Number(msg.action?.seq || 0) === startSeq && msg.action?.type === 'MATCH_START', 'host match start');
    await waitForMessage(guest, msg=>msg.kind === 'accepted' && Number(msg.action?.seq || 0) === startSeq && msg.action?.type === 'MATCH_START', 'guest match start');
    assert.strictEqual(host.stateHash, guest.stateHash, 'match start state hash mismatch');
    assert.strictEqual(host.canonicalState?.phase, 'draw');

    const chooseId = sendIntent(host, 'CHOOSE_TURN', {
      playerIndex:0,
      goFirst:true,
      baseStateHash:host.stateHash
    });
    await expectAcceptedOnBoth(host, guest, 'CHOOSE_TURN', chooseId, 'choose turn');
    assert.strictEqual(host.canonicalState.phase, 'main');
    assert.strictEqual(host.canonicalState.currentPlayer, 0);

    const hostSelected = firstHandCardPayload(host, 0);
    const hostPlaceId = sendIntent(host, 'PLACE_CARD', {
      playerIndex:0,
      turn:host.canonicalState.turn,
      z:0,
      r:2,
      c:0,
      placing:true,
      selectedHand:hostSelected,
      baseStateHash:host.stateHash
    });
    await expectAcceptedOnBoth(host, guest, 'PLACE_CARD', hostPlaceId, 'host placement');
    assert(boardCardAt(guest, 0, 2, 0), 'guest did not receive host board card');
    assert.strictEqual(boardCardAt(guest, 0, 2, 0).owner, 0);

    const endId = sendIntent(host, 'END_TURN', {
      playerIndex:0,
      turn:host.canonicalState.turn,
      baseStateHash:host.stateHash
    });
    await expectAcceptedOnBoth(host, guest, 'END_TURN', endId, 'host end turn');
    assert.strictEqual(host.canonicalState.currentPlayer, 1);

    const guestSelected = firstHandCardPayload(guest, 1);
    const guestPlaceId = sendIntent(guest, 'PLACE_CARD', {
      playerIndex:1,
      turn:guest.canonicalState.turn,
      z:0,
      r:0,
      c:0,
      placing:true,
      selectedHand:guestSelected,
      baseStateHash:guest.stateHash
    });
    await expectAcceptedOnBoth(guest, host, 'PLACE_CARD', guestPlaceId, 'guest placement');
    assert(boardCardAt(host, 0, 2, 0), 'host lost its own placed card');
    assert(boardCardAt(host, 0, 0, 0), 'host did not receive guest board card');
    assert.strictEqual(boardCardAt(host, 0, 0, 0).owner, 1);
    assert.strictEqual(host.stateHash, guest.stateHash, 'final state hash mismatch');

    console.log(JSON.stringify({
      ok:true,
      roomCode,
      seq:host.seq,
      stateHash:host.stateHash,
      placements:[
        {playerIndex:0, z:0, r:2, c:0, cardId:boardCardAt(host, 0, 2, 0)?.id || ''},
        {playerIndex:1, z:0, r:0, c:0, cardId:boardCardAt(host, 0, 0, 0)?.id || ''}
      ],
      firebaseGameplayFallbackUsed:false
    }, null, 2));
  }catch(err){
    if(serverLog) console.error(serverLog);
    throw err;
  }finally{
    clients.forEach(client=>{ try{ client.ws.close(); }catch(e){} });
    await stopChild(child);
  }
}

main().catch(err=>{
  console.error(err);
  process.exit(1);
});
