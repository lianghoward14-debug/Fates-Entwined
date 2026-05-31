// FATES ENTWINED ONLINE ROOMS V1.3
// RTDB room-code foundation. No render-loop syncing and no full-G snapshot writes.
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
  let lastSyncedRoomChatKey = '';
  let endedRoomCodesHandled = new Set();
  let actionReplayBuffer = new Map();
  let actionReplayDrainScheduled = false;
  const optimisticAppliedActionIds = new Set();
  let onlineStateSyncTimer = null;
  let authorityWs = null;
  let authorityUrl = '';
  let authorityRoomCode = '';
  let authorityJoined = false;
  let authorityJoinPromise = null;
  let authorityRequestCounter = 0;
  const authorityInflight = new Map();
  const authorityPersistPromises = new Map();
  const authorityPersistRetries = new Map();


  function esc(s){ return FO.escapeHtml ? FO.escapeHtml(s) : String(s||'').replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function makeCode(){ const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<6;i++) s += alphabet[Math.floor(Math.random()*alphabet.length)]; return s; }
  function getUser(){ try{return FO.requireUser();}catch(e){ return null; } }
  function pName(p){ return FO.profileName ? FO.profileName(p) : (p?.chosenUsername||p?.displayName||p?.username||p?.baseCode||'Player'); }
  function pPhoto(p){ return FO.profilePhoto ? FO.profilePhoto(p) : (p?.photoURL||p?.profileImg||'blank.png'); }
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
  function cloneOnlinePlain(value){
    if(value == null) return value;
    try{
      return JSON.parse(JSON.stringify(value, function(k, v){
        if(typeof v === 'function') return undefined;
        if(v instanceof Set) return Array.from(v);
        if(typeof Element !== 'undefined' && v instanceof Element) return undefined;
        return v;
      }));
    }catch(e){
      return null;
    }
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
    return {
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
  }
  function onlineCanonicalStateHash(state){
    return onlineStableHash(JSON.stringify(state || null));
  }
  function attachOnlinePostState(payload){
    const state = captureOnlineCanonicalState();
    if(!state) return payload;
    payload.postState = state;
    payload.stateHash = onlineCanonicalStateHash(state);
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
      '_revealedCards','_riveraBuffs','_riveraActiveEffects','_skipImprovisorCheck','_skipReactions','_westCaribNext',
      '_zimbabweUsedThisTurn','_consolidating','_wolfCreekMoving','_expMoving','_berkeleyMoving','_bh01Moving',
      '_landscapeMoving','_busserMoving','_busserMovingCard','_markSelecting','_havanoDeploying','_boardTargeting'
    ].forEach(function(k){
      if(Object.prototype.hasOwnProperty.call(state, k)) g[k] = cloneOnlinePlain(state[k]);
    });
    g._continuousDamageSources = new Set(Array.isArray(state._continuousDamageSources) ? state._continuousDamageSources : []);
    if(Array.isArray(g._linaFreeIids)) g._linaFreeIids = new Set(g._linaFreeIids);
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
    if(localHash === payload.stateHash) return false;
    return applyOnlineCanonicalState(payload.postState, reason || ('post-action mismatch ' + (action?.seq || '')));
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
  function scheduleOptimisticCorrection(reason){
    const g = gameState();
    if(g) g._onlineLagPauseActive = true;
    if(String(reason || '').toUpperCase() === 'CHOOSE_TURN'){
      if(window.toast) toast('Turn choice is still syncing. Stay in the match.');
      console.warn('Online turn-choice sync failed without forcing a reload.');
      return;
    }
    if(window.toast) toast('Network rejected an action. Refreshing match state.');
    console.warn('Online optimistic action correction scheduled:', reason);
    setTimeout(()=>{
      try{ location.reload(); }catch(e){}
    }, 900);
  }
  function isTurnBoundaryOnlineAction(actionOrType){
    const type = typeof actionOrType === 'string'
      ? actionOrType
      : String(actionOrType?.type || '');
    return /^(MATCH_START|CHOOSE_TURN|END_TURN|FORFEIT)$/i.test(type);
  }
  function noteTurnBoundaryAction(action){
    if(!isTurnBoundaryOnlineAction(action)) return;
    lastTurnBoundaryActionSeq = Math.max(lastTurnBoundaryActionSeq, Number(action?.seq || 0) || 0);
  }
  function shouldRunForcedSyncForRoomSeq(roomSeq){
    const seq = Number(roomSeq || 0) || 0;
    if(seq <= 1) return true;
    return seq <= lastTurnBoundaryActionSeq;
  }
  function sendOptimisticAction(type, payload, applyLocal){
    const clientActionId = makeOptimisticActionId(type);
    const outbound = Object.assign({}, payload || {}, { clientActionId });
    let localResult;
    let localApplied = false;
    function sendAfterLocalApply(){
      try{ attachOnlinePostState(outbound); }catch(e){ console.warn('Could not attach online post-state', e); }
      return sendAction(type, outbound).catch(e=>{
        console.error('Online optimistic action send failed', e, type, outbound);
        if(localApplied) scheduleOptimisticCorrection(type);
        else if(window.toast) toast('Action failed');
      });
    }
    function scheduleFollowupStateSync(delayMs){
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
          sourceClientActionId:clientActionId
        };
        try{ attachOnlinePostState(syncPayload); }catch(e){ console.warn('Could not capture delayed online state sync', e); return; }
        sendAction('STATE_SYNC', syncPayload).catch(e=>console.error('Online state sync send failed', e));
      }, delayMs);
    }
    if(typeof applyLocal === 'function'){
      try{
        rememberOptimisticAction(clientActionId);
        localApplied = true;
        localResult = applyLocal();
        if(localResult && typeof localResult.catch === 'function'){
          localResult.catch(e=>console.error('Optimistic local action failed', e, type, outbound));
        }
      }catch(e){
        optimisticAppliedActionIds.delete(clientActionId);
        console.error('Optimistic local action threw', e, type, outbound);
        throw e;
      }
    }
    sendAfterLocalApply();
    scheduleFollowupStateSync(950);
    return localResult;
  }
  function canSendLocalAction(g){
    if(!isOnlineMatchState(g)) return false;
    if(g._onlineApplyingRemoteAction) return false;
    if(g._isSpectator || g._onlineRole === 'spectator' || !Number.isInteger(g._onlinePlayerIndex)){
      if(window.toast) toast('Spectators cannot take game actions.');
      return false;
    }
    if(g._onlineLagPauseActive){
      if(window.toast) toast('Match is syncing. Please wait.');
      return false;
    }
    if(g.currentPlayer !== g._onlinePlayerIndex){
      onlineTurnError();
      return false;
    }
    return true;
  }
  async function withRemoteAction(fn, playerIndex){
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
      if(uid !== expectedUid || playerIndex !== g._coinWinner) continue;
      const choiceId = String(choice.clientActionId || uid + ':' + choice.clientAt || '');
      if(choiceId && appliedTurnChoiceFallbackIds.has(choiceId)) continue;
      if(choiceId) appliedTurnChoiceFallbackIds.add(choiceId);
      withRemoteAction(async ()=>{
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
    if(g && g.phase === 'main' && g.currentPlayer === g._onlinePlayerIndex){
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
    if(!code || !uid || !FO.update) return;
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
      if(code && uid && room?.hostUid === uid && FO.update){
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
      crop: 'object-fit:cover;object-position:center 22%;',
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
    actionReplayQueue = Promise.resolve();
    actionReplayBuffer.clear();
    actionReplayDrainScheduled = false;
    lastReportedActionSeq = -1;
    lastReportedActionAt = 0;
    lastTurnBoundaryActionSeq = 0;
    pendingActionProgressSeq = 0;
    appliedTurnChoiceFallbackIds.clear();
    lastSyncedRoomChatKey = '';
    deckPickerOpenForRoom = null;
    currentDeckChoiceKey = '';
    setLagPause(false);
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
  function syncRoomChatToInGame(room){
    if(!room || typeof window.fateSetOnlineInGameMessages !== 'function') return;
    const chat = room.chat || {};
    const key = Object.keys(chat).sort().slice(-80).map(id=>`${id}:${chat[id]?.createdAt || 0}:${chat[id]?.text || ''}`).join('|');
    if(key === lastSyncedRoomChatKey) return;
    lastSyncedRoomChatKey = key;
    const entries = Object.entries(room.chat || {})
      .map(([id, msg])=>({ id, msg:msg || {} }))
      .sort((a,b)=>(Number(a.msg.createdAt || 0) || 0) - (Number(b.msg.createdAt || 0) || 0))
      .slice(-80);
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
  }
  function selectedDeckName(player){
    if(player?.selectedDeckName) return player.selectedDeckName;
    return 'No deck selected';
  }
  function isConnectedPlayer(player){
    return !!(player && player.connected !== false);
  }
  function hasValidDeck(player){
    return !!(player && Array.isArray(player.deckIds) && player.deckIds.length === 40);
  }
  function normalizeRoomMode(mode){
    const raw = String(mode || 'freeplay').toLowerCase();
    return raw === 'ranked' || raw === 'challenger' ? 'ranked' : 'freeplay';
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
  function emitRandomQueueStatus(status, message, extra={}){
    const detail = { status, message, roomCode:randomQueueState.roomCode || '', role:randomQueueState.role || '', ...extra };
    try{ randomQueueState.handlers?.onStatus?.(detail); }catch(e){}
    window.dispatchEvent(new CustomEvent('fate-random-queue-status', { detail }));
  }
  async function removeOwnQueueEntry(){
    const u = window.FATE_ONLINE?.user;
    if(u && FO.rtdb && FO.remove) await FO.remove(FO.ref(FO.rtdb, `matchmaking/${u.uid}`)).catch(()=>{});
  }
  function clearRandomQueueWatcher(){
    try{ if(randomQueueUnsub) randomQueueUnsub(); }catch(e){}
    randomQueueUnsub = null;
    if(partyQueueWaitTimer) clearInterval(partyQueueWaitTimer);
    partyQueueWaitTimer = null;
  }
  async function setConnectedOnDisconnect(code, uid){
    await FO.onDisconnect(FO.ref(FO.rtdb, `rooms/${code}/players/${uid}`)).update({connected:false, disconnectedAt:FO.serverTimestamp()}).catch(()=>{});
  }
  async function touchRoomUpdatedAt(code, now){
    if(!code || !FO.update || !FO.ref || !FO.rtdb) return false;
    return FO.update(FO.ref(FO.rtdb), {
      [`rooms/${code}/updatedAt`]: now || FO.serverTimestamp()
    }).then(()=>true).catch(e=>{
      console.warn('Room updatedAt touch failed', e);
      return false;
    });
  }
  async function releaseGuestSeatIfHeld(code, uid){
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

  async function createRoom(mode='freeplay'){
    const u = getUser(); if(!u) return;
    mode = normalizeRoomMode(mode);
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
    const snap = await FO.get(FO.ref(FO.rtdb, `rooms/${code}`));
    const room = snap.val();
    if(!room){ if(!quiet && window.toast) toast('Room not found'); return false; }
    if(room.status !== 'lobby'){
      const canResumeStartedRoom = !!opts.allowStarted && (room.hostUid === u.uid || room.guestUid === u.uid);
      if(canResumeStartedRoom){
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

  function watchRoom(code, opts={}){
    activeRoom = code;
    clearRoomWatchers();
    activeRoom = code;
    activeRoomSilent = !!opts.silent;
    if(!activeRoomSilent) closeModal();
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
        if(room.status==='matchup' || room.status==='starting' || room.status==='playing') startRoomGame(room);
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
    const chatUnsub = FO.onValue(FO.ref(FO.rtdb, `rooms/${code}/chat`), s=>{
      const chat = s.val() || {};
      const room = mergeRoomPatch({ chat });
      syncRoomChatToInGame(room);
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
    });
    if(opts.openDeckPicker && !activeRoomSilent) setTimeout(()=>openOnlineDeckPicker(code), 120);
  }

  function maybeAutoStartQueuedRoom(room, players){
    if(!randomQueueState.active || !room || room.roomCode !== randomQueueState.roomCode) return;
    const u = window.FATE_ONLINE?.user;
    if(!u) return;
    if(room.status === 'matchup' || room.status === 'starting' || room.status === 'playing'){
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
    keep.forEach(ensureRoomProfile);
    cleanupRoomProfileSubs(keep);

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
        <div class="online-room-start-row">${guestActive ? startInline : '<div class="online-room-note online-room-wait-note">Waiting for a second player.</div>'}</div>
        <div class="online-room-note">Host starts after both players choose decks. The versus screen then advances by countdown on both clients.</div>
      </div>`;
    if(deckPickerOpenForRoom === current.roomCode) return;
    if(html === lastLobbyHtml && document.getElementById('modal')?.style?.display !== 'none') return;
    lastLobbyHtml = html;
    showModal((isRanked ? 'Ranked Room ' : 'Room ') + esc(current.roomCode), html, actions);
  }

  async function hostStartRoom(code, opts={}){
    const u=getUser(); if(!u) return;
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
      const players = (await FO.get(FO.ref(FO.rtdb, `rooms/${room.roomCode}/players`))).val() || {};
      const startAction = (await FO.get(FO.ref(FO.rtdb, `rooms/${room.roomCode}/actions/000001`))).val() || {};
      const startPayload = startAction.payload || {};
      const localIndex = u?.uid === room.hostUid ? 0 : 1;
      const seed = room.seed || startPayload.seed || `${room.roomCode}_fallback_seed`;
      const song = room.song || startPayload.song || pickSongForSeed(seed);
      const roomMode = normalizeRoomMode(room.mode || startPayload.mode);
      const decks = startPayload.decks || {};
      if(Array.isArray(decks[0]) && decks[0].length === 40) g.p1Deck = [...decks[0]];
      if(Array.isArray(decks[1]) && decks[1].length === 40) g.p2Deck = [...decks[1]];

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
      if(typeof window.setFateCurrentMode === 'function') window.setFateCurrentMode(roomMode === 'ranked' ? 'challenger' : 'free');
      applyOnlineRoomIdentity(room, players);

      if(typeof window.startGame === 'function') window.startGame(false);

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
      g._onlineStartedRoomCode = room.roomCode;
      g._onlineBootstrappingRoomCode = null;
      applyOnlineRoomIdentity(room, players);
      if(typeof window.updatePlayerBanners === 'function') setTimeout(()=>window.updatePlayerBanners(), 80);
      if(localIndex === 0) setTimeout(()=>updateRoomTurn(gameState()?.currentPlayer), 1200);
      reportActionProgress(lastAppliedActionSeq || lastActionSeq || 1, {force:true});
      if(randomQueueState.roomCode === room.roomCode){
        randomQueueState = { active:false, roomCode:null, role:null, started:true, handlers:null };
      }

      if(window.toast) toast(roomMode === 'ranked' ? 'Ranked Challenger match started.' : 'Online Free Play started: matchup/coin bootstrap active.');
      subscribeActions(room.roomCode);
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
    if(type === 'MATCH_START') return;
    const payload = action.payload || {};
    const actionPlayer = onlineActionPlayer(action);
    const localUid = window.FATE_ONLINE?.user?.uid;
    const optimisticActionId = optimisticActionIdFor(action);
    if(action.uid === localUid && optimisticActionId && optimisticAppliedActionIds.has(optimisticActionId)){
      return;
    }
    if(type === 'STATE_SYNC'){
      reconcileOnlinePostState(action, 'authoritative state sync seq ' + (action.seq || '?'));
      return;
    }

    const turnAgnosticAction = type === 'CHOOSE_TURN';
    if(type !== 'FORFEIT'){
      if(actionPlayer === null || actionPlayer === undefined){
        console.warn('Ignoring online action without a room player', action);
        return;
      }
      if(actionPlayer !== payload.playerIndex){
        console.warn('Ignoring online action with mismatched player index', action);
        reconcileOnlinePostState(action, 'player-index mismatch');
        return;
      }
      if(!turnAgnosticAction && g.currentPlayer !== payload.playerIndex){
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

    if(action.uid !== localUid && typeof window.playSfx === 'function') window.playSfx('onlineRemote');

    await withRemoteAction(async ()=>{
      if(type === 'END_TURN'){
        if(typeof window.endTurn === 'function') window.endTurn();
        updateRoomTurn(gameState()?.currentPlayer);
        return;
      }
      if(type === 'CHOOSE_TURN'){
        if(payload.playerIndex !== g._coinWinner){
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
        if(g.currentPlayer !== g._onlinePlayerIndex) g._onlineSilentEndTurnUntil = Date.now() + 700;
        await pending.onChoose(Number.isInteger(zone) ? zone : null);
        g._onlinePendingLandscapeZonePicker = null;
        return;
      }
      if(type === 'FORFEIT'){
        if(action.uid !== localUid){
          if(window.toast) toast('Opponent forfeited');
          showOnlineForfeitResult('victory');
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

  function subscribeActions(code){
    if(actionUnsub) actionUnsub();
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
    const ar = arBase;
    actionUnsub = FO.onValue(ar, snap=>{
      const val=snap.val()||{};
      const nextActions = Object.values(val)
        .filter(a=>{
          const seq = Number(a?.seq || 0) || 0;
          return seq > lastAppliedActionSeq && !actionReplayBuffer.has(seq);
        })
        .sort((a,b)=>(a.seq||0)-(b.seq||0));
      if(!nextActions.length) return;
      nextActions.forEach(bufferAction);
    });
  }

  function configuredAuthorityUrl(){
    try{
      const fromStorage = localStorage.getItem('fateWsAuthorityUrl');
      if(fromStorage) return String(fromStorage).trim();
    }catch(e){}
    return String(window.FATE_WS_AUTHORITY_URL || '').trim();
  }
  function closeAuthoritySocket(){
    authorityJoined = false;
    authorityJoinPromise = null;
    authorityRoomCode = '';
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
      return;
    }
    if(msg.kind === 'accepted' || msg.kind === 'rejected' || msg.kind === 'error'){
      if(msg.kind === 'accepted') handleAuthorityAcceptedMessage(msg);
      const requestId = String(msg.requestId || '');
      const pending = requestId ? authorityInflight.get(requestId) : null;
      if(pending){
        authorityInflight.delete(requestId);
        if(pending.timer) clearTimeout(pending.timer);
        if(msg.kind === 'accepted') pending.resolve(msg);
        else pending.reject(new Error(msg.reason || 'WebSocket authority rejected action'));
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
      authorityJoined = false;
      authorityJoinPromise = null;
      rejectAuthorityInflight('WebSocket authority disconnected');
    };
    authorityWs.onerror = function(){
      rejectAuthorityInflight('WebSocket authority connection failed');
    };
    return authorityWs;
  }
  function waitForAuthorityOpen(ws){
    if(ws.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject)=>{
      const timer = setTimeout(()=>reject(new Error('WebSocket authority connection timed out')), 2500);
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
          currentTurnUid:room.currentTurnUid || '',
          lastActionSeq:room.lastActionSeq || lastActionSeq || 0,
          playerOrder:{0:room.hostUid || '', 1:room.guestUid || ''}
        }
      }));
      await new Promise((resolve, reject)=>{
        const started = Date.now();
        const timer = setInterval(()=>{
          if(authorityJoined){ clearInterval(timer); resolve(); }
          else if(Date.now() - started > 2500){ clearInterval(timer); reject(new Error('WebSocket authority join timed out')); }
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
  async function sendActionViaAuthority(type, payload){
    const code = gameState()?._onlineRoomCode || activeRoom;
    if(!code) return null;
    const url = configuredAuthorityUrl();
    if(!url) return null;
    await ensureAuthorityJoined(code);
    if(!authorityWs || authorityWs.readyState !== WebSocket.OPEN) throw new Error('WebSocket authority is not connected');
    const requestId = 'act:' + Date.now() + ':' + (++authorityRequestCounter);
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
        reject(new Error('WebSocket authority did not accept action in time'));
      }, 3500);
      authorityInflight.set(requestId, {resolve, reject, timer});
      authorityWs.send(JSON.stringify(outbound));
    });
  }
  async function persistAuthorityAcceptedAction(code, accepted){
    const action = Object.assign({}, accepted.action || {});
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
    if(accepted?.durableWrite) return Promise.resolve(true);
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

  function handleAuthorityAcceptedMessage(accepted){
    const action = accepted && accepted.action;
    const code = String(accepted?.roomCode || gameState()?._onlineRoomCode || activeRoom || '').trim().toUpperCase();
    if(!action || !code) return;
    bufferOnlineAction(action);
    ensureAuthorityAcceptedActionPersisted(code, accepted).catch(()=>{});
  }

  async function sendAction(type, payload={}){
    const code = gameState()?._onlineRoomCode || activeRoom;
    const u = window.FATE_ONLINE?.user;
    if(!code || !u) return;
    if(String(type || '').toUpperCase() === 'CHOOSE_TURN'){
      await sendActionDirectFirebase(code, type, payload, u);
      return;
    }
    try{
      const accepted = await sendActionViaAuthority(type, payload);
      if(accepted){
        await ensureAuthorityAcceptedActionPersisted(code, accepted);
        return;
      }
    }catch(e){
      console.warn('WebSocket authority action path failed; falling back to Firebase transaction.', e);
      if(window.toast) toast('WebSocket authority unavailable - using Firebase sync');
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
    const action = { seq, uid:u.uid, type, payload, createdAt:FO.serverTimestamp() };
    if(payload?.clientActionId) action.clientActionId = String(payload.clientActionId);
    await FO.update(FO.ref(FO.rtdb), { [`rooms/${code}/actions/${String(seq).padStart(6,'0')}`]: action, [`rooms/${code}/updatedAt`]:FO.serverTimestamp() });
  }

  async function findExistingActionByClientId(code, clientActionId){
    if(!code || !clientActionId || !FO.get) return null;
    const snap = await FO.get(FO.ref(FO.rtdb, `rooms/${code}/actions`)).catch(()=>null);
    const actions = snap?.val() || {};
    const found = Object.values(actions).find(a => a && String(a.clientActionId || a.payload?.clientActionId || '') === String(clientActionId));
    return found || null;
  }

  async function sendActionDirectFirebase(code, type, payload, u){
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
        if(g._onlineSilentEndTurnUntil && Date.now() < g._onlineSilentEndTurnUntil && g.currentPlayer !== g._onlinePlayerIndex) {
          return;
        }
        if(!canSendLocalAction(g)) return;
        if(typeof window.deferTurnEndUntilModalComplete === 'function' && window.deferTurnEndUntilModalComplete('online-end-turn')) {
          return false;
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
        if(g._coinWinner !== g._onlinePlayerIndex){
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

    if(typeof window.initiateConsolidate === 'function' && !originals.initiateConsolidate){
      originals.initiateConsolidate = window.initiateConsolidate;
      window.initiateConsolidate = function(){
        const g = gameState();
        if(!isOnlineMatchState(g) || g._onlineApplyingRemoteAction){
          return originals.initiateConsolidate.apply(this, arguments);
        }
        if(!canSendLocalAction(g)) return;
        const args = arguments;
        return sendOptimisticAction('START_CONSOLIDATE', {
          playerIndex:g.currentPlayer,
          turn:g.turn,
          selectedHand:selectedHandSnapshot(g)
        }, ()=>originals.initiateConsolidate.apply(this, args));
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
        if(!canSendLocalAction(g)) return;
        const args = arguments;
        return sendOptimisticAction('CLICK_CELL', {
          playerIndex:g.currentPlayer,
          turn:g.turn,
          z,r,c,
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
          FO.update(FO.ref(FO.rtdb), {
            [`rooms/${code}/status`]:'ended',
            [`rooms/${code}/phase`]:'ended',
            [`rooms/${code}/endedAt`]:FO.serverTimestamp(),
            [`rooms/${code}/updatedAt`]:FO.serverTimestamp()
          }).catch(()=>{});
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
        const localCanChoose = g.currentPlayer === g._onlinePlayerIndex;
        if(!localCanChoose){
          return;
        }
        const wrappedActions = actions.map((action, actionIndex)=>Object.assign({}, action, {
          action:()=>{
            return sendOptimisticAction('MODAL_ACTION', {
              playerIndex:g.currentPlayer,
              turn:g.turn,
              actionIndex
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
        const localCanChoose = g.currentPlayer === g._onlinePlayerIndex;
        if(!localCanChoose) return;
        const wrappedConfirm = (chosen)=>{
          const latest = gameState();
          if(latest?._onlineApplyingRemoteAction) return onConfirm(chosen);
          if(!canSendLocalAction(latest)) return;
          return sendOptimisticAction('PICK_CARDS_VISUAL', {
            playerIndex:latest.currentPlayer,
            turn:latest.turn,
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
        const localCanChoose = g.currentPlayer === g._onlinePlayerIndex;
        if(!localCanChoose) return;
        const wrappedConfirm = (chosen)=>{
          const latest = gameState();
          if(latest?._onlineApplyingRemoteAction) return onConfirm(chosen);
          if(!canSendLocalAction(latest)) return;
          return sendOptimisticAction('PICK_ZONE', {
            playerIndex:latest.currentPlayer,
            turn:latest.turn,
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
        const localCanChoose = g.currentPlayer === g._onlinePlayerIndex;
        if(!localCanChoose) return;
        const wrappedConfirm = (chosen)=>{
          const latest = gameState();
          if(latest?._onlineApplyingRemoteAction) return onConfirm(chosen);
          if(!canSendLocalAction(latest)) return;
          return sendOptimisticAction('PICK_ZONE', {
            playerIndex:latest.currentPlayer,
            turn:latest.turn,
            selectedEntries:(chosen || []).map(boardSelectionPayload)
          }, ()=>onConfirm(chosen));
        };
        return originals.showBoardTargetPicker.call(this, opts, wrappedConfirm);
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
        const localCanChoose = g.currentPlayer === g._onlinePlayerIndex;
        if(!localCanChoose) return;
        const wrappedCallback = (aff)=>{
          const latest = gameState();
          if(latest?._onlineApplyingRemoteAction) return callback(aff);
          if(!canSendLocalAction(latest)) return;
          return sendOptimisticAction('PICK_AFFILIATION', {
            playerIndex:latest.currentPlayer,
            turn:latest.turn,
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
          if(!isOnlineMatchState(latest) || latest._onlineLagPauseActive || latest._isSpectator || latest._onlineRole === 'spectator') {
            if(window.toast) toast(latest?._onlineLagPauseActive ? 'Match is syncing. Please wait.' : 'Spectators cannot take game actions.');
            return;
          }
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
            if(applying && applying.currentPlayer !== applying._onlinePlayerIndex) applying._onlineSilentEndTurnUntil = Date.now() + 700;
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
      'activateVigilantes',
      'activateWolfCreek',
      'activateExpeditionaryMove',
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
        if(!canSendLocalAction(g)) return;
        const pos = onlineFunctionPositionPayload(g, arguments);
        if(!pos) return originals[fnName].apply(this, arguments);
        const args = arguments;
        return sendOptimisticAction('BOARD_ACTION', Object.assign({
          fn:fnName,
          playerIndex:g.currentPlayer,
          turn:g.turn
        }, pos), ()=>originals[fnName].apply(this, args));
      };
    });

    if(typeof window.activateSantaAnnaProsperityFromHand === 'function' && !originals.activateSantaAnnaProsperityFromHand){
      originals.activateSantaAnnaProsperityFromHand = window.activateSantaAnnaProsperityFromHand;
    }
    window.__fateSendSantaAnnaAction = function(selectedHand, target){
      const g = gameState();
      if(!isOnlineMatchState(g) || g._onlineApplyingRemoteAction) return false;
      if(g._isSpectator || g._onlineRole === 'spectator' || !Number.isInteger(g._onlinePlayerIndex)){
        if(window.toast) toast('Spectators cannot take game actions.');
        return false;
      }
      if(g._onlineLagPauseActive){
        if(window.toast) toast('Match is syncing. Please wait.');
        return false;
      }
      return sendOptimisticAction('HAND_ACTION', {
        fn:'activateSantaAnnaProsperityFromHand',
        playerIndex:g._onlinePlayerIndex,
        turn:g.turn,
        selectedHand:selectedHand || selectedHandSnapshot(g, g._onlinePlayerIndex),
        target:target || null
      });
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
        if(!canSendLocalAction(g)) return;
        const args = arguments;
        return sendOptimisticAction('HAND_ACTION', {
          fn:fnName,
          playerIndex:g.currentPlayer,
          turn:g.turn,
          selectedHand:selectedHandSnapshot(g)
        }, ()=>originals[fnName].apply(this, args));
      };
    });
  }

  async function leaveRoom(markForfeit, passive=false){
    const code = gameState()?._onlineRoomCode || activeRoom;
    const u = window.FATE_ONLINE?.user;
    if(code && u && !passive){
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

  async function createQueuedRoom(deckChoice, mode='ranked'){
    const u = getUser(); if(!u) return null;
    mode = normalizeRoomMode(mode);
    const deck = normalizeQueueDeck(deckChoice);
    if(!deck){ if(window.toast) toast('Choose a valid 40-card deck first'); return null; }
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
    mode = normalizeRoomMode(mode);
    const snap = await FO.get(FO.ref(FO.rtdb, 'matchmaking')).catch(()=>null);
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
    const u = window.FATE_ONLINE?.user;
    if(!u || !FO.rtdb || !FO.onValue) return;
    const myUid = String(u.uid);
    mode = normalizeRoomMode(mode);
    randomQueueUnsub = FO.onValue(FO.ref(FO.rtdb, 'matchmaking'), async snap=>{
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
  window.fateHostStartRoom = hostStartRoom;
  window.fateSetRoomDeckChoice = setRoomDeckChoice;
  window.fateOpenRoomDeckPicker = openOnlineDeckPicker;
  window.fateChooseRoomDeck = chooseRoomDeck;
  window.fateSendRoomChat = sendRoomChat;
  window.fateSendRoomAction = sendAction;
  window.fateSetWebSocketAuthorityUrl = function(url){
    const value = String(url || '').trim();
    try{
      if(value) localStorage.setItem('fateWsAuthorityUrl', value);
      else localStorage.removeItem('fateWsAuthorityUrl');
    }catch(e){}
    closeAuthoritySocket();
    if(window.toast) toast(value ? 'WebSocket authority set.' : 'WebSocket authority disabled.');
    return value;
  };
  window.fateGetWebSocketAuthorityStatus = function(){
    return {
      url:configuredAuthorityUrl(),
      roomCode:authorityRoomCode,
      joined:authorityJoined,
      readyState:authorityWs ? authorityWs.readyState : -1,
      inflight:authorityInflight.size
    };
  };
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
