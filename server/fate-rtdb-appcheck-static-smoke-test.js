#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(rel){
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function indexOfOrThrow(text, pattern, label){
  const idx = text.search(pattern);
  assert.ok(idx >= 0, `${label} not found`);
  return idx;
}

const authText = read('src/scripts/15-online-auth.js');
const pkg = JSON.parse(read('package.json'));

assert.match(authText, /initializeAppCheck,\s*ReCaptchaV3Provider/, 'auth bootstrap must import Firebase App Check reCAPTCHA v3 provider');
assert.match(authText, /function\s+getAppCheckSiteKey\(\)[\s\S]*FATE_RECAPTCHA_V3_SITE_KEY[\s\S]*FIREBASE_APPCHECK_SITE_KEY[\s\S]*fateAppCheckSiteKey/, 'App Check site key lookup must support explicit global and local-dev config');
assert.match(authText, /function\s+isLocalAppCheckHost\(\)[\s\S]*localhost[\s\S]*127\.0\.0\.1[\s\S]*location\.protocol\s*===\s*['"]file:/, 'App Check debug provider must be restricted to local/file hosts');
assert.match(authText, /function\s+shouldUseAppCheckDebug\(\)[\s\S]*if\(!isLocalAppCheckHost\(\)\)\s*return\s+false[\s\S]*return\s+true/, 'App Check debug mode must fail closed on non-local hosts');
assert.doesNotMatch(authText, /localStorage\.getItem\(['"]fateAppCheckDebug['"]\)\s*===\s*['"]1['"]\)\s*return\s+true/, 'localStorage must not enable App Check debug on production hosts');
assert.match(authText, /self\.FIREBASE_APPCHECK_DEBUG_TOKEN\s*=\s*true/, 'local App Check debug token must use Firebase debug provider flag');
assert.match(authText, /initializeAppCheck\(app,\s*\{[\s\S]*provider:\s*new\s+ReCaptchaV3Provider\(siteKey\)[\s\S]*isTokenAutoRefreshEnabled:\s*true[\s\S]*\}\)/, 'App Check must use reCAPTCHA v3 with token auto-refresh');
assert.match(authText, /App Check site key missing[\s\S]*RTDB App Check enforcement/, 'missing site key warning must mention RTDB enforcement readiness');

const initAppCheckIndex = indexOfOrThrow(authText, /initializeAppCheck\(app,/, 'initializeAppCheck call');
const getAuthIndex = indexOfOrThrow(authText, /const\s+auth\s*=\s*getAuth\(app\)/, 'getAuth call');
const getDatabaseIndex = indexOfOrThrow(authText, /getDatabase\(app\)/, 'getDatabase call');
assert.ok(initAppCheckIndex < getAuthIndex, 'App Check should initialize before Auth consumers are exported');
assert.ok(initAppCheckIndex < getDatabaseIndex, 'App Check must initialize before getDatabase');

assert.strictEqual(pkg.scripts['smoke:rtdb-appcheck-static'], 'node server/fate-rtdb-appcheck-static-smoke-test.js', 'package should expose App Check smoke');
assert.match(pkg.scripts['predeploy:rtdb-rules'] || '', /smoke:rtdb-rules-lockdown[\s\S]*smoke:rtdb-disconnect-static[\s\S]*smoke:rtdb-appcheck-static/, 'RTDB rules deploy prehook must run rules, disconnect, and App Check smokes');
assert.strictEqual(pkg.scripts['deploy:rtdb-rules'], 'firebase deploy --only database --project fates-entwined-41491', 'RTDB deploy command must stay scoped to database rules and the production project');

console.log('fate-rtdb-appcheck-static smoke passed');
