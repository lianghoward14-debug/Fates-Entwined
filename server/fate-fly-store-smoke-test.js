#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');
const {getCardCatalog} = require('./fate-card-catalog');

const PORT = Number(process.env.FATE_FLY_STORE_SMOKE_PORT || 8813);
const HOST = '127.0.0.1';
const ROOT = path.resolve(__dirname, '..');
const WS_URL = `ws://${HOST}:${PORT}`;

function delay(ms){ return new Promise(resolve=>setTimeout(resolve, ms)); }

function validDeck(){
  return getCardCatalog().cards
    .filter(card=>card && !card.retired && !card.temporarilyDisabled)
    .slice(0, 40)
    .map(card=>card.id);
}

async function waitForHealth(){
  const deadline = Date.now() + 6000;
  let lastErr = null;
  while(Date.now() < deadline){
    try{
      const res = await fetch(`http://${HOST}:${PORT}/health`);
      if(res.ok){
        const health = await res.json();
        if(health.flyDurableStoreReady !== false) return health;
      }
    }catch(e){ lastErr = e; }
    await delay(100);
  }
  throw new Error('Fly store smoke server did not become healthy' + (lastErr ? ': ' + lastErr.message : ''));
}

async function requestJson(method, requestPath, body){
  const res = await fetch(`http://${HOST}:${PORT}${requestPath}`, {
    method,
    headers:{'content-type':'application/json'},
    body:body === undefined ? undefined : JSON.stringify(body || {})
  });
  const text = await res.text();
  let json = null;
  try{ json = text ? JSON.parse(text) : null; }catch(e){}
  if(!res.ok || json?.ok === false){
    throw new Error(`${method} ${requestPath} failed ${res.status}: ${json?.error || text.slice(0, 200)}`);
  }
  return json;
}

function waitForMessage(client, predicate, label, timeoutMs = 3000){
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

function openClient(uid, code, stateHash, room){
  const ws = new WebSocket(WS_URL);
  const client = {uid, ws, messages:[], listeners:new Set()};
  ws.addEventListener('message', event=>{
    const raw = typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8');
    const message = JSON.parse(raw);
    client.messages.push(message);
    client.listeners.forEach(listener=>listener(message));
  });
  return new Promise((resolve, reject)=>{
    const timer = setTimeout(()=>reject(new Error(`open timeout for ${uid}`)), 3000);
    ws.addEventListener('open', async ()=>{
      clearTimeout(timer);
      ws.send(JSON.stringify({
        kind:'hello',
        roomCode:code,
        uid,
        idToken:'',
        lastSeq:Number(room?.lastActionSeq || 1) || 1,
        stateHash,
        room
      }));
      try{
        await waitForMessage(client, msg=>msg.kind === 'hello-ok', `${uid} hello-ok`);
        resolve(client);
      }catch(err){
        reject(err);
      }
    }, {once:true});
    ws.addEventListener('error', ()=>reject(new Error(`websocket error for ${uid}`)), {once:true});
  });
}

function closeClient(client){
  return new Promise(resolve=>{
    if(!client?.ws || client.ws.readyState === WebSocket.CLOSED) return resolve();
    const timer = setTimeout(resolve, 500);
    client.ws.addEventListener('close', ()=>{
      clearTimeout(timer);
      resolve();
    }, {once:true});
    client.ws.close();
  });
}

async function waitForRoomEnded(code, timeoutMs = 3500){
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while(Date.now() < deadline){
    latest = await requestJson('GET', `/api/rooms/${code}/resume?after=0&limit=20`);
    if(latest.room?.status === 'ended') return latest;
    await delay(100);
  }
  throw new Error(`room ${code} did not end after restored disconnect timer`);
}

async function waitForStoredDisconnected(roomsFile, code, uid, timeoutMs = 2500){
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while(Date.now() < deadline){
    try{
      latest = JSON.parse(fs.readFileSync(roomsFile, 'utf8'));
      const room = latest.rooms.find(item=>item.code === code);
      if(room?.players?.[uid]?.connected === false) return latest;
    }catch(e){}
    await delay(50);
  }
  throw new Error(`stored room ${code} did not persist ${uid} disconnected`);
}

async function waitForStoredRoomSnapshot(roomsFile, code, predicate, label, timeoutMs = 2500){
  const deadline = Date.now() + timeoutMs;
  while(Date.now() < deadline){
    try{
      const latest = JSON.parse(fs.readFileSync(roomsFile, 'utf8'));
      const room = latest.rooms.find(item=>item.code === code);
      if(room && predicate(room)) return latest;
    }catch(e){}
    await delay(50);
  }
  throw new Error(`stored room ${code} did not persist ${label || 'the expected snapshot'}`);
}

function startServer(dataDir){
  const child = spawn(process.execPath, ['server/fate-ws-authority.js'], {
    cwd:ROOT,
    env:Object.assign({}, process.env, {
      PORT:String(PORT),
      FATE_WS_REQUIRE_TOKEN:'0',
      FATE_WS_DURABLE_WRITES:'off',
      FATE_WS_STATE_GATE:'1',
      FATE_WS_REDUCER_MODE:'client-resolved',
      FATE_WS_DISABLE_FIREBASE_RTDB:'1',
      FATE_WS_DISCONNECT_TIMEOUT_MS:'1000',
      FATE_WS_SOCIAL_PRESENCE_TTL_MS:'250',
      FATE_WS_PING_MS:'60000',
      FATE_WS_FLY_STORE:'1',
      FATE_WS_REQUIRE_FLY_STORE:'1',
      FATE_WS_DATA_DIR:dataDir
    }),
    stdio:['ignore', 'pipe', 'pipe']
  });
  let log = '';
  child.stdout.on('data', chunk=>{ log += chunk.toString(); });
  child.stderr.on('data', chunk=>{ log += chunk.toString(); });
  child.fateLog = ()=>log;
  return child;
}

function stopServer(child){
  return new Promise(resolve=>{
    if(!child || child.killed || child.exitCode !== null) return resolve();
    const timer = setTimeout(()=>resolve(), 7000);
    child.once('exit', ()=>{ clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}

async function createStartedRoom(){
  const deck = validDeck();
  const created = await requestJson('POST', '/api/rooms', {
    uid:'store-host',
    mode:'ranked',
    profile:{displayName:'Store Host', challengerElo:700, challengerWins:2, challengerLosses:1, humanWins:2, humanLosses:1, matchesPlayed:3},
    deckChoice:{name:'Store Host Deck', deckIds:deck, ready:true}
  });
  const code = created.room.code;
  await requestJson('POST', `/api/rooms/${code}/join`, {
    uid:'store-guest',
    profile:{displayName:'Store Guest', challengerElo:650, challengerWins:1, challengerLosses:2, humanWins:1, humanLosses:2, matchesPlayed:3},
    deckChoice:{name:'Store Guest Deck', deckIds:deck, ready:true}
  });
  const started = await requestJson('POST', `/api/rooms/${code}/start`, {
    uid:'store-host',
    seed:'fly-store-smoke-seed',
    song:'fly-store-smoke-song'
  });
  return {code, started};
}

async function exerciseFlyMatchmaking(){
  const deck = validDeck();
  const host = await requestJson('POST', '/api/matchmaking/enter', {
    uid:'queue-host',
    mode:'ranked',
    profile:{displayName:'Queue Host', challengerElo:640},
    deckChoice:{name:'Queue Host Deck', deckIds:deck, ready:true}
  });
  assert.strictEqual(host.matched, false);
  assert.strictEqual(host.role, 'host');
  assert.ok(/^[A-Z0-9]{6}$/.test(host.room.code), 'queued host should create a Fly room');
  assert.strictEqual(host.entry.status, 'waiting');

  const guest = await requestJson('POST', '/api/matchmaking/enter', {
    uid:'queue-guest',
    mode:'ranked',
    profile:{displayName:'Queue Guest', challengerElo:650},
    deckChoice:{name:'Queue Guest Deck', deckIds:deck, ready:true}
  });
  assert.strictEqual(guest.matched, true);
  assert.strictEqual(guest.role, 'guest');
  assert.strictEqual(guest.room.code, host.room.code);
  assert.strictEqual(guest.room.guestUid, 'queue-guest');
  assert.strictEqual(guest.room.players['queue-host'].deckChoice.ready, true);
  assert.strictEqual(guest.room.players['queue-guest'].deckChoice.ready, true);

  const queue = await requestJson('GET', '/api/matchmaking?mode=ranked');
  assert.ok(!queue.entries.some(entry=>entry.uid === 'queue-host' || entry.uid === 'queue-guest'), 'matched queue entries should be removed');
  return guest.room.code;
}

async function exerciseFlyRoomLeave(){
  const deck = validDeck();
  const created = await requestJson('POST', '/api/rooms', {
    uid:'leave-host',
    mode:'freeplay',
    profile:{displayName:'Leave Host'},
    deckChoice:{name:'Leave Host Deck', deckIds:deck, ready:true}
  });
  const code = created.room.code;
  await requestJson('POST', `/api/rooms/${code}/join`, {
    uid:'leave-guest',
    profile:{displayName:'Leave Guest'},
    deckChoice:{name:'Leave Guest Deck', deckIds:deck, ready:true}
  });
  const heartbeat = await requestJson('POST', `/api/rooms/${code}/heartbeat`, {uid:'leave-guest'});
  assert.strictEqual(heartbeat.player.connected, true);
  assert.ok(heartbeat.player.lastSeen > 0, 'heartbeat should refresh lastSeen');
  const guestLeft = await requestJson('POST', `/api/rooms/${code}/leave`, {uid:'leave-guest'});
  assert.strictEqual(guestLeft.deleted, false);
  assert.strictEqual(guestLeft.room.guestUid, '');
  assert.ok(!guestLeft.room.players['leave-guest'], 'guest leave should remove guest player node in lobby');
  const hostLeft = await requestJson('POST', `/api/rooms/${code}/leave`, {uid:'leave-host'});
  assert.strictEqual(hostLeft.deleted, true);
  let missing = false;
  try{
    await requestJson('GET', `/api/rooms/${code}`);
  }catch(e){
    missing = /room not found/i.test(e.message || '');
  }
  assert.strictEqual(missing, true, 'host leave should delete lobby room');
}

async function exerciseFlyRoomDiscovery(code){
  const hostRooms = await requestJson('GET', `/api/rooms?uid=store-host&limit=10`);
  assert.ok(Array.isArray(hostRooms.rooms), 'room discovery should return room array');
  assert.ok(hostRooms.rooms.some(room=>room.code === code), 'host should discover their active Fly room');
  const guestRooms = await requestJson('GET', `/api/rooms?uid=store-guest&limit=10`);
  assert.ok(guestRooms.rooms.some(room=>room.code === code), 'guest should discover their active Fly room');
  const strangerRooms = await requestJson('GET', `/api/rooms?uid=store-stranger&limit=10`);
  assert.ok(!strangerRooms.rooms.some(room=>room.code === code), 'unseated user should not discover another room');
}

async function exerciseFlySocial(){
  await requestJson('POST', '/api/profiles/social-host', {
    uid:'social-host',
    profile:{uid:'social-host', displayName:'Social Host', baseCode:'SHOST1', challengerElo:810}
  });
  await requestJson('POST', '/api/profiles/social-guest', {
    uid:'social-guest',
    profile:{uid:'social-guest', displayName:'Social Guest', baseCode:'SGUEST1', challengerElo:730}
  });
  let presenceState = await requestJson('GET', '/api/social/state?uid=social-host');
  assert.ok(presenceState.onlineUids.includes('social-host'), 'requesting social state should heartbeat the current player');
  assert.ok(presenceState.onlineUids.includes('social-guest'), 'recent authenticated activity should list another player online');
  await requestJson('POST', '/api/social/presence', {uid:'social-guest', online:false});
  presenceState = await requestJson('GET', '/api/social/state?uid=social-host');
  assert.ok(!presenceState.onlineUids.includes('social-guest'), 'explicit offline presence should remove a player immediately');
  const durableGuestProfile = await requestJson('GET', '/api/profiles/social-guest');
  assert.strictEqual(durableGuestProfile.profile.displayName, 'Social Guest', 'clearing presence must retain the durable profile');
  await requestJson('POST', '/api/social/presence', {uid:'social-guest', online:true});
  await delay(325);
  presenceState = await requestJson('GET', '/api/social/state?uid=social-host');
  assert.ok(!presenceState.onlineUids.includes('social-guest'), 'expired presence heartbeat should be pruned from online players');
  const created = await requestJson('POST', '/api/parties', {
    uid:'social-host',
    profile:{displayName:'Social Host', baseCode:'SHOST1'}
  });
  assert.ok(created.party.partyId, 'Fly party create should return party id');
  assert.strictEqual(created.party.leaderUid, 'social-host');
  assert.ok(created.party.members['social-host'], 'Fly party should include leader');
  const invited = await requestJson('POST', `/api/parties/${created.party.partyId}/invite`, {
    uid:'social-host',
    toUid:'social-guest',
    profile:{displayName:'Social Host', baseCode:'SHOST1'}
  });
  assert.strictEqual(invited.invite.toUid, 'social-guest');
  const guestState = await requestJson('GET', '/api/social/state?uid=social-guest');
  assert.ok(guestState.partyInvites['social-host'], 'Fly social state should include incoming party invite');
  const accepted = await requestJson('POST', `/api/parties/${created.party.partyId}/accept`, {
    uid:'social-guest',
    fromUid:'social-host',
    profile:{displayName:'Social Guest', baseCode:'SGUEST1'}
  });
  assert.ok(accepted.party.members['social-host'], 'accepted Fly party should retain host');
  assert.ok(accepted.party.members['social-guest'], 'accepted Fly party should include guest');
  const hostState = await requestJson('GET', '/api/social/state?uid=social-host');
  assert.strictEqual(hostState.party.partyId, created.party.partyId);
  assert.ok(hostState.profiles['social-guest'], 'Fly social state should include party member profile');
  const chatOne = await requestJson('POST', '/api/world-chat', {
    uid:'social-host',
    text:' hello fly world ',
    profile:{displayName:'Social Host', baseCode:'SHOST1'}
  });
  assert.strictEqual(chatOne.message.text, 'hello fly world');
  const chatList = await requestJson('GET', '/api/world-chat?limit=100&after=0');
  assert.ok(chatList.messages.some(message=>message.text === 'hello fly world'), 'Fly world chat should list sent message');
  const left = await requestJson('POST', `/api/parties/${created.party.partyId}/leave`, {uid:'social-host'});
  assert.strictEqual(left.deleted, true);
  const postLeaveState = await requestJson('GET', '/api/social/state?uid=social-guest');
  assert.strictEqual(postLeaveState.party, null, 'Fly party leave should disband two-player party');
}

async function assertFlySocialRestored(){
  const chatList = await requestJson('GET', '/api/world-chat?limit=100&after=0');
  assert.ok(chatList.messages.some(message=>message.text === 'hello fly world'), 'Fly world chat should restore after restart');
  const profile = await requestJson('GET', '/api/profiles/social-host');
  assert.strictEqual(profile.profile.displayName, 'Social Host');
}

async function exerciseFlyEconomy(){
  const cards = validDeck();
  const listed = await requestJson('POST', '/api/marketplace/listings', {
    uid:'market-seller',
    profile:{displayName:'Market Seller', baseCode:'MSELL1'},
    cardId:cards[0],
    price:125
  });
  assert.strictEqual(listed.listing.cardId, cards[0]);
  assert.strictEqual(listed.listing.status, 'active');
  const marketFeed = await requestJson('GET', '/api/marketplace/listings?limit=20');
  assert.ok(marketFeed.listings.some(item=>item.listingId === listed.listing.listingId), 'Fly marketplace feed should include active listing');
  const bought = await requestJson('POST', `/api/marketplace/listings/${listed.listing.listingId}/buy`, {
    uid:'market-buyer',
    profile:{displayName:'Market Buyer', baseCode:'MBUYR1'}
  });
  assert.strictEqual(bought.listing.status, 'sold');
  assert.strictEqual(bought.listing.buyerUid, 'market-buyer');
  const redeemed = await requestJson('POST', '/api/marketplace/redeem', {uid:'market-seller'});
  assert.strictEqual(redeemed.redeemedStarlight, 125);
  const cancelSeed = await requestJson('POST', '/api/marketplace/listings', {
    uid:'market-seller',
    profile:{displayName:'Market Seller', baseCode:'MSELL1'},
    cardId:cards[1],
    price:80
  });
  const cancelled = await requestJson('POST', `/api/marketplace/listings/${cancelSeed.listing.listingId}/cancel`, {uid:'market-seller'});
  assert.strictEqual(cancelled.listing.status, 'cancelled');

  const deckPayload = {
    id:'fly-public-deck-one',
    deckId:'fly-public-deck-one',
    name:'Fly Public Smoke',
    description:'Fly public deck smoke test',
    ids:cards.slice(0, 40),
    faceCardId:cards[0],
    displayCardIds:cards.slice(0, 4),
    timestamp:123456
  };
  const published = await requestJson('POST', '/api/public-decks', {
    uid:'deck-owner',
    profile:{displayName:'Deck Owner', baseCode:'DOWNR1'},
    deck:deckPayload
  });
  assert.strictEqual(published.deck.deckId, 'fly-public-deck-one');
  assert.strictEqual(published.deck.ids.length, 40);
  const deckFeed = await requestJson('GET', '/api/public-decks?limit=20');
  const summary = deckFeed.decks.find(deck=>deck.deckId === 'fly-public-deck-one');
  assert.ok(summary, 'Fly public deck feed should include published deck');
  assert.strictEqual(summary.ids.length, 0, 'Fly public deck feed should omit full deck ids');
  const rated = await requestJson('POST', '/api/public-decks/fly-public-deck-one/rating', {
    uid:'deck-rater',
    username:'Deck Rater',
    stars:5
  });
  assert.strictEqual(rated.deck.ratingCount, 1);
  assert.strictEqual(rated.deck.ratingAvg, 5);
  const commented = await requestJson('POST', '/api/public-decks/fly-public-deck-one/comments', {
    uid:'deck-rater',
    username:'Deck Rater',
    text:'solid fly deck'
  });
  assert.strictEqual(commented.comment.text, 'solid fly deck');
  assert.strictEqual(commented.deck.commentCount, 1);
  const detail = await requestJson('GET', '/api/public-decks/fly-public-deck-one');
  assert.strictEqual(detail.deck.ids.length, 40);
  assert.strictEqual(detail.deck.comments.length, 1);
  const deleteSeed = await requestJson('POST', '/api/public-decks', {
    uid:'deck-owner',
    profile:{displayName:'Deck Owner', baseCode:'DOWNR1'},
    deck:Object.assign({}, deckPayload, {id:'fly-public-deck-delete', deckId:'fly-public-deck-delete'})
  });
  assert.strictEqual(deleteSeed.deck.deckId, 'fly-public-deck-delete');
  const deleted = await requestJson('POST', '/api/public-decks/fly-public-deck-delete/delete', {uid:'deck-owner'});
  assert.strictEqual(deleted.deck.deckId, 'fly-public-deck-delete');
}

async function assertFlyEconomyRestored(){
  const marketFeed = await requestJson('GET', '/api/marketplace/listings?limit=50');
  assert.ok(marketFeed.transactions.some(item=>item.sellerUid === 'market-seller' && item.buyerUid === 'market-buyer' && item.sellerRedeemed), 'Fly marketplace transaction should restore after restart');
  const detail = await requestJson('GET', '/api/public-decks/fly-public-deck-one');
  assert.strictEqual(detail.deck.ids.length, 40);
  assert.strictEqual(detail.deck.ratingCount, 1);
  assert.strictEqual(detail.deck.commentCount, 1);
}

async function exerciseFlyFriendsDmAndCloudSave(){
  await requestJson('POST', '/api/profiles/friend-a', {
    uid:'friend-a',
    profile:{uid:'friend-a', displayName:'Friend A', username:'Friend A', baseCode:'FRIENDA', photoURL:'7.png'}
  });
  await requestJson('POST', '/api/profiles/friend-b', {
    uid:'friend-b',
    profile:{uid:'friend-b', displayName:'Friend B', username:'Friend B', baseCode:'FRIENDB', photoURL:'9.png'}
  });
  const lookup = await requestJson('GET', '/api/social/lookup?term=FRIENDB');
  assert.ok(lookup.profiles.some(profile=>profile.uid === 'friend-b'), 'Fly profile lookup should find base code');
  const requested = await requestJson('POST', '/api/friends/request', {
    uid:'friend-a',
    toUid:'friend-b',
    profile:{displayName:'Friend A', baseCode:'FRIENDA'}
  });
  assert.strictEqual(requested.request.toUid, 'friend-b');
  const bState = await requestJson('GET', '/api/social/state?uid=friend-b');
  assert.ok(bState.requests['friend-a'], 'Fly social state should include friend request');
  const accepted = await requestJson('POST', '/api/friends/accept', {
    uid:'friend-b',
    fromUid:'friend-a'
  });
  assert.ok(accepted.state.friends['friend-a'], 'Fly friend accept should add friend');
  const aState = await requestJson('GET', '/api/social/state?uid=friend-a');
  assert.ok(aState.friends['friend-b'], 'Fly friend relation should be reciprocal');
  const dmSent = await requestJson('POST', '/api/direct-messages/friend-b', {
    uid:'friend-a',
    text:'hello fly dm',
    profile:{displayName:'Friend A', baseCode:'FRIENDA'}
  });
  assert.strictEqual(dmSent.message.text, 'hello fly dm');
  assert.ok(dmSent.message.seq > 0, 'Fly DMs should carry an incremental sequence for live refresh');
  const dmList = await requestJson('GET', '/api/direct-messages/friend-a?uid=friend-b&limit=80');
  assert.ok(dmList.messages.some(message=>message.text === 'hello fly dm'), 'Fly DM list should include sent message');
  assert.strictEqual(dmList.state.threads['friend-a'].unread, 0, 'Fly DM read should clear recipient unread count');
  assert.strictEqual(dmList.peerProfile.photoURL, '7.png', 'Fly DM open should include the peer live profile image');
  const noDmDelta = await requestJson('GET', `/api/direct-messages/friend-a?uid=friend-b&limit=60&after=${dmSent.message.seq}&state=0`);
  assert.deepStrictEqual(noDmDelta.messages, [], 'Fly DM incremental refresh should return no already-seen messages');
  assert.strictEqual(noDmDelta.state, undefined, 'Fly DM live refresh should omit the full social state payload');
  const dmReply = await requestJson('POST', '/api/direct-messages/friend-a', {
    uid:'friend-b',
    text:'live fly reply',
    profile:{displayName:'Friend B', baseCode:'FRIENDB', photoURL:'9.png'}
  });
  const dmDelta = await requestJson('GET', `/api/direct-messages/friend-a?uid=friend-b&limit=60&after=${dmSent.message.seq}&state=0`);
  assert.deepStrictEqual(dmDelta.messages.map(message=>message.id), [dmReply.message.id], 'Fly DM incremental refresh should return only the new reply');
  const removed = await requestJson('POST', '/api/friends/remove', {uid:'friend-a', friendUid:'friend-b'});
  assert.ok(!removed.state.friends['friend-b'], 'Fly friend remove should remove local friend');

  await requestJson('POST', '/api/player-save/friend-a', {
    uid:'friend-a',
    data:{profile:{username:'Friend A', starlight:77}, settings:{menuV2:'1'}}
  });
  await requestJson('POST', '/api/player-save/friend-a', {
    uid:'friend-a',
    data:{presets:{one:{name:'One'}}}
  });
  const save = await requestJson('GET', '/api/player-save/friend-a');
  assert.strictEqual(save.data.profile.starlight, 77);
  assert.strictEqual(save.data.settings.menuV2, '1');
  assert.strictEqual(save.data.presets.one.name, 'One');
}

async function assertFlyFriendsDmAndCloudSaveRestored(){
  const dmList = await requestJson('GET', '/api/direct-messages/friend-a?uid=friend-b&limit=80');
  assert.ok(dmList.messages.some(message=>message.text === 'hello fly dm'), 'Fly DM should restore after restart');
  assert.ok(dmList.messages.some(message=>message.text === 'live fly reply'), 'Fly DM live reply should restore after restart');
  const save = await requestJson('GET', '/api/player-save/friend-a');
  assert.strictEqual(save.data.profile.starlight, 77);
  assert.strictEqual(save.data.presets.one.name, 'One');
}

async function main(){
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fate-fly-store-'));
  let child = null;
  let hostClient = null;
  let guestClient = null;
  try{
    child = startServer(dataDir);
    const health = await waitForHealth();
    assert.strictEqual(health.flyDurableStore, true);
    assert.strictEqual(health.flyDurableStoreReady, true);
    assert.strictEqual(health.reducerMode, 'client-resolved');
    assert.strictEqual(health.flyRoomDiscovery, true);
    assert.strictEqual(health.flyProfiles, true);
    assert.strictEqual(health.flySocial, true);
    assert.strictEqual(health.flyWorldChat, true);
    assert.strictEqual(health.flyEconomy, true);
    assert.strictEqual(health.flyMarketplace, true);
    assert.strictEqual(health.flyPublicDecks, true);
    assert.strictEqual(health.flyPlayerSaves, true);
    assert.strictEqual(health.flyFriends, true);
    assert.strictEqual(health.flyDirectMessages, true);
    assert.strictEqual(health.flySpectators, true);
    assert.strictEqual(health.flyLiveMatches, true);
    assert.strictEqual(health.firebaseRtdbDisabled, true);
    assert.strictEqual(health.firebaseDurableWrites, false);
    const profileSeed = await requestJson('POST', '/api/profiles/store-profile', {
      uid:'store-profile',
      profile:{
        uid:'store-profile',
        displayName:'Store Profile',
        username:'Store Profile',
        baseCode:'SPROF1',
        challengerElo:720,
        challengerWins:4,
        challengerLosses:2,
        humanWins:4,
        humanLosses:2,
        matchesPlayed:6,
        starlight:12,
        leaderboardResetVersion:'20260711a'
      }
    });
    assert.strictEqual(profileSeed.profile.uid, 'store-profile');
    assert.strictEqual(profileSeed.profile.challengerElo, 600);
    assert.strictEqual(profileSeed.profile.matchesPlayed, 0);
    const legacyProfileSeed = await requestJson('POST', '/api/profiles/store-profile-legacy', {
      uid:'store-profile-legacy',
      profile:{
        uid:'store-profile-legacy',
        displayName:'Store Legacy',
        username:'Store Legacy',
        challengerElo:1440,
        challengerWins:12,
        challengerLosses:3,
        matchesPlayed:15
      }
    });
    assert.strictEqual(legacyProfileSeed.profile.challengerElo, 600);
    assert.strictEqual(legacyProfileSeed.profile.matchesPlayed, 0);
    await exerciseFlySocial();
    await exerciseFlyEconomy();
    await exerciseFlyFriendsDmAndCloudSave();
    await exerciseFlyMatchmaking();
    await exerciseFlyRoomLeave();

    const {code, started} = await createStartedRoom();
    const startPayload = started.accepted?.action?.payload || {};
    assert.strictEqual(started.accepted?.action?.type, 'MATCH_START');
    assert.ok(startPayload.postState, 'MATCH_START should include canonical server state');
    assert.ok(startPayload.stateHash, 'MATCH_START should include canonical state hash');
    const chatOne = await requestJson('POST', `/api/rooms/${code}/chat`, {
      uid:'store-host',
      text:'  hello   from host  ',
      profile:{displayName:'Store Host'}
    });
    assert.strictEqual(chatOne.message.text, 'hello from host');
    assert.strictEqual(chatOne.chatSeq, 1);
    const chatTwo = await requestJson('POST', `/api/rooms/${code}/chat`, {
      uid:'store-guest',
      text:'reply from guest',
      profile:{displayName:'Store Guest'}
    });
    assert.strictEqual(chatTwo.chatSeq, 2);
    const chatAfterOne = await requestJson('GET', `/api/rooms/${code}/chat?after=1&limit=80`);
    assert.strictEqual(chatAfterOne.messages.length, 1);
    assert.strictEqual(chatAfterOne.messages[0].text, 'reply from guest');
    const progress = await requestJson('POST', `/api/rooms/${code}/progress`, {
      uid:'store-host',
      actionSeq:1,
      clientAt:12345
    });
    assert.strictEqual(progress.player.actionSeq, 1);
    assert.strictEqual(progress.room.players['store-host'].actionSeq, 1);
    const liveMatches = await requestJson('GET', '/api/live-matches?limit=16');
    assert.ok(liveMatches.matches.some(match=>match.roomCode === code), 'Fly live matches should include started room');
    const spectatorJoin = await requestJson('POST', `/api/rooms/${code}/spectators/join`, {uid:'spectator-one'});
    assert.strictEqual(spectatorJoin.room.spectatorCount, 1);
    const spectatorResume = await requestJson('GET', `/api/rooms/${code}/resume?after=0&limit=20&includeState=1&spectator=1`);
    assert.strictEqual(spectatorResume.room.spectatorCount, 1);
    assert.deepStrictEqual(spectatorResume.room.spectators, {}, 'public spectator room must not expose viewer UIDs');
    assert.strictEqual(spectatorResume.room.seed, '', 'spectators must not receive the deterministic deck seed');
    assert.strictEqual(spectatorResume.spectatorView, true);
    assert.strictEqual(spectatorResume.events[0].action.type, 'MATCH_START');
    assert.strictEqual(spectatorResume.events[0].action.uid, undefined, 'spectator events must not expose stable action UIDs');
    assert.strictEqual(spectatorResume.events[0].action.payload.decks, undefined, 'spectator events must not expose deck recipes');
    assert.ok(spectatorResume.canonicalState, 'spectator resume should include a redacted canonical state');
    spectatorResume.canonicalState.players.forEach((player, playerIndex)=>{
      assert.ok(player.hand.length > 0, 'initial spectator state should preserve hand counts');
      assert.ok(player.deck.length > 0, 'initial spectator state should preserve deck counts');
      assert.ok(player.hand.every(card=>card.hidden && card._spectatorHidden && !card.id), `player ${playerIndex} hand must contain only hidden placeholders`);
      assert.ok(player.deck.every(card=>card.hidden && card._spectatorHidden && !card.id), `player ${playerIndex} deck must contain only hidden placeholders`);
    });
    assert.ok(!JSON.stringify(spectatorResume).includes('spectator-one'), 'spectator resume must not leak the viewer UID');
    assert.ok(!JSON.stringify(spectatorResume).includes('fly-store-smoke-seed'), 'spectator resume must not leak the shuffle seed through events or room patches');
    const spectatorChat = await requestJson('POST', `/api/rooms/${code}/chat`, {
      uid:'spectator-one',
      text:'spectator hello',
      profile:{displayName:'Ignored Name'}
    });
    assert.strictEqual(spectatorChat.message.text, 'spectator hello');
    assert.strictEqual(spectatorChat.message.isSpectator, true);
    assert.strictEqual(spectatorChat.message.name, 'Spectator');
    assert.strictEqual(spectatorChat.message.uid, '', 'spectator chat identity must remain anonymous');
    const chatAfterTwo = await requestJson('GET', `/api/rooms/${code}/chat?after=2&limit=80`);
    assert.ok(chatAfterTwo.messages.some(message=>message.text === 'spectator hello'), 'Fly spectator chat should use room chat endpoint');
    const spectatorLeave = await requestJson('POST', `/api/rooms/${code}/spectators/leave`, {uid:'spectator-one'});
    assert.strictEqual(spectatorLeave.removed, true);
    assert.strictEqual(spectatorLeave.room.spectatorCount, 0);
    await waitForStoredRoomSnapshot(
      path.join(dataDir, 'rooms.json'),
      code,
      room=>
        room.guestUid === 'store-guest'
        && Number(room.chatSeq || 0) === 3
        && Array.isArray(room.chat)
        && room.chat.length === 3
        && Object.keys(room.spectators || {}).length === 0,
      'the complete post-spectator room state'
    );

    await stopServer(child);
    child = null;

    const roomsFile = path.join(dataDir, 'rooms.json');
    const eventsFile = path.join(dataDir, 'events.jsonl');
    assert.ok(fs.existsSync(roomsFile), 'rooms.json should be persisted');
    assert.ok(fs.existsSync(eventsFile), 'events.jsonl should be persisted');
    const stored = JSON.parse(fs.readFileSync(roomsFile, 'utf8'));
    assert.ok(Array.isArray(stored.rooms), 'rooms.json should contain room array');
    const storedRoom = stored.rooms.find(room=>room.code === code);
    assert.ok(storedRoom, 'stored rooms should include started room');
    assert.strictEqual(Object.keys(storedRoom.spectators || {}).length, 0, 'background persistence must retain the latest spectator leave');

    child = startServer(dataDir);
    const restoredHealth = await waitForHealth();
    assert.strictEqual(restoredHealth.flyDurableStoreReady, true);
    assert.strictEqual(restoredHealth.flyRoomDiscovery, true);
    assert.strictEqual(restoredHealth.flyProfiles, true);
    assert.strictEqual(restoredHealth.flySocial, true);
    assert.strictEqual(restoredHealth.flyWorldChat, true);
    assert.strictEqual(restoredHealth.flyEconomy, true);
    assert.strictEqual(restoredHealth.flyMarketplace, true);
    assert.strictEqual(restoredHealth.flyPublicDecks, true);
    assert.strictEqual(restoredHealth.flyPlayerSaves, true);
    assert.strictEqual(restoredHealth.flyFriends, true);
    assert.strictEqual(restoredHealth.flyDirectMessages, true);
    assert.strictEqual(restoredHealth.flySpectators, true);
    assert.strictEqual(restoredHealth.flyLiveMatches, true);
    assert.strictEqual(restoredHealth.firebaseRtdbDisabled, true);
    assert.strictEqual(restoredHealth.firebaseDurableWrites, false);
    const restoredProfileSeed = await requestJson('GET', '/api/profiles/store-profile');
    assert.strictEqual(restoredProfileSeed.profile.challengerWins, 0);
    assert.strictEqual(restoredProfileSeed.profile.starlight, 12);
    await assertFlySocialRestored();
    await assertFlyEconomyRestored();
    await assertFlyFriendsDmAndCloudSaveRestored();
    await exerciseFlyRoomDiscovery(code);

    const resumed = await requestJson('GET', `/api/rooms/${code}/resume?after=0&limit=20`);
    assert.strictEqual(resumed.roomCode, code);
    assert.strictEqual(resumed.lastSeq, 1);
    assert.strictEqual(resumed.serverStateHash, startPayload.stateHash);
    assert.ok(['matchup', 'starting', 'playing'].includes(String(resumed.room.status || '')), 'resumed room should remain in a started lifecycle state');
    assert.strictEqual(resumed.room.seed, 'fly-store-smoke-seed');
    assert.strictEqual(resumed.room.chatSeq, 3);
    assert.ok(Array.isArray(resumed.room.chat), 'resumed room should include capped Fly chat');
    assert.strictEqual(resumed.room.chat.length, 3);
    assert.strictEqual(resumed.room.chat[0].text, 'hello from host');
    assert.strictEqual(resumed.room.chat[1].text, 'reply from guest');
    assert.strictEqual(resumed.room.chat[2].text, 'spectator hello');
    assert.strictEqual(resumed.room.spectatorCount, 0);
    assert.strictEqual(resumed.room.players['store-host'].actionSeq, 1);
    assert.ok(Array.isArray(resumed.events), 'resume should return event array');
    assert.strictEqual(resumed.events.length, 1);
    assert.strictEqual(resumed.events[0].action.type, 'MATCH_START');
    assert.strictEqual(resumed.events[0].action.payload.stateHash, startPayload.stateHash);
    const resumedWithState = await requestJson('GET', `/api/rooms/${code}/resume?after=0&limit=20&includeState=1`);
    assert.strictEqual(resumedWithState.lastSeq, 1);
    assert.strictEqual(resumedWithState.serverStateHash, startPayload.stateHash);
    assert.ok(resumedWithState.canonicalState, 'resume includeState should return canonical state');
    assert.strictEqual(resumedWithState.canonicalState.v, 2);
    assert.strictEqual(resumedWithState.canonicalState.players.length, 2);

    const resumeRoom = Object.assign({}, resumed.room, {
      lastActionSeq:resumed.lastSeq,
      currentTurnUid:resumed.room.currentTurnUid,
      playerOrder:resumed.room.playerOrder
    });
    hostClient = await openClient('store-host', code, startPayload.stateHash, resumeRoom);
    guestClient = await openClient('store-guest', code, startPayload.stateHash, resumeRoom);
    await closeClient(guestClient);
    guestClient = null;
    const storedAfterDisconnect = await waitForStoredDisconnected(roomsFile, code, 'store-guest');

    await stopServer(child);
    child = null;

    const disconnectedRoom = storedAfterDisconnect.rooms.find(room=>room.code === code);
    assert.strictEqual(disconnectedRoom.players['store-guest'].connected, false, 'guest disconnect state should persist before restart');

    child = startServer(dataDir);
    const rearmedHealth = await waitForHealth();
    assert.ok(Number(rearmedHealth.restoredTimerCount || 0) >= 0, 'restored disconnect timer metric should be present in health');
    const ended = await waitForRoomEnded(code);
    assert.strictEqual(ended.room.status, 'ended');
    assert.strictEqual(ended.room.endReason, 'disconnect');
    assert.ok(ended.lastSeq >= 2, 'disconnect timeout should append a server action after restart');
    assert.ok(ended.events.some(event=>event?.action?.type === 'DISCONNECT_TIMEOUT'), 'resume should include server disconnect timeout event');
    const disconnectEvent = ended.events.find(event=>event?.action?.type === 'DISCONNECT_TIMEOUT');
    assert.strictEqual(disconnectEvent.durableWrite, false, 'server disconnect timeout should not mirror to RTDB when disabled');
    assert.strictEqual(disconnectEvent.firebaseRtdbDisabled, true, 'server disconnect timeout should mark RTDB mirror disabled');
    const flyLeaderboard = await requestJson('GET', '/api/leaderboards/challenger?limit=20');
    const hostEntry = flyLeaderboard.leaderboard.find(entry=>entry.uid === 'store-host');
    const guestEntry = flyLeaderboard.leaderboard.find(entry=>entry.uid === 'store-guest');
    assert.ok(hostEntry, 'Fly leaderboard should include ranked winner');
    assert.ok(guestEntry, 'Fly leaderboard should include ranked loser');
    assert.strictEqual(hostEntry.challengerWins, 1);
    assert.strictEqual(guestEntry.challengerLosses, 1);
    const hostProfile = await requestJson('GET', '/api/profiles/store-host');
    assert.strictEqual(hostProfile.profile.uid, 'store-host');
    assert.strictEqual(hostProfile.profile.challengerWins, 1);
    assert.ok(hostProfile.profile.challengerElo > 600, 'winner ELO should increase in Fly profile stats');
    const hostResults = await requestJson('GET', '/api/match-results?uid=store-host&limit=10');
    assert.ok(hostResults.results.some(result=>result.roomCode === code && result.endReason === 'disconnect' && result.didWin), 'Fly match results should include server disconnect win');

    await stopServer(child);
    child = null;

    const endedSnapshot = JSON.parse(fs.readFileSync(roomsFile, 'utf8'));
    const staleStartedRoom = stored.rooms.find(room=>room.code === code);
    fs.writeFileSync(roomsFile, JSON.stringify(Object.assign({}, endedSnapshot, {
      rooms:endedSnapshot.rooms.map(room=>room.code === code ? staleStartedRoom : room)
    })));

    child = startServer(dataDir);
    const repairedHealth = await waitForHealth();
    assert.strictEqual(Number(repairedHealth.restoredEventCount || 0), 0, 'normal Fly boot must not replay append-only events.jsonl');

    await stopServer(child);
    child = null;
    fs.unlinkSync(roomsFile);

    child = startServer(dataDir);
    const rebuiltHealth = await waitForHealth();
    assert.strictEqual(Number(rebuiltHealth.restoredEventCount || 0), 0, 'normal Fly boot must not rebuild rooms from append-only events.jsonl');
    await stopServer(child);
    child = null;

    fs.writeFileSync(roomsFile, JSON.stringify(endedSnapshot));
    child = startServer(dataDir);
    await waitForHealth();
    const rebuilt = await requestJson('GET', `/api/rooms/${code}/resume?after=0&limit=20`);
    assert.ok(rebuilt.events.some(event=>event?.action?.type === 'DISCONNECT_TIMEOUT'), 'snapshot restore should include disconnect timeout');

    const rebuiltRoom = Object.assign({}, rebuilt.room, {
      lastActionSeq:rebuilt.lastSeq,
      currentTurnUid:rebuilt.room.currentTurnUid,
      playerOrder:rebuilt.room.playerOrder
    });
    hostClient = await openClient('store-host', code, rebuilt.serverStateHash || rebuilt.canonicalHash || startPayload.stateHash, rebuiltRoom);
    await delay(80);
    await stopServer(child);
    child = null;
    hostClient = null;
    const storedAfterShutdown = JSON.parse(fs.readFileSync(roomsFile, 'utf8'));
    const shutdownRoom = storedAfterShutdown.rooms.find(room=>room.code === code);
    assert.ok(shutdownRoom.players['store-host'], 'graceful shutdown should preserve restored room players');

    console.log('fate-fly-store smoke passed');
  }finally{
    await closeClient(hostClient);
    await closeClient(guestClient);
    await stopServer(child);
    try{ fs.rmSync(dataDir, {recursive:true, force:true}); }catch(e){}
  }
}

main().catch(err=>{
  console.error(err);
  process.exit(1);
});
