#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {spawn} = require('child_process');
const path = require('path');
const {canonicalStateHash} = require('./fate-authority-reducer');
const {getCardCatalog} = require('./fate-card-catalog');

const PORT = Number(process.env.FATE_STRICT_REDUCER_SMOKE_PORT || 8812);
const ROOT = path.resolve(__dirname, '..');

function delay(ms){ return new Promise(resolve=>setTimeout(resolve, ms)); }

async function waitForHealth(){
  for(let i = 0; i < 40; i += 1){
    try{
      const res = await fetch(`http://127.0.0.1:${PORT}/health`);
      if(res.ok) return await res.json();
    }catch(e){}
    await delay(100);
  }
  throw new Error('strict authority server did not become healthy');
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

async function createStartedRoom(){
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
  const started = await postJson(`http://127.0.0.1:${PORT}/api/rooms/${code}/start`, {uid:'host', seed:'strict-seed', song:'strict-song'});
  return {code, startPayload:started.accepted.action.payload};
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
      FATE_WS_REDUCER_MODE:'strict',
      FATE_WS_FLY_STORE:'0'
    }),
    stdio:['ignore', 'pipe', 'pipe']
  });
  let ws = null;
  try{
    const health = await waitForHealth();
    assert.strictEqual(health.reducerMode, 'strict');
    const {code, startPayload} = await createStartedRoom();
    const first = startPayload.postState;
    const firstHash = startPayload.stateHash;
    assert(first, 'expected strict server MATCH_START postState');
    assert.strictEqual(canonicalStateHash(first), firstHash);
    ws = await wsOpen(`ws://127.0.0.1:${PORT}`);
    ws.send(JSON.stringify({
      kind:'hello',
      roomCode:code,
      uid:'host',
      idToken:'',
      lastSeq:1,
      stateHash:firstHash,
      room:{hostUid:'host', guestUid:'guest', currentTurnUid:'host', lastActionSeq:1, playerOrder:{0:'host', 1:'guest'}}
    }));
    const hello = await waitForKind(ws, 'hello-ok');
    assert.strictEqual(hello.serverStateHash, firstHash);
    assert.strictEqual(hello.reducerMode, 'strict');

    ws.send(JSON.stringify({
      kind:'intent',
      requestId:'unsupported-click',
      roomCode:code,
      type:'CLICK_CELL',
      payload:{playerIndex:0, turn:1, z:0, r:0, c:0, placing:false, baseStateHash:firstHash}
    }));
    const rejected = await waitForKind(ws, 'rejected');
    assert.match(rejected.reason, /not implemented for non-placement CLICK_CELL/);

    const firstHandCard = first.players?.[0]?.hand?.[0] || {};
    ws.send(JSON.stringify({
      kind:'intent',
      requestId:'strict-place-selected-draw-phase',
      roomCode:code,
      type:'HAND_ACTION',
      payload:{
        fn:'placeSelected',
        playerIndex:0,
        turn:1,
        selectedHand:{index:0, iid:firstHandCard.iid || '', id:firstHandCard.id || ''},
        baseStateHash:firstHash,
        postState:first,
        stateHash:firstHash
      }
    }));
    const placeSelectedRejected = await waitForKind(ws, 'rejected');
    assert.match(placeSelectedRejected.reason, /main phase|dedicated server reducer/);

    ws.send(JSON.stringify({
      kind:'intent',
      requestId:'strict-start-consolidate-draw-phase',
      roomCode:code,
      type:'START_CONSOLIDATE',
      payload:{
        playerIndex:0,
        turn:1,
        selectedHand:{index:0, iid:firstHandCard.iid || '', id:firstHandCard.id || ''},
        baseStateHash:firstHash,
        postState:first,
        stateHash:firstHash
      }
    }));
    const startConsolidateRejected = await waitForKind(ws, 'rejected');
    assert.match(startConsolidateRejected.reason, /main phase|dedicated server reducer|character card/);

    const second = JSON.parse(JSON.stringify(first));
    second.currentPlayer = 1;
    second.turn = 2;
    second.selectedHandCard = null;
    second.selectedBoardCard = null;
    second.placing = false;
    second.blockingCell = false;
    second.pendingEffect = null;
    second.pendingInteraction = null;
    ws.send(JSON.stringify({
      kind:'intent',
      requestId:'strict-end',
      roomCode:code,
      type:'END_TURN',
      payload:{playerIndex:0, turn:1, baseStateHash:firstHash}
    }));
    const accepted = await waitForKind(ws, 'accepted');
    assert.strictEqual(accepted.action.payload.serverReduced, true);
    assert.strictEqual(accepted.serverStateHash, canonicalStateHash(second));
    console.log('fate-authority-strict-reducer smoke passed');
  }finally{
    if(ws) try{ ws.close(); }catch(e){}
    await stopChild(child);
  }
}

main().catch(err=>{
  console.error(err);
  process.exit(1);
});
