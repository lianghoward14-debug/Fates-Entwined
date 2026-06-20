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
const FIREBASE_RTDB_DISABLED = process.env.FATE_WS_DISABLE_FIREBASE_RTDB === '1'
  || process.env.FATE_RTDB_DISABLED === '1'
  || process.env.FIREBASE_RTDB_DISABLED === '1';
const DURABLE_WRITES_MODE = String(process.env.FATE_WS_DURABLE_WRITES || 'auto').toLowerCase();
const REQUIRE_DURABLE_WRITES = process.env.FATE_WS_REQUIRE_DURABLE_WRITES === '1';
const PERSIST_RESULT_LEDGER = process.env.FATE_WS_PERSIST_RESULT_LEDGER !== '0';
const MAX_MESSAGE_BYTES = 512 * 1024;
const MAX_HTTP_BODY_BYTES = 1024 * 1024;
const MAX_ROOM_EVENTS = Number(process.env.FATE_WS_MAX_ROOM_EVENTS || 1200);
const ROOM_IDLE_MS = Number(process.env.FATE_WS_ROOM_IDLE_MS || 1000 * 60 * 90);
const PING_MS = Number(process.env.FATE_WS_PING_MS || 25000);
const DISCONNECT_TIMEOUT_MS = Number(process.env.FATE_WS_DISCONNECT_TIMEOUT_MS || 30000);
const REACTION_TIMEOUT_MS = Number(process.env.FATE_WS_REACTION_TIMEOUT_MS || 16000);
const SHUTDOWN_GRACE_MS = Number(process.env.FATE_WS_SHUTDOWN_GRACE_MS || 4500);
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
const matchmaking = new Map();
const flyPlayerStats = new Map();
const flyMatchResults = new Map();
const flyParties = new Map();
const flyPartyInvites = new Map();
const flyWorldChat = [];
const flyMarketplaceListings = new Map();
const flyPublicDecks = new Map();
const flyPlayerSaves = new Map();
const flyFriends = new Map();
const flyFriendRequests = new Map();
const flyPrivateThreads = new Map();
const flyPrivateMessages = new Map();
let flyWorldChatSeq = 0;
let flyMarketplaceSeq = 0;
let flyPublicDeckCommentSeq = 0;
let flyPrivateMessageSeq = 0;
let certCache = { expiresAt: 0, certs: null };
let serviceAccountCache = undefined;
let adminTokenCache = { expiresAt: 0, accessToken: '' };
let flyStoreReady = false;
let cardCatalogCache = null;
let restoredTimerCount = 0;
let restoredEventCount = 0;
let shuttingDown = false;
let shutdownStartedAt = 0;

function now(){ return Date.now(); }
function roomCode(value){ return String(value || '').trim().toUpperCase(); }
function isRoomCode(value){ return /^[A-Z0-9]{6}$/.test(String(value || '')); }
function safeJson(value){ try{ return JSON.stringify(value); }catch(e){ return 'null'; } }
function parseJson(value){ try{ return JSON.parse(value); }catch(e){ return null; } }
function resultIndexOrNull(value){
  if(value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 1 ? n : null;
}

function safeNumber(value, fallback){
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeNonNegativeInteger(value, fallback){
  return Math.max(0, Math.round(safeNumber(value, fallback)));
}

function firebaseKeySegment(value){
  return String(value || '').replace(/[.#$\/\[\]]/g, '_').slice(0, 160);
}

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
    chatSeq:Number(room.chatSeq || 0) || 0,
    eventLog:Array.isArray(room.eventLog) ? room.eventLog.slice(-MAX_ROOM_EVENTS) : [],
    chat:Array.isArray(room.chat) ? room.chat.slice(-100) : [],
    spectators:room.spectators && typeof room.spectators === 'object' ? room.spectators : {},
    seed:room.seed || '',
    song:room.song || '',
    startedAt:room.startedAt || 0,
    endedAt:room.endedAt || 0,
    endedBy:room.endedBy || '',
    endReason:room.endReason || '',
    winnerUid:room.winnerUid || '',
    loserUid:room.loserUid || '',
    winnerIndex:resultIndexOrNull(room.winnerIndex),
    loserIndex:resultIndexOrNull(room.loserIndex),
    isDraw:!!room.isDraw,
    resultLedger:room.resultLedger || null,
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
    rooms:[...rooms.values()].map(roomToDurable).filter(Boolean),
    matchmaking:[...matchmaking.values()].map(publicMatchmakingEntry).filter(Boolean),
    playerStats:[...flyPlayerStats.values()].filter(Boolean),
    matchResults:[...flyMatchResults.values()].filter(Boolean).slice(-5000),
    parties:[...flyParties.values()].map(publicFlyParty).filter(Boolean),
    partyInvites:[...flyPartyInvites.values()].map(publicFlyPartyInvite).filter(Boolean),
    worldChatSeq:flyWorldChatSeq,
    worldChat:flyWorldChat.map(publicFlyWorldChatMessage).filter(Boolean).slice(-500),
    marketplaceSeq:flyMarketplaceSeq,
    marketplaceListings:[...flyMarketplaceListings.values()].map(publicFlyMarketplaceListing).filter(Boolean).slice(-1000),
    publicDeckCommentSeq:flyPublicDeckCommentSeq,
    publicDecks:[...flyPublicDecks.values()].map(publicFlyPublicDeck).filter(Boolean).slice(-1000),
    playerSaves:[...flyPlayerSaves.values()].map(publicFlyPlayerSave).filter(Boolean),
    friends:[...flyFriends.entries()].map(([uid, friends])=>({uid, friends:[...friends]})),
    friendRequests:[...flyFriendRequests.values()].map(publicFlyFriendRequest).filter(Boolean),
    privateMessageSeq:flyPrivateMessageSeq,
    privateThreads:[...flyPrivateThreads.entries()].map(([uid, threads])=>({uid, threads:[...threads.values()].map(publicFlyPrivateThread).filter(Boolean)})),
    privateMessages:[...flyPrivateMessages.entries()].map(([conversationKey, messages])=>({conversationKey, messages:messages.map(publicFlyPrivateMessage).filter(Boolean).slice(-200)}))
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
  const storedMatchmaking = Array.isArray(parsed?.matchmaking) ? parsed.matchmaking : [];
  storedMatchmaking.forEach(item=>{
    const entry = publicMatchmakingEntry(item);
    if(entry?.uid) matchmaking.set(entry.uid, entry);
  });
  (Array.isArray(parsed?.playerStats) ? parsed.playerStats : []).forEach(item=>{
    const stat = publicFlyProfile(item);
    if(stat?.uid) flyPlayerStats.set(stat.uid, stat);
  });
  (Array.isArray(parsed?.matchResults) ? parsed.matchResults : []).forEach(item=>{
    const result = publicFlyMatchResult(item);
    if(result?.matchId) flyMatchResults.set(result.matchId, result);
  });
  (Array.isArray(parsed?.parties) ? parsed.parties : []).forEach(item=>{
    const party = publicFlyParty(item);
    if(party?.partyId) flyParties.set(party.partyId, party);
  });
  (Array.isArray(parsed?.partyInvites) ? parsed.partyInvites : []).forEach(item=>{
    const invite = publicFlyPartyInvite(item);
    if(invite?.toUid && invite?.fromUid) flyPartyInvites.set(partyInviteKey(invite.toUid, invite.fromUid), invite);
  });
  flyWorldChatSeq = safeNonNegativeInteger(parsed?.worldChatSeq, 0);
  (Array.isArray(parsed?.worldChat) ? parsed.worldChat : []).forEach(item=>{
    const message = publicFlyWorldChatMessage(item);
    if(message?.seq){
      flyWorldChat.push(message);
      flyWorldChatSeq = Math.max(flyWorldChatSeq, message.seq);
    }
  });
  if(flyWorldChat.length > 500) flyWorldChat.splice(0, flyWorldChat.length - 500);
  flyMarketplaceSeq = safeNonNegativeInteger(parsed?.marketplaceSeq, 0);
  (Array.isArray(parsed?.marketplaceListings) ? parsed.marketplaceListings : []).forEach(item=>{
    const listing = publicFlyMarketplaceListing(item);
    if(listing?.listingId){
      flyMarketplaceListings.set(listing.listingId, listing);
      const seqMatch = String(listing.listingId || '').match(/m(\d+)$/);
      if(seqMatch) flyMarketplaceSeq = Math.max(flyMarketplaceSeq, Number(seqMatch[1]) || 0);
    }
  });
  flyPublicDeckCommentSeq = safeNonNegativeInteger(parsed?.publicDeckCommentSeq, 0);
  (Array.isArray(parsed?.publicDecks) ? parsed.publicDecks : []).forEach(item=>{
    const deck = publicFlyPublicDeck(item);
    if(deck?.deckId){
      flyPublicDecks.set(deck.deckId, deck);
      (deck.comments || []).forEach(comment=>{
        const seqMatch = String(comment.id || '').match(/c(\d+)$/);
        if(seqMatch) flyPublicDeckCommentSeq = Math.max(flyPublicDeckCommentSeq, Number(seqMatch[1]) || 0);
      });
    }
  });
  (Array.isArray(parsed?.playerSaves) ? parsed.playerSaves : []).forEach(item=>{
    const save = publicFlyPlayerSave(item);
    if(save?.uid) flyPlayerSaves.set(save.uid, save);
  });
  (Array.isArray(parsed?.friends) ? parsed.friends : []).forEach(item=>{
    const uid = String(item?.uid || '').slice(0, 128);
    if(!uid) return;
    flyFriends.set(uid, new Set((Array.isArray(item.friends) ? item.friends : []).map(friendUid=>String(friendUid || '').slice(0, 128)).filter(Boolean)));
  });
  (Array.isArray(parsed?.friendRequests) ? parsed.friendRequests : []).forEach(item=>{
    const request = publicFlyFriendRequest(item);
    if(request?.toUid && request?.fromUid) flyFriendRequests.set(friendRequestKey(request.toUid, request.fromUid), request);
  });
  flyPrivateMessageSeq = safeNonNegativeInteger(parsed?.privateMessageSeq, 0);
  (Array.isArray(parsed?.privateThreads) ? parsed.privateThreads : []).forEach(item=>{
    const uid = String(item?.uid || '').slice(0, 128);
    if(!uid) return;
    const map = new Map();
    (Array.isArray(item.threads) ? item.threads : []).forEach(thread=>{
      const clean = publicFlyPrivateThread(thread);
      if(clean?.peerUid) map.set(clean.peerUid, clean);
    });
    flyPrivateThreads.set(uid, map);
  });
  (Array.isArray(parsed?.privateMessages) ? parsed.privateMessages : []).forEach(item=>{
    const key = String(item?.conversationKey || '').slice(0, 300);
    if(!key) return;
    const messages = (Array.isArray(item.messages) ? item.messages : []).map(publicFlyPrivateMessage).filter(Boolean).slice(-200);
    messages.forEach(message=>{
      const seqMatch = String(message.id || '').match(/dm(\d+)$/);
      if(seqMatch) flyPrivateMessageSeq = Math.max(flyPrivateMessageSeq, Number(seqMatch[1]) || 0);
    });
    flyPrivateMessages.set(key, messages);
  });
  return count;
}

function upsertRoomEventInMemory(room, accepted){
  if(!room || !accepted?.action) return false;
  const seq = Number(accepted.action.seq || 0) || 0;
  const existingIndex = seq
    ? room.eventLog.findIndex(item=>Number(item?.action?.seq || 0) === seq)
    : -1;
  if(existingIndex >= 0){
    room.eventLog[existingIndex] = accepted;
  }else{
    room.eventLog.push(accepted);
  }
  room.eventLog.sort((a, b)=>(Number(a?.action?.seq || 0) || 0) - (Number(b?.action?.seq || 0) || 0));
  if(room.eventLog.length > MAX_ROOM_EVENTS){
    room.eventLog.splice(0, room.eventLog.length - MAX_ROOM_EVENTS);
  }
  return true;
}

function ensureRoomForAcceptedEvent(code, accepted){
  const normalizedCode = roomCode(code || accepted?.roomCode);
  if(!isRoomCode(normalizedCode) || !accepted?.action) return null;
  let room = rooms.get(normalizedCode);
  if(room) return room;
  const action = accepted.action;
  const payload = action.payload || {};
  room = makeRoom(normalizedCode);
  room.status = 'restoring';
  room.phase = 'restoring';
  room.mode = String(payload.mode || 'freeplay').slice(0, 32);
  room.hostUid = String(payload.hostUid || '').slice(0, 128);
  room.guestUid = String(payload.guestUid || '').slice(0, 128);
  if(room.hostUid) room.playerOrder[0] = room.hostUid;
  if(room.guestUid) room.playerOrder[1] = room.guestUid;
  const profiles = payload.profiles || {};
  const decks = payload.decks || {};
  const deckNames = payload.deckNames || {};
  if(room.hostUid){
    room.players[room.hostUid] = {
      uid:room.hostUid,
      role:'host',
      connected:false,
      joinedAt:Number(action.authorityTime || accepted.savedAt || 0) || now(),
      lastSeen:Number(action.authorityTime || accepted.savedAt || 0) || now(),
      profile:sanitizeProfile(profiles[0]),
      deckChoice:sanitizeDeckChoice({name:deckNames[0] || 'Host Deck', deckIds:Array.isArray(decks[0]) ? decks[0] : [], ready:true})
    };
  }
  if(room.guestUid){
    room.players[room.guestUid] = {
      uid:room.guestUid,
      role:'guest',
      connected:false,
      joinedAt:Number(action.authorityTime || accepted.savedAt || 0) || now(),
      lastSeen:Number(action.authorityTime || accepted.savedAt || 0) || now(),
      profile:sanitizeProfile(profiles[1]),
      deckChoice:sanitizeDeckChoice({name:deckNames[1] || 'Guest Deck', deckIds:Array.isArray(decks[1]) ? decks[1] : [], ready:true})
    };
  }
  return room;
}

function applyAcceptedEventFromFlyLog(code, accepted){
  const room = ensureRoomForAcceptedEvent(code, accepted);
  if(!room || !accepted?.action) return false;
  const action = accepted.action;
  const seq = Number(action.seq || 0) || 0;
  if(!seq) return false;
  upsertRoomEventInMemory(room, accepted);
  applyFlyResultLedger(code, accepted);
  if(seq <= Number(room.lastSeq || 0)) return false;
  room.lastSeq = seq;
  if(action.payload?.postState){
    room.canonicalState = action.payload.postState;
    room.canonicalHash = String(action.payload.stateHash || room.canonicalHash || room.lastStateHash || '');
    room.lastStateHash = room.canonicalHash || room.lastStateHash || '';
  }
  applyRoomPatch(room, accepted.roomPatch || roomPatchForAction(room, action));
  if(action.type === 'MATCH_START'){
    room.seed = String(action.payload?.seed || room.seed || '').slice(0, 160);
    room.song = String(action.payload?.song || room.song || '').slice(0, 160);
    room.hostUid = String(action.payload?.hostUid || room.hostUid || '').slice(0, 128);
    room.guestUid = String(action.payload?.guestUid || room.guestUid || '').slice(0, 128);
    if(room.hostUid) room.playerOrder[0] = room.hostUid;
    if(room.guestUid) room.playerOrder[1] = room.guestUid;
  }
  return true;
}

function loadFlyEventsLog(){
  if(!ensureFlyStore()) return 0;
  const filePath = flyStorePath('events.jsonl');
  if(!fs.existsSync(filePath)) return 0;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
  const records = [];
  lines.forEach(line=>{
    const parsed = parseJson(line);
    if(!parsed?.accepted?.action) return;
    records.push(parsed);
  });
  records.sort((a, b)=>{
    const codeCompare = String(a.code || '').localeCompare(String(b.code || ''));
    if(codeCompare) return codeCompare;
    return (Number(a.accepted?.action?.seq || 0) || 0) - (Number(b.accepted?.action?.seq || 0) || 0);
  });
  let count = 0;
  records.forEach(record=>{
    if(applyAcceptedEventFromFlyLog(record.code, record.accepted)) count += 1;
  });
  return count;
}

function rearmRestoredRoomTimers(room){
  if(!room || room.status === 'lobby' || room.status === 'ended') return 0;
  let count = 0;
  if(room.canonicalState?._serverPendingReaction?.promptId){
    scheduleReactionTimer(room);
    if(room.reactionTimer) count += 1;
  }
  if(DISCONNECT_TIMEOUT_MS > 0 && room.canonicalState && room.canonicalHash){
    Object.keys(room.players || {}).forEach(uid=>{
      const player = room.players[uid];
      if(!player || player.connected !== false) return;
      const lastSeen = Number(player.lastSeen || room.updatedAt || room.lastTouched || 0) || now();
      const elapsed = Math.max(0, now() - lastSeen);
      const remainingMs = DISCONNECT_TIMEOUT_MS - elapsed;
      scheduleDisconnectTimer(room, uid, remainingMs);
      if(room.disconnectTimers?.[uid]) count += 1;
    });
  }
  return count;
}

function rearmRestoredTimers(){
  restoredTimerCount = 0;
  for(const room of rooms.values()){
    restoredTimerCount += rearmRestoredRoomTimers(room);
  }
  return restoredTimerCount;
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

function markSocketDisconnected(ws){
  const room = ws?.fateRoomCode ? rooms.get(ws.fateRoomCode) : null;
  if(!room || !ws.fateUid) return false;
  room.sockets.delete(ws);
  const stillConnected = [...room.sockets].some(client=>client !== ws && !client.destroyed && client.fateUid === ws.fateUid);
  const player = room.players[ws.fateUid] || null;
  if(!player) return false;
  player.connected = stillConnected;
  player.lastSeen = now();
  if(stillConnected) clearDisconnectTimer(room, ws.fateUid);
  else scheduleDisconnectTimer(room, ws.fateUid);
  touch(room);
  return true;
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
    chatSeq:0,
    eventLog:[],
    chat:[],
    spectators:{},
    sockets:new Set(),
    disconnectTimers:{},
    reactionTimer:null,
    reactionTimerPromptId:'',
    actionQueue:Promise.resolve(),
    resultLedger:null,
    createdAt:t,
    updatedAt:t,
    lastTouched:t
  };
  rooms.set(code, room);
  return room;
}
function getRoom(code){ return rooms.get(code) || makeRoom(code); }
function touch(room){ if(room) room.lastTouched = room.updatedAt = now(); }

function enqueueRoomAction(room, task){
  if(!room) return Promise.reject(new Error('room not found'));
  if(!room.actionQueue) room.actionQueue = Promise.resolve();
  const previous = room.actionQueue.catch(()=>{});
  const run = previous.then(()=>task());
  room.actionQueue = run.catch(()=>{});
  return run;
}

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
    title:String(profile.title || '').slice(0, 80),
    baseCode:String(profile.baseCode || '').slice(0, 80),
    photoURL:String(profile.photoURL || profile.profileImg || profile.img || '').slice(0, 180),
    profileImg:String(profile.profileImg || profile.photoURL || profile.img || '').slice(0, 180),
    elo:safeNonNegativeInteger(profile.elo, 600),
    challengerElo:safeNonNegativeInteger(profile.challengerElo ?? profile.elo, 600),
    wins:safeNonNegativeInteger(profile.wins, 0),
    losses:safeNonNegativeInteger(profile.losses, 0),
    challengerWins:safeNonNegativeInteger(profile.challengerWins ?? profile.wins, 0),
    challengerLosses:safeNonNegativeInteger(profile.challengerLosses ?? profile.losses, 0),
    humanWins:safeNonNegativeInteger(profile.humanWins, 0),
    humanLosses:safeNonNegativeInteger(profile.humanLosses, 0),
    matchesPlayed:safeNonNegativeInteger(profile.matchesPlayed, 0),
    level:safeNonNegativeInteger(profile.level, 1),
    xp:safeNonNegativeInteger(profile.xp, 0),
    totalXp:safeNonNegativeInteger(profile.totalXp, 0),
    starlight:safeNonNegativeInteger(profile.starlight, 0)
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

function normalizeRoomMode(mode){
  const raw = String(mode || 'freeplay').toLowerCase();
  return raw === 'ranked' || raw === 'challenger' ? 'ranked' : 'freeplay';
}

function matchmakingQueueKey(mode, status = 'waiting', targetUid = ''){
  const m = normalizeRoomMode(mode);
  const s = String(status || 'waiting').toLowerCase();
  const target = String(targetUid || '').slice(0, 128);
  return target ? `${m}:${s}:party:${target}` : `${m}:${s}:open`;
}

function publicMatchmakingEntry(value){
  const entry = value && typeof value === 'object' ? value : {};
  const uid = String(entry.uid || '').slice(0, 128);
  if(!uid) return null;
  const mode = normalizeRoomMode(entry.mode);
  const status = String(entry.status || 'waiting').slice(0, 32);
  const partyTargetUid = String(entry.partyTargetUid || '').slice(0, 128);
  return {
    uid,
    mode,
    status,
    queueKey:String(entry.queueKey || matchmakingQueueKey(mode, status, partyTargetUid ? uid : '')).slice(0, 180),
    role:String(entry.role || 'host').slice(0, 32),
    roomCode:roomCode(entry.roomCode),
    matchedUid:String(entry.matchedUid || '').slice(0, 128),
    name:String(entry.name || 'Player').slice(0, 32),
    photoURL:String(entry.photoURL || '').slice(0, 180),
    elo:safeNonNegativeInteger(entry.elo, 600),
    deckName:String(entry.deckName || 'Selected Deck').slice(0, 80),
    partyTargetUid,
    createdAt:Number(entry.createdAt || 0) || now(),
    updatedAt:Number(entry.updatedAt || 0) || now()
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
    },
    actionSeq:Number(player.actionSeq || 0) || 0,
    actionSeqClientAt:Number(player.actionSeqClientAt || 0) || 0,
    actionSeqServerAt:Number(player.actionSeqServerAt || 0) || 0
  };
}

function sanitizeChatText(value){
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

function publicChatMessage(message){
  const msg = message && typeof message === 'object' ? message : {};
  return {
    id:String(msg.id || '').slice(0, 80),
    seq:Number(msg.seq || 0) || 0,
    uid:String(msg.uid || '').slice(0, 128),
    text:sanitizeChatText(msg.text),
    name:String(msg.name || 'Player').slice(0, 32),
    createdAt:Number(msg.createdAt || 0) || 0,
    isSpectator:!!msg.isSpectator
  };
}

function publicChat(room, limit = 80, after = 0){
  const max = Math.min(100, Math.max(1, Number(limit || 80) || 80));
  const minSeq = Math.max(0, Number(after || 0) || 0);
  return (Array.isArray(room?.chat) ? room.chat : [])
    .map(publicChatMessage)
    .filter(msg=>msg.seq > minSeq)
    .slice(-max);
}

function partyInviteKey(toUid, fromUid){
  return `${firebaseKeySegment(toUid)}:${firebaseKeySegment(fromUid)}`;
}

function publicFlyParty(value){
  const raw = value && typeof value === 'object' ? value : {};
  const partyId = String(raw.partyId || '').slice(0, 160);
  const leaderUid = String(raw.leaderUid || '').slice(0, 128);
  const members = {};
  Object.entries(raw.members || {}).slice(0, 2).forEach(([uid, member])=>{
    const safeUid = String(uid || member?.uid || '').slice(0, 128);
    if(!safeUid) return;
    members[safeUid] = {
      uid:safeUid,
      status:String(member?.status || (safeUid === leaderUid ? 'Leader' : 'Ready')).slice(0, 32),
      joinedAt:Number(member?.joinedAt || 0) || now()
    };
  });
  if(!partyId || !leaderUid || !members[leaderUid]) return null;
  return {
    partyId,
    leaderUid,
    members,
    paired:!!raw.paired || Object.keys(members).length >= 2,
    createdAt:Number(raw.createdAt || 0) || now(),
    updatedAt:Number(raw.updatedAt || 0) || now()
  };
}

function publicFlyPartyInvite(value){
  const raw = value && typeof value === 'object' ? value : {};
  const fromUid = String(raw.fromUid || '').slice(0, 128);
  const toUid = String(raw.toUid || '').slice(0, 128);
  const partyId = String(raw.partyId || '').slice(0, 160);
  if(!fromUid || !toUid || !partyId) return null;
  return {
    fromUid,
    toUid,
    partyId,
    fromName:String(raw.fromName || raw.name || 'Player').slice(0, 32),
    fromPhotoURL:String(raw.fromPhotoURL || raw.photoURL || 'blank.png').slice(0, 180),
    status:String(raw.status || 'pending').slice(0, 32),
    createdAt:Number(raw.createdAt || 0) || now(),
    updatedAt:Number(raw.updatedAt || 0) || now()
  };
}

function publicFlyWorldChatMessage(value){
  const raw = value && typeof value === 'object' ? value : {};
  const seq = safeNonNegativeInteger(raw.seq, 0);
  const text = sanitizeChatText(raw.text);
  if(!seq || !text) return null;
  return {
    id:String(raw.id || `w${seq}`).slice(0, 80),
    seq,
    uid:String(raw.uid || raw.fromUid || '').slice(0, 128),
    fromUid:String(raw.fromUid || raw.uid || '').slice(0, 128),
    from:String(raw.from || raw.name || 'Player').slice(0, 32),
    name:String(raw.name || raw.from || 'Player').slice(0, 32),
    photoURL:String(raw.photoURL || raw.profileImg || 'blank.png').slice(0, 180),
    text,
    timestamp:Number(raw.timestamp || raw.createdAt || 0) || now(),
    createdAt:Number(raw.createdAt || raw.timestamp || 0) || now()
  };
}

function removeFlyParty(partyId){
  const id = String(partyId || '').slice(0, 160);
  const party = flyParties.get(id);
  if(!party) return null;
  const memberUids = Object.keys(party.members || {});
  flyParties.delete(id);
  for(const [key, invite] of [...flyPartyInvites.entries()]){
    if(invite.partyId === id || memberUids.includes(invite.fromUid) || memberUids.includes(invite.toUid)){
      flyPartyInvites.delete(key);
    }
  }
  return party;
}

function leaveExistingFlyParties(uid){
  const safeUid = String(uid || '').slice(0, 128);
  if(!safeUid) return;
  for(const party of [...flyParties.values()]){
    if(party.members?.[safeUid]) removeFlyParty(party.partyId);
  }
}

function flySocialState(uid){
  const safeUid = String(uid || '').slice(0, 128);
  const party = [...flyParties.values()].find(item=>!!item.members?.[safeUid]) || null;
  const invites = {};
  for(const invite of flyPartyInvites.values()){
    if(invite.toUid === safeUid) invites[invite.fromUid] = publicFlyPartyInvite(invite);
  }
  const onlineProfiles = [...flyPlayerStats.values()]
    .map(publicFlyProfile)
    .filter(Boolean)
    .sort((a,b)=>(Number(b.updatedAt || 0) || 0) - (Number(a.updatedAt || 0) || 0))
    .slice(0, 40);
  const profiles = {};
  onlineProfiles.forEach(profile=>{ profiles[profile.uid] = profile; });
  if(safeUid && !profiles[safeUid]) profiles[safeUid] = publicFlyProfile(flyPlayerStats.get(safeUid) || {uid:safeUid});
  if(party){
    Object.keys(party.members || {}).forEach(memberUid=>{
      if(!profiles[memberUid]) profiles[memberUid] = publicFlyProfile(flyPlayerStats.get(memberUid) || {uid:memberUid});
    });
  }
  Object.keys(invites).forEach(fromUid=>{
    if(!profiles[fromUid]) profiles[fromUid] = publicFlyProfile(flyPlayerStats.get(fromUid) || {uid:fromUid});
  });
  return {
    uid:safeUid,
    friends:{},
    requests:{},
    threads:{},
    onlineUids:onlineProfiles.map(profile=>profile.uid).filter(Boolean),
    profiles,
    party:party ? publicFlyParty(party) : null,
    partyInvites:invites
  };
}

function createFlyParty(uid){
  const safeUid = String(uid || '').slice(0, 128);
  if(!safeUid) throw new Error('missing uid');
  leaveExistingFlyParties(safeUid);
  const party = publicFlyParty({
    partyId:`party_${firebaseKeySegment(safeUid)}`,
    leaderUid:safeUid,
    members:{[safeUid]:{uid:safeUid, status:'Leader', joinedAt:now()}},
    createdAt:now(),
    updatedAt:now()
  });
  flyParties.set(party.partyId, party);
  for(const key of [...flyPartyInvites.keys()]){
    const invite = flyPartyInvites.get(key);
    if(invite?.toUid === safeUid || invite?.fromUid === safeUid) flyPartyInvites.delete(key);
  }
  return party;
}

function inviteFlyParty(partyId, fromUid, toUid, profile){
  const party = flyParties.get(String(partyId || '').slice(0, 160));
  const safeFrom = String(fromUid || '').slice(0, 128);
  const safeTo = String(toUid || '').slice(0, 128);
  if(!party) throw new Error('party not found');
  if(!party.members?.[safeFrom]) throw new Error('user is not in this party');
  if(!safeTo || safeTo === safeFrom) throw new Error('invalid invite target');
  if(!party.members[safeTo] && Object.keys(party.members || {}).length >= 2) throw new Error('party is full');
  const cleanProfile = publicFlyProfile(Object.assign({}, profile || {}, {uid:safeFrom})) || {name:'Player', photoURL:'blank.png'};
  const invite = publicFlyPartyInvite({
    fromUid:safeFrom,
    toUid:safeTo,
    partyId:party.partyId,
    fromName:cleanProfile.name || cleanProfile.displayName || 'Player',
    fromPhotoURL:cleanProfile.photoURL || cleanProfile.profileImg || 'blank.png',
    status:'pending',
    createdAt:now(),
    updatedAt:now()
  });
  flyPartyInvites.set(partyInviteKey(safeTo, safeFrom), invite);
  party.updatedAt = now();
  flyParties.set(party.partyId, publicFlyParty(party));
  return invite;
}

function acceptFlyPartyInvite(partyId, uid, fromUid){
  const safeUid = String(uid || '').slice(0, 128);
  const safeFrom = String(fromUid || '').slice(0, 128);
  const party = flyParties.get(String(partyId || '').slice(0, 160));
  if(!party) throw new Error('party not found');
  const invite = flyPartyInvites.get(partyInviteKey(safeUid, safeFrom));
  if(!invite || invite.partyId !== party.partyId) throw new Error('party request expired');
  const members = party.members || {};
  if(!members[safeUid] && Object.keys(members).length >= 2) throw new Error('party is full');
  leaveExistingFlyParties(safeUid);
  const active = flyParties.get(party.partyId);
  if(!active) throw new Error('party no longer exists');
  active.members = Object.assign({}, active.members, {
    [safeUid]:{uid:safeUid, status:'Ready', joinedAt:now()}
  });
  active.paired = true;
  active.updatedAt = now();
  const next = publicFlyParty(active);
  flyParties.set(next.partyId, next);
  for(const [key, existing] of [...flyPartyInvites.entries()]){
    if(existing.toUid === safeUid || existing.fromUid === safeUid || existing.partyId === next.partyId) flyPartyInvites.delete(key);
  }
  return next;
}

function declineFlyPartyInvite(uid, fromUid){
  const key = partyInviteKey(uid, fromUid);
  const invite = flyPartyInvites.get(key) || null;
  flyPartyInvites.delete(key);
  return invite;
}

function appendFlyWorldChat(uid, text, profile){
  const safeUid = String(uid || '').slice(0, 128);
  const cleanText = sanitizeChatText(text);
  if(!safeUid) throw new Error('missing uid');
  if(!cleanText) throw new Error('empty message');
  const cleanProfile = publicFlyProfile(Object.assign({}, profile || {}, {uid:safeUid})) || {name:'Player', photoURL:'blank.png'};
  flyWorldChatSeq += 1;
  const message = publicFlyWorldChatMessage({
    id:`w${flyWorldChatSeq}`,
    seq:flyWorldChatSeq,
    uid:safeUid,
    fromUid:safeUid,
    from:cleanProfile.name || cleanProfile.displayName || 'Player',
    name:cleanProfile.name || cleanProfile.displayName || 'Player',
    photoURL:cleanProfile.photoURL || cleanProfile.profileImg || 'blank.png',
    text:cleanText,
    timestamp:now(),
    createdAt:now()
  });
  flyWorldChat.push(message);
  if(flyWorldChat.length > 500) flyWorldChat.splice(0, flyWorldChat.length - 500);
  return message;
}

function listFlyWorldChat(limit = 100, after = 0){
  const max = Math.min(100, Math.max(1, Number(limit || 100) || 100));
  const minSeq = Math.max(0, Number(after || 0) || 0);
  return flyWorldChat
    .map(publicFlyWorldChatMessage)
    .filter(Boolean)
    .filter(message=>message.seq > minSeq)
    .slice(-max);
}

function publicFlyMarketplaceListing(value){
  const raw = value && typeof value === 'object' ? value : {};
  const listingId = String(raw.listingId || '').slice(0, 120);
  const sellerUid = String(raw.sellerUid || raw.uid || '').slice(0, 128);
  const cardId = String(raw.cardId || '').slice(0, 120);
  if(!listingId || !sellerUid || !cardId) return null;
  return {
    listingId,
    type:'card',
    sellerUid,
    seller:String(raw.seller || raw.sellerName || raw.name || 'Player').slice(0, 32),
    sellerPhotoURL:String(raw.sellerPhotoURL || raw.photoURL || 'blank.png').slice(0, 180),
    cardId,
    price:Math.min(10000, Math.max(10, safeNonNegativeInteger(raw.price, 100))),
    status:String(raw.status || 'active').slice(0, 32),
    buyerUid:String(raw.buyerUid || '').slice(0, 128),
    buyer:String(raw.buyer || raw.buyerName || '').slice(0, 32),
    buyerPhotoURL:String(raw.buyerPhotoURL || '').slice(0, 180),
    sellerRedeemed:!!raw.sellerRedeemed,
    createdAt:Number(raw.createdAt || 0) || now(),
    soldAt:Number(raw.soldAt || 0) || 0,
    cancelledAt:Number(raw.cancelledAt || 0) || 0,
    redeemedAt:Number(raw.redeemedAt || 0) || 0,
    redeemedBy:String(raw.redeemedBy || '').slice(0, 128),
    updatedAt:Number(raw.updatedAt || raw.createdAt || 0) || now(),
    source:'fly-authority'
  };
}

function createFlyMarketplaceListing(uid, body){
  const safeUid = String(uid || '').slice(0, 128);
  const cardId = String(body?.cardId || '').slice(0, 120);
  if(!safeUid) throw new Error('missing uid');
  if(!cardId) throw new Error('missing card id');
  flyMarketplaceSeq += 1;
  const listingId = `market_${firebaseKeySegment(safeUid)}_m${flyMarketplaceSeq}`;
  const profile = publicFlyProfile(Object.assign({}, body?.profile || body || {}, {uid:safeUid})) || {name:'Player', photoURL:'blank.png'};
  const listing = publicFlyMarketplaceListing({
    listingId,
    sellerUid:safeUid,
    seller:profile.name || profile.displayName || 'Player',
    sellerPhotoURL:profile.photoURL || profile.profileImg || 'blank.png',
    cardId,
    price:body?.price,
    status:'active',
    createdAt:now(),
    updatedAt:now()
  });
  flyMarketplaceListings.set(listing.listingId, listing);
  return listing;
}

function buyFlyMarketplaceListing(uid, listingId, body){
  const safeUid = String(uid || '').slice(0, 128);
  const id = String(listingId || '').slice(0, 120);
  const listing = publicFlyMarketplaceListing(flyMarketplaceListings.get(id));
  if(!listing) throw new Error('listing not found');
  if(listing.status !== 'active') throw new Error('listing is not active');
  if(listing.sellerUid === safeUid) throw new Error('cannot buy your own listing');
  const profile = publicFlyProfile(Object.assign({}, body?.profile || body || {}, {uid:safeUid})) || {name:'Player', photoURL:'blank.png'};
  const next = publicFlyMarketplaceListing(Object.assign({}, listing, {
    status:'sold',
    buyerUid:safeUid,
    buyer:profile.name || profile.displayName || 'Player',
    buyerPhotoURL:profile.photoURL || profile.profileImg || 'blank.png',
    soldAt:now(),
    updatedAt:now()
  }));
  flyMarketplaceListings.set(id, next);
  return next;
}

function cancelFlyMarketplaceListing(uid, listingId){
  const safeUid = String(uid || '').slice(0, 128);
  const id = String(listingId || '').slice(0, 120);
  const listing = publicFlyMarketplaceListing(flyMarketplaceListings.get(id));
  if(!listing) throw new Error('listing not found');
  if(listing.sellerUid !== safeUid) throw new Error('only the seller can cancel this listing');
  if(listing.status !== 'active') throw new Error('listing is not active');
  const next = publicFlyMarketplaceListing(Object.assign({}, listing, {
    status:'cancelled',
    cancelledAt:now(),
    updatedAt:now()
  }));
  flyMarketplaceListings.set(id, next);
  return next;
}

function redeemFlyMarketplace(uid){
  const safeUid = String(uid || '').slice(0, 128);
  let total = 0;
  const redeemed = [];
  for(const [id, raw] of flyMarketplaceListings.entries()){
    const listing = publicFlyMarketplaceListing(raw);
    if(!listing || listing.sellerUid !== safeUid || listing.status !== 'sold' || listing.sellerRedeemed) continue;
    total += Number(listing.price || 0) || 0;
    const next = publicFlyMarketplaceListing(Object.assign({}, listing, {
      sellerRedeemed:true,
      redeemedAt:now(),
      redeemedBy:safeUid,
      updatedAt:now()
    }));
    flyMarketplaceListings.set(id, next);
    redeemed.push(next);
  }
  return {total, redeemed};
}

function listFlyMarketplace(limit = 160){
  const max = Math.min(200, Math.max(1, Number(limit || 160) || 160));
  const all = [...flyMarketplaceListings.values()]
    .map(publicFlyMarketplaceListing)
    .filter(Boolean)
    .sort((a,b)=>(Number(b.updatedAt || b.createdAt || 0) || 0) - (Number(a.updatedAt || a.createdAt || 0) || 0))
    .slice(0, max);
  return {
    listings:all.filter(item=>item.status === 'active'),
    transactions:all.filter(item=>item.status === 'sold').slice(0, 80)
  };
}

function publicFlyDeckRating(value){
  const raw = value && typeof value === 'object' ? value : {};
  const uid = String(raw.uid || '').slice(0, 128);
  const stars = Math.max(1, Math.min(5, safeNonNegativeInteger(raw.stars, 0)));
  if(!uid || !stars) return null;
  return {
    uid,
    username:String(raw.username || raw.name || 'Player').slice(0, 32),
    stars,
    timestamp:Number(raw.timestamp || raw.createdAt || 0) || now(),
    createdAt:Number(raw.createdAt || raw.timestamp || 0) || now()
  };
}

function publicFlyDeckComment(value){
  const raw = value && typeof value === 'object' ? value : {};
  const id = String(raw.id || '').slice(0, 80);
  const uid = String(raw.uid || '').slice(0, 128);
  const text = sanitizeChatText(raw.text);
  if(!id || !uid || !text) return null;
  return {
    id,
    uid,
    username:String(raw.username || raw.name || 'Player').slice(0, 32),
    text,
    timestamp:Number(raw.timestamp || raw.createdAt || 0) || now(),
    createdAt:Number(raw.createdAt || raw.timestamp || 0) || now()
  };
}

function publicFlyPublicDeck(value){
  const raw = value && typeof value === 'object' ? value : {};
  const deckId = String(raw.deckId || raw.id || '').slice(0, 160);
  const ownerUid = String(raw.ownerUid || raw.uid || '').slice(0, 128);
  if(!deckId || !ownerUid) return null;
  const ids = Array.isArray(raw.ids) ? raw.ids.map(id=>String(id || '').slice(0, 120)).slice(0, 80) : [];
  const ratings = (Array.isArray(raw.ratings) ? raw.ratings : Object.values(raw.ratings || {}))
    .map(publicFlyDeckRating)
    .filter(Boolean)
    .slice(-500);
  const comments = (Array.isArray(raw.comments) ? raw.comments : Object.values(raw.comments || {}))
    .map(publicFlyDeckComment)
    .filter(Boolean)
    .sort((a,b)=>(Number(a.createdAt || a.timestamp || 0) || 0) - (Number(b.createdAt || b.timestamp || 0) || 0))
    .slice(-80);
  const ratingAvg = ratings.length ? ratings.reduce((sum, r)=>sum + Number(r.stars || 0), 0) / ratings.length : 0;
  const displayCardIds = Array.isArray(raw.displayCardIds)
    ? raw.displayCardIds.map(id=>String(id || '').slice(0, 120)).slice(0, 4)
    : [];
  return {
    id:deckId,
    deckId,
    ownerUid,
    username:String(raw.username || raw.ownerName || raw.name || 'Player').slice(0, 32),
    ownerName:String(raw.ownerName || raw.username || 'Player').slice(0, 32),
    ownerPhotoURL:String(raw.ownerPhotoURL || raw.photoURL || 'blank.png').slice(0, 180),
    name:String(raw.name || 'Shared Deck').slice(0, 80),
    description:String(raw.description || '').slice(0, 240),
    faceCardId:String(raw.faceCardId || displayCardIds[0] || ids[0] || '').slice(0, 120),
    displayCardIds,
    sourcePid:String(raw.sourcePid || '').slice(0, 160),
    ids,
    totalCards:ids.length,
    uniqueCards:new Set(ids).size,
    ratingAvg,
    ratingCount:ratings.length,
    commentCount:comments.length,
    ratings,
    comments,
    timestamp:Number(raw.timestamp || raw.createdAt || 0) || now(),
    createdAt:Number(raw.createdAt || raw.timestamp || 0) || now(),
    updatedAt:Number(raw.updatedAt || raw.createdAt || raw.timestamp || 0) || now(),
    source:'fly-authority'
  };
}

function publicFlyPublicDeckSummary(deck){
  const full = publicFlyPublicDeck(deck);
  if(!full) return null;
  return Object.assign({}, full, {
    ids:[],
    ratings:[],
    comments:[]
  });
}

function upsertFlyPublicDeck(uid, body){
  const safeUid = String(uid || '').slice(0, 128);
  if(!safeUid) throw new Error('missing uid');
  const deckId = String(body?.deckId || body?.id || `${safeUid}_${now()}`).replace(/[.#$\/\[\]]/g, '_').slice(0, 160);
  const existing = flyPublicDecks.get(deckId) || {};
  if(existing.ownerUid && existing.ownerUid !== safeUid) throw new Error('only the owner can update this deck');
  const profile = publicFlyProfile(Object.assign({}, body?.profile || body || {}, {uid:safeUid})) || {name:'Player', photoURL:'blank.png'};
  const deck = publicFlyPublicDeck(Object.assign({}, existing, body || {}, {
    id:deckId,
    deckId,
    ownerUid:safeUid,
    username:body?.username || profile.name || profile.displayName || 'Player',
    ownerName:body?.ownerName || profile.name || profile.displayName || 'Player',
    ownerPhotoURL:body?.ownerPhotoURL || profile.photoURL || profile.profileImg || 'blank.png',
    createdAt:existing.createdAt || now(),
    updatedAt:now()
  }));
  flyPublicDecks.set(deck.deckId, deck);
  return deck;
}

function removeFlyPublicDeck(uid, deckId){
  const safeUid = String(uid || '').slice(0, 128);
  const id = String(deckId || '').slice(0, 160);
  const deck = publicFlyPublicDeck(flyPublicDecks.get(id));
  if(!deck) throw new Error('deck not found');
  if(deck.ownerUid !== safeUid) throw new Error('only the owner can remove this deck');
  flyPublicDecks.delete(id);
  return deck;
}

function rateFlyPublicDeck(uid, deckId, body){
  const safeUid = String(uid || '').slice(0, 128);
  const id = String(deckId || '').slice(0, 160);
  const deck = publicFlyPublicDeck(flyPublicDecks.get(id));
  if(!deck) throw new Error('deck not found');
  const rating = publicFlyDeckRating({
    uid:safeUid,
    username:body?.username || body?.name || 'Player',
    stars:body?.stars,
    timestamp:now(),
    createdAt:now()
  });
  if(!rating) throw new Error('invalid rating');
  const ratings = (deck.ratings || []).filter(item=>item.uid !== safeUid).concat(rating);
  const next = publicFlyPublicDeck(Object.assign({}, deck, {ratings, updatedAt:now()}));
  flyPublicDecks.set(id, next);
  return next;
}

function commentFlyPublicDeck(uid, deckId, body){
  const safeUid = String(uid || '').slice(0, 128);
  const id = String(deckId || '').slice(0, 160);
  const deck = publicFlyPublicDeck(flyPublicDecks.get(id));
  if(!deck) throw new Error('deck not found');
  const text = sanitizeChatText(body?.text);
  if(!text) throw new Error('empty comment');
  flyPublicDeckCommentSeq += 1;
  const comment = publicFlyDeckComment({
    id:`c${flyPublicDeckCommentSeq}`,
    uid:safeUid,
    username:body?.username || body?.name || 'Player',
    text,
    timestamp:now(),
    createdAt:now()
  });
  const comments = (deck.comments || []).concat(comment).slice(-80);
  const next = publicFlyPublicDeck(Object.assign({}, deck, {comments, updatedAt:now()}));
  flyPublicDecks.set(id, next);
  return {deck:next, comment};
}

function listFlyPublicDecks(limit = 60){
  const max = Math.min(100, Math.max(1, Number(limit || 60) || 60));
  return [...flyPublicDecks.values()]
    .map(publicFlyPublicDeckSummary)
    .filter(Boolean)
    .sort((a,b)=>(Number(b.ratingAvg || 0) - Number(a.ratingAvg || 0)) || ((Number(b.updatedAt || b.timestamp || 0) || 0) - (Number(a.updatedAt || a.timestamp || 0) || 0)))
    .slice(0, max);
}

function publicFlyPlayerSave(value){
  const raw = value && typeof value === 'object' ? value : {};
  const uid = String(raw.uid || '').slice(0, 128);
  if(!uid) return null;
  const data = raw.data && typeof raw.data === 'object' ? raw.data : {};
  return {
    uid,
    data,
    schemaVersion:safeNonNegativeInteger(raw.schemaVersion, 1),
    updatedAt:Number(raw.updatedAt || 0) || now()
  };
}

function upsertFlyPlayerSave(uid, body){
  const safeUid = String(uid || '').slice(0, 128);
  if(!safeUid) throw new Error('missing uid');
  const payload = body?.data && typeof body.data === 'object' ? body.data : body;
  const existing = publicFlyPlayerSave(flyPlayerSaves.get(safeUid) || {uid:safeUid, data:{}});
  const clean = publicFlyPlayerSave({
    uid:safeUid,
    data:Object.assign({}, existing?.data || {}, payload || {}),
    schemaVersion:1,
    updatedAt:now()
  });
  flyPlayerSaves.set(safeUid, clean);
  return clean;
}

function friendRequestKey(toUid, fromUid){
  return `${firebaseKeySegment(toUid)}:${firebaseKeySegment(fromUid)}`;
}

function conversationKey(a, b){
  return [String(a || '').slice(0, 128), String(b || '').slice(0, 128)].sort().map(firebaseKeySegment).join(':');
}

function ensureFriendSet(uid){
  const safeUid = String(uid || '').slice(0, 128);
  if(!flyFriends.has(safeUid)) flyFriends.set(safeUid, new Set());
  return flyFriends.get(safeUid);
}

function publicFlyFriendRequest(value){
  const raw = value && typeof value === 'object' ? value : {};
  const fromUid = String(raw.fromUid || '').slice(0, 128);
  const toUid = String(raw.toUid || '').slice(0, 128);
  if(!fromUid || !toUid) return null;
  return {
    fromUid,
    toUid,
    status:String(raw.status || 'pending').slice(0, 32),
    fromName:String(raw.fromName || raw.name || 'Player').slice(0, 32),
    fromCode:String(raw.fromCode || raw.baseCode || '').slice(0, 80),
    createdAt:Number(raw.createdAt || 0) || now(),
    updatedAt:Number(raw.updatedAt || 0) || now()
  };
}

function publicFlyPrivateThread(value){
  const raw = value && typeof value === 'object' ? value : {};
  const peerUid = String(raw.peerUid || '').slice(0, 128);
  if(!peerUid) return null;
  return {
    peerUid,
    lastText:String(raw.lastText || '').slice(0, 120),
    lastAt:Number(raw.lastAt || 0) || 0,
    unread:safeNonNegativeInteger(raw.unread, 0)
  };
}

function publicFlyPrivateMessage(value){
  const raw = value && typeof value === 'object' ? value : {};
  const id = String(raw.id || '').slice(0, 80);
  const uid = String(raw.uid || raw.fromUid || '').slice(0, 128);
  const toUid = String(raw.toUid || '').slice(0, 128);
  const text = sanitizeChatText(raw.text);
  if(!id || !uid || !toUid || !text) return null;
  return {
    id,
    uid,
    fromUid:uid,
    toUid,
    from:String(raw.from || raw.name || 'Player').slice(0, 32),
    photoURL:String(raw.photoURL || raw.profileImg || 'blank.png').slice(0, 180),
    text,
    timestamp:Number(raw.timestamp || raw.createdAt || 0) || now(),
    createdAt:Number(raw.createdAt || raw.timestamp || 0) || now()
  };
}

function flySocialProfileMap(uids){
  const profiles = {};
  (uids || []).filter(Boolean).forEach(uid=>{
    profiles[uid] = publicFlyProfile(flyPlayerStats.get(uid) || {uid});
  });
  return profiles;
}

function createFlyFriendRequest(fromUid, toUid, body){
  const safeFrom = String(fromUid || '').slice(0, 128);
  const safeTo = String(toUid || '').slice(0, 128);
  if(!safeFrom || !safeTo || safeFrom === safeTo) throw new Error('invalid friend request');
  const fromProfile = publicFlyProfile(Object.assign({}, body?.profile || body || {}, {uid:safeFrom})) || {name:'Player', baseCode:''};
  const request = publicFlyFriendRequest({
    fromUid:safeFrom,
    toUid:safeTo,
    fromName:fromProfile.name || fromProfile.displayName || 'Player',
    fromCode:fromProfile.baseCode || '',
    status:'pending',
    createdAt:now(),
    updatedAt:now()
  });
  flyFriendRequests.set(friendRequestKey(safeTo, safeFrom), request);
  return request;
}

function acceptFlyFriendRequest(uid, fromUid){
  const safeUid = String(uid || '').slice(0, 128);
  const safeFrom = String(fromUid || '').slice(0, 128);
  const key = friendRequestKey(safeUid, safeFrom);
  const request = flyFriendRequests.get(key);
  if(!request) throw new Error('friend request not found');
  ensureFriendSet(safeUid).add(safeFrom);
  ensureFriendSet(safeFrom).add(safeUid);
  flyFriendRequests.delete(key);
  flyFriendRequests.delete(friendRequestKey(safeFrom, safeUid));
  return request;
}

function declineFlyFriendRequest(uid, fromUid){
  const key = friendRequestKey(uid, fromUid);
  const request = flyFriendRequests.get(key) || null;
  flyFriendRequests.delete(key);
  return request;
}

function removeFlyFriend(uid, friendUid){
  const safeUid = String(uid || '').slice(0, 128);
  const safeFriend = String(friendUid || '').slice(0, 128);
  ensureFriendSet(safeUid).delete(safeFriend);
  ensureFriendSet(safeFriend).delete(safeUid);
  return true;
}

function getThreadMap(uid){
  const safeUid = String(uid || '').slice(0, 128);
  if(!flyPrivateThreads.has(safeUid)) flyPrivateThreads.set(safeUid, new Map());
  return flyPrivateThreads.get(safeUid);
}

function listFlyPrivateMessages(uid, peerUid, limit = 80){
  const key = conversationKey(uid, peerUid);
  const max = Math.min(100, Math.max(1, Number(limit || 80) || 80));
  return (flyPrivateMessages.get(key) || []).map(publicFlyPrivateMessage).filter(Boolean).slice(-max);
}

function appendFlyPrivateMessage(uid, peerUid, text, profile){
  const safeUid = String(uid || '').slice(0, 128);
  const safePeer = String(peerUid || '').slice(0, 128);
  const cleanText = sanitizeChatText(text);
  if(!safeUid || !safePeer || !cleanText) throw new Error('invalid private message');
  const cleanProfile = publicFlyProfile(Object.assign({}, profile || {}, {uid:safeUid})) || {name:'Player', photoURL:'blank.png'};
  flyPrivateMessageSeq += 1;
  const message = publicFlyPrivateMessage({
    id:`dm${flyPrivateMessageSeq}`,
    uid:safeUid,
    toUid:safePeer,
    from:cleanProfile.name || cleanProfile.displayName || 'Player',
    photoURL:cleanProfile.photoURL || cleanProfile.profileImg || 'blank.png',
    text:cleanText,
    timestamp:now(),
    createdAt:now()
  });
  const key = conversationKey(safeUid, safePeer);
  const messages = (flyPrivateMessages.get(key) || []).concat(message).slice(-200);
  flyPrivateMessages.set(key, messages);
  getThreadMap(safeUid).set(safePeer, publicFlyPrivateThread({peerUid:safePeer, lastText:cleanText, lastAt:message.timestamp, unread:0}));
  const peerThread = getThreadMap(safePeer).get(safeUid) || {};
  getThreadMap(safePeer).set(safeUid, publicFlyPrivateThread({peerUid:safeUid, lastText:cleanText, lastAt:message.timestamp, unread:safeNonNegativeInteger(peerThread.unread, 0) + 1}));
  return message;
}

function markFlyThreadRead(uid, peerUid){
  const thread = getThreadMap(uid).get(peerUid);
  if(thread) getThreadMap(uid).set(peerUid, publicFlyPrivateThread(Object.assign({}, thread, {unread:0})));
}

function lookupFlyProfiles(term, limit = 8){
  const raw = String(term || '').trim().toLowerCase();
  if(!raw) return [];
  return [...flyPlayerStats.values()]
    .map(publicFlyProfile)
    .filter(Boolean)
    .filter(profile=>{
      return profile.uid.toLowerCase() === raw ||
        String(profile.baseCode || '').toLowerCase() === raw ||
        String(profile.name || '').toLowerCase().includes(raw) ||
        String(profile.username || '').toLowerCase().includes(raw);
    })
    .slice(0, Math.min(20, Math.max(1, Number(limit || 8) || 8)));
}

function flySocialStateFor(uid){
  const safeUid = String(uid || '').slice(0, 128);
  const base = flySocialState(safeUid);
  const friendUids = [...(flyFriends.get(safeUid) || new Set())];
  const requestEntries = {};
  for(const request of flyFriendRequests.values()){
    if(request.toUid === safeUid) requestEntries[request.fromUid] = publicFlyFriendRequest(request);
  }
  const threads = {};
  for(const [peerUid, thread] of getThreadMap(safeUid).entries()){
    threads[peerUid] = publicFlyPrivateThread(thread);
  }
  const profileUids = new Set([safeUid, ...friendUids, ...Object.keys(requestEntries), ...Object.keys(threads), ...base.onlineUids]);
  return Object.assign({}, base, {
    friends:Object.fromEntries(friendUids.map(friendUid=>[friendUid, {uid:friendUid, createdAt:now()}])),
    requests:requestEntries,
    threads,
    profiles:Object.assign({}, base.profiles, flySocialProfileMap([...profileUids]))
  });
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
    winnerIndex:resultIndexOrNull(room.winnerIndex),
    loserIndex:resultIndexOrNull(room.loserIndex),
    isDraw:!!room.isDraw,
    resultLedger:room.resultLedger || null,
    eventCount:room.eventLog.length,
    chatSeq:Number(room.chatSeq || 0) || 0,
    chat:publicChat(room, 80, 0),
    spectatorCount:Object.keys(room.spectators || {}).length,
    spectators:Object.keys(room.spectators || {}).slice(0, 200).reduce((acc, uid)=>{
      acc[uid] = publicSpectator(room.spectators[uid]);
      return acc;
    }, {}),
    sockets:room.sockets.size,
    createdAt:room.createdAt,
    updatedAt:room.updatedAt,
    lastTouched:room.lastTouched,
    players
  };
}

function publicFlyProfile(value){
  const raw = value && typeof value === 'object' ? value : {};
  const uid = String(raw.uid || '').slice(0, 128);
  if(!uid) return null;
  return {
    uid,
    name:String(raw.name || raw.username || raw.displayName || 'Player').slice(0, 32),
    username:String(raw.username || raw.name || raw.displayName || 'Player').slice(0, 32),
    displayName:String(raw.displayName || raw.name || raw.username || 'Player').slice(0, 32),
    baseCode:String(raw.baseCode || '').slice(0, 80),
    photoURL:String(raw.photoURL || raw.profileImg || 'blank.png').slice(0, 180),
    profileImg:String(raw.profileImg || raw.photoURL || 'blank.png').slice(0, 180),
    challengerElo:safeNonNegativeInteger(raw.challengerElo ?? raw.elo, 600),
    elo:safeNonNegativeInteger(raw.elo ?? raw.challengerElo, 600),
    challengerWins:safeNonNegativeInteger(raw.challengerWins ?? raw.wins, 0),
    challengerLosses:safeNonNegativeInteger(raw.challengerLosses ?? raw.losses, 0),
    wins:safeNonNegativeInteger(raw.wins ?? raw.challengerWins, 0),
    losses:safeNonNegativeInteger(raw.losses ?? raw.challengerLosses, 0),
    humanWins:safeNonNegativeInteger(raw.humanWins, 0),
    humanLosses:safeNonNegativeInteger(raw.humanLosses, 0),
    matchesPlayed:safeNonNegativeInteger(raw.matchesPlayed, 0),
    starlight:safeNonNegativeInteger(raw.starlight, 0),
    updatedAt:Number(raw.updatedAt || 0) || now(),
    source:'fly-authority'
  };
}

function upsertFlyProfile(uid, profile){
  const safeUid = String(uid || profile?.uid || '').slice(0, 128);
  if(!safeUid) return null;
  const existing = flyPlayerStats.get(safeUid) || {};
  const incoming = publicFlyProfile(Object.assign({}, profile || {}, {uid:safeUid})) || {uid:safeUid};
  const incomingMatches = safeNonNegativeInteger(incoming.matchesPlayed, 0);
  const existingMatches = safeNonNegativeInteger(existing.matchesPlayed, 0);
  const useIncomingRank = incomingMatches >= existingMatches;
  const next = publicFlyProfile(Object.assign({}, existing, incoming, {
    uid:safeUid,
    name:incoming.name || existing.name || 'Player',
    username:incoming.username || existing.username || incoming.name || 'Player',
    displayName:incoming.displayName || incoming.name || existing.displayName || 'Player',
    baseCode:incoming.baseCode || existing.baseCode || '',
    photoURL:incoming.photoURL || existing.photoURL || 'blank.png',
    profileImg:incoming.profileImg || incoming.photoURL || existing.profileImg || 'blank.png',
    challengerElo:useIncomingRank ? incoming.challengerElo : (existing.challengerElo ?? incoming.challengerElo),
    elo:useIncomingRank ? incoming.elo : (existing.elo ?? incoming.elo),
    challengerWins:Math.max(safeNonNegativeInteger(existing.challengerWins, 0), safeNonNegativeInteger(incoming.challengerWins, 0)),
    challengerLosses:Math.max(safeNonNegativeInteger(existing.challengerLosses, 0), safeNonNegativeInteger(incoming.challengerLosses, 0)),
    wins:Math.max(safeNonNegativeInteger(existing.wins, 0), safeNonNegativeInteger(incoming.wins, 0)),
    losses:Math.max(safeNonNegativeInteger(existing.losses, 0), safeNonNegativeInteger(incoming.losses, 0)),
    humanWins:Math.max(safeNonNegativeInteger(existing.humanWins, 0), safeNonNegativeInteger(incoming.humanWins, 0)),
    humanLosses:Math.max(safeNonNegativeInteger(existing.humanLosses, 0), safeNonNegativeInteger(incoming.humanLosses, 0)),
    matchesPlayed:Math.max(existingMatches, incomingMatches),
    starlight:Math.max(safeNonNegativeInteger(existing.starlight, 0), safeNonNegativeInteger(incoming.starlight, 0)),
    updatedAt:now()
  }));
  if(next?.uid) flyPlayerStats.set(next.uid, next);
  return next;
}

function publicFlyMatchResult(value){
  const raw = value && typeof value === 'object' ? value : {};
  const matchId = String(raw.matchId || '').slice(0, 220);
  if(!matchId) return null;
  return {
    matchId,
    uid:String(raw.uid || '').slice(0, 128),
    opponentUid:String(raw.opponentUid || '').slice(0, 128),
    roomCode:roomCode(raw.roomCode),
    actionSeq:Number(raw.actionSeq || 0) || 0,
    actionType:String(raw.actionType || '').slice(0, 40),
    didWin:!!raw.didWin,
    isDraw:!!raw.isDraw,
    endReason:String(raw.endReason || '').slice(0, 80),
    oldElo:Number(raw.oldElo || 0) || 0,
    newElo:Number(raw.newElo || 0) || 0,
    delta:Number(raw.delta || 0) || 0,
    source:'fly-authority',
    serverFinalized:raw.serverFinalized !== false,
    createdAt:Number(raw.createdAt || 0) || now()
  };
}

function applyFlyResultLedger(code, accepted){
  if(!PERSIST_RESULT_LEDGER) return false;
  const action = accepted?.action || {};
  const ledger = action.payload?.rewardLedger || accepted?.roomPatch?.resultLedger || null;
  if(!ledger || !ledger.serverFinalized) return false;
  const seq = Number(action.seq || 0) || 0;
  if(!seq) return false;
  const actionKey = String(seq).padStart(6, '0');
  const shouldWriteProfiles = /^(forfeit|disconnect|score|draw)$/i.test(String(ledger.endReason || ''));
  let changed = false;
  Object.keys(ledger.byUid || {}).forEach(rawUid=>{
    const entry = ledger.byUid[rawUid];
    if(!entry || !entry.uid) return;
    const matchId = `${roomCode(code)}_${actionKey}_${firebaseKeySegment(entry.uid)}`;
    const result = publicFlyMatchResult({
      matchId,
      uid:entry.uid,
      opponentUid:entry.opponentUid || '',
      roomCode:code,
      actionSeq:seq,
      actionType:String(action.type || ''),
      didWin:!!entry.didWin,
      isDraw:!!entry.isDraw,
      endReason:entry.endReason || ledger.endReason || '',
      oldElo:Number(entry.oldElo || 0) || 0,
      newElo:Number(entry.newElo || 0) || 0,
      delta:Number(entry.delta || 0) || 0,
      serverFinalized:true,
      createdAt:now()
    });
    if(result){
      flyMatchResults.set(result.matchId, result);
      changed = true;
    }
    if(!shouldWriteProfiles) return;
    const prev = flyPlayerStats.get(entry.uid) || {};
    const next = publicFlyProfile(Object.assign({}, prev, {
      uid:entry.uid,
      name:entry.name || entry.username || prev.name || 'Player',
      username:entry.username || entry.name || prev.username || 'Player',
      displayName:entry.name || entry.username || prev.displayName || 'Player',
      baseCode:entry.baseCode || prev.baseCode || '',
      photoURL:entry.photoURL || prev.photoURL || 'blank.png',
      profileImg:entry.photoURL || prev.profileImg || 'blank.png',
      challengerElo:entry.ranked ? Number(entry.newElo || prev.challengerElo || 600) : Number(prev.challengerElo || entry.newElo || 600),
      elo:entry.ranked ? Number(entry.newElo || prev.elo || 600) : Number(prev.elo || entry.newElo || 600),
      challengerWins:entry.ranked ? Number(entry.challengerWins || 0) : Number(prev.challengerWins || 0),
      challengerLosses:entry.ranked ? Number(entry.challengerLosses || 0) : Number(prev.challengerLosses || 0),
      wins:entry.ranked ? Number(entry.challengerWins || 0) : Number(prev.wins || 0),
      losses:entry.ranked ? Number(entry.challengerLosses || 0) : Number(prev.losses || 0),
      humanWins:Number(entry.humanWins ?? prev.humanWins ?? 0) || 0,
      humanLosses:Number(entry.humanLosses ?? prev.humanLosses ?? 0) || 0,
      matchesPlayed:Number(entry.matchesPlayed ?? prev.matchesPlayed ?? 0) || 0,
      starlight:Number(entry.starlightTotal ?? prev.starlight ?? 0) || 0,
      updatedAt:now()
    }));
    if(next?.uid){
      flyPlayerStats.set(next.uid, next);
      changed = true;
    }
  });
  if(flyMatchResults.size > 5000){
    const sorted = [...flyMatchResults.values()].sort((a,b)=>(Number(a.createdAt || 0) || 0) - (Number(b.createdAt || 0) || 0));
    sorted.slice(0, flyMatchResults.size - 5000).forEach(item=>flyMatchResults.delete(item.matchId));
  }
  return changed;
}

function flyLeaderboard(limit = 100){
  return [...flyPlayerStats.values()]
    .map(publicFlyProfile)
    .filter(Boolean)
    .filter(entry=>Number(entry.challengerWins || 0) || Number(entry.challengerLosses || 0) || Number(entry.matchesPlayed || 0))
    .sort((a,b)=>{
      const eloDelta = (Number(b.challengerElo || b.elo || 0) || 0) - (Number(a.challengerElo || a.elo || 0) || 0);
      if(eloDelta) return eloDelta;
      return (Number(b.updatedAt || 0) || 0) - (Number(a.updatedAt || 0) || 0);
    })
    .slice(0, Math.min(200, Math.max(1, Number(limit || 100) || 100)));
}

function listRoomsForUid(uid, opts = {}){
  const includeEnded = !!opts.includeEnded;
  const limit = Math.min(50, Math.max(1, Number(opts.limit || 20) || 20));
  return [...rooms.values()]
    .filter(room=>playerIndexForUid(room, uid) !== null)
    .filter(room=>includeEnded || room.status !== 'ended')
    .sort((a,b)=>{
      const at = Number(a.updatedAt || a.lastTouched || a.createdAt || 0) || 0;
      const bt = Number(b.updatedAt || b.lastTouched || b.createdAt || 0) || 0;
      return bt - at;
    })
    .slice(0, limit)
    .map(publicRoom);
}

function roomIsLiveForSpectating(room){
  if(!room) return false;
  return room.status === 'matchup' || room.status === 'starting' || room.status === 'playing';
}

function publicLiveMatch(room){
  if(!roomIsLiveForSpectating(room)) return null;
  const host = room.hostUid ? room.players?.[room.hostUid] : null;
  const guest = room.guestUid ? room.players?.[room.guestUid] : null;
  const hostProfile = sanitizeProfile(host?.profile || {});
  const guestProfile = sanitizeProfile(guest?.profile || {});
  return {
    roomCode:room.code,
    mode:room.mode || 'freeplay',
    status:room.status || '',
    hostUid:room.hostUid || '',
    guestUid:room.guestUid || '',
    hostName:hostProfile.displayName || hostProfile.username || 'Player',
    hostPhoto:hostProfile.photoURL || hostProfile.profileImg || 'blank.png',
    hostElo:safeNonNegativeInteger(hostProfile.challengerElo ?? hostProfile.elo, 600),
    guestName:guestProfile.displayName || guestProfile.username || 'Player',
    guestPhoto:guestProfile.photoURL || guestProfile.profileImg || 'blank.png',
    guestElo:safeNonNegativeInteger(guestProfile.challengerElo ?? guestProfile.elo, 600),
    spectators:Object.keys(room.spectators || {}).length,
    spectatorCount:Object.keys(room.spectators || {}).length,
    startedAt:Number(room.startedAt || room.createdAt || 0) || 0,
    updatedAt:Number(room.updatedAt || room.lastTouched || 0) || 0
  };
}

function listFlyLiveMatches(limit = 16){
  const max = Math.min(50, Math.max(1, Number(limit || 16) || 16));
  return [...rooms.values()]
    .map(publicLiveMatch)
    .filter(Boolean)
    .sort((a, b)=>(Number(b.updatedAt || b.startedAt || 0) || 0) - (Number(a.updatedAt || a.startedAt || 0) || 0))
    .slice(0, max);
}

function publicSpectator(value){
  const raw = value && typeof value === 'object' ? value : {};
  const uid = String(raw.uid || '').slice(0, 128);
  if(!uid) return null;
  return {
    uid,
    joinedAt:Number(raw.joinedAt || 0) || now(),
    lastSeen:Number(raw.lastSeen || 0) || now()
  };
}

function roomViewerIndexForUid(room, uid){
  if(playerIndexForUid(room, uid) !== null) return 'player';
  return room?.spectators?.[uid] ? 'spectator' : null;
}

function joinRoomSpectator(room, uid){
  if(!room || !uid) throw new Error('room not found');
  if(!roomIsLiveForSpectating(room)) throw new Error('room is not live');
  if(!room.spectators || typeof room.spectators !== 'object') room.spectators = {};
  const existing = room.spectators[uid] || {};
  room.spectators[uid] = publicSpectator({
    uid,
    joinedAt:existing.joinedAt || now(),
    lastSeen:now()
  });
  touch(room);
  persistFlyRoomMutation();
  return room.spectators[uid];
}

function heartbeatRoomSpectator(room, uid){
  if(!room || !uid) throw new Error('room not found');
  if(!room.spectators?.[uid]) throw new Error('user is not spectating this room');
  room.spectators[uid] = publicSpectator(Object.assign({}, room.spectators[uid], {lastSeen:now()}));
  touch(room);
  persistFlyRoomMutation();
  return room.spectators[uid];
}

function leaveRoomSpectator(room, uid){
  if(!room || !uid) return false;
  const had = !!room.spectators?.[uid];
  if(had) delete room.spectators[uid];
  touch(room);
  persistFlyRoomMutation();
  return had;
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

function hasReadyDeckChoice(player){
  const deck = player?.deckChoice || {};
  return !!deck.ready && Array.isArray(deck.deckIds) && deck.deckIds.length === 40;
}

function removeMatchmakingEntry(uid){
  const key = String(uid || '').slice(0, 128);
  const entry = matchmaking.get(key) || null;
  matchmaking.delete(key);
  if(entry?.role === 'host' && isRoomCode(entry.roomCode)){
    const room = rooms.get(roomCode(entry.roomCode));
    if(room && room.status === 'lobby' && room.hostUid === key && !room.guestUid){
      clearAllDisconnectTimers(room);
      rooms.delete(room.code);
    }
  }
  persistFlyRoomMutation();
  return entry;
}

function createMatchmakingHostRoom(uid, body, profile, deckChoice, mode){
  const code = generateRoomCode();
  const room = getRoom(code);
  room.mode = mode;
  room.status = 'lobby';
  room.phase = 'lobby';
  room.hostUid = uid;
  room.guestUid = '';
  room.playerOrder[0] = uid;
  room.matchmaking = true;
  const player = upsertRoomPlayer(room, uid, 'host', profile, deckChoice);
  if(player) player.connected = true;
  const entry = publicMatchmakingEntry({
    uid,
    mode,
    status:'waiting',
    queueKey:matchmakingQueueKey(mode, 'waiting', body.partyTargetUid ? uid : ''),
    role:'host',
    roomCode:code,
    name:profile.displayName || profile.username || 'Player',
    photoURL:profile.photoURL || profile.profileImg || '',
    elo:profile.challengerElo || profile.elo || 600,
    deckName:deckChoice.name,
    partyTargetUid:String(body.partyTargetUid || '').slice(0, 128),
    createdAt:now(),
    updatedAt:now()
  });
  matchmaking.set(uid, entry);
  touch(room);
  persistFlyRoomMutation();
  return {room, entry};
}

function findFlyMatchmakingOpponent(uid, mode, partyTargetUid){
  const targetUid = String(partyTargetUid || '').slice(0, 128);
  const candidates = [...matchmaking.values()]
    .filter(entry=>{
      if(!entry || entry.uid === uid || entry.status !== 'waiting') return false;
      if(normalizeRoomMode(entry.mode) !== mode) return false;
      if(!isRoomCode(entry.roomCode)) return false;
      if(targetUid) return entry.uid === targetUid && String(entry.partyTargetUid || '') === uid;
      return !entry.partyTargetUid;
    })
    .sort((a, b)=>(Number(a.createdAt || 0) || 0) - (Number(b.createdAt || 0) || 0));
  for(const entry of candidates){
    const room = rooms.get(roomCode(entry.roomCode));
    if(!room || room.status !== 'lobby' || room.hostUid !== entry.uid) continue;
    if(room.guestUid) continue;
    const host = room.players?.[room.hostUid];
    if(!host || host.connected === false || !hasReadyDeckChoice(host)) continue;
    return {entry, room};
  }
  return null;
}

function enterFlyMatchmaking(uid, body){
  const mode = normalizeRoomMode(body.mode);
  const profile = sanitizeProfile(body.profile);
  const deckChoice = sanitizeDeckChoice(body.deckChoice);
  if(!deckChoice.ready || deckChoice.deckIds.length !== 40) throw new Error('matchmaking requires a 40-card deck');
  const partyTargetUid = String(body.partyTargetUid || '').slice(0, 128);
  removeMatchmakingEntry(uid);
  const match = findFlyMatchmakingOpponent(uid, mode, partyTargetUid);
  if(match){
    const {entry, room} = match;
    room.guestUid = uid;
    room.playerOrder[1] = uid;
    const player = upsertRoomPlayer(room, uid, 'guest', profile, deckChoice);
    if(player) player.connected = true;
    matchmaking.delete(entry.uid);
    matchmaking.delete(uid);
    touch(room);
    persistFlyRoomMutation();
    return {matched:true, role:'guest', room, entry:publicMatchmakingEntry(Object.assign({}, entry, {status:'matched', matchedUid:uid}))};
  }
  const created = createMatchmakingHostRoom(uid, body, profile, deckChoice, mode);
  return {matched:false, role:'host', room:created.room, entry:created.entry};
}

function removeRoomMatchmakingEntries(room){
  if(!room) return;
  [room.hostUid, room.guestUid].filter(Boolean).forEach(uid=>matchmaking.delete(uid));
}

function leaveFlyRoom(room, uid){
  if(!room || !uid) throw new Error('room not found');
  const playerIndex = playerIndexForUid(room, uid);
  if(playerIndex === null) throw new Error('user is not seated in this room');
  const status = String(room.status || 'lobby');
  if(status === 'lobby'){
    if(room.hostUid === uid){
      removeRoomMatchmakingEntries(room);
      clearAllDisconnectTimers(room);
      clearReactionTimer(room);
      rooms.delete(room.code);
      persistFlyRoomMutation();
      return {deleted:true, room:null};
    }
    delete room.players[uid];
    if(room.guestUid === uid) room.guestUid = '';
    if(room.playerOrder?.[1] === uid) room.playerOrder[1] = '';
    matchmaking.delete(uid);
    touch(room);
    persistFlyRoomMutation();
    return {deleted:false, room};
  }
  const player = room.players?.[uid];
  if(player){
    player.connected = false;
    player.lastSeen = now();
    scheduleDisconnectTimer(room, uid);
  }
  touch(room);
  persistFlyRoomMutation();
  return {deleted:false, room};
}

function heartbeatFlyRoom(room, uid){
  if(!room || !uid) throw new Error('room not found');
  if(playerIndexForUid(room, uid) === null) throw new Error('user is not seated in this room');
  const player = room.players?.[uid];
  if(!player) throw new Error('user is not seated in this room');
  player.connected = true;
  player.lastSeen = now();
  clearDisconnectTimer(room, uid);
  touch(room);
  persistFlyRoomMutation();
  return publicPlayer(player);
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

function setRoomPlayerProgress(room, uid, progress){
  if(!room || !uid || !room.players[uid]) throw new Error('user is not seated in this room');
  const src = progress && typeof progress === 'object' ? progress : {};
  const seq = Math.max(0, Number(src.actionSeq || src.seq || 0) || 0);
  const player = room.players[uid];
  player.actionSeq = Math.max(Number(player.actionSeq || 0) || 0, seq);
  player.actionSeqClientAt = Math.max(Number(player.actionSeqClientAt || 0) || 0, Number(src.clientAt || 0) || 0);
  player.actionSeqServerAt = now();
  player.lastSeen = now();
  player.connected = true;
  clearDisconnectTimer(room, uid);
  touch(room);
  persistFlyRoomMutation();
  return publicPlayer(player);
}

function appendRoomChat(room, uid, text, profile){
  if(!room || !uid) throw new Error('room not found');
  const viewerRole = roomViewerIndexForUid(room, uid);
  if(!viewerRole) throw new Error('user is not seated or spectating this room');
  const cleanText = sanitizeChatText(text);
  if(!cleanText) throw new Error('empty chat message');
  const playerProfile = sanitizeProfile(profile || room.players?.[uid]?.profile || null);
  const seq = Math.max(Number(room.chatSeq || 0) || 0, ...((Array.isArray(room.chat) ? room.chat : []).map(msg=>Number(msg?.seq || 0) || 0))) + 1;
  const msg = {
    id:`c${seq}_${crypto.randomBytes(4).toString('hex')}`,
    seq,
    uid,
    text:cleanText,
    name:viewerRole === 'spectator' ? 'Spectator' : (playerProfile.displayName || playerProfile.username || 'Player'),
    createdAt:now(),
    isSpectator:viewerRole === 'spectator'
  };
  if(!Array.isArray(room.chat)) room.chat = [];
  room.chat.push(msg);
  if(room.chat.length > 100) room.chat.splice(0, room.chat.length - 100);
  room.chatSeq = seq;
  touch(room);
  persistFlyRoomMutation();
  broadcast(room, {kind:'room-chat', roomCode:room.code, message:publicChatMessage(msg), chatSeq:room.chatSeq});
  return publicChatMessage(msg);
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
  if(FIREBASE_RTDB_DISABLED) return false;
  const sa = getServiceAccount();
  return !!(FIREBASE_DATABASE_URL && sa && sa.client_email && sa.private_key);
}

function shouldUseDurableWrites(){
  if(FIREBASE_RTDB_DISABLED) return false;
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
  if(type === 'REACTION_CHOICE'){
    const pending = room.canonicalState?._serverPendingReaction;
    if(!pending || Number(pending.playerIndex) !== playerIndex) return 'no pending reaction for this player';
  }
  if(type !== 'FORFEIT' && type !== 'CHOOSE_TURN' && type !== 'STATE_SYNC' && type !== 'REACTION_CHOICE' && type !== 'PICK_LANDSCAPE_ZONE'){
    const turnUid = room.currentTurnUid || room.playerOrder[0];
    if(turnUid && turnUid !== uid) return 'not this player turn';
  }
  if(type === 'CHOOSE_TURN'){
    const winner = Number(payload.playerIndex);
    if(winner !== playerIndex) return 'coin winner mismatch';
  }
  if(type === 'MATCH_RESULT' && !STATE_GATE_ENABLED) return 'MATCH_RESULT requires server state gate';
  if(!/^(STATE_SYNC|END_TURN|CHOOSE_TURN|START_CONSOLIDATE|CLICK_CELL|BOARD_ACTION|HAND_ACTION|MODAL_ACTION|PICK_CARDS_VISUAL|PICK_ZONE|PICK_AFFILIATION|PICK_LANDSCAPE_ZONE|REACTION_CHOICE|EFFECT_CINEMATIC|FORFEIT|MATCH_RESULT)$/i.test(type)){
    return 'unknown action type';
  }
  const compactStrictIntent = STATE_GATE_ENABLED && REDUCER_MODE === 'strict' && type !== 'STATE_SYNC' && type !== 'EFFECT_CINEMATIC';
  if(!compactStrictIntent && type !== 'FORFEIT' && type !== 'MATCH_RESULT' && type !== 'REACTION_CHOICE' && !payload.postState){
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

function challengerEloForPlayer(room, index){
  const uid = room.playerOrder?.[index] || '';
  const profile = uid ? room.players?.[uid]?.profile || {} : {};
  return safeNonNegativeInteger(profile.challengerElo ?? profile.elo, 600);
}

function applyMinimumEloDelta(rawChange, didWin){
  let change = Math.round(safeNumber(rawChange, 0));
  if(didWin && change < 1) change = 1;
  if(!didWin && change > -1) change = -1;
  return change;
}

function calculateXpReward(didWin, opponentElo){
  let xp = 15;
  if(didWin) xp += 30;
  xp += Math.max(0, Math.round((safeNumber(opponentElo, 1000) - 800) / 40));
  return Math.max(10, xp);
}

function calculateStarlight(opponentElo, isAI){
  const base = 20;
  const eloScaling = Math.max(0, Math.round((safeNumber(opponentElo, 1000) - 600) / 15));
  let amount = base + eloScaling;
  if(isAI) amount = Math.max(1, Math.round(amount / 2));
  else amount *= 3;
  return Math.round(amount);
}

function buildPlayerRewardEntry(room, result, index, ranked, endReason){
  const uid = room.playerOrder?.[index] || '';
  const opponentIndex = index === 0 ? 1 : 0;
  const oldElo = challengerEloForPlayer(room, index);
  const opponentElo = challengerEloForPlayer(room, opponentIndex);
  const profile = uid ? room.players?.[uid]?.profile || {} : {};
  const isDraw = !!result?.isDraw || Number(result?.winnerIndex) < 0;
  const didWin = !isDraw && Number(result?.winnerIndex) === index;
  const didLose = !isDraw && !didWin;
  const noXpEnd = endReason === 'forfeit' || endReason === 'disconnect';
  let delta = 0;
  let newElo = oldElo;
  if(ranked && !isDraw){
    const k = didWin ? 32 : 40;
    const expected = 1 / (1 + Math.pow(10, (opponentElo - oldElo) / 400));
    delta = applyMinimumEloDelta(k * ((didWin ? 1 : 0) - expected), didWin);
    newElo = Math.max(0, oldElo + delta);
  }
  let xpGained = 0;
  if(!noXpEnd){
    if(isDraw) xpGained = ranked ? 12 : 8;
    else xpGained = ranked ? calculateXpReward(didWin, opponentElo) : Math.floor(calculateXpReward(didWin, opponentElo) * 0.5);
  }
  const starlightGained = ranked && didWin ? Math.max(1, calculateStarlight(opponentElo, false)) : 0;
  const challengerWins = safeNonNegativeInteger(profile.challengerWins ?? profile.wins, 0) + (ranked && didWin ? 1 : 0);
  const challengerLosses = safeNonNegativeInteger(profile.challengerLosses ?? profile.losses, 0) + (ranked && didLose ? 1 : 0);
  const humanWins = safeNonNegativeInteger(profile.humanWins, 0) + (didWin ? 1 : 0);
  const humanLosses = safeNonNegativeInteger(profile.humanLosses, 0) + (didLose ? 1 : 0);
  return {
    uid,
    playerIndex:index,
    name:String(profile.displayName || profile.username || 'Player').slice(0, 32),
    username:String(profile.username || profile.displayName || 'Player').slice(0, 32),
    baseCode:String(profile.baseCode || '').slice(0, 80),
    photoURL:String(profile.photoURL || profile.profileImg || 'blank.png').slice(0, 180),
    outcome:isDraw ? 'draw' : (didWin ? 'victory' : 'defeat'),
    ranked,
    endReason,
    didWin,
    isDraw,
    opponentUid:room.playerOrder?.[opponentIndex] || '',
    opponentElo,
    oldElo,
    newElo,
    delta,
    challengerWins,
    challengerLosses,
    humanWins,
    humanLosses,
    matchesPlayed:safeNonNegativeInteger(profile.matchesPlayed, 0) + 1,
    xpGained,
    starlightGained,
    starlightTotal:safeNonNegativeInteger(profile.starlight, 0) + starlightGained,
    serverFinalized:true
  };
}

function buildResultLedger(room, action, patch){
  if(!room || !action || !patch || patch.status !== 'ended') return null;
  const rawResult = action.payload?.postState?.matchResult || action.payload?.matchResult || {};
  const result = Object.assign({}, rawResult, {
    winnerIndex:patch.isDraw ? -1 : (patch.winnerIndex ?? rawResult.winnerIndex),
    loserIndex:patch.isDraw ? -1 : (patch.loserIndex ?? rawResult.loserIndex),
    isDraw:!!patch.isDraw,
    endedAt:patch.endedAt || rawResult.endedAt
  });
  const endReason = String(patch.endReason || result.reason || action.type || '').toLowerCase();
  const ranked = String(room.mode || '').toLowerCase() === 'ranked' || String(room.mode || '').toLowerCase() === 'challenger';
  const endedAt = Number(patch.endedAt || result.endedAt || 0) || now();
  const byIndex = {
    0:buildPlayerRewardEntry(room, result, 0, ranked, endReason),
    1:buildPlayerRewardEntry(room, result, 1, ranked, endReason)
  };
  const byUid = {};
  Object.keys(byIndex).forEach(index=>{
    const entry = byIndex[index];
    if(entry.uid) byUid[entry.uid] = entry;
  });
  return {
    schemaVersion:1,
    authority:'fate-ws-authority',
    serverFinalized:true,
    roomCode:room.code,
    mode:room.mode || 'freeplay',
    ranked,
    endReason,
    endedAt,
    winnerIndex:resultIndexOrNull(patch.winnerIndex),
    loserIndex:resultIndexOrNull(patch.loserIndex),
    winnerUid:patch.winnerUid || '',
    loserUid:patch.loserUid || '',
    isDraw:!!patch.isDraw,
    byIndex,
    byUid
  };
}

function attachResultLedger(room, action, patch){
  const ledger = buildResultLedger(room, action, patch);
  if(!ledger) return null;
  action.payload = Object.assign({}, action.payload || {}, {rewardLedger:ledger});
  patch.resultLedger = ledger;
  return ledger;
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
  if(action.type === 'DISCONNECT_TIMEOUT'){
    const loserIndex = Number(payload.playerIndex);
    const winnerIndex = loserIndex === 0 ? 1 : 0;
    patch.status = 'ended';
    patch.phase = 'ended';
    patch.endedBy = room.playerOrder[winnerIndex] || '';
    patch.endReason = 'disconnect';
    patch.endedAt = Number(payload.endedAt || 0) || now();
    patch.loserIndex = loserIndex;
    patch.winnerIndex = winnerIndex;
    patch.loserUid = room.playerOrder[loserIndex] || action.uid || '';
    patch.winnerUid = room.playerOrder[winnerIndex] || '';
    patch.isDraw = false;
  }
  if(action.type === 'MATCH_RESULT'){
    const result = payload.postState?.matchResult || payload.matchResult || {};
    const winnerIndex = Number(result.winnerIndex);
    const loserIndex = Number(result.loserIndex);
    patch.status = 'ended';
    patch.phase = 'ended';
    patch.endedBy = action.uid;
    patch.endReason = result.isDraw ? 'draw' : 'score';
    patch.endedAt = Number(result.endedAt || 0) || now();
    if(Number.isInteger(winnerIndex) && winnerIndex >= 0 && winnerIndex <= 1){
      patch.winnerIndex = winnerIndex;
      patch.winnerUid = room.playerOrder[winnerIndex] || '';
    }else{
      patch.winnerIndex = null;
      patch.winnerUid = '';
    }
    if(Number.isInteger(loserIndex) && loserIndex >= 0 && loserIndex <= 1){
      patch.loserIndex = loserIndex;
      patch.loserUid = room.playerOrder[loserIndex] || '';
    }else{
      patch.loserIndex = null;
      patch.loserUid = '';
    }
    patch.isDraw = !!result.isDraw;
  }
  return patch;
}

function clearDisconnectTimer(room, uid){
  if(!room || !uid || !room.disconnectTimers) return;
  const timer = room.disconnectTimers[uid];
  if(timer) clearTimeout(timer);
  delete room.disconnectTimers[uid];
}

function clearAllDisconnectTimers(room){
  if(!room || !room.disconnectTimers) return;
  Object.keys(room.disconnectTimers).forEach(uid=>clearDisconnectTimer(room, uid));
}

async function finalizeDisconnectTimeout(roomCodeValue, uid){
  const code = roomCode(roomCodeValue);
  const room = rooms.get(code);
  if(!room) return null;
  return enqueueRoomAction(room, ()=>finalizeDisconnectTimeoutQueued(code, uid));
}

async function finalizeDisconnectTimeoutQueued(roomCodeValue, uid){
  const code = roomCode(roomCodeValue);
  const room = rooms.get(code);
  if(!room || room.status === 'ended' || room.status === 'lobby') return null;
  const player = room.players?.[uid];
  if(!player || player.connected !== false) return null;
  const loserIndex = playerIndexForUid(room, uid);
  if(loserIndex === null) return null;
  const winnerIndex = loserIndex === 0 ? 1 : 0;
  const winnerUid = room.playerOrder[winnerIndex] || '';
  if(!winnerUid) return null;
  const msg = {
    type:'DISCONNECT_TIMEOUT',
    payload:{
      playerIndex:loserIndex,
      disconnectedUid:uid,
      winnerIndex,
      endedAt:now()
    }
  };
  const gateResult = reduceServerAction(room, msg, {
    mode:REDUCER_MODE === 'lineage' ? 'turns' : REDUCER_MODE,
    requireBaseHash:false,
    allowStateSyncAfterBootstrap:false,
    allowClientBootstrap:false,
    requireCatalogForCards:REDUCER_MODE === 'strict',
    cardCatalog:authorityCardCatalog()
  });
  if(!gateResult.ok) throw new Error(gateResult.reason || 'disconnect timeout reducer rejected');
  const nextSeq = room.lastSeq + 1;
  const action = {
    seq:nextSeq,
    uid:winnerUid,
    type:'DISCONNECT_TIMEOUT',
    payload:Object.assign({}, msg.payload, {
      postState:gateResult.canonicalState,
      stateHash:gateResult.canonicalHash,
      serverReduced:true,
      reducerMode:REDUCER_MODE
    }),
    clientActionId:'',
    serverAuthoritative:true,
    authority:'fate-ws-authority',
    authorityTime:now()
  };
  const roomPatch = roomPatchForAction(room, action);
  attachResultLedger(room, action, roomPatch);
  const accepted = {kind:'accepted', requestId:'', roomCode:code, action, roomPatch, durableWrite:false, flyEventLog:true, serverGenerated:true};
  accepted.durableWrite = await persistAcceptedActionToFirebase(code, accepted);
  room.lastSeq = nextSeq;
  applyAuthorityStateGate(room, gateResult);
  room.lastStateHash = String(room.canonicalHash || action.payload.stateHash || room.lastStateHash || '');
  accepted.serverStateHash = room.canonicalHash || room.lastStateHash || '';
  applyRoomPatch(room, roomPatch);
  clearAllDisconnectTimers(room);
  appendRoomEvent(room, accepted);
  broadcast(room, accepted);
  return accepted;
}

function scheduleDisconnectTimer(room, uid, delayMs){
  if(!room || !uid || DISCONNECT_TIMEOUT_MS <= 0) return;
  if(room.status === 'lobby' || room.status === 'ended') return;
  if(!room.canonicalState || !room.canonicalHash) return;
  if(!room.disconnectTimers) room.disconnectTimers = {};
  clearDisconnectTimer(room, uid);
  const ms = Math.max(1, Math.min(DISCONNECT_TIMEOUT_MS, Math.round(Number(delayMs ?? DISCONNECT_TIMEOUT_MS) || DISCONNECT_TIMEOUT_MS)));
  room.disconnectTimers[uid] = setTimeout(()=>{
    clearDisconnectTimer(room, uid);
    finalizeDisconnectTimeout(room.code, uid).catch(err=>{
      console.error('Disconnect timeout finalization failed:', err.message || err);
    });
  }, ms);
  room.disconnectTimers[uid].unref?.();
}

function clearReactionTimer(room){
  if(!room) return;
  if(room.reactionTimer) clearTimeout(room.reactionTimer);
  room.reactionTimer = null;
  room.reactionTimerPromptId = '';
}

async function finalizeReactionTimeout(roomCodeValue, promptId){
  const code = roomCode(roomCodeValue);
  const room = rooms.get(code);
  if(!room) return null;
  return enqueueRoomAction(room, ()=>finalizeReactionTimeoutQueued(code, promptId));
}

async function finalizeReactionTimeoutQueued(roomCodeValue, promptId){
  const code = roomCode(roomCodeValue);
  const room = rooms.get(code);
  if(!room || room.status === 'ended' || room.status === 'lobby') return null;
  const pending = room.canonicalState?._serverPendingReaction;
  if(!pending || String(pending.promptId || '') !== String(promptId || '')) return null;
  const playerIndex = Number(pending.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return null;
  const baseStateHash = room.canonicalHash || '';
  const msg = {
    type:'REACTION_CHOICE',
    payload:{
      playerIndex,
      promptId:String(pending.promptId || ''),
      choice:'timeout',
      autoTimeout:true,
      baseStateHash
    }
  };
  const gateResult = reduceServerAction(room, msg, {
    mode:REDUCER_MODE === 'lineage' ? 'turns' : REDUCER_MODE,
    requireBaseHash:true,
    allowStateSyncAfterBootstrap:false,
    allowClientBootstrap:false,
    requireCatalogForCards:REDUCER_MODE === 'strict',
    cardCatalog:authorityCardCatalog()
  });
  if(!gateResult.ok) throw new Error(gateResult.reason || 'reaction timeout reducer rejected');
  const nextSeq = room.lastSeq + 1;
  const action = {
    seq:nextSeq,
    uid:'server:reaction-timeout',
    type:'REACTION_CHOICE',
    payload:Object.assign({}, msg.payload, {
      postState:gateResult.canonicalState,
      stateHash:gateResult.canonicalHash,
      serverReduced:true,
      reducerMode:REDUCER_MODE
    }),
    clientActionId:'',
    serverAuthoritative:true,
    authority:'fate-ws-authority',
    authorityTime:now()
  };
  const roomPatch = roomPatchForAction(room, action);
  const accepted = {kind:'accepted', requestId:'', roomCode:code, action, roomPatch, durableWrite:false, flyEventLog:true, serverGenerated:true};
  accepted.durableWrite = await persistAcceptedActionToFirebase(code, accepted);
  room.lastSeq = nextSeq;
  applyAuthorityStateGate(room, gateResult);
  room.lastStateHash = String(room.canonicalHash || action.payload.stateHash || room.lastStateHash || '');
  accepted.serverStateHash = room.canonicalHash || room.lastStateHash || '';
  applyRoomPatch(room, roomPatch);
  clearReactionTimer(room);
  appendRoomEvent(room, accepted);
  broadcast(room, accepted);
  scheduleReactionTimer(room);
  return accepted;
}

function scheduleReactionTimer(room){
  if(!room || REACTION_TIMEOUT_MS <= 0) return;
  if(room.status === 'lobby' || room.status === 'ended') return clearReactionTimer(room);
  const pending = room.canonicalState?._serverPendingReaction;
  const promptId = String(pending?.promptId || '');
  if(!promptId) return clearReactionTimer(room);
  if(room.reactionTimer && room.reactionTimerPromptId === promptId) return;
  clearReactionTimer(room);
  room.reactionTimerPromptId = promptId;
  room.reactionTimer = setTimeout(()=>{
    finalizeReactionTimeout(room.code, promptId).catch(err=>{
      console.error('Reaction timeout finalization failed:', err.message || err);
    });
  }, REACTION_TIMEOUT_MS);
  room.reactionTimer.unref?.();
}

function applyRoomPatch(room, patch){
  if(!room || !patch) return;
  if(patch.currentTurnUid) room.currentTurnUid = String(patch.currentTurnUid);
  if(patch.status) room.status = String(patch.status).slice(0, 32);
  if(patch.phase) room.phase = String(patch.phase).slice(0, 32);
  if(room.status === 'ended'){
    clearAllDisconnectTimers(room);
    clearReactionTimer(room);
  }
  if(patch.endedBy) room.endedBy = String(patch.endedBy).slice(0, 128);
  if(patch.endReason) room.endReason = String(patch.endReason).slice(0, 80);
  if(patch.winnerUid !== undefined) room.winnerUid = String(patch.winnerUid || '').slice(0, 128);
  if(patch.loserUid !== undefined) room.loserUid = String(patch.loserUid || '').slice(0, 128);
  if(patch.winnerIndex !== undefined) room.winnerIndex = resultIndexOrNull(patch.winnerIndex);
  if(patch.loserIndex !== undefined) room.loserIndex = resultIndexOrNull(patch.loserIndex);
  if(patch.isDraw !== undefined) room.isDraw = !!patch.isDraw;
  if(patch.resultLedger !== undefined) room.resultLedger = patch.resultLedger || null;
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
  applyFlyResultLedger(room.code, accepted);
  try{
    appendFlyEvent(room.code, accepted);
    persistFlyRoomsSnapshot();
  }catch(e){
    console.error('Fly durable event persist failed:', e.message || e);
  }
}

function findAcceptedClientAction(room, uid, clientActionId){
  const id = String(clientActionId || '');
  if(!room || !uid || !id) return null;
  for(let i = room.eventLog.length - 1; i >= 0; i -= 1){
    const accepted = room.eventLog[i];
    const action = accepted?.action;
    if(!action || action.uid !== uid) continue;
    if(String(action.clientActionId || '') === id) return accepted;
  }
  return null;
}

function replayAcceptedClientAction(ws, accepted, requestId){
  if(!accepted?.action) return false;
  const replay = parseJson(safeJson(accepted)) || Object.assign({}, accepted);
  replay.requestId = String(requestId || '');
  replay.idempotentReplay = true;
  replay.serverSeq = Number(replay.action?.seq || 0) || 0;
  send(ws, replay);
  return true;
}

function persistFlyRoomMutation(){
  try{
    persistFlyRoomsSnapshot();
  }catch(e){
    console.error('Fly durable room persist failed:', e.message || e);
  }
}

async function startRoomOnFly(room, uid, body){
  return enqueueRoomAction(room, ()=>startRoomOnFlyQueued(room, uid, body));
}

async function startRoomOnFlyQueued(room, uid, body){
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

function firebaseResultLedgerPatch(code, accepted){
  if(!PERSIST_RESULT_LEDGER) return {};
  const action = accepted?.action || {};
  const ledger = action.payload?.rewardLedger || accepted?.roomPatch?.resultLedger || null;
  if(!ledger || !ledger.serverFinalized) return {};
  const seq = Number(action.seq || 0) || 0;
  if(!seq) return {};
  const roomKey = firebaseKeySegment(code);
  const actionKey = String(seq).padStart(6, '0');
  const patch = {
    [`serverMatchRewardLedgers/${roomKey}/${actionKey}`]: Object.assign({}, ledger, {
      actionSeq:seq,
      actionType:String(action.type || ''),
      createdAt:{'.sv':'timestamp'}
    })
  };
  const shouldWriteProfiles = /^(forfeit|disconnect|score|draw)$/i.test(String(ledger.endReason || ''));
  Object.keys(ledger.byUid || {}).forEach(rawUid=>{
    const entry = ledger.byUid[rawUid];
    if(!entry || !entry.uid) return;
    const uidKey = firebaseKeySegment(entry.uid);
    const matchId = `${roomKey}_${actionKey}_${uidKey}`;
    patch[`matchResults/${matchId}`] = {
      matchId,
      uid:entry.uid,
      opponentUid:entry.opponentUid || '',
      roomCode:code,
      actionSeq:seq,
      actionType:String(action.type || ''),
      didWin:!!entry.didWin,
      isDraw:!!entry.isDraw,
      endReason:entry.endReason || ledger.endReason || '',
      oldElo:Number(entry.oldElo || 0) || 0,
      newElo:Number(entry.newElo || 0) || 0,
      delta:Number(entry.delta || 0) || 0,
      source:'fly-authority',
      serverFinalized:true,
      createdAt:{'.sv':'timestamp'}
    };
    if(!shouldWriteProfiles || !entry.ranked) return;
    patch[`leaderboards/challenger/${uidKey}`] = {
      uid:entry.uid,
      name:entry.name || entry.username || 'Player',
      baseCode:entry.baseCode || '',
      photoURL:entry.photoURL || 'blank.png',
      elo:Number(entry.newElo || 0) || 0,
      wins:Number(entry.challengerWins || 0) || 0,
      losses:Number(entry.challengerLosses || 0) || 0,
      updatedAt:{'.sv':'timestamp'}
    };
    patch[`publicProfiles/${uidKey}/challengerElo`] = Number(entry.newElo || 0) || 0;
    patch[`publicProfiles/${uidKey}/challengerWins`] = Number(entry.challengerWins || 0) || 0;
    patch[`publicProfiles/${uidKey}/challengerLosses`] = Number(entry.challengerLosses || 0) || 0;
    patch[`publicProfiles/${uidKey}/humanWins`] = Number(entry.humanWins || 0) || 0;
    patch[`publicProfiles/${uidKey}/humanLosses`] = Number(entry.humanLosses || 0) || 0;
    patch[`publicProfiles/${uidKey}/matchesPlayed`] = Number(entry.matchesPlayed || 0) || 0;
    if(Number(entry.starlightGained || 0) > 0){
      patch[`publicProfiles/${uidKey}/starlight`] = Number(entry.starlightTotal || 0) || 0;
    }
    patch[`publicProfiles/${uidKey}/updatedAt`] = {'.sv':'timestamp'};
  });
  return patch;
}

async function persistAcceptedActionToFirebase(code, accepted){
  if(FIREBASE_RTDB_DISABLED){
    if(REQUIRE_DURABLE_WRITES) throw new Error('Firebase RTDB durable writes are required but FATE_WS_DISABLE_FIREBASE_RTDB is enabled');
    accepted.resultLedgerWrite = false;
    accepted.firebaseRtdbDisabled = true;
    return false;
  }
  if(!shouldUseDurableWrites()){
    if(REQUIRE_DURABLE_WRITES) throw new Error('Firebase durable writes are required but service account credentials are not configured');
    accepted.resultLedgerWrite = false;
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
  Object.assign(patch, firebaseResultLedgerPatch(code, accepted));
  accepted.resultLedgerWrite = !!(accepted.action?.payload?.rewardLedger && PERSIST_RESULT_LEDGER);
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
  if(FIREBASE_RTDB_DISABLED) return null;
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
  clearDisconnectTimer(room, uid);
  touch(room);
  send(ws, {
    kind:'hello-ok',
    roomCode:code,
    playerIndex,
    lastSeq:room.lastSeq,
    currentTurnUid:room.currentTurnUid,
    flyEventLog:true,
    protocolVersion:2,
    reducerMode:REDUCER_MODE,
    serverStateHash:room.canonicalHash || room.lastStateHash || '',
    serverTime:now()
  });
}

async function handleIntent(ws, msg){
  const code = roomCode(msg.roomCode || ws.fateRoomCode);
  const room = rooms.get(code);
  if(!room) throw new Error('join room before sending actions');
  return enqueueRoomAction(room, ()=>handleIntentQueued(ws, msg));
}

async function handleIntentQueued(ws, msg){
  const code = roomCode(msg.roomCode || ws.fateRoomCode);
  const room = rooms.get(code);
  if(!room || !room.sockets.has(ws)) throw new Error('join room before sending actions');
  touch(room);
  const clientActionId = String(msg.clientActionId || msg.payload?.clientActionId || '');
  const priorAccepted = findAcceptedClientAction(room, ws.fateUid, clientActionId);
  if(priorAccepted){
    const priorType = String(priorAccepted.action?.type || '').toUpperCase();
    const retryType = String(msg.type || '').toUpperCase();
    if(priorType && retryType && priorType !== retryType){
      send(ws, {
        kind:'rejected',
        requestId:msg.requestId || '',
        reason:'clientActionId already used for a different action type',
        serverSeq:room.lastSeq,
        serverStateHash:room.canonicalHash || room.lastStateHash || ''
      });
      return;
    }
    replayAcceptedClientAction(ws, priorAccepted, msg.requestId || '');
    return;
  }
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
    clientActionId,
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
  attachResultLedger(room, action, roomPatch);
  const accepted = { kind:'accepted', requestId:msg.requestId || '', roomCode:code, action, roomPatch, durableWrite:false, flyEventLog:true };
  accepted.durableWrite = await persistAcceptedActionToFirebase(code, accepted);
  room.lastSeq = nextSeq;
  room.canonicalState = gateResult.canonicalState;
  room.canonicalHash = gateResult.canonicalHash;
  room.lastStateHash = String(room.canonicalHash || action.payload.stateHash || room.lastStateHash || '');
  accepted.serverStateHash = room.canonicalHash || room.lastStateHash || '';
  applyRoomPatch(room, roomPatch);
  appendRoomEvent(room, accepted);
  broadcast(room, accepted);
  scheduleReactionTimer(room);
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

async function requireRoomViewerRequestUser(req, room){
  if(!REQUIRE_FIREBASE_TOKEN) return 'dev-token-disabled';
  const uid = await verifyRequestUser(req, {});
  if(!roomViewerIndexForUid(room, uid)) throw new Error('user is not seated or spectating this room');
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
            flyMatchmaking:true,
            flyRoomDiscovery:true,
            flyResultLedger:true,
            flyLeaderboard:true,
            flyProfiles:true,
            flySocial:true,
            flyWorldChat:true,
            flyEconomy:true,
            flyMarketplace:true,
            flyPublicDecks:true,
            flyPlayerSaves:true,
            flyFriends:true,
            flyDirectMessages:true,
            flySpectators:true,
            flyLiveMatches:true,
            flyActionReplay:true,
          flyResumeReplay:true,
          flyDurableStore:FLY_STORE_ENABLED,
          flyDurableStoreReady:flyStoreReady,
          stateGate:STATE_GATE_ENABLED,
          reducerMode:REDUCER_MODE,
          cardCatalog:true,
          cardCatalogSize:authorityCardCatalog().cards.length,
          disconnectTimeoutMs:DISCONNECT_TIMEOUT_MS,
          restoredTimerCount,
          restoredEventCount,
          firebaseRtdbDisabled:FIREBASE_RTDB_DISABLED,
          firebaseDurableWrites:shouldUseDurableWrites(),
          firebaseDurableWritesRequired:REQUIRE_DURABLE_WRITES,
          resultLedgerPersistence:PERSIST_RESULT_LEDGER
        },
        time:now()
      });
      return true;
    }
    if(req.method === 'GET' && parts[1] === 'leaderboards' && parts[2] === 'challenger'){
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 100) || 100));
      writeJson(res, 200, {
        ok:true,
        leaderboard:flyLeaderboard(limit)
      });
      return true;
    }
    if(req.method === 'GET' && parts[1] === 'live-matches'){
      await verifyFirebaseToken(bearerToken(req, {}));
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 16) || 16));
      writeJson(res, 200, {ok:true, matches:listFlyLiveMatches(limit)});
      return true;
    }
    if(parts[1] === 'marketplace'){
      if(req.method === 'GET' && parts[2] === 'listings'){
        await verifyFirebaseToken(bearerToken(req, {}));
        const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 160) || 160));
        writeJson(res, 200, Object.assign({ok:true}, listFlyMarketplace(limit)));
        return true;
      }
      if(req.method === 'POST' && parts[2] === 'listings' && !parts[3]){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        if(body.profile) upsertFlyProfile(uid, body.profile);
        const listing = createFlyMarketplaceListing(uid, body);
        persistFlyRoomMutation();
        writeJson(res, 200, {ok:true, listing});
        return true;
      }
      if(req.method === 'POST' && parts[2] === 'listings' && parts[3] && parts[4] === 'buy'){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        if(body.profile) upsertFlyProfile(uid, body.profile);
        const listing = buyFlyMarketplaceListing(uid, parts[3], body);
        persistFlyRoomMutation();
        writeJson(res, 200, {ok:true, listing});
        return true;
      }
      if(req.method === 'POST' && parts[2] === 'listings' && parts[3] && parts[4] === 'cancel'){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        const listing = cancelFlyMarketplaceListing(uid, parts[3]);
        persistFlyRoomMutation();
        writeJson(res, 200, {ok:true, listing});
        return true;
      }
      if(req.method === 'POST' && parts[2] === 'redeem'){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        const result = redeemFlyMarketplace(uid);
        persistFlyRoomMutation();
        writeJson(res, 200, {ok:true, redeemedStarlight:result.total, listings:result.redeemed});
        return true;
      }
    }
    if(parts[1] === 'public-decks'){
      if(req.method === 'GET' && !parts[2]){
        await verifyFirebaseToken(bearerToken(req, {}));
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 60) || 60));
        writeJson(res, 200, {ok:true, decks:listFlyPublicDecks(limit)});
        return true;
      }
      if(req.method === 'POST' && !parts[2]){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        if(body.profile) upsertFlyProfile(uid, body.profile);
        const deck = upsertFlyPublicDeck(uid, body.deck || body);
        persistFlyRoomMutation();
        writeJson(res, 200, {ok:true, deck});
        return true;
      }
      const deckId = String(parts[2] || '').slice(0, 160);
      if(req.method === 'GET' && deckId){
        await verifyFirebaseToken(bearerToken(req, {}));
        const deck = publicFlyPublicDeck(flyPublicDecks.get(deckId));
        if(!deck){
          writeJson(res, 404, {ok:false, error:'deck not found'});
          return true;
        }
        writeJson(res, 200, {ok:true, deck});
        return true;
      }
      if(req.method === 'POST' && deckId && parts[3] === 'delete'){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        const deck = removeFlyPublicDeck(uid, deckId);
        persistFlyRoomMutation();
        writeJson(res, 200, {ok:true, deck});
        return true;
      }
      if(req.method === 'POST' && deckId && parts[3] === 'rating'){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        const deck = rateFlyPublicDeck(uid, deckId, body);
        persistFlyRoomMutation();
        writeJson(res, 200, {ok:true, deck});
        return true;
      }
      if(req.method === 'POST' && deckId && parts[3] === 'comments'){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        const result = commentFlyPublicDeck(uid, deckId, body);
        persistFlyRoomMutation();
        writeJson(res, 200, {ok:true, deck:result.deck, comment:result.comment});
        return true;
      }
    }
    if(req.method === 'GET' && parts[1] === 'social' && parts[2] === 'state'){
      const uidParam = String(url.searchParams.get('uid') || '');
      const uid = await verifyRequestUser(req, {uid:uidParam});
      writeJson(res, 200, Object.assign({ok:true}, flySocialStateFor(uid)));
      return true;
    }
    if(req.method === 'GET' && parts[1] === 'social' && parts[2] === 'lookup'){
      await verifyFirebaseToken(bearerToken(req, {}));
      const term = String(url.searchParams.get('term') || '').slice(0, 80);
      writeJson(res, 200, {ok:true, profiles:lookupFlyProfiles(term, 8)});
      return true;
    }
    if(parts[1] === 'friends'){
      if(req.method === 'POST' && parts[2] === 'request'){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        if(body.profile) upsertFlyProfile(uid, body.profile);
        const request = createFlyFriendRequest(uid, body.toUid, body);
        persistFlyRoomMutation();
        writeJson(res, 200, {ok:true, request, state:flySocialStateFor(uid)});
        return true;
      }
      if(req.method === 'POST' && parts[2] === 'accept'){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        const request = acceptFlyFriendRequest(uid, body.fromUid);
        persistFlyRoomMutation();
        writeJson(res, 200, {ok:true, request, state:flySocialStateFor(uid)});
        return true;
      }
      if(req.method === 'POST' && parts[2] === 'decline'){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        const request = declineFlyFriendRequest(uid, body.fromUid);
        persistFlyRoomMutation();
        writeJson(res, 200, {ok:true, declined:!!request, state:flySocialStateFor(uid)});
        return true;
      }
      if(req.method === 'POST' && parts[2] === 'remove'){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        removeFlyFriend(uid, body.friendUid);
        persistFlyRoomMutation();
        writeJson(res, 200, {ok:true, state:flySocialStateFor(uid)});
        return true;
      }
    }
    if(parts[1] === 'direct-messages' && parts[2]){
      const peerUid = String(parts[2] || '').slice(0, 128);
      if(req.method === 'GET'){
        const uid = await verifyRequestUser(req, {uid:String(url.searchParams.get('uid') || '')});
        markFlyThreadRead(uid, peerUid);
        persistFlyRoomMutation();
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 80) || 80));
        writeJson(res, 200, {ok:true, peerUid, messages:listFlyPrivateMessages(uid, peerUid, limit), state:flySocialStateFor(uid)});
        return true;
      }
      if(req.method === 'POST'){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        if(body.profile) upsertFlyProfile(uid, body.profile);
        const message = appendFlyPrivateMessage(uid, peerUid, body.text, body.profile || body);
        persistFlyRoomMutation();
        writeJson(res, 200, {ok:true, peerUid, message, messages:listFlyPrivateMessages(uid, peerUid, 80), state:flySocialStateFor(uid)});
        return true;
      }
    }
    if(parts[1] === 'player-save'){
      if(req.method === 'GET' && parts[2]){
        const uid = await verifyRequestUser(req, {uid:String(parts[2] || '')});
        const save = publicFlyPlayerSave(flyPlayerSaves.get(uid) || {uid, data:null});
        writeJson(res, 200, {ok:true, save, data:save?.data || null});
        return true;
      }
      if(req.method === 'POST' && parts[2]){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, Object.assign({}, body, {uid:String(parts[2] || '')}));
        const save = upsertFlyPlayerSave(uid, body);
        persistFlyRoomMutation();
        writeJson(res, 200, {ok:true, save});
        return true;
      }
    }
    if(parts[1] === 'world-chat'){
      if(req.method === 'GET'){
        await verifyFirebaseToken(bearerToken(req, {}));
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 100) || 100));
        const after = Math.max(0, Number(url.searchParams.get('after') || 0) || 0);
        writeJson(res, 200, {
          ok:true,
          chatSeq:flyWorldChatSeq,
          messages:listFlyWorldChat(limit, after)
        });
        return true;
      }
      if(req.method === 'POST'){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        const message = appendFlyWorldChat(uid, body.text, body.profile || body);
        persistFlyRoomMutation();
        writeJson(res, 200, {
          ok:true,
          chatSeq:flyWorldChatSeq,
          message,
          messages:listFlyWorldChat(100, 0)
        });
        return true;
      }
    }
    if(parts[1] === 'parties'){
      if(req.method === 'POST' && parts.length === 2){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        if(body.profile) upsertFlyProfile(uid, body.profile);
        const party = createFlyParty(uid);
        persistFlyRoomMutation();
        writeJson(res, 200, {ok:true, party, state:flySocialState(uid)});
        return true;
      }
      const partyId = String(parts[2] || '').slice(0, 160);
      if(req.method === 'GET' && partyId){
        const party = publicFlyParty(flyParties.get(partyId));
        if(!party){
          writeJson(res, 404, {ok:false, error:'party not found'});
          return true;
        }
        const uid = await verifyRequestUser(req, {uid:String(url.searchParams.get('uid') || '')});
        if(!party.members?.[uid]) throw new Error('user is not in this party');
        writeJson(res, 200, {ok:true, party});
        return true;
      }
      if(req.method === 'POST' && partyId && parts[3] === 'invite'){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        if(body.profile) upsertFlyProfile(uid, body.profile);
        const invite = inviteFlyParty(partyId, uid, body.toUid, body.profile || body);
        persistFlyRoomMutation();
        writeJson(res, 200, {ok:true, invite, state:flySocialState(uid)});
        return true;
      }
      if(req.method === 'POST' && partyId && parts[3] === 'accept'){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        if(body.profile) upsertFlyProfile(uid, body.profile);
        const party = acceptFlyPartyInvite(partyId, uid, body.fromUid);
        persistFlyRoomMutation();
        writeJson(res, 200, {ok:true, party, state:flySocialState(uid)});
        return true;
      }
      if(req.method === 'POST' && partyId && parts[3] === 'decline'){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        const invite = declineFlyPartyInvite(uid, body.fromUid);
        persistFlyRoomMutation();
        writeJson(res, 200, {ok:true, declined:!!invite, state:flySocialState(uid)});
        return true;
      }
      if(req.method === 'POST' && partyId && parts[3] === 'leave'){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        const party = flyParties.get(partyId);
        if(party && !party.members?.[uid]) throw new Error('user is not in this party');
        const removed = removeFlyParty(partyId);
        persistFlyRoomMutation();
        writeJson(res, 200, {ok:true, deleted:!!removed, state:flySocialState(uid)});
        return true;
      }
    }
    if(req.method === 'GET' && parts[1] === 'profiles' && parts[2]){
      const uid = String(parts[2] || '').slice(0, 128);
      const profile = publicFlyProfile(flyPlayerStats.get(uid) || {uid});
      writeJson(res, 200, {ok:true, profile});
      return true;
    }
    if(req.method === 'POST' && parts[1] === 'profiles' && parts[2]){
      const body = await readJsonBody(req);
      const uid = await verifyRequestUser(req, Object.assign({}, body, {uid:String(parts[2] || '')}));
      const profile = upsertFlyProfile(uid, body.profile || body);
      persistFlyRoomMutation();
      writeJson(res, 200, {ok:true, profile});
      return true;
    }
    if(req.method === 'GET' && parts[1] === 'match-results'){
      const uid = String(url.searchParams.get('uid') || '').slice(0, 128);
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 30) || 30));
      const results = [...flyMatchResults.values()]
        .map(publicFlyMatchResult)
        .filter(Boolean)
        .filter(result=>!uid || result.uid === uid)
        .sort((a,b)=>(Number(b.createdAt || 0) || 0) - (Number(a.createdAt || 0) || 0))
        .slice(0, limit);
      writeJson(res, 200, {ok:true, results});
      return true;
    }
    if(req.method === 'GET' && parts[1] === 'rooms' && parts.length === 2){
      const uidParam = String(url.searchParams.get('uid') || '');
      const uid = await verifyRequestUser(req, {uid:uidParam});
      const includeEnded = url.searchParams.get('includeEnded') === '1' || url.searchParams.get('includeEnded') === 'true';
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 20) || 20));
      writeJson(res, 200, {
        ok:true,
        uid,
        rooms:listRoomsForUid(uid, {includeEnded, limit})
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
    if(parts[1] === 'matchmaking'){
      if(req.method === 'POST' && parts[2] === 'enter'){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        const result = enterFlyMatchmaking(uid, body);
        writeJson(res, 200, {
          ok:true,
          matched:!!result.matched,
          role:result.role,
          entry:result.entry,
          room:publicRoom(result.room)
        });
        return true;
      }
      if(req.method === 'POST' && parts[2] === 'leave'){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        const entry = removeMatchmakingEntry(uid);
        writeJson(res, 200, {ok:true, removed:!!entry});
        return true;
      }
      if(req.method === 'GET'){
        const mode = normalizeRoomMode(url.searchParams.get('mode') || 'ranked');
        const entries = [...matchmaking.values()]
          .filter(entry=>normalizeRoomMode(entry.mode) === mode)
          .map(publicMatchmakingEntry)
          .filter(Boolean)
          .slice(0, 100);
        writeJson(res, 200, {ok:true, mode, entries});
        return true;
      }
    }
    if(parts[1] === 'rooms' && isRoomCode(parts[2])){
      const room = rooms.get(roomCode(parts[2]));
      if(!room){
        writeJson(res, 404, {ok:false, error:'room not found'});
        return true;
      }
      if(req.method === 'GET' && parts.length === 3){
        await requireRoomViewerRequestUser(req, room);
        writeJson(res, 200, {ok:true, room:publicRoom(room)});
        return true;
      }
      if(req.method === 'GET' && parts[3] === 'events'){
        await requireRoomViewerRequestUser(req, room);
        const after = Math.max(0, Number(url.searchParams.get('after') || 0) || 0);
        const limit = Math.min(300, Math.max(1, Number(url.searchParams.get('limit') || 300) || 300));
        const events = room.eventLog
          .filter(item=>Number(item?.action?.seq || 0) > after)
          .slice(0, limit);
        writeJson(res, 200, {ok:true, roomCode:room.code, lastSeq:room.lastSeq, events});
        return true;
      }
      if(req.method === 'GET' && parts[3] === 'chat'){
        await requireRoomViewerRequestUser(req, room);
        const after = Math.max(0, Number(url.searchParams.get('after') || 0) || 0);
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 80) || 80));
        writeJson(res, 200, {ok:true, roomCode:room.code, chatSeq:Number(room.chatSeq || 0) || 0, messages:publicChat(room, limit, after)});
        return true;
      }
      if(req.method === 'POST' && parts[3] === 'chat'){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        const message = appendRoomChat(room, uid, body.text, body.profile);
        writeJson(res, 200, {ok:true, roomCode:room.code, chatSeq:Number(room.chatSeq || 0) || 0, message, messages:publicChat(room, 80, 0)});
        return true;
      }
      if(req.method === 'GET' && parts[3] === 'resume'){
        await requireRoomViewerRequestUser(req, room);
        const after = Math.max(0, Number(url.searchParams.get('after') || 0) || 0);
        const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') || 500) || 500));
        const includeState = url.searchParams.get('includeState') === '1' || url.searchParams.get('includeState') === 'true';
        const events = room.eventLog
          .filter(item=>Number(item?.action?.seq || 0) > after)
          .slice(0, limit);
        const payload = {
          ok:true,
          room:publicRoom(room),
          roomCode:room.code,
          lastSeq:room.lastSeq,
          serverStateHash:room.canonicalHash || room.lastStateHash || '',
          canonicalHash:room.canonicalHash || '',
          events
        };
        if(includeState) payload.canonicalState = room.canonicalState || null;
        writeJson(res, 200, payload);
        return true;
      }
      if(parts[3] === 'spectators'){
        if(req.method === 'POST' && parts[4] === 'join'){
          const body = await readJsonBody(req);
          const uid = await verifyRequestUser(req, body);
          const spectator = joinRoomSpectator(room, uid);
          writeJson(res, 200, {ok:true, room:publicRoom(room), spectator});
          return true;
        }
        if(req.method === 'POST' && parts[4] === 'heartbeat'){
          const body = await readJsonBody(req);
          const uid = await verifyRequestUser(req, body);
          const spectator = heartbeatRoomSpectator(room, uid);
          writeJson(res, 200, {ok:true, room:publicRoom(room), spectator});
          return true;
        }
        if(req.method === 'POST' && parts[4] === 'leave'){
          const body = await readJsonBody(req);
          const uid = await verifyRequestUser(req, body);
          const removed = leaveRoomSpectator(room, uid);
          writeJson(res, 200, {ok:true, removed, room:publicRoom(room)});
          return true;
        }
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
      if(req.method === 'POST' && parts[3] === 'leave'){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        const result = leaveFlyRoom(room, uid);
        writeJson(res, 200, {ok:true, deleted:!!result.deleted, room:result.room ? publicRoom(result.room) : null});
        return true;
      }
      if(req.method === 'POST' && parts[3] === 'heartbeat'){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        const player = heartbeatFlyRoom(room, uid);
        writeJson(res, 200, {ok:true, room:publicRoom(room), player});
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
      if(req.method === 'POST' && parts[3] === 'progress'){
        const body = await readJsonBody(req);
        const uid = await verifyRequestUser(req, body);
        const player = setRoomPlayerProgress(room, uid, body);
        writeJson(res, 200, {ok:true, room:publicRoom(room), player});
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
    apiError(res, err, /token|uid|seated|spectating|viewer|full/i.test(err.message || '') ? 403 : 400);
    return true;
  }
}

const server = http.createServer((req, res)=>{
  const requestUrl = new URL(req.url || '/', 'http://localhost');
  const requestPath = requestUrl.pathname;
  if(shuttingDown && requestPath !== '/health'){
    setCors(res);
    res.writeHead(503, {'content-type':'application/json; charset=utf-8'});
    res.end(safeJson({ok:false, error:'server shutting down'}));
    return;
  }
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
      flyMatchmaking:true,
      flyRoomDiscovery:true,
      flyResultLedger:true,
      flyLeaderboard:true,
      flyProfiles:true,
      flySocial:true,
      flyWorldChat:true,
      flyEconomy:true,
      flyMarketplace:true,
      flyPublicDecks:true,
      flyPlayerSaves:true,
      flyFriends:true,
      flyDirectMessages:true,
      flySpectators:true,
      flyLiveMatches:true,
      flyActionReplay:true,
      flyResumeReplay:true,
      flyDurableStore:FLY_STORE_ENABLED,
      flyDurableStoreReady:flyStoreReady,
      flyDataDir:FLY_STORE_ENABLED ? FLY_DATA_DIR : '',
      stateGate:STATE_GATE_ENABLED,
      reducerMode:REDUCER_MODE,
      cardCatalog:true,
      cardCatalogSize:authorityCardCatalog().cards.length,
      disconnectTimeoutMs:DISCONNECT_TIMEOUT_MS,
      restoredTimerCount,
      restoredEventCount,
      firebaseRtdbDisabled:FIREBASE_RTDB_DISABLED,
      firebaseDurableWrites:shouldUseDurableWrites(),
      durableWrites:shouldUseDurableWrites(),
      durableWritesRequired:REQUIRE_DURABLE_WRITES,
      resultLedgerPersistence:PERSIST_RESULT_LEDGER,
      shuttingDown,
      shutdownStartedAt,
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
  if(shuttingDown){
    socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
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
  if(markSocketDisconnected(ws)){
    persistFlyRoomMutation();
  }
}

const roomMaintenanceInterval = setInterval(()=>{
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
roomMaintenanceInterval.unref?.();

const pingInterval = setInterval(()=>{
  for(const socket of sockets) send(socket, {kind:'ping', serverTime:now()});
}, PING_MS);
pingInterval.unref?.();

function timeoutPromise(ms, label){
  return new Promise(resolve=>{
    const timer = setTimeout(()=>resolve({timedOut:true, label}), Math.max(1, Number(ms || 1) || 1));
    timer.unref?.();
  });
}

async function waitForRoomActionQueues(ms){
  const queues = [...rooms.values()]
    .map(room=>room.actionQueue)
    .filter(Boolean)
    .map(queue=>queue.catch(()=>{}));
  if(!queues.length) return {drained:true, count:0};
  const result = await Promise.race([
    Promise.all(queues).then(()=>({drained:true, count:queues.length})),
    timeoutPromise(ms, 'room action queue drain')
  ]);
  return result?.timedOut ? {drained:false, count:queues.length} : result;
}

async function gracefulShutdown(signal){
  if(shuttingDown){
    console.error(`Force exiting after repeated ${signal || 'shutdown'} signal`);
    process.exit(1);
    return;
  }
  shuttingDown = true;
  shutdownStartedAt = now();
  console.log(`Fates authority shutting down from ${signal || 'signal'}; draining for up to ${SHUTDOWN_GRACE_MS}ms`);
  clearInterval(roomMaintenanceInterval);
  clearInterval(pingInterval);
  const queueResult = await waitForRoomActionQueues(Math.max(500, Math.floor(SHUTDOWN_GRACE_MS * 0.55)));
  if(!queueResult.drained) console.warn(`Shutdown queue drain timed out with ${queueResult.count} room queue(s) still pending`);
  for(const socket of [...sockets]){
    markSocketDisconnected(socket);
  }
  persistFlyRoomMutation();
  for(const socket of [...sockets]){
    closeSocket(socket, 1001, 'server restarting');
  }
  const closeResult = await Promise.race([
    new Promise(resolve=>server.close(()=>resolve({closed:true}))),
    timeoutPromise(Math.max(500, Math.floor(SHUTDOWN_GRACE_MS * 0.35)), 'server close')
  ]);
  for(const socket of [...sockets]){
    try{ socket.destroy(); }catch(e){}
  }
  persistFlyRoomMutation();
  console.log(`Fates authority shutdown complete; queuesDrained=${!!queueResult.drained}; serverClosed=${!!closeResult.closed}`);
  process.exit(0);
}

process.once('SIGTERM', ()=>{ gracefulShutdown('SIGTERM').catch(err=>{ console.error('Graceful shutdown failed:', err.message || err); process.exit(1); }); });
process.once('SIGINT', ()=>{ gracefulShutdown('SIGINT').catch(err=>{ console.error('Graceful shutdown failed:', err.message || err); process.exit(1); }); });

try{
  const restoredRooms = loadFlyRoomsSnapshot();
  restoredEventCount = loadFlyEventsLog();
  if(restoredEventCount > 0) persistFlyRoomsSnapshot();
  const timers = rearmRestoredTimers();
  if(FLY_STORE_ENABLED){
    console.log(`Fly durable store: on (${FLY_DATA_DIR}); restored rooms=${restoredRooms}; restored events=${restoredEventCount}; restored timers=${timers}`);
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
  console.log(`Firebase RTDB admin mirror: ${FIREBASE_RTDB_DISABLED ? 'disabled' : (shouldUseDurableWrites() ? 'enabled' : 'off')}`);
});
