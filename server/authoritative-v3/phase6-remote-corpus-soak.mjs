#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {getCardCatalog} = require('../fate-card-catalog.js');
const {canonicalStateHash} = require('../fate-authority-reducer.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const expectedOrigin = 'https://fates-entwined-v3-shadow-soak.fly.dev';
const origin = String(process.env.FATE_PHASE6_REMOTE_CORPUS_ORIGIN || expectedOrigin).replace(/\/+$/, '');
const wsUrl = String(
  process.env.FATE_PHASE6_REMOTE_CORPUS_WS_URL
  || origin.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:')
);
const enabled = process.env.FATE_PHASE6_REMOTE_CORPUS_SOAK === '1';
const firebaseApiKey = process.env.FATE_WS_SMOKE_API_KEY || 'AIzaSyByhcqY0Y27hUkvcAtO3mflRwnQCWhv4Yc';
const timeoutMs = Math.max(5_000, Number(process.env.FATE_PHASE6_REMOTE_CORPUS_TIMEOUT_MS || 60_000) || 60_000);
const clientActionPrefix = 'phase6-real-corpus-v1:';

if(!enabled){
  throw new Error('remote corpus soak requires exact FATE_PHASE6_REMOTE_CORPUS_SOAK=1 opt-in');
}
if(origin !== expectedOrigin || wsUrl !== 'wss://fates-entwined-v3-shadow-soak.fly.dev'){
  throw new Error('remote corpus soak is pinned to the separate fates-entwined-v3-shadow-soak deployment');
}

const args = process.argv.slice(2);
function integerOption(name, fallback){
  const index = args.indexOf(name);
  if(index < 0) return fallback;
  const value = Number(args[index + 1]);
  if(!Number.isInteger(value) || value < 0) throw new Error(`${name} requires a non-negative integer`);
  return value;
}

const corpus = JSON.parse(fs.readFileSync(
  path.join(root, 'docs', 'fixtures', 'AUTHORITY_V3_PHASE5_REAL_LEGACY_SELF_PLAY_CORPUS.json'),
  'utf8'
));
const startIndex = integerOption('--start', 0);
const limit = integerOption('--limit', corpus.actions.length - startIndex);
const concurrency = Math.max(1, Math.min(8, integerOption('--concurrency', 4)));
const actions = corpus.actions.slice(startIndex, startIndex + limit);
if(!actions.length) throw new Error('remote corpus soak selected no actions');

function sleep(ms){
  return new Promise(resolve=>setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}){
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(new Error(`timed out fetching ${url}`)), timeoutMs);
  try{
    return await fetch(url, {...options, signal:controller.signal});
  }finally{
    clearTimeout(timer);
  }
}

async function fetchJson(route, options = {}){
  const url = /^https?:\/\//i.test(route) ? route : origin + route;
  const response = await fetchWithTimeout(url, {
    method:options.method || 'GET',
    headers:{
      'content-type':'application/json',
      ...(options.idToken ? {authorization:`Bearer ${options.idToken}`} : {})
    },
    body:options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  let json = null;
  try{ json = text ? JSON.parse(text) : null; }catch(_){}
  if(!response.ok || json?.ok === false){
    throw new Error(`${options.method || 'GET'} ${url} failed ${response.status}: ${json?.error || text.slice(0, 300)}`);
  }
  return json;
}

async function identityToolkitRequest(endpoint, body){
  const response = await fetchWithTimeout(
    `https://identitytoolkit.googleapis.com/v1/${endpoint}?key=${encodeURIComponent(firebaseApiKey)}`,
    {
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify(body || {})
    }
  );
  const text = await response.text();
  let json = null;
  try{ json = text ? JSON.parse(text) : null; }catch(_){}
  if(!response.ok || json?.error){
    throw new Error(`Firebase Auth ${endpoint} failed: ${json?.error?.message || text.slice(0, 240) || response.status}`);
  }
  return json || {};
}

async function createAnonymousUser(label){
  const result = await identityToolkitRequest('accounts:signUp', {returnSecureToken:true});
  if(!result.idToken || !result.localId) throw new Error(`anonymous ${label} auth response is incomplete`);
  return {label, uid:String(result.localId), idToken:String(result.idToken)};
}

async function deleteAnonymousUser(user){
  if(!user?.idToken) return;
  try{
    await identityToolkitRequest('accounts:delete', {idToken:user.idToken});
  }catch(_){}
}

function validDeck(){
  return getCardCatalog().cards
    .filter(card=>card && !card.retired && !card.temporarilyDisabled)
    .map(card=>String(card.id || ''))
    .filter(Boolean)
    .slice(0, 40);
}

const deckIds = validDeck();
function profile(username){
  return {username, avatarUrl:'', characterTitle:'Footman', challengerElo:600, challengerWins:0, challengerLosses:0};
}
function deckChoice(name){
  return {ready:true, name, deckIds};
}

function waitForMessage(client, predicate, label){
  const existing = client.messages.find(predicate);
  if(existing) return Promise.resolve(existing);
  return new Promise((resolve, reject)=>{
    const timer = setTimeout(()=>{
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

async function connectClient(user, room){
  const ws = new WebSocket(wsUrl);
  const client = {user, ws, messages:[], listeners:new Set()};
  ws.addEventListener('message', event=>{
    const raw = typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8');
    const message = JSON.parse(raw);
    client.messages.push(message);
    client.listeners.forEach(listener=>listener(message));
  });
  await new Promise((resolve, reject)=>{
    const timer = setTimeout(()=>reject(new Error(`WebSocket open timed out for ${user.label}`)), timeoutMs);
    ws.addEventListener('open', async ()=>{
      clearTimeout(timer);
      ws.send(JSON.stringify({
        kind:'hello',
        roomCode:room.roomCode || room.code,
        uid:user.uid,
        idToken:user.idToken,
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
        await waitForMessage(client, message=>message.kind === 'hello-ok', `${user.label} hello-ok`);
        resolve();
      }catch(error){
        reject(error);
      }
    }, {once:true});
    ws.addEventListener('error', ()=>{
      clearTimeout(timer);
      reject(new Error(`WebSocket error for ${user.label}`));
    }, {once:true});
  });
  return client;
}

function sendIntent(client, roomCode, type, payload, clientActionId){
  const requestId = `${clientActionId}:request`;
  client.ws.send(JSON.stringify({
    kind:'intent',
    requestId,
    roomCode,
    type,
    payload:{...payload, clientActionId}
  }));
  return requestId;
}

async function expectAccepted(client, requestId, expectedType){
  const message = await waitForMessage(
    client,
    item=>(item.kind === 'accepted' || item.kind === 'rejected') && item.requestId === requestId,
    `${expectedType} accepted or rejected`
  );
  if(message.kind === 'rejected'){
    throw new Error(`${expectedType} rejected: ${message.reason || message.error || JSON.stringify(message).slice(0, 500)}`);
  }
  assert.equal(String(message.action?.type || '').toUpperCase(), expectedType);
  return message;
}

function corpusActionPayload(action){
  const preState = authorityState(action.preState.state);
  const postState = authorityState(action.expectedPostState.state);
  const payload = {
    playerIndex:action.playerIndex,
    turn:preState.turn,
    baseStateHash:canonicalStateHash(preState),
    postState,
    stateHash:canonicalStateHash(postState)
  };
  if(action.command.type === 'LEGACY_SET_CARD'){
    Object.assign(payload, {
      actionKind:'PLACE_CARD',
      z:action.command.destination.zone,
      r:action.command.destination.row,
      c:action.command.destination.column
    });
  }else if(action.command.type === 'LEGACY_CONSOLIDATE_CARD'){
    Object.assign(payload, {
      actionKind:'SELECT_CONSOLIDATION_TRIBUTE',
      tributeIids:action.command.tributeIids,
      z:action.command.destination.zone,
      r:action.command.destination.row,
      c:action.command.destination.column
    });
  }else{
    payload.actionKind = 'END_TURN';
  }
  return payload;
}

function authorityState(state){
  return {...structuredClone(state), v:2};
}

async function replayAction(action, users){
  const created = await fetchJson('/api/rooms', {
    method:'POST',
    idToken:users.host.idToken,
    body:{
      uid:users.host.uid,
      mode:'freeplay',
      profile:profile('Phase 6 Corpus Host'),
      deckChoice:deckChoice('Phase 6 Corpus Host Deck')
    }
  });
  const roomCode = String(created.room?.roomCode || created.room?.code || '');
  assert.match(roomCode, /^[A-Z0-9]{6}$/);
  await fetchJson(`/api/rooms/${encodeURIComponent(roomCode)}/join`, {
    method:'POST',
    idToken:users.guest.idToken,
    body:{
      uid:users.guest.uid,
      profile:profile('Phase 6 Corpus Guest'),
      deckChoice:deckChoice('Phase 6 Corpus Guest Deck')
    }
  });
  const started = await fetchJson(`/api/rooms/${encodeURIComponent(roomCode)}/start`, {
    method:'POST',
    idToken:users.host.idToken,
    body:{
      uid:users.host.uid,
      seed:`${corpus.seed}:remote:${action.index}`,
      song:'board1',
      mode:'freeplay'
    }
  });
  const actor = Number(action.playerIndex) === 0 ? users.host : users.guest;
  const room = {
    ...started.room,
    roomCode,
    canonicalHash:started.accepted?.action?.payload?.stateHash,
    serverStateHash:started.accepted?.action?.payload?.stateHash
  };
  const client = await connectClient(actor, room);
  try{
    const preState = authorityState(action.preState.state);
    const syncId = `${clientActionPrefix}${action.index}:baseline`;
    const syncRequestId = sendIntent(client, roomCode, 'STATE_SYNC', {
      playerIndex:action.playerIndex,
      currentPlayer:preState.currentPlayer,
      turn:preState.turn,
      baseStateHash:room.canonicalHash,
      postState:preState,
      stateHash:canonicalStateHash(preState)
    }, syncId);
    await expectAccepted(client, syncRequestId, 'STATE_SYNC');

    const actionId = `${clientActionPrefix}${action.index}:action`;
    const actionRequestId = sendIntent(
      client,
      roomCode,
      'ACTION_RESULT',
      corpusActionPayload(action),
      actionId
    );
    const accepted = await expectAccepted(client, actionRequestId, 'ACTION_RESULT');
    assert.ok(accepted.action?.payload?.postState, 'accepted corpus action must include authoritative postState');
    assert.ok(accepted.action?.payload?.stateHash, 'accepted corpus action must include authoritative stateHash');
    assert.equal(accepted.action?.clientActionId, actionId);
    return {index:action.index, roomCode, clientActionId:actionId};
  }finally{
    try{ client.ws.close(); }catch(_){}
  }
}

async function run(){
  const health = await fetchJson('/health');
  assert.equal(health.gameplayAuthority, 'client-resolved');
  assert.equal(health.clientResolvedGameplay, true);
  assert.equal(health.firebaseRtdbDisabled, true);
  assert.equal(health.flyDurableStoreReady, true);

  const users = {
    host:await createAnonymousUser('host'),
    guest:await createAnonymousUser('guest')
  };
  const completed = [];
  try{
    let cursor = 0;
    let firstError = null;
    async function worker(){
      while(!firstError){
        const action = actions[cursor];
        cursor += 1;
        if(!action) return;
        try{
          completed.push(await replayAction(action, users));
          if(completed.length === 1 || completed.length % 10 === 0 || completed.length === actions.length){
            console.log(`phase6 remote corpus progress ${completed.length}/${actions.length}`);
          }
        }catch(error){
          firstError = new Error(
            `corpus action ${action.index} failed: ${String(error?.message || error)}`,
            {cause:error}
          );
          return;
        }
        await sleep(10);
      }
    }
    await Promise.all(Array.from({length:Math.min(concurrency, actions.length)}, ()=>worker()));
    if(firstError) throw firstError;
  }finally{
    await Promise.all([deleteAnonymousUser(users.host), deleteAnonymousUser(users.guest)]);
  }
  console.log(JSON.stringify({
    ok:true,
    format:'fates-authority-v3-phase6-remote-corpus-soak-v1',
    origin,
    clientActionPrefix,
    startIndex,
    concurrency,
    requested:actions.length,
    completed:completed.length,
    first:completed[0],
    last:completed.at(-1)
  }, null, 2));
}

await run();
