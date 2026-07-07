// FATES ENTWINED — CLOUD SAVE LAYER
// Stores all player data under the signed-in account.
// localStorage is kept as a fast cache; Fly player-save is used in RTDB-disabled
// mode, with Firebase RTDB remaining as the legacy fallback source of truth.
// Requires window.FateOnline (from 15-online-auth.js) for auth/Firebase access.

(function(){
  'use strict';

  var _cloudSaveDebounceTimers = {};
  var _cloudReady = false;
  var _cloudUid = null;
  var _loadingOverlay = null;
  var _loadingOverlayWasAsset = false;

  window._fateCloudReady = false;
  window._fateCloudUid = null;

  function _localStorageFlag(name){
    try{ return localStorage.getItem(name) === '1'; }catch(e){ return false; }
  }

  function _authorityHttpBaseUrl(){
    try{
      var explicit = String(localStorage.getItem('fateFlyApiUrl') || '').trim();
      if(explicit) return explicit.replace(/\/+$/, '');
    }catch(e){}
    var globalExplicit = String(window.FATE_FLY_API_URL || '').trim();
    if(globalExplicit) return globalExplicit.replace(/\/+$/, '');
    var wsUrl = '';
    try{ wsUrl = String(localStorage.getItem('fateWsAuthorityUrl') || '').trim(); }catch(e){}
    if(!wsUrl) wsUrl = String(window.FATE_WS_AUTHORITY_URL || '').trim();
    if(!wsUrl) return '';
    return wsUrl.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:').replace(/\/+$/, '');
  }

  function _useFlyCloudSave(){
    return !!_authorityHttpBaseUrl() && (
      _localStorageFlag('fateFlyRoomsEnabled') ||
      _localStorageFlag('fateRtdbDisabled') ||
      window.FATE_FLY_ROOMS_ENABLED === true ||
      window.FATE_RTDB_DISABLED === true
    );
  }

  function _rtdbDisabledMode(){
    return _localStorageFlag('fateRtdbDisabled') || window.FATE_RTDB_DISABLED === true;
  }

  function _flyApiRequest(path, opts){
    var base = _authorityHttpBaseUrl();
    if(!base) return Promise.reject(new Error('Fly authority API URL is not configured'));
    var FO = window.FateOnline || {};
    var headers = {'accept':'application/json'};
    var method = String((opts && opts.method) || 'GET').toUpperCase();
    var init = {method:method, headers:headers};
    var tokenPromise = FO.auth && FO.auth.currentUser && typeof FO.auth.currentUser.getIdToken === 'function'
      ? FO.auth.currentUser.getIdToken(false).catch(function(){ return ''; })
      : Promise.resolve('');
    return tokenPromise.then(function(token){
      if(token) headers.authorization = 'Bearer ' + token;
      if(opts && Object.prototype.hasOwnProperty.call(opts, 'body')){
        headers['content-type'] = 'application/json';
        init.body = JSON.stringify(opts.body || {});
      }
      return fetch(base + path, init);
    }).then(function(res){
      return res.text().then(function(text){
        var json = null;
        try{ json = text ? JSON.parse(text) : null; }catch(e){}
        if(!res.ok || (json && json.ok === false)) throw new Error('Fly cloud save failed: ' + res.status + ' ' + ((json && json.error) || text.slice(0, 160)));
        return json || {};
      });
    });
  }

  function _flyCloudWritePath(uid, path, data){
    if(!uid || !path) return Promise.resolve();
    var payload = {};
    payload[path] = data;
    return _flyApiRequest('/api/player-save/' + encodeURIComponent(uid), {
      method:'POST',
      body:{uid:uid, data:payload}
    }).catch(function(e){
      console.warn('[CloudSave] Fly write failed for ' + path, e);
    });
  }

  function _fb(){
    if(_useFlyCloudSave() || _rtdbDisabledMode()) return null;
    var FO = window.FateOnline;
    if(!FO || !FO.rtdb || !FO.ref || !FO.set || !FO.get || !FO.update) return null;
    return FO;
  }

  function _userRef(path){
    var FO = _fb();
    if(!FO || !_cloudUid) return null;
    return FO.ref(FO.rtdb, 'players/' + _cloudUid + '/' + path);
  }

  // Debounced write to Firebase — avoids hammering the DB on rapid saves
  function _debouncedCloudWrite(key, path, data, delayMs){
    if(!_cloudUid) return;
    var uidAtSchedule = _cloudUid;
    clearTimeout(_cloudSaveDebounceTimers[key]);
    _cloudSaveDebounceTimers[key] = setTimeout(function(){
      if(_cloudUid !== uidAtSchedule) return;
      if(_useFlyCloudSave()){
        _flyCloudWritePath(uidAtSchedule, path, data);
        return;
      }
      var FO = _fb();
      if(!FO) return;
      var r = FO.ref(FO.rtdb, 'players/' + uidAtSchedule + '/' + path);
      if(!r) return;
      FO.set(r, data).catch(function(e){
        console.warn('[CloudSave] write failed for ' + path, e);
      });
    }, delayMs || 300);
  }

  function _clearCloudDebounceTimers(){
    for(var k in _cloudSaveDebounceTimers){
      clearTimeout(_cloudSaveDebounceTimers[k]);
    }
    _cloudSaveDebounceTimers = {};
  }

  // Immediate write (for critical saves like after a match)
  function _immediateCloudWrite(path, data){
    if(_useFlyCloudSave() && _cloudUid) return _flyCloudWritePath(_cloudUid, path, data);
    var r = _userRef(path);
    if(!r) return Promise.resolve();
    var FO = _fb();
    if(!FO) return Promise.resolve();
    return FO.set(r, data).catch(function(e){
      console.warn('[CloudSave] immediate write failed for ' + path, e);
    });
  }

  // ─── PUBLIC SAVE FUNCTIONS ───
  // Each writes to both localStorage (cache) and Firebase (source of truth)

  function cloudSaveProfile(){
    if(!_cloudUid) return;
    var data = typeof USER_PROFILE !== 'undefined' ? USER_PROFILE : null;
    if(!data) return;
    if(data._fateAccountUid && data._fateAccountUid !== _cloudUid){
      console.warn('[CloudSave] blocked cross-account profile write');
      return;
    }
    _debouncedCloudWrite('profile', 'profile', Object.assign({}, data, {_fateAccountUid:_cloudUid}), 400);
  }

  function cloudSavePresets(){
    if(!_cloudUid) return;
    var data = typeof PRESET_DECKS !== 'undefined' ? PRESET_DECKS : null;
    if(data == null) return;
    _debouncedCloudWrite('presets', 'presets', data, 500);
  }

  function cloudSaveLeaderboard(){
    if(!_cloudUid) return;
    var data = typeof LEADERBOARD !== 'undefined' ? LEADERBOARD : null;
    if(!data) return;
    _debouncedCloudWrite('leaderboard', 'leaderboard', data, 600);
  }

  function cloudSavePublicDecks(){
    if(!_cloudUid) return;
    var data = typeof PUBLIC_DECKS !== 'undefined' ? PUBLIC_DECKS : null;
    if(!data) return;
    _debouncedCloudWrite('publicDecks', 'publicDecks', data, 600);
  }

  function cloudSaveMatchHistory(){
    if(!_cloudUid) return;
    try {
      var raw = localStorage.getItem('fate_match_history');
      if(raw) _debouncedCloudWrite('matchHistory', 'matchHistory', JSON.parse(raw), 500);
    } catch(e){}
  }

  function cloudSaveDailyChallenges(){
    if(!_cloudUid) return;
    try {
      var challenges = localStorage.getItem('fate_daily_challenges');
      var date = typeof getDailyChallengeDate === 'function' ? getDailyChallengeDate() : '';
      var progress = date ? localStorage.getItem('fate_daily_progress_' + date) : null;
      var bonus = date ? localStorage.getItem('fate_daily_bonus_' + date) : null;
      var payload = {};
      if(challenges) payload.challenges = JSON.parse(challenges);
      if(progress) payload.progress = JSON.parse(progress);
      if(date) payload.date = date;
      if(bonus) payload.bonusClaimed = true;
      _debouncedCloudWrite('daily', 'daily', payload, 500);
    } catch(e){}
  }

  function cloudSaveAIEloState(){
    if(!_cloudUid) return;
    try {
      var raw = localStorage.getItem('fate_ai_elo_state');
      if(raw) _debouncedCloudWrite('aiEloState', 'aiEloState', JSON.parse(raw), 600);
    } catch(e){}
  }

  function cloudSaveSocial(){
    if(!_cloudUid) return;
    try {
      var raw = localStorage.getItem('fate_social');
      if(raw) _debouncedCloudWrite('social', 'social', JSON.parse(raw), 600);
    } catch(e){}
  }

  function cloudSaveSettings(){
    if(!_cloudUid) return;
    var settings = {};
    try { settings.menuV2 = localStorage.getItem('fate_menu_v2'); } catch(e){}
    try { settings.sidePanel = localStorage.getItem('fate_side_panel'); } catch(e){}
    _debouncedCloudWrite('settings', 'settings', settings, 800);
  }

  function _buildCloudSavePayload(uid){
    var payload = {};
    var profile = typeof USER_PROFILE !== 'undefined' ? USER_PROFILE : null;
    if(profile){
      if(profile._fateAccountUid && profile._fateAccountUid !== uid){
        console.warn('[CloudSave] blocked cross-account full profile write');
      }else{
        payload.profile = Object.assign({}, profile, {_fateAccountUid:uid});
      }
    }
    var presets = typeof PRESET_DECKS !== 'undefined' ? PRESET_DECKS : null;
    if(presets != null) payload.presets = presets;
    var lb = typeof LEADERBOARD !== 'undefined' ? LEADERBOARD : null;
    if(lb) payload.leaderboard = lb;
    var pd = typeof PUBLIC_DECKS !== 'undefined' ? PUBLIC_DECKS : null;
    if(pd) payload.publicDecks = pd;
    try {
      var mh = localStorage.getItem('fate_match_history');
      if(mh) payload.matchHistory = JSON.parse(mh);
    } catch(e){}
    try {
      var dc = localStorage.getItem('fate_daily_challenges');
      var date = typeof getDailyChallengeDate === 'function' ? getDailyChallengeDate() : '';
      var prog = date ? localStorage.getItem('fate_daily_progress_' + date) : null;
      var bonus = date ? localStorage.getItem('fate_daily_bonus_' + date) : null;
      var daily = {};
      if(dc) daily.challenges = JSON.parse(dc);
      if(prog) daily.progress = JSON.parse(prog);
      if(date) daily.date = date;
      if(bonus) daily.bonusClaimed = true;
      if(Object.keys(daily).length) payload.daily = daily;
    } catch(e){}
    try {
      var ai = localStorage.getItem('fate_ai_elo_state');
      if(ai) payload.aiEloState = JSON.parse(ai);
    } catch(e){}
    try {
      var soc = localStorage.getItem('fate_social');
      if(soc) payload.social = JSON.parse(soc);
    } catch(e){}
    var settings = {};
    try { settings.menuV2 = localStorage.getItem('fate_menu_v2'); } catch(e){}
    try { settings.sidePanel = localStorage.getItem('fate_side_panel'); } catch(e){}
    payload.settings = settings;
    return payload;
  }

  // Save everything in a single batched write (used on sign-in migration)
  function cloudSaveAll(){
    if(!_cloudUid) return;
    if(_useFlyCloudSave()){
      var flyData = _buildCloudSavePayload(_cloudUid);
      if(Object.keys(flyData).length){
        _flyApiRequest('/api/player-save/' + encodeURIComponent(_cloudUid), {
          method:'POST',
          body:{uid:_cloudUid, data:flyData}
        }).catch(function(e){
          console.warn('[CloudSave] Fly batched migration write failed', e);
        });
      }
      return;
    }
    var FO = _fb();
    if(!FO) return;
    var batch = {};
    var uid = _cloudUid;
    var base = 'players/' + uid + '/';
    try {
      var payload = _buildCloudSavePayload(uid);
      Object.keys(payload).forEach(function(key){ batch[base + key] = payload[key]; });
    } catch(e){ console.warn('[CloudSave] batch build failed', e); }
    if(Object.keys(batch).length){
      FO.update(FO.ref(FO.rtdb), batch).catch(function(e){
        console.warn('[CloudSave] batched migration write failed', e);
      });
    }
  }

  // ─── CLOUD LOAD ───
  // Loads all data from Firebase and writes into globals + localStorage cache

  function cloudLoadAll(uid){
    if(_useFlyCloudSave()){
      return _flyApiRequest('/api/player-save/' + encodeURIComponent(uid), {method:'GET'})
        .then(function(res){
          var data = res && res.data;
          if(!data){
            console.log('[CloudSave] No Fly cloud data for ' + uid + ' - will upload current local data');
            return false;
          }
          console.log('[CloudSave] Loaded Fly cloud data for ' + uid);
          _applyCloudData(data, uid);
          return true;
        }).catch(function(e){
          console.warn('[CloudSave] Failed to load Fly cloud data', e);
          return false;
        });
    }
    var FO = _fb();
    if(!FO || !uid) return Promise.resolve(false);
    var playerRef = FO.ref(FO.rtdb, 'players/' + uid);
    return FO.get(playerRef).then(function(snap){
      var data = snap.val();
      if(!data){
        console.log('[CloudSave] No cloud data for ' + uid + ' — will upload current local data');
        return false;
      }
      console.log('[CloudSave] Loaded cloud data for ' + uid);
      _applyCloudData(data, uid);
      return true;
    }).catch(function(e){
      console.warn('[CloudSave] Failed to load cloud data', e);
      return false;
    });
  }

  function _cloudNormalizeUsername(name){
    return String(name == null ? '' : name).trim().toLowerCase().replace(/\\s+/g, ' ');
  }
  function _cloudIsLegacyStaleUsername(name){
    var normalized = _cloudNormalizeUsername(name);
    return normalized === 'poop god' || normalized === 'plyer' || normalized === 'player';
  }
  function _cloudRepairLegacyUsername(name, fallback){
    if(_cloudIsLegacyStaleUsername(name)) return fallback || 'Sic Kemper Tyrannus';
    return name;
  }

  function _applyCloudData(data, uid){
    var previousUsername = (typeof USER_PROFILE !== 'undefined' && USER_PROFILE && !_cloudIsLegacyStaleUsername(USER_PROFILE.username)) ? USER_PROFILE.username : 'Sic Kemper Tyrannus';
    if(typeof USER_PROFILE !== 'undefined') USER_PROFILE = createDefaultUserProfile();
    if(typeof PRESET_DECKS !== 'undefined') PRESET_DECKS = {};
    if(typeof LEADERBOARD !== 'undefined') LEADERBOARD = [];
    if(typeof PUBLIC_DECKS !== 'undefined') PUBLIC_DECKS = [];

    // Profile
    if(data.profile && typeof data.profile === 'object' && (!data.profile._fateAccountUid || data.profile._fateAccountUid === uid)){
      var defaults = {
        username:'Player', bio:'', profileImg:'blank.png', elo:600,
        wins:0, losses:0, level:1, xp:0, totalXp:0, featuredPresets:[],
        starterChosen:false, ownedCards:{}, ownedPfps:[], starlight:0,
        unopenedPacks:0, unopenedProfilePacks:0, unopenedFavoredPacks:0,
        challengerElo:600, challengerWins:0, challengerLosses:0,
        humanWins:0, humanLosses:0, matchesPlayed:0,
        challengerPresets:{}, lastFreePackClaim:0, createdAt:Date.now()
      };
      if(typeof USER_PROFILE !== 'undefined'){
        USER_PROFILE = Object.assign({}, defaults, data.profile, {_fateAccountUid:uid});
        USER_PROFILE.username = _cloudRepairLegacyUsername(USER_PROFILE.username || USER_PROFILE.displayName, previousUsername);
        if(USER_PROFILE.displayName) USER_PROFILE.displayName = _cloudRepairLegacyUsername(USER_PROFILE.displayName, USER_PROFILE.username);
      }
      try {
        var storageKey = uid ? 'fate_user_profile_' + uid : 'fate_user_profile';
        localStorage.setItem(storageKey, JSON.stringify(USER_PROFILE));
      } catch(e){}
    } else if(data.profile && typeof data.profile === 'object') {
      console.warn('[CloudSave] ignored profile stamped for another account');
    }

    // Presets
    if(data.presets && typeof data.presets === 'object'){
      if(typeof PRESET_DECKS !== 'undefined'){
        for(var pk in PRESET_DECKS) delete PRESET_DECKS[pk];
        for(var pk2 in data.presets) PRESET_DECKS[pk2] = data.presets[pk2];
      }
      try {
        var presetsKey = uid ? 'fate_user_presets_' + uid : 'fate_user_presets';
        localStorage.setItem(presetsKey, JSON.stringify(PRESET_DECKS));
      } catch(e){}
    }

    // Leaderboard
    if(Array.isArray(data.leaderboard)){
      if(typeof LEADERBOARD !== 'undefined'){
        LEADERBOARD.length = 0;
        data.leaderboard.forEach(function(e){ LEADERBOARD.push(e); });
      }
      try {
        var lbKey = uid ? 'fate_leaderboard_' + uid : 'fate_leaderboard';
        localStorage.setItem(lbKey, JSON.stringify(LEADERBOARD));
      } catch(e){}
    }

    // Public decks
    if(Array.isArray(data.publicDecks)){
      if(typeof PUBLIC_DECKS !== 'undefined'){
        PUBLIC_DECKS.length = 0;
        data.publicDecks.forEach(function(e){ PUBLIC_DECKS.push(e); });
      }
      try {
        var pdKey = uid ? 'fate_public_decks_' + uid : 'fate_public_decks';
        localStorage.setItem(pdKey, JSON.stringify(PUBLIC_DECKS));
      } catch(e){}
    }

    // Match history
    if(Array.isArray(data.matchHistory)){
      try { localStorage.setItem('fate_match_history', JSON.stringify(data.matchHistory)); } catch(e){}
    }

    // Daily challenges
    if(data.daily && typeof data.daily === 'object'){
      try {
        if(data.daily.challenges) localStorage.setItem('fate_daily_challenges', JSON.stringify(data.daily.challenges));
        if(data.daily.date && data.daily.progress) localStorage.setItem('fate_daily_progress_' + data.daily.date, JSON.stringify(data.daily.progress));
        if(data.daily.date && data.daily.bonusClaimed) localStorage.setItem('fate_daily_bonus_' + data.daily.date, '1');
      } catch(e){}
    }

    // AI ELO state
    if(data.aiEloState && typeof data.aiEloState === 'object'){
      try { localStorage.setItem('fate_ai_elo_state', JSON.stringify(data.aiEloState)); } catch(e){}
      if(typeof applyStoredAIEloStateToList === 'function'){
        if(typeof AI_OPPONENTS !== 'undefined') applyStoredAIEloStateToList(AI_OPPONENTS);
        if(typeof MONTHLY_AI_OPPONENTS !== 'undefined') applyStoredAIEloStateToList(MONTHLY_AI_OPPONENTS);
      }
    }

    // Social
    if(data.social && typeof data.social === 'object'){
      try { localStorage.setItem('fate_social', JSON.stringify(data.social)); } catch(e){}
    }

    // Settings
    if(data.settings && typeof data.settings === 'object'){
      try {
        if(data.settings.menuV2 != null) localStorage.setItem('fate_menu_v2', data.settings.menuV2);
        if(data.settings.sidePanel != null) localStorage.setItem('fate_side_panel', data.settings.sidePanel);
      } catch(e){}
    }
  }

  // ─── LOADING OVERLAY ───

  function isOnlineMatchLoadingUnsafe(){
    try{
      var g = typeof window.getFateGameState === 'function'
        ? window.getFateGameState()
        : (window.FATE_GAME_STATE || null);
      if(g && (g._onlineRoomCode || g._onlineBootstrappingRoomCode)) return true;
      if(document.getElementById('s-coin')?.classList.contains('active')) return true;
      if(document.getElementById('s-game')?.classList.contains('active')) return true;
      if(document.querySelector('.online-match-overview-modal')) return true;
    }catch(e){}
    return false;
  }

  function showCloudLoadingOverlay(){
    if(isOnlineMatchLoadingUnsafe()){
      window.__fateCloudLoadingActive = false;
      return;
    }
    if(_loadingOverlay) return;
    var startupOverlay = document.getElementById('fate-loading-screen');
    var canReuseStartupOverlay = !!(startupOverlay && !startupOverlay.classList.contains('fate-loading-assets-done') && !startupOverlay.classList.contains('is-hiding'));
    if(!canReuseStartupOverlay && (window.__fateMenusWarmed || window.__fateStartupLoadingManaged)){
      window.__fateCloudLoadingActive = false;
      window.__fateCloudLoadingSuppressed = true;
      return;
    }
    window.__fateCloudLoadingActive = true;
    _loadingOverlay = startupOverlay || document.createElement('div');
    const isAssetOverlay = _loadingOverlay.id === 'fate-loading-screen';
    _loadingOverlayWasAsset = isAssetOverlay;
    if(!isAssetOverlay) _loadingOverlay.id = 'cloud-loading-overlay';
    _loadingOverlay.className = 'fate-loading-screen fate-loading-cloud';
    _loadingOverlay.innerHTML =
      '<div class="fate-loading-panel">'
      + '<div class="fate-loading-kicker">Fates Entwined</div>'
      + '<div class="fate-loading-title">Loading Your Data</div>'
      + '<div class="fate-loading-copy">Syncing your profile, presets, collection, and online state.</div>'
      + '<div class="fate-loading-bar fate-loading-bar-indeterminate"><div id="fate-loading-fill"></div></div>'
      + '<div class="fate-loading-count" id="fate-loading-count">Cloud save</div>'
      + '</div>';
    if(!_loadingOverlay.parentNode) document.body.appendChild(_loadingOverlay);
  }

  function hideCloudLoadingOverlay(){
    if(!_loadingOverlay) return;
    window.__fateCloudLoadingActive = false;
    if(_loadingOverlayWasAsset && !_loadingOverlay.classList.contains('fate-loading-assets-done')){
      _loadingOverlay.classList.remove('fate-loading-cloud');
      const title = _loadingOverlay.querySelector('.fate-loading-title');
      const copy = _loadingOverlay.querySelector('.fate-loading-copy');
      const count = _loadingOverlay.querySelector('.fate-loading-count');
      if(title) title.textContent = 'Loading Assets';
      if(copy) copy.textContent = 'Preparing cards, portraits, backgrounds, and match UI.';
      if(count) count.textContent = 'Finishing assets';
      _loadingOverlay = null;
      _loadingOverlayWasAsset = false;
      return;
    }
    _loadingOverlay.style.opacity = '0';
    var el = _loadingOverlay;
    setTimeout(function(){ if(el && el.parentNode) el.remove(); }, 450);
    _loadingOverlay = null;
    _loadingOverlayWasAsset = false;
  }

  // ─── AUTH INTEGRATION ───
  // Called from the onAuthStateChanged flow

  function onCloudSignIn(uid){
    _clearCloudDebounceTimers();
    _cloudUid = uid;
    _cloudReady = false;
    window._fateCloudUid = uid;
    window._fateCloudReady = false;
    if(isOnlineMatchLoadingUnsafe()){
      _cloudReady = true;
      window._fateCloudReady = true;
      window.dispatchEvent(new CustomEvent('fate-cloud-ready', { detail: { uid: uid, deferred: true } }));
      console.log('[CloudSave] Deferred cloud data load during active online match for ' + uid);
      return Promise.resolve(false);
    }
    showCloudLoadingOverlay();

    var timedOut = false;
    var loadTimeout = 0;
    var loadPromise = cloudLoadAll(uid);
    var startupManagedLoad = !!(window.__fateStartupLoadingManaged || document.getElementById('fate-loading-screen'));
    var cloudLoadTimeoutMs = startupManagedLoad ? 30000 : 7000;
    var timeoutPromise = new Promise(function(resolve){
      loadTimeout = setTimeout(function(){
        timedOut = true;
        hideCloudLoadingOverlay();
        resolve(true);
      }, cloudLoadTimeoutMs);
    });

    return Promise.race([loadPromise, timeoutPromise]).then(function(hadCloudData){
      clearTimeout(loadTimeout);
      if(!hadCloudData){
        // First sign-in or no cloud data — push current local data up
        if(typeof window._fatePrepareAccountSwitch === 'function') window._fatePrepareAccountSwitch(uid);
        cloudSaveAll();
      }
      _cloudReady = true;
      window._fateCloudReady = true;

      // Re-run the profile/preset load to refresh UI with cloud data
      if(typeof loadPresetsFromStorage === 'function') loadPresetsFromStorage();
      if(typeof normalizeOwnedPfps === 'function') normalizeOwnedPfps();
      if(typeof seedBuiltInPresets === 'function') seedBuiltInPresets();
      if(typeof syncStarterPresetMetadata === 'function') syncStarterPresetMetadata();
      if(typeof updateLeaderboardEntry === 'function') updateLeaderboardEntry();
      if(typeof safeRenderTitleProfile === 'function') safeRenderTitleProfile();
      if(typeof loadSocial === 'function') loadSocial();

      hideCloudLoadingOverlay();

      window.dispatchEvent(new CustomEvent('fate-cloud-ready', { detail: { uid: uid } }));
      if(window.__fateMenusWarmed && typeof window.fateWarmProfileDependentMenus === 'function'){
        setTimeout(function(){ window.fateWarmProfileDependentMenus().catch(function(){}); }, 0);
      }
      console.log('[CloudSave] Cloud data ready for ' + uid + (timedOut ? ' after loading screen timeout' : ''));
    }).catch(function(e){
      clearTimeout(loadTimeout);
      console.warn('[CloudSave] sign-in load failed, using local data', e);
      _cloudReady = true;
      window._fateCloudReady = true;
      hideCloudLoadingOverlay();
    });
  }

  function onCloudSignOut(){
    _cloudUid = null;
    _cloudReady = false;
    window._fateCloudUid = null;
    window._fateCloudReady = false;
    _clearCloudDebounceTimers();
  }

  // ─── EXPOSE ───

  window.FateCloudSave = {
    saveProfile: cloudSaveProfile,
    savePresets: cloudSavePresets,
    saveLeaderboard: cloudSaveLeaderboard,
    savePublicDecks: cloudSavePublicDecks,
    saveMatchHistory: cloudSaveMatchHistory,
    saveDailyChallenges: cloudSaveDailyChallenges,
    saveAIEloState: cloudSaveAIEloState,
    saveSocial: cloudSaveSocial,
    saveSettings: cloudSaveSettings,
    saveAll: cloudSaveAll,
    loadAll: cloudLoadAll,
    onSignIn: onCloudSignIn,
    onSignOut: onCloudSignOut,
    showLoading: showCloudLoadingOverlay,
    hideLoading: hideCloudLoadingOverlay
  };

})();
