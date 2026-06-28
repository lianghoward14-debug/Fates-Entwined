#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const flyPath = path.join(ROOT, 'fly.toml');
const packagePath = path.join(ROOT, 'package.json');
const dockerfilePath = path.join(ROOT, 'Dockerfile');
const dockerignorePath = path.join(ROOT, '.dockerignore');

function readText(file){
  return fs.readFileSync(file, 'utf8');
}

function parseTomlTables(text){
  const tables = {};
  let current = '';
  text.split(/\r?\n/).forEach(line=>{
    const trimmed = line.trim();
    if(!trimmed || trimmed.startsWith('#')) return;
    const table = trimmed.match(/^\[([^\]]+)\]$/);
    if(table){
      current = table[1].trim();
      tables[current] = tables[current] || {};
      return;
    }
    if(!current) return;
    const match = trimmed.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if(!match) return;
    const key = match[1];
    let value = match[2].trim();
    value = value.replace(/^['"]|['"]$/g, '');
    tables[current][key] = value;
  });
  return tables;
}

function assertEnv(env, key, expected){
  assert.strictEqual(env[key], expected, `fly.toml [env] ${key} should be ${expected}`);
}

function dockerignoreHas(line, message){
  assert.ok(dockerignoreLines.includes(line), `.dockerignore should ${message}`);
}

const tables = parseTomlTables(readText(flyPath));
const flyText = readText(flyPath);
const dockerfileText = readText(dockerfilePath);
const dockerignoreText = readText(dockerignorePath);
const dockerignoreLines = dockerignoreText.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
const env = tables.env || {};
const processes = tables.processes || {};
const service = tables.http_service || {};

assert.strictEqual(processes.app, 'node server/fate-ws-authority.js', 'Fly app process should run the authority server');
assertEnv(env, 'FATE_WS_DATA_DIR', '/data/fate-authority');
assertEnv(env, 'FATE_WS_FLY_STORE', '1');
assertEnv(env, 'FATE_WS_REQUIRE_FLY_STORE', '1');
assertEnv(env, 'FATE_WS_REQUIRE_TOKEN', '1');
assertEnv(env, 'FATE_WS_DISABLE_FIREBASE_RTDB', '1');
assertEnv(env, 'FATE_RTDB_DISABLED', '1');
assertEnv(env, 'FATE_WS_DURABLE_WRITES', 'off');
assertEnv(env, 'FATE_WS_REQUIRE_DURABLE_WRITES', '0');
assertEnv(env, 'FATE_WS_STATE_GATE', '1');
assertEnv(env, 'FATE_WS_REDUCER_MODE', 'strict');
assert.strictEqual(service.internal_port, '8787', 'Fly internal port should match authority server default');
assert.strictEqual(service.auto_stop_machines, 'off', 'Fly authority machines should not auto-stop during live WebSocket service');
assert.strictEqual(service.min_machines_running, '1', 'Fly authority should keep one machine warm for live match hosting');
assert.ok(/\[\[mounts\]\][\s\S]*source\s*=\s*['"]fate_authority_data['"][\s\S]*destination\s*=\s*['"]\/data['"]/m.test(flyText), 'fly.toml should mount fate_authority_data at /data');

const pkg = JSON.parse(readText(packagePath));
assert.strictEqual(pkg.scripts['server:fly-local'], 'node server/fate-fly-authority-local.js');
assert.strictEqual(pkg.scripts['smoke:fly-config'], 'node server/fate-fly-config-smoke-test.js');
assert.strictEqual(pkg.scripts['smoke:fly-test-readiness'], 'node server/fate-fly-test-readiness-static-smoke-test.js');
assert.strictEqual(pkg.scripts['smoke:fly-cutover'], 'node server/fate-fly-cutover-preflight-smoke-test.js');
assert.strictEqual(pkg.scripts['predeploy:fly-authority'], 'npm run smoke:fly-cutover');
assert.strictEqual(pkg.scripts['deploy:fly-authority'], 'fly deploy --config fly.toml');
assert.match(dockerfileText, /FROM\s+node:22-alpine/, 'Dockerfile should use a small Node runtime image');
assert.match(dockerfileText, /COPY\s+server\s+\.\/server/, 'Dockerfile should copy server runtime files');
assert.match(dockerfileText, /ENV\s+FATE_WEBSITE_DIR=\/app/, 'Dockerfile should serve the actual game app as the hosted root');
assert.match(dockerfileText, /COPY\s+index\.html[\s\S]+\.\/\n/, 'Dockerfile should copy the game entrypoint');
assert.match(dockerfileText, /COPY\s+src\s+\.\/src/, 'Dockerfile should copy the full game source and card catalog data');
assert.match(dockerfileText, /COPY\s+optimized\s+\.\/optimized/, 'Dockerfile should copy optimized game art assets');
assert.match(dockerfileText, /COPY\s+fates-entwined-website\/installer\s+\.\/installer/, 'Dockerfile should keep the hosted installer available');
assert.match(dockerfileText, /CMD\s+\["node",\s*"server\/fate-ws-authority\.js"\]/, 'Dockerfile should start the authority server');
assert.doesNotMatch(dockerfileText, /npm\s+install|npm\s+ci|electron|solo-static-server/i, 'Dockerfile should not install or launch desktop/static-server tooling');

assert.strictEqual(dockerignoreLines[0], '*', '.dockerignore should default-deny the build context');
dockerignoreHas('!Dockerfile', 'allow the Fly authority Dockerfile');
dockerignoreHas('!index.html', 'allow the hosted game entrypoint');
dockerignoreHas('!server/', 'allow the server runtime directory');
dockerignoreHas('!src/**', 'allow the full game source directory');
dockerignoreHas('!optimized/**', 'allow optimized game art assets');
dockerignoreHas('!server/**', 'allow server runtime files');
dockerignoreHas('!src/', 'allow the source tree needed for the hosted game');
dockerignoreHas('!titlscreenbackgrounds/**', 'allow title screen backgrounds');
dockerignoreHas('!ingamebackgrouds/**', 'allow in-game backgrounds');
dockerignoreHas('!soundeffects/**', 'allow game sound effects');
dockerignoreHas('!fates-entwined-website/', 'allow hosted website assets');
dockerignoreHas('!fates-entwined-website/installer/**', 'allow hosted installer files');
assert.doesNotMatch(dockerignoreText, /^!.*(?:node_modules|dist|out|electron|project-backups)/mi, '.dockerignore should not re-include desktop/build backup paths');

console.log('fate-fly-config smoke passed');
