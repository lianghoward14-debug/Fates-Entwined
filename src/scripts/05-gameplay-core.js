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

const FRENCH_FUSILIERS_COPYABLE_PASSIVE_IDS = new Set(['20','49','53','59','64','65','92','93']);

function getFrenchFusiliersCopiedPassiveId(card) {
  if(!card || String(card.id) !== '37') return '';
  const copiedId = card._copiedPassiveId || card.copiedPassiveId;
  return copiedId == null ? '' : String(copiedId);
}

function frenchFusiliersCopies(card, sourceId) {
  if(!card) return false;
  const wanted = String(sourceId);
  return String(card.id) === '37' && getFrenchFusiliersCopiedPassiveId(card) === wanted;
}

function cardActsAsPassive(card, sourceId) {
  if(!card) return false;
  if(card._effectNegatedByReaction || card._lydiaSuppressed) return false;
  const wanted = String(sourceId);
  return String(card.id) === wanted || frenchFusiliersCopies(card, wanted);
}

function canFrenchFusiliersCopyPassive(card) {
  if(!card || card.type !== 'Supporter' || isFaceDownCard(card)) return false;
  const id = String(card.id || '');
  if(id === '37' || !FRENCH_FUSILIERS_COPYABLE_PASSIVE_IDS.has(id)) return false;
  const text = String(card.effect || '');
  return /while\s+(this\s+card\s+is\s+)?on\s+the\s+field/i.test(text);
}

function chooseFrenchFusiliersPassive(inst, z) {
  const candidates = [];
  if(typeof forEachBoardCard === 'function') {
    forEachBoardCard(function(card, bz, r, c) {
      if(!card || card.iid === inst.iid) return;
      if(!canFrenchFusiliersCopyPassive(card)) return;
      if(isSupporterEffectSuppressed(card)) return;
      candidates.push({card:card, z:bz, r:r, c:c});
    });
  }
  if(!candidates.length) {
    toast('No Supporter on the field has a copyable while-on-field effect.');
    return;
  }
  const applyCopy = function(entry) {
    if(!entry || !entry.card) return;
    inst._copiedPassiveId = String(entry.card.id);
    inst._copiedPassiveName = entry.card.name || 'Supporter';
    inst._copiedPassiveEffect = entry.card.effect || '';
    inst.copiedPassiveId = inst._copiedPassiveId;
    inst.copiedPassiveName = inst._copiedPassiveName;
    toast('6th French Fusiliers copied ' + inst._copiedPassiveName + '.');
    applyContinuousEffects();
    renderGame({board:true, scores:true, topbar:true});
  };
  const cards = candidates.map(function(entry) { return entry.card; });
  if(typeof pickCardsVisual === 'function') {
    pickCardsVisual(cards, {
      title:'The Anchor of Verdun',
      subtitle:'Choose a Supporter with a while-on-field effect to copy.',
      maxCount:1,
      confirmLabel:'Copy Effect'
    }, function(chosen) {
      const selected = chosen && chosen[0];
      if(!selected) return;
      const idx = cards.indexOf(selected);
      if(idx >= 0) applyCopy(candidates[idx]);
    });
  } else {
    applyCopy(candidates[0]);
  }
}

function sameRiveraOwner(a, b) {
  const ai = coercePlayerIndex(a, null);
  const bi = coercePlayerIndex(b, null);
  if(ai !== null && bi !== null) return ai === bi;
  return String(a) === String(b);
}

function isRiveraEligibleCharacter(card) {
  return !!(card && card.type && (card.type !== 'Supporter' || (typeof isCardCharacterForRules === 'function' && isCardCharacterForRules(card, card.owner))));
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
      if(legacy && findRiveraSourceCard(key)) rawBuffs.push(Object.assign({sourceIid:key}, legacy));
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
  if(typeof applyPermanentEffectImmunity === 'function') applyPermanentEffectImmunity(inst);
  if(typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(inst)) return false;
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
    inst.currentFate = Math.max(0, before + 4);
    inst._riveraAppliedBuffs[key] = true;
    inst._riveraFateBonus = (Number(inst._riveraFateBonus) || 0) + 4;
    applied = true;
  });

  if(applied) {
    toast(inst.name + ' gains 4 Fate from Rivera!');
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
function isTurnEndDeferrableModalOpen() {
  if(typeof document === 'undefined' || typeof G === 'undefined' || !G) return false;
  if(G._deferredEndTurnExecuting || G._onlineApplyingRemoteAction || G._aiRunning) return false;
  const gameActive = !!document.getElementById('s-game')?.classList.contains('active');
  const modalOpen = !!document.getElementById('modal')?.classList.contains('on');
  if(!gameActive || !modalOpen) return false;
  if(G._isSpectator || G._onlineRole === 'spectator') return false;
  if(G._onlineRoomCode && Number.isInteger(G._onlinePlayerIndex) && G.currentPlayer !== G._onlinePlayerIndex) return false;
  if(!G._onlineRoomCode) {
    if(G.aiEnabled && G.currentPlayer === G.aiPlayer) return false;
    const viewer = typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : G.currentPlayer;
    if(Number.isInteger(viewer) && G.currentPlayer !== viewer) return false;
  }
  return true;
}

function setDeferredEndTurnUi(active) {
  const endBtn = document.getElementById('btn-end-turn');
  if(endBtn) {
    endBtn.dataset.deferredTurnEnd = active ? '1' : '';
    endBtn.disabled = !!active;
    endBtn.textContent = active ? 'Finish Window' : 'End Turn';
  }
  const hint = document.getElementById('act-hint');
  if(active && hint) hint.textContent = 'Finish the open window to end the turn';
}

function deferTurnEndUntilModalComplete(reason) {
  if(!isTurnEndDeferrableModalOpen()) return false;
  if(!G._deferredEndTurn) {
    G._deferredEndTurn = {
      player:G.currentPlayer,
      turn:G.turn,
      reason:reason || 'modal'
    };
    if(typeof stopTurnTimer === 'function') stopTurnTimer();
    toast('Finish the open window before the turn ends.');
  }
  setDeferredEndTurnUi(true);
  return true;
}

function closeEndTurnWarningModalForTimeout() {
  if(typeof document === 'undefined') return false;
  const modalEl = document.getElementById('modal');
  const modalBox = document.querySelector('#modal .modal');
  if(!modalEl || !modalBox || !modalEl.classList.contains('on') || !modalBox.classList.contains('end-turn-warning-modal')) return false;
  if(typeof closeModal === 'function') closeModal();
  else {
    modalEl.classList.remove('on');
    modalBox.classList.remove('end-turn-warning-modal');
  }
  if(typeof G !== 'undefined' && G) G._deferredEndTurn = null;
  setDeferredEndTurnUi(false);
  return true;
}

function maybeCompleteDeferredTurnEnd(trigger) {
  if(typeof G === 'undefined' || !G || !G._deferredEndTurn || G._deferredEndTurnExecuting) return false;
  const pending = G._deferredEndTurn;
  setTimeout(function(){
    if(!G || !G._deferredEndTurn || G._deferredEndTurnExecuting) return;
    const modalStillOpen = !!document.getElementById('modal')?.classList.contains('on');
    if(modalStillOpen) return;
    if(G.currentPlayer !== pending.player || G.turn !== pending.turn) {
      G._deferredEndTurn = null;
      setDeferredEndTurnUi(false);
      return;
    }
    G._deferredEndTurn = null;
    G._deferredEndTurnExecuting = true;
    setDeferredEndTurnUi(false);
    try {
      endTurn();
    } finally {
      G._deferredEndTurnExecuting = false;
    }
  }, 0);
  return true;
}

window.isTurnEndDeferrableModalOpen = isTurnEndDeferrableModalOpen;
window.deferTurnEndUntilModalComplete = deferTurnEndUntilModalComplete;
window.maybeCompleteDeferredTurnEnd = maybeCompleteDeferredTurnEnd;

function getCurrentActionPlayerForEndTurnWarning() {
  if(!G || G.phase !== 'main') return null;
  if(G._isSpectator || G._onlineRole === 'spectator') return null;
  if(G._onlineRoomCode) {
    const idx = Number.isInteger(G.localPlayerIndex) ? G.localPlayerIndex : G._onlinePlayerIndex;
    return Number.isInteger(idx) && idx === G.currentPlayer ? idx : null;
  }
  if(G.aiEnabled && (G.currentPlayer === G.aiPlayer || G._aiRunning)) return null;
  const viewer = typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : G.currentPlayer;
  return Number.isInteger(viewer) && viewer === G.currentPlayer ? viewer : G.currentPlayer;
}

function pushEndTurnEffectWarning(list, card, label, zone) {
  if(!card || !label) return;
  if(String(card.id || '') === '70' && card.guerilla_transferred === true) return;
  const key = (card.iid || card.id || card.name || list.length) + ':' + label;
  if(list.some(entry => entry.key === key)) return;
  list.push({
    key,
    name: card.name || 'Card',
    label,
    zone: Number.isInteger(zone) ? zone + 1 : null
  });
}

function collectPendingCardWindowEffectsForEndTurn(player) {
  const pending = [];
  if(player !== 0 && player !== 1) return pending;
  if(typeof forEachBoardCard === 'function') {
    forEachBoardCard(function(card, z, r, c) {
      if(!card || card.owner !== player || isFaceDownCard(card)) return;
      const canUseBoardCard = G.currentPlayer === player && G.phase === 'main';
      if(!canUseBoardCard) return;
      const hasPendingSet = typeof canActivatePendingWhenSetEffect === 'function'
        && canActivatePendingWhenSetEffect(card, z, r, c, player);
      if(hasPendingSet) {
        pushEndTurnEffectWarning(pending, card, 'Activate Effect', z);
        return;
      }
      if(typeof shouldShowManualCharacterEffectButton === 'function' && shouldShowManualCharacterEffectButton(card)) {
        pushEndTurnEffectWarning(pending, card, 'Activate Effect', z);
      }
      if(card.type === 'Supporter') {
        const suppressed = typeof isSupporterEffectSuppressed === 'function' && isSupporterEffectSuppressed(card);
        if(!suppressed) {
          if(card.id === '52' && !card.vigilanteUsed) pushEndTurnEffectWarning(pending, card, 'Marked for Death', z);
          if(card.id === '54' && !card.wolfCreekUsed) pushEndTurnEffectWarning(pending, card, 'Elusive Movements', z);
          if(card.id === '73' && card._canMoveOncePerTurn && !card._expMoved) pushEndTurnEffectWarning(pending, card, 'Move', z);
          if(card._busserMoves > 0 && !card._busserMovedThisTurn && !card.cantBeMoved && !card.immuneFlag && card.id !== '76') pushEndTurnEffectWarning(pending, card, 'Move to Adjacent Zone', z);
          if((card.id === '93' || (typeof frenchFusiliersCopies === 'function' && frenchFusiliersCopies(card, '93'))) && !card.effectUsedThisTurn) {
            pushEndTurnEffectWarning(pending, card, 'Snowball Fight', z);
          }
        }
      }
      if(typeof isLandscapeActive === 'function'
        && isLandscapeActive('igb7')
        && card.aff === 'eventide'
        && card._landscapeEventideMovedTurn !== G.turn
        && !card.cantBeMoved
        && !(G._landscapeMoving && G._landscapeMoving.card === card)) {
        pushEndTurnEffectWarning(pending, card, 'Landscape Move', z);
      }
    });
  }
  const hand = G.players && G.players[player] && Array.isArray(G.players[player].hand) ? G.players[player].hand : [];
  hand.forEach(function(card) {
    if(!card) return;
    if(card.id === '70' && !card.guerilla_transferred) pushEndTurnEffectWarning(pending, card, 'Activate Effect', null);
    if(card.id === '74' && !(typeof isSupporterEffectSuppressed === 'function' && isSupporterEffectSuppressed(card))) {
      pushEndTurnEffectWarning(pending, card, 'Discard - Set 3 Supporters', null);
    }
  });
  return pending;
}

function escapeEndTurnWarningText(value) {
  return String(value ?? '').replace(/[&<>"']/g, function(ch) {
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch] || ch;
  });
}

function showEndTurnEffectWarning(effects) {
  const shown = effects.slice(0, 3);
  const more = Math.max(0, effects.length - shown.length);
  const listHtml = shown.map(function(entry) {
    const zone = entry.zone ? '<span>Zone ' + entry.zone + '</span>' : '<span>Hand</span>';
    return '<li><b>' + escapeEndTurnWarningText(entry.name) + '</b><em>' + escapeEndTurnWarningText(entry.label) + '</em>' + zone + '</li>';
  }).join('');
  const moreHtml = more ? '<div class="end-turn-warning-more">+' + more + ' more available</div>' : '';
  showModal('Unused Effect', '<div class="end-turn-warning-shell">' +
    '<div class="end-turn-warning-mark">!</div>' +
    '<div class="end-turn-warning-copy">' +
      '<p>You still have a card-window effect available.</p>' +
      '<ul>' + listHtml + '</ul>' +
      moreHtml +
    '</div>' +
  '</div>', [
    {label:'Go Back', pri:true, action:function(){ closeModal(); }},
    {label:'End Turn', danger:true, action:function(){ closeModal(); endTurn({skipEffectWarning:true}); }}
  ], {immediate:true, skipDecorate:true});
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox) modalBox.classList.add('end-turn-warning-modal');
}

function shouldWarnBeforeEndingTurn(opts) {
  if(opts && opts.skipEffectWarning) return false;
  if(!G || G._onlineApplyingRemoteAction || G._aiRunning) return false;
  const player = getCurrentActionPlayerForEndTurnWarning();
  if(player === null) return false;
  const effects = collectPendingCardWindowEffectsForEndTurn(player);
  if(!effects.length) return false;
  showEndTurnEffectWarning(effects);
  return true;
}

function endTurn(opts) {
  if(!(opts && opts.skipModalDeferral) && !G._deferredEndTurnExecuting && deferTurnEndUntilModalComplete('end-turn')) return false;
  if(typeof tutorialCanEndTurn === 'function' && !tutorialCanEndTurn()) return false;
  if(shouldWarnBeforeEndingTurn(opts)) return false;
  if(G._turnInputLockUntil && Date.now() < G._turnInputLockUntil) return;
  G._turnInputLockUntil = Date.now() + 350;
  if(typeof tutorialEvent==='function' && _tutorialActive) tutorialEvent('endTurn');
  if(typeof triggerAIDialogue==='function') triggerAIDialogue('turnStart');
  // Block human from ending turn while AI is actively running
  if(G._aiRunning) return;
  const hadPendingInteraction = !!(
    G._consolidating ||
    G._serverPendingMove ||
    G._serverPendingZonePick ||
    G._serverPendingCardPick ||
    G._serverPendingModalAction ||
    G._wolfCreekMoving ||
    G._expMoving ||
    G._berkeleyMoving ||
    G._bh01Moving ||
    G._landscapeMoving ||
    G._busserMoving ||
    G._busserMovingCard ||
    G._boardTargeting ||
    G.placing ||
    G.selectedHandCard !== null ||
    G.selectedBoardCard !== null
  );
  resetInteractionState();
  if(hadPendingInteraction){
    clearPlaceHighlights();
    setHint('Select a card to play');
    renderGame({board:true, hand:true, blocks:true, topbar:true});
  }

  const cp = G.currentPlayer;
  clearPendingWhenSetEffectsForPlayer(cp);
  G._skipImprovisorCheck = false;
  if(typeof resolveBalladEndOfTurn === 'function') resolveBalladEndOfTurn(cp);
  if(Array.isArray(G._landscapeChangeLocks)) {
    G._landscapeChangeLocks = G._landscapeChangeLocks.map(v=>Math.max(0, (Number(v) || 0) - 1));
  }

  if(typeof maybeResolveLandscapeEndTurn === 'function' && maybeResolveLandscapeEndTurn()) {
    return;
  }

  // Check win condition at end of turn 10
  if(G.turn >= G.maxTurns) {
    checkWin();
    return;
  }

  // Transition to next player
  const next = 1 - G.currentPlayer;
  if(window.FateVfxEventBridge && typeof window.FateVfxEventBridge.onAcceptedGameEvent === 'function'){
    window.FateVfxEventBridge.onAcceptedGameEvent({
      type:'TURN_END',
      payload:{
        player:cp,
        nextPlayer:next
      }
    });
  }
  // Online rooms are not a same-device handoff, so pass directly to the
  // replayed next turn instead of showing the local pass-turn overlay.
  if(G._onlineRoomCode){
    nextPlayerTurn();
  } else if(G.aiEnabled && (next===G.aiPlayer || G.currentPlayer===G.aiPlayer)){
    nextPlayerTurn();
  } else {
    showPassTurn(next);
  }
  return true;
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
  clearStalePendingWhenSetEffects();
  if(window.FateVfxEventBridge && typeof window.FateVfxEventBridge.onAcceptedGameEvent === 'function'){
    window.FateVfxEventBridge.onAcceptedGameEvent({
      type:'TURN_START',
      payload:{
        player:G.currentPlayer,
        turn:G.turn
      }
    });
  }
  G._turnInputLockUntil = Date.now() + 200;
  G.phase = 'main';
  G.supportsPlacedThisTurn = 0;
  G._consolidating = null;
  G._busserMoving = null;
  G._busserMovingCard = null;
  G._serverPendingMove = null;
  G._serverPendingZonePick = null;
  G._serverPendingCardPick = null;
  G._serverPendingModalAction = null;
  G._boardTargeting = null;
  G.placing = false;
  G.selectedHandCard = null;
  G.selectedBoardCard = null;
  // Lock initiator effects that were activated this turn
  G.board.forEach(function(zone){ zone.forEach(function(row){ if(row) row.forEach(function(cell){
    if(cell && cell.effectUsedInitial && !cell._effectTurnLocked) cell._effectTurnLocked = true;
  }); }); });
  G.extraSupportsThisTurn = 0;
  G.maxSupportsPerTurn = 2; // reset (Selva Islands Pirate may have changed it)
  if(Array.isArray(G._selvaSupportBoosts)) G._selvaSupportBoosts[G.currentPlayer] = null;
  if(typeof resetLandscapeSupporterEffectTurnCount === 'function') resetLandscapeSupporterEffectTurnCount(G.currentPlayer);
  if(typeof applyPendingSelvaSupportBoost === 'function') applyPendingSelvaSupportBoost(G.currentPlayer);

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
      if(Number(card._busserMoves||0)>0) card._busserMovedThisTurn = false;
      card._landscapeEventideMovedTurn = null;
    }
  });
  G._zimbabweUsedThisTurn = false;
  G._polishUsedThisTurn = false;
  tickRiveraBuffsForCurrentPlayer();
  if(typeof tickMailDeliveriesForCurrentPlayer === 'function') tickMailDeliveriesForCurrentPlayer();
  if(typeof tickCarpathianSpecters === 'function') tickCarpathianSpecters();
  if(typeof tickBlameGameForCurrentPlayer === 'function') tickBlameGameForCurrentPlayer();
  if(typeof tickWintertideForCurrentPlayer === 'function') tickWintertideForCurrentPlayer();

  // Wine Country Guerilla (70): tick down counter and debuff random card in holder's hand
  const currentPlayer = G.currentPlayer;
  const holderHand = G.players[currentPlayer].hand;
  const guerillaCards = holderHand.filter(c=>c.id==='70' && c.guerilla_transferred && c.guerilla_turnsLeft>0);
  guerillaCards.forEach(gc=>{
    // Pick a random non-guerilla card in this hand and reduce its fate by 2.
    const candidates = holderHand.filter(c=>c.iid!==gc.iid && c.id!=='70' && !(typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(c)));
    if(candidates.length>0){
      const rng = (typeof G._onlineRng === 'function') ? G._onlineRng : Math.random;
      const onlineIdx = deterministicOnlineRandomIndex(candidates.length, `wineCountryGuerilla:${gc.iid || gc.id || 'source'}`, currentPlayer);
      const target = candidates[onlineIdx >= 0 ? onlineIdx : Math.floor(rng()*candidates.length)];
      const before = Math.max(0, Number(target.currentFate ?? target.fate) || 0);
      target.currentFate = Math.max(0, before - 2);
      if(target.currentFate < before){
        if(typeof recordHandCardEffectModifier === 'function') {
          recordHandCardEffectModifier(target, {
            key:'wine-country-guerilla:' + (gc.iid || '70'),
            name:'Wine Country Guerilla',
            text:'A Gun Behind Every Grapevine: Fate reduced while this card infiltrates the hand.',
            fateDelta:target.currentFate - before
          });
        }
        if(typeof playFateChangeSound === 'function') playFateChangeSound(target, before, target.currentFate, currentPlayer);
        if(!G._continuousDamageSources) G._continuousDamageSources = new Set();
        const sourceOwner = (gc.guerilla_owner===0 || gc.guerilla_owner===1) ? gc.guerilla_owner : (1-currentPlayer);
        G._continuousDamageSources.add(sourceOwner+':70:'+gc.iid);
      }
      toast(`Wine Country Guerilla reduces ${target.name}'s Fate by 2!`);
      log(currentPlayer===0?'p1':'p2', `Wine Country Guerilla debuffed ${target.name} (-2 Fate)`);
      playSfx('debuff');
    }
    gc.guerilla_turnsLeft--;
    if(gc.guerilla_turnsLeft<=0){
      // Send to original owner's discard
      G.players[currentPlayer].hand = G.players[currentPlayer].hand.filter(c=>c.iid!==gc.iid);
      const origOwner = gc.guerilla_owner;
      fatePushDiscard(origOwner, gc);
      toast('Wine Country Guerilla returned to original owner\'s discard');
    }
  });
  renderHand();

  // Draw 1 card unless the current landscape skips this draw phase.
  if(typeof shouldSkipLandscapeDrawPhase === 'function' && shouldSkipLandscapeDrawPhase(G.currentPlayer)) {
    toast('Big Sur: draw phase skipped.');
    if(typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('Big Sur skipped draw phase', 'major');
    log('sys', 'Big Sur skipped P' + (G.currentPlayer + 1) + ' draw phase.');
  } else {
    await drawCard(G.currentPlayer, 1, { drawPhase: true });
  }

  // Phil (46) — Monarchist Manifesto: gains 2 Fate per draw phase after being set
  forEachBoardCard((card)=>{
    if(card.id==='46' && card.owner===G.currentPlayer && typeof card._philSetTurn==='number') {
      card.currentFate += 2;
      // Visual sparkle on Phil
      const cellEl = document.querySelector(`#board .cell[data-z][data-r][data-c]`);
      // Find Phil's cell for sparkle
      forEachBoardCard((c2,z2,r2,c2c)=>{
        if(c2.iid===card.iid){
          const el = document.querySelector(`#board .cell[data-z="${z2}"][data-r="${r2}"][data-c="${c2c}"]`);
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
      G._artilleryEffectBlockLifted = false;
    }
  }

  log('sys','Turn '+G.turn+' — '+G.players[G.currentPlayer].name);
  showTurnFlash();

  // Apply continuous effects
  applyContinuousEffects();

    renderGame({board:true, hand:true, scores:true, piles:true, oppHand:true, blocks:true, topbar:true});

  if(typeof tutorialOnTurnStart === 'function') tutorialOnTurnStart(G.currentPlayer);

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
    if(cardActsAsPassive(card, '20') && !isSupporterEffectSuppressed(card) && !G.shieldWallZones.includes(z)) G.shieldWallZones.push(z);
  });
  // Update cantBeMoved flags based on current shield wall zones
  forEachBoardCard((card, z)=>{
    if(G.shieldWallZones.includes(z)) card.cantBeMoved = true;
    else if(card.cantBeMoved) card.cantBeMoved = false;
  });

  if(typeof getLandscapeFateCapForZone === 'function') {
    forEachBoardCard((card, z)=>{
      const cap = getLandscapeFateCapForZone(z);
      if(cap == null) return;
      const before = Math.max(0, Number(card.currentFate ?? card.fate ?? 0) || 0);
      if(before > cap) card.currentFate = cap;
    });
  }

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
  if(!_tutorialActive && typeof isLandscapeActive === 'function' && isLandscapeActive('igb14')) return 25;
  return _tutorialActive ? 300 : TURN_TIME_LIMIT;
}

function isOnlineRemoteTurnTimer() {
  if(!G || !G._onlineRoomCode) return false;
  if(G._isSpectator || G._onlineRole === 'spectator') return true;
  if(G._onlinePlayerIndex === null || G._onlinePlayerIndex === undefined) return true;
  return Number(G.currentPlayer) !== Number(G._onlinePlayerIndex);
}

function isLocalPlayerActionTurn() {
  if(!G) return false;
  if(G._isSpectator || G._onlineRole === 'spectator') return false;
  if(G._onlineRoomCode) {
    if(G._onlinePlayerIndex === null || G._onlinePlayerIndex === undefined) return false;
    return Number(G.currentPlayer) === Number(G._onlinePlayerIndex);
  }
  if(G.aiEnabled && (G.currentPlayer === G.aiPlayer || G._aiRunning)) return false;
  const viewer = typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : G.currentPlayer;
  return !Number.isInteger(viewer) || Number(viewer) === Number(G.currentPlayer);
}

function isLocalConsolidationActive() {
  return !!(G && G._consolidating && isLocalPlayerActionTurn());
}

function getOnlineSyncedTurnRemaining(limit) {
  if(!G || !G._onlineRoomCode || !Number.isFinite(Number(G._turnStartedAt))) return null;
  const now = (typeof window !== 'undefined' && typeof window.fateAuthorityServerNow === 'function')
    ? window.fateAuthorityServerNow()
    : Date.now();
  const elapsed = Math.floor((now - Number(G._turnStartedAt)) / 1000);
  if(elapsed < 0) return null;
  return Math.max(0, Math.min(limit, limit - elapsed));
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
  G._artilleryEffectBlockLifted = false;
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
  const limit = getTurnTimeLimit();
  _turnTimerRemaining = limit;
  const syncedRemaining = getOnlineSyncedTurnRemaining(limit);
  if(syncedRemaining !== null) _turnTimerRemaining = Math.max(1, syncedRemaining);
  _lastTurnWarnSecond = null;
  updateTimerDisplay();
  _turnTimerInterval = setInterval(()=>{
    const liveSyncedRemaining = getOnlineSyncedTurnRemaining(limit);
    _turnTimerRemaining = liveSyncedRemaining !== null ? liveSyncedRemaining : (_turnTimerRemaining - 1);
    updateTimerDisplay();
    if(_turnTimerRemaining <= 0){
      stopTurnTimer();
      if(isOnlineRemoteTurnTimer()) {
        updateTimerDisplay();
        return;
      }
      toast("Time's up! Turn auto-ended.");
      const closedEndTurnWarning = closeEndTurnWarningModalForTimeout();
      endTurn({skipEffectWarning:true, skipModalDeferral:closedEndTurnWarning});
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
      if(!isOnlineRemoteTurnTimer() && typeof playSfx === 'function') playSfx('timerWarn');
      showTurnTimerWarning(_turnTimerRemaining);
    }
  } else if(_turnTimerRemaining <= 30){
    setTimerState('warning');
  } else {
    setTimerState('');
  }
}

function syncTurnTimerToCurrentLimit() {
  if(!_turnTimerInterval) return;
  _turnTimerRemaining = getTurnTimeLimit();
  _lastTurnWarnSecond = null;
  updateTimerDisplay();
}
window.syncTurnTimerToCurrentLimit = syncTurnTimerToCurrentLimit;

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
    renderGame({board:true, hand:true, blocks:true, topbar:true});
  }
  const player = G.players[G.currentPlayer];
  const card = player.hand[idx];
  if(!card) return;
  if(typeof tutorialCanSelectHandCard === 'function' && !tutorialCanSelectHandCard(card)) return;

  // Wine Country Guerilla (70): before infiltration, it is manually activated from the hand detail window.
  // After infiltration, it is view-only and cannot be set.
  if(card.id==='70' && card.guerilla_transferred){
    G.selectedHandCard = idx;
    renderHand();
    if(typeof playSfx === 'function') playSfx('cardSelect');
    openCardDetail(card, true, false);
    toast(card.name + ' cannot be set - it\'s debuffing your hand!');
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
  if(typeof playSfx === 'function') playSfx('cardSelect');
  openCardDetail(card, true);
}

function placeSelected() {
  if(G.selectedHandCard===null) {toast('Select a card from your hand first');return;}
  const player = G.players[G.currentPlayer];
  const card = player.hand[G.selectedHandCard];
  if(!card) return;
  if(typeof tutorialCanStartHandAction === 'function' && !tutorialCanStartHandAction(card, 'place')) return;

  // Free-set effects skip reinforcement/supporter limits, but still obey board placement rules.
  const isLinaFree = !!(card._linaFree || (G._linaFreeIids && G._linaFreeIids.has(card.iid)));

  if(card.id==='70' && card.guerilla_transferred){
    toast(card.name + ' cannot be set - it is debuffing this hand.');
    G.placing = false;
    return;
  }

  if(!isLinaFree && card.type==='Supporter') {
    const totalSupports = G.supportsPlacedThisTurn;
    const maxSup = G.maxSupportsPerTurn + G.extraSupportsThisTurn;
    // Maja Kaminska effect: unlimited supporters
    if(G.majaEffectThisTurn) {} // allow
    else if(totalSupports >= maxSup) {
      toast('You cannot set another Supporter this turn ('+maxSup+'/'+maxSup+').');
      return;
    }
  }

  G.placing = true;
  closeModal();
  if(!highlightValidCells(card)){
    G.placing = false;
    toast('No open squares available for ' + card.name);
    return;
  }
  setHint('Choose a cell to place '+card.name);
}

function zoneHasFriendlyCharacter(z, owner, excludeIids) {
  let found = false;
  const excluded = excludeIids instanceof Set ? excludeIids : new Set();
  G.board[z].forEach(row=>row.forEach(cell=>{
    if(cell && cell.owner === owner && (typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(cell, owner) : cell.type !== 'Supporter') && !excluded.has(cell.iid)) found = true;
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
  const cardIsCharacter = typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(card, owner) : !!(card && card.type !== 'Supporter');
  if(!card || !cardIsCharacter) return '';
  if(card.id === '45' && zoneHasFriendlyCharacter(z, owner, excludeIids)) {
    return 'Chingachlook can only be set in a zone with no other friendly characters';
  }
  if(card.id !== '45' && zoneHasFriendlyChingachlook(z, owner, excludeIids)) {
    return 'Chingachlook forbids other characters in this zone';
  }
  return '';
}

function getValidPlacementOptionsForCard(card, player) {
  const options = [];
  if(!card || typeof player !== 'number') return options;
  for(let z=0;z<3;z++) {
    // Artillery Distance (50): zone locked for this player
    if(typeof G._artilleryLockedZone==='number' && G._artilleryLockedZone===z && G._artilleryLockOwner===player && G._artilleryLockTurnsLeft>0) continue;
    const totalRows = 3 + ((G.extraRows && G.extraRows[z]) || 0);
    if(getChingachlookPlacementBlockReason(card, z, player)) continue;
    for(let r=0;r<totalRows;r++) {
      // Row 0 = p2 safe, Row 1 = contested, Row 2 = p1 safe, Row 3+ = extra safe
      let rowOwner;
      if(r===0) rowOwner=1;
      else if(r===1) rowOwner=-1; // contested
      else if(r===2) rowOwner=0;
      else {
        rowOwner = typeof getExtraSafeRowOwner === 'function' ? getExtraSafeRowOwner(z, r) : 0;
      }
      const cp = player;
      if(rowOwner!==-1 && rowOwner!==cp) continue;
      if(r>=3 && typeof isPlayableSafeSquare === 'function' && !isPlayableSafeSquare(z,r,0,cp)) {
        const anyPlayable = [0,1,2].some(cc => isPlayableSafeSquare(z,r,cc,cp));
        if(!anyPlayable) continue;
      }
      if(card.contestedOnly && r!==1) continue;
      if(!G.board[z][r]) continue;
      const baseCols = 3;
      const extraRow = r<3 ? (G.extraCells?.[z]?.[r] || null) : null;
      const extraP1 = extraRow?(extraRow.p1||0):0;
      const extraP2 = extraRow?(extraRow.p2||0):0;
      const totalCols = baseCols + (cp===0?extraP1:extraP2);
      for(let c=0;c<totalCols;c++) {
        if(r>=3 && typeof isPlayableSafeSquare === 'function' && !isPlayableSafeSquare(z,r,c,cp)) continue;
        if(isBlocked(z,r,c)) continue;
        if(G.board[z][r][c]!==null) continue;
        if(card.type==='Supporter' && card.id!=='76' && isBlockedByAlondra(z,r,c,cp)) continue;
        options.push({z,r,c});
      }
    }
  }
  return options;
}

function getSquareRowOwner(z, r) {
  if(r === 0) return 1;
  if(r === 1) return -1;
  if(r === 2) return 0;
  if(typeof getExtraSafeRowOwner === 'function') return getExtraSafeRowOwner(z, r);
  return 0;
}

function isOwnSafeRowSquare(z, r, c, player) {
  const owner = getSquareRowOwner(z, r);
  if(owner !== player) return false;
  if(r >= 3 && typeof isPlayableSafeSquare === 'function') return isPlayableSafeSquare(z, r, c, player);
  return owner !== -1;
}

function isContestedOrOwnSafeSquare(z, r, c, player) {
  const owner = getSquareRowOwner(z, r);
  if(owner === -1) return true;
  if(owner !== player) return false;
  if(r >= 3 && typeof isPlayableSafeSquare === 'function') return isPlayableSafeSquare(z, r, c, player);
  return true;
}

function highlightValidCells(card, extraClass) {
  clearPlaceHighlights();
  const classes = ['placeable'];
  if(extraClass) classes.push(extraClass);
  const options = getValidPlacementOptionsForCard(card, G.currentPlayer);
  const tutorialTarget = typeof tutorialCurrentTargetSquare === 'function' ? tutorialCurrentTargetSquare() : null;
  options.forEach(function(o){
    const cellEl = document.querySelector(`#board .cell[data-z="${o.z}"][data-r="${o.r}"][data-c="${o.c}"]`);
    if(cellEl) {
      cellEl.classList.add.apply(cellEl.classList, classes);
      if(tutorialTarget && Number(tutorialTarget.z) === Number(o.z) && Number(tutorialTarget.r) === Number(o.r) && Number(tutorialTarget.c) === Number(o.c)) {
        cellEl.classList.add('tutorial-target-square');
      }
    }
  });
  return options.length;
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
  document.querySelectorAll('#board .cell.placeable,#board .cell.move-target,#board .cell.landscape-move-target').forEach(el=>el.classList.remove('placeable','move-target','landscape-move-target'));
  document.querySelectorAll('#board .cell.block-target-choice,#board .cell.carolyn-block-choice,#board .cell.zoe-block-choice,#board .cell.havano-deploy-choice,#board .cell.free-placement-choice,#board .cell.tutorial-target-square').forEach(el=>el.classList.remove('block-target-choice','carolyn-block-choice','zoe-block-choice','havano-deploy-choice','free-placement-choice','tutorial-target-square'));
  document.querySelectorAll('#board .zone.busser-zone-target').forEach(el=>el.classList.remove('busser-zone-target'));
  if(typeof rendererV2OwnsBoardScene === 'function' && rendererV2OwnsBoardScene()) return;
  document.querySelectorAll('#board .bc.tribute-available,#board .bc.tribute-selected,#board .bc.tribute-ready').forEach(el=>{
    el.classList.remove('tribute-available','tribute-selected','tribute-ready');
  });
  document.querySelectorAll('#board .cell.tribute-cell-available,#board .cell.tribute-cell-selected,#board .cell.tribute-cell-ready').forEach(el=>{
    el.classList.remove('tribute-cell-available','tribute-cell-selected','tribute-cell-ready');
    el.removeAttribute('data-tribute-label');
  });
}


function clearBoardTargetSelection() {
  if(typeof document !== 'undefined') {
    document.querySelectorAll('#board .cell.board-target-choice,#board .bc.board-target-choice-card').forEach(function(el){
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
  renderGame({board:true, blocks:true});
  targets.forEach(function(t){
    const cellEl = document.querySelector('#board .cell[data-z="'+t.z+'"][data-r="'+t.r+'"][data-c="'+t.c+'"]');
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
    if(cell && cell.owner===opp && !(typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(cell))) oppCards.push({card:cell,z:targetZ,r:ri,c:ci});
  }));
  if(oppCards.length===0){toast('No opponent cards in Zone '+(targetZ+1));return;}
  pickCardInZone(targetZ,'Marked for Death: select one opponent card in this zone.',(tgt)=>{
    if(typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(tgt)){showBlockedAnimation('this card is immune');return;}
    tgt._markedForDeath = true;
    tgt._reinforcementOverride = 0;
    if(inst) inst.vigilanteUsed = true;
    toast(tgt.name+' has 0 Reinforcement.');
    log(cp===0?'p1':'p2','Vigilantes marked '+tgt.name+' for death');
    renderGame({board:true, scores:true, topbar:true});
  }, cell=>cell && cell.owner===opp && !(typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(cell)));
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
  if(G._actionPresentationActive) return;
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
    handleConsolidateClick(z,r,c);
    return;
  }
  // Handle Zoe's blocking effect (zone-specific) or Carolyn's (any zone)
  if(G.blockingCell) {
    const blockZ = window._blockZone===-1 ? z : window._blockZone;
    const blockType = window._blockZone===-1 ? 'carolyn' : 'zoe';
    const owner = G.currentPlayer;
    const blockedPlayer = blockType === 'zoe' ? 1 - owner : null;
    const occupiedCell = !!(G.board && G.board[blockZ] && G.board[blockZ][r] && G.board[blockZ][r][c]);
    if(blockType === 'zoe' && z !== blockZ) {
      toast('Zoe can only block a square in her zone');
      playSfx('blocked');
      return;
    }
    if(blockType === 'zoe' && typeof isZoeBlockTargetAllowed === 'function' && !isZoeBlockTargetAllowed(blockZ, r, c, owner)) {
      toast('Zoe can only block the contested row or your opponent\'s safe row');
      playSfx('blocked');
      return;
    }
    if(blockType === 'carolyn' && occupiedCell) {
      toast('Carolyn can only lock an empty square');
      playSfx('blocked');
      return;
    }
    if(blockType === 'carolyn' && isOwnSafeRowSquare(blockZ, r, c, owner)) {
      toast('Carolyn cannot lock your own safe row');
      playSfx('blocked');
      return;
    }
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
    if(G._blockingEffectSourceIid) {
      markInitialEffectResolvedByIid(G._blockingEffectSourceIid);
      G._blockingEffectSourceIid = null;
    }
    renderGame({board:true, blocks:true, topbar:true});return;
  }
  function _cleanupMarkPreCreatedZones(chosenZone){
    if(!G._markPreCreatedZones) return;
    G._markPreCreatedZones.forEach(function(mz){
      if(mz === chosenZone) return;
      if(G.extraRows[mz] !== 1) return;
      if(G.extraRowOwners && G.extraRowOwners[mz] && G.extraRowOwners[mz].some(function(owner){ return typeof owner === 'number'; })) return;
      if(typeof isMarkSafeSquare === 'function' && [0,1,2].some(function(cc){ return isMarkSafeSquare(mz, 3, cc); })) return;
      var row3 = G.board[mz][3];
      var empty = !row3 || row3.every(function(c){ return c === null; });
      if(empty){
        G.extraRows[mz] = 0;
        if(G.extraRowOwners && G.extraRowOwners[mz]) G.extraRowOwners[mz].splice(0, 1);
        if(G.extraRowFullOwners) G.extraRowFullOwners[mz] = null;
        if(G.board[mz][3]) G.board[mz].splice(3, 1);
      }
    });
    delete G._markPreCreatedZones;
  }
  if(G._markSelecting) {
    const sel = G._markSelecting;
    const markSnap = G._markViewportSnap || {
      board: typeof getBoardScrollSnapshot === 'function' ? getBoardScrollSnapshot() : null,
      zones: typeof captureZoneRowScrollSnapshots === 'function' ? captureZoneRowScrollSnapshots() : null
    };
    if(sel.player !== G.currentPlayer){
      G._markSelecting = null;
      _cleanupMarkPreCreatedZones(-1);
      return;
    }
    if(typeof sel.zone === 'number' && z !== sel.zone){
      toast('Choose a highlighted safe-square slot in Zone ' + (sel.zone + 1));
      return;
    }
    const expectedMarkRow = typeof getNextExtraRowIndex === 'function' ? getNextExtraRowIndex(z) : 3;
    const markRowCapacity = G.board && G.board[z] && G.board[z][expectedMarkRow] ? G.board[z][expectedMarkRow].length : 3;
    if(r !== expectedMarkRow || c < 0 || c >= markRowCapacity){
      toast('Choose one of the highlighted safe-square slots');
      return;
    }
    if(typeof isMarkSafeSquare === 'function' && isMarkSafeSquare(z,r,c)){
      toast('That safe square is already available');
      return;
    }
    const added = typeof addBottomSafeSquareForPlayer === 'function' ? addBottomSafeSquareForPlayer(z, G.currentPlayer, c) : null;
    G._markSelecting = null;
    G._markViewportSnap = null;
    G.placing = false;
    clearPlaceHighlights();
    _cleanupMarkPreCreatedZones(z);
    if(!added){ toast('Could not add that safe square'); renderGame({board:true, scores:true, topbar:true}); return; }
    if(sel.sourceIid) markInitialEffectResolvedByIid(sel.sourceIid);
    toast(`Added one safe square to Zone ${z+1}`);
    log(G.currentPlayer===0?'p1':'p2', `Mark Kemper added one safe square to Zone ${z+1}`);
    renderGame({board:true, scores:true, topbar:true});
    restoreMarkViewportSnapshotRepeated(markSnap);
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
    renderGame({board:true, scores:true, blocks:true, topbar:true});
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
    renderGame({board:true, scores:true, blocks:true, topbar:true}); return;
  }
  if(G._landscapeMoving) {
    const mv = G._landscapeMoving;
    const valid = mv.options && mv.options.some(o=>o.z===z&&o.r===r&&o.c===c);
    if(!valid){toast('Choose a highlighted landscape move square');return;}
    if(G.board[z][r][c]!==null){toast('Cell is occupied');return;}
    if(mv.card.cantBeMoved){toast('This card cannot be moved');return;}
    G.board[mv.fromZ][mv.fromR][mv.fromC] = null;
    mv.card._landscapeEventideMovedTurn = G.turn;
    G.board[z][r][c] = mv.card;
    G._landscapeMoving = null;
    G.placing = false;
    clearPlaceHighlights();
    triggerRozsiPassive(mv.card, z);
    toast('Landscape movement: ' + mv.card.name + ' moved.');
    if(typeof playSfx === 'function') playSfx('cardMove');
    if(typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('Panacea movement');
    renderGame({board:true, scores:true, blocks:true, landscape:true, topbar:true});
    return;
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
    if(typeof renderBoardActionForPlayer === 'function') renderBoardActionForPlayer(G.currentPlayer, {hand:true, piles:true});
    else renderGame({board:true, hand:true, scores:true, piles:true, blocks:true, topbar:true});
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
      renderGame({board:true, blocks:true, topbar:true});
      return;
    }
    const valid = !mv.options || mv.options.some(o=>o.z===z && o.r===r && o.c===c);
    if(!valid){toast('Choose one of the highlighted Wolf Creek squares');return;}
    if(G.board[z][r][c]!==null || isBlocked(z,r,c)){toast('Cell is occupied');return;}
    const wcOwner = mv.wolfCreekCard && typeof mv.wolfCreekCard.owner === 'number' ? mv.wolfCreekCard.owner : (mv.card && typeof mv.card.owner === 'number' ? mv.card.owner : G.currentPlayer);
    if(typeof isContestedOrOwnSafeSquare === 'function' && !isContestedOrOwnSafeSquare(z, r, c, wcOwner)){
      toast('Wolf Creek can only move into contested rows or your own safe squares');
      playSfx('blocked');
      return;
    }
    G.board[mv.fromZ][mv.fromR][mv.fromC] = null;
    G.board[z][r][c] = mv.card;
    if(mv.wolfCreekCard) mv.wolfCreekCard.wolfCreekUsed = true;
    G._wolfCreekMoving = null;
    G.placing = false;
    clearPlaceHighlights();
    triggerRozsiPassive(mv.card, z); // Rozsi: +2 fate on move into zone
    toast(mv.card.name+' moved!');
    if(typeof playSfx === 'function') playSfx('cardMove');
    if(typeof updateDailyChallengeProgress === 'function') updateDailyChallengeProgress('effects', 1, 'add');
    renderGame({board:true, scores:true, blocks:true, topbar:true});
    return;
  }
  // Handle ALPINE Expeditionary (73) movement
  // Busser movement: move card to adjacent zone
  if(G._busserMovingCard) {
    if(G.board[z][r][c]!==null){toast('Cell is occupied');return;}
    const mv = G._busserMovingCard;
    const cp = typeof mv.card._busserOwner === 'number' ? mv.card._busserOwner : G.currentPlayer;
    const ownerSafeRow = cp === 0 ? 2 : 0;
    if(mv.card.cantBeMoved || mv.card.immuneFlag || mv.card.id==='76'){toast('This card cannot be moved');G._busserMovingCard=null;return;}
    if(Number(mv.card._busserMoves||0)<=0){toast('No Busser moves remaining');G._busserMovingCard=null;return;}
    if(mv.card._busserMovedThisTurn){toast('This card already moved this turn');G._busserMovingCard=null;return;}
    // Validate: must be contested row or owner's safe row in adjacent zone
    if(r !== 1 && r !== ownerSafeRow){toast('Can only move to contested row or your safe row');return;}
    const adjZones = [];
    if(mv.fromZ > 0) adjZones.push(mv.fromZ - 1);
    if(mv.fromZ < 2) adjZones.push(mv.fromZ + 1);
    if(!adjZones.includes(z)){toast('Must move to an adjacent zone');return;}
    G.board[mv.fromZ][mv.fromR][mv.fromC] = null;
    G.board[z][r][c] = mv.card;
    mv.card._busserMovedThisTurn = true;
    mv.card._busserMoves = Math.max(0, (Number(mv.card._busserMoves||0)||0) - 1);
    if(mv.card._busserMoves <= 0){
      mv.card._busserMoves = 0;
      mv.card._busserOwner = null;
      mv.card._busserSourceIid = null;
    }
    G._busserMovingCard = null;
    G.placing = false;
    clearPlaceHighlights();
    triggerRozsiPassive(mv.card, z); // Rozsi: +2 fate on move into zone
    toast(mv.card.name + ' moved to Zone ' + (z+1) + '!');
    if(typeof playSfx === 'function') playSfx('cardMove');
    log(cp===0?'p1':'p2', mv.card.name + ' moved via Busser to Zone ' + (z+1));
    renderGame({board:true, scores:true, blocks:true, topbar:true});
    return;
  }
  if(G._expMoving) {
    const mv = G._expMoving;
    const cp = typeof mv.card.owner === 'number' ? mv.card.owner : G.currentPlayer;
    if(cp !== G.currentPlayer){
      G._expMoving = null;
      G.placing = false;
      clearPlaceHighlights();
      if(typeof window.FateMatchRendererAdapter?.scheduleRender === 'function') window.FateMatchRendererAdapter.scheduleRender('square-selection-state');
      toast('ALPINE Expeditionary movement cancelled - it is not your card.');
      renderGame({board:true, blocks:true, topbar:true});
      return;
    }
    if(G.board[z][r][c]!==null){toast('Cell is occupied');return;}
    if(!isContestedOrOwnSafeSquare(z, r, c, cp)){
      toast('ALPINE Expeditionary can only move to contested row or your safe row');
      playSfx('blocked');
      return;
    }
    if(isBlocked(z,r,c)){toast('Cell is blocked');return;}
    G.board[mv.fromZ][mv.fromR][mv.fromC] = null;
    G.board[z][r][c] = mv.card;
    mv.card._expMoved = true;
    G._expMoving = null;
    G.placing = false;
    clearPlaceHighlights();
    triggerRozsiPassive(mv.card, z); // Rozsi: +2 fate on move into zone
    toast('ALPINE Expeditionary moved!');
    if(typeof playSfx === 'function') playSfx('cardMove');
    renderGame({board:true, scores:true, blocks:true, topbar:true});
    return;
  }
  if(!G.placing || G.selectedHandCard===null) return;
  const player = G.players[G.currentPlayer];
  const card = player.hand[G.selectedHandCard];
  if(!card) return;
  if(typeof tutorialCanPlaceCardAt === 'function' && !tutorialCanPlaceCardAt(card, z, r, c)) return;
  if(card.id==='70' && card.guerilla_transferred){
    playSfx('blocked');
    toast(card.name + ' cannot be set - it is debuffing this hand.');
    G.placing = false;
    clearPlaceHighlights();
    renderHand();
    return;
  }

  // Check validity again
  if(G.board[z][r][c]!==null){playSfx('blocked');toast('Cell is occupied');return;}
  if(isBlocked(z,r,c)){playSfx('blocked');toast('Cell is blocked');return;}
  // Enforce safe row ownership — P1 can only place on row 2+, P2 on row 0
  const cp = G.currentPlayer;
  if(typeof isContestedOrOwnSafeSquare === 'function' && !isContestedOrOwnSafeSquare(z, r, c, cp)){
    playSfx('blocked');toast(r === 1 ? 'Cannot place there' : 'Cannot place on opponent\'s safe row');return;
  }
  if(typeof G._artilleryLockedZone==='number' && G._artilleryLockedZone===z && G._artilleryLockOwner===cp && G._artilleryLockTurnsLeft>0){
    playSfx('blocked');toast('Artillery Distance locks this zone - cannot set cards here.');return;
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
  const isLinaFree = !!(card._linaFree || (G._linaFreeIids && G._linaFreeIids.has(card.iid)));
  if(card.type === 'Supporter' && card.id !== '76' && isBlockedByAlondra(z, r, c, cp)) {
    playSfx('blocked');
    toast('Alondra blocks Supporters adjacent to her.');
    return;
  }
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
  markCardSetTurn(inst, G.currentPlayer);
  if(typeof applyLandscapePlacementBonuses === 'function') applyLandscapePlacementBonuses(inst, z, r, c);
  consumePendingPlacementFlags(card, inst);
  const handIndex = G.selectedHandCard;
  function createSetCommitProfiler(tx){
    const target = tx || {};
    target.commitBreakdown = target.commitBreakdown || {};
    const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    let last = start;
    return function(name){
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      target.commitBreakdown[String(name || 'step') + 'Ms'] = Math.round((now - last) * 10) / 10;
      target.commitBreakdown.totalSoFarMs = Math.round((now - start) * 10) / 10;
      last = now;
    };
  }
  function deferSetCommitHook(fn){
    const run = function(){ try { fn(); } catch(e) {} };
    if(typeof requestAnimationFrame === 'function') requestAnimationFrame(function(){ setTimeout(run, 0); });
    else setTimeout(run, 0);
  }
  function commitNormalSetAfterPresentation(tx){
    const markCommit = createSetCommitProfiler(tx);
    G.board[z][r][c] = inst;
    applyRiveraBuffToPlacedCard(inst, inst.owner);
    if(player.hand[handIndex] === card) player.hand.splice(handIndex, 1);
    else player.hand = player.hand.filter(c => c !== card);
    markCommit('state');
    if(typeof trackDailyCardPlacement === 'function') {
      deferSetCommitHook(function(){ trackDailyCardPlacement(inst, z, r, c); });
    }
    markCommit('dailyTrackingScheduled');

  // Show consolidation cinematic for Lina free-set character cards (they bypass the consolidation flow)
  if(isLinaFree && card.type !== 'Supporter' && typeof showConsolidationCinematic === 'function'){
    inst._serverFreePlacementConsumed = inst._serverFreePlacementConsumed || (card._serverFreePlacementConsumed || 'linaFreeSet');
    G._cinematicUiLockUntil = Math.max(G._cinematicUiLockUntil || 0, Date.now() + 90 + 2350);
    setTimeout(function(){ showConsolidationCinematic(inst, {playVoice:true, playSfx:true}); }, 90);
  }
  markCommit('linaFreeCinematic');

  // Anicka Konvicka (02) Starlit Path: any card placed in her zone by her controller gains 3 Fate.
  G.board[z].forEach((row, r)=>row.forEach((cell, c)=>{
    if(cell && cell.id==='02' && cell.owner===G.currentPlayer && cell.iid!==inst.iid && !isFaceDownCard(cell)){
      modifyFate(inst,3,'permanent');
    }
  }));
  markCommit('anickaPassive');

  // Play card placement sound (rarity-based) — skip if cinematic already handles audio
  var _cinematicHandlesAudio = isLinaFree && card.type !== 'Supporter' && typeof showConsolidationCinematic === 'function';
  if(!_cinematicHandlesAudio){
    if(typeof playCardSoundDeferred === 'function') playCardSoundDeferred(card.id, 0);
    else setTimeout(function(){ playCardSound(card.id); }, 0);
    if(typeof playSfx === 'function') {
      const setSfxType = card.type === 'Supporter' ? 'supporterSet' : (typeof getCharacterSetSfxType === 'function' ? getCharacterSetSfxType(card) : 'characterSet');
      if(typeof playSfxDeferred === 'function') playSfxDeferred(setSfxType, 0);
      else setTimeout(function(){ playSfx(setSfxType); }, 0);
    }
  }
  markCommit('audioSchedule');
  // Tutorial event hooks
  if(typeof tutorialEvent==='function' && _tutorialActive){
    deferSetCommitHook(function(){
      if(inst.type==='Supporter') tutorialEvent('placeSupporter', {card:inst, z, r, c, kind:'place'});
      else tutorialEvent('placeCharacter', {card:inst, z, r, c, kind:'place'});
    });
  }
  // AI dialogue hooks (safe — triggerAIDialogue checks if AI game)
  if(typeof triggerAIDialogue==='function'){
    const dialogueEvent = G.currentPlayer !== G.aiPlayer
      ? (inst.type==='Supporter' ? 'opponentPlacedSupporter' : 'opponentPlacedCharacter')
      : 'aiPlacedCard';
    deferSetCommitHook(function(){ triggerAIDialogue(dialogueEvent); });
  }
  // Affiliation-specific placement layer
  if(inst.aff) {
    const affSfx = 'affPlace_' + inst.aff;
    if(typeof playSfxDeferred === 'function') playSfxDeferred(affSfx, 24);
    else setTimeout(function(){ playSfx(affSfx); }, 24);
  }
  markCommit('hooks');
  // Count Supporter sets for match trackers/effects even when an effect sets the card for free.
  if(card.type==='Supporter') {
    const rawSetReinforcementValue = typeof getSupportReinforcementValue === 'function' ? getSupportReinforcementValue(inst) : 1;
    const setReinforcementValue = Math.max(0, Number(rawSetReinforcementValue) || 0);
    if(!isLinaFree) G.supportsPlacedThisTurn++;
    if(!Array.isArray(G.supportersSetP)) G.supportersSetP = [0,0];
    G.supportersSetP[G.currentPlayer] = (Number(G.supportersSetP[G.currentPlayer]) || 0) + 1;
    if(!Array.isArray(G.supporterReinforcementSetP)) G.supporterReinforcementSetP = [0,0];
    G.supporterReinforcementSetP[G.currentPlayer] = (Number(G.supporterReinforcementSetP[G.currentPlayer]) || 0) + setReinforcementValue;
    inst._setReinforcementValue = setReinforcementValue;
    inst._supporterSetCounted = true;
    inst._wasSetAsSupporter = true;
    inst._hasBeenOnBoard = true;
    inst._supporterSetOwner = G.currentPlayer;
    if(typeof noteBalladSupporterSet === 'function') noteBalladSupporterSet(G.currentPlayer);
  }
  // Clear Lina free flag after use
  if(isLinaFree && G._linaFreeIids) G._linaFreeIids.delete(card.iid);
  if(isLinaFree) delete card._linaFree;
  markCommit('supporterTracking');
  
  log(G.currentPlayer===0?'p1':'p2', `${player.name} placed ${card.name} in Zone ${z+1}`);
  markCommit('log');

  G.placing = false;
  G.selectedHandCard = null;
  clearPlaceHighlights();
  markCommit('clearHighlights');

    if(typeof applyContinuousEffects === 'function') applyContinuousEffects();
    markCommit('continuousEffects');
    if(typeof renderBoardActionForPlayer === 'function') {
      renderBoardActionForPlayer(G.currentPlayer, {hand:true, blocks:false, topbar:false, effects:false, hover:false});
    } else {
      renderGame({board:true, hand:true, scores:true});
    }
    markCommit('renderRequest');

    requestAnimationFrame(() => resolveSetCardAfterPlacement(inst, z, r, c));
    markCommit('scheduleWhenSet');
  }

  const actionPresenter = window.FateActionPresentation;
  if(actionPresenter && typeof actionPresenter.beginSetCard === 'function'){
    let presentationFromRect = null;
    try {
      presentationFromRect = window.__fateNextSetFromRect || null;
      window.__fateNextSetFromRect = null;
    } catch(e) {}
    const started = actionPresenter.beginSetCard({
      sourceCard:card,
      inst,
      target:{z:z, r:r, c:c},
      fromRect:presentationFromRect,
      commit:commitNormalSetAfterPresentation,
      rollback:function(){
        delete card._presentationDeparting;
        if(typeof renderBoardActionForPlayer === 'function') {
          renderBoardActionForPlayer(G.currentPlayer, {hand:true, blocks:false, topbar:false, effects:false, hover:false});
        } else {
          renderGame({board:true, hand:true, scores:true});
        }
      }
    });
    if(started) return;
  }
  commitNormalSetAfterPresentation({presentMs:0});
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
  if(isPlayerSupporterEffectsSuppressed(owner)) return null;
  let found = null;
  G.board[z].forEach((row, r)=>row.forEach((cell, c)=>{
    if(found) return;
    if(cell && cell.id==='78' && cell.owner===owner && !cell._chaparralAmbushUsed && !isFaceDownCard(cell) && !isSupporterEffectSuppressed(cell)) {
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
      if(!cell || cell.id!=='24' || cell.owner!==owner || isFaceDownCard(cell) || isSupporterEffectSuppressed(cell)) return;
      const dr = Math.abs(rr-r), dc = Math.abs(cc-c);
      if(dr<=1 && dc<=1 && (dr+dc)>0) count++;
    });
  });
  return count;
}

function clientSeededRandom(seed){
  let h = 2166136261;
  const s = String(seed || 'fates');
  for(let i = 0; i < s.length; i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = (h >>> 0) || 0x9e3779b9;
  a |= 0;
  a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function deterministicOnlineRandomIndex(length, reason, playerIndex){
  const max = Math.max(0, Number(length || 0) || 0);
  if(max <= 0) return -1;
  if(!G || !G._onlineRoomCode) return -1;
  const counter = Math.max(0, Number(G._serverRngCounter || 0) || 0);
  G._serverRngCounter = counter + 1;
  const seed = `${G.seed || G.matchSeed || G.roomSeed || G._onlineSeed || 'fates'}:${reason || 'random'}:${playerIndex}:${counter}`;
  return Math.floor(clientSeededRandom(seed) * max);
}

function resolveImmediateFreePlacementHandCard(player, card) {
  const hand = G && G.players && G.players[player] && Array.isArray(G.players[player].hand) ? G.players[player].hand : [];
  if(!card) return null;
  if(card.iid !== undefined && card.iid !== null) {
    const byIid = hand.find(h => h && h.iid === card.iid);
    if(byIid) return byIid;
  }
  return hand.find(h => h === card) || card;
}

function beginImmediateFreePlacement(player, card, message, effectInfo) {
  if(!card) return;
  card = resolveImmediateFreePlacementHandCard(player, card);
  if(!card) return;
  card.effectUsedInitial = false;
  card._effectTurnLocked = false;
  card._effectNegatedByReaction = false;
  card.whenSetActivated = false;
  card._linaFree = true;
  if(!G._linaFreeIids) G._linaFreeIids = new Set();
  G._linaFreeIids.add(card.iid);
  if(typeof recordHandCardEffectModifier === 'function' && !(typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(card))) {
    const info = effectInfo || {};
    const sourceName = info.name || 'Free Placement';
    const ability = info.ability ? String(info.ability) + ': ' : '';
    recordHandCardEffectModifier(card, {
      key:info.key || ('free-placement:' + sourceName),
      name:sourceName,
      text:info.text || (ability + 'this card can be set for free.'),
      costDelta:0
    });
  }
  renderGame({hand:true, topbar:true});
  if(player !== G.currentPlayer) return;
  const idx = G.players[player].hand.findIndex(h=>h.iid===card.iid);
  if(idx === -1) return;
  G.selectedHandCard = idx;
  G.placing = true;
  clearPlaceHighlights();
  if(!highlightValidCells(card, 'free-placement-choice')){
    G.selectedHandCard = null;
    G.placing = false;
    toast('No open squares available for ' + card.name);
    return;
  }
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
  if(typeof playSfx === 'function') playSfx('cardFlip');
  const placementDelay = triggerPlacementAnimation(card, z, r, c);
  if(card.type !== 'Supporter' && typeof showConsolidationCinematic === 'function') {
    const cinematicDelay = Math.max(0, placementDelay || 0) + 90;
    G._cinematicUiLockUntil = Math.max(G._cinematicUiLockUntil || 0, Date.now() + cinematicDelay + 2350);
    setTimeout(function(){ showConsolidationCinematic(card, {playVoice:true, playSfx:true}); }, cinematicDelay);
  }
  renderGame({board:true, scores:true, blocks:true, topbar:true});
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
  if(typeof isCardEffectImmutable === 'function' ? isCardEffectImmutable(card) : card.id === '76') return false;
  return true;
}

function getConsolidationTributeLabel(card) {
  return (typeof cardUsesCharacterConsolidationTributes === 'function' && cardUsesCharacterConsolidationTributes(card)) ? 'characters' : 'supporters';
}

function ensureBlameGameState() {
  if(!Array.isArray(G._blameGameEffects)) G._blameGameEffects = [null, null];
  return G._blameGameEffects;
}

function activateBlameGameEffect(player, card) {
  const effects = ensureBlameGameState();
  effects[player] = {
    active: true,
    turnsLeft: 5,
    sourceIid: card ? card.iid : null,
    sourceName: card ? card.name : 'The Blame Game'
  };
  toast('The Blame Game: your Supporters count as Characters for 5 turns.');
  if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
}

function tickBlameGameForCurrentPlayer() {
  const effects = ensureBlameGameState();
  const fx = effects[G.currentPlayer];
  if(!fx || !fx.active) return;
  fx.turnsLeft = Math.max(0, (Number(fx.turnsLeft) || 0) - 1);
  if(fx.turnsLeft <= 0) {
    fx.active = false;
    toast('The Blame Game has ended.');
  }
}

function tickWintertideForCurrentPlayer() {
  if(!(typeof isSnowOnCarpathiansLandscapeActive === 'function' && isSnowOnCarpathiansLandscapeActive())) return;
  let applied = 0;
  forEachBoardCard((card)=>{
    if(!card || card.id !== '100' || card.owner !== G.currentPlayer || isFaceDownCard(card)) return;
    if(card._wintertideLastTurn === G.turn) return;
    const before = Math.max(0, Number(card.currentFate ?? card.fate) || 0);
    card.currentFate = before + 1;
    card._wintertideLastTurn = G.turn;
    applied++;
    if(typeof playFateChangeSound === 'function') playFateChangeSound(card, before, card.currentFate, card.owner);
  });
  if(applied) toast('Wintertide: Snow on the Carpathians grants Fate.');
}

function initiateConsolidate() {
  if(!(G && G._onlineApplyingRemoteAction) && typeof isLocalPlayerActionTurn === 'function' && !isLocalPlayerActionTurn()){
    if(G && G._onlineRoomCode) toast('Wait for your turn to consolidate.');
    return;
  }
  if(G.selectedHandCard===null){toast('Select a character card from your hand first');return;}
  const card = G.players[G.currentPlayer].hand[G.selectedHandCard];
  if(!card||card.type==='Supporter'){toast('Select a character card (not a Supporter)');return;}
  if(typeof tutorialCanStartHandAction === 'function' && !tutorialCanStartHandAction(card, 'consolidate')) return;

  // Lina free-set: skip consolidation entirely, just place directly
  const isLinaFree = G._linaFreeIids && G._linaFreeIids.has(card.iid);
  if(isLinaFree){
    closeModal();
    G.placing = true;
    if(!highlightValidCells(card, 'free-placement-choice')){
      G.placing = false;
      toast('No open squares available for ' + card.name);
      return;
    }
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
    if(!highlightValidCells(card, 'free-placement-choice')){
      G.placing = false;
      toast('No open squares available for ' + card.name);
      return;
    }
    setHint('Place ' + card.name + ' for free (cost reduced to 0)');
    return;
  }
  doConsolidate(card, actualCost);
}

function doConsolidate(card, cost) {
  const cp = G.currentPlayer;
  const opp = 1-cp;
  const baseCost = Math.max(0, Number(cost) || 0);
  const readyCost = getMinimumConsolidationCost(card, cp, baseCost);
  const usesCharacterTributes = typeof cardUsesCharacterConsolidationTributes === 'function' && cardUsesCharacterConsolidationTributes(card);
  const tributeLabel = getConsolidationTributeLabel(card);

  // Colombo Thug (53): opponent's consolidations in a zone with a Thug
  // can only use supporters from THAT zone (per-Thug zone restriction)
  const colomboRestrictionZones = new Set();
  forEachBoardCard((c,z,r,col)=>{
    if(cardActsAsPassive(c, '53') && c.owner===opp && !isSupporterAuraSuppressed(c)) colomboRestrictionZones.add(z);
  });

  // Find available reinforcement on board owned by current player
  const supports = [];
  G.board.forEach((zone,z)=>zone.forEach((row,r)=>{
    if(!row) return;
    // Artillery Distance (50): skip supporters in locked zone
    if(typeof G._artilleryLockedZone==='number' && G._artilleryLockedZone===z && G._artilleryLockOwner===cp && G._artilleryLockTurnsLeft>0) return;
    row.forEach((cell,c)=>{
      const isCharacterTribute = typeof isCardCharacterForRules === 'function' && isCardCharacterForRules(cell, cp);
      const canUseForThisCard = usesCharacterTributes
        ? isCharacterTribute
        : (cell && (cell.type==='Supporter' || cell.id==='86'));
      if(cell && canUseForThisCard && canUseAsConsolidationTribute(cell, cp)) {
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
      if(cell&&cardActsAsPassive(cell, '49')&&cell.owner===cp&&!isSupporterAuraSuppressed(cell)) irvineZones.push(z);
    });
  }));

  const charSupports = [];
  if(!usesCharacterTributes && irvineZones.length>0){
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
  const reinforcementValue = item => item ? Math.max(0, Number(item.reinforcement) || 0) : 0;
  const totalReinforcement = allPossible.reduce((s,t)=>s+reinforcementValue(t),0);

  if(totalReinforcement < readyCost) {
    toast(`Need ${readyCost} reinforcement on the field (have ${totalReinforcement})`); return;
  }

  // ON-BOARD CONSOLIDATION FLOW
  // Highlight tributeable cards on the board. Player clicks them to select/deselect.
  // Once enough reinforcement is selected, highlight those cells for placement.
  closeModal();
  G.selectedBoardCard = null;
  G._consolidating = {
    card, handIndex:G.selectedHandCard, cardIid:card?.iid || null, cardId:card?.id || null, cost:readyCost, baseCost, allPossible, chosenIdxs: [], phase: 'select_tributes',
    colomboRestrictionZones // zones where Colombo Thug restricts cross-zone tribute usage
  };
  const localConsolidationActive = typeof isLocalConsolidationActive === 'function' ? isLocalConsolidationActive() : true;
  const gameScreen = document.getElementById('s-game');
  if(gameScreen) gameScreen.classList.toggle('is-consolidating', localConsolidationActive);
  const cancelBtn = document.getElementById('cancel-consolidate-btn');
  if(cancelBtn) cancelBtn.style.display = localConsolidationActive ? '' : 'none';

  // Add CSS class to tributeable cards (no renderGame — board is already current)
  if(localConsolidationActive) highlightTributeCards();
  refreshConsolidationCanvasState();
  setHint(`Select ${tributeLabel} to consolidate ${card.name} (0/${readyCost} reinforcement).`);
}

function highlightTributeCards() {
  const con = G._consolidating;
  if(!con) return;
  if(!Array.isArray(con.allPossible)) con.allPossible = [];
  if(!Array.isArray(con.chosenIdxs)) con.chosenIdxs = [];
  document.querySelectorAll('#board .bc.tribute-available,#board .bc.tribute-selected,#board .bc.tribute-ready').forEach(el=>{
    el.classList.remove('tribute-available','tribute-selected','tribute-ready');
  });
  document.querySelectorAll('#board .cell.tribute-cell-available,#board .cell.tribute-cell-selected,#board .cell.tribute-cell-ready').forEach(el=>{
    el.classList.remove('tribute-cell-available','tribute-cell-selected','tribute-cell-ready');
    el.removeAttribute('data-tribute-label');
  });
  document.querySelectorAll('#board .cell.tutorial-target-square').forEach(el=>el.classList.remove('tutorial-target-square'));
  const tutorialTarget = typeof tutorialCurrentTargetSquare === 'function' ? tutorialCurrentTargetSquare() : null;
  const running = con.chosenIdxs.reduce((s,i)=>{
    const item = con.allPossible[i];
    return s + (item ? Math.max(0, Number(item.reinforcement) || 0) : 0);
  },0);
  const requirementsMet = con.phase === 'select_placement' || (running >= con.cost && con.phase === 'select_tributes');
  con.allPossible.forEach((s,i)=>{
    const cell = document.querySelector(`#board .cell[data-z="${s.z}"][data-r="${s.r}"][data-c="${s.c}"]`);
    const el = cell ? cell.querySelector('.bc') : null;
    if(el){
      if(con.chosenIdxs.includes(i)){
        const cls = requirementsMet ? 'tribute-ready' : 'tribute-selected';
        const cellCls = requirementsMet ? 'tribute-cell-ready' : 'tribute-cell-selected';
        el.classList.add(cls);
        el.classList.remove('tribute-available','tribute-selected','tribute-ready');
        if(cls !== 'tribute-selected') el.classList.remove('tribute-selected');
        if(cls !== 'tribute-ready') el.classList.remove('tribute-ready');
        el.classList.add(cls);
        if(cell){
          cell.classList.add(cellCls);
          cell.classList.remove('tribute-cell-available','tribute-cell-selected','tribute-cell-ready');
          cell.classList.add(cellCls);
        }
      } else {
        el.classList.add('tribute-available');
        el.classList.remove('tribute-selected','tribute-ready');
        if(cell){
          cell.classList.add('tribute-cell-available');
          cell.classList.remove('tribute-cell-selected','tribute-cell-ready');
        }
      }
      if(cell && tutorialTarget && Number(tutorialTarget.z) === Number(s.z) && Number(tutorialTarget.r) === Number(s.r) && Number(tutorialTarget.c) === Number(s.c)) {
        cell.classList.add('tutorial-target-square');
      }
    }
  });
}

function refreshConsolidationCanvasState() {
  try {
    if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function') {
      window.FateMatchRendererAdapter.scheduleRender('consolidation-state');
    }
  } catch(e) {}
}

function handleConsolidateClick(z,r,c) {
  const con = G._consolidating;
  if(!con) return false;
  if(!Array.isArray(con.allPossible)) con.allPossible = [];
  if(!Array.isArray(con.chosenIdxs)) con.chosenIdxs = [];

  if(con.phase==='select_tributes'){
    const idx = con.allPossible.findIndex(s=>s.z===z&&s.r===r&&s.c===c);
    if(idx===-1) return false;
    if(typeof tutorialCanSelectConsolidationTribute === 'function' && !tutorialCanSelectConsolidationTribute(con, z, r, c)) return true;
    const running = con.chosenIdxs.reduce((s,i)=>{
      const item = con.allPossible[i];
      return s + (item ? Math.max(0, Number(item.reinforcement) || 0) : 0);
    },0);
    const wasReady = running >= con.cost;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const lastToggle = con._lastTributeToggle || {};

    if(con.chosenIdxs.includes(idx) && lastToggle.idx === idx && lastToggle.action === 'select' && (now - (lastToggle.t || 0)) < 300){
      return true;
    }

    if(wasReady && con.chosenIdxs.includes(idx)){
      con.phase='select_placement';
      return handleConsolidateClick(z,r,c);
    }

    if(con.chosenIdxs.includes(idx)){
      con.chosenIdxs = con.chosenIdxs.filter(x=>x!==idx);
      con.phase='select_tributes';
      con._lastTributeToggle = { idx, action:'deselect', t:now };
    } else {
      con.chosenIdxs.push(idx);
      con._lastTributeToggle = { idx, action:'select', t:now };
    }

    const newRunning = con.chosenIdxs.reduce((s,i)=>{
      const item = con.allPossible[i];
      return s + (item ? Math.max(0, Number(item.reinforcement) || 0) : 0);
    },0);

    if(newRunning >= con.cost){
      if(newRunning > con.cost){
        toast(`Over-reinforcement warning: selected ${newRunning}/${con.cost}. You may place now.`);
      }
      highlightTributeCards();
      refreshConsolidationCanvasState();
      setHint(`Ready: click a selected tribute to place ${con.card.name}.`);
      return true;
    }

    highlightTributeCards();
    refreshConsolidationCanvasState();
    setHint(`Select ${getConsolidationTributeLabel(con.card)} to consolidate ${con.card.name} (${newRunning}/${con.cost} reinforcement).`);
    return true;
  }

  if(con.phase==='select_placement'){
    if(typeof tutorialCanPlaceConsolidationAt === 'function' && !tutorialCanPlaceConsolidationAt(con, z, r, c)) return true;
    const placementIdx = con.chosenIdxs.findIndex(i=>{
      const s=con.allPossible[i];
      return s.z===z&&s.r===r&&s.c===c;
    });
    if(placementIdx===-1) return false;
    if(isBlockedForConsolidate(z,r,c)){
      toast('No consolidation on this square.');
      return true;
    }
    if(typeof G._artilleryLockedZone==='number' && G._artilleryLockedZone===z && G._artilleryLockOwner===G.currentPlayer && G._artilleryLockTurnsLeft>0){
      toast('Artillery Distance locks this zone - cannot consolidate here.');
      if(typeof playSfx === 'function') playSfx('blocked');
      return true;
    }
    const selectedReinforcement = con.chosenIdxs.reduce((s,i)=>s+Math.max(0, Number(con.allPossible[i]?.reinforcement) || 0),0);
    const zoneCost = getConsolidationCostForZone(con.card, z, G.currentPlayer, con.baseCost ?? con.cost);
    if(selectedReinforcement < zoneCost) {
      toast(`Need ${zoneCost} reinforcement to consolidate in this zone.`);
      con.phase = 'select_tributes';
      highlightTributeCards();
      refreshConsolidationCanvasState();
      setHint(`Select ${getConsolidationTributeLabel(con.card)} to consolidate ${con.card.name} (${selectedReinforcement}/${zoneCost} reinforcement).`);
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
    document.getElementById('s-game')?.classList.remove('is-consolidating');
    const cancelBtn = document.getElementById('cancel-consolidate-btn');
    if(cancelBtn) cancelBtn.style.display = 'none';
    clearPlaceHighlights();
    finalizeConsolidate(con.card, tributes, targetTributeIdx, con);
    setHint('Select a card to play');
    return true;
  }
  return false;
}

function restoreMarkViewportSnapshotRepeated(snap) {
  window.FATE_SUPPRESS_MARK_SCROLL_UNTIL = 0;
  window.FATE_MARK_SCROLL_SNAP = null;
}

function cancelConsolidation() {
  if(!G._consolidating) return;
  G._consolidating = null;
  document.getElementById('s-game')?.classList.remove('is-consolidating');
  const cancelBtn = document.getElementById('cancel-consolidate-btn');
  if(cancelBtn) cancelBtn.style.display = 'none';
  G.selectedHandCard = null;
  clearPlaceHighlights();
  setHint('Select a card to play');
  renderGame({board:true, hand:true, blocks:true, topbar:true});
  refreshConsolidationCanvasState();
  toast('Consolidation cancelled');
}

function resolveConsolidatingHandCard(player, con) {
  if(!player || !Array.isArray(player.hand) || !con) return null;
  const iid = con.cardIid || con.card?.iid || null;
  if(iid) {
    const byIid = player.hand.find(c => c && c.iid === iid);
    if(byIid) return byIid;
  }
  const idx = Number(con.handIndex);
  if(Number.isInteger(idx) && idx >= 0 && idx < player.hand.length) {
    const candidate = player.hand[idx];
    if(candidate && (!con.cardId || String(candidate.id) === String(con.cardId))) return candidate;
  }
  const id = con.cardId || con.card?.id || null;
  const name = con.card?.name || '';
  if(id) {
    const byId = player.hand.find(c => c && String(c.id) === String(id) && (!name || c.name === name));
    if(byId) return byId;
  }
  return null;
}

function finalizeConsolidate(card, tributes, targetIdx, conContext) {
  const cp = G.currentPlayer;
  const target = tributes[targetIdx];
  if(!card || !target) {
    toast('Consolidation cancelled - invalid target.');
    renderGame({board:true, hand:true, blocks:true, topbar:true});
    return;
  }
  const targetZ = target.z, targetR = target.r, targetC = target.c;
  const chaparralSource = getUnusedChaparralAmbusherInZone(targetZ, cp);
  let finished = false;

  function finishConsolidate(useFaceDown) {
    if(finished) return;
    finished = true;
    const player = G.players[cp];
    const liveHandCard = resolveConsolidatingHandCard(player, conContext || G._consolidating || {card});
    if(!liveHandCard) {
      toast('Consolidation cancelled - card is no longer in hand.');
      renderGame({board:true, hand:true, blocks:true, topbar:true});
      return;
    }
    card = liveHandCard;
    const liveTributes = tributes.every(t=>{
      const live = G.board[t.z] && G.board[t.z][t.r] ? G.board[t.z][t.r][t.c] : null;
      return live && t.card && live.iid === t.card.iid;
    });
    if(!liveTributes) {
      toast('Consolidation cancelled - selected supporters changed.');
      renderGame({board:true, hand:true, blocks:true, topbar:true});
      return;
    }

    let bonusFate = 0;
    tributes.forEach(t=>{
      if(t.card.id==='47') bonusFate += 3;
      if(t.card.id==='86') bonusFate += 4;
    });
    const inst = newInstance(card);
    inst.owner = cp;
    const basePrintedFate = card.fate;
    inst.currentFate = getPlacedCardFate(card, {bonusFate, tributeCount: tributes.length});
    markCardSetTurn(inst, cp);
    if(typeof applyLandscapePlacementBonuses === 'function') applyLandscapePlacementBonuses(inst, targetZ, targetR, targetC);
    if(typeof trackLandscapeConsolidation === 'function') trackLandscapeConsolidation(cp, inst, targetZ);
    inst.faceDown = !!useFaceDown;
    if(useFaceDown) {
      inst._suppressPlacementAnimation = true;
      inst._suppressCinematicSubtitle = true;
    }
    consumePendingPlacementFlags(card, inst);
    if(window.fateCanvasPreseedFate && !useFaceDown) window.fateCanvasPreseedFate(inst.iid, basePrintedFate);

    function commitConsolidationAfterPresentation(tx, presentationDelay){
      var _consolidationMotionMs = Math.max(0, Number(presentationDelay) || 0);
    const affectedZones = [...new Set(tributes.map(t=>t.z))];
    affectedZones.forEach(tz=>{
      G.board[tz].forEach((row, mr)=>{
        if(!row) return;
        row.forEach((cell, mc)=>{
          if(cell&&cell.id==='36'&&cell.owner!==cp){
            log('sys','Deterrance activated! Zone '+(tz+1)+' Fate reduced by 3.');
            G.fateModifiers['deterrance_z'+tz] = (G.fateModifiers['deterrance_z'+tz]||0) - 3;
            toast('Deterrance activated: Zone '+(tz+1)+' loses 3 Fate.');
            if(typeof showEffectActivationGlow === 'function') showEffectActivationGlow(tz, mr, mc, cell);
            if(typeof playSfx === 'function') playSfx('debuff');
            if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
          }
        });
      });
    });

    if(card._wciBonus) toast('West Caribbea Infantry bonus: -1 cost, +2 Fate!');
    try {
      tributes.forEach(t=>{
        if(t.card.id==='09' && t.card.usesLeft>0) {
          t.card.usesLeft--;
          if(!Array.isArray(G.un5thUses)) G.un5thUses = [0,0];
          G.un5thUses[cp] = (Number(G.un5thUses[cp]) || 0) + 1;
        }
      });
      tributes.forEach(t=>{
        if(t && t.card) t.card._suppressDiscardVfx = true;
        discardBoardCard(t.card, t.z, t.r, t.c);
      });
    } catch(err) {
      console.error('Consolidation tribute spend failed after validation', err);
      toast('Consolidation recovered after a placement hiccup.');
    } finally {
      G.board[targetZ][targetR][targetC] = inst;
    }
    if(typeof applyBoleslawConsolidationBonus === 'function') applyBoleslawConsolidationBonus(inst, targetZ, cp);
    if(typeof noteBalladConsolidation === 'function') noteBalladConsolidation(cp, inst);
    if(typeof applyRiveraBuffToPlacedCard === 'function') applyRiveraBuffToPlacedCard(inst, inst.owner);
    if(typeof trackDailyCardPlacement === 'function') {
      setTimeout(function(){ trackDailyCardPlacement(inst, targetZ, targetR, targetC); }, 0);
    }
    const placementDelay = _consolidationMotionMs ? 0 : Math.min(360, 180 + tributes.length * 40);
    if(useFaceDown && chaparralSource?.card) chaparralSource.card._chaparralAmbushUsed = true;

    if(!useFaceDown && typeof showConsolidationCinematic === 'function') {
      G._cinematicUiLockUntil = Math.max(G._cinematicUiLockUntil || 0, Date.now() + Math.max(0, placementDelay || 0) + 90 + 2350);
      setTimeout(function(){ showConsolidationCinematic(inst, {playVoice:true, playSfx:true, allowRenderV2Cinematic:true}); }, Math.max(0, placementDelay || 0) + 90);
    }
    if(typeof updateDailyChallengeProgress === 'function') updateDailyChallengeProgress('consolidations', 1, 'add');

    log(cp===0?'p1':'p2',
      `${G.players[cp].name} consolidated ${card.name} into Zone ${targetZ+1}${useFaceDown ? ' face down' : ''}`);

    G.players[cp].hand = G.players[cp].hand.filter(c => c !== card);
    G.selectedHandCard = null;

    if(typeof tutorialEvent === 'function' && _tutorialActive) {
      tutorialEvent('placeCharacter', {
        card:inst,
        z:targetZ,
        r:targetR,
        c:targetC,
        kind:'consolidate',
        tributes:tributes
      });
    }

    if(typeof applyContinuousEffects === 'function') applyContinuousEffects();
    if(typeof renderBoardActionForPlayer === 'function') renderBoardActionForPlayer(cp, {hand:true, piles:true});
    else renderGame({board:true, hand:true, scores:true, piles:true, blocks:true, topbar:true});
    if(!_consolidationMotionMs) {
      requestAnimationFrame(() => { requestAnimationFrame(() => showConsolidateVisual(targetZ,targetR,targetC)); });
    }
    requestAnimationFrame(() => resolveSetCardAfterPlacement(inst, targetZ, targetR, targetC));
    }

    const actionPresenter = window.FateActionPresentation;
    if(actionPresenter && typeof actionPresenter.beginConsolidation === 'function'){
      const started = actionPresenter.beginConsolidation({
        tributes,
        card,
        inst,
        faceDown:useFaceDown,
        target:{z:targetZ, r:targetR, c:targetC},
        present:function(){
          if(window.FateV2CardMotionFx && typeof window.FateV2CardMotionFx.crashTributes === 'function'){
            return window.FateV2CardMotionFx.crashTributes(tributes, {
              card:inst,
              resultCard:inst,
              z:targetZ,
              r:targetR,
              c:targetC,
              faceDown:useFaceDown
            }) || 0;
          }
          return 0;
        },
        commit:function(tx, delay){
          commitConsolidationAfterPresentation(tx, delay);
        },
        rollback:function(){
          if(typeof renderBoardActionForPlayer === 'function') renderBoardActionForPlayer(cp, {hand:true, piles:true});
          else renderGame({board:true, hand:true, scores:true, piles:true, blocks:true, topbar:true});
        }
      });
      if(started) return;
    }
    commitConsolidationAfterPresentation(null, 0);
  }

  if(chaparralSource){
    showModal(
      'Chaparral Hoplite',
      `<div class="effect-choice-callout">
        <div class="effect-choice-kicker">Scrappy Ambushers</div>
        <div class="effect-choice-text"><strong>${escapeHtml(card.name)}</strong> can enter Zone ${targetZ+1} normally, or Chaparral Hoplite can hide it face down for an ambush.</div>
        <div class="effect-choice-meta"><span>Zone ${targetZ+1}</span><span>Consolidation choice</span></div>
      </div>`,
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
function hasFriendlyWojciechDiscountInZone(owner, z) {
  let found = false;
  if(!G.board || !G.board[z]) return false;
  G.board[z].forEach((row, r)=>row && row.forEach((cell, c)=>{
    if(cell && cell.id==='81' && cell.owner===owner && !isFaceDownCard(cell) && !isCoordinatorSuppressedAt(z, r, c)) found = true;
  }));
  return found;
}

function getConsolidationCostForZone(card, z, owner, baseCost) {
  let cost = Math.max(0, Number(baseCost) || 0);
  const cardIsCharacter = typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(card, owner) : !!(card && card.type !== 'Supporter');
  if(cardIsCharacter && cost >= 2 && hasFriendlyWojciechDiscountInZone(owner, z)) cost = Math.max(1, cost - 1);
  return cost;
}

function getMinimumConsolidationCost(card, owner, baseCost) {
  let minCost = Math.max(0, Number(baseCost) || 0);
  if(!G.board) return minCost;
  for(let z = 0; z < G.board.length; z++) minCost = Math.min(minCost, getConsolidationCostForZone(card, z, owner, baseCost));
  return minCost;
}

function getFriendlyZoneCharacterSupportCounts(owner, z) {
  const counts = {characters:0, supporters:0};
  if(!G.board || !G.board[z]) return counts;
  G.board[z].forEach(row=>row && row.forEach(cell=>{
    if(!cell || cell.owner!==owner || isFaceDownCard(cell) || (typeof isCardEffectImmutable === 'function' ? isCardEffectImmutable(cell) : cell.id==='76')) return;
    if(cell.type === 'Supporter') counts.supporters++;
    if(typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(cell, owner) : cell.type !== 'Supporter') counts.characters++;
  }));
  return counts;
}

function applyBoleslawConsolidationBonus(card, z, owner) {
  return false;
}

function ensureBalladState() {
  if(!Array.isArray(G._balladEffects)) G._balladEffects = [null, null];
  return G._balladEffects;
}

function noteBalladSupporterSet(player) {
  const fx = ensureBalladState()[player];
  if(fx && fx.active && !fx.ended) {
    fx.ended = true;
    fx.active = false;
    toast('A Noble Effort at a Ballad ended because a Supporter was set.');
  }
}

function noteBalladConsolidation(player, card) {
  const fx = ensureBalladState()[player];
  if(!fx || !fx.active || fx.ended || G.turn < fx.startTurn || !card) return;
  if(!Array.isArray(fx.consolidatedIids)) fx.consolidatedIids = [];
  if(!fx.consolidatedIids.includes(card.iid)) fx.consolidatedIids.push(card.iid);
}

function resolveBalladEndOfTurn(player) {
  const fx = ensureBalladState()[player];
  if(!fx || !fx.active || fx.ended || G.turn < fx.startTurn) return;
  const ids = Array.isArray(fx.consolidatedIids) ? fx.consolidatedIids.slice() : [];
  if(!ids.length) return;
  forEachBoardCard(card=>{
    if(card && card.owner===player && ids.includes(card.iid)) {
      const before = Math.max(0, Number(card.currentFate ?? card.fate) || 0);
      card.currentFate = before + 3;
      if(typeof playFateChangeSound === 'function') playFateChangeSound(card, before, card.currentFate, player);
    }
  });
  fx.consolidatedIids = [];
  toast('A Noble Effort at a Ballad: consolidations gain 3 Fate.');
}

function recordSupporterEffectActivation(player, card, options) {
  options = options || {};
  if(card && !options.allowRepeat) {
    if(card._supporterEffectActivationCounted) return;
    card._supporterEffectActivationCounted = true;
  }
  if(!Array.isArray(G._supporterEffectsActivatedP)) G._supporterEffectsActivatedP = [0,0];
  G._supporterEffectsActivatedP[player] = (Number(G._supporterEffectsActivatedP[player]) || 0) + 1;
  if(typeof recordLandscapeSupporterEffectActivation === 'function') recordLandscapeSupporterEffectActivation(player);
}

function resetLandscapeSupporterEffectTurnCount(player) {
  if(player !== 0 && player !== 1) return;
  const st = typeof getLandscapeState === 'function' ? getLandscapeState() : null;
  if(!st) return;
  if(!Array.isArray(st.supporterEffectsThisTurn)) st.supporterEffectsThisTurn = [0,0];
  st.supporterEffectsThisTurn[player] = 0;
}

function canActivateLandscapeSupporterEffect(player) {
  if(player !== 0 && player !== 1) return true;
  if(!(typeof isLandscapeActive === 'function' && isLandscapeActive('igb15'))) return true;
  const st = typeof getLandscapeState === 'function' ? getLandscapeState() : null;
  if(!st) return true;
  if(!Array.isArray(st.supporterEffectsThisTurn)) st.supporterEffectsThisTurn = [0,0];
  return (Number(st.supporterEffectsThisTurn[player]) || 0) < 1;
}

function recordLandscapeSupporterEffectActivation(player) {
  if(player !== 0 && player !== 1) return;
  if(!(typeof isLandscapeActive === 'function' && isLandscapeActive('igb15'))) return;
  const st = typeof getLandscapeState === 'function' ? getLandscapeState() : null;
  if(!st) return;
  if(!Array.isArray(st.supporterEffectsThisTurn)) st.supporterEffectsThisTurn = [0,0];
  st.supporterEffectsThisTurn[player] = (Number(st.supporterEffectsThisTurn[player]) || 0) + 1;
  if(typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('Snow on the Carpathians', 'minor');
}

function shouldSkipLandscapeDrawPhase(player) {
  if(player !== 0 && player !== 1) return false;
  if(!(typeof isLandscapeActive === 'function' && isLandscapeActive('igb13'))) return false;
  const st = typeof getLandscapeState === 'function' ? getLandscapeState() : null;
  if(!st) return false;
  if(!Array.isArray(st.drawPhaseCounts)) st.drawPhaseCounts = [0,0];
  st.drawPhaseCounts[player] = (Number(st.drawPhaseCounts[player]) || 0) + 1;
  return st.drawPhaseCounts[player] % 2 === 0;
}

function getSupportersSetCountForPlayer(player) {
  const p = Number(player);
  if(p !== 0 && p !== 1) return 0;
  const tracked = Math.max(0, Number(Array.isArray(G.supportersSetP) ? G.supportersSetP[p] : 0) || 0);
  let instanceFloor = 0;
  const seen = new Set();
  const note = function(card){
    if(!card || card.owner !== p || card.type !== 'Supporter') return;
    if(!(card._supporterSetCounted || card._wasSetAsSupporter || card._hasBeenOnBoard)) return;
    const key = card.iid || (card.id + ':' + card.name + ':' + seen.size);
    if(seen.has(key)) return;
    seen.add(key);
    instanceFloor++;
  };
  if(typeof forEachBoardCard === 'function') forEachBoardCard(note);
  const discard = G.players && G.players[p] && Array.isArray(G.players[p].discard) ? G.players[p].discard : [];
  discard.forEach(note);
  return Math.max(tracked, instanceFloor);
}
window.getSupportersSetCountForPlayer = getSupportersSetCountForPlayer;

function getSupporterReinforcementSetTotalForPlayer(player) {
  const p = Number(player);
  if(p !== 0 && p !== 1) return 0;
  const tracked = Math.max(0, Number(Array.isArray(G.supporterReinforcementSetP) ? G.supporterReinforcementSetP[p] : 0) || 0);
  let instanceFloor = 0;
  const seen = new Set();
  const note = function(card){
    if(!card || card.owner !== p || card.type !== 'Supporter') return;
    if(!(card._supporterSetCounted || card._wasSetAsSupporter || card._hasBeenOnBoard)) return;
    const key = card.iid || (card.id + ':' + card.name + ':' + seen.size);
    if(seen.has(key)) return;
    seen.add(key);
    const value = Number(card._setReinforcementValue ?? (typeof getSupportReinforcementValue === 'function' ? getSupportReinforcementValue(card) : 1)) || 0;
    instanceFloor += Math.max(0, value);
  };
  if(typeof forEachBoardCard === 'function') forEachBoardCard(note);
  const discard = G.players && G.players[p] && Array.isArray(G.players[p].discard) ? G.players[p].discard : [];
  discard.forEach(note);
  return Math.max(tracked, instanceFloor, getSupportersSetCountForPlayer(p));
}
window.getSupporterReinforcementSetTotalForPlayer = getSupporterReinforcementSetTotalForPlayer;

function isPersistentSupporterEffectOnSet(card) {
  if(!card || card.type !== 'Supporter') return false;
  if(WHEN_SET_IDS.has(String(card.id))) return false;
  return new Set(['20','24','44','49','53','59','63','65','78','92','95']).has(String(card.id));
}

async function beginManualSupporterEffectActivation(card, z, r, c, affectedOwners) {
  if(!card || card.type !== 'Supporter') return true;
  const cp = G.currentPlayer;
  if(!canActivateLandscapeSupporterEffect(cp)) {
    toast('Snow on the Carpathians: only one Supporter effect can activate each turn.');
    if(typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('Snow on the Carpathians', 'major');
    return false;
  }
  if(!G._suppressEffectPrompt) {
    const proceed = await checkReactions('supporter_effect', {
      card,
      z,
      r,
      c,
      sourceOwner:cp,
      affectedOwners:Array.isArray(affectedOwners) ? affectedOwners : []
    });
    if(!proceed) return false;
  }
  recordSupporterEffectActivation(cp, card, {allowRepeat:true});
  return true;
}

function isLandscapeChangeBlockedFor(player) {
  if(!Array.isArray(G._landscapeChangeLocks)) G._landscapeChangeLocks = [0,0];
  return (Number(G._landscapeChangeLocks[player]) || 0) > 0;
}

function ensureMailDeliveryState() {
  if(!Array.isArray(G._mailDeliveries)) G._mailDeliveries = [];
  return G._mailDeliveries;
}

function tickMailDeliveriesForCurrentPlayer() {
  const deliveries = ensureMailDeliveryState();
  if(!deliveries.length) return;
  const cp = G.currentPlayer;
  let changed = false;
  for(let i = deliveries.length - 1; i >= 0; i--) {
    const d = deliveries[i];
    if(!d || d.player !== cp) continue;
    d.turnsLeft = Math.max(0, (Number(d.turnsLeft) || 0) - 1);
    changed = true;
    if(d.turnsLeft <= 0) {
      const card = d.card;
      deliveries.splice(i, 1);
      if(card) {
        card.owner = cp;
        if(typeof addCardToHand === 'function') addCardToHand(cp, card);
        else G.players[cp].hand.push(card);
        toast('Mail Delivery arrived: ' + card.name + ' was added to your hand.');
        if(typeof playSfx === 'function') playSfx('effect');
      }
    }
  }
  if(changed && typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
}

async function activateWodnyPotokYouth(card, z, r, c) {
  if(!card || card.owner !== G.currentPlayer || card.effectUsedThisTurn) {
    toast('Snowball Fight can only be used once per turn.');
    return;
  }
  const cp = G.currentPlayer;
  const opp = 1 - cp;
  const allowed = await beginManualSupporterEffectActivation(card, z, r, c, [opp]);
  if(!allowed) {
    card.effectUsedThisTurn = true;
    renderGame({board:true, scores:true, topbar:true});
    return;
  }
  if(typeof showEffectActivationGlow === 'function') showEffectActivationGlow(z, r, c, card);
  pickCardFromAnyZone('Snowball Fight: select an opponent card to lose 1 Fate.', function(tgt){
    if(!tgt || tgt.owner !== opp) {
      toast('Select an opponent card.');
      return;
    }
    if(typeof isFullyEffectImmuneCard === 'function' ? isFullyEffectImmuneCard(tgt) : (tgt.immuneFlag || tgt.id === '76')) {
      showBlockedAnimation('this card is immune');
      return;
    }
    const before = Math.max(0, Number(tgt.currentFate ?? tgt.fate) || 0);
    const changed = setCardFateValue(tgt, before - 1, cp);
    if(!changed && before > 0) {
      showBlockedAnimation('Shield Wall prevents Fate loss');
      return;
    }
    card.effectUsedThisTurn = true;
    toast('Snowball Fight: ' + tgt.name + ' loses 1 Fate.');
    log(cp === 0 ? 'p1' : 'p2', 'Snowball Fight: ' + tgt.name + ' loses 1 Fate');
    renderGame({board:true, scores:true, topbar:true});
  }, function(cell){ return cell && cell.owner === opp; });
}
window.activateWodnyPotokYouth = activateWodnyPotokYouth;

function tickCarpathianSpecters() {
  forEachBoardCard(function(card){
    if(!card || card.id !== '95' || isFaceDownCard(card)) return;
    card._specterTurnsOnField = (Number(card._specterTurnsOnField) || 0) + 1;
    card._specterFateGains = Number(card._specterFateGains) || 0;
    if(card._specterTurnsOnField >= 2 && card._specterFateGains < 6) {
      card._specterTurnsOnField = 0;
      card._specterFateGains++;
      modifyFate(card, 1, 'permanent');
      toast(card.name + ' gains 1 Fate from Thousand Year Sorrow.');
    }
  });
}

const INITIAL_SET_INITIATOR_IDS = new Set(['03','04','06','07','08','13','17','21','22','29','30','39','43','45','48','51','54','66','82','83','87','90','bh25']);
const WINDOWED_WHEN_SET_EFFECT_IDS = new Set([
  '03','04','05','06','07','08','12','13','16','17','21','22','26','29','30','31','39','42','43','48','50','51','52','54','58','60','61','62','66','68','69','75','77','80','82','84','90','94','bh25'
]);

function whenSetEffectsAreDeferred() {
  if(typeof window !== 'undefined' && window.FATE_DEFER_WHEN_SET_EFFECTS === false) return false;
  try {
    return localStorage.getItem('fateWhenSetImmediate') !== '1';
  } catch(e) {
    return true;
  }
}

window.setFateWhenSetImmediateMode = function(enabled) {
  try {
    if(enabled) localStorage.setItem('fateWhenSetImmediate', '1');
    else localStorage.removeItem('fateWhenSetImmediate');
  } catch(e) {}
  if(typeof window !== 'undefined') window.FATE_DEFER_WHEN_SET_EFFECTS = !enabled;
  toast(enabled ? 'When-set effects will activate immediately.' : 'When-set effects will wait for manual activation.');
};

function cardHasDeferredSetEffect(card) {
  if(!card || isFaceDownCard(card)) return false;
  if(card._pendingWhenSetActivationInFlight) return false;
  const id = String(card.id || '');
  if(!WINDOWED_WHEN_SET_EFFECT_IDS.has(id)) return false;
  if(card.type === 'Supporter' && WHEN_SET_IDS.has(id)) return card.whenSetActivated !== true;
  if(card.type === 'Initiator' && INITIAL_SET_INITIATOR_IDS.has(id)) return !card.effectUsedInitial;
  return WHEN_SET_IDS.has(id) && card.effectUsedInitial !== true && card.whenSetActivated !== true;
}

function markCardSetTurn(card, player) {
  if(!card || typeof G === 'undefined' || !G) return;
  card._setTurn = G.turn;
  card._setOwner = typeof player === 'number' ? player : (typeof card.owner === 'number' ? card.owner : G.currentPlayer);
}

function isSameTurnAsCardSet(card) {
  if(!card || typeof G === 'undefined' || !G) return false;
  if(Number.isFinite(card._setTurn)) return card._setTurn === G.turn;
  if(card._pendingWhenSetEffect && Number.isFinite(card._pendingWhenSetEffect.turnQueued)) {
    return card._pendingWhenSetEffect.turnQueued === G.turn;
  }
  return false;
}

function expireStalePendingWhenSetEffect(card) {
  if(!card || !card._pendingWhenSetEffect) return false;
  const pendingTurn = Number(card._pendingWhenSetEffect.turnQueued);
  if(Number.isFinite(pendingTurn) && pendingTurn === G.turn) return false;
  delete card._pendingWhenSetEffect;
  if(card.type === 'Supporter') card.whenSetActivated = true;
  return true;
}

function queueDeferredWhenSetEffect(card, z, r, c) {
  if(!card || !cardHasDeferredSetEffect(card)) return false;
  markCardSetTurn(card);
  card._pendingWhenSetEffect = {
    z,
    r,
    c,
    owner: typeof card.owner === 'number' ? card.owner : G.currentPlayer,
    turnQueued: G.turn
  };
  card._effectNegatedByReaction = false;
  if(card.type === 'Supporter') card.whenSetActivated = false;
  return true;
}

function canActivatePendingWhenSetEffect(card, z, r, c, player = G.currentPlayer) {
  if(!card || !card._pendingWhenSetEffect || isFaceDownCard(card)) return false;
  if(card._pendingWhenSetActivationInFlight) return false;
  if(expireStalePendingWhenSetEffect(card)) return false;
  if(card.owner !== player || G.currentPlayer !== player) return false;
  if(G._isSpectator || G._onlineRole === 'spectator') return false;
  const pos = typeof findBoardPositionForCard === 'function' ? findBoardPositionForCard(card) : null;
  if(!pos) return false;
  if(typeof z === 'number' && (pos.z !== z || pos.r !== r || pos.c !== c)) return false;
  return cardHasDeferredSetEffect(card);
}

function clearPendingWhenSetEffectsForPlayer(player) {
  if(typeof forEachBoardCard !== 'function') return false;
  let cleared = false;
  forEachBoardCard(function(card){
    if(!card || !card._pendingWhenSetEffect) return;
    const owner = typeof card.owner === 'number' ? card.owner : card._pendingWhenSetEffect.owner;
    if(owner !== player) return;
    if(card.type === 'Supporter') card.whenSetActivated = true;
    delete card._pendingWhenSetEffect;
    cleared = true;
  });
  return cleared;
}

function clearStalePendingWhenSetEffects() {
  if(typeof forEachBoardCard !== 'function') return false;
  let cleared = false;
  forEachBoardCard(function(card){
    if(expireStalePendingWhenSetEffect(card)) cleared = true;
  });
  return cleared;
}

async function activatePendingWhenSetEffect(card, z, r, c) {
  if(!canActivatePendingWhenSetEffect(card, z, r, c, G.currentPlayer)) {
    toast('This effect can only be activated during its owner\'s turn.');
    return;
  }
  if(card._pendingWhenSetActivationInFlight) return;
  if(typeof tutorialCanActivateBoardEffect === 'function' && !tutorialCanActivateBoardEffect(card, z, r, c)) return;
  const pos = typeof findBoardPositionForCard === 'function' ? findBoardPositionForCard(card) : {z,r,c};
  const az = pos && typeof pos.z === 'number' ? pos.z : z;
  const ar = pos && typeof pos.r === 'number' ? pos.r : r;
  const ac = pos && typeof pos.c === 'number' ? pos.c : c;
  if(card.type === 'Supporter' && typeof canActivateLandscapeSupporterEffect === 'function' && !canActivateLandscapeSupporterEffect(G.currentPlayer)) {
    toast('Snow on the Carpathians: only one Supporter effect can activate each turn.');
    if(typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('Snow on the Carpathians', 'major');
    return;
  }
  card._pendingWhenSetActivationInFlight = true;
  delete card._pendingWhenSetEffect;
  if(card.type === 'Supporter') card.whenSetActivated = true;
  if(typeof closeModal === 'function') closeModal();
  try {
    if(typeof playEffectActivationCinematic === 'function') {
      await playEffectActivationCinematic(card, az, ar, ac, {source:'pending-when-set'});
    }
    await triggerWhenSet(card, az, ar, ac, { forceImmediate:true, manualActivation:true, skipActivationCinematic:true });
    if(typeof tutorialEvent === 'function' && _tutorialActive) tutorialEvent('activateEffect', {card, id:card.id, z:az, r:ar, c:ac});
  } finally {
    delete card._pendingWhenSetActivationInFlight;
  }
  renderGame({board:true, hand:true, scores:true, piles:true, oppHand:true, blocks:true, topbar:true});
}

async function triggerWhenSet(inst, z, r, c, opts = {}) {
  if(!inst || isFaceDownCard(inst)) return;
  if(typeof applyPermanentEffectImmunity === 'function') applyPermanentEffectImmunity(inst);
  const cp = G.currentPlayer;
  const opp = 1-cp;
  const id = inst.id;
  // Rivera (51): active declared affiliation buff applies to cards as they are set.
  applyRiveraBuffToPlacedCard(inst, inst.owner);

  // Suppress check: only if current player is the suppression target
  if(G.oppSuppressedNextTurn && G.suppressTarget===cp && inst.type==='Supporter' && !isEffectImmuneSource(inst)) {
    showBlockedAnimation('Effect SUPPRESSED - Semper Fidelis');
    return;
  }

  // By default, set effects are queued so the player deliberately activates them
  // from the card window instead of receiving a modal the moment the card lands.
  const _hasWhenSet = WHEN_SET_IDS.has(id);
  const isInitiatorWithEffect = inst.type==='Initiator' && INITIAL_SET_INITIATOR_IDS.has(id) && !inst.effectUsedInitial;
  if(!opts.forceImmediate && whenSetEffectsAreDeferred() && cardHasDeferredSetEffect(inst) && (_hasWhenSet || isInitiatorWithEffect)) {
    queueDeferredWhenSetEffect(inst, z, r, c);
    G.selectedBoardCard = null;
    return;
  }

  // Initiators fire their character effect
  if(isInitiatorWithEffect) {
    beginInitialSetEffectGuard(inst);
    G.selectedBoardCard = {card:inst,z,r,c};
    await triggerCharacterEffect(inst,z,r,c,{fromSet:true});
    G.selectedBoardCard = null;
    if(inst._effectNegatedByReaction) { markInitialEffectResolved(inst); return; }
  }
  // When-set effects fire automatically
  if(_hasWhenSet) {
    await runWhenSetEffect(inst,z,r,c);
  }
  G.selectedBoardCard = null;
}

const RETRYABLE_INITIAL_SET_EFFECT_IDS = new Set(['03','04','17','22','30','39','43','66','82']);

function beginInitialSetEffectGuard(card) {
  if(!card || !RETRYABLE_INITIAL_SET_EFFECT_IDS.has(String(card.id || ''))) return;
  card._initialSetEffectGuard = {
    turn: G.turn,
    player: G.currentPlayer,
    applied: false
  };
}

function markInitialEffectResolved(card) {
  if(!card) return;
  if(card._initialSetEffectGuard) card._initialSetEffectGuard.applied = true;
  card._effectTurnLocked = true;
}

function markInitialEffectResolvedByIid(iid) {
  if(!iid || typeof forEachBoardCard !== 'function') return;
  forEachBoardCard(function(card){
    if(card && card.iid === iid) markInitialEffectResolved(card);
  });
}

function canRetryInitialSetEffect(card) {
  if(!card || !card._initialSetEffectGuard) return false;
  const guard = card._initialSetEffectGuard;
  return !guard.applied && guard.turn === G.turn && guard.player === G.currentPlayer && card.owner === G.currentPlayer;
}

window.markInitialEffectResolved = markInitialEffectResolved;
window.canActivatePendingWhenSetEffect = canActivatePendingWhenSetEffect;
window.activatePendingWhenSetEffect = activatePendingWhenSetEffect;

// Actual effect execution (separated so prompt can wrap it)
async function runWhenSetEffect(inst, z, r, c) {
  if(!inst || isFaceDownCard(inst)) return;
  const cp = G.currentPlayer;
  const opp = 1-cp;
  const id = inst.id;
  if(typeof updateDailyChallengeProgress === 'function' && !(G.aiEnabled && cp === G.aiPlayer) && !G._isSpectator){
    updateDailyChallengeProgress('effects', 1, 'add');
    if(inst.type === 'Supporter') updateDailyChallengeProgress('supporterEffects', 1, 'add');
  }
  if(inst.type==='Supporter' && inst.id!=='92' && !isEffectImmuneSource(inst)) {
    let lumberjack = null;
    if(G.board && G.board[z]) G.board[z].forEach((row, rr)=>row && row.forEach((cell, cc)=>{
      if(!lumberjack && cell && cardActsAsPassive(cell, '92') && cell.owner===cp && cell.iid!==inst.iid && !isFaceDownCard(cell) && !isSupporterEffectSuppressed(cell)) lumberjack = cell;
    }));
    if(lumberjack) {
      inst._lumberjackSuppressed = true;
      inst._lydiaSuppressed = true;
      inst._reinforcementBonus = (Number(inst._reinforcementBonus) || 0) + 1;
      showBlockedAnimation('Effect SUPPRESSED - Wood for the Hearth');
      toast(inst.name+' gains +1 Reinforcement, but its effect is suppressed by Wood for the Hearth.');
      renderGame({board:true, scores:true, topbar:true});
      return;
    }
  }

  if(inst.type==='Supporter' && !canActivateLandscapeSupporterEffect(cp)) {
    toast('Snow on the Carpathians: only one Supporter effect can activate each turn.');
    if(typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('Snow on the Carpathians', 'major');
    return;
  }

  // Mark when-set effects as spent before any target picker opens; stale card
  // panels should not be able to fire the same source again while it resolves.
  if(inst.type==='Supporter') {
    inst.whenSetActivated = true;
    inst.effectUsedInitial = true;
  }

  // Reaction check: opponent Supporter effects that target the opponent can be negated
  // by Lydia (56) or Havano Citizen (79)
  // Lydia can react to opponent card effect activations; set-triggered effects also have their while-on-field effects suppressed.
  if(inst.type==='Supporter' && isPersistentSupporterEffectOnSet(inst) && !G._suppressEffectPrompt){
    const proceed = await checkReactions('supporter_effect', {
      card:inst,
      z,
      r,
      c,
      sourceOwner:cp,
      affectedOwners:getSupporterEffectAffectedOwners(inst, z, r, c, cp, opp)
    });
    if(proceed) recordSupporterEffectActivation(cp, inst);
    return;
  }

  if(isPersistentSupporterEffectOnSet(inst)) {
    recordSupporterEffectActivation(cp, inst);
  }

  if(inst.type==='Supporter' && WHEN_SET_IDS.has(inst.id) && inst.id!=='56' && !G._suppressEffectPrompt){
    const proceed = await checkReactions('supporter_effect', {
      card:inst,
      z,
      r,
      c,
      sourceOwner:cp,
      affectedOwners:getSupporterEffectAffectedOwners(inst, z, r, c, cp, opp)
    });
    if(proceed) {
      recordSupporterEffectActivation(cp, inst);
      await _executeWhenSetSwitch(inst, z, r, c, cp, opp, id);
    }
    return;
  }

  // Havano reacts only when it is affected; Lydia can negate any fresh effect activation.
  const affectedByCharacterEffect = getCharacterEffectAffectedOwners(inst, z, r, c, cp, opp);
  if(inst.type!=='Supporter' && !G._suppressEffectPrompt){
    const proceed = await checkReactions('when_set_effect', {
      card:inst,
      z,
      r,
      c,
      sourceOwner:cp,
      affectedOwners:affectedByCharacterEffect,
      fromSet:true
    });
    if(proceed) await _executeWhenSetSwitch(inst, z, r, c, cp, opp, id);
    return;
  }

  await _executeWhenSetSwitch(inst, z, r, c, cp, opp, id);
}

function renderEffectResolutionForPlayer(player, options) {
  if(typeof renderBoardActionForPlayer === 'function') {
    renderBoardActionForPlayer(player, options || {});
    return;
  }
  const parts = {board:true, scores:true, blocks:true, topbar:true};
  const p = Number.isFinite(Number(player)) ? Number(player) : G.currentPlayer;
  const viewer = typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : 0;
  const handPart = p === viewer ? 'hand' : 'oppHand';
  const oppHandPart = handPart === 'hand' ? 'oppHand' : 'hand';
  const opts = options || {};
  if(opts.hand !== false) parts[handPart] = true;
  if(opts.oppHand) parts[oppHandPart] = true;
  if(opts.bothHands) { parts.hand = true; parts.oppHand = true; }
  if(opts.piles) parts.piles = true;
  if(opts.landscape) parts.landscape = true;
  renderGame(parts);
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
        }
        restoreAnickaIfNeeded();
        toast('Extra safe row created in Zone '+(z+1)+'!');
        log(cp===0?'p1':'p2','Starlit Path: extra safe row in Zone '+(z+1));
        renderEffectResolutionForPlayer(cp, {hand:false, blocks:true});
        // Guard against late row rebuilds/extra-row layout changes visually dropping Anicka.
        setTimeout(function(){
          restoreAnickaIfNeeded();
          const rendered = document.querySelector('#board .bc[data-iid="'+String(anickaIid)+'"]');
          if(!rendered && anickaStillOnBoard()) renderEffectResolutionForPlayer(cp, {hand:false, blocks:true});
        }, 80);
      } break;
    case '12': // Makenna: when set, select 2 cards in zone to make immune
      {
        inst.effectUsedInitial = true;
        // Delay slightly so the card is rendered first
        setTimeout(()=>{
          pickMultipleInZone(z,2,'Makenna: Select up to 2 friendly cards to make immune:',(targets)=>{
            targets.forEach(t=>{
              if(!(typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(t.card))) t.card.immuneFlag=true;
            });
            toast('Selected cards are now immune');
            renderEffectResolutionForPlayer(cp, {hand:false});
          }, c=>c.owner===cp);
        },100);
      } break;
    case '05': // 17th British Regiment: select card in zone, +3 Fate
      pickCardInZone(z,'Select a card to gain 3 Fate:',(tgt,tz,tr,tc)=>{
        modifyFate(tgt,3,'permanent');
        log(cp===0?'p1':'p2',`Liberators of Rwanda: ${tgt.name} gains 3 Fate`);
        renderEffectResolutionForPlayer(cp, {hand:false});
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
    case '27': // Kazumi: automatic draw on set
      await drawCard(cp,3);
      toast('Kazumi: drew 3 cards');
      renderEffectResolutionForPlayer(cp, {hand:true});
      break;
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
            fatePushDiscard(cp, c);
          });
          renderHand();
        });
      } break;
    case '31': // Hemorrhaging Wound: any card in zone loses 3 Fate
      pickCardInZone(z,'Select any card to lose 3 Fate:',(tgt)=>{
        if(typeof isFullyEffectImmuneCard === 'function' ? isFullyEffectImmuneCard(tgt) : (tgt.immuneFlag || tgt.id==='76')){showBlockedAnimation('this card is immune');return;}
        const before = typeof getEffectiveFate === 'function' ? getEffectiveFate(tgt, z) : (tgt.currentFate || tgt.fate || 0);
        const changed = reduceStoredCardFateBy(tgt, 3, cp);
        if(!changed && before > 0){
          showBlockedAnimation('Shield Wall prevents Fate loss');
          return;
        }
        log(cp===0?'p1':'p2',`Hemorrhaging Wound: ${tgt.name} loses 3 Fate`);
        renderEffectResolutionForPlayer(cp, {hand:false});
      }, function(cell){ return !!cell && !(typeof isFullyEffectImmuneCard === 'function' ? isFullyEffectImmuneCard(cell) : (cell.immuneFlag || cell.id==='76')); }); break;
    case '16': // MINAE Death Squad: discard opponent supporter in zone
      pickCardInZone(z,'Select an opponent Supporter to discard:',(tgt,tz,tr,tc)=>{
        if(tgt === inst || (tgt.iid && inst.iid && tgt.iid === inst.iid)){toast('MINAE Death Squad cannot discard itself');return;}
        if(tgt.owner!==opp||tgt.type!=='Supporter'){toast('Must select opponent Supporter');return;}
        discardBoardCard(tgt,tz,tr,tc);
        log(cp===0?'p1':'p2',`MINAE Death Squad: discarded ${tgt.name}`);
        renderEffectResolutionForPlayer(cp, {hand:false, piles:true});
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
      const recoverableSupporters = typeof getRecoverableDiscardCards === 'function' ? getRecoverableDiscardCards(cp, c=>c.type==='Supporter') : G.players[cp].discard.filter(c=>c.type==='Supporter');
      if(recoverableSupporters.length===0){
        toast('No supporters in discard');break;
      }
      pickFromDiscard(cp,'Supporter','Add a Supporter from discard to hand:',(c)=>{
        if(typeof queueSearchToHandMotion === 'function') queueSearchToHandMotion(cp, c, 'discard', G.players[cp].hand.length);
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
      if(typeof applyPermanentEffectImmunity === 'function') applyPermanentEffectImmunity(inst);
      inst._suppressNextFatePulse = true;
      inst.currentFate = 5; // 1 base + 4
      inst.immuneFlag = true;
      inst.noBonus = true;
      inst.noConsolidate = true;
      renderEffectResolutionForPlayer(cp, {hand:false, blocks:false, topbar:false, effects:false, hover:false}); break;
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
        renderEffectResolutionForPlayer(cp, {hand:false});
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
          if(c.id===target.id){ fatePushDiscard(opp, c); discarded++; }
          else stillInHand.push(c);
        });
        G.players[opp].hand = stillInHand;
        const oppDeck = G.players[opp].deck;
        const stillInDeck = [];
        oppDeck.forEach(c=>{
          if(c.id===target.id){ fatePushDiscard(opp, c); discarded++; }
          else stillInDeck.push(c);
        });
        G.players[opp].deck = stillInDeck;
        toast(`${discarded} ${target.name} discarded from opponent`);
        if(typeof showMariaDiscardBadge === 'function') showMariaDiscardBadge(target, discarded, tz, tr, tc);
        log(cp===0?'p1':'p2',`Maria Song discarded ${discarded} ${target.name}`);
        renderEffectResolutionForPlayer(cp, {bothHands:true, piles:true});
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
        const el = document.querySelector(`#board .cell[data-z="${opt.z}"][data-r="${opt.r}"][data-c="${opt.c}"]`);
        if(el) el.classList.add('placeable','move-target');
      });
      break;
    }
    case '64': { // Cook Islands Duelist: passive handled in getEffectiveFate
      toast('Blade Dance is passive - it applies while Cook Islands Duelist is on the field.');
      break;
    }
    case '66': { // Mark Menz: declare affiliation via icon picker, change cards in zone
      showAffiliationPickerVisual((aff)=>{
        let changed = 0;
        const changedCards = [];
        G.board[z].forEach(row=>row.forEach(cell=>{
          if(cell && cell.owner===cp && !(typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(cell)) && cell.aff!==aff){
            cell.aff = aff;
            if(typeof applyRiveraBuffToPlacedCard === 'function') applyRiveraBuffToPlacedCard(cell, cp);
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
          markInitialEffectResolved(inst);
        } else {
          toast('No cards changed');
        }
        log(cp===0?'p1':'p2','Mark Menz declared '+(AFF_LABEL[aff]||aff)+', changed '+changed+' cards');
        inst.effectUsedInitial = true;
        renderEffectResolutionForPlayer(cp, {hand:false});
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
      pickCardsVisual(matches,{title:'Home of the Wolfpack',subtitle:'Add a Coordinator (non-Star) to your hand',maxCount:1,confirmLabel:'Add to Hand',immediate:true},(picked)=>{
        if(picked.length===0) return;
        const chosen = picked[0];
        if(typeof queueSearchToHandMotion === 'function') queueSearchToHandMotion(cp, chosen, 'deck', G.players[cp].hand.length);
        if(typeof addCardToHand==='function') addCardToHand(cp, chosen);
        else G.players[cp].hand.push(chosen);
        G.players[cp].deck = G.players[cp].deck.filter(d=>d.iid!==chosen.iid);
        shuffleDeck(cp);
        if(typeof playSfx === 'function') playSfx('searchFound');
        renderEffectResolutionForPlayer(cp, {hand:false});
        toast(`Added ${chosen.name} to hand`);
      });
      break;
    }
    case '69': { // Breakfast Republic Busser: grant adjacent-zone movement for three moves
      const candidates = [];
      if(G.board[z]) G.board[z].forEach((row,ri)=>row.forEach((cell,ci)=>{
        if(cell && cell.owner===cp && !isFaceDownCard(cell) && !cell.cantBeMoved && !cell.immuneFlag && cell.id!=='76'){
          candidates.push({card:cell,z:z,r:ri,c:ci});
        }
      }));
      if(candidates.length===0){toast('No movable friendly cards in this zone');break;}
      pickCardInZone(z,'Corner! Behind!: select a friendly card in this zone to move between adjacent zones.',(target)=>{
        if(!target || target.owner!==cp || isFaceDownCard(target) || target.cantBeMoved || target.immuneFlag || target.id==='76'){
          toast('Select a movable friendly card');
          return;
        }
        target._busserMoves = Math.max(3, Number(target._busserMoves||0)||0);
        target._busserOwner = cp;
        target._busserMovedThisTurn = false;
        target._busserSourceIid = inst.iid || null;
        inst.effectUsedInitial = true;
        inst.whenSetActivated = true;
        toast(target.name + ' can move to adjacent zones.');
        if(typeof showBusserStatusBanner === 'function') showBusserStatusBanner(target, 3, cp);
        if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
        else if(typeof renderTopbarEffects === 'function') renderTopbarEffects();
        renderEffectResolutionForPlayer(cp, {hand:false});
      }, cell=>cell && cell.owner===cp && !isFaceDownCard(cell) && !cell.cantBeMoved && !cell.immuneFlag && cell.id!=='76');
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
      const onlineIdx = deterministicOnlineRandomIndex(oppHand.length, 'roboEnLaNoche', cp);
      const idx = onlineIdx >= 0 ? onlineIdx : Math.floor(rng()*oppHand.length);
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
        fatePushDiscard(cp, dc);
      });
      if(totalFate>0){
        modifyFate(inst, totalFate, 'permanent');
        toast(`Discarded ${toDiscard.length} characters, gained ${totalFate} Fate!`);
      } else {
        toast('No characters to discard');
      }
      inst._canMoveOncePerTurn = true;
      renderEffectResolutionForPlayer(cp, {hand:false, piles:true});
      break;
    }
    case '80': { // Apparition of Berkeley: discard a character you control in this zone, draw 2
      const myChars = [];
      G.board[z].forEach((row,ri)=>row.forEach((cell,ci)=>{
        if(cell && cell.owner===cp && (typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(cell, cp) : cell.type!=='Supporter') && cell.iid!==inst.iid){
          myChars.push({card:cell,r:ri,c:ci});
        }
      }));
      if(myChars.length===0){toast('No characters to discard');break;}
      pickCardInZone(z,'Political Ramblings: select one of your characters in this zone to discard and draw 2 cards.',async (target,tz,tr,tc)=>{
        if(!target) return;
        const src = myChars.find(x=>x.card.iid===target.iid);
        if(src){
          G.board[z][src.r][src.c] = null;
          fatePushDiscard(cp, target);
          await drawCard(cp,2);
          toast(`Discarded ${target.name}, drew 2 cards`);
          renderEffectResolutionForPlayer(cp, {hand:true, piles:true});
        }
      }, cell=>cell && cell.owner===cp && (typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(cell, cp) : cell.type!=='Supporter') && cell.iid!==inst.iid);
      break;
    }
    case '84': { // Kvetka Svoboda: set an Expanded Worlds character from deck for free
      const matches = G.players[cp].deck.filter(c=>{
        const base = (typeof CARDS !== 'undefined' && Array.isArray(CARDS)) ? CARDS.find(x=>String(x.id) === String(c.id)) : null;
        const aff = String((c.aff || (base && base.aff) || '')).toLowerCase().replace(/\s+/g, '_');
        const type = String(c.type || (base && base.type) || '').toLowerCase();
        const rarity = String(c.rarity || (base && base.rarity) || '').toLowerCase();
        const effectiveCard = Object.assign({}, base || {}, c || {}, {owner: cp});
        return aff === 'expanded_worlds' &&
          type && (type !== 'supporter' || (typeof isCardCharacterForRules === 'function' && isCardCharacterForRules(effectiveCard, cp))) &&
          rarity !== 'star' &&
          String(c.id) !== '84';
      });
      if(!matches.length){toast('No eligible Expanded Worlds Character in deck');break;}
      pickCardsVisual(matches, {
        title:'Flower Picking',
        subtitle:'Choose an Expanded Worlds Character to set for free.',
        maxCount:1,
        confirmLabel:'Set for Free',
        immediate:true
      }, (picked)=>{
        const found = picked && picked[0];
        if(!found) return;
        G.players[cp].deck = G.players[cp].deck.filter(x=>x.iid!==found.iid);
        if(typeof addCardToHand==='function') addCardToHand(cp, found, {announce:false});
        else G.players[cp].hand.push(found);
        beginImmediateFreePlacement(cp, found, 'Place '+found.name+' for free from Flower Picking.', {
          key:'kvetka-svoboda-free-set',
          name:'Kvetka Svoboda',
          ability:'Flower Picking',
          text:'Flower Picking: this card can be set immediately for free.'
        });
        toast(found.name+' is ready to set immediately for free.');
        inst.effectUsedInitial = true;
      });
      break;
    }
    case '91': { // Wodny Potok Villager: lock opponent landscape changes
      if(!Array.isArray(G._snowyVillageUses)) G._snowyVillageUses = [0,0];
      if(!Array.isArray(G._landscapeChangeLocks)) G._landscapeChangeLocks = [0,0];
      if((Number(G._snowyVillageUses[cp]) || 0) >= 2){
        toast('A Snowy Village can only activate twice a game.');
        break;
      }
      G._snowyVillageUses[cp] = (Number(G._snowyVillageUses[cp]) || 0) + 1;
      G._landscapeChangeLocks[opp] = Math.max(Number(G._landscapeChangeLocks[opp]) || 0, 5);
      toast('A Snowy Village: opponent cannot change the landscape for 5 turns.');
      if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
      break;
    }
    case '94': { // Wodny Potok Mailman: delayed Triangle delivery
      const matches = G.players[cp].deck.filter(c=>c.rarity==='triangle');
      if(!matches.length){toast('No Triangle cards in deck');break;}
      pickCardsVisual(matches, {
        title:'Mail Delivery',
        subtitle:'Choose a Triangle card from your deck. It will arrive in four of your turns.',
        maxCount:1,
        confirmLabel:'Schedule Delivery',
        immediate:true
      }, (picked)=>{
        const found = picked && picked[0];
        if(!found) return;
        G.players[cp].deck = G.players[cp].deck.filter(x=>x.iid!==found.iid);
        ensureMailDeliveryState().push({player:cp, card:found, turnsLeft:4, sourceIid:inst.iid});
        toast(found.name + ' will arrive in four turns.');
        inst.whenSetActivated = true;
        if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
        renderEffectResolutionForPlayer(cp, {hand:true, piles:true});
      });
      break;
    }
    case '20': // Shield Wall: continuous, protect zone from fate reduction + no movement
      if(!G.shieldWallZones.includes(z)) G.shieldWallZones.push(z);
      G.board[z].forEach(row=>row.forEach(cell=>{
        if(cell) cell.cantBeMoved = true;
      }));
      renderEffectResolutionForPlayer(cp, {hand:false, blocks:true});
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
          beginImmediateFreePlacement(cp, extra, 'Place the extra Zimbabwean Honor Guard for free.', {
            key:'zimbabwean-honor-guard-free-set',
            name:'Zimbabwean Honor Guard',
            ability:'Africa, United',
            text:'Africa, United: this extra copy can be set immediately for free.'
          });
          toast('Another Zimbabwean Honor Guard is ready to set immediately for free!');
        }
      } break;
    case '28': // 2nd Polish-Lithuanian Army: can be set from deck (once/turn, twice/game)
      // Already handled — this is a "when set" card, the special part is SETTING from deck
      // which would be a UI entry elsewhere. For now, mark uses.
      if(!inst._plUsesLeft) inst._plUsesLeft = 2;
      break;
    case '37': // 6th French Fusiliers: copy a while-on-field Supporter passive.
      chooseFrenchFusiliersPassive(inst, z);
      break;
    case '35': { // Alexander the Magnificient: snapshot Fate = sum of own Supporters' effective current Fate in zone at time of set
        let alexSum = 0;
        const boardZone = (G.board && G.board[z]) ? G.board[z] : [];
        boardZone.forEach(row=>row.forEach(cell=>{
          if(cell && cell.owner===cp && cell.type==='Supporter' && cell.iid!==inst.iid)
            alexSum += Number(typeof getEffectiveFate === 'function' ? getEffectiveFate(cell, z) : (cell.currentFate ?? cell.fate ?? 0)) || 0;
        }));
        inst.currentFate = alexSum + (Number(inst._landscapeStaticFateBonus) || 0);
        toast('Hellenic Glory: Alexander set with '+inst.currentFate+' Fate from Supporters!');
        log(cp===0?'p1':'p2', 'Alexander set with '+inst.currentFate+' Fate from Supporters');
        renderEffectResolutionForPlayer(cp, {hand:false});
      } break;
    case '45': // Chingachlook: placement restriction is enforced before setting.
      break;
    case '47': // Great Oak Infantry: when used for consolidation, new card gains 3 Fate
      inst._greatOakBonus = true;
      break;
    case '52': {
      if(typeof activateVigilantes === 'function') activateVigilantes(inst, z, r, c);
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
    case '56': // Lydia: negate opponent card effect activations (5 uses)
      inst.usesLeft = 5; break;
    case '40': // Christopher Erbs: initialize 2 uses
      inst.usesLeft = 2; break;
    case '14': // Alondra Hopkins: discard adjacent OR diagonal opponent supporters when set
      {
        const adjCards = getAdjacentAndDiagonalCards(z,r,c);
        let gained = 0;
        adjCards.forEach(({card:ac,z:az,r:ar,c:ac2})=>{
          if(ac.owner===opp && ac.type==='Supporter' && !(typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(ac))){
            G.board[az][ar][ac2]=null;
            fatePushDiscard(opp, ac);
            gained++;
            log(cp===0?'p1':'p2',`Alondra discarded ${ac.name}`);
          }
        });
        if(gained) inst.currentFate += gained;
        if(gained) toast(`Alondra discarded ${gained} adjacent supporters, gained ${gained} Fate`);
        renderEffectResolutionForPlayer(cp, {hand:false, piles:true});
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

  // Artillery Distance (50) zone lock: prevent effect activation in locked zone (auras unaffected).
  // If Berkeley CS Major left the field, effect suppression is lifted but zone lock remains.
  if(typeof G._artilleryLockedZone==='number' && G._artilleryLockedZone===z && G._artilleryLockOwner===cp && G._artilleryLockTurnsLeft>0 && !G._artilleryEffectBlockLifted) {
    // Auras (Coordinators with passive effects) are unaffected — only block active activation
    const isPassiveAura = card.type==='Coordinator';
    if(!isPassiveAura) {
      toast('This zone is locked by Artillery Distance - cannot activate effects here!');
      playSfx('blocked');
      return;
    }
  }

  // Manual activation feedback resolves before prompts or effect windows open.
  const isPassiveOnly = card.type==='Coordinator' && ['01','10','11','15','19','23','34','57'].includes(id);
  if(!opts.fromSet && !isPassiveOnly && typeof playEffectActivationCinematic === 'function') {
    await playEffectActivationCinematic(card, z, r, c, {source:'manual-character'});
    if(typeof G !== 'undefined' && G) G._allowImmediateEffectPickerUntil = Date.now() + 1400;
  }

  // Initiators: fire ONCE (on placement). If already used, don't fire again.
  // Coordinators: passive/continuous or once per placement.
  // Dauntless: most have ongoing/active effects; handled case-by-case below.
  // Improvisors: triggered/reactive.
  if(card.type==='Initiator' && card.effectUsedInitial && card._effectTurnLocked){
    toast(card.name + "'s Initiator effect already activated.");
    return;
  }
  if(card.type==='Initiator' && INITIAL_SET_INITIATOR_IDS.has(id) && !opts.fromSet && !isSameTurnAsCardSet(card)){
    toast(card.name + "'s Initiator effect can only activate on the turn it was set.");
    return;
  }
  if(card.type==='Coordinator' && card.effectUsedInitial && !['01','11','15','19','23','57'].includes(id)){
    toast(`${card.name}'s effect already activated.`);
    return;
  }
  if(id === '21' && card.effectUsedInitial){
    toast(`${card.name}'s effect already activated.`);
    return;
  }
  if(typeof updateDailyChallengeProgress === 'function' && !opts.fromSet && !(G.aiEnabled && cp === G.aiPlayer) && !G._isSpectator){
    updateDailyChallengeProgress('effects', 1, 'add');
  }
  if(card.type==='Initiator' && !G._suppressEffectPrompt){
    const proceed = await checkReactions('initiator_effect', {
      card,
      z,
      r,
      c,
      sourceOwner:cp,
      affectedOwners:getCharacterEffectAffectedOwners(card, z, r, c, cp, opp)
    });
    if(!proceed){
      card.effectUsedInitial = true;
      card._effectTurnLocked = true;
      card._effectNegatedByReaction = true;
      return;
    }
  }

  switch(id) {
    // Initiators
    case '03': // Howard: double Fate of card in zone, then +5
      pickCardInZone(z,'Select a card to double its current Fate, then gain +5:',(tgt)=>{
        if(typeof isFullyEffectImmuneCard === 'function' ? isFullyEffectImmuneCard(tgt) : (tgt.immuneFlag || tgt.id==='76')){showBlockedAnimation('this card is immune');return;}
        const before = Number(tgt.currentFate ?? tgt.fate ?? 0) || 0;
        tgt.currentFate = Math.max(0, Math.ceil(before * 2) + 5);
        log(cp===0?'p1':'p2',`Moffitt Inspiration: ${tgt.name} Fate became ${tgt.currentFate}`);
        markInitialEffectResolved(card);
        renderEffectResolutionForPlayer(cp, {hand:false});
      },c=>!(typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(c))); break;
    case '04': // Zoe: block consolidation on a square
      highlightForBlock(z, card); break;
    case '06': // Jorge Alvarez: search deck for non-star card
      searchDeckForCard(cp, c=>c.rarity!=='star','Search deck (no Stars):', inst=>{
        if(typeof queueSearchToHandMotion === 'function') queueSearchToHandMotion(cp, inst, 'deck', G.players[cp].hand.length);
        if(typeof addCardToHand==='function') addCardToHand(cp, inst);
        else G.players[cp].hand.push(inst);
        toast('Added '+inst.name+' to hand');
        renderHand();
      }); break;
    case '07': { // Maja Kaminska: add up to 3 deck supporters, buff them, then +2 supporter plays this turn
      const matches = G.players[cp].deck.filter(c=>c.type==='Supporter');
      if(!matches.length){
        G.extraSupportsThisTurn = (Number(G.extraSupportsThisTurn) || 0) + 2;
        toast('Maja added 2 extra Supporter placements this turn!');
        renderHand();
        updateTopBar();
        break;
      }
      pickCardsVisual(matches, {
        title:'Oblique Order',
        subtitle:'Choose up to 3 Supporters from your deck. They gain +4 Fate permanently.',
        maxCount:3,
        confirmLabel:'Add to Hand',
        immediate:true
      }, (chosen)=>{
        chosen.forEach(c=>{
          if(typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(c)) return;
          c.currentFate = Math.max(0, Number(c.currentFate ?? c.fate) || 0) + 4;
          if(typeof recordHandCardEffectModifier === 'function') {
            recordHandCardEffectModifier(c, {
              key:'maja-kaminska-oblique-order',
              name:'Maja Kaminska',
              text:'Oblique Order: this Supporter gained +4 Fate permanently.',
              fateDelta:4
            });
          }
          if(typeof queueSearchToHandMotion === 'function') queueSearchToHandMotion(cp, c, 'deck', G.players[cp].hand.length);
          if(typeof addCardToHand==='function') addCardToHand(cp, c);
          else G.players[cp].hand.push(c);
          G.players[cp].deck = G.players[cp].deck.filter(x=>x.iid!==c.iid);
        });
        G.extraSupportsThisTurn = (Number(G.extraSupportsThisTurn) || 0) + 2;
        if(chosen.length) shuffle(G.players[cp].deck);
        toast('Maja added '+chosen.length+' Supporter'+(chosen.length===1?'':'s')+' and unlocked 2 extra Supporter placements!');
        renderEffectResolutionForPlayer(cp, {hand:true, piles:true});
      });
    } break;
    case '08': // Lina: search Reality card from deck/discard, set for free
      searchAnySource(cp,c=>c.aff==='reality','Search for a Reality card:',(found)=>{
        const source = G.players[cp].deck.some(x=>x && x.iid===found.iid) ? 'deck' : 'discard';
        if(typeof queueSearchToHandMotion === 'function') queueSearchToHandMotion(cp, found, source, G.players[cp].hand.length);
        if(typeof addCardToHand==='function') addCardToHand(cp, found);
        else G.players[cp].hand.push(found);
        beginImmediateFreePlacement(cp, found, 'Place ' + found.name + ' for free from Lina\'s effect.', {
          key:'lina-free-set',
          name:'Lina',
          ability:'Autistic Femcel Rizz',
          text:'Autistic Femcel Rizz: this card can be set immediately for free.'
        });
        toast(found.name+' is ready to set immediately for free!');
      }); break;
    case '13': // Johnathan Kirby: search deck for 2 supporters
      searchDeckForType(cp,'Supporter','Search for up to 2 Supporters:',2); break;
    case '22': // Isaac Perez: choose up to 2 controlled cards in this zone; +3 Fate permanently
      pickMultipleInZone(z,2,'Isaac Perez: Select up to 2 cards you control in this zone to gain +3 Fate permanently:',(targets)=>{
        if(!targets || !targets.length){toast('No cards selected');return;}
        targets.forEach(t=>{
          const target = t.card || t;
          if(target && target.owner===cp) modifyFate(target,3,'permanent');
        });
        toast('Isaac increased '+targets.length+' card'+(targets.length===1?'':'s')+' by +3 Fate permanently');
        markInitialEffectResolved(card);
        renderEffectResolutionForPlayer(cp, {hand:false});
      },c=>c.owner===cp); break;
    case '82': { // Felicyta Janowicz (Youth): change landscape
      if(isLandscapeChangeBlockedFor(cp)){
        toast('A Snowy Village prevents you from changing the landscape right now.');
        if(typeof playSfx === 'function') playSfx('blocked');
        break;
      }
      if(typeof showLandscapeChoiceModal !== 'function' || typeof transitionGameLandscape !== 'function'){
        toast('Landscape selection is unavailable.');
        break;
      }
      showLandscapeChoiceModal(0, function(song){
        transitionGameLandscape(song, {player:cp, sourceCard:card});
        markInitialEffectResolved(card);
        card.effectUsedInitial = true;
        renderGame({board:true, scores:true, landscape:true, topbar:true});
      });
      break;
    }
    case '83': { // Sebastyen Janowicz: friendly characters in zone +2 permanently
      let count = 0;
      G.board[z].forEach(row=>row && row.forEach(cell=>{
        if(cell && cell.owner===cp && (typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(cell, cp) : cell.type!=='Supporter') && !isFaceDownCard(cell) && !(typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(cell))){
          modifyFate(cell, 2, 'permanent');
          count++;
        }
      }));
      toast('Visegrad: '+count+' Character card'+(count===1?'':'s')+' gained 2 Fate.');
      renderEffectResolutionForPlayer(cp, {hand:false});
      break;
    }
    case '27': // Kazumi: draw 3
      await drawCard(cp,3);
      toast('Drew 3 cards');
      renderHand(); break;
    case '29': // Dylan Kirby: choose up to 2 Third Great War from deck or discard
      {
        const recoverableTgw = typeof getRecoverableDiscardCards === 'function' ? getRecoverableDiscardCards(cp, c=>c.aff==='third_great_war') : G.players[cp].discard.filter(c=>c.aff==='third_great_war');
        const from=[...G.players[cp].deck.filter(c=>c.aff==='third_great_war'),...recoverableTgw];
        if(!from.length){toast('No Third Great War cards available');break;}
        pickCardsVisual(from, {
          title:'Leader of the Free World',
          subtitle:'Choose up to 2 Third Great War cards to add to your hand',
          maxCount:2,
          confirmLabel:'Add to Hand',
          immediate:true
        }, (chosen)=>{
          chosen.forEach(c=>{
            const source = G.players[cp].deck.some(x=>x && x.iid===c.iid) ? 'deck' : 'discard';
            if(typeof queueSearchToHandMotion === 'function') queueSearchToHandMotion(cp, c, source, G.players[cp].hand.length);
            if(typeof addCardToHand==='function') addCardToHand(cp, c);
            else G.players[cp].hand.push(c);
            G.players[cp].deck=G.players[cp].deck.filter(x=>x.iid!==c.iid);
            G.players[cp].discard=G.players[cp].discard.filter(x=>x.iid!==c.iid);
          });
          if(chosen.length) toast(`Added ${chosen.length} card(s) to hand`);
          shuffle(G.players[cp].deck);
          renderEffectResolutionForPlayer(cp, {hand:true, piles:true});
        });
      } break;
    case '30': // Santiago: discard an opponent card in this zone's contested row
      pickCardInZone(z,'Select an opponent card in this zone\'s contested row to discard:',(tgt,tz,tr,tc)=>{
        if(tgt.owner===cp){toast('Must select opponent card');return;}
        if(typeof isFullyEffectImmuneCard === 'function' ? isFullyEffectImmuneCard(tgt) : (tgt.immuneFlag || tgt.id==='76')){showBlockedAnimation('this card is immune');return;}
        if(tr!==1){toast('Santiago can only target the contested row');return;}
        discardBoardCard(tgt,tz,tr,tc);
        log(cp===0?'p1':'p2',`El Matador del Mares: discarded ${tgt.name}`);
        markInitialEffectResolved(card);
        renderEffectResolutionForPlayer(cp, {hand:false, piles:true});
      },(c,tz,tr)=>c.owner===opp && tr===1 && !(typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(c))); break;
    case '39': // Juan Carlos: move opponent's card from ANY zone to open spot
      pickCardFromAnyZone('Select opponent\'s card to move:',(tgt,tz,tr,tc)=>{
        if(tgt.owner===cp){toast('Select opponent card');return;}
        showMoveTarget(tgt,tz,tr,tc,z,{
          title:'Juan Carlos',
          prompt:`Move ${tgt.name} into Juan Carlos' current zone`,
          horizontalZones:true,
          disallowRows:[cp===0 ? 2 : 0],
          sourceCard:card
        });
      },c=>c.owner===opp); break;
    case '43': { // Mark Kemper: choose one extra safe cell in this zone
      closeModal();
      const markStartSnap = {
        board: typeof getBoardScrollSnapshot === 'function' ? getBoardScrollSnapshot() : null,
        zones: typeof captureZoneRowScrollSnapshots === 'function' ? captureZoneRowScrollSnapshots() : null
      };
      G._markViewportSnap = markStartSnap;
      G._markSelecting = { player: cp, sourceIid: card.iid, zone: z };
      G.placing = true;
      clearPlaceHighlights();
      if(typeof renderBoardActionForPlayer === 'function') renderBoardActionForPlayer(cp, {hand:false, blocks:true, topbar:false, effects:false, hover:false});
      else renderGame({board:true, scores:true, blocks:true});
      restoreMarkViewportSnapshotRepeated(markStartSnap);
      document.querySelectorAll('#board .zone[data-zone="'+z+'"] .cell.mark-safe-choice,#board .zone[data-z="'+z+'"] .cell.mark-safe-choice').forEach(el=>el.classList.add('placeable'));
      toast('Choose one highlighted safe-square slot in Zone '+(z+1)+'.');
      setHint('Mark Kemper: click one highlighted safe-square slot in Zone '+(z+1)+'.');
      break;
    }
    case '48': // Cosmic GF: add Expanded Worlds from deck, then discard
      addAffFromDeckDiscard(cp,'expanded_worlds'); break;
    case '51': { // Rivera: declare affiliation, +4 Fate to matching characters for 3 of your turns
      showAffiliationPickerVisual((aff)=>{
        const riveraCard = card;
        startRiveraBuff(riveraCard, aff, riveraCard.owner != null ? riveraCard.owner : cp);
        toast('Rivera declared '+(AFF_LABEL[aff]||aff)+'! Character cards you set with that affiliation gain 4 Fate for 3 of your turns.');
        log(cp===0?'p1':'p2','Rivera declared '+(AFF_LABEL[aff]||aff)+' for matching characters for 3 of their turns');
        riveraCard.effectUsedInitial = true;
        renderEffectResolutionForPlayer(cp, {hand:false});
        if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
        updateTopBar();
        if(typeof showRiveraStatusBanner === 'function') setTimeout(()=>showRiveraStatusBanner(aff, 3, riveraCard.owner != null ? riveraCard.owner : cp), 80);
      });
      break;
    }
    case '87': { // Kvetka Svoboda (Ukulele): next-turn consolidation ballad
      const effects = ensureBalladState();
      effects[cp] = {active:true, ended:false, sourceIid:card.iid, startTurn:G.turn + 2, consolidatedIids:[]};
      toast('A Noble Effort at a Ballad will empower your consolidations starting next turn unless you set a Supporter.');
      if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
      break;
    }
    case '99': {
      activateBlameGameEffect(cp, card);
      card.effectUsedInitial = true;
      renderEffectResolutionForPlayer(cp, {hand:false});
      break;
    }
    case '90': { // Wojciech (Fisherman): declare affiliation, draw 2 random matching cards
      showAffiliationPickerVisual((aff)=>{
        const matches = G.players[cp].deck.filter(c=>c.aff===aff);
        const chosen = [];
        const rng = (typeof G._onlineRng === 'function') ? G._onlineRng : Math.random;
        while(matches.length && chosen.length < 2){
          const onlineIdx = deterministicOnlineRandomIndex(matches.length, `wojciechFisherman:${aff}:${chosen.length}`, cp);
          const idx = onlineIdx >= 0 ? onlineIdx : Math.floor(rng() * matches.length);
          chosen.push(matches.splice(idx, 1)[0]);
        }
        chosen.forEach(found=>{
          G.players[cp].deck = G.players[cp].deck.filter(x=>x.iid!==found.iid);
          if(typeof addCardToHand==='function') addCardToHand(cp, found);
          else G.players[cp].hand.push(found);
        });
        toast('Catch of the Day added '+chosen.length+' '+(AFF_LABEL[aff]||aff)+' card'+(chosen.length===1?'':'s')+'.');
        shuffle(G.players[cp].deck);
        card.effectUsedInitial = true;
        renderEffectResolutionForPlayer(cp, {hand:true, piles:true});
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
        targets.forEach(t=>{
          if(!(typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(t.card))) t.card.immuneFlag=true;
        });
        card.effectUsedInitial = true;
        toast('Selected cards are now immune');
        renderEffectResolutionForPlayer(cp, {hand:false});
      }, c=>c.owner===cp && !(typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(c))); break;
    case '15': // Zsofia Szocs: passive (handled in getEffectiveFate)
      toast('Blue Danube Waltz is passive — applies while Zsofia is on the field.');
      break;
    case '19': // Květka Svoboda: passive (handled in getEffectiveFate)
      toast('The Vltava\'s Story is passive — applies while Květka is on the field.');
      break;
    case '23': // Cathy: passive (handled in getEffectiveFate)
      toast('Cardigan Onslaught is passive — applies while Cathy is on the field.');
      break;
    case '86':
      toast('A Bombastic Character is passive - Boleslaw can be used as 3 Reinforcement and gives +4 Fate when spent.');
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
    case '100':
      toast('Wintertide is passive - it grows with Snow on the Carpathians and Felicyta/Kvetka cards.');
      break;

    // Dauntless
    case '21': // Henry Dong: discard from hand, gain 3 fate per card
      pickCardsFromHand(cp,999,'Discard cards to boost Henry Dong\'s Fate (+3 each):',(cards)=>{
        cards.forEach(c=>{
          G.players[cp].hand=G.players[cp].hand.filter(h=>h.iid!==c.iid);
          fatePushDiscard(cp, c);
          card.currentFate+=3;
        });
        toast(`Henry Dong gained ${cards.length*3} Fate!`);
        renderEffectResolutionForPlayer(cp, {hand:true, piles:true});
      }); break;
    case '38': // Jake: discard supporter, +3 Fate (once per turn)
      if(card.effectUsedThisTurn){toast('Jake can only use this effect once per turn');break;}
      pickCardsFromHand(cp,1,'Discard a Supporter for +3 Fate:',(cards)=>{
        if(!cards[0]||cards[0].type!=='Supporter'){toast('Must be a Supporter');return;}
        G.players[cp].hand=G.players[cp].hand.filter(h=>h.iid!==cards[0].iid);
        fatePushDiscard(cp, cards[0]);
        card.currentFate+=3;
        card.effectUsedThisTurn=true;
        toast('Jake gained 3 Fate!');
        renderEffectResolutionForPlayer(cp, {hand:true, piles:true});
      }); break;
    case 'bh25': // Jimmy Viltrumite: discard any card on field
      showModal('Left Hook of the Incel','Select any card on the field to discard:',
        [{label:'Choose Target',action:()=>{closeModal();pickAnyBoardCard(cp,(tgt,tz,tr,tc)=>{
          discardBoardCard(tgt,tz,tr,tc);
          toast('Discarded '+tgt.name);
          renderEffectResolutionForPlayer(cp, {hand:false, piles:true});
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
    case '56': // Lydia: negate opponent effect activations (5 uses)
      if(card.usesLeft>0){
        toast('Lydia is ready to negate an opponent effect activation ('+card.usesLeft+' uses remaining).');
      } else toast('No uses remaining.'); break;
    case '17': // Carolyn: block any open cell permanently
      {
        toast('Click any empty cell on the board to lock it permanently');
        G.placing = true;
        G.blockingCell = true;
        G._blockingEffectSourceIid = card.iid;
        clearPlaceHighlights();
        for(let zz=0;zz<3;zz++){
          const totalRows = G.board[zz]?G.board[zz].length:3;
          for(let rr=0;rr<totalRows;rr++) {
            const rowCap = typeof getBoardRowCapacity === 'function' ? getBoardRowCapacity(zz, rr) : 3;
            for(let cc=0;cc<rowCap;cc++){
              if(G.board[zz][rr]&&G.board[zz][rr][cc]===null && !isBlocked(zz,rr,cc) && !isOwnSafeRowSquare(zz, rr, cc, cp)){
                const el = document.querySelector(`#board .cell[data-z="${zz}"][data-r="${rr}"][data-c="${cc}"]`);
                if(el) el.classList.add('placeable','block-target-choice','carolyn-block-choice');
              }
            }
          }
        }
        window._blockZone = -1;
        if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function') {
          window.FateMatchRendererAdapter.scheduleRender('square-selection-state');
        }
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
const MANUAL_EFFECT_BLOCKED_CARD_IDS = new Set([
  '14',
  '35',
  '41',
  '45',
  '46',
  '61',
  '84',
  '85',
  '88',
  '89',
  '100'
]);

function shouldShowManualCharacterEffectButton(card) {
  if(!card || card.type === 'Supporter') return false;
  const id = String(card.id || '');
  if(MANUAL_EFFECT_BLOCKED_CARD_IDS.has(id)) return false;
  if(id === '40') return Number(card.usesLeft || 0) > 0;
  if(id === '21' && card.effectUsedInitial) return false;
  if(card.type === 'Coordinator') return false;
  if(card.type === 'Improvisor') return false;
  if(card.type === 'Initiator' && INITIAL_SET_INITIATOR_IDS.has(id) && !card.effectUsedInitial) return isSameTurnAsCardSet(card);
  if(card.type === 'Initiator' && card.effectUsedInitial) return canRetryInitialSetEffect(card);
  if(card.effectUsedInitial) return false;
  return true;
}

//  FATE HELPERS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function findBoardPositionForCard(card) {
  if(!card || typeof forEachBoardCard !== 'function') return null;
  let pos = null;
  forEachBoardCard((cell, z, r, c)=>{
    if(pos || !cell) return;
    if(cell === card || (card.iid != null && cell.iid === card.iid)) pos = { z, r, c };
  });
  return pos;
}

function clampCardToLandscapeFateCap(card, z) {
  if(!card || typeof getLandscapeFateCapForZone !== 'function') return false;
  const zone = typeof z === 'number' ? z : (findBoardPositionForCard(card) || {}).z;
  const cap = getLandscapeFateCapForZone(zone);
  if(cap == null) return false;
  const before = Math.max(0, Number(card.currentFate ?? card.fate ?? 0) || 0);
  if(before <= cap) return false;
  card.currentFate = cap;
  return true;
}

function capEffectiveFateForLandscape(value, z) {
  const total = Math.max(0, Number(value) || 0);
  const cap = typeof getLandscapeFateCapForZone === 'function' ? getLandscapeFateCapForZone(z) : null;
  return cap == null ? total : Math.min(total, cap);
}

function modifyFate(card, amount, type) {
  if(typeof applyPermanentEffectImmunity === 'function') applyPermanentEffectImmunity(card);
  if(typeof isFullyEffectImmuneCard === 'function' ? isFullyEffectImmuneCard(card) : card.immuneFlag) return;
  if(amount<0 && G.shieldWallZones.length>0) {
    // Check if card is in a shieldwall zone
    let inShield = false;
    forEachBoardCard((c,z)=>{ if(c.iid===card.iid && G.shieldWallZones.includes(z)) inShield=true; });
    if(inShield) return;
  }
  const before = Math.max(0, Number(card.currentFate ?? card.fate) || 0);
  card.currentFate = Math.max(0, before + amount);
  clampCardToLandscapeFateCap(card);
  playFateChangeSound(card, before, card.currentFate, G.currentPlayer);
}

function playFateChangeSound(card, beforeValue, afterValue, sourceOwner) {
  if(!card) return;
  const before = Math.max(0, Number(beforeValue) || 0);
  const after = Math.max(0, Number(afterValue) || 0);
  if(after === before) return;
  if(typeof markEffectFateVisualDelta === 'function') markEffectFateVisualDelta(card, before, after, 'effect');
  if(typeof playSfx !== 'function') return;
  const now = Date.now();
  if(!G._lastFateChangeSfxAt) G._lastFateChangeSfxAt = {};
  const key = String(card.iid || card.id || 'card') + ':' + (after > before ? 'gain' : 'lose');
  if(now - (G._lastFateChangeSfxAt[key] || 0) < 90) return;
  G._lastFateChangeSfxAt[key] = now;
  const crossPlayerReduction = after < before
    && (sourceOwner === 0 || sourceOwner === 1)
    && (card.owner === 0 || card.owner === 1)
    && Number(sourceOwner) !== Number(card.owner);
  playSfx(after > before ? 'fateGain' : (crossPlayerReduction ? 'fateReduce' : 'fateLose'));
}

function recordFateReductionEvent(owner, beforeValue, afterValue) {
  if(owner !== 0 && owner !== 1) return;
  const before = Math.max(0, Number(beforeValue) || 0);
  const after = Math.max(0, Number(afterValue) || 0);
  if(after < before) G.damageDoneP[owner] = (G.damageDoneP[owner] || 0) + 1;
}

function setCardFateValue(card, newValue, sourceOwner) {
  if(typeof applyPermanentEffectImmunity === 'function') applyPermanentEffectImmunity(card);
  if(!card || (typeof isFullyEffectImmuneCard === 'function' ? isFullyEffectImmuneCard(card) : card.immuneFlag)) return false;
  const pos = typeof getBoardCardPosition === 'function' ? getBoardCardPosition(card) : null;
  const before = pos ? getEffectiveFate(card, pos.z) : Math.max(0, Number(card.currentFate ?? card.fate) || 0);
  const baseBefore = Math.max(0, Number(card.currentFate ?? card.fate) || 0);
  const targetValue = Math.max(0, Number(newValue) || 0);
  if(targetValue < before && G.shieldWallZones.length>0) {
    let inShield = false;
    forEachBoardCard((c,z)=>{ if(c.iid===card.iid && G.shieldWallZones.includes(z)) inShield=true; });
    if(inShield) return false;
  }
  const baseNext = Math.max(0, Math.min(baseBefore, targetValue));
  card.currentFate = baseNext;
  const overflowLoss = Math.max(0, baseBefore - targetValue);
  if(overflowLoss > 0) card._staticFatePenalty = (Number(card._staticFatePenalty || 0) || 0) + overflowLoss;
  clampCardToLandscapeFateCap(card);
  const after = pos ? getEffectiveFate(card, pos.z) : Math.max(0, Number(card.currentFate ?? card.fate) || 0);
  recordFateReductionEvent(sourceOwner, before, after);
  playFateChangeSound(card, before, after, sourceOwner);
  return after !== before;
}

function reduceStoredCardFateBy(card, amount, sourceOwner) {
  if(typeof applyPermanentEffectImmunity === 'function') applyPermanentEffectImmunity(card);
  if(!card || (typeof isFullyEffectImmuneCard === 'function' ? isFullyEffectImmuneCard(card) : (card.immuneFlag || card.id === '76'))) return false;
  const pos = typeof getBoardCardPosition === 'function' ? getBoardCardPosition(card) : null;
  const before = pos ? getEffectiveFate(card, pos.z) : Math.max(0, Number(card.currentFate ?? card.fate) || 0);
  const baseBefore = Math.max(0, Number(card.currentFate ?? card.fate) || 0);
  const baseNext = Math.max(0, baseBefore - Math.max(0, Number(amount) || 0));
  if(baseNext < baseBefore && G.shieldWallZones.length > 0) {
    let inShield = false;
    forEachBoardCard((c,z)=>{ if(c.iid === card.iid && G.shieldWallZones.includes(z)) inShield = true; });
    if(inShield) return false;
  }
  card.currentFate = baseNext;
  clampCardToLandscapeFateCap(card);
  const after = pos ? getEffectiveFate(card, pos.z) : Math.max(0, Number(card.currentFate ?? card.fate) || 0);
  recordFateReductionEvent(sourceOwner, before, after);
  playFateChangeSound(card, before, after, sourceOwner);
  return after !== before;
}

function getStablePassiveTargetRank(source, target) {
  const key = String(source && (source.iid || source.id) || '') + ':' + String(target && (target.iid || target.id) || '');
  let hash = 2166136261;
  for(let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function noteCookIslandsDuelistContinuousSource(source) {
  if(!source || (source.owner !== 0 && source.owner !== 1)) return;
  if(!G._continuousDamageSources) G._continuousDamageSources = new Set();
  G._continuousDamageSources.add(source.owner + ':64:' + (source.iid || source.id || 'source'));
}

function getCookIslandsDuelistTarget(source, zHint) {
  if(!source || !cardActsAsPassive(source, '64') || isFaceDownCard(source) || isSupporterEffectSuppressed(source)) return null;
  let pos = null;
  if(G.board && G.board[zHint]) {
    G.board[zHint].forEach((row, r)=>row && row.forEach((cell, c)=>{
      if(!pos && cell && cell.iid === source.iid) pos = {z:zHint, r:r, c:c};
    }));
  }
  if(!pos && typeof forEachBoardCard === 'function') {
    forEachBoardCard((cell, z, r, c)=>{
      if(!pos && cell && cell.iid === source.iid) pos = {z:z, r:r, c:c};
    });
  }
  if(!pos || typeof getAdjacentCards !== 'function') return null;
  const candidates = getAdjacentCards(pos.z, pos.r, pos.c).filter(entry=>{
    const target = entry && entry.card;
    if(!target || target.owner === source.owner || isFaceDownCard(target)) return false;
    return !(typeof isFullyEffectImmuneCard === 'function' ? isFullyEffectImmuneCard(target) : (target.immuneFlag || target.id === '76'));
  });
  if(!candidates.length) {
    delete source._cookIslandsDuelistTargetIid;
    return null;
  }
  const current = candidates.find(entry=>String(entry.card.iid) === String(source._cookIslandsDuelistTargetIid));
  if(current) return current;
  candidates.sort((a, b)=>getStablePassiveTargetRank(source, a.card) - getStablePassiveTargetRank(source, b.card));
  source._cookIslandsDuelistTargetIid = candidates[0].card.iid;
  return candidates[0];
}

function isCoordinatorSuppressedAt(z, r, c) {
  return false;
}

function isSupporterAuraSuppressed(card) {
  return isSupporterEffectSuppressed(card);
}

function isPlayerSupporterEffectsSuppressed(player) {
  return !!(G && G.oppSuppressedNextTurn && G.suppressTarget === player);
}

function isSupporterEffectSuppressed(card) {
  if(!card || card.type !== 'Supporter') return false;
  if(isEffectImmuneSource(card)) return false;
  if(card._lydiaSuppressed) return true;
  if(card._reactionSuppressed) return true;
  return isPlayerSupporterEffectsSuppressed(card.owner);
}

function isEffectImmuneSource(card) {
  if(!card || isFaceDownCard(card)) return false;
  return typeof isFullyEffectImmuneCard === 'function'
    ? isFullyEffectImmuneCard(card)
    : (String(card.id || '') === '76' || card.immuneFlag === true || card.opponentEffectImmune === true);
}

function getEffectiveFate(card, z) {
  if(!card) return 0;
  if(isFaceDownCard(card)) return 0;
  if(typeof applyPermanentEffectImmunity === 'function') applyPermanentEffectImmunity(card);
  // ALPINE Infantry: no bonus applies, invisible to other effects
  const staticPenalty = Math.max(0, Number(card._staticFatePenalty || 0) || 0);
  if(typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(card)) return capEffectiveFateForLandscape(Math.max(0, (Number(card.currentFate ?? card.fate) || 0) - staticPenalty), z);
  if(card.noBonus) return capEffectiveFateForLandscape(Math.max(0, (Number(card.currentFate ?? card.fate) || 0) - staticPenalty), z);
  // Helper: ALPINE (76) is invisible — should not be counted by any other card's effect
  const isInvisible = (c) => c && ((typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(c)) || isFaceDownCard(c));
  // Jimmy 41: fate = 2x total damage done this game by owner
  const getContinuousDamageCount = (owner) => {
    if(!G._continuousDamageSources) return 0;
    let count = 0;
    G._continuousDamageSources.forEach((key)=>{
      if(typeof key === 'string' && key.startsWith(owner+':')) count++;
    });
    return count;
  };
  if(card.id==='41') return capEffectiveFateForLandscape(Math.max(0, (G.damageDoneP[card.owner] + getContinuousDamageCount(card.owner)) * 2 + (Number(card._landscapeStaticFateBonus) || 0) - staticPenalty), z);
  // Alexander 35: fate was snapshotted on set (see runWhenSetEffect case '35')
  // No dynamic recalculation — uses currentFate set at placement time
  let bonus = 0;

  if(card.id==='85') {
    const opponent = 1 - card.owner;
    bonus += typeof getSupporterReinforcementSetTotalForPlayer === 'function'
      ? getSupporterReinforcementSetTotalForPlayer(opponent)
      : (Number(Array.isArray(G.supporterReinforcementSetP) ? G.supporterReinforcementSetP[opponent] : 0) || Number(Array.isArray(G.supportersSetP) ? G.supportersSetP[opponent] : 0) || 0);
  }
  if(card.id==='88') {
    let charCount = 0;
    forEachBoardCard(cell=>{
      if(cell && cell.owner===card.owner && (typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(cell, card.owner) : cell.type!=='Supporter') && !isInvisible(cell)) charCount++;
    });
    bonus += charCount * 2;
  }
  if(card.id==='89') {
    const counts = Array.isArray(G._supporterEffectsActivatedP) ? G._supporterEffectsActivatedP : [0,0];
    if((Number(counts[card.owner]) || 0) < 10) bonus += 6;
  }
  if(card.id==='100' && typeof controlsNamedCard === 'function' && controlsNamedCard(card.owner, ['Felicyta', 'Kvetka', 'Květka'])) {
    bonus += 3;
  }

  // 1st West Caribbea Marines (65): increases its own Fate to 4 while set
  if(cardActsAsPassive(card, '65') && !isSupporterEffectSuppressed(card)) bonus += 3;
  // Greek Hoplite (63): +2 Fate per copy of self in same zone, including itself
  if(card.id==='63' && !isSupporterEffectSuppressed(card)){
    let copies = 0;
    G.board[z].forEach(row=>row.forEach(cell=>{
      if(cell && cell.id==='63' && cell.owner===card.owner && !isInvisible(cell) && !isSupporterEffectSuppressed(cell)) copies++;
    }));
    bonus += copies * 2;
  }
  if(card.id==='44' && !isSupporterEffectSuppressed(card)){
    let sourcePos = null;
    G.board[z].forEach((row, r)=>row.forEach((cell, c)=>{
      if(cell && cell.iid===card.iid) sourcePos = {r, c};
    }));
    if(sourcePos){
      const adj = getAdjacentCards(z, sourcePos.r, sourcePos.c);
      if(adj.some(a=>a.card.owner===card.owner && a.card.type==='Dauntless' && a.card.id!=='76')) bonus += 3;
    }
  }
  if(cardActsAsPassive(card, '64') && !isSupporterEffectSuppressed(card)) {
    const targetInfo = getCookIslandsDuelistTarget(card, z);
    if(targetInfo) {
      bonus += 3;
      noteCookIslandsDuelistContinuousSource(card);
    }
  }
  G.board[z].forEach((row, r)=>row.forEach((cell, c)=>{
    if(!cell || isInvisible(cell) || !cardActsAsPassive(cell, '64') || isSupporterEffectSuppressed(cell)) return;
    const targetInfo = getCookIslandsDuelistTarget(cell, z);
    if(targetInfo && targetInfo.card && targetInfo.card.iid === card.iid) {
      bonus -= 3;
      noteCookIslandsDuelistContinuousSource(cell);
    }
  }));

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
    // Anne Stone (11): +3 to supporters in zone
    if(cell.id==='11' && card.type==='Supporter') bonus += 3 + jeremiahBoost;
    // KvÄ›tka (19): all Coordinators in zone +2
    if(cell.id==='19' && card.type==='Coordinator') bonus += 2 + jeremiahBoost;
    // Zsofia (15): handled in its own stacking block below
    // Post-Modernist Dylan (10): -2 to all opponent cards in zone (continuous)
    // Dylan Kirby (29): Initiator â€” no continuous effect (search only)
    // Dylan Kirby (29): Initiator — no continuous effect (search only)
    // Cathy (23): +2 to all owned characters in zone
    if(cell.id==='23' && (typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(card, card.owner) : card.type!=='Supporter')) bonus += 2 + jeremiahBoost;
    // Jeremiah Jones (57): now boosts other coordinator auras' potency (handled above via jeremiahBoost)
    // Maroon Knights (59): +1 to all Supporters in zone (while on field)
    if(cardActsAsPassive(cell, '59') && card.type==='Supporter' && !isSupporterEffectSuppressed(cell)) bonus += 1;
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
      if(cell && cell.id==='44' && cell.owner===card.owner && !isInvisible(cell) && !isSupporterEffectSuppressed(cell) && getAdjacentCards(z, r, c).some(a=>a.card.iid===card.iid)) {
        bonus += 3;
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

  return capEffectiveFateForLandscape(Math.max(0, (Number(card.currentFate ?? card.fate) || 0) + bonus - staticPenalty), z);
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
  if(typeof getLandscapeZoneFateBonus === 'function') {
    score = Math.max(0, score + getLandscapeZoneFateBonus(player, z));
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
  // Tutorial: force end after the scripted lesson turn limit.
  if(_tutorialActive && G._tutorialTurnLimit && (G.turnNumber >= G._tutorialTurnLimit || G.turn >= G._tutorialTurnLimit)) {
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
    if(typeof renderGame === 'function') renderGame({board:true, scores:true, topbar:true});
    setTimeout(function(){
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
    }, 80);
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
  if(typeof updateDailyChallengeProgress === 'function' && !G._isSpectator){
    const localP = Number.isInteger(G._onlinePlayerIndex) ? G._onlinePlayerIndex : (G.aiEnabled ? (1 - G.aiPlayer) : 0);
    const didWin = !isDraw && winner === localP;
    const localZones = localP === 0 ? p0wins : p1wins;
    const localTotalFate = zResults.reduce((sum, zr)=>sum + (localP === 0 ? zr.s0 : zr.s1), 0);
    updateDailyChallengeProgress('matches', 1, 'add');
    updateDailyChallengeProgress('zonesControlled', localZones, 'max');
    updateDailyChallengeProgress('totalFateBest', localTotalFate, 'max');
    if(localZones === 2) updateDailyChallengeProgress('twoZoneWins', 1, 'add');
    if(zResults[0] && zResults[0].ctrl === localP) updateDailyChallengeProgress('firstZone', 1, 'add');
    if(zResults.some(zr => zr.ctrl === localP && Math.abs(zr.s0 - zr.s1) <= 2)) updateDailyChallengeProgress('closeZone', 1, 'add');
    if(didWin){
      updateDailyChallengeProgress('wins', 1, 'add');
      updateDailyChallengeProgress('zonesWon', localZones, 'max');
      if(localZones === 3) updateDailyChallengeProgress('zonesWon', 3, 'set');
      if(G.turnNumber <= 6) updateDailyChallengeProgress('fastWin', 1, 'add');
      if(drawByFate) updateDailyChallengeProgress('fateTiebreakerWins', 1, 'add');
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
      if(typeof window.clearPendingAiChallengeForfeit === 'function') window.clearPendingAiChallengeForfeit();
      const settings2 = getAIDifficultySettings();
      const resolvedOpponentElo2 = G._aiOpponentElo || settings2.opponentElo;
      const aiRewardMult2 = Number(G._aiRewardMultiplier || 1);
      starlightGained = Math.max(1, Math.round(calculateStarlight(resolvedOpponentElo2, true) * aiRewardMult2 * 0.5));
      USER_PROFILE.starlight = (USER_PROFILE.starlight||0) + starlightGained;
    }
    saveProfile();
    result = {eloChange:0, xpGained:xpResult.xpGained, levelsGained:xpResult.levelsGained, newLevel:xpResult.newLevel, isDraw:true};
  } else if(G.aiEnabled && winner < 0){
    if(CURRENT_MODE === 'challenger' && typeof window.clearPendingAiChallengeForfeit === 'function') window.clearPendingAiChallengeForfeit();
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

// Vigilantes (52): set one opponent card in this same zone to 0 Reinforcement
async function activateVigilantes(card, z, r, c) {
  const cp = G.currentPlayer;
  const opp = 1 - cp;
  const allowed = await beginManualSupporterEffectActivation(card, z, r, c, [opp]);
  if(!allowed) {
    card.vigilanteUsed = true;
    renderGame({board:true, scores:true, topbar:true});
    return;
  }
  if(typeof showEffectActivationGlow === 'function') showEffectActivationGlow(z, r, c, card);
  pickCardInZone(z,'Vigilantes: select an opponent card in this zone to set its Reinforcement to 0.',(tgt)=>{
    if(tgt.owner !== opp){toast('Must select an opponent card');return;}
    if(typeof isFullyEffectImmuneCard === 'function' ? isFullyEffectImmuneCard(tgt) : (tgt.immuneFlag || tgt.id==='76')){showBlockedAnimation('this card is immune');return;}
    tgt._markedForDeath = true;
    tgt._reinforcementOverride = 0;
    card.vigilanteUsed = true;
    toast(tgt.name+' has 0 Reinforcement.');
    log(cp===0?'p1':'p2', 'Vigilantes marked '+tgt.name+' for death in Zone '+(z+1));
    playSfx('effect');
    renderEffectResolutionForPlayer(cp, {hand:false});
  }, function(cell){ return !!cell && cell.owner === opp && !(typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(cell)); });
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
      if(isContestedOrOwnSafeSquare(zz, rr, cc, cp)){
        options.push({z:zz,r:rr,c:cc});
        const el=document.querySelector('#board .cell[data-z="'+zz+'"][data-r="'+rr+'"][data-c="'+cc+'"]');
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
async function activateWolfCreek(card, z, r, c) {
  const cp = G.currentPlayer;
  const allowed = await beginManualSupporterEffectActivation(card, z, r, c, [cp]);
  if(!allowed) {
    card.wolfCreekUsed = true;
    renderGame({board:true, scores:true, topbar:true});
    return;
  }
  const myCards = [];
  if(!G.board[z]){ toast('No zone found'); return; }
  G.board[z].forEach((row,ri)=>row.forEach((cell,ci)=>{
    if(cell && cell.owner===cp && cell.iid!==card.iid && (typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(cell, cp) : cell.type!=='Supporter') && !cell.cantBeMoved){
      myCards.push({card:cell, z:z, r:ri, c:ci});
    }
  }));
  if(myCards.length===0){toast('No characters to move in this zone');return;}
  if(typeof showEffectActivationGlow === 'function') showEffectActivationGlow(z, r, c, card);
  pickCardInZone(z,'Wolf Creek: Select a friendly character in this zone to move:',(target, srcZ, srcR, srcC)=>{
    startWolfCreekMove(target, srcZ, srcR, srcC, card);
  }, function(cell){ return cell && cell.owner===cp && cell.iid!==card.iid && (typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(cell, cp) : cell.type!=='Supporter') && !cell.cantBeMoved; });
}

// ALPINE Expeditionary (73): move once per turn to open square on your side
async function activateExpeditionaryMove(card, z, r, c) {
  if(typeof isLocalPlayerActionTurn === 'function' && !isLocalPlayerActionTurn()){
    clearBoardTargetSelection();
    clearPlaceHighlights();
    if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function') {
      window.FateMatchRendererAdapter.scheduleRender('square-selection-state');
    }
    return;
  }
  var cp = G.currentPlayer;
  const allowed = await beginManualSupporterEffectActivation(card, z, r, c, [cp]);
  if(!allowed) {
    card._expMoved = true;
    renderGame({board:true, scores:true, topbar:true});
    return;
  }
  if(typeof showEffectActivationGlow === 'function') showEffectActivationGlow(z, r, c, card);
  toast('Click any open square on your side to move ALPINE Expeditionary');
  clearBoardTargetSelection();
  clearPlaceHighlights();
  G._expMoving = {card:card, fromZ:z, fromR:r, fromC:c};
  for(var zz=0;zz<3;zz++){
    G.board[zz].forEach(function(row,rr){row.forEach(function(cell,cc){
      if(!cell && !isBlocked(zz,rr,cc)){
        if(isContestedOrOwnSafeSquare(zz, rr, cc, cp)){
          var el=document.querySelector('#board .cell[data-z="'+zz+'"][data-r="'+rr+'"][data-c="'+cc+'"]');
          if(el) el.classList.add('placeable','move-target');
        }
      }
    });});
  }
  if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function') {
    window.FateMatchRendererAdapter.scheduleRender('square-selection-state');
  }
}

function activateLandscapeEventideMove(card, z, r, c) {
  if(!card || !(typeof isLandscapeActive === 'function' && isLandscapeActive('igb7'))) return;
  if(card.aff !== 'eventide'){ toast('Only Eventide cards can use this landscape.'); return; }
  if(card._landscapeEventideMovedTurn === G.turn){ toast('This card already moved by landscape this turn.'); return; }
  if(card.cantBeMoved){ toast('This card cannot be moved.'); return; }
  const cp = G.currentPlayer;
  const options = [];
  for(let zz=0; zz<3; zz++){
    const totalRows = G.board[zz] ? G.board[zz].length : 3;
    for(let rr=0; rr<totalRows; rr++){
      const rowOwner = rr===0 ? 1 : (rr===1 ? -1 : (rr===2 ? 0 : (typeof getExtraSafeRowOwner === 'function' ? getExtraSafeRowOwner(zz, rr) : cp)));
      if(rowOwner !== -1 && rowOwner !== cp) continue;
      if(card.contestedOnly && rr !== 1) continue;
      const rowCap = typeof getBoardRowCapacity === 'function' ? getBoardRowCapacity(zz, rr) : 3;
      for(let cc=0; cc<rowCap; cc++){
        if(zz===z && rr===r && cc===c) continue;
        if(rr>=3 && typeof isPlayableSafeSquare === 'function' && !isPlayableSafeSquare(zz, rr, cc, cp)) continue;
        if(G.board[zz][rr] && G.board[zz][rr][cc]===null && !isBlocked(zz, rr, cc)){
          options.push({z:zz,r:rr,c:cc});
        }
      }
    }
  }
  if(!options.length){ toast('No open squares available for landscape movement.'); return; }
  if(typeof showEffectActivationGlow === 'function') showEffectActivationGlow(z, r, c, card);
  G._landscapeMoving = {card, fromZ:z, fromR:r, fromC:c, options};
  G.placing = true;
  clearPlaceHighlights();
  options.forEach(function(o){
    const el = document.querySelector('#board .cell[data-z="'+o.z+'"][data-r="'+o.r+'"][data-c="'+o.c+'"]');
    if(el) el.classList.add('placeable','move-target','landscape-move-target');
  });
  if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function') {
    window.FateMatchRendererAdapter.scheduleRender('square-selection-state');
  }
  toast('Choose a highlighted square for Panacea movement.');
  setHint('Landscape: move ' + card.name + ' to a highlighted square.');
}

function activateBusserMove(card, fromZ, fromR, fromC) {
  var cp = typeof card._busserOwner === 'number' ? card._busserOwner : G.currentPlayer;
  if(!card || card.cantBeMoved || card.immuneFlag || card.id==='76'){
    toast('This card cannot be moved');
    return;
  }
  if(Number(card._busserMoves||0)<=0){
    toast('No Busser moves remaining');
    return;
  }
  if(card._busserMovedThisTurn){
    toast('This card already moved this turn');
    return;
  }
  var ownerSafeRow = cp === 0 ? 2 : 0;
  // Adjacent zones are fromZ-1 and fromZ+1
  var adjZones = [];
  if(fromZ > 0) adjZones.push(fromZ - 1);
  if(fromZ < 2) adjZones.push(fromZ + 1);
  var options = [];
  adjZones.forEach(function(zz){
    [1, ownerSafeRow].forEach(function(rr){
      if(!G.board[zz]) G.board[zz] = [];
      if(!Array.isArray(G.board[zz][rr])) G.board[zz][rr] = [null, null, null];
      var rowCapacity = typeof getBoardRowCapacity === 'function' ? getBoardRowCapacity(zz, rr) : Math.max(3, G.board[zz][rr].length || 0);
      while(G.board[zz][rr].length < rowCapacity) G.board[zz][rr].push(null);
      for(var cc = 0; cc < rowCapacity; cc++){
        var cell = G.board[zz][rr][cc] || null;
        if(!cell && !isBlocked(zz,rr,cc)){
          options.push({z:zz,r:rr,c:cc});
          var el = document.querySelector('#board .cell[data-z="'+zz+'"][data-r="'+rr+'"][data-c="'+cc+'"]');
          if(el) el.classList.add('placeable','move-target');
        }
      }
    });
  });
  if(!options.length){
    toast('No open squares in adjacent zones!');
    G._busserMovingCard = null;
    return;
  }
  toast('Click an open square in an adjacent zone to move ' + card.name);
  G._busserMovingCard = {card:card, fromZ:fromZ, fromR:fromR, fromC:fromC, options:options};
  if(typeof showEffectActivationGlow === 'function') showEffectActivationGlow(fromZ, fromR, fromC, card);
  if(typeof showBusserStatusBanner === 'function') showBusserStatusBanner(card, Number(card._busserMoves || 0) || 0, cp);
  if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
  else if(typeof renderTopbarEffects === 'function') renderTopbarEffects();
}

// ══════════════════════════════════════════════════════════════
//  REACTION SYSTEM (Havano Citizen 79, Lydia 56)
// ══════════════════════════════════════════════════════════════

function getSupporterEffectAffectedOwners(inst, z, r, c, cp, opp) {
  if(!inst) return [];
  if(isPersistentSupporterEffectOnSet(inst)) {
    if(inst.id === '53') return [opp];
    if(inst.id === '20') {
      let touchesOpponent = false;
      if(G.board && G.board[z]) G.board[z].forEach(row=>row && row.forEach(cell=>{
        if(cell && cell.owner === opp) touchesOpponent = true;
      }));
      return touchesOpponent ? [opp] : [];
    }
    return [];
  }
  const affectsOpponent = new Set(['16','26','31','50','61','62','71','72','73','75','76','77','80','91']);
  const affectsBoth = new Set(['18']);
  if(affectsBoth.has(inst.id)) return [0,1];
  if(affectsOpponent.has(inst.id)) return [opp];
  return [];
}

function getCharacterEffectAffectedOwners(card, z, r, c, cp, opp) {
  if(!card) return [];
  const id = String(card.id || '');
  const opponentTargets = new Set([
    '04', // Zoe blocks the opponent from consolidating on a square
    '03', // Howard can target any card in the zone
    '14', // Alondra discards adjacent opponent Supporters
    '30', // Santiago discards an opponent contested card
    '39', // Juan Carlos moves an opponent card
    '52', // Vigilantes mark an opponent card
    'bh25' // Jimmy Viltrumite discards any board card
  ]);
  const bothTargets = new Set([
    '12', // Makenna can make friendly cards immune, but can target player-owned cards
    '17', // Carolyn can block any open square on the field
    '34',
    '40'
  ]);
  if(bothTargets.has(id)) return [0,1];
  if(opponentTargets.has(id)) return [opp];
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
    if(isEffectImmuneSource(actionData && actionData.card)){
      resolve(true);
      return;
    }

    var reactions = [];

    function isLydiaReactionAction(type, data) {
      if(!data || !data.card) return false;
      if(data.lydiaEligible === false) return false;
      if(data.card.owner !== cp && Number(data.sourceOwner) !== cp) return false;
      return type === 'supporter_effect' || type === 'initiator_effect' || type === 'when_set_effect' || type === 'targeting_effect';
    }

    // Lydia (56): negate fresh opponent effect activations.
    if(isLydiaReactionAction(actionType, actionData)){
      forEachBoardCard(function(card2, z2, r2, c2) {
        if(card2.id==='56' && (card2.usesLeft === null || card2.usesLeft === undefined)) card2.usesLeft = 5;
        if(card2.id==='56' && card2.owner===opp && card2.usesLeft > 0 && !card2.immuneFlag && !isFaceDownCard(card2)){
          reactions.push({type:'lydia', card:card2, z:z2, r:r2, c:c2});
        }
      });
    }

    // Mr. Secules (67): one-use negate for opponent Initiators and Supporter when-set effects.
    if(actionType === 'supporter_effect' || actionType === 'initiator_effect'){
      forEachBoardCard(function(card2, z2, r2, c2) {
        if(card2.id==='67' && (card2.usesLeft === null || card2.usesLeft === undefined)) card2.usesLeft = card2._seculesUsed ? 0 : 1;
        if(card2.id==='67' && card2.owner===opp && card2.usesLeft > 0 && !card2.immuneFlag && !isFaceDownCard(card2)){
          reactions.push({type:'secules', card:card2, z:z2, r:r2, c:c2});
        }
      });
    }

    // Havano Citizen (79): reacts when an opponent effect affects you or your cards.
    if(actionType === 'targeting_effect' || actionAffectsPlayerCards(actionData, opp)){
      G.players[opp].hand.forEach(function(h) {
        if(h.id==='79' && !isSupporterEffectSuppressed(h) && getHavanoDeploymentOptions(opp, h).length) reactions.push({type:'havano', card: h});
      });
    }

    if(reactions.length === 0){ resolve(true); return; }

    var localOnlinePlayer = Number(G._onlinePlayerIndex);
    if(G._onlineRoomCode && Number.isInteger(localOnlinePlayer) && opp !== localOnlinePlayer){
      resolve(true);
      return;
    }

    // AI auto-reacts
    var isAI = G.aiEnabled && opp === G.aiPlayer;
    if(isAI){
      Promise.resolve(executeReaction(reactions[0], actionData)).then(function(result){ resolve(result === true); });
      return;
    }

    var reaction = reactions[0];
    var cardName = actionData.card ? actionData.card.name : 'an effect';
    var reactorName = reaction.card.name;
    var reactorImg = reaction.card.img ? '<img src="'+reaction.card.img+'" alt="'+escapeHtml(reactorName)+'">' : '';
    var lydiaInfo = reaction.type==='lydia' ? '<div class="reaction-uses">'+reaction.card.usesLeft+' uses remaining</div>' : '';
    var secInfo = reaction.type==='secules' ? '<div class="reaction-uses">One use - Effect Expended after negation</div>' : '';

    // 15-second timer for reaction decision
    var _reactionTimer = null;
    var _reactionCountdown = 15;
    var _reactionPromptId = (Number(G._reactionPromptSeq) || 0) + 1;
    G._reactionPromptSeq = _reactionPromptId;
    var isCurrentReactionPrompt = function(){
      return G._reactionPromptSeq === _reactionPromptId;
    };
    var timerHtml = '<div id="reaction-timer" class="reaction-timer">'+_reactionCountdown+'s</div>';
    var getReactionKindLabel = function(candidate){
      if(candidate.type === 'lydia') return 'Lydia - Berknomaly';
      if(candidate.type === 'secules') return '"You Just Said Nothing" - Effect Expended';
      if(candidate.type === 'havano') return 'Havano Citizen - Deploy from hand';
      return 'Improvisor Reaction';
    };
    var getReactionLocationLabel = function(candidate){
      if(typeof candidate.z === 'number') return 'Zone ' + (candidate.z + 1);
      return 'Hand';
    };
    var finishReaction = function(allowed) {
      if(!isCurrentReactionPrompt()) return;
      if(_reactionTimer) clearInterval(_reactionTimer);
      G._reactionPending = false;
      closeModal();
      resolve(allowed);
    };
    var useReactionChoice = function(candidate) {
      if(_reactionTimer) clearInterval(_reactionTimer);
      if(!isCurrentReactionPrompt()) return;
      G._reactionPending = false;
      closeModal();
      const hasBoardSource = typeof candidate.z === 'number' && typeof candidate.r === 'number' && typeof candidate.c === 'number';
      const cinematic = hasBoardSource && typeof playEffectActivationCinematic === 'function'
        ? playEffectActivationCinematic(candidate.card, candidate.z, candidate.r, candidate.c, {source:'improvisor-reaction'})
        : Promise.resolve(false);
      Promise.resolve(cinematic)
        .then(function(){ return executeReaction(candidate, actionData); })
        .then(function(result){ resolve(result === true); });
    };
    G._reactionPending = true;

    if(reactions.length > 1) {
      var optionHtml = reactions.map(function(candidate, idx){
        var candidateName = candidate.card.name || 'Improvisor';
        var candidateImg = candidate.card.img
          ? '<img src="'+candidate.card.img+'" alt="'+escapeHtml(candidateName)+'">'
          : '<span>'+escapeHtml((candidateName || '?').slice(0,1))+'</span>';
        return '<button class="reaction-choice-card" type="button" data-reaction-idx="'+idx+'">'+
          '<span class="reaction-choice-art">'+candidateImg+'</span>'+
          '<span class="reaction-choice-copy">'+
            '<b>'+escapeHtml(candidateName)+'</b>'+
            '<em>'+escapeHtml(getReactionKindLabel(candidate))+'</em>'+
            '<small>'+escapeHtml(getReactionLocationLabel(candidate))+'</small>'+
          '</span>'+
        '</button>';
      }).join('');
      showModal(
        'Choose Reaction ('+_reactionCountdown+'s)',
        '<div class="reaction-panel reaction-choice-panel">'+
          '<div class="reaction-choice-head">'+
            '<div class="reaction-kicker">Improvisor Reaction</div>'+
            '<div class="reaction-prompt"><span>Opponent played</span><strong>'+escapeHtml(cardName)+'</strong><span>Choose who responds.</span></div>'+
          '</div>'+
          '<div class="reaction-choice-grid">'+optionHtml+'</div>'+
          timerHtml+
        '</div>',
        [
          {label:'Allow Effect', action:function(){ finishReaction(true); }}
        ],
        {immediate:true}
      );
      const modalBox = document.querySelector('#modal .modal');
      if(modalBox) modalBox.classList.add('reaction-choice-modal');
      setTimeout(function(){
        document.querySelectorAll('#modal .reaction-choice-card').forEach(function(btn){
          btn.addEventListener('click', function(){
            var idx = Number(btn.getAttribute('data-reaction-idx'));
            if(Number.isInteger(idx) && reactions[idx]) useReactionChoice(reactions[idx]);
          });
        });
      }, 0);
      _reactionTimer = setInterval(function(){
        if(!isCurrentReactionPrompt()){
          clearInterval(_reactionTimer);
          return;
        }
        _reactionCountdown--;
        var timerEl = document.getElementById('reaction-timer');
        if(timerEl) timerEl.textContent = _reactionCountdown+'s';
        var titleEl = document.getElementById('modal-title');
        if(titleEl) titleEl.textContent = 'Choose Reaction ('+_reactionCountdown+'s)';
        if(_reactionCountdown <= 0){
          finishReaction(true);
        }
      }, 1000);
      return;
    }

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
        secInfo+
        timerHtml+
      '</div>',
      [
        {label:'Allow', action:function(){ finishReaction(true); }},
        {label:'✦ Negate', pri:true, action:function(){
          if(_reactionTimer) clearInterval(_reactionTimer);
          if(!isCurrentReactionPrompt()) return;
          G._reactionPending = false;
          closeModal();
          const cinematic = typeof playEffectActivationCinematic === 'function'
            ? playEffectActivationCinematic(reaction.card, reaction.z, reaction.r, reaction.c, {source:'improvisor-reaction'})
            : Promise.resolve(false);
          Promise.resolve(cinematic)
            .then(function(){ return executeReaction(reaction, actionData); })
            .then(function(result){ resolve(result === true); });
        }}
      ],
      {immediate:true}
    );

    // Start countdown — auto-allow if timer expires
    _reactionTimer = setInterval(function(){
      if(!isCurrentReactionPrompt()){
        clearInterval(_reactionTimer);
        return;
      }
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
  const card = arguments.length > 1 && arguments[1] ? arguments[1] : {type:'Supporter', id:'79'};
  return getValidPlacementOptionsForCard(card, owner);
}

function showHavanoDeploymentOptions(options) {
  clearPlaceHighlights();
  options.forEach(function(o){
    const el = document.querySelector('#board .cell[data-z="'+o.z+'"][data-r="'+o.r+'"][data-c="'+o.c+'"]');
    if(el) el.classList.add('placeable','havano-deploy-choice');
  });
  [...new Set(options.map(o=>o.z))].forEach(function(zi){
    const zoneEl = document.querySelector('#board .zone[data-zone="'+zi+'"], #board .zone[data-z="'+zi+'"]') || document.querySelectorAll('#board .zone, .board .zone')[zi];
    if(zoneEl) zoneEl.classList.add('busser-zone-target');
  });
}

function beginHavanoDeployment(reaction, owner) {
  return new Promise(function(resolve){
    const options = getHavanoDeploymentOptions(owner, reaction.card);
    if(!options.length) {
      toast('Havano Citizen has no open square to deploy.');
      resolve(true);
      return;
    }
    G.players[owner].hand = G.players[owner].hand.filter(function(c){return c.iid !== reaction.card.iid;});
    const inst = newInstance(reaction.card);
    inst.owner = owner;
    inst.currentFate = getPlacedCardFate(reaction.card);
    consumePendingPlacementFlags(reaction.card, inst);
    if(G.aiEnabled && owner === G.aiPlayer) {
      const o = options[0];
      const commit = function(){
        G.board[o.z][o.r][o.c] = inst;
        if(typeof applyLandscapePlacementBonuses === 'function') applyLandscapePlacementBonuses(inst, o.z, o.r, o.c);
        toast('Havano Citizen negated the effect and deployed to Zone '+(o.z+1)+'!');
        renderEffectResolutionForPlayer(owner, {hand:true});
        resolve(false);
      };
      const presenter = window.FateActionPresentation;
      if(presenter && typeof presenter.beginBoardPlacement === 'function'){
        const started = presenter.beginBoardPlacement({
          sourceCard:reaction.card,
          inst,
          owner,
          source:'hand',
          target:{z:o.z, r:o.r, c:o.c},
          commit
        });
        if(started) return;
      }
      commit();
      return;
    }
    G._havanoDeploying = { inst, owner, sourceCard:reaction.card, options, resolve };
    G.placing = true;
    renderEffectResolutionForPlayer(owner, {hand:true});
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
  const commit = function(){
    G.board[z][r][c] = dep.inst;
    if(typeof applyLandscapePlacementBonuses === 'function') applyLandscapePlacementBonuses(dep.inst, z, r, c);
    G._havanoDeploying = null;
    G.placing = false;
    clearPlaceHighlights();
    toast('Havano Citizen deployed to Zone '+(z+1)+'!');
    playSfx('zoneBlock');
    showBlockedAnimation('NEGATED by Havano Citizen!');
    renderEffectResolutionForPlayer(dep.owner, {hand:true});
    dep.resolve(false);
  };
  const presenter = window.FateActionPresentation;
  if(presenter && typeof presenter.beginBoardPlacement === 'function'){
    const started = presenter.beginBoardPlacement({
      inst:dep.inst,
      sourceCard:dep.sourceCard,
      owner:dep.owner,
      source:'hand',
      target:{z, r, c},
      commit
    });
    if(started) return;
  }
  commit();
}

function executeReaction(reaction, actionData) {
  var opp = 1 - G.currentPlayer;
  if(isEffectImmuneSource(actionData && actionData.card)) {
    showBlockedAnimation('this card is immune');
    return true;
  }
  if(reaction.type === 'lydia'){
    reaction.card.usesLeft--;
    if(actionData.card) {
      actionData.card._lydiaSuppressed = true;
      actionData.card._effectNegatedByReaction = true;
    }
    toast('Lydia negated '+(actionData.card ? actionData.card.name : 'effect')+'! ('+reaction.card.usesLeft+' uses left)');
    log(opp===0?'p1':'p2', 'Lydia negated '+(actionData.card ? actionData.card.name : 'effect'));
    playSfx('zoneBlock');
    showBlockedAnimation('NEGATED by Lydia!');
    renderEffectResolutionForPlayer(opp, {hand:false});
  } else if(reaction.type === 'havano'){
    if(actionData.card && actionData.card.type === 'Supporter') actionData.card._reactionSuppressed = true;
    playSfx('zoneBlock');
    log(opp===0?'p1':'p2', 'Havano Citizen negated and deployed');
    return beginHavanoDeployment(reaction, opp);
  } else if(reaction.type === 'secules'){
    reaction.card.usesLeft = 0;
    reaction.card._seculesUsed = true;
    if(actionData.card && actionData.card.type === 'Supporter') actionData.card._reactionSuppressed = true;
    toast('Mr. Secules negated '+(actionData.card ? actionData.card.name : 'the effect')+'! (Effect Expended)');
    log(opp===0?'p1':'p2', 'Mr. Secules: Effect Expended after negating '+(actionData.card ? actionData.card.name : 'an effect'));
    playSfx('zoneBlock');
    showBlockedAnimation('NEGATED by Mr. Secules!');
    renderEffectResolutionForPlayer(opp, {hand:false});
  }
}// Cards with when-set effects (global so runWhenSetEffect can reference it)
const WHEN_SET_IDS = new Set(['02','03','04','05','06','07','08','12','13','14','16','17','18','21','22','25','26','27','29','30','31','32','33','34','35','37','38','39','40','42','43','45','46','48','50','51','52','54','56','58','60','61','62','66','68','69','71','72','73','75','76','77','80','84','91','94','bh01','bh25']);
