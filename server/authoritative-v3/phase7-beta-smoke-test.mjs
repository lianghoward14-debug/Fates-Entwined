import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const betaServer = path.join(path.dirname(fileURLToPath(import.meta.url)), 'phase7-beta-server.mjs');
const clientVersion = '1.39.0-phase7-beta.1';
const adminToken = 'phase7-local-admin';
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fate-authority-v3-phase7-'));
const port = 20000 + (process.pid % 1000);
let child = null;
let childOutput = '';

const disabled = spawnSync(process.execPath, [betaServer], {
  encoding:'utf8',
  env:{...process.env, FATE_SERVER_AUTHORITATIVE_V3_PHASE7_BETA_ENABLED:''}
});
assert.notEqual(disabled.status, 0);
assert.match(disabled.stderr, /Phase 7 unranked beta is isolated and disabled/);

const conflicting = spawnSync(process.execPath, [betaServer], {
  encoding:'utf8',
  env:{
    ...process.env,
    FATE_SERVER_AUTHORITATIVE_V3_PHASE7_BETA_ENABLED:'1',
    FATE_SERVER_AUTHORITATIVE_V3_ENABLED:'1',
    FATE_AUTHORITY_V3_PHASE7_CLIENT_VERSION:clientVersion
  }
});
assert.notEqual(conflicting.status, 0);
assert.match(conflicting.stderr, /owns its authority route/);

function delay(ms){
  return new Promise(resolve=>setTimeout(resolve, ms));
}

function startServer(){
  childOutput = '';
  child = spawn(process.execPath, [betaServer], {
    env:{
      ...process.env,
      FATE_SERVER_AUTHORITATIVE_V3_ENABLED:'',
      FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED:'',
      FATE_SERVER_AUTHORITATIVE_V3_PHASE7_BETA_ENABLED:'1',
      FATE_AUTHORITY_V3_PHASE7_CLIENT_VERSION:clientVersion,
      FATE_AUTHORITY_V3_PHASE7_BUILD_ID:'phase7-local-smoke-build',
      FATE_AUTHORITY_V3_PHASE7_ALLOW_TEST_IDENTITIES:'1',
      FATE_AUTHORITY_V3_PHASE7_ALLOW_ORGANIC_TEST_FIXTURES:'1',
      FATE_AUTHORITY_V3_ALLOW_TEST_MATCHES:'1',
      FATE_AUTHORITY_V3_ADMIN_TOKEN:adminToken,
      FATE_AUTHORITY_V3_HOST:'127.0.0.1',
      FATE_AUTHORITY_V3_PORT:String(port),
      FATE_AUTHORITY_V3_DATA_DIR:dataDir,
      FATE_AUTHORITY_V3_SNAPSHOT_INTERVAL:'1',
      FATE_AUTHORITY_V3_PHASE7_QUEUE_STALE_MS:'1000'
    },
    stdio:['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk=>{ childOutput += chunk; });
  child.stderr.on('data', chunk=>{ childOutput += chunk; });
}

async function stopServer(){
  if(!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  for(let attempt = 0; attempt < 60 && child.exitCode === null; attempt += 1) await delay(50);
  if(child.exitCode === null) child.kill('SIGKILL');
}

async function waitForHealth(){
  for(let attempt = 0; attempt < 100; attempt += 1){
    if(child?.exitCode !== null) throw new Error(`Phase 7 server exited early: ${childOutput}`);
    try{
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if(response.ok) return response.json();
    }catch{}
    await delay(50);
  }
  throw new Error(`timed out waiting for Phase 7 server: ${childOutput}`);
}

function socketHarness(pathname = '/v3/beta/socket'){
  const socket = new WebSocket(`ws://127.0.0.1:${port}${pathname}`);
  const messages = [];
  const waiters = [];
  socket.addEventListener('message', event=>{
    const message = JSON.parse(String(event.data || '{}'));
    messages.push(message);
    for(const waiter of [...waiters]){
      if(!waiter.predicate(message)) continue;
      waiters.splice(waiters.indexOf(waiter), 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  });
  return {
    socket,
    messages,
    opened:new Promise((resolve, reject)=>{
      socket.addEventListener('open', resolve, {once:true});
      socket.addEventListener('error', reject, {once:true});
    }),
    waitFor(predicate, timeout = 4000){
      const existing = messages.find(predicate);
      if(existing) return Promise.resolve(existing);
      return new Promise((resolve, reject)=>{
        const waiter = {
          predicate,
          resolve,
          timer:setTimeout(()=>{
            waiters.splice(waiters.indexOf(waiter), 1);
            reject(new Error(
              `timed out waiting for Phase 7 WebSocket message on ${pathname}; `
              + `received ${JSON.stringify(messages).slice(0, 1200)}`
            ));
          }, timeout)
        };
        waiters.push(waiter);
      });
    }
  };
}

function betaHeaders(version = clientVersion){
  return {
    authorization:`Bearer ${adminToken}`,
    'content-type':'application/json',
    'x-fate-client-version':version
  };
}

function identityHeaders(uid){
  return {
    authorization:`Bearer test:${uid}`,
    'content-type':'application/json',
    'x-fate-client-version':clientVersion
  };
}

function fixtureHeaders(uid){
  return {...identityHeaders(uid), 'x-fate-organic-fixture':'1'};
}

try{
  startServer();
  const health = await waitForHealth();
  assert.equal(health.phase7Beta, true);
  assert.equal(health.flag, 'FATE_SERVER_AUTHORITATIVE_V3_PHASE7_BETA_ENABLED');
  assert.equal(health.protocolVersion, 3);
  assert.equal(health.matchmakingMode, 'freeplay-and-challenger');
  assert.equal(health.requiredClientVersion, clientVersion);
  assert.equal(health.matchesPath, '/v3/beta/matches');
  assert.equal(health.socketPath, '/v3/beta/socket');
  assert.equal(health.queueStaleMs, 1000);

  const legacyRoute = await fetch(`http://127.0.0.1:${port}/v3/matches`, {
    method:'POST',
    headers:betaHeaders(),
    body:'{}'
  });
  assert.equal(legacyRoute.status, 404, 'Phase 7 must not expose the generic v3 route');

  const incompatible = await fetch(`http://127.0.0.1:${port}/v3/beta/matches`, {
    method:'POST',
    headers:betaHeaders('old-client'),
    body:JSON.stringify({mode:'unranked'})
  });
  assert.equal(incompatible.status, 426);

  const ranked = await fetch(`http://127.0.0.1:${port}/v3/beta/matches`, {
    method:'POST',
    headers:betaHeaders(),
    body:JSON.stringify({mode:'ranked'})
  });
  assert.equal(ranked.status, 400);
  assert.match((await ranked.json()).error, /unranked matches only/);

  const unsupported = await fetch(`http://127.0.0.1:${port}/v3/beta/matches`, {
    method:'POST',
    headers:betaHeaders(),
    body:JSON.stringify({
      mode:'unranked',
      matchId:'PHASE7BADDECK',
      players:[
        {id:'p0', deckIds:['not-a-card']},
        {id:'p1', deckIds:['32']}
      ]
    })
  });
  assert.equal(unsupported.status, 400);
  assert.match((await unsupported.json()).error, /unknown card/);

  const enterPool = async (uid, testPool)=>{
    const response = await fetch(`http://127.0.0.1:${port}/v3/beta/matchmaking/enter`, {
      method:'POST',
      headers:fixtureHeaders(uid),
      body:JSON.stringify({name:uid, deckIds:['32','27','54'], testPool, testOpeningCardIds:['32']})
    });
    return {status:response.status, body:await response.json()};
  };
  const poolA0 = await enterPool('pool-a0', 'organic-pool-a');
  const poolB0 = await enterPool('pool-b0', 'organic-pool-b');
  assert.equal(poolA0.body.status, 'waiting');
  assert.equal(poolB0.body.status, 'waiting', 'different certification pools must never cross-match');
  const poolA1 = await enterPool('pool-a1', 'organic-pool-a');
  assert.equal(poolA1.body.status, 'matched');
  const poolBStillWaiting = await fetch(`http://127.0.0.1:${port}/v3/beta/matchmaking/status`, {headers:fixtureHeaders('pool-b0')});
  assert.equal((await poolBStillWaiting.json()).status, 'waiting');
  const poolB1 = await enterPool('pool-b1', 'organic-pool-b');
  assert.equal(poolB1.body.status, 'matched');
  assert.notEqual(poolA1.body.credential.matchId, poolB1.body.credential.matchId);

  const staleQueue = await fetch(`http://127.0.0.1:${port}/v3/beta/matchmaking/enter`, {
    method:'POST',
    headers:identityHeaders('abandoned-public-player'),
    body:JSON.stringify({
      name:'Abandoned Public Player',
      deckIds:['32', '27', '54']
    })
  });
  assert.equal(staleQueue.status, 202);
  assert.equal((await staleQueue.json()).status, 'waiting');
  await delay(1200);
  const staleStatus = await fetch(`http://127.0.0.1:${port}/v3/beta/matchmaking/status`, {
    headers:identityHeaders('abandoned-public-player')
  });
  assert.equal((await staleStatus.json()).status, 'idle', 'abandoned public queue entries must expire');

  const firstQueue = await fetch(`http://127.0.0.1:${port}/v3/beta/matchmaking/enter`, {
    method:'POST',
    headers:identityHeaders('p0'),
    body:JSON.stringify({
      name:'Phase 7 P0',
      deckIds:['32', '27', '54'],
      gameSettings:{landscapeMode:'selected', landscapeId:'igb24', turnTimerMinutes:3}
    })
  });
  assert.equal(firstQueue.status, 202);
  assert.equal((await firstQueue.json()).status, 'waiting');
  const secondQueue = await fetch(`http://127.0.0.1:${port}/v3/beta/matchmaking/enter`, {
    method:'POST',
    headers:identityHeaders('p1'),
    body:JSON.stringify({
      name:'Phase 7 P1',
      deckIds:['79', '56', '32'],
      // The first player owns room settings; a conflicting joiner choice must
      // not replace the selected landscape while the match is assembled.
      gameSettings:{landscapeMode:'selected', landscapeId:'igb2', turnTimerMinutes:8}
    })
  });
  assert.equal(secondQueue.status, 200);
  const secondMatch = await secondQueue.json();
  assert.equal(secondMatch.status, 'matched');
  const firstStatus = await fetch(`http://127.0.0.1:${port}/v3/beta/matchmaking/status`, {
    headers:identityHeaders('p0')
  });
  const firstMatch = await firstStatus.json();
  assert.equal(firstMatch.status, 'matched');
  assert.equal(firstMatch.credential.matchId, secondMatch.credential.matchId);
  const matchId = firstMatch.credential.matchId;
  const credentials = new Map([
    ['p0', firstMatch.credential],
    ['p1', secondMatch.credential]
  ]);

  const incompatibleSocket = socketHarness();
  await incompatibleSocket.opened;
  incompatibleSocket.socket.send(JSON.stringify({
    kind:'hello',
    protocolVersion:3,
    clientVersion:'old-client',
    matchId,
    playerId:'p0',
    token:credentials.get('p0').token
  }));
  const incompatibleError = await incompatibleSocket.waitFor(message=>message.kind === 'error');
  assert.match(incompatibleError.reason, /compatible Phase 7 client version/);
  incompatibleSocket.socket.close();

  const p0 = socketHarness();
  const p1 = socketHarness();
  await Promise.all([p0.opened, p1.opened]);
  for(const [client, playerId] of [[p0, 'p0'], [p1, 'p1']]){
    client.socket.send(JSON.stringify({
      kind:'hello',
      protocolVersion:3,
      clientVersion,
      matchId,
      playerId,
      token:credentials.get(playerId).token
    }));
  }
  const [snapshot0, snapshot1] = await Promise.all([
    p0.waitFor(message=>message.kind === 'snapshot'),
    p1.waitFor(message=>message.kind === 'snapshot')
  ]);
  const consumedDelivery = await fetch(`http://127.0.0.1:${port}/v3/beta/matchmaking/status`, {
    headers:identityHeaders('p0')
  });
  assert.equal((await consumedDelivery.json()).status, 'idle', 'connected match delivery must be one-time');
  assert.equal(Object.hasOwn(snapshot0.state.players[1], 'hand'), false);
  assert.equal(Object.hasOwn(snapshot1.state.players[0], 'hand'), false);
  assert.equal(snapshot0.state.phase, 'coin');
  assert.equal(snapshot0.state.landscapeId, 'igb24');
  assert.equal(snapshot1.state.landscapeId, 'igb24');
  assert.equal(snapshot0.state.gameSettings.landscapeMode, 'selected');
  assert.equal(snapshot0.state.gameSettings.resolvedLandscapeId, 'igb24');
  assert.equal(snapshot0.state.turnTimerSeconds, 180);
  const spectatorResponse = await fetch(`http://127.0.0.1:${port}/v3/beta/matches/${encodeURIComponent(matchId)}/spectator-snapshot`, {
    headers:identityHeaders('warfront-teammate')
  });
  assert.equal(spectatorResponse.status, 200);
  const spectatorSnapshot = await spectatorResponse.json();
  assert.equal(spectatorSnapshot.kind, 'snapshot');
  assert.equal(spectatorSnapshot.matchId, matchId);
  assert.equal(Object.hasOwn(spectatorSnapshot.state.players[0], 'hand'), false);
  assert.equal(Object.hasOwn(spectatorSnapshot.state.players[1], 'hand'), false);
  assert.equal(Object.hasOwn(spectatorSnapshot, 'legalCommands'), false, 'spectator projection must be read-only');
  const incompatibleSpectator = await fetch(`http://127.0.0.1:${port}/v3/beta/matches/${encodeURIComponent(matchId)}/spectator-snapshot`, {
    headers:identityHeaders('warfront-teammate-old'),
    method:'GET'
  });
  // identityHeaders pins the current version; explicitly verify version gating.
  const incompatibleSpectatorRetry = await fetch(`http://127.0.0.1:${port}/v3/beta/matches/${encodeURIComponent(matchId)}/spectator-snapshot`, {
    headers:{...identityHeaders('warfront-teammate-old'),'x-fate-client-version':'old-client'}
  });
  assert.equal(incompatibleSpectator.status, 200);
  assert.equal(incompatibleSpectatorRetry.status, 426);
  assert.deepEqual(snapshot0.state.coinFlip, snapshot1.state.coinFlip);
  assert([0, 1].includes(snapshot0.state.coinFlip.winner));
  const coinWinnerSeat = snapshot0.state.coinFlip.winner;
  const coinWinnerId = coinWinnerSeat === 0 ? 'p0' : 'p1';
  const coinWinnerClient = coinWinnerSeat === 0 ? p0 : p1;
  const coinLoserSnapshot = coinWinnerSeat === 0 ? snapshot1 : snapshot0;
  assert.equal(coinLoserSnapshot.legalCommands.length, 0, 'only the coin winner may choose turn order');
  const coinWinnerSnapshot = coinWinnerSeat === 0 ? snapshot0 : snapshot1;
  assert.deepEqual(
    new Set(coinWinnerSnapshot.legalCommands.map(entry=>entry.payload.goFirst)),
    new Set([true, false])
  );
  const chooseTurn = {
    commandId:'phase7:choose-turn:1',
    matchId,
    expectedRevision:0,
    type:'CHOOSE_TURN_ORDER',
    payload:{goFirst:coinWinnerSeat === 0}
  };
  coinWinnerClient.socket.send(JSON.stringify({kind:'command', protocolVersion:3, command:chooseTurn}));
  const [turnAccepted0, turnAccepted1] = await Promise.all([
    p0.waitFor(message=>message.kind === 'accepted' && message.commandId === chooseTurn.commandId),
    p1.waitFor(message=>message.kind === 'accepted' && message.commandId === chooseTurn.commandId)
  ]);
  assert.equal(turnAccepted0.state.phase, 'main');
  assert.equal(turnAccepted1.state.phase, 'main');
  assert.equal(turnAccepted0.state.activePlayer, 0);
  assert.equal(turnAccepted0.state.coinFlip.startingPlayer, 0);
  assert.equal(turnAccepted0.revision, 1);

  const resident = snapshot0.state.players[0].hand.find(card=>['32', '54'].includes(String(card.id || '')));
  assert.ok(resident, 'test deck must expose a legal zero-cost Supporter');
  const command = {
    commandId:'phase7:p0:set:1',
    matchId,
    expectedRevision:1,
    type:'SET_CARD',
    payload:{cardIid:resident.iid, destination:{z:0, r:2, c:0}}
  };
  p0.socket.send(JSON.stringify({kind:'command', protocolVersion:3, command}));
  const accepted = await p0.waitFor(message=>message.kind === 'accepted' && message.commandId === command.commandId);
  assert.equal(accepted.revision, 2);
  await p1.waitFor(message=>message.kind === 'accepted' && message.commandId === command.commandId);

  const forbidden = {
    commandId:'phase7:p0:forbidden-post-state',
    matchId,
    expectedRevision:2,
    type:'END_TURN',
    payload:{postState:{revision:999}}
  };
  p0.socket.send(JSON.stringify({kind:'command', protocolVersion:3, command:forbidden}));
  const rejected = await p0.waitFor(
    message=>message.kind === 'rejected' && message.commandId === forbidden.commandId
  );
  assert.equal(rejected.rejection.code, 'CLIENT_STATE_FORBIDDEN');
  p0.socket.close();
  p1.socket.close();

  await stopServer();
  startServer();
  const recoveredHealth = await waitForHealth();
  assert.equal(recoveredHealth.phase7Beta, true);

  const recoveredClient = socketHarness();
  await recoveredClient.opened;
  recoveredClient.socket.send(JSON.stringify({
    kind:'hello',
    protocolVersion:3,
    clientVersion,
    matchId,
    playerId:'p0',
    token:credentials.get('p0').token
  }));
  const recovered = await recoveredClient.waitFor(message=>message.kind === 'snapshot');
  assert.equal(recovered.revision, 2);
  assert.equal(recovered.stateHash, accepted.stateHash);
  assert.equal(recovered.state.board[0][2][0].iid, resident.iid);
  recoveredClient.socket.close();
}finally{
  await stopServer();
  fs.rmSync(dataDir, {recursive:true, force:true});
}

console.log('authoritative v3 Phase 7 unranked beta smoke test passed');
