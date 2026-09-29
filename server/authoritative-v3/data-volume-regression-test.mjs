import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {gunzipSync} from 'node:zlib';
import {stableStringify} from '../../shared/engine/serialization.mjs';
import {canonicalHash, createInitialState} from '../../shared/engine/index.mjs';
import {TEST_DEFINITIONS, command} from './test-helpers.mjs';
import {SQLiteAuthorityStore} from './storage.mjs';
import {AuthoritativeRoomActor} from './room-actor.mjs';
import {encodeStoredJson, decodeStoredJson} from './storage-json.mjs';
import {endJsonResponse} from './http-json.mjs';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fate-data-volume-'));
const database = path.join(directory, 'authority.sqlite');
let store;
let server;
try{
  const state = createInitialState({matchId:'DATA_VOLUME', seed:'size-test', handSize:20,
    cardDefinitions:TEST_DEFINITIONS,
    players:[{id:'p0', deckIds:['54','34','32']},{id:'p1', deckIds:['32','79']}]});
  const plain = stableStringify(state);
  const packed = encodeStoredJson(state);
  assert(ArrayBuffer.isView(packed));
  assert(packed.byteLength < Buffer.byteLength(plain) * 0.7, 'real game snapshot must shrink substantially');
  assert.deepEqual(decodeStoredJson(packed), JSON.parse(plain));
  assert.equal(encodeStoredJson({small:true}), '{"small":true}');
  assert.throws(()=>decodeStoredJson(Buffer.from('corrupt gzip')), 'corruption must fail loudly');
  store = new SQLiteAuthorityStore(database);
  store.createMatch(state, canonicalHash(state), [
    {playerId:'p0',seat:0,tokenHash:'a'}, {playerId:'p1',seat:1,tokenHash:'b'}]);
  assert.deepEqual(store.latestStoredState(state.matchId), JSON.parse(plain));
  // Existing installations have plain-text snapshots. Keep one to exercise
  // mixed legacy/new databases rather than testing only a fresh database.
  store.db.prepare('UPDATE snapshots SET state_json = ? WHERE match_id = ?').run(plain, state.matchId);
  let actor = AuthoritativeRoomActor.recover({matchId:state.matchId, store});
  const move = command(actor.state, 'p0', 1, 'CONCEDE');
  const result = await actor.dispatch('p0', move);
  assert.equal(result.response.kind, 'accepted');
  assert.equal(store.db.prepare('SELECT typeof(response_json) AS type FROM commands').get().type, 'blob');
  const responsePlain = stableStringify(result.response);
  const responseBytes = store.db.prepare('SELECT length(response_json) AS bytes FROM commands').get().bytes;
  store.close();
  store = new SQLiteAuthorityStore(database);
  actor = AuthoritativeRoomActor.recover({matchId:state.matchId, store});
  assert.deepEqual(actor.state.outcome, result.response.state.outcome);
  const retry = await actor.dispatch('p0', move);
  assert.equal(retry.idempotentReplay, true);
  assert.deepEqual(retry.response, result.response);
  // Plain historical responses still support identical retry semantics.
  store.db.prepare('UPDATE commands SET response_json = ?').run(responsePlain);
  assert.deepEqual(store.commandResponse(state.matchId, move.commandId).response, result.response);

  server = http.createServer((req,res)=>{
    res.setHeader('vary','Origin');
    endJsonResponse(res,200,req.url === '/small' ? '{"ok":true}' : responsePlain);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const request = (encoding, route='/')=>new Promise((resolve,reject)=>{
    http.get({host:'127.0.0.1',port:server.address().port,path:route,
      headers:encoding === undefined ? {} : {'accept-encoding':encoding}},res=>{
      const chunks=[];
      res.on('data',chunk=>chunks.push(chunk));
      res.on('end',()=>resolve({headers:res.headers,body:Buffer.concat(chunks)}));
    }).on('error',reject);
  });
  const zipped = await request('br, gzip');
  assert.equal(zipped.headers['content-encoding'],'gzip');
  assert.equal(gunzipSync(zipped.body).toString(),responsePlain);
  assert.equal(zipped.headers.vary,'Origin, Accept-Encoding');
  assert.equal(Number(zipped.headers['content-length']),zipped.body.length);
  for(const encoding of [undefined,'identity','gzip;q=0, *;q=1','gzip;q=invalid']){
    const response = await request(encoding);
    assert.equal(response.headers['content-encoding'],undefined);
    assert.equal(response.body.toString(),responsePlain);
  }
  assert.equal((await request('*')).headers['content-encoding'],'gzip');
  assert.equal((await request('gzip','/small')).headers['content-encoding'],undefined);

  process.env.FATE_FLY_DATA_API_DIR = path.join(directory,'shared-data');
  const {createFlyDataApi} = await import('./fly-data-api.mjs');
  const api = createFlyDataApi({readBody:async()=>({}),writeJson:()=>{}});
  api.flush();
  const snapshot = path.join(process.env.FATE_FLY_DATA_API_DIR,'rooms.json');
  fs.utimesSync(snapshot,new Date(1000),new Date(1000));
  api.flush();
  assert.equal(fs.statSync(snapshot).mtimeMs,1000,'unchanged flush must not rewrite the snapshot');
  console.log(JSON.stringify({snapshot:{rawBytes:Buffer.byteLength(plain),storedBytes:packed.byteLength},
    commandResponse:{rawBytes:Buffer.byteLength(responsePlain),storedBytes:responseBytes,httpBytes:zipped.body.length}},null,2));
  console.log('Data volume regression passed: legacy rows, compressed restart, exact retries, HTTP negotiation, unchanged snapshots.');
}finally{
  if(server) await new Promise(resolve=>server.close(resolve));
  store?.close();
  fs.rmSync(directory,{recursive:true,force:true});
}
