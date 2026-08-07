import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {canonicalHash, createInitialState} from '../../shared/engine/index.mjs';
import {SQLiteAuthorityStore} from './storage.mjs';
import {TEST_DEFINITIONS} from './test-helpers.mjs';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fate-authority-retention-'));
const store = new SQLiteAuthorityStore(path.join(tempDir, 'authority.sqlite'));

function create(matchId){
  const state = createInitialState({
    matchId,
    seed:matchId,
    cardDefinitions:TEST_DEFINITIONS,
    players:[
      {id:`${matchId}-p0`, deckIds:['32']},
      {id:`${matchId}-p1`, deckIds:['32']}
    ]
  });
  store.createMatch(state, canonicalHash(state), [
    {playerId:`${matchId}-p0`, seat:0, tokenHash:'a'},
    {playerId:`${matchId}-p1`, seat:1, tokenHash:'b'}
  ]);
}

for(const matchId of ['RETENTIONA', 'RETENTIONB', 'RETENTIONC']) create(matchId);
assert.deepEqual(store.pruneOldMatches({keepMostRecent:2, batchSize:1}), ['RETENTIONA']);
assert.equal(store.hasMatch('RETENTIONA'), false);
assert.equal(store.hasMatch('RETENTIONB'), true);
assert.equal(store.hasMatch('RETENTIONC'), true);

create('RETENTIOND');
assert.deepEqual(
  store.pruneOldMatches({keepMostRecent:1, excludeMatchIds:['RETENTIONB'], batchSize:1}),
  ['RETENTIONC']
);
assert.equal(store.hasMatch('RETENTIONB'), true, 'an active excluded match must survive pruning');
assert.equal(store.hasMatch('RETENTIOND'), true);

store.close();
fs.rmSync(tempDir, {recursive:true, force:true});
console.log('authoritative v3 storage retention smoke test passed');
