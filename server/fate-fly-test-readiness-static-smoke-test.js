#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(rel){
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const roomsText = read('src/scripts/18-online-rooms.js');
const indexText = read('index.html');
const pkg = JSON.parse(read('package.json'));
const docs = read('WEBSOCKET_AUTHORITATIVE_SERVER.md') + '\n' + read('ARCHITECTURE_MIGRATION_PROGRESS.md');

assert.match(roomsText, /window\.fateEnableLocalFlyAuthorityForTesting\s*=\s*function\(opts\)/, 'browser must expose local Fly authority test helper');
assert.match(roomsText, /ws:\/\/127\.0\.0\.1:8787/, 'local Fly authority helper must default to ws://127.0.0.1:8787');
assert.match(roomsText, /apiUrl[\s\S]*url\.replace\(\/\^wss:\/i,\s*'https:'\)[\s\S]*replace\(\/\^ws:\/i,\s*'http:'\)/, 'local Fly authority helper must derive HTTP API URL from WS URL');
assert.match(roomsText, /rtdbDisabled:opts\.rtdbDisabled\s*!==\s*false/, 'local Fly authority helper must enable RTDB-disabled mode by default');
assert.match(roomsText, /authorityOnly:opts\.authorityOnly\s*!==\s*false/, 'local Fly authority helper must enable authority-only mode by default');
assert.match(roomsText, /opts\s*&&\s*opts\.rooms\s*===\s*false[\s\S]*localStorage\.removeItem\('fateFlyRoomsEnabled'\)/, 'Fly enable helper must allow room transport override cleanup');
assert.match(roomsText, /opts\s*&&\s*opts\.rtdbDisabled\s*===\s*false[\s\S]*localStorage\.removeItem\('fateRtdbDisabled'\)/, 'Fly enable helper must allow RTDB-disabled override cleanup');
assert.match(roomsText, /opts\s*&&\s*opts\.apiUrl[\s\S]*localStorage\.setItem\('fateFlyApiUrl'[\s\S]*else\s+localStorage\.removeItem\('fateFlyApiUrl'\)/, 'Fly enable helper must clear stale explicit API URL when omitted');
assert.match(roomsText, /window\.fateApplyFlyAuthorityTestParams\s*=\s*function\(\)/, 'browser must expose URL-param Fly authority test helper');
assert.match(roomsText, /params\.has\('flyTest'\)[\s\S]*params\.get\('fateAuthority'\)\s*===\s*'local'[\s\S]*params\.get\('fateAuthority'\)\s*===\s*'fly'/, 'URL-param helper must support flyTest and fateAuthority modes');
assert.match(roomsText, /params\.get\('flyWs'\)[\s\S]*params\.get\('fateWsAuthorityUrl'\)[\s\S]*params\.get\('wsAuthority'\)/, 'URL-param helper must support explicit WS authority URL');
assert.match(roomsText, /params\.get\('flyApi'\)[\s\S]*params\.get\('fateFlyApiUrl'\)[\s\S]*params\.get\('authorityApi'\)/, 'URL-param helper must support explicit HTTP API URL');
assert.match(roomsText, /window\.fateDisableFlyAuthority[\s\S]*localStorage\.removeItem\('fateFlyApiUrl'\)[\s\S]*localStorage\.removeItem\('fateWsAuthorityUrl'\)[\s\S]*localStorage\.removeItem\('fateWsAuthorityEnabled'\)[\s\S]*closeAuthoritySocket\(\)/, 'disable helper must clear local Fly authority test state and close the socket');

const statusIndex = roomsText.indexOf('window.fateGetWebSocketAuthorityStatus = function()');
const applyIndex = roomsText.indexOf('window.fateApplyFlyAuthorityTestParams();');
assert.ok(statusIndex >= 0 && applyIndex > statusIndex, 'URL-param helper must run after status diagnostics are registered');

assert.match(indexText, /18-online-rooms\.js\?v=1782044001/, 'index must cache-bust the online rooms script for test helpers');
assert.strictEqual(pkg.scripts['smoke:fly-test-readiness'], 'node server/fate-fly-test-readiness-static-smoke-test.js', 'package must expose Fly test readiness smoke');
assert.ok((pkg.scripts['smoke:fly-cutover'] || '').includes('fate-fly-cutover-preflight-smoke-test.js'), 'cutover smoke must remain the combined gate');
assert.match(docs, /fateEnableLocalFlyAuthorityForTesting\(\)/, 'docs must mention the local Fly authority test helper');
assert.match(docs, /\?flyTest=1/, 'docs must mention the URL-param Fly test mode');
assert.match(docs, /fateGetWebSocketAuthorityStatus\(\)/, 'docs must mention the browser authority status diagnostic');

console.log('fate-fly-test-readiness-static smoke passed');
