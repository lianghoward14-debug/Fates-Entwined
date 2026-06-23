#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RULES_FILE = 'REALTIME_DATABASE_RULES_ONLINE_REBUILD_V1_7_SERVER_AUTHORITATIVE.json';
const FIREBASE_PROJECT_ID = 'fates-entwined-41491';
const RULES_PATH = path.join(ROOT, RULES_FILE);
const CLIENT_ELO_PATH = path.join(ROOT, 'src/scripts/19-online-elo.js');
const FIREBASE_JSON_PATH = path.join(ROOT, 'firebase.json');
const FIREBASERC_PATH = path.join(ROOT, '.firebaserc');

function readJson(file){
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readText(file){
  return fs.readFileSync(file, 'utf8');
}

function at(root, parts){
  return parts.reduce((node, key)=>node && node[key], root);
}

function hasIndex(node, key){
  const index = node && node['.indexOn'];
  return Array.isArray(index) && index.includes(key);
}

function readRule(node){
  return String((node && node['.read']) || '');
}

function assertNoPublicRead(nodePath, node){
  assert.notStrictEqual(node && node['.read'], true, `${nodePath} must not have public .read true`);
  assert.notStrictEqual(readRule(node), 'true', `${nodePath} must not have string public .read true`);
}

function assertAuth(rulePath, rule){
  assert.match(String(rule || ''), /auth\s*!=\s*null/, `${rulePath} must require auth`);
}

function assertCappedQuery(nodePath, node, orderKey, limitName, maxLimit){
  const rule = readRule(node);
  assertAuth(`${nodePath} .read`, rule);
  assert.match(rule, new RegExp(`query\\.orderByChild\\s*==\\s*['"]${orderKey}['"]`), `${nodePath} must require orderByChild ${orderKey}`);
  assert.match(rule, new RegExp(`query\\.${limitName}\\s*<=\\s*${maxLimit}\\b`), `${nodePath} must cap ${limitName} at ${maxLimit}`);
  assert.ok(hasIndex(node, orderKey), `${nodePath} must index ${orderKey}`);
}

function assertChildReadOnly(nodePath, node){
  assertNoPublicRead(nodePath, node);
  assert.ok(!Object.prototype.hasOwnProperty.call(node || {}, '.read') || node['.read'] === false, `${nodePath} collection .read should be absent or false`);
}

const parsed = readJson(RULES_PATH);
const rules = parsed.rules || {};
const firebaseJson = readJson(FIREBASE_JSON_PATH);
const firebaserc = readJson(FIREBASERC_PATH);

assert.strictEqual(firebaseJson.database && firebaseJson.database.rules, RULES_FILE, 'firebase.json must deploy the server-authoritative v1.7 RTDB rules file');
assert.notStrictEqual(firebaseJson.database && firebaseJson.database.rules, 'REALTIME_DATABASE_RULES_ONLINE_REBUILD_V1_6.json', 'firebase.json must not deploy the older permissive v1.6 rules');
assert.notStrictEqual(firebaseJson.database && firebaseJson.database.rules, 'database.rules.json', 'firebase.json must not drift to an unreviewed generic rules file');
assert.strictEqual(firebaserc.projects && firebaserc.projects.default, FIREBASE_PROJECT_ID, '.firebaserc default project must match the game Firebase project');
assert.strictEqual(firebaserc.projects && firebaserc.projects.production, FIREBASE_PROJECT_ID, '.firebaserc production project must match the game Firebase project');
assert.strictEqual(firebaseJson.emulators && firebaseJson.emulators.database && firebaseJson.emulators.database.port, 9000, 'firebase.json should define a stable RTDB emulator port for rules testing');

assert.strictEqual(rules['.read'], false, 'root .read must stay false');
assert.strictEqual(rules['.write'], false, 'root .write must stay false');

assertCappedQuery('publicProfiles', rules.publicProfiles, 'usernameLower', 'limitToFirst', 5);
assertAuth('publicProfiles/$uid .read', readRule(rules.publicProfiles.$uid));

assertCappedQuery('presence', rules.presence, 'online', 'limitToFirst', 40);
assertCappedQuery('liveMatches', rules.liveMatches, 'updatedAt', 'limitToLast', 32);
assertAuth('liveMatches/$roomCode .read', readRule(rules.liveMatches.$roomCode));

assertCappedQuery('matchmaking', rules.matchmaking, 'queueKey', 'limitToFirst', 30);
assert.ok(hasIndex(rules.matchmaking, 'updatedAt'), 'matchmaking must index updatedAt for cleanup/ordering');

assertCappedQuery('leaderboards/challenger', rules.leaderboards.challenger, 'elo', 'limitToLast', 100);
assertAuth('leaderboards/challenger/$uid .read', readRule(rules.leaderboards.challenger.$uid));

const challengerSeason = rules.challengerAI.seasons.$season;
assertChildReadOnly('challengerAI/seasons/$season', challengerSeason);
assertCappedQuery('challengerAI/seasons/$season/ai', challengerSeason.ai, 'elo', 'limitToLast', 100);
assert.ok(hasIndex(challengerSeason.ai, 'updatedAt'), 'challengerAI ai must index updatedAt');
assert.strictEqual(readRule(challengerSeason.matches), '', 'challengerAI matches collection must not expose a string read rule');
assert.strictEqual(challengerSeason.matches['.read'], false, 'challengerAI matches collection reads must be blocked');

assertChildReadOnly('matchResults', rules.matchResults);
assertAuth('matchResults/$matchId .read', readRule(rules.matchResults.$matchId));
assert.match(readRule(rules.matchResults.$matchId), /data\.child\('uid'\)\.val\(\)\s*==\s*auth\.uid/, 'matchResults child reads must be owner-scoped');

assert.strictEqual(rules.publicDecks['.read'], false, 'legacy publicDecks collection reads must stay disabled');
assertCappedQuery('publicDeckSummaries', rules.publicDeckSummaries, 'updatedAt', 'limitToLast', 60);
assertAuth('publicDeckSummaries/$deckId .read', readRule(rules.publicDeckSummaries.$deckId));
assertAuth('publicDeckDetails/$deckId .read', readRule(rules.publicDeckDetails.$deckId));
assertAuth('publicDeckRatings/$deckId .read', readRule(rules.publicDeckRatings.$deckId));
assert.ok(hasIndex(rules.publicDeckRatings.$deckId, 'createdAt'), 'publicDeckRatings must index createdAt');
assertCappedQuery('publicDeckComments/$deckId', rules.publicDeckComments.$deckId, 'createdAt', 'limitToLast', 80);

assertCappedQuery('marketplace/listings', rules.marketplace.listings, 'createdAt', 'limitToLast', 160);
assertAuth('marketplace/listings/$listingId .read', readRule(rules.marketplace.listings.$listingId));
assertCappedQuery('worldChat', rules.worldChat, 'createdAt', 'limitToLast', 100);

assertAuth('rooms/$roomCode .read', readRule(rules.rooms.$roomCode));
assert.ok(hasIndex(rules.rooms.$roomCode.chat, 'createdAt'), 'room chat must index createdAt');
assert.strictEqual(readRule(rules.rooms.$roomCode.actions), '', 'room actions collection must not expose a collection read');
assert.ok(rules.rooms.$roomCode.actions.$actionId['.write'], 'room action writes should remain scoped to MATCH_START bootstrap');

const eloClient = readText(CLIENT_ELO_PATH);
assert.match(eloClient, /function\s+sharedAIQueryTarget\(\)[\s\S]*orderByChild\('elo'\)[\s\S]*limitToLast\(100\)/, 'shared AI client reads must use the capped rules query');
assert.doesNotMatch(eloClient, /onValue\(FO\.ref\(FO\.rtdb,\s*`\$\{seasonPath\(\)\}\/ai`\)/, 'shared AI client must not subscribe to the whole ai node');

console.log('fate-rtdb-rules-lockdown smoke passed');
