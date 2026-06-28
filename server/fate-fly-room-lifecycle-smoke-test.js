#!/usr/bin/env node
'use strict';

const {getCardCatalog} = require('./fate-card-catalog');
const {spawn} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SPAWN_LOCAL = process.env.FATE_FLY_SMOKE_SPAWN_LOCAL === '1';
const LOCAL_PORT = Number(process.env.FATE_FLY_SMOKE_LOCAL_PORT || 8798);
const LOCAL_ORIGIN = `http://127.0.0.1:${LOCAL_PORT}`;
const ORIGIN = String(process.env.FATE_FLY_SMOKE_ORIGIN || (SPAWN_LOCAL ? LOCAL_ORIGIN : 'https://fates-entwined-main.fly.dev')).replace(/\/+$/, '');
const WS_URL = String(process.env.FATE_FLY_SMOKE_WS_URL || ORIGIN.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:'));
const FIREBASE_API_KEY = process.env.FATE_WS_SMOKE_API_KEY || 'AIzaSyByhcqY0Y27hUkvcAtO3mflRwnQCWhv4Yc';
const HOST_TOKEN = process.env.FATE_WS_SMOKE_HOST_ID_TOKEN || '';
const GUEST_TOKEN = process.env.FATE_WS_SMOKE_GUEST_ID_TOKEN || '';
const ALLOW_FAKE_TOKENS = process.env.FATE_WS_SMOKE_ALLOW_FAKE === '1' || SPAWN_LOCAL;
const USE_ANON_AUTH = !ALLOW_FAKE_TOKENS && (process.env.FATE_WS_SMOKE_USE_ANON === '1' || process.argv.includes('--anon') || (!HOST_TOKEN && !GUEST_TOKEN));
const REQUEST_TIMEOUT_MS = Number(process.env.FATE_FLY_SMOKE_TIMEOUT_MS || 45000);
const SUPPORTED_SUPPORTER_IDS = new Set(['05','09','16','18','20','24','25','26','28','31','32','33','37','42','44','47','49','50','52','53','54','58','59','60','62','63','64','65','68','69','70','71','72','73','74','75','76','78','79','80','91','94']);
const SMOKE_PLAIN_SUPPORTER_IDS = new Set([
  '09','18','20','24','26','28','32','33','44','47','49','53','59','63','64','65','71','73','76','78','79','91'
]);
const CATALOG_BY_ID = new Map(getCardCatalog().cards.map(card => [String(card.id || ''), card]));

function base64urlDecode(input) {
  const s = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(s + '='.repeat((4 - (s.length % 4)) % 4), 'base64');
}

function decodeToken(token, label) {
  if (!token) throw new Error(`${label} token missing`);
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new Error(`${label} token is not a JWT`);
  const payload = JSON.parse(base64urlDecode(parts[1]).toString('utf8'));
  if (!payload.sub) throw new Error(`${label} token missing uid`);
  if (payload.exp && Number(payload.exp) * 1000 <= Date.now()) throw new Error(`${label} token is expired`);
  return payload;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timed out fetching ${url}`)), timeoutMs);
  try {
    return await fetch(url, Object.assign({}, options, {signal:controller.signal}));
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(path, options = {}) {
  const url = /^https?:\/\//i.test(path) ? path : ORIGIN + path;
  const res = await fetchWithTimeout(url, {
    method:options.method || 'GET',
    headers:Object.assign({'content-type':'application/json'}, options.idToken ? {authorization:`Bearer ${options.idToken}`} : null, options.headers || null),
    body:options.body === undefined ? undefined : JSON.stringify(options.body)
  }, options.timeoutMs || REQUEST_TIMEOUT_MS);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) {}
  if(!res.ok || json?.ok === false){
    throw new Error(`${options.method || 'GET'} ${url} failed ${res.status}: ${json?.error || text.slice(0, 400)}`);
  }
  return json;
}

async function identityToolkitRequest(endpoint, body) {
  const res = await fetchWithTimeout(`https://identitytoolkit.googleapis.com/v1/${endpoint}?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(body || {})
  }, REQUEST_TIMEOUT_MS);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) {}
  if(!res.ok || json?.error){
    throw new Error(`Firebase Auth ${endpoint} failed: ${json?.error?.message || text.slice(0, 240) || res.status}`);
  }
  return json || {};
}

async function createAnonymousAuthUser(label) {
  const json = await identityToolkitRequest('accounts:signUp', {returnSecureToken:true});
  if(!json.idToken || !json.localId) throw new Error(`anonymous ${label} auth response missing idToken/localId`);
  return {label, uid:String(json.localId), idToken:String(json.idToken)};
}

async function authUsers() {
  if(ALLOW_FAKE_TOKENS){
    return {
      host:{label:'host', uid:'fly-smoke-host', idToken:''},
      guest:{label:'guest', uid:'fly-smoke-guest', idToken:''},
      mode:'fake-local'
    };
  }
  if(USE_ANON_AUTH){
    const host = await createAnonymousAuthUser('host');
    const guest = await createAnonymousAuthUser('guest');
    return {host, guest, mode:'temporary-anonymous-firebase-users'};
  }
  const hostPayload = decodeToken(HOST_TOKEN, 'host');
  const guestPayload = decodeToken(GUEST_TOKEN, 'guest');
  return {
    host:{label:'host', uid:String(hostPayload.sub), idToken:HOST_TOKEN},
    guest:{label:'guest', uid:String(guestPayload.sub), idToken:GUEST_TOKEN},
    mode:'provided-id-tokens'
  };
}

async function startLocalAuthority() {
  if(!SPAWN_LOCAL) return null;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fate-fly-room-smoke-'));
  const child = spawn(process.execPath, ['server/fate-ws-authority.js'], {
    cwd:path.resolve(__dirname, '..'),
    env:Object.assign({}, process.env, {
      FATE_WS_HOST:'127.0.0.1',
      FATE_WS_PORT:String(LOCAL_PORT),
      FATE_WS_REQUIRE_TOKEN:'0',
      FATE_WS_DURABLE_WRITES:'off',
      FATE_WS_REQUIRE_DURABLE_WRITES:'0',
      FATE_WS_DISABLE_FIREBASE_RTDB:'1',
      FATE_RTDB_DISABLED:'1',
      FATE_WS_STATE_GATE:'1',
      FATE_WS_REDUCER_MODE:'strict',
      FATE_WS_DATA_DIR:dataDir,
      FATE_WS_DISCONNECT_TIMEOUT_MS:'60000',
      FATE_WS_PING_MS:'60000'
    }),
    stdio:['ignore', 'pipe', 'pipe']
  });
  let log = '';
  child.stdout.on('data', chunk => { log += chunk.toString(); });
  child.stderr.on('data', chunk => { log += chunk.toString(); });
  const started = Date.now();
  let lastErr = null;
  while(Date.now() - started < 10000){
    if(child.exitCode !== null) throw new Error(`local authority exited early with code ${child.exitCode}: ${log.slice(-2000)}`);
    try{
      const res = await fetchWithTimeout(`${LOCAL_ORIGIN}/health`, {}, 1000);
      if(res.ok) return {child, dataDir, log:()=>log};
    }catch(err){ lastErr = err; }
    await sleep(100);
  }
  try{ child.kill(); }catch(_){}
  throw new Error(`local authority did not become healthy${lastErr ? ': ' + lastErr.message : ''}\n${log.slice(-2000)}`);
}

function validDeck() {
  const safeSupporters = [...SMOKE_PLAIN_SUPPORTER_IDS].filter(id => CATALOG_BY_ID.has(id));
  const deck = [];
  for(let pass = 0; deck.length < 40 && pass < 2; pass += 1){
    for(const id of safeSupporters){
      if(deck.length >= 40) break;
      deck.push(id);
    }
  }
  return deck;
}

function isPlainSupporter(card) {
  if(!card || String(card.type || '') !== 'Supporter') return false;
  const id = String(card.id || '');
  if(!SMOKE_PLAIN_SUPPORTER_IDS.has(id)) return false;
  const meta = CATALOG_BY_ID.get(id) || card;
  return !(
    meta.contestedOnly || card.contestedOnly ||
    meta.whenSet || meta.onSet || meta.activated || meta.effectKey || meta.requiresTarget ||
    card.whenSet || card.onSet || card.activated || card.effectKey || card.requiresTarget
  );
}

function profile(username) {
  return {username, avatarUrl:'', characterTitle:'Footman', challengerElo:600, challengerWins:0, challengerLosses:0};
}

function deckChoice(name) {
  return {ready:true, name, deckIds:validDeck()};
}

function waitForMessage(client, predicate, label, timeoutMs = 12000) {
  const existing = client.messages.find(predicate);
  if(existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for ${label}`));
    }, timeoutMs);
    function onMessage(message) {
      if(!predicate(message)) return;
      cleanup();
      resolve(message);
    }
    function cleanup() {
      clearTimeout(timer);
      client.listeners.delete(onMessage);
    }
    client.listeners.add(onMessage);
  });
}

function connectClient(user, room) {
  const ws = new WebSocket(WS_URL);
  const client = {user, ws, messages:[], listeners:new Set()};
  ws.addEventListener('message', event => {
    const raw = typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8');
    const msg = JSON.parse(raw);
    client.messages.push(msg);
    client.listeners.forEach(listener => listener(msg));
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`open timeout for ${user.label}`)), REQUEST_TIMEOUT_MS);
    ws.addEventListener('open', async () => {
      clearTimeout(timer);
      ws.send(JSON.stringify({
        kind:'hello',
        roomCode:room.roomCode || room.code,
        uid:user.uid,
        idToken:user.idToken,
        lastSeq:Number(room.lastActionSeq || room.lastSeq || 1) || 1,
        stateHash:String(room.canonicalHash || room.lastStateHash || room.serverStateHash || ''),
        room:{
          hostUid:room.hostUid,
          guestUid:room.guestUid,
          currentTurnUid:room.currentTurnUid,
          lastActionSeq:Number(room.lastActionSeq || room.lastSeq || 1) || 1,
          playerOrder:room.playerOrder || {0:room.hostUid, 1:room.guestUid}
        }
      }));
      try {
        await waitForMessage(client, msg => msg.kind === 'hello-ok', `${user.label} hello-ok`);
        resolve(client);
      } catch (err) {
        reject(err);
      }
    }, {once:true});
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error(`websocket error for ${user.label}`));
    }, {once:true});
  });
}

function rowOwner(r) {
  if(r === 0) return 1;
  if(r === 1) return -1;
  if(r === 2) return 0;
  return 0;
}

function selectPlacement(state, playerIndex) {
  const hand = state?.players?.[playerIndex]?.hand || [];
  const handIndex = hand.findIndex(isPlainSupporter);
  if(handIndex < 0) throw new Error(`no supported Supporter in player ${playerIndex} hand`);
  const card = hand[handIndex];
  for(let z = 0; z < 3; z += 1){
    for(let r = 0; r < 3; r += 1){
      const owner = rowOwner(r);
      if(owner !== -1 && owner !== playerIndex) continue;
      if(card.contestedOnly && r !== 1) continue;
      for(let c = 0; c < 3; c += 1){
        const cell = state.board?.[z]?.[r]?.[c];
        if(cell === null || cell === undefined){
          return {z, r, c, card, selectedHand:{index:handIndex, iid:card.iid || '', id:card.id || ''}};
        }
      }
    }
  }
  throw new Error(`no legal-looking empty placement cell for player ${playerIndex}`);
}

function sendIntent(client, roomCode, type, payload) {
  const requestId = `${client.user.label}:${type}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  client.ws.send(JSON.stringify({
    kind:'intent',
    requestId,
    roomCode,
    type,
    payload:Object.assign({}, payload, {clientActionId:payload.clientActionId || requestId})
  }));
  return requestId;
}

async function expectAccepted(client, requestId, type) {
  const msg = await waitForMessage(
    client,
    item => (item.kind === 'accepted' || item.kind === 'rejected') && item.requestId === requestId,
    `${type} accepted or rejected`
  );
  if(msg.kind === 'rejected') {
    throw new Error(`${type} rejected: ${msg.reason || msg.error || JSON.stringify(msg).slice(0, 500)}`);
  }
  if(String(msg.action?.type || '').toUpperCase() !== type) throw new Error(`expected ${type}, got ${msg.action?.type}`);
  if(!msg.action?.payload?.postState || !msg.action?.payload?.stateHash){
    throw new Error(`${type} accepted without canonical postState/stateHash`);
  }
  return msg;
}

function cardMatchesPending(card, pending) {
  if(!card) return false;
  if(pending.filterType && String(card.type || '') !== String(pending.filterType)) return false;
  if(pending.filterAff && String(card.aff || '') !== String(pending.filterAff)) return false;
  if(pending.excludeRarity && String(card.rarity || '') === String(pending.excludeRarity)) return false;
  return true;
}

function selectedCardsForPending(state, playerIndex, pending) {
  const player = state?.players?.[playerIndex] || {};
  const count = Math.max(0, Number(pending.minCount || pending.maxCount || 0) || 0);
  if(count <= 0) return [];
  if(String(pending.kind || '') === 'handDiscard' || String(pending.kind || '') === 'handDiscardBoost'){
    const hand = Array.isArray(player.hand) ? player.hand : [];
    return hand.slice(0, count).map((card, index)=>({index, iid:card?.iid || '', id:card?.id || '', name:card?.name || ''}));
  }
  const picked = [];
  const sources = String(pending.source || 'deck').split('+').map(item=>item.trim()).filter(Boolean);
  for(const source of sources){
    const pile = source === 'discard' ? player.discard : player.deck;
    if(!Array.isArray(pile)) continue;
    for(let index = 0; index < pile.length && picked.length < count; index += 1){
      const card = pile[index];
      if(!cardMatchesPending(card, pending)) continue;
      picked.push({source, index, iid:card?.iid || '', id:card?.id || '', name:card?.name || ''});
    }
    if(picked.length >= count) break;
  }
  return picked;
}

async function resolvePendingCardPicks(client, code, playerIndex, state, hash) {
  let currentState = state;
  let currentHash = hash;
  for(let i = 0; i < 5; i += 1){
    const pending = currentState?._serverPendingCardPick || null;
    if(!pending) break;
    const selectedCards = selectedCardsForPending(currentState, playerIndex, pending);
    const requestId = sendIntent(client, code, 'PICK_CARDS_VISUAL', {
      playerIndex,
      promptId:pending.promptId || '',
      selectedCards,
      baseStateHash:currentHash
    });
    const accepted = await expectAccepted(client, requestId, 'PICK_CARDS_VISUAL');
    currentState = accepted.action.payload.postState;
    currentHash = accepted.action.payload.stateHash;
  }
  return {state:currentState, hash:currentHash};
}

async function run() {
  const localAuthority = await startLocalAuthority();
  const users = await authUsers();
  if(users.host.uid === users.guest.uid) throw new Error('host and guest uid must differ');

  const clients = [];
  try {
  const health = await fetchJson('/health', {timeoutMs:60000});
  if(health.reducerMode !== 'strict') throw new Error(`expected strict reducer, got ${health.reducerMode}`);
  if(health.firebaseRtdbDisabled !== true) throw new Error('expected Firebase RTDB gameplay disabled on Fly');

  const created = await fetchJson('/api/rooms', {
    method:'POST',
    idToken:users.host.idToken,
    body:{uid:users.host.uid, mode:'freeplay', profile:profile('Fly Smoke Host'), deckChoice:deckChoice('Fly Smoke Host Deck')}
  });
  const code = String(created.room?.roomCode || created.room?.code || '');
  if(!/^[A-Z0-9]{6}$/.test(code)) throw new Error(`created room has invalid code: ${code}`);

  const joined = await fetchJson(`/api/rooms/${encodeURIComponent(code)}/join`, {
    method:'POST',
    idToken:users.guest.idToken,
    body:{uid:users.guest.uid, profile:profile('Fly Smoke Guest'), deckChoice:deckChoice('Fly Smoke Guest Deck')}
  });
  if(joined.room?.guestUid !== users.guest.uid) throw new Error('guest did not join Fly room');

  const started = await fetchJson(`/api/rooms/${encodeURIComponent(code)}/start`, {
    method:'POST',
    idToken:users.host.idToken,
    body:{uid:users.host.uid, seed:`fly-smoke-${Date.now()}`, song:'board1', mode:'freeplay'}
  });
  if(String(started.accepted?.action?.type || '') !== 'MATCH_START') throw new Error('Fly start did not return MATCH_START');
  const startState = started.accepted?.action?.payload?.postState;
  const startHash = started.accepted?.action?.payload?.stateHash;
  if(!startState || !startHash) throw new Error('Fly MATCH_START missing server postState/stateHash');

  const resume = await fetchJson(`/api/rooms/${encodeURIComponent(code)}/resume?after=0&limit=20&includeState=1`, {
    idToken:users.host.idToken
  });
  if(!resume.events?.some(item => String(item?.action?.type || '').toUpperCase() === 'MATCH_START')){
    throw new Error('resume is missing MATCH_START event');
  }
  let canonicalState = resume.canonicalState || startState;
  let canonicalHash = resume.canonicalHash || resume.serverStateHash || startHash;

  const roomForHello = Object.assign({}, started.room || {}, {
    roomCode:code,
    canonicalHash:resume.canonicalHash || startHash,
    serverStateHash:resume.serverStateHash || startHash
  });
  const hostClient = await connectClient(users.host, roomForHello);
  const guestClient = await connectClient(users.guest, roomForHello);
  clients.push(hostClient, guestClient);
    if(String(canonicalState.phase || '') === 'draw'){
      const coinWinner = Number.isInteger(Number(canonicalState._coinWinner)) ? Number(canonicalState._coinWinner) : Number(canonicalState.currentPlayer || 0);
      const coinClient = coinWinner === 0 ? hostClient : guestClient;
      const waitingClient = coinWinner === 0 ? guestClient : hostClient;
      const chooseRequestId = sendIntent(coinClient, code, 'CHOOSE_TURN', {
        playerIndex:coinWinner,
        goFirst:true,
        baseStateHash:canonicalHash
      });
      const chosen = await expectAccepted(coinClient, chooseRequestId, 'CHOOSE_TURN');
      await waitForMessage(waitingClient, msg => msg.kind === 'accepted' && Number(msg.action?.seq || 0) === Number(chosen.action?.seq || 0), 'observer receives CHOOSE_TURN');
      canonicalState = chosen.action.payload.postState;
      canonicalHash = chosen.action.payload.stateHash;
    }
    if(String(canonicalState.phase || '') !== 'main') throw new Error(`expected main phase after turn choice, got ${canonicalState.phase}`);
    const playerIndex = Number(canonicalState.currentPlayer || 0);
    const currentUid = playerIndex === 0 ? users.host.uid : users.guest.uid;
    const actingLabel = playerIndex === 0 ? 'host' : 'guest';
    const actingClient = playerIndex === 0 ? hostClient : guestClient;
    const placement = selectPlacement(canonicalState, playerIndex);
    const placeRequestId = sendIntent(actingClient, code, 'PLACE_CARD', {
      playerIndex,
      turn:canonicalState.turn,
      z:placement.z,
      r:placement.r,
      c:placement.c,
      placing:true,
      selectedHand:placement.selectedHand,
      baseStateHash:canonicalHash
    });
    const placed = await expectAccepted(actingClient, placeRequestId, 'PLACE_CARD');
    const placedSeq = Number(placed.action.seq || 0);
    const observer = playerIndex === 0 ? guestClient : hostClient;
    await waitForMessage(observer, msg => msg.kind === 'accepted' && Number(msg.action?.seq || 0) === placedSeq, `observer receives ${actingLabel} PLACE_CARD`);
    let turnState = placed.action.payload.postState;
    let turnHash = placed.action.payload.stateHash;
    const resolvedPicks = await resolvePendingCardPicks(actingClient, code, playerIndex, turnState, turnHash);
    turnState = resolvedPicks.state;
    turnHash = resolvedPicks.hash;

    const endRequestId = sendIntent(actingClient, code, 'END_TURN', {
      playerIndex,
      turn:turnState.turn,
      baseStateHash:turnHash
    });
    const ended = await expectAccepted(actingClient, endRequestId, 'END_TURN');
    if(String(ended.roomPatch?.currentTurnUid || '') === currentUid){
      throw new Error('END_TURN did not move currentTurnUid to opponent');
    }

    const finalResume = await fetchJson(`/api/rooms/${encodeURIComponent(code)}/resume?after=0&limit=20&includeState=1`, {
      idToken:users.host.idToken
    });
    if(Number(finalResume.lastSeq || 0) < Number(ended.action.seq || 0)){
      throw new Error(`resume lastSeq ${finalResume.lastSeq} is behind END_TURN seq ${ended.action.seq}`);
    }

    console.log(JSON.stringify({
      ok:true,
      origin:ORIGIN,
      wsUrl:WS_URL,
      authMode:users.mode,
      roomCode:code,
      firstPlayer:playerIndex,
      accepted:['MATCH_START via /api/rooms/start', `${actingLabel} PLACE_CARD via WebSocket`, `${actingLabel} END_TURN via WebSocket`],
      health:{rooms:health.rooms, reducerMode:health.reducerMode, firebaseRtdbDisabled:health.firebaseRtdbDisabled}
    }, null, 2));
  } finally {
    clients.forEach(client => {
      try { client.ws.close(); } catch (_) {}
    });
    if(localAuthority){
      try{ localAuthority.child.kill(); }catch(_){}
      try{ fs.rmSync(localAuthority.dataDir, {recursive:true, force:true}); }catch(_){}
    }
  }
}

run().catch(err => {
  console.error(err && err.stack || err);
  process.exit(1);
});
