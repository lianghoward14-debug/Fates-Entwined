#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {multiplayerEligibleCardIds} from '../../shared/engine/index.mjs';

const require = createRequire(import.meta.url);
const {getCardCatalog} = require('../fate-card-catalog.js');

const ORIGIN = 'https://fates-entwined-main.fly.dev';
const WS_URL = 'wss://fates-entwined-main.fly.dev/v3/beta/socket';
const CLIENT_VERSION = '1.39.95-phase7-beta.1';
const FIREBASE_API_KEY = process.env.FATE_WS_SMOKE_API_KEY || 'AIzaSyByhcqY0Y27hUkvcAtO3mflRwnQCWhv4Yc';
const enabled = process.env.FATE_PHASE7_REMOTE_BETA_SOAK === '1';
const restartPauseMs = Math.max(0, Number(process.env.FATE_PHASE7_RESTART_PAUSE_MS || 0) || 0);
const timeoutMs = Math.max(10_000, Number(process.env.FATE_PHASE7_REMOTE_TIMEOUT_MS || 90_000) || 90_000);

if(!enabled) throw new Error('remote Phase 7 soak requires exact FATE_PHASE7_REMOTE_BETA_SOAK=1 opt-in');
if(typeof WebSocket !== 'function') throw new Error('remote Phase 7 soak requires a Node runtime with WebSocket');

function sleep(ms){
  return new Promise(resolve=>setTimeout(resolve, ms));
}

async function requestJson(url, options = {}){
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(new Error(`timed out requesting ${url}`)), timeoutMs);
  try{
    const response = await fetch(url, {
      method:options.method || 'GET',
      headers:{
        'content-type':'application/json',
        ...(options.idToken ? {authorization:`Bearer ${options.idToken}`} : {}),
        ...(options.phase7 === false ? {} : {'x-fate-client-version':CLIENT_VERSION})
      },
      body:options.body === undefined ? undefined : JSON.stringify(options.body),
      signal:controller.signal
    });
    const text = await response.text();
    let body = null;
    try{ body = text ? JSON.parse(text) : null; }catch(_){ }
    if(options.expectedStatus !== undefined){
      assert.equal(response.status, options.expectedStatus, `${url}: ${text.slice(0, 300)}`);
      return body;
    }
    if(!response.ok || body?.ok === false){
      const detail = body?.error
        ? (typeof body.error === 'string' ? body.error : JSON.stringify(body.error))
        : text.slice(0, 300);
      throw new Error(`${options.method || 'GET'} ${url} failed ${response.status}: ${detail}`);
    }
    return body || {};
  }finally{
    clearTimeout(timer);
  }
}

async function firebase(endpoint, body){
  return requestJson(
    `https://identitytoolkit.googleapis.com/v1/${endpoint}?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    {method:'POST', body, phase7:false}
  );
}

async function anonymous(label){
  const result = await firebase('accounts:signUp', {returnSecureToken:true});
  assert(result.localId && result.idToken, `Firebase anonymous ${label} identity is incomplete`);
  return {label, uid:String(result.localId), idToken:String(result.idToken)};
}

async function removeIdentity(user){
  if(!user?.idToken) return;
  try{ await firebase('accounts:delete', {idToken:user.idToken}); }catch(_){ }
}

function betaDeck(){
  const catalog = getCardCatalog();
  const ids = multiplayerEligibleCardIds().filter(id=>catalog.byId.has(String(id))).map(String);
  assert(ids.length >= 40, 'eligible Phase 7 card inventory must contain at least 40 cards');
  return ids.slice(0, 40);
}

function waitFor(client, predicate, label, waitMs = timeoutMs){
  const existing = client.messages.find(predicate);
  if(existing) return Promise.resolve(existing);
  return new Promise((resolve, reject)=>{
    const timer = setTimeout(()=>{
      client.listeners.delete(onMessage);
      reject(new Error(`timed out waiting for ${label}`));
    }, waitMs);
    function onMessage(message){
      if(!predicate(message)) return;
      clearTimeout(timer);
      client.listeners.delete(onMessage);
      resolve(message);
    }
    client.listeners.add(onMessage);
  });
}

async function connect(credential){
  const client = {credential, ws:null, messages:[], listeners:new Set(), snapshot:null};
  let lastError = null;
  const deadline = Date.now() + timeoutMs;
  while(Date.now() < deadline){
    try{
      client.messages.length = 0;
      const ws = new WebSocket(WS_URL);
      client.ws = ws;
      ws.addEventListener('message', event=>{
        const message = JSON.parse(String(event.data || '{}'));
        client.messages.push(message);
        if(message.kind === 'snapshot' || message.kind === 'accepted' || message.kind === 'rejected'){
          client.snapshot = message;
        }
        client.listeners.forEach(listener=>listener(message));
      });
      await new Promise((resolve, reject)=>{
        const timer = setTimeout(()=>reject(new Error('WebSocket open timed out')), 20_000);
        ws.addEventListener('open', ()=>{
          clearTimeout(timer);
          ws.send(JSON.stringify({
            kind:'hello',
            protocolVersion:3,
            clientVersion:CLIENT_VERSION,
            matchId:credential.matchId,
            playerId:credential.playerId,
            token:credential.token
          }));
          resolve();
        }, {once:true});
        ws.addEventListener('error', ()=>{
          clearTimeout(timer);
          reject(new Error('WebSocket connection error'));
        }, {once:true});
      });
      await waitFor(client, message=>message.kind === 'hello-ok', 'hello-ok', 20_000);
      const snapshot = await waitFor(client, message=>message.kind === 'snapshot', 'private snapshot', 20_000);
      client.snapshot = snapshot;
      return client;
    }catch(error){
      lastError = error;
      try{ client.ws?.close(); }catch(_){ }
      await sleep(1000);
    }
  }
  throw lastError || new Error('Phase 7 connection timed out');
}

async function issue(client, template){
  assert(template?.type, 'a server-issued legal command template is required');
  const revision = Number(client.snapshot?.revision || 0);
  const commandId = `${client.credential.playerId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  client.ws.send(JSON.stringify({
    kind:'command',
    protocolVersion:3,
    command:{
      commandId,
      matchId:client.credential.matchId,
      expectedRevision:revision,
      type:template.type,
      payload:template.payload || {}
    }
  }));
  const response = await waitFor(
    client,
    message=>message.commandId === commandId && (message.kind === 'accepted' || message.kind === 'rejected'),
    `${template.type} acknowledgement`
  );
  if(response.kind === 'rejected'){
    throw new Error(`${template.type} rejected: ${response.rejection?.reason || JSON.stringify(response.rejection)}`);
  }
  client.snapshot = response;
  return response;
}

function bySeat(clients, seat){
  return clients.find(client=>Number(client.credential.playerIndex) === Number(seat));
}

async function settlePrompts(clients){
  for(let count = 0; count < 24; count += 1){
    const source = clients.find(client=>client.snapshot?.state?.pendingPrompt || client.snapshot?.state?.pendingHandLimit);
    if(!source) return;
    const promptOwner = Number(source.snapshot.state.pendingPrompt?.playerIndex
      ?? source.snapshot.state.pendingHandLimit?.playerIndex);
    const actor = bySeat(clients, promptOwner);
    const template = actor?.snapshot?.legalCommands?.find(command=>
      command.type === 'ANSWER_PROMPT' || command.type === 'DISCARD_TO_HAND_LIMIT'
    );
    if(!actor || !template) throw new Error('server prompt has no matching private legal command');
    await issue(actor, template);
    await sleep(25);
  }
  throw new Error('prompt settlement exceeded safety bound');
}

const users = [];
let clients = [];
try{
  const health = await requestJson(`${ORIGIN}/health`);
  assert.equal(health.phase7Beta, true);
  assert.equal(health.testMatches, false);
  assert.equal(health.requiredClientVersion, CLIENT_VERSION);
  assert.match(String(health.buildId || ''), /^phase7-[a-f0-9]{64}$/);
  await requestJson(`${ORIGIN}/v3/matches`, {method:'POST', body:{}, expectedStatus:404});
  await requestJson(`${ORIGIN}/v3/beta/matches`, {
    method:'POST', body:{mode:'unranked'}, expectedStatus:404
  });

  users.push(await anonymous('player-0'), await anonymous('player-1'));
  const deckIds = betaDeck();
  const enter = user=>requestJson(`${ORIGIN}/v3/beta/matchmaking/enter`, {
    method:'POST',
    idToken:user.idToken,
    body:{deckIds, name:`Phase 7 ${user.label}`, landscapeId:'igb1'}
  });
  const first = await enter(users[0]);
  assert.equal(first.status, 'waiting');
  const second = await enter(users[1]);
  assert.equal(second.status, 'matched');
  const firstStatus = await requestJson(`${ORIGIN}/v3/beta/matchmaking/status`, {idToken:users[0].idToken});
  assert.equal(firstStatus.status, 'matched');
  assert.equal(firstStatus.credential.matchId, second.credential.matchId);
  assert.notEqual(firstStatus.credential.token, second.credential.token);

  clients = [await connect(firstStatus.credential), await connect(second.credential)];
  for(const client of clients){
    const opponent = client.snapshot.state.players[Number(client.credential.playerIndex) === 0 ? 1 : 0];
    assert.equal(opponent.hand, undefined, 'opponent private hand leaked');
    assert(Number(opponent.handCount) >= 0);
    assert(Array.isArray(client.snapshot.legalCommands));
  }
  assert.equal(clients[0].snapshot.state.phase, 'coin');
  const coinWinner = Number(clients[0].snapshot.state.coinFlip?.winner);
  const coinActor = bySeat(clients, coinWinner);
  const chooseTurn = coinActor?.snapshot?.legalCommands?.find(command=>
    command.type === 'CHOOSE_TURN_ORDER' && command.payload?.goFirst === true
  );
  assert(coinActor && chooseTurn, 'coin winner has no authoritative turn-order choice');
  const turnChoice = await issue(coinActor, chooseTurn);
  assert.equal(turnChoice.state.phase, 'main');
  assert.equal(turnChoice.state.activePlayer, coinWinner);
  await sleep(25);

  let actor = bySeat(clients, clients[0].snapshot.state.activePlayer);
  const setCard = actor.snapshot.legalCommands.find(command=>command.type === 'SET_CARD');
  assert(setCard, 'active player has no legal SET_CARD command');
  const placement = await issue(actor, setCard);
  await settlePrompts(clients);

  actor = bySeat(clients, actor.snapshot.state.activePlayer);
  let endTurn = actor.snapshot.legalCommands.find(command=>command.type === 'END_TURN');
  if(!endTurn){
    const anotherSet = actor.snapshot.legalCommands.find(command=>command.type === 'SET_CARD');
    if(anotherSet) await issue(actor, anotherSet);
    await settlePrompts(clients);
    endTurn = actor.snapshot.legalCommands.find(command=>command.type === 'END_TURN');
  }
  assert(endTurn, 'active player has no legal END_TURN command');
  const turnEnd = await issue(actor, endTurn);
  const durableRevision = turnEnd.revision;
  const durableHash = turnEnd.stateHash;

  for(const client of clients) client.ws.close();
  clients = [];
  if(restartPauseMs){
    process.stdout.write(`PHASE7_READY_FOR_RESTART ${second.credential.matchId} ${durableRevision} ${durableHash}\n`);
    await sleep(restartPauseMs);
  }

  clients = [await connect(firstStatus.credential), await connect(second.credential)];
  for(const client of clients){
    assert.equal(client.snapshot.revision, durableRevision, 'restart/reconnect revision drift');
    assert.equal(client.snapshot.stateHash, durableHash, 'restart/reconnect hash drift');
  }
  const recoveredRevision = clients[0].snapshot.revision;
  const recoveredHash = clients[0].snapshot.stateHash;
  actor = bySeat(clients, clients[0].snapshot.state.activePlayer);
  const concede = actor.snapshot.legalCommands.find(command=>command.type === 'CONCEDE');
  assert(concede, 'active player has no legal CONCEDE command');
  const completed = await issue(actor, concede);
  assert(completed.state.outcome, 'concession did not complete the beta match');

  process.stdout.write(`${JSON.stringify({
    ok:true,
    app:'fates-entwined-v3-unranked-beta',
    buildId:health.buildId,
    clientVersion:CLIENT_VERSION,
    matchId:second.credential.matchId,
    twoAuthenticatedClients:true,
    separatePlayerCredentials:true,
    commandOnly:true,
    hiddenOpponentHands:true,
    placementRevision:placement.revision,
    turnEndRevision:durableRevision,
    recoveredRevision,
    recoveredHash,
    completedRevision:completed.revision,
    completedOutcome:completed.state.outcome,
    restartPauseMs,
    legacyFallback:false
  }, null, 2)}\n`);
}finally{
  for(const client of clients){ try{ client.ws?.close(); }catch(_){ } }
  await Promise.all(users.map(removeIdentity));
}
