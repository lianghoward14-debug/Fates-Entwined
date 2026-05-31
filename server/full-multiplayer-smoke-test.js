#!/usr/bin/env node
'use strict';

const DB_URL = String(process.env.FATE_WS_SMOKE_DATABASE_URL || 'https://fates-entwined-41491-default-rtdb.firebaseio.com').replace(/\/+$/, '');
const AUTHORITY_URL = process.env.FATE_WS_SMOKE_AUTHORITY_URL || 'wss://fates-entwined-main.fly.dev';
const HEALTH_URL = process.env.FATE_WS_SMOKE_HEALTH_URL || 'https://fates-entwined-main.fly.dev/health';
const HOST_TOKEN = process.env.FATE_WS_SMOKE_HOST_ID_TOKEN || '';
const GUEST_TOKEN = process.env.FATE_WS_SMOKE_GUEST_ID_TOKEN || '';

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

function randomRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'T';
  for (let i = 0; i < 5; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function restUrl(path, token) {
  const cleaned = String(path || '').replace(/^\/+|\/+$/g, '').split('/').map(encodeURIComponent).join('/');
  return `${DB_URL}/${cleaned}.json?auth=${encodeURIComponent(token)}`;
}

async function firebaseRequest(method, path, token, body) {
  const res = await fetch(restUrl(path, token), {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) {}
  if (!res.ok) {
    throw new Error(`${method} ${path} failed ${res.status}: ${text.slice(0, 240)}`);
  }
  if (json && json.error) throw new Error(`${method} ${path} rejected: ${json.error}`);
  return json;
}

async function waitForMessage(client, predicate, label, timeoutMs = 6000) {
  const existing = client.messages.find(predicate);
  if (existing) return existing;
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for ${label}`));
    }, timeoutMs);
    function listener(message) {
      if (!predicate(message)) return;
      cleanup();
      resolve(message);
    }
    function cleanup() {
      clearTimeout(timer);
      client.listeners.delete(listener);
    }
    client.listeners.add(listener);
  });
}

async function createWsClient(uid, token, roomCode, room) {
  const ws = new WebSocket(AUTHORITY_URL);
  const client = { uid, ws, messages: [], listeners: new Set() };
  ws.addEventListener('message', event => {
    const raw = typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8');
    const message = JSON.parse(raw);
    client.messages.push(message);
    client.listeners.forEach(fn => fn(message));
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`websocket open timeout for ${uid}`)), 8000);
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error(`websocket open error for ${uid}`));
    }, { once: true });
  });
  ws.send(JSON.stringify({
    kind: 'hello',
    roomCode,
    uid,
    idToken: token,
    lastSeq: 1,
    stateHash: 'full-smoke-initial',
    room
  }));
  await waitForMessage(client, msg => msg.kind === 'hello-ok', `${uid} hello-ok`);
  return client;
}

function postState(currentPlayer, label) {
  return { currentPlayer, turn: currentPlayer + 1, smokeLabel: label };
}

function actionPayload(playerIndex, label, extra = {}) {
  const state = postState(Number(extra.nextCurrentPlayer ?? playerIndex), label);
  return Object.assign({
    playerIndex,
    turn: playerIndex + 1,
    postState: state,
    stateHash: `hash:${label}:${state.currentPlayer}`,
    clientActionId: `full-smoke:${label}:${Date.now()}`
  }, extra);
}

function sendIntent(client, roomCode, type, payload) {
  const requestId = `${client.uid}:${type}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  client.ws.send(JSON.stringify({ kind: 'intent', requestId, roomCode, type, payload, clientActionId: payload.clientActionId }));
  return requestId;
}

async function expectAccepted(client, requestId, type, seq) {
  const msg = await waitForMessage(client, item => item.kind === 'accepted' && item.requestId === requestId, `${type} accepted`);
  if (msg.action.type !== type) throw new Error(`expected ${type}, got ${msg.action.type}`);
  if (Number(msg.action.seq) !== seq) throw new Error(`expected seq ${seq}, got ${msg.action.seq}`);
  return msg;
}

async function persistAccepted(roomCode, token, accepted) {
  const action = Object.assign({}, accepted.action, { createdAt: { '.sv': 'timestamp' } });
  const seq = Number(action.seq || 0);
  const patch = {
    [`rooms/${roomCode}/actions/${String(seq).padStart(6, '0')}`]: action,
    [`rooms/${roomCode}/lastActionSeq`]: seq,
    [`rooms/${roomCode}/updatedAt`]: { '.sv': 'timestamp' }
  };
  const roomPatch = accepted.roomPatch || {};
  Object.keys(roomPatch).forEach(key => {
    patch[`rooms/${roomCode}/${key}`] = roomPatch[key];
  });
  await firebaseRequest('PATCH', '/', token, patch);
}

function playerNode(uid, role) {
  return {
    uid,
    role,
    ready: true,
    connected: true,
    joinedAt: { '.sv': 'timestamp' },
    profileSnapshot: { uid, chosenUsername: role === 'host' ? 'Smoke Host' : 'Smoke Guest', photoURL: 'blank.png' },
    selectedDeckKey: 'smoke',
    selectedDeckName: 'Smoke Deck',
    deckIds: Array.from({ length: 40 }, (_, i) => String((i % 20) + 1).padStart(2, '0')),
    actionSeq: 1,
    actionSeqClientAt: Date.now()
  };
}

async function run() {
  const hostPayload = decodeToken(HOST_TOKEN, 'host');
  const guestPayload = decodeToken(GUEST_TOKEN, 'guest');
  const hostUid = String(hostPayload.sub);
  const guestUid = String(guestPayload.sub);
  if (hostUid === guestUid) throw new Error('host and guest tokens must be from different Firebase users');

  const health = await fetch(HEALTH_URL).then(res => res.json()).catch(err => ({ error: err.message }));
  const roomCode = randomRoomCode();
  const clients = [];
  let cleanupOk = false;

  try {
    await firebaseRequest('PUT', `rooms/${roomCode}`, HOST_TOKEN, {
      roomCode,
      mode: 'freeplay',
      status: 'lobby',
      hostUid,
      guestUid: null,
      createdAt: { '.sv': 'timestamp' },
      updatedAt: { '.sv': 'timestamp' },
      lastActionSeq: 0,
      schemaVersion: 1
    });
    await firebaseRequest('PUT', `rooms/${roomCode}/players/${hostUid}`, HOST_TOKEN, playerNode(hostUid, 'host'));
    await firebaseRequest('PUT', `rooms/${roomCode}/guestUid`, GUEST_TOKEN, guestUid);
    await firebaseRequest('PUT', `rooms/${roomCode}/players/${guestUid}`, GUEST_TOKEN, playerNode(guestUid, 'guest'));

    const seed = `${roomCode}_${Date.now()}`;
    const startAction = {
      seq: 1,
      uid: hostUid,
      type: 'MATCH_START',
      payload: {
        seed,
        song: 'board1',
        hostUid,
        guestUid,
        mode: 'freeplay',
        profiles: { 0: { uid: hostUid }, 1: { uid: guestUid } },
        decks: { 0: playerNode(hostUid, 'host').deckIds, 1: playerNode(guestUid, 'guest').deckIds },
        deckNames: { 0: 'Smoke Host Deck', 1: 'Smoke Guest Deck' }
      },
      createdAt: { '.sv': 'timestamp' }
    };
    await firebaseRequest('PATCH', '/', HOST_TOKEN, {
      [`rooms/${roomCode}/status`]: 'matchup',
      [`rooms/${roomCode}/phase`]: 'matchup',
      [`rooms/${roomCode}/startedAt`]: { '.sv': 'timestamp' },
      [`rooms/${roomCode}/updatedAt`]: { '.sv': 'timestamp' },
      [`rooms/${roomCode}/seed`]: seed,
      [`rooms/${roomCode}/song`]: 'board1',
      [`rooms/${roomCode}/playerOrder/0`]: hostUid,
      [`rooms/${roomCode}/playerOrder/1`]: guestUid,
      [`rooms/${roomCode}/currentTurnUid`]: hostUid,
      [`rooms/${roomCode}/lastActionSeq`]: 1,
      [`rooms/${roomCode}/actions/000001`]: startAction
    });

    const room = await firebaseRequest('GET', `rooms/${roomCode}`, HOST_TOKEN);
    const hostClient = await createWsClient(hostUid, HOST_TOKEN, roomCode, room);
    const guestClient = await createWsClient(guestUid, GUEST_TOKEN, roomCode, room);
    clients.push(hostClient, guestClient);

    const hostPlaceId = sendIntent(hostClient, roomCode, 'CLICK_CELL', actionPayload(0, 'host-place-card', {
      z: 0,
      r: 2,
      c: 1,
      placing: true,
      selectedHand: { id: '05', iid: 'host-card-1' }
    }));
    const hostPlace = await expectAccepted(hostClient, hostPlaceId, 'CLICK_CELL', 2);
    await persistAccepted(roomCode, HOST_TOKEN, hostPlace);

    const hostEndId = sendIntent(hostClient, roomCode, 'END_TURN', actionPayload(0, 'host-end-turn', {
      nextCurrentPlayer: 1
    }));
    const hostEnd = await expectAccepted(hostClient, hostEndId, 'END_TURN', 3);
    await persistAccepted(roomCode, HOST_TOKEN, hostEnd);

    const guestPlaceId = sendIntent(guestClient, roomCode, 'CLICK_CELL', actionPayload(1, 'guest-place-card', {
      z: 0,
      r: 0,
      c: 1,
      placing: true,
      selectedHand: { id: '31', iid: 'guest-card-1' }
    }));
    const guestPlace = await expectAccepted(guestClient, guestPlaceId, 'CLICK_CELL', 4);
    await persistAccepted(roomCode, GUEST_TOKEN, guestPlace);

    const finalRoom = await firebaseRequest('GET', `rooms/${roomCode}`, HOST_TOKEN);
    if (Number(finalRoom.lastActionSeq) !== 4) throw new Error(`expected Firebase lastActionSeq 4, got ${finalRoom.lastActionSeq}`);
    if (!finalRoom.actions || !finalRoom.actions['000004']) throw new Error('Firebase action 000004 missing');

    console.log(JSON.stringify({
      ok: true,
      authorityUrl: AUTHORITY_URL,
      health,
      roomCode,
      firebaseWrites: [
        'room created',
        'host player joined',
        'guest player joined',
        'MATCH_START action persisted',
        'host CLICK_CELL accepted and persisted',
        'host END_TURN accepted and persisted',
        'guest CLICK_CELL accepted and persisted'
      ],
      final: {
        lastActionSeq: finalRoom.lastActionSeq,
        currentTurnUid: finalRoom.currentTurnUid,
        actionKeys: Object.keys(finalRoom.actions || {}).sort()
      }
    }, null, 2));
  } finally {
    clients.forEach(client => {
      try { client.ws.close(); } catch (_) {}
    });
    try {
      await firebaseRequest('DELETE', `rooms/${roomCode}`, HOST_TOKEN);
      cleanupOk = true;
    } catch (err) {
      console.error(`cleanup failed for room ${roomCode}: ${err.message}`);
    }
    if (!cleanupOk) process.exitCode = process.exitCode || 1;
  }
}

run().catch(err => {
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
