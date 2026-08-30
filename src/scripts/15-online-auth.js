// FATES ENTWINED ONLINE ACCOUNT + LOCAL MULTIPLAYER SESSION
//
// Firebase supplies Google account identity. Fly owns account-backed game data
// and authoritative multiplayer; matchmaking still uses a separate installation-
// scoped identity so queue registration never waits for a Firebase token.

const firebaseConfig = {
  apiKey:'AIzaSyByhcqY0Y27hUkvcAtO3mflRwnQCWhv4Yc',
  authDomain:'fates-entwined-41491.firebaseapp.com',
  databaseURL:'https://fates-entwined-41491-default-rtdb.firebaseio.com',
  projectId:'fates-entwined-41491',
  storageBucket:'fates-entwined-41491.firebasestorage.app',
  messagingSenderId:'920253472655',
  appId:'1:920253472655:web:c9964989ee5cf3b76975fa',
  measurementId:'G-WS86STH46J'
};
let app = null;
let auth = {currentUser:null};
let rtdb = null;
let storage = null;
let provider = null;
let firebaseAuthApi = null;
let firebaseDbApi = null;
let firebaseAuthLoadPromise = null;
let firebaseAuthListenerInstalled = false;

const state = {
  user:null,
  profile:null,
  baseCode:null,
  ready:false,
  signingIn:false,
  listeners:new Set(),
  unsubs:[]
};

async function ensureFirebaseAuth(){
  if(firebaseAuthLoadPromise) return firebaseAuthLoadPromise;
  firebaseAuthLoadPromise = Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js')
  ]).then(([appApi, authApi, dbApi])=>{
    firebaseAuthApi = authApi;
    firebaseDbApi = dbApi;
    app = appApi.getApps().length ? appApi.getApps()[0] : appApi.initializeApp(firebaseConfig);
    auth = authApi.getAuth(app);
    rtdb = dbApi.getDatabase(app);
    provider = new authApi.GoogleAuthProvider();
    provider.setCustomParameters({prompt:'select_account'});
    authApi.setPersistence(auth, authApi.browserLocalPersistence).catch(()=>{});
    if(window.FateOnline) Object.assign(window.FateOnline, {
      app,
      auth,
      rtdb,
      storage,
      ref:dbApi.ref,
      child:dbApi.child,
      get:dbApi.get,
      set:dbApi.set,
      update:dbApi.update,
      push:dbApi.push,
      remove:dbApi.remove,
      onValue:dbApi.onValue,
      onChildAdded:dbApi.onChildAdded,
      off:dbApi.off,
      onDisconnect:dbApi.onDisconnect,
      serverTimestamp:dbApi.serverTimestamp,
      query:dbApi.query,
      orderByChild:dbApi.orderByChild,
      orderByKey:dbApi.orderByKey,
      startAt:dbApi.startAt,
      equalTo:dbApi.equalTo,
      limitToFirst:dbApi.limitToFirst,
      limitToLast:dbApi.limitToLast,
      runTransaction:dbApi.runTransaction
    });
    state.app = app;
    state.auth = auth;
    state.rtdb = rtdb;
    state.storage = storage;
    if(!firebaseAuthListenerInstalled){
      firebaseAuthListenerInstalled = true;
      authApi.onAuthStateChanged(auth, handleAccountState);
    }
    return auth;
  }).catch(error=>{
    firebaseAuthLoadPromise = null;
    console.warn('Google account authentication is unavailable', error);
    throw error;
  });
  return firebaseAuthLoadPromise;
}

function safe(value){ return String(value == null ? '' : value); }
function escapeHtml(value){
  return safe(value).replace(/[&<>'"]/g, ch=>({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
  }[ch]));
}
function hashCode(value){
  let hash = 2166136261;
  const text = safe(value);
  for(let i=0;i<text.length;i++){
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(7, '0').slice(0, 7);
}
function makeBaseCode(uid){ return 'FATE-' + hashCode(uid || 'local-player'); }
function normalizeUsername(name){ return safe(name).trim().toLowerCase().replace(/\s+/g, ' '); }
function randomId(){
  try{ if(globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); }catch(_){ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
function localIdentityId(){
  const key = 'fateAuthoritativeInstallationIdentity';
  try{
    let value = safe(localStorage.getItem(key)).replace(/[^A-Za-z0-9_.:@-]/g, '-').slice(0, 80);
    if(!value){
      value = `install-${randomId()}`.replace(/[^A-Za-z0-9_.:@-]/g, '-').slice(0, 80);
      localStorage.setItem(key, value);
    }
    return value;
  }catch(_){
    return `session-${randomId()}`.replace(/[^A-Za-z0-9_.:@-]/g, '-').slice(0, 80);
  }
}
function getLocalProfile(){
  try{
    if(typeof window.getFateLocalProfile === 'function') return window.getFateLocalProfile() || {};
  }catch(_){ }
  return window.USER_PROFILE || {};
}
function localName(profile){
  const value = profile || {};
  return safe(value.username || value.chosenUsername || value.displayName || value.name || 'Player').trim() || 'Player';
}
function localPhoto(profile){
  const value = profile || {};
  const explicit = value.profileImg || value.photoURL || value.pfp || value.img || null;
  if(explicit){
    if((typeof explicit === 'number' || /^\d+$/.test(String(explicit))) && typeof window.PFP_PATH === 'function'){
      return window.PFP_PATH(Number(explicit));
    }
    if(typeof window.resolveProfileImgSrc === 'function'){
      const resolved = window.resolveProfileImgSrc(explicit);
      if(resolved) return resolved;
    }
    if(typeof explicit === 'object') return explicit.src || explicit.url || explicit.path || explicit.dataUrl || 'blank.png';
    return explicit;
  }
  try{
    if(typeof window.getProfileImgSrc === 'function'){
      const resolved = window.getProfileImgSrc();
      if(resolved) return resolved;
    }
  }catch(_){ }
  return 'blank.png';
}
function buildLocalProfile(user){
  const local = getLocalProfile();
  const localHasName = !!safe(local.chosenUsername || local.displayName || local.username || local.name).trim();
  const accountName = safe(user?.displayName || user?.email || '').split('@')[0].trim();
  const name = localHasName ? localName(local) : (accountName || 'Player');
  const localHasPhoto = !!(local.profileImg || local.photoURL || local.pfp || local.img);
  const photo = localHasPhoto ? localPhoto(local) : (user?.photoURL || 'blank.png');
  return Object.assign({}, local, {
    uid:user.uid,
    baseCode:makeBaseCode(user.uid),
    baseUsername:makeBaseCode(user.uid),
    chosenUsername:name,
    displayName:name,
    username:name,
    usernameLower:normalizeUsername(name),
    photoURL:photo,
    profileImg:photo,
    level:Number(local.level || 1) || 1,
    challengerElo:Number(local.challengerElo ?? local.elo ?? 600) || 600,
    updatedAt:Date.now(),
    localAuthoritativeSession:true
  });
}

const identity = localIdentityId();
const guestUser = {
  uid:`local-${identity}`.slice(0, 120),
  displayName:'Player',
  isAnonymous:true,
  isLocalSession:true,
  getIdToken:async()=>`session:${identity}`
};

function emit(){
  state.listeners.forEach(listener=>{
    try{ listener(state); }catch(error){ console.warn('FATE online listener failed', error); }
  });
  try{ window.dispatchEvent(new CustomEvent('fate-online-auth', {detail:state})); }catch(_){ }
}
function onAuth(listener){
  if(typeof listener !== 'function') return ()=>{};
  state.listeners.add(listener);
  try{ listener(state); }catch(_){ }
  return ()=>state.listeners.delete(listener);
}
function requireUser(){
  const active = auth.currentUser;
  if(active) return active;
  if(window.toast) window.toast('Sign in with Google first');
  throw new Error('not signed in');
}
function getEphemeralMultiplayerGuestUser(){ return guestUser; }
async function syncPublicProfile(){
  const active = auth.currentUser;
  if(!active) return null;
  const localProfile = buildLocalProfile(active);
  const rawLocal = getLocalProfile();
  const localImage = rawLocal && typeof rawLocal.profileImg === 'object' ? rawLocal.profileImg : {};
  const payload = {
    uid:active.uid,
    baseCode:localProfile.baseCode,
    baseUsername:localProfile.baseCode,
    chosenUsername:localProfile.chosenUsername,
    displayName:localProfile.displayName,
    username:localProfile.username,
    usernameLower:localProfile.usernameLower,
    photoURL:localProfile.photoURL,
    profileImg:localProfile.profileImg,
    level:Number(localProfile.level || 1) || 1,
    bio:safe(rawLocal.bio || rawLocal.status || '').trim().slice(0, 240),
    profileCropFocusX:rawLocal.profileCropFocusX ?? localImage.cropFocusX ?? null,
    profileCropFocusY:rawLocal.profileCropFocusY ?? localImage.cropFocusY ?? null,
    profileCropY:rawLocal.profileCropY ?? localImage.cropY ?? null,
    profileCropZoom:rawLocal.profileCropZoom ?? localImage.cropZoom ?? null,
    schemaVersion:1,
    localAuthoritativeSession:false
  };
  // Fly owns records/rank and merges only these cosmetic fields. This avoids a
  // stale local or Firebase profile resetting established account data.
  const result = await flyApiRequest(`/api/profiles/${encodeURIComponent(active.uid)}`, {
    method:'POST',
    body:{uid:active.uid, profile:payload}
  });
  state.profile = result?.profile || Object.assign({}, payload, {updatedAt:Date.now()});
  state.user = active;
  state.baseCode = state.profile.baseCode || payload.baseCode;
  // Fly owns account records and Challenger ELO. Apply that same returned
  // profile to the local game profile so Social, title, profile, and in-game
  // rank badges cannot disagree about the signed-in player's rank.
  if(state.profile && typeof window.fateApplyServerProfileStats === 'function'){
    window.fateApplyServerProfileStats(state.profile);
  }
  emit();
  return state.profile;
}
async function getPublicProfile(uid){
  const key = String(uid || '').trim();
  if(!key) return null;
  if(key === auth.currentUser?.uid && state.profile) return state.profile;
  const result = await flyApiRequest(`/api/profiles/${encodeURIComponent(key)}`);
  return result?.profile || null;
}
function subscribeProfile(uid, listener){
  const key = String(uid || '').trim();
  if(!key || typeof listener !== 'function') return ()=>{};
  let stopped = false;
  let timer = 0;
  const refresh = async()=>{
    try{ listener(await getPublicProfile(key)); }catch(_){ }
    if(!stopped) timer = setTimeout(refresh, 15000);
  };
  refresh();
  return ()=>{ stopped = true; if(timer) clearTimeout(timer); };
}
function profileName(profile){ return localName(profile); }
function profilePhoto(profile){ return localPhoto(profile); }
function profilePhotoCropStyle(){ return 'width:100%;height:100%;object-fit:cover;object-position:center 22%;'; }
function authorityHttpBaseUrl(){
  try{
    const explicit = safe(localStorage.getItem('fateFlyApiUrl')).trim();
    if(explicit) return explicit.replace(/\/+$/, '');
  }catch(_){ }
  const configured = safe(window.FATE_FLY_API_URL).trim();
  return (configured || 'https://fates-entwined-main.fly.dev').replace(/\/+$/, '');
}
async function flyApiRequest(route, options={}){
  const accountToken = await auth.currentUser?.getIdToken?.().catch(()=>'');
  const headers = {
    'accept':'application/json',
    'authorization':`Bearer ${accountToken || `session:${identity}`}`
  };
  const init = {method:safe(options.method || 'GET').toUpperCase(), headers};
  if(options.body !== undefined){
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(options.body || {});
  }
  const response = await fetch(authorityHttpBaseUrl() + route, init);
  if(!response.ok){
    const message = await response.text().catch(()=>'');
    throw new Error(`Fate authority API failed: ${response.status}${message ? ` ${message.slice(0, 160)}` : ''}`);
  }
  return response.json();
}

// Compatibility shims are deliberately local and inert. Existing UI modules
// feature-detect the unavailable legacy data transport and remain functional.
function localRef(_database, path=''){ return {path:safe(path), key:safe(path).split('/').filter(Boolean).pop() || ''}; }
function localChild(parent, path=''){ return localRef(null, [parent?.path, path].filter(Boolean).join('/')); }
function emptySnapshot(){ return {exists:()=>false, val:()=>null, key:null, forEach:()=>false}; }
const resolvedWrite = async()=>undefined;
const resolvedRead = async()=>emptySnapshot();
function localPush(parent){ return Object.assign(localChild(parent, `local-${randomId()}`), {set:resolvedWrite}); }
function localOnValue(_ref, callback){
  const timer = setTimeout(()=>{ try{ callback?.(emptySnapshot()); }catch(_){ } }, 0);
  return ()=>clearTimeout(timer);
}
function localOnChildAdded(){ return ()=>{}; }
function localOnDisconnect(){
  return {set:resolvedWrite, update:resolvedWrite, remove:resolvedWrite, cancel:resolvedWrite};
}
async function localTransaction(_ref, updater){
  const value = typeof updater === 'function' ? updater(null) : null;
  return {committed:value !== undefined, snapshot:{...emptySnapshot(), val:()=>value}};
}
function identityQuery(value){ return value; }

// Matchmaking no longer uses RTDB, but the rest of the online game still does.
// Remove the stale migration flag left by older authoritative-client builds so
// Social, cloud saves, records, decks, Store, chat, and parties select RTDB.
try{ localStorage.removeItem('fateRtdbDisabled'); }catch(_){ }
window.FATE_RTDB_DISABLED = false;
state.user = auth.currentUser || null;
state.profile = state.user ? buildLocalProfile(state.user) : null;
state.baseCode = state.profile?.baseCode || null;

window.FATE_ONLINE = state;
window.FateOnline = Object.assign(window.FateOnline || {}, {
  app,
  appCheck:null,
  auth,
  rtdb:null,
  storage:null,
  ref:localRef,
  child:localChild,
  get:resolvedRead,
  set:resolvedWrite,
  update:resolvedWrite,
  push:localPush,
  remove:resolvedWrite,
  onValue:localOnValue,
  onChildAdded:localOnChildAdded,
  off:()=>{},
  onDisconnect:localOnDisconnect,
  serverTimestamp:()=>Date.now(),
  query:identityQuery,
  orderByChild:identityQuery,
  orderByKey:identityQuery,
  startAt:identityQuery,
  equalTo:identityQuery,
  limitToFirst:identityQuery,
  limitToLast:identityQuery,
  runTransaction:localTransaction,
  onAuth,
  requireUser,
  getEphemeralMultiplayerGuestUser,
  syncPublicProfile,
  getPublicProfile,
  subscribeProfile,
  profileName,
  profilePhoto,
  profilePhotoCropStyle,
  makeBaseCode,
  normalizeUsername,
  escapeHtml,
  flyApiRequest,
  authorityHttpBaseUrl,
  flyProfilesEnabled:()=>false,
  rtdbDisabledMode:()=>false,
  rtdbAvailable:()=>!!rtdb
});

function queryFlag(name){
  try{ return new URLSearchParams(location.search || '').get(name) === '1'; }catch(_){ return false; }
}
function isElectronShell(){
  return queryFlag('electron') || /Electron/i.test(navigator.userAgent || '');
}
function isElectronExternalAuth(){ return queryFlag('electronExternalAuth'); }
function electronSessionName(){
  try{ return safe(new URLSearchParams(location.search || '').get('electronSession') || 'default'); }
  catch(_){ return 'default'; }
}
function electronExternalAuthConfig(){
  try{
    const params = new URLSearchParams(location.search || '');
    return {state:safe(params.get('bridgeState')), bridgeUrl:safe(params.get('bridgeUrl'))};
  }catch(_){ return {state:'', bridgeUrl:''}; }
}
function renderAuthPanel(){
  if(isElectronExternalAuth()) return;
  let panel = document.getElementById('fate-online-account');
  if(!panel){
    panel = document.createElement('div');
    panel.id = 'fate-online-account';
    panel.className = 'fate-online-account';
    document.body.appendChild(panel);
  }
  if(!state.user){
    panel.innerHTML = '<button class="fate-online-signin" onclick="window.fateSignInWithGoogle()"><span class="foa-orb">G</span><span>Sign In</span></button>';
  }else{
    const label = escapeHtml(state.user.displayName || state.user.email || state.baseCode || 'Google Account');
    panel.innerHTML = `<div class="foa-main" title="${escapeHtml(state.user.email || state.baseCode || '')}"><div class="foa-orb">G</div><div class="foa-copy"><div class="foa-kicker">Google Account</div><div class="foa-code">${label}</div></div><button class="foa-out" onclick="window.fateSignOut()">Sign Out</button></div>`;
  }
  setTimeout(()=>{
    try{ window.positionOnlineAccountBadgeNearTitleProfile?.(); }catch(_){ }
    try{ window.scheduleFateCornerDock?.(); }catch(_){ }
  }, 0);
}
async function postElectronExternalAuthResult(result){
  const config = electronExternalAuthConfig();
  const credential = firebaseAuthApi.GoogleAuthProvider.credentialFromResult(result);
  const idToken = credential?.idToken || '';
  const accessToken = credential?.accessToken || '';
  if(!config.bridgeUrl || !config.state) throw new Error('Missing Electron auth bridge parameters');
  if(!idToken && !accessToken) throw new Error('Google did not return a transferable sign-in credential');
  const account = result?.user || auth.currentUser || {};
  const response = await fetch(config.bridgeUrl, {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      state:config.state,
      idToken,
      accessToken,
      email:account.email || '',
      displayName:account.displayName || ''
    })
  });
  if(!response.ok){
    let details = '';
    try{ details = await response.text(); }catch(_){ }
    throw new Error('Electron auth bridge failed: ' + response.status + (details ? ' ' + details.slice(0, 120) : ''));
  }
  renderElectronExternalAuthPrompt('complete');
}
async function signInWithElectronExternalBrowser(){
  const bridge = window.FateElectronAuthBridge;
  if(!bridge || typeof bridge.beginGoogleSignIn !== 'function'){
    throw new Error('Electron external Google sign-in bridge is unavailable');
  }
  if(window.toast) window.toast('Opening Google sign-in in your browser...');
  const payload = await bridge.beginGoogleSignIn({sessionName:electronSessionName()});
  const credential = firebaseAuthApi.GoogleAuthProvider.credential(payload?.idToken || null, payload?.accessToken || null);
  return firebaseAuthApi.signInWithCredential(auth, credential);
}
function renderElectronExternalAuthPrompt(mode='ready', message=''){
  if(!isElectronExternalAuth()) return;
  let panel = document.getElementById('fate-electron-external-auth');
  if(!panel){
    panel = document.createElement('div');
    panel.id = 'fate-electron-external-auth';
    document.body.appendChild(panel);
  }
  const complete = mode === 'complete';
  const error = mode === 'error';
  const title = complete ? 'Sign-in complete' : (error ? 'Sign-in interrupted' : 'Secure Google sign-in');
  const copy = message || (complete
    ? 'You can return to Fates Entwined now. The desktop app will finish linking your command profile.'
    : 'Continue with Google in this browser tab. When authorization finishes, your session will be handed back to the desktop app automatically.');
  const buttonText = error ? 'Try Again' : 'Continue with Google';
  panel.innerHTML = `<style>
    #fate-electron-external-auth{position:fixed;inset:0;z-index:2147483647;display:grid;grid-template-rows:auto 1fr auto;min-height:100vh;color:#f4ead2;background:#070910;background-image:linear-gradient(180deg,rgba(3,4,8,.38),rgba(3,4,8,.88)),url('optimized/backgrounds/titlscreenbackgrounds_bg1.jpg?v=bg20260510d');background-size:cover;background-position:center;font-family:'Crimson Pro',Georgia,serif;overflow:hidden}
    #fate-electron-external-auth *{box-sizing:border-box}
    #fate-electron-external-auth::before{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(0,0,0,.68),transparent 28%,transparent 72%,rgba(0,0,0,.68))}
    #fate-electron-external-auth .fea-topbar{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;min-height:64px;padding:0 24px;border-bottom:1px solid rgba(201,168,76,.46);background:rgba(4,6,11,.88);box-shadow:0 12px 28px rgba(0,0,0,.28)}
    #fate-electron-external-auth .fea-brand{font-family:'Cinzel',Georgia,serif;color:#d6b76d;font-size:1.08rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;text-shadow:0 0 18px rgba(214,183,109,.25)}
    #fate-electron-external-auth .fea-state{border:1px solid rgba(201,168,76,.38);color:#d6b76d;background:rgba(0,0,0,.28);padding:.45rem .75rem;font-family:'Cinzel',Georgia,serif;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase}
    #fate-electron-external-auth .fea-center{position:relative;z-index:1;display:grid;place-items:center;padding:36px 18px}
    #fate-electron-external-auth .fea-panel{position:relative;width:min(520px,calc(100vw - 32px));padding:30px 32px 28px;border:1px solid rgba(214,183,109,.62);background:linear-gradient(180deg,rgba(8,10,17,.96),rgba(3,5,10,.94));box-shadow:0 28px 90px rgba(0,0,0,.62),inset 0 0 0 1px rgba(255,246,191,.08)}
    #fate-electron-external-auth .fea-panel::before,#fate-electron-external-auth .fea-panel::after{content:'';position:absolute;width:24px;height:24px;pointer-events:none;border-color:rgba(232,196,82,.86)}
    #fate-electron-external-auth .fea-panel::before{left:10px;top:10px;border-left:2px solid;border-top:2px solid}
    #fate-electron-external-auth .fea-panel::after{right:10px;bottom:10px;border-right:2px solid;border-bottom:2px solid}
    #fate-electron-external-auth .fea-kicker{margin:0 0 .45rem;color:#5fb5ff;font-family:'Cinzel',Georgia,serif;font-size:.74rem;letter-spacing:.22em;text-transform:uppercase}
    #fate-electron-external-auth .fea-title{margin:0;color:#f5d77d;font-family:'Cinzel',Georgia,serif;font-size:clamp(1.55rem,4vw,2.25rem);line-height:1.05;letter-spacing:.035em;text-transform:uppercase}
    #fate-electron-external-auth .fea-rule{height:1px;margin:18px 0;background:linear-gradient(90deg,rgba(201,168,76,.7),rgba(201,168,76,.1))}
    #fate-electron-external-auth .fea-copy{margin:0;color:#d8cfb8;font-size:1.02rem;line-height:1.55}
    #fate-electron-external-auth .fea-note{margin:18px 0 0;padding:.72rem .82rem;border:1px dashed rgba(95,181,255,.28);color:#aebee0;background:rgba(4,13,25,.54);font-size:.88rem;line-height:1.45}
    #fate-electron-external-auth .fea-actions{display:flex;align-items:center;gap:.75rem;margin-top:22px}
    #fate-electron-external-auth .fea-google{appearance:none;border:1px solid rgba(214,183,109,.82);background:linear-gradient(180deg,#e2c777,#9c7427);color:#090b11;font-family:'Cinzel',Georgia,serif;font-size:.82rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;padding:.78rem 1rem;min-height:44px;cursor:pointer;box-shadow:0 0 24px rgba(214,183,109,.16)}
    #fate-electron-external-auth .fea-google:hover{filter:brightness(1.08)}
    #fate-electron-external-auth .fea-google:disabled{cursor:wait;filter:saturate(.55) brightness(.82)}
    #fate-electron-external-auth .fea-mark{width:44px;height:44px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#fff;font:700 1.25rem system-ui,sans-serif}
    #fate-electron-external-auth .fea-footer{position:relative;z-index:1;padding:0 18px 16px;color:rgba(244,234,210,.42);font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;text-align:center}
    @media (max-width:640px){#fate-electron-external-auth .fea-topbar{padding:0 14px}#fate-electron-external-auth .fea-brand{font-size:.9rem;letter-spacing:.14em}#fate-electron-external-auth .fea-state{display:none}#fate-electron-external-auth .fea-panel{padding:26px 22px 24px}#fate-electron-external-auth .fea-actions{align-items:stretch;flex-direction:column}#fate-electron-external-auth .fea-google{width:100%}}
  </style>
  <div class="fea-topbar"><div class="fea-brand">Fates Entwined</div><div class="fea-state">${complete ? 'Linked' : (error ? 'Retry Required' : 'Account Link')}</div></div>
  <main class="fea-center"><section class="fea-panel" aria-live="polite"><div class="fea-kicker">Online Command</div><h1 class="fea-title">${escapeHtml(title)}</h1><div class="fea-rule"></div><p class="fea-copy">${escapeHtml(copy)}</p><div class="fea-note">${complete ? 'This tab may be closed after the desktop app updates.' : 'Google opens here because the desktop shell cannot reliably host Google OAuth directly.'}</div>${complete ? '' : `<div class="fea-actions"><div class="fea-mark" aria-hidden="true">G</div><button id="fate-electron-external-auth-button" class="fea-google">${escapeHtml(buttonText)}</button></div>`}</section></main>
  <div class="fea-footer">Secure browser handoff for the desktop client</div>`;
  if(!complete){
    const button = document.getElementById('fate-electron-external-auth-button');
    if(button) button.onclick = async function(){
      button.disabled = true;
      button.textContent = 'Signing in';
      try{ await signInNow(); }
      catch(failure){ renderElectronExternalAuthPrompt('error', safe(failure?.message || failure || 'Google sign-in failed')); }
    };
  }
  if(error) console.warn('[FateOnline] Electron external auth prompt error', message);
}
async function signInNow(){
  if(state.signingIn) return null;
  state.signingIn = true;
  try{
    await ensureFirebaseAuth();
    if(isElectronShell() && !isElectronExternalAuth()) return await signInWithElectronExternalBrowser();
    const result = await firebaseAuthApi.signInWithPopup(auth, provider);
    if(isElectronExternalAuth()) await postElectronExternalAuthResult(result);
    return result;
  }catch(error){
    if(isElectronExternalAuth()){
      renderElectronExternalAuthPrompt('error', safe(error?.message || error || 'Google sign-in failed'));
      throw error;
    }
    const code = safe(error?.code);
    if(!isElectronShell() && /popup-blocked|operation-not-supported|network-request-failed/.test(code)){
      await firebaseAuthApi.signInWithRedirect(auth, provider);
      return null;
    }
    console.error('Google sign-in failed', error);
    if(window.toast) window.toast('Google sign-in failed');
    throw error;
  }finally{
    state.signingIn = false;
  }
}
async function signOutNow(){
  try{
    await ensureFirebaseAuth();
    const current = auth.currentUser;
    if(current && rtdb && firebaseDbApi){
      await firebaseDbApi.update(firebaseDbApi.ref(rtdb, `presence/${current.uid}`), {
        online:false,
        lastSeen:firebaseDbApi.serverTimestamp()
      }).catch(()=>{});
    }
    state.unsubs.splice(0).forEach(unsub=>{ try{ unsub(); }catch(_){ } });
    await firebaseAuthApi.signOut(auth);
    if(typeof window._fateClearActiveAccount === 'function') window._fateClearActiveAccount();
    state.user = null;
    state.profile = null;
    state.baseCode = null;
    renderAuthPanel();
    emit();
    if(window.toast) window.toast('Signed out');
  }catch(error){
    console.error('Google sign-out failed', error);
    if(window.toast) window.toast('Sign-out failed');
    throw error;
  }
}

window.fateSignInWithGoogle = signInNow;
window.fateSignOut = signOutNow;

if(isElectronExternalAuth()){
  const showPrompt = ()=>renderElectronExternalAuthPrompt('ready');
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showPrompt, {once:true});
  else showPrompt();
}else if(!isElectronShell()){
  ensureFirebaseAuth()
    .then(()=>firebaseAuthApi.getRedirectResult(auth))
    .catch(error=>console.warn('Google redirect sign-in result failed', error));
}

async function syncAccountPresence(account){
  if(!account || !rtdb || !firebaseDbApi) return;
  const presenceRef = firebaseDbApi.ref(rtdb, `presence/${account.uid}`);
  await firebaseDbApi.update(presenceRef, {
    uid:account.uid,
    online:true,
    lastSeen:firebaseDbApi.serverTimestamp()
  });
  firebaseDbApi.onDisconnect(presenceRef).update({
    online:false,
    lastSeen:firebaseDbApi.serverTimestamp()
  }).catch(()=>{});
  const timer = setInterval(()=>{
    if(auth.currentUser?.uid !== account.uid || document.hidden || document.getElementById('s-game')?.classList.contains('active')) return;
    firebaseDbApi.update(presenceRef, {online:true, lastSeen:firebaseDbApi.serverTimestamp()}).catch(()=>{});
  }, 60000);
  state.unsubs.push(()=>clearInterval(timer));
}

async function handleAccountState(account){
  state.unsubs.splice(0).forEach(unsub=>{ try{ unsub(); }catch(_){ } });
  state.user = account || null;
  state.ready = true;
  state.profile = account ? buildLocalProfile(account) : null;
  state.baseCode = state.profile?.baseCode || null;
  renderAuthPanel();
  emit();
  if(account){
    try{
      if(typeof window._fatePrepareAccountSwitch === 'function') window._fatePrepareAccountSwitch(account.uid);
      else if(typeof window._fateSetActiveUid === 'function') window._fateSetActiveUid(account.uid);
      await window.FateCloudSave?.onSignIn?.(account.uid);
      await syncPublicProfile();
      await syncAccountPresence(account);
    }catch(error){ console.warn('Account profile initialization failed', error); }
  }else{
    try{ window.FateCloudSave?.onSignOut?.(); }catch(_){ }
  }
}

// Start persisted-account restoration without holding up the online module
// chain. Matchmaking can load and queue even if account auth is unavailable.
ensureFirebaseAuth().catch(()=>{
  state.ready = true;
  renderAuthPanel();
  emit();
});

// Keep locally edited names and portraits reflected in multiplayer presentation.
setTimeout(()=>{
  if(typeof window.saveProfile !== 'function' || window.saveProfile._fateLocalOnlineWrapped) return;
  const original = window.saveProfile;
  const wrapped = function(...args){
    const result = original.apply(this, args);
    syncPublicProfile().catch(()=>{});
    return result;
  };
  wrapped._fateLocalOnlineWrapped = true;
  window.saveProfile = wrapped;
}, 0);
