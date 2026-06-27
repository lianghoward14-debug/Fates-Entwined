#!/usr/bin/env node
'use strict';

const {spawn} = require('child_process');
const {canonicalStateHash} = require('./fate-authority-reducer');
const {getCardCatalog} = require('./fate-card-catalog');

const PORT = Number(process.env.FATE_WS_CLIENT_RESOLVED_SMOKE_PORT || 8799);
const HOST = '127.0.0.1';
const WS_URL = `ws://${HOST}:${PORT}`;
const HEALTH_URL = `http://${HOST}:${PORT}/health`;
const HOST_UID = 'client-resolved-host';
const GUEST_UID = 'client-resolved-guest';

function sleep(ms){
  return new Promise(resolve=>setTimeout(resolve, ms));
}

function validDeck(){
  return getCardCatalog().cards
    .filter(card=>card && !card.retired && !card.temporarilyDisabled)
    .slice(0, 40)
    .map(card=>card.id);
}

async function waitForHealth(timeoutMs = 8000){
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while(Date.now() < deadline){
    try{
      const res = await fetch(HEALTH_URL);
      if(res.ok) return await res.json();
    }catch(err){
      lastError = err;
    }
    await sleep(100);
  }
  throw new Error(`client-resolved authority health timed out${lastError ? ': ' + lastError.message : ''}`);
}

async function apiRequest(method, path, body){
  const res = await fetch(`http://${HOST}:${PORT}${path}`, {
    method,
    headers:{'content-type':'application/json'},
    body:body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try{ json = text ? JSON.parse(text) : null; }catch(e){}
  if(!res.ok || json?.ok === false){
    throw new Error(`${method} ${path} failed ${res.status}: ${json?.error || text.slice(0, 200)}`);
  }
  return json;
}

function waitForMessage(client, predicate, label, timeoutMs = 3500){
  const existing = client.messages.find(predicate);
  if(existing) return Promise.resolve(existing);
  return new Promise((resolve, reject)=>{
    const timeout = setTimeout(()=>{
      cleanup();
      reject(new Error(`timed out waiting for ${label}`));
    }, timeoutMs);
    function onMessage(message){
      if(!predicate(message)) return;
      cleanup();
      resolve(message);
    }
    function cleanup(){
      clearTimeout(timeout);
      client.listeners.delete(onMessage);
    }
    client.listeners.add(onMessage);
  });
}

function createClient(uid, room, stateHash){
  const ws = new WebSocket(WS_URL);
  const client = {uid, ws, messages:[], listeners:new Set()};
  ws.addEventListener('message', event=>{
    const raw = typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8');
    const message = JSON.parse(raw);
    client.messages.push(message);
    client.listeners.forEach(listener=>listener(message));
  });
  return new Promise((resolve, reject)=>{
    const timer = setTimeout(()=>reject(new Error(`open timeout for ${uid}`)), 3500);
    ws.addEventListener('open', async ()=>{
      clearTimeout(timer);
      ws.send(JSON.stringify({
        kind:'hello',
        roomCode:room.code,
        uid,
        idToken:'',
        lastSeq:room.lastActionSeq || 1,
        stateHash,
        room:{
          hostUid:HOST_UID,
          guestUid:GUEST_UID,
          currentTurnUid:room.currentTurnUid,
          lastActionSeq:room.lastActionSeq || 1,
          playerOrder:room.playerOrder
        }
      }));
      try{
        const hello = await waitForMessage(client, msg=>msg.kind === 'hello-ok', `${uid} hello-ok`);
        if(hello.gameplayAuthority !== 'client-resolved'){
          throw new Error(`expected hello gameplayAuthority client-resolved, got ${JSON.stringify(hello)}`);
        }
        resolve(client);
      }catch(err){
        reject(err);
      }
    }, {once:true});
    ws.addEventListener('error', ()=>reject(new Error(`websocket error for ${uid}`)), {once:true});
  });
}

function sendIntent(client, roomCode, type, payload){
  const requestId = `${client.uid}:${type}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  client.ws.send(JSON.stringify({
    kind:'intent',
    requestId,
    roomCode,
    type,
    payload,
    clientActionId:payload.clientActionId || requestId
  }));
  return requestId;
}

async function expectAccepted(client, requestId, type){
  const msg = await waitForMessage(
    client,
    item=>item.kind === 'accepted' && item.requestId === requestId,
    `${type} accepted`
  );
  if(msg.action?.type !== type) throw new Error(`expected ${type}, got ${msg.action?.type}`);
  return msg;
}

async function expectBroadcast(client, seq, type){
  const msg = await waitForMessage(
    client,
    item=>item.kind === 'accepted' && Number(item.action?.seq) === Number(seq),
    `${type} broadcast seq ${seq}`
  );
  if(msg.action?.type !== type) throw new Error(`expected broadcast ${type}, got ${msg.action?.type}`);
  return msg;
}

function clone(value){
  return JSON.parse(JSON.stringify(value));
}

function ensureBoardCell(state, z, r, c){
  if(!Array.isArray(state.board)) state.board = [];
  while(state.board.length <= z) state.board.push([]);
  while(!Array.isArray(state.board[z]) || state.board[z].length <= r){
    if(!Array.isArray(state.board[z])) state.board[z] = [];
    state.board[z].push([]);
  }
  while(!Array.isArray(state.board[z][r]) || state.board[z][r].length <= c){
    if(!Array.isArray(state.board[z][r])) state.board[z][r] = [];
    state.board[z][r].push(null);
  }
}

function commitPayload(state, playerIndex, actionKind, baseStateHash, label, extra = {}){
  const postState = clone(state);
  const stateHash = canonicalStateHash(postState);
  return Object.assign({
    playerIndex,
    turn:Number(postState.turn || 0) || 1,
    actionKind,
    clientActionId:`client-resolved:${label}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    baseStateHash,
    postState,
    stateHash,
    summary:{source:label}
  }, extra);
}

async function run(){
  const server = spawn(process.execPath, ['server/fate-ws-authority.js'], {
    cwd:process.cwd(),
    env:Object.assign({}, process.env, {
      FATE_WS_HOST:HOST,
      FATE_WS_PORT:String(PORT),
      FATE_WS_REQUIRE_TOKEN:'0',
      FATE_WS_DURABLE_WRITES:'off',
      FATE_WS_REQUIRE_DURABLE_WRITES:'0',
      FATE_WS_STATE_GATE:'1',
      FATE_WS_REDUCER_MODE:'strict',
      FATE_WS_GAMEPLAY_AUTHORITY:'client-resolved',
      FATE_WS_DISABLE_FIREBASE_RTDB:'1',
      FATE_RTDB_DISABLED:'1',
      FATE_WS_DISCONNECT_TIMEOUT_MS:'0',
      FATE_WS_PING_MS:'60000'
    }),
    stdio:['ignore', 'pipe', 'pipe']
  });

  let serverLog = '';
  server.stdout.on('data', chunk=>{ serverLog += chunk.toString(); });
  server.stderr.on('data', chunk=>{ serverLog += chunk.toString(); });
  const clients = [];

  try{
    const health = await waitForHealth();
    if(health.gameplayAuthority !== 'client-resolved' || health.clientResolvedGameplay !== true){
      throw new Error(`expected client-resolved health, got ${JSON.stringify(health)}`);
    }

    const deck = validDeck();
    const created = await apiRequest('POST', '/api/rooms', {
      uid:HOST_UID,
      mode:'freeplay',
      profile:{username:'Client Resolved Host'},
      deckChoice:{deckIds:deck, name:'Host Client Resolved Deck', ready:true}
    });
    const roomCode = created.room.code;
    await apiRequest('POST', `/api/rooms/${roomCode}/join`, {
      uid:GUEST_UID,
      profile:{username:'Client Resolved Guest'},
      deckChoice:{deckIds:deck, name:'Guest Client Resolved Deck', ready:true}
    });
    await apiRequest('POST', `/api/rooms/${roomCode}/start`, {
      uid:HOST_UID,
      seed:'client-resolved-ws-smoke'
    });

    const resume = await apiRequest('GET', `/api/rooms/${roomCode}/resume?after=0&limit=20`);
    const startEvent = (resume.events || []).find(item=>String(item.action?.type || '') === 'MATCH_START');
    const startPayload = startEvent?.action?.payload || {};
    if(!startPayload.postState || !startPayload.stateHash){
      throw new Error(`MATCH_START did not include canonical state: ${JSON.stringify(resume)}`);
    }
    let room = (await apiRequest('GET', `/api/rooms/${roomCode}`)).room;
    const host = await createClient(HOST_UID, room, startPayload.stateHash);
    const guest = await createClient(GUEST_UID, room, startPayload.stateHash);
    clients.push(host, guest);

    let canonicalState = clone(startPayload.postState);
    let canonicalHash = String(startPayload.stateHash || canonicalStateHash(canonicalState));
    let activeIndex = Number(canonicalState.currentPlayer);
    if(!Number.isInteger(activeIndex) || activeIndex < 0 || activeIndex > 1) activeIndex = 0;
    let activeClient = activeIndex === 0 ? host : guest;
    let passiveClient = activeIndex === 0 ? guest : host;

    const placementState = clone(canonicalState);
    ensureBoardCell(placementState, 0, activeIndex === 0 ? 2 : 0, 1);
    placementState.board[0][activeIndex === 0 ? 2 : 0][1] = {
      id:'client-resolved-card',
      iid:'client-resolved-board-card',
      name:'Client Resolved Smoke Card',
      owner:activeIndex,
      type:'Initiator',
      currentFate:3,
      fate:3
    };
    placementState.smokeClientResolvedPlacement = true;
    const placeRequest = sendIntent(activeClient, roomCode, 'ACTION_RESULT', commitPayload(
      placementState,
      activeIndex,
      'BOARD_ACTION',
      canonicalHash,
      'placement',
      {summary:{cardId:'client-resolved-card', cardName:'Client Resolved Smoke Card'}}
    ));
    const placeAccepted = await expectAccepted(activeClient, placeRequest, 'ACTION_RESULT');
    await expectBroadcast(passiveClient, placeAccepted.action.seq, 'ACTION_RESULT');
    if(placeAccepted.action.payload.stateHash !== canonicalStateHash(placementState)){
      throw new Error('placement accepted with unexpected stateHash');
    }

    canonicalState = placementState;
    canonicalHash = placeAccepted.action.payload.stateHash;
    const nextIndex = activeIndex === 0 ? 1 : 0;
    const turnState = clone(canonicalState);
    turnState.currentPlayer = nextIndex;
    turnState.turn = Math.max(Number(turnState.turn || 0) + 1, 1);
    const endRequest = sendIntent(activeClient, roomCode, 'ACTION_RESULT', commitPayload(
      turnState,
      activeIndex,
      'END_TURN',
      canonicalHash,
      'end-turn'
    ));
    const endAccepted = await expectAccepted(activeClient, endRequest, 'ACTION_RESULT');
    await expectBroadcast(passiveClient, endAccepted.action.seq, 'ACTION_RESULT');
    const expectedTurnUid = nextIndex === 0 ? HOST_UID : GUEST_UID;
    if(endAccepted.roomPatch?.currentTurnUid !== expectedTurnUid){
      throw new Error(`expected ACTION_RESULT end turn to move room turn to ${expectedTurnUid}, got ${JSON.stringify(endAccepted.roomPatch)}`);
    }

    canonicalState = turnState;
    canonicalHash = endAccepted.action.payload.stateHash;
    activeIndex = nextIndex;
    activeClient = activeIndex === 0 ? host : guest;
    passiveClient = activeIndex === 0 ? guest : host;

    const followupState = clone(canonicalState);
    followupState.smokeGuestCanActAfterTurnTransfer = true;
    const followupRequest = sendIntent(activeClient, roomCode, 'ACTION_RESULT', commitPayload(
      followupState,
      activeIndex,
      'BOARD_ACTION',
      canonicalHash,
      'next-player-action'
    ));
    const followupAccepted = await expectAccepted(activeClient, followupRequest, 'ACTION_RESULT');
    await expectBroadcast(passiveClient, followupAccepted.action.seq, 'ACTION_RESULT');

    room = (await apiRequest('GET', `/api/rooms/${roomCode}`)).room;
    if(room.canonicalHash !== followupAccepted.action.payload.stateHash){
      throw new Error(`room canonicalHash did not update to latest ACTION_RESULT: ${JSON.stringify(room)}`);
    }

    console.log(JSON.stringify({
      ok:true,
      authMode:'fake-local',
      gameplayAuthority:health.gameplayAuthority,
      url:WS_URL,
      room:roomCode,
      accepted:[
        `client-resolved placement seq ${placeAccepted.action.seq}`,
        `client-resolved END_TURN seq ${endAccepted.action.seq}`,
        `next player ACTION_RESULT seq ${followupAccepted.action.seq}`
      ],
      finalCurrentTurnUid:room.currentTurnUid,
      finalCanonicalHash:room.canonicalHash
    }, null, 2));
  }catch(err){
    console.error(err && err.stack || err);
    console.error('--- server log ---');
    console.error(serverLog.slice(-4000));
    process.exitCode = 1;
  }finally{
    clients.forEach(client=>{ try{ client.ws.close(); }catch(e){} });
    server.kill();
  }
}

run();
