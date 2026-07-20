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
  let unloadEndSignalSent = false;
  let optimisticActionCounter = 0;
  let lastReportedActionSeq = -1;
  let lastReportedActionAt = 0;
  let lastTurnBoundaryActionSeq = 0;
  let pendingActionProgressSeq = 0;
  let appliedTurnChoiceFallbackIds = new Set();
  let appliedPlayerActionFallbackIds = new Set();
  let lastSyncedRoomChatKey = '';
  let endedRoomCodesHandled = new Set();
  let actionReplayBuffer = new Map();
  let actionReplayDrainScheduled = false;
  let pendingFlyResumeEvents = null;
  const flyMatchStartActions = new Map();
  const optimisticAppliedActionIds = new Set();
  let onlineStateSyncTimer = null;
  let onlineHandLimitPromptTimer = null;
  let authorityWs = null;
  let authorityUrl = '';
  let authorityRoomCode = '';
  let authorityJoined = false;
  let authorityJoinPromise = null;
  let authorityRequestCounter = 0;
  let lastAuthorityStateHash = '';
  let lastAuthorityIdToken = '';
  let authorityReducerMode = '';
  let authorityServerTimeOffsetMs = 0;
  let authorityServerTimeSyncedAt = 0;
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
  let clientResolvedLocalCommitStartedAt = 0;
  let onlineLocalActionGate = null;
  let clientResolvedAutoCommitTimer = null;
  let onlineMoreBoardRepairSyncTimer = null;
  let onlineMoreBoardRepairSyncPromise = null;
  let lastMoreBoardRepairSyncHash = '';
  let onlineMoreBoardPreference = {until:0, kind:'', reason:''};
  let onlineMovementBoardPreference = {until:0, reason:''};
  let onlineProtectedBoardPreference = null;
  const onlineIntentionalBoardRemovalKeys = new Map();
  let lastAuthorityBoardSnapshot = {layout:'', identity:'', count:null, stateHash:''};
  let onlineTurnBoundaryAgreementPromise = null;
  let onlineTurnBoundaryAgreementStartedAt = 0;
  let onlinePendingEndTurnAfterAgreementPromise = null;
  const ONLINE_TURN_BOUNDARY_WATCHDOG_MS = 4500;
  let localConsolidationSelection = null;
  let queuedFinalConsolidationClick = null;
  let lastClientResolvedAutoCommitHash = '';
  let lobbyAuthorityPrejoinCode = '';
  let lobbyAuthorityPrejoinAttempts = 0;
  let lobbyAuthorityPrejoinNextAt = 0;
  const authorityInflight = new Map();
  const authorityPersistPromises = new Map();
  const authorityPersistRetries = new Map();
  const AUTHORITY_OPEN_TIMEOUT_MS = 20000;
  const AUTHORITY_HELLO_TIMEOUT_MS = 20000;
  const AUTHORITY_ACTION_TIMEOUT_MS = 6500;


  function esc(s){ return FO.escapeHtml ? FO.escapeHtml(s) : String(s||'').replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function makeCode(){ const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<6;i++) s += alphabet[Math.floor(Math.random()*alphabet.length)]; return s; }
  function getUser(){
    try{return FO.requireUser();}catch(e){}
    try{
      if(typeof FO.getEphemeralMultiplayerGuestUser === 'function') return FO.getEphemeralMultiplayerGuestUser();
    }catch(e){}
    return null;
  }
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
  function syncAuthorityServerClock(serverTime){
    const numeric = Number(serverTime);
    if(!Number.isFinite(numeric) || numeric <= 0) return false;
    authorityServerTimeOffsetMs = numeric - Date.now();
    authorityServerTimeSyncedAt = Date.now();
    try{
      window.__fateAuthorityServerTimeOffsetMs = authorityServerTimeOffsetMs;
      window.__fateAuthorityServerTimeSyncedAt = authorityServerTimeSyncedAt;
    }catch(e){}
    return true;
  }
  function authorityServerNow(){
    return Date.now() + (Number(authorityServerTimeOffsetMs || 0) || 0);
  }
  window.fateAuthorityServerNow = authorityServerNow;
  function compactOnlineCard(card){
    if(!card) return null;
    const out = {};
    Object.keys(card).forEach(function(k){
      const v = card[k];
      if(typeof v === 'function') return;
      if(k === 'effect' || k === 'flavor') return;
      if(k === '_effectActivationInFlight' || k === '_pendingWhenSetActivationInFlight' || k === '_busserGrantPending') return;
      if(k === '_onlineSetResolutionPending' || k === '_onlineSetResolutionInFlight') return;
      if(k === '_effectFlash' || k === '_coordinatorPlacementFlashPlayed') return;
      if(k === '_placementFateReveal') return;
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
  function replaceOnlineArrayContents(target, next){
    const arr = Array.isArray(target) ? target : [];
    const values = Array.isArray(next) ? next : [];
    arr.length = values.length;
    for(let i = 0; i < values.length; i++) arr[i] = values[i];
    return arr;
  }
  function syncOnlineCardListInPlace(target, list){
    return replaceOnlineArrayContents(target, expandOnlineCardList(list));
  }
  function onlineExpectedBoardRows(state, z, nextZone){
    const extraRows = Number(state?.extraRows?.[z] || 0) || 0;
    return Math.max(3, Array.isArray(nextZone) ? nextZone.length : 0, 3 + Math.max(0, extraRows));
  }
  function onlineExpectedBoardCols(state, z, r, nextRow){
    const baseCols = Array.isArray(nextRow) ? nextRow.length : 0;
    const extra = r < 3 ? (state?.extraCells?.[z]?.[r] || null) : null;
    const extraCols = extra ? Math.max(Number(extra.p1 || 0) || 0, Number(extra.p2 || 0) || 0) : 0;
    return Math.max(3, baseCols, 3 + Math.max(0, extraCols));
  }
  function syncOnlineBoardInPlace(target, board, state){
    const next = expandOnlineBoard(board);
    const out = Array.isArray(target) ? target : [];
    const zoneCount = Math.max(3, next.length);
    out.length = zoneCount;
    for(let z = 0; z < zoneCount; z++){
      const nextZone = Array.isArray(next[z]) ? next[z] : [];
      const zone = Array.isArray(out[z]) ? out[z] : [];
      const rowCount = onlineExpectedBoardRows(state, z, nextZone);
      zone.length = rowCount;
      for(let r = 0; r < rowCount; r++){
        const nextRow = Array.isArray(nextZone[r]) ? nextZone[r] : [];
        const row = replaceOnlineArrayContents(zone[r], nextRow);
        const colCount = onlineExpectedBoardCols(state, z, r, nextRow);
        while(row.length < colCount) row.push(null);
        zone[r] = row;
      }
      out[z] = zone;
    }
    return out;
  }
  function ensureOnlineBoardShape(g){
    if(!g) return null;
    g.board = syncOnlineBoardInPlace(g.board, g.board, g);
    return g.board;
  }
  function syncOnlinePlayersInPlace(target, players){
    const source = Array.isArray(players) ? players : [];
    const out = Array.isArray(target) ? target : [];
    out.length = source.length;
    for(let idx = 0; idx < source.length; idx++){
      const p = source[idx] || {};
      const player = out[idx] && typeof out[idx] === 'object' ? out[idx] : {};
      player.name = p?.name || ('Player ' + (idx + 1));
      player.color = p?.color || (idx === 0 ? 'var(--p1)' : 'var(--p2)');
      player.deck = syncOnlineCardListInPlace(player.deck, p?.deck);
      player.hand = syncOnlineCardListInPlace(player.hand, p?.hand);
      player.discard = syncOnlineCardListInPlace(player.discard, p?.discard);
      out[idx] = player;
    }
    while(out.length < 2) out.push({name:'Player '+(out.length+1), deck:[], hand:[], discard:[], color:out.length===0?'var(--p1)':'var(--p2)'});
    return out;
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
      currentPlayer:g.currentPlayer,
      turn:g.turn,
      turnNumber:g.turnNumber,
      maxTurns:g.maxTurns,
      phase:g.phase,
      _turnStartedAt:g._turnStartedAt,
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
      supporterReinforcementSetP:cloneOnlinePlain(g.supporterReinforcementSetP),
      _pendingSelvaSupportBoost:cloneOnlinePlain(g._pendingSelvaSupportBoost),
      _selvaSupportBoosts:cloneOnlinePlain(g._selvaSupportBoosts),
      _supporterEffectsActivatedP:cloneOnlinePlain(g._supporterEffectsActivatedP),
      _snowyVillageUses:cloneOnlinePlain(g._snowyVillageUses),
      _landscapeChangeLocks:cloneOnlinePlain(g._landscapeChangeLocks),
      _balladEffects:cloneOnlinePlain(g._balladEffects),
      _mailDeliveries:cloneOnlinePlain(g._mailDeliveries),
      _blameGameEffects:cloneOnlinePlain(g._blameGameEffects),
      _administrativeBloatEffects:cloneOnlinePlain(g._administrativeBloatEffects),
      _serverRngCounter:Math.max(0, Number(g._serverRngCounter) || 0),
      usMarinesUses:cloneOnlinePlain(g.usMarinesUses),
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
      _serverFreePlacement:cloneOnlinePlain(g._serverFreePlacement),
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
      _markSelecting:cloneOnlinePlain(g._markSelecting),
      _havanoDeploying:cloneOnlinePlain(g._havanoDeploying),
      _boardTargeting:cloneOnlinePlain(g._boardTargeting)
    };
    return onlineFirebaseSafeValue(state);
  }
  function onlineCanonicalStateHash(state){
    return onlineStableHash(JSON.stringify(state || null));
  }
  function renderOnlineAuthoritativeState(reason){
    const g = gameState();
    const player = g?._isSpectator && typeof window.getPerspectivePlayerIndex === 'function'
      ? Number(window.getPerspectivePlayerIndex())
      : (Number.isInteger(Number(g?._onlinePlayerIndex)) ? Number(g._onlinePlayerIndex) : Number(g?.currentPlayer || 0) || 0);
    if(typeof window.renderBoardActionForPlayer === 'function'){
      window.renderBoardActionForPlayer(player, {
        bothHands:true,
        oppHand:true,
        piles:true,
        scores:true,
        effects:true
      });
      return;
    }
    if(window.FateMatchFrameScheduler && typeof window.FateMatchFrameScheduler.request === 'function'){
      window.FateMatchFrameScheduler.request({
        dirty:{board:true, hand:true, oppHand:true, piles:true, scores:true, effects:true},
        reason:'online-authoritative-state',
        adapterSource:'board-action-fast-path:online-authoritative-state:board,hand,opphand,piles,scores,effects'
      });
      return;
    }
    if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function'){
      window.FateMatchRendererAdapter.scheduleRender('board-action-fast-path:online-authoritative-state:board,hand,opphand,piles,scores,effects');
      return;
    }
    if(typeof window.renderGame === 'function') window.renderGame({board:true, hand:true, oppHand:true, piles:true, scores:true, effects:true});
    else if(typeof window.renderBoard === 'function') window.renderBoard();
  }
  function collectOnlineBoardSnapshot(board){
    const map = new Map();
    if(!Array.isArray(board)) return map;
    board.forEach(function(zone, z){
      if(!Array.isArray(zone)) return;
      zone.forEach(function(row, r){
        if(!Array.isArray(row)) return;
        row.forEach(function(card, c){
          if(!card) return;
          const key = card.iid != null ? String(card.iid) : `${card.id || 'card'}:${z}:${r}:${c}`;
          map.set(key, {card, z, r, c});
        });
      });
    });
    return map;
  }
  function collectOnlineFateSnapshot(board){
    const map = new Map();
    if(!Array.isArray(board)) return map;
    board.forEach(function(zone, z){
      if(!Array.isArray(zone)) return;
      zone.forEach(function(row, r){
        if(!Array.isArray(row)) return;
        row.forEach(function(card, c){
          if(!card) return;
          const key = card.iid != null ? String(card.iid) : `${card.id || 'card'}:${z}:${r}:${c}`;
          map.set(key, {
            card,
            id:String(card.id || ''),
            iid:String(card.iid || ''),
            owner:Number(card.owner),
            z,
            r,
            c,
            fate:Math.max(0, Number(card.currentFate ?? card.fate ?? 0) || 0),
            declaredAff:String(card._declaredAff || ''),
            specterFateGains:Math.max(0, Number(card._specterFateGains) || 0),
            wintertideTriggerCount:Math.max(0, Number(card._wintertideTriggerCount) || 0)
          });
        });
      });
    });
    return map;
  }
  function onlineFateSnapshotEntryForRef(snapshot, ref){
    if(!(snapshot instanceof Map) || !ref || typeof ref !== 'object') return null;
    const nested = ref.card && typeof ref.card === 'object' ? ref.card : ref;
    const iid = String(ref.iid || ref.cardIid || nested.iid || '');
    if(iid && snapshot.has(iid)) return snapshot.get(iid);
    const z = Number(ref.z), r = Number(ref.r), c = Number(ref.c);
    if(Number.isInteger(z) && Number.isInteger(r) && Number.isInteger(c)){
      let found = null;
      snapshot.forEach(function(entry){
        if(!found && entry.z === z && entry.r === r && entry.c === c) found = entry;
      });
      if(found) return found;
    }
    return null;
  }
  function onlineTargetEffectSourceId(action, beforeFateSnapshot){
    const payload = action?.payload || {};
    const refs = [payload.source, payload.pendingSource, payload.effectCinematic, payload.card, payload.selectedHand];
    for(const ref of refs){
      if(!ref || typeof ref !== 'object') continue;
      const nested = ref.card && typeof ref.card === 'object' ? ref.card : ref;
      const id = String(nested.id || nested.cardId || ref.id || ref.cardId || '');
      if(id) return id;
      const prior = onlineFateSnapshotEntryForRef(beforeFateSnapshot, ref);
      if(prior && prior.id) return prior.id;
    }
    const description = [
      payload.sourceName,
      payload.fn,
      payload.effectName,
      payload.ability,
      payload.pendingKind
    ].filter(Boolean).join(' ');
    if(/\b17th British Regiment\b|Liberators of Rwanda/i.test(description)) return '05';
    if(/\bIsaac Perez\b|Scientific Inquiry/i.test(description)) return '22';
    if(/\bOathbound\b|Hemorrhaging Wound/i.test(description)) return '31';
    return '';
  }
  const shownOnlineTargetEffectFlashKeys = new Set();
  function rememberOnlineEffectFlashKey(key){
    if(shownOnlineTargetEffectFlashKeys.has(key)) return false;
    shownOnlineTargetEffectFlashKeys.add(key);
    if(shownOnlineTargetEffectFlashKeys.size > 512){
      const oldest = shownOnlineTargetEffectFlashKeys.values().next().value;
      if(oldest) shownOnlineTargetEffectFlashKeys.delete(oldest);
    }
    return true;
  }
  function scheduleOnlineClientCardFlash(card, kind, label, key){
    if(!card || !kind || typeof window.flashCardEffect !== 'function' || !rememberOnlineEffectFlashKey(key)) return false;
    return window.flashCardEffect(card, kind, {
      label:String(label || kind.replace(/[_-]+/g, ' ')),
      soundKey:'online-client:' + key
    });
  }
  function maybeFlashOnlineTargetEffectDeltas(action, beforeFateSnapshot, reason){
    if(!(beforeFateSnapshot instanceof Map) || typeof window.flashCardEffect !== 'function') return false;
    const sourceId = onlineTargetEffectSourceId(action, beforeFateSnapshot);
    const kind = sourceId === '05'
      ? 'british_union_jack'
      : (sourceId === '22' ? 'isaac_beaker' : (sourceId === '31' ? 'oathbound_crescent' : ''));
    if(!kind) return false;
    const current = collectOnlineFateSnapshot(gameState()?.board);
    const seq = String(action?.seq || action?.payload?.clientActionId || action?.clientActionId || 'pending');
    let flashed = false;
    current.forEach(function(after, key){
      const before = beforeFateSnapshot.get(key);
      if(!before || !after.card) return;
      const delta = after.fate - before.fate;
      const affected = kind === 'isaac_beaker' || kind === 'british_union_jack' ? delta > 0 : delta < 0;
      if(!affected) return;
      const flashKey = [seq, kind, key].join(':');
      flashed = scheduleOnlineClientCardFlash(
        after.card,
        kind,
        kind === 'british_union_jack' ? 'Liberators of Rwanda' : (kind === 'isaac_beaker' ? 'scientific inquiry' : 'oathbound blade'),
        flashKey
      ) || flashed;
    });
    if(flashed && typeof recordOnlineDiagnostic === 'function'){
      recordOnlineDiagnostic('online-target-effect-flash-reconstructed', {
        reason:String(reason || ''),
        sourceId,
        kind,
        actionType:onlineEffectiveActionType(action)
      });
    }
    return flashed;
  }
  function onlineZoneHasActiveFriendlyRozsi(card, z){
    const g = gameState();
    const zone = g?.board?.[z];
    if(!card || !Array.isArray(zone)) return false;
    return zone.some(function(row, r){
      return Array.isArray(row) && row.some(function(cell, c){
        if(!cell || String(cell.id || '') !== '34' || Number(cell.owner) !== Number(card.owner) || cell.faceDown) return false;
        if(cell._lydiaSuppressed || cell._effectNegatedByReaction) return false;
        if(typeof isSupporterAuraSuppressed === 'function' && isSupporterAuraSuppressed(cell)) return false;
        if(typeof isCoordinatorSuppressedAt === 'function' && isCoordinatorSuppressedAt(z, r, c)) return false;
        return true;
      });
    });
  }
  function maybeFlashOnlineAutomaticEffectDeltas(action, beforeFateSnapshot, reason){
    if(!(beforeFateSnapshot instanceof Map) || typeof window.flashCardEffect !== 'function') return false;
    const current = collectOnlineFateSnapshot(gameState()?.board);
    const actionType = onlineEffectiveActionType(action);
    const seq = String(action?.seq || action?.payload?.clientActionId || action?.clientActionId || 'pending');
    const currentPlayer = Number(gameState()?.currentPlayer);
    let flashed = false;
    current.forEach(function(after, key){
      const before = beforeFateSnapshot.get(key);
      if(!before || !after.card) return;
      const moved = before.z !== after.z || before.r !== after.r || before.c !== after.c;
      let kind = '';
      let label = '';
      if(after.id === '77' && after.declaredAff && after.declaredAff !== before.declaredAff) {
        const targets = typeof window.getCoordinatorPlacementFlashTargets === 'function'
          ? window.getCoordinatorPlacementFlashTargets(after.card, after.z, after.r, after.c)
          : [];
        targets.forEach(function(target, targetIndex){
          const targetKey = String(target?.iid || target?.id || targetIndex);
          flashed = scheduleOnlineClientCardFlash(
            target,
            'coord_heyward_compass',
            'declared affiliation',
            [seq, 'coord_heyward_compass', key, targetKey].join(':')
          ) || flashed;
        });
      }
      if(moved){
        kind = onlineZoneHasActiveFriendlyRozsi(after.card, after.z) ? 'rozsi_dance' : 'movement_boot';
        label = kind === 'rozsi_dance' ? 'Hungarian Dance' : 'effect movement';
      } else if(after.id === '95' && after.specterFateGains > before.specterFateGains) {
        kind = 'specter_ghost';
        label = 'Thousand Year Sorrow';
      } else if(after.id === '100' && after.wintertideTriggerCount > before.wintertideTriggerCount) {
        kind = 'wintertide';
        label = 'Wintertide';
      } else if(
        after.id === '46'
        && actionType === 'END_TURN'
        && after.owner === currentPlayer
        && after.fate > before.fate
      ) {
        kind = 'phil_crown';
        label = 'Monarchist Manifesto';
      }
      if(!kind) return;
      flashed = scheduleOnlineClientCardFlash(after.card, kind, label, [seq, kind, key].join(':')) || flashed;
    });
    if(flashed && typeof recordOnlineDiagnostic === 'function'){
      recordOnlineDiagnostic('online-automatic-effect-flash-reconstructed', {
        reason:String(reason || ''),
        actionType
      });
    }
    return flashed;
  }
  function onlineBoardCardKey(card, z, r, c){
    if(!card) return '';
    const iid = card.iid != null && card.iid !== '' ? String(card.iid) : '';
    if(iid) return 'iid:' + iid;
    return ['slot', card.id || 'card', card.name || '', card.owner ?? '', z, r, c].join(':');
  }
  function onlineBoardCardEntries(board){
    const entries = [];
    if(!Array.isArray(board)) return entries;
    board.forEach(function(zone, z){
      if(!Array.isArray(zone)) return;
      zone.forEach(function(row, r){
        if(!Array.isArray(row)) return;
        row.forEach(function(card, c){
          if(!card) return;
          entries.push({key:onlineBoardCardKey(card, z, r, c), card, z, r, c});
        });
      });
    });
    return entries;
  }
  function pruneOnlineIntentionalBoardRemovals(){
    const now = Date.now();
    onlineIntentionalBoardRemovalKeys.forEach(function(record, key){
      if(Number(record?.until || record || 0) <= now) onlineIntentionalBoardRemovalKeys.delete(key);
    });
  }
  function rememberOnlineIntentionalBoardRemovals(beforeBoard, afterBoard, reason){
    const before = onlineBoardCardEntries(beforeBoard);
    const afterKeys = new Set(onlineBoardCardEntries(afterBoard).map(entry=>entry.key));
    const removed = before.filter(entry=>entry.key && !afterKeys.has(entry.key));
    if(!removed.length) return false;
    pruneOnlineIntentionalBoardRemovals();
    const until = Date.now() + 120000;
    const state = gameState();
    removed.forEach(function(entry){
      let destination = null;
      (state?.players || []).some(function(player, playerIndex){
        return ['hand','deck','discard'].some(function(pile){
          const card = (player?.[pile] || []).find(candidate=>onlineBoardCardKey(candidate, -1, -1, -1) === entry.key);
          if(!card) return false;
          destination = {playerIndex, pile, card:cloneOnlinePlain(card)};
          return true;
        });
      });
      onlineIntentionalBoardRemovalKeys.set(entry.key, {until, destination});
    });
    clearOnlineMoreBoardPreference('intentional-board-removal');
    recordOnlineDiagnostic('online-intentional-board-removals-remembered', {
      reason:String(reason || ''),
      removedKeys:removed.map(entry=>entry.key)
    });
    return true;
  }
  function isOnlineIntentionalBoardRemovalEntry(entry){
    if(!entry || !entry.key) return false;
    pruneOnlineIntentionalBoardRemovals();
    return onlineIntentionalBoardRemovalKeys.has(entry.key);
  }
  function applyOnlineIntentionalBoardRemovals(incomingState, localBoard, reason){
    if(!incomingState) return incomingState;
    pruneOnlineIntentionalBoardRemovals();
    if(!onlineIntentionalBoardRemovalKeys.size) return incomingState;
    const localKeys = new Set(onlineBoardCardEntries(localBoard).map(entry=>entry.key));
    let repaired = null;
    onlineBoardCardEntries(incomingState.board).forEach(function(entry){
      const record = onlineIntentionalBoardRemovalKeys.get(entry.key);
      if(!record || localKeys.has(entry.key)) return;
      if(!repaired) repaired = cloneOnlinePlain(incomingState);
      const row = repaired.board?.[entry.z]?.[entry.r];
      if(row) row[entry.c] = null;
      removeOnlineCardFromPlayerPiles(repaired, entry.card);
      const destination = record.destination;
      const pile = repaired.players?.[destination?.playerIndex]?.[destination?.pile];
      if(Array.isArray(pile) && destination.card){
        const key = onlineBoardCardKey(destination.card, -1, -1, -1);
        if(!pile.some(card=>onlineBoardCardKey(card, -1, -1, -1) === key)) pile.push(cloneOnlinePlain(destination.card));
      }
    });
    if(repaired){
      recordOnlineDiagnostic('online-intentional-board-removals-preserved', {reason:String(reason || '')});
      return repaired;
    }
    return incomingState;
  }
  function removeOnlineCardFromPlayerPiles(state, card){
    if(!state || !card || !Array.isArray(state.players)) return;
    const key = onlineBoardCardKey(card, -1, -1, -1);
    if(!key) return;
    state.players.forEach(function(player){
      if(!player) return;
      ['hand','deck','discard'].forEach(function(pileName){
        const pile = player[pileName];
        if(!Array.isArray(pile)) return;
        for(let i = pile.length - 1; i >= 0; i--){
          if(onlineBoardCardKey(pile[i], -1, -1, -1) === key) pile.splice(i, 1);
        }
      });
    });
  }
  function ensureOnlineStateBoardCell(state, z, r, c){
    if(!state) return null;
    if(!Array.isArray(state.board)) state.board = [];
    while(state.board.length <= z) state.board.push([]);
    if(!Array.isArray(state.board[z])) state.board[z] = [];
    while(state.board[z].length <= r) state.board[z].push([]);
    if(!Array.isArray(state.board[z][r])) state.board[z][r] = [];
    while(state.board[z][r].length <= c) state.board[z][r].push(null);
    return state.board[z][r];
  }
  function noteOnlineMoreBoardPreference(kind, reason, durationMs){
    const k = String(kind || '').toLowerCase();
    if(k === 'consolidation') return;
    const ms = k === 'movement'
      ? Math.max(60000, Number(durationMs) || 60000)
      : Math.max(2500, Number(durationMs) || 30000);
    onlineMoreBoardPreference = {until:Date.now() + ms, kind:k || 'board', reason:String(reason || '')};
    if(k === 'movement') onlineMovementBoardPreference = {until:Date.now() + ms, reason:String(reason || '')};
    recordOnlineDiagnostic('online-more-board-preference-noted', {
      kind:onlineMoreBoardPreference.kind,
      reason:onlineMoreBoardPreference.reason,
      ms
    });
  }
  function activeOnlineProtectedBoardPreference(){
    if(!onlineProtectedBoardPreference) return null;
    if(Date.now() > Number(onlineProtectedBoardPreference.until || 0)){
      onlineProtectedBoardPreference = null;
      return null;
    }
    if(String(onlineProtectedBoardPreference.kind || '').toLowerCase() === 'consolidation') return null;
    if(!Array.isArray(onlineProtectedBoardPreference.board) || !(Number(onlineProtectedBoardPreference.count) > 0)) return null;
    return onlineProtectedBoardPreference;
  }
  function hasOnlineProtectedBoardPreference(){
    return !!activeOnlineProtectedBoardPreference();
  }
  function protectOnlineMoreBoardSnapshot(kind, reason, durationMs, sourceBoard){
    const k = String(kind || '').toLowerCase();
    if(k === 'consolidation') return false;
    const g = gameState();
    const board = cloneOnlinePlain(sourceBoard || (g && g.board) || null);
    const entries = onlineBoardCardEntries(board);
    if(!entries.length) return false;
    const ms = k === 'movement'
      ? Math.max(60000, Number(durationMs) || 60000)
      : Math.max(30000, Number(durationMs) || 30000);
    noteOnlineMoreBoardPreference(k || 'board', reason, ms);
    onlineProtectedBoardPreference = {
      until:Date.now() + ms,
      kind:k || 'board',
      reason:String(reason || ''),
      board,
      count:entries.length,
      identity:onlineBoardIdentitySetSignature(board),
      layout:onlineBoardLayoutSignature(board)
    };
    recordOnlineDiagnostic('online-protected-board-snapshot', {
      kind:onlineProtectedBoardPreference.kind,
      reason:onlineProtectedBoardPreference.reason,
      boardCards:onlineProtectedBoardPreference.count,
      ms
    });
    return true;
  }
  function protectOnlineBoardIfChanged(kind, reason, beforeBoard, sourceBoard){
    const k = String(kind || '').toLowerCase();
    if(k === 'consolidation') return false;
    const g = gameState();
    const afterBoard = sourceBoard || (g && g.board);
    const beforeEntries = onlineBoardCardEntries(beforeBoard);
    const afterEntries = onlineBoardCardEntries(afterBoard);
    if(!afterEntries.length) return false;
    const beforeCount = beforeEntries.length;
    const afterCount = afterEntries.length;
    const beforeIdentity = onlineBoardIdentitySetSignature(beforeBoard);
    const afterIdentity = onlineBoardIdentitySetSignature(afterBoard);
    const beforeLayout = onlineBoardLayoutSignature(beforeBoard);
    const afterLayout = onlineBoardLayoutSignature(afterBoard);
    const placementGainedBoardCard = k === 'placement' && afterCount > beforeCount;
    const movementChangedBoard = k === 'movement' && (
      afterCount > beforeCount ||
      (afterCount === beforeCount && afterIdentity && beforeIdentity === afterIdentity && beforeLayout !== afterLayout)
    );
    if(!placementGainedBoardCard && !movementChangedBoard) return false;
    return protectOnlineMoreBoardSnapshot(k, reason, k === 'movement' ? 60000 : 30000, afterBoard);
  }
  function hasOnlineMoreBoardPreference(){
    if(!onlineMoreBoardPreference || Date.now() > Number(onlineMoreBoardPreference.until || 0)){
      onlineMoreBoardPreference = {until:0, kind:'', reason:''};
      return false;
    }
    return true;
  }
  function hasOnlineMovementBoardPreference(){
    if(onlineMovementBoardPreference && Date.now() <= Number(onlineMovementBoardPreference.until || 0)) return true;
    onlineMovementBoardPreference = {until:0, reason:''};
    return hasOnlineMoreBoardPreference() && String(onlineMoreBoardPreference.kind || '') === 'movement';
  }
  function clearOnlineMoreBoardPreference(reason){
    onlineMoreBoardPreference = {until:0, kind:'', reason:String(reason || '')};
    onlineMovementBoardPreference = {until:0, reason:String(reason || '')};
    onlineProtectedBoardPreference = null;
  }
  function isMoreBoardMovementAction(action){
    const type = String(action?.type || '').toUpperCase();
    const payload = action?.payload || {};
    const actionKind = String(payload.actionKind || payload.originalType || '').toUpperCase();
    const effectiveType = type === 'ACTION_RESULT' && actionKind ? actionKind : type;
    const fnName = String(payload.fn || '');
    return effectiveType === 'SELECT_PENDING_MOVE_CELL'
      || (effectiveType === 'CLICK_CELL' && (payload.pendingMove === true || payload.move === true || /move/i.test(String(payload.promptId || ''))))
      || (effectiveType === 'BOARD_ACTION' && /^(activateWolfCreek|activateExpeditionaryMove|activateLandscapeEventideMove|activateBusserMove|activateWodnyPotokYouth)$/i.test(fnName));
  }
  function isOnlineConsolidationStateAction(action){
    const type = String(action?.type || '').toUpperCase();
    const payload = action?.payload || {};
    const actionKind = String(payload.actionKind || payload.originalType || '').toUpperCase();
    const effectiveType = type === 'ACTION_RESULT' && actionKind ? actionKind : type;
    return effectiveType === 'SELECT_CONSOLIDATION_TRIBUTE'
      || effectiveType === 'START_CONSOLIDATE'
      || !!payload.consolidationPresentation
      || (Array.isArray(payload.presentationEvents) && payload.presentationEvents.some(event=>String(event?.type || '').toUpperCase() === 'CONSOLIDATION_COMPLETED'));
  }
  function isOnlineBoardReductionChoiceAction(action){
    const type = String(action?.type || '').toUpperCase();
    const payload = action?.payload || {};
    const actionKind = String(payload.actionKind || payload.originalType || '').toUpperCase();
    const effectiveType = type === 'ACTION_RESULT' && actionKind ? actionKind : type;
    if(isMoreBoardMovementAction(action)) return false;
    return effectiveType === 'PICK_ZONE' || effectiveType === 'PICK_CARDS_VISUAL' || effectiveType === 'MODAL_ACTION';
  }
  function shouldProtectLocalMoreBoardDuringDesync(reason, action){
    if(isOnlineConsolidationStateAction(action)) return false;
    return /desync|hash drift|browser resume|board agreement/i.test(String(reason || ''));
  }
  function shouldPreferMoreOnlineBoardCardsForAction(action){
    const type = String(action?.type || '').toUpperCase();
    const payload = action?.payload || {};
    const actionKind = String(payload.actionKind || payload.originalType || '').toUpperCase();
    const effectiveType = type === 'ACTION_RESULT' && actionKind ? actionKind : type;
    if(isOnlineConsolidationStateAction(action)) return false;
    if(isMoreBoardMovementAction(action)) return true;
    if(hasOnlineMoreBoardPreference()) return true;
    if(effectiveType === 'PLACE_CARD') return true;
    if(effectiveType === 'CLICK_CELL') return !!(
      payload.placing ||
      payload.selectedHandCard !== undefined ||
      payload.handIndex !== undefined ||
      payload.card ||
      payload.cardId
    );
    return false;
  }
  function preferMoreOnlineBoardCards(incomingState, localBoard, reason, action){
    if(!incomingState) return incomingState;
    // A rejection is a rollback to the authority's exact pre-action state.
    // Never reapply locally remembered removals here: doing so could return the
    // consolidated Character to hand while leaving its sacrificed Supporter
    // missing from the board.
    if(/authority rejection resync|rejected action rollback|fly rejected action rollback/i.test(String(reason || ''))){
      onlineIntentionalBoardRemovalKeys.clear();
      clearOnlineMoreBoardPreference('authoritative-action-rollback');
      return incomingState;
    }
    incomingState = applyOnlineIntentionalBoardRemovals(incomingState, localBoard, reason);
    const localEntries = onlineBoardCardEntries(localBoard);
    const incomingEntries = onlineBoardCardEntries(incomingState.board);
    const protectedPreference = activeOnlineProtectedBoardPreference();
    const protectedEntries = protectedPreference ? onlineBoardCardEntries(protectedPreference.board) : [];
    const eligibleLocalEntries = localEntries.filter(entry=>!isOnlineIntentionalBoardRemovalEntry(entry));
    const eligibleProtectedEntries = protectedEntries.filter(entry=>!isOnlineIntentionalBoardRemovalEntry(entry));
    const richestCandidate = [
      {source:'local', board:localBoard, entries:eligibleLocalEntries, protected:false},
      {source:'protected', board:protectedPreference && protectedPreference.board, entries:eligibleProtectedEntries, protected:!!protectedPreference}
    ].filter(candidate=>Array.isArray(candidate.board) && candidate.entries.length > incomingEntries.length)
      .sort((a, b)=>b.entries.length - a.entries.length || (b.protected ? 1 : 0) - (a.protected ? 1 : 0))[0] || null;
    const richestLocalCount = Math.max(eligibleLocalEntries.length, eligibleProtectedEntries.length);
    if(isOnlineConsolidationStateAction(action)){
      if(incomingEntries.length < richestLocalCount){
        clearOnlineMoreBoardPreference('consolidation1-authoritative-board-reduction');
        recordOnlineDiagnostic('consolidation1-authoritative-board-reduction-kept', {
          localBoardCards:localEntries.length,
          protectedBoardCards:protectedEntries.length,
          incomingBoardCards:incomingEntries.length,
          actionType:String(action?.type || ''),
          actionKind:String(action?.payload?.actionKind || action?.payload?.originalType || ''),
          reason:String(reason || '')
        });
      }
      return incomingState;
    }
    if(incomingEntries.length > richestLocalCount){
      recordOnlineDiagnostic('online-more-board-cards-kept-incoming-state', {
        localBoardCards:localEntries.length,
        protectedBoardCards:protectedEntries.length,
        incomingBoardCards:incomingEntries.length,
        reason:String(reason || '')
      });
      return incomingState;
    }
    if(incomingEntries.length < richestLocalCount && isOnlineBoardReductionChoiceAction(action)){
      recordOnlineDiagnostic('online-more-board-cards-skipped-for-board-reduction-choice', {
        localBoardCards:localEntries.length,
        protectedBoardCards:protectedEntries.length,
        incomingBoardCards:incomingEntries.length,
        actionType:String(action?.type || ''),
        actionKind:String(action?.payload?.actionKind || action?.payload?.originalType || ''),
        reason:String(reason || '')
      });
      clearOnlineMoreBoardPreference('board-reduction-choice');
      return incomingState;
    }
    const allowMoreCardRepair = !!richestCandidate && (richestCandidate.protected || shouldPreferMoreOnlineBoardCardsForAction(action));
    if(!allowMoreCardRepair) return incomingState;
    const incomingKeys = new Set(incomingEntries.map(entry=>entry.key));
    let repaired = null;
    let restored = 0;
    richestCandidate.entries.forEach(function(entry){
      if(!entry.key || incomingKeys.has(entry.key)) return;
      if(!repaired) repaired = cloneOnlinePlain(incomingState);
      const row = ensureOnlineStateBoardCell(repaired, entry.z, entry.r, entry.c);
      if(!row || row[entry.c]) return;
      const card = compactOnlineCard(entry.card);
      row[entry.c] = card;
      removeOnlineCardFromPlayerPiles(repaired, card);
      incomingKeys.add(entry.key);
      restored += 1;
    });
    if(!repaired || !restored) return incomingState;
    recordOnlineDiagnostic('online-more-board-cards-repaired-client-state', {
      localBoardCards:localEntries.length,
      protectedBoardCards:protectedEntries.length,
      incomingBoardCards:incomingEntries.length,
      source:richestCandidate.source,
      restored,
      reason:String(reason || '')
    });
    return repaired;
  }
  function applyProtectedMoreBoardSnapshotToState(state, reason){
    const protectedPreference = activeOnlineProtectedBoardPreference();
    if(!protectedPreference || !state) return false;
    const protectedBoard = protectedPreference.board;
    const stateCount = onlineStateBoardCardCount(state);
    const protectedCount = Number(protectedPreference.count || 0);
    const stateIdentity = onlineBoardIdentitySetSignature(state.board);
    const stateLayout = onlineStateBoardLayoutSignature(state);
    const protectedHasMoreCards = protectedCount > stateCount;
    const protectedMovedSameCards = String(protectedPreference.kind || '') === 'movement'
      && protectedCount === stateCount
      && protectedPreference.identity
      && String(protectedPreference.identity || '') === stateIdentity
      && String(protectedPreference.layout || '') !== stateLayout;
    if(!protectedHasMoreCards && !protectedMovedSameCards) return false;
    state.board = cloneOnlinePlain(protectedBoard);
    onlineBoardCardEntries(state.board).forEach(function(entry){
      removeOnlineCardFromPlayerPiles(state, entry.card);
    });
    recordOnlineDiagnostic('online-protected-board-snapshot-applied-to-sync', {
      reason:String(reason || ''),
      kind:String(protectedPreference.kind || ''),
      stateBoardCards:stateCount,
      protectedBoardCards:protectedCount,
      movedSameCards:protectedMovedSameCards
    });
    return true;
  }
  function onlineStateBoardCardCount(state){
    return onlineBoardCardEntries(state && state.board).length;
  }
  function onlineBoardLayoutSignature(board){
    return onlineBoardCardEntries(board)
      .map(entry=>[entry.key, entry.z, entry.r, entry.c].join('@'))
      .sort()
      .join('|');
  }
  function onlineStateBoardLayoutSignature(state){
    return onlineBoardLayoutSignature(state && state.board);
  }
  function localOnlineBoardLayoutSignature(){
    const g = gameState();
    return onlineBoardLayoutSignature(g && g.board);
  }
  function onlineBoardIdentitySetSignature(board){
    return onlineBoardCardEntries(board)
      .map(entry=>entry.key)
      .filter(Boolean)
      .sort()
      .join('|');
  }
  function localOnlineBoardCardCount(){
    const g = gameState();
    return onlineBoardCardEntries(g && g.board).length;
  }
  function rememberOnlineAuthorityBoardSnapshot(state, stateHash){
    if(!state || !Array.isArray(state.board)) return;
    lastAuthorityBoardSnapshot = {
      layout:onlineStateBoardLayoutSignature(state),
      identity:onlineBoardIdentitySetSignature(state.board),
      count:onlineStateBoardCardCount(state),
      stateHash:String(stateHash || '')
    };
  }
  function localOnlineBoardMatchesAuthority(){
    const g = gameState();
    if(!g || !lastAuthorityBoardSnapshot || !lastAuthorityBoardSnapshot.layout) {
      const localState = captureOnlineCanonicalState();
      const localHash = localState ? onlineCanonicalStateHash(localState) : '';
      return !!(localHash && lastAuthorityStateHash && localHash === lastAuthorityStateHash);
    }
    return localOnlineBoardCardCount() === Number(lastAuthorityBoardSnapshot.count)
      && onlineBoardIdentitySetSignature(g.board) === String(lastAuthorityBoardSnapshot.identity || '')
      && localOnlineBoardLayoutSignature() === String(lastAuthorityBoardSnapshot.layout || '');
  }
  function onlineAuthorityBoardAgreementPayload(){
    return {
      count:Number(lastAuthorityBoardSnapshot && lastAuthorityBoardSnapshot.count),
      identity:String(lastAuthorityBoardSnapshot && lastAuthorityBoardSnapshot.identity || ''),
      layout:String(lastAuthorityBoardSnapshot && lastAuthorityBoardSnapshot.layout || ''),
      stateHash:String(lastAuthorityBoardSnapshot && lastAuthorityBoardSnapshot.stateHash || lastAuthorityStateHash || '')
    };
  }
  function sendMoreBoardCardsAuthoritySyncNow(reason){
    if(onlineMoreBoardRepairSyncTimer){
      clearTimeout(onlineMoreBoardRepairSyncTimer);
      onlineMoreBoardRepairSyncTimer = null;
    }
    const latest = gameState();
    if(!isOnlineMatchState(latest) || latest._onlineApplyingRemoteAction || !Number.isInteger(latest._onlinePlayerIndex)) return Promise.resolve(false);
    if(latest._isSpectator || latest._onlineRole === 'spectator') return Promise.resolve(false);
    const protectedPreference = activeOnlineProtectedBoardPreference();
    if(!hasOnlineMoreBoardPreference() && !hasOnlineMovementBoardPreference() && !protectedPreference) return Promise.resolve(false);
    const baseStateHash = String(lastAuthorityStateHash || '');
    if(!baseStateHash) return Promise.resolve(false);
    const requestedReason = String(reason || 'more-board-cards-authoritative-merge');
    const sourceReason = (hasOnlineMovementBoardPreference() || String(protectedPreference?.kind || '') === 'movement') && !/mov/i.test(requestedReason)
      ? requestedReason + ':movement'
      : requestedReason;
    const payload = {
      playerIndex:latest._onlinePlayerIndex,
      currentPlayer:latest.currentPlayer,
      turn:latest.turn,
      sourceType:'MORE_BOARD_CARDS_REPAIR',
      sourceReason,
      baseStateHash,
      clientActionId:makeDirectAuthorityActionId('STATE_SYNC')
    };
    try{ attachOnlinePostState(payload); }catch(e){ console.warn('Could not capture more-board-cards repair sync', e); return Promise.resolve(false); }
    if(!payload.postState || !payload.stateHash) return Promise.resolve(false);
    if(applyProtectedMoreBoardSnapshotToState(payload.postState, sourceReason)){
      payload.stateHash = onlineCanonicalStateHash(payload.postState);
    }
    if(payload.stateHash === baseStateHash){
      rememberOnlineAuthorityBoardSnapshot(payload.postState, payload.stateHash);
      return Promise.resolve(localOnlineBoardMatchesAuthority());
    }
    if(payload.stateHash === lastMoreBoardRepairSyncHash){
      return onlineMoreBoardRepairSyncPromise || Promise.resolve(false);
    }
    lastMoreBoardRepairSyncHash = payload.stateHash;
    recordOnlineDiagnostic('online-more-board-cards-authority-sync', {
      reason:sourceReason,
      baseStateHash,
      stateHash:String(payload.stateHash || ''),
      boardCards:onlineStateBoardCardCount(payload.postState)
    });
    const promise = sendAction('STATE_SYNC', payload).then(()=>{
      lastAuthorityStateHash = String(payload.stateHash || lastAuthorityStateHash || '');
      rememberOnlineAuthorityBoardSnapshot(payload.postState, payload.stateHash);
      recordOnlineDiagnostic('online-more-board-cards-authority-sync-accepted-local-snapshot', {
        reason:sourceReason,
        stateHash:String(payload.stateHash || ''),
        boardCards:onlineStateBoardCardCount(payload.postState)
      });
      return true;
    }).catch(e=>{
      if(payload.stateHash === lastMoreBoardRepairSyncHash) lastMoreBoardRepairSyncHash = '';
      recordOnlineDiagnostic('online-more-board-cards-authority-sync-failed', {
        reason:sourceReason,
        message:String(e && e.message || e || '')
      });
      console.warn('More-board-cards repair sync failed', e);
      return false;
    }).finally(()=>{
      if(onlineMoreBoardRepairSyncPromise === promise) onlineMoreBoardRepairSyncPromise = null;
    });
    onlineMoreBoardRepairSyncPromise = promise;
    return promise;
  }
  function scheduleMoreBoardCardsAuthoritySync(reason, delayMs){
    if(onlineMoreBoardRepairSyncTimer) clearTimeout(onlineMoreBoardRepairSyncTimer);
    onlineMoreBoardRepairSyncTimer = setTimeout(function(){
      sendMoreBoardCardsAuthoritySyncNow(reason);
    }, Math.max(40, Number(delayMs || 90) || 90));
  }
  function waitForOnlineActionReplayQueueBounded(reason, timeoutMs){
    const ms = Math.max(120, Number(timeoutMs || 700) || 700);
    let timedOut = false;
    return Promise.race([
      actionReplayQueue.catch(()=>{}),
      new Promise(resolve=>setTimeout(function(){
        timedOut = true;
        resolve(false);
      }, ms))
    ]).then(function(value){
      if(timedOut){
        recordOnlineDiagnostic('online-action-replay-bounded-wait-timeout', {
          reason:String(reason || ''),
          timeoutMs:ms,
          lastActionSeq:Number(lastActionSeq || 0) || 0,
          lastAppliedActionSeq:Number(lastAppliedActionSeq || 0) || 0
        });
      }
      return value;
    });
  }
  async function waitForOnlineBoardAgreementBeforeTurnAdvance(reason){
    if(onlineTurnBoundaryAgreementPromise){
      if(Date.now() - Number(onlineTurnBoundaryAgreementStartedAt || 0) < 9000) return onlineTurnBoundaryAgreementPromise;
      recordOnlineDiagnostic('online-turn-boundary-board-agreement-stale-cleared', {
        reason:String(reason || ''),
        ageMs:Date.now() - Number(onlineTurnBoundaryAgreementStartedAt || 0)
      });
      onlineTurnBoundaryAgreementPromise = null;
      onlineTurnBoundaryAgreementStartedAt = 0;
    }
    onlineTurnBoundaryAgreementStartedAt = Date.now();
    const agreementPromise = (async function(){
    const latest = gameState();
    if(!isOnlineMatchState(latest) || latest._onlineApplyingRemoteAction) return true;
    if(latest._isSpectator || latest._onlineRole === 'spectator') return true;
    const code = latest._onlineRoomCode || activeRoom;
    const repairReason = String(reason || 'turn-boundary-board-agreement-repair');
    recordOnlineDiagnostic('online-turn-boundary-board-agreement-start', {
      reason:repairReason,
      localBoardCards:localOnlineBoardCardCount(),
      authorityBoardCards:lastAuthorityBoardSnapshot && lastAuthorityBoardSnapshot.count,
      hasMoreBoardPreference:hasOnlineMoreBoardPreference(),
      hasMovementPreference:hasOnlineMovementBoardPreference(),
      hasProtectedPreference:hasOnlineProtectedBoardPreference()
    });
    if(hasOnlineMoreBoardPreference() || hasOnlineMovementBoardPreference() || hasOnlineProtectedBoardPreference()){
      await sendMoreBoardCardsAuthoritySyncNow(repairReason + ':immediate-repair');
      await waitForOnlineActionReplayQueueBounded('turn-boundary-immediate-repair', 700);
      if(localOnlineBoardMatchesAuthority()){
        recordOnlineDiagnostic('online-turn-boundary-board-agreement', {
          reason:repairReason,
          attempt:0,
          source:'immediate-repair-sync'
        });
        return true;
      }
    }
    if(code && authorityHttpBaseUrl() && !firebaseActionFallbackAllowed()){
      await catchUpFlyAuthorityReplay(code, repairReason + ' initial board agreement refresh', {
        includeState:true,
        limit:60,
        timeoutMs:2500
      });
      await waitForOnlineActionReplayQueueBounded('turn-boundary-initial-catchup', 700);
    }
    if(localOnlineBoardMatchesAuthority()) return true;
    for(let attempt = 1; attempt <= 2; attempt += 1){
      if(hasOnlineMoreBoardPreference() || hasOnlineMovementBoardPreference() || hasOnlineProtectedBoardPreference()){
        await sendMoreBoardCardsAuthoritySyncNow(repairReason + ':attempt-' + attempt);
      }
      await waitForOnlineActionReplayQueueBounded('turn-boundary-repair-' + attempt, 700);
      if(localOnlineBoardMatchesAuthority()){
        recordOnlineDiagnostic('online-turn-boundary-board-agreement', {
          reason:repairReason,
          attempt,
          source:'repair-sync'
        });
        return true;
      }
      if(code && authorityHttpBaseUrl() && !firebaseActionFallbackAllowed()){
        await catchUpFlyAuthorityReplay(code, repairReason + ' board agreement attempt ' + attempt, {
          includeState:true,
          limit:60,
          timeoutMs:2500
        });
        await waitForOnlineActionReplayQueueBounded('turn-boundary-catchup-' + attempt, 700);
        if(localOnlineBoardMatchesAuthority()){
          recordOnlineDiagnostic('online-turn-boundary-board-agreement', {
            reason:repairReason,
            attempt,
            source:'catchup'
          });
          return true;
        }
      }
      if(attempt === 1) await new Promise(resolve=>setTimeout(resolve, 40));
    }
    recordOnlineDiagnostic('online-turn-boundary-board-agreement-blocked', {
      reason:repairReason,
      localBoardCards:localOnlineBoardCardCount(),
      authorityBoardCards:lastAuthorityBoardSnapshot && lastAuthorityBoardSnapshot.count,
      localLayout:localOnlineBoardLayoutSignature(),
      authorityLayout:lastAuthorityBoardSnapshot && lastAuthorityBoardSnapshot.layout,
      authorityHash:String(lastAuthorityStateHash || '')
    });
    if(window.toast) toast('Board is still mismatched. Try End Turn again after the sync indicator clears.');
    return false;
    })();
    onlineTurnBoundaryAgreementPromise = agreementPromise;
    return agreementPromise.finally(function(){
      if(onlineTurnBoundaryAgreementPromise === agreementPromise){
        onlineTurnBoundaryAgreementPromise = null;
        onlineTurnBoundaryAgreementStartedAt = 0;
      }
    });
  }
  function runOnlineTurnBoundaryAfterBoardAgreement(repairReason, finish){
    if(onlinePendingEndTurnAfterAgreementPromise){
      const pendingAge = Date.now() - Number(onlineTurnBoundaryAgreementStartedAt || 0);
      if(pendingAge < ONLINE_TURN_BOUNDARY_WATCHDOG_MS){
        if(window.toast) toast('Syncing board before ending turn...');
        return onlinePendingEndTurnAfterAgreementPromise;
      }
      recordOnlineDiagnostic('online-turn-boundary-outer-stale-released', {
        reason:String(repairReason || ''),
        ageMs:pendingAge
      });
      onlinePendingEndTurnAfterAgreementPromise = null;
      onlineTurnBoundaryAgreementPromise = null;
      onlineTurnBoundaryAgreementStartedAt = 0;
    }
    let watchdogTimer = 0;
    const boundedAgreement = Promise.race([
      waitForOnlineBoardAgreementBeforeTurnAdvance(repairReason),
      new Promise(resolve=>{
        watchdogTimer = setTimeout(function(){
          recordOnlineDiagnostic('online-turn-boundary-watchdog-released', {
            reason:String(repairReason || ''),
            timeoutMs:ONLINE_TURN_BOUNDARY_WATCHDOG_MS
          });
          if(window.toast) toast('Board sync timed out. End Turn is available again.');
          resolve(false);
        }, ONLINE_TURN_BOUNDARY_WATCHDOG_MS);
      })
    ]);
    const pendingPromise = boundedAgreement
      .then((agreed)=>agreed && typeof finish === 'function' ? Promise.resolve().then(finish) : false)
      .finally(function(){
        if(watchdogTimer) clearTimeout(watchdogTimer);
        if(onlinePendingEndTurnAfterAgreementPromise === pendingPromise) onlinePendingEndTurnAfterAgreementPromise = null;
      });
    onlinePendingEndTurnAfterAgreementPromise = pendingPromise;
    return pendingPromise;
  }
  function startOnlineBoardRepairBeforeTurnBoundary(reason){
    const repairReason = String(reason || 'turn-boundary-background-board-repair');
    recordOnlineDiagnostic('online-turn-boundary-background-repair-started', {
      reason:repairReason,
      localBoardCards:localOnlineBoardCardCount(),
      authorityBoardCards:lastAuthorityBoardSnapshot && lastAuthorityBoardSnapshot.count,
      localMatchesAuthority:localOnlineBoardMatchesAuthority(),
      hasMoreBoardPreference:hasOnlineMoreBoardPreference(),
      hasMovementPreference:hasOnlineMovementBoardPreference(),
      hasProtectedPreference:hasOnlineProtectedBoardPreference()
    });
    if(hasOnlineMoreBoardPreference() || hasOnlineMovementBoardPreference() || hasOnlineProtectedBoardPreference()){
      sendMoreBoardCardsAuthoritySyncNow(repairReason + ':background-repair').catch(function(e){
        recordOnlineDiagnostic('online-turn-boundary-background-repair-failed', {
          reason:repairReason,
          message:String(e && e.message || e || '')
        });
      });
    }
    const g = gameState();
    const code = g?._onlineRoomCode || activeRoom;
    if(code && authorityHttpBaseUrl() && !firebaseActionFallbackAllowed() && !localOnlineBoardMatchesAuthority()){
      catchUpFlyAuthorityReplay(code, repairReason + ' background catchup', {
        includeState:true,
        limit:60,
        timeoutMs:2500
      }).catch(function(e){
        recordOnlineDiagnostic('online-turn-boundary-background-catchup-failed', {
          reason:repairReason,
          message:String(e && e.message || e || '')
        });
      });
    }
  }
  function onlineCardCatalogMatch(card){
    if(!card || typeof card !== 'object' || typeof CARDS === 'undefined' || !Array.isArray(CARDS)) return null;
    const id = String(card.id || '');
    return id ? CARDS.find(base=>String(base.id || '') === id) || null : null;
  }
  function onlineCardType(card){
    return String(card?.type || onlineCardCatalogMatch(card)?.type || '');
  }
  const ONLINE_HAVANO_FIRST_SET_SOURCE_IDS = new Set([
    '04','10','14','16','17','18','21','26','30','31','36','39','50','52','53','61','62','64','71','72'
  ]);
  const ONLINE_SECULES_WHEN_SET_IDS = new Set([
    '02','03','04','05','06','07','08','12','13','14','16','17','18','21','22','25','26','27','29','30','31','32','33','34','35','37','38','39','40','42','43','45','46','48','50','51','52','54','56','58','60','61','62','66','68','69','71','72','73','75','76','77','80','84','91','94','bh01','bh25'
  ]);
  const resumedOnlinePlacementReactionPrompts = new Set();

  function onlinePlacementReactionSourceIsImmune(card){
    if(!card || card.faceDown) return true;
    const id = String(card.id || '');
    return id === '20' || id === '70' || id === '76' || id === 'bh01' || card.immuneFlag === true || card.opponentEffectImmune === true;
  }
  function forEachOnlineBoardEntry(g, callback){
    (Array.isArray(g?.board) ? g.board : []).forEach(function(zone, z){
      (Array.isArray(zone) ? zone : []).forEach(function(row, r){
        (Array.isArray(row) ? row : []).forEach(function(card, c){
          if(card) callback(card, z, r, c);
        });
      });
    });
  }
  function onlineImprovisorOnBoardReady(g, playerIndex, id){
    let ready = false;
    forEachOnlineBoardEntry(g, function(card){
      if(ready || String(card.id || '') !== String(id) || Number(card.owner) !== Number(playerIndex) || card.faceDown || card.immuneFlag) return;
      if(String(id) === '56') ready = (card.usesLeft == null ? 3 : Number(card.usesLeft)) > 0;
      else if(String(id) === '67') ready = (card.usesLeft == null ? (card._seculesUsed ? 0 : 1) : Number(card.usesLeft)) > 0;
    });
    return ready;
  }
  function onlineHavanoHasDeploymentOption(g, owner, card){
    const blocked = Array.isArray(g?.blockedCells) ? g.blockedCells : [];
    for(let z = 0; z < (Array.isArray(g?.board) ? g.board.length : 0); z += 1){
      const zone = g.board[z];
      if(!Array.isArray(zone)) continue;
      for(let r = 0; r < zone.length; r += 1){
        const rowOwner = r === 0 ? 1 : (r === 1 ? -1 : 0);
        if(rowOwner !== -1 && rowOwner !== Number(owner)) continue;
        if(card?.contestedOnly && r !== 1) continue;
        const row = zone[r];
        if(!Array.isArray(row)) continue;
        for(let c = 0; c < row.length; c += 1){
          if(row[c]) continue;
          if(blocked.some(item=>Number(item?.z) === z && Number(item?.r) === r && Number(item?.c) === c)) continue;
          return true;
        }
      }
    }
    return false;
  }
  function onlineEligiblePlacementImprovisorKinds(g, sourceCard){
    if(!isOnlineMatchState(g) || !sourceCard || onlinePlacementReactionSourceIsImmune(sourceCard)) return [];
    if(sourceCard._skipOnlinePlacementImprovisorReactionOnce || sourceCard._skipOnlinePlacementImprovisorReactionPromptId) return [];
    const sourceOwner = Number(sourceCard.owner);
    if(!Number.isInteger(sourceOwner) || sourceOwner < 0 || sourceOwner > 1) return [];
    const reactor = sourceOwner === 0 ? 1 : 0;
    const sourceId = String(sourceCard.id || '');
    const sourceType = onlineCardType(sourceCard);
    const kinds = [];
    if(onlineImprovisorOnBoardReady(g, reactor, '56')) kinds.push('lydia');
    if(onlineImprovisorOnBoardReady(g, reactor, '67') && (sourceType === 'Initiator' || (sourceType === 'Supporter' && ONLINE_SECULES_WHEN_SET_IDS.has(sourceId)))) kinds.push('secules');
    if(ONLINE_HAVANO_FIRST_SET_SOURCE_IDS.has(sourceId)){
      const havano = (g.players?.[reactor]?.hand || []).find(card=>String(card?.id || '') === '79');
      if(havano && onlineHavanoHasDeploymentOption(g, reactor, havano)) kinds.push('havano');
    }
    return kinds;
  }
  window.fateShouldHoldOnlinePlacementEffect = function(card, z, r, c){
    const g = gameState();
    if(!isOnlineMatchState(g) || g._onlineApplyingRemoteAction || g._serverPendingReaction) return false;
    const localIndex = resolveOnlineLocalPlayerIndex('placement-improvisor-gate');
    if(localIndex === null || Number(card?.owner) !== Number(localIndex)) return false;
    const kinds = onlineEligiblePlacementImprovisorKinds(g, card);
    if(!kinds.length) return false;
    g._onlineHeldPlacementEffect = {
      iid:String(card.iid || ''),
      z:Number(z),
      r:Number(r),
      c:Number(c),
      kinds
    };
    recordOnlineDiagnostic('online-placement-effect-held-for-improvisor', {
      iid:String(card.iid || ''),
      id:String(card.id || ''),
      z:Number(z),
      r:Number(r),
      c:Number(c),
      kinds
    });
    return true;
  };

  function onlinePlacementAllowEntry(g, promptId){
    let found = null;
    forEachOnlineBoardEntry(g, function(card, z, r, c){
      if(found || String(card._onlinePlacementReactionAllowPromptId || '') !== String(promptId || '')) return;
      found = {card, z, r, c};
    });
    return found;
  }
  function maybeResumeAllowedOnlinePlacementEffect(action, reason){
    const type = String(action?.type || '').toUpperCase();
    const payload = action?.payload || {};
    const choice = String(payload.choice || '').toLowerCase();
    const promptId = String(payload.promptId || '');
    if(type !== 'REACTION_CHOICE' || !/^(allow|decline|timeout)$/.test(choice) || !promptId || resumedOnlinePlacementReactionPrompts.has(promptId)) return false;
    const g = gameState();
    const entry = onlinePlacementAllowEntry(g, promptId);
    const localIndex = resolveOnlineLocalPlayerIndex('resume-placement-improvisor-effect');
    if(!entry || localIndex === null || Number(entry.card.owner) !== Number(localIndex)) return false;
    resumedOnlinePlacementReactionPrompts.add(promptId);
    const attempt = function(){
      const latest = gameState();
      const live = onlinePlacementAllowEntry(latest, promptId);
      if(!live) return;
      if(latest._onlineApplyingRemoteAction){
        setTimeout(attempt, 40);
        return;
      }
      const lockDelay = Math.max(0, Number(latest._cinematicUiLockUntil || 0) - Date.now());
      if(lockDelay > 20){
        setTimeout(attempt, Math.min(lockDelay + 20, 2800));
        return;
      }
      latest._onlineHeldPlacementEffect = null;
      if(typeof window.resolveSetCardAfterPlacement !== 'function') return;
      recordOnlineDiagnostic('online-placement-effect-resumed-after-allow', {
        promptId,
        iid:String(live.card.iid || ''),
        reason:String(reason || '')
      });
      Promise.resolve(window.resolveSetCardAfterPlacement(live.card, live.z, live.r, live.c, {
        onlineImprovisorResolved:true,
        allowPromptId:promptId
      })).finally(function(){
        scheduleClientResolvedAutoCommit('placement-improvisor-allowed', 80);
      });
    };
    setTimeout(attempt, 0);
    return true;
  }
  function onlineConsolidationCinematicTotalMs(){
    if(typeof window.getConsolidationCinematicTotalMs === 'function'){
      return Math.max(2400, Number(window.getConsolidationCinematicTotalMs()) || 3260);
    }
    return 3260;
  }
  const onlineAutomaticPlacementPresentationKeys = new Set();
  function onlineAutomaticPlacementPresentationKey(action, entry){
    const payload = action?.payload || {};
    const actionKey = action?.seq || payload.clientActionId || [
      onlineEffectiveActionType(action),
      payload.playerIndex ?? '',
      payload.turn ?? ''
    ].join(':');
    const card = entry?.card || {};
    return [
      'automatic-placement',
      actionKey,
      card.iid || card.id || card.name || '',
      entry?.z ?? payload.z ?? '',
      entry?.r ?? payload.r ?? '',
      entry?.c ?? payload.c ?? ''
    ].join(':');
  }
  function rememberOnlineAutomaticPlacementPresentation(action, entry){
    const key = onlineAutomaticPlacementPresentationKey(action, entry);
    if(onlineAutomaticPlacementPresentationKeys.has(key)) return false;
    onlineAutomaticPlacementPresentationKeys.add(key);
    if(onlineAutomaticPlacementPresentationKeys.size > 240){
      const first = onlineAutomaticPlacementPresentationKeys.values().next().value;
      if(first) onlineAutomaticPlacementPresentationKeys.delete(first);
    }
    return true;
  }
  function scheduleOnlineAutomaticPlacementPresentation(g, entry, action, options){
    if(!g || !entry || !entry.card || entry.card.faceDown) return false;
    if(!rememberOnlineAutomaticPlacementPresentation(action, entry)) return false;
    const card = entry.card;
    const delayMs = Math.max(0, Number(options?.delayMs) || 0);
    const source = String(options?.source || 'online-automatic-placement');
    if(onlineCardType(card) === 'Supporter'){
      playOnlineRemotePlacementAudio(card, delayMs);
      return true;
    }
    try{
      if(typeof window.requestCharacterSetCinematic === 'function'){
        window.requestCharacterSetCinematic(card, {
          z:entry.z,
          r:entry.r,
          c:entry.c,
          delayMs,
          source
        });
        // A false return means this exact card already has a queued cinematic.
        // This placement still owns the automatic presentation and must remain
        // deduplicated against the authoritative fallback paths.
        return true;
      }
      if(typeof window.showConsolidationCinematic === 'function'){
        g._cinematicUiLockUntil = Math.max(
          g._cinematicUiLockUntil || 0,
          Date.now() + delayMs + onlineConsolidationCinematicTotalMs()
        );
        setTimeout(function(){
          window.showConsolidationCinematic(card, {
            playVoice:true,
            playSfx:true,
            allowRenderV2Cinematic:true
          });
        }, delayMs);
        return true;
      }
    }catch(e){
      console.warn('Online automatic placement presentation failed', e);
    }
    return false;
  }
  function maybePlayOnlineNewCharacterCinematic(g, previousBoard, action, reason){
    if(!g || !isOnlineMatchState(g) || typeof window.showConsolidationCinematic !== 'function') return false;
    const presentationEvents = Array.isArray(action?.payload?.presentationEvents) ? action.payload.presentationEvents : [];
    if(isOnlineConsolidationCompletionAction(action) || presentationEvents.some(function(event){
      return String(event?.type || '').toUpperCase() === 'CONSOLIDATION_COMPLETED';
    })){
      recordOnlineDiagnostic('online-new-character-cinematic-deferred-to-consolidation', {
        reason:String(reason || ''),
        actionType:onlineEffectiveActionType(action)
      });
      return false;
    }
    const added = onlineBoardAddedEntries(previousBoard, g.board).filter(function(entry){
      return entry && entry.card && !entry.card.faceDown && onlineCardType(entry.card) !== 'Supporter';
    });
    if(!added.length) return false;
    const played = g._onlineNewCharacterCinematicsPlayed instanceof Set ? g._onlineNewCharacterCinematicsPlayed : new Set();
    g._onlineNewCharacterCinematicsPlayed = played;
    let scheduled = false;
    added.forEach(function(entry, index){
      const card = entry.card;
      const playedKey = [
        card.iid || card.id || card.name || '',
        entry.z,
        entry.r,
        entry.c
      ].join(':');
      if(played.has(playedKey)) return;
      played.add(playedKey);
      const delayMs = 120 + index * 80;
      try{
        const entryScheduled = scheduleOnlineAutomaticPlacementPresentation(g, entry, action, {
          delayMs,
          source:'online-new-character'
        });
        if(!entryScheduled) return;
        scheduled = true;
        if(typeof window.scheduleCoordinatorPlacementFlash === 'function') {
          window.scheduleCoordinatorPlacementFlash(card, {
            z:entry.z,
            r:entry.r,
            c:entry.c,
            source:'online-new-character',
            delayMs:delayMs + onlineConsolidationCinematicTotalMs() + 90,
            soundKey:'coord-online:' + String(card.iid || card.id || 'card') + ':' + String(g.turn || 0)
          });
        }
      }catch(e){
        console.warn('Online new-character cinematic failed', e);
      }
      recordOnlineDiagnostic('online-new-character-cinematic', {
        cardId:String(card.id || ''),
        cardName:String(card.name || ''),
        z:entry.z,
        r:entry.r,
        c:entry.c,
        reason:String(reason || ''),
        actionType:onlineEffectiveActionType(action)
      });
    });
    return scheduled;
  }
  function primeOnlineCharacterFatePresentationLock(g, previousBoard, action, previousHandFateByIid){
    if(!g || !isOnlineMatchState(g)) return false;
    const added = onlineBoardAddedEntries(previousBoard, g.board).filter(function(entry){
      return entry && entry.card && !entry.card.faceDown;
    });
    if(!added.length) return false;
    const presentationEvents = Array.isArray(action?.payload?.presentationEvents) ? action.payload.presentationEvents : [];
    const consolidationEvent = presentationEvents.find(function(event){
      return String(event?.type || '').toUpperCase() === 'CONSOLIDATION_COMPLETED';
    }) || null;
    const isConsolidation = isOnlineConsolidationCompletionAction(action) || !!consolidationEvent;
    const selectedHand = action?.payload?.selectedHand || consolidationEvent?.resultCard || null;
    const createdAt = Date.now();
    added.forEach(function(entry){
      const card = entry.card;
      const iid = String(card && card.iid || '');
      let fromValue = iid && previousHandFateByIid instanceof Map ? previousHandFateByIid.get(iid) : null;
      if(!Number.isFinite(Number(fromValue)) && selectedHand && (
        String(selectedHand.iid || '') === iid ||
        (!selectedHand.iid && String(selectedHand.id || '') === String(card.id || ''))
      )) {
        fromValue = Number(selectedHand.currentFate ?? selectedHand.fate);
      }
      if(!Number.isFinite(Number(fromValue))) fromValue = Number(card.fate);
      const owner = Number(card && card.owner);
      const activeBallads = isConsolidation && Number.isInteger(owner) && Array.isArray(g._balladEffects?.[owner])
        ? g._balladEffects[owner].filter(function(fx){ return fx && fx.active && !fx.ended; }).length
        : 0;
      const kvetkaGainAmount = activeBallads * 3;
      const storedDelta = Number(card.currentFate ?? card.fate) - Number(fromValue);
      card._placementFateReveal = {
        fromValue:Math.max(0, Number(fromValue) || 0),
        mode:isConsolidation ? 'consolidation' : 'set',
        createdAt,
        genericSoundRequested:Number.isFinite(storedDelta) && storedDelta !== 0 && storedDelta !== kvetkaGainAmount,
        kvetkaGainAmount
      };
    });
    const addedCharacters = added.filter(function(entry){
      return onlineCardType(entry.card) !== 'Supporter';
    });
    if(!addedCharacters.length) return true;
    let preCinematicMs = 120;
    if(isConsolidation) {
      const tributes = Array.isArray(consolidationEvent?.tributes)
        ? consolidationEvent.tributes
        : (Array.isArray(action?.payload?.tributes) ? action.payload.tributes : []);
      preCinematicMs = Math.max(160, estimateOnlineConsolidationMotionMs({tributes}));
    }
    g._cinematicUiLockUntil = Math.max(
      Number(g._cinematicUiLockUntil) || 0,
      Date.now() + preCinematicMs + onlineConsolidationCinematicTotalMs() + 260
    );
    return true;
  }
  function scheduleOnlineLocalHandLimitPrompt(g, reason){
    const state = g || gameState();
    if(!state || !isOnlineMatchState(state) || typeof window.enforceHandLimit !== 'function') return false;
    const localIndex = Number.isInteger(Number(state._onlinePlayerIndex)) ? Number(state._onlinePlayerIndex) : null;
    if(localIndex === null || (state.players?.[localIndex]?.hand || []).length <= 12) return false;
    if(onlineHandLimitPromptTimer) clearTimeout(onlineHandLimitPromptTimer);
    const attempt = function(){
      onlineHandLimitPromptTimer = null;
      const latest = gameState();
      const hand = latest?.players?.[localIndex]?.hand || [];
      if(!latest || !isOnlineMatchState(latest) || hand.length <= 12) return;
      const modal = document.getElementById('modal');
      const handLimitOpen = !!modal?.querySelector?.('.hand-limit-discard');
      const anotherModalOpen = !!(modal?.classList?.contains('on') && !handLimitOpen);
      const cinematicOpen = !!(document.body?.classList?.contains('cinematic-lock') || Number(latest._cinematicUiLockUntil || 0) > Date.now());
      if(handLimitOpen){
        onlineHandLimitPromptTimer = setTimeout(attempt, 300);
        return;
      }
      if(anotherModalOpen || cinematicOpen){
        onlineHandLimitPromptTimer = setTimeout(attempt, 180);
        return;
      }
      try{
        window.enforceHandLimit(localIndex);
      }catch(e){
        console.warn('Online hand-limit discard prompt failed', e);
      }
      const opened = !!document.getElementById('modal')?.querySelector?.('.hand-limit-discard');
      onlineHandLimitPromptTimer = setTimeout(attempt, opened ? 300 : 180);
    };
    onlineHandLimitPromptTimer = setTimeout(attempt, 80);
    recordOnlineDiagnostic('online-hand-limit-prompt-scheduled', {
      playerIndex:localIndex,
      handCount:(state.players?.[localIndex]?.hand || []).length,
      reason:String(reason || '')
    });
    return true;
  }
  function boardSnapshotEntryAt(snapshot, z, r, c){
    if(!snapshot || typeof snapshot.forEach !== 'function') return null;
    let found = null;
    snapshot.forEach(function(entry){
      if(found || !entry) return;
      if(Number(entry.z) === Number(z) && Number(entry.r) === Number(r) && Number(entry.c) === Number(c)) found = entry;
    });
    return found;
  }
  function boardSnapshotHasCard(snapshot, card){
    if(!snapshot || typeof snapshot.forEach !== 'function' || !card) return false;
    const iid = String(card.iid || '');
    let found = false;
    snapshot.forEach(function(entry){
      if(found || !entry || !entry.card) return;
      if(iid && String(entry.card.iid || '') === iid) found = true;
    });
    return found;
  }
  function findNewOnlineCharacterEntry(g, previousBoard, playerIndex){
    if(!g || !g.board) return null;
    const owner = Number(playerIndex);
    let found = null;
    collectOnlineBoardSnapshot(g.board).forEach(function(entry){
      if(found || !entry || !entry.card) return;
      const card = entry.card;
      if(card.faceDown || onlineCardType(card) === 'Supporter') return;
      if(Number.isInteger(owner) && Number(card.owner) !== owner) return;
      if(boardSnapshotHasCard(previousBoard, card)) return;
      found = entry;
    });
    return found;
  }
  function onlineEffectiveActionType(action){
    const rawType = String(action?.type || '').toUpperCase();
    const payload = action?.payload || {};
    const actionKind = String(payload.actionKind || payload.originalType || '').toUpperCase();
    return rawType === 'ACTION_RESULT' && actionKind ? actionKind : rawType;
  }
  function onlineStateBoardCard(state, z, r, c){
    const raw = state?.board?.[z]?.[r]?.[c] || null;
    return raw ? expandOnlineCard(raw) : null;
  }
  function isLikelyOnlineConsolidationResult(action, card){
    if(!action || !card || card.faceDown || onlineCardType(card) === 'Supporter') return false;
    const type = onlineEffectiveActionType(action);
    const payload = action.payload || {};
    if(type === 'SELECT_CONSOLIDATION_TRIBUTE') return true;
    if(type !== 'CLICK_CELL' || payload.placing) return false;
    const selected = payload.selectedHand || {};
    if(selected.id && String(selected.id) === String(card.id || '')) return true;
    if(selected.iid && String(selected.iid) === String(card.iid || '')) return true;
    return false;
  }
  function showOnlineRemoteConsolidationCinematicForEntry(g, entry, action, reason, options){
    const forced = !!(options && options.force);
    if(!g || !entry || !entry.card || (!forced && !isRemoteOnlineAction(action)) || typeof window.showConsolidationCinematic !== 'function') return false;
    const card = entry.card;
    if(!forced && !isLikelyOnlineConsolidationResult(action, card)) return false;
    const played = g._onlineConsolidationCinematicsPlayed instanceof Set ? g._onlineConsolidationCinematicsPlayed : new Set();
    g._onlineConsolidationCinematicsPlayed = played;
    const key = [action?.seq || action?.payload?.clientActionId || reason || 'consolidation', card.iid || card.id || card.name || '', entry.z, entry.r, entry.c].join(':');
    if(played.has(key)) return false;
    played.add(key);
    const delayMs = Math.max(160, Number(options && options.delayMs) || 160);
    const waitForMotion = !!(options && options.waitForMotion);
    const maxWaitMs = Math.max(delayMs + 900, Number(options && options.maxWaitMs) || (delayMs + 2400));
    const scheduledAt = Date.now();
    const ownedLockUntil = scheduledAt + maxWaitMs + onlineConsolidationCinematicTotalMs();
    let motionIdleAt = 0;
    try{
      g._cinematicUiLockUntil = Math.max(g._cinematicUiLockUntil || 0, ownedLockUntil);
    }catch(e){}
    const showWhenReady = function(){
      if(waitForMotion){
        let motionActive = false;
        try{
          const director = window.FateVfxDirector;
          const presenter = window.FateActionPresentation;
          motionActive = !!(
            (director && typeof director.hasActiveEffects === 'function' && director.hasActiveEffects()) ||
            (presenter && typeof presenter.isActive === 'function' && presenter.isActive())
          );
        }catch(e){}
        const elapsed = Date.now() - scheduledAt;
        if(motionActive && elapsed < maxWaitMs){
          motionIdleAt = 0;
          setTimeout(showWhenReady, 60);
          return;
        }
        if(!motionIdleAt && elapsed < maxWaitMs){
          motionIdleAt = Date.now();
          setTimeout(showWhenReady, 140);
          return;
        }
        if(motionIdleAt && Date.now() - motionIdleAt < 120 && elapsed < maxWaitMs){
          setTimeout(showWhenReady, 40);
          return;
        }
      }
      try{
        if(Number(g._cinematicUiLockUntil || 0) <= ownedLockUntil + 80){
          g._cinematicUiLockUntil = Date.now() + onlineConsolidationCinematicTotalMs();
        }
        window.showConsolidationCinematic(card, {playVoice:true, playSfx:true, allowRenderV2Cinematic:true});
      }catch(e){
        console.warn('Online consolidation cinematic failed', e);
      }
    };
    setTimeout(showWhenReady, delayMs);
    recordOnlineDiagnostic('online-remote-consolidation-cinematic', {
      actionType:onlineEffectiveActionType(action),
      seq:Number(action?.seq || 0) || 0,
      cardId:String(card.id || ''),
      cardName:String(card.name || ''),
      z:entry.z,
      r:entry.r,
      c:entry.c,
      reason:String(reason || ''),
      delayMs,
      waitForMotion,
      maxWaitMs
    });
    return true;
  }
  function maybePlayMatchingHashConsolidationCinematic(action, reason){
    if(!isRemoteOnlineAction(action)) return false;
    const payload = action?.payload || {};
    const z = Number(payload.z), r = Number(payload.r), c = Number(payload.c);
    if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return false;
    const g = gameState();
    if(!g || !isOnlineMatchState(g)) return false;
    const card = (g.board?.[z]?.[r]?.[c] || onlineStateBoardCard(payload.postState, z, r, c));
    if(!card) return false;
    const ownerMatches = !Number.isInteger(Number(payload.playerIndex)) || Number(card.owner) === Number(payload.playerIndex);
    if(!ownerMatches) return false;
    const entry = {z, r, c, card};
    const emitted = emitOnlineRemoteConsolidationPresentation(g, entry, [], action, 'matching-consolidate');
    const cinematic = showOnlineRemoteConsolidationCinematicForEntry(g, entry, action, reason || 'matching authoritative consolidation', {
      waitForMotion:emitted,
      delayMs:160,
      maxWaitMs:estimateOnlineConsolidationMotionMs({tributes:[]}) + 1800
    });
    return !!(cinematic || emitted);
  }
  function maybePlayOnlineConsolidationCinematic(g, previousBoard, action, reason){
    if(!g || !isOnlineMatchState(g) || typeof window.showConsolidationCinematic !== 'function') return false;
    const payload = action?.payload || {};
    const type = onlineEffectiveActionType(action);
    if(type !== 'SELECT_CONSOLIDATION_TRIBUTE' && type !== 'CLICK_CELL') return false;
    if(type === 'CLICK_CELL' && payload.placing) return false;
    const localUid = window.FATE_ONLINE?.user?.uid || '';
    if(localUid && action?.uid === localUid) return false;
    const z = Number(payload.z), r = Number(payload.r), c = Number(payload.c);
    let entry = null;
    if(Number.isInteger(z) && Number.isInteger(r) && Number.isInteger(c)) {
      const cardAtTarget = g.board?.[z]?.[r]?.[c] || null;
      const ownerMatches = !Number.isInteger(Number(payload.playerIndex)) || Number(cardAtTarget?.owner) === Number(payload.playerIndex);
      const prior = boardSnapshotEntryAt(previousBoard, z, r, c);
      const isSamePriorCard = prior && prior.card && String(prior.card.iid || '') === String(cardAtTarget?.iid || '');
      if(cardAtTarget && !cardAtTarget.faceDown && onlineCardType(cardAtTarget) !== 'Supporter' && ownerMatches && !isSamePriorCard) {
        entry = {z, r, c, card:cardAtTarget};
      }
    }
    if(!entry) entry = findNewOnlineCharacterEntry(g, previousBoard, payload.playerIndex);
    return showOnlineRemoteConsolidationCinematicForEntry(g, entry, action, reason);
  }
  function maybePlayMatchingHashFreePlacementCinematic(action, reason){
    const g = gameState();
    renderOnlineAuthoritativeState(reason || 'authoritative matching state');
    const payload = action?.payload || {};
    const type = onlineEffectiveActionType(action);
    const isPlacement = type === 'PLACE_CARD' || (type === 'CLICK_CELL' && !!payload.placing);
    if(g && isPlacement && isRemoteOnlineAction(action)){
      const z = Number(payload.z), r = Number(payload.r), c = Number(payload.c);
      if(Number.isInteger(z) && Number.isInteger(r) && Number.isInteger(c)){
        const card = g.board?.[z]?.[r]?.[c] || onlineStateBoardCard(payload.postState, z, r, c);
        const ownerMatches = !Number.isInteger(Number(payload.playerIndex)) || Number(card?.owner) === Number(payload.playerIndex);
        if(card && ownerMatches){
          scheduleOnlineAutomaticPlacementPresentation(g, {z, r, c, card}, action, {
            delayMs:120,
            source:'online-matching-authoritative-placement'
          });
        }
      }
    }
    setTimeout(function(){
      scheduleOnlineLocalHandLimitPrompt(g || gameState(), (reason || 'authoritative matching state') + ':matching-hash');
      maybeShowServerPendingPrompts();
    }, 0);
  }
  function enterOnlineGameScreenFromAuthoritativeState(reason){
    const g = gameState();
    if(!g || !isOnlineMatchState(g)) return false;
    if(String(g.phase || '') !== 'main') return false;
    if(!isCoinScreenActive()) return false;
    if(typeof window.showScreen === 'function') window.showScreen('s-game');
    g._turnInputLockUntil = 0;
    g._aiRunning = false;
    g._aiAbort = false;
    g._aiAborted = false;
    g._aiTurnToken = 0;
    if(!g._onlineGameScreenEnteredFromAuthority){
      g._onlineGameScreenEnteredFromAuthority = true;
      const currentName = g.players?.[g.currentPlayer]?.name || `Player ${Number(g.currentPlayer || 0) + 1}`;
      if(typeof window.log === 'function') window.log('sys', 'Online match begins! ' + currentName + ' goes first.');
    }
    if(!g._isSpectator && g._onlineRole !== 'spectator' && typeof window.startTurnTimer === 'function') window.startTurnTimer();
    try {
      const perf = window.__fatePerf = window.__fatePerf || {};
      perf.onlineAuthorityEnteredGameScreen = { at:Date.now(), reason:String(reason || '') };
    } catch(e) {}
    return true;
  }
  function syncOnlineTurnTimerAfterAuthoritativeState(g, previous, reason){
    if(!g || !isOnlineMatchState(g) || String(g.phase || '') !== 'main') return false;
    if(g._isSpectator || g._onlineRole === 'spectator'){
      if(typeof window.stopTurnTimer === 'function') window.stopTurnTimer();
      return false;
    }
    if(!isGameScreenActive()) return false;
    const turnStartedAt = Number(g._turnStartedAt || 0) || 0;
    const prevTurnStartedAt = previous ? (Number(previous._turnStartedAt || 0) || 0) : 0;
    const key = [Number(g.turn || 0) || 0, Number(g.currentPlayer || 0) || 0, Math.floor(turnStartedAt / 1000)].join(':');
    const prevKey = previous ? [Number(previous.turn || 0) || 0, Number(previous.currentPlayer || 0) || 0, Math.floor(prevTurnStartedAt / 1000)].join(':') : '';
    if(g._onlineLastTurnTimerKey === key && prevKey === key) return false;
    g._onlineLastTurnTimerKey = key;
    g._turnInputLockUntil = 0;
    g._aiRunning = false;
    g._aiAbort = false;
    g._aiAborted = false;
    try{
      if(typeof window.startTurnTimer === 'function') window.startTurnTimer();
      const perf = window.__fatePerf = window.__fatePerf || {};
      perf.onlineAuthorityTurnTimerSync = {at:Date.now(), key, reason:String(reason || '')};
      return true;
    }catch(e){
      console.warn('Online turn timer sync failed', e);
      return false;
    }
  }
  function maybePlayOnlineYourTurnNotification(g, previous, reason){
    if(!g || !isOnlineMatchState(g) || !previous) return false;
    const localIndex = Number.isInteger(Number(g._onlinePlayerIndex)) ? Number(g._onlinePlayerIndex) : null;
    if(localIndex === null) return false;
    const previousPlayer = Number(previous.currentPlayer);
    const currentPlayer = Number(g.currentPlayer);
    const turnChanged = Number(previous.turn) !== Number(g.turn) || previousPlayer !== currentPlayer;
    if(!turnChanged || previousPlayer === localIndex || currentPlayer !== localIndex) return false;
    const key = [Number(g.turn || 0) || 0, currentPlayer, String(reason || '')].join(':');
    if(g._onlineLastYourTurnSfxKey === key) return false;
    g._onlineLastYourTurnSfxKey = key;
    setTimeout(function(){
      try {
        if(typeof window.playSfx === 'function') window.playSfx('turnChange');
      } catch(e) {}
    }, 80);
    try {
      const perf = window.__fatePerf = window.__fatePerf || {};
      perf.onlineYourTurnNotification = {at:Date.now(), key, reason:String(reason || '')};
    } catch(e) {}
    return true;
  }
  function playOnlineLocalEndTurnSfxOnce(g){
    if(!g || g._onlineApplyingRemoteAction || typeof window.playSfx !== 'function') return false;
    const localIndex = Number.isInteger(Number(g._onlinePlayerIndex)) ? Number(g._onlinePlayerIndex) : null;
    if(localIndex === null || Number(g.currentPlayer) !== localIndex) return false;
    const key = [
      String(g._onlineRoomCode || activeRoom || ''),
      Number(g.turn || 0) || 0,
      Number(g.currentPlayer || 0) || 0
    ].join(':');
    if(g._onlineLastLocalEndTurnSfxKey === key) return false;
    g._onlineLastLocalEndTurnSfxKey = key;
    try{
      const dedupeKey = 'end-turn:' + key;
      if(typeof window.playEndTurnSfxOnce === 'function') return window.playEndTurnSfxOnce(dedupeKey);
      window.playSfx('endTurn');
      return true;
    }catch(e){
      return false;
    }
  }
  function clearOnlinePendingPromptUi(g, reason){
    if(!g) return;
    const pendingLandscapePrompt = g._onlinePendingLandscapeZonePicker;
    const preserveLandscapePrompt = !!(
      pendingLandscapePrompt &&
      !pendingLandscapePrompt.submitted &&
      !pendingLandscapePrompt.resolved &&
      pendingLandscapePrompt.promptKey &&
      typeof window.fateIsLandscapeZonePromptGuarded === 'function' &&
      window.fateIsLandscapeZonePromptGuarded(pendingLandscapePrompt.promptKey)
    );
    const hadPendingUi = !!(
      g._onlinePendingModalActions ||
      g._onlinePendingPickCardsVisual ||
      g._onlinePendingZonePicker ||
      g._onlinePendingAffiliationPicker ||
      (g._onlinePendingLandscapeZonePicker && !preserveLandscapePrompt)
    );
    g._onlinePendingModalActions = null;
    g._onlinePendingPickCardsVisual = null;
    g._onlinePendingZonePicker = null;
    g._onlinePendingAffiliationPicker = null;
    g._onlinePendingLandscapeZonePicker = preserveLandscapePrompt ? pendingLandscapePrompt : null;
    if(hadPendingUi) {
      g._onlineShownServerCardPickPromptId = '';
      g._onlineShownServerZonePickPromptId = '';
      g._onlineShownServerMovePromptId = '';
      g._onlineShownServerModalPromptId = '';
      recordOnlineDiagnostic('online-pending-ui-cleared', {reason:String(reason || '')});
    }
    if(g._onlineHavanoReactionDeploying || g._onlineReactionPromptId || g._onlineReactionWaitingPromptId){
      g._onlineHavanoReactionDeploying = null;
      g._onlineReactionPromptId = '';
      g._onlineReactionWaitingPromptId = '';
      g._havanoDeploying = null;
      g.placing = false;
      try{ if(typeof window.clearPlaceHighlights === 'function') window.clearPlaceHighlights(); }catch(e){}
    }
  }
  function attachOnlinePostState(payload){
    const state = captureOnlineCanonicalState();
    if(!state) return payload;
    const safeState = onlineFirebaseSafeValue(state);
    payload.postState = safeState;
    payload.stateHash = onlineCanonicalStateHash(safeState);
    attachOnlineConsolidationPresentationEvent(payload, safeState);
    return payload;
  }
  function attachOnlineConsolidationPresentationEvent(payload, postState){
    const hint = payload && payload.consolidationPresentation;
    if(!hint || !postState) return false;
    const target = hint.target || {};
    const z = Number(target.z), r = Number(target.r), c = Number(target.c);
    if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return false;
    const resultCard = onlineStateBoardCard(postState, z, r, c) || expandOnlineCard(hint.resultCard || null);
    if(!resultCard || onlineCardType(resultCard) === 'Supporter') return false;
    const existing = Array.isArray(payload.presentationEvents) ? payload.presentationEvents : [];
    if(existing.some(event=>String(event?.type || '').toUpperCase() === 'CONSOLIDATION_COMPLETED')) return false;
    const event = {
      type:'CONSOLIDATION_COMPLETED',
      playerIndex:Number.isInteger(Number(hint.playerIndex)) ? Number(hint.playerIndex) : Number(payload.playerIndex),
      resultCard:compactOnlineCard(resultCard),
      target:{z, r, c},
      tributes:(Array.isArray(hint.tributes) ? hint.tributes : []).map(function(tribute, index){
        return {
          z:Number(tribute?.z),
          r:Number(tribute?.r),
          c:Number(tribute?.c),
          index,
          card:compactOnlineCard(tribute?.card || null)
        };
      }),
      localActorAlreadyPresented:!!hint.localActorAlreadyPresented,
      synthesized:true
    };
    payload.presentationEvents = existing.concat([event]);
    recordOnlineDiagnostic('online-consolidation-presentation-attached', {
      z,
      r,
      c,
      tributeCount:event.tributes.length,
      resultIid:String(resultCard.iid || ''),
      stateHash:String(payload.stateHash || '')
    });
    return true;
  }
  function applyOnlineCanonicalState(state, reason, action){
    const g = gameState();
    if(!g || !state) return false;
    rememberOnlineAuthorityBoardSnapshot(state, String(action?.serverStateHash || action?.payload?.stateHash || lastAuthorityStateHash || ''));
    const localBoardCardsBeforeApply = onlineBoardCardEntries(g.board).length;
    const incomingBoardCardsBeforeApply = onlineStateBoardCardCount(state);
    const actionType = String(action?.type || '').toUpperCase();
    const actionPayload = action?.payload || {};
    const movementRepairStateSync = actionType === 'STATE_SYNC'
      && String(actionPayload.sourceType || '').toUpperCase() === 'MORE_BOARD_CARDS_REPAIR'
      && /mov/i.test(String(actionPayload.sourceReason || ''));
    const movementProtectionAction = isMoreBoardMovementAction(action) || movementRepairStateSync;
    const desyncRecoveryProtectsMoreBoard = !g._isSpectator
      && localBoardCardsBeforeApply > incomingBoardCardsBeforeApply
      && shouldProtectLocalMoreBoardDuringDesync(reason, action)
      && protectOnlineMoreBoardSnapshot('desync-recovery', reason || 'online-desync-recovery', 120000, g.board);
    if(desyncRecoveryProtectsMoreBoard){
      recordOnlineDiagnostic('online-desync-local-more-board-protected', {
        reason:String(reason || ''),
        localBoardCards:localBoardCardsBeforeApply,
        incomingBoardCards:incomingBoardCardsBeforeApply,
        actionType
      });
    }
    const protectedPreference = activeOnlineProtectedBoardPreference();
    const protectedMovementBoard = protectedPreference && String(protectedPreference.kind || '') === 'movement'
      ? protectedPreference.board
      : null;
    const protectedMovementBoardCards = protectedMovementBoard ? Number(protectedPreference.count || 0) : 0;
    const protectedMovementLayout = protectedMovementBoard ? String(protectedPreference.layout || '') : '';
    const protectedMovementIdentity = protectedMovementBoard ? String(protectedPreference.identity || '') : '';
    const incomingBoardIdentity = onlineBoardIdentitySetSignature(state.board);
    const incomingBoardLayout = onlineBoardLayoutSignature(state.board);
    const protectedLocalMovementLayout = !g._isSpectator && !!(
      (hasOnlineMovementBoardPreference() || protectedMovementBoard) &&
      movementProtectionAction &&
      (
        (
          localBoardCardsBeforeApply === incomingBoardCardsBeforeApply &&
          onlineBoardIdentitySetSignature(g.board) &&
          onlineBoardIdentitySetSignature(g.board) === incomingBoardIdentity &&
          onlineBoardLayoutSignature(g.board) !== incomingBoardLayout
        ) ||
        (
          protectedMovementBoardCards === incomingBoardCardsBeforeApply &&
          protectedMovementIdentity &&
          protectedMovementIdentity === incomingBoardIdentity &&
          protectedMovementLayout &&
          protectedMovementLayout !== incomingBoardLayout
        )
      )
    );
    if(protectedLocalMovementLayout){
      recordOnlineDiagnostic('online-protected-local-movement-state-kept', {
        reason:String(reason || ''),
        actionType:String(action?.type || ''),
        boardCards:localBoardCardsBeforeApply
      });
      scheduleMoreBoardCardsAuthoritySync('protected-local-movement-authoritative-merge', 40);
      return false;
    }
    const incomingState = state;
    state = preferMoreOnlineBoardCards(state, g.board, reason || 'online-authoritative-state', action);
    const repairedMoreBoardCards = state !== incomingState;
    const previousLandscapeBgNum = Number(g.landscapeBgNum) || null;
    const previousTurnState = {turn:g.turn, currentPlayer:g.currentPlayer, phase:g.phase, _turnStartedAt:g._turnStartedAt};
    const previousBoard = collectOnlineBoardSnapshot(g.board);
    const previousHandFateByIid = new Map();
    (Array.isArray(g.players) ? g.players : []).forEach(function(player){
      (Array.isArray(player && player.hand) ? player.hand : []).forEach(function(card){
        const iid = String(card && card.iid || '');
        if(!iid) return;
        let shownFate = Math.max(0, Number(card.currentFate ?? card.fate) || 0);
        if(card._wciBonus && String(card.id || '') !== '76') shownFate += 2;
        previousHandFateByIid.set(iid, shownFate);
      });
    });
    const authoritativeHasServerPending = !!(
      state.pendingInteraction ||
      state._serverPendingReaction ||
      state._serverPendingModalAction ||
      state._serverPendingZonePick ||
      state._serverPendingMove ||
      state._serverPendingCardPick ||
      state._consolidating
    );
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
    g.players = syncOnlinePlayersInPlace(g.players, state.players || []);
    g.board = syncOnlineBoardInPlace(g.board, state.board, state);
    [
      'extraCells','extraRows','extraRowFullOwners','extraRowOwners','markSafeSquares','blockedCells','immuneCards','shieldWallZones',
      'fateModifiers','landscapeId','landscapeBgNum','_landscapeState','currentPlayer','turn','turnNumber','maxTurns','phase','selectedHandCard','selectedBoardCard',
      'placing','blockingCell','supportsPlacedThisTurn','maxSupportsPerTurn','extraSupportsThisTurn','pendingEffect','_turnStartedAt',
      'instanceCounter','damageDoneP','supportersSetP','supporterReinforcementSetP','_pendingSelvaSupportBoost','_selvaSupportBoosts','_supporterEffectsActivatedP','_snowyVillageUses','_landscapeChangeLocks','_balladEffects','_mailDeliveries','_blameGameEffects','_administrativeBloatEffects','_serverRngCounter','usMarinesUses','polishArmyUses','oppSuppressedNextTurn','suppressTarget','erbsActive',
      'p1Deck','p2Deck','majaEffectThisTurn','_artilleryLockedZone','_artilleryLockOwner','_artilleryLockTurnsLeft',
      '_artilleryEffectBlockLifted','_cardFateMap','_fortCalvinActive','_linaFreeIids','_serverFreePlacement','_polishUsedThisTurn',
      '_revealedCards','_riveraBuffs','_riveraActiveEffects','_skipImprovisorCheck','_skipReactions','pendingInteraction','_serverReactionSeq','_serverPendingReaction',
      '_serverPendingModalAction','_serverPendingZonePick','_serverPendingMove','_serverPendingCardPick','_westCaribNext',
      '_zimbabweUsedThisTurn','_consolidating','_wolfCreekMoving','_expMoving','_berkeleyMoving','_bh01Moving',
      '_landscapeMoving','_markSelecting','_havanoDeploying','_boardTargeting'
    ].forEach(function(k){
      if(Object.prototype.hasOwnProperty.call(state, k)) g[k] = cloneOnlinePlain(state[k]);
    });
    if(g._busserMoving || g._busserMovingCard){
      g._busserMoving = null;
      g._busserMovingCard = null;
      if(typeof window.clearPlaceHighlights === 'function') window.clearPlaceHighlights();
    }
    g._continuousDamageSources = new Set(Array.isArray(state._continuousDamageSources) ? state._continuousDamageSources : []);
    if(Array.isArray(g._linaFreeIids)) g._linaFreeIids = new Set(g._linaFreeIids);
    if(g._serverFreePlacement && String(g._serverFreePlacement.kind || '') === 'linaFreeSet'){
      if(!g._linaFreeIids || typeof g._linaFreeIids.add !== 'function') g._linaFreeIids = new Set();
      (Array.isArray(g.players) ? g.players : []).forEach(function(player){
        (Array.isArray(player && player.hand) ? player.hand : []).forEach(function(card){
          if(card && card._linaFree === true && card.iid !== undefined && card.iid !== null) g._linaFreeIids.add(card.iid);
        });
      });
    }
    if(g._consolidating && Array.isArray(g._consolidating.colomboRestrictionZones)){
      g._consolidating.colomboRestrictionZones = new Set(g._consolidating.colomboRestrictionZones);
    }
    clearCompletedOnlineConsolidationState(g, reason || 'authoritative state apply');
    if(String(g._serverPendingCardPick?.reason || '') === 'jorgeAlvarez'){
      clearLocalConsolidationSelection('jorge pending card pick authoritative state');
    } else {
      restoreLocalConsolidationSelection(g, reason || 'authoritative state apply');
    }
    if(previousTurnState && (Number(previousTurnState.turn) !== Number(g.turn) || Number(previousTurnState.currentPlayer) !== Number(g.currentPlayer))){
      if(!authoritativeHasServerPending) g._consolidating = null;
      g._busserMoving = null;
      g._busserMovingCard = null;
      if(!authoritativeHasServerPending){
        g._serverPendingMove = null;
        g._serverPendingZonePick = null;
        g._serverPendingCardPick = null;
        g._serverPendingModalAction = null;
        g._serverPendingReaction = null;
        g.pendingInteraction = null;
      }
      g._boardTargeting = null;
      g._markSelecting = null;
      g._havanoDeploying = null;
      g._onlineHavanoReactionDeploying = null;
      g._landscapeMoving = null;
      g.placing = false;
      g.selectedHandCard = null;
      g.selectedBoardCard = null;
      g.blockingCell = false;
      if(typeof window.clearPlaceHighlights === 'function') window.clearPlaceHighlights();
    }
    g.landscape = g.landscapeId && typeof LANDSCAPES !== 'undefined' ? LANDSCAPES[g.landscapeId] : null;
    Object.assign(g, keep);
    if(isOnlineMatchState(g) && Number.isInteger(g._onlinePlayerIndex) && Number(g.currentPlayer) !== Number(g._onlinePlayerIndex)){
      const hadLocalTransient = !!(
        (!authoritativeHasServerPending && g._consolidating) ||
        g._wolfCreekMoving ||
        g._expMoving ||
        g._berkeleyMoving ||
        g._bh01Moving ||
        g._landscapeMoving ||
        g._busserMoving ||
        g._busserMovingCard ||
        g._boardTargeting ||
        g._markSelecting ||
        g._havanoDeploying ||
        g._onlineHavanoReactionDeploying ||
        g.placing ||
        g.selectedHandCard !== null ||
        g.selectedBoardCard !== null
      );
      if(!authoritativeHasServerPending) g._consolidating = null;
      g._wolfCreekMoving = null;
      g._expMoving = null;
      g._berkeleyMoving = null;
      g._bh01Moving = null;
      g._landscapeMoving = null;
      g._busserMoving = null;
      g._busserMovingCard = null;
      g._boardTargeting = null;
      g._markSelecting = null;
      g._havanoDeploying = null;
      g._onlineHavanoReactionDeploying = null;
      g.placing = false;
      g.selectedHandCard = null;
      g.selectedBoardCard = null;
      g.blockingCell = false;
      if(hadLocalTransient && typeof window.clearPlaceHighlights === 'function') window.clearPlaceHighlights();
    }
    const localIndex = Number.isInteger(g._onlinePlayerIndex) ? Number(g._onlinePlayerIndex) : null;
    const pendingForPrompt = normalizedClientPendingInteraction(g);
    const pendingPlayer = Number(pendingForPrompt?.playerIndex);
    if(localIndex !== null && (!authoritativeHasServerPending || (Number.isInteger(pendingPlayer) && pendingPlayer !== localIndex))){
      clearOnlinePendingPromptUi(g, authoritativeHasServerPending ? 'pending belongs to opponent' : 'no authoritative pending prompt');
    }
    try{
      if(!g._isSpectator && typeof window.fateApplyLocalHandOrder === 'function') window.fateApplyLocalHandOrder(g, reason || 'online-authoritative-state');
    }catch(e){}
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
    enterOnlineGameScreenFromAuthoritativeState(reason || 'online-authoritative-state');
    syncOnlineTurnTimerAfterAuthoritativeState(g, previousTurnState, reason || 'online-authoritative-state');
    maybePlayOnlineYourTurnNotification(g, previousTurnState, reason || 'online-authoritative-state');
    const spectatorSnapshotBootstrap = !!(g._isSpectator && /spectator (initial|canonical recovery)/i.test(String(reason || '')));
    if(!spectatorSnapshotBootstrap) primeOnlineCharacterFatePresentationLock(g, previousBoard, action, previousHandFateByIid);
    if(!spectatorSnapshotBootstrap) maybePlayOnlineNewCharacterCinematic(g, previousBoard, action, reason || 'online-authoritative-state');
    renderOnlineAuthoritativeState(reason || 'online-authoritative-state');
    scheduleOnlineLocalHandLimitPrompt(g, reason || 'online-authoritative-state');
    if(typeof window.updateTopBar === 'function') window.updateTopBar();
    if(repairedMoreBoardCards){
      scheduleMoreBoardCardsAuthoritySync('more-board-cards-authoritative-merge', 80);
      if(clientResolvedGameplayEnabled()){
        scheduleClientResolvedAutoCommit('more-board-cards-authoritative-merge', 80);
      }
    }
    console.warn('Applied authoritative online state:', reason || 'state-sync');
    return true;
  }
  function reconcileOnlinePostState(action, reason){
    const payload = action?.payload || {};
    if(!payload.postState || !payload.stateHash) return false;
    const localState = captureOnlineCanonicalState();
    const localHash = onlineCanonicalStateHash(localState);
    if(localHash === payload.stateHash){
      maybeShowOnlinePresentationEvents(action);
      maybePlayMatchingHashFreePlacementCinematic(action, reason || ('matching postState seq ' + (action?.seq || '?')));
      if(payloadHasServerReactionWindow(payload)) forceServerPendingPromptChecks(reason || ('matching postState reaction seq ' + (action?.seq || '?')));
      return false;
    }
    const previousPresentation = collectOnlineRemotePresentationSnapshot(gameState());
    const previousFate = collectOnlineFateSnapshot(gameState()?.board);
    const applied = applyOnlineCanonicalState(payload.postState, reason || ('post-action mismatch ' + (action?.seq || '')), action);
    if(applied && !payloadHasServerReactionWindow(payload)) maybePlayOnlineRemoteStatePresentation(gameState(), previousPresentation, action, reason || ('post-action mismatch ' + (action?.seq || '?')));
    if(applied) maybeFlashOnlineTargetEffectDeltas(action, previousFate, reason || ('post-action mismatch ' + (action?.seq || '?')));
    if(applied) maybeFlashOnlineAutomaticEffectDeltas(action, previousFate, reason || ('post-action mismatch ' + (action?.seq || '?')));
    if(applied && payloadHasServerReactionWindow(payload)) forceServerPendingPromptChecks(reason || ('post-action reaction ' + (action?.seq || '?')));
    else if(applied) scheduleServerPendingPromptChecks(reason || ('post-action mismatch ' + (action?.seq || '?')));
    return applied;
  }

  function localOnlineStateMatchesHash(hash){
    if(!hash) return false;
    const localState = captureOnlineCanonicalState();
    return !!localState && onlineCanonicalStateHash(localState) === String(hash || '');
  }

  function shouldApplyServerStateDirectly(actionType, payload){
    if(/^(FORFEIT|MATCH_RESULT|DISCONNECT_TIMEOUT)$/i.test(String(actionType || ''))) return false;
    if(payload && payload.postState && payload.stateHash) return true;
    if(String(actionType || '').toUpperCase() === 'ACTION_RESULT'){
      return clientResolvedGameplayEnabled() && !!payload && !!payload.postState && !!payload.stateHash;
    }
    return isStrictCompactAuthorityAction(actionType)
      && !!payload
      && !!payload.postState
      && !!payload.stateHash
      && !firebaseActionFallbackAllowed();
  }

  function applyAuthoritativePostState(action, reason){
    const payload = action?.payload || {};
    if(!payload.postState || !payload.stateHash) return false;
    const seq = Number(action?.seq || 0) || 0;
    const actionType = String(action?.type || '').toUpperCase();
    const reactionChoiceResolution = actionType === 'REACTION_CHOICE';
    if(payloadHasServerReactionWindow(payload)){
      forceInstallOnlineImprovisorReactionFromPayload(action, reason || ('authoritative reaction payload seq ' + (seq || '?')));
    }
    if(seq && seq <= lastAppliedActionSeq){
      if(reactionChoiceResolution) maybeShowOnlineEffectNegatedBanner(action, reason || ('stale authoritative reaction choice seq ' + (seq || '?')));
      if(typeof recordOnlineDiagnostic === 'function') {
        recordOnlineDiagnostic('stale-authoritative-poststate-ignored', {
          seq,
          lastAppliedActionSeq,
          reason:String(reason || ''),
          stateHash:String(payload.stateHash || action?.serverStateHash || '')
        });
      }
      return false;
    }
    const hash = String(action?.serverStateHash || payload.stateHash || '');
    if(hash) lastAuthorityStateHash = hash;
    rememberOnlineAuthorityBoardSnapshot(payload.postState, hash || payload.stateHash);
    if(localOnlineStateMatchesHash(payload.stateHash)){
      const shownPresentationEvents = reactionChoiceResolution ? false : maybeShowOnlinePresentationEvents(action);
      if(!reactionChoiceResolution && !shownPresentationEvents) maybePlayMatchingHashConsolidationCinematic(action, reason || ('matching authoritative postState seq ' + (action?.seq || '?')));
      if(!reactionChoiceResolution) maybePlayMatchingHashFreePlacementCinematic(action, reason || ('authoritative postState seq ' + (action?.seq || '?')));
      if(reactionChoiceResolution) maybeShowOnlineEffectNegatedBanner(action, reason || ('matching authoritative reaction choice seq ' + (action?.seq || '?')));
      if(payloadHasServerReactionWindow(payload)) forceServerPendingPromptChecks(reason || ('matching authoritative reaction seq ' + (action?.seq || '?')));
      else scheduleServerPendingPromptChecks(reason || ('authoritative postState seq ' + (action?.seq || '?')));
      if(reactionChoiceResolution) maybeResumeAllowedOnlinePlacementEffect(action, reason || ('matching authoritative reaction choice seq ' + (action?.seq || '?')));
      return false;
    }
    const previousPresentation = collectOnlineRemotePresentationSnapshot(gameState());
    const previousFate = collectOnlineFateSnapshot(gameState()?.board);
    const applied = applyOnlineCanonicalState(payload.postState, reason || ('authoritative postState seq ' + (action?.seq || '?')), action);
    if(applied && !payloadHasServerReactionWindow(payload) && !reactionChoiceResolution) maybePlayOnlineRemoteStatePresentation(gameState(), previousPresentation, action, reason || ('authoritative postState seq ' + (action?.seq || '?')));
    if(applied) maybeFlashOnlineTargetEffectDeltas(action, previousFate, reason || ('authoritative postState seq ' + (action?.seq || '?')));
    if(applied) maybeFlashOnlineAutomaticEffectDeltas(action, previousFate, reason || ('authoritative postState seq ' + (action?.seq || '?')));
    if(applied && reactionChoiceResolution) maybeShowOnlineEffectNegatedBanner(action, reason || ('authoritative reaction choice seq ' + (action?.seq || '?')));
    if(applied && payloadHasServerReactionWindow(payload)) forceServerPendingPromptChecks(reason || ('authoritative reaction seq ' + (action?.seq || '?')));
    else if(applied) scheduleServerPendingPromptChecks(reason || ('authoritative postState seq ' + (action?.seq || '?')));
    if(applied && reactionChoiceResolution) maybeResumeAllowedOnlinePlacementEffect(action, reason || ('authoritative reaction choice seq ' + (action?.seq || '?')));
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
      scheduleServerPendingPromptChecks(reason || ('authoritative acknowledgement seq ' + (seq || '?')));
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

  function onlineImprovisorPromptId(pending){
    return String(pending?.promptId || '');
  }
  const onlineImprovisorSubmittedPromptIds = new Set();
  const onlineImprovisorPromptTimers = new Map();
  const onlineImprovisorResolutionPromptIds = new Set();
  let onlineImprovisorWaitingCatchupTimer = 0;
  let onlineImprovisorWaitingCatchupPromptId = '';
  let onlineImprovisorWaitingCatchupRunning = false;
  function trackOnlineImprovisorPromptTimer(promptId, timer){
    if(!promptId || !timer) return;
    const timers = onlineImprovisorPromptTimers.get(promptId) || new Set();
    timers.add(timer);
    onlineImprovisorPromptTimers.set(promptId, timers);
  }
  function clearOnlineImprovisorPromptTimers(promptId){
    if(!promptId){
      [...onlineImprovisorPromptTimers.keys()].forEach(clearOnlineImprovisorPromptTimers);
      return;
    }
    const timers = onlineImprovisorPromptTimers.get(promptId);
    if(timers) timers.forEach(timer=>clearInterval(timer));
    onlineImprovisorPromptTimers.delete(promptId);
  }
  function stopOnlineImprovisorWaitingCatchup(promptId){
    if(promptId && onlineImprovisorWaitingCatchupPromptId && String(promptId) !== onlineImprovisorWaitingCatchupPromptId) return;
    if(onlineImprovisorWaitingCatchupTimer) clearTimeout(onlineImprovisorWaitingCatchupTimer);
    onlineImprovisorWaitingCatchupTimer = 0;
    onlineImprovisorWaitingCatchupPromptId = '';
  }
  function scheduleOnlineImprovisorWaitingCatchup(g, promptId){
    const id = String(promptId || '');
    if(!id || !isOnlineMatchState(g)) return false;
    if(onlineImprovisorWaitingCatchupTimer && onlineImprovisorWaitingCatchupPromptId === id) return true;
    stopOnlineImprovisorWaitingCatchup();
    onlineImprovisorWaitingCatchupPromptId = id;
    const poll = async function(){
      onlineImprovisorWaitingCatchupTimer = 0;
      const latest = gameState();
      const pendingId = String(latest?._serverPendingReaction?.promptId || '');
      if(!isOnlineMatchState(latest) || pendingId !== id){
        stopOnlineImprovisorWaitingCatchup(id);
        if(isOnlineMatchState(latest)) syncOnlineImprovisorReactionUi('waiting authority catch-up resolved');
        return;
      }
      const code = latest?._onlineRoomCode || activeRoom;
      if(!onlineImprovisorWaitingCatchupRunning && code && authorityHttpBaseUrl() && !firebaseActionFallbackAllowed() && !(typeof document !== 'undefined' && document.hidden)){
        onlineImprovisorWaitingCatchupRunning = true;
        try{
          await ensureAuthorityJoined(code).catch(()=>false);
          await catchUpFlyAuthorityReplay(code, 'improvisor waiting watchdog ' + id, {
            includeState:true,
            limit:40,
            timeoutMs:5000
          });
        }catch(e){
          console.warn('Improvisor waiting authority catch-up failed', e);
        }finally{
          onlineImprovisorWaitingCatchupRunning = false;
        }
      }
      const after = gameState();
      if(String(after?._serverPendingReaction?.promptId || '') === id){
        onlineImprovisorWaitingCatchupTimer = setTimeout(poll, 1200);
      }else{
        stopOnlineImprovisorWaitingCatchup(id);
        if(isOnlineMatchState(after)) syncOnlineImprovisorReactionUi('waiting watchdog observed resolution');
      }
    };
    onlineImprovisorWaitingCatchupTimer = setTimeout(poll, 900);
    return true;
  }
  function onlineImprovisorModalPanel(){
    try{
      return document.querySelector('#online-improvisor-reaction-root[data-online-improvisor-prompt-id]');
    }catch(e){
      return null;
    }
  }
  function onlineImprovisorLegacyModalPanel(){
    try{
      return document.querySelector('#modal [data-online-improvisor-prompt-id]');
    }catch(e){
      return null;
    }
  }
  function mountOnlineImprovisorOverlay(mode, promptId, title, bodyHtml){
    let root = document.getElementById('online-improvisor-reaction-root');
    if(!root){
      root = document.createElement('div');
      root.id = 'online-improvisor-reaction-root';
      root.className = 'online-improvisor-reaction-root';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      document.body.appendChild(root);
    }
    root.setAttribute('data-online-improvisor-mode', String(mode || ''));
    root.setAttribute('data-online-improvisor-prompt-id', String(promptId || ''));
    root.setAttribute('aria-labelledby', 'online-improvisor-reaction-title');
    root.innerHTML =
      `<section class="online-improvisor-reaction-window ${mode === 'waiting' ? 'is-waiting' : 'is-choice'}">` +
        `<div class="online-improvisor-reaction-accent" aria-hidden="true"></div>` +
        `<h2 id="online-improvisor-reaction-title">${reactionEscapeHtml(title)}</h2>` +
        bodyHtml +
      `</section>`;
    document.documentElement.classList.add('online-improvisor-reaction-paused');
    return root;
  }
  function closeOnlineImprovisorModal(g, promptId){
    clearOnlineImprovisorPromptTimers(promptId || '');
    stopOnlineImprovisorWaitingCatchup(promptId || '');
    const panel = onlineImprovisorModalPanel();
    if(panel && (!promptId || panel.getAttribute('data-online-improvisor-prompt-id') === promptId)){
      try{ panel.remove(); }catch(e){}
      document.documentElement.classList.remove('online-improvisor-reaction-paused');
    }
    const legacyPanel = onlineImprovisorLegacyModalPanel();
    if(legacyPanel && (!promptId || legacyPanel.getAttribute('data-online-improvisor-prompt-id') === promptId)){
      try{
        const modalRoot = document.getElementById('modal');
        if(modalRoot?.classList.contains('on') && typeof window.closeModal === 'function') window.closeModal({silent:true});
        legacyPanel.remove();
      }catch(e){}
    }
    if(g){
      if(g._onlineImprovisorPlacementPromptTimer){
        clearTimeout(g._onlineImprovisorPlacementPromptTimer);
        g._onlineImprovisorPlacementPromptTimer = null;
      }
      if(g._onlineImprovisorReactionTimer){
        clearInterval(g._onlineImprovisorReactionTimer);
        g._onlineImprovisorReactionTimer = null;
      }
      if(g._onlineHavanoReactionDeploying && (!promptId || String(g._onlineHavanoReactionDeploying.promptId || '') === String(promptId || ''))){
        g._onlineHavanoReactionDeploying = null;
        g._havanoDeploying = null;
        g.placing = false;
        try{ if(typeof window.clearPlaceHighlights === 'function') window.clearPlaceHighlights(); }catch(e){}
      }
      if(!promptId || g._onlineReactionPromptId === promptId) g._onlineReactionPromptId = '';
      if(!promptId || g._onlineReactionWaitingPromptId === promptId) g._onlineReactionWaitingPromptId = '';
    }
  }
  function clearOnlineImprovisorHavanoDeployment(g, promptId){
    const state = g || gameState();
    if(state && (!promptId || String(state._onlineHavanoReactionDeploying?.promptId || '') === String(promptId || ''))){
      state._onlineHavanoReactionDeploying = null;
      state._havanoDeploying = null;
      state.placing = false;
    }
    try{ if(typeof window.clearPlaceHighlights === 'function') window.clearPlaceHighlights(); }catch(e){}
    try{
      if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function') {
        window.FateMatchRendererAdapter.scheduleRender('online-havano-deploy-clear');
      }
    }catch(e){}
    try{ if(typeof window.setHint === 'function') window.setHint('Select a card to play'); }catch(e){}
  }
  function showOnlineImprovisorHavanoDeploymentOptions(options){
    try{ if(typeof window.clearPlaceHighlights === 'function') window.clearPlaceHighlights(); }catch(e){}
    (Array.isArray(options) ? options : []).forEach(function(o){
      const el = document.querySelector('#board .cell[data-z="'+Number(o.z)+'"][data-r="'+Number(o.r)+'"][data-c="'+Number(o.c)+'"]');
      if(el) el.classList.add('placeable','havano-deploy-choice');
    });
    [...new Set((Array.isArray(options) ? options : []).map(o=>Number(o.z)).filter(Number.isInteger))].forEach(function(zi){
      const zoneEl = document.querySelector('#board .zone[data-zone="'+zi+'"], #board .zone[data-z="'+zi+'"]') || document.querySelectorAll('#board .zone, .board .zone')[zi];
      if(zoneEl) zoneEl.classList.add('busser-zone-target');
    });
    try{
      if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function') {
        window.FateMatchRendererAdapter.scheduleRender('online-havano-deploy-options');
      }
    }catch(e){}
  }
  function beginOnlineImprovisorHavanoDeployment(g, pending, localIndex, optionIndex, option){
    const promptId = onlineImprovisorPromptId(pending);
    const deploymentOptions = Array.isArray(option?.deploymentOptions) ? option.deploymentOptions : [];
    if(!promptId || !deploymentOptions.length){
      if(window.toast) toast('Havano Citizen has no open square to deploy.');
      return false;
    }
    if(g._onlineHavanoReactionDeploying && String(g._onlineHavanoReactionDeploying.promptId || '') === promptId){
      showOnlineImprovisorHavanoDeploymentOptions(g._onlineHavanoReactionDeploying.deploymentOptions || deploymentOptions);
      return true;
    }
    closeOnlineImprovisorModal(g, promptId);
    g._onlineHavanoReactionDeploying = {
      promptId,
      pending:cloneOnlinePlain(pending),
      localIndex:Number(localIndex),
      optionIndex:Number(optionIndex),
      deploymentOptions:cloneOnlinePlain(deploymentOptions),
      submitted:false
    };
    g._havanoDeploying = {
      online:true,
      promptId,
      options:g._onlineHavanoReactionDeploying.deploymentOptions
    };
    g.placing = true;
    try{
      if(typeof window.renderEffectResolutionForPlayer === 'function') window.renderEffectResolutionForPlayer(localIndex, {hand:true});
      else if(typeof window.renderGame === 'function') window.renderGame({board:true, hand:true, oppHand:true});
    }catch(e){}
    showOnlineImprovisorHavanoDeploymentOptions(deploymentOptions);
    if(window.toast) toast('Choose where to deploy Havano Citizen');
    if(typeof window.setHint === 'function') window.setHint('Havano Citizen: choose a highlighted contested or safe square.');
    recordOnlineDiagnostic('online-improvisor-havano-deploy-open', {
      promptId,
      localPlayerIndex:Number(localIndex),
      optionIndex:Number(optionIndex),
      deploymentCount:deploymentOptions.length
    });
    return true;
  }
  function handleOnlineImprovisorHavanoDeploymentClick(z, r, c){
    const g = gameState();
    const dep = g && g._onlineHavanoReactionDeploying;
    if(!dep) return false;
    if(dep.submitted) return true;
    const promptId = String(dep.promptId || '');
    const pending = dep.pending || g._serverPendingReaction || null;
    if(!pending || String(pending.promptId || '') !== promptId){
      clearOnlineImprovisorHavanoDeployment(g, promptId);
      if(window.toast) toast('Reaction expired.');
      return true;
    }
    const deployment = (Array.isArray(dep.deploymentOptions) ? dep.deploymentOptions : []).find(function(o){
      return Number(o.z) === Number(z) && Number(o.r) === Number(r) && Number(o.c) === Number(c);
    }) || null;
    if(!deployment){
      if(window.toast) toast('Choose one of the highlighted Havano squares');
      return true;
    }
    const occupied = !!(g.board && g.board[z] && g.board[z][r] && g.board[z][r][c]);
    if(occupied){
      if(window.toast) toast('Cell is not open');
      return true;
    }
    dep.submitted = true;
    clearOnlineImprovisorHavanoDeployment(g, promptId);
    sendOnlineImprovisorReactionChoice(g, pending, Number(dep.localIndex), 'negate', Number(dep.optionIndex), deployment);
    return true;
  }
  window.fateHandleOnlineImprovisorHavanoDeploymentClick = handleOnlineImprovisorHavanoDeploymentClick;
  function onlineImprovisorReactionPayload(pending, localIndex, choice){
    const promptId = onlineImprovisorPromptId(pending);
    const currentStateHash = onlineCanonicalStateHash(captureOnlineCanonicalState());
    return {
      playerIndex:localIndex,
      promptId,
      choice,
      baseStateHash:currentStateHash || lastAuthorityStateHash || '',
      clientActionId:'reaction:' + promptId + ':' + choice + ':' + Date.now()
    };
  }
  function sendOnlineImprovisorReactionChoice(g, pending, localIndex, choice, optionIndex, deployment){
    const promptId = onlineImprovisorPromptId(pending);
    if(!promptId || onlineImprovisorSubmittedPromptIds.has(promptId)) return false;
    onlineImprovisorSubmittedPromptIds.add(promptId);
    clearOnlineImprovisorPromptTimers(promptId);
    const options = Array.isArray(pending?.options) ? pending.options : [];
    const payload = onlineImprovisorReactionPayload(pending, localIndex, choice);
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
    if(g) g._onlineImprovisorChoiceSubmittedPromptId = promptId;
    closeOnlineImprovisorModal(g, promptId);
    sendAction('REACTION_CHOICE', payload).catch(err=>{
      console.warn('Server reaction choice failed', err);
      onlineImprovisorSubmittedPromptIds.delete(promptId);
      if(g){
        if(String(g._onlineImprovisorChoiceSubmittedPromptId || '') === promptId){
          g._onlineImprovisorChoiceSubmittedPromptId = '';
        }
        g._onlineReactionPromptId = '';
      }
      scheduleServerPendingPromptChecks('improvisor reaction choice failed');
      if(window.toast) toast('Reaction choice failed');
    });
    return true;
  }
  function onlineImprovisorReactionButtons(pending){
    const options = Array.isArray(pending?.options) ? pending.options : [];
    const sourceName = pending?.sourceName || 'that effect';
    return options.map((option, idx) => {
      const label = reactionOptionLabel(option);
      const img = option?.card?.img
        ? `<img src="${reactionEscapeHtml(option.card.img)}" alt="${reactionEscapeHtml(label)}">`
        : `<span>${reactionEscapeHtml((label || '?').slice(0, 1))}</span>`;
      if(String(option?.kind || '') === 'havano'){
        const deploymentOptions = Array.isArray(option.deploymentOptions) ? option.deploymentOptions : [];
        if(!deploymentOptions.length){
          return `<button class="reaction-choice-card" type="button" data-server-reaction-idx="${idx}" disabled aria-disabled="true">` +
            `<span class="reaction-choice-art">${img}</span>` +
            `<span class="reaction-choice-copy"><b>${reactionEscapeHtml(label)}</b><em>Negate ${reactionEscapeHtml(sourceName)}</em><small>No deployment square available</small></span>` +
          `</button>`;
        }
        return `<button class="reaction-choice-card" type="button" data-server-reaction-idx="${idx}" data-server-reaction-havano="1">` +
          `<span class="reaction-choice-art">${img}</span>` +
          `<span class="reaction-choice-copy"><b>${reactionEscapeHtml(label)}</b><em>Negate and deploy</em><small>Choose a highlighted board square</small></span>` +
        `</button>`;
      }
      const loc = Number.isInteger(Number(option.z)) ? `Zone ${Number(option.z) + 1}` : 'Board';
      return `<button class="reaction-choice-card" type="button" data-server-reaction-idx="${idx}">` +
        `<span class="reaction-choice-art">${img}</span>` +
        `<span class="reaction-choice-copy"><b>${reactionEscapeHtml(label)}</b><em>Negate ${reactionEscapeHtml(sourceName)}</em><small>${reactionEscapeHtml(loc)}</small></span>` +
      `</button>`;
    }).join('');
  }
  function showOnlineImprovisorChoiceWindow(g, pending, localIndex, reason){
    const promptId = onlineImprovisorPromptId(pending);
    if(!promptId) return false;
    if(onlineImprovisorSubmittedPromptIds.has(promptId)) return true;
    const existing = onlineImprovisorModalPanel() || onlineImprovisorLegacyModalPanel();
    if(existing && existing.getAttribute('data-online-improvisor-prompt-id') === promptId && existing.getAttribute('data-online-improvisor-mode') === 'choice') return true;
    closeOnlineImprovisorModal(g);
    g._onlineReactionPromptId = promptId;
    g._onlineReactionWaitingPromptId = '';
    const options = Array.isArray(pending.options) ? pending.options : [];
    const sourceName = pending.sourceName || 'that effect';
    let countdown = Math.max(5, Math.round(Number(pending.timeoutMs || 15000) / 1000));
    let timer = null;
    let finished = false;
    const finish = (choice, optionIndex, deployment) => {
      if(finished || onlineImprovisorSubmittedPromptIds.has(promptId)) return;
      finished = true;
      if(timer) clearInterval(timer);
      if(g._onlineImprovisorReactionTimer === timer) g._onlineImprovisorReactionTimer = null;
      sendOnlineImprovisorReactionChoice(g, pending, localIndex, choice, optionIndex, deployment);
    };
    const title = () => `React? (${countdown}s)`;
    recordOnlineDiagnostic('online-improvisor-choice-open', {
      reason:String(reason || ''),
      promptId,
      localPlayerIndex:localIndex,
      optionKinds:options.map(option=>String(option?.kind || '')).filter(Boolean)
    });
    if(typeof window.showModal !== 'function') return false;
    window.showModal(
      title(),
      `<div class="reaction-panel reaction-choice-panel" data-online-improvisor-mode="choice" data-online-improvisor-prompt-id="${reactionEscapeHtml(promptId)}" data-server-reaction-prompt-id="${reactionEscapeHtml(promptId)}">` +
        `<div class="reaction-choice-head">` +
          `<div class="reaction-kicker">Improvisor Reaction</div>` +
          `<div class="reaction-prompt"><span>Opponent played</span><strong>${reactionEscapeHtml(sourceName)}</strong><span>Choose who responds.</span></div>` +
        `</div>` +
        `<div class="reaction-choice-grid">${onlineImprovisorReactionButtons(pending)}</div>` +
        `<div class="online-improvisor-reaction-footer">` +
          `<div id="server-reaction-timer" class="reaction-timer">${countdown}s</div>` +
        `</div>` +
      `</div>`,
      [
        {label:'Allow Effect', silent:true, action:function(){ finish('decline'); }}
      ],
      {immediate:true, silentOpen:true}
    );
    const modalBox = document.querySelector('#modal .modal');
    if(modalBox) modalBox.classList.add('reaction-choice-modal');
    setTimeout(function(){
      document.querySelectorAll('#modal [data-server-reaction-idx]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const idx = Number(btn.getAttribute('data-server-reaction-idx'));
          if(!Number.isInteger(idx)) return;
          const option = options[idx] || {};
          if(String(option.kind || '') === 'havano' || btn.getAttribute('data-server-reaction-havano') === '1'){
            if(beginOnlineImprovisorHavanoDeployment(g, pending, localIndex, idx, option)){
              finished = true;
              if(timer) clearInterval(timer);
              if(g._onlineImprovisorReactionTimer === timer) g._onlineImprovisorReactionTimer = null;
            }
            return;
          }
          const deployIdxRaw = btn.getAttribute('data-server-reaction-deploy');
          let deployment = null;
          if(deployIdxRaw !== null){
            const deployIdx = Number(deployIdxRaw);
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
      if(titleEl) titleEl.textContent = title();
      if(countdown <= 0) finish('timeout');
    }, 1000);
    trackOnlineImprovisorPromptTimer(promptId, timer);
    g._onlineImprovisorReactionTimer = timer;
    return true;
  }
  function showOnlineImprovisorWaitingWindow(g, pending, localIndex, reason){
    const promptId = onlineImprovisorPromptId(pending);
    if(!promptId) return false;
    const existing = onlineImprovisorModalPanel();
    if(existing && existing.getAttribute('data-online-improvisor-prompt-id') === promptId && existing.getAttribute('data-online-improvisor-mode') === 'waiting'){
      scheduleOnlineImprovisorWaitingCatchup(g, promptId);
      return true;
    }
    closeOnlineImprovisorModal(g);
    g._onlineReactionPromptId = '';
    g._onlineReactionWaitingPromptId = promptId;
    const sourceName = pending.sourceName || 'that effect';
    recordOnlineDiagnostic('online-improvisor-waiting-open', {
      reason:String(reason || ''),
      promptId,
      localPlayerIndex:localIndex,
      pendingPlayerIndex:coerceOnlinePlayerIndex(pending.playerIndex)
    });
    mountOnlineImprovisorOverlay(
      'waiting',
      promptId,
      'Waiting for reaction',
      `<div id="online-reaction-waiting-panel" class="reaction-panel reaction-waiting-panel" data-online-improvisor-mode="waiting" data-online-improvisor-prompt-id="${reactionEscapeHtml(promptId)}">` +
        `<div class="reaction-waiting-orb" aria-hidden="true"><span></span></div>` +
        `<div class="reaction-choice-head">` +
          `<div class="reaction-kicker">Improvisor Reaction</div>` +
          `<div class="reaction-prompt"><span>Opponent may respond to</span><strong>${reactionEscapeHtml(sourceName)}</strong><span>Resolving...</span></div>` +
        `</div>` +
        `<div class="reaction-waiting-bar" aria-hidden="true"><span></span></div>` +
      `</div>`
    );
    scheduleOnlineImprovisorWaitingCatchup(g, promptId);
    return true;
  }
  function syncOnlineImprovisorReactionUi(reason){
    const g = gameState();
    if(!isOnlineMatchState(g)) return false;
    const pending = g._serverPendingReaction;
    if(!pending || typeof pending !== 'object'){
      const submittedPromptId = String(g._onlineImprovisorChoiceSubmittedPromptId || '');
      if(submittedPromptId){
        onlineImprovisorSubmittedPromptIds.delete(submittedPromptId);
        clearOnlineImprovisorPromptTimers(submittedPromptId);
      }
      g._onlineImprovisorChoiceSubmittedPromptId = '';
      closeOnlineImprovisorModal(g);
      return false;
    }
    const promptId = onlineImprovisorPromptId(pending);
    const localIndex = resolveOnlineLocalPlayerIndex('improvisor reaction ui');
    const pendingIndex = coerceOnlinePlayerIndex(pending.playerIndex);
    recordOnlineDiagnostic('online-improvisor-ui-sync', {
      reason:String(reason || ''),
      promptId,
      pendingPlayerIndex:pendingIndex,
      localPlayerIndex:localIndex,
      applyingRemote:!!g._onlineApplyingRemoteAction,
      optionKinds:(Array.isArray(pending.options) ? pending.options : []).map(option=>String(option?.kind || '')).filter(Boolean)
    });
    if(!promptId || pendingIndex === null) return false;
    if(onlineImprovisorSubmittedPromptIds.has(promptId) || String(g._onlineImprovisorChoiceSubmittedPromptId || '') === promptId){
      closeOnlineImprovisorModal(g, promptId);
      return true;
    }
    if(g._onlineApplyingRemoteAction){
      setTimeout(()=>syncOnlineImprovisorReactionUi('remote apply finished retry'), 40);
      return false;
    }
    if(String(pending.actionType || '') === 'first_set_effect'){
      const waitMs = Math.max(0, Number(g._cinematicUiLockUntil || 0) - Date.now());
      if(waitMs > 20){
        if(!g._onlineImprovisorPlacementPromptTimer){
          g._onlineImprovisorPlacementPromptTimer = setTimeout(function(){
            g._onlineImprovisorPlacementPromptTimer = null;
            syncOnlineImprovisorReactionUi('placement cinematic finished');
          }, Math.min(waitMs + 24, 2800));
        }
        return true;
      }
    }
    if(localIndex === null){
      return showOnlineImprovisorWaitingWindow(g, pending, null, reason);
    }
    if(g._onlineHavanoReactionDeploying && String(g._onlineHavanoReactionDeploying.promptId || '') === promptId){
      return true;
    }
    return pendingIndex === localIndex
      ? showOnlineImprovisorChoiceWindow(g, pending, localIndex, reason)
      : showOnlineImprovisorWaitingWindow(g, pending, localIndex, reason);
  }

  function maybeShowServerReactionPrompt(){
    return syncOnlineImprovisorReactionUi('server pending prompt');
  }
  function maybeShowServerReactionWaitingPrompt(){
    return syncOnlineImprovisorReactionUi('server pending waiting prompt');
  }
  window.fateGetOnlineImprovisorDebug = function(){
    const g = gameState();
    const panel = onlineImprovisorModalPanel();
    const overlay = document.getElementById('online-improvisor-reaction-root');
    const modal = document.getElementById('modal');
    const perf = window.__fatePerf || {};
    const timeline = Array.isArray(perf.onlineDiagnosticsTimeline) ? perf.onlineDiagnosticsTimeline : [];
    return {
      isOnline:!!isOnlineMatchState(g),
      roomCode:String(g?._onlineRoomCode || activeRoom || ''),
      localPlayerIndex:resolveOnlineLocalPlayerIndex('improvisor debug'),
      currentPlayer:coerceOnlinePlayerIndex(g?.currentPlayer),
      pendingReaction:cloneOnlinePlain(g?._serverPendingReaction || null),
      pendingInteraction:cloneOnlinePlain(g?.pendingInteraction || null),
      promptId:String(g?._onlineReactionPromptId || ''),
      waitingPromptId:String(g?._onlineReactionWaitingPromptId || ''),
      modalOpen:!!overlay || !!document.querySelector('#modal.on'),
      modalHasImprovisorPanel:!!panel,
      modalMode:String(panel?.getAttribute('data-online-improvisor-mode') || ''),
      modalPromptId:String(panel?.getAttribute('data-online-improvisor-prompt-id') || ''),
      modalText:String(overlay?.textContent || modal?.textContent || '').slice(0, 600),
      diagnostics:timeline.filter(entry => {
        const event = String(entry?.event || '');
        return event.includes('improvisor') || event.includes('reaction') || event.includes('server-pending');
      }).slice(-40)
    };
  };
  function serverPendingCardMatchesFilters(card, pending){
    if(!card || !pending) return false;
    if(pending.filterType && onlineCardType(card) !== String(pending.filterType)) return false;
    if(pending.filterAff && String(card.aff || '') !== String(pending.filterAff)) return false;
    if(pending.filterRarity && String(card.rarity || '') !== String(pending.filterRarity)) return false;
    if(pending.excludeRarity && String(card.rarity || '') === String(pending.excludeRarity)) return false;
    if(pending.excludeId && String(card.id || '') === String(pending.excludeId)) return false;
    if(pending.characterOnly && onlineCardType(card) === 'Supporter') return false;
    return true;
  }
  function serverPendingCardPickCandidate(card, source, index){
    if(!card) return null;
    return Object.assign({}, card, {
      _serverPickSource:String(source || ''),
      _serverPickIndex:Number(index)
    });
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
      const hand = Array.isArray(player.hand) ? player.hand : [];
      return hand
        .map((card, index)=>serverPendingCardMatchesFilters(card, pending) ? serverPendingCardPickCandidate(card, 'hand', index) : null)
        .filter(Boolean);
    }
    const sources = String(pending?.source || 'deck').split('+').map(s=>s.trim()).filter(Boolean);
    const cards = [];
    sources.forEach(source=>{
      const pile = source === 'discard' ? player.discard : player.deck;
      if(!Array.isArray(pile)) return;
      pile.forEach((card, index)=>{
        if(serverPendingCardMatchesFilters(card, pending)) cards.push(serverPendingCardPickCandidate(card, source, index));
      });
    });
    return cards;
  }
  function serverPendingCardPickTitle(pending){
    const reason = String(pending?.reason || pending?.kind || '');
    if(reason === 'ibStudent') return 'Search deck for a Supporter:';
    if(reason === 'crossroadsWorker') return 'Add a Supporter from discard to hand:';
    if(reason === 'greatOakHighSchooler') return 'Home of the Wolfpack';
    if(reason === 'handLimit') return 'Discard Down to 12';
    if(reason === 'handDiscard') return 'Discard cards';
    if(reason === 'handDiscardBoost') return 'Choose cards';
    if(reason === 'mailDelivery') return 'Mail Delivery';
    if(String(pending?.kind || '') === 'linaFreeSet') return 'Choose a Reality card';
    if(String(pending?.kind || '') === 'kvetkaFreeSet') return 'Flower Picking';
    return 'Choose cards';
  }
  function serverPendingCardPickSubtitle(pending){
    const source = String(pending?.source || '');
    if(String(pending?.reason || '') === 'ibStudent'){
      const maxCount = Math.max(1, Number(pending?.maxCount || 1) || 1);
      const type = pending?.filterType || 'Supporter';
      return `From your deck - up to ${maxCount} ${type}(s)`;
    }
    if(String(pending?.kind || '') === 'kvetkaFreeSet') return 'Choose an Expanded Worlds Character to set for free';
    if(String(pending?.reason || '') === 'handLimit') return 'Your hand is over 12 cards';
    if(source) return source === 'deck+discard' ? 'Search deck and discard' : 'From your ' + source;
    if(String(pending?.kind || '').startsWith('hand')) return 'From your hand';
    return 'Choose cards';
  }
  function serverPendingCardPickConfirmLabel(pending){
    const reason = String(pending?.reason || '');
    const kind = String(pending?.kind || '');
    if(reason === 'ibStudent' || reason === 'crossroadsWorker' || reason === 'greatOakHighSchooler') return 'Add to Hand';
    if(kind === 'kvetkaFreeSet') return 'Set for Free';
    if(kind === 'handDiscard') return 'Discard';
    return 'Choose';
  }
  function serverCardPickPromptIsVisible(promptKey){
    const key = String(promptKey || '');
    const modal = document.getElementById('modal');
    if(!key || !modal || !modal.classList.contains('on')) return false;
    if(String(modal.getAttribute('data-online-server-card-pick-prompt') || '') !== key) return false;
    return !!document.querySelector('#modal .visual-picker-body');
  }
  function markServerCardPickPromptVisible(promptKey){
    const key = String(promptKey || '');
    const modal = document.getElementById('modal');
    if(!key || !modal) return;
    modal.setAttribute('data-online-server-card-pick-prompt', key);
  }
  function serverPromptId(pending, fallback){
    return String(pending?.promptId || '') || String(fallback || '');
  }
  function withOnlinePromptBypass(g, fn){
    if(!g || typeof fn !== 'function') return;
    g._onlineServerPromptBypass = true;
    window.__fateOnlineServerPromptBypass = true;
    try{ return fn(); }
    finally{
      g._onlineServerPromptBypass = false;
      window.__fateOnlineServerPromptBypass = false;
    }
  }
  function sendServerPendingAction(type, pending, extra, label){
    const latest = gameState();
    const localIndex = onlineLocalPlayerIndex();
    if(!latest || localIndex === null) return;
    const payload = Object.assign({
      playerIndex:localIndex,
      turn:latest.turn || 0,
      promptId:String(pending?.promptId || ''),
      baseStateHash:lastAuthorityStateHash || onlineCanonicalStateHash(captureOnlineCanonicalState()),
      clientActionId:String(type || 'SERVER_PROMPT') + ':' + (pending?.promptId || pending?.kind || 'pending') + ':' + Date.now()
    }, extra || {});
    if(/^(CLICK_CELL|SELECT_PENDING_MOVE_CELL)$/i.test(String(type || '')) && /move|pickMove/i.test(String(pending?.kind || ''))){
      payload.pendingMove = true;
      noteOnlineMoreBoardPreference('movement', 'server-pending-move-choice', 30000);
    }
    sendAction(type, payload).catch(err=>{
      console.warn((label || 'Server prompt') + ' failed', err);
      if(window.toast) toast((label || 'Choice') + ' failed');
    });
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
    if(g._onlineShownServerCardPickPromptId === promptKey && serverCardPickPromptIsVisible(promptKey)) return;
    if(g._onlineShownServerCardPickPromptId === promptKey){
      recordOnlineDiagnostic('server-card-pick-prompt-reopen-missing-modal', {
        promptKey,
        kind:String(pending.kind || ''),
        reason:String(pending.reason || '')
      });
    }
    const cards = serverPendingCardPickCandidates(g, pending);
    const minCount = Math.max(0, Number(pending.minCount || 0) || 0);
    const maxCount = Math.max(minCount, Number(pending.maxCount || minCount || 1) || 1);
    g._onlineShownServerCardPickPromptId = promptKey;
    withOnlinePromptBypass(g, function(){
      window.pickCardsVisual(cards, {
        title:serverPendingCardPickTitle(pending),
        subtitle:serverPendingCardPickSubtitle(pending),
        minCount,
        maxCount,
        confirmLabel:serverPendingCardPickConfirmLabel(pending),
        immediate:true
      }, function(chosen){
        sendServerPendingAction('PICK_CARDS_VISUAL', pending, {
          selectedCards:(chosen || []).map(cardIdentity)
        }, 'Card choice');
      });
      markServerCardPickPromptVisible(promptKey);
    });
  }
  function serverZonePickTitle(pending){
    const kind = String(pending?.kind || '');
    if(kind === 'ledgerKeepersCopyWhenSet') return 'Ledger-keepers';
    if(kind === 'frenchFusiliersCopyPassive') return 'French Fusiliers';
    if(kind === 'mariaSongCopies') return 'Maria Song';
    if(kind === 'vigilantesMark') return 'Vigilantes';
    if(kind === 'wolfCreekSelectMoveTarget') return 'Wolf Creek';
    if(kind === 'juanCarlosSelectMoveTarget') return 'Juan Carlos';
    if(kind === 'breakfastBusserGrantMove' || kind === 'breakfastBusserSelectSupporter') return 'Breakfast Republic Busser';
    if(kind === 'westCoastDreamingBonus') return 'West Coast Dreaming';
    if(kind === 'minaeDiscardSupporter') return 'MINAE Death Squad';
    if(kind === 'makennaImmune') return 'Makenna';
    return 'Select Target';
  }
  function serverZonePickPrompt(pending){
    const kind = String(pending?.kind || '');
    if(kind === 'ledgerKeepersCopyWhenSet') return 'Choose a Supporter effect to copy';
    if(kind === 'frenchFusiliersCopyPassive') return 'Choose a Supporter passive to copy';
    if(kind === 'mariaSongCopies') return 'Choose an opponent card';
    if(kind === 'vigilantesMark') return 'Choose an opponent Supporter in this zone';
    if(kind === 'wolfCreekSelectMoveTarget') return 'Choose a highlighted friendly card in this zone';
    if(kind === 'juanCarlosSelectMoveTarget') return 'Choose an opponent card to move';
    if(kind === 'breakfastBusserGrantMove') return 'Choose a friendly card to gain movement';
    if(kind === 'breakfastBusserSelectSupporter') return 'Choose a friendly Supporter';
    if(kind === 'westCoastDreamingBonus') return 'Choose a card to gain 3 Fate';
    if(kind === 'minaeDiscardSupporter') return 'Choose an opponent Supporter';
    if(kind === 'makennaImmune') return 'Choose friendly cards to make immune';
    if(kind === 'liberatorsFateGain') return 'Choose a card to gain 3 Fate';
    if(kind === 'howardFateDouble') return 'Choose a card to double its Fate';
    if(kind === 'hemorrhagingWound') return 'Choose any card to lose 3 Fate';
    if(kind === 'santiagoHalveFate') return 'Choose an opponent card in the contested row';
    if(kind === 'apparitionDiscardDraw') return 'Choose a friendly character to discard';
    return 'Choose a target';
  }
  function serverZoneEntryAllowed(g, pending, card, z, r, c){
    if(!card) return false;
    const kind = String(pending?.kind || '');
    const playerIndex = Number(pending?.playerIndex);
    const opponent = playerIndex === 0 ? 1 : 0;
    const sourceIid = String(pending?.iid || pending?.sourceIid || '');
    if(kind === 'makennaImmune') return Number(card.owner) === playerIndex;
    if(kind === 'liberatorsFateGain') return true;
    if(kind === 'howardFateDouble') return card.immuneFlag !== true && String(card.id || '') !== '76';
    if(kind === 'hemorrhagingWound') return card.immuneFlag !== true && String(card.id || '') !== '76';
    if(kind === 'santiagoHalveFate') return Number(card.owner) === opponent && Number(r) === 1 && card.immuneFlag !== true && String(card.id || '') !== '76';
    if(kind === 'apparitionDiscardDraw') return Number(card.owner) === playerIndex && onlineCardType(card) !== 'Supporter' && (!sourceIid || String(card.iid || '') !== sourceIid);
    if(kind === 'minaeDiscardSupporter') return Number(card.owner) === opponent && onlineCardType(card) === 'Supporter' && !(typeof isTargetImmuneToEffectOwner === 'function' && isTargetImmuneToEffectOwner(card, playerIndex));
    if(kind === 'mariaSongCopies') return Number(card.owner) === opponent;
    if(kind === 'vigilantesMark') return Number(card.owner) === opponent && onlineCardType(card) === 'Supporter' && card.immuneFlag !== true && String(card.id || '') !== '76';
    if(kind === 'wolfCreekSelectMoveTarget') return Number(z) === Number(pending?.z) && Number(card.owner) === playerIndex && card.cantBeMoved !== true;
    if(kind === 'juanCarlosSelectMoveTarget') return Number(card.owner) === opponent && card.cantBeMoved !== true;
    if(kind === 'breakfastBusserGrantMove') return Number(card.owner) === playerIndex && card.faceDown !== true && card.cantBeMoved !== true && card.immuneFlag !== true && String(card.id || '') !== '76';
    if(kind === 'breakfastBusserSelectSupporter') return Number(card.owner) === playerIndex && onlineCardType(card) === 'Supporter' && (!sourceIid || String(card.iid || '') !== sourceIid);
    return true;
  }
  function serverZonePickEntries(g, pending){
    const entries = [];
    const seen = new Set();
    const addEntry = (z, r, c)=>{
      const zi = Number(z), ri = Number(r), ci = Number(c);
      if(!Number.isInteger(zi) || !Number.isInteger(ri) || !Number.isInteger(ci)) return;
      const card = g?.board?.[zi]?.[ri]?.[ci] || null;
      if(!card) return;
      const key = zi + ':' + ri + ':' + ci;
      if(seen.has(key)) return;
      if(!serverZoneEntryAllowed(g, pending, card, zi, ri, ci)) return;
      seen.add(key);
      entries.push({card, z:zi, r:ri, c:ci});
    };
    if(Array.isArray(pending?.options) && pending.options.length){
      pending.options.forEach(option=>addEntry(option.z, option.r, option.c));
      return entries;
    }
    const zoneOnly = Number(pending?.z);
    const zones = Number.isInteger(zoneOnly) ? [zoneOnly] : [0, 1, 2];
    zones.forEach(z=>{
      const zone = g?.board?.[z] || [];
      zone.forEach((row, r)=>Array.isArray(row) && row.forEach((card, c)=>{ if(card) addEntry(z, r, c); }));
    });
    return entries;
  }
  function maybeShowServerZonePickPrompt(){
    const g = gameState();
    if(!isOnlineMatchState(g)) return;
    const pending = g._serverPendingZonePick;
    if(!pending || typeof pending !== 'object'){
      g._onlineShownServerZonePickPromptId = '';
      return;
    }
    const localIndex = onlineLocalPlayerIndex();
    if(localIndex === null || Number(pending.playerIndex) !== localIndex) return;
    if(Number(g.currentPlayer) !== localIndex) return;
    if(typeof window.showBoardTargetPicker !== 'function') return;
    const promptKey = serverPromptId(pending, [pending.kind || 'zonePick', pending.iid || '', pending.z ?? '', g.turn || 0, localIndex].join(':'));
    if(g._onlineShownServerZonePickPromptId === promptKey) return;
    const entries = serverZonePickEntries(g, pending);
    if(!entries.length) return;
    const forcedSingle = /^(breakfastBusserGrantMove|breakfastBusserSelectSupporter)$/i.test(String(pending.kind || ''));
    const maxCount = forcedSingle ? 1 : Math.max(1, Number(pending.maxCount || 1) || 1);
    g._onlineShownServerZonePickPromptId = promptKey;
    withOnlinePromptBypass(g, function(){
      window.showBoardTargetPicker({
        title:serverZonePickTitle(pending),
        prompt:serverZonePickPrompt(pending),
        entries,
        zones:[...new Set(entries.map(entry=>entry.z))],
        maxCount,
        confirmLabel:'Confirm',
        showOpponentOverlay:true,
        allowOptionalCancelServerAction:pending.optional === true,
        onCancel:function(){
          if(pending.optional === true){
            sendServerPendingAction('PICK_ZONE', pending, {selectedEntries:[]}, 'Target choice');
          }
        }
      }, function(chosen){
        sendServerPendingAction('PICK_ZONE', pending, {
          selectedEntries:(chosen || []).slice(0, maxCount).map(boardSelectionPayload)
        }, 'Target choice');
      });
    });
  }
  function maybeShowServerModalActionPrompt(){
    const g = gameState();
    if(!isOnlineMatchState(g)) return;
    const pending = g._serverPendingModalAction;
    if(!pending || typeof pending !== 'object'){
      g._onlineShownServerModalPromptId = '';
      return;
    }
    const localIndex = onlineLocalPlayerIndex();
    if(localIndex === null || Number(pending.playerIndex) !== localIndex) return;
    if(Number(g.currentPlayer) !== localIndex) return;
    const kind = String(pending.kind || '');
    const promptId = String(pending.promptId || '');
    if(!promptId) return;
    if(g._onlineShownServerModalPromptId === promptId) return;
    if(kind === 'affiliationChoice' && typeof window.showAffiliationPickerVisual === 'function'){
      g._onlineShownServerModalPromptId = promptId;
      withOnlinePromptBypass(g, function(){
        window.showAffiliationPickerVisual(function(aff){
          sendServerPendingAction('PICK_AFFILIATION', pending, {aff:String(aff || '')}, 'Affiliation choice');
        });
      });
      return;
    }
    if(kind === 'artilleryDistance' && typeof window.showModal === 'function'){
      g._onlineShownServerModalPromptId = promptId;
      window.showModal('Artillery Distance', '<p>Select a zone to lock for your opponent.</p>', [
        {label:'Zone 1', action:function(){ if(window.closeModal) closeModal(); sendServerPendingAction('MODAL_ACTION', pending, {actionIndex:0}, 'Artillery Distance'); }},
        {label:'Zone 2', action:function(){ if(window.closeModal) closeModal(); sendServerPendingAction('MODAL_ACTION', pending, {actionIndex:1}, 'Artillery Distance'); }},
        {label:'Zone 3', action:function(){ if(window.closeModal) closeModal(); sendServerPendingAction('MODAL_ACTION', pending, {actionIndex:2}, 'Artillery Distance'); }}
      ], {immediate:true});
      return;
    }
    if(kind === 'christopherErbsDrawChoice' && typeof window.showModal === 'function'){
      g._onlineShownServerModalPromptId = promptId;
      window.showModal('Christopher Erbs', '<p>Use Christopher Erbs on this draw?</p>', [
        {label:'Skip', action:function(){ if(window.closeModal) closeModal(); sendServerPendingAction('MODAL_ACTION', pending, {actionIndex:0, activate:false}, 'Christopher Erbs'); }},
        {label:'Use', pri:true, action:function(){ if(window.closeModal) closeModal(); sendServerPendingAction('MODAL_ACTION', pending, {actionIndex:1, activate:true}, 'Christopher Erbs'); }}
      ], {immediate:true});
      return;
    }
    if(kind === 'chaparralSetMode' && typeof window.showModal === 'function'){
      g._onlineShownServerModalPromptId = promptId;
      window.showModal('Chaparral Ambusher', '<p>Set this card normally or face down?</p>', [
        {label:'Normal', action:function(){ if(window.closeModal) closeModal(); sendServerPendingAction('MODAL_ACTION', pending, {actionIndex:0, faceDown:false}, 'Chaparral choice'); }},
        {label:'Face Down', pri:true, action:function(){ if(window.closeModal) closeModal(); sendServerPendingAction('MODAL_ACTION', pending, {actionIndex:1, faceDown:true}, 'Chaparral choice'); }}
      ], {immediate:true});
      return;
    }
    if(kind !== 'landscapeChoice' || typeof window.showLandscapeChoiceModal !== 'function') return;
    g._onlineShownServerModalPromptId = promptId;
    g._onlineLocalModalBypass = true;
    window.__fateOnlineLocalModalBypass = true;
    try{
      window.showLandscapeChoiceModal(0, function(song, landscape, bgNum){
        const latest = gameState();
        const n = Math.max(1, Math.min(16, Number(bgNum || String(song || '').replace('board', '')) || 0));
        const payload = {
          playerIndex:localIndex,
          turn:latest?.turn || g.turn || 0,
          promptId,
          song:String(song || ('board' + n)),
          bgNum:n,
          landscapeId:'igb' + n,
          baseStateHash:onlineCanonicalStateHash(captureOnlineCanonicalState()),
          clientActionId:'modal:landscapeChoice:' + promptId + ':' + Date.now()
        };
        sendAction('MODAL_ACTION', payload).catch(err=>{
          console.warn('Server landscape choice failed', err);
          if(window.toast) toast('Landscape choice failed');
        });
      });
    } finally {
      g._onlineLocalModalBypass = false;
      window.__fateOnlineLocalModalBypass = false;
    }
  }
  function serverPendingMoveTitle(pending){
    const kind = String(pending?.kind || '');
    if(kind === 'markKemperSafeSquare') return 'Mark Kemper';
    if(kind === 'zoeBlockSquare') return 'Zoe';
    if(kind === 'carolynBlockCell') return 'Carolyn';
    if(kind === 'berkeleyHomelessMove') return 'Berkeley Homeless';
    if(kind === 'alpineExpeditionaryMove') return 'ALPINE Expeditionary';
    if(kind === 'breakfastBusserMove' || kind === 'busserAdjacentMove') return 'Movement';
    if(kind === 'landscapeEventideMove') return 'Panacea';
    if(kind === 'juanCarlosMove') return 'Juan Carlos';
    if(kind === 'wolfCreekMove') return 'Wolf Creek';
    return 'Choose Square';
  }
  function serverPendingMovePrompt(pending){
    const kind = String(pending?.kind || '');
    if(kind === 'markKemperSafeSquare') return 'Choose a safe-square slot.';
    if(kind === 'zoeBlockSquare') return 'Choose a square to block.';
    if(kind === 'carolynBlockCell') return 'Choose an empty square to lock.';
    return 'Choose a highlighted destination.';
  }
  function moveOptionLabel(option){
    return 'Zone ' + (Number(option.z) + 1) + ', Row ' + (Number(option.r) + 1) + ', Col ' + (Number(option.c) + 1);
  }
  function maybeShowServerMovePrompt(){
    const g = gameState();
    if(!isOnlineMatchState(g)) return;
    const pending = g._serverPendingMove;
    if(!pending || typeof pending !== 'object'){
      g._onlineShownServerMovePromptId = '';
      return;
    }
    const localIndex = onlineLocalPlayerIndex();
    if(localIndex === null || Number(pending.playerIndex) !== localIndex) return;
    if(Number(g.currentPlayer) !== localIndex) return;
    if(typeof window.showModal !== 'function') return;
    const options = Array.isArray(pending.options) ? pending.options.filter(option =>
      Number.isInteger(Number(option?.z)) &&
      Number.isInteger(Number(option?.r)) &&
      Number.isInteger(Number(option?.c))
    ) : [];
    if(!options.length) return;
    const promptKey = serverPromptId(pending, [pending.kind || 'move', pending.movingIid || pending.sourceIid || '', g.turn || 0, localIndex].join(':'));
    if(g._onlineShownServerMovePromptId === promptKey) return;
    g._onlineShownServerMovePromptId = promptKey;
    const buttons = options.slice(0, 36).map((option, idx)=>
      '<button class="btn sm" type="button" data-server-move-option="' + idx + '">' + reactionEscapeHtml(moveOptionLabel(option)) + '</button>'
    ).join('');
    window.showModal(serverPendingMoveTitle(pending), '<p>' + reactionEscapeHtml(serverPendingMovePrompt(pending)) + '</p><div class="server-pending-move-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.45rem;">' + buttons + '</div>', [
      {label:'Cancel', action:function(){ if(window.closeModal) closeModal(); g._onlineShownServerMovePromptId = ''; }}
    ], {immediate:true});
    setTimeout(function(){
      document.querySelectorAll('#modal [data-server-move-option]').forEach(btn=>{
        btn.addEventListener('click', function(){
          const idx = Number(btn.getAttribute('data-server-move-option'));
          const option = options[idx];
          if(!option) return;
          if(window.closeModal) closeModal();
          sendServerPendingAction('SELECT_PENDING_MOVE_CELL', pending, {
            z:Number(option.z),
            r:Number(option.r),
            c:Number(option.c),
            placing:false,
            selectedHand:selectedHandSnapshot(gameState())
          }, 'Square choice');
        });
      });
    }, 0);
  }
  function maybeShowServerLandscapeZonePrompt(){
    const g = gameState();
    if(!isOnlineMatchState(g)) return false;
    const pending = g.pendingInteraction;
    if(!pending || String(pending.kind || '') !== 'landscapeZone'){
      g._onlineShownLandscapeZonePromptId = '';
      return false;
    }
    const localIndex = onlineLocalPlayerIndex();
    if(localIndex === null || Number(pending.playerIndex) !== localIndex) return false;
    if(typeof window.chooseLandscapeZone !== 'function' || typeof window.resolvePendingLandscapeEndTurnZone !== 'function') return false;
    const promptId = String(pending.promptId || [
      'landscape-zone',
      String(g._onlineRoomCode || ''),
      String(pending.landscapeId || ''),
      String(g.turn || 0),
      String(localIndex)
    ].join(':'));
    if(g._onlineShownLandscapeZonePromptId === promptId) return true;
    g._onlineShownLandscapeZonePromptId = promptId;
    const opts = {
      kind:String(pending.pickerKind || 'fate'),
      requireOpenExtraRow:pending.requireOpenExtraRow === true,
      promptKey:promptId
    };
    const opened = window.chooseLandscapeZone(
      localIndex,
      String(pending.title || 'Choose Zone'),
      String(pending.subtitle || ''),
      function(zone){
        const latest = gameState();
        const livePending = latest?.pendingInteraction;
        if(!livePending || String(livePending.promptId || '') !== promptId) return false;
        return window.resolvePendingLandscapeEndTurnZone(livePending, zone);
      },
      opts
    );
    if(opened === false) g._onlineShownLandscapeZonePromptId = '';
    return opened !== false;
  }
  function maybeShowServerPendingPrompts(){
    const reactionShown = maybeShowServerReactionPrompt();
    if(reactionShown || onlineImprovisorModalPanel()) return true;
    maybeShowServerLandscapeZonePrompt();
    maybeShowServerCardPickPrompt();
    maybeShowServerZonePickPrompt();
    maybeShowServerModalActionPrompt();
    maybeShowServerMovePrompt();
    return !!reactionShown;
  }
  function forceServerPendingPromptChecks(reason){
    recordOnlineDiagnostic('server-pending-prompt-force-check', {reason:String(reason || '')});
    maybeShowServerPendingPrompts();
    try{
      if(typeof requestAnimationFrame === 'function'){
        requestAnimationFrame(function(){ maybeShowServerPendingPrompts(); });
      }
    }catch(e){}
    [0, 40, 120, 300].forEach(function(delay){
      setTimeout(function(){ maybeShowServerPendingPrompts(); }, delay);
    });
  }
  function scheduleServerPendingPromptChecks(reason){
    [0, 80, 220, 520, 1000].forEach(function(delay){
      setTimeout(function(){
        recordOnlineDiagnostic('server-pending-prompt-check-scheduled', {
          reason:String(reason || ''),
          delay
        });
        maybeShowServerPendingPrompts();
      }, delay);
    });
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
    const order = room.playerOrder || {};
    if(Array.isArray(order)){
      if(order[0] === uid) return 0;
      if(order[1] === uid) return 1;
    }else if(order && typeof order === 'object'){
      if(order[0] === uid || order['0'] === uid) return 0;
      if(order[1] === uid || order['1'] === uid) return 1;
    }
    return null;
  }
  function coerceOnlinePlayerIndex(value){
    const idx = Number(value);
    return Number.isInteger(idx) && idx >= 0 && idx <= 1 ? idx : null;
  }
  function activeIdentityRoom(){
    const g = gameState();
    const code = String(g?._onlineRoomCode || activeRoom || '').trim().toUpperCase();
    if(lastLobbyRoom && (!code || String(lastLobbyRoom.roomCode || '').trim().toUpperCase() === code)) return lastLobbyRoom;
    return lastLobbyRoom || null;
  }
  function resolveOnlineLocalPlayerIndex(reason){
    const g = gameState();
    if(!g || g._isSpectator || g._onlineRole === 'spectator') return null;
    const userUid = window.FATE_ONLINE?.user?.uid || (typeof getUser === 'function' ? getUser()?.uid : '');
    const room = activeIdentityRoom();
    const roomIdx = coerceOnlinePlayerIndex(roomPlayerIndexForUid(room, userUid));
    const stateIdx = coerceOnlinePlayerIndex(g._onlinePlayerIndex);
    const localIdx = coerceOnlinePlayerIndex(g.localPlayerIndex);
    const viewerIdx = coerceOnlinePlayerIndex(g.viewerPlayerIndex);
    const resolved = roomIdx ?? stateIdx ?? localIdx ?? viewerIdx;
    if(resolved !== null && stateIdx !== resolved){
      const previous = g._onlinePlayerIndex;
      g._onlinePlayerIndex = resolved;
      g.localPlayerIndex = resolved;
      g.viewerPlayerIndex = resolved;
      recordOnlineDiagnostic('online-local-player-index-repaired', {
        reason:String(reason || ''),
        previous:coerceOnlinePlayerIndex(previous),
        resolved,
        roomIndex:roomIdx,
        stateIndex:stateIdx,
        localIndex:localIdx,
        viewerIndex:viewerIdx,
        uid:String(userUid || ''),
        roomCode:String(g._onlineRoomCode || activeRoom || '').trim().toUpperCase()
      });
    }
    return resolved;
  }
  function onlineLocalPlayerIndex(){
    const g = gameState();
    const idx = Number(g?._onlinePlayerIndex);
    if(Number.isInteger(idx) && idx >= 0 && idx <= 1) return idx;
    return resolveOnlineLocalPlayerIndex('onlineLocalPlayerIndex');
  }
  window.fateResolveOnlineLocalPlayerIndex = function(reason){
    return resolveOnlineLocalPlayerIndex(reason || 'external');
  };
  function onlineActionPlayer(action){
    const payload = action?.payload || {};
    const roomIndex = roomPlayerIndexForUid(lastLobbyRoom, action?.uid);
    if(roomIndex !== null && roomIndex !== undefined) return roomIndex;
    if(Number.isInteger(payload.playerIndex)) return payload.playerIndex;
    if(Number.isInteger(Number(payload.playerIndex))) return Number(payload.playerIndex);
    if(Number.isInteger(Number(payload.currentPlayer))) return Number(payload.currentPlayer);
    if(Number.isInteger(Number(payload.owner))) return Number(payload.owner);
    if(action && Number.isInteger(Number(action.playerIndex))) return Number(action.playerIndex);
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
    if(!card) return null;
    const snapshot = { index:idx, iid:card.iid || '', id:card.id || '' };
    const freePlacementKind = String(card._freePlacementCinematicKind || card._serverFreePlacementConsumed || (card._linaFree ? 'linaFreeSet' : '') || '');
    if(freePlacementKind) snapshot.freePlacementCinematicKind = freePlacementKind;
    const skipPromptId = String(card._skipOnlinePlacementImprovisorReactionPromptId || '');
    if(card._skipOnlinePlacementImprovisorReactionOnce || skipPromptId){
      snapshot.skipImprovisorReaction = true;
      if(skipPromptId) snapshot.skipImprovisorReactionPromptId = skipPromptId;
    }
    if(card.name) snapshot.name = card.name;
    if(card.type) snapshot.type = card.type;
    return snapshot;
  }
  function onlineConsolidationPresentationFromPending(g, con, z, r, c){
    if(!g || !con || !Array.isArray(con.allPossible) || !Array.isArray(con.chosenIdxs)) return null;
    const targetZ = Number(z), targetR = Number(r), targetC = Number(c);
    if(!Number.isInteger(targetZ) || !Number.isInteger(targetR) || !Number.isInteger(targetC)) return null;
    const placementIdx = con.chosenIdxs.findIndex(function(i){
      const entry = con.allPossible[i];
      return entry && Number(entry.z) === targetZ && Number(entry.r) === targetR && Number(entry.c) === targetC;
    });
    if(placementIdx < 0) return null;
    const tributes = con.chosenIdxs.map(function(i, index){
      const entry = con.allPossible[i];
      if(!entry) return null;
      const live = g.board?.[entry.z]?.[entry.r]?.[entry.c] || entry.card || null;
      return {
        z:Number(entry.z),
        r:Number(entry.r),
        c:Number(entry.c),
        index,
        iid:String(live?.iid || entry.card?.iid || ''),
        id:String(live?.id || entry.card?.id || ''),
        card:compactOnlineCard(live)
      };
    }).filter(Boolean);
    return {
      playerIndex:Number.isInteger(Number(g.currentPlayer)) ? Number(g.currentPlayer) : null,
      target:{z:targetZ, r:targetR, c:targetC},
      resultCard:compactOnlineCard(con.card || null),
      tributes,
      localActorAlreadyPresented:true
    };
  }
  function onlineConsolidationChosenTributesPayload(con){
    if(!con || !Array.isArray(con.allPossible) || !Array.isArray(con.chosenIdxs)) return [];
    const g = gameState();
    return con.chosenIdxs.map(function(i){
      const item = con.allPossible[i];
      if(!item) return null;
      const live = g?.board?.[item.z]?.[item.r]?.[item.c] || item.card || null;
      return {
        idx:Number(i),
        z:Number(item.z),
        r:Number(item.r),
        c:Number(item.c),
        iid:String(live?.iid || item.card?.iid || ''),
        id:String(live?.id || item.card?.id || '')
      };
    }).filter(Boolean);
  }
  function localConsolidationCardMatches(cache, con){
    if(!cache || !con) return false;
    const card = con.card || {};
    const cardIid = String(con.cardIid || card.iid || '');
    const cardId = String(con.cardId || card.id || '');
    if(cache.cardIid && cardIid) return cache.cardIid === cardIid;
    return !!(cache.cardId && cardId && cache.cardId === cardId);
  }
  function rememberLocalConsolidationSelection(g, con, source){
    if(!g || !con || !Array.isArray(con.allPossible)) return false;
    const chosenIdxs = Array.isArray(con.chosenIdxs) ? con.chosenIdxs : [];
    localConsolidationSelection = {
      playerIndex:Number(g.currentPlayer),
      turn:Number(g.turn || 0) || 0,
      cardIid:String(con.cardIid || con.card?.iid || ''),
      cardId:String(con.cardId || con.card?.id || ''),
      promptId:String(con.promptId || ''),
      phase:String(con.phase || 'select_tributes'),
      finalizing:false,
      tributes:chosenIdxs.map(function(idx){
        const item = con.allPossible[idx];
        if(!item) return null;
        return {
          z:Number(item.z),
          r:Number(item.r),
          c:Number(item.c),
          iid:String(item.card?.iid || ''),
          id:String(item.card?.id || '')
        };
      }).filter(Boolean)
    };
    recordOnlineDiagnostic('online-local-consolidation-selection-stored', {
      source:String(source || ''),
      promptId:localConsolidationSelection.promptId,
      tributeCount:localConsolidationSelection.tributes.length
    });
    return true;
  }
  function clearLocalConsolidationSelection(reason){
    if(localConsolidationSelection){
      recordOnlineDiagnostic('online-local-consolidation-selection-cleared', {
        reason:String(reason || ''),
        tributeCount:Array.isArray(localConsolidationSelection.tributes) ? localConsolidationSelection.tributes.length : 0
      });
    }
    localConsolidationSelection = null;
    queuedFinalConsolidationClick = null;
  }
  function clearCompletedOnlineConsolidationState(g, reason){
    const state = g || gameState();
    const con = state && state._consolidating;
    if(!state || !con) return false;
    const playerIndex = Number.isInteger(Number(con.playerIndex)) ? Number(con.playerIndex) : Number(state.currentPlayer);
    const hand = state.players?.[playerIndex]?.hand || [];
    const cardIid = String(con.cardIid || con.card?.iid || '');
    const cardId = String(con.cardId || con.card?.id || '');
    const stillInHand = hand.some(function(card){
      if(!card) return false;
      if(cardIid && card.iid != null) return String(card.iid) === cardIid;
      return !!(cardId && String(card.id || '') === cardId);
    });
    if(stillInHand) return false;
    state._consolidating = null;
    state.consolidating = false;
    state.selectedHandCard = null;
    state.selectedBoardCard = null;
    clearLocalConsolidationSelection(reason || 'completed consolidation cleanup');
    try{ document.getElementById('s-game')?.classList.remove('is-consolidating'); }catch(e){}
    const cancelBtn = document.getElementById('cancel-consolidate-btn');
    if(cancelBtn) cancelBtn.style.display = 'none';
    try{ if(typeof window.clearPlaceHighlights === 'function') window.clearPlaceHighlights(); }catch(e){}
    try{ if(typeof window.refreshConsolidationCanvasState === 'function') window.refreshConsolidationCanvasState(); }catch(e){}
    recordOnlineDiagnostic('online-completed-consolidation-state-cleared', {reason:String(reason || '')});
    return true;
  }
  function queueFinalConsolidationClick(g, con, z, r, c, reason){
    if(!g || !con) return false;
    queuedFinalConsolidationClick = {
      playerIndex:Number(g.currentPlayer),
      turn:Number(g.turn || 0) || 0,
      cardIid:String(con.cardIid || con.card?.iid || ''),
      cardId:String(con.cardId || con.card?.id || ''),
      z:Number(z),
      r:Number(r),
      c:Number(c),
      at:Date.now()
    };
    recordOnlineDiagnostic('online-final-consolidation-click-queued', {
      reason:String(reason || ''),
      z:Number(z),
      r:Number(r),
      c:Number(c),
      promptId:String(con.promptId || '')
    });
    return true;
  }
  function flushQueuedFinalConsolidationClick(reason){
    const queued = queuedFinalConsolidationClick;
    if(!queued) return false;
    const g = gameState();
    const con = g && g._consolidating;
    if(!g || !con) return false;
    if(onlineLocalActionGate && onlineLocalActionGate.until > Date.now()) return false;
    if(Number(queued.playerIndex) !== Number(g.currentPlayer) || Number(queued.turn) !== Number(g.turn) || !localConsolidationCardMatches(queued, con)){
      queuedFinalConsolidationClick = null;
      recordOnlineDiagnostic('online-final-consolidation-click-queue-cleared', {reason:'stale during ' + String(reason || '')});
      return false;
    }
    queuedFinalConsolidationClick = null;
    recordOnlineDiagnostic('online-final-consolidation-click-replayed', {
      reason:String(reason || ''),
      z:queued.z,
      r:queued.r,
      c:queued.c,
      promptId:String(con.promptId || '')
    });
    setTimeout(function(){
      try{
        if(typeof window.clickCell === 'function') window.clickCell(queued.z, queued.r, queued.c);
      }catch(e){
        console.warn('Queued final consolidation click replay failed', e);
      }
    }, 0);
    return true;
  }
  function restoreLocalConsolidationSelection(g, source){
    const cache = localConsolidationSelection;
    const con = g && g._consolidating;
    if(!cache || !g || !con || cache.finalizing) return false;
    if(Number(cache.playerIndex) !== Number(g.currentPlayer) || Number(cache.turn) !== Number(g.turn) || !localConsolidationCardMatches(cache, con)){
      clearLocalConsolidationSelection('stale consolidation selection during ' + String(source || 'state apply'));
      return false;
    }
    const allPossible = Array.isArray(con.allPossible) ? con.allPossible : [];
    const chosenIdxs = [];
    (Array.isArray(cache.tributes) ? cache.tributes : []).forEach(function(tribute){
      const idx = allPossible.findIndex(function(item){
        if(!item) return false;
        const sameCoords = Number(item.z) === Number(tribute.z)
          && Number(item.r) === Number(tribute.r)
          && Number(item.c) === Number(tribute.c);
        const sameIid = tribute.iid && item.card?.iid != null && String(item.card.iid) === String(tribute.iid);
        return !!(sameIid || sameCoords);
      });
      if(idx >= 0 && !chosenIdxs.includes(idx)) chosenIdxs.push(idx);
    });
    con.chosenIdxs = chosenIdxs;
    con.phase = String(cache.phase || 'select_tributes');
    if(con.promptId) cache.promptId = String(con.promptId);
    recordOnlineDiagnostic('online-local-consolidation-selection-restored', {
      source:String(source || ''),
      promptId:String(con.promptId || ''),
      tributeCount:chosenIdxs.length
    });
    return true;
  }
  function isOnlineFinalConsolidationClick(con, z, r, c){
    if(!con || !Array.isArray(con.allPossible) || !Array.isArray(con.chosenIdxs)) return false;
    const targetZ = Number(z), targetR = Number(r), targetC = Number(c);
    const idx = con.chosenIdxs.find(function(i){
      const entry = con.allPossible[i];
      return entry && Number(entry.z) === targetZ && Number(entry.r) === targetR && Number(entry.c) === targetC;
    });
    if(idx === undefined) return false;
    if(String(con.phase || '') === 'select_placement') return true;
    const running = con.chosenIdxs.reduce(function(sum, i){
      const entry = con.allPossible[i];
      return sum + Math.max(0, Number(entry && entry.reinforcement) || 0);
    }, 0);
    return String(con.phase || 'select_tributes') === 'select_tributes' && running >= Math.max(0, Number(con.cost) || 0);
  }
  function sendServerResolvedConsolidationClick(g, con, z, r, c){
    if(!g || !con || !isStrictCompactAuthorityAction('SELECT_CONSOLIDATION_TRIBUTE')) return false;
    if(clientResolvedGameplayEnabled()) return false;
    clearOnlineMoreBoardPreference('final-consolidation-click');
    const finishGate = noteOnlineLocalActionGate('SELECT_CONSOLIDATION_TRIBUTE');
    if(!finishGate) return true;
    const payload = {
      playerIndex:g.currentPlayer,
      turn:g.turn,
      z,
      r,
      c,
      promptId:String(con.promptId || ''),
      baseStateHash:lastAuthorityStateHash || ''
    };
    payload.chosenIdxs = Array.isArray(con.chosenIdxs) ? con.chosenIdxs.slice() : [];
    payload.chosenTributes = onlineConsolidationChosenTributesPayload(con);
    payload.actionKind = 'SELECT_CONSOLIDATION_TRIBUTE';
    recordOnlineDiagnostic('online-final-consolidation-server-resolved', {
      z,
      r,
      c,
      promptId:payload.promptId,
      tributeCount:Array.isArray(con.chosenIdxs) ? con.chosenIdxs.length : 0
    });
    if(String(con.cardId || con.card?.id || '') === '06'){
      clearLocalConsolidationSelection('jorge final consolidation sent');
    }
    if(localConsolidationSelection) localConsolidationSelection.finalizing = true;
    sendAction('SELECT_CONSOLIDATION_TRIBUTE', payload).then(function(){
      clearLocalConsolidationSelection('authoritative consolidation completed');
    }).catch(function(err){
      if(localConsolidationSelection) localConsolidationSelection.finalizing = false;
      console.error('Server-resolved consolidation click failed', err);
      if(window.toast) toast(err && err.message ? err.message : 'Could not sync consolidation.');
      scheduleOptimisticCorrection('SELECT_CONSOLIDATION_TRIBUTE');
    }).finally(function(){
      finishGate();
    });
    return true;
  }
  function mirrorOnlineConsolidationTributeSelection(g, con, z, r, c, source){
    if(!g || !con || !Array.isArray(con.allPossible)) return false;
    if(!Array.isArray(con.chosenIdxs)) con.chosenIdxs = [];
    if(String(con.phase || 'select_tributes') !== 'select_tributes') return false;
    const idx = con.allPossible.findIndex(item=>
      item && Number(item.z) === Number(z) && Number(item.r) === Number(r) && Number(item.c) === Number(c)
    );
    if(idx < 0 || con.chosenIdxs.includes(idx)) return false;
    con.chosenIdxs.push(idx);
    con.phase = 'select_tributes';
    const running = con.chosenIdxs.reduce(function(sum, i){
      const item = con.allPossible[i];
      return sum + Math.max(0, Number(item && item.reinforcement) || 0);
    }, 0);
    const cost = Math.max(0, Number(con.cost) || 0);
    try{
      if(typeof window.renderGame === 'function') window.renderGame({board:true, hand:true, blocks:true, topbar:true});
      if(typeof window.highlightTributeCards === 'function') window.highlightTributeCards();
      if(typeof window.refreshConsolidationCanvasState === 'function') window.refreshConsolidationCanvasState();
      if(typeof window.setHint === 'function') {
        if(running >= cost) window.setHint(`Ready: click a selected tribute to place ${con.card?.name || 'this card'}.`);
        else window.setHint(`Select ${typeof getConsolidationTributeLabel === 'function' ? getConsolidationTributeLabel(con.card) : 'supporters'} to consolidate ${con.card?.name || 'this card'} (${running}/${cost} reinforcement).`);
      }
    }catch(e){
      console.warn('Online drag consolidation local selection mirror failed', e);
    }
    recordOnlineDiagnostic('online-drag-consolidation-local-tribute-selected', {
      z:Number(z),
      r:Number(r),
      c:Number(c),
      idx,
      running,
      cost,
      source:String(source || '')
    });
    rememberLocalConsolidationSelection(g, con, source || 'local tribute selection');
    return true;
  }
  function preserveLocalDragConsolidationStartState(action){
    const payload = action && action.payload || {};
    if(String(action?.type || '').toUpperCase() !== 'START_CONSOLIDATE') return false;
    if(String(payload.source || '') !== 'drag-drop-consolidation') return false;
    const g = gameState();
    const localCon = g && g._consolidating;
    const serverCon = payload.postState && payload.postState._consolidating;
    if(!localCon || !serverCon) return false;
    if(!Array.isArray(localCon.chosenIdxs) || !localCon.chosenIdxs.length) return false;
    rememberLocalConsolidationSelection(g, localCon, 'drag start acknowledgement');
    const authorityHash = String(action?.serverStateHash || payload.stateHash || '');
    if(authorityHash) lastAuthorityStateHash = authorityHash;
    rememberOnlineAuthorityBoardSnapshot(payload.postState, authorityHash || payload.stateHash);
    localCon.promptId = String(serverCon.promptId || localCon.promptId || '');
    localCon.playerIndex = serverCon.playerIndex ?? localCon.playerIndex;
    localCon.kind = serverCon.kind || localCon.kind;
    localCon.phase = localCon.phase || serverCon.phase || 'select_tributes';
    if(!Array.isArray(localCon.allPossible) || !localCon.allPossible.length){
      localCon.allPossible = cloneOnlinePlain(serverCon.allPossible || []);
    }
    if(!Number(localCon.cost) && Number(serverCon.cost)) localCon.cost = Number(serverCon.cost);
    restoreLocalConsolidationSelection(g, 'drag start acknowledgement');
    try{
      if(typeof window.refreshConsolidationCanvasState === 'function') window.refreshConsolidationCanvasState();
    }catch(e){}
    recordOnlineDiagnostic('online-drag-consolidation-start-preserved-local-selection', {
      promptId:String(localCon.promptId || ''),
      chosenCount:localCon.chosenIdxs.length,
      seq:Number(action?.seq || 0) || 0
    });
    flushQueuedFinalConsolidationClick('drag start acknowledgement');
    return true;
  }
  function noteOnlinePlacementIntent(g, selected){
    if(!g || !selected) return null;
    const intent = {
      playerIndex:Number.isInteger(Number(g.currentPlayer)) ? Number(g.currentPlayer) : null,
      turn:Number(g.turn || 0) || 0,
      selectedHand:cloneOnlinePlain(selected),
      at:Date.now()
    };
    g._onlinePlacementIntent = intent;
    try { window.__fateOnlinePlacementIntent = intent; } catch(e) {}
    return intent;
  }
  function recentOnlinePlacementIntent(g){
    const intent = g?._onlinePlacementIntent || window.__fateOnlinePlacementIntent || null;
    if(!intent || !intent.selectedHand) return null;
    if(Date.now() - Number(intent.at || 0) > 3500) return null;
    if(Number.isInteger(Number(intent.playerIndex)) && Number(intent.playerIndex) !== Number(g?.currentPlayer)) return null;
    if(Number(intent.turn || 0) && Number(intent.turn || 0) !== Number(g?.turn || 0)) return null;
    return cloneOnlinePlain(intent.selectedHand);
  }
  function clearOnlinePlacementIntent(g){
    if(g) g._onlinePlacementIntent = null;
    try { window.__fateOnlinePlacementIntent = null; } catch(e) {}
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
      (clientResolvedGameplayEnabled() && g.selectedHandCard !== null && g.selectedHandCard !== undefined) ||
      g._consolidating ||
      g._serverPendingReaction ||
      g._serverPendingMove ||
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
    if(!card) return null;
    const ident = { iid:card.iid || '', id:card.id || '', name:card.name || '' };
    if(card._serverPickSource) ident.source = String(card._serverPickSource);
    if(Number.isInteger(Number(card._serverPickIndex))) ident.index = Number(card._serverPickIndex);
    return ident;
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
  function attachOnlinePendingEffectSource(payload, g, pending){
    if(!payload || !pending || typeof pending !== 'object') return payload;
    const nested = [pending, pending.source, pending.boardSource, pending.effectCinematic, pending.origin, pending.sourcePosition];
    let loc = null;
    for(const candidate of nested){
      if(!candidate || typeof candidate !== 'object') continue;
      const z = candidate.sourceZ !== undefined ? Number(candidate.sourceZ) : Number(candidate.z);
      const r = candidate.sourceR !== undefined ? Number(candidate.sourceR) : Number(candidate.r);
      const c = candidate.sourceC !== undefined ? Number(candidate.sourceC) : Number(candidate.c);
      if(Number.isInteger(z) && Number.isInteger(r) && Number.isInteger(c)){
        loc = {z, r, c};
        break;
      }
    }
    if(!loc){
      const sourceIid = String(pending.sourceIid || pending.iid || pending.movingIid || pending.source?.card?.iid || '');
      if(sourceIid && Array.isArray(g?.board)){
        g.board.some((zone, z)=>Array.isArray(zone) && zone.some((row, r)=>Array.isArray(row) && row.some((card, c)=>{
          if(String(card?.iid || '') !== sourceIid) return false;
          loc = {z, r, c};
          return true;
        })));
      }
    }
    if(!loc) return payload;
    payload.pendingSource = boardEffectCinematicPayload(g, loc.z, loc.r, loc.c) || loc;
    return payload;
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
  function maybeShowRemoteEffectCinematicForAction(g, action, source){
    if(!g || !action) return false;
    const localUid = getUser()?.uid;
    if(localUid && String(action.uid || '') === String(localUid)) return false;
    const type = onlineEffectiveActionType(action);
    const payload = action.payload || {};
    const boardEffect = type === 'BOARD_ACTION' &&
      /^(triggerCharacterEffect|activatePendingWhenSetEffect)$/i.test(String(payload.fn || '')) &&
      !!payload.effectCinematic;
    const modalEffect = type === 'MODAL_ACTION' && !!payload.effectCinematic;
    if(!boardEffect && !modalEffect) return false;
    Promise.resolve(showPayloadEffectCinematic(g, payload, source || 'online-remote-effect-cinematic')).catch(function(e){
      console.warn('Online remote effect cinematic failed', e);
    });
    return true;
  }
  function payloadHasServerReactionWindow(payload){
    return !!(payload && payload.postState && payload.postState._serverPendingReaction);
  }
  function forceInstallOnlineImprovisorReactionFromPayload(action, reason){
    const payload = action?.payload || {};
    const pending = payload?.postState?._serverPendingReaction || null;
    const g = gameState();
    if(!isOnlineMatchState(g) || !pending || typeof pending !== 'object') return false;
    const promptId = String(pending.promptId || '');
    if(!promptId) return false;
    g._serverPendingReaction = cloneOnlinePlain(pending);
    if(payload.postState._serverReactionSeq !== undefined) g._serverReactionSeq = cloneOnlinePlain(payload.postState._serverReactionSeq);
    g.pendingInteraction = payload.postState.pendingInteraction
      ? cloneOnlinePlain(payload.postState.pendingInteraction)
      : {
        kind:'reaction',
        bucket:'reaction',
        playerIndex:g._serverPendingReaction.playerIndex,
        promptId
      };
    const hash = String(action?.serverStateHash || payload.stateHash || '');
    if(hash) lastAuthorityStateHash = hash;
    recordOnlineDiagnostic('online-improvisor-reaction-installed-from-payload', {
      reason:String(reason || ''),
      promptId,
      seq:Number(action?.seq || 0) || 0,
      stateHash:hash,
      pendingPlayerIndex:coerceOnlinePlayerIndex(g._serverPendingReaction.playerIndex),
      localPlayerIndex:resolveOnlineLocalPlayerIndex('install improvisor reaction from payload')
    });
    forceServerPendingPromptChecks(reason || 'installed improvisor reaction from payload');
    return true;
  }
  function isRemoteOnlineAction(action){
    const localIndex = onlineLocalPlayerIndex();
    const playerIndex = onlineActionPlayer(action);
    if(Number.isInteger(localIndex) && Number.isInteger(playerIndex)) return playerIndex !== localIndex;
    const localUid = window.FATE_ONLINE?.user?.uid;
    if(action && action.uid && localUid) return action.uid !== localUid;
    return false;
  }
  function onlineRemotePresentationKey(action, suffix){
    return [
      Number(action?.seq || 0) || 0,
      String(action?.uid || ''),
      String(action?.type || '').toUpperCase(),
      String(suffix || '')
    ].join(':');
  }
  function markOnlineRemotePresentation(g, key){
    if(!g || !key) return false;
    const played = g._onlineRemotePresentationsPlayed instanceof Set ? g._onlineRemotePresentationsPlayed : new Set();
    g._onlineRemotePresentationsPlayed = played;
    if(played.has(key)) return false;
    played.add(key);
    return true;
  }
  function estimateOnlineConsolidationMotionMs(payload){
    const count = Math.max(0, Math.min(10, Array.isArray(payload?.tributes) ? payload.tributes.length : 0));
    if(count <= 1) return 1540;
    return Math.min(5600, 90 + Math.max(0, count - 1) * 390 + 760 + 620 + 430 + 260);
  }
  function onlineApproxBoardCellRect(z, r, c, basis){
    const base = basis || onlineBoardCellRect(z, r, c);
    if(base) return base;
    const hit = onlineBoardCellRect(Number(z) || 0, Number(r) || 0, Number(c) || 0);
    if(hit) return hit;
    const w = 72;
    const h = 100;
    const boardW = Math.max(900, Math.min(1420, (window.innerWidth || 1280) * .74));
    const boardH = Math.max(420, Math.min(680, (window.innerHeight || 720) * .58));
    const left = Math.max(260, ((window.innerWidth || 1280) - boardW) / 2);
    const top = Math.max(100, ((window.innerHeight || 720) - boardH) / 2 - 30);
    const zoneW = boardW / 3;
    const colW = zoneW / 3.4;
    const rowH = boardH / 3.5;
    return {
      x:left + Math.max(0, Math.min(2, Number(z) || 0)) * zoneW + 34 + Math.max(0, Number(c) || 0) * colW,
      y:top + 56 + Math.max(0, Number(r) || 0) * rowH,
      w,
      h
    };
  }
  function onlineRelativeBoardCellRect(entry, targetEntry, targetRect){
    const direct = onlineBoardCellRect(Number(entry?.z), Number(entry?.r), Number(entry?.c));
    if(direct) return direct;
    if(targetRect && targetEntry){
      const stepX = Math.max(50, Math.min(120, (Number(targetRect.w) || 72) + 14));
      const stepY = Math.max(66, Math.min(146, (Number(targetRect.h) || 100) + 18));
      const dz = Number(entry?.z) - Number(targetEntry.z);
      const dr = Number(entry?.r) - Number(targetEntry.r);
      const dc = Number(entry?.c) - Number(targetEntry.c);
      return {
        x:(Number(targetRect.x) || 0) + (Number.isFinite(dz) ? dz * stepX * 3.25 : 0) + (Number.isFinite(dc) ? dc * stepX : 0),
        y:(Number(targetRect.y) || 0) + (Number.isFinite(dr) ? dr * stepY : 0),
        w:Number(targetRect.w) || 72,
        h:Number(targetRect.h) || 100
      };
    }
    return onlineApproxBoardCellRect(entry?.z, entry?.r, entry?.c, null);
  }
  function playOnlineConsolidationPresentationDirect(payload, options){
    const director = window.FateVfxDirector;
    if(!director || typeof director.play !== 'function') return false;
    const p = Object.assign({}, payload || {});
    const target = p.target || {};
    if(!p.targetRect && Number.isInteger(Number(p.z)) && Number.isInteger(Number(p.r)) && Number.isInteger(Number(p.c))){
      p.targetRect = onlineBoardCellRect(Number(p.z), Number(p.r), Number(p.c));
    }else if(!p.targetRect && Number.isInteger(Number(target.z)) && Number.isInteger(Number(target.r)) && Number.isInteger(Number(target.c))){
      p.targetRect = onlineBoardCellRect(Number(target.z), Number(target.r), Number(target.c));
    }
    if(!p.targetRect && Number.isInteger(Number(p.z)) && Number.isInteger(Number(p.r)) && Number.isInteger(Number(p.c))){
      p.targetRect = onlineApproxBoardCellRect(Number(p.z), Number(p.r), Number(p.c), null);
    }else if(!p.targetRect && Number.isInteger(Number(target.z)) && Number.isInteger(Number(target.r)) && Number.isInteger(Number(target.c))){
      p.targetRect = onlineApproxBoardCellRect(Number(target.z), Number(target.r), Number(target.c), null);
    }
    if(!p.targetRect) return false;
    p.tributes = (Array.isArray(p.tributes) ? p.tributes : []).map(function(tribute){
      const next = Object.assign({}, tribute || {});
      if(!next.rect && Number.isInteger(Number(next.z)) && Number.isInteger(Number(next.r)) && Number.isInteger(Number(next.c))){
        next.rect = onlineRelativeBoardCellRect(next, {z:p.z ?? target.z, r:p.r ?? target.r, c:p.c ?? target.c}, p.targetRect);
      }
      return next;
    }).filter(function(tribute){ return !!tribute.rect; });
    const resultIid = String(p.resultCardIid || p.targetIid || p.resultCard?.iid || p.card?.iid || '');
    const hideMs = estimateOnlineConsolidationMotionMs(p) + 260;
    try{
      const adapter = window.FateMatchRendererAdapter;
      const hiddenTributeIids = new Set();
      p.tributes.forEach(function(tribute){
        const iid = String(tribute?.iid || tribute?.card?.iid || '');
        if(iid && !hiddenTributeIids.has(iid)){
          hiddenTributeIids.add(iid);
          if(adapter && typeof adapter.hideBoardCardForVfx === 'function') adapter.hideBoardCardForVfx(iid, hideMs);
        }
        if(adapter && typeof adapter.hideBoardCellForVfx === 'function') {
          adapter.hideBoardCellForVfx(tribute?.z, tribute?.r, tribute?.c, hideMs);
        }
      });
      if(resultIid && adapter && typeof adapter.suppressInitialPlacementMotion === 'function') adapter.suppressInitialPlacementMotion(resultIid, hideMs);
      if(resultIid && adapter && typeof adapter.hideBoardCardForVfx === 'function') adapter.hideBoardCardForVfx(resultIid, hideMs);
      if(adapter && typeof adapter.scheduleRender === 'function') adapter.scheduleRender('online-consolidation-direct-vfx');
    }catch(e){}
    const id = director.play('CONSOLIDATE', p, Object.assign({allowMatchActionMotion:true, forceBridgeVfx:true}, options || {}));
    if(id) {
      recordOnlineDiagnostic('online-consolidation-direct-vfx', {
        id:String(id || ''),
        tributeCount:p.tributes.length,
        resultIid,
        hasTargetRect:!!p.targetRect
      });
    }
    return !!id;
  }
  function emitOnlineAcceptedPresentation(recipe, payload, action, suffix){
    const type = String(recipe || '').toUpperCase();
    if(type === 'PLAY_CARD' || type === 'DECK_TO_BOARD' || type === 'SET_CONFIRM' || type === 'SET_DRAG_LAND') return false;
    const eventPayload = Object.assign({remote:true, online:true}, payload || {});
    const eventOptions = {
      remote:true,
      online:true,
      allowBridgeVfx:true,
      forceBridgeVfx:type === 'CONSOLIDATE',
      allowMatchActionMotion:type === 'CONSOLIDATE',
      source:'online-authoritative-' + String(suffix || recipe || 'presentation'),
      actionSeq:Number(action?.seq || 0) || 0
    };
    if(type === 'CONSOLIDATE' && playOnlineConsolidationPresentationDirect(eventPayload, eventOptions)) return true;
    const bridge = window.FateVfxEventBridge;
    try{
      if(bridge && typeof bridge.onAcceptedGameEvent === 'function' && bridge.onAcceptedGameEvent({
        type,
        payload:eventPayload,
        options:eventOptions
      })) return true;
    }catch(e){}
    try{
      const presenter = window.FateActionPresentation;
      if(presenter && typeof presenter.beginMotionOnly === 'function' && presenter.beginMotionOnly(type, eventPayload, eventOptions)) return true;
    }catch(e){}
    try{
      const fx = window.FateV2CardMotionFx;
      if(fx && typeof fx.play === 'function' && fx.play(type, eventPayload, eventOptions)) return true;
    }catch(e){}
    return false;
  }
  function emitOnlineRemoteConsolidationPresentation(g, resultEntry, removedEntries, action, suffix){
    if(!g || !resultEntry || !resultEntry.card) return false;
    const targetRect = onlineBoardCellRect(resultEntry.z, resultEntry.r, resultEntry.c);
    const tributePayload = (Array.isArray(removedEntries) ? removedEntries : []).map(function(entry, index){
      const rect = onlineBoardCellRect(entry.z, entry.r, entry.c);
      return {
        iid:entry.card?.iid,
        card:entry.card,
        z:entry.z,
        r:entry.r,
        c:entry.c,
        rect,
        index
      };
    });
    const emitted = emitOnlineAcceptedPresentation('CONSOLIDATE', {
      tributes:tributePayload,
      resultCard:resultEntry.card || null,
      card:resultEntry.card || null,
      faceDown:!!resultEntry.card?.faceDown,
      resultCardIid:resultEntry.card?.iid || '',
      targetIid:resultEntry.card?.iid || '',
      target:{z:resultEntry.z, r:resultEntry.r, c:resultEntry.c, card:resultEntry.card},
      z:resultEntry.z,
      r:resultEntry.r,
      c:resultEntry.c,
      targetRect
    }, action, suffix || 'consolidate');
    if(emitted){
      recordOnlineDiagnostic('online-remote-consolidation-motion', {
        actionType:onlineEffectiveActionType(action),
        seq:Number(action?.seq || 0) || 0,
        tributeCount:tributePayload.length,
        cardId:String(resultEntry.card?.id || ''),
        reason:String(suffix || '')
      });
    }
    return emitted;
  }
  function onlineBoardCellRect(z, r, c){
    try {
      const fx = window.FateV2CardMotionFx;
      if(fx && typeof fx.targetRectForBoardTarget === 'function'){
        const rect = fx.targetRectForBoardTarget({z, r, c});
        if(rect) return rect;
      }
    } catch(e) {}
    try {
      const adapter = window.FateMatchRendererAdapter;
      const hitMap = adapter && typeof adapter.getHitMap === 'function' ? adapter.getHitMap() : null;
      const cells = hitMap && Array.isArray(hitMap.cells) ? hitMap.cells : [];
      const hit = cells.find(function(cell){
        return cell && Number(cell.z) === Number(z) && Number(cell.r) === Number(r) && Number(cell.c) === Number(c);
      });
      if(hit && hit.rect) return hit.rect;
    } catch(e) {}
    return null;
  }
  function onlineBoardSnapshotValues(snapshot){
    if(!snapshot || typeof snapshot.forEach !== 'function') return [];
    const values = [];
    snapshot.forEach(function(entry){ if(entry && entry.card) values.push(entry); });
    return values;
  }
  function onlineBoardEntryKey(entry){
    if(!entry || !entry.card) return '';
    return entry.card.iid != null ? String(entry.card.iid) : `${entry.card.id || 'card'}:${entry.z}:${entry.r}:${entry.c}`;
  }
  function onlineBoardAddedEntries(previousBoard, currentBoard){
    const added = [];
    collectOnlineBoardSnapshot(currentBoard).forEach(function(entry, key){
      if(previousBoard && previousBoard.has(key)) return;
      const priorAtCell = previousBoard ? boardSnapshotEntryAt(previousBoard, entry.z, entry.r, entry.c) : null;
      if(priorAtCell?.card?._spectatorHidden && entry?.card && !entry.card.faceDown) return;
      added.push(entry);
    });
    return added;
  }
  function onlineBoardRemovedEntries(previousBoard, currentBoard){
    const current = collectOnlineBoardSnapshot(currentBoard);
    return onlineBoardSnapshotValues(previousBoard).filter(function(entry){
      const key = onlineBoardEntryKey(entry);
      if(!key || current.has(key)) return false;
      const nextAtCell = boardSnapshotEntryAt(current, entry.z, entry.r, entry.c);
      if(entry?.card?._spectatorHidden && nextAtCell?.card && !nextAtCell.card.faceDown) return false;
      return true;
    });
  }
  function onlineBoardFlippedFaceUpEntries(previousBoard, currentBoard){
    const current = collectOnlineBoardSnapshot(currentBoard);
    const flipped = [];
    onlineBoardSnapshotValues(previousBoard).forEach(function(prev){
      const key = onlineBoardEntryKey(prev);
      let next = key ? current.get(key) : null;
      if(!next && prev?.card?._spectatorHidden) next = boardSnapshotEntryAt(current, prev.z, prev.r, prev.c);
      if(!next || !prev.card || !next.card) return;
      if(prev.card.faceDown && !next.card.faceDown) flipped.push(next);
    });
    return flipped;
  }
  function collectOnlineRemotePresentationSnapshot(g){
    const players = Array.isArray(g?.players) ? g.players.map(function(player){
      return {
        hand:Array.isArray(player?.hand) ? player.hand.length : 0,
        deck:Array.isArray(player?.deck) ? player.deck.length : 0,
        discard:Array.isArray(player?.discard) ? player.discard.length : 0
      };
    }) : [];
    return {
      board:collectOnlineBoardSnapshot(g?.board),
      players
    };
  }
  const shownOnlinePresentationEventKeys = new Set();
  const pendingOnlinePresentationRetryKeys = new Set();
  const onlinePresentationRetryCounts = new Map();
  function onlineConsolidationPresentationRetryKey(action, event){
    const target = event?.target || {};
    return onlineRemotePresentationKey(action, [
      'presentation-consolidate-retry',
      Number(event?.playerIndex),
      Number(target.z),
      Number(target.r),
      Number(target.c),
      String(event?.resultCard?.iid || event?.card?.iid || '')
    ].join(':'));
  }
  function scheduleOnlineConsolidationPresentationRetry(action, event, reason){
    if(!action || !event) return false;
    const key = onlineConsolidationPresentationRetryKey(action, event);
    const attempts = Number(onlinePresentationRetryCounts.get(key) || 0);
    if(attempts >= 12) return false;
    if(pendingOnlinePresentationRetryKeys.has(key)) return true;
    pendingOnlinePresentationRetryKeys.add(key);
    onlinePresentationRetryCounts.set(key, attempts + 1);
    const delay = 70 + attempts * 45;
    recordOnlineDiagnostic('online-consolidation-presentation-retry-scheduled', {
      reason:String(reason || ''),
      seq:Number(action?.seq || 0) || 0,
      attempt:attempts + 1,
      delay
    });
    setTimeout(function(){
      pendingOnlinePresentationRetryKeys.delete(key);
      try{
        maybeShowOnlinePresentationEvents(action);
      }catch(e){
        console.warn('Online consolidation presentation retry failed', e);
      }
    }, delay);
    return true;
  }
  function maybeShowOnlineConsolidationPresentationEvent(action, event){
    const g = gameState();
    if(!g || !event) return false;
    const localIndex = onlineLocalPlayerIndex();
    const playerIndex = Number(event.playerIndex);
    if(!Number.isInteger(localIndex) && !isRemoteOnlineAction(action)) return false;
    if(event.localActorAlreadyPresented && Number.isInteger(localIndex) && Number.isInteger(playerIndex) && localIndex === playerIndex){
      recordOnlineDiagnostic('online-consolidation-presentation-skip-local-echo', {
        seq:Number(action?.seq || 0) || 0,
        playerIndex
      });
      return true;
    }
    const target = event.target || {};
    const z = Number(target.z), r = Number(target.r), c = Number(target.c);
    if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return false;
    const boardCard = g.board?.[z]?.[r]?.[c] || null;
    const resultCard = expandOnlineCard(event.resultCard || event.card || boardCard);
    if(!resultCard) return false;
    const resultEntry = {z, r, c, card:resultCard};
    const removedEntries = (Array.isArray(event.tributes) ? event.tributes : []).map(function(tribute){
      return {
        z:Number(tribute?.z),
        r:Number(tribute?.r),
        c:Number(tribute?.c),
        card:expandOnlineCard(tribute?.card || null)
      };
    }).filter(function(entry){
      return Number.isInteger(entry.z) && Number.isInteger(entry.r) && Number.isInteger(entry.c) && entry.card;
    });
    const targetRectReady = !!onlineBoardCellRect(z, r, c);
    if(!targetRectReady){
      if(scheduleOnlineConsolidationPresentationRetry(action, event, 'target-rect-not-ready')){
        return false;
      }
    }
    const motion = emitOnlineRemoteConsolidationPresentation(g, resultEntry, removedEntries, action, 'presentation-event-consolidate');
    if(!motion && removedEntries.length && scheduleOnlineConsolidationPresentationRetry(action, event, 'direct-motion-not-started')){
      return false;
    }
    let cinematic = false;
    if(!resultCard.faceDown && onlineCardType(resultCard) !== 'Supporter'){
      const estimatedMotionMs = estimateOnlineConsolidationMotionMs({tributes:removedEntries});
      cinematic = showOnlineRemoteConsolidationCinematicForEntry(g, resultEntry, action, 'presentation-event-consolidate', {
        force:true,
        waitForMotion:motion,
        delayMs:160,
        maxWaitMs:estimatedMotionMs + 1800
      });
    }
    if(!motion && removedEntries.length) playOnlineRemoteRemovalAudio(removedEntries.length, {consolidation:true});
    if(!motion && !cinematic) playOnlineRemotePlacementAudio(resultCard, 120);
    if(boardCard && typeof window.scheduleCoordinatorPlacementFlash === 'function'){
      const estimatedMotionMs = motion ? estimateOnlineConsolidationMotionMs({tributes:removedEntries}) : 0;
      window.scheduleCoordinatorPlacementFlash(boardCard, {
        z,
        r,
        c,
        source:'online-consolidation-completed',
        delayMs:estimatedMotionMs + onlineConsolidationCinematicTotalMs() + 260,
        soundKey:'coord-online-consolidation:' + String(boardCard.iid || boardCard.id || 'card') + ':' + String(action?.seq || g.turn || 0)
      });
    }
    const balladEffects = Number.isInteger(playerIndex) && Array.isArray(g._balladEffects?.[playerIndex])
      ? g._balladEffects[playerIndex].filter(function(fx){ return fx && fx.active && !fx.ended; })
      : [];
    if(boardCard && balladEffects.length && typeof window.flashCardEffect === 'function'){
      const balladKey = [String(action?.seq || action?.clientActionId || 'pending'), 'kvetka_ballad', String(boardCard.iid || boardCard.id || 'card')].join(':');
      if(rememberOnlineEffectFlashKey(balladKey)){
        const pitchStep = balladEffects.reduce(function(highest, fx){
          return Math.max(highest, Math.max(0, Number(fx.pitchStep) || 0));
        }, 0);
        window.flashCardEffect(boardCard, 'kvetka_ballad', {
          label:'A Noble Effort at a Ballad',
          soundKey:'online-client:' + balladKey,
          pitchStep,
          waitForConsolidationCinematic:true
        });
      }
    }
    recordOnlineDiagnostic('online-consolidation-presentation-event', {
      seq:Number(action?.seq || 0) || 0,
      playerIndex:Number.isInteger(playerIndex) ? playerIndex : null,
      cardId:String(resultCard.id || ''),
      tributeCount:removedEntries.length,
      motion:!!motion,
      cinematic:!!cinematic,
      z,
      r,
      c
    });
    return !!(motion || cinematic);
  }
  function maybeShowOnlinePresentationEvents(action){
    const events = Array.isArray(action?.payload?.presentationEvents) ? action.payload.presentationEvents : [];
    if(!events.length) return false;
    const seq = Number(action?.seq || 0) || 0;
    let shown = false;
    events.forEach(function(event, index){
      const type = String(event?.type || '').toUpperCase();
      const key = (seq || String(action?.clientActionId || '')) + ':' + index + ':' + type;
      if(shownOnlinePresentationEventKeys.has(key)) return;
      let eventShown = false;
      if(type === 'WINE_COUNTRY_GUERILLA_SENT'){
        if(typeof window.showWineCountryGuerillaSentBanner === 'function') window.showWineCountryGuerillaSentBanner({durationMs:3600});
        else if(window.toast) toast(String(event.message || 'Wine Country Guerilla was sent to opponent\'s hand.'), 3600);
        eventShown = true;
      } else if(type === 'CONSOLIDATION_COMPLETED'){
        eventShown = maybeShowOnlineConsolidationPresentationEvent(action, event);
      }
      if(eventShown){
        if(type === 'CONSOLIDATION_COMPLETED'){
          const retryKey = onlineConsolidationPresentationRetryKey(action, event);
          pendingOnlinePresentationRetryKeys.delete(retryKey);
          onlinePresentationRetryCounts.delete(retryKey);
        }
        shownOnlinePresentationEventKeys.add(key);
        if(shownOnlinePresentationEventKeys.size > 120){
          const first = shownOnlinePresentationEventKeys.values().next().value;
          if(first) shownOnlinePresentationEventKeys.delete(first);
        }
        shown = true;
      }
    });
    return shown;
  }
  function isOnlineConsolidationCompletionAction(action){
    const rawType = String(action?.type || '').toUpperCase();
    const payload = action?.payload || {};
    const actionKind = String(payload.actionKind || payload.originalType || '').toUpperCase();
    const type = rawType === 'ACTION_RESULT' && actionKind ? actionKind : rawType;
    if(type === 'SELECT_CONSOLIDATION_TRIBUTE') return true;
    if(type === 'CLICK_CELL' && !payload.placing) return true;
    return false;
  }
  function playOnlineRemotePlacementAudio(card, delayMs){
    if(!card) return;
    const delay = Math.max(0, Number(delayMs) || 0);
    setTimeout(function(){
      try{
        if(typeof window.playCardSetAudio === 'function') window.playCardSetAudio(card);
        else if(typeof window.playCardSoundDeferred === 'function') window.playCardSoundDeferred(card.id, 0);
      }catch(e){}
    }, delay);
  }
  function playOnlineRemoteRemovalAudio(count, options){
    if(count <= 0) return;
    const isConsolidation = !!(options && options.consolidation);
    const max = Math.min(Number(count) || 0, 4);
    for(let i = 0; i < max; i++){
      setTimeout(function(){
        if(typeof window.playDiscardSfx === 'function') window.playDiscardSfx();
        else if(typeof window.playSfx === 'function') window.playSfx('discard');
        if(isConsolidation && i === 0 && typeof window.playSfx === 'function') setTimeout(function(){ window.playSfx('debuff'); }, 70);
      }, i * 90);
    }
  }
  function maybePlayOnlineRemotePileAudio(g, previousSnapshot, action, reason){
    if(!g || !previousSnapshot || !isRemoteOnlineAction(action) || typeof window.playSfx !== 'function') return false;
    const playerIndex = onlineActionPlayer(action);
    if(!Number.isInteger(playerIndex)) return false;
    const before = previousSnapshot.players?.[playerIndex] || {};
    const player = g.players?.[playerIndex] || {};
    const after = {
      hand:Array.isArray(player.hand) ? player.hand.length : 0,
      deck:Array.isArray(player.deck) ? player.deck.length : 0,
      discard:Array.isArray(player.discard) ? player.discard.length : 0
    };
    const handDelta = after.hand - (Number(before.hand) || 0);
    const deckDelta = after.deck - (Number(before.deck) || 0);
    const discardDelta = after.discard - (Number(before.discard) || 0);
    const key = onlineRemotePresentationKey(action, ['piles', handDelta, deckDelta, discardDelta, reason || ''].join(':'));
    if(!handDelta && !deckDelta && !discardDelta) return false;
    if(!markOnlineRemotePresentation(g, key)) return false;
    if(handDelta > 0 && deckDelta < 0){
      for(let i = 0; i < Math.min(handDelta, 3); i++){
        setTimeout(function(){
          if(!emitOnlineAcceptedPresentation('DRAW_CARD', {drawIndex:i, drawCount:handDelta, count:handDelta}, action, 'draw') && typeof window.playSfx === 'function') window.playSfx('draw');
        }, i * 95);
      }
    } else if(handDelta > 0){
      if(!emitOnlineAcceptedPresentation('SEARCH_TO_HAND', {count:handDelta}, action, 'search') && typeof window.playSfx === 'function') window.playSfx('searchFound');
    }
    if(discardDelta > 0){
      setTimeout(function(){
        if(!emitOnlineAcceptedPresentation('HAND_DISCARD', {count:discardDelta}, action, 'hand-discard')){
          if(typeof window.playDiscardSfx === 'function') window.playDiscardSfx();
          else if(typeof window.playSfx === 'function') window.playSfx('discard');
        }
      }, handDelta > 0 ? 120 : 0);
    }
    return true;
  }
  function onlineBoardDiffBelongsToRemotePlayer(g, previousSnapshot, action){
    if(!g || !previousSnapshot) return false;
    const localIndex = onlineLocalPlayerIndex();
    if(!Number.isInteger(localIndex)) return false;
    const actionPlayer = onlineActionPlayer(action);
    if(Number.isInteger(actionPlayer)) return actionPlayer !== localIndex;
    const owners = [];
    onlineBoardAddedEntries(previousSnapshot.board, g.board).forEach(function(entry){
      if(Number.isInteger(Number(entry?.card?.owner))) owners.push(Number(entry.card.owner));
    });
    onlineBoardRemovedEntries(previousSnapshot.board, g.board).forEach(function(entry){
      if(Number.isInteger(Number(entry?.card?.owner))) owners.push(Number(entry.card.owner));
    });
    onlineBoardFlippedFaceUpEntries(previousSnapshot.board, g.board).forEach(function(entry){
      if(Number.isInteger(Number(entry?.card?.owner))) owners.push(Number(entry.card.owner));
    });
    const current = collectOnlineBoardSnapshot(g.board);
    onlineBoardSnapshotValues(previousSnapshot.board).forEach(function(before){
      const key = onlineBoardEntryKey(before);
      const after = key ? current.get(key) : null;
      if(!after || !after.card) return;
      const owner = Number.isInteger(Number(after.card.owner)) ? Number(after.card.owner) : Number(before.card?.owner);
      if(!Number.isInteger(owner)) return;
      const moved = Number(before.z) !== Number(after.z) || Number(before.r) !== Number(after.r) || Number(before.c) !== Number(after.c);
      const oldFate = Number(before.card?.currentFate ?? before.card?.fate);
      const newFate = Number(after.card?.currentFate ?? after.card?.fate);
      const fateChanged = Number.isFinite(oldFate) && Number.isFinite(newFate) && oldFate !== newFate;
      if(moved || fateChanged) owners.push(owner);
    });
    return owners.length > 0 && owners.every(function(owner){ return owner !== localIndex; });
  }
  function maybePlayOnlineRemoteBoardChangeAudio(g, previousSnapshot, action, added, removed, reason, options){
    const forceRemote = !!(options && options.forceRemote);
    if(!g || !previousSnapshot || (!forceRemote && !isRemoteOnlineAction(action)) || typeof window.playSfx !== 'function') return false;
    const current = collectOnlineBoardSnapshot(g.board);
    let moved = 0;
    let fateUp = 0;
    let fateDown = 0;
    onlineBoardSnapshotValues(previousSnapshot.board).forEach(function(before){
      const key = onlineBoardEntryKey(before);
      const after = key ? current.get(key) : null;
      if(!after || !after.card) return;
      if(Number(before.z) !== Number(after.z) || Number(before.r) !== Number(after.r) || Number(before.c) !== Number(after.c)) moved++;
      const oldFate = Number(before.card?.currentFate ?? before.card?.fate);
      const newFate = Number(after.card?.currentFate ?? after.card?.fate);
      if(Number.isFinite(oldFate) && Number.isFinite(newFate) && oldFate !== newFate){
        if(newFate > oldFate) fateUp++;
        else fateDown++;
      }
    });
    if(!moved && !fateUp && !fateDown) return false;
    const key = onlineRemotePresentationKey(action, ['board-change', moved, fateUp, fateDown, reason || ''].join(':'));
    if(!markOnlineRemotePresentation(g, key)) return false;
    const kvetkaCoordinatorGain = Array.isArray(added) && added.some(function(entry){
      return entry && entry.card && String(entry.card.id || '') === '19' && !entry.card.faceDown;
    });
    if(moved && !added.length && !removed.length && !window.FateMatchRendererAdapter) emitOnlineAcceptedPresentation('MOVE_CARD', {duration:170, path:'direct', noShadow:true, fastBoardMove:true}, action, 'move');
    if(fateUp && !kvetkaCoordinatorGain) setTimeout(function(){ emitOnlineAcceptedPresentation('FATE_GAIN', {fateDelta:fateUp}, action, 'fate-gain'); }, moved ? 90 : 0);
    if(fateDown) setTimeout(function(){ emitOnlineAcceptedPresentation('FATE_LOSS', {fateDelta:-fateDown, amount:fateDown}, action, 'fate-loss'); }, (moved || fateUp) ? 150 : 0);
    return true;
  }
  function maybePlayOnlineRemoteStatePresentation(g, previousSnapshot, action, reason){
    if(!g || !previousSnapshot) return false;
    const isRemote = isRemoteOnlineAction(action);
    const explicitPresentationShown = maybeShowOnlinePresentationEvents(action);
    if(explicitPresentationShown) return true;
    const inferredRemote = !isRemote && onlineBoardDiffBelongsToRemotePlayer(g, previousSnapshot, action);
    const forceBoardPresentation = !isRemote && (
      String(action?.type || '').toUpperCase() === 'ACTION_RESULT' ||
      isOnlineConsolidationCompletionAction(action)
    );
    const boardPlayed = maybePlayOnlineRemoteBoardPresentation(g, previousSnapshot.board, action, reason, {forcePresentation:forceBoardPresentation || inferredRemote});
    if(!isRemote && !inferredRemote && !boardPlayed) return false;
    const added = onlineBoardAddedEntries(previousSnapshot.board, g.board);
    const removed = onlineBoardRemovedEntries(previousSnapshot.board, g.board);
    const boardChanged = (isRemote || inferredRemote) ? maybePlayOnlineRemoteBoardChangeAudio(g, previousSnapshot, action, added, removed, reason, {forceRemote:inferredRemote}) : false;
    const pilesPlayed = isRemote ? maybePlayOnlineRemotePileAudio(g, previousSnapshot, action, reason) : false;
    return !!(boardPlayed || boardChanged || pilesPlayed);
  }
  function maybePlayOnlineRemoteBoardPresentation(g, previousBoard, action, reason, options){
    const forcePresentation = !!(options && options.forcePresentation);
    if(!g || (!forcePresentation && !isRemoteOnlineAction(action))) return false;
    const flipped = onlineBoardFlippedFaceUpEntries(previousBoard, g.board);
    if(flipped.length){
      flipped.forEach(function(entry, index){
        setTimeout(function(){
          const rect = onlineBoardCellRect(entry.z, entry.r, entry.c);
          const emitted = emitOnlineAcceptedPresentation('CARD_FLIP', {
            iid:entry.card?.iid || '',
            card:entry.card,
            z:entry.z,
            r:entry.r,
            c:entry.c,
            rect,
            targetRect:rect,
            duration:620,
            revealAt:.68
          }, action, 'card-flip');
          if(!emitted && window.FateV2CardMotionFx && typeof window.FateV2CardMotionFx.flipBoardCard === 'function') {
            window.FateV2CardMotionFx.flipBoardCard(entry.card, entry.z, entry.r, entry.c);
          }
          if(typeof window.playSfx === 'function') window.playSfx('cardFlip');
          if(entry.card && onlineCardType(entry.card) !== 'Supporter' && typeof window.showConsolidationCinematic === 'function') {
            try{
              if(typeof window.requestCharacterSetCinematic === 'function') {
                window.requestCharacterSetCinematic(entry.card, {z:entry.z, r:entry.r, c:entry.c, delayMs:650, source:'online-card-flip'});
              } else {
                g._cinematicUiLockUntil = Math.max(g._cinematicUiLockUntil || 0, Date.now() + 650 + onlineConsolidationCinematicTotalMs());
                setTimeout(function(){
                  window.showConsolidationCinematic(entry.card, {playVoice:true, playSfx:true, allowRenderV2Cinematic:true});
                }, 650);
              }
            }catch(e){}
          }
        }, index * 70);
      });
    }
    const added = onlineBoardAddedEntries(previousBoard, g.board);
    const removed = onlineBoardRemovedEntries(previousBoard, g.board);
    if(!added.length && !removed.length) return flipped.length > 0;
    const signature = added.map(e=>'+' + (e.card?.iid || e.card?.id || '') + '@' + e.z + ',' + e.r + ',' + e.c)
      .concat(removed.map(e=>'-' + (e.card?.iid || e.card?.id || '') + '@' + e.z + ',' + e.r + ',' + e.c))
      .join('|');
    const key = onlineRemotePresentationKey(action, signature || reason || 'board');
    if(!markOnlineRemotePresentation(g, key)) return false;
    const hasNewCharacter = added.some(function(entry){
      return entry && entry.card && !entry.card.faceDown && onlineCardType(entry.card) !== 'Supporter';
    });
    const consolidation = hasNewCharacter && removed.length > 0 && (
      isOnlineConsolidationCompletionAction(action) ||
      String(action?.type || '').toUpperCase() === 'ACTION_RESULT'
    );
    if(consolidation){
      const resultEntry = added.find(function(entry){
        return entry && entry.card && !entry.card.faceDown && onlineCardType(entry.card) !== 'Supporter';
      }) || added[0] || null;
      const targetRect = resultEntry ? onlineBoardCellRect(resultEntry.z, resultEntry.r, resultEntry.c) : null;
      const tributePayload = removed.map(function(entry, index){
        const rect = onlineBoardCellRect(entry.z, entry.r, entry.c);
        return {
          iid:entry.card?.iid,
          card:entry.card,
          z:entry.z,
          r:entry.r,
          c:entry.c,
          rect,
          index
        };
      });
      const emitted = emitOnlineAcceptedPresentation('CONSOLIDATE', {
        tributes:tributePayload,
        resultCard:resultEntry?.card || null,
        card:resultEntry?.card || null,
        faceDown:!!resultEntry?.card?.faceDown,
        resultCardIid:resultEntry?.card?.iid || '',
        targetIid:resultEntry?.card?.iid || '',
        target:resultEntry ? {z:resultEntry.z, r:resultEntry.r, c:resultEntry.c, card:resultEntry.card} : null,
        z:resultEntry?.z,
        r:resultEntry?.r,
        c:resultEntry?.c,
        targetRect
      }, action, 'consolidate');
      const estimatedMotionMs = estimateOnlineConsolidationMotionMs({tributes:tributePayload});
      const cinematic = showOnlineRemoteConsolidationCinematicForEntry(g, resultEntry, action, reason || 'remote authoritative board presentation', {
        force:true,
        waitForMotion:emitted,
        delayMs:160,
        maxWaitMs:estimatedMotionMs + 1800
      });
      if(removed.length && !emitted) playOnlineRemoteRemovalAudio(removed.length, {consolidation:true});
      if(!cinematic && resultEntry) playOnlineRemotePlacementAudio(resultEntry.card, 120);
      return true;
    }
    if(removed.length) {
      removed.forEach(function(entry, index){
        setTimeout(function(){
          if(!emitOnlineAcceptedPresentation('DISCARD_CARD', {iid:entry.card?.iid, card:entry.card}, action, 'discard')){
            if(typeof window.playDiscardSfx === 'function') window.playDiscardSfx();
            else if(typeof window.playSfx === 'function') window.playSfx('discard');
          }
        }, index * 80);
      });
    }
    added.forEach(function(entry, index){
      if(!entry || !entry.card) return;
      scheduleOnlineAutomaticPlacementPresentation(g, entry, action, {
        delayMs:onlineCardType(entry.card) === 'Supporter' ? index * 70 : 120 + index * 80,
        source:'online-remote-board-placement'
      });
    });
    recordOnlineDiagnostic('online-remote-board-audio', {
      actionType:String(action?.type || ''),
      added:added.length,
      removed:removed.length,
      reason:String(reason || '')
    });
    return true;
  }
  function playOnlineRemoteActionSound(type, payload, action){
    if(!isRemoteOnlineAction(action) || typeof window.playSfx !== 'function') return;
    const actionType = onlineEffectiveActionType(action) || String(type || action.type || '').toUpperCase();
    const fnName = String(payload?.fn || '');
    const remoteEffectActivation =
      (actionType === 'BOARD_ACTION' && /^(triggerCharacterEffect|activatePendingWhenSetEffect|activateVigilantes|activateExpeditionaryMove|activateLandscapeEventideMove|activateBusserMove|activateWodnyPotokYouth)$/i.test(fnName)) ||
      (actionType === 'MODAL_ACTION' && !!payload?.effectCinematic) ||
      (actionType === 'HAND_ACTION' && (/^activate(WineCountryGuerilla|SelvaIslandsPirate|SantaAnnaProsperity)FromHand$/i.test(fnName) || /^setMajaFromDeck$/i.test(fnName)));
    if(remoteEffectActivation && typeof window.playEffectActivationClickSfx === 'function') {
      window.playEffectActivationClickSfx({remote:true});
    } else if(remoteEffectActivation) {
      window.playSfx('effectActivate');
    } else if(actionType === 'END_TURN' || actionType === 'REACTION_CHOICE') {
      return;
    } else if(/^(PLACE_CARD|CLICK_CELL|SELECT_CONSOLIDATION_TRIBUTE|BOARD_ACTION|HAND_ACTION|MODAL_ACTION|PICK_CARDS_VISUAL|PICK_ZONE|PICK_AFFILIATION|PICK_LANDSCAPE_ZONE)$/i.test(actionType) && payload && payload.postState) {
      return;
    } else {
      window.playSfx('onlineRemote');
    }
  }
  function maybeShowOnlineEffectNegatedBanner(action, reason){
    const type = String(action?.type || '').toUpperCase();
    const payload = action?.payload || {};
    if(type !== 'REACTION_CHOICE' || String(payload.choice || '').toLowerCase() !== 'negate') return false;
    const g = gameState();
    const resolutionMode = String(payload.reactionResolution?.mode || 'negated') === 'suppressed' ? 'suppressed' : 'negated';
    const resolutionPromptId = String(payload.promptId || '') || ('seq:' + String(action?.seq || payload.clientActionId || ''));
    if(onlineImprovisorResolutionPromptIds.has(resolutionPromptId)) return false;
    onlineImprovisorResolutionPromptIds.add(resolutionPromptId);
    if(onlineImprovisorResolutionPromptIds.size > 80){
      const first = onlineImprovisorResolutionPromptIds.values().next().value;
      if(first) onlineImprovisorResolutionPromptIds.delete(first);
    }
    const key = onlineRemotePresentationKey(action, [
      'effect-' + resolutionMode,
      String(payload.promptId || ''),
      String(payload.optionIndex ?? ''),
      String(payload.reaction?.kind || '')
    ].join(':'));
    if(g && !markOnlineRemotePresentation(g, key)) return false;
    const kind = String(payload.reaction?.kind || '');
    const label = kind === 'havano' ? 'Havano Citizen'
      : kind === 'lydia' ? 'Lydia'
      : kind === 'secules' ? 'Mr. Secules'
      : 'Reaction';
    const resultWord = resolutionMode === 'suppressed' ? 'SUPPRESSED' : 'NEGATED';
    if(typeof window.playSfx === 'function') {
      if(resolutionMode === 'suppressed') window.playSfx('effectSuppressed');
      else window.playSfx('effectNegated');
    }
    if(typeof window.showEffectNegatedBanner === 'function'){
      window.showEffectNegatedBanner('EFFECT ' + resultWord + ' by ' + label);
    }else if(typeof window.showBlockedAnimation === 'function'){
      window.showBlockedAnimation('EFFECT ' + resultWord + ' by ' + label);
    }else if(typeof window.toast === 'function'){
      window.toast('Effect ' + resolutionMode + '.');
    }
    recordOnlineDiagnostic('online-effect-negated-banner', {
      reason:String(reason || ''),
      actionSeq:Number(action?.seq || 0) || 0,
      promptId:String(payload.promptId || ''),
      kind:label,
      resolutionMode
    });
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
  function isRemoteOpponentReplay(g){
    return !!(isOnlineMatchState(g)
      && g._onlineApplyingRemoteAction
      && Number.isInteger(g._onlineRemoteActionPlayer)
      && Number.isInteger(g._onlinePlayerIndex)
      && g._onlineRemoteActionPlayer !== g._onlinePlayerIndex);
  }
  function remoteOpponentPerspectiveText(message){
    let text = String(message || '').trim();
    if(!text) return text;
    text = text.replace(/^Added\s+(.+?)\s+to hand$/i, 'Opponent added $1 to their hand');
    text = text.replace(/^(.+?)\s+is ready to set immediately for free!?$/i, "Opponent's $1 is ready to set immediately for free!");
    text = text.replace(/^The next character added to your hand/i, "Opponent's next character added to their hand");
    text = text.replace(/\bfrom your deck\b/gi, "from opponent's deck");
    text = text.replace(/\byour deck\b/gi, "opponent's deck");
    text = text.replace(/\bfrom your hand\b/gi, "from opponent's hand");
    text = text.replace(/\byour hand\b/gi, "opponent's hand");
    text = text.replace(/\byour discard\b/gi, "opponent's discard");
    text = text.replace(/\byour discard pile\b/gi, "opponent's discard pile");
    text = text.replace(/\byou can set\b/gi, 'opponent can set');
    text = text.replace(/\byou drew\b/gi, 'opponent drew');
    text = text.replace(/\byou must\b/gi, 'opponent must');
    return text;
  }
  function shouldSuppressRemoteOpponentModal(g, title, bodyHtml, actions, opts){
    if(!isRemoteOpponentReplay(g)) return false;
    if(g?._onlineLocalModalBypass || window.__fateOnlineLocalModalBypass) return false;
    const titleText = String(title || '');
    const bodyText = String(bodyHtml || '');
    const actionLabels = Array.isArray(actions) ? actions.map(a=>String(a?.label || '')).join('|') : '';
    const text = [titleText, bodyText, actionLabels].join(' ');
    const hasPrivateChoiceCopy = /\b(search|choose|select|discard|add to hand|from your deck|from your hand|your deck|your hand|variable cost|tribute|rearrange|declare affiliation)\b/i.test(text);
    const hasActionButtons = Array.isArray(actions) && actions.some(a=>a && !a.hidden && !/^close$/i.test(String(a.label || '')));
    return hasPrivateChoiceCopy || hasActionButtons || !!(opts && opts.privateForActivePlayer);
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
  function markOnlineActionSeqApplied(seq, reason){
    const safeSeq = Math.max(0, Number(seq || 0) || 0);
    if(!safeSeq) return false;
    lastActionSeq = Math.max(lastActionSeq, safeSeq);
    lastAppliedActionSeq = Math.max(lastAppliedActionSeq, safeSeq);
    discardBufferedActionsThrough(lastAppliedActionSeq);
    const latest = gameState();
    if(latest){
      latest._onlineActionSeq = Math.max(Number(latest._onlineActionSeq || 0) || 0, lastActionSeq);
      latest._onlineAppliedActionSeq = lastAppliedActionSeq;
      latest._onlineLagPauseActive = false;
    }
    recordOnlineDiagnostic('online-action-seq-marked-applied', {
      seq:safeSeq,
      reason:String(reason || '')
    });
    reportActionProgress(lastAppliedActionSeq, {force:true});
    if(typeof evaluateLagPause === 'function') evaluateLagPause();
    return true;
  }
  async function resyncRejectedOnlineActionFromFly(code, reason){
    if(!code || !authorityHttpBaseUrl() || firebaseActionFallbackAllowed()) return false;
    authorityRejectedResyncAttempts += 1;
    authorityLastRejectedResyncReason = String(reason || 'rejected action');
    try{
      const after = Math.max(0, Number(lastAppliedActionSeq || 0) || 0);
      const data = await flyApiJson(`/api/rooms/${encodeURIComponent(code)}/resume?after=${after}&limit=120&includeState=1`);
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
    if(isRoomAlreadyEndedReason(reason)){
      recordOnlineDiagnostic('online-terminal-room-ended-correction-skipped', {
        reason:String(reason || '')
      });
      if(g) g._onlineLagPauseActive = false;
      if(typeof evaluateLagPause === 'function') evaluateLagPause();
      return;
    }
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
  function waitOnlineActionSettle(type, opts){
    const fast = !!(opts && opts.fast);
    const actionType = String(type || '');
    const frames = fast ? 1 : (/^END_TURN$/i.test(actionType)
      ? 10
      : (/^(CLICK_CELL|BOARD_ACTION|HAND_ACTION|MODAL_ACTION|PICK_CARDS_VISUAL|PICK_ZONE|PICK_AFFILIATION|PICK_LANDSCAPE_ZONE)$/i.test(actionType) ? 4 : 2));
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
  function waitForOnlineConsolidationCommit(payload){
    const hint = payload && payload.consolidationPresentation;
    const target = hint && hint.target;
    const z = Number(target?.z), r = Number(target?.r), c = Number(target?.c);
    if(!hint || !Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return Promise.resolve(false);
    const expectedIid = String(hint.resultCard?.iid || payload?.selectedHand?.iid || '');
    const startedAt = Date.now();
    return new Promise(resolve=>{
      const check = function(){
        const g = gameState();
        const card = g?.board?.[z]?.[r]?.[c] || null;
        const iidMatches = !expectedIid || String(card?.iid || '') === expectedIid;
        if(card && iidMatches && !g?._consolidating){
          resolve(true);
          return;
        }
        if(Date.now() - startedAt >= 3600){
          recordOnlineDiagnostic('online-consolidation-commit-wait-timeout', {
            z,
            r,
            c,
            expectedIid,
            foundIid:String(card?.iid || ''),
            hasConsolidating:!!g?._consolidating
          });
          resolve(false);
          return;
        }
        setTimeout(check, 60);
      };
      check();
    });
  }
  function waitForOnlineSetResolution(payload){
    const hintTarget = payload?.consolidationPresentation?.target || null;
    const target = hintTarget || payload || {};
    const z = Number(target.z), r = Number(target.r), c = Number(target.c);
    if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return Promise.resolve(false);
    const expectedIid = String(payload?.consolidationPresentation?.resultCard?.iid || payload?.selectedHand?.iid || '');
    const startedAt = Date.now();
    return new Promise(resolve=>{
      const check = function(){
        const card = gameState()?.board?.[z]?.[r]?.[c] || null;
        const iidMatches = !expectedIid || String(card?.iid || '') === expectedIid;
        if(card && iidMatches && !card._onlineSetResolutionPending && !card._onlineSetResolutionInFlight){
          resolve(true);
          return;
        }
        if(Date.now() - startedAt >= 5200){
          recordOnlineDiagnostic('online-set-resolution-wait-timeout', {
            z,
            r,
            c,
            expectedIid,
            foundIid:String(card?.iid || ''),
            pending:!!card?._onlineSetResolutionPending,
            inFlight:!!card?._onlineSetResolutionInFlight
          });
          resolve(false);
          return;
        }
        setTimeout(check, 40);
      };
      check();
    });
  }
  function isStrictCompactAuthorityAction(type){
    if(String(authorityReducerMode || '').toLowerCase() !== 'strict') return false;
    if(firebaseActionFallbackAllowed()) return false;
    return /^(END_TURN|CHOOSE_TURN|START_CONSOLIDATE|CLICK_CELL|PLACE_CARD|SELECT_CONSOLIDATION_TRIBUTE|SELECT_PENDING_MOVE_CELL|SELECT_BOARD_TARGET|BOARD_ACTION|HAND_ACTION|MODAL_ACTION|RESOLVE_MODAL|PICK_CARDS_VISUAL|RESOLVE_CARD_PICK|PICK_ZONE|PICK_LANDSCAPE_ZONE|RESOLVE_ZONE_PICK|PICK_AFFILIATION|RESOLVE_AFFILIATION_PICK|REACTION_CHOICE|FORFEIT|MATCH_RESULT)$/i.test(String(type || ''));
  }
  function strictCompactActionNeedsPostState(type, payload){
    const actionType = String(type || '').toUpperCase();
    if(isServerAuthoritativeBoardIntent(type, payload, gameState())) return false;
    if(actionType === 'BOARD_ACTION' && shouldUseStrictServerFirstBoardAction(payload)){
      const fn = String(payload?.fn || '');
      const id = String(payload?.cardId || payload?.card?.id || payload?.source?.card?.id || '');
      return fn === 'triggerCharacterEffect' && !/^(21|38|40)$/.test(id);
    }
    return isStrictCompactAuthorityAction(type)
      && (
        /^(START_CONSOLIDATE|BOARD_ACTION|HAND_ACTION|MODAL_ACTION|PICK_CARDS_VISUAL|PICK_ZONE|PICK_LANDSCAPE_ZONE|PICK_AFFILIATION|REACTION_CHOICE)$/i.test(actionType)
        || (actionType === 'CLICK_CELL' && !(payload && payload.placing))
      );
  }
  function shouldUseStrictServerFirstBoardAction(payload){
    if(String(authorityReducerMode || '').toLowerCase() !== 'strict') return false;
    if(firebaseActionFallbackAllowed()) return false;
    if(clientResolvedGameplayEnabled()) return false;
    const fn = String(payload?.fn || '');
    if(/^(activatePendingWhenSetEffect|discardBoardCard|flipFaceDownBoardCard|activateVigilantes|activateExpeditionaryMove|activateBusserMove|activateLandscapeEventideMove)$/i.test(fn)) return true;
    if(fn === 'triggerCharacterEffect') return true;
    return false;
  }
  function clientResolvedGameplayEnabled(){
    return String(window.FATE_GAMEPLAY_AUTHORITY || '').toLowerCase() === 'client-resolved'
      || localStorageFlag('fateClientResolvedGameplay');
  }
  function normalizedClientPendingInteraction(g){
    if(!g) return null;
    if(g.pendingInteraction && typeof g.pendingInteraction === 'object') return g.pendingInteraction;
    if(g._serverPendingReaction) return {kind:'reaction', bucket:'reaction', playerIndex:g._serverPendingReaction.playerIndex, promptId:g._serverPendingReaction.promptId || ''};
    if(g._serverPendingModalAction) return {kind:g._serverPendingModalAction.kind || 'modalAction', bucket:'modalAction', playerIndex:g._serverPendingModalAction.playerIndex, promptId:g._serverPendingModalAction.promptId || ''};
    if(g._serverPendingZonePick) return {kind:g._serverPendingZonePick.kind || 'zonePick', bucket:'zonePick', playerIndex:g._serverPendingZonePick.playerIndex, promptId:g._serverPendingZonePick.promptId || ''};
    if(g._serverPendingMove) return {kind:g._serverPendingMove.kind || 'move', bucket:'move', playerIndex:g._serverPendingMove.playerIndex, promptId:g._serverPendingMove.promptId || ''};
    if(g._serverPendingCardPick) return {kind:g._serverPendingCardPick.kind || 'cardPick', bucket:'cardPick', playerIndex:g._serverPendingCardPick.playerIndex, promptId:g._serverPendingCardPick.promptId || ''};
    if(g._consolidating) return {kind:g._consolidating.kind || 'consolidation', bucket:'consolidation', playerIndex:g._consolidating.playerIndex ?? g.currentPlayer, promptId:g._consolidating.promptId || ''};
    return null;
  }
  function isOptionalOnlineMovementKind(kind){
    return /^(breakfastBusserMove|busserAdjacentMove|landscapeEventideMove)$/i.test(String(kind || ''));
  }
  function isOptionalOnlineEndTurnPendingKind(kind){
    return /^(breakfastBusserMove|busserAdjacentMove|breakfastBusserGrantMove|breakfastBusserSelectSupporter|landscapeEventideMove|panaceaSailorsMove)$/i.test(String(kind || ''));
  }
  function hasOptionalOnlineMovementPending(g){
    if(!g) return false;
    if(g._busserMovingCard || g._landscapeMoving) return true;
    const pendingMove = g._serverPendingMove;
    if(pendingMove && isOptionalOnlineMovementKind(pendingMove.kind)) return true;
    const pending = normalizedClientPendingInteraction(g);
    return !!(pending && (String(pending.bucket || '') === 'move' || String(pending.kind || '') === 'move') && isOptionalOnlineMovementKind(pending.kind));
  }
  function cancelOptionalOnlineMovementForEndTurn(g, reason){
    const pending = g && normalizedClientPendingInteraction(g);
    const optionalPending = pending && isOptionalOnlineEndTurnPendingKind(pending.kind);
    if(!hasOptionalOnlineMovementPending(g) && !optionalPending) return false;
    g._busserMoving = null;
    g._busserMovingCard = null;
    g._landscapeMoving = null;
    if(g._serverPendingMove && isOptionalOnlineMovementKind(g._serverPendingMove.kind)){
      g._serverPendingMove = null;
    }
    if(g._serverPendingCardPick && isOptionalOnlineEndTurnPendingKind(g._serverPendingCardPick.kind)) g._serverPendingCardPick = null;
    if(g._serverPendingModalAction && isOptionalOnlineEndTurnPendingKind(g._serverPendingModalAction.kind)) g._serverPendingModalAction = null;
    if(g._serverPendingZonePick && isOptionalOnlineEndTurnPendingKind(g._serverPendingZonePick.kind)) g._serverPendingZonePick = null;
    const pendingInteraction = g.pendingInteraction;
    if(pendingInteraction && isOptionalOnlineEndTurnPendingKind(pendingInteraction.kind)){
      g.pendingInteraction = null;
    }
    g._onlineShownServerMovePromptId = '';
    g._onlineShownServerCardPickPromptId = '';
    g._onlineShownServerModalPromptId = '';
    g._onlineShownServerZonePickPromptId = '';
    onlineLocalActionGate = null;
    if(typeof window.clearPlaceHighlights === 'function') window.clearPlaceHighlights();
    if(typeof window.closeModal === 'function') {
      try{ window.closeModal(); }catch(e){}
    }
    recordOnlineDiagnostic('online-optional-movement-cancelled-for-end-turn', {
      reason:String(reason || ''),
      turn:Number(g.turn || 0) || 0,
      playerIndex:Number(g._onlinePlayerIndex)
    });
    return true;
  }
  function isHardOnlinePendingInteraction(pending){
    const bucket = String(pending?.bucket || pending?.kind || '');
    return /^(reaction|reactionChoice|consolidation|consolidate)$/i.test(bucket);
  }
  function clearOnlineClientEffectPending(g, reason){
    if(!g) return false;
    const pending = normalizedClientPendingInteraction(g);
    if(pending && isHardOnlinePendingInteraction(pending)) return false;
    const hadPending = !!(
      pending ||
      g._serverPendingMove ||
      g._serverPendingZonePick ||
      g._serverPendingCardPick ||
      g._serverPendingModalAction ||
      g.pendingInteraction ||
      g._busserMoving ||
      g._busserMovingCard ||
      g._landscapeMoving ||
      g._boardTargeting
    );
    if(!hadPending) return false;
    g._serverPendingMove = null;
    g._serverPendingZonePick = null;
    g._serverPendingCardPick = null;
    g._serverPendingModalAction = null;
    g.pendingInteraction = null;
    g._busserMoving = null;
    g._busserMovingCard = null;
    g._landscapeMoving = null;
    g._boardTargeting = null;
    g._onlineShownServerMovePromptId = '';
    g._onlineShownServerCardPickPromptId = '';
    g._onlineShownServerModalPromptId = '';
    g._onlineShownServerZonePickPromptId = '';
    onlineLocalActionGate = null;
    if(typeof window.clearPlaceHighlights === 'function') window.clearPlaceHighlights();
    recordOnlineDiagnostic('online-client-effect-pending-cleared', {
      reason:String(reason || ''),
      pendingKind:String(pending?.kind || ''),
      pendingBucket:String(pending?.bucket || ''),
      actionPlayer:Number(g._onlinePlayerIndex)
    });
    return true;
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
  function isServerAuthoritativeBoardIntent(type, payload, g){
    if(String(authorityReducerMode || '').toLowerCase() !== 'strict') return false;
    if(firebaseActionFallbackAllowed()) return false;
    if(clientResolvedGameplayEnabled()) return false;
    const intent = toAuthorityIntent(type, payload || null, g || gameState());
    return /^(PLACE_CARD|START_CONSOLIDATE|SELECT_CONSOLIDATION_TRIBUTE|SELECT_PENDING_MOVE_CELL)$/i.test(String(intent || ''));
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
    if(bucket === 'zonePick' || bucket === 'pickZone' || bucket === 'landscapeZone') return actionType === 'RESOLVE_ZONE_PICK';
    if(bucket === 'move' || bucket === 'pickMove') return actionType === 'SELECT_PENDING_MOVE_CELL' || (actionType === 'END_TURN' && isOptionalOnlineEndTurnPendingKind(pending.kind));
    if(bucket === 'cardPick' || bucket === 'pickCards') return actionType === 'RESOLVE_CARD_PICK';
    if(bucket === 'consolidation' || bucket === 'consolidate') return actionType === 'SELECT_CONSOLIDATION_TRIBUTE';
    return false;
  }
  function pendingInteractionLabel(pending){
    return String(pending?.message || pending?.kind || pending?.bucket || 'effect');
  }
  function runClientResolvedPlacementWithoutPresentation(fn){
    const presenter = window.FateActionPresentation;
    if(!clientResolvedGameplayEnabled() || !presenter || typeof presenter.beginSetCard !== 'function'){
      return fn();
    }
    const originalBeginSetCard = presenter.beginSetCard;
    presenter.beginSetCard = function(){
      recordOnlineDiagnostic('client-resolved-placement-presentation-bypassed', {
        reason:'commit-before-action-result-capture'
      });
      return false;
    };
    try{
      return fn();
    }finally{
      presenter.beginSetCard = originalBeginSetCard;
    }
  }
  function shouldRunForcedSyncForRoomSeq(roomSeq){
    const seq = Number(roomSeq || 0) || 0;
    if(seq <= 1) return true;
    return seq <= lastTurnBoundaryActionSeq;
  }
  function isClientResolvedGameplayAction(type){
    return /^(END_TURN|CLICK_CELL|PLACE_CARD|SELECT_PENDING_MOVE_CELL|SELECT_CONSOLIDATION_TRIBUTE|START_CONSOLIDATE|BOARD_ACTION|HAND_ACTION|MODAL_ACTION|PICK_CARDS_VISUAL|PICK_ZONE|PICK_AFFILIATION|PICK_LANDSCAPE_ZONE|REACTION_CHOICE)$/i.test(String(type || ''));
  }
  function isStrictGameplayAction(type){
    return isStrictCompactAuthorityAction(type) && !clientResolvedGameplayEnabled();
  }
  function hasPendingAuthorityReplay(){
    const g = gameState();
    const knownSeq = Math.max(Number(lastActionSeq || 0) || 0, Number(g?._onlineActionSeq || 0) || 0);
    const appliedSeq = Math.max(Number(lastAppliedActionSeq || 0) || 0, Number(g?._onlineAppliedActionSeq || 0) || 0);
    return knownSeq > appliedSeq || actionReplayBuffer.size > 0;
  }
  function canCaptureClientResolvedBeforeLocalPromise(type, payload){
    if(!clientResolvedGameplayEnabled()) return false;
    const actionType = String(type || '').toUpperCase();
    // Gameplay effects and placements can continue mutating the hand/board after
    // their initial click returns. Only the turn choice is genuinely complete
    // before its returned promise settles.
    return actionType === 'CHOOSE_TURN';
  }
  function isClientOwnedEffectBoardAction(type, payload){
    // Effect activation enters local selection immediately; its resolved state is synchronized afterward.
    return clientResolvedGameplayEnabled()
      && String(type || '').toUpperCase() === 'BOARD_ACTION'
      && /^(triggerCharacterEffect|activatePendingWhenSetEffect|activateVigilantes|activateExpeditionaryMove|activateLandscapeEventideMove|activateBusserMove|activateWodnyPotokYouth)$/i.test(String(payload?.fn || ''));
  }
  const onlineSubmittedEffectActivations = new Map();
  function onlineBoardEffectActivationKey(fnName, card, pos){
    if(!card || !pos) return '';
    const iid = String(card.iid || card.instanceId || '');
    const id = String(card.id || '');
    const source = iid ? ('iid:' + iid) : ('pos:' + pos.z + ':' + pos.r + ':' + pos.c + ':id:' + id);
    return String(fnName || '').toLowerCase() + ':' + source;
  }
  function shouldRememberOnlineEffectActivation(fnName, card){
    const name = String(fnName || '');
    if(name === 'activatePendingWhenSetEffect') return true;
    if(name !== 'triggerCharacterEffect' || !card) return false;
    if(String(card.id || '') === '21') return true;
    return String(card.type || '') === 'Initiator';
  }
  function rememberOnlineEffectActivation(fnName, card, pos){
    if(!shouldRememberOnlineEffectActivation(fnName, card)) return;
    const key = onlineBoardEffectActivationKey(fnName, card, pos);
    if(!key) return;
    onlineSubmittedEffectActivations.set(key, Date.now());
    if(onlineSubmittedEffectActivations.size > 240){
      const cutoff = Date.now() - 15 * 60 * 1000;
      for(const [storedKey, storedAt] of onlineSubmittedEffectActivations.entries()){
        if(Number(storedAt || 0) < cutoff) onlineSubmittedEffectActivations.delete(storedKey);
      }
    }
  }
  function onlineEffectActivationWasSubmitted(fnName, card, pos){
    const key = onlineBoardEffectActivationKey(fnName, card, pos);
    return !!(key && onlineSubmittedEffectActivations.has(key));
  }
  window.fateOnlineEffectActivationWasSubmitted = function(fnName, card, pos){
    if(!shouldRememberOnlineEffectActivation(fnName, card)) return false;
    return onlineEffectActivationWasSubmitted(fnName, card, pos);
  };
  function onlineBoardEffectActivationBlockReason(g, fnName, pos){
    if(!g || !pos || !/^(triggerCharacterEffect|activatePendingWhenSetEffect)$/i.test(String(fnName || ''))) return '';
    const card = g.board?.[pos.z]?.[pos.r]?.[pos.c] || null;
    if(!card) return '';
    const id = String(card.id || '');
    if(card._reactionSuppressed || card._effectSuppressedByReaction || card._lydiaSuppressed){
      return String(card.name || 'That card') + '\'s effect is suppressed.';
    }
    if(card._onlineEffectActivationSubmitPending || card._effectActivationInFlight || card._pendingWhenSetActivationInFlight){
      return String(card.name || 'That card') + '\'s effect is already resolving.';
    }
    if(shouldRememberOnlineEffectActivation(fnName, card) && onlineEffectActivationWasSubmitted(fnName, card, pos)){
      return String(card.name || 'That card') + '\'s effect already activated.';
    }
    if(String(fnName || '') === 'activatePendingWhenSetEffect'){
      if(card.whenSetActivated === true || card.effectUsedInitial === true || !card._pendingWhenSetEffect){
        return String(card.name || 'That card') + '\'s effect already activated.';
      }
    }
    if(String(fnName || '') === 'triggerCharacterEffect' && card.type === 'Initiator' && card.effectUsedInitial && card._effectTurnLocked){
      return String(card.name || 'That card') + '\'s effect already activated.';
    }
    if(id === '21' && (card._onlineEffectActivationSubmitPending || card._henrySuppressionPicking || card.effectUsedInitial || (Array.isArray(card._henrySuppressionSquares) && card._henrySuppressionSquares.length > 0))){
      return 'Henry Dong has already selected suppression squares.';
    }
    return '';
  }
  function needsAuthorityCatchupBeforeLocal(type){
    return (
        (clientResolvedGameplayEnabled() && isClientResolvedGameplayAction(type)) ||
        isStrictGameplayAction(type)
      )
      && !!authorityHttpBaseUrl()
      && !firebaseActionFallbackAllowed()
      && hasPendingAuthorityReplay();
  }
  async function preflightAuthorityCatchupBeforeLocal(type){
    const code = gameState()?._onlineRoomCode || activeRoom;
    if(!code || !needsAuthorityCatchupBeforeLocal(type)) return false;
    return await catchUpFlyAuthorityReplay(code, 'before local optimistic ' + String(type || '').toUpperCase());
  }
  function enqueueOptimisticSend(task){
    const run = optimisticSendQueue.catch(()=>{}).then(task);
    optimisticSendQueue = run.catch(()=>{});
    return run;
  }
  function isClientResolvedStaleBaseError(err){
    return !!(err
      && err.authorityRejected
      && /stale baseStateHash/i.test(String(err.message || '')));
  }
  function sendOptimisticAction(type, payload, applyLocal){
    const clientActionId = makeOptimisticActionId(type);
    const outbound = Object.assign({}, payload || {}, { clientActionId });
    const clientOwnedEffectBoardAction = isClientOwnedEffectBoardAction(type, outbound);
    const serverAuthoritativeBoardIntent = isServerAuthoritativeBoardIntent(type, outbound, gameState());
    const clientResolvedCommit = clientResolvedGameplayEnabled()
      && isClientResolvedGameplayAction(type)
      && !serverAuthoritativeBoardIntent
      && (clientOwnedEffectBoardAction || !(String(type || '').toUpperCase() === 'BOARD_ACTION' && shouldUseStrictServerFirstBoardAction(outbound)));
    const compactAuthorityPayload = !clientResolvedCommit && isStrictCompactAuthorityAction(type);
    const authorityIntent = toAuthorityIntent(type, outbound, gameState());
    const authorityFirstPlacement = compactAuthorityPayload && authorityIntent === 'PLACE_CARD';
    const authorityFirstTurnChoice = authorityIntent === 'CHOOSE_TURN'
      && !!configuredAuthorityUrl()
      && !firebaseActionFallbackAllowed();
    let localResult;
    let localApplied = false;
    let finishLocalCommit = null;
    let finishActionGate = null;
    let staleBaseRetryCount = 0;
    let localBoardBeforeAction = null;
    let localActionRemovedBoardCards = false;
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
          .finally(()=>{
            if(finish) finish();
            if(finishActionGate){
              finishActionGate();
              finishActionGate = null;
            }
          });
      }).catch(e=>{
        if(isClientResolvedStaleBaseError(e) && staleBaseRetryCount < 2 && (clientResolvedCommit || compactAuthorityPayload)){
          staleBaseRetryCount += 1;
          const serverHash = String(e.serverStateHash || lastAuthorityStateHash || '');
          const code = gameState()?._onlineRoomCode || activeRoom;
          const preservesResolvedLocalState = clientResolvedCommit && !!serverHash && (
            String(type || '').toUpperCase() === 'END_TURN' || localActionRemovedBoardCards
          );
          const prepareRetry = !preservesResolvedLocalState && code && authorityHttpBaseUrl()
            ? catchUpFlyAuthorityReplay(code, 'stale base retry before ' + String(type || '').toUpperCase()).catch(()=>false)
            : Promise.resolve(false);
          return prepareRetry.then(()=>{
            if(serverHash) {
              lastAuthorityStateHash = serverHash;
              outbound.baseStateHash = serverHash;
            } else {
              delete outbound.baseStateHash;
            }
            if(clientResolvedCommit && !preservesResolvedLocalState) attachOnlinePostState(outbound);
            recordOnlineDiagnostic(clientResolvedCommit ? 'client-resolved-stale-base-retry' : 'strict-stale-base-retry', {
              actionType:String(type || '').toUpperCase(),
              retry:staleBaseRetryCount,
              baseStateHash:String(outbound.baseStateHash || ''),
              stateHash:String(outbound.stateHash || '')
            });
            return sendAuthorityNow();
          }).catch(retryErr=>{
            console.warn('Client-resolved stale-base retry capture failed', retryErr);
          });
        }
        console.error('Online optimistic action send failed', e, type, outbound);
        if(e && e.roomEnded){
          const roomCode = gameState()?._onlineRoomCode || activeRoom || lastLobbyRoom?.roomCode || '';
          recordOnlineDiagnostic('online-optimistic-send-room-ended', {
            actionType:String(type || '').toUpperCase(),
            roomCode:String(roomCode || '').toUpperCase()
          });
          if(gameState()) gameState()._onlineLagPauseActive = false;
          handleRoomEnded(lastLobbyRoom || {roomCode, status:'ended'});
        }else if(localApplied && clientOwnedEffectBoardAction){
          scheduleClientResolvedAutoCommit('client-owned-effect-send-failed', 180);
          recordOnlineDiagnostic('client-owned-effect-send-failed-kept-local', {
            actionType:String(type || '').toUpperCase(),
            fn:String(outbound.fn || ''),
            message:String(e && e.message || e || '')
          });
        }else if(localApplied) scheduleOptimisticCorrection(type);
        if(window.toast && !clientOwnedEffectBoardAction) toast(e && e.message ? e.message : 'Action failed');
      });
    }
    async function sendAfterLocalApply(){
      try{
        if(compactAuthorityPayload && !strictCompactActionNeedsPostState(type, outbound)) return sendAuthorityNow();
        const fastClientResolvedCapture = clientResolvedCommit && canCaptureClientResolvedBeforeLocalPromise(type, outbound);
        if(localResult && typeof localResult.then === 'function' && !fastClientResolvedCapture) await localResult;
        await waitOnlineActionSettle(type, {fast:fastClientResolvedCapture});
        if(localBoardBeforeAction){
          localActionRemovedBoardCards = rememberOnlineIntentionalBoardRemovals(
            localBoardBeforeAction,
            gameState()?.board,
            String(type || '') + ':' + String(outbound.fn || outbound.actionKind || '')
          ) || localActionRemovedBoardCards;
        }
        if(outbound.consolidationPresentation) await waitForOnlineConsolidationCommit(outbound);
        const placementIntent = toAuthorityIntent(type, outbound, gameState()) === 'PLACE_CARD';
        if(clientResolvedCommit && (placementIntent || outbound.consolidationPresentation)){
          await waitForOnlineSetResolution(outbound);
        }
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
        if(localApplied && clientOwnedEffectBoardAction){
          scheduleClientResolvedAutoCommit('client-owned-effect-capture-failed', 180);
          recordOnlineDiagnostic('client-owned-effect-capture-failed-kept-local', {
            actionType:String(type || '').toUpperCase(),
            fn:String(outbound.fn || ''),
            message:String(e && e.message || e || '')
          });
        }else if(localApplied) scheduleOptimisticCorrection(type);
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
      if(compactAuthorityPayload && !authorityFirstPlacement && !authorityFirstTurnChoice) stampBaseStateHash();
      if(authorityFirstPlacement || authorityFirstTurnChoice){
        const pendingState = gameState();
        if(authorityFirstPlacement && pendingState && isOnlineMatchState(pendingState)){
          clearOnlinePlacementIntent(pendingState);
          pendingState.placing = false;
          pendingState.selectedHandCard = null;
          if(typeof clearPlaceHighlights === 'function') clearPlaceHighlights();
          if(typeof renderHand === 'function') renderHand();
        }
        stampBaseStateHash();
        return sendAuthorityNow();
      }
      finishLocalCommit = clientResolvedCommit ? noteClientResolvedLocalCommitStart() : null;
      if(typeof applyLocal === 'function'){
        try{
          rememberOptimisticAction(clientActionId);
          localApplied = true;
          localBoardBeforeAction = cloneOnlinePlain(gameState()?.board || null);
          localResult = applyLocal();
        }catch(e){
          if(finishLocalCommit) finishLocalCommit();
          if(finishActionGate){
            finishActionGate();
            finishActionGate = null;
          }
          optimisticAppliedActionIds.delete(clientActionId);
          console.error('Optimistic local action threw', e, type, outbound);
          throw e;
        }
      }
      Promise.resolve(sendAfterLocalApply()).finally(()=>{
        if(finishLocalCommit) finishLocalCommit();
        if(finishActionGate){
          finishActionGate();
          finishActionGate = null;
        }
      });
      scheduleClientResolvedAutoCommit('post-local-' + String(type || '').toLowerCase(), clientResolvedCommit ? 90 : 700);
      scheduleFollowupStateSync(1250);
      return localResult;
    }
    const latestBeforeLocal = gameState();
    if(!clientOwnedEffectBoardAction && isOnlineMatchState(latestBeforeLocal) && !canSendLocalAction(latestBeforeLocal, type)) return;
    if(clientOwnedEffectBoardAction){
      if(!isOnlineMatchState(latestBeforeLocal) || latestBeforeLocal._onlineApplyingRemoteAction || activeOnlineRoomEnded()) return;
      const localIndex = resolveOnlineLocalPlayerIndex('client-owned-effect-activation');
      if(latestBeforeLocal._isSpectator || latestBeforeLocal._onlineRole === 'spectator' || localIndex === null) return;
    }else{
      finishActionGate = noteOnlineLocalActionGate(type);
      if(!finishActionGate) return;
    }
    if(!clientOwnedEffectBoardAction && needsAuthorityCatchupBeforeLocal(type)){
      return preflightAuthorityCatchupBeforeLocal(type)
        .then(()=>applyLocalAndSend())
        .catch(e=>{ if(finishActionGate) finishActionGate(); throw e; });
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

  function recordOnlineDiagnostic(event, data){
    try{
      const perf = window.__fatePerf = window.__fatePerf || {};
      const timeline = perf.onlineDiagnosticsTimeline = Array.isArray(perf.onlineDiagnosticsTimeline) ? perf.onlineDiagnosticsTimeline : [];
      timeline.push(Object.assign({at:Date.now(), event:String(event || '')}, data || {}));
      if(timeline.length > 80) timeline.splice(0, timeline.length - 80);
    }catch(e){}
  }

  function isRoomAlreadyEndedReason(reason){
    return /room already ended/i.test(String(reason && reason.message || reason || ''));
  }

  function activeOnlineRoomEnded(){
    const g = gameState();
    const code = String(g?._onlineRoomCode || activeRoom || '').toUpperCase();
    const roomCode = String(lastLobbyRoom?.roomCode || '').toUpperCase();
    return !!(lastLobbyRoom && lastLobbyRoom.status === 'ended' && (!code || !roomCode || code === roomCode));
  }

  function canSendLocalAction(g, type){
    if(!isOnlineMatchState(g)) return false;
    if(g._onlineApplyingRemoteAction) return false;
    const actionType = String(type || '').toUpperCase();
    if(activeOnlineRoomEnded()){
      recordOnlineDiagnostic('online-local-action-blocked-room-ended', {
        actionType,
        roomCode:String(g._onlineRoomCode || activeRoom || '').toUpperCase()
      });
      if(window.toast) toast('Room ended');
      handleRoomEnded(lastLobbyRoom || {roomCode:g._onlineRoomCode || activeRoom, status:'ended'});
      return false;
    }
    const localIndex = resolveOnlineLocalPlayerIndex('canSendLocalAction:' + actionType);
    if(g._isSpectator || g._onlineRole === 'spectator' || localIndex === null){
      if(window.toast) toast('Spectators cannot take game actions.');
      return false;
    }
    clearStaleClientResolvedLocalCommit(g, 'before-' + actionType.toLowerCase());
    if(resolvingEffectGateProtectsAction(actionType) && clientResolvedGameplayEnabled() && clientResolvedLocalCommitPending > 0){
      recordOnlineDiagnostic('client-resolved-action-waiting-for-commit', {
        actionType,
        localPending:clientResolvedLocalCommitPending,
        commitInFlight:clientResolvedCommitInFlight
      });
      if(window.toast) toast('Resolving effect. Please wait.');
      return false;
    }
    if(resolvingEffectGateProtectsAction(actionType) && onlineLocalActionGate && onlineLocalActionGate.until > Date.now()){
      recordOnlineDiagnostic('online-local-action-gate-blocked', {
        actionType,
        gateType:String(onlineLocalActionGate.type || ''),
        remainingMs:Math.max(0, onlineLocalActionGate.until - Date.now())
      });
      if(window.toast) toast('Resolving effect. Please wait.');
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
    if(!clientResolvedGameplayEnabled() && hasPendingAuthorityReplay()){
      recordOnlineDiagnostic('blocked-action-pending-authority-replay', {actionType});
      reportActionProgress(lastAppliedActionSeq, {force:true});
      if(typeof evaluateLagPause === 'function') evaluateLagPause();
      if(window.toast) toast('Match is syncing. Please wait.');
      return false;
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
    if(actionType === 'END_TURN' && pending && !isHardOnlinePendingInteraction(pending)){
      clearOnlineClientEffectPending(g, 'end-turn-before-pending-gate');
    } else if(actionType === 'BOARD_ACTION' && pending && !isHardOnlinePendingInteraction(pending)){
      clearOnlineClientEffectPending(g, 'board-action-before-pending-gate');
    }
    const activePending = normalizedClientPendingInteraction(g);
    if(activePending){
      const pendingPlayer = coerceOnlinePlayerIndex(activePending.playerIndex);
      if(pendingPlayer !== null && pendingPlayer !== localIndex){
        return false;
      }
      if(actionType && !actionMatchesPendingInteraction(actionType, activePending)){
        const bucket = String(activePending?.bucket || activePending?.kind || '');
        if(bucket === 'cardPick' || bucket === 'pickCards'){
          g._onlineShownServerCardPickPromptId = '';
        }
        if(bucket === 'zonePick' || bucket === 'pickZone') g._onlineShownServerZonePickPromptId = '';
        if(bucket === 'move' || bucket === 'pickMove') g._onlineShownServerMovePromptId = '';
        if(bucket === 'modalAction' || bucket === 'modal') g._onlineShownServerModalPromptId = '';
        setTimeout(maybeShowServerPendingPrompts, 0);
        return false;
      }
    }
    const turnAgnosticAction = /^(CHOOSE_TURN|REACTION_CHOICE|PICK_LANDSCAPE_ZONE)$/i.test(actionType);
    if(!turnAgnosticAction && Number(g.currentPlayer) !== localIndex){
      onlineTurnError();
      return false;
    }
    return true;
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

  function shouldGateOnlineLocalAction(type){
    const actionType = String(type || '').toUpperCase();
    return (clientResolvedGameplayEnabled() && isClientResolvedGameplayAction(actionType))
      || (isStrictGameplayAction(actionType) && /^(START_CONSOLIDATE|CLICK_CELL|PLACE_CARD|SELECT_CONSOLIDATION_TRIBUTE|SELECT_PENDING_MOVE_CELL|SELECT_BOARD_TARGET|BOARD_ACTION|HAND_ACTION|MODAL_ACTION|RESOLVE_MODAL|PICK_CARDS_VISUAL|RESOLVE_CARD_PICK|PICK_ZONE|PICK_LANDSCAPE_ZONE|RESOLVE_ZONE_PICK|PICK_AFFILIATION|RESOLVE_AFFILIATION_PICK|REACTION_CHOICE)$/i.test(actionType));
  }
  function resolvingEffectGateProtectsAction(type){
    return /^(CLICK_CELL|PLACE_CARD|SELECT_PENDING_MOVE_CELL|SELECT_CONSOLIDATION_TRIBUTE)$/i.test(String(type || '').toUpperCase());
  }

  function noteOnlineLocalActionGate(type){
    if(!shouldGateOnlineLocalAction(type)) return function noopOnlineLocalActionGate(){};
    if(!resolvingEffectGateProtectsAction(type)) return function noopOnlineLocalActionGate(){};
    const now = Date.now();
    if(onlineLocalActionGate && onlineLocalActionGate.until > now) return null;
    const token = {
      type:String(type || '').toUpperCase(),
      until:now + 2600
    };
    onlineLocalActionGate = token;
    let done = false;
    return function finishOnlineLocalActionGate(){
      if(done) return;
      done = true;
      if(onlineLocalActionGate === token) onlineLocalActionGate = null;
    };
  }

  function noteClientResolvedLocalCommitStart(){
    clientResolvedLocalCommitPending += 1;
    if(!clientResolvedLocalCommitStartedAt) clientResolvedLocalCommitStartedAt = Date.now();
    const startedAt = clientResolvedLocalCommitStartedAt;
    setTimeout(function(){
      if(clientResolvedLocalCommitStartedAt === startedAt) {
        clearStaleClientResolvedLocalCommit(gameState(), 'local-commit-watchdog');
      }
    }, 9000);
    let done = false;
    return function finishClientResolvedLocalCommit(){
      if(done) return;
      done = true;
      clientResolvedLocalCommitPending = Math.max(0, clientResolvedLocalCommitPending - 1);
      if(clientResolvedLocalCommitPending === 0) clientResolvedLocalCommitStartedAt = 0;
    };
  }

  function clientResolvedEffectUiIsActive(g){
    if(!g) return false;
    if(normalizedClientPendingInteraction(g)) return true;
    if(g.pendingEffect || g._reactionPending || g._onlineResolvingPickerAction) return true;
    if(g._onlineClientOwnedBoardActionPickerDepth > 0) return true;
    const hasLocalPicker = !!(g._onlinePendingPickCardsVisual || g._onlinePendingZonePicker || g._onlinePendingAffiliationPicker || g._onlinePendingLandscapeZonePicker);
    if(hasLocalPicker && document.getElementById('modal')?.classList.contains('on')) return true;
    if(document.getElementById('online-improvisor-reaction-root')) return true;
    return false;
  }

  function clearStaleClientResolvedLocalCommit(g, reason){
    if(clientResolvedLocalCommitPending <= 0 || !clientResolvedLocalCommitStartedAt) return false;
    const ageMs = Date.now() - clientResolvedLocalCommitStartedAt;
    if(ageMs < 1800 || clientResolvedEffectUiIsActive(g)) return false;
    const staleCount = clientResolvedLocalCommitPending;
    clientResolvedLocalCommitPending = 0;
    clientResolvedLocalCommitStartedAt = 0;
    onlineLocalActionGate = null;
    recordOnlineDiagnostic('client-resolved-stale-effect-lock-cleared', {
      reason:String(reason || ''),
      ageMs,
      staleCount,
      commitInFlight:clientResolvedCommitInFlight
    });
    scheduleClientResolvedAutoCommit('stale-effect-lock-cleared', 60);
    return true;
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
    if(!clientResolvedGameplayEnabled()) return false;
    if(clientResolvedLocalCommitPending > 0){
      scheduleClientResolvedAutoCommit(reason || 'local-commit-pending-retry', 90);
      return false;
    }
    if(clientResolvedCommitInFlight > 0){
      scheduleClientResolvedAutoCommit(reason || 'commit-in-flight-retry', 70);
      return false;
    }
    const g = gameState();
    if(!isOnlineMatchState(g) || g._onlineApplyingRemoteAction) return false;
    if(g._isSpectator || g._onlineRole === 'spectator' || !Number.isInteger(g._onlinePlayerIndex)) return false;
    if(g._onlineLagPauseActive) return false;
    if(g._serverPendingReaction || String(g.pendingInteraction?.kind || '') === 'reaction') return false;
    if(Number(g.currentPlayer) !== Number(g._onlinePlayerIndex)) return false;
    if(localConsolidationSelection && g._consolidating){
      recordOnlineDiagnostic('client-resolved-auto-commit-skipped-local-consolidation-selection', {
        reason:String(reason || ''),
        tributeCount:Array.isArray(localConsolidationSelection.tributes) ? localConsolidationSelection.tributes.length : 0
      });
      return false;
    }
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
      if(uid !== expectedUid || playerIndex !== g._coinWinner) continue;
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
    const u = getUser();
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
  async function publishOnlineMatchPlayable(){
    const g = gameState();
    const room = lastLobbyRoom || {};
    const code = g?._onlineRoomCode || activeRoom || room.roomCode || '';
    const u = getUser();
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
      const finish = function(reason, snap){
        if(settled) return;
        settled = true;
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
      const timeout = setTimeout(function(){
        finish('timeout', preloadReadySnapshot(lastLobbyRoom || room, lastLobbyPlayers, key));
      }, timeoutMs);
      const done = function(reason, snap){
        clearTimeout(timeout);
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
          if(!settled) setTimeout(poll, 1000);
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
  function waitForOnlineMatchPlayable(options){
    const opts = options || {};
    const g = gameState();
    const room = lastLobbyRoom || {};
    const code = g?._onlineRoomCode || activeRoom || room.roomCode || '';
    const key = currentMatchPreloadKey(room);
    const timeoutMs = Math.max(3000, Math.min(30000, Number(opts.timeoutMs) || 10000));
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
          if(!settled) setTimeout(poll, 1000);
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
    if(g && g.phase === 'main' && isOnlineMatchState(g) && !g._isSpectator && g._onlineRole !== 'spectator'){
      try{ if(typeof window.startTurnTimer === 'function') window.startTurnTimer(); }catch(e){}
    }
  }
  function clearDisconnectEndTimer(){
    if(disconnectEndTimer) clearTimeout(disconnectEndTimer);
    disconnectEndTimer = null;
  }
  function getQueuePartyTargetUid(){
    const u = getUser();
    const party = window.FATE_ONLINE_PARTY;
    if(!u || !party || !party.members) return '';
    return Object.keys(party.members).filter(Boolean).slice(0, 2).find(uid => uid !== u.uid) || '';
  }
  function isWaitingForPartyMember(){
    const u = getUser();
    const party = window.FATE_ONLINE_PARTY;
    if(!u || !party || !party.members) return false;
    return !Object.keys(party.members).filter(Boolean).slice(0, 2).some(uid => uid !== u.uid);
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
    cleanupTerminalOnlineRoomState('opponent-left');
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
    lastAuthorityStateHash = '';
    lobbyAuthorityPrejoinCode = '';
    lobbyAuthorityPrejoinAttempts = 0;
    lobbyAuthorityPrejoinNextAt = 0;
    actionReplayQueue = Promise.resolve();
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
          displayCardIds:Array.isArray(deck.displayCardIds) ? deck.displayCardIds.slice(0,5) : [],
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
          ? opt.displayCardIds.map(id=>sampleCards.find(c=>c.id === id)).filter(c=>c&&c.img).slice(0,5)
          : sampleCards.filter(c=>c.img).slice(0,5);
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
  function syncRoomChatToInGame(room){
    if(!room || typeof window.fateSetOnlineInGameMessages !== 'function') return;
    const entries = normalizeRoomChatEntries(room.chat)
      .sort((a,b)=>(Number(a.msg.createdAt || 0) || 0) - (Number(b.msg.createdAt || 0) || 0))
      .slice(-80);
    const key = entries.map(({id, msg})=>`${id}:${msg.seq || 0}:${msg.createdAt || 0}:${msg.text || ''}`).join('|');
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
  function matchmakingClientSession(){
    const params = authorityLaunchParams();
    if(electronRuntime()) return `electron:${String(params.get('electronSession') || 'default').slice(0, 48)}`;
    const key = 'fateMatchmakingClientSession';
    try{
      let value = String(sessionStorage.getItem(key) || '');
      if(!value){
        value = `web:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
        sessionStorage.setItem(key, value);
      }
      return value.slice(0, 80);
    }catch(e){
      return 'web:default';
    }
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
  function emitRandomQueueStatus(status, message, extra={}){
    const detail = { status, message, roomCode:randomQueueState.roomCode || '', role:randomQueueState.role || '', ...extra };
    try{ randomQueueState.handlers?.onStatus?.(detail); }catch(e){}
    window.dispatchEvent(new CustomEvent('fate-random-queue-status', { detail }));
  }
  async function removeOwnQueueEntry(){
    const u = getUser();
    if(u && (flyRoomsEnabled() || roomUsesFly(randomQueueState.roomCode))){
      await flyApiRequest('/api/matchmaking/leave', {
        method:'POST',
        body:{uid:u.uid, clientSession:matchmakingClientSession()}
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
  function cleanupTerminalOnlineRoomState(reason){
    const code = String(gameState()?._onlineRoomCode || activeRoom || randomQueueState.roomCode || '').trim().toUpperCase();
    removeOwnQueueEntry().catch(e=>console.warn('Terminal room queue cleanup failed', e));
    activeRoom = null;
    randomQueueState = { active:false, roomCode:null, role:null, started:false, handlers:null };
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
      g._onlineLagPauseActive = false;
      g._onlineBootstrappingRoomCode = null;
    }
    clearRoomWatchers();
    clearRandomQueueWatcher();
    if(typeof window.fateCleanupPlayerSpectatorBadge === 'function') window.fateCleanupPlayerSpectatorBadge();
    if(typeof setOnlinePlayableWaitVisible === 'function') setOnlinePlayableWaitVisible(false);
    if(code && typeof window.fateUnpublishLiveMatch === 'function') window.fateUnpublishLiveMatch(code);
    recordOnlineDiagnostic('online-terminal-room-cleanup', {reason:String(reason || ''), roomCode:code});
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

  // -- Reconnection heartbeat ------------------------------------------
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
      if(room.hostUid === u.uid && !room.guestUid && !opts.allowStarted){
        const params = authorityLaunchParams();
        recordOnlineDiagnostic('fly-join-same-session-as-host', {
          roomCode:String(room.roomCode || code || '').toUpperCase(),
          uid:String(u.uid || ''),
          electron:electronRuntime(),
          electronSession:String(params.get('electronSession') || '')
        });
        if(!quiet && window.toast){
          toast(electronRuntime()
            ? 'This Electron session is already the host. Open Guest or electron:p2 to join as player 2.'
            : 'This session is already the host. Use another account to join.');
        }
        return false;
      }
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
    const data = await flyApiRequest(`/api/rooms/${encodeURIComponent(code)}/resume?after=0&limit=240&includeState=1`);
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
    await resumeFlyRoom(room.roomCode, {silent:!!opts.silent});
    if(!opts.silent && window.toast) toast('Recovered online match ' + room.roomCode + '.');
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
    if(room.hostUid === u.uid){
      if(!quiet && window.toast) toast('This session is already the host. Use a separate Electron guest session or another account to join.');
      watchRoom(code, {silent:!!opts.silent});
      startConnectionHeartbeat(code, u.uid);
      return true;
    }
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
    let watchCatchupRunning = false;
    let lastWatchCatchupAt = 0;
    async function sendFlyHeartbeat(){
      const u = getUser();
      if(!u || Date.now() - lastHeartbeatAt < 30000) return;
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
        if(stopped) return;
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
      lastLobbyRoom = room;
      lastLobbyPlayers = room.players;
      maybePrejoinLobbyAuthority(room);
      if(activeRoomSilent) {
        // Keep the cached room fresh without reopening the lobby modal.
      }else{
        renderLobby(room, room.players);
      }
      evaluateLagPause();
      syncRoomChatToInGame(room);
      maybeHandleOpponentDisconnect(room, room.players);
      maybeAutoStartQueuedRoom(room, room.players);
      if(isStartedRoomStatus(room.status)) maybeStartRoomGame(room, 'fly-watch');
      maybeCatchUpFromFlyRoomWatch(room);
      if(room.status === 'ended') handleRoomEnded(room);
    }
    function maybeCatchUpFromFlyRoomWatch(room){
      if(!isStartedRoomStatus(room?.status)) return;
      const g = gameState();
      if(!isOnlineMatchState(g)) return;
      const roomSeq = Math.max(Number(room.lastActionSeq || 0) || 0, Number(lastActionSeq || 0) || 0);
      const appliedSeq = Math.max(Number(lastAppliedActionSeq || 0) || 0, Number(g._onlineAppliedActionSeq || 0) || 0);
      if(roomSeq <= appliedSeq) return;
      if(watchCatchupRunning || Date.now() - lastWatchCatchupAt < 1200) return;
      watchCatchupRunning = true;
      lastWatchCatchupAt = Date.now();
      catchUpFlyAuthorityReplay(code, 'fly-room-watch-seq-catchup', {
        includeState:true,
        limit:120,
        timeoutMs:30000
      }).finally(()=>{
        watchCatchupRunning = false;
      });
    }
    async function poll(){
      if(stopped) return;
      try{
        const data = await flyApiRequest(`/api/rooms/${encodeURIComponent(code)}`, { timeoutMs:12000 });
        notFoundCount = 0;
        if(data?.room) handleFlyRoom(data.room);
        await sendFlyHeartbeat();
      }catch(e){
        if(stopped) return;
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
            if(String(activeRoom || '').toUpperCase() === String(code || '').toUpperCase()) cleanupTerminalOnlineRoomState('fly-room-not-found');
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
          const activeMatch = isStartedRoomStatus(lastLobbyRoom && lastLobbyRoom.roomCode === code ? lastLobbyRoom.status : '');
          const socketReady = !!(configuredAuthorityUrl()
            && typeof WebSocket !== 'undefined'
            && authorityJoined
            && authorityWs
            && authorityWs.readyState === WebSocket.OPEN);
          const nextPollMs = watchingQueuedRoom ? 1000 : (activeMatch ? (socketReady ? 5000 : 1500) : 2500);
          timer = setTimeout(poll, nextPollMs);
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
    const u = getUser();
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
    if(current._flyRoom){
      cleanupRoomProfileSubs(null);
    }else{
      keep.forEach(ensureRoomProfile);
      cleanupRoomProfileSubs(keep);
    }

    const u = getUser();
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
        body:{uid:u.uid, seed, song, mode:normalizeRoomMode(room.mode)}
      });
      if(data?.accepted){
        rememberFlyStartAction(code, data.accepted.action);
        bufferOnlineAction(data.accepted.action);
      }
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
    const data = await flyApiRequest(`/api/rooms/${encodeURIComponent(code)}/events?after=0&limit=80`, { timeoutMs:12000 });
    const events = Array.isArray(data?.events) ? data.events : [];
    const matchStart = events.find(item=>String(item?.action?.type || '').toUpperCase() === 'MATCH_START');
    return rememberFlyStartAction(code, matchStart?.action) || null;
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
      const u = getUser();
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
      if(startPayload.postState && startPayload.stateHash){
        lastAuthorityStateHash = String(startPayload.stateHash || '');
        applyOnlineCanonicalState(startPayload.postState, 'server match bootstrap');
        applyOnlineRoomIdentity(room, players);
        markOnlineActionSeqApplied(startAction.seq || room.lastActionSeq || 1, 'server match bootstrap');
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

      if(window.toast) toast(roomMode === 'ranked' ? 'Challenger match ready.' : 'Online match ready.');
      subscribeActions(room.roomCode);
      setOnlinePlayableWaitVisible(false);
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

  function handleRemoteForfeitAction(action, reason){
    const localUid = String(getUser()?.uid || '');
    const actionUid = String(action?.uid || '');
    if(localUid && actionUid === localUid) return false;
    const g = gameState();
    if(!isOnlineMatchState(g)) return false;
    reconcileOnlinePostState(action, reason || ('server forfeit seq ' + (action?.seq || '?')));
    const rewardData = collectOnlineServerRewardData('victory', action, g);
    const bg = captureOnlineGameBackground();
    g._onlineResultMarked = true;
    if(window.toast) toast('Opponent forfeited');
    cleanupTerminalOnlineRoomState('remote-forfeit');
    closeModal();
    if(typeof cleanupGame === 'function') cleanupGame();
    showOnlineForfeitResult('victory', bg, {reason:'Opponent ended the match.', rewardData});
    if(typeof window.disbandOnlineParty === 'function'){
      window.disbandOnlineParty('Party disbanded after the match.', {silent:true}).catch(()=>{});
    }
    return true;
  }

  async function applyOnlineAction(action){
    const g = gameState();
    if(!isOnlineMatchState(g)) return;
    const type = String(action?.type || '').toUpperCase();
    const payload = action.payload || {};
    const localUid = getUser()?.uid;
    const optimisticActionId = optimisticActionIdFor(action);
    if(type === 'MATCH_START'){
      const seq = Number(action.seq || 0) || 0;
      if(seq && seq <= lastAppliedActionSeq){
        recordOnlineDiagnostic('duplicate-match-start-ignored', {
          seq,
          lastAppliedActionSeq
        });
        reportActionProgress(lastAppliedActionSeq, {force:true});
        return;
      }
      if(payload.postState && payload.stateHash){
        if(action.serverStateHash) lastAuthorityStateHash = String(action.serverStateHash || '');
        else lastAuthorityStateHash = String(payload.stateHash || '');
        reconcileOnlinePostState(action, 'server match bootstrap seq ' + (action.seq || '?'));
        markOnlineActionSeqApplied(seq || 1, 'server match bootstrap replay');
      }
      return;
    }
    if(shouldApplyServerStateDirectly(type, payload)){
      if(preserveLocalDragConsolidationStartState(action)) return true;
      if(type !== 'REACTION_CHOICE' && action.uid === localUid && optimisticActionId && optimisticAppliedActionIds.has(optimisticActionId) && !payloadHasServerReactionWindow(payload)){
        const hash = String(action?.serverStateHash || payload.stateHash || '');
        if(hash) lastAuthorityStateHash = hash;
        rememberOnlineAuthorityBoardSnapshot(payload.postState, hash || payload.stateHash);
        maybeShowOnlineEffectNegatedBanner(action, 'local reaction acknowledgement seq ' + (action.seq || '?'));
        markOnlineActionSeqApplied(action.seq || 0, 'local client-resolved acknowledgement without replay seq ' + (action.seq || '?'));
        scheduleServerPendingPromptChecks('local client-resolved acknowledgement seq ' + (action.seq || '?'));
        return;
      }
      maybeShowRemoteEffectCinematicForAction(g, action, 'online-direct-effect-cinematic');
      playOnlineRemoteActionSound(type, payload, action);
      applyAuthoritativePostState(action, 'client-resolved authoritative state seq ' + (action.seq || '?'));
      maybeShowOnlineEffectNegatedBanner(action, 'client-resolved authoritative state seq ' + (action.seq || '?'));
      if(type !== 'REACTION_CHOICE') maybeShowOnlinePresentationEvents(action);
      return;
    }
    const actionPlayer = onlineActionPlayer(action);
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
    maybeShowRemoteEffectCinematicForAction(g, action, 'online-precheck-effect-cinematic');

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
      setTimeout(()=>cleanupTerminalOnlineRoomState('disconnect-timeout'), 0);
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
      cleanupTerminalOnlineRoomState('match-result');
      if(typeof window.disbandOnlineParty === 'function'){
        window.disbandOnlineParty('Party disbanded after the match.', {silent:true}).catch(()=>{});
      }
      return;
    }

    if(type === 'FORFEIT'){
      handleRemoteForfeitAction(action, 'replayed server forfeit seq ' + (action.seq || '?'));
      return;
    }

    const turnAgnosticAction = type === 'CHOOSE_TURN' || type === 'REACTION_CHOICE';
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

    playOnlineRemoteActionSound(type, payload, action);

    if(shouldApplyServerStateDirectly(type, payload)){
      applyAuthoritativePostState(action, 'buffered authoritative state seq ' + (action.seq || '?'));
      maybeShowOnlinePresentationEvents(action);
      return true;
    }

    if(isStrictCompactAuthorityAction(type) && !shouldApplyServerStateDirectly(type, payload)){
      console.warn('Strict Fly authority action is missing canonical server state; skipping local replay', action);
      resyncRejectedOnlineAction('strict accepted action missing postState seq ' + (action.seq || '?')).catch(()=>{});
      return false;
    }

    await withLegacyRemoteReplayAction(async ()=>{
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
        if(!pending || pending.resolved || typeof pending.onChoose !== 'function') return;
        pending.resolved = true;
        g._onlinePendingLandscapeZonePicker = null;
        if(typeof window.fateFinishLandscapeZonePrompt === 'function') {
          window.fateFinishLandscapeZonePrompt(pending.guardToken);
        }
        const zone = Number(payload.zone);
        if(g.currentPlayer !== g._onlinePlayerIndex) g._onlineSilentEndTurnUntil = Date.now() + 700;
        await pending.onChoose(Number.isInteger(zone) ? zone : null);
        return;
      }
    }, actionPlayer);
    reconcileOnlinePostState(action, 'post-action mismatch seq ' + (action.seq || '?'));
    maybeShowOnlineEffectNegatedBanner(action, 'post-action mismatch seq ' + (action.seq || '?'));
    return true;
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
        const latest = gameState();
        if(latest){
          latest._onlineActionSeq = Math.max(Number(latest._onlineActionSeq || 0) || 0, lastActionSeq);
          latest._onlineAppliedActionSeq = lastAppliedActionSeq;
        }
        reportActionProgress(lastAppliedActionSeq, {turnBoundary:true});
        evaluateLagPause();
        continue;
      }
      try{
        const handled = await applyOnlineAction(action);
        if(handled === false){
          recordOnlineDiagnostic('online-action-replay-waiting-for-canonical-state', {
            seq:Number(action.seq || 0) || 0,
            type:String(action.type || ''),
            reason:'strict action missing postState'
          });
          reportActionProgress(lastAppliedActionSeq, {force:true});
          break;
        }
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

  const DEFAULT_FATE_FLY_API_URL = 'https://fates-entwined-main.fly.dev';
  const DEFAULT_FATE_FLY_WS_URL = 'wss://fates-entwined-main.fly.dev';

  function electronRuntime(){
    try{
      return /[?&]electron=1(?:&|$)/.test(location.search || '') || /Electron/i.test(navigator.userAgent || '');
    }catch(e){
      return false;
    }
  }

  function hostedFlyRuntime(){
    try{
      return String(location.hostname || '').toLowerCase() === 'fates-entwined-main.fly.dev';
    }catch(e){
      return false;
    }
  }

  function authorityLaunchParams(){
    try{ return new URLSearchParams(location.search || ''); }catch(e){ return new URLSearchParams(); }
  }

  function launchedWithLocalAuthority(){
    const params = authorityLaunchParams();
    return String(params.get('fateAuthority') || '').trim().toLowerCase() === 'local';
  }

  function localAuthorityUrl(value){
    return /^wss?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(String(value || '').trim());
  }

  function rtdbDisabledMode(){
    return localStorageFlag('fateRtdbDisabled') || window.FATE_RTDB_DISABLED === true;
  }

  function authorityHttpBaseUrl(){
    if(hostedFlyRuntime() && !launchedWithLocalAuthority()){
      return (location.origin || DEFAULT_FATE_FLY_API_URL).replace(/\/+$/, '');
    }
    try{
      const explicit = String(localStorage.getItem('fateFlyApiUrl') || '').trim();
      if(explicit && !(electronRuntime() && !launchedWithLocalAuthority() && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(explicit))) return explicit.replace(/\/+$/, '');
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
    // Fly authority actions are already persisted in the server event log.
    // Browser clients are not permitted to mirror accepted actions into RTDB.
    if(accepted?.flyEventLog) return true;
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
    else{
      const guest = getUser();
      if(guest?.isEphemeralGuest && guest.uid){
        headers['x-fate-guest-session'] = '1';
        headers['x-fate-guest-uid'] = String(guest.uid);
      }
    }
    const method = String(opts.method || 'GET').toUpperCase();
    const init = { method, headers };
    let timeoutMs = Math.min(60000, Math.max(1000, Number(opts.timeoutMs) || 10000));
    if(method === 'GET' && electronRuntime()){
      timeoutMs = Math.min(60000, Math.max(timeoutMs, 30000));
    }
    let timeoutTimer = 0;
    let controller = null;
    if(typeof AbortController !== 'undefined'){
      controller = new AbortController();
      init.signal = controller.signal;
      timeoutTimer = setTimeout(()=>{
        const timeoutError = new Error(`Fly authority ${method} ${path} timed out after ${timeoutMs}ms`);
        timeoutError.name = 'TimeoutError';
        timeoutError.fateFlyTimeout = true;
        controller.abort(timeoutError);
      }, timeoutMs);
    }
    if(opts.body !== undefined){
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(opts.body || {});
    }
    try{
      const res = await fetch(base + path, init);
      if(!res.ok){
        const text = await res.text().catch(()=>'');
        const err = new Error('Fly authority API failed: ' + res.status + (text ? ' ' + text.slice(0, 160) : ''));
        err.status = res.status;
        throw err;
      }
      return await res.json();
    }finally{
      if(timeoutTimer) clearTimeout(timeoutTimer);
    }
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
      endedBy:room.endedBy || '',
      endReason:room.endReason || '',
      winnerUid:room.winnerUid || '',
      loserUid:room.loserUid || '',
      winnerIndex:room.winnerIndex === 0 || room.winnerIndex === 1 ? Number(room.winnerIndex) : null,
      loserIndex:room.loserIndex === 0 || room.loserIndex === 1 ? Number(room.loserIndex) : null,
      result:room.result || null,
      chatSeq:Number(room.chatSeq || 0) || 0,
      chat:Array.isArray(room.chat) ? room.chat : [],
      players
    };
  }

  function subscribeFlyActions(code){
    let stopped = false;
    let timer = 0;
    let driftTimer = 0;
    let driftRunning = false;
    let lastWarn = 0;
    if(configuredAuthorityUrl()){
      ensureAuthorityJoined(code).catch(e=>console.warn('Fly authority prejoin failed', e));
    }
    function authoritySocketReady(){
      return !!(configuredAuthorityUrl()
        && typeof WebSocket !== 'undefined'
        && authorityJoined
        && authorityWs
        && authorityWs.readyState === WebSocket.OPEN);
    }
    async function poll(){
      if(stopped) return;
      if(authoritySocketReady()){
        timer = setTimeout(poll, 5000);
        return;
      }
      try{
        const after = Math.max(0, lastAppliedActionSeq || 0);
        const data = await flyApiJson(`/api/rooms/${encodeURIComponent(code)}/events?after=${after}&limit=80`);
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
        if(!stopped) timer = setTimeout(poll, (typeof document !== 'undefined' && document.hidden) ? 5000 : 1500);
      }
    }
    async function hashDriftCheck(){
      if(stopped || driftRunning) return;
      const g = gameState();
      if(!isOnlineMatchState(g) || (g._onlineRoomCode || activeRoom) !== code) return;
      if(typeof document !== 'undefined' && document.hidden) return;
      driftRunning = true;
      try{
        await catchUpFlyAuthorityReplay(code, 'periodic hash check', {limit:50});
        const localHash = onlineCanonicalStateHash(captureOnlineCanonicalState());
        const serverHash = String(lastAuthorityStateHash || lastLobbyRoom?.canonicalHash || '');
        if(serverHash && localHash && localHash !== serverHash){
          await catchUpFlyAuthorityReplay(code, 'periodic hash drift repair', {includeState:true, limit:50});
        }
      }catch(e){
        if(Date.now() - lastWarn > 5000){
          console.warn('Fly authority hash drift check failed', e);
          lastWarn = Date.now();
        }
      }finally{
        driftRunning = false;
      }
    }
    function scheduleHashDriftCheck(){
      if(stopped) return;
      driftTimer = setTimeout(async function(){
        driftTimer = 0;
        await hashDriftCheck();
        scheduleHashDriftCheck();
      }, 15000);
    }
    actionUnsub = function(){
      stopped = true;
      if(timer) clearTimeout(timer);
      if(driftTimer) clearTimeout(driftTimer);
    };
    poll();
    scheduleHashDriftCheck();
  }

  async function catchUpFlyAuthorityReplay(code, reason, opts){
    if(!code || !authorityHttpBaseUrl() || firebaseActionFallbackAllowed()) return false;
    const options = opts || {};
    authorityCatchupAttempts += 1;
    authorityLastCatchupReason = String(reason || 'authority-send');
    try{
      const after = Math.max(0, Number(lastAppliedActionSeq || 0) || 0);
      const includeState = options.includeState === true;
      const limit = Math.max(1, Math.min(240, Number(options.limit || 120) || 120));
      const requestOptions = {};
      if(Number(options.timeoutMs) > 0) requestOptions.timeoutMs = Number(options.timeoutMs);
      const data = await flyApiJson(`/api/rooms/${encodeURIComponent(code)}/resume?after=${after}&limit=${limit}${includeState ? '&includeState=1' : ''}`, requestOptions);
      const room = normalizeFlyRoom(data.room);
      if(room.roomCode){
        lastLobbyRoom = room;
        lastLobbyPlayers = room.players;
      }
      const serverHash = String(data.serverStateHash || data.canonicalHash || room.canonicalHash || '');
      if(serverHash) lastAuthorityStateHash = serverHash;
      if(data?.canonicalState) rememberOnlineAuthorityBoardSnapshot(data.canonicalState, serverHash);
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
      const localState = captureOnlineCanonicalState();
      const localHash = onlineCanonicalStateHash(localState);
      const canonicalState = data?.canonicalState || null;
      if(includeState && canonicalState && serverHash && localHash && localHash !== serverHash){
        applyOnlineCanonicalState(canonicalState, reason || 'authority hash drift repair');
        const latest = gameState();
        if(serverSeq){
          lastActionSeq = Math.max(lastActionSeq, serverSeq);
          lastAppliedActionSeq = Math.max(lastAppliedActionSeq, serverSeq);
          discardBufferedActionsThrough(lastAppliedActionSeq);
        }
        if(latest){
          latest._onlineActionSeq = Math.max(Number(latest._onlineActionSeq || 0) || 0, lastActionSeq);
          latest._onlineAppliedActionSeq = Math.max(Number(latest._onlineAppliedActionSeq || 0) || 0, lastAppliedActionSeq);
          latest._onlineLagPauseActive = false;
        }
        if(serverSeq) reportActionProgress(lastAppliedActionSeq, {
          force:true,
          turnBoundary:true
        });
        recordOnlineDiagnostic('authority-hash-drift-repaired', {
          reason:String(reason || ''),
          localHash:String(localHash || ''),
          serverHash:String(serverHash || ''),
          lastSeq:serverSeq
        });
      }
      authorityCatchupSuccesses += 1;
      return true;
    }catch(e){
      authorityCatchupFailures += 1;
      authorityLastCatchupReason = e && e.message || String(e);
      console.warn('Fly authority catch-up before send failed', e);
      return false;
    }
  }
  let browserResumeCatchupTimer = 0;
  let browserResumeCatchupRunning = false;
  function scheduleBrowserResumeAuthorityCatchup(reason, delayMs){
    if(browserResumeCatchupTimer) clearTimeout(browserResumeCatchupTimer);
    browserResumeCatchupTimer = setTimeout(async function(){
      browserResumeCatchupTimer = 0;
      if(browserResumeCatchupRunning) return;
      const g = gameState();
      const code = g?._onlineRoomCode || activeRoom;
      if(!isOnlineMatchState(g) || !code || !authorityHttpBaseUrl() || firebaseActionFallbackAllowed()) return;
      if(typeof document !== 'undefined' && document.hidden) return;
      browserResumeCatchupRunning = true;
      try{
        await ensureAuthorityJoined(code).catch(()=>false);
        await catchUpFlyAuthorityReplay(code, reason || 'browser resume', {includeState:true, limit:100});
        reportActionProgress(lastAppliedActionSeq || lastActionSeq || 0, {force:true});
        if(typeof evaluateLagPause === 'function') evaluateLagPause();
      }catch(e){
        console.warn('Browser resume authority catch-up failed', e);
      }finally{
        browserResumeCatchupRunning = false;
      }
    }, Math.max(0, Number(delayMs || 0) || 0));
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
      const fromStorage = localStorage.getItem('fateWsAuthorityUrl');
      if(enabled && fromStorage && !(electronRuntime() && !launchedWithLocalAuthority() && localAuthorityUrl(fromStorage))) return String(fromStorage).trim();
      if(enabled && window.FATE_WS_AUTHORITY_URL) return String(window.FATE_WS_AUTHORITY_URL || '').trim();
    }catch(e){}
    if(hostedFlyRuntime() && !launchedWithLocalAuthority()) return DEFAULT_FATE_FLY_WS_URL;
    if(electronRuntime() && !launchedWithLocalAuthority()) return DEFAULT_FATE_FLY_WS_URL;
    if(!launchedWithLocalAuthority()) return '';
    return window.FATE_WS_AUTHORITY_ENABLED === true ? String(window.FATE_WS_AUTHORITY_URL || '').trim() : '';
  }
  function closeAuthoritySocket(){
    authorityJoined = false;
    authorityJoinPromise = null;
    authorityRoomCode = '';
    authorityReducerMode = '';
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
      syncAuthorityServerClock(msg.serverTime);
      if(msg.serverStateHash) lastAuthorityStateHash = String(msg.serverStateHash || '');
      if(msg.reducerMode) authorityReducerMode = String(msg.reducerMode || '').toLowerCase();
      return;
    }
    if(msg.kind === 'ping'){
      syncAuthorityServerClock(msg.serverTime);
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
      const staleClientResolvedReject = msg.kind === 'rejected'
        && clientResolvedGameplayEnabled()
        && String(msg.action?.type || '').toUpperCase() === 'ACTION_RESULT'
        && /stale baseStateHash/i.test(String(msg.reason || ''));
      if(msg.kind === 'rejected' && msg.serverState && msg.serverStateHash && !staleClientResolvedReject){
        lastAuthorityStateHash = String(msg.serverStateHash || '');
        applyOnlineCanonicalState(msg.serverState, 'authority rejection resync', msg.action || null);
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
      }else if(staleClientResolvedReject && msg.serverStateHash){
        lastAuthorityStateHash = String(msg.serverStateHash || '');
        const localBoardCards = localOnlineBoardCardCount();
        const serverBoardCards = msg.serverState ? onlineStateBoardCardCount(msg.serverState) : null;
        const protectedPreference = activeOnlineProtectedBoardPreference();
        const protectedBoardCards = protectedPreference ? Number(protectedPreference.count || 0) : 0;
        const richestLocalBoardCards = Math.max(localBoardCards, protectedBoardCards);
        const localBoardLayout = localOnlineBoardLayoutSignature();
        const protectedBoardLayout = protectedPreference ? String(protectedPreference.layout || '') : '';
        const serverBoardLayout = msg.serverState ? onlineStateBoardLayoutSignature(msg.serverState) : '';
        const protectedMovementLayout = !!(
          msg.serverState &&
          (localBoardCards === serverBoardCards || protectedBoardCards === serverBoardCards) &&
          (localBoardLayout || protectedBoardLayout) &&
          serverBoardLayout &&
          (localBoardLayout !== serverBoardLayout || protectedBoardLayout !== serverBoardLayout) &&
          (isMoreBoardMovementAction(msg.action) || hasOnlineMovementBoardPreference() || String(protectedPreference?.kind || '') === 'movement')
        );
        if(msg.serverState && serverBoardCards > richestLocalBoardCards){
          applyOnlineCanonicalState(msg.serverState, 'client-resolved stale-base server has more board cards');
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
          recordOnlineDiagnostic('client-resolved-stale-base-applied-server-more-board-cards', {
            requestId:String(msg.requestId || ''),
            serverSeq,
            localBoardCards,
            protectedBoardCards,
            serverBoardCards,
            serverStateHash:String(msg.serverStateHash || '')
          });
        }else if(msg.serverState && richestLocalBoardCards > serverBoardCards && (shouldPreferMoreOnlineBoardCardsForAction(msg.action) || protectedPreference)){
          const serverSeq = Number(msg.serverSeq || 0) || 0;
          if(serverSeq) markOnlineActionSeqApplied(serverSeq, 'client-resolved stale-base kept local more board cards');
          scheduleMoreBoardCardsAuthoritySync('client-resolved-stale-base-kept-local-more-board-cards', 40);
          recordOnlineDiagnostic('client-resolved-stale-base-kept-local-more-board-cards', {
            requestId:String(msg.requestId || ''),
            serverSeq,
            localBoardCards,
            protectedBoardCards,
            serverBoardCards,
            serverStateHash:String(msg.serverStateHash || '')
          });
        }else if(protectedMovementLayout){
          const serverSeq = Number(msg.serverSeq || 0) || 0;
          if(serverSeq) markOnlineActionSeqApplied(serverSeq, 'client-resolved stale-base kept local moved board cards');
          scheduleMoreBoardCardsAuthoritySync('client-resolved-stale-base-kept-local-moved-board-cards', 40);
          recordOnlineDiagnostic('client-resolved-stale-base-kept-local-moved-board-cards', {
            requestId:String(msg.requestId || ''),
            serverSeq,
            localBoardCards,
            serverBoardCards,
            serverStateHash:String(msg.serverStateHash || '')
          });
        }else{
          recordOnlineDiagnostic('client-resolved-stale-base-kept-local', {
            requestId:String(msg.requestId || ''),
            serverSeq:Number(msg.serverSeq || 0) || 0,
            localBoardCards,
            serverBoardCards,
            serverStateHash:String(msg.serverStateHash || '')
          });
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
          err.reason = msg.reason || '';
          err.roomEnded = isRoomAlreadyEndedReason(msg.reason);
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
      const timer = setTimeout(()=>reject(new Error('WebSocket authority connection timed out')), AUTHORITY_OPEN_TIMEOUT_MS);
      ws.addEventListener('open', ()=>{ clearTimeout(timer); resolve(); }, {once:true});
      ws.addEventListener('error', ()=>{ clearTimeout(timer); reject(new Error('WebSocket authority connection failed')); }, {once:true});
      ws.addEventListener('close', ()=>{ clearTimeout(timer); reject(new Error('WebSocket authority closed before join')); }, {once:true});
    });
  }
  async function getAuthorityIdToken(){
    const user = window.FATE_ONLINE?.user || FO.auth?.currentUser || null;
    if(user && typeof user.getIdToken === 'function') {
      const token = await user.getIdToken(false);
      if(token) lastAuthorityIdToken = String(token);
    }
    return lastAuthorityIdToken;
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
      const u = getUser();
      if(!u) throw new Error('Sign in or use an Electron guest before joining WebSocket authority');
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
        guestSession:!!u.isEphemeralGuest,
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
    return configuredAuthorityUrl() && !firebaseActionFallbackAllowed() ? 5 : 1;
  }

  function authorityRetryDelayMs(attempt){
    return 900 + Math.max(0, Number(attempt || 0) || 0) * 1100;
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
        await new Promise(resolve=>setTimeout(resolve, authorityRetryDelayMs(attempt)));
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
    if(payloadHasServerReactionWindow(payload)){
      forceInstallOnlineImprovisorReactionFromPayload(directAction, 'accepted websocket reaction payload seq ' + (seq || '?'));
    }
    if(seq){
      lastActionSeq = Math.max(lastActionSeq, seq);
      g._onlineActionSeq = lastActionSeq;
    }
    try{
      if(preserveLocalDragConsolidationStartState(directAction)){
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
        return true;
      }
      maybeShowRemoteEffectCinematicForAction(g, directAction, 'accepted-authoritative-effect-cinematic');
      applyAuthoritativePostState(directAction, 'accepted authoritative state seq ' + (seq || '?'));
      if(type !== 'REACTION_CHOICE') maybeShowOnlinePresentationEvents(directAction);
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
    syncAuthorityServerClock(accepted.serverTime || action.authorityTime);
    if(accepted.serverStateHash) lastAuthorityStateHash = String(accepted.serverStateHash || '');
    if(handleLobbyMatchStartAccepted(accepted)) return;
    // Presentation packets should not wait behind gameplay replay sequencing.
    // Playing them immediately also covers rare missing-sequence recovery cases;
    // the cinematic's per-card dedupe prevents a later replay from duplicating it.
    if(String(action.type || '').toUpperCase() === 'EFFECT_CINEMATIC'){
      const g = gameState();
      const localUid = getUser()?.uid;
      if(g && (!localUid || String(action.uid || '') !== String(localUid))){
        Promise.resolve(showPayloadEffectCinematic(g, action.payload || {}, 'online-immediate-effect-cinematic')).catch(function(e){
          console.warn('Immediate online effect cinematic failed', e);
        });
      }
    }
    if(String(action.type || '').toUpperCase() === 'FORFEIT'){
      const terminalAction = Object.assign({}, action, {roomPatch:accepted.roomPatch || null});
      markOnlineActionSeqApplied(action.seq || 0, 'immediate websocket forfeit');
      handleRemoteForfeitAction(terminalAction, 'immediate websocket forfeit');
      return;
    }
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
    const u = getUser();
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
    const updateHookReport = ()=>{
      window.__fateOnlineGameplayHookReport = {
        installed:!!window.__fateOnlineGameplayHooksInstalled,
        installedAt:Date.now(),
        originalFns:Object.keys(originals).sort(),
        wrapped:{
          showModal:!!originals.showModal,
          pickCardsVisual:!!originals.pickCardsVisual,
          showZonePicker:!!originals.showZonePicker,
          showBoardTargetPicker:!!originals.showBoardTargetPicker,
          showAffiliationPickerVisual:!!originals.showAffiliationPickerVisual,
          chooseLandscapeZone:!!originals.chooseLandscapeZone,
          triggerCharacterEffect:!!originals.triggerCharacterEffect,
          activatePendingWhenSetEffect:!!originals.activatePendingWhenSetEffect,
          activateVigilantes:!!originals.activateVigilantes,
          activateExpeditionaryMove:!!originals.activateExpeditionaryMove,
          activateLandscapeEventideMove:!!originals.activateLandscapeEventideMove,
          activateBusserMove:!!originals.activateBusserMove,
          activateWodnyPotokYouth:!!originals.activateWodnyPotokYouth,
          discardBoardCard:!!originals.discardBoardCard,
          flipFaceDownBoardCard:!!originals.flipFaceDownBoardCard,
          setMajaFromDeck:!!originals.setMajaFromDeck
        }
      };
      return window.__fateOnlineGameplayHookReport;
    };

    if(typeof window.endTurn === 'function' && !originals.endTurn){
      originals.endTurn = window.endTurn;
      window.endTurn = function(){
        const g = gameState();
        if(!isOnlineMatchState(g) || g._onlineApplyingRemoteAction){
          return originals.endTurn.apply(this, arguments);
        }
        if(g._onlineLandscapeEndTurnContinuation){
          delete g._onlineLandscapeEndTurnContinuation;
          const result = originals.endTurn.apply(this, arguments);
          updateRoomTurn(gameState()?.currentPlayer);
          return result;
        }
        if(g._onlineSilentEndTurnUntil && Date.now() < g._onlineSilentEndTurnUntil && g.currentPlayer !== g._onlinePlayerIndex) {
          return;
        }
        if(g._consolidating || g._busserMoving || g._busserMovingCard || g._wolfCreekMoving || g._expMoving || g._berkeleyMoving || g._bh01Moving || g._landscapeMoving || g._boardTargeting || g.placing || g.selectedHandCard !== null || g.selectedBoardCard !== null) {
          if(typeof window.resetInteractionState === 'function') window.resetInteractionState();
          else {
            g._consolidating = null;
            g._busserMoving = null;
            g._busserMovingCard = null;
            g.placing = false;
            g.selectedHandCard = null;
            g.selectedBoardCard = null;
          }
          if(typeof window.clearPlaceHighlights === 'function') window.clearPlaceHighlights();
          if(typeof window.renderGame === 'function') window.renderGame({board:true, hand:true, blocks:true, topbar:true});
        }
        if(onlinePendingEndTurnAfterAgreementPromise){
          recordOnlineDiagnostic('online-end-turn-releasing-pending-board-agreement', {
            actionType:'END_TURN',
            reason:'nonblocking-turn-boundary-repair'
          });
          onlinePendingEndTurnAfterAgreementPromise = null;
          onlineTurnBoundaryAgreementPromise = null;
          onlineTurnBoundaryAgreementStartedAt = 0;
        }
        cancelOptionalOnlineMovementForEndTurn(g, 'online-end-turn');
        clearOnlineClientEffectPending(g, 'online-end-turn');
        if(!canSendLocalAction(g, 'END_TURN')) return;
        if(typeof window.deferTurnEndUntilModalComplete === 'function' && window.deferTurnEndUntilModalComplete('online-end-turn')) {
          return false;
        }
        playOnlineLocalEndTurnSfxOnce(g);
        const repairReason = hasOnlineMovementBoardPreference()
          ? 'end-turn-current-turn-moved-board-cards-repair'
          : 'end-turn-current-turn-more-board-cards-repair';
        startOnlineBoardRepairBeforeTurnBoundary(repairReason);
        if(Number(g.turn || 0) >= Number(g.maxTurns || 0)){
          const latest = gameState() || g;
          return sendAction('MATCH_RESULT', {
              playerIndex:latest.currentPlayer,
              turn:latest.turn,
              baseStateHash:lastAuthorityStateHash || ''
            })
            .catch(e=>{
              console.error('Online match result finalization failed', e);
              if(window.toast) toast('Could not finalize match result with server.');
            });
        }
        const args = arguments;
        const finishEndTurn = ()=>{
          const latest = gameState() || g;
          return sendOptimisticAction('END_TURN', {
            playerIndex:latest.currentPlayer,
            turn:latest.turn
          }, ()=>{
            const result = originals.endTurn.apply(this, args);
            updateRoomTurn(gameState()?.currentPlayer);
            return result;
          });
        };
        return finishEndTurn();
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
        if(!canSendLocalAction(g, 'START_CONSOLIDATE')) return;
        clearLocalConsolidationSelection('new consolidation started');
        const args = arguments;
        return sendOptimisticAction('START_CONSOLIDATE', {
          playerIndex:g.currentPlayer,
          turn:g.turn,
          selectedHand:selectedHandSnapshot(g)
        }, ()=>originals.initiateConsolidate.apply(this, args));
      };
    }
    if(typeof window.cancelConsolidation === 'function' && !originals.cancelConsolidation){
      originals.cancelConsolidation = window.cancelConsolidation;
      window.cancelConsolidation = function(){
        clearLocalConsolidationSelection('consolidation cancelled');
        return originals.cancelConsolidation.apply(this, arguments);
      };
    }
    window.fateOnlineQueueConsolidationDrop = function(drop){
      const g = gameState();
      if(!isOnlineMatchState(g) || g._onlineApplyingRemoteAction || !drop) return false;
      if(!canSendLocalAction(g, 'START_CONSOLIDATE')) return true;
      const selected = drop.selectedHand || selectedHandSnapshot(g);
      if(!selected) return false;
      clearLocalConsolidationSelection('new drag consolidation started');
      g.selectedHandCard = Number(selected.index);
      g.placing = false;
      if(typeof clearPlaceHighlights === 'function') clearPlaceHighlights();
      let localPreviewSelected = false;
      try{
        if(typeof window.initiateConsolidate === 'function'){
          window.initiateConsolidate();
          const latest = gameState();
          const con = latest && latest._consolidating;
          if(con && typeof window.clickCell === 'function'){
            window.clickCell(Number(drop.z), Number(drop.r), Number(drop.c));
            const afterClick = gameState();
            const afterCon = afterClick && afterClick._consolidating;
            localPreviewSelected = !!(afterCon && Array.isArray(afterCon.chosenIdxs) && afterCon.chosenIdxs.length);
            if(localPreviewSelected) rememberLocalConsolidationSelection(afterClick, afterCon, 'drag-drop-button-path-click-preview');
          }
        }
      }catch(e){
        console.warn('Online drag consolidation local preview failed', e);
      }
      recordOnlineDiagnostic('online-drag-consolidation-button-path', {
        z:Number(drop.z),
        r:Number(drop.r),
        c:Number(drop.c),
        selectedIid:String(selected.iid || ''),
        selectedId:String(selected.id || ''),
          localPreviewSelected
      });
      return true;
    };

    function enrichOnlineFreePlacementSnapshot(g, snapshot){
      if(!g || !snapshot) return snapshot;
      const localIndex = Number.isInteger(Number(g._onlinePlayerIndex)) ? Number(g._onlinePlayerIndex) : Number(g.currentPlayer);
      const hand = g.players?.[localIndex]?.hand || [];
      const card = hand.find(function(c){
        if(!c) return false;
        if(snapshot.iid && c.iid && String(c.iid) === String(snapshot.iid)) return true;
        return !snapshot.iid && snapshot.id && String(c.id || '') === String(snapshot.id);
      });
      const kind = String(card?._freePlacementCinematicKind || card?._serverFreePlacementConsumed || snapshot.freePlacementCinematicKind || '');
      if(kind) snapshot.freePlacementCinematicKind = kind;
      return snapshot;
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
          const selected = selectedHandSnapshot(g);
          noteOnlineMoreBoardPreference('placement', 'place-selected-armed', 30000);
          const result = originals.placeSelected.apply(this, arguments);
          const latest = gameState();
          const flaggedSelected = selectedHandSnapshot(latest) || selected;
          if(latest && latest.placing && flaggedSelected) noteOnlinePlacementIntent(latest, flaggedSelected);
          return result;
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
        if(g._onlineHavanoReactionDeploying && typeof handleOnlineImprovisorHavanoDeploymentClick === 'function'){
          return handleOnlineImprovisorHavanoDeploymentClick(z, r, c);
        }
        const recentPlacement = recentOnlinePlacementIntent(g);
        const placementSelected = selectedHandSnapshot(g) || recentPlacement;
        const hasPlacementIntent = !!(placementSelected && !g._serverPendingMove && !g._consolidating);
        if(!onlineCellActionPending(g) && !hasPlacementIntent){
          return originals.clickCell.apply(this, arguments);
        }
        ensureOnlineBoardShape(g);
        const args = arguments;
        const pendingMove = g._serverPendingMove || null;
        const pendingConsolidation = g._consolidating || null;
        const finalConsolidationClick = pendingConsolidation && isOnlineFinalConsolidationClick(pendingConsolidation, z, r, c);
        const consolidationPresentation = pendingConsolidation
          ? onlineConsolidationPresentationFromPending(g, pendingConsolidation, z, r, c)
          : null;
        if(finalConsolidationClick){
          if(!canSendLocalAction(g, 'SELECT_CONSOLIDATION_TRIBUTE')){
            queueFinalConsolidationClick(g, pendingConsolidation, z, r, c, 'waiting for local action gate');
            return true;
          }
          const sentServerResolved = sendServerResolvedConsolidationClick(g, pendingConsolidation, z, r, c);
          if(sentServerResolved) return true;
        }
        if(pendingConsolidation && !finalConsolidationClick){
          if(localConsolidationSelection){
            restoreLocalConsolidationSelection(g, 'before local consolidation tribute click');
          }
          const handled = originals.clickCell.apply(this, args);
          const latest = gameState();
          rememberLocalConsolidationSelection(latest, latest?._consolidating, 'local consolidation tribute click');
          recordOnlineDiagnostic('online-consolidation-tribute-click-kept-local', {
            z:Number(z),
            r:Number(r),
            c:Number(c),
            tributeCount:Array.isArray(latest?._consolidating?.chosenIdxs) ? latest._consolidating.chosenIdxs.length : 0
          });
          return handled;
        }
        if(pendingMove){
          if(!canSendLocalAction(g, 'SELECT_PENDING_MOVE_CELL')) return;
          noteOnlineMoreBoardPreference('movement', 'pending-move-click', 30000);
          return sendServerPendingAction('SELECT_PENDING_MOVE_CELL', pendingMove, {
            z,
            r,
            c,
            pendingMove:true,
            placing:false,
            selectedHand:selectedHandSnapshot(g)
          }, 'Square choice');
        }
        if(!canSendLocalAction(g, 'CLICK_CELL')) return;
        if(hasPlacementIntent) noteOnlineMoreBoardPreference('placement', 'placement-cell-click', 30000);
        const authorityPlacement = hasPlacementIntent && configuredAuthorityUrl() && !firebaseActionFallbackAllowed();
        const placementPayloadSelected = enrichOnlineFreePlacementSnapshot(g, cloneOnlinePlain(placementSelected));
        return sendOptimisticAction(authorityPlacement ? 'PLACE_CARD' : 'CLICK_CELL', {
          playerIndex:g.currentPlayer,
          turn:g.turn,
          z,r,c,
          promptId:(pendingMove && pendingMove.promptId) || (pendingConsolidation && pendingConsolidation.promptId) || '',
          placing:!!g.placing || hasPlacementIntent,
          selectedHand:placementPayloadSelected,
          skipImprovisorReaction:!!placementPayloadSelected?.skipImprovisorReaction,
          consolidationPresentation
        }, ()=>{
          const latest = gameState();
          const beforeBoard = cloneOnlinePlain(latest && latest.board);
          if(pendingConsolidation){
            const activeCon = latest && latest._consolidating;
            const expectedPromptId = String(pendingConsolidation.promptId || '');
            const activePromptId = String(activeCon?.promptId || '');
            if(!activeCon || (expectedPromptId && activePromptId && expectedPromptId !== activePromptId)){
              recordOnlineDiagnostic('stale-consolidation-callback-suppressed', {
                expectedPromptId,
                activePromptId,
                z,
                r,
                c
              });
              return;
            }
          }
          const isPlacement = clientResolvedGameplayEnabled()
            && toAuthorityIntent('CLICK_CELL', {placing:!!latest?.placing, selectedHand:selectedHandSnapshot(latest), z,r,c}, latest) === 'PLACE_CARD';
          const localResult = isPlacement
            ? runClientResolvedPlacementWithoutPresentation(()=>originals.clickCell.apply(this, args))
            : originals.clickCell.apply(this, args);
          const protectAfterLocal = ()=>{
            if(pendingConsolidation && !gameState()?._consolidating){
              clearLocalConsolidationSelection('local consolidation completed');
              try{ if(typeof window.refreshConsolidationCanvasState === 'function') window.refreshConsolidationCanvasState(); }catch(e){}
            }
            if(hasPlacementIntent) protectOnlineBoardIfChanged('placement', 'post-placement-click', beforeBoard);
            if(hasPlacementIntent) maybePlayOnlineNewCharacterCinematic(gameState(), collectOnlineBoardSnapshot(beforeBoard), {payload:{clientActionId:'local-placement'}}, 'post-local-placement-click');
          };
          if(localResult && typeof localResult.then === 'function'){
            return localResult.then(value=>{ protectAfterLocal(); return value; });
          }
          protectAfterLocal();
          return localResult;
        });
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
        if(/^Discard Down to 12$/i.test(String(title || '')) || /hand-limit-discard/.test(String(bodyHtml || ''))){
          return originals.showModal.apply(this, arguments);
        }
        if(shouldSuppressRemoteOpponentModal(g, title, bodyHtml, actions, opts)) return;
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
            const pendingModal = gameState()?._serverPendingModalAction || null;
            if(!canSendLocalAction(gameState(), 'MODAL_ACTION')) return;
            return sendOptimisticAction('MODAL_ACTION', attachOnlinePendingEffectSource({
              playerIndex:g.currentPlayer,
              turn:g.turn,
              promptId:pendingModal && pendingModal.promptId || '',
              actionIndex,
              effectCinematic:selectedBoardEffectCinematicPayload(g)
            }, g, pendingModal), ()=>action.action());
          }
        }));
        return originals.showModal.call(this, title, bodyHtml, wrappedActions);
      };
    }
    window.fateOnlineHandLimitResolved = function(player){
      const g = gameState();
      if(!isOnlineMatchState(g) || Number(player) !== Number(g._onlinePlayerIndex)) return false;
      scheduleClientResolvedAutoCommit('hand-limit-resolved', 40);
      return true;
    };

    function runWithOnlinePickerResolution(g, fn){
      if(!g || typeof fn !== 'function') return typeof fn === 'function' ? fn() : undefined;
      g._onlineResolvingPickerAction = (Number(g._onlineResolvingPickerAction || 0) || 0) + 1;
      let result;
      const finish = ()=>{
        const latest = gameState() || g;
        if(!latest) return;
        latest._onlineResolvingPickerAction = Math.max(0, (Number(latest._onlineResolvingPickerAction || 0) || 0) - 1);
        if(!latest._onlineResolvingPickerAction) delete latest._onlineResolvingPickerAction;
      };
      try{
        result = fn();
      }catch(e){
        finish();
        throw e;
      }
      if(result && typeof result.then === 'function'){
        return result.finally(finish);
      }
      finish();
      return result;
    }

    if(typeof window.pickCardsVisual === 'function' && !originals.pickCardsVisual){
      originals.pickCardsVisual = window.pickCardsVisual;
      window.pickCardsVisual = function(cards, opts, onConfirm){
        const g = gameState();
        if(g?._onlineServerPromptBypass || window.__fateOnlineServerPromptBypass) return originals.pickCardsVisual.apply(this, arguments);
        if(g?._onlineClientOwnedBoardActionPickerDepth > 0 && opts?.onlineParentAction === true){
          return originals.pickCardsVisual.apply(this, arguments);
        }
        if(!isOnlineMatchState(g) || typeof onConfirm !== 'function'){
          return originals.pickCardsVisual.apply(this, arguments);
        }
        if(isRemoteOpponentReplay(g)) return;
        if(g._onlinePendingZonePicker){
          return originals.pickCardsVisual.apply(this, arguments);
        }
        g._onlinePendingPickCardsVisual = { cards:cards || [], onConfirm };
        const localCanChoose = g.currentPlayer === g._onlinePlayerIndex;
        if(!localCanChoose) return;
        const wrappedConfirm = (chosen)=>{
          const latest = gameState();
          if(latest?._onlineApplyingRemoteAction) return onConfirm(chosen);
          if(!canSendLocalAction(latest, 'PICK_CARDS_VISUAL')) return;
          const pendingPick = latest?._serverPendingCardPick || null;
          return sendOptimisticAction('PICK_CARDS_VISUAL', attachOnlinePendingEffectSource({
            playerIndex:latest.currentPlayer,
            turn:latest.turn,
            promptId:pendingPick && pendingPick.promptId || '',
            selectedCards:(chosen || []).map(cardIdentity)
          }, latest, pendingPick), ()=>runWithOnlinePickerResolution(latest, ()=>onConfirm(chosen)));
        };
        return originals.pickCardsVisual.call(this, cards, opts, wrappedConfirm);
      };
    }

    if(typeof window.showZonePicker === 'function' && !originals.showZonePicker){
      originals.showZonePicker = window.showZonePicker;
      window.showZonePicker = function(z, prompt, entries, maxCount, viewerP, onConfirm, filter, onCancel){
        const g = gameState();
        if(g?._onlineServerPromptBypass || window.__fateOnlineServerPromptBypass) return originals.showZonePicker.apply(this, arguments);
        if(g?._onlineClientOwnedBoardActionPickerDepth > 0) return originals.showZonePicker.apply(this, arguments);
        if(!isOnlineMatchState(g) || typeof onConfirm !== 'function'){
          return originals.showZonePicker.apply(this, arguments);
        }
        if(isRemoteOpponentReplay(g)) return;
        g._onlinePendingZonePicker = { entries:entries || [], onConfirm };
        const localCanChoose = g.currentPlayer === g._onlinePlayerIndex;
        if(!localCanChoose) return;
        const wrappedConfirm = (chosen)=>{
          const latest = gameState();
          if(latest?._onlineApplyingRemoteAction) return onConfirm(chosen);
          if(!canSendLocalAction(latest, 'PICK_ZONE')) return;
          const pendingPick = latest?._serverPendingZonePick || null;
          const localPending = latest?._onlinePendingZonePicker || null;
          return sendOptimisticAction('PICK_ZONE', attachOnlinePendingEffectSource({
            playerIndex:latest.currentPlayer,
            turn:latest.turn,
            promptId:pendingPick && pendingPick.promptId || '',
            selectedEntries:(chosen || []).map(boardSelectionPayload)
          }, latest, pendingPick), ()=>runWithOnlinePickerResolution(latest, ()=>{
            if(latest._onlinePendingZonePicker === localPending) latest._onlinePendingZonePicker = null;
            return onConfirm(chosen);
          }));
        };
        return originals.showZonePicker.call(this, z, prompt, entries, maxCount, viewerP, wrappedConfirm, filter, onCancel);
      };
    }

    if(typeof window.showBoardTargetPicker === 'function' && !originals.showBoardTargetPicker){
      originals.showBoardTargetPicker = window.showBoardTargetPicker;
      window.showBoardTargetPicker = function(opts, onConfirm){
        const g = gameState();
        if(g?._onlineServerPromptBypass || window.__fateOnlineServerPromptBypass) return originals.showBoardTargetPicker.apply(this, arguments);
        if(opts && opts.onlineClientOwnedChoice === true) return originals.showBoardTargetPicker.apply(this, arguments);
        if(!isOnlineMatchState(g) || typeof onConfirm !== 'function'){
          return originals.showBoardTargetPicker.apply(this, arguments);
        }
        if(isRemoteOpponentReplay(g)) return;
        const entries = (opts && Array.isArray(opts.entries)) ? opts.entries : [];
        g._onlinePendingZonePicker = { entries, onConfirm };
        const localCanChoose = g.currentPlayer === g._onlinePlayerIndex;
        if(!localCanChoose) return;
        const wrappedOpts = Object.assign({}, opts || {});
        const wrappedConfirm = (chosen)=>{
          const latest = gameState();
          if(latest?._onlineApplyingRemoteAction) return onConfirm(chosen);
          if(!canSendLocalAction(latest, 'PICK_ZONE')) return;
          const pendingPick = latest?._serverPendingZonePick || null;
          return sendOptimisticAction('PICK_ZONE', attachOnlinePendingEffectSource({
            playerIndex:latest.currentPlayer,
            turn:latest.turn,
            promptId:pendingPick && pendingPick.promptId || '',
            selectedEntries:(chosen || []).map(boardSelectionPayload)
          }, latest, pendingPick), ()=>runWithOnlinePickerResolution(latest, ()=>onConfirm(chosen)));
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
            return sendOptimisticAction('PICK_ZONE', attachOnlinePendingEffectSource({
              playerIndex:latest.currentPlayer,
              turn:latest.turn,
              promptId:pendingPick && pendingPick.promptId || '',
              selectedEntries:[]
            }, latest, pendingPick), ()=>{
              return runWithOnlinePickerResolution(latest, ()=>{
                if(typeof originalCancel === 'function') return originalCancel();
                return onConfirm([]);
              });
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
        if(g?._onlineLocalModalBypass || window.__fateOnlineLocalModalBypass || g?._onlineServerPromptBypass || window.__fateOnlineServerPromptBypass) return originals.showAffiliationPickerVisual.apply(this, arguments);
        if(!isOnlineMatchState(g) || typeof callback !== 'function'){
          return originals.showAffiliationPickerVisual.apply(this, arguments);
        }
        if(isRemoteOpponentReplay(g)) return;
        g._onlinePendingAffiliationPicker = { callback };
        const localCanChoose = g.currentPlayer === g._onlinePlayerIndex;
        if(!localCanChoose) return;
        const wrappedCallback = (aff)=>{
          const latest = gameState();
          if(latest?._onlineApplyingRemoteAction) return callback(aff);
          if(!canSendLocalAction(latest, 'PICK_AFFILIATION')) return;
          const pendingModal = latest?._serverPendingModalAction || null;
          return sendOptimisticAction('PICK_AFFILIATION', attachOnlinePendingEffectSource({
            playerIndex:latest.currentPlayer,
            turn:latest.turn,
            promptId:pendingModal && pendingModal.promptId || '',
            aff:String(aff || '')
          }, latest, pendingModal), ()=>callback(aff));
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
        const guardedOpts = Object.assign({}, opts || {});
        const promptKey = typeof window.fateLandscapeZonePromptKey === 'function'
          ? window.fateLandscapeZonePromptKey(player, title, guardedOpts)
          : [String(g._onlineRoomCode || ''), String(g.turn || 0), String(player), String(title || '')].join('|');
        if(typeof window.fateIsLandscapeZonePromptGuarded === 'function' && window.fateIsLandscapeZonePromptGuarded(promptKey)) {
          recordOnlineDiagnostic('online-landscape-prompt-duplicate-blocked', {promptKey, player:Number(player), turn:Number(g.turn || 0)});
          return false;
        }
        const guardToken = typeof window.fateBeginLandscapeZonePrompt === 'function'
          ? window.fateBeginLandscapeZonePrompt(promptKey)
          : {key:promptKey, settled:false};
        if(!guardToken) return false;
        guardedOpts.promptKey = promptKey;
        guardedOpts._landscapePromptGuardToken = guardToken;
        const pendingLandscapePrompt = { player, onChoose, promptKey, guardToken, submitted:false, resolved:false };
        g._onlinePendingLandscapeZonePicker = pendingLandscapePrompt;
        const localCanChoose = Number(player) === g._onlinePlayerIndex;
        if(!localCanChoose) return true;
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
          const pending = latest._onlinePendingLandscapeZonePicker;
          if(!pending || pending.promptKey !== promptKey || pending.submitted || pending.resolved) return false;
          pending.submitted = true;
          return sendOptimisticAction('PICK_LANDSCAPE_ZONE', {
            playerIndex:Number(player),
            chooserIndex:Number(player),
            turn:latest.turn,
            zone:Number(zone),
            landscapePromptKey:promptKey
          }, ()=>{
            const applying = gameState();
            if(applying && applying.currentPlayer !== applying._onlinePlayerIndex) applying._onlineSilentEndTurnUntil = Date.now() + 700;
            const result = onChoose(zone);
            if(applying && applying._onlinePendingLandscapeZonePicker === pending) {
              pending.resolved = true;
              applying._onlinePendingLandscapeZonePicker = null;
            }
            return result;
          });
        };
        return originals.chooseLandscapeZone.call(this, player, title, subtitle, wrappedChoose, guardedOpts);
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
        if(isRemoteOpponentReplay(g)){
          return originals.toast.call(this, remoteOpponentPerspectiveText(text), arguments[1]);
        }
        return originals.toast.apply(this, arguments);
      };
    }

    [
      {fn:'setPolishFromDeck', id:'28', name:'2nd Polish-Lithuanian Army'},
      {fn:'setMajaFromDeck', id:'07', name:'Maja Kaminska'}
    ].forEach(function(deckSet){
      if(typeof window[deckSet.fn] !== 'function' || originals[deckSet.fn]) return;
      originals[deckSet.fn] = window[deckSet.fn];
      window[deckSet.fn] = function(){
        const g = gameState();
        if(!isOnlineMatchState(g) || g._onlineApplyingRemoteAction){
          return originals[deckSet.fn].apply(this, arguments);
        }
        if(!canSendLocalAction(g, 'HAND_ACTION')) return;
        const localIndex = resolveOnlineLocalPlayerIndex('direct-deck-set:' + deckSet.fn);
        if(localIndex === null) return;
        const sourceCard = (g.players?.[localIndex]?.deck || []).find(card=>
          String(card?.id || '') === deckSet.id && !card._deckSetNegatedByReaction
        );
        if(!sourceCard) return originals[deckSet.fn].apply(this, arguments);
        const args = arguments;
        return sendOptimisticAction('HAND_ACTION', {
          fn:deckSet.fn,
          playerIndex:localIndex,
          turn:g.turn,
          deckSetAction:true,
          sourceName:deckSet.name,
          source:{card:cardIdentity(sourceCard)}
        }, ()=>originals[deckSet.fn].apply(this, args));
      };
    });

    const boardFns = [
      'triggerCharacterEffect',
      'activatePendingWhenSetEffect',
      'activateVigilantes',
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
        if(fnName === 'discardBoardCard' && g._onlineResolvingPickerAction){
          return originals[fnName].apply(this, arguments);
        }
        const activateEffectBoardAction = /^(triggerCharacterEffect|activatePendingWhenSetEffect|activateVigilantes|activateExpeditionaryMove|activateLandscapeEventideMove|activateBusserMove|activateWodnyPotokYouth)$/i.test(fnName);
        if(activateEffectBoardAction){
          // Effect clicks are client-owned and must not be blocked by the generic resolving-action gate.
          if(activeOnlineRoomEnded()){
            if(window.toast) toast('Room ended');
            handleRoomEnded(lastLobbyRoom || {roomCode:g._onlineRoomCode || activeRoom, status:'ended'});
            return;
          }
          const localIndex = resolveOnlineLocalPlayerIndex('client-owned-board-action:' + fnName);
          if(g._isSpectator || g._onlineRole === 'spectator' || localIndex === null){
            if(window.toast) toast('Spectators cannot take game actions.');
            return;
          }
          clearCompletedOnlineConsolidationState(g, 'before activate effect');
        }else if(!canSendLocalAction(g, 'BOARD_ACTION')) return;
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
        const args = Array.prototype.slice.call(arguments);
        if(pos && /^(triggerCharacterEffect|activatePendingWhenSetEffect)$/i.test(fnName)){
          const liveCard = g.board?.[pos.z]?.[pos.r]?.[pos.c] || null;
          if(liveCard){
            args[0] = liveCard;
            args[1] = pos.z;
            args[2] = pos.r;
            args[3] = pos.c;
          }
        }
        const activationBlockReason = activateEffectBoardAction && pos ? onlineBoardEffectActivationBlockReason(g, fnName, pos) : '';
        if(activationBlockReason){
          if(window.toast) toast(activationBlockReason);
          if(typeof window.playSfx === 'function') window.playSfx('blocked');
          return;
        }
        const submitPendingCard = activateEffectBoardAction && pos ? (g.board?.[pos.z]?.[pos.r]?.[pos.c] || null) : null;
        const markSubmitPending = !!(submitPendingCard && /^(triggerCharacterEffect|activatePendingWhenSetEffect)$/i.test(fnName));
        if(markSubmitPending) submitPendingCard._onlineEffectActivationSubmitPending = true;
        const payload = Object.assign({
          fn:fnName,
          playerIndex:g.currentPlayer,
          turn:g.turn
        }, pos || {});
        if(pos){
          payload.source = boardSelectionPayload({
            z:pos.z,
            r:pos.r,
            c:pos.c,
            card:g.board?.[pos.z]?.[pos.r]?.[pos.c] || null
          });
          const placementAllowPromptId = String(g.board?.[pos.z]?.[pos.r]?.[pos.c]?._onlinePlacementReactionAllowPromptId || '');
          if(placementAllowPromptId){
            payload.skipImprovisorReaction = true;
            payload.placementReactionPromptId = placementAllowPromptId;
          }
        }
        if(/^(activateWolfCreek|activateExpeditionaryMove|activateLandscapeEventideMove|activateBusserMove|activateWodnyPotokYouth)$/i.test(fnName)){
          noteOnlineMoreBoardPreference('movement', fnName, 30000);
        }
        if(pos && (fnName === 'triggerCharacterEffect' || fnName === 'activatePendingWhenSetEffect')) {
          payload.effectCinematic = boardEffectCinematicPayload(g, pos.z, pos.r, pos.c);
        }
        const isMovementBoardAction = /^(activateWolfCreek|activateExpeditionaryMove|activateLandscapeEventideMove|activateBusserMove|activateWodnyPotokYouth)$/i.test(fnName);
        const onlineBoardActionResult = sendOptimisticAction('BOARD_ACTION', payload, ()=>{
          const beforeBoard = isMovementBoardAction ? cloneOnlinePlain(gameState()?.board) : null;
          let localResult;
          const latestState = gameState();
          if(activateEffectBoardAction && latestState) {
            latestState._onlineClientOwnedBoardActionPickerDepth = Math.max(0, Number(latestState._onlineClientOwnedBoardActionPickerDepth || 0) || 0) + 1;
          }
          let clientOwnedPickerScopeFinished = false;
          const finishClientOwnedPickerScope = function(){
            if(clientOwnedPickerScopeFinished) return;
            clientOwnedPickerScopeFinished = true;
            const applying = gameState() || latestState;
            if(!activateEffectBoardAction || !applying) return;
            applying._onlineClientOwnedBoardActionPickerDepth = Math.max(0, (Number(applying._onlineClientOwnedBoardActionPickerDepth || 0) || 0) - 1);
            if(!applying._onlineClientOwnedBoardActionPickerDepth) delete applying._onlineClientOwnedBoardActionPickerDepth;
          };
          try{
            localResult = originals[fnName].apply(this, args);
            if(pos && submitPendingCard){
              rememberOnlineEffectActivation(fnName, submitPendingCard, pos);
            }
          }catch(e){
            finishClientOwnedPickerScope();
            throw e;
          }
          if(fnName === 'activateBusserMove' && window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function'){
            window.FateMatchRendererAdapter.scheduleRender('busser-local-targets');
          }
          const protectAfterLocal = ()=>{
            if(isMovementBoardAction) protectOnlineBoardIfChanged('movement', 'post-' + fnName, beforeBoard);
          };
          if(localResult && typeof localResult.then === 'function'){
            return localResult.then(value=>{
              finishClientOwnedPickerScope();
              protectAfterLocal();
              return value;
            }).catch(e=>{
              finishClientOwnedPickerScope();
              throw e;
            });
          }
          finishClientOwnedPickerScope();
          protectAfterLocal();
          return localResult;
        });
        Promise.resolve(onlineBoardActionResult).finally(function(){
          if(markSubmitPending && submitPendingCard) delete submitPendingCard._onlineEffectActivationSubmitPending;
        });
        return onlineBoardActionResult;
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

    window.__fateSendEffectActivationCinematic = function(card, z, r, c, opts){
      const options = opts || {};
      if(options.broadcast === false || String(options.source || '') === 'improvisor-reaction') return false;
      const g = gameState();
      if(!isOnlineMatchState(g) || g._onlineApplyingRemoteAction) return false;
      const localIndex = resolveOnlineLocalPlayerIndex('effect-cinematic');
      if(g._isSpectator || g._onlineRole === 'spectator' || localIndex === null) return false;
      if(Number(g.currentPlayer) !== Number(localIndex)) return false;
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
      sendAction('EFFECT_CINEMATIC', payload).catch(e=>console.warn('Effect cinematic broadcast failed', e));
      return true;
    };

    const handFns = ['activateWineCountryGuerillaFromHand'];
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
    updateHookReport();
  }

  async function leaveRoom(markForfeit, passive=false){
    const code = gameState()?._onlineRoomCode || activeRoom;
    const u = getUser();
    if(code && u && !passive){
      if(roomUsesFly(code)){
        if(markForfeit){
          try{
            await flyApiRequest(`/api/rooms/${encodeURIComponent(code)}/forfeit`, {
              method:'POST',
              timeoutMs:15000,
              body:{uid:u.uid, clientActionId:makeOptimisticActionId('FORFEIT')}
            });
          }catch(e){
            console.warn('Fly room forfeit endpoint failed; retrying over authority socket', e);
            await sendAction('FORFEIT',{});
          }
        }
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
    cleanupTerminalOnlineRoomState(markForfeit ? 'local-forfeit' : 'local-leave');
    closeModal();
    if(typeof window.disbandOnlineParty === 'function'){
      window.disbandOnlineParty(markForfeit ? 'Party disbanded because a player left the match.' : 'Party disbanded after the match.', {silent:passive}).catch(()=>{});
    }
  }
  function installEphemeralGuestUnloadCleanup(){
    if(window.__fateEphemeralGuestUnloadCleanupInstalled) return;
    window.__fateEphemeralGuestUnloadCleanupInstalled = true;
    window.addEventListener('beforeunload', function(){
      const u = getUser();
      if(!u?.isEphemeralGuest || !u.uid) return;
      if(gameState()?._isSpectator || gameState()?._onlineRole === 'spectator') return;
      const code = String(gameState()?._onlineRoomCode || activeRoom || '').trim().toUpperCase();
      if(!code || !roomUsesFly(code)) return;
      if(shouldSendUnloadEndRoomSignal()) return;
      const base = authorityHttpBaseUrl();
      if(!base) return;
      const payload = JSON.stringify({uid:u.uid, guestSession:true, reason:'ephemeral-window-close'});
      const url = `${base}/api/rooms/${encodeURIComponent(code)}/leave`;
      try{
        if(navigator.sendBeacon){
          navigator.sendBeacon(url, new Blob([payload], {type:'application/json'}));
          return;
        }
      }catch(e){}
      try{
        fetch(url, {
          method:'POST',
          headers:{'content-type':'application/json', 'x-fate-guest-session':'1', 'x-fate-guest-uid':String(u.uid)},
          body:payload,
          keepalive:true
        }).catch(()=>{});
      }catch(e){}
    });
  }
  function shouldSendUnloadEndRoomSignal(){
    const u = getUser();
    if(!u?.uid) return false;
    const g = gameState();
    if(g?._isSpectator || g?._onlineRole === 'spectator') return false;
    const room = lastLobbyRoom || {};
    const code = String(g?._onlineRoomCode || activeRoom || room.roomCode || '').trim().toUpperCase();
    if(!code) return false;
    const status = String(room.status || '').trim().toLowerCase();
    if(status === 'ended') return false;
    if(status === 'lobby' && !isOnlineMatchState(g)) return false;
    return isOnlineMatchState(g) || (!!status && status !== 'lobby');
  }
  function postUnloadFlyForfeit(code, uid){
    const base = authorityHttpBaseUrl();
    if(!base) return false;
    const url = `${base}/api/rooms/${encodeURIComponent(code)}/forfeit`;
    const user = getUser();
    const payload = JSON.stringify({
      uid,
      idToken:lastAuthorityIdToken || undefined,
      guestSession:!!user?.isEphemeralGuest,
      reason:'window-close',
      clientActionId:makeOptimisticActionId('FORFEIT')
    });
    try{
      if(navigator.sendBeacon){
        const accepted = navigator.sendBeacon(url, new Blob([payload], {type:'application/json'}));
        if(accepted) return true;
      }
    }catch(e){}
    try{
      fetch(url, {
        method:'POST',
        headers:{'content-type':'application/json'},
        body:payload,
        keepalive:true
      }).catch(()=>{});
      return true;
    }catch(e){}
    return false;
  }
  function postUnloadRtdbEndRoom(code, uid){
    if(!firebaseRoomTransportAllowed()) return false;
    try{
      const stamp = FO.serverTimestamp();
      const patch = {
        [`rooms/${code}/status`]:'ended',
        [`rooms/${code}/phase`]:'ended',
        [`rooms/${code}/endedBy`]:uid,
        [`rooms/${code}/endReason`]:'disconnect',
        [`rooms/${code}/players/${uid}/connected`]:false,
        [`rooms/${code}/updatedAt`]:stamp,
        [`rooms/${code}/endedAt`]:stamp
      };
      FO.update(FO.ref(FO.rtdb), patch).catch(()=>{});
      return true;
    }catch(e){}
    return false;
  }
  function sendUnloadEndRoomSignal(){
    if(unloadEndSignalSent || !shouldSendUnloadEndRoomSignal()) return false;
    const u = getUser();
    const g = gameState();
    const room = lastLobbyRoom || {};
    const code = String(g?._onlineRoomCode || activeRoom || room.roomCode || '').trim().toUpperCase();
    if(!u?.uid || !code) return false;
    const sent = roomUsesFly(code) ? postUnloadFlyForfeit(code, u.uid) : postUnloadRtdbEndRoom(code, u.uid);
    if(sent) unloadEndSignalSent = true;
    return sent;
  }
  function installOnlineRoomUnloadEndSignal(){
    if(window.__fateOnlineRoomUnloadEndSignalInstalled) return;
    window.__fateOnlineRoomUnloadEndSignalInstalled = true;
    const handler = function(event){
      if(event && event.persisted) return;
      sendUnloadEndRoomSignal();
    };
    window.addEventListener('pagehide', handler);
    window.addEventListener('beforeunload', handler);
  }
  function handleRoomEnded(room){
    const code = room?.roomCode || activeRoom || '';
    if(code && endedRoomCodesHandled.has(code)) return;
    if(code) endedRoomCodesHandled.add(code);
    const g = gameState();
    const uid = String(getUser()?.uid || '');
    const endedBy = String(room?.endedBy || '');
    const localIndex = Number.isInteger(g?._onlinePlayerIndex) ? g._onlinePlayerIndex : null;
    const localWon = !!(uid && room?.winnerUid && String(room.winnerUid) === uid)
      || (localIndex !== null && Number(room?.winnerIndex) === localIndex);
    const localLost = !!(uid && room?.loserUid && String(room.loserUid) === uid)
      || (localIndex !== null && Number(room?.loserIndex) === localIndex);
    const remoteEnded = localWon || (!localLost && !!(uid && endedBy && endedBy !== uid));
    const bg = captureOnlineGameBackground();
    if(window.toast) toast(remoteEnded ? 'Opponent ended the match' : 'Room ended');
    let result = null;
    if(g && isOnlineMatchState(g) && !g._onlineResultMarked){
      g._onlineResultMarked = true;
      const outcome = localWon ? 'victory' : (localLost ? 'defeat' : (remoteEnded ? 'victory' : 'defeat'));
      const rewardData = remoteEnded ? collectOnlineServerRewardData('victory', {payload:{result:room?.result || null}}) : collectOnlineForfeitRewardData(outcome, g);
      result = {outcome, rewardData};
    }
    cleanupTerminalOnlineRoomState(remoteEnded ? 'remote-room-ended' : 'room-ended');
    closeModal();
    if(result){
      if(typeof cleanupGame === 'function') cleanupGame();
      showOnlineForfeitResult(result.outcome, bg, {
        reason:remoteEnded ? 'Opponent ended the match.' : 'The match ended.',
        rewardData:result.rewardData
      });
    }
    if(typeof window.disbandOnlineParty === 'function'){
      window.disbandOnlineParty('Party disbanded after the match.', {silent:false}).catch(()=>{});
    }
  }

  async function startFlyRandomQueue(mode, deckChoice, handlers={}, partyTargetUid=''){
    const u = getUser(); if(!u) return false;
    const deck = normalizeQueueDeck(deckChoice);
    if(!deck){ if(window.toast) toast('Choose a valid 40-card deck first'); return false; }
    const prof = await profile();
    const data = await flyApiRequest('/api/matchmaking/enter', {
      method:'POST',
      timeoutMs:45000,
      body:{
        uid:u.uid,
        mode,
        profile:prof,
        deckChoice:flyDeckChoiceFromRoomDeck(deck),
        partyTargetUid:partyTargetUid || '',
        clientSession:matchmakingClientSession()
      }
    });
    const room = normalizeFlyRoom(data.room);
    if(!room.roomCode) throw new Error('Fly matchmaking returned no room');
    activeRoom = room.roomCode;
    lastLobbyRoom = room;
    lastLobbyPlayers = room.players;
    randomQueueState.roomCode = room.roomCode;
    randomQueueState.role = data.matched ? 'guest' : 'host';
    window.FATE_ONLINE_PENDING_ROOM_DECK = deck;
    watchFlyRoom(room.roomCode, {silent:true});
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
        const sameAccount = /already matchmaking in another Electron session/i.test(String(e?.message || ''));
        if(!sameAccount) setTimeout(()=>removeOwnQueueEntry().catch(()=>{}), 1500);
        const message = sameAccount
          ? 'This account is already queueing in another window. Sign out here or use a different Google account.'
          : 'Could not enter Fly random queue. Try again.';
        emitRandomQueueStatus('error', message);
        if(sameAccount && window.toast) toast(message);
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
  window.fateSendRoomAction = sendAction;
  window.fatePublishOnlineMatchPreload = publishOnlineMatchPreload;
  window.fateWaitForOnlineMatchPreload = waitForOnlineMatchPreload;
  window.fatePublishOnlineMatchPlayable = publishOnlineMatchPlayable;
  window.fateWaitForOnlineMatchPlayable = waitForOnlineMatchPlayable;

  function finiteAuthorityNumber(value){
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function countCanonicalBoardCards(g){
    let count = 0;
    (g?.board || []).forEach(function(zone){
      (zone || []).forEach(function(row){
        (row || []).forEach(function(card){
          if(card) count += 1;
        });
      });
    });
    return count;
  }
  function onlinePendingInteractionKind(g){
    const pending = normalizedClientPendingInteraction(g);
    return String(pending?.kind || pending?.bucket || '');
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
  window.fateOnlineDiagnosticsReport = function(){
    const g = gameState();
    const perf = window.__fatePerf || {};
    const params = authorityLaunchParams();
    return {
      roomCode:String(g?._onlineRoomCode || activeRoom || '').toUpperCase(),
      electron:electronRuntime(),
      electronSession:String(params.get('electronSession') || ''),
      userUid:String(getUser()?.uid || ''),
      authority:window.fateGetWebSocketAuthorityStatus ? window.fateGetWebSocketAuthorityStatus() : null,
      render:window.fateAuthorityRenderReport(),
      diagnosticsTimeline:Array.isArray(perf.onlineDiagnosticsTimeline) ? perf.onlineDiagnosticsTimeline.slice(-80) : [],
      lastLobbyRoom:lastLobbyRoom ? {
        roomCode:lastLobbyRoom.roomCode || '',
        status:lastLobbyRoom.status || '',
        phase:lastLobbyRoom.phase || '',
        lastActionSeq:lastLobbyRoom.lastActionSeq || 0
      } : null
    };
  };
  window.fateSubmitOnlineDiagnostics = async function(){
    const code = String(gameState()?._onlineRoomCode || activeRoom || '').toUpperCase();
    const report = window.fateOnlineDiagnosticsReport();
    if(!code || !authorityHttpBaseUrl()) return report;
    await flyApiRequest(`/api/rooms/${encodeURIComponent(code)}/diagnostics/client`, {
      method:'POST',
      body:{diagnostics:report}
    });
    return report;
  };
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
    const electron = electronRuntime();
    const authorityMode = String(params.get('fateAuthority') || '').trim().toLowerCase();
    const shouldEnable = params.has('flyTest')
      || params.get('fateFlyTest') === '1'
      || authorityMode === 'local'
      || authorityMode === 'fly'
      || electron;
    if(!shouldEnable) return window.fateGetWebSocketAuthorityStatus();
    const url = params.get('flyWs')
      || params.get('fateWsAuthorityUrl')
      || params.get('wsAuthority')
      || window.FATE_WS_AUTHORITY_URL
      || (electron && authorityMode !== 'local' ? DEFAULT_FATE_FLY_WS_URL : 'ws://127.0.0.1:8787');
    const apiUrl = params.get('flyApi')
      || params.get('fateFlyApiUrl')
      || params.get('authorityApi')
      || (electron && authorityMode !== 'local' ? DEFAULT_FATE_FLY_API_URL : '');
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
  window.fateGetWebSocketAuthorityStatus = function(){
    return {
      url:configuredAuthorityUrl(),
      apiUrl:authorityHttpBaseUrl(),
      reducerMode:authorityReducerMode || '',
      rtdbDisabled:rtdbDisabledMode(),
      flyActionReplay:flyActionReplayEnabled(),
      flyRooms:flyRoomsEnabled(),
      activeRoomUsesFly:roomUsesFly(activeRoom || lastLobbyRoom || ''),
      authorityOnly:authorityOnlyMode(),
      firebaseActionFallbackAllowed:firebaseActionFallbackAllowed(),
      firebaseRoomTransportAllowed:firebaseRoomTransportAllowed(),
      strictCompactPayloads:String(authorityReducerMode || '').toLowerCase() === 'strict' && !firebaseActionFallbackAllowed(),
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
  // Spectators consume the same canonical state as the seated clients, but this
  // narrow bridge refuses to mutate a player session. Spectator transport stays
  // HTTP/read-only and never joins the gameplay WebSocket or sends an action.
  function spectatorRemotePresentationAction(action){
    if(!action || typeof action !== 'object') return null;
    const payload = cloneOnlinePlain(action.payload || {}) || {};
    const playerIndex = Number.isInteger(Number(payload.playerIndex))
      ? Number(payload.playerIndex)
      : (Number.isInteger(Number(action.playerIndex)) ? Number(action.playerIndex) : 0);
    return Object.assign({}, action, {
      uid:'spectator-player-' + playerIndex,
      playerIndex,
      payload:Object.assign({}, payload, {playerIndex})
    });
  }
  function beginSpectatorActionPresentation(g, action, reason){
    const remoteAction = spectatorRemotePresentationAction(action);
    if(!g || !remoteAction) return null;
    const seq = Number(remoteAction.seq || 0) || 0;
    const key = [seq, String(remoteAction.type || '').toUpperCase()].join(':');
    const shown = g._spectatorPresentedActionKeys instanceof Set ? g._spectatorPresentedActionKeys : new Set();
    g._spectatorPresentedActionKeys = shown;
    if(shown.has(key)) return null;
    shown.add(key);
    if(shown.size > 180){
      const first = shown.values().next().value;
      if(first) shown.delete(first);
    }
    const type = String(remoteAction.type || '').toUpperCase();
    if(type === 'EFFECT_CINEMATIC'){
      Promise.resolve(showPayloadEffectCinematic(g, remoteAction.payload || {}, reason || 'spectator effect cinematic')).catch(function(e){
        console.warn('Spectator effect cinematic failed', e);
      });
    }else{
      maybeShowRemoteEffectCinematicForAction(g, remoteAction, reason || 'spectator action cinematic');
    }
    return remoteAction;
  }
  window.fatePresentSpectatorAction = function(action, reason){
    const g = gameState();
    if(!g || !g._isSpectator || g._onlineRole !== 'spectator' || Number.isInteger(g._onlinePlayerIndex)) return false;
    const remoteAction = beginSpectatorActionPresentation(g, action, reason);
    if(!remoteAction) return false;
    maybeShowOnlinePresentationEvents(remoteAction);
    maybeShowOnlineEffectNegatedBanner(remoteAction, reason || 'spectator reaction presentation');
    if(String(remoteAction.type || '').toUpperCase() !== 'EFFECT_CINEMATIC'){
      playOnlineRemoteActionSound(remoteAction.type, remoteAction.payload || {}, remoteAction);
    }
    return true;
  };
  window.fateApplySpectatorCanonicalState = function(state, reason, action){
    const g = gameState();
    if(!g || !g._isSpectator || g._onlineRole !== 'spectator' || Number.isInteger(g._onlinePlayerIndex)) return false;
    const remoteAction = beginSpectatorActionPresentation(g, action, reason || 'spectator canonical state');
    const previousPresentation = collectOnlineRemotePresentationSnapshot(g);
    const applied = applyOnlineCanonicalState(state, reason || 'spectator canonical state', remoteAction || action || null);
    if(applied && remoteAction){
      maybePlayOnlineRemoteStatePresentation(g, previousPresentation, remoteAction, reason || 'spectator canonical presentation');
      maybeShowOnlineEffectNegatedBanner(remoteAction, reason || 'spectator reaction presentation');
      if(String(remoteAction.type || '').toUpperCase() !== 'EFFECT_CINEMATIC'){
        playOnlineRemoteActionSound(remoteAction.type, remoteAction.payload || {}, remoteAction);
      }
    }
    return applied;
  };
  window.fatePublishClientOwnedState = function(reason){
    const g = gameState();
    if(!isOnlineMatchState(g) || g._onlineApplyingRemoteAction) return false;
    scheduleClientResolvedAutoCommit(String(reason || 'client-owned-state'), 40);
    return true;
  };
  window.fateLeaveOnlineRoom = leaveRoom;
  installOnlineGameplayHooks();

  if(!window.__fateClientResolvedAutoCommitListenersInstalled){
    window.__fateClientResolvedAutoCommitListenersInstalled = true;
    const watchLocalMutation = reason=>setTimeout(()=>scheduleClientResolvedAutoCommit(reason, 60), 0);
    try{
      document.addEventListener('pointerup', ()=>watchLocalMutation('pointerup'), true);
      document.addEventListener('keyup', ()=>watchLocalMutation('keyup'), true);
      document.addEventListener('change', ()=>watchLocalMutation('change'), true);
    }catch(e){}
  }
  if(!window.__fateOnlineBrowserResumeCatchupInstalled){
    window.__fateOnlineBrowserResumeCatchupInstalled = true;
    try{
      document.addEventListener('visibilitychange', function(){
        if(!document.hidden) scheduleBrowserResumeAuthorityCatchup('visibility resume', 20);
      });
      window.addEventListener('focus', function(){
        scheduleBrowserResumeAuthorityCatchup('window focus', 20);
      });
      window.addEventListener('pageshow', function(){
        scheduleBrowserResumeAuthorityCatchup('page show', 20);
      });
    }catch(e){}
  }

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

  window.fateConfirmOnlineEndGame = function(){
    const g = gameState();
    if(!g?._onlineRoomCode) return false;
    showModal('Leave Online Match?',
      'Leave this online match? This will count as a forfeit for your opponent.',
      [
        {label:'Keep Playing', action:closeModal},
        {label:'Forfeit & Quit', danger:true, action:async ()=>{
          const bg = captureOnlineGameBackground();
          const rewardData = collectOnlineForfeitRewardData('defeat', g);
          closeModal();
          await leaveRoom(true).catch(e=>console.error('Online forfeit failed', e));
          if(typeof cleanupGame === 'function') cleanupGame();
          showOnlineForfeitResult('defeat', bg, {reason:'You left the match.', rewardData});
        }}
      ]);
    return true;
  };

  setTimeout(()=>{
    installOnlineRoomUnloadEndSignal();
    installEphemeralGuestUnloadCleanup();
    installOnlineGameplayHooks();
  },0);
})();
