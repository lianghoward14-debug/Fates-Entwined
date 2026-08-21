import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ENGINE_VERSION, RULESET_VERSION} from '../../shared/engine/constants.mjs';
import {AuthorityV3RoomManager} from './room-manager.mjs';
import {SQLiteAuthorityStore} from './storage.mjs';
import {normalizePhase7GameSettings, resolvePhase7GameSettings} from './phase7-game-settings.mjs';

if(process.env.FATE_SERVER_AUTHORITATIVE_V3_ENABLED !== '1'){
  throw new Error(
    'Authoritative v3 is isolated and disabled. '
    + 'Set FATE_SERVER_AUTHORITATIVE_V3_ENABLED=1 to run this separate server.'
  );
}

const HOST = String(process.env.FATE_AUTHORITY_V3_HOST || '127.0.0.1');
const PORT = Math.max(1, Number(process.env.FATE_AUTHORITY_V3_PORT || 8790) || 8790);
const MAX_MESSAGE_BYTES = Math.max(1024, Number(process.env.FATE_AUTHORITY_V3_MAX_MESSAGE_BYTES || 65536) || 65536);
const DATA_DIR = path.resolve(
  process.env.FATE_AUTHORITY_V3_DATA_DIR
    || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.tmp', 'authority-v3')
);
const ADMIN_TOKEN = String(process.env.FATE_AUTHORITY_V3_ADMIN_TOKEN || '');
const ALLOW_TEST_MATCHES = process.env.FATE_AUTHORITY_V3_ALLOW_TEST_MATCHES === '1';
const PHASE7_BETA_ENABLED = process.env.FATE_SERVER_AUTHORITATIVE_V3_PHASE7_BETA_ENABLED === '1';
const BETA_MODE = String(process.env.FATE_AUTHORITY_V3_BETA_MODE || '') === 'unranked';
const PHASE7_CLIENT_VERSION = String(process.env.FATE_AUTHORITY_V3_PHASE7_CLIENT_VERSION || '').trim();
const PHASE7_COMPATIBLE_CLIENT_VERSIONS = new Set(
  String(process.env.FATE_AUTHORITY_V3_PHASE7_COMPATIBLE_CLIENT_VERSIONS || '')
    .split(',')
    .map(value=>String(value || '').trim())
    .filter(Boolean)
);
if(PHASE7_CLIENT_VERSION) PHASE7_COMPATIBLE_CLIENT_VERSIONS.add(PHASE7_CLIENT_VERSION);
const PHASE7_BUILD_ID = String(process.env.FATE_AUTHORITY_V3_PHASE7_BUILD_ID || '').trim();
const PHASE7_FIREBASE_API_KEY = String(process.env.FATE_AUTHORITY_V3_FIREBASE_API_KEY || '').trim();
const PHASE7_ALLOW_TEST_IDENTITIES = process.env.FATE_AUTHORITY_V3_PHASE7_ALLOW_TEST_IDENTITIES === '1';
const PHASE7_ALLOW_ORGANIC_TEST_FIXTURES = process.env.FATE_AUTHORITY_V3_PHASE7_ALLOW_ORGANIC_TEST_FIXTURES === '1';
const MATCHES_PATH = BETA_MODE ? '/v3/beta/matches' : '/v3/matches';
const SOCKET_PATH = BETA_MODE ? '/v3/beta/socket' : '/v3/socket';
const SNAPSHOT_INTERVAL = Math.max(1, Number(process.env.FATE_AUTHORITY_V3_SNAPSHOT_INTERVAL || 20) || 20);
const PROMPT_TIMEOUT_MS = Math.max(1000, Number(process.env.FATE_AUTHORITY_V3_PROMPT_TIMEOUT_MS || 30000) || 30000);
const PHASE7_QUEUE_STALE_MS = Math.max(
  250,
  Number(process.env.FATE_AUTHORITY_V3_PHASE7_QUEUE_STALE_MS || 45000) || 45000
);
const DISCONNECT_FORFEIT_MS = Math.max(
  1000,
  Number(process.env.FATE_AUTHORITY_V3_DISCONNECT_FORFEIT_MS || 5000) || 5000
);
const RETAINED_MATCHES = BETA_MODE
  ? Math.max(10, Number(process.env.FATE_AUTHORITY_V3_RETAINED_MATCHES || 50) || 50)
  : 0;

if(!['127.0.0.1', 'localhost', '::1'].includes(HOST) && !ADMIN_TOKEN && !BETA_MODE){
  throw new Error('FATE_AUTHORITY_V3_ADMIN_TOKEN is required when v3 binds beyond loopback');
}
if(BETA_MODE && (!PHASE7_BETA_ENABLED || !PHASE7_CLIENT_VERSION)){
  throw new Error('Phase 7 beta mode requires its exact flag and pinned client version');
}
if(PHASE7_BETA_ENABLED && !BETA_MODE){
  throw new Error('Phase 7 beta flag cannot start the generic v3 route');
}
if(BETA_MODE && !ALLOW_TEST_MATCHES && !PHASE7_FIREBASE_API_KEY){
  throw new Error('Phase 7 beta requires FATE_AUTHORITY_V3_FIREBASE_API_KEY');
}

const authorityDatabasePath = path.join(DATA_DIR, 'authority-v3.sqlite');
let store = new SQLiteAuthorityStore(authorityDatabasePath);
if(RETAINED_MATCHES){
  try{
    store.pruneOldMatches({keepMostRecent:RETAINED_MATCHES});
  }catch(error){
    const diskFull = Number(error?.errcode) === 13 || /database or disk is full/i.test(String(error?.message || error));
    if(!BETA_MODE || !diskFull) throw error;
    // A completely full SQLite volume may not have enough room to journal
    // even a DELETE. This fallback is deliberately beta-only and targets only
    // the dedicated authority database files; production data is never in scope.
    store.close();
    for(const suffix of ['', '-wal', '-shm']) fs.rmSync(authorityDatabasePath + suffix, {force:true});
    console.warn('Reset full Phase 7 beta authority database after retention could not acquire journal space');
    store = new SQLiteAuthorityStore(authorityDatabasePath);
  }
}
const manager = new AuthorityV3RoomManager({
  store,
  allowTestMatches:ALLOW_TEST_MATCHES,
  allowOrganicTestFixtures:PHASE7_ALLOW_ORGANIC_TEST_FIXTURES,
  snapshotInterval:SNAPSHOT_INTERVAL,
  retainedMatches:RETAINED_MATCHES
});
const sockets = new Set();
const matchSockets = new Map();
const promptTimers = new Map();
const turnTimers = new Map();
const disconnectForfeitTimers = new Map();
const betaQueue = new Map(
  BETA_MODE
    ? store.loadBetaMatchmakingQueue().map(row=>[row.playerId, row.entry])
    : []
);
const betaDeliveries = new Map(
  BETA_MODE
    ? store.loadBetaMatchmakingDeliveries().map(row=>[row.playerId, row.credential])
    : []
);
let shuttingDown = false;

function pruneStaleBetaQueue(now = Date.now()){
  if(!BETA_MODE || !betaQueue.size) return 0;
  let removed = 0;
  for(const [uid, entry] of betaQueue.entries()){
    const lastSeenAt = Math.max(Number(entry?.lastSeenAt || 0) || 0, Number(entry?.joinedAt || 0) || 0);
    if(lastSeenAt && now - lastSeenAt <= PHASE7_QUEUE_STALE_MS) continue;
    betaQueue.delete(uid);
    store.deleteBetaMatchmakingEntry(uid);
    removed += 1;
  }
  return removed;
}

async function phase7Identity(req){
  const token = bearer(req);
  if(PHASE7_ALLOW_TEST_IDENTITIES && /^test:[A-Za-z0-9_.:@-]{1,128}$/.test(token)){
    return {uid:token.slice(5), testIdentity:true};
  }
  if(!PHASE7_FIREBASE_API_KEY || !token) return null;
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(PHASE7_FIREBASE_API_KEY)}`,
    {
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({idToken:token})
    }
  );
  if(!response.ok) return null;
  const body = await response.json().catch(()=>null);
  const user = body?.users?.[0];
  if(!user?.localId) return null;
  const providers = Array.isArray(user.providerUserInfo) ? user.providerUserInfo : [];
  const anonymous = !String(user.email || '') && !String(user.phoneNumber || '') && providers.length === 0;
  return {uid:String(user.localId), testIdentity:false, anonymous};
}

function phase7OrganicFixtureIdentity(req, identity, requestedTestPool){
  return !!identity?.uid
    && String(req.headers['x-fate-organic-fixture'] || '') === '1';
}

function phase7ClientCompatible(req){
  return phase7ClientVersionCompatible(req.headers['x-fate-client-version']);
}

function phase7ClientVersionCompatible(value){
  return PHASE7_COMPATIBLE_CLIENT_VERSIONS.has(String(value || '').trim());
}

function betaCredentialFor(result, uid, queueMode = 'freeplay'){
  const item = result.players.find(player=>player.playerId === uid);
  if(!item) throw new Error('match credential was not created for player');
  return {
    matchId:result.matchId,
    playerId:item.playerId,
    playerIndex:item.seat,
    token:item.token,
    queueMode:queueMode === 'ranked' ? 'ranked' : 'freeplay',
    protocolVersion:3,
    clientVersion:PHASE7_CLIENT_VERSION
  };
}

function betaQueueOpponent(entry){
  return [...betaQueue.values()].find(candidate=>
    candidate.uid !== entry.uid
    && String(candidate.testPool || '') === String(entry.testPool || '')
    && String(candidate.queueMode || 'freeplay') === String(entry.queueMode || 'freeplay')
  ) || null;
}

function completeBetaQueueMatch(queued){
  const opponent = betaQueueOpponent(queued);
  if(!opponent) return null;
  const matchId = `BETA_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`;
  const gameSettings = resolvePhase7GameSettings(opponent.gameSettings, matchId);
  const queueMode = queued.queueMode === 'ranked' ? 'ranked' : 'freeplay';
  const result = manager.createMatch({
    mode:queueMode,
    matchId,
    seed:matchId,
    requireTurnChoice:true,
    landscapeId:gameSettings.resolvedLandscapeId,
    gameSettings,
    turnTimerSeconds:gameSettings.turnTimerSeconds,
    testRules:opponent.testRules?.zeroReinforcementCost === true
      && queued.testRules?.zeroReinforcementCost === true
        ? {zeroReinforcementCost:true}
        : null,
    players:[
      {id:opponent.uid, name:opponent.name, deckIds:opponent.deckIds, organicFixture:opponent.organicFixture, testOpeningCardIds:opponent.testOpeningCardIds, testDeckCardIds:opponent.testDeckCardIds, testDeckTopCardIds:opponent.testDeckTopCardIds},
      {id:queued.uid, name:queued.name, deckIds:queued.deckIds, organicFixture:queued.organicFixture, testOpeningCardIds:queued.testOpeningCardIds, testDeckCardIds:queued.testDeckCardIds, testDeckTopCardIds:queued.testDeckTopCardIds}
    ]
  });
  const opponentCredential = betaCredentialFor(result, opponent.uid, queueMode);
  const ownCredential = betaCredentialFor(result, queued.uid, queueMode);
  betaQueue.delete(opponent.uid);
  betaQueue.delete(queued.uid);
  store.deleteBetaMatchmakingEntry(opponent.uid);
  store.deleteBetaMatchmakingEntry(queued.uid);
  betaDeliveries.set(opponent.uid, opponentCredential);
  betaDeliveries.set(queued.uid, ownCredential);
  store.upsertBetaMatchmakingDelivery(opponent.uid, opponentCredential);
  store.upsertBetaMatchmakingDelivery(queued.uid, ownCredential);
  return {result, opponentCredential, ownCredential};
}

function json(value){
  return JSON.stringify(value);
}

function send(ws, message){
  if(!ws || ws.destroyed) return;
  const payload = Buffer.from(json(message), 'utf8');
  let header;
  if(payload.length < 126){
    header = Buffer.from([0x81, payload.length]);
  }else if(payload.length <= 0xffff){
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  }else{
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(payload.length, 6);
  }
  ws.write(Buffer.concat([header, payload]));
}

function closeSocket(ws, code = 1000, reason = 'bye'){
  if(!ws || ws.destroyed) return;
  const text = Buffer.from(String(reason).slice(0, 120), 'utf8');
  const payload = Buffer.alloc(2 + text.length);
  payload.writeUInt16BE(code, 0);
  text.copy(payload, 2);
  const header = Buffer.from([0x88, payload.length]);
  try{ ws.write(Buffer.concat([header, payload])); }catch{}
  ws.destroy();
}

function disconnectForfeitKey(matchId, playerId){
  return `${String(matchId || '')}:${String(playerId || '')}`;
}

function clearDisconnectForfeit(matchId, playerId){
  const key = disconnectForfeitKey(matchId, playerId);
  const timer = disconnectForfeitTimers.get(key);
  if(timer) clearTimeout(timer);
  disconnectForfeitTimers.delete(key);
}

function scheduleDisconnectForfeit(matchId, playerId){
  const id = String(matchId || '');
  const pid = String(playerId || '');
  if(shuttingDown || !BETA_MODE || !id || !pid) return;
  const key = disconnectForfeitKey(id, pid);
  if(disconnectForfeitTimers.has(key)) return;
  const actor = manager.actor(id);
  if(!actor || actor.state.outcome || actor.state.phase === 'ended') return;
  const timer = setTimeout(async ()=>{
    disconnectForfeitTimers.delete(key);
    if((matchSockets.get(id)?.get(pid)?.size || 0) > 0) return;
    const current = manager.actor(id);
    if(!current || current.state.outcome || current.state.phase === 'ended') return;
    try{
      const outcome = await current.dispatch(pid, {
        commandId:`server-disconnect-forfeit:${pid}:${current.state.revision}`,
        matchId:id,
        expectedRevision:current.state.revision,
        type:'CONCEDE',
        payload:{}
      });
      if(outcome.broadcasts.length) broadcastPrivate(id, outcome.broadcasts);
      scheduleAuthorityTimers(current);
    }catch(error){
      console.error(`authoritative v3 disconnect forfeit failed for ${id}/${pid}:`, error.message || error);
    }
  }, DISCONNECT_FORFEIT_MS);
  timer.unref?.();
  disconnectForfeitTimers.set(key, timer);
}

function unregister(ws){
  sockets.delete(ws);
  const matchId = ws?.authorityV3Session?.matchId;
  const playerId = ws?.authorityV3Session?.playerId;
  const players = matchId ? matchSockets.get(matchId) : null;
  const playerSockets = players?.get(playerId);
  playerSockets?.delete(ws);
  if(playerSockets && !playerSockets.size) players.delete(playerId);
  if(players && !players.size) matchSockets.delete(matchId);
  if(matchId && playerId && !(matchSockets.get(matchId)?.get(playerId)?.size || 0)){
    scheduleDisconnectForfeit(matchId, playerId);
  }
}

function register(ws, session){
  unregister(ws);
  ws.authorityV3Session = session;
  clearDisconnectForfeit(session.matchId, session.playerId);
  if(!matchSockets.has(session.matchId)) matchSockets.set(session.matchId, new Map());
  const players = matchSockets.get(session.matchId);
  if(!players.has(session.playerId)) players.set(session.playerId, new Set());
  players.get(session.playerId).add(ws);
  sockets.add(ws);
}

function broadcastPrivate(matchId, broadcasts){
  const players = matchSockets.get(matchId);
  if(!players) return;
  for(const broadcast of broadcasts){
    for(const ws of players.get(broadcast.playerId) || []) send(ws, broadcast.message);
  }
}

function clearPromptTimer(matchId){
  const timer = promptTimers.get(matchId);
  if(timer) clearTimeout(timer);
  promptTimers.delete(matchId);
}

function schedulePromptTimer(actor){
  const matchId = actor.state.matchId;
  clearPromptTimer(matchId);
  const timeout = actor.promptTimeoutCommand();
  if(!timeout) return;
  const promptId = actor.state.pendingPrompt.promptId;
  const timer = setTimeout(async ()=>{
    promptTimers.delete(matchId);
    if(actor.state.pendingPrompt?.promptId !== promptId) return;
    try{
      const outcome = await actor.dispatch(timeout.playerId, timeout.command);
      if(outcome.broadcasts.length) broadcastPrivate(matchId, outcome.broadcasts);
      scheduleAuthorityTimers(actor);
    }catch(error){
      console.error(`authoritative v3 prompt timeout failed for ${matchId}:`, error.message || error);
    }
  }, PROMPT_TIMEOUT_MS);
  timer.unref?.();
  promptTimers.set(matchId, timer);
}

function clearTurnTimer(matchId){
  const entry = turnTimers.get(matchId);
  if(entry?.timer) clearTimeout(entry.timer);
  turnTimers.delete(matchId);
}

function suspendTurnTimer(matchId){
  const entry = turnTimers.get(matchId);
  if(!entry || entry.suspended) return;
  if(entry.timer) clearTimeout(entry.timer);
  entry.timer = null;
  entry.remainingMs = Math.max(1, Number(entry.deadlineAt || 0) - Date.now());
  entry.suspended = true;
  turnTimers.set(matchId, entry);
}

function armTurnTimer(actor, timeout, delayMs){
  const matchId = actor.state.matchId;
  const remainingMs = Math.max(1, Number(delayMs) || Number(timeout.timeoutMs) || 1);
  const entry = {
    timer:null,
    signature:timeout.turnSignature,
    remainingMs,
    deadlineAt:Date.now() + remainingMs,
    suspended:false
  };
  entry.timer = setTimeout(async ()=>{
    turnTimers.delete(matchId);
    const current = actor.turnTimeoutCommand();
    if(!current || current.turnSignature !== timeout.turnSignature) return;
    current.command.expectedRevision = actor.state.revision;
    try{
      const outcome = await actor.dispatch(current.playerId, current.command);
      if(outcome.broadcasts.length) broadcastPrivate(matchId, outcome.broadcasts);
      scheduleAuthorityTimers(actor);
    }catch(error){
      console.error(`authoritative v3 turn timeout failed for ${matchId}:`, error.message || error);
    }
  }, remainingMs);
  entry.timer.unref?.();
  turnTimers.set(matchId, entry);
}

function scheduleTurnTimer(actor){
  const matchId = actor.state.matchId;
  const timeout = actor.turnTimeoutCommand();
  if(!timeout){
    clearTurnTimer(matchId);
    return;
  }
  const existing = turnTimers.get(matchId);
  if(existing?.signature === timeout.turnSignature){
    if(existing.timer && !existing.suspended) return;
    armTurnTimer(actor, timeout, existing.remainingMs);
    return;
  }
  clearTurnTimer(matchId);
  armTurnTimer(actor, timeout, timeout.timeoutMs);
}

function scheduleAuthorityTimers(actor){
  schedulePromptTimer(actor);
  if(actor.state.pendingPrompt || actor.state.pendingHandLimit) suspendTurnTimer(actor.state.matchId);
  else scheduleTurnTimer(actor);
}

async function handleSocketMessage(ws, message){
  if(message.kind === 'hello'){
    if(Number(message.protocolVersion) !== 3) throw new Error('protocolVersion 3 is required');
    if(BETA_MODE && !phase7ClientVersionCompatible(message.clientVersion)){
      throw new Error('compatible Phase 7 client version is required');
    }
    const credential = manager.authenticate(message.matchId, message.playerId, message.token);
    if(!credential) throw new Error('match authentication failed');
    const actor = manager.actor(message.matchId);
    if(!actor) throw new Error('match not found');
    register(ws, {
      matchId:String(message.matchId),
      playerId:String(message.playerId),
      playerIndex:Number(credential.seat)
    });
    if(BETA_MODE){
      const delivery = betaDeliveries.get(String(message.playerId));
      if(String(delivery?.matchId || '') === String(message.matchId)){
        betaDeliveries.delete(String(message.playerId));
        store.deleteBetaMatchmakingDelivery(String(message.playerId));
      }
    }
    send(ws, {
      kind:'hello-ok',
      protocolVersion:3,
      matchId:String(message.matchId),
      playerId:String(message.playerId),
      playerIndex:Number(credential.seat)
    });
    send(ws, actor.snapshotForPlayer(Number(credential.seat)));
    scheduleAuthorityTimers(actor);
    return;
  }
  const session = ws.authorityV3Session;
  if(!session) throw new Error('hello is required before commands');
  if(message.kind !== 'command') throw new Error('unknown v3 message kind');
  const actor = manager.actor(session.matchId);
  if(!actor) throw new Error('match not found');
  const outcome = await actor.dispatch(session.playerId, message.command);
  if(outcome.idempotentReplay || !outcome.broadcasts.length){
    send(ws, outcome.response);
    return;
  }
  broadcastPrivate(session.matchId, outcome.broadcasts);
  scheduleAuthorityTimers(actor);
}

function readFrames(ws, chunk){
  ws.authorityV3Buffer = ws.authorityV3Buffer
    ? Buffer.concat([ws.authorityV3Buffer, chunk])
    : chunk;
  while(ws.authorityV3Buffer.length >= 2){
    const buffer = ws.authorityV3Buffer;
    const opcode = buffer[0] & 0x0f;
    const masked = (buffer[1] & 0x80) !== 0;
    let length = buffer[1] & 0x7f;
    let offset = 2;
    if(length === 126){
      if(buffer.length < 4) return;
      length = buffer.readUInt16BE(2);
      offset = 4;
    }else if(length === 127){
      if(buffer.length < 10) return;
      const high = buffer.readUInt32BE(2);
      if(high !== 0) return closeSocket(ws, 1009, 'message too large');
      length = buffer.readUInt32BE(6);
      offset = 10;
    }
    if(length > MAX_MESSAGE_BYTES) return closeSocket(ws, 1009, 'message too large');
    if(masked && buffer.length < offset + 4) return;
    const mask = masked ? buffer.subarray(offset, offset + 4) : null;
    if(masked) offset += 4;
    if(buffer.length < offset + length) return;
    const payload = Buffer.from(buffer.subarray(offset, offset + length));
    ws.authorityV3Buffer = buffer.subarray(offset + length);
    if(mask){
      for(let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4];
    }
    if(opcode === 0x8) return closeSocket(ws);
    if(opcode === 0x9) continue;
    if(opcode !== 0x1) continue;
    let message;
    try{
      message = JSON.parse(payload.toString('utf8'));
    }catch{
      send(ws, {kind:'error', protocolVersion:3, reason:'invalid JSON'});
      continue;
    }
    Promise.resolve(handleSocketMessage(ws, message)).catch(error=>{
      send(ws, {kind:'error', protocolVersion:3, reason:String(error.message || error)});
    });
  }
}

function setCors(res){
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'authorization, content-type, x-fate-client-version, x-fate-organic-fixture');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
}

function writeJson(res, status, body){
  setCors(res);
  res.writeHead(status, {'content-type':'application/json; charset=utf-8', 'cache-control':'no-store'});
  res.end(json(body));
}

function readBody(req){
  return new Promise((resolve, reject)=>{
    const chunks = [];
    let length = 0;
    req.on('data', chunk=>{
      length += chunk.length;
      if(length > MAX_MESSAGE_BYTES){
        reject(new Error('request body is too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', ()=>{
      try{
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      }catch{
        reject(new Error('request body is invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function bearer(req){
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

const server = http.createServer(async (req, res)=>{
  try{
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if(req.method === 'OPTIONS'){
      setCors(res);
      res.writeHead(204);
      res.end();
      return;
    }
    if(req.method === 'GET' && url.pathname === '/health'){
      writeJson(res, 200, {
        ok:true,
        service:'fates-authoritative-v3',
        isolated:true,
        flag:BETA_MODE
          ? 'FATE_SERVER_AUTHORITATIVE_V3_PHASE7_BETA_ENABLED'
          : 'FATE_SERVER_AUTHORITATIVE_V3_ENABLED',
        protocolVersion:3,
        phase7Beta:BETA_MODE,
        matchmakingMode:BETA_MODE ? 'freeplay-and-challenger' : 'test-prototype',
        requiredClientVersion:BETA_MODE ? PHASE7_CLIENT_VERSION : null,
        compatibleClientVersions:BETA_MODE ? [...PHASE7_COMPATIBLE_CLIENT_VERSIONS] : [],
        buildId:BETA_MODE ? PHASE7_BUILD_ID : null,
        matchesPath:MATCHES_PATH,
        socketPath:SOCKET_PATH,
        authenticatedMatchmaking:BETA_MODE,
        queuedPlayers:BETA_MODE ? betaQueue.size : 0,
        queueStaleMs:BETA_MODE ? PHASE7_QUEUE_STALE_MS : null,
        disconnectForfeitMs:BETA_MODE ? DISCONNECT_FORFEIT_MS : null,
        engineVersion:ENGINE_VERSION,
        rulesetVersion:RULESET_VERSION,
        testMatches:ALLOW_TEST_MATCHES,
        activeSockets:sockets.size,
        promptTimeoutMs:PROMPT_TIMEOUT_MS,
        lonePineTurnTimeoutMs:30000
      });
      return;
    }
    if(req.method === 'POST' && url.pathname === MATCHES_PATH){
      if(BETA_MODE && !ALLOW_TEST_MATCHES){
        writeJson(res, 404, {ok:false, error:'public beta matches are created by authenticated matchmaking only'});
        return;
      }
      if(ADMIN_TOKEN && bearer(req) !== ADMIN_TOKEN){
        writeJson(res, 403, {ok:false, error:'admin token is required'});
        return;
      }
      if(BETA_MODE && !phase7ClientCompatible(req)){
        writeJson(res, 426, {ok:false, error:'compatible Phase 7 client version is required'});
        return;
      }
      const body = await readBody(req);
      if(BETA_MODE && String(body.mode || '') !== 'unranked'){
        writeJson(res, 400, {ok:false, error:'Phase 7 beta creates unranked matches only'});
        return;
      }
      const result = manager.createMatch(body);
      writeJson(res, 201, {ok:true, ...result});
      return;
    }
    if(BETA_MODE && url.pathname === '/v3/beta/matchmaking/enter' && req.method === 'POST'){
      pruneStaleBetaQueue();
      if(!phase7ClientCompatible(req)){
        writeJson(res, 426, {ok:false, error:'compatible Phase 7 client version is required'});
        return;
      }
      const identity = await phase7Identity(req);
      if(!identity){
        writeJson(res, 401, {ok:false, error:'valid Firebase identity token is required'});
        return;
      }
      if(betaDeliveries.has(identity.uid)){
        writeJson(res, 200, {ok:true, status:'matched', credential:betaDeliveries.get(identity.uid)});
        return;
      }
      const body = await readBody(req);
      const requestedTestPool = String(body.testPool || '');
      const organicFixtureIdentity = PHASE7_ALLOW_ORGANIC_TEST_FIXTURES
        && phase7OrganicFixtureIdentity(req, identity, requestedTestPool);
      const deckIds = manager.validateDeckIds(body.deckIds, {organicFixture:organicFixtureIdentity});
      const validRequestedTestPool = /^[A-Za-z0-9_.:@-]{1,80}$/.test(requestedTestPool);
      const testPool = organicFixtureIdentity
        ? (validRequestedTestPool ? requestedTestPool : `fixture:${identity.uid}`.slice(0, 80))
        : '';
      const queued = {
        uid:identity.uid,
        name:String(body.name || identity.uid).slice(0, 80),
        deckIds,
        queueMode:String(body.queueMode || '') === 'ranked' ? 'ranked' : 'freeplay',
        organicFixture:organicFixtureIdentity,
        gameSettings:normalizePhase7GameSettings(body.gameSettings, body.landscapeId),
        testOpeningCardIds:organicFixtureIdentity && Array.isArray(body.testOpeningCardIds)
          ? body.testOpeningCardIds.map(String).filter(id=>deckIds.includes(id)).slice(0, 4)
          : [],
        testDeckCardIds:organicFixtureIdentity && Array.isArray(body.testDeckCardIds)
          ? body.testDeckCardIds.map(String).filter(id=>deckIds.includes(id)).slice(0, 2)
          : [],
        testDeckTopCardIds:organicFixtureIdentity && Array.isArray(body.testDeckTopCardIds)
          ? body.testDeckTopCardIds.map(String).filter(id=>deckIds.includes(id)).slice(0, 2)
          : [],
        testRules:organicFixtureIdentity && body.testRules?.zeroReinforcementCost === true
          ? {zeroReinforcementCost:true}
          : null,
        testPool,
        joinedAt:Date.now(),
        lastSeenAt:Date.now()
      };
      betaQueue.set(identity.uid, queued);
      store.upsertBetaMatchmakingEntry(queued);
      const matched = completeBetaQueueMatch(queued);
      if(!matched){
        writeJson(res, 202, {ok:true, status:'waiting'});
        return;
      }
      writeJson(res, 200, {ok:true, status:'matched', credential:matched.ownCredential});
      return;
    }
    if(BETA_MODE && url.pathname === '/v3/beta/matchmaking/status' && req.method === 'GET'){
      pruneStaleBetaQueue();
      if(!phase7ClientCompatible(req)){
        writeJson(res, 426, {ok:false, error:'compatible Phase 7 client version is required'});
        return;
      }
      const identity = await phase7Identity(req);
      if(!identity){
        writeJson(res, 401, {ok:false, error:'valid Firebase identity token is required'});
        return;
      }
      let credential = betaDeliveries.get(identity.uid) || null;
      const queued = betaQueue.get(identity.uid) || null;
      if(queued){
        queued.lastSeenAt = Date.now();
        betaQueue.set(identity.uid, queued);
        store.touchBetaMatchmakingEntry(identity.uid, queued.lastSeenAt);
        const matched = completeBetaQueueMatch(queued);
        if(matched) credential = matched.ownCredential;
      }
      writeJson(res, 200, {
        ok:true,
        status:credential ? 'matched' : (queued ? 'waiting' : 'idle'),
        ...(credential ? {credential} : {})
      });
      return;
    }
    if(BETA_MODE && url.pathname === '/v3/beta/matchmaking/leave' && req.method === 'POST'){
      const identity = await phase7Identity(req);
      if(!identity){
        writeJson(res, 401, {ok:false, error:'valid Firebase identity token is required'});
        return;
      }
      betaQueue.delete(identity.uid);
      store.deleteBetaMatchmakingEntry(identity.uid);
      writeJson(res, 200, {ok:true, status:'idle'});
      return;
    }
    const snapshotMatch = BETA_MODE
      ? url.pathname.match(/^\/v3\/beta\/matches\/([^/]+)\/snapshot$/)
      : url.pathname.match(/^\/v3\/matches\/([^/]+)\/snapshot$/);
    if(req.method === 'GET' && snapshotMatch){
      if(BETA_MODE && !phase7ClientCompatible(req)){
        writeJson(res, 426, {ok:false, error:'compatible Phase 7 client version is required'});
        return;
      }
      const matchId = decodeURIComponent(snapshotMatch[1]);
      const playerId = String(url.searchParams.get('playerId') || '');
      const credential = manager.authenticate(matchId, playerId, bearer(req));
      if(!credential){
        writeJson(res, 403, {ok:false, error:'match authentication failed'});
        return;
      }
      const actor = manager.actor(matchId);
      if(!actor){
        writeJson(res, 404, {ok:false, error:'match not found'});
        return;
      }
      writeJson(res, 200, {ok:true, ...actor.snapshotForPlayer(Number(credential.seat))});
      return;
    }
    writeJson(res, 404, {ok:false, error:'not found'});
  }catch(error){
    writeJson(res, 400, {ok:false, error:String(error.message || error)});
  }
});

server.on('upgrade', (req, socket)=>{
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if(url.pathname !== SOCKET_PATH){
    socket.destroy();
    return;
  }
  const key = req.headers['sec-websocket-key'];
  if(!key){
    socket.destroy();
    return;
  }
  const accept = crypto.createHash('sha1')
    .update(String(key) + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    ''
  ].join('\r\n'));
  socket.authorityV3Buffer = Buffer.alloc(0);
  sockets.add(socket);
  socket.on('data', chunk=>readFrames(socket, chunk));
  socket.on('close', ()=>unregister(socket));
  socket.on('end', ()=>unregister(socket));
  socket.on('error', ()=>unregister(socket));
});

const pingTimer = setInterval(()=>{
  for(const socket of sockets) send(socket, {kind:'ping', protocolVersion:3, time:Date.now()});
}, 45000);
pingTimer.unref?.();

function shutdown(){
  shuttingDown = true;
  clearInterval(pingTimer);
  for(const timer of promptTimers.values()) clearTimeout(timer);
  promptTimers.clear();
  for(const timer of turnTimers.values()) clearTimeout(timer?.timer);
  turnTimers.clear();
  for(const timer of disconnectForfeitTimers.values()) clearTimeout(timer);
  disconnectForfeitTimers.clear();
  for(const socket of sockets) closeSocket(socket, 1001, 'server restarting');
  server.close(()=>{
    store.close();
    process.exit(0);
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

server.listen(PORT, HOST, ()=>{
  console.log(`Fates authoritative v3 listening on http://${HOST}:${PORT}`);
});
