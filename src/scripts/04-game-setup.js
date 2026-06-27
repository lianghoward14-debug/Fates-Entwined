//  GAME START
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function resolveAIDeckRef(refId) {
  if(!refId) return null;
  // Search STARTER_DECKS and AI_ONLY_RANDOM_DECKS for the deck with matching id
  const pools = [];
  if(typeof STARTER_DECKS !== 'undefined' && Array.isArray(STARTER_DECKS)) pools.push(...STARTER_DECKS);
  if(typeof AI_ONLY_RANDOM_DECKS !== 'undefined' && Array.isArray(AI_ONLY_RANDOM_DECKS)) pools.push(...AI_ONLY_RANDOM_DECKS);
  const found = pools.find(d => d && d.id === refId);
  if(found && Array.isArray(found.ids) && found.ids.length >= 40) return found.ids.slice(0, 40);
  return null;
}

let _aiDeckResolving = false;
function getPlayableAIDeck(aiSource, difficultyOverride=null) {
  const difficulty = difficultyOverride || (typeof G !== 'undefined' && G ? G.aiDifficulty : null) || 'medium';
  // Resolve deckRef first — always use the latest version of a named deck
  if(aiSource && aiSource.deckRef) {
    const resolved = resolveAIDeckRef(aiSource.deckRef);
    if(resolved && resolved.length >= 40) return resolved;
  }
  const rawDeck = aiSource && Array.isArray(aiSource.deck) ? aiSource.deck : [];
  const validIds = rawDeck.filter(id=>CARDS.some(c=>c.id===id));
  if(validIds.length >= 40) return validIds.slice(0,40);
  // Fallback to AI_DECKS — guard against recursion since AI_DECKS getters call this function
  if(!_aiDeckResolving) {
    _aiDeckResolving = true;
    try {
      let fallback = [];
      if(typeof AI_DECKS !== 'undefined' && AI_DECKS){
        const fb = AI_DECKS[difficulty];
        if(Array.isArray(fb)) fallback = fb.filter(id=>CARDS.some(c=>c.id===id));
      }
      const merged = [...validIds];
      for(const id of fallback){
        if(merged.length >= 40) break;
        merged.push(id);
      }
      return merged.slice(0,40);
    } finally { _aiDeckResolving = false; }
  }
  return validIds.slice(0,40);
}

const AI_RANK_FATE_MULTIPLIERS = {
  'Lieutenant at Arms': 1.25,
  'Sergeant of the Guard': 1.5,
  'Commander-General': 1.75,
  'Captain General': 1.75,
  'Captain-General': 1.75,
  'First Marshall': 2,
  'First Marshal': 2,
  'High Marshall': 2,
  'High Marshal': 2
};

function getAIFateMultiplier(ai) {
  if(!ai) return 1;
  const rank = ai.rank || '';
  return AI_RANK_FATE_MULTIPLIERS[rank] || 1;
}

function getPlayerZoneFateMultiplier(player) {
  if(typeof G === 'undefined' || !G || !G.aiEnabled || player !== G.aiPlayer) return 1;
  return Number(G._aiFateMultiplier || getAIFateMultiplier(G._selectedAI) || 1);
}

function formatFateMultiplier(mult) {
  const n = Number(mult) || 1;
  return Number.isInteger(n) ? n + 'x' : n.toFixed(2).replace(/0+$/,'').replace(/\.$/,'') + 'x';
}

function startGame(vsAI=false) {
  const keepHowardDevMode = !!window.__fateHowardDevLaunchPending;
  window.__fateHowardDevLaunchPending = false;
  if(!keepHowardDevMode && typeof isHowardDevMode === 'function' && isHowardDevMode()){
    window.__fateHowardDevMode = false;
    G._howardDevMode = false;
    G._onlineGameSong = null;
  }
  if(typeof window.invalidateFateRenderCaches === 'function') window.invalidateFateRenderCaches();
  if(typeof playSfx==='function') playSfx('startGame');
  const tutorialRunning = typeof _tutorialActive !== 'undefined' && _tutorialActive && typeof CURRENT_MODE !== 'undefined' && CURRENT_MODE === 'tutorial';
  if(!tutorialRunning) {
    G._tutorialTurnLimit = null;
    G.maxTurns = 20;
    if(typeof CURRENT_MODE !== 'undefined' && CURRENT_MODE === 'tutorial') CURRENT_MODE = 'free';
  }
  const passOverlay = document.getElementById('pt-overlay');
  if(passOverlay) passOverlay.classList.remove('on');
  // New match: prevent menu music from bleeding in and force a fresh in-game bg/song pick.
  if(typeof stopAllMusic==='function') stopAllMusic();
  if(typeof _lastGameSong !== 'undefined') _lastGameSong = G._onlineGameSong || null;
  // Use custom decks or build defaults
  if(!G.p1Deck.length) buildDefaultDecks();
  G.players[0].name = USER_PROFILE.username || 'Player 1';
  if(!vsAI) G.players[1].name = 'Player 2';
  G.aiEnabled = vsAI;
  G.aiPlayer = 1; // AI is always player 2
  if(vsAI){
    if(!G.aiDifficulty) G.aiDifficulty = 'medium';
    const names = {easy:'AI - Rookie', medium:'AI - Apprentice', hard:'AI - Veteran', extreme:'AI - Master'};
    const selectedDeck = G._selectedAI ? getPlayableAIDeck(G._selectedAI, G.aiDifficulty) : [];
    if(G._selectedAI && selectedDeck.length===40){
      G.players[1].name = G._selectedAI.name;
      G.p2Deck = [...selectedDeck];
    } else {
      G.players[1].name = names[G.aiDifficulty] || 'AI';
      // Always use the hand-crafted deck for the AI — ensures good synergy
      const aiDeck = typeof AI_DECKS !== 'undefined' ? AI_DECKS[G.aiDifficulty] : null;
      if(aiDeck && aiDeck.length === 40){
        G.p2Deck = [...aiDeck];
      }
    }
  }
  initGameState();
  G._aiFateMultiplier = vsAI ? getAIFateMultiplier(G._selectedAI) : 1;
  if(typeof applyGameBackground === 'function'){
    _lastGameSong = applyGameBackground(G._onlineGameSong || null);
  }
  // Show pre-game matchup display
  showPreGameMatchup(vsAI, ()=>{
    if(typeof initInGameChat === 'function') initInGameChat();
    showScreen('s-coin');
    doCoinFlip();
  });
}

function startOnlineServerBootstrappedGame(options) {
  const opts = options || {};
  if(typeof cleanupLeavingGameScreenArtifacts === 'function') cleanupLeavingGameScreenArtifacts();
  if(typeof G !== 'undefined' && G && G._bootInitPromise) G._bootInitPromise = null;
  if(typeof window.invalidateFateRenderCaches === 'function') window.invalidateFateRenderCaches();
  if(typeof playSfx==='function') playSfx('startGame');
  G._tutorialTurnLimit = null;
  G.maxTurns = 20;
  if(typeof CURRENT_MODE !== 'undefined' && CURRENT_MODE === 'tutorial') CURRENT_MODE = 'free';
  const passOverlay = document.getElementById('pt-overlay');
  if(passOverlay) passOverlay.classList.remove('on');
  if(typeof stopAllMusic==='function') stopAllMusic();
  if(typeof _lastGameSong !== 'undefined') _lastGameSong = opts.song || G._onlineGameSong || null;
  if(!G.p1Deck.length) buildDefaultDecks();
  G.players[0].name = USER_PROFILE.username || 'Player 1';
  G.players[1].name = 'Player 2';
  G.aiEnabled = false;
  G.aiPlayer = 1;
  initGameState();
  if(typeof applyGameBackground === 'function'){
    _lastGameSong = applyGameBackground(opts.song || G._onlineGameSong || null);
  }
  try{
    if(typeof initInGameChat === 'function') initInGameChat();
    const entryVeilStarted = showMatchEntryLoadingVeil();
    recordMatchEntryStep('online-server-bootstrap-start');
    if(typeof opts.applyServerState === 'function') opts.applyServerState();
    const pendingOnlineTurnChoice = !!(G._onlineRoomCode && String(G.phase || '') !== 'main');
    if(!pendingOnlineTurnChoice) G.phase = 'main';
    G._turnInputLockUntil = 0;
    G._aiRunning = false;
    G._aiAbort = false;
    G._aiAborted = false;
    G._aiTurnToken = 0;
    if(pendingOnlineTurnChoice){
      showScreen('s-coin');
      recordMatchEntryStep('online-server-bootstrap-coin-choice');
      log('sys','Online match coin flip begins.');
      hideMatchEntryLoadingVeil(entryVeilStarted);
      setTimeout(()=>doCoinFlip(), 60);
      if(typeof opts.afterEnter === 'function') opts.afterEnter();
      return;
    }
    showScreen('s-game');
    recordMatchEntryStep('online-server-bootstrap-game-active');
    const currentName = G.players[G.currentPlayer]?.name || `Player ${Number(G.currentPlayer || 0) + 1}`;
    log('sys','Online match begins! '+currentName+' goes first.');
    const renderStarted = performance.now ? performance.now() : Date.now();
    if(typeof renderGameImmediate === 'function') {
      if(typeof rendererV2OwnsBoardScene === 'function' && rendererV2OwnsBoardScene()) {
        renderGameImmediate({hand:true, piles:true, oppHand:true, landscape:true, topbar:true});
      } else {
        renderGameImmediate();
      }
    } else renderGame();
    recordMatchEntryStep('online-server-bootstrap-render-called', {
      ms:Math.round(((performance.now ? performance.now() : Date.now()) - renderStarted) * 10) / 10
    });
    if(typeof renderGameImmediate !== 'function' && typeof updateTopBar === 'function') updateTopBar();
    recordMatchEntryStep('online-server-bootstrap-topbar-ready');
    hideMatchEntryLoadingVeil(entryVeilStarted);
    startTurnTimer();
    if(typeof opts.afterEnter === 'function') opts.afterEnter();
  } catch(err) {
    console.error('Online server bootstrap entry failed', err);
    if(typeof opts.onError === 'function') opts.onError(err);
  }
}
window.startOnlineServerBootstrappedGame = startOnlineServerBootstrappedGame;

function isHowardDevMode() {
  return !!(window.__fateHowardDevMode || (typeof G !== 'undefined' && G && G._howardDevMode));
}
window.isHowardDevMode = isHowardDevMode;

function pickHowardDevAI() {
  const source = typeof getRandomMatchAIOpponents === 'function' ? getRandomMatchAIOpponents() : (typeof AI_OPPONENTS !== 'undefined' ? AI_OPPONENTS : []);
  const pool = source.filter(function(ai){
    return ai && typeof getPlayableAIDeck === 'function' && getPlayableAIDeck(ai).length >= 40;
  });
  if(!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function startHowardDevMode() {
  if(typeof G === 'undefined' || !G) return;
  if(typeof cleanupLeavingGameScreenArtifacts === 'function') cleanupLeavingGameScreenArtifacts();
  if(typeof CURRENT_MODE !== 'undefined') CURRENT_MODE = 'free';
  window.__fateHowardDevMode = true;
  G._howardDevMode = true;
  G._onlineRoomCode = null;
  G._onlineGameId = null;
  G._onlinePlayerIndex = null;
  G._selectedAI = pickHowardDevAI();
  if(G._selectedAI) {
    G.aiDifficulty = 'hard';
    G._aiOpponentElo = G._selectedAI.elo || getDailyTrueElo(G._selectedAI) || 1000;
  }
  const launchWithLandscape = function(song){
    G._howardDevMode = true;
    window.__fateHowardDevMode = true;
    window.__fateHowardDevLaunchPending = true;
    G._onlineGameSong = song || null;
    startGame(true);
  };
  if(typeof showLandscapeChoiceModal === 'function') {
    showLandscapeChoiceModal(0, function(song){
      launchWithLandscape(song);
    });
  } else {
    launchWithLandscape(null);
  }
  if(typeof toast === 'function') toast('Howard developer mode ready.');
}
window.startHowardDevMode = startHowardDevMode;

if(typeof document !== 'undefined' && !window.__fateHowardDevCommandInstalled) {
  window.__fateHowardDevCommandInstalled = true;
  document.addEventListener('keydown', function(ev){
    if(ev.key !== 'Enter') return;
    const el = document.activeElement;
    if(!el) return;
    const isTextInput = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
    if(!isTextInput) return;
    const raw = el.isContentEditable ? (el.textContent || '') : (el.value || '');
    if(raw.trim() !== '/howard123') return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    if(el.isContentEditable) el.textContent = '';
    else el.value = '';
    startHowardDevMode();
  }, true);
}

function getAIProfileImg(ai, shape='circle') {
  if(!ai) return null;
  const raw = ai.img || ai.profileImg || ai.avatar || null;
  const resolved = typeof resolveProfileImgSrc === 'function' ? resolveProfileImgSrc(raw, shape) : raw;
  if(resolved) return resolved;
  const seed = Math.abs(typeof hashStr === 'function' ? hashStr(ai.name || 'ai') : 0);
  return 'aiicons/ai' + ((seed % 18) + 1) + '.png';
}

function matchPreloadLoaderHtml(onlineMatch) {
  return `
    <div class="match-preload-panel" id="match-preload-panel">
      <div class="match-preload-copy">
        <div class="match-preload-status" id="match-preload-status">Loading assets.</div>
      </div>
      <div class="match-preload-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <span id="match-preload-fill"></span>
      </div>
    </div>`;
}

function updateMatchPreloadUi(progress, status, meta) {
  const value = Math.max(0, Math.min(1, Number(progress) || 0));
  const fill = document.getElementById('match-preload-fill');
  const panel = document.getElementById('match-preload-panel');
  const statusEl = document.getElementById('match-preload-status');
  const metaEl = document.getElementById('match-preload-meta');
  if(fill) fill.style.width = Math.round(value * 100) + '%';
  if(panel) {
    const bar = panel.querySelector('.match-preload-bar');
    if(bar) bar.setAttribute('aria-valuenow', String(Math.round(value * 100)));
  }
  if(statusEl) statusEl.textContent = value >= 1 ? 'Finished.' : 'Loading assets.';
  if(metaEl) metaEl.textContent = '';
}

function runMatchPreloadGate(onlineMatch) {
  const gateStarted = performance.now ? performance.now() : Date.now();
  const waitForMinimumGate = function(){
    const now = performance.now ? performance.now() : Date.now();
    const remaining = Math.max(0, 5000 - (now - gateStarted));
    return new Promise(function(resolve){ setTimeout(resolve, remaining); });
  };
  let localReport = null;
  updateMatchPreloadUi(0.03);
  const localPortion = onlineMatch ? 0.74 : 1;
  const runWarmPass = function(pass, from, to){
    if(typeof window.fateWarmMatchAssets !== 'function') return Promise.resolve({missingWarmup:true, pass});
    return window.fateWarmMatchAssets({
      source:(onlineMatch ? 'online-matchup-loader' : 'matchup-loader') + '-pass-' + pass,
      maxCards:onlineMatch ? 96 : 80,
      forceImages:pass > 1,
      pass,
      onProgress:function(item){
        const progress = Math.max(0, Math.min(1, Number(item && item.progress) || 0));
        const value = from + (to - from) * progress;
        updateMatchPreloadUi(Math.max(0.03, Math.min(localPortion, value)));
      }
    });
  };
  const warm = runWarmPass(1, 0.03, localPortion * 0.58)
    .then(function(firstReport){
      return runWarmPass(2, localPortion * 0.58, localPortion).then(function(secondReport){
        return {
          at:secondReport && secondReport.at,
          ms:Math.round(((Number(firstReport && firstReport.ms) || 0) + (Number(secondReport && secondReport.ms) || 0)) * 10) / 10,
          cards:Number(secondReport && secondReport.cards || firstReport && firstReport.cards || 0) || 0,
          imageOk:(Number(firstReport && firstReport.imageOk) || 0) + (Number(secondReport && secondReport.imageOk) || 0),
          imageFailed:(Number(firstReport && firstReport.imageFailed) || 0) + (Number(secondReport && secondReport.imageFailed) || 0),
          textureRecords:Number(secondReport && secondReport.textureRecords || firstReport && firstReport.textureRecords || 0) || 0,
          textureWait:secondReport && secondReport.textureWait || firstReport && firstReport.textureWait || null,
          textureCache:secondReport && secondReport.textureCache || firstReport && firstReport.textureCache || null,
          firstPass:firstReport || null,
          secondPass:secondReport || null,
          source:onlineMatch ? 'online-matchup-loader-double-pass' : 'matchup-loader-double-pass',
          doublePass:true
        };
      });
    });
  return Promise.resolve(warm)
    .then(function(report){
      localReport = report || {};
      if(!onlineMatch || typeof window.fatePublishOnlineMatchPreload !== 'function') return null;
      updateMatchPreloadUi(0.78);
      return window.fatePublishOnlineMatchPreload(localReport);
    })
    .then(function(){
      if(!onlineMatch || typeof window.fateWaitForOnlineMatchPreload !== 'function') return null;
      updateMatchPreloadUi(0.82);
      return window.fateWaitForOnlineMatchPreload({
        localReport,
        timeoutMs:15000,
        onProgress:function(item){
          const ready = Number(item && item.readyCount || 0);
          const total = Math.max(2, Number(item && item.total || 2));
          const value = 0.82 + Math.min(0.16, (ready / total) * 0.16);
          updateMatchPreloadUi(value);
        }
      });
    })
    .then(function(){
      updateMatchPreloadUi(1);
      if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.prewarmMatchEntryLayers === 'function') {
        try {
          window.FateMatchRendererAdapter.prewarmMatchEntryLayers({
            source:onlineMatch ? 'online-matchup-loader' : 'matchup-loader'
          });
        } catch(e) {}
      }
      return waitForMinimumGate();
    })
    .catch(function(err){
      const perf = window.__fatePerf = window.__fatePerf || {};
      perf.matchPreloadGateError = String(err && err.message || err);
      updateMatchPreloadUi(1);
      return waitForMinimumGate();
    });
}

function recordMatchEntryStep(step, extra) {
  try {
    const perf = window.__fatePerf = window.__fatePerf || {};
    const item = Object.assign({
      at:Math.round(performance.now ? performance.now() : Date.now()),
      step:String(step || 'step')
    }, extra || {});
    if(!Array.isArray(perf.matchEntrySteps)) perf.matchEntrySteps = [];
    perf.matchEntrySteps.push(item);
    if(perf.matchEntrySteps.length > 40) perf.matchEntrySteps.shift();
  } catch(e) {}
}

function showMatchEntryLoadingVeil() {
  const started = performance.now ? performance.now() : Date.now();
  recordMatchEntryStep('entry-veil-show');
  let veil = document.getElementById('match-entry-loading-veil');
  if(!veil) {
    veil = document.createElement('div');
    veil.id = 'match-entry-loading-veil';
    veil.className = 'match-entry-loading-veil';
    veil.innerHTML = '<div class="match-entry-loading-panel"><div class="match-preload-status">Loading assets.</div><div class="match-preload-bar" aria-hidden="true"><span style="width:100%"></span></div></div>';
    document.body.appendChild(veil);
  }
  veil.classList.add('on');
  veil.setAttribute('aria-hidden', 'false');
  return started;
}

function hideMatchEntryLoadingVeil(startedAt) {
  const veil = document.getElementById('match-entry-loading-veil');
  const started = Number(startedAt) || (performance.now ? performance.now() : Date.now());
  const close = function(){
    const node = document.getElementById('match-entry-loading-veil');
    if(!node) return;
    node.classList.remove('on');
    node.setAttribute('aria-hidden', 'true');
    recordMatchEntryStep('entry-veil-hide', {
      visibleMs:Math.round(((performance.now ? performance.now() : Date.now()) - started) * 10) / 10
    });
    setTimeout(function(){
      if(node && !node.classList.contains('on')) node.remove();
    }, 220);
  };
  const elapsed = (performance.now ? performance.now() : Date.now()) - started;
  const minVisible = 260;
  const delay = Math.max(0, minVisible - elapsed);
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){
      setTimeout(close, delay);
    });
  });
}

// Pre-game matchup screen - shows both players' decks and profiles
function showPreGameMatchup(vsAI, onContinue) {
  const diffNames = {easy:'Rookie', medium:'Apprentice', hard:'Veteran', extreme:'Master'};
  const diffElo = {easy:800, medium:1000, hard:1200, extreme:1400};
  const p1Pic = getProfileImgSrc();
  const cropStyle = typeof getProfileCropStyle==='function' ? getProfileCropStyle() : 'object-fit:cover;';
  const d = G.aiDifficulty||'medium';
  const myElo = CURRENT_MODE==='challenger'?(USER_PROFILE.challengerElo||600):(USER_PROFILE.elo||600);
  const oppElo = G._aiOpponentElo || diffElo[d]||1000;
  const boxStyle = 'background:rgba(0,0,0,.5);border:1.5px solid var(--border);border-radius:10px;padding:1.5rem 1.2rem;';
  const myPanelFrame = typeof getRankFrameStyle === 'function' ? getRankFrameStyle(myElo,'panel') : '';
  const oppPanelFrame = typeof getRankFrameStyle === 'function' ? getRankFrameStyle(oppElo,'panel') : '';
  const myPicFrame = typeof getRankFrameStyle === 'function' ? getRankFrameStyle(myElo,'icon') : '';
  const oppPicFrame = typeof getRankFrameStyle === 'function' ? getRankFrameStyle(oppElo,'icon') : '';
  const aiMult = vsAI ? Number(G._aiFateMultiplier || getAIFateMultiplier(G._selectedAI) || 1) : 1;
  const aiRank = vsAI && G._selectedAI && G._selectedAI.rank ? G._selectedAI.rank : '';
  const aiPic = vsAI && G._selectedAI ? getAIProfileImg(G._selectedAI, 'circle') : null;
  const aiMultiplierNotice = aiMult > 1 ? `
    <div class="match-rule-banner">
      <div class="mrb-kicker">AI Rank Rule</div>
      <div class="mrb-main">${escapeHtml(aiRank)}: ${formatFateMultiplier(aiMult)} Fate in every Zone</div>
      <div class="mrb-copy">This opponent's zone totals are multiplied after normal card effects are counted.</div>
    </div>` : '';

  const onlineMatch = !!(G && G._onlineRoomCode && G.playerProfiles);
  const op0 = onlineMatch ? (G.playerProfiles[0] || {}) : null;
  const op1 = onlineMatch ? (G.playerProfiles[1] || {}) : null;
  const safeOnlineName = p => (p && (p.name || p.chosenUsername || p.displayName || p.username || p.baseCode)) || 'Player';
  const safeOnlinePic = p => (p && (p.img || p.photoURL || p.profileImg)) || 'blank.png';
  const safeOnlineLevel = p => Number(p && p.level || 1) || 1;
  const safeOnlineElo = p => Number(p && p.elo || p.challengerElo || 600) || 600;
  const safeOnlineCrop = (p, fallback='center 22%') => {
    const profile = Object.assign({}, p || {}, {profileImg:(p && (p.profileImg || p.photoURL || p.img || p.pfp)) || null});
    if(window.FateOnline?.profilePhotoCropStyle) return window.FateOnline.profilePhotoCropStyle(profile, fallback);
    return `width:100%;height:100%;object-fit:cover;object-position:${fallback};`;
  };
  const displayP1Pic = onlineMatch ? safeOnlinePic(op0) : p1Pic;
  const displayP1Name = onlineMatch ? safeOnlineName(op0) : (USER_PROFILE.username || 'Player');
  const displayP1Level = onlineMatch ? safeOnlineLevel(op0) : USER_PROFILE.level;
  const displayP1Elo = onlineMatch ? safeOnlineElo(op0) : myElo;
  const displayP2Pic = onlineMatch ? safeOnlinePic(op1) : aiPic;
  const displayP2Name = onlineMatch ? safeOnlineName(op1) : (vsAI ? (G._selectedAI ? G._selectedAI.name : `AI - ${diffNames[d] || 'Apprentice'}`) : 'Player 2');
  const displayP2Elo = onlineMatch ? safeOnlineElo(op1) : oppElo;
  const displayP1CropStyle = onlineMatch ? safeOnlineCrop(op0, 'center 22%') : `width:100%;height:100%;${cropStyle}`;
  const displayP2CropStyle = onlineMatch ? safeOnlineCrop(op1, 'center 22%') : 'width:100%;height:100%;object-fit:cover;object-position:center 25%;';
  const displayP1PicFrame = typeof getRankFrameStyle === 'function' ? getRankFrameStyle(displayP1Elo,'icon') : myPicFrame;
  const displayP2PicFrame = typeof getRankFrameStyle === 'function' ? getRankFrameStyle(displayP2Elo,'icon') : oppPicFrame;
  const displayP1PanelFrame = typeof getRankFrameStyle === 'function' ? getRankFrameStyle(displayP1Elo,'panel') : myPanelFrame;
  const displayP2PanelFrame = typeof getRankFrameStyle === 'function' ? getRankFrameStyle(displayP2Elo,'panel') : oppPanelFrame;

  const body = `
    <div class="match-overview" style="display:flex;gap:1.5rem;flex-wrap:wrap;justify-content:center;align-items:stretch;padding:1rem 0;">
      <div style="flex:1;min-width:260px;max-width:380px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;${boxStyle}${displayP1PanelFrame}">
        <div style="width:108px;height:108px;border-radius:16px;overflow:hidden;background:#0a0a0f;margin:0 auto .8rem;display:flex;align-items:center;justify-content:center;${displayP1PicFrame}">
          ${displayP1Pic?`<img src="${displayP1Pic}" style="${displayP1CropStyle}" onerror="this.onerror=null;this.src='blank.png';">`:'<span style="font-size:2.8rem;color:var(--dim);">P</span>'}
        </div>
        <div style="font-family:Cinzel,serif;color:var(--p1);font-size:1.34rem;font-weight:700;margin-bottom:.4rem;min-height:2.4rem;display:flex;align-items:center;justify-content:center;line-height:1.15;">${escapeHtml(displayP1Name)}</div>
        <div style="margin:.5rem auto;">${renderRankBadge(displayP1Elo,'lg')}</div>
        <div style="font-family:Cinzel,serif;font-size:.9rem;color:var(--dim);margin-top:.4rem;min-height:1.35rem;display:flex;align-items:center;justify-content:center;">ELO ${displayP1Elo} - Level ${displayP1Level}</div>
      </div>
      <div style="display:flex;align-items:center;font-family:Cinzel,serif;font-size:2.8rem;color:var(--gold);text-shadow:0 0 24px rgba(201,168,76,.6);">VS</div>
      <div style="flex:1;min-width:260px;max-width:380px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;${boxStyle}${displayP2PanelFrame}">
        <div style="width:108px;height:108px;border-radius:16px;overflow:hidden;background:#0a0a0f;margin:0 auto .8rem;display:flex;align-items:center;justify-content:center;${displayP2PicFrame}">
          ${displayP2Pic?`<img src="${displayP2Pic}" style="${displayP2CropStyle}" onerror="this.onerror=null;this.src='blank.png';">`:(vsAI?'<span style="font-size:2rem;">AI</span>':'<span style="font-size:2.8rem;color:var(--dim);">P</span>')}
        </div>
        <div style="font-family:Cinzel,serif;color:var(--p2);font-size:1.34rem;font-weight:700;margin-bottom:.4rem;min-height:2.4rem;display:flex;align-items:center;justify-content:center;line-height:1.15;">${escapeHtml(displayP2Name)}</div>
        <div style="margin:.5rem auto;">${renderRankBadge(displayP2Elo,'lg')}</div>
        <div style="font-family:Cinzel,serif;font-size:.9rem;color:var(--dim);margin-top:.4rem;min-height:1.35rem;display:flex;align-items:center;justify-content:center;">ELO ${displayP2Elo}</div>
        ${aiMult > 1 ? `<div style="margin-top:.55rem;padding:.22rem .55rem;border:1px solid rgba(255,215,0,.34);border-radius:999px;color:#ffd76a;font-family:Cinzel,serif;font-size:.7rem;letter-spacing:.08em;background:rgba(255,215,0,.07);">${formatFateMultiplier(aiMult)} Zone Fate</div>` : ''}
      </div>
    </div>
    ${aiMultiplierNotice}
    <div style="text-align:center;margin-top:.5rem;">
      <div style="font-family:Cinzel,serif;font-size:.75rem;color:var(--dim);letter-spacing:.12em;">${CURRENT_MODE==='challenger'?'CHALLENGER MODE':'FREE PLAY'}</div>
    </div>`;
  if(onlineMatch){
    const countdownBody = body + matchPreloadLoaderHtml(true);
    G._onlineLocalModalBypass = true;
    window.__fateOnlineLocalModalBypass = true;
    try{
      showModal('Match Overview', countdownBody, []);
    }finally{
      G._onlineLocalModalBypass = false;
      setTimeout(()=>{ window.__fateOnlineLocalModalBypass = false; }, 80);
    }
    const modalEl = document.getElementById('modal');
    if(modalEl) modalEl.classList.add('match-overview-modal','online-match-overview-modal');
    runMatchPreloadGate(true).then(function(){
      closeModal();
      onContinue();
    });
    return;
  }
  showModal('Match Overview', body + matchPreloadLoaderHtml(false), []);
  const modalEl = document.getElementById('modal');
  if(modalEl) modalEl.classList.add('match-overview-modal');
  runMatchPreloadGate(false).then(function(){
    closeModal();
    onContinue();
  });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  AI PRESET DECKS — hand-crafted strategic builds
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Each deck is exactly 40 cards and respects rarity limits (1 star, 2 square, 3 circle/triangle).
// IDs reference the CARDS array. These favor synergy over raw card quantity.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  AI OPPONENTS — Named characters per ELO rank tier
//  Each has a unique deck, playstyle notes, and personality
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const AI_OPPONENTS = [
  // === FOOTMAN (0-799) — plays the 4 starter decks ===
  {name:'Anxiety Wreck Carolyn',elo:600,rank:'Footman',style:'cautious',img:'aiicons/ai18.png',
   desc:'Just learning the basics. Hesitant plays and missed opportunities.',
   deckPool:'starter', deckRef:'starter_maelstrom', deck:[]},
  {name:'Incelic Jimmy',elo:700,rank:'Footman',style:'reckless',img:'aiicons/ai16.png',
   desc:'All aggression, no strategy. Throws cards down and hopes for the best.',
   deckPool:'starter', deckRef:'starter_freeworld', deck:[]},
  {name:'Protector of Bird-Kind Makenna',elo:750,rank:'Footman',style:'distracted',img:'aiicons/ai17.png',
   desc:'Gets sidetracked easily. Strong openings that fizzle out mid-game.',
   deckPool:'starter', deckRef:'starter_assault', deck:[]},

  // === CAPTAIN-OFFICER (800-999) — plays the 4 starter decks ===
  {name:'Explorer Anicka Konvicka',elo:850,rank:'Captain-Officer',style:'methodical',img:'aiicons/ai15.png',
   desc:'Calculates every move carefully. Slow but rarely makes mistakes.',
   deckPool:'starter', deckRef:'starter_incel', deck:[]},
  {name:'High Envoy Chloe Kirk',elo:900,rank:'Captain-Officer',style:'adaptive',img:'aiicons/ai14.png',
   desc:'Always experimenting with new lines. Unpredictable but sometimes brilliant.',
   deckPool:'starter', deckRef:'starter_maelstrom', deck:[]},
  {name:'El Matador Santiago Alvarez',elo:950,rank:'Captain-Officer',style:'disciplined',img:'aiicons/ai13.png',
   desc:'Follows the game plan no matter what. Rigid but effective fundamentals.',
   deckPool:'starter', deckRef:'starter_freeworld', deck:[]},

  // === LIEUTENANT AT ARMS (1000-1199) — upgraded v2 decks ===
  {name:'Postmodernist Dylan',elo:1050,rank:'Lieutenant at Arms',style:'disruptive',img:'aiicons/ai12.png',
   desc:'Finds angles you did not consider. Turns your own board state against you.',
   deckPool:'starter', deckRef:'starter_incel_2', deck:[]},
  {name:'Prime Minister Marie L\'amboure',elo:1100,rank:'Lieutenant at Arms',style:'diplomatic',img:'aiicons/ai11.png',
   desc:'Controls the tempo of the match. You play on her schedule or not at all.',
   deckPool:'starter', deckRef:'starter_freeworld_2', deck:[]},
  {name:'Cheez Its Overlord Cathy',elo:1150,rank:'Lieutenant at Arms',style:'resourceful',img:'aiicons/ai10.png',
   desc:'Squeezes maximum value out of every card. Never wastes a placement.',
   deckPool:'starter', deckRef:'starter_assault_2', deck:[]},

  // === SERGEANT OF THE GUARD (1200-1399) — upgraded v2 decks ===
  {name:'Queen Felicyta Janowicz',elo:1250,rank:'Sergeant of the Guard',style:'commanding',img:'aiicons/ai9.png',
   desc:'Coordinates multi-zone pressure that forces impossible decisions.',
   deckPool:'starter', deckRef:'starter_soft_suppression', deck:[]},
  {name:'Diplomat Anne Stone',elo:1300,rank:'Sergeant of the Guard',style:'calculating',img:'aiicons/ai8.png',
   desc:'Reads your hand through your plays. Always two steps ahead.',
   deckPool:'starter', deckRef:'starter_assault_2', deck:[]},
  {name:'Fighter Alondra Hopkins',elo:1350,rank:'Sergeant of the Guard',style:'relentless',img:'aiicons/ai7.png',
   desc:'Overwhelming force concentrated at the perfect moment.',
   deckPool:'starter', deckRef:'starter_maelstrom_2', deck:[]},

  // === COMMANDER-GENERAL (1400-1599) — AI-exclusive advanced decks ===
  {name:'Financial Consultant Phil',elo:1450,rank:'Commander-General',style:'efficient',img:'aiicons/ai6.png',
   desc:'Invests exactly where the return is highest. Ruthless efficiency.',
   deckPool:'starter', deckRef:'ai_investing_future', deck:[]},
  {name:'Codebreaker Agent K',elo:1500,rank:'Commander-General',style:'elusive',img:'aiicons/ai5.png',
   desc:'You never know where the next threat is coming from.',
   deckPool:'starter', deckRef:'ai_howards_choice', deck:[]},
  {name:'Divine Entity Cosmic GF',elo:1550,rank:'Commander-General',style:'visionary',img:'aiicons/ai4.png',
   desc:'Sees the entire board as one interconnected puzzle. Plays three turns ahead.',
   deckPool:'starter', deckRef:'ai_henrys_conviction', deck:[]},

  // === HIGH MARSHALL (1600+) — AI-exclusive advanced decks ===
  {name:'Mastermind Duncan Heyward',elo:1650,rank:'High Marshall',style:'inevitable',img:'aiicons/ai3.png',
   desc:'Every card placed builds toward an unbeatable endgame. Patience personified.',
   deckPool:'starter', deckRef:'ai_royal_flush', deck:[]},
  {name:'Field Marshall Achille Laurent',elo:1750,rank:'High Marshall',style:'omniscient',img:'aiicons/ai2.png',
   desc:'Reads your strategy and dismantles it. Adapts faster than you can adjust.',
   deckPool:'starter', deckRef:'ai_coordinators_dream', deck:[]},
  {name:'Commander Maja Kaminska',elo:1850,rank:'High Marshall',style:'overwhelming',img:'aiicons/ai1.png',
   desc:'Raw power backed by perfect execution. The final test.',
   deckPool:'starter', deckRef:'ai_blitz', deck:[]}
];

// Add trueElo to all AI opponents (base + 200 competence boost)
AI_OPPONENTS.forEach(ai => {
  if(!ai.trueElo) ai.trueElo = ai.elo + 200;
});

const AI_ELO_STATE_KEY = 'fate_ai_elo_state';

function loadAIEloState() {
  try { return JSON.parse(localStorage.getItem(AI_ELO_STATE_KEY) || '{}'); }
  catch(e){ return {}; }
}

function saveAIEloState(state) {
  try { localStorage.setItem(AI_ELO_STATE_KEY, JSON.stringify(state || {})); } catch(e){}
  if(window.FateCloudSave) window.FateCloudSave.saveAIEloState();
}

function getAIRecordKey(aiOrName) {
  if(typeof aiOrName === 'string') return aiOrName;
  if(aiOrName && aiOrName.isMonthly && aiOrName.monthKey) return aiOrName.monthKey + ':' + aiOrName.name;
  return (aiOrName && aiOrName.name) || '';
}

function applyStoredAIEloState(ai) {
  if(!ai || !ai.name) return ai;
  const state = loadAIEloState();
  const rec = state[getAIRecordKey(ai)];
  if(rec && Number.isFinite(Number(rec.elo))) {
    const storedElo = Math.max(100, Math.round(Number(rec.elo)));
    const seededElo = Math.max(100, Math.round(Number(ai.elo) || 600));
    ai.elo = ai.isMonthly && storedElo === 600 && seededElo > 600 ? seededElo : storedElo;
  }
  if(rec && Number.isFinite(Number(rec.trueElo))) ai.trueElo = Math.max(100, Math.round(Number(rec.trueElo)));
  return ai;
}

function applyStoredAIEloStateToList(list) {
  if(!Array.isArray(list)) return list;
  list.forEach(applyStoredAIEloState);
  return list;
}

function saveCurrentMonthlyAI() {
  if(typeof MONTHLY_AI_OPPONENTS === 'undefined' || !Array.isArray(MONTHLY_AI_OPPONENTS) || !MONTHLY_AI_OPPONENTS.length) return;
  const monthKey = typeof getMonthKey === 'function' ? getMonthKey() : null;
  if(!monthKey) return;
  try { localStorage.setItem('fate_monthly_ai_' + monthKey, JSON.stringify(MONTHLY_AI_OPPONENTS)); } catch(e){}
}

function persistAIEloState(ai) {
  if(!ai || !ai.name) return;
  const state = loadAIEloState();
  state[getAIRecordKey(ai)] = {
    elo: Math.max(100, Math.round(Number(ai.elo) || 600)),
    trueElo: Math.max(100, Math.round(Number(ai.trueElo) || Number(ai.elo) || 600)),
    updatedAt: Date.now()
  };
  saveAIEloState(state);
  saveCurrentMonthlyAI();
}

function syncAIEloEverywhere(aiName, newElo, didWin) {
  if(!aiName) return null;
  const resolvedElo = Math.max(100, Math.round(Number(newElo) || 600));
  let source = null;
  const updateList = list=>{
    if(!Array.isArray(list)) return;
    const ai = list.find(a=>a && a.name === aiName);
    if(ai){
      ai.elo = resolvedElo;
      try { if(typeof getRank === 'function') ai.rank = getRank(resolvedElo).name; } catch(e) {}
      if(!ai.trueElo) ai.trueElo = resolvedElo + 200;
      source = source || ai;
    }
  };
  updateList(AI_OPPONENTS);
  if(typeof MONTHLY_AI_OPPONENTS !== 'undefined') updateList(MONTHLY_AI_OPPONENTS);
  if(typeof SIMULATED_ONLINE_PLAYERS !== 'undefined' && Array.isArray(SIMULATED_ONLINE_PLAYERS)){
    const online = SIMULATED_ONLINE_PLAYERS.find(p=>p && p.username === aiName);
    if(online) online.elo = resolvedElo;
  }
  if(typeof G !== 'undefined' && G && G._selectedAI && G._selectedAI.name === aiName){
    G._selectedAI.elo = resolvedElo;
    G._aiOpponentElo = resolvedElo;
  }
  if(!source) source = {name:aiName, elo:resolvedElo, img:null};
  if(typeof updateAILeaderboardEntry === 'function' && typeof didWin === 'boolean'){
    updateAILeaderboardEntry(source, didWin);
  } else if(typeof LEADERBOARD !== 'undefined'){
    let entry = LEADERBOARD.find(e=>e.username === aiName);
    if(!entry){
      entry = {username:aiName, wins:0, losses:0, profileImg:(typeof getAIProfileImg === 'function' ? getAIProfileImg(source, 'circle') : (source.img || 'blank.png')), isAI:true, isMonthly:!!source.isMonthly, monthKey:source.monthKey || (source.isMonthly ? getMonthKey() : '')};
      LEADERBOARD.push(entry);
    }
    entry.elo = resolvedElo;
    entry.isMonthly = !!source.isMonthly;
    entry.monthKey = source.monthKey || (source.isMonthly ? getMonthKey() : entry.monthKey || '');
    if(entry.isAI && (!entry.profileImg || entry.profileImg === 'blank.png')){
      entry.profileImg = typeof getAIProfileImg === 'function' ? getAIProfileImg(source, 'circle') : (source.img || 'blank.png');
    }
  }
  persistAIEloState(source);
  if(typeof saveLeaderboard === 'function') saveLeaderboard();
  if(typeof saveSocial === 'function') saveSocial();
  return source;
}

applyStoredAIEloStateToList(AI_OPPONENTS);

// Map old difficulty keys to AI opponent selection — resolve dynamically so deckRef works
const AI_DECKS = {
  get easy(){ return getPlayableAIDeck(AI_OPPONENTS[0]) || []; },
  get medium(){ return getPlayableAIDeck(AI_OPPONENTS[3]) || []; },
  get hard(){ return getPlayableAIDeck(AI_OPPONENTS[9]) || []; },
  get extreme(){ return getPlayableAIDeck(AI_OPPONENTS[AI_OPPONENTS.length-1]) || []; }
};

// ─── TRUE ELO & AI SIMULATION ENGINE ───
// True ELO: invisible metric that determines actual AI play quality.
// Daily variation: up to ±150 points from base true ELO.
// Title screen "Free Play" AI uses fixed true ELO = displayed ELO (no boost).

function getDailyTrueElo(ai) {
  // Generate a daily seed from the AI name + today's date
  const today = new Date().toISOString().slice(0,10);
  const seed = hashStr(ai.name + today);
  const variation = ((seed % 301) - 150); // -150 to +150
  return (ai.trueElo || ai.elo + 400) + variation;
}

function hashStr(s) {
  let h = 0;
  for(let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Predict match outcome between two entities with true ELO.
// No artificial upset floor: AI-vs-AI results should follow ELO odds directly.
function predictMatchOutcome(trueElo1, trueElo2, upsetFloor=0) {
  const expected1 = 1 / (1 + Math.pow(10, (trueElo2 - trueElo1) / 400));
  // Scale up the upset chance based on ELO closeness
  // Equal ELO → 50%, max gap → upsetFloor
  const winChance1 = Math.max(upsetFloor, Math.min(1 - upsetFloor, expected1));
  return Math.random() < winChance1;
}

// Legacy local AI simulation is disabled. AI ELO simulation now runs only through
// the shared online simulation in 19-online-elo.js.
function runAISimulation() {
  return;
  const simKey = 'fate_ai_sim_cadence';
  let simData;
  try { simData = JSON.parse(localStorage.getItem(simKey) || '{}'); } catch(e){ simData = {}; }
  const now = Date.now();
  const cadence = window.FATE_ONLINE?.user ? 10 * 60 * 1000 : 60 * 60 * 1000;
  if(Number(simData.lastRunAt || 0) && now - Number(simData.lastRunAt || 0) < cadence) return;

  const matchesToRun = 1;
  const results = [];

  for(let m = 0; m < matchesToRun; m++) {
    // Pick two random different AI opponents
    const aiSource = typeof getRandomMatchAIOpponents === 'function' ? getRandomMatchAIOpponents() : AI_OPPONENTS;
    const pool = [...aiSource];
    const i1 = Math.floor(Math.random() * pool.length);
    let i2 = Math.floor(Math.random() * pool.length);
    while(i2 === i1 && pool.length > 1) i2 = Math.floor(Math.random() * pool.length);

    const ai1 = pool[i1];
    const ai2 = pool[i2];
    const trueElo1 = getDailyTrueElo(ai1);
    const trueElo2 = getDailyTrueElo(ai2);

    const ai1Wins = predictMatchOutcome(trueElo1, trueElo2);

    // Calculate ELO changes
    const K = 24;
    const exp1 = 1 / (1 + Math.pow(10, (ai2.elo - ai1.elo) / 400));
    const exp2 = 1 - exp1;
    const rawChange1 = K * ((ai1Wins ? 1 : 0) - exp1);
    const rawChange2 = K * ((ai1Wins ? 0 : 1) - exp2);
    const change1 = typeof applyMinimumEloDelta === 'function' ? applyMinimumEloDelta(rawChange1, ai1Wins) : Math.round(rawChange1);
    const change2 = typeof applyMinimumEloDelta === 'function' ? applyMinimumEloDelta(rawChange2, !ai1Wins) : Math.round(rawChange2);

    ai1.elo = Math.max(100, ai1.elo + change1);
    ai2.elo = Math.max(100, ai2.elo + change2);

    // Update leaderboard
    if(typeof syncAIEloEverywhere === 'function'){
      syncAIEloEverywhere(ai1.name, ai1.elo, ai1Wins);
      syncAIEloEverywhere(ai2.name, ai2.elo, !ai1Wins);
    } else {
      updateAILeaderboardEntry(ai1, ai1Wins);
      updateAILeaderboardEntry(ai2, !ai1Wins);
    }

    results.push({
      a: ai1.name, b: ai2.name,
      winner: ai1Wins ? ai1.name : ai2.name,
      eloA: ai1.elo, eloB: ai2.elo,
      changeA: change1, changeB: change2
    });
    // Log to match history
    if(typeof logMatch === 'function') logMatch(ai1.name, ai2.name, ai1Wins?ai1.name:ai2.name, change1, change2, ai1.elo, ai2.elo, true);
  }

  simData.lastRunAt = now;
  simData.matchesRun = (Number(simData.matchesRun || 0) || 0) + matchesToRun;
  simData.results = results;
  try { localStorage.setItem(simKey, JSON.stringify(simData)); } catch(e){}

  // Save updated ELOs
  if(typeof saveLeaderboard === 'function') saveLeaderboard();
}

function updateAILeaderboardEntry(ai, didWin) {
  if(typeof LEADERBOARD === 'undefined') return;
  let entry = LEADERBOARD.find(e => e.username === ai.name);
  if(!entry) {
    entry = {username: ai.name, elo: ai.elo, wins: 0, losses: 0, profileImg: (typeof getAIProfileImg === 'function' ? getAIProfileImg(ai, 'circle') : (ai.img || 'blank.png')), isAI: true, isMonthly: !!ai.isMonthly, monthKey:ai.monthKey || (ai.isMonthly ? getMonthKey() : '')};
    LEADERBOARD.push(entry);
  }
  entry.elo = ai.elo;
  entry.isMonthly = !!ai.isMonthly;
  entry.monthKey = ai.monthKey || (ai.isMonthly ? getMonthKey() : entry.monthKey || '');
  if(entry.isAI && (!entry.profileImg || entry.profileImg === 'blank.png')){
    entry.profileImg = typeof getAIProfileImg === 'function' ? getAIProfileImg(ai, 'circle') : (ai.img || 'blank.png');
  }
  if(didWin) entry.wins = (entry.wins || 0) + 1;
  else entry.losses = (entry.losses || 0) + 1;
}

// Get AI difficulty settings with true ELO boost
// For challenger/free play random AI, use the daily true ELO to scale AI competence
function getAICompetenceFromTrueElo(trueElo) {
  // Map true ELO to mistake/skip chances (scaled +200 for general competence boost)
  // Higher true ELO = fewer mistakes, better consolidation timing
  if(trueElo >= 2000) return {mistakeChance:0, skipEffectChance:0, consolidateThreshold:4};
  if(trueElo >= 1700) return {mistakeChance:0.02, skipEffectChance:0.01, consolidateThreshold:5};
  if(trueElo >= 1400) return {mistakeChance:0.05, skipEffectChance:0.02, consolidateThreshold:5};
  if(trueElo >= 1200) return {mistakeChance:0.08, skipEffectChance:0.03, consolidateThreshold:6};
  if(trueElo >= 1000) return {mistakeChance:0.14, skipEffectChance:0.06, consolidateThreshold:7};
  if(trueElo >= 800)  return {mistakeChance:0.22, skipEffectChance:0.1, consolidateThreshold:8};
  return {mistakeChance:0.3, skipEffectChance:0.15, consolidateThreshold:9};
}

// ─── THREE-MONTH AI PLAYERS ───
const MONTHLY_AI_CYCLE_MONTHS = 3;
const MONTHLY_AI_NAMES_POOL = [
  'Shadow','Ember','Frost','Storm','Blaze','Void','Rune','Drift','Thorn','Pulse',
  'Nexus','Vex','Prism','Gale','Cipher','Wraith','Flint','Onyx','Sable','Zenith',
  'Crimson','Azure','Jade','Cobalt','Ivory','Obsidian','Scarlet','Violet','Indigo','Amber'
];
const MONTHLY_AI_SURNAMES = [
  'Walker','Knight','Hawk','Fox','Wolf','Raven','Crane','Drake','Viper','Lynx',
  'Phoenix','Falcon','Panther','Tiger','Eagle','Serpent','Bear','Lion','Crow','Stag'
];
const RANDOM_AI_PERSONALITIES = [
  { style:'aggro', label:'Aggro', desc:'presses every early lead and values fast contested-row pressure' },
  { style:'control', label:'Control', desc:'slows the board down and looks for denial lines' },
  { style:'defensive', label:'Defensive', desc:'protects safe rows and avoids risky exchanges' },
  { style:'balanced', label:'Balanced', desc:'keeps zones even and rarely overcommits' },
  { style:'tempo', label:'Tempo', desc:'prefers immediate board swings and clean turn-by-turn pressure' },
  { style:'disruption', label:'Disruption', desc:'hunts opposing resources and awkward board states' },
  { style:'blitz', label:'Blitz', desc:'front-loads power before opponents stabilize' },
  { style:'lockdown', label:'Lockdown', desc:'turns one zone into a problem and keeps it that way' },
  { style:'zone_specialist', label:'Zone Specialist', desc:'reads zone math obsessively and commits where the margin matters' },
  { style:'hoarder', label:'Hoarder', desc:'keeps extra cards in hand until the payoff is clear' },
  { style:'gambler', label:'Gambler', desc:'takes swingy lines and trusts big reversals' },
  { style:'bully', label:'Bully', desc:'attacks weak zones and piles pressure where opponents are thin' },
  { style:'turtle', label:'Turtle', desc:'plays slowly, safely, and asks the opponent to overextend' },
  { style:'combo', label:'Combo', desc:'prioritizes engines, searches, and repeatable effects' },
  { style:'swarm', label:'Swarm', desc:'fills space quickly before refining the board' },
  { style:'sniper', label:'Sniper', desc:'targets one key lane or card instead of spreading attention' },
  { style:'collector', label:'Collector', desc:'values complete setups and repeated copies of important cards' },
  { style:'sacrificial', label:'Sacrificial', desc:'spends small cards freely to build a decisive threat' },
  { style:'opportunist', label:'Opportunist', desc:'changes plans fast when an exposed zone appears' },
  { style:'chaotic', label:'Chaotic', desc:'adds volatility and unexpected priorities to otherwise normal lines' }
];
const MONTHLY_AI_STYLES = RANDOM_AI_PERSONALITIES.map(p => p.style);
let MONTHLY_AI_OPPONENTS = [];
const MONTHLY_AI_GENERATION_VERSION = 2;
const MONTHLY_AI_SKILL_BANDS = [
  {visible:640, trueBase:560, record:.27, matches:[14,24]},
  {visible:735, trueBase:700, record:.34, matches:[16,28]},
  {visible:860, trueBase:860, record:.42, matches:[18,32]},
  {visible:990, trueBase:1010, record:.48, matches:[20,36]},
  {visible:1125, trueBase:1170, record:.54, matches:[22,40]},
  {visible:1260, trueBase:1330, record:.60, matches:[24,44]},
  {visible:1405, trueBase:1500, record:.66, matches:[28,48]},
  {visible:1535, trueBase:1645, record:.70, matches:[30,52]},
  {visible:1685, trueBase:1810, record:.75, matches:[34,58]},
  {visible:1830, trueBase:1990, record:.81, matches:[38,64]}
];

function getMonthKey() {
  const d = new Date();
  const cycle = Math.floor(d.getMonth() / MONTHLY_AI_CYCLE_MONTHS) + 1;
  return `${d.getFullYear()}-Q${cycle}`;
}

function cleanupRetiredMonthlyAI(monthKey=getMonthKey()) {
  const currentStorageKey = 'fate_monthly_ai_' + monthKey;
  try {
    for(let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if(k && k.startsWith('fate_monthly_ai_') && k !== currentStorageKey) {
        localStorage.removeItem(k);
      }
    }
  } catch(e){}
  if(typeof LEADERBOARD !== 'undefined' && Array.isArray(LEADERBOARD)) {
    const before = LEADERBOARD.length;
    LEADERBOARD = LEADERBOARD.filter(entry => !(entry && entry.isMonthly && entry.monthKey !== monthKey));
    if(LEADERBOARD.length !== before && typeof saveLeaderboard === 'function') saveLeaderboard();
  }
}

function monthlyBandForSlot(monthKey, index) {
  const bands = MONTHLY_AI_SKILL_BANDS.slice();
  const rngSeed = hashStr(monthKey + ':monthly-band-order');
  for(let i = bands.length - 1; i > 0; i--) {
    const j = hashStr(monthKey + ':monthly-band-swap:' + rngSeed + ':' + i) % (i + 1);
    [bands[i], bands[j]] = [bands[j], bands[i]];
  }
  return bands[Math.max(0, Math.min(bands.length - 1, index))] || MONTHLY_AI_SKILL_BANDS[index % MONTHLY_AI_SKILL_BANDS.length];
}

function monthlySeededRecord(monthKey, index, trueElo, band) {
  const matchRange = band && band.matches || [18, 42];
  const minMatches = Number(matchRange[0]) || 18;
  const maxMatches = Math.max(minMatches, Number(matchRange[1]) || 42);
  const total = minMatches + (hashStr(monthKey + ':record-total:' + index) % (maxMatches - minMatches + 1));
  const skill = Math.max(0, Math.min(1, ((Number(trueElo) || 600) - 540) / 1500));
  const baseline = Number(band && band.record) || (.25 + skill * .56);
  const wobble = ((hashStr(monthKey + ':record-wobble:' + index) % 101) - 50) / 1000;
  const winRate = Math.max(.16, Math.min(.88, baseline + wobble));
  const wins = Math.max(0, Math.min(total, Math.round(total * winRate)));
  return {wins, losses:Math.max(0, total - wins), seededWinRate:Math.round(winRate * 1000) / 1000};
}

function generateMonthlyAI() {
  const monthKey = getMonthKey();
  const storageKey = 'fate_monthly_ai_' + monthKey;
  cleanupRetiredMonthlyAI(monthKey);
  const rankNameForElo = elo => {
    try { return typeof getRank === 'function' ? getRank(elo).name : 'Footman'; }
    catch(e){ return 'Footman'; }
  };
  const monthlyVisibleElo = (trueElo, index) => {
    const band = monthlyBandForSlot(monthKey, index);
    const spread = (hashStr(monthKey + 'visible-elo' + index) % 61) - 30;
    return Math.max(600, Math.min(1880, Math.round((Number(band && band.visible) || Number(trueElo) || 600) + spread)));
  };
  
  let stored;
  try { stored = JSON.parse(localStorage.getItem(storageKey)); } catch(e){}
  // Only use cache if exactly 10 entries with correct monthKey and playable decks.
  const storedUsable = stored && Array.isArray(stored) && stored.length === 10 && stored.every(a =>
    a && a.monthKey === monthKey && a.generationVersion === MONTHLY_AI_GENERATION_VERSION && Array.isArray(a.deck) && a.deck.length >= 40
  );
  if(storedUsable) {
    const refreshed = stored.map((ai, i) => {
      const p = RANDOM_AI_PERSONALITIES[hashStr(monthKey + 'personality' + i) % RANDOM_AI_PERSONALITIES.length];
      const band = monthlyBandForSlot(monthKey, i);
      const seededElo = monthlyVisibleElo(ai.trueElo, i);
      const currentElo = Math.round(Number(ai.elo) || 600);
      const hasMatchRecord = Number(ai.wins || 0) > 0 || Number(ai.losses || 0) > 0;
      const elo = !hasMatchRecord && currentElo === 600 ? seededElo : currentElo;
      const record = hasMatchRecord ? {wins:Number(ai.wins || 0) || 0, losses:Number(ai.losses || 0) || 0, seededWinRate:ai.seededWinRate} : monthlySeededRecord(monthKey, i, ai.trueElo, band);
      return {...ai, ...record, elo, rank:rankNameForElo(elo), style:p.style, personalityLabel:p.label, personalityDesc:p.desc, generationVersion:MONTHLY_AI_GENERATION_VERSION};
    });
    try { localStorage.setItem(storageKey, JSON.stringify(refreshed)); } catch(e){}
    return refreshed;
  }

  // Generate 10 unique AI players for this three-month cycle.
  const seed = hashStr(monthKey + 'monthly');
  const players = [];
  const usedNames = new Set();
  for(let i = 0; i < 10; i++) {
    let name;
    let attempts = 0;
    do {
      const nameSeed = hashStr(monthKey + 'name' + i + attempts);
      const surSeed = hashStr(monthKey + 'sur' + i + attempts);
      const first = MONTHLY_AI_NAMES_POOL[nameSeed % MONTHLY_AI_NAMES_POOL.length];
      const last = MONTHLY_AI_SURNAMES[surSeed % MONTHLY_AI_SURNAMES.length];
      name = `${first} ${last}`;
      attempts++;
    } while(usedNames.has(name) && attempts < 100);
    usedNames.add(name);

    const band = monthlyBandForSlot(monthKey, i);
    const trueSpread = (hashStr(monthKey + 'true' + i) % 121) - 60;
    const trueElo = Math.max(450, Math.min(2050, Math.round((Number(band.trueBase) || 900) + trueSpread)));
    const visibleElo = monthlyVisibleElo(trueElo, i);
    const seededRecord = monthlySeededRecord(monthKey, i, trueElo, band);
    const personality = RANDOM_AI_PERSONALITIES[hashStr(monthKey + 'personality' + i) % RANDOM_AI_PERSONALITIES.length];
    const style = personality.style;

    // Pick a deck from starter decks or existing AI opponent decks
    const starterDecks = typeof STARTER_DECKS !== 'undefined' ? STARTER_DECKS : [];
    const advancedDecks = typeof AI_ONLY_RANDOM_DECKS !== 'undefined' ? AI_ONLY_RANDOM_DECKS : [];
    const builtInDecks = [...starterDecks, ...advancedDecks]
      .map(d => d && (d.ids || d.deck || []))
      .filter(d => Array.isArray(d) && d.length >= 40);
    const aiDecks = AI_OPPONENTS
      .filter(a => a && !a.isMonthly)
      .map(a => typeof getPlayableAIDeck === 'function' ? getPlayableAIDeck(a) : (Array.isArray(a.deck) ? a.deck : []))
      .filter(d => Array.isArray(d) && d.length >= 40);
    const allDecks = [...builtInDecks, ...aiDecks];
    const deckIdx = hashStr(monthKey + 'deck' + i) % Math.max(1, allDecks.length);
    const deck = allDecks.length > 0 ? allDecks[deckIdx] : [];

    players.push({
      name,
      elo: visibleElo,
      trueElo,
      style,
      personalityLabel: personality.label,
      personalityDesc: personality.desc,
      rank: rankNameForElo(visibleElo),
      wins: seededRecord.wins,
      losses: seededRecord.losses,
      seededWinRate: seededRecord.seededWinRate,
      deck: deck.length >= 40 ? deck.slice(0, 40) : [],
      isMonthly: true,
      monthKey,
      generationVersion: MONTHLY_AI_GENERATION_VERSION,
      img: 'aiicons/ai' + ((i % 18) + 1) + '.png'
    });
  }

  try { localStorage.setItem(storageKey, JSON.stringify(players)); } catch(e){}
  return players;
}

function integrateMonthlyAI() {
  const monthly = generateMonthlyAI();
  const monthKey = getMonthKey();
  MONTHLY_AI_OPPONENTS = monthly.map(ai => ({...ai}));
  if(typeof applyStoredAIEloStateToList === 'function') applyStoredAIEloStateToList(MONTHLY_AI_OPPONENTS);
  cleanupRetiredMonthlyAI(monthKey);
}

function getMonthlyAIOpponents() {
  const monthKey = getMonthKey();
  if(!Array.isArray(MONTHLY_AI_OPPONENTS) || MONTHLY_AI_OPPONENTS.length !== 10 || MONTHLY_AI_OPPONENTS.some(ai => ai.monthKey !== monthKey)) {
    integrateMonthlyAI();
  }
  return MONTHLY_AI_OPPONENTS;
}

function getRandomMatchAIOpponents() {
  const monthly = getMonthlyAIOpponents();
  const byName = new Map();
  [...AI_OPPONENTS, ...monthly].forEach(ai => {
    if(ai && ai.name && !byName.has(ai.name)) byName.set(ai.name, ai);
  });
  return [...byName.values()];
}

// Run simulation on load
if(typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    integrateMonthlyAI();
  });
}

function buildDefaultDecks() {
  // Default decks if none set — fallback builds a balanced mix
  function buildDeck(affPref) {
    const deck = [];
    const activeCards = CARDS.filter(c=>typeof isRetiredCardForBuilder === 'function'
      ? !isRetiredCardForBuilder(c)
      : (c.id!=='bh01' && c.id!=='bh25' && !c.retired));
    const sup = activeCards.filter(c=>c.type==='Supporter');
    const chr = activeCards.filter(c=>c.type!=='Supporter');
    for(const c of sup){
      const lim=c.rarity==='star'?1:c.rarity==='square'?2:3;
      for(let i=0;i<lim && deck.length<28;i++) deck.push(c.id);
    }
    for(const c of chr){
      const lim=c.rarity==='star'?1:c.rarity==='square'?2:3;
      for(let i=0;i<lim && deck.length<40;i++) deck.push(c.id);
      if(deck.length>=40) break;
    }
    return deck.slice(0,40);
  }
  G.p1Deck = buildDeck('third_great_war');
  G.p2Deck = buildDeck('eventide');
}

function initGameState() {
  if(typeof window.invalidateFateRenderCaches === 'function') window.invalidateFateRenderCaches();
  resetMatchTransientState();

  // Build decks as instances (each card gets a unique iid)
  function makeDeck(ids, owner) {
    return shuffle(ids.filter(id=>!(typeof isRetiredCardForBuilder === 'function' && isRetiredCardForBuilder(id))).map(id=>{
      const cd = CARDS.find(c=>c.id===id);
      if(!cd) return null;
      return createCardInstance(cd, owner);
    }).filter(Boolean));
  }
  G.players[0].deck = makeDeck(G.p1Deck, 0);
  G.players[1].deck = makeDeck(G.p2Deck, 1);
  G.players[0].hand = [];
  G.players[1].hand = [];
  G.players[0].discard = [];
  G.players[1].discard = [];

  // Draw starting hands (6 each)
  G._pendingSelvaSupportBoost = [0, 0];
  G._selvaSupportBoosts = [null, null];
  for(let i=0;i<6;i++) drawCard(0, 1, { skipOptionalImprovisors: true, openingHand: true });
  for(let i=0;i<6;i++) drawCard(1, 1, { skipOptionalImprovisors: true, openingHand: true });
}

function shuffle(arr) {
  // Online Free Play bootstrap: when an online room has provided a seeded RNG,
  // use it so both browsers build identical shuffled decks/hands. Do not write
  // from render loops and do not sync full G snapshots.
  const rng = (typeof G !== 'undefined' && G && typeof G._onlineRng === 'function') ? G._onlineRng : Math.random;
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(rng()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}

function findReadyChristopherErbs(player) {
  if(typeof forEachBoardCard !== 'function') return null;
  let erbs = null;
  forEachBoardCard(c => {
    if(!erbs && c && c.id === '40' && c.owner === player && (c.usesLeft || 0) > 0 && !isFaceDownCard(c)) erbs = c;
  });
  return erbs;
}

function chooseOptionalImprovisorActivation(player, card, context = {}) {
  return new Promise(resolve => {
    if(!card){ resolve(false); return; }
    const isAI = G.aiEnabled && player === G.aiPlayer;
    if(isAI){
      resolve(true);
      return;
    }
    const img = card.img
      ? '<img src="'+card.img+'" style="width:80px;height:112px;object-fit:cover;object-position:center 30%;border-radius:3px;flex-shrink:0;border:1.5px solid var(--gold);">'
      : '';
    const triggerText = context.triggerText || 'This optional effect can activate now.';
    const costText = context.costText || '';
    const cleanup = (answer) => {
      G._reactionPending = false;
      closeModal();
      resolve(!!answer);
    };
    G._reactionPending = true;
    showModal(
      card.name + ' - Activate?',
      '<div style="text-align:center;">'+
        '<div style="display:flex;align-items:center;gap:1rem;padding:.65rem;background:rgba(0,0,0,.32);border:1px solid rgba(201,168,76,.22);border-radius:5px;margin-bottom:.85rem;">'+
          img+
          '<div style="text-align:left;flex:1;">'+
            '<div style="font-family:Cinzel,serif;color:var(--gold);font-size:1rem;margin-bottom:.32rem;">'+escapeHtml(card.ability || card.name)+'</div>'+
            '<div style="font-size:.85rem;color:var(--text);font-style:italic;line-height:1.45;">'+escapeHtml(card.effect || '')+'</div>'+
          '</div>'+
        '</div>'+
        '<div style="color:var(--text);font-size:.9rem;">'+escapeHtml(triggerText)+'</div>'+
        (costText ? '<div style="color:var(--fate);font-size:.8rem;margin-top:.4rem;">'+escapeHtml(costText)+'</div>' : '')+
      '</div>',
      [
        {label:'Decline', action:()=>cleanup(false)},
        {label:'Activate', pri:true, action:()=>cleanup(true)}
      ]
    );
  });
}

async function drawCard(player, count=1, options = {}) {
  const myP = getPerspectivePlayerIndex();
  let outsideDrawLandscapeCard = null;
  for(let i=0;i<count;i++){
    if(G.players[player].deck.length===0){
      log('sys','P'+(player+1)+' deck is empty!');
      return;
    }
    const erbsAlreadyActive = Array.isArray(G.erbsActive) ? !!G.erbsActive[player] : !!G.erbsActive;
    if(!options.skipOptionalImprovisors && !erbsAlreadyActive){
      const erbs = findReadyChristopherErbs(player);
      if(erbs){
        const activate = await chooseOptionalImprovisorActivation(player, erbs, {
          triggerText: 'You are about to draw a card. Activate Christopher Erbs so the drawn card gains 4 Fate?',
          costText: erbs.usesLeft + ' use' + (erbs.usesLeft===1?'':'s') + ' remaining'
        });
        if(activate){
          if(!Array.isArray(G.erbsActive)) G.erbsActive = [false, false];
          G.erbsActive[player] = true;
          erbs.usesLeft--;
          toast('Christopher Erbs empowered the draw. ('+erbs.usesLeft+' uses left)');
          log(player===0?'p1':'p2', 'Christopher Erbs armed the next drawn card');
        } else {
          log(player===0?'p1':'p2', 'Christopher Erbs declined');
        }
      }
    }
    const card = G.players[player].deck.shift();
    if(!addCardToHand(player, card, { openingHand: !!options.openingHand })) continue;
    // Fort Calvin Watcher (71): reveal opponent's drawn cards, send characters to deck bottom
    if(options.drawPhase && G._fortCalvinActive && G._fortCalvinActive.length > 0){
      const activeWatchers = G._fortCalvinActive.filter(w => w.remaining > 0 && w.owner !== player);
      if(activeWatchers.length > 0){
        const watcher = activeWatchers[0];
        watcher.remaining--;
        toast('Fort Calvin revealed: ' + card.name + '!');
        if(!G._revealedCards) G._revealedCards = {};
        G._revealedCards[card.iid] = true;
        log(player===0?'p1':'p2', 'Fort Calvin Watcher revealed: '+card.name);
        if(card.type !== 'Supporter'){
          G.players[player].hand = G.players[player].hand.filter(c => c.iid !== card.iid);
          G.players[player].deck.push(card);
          toast(card.name + ' sent to bottom of deck by Fort Calvin Watcher!');
          log(player===0?'p1':'p2', card.name+' redirected to deck bottom');
        }
        G._fortCalvinActive = G._fortCalvinActive.filter(w => w.remaining > 0);
      }
    }
    // Christopher Erbs (40): per-player next drawn card gains 4 Fate.
    const erbsActiveForPlayer = Array.isArray(G.erbsActive) ? !!G.erbsActive[player] : !!G.erbsActive;
    if(erbsActiveForPlayer && card.id!=='70'){
      const erbsCanAffect = !(typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(card));
      if(erbsCanAffect) {
        const beforeErbsFate = Math.max(0, Number(card.currentFate ?? card.fate) || 0);
        card.currentFate = beforeErbsFate + 4;
        if(typeof recordHandCardEffectModifier === 'function') {
          recordHandCardEffectModifier(card, {
            key:'christopher-erbs',
            name:'Christopher Erbs',
            text:'Hard Times, Strong Men: this drawn card gained +4 Fate.',
            fateDelta:4
          });
        }
        toast(`${card.name} gained 4 Fate from Hard Times, Strong Men!`);
        log(player===0?'p1':'p2', `Erbs bonus: ${card.name} +4 Fate`);
      }
      if(Array.isArray(G.erbsActive)) G.erbsActive[player] = false;
      else G.erbsActive = false;
    }
    playSfx('draw');
    // Animate only local draws; opponent draws update hand state without a face-down flight.
    if(document.getElementById('s-game')?.classList.contains('active')){
      let v2DrawQueued = false;
      if(player === myP && window.FateV2CardMotionFx && typeof window.FateV2CardMotionFx.drawFromPile === 'function'){
        v2DrawQueued = window.FateV2CardMotionFx.drawFromPile(i, player, {
          card,
          faceDown:false,
          drawIndex:i,
          drawCount:count
        });
      }
      if(!v2DrawQueued && player===myP) animateDrawCard(i);
    }
    if(!options.drawPhase && !options.openingHand && !outsideDrawLandscapeCard){
      outsideDrawLandscapeCard = card;
    }
  }
  if(outsideDrawLandscapeCard && typeof queueLandscapeOutsideDrawBonus === 'function'){
    queueLandscapeOutsideDrawBonus(player, outsideDrawLandscapeCard);
  }
}

function addCardToHand(player, card, options = {}) {
  if(!card) return false;
  const announce = options.announce !== false;
  const targetPlayer = typeof options.forceHandOwner === 'number' ? options.forceHandOwner : player;
  if(options.animate !== false){
    if(!G._forceHandEnterIids) G._forceHandEnterIids = new Set();
    G._forceHandEnterIids.add(card.iid);
  }

  // Wine Country Guerilla (70) only infiltrates after being discarded from its own zone.

  const isCharacterCard = card.type !== 'Supporter';
  const westCaribOwner = typeof G._westCaribNext === 'object' ? G._westCaribNext.owner : (G._westCaribNext ? player : null);
  if(G._westCaribNext && westCaribOwner === targetPlayer && card.id!=='70' && isCharacterCard){
    card._wciBonus = true;
    card._handCostDelta = (Number(card._handCostDelta) || 0) - 1;
    if(typeof recordHandCardEffectModifier === 'function') {
      recordHandCardEffectModifier(card, {
        key:'west-caribbea-infantry',
        name:'West Caribbea Infantry',
        text:'The Company\'s Finest: -1 Reinforcement cost, +2 Fate when set.',
        fateDelta:2,
        costDelta:-1
      });
    }
    G._westCaribNext = false;
    if(announce){
      toast(card.name+' gained West Caribbea Infantry\'s bonus!');
    }
    if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
  }

  G.players[targetPlayer].hand.push(card);
  if(!options.skipArrivalEffects && card.id === '74' && typeof triggerSelvaIslandsPirateHandArrival === 'function'){
    triggerSelvaIslandsPirateHandArrival(targetPlayer, card, { openingHand: !!options.openingHand });
  }
  if(typeof enforceHandLimit === 'function') enforceHandLimit(targetPlayer);
  if(options.animate !== false){
    if(!G._forceHandEnterIids) G._forceHandEnterIids = new Set();
    G._forceHandEnterIids.add(card.iid);
  }
  if(typeof renderHand === 'function' && document.getElementById('s-game')?.classList.contains('active')){
    requestAnimationFrame(()=>{
      renderHand();
      if(typeof updateTopBar === 'function') updateTopBar();
    });
  }
  return true;
}

function triggerSelvaIslandsPirateHandArrival(player, card, options = {}) {
  if(!card || card.id !== '74' || !G || !G.players) return false;
  if(options.openingHand || player !== G.currentPlayer || G.phase !== 'main'){
    if(card._selvaOpeningQueued) return false;
    card._selvaOpeningQueued = true;
    if(!Array.isArray(G._pendingSelvaSupportBoost)) G._pendingSelvaSupportBoost = [0, 0];
    G._pendingSelvaSupportBoost[player] = (Number(G._pendingSelvaSupportBoost[player]) || 0) + 1;
    return true;
  }
  if(card._selvaArrivalTurn === G.turn) return false;
  if(typeof isSupporterEffectSuppressed === 'function' && isSupporterEffectSuppressed(card)) return false;
  card._selvaArrivalTurn = G.turn;
  G.extraSupportsThisTurn = (Number(G.extraSupportsThisTurn) || 0) + 1;
  noteSelvaSupportBoost(player, 1, card);
  toast('Selva Islands Pirate: +1 Supporter placement this turn.');
  log(player===0?'p1':'p2', 'Selva Islands Pirate granted +1 Supporter placement this turn');
  if(typeof playSfx === 'function') playSfx('effect');
  if(typeof updateTopBar === 'function') updateTopBar();
  return true;
}

function applyPendingSelvaSupportBoost(player) {
  if(!Array.isArray(G._pendingSelvaSupportBoost)) return false;
  const count = Number(G._pendingSelvaSupportBoost[player]) || 0;
  if(count <= 0) return false;
  G._pendingSelvaSupportBoost[player] = 0;
  G.extraSupportsThisTurn = (Number(G.extraSupportsThisTurn) || 0) + count;
  noteSelvaSupportBoost(player, count, null);
  toast('Selva Islands Pirate: +' + count + ' Supporter placement' + (count===1?'':'s') + ' this turn.');
  log(player===0?'p1':'p2', 'Opening Selva Islands Pirate granted +' + count + ' Supporter placement' + (count===1?'':'s') + ' this turn');
  if(typeof playSfx === 'function') playSfx('effect');
  if(typeof updateTopBar === 'function') updateTopBar();
  return true;
}

function noteSelvaSupportBoost(player, count, card) {
  if(!G || (player !== 0 && player !== 1)) return false;
  const added = Math.max(0, Number(count) || 0);
  if(added <= 0) return false;
  if(!Array.isArray(G._selvaSupportBoosts)) G._selvaSupportBoosts = [null, null];
  const prev = G._selvaSupportBoosts[player];
  const prevExtra = prev && prev.turn === G.turn ? Math.max(0, Number(prev.extraSupports) || 0) : 0;
  G._selvaSupportBoosts[player] = {
    owner: player,
    turn: G.turn,
    extraSupports: prevExtra + added,
    sourceIid: card && card.iid || null,
    sourceName: card && card.name || 'Selva Islands Pirate'
  };
  if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
  else if(typeof renderTopbarEffects === 'function') renderTopbarEffects();
  return true;
}

if(typeof window !== 'undefined') window.noteSelvaSupportBoost = noteSelvaSupportBoost;

function rendererV2OwnsMatchScene() {
  return !!(window.FateMatchRendererAdapter
    && typeof window.FateMatchRendererAdapter.ownsBoard === 'function'
    && window.FateMatchRendererAdapter.ownsBoard());
}

function viewportRectToVfxBoardRect(rect) {
  if(!rect) return null;
  const canvas = document.getElementById('fate-match-v2-canvas');
  if(!canvas || typeof canvas.getBoundingClientRect !== 'function') return null;
  const canvasRect = canvas.getBoundingClientRect();
  const rectWidth = Number(rect.w != null ? rect.w : rect.width);
  const rectHeight = Number(rect.h != null ? rect.h : rect.height);
  if(!(rectWidth > 0) || !(rectHeight > 0)) return null;
  const scaleX = (canvas.clientWidth || canvasRect.width || 1) / Math.max(1, canvasRect.width || 1);
  const scaleY = (canvas.clientHeight || canvasRect.height || 1) / Math.max(1, canvasRect.height || 1);
  return {
    x:(Number(rect.x != null ? rect.x : rect.left) - canvasRect.left) * scaleX,
    y:(Number(rect.y != null ? rect.y : rect.top) - canvasRect.top) * scaleY,
    w:rectWidth * scaleX,
    h:rectHeight * scaleY
  };
}

function queueGuerillaTransferVfx(card) {
  const adapter = window.FateMatchRendererAdapter;
  const bridge = window.FateVfxEventBridge;
  if(!card || !adapter || !bridge) return false;
  if(typeof adapter.getHitMap !== 'function' || typeof bridge.onAcceptedGameEvent !== 'function') return false;
  const hitMap = adapter.getHitMap() || {};
  const source = (hitMap.handCards || []).find(h => String(h && h.iid) === String(card.iid));
  const firstOpponentCard = (hitMap.opponentHandCards || [])[0] || null;
  const fromRect = viewportRectToVfxBoardRect(source && source.rect);
  let toRect = viewportRectToVfxBoardRect(firstOpponentCard && firstOpponentCard.rect);
  if(!toRect && fromRect){
    toRect = {
      x:fromRect.x,
      y:Math.max(24, fromRect.y - Math.max(220, fromRect.h * 2.4)),
      w:fromRect.w,
      h:fromRect.h
    };
  }
  if(!fromRect || !toRect) return false;
  bridge.onAcceptedGameEvent({
    type:'DRAW_CARD',
    payload:{
      iid:card.iid,
      card,
      fromRect,
      toRect,
      faceDown:false,
      layer:'effects'
    }
  });
  return true;
}

function transferGuerillaToOpponent(player, card) {
  if(!card || !G || !G.players) return;
  const opp = 1 - player;
  const fromHand = G.players[player].hand;
  const idx = fromHand.findIndex(c=>c.iid===card.iid);
  if(idx < 0) return;
  card.guerilla_transferred = true;
  card.guerilla_turnsLeft = 5;
  card.guerilla_owner = player;
  card.guerilla_transferred = true;
  card.guerilla_turnsLeft = 5;
  card.guerilla_owner = player;
  const v2Scene = rendererV2OwnsMatchScene();
  const moving = fromHand.splice(idx, 1)[0];
  if(v2Scene) {
    queueGuerillaTransferVfx(moving);
  } else {
    const handEl = document.querySelector(`#hand-cards .hc[data-iid="${card.iid}"]`);
    if(handEl) {
      const rect = handEl.getBoundingClientRect();
      const fly = handEl.cloneNode(true);
      fly.classList.add('guerilla-transfer-fly');
      fly.style.left = rect.left + 'px';
      fly.style.top = rect.top + 'px';
      fly.style.width = rect.width + 'px';
      fly.style.height = rect.height + 'px';
      document.body.appendChild(fly);
      setTimeout(()=>fly.remove(), 920);
    }
  }
  G.players[opp].hand.push(moving);
  toast('Wine Country Guerilla infiltrated opponent\'s hand for 5 turns!');
  log(player===0?'p1':'p2', 'Wine Country Guerilla given to opponent');
  playSfx('debuff');
  if(typeof renderHand === 'function') renderHand();
  if(typeof updateTopBar === 'function') updateTopBar();
}

function activateWineCountryGuerillaFromHand(card) {
  if(!card || card.id !== '70' || !G || !G.players) return;
  const cp = G.currentPlayer;
  const hand = G.players[cp] && G.players[cp].hand;
  if(!Array.isArray(hand)) return;
  const idx = hand.findIndex(c => c && c.iid === card.iid);
  if(idx < 0){ toast('Wine Country Guerilla is not in your hand.'); return; }
  if(card.guerilla_transferred){ toast('Wine Country Guerilla is already infiltrating a hand.'); return; }
  closeModal();
  toast('Wine Country Guerilla is infiltrating opponent\'s hand...');
  if(typeof renderHand === 'function') renderHand();
  setTimeout(()=>transferGuerillaToOpponent(cp, card), 260);
}

function animateDrawCard(delayIdx) {
  if(G._aiAbort) return;
  if(window.FateV2CardMotionFx && typeof window.FateV2CardMotionFx.drawFromPile === 'function' && window.FateV2CardMotionFx.drawFromPile(delayIdx)){
    return;
  }
  if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.ownsBoard === 'function' && window.FateMatchRendererAdapter.ownsBoard()){
    return;
  }
  const deckEl = document.getElementById('my-deck');
  const handEl = document.getElementById('hand-cards');
  if(!deckEl || !handEl) return;
  const enhancedFx = typeof isEnhancedVisualFxEnabled === 'function' && isEnhancedVisualFxEnabled();
  if(document.documentElement.classList.contains('fate-performance-mode') && !enhancedFx){
    const strip = document.querySelector('#s-game .hand-strip');
    if(strip){
      strip.classList.remove('draw-lite-pulse');
      void strip.offsetWidth;
      strip.classList.add('draw-lite-pulse');
      setTimeout(()=>strip.classList.remove('draw-lite-pulse'), 260);
    }
    return;
  }
  const deckRect = deckEl.getBoundingClientRect();
  const handRect = handEl.getBoundingClientRect();
  const cardWidth = Math.max(58, Math.min(84, deckRect.width || 72));
  const cardHeight = Math.round(cardWidth * 1.38);
  const flyCard = document.createElement('div');
  flyCard.className = 'draw-fly-card' + (enhancedFx ? ' fx-enhanced-draw' : '');
  if(enhancedFx){
    flyCard.innerHTML = '<span class="fx-draw-core"></span><span class="fx-draw-thread t1"></span><span class="fx-draw-thread t2"></span><span class="fx-draw-thread t3"></span>';
  }
  flyCard.style.left = deckRect.left+'px';
  flyCard.style.top = deckRect.top+'px';
  flyCard.style.width = cardWidth+'px';
  flyCard.style.height = cardHeight+'px';
  flyCard.style.animationDelay = (delayIdx*0.08)+'s';
  const targetX = handRect.left + Math.min(handRect.width - cardWidth, Math.max(0, 18 + delayIdx * (cardWidth * .24)));
  const targetY = handRect.top + Math.max(6, (handRect.height - cardHeight) * .5);
  const dx = targetX - deckRect.left;
  const dy = targetY - deckRect.top;
  flyCard.style.setProperty('--dx', dx+'px');
  flyCard.style.setProperty('--dy', dy+'px');
  document.body.appendChild(flyCard);
  setTimeout(()=>flyCard.remove(), 520 + delayIdx*55);
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  COIN FLIP
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function renderCoinFace(heads) {
  return `<span class="coin-face-icon ${heads ? 'heads' : 'tails'}" aria-hidden="true">${heads ? '&#9728;' : '&#9790;'}</span>`;
}

function doCoinFlip() {
  const coin = document.getElementById('coin');
  const result = document.getElementById('coin-result');
  const btns = document.getElementById('coin-btns');
  const winnerText = document.getElementById('coin-winner-text');
  coin.className='coin';
  coin.innerHTML='?';
  result.textContent='';
  btns.style.display='none';
  if(G && G._onlineRoomCode){
    const seed = String(G._onlineSeed || G._onlineRoomCode || 'online');
    const existingWinner = Number(G._coinWinner);
    let heads = Number.isInteger(existingWinner) && existingWinner >= 0 && existingWinner <= 1 ? existingWinner === 0 : null;
    if(heads === null){
      let h = 2166136261;
      for(let i=0;i<seed.length;i++){ h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
      heads = ((h >>> 0) % 2) === 0;
    }
    setTimeout(()=>{
      coin.classList.add('spin');
      if(typeof playSfx === 'function') playSfx('coinFlip');
      setTimeout(()=>{
        coin.innerHTML = renderCoinFace(heads);
        G._coinWinner = heads ? 0 : 1;
        const winner = G.players[G._coinWinner]?.name || `Player ${G._coinWinner + 1}`;
        result.textContent = `${heads ? 'Heads' : 'Tails'}. ${winner} wins the flip!`;
        if(G._coinWinner === G._onlinePlayerIndex){
          winnerText.textContent = `${winner}, choose your turn order:`;
          btns.style.display = 'block';
        }else{
          winnerText.textContent = `Waiting for ${winner} to choose turn order.`;
          btns.style.display = 'none';
        }
      },1700);
    },100);
    return;
  }
  setTimeout(()=>{
    coin.classList.add('spin');
    playSfx('coinFlip');
    setTimeout(()=>{
      const heads = (typeof G._onlineRng === 'function' ? G._onlineRng() : Math.random())<.5;
      coin.innerHTML = renderCoinFace(heads);
      const winner = heads?G.players[0].name:G.players[1].name;
      result.textContent=`${heads ? 'Heads' : 'Tails'}. ${winner} wins the flip!`;
      // heads = player 1 won the flip
      G._coinWinner = heads ? 0 : 1;
      // If AI won the flip, choose based on personality preference
      if(G.aiEnabled && G._coinWinner===1){
        let aiGoesFirst = true;
        if(G._selectedAI) {
          // Personality-based preference
          const style = G._selectedAI.style || '';
          const prefersSecond = ['defensive','control','lockdown','inevitability','adaptive'].includes(style);
          const prefersMixed = ['balanced','tempo','hybrid_aggro','expanded_worlds'].includes(style);
          if(prefersSecond) aiGoesFirst = false;
          else if(prefersMixed) aiGoesFirst = (typeof G._onlineRng === 'function' ? G._onlineRng() : Math.random()) < 0.5;
          // else aggro/blitz/disruption styles prefer first (default true)
        }
        winnerText.textContent=`${winner} chose to go ${aiGoesFirst?'first':'second'}.`;
        btns.style.display='none';
        setTimeout(()=>chooseTurn(aiGoesFirst),3200);
      } else {
        winnerText.textContent=`${winner}, choose your turn order:`;
        btns.style.display='block';
      }
    },1700);
  },100);
}

function chooseTurn(goFirst) {
  // coinWinner decides — if they choose first, they go first
  const entryVeilStarted = showMatchEntryLoadingVeil();
  recordMatchEntryStep('choose-turn-start');
  G.currentPlayer = goFirst ? G._coinWinner : (1-G._coinWinner);
  showScreen('s-game');
  recordMatchEntryStep('screen-game-active');
  G.phase = 'main';
  G._turnInputLockUntil = 0;
  G._aiRunning = false;
  G._aiAbort = false;
  G._aiAborted = false;
  G._aiTurnToken = 0;
  if(typeof applyPendingSelvaSupportBoost === 'function') applyPendingSelvaSupportBoost(G.currentPlayer);
  // First player doesn't draw
  log('sys','Game begins! '+G.players[G.currentPlayer].name+' goes first.');
  const renderStarted = performance.now ? performance.now() : Date.now();
  if(typeof renderGameImmediate === 'function') {
    if(typeof rendererV2OwnsBoardScene === 'function' && rendererV2OwnsBoardScene()) {
      renderGameImmediate({hand:true, piles:true, oppHand:true, landscape:true, topbar:true});
    } else {
      renderGameImmediate();
    }
  } else renderGame();
  recordMatchEntryStep('initial-render-called', {
    ms:Math.round(((performance.now ? performance.now() : Date.now()) - renderStarted) * 10) / 10
  });
  if(typeof renderGameImmediate !== 'function' && typeof updateTopBar === 'function') updateTopBar();
  recordMatchEntryStep('topbar-ready');
  hideMatchEntryLoadingVeil(entryVeilStarted);
  // If AI goes first, trigger its turn
  if(G.aiEnabled && G.currentPlayer===G.aiPlayer){
    stopTurnTimer();
    if(typeof startAITurnVisualTimer === 'function') startAITurnVisualTimer();
    G._aiTurnToken = (G._aiTurnToken || 0) + 1;
    setTimeout(runAITurn, 1000);
  } else {
    startTurnTimer();
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
