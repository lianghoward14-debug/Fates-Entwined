#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP_PATH = path.join(ROOT, 'tools', 'electron-authority-render-report-smoke-app.js');
const RESULT_PATH = path.join(os.tmpdir(), `fate-authority-render-smoke-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);

let electronPath = null;
try{
  electronPath = require('electron');
}catch(err){
  throw new Error('Electron is required for authority render diagnostics smoke: ' + (err && err.message || err));
}

assert.strictEqual(typeof electronPath, 'string', 'electron package must resolve to a binary path');

const result = spawnSync(electronPath, [APP_PATH], {
  cwd:ROOT,
  env:Object.assign({}, process.env, {FATE_AUTHORITY_RENDER_SMOKE_RESULT:RESULT_PATH}),
  encoding:'utf8',
  timeout:45000,
  maxBuffer:8 * 1024 * 1024
});

if(result.error){
  throw result.error;
}
let payload = null;
if(fs.existsSync(RESULT_PATH)){
  payload = JSON.parse(fs.readFileSync(RESULT_PATH, 'utf8'));
  fs.unlinkSync(RESULT_PATH);
}
if(result.status !== 0 && !payload){
  if(result.stdout) process.stdout.write(result.stdout);
  if(result.stderr) process.stderr.write(result.stderr);
  process.stderr.write(`Electron render smoke exited with status ${result.status}\n`);
  process.exit(result.status || 1);
}

if(!payload){
  const text = String(result.stdout || '').trim();
  const jsonStart = text.indexOf('{');
  assert.ok(jsonStart >= 0, 'Electron render smoke must print a JSON result');
  payload = JSON.parse(text.slice(jsonStart));
}
if(payload && payload.ok !== true && payload.error){
  throw new Error(payload.error + (payload.stack ? '\n' + payload.stack : ''));
}
assert.strictEqual(payload.ok, true, 'authority render report must converge in Electron');
assert.strictEqual(payload.report.canonicalBoardCount, 1, 'canonical board count must include seeded card');
assert.strictEqual(payload.report.renderedBoardCount, 1, 'rendered board count must include seeded card');
assert.strictEqual(payload.report.renderedBoardMatchesCanonical, true, 'rendered board must match canonical board');
assert.strictEqual(payload.report.renderMismatchReason, '', 'render mismatch reason must be empty on convergence');
assert.ok(payload.report.renderedBoardSource, 'render report must include renderedBoardSource');

console.log('fate-authority-render-diagnostic-electron smoke passed');
