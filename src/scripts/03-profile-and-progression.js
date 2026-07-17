// ─── USER-SAVED PRESETS (localStorage) ───
// Users save their custom decks; no hardcoded presets.
let PRESET_DECKS = {};

// ─── PROFILE SYSTEM ───
// Structure designed to be multiplayer-ready — all data is plain JSON that could
// be synced to a backend later. Multiple profiles supported; active profile tracked.
let USER_PROFILE = {
  username: 'Player',
  bio: '',
  profileImg: 'blank.png',// {pfpId}, legacy image data, or default blank icon
  elo: 600,
  wins: 0,
  losses: 0,
  level: 1,
  xp: 0,                  // XP toward next level
  totalXp: 0,             // Lifetime XP (not used for level calc, just stats)
  featuredPresets: [],    // preset IDs to show on profile
  createdAt: Date.now(),
  // ─── CHALLENGER MODE ───
  // Challenger is a progression mode where you earn cards via packs.
  starterChosen: false,   // has the player picked a starter deck?
  ownedCards: {},         // {cardId: count} — owned cards in Challenger mode
  ownedPfps: [],          // [pfpId]
  starlight: 0,           // currency used to buy packs
  unopenedPacks: 0,       // packs not yet opened
  unopenedProfilePacks: 0,// profile picture packs not yet opened
  unopenedFavoredPacks: 0,
  challengerElo: 600,     // separate ELO for challenger ranked
  challengerWins: 0,
  challengerLosses: 0,
  humanWins: 0,
  humanLosses: 0,
  matchesPlayed: 0,
  challengerPresets: {},  // {pid: {name, description, ids}} — decks built in challenger mode
  lastFreePackClaim: 0,   // timestamp
  dailyLoginLastClaimDate: '',
  dailyLoginStreak: 0,
};
const FATE_DEFAULT_USER_PROFILE = JSON.parse(JSON.stringify(USER_PROFILE));
function createDefaultUserProfile() {
  const profile = JSON.parse(JSON.stringify(FATE_DEFAULT_USER_PROFILE));
  profile.createdAt = Date.now();
  return profile;
}

// Current game mode — 'free' (has all cards, no ELO) or 'challenger' (owned cards only, ranked)
let CURRENT_MODE = 'free';
// --- PER-ACCOUNT LOCAL STORAGE ---
// When a Google account is signed in, localStorage keys are suffixed with the UID
// so each account gets its own isolated save data on the same browser.
let _fateActiveUid = null;
const _fateStorageWriteCache = Object.create(null);
const FATE_LEADERBOARD_RESET_VERSION = '20260711a';
const FATE_PROFILE_RECORD_RESET_VERSION = '20260714b';

function _fateStorageKey(base) {
  if (_fateActiveUid) return base + '_' + _fateActiveUid;
  return base;
}

function _fateSetActiveUid(uid) {
  _fateActiveUid = uid || null;
}

function _fateStampProfileForUid(uid) {
  if(uid && USER_PROFILE && typeof USER_PROFILE === 'object') USER_PROFILE._fateAccountUid = uid;
}

function _fateHasAnyUidProfile(exceptUid) {
  const exceptKey = exceptUid ? 'fate_user_profile_' + exceptUid : '';
  try {
    for(let i = 0; i < localStorage.length; i++){
      const key = localStorage.key(i);
      if(key && key.startsWith('fate_user_profile_') && key !== exceptKey) return true;
    }
  } catch(e){}
  return false;
}

function _fateSetJsonStorageIfChanged(key, value) {
  let json = '';
  try { json = JSON.stringify(value); }
  catch(e) { return null; }
  if (_fateStorageWriteCache[key] === json) return false;
  try {
    localStorage.setItem(key, json);
    _fateStorageWriteCache[key] = json;
    return true;
  } catch(e) {
    return null;
  }
}

function _fateReadJsonStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch(e) {
    return null;
  }
}

function fateApplyServerProfileStats(profile, opts={}) {
  if(!profile || typeof profile !== 'object' || !USER_PROFILE) return false;
  const uid = String(profile.uid || '');
  const activeUid = String(_fateActiveUid || window.FATE_ONLINE?.user?.uid || '');
  if(uid && activeUid && uid !== activeUid) return false;
  resetProfileMatchRecord(profile);
  const nextElo = Math.max(0, Math.round(Number(profile.challengerElo ?? profile.elo ?? USER_PROFILE.challengerElo ?? 600) || 600));
  const nextWins = Math.max(0, Math.round(Number(profile.challengerWins ?? profile.wins ?? USER_PROFILE.challengerWins ?? 0) || 0));
  const nextLosses = Math.max(0, Math.round(Number(profile.challengerLosses ?? profile.losses ?? USER_PROFILE.challengerLosses ?? 0) || 0));
  USER_PROFILE.challengerElo = nextElo;
  USER_PROFILE.elo = nextElo;
  USER_PROFILE.challengerWins = nextWins;
  USER_PROFILE.challengerLosses = nextLosses;
  USER_PROFILE.wins = nextWins;
  USER_PROFILE.losses = nextLosses;
  USER_PROFILE.humanWins = Math.max(0, Math.round(Number(profile.humanWins ?? USER_PROFILE.humanWins ?? 0) || 0));
  USER_PROFILE.humanLosses = Math.max(0, Math.round(Number(profile.humanLosses ?? USER_PROFILE.humanLosses ?? 0) || 0));
  USER_PROFILE.matchesPlayed = Math.max(
    nextWins + nextLosses,
    Math.round(Number(profile.matchesPlayed ?? USER_PROFILE.matchesPlayed ?? 0) || 0)
  );
  USER_PROFILE.leaderboardResetVersion = profile.leaderboardResetVersion || FATE_LEADERBOARD_RESET_VERSION;
  USER_PROFILE.serverRankSyncedAt = Date.now();
  if(activeUid) USER_PROFILE._fateAccountUid = activeUid;
  _fateSetJsonStorageIfChanged(_fateStorageKey('fate_user_profile'), USER_PROFILE);
  if(opts.render !== false && typeof safeRenderTitleProfile === 'function') safeRenderTitleProfile();
  if(opts.leaderboard !== false && typeof updateLeaderboardEntry === 'function') updateLeaderboardEntry();
  return true;
}
function normalizeLeaderboardStatsReset(profile) {
  if(!profile || typeof profile !== 'object') return false;
  if(profile.leaderboardResetVersion === FATE_LEADERBOARD_RESET_VERSION) return false;
  profile.elo = 600;
  profile.wins = 0;
  profile.losses = 0;
  profile.challengerElo = 600;
  profile.challengerWins = 0;
  profile.challengerLosses = 0;
  profile.humanWins = 0;
  profile.humanLosses = 0;
  profile.matchesPlayed = 0;
  profile.leaderboardResetVersion = FATE_LEADERBOARD_RESET_VERSION;
  profile.leaderboardResetAt = Date.now();
  return true;
}

function resetProfileMatchRecord(profile) {
  if(!profile || typeof profile !== 'object') return false;
  const hasStaleRecord = !!(
    Number(profile.wins || 0) ||
    Number(profile.losses || 0) ||
    Number(profile.challengerWins || 0) ||
    Number(profile.challengerLosses || 0) ||
    Number(profile.humanWins || 0) ||
    Number(profile.humanLosses || 0) ||
    Number(profile.matchesPlayed || 0)
  );
  if(profile.profileRecordResetVersion === FATE_PROFILE_RECORD_RESET_VERSION && !hasStaleRecord) return false;
  profile.wins = 0;
  profile.losses = 0;
  profile.challengerWins = 0;
  profile.challengerLosses = 0;
  profile.humanWins = 0;
  profile.humanLosses = 0;
  profile.matchesPlayed = 0;
  profile.profileRecordResetVersion = FATE_PROFILE_RECORD_RESET_VERSION;
  profile.profileRecordResetAt = Date.now();
  return true;
}

function resetStoredProfileRecordDataIfNeeded() {
  let changed = false;
  try{
    const profileKeys = [];
    for(let i = 0; i < localStorage.length; i++){
      const key = localStorage.key(i);
      if(!key) continue;
      if(key === 'fate_match_history' || key === 'fate_ai_elo_state'){
        localStorage.removeItem(key);
        changed = true;
      }
      if(key === 'fate_user_profile' || key.startsWith('fate_user_profile_')){
        profileKeys.push(key);
      }
    }
    for(let i = 0; i < localStorage.length; i++){
      const key = localStorage.key(i);
      if(!key || !key.startsWith('fate_account_aux_')) continue;
      try{
        const aux = JSON.parse(localStorage.getItem(key) || '{}');
        if(aux && typeof aux === 'object' && (aux.fate_match_history || aux.fate_ai_elo_state)){
          delete aux.fate_match_history;
          delete aux.fate_ai_elo_state;
          localStorage.setItem(key, JSON.stringify(aux));
          changed = true;
        }
      }catch(e){}
    }
    profileKeys.forEach(key=>{
      const profile = _fateReadJsonStorage(key);
      if(profile && resetProfileMatchRecord(profile)){
        _fateSetJsonStorageIfChanged(key, profile);
        changed = true;
      }
    });
  }catch(e){}
  return changed;
}
function resetStoredLeaderboardDataIfNeeded() {
  const marker = 'fate_leaderboard_reset_' + FATE_LEADERBOARD_RESET_VERSION;
  try{
    if(localStorage.getItem(marker) === '1') return false;
    const keysToRemove = [];
    const profileKeys = [];
    for(let i = 0; i < localStorage.length; i++){
      const key = localStorage.key(i);
      if(!key) continue;
      if(key === 'fate_leaderboard' || key.startsWith('fate_leaderboard_') || key === 'fate_match_history' || key === 'fate_ai_elo_state'){
        keysToRemove.push(key);
      }
      if(key === 'fate_user_profile' || key.startsWith('fate_user_profile_')){
        profileKeys.push(key);
      }
    }
    keysToRemove.forEach(key=>localStorage.removeItem(key));
    for(let i = 0; i < localStorage.length; i++){
      const key = localStorage.key(i);
      if(!key || !key.startsWith('fate_account_aux_')) continue;
      try{
        const aux = JSON.parse(localStorage.getItem(key) || '{}');
        if(aux && typeof aux === 'object'){
          delete aux.fate_match_history;
          delete aux.fate_ai_elo_state;
          localStorage.setItem(key, JSON.stringify(aux));
        }
      }catch(e){}
    }
    profileKeys.forEach(key=>{
      const profile = _fateReadJsonStorage(key);
      if(profile && normalizeLeaderboardStatsReset(profile)){
        _fateSetJsonStorageIfChanged(key, profile);
      }
    });
    localStorage.setItem(marker, '1');
    return true;
  }catch(e){
    return false;
  }
}
function isCorruptedSharedLeaderboardName(name) {
  const normalized = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return /^sic kemper tyrann?us$/.test(normalized);
}

function isStaleHumanLeaderboardName(name) {
  const normalized = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return normalized === 'poop god' || normalized === 'plyer' || normalized === 'player' || isCorruptedSharedLeaderboardName(normalized);
}

function sanitizeLocalLeaderboardEntries(entries) {
  return Array.isArray(entries)
    ? entries.filter(entry=>{
      const name = entry && (entry.username || entry.name);
      return !isStaleHumanLeaderboardName(name);
    })
    : [];
}

// Save current profile under a specific UID key (used during account switches)
function _fateSaveProfileForUid(uid) {
  _fateStampProfileForUid(uid);
  const key = uid ? 'fate_user_profile_' + uid : 'fate_user_profile';
  _fateSetJsonStorageIfChanged(key, USER_PROFILE);
  const pKey = uid ? 'fate_user_presets_' + uid : 'fate_user_presets';
  _fateSetJsonStorageIfChanged(pKey, PRESET_DECKS);
}

function _fatePrepareAccountSwitch(uid) {
  if(_fateActiveUid && _fateActiveUid !== uid) _fateSaveProfileForUid(_fateActiveUid);
  _fateSetActiveUid(uid);
  loadPresetsFromStorage();
  _fateStampProfileForUid(uid);
  if(uid) _fateSetJsonStorageIfChanged(_fateStorageKey('fate_user_profile'), USER_PROFILE);
  if(typeof safeRenderTitleProfile === 'function') safeRenderTitleProfile();
}

// Remove the signed-in player's data from memory on an explicit sign-out. The
// UID-keyed local cache remains intact for their next sign-in, but it must not
// stay visible (or become the source for a different account) in this tab.
function _fateClearActiveAccount() {
  if(_fateActiveUid) _fateSaveProfileForUid(_fateActiveUid);
  _fateSetActiveUid(null);
  USER_PROFILE = createDefaultUserProfile();
  PRESET_DECKS = {};
  if(typeof LEADERBOARD !== 'undefined') LEADERBOARD = [];
  if(typeof PUBLIC_DECKS !== 'undefined') PUBLIC_DECKS = [];
  if(typeof safeRenderTitleProfile === 'function') safeRenderTitleProfile();
}

// On first sign-in, migrate unkeyed localStorage data into the UID-keyed slot
// so existing players keep their progress. Only runs once per UID.
function _fateMigrateIfNeeded(uid) {
  if (!uid) return;
  const marker = 'fate_migrated_' + uid;
  if (localStorage.getItem(marker)) return; // already migrated
  const uidKey = 'fate_user_profile_' + uid;
  if (localStorage.getItem(uidKey)) { // UID slot already has data
    localStorage.setItem(marker, '1');
    return;
  }
  if (localStorage.getItem('fate_cloud_migration_owner_uid') || _fateHasAnyUidProfile(uid)) {
    localStorage.setItem(marker, '1');
    return;
  }
  // Copy unkeyed data into UID slot
  const keys = ['fate_user_profile', 'fate_user_presets', 'fate_leaderboard', 'fate_public_decks'];
  keys.forEach(function(base) {
    const val = localStorage.getItem(base);
    if (val) localStorage.setItem(base + '_' + uid, val);
  });
  localStorage.setItem('fate_cloud_migration_owner_uid', uid);
  localStorage.setItem(marker, '1');
}

window._fateSetActiveUid = _fateSetActiveUid;
window._fateSaveProfileForUid = _fateSaveProfileForUid;
window._fatePrepareAccountSwitch = _fatePrepareAccountSwitch;
window._fateClearActiveAccount = _fateClearActiveAccount;
window._fateMigrateIfNeeded = _fateMigrateIfNeeded;
window._fateReloadProfile = function() { loadPresetsFromStorage(); };
window.fateNormalizeLeaderboardStatsReset = normalizeLeaderboardStatsReset;
window.fateResetProfileMatchRecord = resetProfileMatchRecord;
window.fateResetLocalLeaderboardData = resetStoredLeaderboardDataIfNeeded;
window.fateApplyServerProfileStats = fateApplyServerProfileStats;


const FATE_BACKGROUND_ASSET_VERSION = 'bg20260628a';
function FATE_BACKGROUND_URL(path){
  if(!path || typeof path !== 'string' || path.startsWith('data:')) return path;
  if(path.includes('v=' + FATE_BACKGROUND_ASSET_VERSION)) return path;
  return path + (path.includes('?') ? '&' : '?') + 'v=' + FATE_BACKGROUND_ASSET_VERSION;
}
window.FATE_BACKGROUND_URL = FATE_BACKGROUND_URL;
const TITLE_BG_PATH = n => FATE_BACKGROUND_URL(`optimized/backgrounds/titlscreenbackgrounds_bg${n}.jpg`);
const INGAME_BG_PATH = n => FATE_BACKGROUND_URL(Number(n) === 1 ? 'ingamebackgrouds/igb1.png?v=bg20260705' : `optimized/backgrounds/ingamebackgrouds_igb${n}.jpg`);
const PFP_PATH = (n, shape='circle') => {
  const id = Math.max(1, parseInt(n, 10) || 1);
  return `pfp/pfp${id}.png`;
};
const UI_PICTURE_PATH = name => `uipictures/${name}`;
const SET_VOICELINE_PATH = name => `setvoicelines/${name}.mp3`;
const ALL_PFP_IDS = Array.from({length:80}, (_,i)=>i+1);
const DEFAULT_PROFILE_IMG = 'blank.png';

function getDefaultProfileImgSrc() {
  return DEFAULT_PROFILE_IMG;
}

function normalizeOwnedPfps() {
  const raw = Array.isArray(USER_PROFILE.ownedPfps) ? USER_PROFILE.ownedPfps : [];
  USER_PROFILE.ownedPfps = [...new Set(raw.map(n=>parseInt(n,10)).filter(n=>n>=1 && n<=80))].sort((a,b)=>a-b);
  return USER_PROFILE.ownedPfps;
}

function getUnownedPfpIds() {
  const owned = new Set(normalizeOwnedPfps());
  return ALL_PFP_IDS.filter(id=>!owned.has(id));
}

function resolveProfileImgSrc(imgData, shape='circle') {
  if(!imgData) return null;
  if(typeof imgData === 'string') {
    if(imgData === DEFAULT_PROFILE_IMG || imgData === 'blank.png') return DEFAULT_PROFILE_IMG;
    return imgData;
  }
  if(imgData.dataUrl) return imgData.dataUrl;
  if(imgData.src) return imgData.src;
  if(imgData.pfpId) return PFP_PATH(imgData.pfpId, shape);
  if(imgData.cardImg) return imgData.cardImg;
  if(imgData.cardId) {
    const card = CARDS.find(c=>c.id===imgData.cardId);
    if(card && card.img) return card.img;
  }
  return null;
}

function isLegacyDefaultProfileImg(imgData) {
  if(!imgData) return true;
  if(typeof imgData === 'string') {
    return /(^|\/)pfp1\.png$/i.test(imgData) || /(^|\/)1\.png$/i.test(imgData);
  }
  return !!(imgData && typeof imgData === 'object' && parseInt(imgData.pfpId, 10) === 1 && !imgData.dataUrl && !imgData.cardImg && !imgData.cardId);
}

function grantProfilePictures(pfpIds) {
  if(!pfpIds || !pfpIds.length) return [];
  const owned = normalizeOwnedPfps();
  const ownedSet = new Set(owned);
  const granted = [];
  pfpIds.forEach(id=>{
    if(!ownedSet.has(id)){
      owned.push(id);
      ownedSet.add(id);
      granted.push(id);
    }
  });
  USER_PROFILE.ownedPfps = owned.sort((a,b)=>a-b);
  if(!USER_PROFILE.profileImg || !resolveProfileImgSrc(USER_PROFILE.profileImg)){
    USER_PROFILE.profileImg = getDefaultProfileImgSrc();
  }
  return granted;
}

function removeOwnedPfp(pfpId) {
  pfpId = parseInt(pfpId, 10);
  if(!pfpId) return false;
  const owned = normalizeOwnedPfps();
  const idx = owned.indexOf(pfpId);
  if(idx < 0) return false;
  owned.splice(idx,1);
  if(USER_PROFILE.profileImg && typeof USER_PROFILE.profileImg === 'object' && Number(USER_PROFILE.profileImg.pfpId) === pfpId){
    USER_PROFILE.profileImg = getDefaultProfileImgSrc();
  }
  return true;
}

function generateProfilePack() {
  const available = getUnownedPfpIds();
  const pool = [...available];
  const picks = [];
  while(pool.length && picks.length < 2){
    const idx = Math.floor(Math.random()*pool.length);
    picks.push(pool.splice(idx,1)[0]);
  }
  return picks;
}

// ─── LEVEL SYSTEM ───
// 25 levels total; XP curve grows gradually
const MAX_LEVEL = 25;
function getXpForLevel(lvl){
  // Steeper curve: Lv2=120, Lv5=280, Lv10=700, Lv15=1500, Lv20=2800, Lv25=4800
  if(lvl <= 1) return 0;
  return Math.round(100 + (lvl-1) * 50 + Math.pow(lvl-1, 1.85) * 6);
}

function makeLevelBadgeIcon(svg){
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// Badges — every 5 levels unlocks a new tier
const BADGES = [
  {range:[1,5],   name:'Novice', color:'#7fffa0', glow:'rgba(127,255,160,.5)',
    image:makeLevelBadgeIcon('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#dfffdc"/><stop offset="100%" stop-color="#57c66d"/></linearGradient></defs><path d="M32 9c11 5 17 15 17 26 0 12-7 21-17 24C22 56 15 47 15 35 15 24 21 14 32 9Z" fill="url(#g)" stroke="#1d6a38" stroke-width="3"/><path d="M32 17v31" stroke="#effff1" stroke-width="3" stroke-linecap="round"/><path d="M32 26c-6 1-10 5-12 10" stroke="#effff1" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M32 33c5 1 8 4 10 8" stroke="#effff1" stroke-width="3" stroke-linecap="round" fill="none"/></svg>')},
  {range:[6,10],  name:'Apprentice', color:'#5fb5ff', glow:'rgba(95,181,255,.5)',
    image:makeLevelBadgeIcon('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#eef9ff"/><stop offset="100%" stop-color="#4ba6ff"/></linearGradient></defs><path d="M22 12h20l6 12-16 28L16 24Z" fill="url(#g)" stroke="#1d5fa3" stroke-width="3"/><path d="M22 24h20" stroke="#f8fdff" stroke-width="3"/><path d="M32 12v40" stroke="#f8fdff" stroke-width="3"/></svg>')},
  {range:[11,15], name:'Adept', color:'#c9a84c', glow:'rgba(201,168,76,.6)',
    image:makeLevelBadgeIcon('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fff3bf"/><stop offset="100%" stop-color="#d29b2d"/></linearGradient></defs><circle cx="32" cy="32" r="18" fill="url(#g)" stroke="#7a5413" stroke-width="3"/><path d="M32 10l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1Z" fill="#fff8df" opacity=".92"/></svg>')},
  {range:[16,20], name:'Veteran', color:'#d89adf', glow:'rgba(216,154,223,.6)',
    image:makeLevelBadgeIcon('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ffe6ff"/><stop offset="100%" stop-color="#c77dd6"/></linearGradient></defs><path d="M32 8l17 7v13c0 14-9 24-17 28-8-4-17-14-17-28V15Z" fill="url(#g)" stroke="#7d3d8a" stroke-width="3"/><path d="M23 25h18M23 33h18" stroke="#fff6ff" stroke-width="3" stroke-linecap="round"/><path d="M32 18v22" stroke="#fff6ff" stroke-width="3" stroke-linecap="round"/></svg>')},
  {range:[21,25], name:'Master', color:'#ffd700', glow:'rgba(255,215,0,.8)',
    image:makeLevelBadgeIcon('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fff7c7"/><stop offset="100%" stop-color="#f3b600"/></linearGradient></defs><path d="M14 46h36l-3 8H17Z" fill="#915e00"/><path d="M18 46V20l8 8 6-14 6 14 8-8v26Z" fill="url(#g)" stroke="#996d00" stroke-width="3"/><circle cx="32" cy="16" r="5" fill="#fff4b0" stroke="#996d00" stroke-width="2"/></svg>')}
];

// ─── ELO RANK SYSTEM ───
// Each rank has a custom SVG icon, color, and ELO threshold.
const RANKS = [
  {minElo:0,    name:'Footman',    color:'#cd7f32', bg:'rgba(205,127,50,.15)',
    icon:'<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="10" fill="none" stroke="#cd7f32" stroke-width="2"/><path d="M12 7V17M8 12H16" stroke="#cd7f32" stroke-width="2" stroke-linecap="round"/></svg>'},
  {minElo:800,  name:'Captain-Officer', color:'#c0c0c0', bg:'rgba(192,192,192,.15)',
    icon:'<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="10" fill="none" stroke="#c0c0c0" stroke-width="2"/><path d="M12 4L14 10H20L15 14L17 20L12 16L7 20L9 14L4 10H10Z" fill="#c0c0c0" opacity=".6" transform="scale(.55) translate(9.8,9.8)"/><path d="M8 8L12 4L16 8" fill="none" stroke="#c0c0c0" stroke-width="1.5" stroke-linecap="round"/></svg>'},
  {minElo:1000, name:'Lieutenant at Arms', color:'#4a8ad4', bg:'rgba(74,138,212,.14)',
    icon:'<svg viewBox="0 0 24 24" width="20" height="20"><defs><linearGradient id="rk-lt" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fff8c4"/><stop offset="100%" stop-color="#ffd700"/></linearGradient></defs><circle cx="12" cy="12" r="10" fill="none" stroke="url(#rk-lt)" stroke-width="2"/><path d="M12 3L14 9H20L15 13L17 19L12 15L7 19L9 13L4 9H10Z" fill="url(#rk-lt)" opacity=".7" transform="scale(.5) translate(12,12)"/><path d="M7 6L12 2L17 6" fill="none" stroke="#ffd700" stroke-width="1.5"/></svg>'},
  {minElo:1200, name:'Sergeant of the Guard', color:'#2ec4a6', bg:'rgba(46,196,166,.14)',
    icon:'<svg viewBox="0 0 24 24" width="20" height="20"><defs><linearGradient id="rk-sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#a0e8ff"/><stop offset="100%" stop-color="#70d4ff"/></linearGradient></defs><path d="M12 1L4 5V11C4 17 12 23 12 23S20 17 20 11V5Z" fill="url(#rk-sg)" opacity=".5" stroke="#70d4ff" stroke-width="1.5"/><path d="M12 7L13.5 10.5H17L14 13L15.5 17L12 14.5L8.5 17L10 13L7 10.5H10.5Z" fill="#fff" opacity=".7"/></svg>'},
  {minElo:1400, name:'Commander-General', color:'#e74c3c', bg:'rgba(231,76,60,.14)',
    icon:'<svg viewBox="0 0 24 24" width="20" height="20"><defs><linearGradient id="rk-fm" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#e0c0ff"/><stop offset="50%" stop-color="#b388ff"/><stop offset="100%" stop-color="#9060e0"/></linearGradient></defs><polygon points="12,1 20,9 12,23 4,9" fill="url(#rk-fm)" stroke="#b388ff" stroke-width="1" opacity=".85"/><line x1="4" y1="9" x2="20" y2="9" stroke="#e0c0ff" stroke-width=".5"/><path d="M12 6L13.5 9H16.5L14 11L15 14L12 12L9 14L10 11L7.5 9H10.5Z" fill="#fff" opacity=".6"/></svg>'},
  {minElo:1600, name:'High Marshall', color:'#9b59b6', bg:'rgba(155,89,182,.14)',
    icon:'<svg viewBox="0 0 24 24" width="20" height="20"><defs><linearGradient id="rk-hm" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ffb347"/><stop offset="30%" stop-color="#ff6b6b"/><stop offset="100%" stop-color="#ff4757"/></linearGradient><filter id="rk-hm-glow"><feGaussianBlur stdDeviation="1" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><path d="M12 1L15 7L22 8L17 13L18.5 21L12 17.5L5.5 21L7 13L2 8L9 7Z" fill="url(#rk-hm)" stroke="#ff6b6b" stroke-width="1" filter="url(#rk-hm-glow)"/><circle cx="12" cy="10" r="2.5" fill="#fff" opacity=".4"/><path d="M8 3L12 0L16 3" fill="none" stroke="#ffd700" stroke-width="1"/><path d="M6 4L12 1L18 4" fill="none" stroke="#ff6b6b" stroke-width=".7"/></svg>'}
];

function getRank(elo) {
  let rank = RANKS[0];
  for(const r of RANKS){ if(elo >= r.minElo) rank = r; }
  return rank;
}

function hexToRgb(hex){
  const clean = String(hex||'').replace('#','');
  if(clean.length !== 6) return {r:201,g:168,b:76};
  return {
    r: parseInt(clean.slice(0,2),16),
    g: parseInt(clean.slice(2,4),16),
    b: parseInt(clean.slice(4,6),16)
  };
}

function getRankTierIndex(eloOrRank){
  const rank = typeof eloOrRank === 'object' ? eloOrRank : getRank(eloOrRank);
  return Math.max(0, RANKS.findIndex(r=>r.name===rank.name));
}

function getRankIconIdByName(rankName){
  return ({
    'High Marshall': 1,
    'Commander-General': 2,
    'Sergeant of the Guard': 3,
    'Lieutenant at Arms': 4,
    'Captain-Officer': 5,
    'Footman': 6,
  })[rankName] || null;
}

function renderRankIconMark(eloOrRank, size='md') {
  const rank = typeof eloOrRank === 'object' ? eloOrRank : getRank(eloOrRank);
  const rankIconId = getRankIconIdByName(rank.name);
  if(rankIconId){
    return `<img class="rank-icon-img rank-icon-${rankIconId}" src="rankicons/${rankIconId}.png" alt="${escapeHtml(rank.name)}" loading="eager" decoding="sync" fetchpriority="high" onerror="this.style.display='none';">`;
  }
  return rank.icon;
}

(function preloadRankIconImages(){
  if(typeof document === 'undefined') return;
  if(window.__fateRankIconsPreloaded) return;
  window.__fateRankIconsPreloaded = true;
  [1,2,3,4,5,6].forEach(function(id){
    const href = 'rankicons/' + id + '.png';
    if(document.head && !document.querySelector('link[data-fate-rank-preload="' + id + '"]')){
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = href;
      link.dataset.fateRankPreload = String(id);
      document.head.appendChild(link);
    }
    const img = new Image();
    img.decoding = 'sync';
    img.src = href;
  });
})();

function getRankFrameStyle(elo, scope='icon'){
  const rank = getRank(elo);
  const idx = getRankTierIndex(rank);
  const rgb = hexToRgb(rank.color);
  const glow = 10 + idx * 4;
  const spread = 1 + idx * 0.2;
  const panelBorderWidth = 1.5 + idx * 0.2;
  const iconBorderWidth = 2 + idx * 0.24;
  const innerWidth = scope === 'panel' ? panelBorderWidth : iconBorderWidth;
  const inner = `inset 0 0 0 ${innerWidth.toFixed(2)}px rgba(${rgb.r},${rgb.g},${rgb.b},${(0.28 + idx*0.025).toFixed(2)})`;
  if(scope === 'panel'){
    return `border:${panelBorderWidth.toFixed(2)}px solid ${rank.color}!important;box-shadow:0 12px 30px rgba(0,0,0,.58),0 0 ${glow + 10}px rgba(${rgb.r},${rgb.g},${rgb.b},${(0.14 + idx*0.03).toFixed(2)}),${inner}!important;`;
  }
  return `border:${iconBorderWidth.toFixed(2)}px solid ${rank.color}!important;box-shadow:0 0 ${glow}px rgba(${rgb.r},${rgb.g},${rgb.b},${(0.18 + idx*0.04).toFixed(2)}),0 6px 18px rgba(0,0,0,.38),0 0 0 ${spread.toFixed(1)}px rgba(${rgb.r},${rgb.g},${rgb.b},${(0.05 + idx*0.01).toFixed(2)}),${inner}!important;`;
}

function renderRankBadge(elo, size='md') {
  const rank = getRank(elo);
  const divider = (typeof FateSVG !== 'undefined' && FateSVG && typeof FateSVG.dividerDiamond === 'function')
    ? FateSVG.dividerDiamond(size === 'lg' ? 150 : 110)
    : '';
  const rankName = String(rank.name || '');
  const len = rankName.length;
  const fitClass = len <= 8 ? ' rank-badge-short' : (len <= 14 ? ' rank-badge-medium' : (len <= 20 ? ' rank-badge-long' : ' rank-badge-xlong'));
  const longClass = len > 14 ? ' rank-badge-label-long' : '';
  const labelHtml = `<span class="rank-badge-label${longClass}" data-raw-rank-name="${escapeHtml(rankName)}" title="${escapeHtml(rankName)}">${escapeHtml(rankName)}</span>`;
  return `<span class="rank-badge rank-${size}${fitClass} fate-badge-frame" style="background:${rank.bg};border-color:${rank.color}40;color:${rank.color};">
    <span class="rank-badge-svg">${divider}</span>
    <span class="rank-badge-icon">${renderRankIconMark(rank,size)}</span>${labelHtml}
  </span>`;
}

function getRankProgressInfo(elo){
  const currentRank = getRank(elo);
  const currentIndex = Math.max(0, RANKS.findIndex(r=>r.name===currentRank.name));
  const nextRank = currentIndex < RANKS.length - 1 ? RANKS[currentIndex + 1] : null;
  const currentMin = currentRank.minElo || 0;
  const nextMin = nextRank ? nextRank.minElo : null;
  const tierSpan = nextMin ? Math.max(1, nextMin - currentMin) : 200;
  const pointsIntoTier = Math.max(0, elo - currentMin);
  const progressPct = nextMin ? Math.max(0, Math.min(100, Math.round((pointsIntoTier / tierSpan) * 100))) : 100;
  const pointsToNext = nextMin ? Math.max(0, nextMin - elo) : 0;

  const divisionEntries = new Map();
  (Array.isArray(LEADERBOARD) ? LEADERBOARD : []).forEach(entry=>{
    const entryElo = entry?.elo || 0;
    if(entryElo < currentMin) return;
    if(nextMin != null && entryElo >= nextMin) return;
    const key = entry?.username || `entry_${divisionEntries.size}`;
    if(!divisionEntries.has(key)) divisionEntries.set(key, entry);
  });
  if(USER_PROFILE?.username){
    divisionEntries.set(USER_PROFILE.username, {
      username: USER_PROFILE.username,
      elo,
      wins: USER_PROFILE.challengerWins || 0,
      losses: USER_PROFILE.challengerLosses || 0
    });
  }
  const sortedDivision = [...divisionEntries.values()].sort((a,b)=>(b?.elo||0) - (a?.elo||0));
  let divisionRank = sortedDivision.findIndex(entry=>entry?.username===USER_PROFILE?.username) + 1;
  if(divisionRank <= 0) divisionRank = 1;

  return {
    currentRank,
    nextRank,
    currentMin,
    nextMin,
    tierSpan,
    pointsIntoTier,
    pointsToNext,
    progressPct,
    divisionRank,
    divisionSize: Math.max(1, sortedDivision.length)
  };
}

function getBadgeForLevel(lvl){
  for(const b of BADGES){
    if(lvl >= b.range[0] && lvl <= b.range[1]) return b;
  }
  return BADGES[0];
}

// Award XP and handle level-ups. Returns {xpGained, levelsGained, newLevel}
function awardXp(amount){
  if(amount <= 0) return {xpGained:0, levelsGained:0, newLevel:USER_PROFILE.level};
  let levelsGained = 0;
  USER_PROFILE.totalXp = (USER_PROFILE.totalXp||0) + amount;
  USER_PROFILE.xp = (USER_PROFILE.xp||0) + amount;
  while(USER_PROFILE.level < MAX_LEVEL){
    const needed = getXpForLevel(USER_PROFILE.level + 1);
    if(USER_PROFILE.xp >= needed){
      USER_PROFILE.xp -= needed;
      USER_PROFILE.level++;
      levelsGained++;
    } else break;
  }
  // At max level, XP doesn't accumulate toward next
  if(USER_PROFILE.level >= MAX_LEVEL) USER_PROFILE.xp = 0;
  // NOTE: caller is responsible for calling saveProfile() � removing the
  // save here prevents double-save cascades (recordGameResult calls awardXp
  // then saveProfile, which previously triggered 2x leaderboard + 2x cloud saves).
  return {xpGained:amount, levelsGained, newLevel:USER_PROFILE.level};
}

// Calculate XP for a game outcome. Factors in difficulty / opponent ELO / win.
function calculateXpReward(didWin, opponentElo){
  // Base XP for participation
  let xp = 15;
  // Win bonus
  if(didWin) xp += 30;
  // Scale by opponent ELO (higher opponent = more XP)
  const eloBonus = Math.max(0, Math.round((opponentElo - 800) / 40));
  xp += eloBonus;
  // Floor to prevent zero rewards
  return Math.max(10, xp);
}

// Leaderboard & public decks — local-only for now; when backend is added,
// these will sync with the server instead of localStorage.
let LEADERBOARD = [];  // [{username, elo, wins, losses, profileImg}]
let PUBLIC_DECKS = []; // [{id, username, name, description, ids, faceCardId, displayCardIds, ratings:[], comments:[]}]

function loadPresetsFromStorage() {
  let didForceRankReset = false;
  let didResetAILeaderboard = false;
  const didResetLeaderboardData = resetStoredLeaderboardDataIfNeeded();
  const didResetProfileRecordData = resetStoredProfileRecordDataIfNeeded();
  try {
    const stored = localStorage.getItem(_fateStorageKey('fate_user_presets'));
    PRESET_DECKS = stored ? JSON.parse(stored) : {};
  } catch(e){ PRESET_DECKS = {}; }
  try {
    const parsed = _fateReadJsonStorage(_fateStorageKey('fate_user_profile'));
    const belongsToAnotherUid = parsed && parsed._fateAccountUid && _fateActiveUid && parsed._fateAccountUid !== _fateActiveUid;
    USER_PROFILE = parsed && !belongsToAnotherUid
      ? {...createDefaultUserProfile(), ...parsed}
      : createDefaultUserProfile();
    if(_fateActiveUid) USER_PROFILE._fateAccountUid = _fateActiveUid;
  } catch(e){
    USER_PROFILE = createDefaultUserProfile();
    if(_fateActiveUid) USER_PROFILE._fateAccountUid = _fateActiveUid;
  }
  if(normalizeLeaderboardStatsReset(USER_PROFILE)) didForceRankReset = true;
  if(resetProfileMatchRecord(USER_PROFILE)){
    didForceRankReset = true;
    try { localStorage.setItem(_fateStorageKey('fate_user_profile'), JSON.stringify(USER_PROFILE)); } catch(e){}
  }
  if((USER_PROFILE.elo==null || (USER_PROFILE.elo===1000 && !(USER_PROFILE.wins||0) && !(USER_PROFILE.losses||0)))) USER_PROFILE.elo = 600;
  if((USER_PROFILE.challengerElo==null || (USER_PROFILE.challengerElo===1000 && !(USER_PROFILE.challengerWins||0) && !(USER_PROFILE.challengerLosses||0)))) USER_PROFILE.challengerElo = 600;
  USER_PROFILE.humanWins = Number(USER_PROFILE.humanWins ?? USER_PROFILE.wins ?? 0) || 0;
  USER_PROFILE.humanLosses = Number(USER_PROFILE.humanLosses ?? USER_PROFILE.losses ?? 0) || 0;
  USER_PROFILE.matchesPlayed = Number(USER_PROFILE.matchesPlayed ?? ((Number(USER_PROFILE.challengerWins||0)||0) + (Number(USER_PROFILE.challengerLosses||0)||0) + (Number(USER_PROFILE.wins||0)||0) + (Number(USER_PROFILE.losses||0)||0))) || 0;
  if(!USER_PROFILE.rankReset_20260425){
    USER_PROFILE.elo = 600;
    USER_PROFILE.challengerElo = 600;
    USER_PROFILE.rankReset_20260425 = true;
    didForceRankReset = true;
    try { localStorage.setItem(_fateStorageKey('fate_user_profile'), JSON.stringify(USER_PROFILE)); } catch(e){}
  }
  if(!USER_PROFILE.newPlayerReset_20260425){
    USER_PROFILE.username = 'Player';
    USER_PROFILE.bio = '';
    USER_PROFILE.profileImg = getDefaultProfileImgSrc();
    USER_PROFILE.elo = 600;
    USER_PROFILE.wins = 0;
    USER_PROFILE.losses = 0;
    USER_PROFILE.level = 1;
    USER_PROFILE.xp = 0;
    USER_PROFILE.totalXp = 0;
    USER_PROFILE.featuredPresets = [];
    USER_PROFILE.starterChosen = false;
    USER_PROFILE.ownedCards = {};
    USER_PROFILE.ownedPfps = [];
    USER_PROFILE.starlight = 0;
    USER_PROFILE.unopenedPacks = 0;
    USER_PROFILE.unopenedProfilePacks = 0;
    USER_PROFILE.unopenedFavoredPacks = 0;
    USER_PROFILE.challengerElo = 600;
    USER_PROFILE.challengerWins = 0;
    USER_PROFILE.challengerLosses = 0;
    USER_PROFILE.challengerPresets = {};
    USER_PROFILE.lastFreePackClaim = 0;
    USER_PROFILE.dailyLoginLastClaimDate = '';
    USER_PROFILE.dailyLoginStreak = 0;
    USER_PROFILE.newPlayerReset_20260425 = true;
    LEADERBOARD = [];
    didForceRankReset = true;
    try {
      localStorage.setItem(_fateStorageKey('fate_user_profile'), JSON.stringify(USER_PROFILE));
      localStorage.setItem(_fateStorageKey('fate_leaderboard'), JSON.stringify(LEADERBOARD));
    } catch(e){}
  }
  if(!USER_PROFILE.sergeantPreviewCleanup_20260501 && (USER_PROFILE.highMarshallBoost_20260425 || USER_PROFILE.highMarshallPreview_20260430 || (USER_PROFILE.username === 'Player' && (USER_PROFILE.elo >= 1600 || USER_PROFILE.challengerElo >= 1600)))){
    USER_PROFILE.elo = 1200;
    USER_PROFILE.challengerElo = 1200;
    USER_PROFILE.sergeantPreviewCleanup_20260501 = true;
    didForceRankReset = true;
    try { localStorage.setItem(_fateStorageKey('fate_user_profile'), JSON.stringify(USER_PROFILE)); } catch(e){}
  }
  if(!USER_PROFILE.starlightReset_20260501){
    USER_PROFILE.starlight = 0;
    USER_PROFILE.starlightGift_20260425 = true;
    USER_PROFILE.starlightReset_20260501 = true;
    didForceRankReset = true;
    try { localStorage.setItem(_fateStorageKey('fate_user_profile'), JSON.stringify(USER_PROFILE)); } catch(e){}
  }
  if(isLegacyDefaultProfileImg(USER_PROFILE.profileImg) || !resolveProfileImgSrc(USER_PROFILE.profileImg)){
    USER_PROFILE.profileImg = getDefaultProfileImgSrc();
  }
  try {
    const lb = localStorage.getItem(_fateStorageKey('fate_leaderboard'));
    LEADERBOARD = sanitizeLocalLeaderboardEntries(lb ? JSON.parse(lb) : []);
  } catch(e){ LEADERBOARD = []; }
  if(didResetLeaderboardData || didResetProfileRecordData) LEADERBOARD = [];
  if(!USER_PROFILE.aiLeaderboardReset_20260628){
    LEADERBOARD = Array.isArray(LEADERBOARD)
      ? LEADERBOARD.filter(entry=>!(entry && (entry.isAI || entry.isSimPlayer || String(entry.username || '').startsWith('AI Bot -'))))
      : [];
    USER_PROFILE.aiLeaderboardReset_20260628 = true;
    didResetAILeaderboard = true;
    try {
      for(let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if(k && k.startsWith('fate_monthly_ai_')) localStorage.removeItem(k);
      }
      localStorage.removeItem('fate_ai_sim_cadence');
      localStorage.setItem(_fateStorageKey('fate_user_profile'), JSON.stringify(USER_PROFILE));
    } catch(e){}
  }
  if(didForceRankReset){
    updateLeaderboardEntry();
    saveLeaderboard();
  }
  if(didResetAILeaderboard) saveLeaderboard();
  try {
    const pd = localStorage.getItem(_fateStorageKey('fate_public_decks'));
    PUBLIC_DECKS = pd ? JSON.parse(pd) : [];
  } catch(e){ PUBLIC_DECKS = []; }
}

function savePresetsToStorage() {
  const didWrite = _fateSetJsonStorageIfChanged(_fateStorageKey('fate_user_presets'), PRESET_DECKS);
  if(didWrite === null) toast('Could not save preset');
  if(didWrite && window.FateCloudSave) window.FateCloudSave.savePresets();
}

function saveProfile() {
  _fateStampProfileForUid(_fateActiveUid);
  const didWrite = _fateSetJsonStorageIfChanged(_fateStorageKey('fate_user_profile'), USER_PROFILE);
  updateLeaderboardEntry();
  if(didWrite && window.FateCloudSave) window.FateCloudSave.saveProfile();
}

const DAILY_LOGIN_REWARDS = [
  {day:1, starlight:25, profileBoosters:0},
  {day:2, starlight:0, profileBoosters:1},
  {day:3, starlight:25, profileBoosters:0},
  {day:4, starlight:25, profileBoosters:0},
  {day:5, starlight:0, profileBoosters:1},
  {day:6, starlight:25, profileBoosters:0},
  {day:7, starlight:250, profileBoosters:0},
];

function fateLocalDateKey(ts=Date.now()) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fateDateKeyToLocalNoon(key) {
  const parts = String(key || '').split('-').map(n=>parseInt(n, 10));
  if(parts.length !== 3 || parts.some(n=>!Number.isFinite(n))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
}

function fateDateKeyDiffDays(a, b) {
  const da = fateDateKeyToLocalNoon(a);
  const db = fateDateKeyToLocalNoon(b);
  if(!da || !db) return Infinity;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

function dailyLoginClaimStorageKey(dateKey) {
  return _fateStorageKey('fate_daily_login_claim_' + String(dateKey || fateLocalDateKey()));
}

function readDailyLoginClaim(dateKey) {
  const key = String(dateKey || fateLocalDateKey());
  try {
    const raw = localStorage.getItem(dailyLoginClaimStorageKey(key));
    if(!raw) return null;
    if(raw === '1') return {date:key, day:Math.max(1, Math.min(7, Number(USER_PROFILE?.dailyLoginStreak) || 1))};
    const data = JSON.parse(raw);
    if(!data || data.date !== key) return null;
    const day = Math.max(1, Math.min(7, Number(data.day) || Number(USER_PROFILE?.dailyLoginStreak) || 1));
    return {date:key, day};
  } catch(e){
    return null;
  }
}

function writeDailyLoginClaim(dateKey, day) {
  const key = String(dateKey || fateLocalDateKey());
  const safeDay = Math.max(1, Math.min(7, Number(day) || 1));
  try {
    localStorage.setItem(dailyLoginClaimStorageKey(key), JSON.stringify({
      date:key,
      day:safeDay,
      claimedAt:Date.now()
    }));
  } catch(e){}
}

function getDailyLoginState() {
  if(!USER_PROFILE || typeof USER_PROFILE !== 'object') USER_PROFILE = createDefaultUserProfile();
  const today = fateLocalDateKey();
  const last = USER_PROFILE.dailyLoginLastClaimDate || '';
  const diff = last ? fateDateKeyDiffDays(last, today) : Infinity;
  const storedClaim = readDailyLoginClaim(today);
  let streak = Math.max(0, Number(USER_PROFILE.dailyLoginStreak) || 0);
  let missed = false;
  if(last && diff > 1){
    streak = 0;
    missed = true;
  }
  if(streak >= 7 && diff >= 1) streak = 0;
  if(storedClaim) streak = Math.max(streak, storedClaim.day);
  const claimedToday = diff === 0 || !!storedClaim;
  if(claimedToday && streak < 1) streak = Math.max(1, Number(storedClaim?.day) || 1);
  const nextDay = claimedToday ? Math.max(1, Math.min(7, streak)) : Math.max(1, Math.min(7, streak + 1));
  return {
    today,
    lastClaimDate: last,
    diff,
    streak,
    claimedToday,
    storedClaim,
    missed,
    nextDay,
    reward: DAILY_LOGIN_REWARDS[nextDay - 1]
  };
}

function normalizeDailyLoginProfileState() {
  const state = getDailyLoginState();
  if(state.claimedToday && !state.storedClaim){
    writeDailyLoginClaim(state.today, state.streak || state.nextDay || 1);
    if(USER_PROFILE.dailyLoginStreak !== state.streak){
      USER_PROFILE.dailyLoginStreak = state.streak;
      USER_PROFILE.dailyLoginLastClaimDate = state.today;
      saveProfile();
    }
    return getDailyLoginState();
  }
  if(state.claimedToday && state.storedClaim && state.lastClaimDate !== state.today){
    USER_PROFILE.dailyLoginLastClaimDate = state.today;
    USER_PROFILE.dailyLoginStreak = state.streak;
    saveProfile();
    return getDailyLoginState();
  }
  if(state.missed || USER_PROFILE.dailyLoginStreak !== state.streak){
    USER_PROFILE.dailyLoginStreak = state.streak;
    if(state.missed) saveProfile();
  }
  return state;
}

function claimDailyLoginReward() {
  const state = normalizeDailyLoginProfileState();
  if(state.claimedToday){
    if(typeof toast === 'function') toast('Daily reward already claimed');
    return {claimed:false, state};
  }
  const reward = state.reward || DAILY_LOGIN_REWARDS[0];
  const starlight = Math.max(0, Number(reward.starlight) || 0);
  const boosters = Math.max(0, Number(reward.profileBoosters) || 0);
  if(starlight) USER_PROFILE.starlight = (Number(USER_PROFILE.starlight) || 0) + starlight;
  if(boosters){
    USER_PROFILE.unopenedProfilePacks = (Number(USER_PROFILE.unopenedProfilePacks) || 0) + boosters;
  }
  USER_PROFILE.dailyLoginLastClaimDate = state.today;
  USER_PROFILE.dailyLoginStreak = reward.day;
  writeDailyLoginClaim(state.today, reward.day);
  if(starlight && typeof updateDailyChallengeProgress === 'function') updateDailyChallengeProgress('starlightEarned', starlight, 'add');
  saveProfile();
  if(typeof updateChallengerTopbar === 'function') updateChallengerTopbar();
  if(typeof playSfx === 'function') playSfx('purchase');
  const parts = [];
  if(starlight) parts.push(`+${starlight} Starlight`);
  if(boosters) parts.push(`+${boosters} Profile Booster${boosters === 1 ? '' : 's'}`);
  if(typeof toast === 'function') toast(`Day ${reward.day} claimed: ${parts.join(' + ') || 'Reward claimed'}`);
  return {claimed:true, reward, state:getDailyLoginState()};
}

function dailyLoginRewardText(reward) {
  const starlight = Math.max(0, Number(reward?.starlight) || 0);
  const boosters = Math.max(0, Number(reward?.profileBoosters) || 0);
  const parts = [];
  if(starlight) parts.push(`${starlight} Starlight`);
  if(boosters) parts.push(`${boosters} Profile Booster${boosters === 1 ? '' : 's'}`);
  return parts.join(' + ') || 'Reward';
}

function dailyLoginBackgroundForDate(dateKey) {
  const key = String(dateKey || fateLocalDateKey());
  let seed = 0;
  for(let i = 0; i < key.length; i++) seed = ((seed * 31) + key.charCodeAt(i)) >>> 0;
  const bgIndex = (seed % 16) + 1;
  if(bgIndex === 1) {
    const png = 'ingamebackgrouds/igb1.png?v=bg20260705';
    return typeof FATE_BACKGROUND_URL === 'function' ? FATE_BACKGROUND_URL(png) : png;
  }
  const optimized = `optimized/backgrounds/ingamebackgrouds_igb${bgIndex}.jpg`;
  return typeof FATE_BACKGROUND_URL === 'function' ? FATE_BACKGROUND_URL(optimized) : optimized;
}

function renderDailyLoginPanelHtml(stateOverride) {
  const state = stateOverride || normalizeDailyLoginProfileState();
  const activeDay = state.claimedToday ? state.nextDay : state.nextDay;
  const rewardBg = dailyLoginBackgroundForDate(state.today);
  const rewardBgIndex = (parseInt((String(rewardBg).match(/igb(\d+)/) || [])[1], 10) || 1);
  const rewardBgFallback = `ingamebackgrouds/igb${rewardBgIndex}.png?v=bg20260510d`;
  const tiles = DAILY_LOGIN_REWARDS.map(reward => {
    const claimed = state.claimedToday
      ? reward.day <= state.streak
      : reward.day < state.nextDay;
    const current = reward.day === activeDay;
    const locked = !claimed && !current;
    const starlight = Math.max(0, Number(reward.starlight) || 0);
    const boosters = Math.max(0, Number(reward.profileBoosters) || 0);
    const starlightIconHtml = typeof STARLIGHT_ICON !== 'undefined'
      ? STARLIGHT_ICON
      : '<span class="dlr-starlight-fallback">*</span>';
    const rewardHtml = starlight
      ? `<div class="dlr-reward is-starlight ${starlight >= 100 ? 'is-grand-starlight' : ''}"><b>${starlight}</b><span>Starlight</span></div>`
      : `<div class="dlr-reward is-booster"><b>Profile</b><span>Booster</span></div>`;
    const bonus = boosters && starlight ? '<span class="dlr-bonus">Profile Booster</span>' : '';
    return `
      <div class="dlr-day ${claimed?'is-claimed':''} ${current?'is-current':''} ${locked?'is-locked':''}">
        <div class="dlr-day-top">
          <span>Day ${reward.day}</span>
          <b>${claimed ? 'Claimed' : current ? 'Today' : 'Locked'}</b>
        </div>
        ${rewardHtml}
        ${bonus}
      </div>`;
  }).join('');
  const title = state.claimedToday ? 'Today\'s reward has already been collected.' : 'Your daily reward is ready.';
  const sub = state.claimedToday
    ? 'Come back tomorrow for the next reward in your seven-day streak.'
    : state.missed ? 'Your previous streak reset because a day was missed.' : 'Claim on consecutive days to keep the seven-day streak alive.';
  return `
    <div class="daily-login-shell" style="--daily-login-bg:url('${rewardBg}')">
      <img class="daily-login-bg-img" src="${rewardBg}" alt="" decoding="async" loading="eager" draggable="false" onerror="this.onerror=null;this.src='${rewardBgFallback}';">
      <div class="daily-login-hero">
        <div>
          <div class="daily-login-kicker">Login Rewards</div>
          <div class="daily-login-title">${title}</div>
          <div class="daily-login-sub">${sub}</div>
        </div>
        <div class="daily-login-meter">
          <div class="daily-login-meter-core">
            <span>${state.claimedToday ? state.streak : Math.max(0, state.nextDay - 1)}</span>
            <small>/ 7</small>
          </div>
        </div>
      </div>
      <div class="daily-login-grid">${tiles}</div>
      <div class="daily-login-note">Missing a day resets the streak. Day 2 and Day 5 are Profile Booster days; Day 7 pays out 250 Starlight.</div>
    </div>`;
}

function dailyLoginPanelVisible() {
  const modal = document.getElementById('modal');
  return !!(modal && modal.classList && modal.classList.contains('on') && document.querySelector('#modal .modal.daily-login-modal'));
}

function showDailyLoginPanel() {
  if(typeof showModal !== 'function') return false;
  const state = normalizeDailyLoginProfileState();
  if(typeof resetModalChrome === 'function') resetModalChrome();
  showModal('Daily Login Rewards', renderDailyLoginPanelHtml(state), []);
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox) {
    modalBox.classList.add('daily-login-modal');
    modalBox.style.setProperty('--daily-login-bg', `url('${dailyLoginBackgroundForDate(state.today)}')`);
  }
  const acts = document.getElementById('modal-acts');
  if(!acts) return dailyLoginPanelVisible();
  acts.innerHTML = '';
  const close = document.createElement('button');
  close.className = 'btn sm';
  close.textContent = 'Close';
  close.onclick = closeModal;
  if(!state.claimedToday){
    const claim = document.createElement('button');
    claim.className = 'btn sm pri daily-login-claim-btn';
    const reward = state.reward || DAILY_LOGIN_REWARDS[0];
    claim.textContent = `Claim ${dailyLoginRewardText(reward)}`;
    claim.onclick = function(){
      claimDailyLoginReward();
      showDailyLoginPanel();
    };
    acts.appendChild(claim);
  } else {
    const claimed = document.createElement('button');
    claimed.className = 'btn sm daily-login-claimed-btn';
    claimed.textContent = 'Already Collected Today';
    claimed.disabled = true;
    acts.appendChild(claimed);
  }
  acts.appendChild(close);
  document.getElementById('modal')?.classList.add('on');
  return dailyLoginPanelVisible();
}

function refreshDailyLoginPanelIfOpen() {
  const modal = document.getElementById('modal');
  const modalBox = document.querySelector('#modal .modal.daily-login-modal');
  if(!modal || !modalBox || !modal.classList || !modal.classList.contains('on')) return;
  showDailyLoginPanel();
}

function handleFateChatCommand(text) {
  const cmd = String(text || '').trim().toLowerCase();
  const fateIconMatch = cmd.match(/^\/fateicon\s*(20|1[0-9]|[1-9])$/);
  if(fateIconMatch){
    const variant = Number(fateIconMatch[1]);
    window.__fateFateIconVariant = variant;
    try { localStorage.setItem('fate_icon_variant', String(variant)); } catch(e) {}
    if(typeof toast === 'function') toast('Fate icon design ' + variant + ' selected.');
    if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function') {
      window.FateMatchRendererAdapter.scheduleRender('fate-icon-style');
    } else if(typeof renderGame === 'function') {
      renderGame({board:true, hand:true});
    }
    return true;
  }
  if(cmd === '/logincheck'){
    showDailyLoginPanel();
    return true;
  }
  return false;
}

function checkDailyLoginOnStartup(options) {
  options = options || {};
  const forcePrompt = !!options.force;
  if(window.__fateDailyLoginPromptedThisSession && !forcePrompt) return;
  const startupOverlayActive = function(){
    if(window.__fateStartupLoadingFinished) return false;
    if(window.__fateStartupLoadingActive) return true;
    const overlay = document.getElementById('fate-loading-screen');
    return !!(overlay && !overlay.classList.contains('is-hiding') && !overlay.classList.contains('fate-loading-assets-done'));
  };
  const openPrompt = function(delay, opts){
    if(window.__fateDailyLoginPromptedThisSession && !forcePrompt) return;
    const immediate = !!(opts && opts.immediate);
    const attempt = Math.max(0, Number(opts && opts.attempt) || 0);
    const retry = function(nextDelay){
      if((window.__fateDailyLoginPromptedThisSession && !forcePrompt) || attempt >= 48) return;
      setTimeout(function(){ openPrompt(0, {immediate:true, attempt:attempt + 1}); }, nextDelay);
    };
    const run = function(){
      const modal = document.getElementById('modal');
      const modalReady = !!(modal && document.getElementById('modal-acts') && typeof showModal === 'function');
      if(document.readyState === 'loading' || !modalReady) {
        retry(250);
        return;
      }
      if(startupOverlayActive()) {
        retry(350);
        return;
      }
      const modalOpen = !!(modal && modal.classList && modal.classList.contains('on'));
      if(modalOpen && !dailyLoginPanelVisible()) {
        retry(1200);
        return;
      }
      try {
        normalizeDailyLoginProfileState();
      } catch(e) {}
      try {
        const opened = (typeof showDailyLoginPanel === 'function') && showDailyLoginPanel() !== false && dailyLoginPanelVisible();
        if(opened) {
          window.__fateDailyLoginPromptedThisSession = true;
          return;
        }
      } catch(e) {
        if(window.console && typeof console.warn === 'function') console.warn('[Fate] Daily login prompt failed; retrying.', e);
      }
      retry(350);
    };
    if(immediate) {
      run();
      return;
    }
    setTimeout(function(){
      requestAnimationFrame(run);
    }, Number.isFinite(delay) ? delay : 450);
  };
  const startupLoadingActive = startupOverlayActive();
  if(startupLoadingActive) {
    let startupSettled = false;
    const onStartupFinished = function(){
      if(startupSettled) return;
      startupSettled = true;
      window.removeEventListener('fate-startup-loading-finished', onStartupFinished);
      openPrompt(0, {immediate:true});
    };
    window.addEventListener('fate-startup-loading-finished', onStartupFinished, {once:true});
    setTimeout(onStartupFinished, 6500);
    return;
  }
  const cloudPending = !!(window.__fateCloudLoadingActive || (window._fateCloudUid && !window._fateCloudReady));
  if(!cloudPending) {
    openPrompt(0, {immediate:true});
    return;
  }
  let settled = false;
  const settle = function(delay){
    if(settled) return;
    settled = true;
    window.removeEventListener('fate-cloud-ready', onCloudReady);
    window.removeEventListener('fate-online-auth', onAuthReady);
    openPrompt(delay);
  };
  const onCloudReady = function(){
    settle(0);
  };
  const onAuthReady = function(e){
    if(e && e.detail && e.detail.ready && !e.detail.user) settle(0);
  };
  window.addEventListener('fate-cloud-ready', onCloudReady);
  window.addEventListener('fate-online-auth', onAuthReady);
  setTimeout(function(){ settle(0); }, 4300);
}

window.addEventListener('fate-cloud-ready', function(){
  try {
    normalizeDailyLoginProfileState();
    refreshDailyLoginPanelIfOpen();
  } catch(e) {}
});

let _dailyLoginLastPromptedAuthUid = '';
window.addEventListener('fate-online-auth', function(e){
  const user = e && e.detail && e.detail.user;
  const uid = user && user.uid ? String(user.uid) : '';
  if(!uid) {
    _dailyLoginLastPromptedAuthUid = '';
    return;
  }
  if(_dailyLoginLastPromptedAuthUid === uid) return;
  _dailyLoginLastPromptedAuthUid = uid;
  window.__fateDailyLoginPromptedThisSession = false;
  const promptAfterLogin = function(){
    if(typeof checkDailyLoginOnStartup === 'function') checkDailyLoginOnStartup({force:true, source:'auth-login'});
  };
  const cloudPending = !!(window.__fateCloudLoadingActive || (window._fateCloudUid && !window._fateCloudReady));
  if(cloudPending) {
    let settled = false;
    const settle = function(){
      if(settled) return;
      settled = true;
      window.removeEventListener('fate-cloud-ready', settle);
      promptAfterLogin();
    };
    window.addEventListener('fate-cloud-ready', settle, {once:true});
    setTimeout(settle, 5000);
    return;
  }
  setTimeout(promptAfterLogin, 250);
});

window.addEventListener('storage', function(e){
  if(!e || !e.key || e.key.indexOf('fate_daily_login_claim_') < 0) return;
  refreshDailyLoginPanelIfOpen();
});

window.DAILY_LOGIN_REWARDS = DAILY_LOGIN_REWARDS;
window.getDailyLoginState = getDailyLoginState;
window.claimDailyLoginReward = claimDailyLoginReward;
window.showDailyLoginPanel = showDailyLoginPanel;
window.handleFateChatCommand = handleFateChatCommand;
window.checkDailyLoginOnStartup = checkDailyLoginOnStartup;

// Online rebuild bridge: expose the local browser profile through accessors only.
// This keeps local/offline profile data separate from Google/cloud data while
// letting the online layer mirror chosen display name, bio, level, rank, and pfp.
window.getFateLocalProfile = function(){ return USER_PROFILE; };
window.getFateCurrentMode = function(){ return CURRENT_MODE; };
window.setFateCurrentMode = function(mode){
  CURRENT_MODE = String(mode || 'free');
  return CURRENT_MODE;
};
window.requestFateOnlineProfileSync = function(){
  try{
    if(window.FateOnline && typeof window.FateOnline.syncPublicProfile === 'function'){
      window.FateOnline.syncPublicProfile().catch(()=>{});
    }
  }catch(e){}
};

function saveLeaderboard() {
  LEADERBOARD = sanitizeLocalLeaderboardEntries(LEADERBOARD);
  _fateSetJsonStorageIfChanged(_fateStorageKey('fate_leaderboard'), LEADERBOARD);
}

function savePublicDecks() {
  const didWrite = _fateSetJsonStorageIfChanged(_fateStorageKey('fate_public_decks'), PUBLIC_DECKS);
  if(didWrite && window.FateCloudSave) window.FateCloudSave.savePublicDecks();
}

function updateLeaderboardEntry() {
  if(normalizeLeaderboardStatsReset(USER_PROFILE)) {
    _fateSetJsonStorageIfChanged(_fateStorageKey('fate_user_profile'), USER_PROFILE);
  }
  const onlineUid = window.FATE_ONLINE?.user?.uid || _fateActiveUid || '';
  const onlineProfile = window.FATE_ONLINE?.profile || {};
  const baseCode = window.FATE_ONLINE?.baseCode || onlineProfile.baseCode || '';
  const entry = {
    uid: onlineUid || undefined,
    baseCode: baseCode || undefined,
    username: USER_PROFILE.username,
    name: USER_PROFILE.username,
    elo: USER_PROFILE.challengerElo || 600,
    wins: USER_PROFILE.challengerWins || 0,
    losses: USER_PROFILE.challengerLosses || 0,
    challengerWins: USER_PROFILE.challengerWins || 0,
    challengerLosses: USER_PROFILE.challengerLosses || 0,
    humanWins: USER_PROFILE.humanWins || 0,
    humanLosses: USER_PROFILE.humanLosses || 0,
    matchesPlayed: USER_PROFILE.matchesPlayed || 0,
    level: USER_PROFILE.level,
    profileImg: USER_PROFILE.profileImg,
    leaderboardResetVersion: FATE_LEADERBOARD_RESET_VERSION
  };
  const normalizedName = String(USER_PROFILE.username || '').trim().toLowerCase();
  LEADERBOARD = LEADERBOARD.filter(e=>{
    if(!e) return false;
    if(onlineUid && e.uid === onlineUid) return false;
    return String(e.username || e.name || '').trim().toLowerCase() !== normalizedName;
  });
  const idx = LEADERBOARD.findIndex(e=>onlineUid ? e.uid===onlineUid : e.username===USER_PROFILE.username);
  if(idx>=0) LEADERBOARD[idx] = entry;
  else LEADERBOARD.push(entry);
  saveLeaderboard();
}

// ─── ELO SYSTEM ───
// Standard ELO formula. K-factor of 32 for reasonable movement.
function applyMinimumEloDelta(rawChange, didWin) {
  let change = Math.round(Number(rawChange) || 0);
  if(didWin && change < 1) change = 1;
  if(!didWin && change > -1) change = -1;
  return change;
}
window.applyMinimumEloDelta = applyMinimumEloDelta;

function calculateElo(playerElo, opponentElo, didWin) {
  const K = 32;
  const expected = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
  const actual = didWin ? 1 : 0;
  const change = applyMinimumEloDelta(K * (actual - expected), didWin);
  return Math.max(0, Math.round(playerElo + change));
}

function recordGameResult(didWin, opponentElo=1000) {
  const newElo = calculateElo(USER_PROFILE.elo, opponentElo, didWin);
  const change = newElo - USER_PROFILE.elo;
  USER_PROFILE.elo = newElo;
  if(didWin) USER_PROFILE.wins++;
  else USER_PROFILE.losses++;
  // XP reward
  const xpAmount = calculateXpReward(didWin, opponentElo);
  const xpResult = awardXp(xpAmount);
  saveProfile();
  return {eloChange:change, xpGained:xpResult.xpGained, levelsGained:xpResult.levelsGained, newLevel:xpResult.newLevel};
}

function getCardOrderNumber(card){
  const img = String(card?.img || '');
  const m = img.match(/(\d+)/);
  if(m) return parseInt(m[1],10);
  const idm = String(card?.id || '').match(/(\d+)/);
  if(idm) return parseInt(idm[1],10);
  return 9999;
}

function sortCardsByArtNumber(cards){
  return [...cards].sort((a,b)=>{
    const an = getCardOrderNumber(a);
    const bn = getCardOrderNumber(b);
    if(an !== bn) return an - bn;
    return String(a?.name||'').localeCompare(String(b?.name||''));
  });
}

function getDeckThemeOptions(){
  return [
    'Negation',
    'Resource Disruption',
    'Hybrid',
    'Mobility',
    'Concentrated Fate',
    'Affiliation',
    'Dispersed Fate',
    'Supporters',
    'Disruption',
    'Reactive',
    'Fate Leech',
    'Deception',
    'Tempo',
    'Combo',
    'Speed',
    'Control'
  ];
}

function normalizeDeckTheme(theme, fallback='Hybrid'){
  const raw = String(theme || '').trim();
  const aliases = {
    Affliation:'Affiliation',
    affiliation:'Affiliation',
    Custom:'Hybrid',
    Challenger:'Hybrid',
    Imported:'Hybrid',
    Eventide:'Concentrated Fate',
    Reality:'Fate Leech',
    'Third Great War':'Affiliation',
    'Expanded Worlds':'Supporters'
  };
  const candidate = aliases[raw] || aliases[raw.toLowerCase()] || raw || fallback;
  const opts = getDeckThemeOptions();
  return opts.includes(candidate) ? candidate : (opts.includes(fallback) ? fallback : 'Hybrid');
}

function deckThemeFitClass(theme){
  const len = String(theme || '').length;
  return len <= 8 ? ' deck-theme-short' : (len <= 12 ? ' deck-theme-medium' : (len <= 17 ? ' deck-theme-long' : ' deck-theme-xlong'));
}

function renderDeckThemeSelector(selectedTheme, inputId='deck-theme-inp'){
  const selected = normalizeDeckTheme(selectedTheme);
  const options = getDeckThemeOptions().map(theme=>{
    const isSelected = theme === selected;
    return `<button type="button" class="deck-theme-option${isSelected ? ' is-selected' : ''}" data-theme-value="${escapeHtml(theme)}" role="option" aria-selected="${isSelected ? 'true' : 'false'}">${escapeHtml(theme)}</button>`;
  }).join('');
  return `<label class="deck-theme-field"><span class="deck-theme-label-text">Deck Theme</span><span class="deck-theme-select-wrap"><input type="hidden" id="${escapeHtml(inputId)}" class="deck-theme-select" value="${escapeHtml(selected)}"><button type="button" class="deck-theme-trigger" aria-haspopup="listbox" aria-expanded="false"><span class="deck-theme-value">${escapeHtml(selected)}</span><span class="deck-theme-arrow" aria-hidden="true">?</span></button><span class="deck-theme-menu" role="listbox">${options}</span></span></label>`;
}

if(typeof document !== 'undefined' && !window.__deckThemeDropdownBound) {
  window.__deckThemeDropdownBound = true;
  document.addEventListener('click', function(ev){
    const trigger = ev.target && ev.target.closest ? ev.target.closest('.deck-theme-trigger') : null;
    const option = ev.target && ev.target.closest ? ev.target.closest('.deck-theme-option') : null;
    const closeOthers = function(except){
      document.querySelectorAll('.deck-theme-select-wrap.is-open').forEach(function(wrap){
        if(wrap !== except) {
          wrap.classList.remove('is-open');
          const btn = wrap.querySelector('.deck-theme-trigger');
          if(btn) btn.setAttribute('aria-expanded', 'false');
        }
      });
    };
    if(trigger) {
      ev.preventDefault();
      const wrap = trigger.closest('.deck-theme-select-wrap');
      if(!wrap) return;
      const open = !wrap.classList.contains('is-open');
      closeOthers(wrap);
      wrap.classList.toggle('is-open', open);
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      return;
    }
    if(option) {
      ev.preventDefault();
      const wrap = option.closest('.deck-theme-select-wrap');
      if(!wrap) return;
      const value = option.getAttribute('data-theme-value') || option.textContent.trim();
      const input = wrap.querySelector('.deck-theme-select');
      const valueEl = wrap.querySelector('.deck-theme-value');
      if(input) {
        input.value = value;
        input.dispatchEvent(new Event('change', {bubbles:true}));
      }
      if(valueEl) valueEl.textContent = value;
      wrap.querySelectorAll('.deck-theme-option').forEach(function(btn){
        const selected = btn === option;
        btn.classList.toggle('is-selected', selected);
        btn.setAttribute('aria-selected', selected ? 'true' : 'false');
      });
      wrap.classList.remove('is-open');
      const triggerBtn = wrap.querySelector('.deck-theme-trigger');
      if(triggerBtn) triggerBtn.setAttribute('aria-expanded', 'false');
      return;
    }
    closeOthers(null);
  });
  document.addEventListener('keydown', function(ev){
    if(ev.key !== 'Escape') return;
    document.querySelectorAll('.deck-theme-select-wrap.is-open').forEach(function(wrap){
      wrap.classList.remove('is-open');
      const btn = wrap.querySelector('.deck-theme-trigger');
      if(btn) btn.setAttribute('aria-expanded', 'false');
    });
  });
}

window.getDeckThemeOptions = getDeckThemeOptions;
window.normalizeDeckTheme = normalizeDeckTheme;
window.renderDeckThemeSelector = renderDeckThemeSelector;

// Save current deck as a new preset
function saveCurrentDeckAsPreset() {
  const deck = G.dbCurrentPlayer===0 ? G.p1Deck : G.p2Deck;
  if(deck.length!==40){ toast('Deck must be exactly 40 cards to save as preset'); return; }
  openTitlePresetSaveDialog(deck);
}

function openTitlePresetSaveDialog(deck) {
  const deckCards = [...new Set(deck)].map(id=>CARDS.find(c=>c.id===id)).filter(Boolean);
  if(!deckCards.length){ toast('Add cards before saving'); return; }
  const loaded = G._loadedPresetId && PRESET_DECKS[G._loadedPresetId] ? PRESET_DECKS[G._loadedPresetId] : null;
  const defaultFace = (loaded?.faceCardId && deckCards.find(c=>c.id===loaded.faceCardId))
    || deckCards.filter(c=>c.type!=='Supporter').sort((a,b)=>(b.fate||0)-(a.fate||0))[0]
    || deckCards[0];
  let currentFace = defaultFace?.id || deckCards[0]?.id;
  let currentDisplay = (loaded?.displayCardIds?.length
    ? loaded.displayCardIds.map(id=>deckCards.find(c=>c.id===id)).filter(Boolean).map(c=>c.id)
    : deckCards.filter(c=>c.img).slice(0,5).map(c=>c.id)
  ).slice(0,5);
  const defaultName = loaded?.name || '';
  const defaultDesc = loaded?.description || '';
  const defaultTheme = normalizeDeckTheme(loaded?.theme || 'Hybrid');

  showModal('Save as Preset', '', []);
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox) modalBox.classList.add('cdb-save-modal','title-preset-save-modal');
  const body = document.createElement('div');
  body.className = 'cdb-save-shell';
  body.innerHTML = `
    <div class="cdb-save-top">
      <div class="cdb-save-preview">
        <div class="cdb-save-face" id="title-save-face"></div>
      </div>
      <div class="cdb-save-form">
        <label>Deck Name<input id="preset-name-inp" maxlength="36" value="${escapeHtml(defaultName)}" placeholder="My Eagle Rush"></label>
        <label>Description<textarea id="preset-desc-inp" maxlength="120" placeholder="Fast aggressive supporters">${escapeHtml(defaultDesc)}</textarea></label>
        ${renderDeckThemeSelector(defaultTheme, 'preset-theme-inp')}
      </div>
    </div>
    <div class="cdb-save-section">
      <div class="cdb-save-section-title">Card Art</div>
      <div class="face-picker-grid cdb-save-picker" id="title-save-face-picker"></div>
    </div>
    <div class="cdb-save-section">
      <div class="cdb-save-section-title">Display Cards <span id="title-save-display-count">${currentDisplay.length}/5</span></div>
      <div class="face-picker-grid cdb-save-picker" id="title-save-display-picker"></div>
    </div>`;
  const modalBody = document.getElementById('modal-body');
  modalBody.innerHTML='';
  modalBody.appendChild(body);

  const renderPreview = () => {
    const faceCard = deckCards.find(c=>c.id===currentFace) || deckCards[0];
    const faceEl = body.querySelector('#title-save-face');
    if(faceEl) {
      if(faceCard?.img && typeof window.renderCanvasImage === 'function') {
        faceEl.innerHTML = '<canvas class="cdb-save-face-canvas" aria-hidden="true"></canvas><span>'+escapeHtml(faceCard.name)+'</span>';
        window.renderCanvasImage(faceEl.querySelector('canvas'), faceCard.img, {mode:'contain', parent:faceEl, background:'#080910'});
      } else {
        faceEl.innerHTML = faceCard?.img ? `<img src="${faceCard.img}" alt="${escapeHtml(faceCard.name)}"><span>${escapeHtml(faceCard.name)}</span>` : '';
      }
    }
    const count = body.querySelector('#title-save-display-count');
    if(count) count.textContent = `${currentDisplay.length}/5`;
  };
  const renderPickers = () => {
    const faceGrid = body.querySelector('#title-save-face-picker');
    const displayGrid = body.querySelector('#title-save-display-picker');
    faceGrid.classList.remove('canvas-card-grid-mode');
    displayGrid.classList.remove('canvas-card-grid-mode');
    faceGrid.innerHTML = '';
    displayGrid.innerHTML = '';
    const refreshPickerSelections = () => {
      faceGrid.querySelectorAll('.face-picker-card').forEach(el=>{
        const isFace = el.dataset.cardId === currentFace;
        el.classList.toggle('face-sel', isFace);
        el.querySelector('.fp-badge')?.remove();
        if(isFace) {
          const badge = document.createElement('div');
          badge.className = 'fp-badge';
          badge.textContent = 'FACE';
          el.appendChild(badge);
        }
      });
      displayGrid.querySelectorAll('.face-picker-card').forEach(el=>{
        const idx = currentDisplay.indexOf(el.dataset.cardId);
        const selected = idx >= 0;
        el.classList.toggle('display-sel', selected);
        el.querySelector('.fp-badge')?.remove();
        if(selected) {
          const badge = document.createElement('div');
          badge.className = 'fp-badge';
          badge.textContent = '#'+(idx+1);
          el.appendChild(badge);
        }
      });
    };
    deckCards.forEach(c=>{
      const faceEl = document.createElement('div');
      faceEl.className = 'face-picker-card'+(c.id===currentFace?' face-sel':'');
      faceEl.dataset.cardId = c.id;
      faceEl.innerHTML = `${c.img?`<img src="${c.img}" alt="${escapeHtml(c.name)}">`:''}${c.id===currentFace?'<div class="fp-badge">FACE</div>':''}`;
      faceEl.title = c.name;
      faceEl.onclick = ()=>{ currentFace = c.id; refreshPickerSelections(); renderPreview(); };
      faceGrid.appendChild(faceEl);

      const displayEl = document.createElement('div');
      const selected = currentDisplay.includes(c.id);
      displayEl.className = 'face-picker-card'+(selected?' display-sel':'');
      displayEl.dataset.cardId = c.id;
      displayEl.innerHTML = `${c.img?`<img src="${c.img}" alt="${escapeHtml(c.name)}">`:''}${selected?`<div class="fp-badge">#${currentDisplay.indexOf(c.id)+1}</div>`:''}`;
      displayEl.title = c.name;
      displayEl.onclick = ()=>{
        const idx = currentDisplay.indexOf(c.id);
        if(idx >= 0) currentDisplay.splice(idx, 1);
        else {
          if(currentDisplay.length >= 5){ toast('Max 5 display cards'); return; }
          currentDisplay.push(c.id);
        }
        refreshPickerSelections();
        renderPreview();
      };
      displayGrid.appendChild(displayEl);
    });
    renderPreview();
  };
  renderPickers();

  const acts = document.getElementById('modal-acts');
  acts.innerHTML='';
  const cancel=document.createElement('button');cancel.className='btn sm';cancel.textContent='Cancel';cancel.onclick=closeModal;
  const ok=document.createElement('button');ok.className='btn sm pri';ok.textContent='Save';
  ok.onclick=()=>{
    const n = document.getElementById('preset-name-inp').value.trim();
    const d = document.getElementById('preset-desc-inp').value.trim();
    const theme = normalizeDeckTheme(document.getElementById('preset-theme-inp')?.value || 'Hybrid');
    if(!n){toast('Please enter a preset name');return;}
    const key = G._loadedPresetId || ('user_'+Date.now());
    const existing = PRESET_DECKS[key] || {};
    PRESET_DECKS[key] = {
      ...existing,
      name:n,
      description:d||'Custom deck',
      theme,
      ids:[...deck],
      faceCardId: currentFace,
      displayCardIds: currentDisplay.slice(0,5)
    };
    G._loadedPresetId = key;
    savePresetsToStorage();
    if(typeof playSfx==='function') playSfx(existing.name ? 'deckComplete' : 'starPlace');
    closeModal();
    toast((existing.name?'Updated ':'Saved ')+'preset "'+n+'"');
  };
  acts.appendChild(cancel);
  acts.appendChild(ok);
  document.getElementById('modal').classList.add('on');
  setTimeout(()=>document.getElementById('preset-name-inp').focus(),100);
}

function showDeckOverwriteBanner(name, label) {
  const safeName = String(name || 'Preset');
  let el = document.getElementById('deck-overwrite-banner');
  clearTimeout(window.__deckOverwriteBannerTimer);
  clearTimeout(window.__deckOverwriteBannerRemoveTimer);
  if(!el){
    el = document.createElement('div');
    el.id = 'deck-overwrite-banner';
    el.className = 'deck-overwrite-banner';
    document.body.appendChild(el);
  }
  el.innerHTML = '<span class="deck-overwrite-kicker">' + escapeHtml(label || 'Preset overwritten') + '</span><span class="deck-overwrite-name">' + escapeHtml(safeName) + '</span>';
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
  window.__deckOverwriteBannerTimer = setTimeout(function(){
    el.classList.remove('on');
    window.__deckOverwriteBannerRemoveTimer = setTimeout(function(){
      if(el && el.parentNode && !el.classList.contains('on')) el.remove();
    }, 260);
  }, 2400);
}
window.showDeckOverwriteBanner = showDeckOverwriteBanner;

function overwriteLoadedPreset() {
  const deck = G.dbCurrentPlayer===0 ? G.p1Deck : G.p2Deck;
  const pid = G._loadedPresetId;
  if(!pid || !PRESET_DECKS[pid]){
    toast('Load a preset first to overwrite it');
    return;
  }
  if(deck.length!==40){
    toast('Deck must be exactly 40 cards to overwrite a preset');
    return;
  }
  const existing = PRESET_DECKS[pid];
  PRESET_DECKS[pid] = {
    ...existing,
    ids:[...deck]
  };
  savePresetsToStorage();
  if(typeof playSfx==='function') playSfx('deckComplete');
  showDeckOverwriteBanner(existing.name, 'Preset overwritten');
  toast(`Overwrote preset "${existing.name}"`);
}

function deletePreset(pid) {
  if(!PRESET_DECKS[pid]) return;
  const name = PRESET_DECKS[pid].name;
  showModal('Delete Preset?',
    `Delete "<strong>${name}</strong>"? This cannot be undone.`,
    [{label:'Cancel',action:closeModal},
     {label:'Delete',danger:true,action:()=>{
       delete PRESET_DECKS[pid];
       savePresetsToStorage();
       closeModal();
       toast('Preset deleted');
       browsePresets();
     }}]);
}

function deleteLoadedPresetFromBuilder() {
  const pid = G._loadedPresetId;
  if(!pid || !PRESET_DECKS[pid]){
    toast('Load a preset first');
    return;
  }
  const name = PRESET_DECKS[pid].name;
  showModal('Delete Preset?',
    `Delete "<strong>${escapeHtml(name)}</strong>"? This removes the saved preset but keeps the current deck on screen.`,
    [{label:'Cancel',action:closeModal},
     {label:'Delete',danger:true,action:()=>{
       delete PRESET_DECKS[pid];
       G._loadedPresetId = null;
       savePresetsToStorage();
       closeModal();
       if(typeof renderDBDeck === 'function') renderDBDeck();
       toast('Preset deleted');
     }}]);
}
window.deleteLoadedPresetFromBuilder = deleteLoadedPresetFromBuilder;


function loadPreset(p) {
  const preset = PRESET_DECKS[p];
  if(!preset){ autoFillDeck(); return; }
  const deck = G.dbCurrentPlayer===0 ? G.p1Deck : G.p2Deck;
  deck.length=0;
  const validIds = preset.ids.filter(id=>CARDS.find(c=>c.id===id));
  if(validIds.length<40) { autoFillDeck(); return; }
  validIds.slice(0,40).forEach(id=>deck.push(id));
  if(G.dbCurrentPlayer===0) G.p1Deck=deck; else G.p2Deck=deck;
  G._loadedPresetId = p;
  if(typeof playSfx==='function') playSfx('deckComplete');
  renderDBCollection();
  renderDBDeck();
  toast('Loaded preset: '+preset.name);
  // Show warning banner for built-in/starter presets that cannot be modified
  if(preset.builtin){
    showStarterDeckWarningBanner();
  } else {
    hideStarterDeckWarningBanner();
  }
}

function showStarterDeckWarningBanner() {
  hideStarterDeckWarningBanner();
  const deckPanel = document.querySelector('#s-deck .db-deck, #s-deck .deck-panel, #s-deck .db-right');
  if(!deckPanel) return;
  const banner = document.createElement('div');
  banner.id = 'starter-deck-warning';
  banner.style.cssText = 'background:linear-gradient(90deg,rgba(201,168,76,.18),rgba(201,168,76,.08));border:1px solid rgba(201,168,76,.35);border-radius:6px;padding:.45rem .7rem;margin:0 0 .5rem;font-size:.62rem;color:#e8c84a;text-align:center;letter-spacing:.04em;font-family:"Cinzel",serif;';
  banner.textContent = 'This is a default starter deck. Changes will not be saved to this preset, use "Save As New" to create an editable copy.';
  deckPanel.insertBefore(banner, deckPanel.firstChild);
}

function hideStarterDeckWarningBanner() {
  const existing = document.getElementById('starter-deck-warning');
  if(existing) existing.remove();
}

function getOrderedPresetKeys() {
  return Object.keys(PRESET_DECKS).sort((a,b)=>{
    const pa = PRESET_DECKS[a] || {};
    const pb = PRESET_DECKS[b] || {};
    const sa = typeof pa.sortOrder === 'number' ? pa.sortOrder : 1000;
    const sb = typeof pb.sortOrder === 'number' ? pb.sortOrder : 1000;
    if(sa !== sb) return sa - sb;
    return String(pa.name || a).localeCompare(String(pb.name || b));
  });
}

function resequencePresetOrder(orderKeys) {
  orderKeys.forEach((pid, idx)=>{
    if(PRESET_DECKS[pid]) PRESET_DECKS[pid].sortOrder = idx;
  });
  savePresetsToStorage();
}

let _presetOrderReturnMode = 'browser';
let _presetBrowsePage = 0;

window.editPresetOrder = function(returnMode='browser'){
  _presetOrderReturnMode = returnMode;
  renderPresetOrderEditor();
};

window.returnFromPresetOrderEditor = function(){
  if(_presetOrderReturnMode === 'overlay' && typeof showPresetOverlay === 'function'){
    showPresetOverlay(!!window._presetOverlayVsAI);
    closeModal();
    return;
  }
  browsePresets();
};

window.closePresetOrderEditor = window.returnFromPresetOrderEditor;

window.movePresetOrder = function(pid, dir){
  const keys = getOrderedPresetKeys();
  const idx = keys.indexOf(pid);
  if(idx < 0) return;
  const swapIdx = idx + dir;
  if(swapIdx < 0 || swapIdx >= keys.length) return;
  const tmp = keys[idx];
  keys[idx] = keys[swapIdx];
  keys[swapIdx] = tmp;
  resequencePresetOrder(keys);
  renderPresetOrderEditor();
};

function renderPresetOrderEditor() {
  const ordered = getOrderedPresetKeys();
  const body = document.createElement('div');
  if(!ordered.length){
    body.innerHTML = `<div style="text-align:center;padding:1.6rem;color:var(--dim);font-style:italic;">No presets available to reorder.</div>`;
  } else {
    body.innerHTML = `<p style="font-size:.84rem;color:var(--dim);font-style:italic;margin-bottom:.8rem;">Choose which presets appear first. Higher entries show up earlier in your deck selection screens.</p>`;
    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '.65rem';
    ordered.forEach((pid, index)=>{
      const preset = PRESET_DECKS[pid];
      const sampleIds = [...new Set(preset.ids)];
      const sampleCards = sampleIds.map(id=>CARDS.find(c=>c.id===id)).filter(Boolean);
      const hero = preset.faceCardId ? CARDS.find(c=>c.id===preset.faceCardId) : ([...sampleCards].sort((a,b)=>(b.fate||0)-(a.fate||0))[0] || sampleCards[0]);
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '.8rem';
      row.style.padding = '.7rem .8rem';
      row.style.border = '1px solid var(--border)';
      row.style.borderRadius = '10px';
      row.style.background = 'rgba(0,0,0,.28)';
      row.innerHTML = `
        <div style="width:72px;height:96px;border-radius:8px;overflow:hidden;background:#0a0a0f;flex-shrink:0;border:1px solid rgba(255,255,255,.08);">
          ${hero?.img ? `<img src="${hero.img}" alt="${escapeHtml(hero.name)}" loading="lazy" decoding="async" draggable="false" style="width:100%;height:100%;object-fit:cover;object-position:center 20%;">` : ''}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-family:'Cinzel',serif;color:var(--gold);font-size:1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(preset.name)}</div>
          <div style="font-size:.72rem;color:var(--dim);letter-spacing:.08em;text-transform:uppercase;">Position ${index + 1}</div>
        </div>`;
      const moveWrap = document.createElement('div');
      moveWrap.style.display = 'flex';
      moveWrap.style.gap = '.35rem';
      moveWrap.style.flexShrink = '0';
      const earlierBtn = document.createElement('button');
      earlierBtn.className = 'btn sm';
      earlierBtn.textContent = 'Earlier';
      earlierBtn.disabled = index === 0;
      earlierBtn.onclick = ()=>window.movePresetOrder(pid,-1);
      const laterBtn = document.createElement('button');
      laterBtn.className = 'btn sm';
      laterBtn.textContent = 'Later';
      laterBtn.disabled = index === ordered.length - 1;
      laterBtn.onclick = ()=>window.movePresetOrder(pid,1);
      moveWrap.appendChild(earlierBtn);
      moveWrap.appendChild(laterBtn);
      row.appendChild(moveWrap);
      list.appendChild(row);
    });
    body.appendChild(list);
  }
  document.getElementById('modal-body').innerHTML = '';
  document.getElementById('modal-body').appendChild(body);
  document.getElementById('modal-title').textContent = 'Edit Preset Order';
  const acts = document.getElementById('modal-acts');
  acts.innerHTML = '';
  const back = document.createElement('button');
  back.className = 'btn sm';
  back.textContent = 'Back';
  back.onclick = window.returnFromPresetOrderEditor;
  const close = document.createElement('button');
  close.className = 'btn sm';
  close.textContent = 'Close';
  close.onclick = closeModal;
  const done = document.createElement('button');
  done.className = 'btn sm pri';
  done.textContent = 'Done';
  done.onclick = window.returnFromPresetOrderEditor;
  acts.appendChild(back);
  acts.appendChild(close);
  acts.appendChild(done);
  document.getElementById('modal').classList.add('on');
}

// Visual preset browser — called from deck builder
function browsePresets(page=0) {
  if(typeof resetModalChrome === 'function') resetModalChrome();
  const keys = getOrderedPresetKeys();
  if(typeof window.renderDeckLibraryModal === 'function'){
    window.renderDeckLibraryModal(page, {
      source:'title',
      title:'My Presets',
      modeLabel:'Title Presets',
      subcopy:'Choose a preset to load into the title Deck Builder or customize its art.',
      emptyText:'No decks saved yet. Build a 40-card deck in the Deck Builder, then save it as a preset.',
      presets:PRESET_DECKS,
      keys,
      extraClasses:['title-my-decks-modal'],
      loadRequiresComplete:true,
      onLoad:(pid)=>{
        loadPreset(pid);
        closeModal();
      },
      onEditArt:(pid)=>{
        if(typeof editPreset === 'function') editPreset(pid);
      },
      onOrder:()=>editPresetOrder(),
      onRowClick:(pid)=>viewPresetContents(pid)
    });
    return;
  }
  const body = document.createElement('div');
  const pageSize = 3;
  const totalPages = Math.max(1, Math.ceil(keys.length / pageSize));
  _presetBrowsePage = Math.max(0, Math.min(page, totalPages - 1));

  if(keys.length===0){
    body.innerHTML = `
      <div style="text-align:center;padding:2rem 1rem;">
        <div style="font-size:3rem;opacity:.3;margin-bottom:1rem;">Decks</div>
        <div style="font-family:'Cinzel',serif;color:var(--gold);font-size:1rem;margin-bottom:.5rem;">No Decks Saved Yet</div>
        <div style="color:var(--dim);font-size:.9rem;line-height:1.5;max-width:360px;margin:0 auto;">
          Build a 40-card deck in the deck builder, then click "Save as Preset" to create your own custom preset collection.
        </div>
      </div>`;
    document.getElementById('modal-body').innerHTML='';
    document.getElementById('modal-body').appendChild(body);
    document.getElementById('modal-body').style.overflow = 'hidden';
    document.getElementById('modal-body').style.maxHeight = 'none';
    document.getElementById('modal-title').textContent='My Decks';
    document.getElementById('modal-acts').innerHTML='';
    const close=document.createElement('button');close.className='btn sm';close.textContent='Close';close.onclick=closeModal;
    document.getElementById('modal-acts').appendChild(close);
    const emptyModalBox = document.querySelector('#modal .modal');
    if(emptyModalBox) emptyModalBox.classList.add('title-my-decks-modal');
    document.getElementById('modal').classList.add('on');
    return;
  }

  const pageKeys = keys.slice(_presetBrowsePage * pageSize, _presetBrowsePage * pageSize + pageSize);
  body.innerHTML = `<p style="font-size:.9rem;color:var(--dim);margin-bottom:.8rem;">Choose a deck to preview, load, or edit art:</p>`;
  const grid = document.createElement('div');
  grid.className = 'preset-browse-grid deck-pick-grid fixed-deck-tile-grid my-presets-as-choose-deck';
  grid.style.gridAutoRows = '480px';

  pageKeys.forEach((pid, i)=>{
    const p = PRESET_DECKS[pid];
    const ok = (p.ids || []).filter(id=>!(typeof isRetiredCardForBuilder === 'function' && isRetiredCardForBuilder(id))).length===40;
    const sampleIds = [...new Set((p.ids || []).filter(id=>!(typeof isRetiredCardForBuilder === 'function' && isRetiredCardForBuilder(id))))];
    const sampleCards = sampleIds.map(id=>CARDS.find(c=>c.id===id)).filter(Boolean);
    const hero = p.faceCardId ? CARDS.find(c=>c.id===p.faceCardId) : ([...sampleCards].sort((a,b)=>(b.fate||0)-(a.fate||0))[0] || sampleCards[0]);
    const displayCards = (p.displayCardIds && p.displayCardIds.length
      ? p.displayCardIds.filter(id=>!(typeof isRetiredCardForBuilder === 'function' && isRetiredCardForBuilder(id))).map(id=>CARDS.find(c=>c.id===id)).filter(c=>c&&c.img)
      : sampleCards.filter(c=>c.img)
    ).slice(0,5);
    const tile = document.createElement('div');
    tile.className = 'preset-browse-tile fixed-deck-tile';
    tile.style.height = '480px';
    tile.style.minHeight = '480px';
    tile.style.maxHeight = '480px';
    tile.style.opacity = ok ? '1' : '.5';
    tile.style.animationDelay = '0s';
    const useCanvasPreview = false;
    tile.innerHTML = `
      <div class="preset-tile-art">
        ${useCanvasPreview ? '<canvas class="canvas-deck-preview-hero" aria-hidden="true"></canvas>' : (hero?.img ? `<img src="${hero.img}" alt="${escapeHtml(hero.name)}" loading="lazy" decoding="async" draggable="false" onerror="this.style.display='none'">` : '')}
        <div class="preset-tile-overlay"></div>
      </div>
      <div class="preset-tile-info">
        <div class="preset-name">${escapeHtml(p.name)}</div>
        <div class="preset-desc">${escapeHtml(p.description||'')}</div>
        <div class="preset-minis">
          ${useCanvasPreview ? '<canvas class="canvas-deck-preview-minis" aria-hidden="true"></canvas>' : displayCards.map(c=>`<div class="preset-mini-art">${c.img?`<img src="${typeof getRuntimeCardImageSrc === 'function' ? getRuntimeCardImageSrc(c.img, 'thumb') : c.img}" alt="${escapeHtml(c.name)}" loading="lazy" decoding="async" draggable="false">`:''}</div>`).join('')}
        </div>
        <div class="preset-action-row">
          <button class="btn sm pri" type="button" ${ok?'':`disabled`}>Load</button>
          <button class="btn sm" type="button">Edit Art</button>
        </div>
      </div>`;
    const [loadBtn, editArtBtn] = tile.querySelectorAll('.preset-action-row .btn');
    if(loadBtn) loadBtn.onclick = (e)=>{ e.stopPropagation(); if(ok){ loadPreset(pid); closeModal(); } };
    if(editArtBtn) editArtBtn.onclick = (e)=>{ e.stopPropagation(); if(typeof editPreset === 'function') editPreset(pid); };
    tile.onclick = ()=>viewPresetContents(pid);
    grid.appendChild(tile);
    if(useCanvasPreview) window.scheduleCanvasDeckPreviewTile(tile, {hero, minis: displayCards});
  });
  body.appendChild(grid);
  requestAnimationFrame(function(){
    grid.querySelectorAll('.preset-browse-tile').forEach(function(tile){
      const nameEl = tile.querySelector('.preset-name');
      if(!nameEl || !window.getComputedStyle) return;
      const lineHeight = parseFloat(getComputedStyle(nameEl).lineHeight) || nameEl.getBoundingClientRect().height || 1;
      const lines = Math.max(1, Math.round(nameEl.getBoundingClientRect().height / lineHeight));
      tile.classList.toggle('preset-title-single-line', lines <= 1);
      tile.classList.toggle('preset-title-two-line', lines > 1);
    });
  });

  const footer = document.createElement('div');
  footer.style.display = 'flex';
  footer.style.justifyContent = 'space-between';
  footer.style.alignItems = 'center';
  footer.style.gap = '.75rem';
  footer.style.marginTop = '1rem';
  footer.style.flexWrap = 'wrap';
  footer.innerHTML = `
    <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">
      <button class="btn sm" onclick="browsePresets(${_presetBrowsePage-1})" ${_presetBrowsePage<=0?'disabled':''}>Prev</button>
      <button class="btn sm" onclick="editPresetOrder()" ${keys.length<=1?'disabled':''}>Edit Order</button>
      <button class="btn sm" onclick="browsePresets(${_presetBrowsePage+1})" ${_presetBrowsePage>=totalPages-1?'disabled':''}>Next</button>
    </div>`;
  body.appendChild(footer);

  document.getElementById('modal-body').innerHTML='';
  document.getElementById('modal-body').appendChild(body);
  document.getElementById('modal-body').style.overflow = 'hidden';
  document.getElementById('modal-body').style.maxHeight = 'none';
  document.getElementById('modal-title').textContent = 'My Decks';
  document.getElementById('modal-acts').innerHTML = '';
  const close = document.createElement('button');
  close.className='btn sm';close.textContent='Close';close.onclick=closeModal;
  document.getElementById('modal-acts').appendChild(close);
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox) modalBox.classList.add('title-my-decks-modal');
  document.getElementById('modal').classList.add('on');
}

// Show all 40 cards in a preset as images
function viewPresetContents(pid, returnMode='browser') {
  const preset = PRESET_DECKS[pid];
  if(!preset) return;
  const sharedPreviewOptions = window._sharedDeckPreviewOptions && window._sharedDeckPreviewOptions[pid];
  if(typeof resetModalChrome === 'function') resetModalChrome();
  // Group by unique card + count
  const activeIds = preset.ids.filter(id=>!(typeof isRetiredCardForBuilder === 'function' && isRetiredCardForBuilder(id)));
  const counts = {};
  activeIds.forEach(id=>{counts[id]=(counts[id]||0)+1;});
  const entries = Object.entries(counts).map(([id,n])=>({card:CARDS.find(c=>c.id===id),count:n})).filter(e=>e.card);
  const hero = preset.faceCardId
    ? CARDS.find(c=>c.id===preset.faceCardId)
    : ([...entries].map(e=>e.card).sort((a,b)=>(b.fate||0)-(a.fate||0))[0] || entries[0]?.card || null);

  const body = document.createElement('div');
  body.className = 'deck-inspect-view title-deck-inspect-view';
  body.innerHTML = `
    <div class="deck-inspect-summary">
      <div class="deck-inspect-brief">
        <p>${escapeHtml(preset.description || 'No description.')}</p>
        <div class="deck-inspect-metrics">
          <span><b>${activeIds.length}</b><em>Total Cards</em></span>
          <span><b>${entries.length}</b><em>Unique Cards</em></span>
          <span class="deck-inspect-theme-metric${deckThemeFitClass(preset.theme || 'Custom')}"><b>${escapeHtml(preset.theme || 'Custom')}</b><em>Theme</em></span>
        </div>
      </div>
      ${hero?.img ? `<div class="deck-inspect-hero"><img src="${hero.img}" alt="${escapeHtml(hero.name)}"></div>` : ''}
    </div>
    <div class="deck-inspect-section-title">Deck Contents <span>${entries.length} unique cards</span></div>
    <div class="preset-view-grid"></div>`;
  const inlineBack = body.querySelector('.deck-inspect-back-inline');
  if(inlineBack) inlineBack.onclick = returnMode === 'overlay' ? closeModal : ()=>browsePresets(_presetBrowsePage);
  const grid = body.querySelector('.preset-view-grid');
  entries.sort((a,b)=>{
    // supporters first, then by cost
    const ta = a.card.type==='Supporter'?0:1;
    const tb = b.card.type==='Supporter'?0:1;
    if(ta!==tb) return ta-tb;
    return (a.card.cost||0)-(b.card.cost||0);
  });
  const useCanvasPresetPreview = false;
  if(useCanvasPresetPreview && typeof window.renderCanvasDeckCollection === 'function') {
    grid.style.setProperty('--dbcw', '118px');
    grid.style.setProperty('--dbch', '166px');
    window.renderCanvasDeckCollection(grid, entries.map(({card,count})=>({
      card,
      count: 0,
      ownedText: 'x' + count,
      title: 'Click for details',
      ariaLabel: card.name
    })), {
      onClick: (card)=>openCardDetail(card),
      onContextMenu: (card)=>showCardInfoOverlay(card)
    });
  } else {
    entries.forEach(({card:c,count})=>{
      const el=document.createElement('div');
      el.className='mc visual-mc preset-view-card';
      el.innerHTML=`
        <div class="mc-art">${c.img?`<img src="${c.img}" alt="${c.name}">`:`<span class="mc-ico">${getAffIcon(c.aff)}</span>`}</div>
        <div class="visual-name">${c.name}</div>
        <div class="preset-card-count">x${count}</div>`;
      el.onclick=()=>openCardDetailFromDeckPreview(c, ()=>viewPresetContents(pid, returnMode));
      el.title='Click for details';
      grid.appendChild(el);
    });
  }
  document.getElementById('modal-body').innerHTML='';
  document.getElementById('modal-body').appendChild(body);
  document.getElementById('modal-title').textContent = `${preset.name} - 40 Cards`;
  document.getElementById('modal-acts').innerHTML = '';
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox) {
    modalBox.classList.add('deck-inspect-compact-modal','title-deck-preview-modal');
    if(sharedPreviewOptions) {
      modalBox.classList.add('shared-deck-preview-modal');
      const extraClasses = Array.isArray(sharedPreviewOptions.modalClasses)
        ? sharedPreviewOptions.modalClasses
        : (sharedPreviewOptions.modalClass ? String(sharedPreviewOptions.modalClass).split(/\s+/) : []);
      extraClasses.filter(Boolean).forEach(cls=>modalBox.classList.add(cls));
    }
  }

  const close = document.createElement('button');
  close.className='btn sm';
  close.textContent = (sharedPreviewOptions && sharedPreviewOptions.closeText) || 'Close';
  close.onclick = ()=>{
    if(sharedPreviewOptions && sharedPreviewOptions.cleanup !== false) {
      delete PRESET_DECKS[pid];
      delete window._sharedDeckPreviewOptions[pid];
    }
    if(sharedPreviewOptions && typeof sharedPreviewOptions.onBack === 'function') sharedPreviewOptions.onBack(pid, preset);
    else if(returnMode === 'overlay') closeModal();
    else browsePresets(_presetBrowsePage);
  };
  document.getElementById('modal-acts').appendChild(close);
  document.getElementById('modal').classList.add('on');
}

function openSharedDeckPreview(previewKey, preset, options={}) {
  if(!previewKey || !preset || typeof PRESET_DECKS === 'undefined') return;
  if(!window._sharedDeckPreviewOptions) window._sharedDeckPreviewOptions = {};
  const extraClasses = [];
  if(Array.isArray(options.modalClasses)) extraClasses.push(...options.modalClasses);
  else if(options.modalClass) extraClasses.push(...String(options.modalClass).split(/\s+/));
  PRESET_DECKS[previewKey] = {
    ...preset,
    ids: Array.isArray(preset.ids) ? [...preset.ids] : [],
    displayCardIds: Array.isArray(preset.displayCardIds) ? [...preset.displayCardIds] : []
  };
  window._sharedDeckPreviewOptions[previewKey] = {
    ...options,
    modalClasses: extraClasses
  };
  viewPresetContents(previewKey, options.returnMode || 'overlay');
}
window.openSharedDeckPreview = openSharedDeckPreview;
// Used from the title screen — loads a preset for both players (or vs AI)
function loadPresetAndStart(presetId, vsAI) {
  const preset = PRESET_DECKS[presetId];
  if(!preset) return;
  if(typeof playSfx==='function') playSfx('deckComplete');
  if(CURRENT_MODE === 'challenger'){
    // Challenger: human deck is already loaded in G.p1Deck (from chStartWithDeck)
    // The picked preset is the AI's opponent deck.
    const activeHumanDeckCount = typeof isRetiredCardForBuilder === 'function'
      ? G.p1Deck.filter(id=>!isRetiredCardForBuilder(id)).length
      : G.p1Deck.length;
    if(activeHumanDeckCount !== 40){
      toast('Build a 40-card deck first!');
      return;
    }
    G.p2Deck = typeof getActiveCardIdsForDeck === 'function' ? getActiveCardIdsForDeck(preset.ids, 40) : preset.ids.slice(0,40);
    startGame(vsAI);
    return;
  }
  // Free Play: preset is used for BOTH players (AI picks a different one if available)
  G.p1Deck = typeof getActiveCardIdsForDeck === 'function' ? getActiveCardIdsForDeck(preset.ids, 40) : preset.ids.slice(0,40);
  if(vsAI){
    const selectedDeck = (G._selectedAI && typeof getPlayableAIDeck === 'function')
      ? getPlayableAIDeck(G._selectedAI, G.aiDifficulty)
      : [];
    if(G._selectedAI && selectedDeck.length===40){
      G.p2Deck = [...selectedDeck];
      G.players[1].name = G._selectedAI.name;
    } else {
      const otherKeys = Object.keys(PRESET_DECKS).filter(k=>k!==presetId);
      if(otherKeys.length){
        const aiChoice = otherKeys[Math.floor(Math.random()*otherKeys.length)];
        G.p2Deck = typeof getActiveCardIdsForDeck === 'function' ? getActiveCardIdsForDeck(PRESET_DECKS[aiChoice].ids, 40) : PRESET_DECKS[aiChoice].ids.slice(0,40);
      } else {
        G.p2Deck = typeof getActiveCardIdsForDeck === 'function' ? getActiveCardIdsForDeck(preset.ids, 40) : preset.ids.slice(0,40);
      }
    }
  } else {
    G.p2Deck = typeof getActiveCardIdsForDeck === 'function' ? getActiveCardIdsForDeck(preset.ids, 40) : preset.ids.slice(0,40);
  }
  startGame(vsAI);
}

function saveDeckAndBack() {
  const p1ok = G.p1Deck.length===40;
  const p2ok = G.p2Deck.length===40;
  if(!p1ok||!p2ok) {
    showModal('Decks Not Ready',`P1 deck: ${G.p1Deck.length}/40<br>P2 deck: ${G.p2Deck.length}/40<br><br>Would you like to auto-fill incomplete decks?`,
      [{label:'Auto-Fill & Continue',action:()=>{
        G.dbCurrentPlayer=0; if(!p1ok) autoFillDeck();
        G.dbCurrentPlayer=1; if(!p2ok) autoFillDeck();
        G.dbCurrentPlayer=0;
        closeModal(); showScreen('s-title');
      }},{label:'Keep Editing',action:closeModal}]);
    return;
  }
  showScreen('s-title');
}

// ═══════════════════════════════════════════════════════
