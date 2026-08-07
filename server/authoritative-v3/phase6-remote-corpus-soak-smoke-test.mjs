import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const soakPath = path.join(root, 'server', 'authoritative-v3', 'phase6-remote-corpus-soak.mjs');
const snapshotPath = path.join(root, 'tools', 'authority-v3-shadow-corpus-snapshot.mjs');
const soakSource = fs.readFileSync(soakPath, 'utf8');

assert.match(soakSource, /FATE_PHASE6_REMOTE_CORPUS_SOAK === '1'/);
assert.match(soakSource, /https:\/\/fates-entwined-v3-shadow-soak\.fly\.dev/);
assert.doesNotMatch(soakSource, /fates-entwined-main\.fly\.dev/);
assert.match(soakSource, /phase6-real-corpus-v1:/);

const disabled = spawnSync(process.execPath, [soakPath, '--limit', '1'], {
  cwd:root,
  encoding:'utf8',
  env:{...process.env, FATE_PHASE6_REMOTE_CORPUS_SOAK:''}
});
assert.notEqual(disabled.status, 0);
assert.match(disabled.stderr, /exact FATE_PHASE6_REMOTE_CORPUS_SOAK=1 opt-in/);

const wrongRoute = spawnSync(process.execPath, [soakPath, '--limit', '1'], {
  cwd:root,
  encoding:'utf8',
  env:{
    ...process.env,
    FATE_PHASE6_REMOTE_CORPUS_SOAK:'1',
    FATE_PHASE6_REMOTE_CORPUS_ORIGIN:'https://fates-entwined-main.fly.dev'
  }
});
assert.notEqual(wrongRoute.status, 0);
assert.match(wrongRoute.stderr, /pinned to the separate fates-entwined-v3-shadow-soak deployment/);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fate-phase6-corpus-snapshot-'));
try{
  const comparisonsPath = path.join(tempDir, 'comparisons.jsonl');
  const acceptedPath = path.join(tempDir, 'accepted.jsonl');
  const outputDir = path.join(tempDir, 'snapshot');
  const comparisons = [];
  const accepted = [];
  for(let index = 0; index < 180; index += 1){
    const roomCode = `R${String(index).padStart(5, '0')}`;
    const clientActionId = `phase6-real-corpus-v1:${index}:action`;
    const comparison = {
      roomCode,
      sequence:3,
      status:index < 178 ? 'match' : 'mismatch',
      command:{clientActionId}
    };
    const event = {
      code:roomCode,
      accepted:{
        roomCode,
        action:{seq:3, clientActionId, payload:{stateHash:`hash-${index}`}}
      }
    };
    comparisons.push(comparison);
    accepted.push(event);
  }
  comparisons.unshift({
    roomCode:'RETRY0',
    sequence:3,
    status:'engine-rejection',
    command:{clientActionId:'phase6-real-corpus-v1:0:action'}
  });
  accepted.unshift({
    code:'RETRY0',
    accepted:{
      roomCode:'RETRY0',
      action:{seq:3, clientActionId:'phase6-real-corpus-v1:0:action', payload:{stateHash:'retry'}}
    }
  });
  fs.writeFileSync(comparisonsPath, comparisons.map(record=>JSON.stringify(record)).join('\n') + '\n');
  fs.writeFileSync(acceptedPath, accepted.map(record=>JSON.stringify(record)).join('\n') + '\n');
  const snapshot = spawnSync(process.execPath, [
    snapshotPath,
    '--comparisons', comparisonsPath,
    '--accepted-log', acceptedPath,
    '--output-dir', outputDir
  ], {cwd:root, encoding:'utf8'});
  assert.equal(snapshot.status, 0, snapshot.stderr || snapshot.stdout);
  const manifest = JSON.parse(snapshot.stdout);
  assert.equal(manifest.records, 180);
  assert.deepEqual(manifest.statuses, {match:178, mismatch:2});
  const selected = fs.readFileSync(
    path.join(outputDir, 'authority-v3-shadow-corpus-comparisons.jsonl'),
    'utf8'
  ).trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(selected.length, 180);
  assert.equal(selected[0].roomCode, 'R00000');
  const overwrite = spawnSync(process.execPath, [
    snapshotPath,
    '--comparisons', comparisonsPath,
    '--accepted-log', acceptedPath,
    '--output-dir', outputDir
  ], {cwd:root, encoding:'utf8'});
  assert.notEqual(overwrite.status, 0, 'snapshot evidence must be write-once');
}finally{
  fs.rmSync(tempDir, {recursive:true, force:true});
}

console.log('authoritative v3 Phase 6 remote corpus soak smoke test passed');
