// FATES ENTWINED ONLINE ROOMS V1.3
// Fly authority room transport, with RTDB room-code fallback only when enabled.
(function(){
  const FO = window.FateOnline || {};
  let activeRoom = null;
  let roomUnsub = null;
  let playersUnsub = null;
  let actionUnsub = null;
  let roomProfileUnsubs = new Map();
  let liveProfiles = new Map();
  let lastActionSeq = 0;
  let lastAppliedActionSeq = 0;
  let actionReplayQueue = Promise.resolve();
  let startingLock = false;
  let lastLobbyRoom = null;
  let lastLobbyPlayers = null;
  let lastLobbyHtml = '';
  let lobbyRenderTimer = null;
  let autoStartTimer = null;
  let autoStartCode = null;
  let currentDeckChoiceKey = '';
  let deckPickerOpenForRoom = null;
  let lagPauseVisible = false;
  let lastLagPauseReason = '';
  let activeRoomSilent = false;
  let randomQueueState = { active:false, roomCode:null, role:null, started:false, handlers:null };
  const allowedOnlineMatchStarts = new Map();
  let randomQueueUnsub = null;
  let randomQueueSwitching = false;
  let partyQueueWaitTimer = null;
  let disconnectEndTimer = null;
  let optimisticActionCounter = 0;
  let lastReportedActionSeq = -1;
  let lastReportedActionAt = 0;
  let lastTurnBoundaryActionSeq = 0;
  let pendingActionProgressSeq = 0;
  let appliedTurnChoiceFallbackIds = new Set();
  let appliedPlayerActionFallbackIds = new Set();
  let lastSyncedRoomChatKey = '';
  let lobbyChatLastSeenKey = '';
  let lobbyChatUnread = false;
  let endedRoomCodesHandled = new Set();
  let actionReplayBuffer = new Map();
  let actionReplayDrainScheduled = false;
  let pendingFlyResumeEvents = null;
  const flyMatchStartActions = new Map();
  const optimisticAppliedActionIds = new Set();
  let onlineStateSyncTimer = null;
  let authorityWs = null;
  let authorityUrl = '';
  let authorityRoomCode = '';
  let authorityJoined = false;
  let authorityJoinPromise = null;
  let authorityRequestCounter = 0;
  let lastAuthorityStateHash = '';
  let authorityReducerMode = '';
  let authorityGameplayMode = '';
  const blockedRtdbRoomWarnings = new Set();
  let authorityRetryAttempts = 0;
  let authorityRetrySuccesses = 0;
  let authorityRetryFailures = 0;
  let authorityLastRetryReason = '';
  let authorityLastRetryClientActionId = '';
  let authorityCatchupAttempts = 0;
  let authorityCatchupSuccesses = 0;
  let authorityCatchupFailures = 0;
  let authorityLastCatchupSeq = 0;
  let authorityLastCatchupReason = '';
  let authorityRejectedResyncAttempts = 0;
  let authorityRejectedResyncSuccesses = 0;
  let authorityRejectedResyncFailures = 0;
  let authorityLastRejectedResyncReason = '';
  let optimisticSendQueue = Promise.resolve();
  let clientResolvedCommitInFlight = 0;
  let clientResolvedLocalCommitPending = 0;
  let clientResolvedAutoCommitTimer = null;
  let lastClientResolvedAutoCommitHash = '';
  let lobbyAuthorityPrejoinCode = '';
  let lobbyAuthorityPrejoinAttempts = 0;
  let lobbyAuthorityPrejoinNextAt = 0;
  const authorityInflight = new Map();
  const authorityPersistPromises = new Map();
  const authorityPersistRetries = new Map();
  const onlineDiagnosticsTimeline = [];
  const AUTHORITY_OPEN_TIMEOUT_MS = 20000;
  const AUTHORITY_HELLO_TIMEOUT_MS = 20000;
  const AUTHORITY_ACTION_TIMEOUT_MS = 6500;


  function esc(s){ return FO.escapeHtml ? FO.escapeHtml(s) : String(s||'').replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function recordOnlineDiagnostic(event, details){
    const g = gameState();
    const entry = Object.assign({
      at:Date.now(),
      event:String(event || 'event').slice(0, 80),
      room:String(g?._onlineRoomCode || activeRoom || authorityRoomCode || '').trim().toUpperCase(),
      seq:Math.max(Number(lastAppliedActionSeq || 0) || 0, Number(lastActionSeq || 0) || 0, Number(g?._onlineAppliedActionSeq || 0) || 0, Number(g?._onlineActionSeq || 0) || 0),
      localPlayer:Number.isInteger(Number(g?._onlinePlayerIndex)) ? Number(g._onlinePlayerIndex) : null,
      currentPlayer:Number.isInteger(Number(g?.currentPlayer)) ? Number(g.currentPlayer) : null,
      stateHash:lastAuthorityStateHash || ''
    }, details || {});
    onlineDiagnosticsTimeline.push(entry);
    if(onlineDiagnosticsTimeline.length > 180) onlineDiagnosticsTimeline.splice(0, onlineDiagnosticsTimeline.length - 180);
    try{
      const perf = window.__fatePerf = window.__fatePerf || {};
      perf.onlineDiagnosticsLast = entry;
      perf.onlineDiagnosticsCount = onlineDiagnosticsTimeline.length;
    }catch(e){}
    return entry;
  }
  function makeCode(){ const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<6;i++) s += alphabet[Math.floor(Math.random()*alphabet.length)]; return s; }
  function getUser(){ try{return FO.requireUser();}catch(e){ return null; } }
  function pName(p){ return FO.profileName ? FO.profileName(p) : (p?.chosenUsername||p?.displayName||p?.username||p?.baseCode||'Player'); }
  function compactPhotoValue(value){
    if(!value) return '';
    if(value && typeof value === 'object'){
      if(value.pfpId) return 'pfp/pfp' + (Math.max(1, parseInt(value.pfpId, 10) || 1)) + '.png';
      if(value.cardImg) return value.cardImg;
      if(value.src && !String(value.src).startsWith('data:')) return value.src;
      return '';
    }
    const text = String(value || '').trim();
    if(!text || text === '[object Object]') return '';
    if(text.startsWith('data:')) return '';
    return text;
  }
  function pPhoto(p){
    const resolved = FO.profilePhoto ? FO.profilePhoto(p) : '';
    return compactPhotoValue(resolved)
      || compactPhotoValue(p?.profileImg)
      || compactPhotoValue(p?.photoURL)
      || compactPhotoValue(p?.img)
      || 'blank.png';
  }
  function pCrop(p, fallback='center 22%'){
    if(FO.profilePhotoCropStyle) return FO.profilePhotoCropStyle(p, fallback);
    return `width:100%;height:100%;object-fit:cover;object-position:${fallback};`;
  }
  async function profile(){ return await FO.syncPublicProfile().catch(()=>window.FATE_ONLINE?.profile || {}); }
  function hashSeed(str){
    let h = 2166136261;
    const s = String(str || 'fates');
    for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function makeSeededRng(seed){
    let a = hashSeed(seed) || 0x9e3779b9;
    return function(){
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function onlineStableHash(value){
    const json = typeof value === 'string' ? value : JSON.stringify(value || null);
    let h = 2166136261;
    for(let i=0;i<json.length;i++){ h ^= json.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
  function onlineFirebaseSafeValue(value, seen){
    if(value === undefined || value === null) return null;
    if(typeof value === 'function') return null;
    if(typeof value === 'number') return Number.isFinite(value) ? value : null;
    if(typeof value !== 'object') return value;
    if(value instanceof Set) return onlineFirebaseSafeValue(Array.from(value), seen);
    if(typeof Element !== 'undefined' && value instanceof Element) return null;
    if(typeof Date !== 'undefined' && value instanceof Date) return value.toISOString();
    const refs = seen || new WeakSet();
    if(refs.has(value)) return null;
    refs.add(value);
    if(Array.isArray(value)){
      const out = value.map(v => onlineFirebaseSafeValue(v, refs));
      refs.delete(value);
      return out;
    }
    const out = {};
    Object.keys(value).forEach(function(k){
      out[k] = onlineFirebaseSafeValue(value[k], refs);
    });
    refs.delete(value);
    return out;
  }
  function cloneOnlinePlain(value){
    return onlineFirebaseSafeValue(value);
  }
  function compactOnlineCard(card){
    if(!card) return null;
    const out = {};
    Object.keys(card).forEach(function(k){
      const v = card[k];
      if(typeof v === 'function') return;
      if(k === 'effect' || k === 'flavor') return;
      out[k] = cloneOnlinePlain(v);
    });
    return out;
  }
  function expandOnlineCard(card){
    if(!card) return null;
    const base = (typeof CARDS !== 'undefined' && Array.isArray(CARDS))
      ? CARDS.find(c => c && String(c.id) === String(card.id))
      : null;
    return Object.assign({}, base || {}, cloneOnlinePlain(card) || {});
  }
  function compactOnlineCardList(list){
    return Array.isArray(list) ? list.map(compactOnlineCard).filter(Boolean) : [];
  }
  function expandOnlineCardList(list){
    return Array.isArray(list) ? list.map(expandOnlineCard).filter(Boolean) : [];
  }
  function compactOnlineBoard(board){
    return Array.isArray(board) ? board.map(zone =>
      Array.isArray(zone) ? zone.map(row =>
        Array.isArray(row) ? row.map(compactOnlineCard) : []
      ) : []
    ) : [];
  }
  function expandOnlineBoard(board){
    return Array.isArray(board) ? board.map(zone =>
      Array.isArray(zone) ? zone.map(row =>
        Array.isArray(row) ? row.map(expandOnlineCard) : []
      ) : []
    ) : [];
  }
  function captureOnlineCanonicalState(sourceG){
    const g = sourceG || gameState();
    if(!g || !Array.isArray(g.players)) return null;
    const players = g.players.map(function(p){
      return {
        name:p?.name || '',
        color:p?.color || '',
        deck:compactOnlineCardList(p?.deck),
        hand:compactOnlineCardList(p?.hand),
        discard:compactOnlineCardList(p?.discard)
      };
    });
    const state = {
      v:2,
      players,
      board:compactOnlineBoard(g.board),
      extraCells:cloneOnlinePlain(g.extraCells),
      extraRows:cloneOnlinePlain(g.extraRows),
      extraRowFullOwners:cloneOnlinePlain(g.extraRowFullOwners),
      extraRowOwners:cloneOnlinePlain(g.extraRowOwners),
      markSafeSquares:cloneOnlinePlain(g.markSafeSquares),
      blockedCells:cloneOnlinePlain(g.blockedCells),
      immuneCards:cloneOnlinePlain(g.immuneCards),
      shieldWallZones:cloneOnlinePlain(g.shieldWallZones),
      fateModifiers:cloneOnlinePlain(g.fateModifiers),
      landscapeId:g.landscapeId || null,
      landscapeBgNum:g.landscapeBgNum || null,
      _landscapeState:cloneOnlinePlain(g._landscapeState),
      _landscapeDrawQueue:cloneOnlinePlain(g._landscapeDrawQueue),
      currentPlayer:g.currentPlayer,
      turn:g.turn,
      turnNumber:g.turnNumber,
      maxTurns:g.maxTurns,
      phase:g.phase,
      selectedHandCard:g.selectedHandCard,
      selectedBoardCard:g.selectedBoardCard,
      placing:!!g.placing,
      blockingCell:!!g.blockingCell,
      supportsPlacedThisTurn:g.supportsPlacedThisTurn,
      maxSupportsPerTurn:g.maxSupportsPerTurn,
      extraSupportsThisTurn:g.extraSupportsThisTurn,
      pendingEffect:cloneOnlinePlain(g.pendingEffect),
      instanceCounter:g.instanceCounter,
      damageDoneP:cloneOnlinePlain(g.damageDoneP),
      supportersSetP:cloneOnlinePlain(g.supportersSetP),
      _supporterEffectsActivatedP:cloneOnlinePlain(g._supporterEffectsActivatedP),
      _snowyVillageUses:cloneOnlinePlain(g._snowyVillageUses),
      _landscapeChangeLocks:cloneOnlinePlain(g._landscapeChangeLocks),
      _balladEffects:cloneOnlinePlain(g._balladEffects),
      _mailDeliveries:cloneOnlinePlain(g._mailDeliveries),
      _blameGameEffects:cloneOnlinePlain(g._blameGameEffects),
      un5thUses:cloneOnlinePlain(g.un5thUses),
      polishArmyUses:cloneOnlinePlain(g.polishArmyUses),
      oppSuppressedNextTurn:!!g.oppSuppressedNextTurn,
      suppressTarget:g.suppressTarget,
      erbsActive:cloneOnlinePlain(g.erbsActive),
      p1Deck:cloneOnlinePlain(g.p1Deck),
      p2Deck:cloneOnlinePlain(g.p2Deck),
      majaEffectThisTurn:!!g.majaEffectThisTurn,
      _artilleryLockedZone:g._artilleryLockedZone,
      _artilleryLockOwner:g._artilleryLockOwner,
      _artilleryLockTurnsLeft:g._artilleryLockTurnsLeft,
      _artilleryEffectBlockLifted:!!g._artilleryEffectBlockLifted,
      _cardFateMap:cloneOnlinePlain(g._cardFateMap),
      _continuousDamageSources:cloneOnlinePlain(g._continuousDamageSources),
      _fortCalvinActive:cloneOnlinePlain(g._fortCalvinActive),
      _linaFreeIids:cloneOnlinePlain(g._linaFreeIids),
      _polishUsedThisTurn:!!g._polishUsedThisTurn,
      _revealedCards:cloneOnlinePlain(g._revealedCards),
      _riveraBuffs:cloneOnlinePlain(g._riveraBuffs),
      _riveraActiveEffects:cloneOnlinePlain(g._riveraActiveEffects),
      _skipImprovisorCheck:!!g._skipImprovisorCheck,
      _skipReactions:!!g._skipReactions,
      pendingInteraction:cloneOnlinePlain(g.pendingInteraction),
      _serverReactionSeq:g._serverReactionSeq,
      _serverPendingReaction:cloneOnlinePlain(g._serverPendingReaction),
      _serverPendingModalAction:cloneOnlinePlain(g._serverPendingModalAction),
      _serverPendingZonePick:cloneOnlinePlain(g._serverPendingZonePick),
      _serverPendingMove:cloneOnlinePlain(g._serverPendingMove),
      _serverPendingCardPick:cloneOnlinePlain(g._serverPendingCardPick),
      _westCaribNext:cloneOnlinePlain(g._westCaribNext),
      _zimbabweUsedThisTurn:!!g._zimbabweUsedThisTurn,
      _consolidating:cloneOnlinePlain(g._consolidating),
      _wolfCreekMoving:cloneOnlinePlain(g._wolfCreekMoving),
      _expMoving:cloneOnlinePlain(g._expMoving),
      _berkeleyMoving:cloneOnlinePlain(g._berkeleyMoving),
      _bh01Moving:cloneOnlinePlain(g._bh01Moving),
      _landscapeMoving:cloneOnlinePlain(g._landscapeMoving),
      _busserMoving:cloneOnlinePlain(g._busserMoving),
      _busserMovingCard:cloneOnlinePlain(g._busserMovingCard),
      _markSelecting:cloneOnlinePlain(g._markSelecting),
      _havanoDeploying:cloneOnlinePlain(g._havanoDeploying),
      _boardTargeting:cloneOnlinePlain(g._boardTargeting)
    };
    return onlineFirebaseSafeValue(state);
  }
  function onlineCanonicalStateHash(state){
    return onlineStableHash(JSON.stringify(state || null));
  }
  function attachOnlinePostState(payload){
    const state = captureOnlineCanonicalState();
    if(!state) return payload;
    const safeState = onlineFirebaseSafeValue(state);
    payload.postState = safeState;
    payload.stateHash = onlineCanonicalStateHash(safeState);
    return payload;
  }
  function applyOnlineCanonicalState(state, reason){
    const g = gameState();
    if(!g || !state) return false;
    const previousLandscapeBgNum = Number(g.landscapeBgNum) || null;
    const keep = {
      _onlineRoomCode:g._onlineRoomCode,
      _onlineRole:g._onlineRole,
      _onlinePlayerIndex:g._onlinePlayerIndex,
      _isSpectator:g._isSpectator,
      localPlayerIndex:g.localPlayerIndex,
      viewerPlayerIndex:g.viewerPlayerIndex,
      _onlineSeed:g._onlineSeed,
      _onlineRoomMode:g._onlineRoomMode,
      _onlineGameSong:g._onlineGameSong,
      _onlineRng:g._onlineRng,
      _onlineActionLogMode:g._onlineActionLogMode,
      _onlineActionSeq:g._onlineActionSeq,
      _onlineAppliedActionSeq:g._onlineAppliedActionSeq,
      _onlineLagPauseActive:g._onlineLagPauseActive,
      _onlineApplyingRemoteAction:g._onlineApplyingRemoteAction,
      _onlineRemoteActionPlayer:g._onlineRemoteActionPlayer
    };
    g.players = (state.players || []).map(function(p, idx){
      return {
        name:p?.name || ('Player ' + (idx + 1)),
        color:p?.color || (idx === 0 ? 'var(--p1)' : 'var(--p2)'),
        deck:expandOnlineCardList(p?.deck),
        hand:expandOnlineCardList(p?.hand),
        discard:expandOnlineCardList(p?.discard)
      };
    });
    while(g.players.length < 2) g.players.push({name:'Player '+(g.players.length+1), deck:[], hand:[], discard:[], color:g.players.length===0?'var(--p1)':'var(--p2)'});
    g.board = expandOnlineBoard(state.board);
    [
      'extraCells','extraRows','extraRowFullOwners','extraRowOwners','markSafeSquares','blockedCells','immuneCards','shieldWallZones',
      'fateModifiers','landscapeId','landscapeBgNum','_landscapeState','_landscapeDrawQueue','currentPlayer','turn','turnNumber','maxTurns','phase','selectedHandCard','selectedBoardCard',
      'placing','blockingCell','supportsPlacedThisTurn','maxSupportsPerTurn','extraSupportsThisTurn','pendingEffect',
      'instanceCounter','damageDoneP','supportersSetP','_supporterEffectsActivatedP','_snowyVillageUses','_landscapeChangeLocks','_balladEffects','_mailDeliveries','_blameGameEffects','un5thUses','polishArmyUses','oppSuppressedNextTurn','suppressTarget','erbsActive',
      'p1Deck','p2Deck','majaEffectThisTurn','_artilleryLockedZone','_artilleryLockOwner','_artilleryLockTurnsLeft',
      '_artilleryEffectBlockLifted','_cardFateMap','_fortCalvinActive','_linaFreeIids','_polishUsedThisTurn',
      '_revealedCards','_riveraBuffs','_riveraActiveEffects','_skipImprovisorCheck','_skipReactions','pendingInteraction','_serverReactionSeq','_serverPendingReaction',
      '_serverPendingModalAction','_serverPendingZonePick','_serverPendingMove','_serverPendingCardPick','_westCaribNext',
      '_zimbabweUsedThisTurn','_consolidating','_wolfCreekMoving','_expMoving','_berkeleyMoving','_bh01Moving',
      '_landscapeMoving','_busserMoving','_busserMovingCard','_markSelecting','_havanoDeploying','_boardTargeting'
    ].forEach(function(k){
      if(Object.prototype.hasOwnProperty.call(state, k)) g[k] = cloneOnlinePlain(state[k]);
    });
    g._continuousDamageSources = new Set(Array.isArray(state._continuousDamageSources) ? state._continuousDamageSources : []);
    if(Array.isArray(g._linaFreeIids)) g._linaFreeIids = new Set(g._linaFreeIids);
    if(g._consolidating && Array.isArray(g._consolidating.colomboRestrictionZones)){
      g._consolidating.colomboRestrictionZones = new Set(g._consolidating.colomboRestrictionZones);
    }
    g.landscape = g.landscapeId && typeof LANDSCAPES !== 'undefined' ? LANDSCAPES[g.landscapeId] : null;
    Object.assign(g, keep);
    if(g.landscapeBgNum && typeof window.applyGameBackground === 'function') {
      const song = 'board' + g.landscapeBgNum;
      g._onlineGameSong = song;
      if(previousLandscapeBgNum && previousLandscapeBgNum !== Number(g.landscapeBgNum) && typeof window.transitionGameLandscape === 'function') {
        window.transitionGameLandscape(song, {remote:true});
      } else {
        window.applyGameBackground(song);
      }
    }
    if(typeof window.invalidateFateRenderCaches === 'function') window.invalidateFateRenderCaches();
    if(typeof window.renderGame === 'function') window.renderGame({force:true});
    else if(typeof window.renderBoard === 'function') window.renderBoard();
    if(typeof window.updateTopBar === 'function') window.updateTopBar();
    console.warn('Applied authoritative online state:', reason || 'state-sync');
    return true;
  }
  function reconcileOnlinePostState(action, reason){
    const payload = action?.payload || {};
    if(!payload.postState || !payload.stateHash) return false;
    const localState = captureOnlineCanonicalState();
    const localHash = onlineCanonicalStateHash(localState);
    if(localHash === payload.stateHash){
      setTimeout(maybeShowServerPendingPrompts, 0);
      return false;
    }
    const applied = applyOnlineCanonicalState(payload.postState, reason || ('post-action mismatch ' + (action?.seq || '')));
    if(applied) setTimeout(maybeShowServerPendingPrompts, 0);
    return applied;
  }
  function applyAuthoritativePostState(action, reason){
    const payload = action?.payload || {};
    if(!payload.postState || !payload.stateHash) return false;
    const hash = String(action?.serverStateHash || payload.stateHash || '');
    if(hash) lastAuthorityStateHash = hash;
    const applied = applyOnlineCanonicalState(payload.postState, reason || ('authoritative postState seq ' + (action?.seq || '?')));
    if(applied) setTimeout(maybeShowServerPendingPrompts, 0);
    return applied;
  }

  function acknowledgeAuthoritativeAction(action, reason){
    if(!action) return false;
    const type = String(action.type || '').toUpperCase();
    const payload = action.payload || {};
    const seq = Number(action.seq || 0) || 0;
    if(seq){
      lastActionSeq = Math.max(lastActionSeq, seq);
      const g = gameState();
      if(g) g._onlineActionSeq = lastActionSeq;
    }
    const hash = String(action.serverStateHash || payload.stateHash || '');
    if(hash) lastAuthorityStateHash = hash;
    if(shouldApplyServerStateDirectly(type, payload)){
      applyAuthoritativePostState(action, reason || ('authoritative acknowledgement seq ' + (seq || '?')));
    }else{
      setTimeout(maybeShowServerPendingPrompts, 0);
    }
    return true;
  }

  function reactionEscapeHtml(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    }[ch] || ch));
  }

  function reactionOptionLabel(option){
    const kind = String(option?.kind || '');
    if(kind === 'lydia') return 'Lydia';
    if(kind === 'secules') return 'Mr. Secules';
    if(kind === 'havano') return 'Havano Citizen';
    return option?.label || 'Reaction';
  }

  function maybeShowServerReactionPrompt(){
    const g = gameState();
    if(!isOnlineMatchState(g)) return;
    const pending = g._serverPendingReaction;
    if(!pending || typeof pending !== 'object') return;
    const localIndex = onlineLocalPlayerIndex();
    if(localIndex === null || Number(pending.playerIndex) !== localIndex) return;
    const promptId = String(pending.promptId || '');
    if(!promptId || g._onlineReactionPromptId === promptId) return;
    g._onlineReactionPromptId = promptId;
    const options = Array.isArray(pending.options) ? pending.options : [];
    const sourceName = pending.sourceName || 'that effect';
    let countdown = Math.max(5, Math.round(Number(pending.timeoutMs || 15000) / 1000));
    let timer = null;
    let finished = false;
    const basePayload = choice => ({
      playerIndex:localIndex,
      promptId,
      choice,
      baseStateHash:onlineCanonicalStateHash(captureOnlineCanonicalState()),
      clientActionId:'reaction:' + promptId + ':' + choice + ':' + Date.now()
    });
    const finish = (choice, optionIndex, deployment) => {
      if(finished) return;
      finished = true;
      if(timer) clearInterval(timer);
      const payload = basePayload(choice);
      if(Number.isInteger(optionIndex)){
        const option = options[optionIndex] || {};
        payload.optionIndex = optionIndex;
        payload.reaction = {
          kind:option.kind || '',
          z:option.z,
          r:option.r,
          c:option.c,
          card:option.card || null
        };
        if(deployment) payload.deployment = deployment;
      }
      try{ if(typeof window.closeModal === 'function') window.closeModal(); }catch(e){}
      sendAction('REACTION_CHOICE', payload).catch(err=>{
        console.warn('Server reaction choice failed', err);
        if(window.toast) toast('Reaction choice failed');
      });
    };
    const optionButtons = options.map((option, idx) => {
      const label = reactionOptionLabel(option);
      if(String(option?.kind || '') === 'havano'){
        const deployButtons = (Array.isArray(option.deploymentOptions) ? option.deploymentOptions : []).map((target, targetIdx) =>
          `<button class="reaction-choice-card" type="button" data-server-reaction-idx="${idx}" data-server-reaction-deploy="${targetIdx}">` +
            `<span class="reaction-choice-copy"><b>${reactionEscapeHtml(label)}</b><em>Negate and deploy</em><small>Zone ${Number(target.z) + 1}, Row ${Number(target.r) + 1}, Col ${Number(target.c) + 1}</small></span>` +
          `</button>`
        ).join('');
        return deployButtons || '';
      }
      const loc = Number.isInteger(Number(option.z)) ? `Zone ${Number(option.z) + 1}` : 'Board';
      return `<button class="reaction-choice-card" type="button" data-server-reaction-idx="${idx}">` +
        `<span class="reaction-choice-copy"><b>${reactionEscapeHtml(label)}</b><em>Negate ${reactionEscapeHtml(sourceName)}</em><small>${reactionEscapeHtml(loc)}</small></span>` +
      `</button>`;
    }).join('');
    const renderTitle = () => options.length > 1 ? `Choose Reaction (${countdown}s)` : `${reactionOptionLabel(options[0] || {})} - React? (${countdown}s)`;
    if(typeof window.showModal === 'function'){
      const prevBypass = window.__fateOnlineLocalModalBypass;
      window.__fateOnlineLocalModalBypass = true;
      try{
        window.showModal(
          renderTitle(),
          `<div class="reaction-panel reaction-choice-panel">` +
            `<div class="reaction-choice-head">` +
              `<div class="reaction-kicker">Improvisor Reaction</div>` +
              `<div class="reaction-prompt"><span>Opponent played</span><strong>${reactionEscapeHtml(sourceName)}</strong><span>${options.length > 1 ? 'Choose who responds.' : 'Negate it?'}</span></div>` +
            `</div>` +
            `<div class="reaction-choice-grid">${optionButtons}</div>` +
            `<div id="server-reaction-timer" class="reaction-timer">${countdown}s</div>` +
          `</div>` +
          [{label:'Allow', action:()=>finish('decline')}],
          {immediate:true}
        );
      }finally{
        window.__fateOnlineLocalModalBypass = prevBypass;
      }
      const modalBox = document.querySelector('#modal .modal');
      if(modalBox) modalBox.classList.add('reaction-choice-modal');
      setTimeout(()=>{
        document.querySelectorAll('#modal [data-server-reaction-idx]').forEach(btn=>{
          btn.addEventListener('click', ()=>{
            const idx = Number(btn.getAttribute('data-server-reaction-idx'));
            if(!Number.isInteger(idx)) return;
            const deployIdxRaw = btn.getAttribute('data-server-reaction-deploy');
            let deployment = null;
            if(deployIdxRaw !== null){
              const deployIdx = Number(deployIdxRaw);
              const option = options[idx] || {};
              const deployOptions = Array.isArray(option.deploymentOptions) ? option.deploymentOptions : [];
              deployment = Number.isInteger(deployIdx) ? deployOptions[deployIdx] || null : null;
            }
            finish('negate', idx, deployment);
          });
        });
      }, 0);
      timer = setInterval(()=>{
        countdown -= 1;
        const timerEl = document.getElementById('server-reaction-timer');
        if(timerEl) timerEl.textContent = countdown + 's';
        const titleEl = document.getElementById('modal-title');
        if(titleEl) titleEl.textContent = renderTitle();
        if(countdown <= 0) finish('timeout');
      }, 1000);
    } else {
      setTimeout(()=>finish('timeout'), Math.max(1000, Number(pending.timeoutMs || 15000)));
    }
  }
  function serverPendingCardMatchesFilters(card, pending){
    if(!card || !pending) return false;
    if(pending.filterType && String(card.type || '') !== String(pending.filterType)) return false;
    if(pending.filterAff && String(card.aff || '') !== String(pending.filterAff)) return false;
    if(pending.excludeRarity && String(card.rarity || '') === String(pending.excludeRarity)) return false;
    return true;
  }
  function serverPendingBoardCardCandidates(g, pending, playerIndex){
    const cards = [];
    const sourceIid = String(pending?.sourceIid || '');
    const board = Array.isArray(g?.board) ? g.board : [];
    board.forEach(zone=>{
      if(!Array.isArray(zone)) return;
      zone.forEach(row=>{
        if(!Array.isArray(row)) return;
        row.forEach(card=>{
          if(!card || Number(card.owner) !== Number(playerIndex)) return;
          if(sourceIid && String(card.iid || '') === sourceIid) return;
          if(!serverPendingCardMatchesFilters(card, pending)) return;
          cards.push(card);
        });
      });
    });
    return cards;
  }
  function serverPendingCardPickCandidates(g, pending){
    const playerIndex = Number(pending?.playerIndex);
    const player = Number.isInteger(playerIndex) ? g?.players?.[playerIndex] : null;
    if(!player) return [];
    const kind = String(pending?.kind || '');
    if(kind === 'handDiscard' || kind === 'handDiscardBoost'){
      return (Array.isArray(player.hand) ? player.hand : []).filter(card=>serverPendingCardMatchesFilters(card, pending));
    }
    if(kind === 'vigilantesExpendSupporters'){
      return serverPendingBoardCardCandidates(g, Object.assign({}, pending, {filterType:'Supporter'}), playerIndex);
    }
    const sources = String(pending?.source || 'deck').split('+').map(s=>s.trim()).filter(Boolean);
    const cards = [];
    sources.forEach(source=>{
      const pile = source === 'discard' ? player.discard : player.deck;
      if(!Array.isArray(pile)) return;
      pile.forEach(card=>{
        if(serverPendingCardMatchesFilters(card, pending)) cards.push(card);
      });
    });
    return cards;
  }
  function serverPendingCardPickTitle(pending){
    const reason = String(pending?.reason || pending?.kind || '');
    if(reason === 'ibStudent') return 'Search deck for a Supporter:';
    if(reason === 'crossroadsWorker') return 'Add a Supporter from discard to hand:';
    if(reason === 'greatOakHighSchooler') return 'Home of the Wolfpack';
    if(reason === 'handDiscard') return 'Discard cards';
    if(reason === 'handDiscardBoost') return 'Choose cards';
    if(reason === 'mailDelivery') return 'Mail Delivery';
    if(String(pending?.kind || '') === 'linaFreeSet') return 'Choose a Reality card';
    return 'Choose cards';
  }
  function serverPendingCardPickSubtitle(pending){
    const source = String(pending?.source || '');
    if(String(pending?.reason || '') === 'ibStudent'){
      const maxCount = Math.max(1, Number(pending?.maxCount || 1) || 1);
      const type = pending?.filterType || 'Supporter';
      return `From your deck - up to ${maxCount} ${type}(s)`;
    }
    if(source) return source === 'deck+discard' ? 'Search deck and discard' : 'From your ' + source;
    if(String(pending?.kind || '').startsWith('hand')) return 'From your hand';
    return 'Choose cards';
  }
  function serverPendingCardPickConfirmLabel(pending){
    const reason = String(pending?.reason || '');
    const kind = String(pending?.kind || '');
    if(reason === 'ibStudent' || reason === 'crossroadsWorker' || reason === 'greatOakHighSchooler') return 'Add to Hand';
    if(kind === 'handDiscard') return 'Discard';
    return 'Choose';
  }
  function maybeShowServerCardPickPrompt(){
    const g = gameState();
    if(!isOnlineMatchState(g)) return;
    const pending = g._serverPendingCardPick;
    if(!pending || typeof pending !== 'object'){
      g._onlineShownServerCardPickPromptId = '';
      return;
    }
    const localIndex = onlineLocalPlayerIndex();
    if(localIndex === null || Number(pending.playerIndex) !== localIndex) return;
    if(Number(g.currentPlayer) !== localIndex) return;
    if(typeof window.pickCardsVisual !== 'function') return;
    const promptKey = String(pending.promptId || '') || [
      pending.kind || 'cardPick',
      pending.reason || '',
      pending.sourceIid || '',
      g.turn || 0,
      localIndex
    ].join(':');
    if(g._onlineShownServerCardPickPromptId === promptKey) return;
    const cards = serverPendingCardPickCandidates(g, pending);
    const minCount = Math.max(0, Number(pending.minCount || 0) || 0);
    const maxCount = Math.max(minCount, Number(pending.maxCount || minCount || 1) || 1);
    g._onlineShownServerCardPickPromptId = promptKey;
    window.pickCardsVisual(cards, {
      title:serverPendingCardPickTitle(pending),
      subtitle:serverPendingCardPickSubtitle(pending),
      minCount,
      maxCount,
      confirmLabel:serverPendingCardPickConfirmLabel(pending)
    }, function(){});
  }
  function maybeShowServerPendingPrompts(){
    maybeShowServerReactionPrompt();
    maybeShowServerCardPickPrompt();
  }
  function pickSongForSeed(seed){
    const rng = makeSeededRng(String(seed || 'online') + ':song');
    return 'board' + (Math.floor(rng() * 12) + 1);
  }
  function gameState(){
    if(typeof window.getFateGameState === 'function') return window.getFateGameState();
    return window.FATE_GAME_STATE || null;
  }
  function isOnlineMatchState(g){
    return !!(g && g._onlineRoomCode && g._onlineActionLogMode);
  }
  function isOnlineBootstrapScreenActive(){
    try{
      return !!(
        document.getElementById('s-coin')?.classList.contains('active') ||
        document.getElementById('s-game')?.classList.contains('active') ||
        document.querySelector('.online-match-overview-modal')
      );
    }catch(e){
      return false;
    }
  }
  function roomPlayerIndexForUid(room, uid){
    if(!room || !uid) return null;
    if(room.hostUid === uid) return 0;
    if(room.guestUid === uid) return 1;
    return null;
  }
  function onlineLocalPlayerIndex(){
    const g = gameState();
    return Number.isInteger(g?._onlinePlayerIndex) ? g._onlinePlayerIndex : null;
  }
  function onlineActionPlayer(action){
    const payload = action?.payload || {};
    const roomIndex = roomPlayerIndexForUid(lastLobbyRoom, action?.uid);
    if(roomIndex !== null && roomIndex !== undefined) return roomIndex;
    if(Number.isInteger(payload.playerIndex)) return payload.playerIndex;
    return null;
  }
  function selectedHandSnapshot(g, playerIndex = null, explicitCard = null){
    const cp = Number.isInteger(playerIndex) ? playerIndex : g?.currentPlayer;
    let idx = g?.selectedHandCard;
    let card = Number.isInteger(idx) ? g?.players?.[cp]?.hand?.[idx] : null;
    if(explicitCard && (!card || card.iid !== explicitCard.iid)){
      const hand = g?.players?.[cp]?.hand || [];
      idx = hand.findIndex(c=>c && explicitCard.iid && c.iid === explicitCard.iid);
      if(idx < 0) idx = hand.findIndex(c=>c && c.id === explicitCard.id);
      card = idx >= 0 ? hand[idx] : null;
    }
    return card ? { index:idx, iid:card.iid || '', id:card.id || '' } : null;
  }
  function restoreSelectedHand(g, playerIndex, selected){
    if(!g || !selected || !g.players?.[playerIndex]?.hand) return false;
    const hand = g.players[playerIndex].hand;
    let idx = -1;
    if(selected.iid) idx = hand.findIndex(c=>c && c.iid === selected.iid);
    if(idx < 0 && selected.id) idx = hand.findIndex(c=>c && c.id === selected.id);
    if(idx < 0 && Number.isInteger(selected.index) && hand[selected.index]) idx = selected.index;
    if(idx < 0) return false;
    g.selectedHandCard = idx;
    return true;
  }
  function onlineCellActionPending(g){
    return !!(g && (
      g.placing ||
      g._consolidating ||
      g._serverPendingReaction ||
      g._havanoDeploying ||
      g._boardTargeting ||
      g.blockingCell ||
      g._markSelecting ||
      g._busserMoving ||
      g._berkeleyMoving ||
      g._bh01Moving ||
      g._wolfCreekMoving ||
      g._busserMovingCard ||
      g._expMoving
    ));
  }
  function onlineFunctionPositionPayload(g, args){
    const maybeZ = args[1], maybeR = args[2], maybeC = args[3];
    if(Number.isInteger(maybeZ) && Number.isInteger(maybeR) && Number.isInteger(maybeC)){
      const card = g?.board?.[maybeZ]?.[maybeR]?.[maybeC] || args[0] || null;
      return { z:maybeZ, r:maybeR, c:maybeC, cardIid:card?.iid || '', cardId:card?.id || '' };
    }
    const argCard = args && args[0] && typeof args[0] === 'object' ? args[0] : null;
    if(argCard && typeof window.findBoardPositionForCard === 'function'){
      const found = window.findBoardPositionForCard(argCard);
      if(found && Number.isInteger(found.z) && Number.isInteger(found.r) && Number.isInteger(found.c)){
        const card = g?.board?.[found.z]?.[found.r]?.[found.c] || argCard;
        return { z:found.z, r:found.r, c:found.c, cardIid:card?.iid || '', cardId:card?.id || '' };
      }
    }
    const selected = g?.selectedBoardCard || null;
    if(selected && Number.isInteger(selected.z) && Number.isInteger(selected.r) && Number.isInteger(selected.c)){
      const card = g?.board?.[selected.z]?.[selected.r]?.[selected.c] || selected.card || argCard || null;
      if(card) return { z:selected.z, r:selected.r, c:selected.c, cardIid:card?.iid || '', cardId:card?.id || '' };
    }
    return null;
  }
  function cardIdentity(card){
    return card ? { iid:card.iid || '', id:card.id || '', name:card.name || '' } : null;
  }
  function cardMatchesIdentity(card, ident){
    if(!card || !ident) return false;
    if(ident.iid && card.iid === ident.iid) return true;
    return !!(ident.id && card.id === ident.id && (!ident.name || card.name === ident.name));
  }
  function boardSelectionPayload(entry){
    return entry ? { z:entry.z, r:entry.r, c:entry.c, card:cardIdentity(entry.card) } : null;
  }
  function boardEffectCinematicPayload(g, z, r, c){
    if(!g || !Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return null;
    const card = g.board?.[z]?.[r]?.[c] || null;
    if(!card) return null;
    return {z, r, c, card:cardIdentity(card)};
  }
  function selectedBoardEffectCinematicPayload(g){
    const sel = g && g.selectedBoardCard ? g.selectedBoardCard : null;
    if(!sel) return null;
    return boardEffectCinematicPayload(g, sel.z, sel.r, sel.c);
  }
  async function showPayloadEffectCinematic(g, payload, source){
    const fx = payload && (payload.effectCinematic || payload);
    if(!fx || typeof window.showEffectActivationCinematic !== 'function') return false;
    const card = g?.board?.[fx.z]?.[fx.r]?.[fx.c] || null;
    if(!card) return false;
    await window.showEffectActivationCinematic(card, {remote:true, source:source || 'online-payload-effect-cinematic'});
    return true;
  }
  function findBoardEntryForPayload(entries, payload){
    if(!payload) return null;
    return (entries || []).find(entry =>
      entry &&
      entry.z === payload.z &&
      entry.r === payload.r &&
      entry.c === payload.c &&
      (!payload.card || cardMatchesIdentity(entry.card, payload.card))
    ) || null;
  }
  function onlineTurnError(){
    if(window.toast) toast('Waiting for opponent');
  }
  function makeOptimisticActionId(type){
    optimisticActionCounter = (optimisticActionCounter + 1) % 1000000;
    const uid = window.FATE_ONLINE?.user?.uid || 'local';
    return [uid, Date.now(), optimisticActionCounter, String(type || 'ACTION')].join(':');
  }
  function rememberOptimisticAction(id){
    if(!id) return;
    optimisticAppliedActionIds.add(id);
    if(optimisticAppliedActionIds.size > 120){
      const first = optimisticAppliedActionIds.values().next().value;
      optimisticAppliedActionIds.delete(first);
    }
  }
  function optimisticActionIdFor(action){
    return String(action?.clientActionId || action?.payload?.clientActionId || '');
  }
  function enqueueOptimisticSend(task){
    const run = optimisticSendQueue.catch(()=>{}).then(task);
    optimisticSendQueue = run.catch(()=>{});
    return run;
  }
  function discardBufferedActionsThrough(seq){
    const through = Number(seq || 0) || 0;
    if(!through || !actionReplayBuffer.size) return;
    actionReplayBuffer.forEach((value, key)=>{
      if(Number(key || 0) <= through) actionReplayBuffer.delete(key);
    });
    const perf = window.__fatePerf = window.__fatePerf || {};
    perf.onlineBufferedActions = actionReplayBuffer.size;
    perf.onlineWaitingForActionSeq = actionReplayBuffer.size ? lastAppliedActionSeq + 1 : 0;
  }
  async function resyncRejectedOnlineActionFromFly(code, reason){
    if(!code || !authorityHttpBaseUrl() || firebaseActionFallbackAllowed()) return false;
    authorityRejectedResyncAttempts += 1;
    authorityLastRejectedResyncReason = String(reason || 'rejected action');
    try{
      const after = Math.max(0, Number(lastAppliedActionSeq || 0) || 0);
      const data = await flyApiJson(`/api/rooms/${encodeURIComponent(code)}/resume?after=${after}&limit=500&includeState=1`);
      const room = normalizeFlyRoom(data.room);
      if(room.roomCode){
        lastLobbyRoom = room;
        lastLobbyPlayers = room.players;
      }
      const serverSeq = Number(data?.lastSeq || room.lastActionSeq || 0) || 0;
      const stateHash = String(data?.serverStateHash || data?.canonicalHash || room.canonicalHash || '');
      if(stateHash) lastAuthorityStateHash = stateHash;
      const events = Array.isArray(data?.events) ? data.events : [];
      events.forEach(item=>{
        const action = item?.action || item?.accepted?.action || item;
        bufferOnlineAction(action);
      });
      if(events.length) await actionReplayQueue.catch(()=>{});

      const canonicalState = data?.canonicalState || null;
      if(canonicalState && stateHash){
        const syncAction = {
          seq:serverSeq || lastAppliedActionSeq || lastActionSeq,
          type:'STATE_SYNC',
          payload:{
            postState:canonicalState,
            stateHash
          }
        };
        reconcileOnlinePostState(syncAction, 'fly rejected action rollback: ' + (reason || 'unknown'));
        lastActionSeq = Math.max(lastActionSeq, serverSeq);
        lastAppliedActionSeq = Math.max(lastAppliedActionSeq, serverSeq);
        discardBufferedActionsThrough(lastAppliedActionSeq);
        const current = gameState();
        if(current){
          current._onlineActionSeq = lastActionSeq;
          current._onlineAppliedActionSeq = lastAppliedActionSeq;
          current._onlineLagPauseActive = false;
        }
        reportActionProgress(lastAppliedActionSeq, {force:true});
        if(typeof evaluateLagPause === 'function') evaluateLagPause();
        authorityLastCatchupSeq = Math.max(authorityLastCatchupSeq, serverSeq);
        authorityRejectedResyncSuccesses += 1;
        return true;
      }
      if(serverSeq > lastActionSeq) lastActionSeq = serverSeq;
      const g = gameState();
      if(g){
        g._onlineActionSeq = Math.max(g._onlineActionSeq || 0, lastActionSeq);
        if(events.length) g._onlineLagPauseActive = false;
      }
      authorityLastCatchupSeq = Math.max(authorityLastCatchupSeq, serverSeq);
      authorityRejectedResyncSuccesses += 1;
      if(events.length){
        reportActionProgress(lastAppliedActionSeq, {force:true});
        if(typeof evaluateLagPause === 'function') evaluateLagPause();
      }
      return events.length > 0;
    }catch(e){
      authorityRejectedResyncFailures += 1;
      authorityLastRejectedResyncReason = e && e.message || String(e);
      console.warn('Fly rejected-action resync failed', e);
      return false;
    }
  }
  async function resyncRejectedOnlineAction(reason){
    const g = gameState();
    const code = g?._onlineRoomCode || activeRoom;
    if(code && authorityHttpBaseUrl() && !firebaseActionFallbackAllowed()){
      const ok = await resyncRejectedOnlineActionFromFly(code, reason);
      if(ok) return true;
      return false;
    }
    if(!code || !FO.get || !FO.ref || !FO.rtdb) return false;
    const snap = await FO.get(cappedRoomActionsRef(code, 1)).catch(()=>null);
    const actions = Object.values(snap?.val() || {})
      .filter(a => a && a.payload && a.payload.postState && a.payload.stateHash)
      .sort((a,b)=>(Number(b.seq || 0) || 0) - (Number(a.seq || 0) || 0));
    const latest = actions[0];
    if(!latest) return false;
    const seq = Number(latest.seq || 0) || 0;
    if(seq) {
      lastActionSeq = Math.max(lastActionSeq, seq);
      lastAppliedActionSeq = Math.max(lastAppliedActionSeq, seq);
    }
    reconcileOnlinePostState(latest, 'rejected action rollback: ' + (reason || latest.type || 'unknown'));
    const current = gameState();
    if(current) {
      current._onlineActionSeq = lastActionSeq;
      current._onlineAppliedActionSeq = lastAppliedActionSeq;
      current._onlineLagPauseActive = false;
    }
    reportActionProgress(lastAppliedActionSeq, {force:true});
    if(typeof evaluateLagPause === 'function') evaluateLagPause();
    return true;
  }
  function scheduleOptimisticCorrection(reason){
    const g = gameState();
    if(g) g._onlineLagPauseActive = true;
    if(String(reason || '').toUpperCase() === 'CHOOSE_TURN'){
      if(window.toast) toast('Turn choice is still syncing. Stay in the match.');
      console.warn('Online turn-choice sync failed without forcing a reload.');
      return;
    }
    if(window.toast) toast('Network rejected an action. Pausing match sync.');
    console.warn('Online optimistic action rejected without forcing a disconnect reload:', reason);
    resyncRejectedOnlineAction(reason).then(ok=>{
      if(ok) return;
      setTimeout(()=>{
        const latest = gameState();
        if(latest) latest._onlineLagPauseActive = false;
        if(typeof evaluateLagPause === 'function') evaluateLagPause();
      }, 2500);
    }).catch(e=>{
      console.warn('Rejected online action resync failed', e);
      setTimeout(()=>{
        const latest = gameState();
        if(latest) latest._onlineLagPauseActive = false;
        if(typeof evaluateLagPause === 'function') evaluateLagPause();
      }, 2500);
    });
  }
  function isTurnBoundaryOnlineAction(actionOrType){
    const type = typeof actionOrType === 'string'
      ? actionOrType
      : String(actionOrType?.type || '');
    if(type === 'ACTION_RESULT'){
      const actionKind = typeof actionOrType === 'string'
        ? ''
        : String(actionOrType?.payload?.actionKind || '');
      return /^(END_TURN|CHOOSE_TURN|FORFEIT|MATCH_RESULT)$/i.test(actionKind);
    }
    return /^(MATCH_START|CHOOSE_TURN|END_TURN|FORFEIT)$/i.test(type);
  }
  function noteTurnBoundaryAction(action){
    if(!isTurnBoundaryOnlineAction(action)) return;
    lastTurnBoundaryActionSeq = Math.max(lastTurnBoundaryActionSeq, Number(action?.seq || 0) || 0);
  }
  function waitOnlineActionSettle(type){
    const frames = /^(CLICK_CELL|BOARD_ACTION|HAND_ACTION|MODAL_ACTION|PICK_CARDS_VISUAL|PICK_ZONE|PICK_AFFILIATION|PICK_LANDSCAPE_ZONE)$/i.test(String(type || '')) ? 4 : 2;
    return new Promise(resolve=>{
      if(typeof requestAnimationFrame !== 'function'){
        setTimeout(resolve, frames * 18);
        return;
      }
      let left = frames;
      const step = ()=>{
        left -= 1;
        if(left <= 0) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
  function isStrictCompactAuthorityAction(type){
    if(clientResolvedGameplayEnabled()) return false;
    if(firebaseActionFallbackAllowed()) return false;
    const strictAuthority = String(authorityReducerMode || '').toLowerCase() === 'strict'
      || authorityOnlyMode()
      || rtdbDisabledMode()
      || window.FATE_HOSTED_FLY_GAME === true;
    if(!strictAuthority) return false;
    return /^(END_TURN|CHOOSE_TURN|START_CONSOLIDATE|CLICK_CELL|PLACE_CARD|SELECT_CONSOLIDATION_TRIBUTE|SELECT_PENDING_MOVE_CELL|SELECT_BOARD_TARGET|BOARD_ACTION|HAND_ACTION|MODAL_ACTION|RESOLVE_MODAL|PICK_CARDS_VISUAL|RESOLVE_CARD_PICK|PICK_ZONE|PICK_LANDSCAPE_ZONE|RESOLVE_ZONE_PICK|PICK_AFFILIATION|RESOLVE_AFFILIATION_PICK|REACTION_CHOICE|FORFEIT|MATCH_RESULT)$/i.test(String(type || ''));
  }
  function strictCompactActionNeedsPostState(type, payload){
    const actionType = String(type || '').toUpperCase();
    return isStrictCompactAuthorityAction(type)
      && (
        /^(START_CONSOLIDATE|BOARD_ACTION|HAND_ACTION|MODAL_ACTION|PICK_CARDS_VISUAL|PICK_ZONE|PICK_LANDSCAPE_ZONE|PICK_AFFILIATION|REACTION_CHOICE)$/i.test(actionType)
        || (actionType === 'CLICK_CELL' && !(payload && payload.placing))
      );
  }
  function shouldApplyServerStateDirectly(actionType, payload){
    if(String(actionType || '').toUpperCase() === 'ACTION_RESULT'){
      return clientResolvedGameplayEnabled() && !!payload && !!payload.postState && !!payload.stateHash;
    }
    return isStrictCompactAuthorityAction(actionType)
      && !!payload
      && !!payload.postState
      && !!payload.stateHash
      && !firebaseActionFallbackAllowed();
  }
  function normalizedClientPendingInteraction(g){
    if(!g || typeof g !== 'object') return null;
    if(g.pendingInteraction && typeof g.pendingInteraction === 'object') return g.pendingInteraction;
    if(g._serverPendingReaction) return {kind:'reaction', bucket:'reaction', playerIndex:g._serverPendingReaction.playerIndex, promptId:g._serverPendingReaction.promptId || ''};
    if(g._serverPendingModalAction) return {kind:g._serverPendingModalAction.kind || 'modalAction', bucket:'modalAction', playerIndex:g._serverPendingModalAction.playerIndex, promptId:g._serverPendingModalAction.promptId || ''};
    if(g._serverPendingZonePick) return {kind:g._serverPendingZonePick.kind || 'zonePick', bucket:'zonePick', playerIndex:g._serverPendingZonePick.playerIndex, promptId:g._serverPendingZonePick.promptId || ''};
    if(g._serverPendingMove) return {kind:g._serverPendingMove.kind || 'move', bucket:'move', playerIndex:g._serverPendingMove.playerIndex, promptId:g._serverPendingMove.promptId || ''};
    if(g._serverPendingCardPick) return {kind:g._serverPendingCardPick.kind || 'cardPick', bucket:'cardPick', playerIndex:g._serverPendingCardPick.playerIndex, promptId:g._serverPendingCardPick.promptId || ''};
    if(g._consolidating) return {kind:g._consolidating.kind || 'consolidation', bucket:'consolidation', playerIndex:g._consolidating.playerIndex ?? g.currentPlayer, promptId:g._consolidating.promptId || ''};
    return null;
  }
  function toAuthorityIntent(type, payload, g){
    const actionType = String(type || '').toUpperCase();
    if(/^(PLACE_CARD|SELECT_CONSOLIDATION_TRIBUTE|SELECT_PENDING_MOVE_CELL|SELECT_BOARD_TARGET|RESOLVE_MODAL|RESOLVE_CARD_PICK|RESOLVE_ZONE_PICK|RESOLVE_AFFILIATION_PICK|CHOOSE_TURN|END_TURN|FORFEIT|MATCH_RESULT|START_CONSOLIDATE|BOARD_ACTION|HAND_ACTION|REACTION_CHOICE)$/i.test(actionType)){
      return actionType;
    }
    if(actionType === 'CLICK_CELL'){
      const pending = normalizedClientPendingInteraction(g || gameState());
      const bucket = String(pending?.bucket || pending?.kind || '');
      if(bucket === 'consolidation' || bucket === 'consolidate') return 'SELECT_CONSOLIDATION_TRIBUTE';
      if(bucket === 'move' || bucket === 'pickMove') return 'SELECT_PENDING_MOVE_CELL';
      if(payload?.placing || payload?.selectedHand || Number.isInteger(Number(payload?.handIndex)) || g?.placing) return 'PLACE_CARD';
      return 'SELECT_BOARD_TARGET';
    }
    if(actionType === 'MODAL_ACTION') return 'RESOLVE_MODAL';
    if(actionType === 'PICK_CARDS_VISUAL') return 'RESOLVE_CARD_PICK';
    if(actionType === 'PICK_ZONE' || actionType === 'PICK_LANDSCAPE_ZONE') return 'RESOLVE_ZONE_PICK';
    if(actionType === 'PICK_AFFILIATION') return 'RESOLVE_AFFILIATION_PICK';
    return actionType;
  }
  function strictAuthorityIntentForSend(type, payload, g){
    const actionType = String(type || '').toUpperCase();
    if(!isStrictCompactAuthorityAction(actionType)) return actionType;
    return toAuthorityIntent(actionType, payload || null, g || gameState());
  }
  function actionMatchesPendingInteraction(type, pending){
    const rawType = String(type || '').toUpperCase();
    const bucket = String(pending?.bucket || pending?.kind || '');
    let actionType = toAuthorityIntent(type, null, gameState());
    if(rawType === 'CLICK_CELL'){
      if(bucket === 'consolidation' || bucket === 'consolidate') actionType = 'SELECT_CONSOLIDATION_TRIBUTE';
      else if(bucket === 'move' || bucket === 'pickMove') actionType = 'SELECT_PENDING_MOVE_CELL';
      else actionType = 'PLACE_CARD';
    }
    if(!bucket) return true;
    if(bucket === 'reaction' || bucket === 'reactionChoice') return actionType === 'REACTION_CHOICE';
    if(bucket === 'modalAction' || bucket === 'modal') return actionType === 'RESOLVE_MODAL' || actionType === 'RESOLVE_AFFILIATION_PICK';
    if(bucket === 'zonePick' || bucket === 'pickZone') return actionType === 'RESOLVE_ZONE_PICK';
    if(bucket === 'move' || bucket === 'pickMove') return actionType === 'SELECT_PENDING_MOVE_CELL';
    if(bucket === 'cardPick' || bucket === 'pickCards') return actionType === 'RESOLVE_CARD_PICK';
    if(bucket === 'consolidation' || bucket === 'consolidate') return actionType === 'SELECT_CONSOLIDATION_TRIBUTE';
    return false;
  }
  function pendingInteractionLabel(pending){
    return String(pending?.message || pending?.kind || pending?.bucket || 'effect');
  }
  function shouldRunForcedSyncForRoomSeq(roomSeq){
    const seq = Number(roomSeq || 0) || 0;
    if(seq <= 1) return true;
    return seq <= lastTurnBoundaryActionSeq;
  }
  function hasPendingAuthorityReplay(){
    const g = gameState();
    const knownSeq = Math.max(Number(lastActionSeq || 0) || 0, Number(g?._onlineActionSeq || 0) || 0);
    const appliedSeq = Math.max(Number(lastAppliedActionSeq || 0) || 0, Number(g?._onlineAppliedActionSeq || 0) || 0);
    return knownSeq > appliedSeq || actionReplayBuffer.size > 0;
  }
  function needsAuthorityCatchupBeforeLocal(type){
    return clientResolvedGameplayEnabled()
      && isClientResolvedGameplayAction(type)
      && !!authorityHttpBaseUrl()
      && !firebaseActionFallbackAllowed()
      && hasPendingAuthorityReplay();
  }
  async function preflightAuthorityCatchupBeforeLocal(type){
    const code = gameState()?._onlineRoomCode || activeRoom;
    if(!code || !needsAuthorityCatchupBeforeLocal(type)) return false;
    return await catchUpFlyAuthorityReplay(code, 'before local optimistic ' + String(type || '').toUpperCase());
  }
  function sendOptimisticAction(type, payload, applyLocal){
    const clientActionId = makeOptimisticActionId(type);
    const outbound = Object.assign({}, payload || {}, { clientActionId });
    const clientResolvedCommit = clientResolvedGameplayEnabled() && isClientResolvedGameplayAction(type);
    const compactAuthorityPayload = !clientResolvedCommit && isStrictCompactAuthorityAction(type);
    let localResult;
    let localApplied = false;
    let finishLocalCommit = null;
    function stampBaseStateHash(){
      if(clientResolvedCommit){
        const baseStateHash = lastAuthorityStateHash || '';
        if(baseStateHash) outbound.baseStateHash = baseStateHash;
        return;
      }
      if(outbound.baseStateHash) return;
      const baseState = captureOnlineCanonicalState();
      const baseStateHash = lastAuthorityStateHash || (baseState ? onlineCanonicalStateHash(baseState) : '');
      if(baseStateHash) outbound.baseStateHash = baseStateHash;
    }
    function sendAuthorityNow(){
      return enqueueOptimisticSend(()=>{
        stampBaseStateHash();
        const finish = clientResolvedCommit ? noteClientResolvedCommitStart() : null;
        return Promise.resolve(sendAction(clientResolvedCommit ? 'ACTION_RESULT' : type, outbound))
          .finally(()=>{ if(finish) finish(); });
      }).catch(e=>{
        console.error('Online optimistic action send failed', e, type, outbound);
        if(localApplied) scheduleOptimisticCorrection(type);
        if(window.toast) toast(e && e.message ? e.message : 'Action failed');
      });
    }
    async function sendAfterLocalApply(){
      try{
        if(compactAuthorityPayload && !strictCompactActionNeedsPostState(type, outbound)) return sendAuthorityNow();
        if(localResult && typeof localResult.then === 'function') await localResult;
        await waitOnlineActionSettle(type);
        if(clientResolvedCommit) outbound.actionKind = String(type || '').toUpperCase();
        attachOnlinePostState(outbound);
        if(finishLocalCommit){
          finishLocalCommit();
          finishLocalCommit = null;
        }
      }catch(e){
        if(finishLocalCommit){
          finishLocalCommit();
          finishLocalCommit = null;
        }
        console.error('Optimistic local action failed before sync', e, type, outbound);
        if(localApplied) scheduleOptimisticCorrection(type);
        else if(window.toast) toast('Action failed');
        return;
      }
      return sendAuthorityNow();
    }
    function scheduleFollowupStateSync(delayMs){
      if(clientResolvedCommit) return;
      if(compactAuthorityPayload) return;
      if(configuredAuthorityUrl() && !firebaseActionFallbackAllowed()) return;
      const g = gameState();
      if(!isOnlineMatchState(g) || g._onlineApplyingRemoteAction) return;
      if(!Number.isInteger(g._onlinePlayerIndex)) return;
      if(onlineStateSyncTimer) clearTimeout(onlineStateSyncTimer);
      onlineStateSyncTimer = setTimeout(function(){
        onlineStateSyncTimer = null;
        const latest = gameState();
        if(!isOnlineMatchState(latest) || latest._onlineApplyingRemoteAction || !Number.isInteger(latest._onlinePlayerIndex)) return;
        const syncPayload = {
          playerIndex:latest._onlinePlayerIndex,
          currentPlayer:latest.currentPlayer,
          turn:latest.turn,
          sourceType:type,
          sourceClientActionId:clientActionId,
          baseStateHash:lastAuthorityStateHash || ''
        };
        try{ attachOnlinePostState(syncPayload); }catch(e){ console.warn('Could not capture delayed online state sync', e); return; }
        sendAction('STATE_SYNC', syncPayload).catch(e=>console.error('Online state sync send failed', e));
      }, delayMs);
    }
    function applyLocalAndSend(){
      if(compactAuthorityPayload) stampBaseStateHash();
      finishLocalCommit = clientResolvedCommit ? noteClientResolvedLocalCommitStart() : null;
      if(typeof applyLocal === 'function'){
        try{
          rememberOptimisticAction(clientActionId);
          localApplied = true;
          localResult = applyLocal();
        }catch(e){
          if(finishLocalCommit) finishLocalCommit();
          optimisticAppliedActionIds.delete(clientActionId);
          console.error('Optimistic local action threw', e, type, outbound);
          throw e;
        }
      }
      Promise.resolve(sendAfterLocalApply()).finally(()=>{ if(finishLocalCommit) finishLocalCommit(); });
      scheduleClientResolvedAutoCommit('post-local-' + String(type || '').toLowerCase(), 700);
      scheduleFollowupStateSync(1250);
      return localResult;
    }
    const latestBeforeLocal = gameState();
    if(isOnlineMatchState(latestBeforeLocal) && !canSendLocalAction(latestBeforeLocal, type)) return;
    if(needsAuthorityCatchupBeforeLocal(type)){
      return preflightAuthorityCatchupBeforeLocal(type)
        .then(ok=>{
          if(ok === false){
            if(window.toast) toast('Match is syncing. Please try again.');
            return;
          }
          return applyLocalAndSend();
        });
    }
    return applyLocalAndSend();
  }

  function sendBootstrapStateSync(reason){
    const latest = gameState();
    if(!isOnlineMatchState(latest) || latest._onlineApplyingRemoteAction || !Number.isInteger(latest._onlinePlayerIndex)) return;
    const syncPayload = {
      playerIndex:latest._onlinePlayerIndex,
      currentPlayer:latest.currentPlayer,
      turn:latest.turn,
      sourceType:'BOOTSTRAP',
      sourceReason:String(reason || 'online-start')
    };
    try{ attachOnlinePostState(syncPayload); }catch(e){ console.warn('Could not capture bootstrap online state sync', e); return; }
    sendAction('STATE_SYNC', syncPayload).catch(e=>console.warn('Bootstrap online state sync failed', e));
  }

  function canSendLocalAction(g, type){
    if(!isOnlineMatchState(g)) return false;
    if(g._onlineApplyingRemoteAction) return false;
    const actionType = String(type || '').toUpperCase();
    if(g._isSpectator || g._onlineRole === 'spectator' || !Number.isInteger(g._onlinePlayerIndex)){
      if(window.toast) toast('Spectators cannot take game actions.');
      return false;
    }
    if(clientResolvedGameplayEnabled() && clientResolvedLocalCommitPending > 0){
      recordOnlineDiagnostic('client-resolved-action-waiting-for-commit', {
        actionType,
        localPending:clientResolvedLocalCommitPending,
        commitInFlight:clientResolvedCommitInFlight
      });
      if(window.toast) toast('Finishing previous action.');
      return false;
    }
    if(g._onlineLagPauseActive){
      if(clientResolvedGameplayEnabled()){
        g._onlineLagPauseActive = false;
        setLagPause(false);
        recordOnlineDiagnostic('client-resolved-cleared-lag-pause', {actionType});
      }else{
        if(window.toast) toast('Match is syncing. Please wait.');
        return false;
      }
    }
    if(g._onlineMatchPlayable === false){
      g._onlineMatchPlayable = true;
      setOnlinePlayableWaitVisible(false);
      recordOnlineDiagnostic('playable-gate-auto-opened', {
        roomCode:String(g._onlineRoomCode || activeRoom || '').toUpperCase(),
        actionType
      });
    }
    const pending = normalizedClientPendingInteraction(g);
    if(pending){
      const pendingPlayer = Number(pending.playerIndex);
      if(Number.isInteger(pendingPlayer) && pendingPlayer !== Number(g._onlinePlayerIndex)){
        return false;
      }
      if(actionType && !actionMatchesPendingInteraction(actionType, pending)){
        const bucket = String(pending?.bucket || pending?.kind || '');
        if(bucket === 'cardPick' || bucket === 'pickCards'){
          g._onlineShownServerCardPickPromptId = '';
          setTimeout(maybeShowServerCardPickPrompt, 0);
        }
        return false;
      }
    }
    const turnAgnosticAction = /^(CHOOSE_TURN|REACTION_CHOICE)$/i.test(actionType);
    if(!turnAgnosticAction && Number(g.currentPlayer) !== Number(g._onlinePlayerIndex)){
      onlineTurnError();
      return false;
    }
    return true;
  }
  async function withLegacyRemoteReplayAction(fn, playerIndex){
    const g = gameState();
    let prevRemoteActionPlayer = null;
    if(g){
      prevRemoteActionPlayer = g._onlineRemoteActionPlayer;
      g._onlineApplyingRemoteAction = true;
      g._onlineRemoteActionPlayer = Number.isInteger(playerIndex) ? playerIndex : null;
    }
    try{
      return await fn();
    }finally{
      if(g){
        g._onlineApplyingRemoteAction = false;
        g._onlineRemoteActionPlayer = prevRemoteActionPlayer;
      }
    }
  }
  function updateRoomTurn(playerIndex){
    const code = gameState()?._onlineRoomCode || activeRoom;
    const room = lastLobbyRoom;
    const uid = playerIndex === 0 ? room?.hostUid : room?.guestUid;
    if(roomUsesFly(code)) return;
    if(!code || !uid || !FO.update) return;
    FO.update(FO.ref(FO.rtdb), {
      [`rooms/${code}/currentTurnUid`]: uid,
      [`rooms/${code}/updatedAt`]: FO.serverTimestamp()
    }).catch(()=>{});
  }
  function isGameScreenActive(){
    try{ return !!document.getElementById('s-game')?.classList.contains('active'); }catch(e){ return false; }
  }
  function isCoinScreenActive(){
    try{ return !!document.getElementById('s-coin')?.classList.contains('active'); }catch(e){ return false; }
  }
  async function publishTurnChoiceFallback(code, payload, u){
    if(roomUsesFly(code)) return false;
    if(!code || !u || !FO.update || !FO.ref || !FO.rtdb) return false;
    const choice = {
      roomCode:code,
      uid:u.uid,
      playerIndex:Number(payload?.playerIndex),
      goFirst:!!payload?.goFirst,
      clientActionId:String(payload?.clientActionId || ''),
      createdAt:FO.serverTimestamp(),
      clientAt:Date.now()
    };
    await FO.update(FO.ref(FO.rtdb), {
      [`rooms/${code}/players/${u.uid}/turnChoice`]:choice,
      [`rooms/${code}/players/${u.uid}/actionSeqClientAt`]:Date.now()
    });
    return true;
  }
  async function publishPlayerActionFallback(code, type, payload, u){
    const actionType = String(type || '').toUpperCase();
    if(roomUsesFly(code)) return false;
    if(!code || !u || !actionType || actionType === 'STATE_SYNC' || !FO.update || !FO.ref || !FO.rtdb) return false;
    const safePayload = onlineFirebaseSafeValue(payload || {});
    const clientAt = Date.now();
    const action = {
      roomCode:code,
      uid:u.uid,
      type:actionType,
      payload:safePayload,
      clientActionId:String(safePayload?.clientActionId || ''),
      createdAt:FO.serverTimestamp(),
      clientAt
    };
    await FO.update(FO.ref(FO.rtdb), {
      [`rooms/${code}/players/${u.uid}/latestAction`]:action,
      [`rooms/${code}/players/${u.uid}/actionSeqClientAt`]:clientAt
    });
    return true;
  }
  function playerFallbackActionId(action){
    return String(action?.clientActionId || action?.payload?.clientActionId || action?.uid + ':' + action?.type + ':' + action?.clientAt || '');
  }
  function maybeApplyPlayerActionFallback(players){
    const g = gameState();
    const room = lastLobbyRoom;
    const localUid = window.FATE_ONLINE?.user?.uid;
    if(!isOnlineMatchState(g) || !room || !players || !localUid || isCoinScreenActive()) return;
    // Gameplay actions must be applied only through the ordered room action log.
    // The player-node fallback can arrive before earlier sequenced actions and
    // causes duplicated/offset board placements during live multiplayer.
    return;
    const candidates = [room.hostUid, room.guestUid].filter(Boolean);
    for(const uid of candidates){
      if(uid === localUid) continue;
      const action = players?.[uid]?.latestAction;
      if(!action || action.roomCode !== room.roomCode) continue;
      const type = String(action.type || '').toUpperCase();
      if(!type || type === 'CHOOSE_TURN' || type === 'STATE_SYNC') continue;
      const actionId = playerFallbackActionId(action);
      if(actionId && appliedPlayerActionFallbackIds.has(actionId)) continue;
      if(actionId) appliedPlayerActionFallbackIds.add(actionId);
      const fallbackAction = Object.assign({}, action, {
        uid,
        type,
        seq:Number(action.seq || 0) || Math.max(lastAppliedActionSeq, lastActionSeq) + 1,
        _fromPlayerFallback:true
      });
      applyOnlineAction(fallbackAction).catch(e=>console.error('Player-node action fallback failed', e, fallbackAction));
      return;
    }
  }
  function maybeApplyTurnChoiceFallback(players){
    const g = gameState();
    const room = lastLobbyRoom;
    if(!isOnlineMatchState(g) || !room || !players || isGameScreenActive()) return;
    if(!isCoinScreenActive() && !document.querySelector('.online-match-overview-modal')) return;
    const candidates = [room.hostUid, room.guestUid].filter(Boolean);
    for(const uid of candidates){
      const choice = players?.[uid]?.turnChoice;
      if(!choice || choice.roomCode !== room.roomCode) continue;
      const playerIndex = Number(choice.playerIndex);
      const expectedUid = playerIndex === 0 ? room.hostUid : room.guestUid;
      if(uid !== expectedUid || Number(playerIndex) !== Number(g._coinWinner)) continue;
      const choiceId = String(choice.clientActionId || uid + ':' + choice.clientAt || '');
      if(choiceId && appliedTurnChoiceFallbackIds.has(choiceId)) continue;
      if(choiceId) appliedTurnChoiceFallbackIds.add(choiceId);
      withLegacyRemoteReplayAction(async ()=>{
        if(isGameScreenActive()) return;
        if(typeof window.chooseTurn === 'function') window.chooseTurn(!!choice.goFirst);
        updateRoomTurn(gameState()?.currentPlayer);
      }, playerIndex).catch(e=>console.error('Turn-choice fallback failed', e));
      return;
    }
  }
  function activeRoomCode(){
    return gameState()?._onlineRoomCode || activeRoom;
  }
  function localUserUid(){
    return window.FATE_ONLINE?.user?.uid || '';
  }
  function currentMatchPreloadKey(room){
    const g = gameState();
    const r = room || lastLobbyRoom || {};
    return [
      String(r.roomCode || g?._onlineRoomCode || activeRoom || ''),
      String(r.seed || g?._onlineSeed || ''),
      String(r.startedAt || '')
    ].join('|');
  }
  function preloadReadyEntry(player, key){
    const entry = player && player.matchPreload;
    return !!(entry && entry.ready && (!key || String(entry.matchKey || '') === String(key || '')));
  }
  function playableReadyEntry(player, key){
    const entry = player && player.matchPreload;
    return !!(entry && entry.playableReady && (!key || String(entry.matchKey || '') === String(key || '')));
  }
  function preloadReadySnapshot(room, players, key){
    const r = room || lastLobbyRoom || {};
    const p = players || lastLobbyPlayers || {};
    const uids = [r.hostUid, r.guestUid].filter(Boolean);
    const readyCount = uids.filter(uid=>preloadReadyEntry(p[uid], key)).length;
    return {readyCount, total:uids.length || 2, key, uids};
  }
  function playableReadySnapshot(room, players, key){
    const r = room || lastLobbyRoom || {};
    const p = players || lastLobbyPlayers || {};
    const uids = [r.hostUid, r.guestUid].filter(Boolean);
    const readyCount = uids.filter(uid=>playableReadyEntry(p[uid], key)).length;
    return {readyCount, total:uids.length || 2, key, uids};
  }
  function setOnlinePlayableWaitVisible(visible, detail){
    try{
      let veil = document.getElementById('online-playable-wait-veil');
      if(!visible){
        if(veil) veil.remove();
        return;
      }
      if(!veil){
        veil = document.createElement('div');
        veil.id = 'online-playable-wait-veil';
        veil.setAttribute('aria-live', 'polite');
        veil.style.cssText = 'position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;background:rgba(5,8,16,.24);backdrop-filter:blur(1px);pointer-events:none;';
        veil.innerHTML = '<div style="max-width:360px;margin:1rem;padding:1rem 1.2rem;border:1px solid rgba(245,214,120,.42);background:rgba(10,13,24,.92);box-shadow:0 18px 45px rgba(0,0,0,.35);color:#f4e7c0;font-family:Cinzel,serif;text-align:center;"><div style="font-size:1rem;font-weight:700;margin-bottom:.35rem;">Syncing Match</div><div id="online-playable-wait-copy" style="font-family:Inter,system-ui,sans-serif;font-size:.9rem;line-height:1.35;color:#ddd3b3;">Waiting for both players to finish loading.</div></div>';
        document.body.appendChild(veil);
      }
      const copy = document.getElementById('online-playable-wait-copy');
      if(copy){
        const ready = Number(detail?.readyCount || 0);
        const total = Math.max(2, Number(detail?.total || 2));
        copy.textContent = ready > 0 ? `Waiting for both players to finish loading. ${ready}/${total} ready.` : 'Waiting for both players to finish loading.';
      }
    }catch(e){}
  }
  async function publishOnlineMatchPreload(report){
    const g = gameState();
    const room = lastLobbyRoom || {};
    const code = g?._onlineRoomCode || activeRoom || room.roomCode || '';
    const u = window.FATE_ONLINE?.user;
    if(!code || !u || !isOnlineMatchState(g)) return false;
    const key = currentMatchPreloadKey(room);
    const payload = {
      ready:true,
      roomCode:code,
      uid:u.uid,
      matchKey:key,
      cards:Number(report && report.cards || 0) || 0,
      ms:Number(report && report.ms || 0) || 0,
      texturePending:Number(report && report.textureWait && report.textureWait.pending || 0) || 0,
      textureFailed:Number(report && report.textureWait && report.textureWait.failed || 0) || 0,
      clientAt:Date.now()
    };
    const perf = window.__fatePerf = window.__fatePerf || {};
    perf.onlineMatchPreload = Object.assign({}, payload, {published:false});
    if(roomUsesFly(room || code)){
      const data = await flyApiRequest(`/api/rooms/${encodeURIComponent(code)}/preload`, {
        method:'POST',
        body:{uid:u.uid, matchPreload:payload}
      });
      if(data?.room){
        const nextRoom = normalizeFlyRoom(data.room);
        lastLobbyRoom = nextRoom;
        lastLobbyPlayers = nextRoom.players;
      }
      perf.onlineMatchPreload.published = true;
      perf.onlineMatchPreload.transport = 'fly';
      return true;
    }
    if(!FO.update || !FO.ref || !FO.rtdb) return false;
    await FO.update(FO.ref(FO.rtdb), {
      [`rooms/${code}/players/${u.uid}/matchPreload`]:Object.assign({}, payload, {createdAt:FO.serverTimestamp()}),
      [`rooms/${code}/updatedAt`]:FO.serverTimestamp()
    });
    perf.onlineMatchPreload.published = true;
    perf.onlineMatchPreload.transport = 'rtdb';
    return true;
  }
  function waitForOnlineMatchPreload(options){
    const opts = options || {};
    const g = gameState();
    const room = lastLobbyRoom || {};
    const code = g?._onlineRoomCode || activeRoom || room.roomCode || '';
    const key = currentMatchPreloadKey(room);
    const timeoutMs = Math.max(2500, Math.min(30000, Number(opts.timeoutMs) || 15000));
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : function(){};
    const started = Date.now();
    const perf = window.__fatePerf = window.__fatePerf || {};
    return new Promise(function(resolve){
      let settled = false;
      let unsub = null;
      let timeout = 0;
      const finish = function(reason, snap){
        if(settled) return;
        settled = true;
        if(timeout) clearTimeout(timeout);
        try{ if(unsub) unsub(); }catch(e){}
        const result = Object.assign({reason, ms:Date.now() - started}, snap || preloadReadySnapshot(room, lastLobbyPlayers, key));
        perf.onlineMatchPreloadWait = result;
        resolve(result);
      };
      const check = function(players, nextRoom){
        const currentRoom = nextRoom || lastLobbyRoom || room;
        const snap = preloadReadySnapshot(currentRoom, players || lastLobbyPlayers, key);
        onProgress(snap);
        if(snap.readyCount >= snap.total && snap.total >= 2) finish('both-ready', snap);
      };
      check(lastLobbyPlayers, room);
      timeout = setTimeout(function(){
        finish('timeout', preloadReadySnapshot(lastLobbyRoom || room, lastLobbyPlayers, key));
      }, timeoutMs);
      const done = function(reason, snap){
        finish(reason, snap);
      };
      if(roomUsesFly(room || code)){
        const poll = async function(){
          if(settled) return;
          try{
            const data = await flyApiRequest(`/api/rooms/${encodeURIComponent(code)}`);
            if(data?.room){
              const nextRoom = normalizeFlyRoom(data.room);
              lastLobbyRoom = nextRoom;
              lastLobbyPlayers = nextRoom.players;
              const snap = preloadReadySnapshot(nextRoom, nextRoom.players, key);
              onProgress(snap);
              if(snap.readyCount >= snap.total && snap.total >= 2) return done('both-ready', snap);
            }
          }catch(e){}
          if(!settled) setTimeout(poll, 650);
        };
        poll();
        return;
      }
      if(FO.onValue && FO.ref && FO.rtdb && code){
        unsub = FO.onValue(FO.ref(FO.rtdb, `rooms/${code}/players`), function(snap){
          const players = snap.val() || {};
          lastLobbyPlayers = players;
          check(players, lastLobbyRoom || room);
        });
      }
    });
  }
  function opponentUidForRoom(room, uid){
    if(!room || !uid) return '';
    if(room.hostUid === uid) return room.guestUid || '';
    if(room.guestUid === uid) return room.hostUid || '';
    return '';
  }
  function setLagPause(active, reason){
    const g = gameState();
    if(g) g._onlineLagPauseActive = !!active;
    if(active){
      let el = document.getElementById('online-lag-pause');
      if(!el){
        el = document.createElement('div');
        el.id = 'online-lag-pause';
        el.className = 'online-lag-pause';
        el.innerHTML = `<div class="online-lag-card">
          <div class="online-lag-spinner" aria-hidden="true"></div>
          <div class="online-lag-title">Syncing Match</div>
          <div class="online-lag-copy"></div>
        </div>`;
        document.body.appendChild(el);
      }
      const copy = el.querySelector('.online-lag-copy');
      if(copy) copy.textContent = reason || 'Waiting for both players to catch up.';
      el.classList.add('on');
      lagPauseVisible = true;
      lastLagPauseReason = reason || '';
      try{ if(typeof window.stopTurnTimer === 'function') window.stopTurnTimer(); }catch(e){}
      return;
    }
    const el = document.getElementById('online-lag-pause');
    if(el) el.classList.remove('on');
    lagPauseVisible = false;
    lastLagPauseReason = '';
    if(g && g.phase === 'main' && Number(g.currentPlayer) === Number(g._onlinePlayerIndex)){
      try{ if(typeof window.startTurnTimer === 'function') window.startTurnTimer(); }catch(e){}
    }
  }
  function clearDisconnectEndTimer(){
    if(disconnectEndTimer) clearTimeout(disconnectEndTimer);
    disconnectEndTimer = null;
  }
  function getQueuePartyTargetUid(){
    const u = window.FATE_ONLINE?.user;
    const party = window.FATE_ONLINE_PARTY;
    if(!u || !party || !party.members) return '';
    return Object.keys(party.members).find(uid => uid && uid !== u.uid) || '';
  }
  function isWaitingForPartyMember(){
    const u = window.FATE_ONLINE?.user;
    const party = window.FATE_ONLINE_PARTY;
    if(!u || !party || !party.members) return false;
    return !Object.keys(party.members).some(uid => uid && uid !== u.uid);
  }
  function queueModeLabel(mode){
    return normalizeRoomMode(mode) === 'ranked' ? 'Challenger' : 'Free Play';
  }
  function evaluateLagPause(){
    const g = gameState();
    const room = lastLobbyRoom;
    if(!isOnlineMatchState(g) || !room || room.status === 'ended'){
      if(lagPauseVisible) setLagPause(false);
      return;
    }
    if(roomUsesFly(activeRoomCode() || room)){
      if(lagPauseVisible || g._onlineLagPauseActive) setLagPause(false);
      return;
    }
    const roomSeq = Math.max(Number(room.lastActionSeq || 0) || 0, Number(lastActionSeq || 0) || 0);
    if(!shouldRunForcedSyncForRoomSeq(roomSeq)){
      if(lagPauseVisible) setLagPause(false);
      return;
    }
    const localBehind = Math.max(0, roomSeq - lastAppliedActionSeq);
    const uid = localUserUid();
    const opponentUid = opponentUidForRoom(room, uid);
    const opponent = opponentUid ? (lastLobbyPlayers || {})[opponentUid] : null;
    const opponentSeq = Number(opponent?.actionSeq || 0) || 0;
    const opponentBehind = opponentUid ? Math.max(0, roomSeq - opponentSeq) : 0;
    const significantLocalLag = localBehind >= 2;
    const significantOpponentLag = opponentBehind >= 2 && roomSeq >= 2;
    if(significantLocalLag){
      setLagPause(true, `Catching up to the match... ${localBehind} actions remaining.`);
    }else if(significantOpponentLag){
      setLagPause(true, `Waiting for your opponent to catch up... ${opponentBehind} actions behind.`);
    }else if(lagPauseVisible){
      setLagPause(false);
    }
  }
  function reportActionProgress(seq, opts={}){
    const code = activeRoomCode();
    const uid = localUserUid();
    if(!code || !uid) return;
    const safeSeq = Math.max(0, Number(seq || 0) || 0);
    const force = !!opts.force || !!opts.turnBoundary || safeSeq <= 1;
    if(!force){
      pendingActionProgressSeq = Math.max(pendingActionProgressSeq, safeSeq);
      return;
    }
    const reportSeq = Math.max(safeSeq, pendingActionProgressSeq || 0);
    pendingActionProgressSeq = 0;
    const now = Date.now();
    if(reportSeq === lastReportedActionSeq && now - lastReportedActionAt < 1200) return;
    lastReportedActionSeq = reportSeq;
    lastReportedActionAt = now;
    if(roomUsesFly(code)){
      const room = lastLobbyRoom || {};
      const player = room.players && uid ? room.players[uid] : null;
      if(player){
        player.actionSeq = Math.max(Number(player.actionSeq || 0) || 0, reportSeq);
        player.actionSeqClientAt = Date.now();
      }
      if(!opts.turnBoundary && safeSeq > 1) return;
      flyApiRequest(`/api/rooms/${encodeURIComponent(code)}/progress`, {
        method:'POST',
        timeoutMs:2500,
        body:{uid, actionSeq:reportSeq, clientAt:Date.now()}
      }).catch(e=>console.warn('Fly action progress report failed', e));
      return;
    }
    if(!FO.update) return;
    FO.update(FO.ref(FO.rtdb), {
      [`rooms/${code}/players/${uid}/actionSeq`]: reportSeq,
      [`rooms/${code}/players/${uid}/actionSeqClientAt`]: Date.now()
    }).catch(()=>{});
  }
  async function endOnlineMatchBecauseOpponentLeft(room){
    const g = gameState();
    if(!isOnlineMatchState(g) || g._onlineResultMarked) return;
    g._onlineResultMarked = true;
    const code = room?.roomCode || g._onlineRoomCode || activeRoom;
    const uid = localUserUid();
    try{
      if(code && uid && room?.hostUid === uid && FO.update && !roomUsesFly(room || code)){
        await FO.update(FO.ref(FO.rtdb), {
          [`rooms/${code}/status`]:'ended',
          [`rooms/${code}/endedBy`]:uid,
          [`rooms/${code}/endReason`]:'disconnect',
          [`rooms/${code}/updatedAt`]:FO.serverTimestamp()
        }).catch(()=>{});
      }
    }catch(e){}
    showOnlineForfeitResult('victory', captureOnlineGameBackground(), {reason:'Opponent left the match.'});
    if(code && typeof window.fateUnpublishLiveMatch === 'function') window.fateUnpublishLiveMatch(code);
    activeRoom = null;
    clearRoomWatchers();
  }
  function maybeHandleOpponentDisconnect(room, players){
    const g = gameState();
    const uid = localUserUid();
    if(!isOnlineMatchState(g) || !room || !uid || room.status === 'lobby' || room.status === 'ended'){
      clearDisconnectEndTimer();
      return;
    }
    const oppUid = opponentUidForRoom(room, uid);
    const opponent = oppUid ? players?.[oppUid] : null;
    if(!oppUid || !opponent || opponent.connected !== false){
      clearDisconnectEndTimer();
      return;
    }
    if(disconnectEndTimer) return;
    disconnectEndTimer = setTimeout(()=>{
      disconnectEndTimer = null;
      const latest = lastLobbyRoom || room;
      const latestPlayers = lastLobbyPlayers || players || {};
      const latestOpponent = oppUid ? latestPlayers[oppUid] : null;
      if(latestOpponent && latestOpponent.connected !== false) return;
      endOnlineMatchBecauseOpponentLeft(latest).catch(e=>console.error('Opponent disconnect result failed', e));
    }, 10000);
  }
  function captureOnlineGameBackground(){
    const gameScreen = document.getElementById('s-game');
    const lastBg = window.__fateLastGameBackground || null;
    if(!gameScreen) return lastBg;
    const cssVar = gameScreen.style.getPropertyValue('--game-bg-img') || lastBg?.cssVar || '';
    return {
      cssVar,
      backgroundImage: gameScreen.style.backgroundImage || (cssVar ? `linear-gradient(rgba(3,3,6,.58),rgba(3,3,6,.78)), ${cssVar}` : lastBg?.backgroundImage || ''),
      backgroundSize: gameScreen.style.backgroundSize || '',
      backgroundPosition: gameScreen.style.backgroundPosition || '',
      backgroundRepeat: gameScreen.style.backgroundRepeat || ''
    };
  }
  function applyOnlineResultBackground(bg){
    const winScreen = document.getElementById('s-win');
    if(!winScreen || !bg) return;
    winScreen.classList.add('win-screen-game-bg');
    if(bg.cssVar) winScreen.style.setProperty('--game-bg-img', bg.cssVar);
    if(bg.backgroundImage) winScreen.style.backgroundImage = bg.backgroundImage;
    if(bg.backgroundSize) winScreen.style.backgroundSize = bg.backgroundSize;
    if(bg.backgroundPosition) winScreen.style.backgroundPosition = bg.backgroundPosition;
    if(bg.backgroundRepeat) winScreen.style.backgroundRepeat = bg.backgroundRepeat;
  }
  function collectOnlineServerRewardData(outcome, action, sourceG){
    const ledger = action?.payload?.rewardLedger || action?.roomPatch?.resultLedger || null;
    if(!ledger || !ledger.serverFinalized) return null;
    const g = sourceG || gameState();
    const profile = (typeof USER_PROFILE !== 'undefined' && USER_PROFILE) ? USER_PROFILE : null;
    const localUid = window.FATE_ONLINE?.user?.uid || '';
    const localIdx = Number.isInteger(g?._onlinePlayerIndex) ? g._onlinePlayerIndex : null;
    const entry = (localUid && ledger.byUid && ledger.byUid[localUid]) ||
      (localIdx !== null && ledger.byIndex && ledger.byIndex[String(localIdx)]) ||
      null;
    if(!entry) return null;
    let levelsGained = 0;
    let newLevel = profile?.level || 1;
    if(profile && g && !g._onlineForfeitRewardsApplied){
      if(entry.ranked){
        profile.challengerElo = Number(entry.newElo || profile.challengerElo || 600) || 600;
        profile.challengerWins = Number(entry.challengerWins ?? profile.challengerWins ?? 0) || 0;
        profile.challengerLosses = Number(entry.challengerLosses ?? profile.challengerLosses ?? 0) || 0;
      }
      profile.humanWins = Number(entry.humanWins ?? profile.humanWins ?? 0) || 0;
      profile.humanLosses = Number(entry.humanLosses ?? profile.humanLosses ?? 0) || 0;
      profile.matchesPlayed = Number(entry.matchesPlayed ?? profile.matchesPlayed ?? 0) || 0;
      if(Number(entry.starlightGained || 0) > 0) profile.starlight = (Number(profile.starlight || 0) || 0) + Number(entry.starlightGained || 0);
      if(Number(entry.xpGained || 0) > 0 && typeof awardXp === 'function'){
        const xp = awardXp(Number(entry.xpGained || 0));
        levelsGained = Number(xp?.levelsGained || 0) || 0;
        newLevel = Number(xp?.newLevel || profile.level || 1) || 1;
      }
      if(typeof saveProfile === 'function') saveProfile();
      g._onlineForfeitRewardsApplied = true;
    }
    return {
      isRanked:!!entry.ranked,
      serverFinalized:true,
      result:{
        eloChange:Number(entry.delta || 0) || 0,
        xpGained:Number(entry.xpGained || 0) || 0,
        levelsGained,
        newLevel,
        isDraw:!!entry.isDraw
      },
      starlightGained:Number(entry.starlightGained || 0) || 0
    };
  }
  function collectOnlineForfeitRewardData(outcome, sourceG){
    const g = sourceG || gameState();
    if(!g || g._onlineForfeitRewardsApplied) return null;
    const profile = (typeof USER_PROFILE !== 'undefined' && USER_PROFILE) ? USER_PROFILE : null;
    if(!profile) return null;
    const localIdx = Number.isInteger(g._onlinePlayerIndex) ? g._onlinePlayerIndex : null;
    const oppProfile = localIdx !== null ? (g.playerProfiles?.[1 - localIdx] || {}) : {};
    const opponentElo = Number(oppProfile.elo || oppProfile.challengerElo || 600) || 600;
    const isRanked = g._onlineRoomMode === 'ranked' || (typeof CURRENT_MODE !== 'undefined' && CURRENT_MODE === 'challenger');
    const won = outcome === 'victory';
    let result = null;
    let starlightGained = 0;
    const forfeitOptions = { forfeit:true, skipXp:true, skipDrops:true };
    try{
      if(isRanked && typeof recordChallengerResult === 'function'){
        result = recordChallengerResult(won, opponentElo, false, forfeitOptions);
        if(won && typeof calculateStarlight === 'function'){
          starlightGained = Math.max(1, calculateStarlight(opponentElo, false));
          profile.starlight = (profile.starlight || 0) + starlightGained;
          if(typeof saveProfile === 'function') saveProfile();
        }
      }else if(typeof recordFreePlayResult === 'function'){
        result = recordFreePlayResult(won, opponentElo, forfeitOptions);
      }
      g._onlineForfeitRewardsApplied = true;
    }catch(e){
      console.warn('Online forfeit rewards failed', e);
    }
    return result ? {isRanked, result, starlightGained} : null;
  }
  function renderOnlineForfeitRewardGrid(data){
    if(!data || !data.result) return '';
    const profile = (typeof USER_PROFILE !== 'undefined' && USER_PROFILE) ? USER_PROFILE : {level:1, xp:0, challengerElo:600, starlight:0};
    const result = data.result;
    const eloSign = result.eloChange >= 0 ? '+' : '';
    const eloClr = result.eloChange > 0 ? '#7fff90' : result.eloChange < 0 ? '#ff7070' : 'var(--dim)';
    const maxLevel = typeof MAX_LEVEL !== 'undefined' ? MAX_LEVEL : 100;
    const nextLevelXp = profile.level >= maxLevel ? 0 : (typeof getXpForLevel === 'function' ? getXpForLevel(profile.level + 1) : 1);
    const xpPct = profile.level >= maxLevel ? 100 : Math.max(0, Math.min(100, Math.round((profile.xp / Math.max(1, nextLevelXp)) * 100)));
    const rankBox = data.isRanked && typeof renderRankBadge === 'function' ? `<div class="win-reward-box"><div class="wrb-label">RANK</div><div class="wrb-value win-rank-badge-large">${renderRankBadge(profile.challengerElo || 600,'lg')}</div></div>` : '';
    const eloBox = data.isRanked ? `<div class="win-reward-box"><div class="wrb-label">CHALLENGER ELO</div><div class="wrb-value" style="color:${eloClr};">${eloSign}${result.eloChange || 0}</div><div class="wrb-sub">now ${profile.challengerElo || 600}</div></div>` : '';
    const starlightBox = data.starlightGained > 0 ? `<div class="win-reward-box starlight"><div class="wrb-label">STARLIGHT</div><div class="wrb-value">+${data.starlightGained}</div><div class="wrb-sub">Total: ${profile.starlight || 0}</div></div>` : '';
    return `<div class="win-result-mode ${data.isRanked ? 'challenger' : 'freeplay'}">${data.isRanked ? 'CHALLENGER MODE' : 'FREE PLAY'}</div>
      <div class="win-rewards-grid">
        ${eloBox}
        ${rankBox}
        ${starlightBox}
        <div class="win-reward-box"><div class="wrb-label">XP Gained</div><div class="wrb-value">+${result.xpGained || 0}</div><div class="wrb-sub">${typeof renderLevelBadge === 'function' ? renderLevelBadge(profile.level,{small:true}) : 'Level ' + (profile.level || 1)}</div></div>
        <div class="win-reward-box progress"><div class="wrb-label">Progress</div><div class="win-xp-bar"><div class="win-xp-fill" style="width:${xpPct}%;"></div></div><div class="wrb-sub">${profile.level >= maxLevel ? 'MAX LEVEL' : `${profile.xp} / ${nextLevelXp} XP`}</div></div>
      </div>`;
  }
  function buildOnlineResultRewards(outcome, opts={}){
    const won = outcome === 'victory';
    const reason = opts.reason || (won ? 'Opponent left the match.' : 'You left the match.');
    const rewardData = opts.rewardData || collectOnlineForfeitRewardData(outcome);
    const rewardHtml = renderOnlineForfeitRewardGrid(rewardData);
    return `<div class="online-forfeit-result online-result-v2 ${won ? 'victory' : 'defeat'}">
      <div class="online-result-kicker">${won ? 'Match Won' : 'Match Lost'}</div>
      <div class="online-forfeit-result-copy">${esc(reason)}</div>
    </div>${rewardHtml}`;
  }
  function showOnlineForfeitResult(outcome, bg, opts={}){
    const won = outcome === 'victory';
    if(typeof window.playSfx === 'function') window.playSfx('forfeit');
    try{ if(typeof window.stopTurnTimer === 'function') window.stopTurnTimer(); }catch(e){}
    try{ if(typeof window.hidePassTurnOverlay === 'function') window.hidePassTurnOverlay(); }catch(e){}
    if(typeof window.showScreen === 'function') window.showScreen('s-win');
    applyOnlineResultBackground(bg || captureOnlineGameBackground());

    const title = document.getElementById('win-title');
    const sub = document.getElementById('win-sub');
    const zones = document.getElementById('win-zones');
    const rewards = document.getElementById('win-rewards');
    if(title){
      title.textContent = won ? 'Victory' : 'Defeat';
      title.classList.add('online-forfeit-title');
    }
    if(sub){
      sub.textContent = '';
      sub.classList.add('online-forfeit-sub');
      sub.style.color = '#f7f7ff';
    }
    if(zones) zones.innerHTML = '';
    if(rewards){
      rewards.style.display = 'block';
      rewards.innerHTML = buildOnlineResultRewards(outcome, opts);
    }
  }
  function gameProfileFromPublic(prof, fallbackName){
    const elo = Number(prof?.challengerElo || prof?.elo || 600) || 600;
    return {
      name: pName(prof) || fallbackName || 'Player',
      img: pPhoto(prof),
      crop: pCrop(prof),
      elo,
      wins: Number(prof?.wins || prof?.challengerWins || 0) || 0,
      losses: Number(prof?.losses || prof?.challengerLosses || 0) || 0,
      level: Number(prof?.level || 1) || 1,
      baseCode: prof?.baseCode || ''
    };
  }
  function applyOnlineRoomIdentity(room, players){
    const g = gameState();
    if(!room || !g) return;
    const hostP = liveProfiles.get(room.hostUid) || players?.[room.hostUid]?.profileSnapshot || {};
    const guestP = liveProfiles.get(room.guestUid) || players?.[room.guestUid]?.profileSnapshot || {};
    const hostGame = gameProfileFromPublic(hostP, 'Host');
    const guestGame = gameProfileFromPublic(guestP, 'Guest');
    g.playerProfiles = { 0: hostGame, 1: guestGame };
    if(g.players && g.players[0]) g.players[0].name = hostGame.name;
    if(g.players && g.players[1]) g.players[1].name = guestGame.name;
  }
  function cleanupRoomProfileSubs(keep){
    for(const [uid, unsub] of roomProfileUnsubs.entries()){
      if(keep && keep.has(uid)) continue;
      try{ unsub(); }catch(e){}
      roomProfileUnsubs.delete(uid);
      liveProfiles.delete(uid);
    }
  }
  function scheduleLobbyRender(){
    clearTimeout(lobbyRenderTimer);
    lobbyRenderTimer = setTimeout(()=>renderLobby(null, null, true), 50);
  }
  function ensureRoomProfile(uid){
    if(!uid || roomProfileUnsubs.has(uid)) return;
    // Guard before subscribing so an immediate profile callback cannot recurse
    // through renderLobby() and subscribe to the same uid again.
    roomProfileUnsubs.set(uid, ()=>{});
    if(FO.subscribeProfile){
      const unsub = FO.subscribeProfile(uid, p=>{
        liveProfiles.set(uid, p || {});
        scheduleLobbyRender();
      });
      roomProfileUnsubs.set(uid, unsub || (()=>{}));
    }else if(FO.getPublicProfile){
      FO.getPublicProfile(uid).then(p=>{ liveProfiles.set(uid,p||{}); scheduleLobbyRender(); }).catch(()=>{});
    }
  }
  function clearRoomWatchers(){
    clearTimeout(lobbyRenderTimer);
    clearTimeout(autoStartTimer);
    lobbyRenderTimer = null;
    autoStartTimer = null; autoStartCode = null;
    clearDisconnectEndTimer();
    stopConnectionHeartbeat();
    clearRandomQueueWatcher();
    try{ if(roomUnsub) roomUnsub(); }catch(e){}
    try{ if(playersUnsub) playersUnsub(); }catch(e){}
    try{ if(actionUnsub) actionUnsub(); }catch(e){}
    closeAuthoritySocket();
    roomUnsub = playersUnsub = actionUnsub = null;
    activeRoomSilent = false;
    cleanupRoomProfileSubs();
    liveProfiles = new Map();
    lastLobbyRoom = null;
    lastLobbyPlayers = null;
    lastLobbyHtml = '';
    lastActionSeq = 0;
    lastAppliedActionSeq = 0;
    lastAuthorityStateHash = '';
    lobbyAuthorityPrejoinCode = '';
    lobbyAuthorityPrejoinAttempts = 0;
    lobbyAuthorityPrejoinNextAt = 0;
    actionReplayQueue = Promise.resolve();
    optimisticSendQueue = Promise.resolve();
    actionReplayBuffer.clear();
    actionReplayDrainScheduled = false;
    lastReportedActionSeq = -1;
    lastReportedActionAt = 0;
    lastTurnBoundaryActionSeq = 0;
    pendingActionProgressSeq = 0;
    appliedTurnChoiceFallbackIds.clear();
    appliedPlayerActionFallbackIds.clear();
    lastSyncedRoomChatKey = '';
    deckPickerOpenForRoom = null;
    currentDeckChoiceKey = '';
    setLagPause(false);
  }

  function normalizedRoomCode(code){
    return String(code || '').trim().toUpperCase();
  }

  function allowOnlineMatchStart(code, reason, ttlMs=90000){
    const roomCode = normalizedRoomCode(code);
    if(!roomCode) return false;
    allowedOnlineMatchStarts.set(roomCode, {
      reason:String(reason || 'manual'),
      expiresAt:Date.now() + Math.max(5000, Number(ttlMs) || 90000)
    });
    return true;
  }
  async function publishOnlineMatchPlayable(){
    const g = gameState();
    const room = lastLobbyRoom || {};
    const code = g?._onlineRoomCode || activeRoom || room.roomCode || '';
    const u = window.FATE_ONLINE?.user;
    if(!code || !u || !isOnlineMatchState(g)) return false;
    const key = currentMatchPreloadKey(room);
    const prior = lastLobbyPlayers?.[u.uid]?.matchPreload || {};
    const payload = Object.assign({}, prior, {
      ready:prior.ready !== false,
      roomCode:code,
      uid:u.uid,
      matchKey:key,
      playableReady:true,
      playableClientAt:Date.now(),
      clientAt:Number(prior.clientAt || 0) || Date.now()
    });
    const perf = window.__fatePerf = window.__fatePerf || {};
    perf.onlineMatchPlayable = Object.assign({}, payload, {published:false});
    if(roomUsesFly(room || code)){
      const data = await flyApiRequest(`/api/rooms/${encodeURIComponent(code)}/preload`, {
        method:'POST',
        body:{uid:u.uid, matchPreload:payload}
      });
      if(data?.room){
        const nextRoom = normalizeFlyRoom(data.room);
        lastLobbyRoom = nextRoom;
        lastLobbyPlayers = nextRoom.players;
      }
      perf.onlineMatchPlayable.published = true;
      perf.onlineMatchPlayable.transport = 'fly';
      return true;
    }
    if(!FO.update || !FO.ref || !FO.rtdb) return false;
    await FO.update(FO.ref(FO.rtdb), {
      [`rooms/${code}/players/${u.uid}/matchPreload`]:Object.assign({}, payload, {updatedAt:FO.serverTimestamp()}),
      [`rooms/${code}/updatedAt`]:FO.serverTimestamp()
    });
    perf.onlineMatchPlayable.published = true;
    perf.onlineMatchPlayable.transport = 'rtdb';
    return true;
  }
  async function publishOnlineMatchPlayableWithRetry(){
    let lastErr = null;
    for(let attempt = 0; attempt < 3; attempt += 1){
      try{
        const ok = await publishOnlineMatchPlayable();
        if(ok) return true;
      }catch(err){
        lastErr = err;
        console.warn('Online playable readiness publish failed', {attempt:attempt + 1, err});
      }
      await new Promise(resolve=>setTimeout(resolve, 450 + attempt * 650));
    }
    if(lastErr) throw lastErr;
    return false;
  }

  function hasOnlineMatchStartIntent(code, reason){
    const roomCode = normalizedRoomCode(code);
    if(!roomCode) return false;
    const entry = allowedOnlineMatchStarts.get(roomCode);
    if(!entry) return false;
    if(entry.expiresAt < Date.now()){
      allowedOnlineMatchStarts.delete(roomCode);
      return false;
    }
    try {
      const perf = window.__fatePerf = window.__fatePerf || {};
      perf.onlineMatchStartIntent = {
        at:Date.now(),
        roomCode,
        requestedBy:String(reason || ''),
        allowedBy:entry.reason
      };
    } catch(e) {}
    return true;
  }

  function shouldEnterStartedRoom(room, reason){
    const roomCode = normalizedRoomCode(room?.roomCode || activeRoom);
    if(!roomCode || !isStartedRoomStatus(room?.status)) return false;
    const g = gameState();
    const currentCode = normalizedRoomCode(g?._onlineRoomCode || g?._onlineStartedRoomCode || g?._onlineBootstrappingRoomCode);
    if(currentCode === roomCode) return true;
    if(randomQueueState.active && normalizedRoomCode(randomQueueState.roomCode) === roomCode) return true;
    if(hasOnlineMatchStartIntent(roomCode, reason)) return true;
    if(!activeRoomSilent && normalizedRoomCode(activeRoom) === roomCode) return true;
    return false;
  }

  function noteBlockedOnlineMatchStart(room, reason){
    const roomCode = normalizedRoomCode(room?.roomCode || activeRoom);
    try {
      const perf = window.__fatePerf = window.__fatePerf || {};
      perf.blockedOnlineAutoMatchStart = {
        at:Date.now(),
        roomCode,
        status:String(room?.status || ''),
        reason:String(reason || ''),
        silent:!!activeRoomSilent,
        activeRoom:normalizedRoomCode(activeRoom)
      };
    } catch(e) {}
    console.warn('Blocked online match auto-start without entry intent', {
      roomCode,
      status:room?.status,
      reason,
      silent:!!activeRoomSilent
    });
  }

  function maybeStartRoomGame(room, reason){
    if(!isStartedRoomStatus(room?.status)) return false;
    if(!shouldEnterStartedRoom(room, reason)){
      noteBlockedOnlineMatchStart(room, reason);
      return false;
    }
    startRoomGame(room).catch(function(err){
      console.error('Online room handoff failed', err);
    });
    return true;
  }

  function rememberFlyStartAction(code, action){
    const roomCode = String(code || activeRoom || lastLobbyRoom?.roomCode || '').trim().toUpperCase();
    if(!roomCode || String(action?.type || '').toUpperCase() !== 'MATCH_START' || !action.payload) return null;
    flyMatchStartActions.set(roomCode, action);
    if(flyMatchStartActions.size > 20){
      const first = flyMatchStartActions.keys().next().value;
      if(first) flyMatchStartActions.delete(first);
    }
    return action;
  }

  function cachedFlyStartAction(code){
    const roomCode = String(code || activeRoom || lastLobbyRoom?.roomCode || '').trim().toUpperCase();
    return roomCode ? (flyMatchStartActions.get(roomCode) || null) : null;
  }


  function getDeckOptions(){
    const opts = [];
    try{
      const g = gameState();
      if(g && Array.isArray(g.p1Deck) && g.p1Deck.length === 40){
        opts.push({ key:'current', name:'Current Custom Deck', description:'The active 40-card deck currently loaded in the deck builder.', ids:[...g.p1Deck] });
      }
    }catch(e){}
    const presets = (typeof PRESET_DECKS !== 'undefined' && PRESET_DECKS) ? PRESET_DECKS : (window.PRESET_DECKS || {});
    Object.keys(presets).forEach(key=>{
      const deck = presets[key] || {};
      const rawIds = Array.isArray(deck.ids) ? deck.ids : [];
      const ids = typeof window.getActiveCardIdsForDeck === 'function'
        ? window.getActiveCardIdsForDeck(rawIds, 40)
        : rawIds.slice(0,40);
      if(ids.length === 40){
        opts.push({
          key:'preset:'+key,
          name:deck.name || key,
          description:deck.description || deck.desc || 'Custom deck',
          faceCardId:deck.faceCardId || '',
          displayCardIds:Array.isArray(deck.displayCardIds) ? deck.displayCardIds.slice(0,7) : [],
          ids
        });
      }
    });
    if(!opts.length && typeof window.buildDefaultDecks === 'function'){
      try{
        const g = gameState();
        if(!g) return opts;
        const oldP1 = Array.isArray(g.p1Deck) ? [...g.p1Deck] : [];
        const oldP2 = Array.isArray(g.p2Deck) ? [...g.p2Deck] : [];
        window.buildDefaultDecks();
        if(Array.isArray(g.p1Deck) && g.p1Deck.length === 40) opts.push({ key:'default', name:'Default Free Play Deck', ids:[...g.p1Deck] });
        g.p1Deck = oldP1; g.p2Deck = oldP2;
      }catch(e){}
    }
    return opts;
  }
  function getDeckChoice(key){
    const opts = getDeckOptions();
    return opts.find(o=>o.key === key) || opts[0] || null;
  }
  function deckTileCards(ids){
    const allCards = (typeof CARDS !== 'undefined' && Array.isArray(CARDS)) ? CARDS : (window.CARDS || []);
    const unique = [...new Set(ids || [])];
    return unique.map(id=>allCards.find(c=>c.id===id)).filter(Boolean);
  }
  function openOnlineDeckPicker(code, page=0){
    const options = getDeckOptions();
    deckPickerOpenForRoom = code;
    if(typeof resetModalChrome === 'function') resetModalChrome();
    const pageSize = 3;
    const maxPage = Math.max(0, Math.ceil(options.length / pageSize) - 1);
    const currentPage = Math.max(0, Math.min(maxPage, Number(page)||0));
    const body = document.createElement('div');
    body.className = 'online-room-deck-picker-body';
    if(!options.length){
      body.innerHTML = `
        <div style="text-align:center;padding:2rem 1rem;">
          <div style="font-family:'Cinzel',serif;color:var(--gold);font-size:1rem;margin-bottom:.5rem;">No Decks Saved Yet</div>
          <div style="color:var(--dim);font-size:.9rem;line-height:1.5;max-width:360px;margin:0 auto;">
            Build and save a 40-card deck in the deck builder first.
          </div>
        </div>`;
    }else{
      body.innerHTML = `<p style="font-size:.9rem;color:var(--dim);margin-bottom:.8rem;">Choose a deck for this online room:</p>`;
      const grid = document.createElement('div');
      grid.className = 'preset-browse-grid deck-pick-grid fixed-deck-tile-grid my-presets-as-choose-deck';
      grid.style.gridAutoRows = '480px';
      options.slice(currentPage * pageSize, currentPage * pageSize + pageSize).forEach((opt, i)=>{
        const sampleCards = deckTileCards(opt.ids);
        const hero = opt.faceCardId
          ? sampleCards.find(c=>c.id === opt.faceCardId) || sampleCards[0]
          : (sampleCards.slice().sort((a,b)=>(b.fate||0)-(a.fate||0))[0] || sampleCards[0]);
        const displayCards = opt.displayCardIds && opt.displayCardIds.length
          ? opt.displayCardIds.map(id=>sampleCards.find(c=>c.id === id)).filter(c=>c&&c.img).slice(0,7)
          : sampleCards.filter(c=>c.img).slice(0,7);
        const tile = document.createElement('div');
        tile.className = 'preset-browse-tile fixed-deck-tile';
        tile.style.height = '480px';
        tile.style.minHeight = '480px';
        tile.style.maxHeight = '480px';
        tile.style.animationDelay = (i*0.08)+'s';
        const useCanvasPreview = typeof window.scheduleCanvasDeckPreviewTile === 'function';
        tile.innerHTML = `
          <div class="preset-tile-art">
            ${useCanvasPreview ? '<canvas class="canvas-deck-preview-hero" aria-hidden="true"></canvas>' : (hero?.img ? `<img src="${esc(hero.img)}" alt="${esc(hero.name)}" onerror="this.style.display='none'">` : '')}
            <div class="preset-tile-overlay"></div>
          </div>
          <div class="preset-tile-info">
            <div class="preset-name">${esc(opt.name)}</div>
            <div class="preset-desc">${esc(opt.description || 'Custom deck')}</div>
            <div class="preset-minis">
              ${useCanvasPreview ? '<canvas class="canvas-deck-preview-minis" aria-hidden="true"></canvas>' : displayCards.map(c=>`<div class="preset-mini-art">${c.img?`<img src="${esc(c.img)}" alt="${esc(c.name)}">`:''}</div>`).join('')}
            </div>
            <div class="preset-action-row"><button class="btn sm pri" data-online-deck-key="${esc(opt.key)}">Use This Deck</button></div>
          </div>`;
        const btn = tile.querySelector('[data-online-deck-key]');
        if(btn) btn.onclick = (e)=>{ e.stopPropagation(); chooseRoomDeck(code, opt.key); };
        tile.onclick = ()=>chooseRoomDeck(code, opt.key);
        grid.appendChild(tile);
        if(useCanvasPreview) window.scheduleCanvasDeckPreviewTile(tile, {hero, minis: displayCards});
      });
      body.appendChild(grid);
      const pager = document.createElement('div');
      pager.className = 'online-deck-picker-page';
      pager.textContent = `Page ${currentPage + 1} / ${maxPage + 1}`;
      body.appendChild(pager);
    }
    const modalBody = document.getElementById('modal-body');
    if(modalBody){
      modalBody.innerHTML = '';
      modalBody.appendChild(body);
      modalBody.style.overflow = 'visible';
      modalBody.style.maxHeight = 'none';
    }
    const title = document.getElementById('modal-title');
    if(title) title.textContent = 'My Decks';
    const acts = document.getElementById('modal-acts');
    if(acts){
      acts.innerHTML = '';
      if(currentPage > 0){
        const prev = document.createElement('button');
        prev.className = 'btn sm';
        prev.textContent = 'Previous';
        prev.onclick = ()=>openOnlineDeckPicker(code, currentPage-1);
        acts.appendChild(prev);
      }
      if(currentPage < maxPage){
        const next = document.createElement('button');
        next.className = 'btn sm';
        next.textContent = 'Next';
        next.onclick = ()=>openOnlineDeckPicker(code, currentPage+1);
        acts.appendChild(next);
      }
      const close = document.createElement('button');
      close.className = 'btn sm';
      close.textContent = 'Close';
      close.onclick = ()=>{ deckPickerOpenForRoom = null; closeModal(); renderLobby(null, null, true); };
      acts.appendChild(close);
    }
    const modal = document.getElementById('modal');
    modal?.classList.add('on');
    modal?.querySelector('.modal')?.classList.add('online-room-deck-picker-modal');
  }
  async function chooseRoomDeck(code, key){
    await setRoomDeckChoice(code, key);
    deckPickerOpenForRoom = null;
    closeModal();
    renderLobby(null, null, true);
  }
  async function setRoomDeckChoice(code, key){
    const u = getUser(); if(!u) return;
    const choice = getDeckChoice(key);
    if(!choice || !Array.isArray(choice.ids) || choice.ids.length !== 40){ if(window.toast) toast('Choose a valid 40-card deck'); return; }
    currentDeckChoiceKey = choice.key;
    if(roomUsesFly(code)){
      try{
        const prof = await profile();
        const data = await flyApiRequest(`/api/rooms/${encodeURIComponent(code)}/player`, {
          method:'POST',
          body:{
            uid:u.uid,
            profile:prof,
            deckChoice:{
              selectedDeckKey:choice.key,
              name:choice.name,
              deckIds:choice.ids,
              ready:true
            }
          }
        });
        if(data?.room){
          const room = normalizeFlyRoom(data.room);
          lastLobbyRoom = room;
          lastLobbyPlayers = room.players;
          renderLobby(room, room.players);
        }
      }catch(e){
        console.error('Fly deck choice update failed', e);
        if(window.toast) toast('Deck choice failed');
      }
      return;
    }
    await FO.update(FO.ref(FO.rtdb), {
      [`rooms/${code}/players/${u.uid}/selectedDeckKey`]: choice.key,
      [`rooms/${code}/players/${u.uid}/selectedDeckName`]: choice.name,
      [`rooms/${code}/players/${u.uid}/deckIds`]: choice.ids,
      [`rooms/${code}/players/${u.uid}/ready`]: true
    }).catch(e=>{ console.error('Deck choice update failed', e); if(window.toast) toast('Deck choice failed'); });
    await touchRoomUpdatedAt(code);
  }
  async function sendRoomChat(code, textOverride){
    const u = getUser(); if(!u) return;
    const roomCode = String(code || activeRoom || '').trim().toUpperCase();
    if(!roomCode) return;
    const input = document.getElementById('igc-input') || document.getElementById('online-room-chat-input');
    const raw = textOverride != null ? textOverride : (input ? input.value : '');
    const text = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    if(!text) return;
    const room = lastLobbyRoom;
    if(!room || room.roomCode !== roomCode){ if(window.toast) toast('Room chat is not ready yet'); return; }
    const isParticipant = room.hostUid === u.uid || room.guestUid === u.uid;
    if(!isParticipant){ if(window.toast) toast('Join the room before chatting'); return; }
    const prof = window.FATE_ONLINE?.profile || {};
    try{
      if(roomUsesFly(room || roomCode)){
        const data = await flyApiRequest(`/api/rooms/${encodeURIComponent(roomCode)}/chat`, {
          method:'POST',
          body:{uid:u.uid, text, profile:prof}
        });
        const messages = Array.isArray(data?.messages) ? data.messages : (data?.message ? [data.message] : []);
        const nextRoom = Object.assign({}, room, {
          chat:messages,
          chatSeq:Number(data?.chatSeq || room.chatSeq || 0) || 0
        });
        lastLobbyRoom = nextRoom;
        syncRoomChatToInGame(nextRoom);
        if(input) input.value = '';
        renderLobby(nextRoom, nextRoom.players || lastLobbyPlayers, true);
        return;
      }
      const msgRef = FO.push(FO.ref(FO.rtdb, `rooms/${roomCode}/chat`));
      await FO.set(msgRef, {
        uid:u.uid,
        text,
        name:pName(prof),
        createdAt:FO.serverTimestamp()
      });
      if(input) input.value = '';
    }catch(e){
      console.error('Room chat send failed', e);
      if(window.toast) toast('Chat failed');
    }
  }
  function normalizeRoomChatEntries(chat){
    if(Array.isArray(chat)){
      return chat.map((msg, index)=>({ id:String(msg?.id || msg?.seq || index), msg:msg || {} }));
    }
    return Object.entries(chat || {}).map(([id, msg])=>({ id, msg:msg || {} }));
  }
  function sortedRoomChatEntries(room, limit=80){
    return normalizeRoomChatEntries(room?.chat)
      .sort((a,b)=>(Number(a.msg.createdAt || 0) || 0) - (Number(b.msg.createdAt || 0) || 0))
      .slice(-Math.max(1, limit || 80));
  }
  function roomChatEntriesKey(entries){
    return (entries || []).map(({id, msg})=>`${id}:${msg?.seq || 0}:${msg?.createdAt || 0}:${msg?.text || ''}`).join('|');
  }
  function noteLobbyChatArrival(room, entries){
    const list = Array.isArray(entries) ? entries : sortedRoomChatEntries(room);
    const key = roomChatEntriesKey(list);
    if(!key){
      lobbyChatUnread = false;
      lobbyChatLastSeenKey = '';
      return key;
    }
    if(!lobbyChatLastSeenKey){
      lobbyChatLastSeenKey = key;
      return key;
    }
    if(key !== lobbyChatLastSeenKey){
      const latest = list[list.length - 1]?.msg || {};
      const uid = window.FATE_ONLINE?.user?.uid || '';
      if(latest.uid && latest.uid !== uid) lobbyChatUnread = true;
    }
    return key;
  }
  function markLobbyChatRead(){
    const entries = sortedRoomChatEntries(lastLobbyRoom);
    lobbyChatLastSeenKey = roomChatEntriesKey(entries);
    lobbyChatUnread = false;
    const badge = document.getElementById('online-room-chat-notify');
    if(badge) badge.classList.remove('on');
    const panel = document.getElementById('online-room-chat-panel');
    if(panel) panel.classList.remove('has-unread');
  }
  function renderLobbyChat(room){
    const entries = sortedRoomChatEntries(room, 40);
    const key = noteLobbyChatArrival(room, entries);
    const uid = window.FATE_ONLINE?.user?.uid || '';
    const rows = entries.map(({id, msg})=>{
      const player = roomPlayerIndexForUid(room, msg.uid);
      const prof = liveProfiles.get(msg.uid) || lastLobbyPlayers?.[msg.uid]?.profileSnapshot || {};
      const from = msg.isSpectator ? 'Spectator' : (msg.name || pName(prof));
      const mine = !!(uid && msg.uid === uid);
      return `<div class="online-room-chat-message ${mine ? 'is-mine' : ''}" data-id="${esc(id)}">
        <span class="online-room-chat-name">${esc(from)}</span>
        <span class="online-room-chat-text">${esc(String(msg.text || ''))}</span>
      </div>`;
    }).join('') || '<div class="online-room-chat-empty">No messages yet.</div>';
    return `<div class="online-room-chat-panel ${lobbyChatUnread ? 'has-unread' : ''}" id="online-room-chat-panel" data-chat-key="${esc(key)}" onclick="window.fateMarkLobbyChatRead && window.fateMarkLobbyChatRead()">
      <div class="online-room-chat-header">
        <span>Lobby Chat</span>
        <span class="online-room-chat-notify ${lobbyChatUnread ? 'on' : ''}" id="online-room-chat-notify" aria-hidden="true"></span>
      </div>
      <div class="online-room-chat-messages" id="online-room-chat-messages">${rows}</div>
      <div class="online-room-chat-input-row">
        <input id="online-room-chat-input" maxlength="240" placeholder="Message" autocomplete="off" onfocus="window.fateMarkLobbyChatRead && window.fateMarkLobbyChatRead()" onkeydown="if(event.key==='Enter'){ event.preventDefault(); window.fateSendRoomChat('${esc(room?.roomCode || activeRoom || '')}'); }">
        <button class="btn sm pri" onclick="window.fateSendRoomChat('${esc(room?.roomCode || activeRoom || '')}')">Send</button>
      </div>
    </div>`;
  }
  function syncRoomChatToInGame(room){
    if(!room || typeof window.fateSetOnlineInGameMessages !== 'function') return;
    const entries = sortedRoomChatEntries(room);
    const key = noteLobbyChatArrival(room, entries);
    if(key === lastSyncedRoomChatKey) return;
    lastSyncedRoomChatKey = key;
    const messages = entries.map(({id, msg})=>{
      const player = roomPlayerIndexForUid(room, msg.uid);
      const isSpectatorMsg = player === null && !!msg.isSpectator;
      const prof = liveProfiles.get(msg.uid) || lastLobbyPlayers?.[msg.uid]?.profileSnapshot || {};
      return {
        id,
        uid:msg.uid || '',
        from: isSpectatorMsg ? 'Spectator' : (msg.name || pName(prof)),
        player: Number.isInteger(player) ? player : (isSpectatorMsg ? -1 : 0),
        text:String(msg.text || ''),
        timestamp:Number(msg.createdAt || 0) || 0,
        isSpectator: isSpectatorMsg
      };
    });
    window.fateSetOnlineInGameMessages(messages);
    const latest = messages[messages.length - 1];
    const uid = window.FATE_ONLINE?.user?.uid || '';
    if(latest && latest.uid && latest.uid !== uid && typeof window.fateNotifyInGameChatMessage === 'function'){
      window.fateNotifyInGameChatMessage(latest);
    }
  }
  function selectedDeckName(player){
    if(player?.selectedDeckName) return player.selectedDeckName;
    return 'No deck selected';
  }
  function isConnectedPlayer(player){
    return !!(player && player.connected !== false);
  }
  function hasValidDeck(player){
    return !!(player && ((Array.isArray(player.deckIds) && player.deckIds.length === 40) || player._flyDeckReady === true));
  }
  function normalizeRoomMode(mode){
    const raw = String(mode || 'freeplay').toLowerCase();
    return raw === 'ranked' || raw === 'challenger' ? 'ranked' : 'freeplay';
  }
  function queueKeyFor(mode, status='waiting', targetUid=''){
    const m = normalizeRoomMode(mode);
    const s = String(status || 'waiting').toLowerCase();
    const target = String(targetUid || '');
    return target ? `${m}:${s}:party:${target}` : `${m}:${s}:open`;
  }
  function cappedRoomChatRef(code){
    const base = FO.ref(FO.rtdb, `rooms/${code}/chat`);
    return (FO.query && FO.orderByChild && FO.limitToLast)
      ? FO.query(base, FO.orderByChild('createdAt'), FO.limitToLast(80))
      : base;
  }
  function cappedRoomActionsRef(code, limit=80){
    const base = FO.ref(FO.rtdb, `rooms/${code}/actions`);
    return (FO.query && FO.orderByKey && FO.limitToLast)
      ? FO.query(base, FO.orderByKey(), FO.limitToLast(limit))
      : base;
  }
  function consumePendingRoomDeck(mode){
    const pending = window.FATE_ONLINE_PENDING_ROOM_DECK;
    if(!pending || !Array.isArray(pending.deckIds) || pending.deckIds.length !== 40) return null;
    return {
      selectedDeckKey:String(pending.selectedDeckKey || ''),
      selectedDeckName:String(pending.selectedDeckName || 'Challenger Deck'),
      deckIds:[...pending.deckIds]
    };
  }
  function normalizeQueueDeck(deckChoice){
    const deck = deckChoice || window.FATE_ONLINE_PENDING_ROOM_DECK || consumePendingRoomDeck('ranked');
    if(!deck || !Array.isArray(deck.deckIds) || deck.deckIds.length !== 40) return null;
    return {
      selectedDeckKey:String(deck.selectedDeckKey || ''),
      selectedDeckName:String(deck.selectedDeckName || 'Challenger Deck'),
      deckIds:[...deck.deckIds]
    };
  }
  function deckCardById(id){
    const cards = Array.isArray(window.CARDS) ? window.CARDS : (typeof CARDS !== 'undefined' && Array.isArray(CARDS) ? CARDS : []);
    return cards.find(card=>String(card?.id || '') === String(id || '')) || null;
  }
  function deckCopyLimitFor(card){
    return String(card?.rarity || '').toLowerCase() === 'star' ? 1 : 3;
  }
  function validateOnlineQueueDeck(deck){
    const ids = Array.isArray(deck?.deckIds) ? deck.deckIds.map(id=>String(id || '')) : [];
    if(ids.length !== 40) return 'Choose a valid 40-card deck first';
    const counts = new Map();
    for(const id of ids){
      const card = deckCardById(id);
      if(!id || !card) return `Selected deck contains an unknown card (${id || 'empty slot'})`;
      const retired = typeof isRetiredCardForBuilder === 'function' ? isRetiredCardForBuilder(card) : (card.retired || card.temporarilyDisabled);
      if(retired) return `${card.name || id} is not available for online play`;
      const count = (counts.get(id) || 0) + 1;
      counts.set(id, count);
      const limit = deckCopyLimitFor(card);
      if(count > limit) return `${card.name || id} has ${count} copies; max ${limit} allowed`;
    }
    return '';
  }
  function emitRandomQueueStatus(status, message, extra={}){
    const detail = { status, message, roomCode:randomQueueState.roomCode || '', role:randomQueueState.role || '', ...extra };
    try{ randomQueueState.handlers?.onStatus?.(detail); }catch(e){}
    window.dispatchEvent(new CustomEvent('fate-random-queue-status', { detail }));
  }
  async function removeOwnQueueEntry(){
    const u = window.FATE_ONLINE?.user;
    if(u && (flyRoomsEnabled() || roomUsesFly(randomQueueState.roomCode))){
      await flyApiRequest('/api/matchmaking/leave', {
        method:'POST',
        body:{uid:u.uid},
        timeoutMs:30000
      }).catch(()=>{});
      return;
    }
    if(!firebaseRoomTransportAllowed()){
      warnBlockedRtdbRoomFallback('matchmaking/leave');
      return;
    }
    if(u && FO.rtdb && FO.remove) await FO.remove(FO.ref(FO.rtdb, `matchmaking/${u.uid}`)).catch(()=>{});
  }
  function clearRandomQueueWatcher(){
    try{ if(randomQueueUnsub) randomQueueUnsub(); }catch(e){}
    randomQueueUnsub = null;
    if(partyQueueWaitTimer) clearInterval(partyQueueWaitTimer);
    partyQueueWaitTimer = null;
  }
  async function setConnectedOnDisconnect(code, uid){
    if(!firebaseRoomTransportAllowed()) return false;
    await FO.onDisconnect(FO.ref(FO.rtdb, `rooms/${code}/players/${uid}`)).update({connected:false, disconnectedAt:FO.serverTimestamp()}).catch(()=>{});
    return true;
  }
  async function touchRoomUpdatedAt(code, now){
    if(!firebaseRoomTransportAllowed()) return false;
    if(!code || !FO.update || !FO.ref || !FO.rtdb) return false;
    return FO.update(FO.ref(FO.rtdb), {
      [`rooms/${code}/updatedAt`]: now || FO.serverTimestamp()
    }).then(()=>true).catch(e=>{
      console.warn('Room updatedAt touch failed', e);
      return false;
    });
  }
  async function releaseGuestSeatIfHeld(code, uid){
    if(!firebaseRoomTransportAllowed()) return false;
    if(!code || !uid || !FO.ref || !FO.rtdb) return false;
    if(FO.runTransaction){
      const claim = await FO.runTransaction(FO.ref(FO.rtdb, `rooms/${code}/guestUid`), current => {
        return current === uid ? null : current;
      }).catch(e=>{ console.warn('Guest seat release failed', e); return null; });
      return !!claim;
    }
    const snap = FO.get ? await FO.get(FO.ref(FO.rtdb, `rooms/${code}/guestUid`)).catch(()=>null) : null;
    if(snap && snap.val && snap.val() === uid && FO.remove){
      await FO.remove(FO.ref(FO.rtdb, `rooms/${code}/guestUid`)).catch(e=>console.warn('Guest seat release failed', e));
      return true;
    }
    return false;
  }

  // ── Reconnection heartbeat ──────────────────────────────────────────
  // Firebase's onDisconnect fires on transient network blips.  Without a
  // reconnection listener the player stays marked disconnected forever,
  // causing a false "opponent left" even when both players are still here.
  let _connectedUnsub = null;
  function startConnectionHeartbeat(code, uid){
    stopConnectionHeartbeat();
    if(!firebaseRoomTransportAllowed()) return;
    if(!FO.rtdb || !FO.onValue || !FO.ref) return;
    const connRef = FO.ref(FO.rtdb, '.info/connected');
    _connectedUnsub = FO.onValue(connRef, snap => {
      if(snap.val() === true){
        // We are (re-)connected — reassert presence and re-register onDisconnect
        FO.update(FO.ref(FO.rtdb), {
          [`rooms/${code}/players/${uid}/connected`]: true
        }).catch(()=>{});
        setConnectedOnDisconnect(code, uid).catch(()=>{});
      }
    });
  }
  function waitForOnlineMatchPlayable(options){
    const opts = options || {};
    const g = gameState();
    const room = lastLobbyRoom || {};
    const code = g?._onlineRoomCode || activeRoom || room.roomCode || '';
    const key = currentMatchPreloadKey(room);
    const timeoutMs = Math.max(3000, Math.min(10000, Number(opts.timeoutMs) || 10000));
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : function(){};
    const started = Date.now();
    const perf = window.__fatePerf = window.__fatePerf || {};
    return new Promise(function(resolve){
      let settled = false;
      let unsub = null;
      let timeout = 0;
      const finish = function(reason, snap){
        if(settled) return;
        settled = true;
        if(timeout) clearTimeout(timeout);
        try{ if(unsub) unsub(); }catch(e){}
        const result = Object.assign({reason, ms:Date.now() - started}, snap || playableReadySnapshot(room, lastLobbyPlayers, key));
        perf.onlineMatchPlayableWait = result;
        resolve(result);
      };
      const check = function(players, nextRoom){
        const currentRoom = nextRoom || lastLobbyRoom || room;
        const snap = playableReadySnapshot(currentRoom, players || lastLobbyPlayers, key);
        onProgress(snap);
        if(snap.readyCount >= snap.total && snap.total >= 2) finish('both-playable', snap);
      };
      check(lastLobbyPlayers, room);
      timeout = setTimeout(function(){
        finish('timeout', playableReadySnapshot(lastLobbyRoom || room, lastLobbyPlayers, key));
      }, timeoutMs);
      const done = function(reason, snap){
        finish(reason, snap);
      };
      if(roomUsesFly(room || code)){
        const poll = async function(){
          if(settled) return;
          try{
            const data = await flyApiRequest(`/api/rooms/${encodeURIComponent(code)}`);
            if(data?.room){
              const nextRoom = normalizeFlyRoom(data.room);
              lastLobbyRoom = nextRoom;
              lastLobbyPlayers = nextRoom.players;
              const snap = playableReadySnapshot(nextRoom, nextRoom.players, key);
              onProgress(snap);
              if(snap.readyCount >= snap.total && snap.total >= 2) return done('both-playable', snap);
            }
          }catch(e){}
          if(!settled) setTimeout(poll, 650);
        };
        poll();
        return;
      }
      if(FO.onValue && FO.ref && FO.rtdb && code){
        unsub = FO.onValue(FO.ref(FO.rtdb, `rooms/${code}/players`), function(snap){
          const players = snap.val() || {};
          lastLobbyPlayers = players;
          check(players, lastLobbyRoom || room);
        });
      }
    });
  }
  function stopConnectionHeartbeat(){
    if(_connectedUnsub){ try{ _connectedUnsub(); }catch(e){} _connectedUnsub = null; }
  }

  function openRoomMenu(mode='freeplay'){
    const u = getUser(); if(!u) return;
    const roomMode = normalizeRoomMode(mode);
    const isRanked = roomMode === 'ranked';
    showModal(isRanked ? 'Ranked Match Room' : 'Human Room', `
      <div class="online-room-menu">
        <div class="online-room-art"><img src="${typeof FATE_BACKGROUND_URL === 'function' ? FATE_BACKGROUND_URL('optimized/backgrounds/titlscreenbackgrounds_bg1.jpg') : 'optimized/backgrounds/titlscreenbackgrounds_bg1.jpg'}" alt="Fates Entwined title background" loading="eager" onerror="this.onerror=null;this.src='titlscreenbackgrounds/bg1.png?v=bg20260510d';"></div>
        <div class="online-room-controls">
          <div class="online-room-copy">${isRanked ? 'Create or join a ranked Challenger room. Results update Challenger ELO and the online leaderboard.' : `Create a private room code or join a friend's room.`}</div>
          <button class="btn pri" onclick="window.fateCreateRoom('${roomMode}')">Create Room</button>
          <div class="online-room-join"><input id="online-room-code-input" maxlength="6" placeholder="ROOM CODE"><button class="btn" onclick="window.fateJoinRoomFromInput()">Join</button></div>
        </div>
      </div>`, [{label:'Cancel', action:closeModal}]);
  }

  async function createFlyRoom(mode='freeplay'){
    const u = getUser(); if(!u) return false;
    const prof = await profile();
    const pendingDeck = consumePendingRoomDeck(mode);
    const data = await flyApiRequest('/api/rooms', {
      method:'POST',
      body:{
        uid:u.uid,
        mode,
        profile:prof,
        deckChoice:flyDeckChoiceFromRoomDeck(pendingDeck)
      }
    });
    const room = normalizeFlyRoom(data.room);
    activeRoom = room.roomCode;
    lastLobbyRoom = room;
    lastLobbyPlayers = room.players;
    watchFlyRoom(room.roomCode, {openDeckPicker:!pendingDeck});
    return true;
  }

  async function joinFlyRoom(code, opts={}){
    const u = getUser(); if(!u) return false;
    const quiet = !!opts.quiet;
    const prof = await profile();
    const pendingDeck = consumePendingRoomDeck(opts.mode || 'freeplay');
    try{
      const data = await flyApiRequest(`/api/rooms/${encodeURIComponent(code)}/join`, {
        method:'POST',
        body:{
          uid:u.uid,
          profile:prof,
          deckChoice:flyDeckChoiceFromRoomDeck(pendingDeck)
        }
      });
      const room = normalizeFlyRoom(data.room);
      if(room.status !== 'lobby' && !opts.allowStarted){
        if(!quiet && window.toast) toast('Room already started');
        return false;
      }
      activeRoom = room.roomCode;
      lastLobbyRoom = room;
      lastLobbyPlayers = room.players;
      if(room.status !== 'lobby' && opts.allowStarted){
        await resumeFlyRoom(room.roomCode, {silent:!!opts.silent, quiet, allowEnter:true, reason:'explicit-resume'});
        if(!quiet && window.toast) toast('Rejoining online match...');
        return true;
      }
      watchFlyRoom(room.roomCode, {openDeckPicker:!pendingDeck && room.status === 'lobby', silent:!!opts.silent});
      if(!quiet && room.status !== 'lobby' && window.toast) toast('Rejoining online match...');
      return true;
    }catch(e){
      console.error('Fly room join failed', e);
      if(!quiet && window.toast) toast(/not found/i.test(e.message || '') ? 'Room not found' : 'Could not join room');
      return false;
    }
  }

  async function resumeFlyRoom(code, opts={}){
    const data = await flyApiRequest(`/api/rooms/${encodeURIComponent(code)}/resume?after=0&limit=500`);
    const room = normalizeFlyRoom(data.room);
    if(!room.roomCode) throw new Error('Fly resume returned no room');
    const events = Array.isArray(data.events) ? data.events : [];
    activeRoom = room.roomCode;
    lastLobbyRoom = room;
    lastLobbyPlayers = room.players;
    lastActionSeq = Math.max(lastActionSeq || 0, Number(data.lastSeq || room.lastActionSeq || 0) || 0);
    if(data.serverStateHash || data.canonicalHash) lastAuthorityStateHash = String(data.serverStateHash || data.canonicalHash || '');
    pendingFlyResumeEvents = {
      roomCode:room.roomCode,
      lastSeq:Number(data.lastSeq || room.lastActionSeq || 0) || 0,
      events
    };
    if(opts.allowEnter || opts.resume || opts.userInitiated) allowOnlineMatchStart(room.roomCode, opts.reason || 'explicit-resume');
    watchFlyRoom(room.roomCode, {silent:!!opts.silent});
    if(room.status === 'matchup' || room.status === 'starting' || room.status === 'playing' || room.status === 'ended'){
      maybeStartRoomGame(room, opts.reason || 'resume');
    }
    return room;
  }

  async function discoverMyFlyRooms(opts={}){
    const u = getUser();
    if(!u || !flyRoomsEnabled()) return [];
    const includeEnded = opts.includeEnded ? '1' : '0';
    const limit = Math.min(50, Math.max(1, Number(opts.limit || 10) || 10));
    const data = await flyApiRequest(`/api/rooms?uid=${encodeURIComponent(u.uid)}&includeEnded=${includeEnded}&limit=${limit}`);
    return (Array.isArray(data?.rooms) ? data.rooms : [])
      .map(normalizeFlyRoom)
      .filter(room=>room.roomCode && (opts.includeEnded || room.status !== 'ended'));
  }

  function bestRecoverableFlyRoom(rooms){
    const list = Array.isArray(rooms) ? rooms.filter(room=>room && room.roomCode && room.status !== 'ended') : [];
    if(!list.length) return null;
    const rank = room=>{
      const status = String(room.status || room.phase || '').toLowerCase();
      if(status === 'playing' || status === 'matchup' || status === 'starting') return 0;
      if(status === 'lobby') return 1;
      return 2;
    };
    list.sort((a,b)=>{
      const ar = rank(a);
      const br = rank(b);
      if(ar !== br) return ar - br;
      return (Number(b.updatedAt || b.lastTouched || b.startedAt || 0) || 0) - (Number(a.updatedAt || a.lastTouched || a.startedAt || 0) || 0);
    });
    return list[0] || null;
  }

  async function recoverMyFlyRoom(opts={}){
    if(activeRoom || gameState()?._onlineRoomCode || !flyRoomsEnabled()) return null;
    const rooms = await discoverMyFlyRooms({limit:10});
    const room = bestRecoverableFlyRoom(rooms);
    if(!room) return null;
    activeRoom = room.roomCode;
    lastLobbyRoom = room;
    lastLobbyPlayers = room.players;
    if(room.status === 'lobby'){
      watchFlyRoom(room.roomCode, {silent:!!opts.silent});
      if(!opts.silent && window.toast) toast('Recovered online room ' + room.roomCode + '.');
      return room;
    }
    await resumeFlyRoom(room.roomCode, {silent:true, allowEnter:false, reason:'startup-recovery'});
    if(!opts.silent && window.toast) toast('Found online match ' + room.roomCode + '. Use Resume to rejoin.');
    return room;
  }

  async function createRoom(mode='freeplay'){
    const u = getUser(); if(!u) return;
    mode = normalizeRoomMode(mode);
    if(flyRoomsEnabled()){
      try{
        return await createFlyRoom(mode);
      }catch(e){
        console.error('Fly room create failed', e);
        if(window.toast) toast('Could not create Fly room. Check authority server.');
        return false;
      }
    }
    if(!firebaseRoomTransportAllowed()){
      warnBlockedRtdbRoomFallback('rooms/create');
      if(window.toast) toast('Fly authority is required while RTDB is disabled.');
      return false;
    }
    const prof = await profile();
    const now = FO.serverTimestamp();
    let code = '';
    let created = false;
    for(let i=0;i<12;i++){
      code = makeCode();
      const roomPayload = { roomCode:code, mode, status:'lobby', hostUid:u.uid, guestUid:null, createdAt:now, updatedAt:now, lastActionSeq:0, schemaVersion:1 };
      if(FO.runTransaction){
        const claim = await FO.runTransaction(FO.ref(FO.rtdb, `rooms/${code}`), current => current ? undefined : roomPayload).catch(e=>{ console.error('Room create transaction failed', e); return null; });
        if(claim && claim.committed){ created = true; break; }
      }else{
        const exists = (await FO.get(FO.ref(FO.rtdb, `rooms/${code}`))).exists();
        if(!exists){
          await FO.set(FO.ref(FO.rtdb, `rooms/${code}`), roomPayload);
          created = true;
          break;
        }
      }
    }
    if(!created){ if(window.toast) toast('Could not create a room code. Try again.'); return; }
    const pendingDeck = consumePendingRoomDeck(mode);
    try{
      await FO.set(FO.ref(FO.rtdb, `rooms/${code}/players/${u.uid}`), { uid:u.uid, role:'host', ready:!!pendingDeck, connected:true, joinedAt:now, profileSnapshot:prof, selectedDeckKey:pendingDeck?.selectedDeckKey || '', selectedDeckName:pendingDeck?.selectedDeckName || '', deckIds:pendingDeck?.deckIds || [] });
    }catch(e){
      console.error('Host room player write failed', e);
      await FO.remove(FO.ref(FO.rtdb, `rooms/${code}`)).catch(()=>{});
      if(window.toast) toast('Could not create room. Try again.');
      return;
    }
    await setConnectedOnDisconnect(code, u.uid);
    watchRoom(code, {openDeckPicker:!pendingDeck});
    startConnectionHeartbeat(code, u.uid);
  }

  async function joinRoom(codeRaw, opts={}){
    const u = getUser(); if(!u) return;
    const quiet = !!opts.quiet;
    const code = String(codeRaw||'').trim().toUpperCase();
    if(!/^[A-Z0-9]{6}$/.test(code)){ if(!quiet && window.toast) toast('Enter a valid 6-character room code'); return false; }
    if(flyRoomsEnabled()){
      return await joinFlyRoom(code, opts);
    }
    if(!firebaseRoomTransportAllowed()){
      warnBlockedRtdbRoomFallback('rooms/join');
      if(!quiet && window.toast) toast('Fly authority is required while RTDB is disabled.');
      return false;
    }
    const snap = await FO.get(FO.ref(FO.rtdb, `rooms/${code}`));
    const room = snap.val();
    if(!room){ if(!quiet && window.toast) toast('Room not found'); return false; }
    if(room.status !== 'lobby'){
      const canResumeStartedRoom = !!opts.allowStarted && (room.hostUid === u.uid || room.guestUid === u.uid);
      if(canResumeStartedRoom){
        allowOnlineMatchStart(code, opts.reason || 'explicit-resume');
        watchRoom(code, {silent:!!opts.silent});
        startConnectionHeartbeat(code, u.uid);
        setConnectedOnDisconnect(code, u.uid).catch(()=>{});
        FO.update(FO.ref(FO.rtdb), { [`rooms/${code}/players/${u.uid}/connected`]: true }).catch(()=>{});
        if(!quiet && window.toast) toast('Rejoining online match...');
        return true;
      }
      if(!quiet && window.toast) toast('Room already started');
      return false;
    }
    if(room.hostUid === u.uid){ watchRoom(code, {silent:!!opts.silent}); startConnectionHeartbeat(code, u.uid); return true; }
    let staleGuestUid = null;
    if(room.guestUid && room.guestUid !== u.uid){
      const guest = (await FO.get(FO.ref(FO.rtdb, `rooms/${code}/players/${room.guestUid}`))).val();
      if(isConnectedPlayer(guest)){ if(!quiet && window.toast) toast('Room is full'); return false; }
      staleGuestUid = room.guestUid;
    }
    const prof = await profile();
    const now = FO.serverTimestamp();
    const pendingDeck = consumePendingRoomDeck(room.mode);
    if(FO.runTransaction){
      const claim = await FO.runTransaction(FO.ref(FO.rtdb, `rooms/${code}/guestUid`), current => {
        if(!current || current === u.uid || current === staleGuestUid) return u.uid;
        return;
      }).catch(e=>{ console.error('Guest seat claim failed', e); return null; });
      if(!claim || !claim.committed){
        if(!quiet && window.toast) toast('Room is full');
        return false;
      }
    }else{
      const currentGuest = FO.get ? (await FO.get(FO.ref(FO.rtdb, `rooms/${code}/guestUid`)).catch(()=>null))?.val() : null;
      if(currentGuest && currentGuest !== u.uid && currentGuest !== staleGuestUid){
        if(!quiet && window.toast) toast('Room is full');
        return false;
      }
      await FO.set(FO.ref(FO.rtdb, `rooms/${code}/guestUid`), u.uid).catch(e=>{
        console.error('Guest seat claim failed', e);
        throw e;
      });
    }
    try{
      await FO.set(FO.ref(FO.rtdb, `rooms/${code}/players/${u.uid}`), {
        uid:u.uid,
        role:'guest',
        ready:!!pendingDeck,
        connected:true,
        joinedAt:now,
        profileSnapshot:prof,
        selectedDeckKey:pendingDeck?.selectedDeckKey || '',
        selectedDeckName:pendingDeck?.selectedDeckName || '',
        deckIds:pendingDeck?.deckIds || []
      });
      await touchRoomUpdatedAt(code, now);
    }catch(e){
      console.error('Guest room player write failed', e);
      await FO.remove(FO.ref(FO.rtdb, `rooms/${code}/players/${u.uid}`)).catch(()=>{});
      await releaseGuestSeatIfHeld(code, u.uid);
      if(!quiet && window.toast) toast('Could not join room. Try again.');
      return false;
    }
    await setConnectedOnDisconnect(code, u.uid);
    watchRoom(code, {openDeckPicker:!pendingDeck, silent:!!opts.silent});
    startConnectionHeartbeat(code, u.uid);
    return true;
  }
  function joinFromInput(){ const inp=document.getElementById('online-room-code-input'); joinRoom(inp?.value||''); }

  function isStartedRoomStatus(status){
    return /^(matchup|starting|playing)$/i.test(String(status || ''));
  }

  function maybePrejoinLobbyAuthority(room){
    if(!room || !room.roomCode || isStartedRoomStatus(room.status)) return;
    if(!configuredAuthorityUrl() || typeof WebSocket === 'undefined') return;
    const code = String(room.roomCode || '').trim().toUpperCase();
    if(!code) return;
    if(Date.now() < lobbyAuthorityPrejoinNextAt) return;
    if(lobbyAuthorityPrejoinCode === code && authorityRoomCode === code && (authorityJoined || authorityJoinPromise)) return;
    lobbyAuthorityPrejoinCode = code;
    ensureAuthorityJoined(code).then(function(){
      if(lobbyAuthorityPrejoinCode === code){
        lobbyAuthorityPrejoinAttempts = 0;
        lobbyAuthorityPrejoinNextAt = 0;
      }
    }).catch(function(err){
      if(lobbyAuthorityPrejoinCode === code){
        lobbyAuthorityPrejoinAttempts += 1;
        lobbyAuthorityPrejoinNextAt = Date.now() + Math.min(15000, 2500 * lobbyAuthorityPrejoinAttempts);
        lobbyAuthorityPrejoinCode = '';
      }
      console.warn('Fly lobby authority prejoin failed', err);
    });
  }

  function watchFlyRoom(code, opts={}){
    activeRoom = code;
    clearRoomWatchers();
    activeRoom = code;
    activeRoomSilent = !!opts.silent;
    if(!activeRoomSilent) closeModal();
    let stopped = false;
    let timer = 0;
    let lastWarn = 0;
    let lastHeartbeatAt = 0;
    let notFoundCount = 0;
    async function sendFlyHeartbeat(){
      const u = window.FATE_ONLINE?.user;
      if(!u || Date.now() - lastHeartbeatAt < 5000) return;
      lastHeartbeatAt = Date.now();
      await flyApiRequest(`/api/rooms/${encodeURIComponent(code)}/heartbeat`, {
        method:'POST',
        timeoutMs:30000,
        body:{uid:u.uid}
      }).then(data=>{
        if(data?.room){
          const nextRoom = normalizeFlyRoom(data.room);
          lastLobbyRoom = nextRoom;
          lastLobbyPlayers = nextRoom.players;
        }
      }).catch(e=>{
        if(e && e.status === 404) return;
        if(Date.now() - lastWarn > 5000){
          console.warn('Fly room heartbeat failed', e);
          lastWarn = Date.now();
        }
      });
    }
    function handleFlyRoom(apiRoom){
      const room = normalizeFlyRoom(apiRoom);
      if(!room.roomCode) return;
      notFoundCount = 0;
      lastLobbyRoom = room;
      lastLobbyPlayers = room.players;
      maybePrejoinLobbyAuthority(room);
      syncRoomChatToInGame(room);
      if(activeRoomSilent) {
        // Keep the cached room fresh without reopening the lobby modal.
      }else{
        renderLobby(room, room.players);
      }
      evaluateLagPause();
      maybeHandleOpponentDisconnect(room, room.players);
      maybeAutoStartQueuedRoom(room, room.players);
      if(isStartedRoomStatus(room.status)) maybeStartRoomGame(room, 'fly-watch');
      if(room.status === 'ended') handleRoomEnded(room);
    }
    async function poll(){
      if(stopped) return;
      try{
        const data = await flyApiRequest(`/api/rooms/${encodeURIComponent(code)}`, { timeoutMs:12000 });
        if(data?.room) handleFlyRoom(data.room);
        await sendFlyHeartbeat();
      }catch(e){
        if(e && e.status === 404){
          notFoundCount += 1;
          recordOnlineDiagnostic('fly-room-not-found', {
            roomCode:String(code || '').toUpperCase(),
            count:notFoundCount,
            reason:e.message || String(e)
          });
          if(notFoundCount >= 2){
            stopped = true;
            if(timer) clearTimeout(timer);
            if(String(activeRoom || '').toUpperCase() === String(code || '').toUpperCase()) activeRoom = null;
            if(lastLobbyRoom && String(lastLobbyRoom.roomCode || '').toUpperCase() === String(code || '').toUpperCase()) lastLobbyRoom = null;
            lastLobbyPlayers = null;
            if(!activeRoomSilent && window.toast) toast('That online room is no longer available.');
          }
          return;
        }
        if(Date.now() - lastWarn > 5000){
          console.warn('Fly room watch failed', e);
          lastWarn = Date.now();
        }
      }finally{
        if(!stopped) {
          const watchingQueuedRoom = randomQueueState.active
            && String(randomQueueState.roomCode || '').toUpperCase() === String(code || '').toUpperCase();
          const startingOrFreshRoom = watchingQueuedRoom || isStartedRoomStatus(lastLobbyRoom && lastLobbyRoom.roomCode === code ? lastLobbyRoom.status : '');
          timer = setTimeout(poll, startingOrFreshRoom ? 300 : 900);
        }
      }
    }
    roomUnsub = function(){
      stopped = true;
      if(timer) clearTimeout(timer);
    };
    poll();
    if(opts.openDeckPicker && !activeRoomSilent) setTimeout(()=>openOnlineDeckPicker(code), 120);
  }

  function watchRoom(code, opts={}){
    activeRoom = code;
    clearRoomWatchers();
    activeRoom = code;
    activeRoomSilent = !!opts.silent;
    if(!activeRoomSilent) closeModal();
    if(roomUsesFly(code) || flyRoomsEnabled()){
      watchFlyRoom(code, opts);
      return;
    }
    if(!firebaseRoomTransportAllowed()){
      warnBlockedRtdbRoomFallback('rooms/watch');
      if(!activeRoomSilent && window.toast) toast('Fly authority is required while RTDB is disabled.');
      return;
    }
    const roomFieldUnsubs = [];
    const pr = FO.ref(FO.rtdb, `rooms/${code}/players`);
    let initialRoomLoaded = false;
    let handlingRoom = false;
    function mergeRoomPatch(patch){
      lastLobbyRoom = Object.assign({ roomCode:code }, lastLobbyRoom || {}, patch || {});
      return lastLobbyRoom;
    }
    function handleWatchedRoom(room){
      if(!room || handlingRoom) return;
      handlingRoom = true;
      try{
        if(activeRoomSilent) lastLobbyRoom = room;
        else renderLobby(room);
        evaluateLagPause();
        maybeHandleOpponentDisconnect(room, lastLobbyPlayers || {});
        maybeAutoStartQueuedRoom(room, lastLobbyPlayers || {});
        if(room.status==='matchup' || room.status==='starting' || room.status==='playing') maybeStartRoomGame(room, 'rtdb-watch');
        if(room.status==='ended') handleRoomEnded(room);
      }finally{
        handlingRoom = false;
      }
    }
    function watchRoomField(field){
      const unsub = FO.onValue(FO.ref(FO.rtdb, `rooms/${code}/${field}`), snap=>{
        const value = snap.val();
        if(value === null && field === 'status'){
          leaveRoom(false, true);
          return;
        }
        const room = mergeRoomPatch({ [field]:value });
        if(initialRoomLoaded) handleWatchedRoom(room);
      });
      roomFieldUnsubs.push(unsub);
    }
    FO.get(FO.ref(FO.rtdb, `rooms/${code}`)).then(s=>{
      const room = s.val();
      if(!room){ leaveRoom(false, true); return; }
      mergeRoomPatch(room);
      initialRoomLoaded = true;
      handleWatchedRoom(lastLobbyRoom);
    }).catch(e=>{
      console.warn('Room load failed', e);
      if(window.toast) toast('Could not load room');
    });
    ['status','phase','guestUid','hostUid','mode','seed','song','currentTurnUid','lastActionSeq','startedAt','endedAt'].forEach(watchRoomField);
    const chatUnsub = FO.onValue(cappedRoomChatRef(code), s=>{
      const chat = s.val() || {};
      const room = mergeRoomPatch({ chat });
      syncRoomChatToInGame(room);
      if(!activeRoomSilent && room.status === 'lobby') renderLobby(room, null, true);
    });
    roomFieldUnsubs.push(chatUnsub);
    roomUnsub = function(){
      roomFieldUnsubs.forEach(unsub=>{ try{ if(unsub) unsub(); }catch(e){} });
    };
    playersUnsub = FO.onValue(pr, s=>{
      const players = s.val() || {};
      if(activeRoomSilent) lastLobbyPlayers = players;
      else renderLobby(null, players);
      evaluateLagPause();
      maybeHandleOpponentDisconnect(lastLobbyRoom, players);
      maybeAutoStartQueuedRoom(lastLobbyRoom, players);
      maybeApplyTurnChoiceFallback(players);
      maybeApplyPlayerActionFallback(players);
    });
    if(opts.openDeckPicker && !activeRoomSilent) setTimeout(()=>openOnlineDeckPicker(code), 120);
  }

  function maybeAutoStartQueuedRoom(room, players){
    if(!randomQueueState.active || !room || room.roomCode !== randomQueueState.roomCode) return;
    const u = window.FATE_ONLINE?.user;
    if(!u) return;
    if(room.status === 'matchup' || room.status === 'starting' || room.status === 'playing'){
      allowOnlineMatchStart(room.roomCode, 'random-queue');
      randomQueueState.started = true;
      clearRandomQueueWatcher();
      removeOwnQueueEntry().catch(()=>{});
      emitRandomQueueStatus('matched', 'Match found. Starting game...');
      return;
    }
    if(room.status !== 'lobby' || room.hostUid !== u.uid) return;
    const hostNode = players?.[room.hostUid];
    const guestNode = room.guestUid ? players?.[room.guestUid] : null;
    if(!room.guestUid || !isConnectedPlayer(hostNode) || !isConnectedPlayer(guestNode) || !hasValidDeck(hostNode) || !hasValidDeck(guestNode)) return;
    if(autoStartCode === room.roomCode) return;
    autoStartCode = room.roomCode;
    clearTimeout(autoStartTimer);
    emitRandomQueueStatus('matched', 'Opponent found. Preparing match...');
    autoStartTimer = setTimeout(async ()=>{
      try{
        await removeOwnQueueEntry();
        await hostStartRoom(room.roomCode, {queue:true});
      }catch(e){
        console.error('Queued room auto-start failed', e);
        emitRandomQueueStatus('error', 'Could not start the queued match. Retrying...');
        autoStartCode = null;
      }
    }, 420);
  }


  async function renderLobby(room, playersOverride, profileOnly=false){
    if(room) lastLobbyRoom = room;
    if(playersOverride) lastLobbyPlayers = playersOverride;
    const current = lastLobbyRoom;
    if(!current) return;
    if(current.status && current.status !== 'lobby') return;
    if(!lastLobbyPlayers && !profileOnly){
      lastLobbyPlayers = (await FO.get(FO.ref(FO.rtdb, `rooms/${current.roomCode}/players`))).val() || {};
    }
    const players = lastLobbyPlayers || {};
    const hostNode = players[current.hostUid];
    const guestNode = current.guestUid ? players[current.guestUid] : null;
    const guestActive = !!(current.guestUid && isConnectedPlayer(guestNode));
    const hostActive = isConnectedPlayer(hostNode);
    const keep = new Set([current.hostUid]);
    if(current.guestUid) keep.add(current.guestUid);
    if(current._flyRoom){
      cleanupRoomProfileSubs(null);
    }else{
      keep.forEach(ensureRoomProfile);
      cleanupRoomProfileSubs(keep);
    }

    const u = window.FATE_ONLINE?.user;
    const isHost = u && current.hostUid === u.uid;
    const isRanked = normalizeRoomMode(current.mode) === 'ranked';
    const profFor = p => liveProfiles.get(p?.uid) || p?.profileSnapshot || {};
    const seat = (label, p, active=true) => {
      if(!p || !active) return `<div class="online-room-seat online-seat-card-v2 waiting"><div class="online-seat-pic"><img src="blank.png"></div><div class="online-seat-copy"><div class="online-seat-label">${esc(label)}</div><div class="online-seat-name">Waiting for player</div><div class="online-seat-meta">Share the room code</div></div></div>`;
      const prof = profFor(p);
      const level = Number(prof.level || 1) || 1;
      const elo = Number(prof.challengerElo || prof.elo || 600) || 600;
      const levelBadge = typeof window.renderLevelBadge === 'function' ? window.renderLevelBadge(level, {small:true}) : `<span class="online-seat-level-fallback">Lv ${level}</span>`;
      return `<div class="online-room-seat online-seat-card-v2"><div class="online-seat-pic"><img src="${esc(pPhoto(prof))}" onerror="this.onerror=null;this.src='blank.png';"></div><div class="online-seat-copy"><div class="online-seat-label">${esc(label)}</div><div class="online-seat-name">${esc(pName(prof))}</div><div class="online-seat-meta">${elo} Elo</div><div class="online-seat-level">${levelBadge}</div></div></div>`;
    };
    const actions = [{label:'Leave', danger:true, action:()=>leaveRoom(true)}];
    const localNode = u ? players[u.uid] : null;
    if(u) actions.push({label: hasValidDeck(localNode) ? 'Change Deck' : 'Choose Deck', pri:!hasValidDeck(localNode), action:()=>openOnlineDeckPicker(current.roomCode)});
    const hostReady = hostActive && hasValidDeck(hostNode);
    const guestReady = guestActive && hasValidDeck(guestNode);
    const canStart = !!(isHost && guestActive && hostReady && guestReady);
    const startInline = isHost
      ? `<button class="btn pri online-room-start-btn" ${canStart?'':'disabled'} onclick="window.fateHostStartRoom('${esc(current.roomCode)}')">Start Game</button>`
      : `<div class="online-room-countdown">Waiting for host to start...</div>`;
    const chatDraft = document.getElementById('online-room-chat-input')?.value || '';
    const html = `
      <div class="online-room-lobby online-room-lobby-v15 online-room-lobby-v21">
        <div class="online-room-code">${esc(current.roomCode)}</div>
        ${isRanked ? '<div class="online-room-mode-pill">Ranked Challenger Match</div>' : ''}
        <div class="online-room-seats">${seat('Host', hostNode, hostActive)}${seat('Guest', guestNode, guestActive)}</div>
        <div class="online-room-deck-panel">
          <div class="online-room-deck-title">Selected Decks</div>
          <div class="online-room-deck-ready">
            <span>Host: ${esc(selectedDeckName(hostNode))}</span>
            <span>Guest: ${esc(guestActive ? selectedDeckName(guestNode) : 'Waiting')}</span>
          </div>
        </div>
        ${renderLobbyChat(current)}
        <div class="online-room-start-row">${guestActive ? startInline : '<div class="online-room-note online-room-wait-note">Waiting for a second player.</div>'}</div>
        <div class="online-room-note">Host starts after both players choose decks. The server opens the match for both clients.</div>
      </div>`;
    if(deckPickerOpenForRoom === current.roomCode) return;
    if(html === lastLobbyHtml && document.getElementById('modal')?.style?.display !== 'none') return;
    lastLobbyHtml = html;
    showModal((isRanked ? 'Ranked Room ' : 'Room ') + esc(current.roomCode), html, actions);
    const input = document.getElementById('online-room-chat-input');
    if(input && chatDraft) input.value = chatDraft;
    const messages = document.getElementById('online-room-chat-messages');
    if(messages) messages.scrollTop = messages.scrollHeight;
  }

  async function hostStartRoomFly(code, opts={}){
    const u = getUser(); if(!u) return false;
    const room = lastLobbyRoom && lastLobbyRoom.roomCode === code ? lastLobbyRoom : null;
    if(!room || room.hostUid !== u.uid){ if(window.toast) toast('Only host can start'); return false; }
    if(room.status !== 'lobby') return false;
    const players = lastLobbyPlayers || room.players || {};
    const hostNode = players[room.hostUid];
    const guest = room.guestUid ? players[room.guestUid] : null;
    if(!room.guestUid || !guest){ if(window.toast) toast('Waiting for guest'); return false; }
    if(!hasValidDeck(hostNode) || !hasValidDeck(guest)){ if(window.toast) toast('Both players need a 40-card deck'); return false; }
    const seed = `${code}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const song = pickSongForSeed(seed);
    try{
      const data = await flyApiRequest(`/api/rooms/${encodeURIComponent(code)}/start`, {
        method:'POST',
        timeoutMs:45000,
        body:{uid:u.uid, seed, song, mode:normalizeRoomMode(room.mode)}
      });
      if(data?.accepted && String(data.accepted.action?.type || '').toUpperCase() !== 'MATCH_START') bufferOnlineAction(data.accepted.action);
      else if(data?.accepted?.action) rememberFlyStartAction(code, data.accepted.action);
      if(data?.room){
        const nextRoom = normalizeFlyRoom(data.room);
        nextRoom._startAction = cachedFlyStartAction(nextRoom.roomCode || code);
        lastLobbyRoom = nextRoom;
        lastLobbyPlayers = nextRoom.players;
        allowOnlineMatchStart(nextRoom.roomCode || code, opts.queue ? 'queue-host-start' : 'host-start');
        maybeStartRoomGame(nextRoom, opts.queue ? 'queue-host-start' : 'host-start');
      }
      return true;
    }catch(e){
      console.error('Fly start room failed', e);
      if(window.toast) toast('Start failed - check console');
      return false;
    }
  }

  async function fetchFlyStartAction(code){
    const cached = cachedFlyStartAction(code);
    if(cached) return cached;
    const data = await flyApiRequest(`/api/rooms/${encodeURIComponent(code)}/events?after=0&limit=300`, { timeoutMs:12000 });
    const events = Array.isArray(data?.events) ? data.events : [];
    const matchStart = events.find(item=>String(item?.action?.type || '').toUpperCase() === 'MATCH_START');
    return rememberFlyStartAction(code, matchStart?.action) || null;
  }

  async function hostStartRoom(code, opts={}){
    const u=getUser(); if(!u) return;
    if(roomUsesFly(code)) return await hostStartRoomFly(code, opts);
    try{
      const room=(await FO.get(FO.ref(FO.rtdb,`rooms/${code}`))).val();
      if(!room || room.hostUid !== u.uid){ if(window.toast) toast('Only host can start'); return; }
      if(room.status !== 'lobby') return;
      const hostNode = (await FO.get(FO.ref(FO.rtdb,`rooms/${code}/players/${room.hostUid}`))).val();
      const guest = room.guestUid ? (await FO.get(FO.ref(FO.rtdb,`rooms/${code}/players/${room.guestUid}`))).val() : null;
      if(!room.guestUid || !guest){ if(window.toast) toast('Waiting for guest'); return; }
      if(!Array.isArray(hostNode?.deckIds) || hostNode.deckIds.length !== 40 || !Array.isArray(guest.deckIds) || guest.deckIds.length !== 40){ if(window.toast) toast('Both players need a 40-card deck'); return; }
      const seed = `${code}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const roomMode = normalizeRoomMode(room.mode);
      const song = pickSongForSeed(seed);
      const hostProf = liveProfiles.get(room.hostUid) || (await FO.get(FO.ref(FO.rtdb, `publicProfiles/${room.hostUid}`))).val() || {};
      const guestProf = liveProfiles.get(room.guestUid) || (await FO.get(FO.ref(FO.rtdb, `publicProfiles/${room.guestUid}`))).val() || {};
      if(!isConnectedPlayer(hostNode) || !isConnectedPlayer(guest)){ if(window.toast) toast('Both players must be connected'); return; }
      allowOnlineMatchStart(code, opts.queue ? 'queue-host-start' : 'host-start');
      await FO.update(FO.ref(FO.rtdb), {
        [`rooms/${code}/status`]: 'matchup',
        [`rooms/${code}/phase`]: 'matchup',
        [`rooms/${code}/startedAt`]: FO.serverTimestamp(),
        [`rooms/${code}/updatedAt`]: FO.serverTimestamp(),
        [`rooms/${code}/seed`]: seed,
        [`rooms/${code}/song`]: song,
        [`rooms/${code}/playerOrder/0`]: room.hostUid,
        [`rooms/${code}/playerOrder/1`]: room.guestUid,
        [`rooms/${code}/currentTurnUid`]: room.hostUid,
        [`rooms/${code}/lastActionSeq`]: 1,
        [`rooms/${code}/actions/000001`]: {
          seq:1,
          uid:u.uid,
          type:'MATCH_START',
          payload:{ seed, song, hostUid:room.hostUid, guestUid:room.guestUid, mode:roomMode, profiles:{0:hostProf,1:guestProf}, decks:{0:hostNode.deckIds,1:guest.deckIds}, deckNames:{0:hostNode.selectedDeckName||'Host Deck',1:guest.selectedDeckName||'Guest Deck'} },
          createdAt:FO.serverTimestamp()
        }
      });
    }catch(e){
      console.error('Start room failed', e);
      if(window.toast) toast('Start failed â€” check console');
    }
  }

  async function startRoomGame(room){
    const g = gameState();
    if(!g){
      console.error('Online room start failed: game state bridge is unavailable');
      if(window.toast) toast('Game state is not ready yet');
      return;
    }
    if(startingLock) return;
    if(g._onlineStartedRoomCode === room.roomCode && isOnlineBootstrapScreenActive()) return;
    startingLock = true;
    g._onlineBootstrappingRoomCode = room.roomCode;
    try{
      closeModal();
      if(randomQueueState.active && randomQueueState.roomCode === room.roomCode){
        randomQueueState.started = true;
        clearRandomQueueWatcher();
        await removeOwnQueueEntry();
        emitRandomQueueStatus('starting', 'Starting match...');
      }
      const u = window.FATE_ONLINE?.user;
      let players = {};
      let startAction = {};
      if(room._flyRoom){
        players = lastLobbyPlayers || room.players || {};
        startAction = room._startAction || cachedFlyStartAction(room.roomCode) || await fetchFlyStartAction(room.roomCode) || {};
        if(!startAction.payload) throw new Error('Fly MATCH_START event is not available yet');
      }else{
        players = (await FO.get(FO.ref(FO.rtdb, `rooms/${room.roomCode}/players`))).val() || {};
        startAction = (await FO.get(FO.ref(FO.rtdb, `rooms/${room.roomCode}/actions/000001`))).val() || {};
      }
      const startPayload = startAction.payload || {};
      const localIndex = u?.uid === room.hostUid ? 0 : 1;
      const seed = room.seed || startPayload.seed || `${room.roomCode}_fallback_seed`;
      const song = room.song || startPayload.song || pickSongForSeed(seed);
      const roomMode = normalizeRoomMode(room.mode || startPayload.mode);
      const decks = startPayload.decks || {};
      if(Array.isArray(decks[0]) && decks[0].length === 40) g.p1Deck = [...decks[0]];
      if(Array.isArray(decks[1]) && decks[1].length === 40) g.p2Deck = [...decks[1]];
      const startSeq = Math.max(1, Number(startAction.seq || room.lastActionSeq || 1) || 1);

      // Set local-only perspective before game creation. These are intentionally
      // never read from remote snapshots and never written by render functions.
      g._onlineRoomCode = room.roomCode;
      g._onlineRole = localIndex === 0 ? 'host' : 'guest';
      g._onlinePlayerIndex = localIndex;
      g.localPlayerIndex = localIndex;
      g.viewerPlayerIndex = localIndex;
      g._onlineActionSeq = 0;
      g._onlineSeed = seed;
      g._onlineRoomMode = roomMode;
      g._onlineGameSong = song;
      g._onlineRng = makeSeededRng(seed);
      g._onlineActionLogMode = true;
      g._onlineActionSeq = startSeq;
      g._onlineAppliedActionSeq = startSeq;
      g._onlineMatchPlayable = false;
      if(typeof window.setFateCurrentMode === 'function') window.setFateCurrentMode(roomMode === 'ranked' ? 'challenger' : 'free');
      applyOnlineRoomIdentity(room, players);

      lastActionSeq = Math.max(lastActionSeq, startSeq);
      lastAppliedActionSeq = Math.max(lastAppliedActionSeq, startSeq);
      discardBufferedActionsThrough(startSeq);
      const directServerBootstrap = !!(startPayload.serverBootstrapped && startPayload.serverStartedDirect && startPayload.postState && startPayload.stateHash && typeof window.startOnlineServerBootstrappedGame === 'function');
      if(directServerBootstrap){
        await new Promise(function(resolve, reject){
          window.startOnlineServerBootstrappedGame({
            song,
            applyServerState:function(){
              lastAuthorityStateHash = String(startPayload.stateHash || '');
              applyOnlineCanonicalState(startPayload.postState, 'server direct match bootstrap');
              applyOnlineRoomIdentity(room, players);
            },
            afterEnter:resolve,
            onError:reject
          });
        });
      } else if(typeof window.startGame === 'function') {
        window.startGame(false);
      }

      // startGame/initGameState touches player names and can rebuild state; restore
      // online-only identity/perspective immediately after without syncing full G.
      g._onlineRoomCode = room.roomCode;
      g._onlineRole = localIndex === 0 ? 'host' : 'guest';
      g._onlinePlayerIndex = localIndex;
      g.localPlayerIndex = localIndex;
      g.viewerPlayerIndex = localIndex;
      g._onlineSeed = seed;
      g._onlineRoomMode = roomMode;
      g._onlineGameSong = song;
      if(typeof window.setFateCurrentMode === 'function') window.setFateCurrentMode(roomMode === 'ranked' ? 'challenger' : 'free');
      if(typeof window.applyGameBackground === 'function') window.applyGameBackground(song);
      if(typeof window._lastGameSong !== 'undefined') window._lastGameSong = song;
      g._onlineActionLogMode = true;
      g._onlineActionSeq = startSeq;
      g._onlineAppliedActionSeq = startSeq;
      g._onlineStartedRoomCode = room.roomCode;
      g._onlineBootstrappingRoomCode = null;
      g._onlineMatchPlayable = false;
      applyOnlineRoomIdentity(room, players);
      if(!directServerBootstrap && startPayload.postState && startPayload.stateHash){
        lastAuthorityStateHash = String(startPayload.stateHash || '');
        applyOnlineCanonicalState(startPayload.postState, 'server match bootstrap');
        applyOnlineRoomIdentity(room, players);
      }
      if(pendingFlyResumeEvents && pendingFlyResumeEvents.roomCode === room.roomCode){
        const resumeEvents = Array.isArray(pendingFlyResumeEvents.events) ? pendingFlyResumeEvents.events : [];
        resumeEvents.forEach(item=>{
          const action = item?.action || item?.accepted?.action || item;
          bufferOnlineAction(action);
        });
        if(Number(pendingFlyResumeEvents.lastSeq || 0) > lastActionSeq) lastActionSeq = Number(pendingFlyResumeEvents.lastSeq || 0);
        pendingFlyResumeEvents = null;
      }
      if(typeof window.updatePlayerBanners === 'function') setTimeout(()=>window.updatePlayerBanners(), 80);
      if(localIndex === 0) setTimeout(()=>updateRoomTurn(gameState()?.currentPlayer), 1200);
      reportActionProgress(lastAppliedActionSeq || lastActionSeq || 1, {force:true});
      if(randomQueueState.roomCode === room.roomCode){
        randomQueueState = { active:false, roomCode:null, role:null, started:true, handlers:null };
      }

      subscribeActions(room.roomCode);
      const latestPlayableState = gameState();
      if(latestPlayableState && latestPlayableState._onlineRoomCode === room.roomCode){
        latestPlayableState._onlineMatchPlayable = true;
      }
      setOnlinePlayableWaitVisible(false);
      publishOnlineMatchPlayableWithRetry().catch(function(err){
        console.warn('Could not publish online playable readiness', err);
        return false;
      });
      waitForOnlineMatchPlayable({
        timeoutMs:6000,
        onProgress:function(snap){
          recordOnlineDiagnostic('online-playable-background-progress', Object.assign({
            roomCode:String(room.roomCode || '').toUpperCase()
          }, snap || {}));
        }
      }).then(function(playable){
        if(playable && playable.reason === 'both-playable'){
          const latest = gameState();
          if(latest && latest._onlineRoomCode === room.roomCode) latest._onlineMatchPlayable = true;
          recordOnlineDiagnostic('online-playable-background-ready', {
            roomCode:String(room.roomCode || '').toUpperCase()
          });
        }else{
          recordOnlineDiagnostic('online-playable-background-timeout', {
            roomCode:String(room.roomCode || '').toUpperCase(),
            reason:playable && playable.reason || 'timeout'
          });
        }
        setOnlinePlayableWaitVisible(false);
      }).catch(function(err){
        console.warn('Online playable background wait failed', err);
        recordOnlineDiagnostic('online-playable-background-failed', {
          roomCode:String(room.roomCode || '').toUpperCase(),
          reason:err && err.message || String(err)
        });
        setOnlinePlayableWaitVisible(false);
      });
      if(localIndex === 0 && !startPayload.serverBootstrapped) setTimeout(()=>sendBootstrapStateSync('match-start'), 220);
      // Spectator listings stay disabled until the deployed RTDB rules explicitly
      // allow /liveMatches writes; player match startup must not depend on them.
      // Install spectator count badge for players
      if(typeof window.fateInstallPlayerSpectatorBadge === 'function') window.fateInstallPlayerSpectatorBadge(room.roomCode);
    }catch(e){
      console.error('Online room game bootstrap failed', e);
      if(window.toast) toast('Online game start failed');
      const latest = gameState();
      if(latest && latest._onlineBootstrappingRoomCode === room.roomCode) latest._onlineBootstrappingRoomCode = null;
    }finally{
      setTimeout(()=>{ startingLock=false; }, 1000);
    }
  }

  async function applyOnlineAction(action){
    const g = gameState();
    if(!isOnlineMatchState(g)) return;
    const type = String(action?.type || '').toUpperCase();
    const payload = action.payload || {};
    const localUid = window.FATE_ONLINE?.user?.uid;
    if(type === 'MATCH_START'){
      if(payload.postState && payload.stateHash){
        if(action.serverStateHash) lastAuthorityStateHash = String(action.serverStateHash || '');
        else lastAuthorityStateHash = String(payload.stateHash || '');
        reconcileOnlinePostState(action, 'server match bootstrap seq ' + (action.seq || '?'));
      }
      return;
    }
    if(shouldApplyServerStateDirectly(type, payload)){
      if(action.uid !== localUid && typeof window.playSfx === 'function') window.playSfx('onlineRemote');
      applyAuthoritativePostState(action, 'authoritative server state seq ' + (action.seq || '?'));
      return;
    }
    const actionPlayer = onlineActionPlayer(action);
    const optimisticActionId = optimisticActionIdFor(action);
    if(action.uid === localUid && optimisticActionId && optimisticAppliedActionIds.has(optimisticActionId)){
      acknowledgeAuthoritativeAction(action, 'local optimistic acknowledgement seq ' + (action.seq || '?'));
      return;
    }
    if(action.uid !== localUid && optimisticActionId && appliedPlayerActionFallbackIds.has(optimisticActionId) && !action._fromPlayerFallback){
      return;
    }
    if(action.uid !== localUid && optimisticActionId){
      appliedPlayerActionFallbackIds.add(optimisticActionId);
    }
    if(type === 'STATE_SYNC'){
      reconcileOnlinePostState(action, 'authoritative state sync seq ' + (action.seq || '?'));
      return;
    }
    if(type === 'EFFECT_CINEMATIC'){
      if(action.uid === localUid){
        acknowledgeAuthoritativeAction(action, 'local cinematic acknowledgement seq ' + (action.seq || '?'));
        return;
      }
      const card = g.board?.[payload.z]?.[payload.r]?.[payload.c] || null;
      if(card && typeof window.showEffectActivationCinematic === 'function') {
        await window.showEffectActivationCinematic(card, {remote:true, source:'online-effect-cinematic'});
      }
      return;
    }
    if(isStrictCompactAuthorityAction(type)){
      console.warn('Strict Fly authority action is missing canonical server state; skipping local replay.', action);
      await resyncRejectedOnlineAction('strict accepted action missing postState ' + type).catch(()=>false);
      return;
    }
    if(action.uid !== localUid) {
      if(type === 'BOARD_ACTION' && /^(triggerCharacterEffect|activatePendingWhenSetEffect)$/i.test(String(payload.fn || ''))) {
        await showPayloadEffectCinematic(g, payload, 'online-precheck-board-effect-cinematic');
      } else if(type === 'MODAL_ACTION' && payload.effectCinematic) {
        await showPayloadEffectCinematic(g, payload, 'online-precheck-modal-effect-cinematic');
      }
    }

    if(type === 'DISCONNECT_TIMEOUT'){
      reconcileOnlinePostState(action, 'server disconnect timeout seq ' + (action.seq || '?'));
      const current = gameState();
      const localIndex = Number.isInteger(current?._onlinePlayerIndex) ? current._onlinePlayerIndex : null;
      const result = payload.postState?.matchResult || payload.matchResult || {};
      const winnerIndex = Number(result.winnerIndex);
      const localWon = localIndex !== null && winnerIndex === localIndex;
      const rewardData = collectOnlineServerRewardData(localWon ? 'victory' : 'defeat', action, current);
      if(window.toast) toast(localWon ? 'Opponent disconnected' : 'Disconnected from match');
      showOnlineForfeitResult(localWon ? 'victory' : 'defeat', captureOnlineGameBackground(), {
        reason:localWon ? 'Opponent disconnected.' : 'You disconnected.',
        rewardData
      });
      if(current) current._onlineResultMarked = true;
      setTimeout(()=>{
        activeRoom = null;
        const latest = gameState();
        if(latest){
          latest._onlineRoomCode = null;
          latest._onlineRole = null;
          latest._onlinePlayerIndex = null;
          latest._onlineRoomMode = null;
          latest.localPlayerIndex = null;
          latest.viewerPlayerIndex = null;
          latest._onlineActionLogMode = false;
          latest._onlineApplyingRemoteAction = false;
        }
        clearRoomWatchers();
      }, 0);
      return;
    }

    if(type === 'MATCH_RESULT'){
      reconcileOnlinePostState(action, 'server match result seq ' + (action.seq || '?'));
      const current = gameState();
      if(current){
        const localIndex = Number.isInteger(current._onlinePlayerIndex) ? current._onlinePlayerIndex : null;
        const result = payload.postState?.matchResult || payload.matchResult || {};
        const winnerIndex = Number(result.winnerIndex);
        const outcome = result.isDraw ? 'draw' : (localIndex !== null && winnerIndex === localIndex ? 'victory' : 'defeat');
        const rewardData = collectOnlineServerRewardData(outcome, action, current);
        current._onlineScoreRewardData = rewardData;
        current._onlineScoreRewardConsumed = false;
        current._onlineApplyingServerMatchResult = true;
      }
      try{
        const check = window.__fateOnlineOriginalFns?.checkWin || window.checkWin;
        if(typeof check === 'function') check.call(window);
      }finally{
        const latest = gameState();
        if(latest){
          latest._onlineApplyingServerMatchResult = false;
          latest._onlineResultMarked = true;
        }
      }
      if(typeof window.disbandOnlineParty === 'function'){
        window.disbandOnlineParty('Party disbanded after the match.', {silent:true}).catch(()=>{});
      }
      return;
    }

    const turnAgnosticAction = type === 'CHOOSE_TURN' || type === 'REACTION_CHOICE';
    if(type !== 'FORFEIT'){
      if(actionPlayer === null || actionPlayer === undefined){
        console.warn('Ignoring online action without a room player', action);
        return;
      }
      if(Number(actionPlayer) !== Number(payload.playerIndex)){
        console.warn('Ignoring online action with mismatched player index', action);
        reconcileOnlinePostState(action, 'player-index mismatch');
        return;
      }
      if(!turnAgnosticAction && Number(g.currentPlayer) !== Number(payload.playerIndex)){
        console.warn('Ignoring online action for inactive turn', action, 'current=', g.currentPlayer);
        reconcileOnlinePostState(action, 'turn mismatch');
        return;
      }
    }

    // Clear UI interaction locks so remote actions are never blocked by local
    // debounce guards (turnInputLockUntil, cinematicUiLockUntil, etc.)
    g._turnInputLockUntil = 0;
    g._cinematicUiLockUntil = 0;
    g._placementUiLockUntil = 0;
    g._reactionPending = false;

    if(action.uid !== localUid && typeof window.playSfx === 'function') {
      const fnName = String(payload?.fn || '');
      const remoteEffectActivation =
        (type === 'BOARD_ACTION' && /^(triggerCharacterEffect|activatePendingWhenSetEffect|activateWolfCreek|activateExpeditionaryMove|activateLandscapeEventideMove|activateBusserMove|activateWodnyPotokYouth)$/i.test(fnName)) ||
        (type === 'MODAL_ACTION' && !!payload?.effectCinematic) ||
        (type === 'HAND_ACTION' && /^activate(WineCountryGuerilla|SelvaIslandsPirate|SantaAnnaProsperity)FromHand$/i.test(fnName));
      if(remoteEffectActivation && typeof window.playEffectActivationClickSfx === 'function') {
        window.playEffectActivationClickSfx({remote:true});
      } else if(remoteEffectActivation) {
        window.playSfx('effectActivate');
      } else {
        window.playSfx('onlineRemote');
      }
    }

    await withLegacyRemoteReplayAction(async ()=>{
      if(type === 'END_TURN'){
        if(typeof window.endTurn === 'function') window.endTurn();
        updateRoomTurn(gameState()?.currentPlayer);
        return;
      }
      if(type === 'CHOOSE_TURN'){
        if(Number(payload.playerIndex) !== Number(g._coinWinner)){
          console.warn('Ignoring online turn-order choice from non-winner', action);
          return;
        }
        if(typeof window.chooseTurn === 'function') window.chooseTurn(!!payload.goFirst);
        updateRoomTurn(gameState()?.currentPlayer);
        return;
      }
      if(type === 'START_CONSOLIDATE'){
        restoreSelectedHand(g, payload.playerIndex, payload.selectedHand);
        if(typeof window.initiateConsolidate === 'function') window.initiateConsolidate();
        return;
      }
      if(type === 'CLICK_CELL'){
        if(payload.selectedHand) restoreSelectedHand(g, payload.playerIndex, payload.selectedHand);
        if(payload.placing) g.placing = true;
        if(typeof window.clickCell === 'function'){
          await window.clickCell(payload.z, payload.r, payload.c);
        }
        return;
      }
      if(type === 'BOARD_ACTION'){
        const fn = window.__fateOnlineOriginalFns?.[payload.fn];
        if(typeof fn !== 'function') return;
        const card = g.board?.[payload.z]?.[payload.r]?.[payload.c] || null;
        if(action.uid !== localUid && /^(triggerCharacterEffect|activatePendingWhenSetEffect)$/i.test(String(payload.fn || ''))) {
          await showPayloadEffectCinematic(g, payload, 'online-board-action-effect-cinematic');
        }
        await fn.call(window, card, payload.z, payload.r, payload.c);
        return;
      }
      if(type === 'HAND_ACTION'){
        const fn = window.__fateOnlineOriginalFns?.[payload.fn];
        if(typeof fn !== 'function') return;
        restoreSelectedHand(g, payload.playerIndex, payload.selectedHand);
        const card = g.players?.[payload.playerIndex]?.hand?.[g.selectedHandCard] || null;
        const target = payload.target ? Object.assign({playerIndex:payload.playerIndex}, payload.target) : null;
        await fn.call(window, card, target);
        return;
      }
      if(type === 'MODAL_ACTION'){
        const action = g._onlinePendingModalActions?.[payload.actionIndex];
        if(action.uid !== localUid) {
          const modalPayload = payload.effectCinematic ? payload : Object.assign({}, payload, {
            effectCinematic:selectedBoardEffectCinematicPayload(g)
          });
          await showPayloadEffectCinematic(g, modalPayload, 'online-modal-action-effect-cinematic');
        }
        if(action && typeof action.action === 'function') await action.action();
        g._onlinePendingModalActions = null;
        return;
      }
      if(type === 'PICK_CARDS_VISUAL'){
        const pending = g._onlinePendingPickCardsVisual;
        if(!pending || typeof pending.onConfirm !== 'function') return;
        const selected = (payload.selectedCards || [])
          .map(ident => (pending.cards || []).find(card => cardMatchesIdentity(card, ident)))
          .filter(Boolean);
        await pending.onConfirm(selected);
        g._onlinePendingPickCardsVisual = null;
        return;
      }
      if(type === 'PICK_ZONE'){
        const pending = g._onlinePendingZonePicker;
        if(!pending || typeof pending.onConfirm !== 'function') return;
        const selected = (payload.selectedEntries || [])
          .map(item => findBoardEntryForPayload(pending.entries, item))
          .filter(Boolean);
        await pending.onConfirm(selected);
        g._onlinePendingZonePicker = null;
        return;
      }
      if(type === 'PICK_AFFILIATION'){
        const pending = g._onlinePendingAffiliationPicker;
        if(!pending || typeof pending.callback !== 'function') return;
        await pending.callback(String(payload.aff || ''));
        g._onlinePendingAffiliationPicker = null;
        return;
      }
      if(type === 'PICK_LANDSCAPE_ZONE'){
        const pending = g._onlinePendingLandscapeZonePicker;
        if(!pending || typeof pending.onChoose !== 'function') return;
        const zone = Number(payload.zone);
        if(Number(g.currentPlayer) !== Number(g._onlinePlayerIndex)) g._onlineSilentEndTurnUntil = Date.now() + 700;
        await pending.onChoose(Number.isInteger(zone) ? zone : null);
        g._onlinePendingLandscapeZonePicker = null;
        return;
      }
      if(type === 'FORFEIT'){
        if(action.uid !== localUid){
          const rewardData = collectOnlineServerRewardData('victory', action);
          if(window.toast) toast('Opponent forfeited');
          showOnlineForfeitResult('victory', null, {rewardData});
          const current = gameState();
          if(current) current._onlineResultMarked = true;
          setTimeout(()=>{
            activeRoom = null;
            const latest = gameState();
            if(latest){
              latest._onlineRoomCode = null;
              latest._onlineRole = null;
              latest._onlinePlayerIndex = null;
              latest._onlineRoomMode = null;
              latest.localPlayerIndex = null;
              latest.viewerPlayerIndex = null;
              latest._onlineActionLogMode = false;
              latest._onlineApplyingRemoteAction = false;
            }
            clearRoomWatchers();
          }, 0);
        }
        return;
      }
    }, actionPlayer);
    reconcileOnlinePostState(action, 'post-action mismatch seq ' + (action.seq || '?'));
  }

  async function drainBufferedOnlineActions(){
    while(true){
      const nextSeq = lastAppliedActionSeq + 1;
      const action = actionReplayBuffer.get(nextSeq);
      if(!action){
        const perf = window.__fatePerf = window.__fatePerf || {};
        perf.onlineBufferedActions = actionReplayBuffer.size;
        perf.onlineWaitingForActionSeq = actionReplayBuffer.size ? nextSeq : 0;
        break;
      }
      actionReplayBuffer.delete(nextSeq);
      const turnBoundaryAction = isTurnBoundaryOnlineAction(action);
      if(turnBoundaryAction) noteTurnBoundaryAction(action);
      if(action.type === 'MATCH_START'){
        await applyOnlineAction(action);
        lastAppliedActionSeq = Math.max(lastAppliedActionSeq, action.seq || 0);
        reportActionProgress(lastAppliedActionSeq, {turnBoundary:true});
        evaluateLagPause();
        continue;
      }
      try{
        await applyOnlineAction(action);
      }catch(e){
        console.error('Online action replay failed', e, action);
      }
      lastAppliedActionSeq = Math.max(lastAppliedActionSeq, action.seq || 0);
      const latest = gameState();
      if(latest) latest._onlineAppliedActionSeq = lastAppliedActionSeq;
      reportActionProgress(lastAppliedActionSeq, {turnBoundary:turnBoundaryAction});
      if(turnBoundaryAction) evaluateLagPause();
      else if(lagPauseVisible) setLagPause(false);
    }
  }

  function scheduleActionReplayDrain(){
    if(actionReplayDrainScheduled) return;
    actionReplayDrainScheduled = true;
    actionReplayQueue = actionReplayQueue
      .then(()=>drainBufferedOnlineActions())
      .catch(e=>console.error('Online action replay queue failed', e))
      .then(()=>{
        actionReplayDrainScheduled = false;
        if(actionReplayBuffer.has(lastAppliedActionSeq + 1)) scheduleActionReplayDrain();
      });
  }

  function bufferOnlineAction(a){
    const seq = Number(a?.seq || 0) || 0;
    if(!seq || seq <= lastAppliedActionSeq || actionReplayBuffer.has(seq)) return false;
    lastActionSeq = Math.max(lastActionSeq, seq);
    actionReplayBuffer.set(seq, a);
    const g = gameState();
    if(g) g._onlineActionSeq = lastActionSeq;
    scheduleActionReplayDrain();
    return true;
  }

  function localStorageFlag(name){
    try{ return localStorage.getItem(name) === '1'; }catch(e){ return false; }
  }

  function clientResolvedGameplayEnabled(){
    return String(window.FATE_GAMEPLAY_AUTHORITY || '').toLowerCase() === 'client-resolved'
      || String(authorityGameplayMode || '').toLowerCase() === 'client-resolved'
      || localStorageFlag('fateClientResolvedGameplay');
  }

  function isClientResolvedGameplayAction(type){
    return /^(END_TURN|CLICK_CELL|START_CONSOLIDATE|BOARD_ACTION|HAND_ACTION|MODAL_ACTION|PICK_CARDS_VISUAL|PICK_ZONE|PICK_AFFILIATION|PICK_LANDSCAPE_ZONE|REACTION_CHOICE)$/i.test(String(type || ''));
  }

  function noteClientResolvedCommitStart(){
    clientResolvedCommitInFlight += 1;
    let done = false;
    return function finishClientResolvedCommit(){
      if(done) return;
      done = true;
      clientResolvedCommitInFlight = Math.max(0, clientResolvedCommitInFlight - 1);
    };
  }

  function noteClientResolvedLocalCommitStart(){
    clientResolvedLocalCommitPending += 1;
    let done = false;
    return function finishClientResolvedLocalCommit(){
      if(done) return;
      done = true;
      clientResolvedLocalCommitPending = Math.max(0, clientResolvedLocalCommitPending - 1);
    };
  }

  function scheduleClientResolvedAutoCommit(reason, delayMs){
    if(!clientResolvedGameplayEnabled()) return;
    if(clientResolvedAutoCommitTimer) clearTimeout(clientResolvedAutoCommitTimer);
    clientResolvedAutoCommitTimer = setTimeout(function(){
      clientResolvedAutoCommitTimer = null;
      sendClientResolvedAutoCommit(reason || 'local-state-watchdog').catch(e=>{
        console.warn('Client-resolved auto state commit failed', e);
      });
    }, Math.max(40, Number(delayMs || 220) || 220));
  }

  async function sendClientResolvedAutoCommit(reason){
    if(!clientResolvedGameplayEnabled() || clientResolvedCommitInFlight > 0) return false;
    const g = gameState();
    if(!isOnlineMatchState(g) || g._onlineApplyingRemoteAction) return false;
    if(g._isSpectator || g._onlineRole === 'spectator' || !Number.isInteger(g._onlinePlayerIndex)) return false;
    if(g._onlineLagPauseActive) return false;
    if(Number(g.currentPlayer) !== Number(g._onlinePlayerIndex)) return false;
    const state = captureOnlineCanonicalState();
    const hash = onlineCanonicalStateHash(state);
    if(!hash || hash === lastAuthorityStateHash || hash === lastClientResolvedAutoCommitHash) return false;
    const payload = {
      playerIndex:g._onlinePlayerIndex,
      currentPlayer:g.currentPlayer,
      turn:g.turn,
      actionKind:'AUTO_CLIENT_STATE_COMMIT',
      clientActionId:makeDirectAuthorityActionId('ACTION_RESULT'),
      baseStateHash:lastAuthorityStateHash || '',
      sourceReason:String(reason || 'local-state-watchdog')
    };
    attachOnlinePostState(payload);
    if(!payload.postState || !payload.stateHash || payload.stateHash === lastAuthorityStateHash) return false;
    lastClientResolvedAutoCommitHash = payload.stateHash;
    const finish = noteClientResolvedCommitStart();
    try{
      recordOnlineDiagnostic('client-resolved-auto-commit', {
        reason:String(reason || ''),
        baseStateHash:String(payload.baseStateHash || ''),
        stateHash:String(payload.stateHash || '')
      });
      await sendAction('ACTION_RESULT', payload);
      return true;
    }catch(e){
      if(payload.stateHash === lastClientResolvedAutoCommitHash) lastClientResolvedAutoCommitHash = '';
      throw e;
    }finally{
      finish();
    }
  }

  function rtdbDisabledMode(){
    return localStorageFlag('fateRtdbDisabled') || window.FATE_RTDB_DISABLED === true;
  }

  function authorityHttpBaseUrl(){
    try{
      const explicit = String(localStorage.getItem('fateFlyApiUrl') || '').trim();
      if(explicit) return explicit.replace(/\/+$/, '');
    }catch(e){}
    const globalExplicit = String(window.FATE_FLY_API_URL || '').trim();
    if(globalExplicit) return globalExplicit.replace(/\/+$/, '');
    const wsUrl = configuredAuthorityUrl();
    if(!wsUrl) return '';
    return String(wsUrl).trim()
      .replace(/^wss:/i, 'https:')
      .replace(/^ws:/i, 'http:')
      .replace(/\/+$/, '');
  }

  function flyActionReplayEnabled(){
    return !!authorityHttpBaseUrl() && (
      localStorageFlag('fateFlyActionReplay') ||
      rtdbDisabledMode() ||
      window.FATE_FLY_ACTION_REPLAY === true
    );
  }

  function authorityOnlyMode(){
    return (
      localStorageFlag('fateFlyAuthorityOnly') ||
      rtdbDisabledMode() ||
      window.FATE_FLY_AUTHORITY_ONLY === true
    );
  }

  function shouldSkipAuthorityRtdbPersist(accepted){
    if(accepted?.durableWrite) return true;
    if(localStorageFlag('fateSkipAuthorityRtdbPersist')) return true;
    return flyActionReplayEnabled() || flyRoomsEnabled() || authorityOnlyMode();
  }

  function firebaseActionFallbackAllowed(){
    if(authorityOnlyMode()) return false;
    if(flyActionReplayEnabled()) return false;
    if(flyRoomsEnabled()) return false;
    if(configuredAuthorityUrl()) return false;
    return true;
  }

  function flyRoomsEnabled(){
    return !!authorityHttpBaseUrl() && (
      localStorageFlag('fateFlyRoomsEnabled') ||
      rtdbDisabledMode() ||
      window.FATE_FLY_ROOMS_ENABLED === true
    );
  }

  function roomUsesFly(roomOrCode){
    if(flyRoomsEnabled()) return true;
    if(roomOrCode && typeof roomOrCode === 'object' && roomOrCode._flyRoom) return true;
    const code = typeof roomOrCode === 'string'
      ? String(roomOrCode || '').trim().toUpperCase()
      : String(roomOrCode?.roomCode || '').trim().toUpperCase();
    if(!code) return false;
    const room = lastLobbyRoom || {};
    return !!(room._flyRoom && String(room.roomCode || '').trim().toUpperCase() === code);
  }

  function firebaseRoomTransportAllowed(){
    return !rtdbDisabledMode() && !flyRoomsEnabled();
  }

  function warnBlockedRtdbRoomFallback(label){
    const key = String(label || 'rooms');
    if(blockedRtdbRoomWarnings.has(key)) return;
    blockedRtdbRoomWarnings.add(key);
    console.warn('Blocked legacy RTDB room fallback while Fly/RTDB-disabled mode is active:', key);
  }

  async function flyApiRequest(path, opts={}){
    const base = authorityHttpBaseUrl();
    if(!base) throw new Error('Fly authority API URL is not configured');
    const headers = {'accept':'application/json'};
    const token = await getAuthorityIdToken().catch(()=>'');
    if(token) headers.authorization = 'Bearer ' + token;
    const method = String(opts.method || 'GET').toUpperCase();
    const init = { method, headers };
    if(opts.body !== undefined){
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(opts.body || {});
    }
    const started = Date.now();
    const timeoutMs = Math.max(2000, Math.min(60000, Number(opts.timeoutMs) || 10000));
    let timeout = 0;
    if(typeof AbortController !== 'undefined' && !init.signal){
      const controller = new AbortController();
      init.signal = controller.signal;
      timeout = setTimeout(function(){ try{ controller.abort(); }catch(e){} }, timeoutMs);
    }
    let res;
    try{
      res = await fetch(base + path, init);
    }catch(err){
      recordOnlineDiagnostic('fly-api-fetch-error', {
        path,
        method,
        reason:err.message || String(err),
        durationMs:Date.now() - started
      });
      throw err;
    }finally{
      if(timeout) clearTimeout(timeout);
    }
    if(!res.ok){
      const text = await res.text().catch(()=>'');
      recordOnlineDiagnostic('fly-api-error', {
        path,
        method,
        status:res.status,
        reason:text.slice(0, 220),
        durationMs:Date.now() - started
      });
      const err = new Error('Fly authority API failed: ' + res.status + (text ? ' ' + text.slice(0, 160) : ''));
      err.status = res.status;
      err.body = text;
      err.path = path;
      throw err;
    }
    const json = await res.json();
    if(/\/api\/matchmaking\/enter|\/start|\/join|\/resume/.test(path)){
      recordOnlineDiagnostic('fly-api-ok', {
        path,
        method,
        status:res.status,
        durationMs:Date.now() - started,
        roomCode:json?.room?.roomCode || json?.room?.code || json?.roomCode || ''
      });
    }
    return json;
  }

  async function flyApiJson(path, opts){
    return flyApiRequest(path, opts || {});
  }

  function flyDeckChoiceFromRoomDeck(deck){
    if(!deck) return null;
    const ids = Array.isArray(deck.deckIds) ? deck.deckIds : [];
    return {
      selectedDeckKey:String(deck.selectedDeckKey || deck.key || ''),
      name:String(deck.selectedDeckName || deck.name || 'Selected Deck'),
      deckIds:[...ids],
      ready:ids.length === 40 || !!deck.ready
    };
  }

  function normalizeFlyRoom(apiRoom){
    const room = apiRoom || {};
    const players = {};
    Object.keys(room.players || {}).forEach(uid=>{
      const p = room.players[uid] || {};
      const deck = p.deckChoice || {};
      players[uid] = {
        uid,
        role:p.role || (uid === room.hostUid ? 'host' : 'guest'),
        connected:p.connected !== false,
        joinedAt:p.joinedAt || 0,
        profileSnapshot:p.profile || {},
        selectedDeckKey:deck.selectedDeckKey || '',
        selectedDeckName:deck.name || '',
        ready:!!deck.ready,
        _flyDeckReady:!!deck.ready || Number(deck.deckCount || 0) === 40,
        matchPreload:p.matchPreload || null,
        actionSeq:Number(p.actionSeq || 0) || 0,
        actionSeqClientAt:Number(p.actionSeqClientAt || 0) || 0,
        actionSeqServerAt:Number(p.actionSeqServerAt || 0) || 0,
        _flyPlayer:true
      };
    });
    return {
      _flyRoom:true,
      roomCode:room.code || room.roomCode || '',
      mode:room.mode || 'freeplay',
      status:room.status || 'lobby',
      phase:room.phase || 'lobby',
      hostUid:room.hostUid || '',
      guestUid:room.guestUid || '',
      playerOrder:room.playerOrder || {0:room.hostUid || '', 1:room.guestUid || ''},
      currentTurnUid:room.currentTurnUid || '',
      lastActionSeq:Number(room.lastActionSeq || 0) || 0,
      canonicalHash:room.canonicalHash || room.serverStateHash || '',
      seed:room.seed || '',
      song:room.song || '',
      startedAt:room.startedAt || 0,
      endedAt:room.endedAt || 0,
      endReason:room.endReason || '',
      chatSeq:Number(room.chatSeq || 0) || 0,
      chat:Array.isArray(room.chat) ? room.chat : [],
      players
    };
  }

  function subscribeFlyActions(code){
    let stopped = false;
    let timer = 0;
    let lastWarn = 0;
    if(configuredAuthorityUrl()){
      ensureAuthorityJoined(code).catch(e=>console.warn('Fly authority prejoin failed', e));
    }
    async function poll(){
      if(stopped) return;
      try{
        const after = Math.max(0, lastAppliedActionSeq || 0);
        const data = await flyApiJson(`/api/rooms/${encodeURIComponent(code)}/events?after=${after}&limit=300`, { timeoutMs:10000 });
        const events = Array.isArray(data?.events) ? data.events : [];
        events.forEach(item=>{
          const action = item?.action || item?.accepted?.action || item;
          bufferOnlineAction(action);
        });
        if(Number(data?.lastSeq || 0) > lastActionSeq) lastActionSeq = Number(data.lastSeq || 0);
      }catch(e){
        if(Date.now() - lastWarn > 5000){
          console.warn('Fly authority action replay poll failed', e);
          lastWarn = Date.now();
        }
      }finally{
        if(!stopped) timer = setTimeout(poll, 650);
      }
    }
    actionUnsub = function(){
      stopped = true;
      if(timer) clearTimeout(timer);
    };
    poll();
  }

  async function catchUpFlyAuthorityReplay(code, reason){
    if(!code || !authorityHttpBaseUrl() || firebaseActionFallbackAllowed()) return false;
    authorityCatchupAttempts += 1;
    authorityLastCatchupReason = String(reason || 'authority-send');
    try{
      const after = Math.max(0, Number(lastAppliedActionSeq || 0) || 0);
      const data = await flyApiJson(`/api/rooms/${encodeURIComponent(code)}/resume?after=${after}&limit=500`);
      const room = normalizeFlyRoom(data.room);
      if(room.roomCode){
        lastLobbyRoom = room;
        lastLobbyPlayers = room.players;
      }
      if(data.serverStateHash || data.canonicalHash) lastAuthorityStateHash = String(data.serverStateHash || data.canonicalHash || '');
      const events = Array.isArray(data?.events) ? data.events : [];
      events.forEach(item=>{
        const action = item?.action || item?.accepted?.action || item;
        bufferOnlineAction(action);
      });
      const serverSeq = Number(data?.lastSeq || room.lastActionSeq || 0) || 0;
      if(serverSeq > lastActionSeq) lastActionSeq = serverSeq;
      authorityLastCatchupSeq = Math.max(authorityLastCatchupSeq, serverSeq);
      const g = gameState();
      if(g) g._onlineActionSeq = Math.max(g._onlineActionSeq || 0, lastActionSeq);
      if(events.length) await actionReplayQueue.catch(()=>{});
      authorityCatchupSuccesses += 1;
      return true;
    }catch(e){
      authorityCatchupFailures += 1;
      authorityLastCatchupReason = e && e.message || String(e);
      console.warn('Fly authority catch-up before send failed', e);
      return false;
    }
  }

  function subscribeActions(code){
    if(actionUnsub) actionUnsub();
    if(flyActionReplayEnabled() || lastLobbyRoom?._flyRoom){
      subscribeFlyActions(code);
      return;
    }
    const arBase = FO.ref(FO.rtdb, `rooms/${code}/actions`);
    function bufferAction(a){
      bufferOnlineAction(a);
    }
    if(FO.onChildAdded && FO.query && FO.orderByKey && FO.startAt){
      const startKey = String(Math.max(1, lastAppliedActionSeq + 1)).padStart(6, '0');
      const ar = FO.query(arBase, FO.orderByKey(), FO.startAt(startKey));
      actionUnsub = FO.onChildAdded(ar, snap=>bufferAction(snap.val() || {}));
      return;
    }
    console.warn('Online action subscription requires keyed RTDB queries; refusing unbounded room action-log fallback.');
  }

  function configuredAuthorityUrl(){
    try{
      const enabled = localStorage.getItem('fateWsAuthorityEnabled') === '1' || window.FATE_WS_AUTHORITY_ENABLED === true;
      if(!enabled) return '';
      const fromStorage = localStorage.getItem('fateWsAuthorityUrl');
      if(fromStorage) return String(fromStorage).trim();
    }catch(e){}
    return window.FATE_WS_AUTHORITY_ENABLED === true ? String(window.FATE_WS_AUTHORITY_URL || '').trim() : '';
  }
  function closeAuthoritySocket(){
    authorityJoined = false;
    authorityJoinPromise = null;
    authorityRoomCode = '';
    authorityReducerMode = '';
    authorityGameplayMode = '';
    for(const item of authorityInflight.values()){
      try{ item.reject(new Error('authority socket closed')); }catch(e){}
      if(item.timer) clearTimeout(item.timer);
    }
    authorityInflight.clear();
    if(authorityWs){
      try{ authorityWs.close(); }catch(e){}
    }
    authorityWs = null;
  }
  function rejectAuthorityInflight(reason){
    const err = reason instanceof Error ? reason : new Error(String(reason || 'WebSocket authority unavailable'));
    for(const item of authorityInflight.values()){
      try{ item.reject(err); }catch(e){}
      if(item.timer) clearTimeout(item.timer);
    }
    authorityInflight.clear();
  }
  function handleAuthorityMessage(event){
    let msg = null;
    try{ msg = JSON.parse(event.data || '{}'); }catch(e){ return; }
    if(!msg || typeof msg !== 'object') return;
    if(msg.kind === 'hello-ok'){
      authorityJoined = true;
      if(msg.serverStateHash) lastAuthorityStateHash = String(msg.serverStateHash || '');
      if(msg.reducerMode) authorityReducerMode = String(msg.reducerMode || '').toLowerCase();
      if(msg.gameplayAuthority) authorityGameplayMode = String(msg.gameplayAuthority || '').toLowerCase();
      recordOnlineDiagnostic('authority-hello-ok', {
        playerIndex:Number(msg.playerIndex ?? -1),
        lastSeq:Number(msg.lastSeq || 0) || 0,
        serverStateHash:String(msg.serverStateHash || ''),
        reducerMode:String(msg.reducerMode || ''),
        gameplayAuthority:String(msg.gameplayAuthority || '')
      });
      return;
    }
    if(msg.kind === 'room-chat'){
      const code = String(msg.roomCode || '').toUpperCase();
      const roomCode = String(lastLobbyRoom?.roomCode || activeRoom || '').toUpperCase();
      const message = msg.message && typeof msg.message === 'object' ? msg.message : null;
      if(code && roomCode && code === roomCode && message){
        const chat = normalizeRoomChatEntries(lastLobbyRoom?.chat)
          .map(entry=>entry.msg)
          .filter(entry=>String(entry?.id || '') !== String(message.id || ''));
        chat.push(message);
        chat.sort((a,b)=>(Number(a.createdAt || 0) || 0) - (Number(b.createdAt || 0) || 0));
        const nextRoom = Object.assign({}, lastLobbyRoom || {roomCode}, {
          chat:chat.slice(-80),
          chatSeq:Number(msg.chatSeq || message.seq || lastLobbyRoom?.chatSeq || 0) || 0
        });
        lastLobbyRoom = nextRoom;
        syncRoomChatToInGame(nextRoom);
        if(nextRoom.status === 'lobby') renderLobby(nextRoom, nextRoom.players || lastLobbyPlayers, true);
      }
      return;
    }
    if(msg.kind === 'accepted' || msg.kind === 'rejected' || msg.kind === 'error'){
      if(msg.kind === 'accepted') handleAuthorityAcceptedMessage(msg);
      recordOnlineDiagnostic('authority-' + msg.kind, {
        requestId:String(msg.requestId || ''),
        actionType:String(msg.action?.type || ''),
        seq:Number(msg.action?.seq || 0) || 0,
        reason:String(msg.reason || ''),
        serverSeq:Number(msg.serverSeq || 0) || 0,
        serverStateHash:String(msg.serverStateHash || '')
      });
      if(msg.kind === 'rejected' && msg.serverState && msg.serverStateHash){
        lastAuthorityStateHash = String(msg.serverStateHash || '');
        applyOnlineCanonicalState(msg.serverState, 'authority rejection resync');
        const serverSeq = Number(msg.serverSeq || 0) || 0;
        if(serverSeq){
          lastActionSeq = Math.max(lastActionSeq, serverSeq);
          lastAppliedActionSeq = Math.max(lastAppliedActionSeq, serverSeq);
          discardBufferedActionsThrough(lastAppliedActionSeq);
          const latest = gameState();
          if(latest){
            latest._onlineActionSeq = Math.max(Number(latest._onlineActionSeq || 0) || 0, lastActionSeq);
            latest._onlineAppliedActionSeq = lastAppliedActionSeq;
            latest._onlineLagPauseActive = false;
          }
          reportActionProgress(lastAppliedActionSeq, {force:true});
          if(typeof evaluateLagPause === 'function') evaluateLagPause();
        }
      }
      const requestId = String(msg.requestId || '');
      const pending = requestId ? authorityInflight.get(requestId) : null;
      if(pending){
        authorityInflight.delete(requestId);
        if(pending.timer) clearTimeout(pending.timer);
        if(msg.kind === 'accepted') pending.resolve(msg);
        else {
          const err = new Error(msg.reason || 'WebSocket authority rejected action');
          err.authorityRejected = msg.kind === 'rejected';
          err.authorityKind = msg.kind;
          err.serverSeq = Number(msg.serverSeq || 0) || 0;
          err.serverStateHash = String(msg.serverStateHash || '');
          err.serverState = msg.serverState || null;
          pending.reject(err);
        }
      }
    }
  }
  function ensureAuthoritySocket(url){
    if(authorityWs && authorityUrl === url && (authorityWs.readyState === WebSocket.OPEN || authorityWs.readyState === WebSocket.CONNECTING)){
      return authorityWs;
    }
    closeAuthoritySocket();
    authorityUrl = url;
    authorityWs = new WebSocket(url);
    authorityWs.onmessage = handleAuthorityMessage;
    authorityWs.onclose = function(){
      recordOnlineDiagnostic('authority-socket-close', {
        url,
        reason:'WebSocket authority disconnected'
      });
      authorityJoined = false;
      authorityJoinPromise = null;
      rejectAuthorityInflight('WebSocket authority disconnected');
    };
    authorityWs.onerror = function(){
      recordOnlineDiagnostic('authority-socket-error', {
        url,
        reason:'WebSocket authority connection failed'
      });
      rejectAuthorityInflight('WebSocket authority connection failed');
    };
    return authorityWs;
  }
  function waitForAuthorityOpen(ws){
    if(ws.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject)=>{
      const timer = setTimeout(()=>reject(new Error('WebSocket authority connection timed out')), AUTHORITY_OPEN_TIMEOUT_MS);
      ws.addEventListener('open', ()=>{ clearTimeout(timer); resolve(); }, {once:true});
      ws.addEventListener('error', ()=>{ clearTimeout(timer); reject(new Error('WebSocket authority connection failed')); }, {once:true});
      ws.addEventListener('close', ()=>{ clearTimeout(timer); reject(new Error('WebSocket authority closed before join')); }, {once:true});
    });
  }
  async function getAuthorityIdToken(){
    const user = window.FATE_ONLINE?.user || FO.auth?.currentUser || null;
    if(user && typeof user.getIdToken === 'function') return await user.getIdToken(false);
    return '';
  }
  async function ensureAuthorityJoined(code){
    const url = configuredAuthorityUrl();
    if(!url || typeof WebSocket === 'undefined') return false;
    if(authorityJoined && authorityRoomCode === code && authorityWs && authorityWs.readyState === WebSocket.OPEN) return true;
    if(authorityJoinPromise && authorityRoomCode === code) return authorityJoinPromise;
    authorityRoomCode = code;
    authorityJoinPromise = (async ()=>{
      const ws = ensureAuthoritySocket(url);
      await waitForAuthorityOpen(ws);
      const u = window.FATE_ONLINE?.user || FO.auth?.currentUser || null;
      if(!u) throw new Error('Sign in before joining WebSocket authority');
      const room = lastLobbyRoom || {};
      const g = gameState();
      const order0 = room.playerOrder?.[0] || room.hostUid || '';
      const order1 = room.playerOrder?.[1] || room.guestUid || '';
      const liveTurnUid = g && Number.isInteger(g.currentPlayer)
        ? (g.currentPlayer === 0 ? order0 : order1)
        : '';
      ws.send(JSON.stringify({
        kind:'hello',
        roomCode:code,
        uid:u.uid,
        idToken:await getAuthorityIdToken(),
        lastSeq:Math.max(lastActionSeq || 0, lastAppliedActionSeq || 0, Number(room.lastActionSeq || 0) || 0),
        stateHash:onlineCanonicalStateHash(captureOnlineCanonicalState()),
        room:{
          hostUid:room.hostUid || '',
          guestUid:room.guestUid || '',
          currentTurnUid:liveTurnUid || room.currentTurnUid || '',
          lastActionSeq:room.lastActionSeq || lastActionSeq || 0,
          playerOrder:{0:order0, 1:order1}
        }
      }));
      await new Promise((resolve, reject)=>{
        const started = Date.now();
        const timer = setInterval(()=>{
          if(authorityJoined){ clearInterval(timer); resolve(); }
          else if(Date.now() - started > AUTHORITY_HELLO_TIMEOUT_MS){ clearInterval(timer); reject(new Error('WebSocket authority join timed out')); }
        }, 40);
      });
      return true;
    })().catch(e=>{
      authorityJoined = false;
      authorityJoinPromise = null;
      throw e;
    });
    return authorityJoinPromise;
  }
  function makeDirectAuthorityActionId(type){
    return 'direct:' + String(type || 'ACTION').toUpperCase() + ':' + Date.now() + ':' + (++optimisticActionCounter);
  }

  function authorityRetryMaxAttempts(){
    return configuredAuthorityUrl() && !firebaseActionFallbackAllowed() ? 3 : 1;
  }

  async function sendActionViaAuthorityOnce(code, type, payload, attempt){
    if(!authorityWs || authorityWs.readyState !== WebSocket.OPEN) throw new Error('WebSocket authority is not connected');
    const requestId = 'act:' + Date.now() + ':' + (++authorityRequestCounter) + ':' + Math.max(0, Number(attempt || 0));
    const outbound = {
      kind:'intent',
      requestId,
      roomCode:code,
      type,
      payload,
      clientActionId:String(payload?.clientActionId || '')
    };
    return await new Promise((resolve, reject)=>{
      const timer = setTimeout(()=>{
        authorityInflight.delete(requestId);
        const err = new Error('WebSocket authority did not accept action in time');
        err.authorityTimeout = true;
        recordOnlineDiagnostic('authority-timeout', {
          requestId,
          actionType:String(type || ''),
          clientActionId:String(payload?.clientActionId || ''),
          attempt:Number(attempt || 0) || 0
        });
        reject(err);
      }, AUTHORITY_ACTION_TIMEOUT_MS);
      authorityInflight.set(requestId, {resolve, reject, timer});
      try{
        authorityWs.send(JSON.stringify(outbound));
      }catch(e){
        authorityInflight.delete(requestId);
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  async function sendActionViaAuthority(type, payload){
    const code = gameState()?._onlineRoomCode || activeRoom;
    if(!code) return null;
    const url = configuredAuthorityUrl();
    if(!url) return null;
    const maxAttempts = authorityRetryMaxAttempts();
    let lastErr = null;
    for(let attempt = 0; attempt < maxAttempts; attempt += 1){
      try{
        await ensureAuthorityJoined(code);
        const accepted = await sendActionViaAuthorityOnce(code, type, payload, attempt);
        if(attempt > 0) authorityRetrySuccesses += 1;
        return accepted;
      }catch(e){
        lastErr = e;
        if(e && e.authorityRejected) throw e;
        if(attempt >= maxAttempts - 1) break;
        authorityRetryAttempts += 1;
        authorityLastRetryReason = e && e.message || String(e);
        authorityLastRetryClientActionId = String(payload?.clientActionId || '');
        console.warn('Retrying WebSocket authority action with stable clientActionId', {
          type,
          clientActionId:authorityLastRetryClientActionId,
          attempt:attempt + 1,
          maxAttempts,
          reason:authorityLastRetryReason
        });
        closeAuthoritySocket();
        await new Promise(resolve=>setTimeout(resolve, 180 + attempt * 220));
      }
    }
    authorityRetryFailures += 1;
    authorityLastRetryReason = lastErr && lastErr.message || 'WebSocket authority action failed';
    authorityLastRetryClientActionId = String(payload?.clientActionId || '');
    throw lastErr || new Error('WebSocket authority action failed');
  }
  async function persistAuthorityAcceptedAction(code, accepted){
    if(shouldSkipAuthorityRtdbPersist(accepted)) return true;
    const action = onlineFirebaseSafeValue(Object.assign({}, accepted.action || {}));
    const seq = Number(action.seq || 0) || 0;
    if(!seq) throw new Error('WebSocket authority accepted action without seq');
    action.createdAt = FO.serverTimestamp();
    const actionRef = FO.ref(FO.rtdb, `rooms/${code}/actions/${String(seq).padStart(6,'0')}`);
    if(FO.get){
      const existing = await FO.get(actionRef).catch(()=>null);
      if(existing && existing.exists && existing.exists()) return;
    }
    const patch = {
      [`rooms/${code}/actions/${String(seq).padStart(6,'0')}`]: action,
      [`rooms/${code}/lastActionSeq`]: seq,
      [`rooms/${code}/updatedAt`]: FO.serverTimestamp()
    };
    const roomPatch = accepted.roomPatch || {};
    Object.keys(roomPatch).forEach(k=>{
      patch[`rooms/${code}/${k}`] = roomPatch[k];
    });
    if(roomPatch.status === 'ended' && !roomPatch.endedAt){
      patch[`rooms/${code}/endedAt`] = FO.serverTimestamp();
    }
    await FO.update(FO.ref(FO.rtdb), patch);
  }

  function ensureAuthorityAcceptedActionPersisted(code, accepted){
    const seq = Number(accepted?.action?.seq || 0) || 0;
    if(shouldSkipAuthorityRtdbPersist(accepted)) return Promise.resolve(true);
    if(!code || !seq || !FO.update || !FO.ref || !FO.rtdb) return Promise.resolve(false);
    const key = code + ':' + seq;
    if(authorityPersistPromises.has(key)) return authorityPersistPromises.get(key);
    const persistPromise = persistAuthorityAcceptedAction(code, accepted)
      .then(()=>{
        authorityPersistRetries.delete(key);
        return true;
      })
      .catch(err=>{
        authorityPersistPromises.delete(key);
        console.warn('WebSocket accepted action could not be persisted yet', err);
        const tries = (authorityPersistRetries.get(key) || 0) + 1;
        authorityPersistRetries.set(key, tries);
        if(tries <= 4){
          setTimeout(function(){
            if(!authorityPersistPromises.has(key)){
              ensureAuthorityAcceptedActionPersisted(code, accepted).catch(()=>{});
            }
          }, 700 + tries * 500);
        }
        return false;
      });
    authorityPersistPromises.set(key, persistPromise);
    return persistPromise;
  }

  function handleLobbyMatchStartAccepted(accepted){
    const action = accepted && accepted.action;
    if(String(action?.type || '').toUpperCase() !== 'MATCH_START') return false;
    const g = gameState();
    if(isOnlineMatchState(g)) return false;
    const code = String(accepted?.roomCode || activeRoom || lastLobbyRoom?.roomCode || '').trim().toUpperCase();
    if(!code) return false;
    if(activeRoom && String(activeRoom || '').trim().toUpperCase() !== code) return false;
    const payload = action.payload || {};
    rememberFlyStartAction(code, action);
    const roomPatch = accepted.roomPatch || {};
    const baseRoom = lastLobbyRoom || {};
    const nextRoom = Object.assign({}, baseRoom, roomPatch, {
      _flyRoom:true,
      roomCode:code,
      status:roomPatch.status || baseRoom.status || 'playing',
      phase:roomPatch.phase || baseRoom.phase || 'playing',
      hostUid:payload.hostUid || baseRoom.hostUid || '',
      guestUid:payload.guestUid || baseRoom.guestUid || '',
      seed:payload.seed || roomPatch.seed || baseRoom.seed || '',
      song:payload.song || roomPatch.song || baseRoom.song || '',
      lastActionSeq:Math.max(Number(baseRoom.lastActionSeq || 0) || 0, Number(action.seq || 0) || 0)
    });
    nextRoom._startAction = action;
    if(!nextRoom.players || !Object.keys(nextRoom.players).length) nextRoom.players = lastLobbyPlayers || {};
    lastLobbyRoom = nextRoom;
    lastLobbyPlayers = nextRoom.players || lastLobbyPlayers || {};
    try {
      const perf = window.__fatePerf = window.__fatePerf || {};
      perf.onlineLobbyMatchStartSignal = {
        at:Date.now(),
        roomCode:code,
        seq:Number(action.seq || 0) || 0,
        transport:'websocket-accepted'
      };
    } catch(e) {}
    maybeStartRoomGame(nextRoom, 'websocket-match-start');
    return true;
  }

  function applyAcceptedCanonicalActionNow(action, accepted){
    const g = gameState();
    if(!isOnlineMatchState(g)) return false;
    const type = String(action?.type || '').toUpperCase();
    const payload = action?.payload || {};
    if(!shouldApplyServerStateDirectly(type, payload)) return false;
    const seq = Number(action?.seq || 0) || 0;
    const directAction = accepted?.serverStateHash
      ? Object.assign({}, action, {serverStateHash:String(accepted.serverStateHash || '')})
      : action;
    if(seq){
      lastActionSeq = Math.max(lastActionSeq, seq);
      g._onlineActionSeq = lastActionSeq;
    }
    try{
      applyAuthoritativePostState(directAction, 'accepted authoritative state seq ' + (seq || '?'));
      if(seq){
        lastAppliedActionSeq = Math.max(lastAppliedActionSeq, seq);
        const latest = gameState();
        if(latest){
          latest._onlineActionSeq = Math.max(Number(latest._onlineActionSeq || 0) || 0, lastActionSeq);
          latest._onlineAppliedActionSeq = lastAppliedActionSeq;
        }
        discardBufferedActionsThrough(lastAppliedActionSeq);
        reportActionProgress(lastAppliedActionSeq, {
          turnBoundary:isTurnBoundaryOnlineAction(directAction),
          force:isTurnBoundaryOnlineAction(directAction)
        });
      }
      evaluateLagPause();
    }catch(e){
      console.error('Immediate accepted authoritative state apply failed; falling back to replay buffer', e, directAction);
      bufferOnlineAction(directAction);
    }
    return true;
  }

  function handleAuthorityAcceptedMessage(accepted){
    const action = accepted && accepted.action;
    const code = String(accepted?.roomCode || gameState()?._onlineRoomCode || activeRoom || '').trim().toUpperCase();
    if(!action || !code) return;
    if(accepted.serverStateHash) lastAuthorityStateHash = String(accepted.serverStateHash || '');
    if(handleLobbyMatchStartAccepted(accepted)) return;
    if(applyAcceptedCanonicalActionNow(action, accepted)){
      if(!shouldSkipAuthorityRtdbPersist(accepted)){
        ensureAuthorityAcceptedActionPersisted(code, accepted).catch(()=>{});
      }
      return;
    }
    const bufferedAction = accepted.serverStateHash
      ? Object.assign({}, action, {serverStateHash:String(accepted.serverStateHash || '')})
      : action;
    bufferOnlineAction(bufferedAction);
    if(!shouldSkipAuthorityRtdbPersist(accepted)){
      ensureAuthorityAcceptedActionPersisted(code, accepted).catch(()=>{});
    }
  }

  async function sendAction(type, payload={}){
    const code = gameState()?._onlineRoomCode || activeRoom;
    const u = window.FATE_ONLINE?.user;
    if(!code || !u) return;
    const actionType = String(type || '').toUpperCase();
    payload = onlineFirebaseSafeValue(payload || {});
    const authorityEnabled = !!configuredAuthorityUrl();
    const allowFirebaseFallback = firebaseActionFallbackAllowed();
    const authorityActionType = authorityEnabled && !allowFirebaseFallback
      ? strictAuthorityIntentForSend(actionType, payload, gameState())
      : actionType;
    if(authorityEnabled && authorityActionType !== 'STATE_SYNC' && authorityActionType !== 'EFFECT_CINEMATIC' && !payload.clientActionId){
      payload.clientActionId = makeDirectAuthorityActionId(authorityActionType);
    }
    let fallbackPublished = false;
    if(authorityOnlyMode() && !authorityEnabled){
      throw new Error('Fly authority-only mode is enabled but no WebSocket authority URL is configured');
    }
    if(allowFirebaseFallback && actionType === 'CHOOSE_TURN'){
      fallbackPublished = await publishPlayerActionFallback(code, actionType, payload, u).catch(e=>{
        console.warn('Player-node action fallback publish failed', e);
        return false;
      });
    }
    try{
      try{
        const accepted = await sendActionViaAuthority(authorityActionType, payload);
        if(accepted){
          if(!shouldSkipAuthorityRtdbPersist(accepted)){
            await ensureAuthorityAcceptedActionPersisted(code, accepted);
          }
          return;
        }
      }catch(e){
        if(e && e.authorityRejected){
          console.warn('WebSocket authority rejected action.', e.message, actionType, payload);
          throw e;
        }
        if(!allowFirebaseFallback){
          console.warn('WebSocket authority action path failed and RTDB action fallback is disabled.', e);
          if(window.toast) toast('Fly authority unavailable - action not sent');
          throw e;
        }
        console.warn('WebSocket authority action path failed; falling back to Firebase transaction.', e);
        if(window.toast) toast('WebSocket authority unavailable - using Firebase sync');
      }
      if(!allowFirebaseFallback){
        const err = new Error('RTDB action fallback is disabled for Fly authority rooms');
        console.warn(err.message, actionType);
        if(window.toast) toast('Fly authority unavailable - action not sent');
        throw err;
      }
      if(actionType === 'CHOOSE_TURN'){
        await sendActionDirectFirebase(code, actionType, payload, u);
        return;
      }
      let seq = 0;
      if(FO.runTransaction){
        const result = await FO.runTransaction(FO.ref(FO.rtdb, `rooms/${code}/lastActionSeq`), current => (Number(current || 0) + 1)).catch(e=>{ console.error('Action sequence transaction failed', e); return null; });
        if(!result || !result.committed){ if(window.toast) toast('Action failed'); return; }
        seq = Number(result.snapshot.val() || 0);
      }else{
        const roomSnap = await FO.get(FO.ref(FO.rtdb, `rooms/${code}`));
        const room = roomSnap.val() || {};
        seq = Number(room.lastActionSeq || 0) + 1;
        await FO.update(FO.ref(FO.rtdb), { [`rooms/${code}/lastActionSeq`]:seq });
      }
      const action = { seq, uid:u.uid, type:actionType, payload, createdAt:FO.serverTimestamp() };
      if(payload?.clientActionId) action.clientActionId = String(payload.clientActionId);
      await FO.update(FO.ref(FO.rtdb), { [`rooms/${code}/actions/${String(seq).padStart(6,'0')}`]: action, [`rooms/${code}/updatedAt`]:FO.serverTimestamp() });
    }catch(e){
      if(fallbackPublished){
        console.warn('Primary action sync failed; player-node fallback already published', e);
        return;
      }
      throw e;
    }
  }

  async function findExistingActionByClientId(code, clientActionId){
    if(!code || !clientActionId || !FO.get) return null;
    const snap = await FO.get(cappedRoomActionsRef(code, 80)).catch(()=>null);
    const actions = snap?.val() || {};
    const found = Object.values(actions).find(a => a && String(a.clientActionId || a.payload?.clientActionId || '') === String(clientActionId));
    return found || null;
  }

  async function sendActionDirectFirebase(code, type, payload, u){
    payload = onlineFirebaseSafeValue(payload || {});
    const isTurnChoice = String(type || '').toUpperCase() === 'CHOOSE_TURN';
    if(isTurnChoice){
      publishTurnChoiceFallback(code, payload, u).catch(e=>console.warn('Turn-choice fallback publish failed', e));
    }
    const existing = await findExistingActionByClientId(code, payload?.clientActionId);
    if(existing){
      bufferOnlineAction(existing);
      return;
    }
    const roomSnap = await FO.get(FO.ref(FO.rtdb, `rooms/${code}`));
    const room = roomSnap.val() || {};
    const seq = Number(room.lastActionSeq || 0) + 1;
    const action = { seq, uid:u.uid, type:String(type || '').toUpperCase(), payload, createdAt:FO.serverTimestamp() };
    if(payload?.clientActionId) action.clientActionId = String(payload.clientActionId);
    const patch = {
      [`rooms/${code}/actions/${String(seq).padStart(6,'0')}`]: action,
      [`rooms/${code}/lastActionSeq`]: seq,
      [`rooms/${code}/updatedAt`]:FO.serverTimestamp()
    };
    try{
      await FO.update(FO.ref(FO.rtdb), patch);
      bufferOnlineAction(action);
    }catch(e){
      if(isTurnChoice){
        console.warn('Turn-choice action-log write failed; relying on player-node fallback', e);
        return;
      }
      throw e;
    }
  }

  function installOnlineGameplayHooks(){
    if(window.__fateOnlineGameplayHooksInstalled) return;
    window.__fateOnlineGameplayHooksInstalled = true;
    const originals = window.__fateOnlineOriginalFns = window.__fateOnlineOriginalFns || {};

    if(typeof window.endTurn === 'function' && !originals.endTurn){
      originals.endTurn = window.endTurn;
      window.endTurn = function(){
        const g = gameState();
        if(!isOnlineMatchState(g) || g._onlineApplyingRemoteAction){
          return originals.endTurn.apply(this, arguments);
        }
        if(g._onlineSilentEndTurnUntil && Date.now() < g._onlineSilentEndTurnUntil && Number(g.currentPlayer) !== Number(g._onlinePlayerIndex)) {
          return;
        }
        if(!canSendLocalAction(g, 'END_TURN')) return;
        if(typeof window.deferTurnEndUntilModalComplete === 'function' && window.deferTurnEndUntilModalComplete('online-end-turn')) {
          return false;
        }
        if(Number(g.turn || 0) >= Number(g.maxTurns || 0)){
          const payload = {
            playerIndex:g.currentPlayer,
            turn:g.turn,
            baseStateHash:lastAuthorityStateHash || ''
          };
          return sendAction('MATCH_RESULT', payload).catch(e=>{
            console.error('Online match result finalization failed', e);
            if(window.toast) toast('Could not finalize match result with server.');
          });
        }
        const args = arguments;
        return sendOptimisticAction('END_TURN', { playerIndex:g.currentPlayer, turn:g.turn }, ()=>{
          const result = originals.endTurn.apply(this, args);
          updateRoomTurn(gameState()?.currentPlayer);
          return result;
        });
      };
    }

    if(typeof window.chooseTurn === 'function' && !originals.chooseTurn){
      originals.chooseTurn = window.chooseTurn;
      window.chooseTurn = function(goFirst){
        const g = gameState();
        if(!isOnlineMatchState(g) || g._onlineApplyingRemoteAction){
          return originals.chooseTurn.apply(this, arguments);
        }
        if(Number(g._coinWinner) !== Number(g._onlinePlayerIndex)){
          onlineTurnError();
          return;
        }
        const args = arguments;
        return sendOptimisticAction('CHOOSE_TURN', {
          playerIndex:g._coinWinner,
          goFirst:!!goFirst
        }, ()=>{
          const result = originals.chooseTurn.apply(this, args);
          updateRoomTurn(gameState()?.currentPlayer);
          return result;
        });
      };
    }

    if(typeof window.playPlacementAnimation === 'function' && !originals.playPlacementAnimation){
      originals.playPlacementAnimation = window.playPlacementAnimation;
      window.playPlacementAnimation = function(){
        const g = gameState();
        if(isOnlineMatchState(g) && g._onlineApplyingRemoteAction) return 0;
        return originals.playPlacementAnimation.apply(this, arguments);
      };
    }

    if(typeof window.initiateConsolidate === 'function' && !originals.initiateConsolidate){
      originals.initiateConsolidate = window.initiateConsolidate;
      window.initiateConsolidate = function(){
        const g = gameState();
        if(!isOnlineMatchState(g) || g._onlineApplyingRemoteAction){
          return originals.initiateConsolidate.apply(this, arguments);
        }
        if(!canSendLocalAction(g, 'START_CONSOLIDATE')) return;
        const args = arguments;
        return sendOptimisticAction('START_CONSOLIDATE', {
          playerIndex:g.currentPlayer,
          turn:g.turn,
          selectedHand:selectedHandSnapshot(g)
        }, ()=>originals.initiateConsolidate.apply(this, args));
      };
    }

    if(typeof window.placeSelected === 'function' && !originals.placeSelected){
      originals.placeSelected = window.placeSelected;
      window.placeSelected = function(){
        const g = gameState();
        if(!isOnlineMatchState(g) || g._onlineApplyingRemoteAction){
          return originals.placeSelected.apply(this, arguments);
        }
        if(!canSendLocalAction(g, 'PLACE_CARD')) return;
        if(configuredAuthorityUrl() && !firebaseActionFallbackAllowed()){
          return originals.placeSelected.apply(this, arguments);
        }
        const args = arguments;
        return sendOptimisticAction('HAND_ACTION', {
          fn:'placeSelected',
          playerIndex:g.currentPlayer,
          turn:g.turn,
          selectedHand:selectedHandSnapshot(g)
        }, ()=>originals.placeSelected.apply(this, args));
      };
    }

    if(typeof window.clickCell === 'function' && !originals.clickCell){
      originals.clickCell = window.clickCell;
      window.clickCell = function(z,r,c){
        const g = gameState();
        if(!isOnlineMatchState(g) || g._onlineApplyingRemoteAction){
          return originals.clickCell.apply(this, arguments);
        }
        if(!onlineCellActionPending(g)){
          return originals.clickCell.apply(this, arguments);
        }
        if(!canSendLocalAction(g, 'CLICK_CELL')) return;
        const args = arguments;
        const pendingMove = g._serverPendingMove || null;
        const pendingConsolidation = g._consolidating || null;
        return sendOptimisticAction('CLICK_CELL', {
          playerIndex:g.currentPlayer,
          turn:g.turn,
          z,r,c,
          promptId:(pendingMove && pendingMove.promptId) || (pendingConsolidation && pendingConsolidation.promptId) || '',
          placing:!!g.placing,
          selectedHand:selectedHandSnapshot(g)
        }, ()=>originals.clickCell.apply(this, args));
      };
    }

    if(typeof window.checkWin === 'function' && !originals.checkWin){
      originals.checkWin = window.checkWin;
      window.checkWin = function(){
        const result = originals.checkWin.apply(this, arguments);
        const g = gameState();
        if(isOnlineMatchState(g) && !g._onlineResultMarked && g._onlinePlayerIndex === 0){
          g._onlineResultMarked = true;
          const code = g._onlineRoomCode;
          if(!roomUsesFly(code)){
            FO.update(FO.ref(FO.rtdb), {
              [`rooms/${code}/status`]:'ended',
              [`rooms/${code}/phase`]:'ended',
              [`rooms/${code}/endedAt`]:FO.serverTimestamp(),
              [`rooms/${code}/updatedAt`]:FO.serverTimestamp()
            }).catch(()=>{});
          }
          if(typeof window.disbandOnlineParty === 'function'){
            window.disbandOnlineParty('Party disbanded after the match.', {silent:true}).catch(()=>{});
          }
        }
        return result;
      };
    }

    if(typeof window.showModal === 'function' && !originals.showModal){
      originals.showModal = window.showModal;
      window.showModal = function(title, bodyHtml, actions, opts){
        const g = gameState();
        if(g?._onlineLocalModalBypass || window.__fateOnlineLocalModalBypass) return originals.showModal.apply(this, arguments);
        if(!isOnlineMatchState(g) || !Array.isArray(actions)){
          return originals.showModal.apply(this, arguments);
        }
        if(actions.length === 0){
          return originals.showModal.apply(this, arguments);
        }
        var isReadOnly = (opts && opts.immediate) || (actions.length === 1 && /^close$/i.test(actions[0].label||''));
        if(isReadOnly){
          return originals.showModal.apply(this, arguments);
        }
        g._onlinePendingModalActions = actions;
        const localCanChoose = Number(g.currentPlayer) === Number(g._onlinePlayerIndex);
        if(!localCanChoose){
          return;
        }
        const wrappedActions = actions.map((action, actionIndex)=>Object.assign({}, action, {
          action:()=>{
            const pendingModal = gameState()?._serverPendingModalAction || null;
            return sendOptimisticAction('MODAL_ACTION', {
              playerIndex:g.currentPlayer,
              turn:g.turn,
              promptId:pendingModal && pendingModal.promptId || '',
              actionIndex,
              effectCinematic:selectedBoardEffectCinematicPayload(g)
            }, ()=>action.action());
          }
        }));
        return originals.showModal.call(this, title, bodyHtml, wrappedActions);
      };
    }

    if(typeof window.pickCardsVisual === 'function' && !originals.pickCardsVisual){
      originals.pickCardsVisual = window.pickCardsVisual;
      window.pickCardsVisual = function(cards, opts, onConfirm){
        const g = gameState();
        if(!isOnlineMatchState(g) || typeof onConfirm !== 'function'){
          return originals.pickCardsVisual.apply(this, arguments);
        }
        if(g._onlinePendingZonePicker){
          return originals.pickCardsVisual.apply(this, arguments);
        }
        g._onlinePendingPickCardsVisual = { cards:cards || [], onConfirm };
        const localCanChoose = Number(g.currentPlayer) === Number(g._onlinePlayerIndex);
        if(!localCanChoose) return;
        const wrappedConfirm = (chosen)=>{
          const latest = gameState();
          if(latest?._onlineApplyingRemoteAction) return onConfirm(chosen);
          if(!canSendLocalAction(latest, 'PICK_CARDS_VISUAL')) return;
          const pendingPick = latest?._serverPendingCardPick || null;
          return sendOptimisticAction('PICK_CARDS_VISUAL', {
            playerIndex:latest.currentPlayer,
            turn:latest.turn,
            promptId:pendingPick && pendingPick.promptId || '',
            selectedCards:(chosen || []).map(cardIdentity)
          }, ()=>onConfirm(chosen));
        };
        return originals.pickCardsVisual.call(this, cards, opts, wrappedConfirm);
      };
    }

    if(typeof window.showZonePicker === 'function' && !originals.showZonePicker){
      originals.showZonePicker = window.showZonePicker;
      window.showZonePicker = function(z, prompt, entries, maxCount, viewerP, onConfirm, filter){
        const g = gameState();
        if(!isOnlineMatchState(g) || typeof onConfirm !== 'function'){
          return originals.showZonePicker.apply(this, arguments);
        }
        g._onlinePendingZonePicker = { entries:entries || [], onConfirm };
        const localCanChoose = Number(g.currentPlayer) === Number(g._onlinePlayerIndex);
        if(!localCanChoose) return;
        const wrappedConfirm = (chosen)=>{
          const latest = gameState();
          if(latest?._onlineApplyingRemoteAction) return onConfirm(chosen);
          if(!canSendLocalAction(latest, 'PICK_ZONE')) return;
          const pendingPick = latest?._serverPendingZonePick || null;
          return sendOptimisticAction('PICK_ZONE', {
            playerIndex:latest.currentPlayer,
            turn:latest.turn,
            promptId:pendingPick && pendingPick.promptId || '',
            selectedEntries:(chosen || []).map(boardSelectionPayload)
          }, ()=>onConfirm(chosen));
        };
        return originals.showZonePicker.call(this, z, prompt, entries, maxCount, viewerP, wrappedConfirm, filter);
      };
    }

    if(typeof window.showBoardTargetPicker === 'function' && !originals.showBoardTargetPicker){
      originals.showBoardTargetPicker = window.showBoardTargetPicker;
      window.showBoardTargetPicker = function(opts, onConfirm){
        const g = gameState();
        if(!isOnlineMatchState(g) || typeof onConfirm !== 'function'){
          return originals.showBoardTargetPicker.apply(this, arguments);
        }
        const entries = (opts && Array.isArray(opts.entries)) ? opts.entries : [];
        g._onlinePendingZonePicker = { entries, onConfirm };
        const localCanChoose = Number(g.currentPlayer) === Number(g._onlinePlayerIndex);
        if(!localCanChoose) return;
        const wrappedOpts = Object.assign({}, opts || {});
        const wrappedConfirm = (chosen)=>{
          const latest = gameState();
          if(latest?._onlineApplyingRemoteAction) return onConfirm(chosen);
          if(!canSendLocalAction(latest, 'PICK_ZONE')) return;
          const pendingPick = latest?._serverPendingZonePick || null;
          return sendOptimisticAction('PICK_ZONE', {
            playerIndex:latest.currentPlayer,
            turn:latest.turn,
            promptId:pendingPick && pendingPick.promptId || '',
            selectedEntries:(chosen || []).map(boardSelectionPayload)
          }, ()=>onConfirm(chosen));
        };
        if(wrappedOpts.allowOptionalCancelServerAction === true){
          const originalCancel = wrappedOpts.onCancel;
          wrappedOpts.onCancel = ()=>{
            const latest = gameState();
            if(latest?._onlineApplyingRemoteAction){
              if(typeof originalCancel === 'function') return originalCancel();
              return onConfirm([]);
            }
            if(!canSendLocalAction(latest, 'PICK_ZONE')) return;
            const pendingPick = latest?._serverPendingZonePick || null;
            return sendOptimisticAction('PICK_ZONE', {
              playerIndex:latest.currentPlayer,
              turn:latest.turn,
              promptId:pendingPick && pendingPick.promptId || '',
              selectedEntries:[]
            }, ()=>{
              if(typeof originalCancel === 'function') return originalCancel();
              return onConfirm([]);
            });
          };
        }
        return originals.showBoardTargetPicker.call(this, wrappedOpts, wrappedConfirm);
      };
    }

    if(typeof window.showAffiliationPickerVisual === 'function' && !originals.showAffiliationPickerVisual){
      originals.showAffiliationPickerVisual = window.showAffiliationPickerVisual;
      window.showAffiliationPickerVisual = function(callback){
        const g = gameState();
        if(g?._onlineLocalModalBypass || window.__fateOnlineLocalModalBypass) return originals.showAffiliationPickerVisual.apply(this, arguments);
        if(!isOnlineMatchState(g) || typeof callback !== 'function'){
          return originals.showAffiliationPickerVisual.apply(this, arguments);
        }
        g._onlinePendingAffiliationPicker = { callback };
        const localCanChoose = Number(g.currentPlayer) === Number(g._onlinePlayerIndex);
        if(!localCanChoose) return;
        const wrappedCallback = (aff)=>{
          const latest = gameState();
          if(latest?._onlineApplyingRemoteAction) return callback(aff);
          if(!canSendLocalAction(latest, 'PICK_AFFILIATION')) return;
          const pendingModal = latest?._serverPendingModalAction || null;
          return sendOptimisticAction('PICK_AFFILIATION', {
            playerIndex:latest.currentPlayer,
            turn:latest.turn,
            promptId:pendingModal && pendingModal.promptId || '',
            aff:String(aff || '')
          }, ()=>callback(aff));
        };
        return originals.showAffiliationPickerVisual.call(this, wrappedCallback);
      };
    }

    if(typeof window.chooseLandscapeZone === 'function' && !originals.chooseLandscapeZone){
      originals.chooseLandscapeZone = window.chooseLandscapeZone;
      window.chooseLandscapeZone = function(player, title, subtitle, onChoose, opts){
        const g = gameState();
        if(!isOnlineMatchState(g) || typeof onChoose !== 'function'){
          return originals.chooseLandscapeZone.apply(this, arguments);
        }
        g._onlinePendingLandscapeZonePicker = { player, onChoose };
        const localCanChoose = Number(player) === g._onlinePlayerIndex;
        if(!localCanChoose) return;
        const wrappedChoose = (zone)=>{
          const latest = gameState();
          if(latest?._onlineApplyingRemoteAction) return onChoose(zone);
          if(!canSendLocalAction(latest, 'PICK_LANDSCAPE_ZONE')) return;
          if(Number(player) !== latest._onlinePlayerIndex) {
            onlineTurnError();
            return;
          }
          return sendOptimisticAction('PICK_LANDSCAPE_ZONE', {
            playerIndex:Number(player),
            chooserIndex:Number(player),
            turn:latest.turn,
            zone:Number(zone)
          }, ()=>{
            const applying = gameState();
            if(applying && Number(applying.currentPlayer) !== Number(applying._onlinePlayerIndex)) applying._onlineSilentEndTurnUntil = Date.now() + 700;
            return onChoose(zone);
          });
        };
        return originals.chooseLandscapeZone.call(this, player, title, subtitle, wrappedChoose, opts);
      };
    }

    if(typeof window.toast === 'function' && !originals.toast){
      originals.toast = window.toast;
      window.toast = function(msg){
        const g = gameState();
        const text = String(msg || '').trim();
        const isRemoteOpponentPrompt = isOnlineMatchState(g)
          && g._onlineApplyingRemoteAction
          && Number.isInteger(g._onlineRemoteActionPlayer)
          && g._onlineRemoteActionPlayer !== g._onlinePlayerIndex
          && /^(click|choose|select|must|need|no valid|no open|no eligible)/i.test(text);
        if(isRemoteOpponentPrompt) return;
        return originals.toast.apply(this, arguments);
      };
    }

    const boardFns = [
      'triggerCharacterEffect',
      'activatePendingWhenSetEffect',
      'activateWolfCreek',
      'activateExpeditionaryMove',
      'activateLandscapeEventideMove',
      'activateBusserMove',
      'activateWodnyPotokYouth',
      'discardBoardCard',
      'flipFaceDownBoardCard'
    ];
    boardFns.forEach(fnName=>{
      if(typeof window[fnName] !== 'function' || originals[fnName]) return;
      originals[fnName] = window[fnName];
      window[fnName] = function(){
        const g = gameState();
        if(!isOnlineMatchState(g) || g._onlineApplyingRemoteAction){
          return originals[fnName].apply(this, arguments);
        }
        if(!canSendLocalAction(g, 'BOARD_ACTION')) return;
        const pos = onlineFunctionPositionPayload(g, arguments);
        if(!pos) {
          recordOnlineDiagnostic(clientResolvedGameplayEnabled() ? 'client-resolved-board-action-without-source' : 'blocked-unsynced-board-action', {
            fn:fnName,
            reason:'missing board source coordinates'
          });
          if(!clientResolvedGameplayEnabled()){
            if(window.toast) toast('Could not sync that board effect. Select the card again.');
            return;
          }
        }
        const args = arguments;
        const payload = Object.assign({
          fn:fnName,
          playerIndex:g.currentPlayer,
          turn:g.turn
        }, pos || {});
        if(pos && (fnName === 'triggerCharacterEffect' || fnName === 'activatePendingWhenSetEffect')) {
          payload.effectCinematic = boardEffectCinematicPayload(g, pos.z, pos.r, pos.c);
        }
        return sendOptimisticAction('BOARD_ACTION', payload, ()=>originals[fnName].apply(this, args));
      };
    });

    if(typeof window.activateSantaAnnaProsperityFromHand === 'function' && !originals.activateSantaAnnaProsperityFromHand){
      originals.activateSantaAnnaProsperityFromHand = window.activateSantaAnnaProsperityFromHand;
    }
    window.__fateSendSantaAnnaAction = function(selectedHand, target){
      const g = gameState();
      if(!isOnlineMatchState(g) || g._onlineApplyingRemoteAction) return false;
      if(!canSendLocalAction(g, 'HAND_ACTION')) return false;
      return sendOptimisticAction('HAND_ACTION', {
        fn:'activateSantaAnnaProsperityFromHand',
        playerIndex:g._onlinePlayerIndex,
        turn:g.turn,
        selectedHand:selectedHand || selectedHandSnapshot(g, g._onlinePlayerIndex),
        target:target || null
      });
    };

    window.__fateSendEffectActivationCinematic = function(card, z, r, c, opts){
      const g = gameState();
      if(!canSendLocalAction(g, 'EFFECT_CINEMATIC')) return false;
      if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return false;
      const boardCard = g.board?.[z]?.[r]?.[c] || card || null;
      const payload = {
        playerIndex:g.currentPlayer,
        turn:g.turn,
        z,
        r,
        c,
        card:cardIdentity(boardCard)
      };
      try{ attachOnlinePostState(payload); }catch(e){}
      sendAction('EFFECT_CINEMATIC', payload).catch(e=>console.warn('Effect cinematic broadcast failed', e));
      return true;
    };

    const handFns = ['activateWineCountryGuerillaFromHand', 'activateSelvaIslandsPirateFromHand'];
    handFns.forEach(fnName=>{
      if(typeof window[fnName] !== 'function' || originals[fnName]) return;
      originals[fnName] = window[fnName];
      window[fnName] = function(){
        const g = gameState();
        if(!isOnlineMatchState(g) || g._onlineApplyingRemoteAction){
          return originals[fnName].apply(this, arguments);
        }
        if(!canSendLocalAction(g, 'HAND_ACTION')) return;
        const args = arguments;
        return sendOptimisticAction('HAND_ACTION', {
          fn:fnName,
          playerIndex:g.currentPlayer,
          turn:g.turn,
          selectedHand:selectedHandSnapshot(g)
        }, ()=>originals[fnName].apply(this, args));
      };
    });

    if(!window.__fateClientResolvedAutoCommitListenersInstalled){
      window.__fateClientResolvedAutoCommitListenersInstalled = true;
      const watchLocalMutation = reason=>setTimeout(()=>scheduleClientResolvedAutoCommit(reason, 180), 0);
      try{
        document.addEventListener('pointerup', ()=>watchLocalMutation('pointerup'), true);
        document.addEventListener('keyup', ()=>watchLocalMutation('keyup'), true);
        document.addEventListener('change', ()=>watchLocalMutation('change'), true);
      }catch(e){}
    }
  }

  async function leaveRoom(markForfeit, passive=false){
    const code = gameState()?._onlineRoomCode || activeRoom;
    const u = window.FATE_ONLINE?.user;
    if(code && u && !passive){
      if(roomUsesFly(code)){
        const flyRoom = lastLobbyRoom && lastLobbyRoom.roomCode === code ? lastLobbyRoom : {};
        if(markForfeit && flyRoom.status !== 'lobby') await sendAction('FORFEIT',{}).catch(()=>{});
        else {
          await flyApiRequest(`/api/rooms/${encodeURIComponent(code)}/leave`, {
            method:'POST',
            body:{uid:u.uid}
          }).catch(e=>console.warn('Fly room leave failed', e));
        }
      }else{
        if(!firebaseRoomTransportAllowed()){
          warnBlockedRtdbRoomFallback('rooms/leave');
        }else{
          const room = (await FO.get(FO.ref(FO.rtdb, `rooms/${code}`))).val() || {};
          if(room.status === 'lobby'){
            if(room.hostUid === u.uid){
              await FO.remove(FO.ref(FO.rtdb, `rooms/${code}`)).catch(()=>{});
            }else{
              const patch = { [`rooms/${code}/players/${u.uid}`]: null, [`rooms/${code}/updatedAt`]: FO.serverTimestamp() };
              if(room.guestUid === u.uid) patch[`rooms/${code}/guestUid`] = null;
              await FO.update(FO.ref(FO.rtdb), patch).catch(()=>{});
            }
          }else{
            if(markForfeit) await sendAction('FORFEIT',{}).catch(()=>{});
            await FO.update(FO.ref(FO.rtdb), { [`rooms/${code}/players/${u.uid}/connected`]:false, [`rooms/${code}/updatedAt`]:FO.serverTimestamp() }).catch(()=>{});
          }
        }
      }
    }
    activeRoom=null;
    const g = gameState();
    if(g){
      g._onlineRoomCode = null;
      g._onlineRole = null;
      g._onlinePlayerIndex = null;
      g._onlineRoomMode = null;
      g.localPlayerIndex = null;
      g.viewerPlayerIndex = null;
      g._onlineActionLogMode = false;
      g._onlineGameSong = null;
      g._onlineApplyingRemoteAction = false;
    }
    clearRoomWatchers();
    closeModal();
    if(typeof window.disbandOnlineParty === 'function'){
      window.disbandOnlineParty(markForfeit ? 'Party disbanded because a player left the match.' : 'Party disbanded after the match.', {silent:passive}).catch(()=>{});
    }
    // Unpublish live match listing when host leaves
    if(code && typeof window.fateUnpublishLiveMatch === 'function') window.fateUnpublishLiveMatch(code);
  }
  function handleRoomEnded(room){
    const code = room?.roomCode || activeRoom || '';
    if(code && endedRoomCodesHandled.has(code)) return;
    if(code) endedRoomCodesHandled.add(code);
    if(window.toast) toast('Room ended');
    if(typeof window.disbandOnlineParty === 'function'){
      window.disbandOnlineParty('Party disbanded after the match.', {silent:false}).catch(()=>{});
    }
    // Unpublish when match ends
    if(room?.roomCode && typeof window.fateUnpublishLiveMatch === 'function') window.fateUnpublishLiveMatch(room.roomCode);
  }

  async function startFlyRandomQueue(mode, deckChoice, handlers={}, partyTargetUid=''){
    const u = getUser(); if(!u) return false;
    const deck = normalizeQueueDeck(deckChoice);
    if(!deck){ if(window.toast) toast('Choose a valid 40-card deck first'); return false; }
    const deckErr = validateOnlineQueueDeck(deck);
    if(deckErr){
      emitRandomQueueStatus('error', deckErr);
      if(window.toast) toast(deckErr);
      return false;
    }
    const prof = await profile();
    const data = await flyApiRequest('/api/matchmaking/enter', {
      method:'POST',
      timeoutMs:45000,
      body:{
        uid:u.uid,
        mode,
        profile:prof,
        deckChoice:flyDeckChoiceFromRoomDeck(deck),
        partyTargetUid:partyTargetUid || ''
      }
    });
    const room = normalizeFlyRoom(data.room);
    if(!room.roomCode) throw new Error('Fly matchmaking returned no room');
    if(String(data.accepted?.action?.type || '').toUpperCase() === 'MATCH_START'){
      room._startAction = rememberFlyStartAction(room.roomCode, data.accepted.action);
    }else if(data.accepted?.action) bufferOnlineAction(data.accepted.action);
    activeRoom = room.roomCode;
    lastLobbyRoom = room;
    lastLobbyPlayers = room.players;
    randomQueueState.roomCode = room.roomCode;
    randomQueueState.role = data.matched ? 'guest' : 'host';
    window.FATE_ONLINE_PENDING_ROOM_DECK = deck;
    allowOnlineMatchStart(room.roomCode, 'random-queue');
    watchFlyRoom(room.roomCode, {silent:true});
    if(room.status === 'matchup' || room.status === 'starting' || room.status === 'playing'){
      randomQueueState.started = true;
      emitRandomQueueStatus('starting', 'Match found. Starting game...');
      maybeStartRoomGame(room, 'random-queue');
      return true;
    }
    if(data.matched){
      randomQueueState.started = false;
      emitRandomQueueStatus('matched', 'Opponent found. Waiting for host...');
    }else{
      emitRandomQueueStatus('waiting', partyTargetUid ? 'Waiting for your party member...' : 'Waiting for a random player...');
    }
    return true;
  }

  function markFlyRandomQueueFailed(){
    randomQueueState.active = false;
    randomQueueState.roomCode = null;
    randomQueueState.role = null;
    randomQueueState.started = false;
    clearRandomQueueWatcher();
  }

  async function createQueuedRoom(deckChoice, mode='ranked'){
    const u = getUser(); if(!u) return null;
    mode = normalizeRoomMode(mode);
    const deck = normalizeQueueDeck(deckChoice);
    if(!deck){ if(window.toast) toast('Choose a valid 40-card deck first'); return null; }
    if(!firebaseRoomTransportAllowed()){
      warnBlockedRtdbRoomFallback('matchmaking/create-room');
      throw new Error('Legacy RTDB matchmaking fallback is disabled');
    }
    const prof = await profile();
    const now = FO.serverTimestamp();
    let code = '';
    let created = false;
    for(let i=0;i<14;i++){
      code = makeCode();
      const roomPayload = { roomCode:code, mode, status:'lobby', hostUid:u.uid, guestUid:null, createdAt:now, updatedAt:now, lastActionSeq:0, schemaVersion:1, matchmaking:true };
      if(FO.runTransaction){
        const claim = await FO.runTransaction(FO.ref(FO.rtdb, `rooms/${code}`), current => current ? undefined : roomPayload).catch(e=>{ console.error('Queue room create transaction failed', e); return null; });
        if(claim && claim.committed){ created = true; break; }
      }else{
        const exists = (await FO.get(FO.ref(FO.rtdb, `rooms/${code}`))).exists();
        if(!exists){
          await FO.set(FO.ref(FO.rtdb, `rooms/${code}`), roomPayload);
          created = true;
          break;
        }
      }
    }
    if(!created) throw new Error('Could not create matchmaking room');
    try{
      await FO.set(FO.ref(FO.rtdb, `rooms/${code}/players/${u.uid}`), {
        uid:u.uid,
        role:'host',
        ready:true,
        connected:true,
        joinedAt:now,
        profileSnapshot:prof,
        selectedDeckKey:deck.selectedDeckKey,
        selectedDeckName:deck.selectedDeckName,
        deckIds:deck.deckIds
      });
    }catch(e){
      console.error('Queue host player write failed', e);
      await FO.remove(FO.ref(FO.rtdb, `rooms/${code}`)).catch(()=>{});
      throw e;
    }
    await setConnectedOnDisconnect(code, u.uid);
    return { code, prof, deck };
  }

  async function findRandomQueueOpponent(selfUid, mode='ranked', partyTargetUid=''){
    if(!firebaseRoomTransportAllowed()){
      warnBlockedRtdbRoomFallback('matchmaking/find');
      return null;
    }
    mode = normalizeRoomMode(mode);
    const targetKey = queueKeyFor(mode, 'waiting', partyTargetUid ? selfUid : '');
    const queueRef = (FO.query && FO.orderByChild && FO.equalTo && FO.limitToFirst)
      ? FO.query(FO.ref(FO.rtdb, 'matchmaking'), FO.orderByChild('queueKey'), FO.equalTo(targetKey), FO.limitToFirst(30))
      : FO.ref(FO.rtdb, 'matchmaking/__no_unbounded_fallback__');
    const snap = await FO.get(queueRef).catch(()=>null);
    const all = snap?.val() || {};
    const isEligibleQueueOpponent = (entry)=>{
      if(!entry || !entry.uid || entry.uid === selfUid) return false;
      if(normalizeRoomMode(entry.mode) !== mode || entry.status !== 'waiting') return false;
      if(!/^[A-Z0-9]{6}$/.test(String(entry.roomCode || ''))) return false;
      const entryTarget = String(entry.partyTargetUid || '');
      if(partyTargetUid) return entry.uid === partyTargetUid && entryTarget === selfUid;
      return !entryTarget;
    };
    const candidates = Object.values(all)
      .filter(isEligibleQueueOpponent)
      .sort((a,b)=>{
        return Math.random() - 0.5;
      });
    for(const entry of candidates){
      const room = (await FO.get(FO.ref(FO.rtdb, `rooms/${entry.roomCode}`)).catch(()=>null))?.val();
      if(!room || room.status !== 'lobby' || room.hostUid !== entry.uid) continue;
      const host = (await FO.get(FO.ref(FO.rtdb, `rooms/${entry.roomCode}/players/${room.hostUid}`)).catch(()=>null))?.val();
      if(!isConnectedPlayer(host) || !hasValidDeck(host)) continue;
      const guest = room.guestUid ? (await FO.get(FO.ref(FO.rtdb, `rooms/${entry.roomCode}/players/${room.guestUid}`)).catch(()=>null))?.val() : null;
      if(room.guestUid && isConnectedPlayer(guest)) continue;
      return entry;
    }
    return null;
  }

  function watchForLowerUidQueueHost(deckChoice, mode='ranked', partyTargetUid=''){
    clearRandomQueueWatcher();
    if(!firebaseRoomTransportAllowed()){
      warnBlockedRtdbRoomFallback('matchmaking/watch');
      return;
    }
    const u = window.FATE_ONLINE?.user;
    if(!u || !FO.rtdb || !FO.onValue) return;
    const myUid = String(u.uid);
    mode = normalizeRoomMode(mode);
    const targetKey = queueKeyFor(mode, 'waiting', partyTargetUid ? myUid : '');
    const queueRef = (FO.query && FO.orderByChild && FO.equalTo && FO.limitToFirst)
      ? FO.query(FO.ref(FO.rtdb, 'matchmaking'), FO.orderByChild('queueKey'), FO.equalTo(targetKey), FO.limitToFirst(30))
      : FO.ref(FO.rtdb, 'matchmaking/__no_unbounded_fallback__');
    randomQueueUnsub = FO.onValue(queueRef, async snap=>{
      if(randomQueueSwitching || !randomQueueState.active || randomQueueState.role !== 'host' || randomQueueState.started) return;
      const all = snap.val() || {};
      const isEligibleLowerHost = (entry)=>{
        if(!entry || !entry.uid || String(entry.uid) >= myUid) return false;
        if(normalizeRoomMode(entry.mode) !== mode || entry.status !== 'waiting') return false;
        if(!/^[A-Z0-9]{6}$/.test(String(entry.roomCode || ''))) return false;
        const entryTarget = String(entry.partyTargetUid || '');
        if(partyTargetUid) return entry.uid === partyTargetUid && entryTarget === myUid;
        return !entryTarget;
      };
      const lowerHosts = Object.values(all)
        .filter(isEligibleLowerHost)
        .sort((a,b)=>{
          return Math.random() - 0.5;
        });
      if(!lowerHosts.length) return;
      randomQueueSwitching = true;
      const handlers = randomQueueState.handlers;
      const oldCode = randomQueueState.roomCode;
      const target = lowerHosts[0];
      try{
        emitRandomQueueStatus('joining', 'Another queued player was found. Joining...');
        clearRandomQueueWatcher();
        await removeOwnQueueEntry();
        if(oldCode && activeRoom === oldCode && !(gameState()?._onlineRoomCode)){
          await leaveRoom(false).catch(()=>{});
        }else{
          clearRoomWatchers();
        }
        randomQueueState = { active:true, roomCode:null, role:null, started:false, handlers };
        const joined = await joinQueuedRoom(target, deckChoice, mode);
        if(!joined){
          randomQueueSwitching = false;
          await startRandomQueue(mode, deckChoice, handlers || {});
          return;
        }
      }catch(e){
        console.error('Queue host switch failed', e);
        emitRandomQueueStatus('waiting', 'Still searching random queue...');
      }finally{
        randomQueueSwitching = false;
      }
    });
  }

  async function joinQueuedRoom(entry, deckChoice, mode='ranked'){
    const u = getUser(); if(!u) return false;
    const deck = normalizeQueueDeck(deckChoice);
    if(!deck) return false;
    mode = normalizeRoomMode(mode);
    if(!firebaseRoomTransportAllowed()){
      warnBlockedRtdbRoomFallback('matchmaking/join');
      return false;
    }
    window.FATE_ONLINE_PENDING_ROOM_DECK = deck;
    const joined = await joinRoom(entry.roomCode, {silent:true, quiet:true}).catch(e=>{ console.warn('Queued join failed', e); return false; });
    if(!joined) return false;
    const room = (await FO.get(FO.ref(FO.rtdb, `rooms/${entry.roomCode}`)).catch(()=>null))?.val();
    if(room?.guestUid !== u.uid){
      if(activeRoom === entry.roomCode) await leaveRoom(false).catch(()=>{});
      return false;
    }
    const hostNode = room.hostUid ? (await FO.get(FO.ref(FO.rtdb, `rooms/${entry.roomCode}/players/${room.hostUid}`)).catch(()=>null))?.val() : null;
    if(!isConnectedPlayer(hostNode) || !hasValidDeck(hostNode)){
      await leaveRoom(false).catch(()=>{});
      return false;
    }
    randomQueueState.roomCode = entry.roomCode;
    randomQueueState.role = 'guest';
    await FO.set(FO.ref(FO.rtdb, `matchmaking/${u.uid}`), {
      uid:u.uid,
      mode,
      status:'matched',
      queueKey:queueKeyFor(mode, 'matched'),
      role:'guest',
      roomCode:entry.roomCode,
      matchedUid:entry.uid,
      updatedAt:FO.serverTimestamp()
    }).catch(()=>{});
    await FO.onDisconnect(FO.ref(FO.rtdb, `matchmaking/${u.uid}`)).remove().catch(()=>{});
    emitRandomQueueStatus('matched', 'Opponent found. Waiting for host...');
    return true;
  }

  async function startRandomQueue(mode, deckChoice, handlers={}){
    const u = getUser(); if(!u) return false;
    mode = normalizeRoomMode(mode);
    const deck = normalizeQueueDeck(deckChoice);
    if(!deck){ if(window.toast) toast('Choose a valid 40-card deck first'); return false; }
    const deckErr = validateOnlineQueueDeck(deck);
    if(deckErr){
      emitRandomQueueStatus('error', deckErr);
      if(window.toast) toast(deckErr);
      return false;
    }
    await cancelChallengerRandomQueue({silent:true, keepScreen:true}).catch(()=>{});
    randomQueueState = { active:true, roomCode:null, role:null, started:false, handlers };
    window.FATE_ONLINE_PENDING_ROOM_DECK = deck;
    if(isWaitingForPartyMember()){
      emitRandomQueueStatus('waiting', 'Waiting for your party member...');
      partyQueueWaitTimer = setInterval(()=>{
        if(!randomQueueState.active){
          clearRandomQueueWatcher();
          return;
        }
        if(!isWaitingForPartyMember() && getQueuePartyTargetUid()){
          const savedHandlers = randomQueueState.handlers || handlers || {};
          clearRandomQueueWatcher();
          startRandomQueue(mode, deck, savedHandlers).catch(e=>{
            console.error('Party queue resume failed', e);
            emitRandomQueueStatus('error', 'Could not enter party queue. Try again.');
          });
        }else{
          emitRandomQueueStatus('waiting', 'Waiting for your party member...');
        }
      }, 1200);
      return true;
    }
    const partyTargetUid = getQueuePartyTargetUid();
    emitRandomQueueStatus('searching', partyTargetUid ? `Searching ${queueModeLabel(mode)} queue for party member...` : `Searching random ${queueModeLabel(mode)} queue...`);
    if(flyRoomsEnabled()){
      try{
        return await startFlyRandomQueue(mode, deck, handlers, partyTargetUid);
      }catch(e){
        console.error('Fly random queue failed', e);
        markFlyRandomQueueFailed();
        setTimeout(()=>removeOwnQueueEntry().catch(()=>{}), 1500);
        emitRandomQueueStatus('error', 'Could not enter Fly random queue. Try again.');
        return false;
      }
    }
    if(!firebaseRoomTransportAllowed()){
      warnBlockedRtdbRoomFallback('matchmaking/start');
      emitRandomQueueStatus('error', 'Fly authority is required while RTDB is disabled.');
      return false;
    }

    const opponent = await findRandomQueueOpponent(u.uid, mode, partyTargetUid);
    if(opponent && randomQueueState.active){
      emitRandomQueueStatus('joining', 'Opponent found. Joining match...');
      const joined = await joinQueuedRoom(opponent, deck, mode);
      if(joined) return true;
      emitRandomQueueStatus('searching', 'That match filled first. Opening a new queue slot...');
    }

    if(!randomQueueState.active) return false;
    const created = await createQueuedRoom(deck, mode);
    randomQueueState.roomCode = created.code;
    randomQueueState.role = 'host';
    await FO.set(FO.ref(FO.rtdb, `matchmaking/${u.uid}`), {
      uid:u.uid,
      mode,
      status:'waiting',
      queueKey:queueKeyFor(mode, 'waiting', partyTargetUid ? u.uid : ''),
      role:'host',
      roomCode:created.code,
      name:pName(created.prof),
      photoURL:pPhoto(created.prof),
      elo:Number(created.prof.challengerElo || 600) || 600,
      deckName:deck.selectedDeckName,
      partyTargetUid:partyTargetUid || '',
      createdAt:FO.serverTimestamp(),
      updatedAt:FO.serverTimestamp()
    });
    await FO.onDisconnect(FO.ref(FO.rtdb, `matchmaking/${u.uid}`)).remove().catch(()=>{});
    watchRoom(created.code, {silent:true});
    startConnectionHeartbeat(created.code, u.uid);
    watchForLowerUidQueueHost(deck, mode, partyTargetUid);
    emitRandomQueueStatus('waiting', partyTargetUid ? 'Waiting for your party member...' : 'Waiting for a random player...');
    return true;
  }
  function startChallengerRandomQueue(deckChoice, handlers={}){
    return startRandomQueue('ranked', deckChoice, handlers);
  }
  function startFreePlayRandomQueue(deckChoice, handlers={}){
    return startRandomQueue('freeplay', deckChoice, handlers);
  }

  async function cancelChallengerRandomQueue(opts={}){
    clearRandomQueueWatcher();
    const code = randomQueueState.roomCode;
    const wasActive = randomQueueState.active;
    randomQueueState.active = false;
    randomQueueState.handlers = null;
    await removeOwnQueueEntry();
    if(wasActive && code && activeRoom === code && !(gameState()?._onlineRoomCode)){
      await leaveRoom(false).catch(()=>{});
    }else if(!opts.keepScreen){
      clearRoomWatchers();
    }
    randomQueueState = { active:false, roomCode:null, role:null, started:false, handlers:null };
    randomQueueSwitching = false;
    clearDisconnectEndTimer();
    if(!opts.silent) emitRandomQueueStatus('cancelled', 'Queue cancelled.');
  }

  if(!window.startFreePlayMatchmaking) window.startFreePlayMatchmaking = function(){ return openRoomMenu('freeplay'); };
  window.fateOpenRoomMenu = openRoomMenu;
  window.fateOpenFreePlayRoomMenu = function(){ return openRoomMenu('freeplay'); };
  window.fateOpenRankedRoomMenu = function(){ return openRoomMenu('ranked'); };
  window.fateStartChallengerRandomQueue = startChallengerRandomQueue;
  window.fateStartFreePlayRandomQueue = startFreePlayRandomQueue;
  window.fateCancelChallengerRandomQueue = cancelChallengerRandomQueue;
  window.fateCreateRoom = createRoom;
  window.fateJoinRoomFromInput = joinFromInput;
  window.fateJoinRoom = joinRoom;
  window.fateResumeOnlineRoom = function(code){
    return joinRoom(code, {quiet:true, allowStarted:true, silent:false, resume:true});
  };
  window.fateDiscoverMyFlyRooms = discoverMyFlyRooms;
  window.fateRecoverMyFlyRoom = recoverMyFlyRoom;
  window.fateHostStartRoom = hostStartRoom;
  window.fateSetRoomDeckChoice = setRoomDeckChoice;
  window.fateOpenRoomDeckPicker = openOnlineDeckPicker;
  window.fateChooseRoomDeck = chooseRoomDeck;
  window.fateSendRoomChat = sendRoomChat;
  window.fateMarkLobbyChatRead = markLobbyChatRead;
  window.fateSendRoomAction = sendAction;
  window.fatePublishOnlineMatchPreload = publishOnlineMatchPreload;
  window.fateWaitForOnlineMatchPreload = waitForOnlineMatchPreload;
  window.fateSetWebSocketAuthorityUrl = function(url){
    const value = String(url || '').trim();
    try{
      if(value) localStorage.setItem('fateWsAuthorityUrl', value);
      else localStorage.removeItem('fateWsAuthorityUrl');
      if(value) localStorage.setItem('fateWsAuthorityEnabled', '1');
      else localStorage.removeItem('fateWsAuthorityEnabled');
    }catch(e){}
    closeAuthoritySocket();
    if(window.toast) toast(value ? 'WebSocket authority set.' : 'WebSocket authority disabled.');
    return value;
  };
  window.fateEnableFlyAuthority = function(url, opts){
    const value = window.fateSetWebSocketAuthorityUrl(url || localStorage.getItem('fateWsAuthorityUrl') || window.FATE_WS_AUTHORITY_URL || '');
    try{
      localStorage.setItem('fateWsAuthorityEnabled', '1');
      localStorage.setItem('fateFlyActionReplay', '1');
      if(opts && opts.rooms === false) localStorage.removeItem('fateFlyRoomsEnabled');
      else localStorage.setItem('fateFlyRoomsEnabled', '1');
      if(opts && opts.authorityOnly === false) localStorage.removeItem('fateFlyAuthorityOnly');
      else localStorage.setItem('fateFlyAuthorityOnly', '1');
      if(opts && opts.rtdbDisabled === false) localStorage.removeItem('fateRtdbDisabled');
      else localStorage.setItem('fateRtdbDisabled', '1');
      if(opts && opts.apiUrl) localStorage.setItem('fateFlyApiUrl', String(opts.apiUrl).trim());
      else localStorage.removeItem('fateFlyApiUrl');
    }catch(e){}
    return window.fateGetWebSocketAuthorityStatus();
  };
  window.fateEnableLocalFlyAuthorityForTesting = function(opts){
    opts = opts || {};
    const url = String(opts.url || localStorage.getItem('fateWsAuthorityUrl') || window.FATE_WS_AUTHORITY_URL || 'ws://127.0.0.1:8787').trim();
    const apiUrl = String(opts.apiUrl || url.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:')).replace(/\/+$/, '');
    return window.fateEnableFlyAuthority(url, {
      apiUrl,
      rtdbDisabled:opts.rtdbDisabled !== false,
      authorityOnly:opts.authorityOnly !== false,
      rooms:opts.rooms !== false
    });
  };
  window.fateApplyFlyAuthorityTestParams = function(){
    let params = null;
    try{ params = new URLSearchParams(window.location.search || ''); }catch(e){ return window.fateGetWebSocketAuthorityStatus(); }
    const shouldEnable = params.has('flyTest')
      || params.get('fateFlyTest') === '1'
      || params.get('fateAuthority') === 'local'
      || params.get('fateAuthority') === 'fly';
    if(!shouldEnable) return window.fateGetWebSocketAuthorityStatus();
    const url = params.get('flyWs')
      || params.get('fateWsAuthorityUrl')
      || params.get('wsAuthority')
      || window.FATE_WS_AUTHORITY_URL
      || 'ws://127.0.0.1:8787';
    const apiUrl = params.get('flyApi')
      || params.get('fateFlyApiUrl')
      || params.get('authorityApi')
      || '';
    const status = window.fateEnableLocalFlyAuthorityForTesting({
      url,
      apiUrl,
      rtdbDisabled:params.get('rtdbDisabled') !== '0',
      authorityOnly:params.get('authorityOnly') !== '0',
      rooms:params.get('flyRooms') !== '0'
    });
    console.info('[FateOnline] Fly authority test mode enabled from URL params', status);
    return status;
  };
  window.fateDisableFlyAuthority = function(){
    try{
      localStorage.removeItem('fateFlyActionReplay');
      localStorage.removeItem('fateFlyRoomsEnabled');
      localStorage.removeItem('fateFlyAuthorityOnly');
      localStorage.removeItem('fateRtdbDisabled');
      localStorage.removeItem('fateSkipAuthorityRtdbPersist');
      localStorage.removeItem('fateFlyApiUrl');
      localStorage.removeItem('fateWsAuthorityUrl');
      localStorage.removeItem('fateWsAuthorityEnabled');
    }catch(e){}
    closeAuthoritySocket();
    return window.fateGetWebSocketAuthorityStatus();
  };
  function countCanonicalBoardCards(g){
    let count = 0;
    const board = Array.isArray(g?.board) ? g.board : [];
    board.forEach(zone=>{
      if(!Array.isArray(zone)) return;
      zone.forEach(row=>{
        if(!Array.isArray(row)) return;
        row.forEach(card=>{ if(card) count += 1; });
      });
    });
    return count;
  }
  function onlinePendingInteractionKind(g){
    if(!g) return '';
    if(g.pendingInteraction && typeof g.pendingInteraction === 'object') return String(g.pendingInteraction.kind || g.pendingInteraction.bucket || '');
    if(g._serverPendingReaction) return 'reaction';
    if(g._serverPendingModalAction) return 'modalAction';
    if(g._serverPendingZonePick) return 'zonePick';
    if(g._serverPendingMove) return 'move';
    if(g._serverPendingCardPick) return 'cardPick';
    if(g._consolidating) return 'consolidation';
    if(g._boardTargeting) return 'boardTarget';
    return '';
  }
  function finiteAuthorityNumber(value){
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  function renderedAuthorityBoardReport(){
    const info = {
      count:0,
      source:'none',
      rendererAvailable:false,
      rendererOwnsBoard:false,
      rendererCards:null,
      rendererExpectedCards:null,
      renderSnapshotBoardCount:null,
      domBoardCount:null,
      lastRenderDirtyMask:null,
      lastRenderDirtySource:''
    };
    function useCount(source, value){
      if(info.source !== 'none') return;
      if(value === null) return;
      info.count = value;
      info.source = source;
    }
    if(typeof window.fateMatchRendererV2Report === 'function'){
      try{
        const report = window.fateMatchRendererV2Report();
        info.rendererAvailable = !!report?.available;
        info.rendererOwnsBoard = !!report?.ownsBoard;
        info.rendererCards = finiteAuthorityNumber(report?.cards);
        info.rendererExpectedCards = finiteAuthorityNumber(report?.expectedCards);
        info.lastRenderDirtyMask = finiteAuthorityNumber(report?.lastDirtyMask);
        info.lastRenderDirtySource = String(report?.lastDirtySource || report?.source || '');
        useCount('renderer-cards', info.rendererCards);
        useCount('renderer-expectedCards', info.rendererExpectedCards);
      }catch(e){}
    }
    if(typeof window.fateBuildRenderSnapshot === 'function'){
      try{
        const snapshot = window.fateBuildRenderSnapshot();
        info.renderSnapshotBoardCount = finiteAuthorityNumber(snapshot?.counts?.boardCards);
        useCount('render-snapshot', info.renderSnapshotBoardCount);
      }catch(e){}
    }
    try{
      info.domBoardCount = document.querySelectorAll('#board .cell.has-card, #board .bc').length;
      useCount('dom-board', info.domBoardCount);
    }catch(e){}
    return info;
  }
  window.fateAuthorityRenderReport = function(){
    const g = gameState();
    const versionText = (function(){
      try{ return document.getElementById('game-version')?.textContent || ''; }catch(e){ return ''; }
    })();
    const room = String(g?._onlineRoomCode || activeRoom || authorityRoomCode || '').trim().toUpperCase();
    const canonicalBoardCount = countCanonicalBoardCards(g);
    const rendered = renderedAuthorityBoardReport();
    const hasRenderedBoardCount = rendered.source !== 'none';
    const renderedBoardMatchesCanonical = hasRenderedBoardCount && rendered.count === canonicalBoardCount;
    let renderMismatchReason = '';
    if(!hasRenderedBoardCount) renderMismatchReason = 'no rendered board count available';
    else if(!renderedBoardMatchesCanonical) renderMismatchReason = 'canonical board count ' + canonicalBoardCount + ' != ' + rendered.source + ' ' + rendered.count;
    return {
      build:window.FATE_BUILD || window.FATE_BUILD_ID || versionText || '',
      room,
      seq:Math.max(Number(lastAppliedActionSeq || 0) || 0, Number(lastActionSeq || 0) || 0, Number(g?._onlineAppliedActionSeq || 0) || 0, Number(g?._onlineActionSeq || 0) || 0),
      stateHash:lastAuthorityStateHash || '',
      canonicalBoardCount,
      renderedBoardCount:rendered.count,
      renderedBoardSource:rendered.source,
      renderedBoardMatchesCanonical,
      renderMismatchReason,
      rendererAvailable:rendered.rendererAvailable,
      rendererOwnsBoard:rendered.rendererOwnsBoard,
      rendererCards:rendered.rendererCards,
      rendererExpectedCards:rendered.rendererExpectedCards,
      renderSnapshotBoardCount:rendered.renderSnapshotBoardCount,
      domBoardCount:rendered.domBoardCount,
      lastRenderDirtyMask:rendered.lastRenderDirtyMask,
      lastRenderDirtySource:rendered.lastRenderDirtySource,
      currentPlayer:Number.isInteger(Number(g?.currentPlayer)) ? Number(g.currentPlayer) : null,
      phase:String(g?.phase || ''),
      pendingInteractionKind:onlinePendingInteractionKind(g),
      pendingInteractionPlayerIndex:Number.isInteger(Number(g?.pendingInteraction?.playerIndex)) ? Number(g.pendingInteraction.playerIndex) : null,
      pendingInteractionPromptId:String(g?.pendingInteraction?.promptId || ''),
      localPlayerIndex:Number.isInteger(Number(g?._onlinePlayerIndex)) ? Number(g._onlinePlayerIndex) : null
    };
  };
  window.fateGetWebSocketAuthorityStatus = function(){
    return {
      url:configuredAuthorityUrl(),
      apiUrl:authorityHttpBaseUrl(),
      reducerMode:authorityReducerMode || '',
      gameplayAuthority:authorityGameplayMode || (clientResolvedGameplayEnabled() ? 'client-resolved' : ''),
      clientResolvedGameplay:clientResolvedGameplayEnabled(),
      rtdbDisabled:rtdbDisabledMode(),
      flyActionReplay:flyActionReplayEnabled(),
      flyRooms:flyRoomsEnabled(),
      activeRoomUsesFly:roomUsesFly(activeRoom || lastLobbyRoom || ''),
      authorityOnly:authorityOnlyMode(),
      firebaseActionFallbackAllowed:firebaseActionFallbackAllowed(),
      firebaseRoomTransportAllowed:firebaseRoomTransportAllowed(),
      strictCompactPayloads:isStrictCompactAuthorityAction('HAND_ACTION'),
      roomCode:authorityRoomCode,
      joined:authorityJoined,
      readyState:authorityWs ? authorityWs.readyState : -1,
      inflight:authorityInflight.size,
      retryMaxAttempts:authorityRetryMaxAttempts(),
      retryAttempts:authorityRetryAttempts,
      retrySuccesses:authorityRetrySuccesses,
      retryFailures:authorityRetryFailures,
      lastRetryReason:authorityLastRetryReason,
      lastRetryClientActionId:authorityLastRetryClientActionId,
      catchupAttempts:authorityCatchupAttempts,
      catchupSuccesses:authorityCatchupSuccesses,
      catchupFailures:authorityCatchupFailures,
      lastCatchupSeq:authorityLastCatchupSeq,
      lastCatchupReason:authorityLastCatchupReason,
      rejectedResyncAttempts:authorityRejectedResyncAttempts,
      rejectedResyncSuccesses:authorityRejectedResyncSuccesses,
      rejectedResyncFailures:authorityRejectedResyncFailures,
      lastRejectedResyncReason:authorityLastRejectedResyncReason
    };
  };
  window.fateApplyFlyAuthorityTestParams();
  window.fateOnlineStateReport = function(){
    const g = gameState();
    const state = captureOnlineCanonicalState(g);
    const board = [];
    (g?.board || []).forEach(function(zone, z){
      (zone || []).forEach(function(row, r){
        (row || []).forEach(function(card, c){
          if(card) board.push({z,r,c,id:String(card.id || ''),iid:String(card.iid || ''),owner:card.owner,name:card.name || '',fate:card.currentFate ?? card.fate});
        });
      });
    });
    return {
      room:g?._onlineRoomCode || null,
      localPlayer:g?._onlinePlayerIndex ?? null,
      currentPlayer:g?.currentPlayer ?? null,
      turn:g?.turn ?? null,
      actionSeq:g?._onlineActionSeq || lastActionSeq || 0,
      appliedSeq:g?._onlineAppliedActionSeq || lastAppliedActionSeq || 0,
      hash:onlineCanonicalStateHash(state),
      board
    };
  };
  window.fateOnlineDiagnosticsReport = function(){
    let stateReport = null;
    let renderReport = null;
    let authorityStatus = null;
    try{ stateReport = window.fateOnlineStateReport ? window.fateOnlineStateReport() : null; }catch(e){}
    try{ renderReport = window.fateAuthorityRenderReport ? window.fateAuthorityRenderReport() : null; }catch(e){}
    try{ authorityStatus = window.fateGetWebSocketAuthorityStatus ? window.fateGetWebSocketAuthorityStatus() : null; }catch(e){}
    return Object.assign({
      generatedAt:Date.now(),
      room:String(gameState()?._onlineRoomCode || activeRoom || authorityRoomCode || '').trim().toUpperCase(),
      authorityStatus,
      render:renderReport,
      timeline:onlineDiagnosticsTimeline.slice(-180)
    }, stateReport || {});
  };
  window.fateSubmitOnlineDiagnostics = async function(){
    const report = window.fateOnlineDiagnosticsReport();
    const code = String(report.room || gameState()?._onlineRoomCode || activeRoom || authorityRoomCode || '').trim().toUpperCase();
    const u = getUser();
    if(!code) throw new Error('No online room is active');
    if(!u) throw new Error('Sign in before submitting diagnostics');
    return await flyApiRequest(`/api/rooms/${encodeURIComponent(code)}/diagnostics/client`, {
      method:'POST',
      body:{
        uid:u.uid,
        report
      }
    });
  };
  window.fateLeaveOnlineRoom = leaveRoom;
  installOnlineGameplayHooks();

  (function installRenderThrottleReloadResume(){
    let attempts = 0;
    function tryResume(){
      attempts += 1;
      let payload = null;
      try{ payload = JSON.parse(sessionStorage.getItem('fateRenderThrottleReload') || 'null'); }catch(e){}
      const code = String(payload?.roomCode || sessionStorage.getItem('fateLastOnlineRoomBeforeRenderThrottleReload') || '').trim().toUpperCase();
      if(!/^[A-Z0-9]{6}$/.test(code)) return;
      if(!getUser()){
        if(attempts < 40) setTimeout(tryResume, 250);
        return;
      }
      sessionStorage.removeItem('fateRenderThrottleReload');
      sessionStorage.removeItem('fateLastOnlineRoomBeforeRenderThrottleReload');
      joinRoom(code, {quiet:true, allowStarted:true, silent:false, resume:true}).then(ok=>{
        if(ok && window.toast) toast('Recovered after browser render throttle. Rejoining room ' + code + '.');
      }).catch(e=>{
        console.warn('Render-throttle room resume failed', e);
      });
    }
    setTimeout(tryResume, 350);
  })();

  (function installFlyRoomStartupRecovery(){
    let attempts = 0;
    let done = false;
    function tryRecover(){
      if(done || activeRoom || gameState()?._onlineRoomCode) return;
      attempts += 1;
      if(!flyRoomsEnabled()) return;
      if(!getUser()){
        if(attempts < 40) setTimeout(tryRecover, 250);
        return;
      }
      done = true;
      recoverMyFlyRoom({silent:true}).catch(e=>{
        console.warn('Fly room startup recovery failed', e);
      });
    }
    setTimeout(tryRecover, 900);
  })();

  setTimeout(()=>{
    installOnlineGameplayHooks();
    if(typeof window.confirmEndGame === 'function' && !window.confirmEndGame._onlineWrapped){
      const orig=window.confirmEndGame;
      const wrapped=function(){
        const g = gameState();
        if(g?._onlineRoomCode){
          g._onlineLocalModalBypass = true;
          try{
            showModal('Leave Online Match?',
              'Leave this online match? This will count as a forfeit for your opponent.',
              [
                {label:'Keep Playing', action:closeModal},
                {label:'Forfeit & Quit', danger:true, action:async ()=>{
                  const bg = captureOnlineGameBackground();
                  const rewardData = collectOnlineForfeitRewardData('defeat', g);
                  closeModal();
                  await leaveRoom(true).catch(()=>{});
                  if(typeof cleanupGame === 'function') cleanupGame();
                  showOnlineForfeitResult('defeat', bg, {reason:'You left the match.', rewardData});
                }}
              ]);
          }finally{
            g._onlineLocalModalBypass = false;
          }
          return;
        }
        return orig.apply(this, arguments);
      };
      wrapped._onlineWrapped=true;
      window.confirmEndGame=wrapped;
    }
  },0);
})();
