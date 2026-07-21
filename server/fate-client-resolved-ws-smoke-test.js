#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {spawn} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {getCardCatalog} = require('./fate-card-catalog');
const {canonicalStateHash} = require('./fate-authority-reducer');

const PORT = Number(process.env.FATE_CLIENT_RESOLVED_WS_SMOKE_PORT || 8814);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const WS_URL = `ws://127.0.0.1:${PORT}`;
const REQUEST_TIMEOUT_MS = Number(process.env.FATE_CLIENT_RESOLVED_WS_SMOKE_TIMEOUT_MS || 20000);

function sleep(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timed out fetching ${url}`)), timeoutMs);
  try{
    return await fetch(url, Object.assign({}, options, {signal:controller.signal}));
  }finally{
    clearTimeout(timer);
  }
}

async function fetchJson(route, options = {}){
  const res = await fetchWithTimeout(ORIGIN + route, {
    method:options.method || 'GET',
    headers:{'content-type':'application/json'},
    body:options.body === undefined ? undefined : JSON.stringify(options.body)
  }, options.timeoutMs || REQUEST_TIMEOUT_MS);
  const text = await res.text();
  let json = null;
  try{ json = text ? JSON.parse(text) : null; }catch(_){}
  if(!res.ok || json?.ok === false){
    throw new Error(`${options.method || 'GET'} ${route} failed ${res.status}: ${json?.error || text.slice(0, 300)}`);
  }
  return json;
}

function validDeck(){
  return getCardCatalog().cards
    .filter(card => card && !card.retired && !card.temporarilyDisabled)
    .map(card => String(card.id || ''))
    .filter(Boolean)
    .slice(0, 40);
}

function profile(username){
  return {username, avatarUrl:'', characterTitle:'Footman', challengerElo:600, challengerWins:0, challengerLosses:0};
}

function deckChoice(name){
  return {ready:true, name, deckIds:validDeck()};
}

async function startServer(){
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fate-client-resolved-ws-'));
  const child = spawn(process.execPath, ['server/fate-ws-authority.js'], {
    cwd:path.resolve(__dirname, '..'),
    env:Object.assign({}, process.env, {
      FATE_WS_HOST:'127.0.0.1',
      FATE_WS_PORT:String(PORT),
      FATE_WS_REQUIRE_TOKEN:'0',
      FATE_WS_DURABLE_WRITES:'off',
      FATE_WS_REQUIRE_DURABLE_WRITES:'0',
      FATE_WS_DISABLE_FIREBASE_RTDB:'1',
      FATE_RTDB_DISABLED:'1',
      FATE_WS_STATE_GATE:'1',
      FATE_WS_REDUCER_MODE:'client-resolved',
      FATE_WS_GAMEPLAY_AUTHORITY:'client-resolved',
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
  while(Date.now() - started < 10000){
    if(child.exitCode !== null) throw new Error(`authority exited early: ${log.slice(-2000)}`);
    try{
      const health = await fetchJson('/health', {timeoutMs:1000});
      if(health.ok) return {child, dataDir, log:()=>log};
    }catch(_){}
    await sleep(100);
  }
  try{ child.kill(); }catch(_){}
  throw new Error(`authority did not become healthy: ${log.slice(-2000)}`);
}

function waitForMessage(client, predicate, label, timeoutMs = REQUEST_TIMEOUT_MS){
  const existing = client.messages.find(predicate);
  if(existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for ${label}`));
    }, timeoutMs);
    function onMessage(message){
      if(!predicate(message)) return;
      cleanup();
      resolve(message);
    }
    function cleanup(){
      clearTimeout(timer);
      client.listeners.delete(onMessage);
    }
    client.listeners.add(onMessage);
  });
}

function connectClient(user, room){
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
        idToken:'',
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
      try{
        await waitForMessage(client, msg => msg.kind === 'hello-ok', `${user.label} hello-ok`);
        resolve(client);
      }catch(err){
        reject(err);
      }
    }, {once:true});
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error(`websocket error for ${user.label}`));
    }, {once:true});
  });
}

function sendIntent(client, roomCode, type, payload){
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

async function expectAccepted(client, requestId, type){
  const msg = await waitForMessage(
    client,
    item => (item.kind === 'accepted' || item.kind === 'rejected') && item.requestId === requestId,
    `${type} accepted or rejected`
  );
  if(msg.kind === 'rejected') throw new Error(`${type} rejected: ${msg.reason || msg.error || JSON.stringify(msg).slice(0, 500)}`);
  assert.strictEqual(String(msg.action?.type || '').toUpperCase(), type);
  return msg;
}

async function expectRejected(client, requestId, pattern, label){
  const msg = await waitForMessage(
    client,
    item => (item.kind === 'accepted' || item.kind === 'rejected') && item.requestId === requestId,
    `${label || 'action'} accepted or rejected`
  );
  assert.strictEqual(msg.kind, 'rejected', `${label || 'action'} should be rejected`);
  if(pattern) assert.match(String(msg.reason || ''), pattern);
  return msg;
}

function clone(value){
  return JSON.parse(JSON.stringify(value || null));
}

function blankBoard(){
  return Array.from({length:3}, () => Array.from({length:3}, () => Array(3).fill(null)));
}

function testCard(id, owner, iid, type){
  return {
    id:String(id),
    iid:String(iid || id + '-' + owner),
    owner,
    name:String(id),
    type:type || 'Supporter',
    aff:'reality',
    fate:1,
    currentFate:1,
    cost:0
  };
}

async function run(){
  const authority = await startServer();
  const clients = [];
  try{
    const health = await fetchJson('/health');
    assert.strictEqual(health.gameplayAuthority, 'client-resolved');
    assert.strictEqual(health.clientResolvedGameplay, true);

    const host = {label:'host', uid:'client-resolved-host'};
    const guest = {label:'guest', uid:'client-resolved-guest'};
    const created = await fetchJson('/api/rooms', {
      method:'POST',
      body:{uid:host.uid, mode:'freeplay', profile:profile('CR Host'), deckChoice:deckChoice('CR Host Deck')}
    });
    const roomCode = String(created.room?.roomCode || created.room?.code || '');
    assert.match(roomCode, /^[A-Z0-9]{6}$/);

    await fetchJson(`/api/rooms/${encodeURIComponent(roomCode)}/join`, {
      method:'POST',
      body:{uid:guest.uid, profile:profile('CR Guest'), deckChoice:deckChoice('CR Guest Deck')}
    });

    const started = await fetchJson(`/api/rooms/${encodeURIComponent(roomCode)}/start`, {
      method:'POST',
      body:{uid:host.uid, seed:'client-resolved-ws-smoke', song:'board1', mode:'freeplay'}
    });
    assert.strictEqual(String(started.accepted?.action?.type || '').toUpperCase(), 'MATCH_START');
    const startState = started.accepted.action.payload.postState;
    const startHash = started.accepted.action.payload.stateHash;
    assert.ok(startState && startHash, 'MATCH_START must return canonical postState/stateHash');

    const activePlayer = Number(startState.currentPlayer || 0);
    const activeUid = activePlayer === 0 ? host.uid : guest.uid;
    const nextUid = activePlayer === 0 ? guest.uid : host.uid;
    assert.strictEqual(started.room.currentTurnUid, activeUid);

    const roomForHello = Object.assign({}, started.room, {
      roomCode,
      canonicalHash:startHash,
      serverStateHash:startHash
    });
    const hostClient = await connectClient(host, roomForHello);
    const guestClient = await connectClient(guest, roomForHello);
    clients.push(hostClient, guestClient);

    const activeClient = activePlayer === 0 ? hostClient : guestClient;
    const observer = activePlayer === 0 ? guestClient : hostClient;
    const postState = JSON.parse(JSON.stringify(startState));
    postState.currentPlayer = activePlayer === 0 ? 1 : 0;
    postState.turn = Math.max(1, Number(startState.turn || 1) || 1) + 1;
    postState.selectedHandCard = null;
    postState.selectedBoardCard = null;
    postState.placing = false;
    postState.blockingCell = false;
    postState.pendingEffect = null;
    postState.pendingInteraction = null;
    const postHash = canonicalStateHash(postState);

    const requestId = sendIntent(activeClient, roomCode, 'ACTION_RESULT', {
      playerIndex:activePlayer,
      turn:startState.turn,
      actionKind:'END_TURN',
      baseStateHash:startHash,
      postState,
      stateHash:postHash
    });
    const accepted = await expectAccepted(activeClient, requestId, 'ACTION_RESULT');
    assert.strictEqual(accepted.roomPatch?.currentTurnUid, nextUid, 'expected ACTION_RESULT end turn to move room turn');
    await waitForMessage(observer, msg => msg.kind === 'accepted' && Number(msg.action?.seq || 0) === Number(accepted.action?.seq || 0), 'observer ACTION_RESULT broadcast');

    const invalidPostState = clone(postState);
    invalidPostState.turn += 1;
    const rollbackRequestId = sendIntent(observer, roomCode, 'ACTION_RESULT', {
      playerIndex:Number(postState.currentPlayer),
      turn:postState.turn,
      actionKind:'END_TURN',
      baseStateHash:postHash,
      postState:invalidPostState,
      stateHash:'invalid-client-state-hash'
    });
    const rollbackRejection = await expectRejected(observer, rollbackRequestId, /stateHash does not match postState/, 'invalid client-resolved state');
    assert.strictEqual(rollbackRejection.serverStateHash, postHash, 'WebSocket rejection must include the canonical rollback hash');
    assert.deepStrictEqual(rollbackRejection.serverState, postState, 'WebSocket rejection must include the canonical rollback state');

    const reactionActor = Number(postState.currentPlayer);
    const reactionReactor = reactionActor === 0 ? 1 : 0;
    const reactionActorClient = reactionActor === activePlayer ? activeClient : observer;
    const reactionReactorClient = reactionActor === activePlayer ? observer : activeClient;
    const reactionActorUid = reactionActor === 0 ? host.uid : guest.uid;
    const reactionReactorUid = reactionReactor === 0 ? host.uid : guest.uid;
    const reactionBase = clone(postState);
    reactionBase.board = blankBoard();
    reactionBase.players[0].hand = [];
    reactionBase.players[1].hand = [];
    reactionBase.currentPlayer = reactionActor;
    reactionBase.phase = 'main';
    reactionBase.pendingInteraction = null;
    reactionBase._serverPendingReaction = null;
    const actorRow = reactionActor === 0 ? 2 : 0;
    const reactorRow = reactionReactor === 0 ? 2 : 0;
    const source = testCard('03', reactionActor, 'ws-source-1', 'Initiator');
    source.name = 'Howard Walsh';
    const lydia = testCard('56', reactionReactor, 'ws-lydia-1', 'Improvisor');
    lydia.name = 'Lydia';
    lydia.usesLeft = 3;
    reactionBase.board[0][actorRow][0] = source;
    reactionBase.board[1][reactorRow][0] = lydia;
    const reactionBaseHash = canonicalStateHash(reactionBase);
    const syncReactionBaseId = sendIntent(reactionActorClient, roomCode, 'STATE_SYNC', {
      playerIndex:reactionActor,
      currentPlayer:reactionActor,
      turn:reactionBase.turn,
      baseStateHash:postHash,
      postState:reactionBase,
      stateHash:reactionBaseHash
    });
    const syncedReactionBase = await expectAccepted(reactionActorClient, syncReactionBaseId, 'STATE_SYNC');
    assert.strictEqual(syncedReactionBase.roomPatch?.currentTurnUid, reactionActorUid, 'reaction setup should make actor current turn');

    const resolvedReaction = clone(reactionBase);
    resolvedReaction.board[0][actorRow][0].currentFate = 99;
    resolvedReaction.board[0][actorRow][0].effectUsedInitial = true;
    resolvedReaction.board[0][actorRow][0]._effectTurnLocked = true;
    const resolvedReactionHash = canonicalStateHash(resolvedReaction);
    const armReactionId = sendIntent(reactionActorClient, roomCode, 'ACTION_RESULT', {
      playerIndex:reactionActor,
      turn:reactionBase.turn,
      actionKind:'BOARD_ACTION',
      fn:'triggerCharacterEffect',
      z:0,
      r:actorRow,
      c:0,
      source:{z:0, r:actorRow, c:0, card:{iid:'ws-source-1', id:'03', name:'Howard Walsh', type:'Initiator'}},
      effectCinematic:{z:0, r:actorRow, c:0, card:{iid:'ws-source-1', id:'03', name:'Howard Walsh', type:'Initiator'}},
      reactionActionType:'targeting_effect',
      affectedOwners:[reactionReactor],
      baseStateHash:reactionBaseHash,
      postState:resolvedReaction,
      stateHash:resolvedReactionHash
    });
    const activationAccepted = await expectAccepted(reactionActorClient, armReactionId, 'ACTION_RESULT');
    assert.strictEqual(activationAccepted.action.payload.postState._serverPendingReaction, null, 'activation buttons must not reopen the multiplayer Improvisor path');
    assert.strictEqual(activationAccepted.roomPatch?.currentTurnUid, reactionActorUid, 'normal activation must keep control with the acting player');
    assert.strictEqual(Number(activationAccepted.action.payload.postState.board[0][actorRow][0].currentFate), 99, 'normal activation must apply immediately after first-set adjudication');

    const placementBase = clone(activationAccepted.action.payload.postState);
    placementBase.board = blankBoard();
    placementBase.players[0].hand = [];
    placementBase.players[1].hand = [];
    placementBase.currentPlayer = reactionActor;
    placementBase.pendingInteraction = null;
    placementBase._serverPendingReaction = null;
    const placementSource = testCard('27', reactionActor, 'ws-placement-kazumi-1', 'Initiator');
    placementSource.name = 'Kazumi';
    const placementSecules = testCard('67', reactionReactor, 'ws-placement-secules-1', 'Improvisor');
    placementSecules.name = 'Mr. Secules';
    placementBase.players[reactionActor].hand = [placementSource];
    placementBase.board[1][reactorRow][0] = placementSecules;
    const placementBaseHash = canonicalStateHash(placementBase);
    const syncPlacementBaseId = sendIntent(reactionActorClient, roomCode, 'STATE_SYNC', {
      playerIndex:reactionActor,
      currentPlayer:reactionActor,
      turn:placementBase.turn,
      baseStateHash:activationAccepted.action.payload.stateHash,
      postState:placementBase,
      stateHash:placementBaseHash
    });
    await expectAccepted(reactionActorClient, syncPlacementBaseId, 'STATE_SYNC');

    const placementPost = clone(placementBase);
    placementPost.players[reactionActor].hand = [];
    placementPost.board[0][actorRow][0] = placementSource;
    const placementPostHash = canonicalStateHash(placementPost);
    const armPlacementId = sendIntent(reactionActorClient, roomCode, 'ACTION_RESULT', {
      playerIndex:reactionActor,
      turn:placementBase.turn,
      actionKind:'PLACE_CARD',
      z:0,
      r:actorRow,
      c:0,
      selectedHand:{iid:placementSource.iid, id:placementSource.id, type:placementSource.type, name:placementSource.name},
      baseStateHash:placementBaseHash,
      postState:placementPost,
      stateHash:placementPostHash
    });
    const armedPlacement = await expectAccepted(reactionActorClient, armPlacementId, 'ACTION_RESULT');
    const placementPending = armedPlacement.action.payload.postState._serverPendingReaction;
    assert.ok(placementPending, 'client-resolved ACTION_RESULT placement must arm a first-set Improvisor reaction');
    assert.strictEqual(placementPending.actionType, 'first_set_effect');
    assert.strictEqual(armedPlacement.action.payload.postState.board[0][actorRow][0].iid, placementSource.iid, 'pending placement reaction must keep Kazumi set on board');
    assert.ok(placementPending.options.some(option=>String(option.kind || '') === 'secules'), 'Kazumi placement must offer Secules before its automatic draw');
    const placementSeculesIndex = placementPending.options.findIndex(option=>String(option.kind || '') === 'secules');
    assert.ok(placementSeculesIndex >= 0, 'Kazumi placement must expose the Secules option index');
    const negatePlacementId = sendIntent(reactionReactorClient, roomCode, 'REACTION_CHOICE', {
      playerIndex:reactionReactor,
      promptId:placementPending.promptId,
      choice:'negate',
      optionIndex:placementSeculesIndex,
      baseStateHash:armedPlacement.action.payload.stateHash
    });
    const negatedPlacement = await expectAccepted(reactionReactorClient, negatePlacementId, 'REACTION_CHOICE');
    assert.strictEqual(negatedPlacement.action.payload.postState._serverPendingReaction, null);
    assert.strictEqual(negatedPlacement.action.payload.postState.board[0][actorRow][0]._effectNegatedByReaction, true, 'WebSocket first-set negate must mark the one-shot source negated');
    assert.strictEqual(negatedPlacement.action.payload.reactionResolution?.mode, 'negated', 'WebSocket accepted action must broadcast negation semantics to both clients');
    assert.strictEqual(negatedPlacement.action.payload.reactionResolution?.sourceName, 'Kazumi', 'WebSocket negation banner must name the actual first-set source');

    const resumed = await fetchJson(`/api/rooms/${encodeURIComponent(roomCode)}/resume?after=0&limit=20&includeState=1`);
    assert.strictEqual(resumed.canonicalHash, negatedPlacement.action.payload.stateHash);
    assert.strictEqual(resumed.canonicalState.board[0][actorRow][0].iid, placementSource.iid);

    const forfeitClientActionId = `http-forfeit-${Date.now()}`;
    const remoteForfeitPromise = waitForMessage(
      reactionReactorClient,
      msg => msg.kind === 'accepted'
        && String(msg.action?.type || '').toUpperCase() === 'FORFEIT'
        && String(msg.action?.clientActionId || '') === forfeitClientActionId,
      'opponent HTTP FORFEIT broadcast'
    );
    const forfeitResponse = await fetchJson(`/api/rooms/${encodeURIComponent(roomCode)}/forfeit`, {
      method:'POST',
      body:{uid:reactionActorUid, clientActionId:forfeitClientActionId}
    });
    const forfeited = forfeitResponse.accepted;
    assert.strictEqual(forfeited.roomPatch?.status, 'ended', 'FORFEIT must end the authority room');
    assert.strictEqual(forfeited.roomPatch?.phase, 'ended', 'FORFEIT must end the authority phase');
    assert.strictEqual(forfeited.roomPatch?.endedBy, reactionActorUid, 'FORFEIT must identify the leaving player');
    assert.strictEqual(forfeitResponse.room?.endedBy, reactionActorUid, 'room watch payload must identify who ended the match');
    const remoteForfeit = await remoteForfeitPromise;
    assert.strictEqual(remoteForfeit.roomPatch?.status, 'ended', 'opponent must receive the terminal room status');
    console.log('fate-client-resolved-ws smoke passed');
  }finally{
    clients.forEach(client => {
      try{ client.ws.close(); }catch(_){}
    });
    try{ authority.child.kill(); }catch(_){}
    try{ fs.rmSync(authority.dataDir, {recursive:true, force:true}); }catch(_){}
  }
}

run().catch(err => {
  console.error(err && err.stack || err);
  process.exit(1);
});
