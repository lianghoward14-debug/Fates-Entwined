// FATES ENTWINED SPECTATOR SYSTEM V1.0
// Browse live matches from title screen, join as spectator, chat anonymously.
(function(){
  // Use a getter so FO always reads the latest window.FateOnline (modules load async)
  function FO(){ return window.FateOnline || {}; }
  let liveMatchesUnsub = null;
  let spectatingRoom = null;
  let spectatorRoomUnsub = null;
  let spectatorPlayersUnsub = null;
  let spectatorActionsUnsub = null;
  let spectatorCountUnsub = null;
  let spectatorActionReplayQueue = Promise.resolve();
  let spectatorActionBuffer = new Map();
  let spectatorActionDrainScheduled = false;
  let spectatorLastActionSeq = 0;
  let spectatorLastAppliedSeq = 0;
  let spectatorLiveProfiles = new Map();
  let spectatorProfileUnsubs = new Map();
  let spectatorPanelOpen = false;
  let liveMatchPublishDisabled = false;
  let flyLiveMatchesTimer = 0;
  let flySpectatorRoomTimer = 0;
  let flySpectatorCountTimer = 0;
  let flySpectatorActionTimer = 0;
  let flySpectatorHeartbeatTimer = 0;
  let spectatorFlyChatSeq = 0;
  const LIVE_MATCH_STALE_MS = 2 * 60 * 60 * 1000;

  function esc(s){ return String(s||'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function getUser(){ try{ return (FO().requireUser ? FO().requireUser() : null); }catch(e){ return null; } }
  function pName(p){ return FO().profileName ? FO().profileName(p) : (p?.chosenUsername||p?.displayName||p?.username||p?.baseCode||'Player'); }
  function pPhoto(p){ return FO().profilePhoto ? FO().profilePhoto(p) : (p?.photoURL||p?.profileImg||'blank.png'); }
  function pCrop(p, fallback='center 22%'){ return FO().profilePhotoCropStyle ? FO().profilePhotoCropStyle(p, fallback) : `width:100%;height:100%;object-fit:cover;object-position:${fallback};`; }
  function localStorageFlag(name){
    try{ return localStorage.getItem(name) === '1'; }catch(e){ return false; }
  }
  function authorityHttpBaseUrl(){
    try{
      const explicit = String(localStorage.getItem('fateFlyApiUrl') || '').trim();
      if(explicit) return explicit.replace(/\/+$/, '');
    }catch(e){}
    const globalExplicit = String(window.FATE_FLY_API_URL || '').trim();
    if(globalExplicit) return globalExplicit.replace(/\/+$/, '');
    let wsUrl = '';
    try{ wsUrl = String(localStorage.getItem('fateWsAuthorityUrl') || '').trim(); }catch(e){}
    if(!wsUrl) wsUrl = String(window.FATE_WS_AUTHORITY_URL || '').trim();
    if(!wsUrl) {
      const host = String(location.hostname || '').toLowerCase();
      if(host === 'fates-entwined-main.fly.dev') return location.origin.replace(/\/+$/, '');
      return 'https://fates-entwined-main.fly.dev';
    }
    return wsUrl.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:').replace(/\/+$/, '');
  }
  function flySpectatorEnabled(){
    return !!authorityHttpBaseUrl();
  }
  function rtdbDisabledMode(){
    return localStorageFlag('fateRtdbDisabled') || window.FATE_RTDB_DISABLED === true;
  }
  function firebaseSpectatorAllowed(){
    const f = FO();
    return !rtdbDisabledMode() && !!(f.rtdb && f.ref);
  }
  async function flyApiRequest(path, opts={}){
    const base = authorityHttpBaseUrl();
    if(!base) throw new Error('Fly authority API URL is not configured');
    const headers = {'accept':'application/json'};
    const init = {method:String(opts.method || 'GET').toUpperCase(), headers};
    try{
      const user = FO().auth?.currentUser;
      if(user && typeof user.getIdToken === 'function'){
        const token = await user.getIdToken(false).catch(()=> '');
        if(token) headers.authorization = 'Bearer ' + token;
      }
    }catch(e){}
    if(Object.prototype.hasOwnProperty.call(opts, 'body')){
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(opts.body || {});
    }
    const res = await fetch(base + path, init);
    const text = await res.text();
    let json = null;
    try{ json = text ? JSON.parse(text) : null; }catch(e){}
    if(!res.ok || (json && json.ok === false)) throw new Error('Fly spectator API failed: ' + res.status + ' ' + ((json && json.error) || text.slice(0, 160)));
    return json || {};
  }
  async function fetchFlyLiveMatches(limit=16){
    const data = await flyApiRequest(`/api/live-matches?limit=${encodeURIComponent(limit)}`);
    return Array.isArray(data.matches) ? data.matches : [];
  }
  function liveMatchListingsEnabled(){
    try{
      return window.FATE_ENABLE_LIVE_MATCH_LISTINGS === true || localStorage.getItem('fateEnableLiveMatchListings') === '1';
    }catch(e){
      return window.FATE_ENABLE_LIVE_MATCH_LISTINGS === true;
    }
  }
  function liveMatchesQueryTarget(limit=16){
    const base = FO().ref(FO().rtdb, 'liveMatches');
    return (FO().query && FO().orderByChild && FO().limitToLast)
      ? FO().query(base, FO().orderByChild('updatedAt'), FO().limitToLast(limit))
      : base;
  }
  function spectatorChatQueryTarget(code){
    const base = FO().ref(FO().rtdb, `rooms/${code}/chat`);
    return (FO().query && FO().orderByChild && FO().limitToLast)
      ? FO().query(base, FO().orderByChild('createdAt'), FO().limitToLast(80))
      : base;
  }

  function liveMatchTimeValue(value){
    if(typeof value === 'number') return value;
    if(value && typeof value === 'object'){
      if(typeof value.seconds === 'number') return value.seconds * 1000;
      if(typeof value._seconds === 'number') return value._seconds * 1000;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function isLiveMatchStale(match, now=Date.now()){
    if(!match || typeof match !== 'object') return true;
    const updated = liveMatchTimeValue(match.updatedAt) || liveMatchTimeValue(match.startedAt);
    if(!updated) return false;
    return now - updated > LIVE_MATCH_STALE_MS;
  }

  function canCurrentUserRemoveLiveMatch(match){
    const uid = window.FATE_ONLINE?.user?.uid || '';
    return !!(uid && match && match.hostUid === uid);
  }

  function tryRemoveLiveMatchListing(roomCode){
    if(!roomCode || !firebaseSpectatorAllowed() || !FO().remove) return;
    FO().remove(FO().ref(FO().rtdb, `liveMatches/${roomCode}`)).catch(function(){});
  }

  // ─── Publish / unpublish live match listing ───
  // Called by rooms when a match starts/ends so spectators can discover it.
  // CRITICAL: also arms onDisconnect so Firebase auto-removes the listing if the
  // host's connection dies (browser crash, tab close, network drop). Without this,
  // orphan entries accumulate forever — the host is the only user with write
  // permission to liveMatches/{code}, so manual cleanup can never happen post-crash.
  let _liveMatchOnDisconnects = {};
  function publishLiveMatch(roomCode, room, players){
    if(flySpectatorEnabled()) return;
    if(liveMatchPublishDisabled || !liveMatchListingsEnabled()) return;
    const u = window.FATE_ONLINE?.user;
    if(!u || !firebaseSpectatorAllowed() || !FO().set) return;
    const hostProf = players?.[room.hostUid]?.profileSnapshot || {};
    const guestProf = room.guestUid ? (players?.[room.guestUid]?.profileSnapshot || {}) : {};
    const lmRef = FO().ref(FO().rtdb, `liveMatches/${roomCode}`);
    FO().set(lmRef, {
      roomCode,
      mode: room.mode || 'freeplay',
      hostName: pName(hostProf),
      hostPhoto: pPhoto(hostProf),
      hostElo: Number(hostProf.challengerElo || hostProf.elo || 600) || 600,
      guestName: pName(guestProf),
      guestPhoto: pPhoto(guestProf),
      guestElo: Number(guestProf.challengerElo || guestProf.elo || 600) || 600,
      hostUid: room.hostUid || u.uid,
      startedAt: FO().serverTimestamp(),
      updatedAt: FO().serverTimestamp()
    }).then(function(){
      // Arm Firebase auto-cleanup. If the host disconnects without a clean
      // unpublish call, Firebase's server will remove the listing.
      if(FO().onDisconnect){
        try{
          const od = FO().onDisconnect(lmRef);
          od.remove().catch(function(){});
          _liveMatchOnDisconnects[roomCode] = od;
        }catch(e){}
      }
    }).catch(function(e){
      if(String(e?.code || e?.message || '').indexOf('permission_denied') !== -1){
        liveMatchPublishDisabled = true;
      }
    });
  }
  function unpublishLiveMatch(roomCode){
    if(flySpectatorEnabled()) return;
    if(!firebaseSpectatorAllowed() || !FO().remove) return;
    // Cancel the onDisconnect first so it doesn't double-fire after a clean exit.
    const od = _liveMatchOnDisconnects[roomCode];
    if(od && typeof od.cancel === 'function') {
      try{ od.cancel().catch(function(){}); }catch(e){}
    }
    delete _liveMatchOnDisconnects[roomCode];
    FO().remove(FO().ref(FO().rtdb, `liveMatches/${roomCode}`)).catch(()=>{});
  }
  // Defensive cleanup: when the live matches panel loads, sweep stale entries
  // whose underlying room no longer exists or has status='ended'/'lobby'. Only
  // the host has write permission, so this only cleans entries the current user
  // hosted and forgot to clean up themselves (e.g., previous session crash).
  async function sweepStaleLiveMatches(){
    if(flySpectatorEnabled()) return;
    const u = window.FATE_ONLINE?.user;
    if(!u || !firebaseSpectatorAllowed() || !FO().get || !FO().remove) return;
    try{
      const snap = await FO().get(liveMatchesQueryTarget(32));
      const entries = snap.val() || {};
      const codes = Object.keys(entries);
      for(let i=0; i<codes.length; i++){
        const code = codes[i];
        const entry = entries[code] || {};
        // Only attempt cleanup of our own listings (we won't have permission for others)
        if(entry.hostUid && entry.hostUid !== u.uid) continue;
        const roomSnap = await FO().get(FO().ref(FO().rtdb, `rooms/${code}/status`)).catch(function(){ return null; });
        const status = roomSnap ? roomSnap.val() : null;
        if(!status || status === 'ended' || status === 'lobby' || isLiveMatchStale(entry)){
          FO().remove(FO().ref(FO().rtdb, `liveMatches/${code}`)).catch(function(){});
        }
      }
    }catch(e){}
  }

  // ─── Live Matches Panel (title screen) ───
  function openLiveMatchesPanel(){
    if(spectatorPanelOpen) return;
    spectatorPanelOpen = true;
    const overlay = document.createElement('div');
    overlay.id = 'live-matches-overlay';
    overlay.className = 'live-matches-overlay';
    overlay.innerHTML = `
      <div class="live-matches-panel">
        <div class="lm-header">
          <span class="lm-title">LIVE MATCHES</span>
          <button class="lm-close" onclick="window.fateCloseLiveMatches()">✕</button>
        </div>
        <div class="lm-subtitle">Spectate ongoing matches between players. Watch every move in real-time.</div>
        <div class="lm-list" id="lm-list">
          <div class="lm-loading">Searching for live matches...</div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    // Close on backdrop click
    overlay.addEventListener('click', function(e){
      if(e.target === overlay) closeLiveMatchesPanel();
    });
    requestAnimationFrame(()=> overlay.classList.add('on'));
    // Sweep any stale entries we own from past crashes BEFORE subscribing,
    // so the listener's first snapshot is already clean.
    sweepStaleLiveMatches().finally(function(){ subscribeLiveMatches(); });
  }

  function closeLiveMatchesPanel(){
    spectatorPanelOpen = false;
    unsubscribeLiveMatches();
    const overlay = document.getElementById('live-matches-overlay');
    if(overlay){
      overlay.classList.remove('on');
      setTimeout(()=> overlay.remove(), 300);
    }
  }

  function subscribeLiveMatches(){
    unsubscribeLiveMatches();
    if(flySpectatorEnabled()){
      const refresh = function(){
        fetchFlyLiveMatches(16)
          .then(renderLiveMatchesList)
          .catch(function(e){
            console.warn('[Spectator] Fly live-match list failed', e);
            renderLiveMatchesList([]);
          });
      };
      refresh();
      flyLiveMatchesTimer = setInterval(refresh, 3500);
      liveMatchesUnsub = function(){
        if(flyLiveMatchesTimer) clearInterval(flyLiveMatchesTimer);
        flyLiveMatchesTimer = 0;
      };
      return;
    }
    if(!firebaseSpectatorAllowed() || !FO().onValue) return;
    liveMatchesUnsub = FO().onValue(liveMatchesQueryTarget(16), snap=>{
      const val = snap.val() || {};
      renderLiveMatchesList(Object.values(val));
    });
  }
  function unsubscribeLiveMatches(){
    try{ if(liveMatchesUnsub) liveMatchesUnsub(); }catch(e){}
    if(flyLiveMatchesTimer) clearInterval(flyLiveMatchesTimer);
    flyLiveMatchesTimer = 0;
    liveMatchesUnsub = null;
  }

  function renderLiveMatchesList(matches){
    const el = document.getElementById('lm-list');
    if(!el) return;
    const now = Date.now();
    matches = (Array.isArray(matches) ? matches : []).filter(m => {
      const stale = isLiveMatchStale(m, now);
      if(stale && canCurrentUserRemoveLiveMatch(m)) tryRemoveLiveMatchListing(m.roomCode);
      return !stale;
    });
    if(!matches.length){
      el.innerHTML = '<div class="lm-empty">No live matches right now. Check back later!</div>';
      return;
    }
    // Sort by most recent
    matches.sort((a,b)=> (Number(b.startedAt)||0) - (Number(a.startedAt)||0));
    el.innerHTML = matches.map(m => {
      const mode = (m.mode === 'ranked' || m.mode === 'challenger') ? 'RANKED CHALLENGER' : 'FREE PLAY';
      return `<div class="lm-card" onclick="window.fateSpectateMatch('${esc(m.roomCode)}')">
        <div class="lm-card-inner">
          <div class="lm-card-mode">${mode}</div>
          <div class="lm-card-matchup">
            <div class="lm-card-player">
              <img class="lm-card-pic" src="${esc(m.hostPhoto||'blank.png')}" onerror="this.onerror=null;this.src='blank.png';">
              <div class="lm-card-info">
                <div class="lm-card-name">${esc(m.hostName||'Player')}</div>
                <div class="lm-card-elo">${m.hostElo||600} ELO</div>
              </div>
            </div>
            <div class="lm-card-vs">VS</div>
            <div class="lm-card-player">
              <img class="lm-card-pic" src="${esc(m.guestPhoto||'blank.png')}" onerror="this.onerror=null;this.src='blank.png';">
              <div class="lm-card-info">
                <div class="lm-card-name">${esc(m.guestName||'Player')}</div>
                <div class="lm-card-elo">${m.guestElo||600} ELO</div>
              </div>
            </div>
          </div>
        </div>
        <div class="lm-card-footer">
          <div class="lm-card-action">Watch Live</div>
        </div>
      </div>`;
    }).join('');
  }

  // ─── Join as Spectator ───
  async function spectateMatch(roomCode){
    const u = getUser();
    if(!u){ if(typeof toast === 'function') toast('Sign in to spectate'); return; }
    if(flySpectatorEnabled()){
      await spectateFlyMatch(roomCode, u);
      return;
    }
    if(!firebaseSpectatorAllowed()){ if(typeof toast === 'function') toast('Online not ready'); return; }

    // Check room exists and is playing
    const snap = await FO().get(FO().ref(FO().rtdb, `rooms/${roomCode}`)).catch(()=>null);
    const room = snap?.val();
    if(!room || (room.status !== 'matchup' && room.status !== 'starting' && room.status !== 'playing')){
      tryRemoveLiveMatchListing(roomCode);
      if(typeof toast === 'function') toast('This match is no longer live');
      return;
    }

    closeLiveMatchesPanel();

    // Register as spectator in RTDB
    await FO().set(FO().ref(FO().rtdb, `rooms/${roomCode}/spectators/${u.uid}`), {
      uid: u.uid,
      joinedAt: FO().serverTimestamp()
    }).catch(()=>{});
    // Auto-remove on disconnect
    FO().onDisconnect(FO().ref(FO().rtdb, `rooms/${roomCode}/spectators/${u.uid}`)).remove().catch(()=>{});

    spectatingRoom = roomCode;
    spectatorLastActionSeq = 0;
    spectatorLastAppliedSeq = 0;
    spectatorActionBuffer.clear();
    spectatorActionDrainScheduled = false;

    // Get match data to bootstrap the game
    const players = (await FO().get(FO().ref(FO().rtdb, `rooms/${roomCode}/players`))).val() || {};
    const startAction = (await FO().get(FO().ref(FO().rtdb, `rooms/${roomCode}/actions/000001`))).val() || {};
    const startPayload = startAction.payload || {};

    // Re-check room status — it may have ended while we were loading data
    const recheck = await FO().get(FO().ref(FO().rtdb, `rooms/${roomCode}/status`)).catch(()=>null);
    const currentStatus = recheck?.val();
    if(currentStatus === 'ended' || currentStatus === 'lobby'){
      tryRemoveLiveMatchListing(roomCode);
      if(typeof toast === 'function') toast('This match is no longer live');
      return;
    }

    const g = typeof window.getFateGameState === 'function' ? window.getFateGameState() : (window.FATE_GAME_STATE || null);
    if(!g){ if(typeof toast === 'function') toast('Game state not ready'); return; }

    // Set decks
    const decks = startPayload.decks || {};
    if(Array.isArray(decks[0]) && decks[0].length === 40) g.p1Deck = [...decks[0]];
    if(Array.isArray(decks[1]) && decks[1].length === 40) g.p2Deck = [...decks[1]];

    const seed = room.seed || startPayload.seed || `${roomCode}_fallback`;
    const song = room.song || startPayload.song || 'board1';

    // Mark as spectator — perspective is player 0 (host) but no actions allowed
    g._onlineRoomCode = roomCode;
    g._onlineRole = 'spectator';
    g._onlinePlayerIndex = null; // spectators can't act
    g._isSpectator = true;
    g.localPlayerIndex = 0; // view from host's side
    g.viewerPlayerIndex = 0;
    g._onlineActionSeq = 0;
    g._onlineSeed = seed;
    g._onlineRoomMode = room.mode || 'freeplay';
    g._onlineGameSong = song;
    g._onlineActionLogMode = true;

    // Apply identities
    const hostProf = startPayload.profiles?.[0] || players[room.hostUid]?.profileSnapshot || {};
    const guestProf = startPayload.profiles?.[1] || (room.guestUid ? (players[room.guestUid]?.profileSnapshot || {}) : {});
    function gameProfileFromPublic(prof, fallbackName){
      return {
        name: pName(prof) || fallbackName || 'Player',
        img: pPhoto(prof),
        crop: pCrop(prof),
        elo: Number(prof?.challengerElo || prof?.elo || 600) || 600,
        wins: Number(prof?.wins || prof?.challengerWins || 0) || 0,
        losses: Number(prof?.losses || prof?.challengerLosses || 0) || 0,
        level: Number(prof?.level || 1) || 1,
        baseCode: prof?.baseCode || ''
      };
    }
    g.playerProfiles = { 0: gameProfileFromPublic(hostProf, 'Host'), 1: gameProfileFromPublic(guestProf, 'Guest') };

    // Start game
    if(typeof window.startGame === 'function') window.startGame(false);

    // Restore spectator state after startGame resets things
    g._onlineRoomCode = roomCode;
    g._onlineRole = 'spectator';
    g._onlinePlayerIndex = null;
    g._isSpectator = true;
    g.localPlayerIndex = 0;
    g.viewerPlayerIndex = 0;
    g._onlineSeed = seed;
    g._onlineRoomMode = room.mode || 'freeplay';
    g._onlineGameSong = song;
    g._onlineActionLogMode = true;
    g.playerProfiles = { 0: gameProfileFromPublic(hostProf, 'Host'), 1: gameProfileFromPublic(guestProf, 'Guest') };
    if(g.players && g.players[0]) g.players[0].name = g.playerProfiles[0].name;
    if(g.players && g.players[1]) g.players[1].name = g.playerProfiles[1].name;
    if(typeof window.applyGameBackground === 'function') window.applyGameBackground(song);
    if(typeof window.updatePlayerBanners === 'function') setTimeout(()=> window.updatePlayerBanners(), 80);

    // Disable turn timer and end turn for spectators
    if(typeof window.stopTurnTimer === 'function') window.stopTurnTimer();

    // Init chat for spectators
    if(typeof window.initInGameChat === 'function') window.initInGameChat();

    // Subscribe to actions and replay them all
    subscribeSpectatorActions(roomCode);
    // Subscribe to spectator count for badge
    subscribeSpectatorCount(roomCode);
    // Watch room status for end
    watchSpectatorRoom(roomCode, room);

    // Install spectator badge
    installSpectatorBadge();
    if(typeof playSfx === 'function') playSfx('spectatorJoin');

    if(typeof toast === 'function') toast('Spectating match — you are watching live');
  }

  async function spectateFlyMatch(roomCode, u){
    const code = String(roomCode || '').trim().toUpperCase();
    if(!code){ if(typeof toast === 'function') toast('This match is no longer live'); return; }
    let joined = null;
    try{
      joined = await flyApiRequest(`/api/rooms/${encodeURIComponent(code)}/spectators/join`, {
        method:'POST',
        body:{uid:u.uid, profile:window.FATE_ONLINE?.profile || {}}
      });
    }catch(e){
      console.warn('[Spectator] Fly spectator join failed', e);
      if(typeof toast === 'function') toast('This match is no longer live');
      return;
    }
    const room = joined?.room || null;
    if(!room || (room.status !== 'matchup' && room.status !== 'starting' && room.status !== 'playing')){
      flyApiRequest(`/api/rooms/${encodeURIComponent(code)}/spectators/leave`, {
        method:'POST',
        body:{uid:u.uid}
      }).catch(()=>{});
      if(typeof toast === 'function') toast('This match is no longer live');
      return;
    }

    closeLiveMatchesPanel();
    spectatingRoom = code;
    spectatorLastActionSeq = 0;
    spectatorLastAppliedSeq = 0;
    spectatorFlyChatSeq = 0;
    spectatorActionBuffer.clear();
    spectatorActionDrainScheduled = false;

    let resume = null;
    try{
      resume = await flyApiRequest(`/api/rooms/${encodeURIComponent(code)}/resume?after=0&limit=500&includeState=1`);
    }catch(e){
      console.warn('[Spectator] Fly spectator resume failed', e);
      flyApiRequest(`/api/rooms/${encodeURIComponent(code)}/spectators/leave`, {
        method:'POST',
        body:{uid:u.uid}
      }).catch(()=>{});
      if(typeof toast === 'function') toast('Could not load match replay');
      return;
    }
    const replayRoom = resume?.room || room;
    const events = Array.isArray(resume?.events) ? resume.events : [];
    const startAccepted = events.find(item=>String(item?.action?.type || item?.type || '').toUpperCase() === 'MATCH_START') || null;
    const startAction = startAccepted?.action || startAccepted || {};
    const startPayload = startAction.payload || {};

    const g = typeof window.getFateGameState === 'function' ? window.getFateGameState() : (window.FATE_GAME_STATE || null);
    if(!g){
      flyApiRequest(`/api/rooms/${encodeURIComponent(code)}/spectators/leave`, {
        method:'POST',
        body:{uid:u.uid}
      }).catch(()=>{});
      if(typeof toast === 'function') toast('Game state not ready');
      return;
    }

    const decks = startPayload.decks || {};
    if(Array.isArray(decks[0]) && decks[0].length === 40) g.p1Deck = [...decks[0]];
    if(Array.isArray(decks[1]) && decks[1].length === 40) g.p2Deck = [...decks[1]];

    const seed = replayRoom.seed || startPayload.seed || `${code}_fallback`;
    const song = replayRoom.song || startPayload.song || 'board1';
    const players = replayRoom.players || {};

    function gameProfileFromPublic(prof, fallbackName){
      return {
        name: pName(prof) || fallbackName || 'Player',
        img: pPhoto(prof),
        crop: pCrop(prof),
        elo: Number(prof?.challengerElo || prof?.elo || 600) || 600,
        wins: Number(prof?.wins || prof?.challengerWins || 0) || 0,
        losses: Number(prof?.losses || prof?.challengerLosses || 0) || 0,
        level: Number(prof?.level || 1) || 1,
        baseCode: prof?.baseCode || ''
      };
    }
    const hostProf = startPayload.profiles?.[0] || players[replayRoom.hostUid]?.profile || players[replayRoom.hostUid]?.profileSnapshot || {};
    const guestProf = startPayload.profiles?.[1] || (replayRoom.guestUid ? (players[replayRoom.guestUid]?.profile || players[replayRoom.guestUid]?.profileSnapshot || {}) : {});

    g._onlineRoomCode = code;
    g._onlineRole = 'spectator';
    g._onlinePlayerIndex = null;
    g._isSpectator = true;
    g.localPlayerIndex = 0;
    g.viewerPlayerIndex = 0;
    g._onlineActionSeq = 0;
    g._onlineSeed = seed;
    g._onlineRoomMode = replayRoom.mode || 'freeplay';
    g._onlineGameSong = song;
    g._onlineActionLogMode = true;
    g.playerProfiles = { 0: gameProfileFromPublic(hostProf, 'Host'), 1: gameProfileFromPublic(guestProf, 'Guest') };

    if(typeof window.startGame === 'function') window.startGame(false);

    g._onlineRoomCode = code;
    g._onlineRole = 'spectator';
    g._onlinePlayerIndex = null;
    g._isSpectator = true;
    g.localPlayerIndex = 0;
    g.viewerPlayerIndex = 0;
    g._onlineSeed = seed;
    g._onlineRoomMode = replayRoom.mode || 'freeplay';
    g._onlineGameSong = song;
    g._onlineActionLogMode = true;
    g.playerProfiles = { 0: gameProfileFromPublic(hostProf, 'Host'), 1: gameProfileFromPublic(guestProf, 'Guest') };
    if(g.players && g.players[0]) g.players[0].name = g.playerProfiles[0].name;
    if(g.players && g.players[1]) g.players[1].name = g.playerProfiles[1].name;
    if(typeof window.applyGameBackground === 'function') window.applyGameBackground(song);
    if(typeof window.updatePlayerBanners === 'function') setTimeout(()=> window.updatePlayerBanners(), 80);
    if(typeof window.stopTurnTimer === 'function') window.stopTurnTimer();
    if(typeof window.initInGameChat === 'function') window.initInGameChat();

    subscribeSpectatorActions(code);
    subscribeSpectatorCount(code);
    watchSpectatorRoom(code, replayRoom);
    installSpectatorBadge();
    if(typeof playSfx === 'function') playSfx('spectatorJoin');
    if(typeof toast === 'function') toast('Spectating match - you are watching live');
  }

  function makeSeededRng(seed){
    let a = 0;
    const s = String(seed||'fates');
    for(let i=0;i<s.length;i++){ a ^= s.charCodeAt(i); a = Math.imul(a, 16777619); }
    a = (a >>> 0) || 0x9e3779b9;
    return function(){
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function subscribeSpectatorActions(code){
    if(spectatorActionsUnsub) try{ spectatorActionsUnsub(); }catch(e){}
    async function drainSpectatorActions(){
      while(true){
        const nextSeq = spectatorLastAppliedSeq + 1;
        const a = spectatorActionBuffer.get(nextSeq);
        if(!a) break;
        spectatorActionBuffer.delete(nextSeq);
        if(a.type === 'MATCH_START'){
          spectatorLastAppliedSeq = Math.max(spectatorLastAppliedSeq, a.seq || 0);
          continue;
        }
        try{
          await applySpectatorAction(a);
          spectatorLastAppliedSeq = Math.max(spectatorLastAppliedSeq, a.seq || 0);
        }catch(e){
          console.error('[Spectator] action replay failed', e, a);
        }
      }
    }
    function scheduleSpectatorDrain(){
      if(spectatorActionDrainScheduled) return;
      spectatorActionDrainScheduled = true;
      spectatorActionReplayQueue = spectatorActionReplayQueue
        .then(()=>drainSpectatorActions())
        .catch(e=>console.error('[Spectator] action queue failed', e))
        .then(()=>{
          spectatorActionDrainScheduled = false;
          if(spectatorActionBuffer.has(spectatorLastAppliedSeq + 1)) scheduleSpectatorDrain();
        });
    }
    function queueSpectatorAction(a){
      const seq = Number(a?.seq || 0) || 0;
      if(!seq || seq <= spectatorLastAppliedSeq || spectatorActionBuffer.has(seq)) return;
      spectatorLastActionSeq = Math.max(spectatorLastActionSeq, seq);
      spectatorActionBuffer.set(seq, a);
      scheduleSpectatorDrain();
    }
    if(flySpectatorEnabled()){
      let stopped = false;
      const poll = async function(){
        if(stopped || !spectatingRoom) return;
        try{
          const data = await flyApiRequest(`/api/rooms/${encodeURIComponent(code)}/events?after=${encodeURIComponent(spectatorLastActionSeq)}&limit=300`);
          const events = Array.isArray(data.events) ? data.events : [];
          events.forEach(item=>queueSpectatorAction(item?.action || item));
          if(Number(data.lastSeq || 0) > spectatorLastActionSeq && !events.length) spectatorLastActionSeq = Number(data.lastSeq || 0) || spectatorLastActionSeq;
        }catch(e){
          console.warn('[Spectator] Fly action replay poll failed', e);
        }
      };
      poll();
      flySpectatorActionTimer = setInterval(poll, 1200);
      spectatorActionsUnsub = function(){
        stopped = true;
        if(flySpectatorActionTimer) clearInterval(flySpectatorActionTimer);
        flySpectatorActionTimer = 0;
      };
      return;
    }
    if(!firebaseSpectatorAllowed() || !FO().onChildAdded) return;
    const arBase = FO().ref(FO().rtdb, `rooms/${code}/actions`);
    if(FO().onChildAdded && FO().query && FO().orderByKey && FO().startAt){
      const startKey = String(Math.max(1, spectatorLastAppliedSeq + 1)).padStart(6, '0');
      const ar = FO().query(arBase, FO().orderByKey(), FO().startAt(startKey));
      spectatorActionsUnsub = FO().onChildAdded(ar, snap=>queueSpectatorAction(snap.val() || {}));
      return;
    }
    console.warn('[Spectator] Action replay requires keyed RTDB queries; refusing unbounded action-log fallback.');
  }

  async function applySpectatorAction(action){
    const g = typeof window.getFateGameState === 'function' ? window.getFateGameState() : window.FATE_GAME_STATE;
    if(!g) return;
    const type = String(action?.type || '').toUpperCase();
    if(type === 'MATCH_START') return;
    const payload = action.payload || {};

    // Apply action as remote
    const prev = g._onlineApplyingRemoteAction;
    const prevPlayer = g._onlineRemoteActionPlayer;
    g._onlineApplyingRemoteAction = true;
    g._onlineRemoteActionPlayer = Number.isInteger(payload.playerIndex) ? payload.playerIndex : null;
    try{
      if(type === 'END_TURN'){
        if(typeof window.endTurn === 'function') window.endTurn();
      } else if(type === 'CHOOSE_TURN'){
        if(typeof window.chooseTurn === 'function') window.chooseTurn(!!payload.goFirst);
      } else if(type === 'START_CONSOLIDATE'){
        if(payload.selectedHand && typeof restoreSelectedHand === 'function'){
          restoreSelectedHand(g, payload.playerIndex, payload.selectedHand);
        } else if(payload.selectedHand){
          const hand = g.players?.[payload.playerIndex]?.hand;
          if(hand && payload.selectedHand.iid){
            const idx = hand.findIndex(c=>c && c.iid === payload.selectedHand.iid);
            if(idx >= 0) g.selectedHandCard = idx;
          }
        }
        if(typeof window.initiateConsolidate === 'function') window.initiateConsolidate();
      } else if(type === 'CLICK_CELL'){
        if(payload.selectedHand){
          const hand = g.players?.[payload.playerIndex]?.hand;
          if(hand && payload.selectedHand.iid){
            const idx = hand.findIndex(c=>c && c.iid === payload.selectedHand.iid);
            if(idx >= 0) g.selectedHandCard = idx;
          }
        }
        if(payload.placing) g.placing = true;
        if(typeof window.clickCell === 'function') await window.clickCell(payload.z, payload.r, payload.c);
      } else if(type === 'BOARD_ACTION'){
        const fn = window.__fateOnlineOriginalFns?.[payload.fn];
        if(typeof fn === 'function'){
          const card = g.board?.[payload.z]?.[payload.r]?.[payload.c] || null;
          const fx = payload.effectCinematic || (/^(triggerCharacterEffect|activatePendingWhenSetEffect)$/i.test(String(payload.fn || '')) ? payload : null);
          const fxCard = fx ? (g.board?.[fx.z]?.[fx.r]?.[fx.c] || null) : null;
          if(fxCard && typeof window.showEffectActivationCinematic === 'function') {
            await window.showEffectActivationCinematic(fxCard, {remote:true, source:'spectator-board-action-effect-cinematic'});
          }
          await fn.call(window, card, payload.z, payload.r, payload.c);
        }
      } else if(type === 'EFFECT_CINEMATIC'){
        const card = g.board?.[payload.z]?.[payload.r]?.[payload.c] || null;
        if(card && typeof window.showEffectActivationCinematic === 'function') {
          await window.showEffectActivationCinematic(card, {remote:true, source:'spectator-effect-cinematic'});
        }
      } else if(type === 'HAND_ACTION'){
        const fn = window.__fateOnlineOriginalFns?.[payload.fn];
        if(typeof fn === 'function'){
          if(payload.selectedHand){
            const hand = g.players?.[payload.playerIndex]?.hand;
            if(hand && payload.selectedHand.iid){
              const idx = hand.findIndex(c=>c && c.iid === payload.selectedHand.iid);
              if(idx >= 0) g.selectedHandCard = idx;
            }
          }
          const card = g.players?.[payload.playerIndex]?.hand?.[g.selectedHandCard] || null;
          await fn.call(window, card);
        }
      } else if(type === 'MODAL_ACTION'){
        const fx = payload.effectCinematic || (g.selectedBoardCard ? {z:g.selectedBoardCard.z, r:g.selectedBoardCard.r, c:g.selectedBoardCard.c} : null);
        const fxCard = fx ? (g.board?.[fx.z]?.[fx.r]?.[fx.c] || null) : null;
        if(fxCard && typeof window.showEffectActivationCinematic === 'function') {
          await window.showEffectActivationCinematic(fxCard, {remote:true, source:'spectator-modal-action-effect-cinematic'});
        }
        const modalAction = g._onlinePendingModalActions?.[payload.actionIndex];
        if(modalAction && typeof modalAction.action === 'function') await modalAction.action();
        g._onlinePendingModalActions = null;
      } else if(type === 'PICK_CARDS_VISUAL'){
        const pending = g._onlinePendingPickCardsVisual;
        if(pending && typeof pending.onConfirm === 'function'){
          const selected = (payload.selectedCards || [])
            .map(ident => (pending.cards || []).find(card => card && ident && ((ident.iid && card.iid === ident.iid) || (ident.id && card.id === ident.id))))
            .filter(Boolean);
          await pending.onConfirm(selected);
          g._onlinePendingPickCardsVisual = null;
        }
      } else if(type === 'PICK_ZONE'){
        const pending = g._onlinePendingZonePicker;
        if(pending && typeof pending.onConfirm === 'function'){
          const selected = (payload.selectedEntries || [])
            .map(item => (pending.entries || []).find(e=> e && item && e.z === item.z && e.r === item.r && e.c === item.c))
            .filter(Boolean);
          await pending.onConfirm(selected);
          g._onlinePendingZonePicker = null;
        }
      } else if(type === 'PICK_AFFILIATION'){
        const pending = g._onlinePendingAffiliationPicker;
        if(pending && typeof pending.callback === 'function'){
          await pending.callback(String(payload.aff || ''));
          g._onlinePendingAffiliationPicker = null;
        }
      } else if(type === 'FORFEIT'){
        // Match ended by forfeit — show result and leave
        if(typeof toast === 'function') toast('A player forfeited — match over');
        setTimeout(()=> leaveSpectating(), 3000);
      }
    }finally{
      g._onlineApplyingRemoteAction = prev;
      g._onlineRemoteActionPlayer = prevPlayer;
    }
    // After each action, stop timer for spectators
    if(typeof window.stopTurnTimer === 'function') window.stopTurnTimer();
  }

  function watchSpectatorRoom(code, initialRoom){
    if(spectatorRoomUnsub) try{ spectatorRoomUnsub(); }catch(e){}
    if(flySpectatorEnabled()){
      let stopped = false;
      let lastStatus = initialRoom?.status || '';
      const poll = async function(){
        if(stopped || !spectatingRoom) return;
        try{
          const data = await flyApiRequest(`/api/rooms/${encodeURIComponent(code)}`);
          const room = data.room || {};
          updateSpectatorBadge(room.spectatorCount || 0);
          if(room.status && room.status !== lastStatus) lastStatus = room.status;
          if(!room.status || room.status === 'ended' || room.status === 'lobby'){
            if(typeof toast === 'function') toast(room.status === 'ended' ? 'Match has ended' : 'Match room no longer exists');
            setTimeout(()=> leaveSpectating(), room.status === 'ended' ? 4000 : 0);
            return;
          }
          const chat = await flyApiRequest(`/api/rooms/${encodeURIComponent(code)}/chat?after=${encodeURIComponent(spectatorFlyChatSeq)}&limit=80`).catch(()=>null);
          if(chat){
            const messages = Array.isArray(chat.messages) ? chat.messages : [];
            spectatorFlyChatSeq = Math.max(Number(chat.chatSeq || 0) || 0, spectatorFlyChatSeq, ...messages.map(m=>Number(m.seq || 0) || 0));
            syncSpectatorChat({chat:messages, hostUid:room.hostUid || initialRoom?.hostUid, guestUid:room.guestUid || initialRoom?.guestUid});
          }
        }catch(e){
          console.warn('[Spectator] Fly room poll failed', e);
        }
      };
      poll();
      flySpectatorRoomTimer = setInterval(poll, 2500);
      flySpectatorHeartbeatTimer = setInterval(function(){
        const u = window.FATE_ONLINE?.user;
        if(!u || !spectatingRoom) return;
        flyApiRequest(`/api/rooms/${encodeURIComponent(code)}/spectators/heartbeat`, {
          method:'POST',
          body:{uid:u.uid}
        }).catch(()=>{});
      }, 12000);
      spectatorRoomUnsub = function(){
        stopped = true;
        if(flySpectatorRoomTimer) clearInterval(flySpectatorRoomTimer);
        if(flySpectatorHeartbeatTimer) clearInterval(flySpectatorHeartbeatTimer);
        flySpectatorRoomTimer = 0;
        flySpectatorHeartbeatTimer = 0;
      };
      return;
    }
    if(!firebaseSpectatorAllowed() || !FO().onValue) return;
    // Watch only status (lightweight) instead of entire room tree
    let statusUnsub = null;
    let chatUnsub = null;
    let lastChatJson = '';
    statusUnsub = FO().onValue(FO().ref(FO().rtdb, `rooms/${code}/status`), snap=>{
      const status = snap.val();
      if(!status){
        if(typeof toast === 'function') toast('Match room no longer exists');
        leaveSpectating();
        return;
      }
      if(status === 'ended'){
        if(typeof toast === 'function') toast('Match has ended');
        setTimeout(()=> leaveSpectating(), 4000);
      }
    });
    // Watch chat separately to avoid downloading actions/players on every change
    chatUnsub = FO().onValue(spectatorChatQueryTarget(code), snap=>{
      const chatVal = snap.val();
      const json = JSON.stringify(chatVal || {});
      if(json === lastChatJson) return; // skip if unchanged
      lastChatJson = json;
      // Build a minimal room-like object for syncSpectatorChat
      const fakeRoom = { chat: chatVal || {}, hostUid: initialRoom?.hostUid, guestUid: initialRoom?.guestUid };
      syncSpectatorChat(fakeRoom);
    });
    spectatorRoomUnsub = function(){
      try{ if(statusUnsub) statusUnsub(); }catch(e){}
      try{ if(chatUnsub) chatUnsub(); }catch(e){}
    };
  }

  function syncSpectatorChat(room){
    if(!room || typeof window.fateSetOnlineInGameMessages !== 'function') return;
    const rawChat = room.chat || {};
    const entries = (Array.isArray(rawChat)
      ? rawChat.map((msg, idx)=>({id:msg?.id || String(msg?.seq || idx), msg:msg || {}}))
      : Object.entries(rawChat).map(([id, msg])=>({ id, msg:msg || {} })))
      .sort((a,b)=> (Number(a.msg.createdAt||0)||0) - (Number(b.msg.createdAt||0)||0))
      .slice(-80);
    function roomPlayerIndexForUid(r, uid){
      if(!r || !uid) return null;
      if(r.hostUid === uid) return 0;
      if(r.guestUid === uid) return 1;
      return null;
    }
    const messages = entries.map(({id, msg})=>{
      const player = roomPlayerIndexForUid(room, msg.uid);
      const isSpectatorMsg = player === null;
      return {
        id,
        uid: msg.uid || '',
        from: isSpectatorMsg ? 'Spectator' : (msg.name || 'Player'),
        player: Number.isInteger(player) ? player : -1,
        text: String(msg.text || ''),
        timestamp: Number(msg.createdAt || 0) || 0,
        isSpectator: isSpectatorMsg
      };
    });
    window.fateSetOnlineInGameMessages(messages);
  }

  // ─── Spectator count badge (eyeball icon in topbar) ───
  function subscribeSpectatorCount(code){
    if(spectatorCountUnsub) try{ spectatorCountUnsub(); }catch(e){}
    if(flySpectatorEnabled()){
      let stopped = false;
      const poll = async function(){
        if(stopped || !code) return;
        const data = await flyApiRequest(`/api/rooms/${encodeURIComponent(code)}`).catch(()=>null);
        if(data?.room) updateSpectatorBadge(data.room.spectatorCount || 0);
      };
      poll();
      flySpectatorCountTimer = setInterval(poll, 5000);
      spectatorCountUnsub = function(){
        stopped = true;
        if(flySpectatorCountTimer) clearInterval(flySpectatorCountTimer);
        flySpectatorCountTimer = 0;
      };
      return;
    }
    if(!firebaseSpectatorAllowed() || !FO().onValue) return;
    spectatorCountUnsub = FO().onValue(FO().ref(FO().rtdb, `rooms/${code}/spectators`), snap=>{
      const val = snap.val() || {};
      const count = Object.keys(val).length;
      updateSpectatorBadge(count);
    });
  }

  function installSpectatorBadge(){
    let badge = document.getElementById('spectator-badge');
    if(badge) badge.remove();
    badge = document.createElement('div');
    badge.id = 'spectator-badge';
    badge.className = 'spectator-badge';
    badge.innerHTML = '<span class="spectator-eye" aria-hidden="true">👁</span><span class="spectator-count" id="spectator-count">0</span>';
    badge.title = 'Spectators watching this match';
    const gameScreen = document.getElementById('s-game');
    if(gameScreen) gameScreen.appendChild(badge);
  }

  function updateSpectatorBadge(count){
    const el = document.getElementById('spectator-count');
    if(el) el.textContent = String(count || 0);
    const badge = document.getElementById('spectator-badge');
    if(badge) badge.classList.toggle('has-spectators', count > 0);
  }

  function removeSpectatorBadge(){
    const badge = document.getElementById('spectator-badge');
    if(badge) badge.remove();
  }

  // ─── Leave spectating ───
  function leaveSpectating(){
    const code = spectatingRoom;
    spectatingRoom = null;
    // Clean up RTDB
    const u = window.FATE_ONLINE?.user;
    if(code && u && flySpectatorEnabled()){
      flyApiRequest(`/api/rooms/${encodeURIComponent(code)}/spectators/leave`, {
        method:'POST',
        body:{uid:u.uid}
      }).catch(()=>{});
    }else if(code && u && firebaseSpectatorAllowed() && FO().remove){
      FO().remove(FO().ref(FO().rtdb, `rooms/${code}/spectators/${u.uid}`)).catch(()=>{});
    }
    // Unsubscribe
    try{ if(spectatorRoomUnsub) spectatorRoomUnsub(); }catch(e){}
    try{ if(spectatorActionsUnsub) spectatorActionsUnsub(); }catch(e){}
    try{ if(spectatorCountUnsub) spectatorCountUnsub(); }catch(e){}
    if(flySpectatorRoomTimer) clearInterval(flySpectatorRoomTimer);
    if(flySpectatorActionTimer) clearInterval(flySpectatorActionTimer);
    if(flySpectatorCountTimer) clearInterval(flySpectatorCountTimer);
    if(flySpectatorHeartbeatTimer) clearInterval(flySpectatorHeartbeatTimer);
    flySpectatorRoomTimer = flySpectatorActionTimer = flySpectatorCountTimer = flySpectatorHeartbeatTimer = 0;
    spectatorRoomUnsub = spectatorActionsUnsub = spectatorCountUnsub = null;
    spectatorActionReplayQueue = Promise.resolve();
    spectatorLastActionSeq = 0;
    spectatorLastAppliedSeq = 0;
    spectatorFlyChatSeq = 0;
    spectatorActionBuffer.clear();
    spectatorActionDrainScheduled = false;
    // Clean up profile subscriptions to prevent memory leaks
    spectatorProfileUnsubs.forEach(function(unsub){ try{ unsub(); }catch(e){} });
    spectatorProfileUnsubs.clear();
    spectatorLiveProfiles.clear();

    removeSpectatorBadge();

    // Clean up game state
    const g = typeof window.getFateGameState === 'function' ? window.getFateGameState() : window.FATE_GAME_STATE;
    if(g){
      g._onlineRoomCode = null;
      g._onlineRole = null;
      g._onlinePlayerIndex = null;
      g._isSpectator = false;
      g.localPlayerIndex = null;
      g.viewerPlayerIndex = null;
      g._onlineActionLogMode = false;
      g._onlineApplyingRemoteAction = false;
    }
    if(typeof window.cleanupGame === 'function') window.cleanupGame();
    if(typeof window.showScreen === 'function') window.showScreen('s-title');
  }

  // ─── Spectator chat: spectators can send messages but they appear anonymously ───
  function sendSpectatorChat(text){
    const u = getUser();
    const code = spectatingRoom || (typeof window.getFateGameState === 'function' && window.getFateGameState()?._onlineRoomCode);
    if(!u || !code) return;
    const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    if(!clean) return;
    if(flySpectatorEnabled()){
      flyApiRequest(`/api/rooms/${encodeURIComponent(code)}/chat`, {
        method:'POST',
        body:{uid:u.uid, text:clean, profile:{displayName:'Spectator', username:'Spectator'}}
      }).then(data=>{
        const messages = Array.isArray(data.messages) ? data.messages : [];
        spectatorFlyChatSeq = Math.max(Number(data.chatSeq || 0) || 0, spectatorFlyChatSeq, ...messages.map(m=>Number(m.seq || 0) || 0));
        syncSpectatorChat({chat:messages});
      }).catch(e=> console.error('[Spectator] Fly chat send failed', e));
      return;
    }
    if(!firebaseSpectatorAllowed() || !FO().push || !FO().set) return;
    const msgRef = FO().push(FO().ref(FO().rtdb, `rooms/${code}/chat`));
    FO().set(msgRef, {
      uid: u.uid,
      text: clean,
      name: 'Spectator',
      isSpectator: true,
      createdAt: FO().serverTimestamp()
    }).catch(e=> console.error('[Spectator] chat send failed', e));
  }

  // ─── Install spectator badge for PLAYERS in online matches ───
  // This subscribes to spectator count even for non-spectators so they see the eyeball.
  function installPlayerSpectatorBadge(roomCode){
    installSpectatorBadge();
    subscribeSpectatorCount(roomCode);
  }

  // ─── Intercept confirmEndGame for spectators ───
  function installSpectatorEndGameHook(){
    if(window.__fateSpectatorEndGameHooked) return;
    window.__fateSpectatorEndGameHooked = true;
    const origCheck = ()=>{
      const g = typeof window.getFateGameState === 'function' ? window.getFateGameState() : window.FATE_GAME_STATE;
      return !!(g && g._isSpectator);
    };
    // Wrap confirmEndGame if it exists
    const wrap = ()=>{
      if(typeof window.confirmEndGame !== 'function') return;
      if(window.confirmEndGame._spectatorWrapped) return;
      const orig = window.confirmEndGame;
      const wrapped = function(){
        if(origCheck()){
          if(typeof showModal === 'function'){
            showModal('Leave Spectating?', 'Stop watching this match and return to the main menu?', [
              {label:'Keep Watching', action:()=>{ if(typeof closeModal === 'function') closeModal(); }},
              {label:'Leave', danger:true, action:()=>{ if(typeof closeModal === 'function') closeModal(); leaveSpectating(); }}
            ]);
          } else {
            leaveSpectating();
          }
          return;
        }
        return orig.apply(this, arguments);
      };
      wrapped._spectatorWrapped = true;
      wrapped._onlineWrapped = orig._onlineWrapped; // preserve online wrap flag
      window.confirmEndGame = wrapped;
    };
    wrap();
    setTimeout(wrap, 500);
  }

  // ─── Intercept sendInGameChat for spectators ───
  function installSpectatorChatHook(){
    if(window.__fateSpectatorChatHooked) return;
    window.__fateSpectatorChatHooked = true;
    const wrap = ()=>{
      if(typeof window.sendInGameChat !== 'function') return;
      if(window.sendInGameChat._spectatorWrapped) return;
      const orig = window.sendInGameChat;
      window.sendInGameChat = function(){
        const g = typeof window.getFateGameState === 'function' ? window.getFateGameState() : window.FATE_GAME_STATE;
        if(g && g._isSpectator){
          const inp = document.getElementById('igc-input');
          if(!inp) return;
          const text = inp.value.trim();
          if(!text) return;
          sendSpectatorChat(text);
          inp.value = '';
          if(typeof playSfx === 'function') playSfx('uiClick');
          return;
        }
        return orig.apply(this, arguments);
      };
      window.sendInGameChat._spectatorWrapped = true;
    };
    wrap();
    setTimeout(wrap, 500);
  }

  // ─── Intercept endTurn / clickCell for spectators (no-op) ───
  function installSpectatorActionGuards(){
    if(window.__fateSpectatorGuardsInstalled) return;
    window.__fateSpectatorGuardsInstalled = true;
    const isSpec = ()=>{
      const g = typeof window.getFateGameState === 'function' ? window.getFateGameState() : window.FATE_GAME_STATE;
      return !!(g && g._isSpectator);
    };
    ['endTurn','clickCell','initiateConsolidate'].forEach(fnName=>{
      const orig = window[fnName];
      if(typeof orig !== 'function') return;
      window[fnName] = function(){
        const g = typeof window.getFateGameState === 'function' ? window.getFateGameState() : window.FATE_GAME_STATE;
        // Only block if it's NOT a remote action replay
        if(isSpec() && !g?._onlineApplyingRemoteAction){
          if(typeof toast === 'function') toast('You are spectating — actions are not allowed');
          return;
        }
        return orig.apply(this, arguments);
      };
    });
  }

  // ─── Init ───
  function init(){
    installSpectatorEndGameHook();
    installSpectatorChatHook();
    installSpectatorActionGuards();
  }

  // Run after DOM ready
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else setTimeout(init, 0);

  // ─── Expose API ───
  window.fateOpenLiveMatches = openLiveMatchesPanel;
  window.fateCloseLiveMatches = closeLiveMatchesPanel;
  window.fateSpectateMatch = spectateMatch;
  window.fateJoinAsSpectator = spectateMatch;
  window.fateLeaveSpectating = leaveSpectating;
  window.fatePublishLiveMatch = publishLiveMatch;
  window.fateUnpublishLiveMatch = unpublishLiveMatch;
  window.fateInstallPlayerSpectatorBadge = installPlayerSpectatorBadge;
  window.fateIsSpectating = function(){ return !!spectatingRoom; };
  window.fateSendSpectatorChat = sendSpectatorChat;
  window.fateFetchFlyLiveMatches = fetchFlyLiveMatches;
})();
