#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {spawn} = require('child_process');
const path = require('path');
const {canonicalStateHash} = require('./fate-authority-reducer');
const {getCardCatalog} = require('./fate-card-catalog');

const PORT = Number(process.env.FATE_STATE_GATE_SMOKE_PORT || 8811);
const ROOT = path.resolve(__dirname, '..');

function delay(ms){
  return new Promise(resolve=>setTimeout(resolve, ms));
}

async function waitForHealth(){
  for(let i = 0; i < 40; i += 1){
    try{
      const res = await fetch(`http://127.0.0.1:${PORT}/health`);
      if(res.ok) return await res.json();
    }catch(e){}
    await delay(100);
  }
  throw new Error('authority server did not become healthy');
}

function state(overrides){
  return Object.assign({
    v:2,
    players:[
      {name:'Host', color:'', deck:[], hand:[], discard:[]},
      {name:'Guest', color:'', deck:[], hand:[], discard:[]}
    ],
    board:[],
    currentPlayer:0,
    turn:1,
    selectedHandCard:null,
    selectedBoardCard:null,
    placing:false,
    blockingCell:false,
    pendingEffect:null
  }, overrides || {});
}

function validDeck(){
  return getCardCatalog().cards
    .filter(card=>card && !card.retired && !card.temporarilyDisabled)
    .slice(0, 40)
    .map(card=>card.id);
}

async function postJson(url, body){
  const res = await fetch(url, {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(body || {})
  });
  if(!res.ok) throw new Error(`${url} failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

function wsOpen(url){
  return new Promise((resolve, reject)=>{
    const ws = new WebSocket(url);
    ws.addEventListener('open', ()=>resolve(ws), {once:true});
    ws.addEventListener('error', ()=>reject(new Error('websocket open failed')), {once:true});
  });
}

function waitForKind(ws, kind){
  return new Promise((resolve, reject)=>{
    const timer = setTimeout(()=>reject(new Error(`timed out waiting for ${kind}`)), 3000);
    function onMessage(event){
      let msg = null;
      try{ msg = JSON.parse(event.data || '{}'); }catch(e){}
      if(msg && msg.kind === kind){
        clearTimeout(timer);
        ws.removeEventListener('message', onMessage);
        resolve(msg);
      }
    }
    ws.addEventListener('message', onMessage);
  });
}

function stopChild(child){
  return new Promise(resolve=>{
    if(!child || child.killed || child.exitCode !== null) return resolve();
    const timer = setTimeout(resolve, 1000);
    child.once('exit', ()=>{ clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}

async function main(){
  if(typeof WebSocket === 'undefined') throw new Error('This smoke requires a Node runtime with global WebSocket');
  const child = spawn(process.execPath, ['server/fate-ws-authority.js'], {
    cwd:ROOT,
    env:Object.assign({}, process.env, {
      PORT:String(PORT),
      FATE_WS_REQUIRE_TOKEN:'0',
      FATE_WS_DURABLE_WRITES:'off',
      FATE_WS_STATE_GATE:'1',
      FATE_WS_REDUCER_MODE:'turns',
      FATE_WS_FLY_STORE:'0'
    }),
    stdio:['ignore', 'pipe', 'pipe']
  });
  try{
    await waitForHealth();
    const deck = validDeck();
    const created = await postJson(`http://127.0.0.1:${PORT}/api/rooms`, {
      uid:'host',
      mode:'freeplay',
      profile:{displayName:'Host'},
      deckChoice:{name:'Host Deck', deckIds:deck, ready:true}
    });
    const code = created.room.code;
    await postJson(`http://127.0.0.1:${PORT}/api/rooms/${code}/join`, {
      uid:'guest',
      profile:{displayName:'Guest'},
      deckChoice:{name:'Guest Deck', deckIds:deck, ready:true}
    });
    const started = await postJson(`http://127.0.0.1:${PORT}/api/rooms/${code}/start`, {uid:'host', seed:'gate-seed', song:'gate-song'});
    const initialState = started.accepted.action.payload.postState;
    const initialHash = started.accepted.action.payload.stateHash;
    assert(initialState, 'expected server MATCH_START postState');
    assert.strictEqual(canonicalStateHash(initialState), initialHash);

    const ws = await wsOpen(`ws://127.0.0.1:${PORT}`);
    ws.send(JSON.stringify({
      kind:'hello',
      roomCode:code,
      uid:'host',
      idToken:'',
      lastSeq:1,
      stateHash:initialHash,
      room:{hostUid:'host', guestUid:'guest', currentTurnUid:'host', lastActionSeq:1, playerOrder:{0:'host', 1:'guest'}}
    }));
    const hello = await waitForKind(ws, 'hello-ok');
    assert.strictEqual(hello.serverStateHash, initialHash);

    const second = JSON.parse(JSON.stringify(initialState));
    second.currentPlayer = 1;
    second.turn = 2;
    second.selectedHandCard = null;
    second.selectedBoardCard = null;
    second.placing = false;
    second.blockingCell = false;
    second.pendingEffect = null;
    second.pendingInteraction = null;
    const secondHash = canonicalStateHash(second);
    ws.send(JSON.stringify({
      kind:'intent',
      requestId:'legal-end',
      roomCode:code,
      type:'END_TURN',
      payload:{playerIndex:0, turn:1, baseStateHash:initialHash, postState:initialState, stateHash:initialHash}
    }));
    const accepted = await waitForKind(ws, 'accepted');
    assert.strictEqual(accepted.serverStateHash, secondHash);
    assert.strictEqual(accepted.action.payload.serverReduced, true);
    assert.strictEqual(accepted.action.payload.reducerMode, 'turns');
    assert.strictEqual(accepted.action.payload.postState.currentPlayer, 1);

    const third = state({currentPlayer:0, turn:3});
    ws.send(JSON.stringify({
      kind:'intent',
      requestId:'stale-end',
      roomCode:code,
      type:'STATE_SYNC',
      payload:{playerIndex:0, currentPlayer:0, turn:2, baseStateHash:initialHash, postState:third, stateHash:canonicalStateHash(third)}
    }));
    const rejected = await waitForKind(ws, 'rejected');
    assert.match(rejected.reason, /stale baseStateHash/);
    ws.close();
    console.log('fate-authority-state-gate smoke passed');
  }finally{
    await stopChild(child);
  }
}

main().catch(err=>{
  console.error(err);
  process.exit(1);
});
