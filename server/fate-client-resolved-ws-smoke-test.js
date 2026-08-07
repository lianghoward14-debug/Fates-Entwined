#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {spawn} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {getCardCatalog} = require('./fate-card-catalog');
const {canonicalStateHash} = require('./fate-authority-reducer');

const gameplaySource = fs.readFileSync(path.resolve(__dirname, '../src/scripts/05-gameplay-core.js'), 'utf8');
const renderingSource = fs.readFileSync(path.resolve(__dirname, '../src/scripts/06-rendering-and-helpers.js'), 'utf8');
assert.match(
  gameplaySource,
  /case '82':[\s\S]{0,1800}await new Promise[\s\S]{0,1800}transitionGameLandscape[\s\S]{0,1800}onCancel:function\(\)\{ finishChoice\(false\); \}/,
  'Felicyta landscape selection must remain inside the awaited multiplayer board action'
);
assert.match(
  renderingSource,
  /label:'Cancel', action:function\(\)[\s\S]{0,400}choiceState\.onCancel/,
  'landscape selection cancellation must settle the awaited multiplayer board action'
);

const PORT = Number(process.env.FATE_CLIENT_RESOLVED_WS_SMOKE_PORT || 8814);
const REMOTE_ORIGIN = String(process.env.FATE_CLIENT_RESOLVED_WS_SMOKE_ORIGIN || '').trim().replace(/\/+$/, '');
const SPAWN_LOCAL = !REMOTE_ORIGIN;
const ORIGIN = REMOTE_ORIGIN || `http://127.0.0.1:${PORT}`;
const WS_URL = String(
  process.env.FATE_CLIENT_RESOLVED_WS_SMOKE_WS_URL
  || (SPAWN_LOCAL ? `ws://127.0.0.1:${PORT}` : ORIGIN.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:'))
);
const FIREBASE_API_KEY = process.env.FATE_WS_SMOKE_API_KEY || 'AIzaSyByhcqY0Y27hUkvcAtO3mflRwnQCWhv4Yc';
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
    headers:Object.assign(
      {'content-type':'application/json'},
      options.idToken ? {authorization:`Bearer ${options.idToken}`} : null
    ),
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

async function identityToolkitRequest(endpoint, body){
  const res = await fetchWithTimeout(
    `https://identitytoolkit.googleapis.com/v1/${endpoint}?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    {
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify(body || {})
    },
    REQUEST_TIMEOUT_MS
  );
  const text = await res.text();
  let json = null;
  try{ json = text ? JSON.parse(text) : null; }catch(_){}
  if(!res.ok || json?.error){
    throw new Error(`Firebase Auth ${endpoint} failed: ${json?.error?.message || text.slice(0, 240) || res.status}`);
  }
  return json || {};
}

async function createAnonymousAuthUser(label){
  const json = await identityToolkitRequest('accounts:signUp', {returnSecureToken:true});
  if(!json.idToken || !json.localId) throw new Error(`anonymous ${label} auth response missing idToken/localId`);
  return {label, uid:String(json.localId), idToken:String(json.idToken), temporary:true};
}

async function authUsers(){
  if(SPAWN_LOCAL){
    return {
      host:{label:'host', uid:'client-resolved-host', idToken:''},
      guest:{label:'guest', uid:'client-resolved-guest', idToken:''},
      mode:'fake-local'
    };
  }
  const host = await createAnonymousAuthUser('host');
  const guest = await createAnonymousAuthUser('guest');
  return {host, guest, mode:'temporary-anonymous-firebase-users'};
}

async function deleteTemporaryAuthUser(user){
  if(!user?.temporary || !user.idToken) return;
  try{
    await identityToolkitRequest('accounts:delete', {idToken:user.idToken});
  }catch(_){}
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
  if(!SPAWN_LOCAL) return null;
  const configuredDataDir = String(process.env.FATE_CLIENT_RESOLVED_WS_SMOKE_DATA_DIR || '').trim();
  const dataDir = configuredDataDir
    ? path.resolve(configuredDataDir)
    : fs.mkdtempSync(path.join(os.tmpdir(), 'fate-client-resolved-ws-'));
  fs.mkdirSync(dataDir, {recursive:true});
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
      if(health.ok) return {child, dataDir, ownsDataDir:!configuredDataDir, log:()=>log};
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
        idToken:user.idToken || '',
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
  let users = null;
  try{
    const health = await fetchJson('/health');
    assert.strictEqual(health.gameplayAuthority, 'client-resolved');
    assert.strictEqual(health.clientResolvedGameplay, true);

    users = await authUsers();
    const host = users.host;
    const guest = users.guest;
    const created = await fetchJson('/api/rooms', {
      method:'POST',
      idToken:host.idToken,
      body:{uid:host.uid, mode:'freeplay', profile:profile('CR Host'), deckChoice:deckChoice('CR Host Deck')}
    });
    const roomCode = String(created.room?.roomCode || created.room?.code || '');
    assert.match(roomCode, /^[A-Z0-9]{6}$/);

    await fetchJson(`/api/rooms/${encodeURIComponent(roomCode)}/join`, {
      method:'POST',
      idToken:guest.idToken,
      body:{uid:guest.uid, profile:profile('CR Guest'), deckChoice:deckChoice('CR Guest Deck')}
    });

    const started = await fetchJson(`/api/rooms/${encodeURIComponent(roomCode)}/start`, {
      method:'POST',
      idToken:host.idToken,
      body:{uid:host.uid, seed:'client-resolved-ws-smoke', song:'board1', mode:'freeplay'}
    });
    assert.strictEqual(String(started.accepted?.action?.type || '').toUpperCase(), 'MATCH_START');
    const startState = started.accepted.action.payload.postState;
    const startHash = started.accepted.action.payload.stateHash;
    assert.ok(startState && startHash, 'MATCH_START must return canonical postState/stateHash');
    const afterStartDelayMs = Math.max(
      0,
      Math.min(5000, Number(process.env.FATE_CLIENT_RESOLVED_WS_SMOKE_AFTER_START_DELAY_MS || 0) || 0)
    );
    if(afterStartDelayMs) await sleep(afterStartDelayMs);

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
    const activationPending = activationAccepted.action.payload.postState._serverPendingReaction;
    assert.strictEqual(activationPending.actionType, 'initiator_effect', 'fresh activation buttons must open Lydia adjudication');
    assert.strictEqual(activationAccepted.roomPatch?.currentTurnUid, reactionReactorUid, 'a Lydia window must temporarily pass authority to the reacting player');
    assert.strictEqual(Number(activationAccepted.action.payload.postState.board[0][actorRow][0].currentFate), 99, 'the optimistic result must remain visible while Lydia decides');
    const allowActivationId = sendIntent(reactionReactorClient, roomCode, 'REACTION_CHOICE', {
      playerIndex:reactionReactor,
      promptId:activationPending.promptId,
      choice:'allow'
    });
    const activationAllowed = await expectAccepted(reactionReactorClient, allowActivationId, 'REACTION_CHOICE');
    assert.strictEqual(activationAllowed.action.payload.postState._serverPendingReaction == null, true, 'allowing Lydia must close the activation reaction');
    assert.strictEqual(activationAllowed.roomPatch?.currentTurnUid, reactionActorUid, 'allowing Lydia must return authority to the acting player');

    const placementBase = clone(activationAllowed.action.payload.postState);
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
      baseStateHash:activationAllowed.action.payload.stateHash,
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

    const resumed = await fetchJson(`/api/rooms/${encodeURIComponent(roomCode)}/resume?after=0&limit=20&includeState=1`, {
      idToken:host.idToken
    });
    assert.strictEqual(resumed.canonicalHash, negatedPlacement.action.payload.stateHash);
    assert.strictEqual(resumed.canonicalState.board[0][actorRow][0].iid, placementSource.iid);

    const landscapeBase = clone(negatedPlacement.action.payload.postState);
    landscapeBase.board = blankBoard();
    landscapeBase.players[0].hand = [];
    landscapeBase.players[1].hand = [];
    landscapeBase.currentPlayer = reactionActor;
    landscapeBase.landscapeId = 'igb1';
    landscapeBase.landscapeBgNum = 1;
    landscapeBase._landscapeState = {
      id:'igb1',
      targetZone:null,
      consolidations:[0, 0],
      zoneFateBonuses:[[0, 0, 0], [0, 0, 0]],
      resolvedTurns:{},
      eventideMovedIids:{},
      drawPhaseCounts:[0, 0],
      supporterEffectsThisTurn:[0, 0],
      handTurnCounts:[0, 0],
      handLastResolvedGameTurns:[null, null]
    };
    const felicyta = testCard('82', reactionActor, 'ws-felicyta-youth-1', 'Initiator');
    felicyta.name = 'Felicyta Janowicz (Youth)';
    landscapeBase.board[0][actorRow][0] = felicyta;
    const landscapeBaseHash = canonicalStateHash(landscapeBase);
    const syncLandscapeBaseId = sendIntent(reactionActorClient, roomCode, 'STATE_SYNC', {
      playerIndex:reactionActor,
      currentPlayer:reactionActor,
      turn:landscapeBase.turn,
      baseStateHash:negatedPlacement.action.payload.stateHash,
      postState:landscapeBase,
      stateHash:landscapeBaseHash
    });
    await expectAccepted(reactionActorClient, syncLandscapeBaseId, 'STATE_SYNC');

    const landscapePost = clone(landscapeBase);
    landscapePost.landscapeId = 'igb3';
    landscapePost.landscapeBgNum = 3;
    landscapePost._landscapeState.id = 'igb3';
    landscapePost._landscapeState.targetZone = 1;
    landscapePost.board[0][actorRow][0].effectUsedInitial = true;
    landscapePost.board[0][actorRow][0]._effectTurnLocked = true;
    const landscapePostHash = canonicalStateHash(landscapePost);
    const landscapeActionId = sendIntent(reactionActorClient, roomCode, 'ACTION_RESULT', {
      playerIndex:reactionActor,
      turn:landscapeBase.turn,
      actionKind:'BOARD_ACTION',
      fn:'triggerCharacterEffect',
      z:0,
      r:actorRow,
      c:0,
      source:{z:0, r:actorRow, c:0, card:{iid:felicyta.iid, id:'82', name:felicyta.name, type:'Initiator'}},
      baseStateHash:landscapeBaseHash,
      postState:landscapePost,
      stateHash:landscapePostHash
    });
    const landscapeAccepted = await expectAccepted(reactionActorClient, landscapeActionId, 'ACTION_RESULT');
    assert.strictEqual(landscapeAccepted.action.payload.postState.landscapeId, 'igb3', 'authority must accept Felicyta and the landscape change atomically');
    const remoteLandscape = await waitForMessage(
      reactionReactorClient,
      msg => msg.kind === 'accepted' && Number(msg.action?.seq || 0) === Number(landscapeAccepted.action?.seq || 0),
      'opponent Felicyta landscape broadcast'
    );
    assert.strictEqual(remoteLandscape.action.payload.postState.landscapeId, 'igb3', 'opponent must receive Felicyta landscape changes');

    const handLimitPlayer = reactionReactor;
    const handLimitClient = reactionReactorClient;
    const handLimitBase = clone(landscapeAccepted.action.payload.postState);
    handLimitBase.players[0].hand = [];
    handLimitBase.players[1].hand = [];
    handLimitBase.players[handLimitPlayer].discard = [];
    handLimitBase.players[handLimitPlayer].hand.push(Object.assign(
      testCard('bh03', handLimitPlayer, 'ws-ali-opponent-hand', 'Improvisor'),
      {_bh03OpponentHand:true, _bh03TransferredFrom:reactionActor, immuneFlag:true, cantBeReduced:true}
    ));
    for(let i = 0; i < 6; i += 1){
      handLimitBase.players[handLimitPlayer].hand.push(testCard('limit-' + i, handLimitPlayer, 'ws-limit-' + i, 'Supporter'));
    }
    const handLimitBaseHash = canonicalStateHash(handLimitBase);
    const syncHandLimitBaseId = sendIntent(reactionActorClient, roomCode, 'STATE_SYNC', {
      playerIndex:reactionActor,
      currentPlayer:reactionActor,
      turn:handLimitBase.turn,
      baseStateHash:landscapeAccepted.action.payload.stateHash,
      postState:handLimitBase,
      stateHash:handLimitBaseHash
    });
    await expectAccepted(reactionActorClient, syncHandLimitBaseId, 'STATE_SYNC');

    const handLimitPost = clone(handLimitBase);
    const handLimitDiscarded = handLimitPost.players[handLimitPlayer].hand.pop();
    handLimitPost.players[handLimitPlayer].discard.push(handLimitDiscarded);
    const handLimitActionId = sendIntent(handLimitClient, roomCode, 'ACTION_RESULT', {
      playerIndex:handLimitPlayer,
      turn:handLimitBase.turn,
      actionKind:'HAND_LIMIT_DISCARD',
      discardedIids:[String(handLimitDiscarded.iid)],
      handLimit:6,
      baseStateHash:handLimitBaseHash,
      postState:handLimitPost,
      stateHash:canonicalStateHash(handLimitPost)
    });
    const handLimitAccepted = await expectAccepted(handLimitClient, handLimitActionId, 'ACTION_RESULT');
    assert.strictEqual(handLimitAccepted.action.payload.postState.players[handLimitPlayer].hand.length, 6, 'off-turn Ali recipient must be able to discard down to six');
    assert.strictEqual(handLimitAccepted.roomPatch?.currentTurnUid, reactionActorUid, 'forced hand-limit discard must not steal the active turn');

    const effectFlashEventId = `ws-effect-flash-${Date.now()}`;
    const remoteEffectFlashPromise = waitForMessage(
      reactionActorClient,
      msg => msg.kind === 'accepted'
        && String(msg.action?.type || '').toUpperCase() === 'EFFECT_CINEMATIC'
        && String(msg.action?.clientActionId || '') === effectFlashEventId,
      'opponent card effect flash presentation broadcast'
    );
    const effectFlashRequestId = sendIntent(handLimitClient, roomCode, 'EFFECT_CINEMATIC', {
      playerIndex:handLimitPlayer,
      turn:handLimitBase.turn,
      clientActionId:effectFlashEventId,
      presentationEvents:[{
        type:'CARD_EFFECT_FLASH',
        eventId:effectFlashEventId,
        playerIndex:handLimitPlayer,
        target:{z:0, r:0, c:0, iid:'effect-flash-target'},
        kind:'isaac_beaker',
        label:'scientific inquiry',
        at:Date.now(),
        duration:3500,
        localActorAlreadyPresented:true
      }]
    });
    const effectFlashAccepted = await expectAccepted(handLimitClient, effectFlashRequestId, 'EFFECT_CINEMATIC');
    assert.strictEqual(effectFlashAccepted.serverStateHash, handLimitAccepted.action.payload.stateHash, 'effect flash presentation must not mutate canonical state');
    assert.strictEqual(effectFlashAccepted.action.payload.presentationEvents?.[0]?.type, 'CARD_EFFECT_FLASH', 'effect flash presentation must survive authority broadcast');
    const remoteEffectFlash = await remoteEffectFlashPromise;
    assert.strictEqual(remoteEffectFlash.action.payload.presentationEvents?.[0]?.eventId, effectFlashEventId, 'opponent must receive the exact effect flash event');
    assert.ok(!Object.prototype.hasOwnProperty.call(remoteEffectFlash.roomPatch || {}, 'currentTurnUid'), 'effect presentation must not mutate active-turn ownership');

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
      idToken:reactionActor === 0 ? host.idToken : guest.idToken,
      body:{uid:reactionActorUid, clientActionId:forfeitClientActionId}
    });
    const forfeited = forfeitResponse.accepted;
    assert.strictEqual(forfeited.roomPatch?.status, 'ended', 'FORFEIT must end the authority room');
    assert.strictEqual(forfeited.roomPatch?.phase, 'ended', 'FORFEIT must end the authority phase');
    assert.strictEqual(forfeited.roomPatch?.endedBy, reactionActorUid, 'FORFEIT must identify the leaving player');
    assert.strictEqual(forfeitResponse.room?.endedBy, reactionActorUid, 'room watch payload must identify who ended the match');
    const remoteForfeit = await remoteForfeitPromise;
    assert.strictEqual(remoteForfeit.roomPatch?.status, 'ended', 'opponent must receive the terminal room status');
    console.log(`fate-client-resolved-ws smoke passed (${users.mode}; ${ORIGIN})`);
  }finally{
    clients.forEach(client => {
      try{ client.ws.close(); }catch(_){}
    });
    if(authority){
      try{ authority.child.kill(); }catch(_){}
      if(authority.ownsDataDir){
        try{ fs.rmSync(authority.dataDir, {recursive:true, force:true}); }catch(_){}
      }
    }
    await Promise.all([deleteTemporaryAuthUser(users?.host), deleteTemporaryAuthUser(users?.guest)]);
  }
}

run().catch(err => {
  console.error(err && err.stack || err);
  process.exit(1);
});
