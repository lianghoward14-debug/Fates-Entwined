import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const worker = path.join(path.dirname(fileURLToPath(import.meta.url)), 'determinism-worker.mjs');
function run(){
  const child = spawnSync(process.execPath, [worker], {encoding:'utf8'});
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}
const first = run();
const second = run();
assert.deepEqual(first, second, 'separate Node processes must produce identical hashes after every command');
console.log('authoritative v3 determinism smoke test passed');

