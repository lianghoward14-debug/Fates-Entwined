// FATES ENTWINED ONLINE ACCOUNT + LOCAL MULTIPLAYER SESSION
//
// Firebase is used only for optional Google account sign-in. Multiplayer uses
// the authoritative Fate server and a separate installation-scoped identity;
// queue registration never waits for or sends a Firebase credential.

const firebaseConfig = {
  apiKey:'AIzaSyByhcqY0Y27hUkvcAtO3mflRwnQCWhv4Yc',
  authDomain:'fates-entwined-41491.firebaseapp.com',
  projectId:'fates-entwined-41491',
  appId:'1:920253472655:web:c9964989ee5cf3b76975fa'
};
let app = null;
let auth = {currentUser:null};
let provider = null;
let firebaseAuthApi = null;
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
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js')
  ]).then(([appApi, authApi])=>{
    firebaseAuthApi = authApi;
    app = appApi.getApps().length ? appApi.getApps()[0] : appApi.initializeApp(firebaseConfig);
    auth = authApi.getAuth(app);
    provider = new authApi.GoogleAuthProvider();
    provider.setCustomParameters({prompt:'select_account'});
    authApi.setPersistence(auth, authApi.browserLocalPersistence).catch(()=>{});
    if(window.FateOnline){
      window.FateOnline.app = app;
      window.FateOnline.auth = auth;
    }
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
  return safe(value.chosenUsername || value.displayName || value.username || value.name || 'Player').trim() || 'Player';
}
function localPhoto(profile){
  const value = profile || {};
  return value.profileImg || value.photoURL || value.pfp || value.img || 'blank.png';
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
  const active = auth.currentUser || guestUser;
  state.profile = buildLocalProfile(active);
  state.baseCode = state.profile.baseCode;
  emit();
  return state.profile;
}
async function getPublicProfile(uid){
  const active = auth.currentUser || guestUser;
  return String(uid || '') === active.uid ? (state.profile || buildLocalProfile(active)) : null;
}
function subscribeProfile(uid, listener){
  let cancelled = false;
  Promise.resolve(getPublicProfile(uid)).then(profile=>{
    if(!cancelled && profile && typeof listener === 'function') listener(profile);
  });
  return ()=>{ cancelled = true; };
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

window.FATE_RTDB_DISABLED = true;
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
  rtdbDisabledMode:()=>true,
  rtdbAvailable:()=>false
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
  if(!response.ok) throw new Error(`Electron auth bridge failed: ${response.status}`);
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
  panel.innerHTML = `<style>
    #fate-electron-external-auth{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:#070910;color:#f4ead2;font-family:Georgia,serif}
    #fate-electron-external-auth .fea-panel{width:min(520px,100%);padding:32px;border:1px solid #c9a84c;background:#0b0e17;box-shadow:0 24px 80px #000}
    #fate-electron-external-auth h1{margin:0 0 14px;color:#f5d77d;font-family:Cinzel,Georgia,serif}
    #fate-electron-external-auth p{line-height:1.5;color:#d8cfb8}
    #fate-electron-external-auth button{border:1px solid #d6b76d;background:#c9a84c;color:#090b11;padding:12px 18px;font-weight:800;cursor:pointer}
  </style><section class="fea-panel"><h1>${complete ? 'Sign-in complete' : (error ? 'Sign-in interrupted' : 'Google account sign-in')}</h1><p>${escapeHtml(message || (complete ? 'Return to Fates Entwined. You may close this tab.' : 'Continue with Google. Your account will be handed back to the desktop game.'))}</p>${complete ? '' : '<button id="fate-electron-external-auth-button">Sign In With Google</button>'}</section>`;
  const button = document.getElementById('fate-electron-external-auth-button');
  if(button) button.onclick = ()=>signInNow().catch(failure=>renderElectronExternalAuthPrompt('error', safe(failure?.message || failure)));
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

async function handleAccountState(account){
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
