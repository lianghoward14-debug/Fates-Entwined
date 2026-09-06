import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const serverFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'server.mjs');
const disabled = spawnSync(process.execPath, [serverFile], {
  encoding:'utf8',
  env:{...process.env, FATE_SERVER_AUTHORITATIVE_V3_ENABLED:''}
});
assert.notEqual(disabled.status, 0, 'v3 server must refuse to start without its dedicated flag');
assert.match(disabled.stderr, /isolated and disabled/);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fate-authority-v3-network-'));
const port = 19000 + (process.pid % 1000);
const child = spawn(process.execPath, [serverFile], {
  env:{
    ...process.env,
    FATE_SERVER_AUTHORITATIVE_V3_ENABLED:'1',
    FATE_AUTHORITY_V3_ALLOW_TEST_MATCHES:'1',
    FATE_AUTHORITY_V3_HOST:'127.0.0.1',
    FATE_AUTHORITY_V3_PORT:String(port),
    FATE_AUTHORITY_V3_DATA_DIR:tempDir
  },
  stdio:['ignore', 'pipe', 'pipe']
});
let childOutput = '';
child.stdout.on('data', chunk=>{ childOutput += chunk; });
child.stderr.on('data', chunk=>{ childOutput += chunk; });

function delay(ms){
  return new Promise(resolve=>setTimeout(resolve, ms));
}

async function waitForHealth(){
  for(let attempt = 0; attempt < 60; attempt += 1){
    if(child.exitCode !== null) throw new Error(`v3 server exited early: ${childOutput}`);
    try{
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if(response.ok) return response.json();
    }catch{}
    await delay(50);
  }
  throw new Error(`timed out waiting for v3 server: ${childOutput}`);
}

function socketHarness(url){
  const socket = new WebSocket(url);
  const messages = [];
  const waiters = [];
  socket.addEventListener('message', event=>{
    const message = JSON.parse(String(event.data || '{}'));
    messages.push(message);
    for(const waiter of [...waiters]){
      if(waiter.predicate(message)){
        waiters.splice(waiters.indexOf(waiter), 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      }
    }
  });
  return {
    socket,
    messages,
    opened:new Promise((resolve, reject)=>{
      socket.addEventListener('open', resolve, {once:true});
      socket.addEventListener('error', reject, {once:true});
    }),
    waitFor(predicate, timeout = 3000){
      const existing = messages.find(predicate);
      if(existing) return Promise.resolve(existing);
      return new Promise((resolve, reject)=>{
        const waiter = {
          predicate,
          resolve,
          timer:setTimeout(()=>{
            waiters.splice(waiters.indexOf(waiter), 1);
            reject(new Error('timed out waiting for WebSocket message'));
          }, timeout)
        };
        waiters.push(waiter);
      });
    }
  };
}

try{
  const health = await waitForHealth();
  assert.equal(health.isolated, true);
  assert.equal(health.protocolVersion, 3);
  const createResponse = await fetch(`http://127.0.0.1:${port}/v3/matches`, {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      matchId:'NETWORKV3',
      seed:'network-seed',
      handSize:10,
      players:[
        {id:'p0', deckIds:['32', '27', '54']},
        {id:'p1', deckIds:['79', '56', '32']}
      ]
    })
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  const credentials = new Map(created.players.map(player=>[player.playerId, player]));
  const p0 = socketHarness(`ws://127.0.0.1:${port}/v3/socket`);
  const p1 = socketHarness(`ws://127.0.0.1:${port}/v3/socket`);
  await Promise.all([p0.opened, p1.opened]);
  for(const [harness, playerId] of [[p0, 'p0'], [p1, 'p1']]){
    harness.socket.send(JSON.stringify({
      kind:'hello',
      protocolVersion:3,
      matchId:'NETWORKV3',
      playerId,
      token:credentials.get(playerId).token
    }));
  }
  const [snapshot0, snapshot1] = await Promise.all([
    p0.waitFor(message=>message.kind === 'snapshot'),
    p1.waitFor(message=>message.kind === 'snapshot')
  ]);
  assert.equal(Object.hasOwn(snapshot0.state.players[0], 'deck'), false);
  assert.equal(Object.hasOwn(snapshot0.state.players[1], 'hand'), false);
  assert.equal(Object.hasOwn(snapshot1.state.players[0], 'hand'), false);
  const resident = snapshot0.state.players[0].hand.find(card=>card.id === '32');
  const acceptedCommand = {
    commandId:'p0:network:1',
    matchId:'NETWORKV3',
    expectedRevision:0,
    type:'SET_CARD',
    payload:{cardIid:resident.iid, destination:{z:0, r:2, c:0}}
  };
  p0.socket.send(JSON.stringify({kind:'command', protocolVersion:3, command:acceptedCommand}));
  const [accepted0, accepted1] = await Promise.all([
    p0.waitFor(message=>message.kind === 'accepted' && message.commandId === acceptedCommand.commandId),
    p1.waitFor(message=>message.kind === 'accepted' && message.commandId === acceptedCommand.commandId)
  ]);
  assert.equal(accepted0.revision, 1);
  assert.equal(accepted1.revision, 1);
  assert.equal(Object.hasOwn(accepted1.state.players[0], 'hand'), false);
  const [clock0, clock1] = await Promise.all([
    p0.waitFor(message=>message.kind === 'turn-clock' && message.revision === 1),
    p1.waitFor(message=>message.kind === 'turn-clock' && message.revision === 1)
  ]);
  assert.deepEqual(clock0, clock1, 'both seats must receive the same authoritative clock');
  assert.equal(clock0.matchId, 'NETWORKV3');
  assert(Number.isFinite(clock0.remainingMs));

  p0.messages.splice(0);
  p0.socket.send(JSON.stringify({kind:'command', protocolVersion:3, command:acceptedCommand}));
  const replay = await p0.waitFor(message=>message.kind === 'accepted' && message.commandId === acceptedCommand.commandId);
  // Runtime clock usage is a transport sidecar, not part of the persisted
  // idempotent engine response. Compare every canonical field and event.
  const canonicalAccepted = structuredClone(accepted0);
  delete canonicalAccepted.state.turnClockUsage;
  const canonicalReplay = structuredClone(replay);
  delete canonicalReplay.state.turnClockUsage;
  assert.deepEqual(canonicalReplay, canonicalAccepted, 'duplicate delivery must return the original canonical accepted response');

  const forbiddenCommand = {
    commandId:'p0:network:forbidden',
    matchId:'NETWORKV3',
    expectedRevision:1,
    type:'END_TURN',
    payload:{postState:{revision:999}}
  };
  p0.socket.send(JSON.stringify({kind:'command', protocolVersion:3, command:forbiddenCommand}));
  const rejected = await p0.waitFor(message=>message.kind === 'rejected' && message.commandId === forbiddenCommand.commandId);
  assert.equal(rejected.rejection.code, 'CLIENT_STATE_FORBIDDEN');
  assert.equal(rejected.revision, 1);
  p0.socket.close();
  p1.socket.close();
}finally{
  child.kill('SIGTERM');
  for(let attempt = 0; attempt < 30 && child.exitCode === null; attempt += 1) await delay(50);
  if(child.exitCode === null) child.kill('SIGKILL');
  fs.rmSync(tempDir, {recursive:true, force:true});
}

console.log('authoritative v3 network isolation smoke test passed');
