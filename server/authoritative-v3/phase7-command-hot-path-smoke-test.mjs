import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../src/scripts/authoritative-v3-phase7-beta-client.mjs', import.meta.url), 'utf8');
const sendSource = source.slice(source.indexOf('async function sendCommand('), source.indexOf('\nfunction subscribe('));
const guardSource = source.slice(source.indexOf('function containsForbiddenPostState('), source.indexOf('\nfunction emit('));

function harness(overrides = {}){
  const sent = [];
  const context = vm.createContext({
    credential:{playerId:'player1', matchId:'match1'},
    socket:{readyState:1, send(value){ sent.push(JSON.parse(value)); }},
    WebSocket:{OPEN:1}, fatalError:'', intentionallyClosed:false,
    revision:42, inflight:new Map(), crypto:{randomUUID:()=> 'command'},
    clone:value=>JSON.parse(JSON.stringify(value)),
    setTimeout:()=>1, clearTimeout:()=>{}, connectCalls:0,
    ...overrides
  });
  vm.runInContext(`async function connect(){ connectCalls++; socket.readyState = 1; intentionallyClosed = false; }\n${guardSource}\n${sendSource}`, context);
  return {context, sent};
}

{
  const {context, sent} = harness();
  const payload = {destination:{row:1, col:2}};
  let settled = false;
  const result = context.sendCommand('move_card', payload).then(value=>{ settled = true; return value; });
  assert.equal(sent.length, 1, 'connected commands must send without connection reporting');
  assert.equal(context.connectCalls, 0);
  assert.equal(sent[0].command.expectedRevision, 42);
  assert.equal(sent[0].command.type, 'MOVE_CARD');
  payload.destination.row = 9;
  assert.equal(sent[0].command.payload.destination.row, 1);
  await Promise.resolve();
  assert.equal(settled, false, 'sending must still wait for authoritative acknowledgement');
  context.inflight.values().next().value.resolve({kind:'accepted'});
  assert.equal((await result).kind, 'accepted');
}
for(const overrides of [{socket:{readyState:3, send(){}}}, {intentionallyClosed:true}]){
  const {context} = harness(overrides);
  const result = context.sendCommand('END_TURN');
  await Promise.resolve();
  assert.equal(context.connectCalls, 1, 'disconnected/closed sessions retain the connection path');
  context.inflight.values().next().value.reject(new Error('rejected'));
  await assert.rejects(result, /rejected/);
}
for(const [overrides, payload, message] of [
  [{fatalError:'incompatible client'}, {}, /incompatible client/],
  [{}, {nested:{postState:{}}}, /cannot contain client postState/]
]){
  const {context, sent} = harness(overrides);
  await assert.rejects(context.sendCommand('END_TURN', payload), message);
  assert.equal(sent.length, 0);
  assert.equal(context.connectCalls, 0);
}
console.log('Phase 7 command hot path: PASS (acknowledgement, rejection, reconnect, payload and fatal guards)');
