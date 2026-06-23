//  INIT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
var _titleProfileSig = '';
function getTitleProfileSig(){
  var p = {};
  try { p = (typeof USER_PROFILE !== 'undefined' && USER_PROFILE) ? USER_PROFILE : (window.USER_PROFILE || {}); } catch(e) { p = window.USER_PROFILE || {}; }
  return [
    p.username || '',
    p.bio || '',
    p.level || 1,
    p.xp || 0,
    p.elo || 600,
    p.challengerElo || 600,
    p.wins || 0,
    p.losses || 0,
    p.challengerWins || 0,
    p.challengerLosses || 0,
    JSON.stringify(p.profileImg || '')
  ].join('|');
}
function safeRenderTitleProfile(){
  if(typeof renderTitleProfile !== 'function') return;
  var sig = getTitleProfileSig();
  var profile = document.getElementById('title-profile');
  if(profile && profile.dataset.titleProfileMounted === '1' && profile.dataset.titleProfileSig === sig) return;
  try {
    renderTitleProfile();
    profile = document.getElementById('title-profile');
    if(profile){
      profile.dataset.titleProfileMounted = '1';
      profile.dataset.titleProfileSig = sig;
    }
    _titleProfileSig = sig;
  } catch(e) {
    console.warn('Title profile render failed', e);
  }
}

function isPerformanceModeEnabled(){
  // Always on — button hidden, perf mode is the default for all players
  return true;
}

function applyPerformanceMode(enabled){
  const plusOn = !!enabled;
  document.documentElement.classList.add('fate-performance-mode');
  document.documentElement.classList.toggle('fate-performance-plus-mode', plusOn);
  if(document.body) {
    document.body.classList.add('fate-performance-mode');
    document.body.classList.toggle('fate-performance-plus-mode', plusOn);
  }
  const btn = document.getElementById('title-performance-toggle');
  if(btn){
    btn.classList.toggle('on', plusOn);
    btn.setAttribute('aria-pressed', plusOn ? 'true' : 'false');
    const label = btn.querySelector('.perf-toggle-copy span');
    const state = btn.querySelector('.perf-toggle-copy b');
    if(label) label.textContent = 'Performance';
    if(state) state.textContent = plusOn ? 'Boost' : 'Balanced';
    btn.title = plusOn ? 'Performance Boost is on' : 'Performance Boost is off';
  }
}

function togglePerformanceMode(){
  const next = !isPerformanceModeEnabled();
  try{ localStorage.setItem('fate_perf_plus_mode', next ? '1' : '0'); }catch(e){}
  applyPerformanceMode(next);
  if(typeof toast === 'function') toast(next ? 'Performance Boost on' : 'Performance Boost off');
}

function initPerformanceModeToggle(){
  // Button removed — perf mode is always on for all players.
  // Remove any leftover button from earlier sessions.
  var btn = document.getElementById('title-performance-toggle');
  if(btn) btn.remove();
  applyPerformanceMode(true);
}

if(typeof window !== 'undefined'){
  window.togglePerformanceMode = togglePerformanceMode;
  window.applyPerformanceMode = applyPerformanceMode;
}

applyPerformanceMode(isPerformanceModeEnabled());

function isSuperPerformanceModeEnabled(){
  return true;
}

function applySuperPerformanceMode(enabled){
  const on = true;
  document.documentElement.classList.toggle('fate-super-performance-mode', on);
  if(document.body) document.body.classList.toggle('fate-super-performance-mode', on);
  const btn = document.getElementById('title-super-performance-toggle');
  if(btn){
    btn.remove();
  }
}

function toggleSuperPerformanceMode(){
  localStorage.setItem('fate_super_perf_mode', '1');
  applySuperPerformanceMode(true);
}

function initSuperPerformanceModeToggle(){
  localStorage.setItem('fate_super_perf_mode', '1');
  const btn = document.getElementById('title-super-performance-toggle');
  if(btn) btn.remove();
  applySuperPerformanceMode(true);
}

if(typeof window !== 'undefined'){
  window.toggleSuperPerformanceMode = toggleSuperPerformanceMode;
  window.applySuperPerformanceMode = applySuperPerformanceMode;
}

applySuperPerformanceMode(true);

function initCtrlWheelZoom(){
  if(window.__FATES_CTRL_WHEEL_ZOOM_INSTALLED) return;
  window.__FATES_CTRL_WHEEL_ZOOM_INSTALLED = true;

  var minZoom = 0.75;
  var maxZoom = 1.35;
  var zoomStorageKey = 'fate_game_zoom';
  var zoom = readStoredZoom();
  var zoomIndicatorTimer = 0;

  function clampZoom(value){
    var n = Number(value);
    if(!Number.isFinite(n)) return 1;
    return Math.max(minZoom, Math.min(maxZoom, Math.round(n * 100) / 100));
  }

  function readStoredZoom(){
    try {
      return clampZoom(localStorage.getItem(zoomStorageKey) || 1);
    } catch(e) {
      return 1;
    }
  }

  function saveStoredZoom(next){
    try {
      localStorage.setItem(zoomStorageKey, String(clampZoom(next)));
    } catch(e) {}
  }

  function applyCssFallbackZoom(next){
    if(!document.body) return next;
    document.body.style.zoom = Math.abs(next - 1) < 0.001 ? '' : String(next);
    document.documentElement.classList.toggle('fate-user-zoom-active', Math.abs(next - 1) >= 0.001);
    return next;
  }

  function ensureZoomIndicator(){
    var el = document.getElementById('fate-zoom-indicator');
    if(el || !document.body) return el;
    el = document.createElement('div');
    el.id = 'fate-zoom-indicator';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    return el;
  }

  function showZoomIndicator(next){
    var el = ensureZoomIndicator();
    if(!el) return;
    var percent = Math.round(clampZoom(next) * 100);
    el.textContent = 'Zoom ' + percent + '%';
    el.classList.add('is-visible');
    window.clearTimeout(zoomIndicatorTimer);
    zoomIndicatorTimer = window.setTimeout(function(){
      el.classList.remove('is-visible');
    }, 1100);
  }

  function setGameZoom(next, options){
    options = options || {};
    zoom = clampZoom(next);
    saveStoredZoom(zoom);
    if(!options.silent) showZoomIndicator(zoom);
    if(window.FateElectronZoom && typeof window.FateElectronZoom.set === 'function'){
      window.FateElectronZoom.set(zoom).then(function(actual){
        zoom = clampZoom(actual);
        saveStoredZoom(zoom);
        if(!options.silent) showZoomIndicator(zoom);
      }).catch(function(){
        applyCssFallbackZoom(zoom);
      });
    } else {
      applyCssFallbackZoom(zoom);
    }
    return zoom;
  }

  function resetGameZoom(){
    return setGameZoom(1);
  }

  function reapplyStoredZoom(){
    zoom = readStoredZoom();
    return setGameZoom(zoom, {silent:true});
  }

  if(window.FateElectronZoom && typeof window.FateElectronZoom.get === 'function'){
    window.FateElectronZoom.get().then(function(actual){
      var hasStored = false;
      try { hasStored = localStorage.getItem(zoomStorageKey) !== null; } catch(e) {}
      var stored = readStoredZoom();
      zoom = hasStored ? stored : clampZoom(actual || 1);
      setGameZoom(zoom, {silent:true});
    }).catch(function(){ reapplyStoredZoom(); });
  } else {
    reapplyStoredZoom();
  }

  document.addEventListener('wheel', function(e){
    if(!e.ctrlKey || e.metaKey) return;
    if(e.target && e.target.closest && e.target.closest('input,textarea,select')) return;
    e.preventDefault();
    e.stopPropagation();
    var direction = e.deltaY > 0 ? -1 : 1;
    setGameZoom(zoom + direction * 0.05);
  }, {capture:true, passive:false});

  document.addEventListener('keydown', function(e){
    if(!e.ctrlKey || e.metaKey) return;
    if(e.key !== '0') return;
    e.preventDefault();
    resetGameZoom();
  }, true);

  window.addEventListener('fate-screen-changed', function(){
    reapplyStoredZoom();
  });
  window.addEventListener('focus', function(){
    reapplyStoredZoom();
  });

  window.fateSetGameZoom = setGameZoom;
  window.fateResetGameZoom = resetGameZoom;
  window.fateGetGameZoom = function(){ return zoom; };
}

function ensureTitleMissionControlButton(){
  var stack = document.querySelector('#s-title .title-menu-stack');
  if(!stack) return;

  var buttons = Array.prototype.slice.call(stack.querySelectorAll('button'));
  var missionBtn = document.getElementById('title-mission-control-btn') || buttons.find(function(btn){
    var text = (btn.textContent || '').trim().toLowerCase();
    var action = btn.getAttribute('onclick') || '';
    return text === 'mission control' || action.indexOf('showMissionControl') !== -1;
  });
  var profileBtn = buttons.find(function(btn){
    var text = (btn.textContent || '').trim().toLowerCase();
    var action = btn.getAttribute('onclick') || '';
    return text === 'profile' || action.indexOf('showProfile') !== -1;
  });

  if(!missionBtn){
    missionBtn = profileBtn || document.createElement('button');
    if(!profileBtn){
      var anchor = document.getElementById('title-audio-panel') || document.getElementById('title-exit-game-btn');
      stack.insertBefore(missionBtn, anchor || null);
    }
  }

  missionBtn.id = 'title-mission-control-btn';
  missionBtn.className = 'btn title-btn title-btn-mission';
  missionBtn.textContent = 'Mission Control';
  missionBtn.setAttribute('onclick', 'playMenuSfx();showMissionControl()');
  missionBtn.setAttribute('title', 'Open Mission Control');
}

document.addEventListener('DOMContentLoaded', ()=>{
  try{ localStorage.removeItem('fate_layout_scale_mode'); }catch(e){}

  // ONE-TIME RESET: Bump version key to force reset on update
  if(!localStorage.getItem('fate_reset_v9_playerdata_done')){
    const keysToRemove = [];
    for(let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if(k && k.startsWith('fate_')) keysToRemove.push(k);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    localStorage.setItem('fate_reset_v9_playerdata_done','1');
    location.reload();
    return;
  }

  // Show loading overlay early if a Firebase session may be resuming.
  // The cloud save module will hide it once data loads (or after timeout).
  if(window.FateCloudSave && !fateIsElectronShell()){
    window.FateCloudSave.showLoading();
    // Safety timeout: hide overlay if auth never fires (e.g. not signed in)
    window._fateCloudLoadingTimeout = setTimeout(function(){
      if(window.FateCloudSave) window.FateCloudSave.hideLoading();
    }, 4000);
    // Listen for cloud-ready to clear the timeout
    window.addEventListener('fate-cloud-ready', function(){
      clearTimeout(window._fateCloudLoadingTimeout);
    }, {once:true});
    // Also hide if auth resolves with no user
    window.addEventListener('fate-online-auth', function(e){
      if(e.detail && e.detail.ready && !e.detail.user){
        clearTimeout(window._fateCloudLoadingTimeout);
        if(window.FateCloudSave) window.FateCloudSave.hideLoading();
      }
    }, {once:true});
  }

  loadPresetsFromStorage();
  if(typeof syncAudioControls === 'function') syncAudioControls();
  normalizeOwnedPfps();
  seedBuiltInPresets();
  if(typeof syncStarterPresetMetadata === 'function') syncStarterPresetMetadata();
  initPerformanceModeToggle();
  initSuperPerformanceModeToggle();
  initCtrlWheelZoom();
  ensureTitleMissionControlButton();

  // Menu V2 skin — add fate-menu-v2 class to title screen.
  // To revert: run localStorage.setItem('fate_menu_v2','off') in console and refresh,
  // or call window.toggleMenuV2() to toggle.
  (function(){
    var pref = localStorage.getItem('fate_menu_v2');
    var on = pref !== 'off'; // on by default
    var title = document.getElementById('s-title');
    if(title) title.classList.toggle('fate-menu-v2', on);
    window.toggleMenuV2 = function(){
      var now = document.getElementById('s-title')?.classList.toggle('fate-menu-v2');
      localStorage.setItem('fate_menu_v2', now ? 'on' : 'off');
      if(typeof toast === 'function') toast('Menu V2 ' + (now ? 'ON' : 'OFF'));
      return now;
    };
  })();

  safeRenderTitleProfile();
  requestAnimationFrame(safeRenderTitleProfile);
  setTimeout(safeRenderTitleProfile, 80);
  closeAllOverlays();
  // Initialize social system
  if(typeof loadSocial==='function') loadSocial();
  if(typeof initWorldChat==='function') initWorldChat();
  if(typeof checkDailyLoginOnStartup === 'function') checkDailyLoginOnStartup();

  // Side Panel layout — moves profile, daily challenges, and world chat
  // into a permanent right-side panel on the title screen.
  // To revert: localStorage.setItem('fate_side_panel','off') + refresh,
  // or call window.toggleSidePanel().
  (function(){
    var pref = localStorage.getItem('fate_side_panel');
    var on = pref === 'on'; // off by default
    var title = document.getElementById('s-title');
    if(title) title.classList.toggle('fate-side-panel', on);
    if(on) setTimeout(function(){ initSidePanel(); }, 120);
    window.toggleSidePanel = function(){
      var t = document.getElementById('s-title');
      if(!t) return;
      var now = t.classList.toggle('fate-side-panel');
      localStorage.setItem('fate_side_panel', now ? 'on' : 'off');
      if(now) initSidePanel();
      else teardownSidePanel();
      if(typeof toast === 'function') toast('Side Panel ' + (now ? 'ON' : 'OFF'));
      return now;
    };
  })();
  // Ensure current user is in leaderboard
  updateLeaderboardEntry();
  // Manual-only fullscreen. Auto fullscreen on the first click can steal a real
  // game/menu click and forces a resize, which also aggravates browser throttle.
  window.fateEnterFullscreen = function(){
    const el = document.documentElement;
    if(el.requestFullscreen && !document.fullscreenElement) return el.requestFullscreen().catch(()=>{});
    if(el.webkitRequestFullscreen && !document.webkitFullscreenElement) return el.webkitRequestFullscreen();
  };

  // Render title profile summary
  safeRenderTitleProfile();
  // Inject Fate icon into title
  const fateIconEl = document.getElementById('title-fate-icon');
  if(fateIconEl) fateIconEl.innerHTML = FATE_ICON;
  // Global UI click sound for all .btn elements and deck builder cards
  document.addEventListener('click',(e)=>{
    // Differentiated click sounds for menu diversity
    const el = e.target;
    const btn = el.closest('.btn,.btn-buy');
    const filter = el.closest('.db-filter');
    const tab = el.closest('.ch-tab');
    const card = el.closest('.db-mc,.mc,.coll-card,.pack-card-wrap,.db-deck-row');
    if(btn){
      const txt = (btn.textContent||'').toLowerCase().trim();
      if(btn.classList.contains('danger')) playSfx('danger');
      else if(txt.includes('play vs') || txt === 'start game') playSfx('playBtn');
      else if(txt.includes('back')) playSfx('backBtn');
      else playSfx('uiClick');
    }
    else if(filter) playSfx('categorySwitch');
    else if(tab) playSfx('categorySwitch');
    else if(card) playSfx('uiClick');
  });
  // Card hover sound (hand and board). Keep the tactile ping, but throttle it
  // so moving across dense board/hand cards does not stack loud click sounds.
  let _lastHoverIid = null;
  let _lastHoverAt = 0;
  document.addEventListener('mouseenter',(e)=>{
    const cardEl = e.target.closest && (e.target.closest('.hc') || e.target.closest('.bc'));
    if(!cardEl) return;
    const iid = cardEl.dataset.iid || cardEl.className;
    const now = Date.now();
    if(iid !== _lastHoverIid && now - _lastHoverAt > 180){
      _lastHoverIid = iid;
      _lastHoverAt = now;
      if(typeof playSfx === 'function') playSfx('hover');
    }
  }, true);
  document.addEventListener('mouseleave',(e)=>{
    const cardEl = e.target.closest && (e.target.closest('.hc') || e.target.closest('.bc'));
    if(cardEl) _lastHoverIid = null;
  }, true);
  // Auto-start music — browsers block autoplay without gesture, so we retry on first click
  if(_musicEnabled){
    let _musicStarted = false;
    const tryStart = ()=>{
      if(_musicStarted) return;
      if(typeof startMusic === 'function') startMusic();
      else if(typeof playBgMusic === 'function') playBgMusic();
      // Check if it actually started playing
      if((_bgMusic && !_bgMusic.paused) || (_gameMusic && !_gameMusic.paused)) _musicStarted = true;
    };
    tryStart(); // try immediately (works if returning user with prior interaction)
    const startOnce = ()=>{
      if(!_musicStarted) tryStart();
      if(_musicStarted){
        document.removeEventListener('click',startOnce);
        document.removeEventListener('keydown',startOnce);
        document.removeEventListener('touchstart',startOnce);
      }
    };
    document.addEventListener('click',startOnce);
    document.addEventListener('keydown',startOnce);
    document.addEventListener('touchstart',startOnce);
  }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function fateScheduleIdle(fn, timeout) {
  if(typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(fn, {timeout:timeout || 1200});
  } else {
    setTimeout(fn, timeout || 120);
  }
}

function fateIsElectronShell() {
  try {
    if(/[?&]electron=1(?:&|$)/.test(location.search || '')) return true;
    return /Electron/i.test(navigator.userAgent || '');
  } catch(e) {
    return false;
  }
}

function warmFirstInteractionUi() {
  if(window.__fateFirstInteractionUiWarmed) return;
  window.__fateFirstInteractionUiWarmed = true;
  const electronShell = fateIsElectronShell();
  fateScheduleIdle(function(){
    try {
      if(document.fonts && typeof document.fonts.load === 'function') {
        document.fonts.load('900 14px Cinzel');
        document.fonts.load('700 12px system-ui');
      }
      ['blank.png'].forEach(function(src){
        const img = new Image();
        img.decoding = 'async';
        img.loading = 'eager';
        img.src = src;
        if(typeof img.decode === 'function') img.decode().catch(function(){});
      });
    } catch(e) {}
  }, electronShell ? 1400 : 260);

  setTimeout(function(){
    fateScheduleIdle(function(){
      try {
        [
          'optimized/backgrounds/ingamebackgrouds_igb9.jpg',
          'optimized/backgrounds/ingamebackgrouds_igb4.jpg',
          'optimized/backgrounds/ingamebackgrouds_igb1.jpg'
        ].forEach(function(src){
          const img = new Image();
          img.decoding = 'async';
          img.loading = 'lazy';
          img.src = typeof FATE_BACKGROUND_URL === 'function' && src.indexOf('optimized/') === 0 ? FATE_BACKGROUND_URL(src) : src;
        });
      } catch(e) {}
    }, electronShell ? 3000 : 900);
  }, electronShell ? 5200 : 520);
}

document.addEventListener('DOMContentLoaded', ()=>{
  const freePlayBtn = document.getElementById('title-free-play-btn');
  const challengerBtn = document.getElementById('title-challenger-btn');
  const openFreePlayFromTitle = function(e){
    if(e) e.preventDefault();
    if(typeof playMenuSfx === 'function') playMenuSfx();
    openFreePlayMenu();
  };
  const openChallengerFromTitle = function(e){
    if(e) e.preventDefault();
    if(typeof playMenuSfx === 'function') playMenuSfx();
    openChallengerMenu();
  };
  if(freePlayBtn) freePlayBtn.onclick = openFreePlayFromTitle;
  if(challengerBtn) challengerBtn.onclick = openChallengerFromTitle;
  document.querySelectorAll('#s-title .btn.pri').forEach(btn=>{
    const label = (btn.textContent || '').toLowerCase();
    if(label.includes('free play')) btn.onclick = openFreePlayFromTitle;
    if(label.includes('challenger')) btn.onclick = openChallengerFromTitle;
  });
  warmFirstInteractionUi();
});

// Expose functions needed by inline onclick handlers
window.openFreePlayMenu = openFreePlayMenu;
window.openChallengerMenu = openChallengerMenu;
window.dbFilter = dbFilter;
window.setMasterVolume = setMasterVolume;
window.setMusicVolume = setMusicVolume;
window.startMusic = startMusic;
window.fateAudioReport = fateAudioReport;
window.fateRestartMusic = fateRestartMusic;
window.setSfxVolume = setSfxVolume;
window.setVoiceVolume = setVoiceVolume;
window.showAIDifficultyPicker = showAIDifficultyPicker;
window.pickAIOpponent = pickAIOpponent;
window.showLeaderboard = showLeaderboard;
window.pickStarterDeck = pickStarterDeck;
window.switchChTab = switchChTab;
window.chStartVsAI = chStartVsAI;
window.chStartWithDeck = chStartWithDeck;
window.buyPack = buyPack;
window.buyProfilePack = buyProfilePack;
window.openNextPack = openNextPack;
window.openNextProfilePack = openNextProfilePack;
window.closePackOpening = closePackOpening;
window.setCollFilter = setCollFilter;
window.setCdbFilter = setCdbFilter;
window.openSellPfpModal = openSellPfpModal;
window.cdbNewDeck = cdbNewDeck;
window.cdbEditDeck = cdbEditDeck;
window.cdbEditAppearance = cdbEditAppearance;
window.browseChallengerDecks = browseChallengerDecks;
window.viewChallengerDeckContents = viewChallengerDeckContents;
window.cdbSaveDeck = cdbSaveDeck;
window.cdbDeleteDeck = cdbDeleteDeck;
window.cdbClear = cdbClear;
window.cdbRemove = cdbRemove;

// ═══════════════════════════════════════════════════════════════
// ENHANCEMENTS (merged from 14-enhancements.js)
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
//  14-ENHANCEMENTS.js
// ═══════════════════════════════════════════════════════════════

/* ── 1. NEW SOUND EFFECTS ── */
(function(){
  if(window.__FATES_ENHANCED_SFX_INSTALLED) return;
  window.__FATES_ENHANCED_SFX_INSTALLED = true;
  var _orig = window.playSfx || (typeof playSfx==='function' ? playSfx : null);
  var _types = {cardInfoOpen:1,cardAddToHand:1,fateGain:1,fateLose:1,cardSetEnhanced:1,discardCard:1,dragStart:1,dragDrop:1};
  function enhanced(type){
    if(!_types[type]){if(_orig)return _orig(type);return;}
    if(typeof _masterVol!=='undefined'&&_masterVol<=0)return;
    var ev=(type==='cardInfoOpen'||type==='cardAddToHand')?(typeof _menuVol!=='undefined'?_menuVol:1):(typeof _sfxVol!=='undefined'?_sfxVol:0.8);
    if(ev<=0)return;
    try{
      var ctx=getAudioCtx(),vol=ctx.createGain(),now=ctx.currentTime;
      vol.gain.value=(typeof _masterVol!=='undefined'?_masterVol:1)*ev*1.2;
      if(typeof window.getFateSfxBus==='function') vol.connect(window.getFateSfxBus(ctx).input);
      else { var comp=ctx.createDynamicsCompressor();comp.threshold.value=-12;comp.knee.value=6;comp.ratio.value=3;comp.attack.value=0.003;comp.release.value=0.15;vol.connect(comp);comp.connect(ctx.destination); }
      function cachedNoise(dur,dc,gv,variant){return typeof window.getCachedFateSfxNoiseBuffer==='function'?window.getCachedFateSfxNoiseBuffer(ctx,dur,dc,gv,variant):null;}
      function nb(dur,dc,gv,ft,ff,fq){var b=cachedNoise(dur,dc,gv)||ctx.createBuffer(1,ctx.sampleRate*dur,ctx.sampleRate);if(!b.__fateNoiseFilled&&typeof window.getCachedFateSfxNoiseBuffer!=='function'){var d=b.getChannelData(0);for(var i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,dc)*gv;b.__fateNoiseFilled=1;}var s=ctx.createBufferSource();s.buffer=b;if(ft){var f=ctx.createBiquadFilter();f.type=ft;f.frequency.value=ff||800;if(fq)f.Q.value=fq;s.connect(f);f.connect(vol);}else s.connect(vol);return s;}
      if(type==='cardInfoOpen'){var fl=cachedNoise(0.08,0,0.18,'sine')||ctx.createBuffer(1,ctx.sampleRate*0.08,ctx.sampleRate);if(!fl.__fateNoiseFilled&&typeof window.getCachedFateSfxNoiseBuffer!=='function'){var fd=fl.getChannelData(0);for(var i=0;i<fd.length;i++)fd[i]=(Math.random()*2-1)*Math.sin(Math.PI*i/fd.length)*0.18;fl.__fateNoiseFilled=1;}var fs=ctx.createBufferSource();fs.buffer=fl;var bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=2800;bp.Q.value=1.8;fs.connect(bp);bp.connect(vol);fs.start(now);var ch=ctx.createOscillator();ch.type='sine';ch.frequency.value=880;var cg=ctx.createGain();cg.gain.setValueAtTime(0.1,now+0.03);cg.gain.exponentialRampToValueAtTime(0.001,now+0.22);ch.connect(cg);cg.connect(vol);ch.start(now+0.03);ch.stop(now+0.25);}
      else if(type==='cardAddToHand'){var b2=ctx.createBuffer(1,ctx.sampleRate*0.1,ctx.sampleRate),d2=b2.getChannelData(0);for(var i=0;i<d2.length;i++){var t=i/d2.length;d2[i]=(Math.random()*2-1)*Math.sin(Math.PI*t)*0.25*(1-t*0.6);}var s2=ctx.createBufferSource();s2.buffer=b2;var fb=ctx.createBiquadFilter();fb.type='bandpass';fb.frequency.setValueAtTime(1500,now);fb.frequency.exponentialRampToValueAtTime(3500,now+0.08);fb.Q.value=2;s2.connect(fb);fb.connect(vol);s2.start(now);var sn=ctx.createOscillator();sn.type='triangle';sn.frequency.setValueAtTime(2200,now+0.06);sn.frequency.exponentialRampToValueAtTime(900,now+0.09);var sg=ctx.createGain();sg.gain.setValueAtTime(0.12,now+0.06);sg.gain.exponentialRampToValueAtTime(0.001,now+0.1);sn.connect(sg);sg.connect(vol);sn.start(now+0.06);sn.stop(now+0.12);}
      else if(type==='fateGain'){[660,880,1100].forEach(function(f,i){var o=ctx.createOscillator();o.type='sine';o.frequency.value=f;var g=ctx.createGain();g.gain.setValueAtTime(0,now+i*0.04);g.gain.linearRampToValueAtTime(0.1,now+i*0.04+0.01);g.gain.exponentialRampToValueAtTime(0.001,now+i*0.04+0.2);o.connect(g);g.connect(vol);o.start(now+i*0.04);o.stop(now+i*0.04+0.22);});}
      else if(type==='fateLose'){var o=ctx.createOscillator();o.type='sawtooth';o.frequency.setValueAtTime(400,now);o.frequency.exponentialRampToValueAtTime(120,now+0.18);var g=ctx.createGain();g.gain.setValueAtTime(0.12,now);g.gain.exponentialRampToValueAtTime(0.001,now+0.22);var lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.setValueAtTime(1500,now);lp.frequency.exponentialRampToValueAtTime(200,now+0.2);o.connect(lp);lp.connect(g);g.connect(vol);o.start(now);o.stop(now+0.24);nb(0.03,2.5,0.25,'bandpass',800,2).start(now);}
      else if(type==='cardSetEnhanced'){var sb=ctx.createOscillator();sb.type='sine';sb.frequency.setValueAtTime(80,now);sb.frequency.exponentialRampToValueAtTime(30,now+0.2);var sg2=ctx.createGain();sg2.gain.setValueAtTime(0.35,now);sg2.gain.exponentialRampToValueAtTime(0.001,now+0.3);sb.connect(sg2);sg2.connect(vol);sb.start(now);sb.stop(now+0.32);nb(0.05,2,0.45,'bandpass',1100,3).start(now);var bd=ctx.createOscillator();bd.type='triangle';bd.frequency.value=120;var bg=ctx.createGain();bg.gain.setValueAtTime(0.2,now+0.02);bg.gain.exponentialRampToValueAtTime(0.001,now+0.22);bd.connect(bg);bg.connect(vol);bd.start(now+0.02);bd.stop(now+0.24);}
      else if(type==='discardCard'){var b3=ctx.createBuffer(1,ctx.sampleRate*0.25,ctx.sampleRate),d3=b3.getChannelData(0);for(var i=0;i<d3.length;i++){var t=i/d3.length;d3[i]=(Math.random()*2-1)*Math.pow(1-t,1.4)*0.3;}var s3=ctx.createBufferSource();s3.buffer=b3;var fi=ctx.createBiquadFilter();fi.type='lowpass';fi.frequency.setValueAtTime(4000,now);fi.frequency.exponentialRampToValueAtTime(200,now+0.25);s3.connect(fi);fi.connect(vol);s3.start(now);}
      else if(type==='dragStart'){var o2=ctx.createOscillator();o2.type='sine';o2.frequency.value=600;var g2=ctx.createGain();g2.gain.setValueAtTime(0.06,now);g2.gain.exponentialRampToValueAtTime(0.001,now+0.06);o2.connect(g2);g2.connect(vol);o2.start(now);o2.stop(now+0.08);}
      else if(type==='dragDrop'){var th=ctx.createOscillator();th.type='sine';th.frequency.setValueAtTime(100,now);th.frequency.exponentialRampToValueAtTime(45,now+0.12);var tg=ctx.createGain();tg.gain.setValueAtTime(0.3,now);tg.gain.exponentialRampToValueAtTime(0.001,now+0.18);th.connect(tg);tg.connect(vol);th.start(now);th.stop(now+0.2);nb(0.04,2.5,0.35,'bandpass',1200,3).start(now);}
      setTimeout(function(){try{vol.disconnect();}catch(e){}},900);
    }catch(e){}
  }
  window.playSfx = enhanced;
})();

/* ── 2. Card info open sound ── */
(function(){
  if(window.__FATES_CARD_INFO_SOUND_INSTALLED) return;
  window.__FATES_CARD_INFO_SOUND_INSTALLED = true;
  var orig = window.openCardDetail || (typeof openCardDetail==='function'?openCardDetail:null);
  if(!orig) return;
  window.openCardDetail = function(c,fh,fb){ playSfx('cardInfoOpen'); return orig(c,fh,fb); };
})();

// Drag-to-place is intentionally disabled. The multiplayer UI uses click/detail
// selection only so hand-card hover and modal clicks do not fight old drag paths.
window.__FATES_HAND_DRAG_V9_INSTALLED = true;
window.__FATES_HAND_DRAG_INSTALLED = false;

/* ── 3. HOLD-TO-DRAG PLACEMENT (disabled legacy block) ── */
(function(){
  'use strict';
  // Replace any earlier installer in this build. Only this v9 path should own hand dragging.
  if(window.__FATES_HAND_DRAG_V9_INSTALLED) return;
  window.__FATES_HAND_DRAG_V9_INSTALLED = true;
  window.__FATES_HAND_DRAG_INSTALLED = true;

  var st = null;
  var THRESH = 12;

  function activeGame(){ var gs=document.getElementById('s-game'); return gs && gs.classList.contains('active'); }
  function handIndex(el){ var p=document.getElementById('hand-cards'); return p ? Array.prototype.indexOf.call(p.children, el) : -1; }
  function clearHover(){ document.querySelectorAll('.cell.drag-hover').forEach(function(c){c.classList.remove('drag-hover');}); }
  function clearDragTargets(){ document.querySelectorAll('.cell.drag-tribute-target').forEach(function(c){c.classList.remove('drag-tribute-target');}); }
  function clearGhost(){ var g=document.getElementById('drag-ghost'); if(g) g.remove(); }

  function makeGhost(el, x, y){
    clearGhost();
    var r = el.getBoundingClientRect();
    var g = el.cloneNode(true);
    g.id = 'drag-ghost';
    g.classList.remove('sel','hc-entering','dim');
    g.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:10000;opacity:.92;'+
      'width:'+r.width+'px;height:'+r.height+'px;'+
      'box-shadow:0 18px 52px rgba(0,0,0,.78),0 0 0 2px rgba(201,168,76,.72);'+
      'border-radius:6px;will-change:transform;transition:none;';
    document.body.appendChild(g);
    moveGhost(g, x, y);
    return g;
  }

  function moveGhost(g, x, y){
    if(!g) return;
    var w = g.offsetWidth || 110, h = g.offsetHeight || 154;
    g.style.transform = 'translate('+(x - w/2)+'px,'+(y - h/2 - 14)+'px) scale(1.06) rotate(-1.5deg)';
  }

  function cleanup(opts){
    opts = opts || {};
    if(st && st.ghost && st.ghost.parentNode) st.ghost.remove();
    clearGhost();
    if(st && st.el) st.el.style.opacity = '';
    clearHover();
    clearDragTargets();
    document.body.classList.remove('dragging-card');
    if(opts.clearPlacement && typeof G !== 'undefined' && G){
      G.selectedHandCard = null;
      G.placing = false;
      if(typeof clearPlaceHighlights === 'function') clearPlaceHighlights();
      if(opts.render !== false && typeof renderHand === 'function') renderHand();
    }
    st = null;
  }

  var blockNextClick = false;
  var blockNextClickTime = 0;
  var blockNextClickPoint = null;
  document.addEventListener('click', function(e){
    if(!blockNextClick) return;
    var age = Date.now() - blockNextClickTime;
    var nearDropPoint = blockNextClickPoint &&
      Math.abs((e.clientX || 0) - blockNextClickPoint.x) <= 12 &&
      Math.abs((e.clientY || 0) - blockNextClickPoint.y) <= 12;
    blockNextClick = false;
    blockNextClickPoint = null;
    if(age > 250 || !nearDropPoint) return;
    e.preventDefault();
    e.stopPropagation();
    if(e.stopImmediatePropagation) e.stopImmediatePropagation();
  }, true);
  function clearInterruptedDragClickBlock(){
    blockNextClick = false;
    blockNextClickPoint = null;
  }
  // Clear the block when leaving the game screen so title buttons always work
  window.addEventListener('fate-screen-changed', clearInterruptedDragClickBlock);

  function canStartFromEvent(e){
    if(e.button !== 0 || !activeGame()) return false;
    if(typeof G === 'undefined' || !G || G.phase !== 'main') return false;
    if(G._boardTargeting || G._wolfCreekMoving || G._expMoving || G._berkeleyMoving || G._bh01Moving || G._busserMoving || G._busserMovingCard || G._markSelecting) return false;
    if(G.aiEnabled && (G.currentPlayer === G.aiPlayer || G._aiRunning)) return false;
    return true;
  }

  function beginDrag(e){
    if(!st || st.dragging) return;
    st.dragging = true;
    st.ghost = makeGhost(st.el, e.clientX, e.clientY);
    st.el.style.opacity = '0.18';
    document.body.classList.add('dragging-card');
    if(typeof playSfx === 'function') playSfx('dragStart');

    G.selectedHandCard = st.idx;
    G.placing = true;
    if(typeof clearPlaceHighlights === 'function') clearPlaceHighlights();
    if(typeof highlightValidCells === 'function') highlightValidCells(st.card);

    if(st.card.type !== 'Supporter'){
      var cp = G.currentPlayer;
      (G.board || []).forEach(function(zone,z){ (zone || []).forEach(function(row,r){
        (row || []).forEach(function(cell,c){
          if(cell && cell.owner === cp && cell.type === 'Supporter' && !cell.noConsolidate){
            var el = document.querySelector('#board .cell[data-z="'+z+'"][data-r="'+r+'"][data-c="'+c+'"]');
            if(el) el.classList.add('placeable','drag-tribute-target');
          }
        });
      });});
    }
  }

  function onDown(e){
    if(!canStartFromEvent(e)) return;
    var hc = e.target && e.target.closest ? e.target.closest('#hand-cards .hc') : null;
    if(!hc || hc.classList.contains('dim')) return;
    var cp = (typeof getPerspectivePlayerIndex === 'function') ? getPerspectivePlayerIndex() : G.currentPlayer;
    if(cp !== G.currentPlayer) return;
    var idx = handIndex(hc);
    if(idx < 0) return;
    var card = G.players[cp] && G.players[cp].hand ? G.players[cp].hand[idx] : null;
    if(!card) return;
    st = {el:hc, idx:idx, card:card, sx:e.clientX, sy:e.clientY, dragging:false, ghost:null};
  }

  function onMove(e){
    if(!st) return;
    if(typeof e.buttons === 'number' && (e.buttons & 1) === 0){ cleanup({clearPlacement:true}); return; }
    var dx = e.clientX - st.sx, dy = e.clientY - st.sy;
    if(!st.dragging){
      if(Math.sqrt(dx*dx + dy*dy) < THRESH) return;
      beginDrag(e);
    }
    if(!st || !st.dragging) return;
    e.preventDefault();
    moveGhost(st.ghost, e.clientX, e.clientY);
    clearHover();
    if(st.ghost) st.ghost.style.display = 'none';
    var under = document.elementFromPoint(e.clientX, e.clientY);
    if(st.ghost) st.ghost.style.display = '';
    var cell = under && under.closest ? under.closest('.cell') : null;
    if(cell && (cell.classList.contains('placeable') || !cell.querySelector('.bc'))) cell.classList.add('drag-hover');
  }

  function onUp(e){
    if(!st) return;
    if(!st.dragging){ cleanup(); return; }
    e.preventDefault();
    e.stopPropagation();
    if(e.stopImmediatePropagation) e.stopImmediatePropagation();
    blockNextClick = true;
    blockNextClickTime = Date.now();
    blockNextClickPoint = {x:e.clientX || 0, y:e.clientY || 0};

    var idx = st.idx, card = st.card;
    if(st.ghost) st.ghost.style.display = 'none';
    var under = document.elementFromPoint(e.clientX, e.clientY);
    if(st && st.ghost) st.ghost.style.display = '';
    var cell = under && under.closest ? under.closest('.cell') : null;
    if(!cell){ cleanup({clearPlacement:true}); return; }

    var z = parseInt(cell.dataset.z, 10), r = parseInt(cell.dataset.r, 10), c = parseInt(cell.dataset.c, 10);
    var boardCard = G.board && G.board[z] && G.board[z][r] ? G.board[z][r][c] : null;
    cleanup({clearPlacement:false, render:false});

    G.selectedHandCard = idx;
    G.placing = true;
    if(typeof playSfx === 'function') playSfx('dragDrop');

    if(card.type === 'Supporter'){
      if(boardCard){ toast('Cell is occupied'); G.selectedHandCard=null; G.placing=false; if(typeof clearPlaceHighlights==='function') clearPlaceHighlights(); if(typeof renderHand==='function') renderHand(); return; }
      if(typeof clickCell === 'function') clickCell(z,r,c);
      return;
    }

    // Non-supporters use the existing consolidate pathway; dropping on a friendly supporter selects it.
    G.placing = false;
    if(typeof clearPlaceHighlights === 'function') clearPlaceHighlights();
    if(typeof initiateConsolidate === 'function') initiateConsolidate();
    if(boardCard && boardCard.owner === G.currentPlayer && boardCard.type === 'Supporter' && typeof handleConsolidateClick === 'function'){
      setTimeout(function(){ handleConsolidateClick(z,r,c); }, 20);
    }
  }

  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('mouseup', onUp, true);
  window.addEventListener('blur', function(){ clearInterruptedDragClickBlock(); if(st) cleanup({clearPlacement:true}); clearGhost(); });
  window.addEventListener('focus', clearInterruptedDragClickBlock);
  document.addEventListener('visibilitychange', function(){ if(!document.hidden) clearInterruptedDragClickBlock(); });
  document.addEventListener('mouseleave', function(e){ if(st && st.dragging && e.relatedTarget === null) cleanup({clearPlacement:true}); }, true);
})();


/* ── 4. LAST TURN RED ── */
(function(){
  if(window.__FATES_LAST_TURN_ENHANCED_INSTALLED) return;
  window.__FATES_LAST_TURN_ENHANCED_INSTALLED = true;
  var orig=window.showLastTurnBanner||(typeof showLastTurnBanner==='function'?showLastTurnBanner:null);
  if(!orig) return;
  window.showLastTurnBanner=function(pn,isFinal){
    var ex=document.getElementById('last-turn-banner');if(ex)ex.remove();
    var b=document.createElement('div');b.id='last-turn-banner';
    var text=isFinal?'FINAL TURN':(pn+'\'s LAST TURN');
    b.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;z-index:9000;pointer-events:none;animation:lastTurnIn .32s ease;background:transparent;';
    b.innerHTML='<div style="font-family:Cinzel,serif;font-size:2.4rem;font-weight:900;color:#ff4b4b;text-shadow:0 3px 10px rgba(0,0,0,.9);letter-spacing:.15em;text-transform:uppercase;animation:lastTurnPulse 1.15s ease;">'+text+'</div>';
    document.body.appendChild(b);
    if(typeof playSfx==='function') playSfx('lastTurn');
    var gs=document.getElementById('s-game');if(gs)gs.classList.add('final-turn');
    setTimeout(function(){if(b.parentNode){b.style.animation='lastTurnOut .3s ease forwards';setTimeout(function(){if(b.parentNode)b.remove();},320);}},1700);
  };
})();

/* ── 5. CINEMATIC PLACEMENT ANIMATIONS ── */
(function(){
  if(window.__FATES_PLACEMENT_CINEMATIC_INSTALLED) return;
  window.__FATES_PLACEMENT_CINEMATIC_INSTALLED = true;
  var orig=window.playPlacementAnimation||(typeof playPlacementAnimation==='function'?playPlacementAnimation:null);
  function buildOverlayMarkup(rarity){
    if(rarity==='star'){
      return '<div class="cine-core"></div><div class="cine-halo"></div><div class="cine-rays">'
        + '<span style="--rot:0deg"></span><span style="--rot:45deg"></span><span style="--rot:90deg"></span><span style="--rot:135deg"></span>'
        + '<span style="--rot:180deg"></span><span style="--rot:225deg"></span><span style="--rot:270deg"></span><span style="--rot:315deg"></span>'
        + '</div>';
    }
    if(rarity==='square'){
      return '<div class="cine-core"></div><div class="cine-frame frame-a"></div><div class="cine-frame frame-b"></div><div class="cine-shards">'
        + '<span style="--dx:-1;--dy:-1"></span><span style="--dx:1;--dy:-1"></span><span style="--dx:-1;--dy:1"></span><span style="--dx:1;--dy:1"></span>'
        + '</div>';
    }
    if(rarity==='triangle'){
      return '<div class="cine-core"></div><div class="cine-tri tri-a"></div><div class="cine-tri tri-b"></div><div class="cine-trails">'
        + '<span style="--tx:-40px"></span><span style="--tx:0px"></span><span style="--tx:40px"></span>'
        + '</div>';
    }
    return '<div class="cine-core"></div><div class="cine-ring cine-ring-1"></div><div class="cine-halo"></div>';
  }
  window.playPlacementAnimation=function(card,z,r,c){
    var ms=0;if(orig)ms=orig(card,z,r,c);
    var rarity=card?(card.rarity||'circle'):'circle';
    requestAnimationFrame(function(){requestAnimationFrame(function(){
      var cellEl=document.querySelector('#board .cell[data-z="'+z+'"][data-r="'+r+'"][data-c="'+c+'"]');
      if(!cellEl)return;var rect=cellEl.getBoundingClientRect();
      var dur={star:1200,square:980,triangle:860,circle:700}[rarity]||780;
      var ov=document.createElement('div');ov.className='cinematic-overlay cinematic-'+rarity;
      ov.style.cssText='position:fixed;left:'+(rect.left+rect.width/2)+'px;top:'+(rect.top+rect.height/2)+'px;transform:translate(-50%,-50%);z-index:9500;pointer-events:none;';
      ov.innerHTML=buildOverlayMarkup(rarity);
      document.body.appendChild(ov);
      if(typeof showCinematicSubtitle==='function') setTimeout(function(){ showCinematicSubtitle(card,Math.max(1300,dur+900),rarity); }, 380);
      setTimeout(function(){if(ov.parentNode)ov.remove();},dur);
    });});
    return Math.max(ms, {star:900,square:760,triangle:680,circle:560}[rarity]||560);
  };
})();

/* ── 6. Felicyta Janowicz banner name fix ── */
(function(){
  if(window.__FATES_BANNER_FIT_ENHANCEMENT_INSTALLED) return;
  window.__FATES_BANNER_FIT_ENHANCEMENT_INSTALLED = true;
  var origFit=window.fitBannerNames||(typeof fitBannerNames==='function'?fitBannerNames:null);
  window.fitBannerNames=function(){
    if(origFit)origFit();
    document.querySelectorAll('#s-game .pb-name:not(.pb-name-wrap)').forEach(function(el){
      var text=(el.textContent||'').trim();if(!text||text.length<10)return;
      if(el.scrollWidth>el.clientWidth+2){
        el.classList.add('pb-name-fit-long','pb-name-wrap');
        var banner=el.closest?el.closest('.player-banner'):null;
        var pic=banner?banner.querySelector('.pb-pic'):null;
        if(banner&&pic){var br=banner.getBoundingClientRect();var pr=pic.getBoundingClientRect();var bs=getComputedStyle(banner);var gap=parseFloat(bs.columnGap||bs.gap)||12;var padR=parseFloat(bs.paddingRight)||0;el.style.maxWidth=Math.max(44,br.width-pr.width-gap-padR-6)+'px';}
        el.style.letterSpacing='0';
      }
    });
  };
  var origBanners=window.updatePlayerBanners||(typeof updatePlayerBanners==='function'?updatePlayerBanners:null);
  if(origBanners){window.updatePlayerBanners=function(){origBanners();requestAnimationFrame(function(){if(typeof fitBannerNames==='function')fitBannerNames();});};}
})();

/* ── 7. MULTIPLAYER STUBS ── */
(function(){
  function NM(){this.ws=null;this.roomId=null;this.playerId=null;this.isHost=false;this.connected=false;this.pendingActions=[];this.onGameState=null;this.onOpponentAction=null;this.onChat=null;this.onError=null;}
  NM.prototype.connect=function(url){var s=this;return new Promise(function(res,rej){try{s.ws=new WebSocket(url);s.ws.onopen=function(){s.connected=true;res();};s.ws.onmessage=function(e){s._handle(JSON.parse(e.data));};s.ws.onclose=function(){s.connected=false;};s.ws.onerror=function(e){if(s.onError)s.onError(e);rej(e);};}catch(e){rej(e);}});};
  NM.prototype.createRoom=function(d){this._send({type:'create_room',deck:d});};
  NM.prototype.joinRoom=function(id,d){this._send({type:'join_room',roomId:id,deck:d});};
  NM.prototype.sendAction=function(a){if(!this.connected){this.pendingActions.push(a);return;}this._send({type:'game_action',roomId:this.roomId,action:a});};
  NM.prototype.sendChat=function(t){this._send({type:'chat',roomId:this.roomId,text:t});};
  NM.prototype.disconnect=function(){if(this.ws){this.ws.close();this.ws=null;}this.connected=false;};
  NM.prototype._send=function(d){if(this.ws&&this.ws.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify(d));};
  NM.prototype._handle=function(m){if(m.type==='room_created'){this.roomId=m.roomId;this.playerId=m.playerId;this.isHost=true;}else if(m.type==='room_joined'){this.roomId=m.roomId;this.playerId=m.playerId;}else if(m.type==='game_start'||m.type==='state_sync'){if(this.onGameState)this.onGameState(m.state);}else if(m.type==='opponent_action'){if(this.onOpponentAction)this.onOpponentAction(m.action);}else if(m.type==='chat'){if(this.onChat)this.onChat(m);}};
  window.LegacyNetworkManager=window.LegacyNetworkManager||NM;
  window.mpSendAction=function(){console.warn('[Fates Online] Legacy WebSocket multiplayer is disabled; use RTDB room actions.');};
})();

console.log('[Enhancements] merged enhancements loaded');

/* CSS OVERRIDE CLEANUP v3
   Permanent UI overrides now live in src/styles/99-ui-final.css.
   This old JS-injected style block is intentionally disabled so CSS order is predictable. */



/* v9: cancel lingering board target/move flows with Escape or right click. */
(function(){
  if(window.__FATES_TARGET_CANCEL_V9) return;
  window.__FATES_TARGET_CANCEL_V9 = true;
  function cancelPendingTargetFlow(){
    if(typeof G === 'undefined' || !G) return false;
    var had = !!(G._boardTargeting || G._wolfCreekMoving || G._expMoving || G._berkeleyMoving || G._bh01Moving || G._busserMoving || G._busserMovingCard || G._markSelecting);
    if(!had) return false;
    if(typeof clearBoardTargetSelection === 'function') clearBoardTargetSelection();
    G._wolfCreekMoving = null; G._expMoving = null; G._berkeleyMoving = null; G._bh01Moving = null;
    G._busserMoving = null; G._busserMovingCard = null; G._markSelecting = null; G.placing = false;
    if(typeof clearPlaceHighlights === 'function') clearPlaceHighlights();
    if(typeof setHint === 'function') setHint('Select a card to play');
    if(typeof renderGame === 'function') renderGame();
    if(typeof renderHand === 'function') renderHand();
    if(typeof toast === 'function') toast('Selection cancelled');
    return true;
  }
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') cancelPendingTargetFlow(); }, true);
  document.addEventListener('contextmenu', function(e){ if(cancelPendingTargetFlow()){ e.preventDefault(); e.stopPropagation(); } }, true);
})();


// v19 action bar safety: remove legacy View Selected button even if an older HTML file is still cached/loaded.
(function installActionBarCleanup(){
  function cleanupActionBar(){
    document.querySelectorAll('#s-game .actbar button').forEach(function(btn){
      var txt = (btn.textContent || '').trim().toLowerCase();
      var onclick = btn.getAttribute('onclick') || '';
      if(txt === 'view selected' || onclick.indexOf('openCardDetail(null)') !== -1){
        btn.remove();
      }
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cleanupActionBar);
  else cleanupActionBar();
  window.cleanupActionBar = cleanupActionBar;
})();

// Daily missions now live inside Mission Control, not on the title screen.

/* ═══════════════════════════════════════════════════════════════════
   Side Panel — full-height right panel with profile, daily missions,
   and a permanently-open world chat.
   Scoped under #s-title.fate-side-panel CSS class.
   ═══════════════════════════════════════════════════════════════════ */
var _sidePanelInstalled = false;
var _sidePanelOriginalParents = {};  // keep references so we can revert

function _stripProfileBorder(){
  var profile = document.getElementById('title-profile');
  if(!profile) return;
  // renderTitleProfile sets inline border + box-shadow with !important
  // We override those so our CSS-defined card style shows through
  profile.style.setProperty('border', '1px solid rgba(201,168,76,.18)', 'important');
  profile.style.setProperty('border-radius', '9px', 'important');
  profile.style.setProperty('box-shadow', 'inset 0 1px 0 rgba(255,255,255,.05),0 4px 14px rgba(0,0,0,.3)', 'important');
}

function initSidePanel(){
  if(_sidePanelInstalled) return;
  var panel = document.getElementById('fate-side-panel');
  var title = document.getElementById('s-title');
  if(!panel || !title) return;

  // Build decorative scaffold inside the panel
  // Structure: panel > sp-inner > [crest, profile-section-head, profile, daily-section-head, daily, chat-section-head, world-chat]
  panel.innerHTML = '';

  // Decorative crest at top
  var crest = document.createElement('div');
  crest.className = 'sp-crest';
  crest.innerHTML = '<span class="sp-crest-glyph">✦</span>FATES<span class="sp-crest-glyph">✦</span>';
  panel.appendChild(crest);

  // Inner scroll container
  var inner = document.createElement('div');
  inner.className = 'sp-inner';
  panel.appendChild(inner);

  // Section head: PROFILE
  var head1 = document.createElement('div');
  head1.className = 'sp-section-head';
  head1.innerHTML = '<span class="sp-sh-glyph">◆ Profile ◆</span>';
  inner.appendChild(head1);

  // Move profile badge into the side panel inner
  var profile = document.getElementById('title-profile');
  if(profile){
    _sidePanelOriginalParents.profile = {el:profile, parent:profile.parentElement, next:profile.nextElementSibling};
    inner.appendChild(profile);
    _stripProfileBorder();
  }

  // Wrap renderTitleProfile to strip border/box-shadow after it runs
  // (it sets inline !important styles that override our CSS)
  if(!window._origRenderTitleProfile && typeof window.renderTitleProfile === 'function'){
    window._origRenderTitleProfile = window.renderTitleProfile;
    window.renderTitleProfile = function(){
      window._origRenderTitleProfile();
      if(document.getElementById('s-title')?.classList.contains('fate-side-panel')){
        _stripProfileBorder();
      }
    };
  }

  // Section head: MISSIONS
  var head2 = document.createElement('div');
  head2.className = 'sp-section-head';
  head2.innerHTML = '<span class="sp-sh-glyph">✦ Daily Missions ✦</span>';
  inner.appendChild(head2);

  // Move daily challenges into the side panel inner
  var daily = null;
  if(daily){
    _sidePanelOriginalParents.daily = {el:daily, parent:daily.parentElement, next:daily.nextElementSibling};
    inner.appendChild(daily);
  }

  // Section head: CHAT
  var head3 = document.createElement('div');
  head3.className = 'sp-section-head';
  head3.innerHTML = '<span class="sp-sh-glyph">◆ World Chat ◆</span>';
  inner.appendChild(head3);

  // Create the compact world chat section
  var wcSection = document.createElement('div');
  wcSection.className = 'sp-world-chat sp-section';
  wcSection.id = 'sp-world-chat';
  wcSection.innerHTML =
    '<div class="sp-wc-header">' +
      '<span class="sp-wc-title">Tavern</span>' +
      '<span class="sp-wc-online" id="sp-wc-online"></span>' +
    '</div>' +
    '<div class="sp-wc-messages" id="sp-wc-messages"></div>' +
    '<div class="sp-wc-input-row">' +
      '<button class="social-emoji-toggle" id="sp-wc-emoji-toggle" title="Emoji" onclick="toggleWorldChatEmoji()">😀</button>' +
      '<input type="text" id="sp-wc-input" placeholder="Speak to the realm..." maxlength="200" autocomplete="off" onkeydown="if(event.key===\'Enter\')sendWorldChat()">' +
      '<button class="btn sm pri" onclick="sendWorldChat()">Send</button>' +
    '</div>' +
    '<div id="sp-wc-emoji-container" style="display:none;"></div>';
  inner.appendChild(wcSection);

  // Initial render — subsequent renders are event-driven via renderWorldChatMessages hook
  // (no setInterval — that thrashed the DOM constantly and tanked FPS)
  renderSidePanelChat();

  // Override toggleWorldChatEmoji to work with side panel container too
  if(!window._origToggleWorldChatEmoji && typeof window.toggleWorldChatEmoji === 'function'){
    window._origToggleWorldChatEmoji = window.toggleWorldChatEmoji;
  }
  window.toggleWorldChatEmoji = function(){
    // Try to use side panel emoji container when visible
    var spContainer = document.getElementById('sp-wc-emoji-container');
    var origContainer = document.getElementById('wc-emoji-container');
    if(spContainer && document.getElementById('s-title')?.classList.contains('fate-side-panel')){
      if(spContainer.style.display === 'none'){
        // Populate if empty
        if(!spContainer.children.length && origContainer){
          spContainer.innerHTML = origContainer.innerHTML;
          // Rebind emoji clicks
          spContainer.querySelectorAll('.emoji-btn,.social-emoji-btn').forEach(function(btn){
            btn.addEventListener('click', function(){
              var inp = document.getElementById('sp-wc-input');
              if(inp) inp.value += this.textContent;
            });
          });
        }
        spContainer.style.display = '';
      } else {
        spContainer.style.display = 'none';
      }
      return;
    }
    if(window._origToggleWorldChatEmoji) window._origToggleWorldChatEmoji();
  };

  _sidePanelInstalled = true;
}

var _spChatInterval = null;

var _lastSidePanelChatSig = '';
function renderSidePanelChat(){
  var el = document.getElementById('sp-wc-messages');
  if(!el) return;
  // Get messages from the same source as the original world chat
  var source = Array.isArray(window.FATE_ONLINE_WORLD_CHAT) ? window.FATE_ONLINE_WORLD_CHAT
    : (typeof SOCIAL !== 'undefined' && Array.isArray(SOCIAL.worldChat) ? SOCIAL.worldChat : []);
  var msgs = source.slice(-40);  // smaller cap — less DOM
  // FPS fix: skip rebuild if content unchanged
  var sig = msgs.length + ':' + (msgs[msgs.length-1]?.timestamp || 0) + ':' + (msgs[0]?.timestamp || 0);
  if(sig === _lastSidePanelChatSig) {
    // Just refresh the online count and exit
    var onlineEl2 = document.getElementById('sp-wc-online');
    if(onlineEl2){
      var c2 = window.FATE_ONLINE_PRESENCE_COUNT !== undefined ? window.FATE_ONLINE_PRESENCE_COUNT
        : (window.FateOnline && window.FateOnline._onlineCount !== undefined ? window.FateOnline._onlineCount : 0);
      onlineEl2.textContent = c2 > 0 ? c2 + ' online' : '';
    }
    return;
  }
  _lastSidePanelChatSig = sig;
  var html = '';
  for(var i = 0; i < msgs.length; i++){
    var m = msgs[i];
    if(!m || !m.text) continue;
    var name = m.from || m.name || 'Anon';
    var nameColor = m.uid && typeof window.getUserRankColor === 'function' ? window.getUserRankColor(m.uid) : 'var(--gold)';
    var isMe = m.uid && window.FateOnline && window.FateOnline.auth && window.FateOnline.auth.currentUser && m.uid === window.FateOnline.auth.currentUser.uid;
    html += '<div class="wc-msg' + (isMe ? ' wc-msg-me' : '') + '">' +
      '<span class="wc-msg-name" style="color:' + nameColor + ';">' + escapeHtml(name) + '</span>' +
      '<span class="wc-msg-text">' + escapeHtml(m.text) + '</span>' +
    '</div>';
  }
  var wasAtBottom = (el.scrollTop + el.clientHeight >= el.scrollHeight - 20);
  el.innerHTML = html;
  if(wasAtBottom) el.scrollTop = el.scrollHeight;

  // Update online count
  var onlineEl = document.getElementById('sp-wc-online');
  if(onlineEl){
    var count = 0;
    if(window.FATE_ONLINE_PRESENCE_COUNT !== undefined) count = window.FATE_ONLINE_PRESENCE_COUNT;
    else if(window.FateOnline && window.FateOnline._onlineCount !== undefined) count = window.FateOnline._onlineCount;
    onlineEl.textContent = count > 0 ? count + ' online' : '';
  }
}

function teardownSidePanel(){
  if(!_sidePanelInstalled) return;
  // Restore original renderTitleProfile
  if(window._origRenderTitleProfile){
    window.renderTitleProfile = window._origRenderTitleProfile;
    window._origRenderTitleProfile = null;
  }
  // Move profile back to original position
  if(_sidePanelOriginalParents.profile){
    var p = _sidePanelOriginalParents.profile;
    if(p.next && p.parent) p.parent.insertBefore(p.el, p.next);
    else if(p.parent) p.parent.appendChild(p.el);
    // Re-render to restore proper inline styles
    if(typeof renderTitleProfile === 'function') renderTitleProfile();
  }
  // Move daily challenges back
  if(_sidePanelOriginalParents.daily){
    var d = _sidePanelOriginalParents.daily;
    if(d.next && d.parent) d.parent.insertBefore(d.el, d.next);
    else if(d.parent) d.parent.appendChild(d.el);
  }
  // Remove the embedded world chat
  var wcSection = document.getElementById('sp-world-chat');
  if(wcSection) wcSection.remove();
  // Clear cached signature
  _lastSidePanelChatSig = '';
  // Clear interval if present (legacy)
  if(_spChatInterval){ clearInterval(_spChatInterval); _spChatInterval = null; }
  // Restore original toggleWorldChatEmoji
  if(window._origToggleWorldChatEmoji){ window.toggleWorldChatEmoji = window._origToggleWorldChatEmoji; window._origToggleWorldChatEmoji = null; }
  // Re-show the corner dock widget
  if(typeof scheduleFateCornerDock === 'function') scheduleFateCornerDock();

  _sidePanelOriginalParents = {};
  _sidePanelInstalled = false;
}

window.initSidePanel = initSidePanel;
window.teardownSidePanel = teardownSidePanel;
window.ensureTitleMissionControlButton = ensureTitleMissionControlButton;

/* ═══════════════════════════════════════════════════════════════════
   Mission Control — dedicated screen with daily missions + live matches
   ═══════════════════════════════════════════════════════════════════ */
var _missionLiveUnsub = null;
var _missionLiveStartTimer = null;
var _missionDailySig = '';
var _missionDailyHtml = '';

function setMissionHtml(el, html){
  if(el && el.innerHTML !== html) el.innerHTML = html;
}

function showMissionControl(){
  var win = document.getElementById('mission-control-window');
  if(win){
    win.hidden = false;
    win.classList.add('on');
    document.body.classList.add('mission-control-open');
  }
  renderMissionDaily();
  renderMissionLive({defer:true});
}

function closeMissionControl(){
  var win = document.getElementById('mission-control-window');
  if(win){
    win.classList.remove('on');
    win.hidden = true;
  }
  document.body.classList.remove('mission-control-open');
  if(_missionLiveUnsub){
    try{_missionLiveUnsub();}catch(e){}
    _missionLiveUnsub = null;
  }
  if(_missionLiveStartTimer){
    clearTimeout(_missionLiveStartTimer);
    _missionLiveStartTimer = null;
  }
}

function renderMissionDaily(){
  var el = document.getElementById('mission-window-daily-container') || document.getElementById('mission-daily-container');
  if(!el) return;
  if(typeof getDailyChallenges !== 'function') return;
  var daily = getDailyChallenges();
  var prog = typeof getDailyChallengeProgress === 'function' ? getDailyChallengeProgress() : {};
  var today = typeof getDailyChallengeDate === 'function' ? getDailyChallengeDate() : '';
  var doneCount = daily.challenges.filter(function(ch){ return ch.completed; }).length;
  var pool = typeof DAILY_CHALLENGE_POOL !== 'undefined' ? DAILY_CHALLENGE_POOL : [];
  var totalReward = daily.challenges.reduce(function(sum, ch){
    var def = pool.find(function(c){ return c.id === ch.id; });
    return sum + (def && ch.completed ? (def.reward.starlight || 0) : 0);
  }, 0);
  var allDoneNow = doneCount >= 3;
  var bonusClaimedNow = !!localStorage.getItem('fate_daily_bonus_' + today);
  var totalBonuses = Number(USER_PROFILE && USER_PROFILE.dailyMissionBonusClaims || localStorage.getItem('fate_daily_bonus_claims_total') || 0) || 0;
  var completeEl = document.getElementById('mission-complete-count');
  var rewardEl = document.getElementById('mission-reward-total');
  var bonusEl = document.getElementById('mission-bonus-state');
  if(completeEl) completeEl.textContent = doneCount + '/3';
  if(rewardEl) rewardEl.textContent = String(totalReward + (bonusClaimedNow ? 50 : 0));
  if(bonusEl) bonusEl.textContent = String(totalBonuses);
  var html = '<div class="dc-list" style="padding:.5rem .6rem;gap:.4rem;display:flex;flex-direction:column;">';
  daily.challenges.forEach(function(ch){
    var def = pool.find(function(c){ return c.id === ch.id; });
    if(!def) return;
    var cur = Math.min(prog[def.key] || 0, def.target);
    var pct = Math.round((cur / def.target) * 100);
    var done = ch.completed;
    html += '<div class="dc-item' + (done ? ' dc-done' : '') + '">'
      + '<div class="dc-item-icon-wrap"><span class="dc-icon">' + def.icon + '</span></div>'
      + '<div class="dc-item-center">'
      + '<div class="dc-item-label">' + def.label + '</div>'
      + '<div class="dc-item-desc">' + def.desc + '</div>'
      + '<div class="dc-bar-wrap"><div class="dc-bar" style="width:' + pct + '%"></div><span class="dc-bar-text">' + (done ? '✓ Complete' : cur + '/' + def.target) + '</span></div>'
      + '</div>'
      + '<div class="dc-reward-badge">+' + def.reward.starlight + ' ★</div>'
      + '</div>';
  });
  var allDone = doneCount >= 3;
  var bonusClaimed = !!localStorage.getItem('fate_daily_bonus_' + today);
  html += '<div class="dc-item dc-bonus-row' + (allDone ? ' dc-done' : '') + '" style="border-color:rgba(255,215,0,.2)!important;background:linear-gradient(135deg,rgba(255,215,0,.04),rgba(255,215,0,.01))!important;margin-top:.15rem;">'
    + '<div class="dc-item-icon-wrap" style="background:rgba(255,215,0,.1)!important;border-color:rgba(255,215,0,.25)!important;"><span class="dc-icon">🏆</span></div>'
    + '<div class="dc-item-center">'
    + '<div class="dc-item-label" style="color:#ffd700!important;">Complete All Missions</div>'
    + '<div class="dc-item-desc">Finish all 3 daily missions for a bonus</div>'
    + '<div class="dc-bar-wrap"><div class="dc-bar" style="width:' + Math.round((doneCount/3)*100) + '%;background:linear-gradient(90deg,rgba(255,215,0,.7),rgba(255,215,0,.4))!important;"></div><span class="dc-bar-text">' + (bonusClaimed ? '✓ Claimed' : doneCount + '/3') + '</span></div>'
    + '</div>'
    + '<div class="dc-reward-badge" style="color:#ffd700!important;border-color:rgba(255,215,0,.3)!important;">+50 ★</div>'
    + '</div>';
  html += '</div>';
  var sig = today + '|' + doneCount + '|' + totalReward + '|' + totalBonuses + '|' + daily.challenges.map(function(ch){
    var def = pool.find(function(c){ return c.id === ch.id; });
    return ch.id + ':' + (ch.completed ? 1 : 0) + ':' + (def ? (prog[def.key] || 0) : 0);
  }).join(',');
  if(_missionDailySig !== sig || _missionDailyHtml !== html){
    _missionDailySig = sig;
    _missionDailyHtml = html;
    setMissionHtml(el, html);
  }
}

function missionControlIsOpen(){
  var win = document.getElementById('mission-control-window');
  return !!(win && !win.hidden && win.classList.contains('on'));
}

function missionFlyLiveEnabled(){
  try{
    return typeof window.fateFetchFlyLiveMatches === 'function' && (
      localStorage.getItem('fateFlyRoomsEnabled') === '1' ||
      localStorage.getItem('fateRtdbDisabled') === '1' ||
      window.FATE_FLY_ROOMS_ENABLED === true ||
      window.FATE_RTDB_DISABLED === true
    );
  }catch(e){
    return typeof window.fateFetchFlyLiveMatches === 'function' && (
      window.FATE_FLY_ROOMS_ENABLED === true ||
      window.FATE_RTDB_DISABLED === true
    );
  }
}

function missionRtdbDisabledMode(){
  try{
    return localStorage.getItem('fateRtdbDisabled') === '1' ||
      window.FATE_RTDB_DISABLED === true;
  }catch(e){
    return window.FATE_RTDB_DISABLED === true;
  }
}

function missionFirebaseLiveAllowed(FO){
  return !missionRtdbDisabledMode() && !!(FO && FO.rtdb && FO.onValue && FO.ref);
}

function scheduleMissionLiveStart(){
  if(_missionLiveStartTimer) clearTimeout(_missionLiveStartTimer);
  var schedule = window.FateMenuViews && typeof window.FateMenuViews.postPaint === 'function'
    ? window.FateMenuViews.postPaint.bind(window.FateMenuViews)
    : function(fn){ requestAnimationFrame(function(){ setTimeout(fn, 0); }); };
  schedule(function(){
    _missionLiveStartTimer = setTimeout(function(){
      _missionLiveStartTimer = null;
      if(missionControlIsOpen()) renderMissionLive({startNow:true});
    }, 0);
  });
}

function renderMissionLive(opts){
  opts = opts || {};
  var el = document.getElementById('mission-window-live-container') || document.getElementById('mission-live-container');
  if(!el) return;
  var FO = window.FateOnline || {};
  var useFlyLive = missionFlyLiveEnabled();
  if(!useFlyLive && !missionFirebaseLiveAllowed(FO)){
    setMissionHtml(el, '<div class="mission-live-empty">Online services are still loading. Close and reopen Mission Control in a moment.</div>');
    return;
  }
  if(!window.FATE_ONLINE?.user){
    setMissionHtml(el, '<div class="mission-live-empty">Sign in via Social to view live matches.</div>');
    return;
  }
  if(opts.defer && !opts.startNow){
    if(el.dataset.missionLiveMounted !== '1') {
      setMissionHtml(el, '<div class="mission-live-loading">Searching for live matches...</div>');
      el.dataset.missionLiveMounted = '1';
    }
    scheduleMissionLiveStart();
    return;
  }
  setMissionHtml(el, '<div class="mission-live-loading">Searching for live matches...</div>');
  el.dataset.missionLiveMounted = '1';
  if(_missionLiveUnsub){ try{_missionLiveUnsub();}catch(e){} _missionLiveUnsub=null; }
  if(useFlyLive){
    var refreshFlyLive = function(){
      window.fateFetchFlyLiveMatches(16)
        .then(function(matches){ renderMissionLiveList(el, matches || []); })
        .catch(function(){ setMissionHtml(el, '<div class="mission-live-empty">Could not connect to live matches.</div>'); });
    };
    refreshFlyLive();
    var flyLiveTimer = setInterval(function(){
      if(missionControlIsOpen()) refreshFlyLive();
    }, 4000);
    _missionLiveUnsub = function(){ clearInterval(flyLiveTimer); };
    return;
  }
  if(!missionFirebaseLiveAllowed(FO)){
    setMissionHtml(el, '<div class="mission-live-empty">Live matches are available from Fly when the authority is connected.</div>');
    return;
  }
  try{
    var baseRef = FO.ref(FO.rtdb, 'liveMatches');
    var liveTarget = (FO.query && FO.orderByChild && FO.limitToLast)
      ? FO.query(baseRef, FO.orderByChild('updatedAt'), FO.limitToLast(16))
      : baseRef;
    _missionLiveUnsub = FO.onValue(liveTarget, function(snap){
      var val = snap.val();
      var matches = val ? Object.values(val) : [];
      matches.sort(function(a,b){ return Number(b.updatedAt || b.startedAt || 0) - Number(a.updatedAt || a.startedAt || 0); });
      renderMissionLiveList(el, matches);
    });
  }catch(e){
    setMissionHtml(el, '<div class="mission-live-empty">Could not connect to live matches.</div>');
  }
}

function renderMissionLiveList(el, matches){
  if(!matches.length){
    setMissionHtml(el, '<div class="mission-live-empty">No live matches right now. Check back later!</div>');
    el.dataset.missionLiveMounted = '1';
    return;
  }
  var html = '<div class="mission-live-grid">';
  matches.forEach(function(m){
    var p1 = m.hostName || m.p1name || m.p1Name || 'Player 1';
    var p2 = m.guestName || m.p2name || m.p2Name || 'Player 2';
    var p1Elo = m.hostElo || m.p1elo || m.p1Elo || '?';
    var p2Elo = m.guestElo || m.p2elo || m.p2Elo || '?';
    var code = m.roomCode || '';
    var spectators = m.spectators || 0;
    var safeCode = encodeURIComponent(code);
    html += '<div class="mission-live-card">'
      + '<div class="mlc-players">'
      + '<div class="mlc-player"><span class="mlc-name">'+escapeHtml(p1)+'</span><span class="mlc-elo">'+p1Elo+'</span></div>'
      + '<div class="mlc-vs">VS</div>'
      + '<div class="mlc-player mlc-player-right"><span class="mlc-name">'+escapeHtml(p2)+'</span><span class="mlc-elo">'+p2Elo+'</span></div>'
      + '</div>'
      + '<div class="mlc-footer">'
      + '<span class="mlc-spectators">👁 '+(spectators||0)+' watching</span>'
      + '<button class="btn sm mlc-spectate-btn" onclick="event.stopPropagation();closeMissionControl();if(typeof window.fateSpectateMatch===\'function\')window.fateSpectateMatch(decodeURIComponent(\''+safeCode+'\'));else if(typeof toast===\'function\')toast(\'Spectator mode is still loading\');">Spectate</button>'
      + '</div>'
      + '</div>';
  });
  html += '</div>';
  setMissionHtml(el, html);
  el.dataset.missionLiveMounted = '1';
}

window.addEventListener('fate-screen-changed', function(e){
  if(e.detail && e.detail.from === 's-mission' && _missionLiveUnsub){
    try{_missionLiveUnsub();}catch(ex){}
    _missionLiveUnsub = null;
  }
});

window.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && document.getElementById('mission-control-window')?.classList.contains('on')){
    closeMissionControl();
  }
});

window.showMissionControl = showMissionControl;
window.closeMissionControl = closeMissionControl;
window.renderMissionDaily = renderMissionDaily;
