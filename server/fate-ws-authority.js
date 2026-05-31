#!/usr/bin/env node
/*
 * Fates Entwined WebSocket authority server.
 *
 * This server owns online-match action ordering and basic turn validation. It is
 * intentionally dependency-free so it can run on small hosts without an install
 * step. Firebase remains the lobby/profile/chat store; accepted authoritative
 * actions are persisted by the connected clients for the existing replay layer.
 */
'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || process.env.FATE_WS_PORT || 8787);
const HOST = process.env.HOST || process.env.FATE_WS_HOST || '0.0.0.0';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'fates-entwined-41491';
const FIREBASE_DATABASE_URL = String(process.env.FIREBASE_DATABASE_URL || 'https://fates-entwined-41491-default-rtdb.firebaseio.com').replace(/\/+$/, '');
const REQUIRE_FIREBASE_TOKEN = process.env.FATE_WS_REQUIRE_TOKEN !== '0';
const DURABLE_WRITES_MODE = String(process.env.FATE_WS_DURABLE_WRITES || 'auto').toLowerCase();
const REQUIRE_DURABLE_WRITES = process.env.FATE_WS_REQUIRE_DURABLE_WRITES === '1';
const MAX_MESSAGE_BYTES = 512 * 1024;
const ROOM_IDLE_MS = Number(process.env.FATE_WS_ROOM_IDLE_MS || 1000 * 60 * 90);
const PING_MS = Number(process.env.FATE_WS_PING_MS || 25000);
const APP_ROOT = path.resolve(__dirname, '..');
const WEBSITE_DIR = path.join(APP_ROOT, 'fates-entwined-website');
const DIST_DIR = path.join(APP_ROOT, 'dist');
const INSTALLER_PUBLIC_PATH = '/installer/Fates-Entwined-Installer.exe';

const rooms = new Map();
const sockets = new Set();
let certCache = { expiresAt: 0, certs: null };
let serviceAccountCache = undefined;
let adminTokenCache = { expiresAt: 0, accessToken: '' };

function now(){ return Date.now(); }
function roomCode(value){ return String(value || '').trim().toUpperCase(); }
function isRoomCode(value){ return /^[A-Z0-9]{6}$/.test(String(value || '')); }
function safeJson(value){ try{ return JSON.stringify(value); }catch(e){ return 'null'; } }
function parseJson(value){ try{ return JSON.parse(value); }catch(e){ return null; } }

function contentTypeFor(filePath){
  const ext = path.extname(filePath).toLowerCase();
  if(ext === '.html') return 'text/html; charset=utf-8';
  if(ext === '.css') return 'text/css; charset=utf-8';
  if(ext === '.js') return 'application/javascript; charset=utf-8';
  if(ext === '.png') return 'image/png';
  if(ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if(ext === '.webp') return 'image/webp';
  if(ext === '.svg') return 'image/svg+xml';
  if(ext === '.ico') return 'image/x-icon';
  if(ext === '.exe') return 'application/vnd.microsoft.portable-executable';
  return 'application/octet-stream';
}

function latestInstallerPath(){
  const stable = path.join(WEBSITE_DIR, 'installer', 'Fates-Entwined-Installer.exe');
  if(fs.existsSync(stable)) return stable;
  if(!fs.existsSync(DIST_DIR)) return '';
  const candidates = fs.readdirSync(DIST_DIR)
    .filter(name=>/^Fates-Entwined-Setup-.*\.exe$/i.test(name))
    .map(name=>path.join(DIST_DIR, name))
    .sort((a, b)=>fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return candidates[0] || '';
}

function serveFile(res, filePath, downloadName){
  fs.stat(filePath, (err, stat)=>{
    if(err || !stat.isFile()){
      res.writeHead(404, {'content-type':'text/plain; charset=utf-8'});
      res.end('Not found\n');
      return;
    }
    const headers = {
      'content-type':contentTypeFor(filePath),
      'content-length':stat.size,
      'cache-control':downloadName ? 'no-cache' : 'public, max-age=300'
    };
    if(downloadName){
      headers['content-disposition'] = `attachment; filename="${downloadName}"`;
    }
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

function serveWebsiteRequest(req, res){
  const url = new URL(req.url || '/', 'http://localhost');
  let pathname = decodeURIComponent(url.pathname || '/');
  if(pathname === INSTALLER_PUBLIC_PATH){
    const installerPath = latestInstallerPath();
    if(!installerPath){
      res.writeHead(503, {'content-type':'text/plain; charset=utf-8'});
      res.end('Installer has not been built for this deployment.\n');
      return true;
    }
    serveFile(res, installerPath, 'Fates-Entwined-Installer.exe');
    return true;
  }
  if(pathname === '/') pathname = '/index.html';
  const normalized = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const target = path.resolve(WEBSITE_DIR, '.' + normalized);
  if(!target.startsWith(WEBSITE_DIR + path.sep)){
    res.writeHead(403, {'content-type':'text/plain; charset=utf-8'});
    res.end('Forbidden\n');
    return true;
  }
  if(fs.existsSync(target) && fs.statSync(target).isFile()){
    serveFile(res, target);
    return true;
  }
  return false;
}

function base64url(input){
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function base64urlDecode(input){
  const s = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(s + '='.repeat((4 - (s.length % 4)) % 4), 'base64');
}

function send(ws, message){
  if(!ws || ws.destroyed) return;
  const json = safeJson(message);
  const payload = Buffer.from(json);
  const header = [];
  header.push(0x81);
  if(payload.length < 126){
    header.push(payload.length);
  }else if(payload.length < 65536){
    header.push(126, (payload.length >> 8) & 255, payload.length & 255);
  }else{
    header.push(127, 0, 0, 0, 0, (payload.length / 0x1000000) & 255, (payload.length >> 16) & 255, (payload.length >> 8) & 255, payload.length & 255);
  }
  ws.write(Buffer.concat([Buffer.from(header), payload]));
}

function closeSocket(ws, code, reason){
  if(!ws || ws.destroyed) return;
  const reasonBuffer = Buffer.from(String(reason || '').slice(0, 120));
  const payload = Buffer.alloc(2 + reasonBuffer.length);
  payload.writeUInt16BE(code || 1000, 0);
  reasonBuffer.copy(payload, 2);
  ws.write(Buffer.concat([Buffer.from([0x88, payload.length]), payload]));
  ws.end();
}

function makeRoom(code){
  const room = {
    code,
    hostUid:'',
    guestUid:'',
    playerOrder:{0:'', 1:''},
    currentTurnUid:'',
    lastSeq:0,
    lastStateHash:'',
    sockets:new Set(),
    lastTouched:now()
  };
  rooms.set(code, room);
  return room;
}
function getRoom(code){ return rooms.get(code) || makeRoom(code); }
function touch(room){ if(room) room.lastTouched = now(); }

function playerIndexForUid(room, uid){
  if(!room || !uid) return null;
  if(room.playerOrder[0] === uid || room.hostUid === uid) return 0;
  if(room.playerOrder[1] === uid || room.guestUid === uid) return 1;
  return null;
}

function normalizeRoomFromHello(room, hello){
  const snap = hello.room || {};
  room.hostUid = room.hostUid || String(snap.hostUid || hello.hostUid || '');
  room.guestUid = room.guestUid || String(snap.guestUid || hello.guestUid || '');
  room.playerOrder[0] = room.playerOrder[0] || String(snap.playerOrder?.[0] || room.hostUid || '');
  room.playerOrder[1] = room.playerOrder[1] || String(snap.playerOrder?.[1] || room.guestUid || '');
  room.currentTurnUid = room.currentTurnUid || String(snap.currentTurnUid || room.playerOrder[0] || '');
  room.lastSeq = Math.max(room.lastSeq, Number(snap.lastActionSeq || hello.lastSeq || 0) || 0);
  room.lastStateHash = room.lastStateHash || String(hello.stateHash || '');
}

async function fetchFirebaseCerts(){
  if(certCache.certs && certCache.expiresAt > now() + 60000) return certCache.certs;
  const url = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
  const res = await fetch(url);
  if(!res.ok) throw new Error('cert fetch failed: ' + res.status);
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAge = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  const certs = await res.json();
  certCache = { certs, expiresAt: now() + maxAge * 1000 };
  return certs;
}

async function verifyFirebaseToken(idToken){
  if(!REQUIRE_FIREBASE_TOKEN) return { uid:'dev-token-disabled' };
  const parts = String(idToken || '').split('.');
  if(parts.length !== 3) throw new Error('missing Firebase ID token');
  const header = parseJson(base64urlDecode(parts[0]).toString('utf8'));
  const payload = parseJson(base64urlDecode(parts[1]).toString('utf8'));
  if(!header || !payload || !header.kid) throw new Error('invalid Firebase ID token');
  const certs = await fetchFirebaseCerts();
  const cert = certs[header.kid];
  if(!cert) throw new Error('unknown Firebase token key');
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(parts[0] + '.' + parts[1]);
  verifier.end();
  if(!verifier.verify(cert, base64urlDecode(parts[2]))) throw new Error('bad Firebase token signature');
  const expectedIss = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
  const t = Math.floor(now() / 1000);
  if(payload.aud !== FIREBASE_PROJECT_ID) throw new Error('Firebase token audience mismatch');
  if(payload.iss !== expectedIss) throw new Error('Firebase token issuer mismatch');
  if(!payload.sub || payload.sub.length > 128) throw new Error('Firebase token missing subject');
  if(Number(payload.exp || 0) <= t) throw new Error('Firebase token expired');
  if(Number(payload.iat || 0) > t + 300) throw new Error('Firebase token issued in the future');
  return { uid:payload.sub, payload };
}

function getServiceAccount(){
  if(serviceAccountCache !== undefined) return serviceAccountCache;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
  if(raw.trim()){
    serviceAccountCache = parseJson(raw);
  }else if(process.env.GOOGLE_APPLICATION_CREDENTIALS){
    try{
      serviceAccountCache = parseJson(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
    }catch(e){
      serviceAccountCache = null;
    }
  }else{
    serviceAccountCache = null;
  }
  if(serviceAccountCache && serviceAccountCache.private_key){
    serviceAccountCache.private_key = String(serviceAccountCache.private_key).replace(/\\n/g, '\n');
  }
  return serviceAccountCache;
}

function durableWritesAvailable(){
  const sa = getServiceAccount();
  return !!(FIREBASE_DATABASE_URL && sa && sa.client_email && sa.private_key);
}

function shouldUseDurableWrites(){
  if(DURABLE_WRITES_MODE === '0' || DURABLE_WRITES_MODE === 'false' || DURABLE_WRITES_MODE === 'off') return false;
  return durableWritesAvailable();
}

async function getAdminAccessToken(){
  if(adminTokenCache.accessToken && adminTokenCache.expiresAt > now() + 60000) return adminTokenCache.accessToken;
  const sa = getServiceAccount();
  if(!sa || !sa.client_email || !sa.private_key) throw new Error('Firebase service account is not configured');
  const iat = Math.floor(now() / 1000);
  const header = base64url(JSON.stringify({alg:'RS256', typ:'JWT'}));
  const claims = base64url(JSON.stringify({
    iss:sa.client_email,
    scope:'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud:'https://oauth2.googleapis.com/token',
    iat,
    exp:iat + 3600
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(header + '.' + claims);
  signer.end();
  const assertion = header + '.' + claims + '.' + base64url(signer.sign(sa.private_key));
  const body = new URLSearchParams({
    grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},
    body
  });
  if(!res.ok) throw new Error('Firebase admin token request failed: ' + res.status);
  const json = await res.json();
  adminTokenCache = {
    accessToken:String(json.access_token || ''),
    expiresAt:now() + Math.max(60, Number(json.expires_in || 3600) - 60) * 1000
  };
  if(!adminTokenCache.accessToken) throw new Error('Firebase admin token response missing access_token');
  return adminTokenCache.accessToken;
}

function validateAction(room, ws, msg){
  const type = String(msg.type || '').toUpperCase();
  const payload = msg.payload || {};
  const uid = ws.fateUid;
  const playerIndex = playerIndexForUid(room, uid);
  if(playerIndex === null) return 'user is not seated in this room';
  if(type !== 'FORFEIT' && Number(payload.playerIndex) !== playerIndex) return 'player index does not match authenticated user';
  if(type !== 'FORFEIT' && type !== 'CHOOSE_TURN'){
    const turnUid = room.currentTurnUid || room.playerOrder[0];
    if(turnUid && turnUid !== uid) return 'not this player turn';
  }
  if(type === 'CHOOSE_TURN'){
    const winner = Number(payload.playerIndex);
    if(winner !== playerIndex) return 'coin winner mismatch';
  }
  if(!/^(STATE_SYNC|END_TURN|CHOOSE_TURN|START_CONSOLIDATE|CLICK_CELL|BOARD_ACTION|HAND_ACTION|MODAL_ACTION|PICK_CARDS_VISUAL|PICK_ZONE|PICK_AFFILIATION|FORFEIT)$/i.test(type)){
    return 'unknown action type';
  }
  if(type !== 'FORFEIT' && !payload.postState){
    return 'accepted actions must include postState';
  }
  return '';
}

function roomPatchForAction(room, action){
  const payload = action.payload || {};
  const patch = {};
  const nextPlayer = Number(payload.postState?.currentPlayer);
  if(Number.isInteger(nextPlayer) && room.playerOrder[nextPlayer]){
    patch.currentTurnUid = room.playerOrder[nextPlayer];
  }
  if(action.type === 'FORFEIT'){
    patch.status = 'ended';
    patch.phase = 'ended';
    patch.endedBy = action.uid;
    patch.endReason = 'forfeit';
  }
  return patch;
}

function applyRoomPatch(room, patch){
  if(!room || !patch) return;
  if(patch.currentTurnUid) room.currentTurnUid = String(patch.currentTurnUid);
}

async function persistAcceptedActionToFirebase(code, accepted){
  if(!shouldUseDurableWrites()){
    if(REQUIRE_DURABLE_WRITES) throw new Error('Firebase durable writes are required but service account credentials are not configured');
    return false;
  }
  const action = Object.assign({}, accepted.action || {});
  const seq = Number(action.seq || 0) || 0;
  if(!seq) throw new Error('accepted action missing seq');
  action.createdAt = {'.sv':'timestamp'};
  const roomPatch = accepted.roomPatch || {};
  const patch = {
    [`rooms/${code}/actions/${String(seq).padStart(6,'0')}`]: action,
    [`rooms/${code}/lastActionSeq`]: seq,
    [`rooms/${code}/updatedAt`]: {'.sv':'timestamp'}
  };
  Object.keys(roomPatch).forEach(k=>{
    patch[`rooms/${code}/${k}`] = roomPatch[k];
  });
  if(roomPatch.status === 'ended' && !roomPatch.endedAt){
    patch[`rooms/${code}/endedAt`] = {'.sv':'timestamp'};
  }
  const token = await getAdminAccessToken();
  const res = await fetch(`${FIREBASE_DATABASE_URL}/.json?access_token=${encodeURIComponent(token)}`, {
    method:'PATCH',
    headers:{'content-type':'application/json'},
    body:safeJson(patch)
  });
  if(!res.ok){
    const text = await res.text().catch(()=>'');
    throw new Error('Firebase durable action write failed: ' + res.status + (text ? ' ' + text.slice(0, 160) : ''));
  }
  return true;
}

async function firebaseGetJson(path){
  if(!shouldUseDurableWrites()) return null;
  const token = await getAdminAccessToken();
  const cleaned = String(path || '').replace(/^\/+|\/+$/g, '').split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${FIREBASE_DATABASE_URL}/${cleaned}.json?access_token=${encodeURIComponent(token)}`);
  if(!res.ok){
    const text = await res.text().catch(()=>'');
    throw new Error('Firebase read failed: ' + res.status + (text ? ' ' + text.slice(0, 160) : ''));
  }
  return await res.json();
}

function broadcast(room, message){
  for(const client of room.sockets) send(client, message);
}

async function handleHello(ws, msg){
  const code = roomCode(msg.roomCode);
  if(!isRoomCode(code)) throw new Error('invalid room code');
  const verified = await verifyFirebaseToken(msg.idToken);
  const uid = String(msg.uid || verified.uid || '');
  if(verified.uid !== 'dev-token-disabled' && uid !== verified.uid) throw new Error('uid does not match Firebase token');
  const room = getRoom(code);
  if(shouldUseDurableWrites()){
    const durableRoom = await firebaseGetJson(`rooms/${code}`);
    if(!durableRoom) throw new Error('room not found in Firebase');
    normalizeRoomFromHello(room, {room:durableRoom, lastSeq:durableRoom.lastActionSeq || 0, stateHash:msg.stateHash || ''});
  }else{
    normalizeRoomFromHello(room, msg);
  }
  const playerIndex = playerIndexForUid(room, uid);
  if(playerIndex === null) throw new Error('user is not in room player order');
  ws.fateUid = uid;
  ws.fateRoomCode = code;
  ws.fatePlayerIndex = playerIndex;
  room.sockets.add(ws);
  touch(room);
  send(ws, {
    kind:'hello-ok',
    roomCode:code,
    playerIndex,
    lastSeq:room.lastSeq,
    currentTurnUid:room.currentTurnUid,
    serverTime:now()
  });
}

async function handleIntent(ws, msg){
  const code = roomCode(msg.roomCode || ws.fateRoomCode);
  const room = rooms.get(code);
  if(!room || !room.sockets.has(ws)) throw new Error('join room before sending actions');
  touch(room);
  const rejection = validateAction(room, ws, msg);
  if(rejection){
    send(ws, { kind:'rejected', requestId:msg.requestId || '', reason:rejection, serverSeq:room.lastSeq });
    return;
  }
  const nextSeq = room.lastSeq + 1;
  const action = {
    seq:nextSeq,
    uid:ws.fateUid,
    type:String(msg.type || '').toUpperCase(),
    payload:msg.payload || {},
    clientActionId:String(msg.clientActionId || msg.payload?.clientActionId || ''),
    serverAuthoritative:true,
    authority:'fate-ws-authority',
    authorityTime:now()
  };
  const roomPatch = roomPatchForAction(room, action);
  const accepted = { kind:'accepted', requestId:msg.requestId || '', roomCode:code, action, roomPatch, durableWrite:false };
  accepted.durableWrite = await persistAcceptedActionToFirebase(code, accepted);
  room.lastSeq = nextSeq;
  room.lastStateHash = String(action.payload.stateHash || room.lastStateHash || '');
  applyRoomPatch(room, roomPatch);
  broadcast(room, accepted);
}

function handleMessage(ws, data){
  const msg = parseJson(data);
  if(!msg || typeof msg !== 'object'){
    send(ws, {kind:'error', reason:'invalid JSON'});
    return;
  }
  Promise.resolve()
    .then(()=>msg.kind === 'hello' ? handleHello(ws, msg) : handleIntent(ws, msg))
    .catch(err=>{
      send(ws, {kind:'error', requestId:msg.requestId || '', reason:err.message || String(err)});
      if(msg.kind === 'hello') closeSocket(ws, 1008, err.message || 'hello failed');
    });
}

function readFrames(ws, chunk){
  ws.fateBuffer = ws.fateBuffer ? Buffer.concat([ws.fateBuffer, chunk]) : chunk;
  while(ws.fateBuffer && ws.fateBuffer.length >= 2){
    const b0 = ws.fateBuffer[0];
    const opcode = b0 & 0x0f;
    const masked = (ws.fateBuffer[1] & 0x80) !== 0;
    let length = ws.fateBuffer[1] & 0x7f;
    let offset = 2;
    if(length === 126){
      if(ws.fateBuffer.length < 4) return;
      length = ws.fateBuffer.readUInt16BE(2);
      offset = 4;
    }else if(length === 127){
      if(ws.fateBuffer.length < 10) return;
      const high = ws.fateBuffer.readUInt32BE(2);
      const low = ws.fateBuffer.readUInt32BE(6);
      if(high !== 0) return closeSocket(ws, 1009, 'message too large');
      length = low;
      offset = 10;
    }
    if(length > MAX_MESSAGE_BYTES) return closeSocket(ws, 1009, 'message too large');
    const maskOffset = offset;
    if(masked) offset += 4;
    if(ws.fateBuffer.length < offset + length) return;
    let payload = ws.fateBuffer.slice(offset, offset + length);
    if(masked){
      const mask = ws.fateBuffer.slice(maskOffset, maskOffset + 4);
      payload = Buffer.from(payload.map((byte, i)=>byte ^ mask[i % 4]));
    }
    ws.fateBuffer = ws.fateBuffer.slice(offset + length);
    if(opcode === 0x8) return closeSocket(ws, 1000, 'bye');
    if(opcode === 0x9) continue;
    if(opcode !== 0x1) continue;
    handleMessage(ws, payload.toString('utf8'));
  }
}

const server = http.createServer((req, res)=>{
  const requestPath = new URL(req.url || '/', 'http://localhost').pathname;
  if(requestPath === '/health'){
    res.writeHead(200, {'content-type':'application/json'});
    res.end(safeJson({
      ok:true,
      rooms:rooms.size,
      sockets:sockets.size,
      durableWrites:shouldUseDurableWrites(),
      durableWritesRequired:REQUIRE_DURABLE_WRITES,
      time:now()
    }));
    return;
  }
  if(requestPath === '/rooms'){
    res.writeHead(200, {'content-type':'application/json'});
    res.end(safeJson([...rooms.values()].map(r=>({code:r.code, sockets:r.sockets.size, lastSeq:r.lastSeq, currentTurnUid:r.currentTurnUid, lastTouched:r.lastTouched}))));
    return;
  }
  if(serveWebsiteRequest(req, res)) return;
  res.writeHead(200, {'content-type':'text/plain'});
  res.end('Fates Entwined WebSocket authority server\n');
});

server.on('upgrade', (req, socket)=>{
  const key = req.headers['sec-websocket-key'];
  if(!key){
    socket.destroy();
    return;
  }
  const accept = base64urlDecode(base64url(crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest()));
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Accept: ' + accept.toString('base64'),
    '',
    ''
  ].join('\r\n'));
  socket.fateAlive = true;
  sockets.add(socket);
  socket.on('data', chunk=>readFrames(socket, chunk));
  socket.on('close', ()=>cleanupSocket(socket));
  socket.on('error', ()=>cleanupSocket(socket));
});

function cleanupSocket(ws){
  sockets.delete(ws);
  const room = ws.fateRoomCode ? rooms.get(ws.fateRoomCode) : null;
  if(room){
    room.sockets.delete(ws);
    touch(room);
  }
}

setInterval(()=>{
  const cutoff = now() - ROOM_IDLE_MS;
  for(const [code, room] of rooms){
    if(room.sockets.size === 0 && room.lastTouched < cutoff) rooms.delete(code);
  }
  for(const socket of sockets){
    if(socket.destroyed) cleanupSocket(socket);
  }
}, Math.max(30000, Math.min(ROOM_IDLE_MS, 120000)));

setInterval(()=>{
  for(const socket of sockets) send(socket, {kind:'ping', serverTime:now()});
}, PING_MS).unref?.();

server.listen(PORT, HOST, ()=>{
  console.log(`Fates WebSocket authority listening on ${HOST}:${PORT}`);
  console.log(`Firebase token verification: ${REQUIRE_FIREBASE_TOKEN ? 'on' : 'off'} (${FIREBASE_PROJECT_ID})`);
});
