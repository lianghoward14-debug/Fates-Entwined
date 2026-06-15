#!/usr/bin/env node
/*
 * Fates Entwined WebSocket authority server.
 *
 * This server owns online-match action ordering and basic turn validation. It is
 * intentionally dependency-free so it can run on small hosts without an install
 * step. Firebase durable writes are optional: Fly can keep room action history
 * in memory so RTDB outages or emergency lockouts do not force live matches back
 * onto client-written action logs.
 */
'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  reduceServerAction
} = require('./fate-authority-reducer');
const {getCardCatalog} = require('./fate-card-catalog');
const {buildInitialAuthorityState} = require('./fate-authority-bootstrap');

const PORT = Number(process.env.PORT || process.env.FATE_WS_PORT || 8787);
const HOST = process.env.HOST || process.env.FATE_WS_HOST || '0.0.0.0';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'fates-entwined-41491';
const FIREBASE_DATABASE_URL = String(process.env.FIREBASE_DATABASE_URL || 'https://fates-entwined-41491-default-rtdb.firebaseio.com').replace(/\/+$/, '');
const REQUIRE_FIREBASE_TOKEN = process.env.FATE_WS_REQUIRE_TOKEN !== '0';
const DURABLE_WRITES_MODE = String(process.env.FATE_WS_DURABLE_WRITES || 'auto').toLowerCase();
const REQUIRE_DURABLE_WRITES = process.env.FATE_WS_REQUIRE_DURABLE_WRITES === '1';
const MAX_MESSAGE_BYTES = 512 * 1024;
const MAX_HTTP_BODY_BYTES = 256 * 1024;
const MAX_ROOM_EVENTS = Number(process.env.FATE_WS_MAX_ROOM_EVENTS || 1200);
const ROOM_IDLE_MS = Number(process.env.FATE_WS_ROOM_IDLE_MS || 1000 * 60 * 90);
const PING_MS = Number(process.env.FATE_WS_PING_MS || 25000);
const FLY_DATA_DIR = String(process.env.FATE_WS_DATA_DIR || '').trim();
const FLY_STORE_ENABLED = process.env.FATE_WS_FLY_STORE !== '0' && !!FLY_DATA_DIR;
const REQUIRE_FLY_STORE = process.env.FATE_WS_REQUIRE_FLY_STORE === '1';
const STATE_GATE_ENABLED = process.env.FATE_WS_STATE_GATE !== '0';
const REDUCER_MODE = String(process.env.FATE_WS_REDUCER_MODE || 'turns').toLowerCase();
const APP_ROOT = path.resolve(__dirname, '..');
const WEBSITE_DIR = path.join(APP_ROOT, 'fates-entwined-website');
const DIST_DIR = path.join(APP_ROOT, 'dist');
const INSTALLER_PUBLIC_PATH = '/installer/Fates-Entwined-Installer.exe';

const rooms = new Map();
const sockets = new Set();
let certCache = { expiresAt: 0, certs: null };
let serviceAccountCache = undefined;
let adminTokenCache = { expiresAt: 0, accessToken: '' };
let flyStoreReady = false;
let cardCatalogCache = null;

function now(){ return Date.now(); }
function roomCode(value){ return String(value || '').trim().toUpperCase(); }
function isRoomCode(value){ return /^[A-Z0-9]{6}$/.test(String(value || '')); }
function safeJson(value){ try{ return JSON.stringify(value); }catch(e){ return 'null'; } }
function parseJson(value){ try{ return JSON.parse(value); }catch(e){ return null; } }

function authorityCardCatalog(){
  if(cardCatalogCache) return cardCatalogCache;
  cardCatalogCache = getCardCatalog();
  return cardCatalogCache;
}

function flyStorePath(name){
  return path.join(FLY_DATA_DIR, name);
}

function ensureFlyStore(){
  if(REQUIRE_FLY_STORE && !FLY_DATA_DIR) throw new Error('FATE_WS_REQUIRE_FLY_STORE=1 but FATE_WS_DATA_DIR is not configured');
  if(!FLY_STORE_ENABLED || flyStoreReady) return flyStoreReady;
  fs.mkdirSync(FLY_DATA_DIR, {recursive:true});
  flyStoreReady = true;
  return true;
}

function roomToDurable(room){
  if(!room) return null;
  return {
    code:room.code,
    hostUid:room.hostUid || '',
    guestUid:room.guestUid || '',
    playerOrder:room.playerOrder || {0:'', 1:''},
    players:room.players || {},
    mode:room.mode || 'freeplay',
    status:room.status || 'lobby',
    phase:room.phase || 'lobby',
    currentTurnUid:room.currentTurnUid || '',
    lastSeq:Number(room.lastSeq || 0) || 0,
    lastStateHash:room.lastStateHash || '',
    canonicalState:room.canonicalState || null,
    canonicalHash:room.canonicalHash || '',
    eventLog:Array.isArray(room.eventLog) ? room.eventLog.slice(-MAX_ROOM_EVENTS) : [],
    chat:Array.isArray(room.chat) ? room.chat.slice(-100) : [],
    seed:room.seed || '',
    song:room.song || '',
    startedAt:room.startedAt || 0,
    endedAt:room.endedAt || 0,
    endedBy:room.endedBy || '',
    endReason:room.endReason || '',
    winnerUid:room.winnerUid || '',
    loserUid:room.loserUid || '',
    winnerIndex:Number.isInteger(Number(room.winnerIndex)) ? Number(room.winnerIndex) : null,
    loserIndex:Number.isInteger(Number(room.loserIndex)) ? Number(room.loserIndex) : null,
    createdAt:room.createdAt || now(),
    updatedAt:room.updatedAt || now(),
    lastTouched:room.lastTouched || now()
  };
}

function hydrateRoomFromDurable(data){
  if(!data || !isRoomCode(data.code)) return null;
  const room = Object.assign(makeRoom(data.code), roomToDurable(data), {
    sockets:new Set()
  });
  rooms.set(room.code, room);
  return room;
}

function writeAtomicJson(filePath, value){
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, safeJson(value));
  fs.renameSync(tmpPath, filePath);
}

function persistFlyRoomsSnapshot(){
  if(!ensureFlyStore()) return false;
  const payload = {
    schemaVersion:1,
    savedAt:now(),
    rooms:[...rooms.values()].map(roomToDurable).filter(Boolean)
  };
  writeAtomicJson(flyStorePath('rooms.json'), payload);
  return true;
}

function appendFlyEvent(code, accepted){
  if(!ensureFlyStore() || !accepted?.action) return false;
  const line = safeJson({schemaVersion:1, savedAt:now(), code, accepted}) + '\n';
  fs.appendFileSync(flyStorePath('events.jsonl'), line);
  return true;
}

function loadFlyRoomsSnapshot(){
  if(!ensureFlyStore()) return 0;
  const filePath = flyStorePath('rooms.json');
  if(!fs.existsSync(filePath)) return 0;
  const parsed = parseJson(fs.readFileSync(filePath, 'utf8'));
  const storedRooms = Array.isArray(parsed?.rooms) ? parsed.rooms : [];
  let count = 0;
  storedRooms.forEach(item=>{
    if(hydrateRoomFromDurable(item)) count += 1;
  });
  return count;
}

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
  const t = now();
  const room = {
    code,
    hostUid:'',
    guestUid:'',
    playerOrder:{0:'', 1:''},
    players:{},
    mode:'freeplay',
    status:'lobby',
    phase:'lobby',
    currentTurnUid:'',
    lastSeq:0,
    lastStateHash:'',
    canonicalState:null,
    canonicalHash:'',
    eventLog:[],
    chat:[],
    sockets:new Set(),
    createdAt:t,
    updatedAt:t,
    lastTouched:t
  };
  rooms.set(code, room);
  return room;
}
function getRoom(code){ return rooms.get(code) || makeRoom(code); }
function touch(room){ if(room) room.lastTouched = room.updatedAt = now(); }

function generateRoomCode(){
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for(let attempt = 0; attempt < 80; attempt += 1){
    let code = '';
    for(let i = 0; i < 6; i += 1) code += alphabet[crypto.randomInt(alphabet.length)];
    if(!rooms.has(code)) return code;
  }
  throw new Error('could not allocate room code');
}

function sanitizeProfile(value){
  const profile = value && typeof value === 'object' ? value : {};
  return {
    displayName:String(profile.displayName || profile.username || profile.name || 'Player').slice(0, 32),
    username:String(profile.username || profile.displayName || profile.name || '').slice(0, 32),
    avatar:String(profile.avatar || profile.avatarId || '').slice(0, 80),
    title:String(profile.title || '').slice(0, 80)
  };
}

function sanitizeDeckChoice(value){
  const deck = value && typeof value === 'object' ? value : {};
  const rawDeckIds = Array.isArray(deck.deckIds) ? deck.deckIds : (Array.isArray(deck.ids) ? deck.ids : []);
  const deckIds = rawDeckIds.length === 40 ? rawDeckIds.map(id=>String(id || '').slice(0, 120)) : [];
  return {
    deckId:String(deck.deckId || deck.id || '').slice(0, 120),
    selectedDeckKey:String(deck.selectedDeckKey || deck.key || '').slice(0, 120),
    name:String(deck.name || deck.deckName || 'Selected Deck').slice(0, 80),
    deckIds,
    ready:!!deck.ready || deckIds.length === 40
  };
}

function publicPlayer(player){
  if(!player) return null;
  const deckChoice = player.deckChoice || {};
  const preload = player.matchPreload || {};
  return {
    uid:player.uid,
    role:player.role || '',
    connected:!!player.connected,
    joinedAt:player.joinedAt || 0,
    lastSeen:player.lastSeen || 0,
    profile:player.profile || sanitizeProfile(null),
    deckChoice:{
      name:String(deckChoice.name || '').slice(0, 80),
      selectedDeckKey:String(deckChoice.selectedDeckKey || '').slice(0, 120),
      deckCount:Array.isArray(deckChoice.deckIds) ? deckChoice.deckIds.length : 0,
      ready:!!deckChoice.ready
    },
    matchPreload:{
      ready:!!preload.ready,
      matchKey:String(preload.matchKey || '').slice(0, 180),
      cards:Number(preload.cards || 0) || 0,
      ms:Number(preload.ms || 0) || 0,
      texturePending:Number(preload.texturePending || 0) || 0,
      textureFailed:Number(preload.textureFailed || 0) || 0,
      clientAt:Number(preload.clientAt || 0) || 0,
      serverAt:Number(preload.serverAt || 0) || 0
    }
  };
}

function publicRoom(room){
  const players = {};
  Object.keys(room.players || {}).forEach(uid=>{
    players[uid] = publicPlayer(room.players[uid]);
  });
  return {
    code:room.code,
    mode:room.mode,
    status:room.status,
    phase:room.phase,
    hostUid:room.hostUid,
    guestUid:room.guestUid,
    playerOrder:room.playerOrder,
    currentTurnUid:room.currentTurnUid,
    lastActionSeq:room.lastSeq,
    canonicalHash:room.canonicalHash || '',
    seed:room.seed || '',
    song:room.song || '',
    startedAt:room.startedAt || 0,
    endedAt:room.endedAt || 0,
    endReason:room.endReason || '',
    winnerUid:room.winnerUid || '',
    loserUid:room.loserUid || '',
    winnerIndex:Number.isInteger(Number(room.winnerIndex)) ? Number(room.winnerIndex) : null,
    loserIndex:Number.isInteger(Number(room.loserIndex)) ? Number(room.loserIndex) : null,
    eventCount:room.eventLog.length,
    sockets:room.sockets.size,
    createdAt:room.createdAt,
    updatedAt:room.updatedAt,
    lastTouched:room.lastTouched,
    players
  };
}

function upsertRoomPlayer(room, uid, role, profile, deckChoice){
  if(!room || !uid) return null;
  const existing = room.players[uid] || {};
  const player = Object.assign({}, existing, {
    uid,
    role:role || existing.role || '',
    connected:existing.connected || false,
    joinedAt:existing.joinedAt || now(),
    lastSeen:now(),
    profile:sanitizeProfile(profile || existing.profile),
    deckChoice:sanitizeDeckChoice(deckChoice || existing.deckChoice)
  });
  room.players[uid] = player;
  return player;
}

function setRoomPlayerPreload(room, uid, preload){
  if(!room || !uid || !room.players[uid]) return null;
  const src = preload && typeof preload === 'object' ? preload : {};
  room.players[uid].matchPreload = {
    ready:!!src.ready,
    roomCode:String(src.roomCode || room.code || '').slice(0, 16),
    uid,
    matchKey:String(src.matchKey || '').slice(0, 180),
    cards:Number(src.cards || 0) || 0,
    ms:Number(src.ms || 0) || 0,
    texturePending:Number(src.texturePending || 0) || 0,
    textureFailed:Number(src.textureFailed || 0) || 0,
    clientAt:Number(src.clientAt || 0) || 0,
    serverAt:now()
  };
  touch(room);
  return room.players[uid].matchPreload;
}

function playerIndexForUid(room, uid){
  if(!room || !uid) return null;
  if(room.playerOrder[0] === uid || room.hostUid === uid) return 0;
  if(room.playerOrder[1] === uid || room.guestUid === uid) return 1;
  return null;
}

function normalizeRoomFromHello(room, hello){
  const snap = hello.room || {};
  const hostUid = String(snap.hostUid || hello.hostUid || room.hostUid || '');
  const guestUid = String(snap.guestUid || hello.guestUid || room.guestUid || '');
  if(hostUid) room.hostUid = hostUid;
  if(guestUid) room.guestUid = guestUid;
  const order0 = String(snap.playerOrder?.[0] || hello.playerOrder?.[0] || room.playerOrder[0] || room.hostUid || '');
  const order1 = String(snap.playerOrder?.[1] || hello.playerOrder?.[1] || room.playerOrder[1] || room.guestUid || '');
  if(order0) room.playerOrder[0] = order0;
  if(order1) room.playerOrder[1] = order1;
  const currentTurnUid = String(snap.currentTurnUid || hello.currentTurnUid || room.currentTurnUid || room.playerOrder[0] || '');
  if(currentTurnUid) room.currentTurnUid = currentTurnUid;
  room.lastSeq = Math.max(room.lastSeq, Number(snap.lastActionSeq || hello.lastSeq || 0) || 0);
  room.lastStateHash = room.lastStateHash || String(hello.stateHash || '');
  if(hostUid) upsertRoomPlayer(room, hostUid, 'host', snap.players?.[hostUid]?.profile, snap.players?.[hostUid]?.deckChoice);
  if(guestUid) upsertRoomPlayer(room, guestUid, 'guest', snap.players?.[guestUid]?.profile, snap.players?.[guestUid]?.deckChoice);
  if(snap.status) room.status = String(snap.status).slice(0, 32);
  if(snap.phase) room.phase = String(snap.phase).slice(0, 32);
  if(snap.mode) room.mode = String(snap.mode).slice(0, 32);
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
  if(room.status === 'ended') return 'room already ended';
  if(type === 'FORFEIT'){
    msg.payload = Object.assign({}, payload, {playerIndex});
  }
  if(type !== 'FORFEIT' && Number(payload.playerIndex) !== playerIndex) return 'player index does not match authenticated user';
  if(type !== 'FORFEIT' && type !== 'CHOOSE_TURN' && type !== 'STATE_SYNC'){
    const turnUid = room.currentTurnUid || room.playerOrder[0];
    if(turnUid && turnUid !== uid) return 'not this player turn';
  }
  if(type === 'CHOOSE_TURN'){
    const winner = Number(payload.playerIndex);
    if(winner !== playerIndex) return 'coin winner mismatch';
  }
  if(!/^(STATE_SYNC|END_TURN|CHOOSE_TURN|START_CONSOLIDATE|CLICK_CELL|BOARD_ACTION|HAND_ACTION|MODAL_ACTION|PICK_CARDS_VISUAL|PICK_ZONE|PICK_AFFILIATION|PICK_LANDSCAPE_ZONE|EFFECT_CINEMATIC|FORFEIT)$/i.test(type)){
    return 'unknown action type';
  }
  if(type !== 'FORFEIT' && !payload.postState){
    return 'accepted actions must include postState';
  }
  return '';
}

function validateAuthorityStateGate(room, msg){
  if(!STATE_GATE_ENABLED) return {ok:true};
  const result = reduceServerAction(room, msg, {
    mode:REDUCER_MODE,
    requireBaseHash:true,
    allowStateSyncAfterBootstrap:REDUCER_MODE !== 'strict',
    allowClientBootstrap:REDUCER_MODE !== 'strict',
    requireCatalogForCards:REDUCER_MODE === 'strict',
    cardCatalog:authorityCardCatalog()
  });
  if(!result.ok) return result;
  return result;
}

function applyAuthorityStateGate(room, gateResult){
  if(!STATE_GATE_ENABLED || !gateResult?.ok || !gateResult.canonicalState || !gateResult.canonicalHash) return;
  room.canonicalState = gateResult.canonicalState;
  room.canonicalHash = gateResult.canonicalHash;
  room.lastStateHash = gateResult.canonicalHash;
}

function roomPatchForAction(room, action){
  const payload = action.payload || {};
  const patch = {};
  const nextPlayer = Number(payload.postState?.currentPlayer);
  if(Number.isInteger(nextPlayer) && room.playerOrder[nextPlayer]){
    patch.currentTurnUid = room.playerOrder[nextPlayer];
  }
  if(action.type === 'FORFEIT'){
    const loserIndex = Number(payload.playerIndex);
    const winnerIndex = loserIndex === 0 ? 1 : 0;
    patch.status = 'ended';
    patch.phase = 'ended';
    patch.endedBy = action.uid;
    patch.endReason = 'forfeit';
    patch.endedAt = now();
    patch.loserIndex = loserIndex;
    patch.winnerIndex = winnerIndex;
    patch.loserUid = room.playerOrder[loserIndex] || action.uid;
    patch.winnerUid = room.playerOrder[winnerIndex] || '';
  }
  return patch;
}

function applyRoomPatch(room, patch){
  if(!room || !patch) return;
  if(patch.currentTurnUid) room.currentTurnUid = String(patch.currentTurnUid);
  if(patch.status) room.status = String(patch.status).slice(0, 32);
  if(patch.phase) room.phase = String(patch.phase).slice(0, 32);
  if(patch.endedBy) room.endedBy = String(patch.endedBy).slice(0, 128);
  if(patch.endReason) room.endReason = String(patch.endReason).slice(0, 80);
  if(patch.winnerUid !== undefined) room.winnerUid = String(patch.winnerUid || '').slice(0, 128);
  if(patch.loserUid !== undefined) room.loserUid = String(patch.loserUid || '').slice(0, 128);
  if(patch.winnerIndex !== undefined) room.winnerIndex = Number(patch.winnerIndex);
  if(patch.loserIndex !== undefined) room.loserIndex = Number(patch.loserIndex);
  if(patch.seed) room.seed = String(patch.seed).slice(0, 160);
  if(patch.song !== undefined) room.song = String(patch.song || '').slice(0, 160);
  if(patch.startedAt) room.startedAt = Number(patch.startedAt) || now();
  if(patch.endedAt) room.endedAt = Number(patch.endedAt) || now();
  room.updatedAt = now();
}

function appendRoomEvent(room, accepted){
  if(!room || !accepted?.action) return;
  room.eventLog.push(accepted);
  if(room.eventLog.length > MAX_ROOM_EVENTS){
    room.eventLog.splice(0, room.eventLog.length - MAX_ROOM_EVENTS);
  }
  room.updatedAt = now();
  try{
    appendFlyEvent(room.code, accepted);
    persistFlyRoomsSnapshot();
  }catch(e){
    console.error('Fly durable event persist failed:', e.message || e);
  }
}

function persistFlyRoomMutation(){
  try{
    persistFlyRoomsSnapshot();
  }catch(e){
    console.error('Fly durable room persist failed:', e.message || e);
  }
}

async function startRoomOnFly(room, uid, body){
  if(!room) throw new Error('room not found');
  if(room.hostUid !== uid) throw new Error('only host can start');
  const existing = room.eventLog.find(item=>String(item?.action?.type || '').toUpperCase() === 'MATCH_START');
  if(existing) return existing;
  if(room.status !== 'lobby') throw new Error('room already started');
  if(!room.hostUid || !room.guestUid) throw new Error('waiting for guest');
  const hostNode = room.players[room.hostUid];
  const guestNode = room.players[room.guestUid];
  const hostDeck = hostNode?.deckChoice?.deckIds || [];
  const guestDeck = guestNode?.deckChoice?.deckIds || [];
  if(!Array.isArray(hostDeck) || hostDeck.length !== 40 || !Array.isArray(guestDeck) || guestDeck.length !== 40){
    throw new Error('both players need a 40-card deck');
  }
  const seq = room.lastSeq + 1;
  const seed = String(body?.seed || `${room.code}_${now()}_${crypto.randomBytes(4).toString('hex')}`).slice(0, 160);
  const song = String(body?.song || '').slice(0, 160);
  const roomMode = String(room.mode || body?.mode || 'freeplay').slice(0, 32);
  const initial = buildInitialAuthorityState({
    catalog:authorityCardCatalog(),
    seed,
    decks:{0:hostDeck, 1:guestDeck}
  });
  const roomPatch = {
    status:'matchup',
    phase:'matchup',
    startedAt:now(),
    updatedAt:now(),
    seed,
    song,
    currentTurnUid:room.hostUid
  };
  const action = {
    seq,
    uid,
    type:'MATCH_START',
    payload:{
      seed,
      song,
      hostUid:room.hostUid,
      guestUid:room.guestUid,
      mode:roomMode,
      profiles:{0:hostNode.profile || {}, 1:guestNode.profile || {}},
      decks:{0:[...hostDeck], 1:[...guestDeck]},
      deckNames:{0:hostNode.deckChoice?.name || 'Host Deck', 1:guestNode.deckChoice?.name || 'Guest Deck'},
      postState:initial.state,
      stateHash:initial.stateHash,
      serverBootstrapped:true
    },
    serverAuthoritative:true,
    authority:'fate-ws-authority',
    authorityTime:now()
  };
  const accepted = {kind:'accepted', requestId:String(body?.requestId || ''), roomCode:room.code, action, roomPatch, durableWrite:false, flyEventLog:true};
  accepted.durableWrite = await persistAcceptedActionToFirebase(room.code, accepted);
  room.lastSeq = seq;
  room.lastStateHash = initial.stateHash;
  room.canonicalState = initial.state;
  room.canonicalHash = initial.stateHash;
  room.seed = seed;
  room.song = song;
  applyRoomPatch(room, roomPatch);
  appendRoomEvent(room, accepted);
  broadcast(room, accepted);
  return accepted;
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
    const helloRoom = msg.room && typeof msg.room === 'object' ? msg.room : {};
    const mergedRoom = Object.assign({}, durableRoom);
    if(Number(helloRoom.lastActionSeq || 0) >= Number(durableRoom.lastActionSeq || 0)){
      if(helloRoom.currentTurnUid) mergedRoom.currentTurnUid = helloRoom.currentTurnUid;
      if(helloRoom.playerOrder) mergedRoom.playerOrder = helloRoom.playerOrder;
    }
    normalizeRoomFromHello(room, {room:mergedRoom, lastSeq:durableRoom.lastActionSeq || 0, stateHash:msg.stateHash || ''});
  }else{
    normalizeRoomFromHello(room, msg);
  }
  const playerIndex = playerIndexForUid(room, uid);
  if(playerIndex === null) throw new Error('user is not in room player order');
  ws.fateUid = uid;
  ws.fateRoomCode = code;
  ws.fatePlayerIndex = playerIndex;
  room.sockets.add(ws);
  if(room.players[uid]){
    room.players[uid].connected = true;
    room.players[uid].lastSeen = now();
  }
  touch(room);
  send(ws, {
    kind:'hello-ok',
    roomCode:code,
    playerIndex,
    lastSeq:room.lastSeq,
    currentTurnUid:room.currentTurnUid,
    flyEventLog:true,
    protocolVersion:2,
    serverStateHash:room.canonicalHash || room.lastStateHash || '',
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
  const gateResult = validateAuthorityStateGate(room, msg);
  if(!gateResult.ok){
    send(ws, {
      kind:'rejected',
      requestId:msg.requestId || '',
      reason:gateResult.reason || 'state transition rejected',
      serverSeq:room.lastSeq,
      serverStateHash:room.canonicalHash || room.lastStateHash || ''
    });
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
  if(gateResult.serverReduced && gateResult.canonicalState && gateResult.canonicalHash){
    action.payload = Object.assign({}, action.payload || {}, {
      postState:gateResult.canonicalState,
      stateHash:gateResult.canonicalHash,
      serverReduced:true,
      reducerMode:REDUCER_MODE
    });
  }
  const roomPatch = roomPatchForAction(room, action);
  const accepted = { kind:'accepted', requestId:msg.requestId || '', roomCode:code, action, roomPatch, durableWrite:false, flyEventLog:true };
  accepted.durableWrite = await persistAcceptedActionToFirebase(code, accepted);
  room.lastSeq = nextSeq;
  applyAuthorityStateGate(room, gateResult);
  room.lastStateHash = String(room.canonicalHash || action.payload.stateHash || room.lastStateHash || '');
  accepted.serverStateHash = room.canonicalHash || room.lastStateHash || '';
  applyRoomPatch(room, roomPatch);
  appendRoomEvent(room, accepted);
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

function setCors(res){
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type,authorization');
  res.setHeader('access-control-max-age', '600');
}

function writeJson(res, status, value){
  setCors(res);
  res.writeHead(status, {'content-type':'application/json; charset=utf-8'});
  res.end(safeJson(value));
}

function readJsonBody(req){
  return new Promise((resolve, reject)=>{
    let body = '';
    req.on('data', chunk=>{
      body += chunk.toString('utf8');
      if(Buffer.byteLength(body) > MAX_HTTP_BODY_BYTES){
        reject(new Error('request body too large'));
        req.destroy();
      }
    });
    req.on('end', ()=>{
      if(!body.trim()) return resolve({});
      const parsed = parseJson(body);
      if(!parsed || typeof parsed !== 'object') return reject(new Error('invalid JSON body'));
      resolve(parsed);
    });
    req.on('error', reject);
  });
}

function bearerToken(req, body){
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : String(body?.idToken || '');
}

async function verifyRequestUser(req, body){
  const verified = await verifyFirebaseToken(bearerToken(req, body));
  const uid = String(body?.uid || verified.uid || '');
  if(verified.uid !== 'dev-token-disabled' && uid !== verified.uid) throw new Error('uid does not match Firebase token');
  if(!uid) throw new Error('missing uid');
  return uid;
}

function apiError(res, err, status){
  writeJson(res, status || 400, {ok:false, error:err.message || String(err)});
}

async function requireSeatedRequestUser(req, room){
  if(!REQUIRE_FIREBASE_TOKEN) return 'dev-token-disabled';
  const uid = await verifyRequestUser(req, {});
  if(playerIndexForUid(room, uid) === null) throw new Error('user is not seated in this room');
  return uid;
}

async function handleApiRequest(req, res, url){
  setCors(res);
  if(req.method === 'OPTIONS'){
    res.writeHead(204);
    res.end();
    return true;
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if(parts[0] !== 'api') return false;
  try{
    if(req.method === 'GET' && parts.length === 1){
      writeJson(res, 200, {
        ok:true,
        protocolVersion:2,
        capabilities:{
          flyRoomMemory:true,
          flyActionReplay:true,
          flyDurableStore:FLY_STORE_ENABLED,
          flyDurableStoreReady:flyStoreReady,
          stateGate:STATE_GATE_ENABLED,
          reducerMode:REDUCER_MODE,
          cardCatalog:true,
          cardCatalogSize:authorityCardCatalog().cards.length,
          firebaseDurableWrites:shouldUseDurableWrites(),
          firebaseDurableWritesRequired:REQUIRE_DURABLE_WRITES
        },
        time:now()
      });
      return true;
    }
    if(req.method === 'POST' && parts[1] === 'rooms' && parts.length === 2){
      const body = await readJsonBody(req);
      const uid = await verifyRequestUser(req, body);
      const code = generateRoomCode();
      const room = getRoom(code);
      room.mode = String(body.mode || 'freeplay').slice(0, 32);
      room.status = 'lobby';
      room.phase = 'lobby';
      room.hostUid = uid;
      room.playerOrder[0] = uid;
      const player = upsertRoomPlayer(room, uid, 'host', body.profile, body.deckChoice);
      if(player) player.connected = true;
      touch(room);
      persistFlyRoomMutation();
      writeJson(res, 200, {ok:true, room:publicRoom(room)});
      return true;
    }
    if(parts[1] === 'rooms' && isRoomCode(parts[2])){
      const room = rooms.get(roomCode(parts[2]));
      if(!room){
        writeJson(res, 404, {ok:false, error:'room not found'});
        return true;
      }
      if(req.method === 'GET' && parts.length === 3){
        await requireSeatedRequestUser(req, room);
        writeJson(res, 200, {ok:true, room:publicRoom(room)});
        return true;
      }
      if(req.method === 'GET' && parts[3] === 'events'){
        await requireSeatedRequestUser(req, room);
        const after = Math.max(0, Number(url.searchParams.get('after') || 0) || 0);
        const limit = Math.min(300, Math.max(1, Number(url.searchParams.get('limit') || 300) || 300));
        const events = room.eventLog
          .filter(item=>Number(item?.action?.seq || 0) > after)
          .slice(0, limit);
        writeJson(res, 200, {ok:true, roomCode:room.code, lastSeq:room.lastSeq, events});
        return true;
      }
      if(req.method === 'POST' && parts[3] === 'join'){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        if(room.guestUid && room.guestUid !== uid && room.hostUid !== uid) throw new Error('room is already full');
        if(uid !== room.hostUid){
          room.guestUid = uid;
          room.playerOrder[1] = uid;
        }
        const player = upsertRoomPlayer(room, uid, uid === room.hostUid ? 'host' : 'guest', body.profile, body.deckChoice);
        if(player) player.connected = true;
        touch(room);
        persistFlyRoomMutation();
        writeJson(res, 200, {ok:true, room:publicRoom(room)});
        return true;
      }
      if(req.method === 'POST' && parts[3] === 'player'){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        if(playerIndexForUid(room, uid) === null) throw new Error('user is not seated in this room');
        const player = upsertRoomPlayer(room, uid, uid === room.hostUid ? 'host' : 'guest', body.profile, body.deckChoice);
        if(player) player.connected = true;
        touch(room);
        persistFlyRoomMutation();
        writeJson(res, 200, {ok:true, room:publicRoom(room)});
        return true;
      }
      if(req.method === 'POST' && parts[3] === 'preload'){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        if(playerIndexForUid(room, uid) === null) throw new Error('user is not seated in this room');
        setRoomPlayerPreload(room, uid, body.matchPreload || body);
        persistFlyRoomMutation();
        writeJson(res, 200, {ok:true, room:publicRoom(room)});
        return true;
      }
      if(req.method === 'POST' && parts[3] === 'start'){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        const accepted = await startRoomOnFly(room, uid, body);
        writeJson(res, 200, {ok:true, room:publicRoom(room), accepted});
        return true;
      }
    }
    writeJson(res, 404, {ok:false, error:'unknown api route'});
    return true;
  }catch(err){
    apiError(res, err, /token|uid|seated|full/i.test(err.message || '') ? 403 : 400);
    return true;
  }
}

const server = http.createServer((req, res)=>{
  const requestUrl = new URL(req.url || '/', 'http://localhost');
  const requestPath = requestUrl.pathname;
  if(requestPath === '/api' || requestPath.startsWith('/api/')){
    handleApiRequest(req, res, requestUrl).catch(err=>apiError(res, err, 500));
    return;
  }
  if(requestPath === '/health'){
    setCors(res);
    res.writeHead(200, {'content-type':'application/json'});
    res.end(safeJson({
      ok:true,
      rooms:rooms.size,
      sockets:sockets.size,
      protocolVersion:2,
      flyRoomMemory:true,
      flyActionReplay:true,
      flyDurableStore:FLY_STORE_ENABLED,
      flyDurableStoreReady:flyStoreReady,
      flyDataDir:FLY_STORE_ENABLED ? FLY_DATA_DIR : '',
      stateGate:STATE_GATE_ENABLED,
      reducerMode:REDUCER_MODE,
      cardCatalog:true,
      cardCatalogSize:authorityCardCatalog().cards.length,
      durableWrites:shouldUseDurableWrites(),
      durableWritesRequired:REQUIRE_DURABLE_WRITES,
      time:now()
    }));
    return;
  }
  if(requestPath === '/rooms'){
    setCors(res);
    res.writeHead(200, {'content-type':'application/json'});
    res.end(safeJson([...rooms.values()].map(publicRoom)));
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
    const stillConnected = ws.fateUid
      ? [...room.sockets].some(client=>client !== ws && !client.destroyed && client.fateUid === ws.fateUid)
      : false;
    const player = ws.fateUid ? room.players[ws.fateUid] : null;
    if(player){
      player.connected = stillConnected;
      player.lastSeen = now();
    }
    touch(room);
    persistFlyRoomMutation();
  }
}

setInterval(()=>{
  const cutoff = now() - ROOM_IDLE_MS;
  let deleted = false;
  for(const [code, room] of rooms){
    if(room.sockets.size === 0 && room.lastTouched < cutoff){
      rooms.delete(code);
      deleted = true;
    }
  }
  if(deleted) persistFlyRoomMutation();
  for(const socket of sockets){
    if(socket.destroyed) cleanupSocket(socket);
  }
}, Math.max(30000, Math.min(ROOM_IDLE_MS, 120000)));

setInterval(()=>{
  for(const socket of sockets) send(socket, {kind:'ping', serverTime:now()});
}, PING_MS).unref?.();

try{
  const restoredRooms = loadFlyRoomsSnapshot();
  if(FLY_STORE_ENABLED){
    console.log(`Fly durable store: on (${FLY_DATA_DIR}); restored rooms=${restoredRooms}`);
  }else{
    console.log('Fly durable store: off (set FATE_WS_DATA_DIR to enable volume-backed replay)');
  }
}catch(e){
  console.error('Fly durable store startup failed:', e.message || e);
  if(REQUIRE_FLY_STORE) process.exit(1);
}

server.listen(PORT, HOST, ()=>{
  console.log(`Fates WebSocket authority listening on ${HOST}:${PORT}`);
  console.log(`Firebase token verification: ${REQUIRE_FIREBASE_TOKEN ? 'on' : 'off'} (${FIREBASE_PROJECT_ID})`);
});
