
// FATES ENTWINED ONLINE REBUILD V1
// Google auth + online identity foundation.
// In RTDB-disabled/Fly mode, public profile and cloud-save traffic is routed to
// the Fly authority. Firebase RTDB remains the legacy fallback path.

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { initializeAppCheck, ReCaptchaV3Provider } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app-check.js';
import {
  getAuth, GoogleAuthProvider, browserLocalPersistence, setPersistence,
  signInWithPopup, signInWithRedirect, signInWithCredential, getRedirectResult, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  getDatabase, ref, child, get, set, update, push, remove, onValue, onChildAdded,
  off, onDisconnect, serverTimestamp, query, orderByChild, orderByKey, startAt, equalTo, limitToFirst,
  limitToLast, runTransaction
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';
import {
  getStorage
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js';

const firebaseConfig = {
  apiKey: 'AIzaSyByhcqY0Y27hUkvcAtO3mflRwnQCWhv4Yc',
  authDomain: 'fates-entwined-41491.firebaseapp.com',
  databaseURL: 'https://fates-entwined-41491-default-rtdb.firebaseio.com',
  projectId: 'fates-entwined-41491',
  storageBucket: 'fates-entwined-41491.firebasestorage.app',
  messagingSenderId: '920253472655',
  appId: '1:920253472655:web:c9964989ee5cf3b76975fa',
  measurementId: 'G-WS86STH46J'
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
function getAppCheckSiteKey(){
  try{
    if(window.FATE_RECAPTCHA_V3_SITE_KEY) return String(window.FATE_RECAPTCHA_V3_SITE_KEY);
    if(window.FIREBASE_APPCHECK_SITE_KEY) return String(window.FIREBASE_APPCHECK_SITE_KEY);
    return String(localStorage.getItem('fateAppCheckSiteKey') || '');
  }catch(_){ return ''; }
}
function isLocalAppCheckHost(){
  try{
    const host = String(location.hostname || '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '' || location.protocol === 'file:';
  }catch(_){ return false; }
}
function shouldUseAppCheckDebug(){
  if(!isLocalAppCheckHost()) return false;
  return true;
}
let appCheck = null;
try{
  const siteKey = getAppCheckSiteKey();
  if(shouldUseAppCheckDebug() && typeof self !== 'undefined' && !self.FIREBASE_APPCHECK_DEBUG_TOKEN){
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  if(siteKey){
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true
    });
  }else{
    console.warn('[FateOnline] App Check site key missing. Set window.FATE_RECAPTCHA_V3_SITE_KEY before enabling RTDB App Check enforcement.');
  }
}catch(e){
  console.warn('[FateOnline] App Check initialization skipped', e);
}
const auth = getAuth(app);
const rawRtdb = rtdbDisabledMode() ? null : getDatabase(app);
const rtdb = rawRtdb;

// Disable Firebase internal stats reporting to prevent promise feedback loop
// that causes 12fps lock during gameplay
try {
  const _origSet = rtdb?._repo?.server_?.reportStats;
  if(rtdb?._repo && rtdb._repo.server_) {
    rtdb._repo.server_.reportStats = function(){};
  }
  // Also try to disable via the connection
  setTimeout(function(){
    try {
      if(rtdb?._repo && rtdb._repo.server_) rtdb._repo.server_.reportStats = function(){};
      if(rtdb?._repo && rtdb._repo.server_ && rtdb._repo.server_.connection_) {
        var conn = rtdb._repo.server_.connection_;
        if(conn.reportStats) conn.reportStats = function(){};
      }
    } catch(e){}
  }, 2000);
} catch(e) { console.warn('Could not disable Firebase stats:', e); }

// Promise diagnostics are opt-in. Even a lightweight Promise.prototype.then
// wrapper runs once for every Firebase/internal continuation, so it must not be
// part of normal multiplayer gameplay.
// Promise flood monitor — lightweight sampling version.
// Only updates counters; does NOT wrap every .then() call (the old approach added
// measurable overhead at high Promise rates). Uses a periodic sampler instead.
function installFatePromiseMonitor(){
  if(window.__fatePromiseMonitorInstalled) return;
  window.__fatePromiseMonitorInstalled = true;
  const perf = window.__fatePerf = window.__fatePerf || {};
  perf.promiseMonitorEnabled = true;
  var _origThen = Promise.prototype.then;
  var _thenCount = 0;
  var _warnedAt = 0;
  // Lightweight counter — only increments an integer, no Date.now() or object access
  var monitoredThen = function(){
    _thenCount++;
    return _origThen.apply(this, arguments);
  };
  monitoredThen.__fatePromiseMonitor = true;
  monitoredThen.__fateOriginalThen = _origThen;
  Promise.prototype.then = monitoredThen;
  // Periodic sampler reads the counter once per second instead of on every .then()
  setInterval(function(){
    var perf = window.__fatePerf = window.__fatePerf || {};
    perf.promiseThenRate = _thenCount;
    perf.promiseThenPeak = Math.max(perf.promiseThenPeak || 0, _thenCount);
    if(_thenCount > 15000){
      var now = Date.now();
      if(now - _warnedAt > 5000){
        _warnedAt = now;
        perf.promiseFloods = (perf.promiseFloods || 0) + 1;
        perf.lastPromiseFloodAt = now;
        console.warn('FATE: Promise flood observed (' + _thenCount + ' .then() in 1s). Run fatePerfReport() for the FPS trace.');
      }
    }
    _thenCount = 0;
  }, 1000);
}
window.fateEnablePromiseMonitor = function(){
  try{ localStorage.setItem('fatePromiseMonitorEnabled', '1'); }catch(e){}
  installFatePromiseMonitor();
  console.warn('FATE: Promise monitor enabled for this session.');
};
(function(){
  const perf = window.__fatePerf = window.__fatePerf || {};
  perf.promiseMonitorEnabled = false;
  try{
    if(localStorage.getItem('fatePromiseMonitorEnabled') === '1') installFatePromiseMonitor();
  }catch(e){}
})();

// rAF flood protection REMOVED — the throttle had an irrecoverable starvation loop:
// once triggered (>500 rAF/s), batching 60 callbacks per frame meant each batch
// re-queued itself, keeping the counter above 200 permanently. The single-rAF-per-frame
// batching starved the browser compositor and locked the game to ~12 FPS.
// The Firebase stats disabling (above) addresses the root flood cause; the
// Promise monitor records whether that flood ever comes back.
const storage = getStorage(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });
setPersistence(auth, browserLocalPersistence).catch(()=>{});

function isElectronShell(){
  try{ return new URLSearchParams(location.search).get('electron') === '1'; }
  catch(e){ return false; }
}
function isElectronExternalAuth(){
  try{ return new URLSearchParams(location.search).get('electronExternalAuth') === '1'; }
  catch(e){ return false; }
}
function electronSessionName(){
  try{ return String(new URLSearchParams(location.search || '').get('electronSession') || 'default'); }
  catch(e){ return 'default'; }
}
function electronExternalAuthConfig(){
  try{
    const params = new URLSearchParams(location.search || '');
    return {
      state:String(params.get('bridgeState') || ''),
      bridgeUrl:String(params.get('bridgeUrl') || '')
    };
  }catch(e){
    return {state:'', bridgeUrl:''};
  }
}
function isMissingRedirectStateError(e){
  const code = String(e?.code || '');
  const msg = String(e?.message || '');
  return code === 'auth/missing-or-invalid-nonce'
    || /missing initial state|sessionStorage is inaccessible|storage-partitioned/i.test(msg);
}
if(!isElectronShell()){
  getRedirectResult(auth).catch(e=>{
    if(isMissingRedirectStateError(e)) return;
    console.warn('Google redirect sign-in result failed', e);
  });
}

function electronStartupDelay(fn, delay){
  if(!isElectronShell()) return fn();
  const run = function(){
    try{
      const result = fn();
      if(result && typeof result.catch === 'function') result.catch(e=>console.warn('Electron online startup task failed', e));
    }catch(e){ console.warn('Electron online startup task failed', e); }
  };
  const timer = window.__fateNativeSetTimeout || window.setTimeout;
  return timer(run, Math.max(0, Number(delay) || 0));
}

function safe(s){ return String(s == null ? '' : s); }
function escapeHtml(s){ return safe(s).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }
function hashCode(str){
  let h = 2166136261;
  for(let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36).toUpperCase().padStart(7,'0').slice(0,7);
}
function makeBaseCode(uid){ return 'FATE-' + hashCode(uid || 'guest'); }
function normalizeUsername(name){ return safe(name).trim().toLowerCase().replace(/\s+/g,' '); }
function isCorruptedSharedUsername(name){
  return /^sic kemper tyrann?us$/.test(normalizeUsername(name));
}
function isLegacyStaleUsername(name){
  const normalized = normalizeUsername(name);
  return normalized === 'poop god' || normalized === 'plyer' || normalized === 'player' || isCorruptedSharedUsername(normalized);
}
function getLocalProfile(){
  try{ if(typeof window.getFateLocalProfile === 'function') return window.getFateLocalProfile() || {}; }catch(e){}
  return window.USER_PROFILE || {};
}
function getLocalUsername(user){
  const p = getLocalProfile();
  const picked = [p.username, p.displayName, user?.displayName]
    .find(name=>safe(name).trim() && !isLegacyStaleUsername(name));
  const fallback = makeBaseCode(user?.uid || p._fateAccountUid || 'guest');
  return safe(picked || fallback).trim().slice(0,24) || fallback;
}
function getLocalBio(){
  const p = getLocalProfile();
  return safe(p.bio || p.status || '').trim().slice(0,240);
}
function getLocalLevel(){ return Number(getLocalProfile().level || 1) || 1; }
function getLocalElo(){ return Number(getLocalProfile().challengerElo || 600) || 600; }
function getLocalRankLabel(){
  try{ if(typeof window.rankName === 'function') return window.rankName(getLocalElo()); }catch(e){}
  return 'Footman';
}
function getLocalPhoto(user){
  try{ if(typeof window.getProfileImgSrc === 'function') return window.getProfileImgSrc() || user?.photoURL || 'blank.png'; }catch(e){}
  const p = getLocalProfile();
  return p.profileImg || p.photoURL || p.pfp || user?.photoURL || 'blank.png';
}
function applyServerRankProfile(profile){
  try{
    if(profile && typeof window.fateApplyServerProfileStats === 'function'){
      window.fateApplyServerProfileStats(profile, {leaderboard:false});
    }
  }catch(e){}
}

const state = {
  app, auth, rtdb, storage,
  user: null,
  profile: null,
  baseCode: null,
  ready: false,
  listeners: new Set(),
  unsubs: []
};

let titleVisibilityObserverInstalled = false;
let lastAuthPanelVisibilitySignature = '';
function titleScreenActive(){
  return !!document.getElementById('s-title')?.classList.contains('active');
}
function updateAuthPanelVisibility(){
  const el = document.getElementById('fate-online-account');
  if(!el) return;
  const shouldShow = titleScreenActive() || !document.getElementById('s-game')?.classList.contains('active');
  const signature = [
    titleScreenActive() ? 'title' : 'other',
    document.getElementById('s-game')?.classList.contains('active') ? 'game' : 'nogame',
    el.parentElement?.id || el.parentElement?.className || 'none',
    shouldShow ? 'shown' : 'hidden'
  ].join('|');
  el.classList.toggle('is-hidden', !shouldShow);
  if(signature !== lastAuthPanelVisibilitySignature && window.scheduleFateCornerDock) {
    lastAuthPanelVisibilitySignature = signature;
    setTimeout(()=>window.scheduleFateCornerDock(), 0);
  }
}

let ephemeralElectronGuestUser = null;
function randomEphemeralGuestToken(){
  try{
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b=>b.toString(16).padStart(2, '0')).join('');
  }catch(e){
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }
}
function getEphemeralMultiplayerGuestUser(){
  if(!isElectronShell()) return null;
  if(auth.currentUser) return null;
  if(ephemeralElectronGuestUser) return ephemeralElectronGuestUser;
  const session = electronSessionName().replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 32) || 'guest';
  ephemeralElectronGuestUser = {
    uid:`guest-${session}-${randomEphemeralGuestToken()}`.slice(0, 96),
    isEphemeralGuest:true,
    isAnonymous:false,
    displayName:'Guest',
    photoURL:'',
    getIdToken:async ()=>''
  };
  return ephemeralElectronGuestUser;
}

let electronAnonymousCleanupInFlight = false;
async function clearPersistedElectronAnonymousUser(user){
  if(!user || !isElectronShell() || !user.isAnonymous || electronAnonymousCleanupInFlight) return false;
  electronAnonymousCleanupInFlight = true;
  try{
    console.info('[FateOnline] Clearing persisted anonymous Electron auth user', {
      uid:user.uid,
      electronSession:electronSessionName()
    });
    try{
      localStorage.removeItem('fateElectronAuthSession');
      localStorage.removeItem('fateElectronAuthUid');
      localStorage.removeItem('fateElectronAuthRefreshedAt');
    }catch(e){}
    await signOut(auth);
    if(typeof window._fateClearActiveAccount === 'function') window._fateClearActiveAccount();
  }catch(e){
    console.warn('Failed to clear persisted anonymous Electron auth user', e);
  }finally{
    electronAnonymousCleanupInFlight = false;
  }
  return true;
}
function installAuthPanelScreenWatcher(){
  if(titleVisibilityObserverInstalled) return;
  titleVisibilityObserverInstalled = true;
  const apply = ()=>updateAuthPanelVisibility();
  const obs = new MutationObserver(apply);
  const watch = ()=>{
    document.querySelectorAll('.screen').forEach(screen=>obs.observe(screen,{attributes:true,attributeFilter:['class']}));
    apply();
  };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch, {once:true});
  else watch();
  window.addEventListener('fate-screen-changed', apply);
  setInterval(()=>{ if(!document.hidden) apply(); }, 5000);
}

function emit(){
  state.listeners.forEach(fn=>{ try{ fn(state); }catch(e){ console.warn('FATE online listener failed', e); } });
  window.dispatchEvent(new CustomEvent('fate-online-auth', { detail: state }));
}
function onAuth(fn){ state.listeners.add(fn); try{ fn(state); }catch(e){} return ()=>state.listeners.delete(fn); }

function localStorageFlag(name){
  try{ return localStorage.getItem(name) === '1'; }catch(e){ return false; }
}
function hostedFlyRuntime(){
  try{ return String(location.hostname || '').toLowerCase() === 'fates-entwined-main.fly.dev'; }catch(e){ return false; }
}
function rtdbDisabledMode(){
  return localStorageFlag('fateRtdbDisabled') || window.FATE_RTDB_DISABLED === true;
}
function rtdbAvailable(){
  return !rtdbDisabledMode() && !!rtdb;
}
function authorityHttpBaseUrl(){
  if(hostedFlyRuntime()) return location.origin.replace(/\/+$/, '');
  try{
    const explicit = String(localStorage.getItem('fateFlyApiUrl') || '').trim();
    if(explicit) return explicit.replace(/\/+$/, '');
  }catch(e){}
  const globalExplicit = String(window.FATE_FLY_API_URL || '').trim();
  if(globalExplicit) return globalExplicit.replace(/\/+$/, '');
  let wsUrl = '';
  try{ wsUrl = String(localStorage.getItem('fateWsAuthorityUrl') || '').trim(); }catch(e){}
  if(!wsUrl) wsUrl = String(window.FATE_WS_AUTHORITY_URL || '').trim();
  if(!wsUrl){
    const host = String(location.hostname || '').toLowerCase();
    if(host === 'fates-entwined-main.fly.dev') return location.origin.replace(/\/+$/, '');
    return 'https://fates-entwined-main.fly.dev';
  }
  return wsUrl.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:').replace(/\/+$/, '');
}
function flyProfilesEnabled(){
  return !!authorityHttpBaseUrl();
}
async function flyApiRequest(path, opts={}){
  const base = authorityHttpBaseUrl();
  if(!base) throw new Error('Fly authority API URL is not configured');
  const headers = {'accept':'application/json'};
  const token = await auth.currentUser?.getIdToken?.().catch(()=> '');
  if(token) headers.authorization = 'Bearer ' + token;
  const method = String(opts.method || 'GET').toUpperCase();
  const init = {method, headers};
  if(opts.body !== undefined){
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(opts.body || {});
  }
  const res = await fetch(base + path, init);
  if(!res.ok){
    const text = await res.text().catch(()=> '');
    throw new Error('Fly authority API failed: ' + res.status + (text ? ' ' + text.slice(0, 160) : ''));
  }
  return await res.json();
}

async function syncPublicProfile(opts={}){
  const user = auth.currentUser;
  if(!user) return null;
  const uid = user.uid;
  if(typeof window._fatePrepareAccountSwitch === 'function'){
    const beforeProfile = getLocalProfile();
    if(beforeProfile && beforeProfile._fateAccountUid && beforeProfile._fateAccountUid !== uid){
      window._fatePrepareAccountSwitch(uid);
    }
  }
  const localForReset = getLocalProfile();
  if(typeof window.fateNormalizeLeaderboardStatsReset === 'function') window.fateNormalizeLeaderboardStatsReset(localForReset);
  if(typeof window.fateResetProfileMatchRecord === 'function') window.fateResetProfileMatchRecord(localForReset);
  const baseCode = makeBaseCode(uid);
  const chosenUsername = getLocalUsername(user);
  const photoURL = getLocalPhoto(user);
  const localProfile = getLocalProfile();
  const localProfileImg = localProfile && typeof localProfile.profileImg === 'object' ? localProfile.profileImg : {};
  if(localProfile && localProfile._fateAccountUid && localProfile._fateAccountUid !== uid){
    console.warn('Blocked public profile sync for mismatched local account profile');
    return null;
  }
  let existingServerRank = null;
  if(!flyProfilesEnabled() && rtdbAvailable()){
    try{ existingServerRank = (await get(ref(rtdb, `publicProfiles/${uid}`))).val() || null; }catch(e){}
  }
  const rankProfile = existingServerRank || {};
  const challengerElo = Number(rankProfile.challengerElo ?? rankProfile.elo ?? getLocalElo()) || 600;
  const challengerWins = Number(rankProfile.challengerWins ?? rankProfile.wins ?? 0) || 0;
  const challengerLosses = Number(rankProfile.challengerLosses ?? rankProfile.losses ?? 0) || 0;
  const humanWins = Number(rankProfile.humanWins ?? 0) || 0;
  const humanLosses = Number(rankProfile.humanLosses ?? 0) || 0;
  const matchesPlayed = Number(rankProfile.matchesPlayed ?? Math.max(challengerWins + challengerLosses, humanWins + humanLosses)) || 0;
  const payload = {
    uid,
    baseCode,
    baseUsername: baseCode,
    chosenUsername,
    displayName: chosenUsername,
    username: chosenUsername,
    usernameLower: normalizeUsername(chosenUsername),
    photoURL,
    profileImg: photoURL,
    level: getLocalLevel(),
    challengerElo,
    challengerWins,
    challengerLosses,
    humanWins,
    humanLosses,
    matchesPlayed,
    profileCropFocusX: localProfile.profileCropFocusX ?? localProfileImg.cropFocusX ?? null,
    profileCropFocusY: localProfile.profileCropFocusY ?? localProfileImg.cropFocusY ?? null,
    profileCropY: localProfile.profileCropY ?? localProfileImg.cropY ?? null,
    profileCropZoom: localProfile.profileCropZoom ?? localProfileImg.cropZoom ?? null,
    rank: getLocalRankLabel(),
    bio: getLocalBio(),
    updatedAt: rtdbAvailable() ? serverTimestamp() : Date.now(),
    schemaVersion: 1,
    leaderboardResetVersion: localProfile.leaderboardResetVersion || '20260711a'
  };
  if(flyProfilesEnabled()){
    const flyPayload = Object.assign({}, payload, {updatedAt:Date.now()});
    try{
      const data = await flyApiRequest(`/api/profiles/${encodeURIComponent(uid)}`, {
        method:'POST',
        body:{uid, profile:flyPayload}
      });
      state.profile = Object.assign({}, flyPayload, data?.profile || {});
      state.baseCode = baseCode;
      applyServerRankProfile(state.profile);
      renderAuthPanel();
      emit();
      return state.profile;
    }catch(e){
      console.warn('Fly public profile sync failed', e);
      if(localStorageFlag('fateRtdbDisabled') || window.FATE_RTDB_DISABLED === true){
        state.profile = flyPayload;
        state.baseCode = baseCode;
        renderAuthPanel();
        emit();
        return state.profile;
      }
    }
  }
  if(!rtdbAvailable()){
    const localOnlyProfile = Object.assign({}, payload, {updatedAt:Date.now(), rtdbDisabled:true});
    state.profile = localOnlyProfile;
    state.baseCode = baseCode;
    renderAuthPanel();
    emit();
    console.warn('[FateOnline] RTDB profile sync skipped because RTDB is disabled and Fly profile sync is unavailable.');
    return state.profile;
  }
  const multiPathUpdate = {};
  Object.keys(payload).forEach(k => {
    if(/^(challengerElo|elo|wins|losses|challengerWins|challengerLosses|humanWins|humanLosses|matchesPlayed|leaderboardResetVersion)$/.test(k)) return;
    multiPathUpdate[`publicProfiles/${uid}/${k}`] = payload[k];
  });
  multiPathUpdate[`friendInviteCodes/${baseCode}`] = uid;
  if(payload.usernameLower) multiPathUpdate[`usernames/${payload.usernameLower}/${uid}`] = true;
  await update(ref(rtdb), multiPathUpdate);
  state.profile = payload;
  state.baseCode = baseCode;
  applyServerRankProfile(payload);
  renderAuthPanel();
  emit();
  return payload;
}

async function getPublicProfileOnline(uid){
  const safeUid = String(uid || '').trim();
  if(!safeUid) return null;
  if(flyProfilesEnabled()){
    const data = await flyApiRequest(`/api/profiles/${encodeURIComponent(safeUid)}`);
    return data?.profile || null;
  }
  if(!rtdbAvailable()) return null;
  return (await get(ref(rtdb, `publicProfiles/${safeUid}`))).val();
}

function renderAuthPanel(){
  installAuthPanelScreenWatcher();
  let el = document.getElementById('fate-online-account');
  if(!el){
    el = document.createElement('div');
    el.id = 'fate-online-account';
    el.className = 'fate-online-account';
    document.body.appendChild(el);
  }
  const user = state.user;
  if(!user){
    el.innerHTML = `<button class="fate-online-signin" onclick="window.fateSignInWithGoogle()"><span class="foa-orb">G</span><span>Sign In</span></button>`;
    updateAuthPanelVisibility();
    return;
  }
  const p = state.profile || {};
  const code = p.baseCode || state.baseCode || makeBaseCode(user.uid);
  el.innerHTML = `
    <div class="foa-main" title="${escapeHtml(code)}">
      <div class="foa-orb" aria-hidden="true">G</div>
      <div class="foa-copy"><div class="foa-kicker">Google Account</div><div class="foa-code">${escapeHtml(code)}</div></div>
      <button class="foa-out" onclick="window.fateSignOut()">Sign Out</button>
    </div>`;
  updateAuthPanelVisibility();
  // Coalesce post-render layout work so renderAuthPanel firing multiple times
  // (which it does on every auth state emit) doesn't queue 4 setTimeouts each time.
  if(_authPanelLayoutScheduled) return;
  _authPanelLayoutScheduled = true;
  setTimeout(function(){
    _authPanelLayoutScheduled = false;
    if(window.positionOnlineAccountBadgeNearTitleProfile) window.positionOnlineAccountBadgeNearTitleProfile();
    if(window.scheduleFateCornerDock) window.scheduleFateCornerDock();
  }, 60);
}
let _authPanelLayoutScheduled = false;

function shouldFallbackToRedirect(e){
  if(isElectronShell()) return false;
  const code = String(e?.code || '');
  const msg = String(e?.message || '');
  return code === 'auth/network-request-failed'
    || code === 'auth/popup-blocked'
    || code === 'auth/popup-closed-by-user'
    || code === 'auth/operation-not-supported-in-this-environment'
    || /Pending promise was never set|network-request-failed|operation-not-supported/i.test(msg);
}

async function signInWithElectronExternalBrowser(){
  const bridge = window.FateElectronAuthBridge;
  if(!bridge || typeof bridge.beginGoogleSignIn !== 'function'){
    throw new Error('Electron external Google sign-in bridge is unavailable');
  }
  if(window.toast) toast('Opening Google sign-in in your browser...');
  const payload = await bridge.beginGoogleSignIn({sessionName:electronSessionName()});
  const credential = GoogleAuthProvider.credential(payload?.idToken || null, payload?.accessToken || null);
  await signInWithCredential(auth, credential);
}

async function postElectronExternalAuthResult(result){
  const config = electronExternalAuthConfig();
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const idToken = credential?.idToken || '';
  const accessToken = credential?.accessToken || '';
  if(!config.bridgeUrl || !config.state) throw new Error('Missing Electron auth bridge parameters');
  if(!idToken && !accessToken) throw new Error('Google did not return a transferable sign-in credential');
  const user = result?.user || auth.currentUser || {};
  const res = await fetch(config.bridgeUrl, {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      state:config.state,
      idToken,
      accessToken,
      email:user.email || '',
      displayName:user.displayName || ''
    })
  });
  if(!res.ok){
    let text = '';
    try{ text = await res.text(); }catch(e){}
    throw new Error('Electron auth bridge failed: ' + res.status + (text ? ' ' + text.slice(0, 120) : ''));
  }
  renderElectronExternalAuthPrompt('complete');
}

function renderElectronExternalAuthPrompt(mode, message){
  if(!isElectronExternalAuth()) return;
  let el = document.getElementById('fate-electron-external-auth');
  if(!el){
    el = document.createElement('div');
    el.id = 'fate-electron-external-auth';
    document.body.appendChild(el);
  }
  const isComplete = mode === 'complete';
  const isError = mode === 'error';
  const title = isComplete ? 'Sign-in complete' : (isError ? 'Sign-in interrupted' : 'Secure Google sign-in');
  const copy = message || (isComplete
    ? 'You can return to Fates Entwined now. The desktop app will finish linking your command profile.'
    : 'Continue with Google in this browser tab. When authorization finishes, your session will be handed back to the desktop app automatically.');
  const buttonText = isError ? 'Try Again' : 'Continue with Google';
  el.innerHTML = `
    <style>
      #fate-electron-external-auth{
        position:fixed;inset:0;z-index:2147483647;display:grid;grid-template-rows:auto 1fr auto;
        min-height:100vh;color:#f4ead2;background:#070910;
        background-image:linear-gradient(180deg,rgba(3,4,8,.38),rgba(3,4,8,.88)),url('optimized/backgrounds/titlscreenbackgrounds_bg1.jpg?v=bg20260510d');
        background-size:cover;background-position:center;font-family:'Crimson Pro',Georgia,serif;overflow:hidden;
      }
      #fate-electron-external-auth *{box-sizing:border-box}
      #fate-electron-external-auth::before{
        content:'';position:absolute;inset:0;pointer-events:none;
        background:linear-gradient(90deg,rgba(0,0,0,.68),transparent 28%,transparent 72%,rgba(0,0,0,.68));
      }
      #fate-electron-external-auth .fea-topbar{
        position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;
        min-height:64px;padding:0 24px;border-bottom:1px solid rgba(201,168,76,.46);
        background:rgba(4,6,11,.88);box-shadow:0 12px 28px rgba(0,0,0,.28);
      }
      #fate-electron-external-auth .fea-brand{
        font-family:'Cinzel',Georgia,serif;color:#d6b76d;font-size:1.08rem;font-weight:700;
        letter-spacing:.18em;text-transform:uppercase;text-shadow:0 0 18px rgba(214,183,109,.25);
      }
      #fate-electron-external-auth .fea-state{
        border:1px solid rgba(201,168,76,.38);color:#d6b76d;background:rgba(0,0,0,.28);
        padding:.45rem .75rem;font-family:'Cinzel',Georgia,serif;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;
      }
      #fate-electron-external-auth .fea-center{
        position:relative;z-index:1;display:grid;place-items:center;padding:36px 18px;
      }
      #fate-electron-external-auth .fea-panel{
        position:relative;width:min(520px,calc(100vw - 32px));padding:30px 32px 28px;
        border:1px solid rgba(214,183,109,.62);background:linear-gradient(180deg,rgba(8,10,17,.96),rgba(3,5,10,.94));
        box-shadow:0 28px 90px rgba(0,0,0,.62),inset 0 0 0 1px rgba(255,246,191,.08);
      }
      #fate-electron-external-auth .fea-panel::before,
      #fate-electron-external-auth .fea-panel::after{
        content:'';position:absolute;width:24px;height:24px;pointer-events:none;border-color:rgba(232,196,82,.86);
      }
      #fate-electron-external-auth .fea-panel::before{left:10px;top:10px;border-left:2px solid;border-top:2px solid}
      #fate-electron-external-auth .fea-panel::after{right:10px;bottom:10px;border-right:2px solid;border-bottom:2px solid}
      #fate-electron-external-auth .fea-kicker{
        margin:0 0 .45rem;color:#5fb5ff;font-family:'Cinzel',Georgia,serif;font-size:.74rem;
        letter-spacing:.22em;text-transform:uppercase;
      }
      #fate-electron-external-auth .fea-title{
        margin:0;color:#f5d77d;font-family:'Cinzel',Georgia,serif;font-size:clamp(1.55rem,4vw,2.25rem);
        line-height:1.05;letter-spacing:.035em;text-transform:uppercase;
      }
      #fate-electron-external-auth .fea-rule{
        height:1px;margin:18px 0;background:linear-gradient(90deg,rgba(201,168,76,.7),rgba(201,168,76,.1));
      }
      #fate-electron-external-auth .fea-copy{
        margin:0;color:#d8cfb8;font-size:1.02rem;line-height:1.55;
      }
      #fate-electron-external-auth .fea-note{
        margin:18px 0 0;padding:.72rem .82rem;border:1px dashed rgba(95,181,255,.28);
        color:#aebee0;background:rgba(4,13,25,.54);font-size:.88rem;line-height:1.45;
      }
      #fate-electron-external-auth .fea-actions{display:flex;align-items:center;gap:.75rem;margin-top:22px}
      #fate-electron-external-auth .fea-google{
        appearance:none;border:1px solid rgba(214,183,109,.82);background:linear-gradient(180deg,#e2c777,#9c7427);
        color:#090b11;font-family:'Cinzel',Georgia,serif;font-size:.82rem;font-weight:800;letter-spacing:.12em;
        text-transform:uppercase;padding:.78rem 1rem;min-height:44px;cursor:pointer;box-shadow:0 0 24px rgba(214,183,109,.16);
      }
      #fate-electron-external-auth .fea-google:hover{filter:brightness(1.08)}
      #fate-electron-external-auth .fea-google:disabled{cursor:wait;filter:saturate(.55) brightness(.82)}
      #fate-electron-external-auth .fea-mark{
        width:44px;height:44px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.16);
        background:rgba(255,255,255,.08);color:#fff;font:700 1.25rem system-ui,sans-serif;
      }
      #fate-electron-external-auth .fea-footer{
        position:relative;z-index:1;padding:0 18px 16px;color:rgba(244,234,210,.42);
        font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;text-align:center;
      }
      @media (max-width:640px){
        #fate-electron-external-auth .fea-topbar{padding:0 14px}
        #fate-electron-external-auth .fea-brand{font-size:.9rem;letter-spacing:.14em}
        #fate-electron-external-auth .fea-state{display:none}
        #fate-electron-external-auth .fea-panel{padding:26px 22px 24px}
        #fate-electron-external-auth .fea-actions{align-items:stretch;flex-direction:column}
        #fate-electron-external-auth .fea-google{width:100%}
      }
    </style>
    <div class="fea-topbar">
      <div class="fea-brand">Fates Entwined</div>
      <div class="fea-state">${isComplete ? 'Linked' : (isError ? 'Retry Required' : 'Account Link')}</div>
    </div>
    <main class="fea-center">
      <section class="fea-panel" aria-live="polite">
        <div class="fea-kicker">Online Command</div>
        <h1 class="fea-title">${escapeHtml(title)}</h1>
        <div class="fea-rule"></div>
        <p class="fea-copy">${escapeHtml(copy)}</p>
        <div class="fea-note">${isComplete ? 'This tab may be closed after the desktop app updates.' : 'Google opens here because the desktop shell cannot reliably host Google OAuth directly.'}</div>
        ${isComplete ? '' : `
          <div class="fea-actions">
            <div class="fea-mark" aria-hidden="true">G</div>
            <button id="fate-electron-external-auth-button" class="fea-google">${escapeHtml(buttonText)}</button>
          </div>`}
      </section>
    </main>
    <div class="fea-footer">Secure browser handoff for the desktop client</div>`;
  if(!isComplete){
    const btn = document.getElementById('fate-electron-external-auth-button');
    if(btn) btn.onclick = async function(){
      btn.disabled = true;
      btn.textContent = 'Signing in';
      try{
        await signIn();
      }catch(e){
        renderElectronExternalAuthPrompt('error', String(e?.message || e || 'Google sign-in failed'));
      }
    };
  }
  if(isError) console.warn('[FateOnline] Electron external auth prompt error', message);
}

async function signIn(){
  if(state.signingIn) return;
  state.signingIn = true;
  try{
    if(isElectronShell() && !isElectronExternalAuth()){
      await signInWithElectronExternalBrowser();
      return;
    }
    const result = await signInWithPopup(auth, provider);
    if(isElectronExternalAuth()){
      await postElectronExternalAuthResult(result);
    }
  }
  catch(e){
    console.error('Google sign-in failed', e);
    if(isElectronExternalAuth()){
      renderElectronExternalAuthPrompt('error', String(e?.message || e || 'Google sign-in failed'));
      return;
    }
    if(isElectronShell()){
      if(window.toast) toast('Google sign-in failed in the external browser.');
      return;
    }
    if(shouldFallbackToRedirect(e)){
      try{
        if(window.toast) toast('Retrying Google sign-in...');
        await signInWithRedirect(auth, provider);
        return;
      }catch(redirectErr){
        console.error('Google redirect sign-in failed', redirectErr);
        if(window.toast) toast('Google sign-in failed. Check Firebase OAuth settings.');
      }
    }
    if(window.toast) toast('Google sign-in failed');
  }
  finally{
    state.signingIn = false;
  }
}
async function signOutNow(){
  const oldUser = auth.currentUser;
  try{
    if(oldUser && !flyProfilesEnabled() && rtdbAvailable()){
      await update(ref(rtdb, `presence/${oldUser.uid}`), { online:false, lastSeen:serverTimestamp() }).catch(()=>{});
    }
    state.unsubs.splice(0).forEach(fn=>{ try{ fn(); }catch(e){} });
    await signOut(auth);
    if(typeof window._fateClearActiveAccount === 'function') window._fateClearActiveAccount();
    state.user = null;
    state.profile = null;
    state.baseCode = null;
    renderAuthPanel();
    emit();
    if(window.toast) toast('Signed out');
  }
  catch(e){ console.error('Sign-out failed', e); if(window.toast) toast('Sign-out failed'); }
}

window.FATE_ONLINE = state;
window.FateOnline = Object.assign(window.FateOnline || {}, {
  app, appCheck, auth, rtdb, storage, ref, child, get, set, update, push, remove, onValue, off, onDisconnect,
  serverTimestamp, query, orderByChild, orderByKey, startAt, equalTo, limitToFirst, limitToLast, runTransaction,
  onChildAdded,
  onAuth, syncPublicProfile, makeBaseCode, normalizeUsername,
  getPublicProfile: getPublicProfileOnline,
  flyApiRequest,
  authorityHttpBaseUrl,
  flyProfilesEnabled,
  rtdbDisabledMode,
  rtdbAvailable,
  getEphemeralMultiplayerGuestUser,
  requireUser(){ const u=auth.currentUser; if(!u){ if(window.toast) toast('Sign in with Google first'); throw new Error('not signed in'); } return u; },
  escapeHtml
});
window.fateSignInWithGoogle = signIn;
window.fateSignOut = signOutNow;

if(isElectronExternalAuth()){
  const installExternalPrompt = ()=>renderElectronExternalAuthPrompt('ready');
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installExternalPrompt, {once:true});
  else installExternalPrompt();
}

async function syncSignedInPresenceAndProfile(user){
  if(!user) return;
  if(flyProfilesEnabled()){
    await syncPublicProfile();
    return;
  }
  if(!rtdbAvailable()){
    await syncPublicProfile();
    return;
  }
  const pRef = ref(rtdb, `presence/${user.uid}`);
  await Promise.all([
    syncPublicProfile(),
    update(pRef, { uid:user.uid, online:true, lastSeen:serverTimestamp() })
  ]);
  onDisconnect(pRef).update({ online:false, lastSeen:serverTimestamp() }).catch(()=>{});
  const poll = setInterval(()=>{
    if(auth.currentUser && !document.hidden && !document.getElementById('s-game')?.classList.contains('active')){
      update(pRef, { online:true, lastSeen:serverTimestamp() }).catch(()=>{});
    }
  }, 60000);
  state.unsubs.push(()=>clearInterval(poll));
}

async function finishSignedInOnlineStartup(user){
  if(!user || auth.currentUser !== user) return;
  if(typeof window._fateStopOfflineSimulations === 'function') window._fateStopOfflineSimulations();
  if(typeof window._fateMigrateIfNeeded === 'function') window._fateMigrateIfNeeded(user.uid);
  if(typeof window._fatePrepareAccountSwitch === 'function') window._fatePrepareAccountSwitch(user.uid);
  else if(typeof window._fateSetActiveUid === 'function') window._fateSetActiveUid(user.uid);

  try{
    if(window.FateCloudSave){
      await window.FateCloudSave.onSignIn(user.uid);
    }
  }catch(e){ console.warn('Cloud data load failed, using local data', e); }
  if(auth.currentUser !== user) return;

  try{
    await syncSignedInPresenceAndProfile(user);
  }catch(e){ console.error('Public profile sync failed', e); }
}

onAuthStateChanged(auth, async user => {
  const previousUser = state.user;
  if(await clearPersistedElectronAnonymousUser(user)) return;
  if(user && isElectronShell() && !user.isAnonymous){
    try{
      console.info('[FateOnline] Keeping persisted Google Electron auth user', {
        uid:user.uid,
        electronSession:electronSessionName()
      });
    }catch(e){}
  }
  state.user = user || null;
  state.ready = true;
  state.profile = null;
  state.baseCode = user ? makeBaseCode(user.uid) : null;
  renderAuthPanel();
  if(user){
    if(isElectronShell()){
      electronStartupDelay(async function(){
        await finishSignedInOnlineStartup(user);
        emit();
      }, 1800);
      return;
    }
    // Stop offline-mode simulation timers — they leak forever otherwise.
    if(typeof window._fateStopOfflineSimulations === 'function') window._fateStopOfflineSimulations();
    // Set per-account storage key and migrate legacy data if needed
    if(typeof window._fateMigrateIfNeeded === 'function') window._fateMigrateIfNeeded(user.uid);
    if(typeof window._fatePrepareAccountSwitch === 'function') window._fatePrepareAccountSwitch(user.uid);
    else if(typeof window._fateSetActiveUid === 'function') window._fateSetActiveUid(user.uid);

    // Load all player data from the active online save backend.
    try{
      if(window.FateCloudSave){
        await window.FateCloudSave.onSignIn(user.uid);
      }
    }catch(e){ console.warn('Cloud data load failed, using local data', e); }

    try{
      await syncSignedInPresenceAndProfile(user);
    }catch(e){ console.error('Public profile sync failed', e); }
  } else {
    state.unsubs.splice(0).forEach(fn=>{ try{fn();}catch(e){} });
    if(window.FateCloudSave) window.FateCloudSave.onSignOut();
    if(previousUser && typeof window._fateClearActiveAccount === 'function') window._fateClearActiveAccount();
  }
  emit();
});

// Keep cloud public profile fresh — only on title screen, not during gameplay.
let _publicProfileSyncTimer = 0;
function schedulePublicProfileSync(delay=150){
  if(!auth.currentUser || document.getElementById('s-game')?.classList.contains('active')) return;
  clearTimeout(_publicProfileSyncTimer);
  _publicProfileSyncTimer = setTimeout(()=>{
    _publicProfileSyncTimer = 0;
    if(auth.currentUser && !document.getElementById('s-game')?.classList.contains('active')) syncPublicProfile().catch(()=>{});
  }, delay);
}
window.addEventListener('focus', ()=>schedulePublicProfileSync(0));
setInterval(()=>{ if(!document.hidden) schedulePublicProfileSync(0); }, 120000);

// Wrap saveProfile so local name/photo changes update public profile quickly.
setTimeout(()=>{
  if(typeof window.saveProfile === 'function' && !window.saveProfile._fateOnlineWrapped){
    const orig = window.saveProfile;
    const wrapped = function(...args){
      const result = orig.apply(this,args);
      schedulePublicProfileSync(250);
      return result;
    };
    wrapped._fateOnlineWrapped = true;
    window.saveProfile = wrapped;
  }
}, 0);
