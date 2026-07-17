#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const {getCardCatalog} = require('./fate-card-catalog');

const PORT = Number(process.env.FATE_WS_SMOKE_PORT || 8797);
const HOST = '127.0.0.1';
const ROOM_CODE = 'LOCAL1';
const WS_URL = `ws://${HOST}:${PORT}`;
const HEALTH_URL = `http://${HOST}:${PORT}/health`;
const ALLOW_FAKE_TOKENS = process.env.FATE_WS_SMOKE_ALLOW_FAKE === '1';
const HOST_TOKEN = process.env.FATE_WS_SMOKE_HOST_ID_TOKEN || '';
const GUEST_TOKEN = process.env.FATE_WS_SMOKE_GUEST_ID_TOKEN || '';

function base64urlDecode(input) {
  const s = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(s + '='.repeat((4 - (s.length % 4)) % 4), 'base64');
}

function uidFromToken(token, fallback) {
  if (!token) return fallback;
  const parts = String(token).split('.');
  if (parts.length < 2) throw new Error('Firebase ID token must be a JWT');
  const payload = JSON.parse(base64urlDecode(parts[1]).toString('utf8'));
  if (!payload.sub) throw new Error('Firebase ID token is missing sub/uid');
  return String(payload.sub);
}

const HOST_UID = uidFromToken(HOST_TOKEN, ALLOW_FAKE_TOKENS ? 'local-host' : '');
const GUEST_UID = uidFromToken(GUEST_TOKEN, ALLOW_FAKE_TOKENS ? 'local-guest' : '');

if (!ALLOW_FAKE_TOKENS && (!HOST_TOKEN || !GUEST_TOKEN || !HOST_UID || !GUEST_UID)) {
  console.error([
    'Real Firebase smoke mode requires two Firebase ID tokens.',
    '',
    'In each signed-in Fates Entwined app session, run:',
    '  await FATE_ONLINE.user.getIdToken(true)',
    '',
    'Then run PowerShell like:',
    "  $env:FATE_WS_SMOKE_HOST_ID_TOKEN='host token here'",
    "  $env:FATE_WS_SMOKE_GUEST_ID_TOKEN='guest token here'",
    '  npm.cmd run smoke:ws-authority',
    '',
    'For local-only fake auth, explicitly set:',
    "  $env:FATE_WS_SMOKE_ALLOW_FAKE='1'"
  ].join('\n'));
  process.exit(2);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function validDeck(){
  return getCardCatalog().cards
    .filter(card=>card && !card.retired && !card.temporarilyDisabled)
    .slice(0, 40)
    .map(card=>card.id);
}

async function apiRequest(method, path, body){
  const res = await fetch(`http://${HOST}:${PORT}${path}`, {
    method,
    headers:{'content-type':'application/json'},
    body:body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) {}
  if(!res.ok || json?.ok === false) throw new Error(`${method} ${path} failed ${res.status}: ${json?.error || text.slice(0, 200)}`);
  return json;
}

async function waitForHealth(timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(HEALTH_URL);
      if (res.ok) return await res.json();
    } catch (err) {
      lastError = err;
    }
    await sleep(100);
  }
  throw new Error(`authority health check timed out${lastError ? ': ' + lastError.message : ''}`);
}

function waitForMessage(client, predicate, label, timeoutMs = 2500) {
  const existing = client.messages.find(predicate);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for ${label}`));
    }, timeoutMs);
    function onMessage(message) {
      if (!predicate(message)) return;
      cleanup();
      resolve(message);
    }
    function cleanup() {
      clearTimeout(timeout);
      client.listeners.delete(onMessage);
    }
    client.listeners.add(onMessage);
  });
}

function createClient(uid, idToken, roomPatch = {}, roomCode = ROOM_CODE) {
  const ws = new WebSocket(WS_URL);
  const client = { uid, ws, messages: [], listeners: new Set() };
  ws.addEventListener('message', event => {
    const raw = typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8');
    const message = JSON.parse(raw);
    client.messages.push(message);
    client.listeners.forEach(listener => listener(message));
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`open timeout for ${uid}`)), 2500);
    ws.addEventListener('open', async () => {
      clearTimeout(timer);
      ws.send(JSON.stringify({
        kind: 'hello',
        roomCode,
        uid,
        idToken,
        lastSeq: 1,
        stateHash: 'initial-state',
        room: Object.assign({
          hostUid: HOST_UID,
          guestUid: GUEST_UID,
          currentTurnUid: HOST_UID,
          lastActionSeq: 1,
          playerOrder: { 0: HOST_UID, 1: GUEST_UID }
        }, roomPatch)
      }));
      try {
        await waitForMessage(client, msg => msg.kind === 'hello-ok', `${uid} hello-ok`);
        resolve(client);
      } catch (err) {
        reject(err);
      }
    }, { once: true });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error(`websocket error for ${uid}`));
    }, { once: true });
  });
}

function sendIntent(client, type, payload) {
  const requestId = `${client.uid}:${type}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  client.ws.send(JSON.stringify({
    kind: 'intent',
    requestId,
    roomCode: ROOM_CODE,
    type,
    payload,
    clientActionId: payload.clientActionId || requestId
  }));
  return requestId;
}

function postState(currentPlayer, label) {
  return {
    currentPlayer,
    turn: currentPlayer === 0 ? 1 : 2,
    smokeLabel: label
  };
}

function actionPayload(playerIndex, label, extra = {}) {
  const state = postState(Number(extra.nextCurrentPlayer ?? playerIndex), label);
  return Object.assign({
    playerIndex,
    turn: playerIndex === 0 ? 1 : 2,
    postState: state,
    stateHash: `hash:${label}:${state.currentPlayer}`,
    clientActionId: `smoke:${label}:${Date.now()}`
  }, extra);
}

async function expectAccepted(client, requestId, type, seq) {
  const msg = await waitForMessage(
    client,
    item => item.kind === 'accepted' && item.requestId === requestId,
    `${type} accepted`
  );
  if (msg.action.type !== type) throw new Error(`expected ${type}, got ${msg.action.type}`);
  if (Number(msg.action.seq) !== seq) throw new Error(`expected seq ${seq}, got ${msg.action.seq}`);
  return msg;
}

async function expectAcceptedAnySeq(client, requestId, type) {
  const msg = await waitForMessage(
    client,
    item => item.kind === 'accepted' && item.requestId === requestId,
    `${type} accepted`
  );
  if (msg.action.type !== type) throw new Error(`expected ${type}, got ${msg.action.type}`);
  return msg;
}

async function expectRejected(client, requestId, reasonFragment) {
  const msg = await waitForMessage(
    client,
    item => item.kind === 'rejected' && item.requestId === requestId,
    `rejection containing ${reasonFragment}`
  );
  if (!String(msg.reason || '').includes(reasonFragment)) {
    throw new Error(`expected rejection containing "${reasonFragment}", got "${msg.reason}"`);
  }
  return msg;
}

async function run() {
  const server = spawn(process.execPath, ['server/fate-ws-authority.js'], {
    cwd: process.cwd(),
    env: Object.assign({}, process.env, {
      FATE_WS_HOST: HOST,
      FATE_WS_PORT: String(PORT),
      FATE_WS_REQUIRE_TOKEN: ALLOW_FAKE_TOKENS ? '0' : '1',
      FATE_WS_DURABLE_WRITES: 'off',
      FATE_WS_REQUIRE_DURABLE_WRITES: '0',
      FATE_WS_STATE_GATE: '0',
      FATE_WS_DISCONNECT_TIMEOUT_MS: '120',
      FATE_WS_PING_MS: '60000'
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverLog = '';
  server.stdout.on('data', chunk => { serverLog += chunk.toString(); });
  server.stderr.on('data', chunk => { serverLog += chunk.toString(); });

  const clients = [];
  try {
    const health = await waitForHealth();
    if (health.durableWrites !== false) throw new Error('smoke server should run without durable writes');
    if (health.resultLedgerPersistence !== true) throw new Error(`expected result ledger persistence capability, got ${JSON.stringify(health)}`);
    if (health.flyResumeReplay !== true) throw new Error(`expected flyResumeReplay capability, got ${JSON.stringify(health)}`);

    const host = await createClient(HOST_UID, HOST_TOKEN);
    const guest = await createClient(GUEST_UID, GUEST_TOKEN);
    clients.push(host, guest);

    const burstHostA = sendIntent(host, 'CLICK_CELL', actionPayload(0, 'host-burst-a', {
      z: 0,
      r: 2,
      c: 1,
      placing: true,
      selectedHand: { id: '05', iid: 'host-card-1' }
    }));
    const burstHostB = sendIntent(host, 'CLICK_CELL', actionPayload(0, 'host-burst-b', {
      z: 1,
      r: 2,
      c: 1,
      placing: true,
      selectedHand: { id: '31', iid: 'host-card-2' }
    }));
    const burstAccepted = await Promise.all([
      expectAcceptedAnySeq(host, burstHostA, 'CLICK_CELL'),
      expectAcceptedAnySeq(host, burstHostB, 'CLICK_CELL')
    ]);
    const burstSeqs = burstAccepted.map(msg => Number(msg.action.seq)).sort((a, b) => a - b);
    if (burstSeqs[0] !== 2 || burstSeqs[1] !== 3 || burstSeqs[0] === burstSeqs[1]) {
      throw new Error(`expected concurrent host intents to serialize as seq 2 and 3, got ${burstSeqs.join(', ')}`);
    }
    await waitForMessage(guest, msg => msg.kind === 'accepted' && msg.action?.seq === 2, 'guest receives first host burst placement');
    await waitForMessage(guest, msg => msg.kind === 'accepted' && msg.action?.seq === 3, 'guest receives second host burst placement');

    const endPayload = actionPayload(0, 'host-end-turn', {
      nextCurrentPlayer: 1
    });
    const endHost = sendIntent(host, 'END_TURN', endPayload);
    const endAccepted = await expectAccepted(host, endHost, 'END_TURN', 4);
    if (endAccepted.roomPatch.currentTurnUid !== GUEST_UID) {
      throw new Error(`expected room turn to move to guest, got ${endAccepted.roomPatch.currentTurnUid}`);
    }
    const retryEndHost = sendIntent(host, 'END_TURN', Object.assign({}, endPayload));
    const retryEndAccepted = await expectAccepted(host, retryEndHost, 'END_TURN', 4);
    if (retryEndAccepted.idempotentReplay !== true || retryEndAccepted.action.clientActionId !== endPayload.clientActionId) {
      throw new Error(`expected duplicate END_TURN to replay original accepted action, got ${JSON.stringify(retryEndAccepted)}`);
    }
    const retryEndNewId = sendIntent(host, 'END_TURN', actionPayload(0, 'host-end-turn-fresh-id', {
      nextCurrentPlayer: 1
    }));
    const retryEndNewIdAccepted = await expectAccepted(host, retryEndNewId, 'END_TURN', 4);
    if (retryEndNewIdAccepted.idempotentReplay !== true || retryEndNewIdAccepted.action.clientActionId !== endPayload.clientActionId) {
      throw new Error(`expected fresh-id duplicate END_TURN to replay original accepted action, got ${JSON.stringify(retryEndNewIdAccepted)}`);
    }
    const conflictingRetry = sendIntent(host, 'CLICK_CELL', Object.assign({}, endPayload, {
      z: 2,
      r: 2,
      c: 1
    }));
    await expectRejected(host, conflictingRetry, 'clientActionId already used');

    const staleHost = sendIntent(host, 'CLICK_CELL', actionPayload(0, 'host-stale-turn', {
      z: 1,
      r: 2,
      c: 1
    }));
    await expectRejected(host, staleHost, 'not this player turn');

    const placeGuest = sendIntent(guest, 'CLICK_CELL', actionPayload(1, 'guest-place-card', {
      z: 0,
      r: 0,
      c: 1,
      placing: true,
      selectedHand: { id: '31', iid: 'guest-card-1' }
    }));
    await expectAccepted(guest, placeGuest, 'CLICK_CELL', 5);

    const landscapePick = sendIntent(guest, 'PICK_LANDSCAPE_ZONE', actionPayload(1, 'guest-landscape-zone', {
      chooserIndex: 1,
      zone: 2,
      landscapePromptKey: 'smoke-room|igb8|10|1|row|Qingdao Breakthrough'
    }));
    const landscapeAccepted = await expectAccepted(guest, landscapePick, 'PICK_LANDSCAPE_ZONE', 6);
    const duplicateLandscapePick = sendIntent(guest, 'PICK_LANDSCAPE_ZONE', actionPayload(1, 'guest-landscape-zone-duplicate', {
      chooserIndex: 1,
      zone: 0,
      landscapePromptKey: 'smoke-room|igb8|10|1|row|Qingdao Breakthrough'
    }));
    const duplicateLandscapeAccepted = await expectAccepted(guest, duplicateLandscapePick, 'PICK_LANDSCAPE_ZONE', 6);
    if(duplicateLandscapeAccepted.idempotentReplay !== true || duplicateLandscapeAccepted.action.clientActionId !== landscapeAccepted.action.clientActionId){
      throw new Error(`expected duplicate landscape prompt to replay the first choice, got ${JSON.stringify(duplicateLandscapeAccepted)}`);
    }

    const forfeitGuest = sendIntent(guest, 'FORFEIT', {
      clientActionId: `smoke:guest-forfeit:${Date.now()}`
    });
    const forfeitAccepted = await expectAccepted(guest, forfeitGuest, 'FORFEIT', 7);
    if (forfeitAccepted.action.payload.playerIndex !== 1) {
      throw new Error(`expected server-normalized forfeit playerIndex 1, got ${forfeitAccepted.action.payload.playerIndex}`);
    }
    if (forfeitAccepted.roomPatch.status !== 'ended' || forfeitAccepted.roomPatch.phase !== 'ended') {
      throw new Error(`expected forfeit to end room, got ${JSON.stringify(forfeitAccepted.roomPatch)}`);
    }
    if (forfeitAccepted.roomPatch.winnerUid !== HOST_UID || forfeitAccepted.roomPatch.loserUid !== GUEST_UID) {
      throw new Error(`expected host winner and guest loser, got ${JSON.stringify(forfeitAccepted.roomPatch)}`);
    }
    if (!forfeitAccepted.action.payload.rewardLedger?.serverFinalized || forfeitAccepted.action.payload.rewardLedger.endReason !== 'forfeit') {
      throw new Error(`expected server-finalized forfeit reward ledger, got ${JSON.stringify(forfeitAccepted.action.payload.rewardLedger)}`);
    }
    if (forfeitAccepted.resultLedgerWrite !== false) {
      throw new Error(`expected local durable-off forfeit resultLedgerWrite=false, got ${JSON.stringify(forfeitAccepted)}`);
    }

    const roomsRes = await fetch(`http://${HOST}:${PORT}/rooms`);
    const rooms = await roomsRes.json();
    const room = rooms.find(item => item.code === ROOM_CODE);
    if (!room || room.lastActionSeq !== 7 || room.status !== 'ended' || room.phase !== 'ended' || room.winnerUid !== HOST_UID || room.loserUid !== GUEST_UID || room.resultLedger?.endReason !== 'forfeit') {
      throw new Error(`unexpected room summary: ${JSON.stringify(room)}`);
    }

    const deck = validDeck();
    const created = await apiRequest('POST', '/api/rooms', {
      uid:HOST_UID,
      mode:'ranked',
      profile:{username:'Smoke Host', challengerElo:1000, challengerWins:3, challengerLosses:1, humanWins:2, humanLosses:1, matchesPlayed:4},
      deckChoice:{deckIds:deck, name:'Host Smoke Deck', ready:true}
    });
    const disconnectRoomCode = created.room.code;
    await apiRequest('POST', `/api/rooms/${disconnectRoomCode}/join`, {
      uid:GUEST_UID,
      profile:{username:'Smoke Guest', challengerElo:800, challengerWins:1, challengerLosses:3, humanWins:1, humanLosses:2, matchesPlayed:4},
      deckChoice:{deckIds:deck, name:'Guest Smoke Deck', ready:true}
    });
    await apiRequest('POST', `/api/rooms/${disconnectRoomCode}/start`, {
      uid:HOST_UID,
      seed:'disconnect-timeout-smoke'
    });
    const resumeStarted = await apiRequest('GET', `/api/rooms/${disconnectRoomCode}/resume?after=0&limit=20`);
    if(!resumeStarted.room || resumeStarted.lastSeq < 1 || !resumeStarted.events.some(item => item.action?.type === 'MATCH_START')){
      throw new Error(`unexpected started resume payload: ${JSON.stringify(resumeStarted)}`);
    }
    const started = (await apiRequest('GET', `/api/rooms/${disconnectRoomCode}`)).room;
    const disconnectHost = await createClient(HOST_UID, HOST_TOKEN, started, disconnectRoomCode);
    const disconnectGuest = await createClient(GUEST_UID, GUEST_TOKEN, started, disconnectRoomCode);
    clients.push(disconnectHost, disconnectGuest);
    disconnectGuest.ws.close();
    const timeoutAccepted = await waitForMessage(
      disconnectHost,
      msg => msg.kind === 'accepted' && msg.action?.type === 'DISCONNECT_TIMEOUT',
      'server disconnect timeout',
      4000
    );
    if(timeoutAccepted.roomPatch.winnerUid !== HOST_UID || timeoutAccepted.roomPatch.loserUid !== GUEST_UID || timeoutAccepted.roomPatch.endedBy !== GUEST_UID){
      throw new Error(`unexpected disconnect room patch: ${JSON.stringify(timeoutAccepted.roomPatch)}`);
    }
    const ledger = timeoutAccepted.action.payload.rewardLedger;
    if(!ledger || !ledger.serverFinalized || !ledger.ranked || ledger.endReason !== 'disconnect'){
      throw new Error(`expected ranked server disconnect reward ledger, got ${JSON.stringify(ledger)}`);
    }
    if(timeoutAccepted.resultLedgerWrite !== false){
      throw new Error(`expected local durable-off disconnect resultLedgerWrite=false, got ${JSON.stringify(timeoutAccepted)}`);
    }
    if(ledger.byUid?.[HOST_UID]?.oldElo !== 600 || ledger.byUid?.[HOST_UID]?.newElo !== 616 || ledger.byUid?.[HOST_UID]?.delta !== 16 || ledger.byUid?.[HOST_UID]?.starlightGained !== 60){
      throw new Error(`unexpected host reward ledger: ${JSON.stringify(ledger.byUid?.[HOST_UID])}`);
    }
    if(ledger.byUid?.[GUEST_UID]?.oldElo !== 600 || ledger.byUid?.[GUEST_UID]?.newElo !== 580 || ledger.byUid?.[GUEST_UID]?.delta !== -20){
      throw new Error(`unexpected guest reward ledger: ${JSON.stringify(ledger.byUid?.[GUEST_UID])}`);
    }
    const disconnectFinal = (await apiRequest('GET', `/api/rooms/${disconnectRoomCode}`)).room;
    if(disconnectFinal.status !== 'ended' || disconnectFinal.endReason !== 'disconnect' || disconnectFinal.endedBy !== GUEST_UID || disconnectFinal.winnerUid !== HOST_UID || disconnectFinal.loserUid !== GUEST_UID || disconnectFinal.resultLedger?.byUid?.[HOST_UID]?.newElo !== 616){
      throw new Error(`unexpected disconnect final room: ${JSON.stringify(disconnectFinal)}`);
    }
    const resumeEnded = await apiRequest('GET', `/api/rooms/${disconnectRoomCode}/resume?after=1&limit=20`);
    if(resumeEnded.lastSeq < 2 || !resumeEnded.events.some(item => item.action?.type === 'DISCONNECT_TIMEOUT')){
      throw new Error(`unexpected ended resume payload: ${JSON.stringify(resumeEnded)}`);
    }

    console.log(JSON.stringify({
      ok: true,
      authMode: ALLOW_FAKE_TOKENS ? 'fake-local' : 'real-firebase-id-token',
      url: WS_URL,
      room: ROOM_CODE,
      accepted: [
        'host concurrent CLICK_CELL seq 2+3',
        'host END_TURN seq 4 with idempotent retry',
        'guest CLICK_CELL seq 5',
        'guest PICK_LANDSCAPE_ZONE seq 6',
        'guest FORFEIT seq 7',
        'server DISCONNECT_TIMEOUT on API-started room'
      ],
      rejectedAsExpected: 'host stale CLICK_CELL after turn passed',
      roomSummary: room
    }, null, 2));
  } finally {
    clients.forEach(client => {
      try { client.ws.close(); } catch (_) {}
    });
    server.kill();
    setTimeout(() => {
      if (!server.killed) server.kill('SIGKILL');
    }, 500).unref?.();
    if (process.env.FATE_WS_SMOKE_VERBOSE === '1') {
      console.error(serverLog.trim());
    }
  }
}

run().catch(err => {
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
