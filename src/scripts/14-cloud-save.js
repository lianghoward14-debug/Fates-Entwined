// FATES ENTWINED — CLOUD SAVE LAYER
// Stores all player data in Firebase RTDB under players/{uid}/.
// localStorage is kept as a fast cache; Firebase is the source of truth.
// Requires window.FateOnline (from 15-online-auth.js) for Firebase access.

(function(){
  'use strict';

  var _cloudSaveDebounceTimers = {};
  var _cloudReady = false;
  var _cloudUid = null;
  var _loadingOverlay = null;
  var _loadingOverlayWasAsset = false;

  window._fateCloudReady = false;
  window._fateCloudUid = null;

  function _fb(){
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

  // Save everything in a single batched write (used on sign-in migration)
  function cloudSaveAll(){
    if(!_cloudUid) return;
    var FO = _fb();
    if(!FO) return;
    var batch = {};
    var uid = _cloudUid;
    var base = 'players/' + uid + '/';
    try {
      var profile = typeof USER_PROFILE !== 'undefined' ? USER_PROFILE : null;
      if(profile) batch[base + 'profile'] = Object.assign({}, profile, {_fateAccountUid:uid});
      var presets = typeof PRESET_DECKS !== 'undefined' ? PRESET_DECKS : null;
      if(presets != null) batch[base + 'presets'] = presets;
      var lb = typeof LEADERBOARD !== 'undefined' ? LEADERBOARD : null;
      if(lb) batch[base + 'leaderboard'] = lb;
      var pd = typeof PUBLIC_DECKS !== 'undefined' ? PUBLIC_DECKS : null;
      if(pd) batch[base + 'publicDecks'] = pd;
      try { var mh = localStorage.getItem('fate_match_history'); if(mh) batch[base + 'matchHistory'] = JSON.parse(mh); } catch(e){}
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
        if(Object.keys(daily).length) batch[base + 'daily'] = daily;
      } catch(e){}
      try { var ai = localStorage.getItem('fate_ai_elo_state'); if(ai) batch[base + 'aiEloState'] = JSON.parse(ai); } catch(e){}
      try { var soc = localStorage.getItem('fate_social'); if(soc) batch[base + 'social'] = JSON.parse(soc); } catch(e){}
      var settings = {};
      try { settings.menuV2 = localStorage.getItem('fate_menu_v2'); } catch(e){}
      try { settings.sidePanel = localStorage.getItem('fate_side_panel'); } catch(e){}
      batch[base + 'settings'] = settings;
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

  function _applyCloudData(data, uid){
    if(typeof USER_PROFILE !== 'undefined') USER_PROFILE = createDefaultUserProfile();
    if(typeof PRESET_DECKS !== 'undefined') PRESET_DECKS = {};
    if(typeof LEADERBOARD !== 'undefined') LEADERBOARD = [];
    if(typeof PUBLIC_DECKS !== 'undefined') PUBLIC_DECKS = [];

    // Profile
    if(data.profile && typeof data.profile === 'object'){
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
      }
      try {
        var storageKey = uid ? 'fate_user_profile_' + uid : 'fate_user_profile';
        localStorage.setItem(storageKey, JSON.stringify(USER_PROFILE));
      } catch(e){}
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

  function showCloudLoadingOverlay(){
    if(_loadingOverlay) return;
    window.__fateCloudLoadingActive = true;
    _loadingOverlay = document.getElementById('fate-loading-screen') || document.createElement('div');
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
    showCloudLoadingOverlay();

    return cloudLoadAll(uid).then(function(hadCloudData){
      if(!hadCloudData){
        // First sign-in or no cloud data — push current local data up
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
      console.log('[CloudSave] Cloud data ready for ' + uid);
    }).catch(function(e){
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
