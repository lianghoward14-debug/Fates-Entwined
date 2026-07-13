const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const cloudSource = fs.readFileSync(path.join(root, 'src/scripts/14-cloud-save.js'), 'utf8');
const authSource = fs.readFileSync(path.join(root, 'src/scripts/15-online-auth.js'), 'utf8');
const profileSource = fs.readFileSync(path.join(root, 'src/scripts/03-profile-and-progression.js'), 'utf8');

function makeContext() {
  const values = new Map([
    ['fateRtdbDisabled', '1'],
    ['fateFlyApiUrl', 'https://authority.test']
  ]);
  const pending = new Map();
  const requests = [];
  const localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    key(index) { return Array.from(values.keys())[index] || null; },
    get length() { return values.size; }
  };
  const body = { appendChild(el) { el.parentNode = body; } };
  const document = {
    hidden: false,
    body,
    getElementById() { return null; },
    querySelector() { return null; },
    createElement() { return { className:'', innerHTML:'', style:{}, parentNode:null, remove(){} }; }
  };
  const currentUser = uid => ({ uid, getIdToken: async () => 'token-' + uid });
  const context = {
    console: { log(){}, warn(){}, error(){} },
    localStorage,
    document,
    CustomEvent: function(type, init) { this.type = type; this.detail = init && init.detail; },
    setTimeout,
    clearTimeout,
    Promise,
    Date,
    JSON,
    fetch(url, init) {
      requests.push({ url, method: String(init && init.method || 'GET').toUpperCase() });
      return new Promise((resolve, reject) => pending.set(url, { resolve, reject }));
    },
    USER_PROFILE: { username:'Previous Player', _fateAccountUid:'A' },
    PRESET_DECKS: {},
    LEADERBOARD: [],
    PUBLIC_DECKS: [],
    createDefaultUserProfile() { return { username:'Player', createdAt:Date.now() }; }
  };
  context.window = context;
  context.window.dispatchEvent = function(){};
  context.window.FateOnline = { auth: { currentUser: currentUser('A') } };
  vm.createContext(context);
  vm.runInContext(cloudSource, context, { filename:'14-cloud-save.js' });
  return { context, pending, requests, values, currentUser };
}

function response(data) {
  return { ok:true, status:200, text:async () => JSON.stringify(data) };
}

async function waitForRequest(pending, url) {
  for(let i = 0; i < 20 && !pending.has(url); i++) await new Promise(resolve => setImmediate(resolve));
  assert(pending.has(url), 'expected request for ' + url);
}

async function testLateAccountResponseIsIgnored() {
  const { context, pending, values, currentUser } = makeContext();
  const urlA = 'https://authority.test/api/player-save/A';
  const urlB = 'https://authority.test/api/player-save/B';
  values.set('fate_cloud_migration_owner_uid', 'A');
  values.set('fate_social', JSON.stringify({ owner:'A' }));

  const loadA = context.FateCloudSave.onSignIn('A');
  await waitForRequest(pending, urlA);
  context.FateOnline.auth.currentUser = currentUser('B');
  const loadB = context.FateCloudSave.onSignIn('B');
  await waitForRequest(pending, urlB);
  assert.strictEqual(values.has('fate_social'), false, 'B inherited A social cache');

  pending.get(urlB).resolve(response({ data:{ profile:{ username:'Beta', _fateAccountUid:'B' } } }));
  await loadB;
  pending.get(urlA).resolve(response({ data:{ profile:{ username:'Alpha', _fateAccountUid:'A' } } }));
  await loadA;

  assert.strictEqual(context.USER_PROFILE.username, 'Beta');
  assert.strictEqual(context.USER_PROFILE._fateAccountUid, 'B');
  assert.strictEqual(values.has('fate_user_profile_A'), false, 'late A response wrote an A cache after switch');
  assert.strictEqual(JSON.parse(values.get('fate_user_profile_B')).username, 'Beta');
}

async function testLoadFailureDoesNotUploadAnotherCache() {
  const { context, pending, requests } = makeContext();
  const urlA = 'https://authority.test/api/player-save/A';
  const loadA = context.FateCloudSave.onSignIn('A');
  await waitForRequest(pending, urlA);
  pending.get(urlA).reject(new Error('offline'));
  await loadA;
  assert.strictEqual(requests.filter(request => request.method === 'POST').length, 0);
}

async function main() {
  assert(profileSource.includes('window._fateClearActiveAccount = _fateClearActiveAccount'));
  assert(authSource.includes("if(previousUser && typeof window._fateClearActiveAccount === 'function')"));
  assert(!authSource.includes('Sic Kemper Tyrannus'), 'auth must not generate the old shared corrupted fallback name');
  assert(!cloudSource.includes('previousUsername ='));
  await testLateAccountResponseIsIgnored();
  await testLoadFailureDoesNotUploadAnotherCache();
  console.log('Account isolation smoke test passed.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
