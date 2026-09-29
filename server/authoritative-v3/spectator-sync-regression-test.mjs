import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {gzipSync} from 'node:zlib';
import {spectatorSnapshotResponse} from './spectator-sync.mjs';
import {AuthoritativeRoomActor} from './room-actor.mjs';
import {testState} from './test-helpers.mjs';

const actor=new AuthoritativeRoomActor({state:testState(),store:{}});
const seat={perspective:0,handSeat:0};
let projections=0;
const original=actor.snapshotForSpectator.bind(actor);
actor.snapshotForSpectator=seat=>{projections++;return original(seat);};
const first=spectatorSnapshotResponse(actor,seat,null);
const unchanged=spectatorSnapshotResponse(actor,seat,first.syncToken);
assert.equal(unchanged.unchanged,true);
assert.equal(projections,1);
assert.equal(unchanged.state,undefined);
assert(first.state.players[0].hand);
const revoked=spectatorSnapshotResponse(actor,{perspective:0,handSeat:null},first.syncToken);
assert.notEqual(revoked.syncToken,first.syncToken);
assert.equal(revoked.state.players[0].hand,undefined);
assert.notEqual(spectatorSnapshotResponse(actor,{perspective:1,handSeat:1},first.syncToken).syncToken,first.syncToken);
actor.state.revision++;
const changed=spectatorSnapshotResponse(actor,seat,first.syncToken);
assert(changed.state);
const fresh=await import('./spectator-sync.mjs?restart');
assert(fresh.spectatorSnapshotResponse(actor,seat,changed.syncToken).state);
actor.state.matchId='OTHER_MATCH';
assert(spectatorSnapshotResponse(actor,seat,changed.syncToken).state);

const source=fs.readFileSync(new URL('../../src/scripts/authoritative-v3-phase7-beta-client.mjs',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('async function startSpectating('),source.indexOf('globalThis.fateAuthorityV3Beta ='));
let pending;
const routes=[],applied=[];
let response=first;
const context=vm.createContext({
  spectatorGeneration:0,spectatingMatchId:'',spectatorPerspective:0,playerIndex:0,spectatorPollTimer:null,
  document:{hidden:false},state:null,console,clone:structuredClone,
  disconnect:()=>{},stopSpectating:()=>{},enforceWarfrontSpectatorState:()=>{},
  mountGameScreen:async()=>{},activeScreen:null,networkAdapter:{view:()=>({})},
  setTimeout:callback=>{pending=callback;return 1;},
  matchmakingRequest:async route=>{routes.push(route);return response;},
  applyServerMessage:message=>applied.push(message)
});
vm.runInContext(fn,context);
await context.startSpectating({matchId:'SPECTATOR_TEST'});
assert.equal(applied.length,1);
response=unchanged;
await pending();
assert(routes[1].includes('since='+first.syncToken));
assert.equal(applied.length,1,'unchanged response preserves rendered board');
context.document.hidden=true;
await pending();
assert.equal(routes.length,2,'hidden window sends no requests');
context.document.hidden=false;
response=changed;
await pending();
assert.equal(applied.length,2,'visible window resumes and applies new revision');
response={...revoked,state:{...revoked.state,outcome:{winner:0}}};
const finalPoll=pending;pending=null;
await finalPoll();
assert.equal(pending,null,'completed match stops polling');
await context.startSpectating({matchId:'SPECTATOR_TEST'});
assert(!routes.at(-1).includes('since='),'new session cannot reuse previous state token');
console.log(JSON.stringify({fullBytes:Buffer.byteLength(JSON.stringify(first)),unchangedBytes:Buffer.byteLength(JSON.stringify(unchanged)),
  fullGzipBytes:gzipSync(JSON.stringify(first)).length,unchangedGzipBytes:gzipSync(JSON.stringify(unchanged)).length}));
console.log('Spectator sync passed: revisions, permissions, restarts, hidden windows, rendering, sessions and completion.');
