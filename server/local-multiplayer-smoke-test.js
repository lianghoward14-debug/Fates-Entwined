#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');

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

function createClient(uid, idToken, roomPatch = {}) {
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
        roomCode: ROOM_CODE,
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

    const host = await createClient(HOST_UID, HOST_TOKEN);
    const guest = await createClient(GUEST_UID, GUEST_TOKEN);
    clients.push(host, guest);

    const placeHost = sendIntent(host, 'CLICK_CELL', actionPayload(0, 'host-place-card', {
      z: 0,
      r: 2,
      c: 1,
      placing: true,
      selectedHand: { id: '05', iid: 'host-card-1' }
    }));
    await expectAccepted(host, placeHost, 'CLICK_CELL', 2);
    await waitForMessage(guest, msg => msg.kind === 'accepted' && msg.action?.seq === 2, 'guest receives host placement');

    const endHost = sendIntent(host, 'END_TURN', actionPayload(0, 'host-end-turn', {
      nextCurrentPlayer: 1
    }));
    const endAccepted = await expectAccepted(host, endHost, 'END_TURN', 3);
    if (endAccepted.roomPatch.currentTurnUid !== GUEST_UID) {
      throw new Error(`expected room turn to move to guest, got ${endAccepted.roomPatch.currentTurnUid}`);
    }

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
    await expectAccepted(guest, placeGuest, 'CLICK_CELL', 4);

    const landscapePick = sendIntent(guest, 'PICK_LANDSCAPE_ZONE', actionPayload(1, 'guest-landscape-zone', {
      chooserIndex: 1,
      zone: 2
    }));
    await expectAccepted(guest, landscapePick, 'PICK_LANDSCAPE_ZONE', 5);

    const forfeitGuest = sendIntent(guest, 'FORFEIT', {
      clientActionId: `smoke:guest-forfeit:${Date.now()}`
    });
    const forfeitAccepted = await expectAccepted(guest, forfeitGuest, 'FORFEIT', 6);
    if (forfeitAccepted.action.payload.playerIndex !== 1) {
      throw new Error(`expected server-normalized forfeit playerIndex 1, got ${forfeitAccepted.action.payload.playerIndex}`);
    }
    if (forfeitAccepted.roomPatch.status !== 'ended' || forfeitAccepted.roomPatch.phase !== 'ended') {
      throw new Error(`expected forfeit to end room, got ${JSON.stringify(forfeitAccepted.roomPatch)}`);
    }
    if (forfeitAccepted.roomPatch.winnerUid !== HOST_UID || forfeitAccepted.roomPatch.loserUid !== GUEST_UID) {
      throw new Error(`expected host winner and guest loser, got ${JSON.stringify(forfeitAccepted.roomPatch)}`);
    }

    const roomsRes = await fetch(`http://${HOST}:${PORT}/rooms`);
    const rooms = await roomsRes.json();
    const room = rooms.find(item => item.code === ROOM_CODE);
    if (!room || room.lastActionSeq !== 6 || room.status !== 'ended' || room.phase !== 'ended' || room.winnerUid !== HOST_UID || room.loserUid !== GUEST_UID) {
      throw new Error(`unexpected room summary: ${JSON.stringify(room)}`);
    }

    console.log(JSON.stringify({
      ok: true,
      authMode: ALLOW_FAKE_TOKENS ? 'fake-local' : 'real-firebase-id-token',
      url: WS_URL,
      room: ROOM_CODE,
      accepted: [
        'host CLICK_CELL seq 2',
        'host END_TURN seq 3',
        'guest CLICK_CELL seq 4',
        'guest PICK_LANDSCAPE_ZONE seq 5',
        'guest FORFEIT seq 6'
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
