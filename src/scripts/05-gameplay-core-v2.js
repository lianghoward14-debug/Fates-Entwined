//  TURN MANAGEMENT

function coercePlayerIndex(value, fallback) {
  if(value === 0 || value === 1) return value;
  const num = Number(value);
  if(Number.isFinite(num) && (num === 0 || num === 1)) return num;
  const str = String(value == null ? '' : value).toLowerCase().trim();
  if(['p1','player1','player_1','host','human','you','me'].includes(str)) return 0;
  if(['p2','player2','player_2','guest','opponent','ai','cpu'].includes(str)) return 1;
  if(typeof G !== 'undefined' && G && Array.isArray(G.players)) {
    const idx = G.players.findIndex(function(p){
      return p && [p.id, p.uid, p.playerId, p.remoteId, p.name].some(function(v){ return v != null && String(v).toLowerCase().trim() === str; });
    });
    if(idx === 0 || idx === 1) return idx;
  }
  return fallback;
}

function sameRiveraOwner(a, b) {
  const ai = coercePlayerIndex(a, null);
  const bi = coercePlayerIndex(b, null);
  if(ai !== null && bi !== null) return ai === bi;
  return String(a) === String(b);
}

function isRiveraEligibleCharacter(card) {
  return !!(card && card.type && card.type !== 'Supporter');
}

function findRiveraSourceCard(sourceIid) {
  let found = null;
  if(typeof forEachBoardCard !== 'function') return null;
  forEachBoardCard(function(card){
    if(found || !card) return;
    if(String(card.iid) === String(sourceIid)) found = card;
  });
  return found;
}

function getBoardRiveraDeclarationsForOwner(owner) {
  const ownerNum = coercePlayerIndex(owner, null);
  if(ownerNum === null || typeof forEachBoardCard !== 'function') return [];
  const declarations = [];
  forEachBoardCard(function(card){
    if(!card || card.id !== '51') return;
    const riveraOwner = coercePlayerIndex(card._riveraOwner, coercePlayerIndex(card.owner, null));
    if(riveraOwner === null || !sameRiveraOwner(riveraOwner, ownerNum)) return;
    const aff = card._riveraDeclaredAff || card.riveraDeclaredAff || card.declaredAff || card.affDeclared;
    if(!aff) return;
    const turns = Number(card._riveraBuffTurnsLeft ?? card._riveraTurnsLeft ?? card.riveraTurnsLeft ?? 3);
    if(Number.isFinite(turns) && turns <= 0) return;
    declarations.push({
      sourceIid: card.iid != null ? String(card.iid) : ('board_rivera_' + ownerNum + '_' + aff),
      aff: aff,
      owner: ownerNum,
      turnsLeft: Number.isFinite(turns) ? turns : 3,
      sourceCard: card
    });
  });
  return declarations;
}

function getAllRiveraDeclarationsForOwner(owner) {
  const ownerNum = coercePlayerIndex(owner, null);
  if(ownerNum === null) return [];
  const byKey = new Map();
  getBoardRiveraDeclarationsForOwner(ownerNum).forEach(function(d){
    byKey.set(String(d.sourceIid || (d.owner + ':' + d.aff)), d);
  });
  // Global state is now only a fallback/mirror. Board Rivera cards are source-of-truth.
  let buffs = [];
  try { buffs = normalizeRiveraEffects(); } catch(e) { buffs = []; }
  buffs.forEach(function(buff){
    if(!buff || Number(buff.turnsLeft) <= 0 || !sameRiveraOwner(buff.owner, ownerNum) || !buff.aff) return;
    const key = String(buff.sourceIid || (ownerNum + ':' + buff.aff));
    if(!byKey.has(key)) byKey.set(key, buff);
  });
  return Array.from(byKey.values());
}

function normalizeRiveraEffects() {
  if(typeof G === 'undefined' || !G) return [];
  const rawBuffs = [];

  if(Array.isArray(G._riveraBuffs)) {
    G._riveraBuffs.forEach(function(e){ if(e) rawBuffs.push(Object.assign({}, e)); });
  }
  if(G._riveraActiveEffects && typeof G._riveraActiveEffects === 'object') {
    Object.keys(G._riveraActiveEffects).forEach(function(key){
      const legacy = G._riveraActiveEffects[key];
      if(legacy) rawBuffs.push(Object.assign({sourceIid:key}, legacy));
    });
  }

  // Critical fallback: rebuild active Rivera buffs from the Rivera card on the board.
  // This survives old saves/sync payloads that preserve card fields but lose G._riveraBuffs.
  if(typeof forEachBoardCard === 'function') {
    forEachBoardCard(function(card){
      if(!card || card.id !== '51' || !card._riveraDeclaredAff) return;
      const turns = Number(card._riveraBuffTurnsLeft ?? card._riveraTurnsLeft ?? 3);
      if(!Number.isFinite(turns) || turns <= 0) return;
      rawBuffs.push({
        sourceIid: card.iid != null ? String(card.iid) : ('rivera_' + (card.owner ?? 'x')),
        aff: card._riveraDeclaredAff,
        owner: coercePlayerIndex(card._riveraOwner, coercePlayerIndex(card.owner, card.owner)),
        turnsLeft: turns,
        lastTickTurn: Number(card._riveraLastTickTurn ?? card._riveraStartedTurn ?? G.turn) || (Number(G.turn) || 1)
      });
    });
  }

  const byKey = new Map();
  rawBuffs.forEach(function(e){
    if(!e || !e.aff) return;
    const ownerNum = coercePlayerIndex(e.owner, null);
    if(ownerNum === null) return;
    const turnsNum = Number(e.turnsLeft ?? e.turns ?? e.remainingTurns);
    if(!Number.isFinite(turnsNum) || turnsNum <= 0) return;
    const key = String(e.sourceIid != null ? e.sourceIid : (ownerNum + ':' + e.aff));
    const normalized = Object.assign({}, e, {
      sourceIid: key,
      owner: ownerNum,
      aff: e.aff,
      turnsLeft: turnsNum,
      lastTickTurn: Number(e.lastTickTurn ?? e.startedTurn ?? e.startTurn ?? G.turn) || (Number(G.turn) || 1)
    });
    const prev = byKey.get(key);
    if(!prev || normalized.turnsLeft >= prev.turnsLeft) byKey.set(key, normalized);
  });

  G._riveraBuffs = Array.from(byKey.values());
  G._riveraActiveEffects = {};
  G._riveraBuffs.forEach(function(e, idx){
    const key = e.sourceIid != null ? String(e.sourceIid) : String(idx);
    G._riveraActiveEffects[key] = e;
    const source = findRiveraSourceCard(key);
    if(source) {
      source._riveraDeclaredAff = e.aff;
      source.riveraDeclaredAff = e.aff;
      source.declaredAff = e.aff;
      source._riveraBuffTurnsLeft = e.turnsLeft;
      source.riveraTurnsLeft = e.turnsLeft;
      source._riveraLastTickTurn = e.lastTickTurn;
      source._riveraOwner = e.owner;
    }
  });
  return G._riveraBuffs;
}

function startRiveraBuff(sourceCard, aff, owner) {
  if(typeof G === 'undefined' || !G || !sourceCard || !aff) return null;
  const ownerNum = coercePlayerIndex(owner, coercePlayerIndex(sourceCard.owner, 0));
  const sourceIid = sourceCard.iid != null ? String(sourceCard.iid) : ('rivera_' + ownerNum + '_' + Date.now());
  if(!Array.isArray(G._riveraBuffs)) G._riveraBuffs = [];
  // Rivera should have one active declared affiliation per Rivera card.
  G._riveraBuffs = G._riveraBuffs.filter(function(e){ return String(e && e.sourceIid) !== sourceIid; });
  const buff = { sourceIid: sourceIid, aff: aff, owner: ownerNum, turnsLeft: 3, lastTickTurn: Number(G.turn) || 1 };
  G._riveraBuffs.push(buff);

  sourceCard.owner = ownerNum;
  sourceCard._riveraDeclaredAff = aff;
  sourceCard.riveraDeclaredAff = aff;
  sourceCard.declaredAff = aff;
  sourceCard._riveraBuffTurnsLeft = 3;
  sourceCard.riveraTurnsLeft = 3;
  sourceCard._riveraStartedTurn = Number(G.turn) || 1;
  sourceCard._riveraLastTickTurn = Number(G.turn) || 1;
  sourceCard._riveraOwner = ownerNum;
  normalizeRiveraEffects();
  if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
  if(typeof updateTopBar === 'function') updateTopBar();
  if(typeof renderTopbarEffects === 'function') renderTopbarEffects();
  if(typeof showRiveraStatusBanner === 'function') showRiveraStatusBanner(aff, 3, ownerNum);
  return buff;
}

function tickRiveraBuffsForCurrentPlayer() {
  if(typeof G === 'undefined' || !G) return;
  const buffs = normalizeRiveraEffects();
  const currentPlayer = coercePlayerIndex(G.currentPlayer, null);
  let expired = false;
  buffs.forEach(function(buff){
    if(!buff || currentPlayer === null || !sameRiveraOwner(buff.owner, currentPlayer)) return;
    const currentTurn = Number(G.turn) || 0;
    if(currentTurn <= (Number(buff.lastTickTurn) || 0)) return;
    buff.turnsLeft = Number(buff.turnsLeft) - 1;
    buff.lastTickTurn = currentTurn;
    const source = findRiveraSourceCard(buff.sourceIid);
    if(source) {
      source._riveraBuffTurnsLeft = buff.turnsLeft;
      source.riveraTurnsLeft = buff.turnsLeft;
      source._riveraLastTickTurn = buff.lastTickTurn;
    }
    if(buff.turnsLeft <= 0) expired = true;
  });
  if(expired) toast('Rivera\'s affiliation buff has expired');
  normalizeRiveraEffects();
}

function applyRiveraBuffToPlacedCard(inst, owner) {
  if(!inst || typeof G === 'undefined' || !G) return false;
  if(inst.id === '51') return false; // declaring Rivera does not buff himself.
  if(!isRiveraEligibleCharacter(inst)) return false;
  if(inst.noBonus) return false;
  const ownerNum = coercePlayerIndex(owner, coercePlayerIndex(inst.owner, null));
  if(ownerNum === null) return false;

  const declarations = getAllRiveraDeclarationsForOwner(ownerNum);
  let applied = false;
  declarations.forEach(function(buff){
    if(!buff || Number(buff.turnsLeft) <= 0 || !sameRiveraOwner(buff.owner, ownerNum) || buff.aff !== inst.aff) return;
    if(!inst._riveraAppliedBuffs) inst._riveraAppliedBuffs = {};
    const key = String(buff.sourceIid || buff.aff || 'rivera');
    if(inst._riveraAppliedBuffs[key]) return;
    const before = Number(inst.currentFate ?? inst.fate ?? 0) || 0;
    inst.currentFate = Math.max(0, before + 3);
    inst._riveraAppliedBuffs[key] = true;
    inst._riveraFateBonus = (Number(inst._riveraFateBonus) || 0) + 3;
    applied = true;
  });

  if(applied) {
    toast(inst.name + ' gains 3 Fate from Rivera!');
    if(typeof playSfx === 'function') playSfx('fateGain');
    if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
    if(typeof updateTopBar === 'function') updateTopBar();
  }
  return applied;
}


function ensureRiveraActiveEffectsState() {
  return normalizeRiveraEffects();
}

//
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function endTurn() {
  if(G._turnInputLockUntil && Date.now() < G._turnInputLockUntil) return;
  G._turnInputLockUntil = Date.now() + 350;
  if(typeof tutorialEvent==='function' && _tutorialActive) tutorialEvent('endTurn');
  if(typeof triggerAIDialogue==='function') triggerAIDialogue('turnStart');
  // Block human from ending turn while AI is actively running
  if(G._aiRunning) return;
  const hadPendingInteraction = !!(
    G._consolidating ||
    G._wolfCreekMoving ||
    G._expMoving ||
    G._berkeleyMoving ||
    G._bh01Moving ||
    G.placing ||
    G.selectedHandCard !== null ||
    G.selectedBoardCard !== null
  );
  resetInteractionState();
  if(hadPendingInteraction){
    clearPlaceHighlights();
    setHint('Select a card to play');
    renderGame();
  }

  const cp = G.currentPlayer;
  G._skipImprovisorCheck = false;

  // Check win condition at end of turn 10
  if(G.turn >= G.maxTurns) {
    checkWin();
    return;
  }

  // Transition to next player
  const next = 1 - G.currentPlayer;
  // Online rooms are not a same-device handoff, so pass directly to the
  // replayed next turn instead of showing the local pass-turn overlay.
  if(G._onlineRoomCode){
    nextPlayerTurn();
  } else if(G.aiEnabled && (next===G.aiPlayer || G.currentPlayer===G.aiPlayer)){
    nextPlayerTurn();
  } else {
    showPassTurn(next);
  }
}

function showPassTurn(nextPlayer) {
  if(G._onlineRoomCode){
    nextPlayerTurn();
    return;
  }
  const overlay = document.getElementById('pt-overlay');
  document.getElementById('pt-title').textContent = 'Pass to '+G.players[nextPlayer].name;
  overlay.classList.add('on');
}

function hidePT() {
  hidePassTurnOverlay();
  nextPlayerTurn();
}

async function nextPlayerTurn() {
  // Clear suppression if the just-ended turn belonged to the suppression target
  // (current player before switching = the one whose turn just ended)
  if(G.oppSuppressedNextTurn && G.currentPlayer===G.suppressTarget) {
    G.oppSuppressedNextTurn = false;
    G.suppressTarget = null;
  }

  G.currentPlayer = 1 - G.currentPlayer;
  G.turn++;
  G._turnInputLockUntil = Date.now() + 650;
  G.phase = 'main';
  G.supportsPlacedThisTurn = 0;
  // Lock initiator effects that were activated this turn
  G.board.forEach(function(zone){ zone.forEach(function(row){ if(row) row.forEach(function(cell){
    if(cell && cell.effectUsedInitial && !cell._effectTurnLocked) cell._effectTurnLocked = true;
  }); }); });
  G.extraSupportsThisTurn = 0;
  G.maxSupportsPerTurn = 2; // reset (Selva Islands Pirate may have changed it)

  // Last turn announcement
  const turnsLeft = G.maxTurns - G.turn;
  if(turnsLeft <= 1 && typeof showLastTurnBanner === 'function') {
    showLastTurnBanner(G.players[G.currentPlayer].name, turnsLeft === 0);
  }

  // Update active effects panel
  if(typeof updateActiveEffectsPanel === 'function') updateActiveEffectsPanel();
  resetInteractionState();
  G.majaEffectThisTurn = false;

  // Reset per-turn effect-used flags on all board cards for the NEW current player
  forEachBoardCard((card)=>{
    if(card.owner===G.currentPlayer) {
      card.effectUsedThisTurn = false;
      if(card.id==='52') card.vigilanteUsed = false;
      if(card.id==='54') card.wolfCreekUsed = false;
      if(card.id==='73') card._expMoved = false;
      if(card.id==='bh01') card.bh01MovedThisTurn = false;
    }
  });
  G._zimbabweUsedThisTurn = false;
  G._polishUsedThisTurn = false;
  tickRiveraBuffsForCurrentPlayer();

  // Wine Country Guerilla (70): tick down counter and debuff random card in holder's hand
  const currentPlayer = G.currentPlayer;
  const holderHand = G.players[currentPlayer].hand;
  const guerillaCards = holderHand.filter(c=>c.id==='70' && c.guerilla_transferred && c.guerilla_turnsLeft>0);
  guerillaCards.forEach(gc=>{
    // Pick a random non-guerilla card in this hand and reduce its fate by 1
    const candidates = holderHand.filter(c=>c.iid!==gc.iid && c.id!=='70');
    if(candidates.length>0){
      const rng = (typeof G._onlineRng === 'function') ? G._onlineRng : Math.random;
      const target = candidates[Math.floor(rng()*candidates.length)];
      const before = Math.max(0, Number(target.currentFate ?? target.fate) || 0);
      target.currentFate = Math.max(0, before - 1);
      if(target.currentFate < before){
        if(!G._continuousDamageSources) G._continuousDamageSources = new Set();
        const sourceOwner = (gc.guerilla_owner===0 || gc.guerilla_owner===1) ? gc.guerilla_owner : (1-currentPlayer);
        G._continuousDamageSources.add(sourceOwner+':70:'+gc.iid);
      }
      toast(`Wine Country Guerilla reduces ${target.name}'s Fate by 1!`);
      log(currentPlayer===0?'p1':'p2', `Wine Country Guerilla debuffed ${target.name} (-1 Fate)`);
      playSfx('debuff');
    }
    gc.guerilla_turnsLeft--;
    if(gc.guerilla_turnsLeft<=0){
      // Send to original owner's discard
      G.players[currentPlayer].hand = G.players[currentPlayer].hand.filter(c=>c.iid!==gc.iid);
      const origOwner = gc.guerilla_owner;
      G.players[origOwner].discard.push(gc);
      toast('Wine Country Guerilla returned to original owner\'s discard');
    }
  });
  renderHand();

  // Draw 1 card
  await drawCard(G.currentPlayer, 1, { drawPhase: true });

  // Phil (46) — Monarchist Manifesto: gains 2 Fate per draw phase after being set
  forEachBoardCard((card)=>{
    if(card.id==='46' && card.owner===G.currentPlayer && typeof card._philSetTurn==='number') {
      card.currentFate += 2;
      // Visual sparkle on Phil
      const cellEl = document.querySelector(`[data-z][data-r][data-c]`);
      // Find Phil's cell for sparkle
      forEachBoardCard((c2,z2,r2,c2c)=>{
        if(c2.iid===card.iid){
          const el = document.querySelector(`[data-z="${z2}"][data-r="${r2}"][data-c="${c2c}"]`);
          if(el) { el.classList.add('effect-flash'); setTimeout(()=>el.classList.remove('effect-flash'),600); }
        }
      });
    }
  });

  // Artillery Distance (50) zone lock: decrement and clear
  if(typeof G._artilleryLockTurnsLeft==='number' && G._artilleryLockTurnsLeft>0 && G._artilleryLockOwner===G.currentPlayer) {
    G._artilleryLockTurnsLeft--;
    if(G._artilleryLockTurnsLeft <= 0) {
      toast('Artillery Distance lock expired.');
      G._artilleryLockedZone = null;
      G._artilleryLockOwner = null;
    }
  }

  log('sys','Turn '+G.turn+' — '+G.players[G.currentPlayer].name);
  showTurnFlash();

  // Apply continuous effects
  applyContinuousEffects();

    renderGame();

  // Start turn timer (skip for AI — AI manages its own pacing)
  if(G.aiEnabled && G.currentPlayer===G.aiPlayer){
    stopTurnTimer();
    startAITurnVisualTimer();
    G._aiTurnToken = (G._aiTurnToken || 0) + 1;
    setTimeout(runAITurn, 900);
  } else {
    G._aiRunning = false;
    G._aiAbort = false;
    G._aiAborted = false;
    startTurnTimer();
  }
}

function applyContinuousEffects() {
  // Rebuild Shield Wall zones from board state (so removal cleans up)
  G.shieldWallZones = [];
  forEachBoardCard((card, z)=>{
    if(card.id==='20' && !G.shieldWallZones.includes(z)) G.shieldWallZones.push(z);
  });
  // Update cantBeMoved flags based on current shield wall zones
  forEachBoardCard((card, z)=>{
    if(G.shieldWallZones.includes(z)) card.cantBeMoved = true;
    else if(card.cantBeMoved) card.cantBeMoved = false;
  });

  // Berkeley CS Major (50): now a when-set zone lock effect — no continuous effect needed

  // Soviet Grenadiers (44): adjacency to Dauntless — additive bonus flag
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  TURN TIMER (2 minutes default)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const TURN_TIME_LIMIT = 180; // seconds
let _turnTimerInterval = null;
let _turnTimerRemaining = TURN_TIME_LIMIT;
let _lastTurnWarnSecond = null;
let _aiTurnVisualTimerInterval = null;
let _aiTurnVisualSeconds = 0;

function getTurnTimeLimit() {
  return _tutorialActive ? 300 : TURN_TIME_LIMIT;
}

function formatTurnClock(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const m = Math.floor(safeSeconds / 60);
  const s = safeSeconds % 60;
  return `${m}:${s<10?'0':''}${s}`;
}

function updateAITurnVisualTimerDisplay() {
  const el = document.getElementById('tp-timer');
  const hudTimer = document.getElementById('turn-hud-timer');
  const timerText = `AI ${formatTurnClock(_aiTurnVisualSeconds)}`;
  if(el){
    el.textContent = timerText;
    el.className = 'ai-thinking';
  }
  if(hudTimer){
    hudTimer.dataset.timerMode = 'ai';
    hudTimer.textContent = timerText;
  }
}

function stopAITurnVisualTimer(opts={}) {
  const clear = opts.clear !== false;
  if(_aiTurnVisualTimerInterval){
    clearInterval(_aiTurnVisualTimerInterval);
    _aiTurnVisualTimerInterval = null;
  }
  if(!clear) return;
  const el = document.getElementById('tp-timer');
  if(el && el.classList.contains('ai-thinking')){
    el.textContent = '';
    el.className = '';
  }
  const hudTimer = document.getElementById('turn-hud-timer');
  if(hudTimer && hudTimer.dataset.timerMode === 'ai'){
    hudTimer.textContent = '0:00';
    delete hudTimer.dataset.timerMode;
  }
}

function startAITurnVisualTimer() {
  stopAITurnVisualTimer({clear:false});
  _aiTurnVisualSeconds = 0;
  updateAITurnVisualTimerDisplay();
  _aiTurnVisualTimerInterval = setInterval(()=>{
    _aiTurnVisualSeconds++;
    updateAITurnVisualTimerDisplay();
  }, 1000);
}

// Stop all game-related timers and flags when leaving game
function cleanupGame() {
  if(typeof window.invalidateFateRenderCaches === 'function') window.invalidateFateRenderCaches();
  stopTurnTimer();
  if(typeof cleanupLeavingGameScreenArtifacts === 'function') cleanupLeavingGameScreenArtifacts();
  else hidePassTurnOverlay();
  G._aiRunning = false;
  G._aiAborted = true; // Signal AI promises to bail out
  G._aiAbort = true; // Also set the abort flag checked by rendering/animation guards
  G.aiEnabled = false;
  resetInteractionState();
  G._artilleryLockedZone = null;
  G._artilleryLockOwner = null;
  G._artilleryLockTurnsLeft = 0;
  _lastGameSong = null;
  // Remove any game overlays/popups that might linger
  if(typeof removeOpponentFound === 'function') removeOpponentFound();
  if(typeof removeInGameChat === 'function') removeInGameChat();
  if(typeof cleanupFloatingGameArtifacts === 'function') cleanupFloatingGameArtifacts();
  closeGameModal();
  if(typeof releaseRenderedGameDom === 'function') releaseRenderedGameDom();
  // Stop any music
  if(typeof stopAllMusic==='function') stopAllMusic();
  if(_musicEnabled && typeof playBgMusic==='function') playBgMusic();
}

function startTurnTimer() {
  stopTurnTimer();
  _turnTimerRemaining = getTurnTimeLimit();
  _lastTurnWarnSecond = null;
  updateTimerDisplay();
  _turnTimerInterval = setInterval(()=>{
    _turnTimerRemaining--;
    updateTimerDisplay();
    if(_turnTimerRemaining <= 0){
      stopTurnTimer();
      toast("Time's up! Turn auto-ended.");
      endTurn();
    }
  }, 1000);
}

function stopTurnTimer() {
  if(_turnTimerInterval){
    clearInterval(_turnTimerInterval);
    _turnTimerInterval = null;
  }
  stopAITurnVisualTimer();
  _lastTurnWarnSecond = null;
  const el = document.getElementById('tp-timer');
  if(el){ el.textContent = ''; el.className = ''; }
  const warn = document.getElementById('turn-timer-warning');
  if(warn) warn.remove();
}

function showTurnTimerWarning(seconds) {
  // No overlay — the topbar timer already shows the countdown
  // Just add a brief screen-edge flash for urgency
  const el = document.getElementById('tp-timer');
  if(el) {
    el.style.transform = 'scale(1.3)';
    setTimeout(()=>{ if(el) el.style.transform = ''; }, 300);
  }
}

function updateTimerDisplay() {
  const el = document.getElementById('tp-timer');
  const hudTimer = document.getElementById('turn-hud-timer');
  const hud = document.getElementById('turn-hud');
  if(!el && !hudTimer) return;
  const timerText = formatTurnClock(_turnTimerRemaining);
  if(el) el.textContent = timerText;
  if(hudTimer) hudTimer.textContent = timerText;
  const setTimerState = function(state){
    if(el) el.className = state;
    if(hud){
      hud.classList.toggle('warning', state === 'warning');
      hud.classList.toggle('urgent', state === 'urgent');
    }
  };
  // Urgency colors
  if(_turnTimerRemaining <= 10){
    setTimerState('urgent');
    if(_lastTurnWarnSecond !== _turnTimerRemaining){
      _lastTurnWarnSecond = _turnTimerRemaining;
      if(typeof playSfx === 'function') playSfx('timerWarn');
      showTurnTimerWarning(_turnTimerRemaining);
    }
  } else if(_turnTimerRemaining <= 30){
    setTimerState('warning');
  } else {
    setTimerState('');
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  CARD PLACEMENT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function selectHandCard(idx) {
  if(G.phase!=='main') return;
  if(G.aiEnabled && (G.currentPlayer===G.aiPlayer || G._aiRunning)) return;
  // Cancel any active consolidation
  if(G._consolidating){
    G._consolidating = null;
    clearPlaceHighlights();
    setHint('Select a card to play');
    renderGame();
  }
  const player = G.players[G.currentPlayer];
  const card = player.hand[idx];
  if(!card) return;

  // Wine Country Guerilla (70): before infiltration, it is manually activated from the hand detail window.
  // After infiltration, it is view-only and cannot be set.
  if(card.id==='70'){
    G.selectedHandCard = idx;
    renderHand();
    openCardDetail(card, true, false);
    if(card.guerilla_transferred) toast(card.name + ' cannot be set — it\'s debuffing your hand!');
    return;
  }

  if(G.selectedHandCard===idx) {
    G.selectedHandCard=null;
    G.placing=false;
    clearPlaceHighlights();
    renderHand();
    return;
  }

  G.selectedHandCard = idx;
  G.placing = false;
  renderHand();
  openCardDetail(card, true);
}

function placeSelected() {
  if(G.selectedHandCard===null) {toast('Select a card from your hand first');return;}
  const player = G.players[G.currentPlayer];
  const card = player.hand[G.selectedHandCard];
  if(!card) return;

  // Lina free-set bypass: skip all placement restrictions
  const isLinaFree = G._linaFreeIids && G._linaFreeIids.has(card.iid);

  if(!isLinaFree && card.type==='Supporter') {
    const totalSupports = G.supportsPlacedThisTurn;
    const maxSup = G.maxSupportsPerTurn + G.extraSupportsThisTurn;
    // Maja Kaminska effect: unlimited supporters
    if(G.majaEffectThisTurn) {} // allow
    else if(totalSupports >= maxSup) {toast('Reinforcement limit reached: '+maxSup+' per turn');return;}
  }

  G.placing = true;
  closeModal();
  highlightValidCells(card);
  setHint('Choose a cell to place '+card.name);
}

function zoneHasFriendlyCharacter(z, owner, excludeIids) {
  let found = false;
  const excluded = excludeIids instanceof Set ? excludeIids : new Set();
  G.board[z].forEach(row=>row.forEach(cell=>{
    if(cell && cell.owner === owner && cell.type !== 'Supporter' && !excluded.has(cell.iid)) found = true;
  }));
  return found;
}

function zoneHasFriendlyChingachlook(z, owner, excludeIids) {
  let found = false;
  const excluded = excludeIids instanceof Set ? excludeIids : new Set();
  G.board[z].forEach(row=>row.forEach(cell=>{
    if(cell && cell.id === '45' && cell.owner === owner && !excluded.has(cell.iid)) found = true;
  }));
  return found;
}

function getChingachlookPlacementBlockReason(card, z, owner, excludeIids) {
  if(!card || card.type === 'Supporter') return '';
  if(card.id === '45' && zoneHasFriendlyCharacter(z, owner, excludeIids)) {
    return 'Chingachlook can only be set in a zone with no other friendly characters';
  }
  if(card.id !== '45' && zoneHasFriendlyChingachlook(z, owner, excludeIids)) {
    return 'Chingachlook forbids other characters in this zone';
  }
  return '';
}

function highlightValidCells(card) {
  clearPlaceHighlights();
  for(let z=0;z<3;z++) {
    // Artillery Distance (50): zone locked for this player
    if(typeof G._artilleryLockedZone==='number' && G._artilleryLockedZone===z && G._artilleryLockOwner===G.currentPlayer && G._artilleryLockTurnsLeft>0) continue;
    const totalRows = 3 + ((G.extraRows && G.extraRows[z]) || 0);
    if(getChingachlookPlacementBlockReason(card, z, G.currentPlayer)) continue;
    for(let r=0;r<totalRows;r++) {
      // Row 0 = p2 safe, Row 1 = contested, Row 2 = p1 safe, Row 3+ = extra safe
      let rowOwner;
      if(r===0) rowOwner=1;
      else if(r===1) rowOwner=-1; // contested
      else if(r===2) rowOwner=0;
      else {
        rowOwner = typeof getExtraSafeRowOwner === 'function' ? getExtraSafeRowOwner(z) : 0;
      }
      const cp = G.currentPlayer;
      if(rowOwner!==-1 && rowOwner!==cp) continue;
      if(r>=3 && typeof isPlayableSafeSquare === 'function' && !isPlayableSafeSquare(z,r,0,cp)) {
        const anyPlayable = [0,1,2].some(cc => isPlayableSafeSquare(z,r,cc,cp));
        if(!anyPlayable) continue;
      }
      if(card.contestedOnly && r!==1) continue;
      if(!G.board[z][r]) continue;
      const baseCols = 3;
      const extraP1 = r<3?(G.extraCells[z][r].p1||0):0;
      const extraP2 = r<3?(G.extraCells[z][r].p2||0):0;
      const totalCols = baseCols + (cp===0?extraP1:extraP2);
      for(let c=0;c<totalCols;c++) {
        if(r>=3 && typeof isPlayableSafeSquare === 'function' && !isPlayableSafeSquare(z,r,c,cp)) continue;
        if(isBlocked(z,r,c)) continue;
        if(G.board[z][r][c]!==null) continue;
        if(card.type==='Supporter' && isBlockedByAlondra(z,r,c,cp)) continue;
        const cellEl = document.querySelector(`[data-z="${z}"][data-r="${r}"][data-c="${c}"]`);
        if(cellEl) cellEl.classList.add('placeable');
      }
    }
  }
}

function isBlockedByAlondra(z,r,c,player) {
  const opp = 1-player;
  const zone = G.board[z];
  for(let rr=0;rr<zone.length;rr++){
    if(!zone[rr]) continue;
    for(let cc=0;cc<zone[rr].length;cc++) {
      const cell = zone[rr][cc];
      if(cell && cell.id==='14' && cell.owner===opp) {
        const dr=Math.abs(rr-r), dc=Math.abs(cc-c);
        // Ongoing suppression: ADJACENT only (orthogonal — up/down/left/right)
        if((dr+dc)===1) return true;
      }
    }
  }
  return false;
}

function clearPlaceHighlights() {
  document.querySelectorAll('.cell.placeable').forEach(el=>el.classList.remove('placeable'));
  document.querySelectorAll('.zone.busser-zone-target').forEach(el=>el.classList.remove('busser-zone-target'));
}


function clearBoardTargetSelection() {
  if(typeof document !== 'undefined') {
    document.querySelectorAll('.cell.board-target-choice,.bc.board-target-choice-card').forEach(function(el){
      el.classList.remove('board-target-choice','board-target-choice-card');
    });
  }
  if(typeof G !== 'undefined' && G) G._boardTargeting = null;
}

function beginBoardCardTargetSelection(opts) {
  opts = opts || {};
  const zone = Number(opts.zone);
  const filter = typeof opts.filter === 'function' ? opts.filter : function(){ return true; };
  const targets = [];
  if(!G.board || !G.board[zone]) { toast('No valid zone'); return false; }
  G.board[zone].forEach(function(row, r){
    if(!row) return;
    row.forEach(function(cell, c){
      if(cell && filter(cell, zone, r, c)) targets.push({card:cell, z:zone, r:r, c:c});
    });
  });
  if(!targets.length){ toast(opts.emptyMessage || 'No valid targets in this zone'); return false; }
  G._boardTargeting = {
    zone: zone,
    sourceIid: opts.sourceIid || null,
    prompt: opts.prompt || 'Choose a highlighted card.',
    filter: filter,
    onTarget: typeof opts.onTarget === 'function' ? opts.onTarget : null
  };
  clearPlaceHighlights();
  renderGame();
  targets.forEach(function(t){
    const cellEl = document.querySelector('[data-z="'+t.z+'"][data-r="'+t.r+'"][data-c="'+t.c+'"]');
    if(cellEl){
      cellEl.classList.add('placeable','board-target-choice');
      const bc = cellEl.querySelector('.bc');
      if(bc) bc.classList.add('board-target-choice-card');
    }
  });
  toast(opts.prompt || 'Choose a highlighted card.');
  if(typeof setHint === 'function') setHint(opts.prompt || 'Choose a highlighted card.');
  return true;
}

// Vigilantes (52) — pick opponent card in zone, set reinforcement to 0
function vigilantePickTarget(targetZ, cp, opp, inst) {
  const oppCards = [];
  G.board[targetZ].forEach((row,ri)=>row.forEach((cell,ci)=>{
    if(cell && cell.owner===opp) oppCards.push({card:cell,z:targetZ,r:ri,c:ci});
  }));
  if(oppCards.length===0){toast('No opponent cards in Zone '+(targetZ+1));return;}
  pickCardInZone(targetZ,'Marked for Death: select one opponent card in this zone.',(tgt)=>{
    tgt._markedForDeath = true;
    tgt._reinforcementOverride = 0;
    toast(tgt.name+' has been Marked for Death — 0 Reinforcement!');
    log(cp===0?'p1':'p2','Vigilantes marked '+tgt.name+' for death');
    renderGame();
  }, cell=>cell && cell.owner===opp);
}

// Rozsi Szocs (34) — Coordinator(2): cards moved into zone gain +2 Fate (not setting)
function triggerRozsiPassive(card, destZ) {
  forEachBoardCard((c, cz, cr, cc) => {
    if(c.id === '34' && cz === destZ && c.owner === card.owner && !isSupporterAuraSuppressed(c)) {
      if(typeof modifyFate === 'function') modifyFate(card, 2, 'permanent');
      else card.currentFate = (card.currentFate || card.fate || 0) + 2;
      toast(card.name + ' gains 2 Fate from Hungarian Dance!');
      if(typeof playSfx === 'function') playSfx('fateGain');
    }
  });
}

async function clickCell(z,r,c) {
  if(G._havanoDeploying) {
    handleHavanoDeployClick(z,r,c);
    return;
  }
  // Block interaction during AI turn
  if(G.aiEnabled && (G.currentPlayer===G.aiPlayer || G._aiRunning)) return;
  // Handle direct board-card targeting flows. Same-zone effects such as Vigilantes
  // should not open a card-picker window; the player clicks a highlighted board card.
  if(G._boardTargeting) {
    const tgt = G._boardTargeting;
    const cell = G.board[z] && G.board[z][r] ? G.board[z][r][c] : null;
    if(!cell || z !== tgt.zone || (typeof tgt.filter === 'function' && !tgt.filter(cell,z,r,c))){
      toast(tgt.prompt || 'Choose one of the highlighted cards');
      return;
    }
    const cb = tgt.onTarget;
    clearBoardTargetSelection();
    clearPlaceHighlights();
    if(typeof cb === 'function') cb(cell,z,r,c);
    return;
  }

  // Handle on-board consolidation flow
  if(G._consolidating){
    if(handleConsolidateClick(z,r,c)) return;
  }
  // Handle Zoe's blocking effect (zone-specific) or Carolyn's (any zone)
  if(G.blockingCell) {
    const blockZ = window._blockZone===-1 ? z : window._blockZone;
    const blockType = window._blockZone===-1 ? 'carolyn' : 'zoe';
    const owner = G.currentPlayer;
    const blockedPlayer = blockType === 'zoe' ? 1 - owner : null;
    // Zoe cannot target a cell already locked by Carolyn (Carolyn is stronger)
    const existingBlock = G.blockedCells.find(b=>b.z===blockZ&&b.r===r&&b.c===c);
    if(blockType==='zoe' && existingBlock && existingBlock.type==='carolyn') {
      toast('This cell is already locked by Carolyn - Zoe cannot target it');
      playSfx('blocked');
      return;
    }
    // Carolyn CAN override a Zoe block (her lock is stronger)
    if(blockType==='carolyn' && existingBlock && existingBlock.type==='zoe') {
      existingBlock.type = 'carolyn'; // upgrade the block
      existingBlock.owner = owner;
      existingBlock.blockedPlayer = null;
    } else if(!existingBlock) {
      G.blockedCells.push({z:blockZ,r,c,type:blockType,owner,blockedPlayer});
    }
    if(typeof normalizeBlockedCells === 'function') normalizeBlockedCells();
    G.blockingCell=false;G.placing=false;
    clearPlaceHighlights();
    // Show visual effect for the block
    if(typeof showBlockVisual === 'function') showBlockVisual(blockZ,r,c,blockType);
    if(blockType==='carolyn') {
      playSfx('zoneBlock');
      toast('Cell permanently locked by Carolyn!');
    } else {
      playSfx('zoeBlock');
      toast('No consolidation on this cell - Zoe is watching!');
    }
    renderGame();return;
  }
  if(G._markSelecting) {
    const sel = G._markSelecting;
    if(sel.player !== G.currentPlayer){ G._markSelecting = null; return; }
    const markRowCapacity = G.board && G.board[z] && G.board[z][r] ? G.board[z][r].length : 3;
    if(r !== 3 || c < 0 || c >= markRowCapacity){
      toast('Choose one of the highlighted safe-square slots');
      return;
    }
    if(typeof isFullExtraSafeRow === 'function' && isFullExtraSafeRow(z)){
      toast('That zone already has a full extra safe row');
      return;
    }
    if(typeof isMarkSafeSquare === 'function' && isMarkSafeSquare(z,r,c)){
      toast('That safe square is already available');
      return;
    }
    const added = typeof addBottomSafeSquareForPlayer === 'function' ? addBottomSafeSquareForPlayer(z, G.currentPlayer, c) : null;
    G._markSelecting = null;
    G.placing = false;
    clearPlaceHighlights();
    // Clean up pre-created extra rows in zones Mark didn't use
    if(G._markPreCreatedZones){
      G._markPreCreatedZones.forEach(function(mz){
        if(mz !== z){
          var row3 = G.board[mz] ? G.board[mz][3] : null;
          var rowEmpty = !row3 || row3.every(function(c){ return c === null; });
          var hasFullOwner = G.extraRowOwners && G.extraRowOwners[mz] && G.extraRowOwners[mz].some(function(owner){ return typeof owner === 'number'; });
          var hasMarkSquare = typeof isMarkSafeSquare === 'function' && [0,1,2].some(function(cc){ return isMarkSafeSquare(mz, 3, cc); });
          if(rowEmpty && !hasFullOwner && !hasMarkSquare){
            G.extraRows[mz] = 0;
            if(G.extraRowOwners && G.extraRowOwners[mz]) G.extraRowOwners[mz].splice(0, 1);
            if(G.extraRowFullOwners) G.extraRowFullOwners[mz] = null;
            if(G.board[mz] && G.board[mz][3]) G.board[mz].splice(3, 1);
          }
        }
      });
      delete G._markPreCreatedZones;
    }
    if(!added){ toast('Could not add that safe square'); renderGame(); return; }
    toast(`Added one safe square to Zone ${z+1}`);
    log(G.currentPlayer===0?'p1':'p2', `Mark Kemper added one safe square to Zone ${z+1}`);
    renderGame();
    if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
    return;
  }
  if(G._busserMoving) {
    const mv = G._busserMoving;
    const valid = mv.options.some(o=>o.z===z && o.r===r && o.c===c);
    if(!valid){toast('Choose one of the highlighted Busser squares');return;}
    if(G.board[z][r][c]!==null || isBlocked(z,r,c)){toast('Cell is not open');return;}
    G.board[mv.src.z][mv.src.r][mv.src.c] = null;
    G.board[z][r][c] = mv.card;
    mv.card.whenSetActivated = false;
    G._busserMoving = null;
    G.placing = false;
    clearPlaceHighlights();
    toast(`${mv.card.name} moved and re-activating`);
    G._suppressEffectPrompt = true;
    runWhenSetEffect(mv.card, z, r, c);
    G._suppressEffectPrompt = false;
    mv.card.whenSetActivated = true;
    renderGame();
    return;
  }
  // Handle Berkeley Homeless (62) movement
  if(G._berkeleyMoving) {
    const mv = G._berkeleyMoving;
    const valid = mv.options.some(o=>o.z===z&&o.r===r&&o.c===c);
    if(!valid){toast('Must pick a valid open square');return;}
    if(G.board[z][r][c]!==null){toast('Cell is occupied');return;}
    G.board[mv.fromZ][mv.fromR][mv.fromC] = null;
    G.board[z][r][c] = mv.inst;
    G._berkeleyMoving = null;
    G.placing = false;
    clearPlaceHighlights();
    toast('Berkeley Homeless moved');
    renderGame(); return;
  }
  // Handle Anicka Voyager (bh01) movement
  if(G._bh01Moving) {
    if(G.board[z][r][c]!==null){toast('Cell is occupied');return;}
    const mv = G._bh01Moving;
    G.board[mv.fromZ][mv.fromR][mv.fromC] = null;
    mv.card.owner = G.currentPlayer;
    mv.card.bh01MovedThisTurn = true;
    G.board[z][r][c] = mv.card;
    G._bh01Moving = null;
    G.placing = false;
    clearPlaceHighlights();
    await drawCard(G.currentPlayer, 1);
    toast('Anicka moved! Drew 1 card.');
    renderGame();
    return;
  }
  // Handle Wolf Creek (54) movement
  if(G._wolfCreekMoving) {
    const mv = G._wolfCreekMoving;
    if(!mv || typeof mv !== 'object' || !mv.card){
      G._wolfCreekMoving = null;
      G.placing = false;
      clearPlaceHighlights();
      toast('Wolf Creek movement cancelled');
      renderGame();
      return;
    }
    const valid = !mv.options || mv.options.some(o=>o.z===z && o.r===r && o.c===c);
    if(!valid){toast('Choose one of the highlighted Wolf Creek squares');return;}
    if(G.board[z][r][c]!==null || isBlocked(z,r,c)){toast('Cell is occupied');return;}
    G.board[mv.fromZ][mv.fromR][mv.fromC] = null;
    G.board[z][r][c] = mv.card;
    if(mv.wolfCreekCard) mv.wolfCreekCard.wolfCreekUsed = true;
    G._wolfCreekMoving = null;
    G.placing = false;
    clearPlaceHighlights();
    triggerRozsiPassive(mv.card, z); // Rozsi: +2 fate on move into zone
    toast(mv.card.name+' moved!');
    playSfx('effect');
    if(typeof playSfx === 'function') playSfx('effectActivate');
    if(typeof updateDailyChallengeProgress === 'function') updateDailyChallengeProgress('effects', 1, 'add');
    renderGame();
    return;
  }
  // Handle ALPINE Expeditionary (73) movement
  // Busser movement: move card to adjacent zone
  if(G._busserMovingCard) {
    if(G.board[z][r][c]!==null){toast('Cell is occupied');return;}
    const mv = G._busserMovingCard;
    const cp = typeof mv.card._busserOwner === 'number' ? mv.card._busserOwner : G.currentPlayer;
    const ownerSafeRow = cp === 0 ? 2 : 0;
    // Validate: must be contested row or owner's safe row in adjacent zone
    if(r !== 1 && r !== ownerSafeRow){toast('Can only move to contested row or your safe row');return;}
    const adjZones = [];
    if(mv.fromZ > 0) adjZones.push(mv.fromZ - 1);
    if(mv.fromZ < 2) adjZones.push(mv.fromZ + 1);
    if(!adjZones.includes(z)){toast('Must move to an adjacent zone');return;}
    G.board[mv.fromZ][mv.fromR][mv.fromC] = null;
    G.board[z][r][c] = mv.card;
    mv.card._busserMovedThisTurn = true;
    G._busserMovingCard = null;
    G.placing = false;
    clearPlaceHighlights();
    triggerRozsiPassive(mv.card, z); // Rozsi: +2 fate on move into zone
    toast(mv.card.name + ' moved to Zone ' + (z+1) + '!');
    playSfx('effect');
    log(cp===0?'p1':'p2', mv.card.name + ' moved via Busser to Zone ' + (z+1));
    renderGame();
    return;
  }
  if(G._expMoving) {
    if(G.board[z][r][c]!==null){toast('Cell is occupied');return;}
    const mv = G._expMoving;
    G.board[mv.fromZ][mv.fromR][mv.fromC] = null;
    G.board[z][r][c] = mv.card;
    mv.card._expMoved = true;
    G._expMoving = null;
    G.placing = false;
    clearPlaceHighlights();
    triggerRozsiPassive(mv.card, z); // Rozsi: +2 fate on move into zone
    toast('ALPINE Expeditionary moved!');
    playSfx('effect');
    renderGame();
    return;
  }
  if(!G.placing || G.selectedHandCard===null) return;
  const player = G.players[G.currentPlayer];
  const card = player.hand[G.selectedHandCard];
  if(!card) return;

  // Check validity again
  if(G.board[z][r][c]!==null){playSfx('blocked');toast('Cell is occupied');return;}
  if(isBlocked(z,r,c)){playSfx('blocked');toast('Cell is blocked');return;}
  // Enforce safe row ownership — P1 can only place on row 2+, P2 on row 0
  const cp = G.currentPlayer;
  if(r===0 && cp===0 && !(G._linaFreeIids && G._linaFreeIids.has(card.iid))){playSfx('blocked');toast('Cannot place on opponent\'s safe row');return;}
  if(r===2 && cp===1 && !(G._linaFreeIids && G._linaFreeIids.has(card.iid))){playSfx('blocked');toast('Cannot place on opponent\'s safe row');return;}
  if(r>=3 && !(G._linaFreeIids && G._linaFreeIids.has(card.iid)) && typeof isPlayableSafeSquare === 'function' && !isPlayableSafeSquare(z,r,c,cp)){
    playSfx('blocked');toast('Cannot place on an unavailable safe square');return;
  }
  // Enforce contested-only placement
  if(card.contestedOnly && r!==1){playSfx('blocked');toast(card.name+' can only be placed in contested rows');return;}

  const chingaBlockReason = getChingachlookPlacementBlockReason(card, z, G.currentPlayer);
  if(chingaBlockReason){
    playSfx('blocked');
    toast(chingaBlockReason);
    return;
  }

  // Supporter limit re-check (skip for Lina free-set cards)
  const isLinaFree = G._linaFreeIids && G._linaFreeIids.has(card.iid);
  if(!isLinaFree && card.type==='Supporter'){
    const maxSup = G.maxSupportsPerTurn + G.extraSupportsThisTurn;
    if(!G.majaEffectThisTurn && G.supportsPlacedThisTurn >= maxSup){
      toast('Supporter limit reached: '+maxSup+'/turn');
      G.placing=false;G.selectedHandCard=null;
      clearPlaceHighlights();renderHand();
      return;
    }
  }

  // Place the card
  const inst = newInstance(card);
  inst.owner = G.currentPlayer;
  inst.currentFate = getPlacedCardFate(card);
  consumePendingPlacementFlags(card, inst);
  G.board[z][r][c] = inst;
  applyRiveraBuffToPlacedCard(inst, inst.owner);
  triggerPlacementAnimation(inst, z, r, c);
  player.hand.splice(G.selectedHandCard, 1);

  // Anicka Konvicka (02) Starlit Path: ANY card placed in this zone gains 2 Fate (owner-independent? No, only for her controller)
  // Per card text: "Any card placed in this zone gains 2 Fate"
  G.board[z].forEach((row, r)=>row.forEach((cell, c)=>{
    if(cell && cell.id==='02' && cell.owner===G.currentPlayer && cell.iid!==inst.iid && !isFaceDownCard(cell)){
      modifyFate(inst,2,'permanent');
    }
  }));

  // Play card placement sound (rarity-based)
  playCardSound(card.id);
  const rarSfx = card.rarity==='star'?'starPlace':card.rarity==='square'?'squarePlace':card.rarity==='triangle'?'trianglePlace':'place';
  playSfx(rarSfx);
  // Tutorial event hooks
  if(typeof tutorialEvent==='function' && _tutorialActive){
    if(inst.type==='Supporter') tutorialEvent('placeSupporter');
    else tutorialEvent('placeCharacter');
  }
  // AI dialogue hooks (safe — triggerAIDialogue checks if AI game)
  if(typeof triggerAIDialogue==='function' && G.currentPlayer !== G.aiPlayer){
    if(inst.type==='Supporter') triggerAIDialogue('opponentPlacedSupporter');
    else triggerAIDialogue('opponentPlacedCharacter');
  } else if(typeof triggerAIDialogue==='function' && G.currentPlayer === G.aiPlayer){
    triggerAIDialogue('aiPlacedCard');
  }
  // Affiliation-specific placement layer
  if(inst.aff) playSfx('affPlace_'+inst.aff);
  // Count for supporter limit (but not Lina free-set)
  if(card.type==='Supporter' && !isLinaFree) G.supportsPlacedThisTurn++;
  // Clear Lina free flag after use
  if(isLinaFree && G._linaFreeIids) G._linaFreeIids.delete(card.iid);
  
  if(typeof playSfx === 'function') playSfx('cardSet');
  log(G.currentPlayer===0?'p1':'p2', `${player.name} placed ${card.name} in Zone ${z+1}`);

  G.placing = false;
  G.selectedHandCard = null;
  clearPlaceHighlights();

  if(typeof applyContinuousEffects === 'function') applyContinuousEffects();
  renderGame();

  requestAnimationFrame(() => resolveSetCardAfterPlacement(inst, z, r, c));
}

function isBlocked(z,r,c) {
  // Only Carolyn-type blocks prevent placement entirely
  return G.blockedCells.some(b=>b.z===z&&b.r===r&&b.c===c&&b.type==='carolyn');
}
function isBlockedForConsolidate(z,r,c) {
  // Both Carolyn and Zoe blocks prevent consolidation
  const cp = G.currentPlayer;
  return G.blockedCells.some(b=>b.z===z&&b.r===r&&b.c===c&&(b.type==='carolyn' || b.blockedPlayer === cp || typeof b.blockedPlayer !== 'number'));
}

function applyArtilleryLock(zone, sourceOwner) {
  const lockedPlayer = 1 - sourceOwner;
  G._artilleryLockedZone = zone;
  G._artilleryLockOwner = lockedPlayer;
  // nextPlayerTurn decrements at the start of the locked player's turn, so 2
  // means it remains active for that full upcoming turn and clears next time.
  G._artilleryLockTurnsLeft = 2;
  const zoneLabel = 'Zone ' + (zone + 1);
  toast(zoneLabel + ' locked for ' + G.players[lockedPlayer].name + "'s next turn.");
  log(sourceOwner===0?'p1':'p2', 'Artillery Distance locked ' + zoneLabel);
  if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
  updateTopBar();
}

function getUnusedChaparralAmbusherInZone(z, owner) {
  let found = null;
  G.board[z].forEach((row, r)=>row.forEach((cell, c)=>{
    if(found) return;
    if(cell && cell.id==='78' && cell.owner===owner && !cell._chaparralAmbushUsed && !isFaceDownCard(cell)) {
      found = {card:cell, z, r, c};
    }
  }));
  return found;
}

function countFriendlyRalphAdjacency(z, r, c, owner) {
  let count = 0;
  if(!G.board[z]) return 0;
  G.board[z].forEach((row, rr)=>{
    if(!row) return;
    row.forEach((cell, cc)=>{
      if(!cell || cell.id!=='24' || cell.owner!==owner || isFaceDownCard(cell)) return;
      const dr = Math.abs(rr-r), dc = Math.abs(cc-c);
      if(dr<=1 && dc<=1 && (dr+dc)>0) count++;
    });
  });
  return count;
}

function beginImmediateFreePlacement(player, card, message) {
  if(!card) return;
  if(!G._linaFreeIids) G._linaFreeIids = new Set();
  G._linaFreeIids.add(card.iid);
  renderGame();
  if(player !== G.currentPlayer) return;
  const idx = G.players[player].hand.findIndex(h=>h.iid===card.iid);
  if(idx === -1) return;
  G.selectedHandCard = idx;
  G.placing = true;
  clearPlaceHighlights();
  highlightValidCells(card);
  setHint(message || ('Place ' + card.name + ' for free.'));
}

async function resolveSetCardAfterPlacement(inst, z, r, c) {
  if(!inst || isFaceDownCard(inst)) return;
  if(Array.isArray(G.shieldWallZones) && G.shieldWallZones.includes(z)) inst.cantBeMoved = true;
  if(G.aiEnabled && G.currentPlayer===G.aiPlayer && typeof aiTriggerWhenSet === 'function') {
    await aiTriggerWhenSet(inst, z, r, c);
    return;
  }
  await triggerWhenSet(inst, z, r, c);
}

function flipFaceDownBoardCard(card, z, r, c) {
  if(!card || !isFaceDownCard(card)) return 0;
  card.faceDown = false;
  if(window.FateV2CardMotionFx && typeof window.FateV2CardMotionFx.flipBoardCard === 'function'){
    window.FateV2CardMotionFx.flipBoardCard(card, z, r, c);
  }
  const placementDelay = triggerPlacementAnimation(card, z, r, c);
  renderGame();
  requestAnimationFrame(() => resolveSetCardAfterPlacement(card, z, r, c));
  return placementDelay;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  CONSOLIDATION (tribute supporters → summon character)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function canUseAsConsolidationTribute(card, owner) {
  if(!card) return false;
  if(card.owner !== owner) return false;
  if(card.noConsolidate) return false;
  // ALPINE Infantry is immune to effects and can never be spent as tribute,
  // including older instances that may not have noConsolidate stamped yet.
  if(card.id === '76') return false;
  return true;
}

function initiateConsolidate() {
  if(G.selectedHandCard===null){toast('Select a character card from your hand first');return;}
  const card = G.players[G.currentPlayer].hand[G.selectedHandCard];
  if(!card||card.type==='Supporter'){toast('Select a character card (not a Supporter)');return;}

  // Lina free-set: skip consolidation entirely, just place directly
  const isLinaFree = G._linaFreeIids && G._linaFreeIids.has(card.iid);
  if(isLinaFree){
    closeModal();
    G.placing = true;
    highlightValidCells(card);
    setHint('Place '+card.name+' for free (Lina\'s effect)');
    return;
  }

  if(false && card.id==='35'){
    // Variable cost — ask how many
    showModal('Variable Cost',`${card.name} has a variable cost. How many Supporters do you want to tribute?`,
      [{label:'1',action:()=>{closeModal();doConsolidate(card,1);}},
       {label:'2',action:()=>{closeModal();doConsolidate(card,2);}},
       {label:'3',action:()=>{closeModal();doConsolidate(card,3);}},
       {label:'4',action:()=>{closeModal();doConsolidate(card,4);}},
       {label:'5',action:()=>{closeModal();doConsolidate(card,5);}}]);
    return;
  }
  let actualCost = typeof getDisplayedCardCost === 'function' ? getDisplayedCardCost(card) : card.cost;
  // If cost is 0 after discounts, skip consolidation — place directly
  if(actualCost <= 0) {
    closeModal();
    G.placing = true;
    highlightValidCells(card);
    setHint('Place ' + card.name + ' for free (cost reduced to 0)');
    return;
  }
  doConsolidate(card, actualCost);
}

function doConsolidate(card, cost) {
  const cp = G.currentPlayer;
  const opp = 1-cp;

  // Colombo Thug (53): opponent's consolidations in a zone with a Thug
  // can only use supporters from THAT zone (per-Thug zone restriction)
  const colomboRestrictionZones = new Set();
  forEachBoardCard((c,z,r,col)=>{
    if(c.id==='53' && c.owner===opp && !isSupporterAuraSuppressed(c)) colomboRestrictionZones.add(z);
  });

  // Find available supporters on board owned by current player
  const supports = [];
  G.board.forEach((zone,z)=>zone.forEach((row,r)=>{
    if(!row) return;
    // Artillery Distance (50): skip supporters in locked zone
    if(typeof G._artilleryLockedZone==='number' && G._artilleryLockedZone===z && G._artilleryLockOwner===cp && G._artilleryLockTurnsLeft>0) return;
    row.forEach((cell,c)=>{
      if(cell && cell.type==='Supporter' && canUseAsConsolidationTribute(cell, cp)) {
        const reinforcement = getSupportReinforcementValue(cell) + countFriendlyRalphAdjacency(z, r, c, cp);
        supports.push({card:cell,z,r,c,zoneIdx:z,reinforcement});
      }
    });
  }));

  // Check Irvine Businessman: characters in his zone count as 1 reinforcement
  let irvineZones = [];
  G.board.forEach((zone,z)=>zone.forEach(row=>{
    if(!row) return;
    row.forEach(cell=>{
      if(cell&&cell.id==='49'&&cell.owner===cp&&!isSupporterAuraSuppressed(cell)) irvineZones.push(z);
    });
  }));

  const charSupports = [];
  if(irvineZones.length>0){
    G.board.forEach((zone,z)=>{
      if(!irvineZones.includes(z)) return;
      zone.forEach((row,r)=>{
        if(!row) return;
        row.forEach((cell,c)=>{
          if(cell&&cell.type!=='Supporter'&&canUseAsConsolidationTribute(cell, cp)){
            charSupports.push({card:cell,z,r,c,zoneIdx:z,isChar:true,reinforcement:1});
          }
        });
      });
    });
  }

  const allPossible = [...supports, ...charSupports];
  const totalReinforcement = allPossible.reduce((s,t)=>s+(t.reinforcement||1),0);

  if(totalReinforcement < cost) {
    toast(`Need ${cost} reinforcement on the field (have ${totalReinforcement})`); return;
  }

  // ON-BOARD CONSOLIDATION FLOW
  // Highlight tributeable cards on the board. Player clicks them to select/deselect.
  // Once enough reinforcement is selected, highlight those cells for placement.
  closeModal();
  G._consolidating = {
    card, cost, allPossible, chosenIdxs: [], phase: 'select_tributes',
    colomboRestrictionZones // zones where Colombo Thug restricts cross-zone tribute usage
  };

  // Add CSS class to tributeable cards
  renderGame();
  highlightTributeCards();
  setHint(`Select supporters to consolidate ${card.name} (0/${cost} reinforcement).`);
}

function highlightTributeCards() {
  const con = G._consolidating;
  if(!con) return;
  con.allPossible.forEach((s,i)=>{
    const el = document.querySelector(`[data-z="${s.z}"][data-r="${s.r}"][data-c="${s.c}"] .bc`);
    if(el){
      if(con.chosenIdxs.includes(i)){
        el.classList.add('tribute-selected');
        el.classList.remove('tribute-available');
      } else {
        el.classList.add('tribute-available');
        el.classList.remove('tribute-selected');
      }
    }
  });
}

function handleConsolidateClick(z,r,c) {
  const con = G._consolidating;
  if(!con) return false;

  if(con.phase==='select_tributes'){
    // Check if this cell has a tributeable card
    const idx = con.allPossible.findIndex(s=>s.z===z&&s.r===r&&s.c===c);
    if(idx===-1) return false;

    // Toggle selection
    if(con.chosenIdxs.includes(idx)){
      con.chosenIdxs = con.chosenIdxs.filter(x=>x!==idx);
    } else {
      con.chosenIdxs.push(idx);
    }

    const running = con.chosenIdxs.reduce((s,i)=>s+(con.allPossible[i].reinforcement||1),0);
    setHint(`Select tributes for ${con.card.name} (${running}/${con.cost} reinforcement). Click supporters on the board.`);

    // Update visuals
    renderGame();
    highlightTributeCards();

    // If we have enough reinforcement (exact or over), move to placement phase
    if(running >= con.cost){
      if(running > con.cost){
        if(G._onlineRoomCode){
          toast(`Over-reinforcement: ${running-con.cost} reinforcement will be wasted.`);
          con.phase='select_placement';
          con.chosenIdxs.forEach(i=>{
            const s = con.allPossible[i];
            const cellEl = document.querySelector(`[data-z="${s.z}"][data-r="${s.r}"][data-c="${s.c}"]`);
            if(cellEl) cellEl.classList.add('placeable');
          });
          setHint(`Ready: click a highlighted cell to place ${con.card.name}.`);
          return true;
        }
        // Over-reinforcement: show warning
        showModal('Over-Reinforcement', 
          `<p>You selected <strong>${running}</strong> reinforcement for a cost of <strong>${con.cost}</strong>. The extra ${running-con.cost} reinforcement will be wasted.</p>
          <p style="color:var(--dim);font-style:italic;margin-top:.5rem;">All selected supporters will still be expended.</p>`,
          [{label:'Proceed', pri:true, action:()=>{
            closeModal();
            con.phase='select_placement';
            con.chosenIdxs.forEach(i=>{
              const s = con.allPossible[i];
              const cellEl = document.querySelector(`[data-z="${s.z}"][data-r="${s.r}"][data-c="${s.c}"]`);
              if(cellEl) cellEl.classList.add('placeable');
            });
            setHint(`Ready: click a highlighted cell to place ${con.card.name}.`);
          }},{label:'Reselect', action:()=>{
            closeModal();
            // Deselect the last picked tribute
            con.chosenIdxs.pop();
            renderGame(); highlightTributeCards();
            const r2 = con.chosenIdxs.reduce((s,i)=>s+(con.allPossible[i].reinforcement||1),0);
            setHint(`Select tributes for ${con.card.name} (${r2}/${con.cost} reinforcement).`);
          }}]);
        return true;
      }
      con.phase='select_placement';
      // Highlight the chosen tribute cells as placement options
      con.chosenIdxs.forEach(i=>{
        const s = con.allPossible[i];
        const cellEl = document.querySelector(`[data-z="${s.z}"][data-r="${s.r}"][data-c="${s.c}"]`);
        if(cellEl) cellEl.classList.add('placeable');
      });
      setHint(`Ready: click a highlighted cell to place ${con.card.name}.`);
    }
    return true;
  }

  if(con.phase==='select_placement'){
    // Check if this is one of the chosen tribute cells
    const placementIdx = con.chosenIdxs.findIndex(i=>{
      const s=con.allPossible[i];
      return s.z===z&&s.r===r&&s.c===c;
    });
    if(placementIdx===-1) return false;
    if(isBlockedForConsolidate(z,r,c)){
      toast('No consolidation on this square.');
      return true;
    }

    // Colombo Thug check: if placing into a Colombo-restricted zone,
    // all tributes must be from that zone
    const targetZ = z;
    if(con.colomboRestrictionZones && con.colomboRestrictionZones.has(targetZ)){
      const tributes = con.chosenIdxs.map(i=>con.allPossible[i]);
      const crossZone = tributes.some(t=>t.z!==targetZ);
      if(crossZone){
        toast('Colombo Thug restricts consolidation — all tributes must be from this zone!');
        return true;
      }
    }

    // Execute consolidation
    const tributes = con.chosenIdxs.map(i=>con.allPossible[i]);
    const removedIids = new Set(tributes.map(t=>t.card?.iid).filter(Boolean));
    const chingaBlockReason = getChingachlookPlacementBlockReason(con.card, z, G.currentPlayer, removedIids);
    if(chingaBlockReason){
      toast(chingaBlockReason);
      return true;
    }
    const targetTributeIdx = placementIdx;
    G._consolidating = null;
    clearPlaceHighlights();
    finalizeConsolidate(con.card, tributes, targetTributeIdx);
    setHint('Select a card to play');
    return true;
  }
  return false;
}

function cancelConsolidation() {
  if(!G._consolidating) return;
  G._consolidating = null;
  G.selectedHandCard = null;
  clearPlaceHighlights();
  setHint('Select a card to play');
  renderGame();
  toast('Consolidation cancelled');
}

function finalizeConsolidate(card, tributes, targetIdx) {
  const cp = G.currentPlayer;
  const target = tributes[targetIdx];
  const targetZ = target.z, targetR = target.r, targetC = target.c;
  const chaparralSource = getUnusedChaparralAmbusherInZone(targetZ, cp);

  function finishConsolidate(useFaceDown) {
    const affectedZones = [...new Set(tributes.map(t=>t.z))];
    affectedZones.forEach(tz=>{
      G.board[tz].forEach((row, mr)=>{
        if(!row) return;
        row.forEach((cell, mc)=>{
          if(cell&&cell.id==='36'&&cell.owner!==cp){
            log('sys','Deterrance activated! Zone '+(tz+1)+' Fate reduced by 2.');
            G.fateModifiers['deterrance_z'+tz] = (G.fateModifiers['deterrance_z'+tz]||0) - 2;
            toast('Deterrance activated: Zone '+(tz+1)+' loses 2 Fate.');
            if(typeof showEffectActivationGlow === 'function') showEffectActivationGlow(tz, mr, mc, cell);
            if(typeof playSfx === 'function') playSfx('debuff');
          }
        });
      });
    });

    tributes.forEach(t=>{
      if(t.card.id==='09' && t.card.usesLeft>0) t.card.usesLeft--;
    });

    let bonusFate = 0;
    if(window.FateV2CardMotionFx && typeof window.FateV2CardMotionFx.crashTributes === 'function'){
      window.FateV2CardMotionFx.crashTributes(tributes, target);
    }
    tributes.forEach(t=>{
      if(t.card.id==='47') bonusFate += 3;
      discardBoardCard(t.card, t.z, t.r, t.c);
    });

    const inst = newInstance(card);
    inst.owner = cp;
    inst.currentFate = getPlacedCardFate(card, {bonusFate, tributeCount: tributes.length});
    inst.faceDown = !!useFaceDown;
    if(card._wciBonus) toast('West Caribbea Infantry bonus: -1 cost, +2 Fate!');
    consumePendingPlacementFlags(card, inst);
    G.board[targetZ][targetR][targetC] = inst;
    if(typeof applyRiveraBuffToPlacedCard === 'function') applyRiveraBuffToPlacedCard(inst, inst.owner);
    const placementDelay = triggerPlacementAnimation(inst, targetZ, targetR, targetC);
    if(useFaceDown && chaparralSource?.card) chaparralSource.card._chaparralAmbushUsed = true;

    if(typeof showConsolidationCinematic === 'function') {
      G._cinematicUiLockUntil = Math.max(G._cinematicUiLockUntil || 0, Date.now() + Math.max(0, placementDelay || 0) + 90 + 2350);
      setTimeout(function(){ showConsolidationCinematic(inst, {playVoice:true, playSfx:true}); }, Math.max(0, placementDelay || 0) + 90);
    }

    log(cp===0?'p1':'p2',
      `${G.players[cp].name} consolidated ${card.name} into Zone ${targetZ+1}${useFaceDown ? ' face down' : ''}`);

    G.players[cp].hand = G.players[cp].hand.filter(c => c !== card);
    G.selectedHandCard = null;

    if(typeof applyContinuousEffects === 'function') applyContinuousEffects();
    renderGame();
    // Defer consolidation visual to after renderGame's rAF completes so it isn't wiped by the DOM rebuild
    requestAnimationFrame(() => { requestAnimationFrame(() => showConsolidateVisual(targetZ,targetR,targetC)); });
    requestAnimationFrame(() => resolveSetCardAfterPlacement(inst, targetZ, targetR, targetC));
  }

  if(chaparralSource){
    showModal(
      'Chaparral Hoplite',
      `<p style="font-size:.88rem;line-height:1.6;color:var(--text);">Scrappy Ambushers can hide this consolidated card face down in Zone ${targetZ+1}.</p>`,
      [
        {label:'Normal Set', action:()=>{closeModal();finishConsolidate(false);}},
        {label:'Set Face Down', pri:true, action:()=>{closeModal();finishConsolidate(true);}}
      ]
    );
    return;
  }

  finishConsolidate(false);
}

function checkWCInfantryBonus(placedCard, zone) {
  // West Caribbea Infantry (33): next char added to hand costs 1 less, gains 2 fate
  // Track via flag if needed — simplified here
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  CARD EFFECTS: WHEN SET
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function triggerWhenSet(inst, z, r, c) {
  if(!inst || isFaceDownCard(inst)) return;
  const cp = G.currentPlayer;
  const opp = 1-cp;
  const id = inst.id;
  // Rivera (51): active declared affiliation buff applies to cards as they are set.
  applyRiveraBuffToPlacedCard(inst, inst.owner);

  // Suppress check: only if current player is the suppression target
  if(G.oppSuppressedNextTurn && G.suppressTarget===cp && inst.type==='Supporter') {
    showBlockedAnimation('Effect SUPPRESSED - Semper Fidelis');
    return;
  }

  // Fire effects immediately on card set (no modal prompt)
  const _hasWhenSet = WHEN_SET_IDS.has(id);
  const initiatorIds = ['03','04','06','07','08','13','17','21','22','27','29','30','39','43','45','48','51','54','66','bh25'];
  const isInitiatorWithEffect = inst.type==='Initiator' && initiatorIds.includes(id) && !inst.effectUsedInitial;
  
  // Initiators fire their character effect
  if(isInitiatorWithEffect) {
    G.selectedBoardCard = {card:inst,z,r,c};
    triggerCharacterEffect(inst,z,r,c,{fromSet:true});
  }
  // When-set effects fire automatically
  if(_hasWhenSet) {
    await runWhenSetEffect(inst,z,r,c);
  }
}

// Actual effect execution (separated so prompt can wrap it)
async function runWhenSetEffect(inst, z, r, c) {
  if(!inst || isFaceDownCard(inst)) return;
  const cp = G.currentPlayer;
  const opp = 1-cp;
  const id = inst.id;
  // Mark supporter as having used its when-set effect (for Breakfast Busser)
  if(inst.type==='Supporter') inst.whenSetActivated = true;

  // Reaction check: opponent Supporter effects that target the opponent can be negated
  // by Lydia (56) or Havano Citizen (79)
  // Lydia can react to ANY supporter when-set effect (not just select few)
  if(inst.type==='Supporter' && WHEN_SET_IDS.has(inst.id) && inst.id!=='56' && !G._suppressEffectPrompt){
    const proceed = await checkReactions('supporter_effect', {
      card:inst,
      z,
      r,
      c,
      sourceOwner:cp,
      affectedOwners:getSupporterEffectAffectedOwners(inst, z, r, c, cp, opp)
    });
    if(proceed) await _executeWhenSetSwitch(inst, z, r, c, cp, opp, id);
    return;
  }

  await _executeWhenSetSwitch(inst, z, r, c, cp, opp, id);
}

async function _executeWhenSetSwitch(inst, z, r, c, cp, opp, id) {
  switch(id) {
    case '02': // Anicka Konvicka: create extra safe row in this zone
      {
        const anickaIid = inst && inst.iid;
        function anickaStillOnBoard(){
          let found = false;
          if(typeof forEachBoardCard === 'function') forEachBoardCard(function(cell){ if(cell && cell.iid === anickaIid) found = true; });
          return found;
        }
        function restoreAnickaIfNeeded(){
          if(!inst || anickaStillOnBoard()) return;
          if(!G.board[z]) G.board[z] = [];
          if(!G.board[z][r]) G.board[z][r] = Array(3).fill(null);
          if(!G.board[z][r][c]) G.board[z][r][c] = inst;
        }
        if(typeof addFullExtraSafeRowForPlayer === 'function') {
          addFullExtraSafeRowForPlayer(z, cp, 'Starlit Path', {landscape:false});
          restoreAnickaIfNeeded();
          toast('Extra safe row created in Zone '+(z+1)+'!');
          log(cp===0?'p1':'p2','Starlit Path: extra safe row in Zone '+(z+1));
        } else {
          if(!G.extraRows) G.extraRows=[0,0,0];
          if(!G.extraRowOwners) G.extraRowOwners=[[],[],[]];
          if(!G.extraRowFullOwners) G.extraRowFullOwners=[null,null,null];
          const nextRow = 3 + (Number(G.extraRows[z]) || 0);
          G.extraRows[z]++;
          if(!G.extraRowOwners[z]) G.extraRowOwners[z] = [];
          G.extraRowOwners[z][nextRow - 3] = cp;
          G.extraRowFullOwners[z] = cp;
          if(!G.board[z][nextRow]) G.board[z][nextRow] = Array(3).fill(null);
          restoreAnickaIfNeeded();
          toast('Extra safe row created in Zone '+(z+1)+'!');
          log(cp===0?'p1':'p2','Starlit Path: extra safe row in Zone '+(z+1));
        }
        renderGame();
        // Guard against late row rebuilds/extra-row layout changes visually dropping Anicka.
        setTimeout(function(){
          restoreAnickaIfNeeded();
          const rendered = document.querySelector('#board .bc[data-iid="'+String(anickaIid)+'"]');
          if(!rendered && anickaStillOnBoard()) renderGame();
        }, 80);
      } break;
    case '12': // Makenna: when set, select 2 cards in zone to make immune
      {
        // Delay slightly so the card is rendered first
        setTimeout(()=>{
          pickMultipleInZone(z,2,'Makenna: Select up to 2 friendly cards to make immune:',(targets)=>{
            targets.forEach(t=>{ t.card.immuneFlag=true; });
            toast('Selected cards are now immune');
            renderGame();
          }, c=>c.owner===cp);
        },100);
      } break;
    case '05': // 17th British Regiment: select card in zone, +2 Fate
      pickCardInZone(z,'Select a card to gain 2 Fate:',(tgt,tz,tr,tc)=>{
        modifyFate(tgt,2,'permanent');
        log(cp===0?'p1':'p2',`Liberators of Rwanda: ${tgt.name} gains 2 Fate`);
        renderGame();
      }); break;
    case '26': { // UCPD: reveal opponent hand — mark cards as revealed persistently
      const oppHand = G.players[opp].hand;
      if(!oppHand.length){toast('Opponent has no cards in hand');break;}
      // Mark all current opponent hand cards as revealed
      if(!G._revealedCards) G._revealedCards = {};
      oppHand.forEach(c => { G._revealedCards[c.iid] = true; });
      // Show the reveal window
      if(typeof showRevealedHandWindow === 'function') showRevealedHandWindow(opp);
      toast('All cards in ' + G.players[opp].name + "'s hand are now revealed!");
      renderOppHand();
      break;
    }
    case '32': // Temecula Resident: draw 1
      await drawCard(cp,1);
      toast('Drew 1 card');
      renderHand(); break;
    case '42': // West German Soldier: draw 2, discard 2 (FORCED)
      await drawCard(cp,2);
      toast('Drew 2 cards. You must discard 2.');
      renderHand();
      {
        const hand42 = G.players[cp].hand;
        const discardCount = Math.min(2, hand42.length);
        if(discardCount <= 0) break;
        pickCardsVisual(hand42, {
          title: 'West German Soldier: Discard '+discardCount+' card(s)',
          subtitle: 'You must discard '+discardCount+' card(s) from your hand',
          maxCount: discardCount,
          minCount: discardCount,
          confirmLabel: 'Discard'
        }, (chosen)=>{
          chosen.forEach(c=>{
            G.players[cp].hand=G.players[cp].hand.filter(h=>h.iid!==c.iid);
            G.players[cp].discard.push(c);
          });
          renderHand();
        });
      } break;
    case '31': // Hemorrhaging Wound: card in zone loses 2 Fate
      pickCardInZone(z,'Select a card to lose 2 Fate:',(tgt)=>{
        const before = tgt.currentFate || tgt.fate || 0;
        const changed = setCardFateValue(tgt, before - 2, cp);
        if(!changed && before > 0){
          showBlockedAnimation('Shield Wall prevents Fate loss');
          return;
        }
        log(cp===0?'p1':'p2',`Hemorrhaging Wound: ${tgt.name} loses 2 Fate`);
        renderGame();
      }); break;
    case '16': // MINAE Death Squad: discard opponent supporter in zone
      pickCardInZone(z,'Select an opponent Supporter to discard:',(tgt,tz,tr,tc)=>{
        if(tgt.owner!==opp||tgt.type!=='Supporter'){toast('Must select opponent Supporter');return;}
        discardBoardCard(tgt,tz,tr,tc);
        log(cp===0?'p1':'p2',`MINAE Death Squad: discarded ${tgt.name}`);
        renderGame();
      },c=>c.owner===opp&&c.type==='Supporter'); break;
    case '18': // 1st US Marines: suppress opponent's supporter effects next turn
      G.oppSuppressedNextTurn = true;
      G.suppressTarget = opp;
      toast('Opponent supporter effects suppressed next turn!');
      updateTopBar();
      break;
    case '33': // West Caribbea Infantry: next character added to hand costs 1 less, gains 2 fate
      G._westCaribNext = { owner: cp };
      toast('The next character added to your hand gains 2 Fate and costs 1 less Reinforcement');
      if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
      break;
    case '34': // Rozsi Szocs: passive coordinator - no when-set trigger needed
      break;
    case '44': // Soviet Grenadiers: continuous — handled in applyContinuousEffects
      break;
    case '50': // Berkeley CS Major: lock any zone for opponent's next turn
      showModal('Artillery Distance', "<p>Select a zone. On your opponent's next turn, they cannot set, consolidate, or activate effects there.</p>", [
        { label:'Zone 1', action:()=>{ closeModal(); applyArtilleryLock(0, cp); } },
        { label:'Zone 2', action:()=>{ closeModal(); applyArtilleryLock(1, cp); } },
        { label:'Zone 3', action:()=>{ closeModal(); applyArtilleryLock(2, cp); } }
      ]);
      break;
    case '58': // Crossroads Worker: add supporter from discard
      if(G.players[cp].discard.filter(c=>c.type==='Supporter').length===0){
        toast('No supporters in discard');break;
      }
      pickFromDiscard(cp,'Supporter','Add a Supporter from discard to hand:',(c)=>{
        if(typeof addCardToHand==='function') addCardToHand(cp, c);
        else G.players[cp].hand.push(c);
        G.players[cp].discard=G.players[cp].discard.filter(d=>d.iid!==c.iid);
        renderHand();
        toast('Added '+c.name+' to hand');
      }); break;
    case '60': // IB Student: search deck for supporter
      searchDeckForType(cp,'Supporter','Search deck for a Supporter:'); break;
    case '75': // Ledger-keepers: copy a supporter effect
      pickBoardSupporterEffect(cp,z); break;
    case '76': // ALPINE Infantry: gains 4 Fate, immune, can't consolidate
      inst.currentFate = 5; // 1 base + 4
      inst.immuneFlag = true;
      inst.noBonus = true;
      inst.noConsolidate = true;
      renderGame(); break;
    case '01': // Felicyta Janowicz: no special when-set (passive aura handled in getEffectiveFate)
      break;
    case '46': // Phil: Monarchist Manifesto — Dauntless, gains 1 Fate per draw phase
      inst._philSetTurn = G.turn; break;
    case '57': // Jeremiah Jones: no special when-set (aura potency boost handled in getEffectiveFate)
      break;
    case '77': { // Duncan Heyward: when set, declare affiliation; then passive +3 to that aff
      showAffiliationPickerVisual((aff)=>{
        inst._declaredAff = aff;
        // Show affiliation icon flash on Duncan
        if(typeof showAffChangeOverlay==='function') showAffChangeOverlay(inst, aff);
        toast('Duncan Heyward declared '+AFF_LABEL[aff]+'! All '+AFF_LABEL[aff]+' cards in zone gain 3 Fate.');
        log(cp===0?'p1':'p2','Duncan Heyward declared '+AFF_LABEL[aff]);
        renderGame();
      });
      break;
    }
    case '61': { // Maria Song: pick opponent card, discard all other copies from opp hand/deck
      const oppBoardCards = [];
      G.board.forEach((zone,zi)=>zone.forEach((row,ri)=>row.forEach((cell,ci)=>{
        if(cell && cell.owner===opp) oppBoardCards.push({card:cell,z:zi,r:ri,c:ci});
      })));
      if(oppBoardCards.length===0){toast('No opponent cards on the field');break;}
      pickCardFromAnyZone('Precise Shot: select opponent card. Other copies are discarded from hand and deck.',(target,tz,tr,tc)=>{
        if(!target) return;
        let discarded = 0;
        const oppHand = G.players[opp].hand;
        const stillInHand = [];
        oppHand.forEach(c=>{
          if(c.id===target.id){ G.players[opp].discard.push(c); discarded++; }
          else stillInHand.push(c);
        });
        G.players[opp].hand = stillInHand;
        const oppDeck = G.players[opp].deck;
        const stillInDeck = [];
        oppDeck.forEach(c=>{
          if(c.id===target.id){ G.players[opp].discard.push(c); discarded++; }
          else stillInDeck.push(c);
        });
        G.players[opp].deck = stillInDeck;
        toast(`${discarded} ${target.name} discarded from opponent`);
        if(typeof showMariaDiscardBadge === 'function') showMariaDiscardBadge(target, discarded, tz, tr, tc);
        log(cp===0?'p1':'p2',`Maria Song discarded ${discarded} ${target.name}`);
        renderGame();
      }, cell=>cell && cell.owner===opp);
      break;
    }
    case '62': { // Berkeley Homeless: move to opp's zone, can't be consolidated
      inst.noConsolidate = true;
      inst.berkeleyHomeless = true; // flag for discard restriction
      // Find open squares only in the opponent's safe rows
      const options = [];
      for(let zi=0;zi<3;zi++){
        G.board[zi].forEach((row,ri)=>row.forEach((cell,ci)=>{
          const opponentSafeRow = cp===0 ? 0 : 2;
          if(ri===opponentSafeRow && !cell && !G.blockedCells.some(b=>b.z===zi&&b.r===ri&&b.c===ci)){
            options.push({z:zi,r:ri,c:ci});
          }
        }));
      }
      if(options.length===0){toast('No valid open squares');break;}
      // Highlight + require click
      toast('Click any open square');
      G._berkeleyMoving = {fromZ:z, fromR:r, fromC:c, options, inst};
      options.forEach(opt=>{
        const el = document.querySelector(`[data-z="${opt.z}"][data-r="${opt.r}"][data-c="${opt.c}"]`);
        if(el) el.classList.add('placeable','move-target');
      });
      break;
    }
    case '64': { // Cook Islands Duelist: zone picker for adjacent/diagonal target
      const adj = getAdjacentAndDiagonalCards(z,r,c).filter(a=>a.card.type!=='Dauntless');
      if(adj.length===0){toast('No eligible adjacent cards');break;}
      const validIds = new Set(adj.map(a=>a.card.iid));
      showZonePicker(z, 'Blade Dance: select an adjacent or diagonal non-Dauntless card.', adj, 1, G.currentPlayer, (chosen)=>{
        if(!chosen.length) return;
        const target = chosen[0].card;
        if(target.immuneFlag){showBlockedAnimation(target.name+' is IMMUNE');return;}
        const newFate = inst.currentFate;
        const before = target.currentFate || target.fate || 0;
        const changed = setCardFateValue(target, newFate, cp);
        if(!changed && newFate < before){
          showBlockedAnimation('Shield Wall prevents Fate loss');
          return;
        }
        toast(`${target.name}'s Fate is now ${newFate}`);
        log(cp===0?'p1':'p2',`Blade Dance set ${target.name}'s Fate to ${newFate}`);
        renderGame();
      }, cell=>cell && validIds.has(cell.iid));
      break;
    }
    case '66': { // Mark Menz: declare affiliation via icon picker, change cards in zone
      showAffiliationPickerVisual((aff)=>{
        let changed = 0;
        const changedCards = [];
        G.board[z].forEach(row=>row.forEach(cell=>{
          if(cell && cell.owner===cp && cell.iid!==inst.iid && !cell.immuneFlag && cell.aff!==aff){
            cell.aff = aff;
            // Mark Menz only: persist a semi-transparent affiliation overlay on changed cards.
            cell._affChanged = aff;
            cell._affChangedAtTurn = G.turn;
            cell._lastAffEffectSource = inst.iid;
            cell._affChangedBy = 'mark_menz';
            changed++;
            changedCards.push(cell);
          }
        }));
        if(changed>0){
          modifyFate(inst, changed, 'permanent');
          toast(changed+' cards changed to '+(AFF_LABEL[aff]||aff)+'. +'+changed+' Fate!');
        } else {
          toast('No cards changed');
        }
        log(cp===0?'p1':'p2','Mark Menz declared '+(AFF_LABEL[aff]||aff)+', changed '+changed+' cards');
        inst.effectUsedInitial = true;
        renderGame();
        // Add overlays AFTER renderGame rebuilds the DOM
        requestAnimationFrame(function(){
          changedCards.forEach(function(card){
            if(typeof showAffChangeOverlay==='function') showAffChangeOverlay(card, aff);
          });
        });
      });
      break;
    }
        case '68': { // Great Oak High Schooler: search deck for a Coordinator (non-star)
      const matches = G.players[cp].deck.filter(c=>c.type==='Coordinator' && c.rarity!=='star');
      pickCardsVisual(matches,{title:'Home of the Wolfpack',subtitle:'Add a Coordinator (non-Star) to your hand',maxCount:1,confirmLabel:'Add to Hand'},(picked)=>{
        if(picked.length===0) return;
        const chosen = picked[0];
        if(typeof addCardToHand==='function') addCardToHand(cp, chosen);
        else G.players[cp].hand.push(chosen);
        G.players[cp].deck = G.players[cp].deck.filter(d=>d.iid!==chosen.iid);
        shuffleDeck(cp);
        if(typeof playSfx === 'function') playSfx('searchFound');
        renderGame();
        toast(`Added ${chosen.name} to hand`);
      });
      break;
    }
    case '69': { // Breakfast Republic Busser: move any friendly supporter to this zone and re-activate
      const friendlySupporters = [];
      G.board.forEach((zone,zi)=>zone.forEach((row,ri)=>row.forEach((cell,ci)=>{
        if(cell && cell.owner===cp && cell.type==='Supporter' && cell.iid!==inst.iid){
          friendlySupporters.push({card:cell,z:zi,r:ri,c:ci});
        }
      })));
      if(friendlySupporters.length===0){toast('No friendly Supporters to move');break;}
      pickCardFromAnyZone('Corner! Behind!: select any friendly Supporter to move into this zone and re-activate.',(target,srcZ,srcR,srcC)=>{
        if(!target) return;
        const src = friendlySupporters.find(x=>x.card.iid===target.iid);
        if(!src){toast('Select a friendly Supporter');return;}
        const ownerSafeRow = cp === 0 ? 2 : 0;
        const allowedRows = new Set([1, ownerSafeRow]);
        const options = [];
        for(let rr=0;rr<G.board[z].length;rr++){
          if(!allowedRows.has(rr)) continue;
          const rowCap = typeof getBoardRowCapacity === 'function' ? getBoardRowCapacity(z, rr) : 3;
          for(let cc=0;cc<rowCap;cc++){
            if(rr>=3 && typeof isPlayableSafeSquare === 'function' && !isPlayableSafeSquare(z,rr,cc,cp)) continue;
            if(!G.board[z][rr][cc] && !G.blockedCells.some(b=>b.z===z&&b.r===rr&&b.c===cc&&b.type==='carolyn') && !(rr===r&&cc===c)){
              options.push({z,r:rr,c:cc});
            }
          }
        }
        if(!options.length){ toast('No open contested or safe square in this zone'); renderGame(); return; }
        G._busserMoving = { card: target, src, options, zone: z, player: cp };
        G.placing = true;
        clearPlaceHighlights();
        renderGame();
        options.forEach(o=>{
          const el = document.querySelector(`[data-z="${o.z}"][data-r="${o.r}"][data-c="${o.c}"]`);
          if(el) el.classList.add('placeable');
        });
        [...new Set(options.map(o=>o.z))].forEach(zi=>{
          const zoneEl = document.querySelector(`.zone[data-zone="${zi}"], .zone[data-z="${zi}"]`) || document.querySelectorAll('#board .zone, .board .zone')[zi];
          if(zoneEl) zoneEl.classList.add('busser-zone-target');
        });
        toast('Choose the exact square for Breakfast Republic Busser');
        setHint('Busser: choose an open highlighted contested or friendly safe square.');
      }, cell=>cell && cell.owner===cp && cell.type==='Supporter' && cell.iid!==inst.iid);
      break;
    }
    case '71': { // Fort Calvin Watcher: reveal next 3 opp draw-phase cards, send characters to bottom
      // Flag: next 3 draws by opponent during draw phase are revealed
      if(!G._fortCalvinActive) G._fortCalvinActive = [];
      G._fortCalvinActive.push({owner:cp, remaining:3});
      toast('Fort Calvin Watcher active — next 3 opponent draws will be revealed!');
      break;
    }
    case '72': { // Robo en la Noche: steal random card from opponent's hand
      const oppHand = G.players[opp].hand;
      if(oppHand.length===0){toast('Opponent has no cards');break;}
      const rng = (typeof G._onlineRng === 'function') ? G._onlineRng : Math.random;
      const idx = Math.floor(rng()*oppHand.length);
      const stolen = oppHand.splice(idx,1)[0];
      stolen._stolenByRobo = true; // flag: returns to opp deck when discarded
      stolen._roboOrigOwner = opp;
      if(typeof addCardToHand==='function') addCardToHand(cp, stolen);
      else G.players[cp].hand.push(stolen);
      toast(`Stole ${stolen.name} from opponent's hand!`);
      log(cp===0?'p1':'p2',`Robo en la Noche stole ${stolen.name}`);
      playSfx('effect');
      renderHand();
      break;
    }
    case '73': { // ALPINE Expeditionary: discard Initiators and Improvisors, gain their Fate
      let totalFate = 0;
      const toDiscard = [];
      G.board[z].forEach((row,ri)=>row.forEach((cell,ci)=>{
        if(cell && cell.owner===cp && (cell.type==='Initiator' || cell.type==='Improvisor') && cell.iid!==inst.iid){
          toDiscard.push({card:cell,r:ri,c:ci});
          totalFate += (cell.currentFate||cell.fate);
        }
      }));
      toDiscard.forEach(({card:dc,r:dr,c:dc2})=>{
        G.board[z][dr][dc2] = null;
        G.players[cp].discard.push(dc);
      });
      if(totalFate>0){
        modifyFate(inst, totalFate, 'permanent');
        toast(`Discarded ${toDiscard.length} characters, gained ${totalFate} Fate!`);
      } else {
        toast('No characters to discard');
      }
      inst._canMoveOncePerTurn = true;
      renderGame();
      break;
    }
    case '80': { // Apparition of Berkeley: discard a character you control in this zone, draw 2
      const myChars = [];
      G.board[z].forEach((row,ri)=>row.forEach((cell,ci)=>{
        if(cell && cell.owner===cp && cell.type!=='Supporter' && cell.iid!==inst.iid){
          myChars.push({card:cell,r:ri,c:ci});
        }
      }));
      if(myChars.length===0){toast('No characters to discard');break;}
      pickCardInZone(z,'Political Ramblings: select one of your characters in this zone to discard and draw 2 cards.',async (target,tz,tr,tc)=>{
        if(!target) return;
        const src = myChars.find(x=>x.card.iid===target.iid);
        if(src){
          G.board[z][src.r][src.c] = null;
          G.players[cp].discard.push(target);
          await drawCard(cp,2);
          toast(`Discarded ${target.name}, drew 2 cards`);
          renderGame();
        }
      }, cell=>cell && cell.owner===cp && cell.type!=='Supporter' && cell.iid!==inst.iid);
      break;
    }
    case '20': // Shield Wall: continuous, protect zone from fate reduction + no movement
      if(!G.shieldWallZones.includes(z)) G.shieldWallZones.push(z);
      G.board[z].forEach(row=>row.forEach(cell=>{
        if(cell) cell.cantBeMoved = true;
      }));
      renderGame();
      if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
      break;
    case '25': // Zimbabwean Honor Guard: set another copy from hand/deck for free
      {
        const dupes = G.players[cp].hand.filter(c=>c.id==='25');
        const deckDupes = G.players[cp].deck.filter(c=>c.id==='25');
        const allDupes = [...dupes,...deckDupes];
        if(allDupes.length>0 && !G._zimbabweUsedThisTurn){
          G._zimbabweUsedThisTurn = true;
          const extra = allDupes[0];
          G.players[cp].hand = G.players[cp].hand.filter(c=>c.iid!==extra.iid);
          G.players[cp].deck = G.players[cp].deck.filter(c=>c.iid!==extra.iid);
          if(typeof addCardToHand==='function') addCardToHand(cp, extra, { announce:false });
          else G.players[cp].hand.push(extra);
          beginImmediateFreePlacement(cp, extra, 'Place the extra Zimbabwean Honor Guard for free.');
          toast('Another Zimbabwean Honor Guard is ready to set immediately for free!');
        }
      } break;
    case '28': // 2nd Polish-Lithuanian Army: can be set from deck (once/turn, twice/game)
      // Already handled — this is a "when set" card, the special part is SETTING from deck
      // which would be a UI entry elsewhere. For now, mark uses.
      if(!inst._plUsesLeft) inst._plUsesLeft = 2;
      break;
    case '37': // 6th French Fusiliers: when discarded, return to hand (once)
      inst._returnUsed = false;
      break;
    case '35': { // Alexander the Magnificient: snapshot Fate = sum of own characters' original Fate in zone at time of set
        let alexSum = 0;
        G.board[z].forEach(row=>row.forEach(cell=>{
          if(cell && cell.owner===cp && cell.type!=='Supporter' && cell.iid!==inst.iid)
            alexSum += Number(cell.fate || 0);
        }));
        inst.currentFate = alexSum;
        toast('Hellenic Glory: Alexander set with '+alexSum+' Fate!');
        log(cp===0?'p1':'p2', 'Alexander snapshotted at '+alexSum+' Fate');
        renderGame();
      } break;
    case '45': // Chingachlook: placement restriction is enforced before setting.
      break;
    case '47': // Great Oak Infantry: when used for consolidation, new card gains 3 Fate
      inst._greatOakBonus = true;
      break;
    case '52': { // Vigilantes: same-zone card-picker window
      pickCardInZone(z,'Vigilantes: Select an opponent supporter in this zone:',(tgt)=>{
        tgt._markedForDeath = true;
        tgt._reinforcementOverride = 0;
        if(typeof playSfx==='function') playSfx('fateLose');
        toast(tgt.name+' — Reinforcement set to 0!');
        log(cp===0?'p1':'p2','Vigilantes marked '+tgt.name+' for death');
        inst.effectUsedInitial = true;
        renderGame();
        if(typeof updateTopBar === 'function') updateTopBar();
      }, function(cell){ return cell && cell.owner===opp && cell.type==='Supporter' && cell.id!=='76' && !cell.immuneFlag; });
      break;
    }
    case '53': // Colombo Thug: restricts opponent consolidation (continuous, checked in doConsolidate)
      break;
    case '54': { // Wolf Creek: same-zone card-picker window
      pickCardInZone(z,'Wolf Creek: Select a friendly character in this zone to move:',(tgt,tz,tr,tc)=>{
        startWolfCreekMove(tgt, tz, tr, tc, inst);
      }, function(cell){ return cell && cell.owner===cp && cell.type!=='Supporter' && cell.iid!==inst.iid && !cell.cantBeMoved; });
      break;
    }
    case '56': // Lydia: negate opponent supporter effects (5 uses)
      inst.usesLeft = 5; break;
    case '40': // Christopher Erbs: initialize 2 uses
      inst.usesLeft = 2; break;
    case '14': // Alondra Hopkins: discard adjacent OR diagonal opponent supporters when set
      {
        const adjCards = getAdjacentAndDiagonalCards(z,r,c);
        let gained = 0;
        adjCards.forEach(({card:ac,z:az,r:ar,c:ac2})=>{
          if(ac.owner===opp && ac.type==='Supporter' && ac.id!=='76' && !ac.immuneFlag){
            G.board[az][ar][ac2]=null;
            G.players[opp].discard.push(ac);
            gained++;
            log(cp===0?'p1':'p2',`Alondra discarded ${ac.name}`);
          }
        });
        if(gained) inst.currentFate += gained;
        if(gained) toast(`Alondra discarded ${gained} adjacent supporters, gained ${gained} Fate`);
        renderGame();
      } break;
  }

  // Liberators of Rwanda handled above separately - check Anne Stone (11) continuous
  recalcCoordinatorEffects();
}

function recalcCoordinatorEffects() {
  // Anne Stone (11): all supporters in zone +2 fate (while she's there)
  forEachBoardCard((card,z,r,c)=>{
    if(card.id==='11') {
      G.board[z].forEach(row=>row.forEach(cell=>{
        if(cell&&cell.type==='Supporter'&&cell.owner===card.owner&&cell.iid!==card.iid) {
          // We track via baseEffect on the card
        }
      }));
    }
  });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  INITIATOR / COORDINATOR EFFECTS (triggered manually)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function activateBoardCard(card, z, r, c) {
  // In AI mode, the human player is always 1-G.aiPlayer
  const humanP = getPerspectivePlayerIndex();
  if(card.owner!==humanP){
    G.selectedBoardCard = {card,z,r,c};
    openCardDetail(card, false, true);
    return;
  }
  // Only allow activation on human's turn
  if(G.currentPlayer!==humanP){
    G.selectedBoardCard = {card,z,r,c};
    openCardDetail(card, false, true);
    return;
  }
  G.selectedBoardCard = {card,z,r,c};
  openCardDetail(card, false, true);
}

async function triggerCharacterEffect(card, z, r, c, opts = {}) {
  closeModal();
  const cp = G.currentPlayer;
  const opp = 1-cp;
  const id = card.id;

  if(isFaceDownCard(card)){
    toast('Flip this card face up first');
    playSfx('blocked');
    return;
  }

  // Artillery Distance (50) zone lock: prevent effect activation in locked zone (auras unaffected)
  if(typeof G._artilleryLockedZone==='number' && G._artilleryLockedZone===z && G._artilleryLockOwner===cp && G._artilleryLockTurnsLeft>0) {
    // Auras (Coordinators with passive effects) are unaffected — only block active activation
    const isPassiveAura = card.type==='Coordinator';
    if(!isPassiveAura) {
      toast('This zone is locked by Artillery Distance - cannot activate effects here!');
      playSfx('blocked');
      return;
    }
  }

  // Mr. Secules (67): suppresses adjacent opponent Coordinator effects
  if(card.type==='Coordinator' && card.owner===cp){
    const adj = getAdjacentCards(z,r,c);
    const securedBySecules = adj.some(a => a.card.id==='67' && a.card.owner===opp && !isFaceDownCard(a.card));
    if(securedBySecules){
      showBlockedAnimation(card.name+' SUPPRESSED by Mr. Secules');
      playSfx('zoneBlock');
      return;
    }
  }

  // Subtle on-field activation animation. Do not play this for automatic on-set triggers.
  const isPassiveOnly = card.type==='Coordinator' && ['01','10','11','15','19','23','34','57'].includes(id);
  if(!opts.fromSet && !isPassiveOnly && typeof showEffectActivationGlow === 'function') {
    showEffectActivationGlow(z, r, c, card);
  }

  // Initiators: fire ONCE (on placement). If already used, don't fire again.
  // Coordinators: passive/continuous or once per placement.
  // Dauntless: most have ongoing/active effects; handled case-by-case below.
  // Improvisors: triggered/reactive.
  if(card.type==='Initiator' && card.effectUsedInitial && card._effectTurnLocked){
    toast(card.name + "'s Initiator effect already activated.");
    return;
  }
  if(card.type==='Coordinator' && card.effectUsedInitial && !['01','11','15','19','23','57'].includes(id)){
    toast(`${card.name}'s effect already activated.`);
    return;
  }

  switch(id) {
    // Initiators
    case '03': // Howard: double Fate of card in zone
      pickCardInZone(z,'Select a card to double its Fate:',(tgt)=>{
        if(tgt.immuneFlag || tgt.id==='76'){showBlockedAnimation(tgt.name+' is IMMUNE');return;}
        tgt.currentFate = Math.ceil(tgt.currentFate * 2);
        log(cp===0?'p1':'p2',`Moffitt Inspiration: ${tgt.name} Fate doubled to ${tgt.currentFate}`);
        renderGame();
      },c=>!c.immuneFlag); break;
    case '04': // Zoe: block consolidation on a square
      highlightForBlock(z); break;
    case '06': // Jorge Alvarez: search deck for non-star card
      searchDeckForCard(cp, c=>c.rarity!=='star','Search deck (no Stars):', inst=>{
        if(typeof addCardToHand==='function') addCardToHand(cp, inst);
        else G.players[cp].hand.push(inst);
        toast('Added '+inst.name+' to hand');
        renderHand();
      }); break;
    case '07': { // Maja Kaminska: search for up to 2 supporters, then unlimited supporters this turn
      const matches = [...G.players[cp].deck, ...G.players[cp].discard].filter(c=>c.type==='Supporter');
      if(!matches.length){
        G.majaEffectThisTurn = true;
        toast('Unlimited supporters this turn!');
        renderHand();
        updateTopBar();
        break;
      }
      pickCardsVisual(matches, {
        title:'Oblique Order',
        subtitle:'Choose up to 2 Supporters from your deck or discard pile',
        maxCount:2,
        confirmLabel:'Add to Hand'
      }, (chosen)=>{
        chosen.forEach(c=>{
          if(typeof addCardToHand==='function') addCardToHand(cp, c);
          else G.players[cp].hand.push(c);
          G.players[cp].deck = G.players[cp].deck.filter(x=>x.iid!==c.iid);
          G.players[cp].discard = G.players[cp].discard.filter(x=>x.iid!==c.iid);
        });
        G.majaEffectThisTurn = true;
        toast('Unlimited supporters this turn!');
        renderGame();
      });
    } break;
    case '08': // Lina: search Reality card from deck/discard, set for free
      searchAnySource(cp,c=>c.aff==='reality','Search for a Reality card:',(found)=>{
        if(typeof addCardToHand==='function') addCardToHand(cp, found);
        else G.players[cp].hand.push(found);
        beginImmediateFreePlacement(cp, found, 'Place ' + found.name + ' for free from Lina\'s effect.');
        toast(found.name+' is ready to set immediately for free!');
      }); break;
    case '13': // Johnathan Kirby: search deck for 2 supporters
      searchDeckForType(cp,'Supporter','Search for up to 2 Supporters:',2); break;
    case '22': // Isaac Perez: extra supporters = orthogonally adjacent cards count (not diagonal)
      {
        let adj = 0;
        const maxRow = G.board[z] ? G.board[z].length : 3;
        [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc])=>{
          const nr = r + dr, nc = c + dc;
          const rowCapacity = G.board[z] && G.board[z][nr] ? G.board[z][nr].length : 3;
          const neighbor = (nr >= 0 && nr < maxRow && nc >= 0 && nc < rowCapacity && G.board[z][nr]) ? G.board[z][nr][nc] : null;
          if(neighbor && neighbor.iid !== card.iid) adj++;
        });
        G.extraSupportsThisTurn = (Number(G.extraSupportsThisTurn) || 0) + adj;
        const maxSup = (Number(G.maxSupportsPerTurn) || 0) + (Number(G.extraSupportsThisTurn) || 0);
        toast(`${adj} adjacent card${adj===1?'':'s'} — supporter limit is now ${maxSup} this turn.`);
        renderHand();
        updateTopBar();
        setHint(adj > 0 ? `Isaac added ${adj} extra Supporter placement${adj===1?'':'s'} this turn.` : 'Isaac found no adjacent cards.');
      } break;
    case '27': // Kazumi: draw 3
      await drawCard(cp,3);
      toast('Drew 3 cards');
      renderHand(); break;
    case '29': // Dylan Kirby: choose up to 2 Third Great War from deck or discard
      {
        const from=[...G.players[cp].deck,...G.players[cp].discard].filter(c=>c.aff==='third_great_war');
        if(!from.length){toast('No Third Great War cards available');break;}
        pickCardsVisual(from, {
          title:'Leader of the Free World',
          subtitle:'Choose up to 2 Third Great War cards to add to your hand',
          maxCount:2,
          confirmLabel:'Add to Hand'
        }, (chosen)=>{
          chosen.forEach(c=>{
            if(typeof addCardToHand==='function') addCardToHand(cp, c);
            else G.players[cp].hand.push(c);
            G.players[cp].deck=G.players[cp].deck.filter(x=>x.iid!==c.iid);
            G.players[cp].discard=G.players[cp].discard.filter(x=>x.iid!==c.iid);
          });
          if(chosen.length) toast(`Added ${chosen.length} card(s) to hand`);
          shuffle(G.players[cp].deck);
          renderGame();
        });
      } break;
    case '30': // Santiago: halve opponent's card Fate in zone
      pickCardInZone(z,'Select opponent\'s card to halve Fate:',(tgt)=>{
        if(tgt.owner===cp){toast('Must select opponent card');return;}
        if(tgt.immuneFlag || tgt.id==='76'){showBlockedAnimation(tgt.name+' is IMMUNE');return;}
        const before = tgt.currentFate || tgt.fate || 0;
        const changed = setCardFateValue(tgt, Math.floor(before/2), cp);
        if(!changed && Math.floor(before/2) < before){
          showBlockedAnimation('Shield Wall prevents Fate loss');
          return;
        }
        log(cp===0?'p1':'p2',`El Matador del Mares: ${tgt.name} Fate halved to ${tgt.currentFate}`);
        renderGame();
      },c=>c.owner===opp && !c.immuneFlag); break;
    case '39': // Juan Carlos: move opponent's card from ANY zone to open spot
      pickCardFromAnyZone('Select opponent\'s card to move:',(tgt,tz,tr,tc)=>{
        if(tgt.owner===cp){toast('Select opponent card');return;}
        showMoveTarget(tgt,tz,tr,tc,z,{
          title:'Juan Carlos',
          prompt:`Move ${tgt.name} into Juan Carlos' current zone`,
          horizontalZones:true,
          disallowRows:[cp===0 ? 2 : 0]
        });
      },c=>c.owner===opp); break;
    case '43': { // Mark Kemper: choose one extra safe cell
      closeModal();
      G._markSelecting = { player: cp, sourceIid: card.iid };
      G.placing = true;
      clearPlaceHighlights();
      // Pre-create row 3 in all zones so renderBoard shows the selectable cells
      if(!G.extraRows) G.extraRows = [0,0,0];
      G._markPreCreatedZones = [];
      for(var mz=0;mz<3;mz++){
        if((G.extraRows[mz]||0) < 1){
          G.extraRows[mz] = 1;
          G._markPreCreatedZones.push(mz);
        }
        if(!G.board[mz][3]) G.board[mz][3] = Array(3).fill(null);
      }
      renderGame();
      document.querySelectorAll('.cell.mark-safe-choice').forEach(el=>el.classList.add('placeable'));
      toast('Choose a safe-square slot below any zone\'s safe row');
      setHint('Mark Kemper: click one highlighted safe-square slot below any zone.');
      break;
    }
    case '48': // Cosmic GF: add Expanded Worlds from deck, then discard
      addAffFromDeckDiscard(cp,'expanded_worlds'); break;
    case '51': { // Rivera: declare affiliation, +3 Fate to matching characters for 3 of your turns
      showAffiliationPickerVisual((aff)=>{
        const riveraCard = card;
        startRiveraBuff(riveraCard, aff, riveraCard.owner != null ? riveraCard.owner : cp);
        toast('Rivera declared '+(AFF_LABEL[aff]||aff)+'! Character cards you set with that affiliation gain 3 Fate for 3 of your turns.');
        log(cp===0?'p1':'p2','Rivera declared '+(AFF_LABEL[aff]||aff)+' for matching characters for 3 of their turns');
        riveraCard.effectUsedInitial = true;
        renderGame();
        if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
        updateTopBar();
        if(typeof showRiveraStatusBanner === 'function') setTimeout(()=>showRiveraStatusBanner(aff, 3, riveraCard.owner != null ? riveraCard.owner : cp), 80);
      });
      break;
    }

    // Coordinators
    case '10': // Post-Modernist Dylan: continuous-only, no activation effect
      toast('Dylan\'s Esoteric Annihilation is passive — applies while he is on the field.');
      break;
    case '11': // Anne Stone: passive (handled in getEffectiveFate)
      toast('Anne Stone\'s Coordination is passive — applies while she is on the field.');
      break;
    case '12': // Makenna: select 2 cards, make immune
      pickMultipleInZone(z,2,'Select up to 2 friendly cards to make immune:',(targets)=>{
        targets.forEach(t=>{ t.card.immuneFlag=true; });
        toast('Selected cards are now immune');
        renderGame();
      }, c=>c.owner===cp); break;
    case '15': // Zsofia Szocs: passive (handled in getEffectiveFate)
      toast('Blue Danube Waltz is passive — applies while Zsofia is on the field.');
      break;
    case '19': // Květka Svoboda: passive (handled in getEffectiveFate)
      toast('The Vltava\'s Story is passive — applies while Květka is on the field.');
      break;
    case '23': // Cathy: passive (handled in getEffectiveFate)
      toast('Cardigan Onslaught is passive — applies while Cathy is on the field.');
      break;
    case '34': // Rozsi Szocs: passive - cards moved into zone gain 2 Fate
      toast('Hungarian Dance is passive — cards moved into this zone by effects gain 2 Fate automatically.');
      break;
    case '01': // Felicyta: passive (handled in getEffectiveFate)
      toast('Felicyta\'s buff is already active automatically.');
      break;
    case '46': // Phil: now Dauntless — no click effect (gains Fate passively per draw phase)
      toast('The Monarchist Manifesto grows stronger each turn automatically.');
      break;

    // Dauntless
    case '21': // Henry Dong: discard from hand, gain 3 fate per card
      pickCardsFromHand(cp,999,'Discard cards to boost Henry Dong\'s Fate (+3 each):',(cards)=>{
        cards.forEach(c=>{
          G.players[cp].hand=G.players[cp].hand.filter(h=>h.iid!==c.iid);
          G.players[cp].discard.push(c);
          card.currentFate+=3;
        });
        toast(`Henry Dong gained ${cards.length*3} Fate!`);
        renderGame();
      }); break;
    case '38': // Jake: discard supporter, +3 Fate (once per turn)
      if(card.effectUsedThisTurn){toast('Jake can only use this effect once per turn');break;}
      pickCardsFromHand(cp,1,'Discard a Supporter for +3 Fate:',(cards)=>{
        if(!cards[0]||cards[0].type!=='Supporter'){toast('Must be a Supporter');return;}
        G.players[cp].hand=G.players[cp].hand.filter(h=>h.iid!==cards[0].iid);
        G.players[cp].discard.push(cards[0]);
        card.currentFate+=3;
        card.effectUsedThisTurn=true;
        toast('Jake gained 3 Fate!');
        renderGame();
      }); break;
    case 'bh25': // Jimmy Viltrumite: discard any card on field
      showModal('Left Hook of the Incel','Select any card on the field to discard:',
        [{label:'Choose Target',action:()=>{closeModal();pickAnyBoardCard(cp,(tgt,tz,tr,tc)=>{
          discardBoardCard(tgt,tz,tr,tc);
          toast('Discarded '+tgt.name);
          renderGame();
        });}},{label:'Cancel',action:closeModal}]); break;

    // Improvisors
    case '40': // Christopher Erbs: next draw gains 4 Fate
      if(card.usesLeft>0){
        if(!Array.isArray(G.erbsActive)) G.erbsActive = [false, false];
        if(G.erbsActive[cp]) { toast('Christopher Erbs is already waiting for your next draw.'); break; }
        G.erbsActive[cp] = true;
        card.usesLeft--;
        toast('Next card drawn gains 4 Fate! ('+(card.usesLeft)+' uses left)');
      } else toast('No uses remaining.'); break;
    case '56': // Lydia: negate opponent effect
      if(card.usesLeft>0){
        toast('Lydia is ready to negate an opponent effect ('+card.usesLeft+' uses remaining). This triggers automatically.');
      } else toast('No uses remaining.'); break;
    case '17': // Carolyn: block any open cell permanently
      {
        toast('Click any empty cell on the board to lock it permanently');
        G.placing = true;
        G.blockingCell = true;
        clearPlaceHighlights();
        for(let zz=0;zz<3;zz++){
          const totalRows = G.board[zz]?G.board[zz].length:3;
          for(let rr=0;rr<totalRows;rr++) for(let cc=0;cc<(G.board[zz][rr] ? G.board[zz][rr].length : 3);cc++){
            if(G.board[zz][rr]&&G.board[zz][rr][cc]===null && !isBlocked(zz,rr,cc)){
              const el = document.querySelector(`[data-z="${zz}"][data-r="${rr}"][data-c="${cc}"]`);
              if(el) el.classList.add('placeable');
            }
          }
        }
        window._blockZone = -1;
      } break;
    case '14': // Alondra Hopkins: on-set only, not re-activatable
      toast('Alondra\'s effect only fires when she is first set.');
      break;
    case 'bh01': // Anicka Voyager: move to any open cell, draw 1 (once per turn)
      {
        if(card.bh01MovedThisTurn){toast('Anicka can only move once per turn');break;}
        G.placing = true;
        G._bh01Moving = {card, fromZ:z, fromR:r, fromC:c};
        toast('Click any open cell to move Anicka');
        highlightAllOpenCells();
      } break;

    default:
      toast('Effect: '+card.effect);
  }
  // Mark this character's effect as activated (fires once)
  card.effectUsedInitial = true;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  FATE HELPERS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function modifyFate(card, amount, type) {
  if(card.immuneFlag) return;
  if(amount<0 && G.shieldWallZones.length>0) {
    // Check if card is in a shieldwall zone
    let inShield = false;
    forEachBoardCard((c,z)=>{ if(c.iid===card.iid && G.shieldWallZones.includes(z)) inShield=true; });
    if(inShield) return;
  }
  card.currentFate = Math.max(0, card.currentFate + amount);
}

function recordFateReductionEvent(owner, beforeValue, afterValue) {
  if(owner !== 0 && owner !== 1) return;
  const before = Math.max(0, Number(beforeValue) || 0);
  const after = Math.max(0, Number(afterValue) || 0);
  if(after < before) G.damageDoneP[owner] = (G.damageDoneP[owner] || 0) + 1;
}

function setCardFateValue(card, newValue, sourceOwner) {
  if(!card || card.immuneFlag) return false;
  const before = Math.max(0, Number(card.currentFate ?? card.fate) || 0);
  const targetValue = Math.max(0, Number(newValue) || 0);
  if(targetValue < before && G.shieldWallZones.length>0) {
    let inShield = false;
    forEachBoardCard((c,z)=>{ if(c.iid===card.iid && G.shieldWallZones.includes(z)) inShield=true; });
    if(inShield) return false;
  }
  card.currentFate = targetValue;
  recordFateReductionEvent(sourceOwner, before, targetValue);
  return targetValue !== before;
}

function isCoordinatorSuppressedAt(z, r, c) {
  if(!G.board[z] || !G.board[z][r] || !G.board[z][r][c]) return false;
  const card = G.board[z][r][c];
  if(!card || card.type!=='Coordinator' || isFaceDownCard(card)) return false;
  return getAdjacentCards(z, r, c).some(a => a.card.id==='67' && a.card.owner!==card.owner && !isFaceDownCard(a.card));
}

function isSupporterAuraSuppressed(card) {
  return !!(card && card.type === 'Supporter' && card._lydiaSuppressed);
}

function getEffectiveFate(card, z) {
  if(!card) return 0;
  if(isFaceDownCard(card)) return 0;
  // ALPINE Infantry: no bonus applies, invisible to other effects
  if(card.noBonus) return card.currentFate;
  // Helper: ALPINE (76) is invisible — should not be counted by any other card's effect
  const isInvisible = (c) => c && (c.id==='76' || isFaceDownCard(c));
  // Jimmy 41: fate = 2x total damage done this game by owner
  const getContinuousDamageCount = (owner) => {
    if(!G._continuousDamageSources) return 0;
    let count = 0;
    G._continuousDamageSources.forEach((key)=>{
      if(typeof key === 'string' && key.startsWith(owner+':')) count++;
    });
    return count;
  };
  if(card.id==='41') return (G.damageDoneP[card.owner] + getContinuousDamageCount(card.owner)) * 2;
  // Alexander 35: fate was snapshotted on set (see runWhenSetEffect case '35')
  // No dynamic recalculation — uses currentFate set at placement time
  let bonus = 0;

  // 1st West Caribbea Marines (65): always gains 3 Fate (built-in bonus)
  if(card.id==='65') bonus += 3;
  // Greek Hoplite (63): +1 Fate per copy of self in same zone, including itself
  if(card.id==='63'){
    let copies = 0;
    G.board[z].forEach(row=>row.forEach(cell=>{
      if(cell && cell.id==='63' && cell.owner===card.owner && !isInvisible(cell)) copies++;
    }));
    bonus += copies;
  }
  if(card.id==='44' && !isSupporterAuraSuppressed(card)){
    let sourcePos = null;
    G.board[z].forEach((row, r)=>row.forEach((cell, c)=>{
      if(cell && cell.iid===card.iid) sourcePos = {r, c};
    }));
    if(sourcePos){
      const adj = getAdjacentCards(z, sourcePos.r, sourcePos.c);
      if(adj.some(a=>a.card.owner===card.owner && a.card.type==='Dauntless' && a.card.id!=='76')) bonus += 2;
    }
  }

  // --- Coordinator passive buffs ---
  // Jeremiah Jones (57) boosts each friendly coordinator aura by 1 potency.
  let jeremiahBoost = 0;
  G.board[z].forEach((row, r)=>row.forEach((cell, c)=>{
    if(cell && cell.id==='57' && cell.owner===card.owner && !isInvisible(cell) && !isCoordinatorSuppressedAt(z, r, c)) jeremiahBoost++;
  }));
  G.board[z].forEach((row, r)=>row.forEach((cell, c)=>{
    if(!cell || isInvisible(cell)) return;
    if(cell.id==='10' && cell.owner!==card.owner) {
      if(!G._continuousDamageSources) G._continuousDamageSources = new Set();
      G._continuousDamageSources.add(cell.owner+':10:'+cell.iid);
      bonus -= 2;
      return;
    }
    if(cell.type==='Coordinator' && isCoordinatorSuppressedAt(z, r, c)) return;
    if(cell.owner!==card.owner) return;
    // Felicyta (01): +3 to adjacent friendly cards
    if(cell.id==='01' && getAdjacentCards(z, r, c).some(a=>a.card.iid===card.iid)) bonus += 3 + jeremiahBoost;
    // Phil (46): no zone aura
    // Anne Stone (11): +2 to supporters in zone
    if(cell.id==='11' && card.type==='Supporter') bonus += 2 + jeremiahBoost;
    // KvÄ›tka (19): all Coordinators in zone +2
    if(cell.id==='19' && card.type==='Coordinator') bonus += 2 + jeremiahBoost;
    // Zsofia (15): handled in its own stacking block below
    // Post-Modernist Dylan (10): -2 to all opponent cards in zone (continuous)
    // Dylan Kirby (29): Initiator â€” no continuous effect (search only)
    // Dylan Kirby (29): Initiator — no continuous effect (search only)
    // Cathy (23): +2 to all owned characters in zone
    if(cell.id==='23' && card.type!=='Supporter') bonus += 2 + jeremiahBoost;
    // Jeremiah Jones (57): now boosts other coordinator auras' potency (handled above via jeremiahBoost)
    // Maroon Knights (59): +1 to all Supporters in zone (while on field)
    if(cell.id==='59' && card.type==='Supporter' && !isSupporterAuraSuppressed(cell)) bonus += 1;
    // Duncan Heyward (77): +3 to declared-affiliation friendly cards in zone
    if(cell.id==='77' && cell._declaredAff && card.aff===cell._declaredAff) bonus += 3 + jeremiahBoost;
  }));

  // Zsofia (15): each copy applies its own zone-wide buff
  let zsofiaCount = 0;
  G.board[z].forEach((row, r)=>row.forEach((cell, c)=>{
    if(cell&&cell.id==='15'&&cell.owner===card.owner && !isCoordinatorSuppressedAt(z, r, c)) zsofiaCount++;
  }));
  if(zsofiaCount > 0) {
    const coordCount = countCoordinators(z, card.owner);
    bonus += Math.min(3, zsofiaCount * (coordCount + jeremiahBoost));
  }
  if(card.type==='Dauntless' && card.id!=='76'){
    G.board[z].forEach((row, r)=>row.forEach((cell, c)=>{
      if(cell && cell.id==='44' && cell.owner===card.owner && !isInvisible(cell) && !isSupporterAuraSuppressed(cell) && getAdjacentCards(z, r, c).some(a=>a.card.iid===card.iid)) {
        bonus += 2;
      }
    }));
  }

  // Bobby Jones (55): +5 Fate if all own cards in zone share same affiliation
  if(card.id==='55'){
    let allSameAff = true;
    let ownAff = null;
    let ownCount = 0;
    G.board[z].forEach(row=>row.forEach(cell=>{
      if(cell && cell.owner===card.owner && cell.iid!==card.iid && !isInvisible(cell)){
        ownCount++;
        if(!ownAff) ownAff = cell.aff;
        else if(cell.aff !== ownAff) allSameAff = false;
      }
    }));
    if(allSameAff && ownAff && ownCount >= 3) bonus += 5;
  }

  return Math.max(0, card.currentFate + bonus);
}

function countCoordinators(z, owner) {
  let n=0;
  G.board[z].forEach(row=>row.forEach(cell=>{if(cell&&cell.type==='Coordinator'&&cell.owner===owner && !isFaceDownCard(cell)) n++;}));
  return n;
}

function getBaseZoneScore(z, player) {
  let score = 0;
  G.board[z].forEach((row,r)=>{
    if(!row) return;
    row.forEach((cell,c)=>{
      if(cell&&cell.owner===player) score+=getEffectiveFate(cell,z);
    });
  });
  // Deterrance (Marie L'amboure, 36): applies only to opponent's score in this zone
  const dm = G.fateModifiers['deterrance_z'+z]||0;
  // Determine if the player is the opponent of Deterrance's owner
  let deterranceOwner = -1;
  G.board[z].forEach(row=>row.forEach(cell=>{
    if(cell&&cell.id==='36') deterranceOwner = cell.owner;
  }));
  if(deterranceOwner>=0 && deterranceOwner!==player && dm<0){
    score = Math.max(0, score+dm);
  }
  return score;
}

function getZoneScore(z, player) {
  let score = getBaseZoneScore(z, player);
  const multiplier = typeof getPlayerZoneFateMultiplier === 'function' ? getPlayerZoneFateMultiplier(player) : 1;
  if(multiplier > 1) score = Math.ceil(score * multiplier);
  return score;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  WIN CHECK
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function checkWin() {
  if(G._finalZoneRevealActive && !G._skipFinalZoneReveal) return;
  // Tutorial: force end after 10 turns
  if(_tutorialActive && G._tutorialTurnLimit && G.turnNumber >= G._tutorialTurnLimit) {
    if(typeof tutorialEvent==='function') tutorialEvent('gameEnd');
  }
  hidePassTurnOverlay();
  let p0wins=0, p1wins=0;
  const zResults=[];
  for(let z=0;z<3;z++){
    const s0=getZoneScore(z,0), s1=getZoneScore(z,1);
    let ctrl = s0>s1?0:s1>s0?1:-1;
    if(ctrl===0) p0wins++;
    else if(ctrl===1) p1wins++;
    zResults.push({z,s0,s1,ctrl});
  }
  stopTurnTimer();
  // Determine winner: 2+ zones wins outright; tied zones -> total Fate tiebreaker; still tied -> official draw
  let winner = p0wins>=2?0:p1wins>=2?1:-1;
  let drawByFate = false;
  let isDraw = false;
  if(winner < 0){
    let p0TotalFate = 0, p1TotalFate = 0;
    for(let tz=0;tz<3;tz++){
      p0TotalFate += getZoneScore(tz, 0);
      p1TotalFate += getZoneScore(tz, 1);
    }
    if(p0TotalFate > p1TotalFate){ winner = 0; drawByFate = true; }
    else if(p1TotalFate > p0TotalFate){ winner = 1; drawByFate = true; }
    else { isDraw = true; }
  }
  if(!G._skipFinalZoneReveal && !G._finalZoneRevealActive && typeof showFinalZoneReveal === 'function'){
    G._finalZoneRevealActive = true;
    stopTurnTimer();
    showFinalZoneReveal(zResults, {
      winner,
      isDraw,
      drawByFate,
      p0wins,
      p1wins,
      onComplete: function(){
        G._finalZoneRevealActive = false;
        G._skipFinalZoneReveal = true;
        checkWin();
        G._skipFinalZoneReveal = false;
      }
    });
    return;
  }
  cleanupTutorialAndDialogueArtifacts({dismissTutorial:true});
  cleanupFloatingGameArtifacts();
  closeGameModal();
  if(typeof removeOpponentFound === 'function') removeOpponentFound();
  if(typeof removeInGameChat === 'function') removeInGameChat();
  const onlineLocalPlayer = Number.isInteger(G._onlinePlayerIndex) ? G._onlinePlayerIndex : null;
  if(isDraw) playSfx('win');
  else if(G.aiEnabled && winner === G.aiPlayer) playSfx('lose');
  else if(onlineLocalPlayer !== null && winner >= 0 && winner !== onlineLocalPlayer) playSfx('lose');
  else playSfx('win');
  setTimeout(function(){ if(typeof playSfx === 'function') playSfx('matchEnd'); }, 800);
  // Daily challenge progress
  if(typeof updateDailyChallengeProgress === 'function'){
    const localP = G.aiEnabled ? (1 - G.aiPlayer) : 0;
    const didWin = !isDraw && winner === localP;
    if(didWin){
      updateDailyChallengeProgress('wins', 1, 'add');
      updateDailyChallengeProgress('zonesWon', p0wins + p1wins, 'max'); // not ideal but tracks zones
      if(p0wins === 3 || p1wins === 3) updateDailyChallengeProgress('zonesWon', 3, 'set');
    }
    // Track highest fate on board (done via applyContinuousEffects hook elsewhere)
  }
  showScreen('s-win');
  document.getElementById('s-win')?.classList.remove('forfeit-result-screen');
  if(typeof applyWinScreenGameBackground === 'function') applyWinScreenGameBackground();

  // Record results based on mode
  let result = null;
  let starlightGained = 0;
  let freePackGained = false;
  if(G.aiEnabled && winner >= 0){
    const humanP = 1 - G.aiPlayer;
    const humanWon = winner === humanP;
    const settings = getAIDifficultySettings();
    const resolvedOpponentElo = G._aiOpponentElo || settings.opponentElo;
    if(CURRENT_MODE === 'challenger'){
      // Challenger: AI matches now use the same ELO/XP gains as human matches.
      // Starlight remains AI-tuned below.
      result = recordChallengerResult(humanWon, resolvedOpponentElo, true);
      // Update AI opponent's ELO in leaderboard (mirror loss/gain)
      if(G._selectedAI){
        const aiName = G._selectedAI.name;
        const aiElo = resolvedOpponentElo;
        const aiDidWin = !humanWon;
        const aiK = 32;
        const aiExpected = 1 / (1 + Math.pow(10, ((USER_PROFILE.challengerElo||600) - aiElo) / 400));
        const aiActual = aiDidWin ? 1 : 0;
        const aiNewElo = Math.max(0, Math.round(aiElo + aiK * (aiActual - aiExpected)));
        if(typeof syncAIEloEverywhere === 'function'){
          syncAIEloEverywhere(aiName, aiNewElo, aiDidWin);
        } else {
          const lbIdx = LEADERBOARD.findIndex(e=>e.username===aiName);
          if(lbIdx>=0){
            LEADERBOARD[lbIdx].elo = aiNewElo;
            if(aiDidWin) LEADERBOARD[lbIdx].wins = (LEADERBOARD[lbIdx].wins||0)+1;
            else LEADERBOARD[lbIdx].losses = (LEADERBOARD[lbIdx].losses||0)+1;
          } else {
            LEADERBOARD.push({username:aiName, elo:aiNewElo, wins:aiDidWin?1:0, losses:aiDidWin?0:1, profileImg:G._selectedAI.img||'blank.png', isAI:true, isMonthly:!!(G._selectedAI&&G._selectedAI.isMonthly)});
          }
          const aiOpp = AI_OPPONENTS.find(a=>a.name===aiName);
          if(aiOpp) aiOpp.elo = aiNewElo;
          saveLeaderboard();
        }
      }
      if(humanWon){
        const aiRewardMult = Number(G._aiRewardMultiplier || 1);
        starlightGained = Math.max(1, Math.round(calculateStarlight(resolvedOpponentElo, true) * aiRewardMult));
        USER_PROFILE.starlight = (USER_PROFILE.starlight||0) + starlightGained;
        saveProfile();
      }
    } else {
      // Free Play: XP only, no ELO impact
      result = recordFreePlayResult(humanWon, resolvedOpponentElo);
    }
  } else if(!G.aiEnabled && winner >= 0 && onlineLocalPlayer !== null){
    const localWon = winner === onlineLocalPlayer;
    const oppIndex = 1 - onlineLocalPlayer;
    const oppProfile = G.playerProfiles?.[oppIndex] || {};
    const resolvedOpponentElo = Number(oppProfile.elo || oppProfile.challengerElo || 600) || 600;
    const isRankedOnline = G._onlineRoomMode === 'ranked' || CURRENT_MODE === 'challenger';
    if(isRankedOnline){
      result = recordChallengerResult(localWon, resolvedOpponentElo, false);
      if(localWon){
        starlightGained = Math.max(1, calculateStarlight(resolvedOpponentElo, false));
        USER_PROFILE.starlight = (USER_PROFILE.starlight||0) + starlightGained;
        saveProfile();
      }
    }else{
      result = recordFreePlayResult(localWon, resolvedOpponentElo);
    }
  } else if(!G.aiEnabled && isDraw && onlineLocalPlayer !== null){
    const xpResult = awardXp(CURRENT_MODE === 'challenger' || G._onlineRoomMode === 'ranked' ? 12 : 8);
    saveProfile();
    result = {eloChange:0, xpGained:xpResult.xpGained, levelsGained:xpResult.levelsGained, newLevel:xpResult.newLevel, isDraw:true};
  } else if(G.aiEnabled && isDraw){
    // Official draw
    const xpResult = awardXp(12);
    if(CURRENT_MODE === 'challenger'){
      const settings2 = getAIDifficultySettings();
      const resolvedOpponentElo2 = G._aiOpponentElo || settings2.opponentElo;
      const aiRewardMult2 = Number(G._aiRewardMultiplier || 1);
      starlightGained = Math.max(1, Math.round(calculateStarlight(resolvedOpponentElo2, true) * aiRewardMult2 * 0.5));
      USER_PROFILE.starlight = (USER_PROFILE.starlight||0) + starlightGained;
    }
    saveProfile();
    result = {eloChange:0, xpGained:xpResult.xpGained, levelsGained:xpResult.levelsGained, newLevel:xpResult.newLevel, isDraw:true};
  } else if(G.aiEnabled && winner < 0){
    const xpResult = awardXp(8);
    saveProfile();
    result = {eloChange:0, xpGained:xpResult.xpGained, levelsGained:xpResult.levelsGained, newLevel:xpResult.newLevel};
  }

  // Title
  let titleText;
  if(isDraw) titleText = 'Draw!';
  else if(winner>=0) titleText = G.players[winner].name+' Wins!';
  else titleText = 'It\'s a Tie!';
  document.getElementById('win-title').textContent = titleText;
  let subText;
  if(isDraw) subText = 'Both players are tied on zones and total Fate';
  else if(drawByFate) subText = 'Won by total Fate tiebreaker!';
  else if(winner>=0) subText = 'Controls '+[p0wins,p1wins][winner]+' of 3 Zones';
  else subText = 'Both players tied'
  document.getElementById('win-sub').textContent = subText;

  // Zone breakdown
  const wz = document.getElementById('win-zones');
  wz.innerHTML='';
  zResults.forEach(({z,s0,s1,ctrl})=>{
    const el=document.createElement('div');
    el.className='win-z'+(ctrl===winner?' won':'')+(isDraw?' draw':'');
    el.innerHTML=`<div>Zone ${z+1}</div>
      <div style="color:var(--p1)">${G.players[0].name}: ${s0}</div>
      <div style="color:var(--p2)">${G.players[1].name}: ${s1}</div>
      <div style="color:var(--gold)">${ctrl>=0?G.players[ctrl].name+' controls':'Tied'}</div>`;
    wz.appendChild(el);
  });
  // Show total Fate comparison when draw or fate tiebreaker
  if(isDraw || drawByFate){
    let p0TotalFate2=0, p1TotalFate2=0;
    for(let tz=0;tz<3;tz++){
      p0TotalFate2 += getZoneScore(tz, 0);
      p1TotalFate2 += getZoneScore(tz, 1);
    }
    const fateEl = document.createElement('div');
    fateEl.style.cssText = 'text-align:center;padding:.8rem;margin-top:.6rem;border:1px solid var(--border);border-radius:8px;background:rgba(0,0,0,.3);';
    const fateTitle = isDraw ? 'Total Fate (Tied)' : 'Total Fate Tiebreaker';
    fateEl.innerHTML = '<div style="font-family:Cinzel,serif;color:var(--gold);font-size:.9rem;margin-bottom:.4rem;">'+fateTitle+'</div>'+
      '<div style="display:flex;justify-content:center;gap:2rem;">'+
        '<div style="color:var(--p1);font-size:1.1rem;font-weight:bold;">'+G.players[0].name+': '+p0TotalFate2+'</div>'+
        '<div style="color:var(--p2);font-size:1.1rem;font-weight:bold;">'+G.players[1].name+': '+p1TotalFate2+'</div>'+
      '</div>'+
      (isDraw ? '<div style="color:var(--dim);font-size:.8rem;margin-top:.3rem;">Official Draw</div>' :
        '<div style="color:#7fff90;font-size:.8rem;margin-top:.3rem;">'+G.players[winner].name+' wins by higher total Fate!</div>');
    wz.appendChild(fateEl);
  }

  // Rewards panel — ELO change and XP gained
  const rewardsEl = document.getElementById('win-rewards');
  if(result){
    rewardsEl.style.display = 'block';
    const eloSign = result.eloChange >= 0 ? '+' : '';
    const eloClr = result.eloChange > 0 ? '#7fff90' : result.eloChange < 0 ? '#ff7070' : 'var(--dim)';
    const nextLevelXp = USER_PROFILE.level >= MAX_LEVEL ? 0 : getXpForLevel(USER_PROFILE.level+1);
    const xpPct = USER_PROFILE.level >= MAX_LEVEL ? 100 : Math.round((USER_PROFILE.xp / nextLevelXp) * 100);
    const badge = getBadgeForLevel(USER_PROFILE.level);
    const levelUpBanner = result.levelsGained > 0
      ? `<div class="win-levelup">LEVEL UP! Reached Level ${result.newLevel} (${escapeHtml(getBadgeForLevel(result.newLevel).name)})</div>`
      : '';
    // Rank-up detection
    const currentElo = USER_PROFILE.challengerElo||600;
    const prevElo = currentElo - (result.eloChange||0);
    const prevRank = getRank(prevElo);
    const newRank = getRank(currentElo);
    const rankChanged = newRank.name !== prevRank.name && result.eloChange !== 0;
    const rankShiftBanner = rankChanged
      ? `<div class="win-rank-shift ${result.eloChange>0?'promote':'demote'}" style="border-color:${newRank.color};background:linear-gradient(135deg,${newRank.bg},rgba(0,0,0,.46));">
          <div class="win-rank-shift-copy" style="color:${newRank.color};">${result.eloChange>0?'RANK PROMOTION':'RANK DROP'}</div>
          <div class="win-rank-shift-track">
            <div class="win-rank-stage">
              <div class="win-rank-icon">${renderRankIconMark(prevRank,'lg')}</div>
              <div class="win-rank-name">${escapeHtml(prevRank.name)}</div>
            </div>
            <div class="win-rank-arrow">-&gt;</div>
            <div class="win-rank-stage">
              <div class="win-rank-icon">${renderRankIconMark(newRank,'lg')}</div>
              <div class="win-rank-name" style="color:${newRank.color};">${escapeHtml(newRank.name)}</div>
            </div>
          </div>
        </div>` : '';
    const starlightBox = starlightGained > 0 ? `
        <div class="win-reward-box" style="border-color:rgba(255,215,0,.5);background:rgba(255,215,0,.08);">
          <div class="wrb-label" style="color:#ffd700;">STARLIGHT</div>
          <div class="wrb-value" style="color:#ffd700;display:flex;align-items:center;justify-content:center;gap:.3rem;">
            <span style="font-size:1.4rem;">${STARLIGHT_ICON}</span>+${starlightGained}
          </div>
          <div class="wrb-sub">Total: ${USER_PROFILE.starlight}${(G._aiRewardMultiplier||1)>1?` - ${G._aiRewardMultiplier}x bonus`:''}</div>
        </div>` : '';
    const isChallengerRewardMode = CURRENT_MODE === 'challenger' || G._onlineRoomMode === 'ranked';
    const cleanModeLabel = isChallengerRewardMode
      ? `<div class="win-result-mode challenger">CHALLENGER MODE</div>`
      : `<div class="win-result-mode freeplay">FREE PLAY</div>`;
    const eloBox = isChallengerRewardMode ? `
        <div class="win-reward-box">
          <div class="wrb-label">CHALLENGER ELO</div>
          <div class="wrb-value" style="color:${eloClr};">${eloSign}${result.eloChange}</div>
          <div class="wrb-sub">now ${USER_PROFILE.challengerElo||600}</div>
        </div>` : '';
    const rankBox = isChallengerRewardMode ? `
        <div class="win-reward-box win-reward-rank-box">
          <div class="wrb-label">RANK</div>
          <div class="wrb-value win-rank-badge-large">${renderRankBadge(USER_PROFILE.challengerElo||600,'lg')}</div>
        </div>` : '';
    const progressBox = `
        <div class="win-reward-box win-reward-progress-box">
          <div class="wrb-label">Progress</div>
          <div class="win-xp-bar"><div class="win-xp-fill" style="width:${xpPct}%;"></div></div>
          <div class="wrb-sub">${USER_PROFILE.level >= MAX_LEVEL ? 'MAX LEVEL' : `${USER_PROFILE.xp} / ${nextLevelXp} XP`}</div>
        </div>`;
    rewardsEl.innerHTML = `
      ${cleanModeLabel}
      ${rankShiftBanner}
      ${levelUpBanner}
      <div class="win-rewards-grid">
        ${eloBox}
        ${progressBox}
        ${starlightBox}
        <div class="win-reward-box">
          <div class="wrb-label">XP Gained</div>
          <div class="wrb-value" style="color:var(--fate);">+${result.xpGained}</div>
          <div class="wrb-sub">${renderLevelBadge(USER_PROFILE.level,{small:true})}</div>
        </div>
        ${rankBox}
      </div>`;
  } else {
    rewardsEl.style.display = 'none';
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// ══════════════════════════════════════════════════════════════
//  SUPPORTER ACTIVE ABILITIES
// ══════════════════════════════════════════════════════════════

// Vigilantes (52): discard 3 own supporters from field to discard a card in this same zone
function activateVigilantes(card, z, r, c) {
  const cp = G.currentPlayer;
  const availSups = [];
  forEachBoardCard((bc, bz, br, bc2) => {
    if(bc.owner===cp && bc.type==='Supporter' && bc.iid!==card.iid && !bc.noConsolidate && bc.id!=='76'){
      availSups.push({card:bc, z:bz, r:br, c:bc2});
    }
  });
  if(availSups.length < 3){
    toast('Need 3 supporters on the field to activate (have '+availSups.length+')');
    return;
  }
  if(typeof showEffectActivationGlow === 'function') showEffectActivationGlow(z, r, c, card);
  pickCardsVisual(availSups.map(s=>s.card), {
    title:'Marked for Death — Select 3 Supporters to Expend',
    subtitle:'These supporters will be discarded to remove one card in this same zone.',
    maxCount:3, confirmLabel:'Expend'
  }, (chosen)=>{
    if(chosen.length < 3){toast('Must select exactly 3 supporters');return;}

    const zoneTargets = [];
    if(G.board[z]){
      G.board[z].forEach((row,ri)=>row.forEach((cell,ci)=>{
        if(cell) zoneTargets.push({card:cell,z:z,r:ri,c:ci});
      }));
    }
    if(zoneTargets.length===0){toast('No cards in this zone');return;}

    pickCardInZone(z,'Vigilantes: Select a card in this zone to destroy:',(tgt,locZ,locR,locC)=>{
      if(tgt.immuneFlag || tgt.id==='76'){showBlockedAnimation(tgt.name+' is IMMUNE');return;}
      chosen.forEach(function(sc){
        const src = availSups.find(function(s){return s.card.iid===sc.iid;});
        if(src) discardBoardCard(src.card, src.z, src.r, src.c);
      });
      discardBoardCard(tgt, locZ, locR, locC);
      card.vigilanteUsed = true;
      toast('Vigilantes destroyed '+tgt.name+'!');
      log(cp===0?'p1':'p2', 'Vigilantes expended 3 supporters to destroy '+tgt.name+' in Zone '+(locZ+1));
      playSfx('effect');
      renderGame();
    }, function(cell){ return !!cell && cell.id!=='76' && !cell.immuneFlag; });
  });
}


function startWolfCreekMove(cardToMove, fromZ, fromR, fromC, wolfCreekCard) {
  if(!cardToMove || !wolfCreekCard) return false;
  clearBoardTargetSelection();
  clearPlaceHighlights();
  const cp = typeof wolfCreekCard.owner === 'number' ? wolfCreekCard.owner : G.currentPlayer;
  const options = [];
  for(let zz=0; zz<(G.board ? G.board.length : 3); zz++){
    G.board[zz].forEach((row,rr)=>row.forEach((cell,cc)=>{
      if(cell || isBlocked(zz,rr,cc)) return;
      const rowOwner = rr===0 ? 1 : rr===1 ? -1 : rr===2 ? 0 : cp;
      if(rowOwner===cp || rowOwner===-1){
        options.push({z:zz,r:rr,c:cc});
        const el=document.querySelector('[data-z="'+zz+'"][data-r="'+rr+'"][data-c="'+cc+'"]');
        if(el) el.classList.add('placeable','move-target');
      }
    }));
  }
  if(!options.length){ toast('No open squares available for Wolf Creek'); return false; }
  G._wolfCreekMoving = { card:cardToMove, fromZ:fromZ, fromR:fromR, fromC:fromC, wolfCreekCard:wolfCreekCard, options:options };
  G.placing = false;
  G.selectedHandCard = null;
  if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function') {
    window.FateMatchRendererAdapter.scheduleRender('square-selection-state');
  }
  toast('Click a highlighted open square to move '+cardToMove.name);
  if(typeof setHint === 'function') setHint('Wolf Creek: click a highlighted open square to move '+cardToMove.name+' — press Escape to cancel');
  return true;
}

// Wolf Creek Light Infantry (54): move a character you control in this zone to an open square
function activateWolfCreek(card, z, r, c) {
  const cp = G.currentPlayer;
  const myCards = [];
  if(!G.board[z]){ toast('No zone found'); return; }
  G.board[z].forEach((row,ri)=>row.forEach((cell,ci)=>{
    if(cell && cell.owner===cp && cell.iid!==card.iid && cell.type!=='Supporter' && !cell.cantBeMoved){
      myCards.push({card:cell, z:z, r:ri, c:ci});
    }
  }));
  if(myCards.length===0){toast('No characters to move in this zone');return;}
  if(typeof showEffectActivationGlow === 'function') showEffectActivationGlow(z, r, c, card);
  pickCardInZone(z,'Wolf Creek: Select a friendly character in this zone to move:',(target, srcZ, srcR, srcC)=>{
    startWolfCreekMove(target, srcZ, srcR, srcC, card);
  }, function(cell){ return cell && cell.owner===cp && cell.iid!==card.iid && cell.type!=='Supporter' && !cell.cantBeMoved; });
}

// ALPINE Expeditionary (73): move once per turn to open square on your side
function activateExpeditionaryMove(card, z, r, c) {
  var cp = G.currentPlayer;
  if(typeof showEffectActivationGlow === 'function') showEffectActivationGlow(z, r, c, card);
  toast('Click any open square on your side to move ALPINE Expeditionary');
  G._expMoving = {card:card, fromZ:z, fromR:r, fromC:c};
  for(var zz=0;zz<3;zz++){
    G.board[zz].forEach(function(row,rr){row.forEach(function(cell,cc){
      if(!cell && !isBlocked(zz,rr,cc)){
        var rowOwner = rr===0?1:rr===1?-1:rr===2?0:cp;
        if(rowOwner===cp || rowOwner===-1){
          var el=document.querySelector('[data-z="'+zz+'"][data-r="'+rr+'"][data-c="'+cc+'"]');
          if(el) el.classList.add('placeable','move-target');
        }
      }
    });});
  }
  if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function') {
    window.FateMatchRendererAdapter.scheduleRender('square-selection-state');
  }
}

function activateBusserMove(card, fromZ, fromR, fromC) {
  var cp = typeof card._busserOwner === 'number' ? card._busserOwner : G.currentPlayer;
  var ownerSafeRow = cp === 0 ? 2 : 0;
  // Adjacent zones are fromZ-1 and fromZ+1
  var adjZones = [];
  if(fromZ > 0) adjZones.push(fromZ - 1);
  if(fromZ < 2) adjZones.push(fromZ + 1);
  toast('Click an open square in an adjacent zone to move ' + card.name);
  G._busserMovingCard = {card:card, fromZ:fromZ, fromR:fromR, fromC:fromC};
  var found = false;
  adjZones.forEach(function(zz){
    G.board[zz].forEach(function(row,rr){row.forEach(function(cell,cc){
      // Only contested row (1) or owner's safe row, NOT opponent's safe row
      if(rr !== 1 && rr !== ownerSafeRow) return;
      if(!cell && !isBlocked(zz,rr,cc)){
        var el = document.querySelector('[data-z="'+zz+'"][data-r="'+rr+'"][data-c="'+cc+'"]');
        if(el){ el.classList.add('placeable','move-target'); found = true; }
      }
    });});
  });
  if(!found){
    toast('No open squares in adjacent zones!');
    G._busserMovingCard = null;
  } else if(typeof showEffectActivationGlow === 'function') {
    showEffectActivationGlow(fromZ, fromR, fromC, card);
  }
}

// ══════════════════════════════════════════════════════════════
//  REACTION SYSTEM (Havano Citizen 79, Lydia 56)
// ══════════════════════════════════════════════════════════════

function getSupporterEffectAffectedOwners(inst, z, r, c, cp, opp) {
  if(!inst) return [];
  const affectsOpponent = new Set(['16','26','31','50','61','62','64','71','72','73','75','76','77','80']);
  const affectsBoth = new Set(['18']);
  if(affectsBoth.has(inst.id)) return [0,1];
  if(affectsOpponent.has(inst.id)) return [opp];
  return [];
}

function actionAffectsPlayerCards(actionData, player) {
  if(!actionData) return false;
  if(Array.isArray(actionData.affectedOwners) && actionData.affectedOwners.includes(player)) return true;
  if(actionData.target && actionData.target.owner === player) return true;
  if(Array.isArray(actionData.targets)) {
    return actionData.targets.some(function(t){
      const card = t && (t.card || t);
      return card && card.owner === player;
    });
  }
  return false;
}

function checkReactions(actionType, actionData) {
  return new Promise(function(resolve) {
    var cp = G.currentPlayer;
    var opp = 1 - cp;
    if(G._skipReactions){ resolve(true); return; }

    var reactions = [];

    // Lydia (56): negate opponent Supporter when-set effects
    if(actionType === 'supporter_effect'){
      forEachBoardCard(function(card2, z2, r2, c2) {
        if(card2.id==='56' && (card2.usesLeft === null || card2.usesLeft === undefined)) card2.usesLeft = 5;
        if(card2.id==='56' && card2.owner===opp && card2.usesLeft > 0 && !card2.immuneFlag && !isFaceDownCard(card2)){
          reactions.push({type:'lydia', card:card2, z:z2, r:r2, c:c2});
        }
      });
    }

    // Havano Citizen (79): only reacts when an opponent effect affects your cards.
    if(actionType === 'targeting_effect' || actionAffectsPlayerCards(actionData, opp)){
      G.players[opp].hand.forEach(function(h) {
        if(h.id==='79') reactions.push({type:'havano', card: h});
      });
    }

    if(reactions.length === 0){ resolve(true); return; }

    // AI auto-reacts
    var isAI = G.aiEnabled && opp === G.aiPlayer;
    if(isAI){
      Promise.resolve(executeReaction(reactions[0], actionData)).then(function(){ resolve(false); });
      return;
    }

    var reaction = reactions[0];
    var cardName = actionData.card ? actionData.card.name : 'an effect';
    var reactorName = reaction.card.name;
    var reactorImg = reaction.card.img ? '<img src="'+reaction.card.img+'" alt="'+escapeHtml(reactorName)+'">' : '';
    var lydiaInfo = reaction.type==='lydia' ? '<div class="reaction-uses">'+reaction.card.usesLeft+' uses remaining - costs 1 Fate</div>' : '';

    // 15-second timer for reaction decision
    var _reactionTimer = null;
    var _reactionCountdown = 15;
    var timerHtml = '<div id="reaction-timer" class="reaction-timer">'+_reactionCountdown+'s</div>';
    var finishReaction = function(allowed) {
      if(_reactionTimer) clearInterval(_reactionTimer);
      G._reactionPending = false;
      closeModal();
      resolve(allowed);
    };
    G._reactionPending = true;

    showModal(
      reactorName+' — React? ('+_reactionCountdown+'s)',
      '<div class="reaction-panel">'+
        '<div class="reaction-card-row">'+
          reactorImg+
          '<div class="reaction-copy">'+
            '<div class="reaction-kicker">Improvisor Reaction</div>'+
            '<div class="reaction-name">'+escapeHtml(reactorName)+'</div>'+
            '<div class="reaction-effect">'+escapeHtml(reaction.card.effect||'')+'</div>'+
          '</div>'+
        '</div>'+
        '<div class="reaction-prompt"><span>Opponent played</span><strong>'+escapeHtml(cardName)+'</strong><span>Negate it?</span></div>'+
        lydiaInfo+
        timerHtml+
      '</div>',
      [
        {label:'Allow', action:function(){ finishReaction(true); }},
        {label:'✦ Negate', pri:true, action:function(){
          if(_reactionTimer) clearInterval(_reactionTimer);
          G._reactionPending = false;
          closeModal();
          Promise.resolve(executeReaction(reaction, actionData)).then(function(){ resolve(false); });
        }}
      ]
    );

    // Start countdown — auto-allow if timer expires
    _reactionTimer = setInterval(function(){
      _reactionCountdown--;
      var timerEl = document.getElementById('reaction-timer');
      if(timerEl) timerEl.textContent = _reactionCountdown+'s';
      var titleEl = document.getElementById('modal-title');
      if(titleEl) titleEl.textContent = reactorName+' — React? ('+_reactionCountdown+'s)';
      if(_reactionCountdown <= 0){
        finishReaction(true); // auto-allow if timed out
      }
    }, 1000);
  });
}

function getHavanoDeploymentOptions(owner) {
  const safeRow = owner === 0 ? 2 : 0;
  const rows = new Set([1, safeRow]);
  const options = [];
  for(let z=0; z<3; z++) {
    const totalRows = G.board[z] ? G.board[z].length : 3;
    for(let r=0; r<totalRows; r++) {
      if(!rows.has(r)) continue;
      const rowCapacity = G.board[z] && G.board[z][r] ? G.board[z][r].length : 3;
      for(let c=0; c<rowCapacity; c++) {
        if(G.board[z][r] && G.board[z][r][c]===null && !isBlocked(z,r,c)) options.push({z,r,c});
      }
    }
  }
  return options;
}

function showHavanoDeploymentOptions(options) {
  clearPlaceHighlights();
  options.forEach(function(o){
    const el = document.querySelector('[data-z="'+o.z+'"][data-r="'+o.r+'"][data-c="'+o.c+'"]');
    if(el) el.classList.add('placeable');
  });
  [...new Set(options.map(o=>o.z))].forEach(function(zi){
    const zoneEl = document.querySelector('.zone[data-zone="'+zi+'"], .zone[data-z="'+zi+'"]') || document.querySelectorAll('#board .zone, .board .zone')[zi];
    if(zoneEl) zoneEl.classList.add('busser-zone-target');
  });
}

function beginHavanoDeployment(reaction, owner) {
  return new Promise(function(resolve){
    G.players[owner].hand = G.players[owner].hand.filter(function(c){return c.iid !== reaction.card.iid;});
    const inst = newInstance(reaction.card);
    inst.owner = owner;
    inst.currentFate = getPlacedCardFate(reaction.card);
    consumePendingPlacementFlags(reaction.card, inst);
    const options = getHavanoDeploymentOptions(owner);
    if(!options.length) {
      G.players[owner].discard.push(reaction.card);
      toast('Havano Citizen negated the effect! (no open square - discarded)');
      renderGame();
      resolve();
      return;
    }
    if(G.aiEnabled && owner === G.aiPlayer) {
      const o = options[0];
      G.board[o.z][o.r][o.c] = inst;
      triggerPlacementAnimation(inst, o.z, o.r, o.c);
      toast('Havano Citizen negated the effect and deployed to Zone '+(o.z+1)+'!');
      renderGame();
      resolve();
      return;
    }
    G._havanoDeploying = { inst, owner, options, resolve };
    G.placing = true;
    renderGame();
    showHavanoDeploymentOptions(options);
    toast('Choose where to deploy Havano Citizen');
    setHint('Havano Citizen: choose a highlighted contested or safe square.');
  });
}

function handleHavanoDeployClick(z,r,c) {
  const dep = G._havanoDeploying;
  if(!dep) return;
  const valid = dep.options.some(function(o){ return o.z===z && o.r===r && o.c===c; });
  if(!valid){ toast('Choose one of the highlighted Havano squares'); return; }
  if(G.board[z][r][c]!==null || isBlocked(z,r,c)){ toast('Cell is not open'); return; }
  G.board[z][r][c] = dep.inst;
  triggerPlacementAnimation(dep.inst, z, r, c);
  G._havanoDeploying = null;
  G.placing = false;
  clearPlaceHighlights();
  toast('Havano Citizen deployed to Zone '+(z+1)+'!');
  playSfx('zoneBlock');
  showBlockedAnimation('NEGATED by Havano Citizen!');
  renderGame();
  dep.resolve();
}

function executeReaction(reaction, actionData) {
  var opp = 1 - G.currentPlayer;
  if(reaction.type === 'lydia'){
    if(typeof showEffectActivationGlow === 'function') showEffectActivationGlow(reaction.z, reaction.r, reaction.c, reaction.card);
    reaction.card.usesLeft--;
    reaction.card.currentFate = Math.max(0, reaction.card.currentFate - 1);
    if(actionData.card && actionData.card.type === 'Supporter') actionData.card._lydiaSuppressed = true;
    toast('Lydia negated '+(actionData.card ? actionData.card.name : 'effect')+'! ('+reaction.card.usesLeft+' uses left)');
    log(opp===0?'p1':'p2', 'Lydia negated '+(actionData.card ? actionData.card.name : 'effect'));
    playSfx('zoneBlock');
    showBlockedAnimation('NEGATED by Lydia!');
    renderGame();
  } else if(reaction.type === 'havano'){
    playSfx('zoneBlock');
    log(opp===0?'p1':'p2', 'Havano Citizen negated and deployed');
    return beginHavanoDeployment(reaction, opp);
  }
}// Cards with when-set effects (global so runWhenSetEffect can reference it)
const WHEN_SET_IDS = new Set(['02','03','04','05','06','07','08','13','14','16','17','18','21','22','25','26','27','29','30','31','32','33','34','35','38','39','40','42','43','45','46','48','50','51','52','54','56','58','60','61','62','64','66','68','69','71','72','73','75','76','77','80','bh01','bh25']);
