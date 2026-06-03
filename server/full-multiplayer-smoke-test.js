#!/usr/bin/env node
'use strict';

const DB_URL = String(process.env.FATE_WS_SMOKE_DATABASE_URL || 'https://fates-entwined-41491-default-rtdb.firebaseio.com').replace(/\/+$/, '');
const AUTHORITY_URL = process.env.FATE_WS_SMOKE_AUTHORITY_URL || 'wss://fates-entwined-main.fly.dev';
const HEALTH_URL = process.env.FATE_WS_SMOKE_HEALTH_URL || 'https://fates-entwined-main.fly.dev/health';
const FIREBASE_API_KEY = process.env.FATE_WS_SMOKE_API_KEY || 'AIzaSyByhcqY0Y27hUkvcAtO3mflRwnQCWhv4Yc';
const USE_ANON_AUTH = process.env.FATE_WS_SMOKE_USE_ANON === '1' || process.argv.includes('--anon');
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

async function identityToolkitRequest(endpoint, body) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/${endpoint}?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) {}
  if (!res.ok || (json && json.error)) {
    const message = json?.error?.message || text.slice(0, 240) || `HTTP ${res.status}`;
    throw new Error(`Firebase Auth ${endpoint} failed: ${message}`);
  }
  return json || {};
}

async function createAnonymousAuthUser(label) {
  const json = await identityToolkitRequest('accounts:signUp', { returnSecureToken: true });
  if (!json.idToken || !json.localId) throw new Error(`anonymous ${label} auth response missing idToken/localId`);
  return {
    label,
    uid: String(json.localId),
    idToken: String(json.idToken)
  };
}

async function deleteAuthUser(account) {
  if (!account?.idToken) return false;
  await identityToolkitRequest('accounts:delete', { idToken: account.idToken });
  return true;
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
  const tempAuthUsers = [];
  let hostToken = HOST_TOKEN;
  let guestToken = GUEST_TOKEN;
  if (USE_ANON_AUTH) {
    const hostAccount = await createAnonymousAuthUser('host');
    const guestAccount = await createAnonymousAuthUser('guest');
    tempAuthUsers.push(hostAccount, guestAccount);
    hostToken = hostAccount.idToken;
    guestToken = guestAccount.idToken;
  }
  const hostPayload = decodeToken(hostToken, 'host');
  const guestPayload = decodeToken(guestToken, 'guest');
  const hostUid = String(hostPayload.sub);
  const guestUid = String(guestPayload.sub);
  if (hostUid === guestUid) throw new Error('host and guest tokens must be from different Firebase users');

  const health = await fetch(HEALTH_URL).then(res => res.json()).catch(err => ({ error: err.message }));
  const roomCode = randomRoomCode();
  const clients = [];
  let cleanupOk = false;

  try {
    await firebaseRequest('PUT', `rooms/${roomCode}`, hostToken, {
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
    await firebaseRequest('PUT', `rooms/${roomCode}/players/${hostUid}`, hostToken, playerNode(hostUid, 'host'));
    await firebaseRequest('PUT', `rooms/${roomCode}/guestUid`, guestToken, guestUid);
    await firebaseRequest('PUT', `rooms/${roomCode}/players/${guestUid}`, guestToken, playerNode(guestUid, 'guest'));

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
    await firebaseRequest('PATCH', '/', hostToken, {
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

    const room = await firebaseRequest('GET', `rooms/${roomCode}`, hostToken);
    const hostClient = await createWsClient(hostUid, hostToken, roomCode, room);
    const guestClient = await createWsClient(guestUid, guestToken, roomCode, room);
    clients.push(hostClient, guestClient);

    const hostPlaceId = sendIntent(hostClient, roomCode, 'CLICK_CELL', actionPayload(0, 'host-place-card', {
      z: 0,
      r: 2,
      c: 1,
      placing: true,
      selectedHand: { id: '05', iid: 'host-card-1' }
    }));
    const hostPlace = await expectAccepted(hostClient, hostPlaceId, 'CLICK_CELL', 2);
    await persistAccepted(roomCode, hostToken, hostPlace);

    const hostEndId = sendIntent(hostClient, roomCode, 'END_TURN', actionPayload(0, 'host-end-turn', {
      nextCurrentPlayer: 1
    }));
    const hostEnd = await expectAccepted(hostClient, hostEndId, 'END_TURN', 3);
    await persistAccepted(roomCode, hostToken, hostEnd);

    const guestPlaceId = sendIntent(guestClient, roomCode, 'CLICK_CELL', actionPayload(1, 'guest-place-card', {
      z: 0,
      r: 0,
      c: 1,
      placing: true,
      selectedHand: { id: '31', iid: 'guest-card-1' }
    }));
    const guestPlace = await expectAccepted(guestClient, guestPlaceId, 'CLICK_CELL', 4);
    await persistAccepted(roomCode, guestToken, guestPlace);

    const guestForfeitId = sendIntent(guestClient, roomCode, 'FORFEIT', {
      clientActionId: `full-smoke:guest-forfeit:${Date.now()}`
    });
    const guestForfeit = await expectAccepted(guestClient, guestForfeitId, 'FORFEIT', 5);
    await persistAccepted(roomCode, guestToken, guestForfeit);

    const finalRoom = await firebaseRequest('GET', `rooms/${roomCode}`, hostToken);
    if (Number(finalRoom.lastActionSeq) !== 5) throw new Error(`expected Firebase lastActionSeq 5, got ${finalRoom.lastActionSeq}`);
    if (!finalRoom.actions || !finalRoom.actions['000005']) throw new Error('Firebase action 000005 missing');
    if (finalRoom.status !== 'ended') throw new Error(`expected room status ended, got ${finalRoom.status}`);
    if (finalRoom.phase !== 'ended') throw new Error(`expected room phase ended, got ${finalRoom.phase}`);

    console.log(JSON.stringify({
      ok: true,
      authMode: USE_ANON_AUTH ? 'temporary-anonymous-firebase-users' : 'provided-id-tokens',
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
        'guest CLICK_CELL accepted and persisted',
        'guest FORFEIT accepted and persisted'
      ],
      final: {
        lastActionSeq: finalRoom.lastActionSeq,
        currentTurnUid: finalRoom.currentTurnUid,
        status: finalRoom.status,
        phase: finalRoom.phase,
        endedBy: finalRoom.endedBy || null,
        endReason: finalRoom.endReason || null,
        actionKeys: Object.keys(finalRoom.actions || {}).sort()
      }
    }, null, 2));
  } finally {
    clients.forEach(client => {
      try { client.ws.close(); } catch (_) {}
    });
    try {
      await firebaseRequest('DELETE', `rooms/${roomCode}`, hostToken);
      cleanupOk = true;
    } catch (err) {
      console.error(`cleanup failed for room ${roomCode}: ${err.message}`);
    }
    for (const account of tempAuthUsers) {
      await deleteAuthUser(account).catch(err => {
        console.error(`auth cleanup failed for ${account.label}/${account.uid}: ${err.message}`);
        cleanupOk = false;
      });
    }
    if (!cleanupOk) process.exitCode = process.exitCode || 1;
  }
}

run().catch(err => {
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
