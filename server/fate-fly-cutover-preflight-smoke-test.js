#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readJson(rel){
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function runNode(label, script, opts={}){
  const started = Date.now();
  const result = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    env: Object.assign({}, process.env, opts.env || {}),
    encoding: 'utf8',
    maxBuffer: 12 * 1024 * 1024
  });
  const ms = Date.now() - started;
  if(result.status !== 0){
    process.stderr.write(`\n[cutover-preflight] FAILED ${label} (${ms}ms)\n`);
    if(result.stdout) process.stderr.write(result.stdout);
    if(result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
  console.log(`[cutover-preflight] passed ${label} (${ms}ms)`);
}

const pkg = readJson('package.json');
assert.strictEqual(pkg.scripts['smoke:fly-cutover'], 'node server/fate-fly-cutover-preflight-smoke-test.js', 'package should expose the Fly cutover preflight');
assert.strictEqual(pkg.scripts['predeploy:fly-authority'], 'npm run smoke:fly-cutover', 'Fly deploy must run the cutover preflight first');
assert.strictEqual(pkg.scripts['deploy:fly-authority'], 'fly deploy --config fly.toml', 'Fly deploy command must stay scoped to fly.toml');
assert.strictEqual(pkg.scripts['predeploy:rtdb-rules'], 'npm run smoke:rtdb-rules-lockdown && npm run smoke:rtdb-disconnect-static && npm run smoke:rtdb-appcheck-static', 'RTDB rules deploy must keep its safety prehook');

const requiredScripts = [
  'smoke:fly-config',
  'smoke:fly-local-runtime',
  'smoke:fly-store',
  'smoke:fly-room',
  'smoke:fly-test-readiness',
  'smoke:multiplayer-diagnostics',
  'smoke:rtdb-rules-lockdown',
  'smoke:rtdb-disconnect-static',
  'smoke:rtdb-appcheck-static',
  'smoke:ws-authority',
  'smoke:authority-bootstrap',
  'smoke:authority-reducer',
  'smoke:authority-state-gate',
  'smoke:authority-strict-reducer',
  'smoke:card-catalog'
];
requiredScripts.forEach(name=>{
  assert.ok(pkg.scripts[name], `package should expose ${name}`);
});

runNode('Fly config contract', 'server/fate-fly-config-smoke-test.js');
runNode('Fly local runtime', 'server/fate-fly-local-runtime-smoke-test.js');
runNode('Fly volume store', 'server/fate-fly-store-smoke-test.js');
runNode('Fly room lifecycle/action path', 'server/fate-fly-room-lifecycle-smoke-test.js', {
  env:{FATE_FLY_SMOKE_SPAWN_LOCAL:'1', FATE_WS_SMOKE_ALLOW_FAKE:'1'}
});
runNode('Fly browser test readiness', 'server/fate-fly-test-readiness-static-smoke-test.js');
runNode('multiplayer diagnostics', 'server/fate-multiplayer-diagnostics-smoke-test.js');
runNode('RTDB rules lockdown', 'server/fate-rtdb-rules-lockdown-smoke-test.js');
runNode('RTDB disconnect static contract', 'server/fate-rtdb-disconnect-static-smoke-test.js');
runNode('RTDB App Check static contract', 'server/fate-rtdb-appcheck-static-smoke-test.js');
runNode('WebSocket authority multiplayer smoke', 'server/local-multiplayer-smoke-test.js', {
  env:{FATE_WS_SMOKE_ALLOW_FAKE:'1'}
});
runNode('authority bootstrap', 'server/fate-authority-bootstrap-smoke-test.js');
runNode('authority reducer', 'server/fate-authority-reducer-smoke-test.js');
runNode('authority state gate', 'server/fate-authority-state-gate-smoke-test.js');
runNode('authority strict reducer', 'server/fate-authority-strict-reducer-smoke-test.js');
runNode('card catalog', 'server/fate-card-catalog-smoke-test.js');

console.log('fate-fly-cutover-preflight smoke passed');
