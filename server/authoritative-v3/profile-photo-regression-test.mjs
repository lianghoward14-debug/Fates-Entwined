import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeMultiplayerPhoto,resolveWarfrontPhoto} from '../../shared/profile-photo.mjs';
import {testState,TEST_DEFINITIONS} from './test-helpers.mjs';
import {createInitialState} from '../../shared/engine/state.mjs';
import {projectStateForPlayer,projectStateForSpectator} from '../../shared/engine/projections.mjs';
const photo='data:image/png;base64,'+Buffer.alloc(160000,123).toString('base64');
assert.equal(normalizeMultiplayerPhoto(photo),photo,'full cropped avatar survives normalization');
assert.equal(resolveWarfrontPhoto({profileImg:{dataUrl:photo},photoURL:'blank.png'}),photo);
assert.equal(resolveWarfrontPhoto({profileImg:'blank.png',photoURL:'pfp/pfp12.png'}),'pfp/pfp12.png');
assert.equal(resolveWarfrontPhoto({}, {pfpId:12}),'pfp/pfp12.png');
assert.equal(normalizeMultiplayerPhoto('pfp/pfp12.png'),'pfp/pfp12.png');
assert.equal(normalizeMultiplayerPhoto({dataUrl:photo}),'','objects cannot become broken object URLs');
assert.equal(normalizeMultiplayerPhoto('data:image/png;base64,'+'A'.repeat(512*1024)),'','oversized images are rejected whole');
for(const file of ['../../src/scripts/authoritative-v3-phase7-beta-client.mjs','./server.mjs','./room-manager.mjs','../../shared/engine/state.mjs']){
  const source=fs.readFileSync(new URL(file,import.meta.url),'utf8');
  assert(source.includes('normalizeMultiplayerPhoto('),file+' uses the shared image limit');
  assert(!/photoURL[^\n]*slice\(0, 2048\)/.test(source),file+' must not truncate images');
}
const fixture=testState();
const state=createInitialState({matchId:'photo-regression',cardDefinitions:TEST_DEFINITIONS,players:fixture.players.map((p,i)=>({id:p.id,name:p.name,photoURL:photo,deckIds:Array(40).fill(i?'27':'30')}))});
assert.equal(state.players[0].photoURL,photo);
assert.equal(state.players[1].photoURL,photo);
// Exercise the outgoing payload: storing a photo alone does not send it to clients.
state.players[1].photoURL='pfp/pfp12.png';
for(const projection of [projectStateForPlayer(state,0),projectStateForPlayer(state,1),projectStateForSpectator(state),projectStateForSpectator(state,0)]){
  const payload=JSON.parse(JSON.stringify(projection));
  assert.equal(payload.players[0].photoURL,photo,'cropped portrait survives the outgoing snapshot');
  assert.equal(payload.players[1].photoURL,'pfp/pfp12.png','opponent portrait remains assigned to its seat');
}
assert.equal(projectStateForPlayer(state,0).players[1].hand,undefined,'portrait publication does not expose opponent cards');
assert.equal(projectStateForSpectator(state).players[0].hand,undefined,'spectator hands remain private');
delete state.players[1].photoURL;
assert.equal(projectStateForPlayer(state,0).players[1].photoURL,'blank.png','older matches without photos use the default');
console.log('Multiplayer cropped avatars remain intact through transport normalization and engine initialization');
