import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const supervisorPath = path.join(
  root,
  'server',
  'authoritative-v3',
  'phase6-shadow-supervisor.mjs'
);

const disabled = spawnSync(process.execPath, [supervisorPath], {
  cwd:root,
  encoding:'utf8',
  env:{...process.env, FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED:'0'}
});
assert.notEqual(disabled.status, 0);
assert.match(disabled.stderr, /supervisor is disabled/);

const conflict = spawnSync(process.execPath, [supervisorPath], {
  cwd:root,
  encoding:'utf8',
  env:{
    ...process.env,
    FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED:'1',
    FATE_SERVER_AUTHORITATIVE_V3_ENABLED:'1'
  }
});
assert.notEqual(conflict.status, 0);
assert.match(conflict.stderr, /refuses to run/);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fate-v3-shadow-supervisor-'));
const port = 19600 + (process.pid % 300);
const child = spawn(process.execPath, [supervisorPath], {
  cwd:root,
  env:{
    ...process.env,
    HOST:'127.0.0.1',
    PORT:String(port),
    FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED:'1',
    FATE_SERVER_AUTHORITATIVE_V3_ENABLED:'0',
    FATE_SERVER_AUTHORITATIVE_V3_SHADOW_BUILD_ID:'phase6-supervisor-test-build',
    FATE_SERVER_AUTHORITATIVE_V3_SHADOW_POLL_MS:'100',
    FATE_WS_DATA_DIR:tempDir,
    FATE_WS_FLY_STORE:'1',
    FATE_WS_REQUIRE_FLY_STORE:'1',
    FATE_WS_APPEND_EVENT_LOG:'1',
    FATE_WS_REQUIRE_TOKEN:'0',
    FATE_WS_DISABLE_FIREBASE_RTDB:'1',
    FATE_RTDB_DISABLED:'1',
    FATE_WS_DURABLE_WRITES:'off',
    FATE_WS_REQUIRE_DURABLE_WRITES:'0'
  },
  stdio:['ignore', 'pipe', 'pipe']
});
let output = '';
child.stdout.on('data', chunk=>{ output += chunk.toString(); });
child.stderr.on('data', chunk=>{ output += chunk.toString(); });

async function delay(ms){
  await new Promise(resolve=>setTimeout(resolve, ms));
}

async function waitForHealth(){
  for(let attempt = 0; attempt < 100; attempt += 1){
    if(child.exitCode !== null) throw new Error(`supervisor exited early: ${output}`);
    try{
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if(response.ok) return response.json();
    }catch{}
    await delay(50);
  }
  throw new Error(`supervisor health timed out: ${output}`);
}

async function waitForOutput(pattern){
  for(let attempt = 0; attempt < 100; attempt += 1){
    if(pattern.test(output)) return;
    if(child.exitCode !== null) throw new Error(`supervisor exited early: ${output}`);
    await delay(50);
  }
  throw new Error(`supervisor output timed out waiting for ${String(pattern)}: ${output}`);
}

try{
  const health = await waitForHealth();
  assert.equal(health.protocolVersion, 2);
  await waitForOutput(/Phase 6 v3 shadow worker observing/);
  assert.match(output, /Phase 6 v3 shadow worker observing/);

  const defaultDockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  const defaultFly = fs.readFileSync(path.join(root, 'fly.toml'), 'utf8');
  const shadowDockerfile = fs.readFileSync(
    path.join(root, 'Dockerfile.authority-v3-shadow'),
    'utf8'
  );
  assert.match(defaultDockerfile, /CMD \["node", "server\/fate-ws-authority\.js"\]/);
  assert.doesNotMatch(defaultDockerfile, /phase6-shadow|authoritative-v3-shadow/);
  assert.match(defaultFly, /app = 'node server\/fate-ws-authority\.js'/);
  assert.doesNotMatch(defaultFly, /phase6-shadow|FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED/);
  assert.match(shadowDockerfile, /FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED=1/);
  assert.match(shadowDockerfile, /phase6-shadow-supervisor\.mjs/);
}finally{
  child.kill('SIGTERM');
  for(let attempt = 0; attempt < 60 && child.exitCode === null; attempt += 1) await delay(50);
  if(child.exitCode === null) child.kill('SIGKILL');
  fs.rmSync(tempDir, {recursive:true, force:true});
}

console.log('authoritative v3 Phase 6 shadow supervisor smoke test passed');
