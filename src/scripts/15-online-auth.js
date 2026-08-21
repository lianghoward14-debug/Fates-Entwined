// FATES ENTWINED LOCAL ONLINE SESSION
//
// The retired hosted identity/database service is intentionally absent from
// this runtime. Multiplayer uses the authoritative Fate server and a local,
// installation-scoped identity. This module keeps the established FateOnline
// surface available to the existing menus without making online startup depend
// on an external authentication SDK.

const state = {
  user:null,
  profile:null,
  baseCode:null,
  ready:false,
  signingIn:false,
  listeners:new Set(),
  unsubs:[]
};

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
  const name = localName(local);
  return Object.assign({}, local, {
    uid:user.uid,
    baseCode:makeBaseCode(user.uid),
    baseUsername:makeBaseCode(user.uid),
    chosenUsername:name,
    displayName:name,
    username:name,
    usernameLower:normalizeUsername(name),
    photoURL:localPhoto(local),
    profileImg:localPhoto(local),
    level:Number(local.level || 1) || 1,
    challengerElo:Number(local.challengerElo ?? local.elo ?? 600) || 600,
    updatedAt:Date.now(),
    localAuthoritativeSession:true
  });
}

const identity = localIdentityId();
const user = {
  uid:`local-${identity}`.slice(0, 120),
  displayName:'Player',
  isAnonymous:true,
  isLocalSession:true,
  getIdToken:async()=>`session:${identity}`
};
const auth = {currentUser:user};

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
function requireUser(){ return user; }
function getEphemeralMultiplayerGuestUser(){ return user; }
async function syncPublicProfile(){
  state.profile = buildLocalProfile(user);
  state.baseCode = state.profile.baseCode;
  user.displayName = state.profile.displayName;
  emit();
  return state.profile;
}
async function getPublicProfile(uid){
  return String(uid || '') === user.uid ? (state.profile || buildLocalProfile(user)) : null;
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
  const headers = {'accept':'application/json', 'authorization':`Bearer session:${identity}`};
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
state.user = user;
state.profile = buildLocalProfile(user);
state.baseCode = state.profile.baseCode;
state.ready = true;
user.displayName = state.profile.displayName;

window.FATE_ONLINE = state;
window.FateOnline = Object.assign(window.FateOnline || {}, {
  app:null,
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

window.fateSignInWithGoogle = async function(){
  if(window.toast) window.toast('Online play now uses this installation automatically.');
  return user;
};
window.fateSignOut = async function(){
  if(window.toast) window.toast('This installation is already using its local online identity.');
  return user;
};

emit();

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
