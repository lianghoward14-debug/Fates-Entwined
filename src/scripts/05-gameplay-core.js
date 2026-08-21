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

const FRENCH_FUSILIERS_COPYABLE_PASSIVE_IDS = new Set(['20','24','49','53','59','64','65','92','93']);

function getFrenchFusiliersCopiedPassiveId(card) {
  if(!card) return '';
  const id = String(card.id || '');
  const isFrenchCopyShell = id === '37'
    || (id === 'bh05' && String(card._bh05CopiedPassiveId || '') === '37')
    || (id === '75' && String(card._ledgerCopiedSourceId || '') === '37');
  if(!isFrenchCopyShell) return '';
  const copiedId = card._copiedPassiveId || card.copiedPassiveId;
  return copiedId == null ? '' : String(copiedId);
}

function frenchFusiliersCopies(card, sourceId) {
  if(!card) return false;
  const wanted = String(sourceId);
  return getFrenchFusiliersCopiedPassiveId(card) === wanted;
}

function cardActsAsPassive(card, sourceId) {
  if(!card) return false;
  if(card._effectNegatedByReaction || card._effectSuppressedByReaction || card._reactionSuppressed || card._lydiaSuppressed || card._lumberjackSuppressed) return false;
  const wanted = String(sourceId);
  const id = String(card.id || '');
  return id === wanted
    || frenchFusiliersCopies(card, wanted)
    || (id === 'bh05' && String(card._bh05CopiedPassiveId || '') === wanted)
    || (id === '75' && String(card._ledgerCopiedSourceId || '') === wanted);
}

function getCardRuntimeEffectId(card) {
  if(!card) return '';
  const id = String(card.id || '');
  if(id === 'bh05' && card._bh05CopiedPassiveId) return String(card._bh05CopiedPassiveId);
  if(id === '75' && card._ledgerCopiedSourceId) return String(card._ledgerCopiedSourceId);
  return id;
}

function canFrenchFusiliersCopyPassive(card) {
  if(!card || !(typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(card, card.owner) : card.type === 'Supporter') || isFaceDownCard(card)) return false;
  const id = String(card.id || '');
  if(id === '37' || !FRENCH_FUSILIERS_COPYABLE_PASSIVE_IDS.has(id)) return false;
  const text = String(card.effect || '');
  return /while\s+(this\s+card\s+is\s+)?on\s+the\s+field/i.test(text);
}

function chooseFrenchFusiliersPassive(inst, z, options) {
  const opts = options || {};
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
    inst.copiedPassiveEffect = inst._copiedPassiveEffect;
    toast('6th French Fusiliers copied ' + inst._copiedPassiveName + '.');
    applyContinuousEffects();
    renderGame({board:true, scores:true, topbar:true});
  };
  const cards = candidates.map(function(entry) { return entry.card; });
  if(opts.autoPick) {
    const priority = ['20','92','93','65','64','59','53','49','24'];
    candidates.sort(function(a, b){
      const ai = priority.indexOf(String(a.card.id));
      const bi = priority.indexOf(String(b.card.id));
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    });
    applyCopy(candidates[0]);
    return;
  }
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
  const fateBeforeBuffs = Math.max(0, Number(inst.currentFate ?? inst.fate ?? 0) || 0);
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
    if(typeof playFateChangeSound === 'function') playFateChangeSound(inst, fateBeforeBuffs, inst.currentFate, ownerNum);
    flashCardEffect(inst, 'rivera_crest', {
      label:'Rivera affiliation bonus',
      soundKey:'rivera:' + String(ownerNum) + ':' + String(inst.iid || inst.id) + ':' + String(G.turn || 0)
    });
    toast(inst.name + ' gains 4 Fate from Rivera!');
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
      const copiedSnowball = typeof cardActsAsPassive === 'function' && cardActsAsPassive(card, '93');
      if((typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(card, player) : card.type === 'Supporter') || copiedSnowball) {
        const suppressed = typeof isSupporterEffectSuppressed === 'function' && isSupporterEffectSuppressed(card);
        if(!suppressed) {
          if(cardActsAsPassive(card, '73') && card._canMoveOncePerTurn && !card._expMoved) pushEndTurnEffectWarning(pending, card, 'Move', z);
          if((typeof cardActsAsPassive === 'function' ? cardActsAsPassive(card, '93') : card.id === '93') && !card.effectUsedThisTurn) {
            pushEndTurnEffectWarning(pending, card, 'Activate Effect', z);
          }
        }
      }
    });
  }
  return pending;
}

function canActivateVigilantesWindow(card) {
  if(!card || String(card.id || '') !== '52' || isFaceDownCard(card)) return false;
  if(card.vigilanteUsed === true || card.whenSetActivated === true) return false;
  if(card._pendingWhenSetEffect) return !expireStalePendingWhenSetEffect(card);
  return false;
}

function expireSkippedVigilantesWindowsForPlayer(player) {
  if(player !== 0 && player !== 1 || typeof forEachBoardCard !== 'function') return;
  forEachBoardCard((card)=>{
    if(!card || card.owner !== player || String(card.id || '') !== '52') return;
    if(card.vigilanteUsed === true) return;
    if(card.whenSetActivated === true) return;
    delete card._pendingWhenSetEffect;
    card.whenSetActivated = true;
    card.effectUsedInitial = true;
  });
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
  if(typeof window.fateAIRecordDecision === 'function') {
    window.fateAIRecordDecision({player:cp, action:'e', zone:-1, row:-1});
  }
  expireSkippedVigilantesWindowsForPlayer(cp);
  clearPendingWhenSetEffectsForPlayer(cp);
  G._skipImprovisorCheck = false;
  if(typeof tickBlameGameAtEndOfTurn === 'function') tickBlameGameAtEndOfTurn();
  if(Array.isArray(G._landscapeChangeLocks)) {
    G._landscapeChangeLocks = G._landscapeChangeLocks.map(v=>Math.max(0, (Number(v) || 0) - 1));
  }

  if(typeof maybeResolveLandscapeEndTurn === 'function' && maybeResolveLandscapeEndTurn()) {
    return;
  }

  const endTurnSfxKey = ['end-turn', String(G._onlineRoomCode || 'local'), Number(G.turn || 0) || 0, cp].join(':');
  if(typeof window.playEndTurnSfxOnce === 'function') window.playEndTurnSfxOnce(endTurnSfxKey);
  else if(typeof playSfx === 'function') playSfx('endTurn');

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
    const transition = nextPlayerTurn();
    const corpusParams = new URLSearchParams(window.location.search || '');
    if(corpusParams.get('fateV3LegacyCorpus') === '1'
      && corpusParams.get('fateV3Recorder') === '1'
      && corpusParams.get('fateV3SinglePlayer') !== '1'){
      G._legacyCorpusTurnTransitionPromise = Promise.resolve(transition).finally(function(){
        G._legacyCorpusTurnTransitionPromise = null;
      });
    }
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

function getBusserTurnsLeft(card) {
  if(!card) return 0;
  const explicitTurns = Number(card._busserTurnsLeft);
  if(Number.isFinite(explicitTurns) && explicitTurns > 0) return explicitTurns;
  return Math.max(0, Number(card._busserMoves || 0) || 0);
}

function findBoardCardByIid(iid) {
  if(iid == null || typeof forEachBoardCard !== 'function') return null;
  let found = null;
  const needle = String(iid);
  forEachBoardCard(function(card){
    if(!found && card && String(card.iid || '') === needle) found = card;
  });
  return found;
}

function isStoredEffectSourceSuppressed(sourceIid) {
  const source = findBoardCardByIid(sourceIid);
  return !!(source && typeof isCardEffectSuppressed === 'function' && isCardEffectSuppressed(source));
}

if(typeof window !== 'undefined') {
  window.findBoardCardByIid = findBoardCardByIid;
  window.isStoredEffectSourceSuppressed = isStoredEffectSourceSuppressed;
}

function expireBusserTurnsForPlayer(player) {
  if(typeof forEachBoardCard !== 'function') return;
  forEachBoardCard(function(card){
    if(!card) return;
    const owner = typeof card._busserOwner === 'number' ? card._busserOwner : card.owner;
    if(Number(owner) !== Number(player)) return;
    const turnsLeft = getBusserTurnsLeft(card);
    if(turnsLeft <= 0) return;
    card._busserTurnsLeft = Math.max(0, turnsLeft - 1);
    if(card._busserTurnsLeft <= 0) {
      card._busserTurnsLeft = 0;
      card._busserMoves = 0;
      card._busserOwner = null;
      card._busserSourceIid = null;
      card._busserMovedThisTurn = false;
    }
  });
}

function ensureWojciechPlacementCounts() {
  if(!Array.isArray(G._wojciechTurnPlacementCounts)) G._wojciechTurnPlacementCounts = [0, 0];
  if(!Array.isArray(G._wojciechLastTurnPlacementCounts)) G._wojciechLastTurnPlacementCounts = [0, 0];
}

function recordWojciechPlacementForTurn(card, player) {
  if(!card || (typeof isWojciechPierogiCounter === 'function' && isWojciechPierogiCounter(card))) return false;
  const owner = player === 0 || player === 1 ? player : card.owner;
  if(owner !== 0 && owner !== 1) return false;
  if(Number(card._wojciechPlacementCountedTurn) === Number(G.turn)) return false;
  ensureWojciechPlacementCounts();
  card._wojciechPlacementCountedTurn = G.turn;
  G._wojciechTurnPlacementCounts[owner] = (Number(G._wojciechTurnPlacementCounts[owner]) || 0) + 1;
  return true;
}

function createWojciechPierogiCounter(player, sourceCard) {
  if(typeof WOJCIECH_PIEROGI_COUNTER === 'undefined') return null;
  const counter = createCardInstance(WOJCIECH_PIEROGI_COUNTER, player);
  counter.owner = player;
  counter.currentFate = 0;
  counter.pierogiCounter = true;
  counter.immuneFlag = true;
  counter.noBonus = true;
  counter.noConsolidate = true;
  counter.cantBeMoved = true;
  counter.cantBeReduced = true;
  counter._effectImmutable = true;
  counter._pierogiCreator = player;
  counter._pierogiSourceIid = sourceCard && sourceCard.iid || null;
  counter._pierogiHandTurnsRemaining = 6;
  counter._pierogiCreatedTurn = G.turn;
  if(typeof recordHandCardEffectModifier === 'function') {
    recordHandCardEffectModifier(counter, {
      key:'wojciech-pierogi-expiry',
      name:'Pierogi Barrage',
      text:'This Pierogi Counter can remain in your hand for 6 of your turns.'
    });
  }
  return counter;
}

function grantWojciechPierogiCounters(player, count, sourceCard) {
  const amount = Math.max(0, Math.min(40, Math.floor(Number(count) || 0)));
  let added = 0;
  for(let i = 0; i < amount; i++) {
    const counter = createWojciechPierogiCounter(player, sourceCard);
    if(!counter) break;
    G.players[player].hand.push(counter);
    added++;
  }
  if(added && typeof enforceHandLimit === 'function') enforceHandLimit(player);
  return added;
}

function isWojciechPierogiPlacementSquare(z, r, c, creator) {
  if(!G.board?.[z]?.[r] || G.board[z][r][c] !== null || isBlocked(z, r, c)) return false;
  const host = creator === 0 ? 1 : 0;
  if(r === 1) return true;
  if(r >= 3 && typeof isPlayableSafeSquare === 'function') return isPlayableSafeSquare(z, r, c, host);
  return getSquareRowOwner(z, r) === host;
}

function placeWojciechPierogiCounter(card, z, r, c, creator) {
  if(!card || !(typeof isWojciechPierogiCounter === 'function' && isWojciechPierogiCounter(card))) return null;
  if(!isWojciechPierogiPlacementSquare(z, r, c, creator)) return null;
  const host = creator === 0 ? 1 : 0;
  const inst = createCardInstance(card, host);
  inst.owner = host;
  inst.currentFate = 0;
  inst.pierogiCounter = true;
  inst.immuneFlag = true;
  inst.noBonus = true;
  inst.noConsolidate = true;
  inst.cantBeMoved = true;
  inst.cantBeReduced = true;
  inst._effectImmutable = true;
  inst._pierogiCreator = creator;
  inst._pierogiHost = host;
  inst._pierogiTurnsRemaining = 3;
  inst.effect = 'This Card is a Counter. It vanishes after 3 turns of the player whose field it occupies.';
  delete inst._pierogiHandExpiresAfterTurn;
  delete inst._pierogiHandTurnsRemaining;
  delete inst._pierogiCreatedTurn;
  delete inst._handEffectModifiers;
  G.board[z][r][c] = inst;
  G.players[creator].hand = G.players[creator].hand.filter(function(entry){
    return entry !== card && String(entry && entry.iid || '') !== String(card.iid || '');
  });
  G.placing = false;
  G.selectedHandCard = null;
  G.selectedBoardCard = null;
  clearPlaceHighlights();
  if(typeof playSfx === 'function') playSfx('effect');
  log(creator === 0 ? 'p1' : 'p2', 'Placed a Pierogi Counter in Zone ' + (z + 1));
  if(typeof applyContinuousEffects === 'function') applyContinuousEffects();
  if(typeof renderBoardActionForPlayer === 'function') renderBoardActionForPlayer(creator, {hand:true, blocks:false, topbar:false, effects:false, hover:false});
  else renderGame({board:true, hand:true, scores:true});
  return inst;
}

function finishWojciechTurnState(endingPlayer) {
  ensureWojciechPlacementCounts();
  G._wojciechLastTurnPlacementCounts[endingPlayer] = Math.max(0, Number(G._wojciechTurnPlacementCounts[endingPlayer]) || 0);
  G._wojciechTurnPlacementCounts[endingPlayer] = 0;

  let expiredFromHand = 0;
  G.players[endingPlayer].hand = G.players[endingPlayer].hand.filter(function(card){
    if(!(typeof isWojciechPierogiCounter === 'function' && isWojciechPierogiCounter(card))
      || Number(card._pierogiCreator) !== endingPlayer) return true;
    if(Number(card._pierogiCreatedTurn) === Number(G.turn)) return true;
    const remaining = Math.max(0, Number(card._pierogiHandTurnsRemaining ?? 6) - 1);
    card._pierogiHandTurnsRemaining = remaining;
    const shouldExpire = remaining <= 0;
    if(shouldExpire) expiredFromHand++;
    return !shouldExpire;
  });

  let expiredFromBoard = 0;
  forEachBoardCard(function(card, z, r, c){
    if(!(typeof isWojciechPierogiCounter === 'function' && isWojciechPierogiCounter(card))) return;
    if(Number(card._pierogiHost) !== endingPlayer) return;
    card._pierogiTurnsRemaining = Math.max(0, (Number(card._pierogiTurnsRemaining) || 0) - 1);
    if(card._pierogiTurnsRemaining <= 0) {
      G.board[z][r][c] = null;
      expiredFromBoard++;
      return;
    }
    card.effect = 'This Card is a Counter. It vanishes after ' + card._pierogiTurnsRemaining + ' more turn' + (card._pierogiTurnsRemaining === 1 ? '' : 's') + ' of the player whose field it occupies.';
  });
  if((expiredFromHand || expiredFromBoard) && (typeof shouldShowPlayerEffectFeedback !== 'function' || shouldShowPlayerEffectFeedback(endingPlayer))) {
    toast((expiredFromHand + expiredFromBoard) + ' Pierogi Counter' + (expiredFromHand + expiredFromBoard === 1 ? '' : 's') + ' expired.');
  }
}

const WHISPER_FIELD_WIDE_EFFECT_TEXT = Object.freeze({
  '10':'All cards your opponent controls on the field lose 3 Fate.',
  '11':'All Supporters you control on the field gain 3 Fate.',
  '15':'Each time you would set a Coordinator, all cards you control on the field gain 1 Fate.',
  '19':'All Coordinators you control on the field gain 3 Fate.',
  '23':'All Characters you control on the field gain 2 Fate.',
  '57':'All Coordinator auras you control on the field gain 1 Fate in potency.',
  '77':'When set, declare an affiliation. All cards you control on the field with that affiliation gain 4 Fate.',
  'bh02':'Each time you activate a draw effect, all cards you control on the field gain 1 Fate.',
  'bh07':'For each Dauntless card adjacent to this card, all cards you control on the field gain 2 Fate.',
  'bh08':'Each time you would negate or suppress an effect, all cards you control on the field gain 2 Fate.'
});
const WHISPER_UNCOPYABLE_COORDINATOR_IDS = new Set(['01', '02', '12', '34']);

function ensureWhisperLandscapeUses() {
  if(!Array.isArray(G._whisperLandscapeUses)) G._whisperLandscapeUses = [0, 0];
  return G._whisperLandscapeUses;
}

function whisperLandscapeUseAvailable(player) {
  if(player !== 0 && player !== 1) return false;
  const uses = ensureWhisperLandscapeUses();
  return (Number(uses[player]) || 0) < 1;
}

function getWhisperFieldWideEffectText(cardOrId) {
  const id = String(cardOrId && cardOrId.id || cardOrId || '');
  const source = cardOrId && typeof cardOrId === 'object' ? cardOrId : null;
  return WHISPER_FIELD_WIDE_EFFECT_TEXT[id] || ('Field-wide: ' + String(source && source.effect || 'Copied Coordinator effect.'));
}

function getWhisperCoordinatorEntries(player) {
  const entries = [];
  if(!G || !Array.isArray(G.board)) return entries;
  G.board.forEach(function(zone, z){
    (zone || []).forEach(function(row, r){
      (row || []).forEach(function(card, c){
        if(!card || card.owner !== player || card.type !== 'Coordinator' || isFaceDownCard(card)) return;
        if(typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(card)) return;
        if(typeof isWhisperOfTheHeartToken === 'function' && isWhisperOfTheHeartToken(card)) return;
        if(WHISPER_UNCOPYABLE_COORDINATOR_IDS.has(String(card.id || ''))) return;
        entries.push({card, z, r, c});
      });
    });
  });
  return entries;
}

function getWhisperDiscardableHandCards(player) {
  const hand = G && G.players && G.players[player] && Array.isArray(G.players[player].hand) ? G.players[player].hand : [];
  return hand.filter(function(card){
    return !!card
      && !(typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(card))
      && !(String(card.id || '') === '70' && card.guerilla_transferred === true);
  });
}

function createWhisperOfTheHeartToken(player, sourceCard) {
  if(typeof WHISPER_OF_THE_HEART_TOKEN === 'undefined' || !sourceCard) return null;
  if(WHISPER_UNCOPYABLE_COORDINATOR_IDS.has(String(sourceCard.id || ''))) return null;
  const token = createCardInstance(WHISPER_OF_THE_HEART_TOKEN, player);
  token.owner = player;
  token.currentFate = 5;
  token.whisperLandscapeToken = true;
  token._whisperCopiedEffectId = String(sourceCard.id || '');
  token._whisperCopiedSourceName = String(sourceCard.name || 'Coordinator');
  token._whisperCopiedAbility = String(sourceCard.ability || 'Copied Effect');
  token._whisperCopiedPrintedEffect = String(sourceCard.effect || '');
  token._whisperCopiedFieldEffect = getWhisperFieldWideEffectText(sourceCard);
  token.effect = token._whisperCopiedFieldEffect;
  token._whisperCreatedTurn = Number(G.turn) || 1;
  return token;
}

function commitWhisperLandscapeConversion(player, sourceEntry, handCards) {
  if(!(typeof isLandscapeActive === 'function' && isLandscapeActive('igb17'))) return false;
  if(!whisperLandscapeUseAvailable(player)) return false;
  if(!sourceEntry || !sourceEntry.card) return false;
  const liveSource = G.board?.[sourceEntry.z]?.[sourceEntry.r]?.[sourceEntry.c] || null;
  if(!liveSource || liveSource.owner !== player || liveSource.type !== 'Coordinator' || isFaceDownCard(liveSource)) return false;
  if(typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(liveSource)) return false;
  if(typeof isWhisperOfTheHeartToken === 'function' && isWhisperOfTheHeartToken(liveSource)) return false;
  if(WHISPER_UNCOPYABLE_COORDINATOR_IDS.has(String(liveSource.id || ''))) return false;
  const chosen = Array.isArray(handCards) ? handCards.filter(Boolean) : [];
  const uniqueIids = new Set(chosen.map(function(card){ return String(card.iid || ''); }));
  if(chosen.length !== 2 || uniqueIids.size !== 2) return false;
  const hand = G.players?.[player]?.hand;
  if(!Array.isArray(hand)) return false;
  const liveHandCards = chosen.map(function(card){
    return hand.find(function(entry){ return entry && String(entry.iid || '') === String(card.iid || ''); });
  });
  if(liveHandCards.some(function(card){ return !card; })) return false;
  if(liveHandCards.some(function(card){ return typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(card); })) return false;

  const token = createWhisperOfTheHeartToken(player, liveSource);
  if(!token) return false;
  G.board[sourceEntry.z][sourceEntry.r][sourceEntry.c] = null;
  if(G.selectedBoardCard && String(G.selectedBoardCard.iid || '') === String(liveSource.iid || '')) G.selectedBoardCard = null;
  fatePushDiscard(player, liveSource, {sound:false});
  liveHandCards.forEach(function(card){
    const index = hand.findIndex(function(entry){ return entry && String(entry.iid || '') === String(card.iid || ''); });
    if(index >= 0) hand.splice(index, 1);
    fatePushDiscard(player, card, {sound:false});
  });
  hand.push(token);
  ensureWhisperLandscapeUses()[player] = 1;
  if(typeof playDiscardSfx === 'function') playDiscardSfx();
  if(typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('Tama City: Concrete Roads', 'major');
  if(typeof applyContinuousEffects === 'function') applyContinuousEffects();
  toast('Shizuku copied ' + liveSource.name + '. The 5 Fate token is now in your hand.');
  log(player === 0 ? 'p1' : 'p2', 'Concrete Roads copied ' + liveSource.name + ' as a token effect');
  if(typeof window !== 'undefined' && typeof window.invalidateFateRenderCaches === 'function') window.invalidateFateRenderCaches();
  const renderParts = {board:true, hand:true, oppHand:true, scores:true, piles:true, landscape:true, topbar:true};
  if(typeof renderGameImmediate === 'function') renderGameImmediate(renderParts);
  else renderGame(renderParts);
  return token;
}

function chooseWhisperLandscapeAiCost(player) {
  const priorities = {'bh02':17,'15':16,'11':14,'23':13,'19':12,'10':11,'01':10,'57':9,'77':8,'34':7,'12':6};
  const sources = getWhisperCoordinatorEntries(player).slice().sort(function(a, b){
    const aScore = Number(priorities[String(a.card.id || '')] || 0) - (Number(a.card.currentFate ?? a.card.fate) || 0) * .2;
    const bScore = Number(priorities[String(b.card.id || '')] || 0) - (Number(b.card.currentFate ?? b.card.fate) || 0) * .2;
    return bScore - aScore;
  });
  const handCards = getWhisperDiscardableHandCards(player).slice().sort(function(a, b){
    return (Number(a.currentFate ?? a.fate) || 0) - (Number(b.currentFate ?? b.fate) || 0);
  }).slice(0, 2);
  return sources.length && handCards.length === 2 ? {source:sources[0], handCards} : null;
}

function activateWhisperOfTheHeartLandscape(options = {}) {
  const auto = options && options.auto === true;
  const player = Number.isInteger(Number(options && options.playerIndex))
    ? Number(options.playerIndex)
    : (G._onlineRoomCode
      ? (Number.isInteger(G._onlinePlayerIndex) ? G._onlinePlayerIndex : G.localPlayerIndex)
      : (auto ? G.currentPlayer : getPerspectivePlayerIndex()));
  if(player !== 0 && player !== 1) return Promise.resolve(false);
  if(!(typeof isLandscapeActive === 'function' && isLandscapeActive('igb17'))) {
    if(!auto) toast('Concrete Roads is not the current landscape.');
    return Promise.resolve(false);
  }
  if(G.currentPlayer !== player || G.phase !== 'main' || G._isSpectator || G._onlineRole === 'spectator') {
    if(!auto) toast('You can only use Concrete Roads during your Main Phase.');
    return Promise.resolve(false);
  }
  if(!whisperLandscapeUseAvailable(player)) {
    if(!auto) toast('You already used Concrete Roads this game.');
    return Promise.resolve(false);
  }
  const sources = getWhisperCoordinatorEntries(player);
  const handCards = getWhisperDiscardableHandCards(player);
  if(!sources.length || handCards.length < 2) {
    if(!auto) toast(!sources.length ? 'You need a Coordinator on your field.' : 'You need 2 cards in your hand to discard.');
    return Promise.resolve(false);
  }
  if(auto) {
    const choice = chooseWhisperLandscapeAiCost(player);
    return Promise.resolve(!!(choice && commitWhisperLandscapeConversion(player, choice.source, choice.handCards)));
  }
  if(typeof showBoardTargetPicker !== 'function' || typeof pickCardsVisual !== 'function') return Promise.resolve(false);
  closeModal();
  return new Promise(function(resolve, reject){
    showBoardTargetPicker({
      title:'Tama City: Concrete Roads',
      prompt:'Choose one Coordinator you control to copy and discard.',
      entries:sources,
      zones:[0,1,2],
      maxCount:1,
       confirmLabel:'Copy Coordinator',
       viewerPlayerIndex:player,
       showZoneTitles:true,
       onlineClientOwnedChoice:true,
       onCancel:function(){ resolve(false); }
    }, function(selected){
      const source = selected && selected[0];
      if(!source || !source.card) { resolve(false); return; }
      const costCards = getWhisperDiscardableHandCards(player);
      pickCardsVisual(costCards, {
        title:'Concrete Roads - Discard Cost',
        subtitle:'Choose exactly 2 cards from your hand to discard.',
        maxCount:2,
        minCount:2,
        confirmLabel:'Create 5 Fate Token',
        immediate:true,
        viewerPlayerIndex:player,
        onlineParentAction:true,
        onCancel:function(){ resolve(false); }
      }, function(chosen){
        resolve(!!commitWhisperLandscapeConversion(player, source, chosen));
      });
    });
  });
}
window.activateWhisperOfTheHeartLandscape = activateWhisperOfTheHeartLandscape;
window.whisperLandscapeUseAvailable = whisperLandscapeUseAvailable;

function isActiveWhisperToken(card, copiedId, owner) {
  if(!(typeof isWhisperOfTheHeartToken === 'function' && isWhisperOfTheHeartToken(card))) return false;
  if(WHISPER_UNCOPYABLE_COORDINATOR_IDS.has(String(card._whisperCopiedEffectId || ''))) return false;
  if(owner === 0 || owner === 1) {
    if(card.owner !== owner) return false;
  }
  if(copiedId && String(card._whisperCopiedEffectId || '') !== String(copiedId)) return false;
  if(isFaceDownCard(card)) return false;
  if(typeof isCardEffectSuppressed === 'function' && isCardEffectSuppressed(card)) return false;
  return true;
}

function getActiveWhisperTokens(owner, copiedId) {
  const entries = [];
  if(typeof forEachBoardCard !== 'function') return entries;
  forEachBoardCard(function(card, z, r, c){
    if(isActiveWhisperToken(card, copiedId, owner)) entries.push({card, z, r, c});
  });
  return entries;
}

function getFieldWideWhisperJeremiahBoost(owner) {
  return getActiveWhisperTokens(owner, '57').length;
}

function getWhisperAuraPotencyBoost(sourceEntry) {
  if(!sourceEntry || !sourceEntry.card) return 0;
  // Jeremiah strengthens Coordinator zone auras. Copying a Coordinator effect
  // never changes the copying card's printed type.
  if(String(sourceEntry.card.type || '') !== 'Coordinator') return 0;
  const owner = sourceEntry.card.owner;
  let boost = getFieldWideWhisperJeremiahBoost(owner);
  const zone = G.board?.[sourceEntry.z] || [];
  zone.forEach(function(row, r){
    (row || []).forEach(function(card, c){
      if(!card || card.owner !== owner || !cardActsAsPassive(card, '57') || isFaceDownCard(card)) return;
      if(typeof isCardEffectSuppressed === 'function' && isCardEffectSuppressed(card, sourceEntry.z, r, c)) return;
      boost++;
    });
  });
  return boost;
}

function countFieldWideCoordinators(owner) {
  let count = 0;
  if(typeof forEachBoardCard === 'function') forEachBoardCard(function(card, z, r, c){
    if(!card || card.owner !== owner || card.type !== 'Coordinator' || isFaceDownCard(card)) return;
    if(typeof isCardEffectSuppressed === 'function' && isCardEffectSuppressed(card, z, r, c)) return;
    count++;
  });
  return count;
}

async function resolveWhisperTokenPlacement(card, z, r, c, opts = {}) {
  if(!card || !isActiveWhisperToken(card, null, card.owner) || card._whisperEffectActivated) return false;
  const copiedId = String(card._whisperCopiedEffectId || '');
  const owner = card.owner;
  const auto = opts.auto === true;
  if(copiedId === '77') {
    let declared = '';
    if(auto) {
      const counts = {};
      forEachBoardCard(function(target){
        if(target && target.owner === owner && target.aff) counts[target.aff] = (counts[target.aff] || 0) + 1;
      });
      declared = Object.keys(counts).sort(function(a, b){ return counts[b] - counts[a]; })[0] || 'expanded_worlds';
    } else if(typeof showAffiliationPickerVisual === 'function') {
      declared = await new Promise(function(resolve){ showAffiliationPickerVisual(function(aff){ resolve(aff || ''); }); });
    }
    if(declared) card._declaredAff = declared;
  }
  card._whisperEffectActivated = true;
  if(typeof playSfx === 'function') playSfx('whisperConsolidation');
  if(typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('Shizuku Token activated', 'major');
  toast('Shizuku activated ' + String(card._whisperCopiedAbility || 'its copied effect') + ' field-wide.');
  if(typeof applyContinuousEffects === 'function') applyContinuousEffects();
  renderGame({board:true, hand:true, scores:true, landscape:true, topbar:true});
  return true;
}
window.resolveWhisperTokenPlacement = resolveWhisperTokenPlacement;

function applyIdyllicPolishVillageDrawPhase(player) {
  if(player !== 0 && player !== 1) return 0;
  if(!(typeof isLandscapeActive === 'function' && isLandscapeActive('igb18'))) return 0;
  let count = 0;
  forEachBoardCard(function(card){
    if(!card || card.owner !== player || card.aff !== 'expanded_worlds' || isFaceDownCard(card)) return;
    if(typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(card)) return;
    const isCharacter = typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(card, player) : card.type !== 'Supporter';
    if(!isCharacter || (typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(card))) return;
    const before = Math.max(0, Number(card.currentFate ?? card.fate) || 0);
    modifyFate(card, 1, 'permanent', player);
    const after = Math.max(0, Number(card.currentFate ?? card.fate) || 0);
    if(after > before && typeof flashCardEffect === 'function') {
      flashCardEffect(card, 'idyllic_polish_village', {
        label:'An Idyllic Polish Village',
        soundKey:'idyllic-polish-village:' + String(card.iid || card.id || 'card') + ':' + String(G && G.turn || 0)
      });
    }
    count++;
  });
  if(count) {
    if(typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('Wodny Potok: An Idyllic Polish Village', 'minor');
    toast(count + ' Expanded Worlds Character' + (count === 1 ? '' : 's') + ' gained 1 Fate.');
    log(player === 0 ? 'p1' : 'p2', 'An Idyllic Polish Village gave ' + count + ' Expanded Worlds Character' + (count === 1 ? '' : 's') + ' +1 Fate');
  }
  return count;
}
window.applyIdyllicPolishVillageDrawPhase = applyIdyllicPolishVillageDrawPhase;

function resolveCaliforniqueHandExpiryForPlayer(player) {
  if(player !== 0 && player !== 1) return [];
  if(!(typeof isLandscapeActive === 'function' && isLandscapeActive('igb19'))) return [];
  const hand = G && G.players && G.players[player] && G.players[player].hand;
  if(!Array.isArray(hand)) return [];
  const state = typeof getLandscapeState === 'function' ? getLandscapeState() : null;
  if(!state) return [];
  if(!Array.isArray(state.handTurnCounts)) state.handTurnCounts = [0, 0];
  if(!Array.isArray(state.handLastResolvedGameTurns)) state.handLastResolvedGameTurns = [null, null];
  const gameTurn = Math.max(1, Number(G.turn) || 1);
  if(Number(state.handLastResolvedGameTurns[player]) === gameTurn) return [];
  const previousOwnerTurns = Math.max(0, Number(state.handTurnCounts[player]) || 0);
  const completedOwnerTurn = previousOwnerTurns + 1;
  state.handLastResolvedGameTurns[player] = gameTurn;
  state.handTurnCounts[player] = completedOwnerTurn;
  const expired = [];
  const retained = [];
  hand.forEach(function(card){
    if(typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(card)) {
      delete card._igb19HandTurnsRemaining;
      delete card._igb19HandOwner;
      delete card._igb19LastCountedHandTurn;
      retained.push(card);
      return;
    }
    if(!(typeof isCaliforniqueCharacterCard === 'function' && isCaliforniqueCharacterCard(card))) {
      retained.push(card);
      return;
    }
    const sameOwner = Number(card._igb19HandOwner) === Number(player);
    const stored = Number(card._igb19HandTurnsRemaining);
    const remaining = sameOwner && Number.isFinite(stored)
      ? Math.max(1, Math.min(3, Math.floor(stored)))
      : 3;
    const lastCountedOwnerTurn = sameOwner
      ? Math.max(0, Number(card._igb19LastCountedHandTurn) || 0)
      : previousOwnerTurns;
    const nextRemaining = lastCountedOwnerTurn < completedOwnerTurn ? remaining - 1 : remaining;
    if(nextRemaining <= 0) {
      delete card._igb19HandTurnsRemaining;
      delete card._igb19HandOwner;
      delete card._igb19LastCountedHandTurn;
      expired.push(card);
      return;
    }
    card._igb19HandTurnsRemaining = nextRemaining;
    card._igb19HandOwner = player;
    card._igb19LastCountedHandTurn = completedOwnerTurn;
    retained.push(card);
  });
  if(!expired.length) return expired;
  G.players[player].hand = retained;
  expired.forEach(function(card){ fatePushDiscard(player, card, {sound:false}); });
  if(typeof playDiscardSfx === 'function') playDiscardSfx();
  if(typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('Californique: Lost Civilization of the Old Age', 'major');
  const names = expired.map(function(card){ return card.name || 'Character'; });
  toast('Californique discarded ' + names.join(', ') + ' after 3 turns in hand.');
  log(player === 0 ? 'p1' : 'p2', 'Californique discarded ' + expired.length + ' Character' + (expired.length === 1 ? '' : 's') + ' after 3 turns in hand');
  return expired;
}
window.resolveCaliforniqueHandExpiryForPlayer = resolveCaliforniqueHandExpiryForPlayer;

async function nextPlayerTurn() {
  const endingPlayer = G.currentPlayer;
  resolveCaliforniqueHandExpiryForPlayer(endingPlayer);
  expireBusserTurnsForPlayer(endingPlayer);
  finishWojciechTurnState(endingPlayer);
  // Clear suppression if the just-ended turn belonged to the suppression target
  // (current player before switching = the one whose turn just ended)
  if(G.oppSuppressedNextTurn && G.currentPlayer===G.suppressTarget) {
    G.oppSuppressedNextTurn = false;
    G.suppressTarget = null;
  }

  G.currentPlayer = 1 - G.currentPlayer;
  G.turn++;
  if(G._onlineRoomCode){
    G._turnStartedAt = (typeof window !== 'undefined' && typeof window.fateAuthorityServerNow === 'function')
      ? window.fateAuthorityServerNow()
      : Date.now();
  }
  if(typeof window.playFateSfxOnce === 'function') window.playFateSfxOnce('turnChange', 'turn-change-new-owner', 650);
  else if(typeof playSfx === 'function') playSfx('turnChange');
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
      if(cardActsAsPassive(card, '73')) card._expMoved = false;
      if(card.id==='bh01') card.bh01MovedThisTurn = false;
      if(getBusserTurnsLeft(card)>0) card._busserMovedThisTurn = false;
      card._landscapeEventideMovedTurn = null;
    }
  });
  G._zimbabweUsedThisTurn = false;
  G._polishUsedThisTurn = false;
  tickRiveraBuffsForCurrentPlayer();
  if(typeof tickMailDeliveriesForCurrentPlayer === 'function') tickMailDeliveriesForCurrentPlayer();
  if(typeof tickCarpathianSpecters === 'function') tickCarpathianSpecters();
  if(typeof tickWintertideForCurrentPlayer === 'function') tickWintertideForCurrentPlayer();
  if(typeof applyIdyllicPolishVillageDrawPhase === 'function') applyIdyllicPolishVillageDrawPhase(G.currentPlayer);

  // Wine Country Guerilla (70): tick down counter and debuff random card in holder's hand
  const currentPlayer = G.currentPlayer;
  const holderHand = G.players[currentPlayer].hand;
  const guerillaCards = holderHand.filter(c=>cardActsAsPassive(c, '70') && c.guerilla_transferred && c.guerilla_turnsLeft>0);
  guerillaCards.forEach(gc=>{
    // Pick a random non-guerilla card in this hand and reduce its fate by 2.
    const candidates = holderHand.filter(c=>c.iid!==gc.iid && !cardActsAsPassive(c, '70') && !(typeof isTargetImmuneToEffectOwner === 'function' ? isTargetImmuneToEffectOwner(c, 1-currentPlayer) : (typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(c))));
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
  if(typeof shouldSkipLandscapeDrawPhase === 'function' && shouldSkipLandscapeDrawPhase(currentPlayer)) {
    toast('Big Sur: draw phase skipped.');
    if(typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('Big Sur skipped draw phase', 'major');
    log('sys', 'Big Sur skipped P' + (currentPlayer + 1) + ' draw phase.');
  } else {
    const drawParams = new URLSearchParams(window.location.search || '');
    const legacyCorpusCapture = drawParams.get('fateV3LegacyCorpus') === '1'
      && drawParams.get('fateV3Recorder') === '1'
      && drawParams.get('fateV3SinglePlayer') !== '1';
    await drawCard(currentPlayer, 1, {
      drawPhase:true,
      skipPresentationWait:!!G._onlineRoomCode || legacyCorpusCapture
    });
  }

  // Phil (46) — Monarchist Manifesto: gains 2 Fate per draw phase after being set
  forEachBoardCard((card)=>{
    if(cardActsAsPassive(card, '46') && card.owner===currentPlayer && typeof card._philSetTurn==='number') {
      const before = Math.max(0, Number(card.currentFate ?? card.fate) || 0);
      card.currentFate = before + 2;
      if(typeof playFateChangeSound === 'function') playFateChangeSound(card, before, card.currentFate, currentPlayer);
      flashCardEffect(card, 'phil_crown', {
        label:'Monarchist Manifesto',
        soundKey:'phil:' + String(card.iid || card.id) + ':' + String(G.turn || 0)
      });
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
  // South Wind no longer creates a zone-wide Shield Wall aura.
  G.shieldWallZones = [];
  forEachBoardCard((card, z)=>{
    if(card.cantBeMoved) card.cantBeMoved = false;
    // Older AI code incorrectly made every French Fusilier permanently immune.
    // The paired flags uniquely identify that stale state; legitimate Makenna
    // protection is tracked separately and a copied Shield Wall remains visible.
    if(String(card.id || '') === '37' && card.immuneFlag && card.opponentEffectImmune && !card._immuneByMakenna && !frenchFusiliersCopies(card, '20')) {
      delete card.immuneFlag;
      delete card.opponentEffectImmune;
    }
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
//  TURN TIMER (3 minutes default; Free Play can choose 1-10 minutes)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const TURN_TIME_LIMIT = 180; // seconds
let _turnTimerInterval = null;
let _turnTimerRemaining = TURN_TIME_LIMIT;
let _lastTurnWarnSecond = null;
let _aiTurnVisualTimerInterval = null;
let _aiTurnVisualSeconds = 0;
let _turnTimerPauseStartedAt = 0;
let _turnTimerAccumulatedPauseMs = 0;
let _turnTimerPauseKey = '';

function getTurnTimeLimit() {
  if(!_tutorialActive && typeof isLandscapeActive === 'function' && isLandscapeActive('igb14')) return 30;
  if(_tutorialActive) return 300;
  const configured = Math.round(Number(G && G._turnTimerSeconds) || 0);
  return configured >= 60 && configured <= 600 ? configured : TURN_TIME_LIMIT;
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

function isImprovisorTurnTimerPaused() {
  if(!G) return false;
  if(G._reactionPending || G._serverPendingReaction) return true;
  try {
    if(document.documentElement.classList.contains('online-improvisor-reaction-paused')) return true;
    return !!document.querySelector(
      '#online-improvisor-reaction-root[data-online-improvisor-prompt-id], ' +
      '#modal [data-online-improvisor-prompt-id], #modal .reaction-choice-panel'
    );
  } catch(e) {
    return false;
  }
}
if(typeof window !== 'undefined') window.isImprovisorTurnTimerPaused = isImprovisorTurnTimerPaused;

function turnTimerPauseNow() {
  return (typeof window !== 'undefined' && typeof window.fateAuthorityServerNow === 'function')
    ? window.fateAuthorityServerNow()
    : Date.now();
}

function currentTurnTimerPauseKey() {
  if(!G) return '';
  return [Number(G.turn || 0), Number(G.currentPlayer || 0), Number(G._turnStartedAt || 0)].join(':');
}

function isTurnTimerInteractionPaused() {
  if(!G) return false;
  if(isImprovisorTurnTimerPaused()) return true;
  // Authoritative prompts are gameplay windows even on the waiting player's
  // client. Both seats must display and enforce the same suspended turn.
  if(G._phase7PendingPrompt || G._phase7PendingHandLimit || G.pendingEffect) return true;
  try {
    const modal = document.getElementById('modal');
    if(modal && modal.classList.contains('on')) return true;
    return !!document.querySelector(
      '.cinematic-overlay.on, .cinematic-overlay.active, ' +
      '[data-effect-resolution-window="open"], [data-interaction-window="open"]'
    );
  } catch(e) {
    return false;
  }
}
if(typeof window !== 'undefined') window.isTurnTimerInteractionPaused = isTurnTimerInteractionPaused;

function updateTurnTimerPauseState(now) {
  const stamp = Number(now) || turnTimerPauseNow();
  const key = currentTurnTimerPauseKey();
  if(_turnTimerPauseKey !== key) {
    _turnTimerPauseKey = key;
    _turnTimerPauseStartedAt = 0;
    _turnTimerAccumulatedPauseMs = 0;
  }
  const paused = isTurnTimerInteractionPaused();
  if(paused) {
    if(!_turnTimerPauseStartedAt) _turnTimerPauseStartedAt = stamp;
  } else if(_turnTimerPauseStartedAt) {
    _turnTimerAccumulatedPauseMs += Math.max(0, stamp - _turnTimerPauseStartedAt);
    _turnTimerPauseStartedAt = 0;
  }
  return paused;
}

function getTurnTimerPausedMs(now) {
  const stamp = Number(now) || turnTimerPauseNow();
  updateTurnTimerPauseState(stamp);
  return _turnTimerAccumulatedPauseMs
    + (_turnTimerPauseStartedAt ? Math.max(0, stamp - _turnTimerPauseStartedAt) : 0);
}

function getOnlineActiveImprovisorPauseMs(now) {
  const pending = G && G._serverPendingReaction;
  const openedAt = Number(pending?.openedAt);
  if(!pending || !Number.isFinite(openedAt)) return 0;
  const timeoutMs = Math.max(0, Number(pending.timeoutMs || 15000) || 15000);
  return Math.min(timeoutMs + 2000, Math.max(0, Number(now) - openedAt));
}

function getOnlineSyncedTurnRemaining(limit) {
  if(!G || !G._onlineRoomCode || !Number.isFinite(Number(G._turnStartedAt))) return null;
  const now = (typeof window !== 'undefined' && typeof window.fateAuthorityServerNow === 'function')
    ? window.fateAuthorityServerNow()
    : Date.now();
  const pausedMs = Math.max(getOnlineActiveImprovisorPauseMs(now), getTurnTimerPausedMs(now));
  const elapsed = Math.floor((now - Number(G._turnStartedAt) - pausedMs) / 1000);
  if(elapsed < 0) return null;
  return Math.max(0, Math.min(limit, limit - elapsed));
}

function repairStaleOnlineTurnStartedAt(limit) {
  if(!G || !G._onlineRoomCode) return false;
  const now = (typeof window !== 'undefined' && typeof window.fateAuthorityServerNow === 'function')
    ? window.fateAuthorityServerNow()
    : Date.now();
  const startedAt = Number(G._turnStartedAt);
  const elapsed = Number.isFinite(startedAt)
    ? Math.floor((now - startedAt - Math.max(getOnlineActiveImprovisorPauseMs(now), getTurnTimerPausedMs(now))) / 1000)
    : null;
  if(elapsed !== null && elapsed >= 0 && elapsed < Number(limit || TURN_TIME_LIMIT)) return false;
  G._turnStartedAt = now;
  try {
    const perf = window.__fatePerf = window.__fatePerf || {};
    perf.onlineTurnStartedAtRepaired = { at:Date.now(), turn:G.turn, currentPlayer:G.currentPlayer, previousStartedAt:startedAt || null, elapsed };
  } catch(e) {}
  return true;
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
  repairStaleOnlineTurnStartedAt(limit);
  _turnTimerRemaining = limit;
  const syncedRemaining = getOnlineSyncedTurnRemaining(limit);
  if(syncedRemaining !== null) _turnTimerRemaining = Math.max(1, syncedRemaining);
  _lastTurnWarnSecond = null;
  updateTurnTimerPauseState(turnTimerPauseNow());
  updateTimerDisplay();
  _turnTimerInterval = setInterval(()=>{
    if(updateTurnTimerPauseState(turnTimerPauseNow())){
      updateTimerDisplay();
      return;
    }
    const liveSyncedRemaining = getOnlineSyncedTurnRemaining(limit);
    _turnTimerRemaining = liveSyncedRemaining !== null ? liveSyncedRemaining : (_turnTimerRemaining - 1);
    updateTimerDisplay();
    if(_turnTimerRemaining <= 0){
      if(isOnlineRemoteTurnTimer()) {
        stopTurnTimer();
        updateTimerDisplay();
        return;
      }
      toast("Time's up! Turn auto-ended.");
      const closedEndTurnWarning = closeEndTurnWarningModalForTimeout();
      const result = endTurn({skipEffectWarning:true, skipModalDeferral:closedEndTurnWarning});
      if(result === false && G && G._deferredEndTurn){
        if(_turnTimerInterval){
          clearInterval(_turnTimerInterval);
          _turnTimerInterval = null;
        }
        _turnTimerRemaining = 0;
        updateTimerDisplay();
      } else if(result !== true && !(G && G._deferredEndTurn)) {
        stopTurnTimer();
      }
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
function showAliIndomitableResolvingBanner() {
  const message = 'Wait Until the First Set';
  if(typeof toast === 'function') toast(message, 3200);
}
window.showAliIndomitableResolvingBanner = showAliIndomitableResolvingBanner;

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
  if(card._bh03TransferPending === true) {
    G.selectedHandCard = null;
    G.placing = false;
    clearPlaceHighlights();
    renderHand();
    showAliIndomitableResolvingBanner();
    return;
  }
  if(typeof tutorialCanSelectHandCard === 'function' && !tutorialCanSelectHandCard(card)) return;

  // Wine Country Guerilla (70): before infiltration, it is manually activated from the hand detail window.
  // After infiltration, it is view-only and cannot be set.
  if(cardActsAsPassive(card, '70') && card.guerilla_transferred){
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
  if(card._bh03TransferPending === true) {
    showAliIndomitableResolvingBanner();
    G.placing = false;
    return;
  }
  if(typeof isAchillesAdaptiveToken === 'function' && isAchillesAdaptiveToken(card) && card._achillesConfigured !== true) {
    beginAchillesTokenSet(card, G.currentPlayer);
    return;
  }
  if(typeof tutorialCanStartHandAction === 'function' && !tutorialCanStartHandAction(card, 'place')) return;

  // Free-set effects skip reinforcement/supporter limits, but still obey board placement rules.
  const isLinaFree = !!(card._linaFree || (G._linaFreeIids && G._linaFreeIids.has(card.iid)) || (typeof isAchillesAdaptiveToken === 'function' && isAchillesAdaptiveToken(card)));

  if(cardActsAsPassive(card, '70') && card.guerilla_transferred){
    toast(card.name + ' cannot be set - it is debuffing this hand.');
    G.placing = false;
    return;
  }

  const cardIsSupporterForRules = typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(card, G.currentPlayer) : card.type === 'Supporter';
  if(!isLinaFree && cardIsSupporterForRules) {
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

function requiresOwnSafeRowPlacement(card) {
  return !!(card && String(card.id || '') === '07');
}

function getValidPlacementOptionsForCard(card, player) {
  const options = [];
  if(!card || typeof player !== 'number') return options;
  const isPierogiCounter = typeof isWojciechPierogiCounter === 'function' && isWojciechPierogiCounter(card);
  const ignoresOpponentPlacementLocks = typeof isOpponentEffectOnlyImmuneCard === 'function' && isOpponentEffectOnlyImmuneCard(card);
  for(let z=0;z<3;z++) {
    // Artillery Distance (50): zone locked for this player
    if(!isPierogiCounter && !ignoresOpponentPlacementLocks && typeof G._artilleryLockedZone==='number' && G._artilleryLockedZone===z && G._artilleryLockOwner===player && G._artilleryLockTurnsLeft>0) continue;
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
      const placementRowOwner = isPierogiCounter ? 1 - cp : cp;
      if(!isPierogiCounter && rowOwner!==-1 && rowOwner!==cp) continue;
      if(!isPierogiCounter && r>=3 && typeof isPlayableSafeSquare === 'function' && !isPlayableSafeSquare(z,r,0,placementRowOwner)) {
        const anyPlayable = [0,1,2].some(cc => isPlayableSafeSquare(z,r,cc,placementRowOwner));
        if(!anyPlayable) continue;
      }
      if(card.contestedOnly && r!==1) continue;
      if(!G.board[z][r]) continue;
      const baseCols = 3;
      const extraRow = r<3 ? (G.extraCells?.[z]?.[r] || null) : null;
      const extraP1 = extraRow?(extraRow.p1||0):0;
      const extraP2 = extraRow?(extraRow.p2||0):0;
      const totalCols = Math.max(G.board[z][r].length, baseCols + (placementRowOwner===0?extraP1:extraP2));
      for(let c=0;c<totalCols;c++) {
        if(isPierogiCounter) {
          if(isWojciechPierogiPlacementSquare(z, r, c, cp)) options.push({z,r,c});
          continue;
        }
        if(r>=3 && typeof isPlayableSafeSquare === 'function' && !isPlayableSafeSquare(z,r,c,placementRowOwner)) continue;
        if(requiresOwnSafeRowPlacement(card) && !isOwnSafeRowSquare(z, r, c, cp)) continue;
        if(isBlocked(z,r,c) && !ignoresOpponentPlacementLocks) continue;
        if(G.board[z][r][c]!==null) continue;
        if((typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(card, cp) : card.type==='Supporter') && card.id!=='76' && !ignoresOpponentPlacementLocks && isBlockedByAlondra(z,r,c,cp)) continue;
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
      if(cell && cardActsAsPassive(cell, '14') && cell.owner===opp) {
        const dr=Math.abs(rr-r), dc=Math.abs(cc-c);
        // Ongoing suppression: ADJACENT only (orthogonal — up/down/left/right)
        if((dr+dc)===1) return true;
      }
    }
  }
  return false;
}

function clearPlaceHighlights() {
  document.querySelectorAll('#board .cell.placeable,#board .cell.move-target,#board .cell.landscape-move-target,#board .cell.brave-horizons-target').forEach(el=>el.classList.remove('placeable','move-target','landscape-move-target','brave-horizons-target'));
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

// Vigilantes (52) - mark an opponent card in this zone for a hand discard on departure.
function markCardForVigilantes(target, sourceCard, sourceOwner) {
  if(!target) return false;
  const targetOwner = target.owner;
  if(targetOwner !== 0 && targetOwner !== 1) return false;
  if(typeof isTargetImmuneToEffectOwner === 'function' && isTargetImmuneToEffectOwner(target, sourceOwner)) return false;
  if(!Array.isArray(target._vigilantesMarks)) target._vigilantesMarks = [];
  const sourceIid = String(sourceCard && (sourceCard.iid || sourceCard.id) || '52');
  if(target._vigilantesMarks.some(function(mark){ return String(mark && mark.sourceIid || '') === sourceIid; })) return false;
  target._vigilantesMarks.push({sourceIid:sourceIid, sourceOwner:sourceOwner, targetOwner:targetOwner, createdTurn:G.turn});
  target._markedForDeath = true;
  return true;
}

function resolveVigilantesMarkedCardDeparture(card, options) {
  if(!card || !Array.isArray(card._vigilantesMarks) || !card._vigilantesMarks.length) return 0;
  const opts = options || {};
  if(!opts.force && typeof getBoardCardPosition === 'function' && getBoardCardPosition(card)) return 0;
  const marks = card._vigilantesMarks.slice();
  delete card._vigilantesMarks;
  delete card._markedForDeath;
  let discarded = 0;
  const names = [];
  marks.forEach(function(mark, markIndex){
    const targetOwner = Number(mark && mark.targetOwner);
    const sourceOwner = Number(mark && mark.sourceOwner);
    if((targetOwner !== 0 && targetOwner !== 1) || !G.players[targetOwner]) return;
    const hand = G.players[targetOwner].hand || [];
    const candidates = hand.filter(function(candidate){
      if(typeof isTargetImmuneToEffectOwner === 'function') return !isTargetImmuneToEffectOwner(candidate, sourceOwner);
      return !candidate.immuneFlag && String(candidate.id || '') !== '76';
    });
    if(!candidates.length) return;
    const onlineIndex = deterministicOnlineRandomIndex(candidates.length, 'vigilantesDeparture:' + String(card.iid || card.id) + ':' + String(mark.sourceIid || markIndex), sourceOwner);
    const selected = candidates[onlineIndex >= 0 ? onlineIndex : Math.floor(Math.random() * candidates.length)];
    const handIndex = hand.indexOf(selected);
    if(handIndex < 0) return;
    hand.splice(handIndex, 1);
    fatePushDiscard(targetOwner, selected, {sound:false, skipVigilantesDeparture:true});
    discarded++;
    names.push(selected.name || 'a card');
  });
  if(discarded) {
    toast('Marked for Death discarded ' + names.join(', ') + ' from the opponent\'s hand.');
    log('sys','Marked for Death discarded ' + discarded + ' random hand card' + (discarded === 1 ? '' : 's') + '.');
  }
  return discarded;
}

function vigilantePickTarget(targetZ, cp, opp, inst) {
  const oppCards = [];
  G.board[targetZ].forEach((row,ri)=>row.forEach((cell,ci)=>{
    if(cell && cell.owner===opp && !(typeof isTargetImmuneToEffectOwner === 'function' ? isTargetImmuneToEffectOwner(cell, cp) : (typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(cell)))) oppCards.push({card:cell,z:targetZ,r:ri,c:ci});
  }));
  if(oppCards.length===0){toast('No eligible opponent cards in Zone '+(targetZ+1));return;}
  pickCardInZone(targetZ,'Marked for Death: select one opponent card in this zone.',(tgt)=>{
    if(tgt.owner !== opp){toast('Must select an opponent card');return;}
    if(typeof isTargetImmuneToEffectOwner === 'function' ? isTargetImmuneToEffectOwner(tgt, cp) : (typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(tgt))){showBlockedAnimation('this card is immune');return;}
    markCardForVigilantes(tgt, inst, cp);
    if(inst) inst.vigilanteUsed = true;
    toast(tgt.name+' is marked. When it leaves the field, a random card is discarded from the opponent\'s hand.');
    log(cp===0?'p1':'p2','Vigilantes marked '+tgt.name+' for death');
    renderGame({board:true, scores:true, topbar:true});
  }, cell=>cell && cell.owner===opp && !(typeof isTargetImmuneToEffectOwner === 'function' ? isTargetImmuneToEffectOwner(cell, cp) : (typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(cell))), null, inst);
}

// Rozsi Szocs (34) — Coordinator(2): cards moved into zone gain +3 Fate (not setting)
function flashCardEffect(card, kind, options) {
  if(!card || typeof window === 'undefined' || typeof window.markCardEffectFlash !== 'function') return false;
  const marked = window.markCardEffectFlash(card, kind, options || {});
  if(marked) {
    try {
      if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function') {
        window.FateMatchRendererAdapter.scheduleRender('card-effect-flash-started');
      } else if(typeof renderGame === 'function') {
        renderGame({board:true});
      }
    } catch(e) {}
  }
  return marked;
}
window.flashCardEffect = flashCardEffect;

function markMovementEffectFlash(card, soundKey) {
  return flashCardEffect(card, 'movement_boot', {
    label:'effect movement',
    soundKey:soundKey || ('movement:' + String(card && (card.iid || card.id) || 'card') + ':' + String(G.turn || 0))
  });
}
window.markMovementEffectFlash = markMovementEffectFlash;

const COORDINATOR_PLACEMENT_FLASH_KIND_BY_ID = Object.freeze({
  '01':'coord_felicyta_eagle',
  '10':'coord_postmodern_dylan',
  '11':'coord_anne_trio',
  '15':'coord_zsofia_river',
  '19':'coord_kvetka_bloom',
  '23':'coord_cathy_cardigan',
  '57':'coord_jeremiah_snowseal',
  '77':'coord_heyward_compass'
});
const coordinatorPlacementFlashKeys = new Set();
const incomingCoordinatorFlashKeys = new Set();

function coordinatorAuraAffectsTarget(source, sourceZ, sourceR, sourceC, target, targetR, targetC) {
  if(!source || !target || sourceZ < 0 || source.owner !== target.owner && !cardActsAsPassive(source, '10')) return false;
  if(cardActsAsPassive(source, '10')) return target.owner !== source.owner;
  if(source.owner !== target.owner) return false;
  if(cardActsAsPassive(source, '01')) {
    return Math.abs(Number(targetR) - Number(sourceR)) + Math.abs(Number(targetC) - Number(sourceC)) === 1;
  }
  if(cardActsAsPassive(source, '11')) {
    return typeof isCardSupporterForRules === 'function'
      ? isCardSupporterForRules(target, target.owner)
      : target.type === 'Supporter';
  }
  if(cardActsAsPassive(source, '19')) return target.type === 'Coordinator';
  if(cardActsAsPassive(source, '23')) {
    return typeof isCardCharacterForRules === 'function'
      ? isCardCharacterForRules(target, target.owner)
      : target.type !== 'Supporter';
  }
  if(cardActsAsPassive(source, '77')) return !!source._declaredAff && target.aff === source._declaredAff;
  if(cardActsAsPassive(source, 'bh02')) return true;
  if(typeof cardActsAsPassive === 'function' ? cardActsAsPassive(source, 'bh07') : (source.id === 'bh07' || (source.id === 'bh05' && source._bh05CopiedPassiveId === 'bh07'))) {
    return getAdjacentCards(sourceZ, sourceR, sourceC).some(function(entry){
      const card = entry && entry.card;
      if(!card || isFaceDownCard(card)) return false;
      if(typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(card)) return false;
      return String(card.type || '') === 'Dauntless';
    });
  }
  return false;
}

function scheduleCoordinatorPlacementFlash(card, options) {
  if(!card || card.faceDown) return false;
  const kind = COORDINATOR_PLACEMENT_FLASH_KIND_BY_ID[String(card.id || '')];
  if(!kind) return false;
  const opts = options || {};
  let z = Number.isInteger(Number(opts.z)) ? Number(opts.z) : -1;
  let r = Number.isInteger(Number(opts.r)) ? Number(opts.r) : -1;
  let c = Number.isInteger(Number(opts.c)) ? Number(opts.c) : -1;
  const affected = getCoordinatorPlacementFlashTargets(card, z, r, c);
  if(!affected.length) return false;
  const flashKey = [
    String(card.iid || card.id || 'card'),
    String(z),
    String(r),
    String(c),
    String(G && G.turn || 0)
  ].join(':');
  if(card._coordinatorPlacementFlashPlayed || coordinatorPlacementFlashKeys.has(flashKey)) return false;
  coordinatorPlacementFlashKeys.add(flashKey);
  card._coordinatorPlacementFlashPlayed = true;
  const lockDelay = Math.max(0, Number(G && G._cinematicUiLockUntil || 0) - Date.now());
  const delayMs = Number.isFinite(Number(opts.delayMs)) ? Math.max(0, Number(opts.delayMs)) : Math.max(lockDelay + 90, 160);
  setTimeout(function(){
    let liveSource = G && G.board && G.board[z] && G.board[z][r] ? G.board[z][r][c] : null;
    if(!liveSource || String(liveSource.iid || '') !== String(card.iid || '')) {
      liveSource = null;
      if(typeof forEachBoardCard === 'function') {
        forEachBoardCard(function(candidate, candidateZ, candidateR, candidateC){
          if(liveSource || !candidate) return;
          if(String(candidate.iid || '') === String(card.iid || '')) {
            liveSource = candidate;
            z = candidateZ;
            r = candidateR;
            c = candidateC;
          }
        });
      }
    }
    if(!liveSource || liveSource.faceDown) return;
    liveSource._coordinatorPlacementFlashPlayed = true;
    const liveAffected = getCoordinatorPlacementFlashTargets(liveSource, z, r, c);
    liveAffected.forEach(function(target, index){
      if(!target || target.faceDown) return;
      flashCardEffect(target, kind, {
        label:opts.label || 'coordinator sigil',
        soundKey:(opts.soundKey || ('coord:' + String(liveSource.iid || liveSource.id || 'card') + ':' + String(G.turn || 0))) + ':' + String(target.iid || target.id || index),
        waitForConsolidationCinematic:true
      });
    });
  }, delayMs);
  return true;
}
window.scheduleCoordinatorPlacementFlash = scheduleCoordinatorPlacementFlash;

function getCoordinatorPlacementFlashTargets(source, z, r, c) {
  if(!source || !G || !Array.isArray(G.board) || z < 0 || !G.board[z]) return [];
  if(source.type === 'Coordinator' && typeof isCoordinatorSuppressedAt === 'function' && r >= 0 && c >= 0 && isCoordinatorSuppressedAt(z, r, c)) return [];
  const targets = [];
  const isInvisibleCard = function(card){
    if(!card || isFaceDownCard(card)) return true;
    return typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(card);
  };
  const add = function(card){
    if(!card || isInvisibleCard(card)) return;
    if(!targets.some(function(existing){ return existing && existing.iid && card.iid && existing.iid === card.iid; })) targets.push(card);
  };
  G.board[z].forEach(function(row, rr){
    (row || []).forEach(function(cell, cc){
      if(!cell || isInvisibleCard(cell)) return;
      if(cardActsAsPassive(source, '57')) {
        let receivesBoostedAura = false;
        G.board[z].forEach(function(auraRow, auraR){
          (auraRow || []).forEach(function(aura, auraC){
            if(receivesBoostedAura || !aura || aura.iid === source.iid || aura.owner !== source.owner || aura.type !== 'Coordinator' || isInvisibleCard(aura)) return;
            if(typeof isCoordinatorSuppressedAt === 'function' && isCoordinatorSuppressedAt(z, auraR, auraC)) return;
            if(coordinatorAuraAffectsTarget(aura, z, auraR, auraC, cell, rr, cc)) receivesBoostedAura = true;
          });
        });
        if(receivesBoostedAura) add(cell);
        return;
      }
      if(coordinatorAuraAffectsTarget(source, z, r, c, cell, rr, cc)) add(cell);
    });
  });
  return targets;
}
if(typeof window !== 'undefined') window.getCoordinatorPlacementFlashTargets = getCoordinatorPlacementFlashTargets;

function getIncomingCoordinatorEffectSources(target, z, r, c) {
  if(!target || target.faceDown || !G || !Array.isArray(G.board) || z < 0 || !G.board[z]) return [];
  if(typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(target)) return [];
  const sources = [];
  const coordinators = [];
  G.board[z].forEach(function(row, sourceR){
    (row || []).forEach(function(source, sourceC){
      if(!source || source.faceDown || source.iid === target.iid) return;
      const sourceId = typeof getCardRuntimeEffectId === 'function'
        ? getCardRuntimeEffectId(source)
        : String(source.id || '');
      if(!COORDINATOR_PLACEMENT_FLASH_KIND_BY_ID[sourceId]) return;
      if(source.type === 'Coordinator' && typeof isCoordinatorSuppressedAt === 'function' && isCoordinatorSuppressedAt(z, sourceR, sourceC)) return;
      coordinators.push({card:source, effectId:sourceId, r:sourceR, c:sourceC});
    });
  });
  const directAuras = coordinators.filter(function(entry){
    return entry.effectId !== '57'
      && coordinatorAuraAffectsTarget(entry.card, z, entry.r, entry.c, target, r, c);
  });
  directAuras.forEach(function(entry){
    sources.push({
      card:entry.card,
      effectId:entry.effectId,
      kind:COORDINATOR_PLACEMENT_FLASH_KIND_BY_ID[entry.effectId]
    });
  });
  if(directAuras.some(function(entry){ return entry.card.owner === target.owner; })) {
    coordinators.forEach(function(entry){
      if(entry.effectId !== '57' || entry.card.owner !== target.owner) return;
      sources.push({
        card:entry.card,
        effectId:entry.effectId,
        kind:COORDINATOR_PLACEMENT_FLASH_KIND_BY_ID['57']
      });
    });
  }
  G.board[z].forEach(function(row, sourceR){
    (row || []).forEach(function(source, sourceC){
      if(!source || source.faceDown || source.iid === target.iid) return;
      const actsAsAgentK = typeof cardActsAsPassive === 'function'
        ? cardActsAsPassive(source, 'bh07')
        : (String(source.id || '') === 'bh07' || (String(source.id || '') === 'bh05' && String(source._bh05CopiedPassiveId || '') === 'bh07'));
      if(!actsAsAgentK || source.owner !== target.owner) return;
      if(source.type === 'Coordinator' && typeof isCoordinatorSuppressedAt === 'function' && isCoordinatorSuppressedAt(z, sourceR, sourceC)) return;
      if(!coordinatorAuraAffectsTarget(source, z, sourceR, sourceC, target, r, c)) return;
      // An adjacent Dauntless changes Agent K's stack count, so the placement
      // adapter owns one shared zone-wide Overclock reveal for that event.
      // Every other card entering an already-active aura gets this isolated reveal.
      const targetIsAdjacentDauntless = String(target.type || '') === 'Dauntless'
        && Math.abs(Number(r) - Number(sourceR)) + Math.abs(Number(c) - Number(sourceC)) === 1;
      if(targetIsAdjacentDauntless) return;
      sources.push({
        card:source,
        kind:'bh07_overclock'
      });
    });
  });
  if(typeof getActiveWhisperTokens === 'function') {
    getActiveWhisperTokens(null, null).forEach(function(sourceEntry){
      const source = sourceEntry && sourceEntry.card;
      if(!source || source.faceDown || source.iid === target.iid) return;
      if(String(source._whisperCopiedEffectId || '') !== 'bh07' || source.owner !== target.owner) return;
      if(typeof getBh07AdjacentDauntlessCount !== 'function' || getBh07AdjacentDauntlessCount(source) <= 0) return;
      const targetIsAdjacentDauntless = String(target.type || '') === 'Dauntless'
        && Number(sourceEntry.z) === Number(z)
        && Math.abs(Number(r) - Number(sourceEntry.r)) + Math.abs(Number(c) - Number(sourceEntry.c)) === 1;
      if(targetIsAdjacentDauntless) return;
      sources.push({
        card:source,
        kind:'bh07_overclock'
      });
    });
  }
  return sources;
}
if(typeof window !== 'undefined') window.getIncomingCoordinatorEffectSources = getIncomingCoordinatorEffectSources;

function flashIncomingCoordinatorEffects(targetOrIid, options) {
  const opts = options || {};
  const iid = String(targetOrIid && targetOrIid.iid || targetOrIid || '');
  if(!iid || typeof forEachBoardCard !== 'function') return {flashed:false, hasNonKvetka:false, kvetkaGainAmount:0};
  let target = null;
  let z = -1, r = -1, c = -1;
  forEachBoardCard(function(card, cardZ, cardR, cardC){
    if(target || !card || String(card.iid || '') !== iid) return;
    target = card;
    z = cardZ;
    r = cardR;
    c = cardC;
  });
  if(!target || target.faceDown) return {flashed:false, hasNonKvetka:false, kvetkaGainAmount:0};
  const sources = getIncomingCoordinatorEffectSources(target, z, r, c);
  if(!sources.length) return {flashed:false, hasNonKvetka:false, kvetkaGainAmount:0};
  const sourceEffectId = function(entry){
    if(entry && entry.effectId) return String(entry.effectId);
    return typeof getCardRuntimeEffectId === 'function'
      ? getCardRuntimeEffectId(entry && entry.card)
      : String(entry && entry.card && entry.card.id || '');
  };
  let jeremiahCount = 0;
  sources.forEach(function(entry){ if(sourceEffectId(entry) === '57') jeremiahCount++; });
  let kvetkaGainAmount = 0;
  let hasNonKvetka = false;
  const uniqueKinds = [];
  sources.forEach(function(entry){
    const sourceId = sourceEffectId(entry);
    if(sourceId === '19') kvetkaGainAmount += 3 + jeremiahCount;
    else hasNonKvetka = true;
    if(entry.kind && !uniqueKinds.some(function(existing){ return existing.kind === entry.kind; })) uniqueKinds.push(entry);
  });
  const sequenceKey = [
    iid,
    String(opts.createdAt || target._placementFateReveal?.createdAt || G.turn || 0),
    uniqueKinds.map(function(entry){ return entry.kind; }).join(',')
  ].join(':');
  if(incomingCoordinatorFlashKeys.has(sequenceKey)) {
    return {flashed:false, hasNonKvetka, kvetkaGainAmount};
  }
  incomingCoordinatorFlashKeys.add(sequenceKey);
  uniqueKinds.forEach(function(entry, index){
    const show = function(){
      flashCardEffect(target, entry.kind, {
        label:String(entry.card.ability || entry.card.name || 'Coordinator effect'),
        soundKey:'incoming-coordinator:' + sequenceKey + ':' + String(index)
      });
    };
    if(index === 0) show();
    else setTimeout(show, index * 850);
  });
  return {flashed:true, hasNonKvetka, kvetkaGainAmount};
}
if(typeof window !== 'undefined') window.flashIncomingCoordinatorEffects = flashIncomingCoordinatorEffects;

function getZsofiaCoordinatorSetSources(owner, z) {
  const sources = [];
  const seen = new Set();
  const addSource = function(entry, fieldWide){
    if(!entry || !entry.card) return;
    const key = String(entry.card.iid || entry.card.id || '');
    if(key && seen.has(key)) return;
    if(key) seen.add(key);
    sources.push({card:entry.card, z:entry.z, r:entry.r, c:entry.c, fieldWide:!!fieldWide});
  };
  if(G && Array.isArray(G.board) && G.board[z]) {
    G.board[z].forEach(function(row, r){
      (row || []).forEach(function(card, c){
        if(!card || card.owner !== owner || !cardActsAsPassive(card, '15') || isFaceDownCard(card)) return;
        if(typeof isCoordinatorSuppressedAt === 'function' && isCoordinatorSuppressedAt(z, r, c)) return;
        addSource({card, z, r, c}, false);
      });
    });
  }
  if(typeof getActiveWhisperTokens === 'function') {
    getActiveWhisperTokens(owner, '15').forEach(function(entry){ addSource(entry, true); });
  }
  return sources;
}

function applyZsofiaCoordinatorSetTrigger(placedCard, z, r, c) {
  if(!placedCard || isFaceDownCard(placedCard) || String(placedCard.type || '') !== 'Coordinator') return 0;
  const owner = Number(placedCard.owner);
  if(owner !== 0 && owner !== 1) return 0;
  const sources = getZsofiaCoordinatorSetSources(owner, z);
  if(!sources.length) return 0;
  let totalGained = 0;
  sources.forEach(function(source){
    const potencyBoost = typeof getWhisperAuraPotencyBoost === 'function' ? getWhisperAuraPotencyBoost(source) : 0;
    const amount = 1 + Math.max(0, Number(potencyBoost) || 0);
    const visitZone = function(zone, zoneIndex){
      (zone || []).forEach(function(row){
        (row || []).forEach(function(target){
          if(!target || target.owner !== owner) return;
          if(typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(target)) return;
          if(typeof modifyFate === 'function') modifyFate(target, amount, 'permanent');
          else target.currentFate = (Number(target.currentFate ?? target.fate) || 0) + amount;
          totalGained += amount;
          if(typeof flashCardEffect === 'function') flashCardEffect(target, 'coord_zsofia_river', {
            label:'Blue Danube Waltz',
            soundKey:['zsofia-set', String(source.card.iid || source.card.id || '15'), String(placedCard.iid || placedCard.id || 'card'), String(zoneIndex), String(G.turn || 0)].join(':'),
            waitForConsolidationCinematic:true
          });
        });
      });
    };
    if(source.fieldWide) {
      (G.board || []).forEach(visitZone);
    } else {
      visitZone(G.board && G.board[z], z);
    }
  });
  if(totalGained > 0 && (typeof shouldShowPlayerEffectFeedback !== 'function' || shouldShowPlayerEffectFeedback(owner))) {
    toast('Blue Danube Waltz: friendly cards gain ' + totalGained + ' total Fate.');
  }
  return totalGained;
}
if(typeof window !== 'undefined') window.applyZsofiaCoordinatorSetTrigger = applyZsofiaCoordinatorSetTrigger;

function nextKvetkaBalladPitchStep(player) {
  if(!Array.isArray(G._kvetkaBalladPitchSteps)) G._kvetkaBalladPitchSteps = [0,0];
  const step = Math.max(0, Number(G._kvetkaBalladPitchSteps[player]) || 0);
  G._kvetkaBalladPitchSteps[player] = step + 1;
  return step;
}

function triggerRozsiPassive(card, destZ) {
  if(typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(card)) return;
  forEachBoardCard((c, cz, cr, cc) => {
    if(cardActsAsPassive(c, '34') && cz === destZ && c.owner === card.owner && !(typeof isCardEffectSuppressed === 'function' && isCardEffectSuppressed(c, cz, cr, cc))) {
      const boost = typeof getWhisperAuraPotencyBoost === 'function' ? getWhisperAuraPotencyBoost({card:c, z:cz, r:cr, c:cc}) : 0;
      const amount = 3 + boost;
      if(typeof modifyFate === 'function') modifyFate(card, amount, 'permanent');
      else card.currentFate = (card.currentFate || card.fate || 0) + amount;
      flashCardEffect(card, 'rozsi_dance', {
        label:'Hungarian Dance',
        soundKey:'rozsi:' + String(c.iid || c.id) + ':' + String(card.iid || card.id) + ':' + String(G.turn || 0)
      });
      if(typeof shouldShowPlayerEffectFeedback !== 'function' || shouldShowPlayerEffectFeedback(card.owner)) toast(card.name + ' gains ' + amount + ' Fate from Hungarian Dance!');
    }
  });
}

function hasAnickaVoyagerMovedThisTurn(card) {
  if(!card || String(card.id || '') !== 'bh01') return false;
  return card.bh01MovedThisTurn === true || Number(card._braveHorizonsLastMoveTurn) === Number(G && G.turn);
}

function triggerJoieDrawEffectPassive(player, context) {
  if(!G || !Array.isArray(G.board) || (Number(player) !== 0 && Number(player) !== 1)) return 0;
  const owner = Number(player);
  const ctx = context || {};
  const sources = [];
  G.board.forEach(function(zone, z){
    (zone || []).forEach(function(row, r){
      (row || []).forEach(function(card, c){
        if(!card || card.owner !== owner || !(typeof cardActsAsPassive === 'function' ? cardActsAsPassive(card, 'bh02') : String(card.id || '') === 'bh02') || isFaceDownCard(card)) return;
        if(typeof isCoordinatorSuppressedAt === 'function' && isCoordinatorSuppressedAt(z, r, c)) return;
        sources.push({card, z, r, c, fieldWide:false});
      });
    });
  });
  if(typeof getActiveWhisperTokens === 'function') {
    getActiveWhisperTokens(owner, 'bh02').forEach(function(entry){
      sources.push({card:entry.card, z:entry.z, r:entry.r, c:entry.c, fieldWide:true});
    });
  }
  if(!sources.length) return 0;

  G._joieDrawEffectSeq = (Number(G._joieDrawEffectSeq) || 0) + 1;
  const eventKey = ['joie-thousand-reel', owner, Number(G.turn) || 0, G._joieDrawEffectSeq].join(':');
  let totalGains = 0;
  sources.forEach(function(source){
    source.card._joieProcCount = Math.max(0, Math.floor(Number(source.card._joieProcCount) || 0)) + 1;
    const potencyBoost = typeof getWhisperAuraPotencyBoost === 'function' ? getWhisperAuraPotencyBoost(source) : 0;
    const amount = 1 + Math.max(0, Number(potencyBoost) || 0);
    G.board.forEach(function(zone, z){
      if(!source.fieldWide && z !== source.z) return;
      (zone || []).forEach(function(row){
        (row || []).forEach(function(target){
          if(!target || target.owner !== owner || isFaceDownCard(target)) return;
          if(typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(target)) return;
          if(typeof modifyFate === 'function') modifyFate(target, amount, 'permanent');
          else target.currentFate = (Number(target.currentFate ?? target.fate) || 0) + amount;
          totalGains += amount;
          if(typeof flashCardEffect === 'function') flashCardEffect(target, 'joie_thousand_reel', {
            label:'Thousand Reel Stare',
            soundKey:eventKey
          });
        });
      });
    });
  });
  if(totalGains > 0) {
    const sourceName = String(ctx.sourceCard?.ability || ctx.sourceCard?.name || ctx.sourceId || 'draw effect');
    toast('Thousand Reel Stare: +' + totalGains + ' total Fate from ' + sourceName + '.');
    if(typeof renderEffectResolutionForPlayer === 'function') renderEffectResolutionForPlayer(owner, {hand:false, piles:false});
    else renderGame({board:true, scores:true});
  }
  return totalGains;
}
window.triggerJoieDrawEffectPassive = triggerJoieDrawEffectPassive;

function getBh07AdjacentDauntlessCount(sourceCard) {
  const actsAsAgentK = !!sourceCard && (typeof cardActsAsPassive === 'function'
    ? cardActsAsPassive(sourceCard, 'bh07')
    : (String(sourceCard.id || '') === 'bh07' || (String(sourceCard.id || '') === 'bh05' && String(sourceCard._bh05CopiedPassiveId || '') === 'bh07')));
  if(!sourceCard || (!actsAsAgentK && String(sourceCard._whisperCopiedEffectId || '') !== 'bh07') || isFaceDownCard(sourceCard)) return 0;
  let sourcePos = null;
  if(typeof forEachBoardCard === 'function') forEachBoardCard(function(card, z, r, c){
    if(!sourcePos && card && String(card.iid || '') === String(sourceCard.iid || '')) sourcePos = {z, r, c};
  });
  if(!sourcePos || (typeof isCoordinatorSuppressedAt === 'function' && isCoordinatorSuppressedAt(sourcePos.z, sourcePos.r, sourcePos.c))) return 0;
  return getAdjacentCards(sourcePos.z, sourcePos.r, sourcePos.c).filter(function(entry){
    return entry && entry.card && !isFaceDownCard(entry.card) && String(entry.card.type || '') === 'Dauntless';
  }).length;
}
window.getBh07AdjacentDauntlessCount = getBh07AdjacentDauntlessCount;

function getBh07OverclockSourcesForPlacedDauntless(placedCard, z, r, c) {
  if(!placedCard || isFaceDownCard(placedCard) || String(placedCard.type || '') !== 'Dauntless') return [];
  if(!Number.isFinite(Number(z)) || !Number.isFinite(Number(r)) || !Number.isFinite(Number(c))) return [];
  return getAdjacentCards(Number(z), Number(r), Number(c)).filter(function(entry){
    const source = entry && entry.card;
    if(!source || isFaceDownCard(source)) return false;
    const actsAsAgentK = typeof cardActsAsPassive === 'function'
      ? cardActsAsPassive(source, 'bh07')
      : (String(source.id || '') === 'bh07' || (String(source.id || '') === 'bh05' && String(source._bh05CopiedPassiveId || '') === 'bh07'));
    if(!actsAsAgentK && String(source._whisperCopiedEffectId || '') !== 'bh07') return false;
    return !(typeof isCoordinatorSuppressedAt === 'function' && isCoordinatorSuppressedAt(Number(z), Number(entry.r), Number(entry.c)));
  });
}
window.getBh07OverclockSourcesForPlacedDauntless = getBh07OverclockSourcesForPlacedDauntless;

function getBh07OverclockTargets(sourceEntry) {
  if(!G || !Array.isArray(G.board) || !sourceEntry || !sourceEntry.card) return [];
  const source = sourceEntry.card;
  const fieldWide = String(source._whisperCopiedEffectId || '') === 'bh07';
  const zones = fieldWide ? G.board : [G.board[Number(sourceEntry.z)] || []];
  const targets = [];
  zones.forEach(function(zone){ (zone || []).forEach(function(row){
    (row || []).forEach(function(target){
      if(!target || target.owner !== source.owner || isFaceDownCard(target)) return;
      if(typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(target)) return;
      targets.push(target);
    });
  }); });
  return targets;
}
window.getBh07OverclockTargets = getBh07OverclockTargets;

function flashBh07OverclockTargets(sourceIids, targetIids, eventKey) {
  const liveSources = (sourceIids || []).map(function(iid){ return findBoardCardByIid(iid); }).filter(function(source){
    return source && getBh07AdjacentDauntlessCount(source) > 0;
  });
  if(!liveSources.length) return false;
  let flashed = false;
  (targetIids || []).forEach(function(iid){
    const target = findBoardCardByIid(iid);
    if(!target || isFaceDownCard(target)) return;
    if(typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(target)) return;
    if(typeof flashCardEffect === 'function') flashed = flashCardEffect(target, 'bh07_overclock', {
      label:'Overclock',
      soundKey:eventKey || ('bh07-overclock:' + String(iid || 'card'))
    }) || flashed;
  });
  return flashed;
}
window.flashBh07OverclockTargets = flashBh07OverclockTargets;

function triggerMajaMischievousActivities(player, context) {
  if(!G || !Array.isArray(G.board) || (Number(player) !== 0 && Number(player) !== 1)) return 0;
  const owner = Number(player);
  const sources = [];
  G.board.forEach(function(zone, z){
    (zone || []).forEach(function(row, r){
      (row || []).forEach(function(card, c){
        if(!card || card.owner !== owner || (!cardActsAsPassive(card, 'bh08') && String(card._whisperCopiedEffectId || '') !== 'bh08') || isFaceDownCard(card)) return;
        if(typeof isCoordinatorSuppressedAt === 'function' && isCoordinatorSuppressedAt(z, r, c)) return;
        sources.push({card, z, r, c, fieldWide:String(card._whisperCopiedEffectId || '') === 'bh08'});
      });
    });
  });
  if(!sources.length) return 0;
  G._bh08MischiefSeq = (Number(G._bh08MischiefSeq) || 0) + 1;
  const eventKey = ['bh08-mischief', owner, Number(G.turn) || 0, G._bh08MischiefSeq].join(':');
  let totalGains = 0;
  sources.forEach(function(source){
    source.card._bh08ProcCount = Math.max(0, Math.floor(Number(source.card._bh08ProcCount) || 0)) + 1;
    const potencyBoost = typeof getWhisperAuraPotencyBoost === 'function' ? getWhisperAuraPotencyBoost(source) : 0;
    const amount = 2 + Math.max(0, Number(potencyBoost) || 0);
    const zones = source.fieldWide ? G.board : [G.board[source.z] || []];
    zones.forEach(function(zone){ (zone || []).forEach(function(row){
      (row || []).forEach(function(target){
        if(!target || target.owner !== owner) return;
        if(typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(target)) return;
        const before = Number(target.currentFate ?? target.fate) || 0;
        if(typeof modifyFate === 'function') modifyFate(target, amount, 'permanent', owner);
        else target.currentFate = before + amount;
        const after = Number(target.currentFate ?? target.fate) || 0;
        if(after <= before) return;
        totalGains += after - before;
        if(typeof flashCardEffect === 'function') flashCardEffect(target, 'bh08_mischief', {
          label:'Mischievous Activities',
          soundKey:eventKey
        });
      });
    }); });
  });
  if(totalGains > 0) {
    const action = String(context && context.mode || 'negated or suppressed');
    toast('Mischievous Activities: +' + totalGains + ' total Fate after an effect was ' + action + '.');
    if(typeof renderEffectResolutionForPlayer === 'function') renderEffectResolutionForPlayer(owner, {hand:false, piles:false});
    else renderGame({board:true, scores:true});
  }
  return totalGains;
}
window.triggerMajaMischievousActivities = triggerMajaMischievousActivities;

function getAnickaVoyagerMoveOptions(card, fromZ, fromR, fromC) {
  if(!card || String(card.id || '') !== 'bh01' || card.owner !== G.currentPlayer || hasAnickaVoyagerMovedThisTurn(card)) return [];
  const live = G.board?.[fromZ]?.[fromR]?.[fromC] || null;
  if(!live || (card.iid != null && String(live.iid || '') !== String(card.iid))) return [];
  const options = [];
  (G.board || []).forEach(function(zone, z){
    (zone || []).forEach(function(row, r){
      const capacity = typeof getBoardRowCapacity === 'function' ? getBoardRowCapacity(z, r) : (Array.isArray(row) ? row.length : 0);
      for(let c = 0; c < capacity; c++){
        if(!Array.isArray(row) || row[c] !== null || isBlocked(z, r, c)) continue;
        options.push({z, r, c});
      }
    });
  });
  return options;
}

function beginAnickaVoyagerMove(card, z, r, c) {
  if(hasAnickaVoyagerMovedThisTurn(card)) {
    toast('Ani\u010dka can only move once per turn');
    return false;
  }
  const options = getAnickaVoyagerMoveOptions(card, z, r, c);
  if(!options.length) {
    toast('There are no open squares for Ani\u010dka to move to');
    return false;
  }
  G.placing = true;
  G._bh01Moving = {
    kind:'anickaVoyagerMove',
    sourceIid:String(card.iid == null ? '' : card.iid),
    cardId:'bh01',
    playerIndex:G.currentPlayer,
    fromZ:z,
    fromR:r,
    fromC:c,
    options:options
  };
  toast('Click any highlighted open square to move Ani\u010dka');
  if(typeof highlightAnickaVoyagerMoveCells === 'function') highlightAnickaVoyagerMoveCells(options);
  else highlightAllOpenCells();
  return true;
}

async function resolveAnickaVoyagerMove(z, r, c) {
  const move = G._bh01Moving;
  if(!move || move.kind !== 'anickaVoyagerMove') return false;
  const valid = Array.isArray(move.options) && move.options.some(function(option){ return option.z === z && option.r === r && option.c === c; });
  if(!valid || G.board?.[z]?.[r]?.[c] !== null || isBlocked(z, r, c)) {
    toast('Choose a highlighted open square');
    return false;
  }
  if(Number(move.playerIndex) !== Number(G.currentPlayer)) {
    toast('Only Ani\u010dka\'s controller can move her');
    return false;
  }
  const card = G.board?.[move.fromZ]?.[move.fromR]?.[move.fromC] || null;
  if(!card || String(card.id || '') !== 'bh01' || String(card.iid == null ? '' : card.iid) !== String(move.sourceIid || '') || card.owner !== G.currentPlayer) {
    G._bh01Moving = null;
    G.placing = false;
    clearPlaceHighlights();
    toast('Ani\u010dka is no longer in her original square');
    return false;
  }
  G.board[move.fromZ][move.fromR][move.fromC] = null;
  G.board[z][r][c] = card;
  card.bh01MovedThisTurn = true;
  card._braveHorizonsLastMoveTurn = Number(G.turn) || 0;
  G._bh01Moving = null;
  G.placing = false;
  clearPlaceHighlights();
  if(typeof playSailingMovementSfx === 'function') playSailingMovementSfx();
  else if(typeof playSfx === 'function') playSfx('sailingMove');
  if(typeof flashCardEffect === 'function') {
    flashCardEffect(card, 'anicka_voyager_boat', {
      label:'Brave Horizons',
      soundKey:'movement:brave-horizons:' + String(card.iid || card.id) + ':' + String(G.turn || 0)
    });
  } else if(typeof markMovementEffectFlash === 'function') {
    markMovementEffectFlash(card, 'movement:brave-horizons:' + String(card.iid || card.id) + ':' + String(G.turn || 0));
  }
  if(typeof triggerRozsiPassive === 'function') triggerRozsiPassive(card, z);
  // Commit the movement to the visible board before starting the draw. Waiting
  // through two frames lets the scheduled renderer register its move VFX;
  // drawCard then waits for that presentation to finish before flying the card.
  if(typeof renderBoardActionForPlayer === 'function') {
    renderBoardActionForPlayer(G.currentPlayer, {hand:false, piles:false, scores:true});
  } else {
    renderGame({board:true, hand:false, scores:true, blocks:true, topbar:true});
  }
  if(typeof requestAnimationFrame === 'function') {
    await new Promise(function(resolve){
      requestAnimationFrame(function(){ requestAnimationFrame(resolve); });
    });
  }
  const drewCard = Array.isArray(G.players?.[G.currentPlayer]?.deck) && G.players[G.currentPlayer].deck.length > 0;
  if(drewCard) await drawCard(G.currentPlayer, 1, {activatedDrawEffect:true, effectSource:card});
  toast(drewCard ? 'Ani\u010dka moved and drew 1 card.' : 'Ani\u010dka moved.');
  if(typeof renderBoardActionForPlayer === 'function') renderBoardActionForPlayer(G.currentPlayer, {hand:drewCard, piles:drewCard});
  else renderGame({board:true, hand:drewCard, scores:true, piles:drewCard, blocks:true, topbar:true});
  return true;
}

async function clickCell(z,r,c) {
  if(typeof window.fateHandleOnlineImprovisorHavanoDeploymentClick === 'function' && window.fateHandleOnlineImprovisorHavanoDeploymentClick(z,r,c)) {
    return;
  }
  if(G._havanoDeploying) {
    handleHavanoDeployClick(z,r,c);
    return;
  }
  // Block interaction during AI turn
  if(G.aiEnabled && (G.currentPlayer===G.aiPlayer || G._aiRunning)) return;
  // Mark's square picker is armed by an effect transaction and can become
  // visible during the presentation system's final cleanup frame. Once the
  // highlighted choice exists, do not silently discard the player's click.
  if(G._actionPresentationActive && !G._markSelecting) return;
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
    const pendingBlockZone = Number.isInteger(Number(G._blockingEffectZone)) ? Number(G._blockingEffectZone) : Number(window._blockZone);
    const blockZ = pendingBlockZone===-1 ? z : pendingBlockZone;
    const blockType = pendingBlockZone===-1 ? 'carolyn' : 'zoe';
    const owner = G.currentPlayer;
    const blockedPlayer = blockType === 'zoe' ? 1 - owner : null;
    const occupiedCell = !!(G.board && G.board[blockZ] && G.board[blockZ][r] && G.board[blockZ][r][c]);
    if(blockType === 'zoe' && z !== blockZ) {
      toast('Zoe can only block a square in her zone');
      playSfx('blocked');
      return;
    }
    if(blockType === 'zoe' && typeof isZoeBlockTargetAllowed === 'function' && !isZoeBlockTargetAllowed(blockZ, r, c, owner)) {
      toast('Zoe must choose a square in her zone');
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
      G.blockedCells.push({z:blockZ,r,c,type:blockType,owner,blockedPlayer,sourceIid:blockType === 'zoe' ? G._blockingEffectSourceIid : null});
    }
    if(typeof normalizeBlockedCells === 'function') normalizeBlockedCells();
    G.blockingCell=false;G.placing=false;
    delete G._blockingEffectZone;
    clearPlaceHighlights();
    // Show visual effect for the block
    if(typeof showBlockVisual === 'function') showBlockVisual(blockZ,r,c,blockType);
    if(blockType==='carolyn') {
      playSfx('carolynBlock');
      toast('Cell permanently locked by Carolyn!');
    } else {
      playSfx('zoeBlock');
      toast('Zoe: your opponent cannot consolidate on or from this square.');
    }
    if(G._blockingEffectSourceIid) {
      markInitialEffectResolvedByIid(G._blockingEffectSourceIid);
      delete G._blockingEffectSourceIid;
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
      toast('That square is not available');
      return;
    }
    const expectedMarkRow = Number.isInteger(sel.row)
      ? sel.row
      : (typeof getMarkSafeSquareChoiceRow === 'function' ? getMarkSafeSquareChoiceRow(z, G.currentPlayer) : (typeof getNextExtraRowIndex === 'function' ? getNextExtraRowIndex(z) : 3));
    const markRowCapacity = G.board && G.board[z] && G.board[z][expectedMarkRow] ? G.board[z][expectedMarkRow].length : 3;
    if(r !== expectedMarkRow || c < 0 || c >= markRowCapacity){
      toast('That square is not available');
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
    if(!added){
      toast('Could not add that safe square');
      renderGame({board:true, scores:true, topbar:true});
      return;
    }
    if(sel.sourceIid) markInitialEffectResolvedByIid(sel.sourceIid);
    if(typeof playSfx === 'function') playSfx('squarePlace');
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
    markMovementEffectFlash(mv.card, 'movement:busser-reactivate:' + String(mv.card.iid || mv.card.id) + ':' + String(G.turn || 0));
    triggerRozsiPassive(mv.card, z);
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
    markMovementEffectFlash(mv.inst, 'movement:berkeley:' + String(mv.inst.iid || mv.inst.id) + ':' + String(G.turn || 0));
    triggerRozsiPassive(mv.inst, z);
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
    if(typeof playSailingMovementSfx === 'function') playSailingMovementSfx();
    else if(typeof playSfx === 'function') playSfx('sailingMove');
    if(typeof flashCardEffect === 'function') {
      flashCardEffect(mv.card, 'anicka_voyager_boat', {
        label:'Panacea Sailors',
        soundKey:'movement:landscape:' + String(mv.card.iid || mv.card.id) + ':' + String(G.turn || 0)
      });
    } else if(typeof markMovementEffectFlash === 'function') {
      markMovementEffectFlash(mv.card, 'movement:landscape:' + String(mv.card.iid || mv.card.id) + ':' + String(G.turn || 0));
    }
    triggerRozsiPassive(mv.card, z);
    toast('Landscape movement: ' + mv.card.name + ' moved.');
    if(typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('Panacea movement', 'none');
    renderGame({board:true, scores:true, blocks:true, landscape:true, topbar:true});
    return;
  }
  // Handle Anicka Voyager (bh01) movement
  if(G._bh01Moving) {
    await resolveAnickaVoyagerMove(z, r, c);
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
    if(mv.wolfCreekCard && typeof isSupporterEffectSuppressed === 'function' && isSupporterEffectSuppressed(mv.wolfCreekCard)) {
      G._wolfCreekMoving = null;
      G.placing = false;
      clearPlaceHighlights();
      toast('Wolf Creek movement was suppressed.');
      renderGame({board:true, blocks:true, topbar:true});
      return;
    }
    const option = mv.options && mv.options.find(o=>o.z===z && o.r===r && o.c===c);
    const valid = !mv.options || !!option;
    if(!valid){toast('Choose one of the highlighted Wolf Creek squares');return;}
    const target = G.board[z][r][c];
    if(option && option.kind === 'swap'){
      const movingOwner = typeof mv.card.owner === 'number' ? mv.card.owner : (mv.wolfCreekCard && typeof mv.wolfCreekCard.owner === 'number' ? mv.wolfCreekCard.owner : G.currentPlayer);
      if(!target || Number(target.owner) !== Number(movingOwner) || target.iid === mv.card.iid || target.cantBeMoved){ toast('Choose a card you control to swap with'); return; }
      G.board[mv.fromZ][mv.fromR][mv.fromC] = target;
      G.board[z][r][c] = mv.card;
    }else{
      if(target !== null || isBlocked(z, r, c)){toast('Choose an open square on your side of the field');return;}
      G.board[mv.fromZ][mv.fromR][mv.fromC] = null;
      G.board[z][r][c] = mv.card;
    }
    if(mv.wolfCreekCard) mv.wolfCreekCard.wolfCreekUsed = true;
    G._wolfCreekMoving = null;
    G.placing = false;
    clearPlaceHighlights();
    markMovementEffectFlash(mv.card, 'movement:wolf-creek:' + String(mv.card.iid || mv.card.id) + ':' + String(G.turn || 0));
    triggerRozsiPassive(mv.card, z); // Rozsi: +3 fate on move into zone
    if(option && option.kind === 'swap' && target){
      triggerRozsiPassive(target, mv.fromZ);
    }
    toast(mv.card.name+' moved!');
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
    if(mv.card._busserSourceIid && isStoredEffectSourceSuppressed(mv.card._busserSourceIid)){
      toast('Busser movement was suppressed.');
      mv.card._busserTurnsLeft = 0;
      mv.card._busserMoves = 0;
      mv.card._busserOwner = null;
      mv.card._busserSourceIid = null;
      mv.card._busserMovedThisTurn = false;
      G._busserMovingCard=null;
      clearPlaceHighlights();
      renderGame({board:true, scores:true, topbar:true});
      return;
    }
    if(getBusserTurnsLeft(mv.card)<=0){toast('No Busser turns remaining');G._busserMovingCard=null;return;}
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
    G._busserMovingCard = null;
    G.placing = false;
    clearPlaceHighlights();
    markMovementEffectFlash(mv.card, 'movement:busser:' + String(mv.card.iid || mv.card.id) + ':' + String(G.turn || 0));
    triggerRozsiPassive(mv.card, z); // Rozsi: +3 fate on move into zone
    toast(mv.card.name + ' moved to Zone ' + (z+1) + '!');
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
    markMovementEffectFlash(mv.card, 'movement:expeditionary:' + String(mv.card.iid || mv.card.id) + ':' + String(G.turn || 0));
    triggerRozsiPassive(mv.card, z); // Rozsi: +3 fate on move into zone
    toast('ALPINE Expeditionary moved!');
    renderGame({board:true, scores:true, blocks:true, topbar:true});
    return;
  }
  if(!G.placing || G.selectedHandCard===null) return;
  const player = G.players[G.currentPlayer];
  const card = player.hand[G.selectedHandCard];
  if(!card) return;
  if(typeof tutorialCanPlaceCardAt === 'function' && !tutorialCanPlaceCardAt(card, z, r, c)) return;
  if(cardActsAsPassive(card, '70') && card.guerilla_transferred){
    playSfx('blocked');
    toast(card.name + ' cannot be set - it is debuffing this hand.');
    G.placing = false;
    clearPlaceHighlights();
    renderHand();
    return;
  }

  // Check validity again
  if(G.board[z][r][c]!==null){playSfx('blocked');toast('Cell is occupied');return;}
  const ignoresOpponentPlacementLocks = typeof isOpponentEffectOnlyImmuneCard === 'function' && isOpponentEffectOnlyImmuneCard(card);
  if(isBlocked(z,r,c) && !ignoresOpponentPlacementLocks){playSfx('blocked');toast('Cell is blocked');return;}
  // Enforce safe row ownership — P1 can only place on row 2+, P2 on row 0
  const cp = G.currentPlayer;
  const isPierogiCounter = typeof isWojciechPierogiCounter === 'function' && isWojciechPierogiCounter(card);
  if(isPierogiCounter ? !isWojciechPierogiPlacementSquare(z, r, c, cp) : (typeof isContestedOrOwnSafeSquare === 'function' && !isContestedOrOwnSafeSquare(z, r, c, cp))){
    playSfx('blocked');toast(isPierogiCounter ? 'Pierogi Counters need an open contested or opponent-owned square.' : (r >= 3 ? 'That square is not available' : (r === 1 ? 'Cannot place there' : 'Cannot place on opponent\'s safe row')));return;
  }
  if(!isPierogiCounter && !ignoresOpponentPlacementLocks && typeof G._artilleryLockedZone==='number' && G._artilleryLockedZone===z && G._artilleryLockOwner===cp && G._artilleryLockTurnsLeft>0){
    playSfx('blocked');toast('Artillery Distance locks this zone - cannot set cards here.');return;
  }
  // Enforce contested-only placement
  if(card.contestedOnly && r!==1){playSfx('blocked');toast(card.name+' can only be placed in contested rows');return;}
  if(requiresOwnSafeRowPlacement(card) && !isOwnSafeRowSquare(z, r, c, cp)){
    playSfx('blocked');
    toast(card.name + ' can only be set in your safe row');
    return;
  }

  const chingaBlockReason = getChingachlookPlacementBlockReason(card, z, G.currentPlayer);
  if(chingaBlockReason){
    playSfx('blocked');
    toast(chingaBlockReason);
    return;
  }

  const isAchillesToken = typeof isAchillesAdaptiveToken === 'function' && isAchillesAdaptiveToken(card);
  if(isAchillesToken && card._achillesConfigured !== true) {
    G.placing = false;
    G._achillesTargeting = null;
    clearPlaceHighlights();
    beginAchillesTokenConfiguration(card, cp, {target:{z:z, r:r, c:c}});
    return;
  }
  // Supporter limit re-check (skip for Lina free-set cards and Adaptive Tactic Tokens).
  const achillesCountsAsConsolidated = isAchillesToken && card._achillesPlayMode === 'consolidated';
  const isLinaFree = !!(card._linaFree || (G._linaFreeIids && G._linaFreeIids.has(card.iid)) || isAchillesToken);
  const cardIsSupporterForRules = typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(card, cp) : card.type === 'Supporter';
  if(cardIsSupporterForRules && card.id !== '76' && !ignoresOpponentPlacementLocks && isBlockedByAlondra(z, r, c, cp)) {
    playSfx('blocked');
    toast('Alondra blocks Supporters adjacent to her.');
    return;
  }
  if(!isLinaFree && cardIsSupporterForRules){
    const maxSup = G.maxSupportsPerTurn + G.extraSupportsThisTurn;
    if(!G.majaEffectThisTurn && G.supportsPlacedThisTurn >= maxSup){
      toast('Supporter limit reached: '+maxSup+'/turn');
      G.placing=false;G.selectedHandCard=null;
      clearPlaceHighlights();renderHand();
      return;
    }
  }

  if(isPierogiCounter) {
    if(!placeWojciechPierogiCounter(card, z, r, c, cp)) {
      playSfx('blocked');
      toast('Pierogi Counters need an open contested or opponent-owned square.');
    }
    return;
  }

  // Place the card
  const inst = newInstance(card);
  inst.owner = G.currentPlayer;
  inst.currentFate = getPlacedCardFate(card);
  if(isAchillesToken) {
    inst._achillesConfigured = true;
    inst._achillesPlayMode = achillesCountsAsConsolidated ? 'consolidated' : 'set';
    inst._achillesCountsAsConsolidated = achillesCountsAsConsolidated;
    inst._wasConsolidated = achillesCountsAsConsolidated;
    inst._wasSet = !achillesCountsAsConsolidated;
    inst._suppressConsolidationCinematic = true;
    inst.rarity = card.rarity || inst.rarity;
    inst.aff = card.aff || inst.aff;
    inst._suppressCinematicSubtitle = true;
  }
  preparePlacementFateReveal(inst, card, achillesCountsAsConsolidated ? 'consolidation' : 'set');
  markCardSetTurn(inst, G.currentPlayer);
  if(typeof applyLandscapePlacementBonuses === 'function') applyLandscapePlacementBonuses(inst, z, r, c);
  if(achillesCountsAsConsolidated && typeof trackLandscapeConsolidation === 'function') trackLandscapeConsolidation(G.currentPlayer, inst, z);
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
    if(!isFaceDownCard(inst)) inst._onlineSetResolutionPending = true;
    G.board[z][r][c] = inst;
    applyRiveraBuffToPlacedCard(inst, inst.owner);
    if(achillesCountsAsConsolidated) {
      if(typeof noteBalladConsolidation === 'function') noteBalladConsolidation(G.currentPlayer, inst);
      if(typeof updateDailyChallengeProgress === 'function') updateDailyChallengeProgress('consolidations', 1, 'add');
    }
    if(player.hand[handIndex] === card) player.hand.splice(handIndex, 1);
    else player.hand = player.hand.filter(c => c !== card);
    if(typeof window.fateAIRecordDecision === 'function') {
      window.fateAIRecordDecision({player:G.currentPlayer, action:'p', card:inst, zone:z, row:r, faceDown:!!inst.faceDown});
    }
    markCommit('state');
    if(typeof trackDailyCardPlacement === 'function') {
      deferSetCommitHook(function(){ trackDailyCardPlacement(inst, z, r, c); });
    }
    markCommit('dailyTrackingScheduled');

  const freePlacementCinematicKind = card.type !== 'Supporter' ? String(card._freePlacementCinematicKind || '') : '';
  const shouldPlayCharacterSetCinematic = card.type !== 'Supporter'
    && typeof requestCharacterSetCinematic === 'function'
    && !(typeof shouldSuppressConsolidationCinematic === 'function' && shouldSuppressConsolidationCinematic(inst));
  // Every face-up Character set through the normal placement path receives the
  // same cinematic, including free sets and local multiplayer placements.
  if(shouldPlayCharacterSetCinematic){
    if(isLinaFree || freePlacementCinematicKind) {
      inst._serverFreePlacementConsumed = inst._serverFreePlacementConsumed || (card._serverFreePlacementConsumed || freePlacementCinematicKind || 'linaFreeSet');
    }
    requestCharacterSetCinematic(inst, {z:z, r:r, c:c, delayMs:90, source:freePlacementCinematicKind || 'normal-set'});
  }
  markCommit('characterSetCinematic');

  // Anicka Konvicka (02) Starlit Path: any card placed in her zone by her controller gains 4 Fate.
  G.board[z].forEach((row, r)=>row.forEach((cell, c)=>{
    if(cell && cardActsAsPassive(cell, '02') && cell.owner===G.currentPlayer && cell.iid!==inst.iid && !isFaceDownCard(cell)){
      modifyFate(inst,4,'permanent');
    }
  }));
  markCommit('anickaPassive');

  // Play card placement sound (rarity-based) — skip if cinematic already handles audio
  var _cinematicHandlesAudio = shouldPlayCharacterSetCinematic;
  if(!_cinematicHandlesAudio){
    if(typeof playCardSetAudio === 'function') playCardSetAudio(card);
    else {
      if(typeof playCardSoundDeferred === 'function') playCardSoundDeferred(card.id, 0);
      else setTimeout(function(){ playCardSound(card.id); }, 0);
      if(typeof playSfx === 'function') {
        const setSfxType = cardIsSupporterForRules ? 'supporterSet' : (typeof getCharacterSetSfxType === 'function' ? getCharacterSetSfxType(card) : 'characterSet');
        if(typeof playSfxDeferred === 'function') playSfxDeferred(setSfxType, 0);
        else setTimeout(function(){ playSfx(setSfxType); }, 0);
      }
      if(inst.aff) {
        const affSfx = 'affPlace_' + inst.aff;
        if(typeof playSfxDeferred === 'function') playSfxDeferred(affSfx, 24);
        else setTimeout(function(){ playSfx(affSfx); }, 24);
      }
    }
  }
  markCommit('audioSchedule');
  // Tutorial event hooks
  if(typeof tutorialEvent==='function' && _tutorialActive){
    deferSetCommitHook(function(){
      if(cardIsSupporterForRules) tutorialEvent('placeSupporter', {card:inst, z, r, c, kind:'place'});
      else tutorialEvent('placeCharacter', {card:inst, z, r, c, kind:'place'});
    });
  }
  // AI dialogue hooks (safe — triggerAIDialogue checks if AI game)
  if(typeof triggerAIDialogue==='function'){
    const dialogueEvent = G.currentPlayer !== G.aiPlayer
      ? (cardIsSupporterForRules ? 'opponentPlacedSupporter' : 'opponentPlacedCharacter')
      : 'aiPlacedCard';
    deferSetCommitHook(function(){ triggerAIDialogue(dialogueEvent); });
  }
  markCommit('hooks');
  // Count Supporter sets for match trackers/effects even when an effect sets the card for free.
  if(cardIsSupporterForRules && !achillesCountsAsConsolidated) {
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
  if(isLinaFree) {
    delete card._linaFree;
  }
  if(freePlacementCinematicKind) {
    delete card._freePlacementCinematicKind;
  }
  markCommit('supporterTracking');
  
  log(G.currentPlayer===0?'p1':'p2', `${player.name} ${achillesCountsAsConsolidated ? 'consolidated' : 'placed'} ${card.name} in Zone ${z+1}`);
  markCommit('log');

    G.placing = false;
    G.selectedHandCard = null;
    G.selectedBoardCard = null;
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

    // The card must reach a painted board frame before any WHEN_SET activation
    // cinematic can begin. This guard is used by both normal single-player and
    // the current multiplayer presentation queue.
    G._placementUiLockUntil = Math.max(Number(G._placementUiLockUntil) || 0, Date.now() + 240);
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
function isZoeConsolidationBlockedAt(z, r, c, player) {
  return (G.blockedCells || []).some(function(b){
    if(!b || b.type !== 'zoe' || b.z !== z || b.r !== r || b.c !== c) return false;
    if(typeof b.blockedPlayer === 'number') return b.blockedPlayer === player;
    if(typeof b.owner === 'number') return b.owner !== player;
    return true;
  });
}

function isBlockedForConsolidate(z,r,c) {
  const cp = G.currentPlayer;
  return (G.blockedCells || []).some(b=>b && b.z===z&&b.r===r&&b.c===c&&b.type==='carolyn')
    || isZoeConsolidationBlockedAt(z, r, c, cp);
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
    if(cell && cardActsAsPassive(cell, '78') && cell.owner===owner && !cell._chaparralAmbushUsed && !isFaceDownCard(cell) && !isSupporterEffectSuppressed(cell)) {
      found = {card:cell, z, r, c};
    }
  }));
  return found;
}

function countFriendlyRalphAdjacency(z, r, c, owner) {
  const target = G.board && G.board[z] && G.board[z][r] ? G.board[z][r][c] : null;
  if(!target || !(typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(target, owner) : target.type === 'Supporter')) return 0;
  let count = 0;
  if(!G.board[z]) return 0;
  G.board[z].forEach((row, rr)=>{
    if(!row) return;
    row.forEach((cell, cc)=>{
      if(!cell || !cardActsAsPassive(cell, '24') || cell.owner!==owner || isFaceDownCard(cell) || isSupporterEffectSuppressed(cell)) return;
      const dr = Math.abs(rr-r), dc = Math.abs(cc-c);
      if(dr + dc === 1) count++;
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

function openImmediateFreePlacementDestinationPicker(player, card, message, effectInfo) {
  const info = effectInfo || {};
  const hand = G && G.players && G.players[player] && Array.isArray(G.players[player].hand)
    ? G.players[player].hand
    : [];
  const handIndex = hand.findIndex(function(candidate){
    return candidate && card && String(candidate.iid || '') === String(card.iid || '');
  });
  if(handIndex < 0 || player !== G.currentPlayer) return false;
  const liveCard = hand[handIndex];
  const options = getValidPlacementOptionsForCard(liveCard, player);
  if(!options.length){
    G.selectedHandCard = null;
    G.placing = false;
    toast('No open squares available for ' + liveCard.name);
    return false;
  }
  if(typeof showBoardTargetPicker !== 'function') return false;
  G.selectedHandCard = handIndex;
  G.placing = false;
  clearPlaceHighlights();
  showBoardTargetPicker({
    title:info.destinationTitle || ('Resolve ' + String(info.name || liveCard.name || 'Card') + ' Effect'),
    prompt:info.destinationPrompt || 'Choose a board square.',
    entries:options.map(function(destination){
      return {z:destination.z, r:destination.r, c:destination.c, squareOnly:true};
    }),
    zones:[...new Set(options.map(function(destination){ return destination.z; }))],
    visibleZones:[0,1,2],
    minCount:1,
    maxCount:1,
    confirmLabel:'Confirm',
    viewerPlayerIndex:player,
    showZoneTitles:true,
    allowSquareTargets:true,
    pickerClass:'free-placement-destination-picker',
    onCancel:function(){
      // Authoritative multiplayer remounts mandatory destination prompts after
      // an incidental close. Mirror that contract in single-player.
      setTimeout(function(){
        const pendingCard = resolveImmediateFreePlacementHandCard(player, liveCard);
        const pendingHand = G && G.players && G.players[player] && G.players[player].hand;
        if(player === G.currentPlayer && pendingCard && Array.isArray(pendingHand)
          && pendingHand.some(function(candidate){ return candidate === pendingCard; })
          && G._linaFreeIids && G._linaFreeIids.has(pendingCard.iid)){
          openImmediateFreePlacementDestinationPicker(player, pendingCard, message, info);
        }
      }, 0);
    }
  }, function(chosen){
    const destination = chosen && chosen[0];
    const currentHand = G && G.players && G.players[player] && G.players[player].hand;
    const currentIndex = Array.isArray(currentHand)
      ? currentHand.findIndex(function(candidate){ return candidate && String(candidate.iid || '') === String(liveCard.iid || ''); })
      : -1;
    if(!destination || currentIndex < 0 || player !== G.currentPlayer) return;
    G.selectedHandCard = currentIndex;
    G.placing = true;
    clickCell(Number(destination.z), Number(destination.r), Number(destination.c));
  });
  setHint(message || ('Place ' + liveCard.name + ' for free.'));
  return true;
}

function beginImmediateFreePlacement(player, card, message, effectInfo) {
  if(!card) return;
  card = resolveImmediateFreePlacementHandCard(player, card);
  if(!card) return;
  const info = effectInfo || {};
  card.effectUsedInitial = false;
  card._effectTurnLocked = false;
  card._effectNegatedByReaction = false;
  card.whenSetActivated = false;
  card._linaFree = true;
  card._freePlacementCinematicKind = info.freePlacementKind || info.key || 'freePlacement';
  if(G._onlineRoomCode && (info.key || info.freePlacementKind)){
    card._skipOnlinePlacementImprovisorReactionOnce = true;
  }
  if(!G._linaFreeIids) G._linaFreeIids = new Set();
  G._linaFreeIids.add(card.iid);
  if(typeof recordHandCardEffectModifier === 'function' && !(typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(card))) {
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
  clearPlaceHighlights();
  // Current authoritative multiplayer resolves effect-created free sets with
  // the production board-destination window. Direct deck sets (Polish Army and
  // Maja) intentionally retain its highlighted-board destination flow.
  const useDestinationPicker = info.destinationUi !== 'highlighted-board'
    && !(G && G._onlineRoomCode);
  if(useDestinationPicker && openImmediateFreePlacementDestinationPicker(player, card, message, info)) return;
  G.placing = true;
  if(!highlightValidCells(card, 'free-placement-choice')){
    G.selectedHandCard = null;
    G.placing = false;
    toast('No open squares available for ' + card.name);
    return;
  }
  setHint(message || ('Place ' + card.name + ' for free.'));
}

async function resolveSetCardAfterPlacement(inst, z, r, c, opts = {}) {
  if(!inst) return;
  if(String(inst.id || '') === 'bh03') {
    delete inst._bh03OpponentHand;
    delete inst._bh03TransferredFrom;
    inst.immuneFlag = false;
    inst.cantBeReduced = false;
  }
  inst._onlineSetResolutionInFlight = true;
  try {
    if(isFaceDownCard(inst)) return;
    scheduleCoordinatorPlacementFlash(inst, {z:z, r:r, c:c, source:'resolve-set-card'});
    // Flowing Currents must also evaluate with the newly set card included in
    // total Fate. The helper deduplicates bonuses already awarded before commit.
    const postPlacementLandscapeBonus = typeof applyLandscapePlacementBonuses === 'function'
      ? applyLandscapePlacementBonuses(inst, z, r, c)
      : 0;
    if(postPlacementLandscapeBonus > 0) {
      if(typeof renderBoardActionForPlayer === 'function') {
        renderBoardActionForPlayer(inst.owner, {hand:false, blocks:false, topbar:true, effects:false, hover:false});
      } else {
        renderGame({board:true, scores:true, landscape:true, topbar:true});
      }
    }
    if(typeof applyZsofiaCoordinatorSetTrigger === 'function') {
      applyZsofiaCoordinatorSetTrigger(inst, z, r, c);
    }
    // Wood for the Hearth is a same-zone placement replacement. Stamp it as
    // soon as the printed Supporter reaches the board so its suppression icon
    // and reinforcement bonus do not wait for deferred or online effect gates.
    if(applyWodnyPotokLumberjackSuppression(inst, z, inst.owner)) {
      if(typeof triggerMajaMischievousActivities === 'function') triggerMajaMischievousActivities(inst.owner, {mode:'suppressed', sourceCard:inst});
      showBlockedAnimation('Effect SUPPRESSED - Wood for the Hearth');
      toast(inst.name+' gains +1 Reinforcement, but its effect is suppressed by Wood for the Hearth.');
      renderGame({board:true, scores:true, topbar:true});
      return;
    }
    const whisperToken = typeof isWhisperOfTheHeartToken === 'function' && isWhisperOfTheHeartToken(inst);
    if(G.aiEnabled && G.currentPlayer===G.aiPlayer) {
      if(whisperToken && typeof resolveWhisperTokenPlacement === 'function') await resolveWhisperTokenPlacement(inst, z, r, c, {auto:true});
      else if(typeof aiTriggerWhenSet === 'function') await aiTriggerWhenSet(inst, z, r, c);
      return;
    }
    if(!opts.onlineImprovisorResolved && typeof window.fateShouldHoldOnlinePlacementEffect === 'function') {
      try {
        const held = await Promise.resolve(window.fateShouldHoldOnlinePlacementEffect(inst, z, r, c));
        if(held) return;
      } catch(e) {
        console.warn('Online placement reaction gate failed open', e);
      }
    }
    if(whisperToken && typeof resolveWhisperTokenPlacement === 'function') await resolveWhisperTokenPlacement(inst, z, r, c);
    else await triggerWhenSet(inst, z, r, c);
    // A genuine ACTIVATE effect is deliberately later than placement effects:
    // the card must be fully set and all placement presentation must complete
    // before its activation cinematic and any picker can begin.
    if(typeof window.fateQueueAutomaticBoardEffectResolution === 'function') {
      window.fateQueueAutomaticBoardEffectResolution('post-placement');
    }
    delete inst._skipOnlinePlacementImprovisorReactionOnce;
    delete inst._skipOnlinePlacementImprovisorReactionPromptId;
    const allowPromptId = String(opts.allowPromptId || '');
    if(allowPromptId && !inst._pendingWhenSetEffect && String(inst._onlinePlacementReactionAllowPromptId || '') === allowPromptId) {
      delete inst._onlinePlacementReactionAllowPromptId;
    }
  } finally {
    delete inst._onlineSetResolutionPending;
    delete inst._onlineSetResolutionInFlight;
  }
}
window.resolveSetCardAfterPlacement = resolveSetCardAfterPlacement;

function flipFaceDownBoardCard(card, z, r, c) {
  if(!card || !isFaceDownCard(card)) return 0;
  card.faceDown = false;
  let animated = false;
  if(window.FateV2CardMotionFx && typeof window.FateV2CardMotionFx.flipBoardCard === 'function'){
    animated = !!window.FateV2CardMotionFx.flipBoardCard(card, z, r, c);
  }
  if(!animated && typeof playSfx === 'function') playSfx('cardFlip');
  if(typeof showConsolidationCinematic === 'function' && card.type !== 'Supporter') {
    setTimeout(function(){
      showConsolidationCinematic(card, {playVoice:true, playSfx:true, allowRenderV2Cinematic:true});
    }, animated ? 650 : 90);
  }
  const placementDelay = 0;
  renderGame({board:true, scores:true, blocks:true, topbar:true});
  requestAnimationFrame(() => resolveSetCardAfterPlacement(card, z, r, c));
  return placementDelay;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  CONSOLIDATION (tribute supporters → summon character)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function canUseAsConsolidationTribute(card, owner, z, r, c) {
  if(!card) return false;
  if(card.owner !== owner) return false;
  if(card.noConsolidate) return false;
  // ALPINE Infantry is immune to effects and can never be spent as tribute,
  // including older instances that may not have noConsolidate stamped yet.
  if(typeof isCardEffectImmutable === 'function' ? isCardEffectImmutable(card) : card.id === '76') return false;
  if(Number.isInteger(z) && Number.isInteger(r) && Number.isInteger(c) && isZoeConsolidationBlockedAt(z, r, c, owner)) return false;
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
    startedTurn: Number(G.turn) || 1,
    sourceIid: card ? card.iid : null,
    sourceName: card ? card.name : 'The Blame Game'
  };
  toast('The Blame Game: your Supporters count as Characters for 5 turns.');
  if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
}

function tickBlameGameAtEndOfTurn() {
  const effects = ensureBlameGameState();
  effects.forEach(function(fx){
    if(!fx || !fx.active) return;
    if(Number(fx.startedTurn) === Number(G.turn)) return;
    fx.turnsLeft = Math.max(0, (Number(fx.turnsLeft) || 0) - 1);
    if(fx.turnsLeft <= 0) {
      fx.active = false;
      toast('The Blame Game has ended.');
    }
  });
}

function tickWintertideForCurrentPlayer() {
  if(!(typeof isSnowOnCarpathiansLandscapeActive === 'function' && isSnowOnCarpathiansLandscapeActive())) return;
  let applied = 0;
  forEachBoardCard((card)=>{
    if(!card || card.id !== '100' || card.owner !== G.currentPlayer || isFaceDownCard(card)) return;
    if(card._wintertideLastTurn === G.turn) return;
    const before = Math.max(0, Number(card.currentFate ?? card.fate) || 0);
    card.currentFate = before + 2;
    if(typeof playFateChangeSound === 'function') playFateChangeSound(card, before, card.currentFate, G.currentPlayer);
    card._wintertideLastTurn = G.turn;
    card._wintertideTriggerCount = (Number(card._wintertideTriggerCount) || 0) + 1;
    flashCardEffect(card, 'wintertide', {
      label:'Wintertide',
      soundKey:'wintertide:' + String(card.iid || card.id) + ':' + String(G.turn || 0)
    });
    applied++;
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
  const cardIsCharacterForRules = typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(card, G.currentPlayer) : !!(card && card.type !== 'Supporter');
  if(!card || !cardIsCharacterForRules){toast('Select a Character card first');return;}
  if(card._bh03TransferPending === true){showAliIndomitableResolvingBanner();return;}
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
    if(card.type !== 'Supporter') {
      card._freePlacementCinematicKind = card._freePlacementCinematicKind || 'costReducedFreeSet';
    }
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
      const cellIsPrintedSupporter = !!(cell && cell.type === 'Supporter');
      const canUseForThisCard = usesCharacterTributes
        ? isCharacterTribute
        : (cell && cellIsPrintedSupporter);
      if(cell && canUseForThisCard && canUseAsConsolidationTribute(cell, cp, z, r, c)) {
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
          if(cell && (typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(cell, cp) : cell.type!=='Supporter') && canUseAsConsolidationTribute(cell, cp, z, r, c)){
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
  if(localConsolidationActive) {
    if(typeof window.playFateSfxOnce === 'function') window.playFateSfxOnce('consolidationModeOn', 'consolidation-mode-on:' + String(card?.iid || ''), 300);
    else if(typeof playSfx === 'function') playSfx('consolidationModeOn');
  }

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
  const running = con.chosenIdxs.reduce((sum, idx)=>{
    const item = con.allPossible[idx];
    return sum + (item ? Math.max(0, Number(item.reinforcement) || 0) : 0);
  }, 0);
  const requirementsMet = con.phase === 'select_placement'
    || (con._phase7Authoritative === true
      ? con._phase7VisualReady === true
      : (running >= Math.max(0, Number(con.cost) || 0) && con.phase === 'select_tributes'));
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
    if(requiresOwnSafeRowPlacement(con.card) && !isOwnSafeRowSquare(z, r, c, G.currentPlayer)){
      toast(con.card.name + ' can only be set in your safe row');
      return true;
    }
    const chingaBlockReason = getChingachlookPlacementBlockReason(con.card, z, G.currentPlayer, removedIids);
    if(chingaBlockReason){
      toast(chingaBlockReason);
      return true;
    }
    const targetTributeIdx = placementIdx;
    G._consolidating = null;
    G.selectedBoardCard = null;
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
  if(typeof window.playFateSfxOnce === 'function') window.playFateSfxOnce('consolidationModeOff', 'consolidation-mode-off', 220);
  else if(typeof playSfx === 'function') playSfx('consolidationModeOff');
  G._consolidating = null;
  document.getElementById('s-game')?.classList.remove('is-consolidating');
  const cancelBtn = document.getElementById('cancel-consolidate-btn');
  if(cancelBtn) cancelBtn.style.display = 'none';
  G.selectedHandCard = null;
  G.selectedBoardCard = null;
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

function findLiveConsolidationTributeEntry(tribute) {
  if(!tribute) return null;
  const ref = tribute.card || {};
  const iid = String(ref.iid || tribute.iid || '');
  const z = Number(tribute.z), r = Number(tribute.r), c = Number(tribute.c);
  const inSlot = Number.isInteger(z) && Number.isInteger(r) && Number.isInteger(c)
    ? (G.board?.[z]?.[r]?.[c] || null)
    : null;
  if(inSlot && (!iid || String(inSlot.iid || '') === iid)) return {card:inSlot, z, r, c};
  if(iid && Array.isArray(G.board)){
    for(let bz = 0; bz < G.board.length; bz++){
      const zone = G.board[bz];
      if(!Array.isArray(zone)) continue;
      for(let br = 0; br < zone.length; br++){
        const row = zone[br];
        if(!Array.isArray(row)) continue;
        for(let bc = 0; bc < row.length; bc++){
          const cell = row[bc];
          if(cell && String(cell.iid || '') === iid) return {card:cell, z:bz, r:br, c:bc};
        }
      }
    }
  }
  return null;
}

function sendConsolidationTributeToDiscard(card, cp) {
  if(!card) return false;
  if(card.id==='50' && typeof G._artilleryLockTurnsLeft==='number' && G._artilleryLockTurnsLeft>0){
    G._artilleryEffectBlockLifted = true;
    toast('Berkeley CS Major left the field - effect suppression lifted, but zone lock remains.');
  }
  if(card.id==='56'){
    let unsuppressCount = 0;
    if(typeof forEachBoardCard === 'function') forEachBoardCard(function(bc){
      if(bc && bc._lydiaSuppressed){
        bc._lydiaSuppressed = false;
        unsuppressCount++;
      }
    });
    if(unsuppressCount > 0) toast('Lydia left the field - '+unsuppressCount+' Supporter aura(s) restored');
  }
  return fatePushDiscard(Number.isInteger(Number(card.owner)) ? Number(card.owner) : cp, card, {sound:false}) === true;
}

function spendConsolidationTributesAtomically(tributes, cp) {
  const selected = Array.isArray(tributes) ? tributes : [];
  const entries = [];
  const seen = new Set();
  for(const tribute of selected){
    const entry = findLiveConsolidationTributeEntry(tribute);
    if(!entry || !entry.card) return [];
    const key = entry.card.iid ? 'iid:' + String(entry.card.iid) : ['slot', entry.z, entry.r, entry.c].join(':');
    if(seen.has(key)) return [];
    seen.add(key);
    entries.push(entry);
  }
  if(entries.length !== selected.length) return [];

  const pileSnapshots = (Array.isArray(G.players) ? G.players : []).map(function(player){
    return {
      hand:Array.isArray(player?.hand) ? player.hand.slice() : [],
      deck:Array.isArray(player?.deck) ? player.deck.slice() : [],
      discard:Array.isArray(player?.discard) ? player.discard.slice() : []
    };
  });
  const cardSnapshots = entries.map(entry=>({card:entry.card, state:Object.assign({}, entry.card)}));
  try {
    entries.forEach(function(entry){
      G.board[entry.z][entry.r][entry.c] = null;
      if(entry.card._suppressDiscardVfx) delete entry.card._suppressDiscardVfx;
    });
    entries.forEach(function(entry){
      if(!sendConsolidationTributeToDiscard(entry.card, cp)) throw new Error('tribute destination was unavailable');
    });
  } catch(err) {
    pileSnapshots.forEach(function(snapshot, playerIndex){
      if(!G.players?.[playerIndex]) return;
      G.players[playerIndex].hand = snapshot.hand;
      G.players[playerIndex].deck = snapshot.deck;
      G.players[playerIndex].discard = snapshot.discard;
    });
    cardSnapshots.forEach(function(snapshot){
      Object.keys(snapshot.card).forEach(key=>{ if(!Object.prototype.hasOwnProperty.call(snapshot.state, key)) delete snapshot.card[key]; });
      Object.assign(snapshot.card, snapshot.state);
    });
    entries.forEach(function(entry){ G.board[entry.z][entry.r][entry.c] = entry.card; });
    console.error('Consolidation tribute transaction rolled back', err);
    return [];
  }
  if(entries.length && typeof playDiscardSfx === 'function') playDiscardSfx();
  return entries;
}

function applyMarieDeterranceForConsolidation(consolidatingPlayer, zoneIndex, consolidatedCard) {
  const z = Number(zoneIndex);
  if((consolidatingPlayer !== 0 && consolidatingPlayer !== 1) || !Number.isInteger(z) || !G.board?.[z]) return 0;
  let activations = 0;
  G.board[z].forEach(function(row, r){
    if(!row) return;
    row.forEach(function(cell, c){
      if(!cell || !cardActsAsPassive(cell, '36') || cell.owner === consolidatingPlayer || isFaceDownCard(cell) || isCardEffectSuppressed(cell)) return;
      activations++;
      G.fateModifiers['deterrance_z' + z] = (G.fateModifiers['deterrance_z' + z] || 0) - 4;
      log('sys', 'Deterrance activated! Zone ' + (z + 1) + ' Fate reduced by 4.');
      flashCardEffect(cell, 'marie_deterrence', {
        label:'Deterrance',
        soundKey:'marie:' + String(cell.iid || cell.id) + ':' + String(G.turn || 0) + ':' + String(consolidatedCard && (consolidatedCard.iid || consolidatedCard.id) || 'consolidation')
      });
      if(typeof shouldShowPlayerEffectFeedback !== 'function' || shouldShowPlayerEffectFeedback(cell.owner)) {
        toast('Deterrance activated: Zone ' + (z + 1) + ' loses 4 Fate.');
      }
      if(typeof showEffectActivationGlow === 'function') showEffectActivationGlow(z, r, c, cell);
    });
  });
  if(activations && typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
  return activations;
}
if(typeof window !== 'undefined') window.applyMarieDeterranceForConsolidation = applyMarieDeterranceForConsolidation;

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

    const bonusFate = getGreatOakConsolidationBonus(tributes);
    const inst = newInstance(card);
    inst.owner = cp;
    const basePrintedFate = card.fate;
    inst.currentFate = getPlacedCardFate(card, {bonusFate:0, tributeCount: tributes.length});
    applyGreatOakConsolidationBonus(inst, bonusFate);
    preparePlacementFateReveal(inst, card, 'consolidation');
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
    if(!useFaceDown) inst._onlineSetResolutionPending = true;
    if(card._wciBonus) toast('West Caribbea Infantry bonus: -1 cost, +2 Fate!');
    const removedTributes = spendConsolidationTributesAtomically(tributes, cp);
    if(removedTributes.length !== tributes.length) {
      console.warn('Consolidation tribute cleanup was rolled back', {
        expected:tributes.length,
        removed:removedTributes.length
      });
      toast('Consolidation cancelled - the selected supporters changed.');
      renderGame({board:true, hand:true, piles:true, blocks:true, topbar:true});
      return;
    }
    applyMarieDeterranceForConsolidation(cp, targetZ, inst);
    G.board[targetZ][targetR][targetC] = inst;
    if(typeof window.fateAIRecordDecision === 'function') {
      window.fateAIRecordDecision({player:cp, action:'c', card:inst, zone:targetZ, row:targetR, faceDown:!!useFaceDown, tributes:tributes});
    }
    if(typeof consumeAdministrativeBloatForPlayer === 'function') consumeAdministrativeBloatForPlayer(cp);
    if(typeof noteBalladConsolidation === 'function') noteBalladConsolidation(cp, inst);
    if(typeof applyRiveraBuffToPlacedCard === 'function') applyRiveraBuffToPlacedCard(inst, inst.owner);
    if(typeof trackDailyCardPlacement === 'function') {
      setTimeout(function(){ trackDailyCardPlacement(inst, targetZ, targetR, targetC); }, 0);
    }
    const placementDelay = _consolidationMotionMs ? 0 : Math.min(360, 180 + tributes.length * 40);
    const cinematicDelay = _consolidationMotionMs
      ? Math.max(0, Number(_consolidationMotionMs) || 0) + 120
      : Math.max(0, placementDelay || 0) + 90;
    if(useFaceDown && chaparralSource?.card) chaparralSource.card._chaparralAmbushUsed = true;

    const cinematicWaitsForPresentation = !!(tx && typeof tx.onFinished === 'function');
    if(!useFaceDown && typeof showConsolidationCinematic === 'function' && !cinematicWaitsForPresentation) {
      G._cinematicUiLockUntil = Math.max(G._cinematicUiLockUntil || 0, Date.now() + cinematicDelay + 2350);
      setTimeout(function(){ showConsolidationCinematic(inst, {playVoice:true, playSfx:true, allowRenderV2Cinematic:true}); }, cinematicDelay);
    }
    if(typeof updateDailyChallengeProgress === 'function') updateDailyChallengeProgress('consolidations', 1, 'add');

    log(cp===0?'p1':'p2',
      `${G.players[cp].name} consolidated ${card.name} into Zone ${targetZ+1}${useFaceDown ? ' face down' : ''}`);

    G.players[cp].hand = G.players[cp].hand.filter(c => c !== card);
    G.selectedHandCard = null;
    G.selectedBoardCard = null;

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
    const resolveSetEffectAfterCinematic = function(){
      const wait = typeof getInteractionAnimationDelayMs === 'function' ? getInteractionAnimationDelayMs() : 0;
      setTimeout(function(){
        requestAnimationFrame(function(){ resolveSetCardAfterPlacement(inst, targetZ, targetR, targetC); });
      }, Math.max(0, wait) + 90);
    };
    if(_consolidationMotionMs) setTimeout(resolveSetEffectAfterCinematic, 140);
    else resolveSetEffectAfterCinematic();
    }

    const actionPresenter = window.FateActionPresentation;
    if(actionPresenter && typeof actionPresenter.beginConsolidation === 'function'){
      const started = actionPresenter.beginConsolidation({
        tributes,
        card,
        inst,
        commitImmediately:!!G._onlineRoomCode,
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
        onFinished:function(tx){
          if(useFaceDown || typeof showConsolidationCinematic !== 'function') return;
          const settleDelay = tx && tx.animation && tx.animation.durationMs > 0 ? 100 : 70;
          G._cinematicUiLockUntil = Math.max(G._cinematicUiLockUntil || 0, Date.now() + settleDelay + 2350);
          setTimeout(function(){
            showConsolidationCinematic(inst, {playVoice:true, playSfx:true, allowRenderV2Cinematic:true});
          }, settleDelay);
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
function getConsolidationCostForZone(card, z, owner, baseCost) {
  let cost = Math.max(0, Number(baseCost) || 0);
  return cost;
}

function getGreatOakConsolidationBonus(tributes) {
  return (Array.isArray(tributes) ? tributes : []).reduce(function(total, tribute){
    const source = tribute && tribute.card;
    if(!source || String(source.id || '') !== '47') return total;
    if(typeof isSupporterEffectSuppressed === 'function' && isSupporterEffectSuppressed(source)) return total;
    return total + 3;
  }, 0);
}

function applyGreatOakConsolidationBonus(card, amount) {
  if(!card) return 0;
  const gain = Math.max(0, Number(amount) || 0);
  if(!gain) return 0;
  card.currentFate = Math.max(0, Number(card.currentFate ?? card.fate) || 0) + gain;
  // Great Oak's gain is permanent, so it must also lift a pre-existing permanent
  // Fate ceiling instead of being hidden behind an earlier debuff.
  if(Number.isFinite(Number(card._permanentFateCeiling))) {
    card._permanentFateCeiling = Math.max(0, Number(card._permanentFateCeiling) || 0) + gain;
  }
  card._greatOakPermanentFateGain = Math.max(0, Number(card._greatOakPermanentFateGain) || 0) + gain;
  if(typeof recordHandCardEffectModifier === 'function') {
    recordHandCardEffectModifier(card, {
      key:'great-oak-consolidation',
      name:'Great Oak Infantry',
      text:'We Bleed Red: this card permanently gained ' + gain + ' Fate.',
      fateDelta:gain
    });
  }
  return gain;
}
if(typeof window !== 'undefined') {
  window.getGreatOakConsolidationBonus = getGreatOakConsolidationBonus;
  window.applyGreatOakConsolidationBonus = applyGreatOakConsolidationBonus;
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
    if(typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(cell, owner) : cell.type === 'Supporter') counts.supporters++;
    if(typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(cell, owner) : cell.type !== 'Supporter') counts.characters++;
  }));
  return counts;
}

function getReadyBoleslawSearchReactions(searchingPlayer) {
  const owner = 1 - Number(searchingPlayer);
  const ready = [];
  if(owner !== 0 && owner !== 1) return ready;
  forEachBoardCard(function(card, z, r, c){
    if(!card || !cardActsAsPassive(card, '86') || Number(card.owner) !== owner) return;
    if(typeof isFaceDownCard === 'function' && isFaceDownCard(card)) return;
    if(card._effectNegatedByReaction || card._effectSuppressedByReaction || card._reactionSuppressed || card._lydiaSuppressed || card._lumberjackSuppressed) return;
    ready.push({card, z, r, c, owner});
  });
  return ready;
}

async function resolveBoleslawOpponentSearch(searchingPlayer, context = {}) {
  if(!G || (Number(searchingPlayer) !== 0 && Number(searchingPlayer) !== 1)) return 0;
  // Online triggers and any Lydia response are resolved by the authority after the search selection is submitted.
  if(G._onlineRoomCode) return 0;
  const reactions = getReadyBoleslawSearchReactions(Number(searchingPlayer));
  let activated = 0;
  for(const reaction of reactions){
    const live = G.board?.[reaction.z]?.[reaction.r]?.[reaction.c];
    if(!live || String(live.iid || '') !== String(reaction.card.iid || '') || Number(live.owner) !== reaction.owner) continue;
    const proceed = typeof checkReactions === 'function'
      ? await checkReactions('targeting_effect', {
          card:live,
          z:reaction.z,
          r:reaction.r,
          c:reaction.c,
          sourceOwner:reaction.owner,
          affectedOwners:[Number(searchingPlayer)],
          boleslawSearchTrigger:true,
          searchSourceCardId:String(context.sourceCardId || '')
        })
      : true;
    if(!proceed) continue;
    if(typeof playEffectActivationCinematic === 'function') {
      await playEffectActivationCinematic(live, reaction.z, reaction.r, reaction.c, {source:'boleslaw-search-reaction', broadcast:false});
    }
    await drawCard(reaction.owner, 1, {afterSetOrCinematic:true, activatedDrawEffect:true, effectSource:live});
    const before = Number(live.currentFate ?? live.fate) || 0;
    live.currentFate = before + 2;
    activated++;
    toast('A Bombastic Character: drew 1 card; Boleslaw gained 2 Fate.');
    log(reaction.owner===0?'p1':'p2', 'Boleslaw reacted to an opponent search: drew 1 card and gained 2 Fate');
    if(typeof flashCardEffect === 'function') flashCardEffect(live, 'boleslaw_exclaim', {label:'!!!'});
    renderEffectResolutionForPlayer(reaction.owner, {hand:true, piles:true});
  }
  return activated;
}

function resolveBoleslawAfterSearchSelection(searchingPlayer, chosen, context = {}) {
  const hand = G && G.players && G.players[searchingPlayer] && Array.isArray(G.players[searchingPlayer].hand)
    ? G.players[searchingPlayer].hand
    : [];
  const handIids = new Set(hand.map(function(card){ return String(card && card.iid || ''); }).filter(Boolean));
  const selected = (Array.isArray(chosen) ? chosen : []).filter(function(card){
    const iid = String(card && card.iid || '');
    return !!card && !!iid && handIids.has(iid);
  });
  if(!selected.length) return Promise.resolve(0);
  if(G && G._onlineRoomCode) {
    const transactions = typeof window !== 'undefined' ? window.FateOnlineEffectTransactions : null;
    if(transactions && typeof transactions.captureSearchSelection === 'function') {
      transactions.captureSearchSelection(String(context.sourceCardId || ''), selected);
    }
    return Promise.resolve(0);
  }
  return Promise.resolve(resolveBoleslawOpponentSearch(searchingPlayer, context))
    .catch(function(err){
      console.warn('Boleslaw completed-search reaction failed open', err);
      return 0;
    });
}

if(typeof window !== 'undefined') {
  window.getReadyBoleslawSearchReactions = getReadyBoleslawSearchReactions;
  window.resolveBoleslawOpponentSearch = resolveBoleslawOpponentSearch;
  window.resolveBoleslawAfterSearchSelection = resolveBoleslawAfterSearchSelection;
}

function ensureBalladState() {
  if(!Array.isArray(G._balladEffects)) G._balladEffects = [[], []];
  for(let player = 0; player < 2; player++) {
    const current = G._balladEffects[player];
    if(Array.isArray(current)) continue;
    G._balladEffects[player] = current ? [current] : [];
  }
  return G._balladEffects;
}

function noteBalladSupporterSet(player) {
  const effects = ensureBalladState()[player];
  let ended = 0;
  effects.forEach(function(fx){
    if(!fx || !fx.active || fx.ended) return;
    fx.ended = true;
    fx.active = false;
    ended++;
  });
  if(ended) {
    toast('A Noble Effort at a Ballad ended because a Supporter was set.');
    if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
  }
}

function noteBalladConsolidation(player, card) {
  if(!card) return 0;
  const activeEffects = ensureBalladState()[player].filter(fx=>fx && fx.active && !fx.ended);
  if(!activeEffects.length) return 0;
  let gained = 0;
  activeEffects.forEach(function(fx, index){
    const before = Math.max(0, Number(card.currentFate ?? card.fate) || 0);
    card.currentFate = before + 3;
    if(card._placementFateReveal) {
      card._placementFateReveal.kvetkaGainAmount = (Number(card._placementFateReveal.kvetkaGainAmount) || 0) + 3;
    }
    gained += 3;
    flashCardEffect(card, 'kvetka_ballad', {
        label:'A Noble Effort at a Ballad',
        soundKey:'kvetka-ballad-consolidation:' + String(player) + ':' + String(G.turn || 0) + ':' + String(fx.sourceIid || index) + ':' + String(card.iid || card.id),
        pitchStep:Math.max(0, Number(fx.pitchStep) || 0),
        waitForConsolidationCinematic:true
    });
  });
  toast('A Noble Effort at a Ballad: ' + card.name + ' gains ' + gained + ' Fate.');
  return gained;
}

function recordSupporterEffectActivation(player, card, options) {
  options = options || {};
  if(card && !options.allowRepeat) {
    if(card._supporterEffectActivationCounted) return;
    card._supporterEffectActivationCounted = true;
  }
  if(!Array.isArray(G._supporterEffectsActivatedP)) G._supporterEffectsActivatedP = [0,0];
  G._supporterEffectsActivatedP[player] = (Number(G._supporterEffectsActivatedP[player]) || 0) + 1;
  if(!options.skipLandscapeCount && typeof recordLandscapeSupporterEffectActivation === 'function') recordLandscapeSupporterEffectActivation(player);
}

function resetLandscapeSupporterEffectTurnCount(player) {
  if(player !== 0 && player !== 1) return;
  const st = typeof getLandscapeState === 'function' ? getLandscapeState() : null;
  if(!st) return;
  if(!Array.isArray(st.supporterEffectsThisTurn)) st.supporterEffectsThisTurn = [0,0];
  st.supporterEffectsThisTurn[player] = 0;
  if(typeof renderLandscapePanel === 'function') renderLandscapePanel();
}

function canActivateLandscapeSupporterEffect(player) {
  if(player !== 0 && player !== 1) return true;
  if(!(typeof isLandscapeActive === 'function' && isLandscapeActive('igb15'))) return true;
  const st = typeof getLandscapeState === 'function' ? getLandscapeState() : null;
  if(!st) return true;
  if(!Array.isArray(st.supporterEffectsThisTurn)) st.supporterEffectsThisTurn = [0,0];
  return (Number(st.supporterEffectsThisTurn[player]) || 0) < 1;
}
if(typeof window !== 'undefined') window.canActivateLandscapeSupporterEffect = canActivateLandscapeSupporterEffect;

function recordLandscapeSupporterEffectActivation(player) {
  if(player !== 0 && player !== 1) return;
  if(!(typeof isLandscapeActive === 'function' && isLandscapeActive('igb15'))) return;
  const st = typeof getLandscapeState === 'function' ? getLandscapeState() : null;
  if(!st) return;
  if(!Array.isArray(st.supporterEffectsThisTurn)) st.supporterEffectsThisTurn = [0,0];
  const before = Number(st.supporterEffectsThisTurn[player]) || 0;
  st.supporterEffectsThisTurn[player] = before + 1;
  if(typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('Snow on the Carpathians', 'minor');
  if(typeof renderLandscapePanel === 'function') renderLandscapePanel();
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
  if(!card || !(typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(card, card.owner) : card.type === 'Supporter')) return false;
  if(WHEN_SET_IDS.has(String(card.id))) return false;
  return new Set(['20','24','44','49','53','59','63','65','78','92','95']).has(String(card.id));
}

async function beginManualSupporterEffectActivation(card, z, r, c, affectedOwners, options) {
  options = options || {};
  if(!card || !(typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(card, card.owner) : card.type === 'Supporter')) return true;
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
  if(options.skipActivationCount !== true) recordSupporterEffectActivation(cp, card, {allowRepeat:true});
  return true;
}

function isLandscapeChangeBlockedFor(player) {
  if(!Array.isArray(G._landscapeChangeLocks)) G._landscapeChangeLocks = [0,0];
  return (Number(G._landscapeChangeLocks[player]) || 0) > 0;
}

function ignoreBattleOfPellaThresholdsReachedBeforeEntry(previousLandscapeId) {
  if(!G || String(G.landscapeId || '') !== 'igb20' || String(previousLandscapeId || '') === 'igb20') return [];
  const st = typeof getLandscapeState === 'function' ? getLandscapeState() : G._landscapeState;
  if(!st) return [];
  if(!st.igb20FateThresholdClaims || typeof st.igb20FateThresholdClaims !== 'object') st.igb20FateThresholdClaims = {};
  const totals = [0, 1].map(function(player){
    return typeof getLandscapeTotalFate === 'function' ? Math.max(0, Number(getLandscapeTotalFate(player)) || 0) : 0;
  });
  const highestAlreadyReached = Math.max(totals[0], totals[1]);
  const ignored = [];
  [20, 35, 50].forEach(function(threshold){
    if(highestAlreadyReached < threshold || st.igb20FateThresholdClaims[String(threshold)]) return;
    st.igb20FateThresholdClaims[String(threshold)] = {
      threshold:threshold,
      winner:null,
      winningTotal:null,
      choiceResolved:true,
      declined:false,
      discardedIid:null,
      ignored:true,
      ignoredOnEntry:true
    };
    ignored.push(threshold);
  });
  st.igb20EntryFateTotals = totals;
  st.igb20PendingFateThreshold = null;
  return ignored;
}
window.ignoreBattleOfPellaThresholdsReachedBeforeEntry = ignoreBattleOfPellaThresholdsReachedBeforeEntry;

function ensureMailDeliveryState() {
  if(!Array.isArray(G._mailDeliveries)) G._mailDeliveries = [];
  return G._mailDeliveries;
}

function tickMailDeliveriesForCurrentPlayer() {
  const deliveries = ensureMailDeliveryState();
  if(!deliveries.length) return;
  let changed = false;
  for(let i = deliveries.length - 1; i >= 0; i--) {
    const d = deliveries[i];
    if(!d || (d.player !== 0 && d.player !== 1)) continue;
    d.turnsLeft = Math.max(0, (Number(d.turnsLeft) || 0) - 1);
    changed = true;
    if(d.turnsLeft <= 0) {
      const card = d.card;
      const recipient = d.player;
      deliveries.splice(i, 1);
      if(card) {
        card.owner = recipient;
        if(typeof addCardToHand === 'function') addCardToHand(recipient, card);
        else G.players[recipient].hand.push(card);
        toast('Mail Delivery arrived: ' + card.name + ' was added to your hand.');
        if(typeof playSfx === 'function') playSfx('effect');
      }
    }
  }
  if(changed && typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
}

function returnRandomDiscardCardsToDeck(player, count, reason, filter) {
  const p = Number(player);
  const state = G.players && G.players[p];
  if(!state || !Array.isArray(state.discard) || !Array.isArray(state.deck)) return [];
  const returned = [];
  const eligibleCount = state.discard.filter(function(card){ return typeof filter !== 'function' || filter(card); }).length;
  const wanted = Math.min(Math.max(0, Number(count) || 0), eligibleCount);
  const rng = typeof G._onlineRng === 'function' ? G._onlineRng : Math.random;
  for(let i = 0; i < wanted; i++) {
    const eligibleIndexes = [];
    state.discard.forEach(function(card, index){ if(typeof filter !== 'function' || filter(card)) eligibleIndexes.push(index); });
    if(!eligibleIndexes.length) break;
    const randomIndex = deterministicOnlineRandomIndex(eligibleIndexes.length, String(reason || 'returnDiscard') + ':pick:' + i, p);
    const eligibleIndex = randomIndex >= 0 ? randomIndex : Math.floor(rng() * eligibleIndexes.length);
    const discardIndex = eligibleIndexes[eligibleIndex];
    const card = state.discard.splice(discardIndex, 1)[0];
    if(!card) continue;
    const onlineInsertIndex = deterministicOnlineRandomIndex(state.deck.length + 1, String(reason || 'returnDiscard') + ':insert:' + i, p);
    const insertIndex = onlineInsertIndex >= 0 ? onlineInsertIndex : Math.floor(rng() * (state.deck.length + 1));
    state.deck.splice(insertIndex, 0, card);
    returned.push(card);
  }
  return returned;
}

function showSnowShovelerReturnedCards(returned, player) {
  if(typeof showCanvasCardGalleryModal === 'function') {
    showCanvasCardGalleryModal('Shovel - Cards Returned to the Deck', returned, {
      viewerPlayerIndex:typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : player,
      immediate:true,
      hideCountText:true
    });
  }
}

async function waitForEffectPresentationBeforeChoice() {
  const presenter = window.FateActionPresentation;
  if(presenter && typeof presenter.waitForIdle === 'function') {
    await presenter.waitForIdle({minQuietMs:110, timeoutMs:7600});
    return;
  }
  const wait = typeof getInteractionAnimationDelayMs === 'function'
    ? getInteractionAnimationDelayMs()
    : 0;
  if(wait > 0) await new Promise(function(resolve){ setTimeout(resolve, wait); });
}

function markSnowballFightHit(card) {
  if(!card) return false;
  card._snowballFightHitAt = Date.now();
  return true;
}
window.markSnowballFightHit = markSnowballFightHit;

function applyWodnyPotokLumberjackSuppression(inst, z, owner) {
  if(!inst || inst.id === '92' || isFaceDownCard(inst) || isEffectImmuneSource(inst)) return false;
  const cp = owner === 0 || owner === 1 ? owner : (inst.owner === 0 || inst.owner === 1 ? inst.owner : G.currentPlayer);
  // Blame Game changes how Supporters classify for effects, but does not erase
  // the printed Supporter identity referenced by Wood for the Hearth.
  if(inst.type !== 'Supporter') return false;
  let lumberjack = null;
  if(G.board && G.board[z]) G.board[z].forEach((row)=>row && row.forEach((cell)=>{
    if(!lumberjack && cell && cardActsAsPassive(cell, '92') && cell.owner === cp && cell.iid !== inst.iid && !isFaceDownCard(cell) && !isSupporterEffectSuppressed(cell)) lumberjack = cell;
  }));
  if(!lumberjack) return false;
  inst._lumberjackSuppressed = true;
  inst.whenSetActivated = true;
  inst.effectUsedInitial = true;
  delete inst._pendingWhenSetEffect;
  delete inst._pendingWhenSetActivationInFlight;
  if(!inst._lumberjackReinforcementGranted) {
    inst._lumberjackReinforcementGranted = true;
    inst._reinforcementBonus = (Number(inst._reinforcementBonus) || 0) + 1;
  }
  return true;
}
window.applyWodnyPotokLumberjackSuppression = applyWodnyPotokLumberjackSuppression;

async function activateWodnyPotokYouth(card, z, r, c) {
  if(!card || card.owner !== G.currentPlayer || card.effectUsedThisTurn) {
    toast('Snowball Fight can only be used once per turn.');
    return;
  }
  if(card._snowballFightResolving || card._snowballFightActivationInFlight) return;
  const cp = G.currentPlayer;
  const opp = 1 - cp;
  card._snowballFightActivationInFlight = true;
  let allowed = false;
  try {
    // Match the shared manual-effect flow: finish the activation cinematic
    // before reactions or the Snowball Fight target picker can open.
    if(!G._onlineRoomCode && typeof playEffectActivationCinematic === 'function') {
      await playEffectActivationCinematic(card, z, r, c, {source:'snowball-fight'});
    }
    if(typeof G !== 'undefined' && G) G._allowImmediateEffectPickerUntil = Date.now() + 1400;
    allowed = await beginManualSupporterEffectActivation(card, z, r, c, [opp]);
  } finally {
    delete card._snowballFightActivationInFlight;
  }
  if(!allowed) {
    card.effectUsedThisTurn = true;
    renderGame({board:true, scores:true, topbar:true});
    return;
  }
  if(typeof showEffectActivationGlow === 'function') showEffectActivationGlow(z, r, c, card);
  pickCardFromAnyZone('Snowball Fight: select any opponent card on the field to lose 1 Fate.', function(tgt){
    if(card._snowballFightResolving || card.effectUsedThisTurn) return;
    if(!tgt || tgt.owner !== opp) {
      toast('Select an opponent card.');
      return;
    }
    if(typeof isTargetImmuneToEffectOwner === 'function' ? isTargetImmuneToEffectOwner(tgt, cp) : (typeof isFullyEffectImmuneCard === 'function' ? isFullyEffectImmuneCard(tgt) : (tgt.immuneFlag || tgt.id === '76'))) {
      showBlockedAnimation('this card is immune');
      return;
    }
    card._snowballFightResolving = true;
    const before = Math.max(0, Number(tgt.currentFate ?? tgt.fate) || 0);
    const changed = setCardFateValue(tgt, before - 1, cp, {countOncePerSourceEffect:card});
    if(!changed && before > 0) {
      delete card._snowballFightResolving;
      showBlockedAnimation('this card is immune');
      return;
    }
    card.effectUsedThisTurn = true;
    delete card._snowballFightResolving;
    markSnowballFightHit(tgt);
    if(typeof playSfx === 'function') playSfx('snowballFight');
    toast('Snowball Fight: ' + tgt.name + ' loses 1 Fate.');
    log(cp === 0 ? 'p1' : 'p2', 'Snowball Fight: ' + tgt.name + ' loses 1 Fate');
    renderGame({board:true, scores:true, topbar:true});
  }, function(cell){ return cell && cell.owner === opp; });
}
window.activateWodnyPotokYouth = activateWodnyPotokYouth;

function tickCarpathianSpecters() {
  forEachBoardCard(function(card){
    if(!card || !cardActsAsPassive(card, '95') || isFaceDownCard(card)) return;
    card._specterTurnsOnField = (Number(card._specterTurnsOnField) || 0) + 1;
    card._specterFateGains = Number(card._specterFateGains) || 0;
    if(card._specterTurnsOnField >= 2 && card._specterFateGains < 6) {
      card._specterTurnsOnField = 0;
      card._specterFateGains++;
      modifyFate(card, 1, 'permanent');
      flashCardEffect(card, 'specter_ghost', {
        label:'Thousand Year Sorrow',
        soundKey:'specter:' + String(card.iid || card.id) + ':' + String(card._specterFateGains)
      });
      toast(card.name + ' gains 1 Fate from Thousand Year Sorrow.');
    }
  });
}

const INITIAL_SET_INITIATOR_IDS = new Set(['03','04','06','07','08','13','17','22','29','30','39','43','45','48','51','54','66','81','82','83','87','90','99','bh04','bh05','bh06','bh25']);
// Browser timing mirror for shared/engine/cards/registry.mjs. This is the seam
// that keeps single-player interaction timing identical to authoritative play.
const AUTHORITATIVE_ACTIVATE_EFFECT_IDS = new Set(['03','06','22','26','27','29','30','38','39','40','48','83','93','bh01']);
const AUTHORITATIVE_WHEN_SET_EFFECT_IDS = new Set([
  '02','04','05','07','08','12','13','14','16','17','18','21','25','31','32','33','37','42','43','50','51','52','54','58','60','61','62','65','66','68','69','71','72','73','75','76','77','78','80','81','82','84','87','90','91','94','96','97','99','bh04','bh05','bh06','bh25'
]);

function whenSetEffectsAreDeferred() {
  return false;
}

window.setFateWhenSetImmediateMode = function(enabled) {
  try { localStorage.removeItem('fateWhenSetImmediate'); } catch(e) {}
  if(typeof window !== 'undefined') window.FATE_DEFER_WHEN_SET_EFFECTS = false;
  toast('When-set effects activate automatically in every game mode.');
};

function cardHasDeferredSetEffect(card) {
  // Compatibility cleanup for saves made while WHEN_SET effects were exposed as
  // manual board actions. The live rules now match the authoritative engine:
  // WHEN_SET resolves from placement and only true ACTIVATE effects get buttons.
  if(card) {
    delete card._pendingWhenSetEffect;
    delete card._pendingWhenSetActivationInFlight;
  }
  return false;
}

function markCardSetTurn(card, player) {
  if(!card || typeof G === 'undefined' || !G) return;
  card._setTurn = G.turn;
  card._setOwner = typeof player === 'number' ? player : (typeof card.owner === 'number' ? card.owner : G.currentPlayer);
  recordWojciechPlacementForTurn(card, card._setOwner);
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
  if(card) cardHasDeferredSetEffect(card);
  return false;
}

function canActivatePendingWhenSetEffect(card, z, r, c, player = G.currentPlayer) {
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

function canUsePanaceaLandscapeMoveCard(card) {
  if(!card || isFaceDownCard(card)) return false;
  if(typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(card)) return false;
  if(card.aff !== 'eventide') return false;
  return !(typeof isSouthWindSpearmanCard === 'function' && isSouthWindSpearmanCard(card));
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
  if((typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(card, G.currentPlayer) : card.type === 'Supporter') && typeof canActivateLandscapeSupporterEffect === 'function' && !canActivateLandscapeSupporterEffect(G.currentPlayer)) {
    toast('Snow on the Carpathians: only one Supporter effect can activate each turn.');
    if(typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('Snow on the Carpathians', 'major');
    return;
  }
  const pendingEffect = card._pendingWhenSetEffect;
  card._pendingWhenSetActivationInFlight = true;
  if(typeof closeModal === 'function') closeModal();
  try {
    if(typeof playEffectActivationCinematic === 'function') {
      await playEffectActivationCinematic(card, az, ar, ac, {source:'pending-when-set'});
    }
    await triggerWhenSet(card, az, ar, ac, { forceImmediate:true, manualActivation:true, skipActivationCinematic:true });
    const activationStarted = card.whenSetActivated === true || card.effectUsedInitial === true;
    if(!activationStarted) {
      if(!card._pendingWhenSetEffect) card._pendingWhenSetEffect = pendingEffect;
      throw new Error('The effect resolver did not start');
    }
    delete card._pendingWhenSetEffect;
    if(typeof tutorialEvent === 'function' && _tutorialActive) tutorialEvent('activateEffect', {card, id:card.id, z:az, r:ar, c:ac});
  } finally {
    delete card._pendingWhenSetActivationInFlight;
  }
  renderGame({board:true, hand:true, scores:true, piles:true, oppHand:true, blocks:true, topbar:true});
}

async function triggerWhenSet(inst, z, r, c, opts = {}) {
  if(!inst || isFaceDownCard(inst)) return;
  if(String(inst.id || '') === 'bh03') {
    delete inst._bh03OpponentHand;
    delete inst._bh03TransferredFrom;
    inst.immuneFlag = false;
    inst.cantBeReduced = false;
  }
  if(typeof applyPermanentEffectImmunity === 'function') applyPermanentEffectImmunity(inst);
  const cp = G.currentPlayer;
  const opp = 1-cp;
  const id = inst.id;
  const instIsSupporterForRules = typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(inst, inst.owner) : inst.type === 'Supporter';
  // Rivera (51): active declared affiliation buff applies to cards as they are set.
  applyRiveraBuffToPlacedCard(inst, inst.owner);

  // Suppress check: only if current player is the suppression target
  if(G.oppSuppressedNextTurn && G.suppressTarget===cp && instIsSupporterForRules && !isEffectImmuneSource(inst)) {
    if(typeof triggerMajaMischievousActivities === 'function') triggerMajaMischievousActivities(opp, {mode:'suppressed', sourceCard:inst});
    showBlockedAnimation('Effect SUPPRESSED - Semper Fidelis');
    markInitialEffectResolved(inst);
    return;
  }
  if(!isEffectImmuneSource(inst) && ((typeof isCardEffectSuppressed === 'function' && isCardEffectSuppressed(inst, z, r, c)) || (instIsSupporterForRules && typeof isSupporterEffectSuppressed === 'function' && isSupporterEffectSuppressed(inst)))) {
    if(typeof triggerMajaMischievousActivities === 'function') triggerMajaMischievousActivities(opp, {mode:'suppressed', sourceCard:inst});
    showBlockedAnimation('Effect SUPPRESSED - The Last Revolution');
    markInitialEffectResolved(inst);
    return;
  }
  if(applyWodnyPotokLumberjackSuppression(inst, z, cp)) {
    if(typeof triggerMajaMischievousActivities === 'function') triggerMajaMischievousActivities(cp, {mode:'suppressed', sourceCard:inst});
    showBlockedAnimation('Effect SUPPRESSED - Wood for the Hearth');
    toast(inst.name+' gains +1 Reinforcement, but its effect is suppressed by Wood for the Hearth.');
    renderGame({board:true, scores:true, topbar:true});
    return;
  }

  const _hasWhenSet = AUTHORITATIVE_WHEN_SET_EFFECT_IDS.has(String(id || ''));
  const isInitiatorWithEffect = _hasWhenSet
    && (inst.type === 'Initiator' || String(id || '') === '21' || String(id || '') === 'bh25')
    && !inst.effectUsedInitial;
  delete inst._pendingWhenSetEffect;

  // Initiators fire their character effect
  if(isInitiatorWithEffect) {
    G.selectedBoardCard = {card:inst,z,r,c};
    if(opts.skipActivationCinematic !== true && typeof playEffectActivationCinematic === 'function') {
      await playEffectActivationCinematic(inst, z, r, c, {
        source:'automatic-when-set',
        activationId:'when-set:' + String(inst.iid || inst.id) + ':' + String(G.turn || 0)
      });
    }
    await triggerCharacterEffect(inst,z,r,c,{fromSet:true});
    G.selectedBoardCard = null;
    if(inst._effectNegatedByReaction) { markInitialEffectResolved(inst); return; }
  }
  // When-set effects fire automatically
  if(_hasWhenSet && !isInitiatorWithEffect) {
    await runWhenSetEffect(inst,z,r,c,{fromSet:true, skipActivationCinematic:opts.skipActivationCinematic === true});
  }
  G.selectedBoardCard = null;
}

function markInitialEffectResolved(card) {
  if(!card) return;
  card._effectTurnLocked = true;
  if(card.type === 'Supporter') card.whenSetActivated = true;
  if(card.type === 'Initiator') card.effectUsedInitial = true;
  delete card._pendingWhenSetEffect;
  delete card._pendingWhenSetActivationInFlight;
  delete card._effectActivationInFlight;
}

function markInitialEffectResolvedByIid(iid) {
  if(!iid || typeof forEachBoardCard !== 'function') return;
  forEachBoardCard(function(card){
    if(card && card.iid === iid) markInitialEffectResolved(card);
  });
}

window.markInitialEffectResolved = markInitialEffectResolved;
window.canActivatePendingWhenSetEffect = canActivatePendingWhenSetEffect;
window.activatePendingWhenSetEffect = activatePendingWhenSetEffect;

// Actual effect execution (separated so prompt can wrap it)
async function runWhenSetEffect(inst, z, r, c, opts = {}) {
  if(!inst || isFaceDownCard(inst)) return;
  const cp = G.currentPlayer;
  const opp = 1-cp;
  const id = inst.id;
  const instIsSupporterForRules = typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(inst, inst.owner) : inst.type === 'Supporter';
  const ledgerCopiedSupporterEffect = !!inst._ledgerCopiedSupporterEffect;
  const supporterActivationOptions = ledgerCopiedSupporterEffect
    ? {allowRepeat:true, skipLandscapeCount:true}
    : undefined;
  if(!isEffectImmuneSource(inst) && ((typeof isCardEffectSuppressed === 'function' && isCardEffectSuppressed(inst, z, r, c)) || (instIsSupporterForRules && typeof isSupporterEffectSuppressed === 'function' && isSupporterEffectSuppressed(inst)))) {
    if(typeof triggerMajaMischievousActivities === 'function') triggerMajaMischievousActivities(opp, {mode:'suppressed', sourceCard:inst});
    showBlockedAnimation('Effect SUPPRESSED - The Last Revolution');
    markInitialEffectResolved(inst);
    return;
  }
  if(typeof updateDailyChallengeProgress === 'function' && !(G.aiEnabled && cp === G.aiPlayer) && !G._isSpectator){
    updateDailyChallengeProgress('effects', 1, 'add');
    if(instIsSupporterForRules) updateDailyChallengeProgress('supporterEffects', 1, 'add');
  }
  if(applyWodnyPotokLumberjackSuppression(inst, z, cp)) {
    if(typeof triggerMajaMischievousActivities === 'function') triggerMajaMischievousActivities(cp, {mode:'suppressed', sourceCard:inst});
    showBlockedAnimation('Effect SUPPRESSED - Wood for the Hearth');
    toast(inst.name+' gains +1 Reinforcement, but its effect is suppressed by Wood for the Hearth.');
    renderGame({board:true, scores:true, topbar:true});
    return;
  }

  if(instIsSupporterForRules && !ledgerCopiedSupporterEffect && !canActivateLandscapeSupporterEffect(cp)) {
    toast('Snow on the Carpathians: only one Supporter effect can activate each turn.');
    if(typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('Snow on the Carpathians', 'major');
    return;
  }

  // The authoritative engine emits EFFECT_ACTIVATED for automatic WHEN_SET
  // effects. Single-player presents that same event here. Awaiting the shared
  // cinematic queue also guarantees that reactions, Fate changes, draws, and
  // pickers cannot begin before placement and the card-set cinematic finish.
  if(opts.fromSet === true && String(id || '') !== '66' && opts.skipActivationCinematic !== true && typeof playEffectActivationCinematic === 'function') {
    await playEffectActivationCinematic(inst, z, r, c, {
      source:'automatic-when-set',
      activationId:'when-set:' + String(inst.iid || inst.id) + ':' + String(G.turn || 0)
    });
  }

  // Mark when-set effects as spent before any target picker opens; stale card
  // panels should not be able to fire the same source again while it resolves.
  if(instIsSupporterForRules) {
    inst.whenSetActivated = true;
    inst.effectUsedInitial = true;
  }

  // Reaction check: opponent Supporter effects that target the opponent can be negated
  // by Lydia (56) or Havano Citizen (79)
  // Lydia can react to opponent card effect activations; set-triggered effects also have their while-on-field effects suppressed.
  if(instIsSupporterForRules && isPersistentSupporterEffectOnSet(inst) && !G._suppressEffectPrompt){
    const proceed = await checkReactions('supporter_effect', {
      card:inst,
      z,
      r,
      c,
      sourceOwner:cp,
      affectedOwners:getSupporterEffectAffectedOwners(inst, z, r, c, cp, opp)
    });
    if(proceed) recordSupporterEffectActivation(cp, inst, supporterActivationOptions);
    return;
  }

  if(isPersistentSupporterEffectOnSet(inst)) {
    recordSupporterEffectActivation(cp, inst, supporterActivationOptions);
  }

  if(instIsSupporterForRules && WHEN_SET_IDS.has(inst.id) && inst.id!=='56' && !G._suppressEffectPrompt){
    const proceed = await checkReactions('supporter_effect', {
      card:inst,
      z,
      r,
      c,
      sourceOwner:cp,
      affectedOwners:getSupporterEffectAffectedOwners(inst, z, r, c, cp, opp)
    });
    if(proceed) {
      recordSupporterEffectActivation(cp, inst, supporterActivationOptions);
      await _executeWhenSetSwitch(inst, z, r, c, cp, opp, id);
    }
    return;
  }

  // Havano reacts only when it is affected; Lydia can negate any fresh effect activation.
  const affectedByCharacterEffect = getCharacterEffectAffectedOwners(inst, z, r, c, cp, opp);
  if(!instIsSupporterForRules && !G._suppressEffectPrompt){
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

function isMariaSongHandCandidate(card, opponent, sourceOwner) {
  if(!card || !(typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(card, opponent) : card.type !== 'Supporter')) return false;
  return !(typeof isTargetImmuneToEffectOwner === 'function' && isTargetImmuneToEffectOwner(card, sourceOwner));
}

function applyMariaSongPreciseShot(sourceCard, selectedCard, sourceOwner) {
  if(!selectedCard) return {affected:0, fateLost:0};
  const opponent = sourceOwner === 0 ? 1 : 0;
  const targetId = String(selectedCard.id || '');
  let affected = 0;
  let fateLost = 0;
  const applyLoss = function(target, boardPosition){
    if(!target || String(target.id || '') !== targetId) return;
    if(typeof isTargetImmuneToEffectOwner === 'function' && isTargetImmuneToEffectOwner(target, sourceOwner)) return;
    const before = Math.max(0, Number(target.currentFate ?? target.fate) || 0);
    const changed = reduceStoredCardFateBy(target, 7, sourceOwner);
    const after = Math.max(0, Number(target.currentFate ?? target.fate) || 0);
    if(!changed && after === before) return;
    affected++;
    fateLost += Math.max(0, before - after);
    if(!boardPosition && typeof recordHandCardEffectModifier === 'function') {
      recordHandCardEffectModifier(target, {
        key:'maria-song:' + String(sourceCard && (sourceCard.iid || sourceCard.id) || '61'),
        name:'Maria Song',
        text:'Precise Shot: this card lost 7 Fate.',
        fateDelta:after - before
      });
    }
    if(boardPosition && typeof flashCardEffect === 'function') {
      flashCardEffect(target, 'maria_target', {
        label:'Precise Shot target',
        soundKey:'maria:' + String(sourceCard && (sourceCard.iid || sourceCard.id) || '61') + ':' + String(target.iid || target.id) + ':' + String(G.turn || 0)
      });
    }
  };
  ['hand','deck'].forEach(function(location){
    (G.players[opponent][location] || []).forEach(function(target){ applyLoss(target, null); });
  });
  forEachBoardCard(function(target, z, r, c){
    if(target && target.owner === opponent) applyLoss(target, {z:z, r:r, c:c});
  });
  return {affected:affected, fateLost:fateLost};
}

const ACHILLES_TOKEN_CARD_TYPES = Object.freeze(['Initiator','Improvisor','Dauntless','Coordinator','Supporter']);
const ACHILLES_TOKEN_RARITIES = Object.freeze(['circle','square','triangle','star']);

function achillesRandomIndex(length, reason, player) {
  if(length <= 0) return -1;
  const onlineIndex = typeof deterministicOnlineRandomIndex === 'function'
    ? deterministicOnlineRandomIndex(length, reason, player)
    : -1;
  return onlineIndex >= 0 ? onlineIndex : Math.floor(Math.random() * length);
}

function applyAchillesTokenConfiguration(card, draft) {
  if(!card || !draft) return false;
  const playMode = draft.playMode === 'consolidated' ? 'consolidated' : 'set';
  const type = ACHILLES_TOKEN_CARD_TYPES.includes(draft.type) ? draft.type : 'Supporter';
  const rarity = ACHILLES_TOKEN_RARITIES.includes(draft.rarity) ? draft.rarity : 'circle';
  const aff = ['reality','third_great_war','expanded_worlds','eventide'].includes(draft.aff) ? draft.aff : 'reality';
  card._achillesConfigured = true;
  card._suppressCinematicSubtitle = true;
  card._achillesPlayMode = playMode;
  card._suppressConsolidationCinematic = true;
  card.type = type;
  card.rarity = rarity;
  card.aff = aff;
  card.fate = 2;
  card.currentFate = 2;
  card.cost = 0;
  card._achillesDeclaration = {playMode, type, rarity, aff};
  if(typeof recordHandCardEffectModifier === 'function') {
    recordHandCardEffectModifier(card, {
      key:'achilles-adaptive-tactics',
      name:'Adaptive Tactics',
      text:'Adaptive Tactics token declared as ' + (playMode === 'consolidated' ? 'Consolidated' : 'Set') + ', ' + type + ', ' + rarity.charAt(0).toUpperCase() + rarity.slice(1) + ', ' + (typeof AFF_LABEL !== 'undefined' && AFF_LABEL[aff] ? AFF_LABEL[aff] : aff) + '.'
    });
  }
  return true;
}
window.applyAchillesTokenConfiguration = applyAchillesTokenConfiguration;

function configureAchillesTokenForAI(card, player, index) {
  const strategy = G && G._selectedAI ? String(G._selectedAI._deckStrategy || '') : '';
  if(strategy === 'ai_adaptive_formation') {
    const plannedTypes = ['Coordinator','Dauntless','Supporter'];
    const type = plannedTypes[Math.max(0, Number(index) || 0) % plannedTypes.length];
    let aff = 'third_great_war';
    if(typeof forEachBoardCard === 'function') {
      forEachBoardCard(function(fieldCard){
        if(fieldCard && fieldCard.owner === player && cardActsAsPassive(fieldCard, '77') && fieldCard._declaredAff) aff = fieldCard._declaredAff;
      });
    }
    applyAchillesTokenConfiguration(card, {playMode:'set', type, rarity:'triangle', aff});
    return card;
  }
  const type = ACHILLES_TOKEN_CARD_TYPES[achillesRandomIndex(ACHILLES_TOKEN_CARD_TYPES.length, 'achilles-ai-type:' + index, player)] || 'Supporter';
  const rarity = ACHILLES_TOKEN_RARITIES[achillesRandomIndex(ACHILLES_TOKEN_RARITIES.length, 'achilles-ai-rarity:' + index, player)] || 'circle';
  const affs = ['reality','third_great_war','expanded_worlds','eventide'];
  const aff = affs[achillesRandomIndex(affs.length, 'achilles-ai-aff:' + index, player)] || 'reality';
  applyAchillesTokenConfiguration(card, {playMode:'set', type, rarity, aff});
  return card;
}

function activateAchillesAdaptiveTactics(sourceCard, player) {
  if(!G || Number(G.turn) < 6) {
    toast('Adaptive Tactics cannot activate until turn 6.');
    return [];
  }
  const definitions = typeof ACHILLES_ADAPTIVE_TOKEN_DEFINITIONS !== 'undefined'
    ? Array.from(ACHILLES_ADAPTIVE_TOKEN_DEFINITIONS)
    : [];
  const generated = [];
  for(let i = 0; i < 3 && definitions.length; i++) {
    const definition = definitions[i % definitions.length];
    if(!definition) continue;
    const token = createCardInstance(definition, player);
    token.owner = player;
    token.name = 'Adaptive Tactics';
    token.ability = 'Adaptive Tactics';
    token.effect = 'This token has no set limit and 2 Fate. When it is set, it can become any card type, placement type, affiliation, and rarity.';
    token.achillesToken = true;
    token._suppressCinematicSubtitle = true;
    token._suppressConsolidationCinematic = true;
    token._achillesSourceIid = sourceCard && sourceCard.iid || null;
    token._achillesSourceName = sourceCard && sourceCard.name || 'Achille Laurent';
    token.currentFate = 2;
    if(G.aiEnabled && Number(player) === Number(G.aiPlayer)) configureAchillesTokenForAI(token, player, i);
    else if(typeof recordHandCardEffectModifier === 'function') {
      recordHandCardEffectModifier(token, {
        key:'achilles-adaptive-tactics',
        name:'Adaptive Tactics',
        text:'This token has no set limit and 2 Fate. When set, choose its card type, placement type, affiliation, and rarity.'
      });
    }
    if(typeof addCardToHand === 'function') addCardToHand(player, token, {arrivalKind:'achilles-token', announce:false});
    else G.players[player].hand.push(token);
    generated.push(token);
  }
  if(generated.length) {
    toast('Adaptive Tactics added ' + generated.length + ' Adaptive Tactics Tokens to ' + G.players[player].name + '\'s hand.');
    log(player===0?'p1':'p2', 'Adaptive Tactics created ' + generated.length + ' Adaptive Tactics Tokens');
    if(typeof renderEffectResolutionForPlayer === 'function') renderEffectResolutionForPlayer(player, {bothHands:true, piles:false});
  }
  return generated;
}
window.activateAchillesAdaptiveTactics = activateAchillesAdaptiveTactics;

function achillesChoiceSummary(draft) {
  const labels = ['Placement', 'Type', 'Rarity', 'Affiliation'];
  const values = [
    draft.playMode ? (draft.playMode === 'consolidated' ? 'Consolidated' : 'Set') : 'Play method',
    draft.type === 'Improvisor' ? 'Improviser' : (draft.type || 'Card type'),
    draft.rarity ? draft.rarity.charAt(0).toUpperCase() + draft.rarity.slice(1) : 'Rarity',
    draft.aff && typeof AFF_LABEL !== 'undefined' && AFF_LABEL[draft.aff] ? AFF_LABEL[draft.aff] : 'Affiliation'
  ];
  return values.map(function(value, index){
    const complete = [!!draft.playMode, !!draft.type, !!draft.rarity, !!draft.aff][index];
    const active = Number(draft.step || 0) === index + 1;
    return '<span class="achilles-draft-chip' + (complete ? ' is-complete' : '') + (active ? ' is-active' : '') + '"><b>' + (index + 1) + '</b><em>' + escapeHtml(complete ? value : labels[index]) + '</em></span>';
  }).join('');
}

function showAchillesTokenChoiceStep(card, player, draft, config) {
  draft.step = config.step;
  const stepLabel = String(config.step).padStart(2, '0') + ' / 04';
  const imageSource = card && card.img
    ? (typeof getRuntimeCardImageSrc === 'function' ? getRuntimeCardImageSrc(card.img, 'hand') : card.img)
    : '';
  const body = '<div class="achilles-token-picker" data-achilles-step="' + config.step + '" data-achilles-kind="' + escapeHtml(config.kind || '') + '">' +
    '<aside class="achilles-token-dossier">' +
      '<div class="achilles-token-art-frame">' + (imageSource ? '<img src="' + escapeHtml(imageSource) + '" alt="">' : '<span>AT</span>') + '</div>' +
      '<div class="achilles-token-identity"><span>TOKEN</span><strong>' + escapeHtml(card && card.name || 'Adaptive Tactics') + '</strong><small>Achille Laurent</small></div>' +
      '<div class="achilles-token-step-seal"><span>Declaration</span><strong>' + stepLabel + '</strong><small>Adaptive Tactics</small></div>' +
    '</aside>' +
    '<section class="achilles-token-workspace">' +
    '<div class="achilles-token-picker-head">' +
      '<span class="achilles-token-picker-kicker">Adaptive Tactics</span>' +
      '<strong>' + escapeHtml(config.heading) + '</strong>' +
      '<p>' + escapeHtml(config.copy || '') + '</p>' +
      '<div class="achilles-draft-progress">' + achillesChoiceSummary(draft) + '</div>' +
    '</div>' +
    '<div class="achilles-token-choice-grid achilles-token-choice-grid-' + config.columns + '">' +
      config.choices.map(function(choice, index){
        const choiceSlug = String(choice.value || choice.label || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
        const choiceStyle = choice.accent ? ' style="--achilles-choice-accent:' + escapeHtml(choice.accent) + ';--achilles-choice-glow:' + escapeHtml(choice.glow || choice.accent) + '"' : '';
        const rarityGlyphs = {circle:'&#9679;', square:'&#9632;', triangle:'&#9650;', star:'&#9733;'};
        const glyphContent = choice.glyphHtml || (config.kind === 'rarity' ? rarityGlyphs[choiceSlug] : '') || escapeHtml(choice.glyph || '+');
        const glyphMarkup = config.kind === 'type' ? '' : '<span class="achilles-token-choice-glyph">' + glyphContent + '</span>';
        const noteMarkup = choice.note ? '<span class="achilles-token-choice-note">' + escapeHtml(choice.note) + '</span>' : '';
        return '<button type="button" class="btn achilles-token-choice achilles-token-choice-' + escapeHtml(choiceSlug) + '" data-achilles-choice="' + index + '" data-achilles-value="' + escapeHtml(choiceSlug) + '"' + choiceStyle + '>' +
          '<span class="achilles-token-choice-top"><span class="achilles-token-choice-index">0' + (index + 1) + '</span>' + glyphMarkup + '</span>' +
          '<span class="achilles-token-choice-name">' + escapeHtml(choice.label) + '</span>' +
          noteMarkup +
          '<span class="achilles-token-choice-command">Select <b>&rsaquo;</b></span>' +
        '</button>';
      }).join('') +
    '</div>' +
      '<div class="achilles-token-picker-foot"><span>Placement completes after affiliation is declared.</span></div>' +
    '</section>' +
  '</div>';
  // The token's only hand action is Place on Board. This declaration is an
  // automatic continuation of that placement, never a separate configure action.
  const cancelDraft = function(){
    window.__fateAchillesTokenDraft = null;
    if(typeof G !== 'undefined' && G) {
      G._achillesTargeting = null;
      G.placing = false;
      G.selectedHandCard = null;
      clearPlaceHighlights();
    }
    closeModal();
  };
  showModal('Adaptive Tactics · ' + stepLabel, body, [], {
    onOpen:function(){
      const modalBox = document.querySelector('#modal .modal');
      if(modalBox) modalBox.classList.add('achilles-token-picker-modal');
      const modalTitle = document.getElementById('modal-title');
      if(modalTitle) modalTitle.textContent = 'Adaptive Tactics — Token Declaration';
      document.querySelectorAll('#modal .achilles-token-choice[data-achilles-choice]').forEach(function(button){
        button.onclick = function(){
          const choice = config.choices[Number(button.getAttribute('data-achilles-choice'))];
          if(!choice) return;
          if(typeof playEffectActivationButtonSound === 'function') playEffectActivationButtonSound();
          config.onChoose(choice.value);
        };
      });
      const acts = document.getElementById('modal-acts');
      if(acts) {
        acts.innerHTML = '';
        if(config.onBack) {
          const back = document.createElement('button');
          back.type = 'button';
          back.className = 'btn sm achilles-token-back';
          back.textContent = 'Back';
          back.onclick = config.onBack;
          acts.appendChild(back);
        }
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'btn sm';
        cancel.textContent = 'Cancel';
        cancel.onclick = cancelDraft;
        acts.appendChild(cancel);
      }
    }
  });
}

function showAchillesAffiliationStep(card, player, draft, options) {
  const affiliations = [
    {value:'reality', label:'Reality', accent:'#e2c657', glow:'rgba(226,198,87,.34)'},
    {value:'third_great_war', label:'Third Great War', accent:'#e25a4f', glow:'rgba(226,90,79,.34)'},
    {value:'expanded_worlds', label:'Expanded Worlds', accent:'#69c978', glow:'rgba(73,191,105,.34)'},
    {value:'eventide', label:'Eventide', accent:'#58c4f0', glow:'rgba(88,196,240,.34)'}
  ].map(function(entry){
    entry.glyphHtml = typeof getAffIcon === 'function' ? getAffIcon(entry.value) : String(entry.label || '?').charAt(0);
    return entry;
  });
  showAchillesTokenChoiceStep(card, player, draft, {
    step:4,
    kind:'affiliation',
    heading:'Declare an affiliation',
    copy:'Choose the banner this token will carry.',
    columns:4,
    choices:affiliations,
    onBack:function(){
      draft.aff = '';
      if(typeof draft.showRarity === 'function') draft.showRarity();
    },
    onChoose:function(aff){
      draft.aff = aff;
      // Phase 7 keeps this shipping declaration UI, but only the authority is
      // allowed to configure/place the token.  The bridge supplies onComplete
      // to submit its already-issued SET_ADAPTIVE_TOKEN command instead.
      if(options && typeof options.onComplete === 'function') {
        const completedDraft = {
          playMode:draft.playMode,
          type:draft.type,
          rarity:draft.rarity,
          aff:draft.aff,
          target:draft.target ? {z:Number(draft.target.z), r:Number(draft.target.r), c:Number(draft.target.c)} : null
        };
        window.__fateAchillesTokenDraft = null;
        closeModal();
        options.onComplete(completedDraft);
        return;
      }
      const hand = G.players && G.players[player] && G.players[player].hand || [];
      const liveCard = hand.find(function(entry){ return entry && String(entry.iid || '') === String(card.iid || ''); });
      window.__fateAchillesTokenDraft = null;
      if(!liveCard || !applyAchillesTokenConfiguration(liveCard, draft)) return;
      const index = hand.indexOf(liveCard);
      if(index < 0 || G.currentPlayer !== player) return;
      closeModal();
      G.selectedHandCard = index;
      if(draft.target && Number.isInteger(draft.target.z) && Number.isInteger(draft.target.r) && Number.isInteger(draft.target.c)) {
        G._achillesTargeting = null;
        G.placing = true;
        clickCell(draft.target.z, draft.target.r, draft.target.c);
        return;
      }
      G.placing = true;
      clearPlaceHighlights();
      if(!highlightValidCells(liveCard, 'achilles-token-placement')) {
        G.placing = false;
        G.selectedHandCard = null;
        toast('No open squares are available for ' + liveCard.name + '.');
        renderGame({hand:true, board:true, blocks:true});
        return;
      }
      renderGame({hand:true, topbar:true});
      setHint('Place ' + liveCard.name + ' as a ' + (draft.playMode === 'consolidated' ? 'consolidated ' : 'set ') + draft.type + '.');
    }
  });
}

function beginAchillesTokenConfiguration(card, player, options) {
  if(!card || !(typeof isAchillesAdaptiveToken === 'function' && isAchillesAdaptiveToken(card))) return false;
  if(G.currentPlayer !== player || G.phase !== 'main') return false;
  const target = options && options.target ? {
    z:Number(options.target.z), r:Number(options.target.r), c:Number(options.target.c)
  } : null;
  const draft = {cardIid:card.iid, playMode:'', type:'', rarity:'', aff:'', step:1, target:target};
  window.__fateAchillesTokenDraft = draft;
  const showPlayMethod = function(){
    showAchillesTokenChoiceStep(card, player, draft, {
      step:1,
      kind:'placement',
      title:'Adaptive Tactics · Placement Type',
      heading:'Choose the Token\'s placement type',
      copy:'Declare how effects should treat this Token. This never adds a cost or tribute requirement.',
      columns:2,
      choices:[
        {value:'set',label:'Set',glyph:'S',note:'Counts as set. Deployment remains free.'},
        {value:'consolidated',label:'Consolidated',glyph:'C',note:'Counts as consolidated, no cost.'}
      ],
      onChoose:function(value){ draft.playMode = value; showType(); }
    });
  };
  const showType = function(){
    showAchillesTokenChoiceStep(card, player, draft, {
      step:2,
      kind:'type',
      title:'Adaptive Tactics · Card Type',
      heading:'Declare the Token\'s card type',
      copy:'The chosen type controls how the Token interacts with card effects and bonuses.',
      columns:5,
      choices:ACHILLES_TOKEN_CARD_TYPES.map(function(type){
        return {value:type,label:type === 'Improvisor' ? 'Improviser' : type,note:type === 'Supporter' ? 'Supporter card' : 'Character card'};
      }),
      onBack:function(){ draft.type = ''; showPlayMethod(); },
      onChoose:function(value){ draft.type = value; showRarity(); }
    });
  };
  const showRarity = function(){
    showAchillesTokenChoiceStep(card, player, draft, {
      step:3,
      kind:'rarity',
      title:'Adaptive Tactics · Rarity',
      heading:'Declare the Token\'s rarity',
      copy:'Choose the rarity this Token presents to all rarity-based effects.',
      columns:4,
      choices:[
        {value:'circle',label:'Circle',glyph:'●',note:'Circle rarity'},
        {value:'square',label:'Square',glyph:'■',note:'Square rarity'},
        {value:'triangle',label:'Triangle',glyph:'▲',note:'Triangle rarity'},
        {value:'star',label:'Star',glyph:'★',note:'Star rarity'}
      ],
      onBack:function(){ draft.rarity = ''; showType(); },
      onChoose:function(value){ draft.rarity = value; showAchillesAffiliationStep(card, player, draft, options); }
    });
  };
  draft.showRarity = showRarity;
  showPlayMethod();
  return true;
}
window.beginAchillesTokenConfiguration = beginAchillesTokenConfiguration;

function beginAchillesTokenSet(card, player) {
  if(!card || !(typeof isAchillesAdaptiveToken === 'function' && isAchillesAdaptiveToken(card))) return false;
  if(G.currentPlayer !== player || G.phase !== 'main') return false;
  const hand = G.players && G.players[player] && G.players[player].hand || [];
  const index = hand.findIndex(function(entry){ return entry && String(entry.iid || '') === String(card.iid || ''); });
  if(index < 0) return false;
  card._achillesConfigured = false;
  G._achillesTargeting = {cardIid:String(card.iid || ''), player:player};
  G.selectedHandCard = index;
  G.placing = true;
  closeModal();
  clearPlaceHighlights();
  if(!highlightValidCells(card, 'achilles-token-placement')) {
    G.placing = false;
    G.selectedHandCard = null;
    toast('No open squares are available for ' + card.name + '.');
    return false;
  }
  renderGame({hand:true, topbar:true});
  setHint('Choose a square for ' + card.name + '. Its declaration will follow, then it will be set automatically.');
  return true;
}
window.beginAchillesTokenSet = beginAchillesTokenSet;

const BRAVE_HORIZONS_DECLARABLE_CARD_TYPES = Object.freeze(['Supporter','Initiator','Improvisor','Coordinator','Dauntless']);

function applyDestructionOfParadisePermanentFateLoss(target, amount, sourceOwner) {
  return reduceStoredCardFateBy(target, amount, sourceOwner, {permanent:true});
}

function applyDestructionOfParadise(sourceCard, zoneIndex, sourceOwner, declaredType) {
  const opponent = 1 - sourceOwner;
  const targets = [];
  const zone = G.board && G.board[zoneIndex] ? G.board[zoneIndex] : [];
  zone.forEach(function(row){ (row || []).forEach(function(card){
    if(!card || card.owner !== opponent || String(card.type || '') !== String(declaredType || '') || isFaceDownCard(card)) return;
    if(typeof isTargetImmuneToEffectOwner === 'function' && isTargetImmuneToEffectOwner(card, sourceOwner)) return;
    targets.push(card);
  }); });
  if(!targets.length) {
    toast('The Destruction of Paradise found no eligible ' + declaredType + ' cards in this zone.');
    return {targets:0, lossEach:0};
  }
  const lossEach = Math.max(0, Math.round(20 / targets.length));
  G._bh04SelvaSeq = (Number(G._bh04SelvaSeq) || 0) + 1;
  const flashKeyBase = ['bh04-selva', String(sourceCard && (sourceCard.iid || sourceCard.id) || 'bh04'), String(declaredType || 'type'), Number(G.turn) || 0, G._bh04SelvaSeq].join(':');
  targets.forEach(function(target){
    const changed = applyDestructionOfParadisePermanentFateLoss(target, lossEach, sourceOwner);
    if(changed && typeof flashCardEffect === 'function') {
      flashCardEffect(target, 'bh04_selva_paradise', {
        label:'The Destruction of Paradise',
        soundKey:flashKeyBase + ':' + String(target && (target.iid || target.id) || 'target')
      });
    }
  });
  toast('The Destruction of Paradise: ' + targets.length + ' ' + declaredType + ' card' + (targets.length === 1 ? '' : 's') + ' permanently lost ' + lossEach + ' Fate each.');
  log(sourceOwner===0?'p1':'p2', 'The Destruction of Paradise declared ' + declaredType + ': ' + targets.length + ' cards permanently lost ' + lossEach + ' Fate each');
  renderEffectResolutionForPlayer(sourceOwner, {hand:false});
  return {targets:targets.length, lossEach:lossEach};
}
window.applyDestructionOfParadise = applyDestructionOfParadise;

function chooseDestructionOfParadiseType(sourceCard, z, sourceOwner, authoritativeChoice) {
  const labels = {
    Supporter:'Supporter',
    Initiator:'Initiator',
    Improvisor:'Improviser',
    Coordinator:'Coordinator',
    Dauntless:'Dauntless'
  };
  const opponent = 1 - sourceOwner;
  const zone = G.board && G.board[z] ? G.board[z] : [];
  const typeStats = {};
  BRAVE_HORIZONS_DECLARABLE_CARD_TYPES.forEach(function(type){
    let count = 0;
    zone.forEach(function(row){ (row || []).forEach(function(card){
      if(!card || card.owner !== opponent || String(card.type || '') !== type || isFaceDownCard(card)) return;
      if(typeof isTargetImmuneToEffectOwner === 'function' && isTargetImmuneToEffectOwner(card, sourceOwner)) return;
      count += 1;
    }); });
    typeStats[type] = { count:count, lossEach:count ? Math.max(0, Math.round(20 / count)) : 0 };
  });
  const body = '<div class="bh04-type-picker">' +
    '<p class="bh04-picker-prompt">Choose one card type. <span>Zone ' + (Number(z) + 1) + ' - 20 Fate split evenly, permanently</span></p>' +
    '<div class="bh04-type-grid">' +
      BRAVE_HORIZONS_DECLARABLE_CARD_TYPES.map(function(type){
        const stat = typeStats[type];
        return '<button type="button" class="btn bh04-type-choice" data-bh04-type="' + escapeHtml(type) + '">' +
          '<span class="bh04-type-name">' + escapeHtml(labels[type] || type) + '</span>' +
          '<span class="bh04-type-meta">' + stat.count + ' card' + (stat.count === 1 ? '' : 's') + ' affected</span>' +
          '<span class="bh04-type-result">' + (stat.count ? '-' + stat.lossEach + ' Fate each, permanently' : 'No targets') + '</span>' +
        '</button>';
      }).join('') +
    '</div>' +
  '</div>';
  let settled = false;
  const actions = BRAVE_HORIZONS_DECLARABLE_CARD_TYPES.map(function(declaredType){
    return {
      label:'Declare ' + (labels[declaredType] || declaredType),
      pri:true,
      hidden:true,
      action:function(){
        if(settled) return;
        settled = true;
        document.querySelectorAll('#modal .bh04-type-choice').forEach(function(choice){ choice.disabled = true; });
        closeModal();
        if(typeof authoritativeChoice === 'function') authoritativeChoice(declaredType);
        else applyDestructionOfParadise(sourceCard, z, sourceOwner, declaredType);
      }
    };
  });
  showModal('The Destruction of Paradise', body, actions, {
    onOpen:function(){
      const modalBox = document.querySelector('#modal .modal');
      if(modalBox) modalBox.classList.add('bh04-type-picker-modal');
      document.querySelectorAll('#modal .bh04-type-choice[data-bh04-type]').forEach(function(button){
        button.onclick = function(){
          const declaredType = String(button.getAttribute('data-bh04-type') || '');
          const actionIndex = BRAVE_HORIZONS_DECLARABLE_CARD_TYPES.indexOf(declaredType);
          if(actionIndex < 0) return;
          if(typeof playEffectActivationButtonSound === 'function') playEffectActivationButtonSound();
          const modalActions = Array.isArray(window.__fateCurrentModalActions) ? window.__fateCurrentModalActions : actions;
          const action = modalActions[actionIndex];
          if(action && typeof action.action === 'function') action.action();
        };
      });
    }
  });
}
if(typeof window !== 'undefined') window.chooseDestructionOfParadiseType = chooseDestructionOfParadiseType;

function liveTaylorCopySource(taylor, z, r, c) {
  if(!taylor) return null;
  const iid = String(taylor.iid || '');
  const atOriginalSquare = G.board?.[z]?.[r]?.[c] || null;
  if(
    atOriginalSquare &&
    String(atOriginalSquare.id || '') === 'bh05' &&
    (!iid || String(atOriginalSquare.iid || '') === iid)
  ) return atOriginalSquare;
  const liveByIid = iid && typeof findBoardCardByIid === 'function'
    ? findBoardCardByIid(iid)
    : null;
  if(liveByIid && String(liveByIid.id || '') === 'bh05') return liveByIid;
  if(G._onlineRoomCode) return null;
  return String(taylor.id || '') === 'bh05' ? taylor : null;
}

async function resolveTaylorCopiedEffect(taylor, z, r, c, selected) {
  taylor = liveTaylorCopySource(taylor, z, r, c);
  if(!taylor || !selected || String(selected.id || '') === 'bh05') return false;
  taylor._bh05CopiedCardId = String(selected.id || '');
  taylor._bh05CopiedCardName = String(selected.name || 'Card');
  taylor._bh05CopiedAbility = String(selected.ability || 'Copied Effect');
  taylor._bh05CopiedPrintedEffect = String(selected.effect || '');
  taylor._bh05CopiedPassiveId = String(selected.id || '');
  taylor._bh05CopiedTrackerState = {};
  Object.keys(selected).forEach(function(key){
    const value = selected[key];
    if(value == null || ['string','number','boolean'].includes(typeof value)) taylor._bh05CopiedTrackerState[key] = value;
  });
  const original = {
    id:taylor.id,
    type:taylor.type,
    effectUsedInitial:taylor.effectUsedInitial,
    effectTurnLocked:taylor._effectTurnLocked,
    whenSetActivated:taylor.whenSetActivated,
    copiedSupporter:taylor._ledgerCopiedSupporterEffect
  };
  const previousSuppressPrompt = !!G._suppressEffectPrompt;
  G._suppressEffectPrompt = true;
  try {
    taylor.id = String(selected.id || '');
    taylor.type = String(selected.type || '');
    taylor.effectUsedInitial = false;
    taylor._effectTurnLocked = false;
    taylor.whenSetActivated = false;
    if(taylor.type === 'Supporter') {
      taylor._ledgerCopiedSupporterEffect = true;
      await runWhenSetEffect(taylor, z, r, c);
    } else if(INITIAL_SET_INITIATOR_IDS.has(taylor.id)) {
      await triggerCharacterEffect(taylor, z, r, c, {fromSet:true, copiedByTaylor:true});
    } else if(WHEN_SET_IDS.has(taylor.id)) {
      await runWhenSetEffect(taylor, z, r, c);
    } else {
      await triggerCharacterEffect(taylor, z, r, c, {fromSet:true, copiedByTaylor:true});
    }
  } finally {
    taylor.id = original.id;
    taylor.type = original.type;
    taylor.effectUsedInitial = true;
    taylor._effectTurnLocked = true;
    taylor.whenSetActivated = original.whenSetActivated;
    if(original.copiedSupporter === undefined) delete taylor._ledgerCopiedSupporterEffect;
    else taylor._ledgerCopiedSupporterEffect = original.copiedSupporter;
    G._suppressEffectPrompt = previousSuppressPrompt;
  }
  toast('The Art of Mimicry copied ' + taylor._bh05CopiedCardName + ' - ' + taylor._bh05CopiedAbility + '.');
  renderEffectResolutionForPlayer(taylor.owner, {bothHands:true, piles:true});
  return true;
}
window.resolveTaylorCopiedEffect = resolveTaylorCopiedEffect;

function chooseTaylorCopiedEffect(taylor, z, r, c, player) {
  const candidates = [].concat(G.players[player].hand || [], G.players[player].deck || []).filter(function(card){
    return card && String(card.id || '') !== 'bh05' && String(card.iid || '') !== String(taylor.iid || '');
  });
  if(!candidates.length) {
    toast('The Art of Mimicry found no card in your hand or deck to copy.');
    return Promise.resolve(false);
  }
  return new Promise(function(resolve){
    pickCardsVisual(candidates, {
      title:'The Art of Mimicry',
      subtitle:'Choose any card in your hand or deck. Taylor copies its effect.',
      maxCount:1,
      minCount:1,
      confirmLabel:'Copy Effect',
      immediate:true,
      onlineParentAction:true
    }, async function(chosen){
      const selected = chosen && chosen[0];
      const liveTaylor = liveTaylorCopySource(taylor, z, r, c);
      if(!selected) {
        resolve(false);
        return;
      }
      if(!liveTaylor) {
        reject(new Error('Taylor is no longer present on the synchronized board'));
        return;
      }
      try {
        resolve(await resolveTaylorCopiedEffect(liveTaylor, z, r, c, selected));
      } catch(e) {
        console.error('Taylor copied effect failed', e);
        reject(e);
      }
    });
  });
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
        // Keep the effect promise open through both the display delay and the
        // target choice so multiplayer cannot snapshot the card between them.
        await new Promise(function(resolve){
          setTimeout(function(){
            const opened = pickMultipleInZone(z,2,'Makenna: Select up to 2 friendly cards to make immune:',function(targets){
              targets.forEach(function(t){
                if(!(typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(t.card))) {
                  t.card.immuneFlag=true;
                  t.card._immuneByMakenna=true;
                }
              });
              toast('Selected cards are now immune');
              renderEffectResolutionForPlayer(cp, {hand:false});
              resolve(true);
            }, function(card){ return card.owner===cp; }, function(){ resolve(false); }, inst);
            if(opened === false) resolve(false);
          },100);
        });
      } break;
    case '05': { // 17th British Regiment: select card in zone, +3 Fate
      // Keep the parent activation unresolved until its callback-style picker
      // confirms or cancels. Otherwise multiplayer can snapshot the spent source
      // before the local +3 mutation and an authority replay can erase the gain.
      await new Promise(function(resolve){
        let settled = false;
        const finish = function(value){
          if(settled) return;
          settled = true;
          resolve(value);
        };
        const opened = pickCardInZone(z,'Select a card to gain 3 Fate:',(tgt,tz,tr,tc)=>{
          modifyFate(tgt,3,'permanent');
          if(typeof flashCardEffect === 'function') {
            flashCardEffect(tgt, 'british_union_jack', {
              label:'Liberators of Rwanda',
              soundKey:'british-regiment:' + String(inst && (inst.iid || inst.id) || 'card') + ':' + String(tgt && (tgt.iid || tgt.id) || 'target') + ':' + String(G.turn || 0)
            });
          }
          log(cp===0?'p1':'p2',`Liberators of Rwanda: ${tgt.name} gains 3 Fate`);
          renderEffectResolutionForPlayer(cp, {hand:false});
          finish(true);
        }, null, function(){ finish(false); }, inst);
        if(opened === false) finish(false);
      });
    } break;
    case '26': { // UCPD: reveal opponent hand — mark cards as revealed persistently
      const oppHand = G.players[opp].hand;
      if(!oppHand.length){toast('Opponent has no cards in hand');break;}
      // Mark all current opponent hand cards as revealed
      if(!G._revealedCards) G._revealedCards = {};
      const revealed = oppHand.filter(function(c){ return !(typeof isTargetImmuneToEffectOwner === 'function' && isTargetImmuneToEffectOwner(c, cp)); });
      revealed.forEach(c => { G._revealedCards[c.iid] = true; });
      // Show the reveal window
      if(typeof showRevealedHandWindow === 'function') showRevealedHandWindow(opp);
      toast(revealed.length + ' eligible card' + (revealed.length === 1 ? '' : 's') + ' in ' + G.players[opp].name + "'s hand revealed!");
      renderOppHand();
      break;
    }
    case '27': // Kazumi: automatic draw on set
      inst.effectUsedInitial = true;
      inst._effectTurnLocked = true;
      await drawCard(cp,3,{afterSetOrCinematic:true, activatedDrawEffect:true, effectSource:inst});
      toast('Kazumi: drew 3 cards');
      renderEffectResolutionForPlayer(cp, {hand:true});
      break;
    case '32': // Temecula Resident: draw 1
      await drawCard(cp,1,{afterSetOrCinematic:true, activatedDrawEffect:true, effectSource:inst});
      toast('Drew 1 card');
      renderHand(); break;
    case '42': // West German Soldier: draw 2, discard 2 (FORCED)
      await drawCard(cp,2,{afterSetOrCinematic:true, activatedDrawEffect:true, effectSource:inst, deferJoiePassive:true});
      await waitForEffectPresentationBeforeChoice();
      toast('Drew 2 cards. You must discard 2.');
      renderHand();
      {
        const hand42 = G.players[cp].hand;
        const discardCount = Math.min(2, hand42.length);
        if(discardCount > 0) {
          await new Promise(function(resolve){
            pickCardsVisual(hand42, {
              title: 'West German Soldier: Discard '+discardCount+' card(s)',
              subtitle: 'You must discard '+discardCount+' card(s) from your hand',
              maxCount: discardCount,
              minCount: discardCount,
              confirmLabel: 'Discard',
              onlineParentAction: true
            }, (chosen)=>{
              chosen.forEach(c=>{
                G.players[cp].hand=G.players[cp].hand.filter(h=>h.iid!==c.iid);
                fatePushDiscard(cp, c);
              });
              renderHand();
              resolve();
            });
          });
        }
      }
      if(typeof triggerJoieDrawEffectPassive === 'function') {
        triggerJoieDrawEffectPassive(cp, {sourceCard:inst, sourceId:String(inst && inst.id || '42')});
      }
      break;
    case '31': // Hemorrhaging Wound: any card in zone loses 3 Fate
      await new Promise(function(resolve){
        let settled = false;
        const finish = function(){ if(!settled){ settled = true; resolve(); } };
        const opened = pickCardInZone(z,'Select any card to lose 3 Fate:',(tgt)=>{
          if(typeof isTargetImmuneToEffectOwner === 'function' ? isTargetImmuneToEffectOwner(tgt, cp) : (typeof isFullyEffectImmuneCard === 'function' ? isFullyEffectImmuneCard(tgt) : (tgt.immuneFlag || tgt.id==='76'))){
            showBlockedAnimation('this card is immune');
            finish();
            return;
          }
          const before = typeof getEffectiveFate === 'function' ? getEffectiveFate(tgt, z) : (tgt.currentFate || tgt.fate || 0);
          const changed = reduceStoredCardFateBy(tgt, 3, cp, {permanent:true});
          if(!changed && before > 0){
            showBlockedAnimation('this card is immune');
            finish();
            return;
          }
          log(cp===0?'p1':'p2',`Hemorrhaging Wound: ${tgt.name} loses 3 Fate`);
          flashCardEffect(tgt, 'oathbound_crescent', {
            label:'oathbound blade',
            soundKey:'oathbound:' + String(inst && (inst.iid || inst.id) || 'card') + ':' + String(tgt && (tgt.iid || tgt.id) || 'target') + ':' + String(G.turn || 0)
          });
          renderEffectResolutionForPlayer(cp, {hand:false});
          finish();
        }, function(cell){ return !!cell && !(typeof isTargetImmuneToEffectOwner === 'function' ? isTargetImmuneToEffectOwner(cell, cp) : (typeof isFullyEffectImmuneCard === 'function' ? isFullyEffectImmuneCard(cell) : (cell.immuneFlag || cell.id==='76'))); }, finish, inst);
        if(opened === false) finish();
      });
      break;
    case '16': // MINAE Death Squad: discard opponent supporter in zone
      pickCardInZone(z,'Select an opponent Supporter to discard:',(tgt,tz,tr,tc)=>{
        if(tgt === inst || (tgt.iid && inst.iid && tgt.iid === inst.iid)){toast('MINAE Death Squad cannot discard itself');return;}
        if(tgt.owner!==opp || !(typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(tgt, opp) : tgt.type==='Supporter')){toast('Must select opponent Supporter');return;}
        if(typeof isTargetImmuneToEffectOwner === 'function' && isTargetImmuneToEffectOwner(tgt, cp)){showBlockedAnimation('this card is immune');return;}
        discardBoardCard(tgt,tz,tr,tc);
        log(cp===0?'p1':'p2',`MINAE Death Squad: discarded ${tgt.name}`);
        renderEffectResolutionForPlayer(cp, {hand:false, piles:true});
      },c=>c.owner===opp && (typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(c, opp) : c.type==='Supporter') && !(typeof isTargetImmuneToEffectOwner === 'function' && isTargetImmuneToEffectOwner(c, cp)), null, inst); break;
    case '18': // 1st US Marines: suppress opponent's supporter effects next turn
      activateUsMarinesSuppressionEffect(cp, opp);
      break;
    case '33': // West Caribbea Infantry: next character added to hand costs 1 less, gains 2 fate
      G._westCaribNext = { owner: cp, sourceIid: inst.iid || null };
      toast('The next character added to your hand gains 2 Fate and costs 1 less Reinforcement');
      if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
      break;
    case '34': // Rozsi Szocs: passive coordinator - no when-set trigger needed
      break;
    case '44': // Soviet Grenadiers: continuous — handled in applyContinuousEffects
      break;
    case '50': // Berkeley CS Major: lock any zone for opponent's next turn
      if(typeof showZonePickerVisual === 'function'){
        showZonePickerVisual({
          title:'Artillery Distance',
          subtitle:"Select a zone. On your opponent's next turn, they cannot set, consolidate, or activate effects there.",
          allowCancel:false
        }, function(selectedZone){ applyArtilleryLock(selectedZone, cp); });
      }else{
        showModal('Artillery Distance', "<p>Select a zone. On your opponent's next turn, they cannot set, consolidate, or activate effects there.</p>", [
          { label:'Zone 1', action:()=>{ closeModal(); applyArtilleryLock(0, cp); } },
          { label:'Zone 2', action:()=>{ closeModal(); applyArtilleryLock(1, cp); } },
          { label:'Zone 3', action:()=>{ closeModal(); applyArtilleryLock(2, cp); } }
        ]);
      }
      break;
    case '58': // Crossroads Worker: add supporter from discard
      const recoverableSupporters = typeof getRecoverableDiscardCards === 'function' ? getRecoverableDiscardCards(cp, c=>(typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(c, cp) : c.type==='Supporter')) : G.players[cp].discard.filter(c=>(typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(c, cp) : c.type==='Supporter'));
      if(recoverableSupporters.length===0){
        toast('No supporters in discard');break;
      }
      pickFromDiscard(cp,'Supporter','Add a Supporter from discard to hand:',(c)=>{
        if(typeof addCardToHand==='function') addCardToHand(cp, c);
        else G.players[cp].hand.push(c);
        G.players[cp].discard=G.players[cp].discard.filter(d=>d.iid!==c.iid);
        renderHand();
        toast('Added '+c.name+' to hand');
      }, {sourceCardId:'58'}); break;
    case '60': // IB Student: search deck for supporter
      searchDeckForType(cp,'Supporter','Search deck for a Supporter:',1,{sourceCardId:'60'}); break;
    case '75': // Ledger-keepers: copy a supporter effect
      pickBoardSupporterEffect(cp,z,inst); break;
    case '76': // ALPINE Infantry: gains 4 Fate, immune, can't consolidate
      if(typeof applyPermanentEffectImmunity === 'function') applyPermanentEffectImmunity(inst);
      inst._suppressNextFatePulse = true;
      inst.currentFate = typeof getPlacedCardFate === 'function' ? getPlacedCardFate(inst) : 5; // 1 base + 4
      inst.immuneFlag = true;
      inst.noBonus = true;
      inst.noConsolidate = true;
      renderEffectResolutionForPlayer(cp, {hand:false, blocks:false, topbar:false, effects:false, hover:false}); break;
    case '01': // Felicyta Janowicz: no special when-set (passive aura handled in getEffectiveFate)
      break;
    case '46': // Phil: Monarchist Manifesto — Dauntless, gains 2 Fate per draw phase
      inst._philSetTurn = G.turn; break;
    case '57': // Jeremiah Jones: no special when-set (aura potency boost handled in getEffectiveFate)
      break;
    case '77': { // Duncan Heyward: when set, declare affiliation; then passive +4 to that aff
      showAffiliationPickerVisual((aff)=>{
        inst._declaredAff = aff;
        scheduleCoordinatorPlacementFlash(inst, {
          z,
          r,
          c,
          source:'heyward-affiliation-picker',
          delayMs:0,
          label:'declared affiliation',
          soundKey:'heyward:' + String(inst && (inst.iid || inst.id) || 'card') + ':' + String(G.turn || 0)
        });
        toast('Duncan Heyward declared '+AFF_LABEL[aff]+'! All '+AFF_LABEL[aff]+' cards in zone gain 4 Fate.');
        log(cp===0?'p1':'p2','Duncan Heyward declared '+AFF_LABEL[aff]);
        renderEffectResolutionForPlayer(cp, {hand:false});
      });
      break;
    }
    case '61': { // Maria Song: reveal opponent Characters, then all copies lose 7 Fate
      const candidates = G.players[opp].hand.filter(function(target){ return isMariaSongHandCandidate(target, opp, cp); });
      if(!candidates.length){toast('Opponent has no eligible Character cards in hand');break;}
      pickCardsVisual(candidates, {
        title:'Precise Shot',
        subtitle:'Select a revealed Character. Every copy in hand, deck, and on the field loses 7 Fate.',
        maxCount:1,
        minCount:1,
        confirmLabel:'Take the Shot',
        immediate:true
      }, function(chosen){
        const target = chosen && chosen[0];
        if(!target) return;
        const result = applyMariaSongPreciseShot(inst, target, cp);
        toast(target.name + ': ' + result.affected + ' cop' + (result.affected === 1 ? 'y' : 'ies') + ' lost 7 Fate.');
        log(cp===0?'p1':'p2','Maria Song reduced ' + result.affected + ' copies of ' + target.name + ' by 7 Fate');
        renderEffectResolutionForPlayer(cp, {bothHands:true, piles:true});
      });
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
      if(typeof fateFastShowMovementTargets === 'function') fateFastShowMovementTargets(options, ['placeable','move-target']);
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
        // The picker is closed before its callback. Present the chosen crest on
        // every card whose affiliation actually changed, matching the
        // authoritative multiplayer presentation one-for-one.
        requestAnimationFrame(function(){
          if(typeof showMarkMenzAffiliationOverlay === 'function'){
            const soundKey = 'mark-menz:' + String(inst.iid || inst.id || '66') + ':' + String(aff) + ':' + String(G.turn || 0);
            G.board[z].forEach(function(row){ row.forEach(function(cell){
              if(!cell || cell._affChangedBy !== 'mark_menz' || cell._lastAffEffectSource !== inst.iid || cell._affChanged !== aff) return;
              showMarkMenzAffiliationOverlay(cell, aff, {
                soundKey:soundKey
              });
            }); });
          }
        });
      });
      break;
    }
    case '68': { // Great Oak High Schooler: search deck for a Coordinator (non-star)
      const matches = G.players[cp].deck.filter(c=>c.type==='Coordinator' && c.rarity!=='star');
      const openSchoolerSearch = function(){
        pickCardsVisual(matches,{
          title:'Home of the Wolfpack',
          subtitle:'Add a Coordinator (non-Star) to your hand',
          maxCount:1,
          confirmLabel:'Add to Hand',
          immediate:true,
          opponentSearch:true,
          searchingPlayer:cp,
          searchSourceCardId:'68'
        },(picked)=>{
          if(picked.length===0) return;
          const chosen = picked[0];
          if(typeof queueSearchToHandMotion === 'function') queueSearchToHandMotion(cp, chosen, 'deck', G.players[cp].hand.length);
          if(typeof addCardToHand==='function') addCardToHand(cp, chosen, {arrivalKind:'search'});
          else G.players[cp].hand.push(chosen);
          G.players[cp].deck = G.players[cp].deck.filter(d=>d.iid!==chosen.iid);
          shuffleDeck(cp);
          if(typeof playSfx === 'function') playSfx('searchFound');
          renderEffectResolutionForPlayer(cp, {hand:false});
          toast(`Added ${chosen.name} to hand`);
          if(typeof resolveBoleslawAfterSearchSelection === 'function') {
            return resolveBoleslawAfterSearchSelection(cp, [chosen], {sourceCardId:'68'});
          }
        });
      };
      if(matches.length) openSchoolerSearch();
      break;
    }
    case '69': { // Breakfast Republic Busser: grant adjacent-zone movement for three moves
      if(inst._busserGrantPending){
        toast('Breakfast Republic Busser is already resolving.');
        break;
      }
      inst._busserGrantPending = true;
      const candidates = [];
      if(G.board[z]) G.board[z].forEach((row,ri)=>row.forEach((cell,ci)=>{
        if(cell && cell.owner===cp && !isFaceDownCard(cell) && !cell.cantBeMoved && !cell.immuneFlag && cell.id!=='76'){
          candidates.push({card:cell,z:z,r:ri,c:ci});
        }
      }));
      if(candidates.length===0){
        inst._busserGrantPending = false;
        toast('No movable friendly cards in this zone');
        break;
      }
      pickCardInZone(z,'Corner! Behind!: select a friendly card in this zone to move between adjacent zones.',(target)=>{
        if(!target || target.owner!==cp || isFaceDownCard(target) || target.cantBeMoved || target.immuneFlag || target.id==='76'){
          toast('Select a movable friendly card');
          return;
        }
        target._busserTurnsLeft = Math.max(3, getBusserTurnsLeft(target));
        target._busserMoves = target._busserTurnsLeft;
        target._busserOwner = cp;
        target._busserMovedThisTurn = false;
        target._busserSourceIid = inst.iid || null;
        inst._busserGrantPending = false;
        inst.effectUsedInitial = true;
        inst.whenSetActivated = true;
        toast(target.name + ' can move to adjacent zones.');
        if(typeof showBusserStatusBanner === 'function') showBusserStatusBanner(target, 3, cp);
        if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
        else if(typeof renderTopbarEffects === 'function') renderTopbarEffects();
        renderEffectResolutionForPlayer(cp, {hand:false});
      }, cell=>cell && cell.owner===cp && !isFaceDownCard(cell) && !cell.cantBeMoved && !cell.immuneFlag && cell.id!=='76', null, inst);
      break;
    }
    case '71': { // Fort Calvin Watcher: reveal three draws, redirect only the first Character
      // Flag: next 3 draws by opponent during draw phase are revealed
      if(!G._fortCalvinActive) G._fortCalvinActive = [];
      G._fortCalvinActive.push({
        owner:cp,
        remaining:3,
        characterSent:false,
        sourceIid:inst.iid || null,
        lastRevealedName:null,
        lastRevealedWasCharacter:false,
        sentCharacterName:null
      });
      toast('Fort Calvin Watcher active — next 3 opponent draws will be revealed!');
      break;
    }
    case '72': { // Robo en la Noche: steal random card from opponent's hand
      const oppHand = G.players[opp].hand;
      const candidates = oppHand.filter(function(target){ return !(typeof isTargetImmuneToEffectOwner === 'function' && isTargetImmuneToEffectOwner(target, cp)); });
      if(candidates.length===0){toast('Opponent has no eligible cards');break;}
      const rng = (typeof G._onlineRng === 'function') ? G._onlineRng : Math.random;
      const onlineIdx = deterministicOnlineRandomIndex(candidates.length, 'roboEnLaNoche', cp);
      const stolen = candidates[onlineIdx >= 0 ? onlineIdx : Math.floor(rng()*candidates.length)];
      oppHand.splice(oppHand.indexOf(stolen),1);
      stolen._stolenByRobo = true; // returns to its original owner's discard after leaving the field
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
          await drawCard(cp,2,{activatedDrawEffect:true, effectSource:inst});
          toast(`Discarded ${target.name}, drew 2 cards`);
          renderEffectResolutionForPlayer(cp, {hand:true, piles:true});
        }
      }, cell=>cell && cell.owner===cp && (typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(cell, cp) : cell.type!=='Supporter') && cell.iid!==inst.iid, null, inst);
      break;
    }
    case '84': { // Kvetka Svoboda: set an Expanded Worlds character from deck for free
      const matches = G.players[cp].deck.filter(c=>{
        const base = (typeof CARDS !== 'undefined' && Array.isArray(CARDS)) ? CARDS.find(x=>String(x.id) === String(c.id)) : null;
        const aff = String((c.aff || (base && base.aff) || '')).toLowerCase().replace(/\s+/g, '_');
        const type = String(c.type || (base && base.type) || '').toLowerCase();
        const effectiveCard = Object.assign({}, base || {}, c || {}, {owner: cp});
        return aff === 'expanded_worlds' &&
          type && (type !== 'supporter' || (typeof isCardCharacterForRules === 'function' && isCardCharacterForRules(effectiveCard, cp))) &&
          String(c.id) !== '84';
      });
      if(!matches.length){toast('No eligible Expanded Worlds Character in deck');break;}
      const openFlowerPicking = function(){
        pickCardsVisual(matches, {
          title:'Flower Picking',
          subtitle:'Choose an Expanded Worlds Character to set for free.',
          maxCount:1,
          confirmLabel:'Set for Free',
          immediate:true,
          opponentSearch:true,
          searchingPlayer:cp,
          searchSourceCardId:'84'
        }, (picked)=>{
          const found = picked && picked[0];
          if(!found) return;
          G.players[cp].deck = G.players[cp].deck.filter(x=>x.iid!==found.iid);
          if(typeof addCardToHand==='function') addCardToHand(cp, found, {announce:false, arrivalKind:'search'});
          else G.players[cp].hand.push(found);
          const searchResolution = typeof resolveBoleslawAfterSearchSelection === 'function'
            ? resolveBoleslawAfterSearchSelection(cp, [found], {sourceCardId:'84'})
            : Promise.resolve(0);
          return Promise.resolve(searchResolution).then(function(){
            beginImmediateFreePlacement(cp, found, 'Place '+found.name+' for free from Flower Picking.', {
              key:'kvetka-svoboda-free-set',
              name:'Kvetka Svoboda',
              ability:'Flower Picking',
              text:'Flower Picking: this card can be set immediately for free.'
            });
            toast(found.name+' is ready to set immediately for free.');
            inst.effectUsedInitial = true;
          });
        });
      };
      openFlowerPicking();
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
      G._landscapeChangeLocks[opp] = Math.max(Number(G._landscapeChangeLocks[opp]) || 0, 6);
      toast('A Snowy Village: opponent cannot change the landscape for 5 turns.');
      if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
      break;
    }
    case '94': { // Wodny Potok Mailman: delayed Triangle delivery
      const matches = G.players[cp].deck.filter(c=>c.rarity==='triangle');
      if(!matches.length){toast('No Triangle cards in deck');break;}
      const openMailDelivery = function(){
        pickCardsVisual(matches, {
          title:'Mail Delivery',
          subtitle:'Choose a Triangle card from your deck. It will arrive in four turns.',
          maxCount:1,
          confirmLabel:'Schedule Delivery',
          immediate:true,
          opponentSearch:true,
          searchingPlayer:cp,
          searchSourceCardId:'94'
        }, (picked)=>{
          const found = picked && picked[0];
          if(!found) return;
          G.players[cp].deck = G.players[cp].deck.filter(x=>x.iid!==found.iid);
          found._fateHandArrivalKind = 'search';
          ensureMailDeliveryState().push({player:cp, card:found, turnsLeft:4, sourceIid:inst.iid});
          toast(found.name + ' will arrive in four turns.');
          inst.whenSetActivated = true;
          if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
          renderEffectResolutionForPlayer(cp, {hand:true, piles:true});
        });
      };
      openMailDelivery();
      break;
    }
    case '20': // Shield Wall: South Wind is immune to opponent effects.
      renderEffectResolutionForPlayer(cp, {hand:false, blocks:false});
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
    case '35': { // Alexander the Magnificient: live Fate = sum of own Supporters' effective Fate in zone
        const alexSum = getAlexanderSupporterFateTotal(inst, z);
        inst.currentFate = alexSum;
        toast('Hellenic Glory: Alexander has '+alexSum+' Fate from Supporters!');
        log(cp===0?'p1':'p2', 'Alexander entered with '+alexSum+' Fate from Supporters');
        renderEffectResolutionForPlayer(cp, {hand:false});
      } break;
    case '45': // Chingachlook: placement restriction is enforced before setting.
      break;
    case '47': // Great Oak Infantry: when used for consolidation, new card gains 3 Fate
      inst._greatOakBonus = true;
      break;
    case '52': {
      if(typeof activateVigilantes === 'function') activateVigilantes(inst, z, r, c, {activationAlreadyCounted:true});
      break;
    }
    case '96': { // Wodny Potok Snow Shoveler: return four random discard cards
      const returned = returnRandomDiscardCardsToDeck(cp, 4, 'wodnyPotokSnowShoveler:' + (inst.iid || inst.id), function(card){ return card && card.rarity !== 'star'; });
      if(returned.length) {
        toast('Shovel returned ' + returned.length + ' random card' + (returned.length === 1 ? '' : 's') + ' to the deck.');
      } else {
        toast('There are no cards in your discard pile to return.');
      }
      await waitForEffectPresentationBeforeChoice();
      showSnowShovelerReturnedCards(returned, cp);
      renderEffectResolutionForPlayer(cp, {hand:false, piles:true});
      break;
    }
    case '97': { // Visegrad Politician: opponent's next two consolidations cost +1
      if(typeof activateAdministrativeBloat === 'function') activateAdministrativeBloat(cp, inst);
      toast('Administrative Bloat: the opponent\'s next two consolidations cost 1 extra Reinforcement.');
      if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
      renderEffectResolutionForPlayer(cp, {hand:false, topbar:true});
      break;
    }
    case '53': // Colombo Thug: restricts opponent consolidation (continuous, checked in doConsolidate)
      break;
    case '54': { // Wolf Creek: same-zone friendly card picker
      pickWolfCreekMoveCandidate(inst, 'Wolf Creek: Select a highlighted friendly card in this zone to move:', (tgt,tz,tr,tc)=>{
        startWolfCreekMove(tgt, tz, tr, tc, inst);
      }, z);
      break;
    }
    case '56': // Lydia: negate opponent card effect activations (3 uses)
      inst.usesLeft = 3; break;
    case '40': // Christopher Erbs: initialize 2 uses
      inst.usesLeft = 2; break;
    case '14': // Alondra Hopkins: discard adjacent OR diagonal opponent supporters when set
      {
        const adjCards = getAdjacentAndDiagonalCards(z,r,c);
        let gained = 0;
        adjCards.forEach(({card:ac,z:az,r:ar,c:ac2})=>{
          if(ac.owner===opp && (typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(ac, opp) : ac.type==='Supporter') && !(typeof isTargetImmuneToEffectOwner === 'function' ? isTargetImmuneToEffectOwner(ac, cp) : (typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(ac)))){
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

function getAdjacentBoardSquareEntries(z, r, c) {
  const entries = [];
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  dirs.forEach(function(dir){
    const rr = r + dir[0];
    const cc = c + dir[1];
    if(!G || !G.board || !G.board[z] || !G.board[z][rr]) return;
    const rowCap = typeof getBoardRowCapacity === 'function' ? getBoardRowCapacity(z, rr) : Math.max(3, G.board[z][rr].length || 0);
    if(cc < 0 || cc >= rowCap) return;
    entries.push({
      z,
      r:rr,
      c:cc,
      card:G.board[z][rr][cc] || null,
      squareOnly:true
    });
  });
  return entries;
}

function isSameBoardSquare(a, b) {
  return !!(a && b && a.z === b.z && a.r === b.r && a.c === b.c);
}

function isAdjacentBoardSquare(a, b) {
  if(!a || !b || a.z !== b.z) return false;
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

function normalizeHenrySuppressionSquares(card) {
  return Array.isArray(card && card._henrySuppressionSquares)
    ? card._henrySuppressionSquares.filter(function(sq){
      return sq && Number.isInteger(sq.z) && Number.isInteger(sq.r) && Number.isInteger(sq.c);
    }).slice(0, 2)
    : [];
}

function applyHenryDongSuppressionSquares(card, chosen, z, r, c) {
  if(!card) return false;
  if(card.effectUsedInitial || normalizeHenrySuppressionSquares(card).length) {
    toast('Henry Dong has already selected suppression squares.');
    if(typeof playSfx === 'function') playSfx('blocked');
    return false;
  }
  const squares = (chosen || []).filter(Boolean).slice(0, 2).map(function(entry){
    return { z:entry.z, r:entry.r, c:entry.c };
  });
  if(!squares.length) return false;
  card._henrySuppressionSquares = squares;
  card._henrySuppressionTurn = G ? G.turn : 0;
  card.effectUsedInitial = true;
  const count = squares.length;
  if(typeof playSfx === 'function') playSfx('effectSuppressed');
  toast('Henry Dong is suppressing opponent Coordinator effects on ' + count + ' adjacent square' + (count === 1 ? '' : 's') + '.');
  renderEffectResolutionForPlayer(card.owner ?? G.currentPlayer, {board:true, hand:false, scores:true});
  return true;
}

function chooseHenryDongAiSquares(card, entries) {
  const owner = card && (card.owner === 0 || card.owner === 1) ? card.owner : G.currentPlayer;
  const scoreEntry = function(entry) {
    const target = entry && entry.card;
    if(target && target.owner !== owner && !isEffectImmuneSource(target)) {
      if(target.type === 'Coordinator') return 0;
      if(target.type === 'Supporter') return 1;
      return 2;
    }
    if(!target) return 4;
    return 8;
  };
  return (entries || []).slice().sort(function(a, b){
    const score = scoreEntry(a) - scoreEntry(b);
    if(score) return score;
    return (a.r - b.r) || (a.c - b.c);
  }).slice(0, 2);
}

function activateHenryDongSuppression(card, z, r, c, opts = {}) {
  if(card && (card.effectUsedInitial || normalizeHenrySuppressionSquares(card).length)) {
    toast('Henry Dong has already selected suppression squares.');
    if(typeof playSfx === 'function') playSfx('blocked');
    return Promise.resolve(false);
  }
  if(card && card._henrySuppressionPicking) {
    toast('Henry Dong is already choosing suppression squares.');
    if(typeof playSfx === 'function') playSfx('blocked');
    return Promise.resolve(false);
  }
  const livePos = typeof findBoardPositionForCard === 'function' ? findBoardPositionForCard(card) : null;
  const az = livePos && Number.isInteger(livePos.z) ? livePos.z : z;
  const ar = livePos && Number.isInteger(livePos.r) ? livePos.r : r;
  const ac = livePos && Number.isInteger(livePos.c) ? livePos.c : c;
  const entries = getAdjacentBoardSquareEntries(az, ar, ac);
  if(!entries.length) {
    toast('Henry Dong has no adjacent squares to suppress.');
    return Promise.resolve(false);
  }
  const owner = card && (card.owner === 0 || card.owner === 1) ? card.owner : G.currentPlayer;
  const shouldAutoChoose = opts.auto === true || (G && G.aiEnabled && owner === G.aiPlayer);
  if(shouldAutoChoose) {
    return Promise.resolve(applyHenryDongSuppressionSquares(card, chooseHenryDongAiSquares(card, entries), az, ar, ac));
  }
  if(typeof showBoardTargetPicker !== 'function') {
    toast('Square picker unavailable.');
    return Promise.resolve(false);
  }
  return new Promise(function(resolve){
    if(card) card._henrySuppressionPicking = true;
    const finish = function(value){
      if(card) delete card._henrySuppressionPicking;
      resolve(value);
    };
    showBoardTargetPicker({
      title:typeof getMultiplayerBoardPromptTitle === 'function' ? getMultiplayerBoardPromptTitle(card) : 'The Last Revolution',
      prompt:'Select up to 2 adjacent squares. Opponent Coordinator effects on those squares are suppressed while Henry Dong remains on the field.',
      entries,
      zones:[az],
      maxCount:2,
      confirmLabel:'Suppress Squares',
      emptySelectionMessage:'Select at least one adjacent square',
      allowSquareTargets:true,
      onCancel:function(){ finish(false); }
    }, function(chosen){
      finish(applyHenryDongSuppressionSquares(card, chosen, az, ar, ac));
    });
  });
}

async function triggerCharacterEffect(card, z, r, c, opts = {}) {
  closeModal();
  const cp = G.currentPlayer;
  const opp = 1-cp;
  const id = getCardRuntimeEffectId(card);
  const reusableCopiedEffect = String(card.id || '') === 'bh05' && (id === '38' || id === '40');

  if(isFaceDownCard(card)){
    toast('Flip this card face up first');
    playSfx('blocked');
    return;
  }

  if(typeof isWhisperOfTheHeartToken === 'function' && isWhisperOfTheHeartToken(card)) {
    toast('Shizuku is already applying ' + String(card._whisperCopiedAbility || 'its copied Coordinator effect') + ' field-wide.');
    return;
  }

  if(typeof isCardEffectSuppressed === 'function' && isCardEffectSuppressed(card, z, r, c)){
    toast(card.name + "'s effect is suppressed.");
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

  // Initiators: fire ONCE (on placement). If already used, don't fire again.
  // Coordinators: passive/continuous or once per placement.
  // Dauntless: most have ongoing/active effects; handled case-by-case below.
  // Improvisors: triggered/reactive.
  if(card.type==='Initiator' && card.effectUsedInitial && card._effectTurnLocked && !reusableCopiedEffect){
    toast(card.name + "'s Initiator effect already activated.");
    return;
  }
  if(card.type==='Initiator' && INITIAL_SET_INITIATOR_IDS.has(id) && !AUTHORITATIVE_ACTIVATE_EFFECT_IDS.has(id) && !opts.fromSet && !isSameTurnAsCardSet(card)){
    toast(card.name + "'s Initiator effect can only activate on the turn it was set.");
    return;
  }
  if(card.type==='Coordinator' && card.effectUsedInitial && !['01','11','15','19','23','57'].includes(id)){
    toast(`${card.name}'s effect already activated.`);
    return;
  }
  if(card._effectActivationInFlight){
    toast(`${card.name}'s effect is already resolving.`);
    return;
  }
  card._effectActivationInFlight = true;
  const clearEffectActivationInFlight = ()=>{
    if(card) delete card._effectActivationInFlight;
  };

  // Manual activation feedback resolves before prompts or effect windows open.
  const isPassiveOnly = card.type==='Coordinator' && ['01','10','11','15','19','23','34','57'].includes(id);
  if(!opts.fromSet && !isPassiveOnly && typeof playEffectActivationCinematic === 'function') {
    try {
      await playEffectActivationCinematic(card, z, r, c, {source:opts.autoActivation ? 'automatic-character' : 'manual-character'});
    } catch(e) {
      clearEffectActivationInFlight();
      throw e;
    }
    clearEffectActivationInFlight();
    if(typeof G !== 'undefined' && G) G._allowImmediateEffectPickerUntil = Date.now() + 1400;
  }
  if(typeof updateDailyChallengeProgress === 'function' && !opts.fromSet && !(G.aiEnabled && cp === G.aiPlayer) && !G._isSpectator){
    updateDailyChallengeProgress('effects', 1, 'add');
  }
  if(!opts.fromSet && card.type === 'Supporter' && AUTHORITATIVE_ACTIVATE_EFFECT_IDS.has(id)) {
    const allowed = await beginManualSupporterEffectActivation(
      card,
      z,
      r,
      c,
      getSupporterEffectAffectedOwners(card, z, r, c, cp, opp)
    );
    if(!allowed) {
      clearEffectActivationInFlight();
      return;
    }
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
      clearEffectActivationInFlight();
      return;
    }
  }
  if(card.type==='Initiator' && INITIAL_SET_INITIATOR_IDS.has(id)) {
    markInitialEffectResolved(card);
  }

  switch(id) {
    // Initiators
    case 'bh04':
      chooseDestructionOfParadiseType(card, z, cp);
      break;
    case 'bh05':
      await chooseTaylorCopiedEffect(card, z, r, c, cp);
      break;
    case 'bh06':
      activateAchillesAdaptiveTactics(card, cp);
      break;
    case '03': // Howard: double Fate of card in zone, then +5
      pickCardInZone(z,'Select a card to double its current Fate, then gain +5:',(tgt)=>{
        if(typeof isTargetImmuneToEffectOwner === 'function' ? isTargetImmuneToEffectOwner(tgt, cp) : (typeof isFullyEffectImmuneCard === 'function' ? isFullyEffectImmuneCard(tgt) : (tgt.immuneFlag || tgt.id==='76'))){showBlockedAnimation('this card is immune');return;}
        const before = Number(tgt.currentFate ?? tgt.fate ?? 0) || 0;
        tgt.currentFate = Math.max(0, Math.ceil(before * 2) + 5);
        log(cp===0?'p1':'p2',`Moffitt Inspiration: ${tgt.name} Fate became ${tgt.currentFate}`);
        markInitialEffectResolved(card);
        renderEffectResolutionForPlayer(cp, {hand:false});
      },c=>!(typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(c)), null, card); break;
    case '04': // Zoe: block opponent consolidation on or from one square
      highlightForBlock(z, card); break;
    case '06': // Jorge Alvarez: search deck for non-star card
      searchDeckForCard(cp, c=>c.rarity!=='star','Search deck (no Stars):', inst=>{
        if(typeof addCardToHand==='function') addCardToHand(cp, inst);
        else G.players[cp].hand.push(inst);
        toast('Added '+inst.name+' to hand');
        renderHand();
      }, {sourceCardId:'06'}); break;
    case '07': { // Maja Kaminska: add up to 3 deck supporters, buff them, then +2 supporter plays this turn
      const matches = G.players[cp].deck.filter(c=>typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(c, cp) : c.type==='Supporter');
      // The supporter search is optional. Grant Maja's placement bonus as soon
      // as her effect activates so choosing zero cards or closing the picker
      // cannot discard this independent part of Oblique Order.
      G.extraSupportsThisTurn = (Number(G.extraSupportsThisTurn) || 0) + 2;
      toast('Maja unlocked 2 extra Supporter placements this turn!');
      updateTopBar();
      if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
      if(!matches.length){
        renderHand();
        break;
      }
      const openMajaSearch = function(){
        pickCardsVisual(matches, {
          title:'Oblique Order',
          subtitle:'Choose up to 3 Supporters from your deck. They gain +4 Fate permanently.',
          maxCount:3,
          confirmLabel:'Add to Hand',
          immediate:true,
          opponentSearch:true,
          searchingPlayer:cp,
          searchSourceCardId:'07'
        }, (chosen)=>{
          const baseHandIndex = G.players[cp].hand.length;
          const addedCards = [];
          chosen.forEach((c, idx)=>{
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
            if(typeof queueSearchToHandMotion === 'function') queueSearchToHandMotion(cp, c, 'deck', baseHandIndex + idx, idx, chosen.length);
            if(typeof addCardToHand==='function') addCardToHand(cp, c, {arrivalKind:'search'});
            else G.players[cp].hand.push(c);
            G.players[cp].deck = G.players[cp].deck.filter(x=>x.iid!==c.iid);
            addedCards.push(c);
          });
          if(chosen.length) shuffle(G.players[cp].deck);
          if(chosen.length) toast('Maja added '+chosen.length+' Supporter'+(chosen.length===1?'':'s')+' with +4 Fate!');
          renderEffectResolutionForPlayer(cp, {hand:true, piles:true});
          if(addedCards.length && typeof resolveBoleslawAfterSearchSelection === 'function') {
            return resolveBoleslawAfterSearchSelection(cp, addedCards, {sourceCardId:'07'});
          }
        });
      };
      openMajaSearch();
    } break;
    case '08': // Lina: search Reality card from deck/discard, set for free
      searchAnySource(cp,c=>c.aff==='reality','Search for a Reality card:',(found)=>{
        if(typeof addCardToHand==='function') addCardToHand(cp, found);
        else G.players[cp].hand.push(found);
        beginImmediateFreePlacement(cp, found, 'Place ' + found.name + ' for free from Lina\'s effect.', {
          key:'lina-free-set',
          name:'Lina',
          ability:'Autistic Femcel Rizz',
          text:'Autistic Femcel Rizz: this card can be set immediately for free.'
        });
        toast(found.name+' is ready to set immediately for free!');
      }, {sourceCardId:'08'}); break;
    case '13': // Johnathan Kirby: search deck for 2 supporters
      searchDeckForType(cp,'Supporter','Search for up to 2 Supporters:',2,{sourceCardId:'13'}); break;
    case '22': // Isaac Perez: choose up to 2 controlled cards in this zone; +3 Fate permanently
      pickMultipleInZone(z,2,'Isaac Perez: Select up to 2 cards you control in this zone to gain +3 Fate permanently:',(targets)=>{
        if(!targets || !targets.length){toast('No cards selected');return;}
        const isaacTargets = [];
        targets.forEach(function(t, idx){
          const target = t && (t.card || t);
          if(target && target.owner === cp) {
            isaacTargets.push({target:target, index:idx});
            modifyFate(target,3,'permanent');
            if(typeof flashCardEffect === 'function') {
              flashCardEffect(target, 'isaac_beaker', {
                label:'scientific inquiry',
                soundKey:'isaac:' + String(card && (card.iid || card.id) || 'card') + ':' + String(target.iid || target.id || idx) + ':' + String(G.turn || 0)
              });
            }
          }
        });
        toast('Isaac increased '+isaacTargets.length+' card'+(isaacTargets.length===1?'':'s')+' by +3 Fate permanently');
        markInitialEffectResolved(card);
        renderEffectResolutionForPlayer(cp, {hand:false});
      },c=>c.owner===cp, null, card); break;
    case '81': { // Wojciech: counters equal opponent placements last turn
      ensureWojciechPlacementCounts();
      const count = Math.max(0, Number(G._wojciechLastTurnPlacementCounts[opp]) || 0);
      const added = grantWojciechPierogiCounters(cp, count, card);
      toast(added ? ('Pierogi Barrage added ' + added + ' Pierogi Counter' + (added === 1 ? '' : 's') + ' to your hand.') : 'Pierogi Barrage found no opponent placements from last turn.');
      log(cp===0?'p1':'p2','Wojciech created ' + added + ' Pierogi Counter' + (added === 1 ? '' : 's'));
      renderEffectResolutionForPlayer(cp, {hand:true});
      break;
    }
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
      const currentLandscapeBlock = typeof getFelicitaLandscapeChangeBlockReason === 'function' ? getFelicitaLandscapeChangeBlockReason('') : '';
      if(currentLandscapeBlock) {
        if(typeof showFelicitaLandscapeChangeBlockedBanner === 'function') showFelicitaLandscapeChangeBlockedBanner(currentLandscapeBlock);
        break;
      }
      await new Promise(function(resolve){
        let settled = false;
        const finishChoice = function(value){
          if(settled) return;
          settled = true;
          resolve(value);
        };
        showLandscapeChoiceModal(0, function(song){
          const previousLandscapeId = String(G.landscapeId || '');
          const changed = transitionGameLandscape(song, {player:cp, sourceCard:card});
          if(changed !== false) {
            ignoreBattleOfPellaThresholdsReachedBeforeEntry(previousLandscapeId);
            renderGame({board:true, scores:true, landscape:true, topbar:true});
          }
          finishChoice(changed !== false);
        }, {
          committed:false,
          sourceCard:card,
          player:cp,
          onCancel:function(){ finishChoice(false); }
        });
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
      card.effectUsedInitial = true;
      card._effectTurnLocked = true;
      await drawCard(cp,3,{afterSetOrCinematic:true, activatedDrawEffect:true, effectSource:card});
      toast('Drew 3 cards');
      renderHand(); break;
    case '29': // Dylan Kirby: choose up to 2 Third Great War from deck or discard
      {
        const recoverableTgw = typeof getRecoverableDiscardCards === 'function' ? getRecoverableDiscardCards(cp, c=>c.aff==='third_great_war') : G.players[cp].discard.filter(c=>c.aff==='third_great_war');
        const from=[...G.players[cp].deck.filter(c=>c.aff==='third_great_war'),...recoverableTgw];
        if(!from.length){toast('No Third Great War cards available');break;}
        const openDylanSearch = function(){
          pickCardsVisual(from, {
            title:'Leader of the Free World',
            subtitle:'Choose up to 2 Third Great War cards to add to your hand',
            maxCount:2,
            confirmLabel:'Add to Hand',
            immediate:true,
            opponentSearch:true,
            searchingPlayer:cp,
            searchSourceCardId:'29'
          }, (chosen)=>{
            const baseHandIndex = G.players[cp].hand.length;
            const addedCards = [];
            chosen.forEach((c, idx)=>{
              const source = G.players[cp].deck.some(x=>x && x.iid===c.iid) ? 'deck' : 'discard';
              if(typeof queueSearchToHandMotion === 'function') queueSearchToHandMotion(cp, c, source, baseHandIndex + idx, idx, chosen.length);
              if(typeof addCardToHand==='function') addCardToHand(cp, c, {arrivalKind:'search'});
              else G.players[cp].hand.push(c);
              G.players[cp].deck=G.players[cp].deck.filter(x=>x.iid!==c.iid);
              G.players[cp].discard=G.players[cp].discard.filter(x=>x.iid!==c.iid);
              addedCards.push(c);
            });
            if(chosen.length) toast(`Added ${chosen.length} card(s) to hand`);
            shuffle(G.players[cp].deck);
            renderEffectResolutionForPlayer(cp, {hand:true, piles:true});
            if(addedCards.length && typeof resolveBoleslawAfterSearchSelection === 'function') {
              return resolveBoleslawAfterSearchSelection(cp, addedCards, {sourceCardId:'29'});
            }
          });
        };
        openDylanSearch();
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
      },(c,tz,tr)=>c.owner===opp && tr===1 && !(typeof isTargetImmuneToEffectOwner === 'function' ? isTargetImmuneToEffectOwner(c, cp) : (typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(c))), null, card); break;
    case '39': // Juan Carlos: move opponent's card from ANY zone to open spot
      pickCardFromAnyZone('Select opponent\'s card to move:',(tgt,tz,tr,tc)=>{
        if(tgt.owner===cp){toast('Select opponent card');return;}
        if(typeof isTargetImmuneToEffectOwner === 'function' ? isTargetImmuneToEffectOwner(tgt, cp) : (tgt.immuneFlag || tgt.id==='76')){showBlockedAnimation('this card is immune');return;}
        showMoveTarget(tgt,tz,tr,tc,z,{
          title:'Juan Carlos',
          prompt:`Move ${tgt.name} into Juan Carlos' current zone`,
          horizontalZones:true,
          disallowRows:[cp===0 ? 2 : 0],
          sourceCard:card
        });
      },c=>c.owner===opp && !(typeof isTargetImmuneToEffectOwner === 'function' ? isTargetImmuneToEffectOwner(c, cp) : (c.immuneFlag || c.id==='76'))); break;
    case '43': { // Mark Kemper: choose one extra safe cell in this zone
      closeModal();
      const markChoiceRow = typeof getMarkSafeSquareChoiceRow === 'function' ? getMarkSafeSquareChoiceRow(z, cp) : (typeof getNextExtraRowIndex === 'function' ? getNextExtraRowIndex(z) : 3);
      if(markChoiceRow < 3){
        toast('Mark Kemper has no remaining safe-square slots in this row.');
        break;
      }
      const markStartSnap = {
        board: typeof getBoardScrollSnapshot === 'function' ? getBoardScrollSnapshot() : null,
        zones: typeof captureZoneRowScrollSnapshots === 'function' ? captureZoneRowScrollSnapshots() : null
      };
      G._markViewportSnap = markStartSnap;
      G._markSelecting = { player: cp, sourceIid: card.iid, zone: z, row: markChoiceRow };
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
    case '48': // Cosmic GF: add Expanded Worlds from deck, then non-Star Expanded Worlds from discard
      addAffFromDeckDiscard(cp,'expanded_worlds',{sourceCardId:'48'}); break;
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
    case '87': { // Kvetka Svoboda (Ukulele): immediate consolidation ballad
      const effects = ensureBalladState();
      const pitchStep = nextKvetkaBalladPitchStep(cp);
      effects[cp].push({active:true, ended:false, sourceIid:card.iid, activatedTurn:G.turn, pitchStep});
      flashCardEffect(card, 'kvetka_ballad', {
        label:'A Noble Effort at a Ballad',
        soundKey:'kvetka-ballad-activate:' + String(cp) + ':' + String(G.turn || 0) + ':' + String(card.iid || card.id),
        pitchStep,
        waitForConsolidationCinematic:true
      });
      toast('A Noble Effort at a Ballad is active: your consolidations gain 3 Fate until you set a Supporter.');
      if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
      break;
    }
    case '99': {
      activateBlameGameEffect(cp, card);
      card.effectUsedInitial = true;
      renderEffectResolutionForPlayer(cp, {hand:false});
      break;
    }
    case '90': { // Wojciech (Fisherman): declare affiliation, draw 2 random matching cards and give them +3 Fate
      showAffiliationPickerVisual((aff)=>{
        if(typeof triggerJoieDrawEffectPassive === 'function') triggerJoieDrawEffectPassive(cp, {sourceCard:card});
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
          const beforeFate = Math.max(0, Number(found.currentFate ?? found.fate) || 0);
          found.currentFate = beforeFate + 3;
          if(typeof recordHandCardEffectModifier === 'function' && !(typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(found))) {
            recordHandCardEffectModifier(found, {
              key:'wojciech-fisherman:' + (card.iid || card.id || 'source'),
              name:'Catch of the Day',
              text:'Catch of the Day: this card gained 3 Fate when Wojciech caught it.',
              fateDelta:3
            });
          }
          if(typeof addCardToHand==='function') addCardToHand(cp, found);
          else G.players[cp].hand.push(found);
        });
        toast('Catch of the Day added '+chosen.length+' '+(AFF_LABEL[aff]||aff)+' card'+(chosen.length===1?'':'s')+' and gave '+(chosen.length===1?'it':'them')+' +3 Fate.');
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
          if(!(typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(t.card))) {
            t.card.immuneFlag=true;
            t.card._immuneByMakenna=true;
          }
        });
        card.effectUsedInitial = true;
        toast('Selected cards are now immune');
        renderEffectResolutionForPlayer(cp, {hand:false});
      }, c=>c.owner===cp && !(typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(c)), null, card); break;
    case '15': // Zsofia Szocs: automatic Coordinator-set trigger
      toast('Blue Danube Waltz triggers automatically when you set a Coordinator in Zsofia\'s zone.');
      break;
    case '19': // Květka Svoboda: passive (handled in getEffectiveFate)
      toast('The Vltava\'s Story is passive — applies while Květka is on the field.');
      break;
    case '23': // Cathy: passive (handled in getEffectiveFate)
      toast('Cardigan Onslaught is passive — applies while Cathy is on the field.');
      break;
    case '34': // Rozsi Szocs: passive - cards moved into zone gain 3 Fate
      toast('Hungarian Dance is passive — cards moved into this zone by effects gain 3 Fate automatically.');
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
    case '21': { // Henry Dong: choose adjacent squares that suppress opponent effects
      const applied = await activateHenryDongSuppression(card, z, r, c, opts);
      if(!applied) {
        clearEffectActivationInFlight();
        return;
      }
      break;
    }
    case '38': { // Jake: discard a field Supporter, +4 Fate (once per turn)
      if(card.effectUsedThisTurn){toast('Jake can only use this effect once per turn');break;}
      const supporters = [];
      (G.board || []).forEach(function(zone, tz){
        (zone || []).forEach(function(row, tr){
          (row || []).forEach(function(fieldCard, tc){
            if(!fieldCard || fieldCard.owner !== cp || String(fieldCard.id || '') === '76') return;
            const validSupporter = typeof isCardSupporterForRules === 'function'
              ? isCardSupporterForRules(fieldCard, cp)
              : fieldCard.type === 'Supporter';
            if(validSupporter) supporters.push({card:fieldCard, z:tz, r:tr, c:tc});
          });
        });
      });
      if(!supporters.length){toast('No Supporter on your field to discard');break;}
      await new Promise(function(resolve){
        showBoardTargetPicker({
          title:typeof getMultiplayerBoardPromptTitle === 'function' ? getMultiplayerBoardPromptTitle(card) : 'Jake — I\'m Fat',
          prompt:'Choose one of your Supporters on the field to discard. Jake permanently gains 4 Fate.',
          entries:supporters,
          zones:[0,1,2],
          maxCount:1,
          confirmLabel:'Discard Supporter',
          showZoneTitles:true,
          pickerClass:'jake-field-picker',
          onCancel:resolve
        }, function(chosen){
          const spent = chosen && chosen[0];
          if(!spent || !spent.card){resolve();return;}
          const liveSpent = G.board?.[spent.z]?.[spent.r]?.[spent.c] || null;
          if(!liveSpent || (spent.card.iid && liveSpent.iid !== spent.card.iid) || liveSpent.owner !== cp){
            toast('That Supporter is no longer on the field.');
            resolve();
            return;
          }
          const liveJake = G.board?.[z]?.[r]?.[c] || null;
          const jake = liveJake && cardActsAsPassive(liveJake, '38') && (!card.iid || !liveJake.iid || String(liveJake.iid) === String(card.iid))
            ? liveJake
            : card;
          discardBoardCard(liveSpent, spent.z, spent.r, spent.c);
          modifyFate(jake, 4, 'permanent', cp);
          jake.effectUsedThisTurn = true;
          if(jake !== card) card.effectUsedThisTurn = true;
          toast('Jake gained 4 Fate!');
          log(cp===0?'p1':'p2', 'Jake discarded '+liveSpent.name+' from Zone '+(spent.z+1)+' and gained 4 Fate');
          renderEffectResolutionForPlayer(cp, {hand:false, piles:true});
          resolve();
        });
      });
      break;
    }
    case 'bh25': // Jimmy Viltrumite: discard any card on field
      showModal('Left Hook of the Incel','Select any card on the field to discard:',
        [{label:'Choose Target',action:()=>{closeModal();pickAnyBoardCard(cp,(tgt,tz,tr,tc)=>{
          discardBoardCard(tgt,tz,tr,tc);
          toast('Discarded '+tgt.name);
          renderEffectResolutionForPlayer(cp, {hand:false, piles:true});
        });}},{label:'Cancel',action:closeModal}]); break;

    // Improvisors
    case '40': // Christopher Erbs: next draw gains 6 Fate
      if(card.usesLeft>0){
        if(!Array.isArray(G.erbsActive)) G.erbsActive = [false, false];
        if(G.erbsActive[cp]) { toast('Christopher Erbs is already waiting for your next draw.'); break; }
        G.erbsActive[cp] = true;
        card.usesLeft--;
        toast('Next card drawn gains 6 Fate! ('+(card.usesLeft)+' uses left)');
      } else toast('No uses remaining.'); break;
    case '56': // Lydia: negate opponent effect activations (3 uses)
      if(card.usesLeft>0){
        toast('Lydia is ready to negate an opponent effect activation ('+card.usesLeft+' uses remaining).');
      } else toast('No uses remaining.'); break;
    case '17': // Carolyn: block any open cell permanently
      {
        highlightForBlock(-1, card);
      } break;
    case '14': // Alondra Hopkins: on-set only, not re-activatable
      toast('Alondra\'s effect only fires when she is first set.');
      break;
    case 'bh01': // Anicka Voyager: move to any open cell, draw 1 (once per turn)
      {
        if(!beginAnickaVoyagerMove(card, z, r, c)) {
          clearEffectActivationInFlight();
          return;
        }
      } break;

    default:
      toast('Effect: '+card.effect);
  }
  // Mark this character's effect as activated (fires once)
  card.effectUsedInitial = true;
  if(card.type === 'Initiator' && !reusableCopiedEffect) card._effectTurnLocked = true;
  clearEffectActivationInFlight();
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const MANUAL_EFFECT_BLOCKED_CARD_IDS = new Set([
  '14',
  '35',
  '41',
  '45',
  '46',
  '55',
  '61',
  '84',
  '85',
  '88',
  '89',
  '99',
  '100'
]);

// Player-timed/repeatable actions remain buttons even when ordinary when-set
// effects are configured to resolve automatically.  In particular,
// Christopher Erbs chooses when to arm the *next* draw; setting him is not the
// activation decision.
function canUseManualCharacterEffect(card) {
  if(!card) return false;
  const id = getCardRuntimeEffectId(card);
  if(MANUAL_EFFECT_BLOCKED_CARD_IDS.has(id)) return false;
  if(G && G._onlineRoomCode && (
    card._effectActivationInFlight ||
    G._serverPendingReaction ||
    G._serverPendingMove ||
    G._serverPendingZonePick ||
    G._serverPendingCardPick ||
    G._serverPendingModalAction ||
    G.pendingInteraction
  )) return false;
  if(id === '40') return Number(card.usesLeft || 0) > 0;
  if(id === '38') return card.effectUsedThisTurn !== true;
  if(id === 'bh01') return !hasAnickaVoyagerMovedThisTurn(card);
  if(AUTHORITATIVE_ACTIVATE_EFFECT_IDS.has(id)) {
    // Snowball Fight keeps its dedicated supporter action and label below.
    if(id === '93') return false;
    return card.effectUsedInitial !== true;
  }
  if(card.type === 'Supporter') return false;
  if(id === '21') {
    if(card.effectUsedInitial || normalizeHenrySuppressionSquares(card).length) return false;
    try { return !(typeof isCardEffectSuppressed === 'function' && isCardEffectSuppressed(card)); } catch(e) { return true; }
  }
  if(card.type === 'Coordinator') return false;
  if(card.type === 'Improvisor') return false;
  return false;
}

function automaticBoardEffectsEnabled(){
  try { return window.fateAutoActivateEffectsEnabled?.() === true; } catch(error) { return false; }
}

let automaticBoardEffectTimer = null;
let automaticBoardEffectBusy = false;
const automaticBoardEffectAttempted = new Set();
function queueAutomaticBoardEffectResolution(reason){
  if(!automaticBoardEffectsEnabled() || !G || G._phase7CurrentMultiplayer === true) return false;
  if(automaticBoardEffectTimer || automaticBoardEffectBusy) return false;
  automaticBoardEffectTimer = setTimeout(async function(){
    automaticBoardEffectTimer = null;
    if(!automaticBoardEffectsEnabled() || !G || G._phase7CurrentMultiplayer === true
      || G.phase !== 'main' || G.pendingInteraction || G._consolidating
      || G._effectActivationCinematicActive || G._onlineSetResolutionInFlight) return;
    const player = G.currentPlayer;
    if(G.aiEnabled && player === G.aiPlayer) return;
    let candidate = null;
    for(let z = 0; z < (G.board || []).length && !candidate; z += 1){
      for(let r = 0; r < (G.board[z] || []).length && !candidate; r += 1){
        for(let c = 0; c < (G.board[z][r] || []).length; c += 1){
          const card = G.board[z][r][c];
          if(!card || Number(card.owner) !== Number(player) || !canUseManualCharacterEffect(card)) continue;
          if(window.fateEffectRequiresManualActivationId?.(card)
            || window.fateEffectRequiresManualActivationId?.(getCardRuntimeEffectId(card))) continue;
          const key = [G.turn, player, card.iid || card.id, z, r, c].join(':');
          if(automaticBoardEffectAttempted.has(key)) continue;
          candidate = {card, z, r, c, key};
          break;
        }
      }
    }
    if(!candidate) return;
    automaticBoardEffectAttempted.add(candidate.key);
    if(automaticBoardEffectAttempted.size > 800) automaticBoardEffectAttempted.clear();
    automaticBoardEffectBusy = true;
    try {
      await triggerCharacterEffect(candidate.card, candidate.z, candidate.r, candidate.c, {autoActivation:true, autoReason:reason || 'automatic'});
    } catch(error) {
      console.warn('Automatic board effect failed open', error);
    } finally {
      automaticBoardEffectBusy = false;
    }
  }, 0);
  return true;
}
window.fateQueueAutomaticBoardEffectResolution = queueAutomaticBoardEffectResolution;

function shouldShowManualCharacterEffectButton(card) {
  if(!card) return false;
  if(G && G._phase7CurrentMultiplayer === true && typeof window.fatePhase7CanActivateSource === 'function') {
    return window.fatePhase7CanActivateSource(card.iid);
  }
  if(window.fateEffectRequiresManualActivationId?.(card)) return canUseManualCharacterEffect(card);
  if(automaticBoardEffectsEnabled()) return false;
  return canUseManualCharacterEffect(card);
}

// Keep the board's purple activation border in lockstep with the card modal.
// This includes deferred when-set effects as well as Characters (for example
// Henry) whose manual Activate Effect button does not use the deferred marker.
function canShowBoardActivateEffect(card, z, r, c, player) {
  if(!card || isFaceDownCard(card) || !G) return false;
  const actionPlayer = Number.isInteger(player)
    ? player
    : (G._onlineRoomCode && Number.isInteger(G._onlinePlayerIndex)
      ? G._onlinePlayerIndex
      : (typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : G.currentPlayer));
  if(!Number.isInteger(actionPlayer)
    || card.owner !== actionPlayer
    || G.currentPlayer !== actionPlayer
    || G.phase !== 'main'
    || G._isSpectator
    || G._onlineRole === 'spectator') return false;
  if(G._phase7CurrentMultiplayer === true && typeof window.fatePhase7CanActivateSource === 'function') {
    return window.fatePhase7CanActivateSource(card.iid);
  }
  if(typeof canActivatePendingWhenSetEffect === 'function'
    && canActivatePendingWhenSetEffect(card, z, r, c, actionPlayer)) return true;
  if(shouldShowManualCharacterEffectButton(card)) return true;
  const copiedSnowball = typeof cardActsAsPassive === 'function' && cardActsAsPassive(card, '93');
  const copiedExpeditionary = typeof cardActsAsPassive === 'function' && cardActsAsPassive(card, '73');
  if(!(typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(card, actionPlayer) : card.type === 'Supporter') && !copiedSnowball && !copiedExpeditionary) return false;
  const supporterSuppressed = typeof isSupporterEffectSuppressed === 'function'
    && isSupporterEffectSuppressed(card);
  if(supporterSuppressed) return false;
  const id = getCardRuntimeEffectId(card);
  if(id === '52') {
    return !!card._pendingWhenSetEffect
      && (typeof canActivateVigilantesWindow === 'function'
        ? canActivateVigilantesWindow(card)
        : card.whenSetActivated !== true);
  }
  if(cardActsAsPassive(card, '73')) return !!card._canMoveOncePerTurn && !card._expMoved;
  if(typeof cardActsAsPassive === 'function' ? cardActsAsPassive(card, '93') : id === '93') {
    return card.effectUsedThisTurn !== true;
  }
  return false;
}
window.canShowBoardActivateEffect = canShowBoardActivateEffect;

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

function preparePlacementFateReveal(inst, sourceCard, mode) {
  if(!inst) return inst;
  const source = sourceCard || inst;
  let fromValue = Math.max(0, Number(source.currentFate ?? source.fate ?? inst.fate ?? 0) || 0);
  if(source._wciBonus && !(typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(source))) {
    fromValue += 2;
  }
  inst._placementFateReveal = {
    fromValue,
    mode:String(mode || 'set'),
    createdAt:Date.now(),
    genericSoundRequested:Number(inst.currentFate ?? inst.fate ?? 0) !== fromValue,
    kvetkaGainAmount:0
  };
  return inst;
}
if(typeof window !== 'undefined') window.preparePlacementFateReveal = preparePlacementFateReveal;

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

function capEffectiveFateForPermanentDebuff(card, value) {
  const total = Math.max(0, Number(value) || 0);
  if(!card) return total;
  const ceiling = Number(card._permanentFateCeiling);
  return Number.isFinite(ceiling) ? Math.min(total, Math.max(0, ceiling)) : total;
}

function applyPermanentFateDebuff(card, amount, sourceOwner) {
  if(typeof applyPermanentEffectImmunity === 'function') applyPermanentEffectImmunity(card);
  if(!card || (typeof isTargetImmuneToEffectOwner === 'function' ? isTargetImmuneToEffectOwner(card, sourceOwner) : (card.immuneFlag || card.id === '76'))) return false;
  const loss = Math.max(0, Number(amount) || 0);
  if(!loss) return false;
  const pos = typeof getBoardCardPosition === 'function' ? getBoardCardPosition(card) : null;
  const before = pos ? getEffectiveFate(card, pos.z) : Math.max(0, Number(card.currentFate ?? card.fate) || 0);
  const storedBefore = Math.max(0, Number(card.currentFate ?? card.fate) || 0);
  const storedAfter = Math.max(0, storedBefore - loss);
  card.currentFate = storedAfter;
  const oldCeiling = Number(card._permanentFateCeiling);
  card._permanentFateCeiling = Number.isFinite(oldCeiling)
    ? Math.min(Math.max(0, oldCeiling), storedAfter)
    : storedAfter;
  card._permanentFateDebuffAmount = Math.max(0, Number(card._permanentFateDebuffAmount) || 0) + loss;
  card._permanentFateDebuffed = true;
  clampCardToLandscapeFateCap(card);
  const after = pos ? getEffectiveFate(card, pos.z) : Math.max(0, Number(card.currentFate ?? card.fate) || 0);
  recordFateReductionEvent(sourceOwner, before, after);
  playFateChangeSound(card, before, after, sourceOwner);
  return after !== before;
}
if(typeof window !== 'undefined') window.applyPermanentFateDebuff = applyPermanentFateDebuff;

function modifyFate(card, amount, type) {
  if(typeof applyPermanentEffectImmunity === 'function') applyPermanentEffectImmunity(card);
  const sourceOwner = (arguments.length >= 4 && (arguments[3] === 0 || arguments[3] === 1)) ? arguments[3] : G.currentPlayer;
  if(typeof isTargetImmuneToEffectOwner === 'function' ? isTargetImmuneToEffectOwner(card, sourceOwner) : (card && card.immuneFlag)) return;
  if(String(type || '').toLowerCase() === 'permanent' && Number(amount) < 0) {
    return applyPermanentFateDebuff(card, Math.abs(Number(amount) || 0), sourceOwner);
  }
  const before = Math.max(0, Number(card.currentFate ?? card.fate) || 0);
  card.currentFate = Math.max(0, before + amount);
  if(String(type || '').toLowerCase() === 'permanent' && Number(amount) > 0 && Number.isFinite(Number(card._permanentFateCeiling))) {
    card._permanentFateCeiling = Math.max(0, Number(card._permanentFateCeiling) || 0) + Number(amount);
  }
  clampCardToLandscapeFateCap(card);
  playFateChangeSound(card, before, card.currentFate, sourceOwner);
}

function playFateChangeSound(card, beforeValue, afterValue, sourceOwner) {
  if(!card) return;
  const before = Math.max(0, Number(beforeValue) || 0);
  const after = Math.max(0, Number(afterValue) || 0);
  if(after === before) return;
  if(card._placementFateReveal) {
    card._placementFateReveal.genericSoundRequested = true;
    return;
  }
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

function recordFateReductionEvent(owner, beforeValue, afterValue, options) {
  if(owner !== 0 && owner !== 1) return;
  const before = Math.max(0, Number(beforeValue) || 0);
  const after = Math.max(0, Number(afterValue) || 0);
  if(after >= before) return;
  const sourceCard = options && options.countOncePerSourceEffect;
  if(sourceCard) {
    if(sourceCard._jimmyReductionEffectCounted) return;
    sourceCard._jimmyReductionEffectCounted = true;
  }
  G.damageDoneP[owner] = (G.damageDoneP[owner] || 0) + 1;
}

function setCardFateValue(card, newValue, sourceOwner) {
  const options = arguments.length > 3 && arguments[3] ? arguments[3] : null;
  if(typeof applyPermanentEffectImmunity === 'function') applyPermanentEffectImmunity(card);
  if(!card || (typeof isTargetImmuneToEffectOwner === 'function' ? isTargetImmuneToEffectOwner(card, sourceOwner) : card.immuneFlag)) return false;
  const pos = typeof getBoardCardPosition === 'function' ? getBoardCardPosition(card) : null;
  const before = pos ? getEffectiveFate(card, pos.z) : Math.max(0, Number(card.currentFate ?? card.fate) || 0);
  const baseBefore = Math.max(0, Number(card.currentFate ?? card.fate) || 0);
  const targetValue = Math.max(0, Number(newValue) || 0);
  card.currentFate = Math.max(0, Math.min(baseBefore, targetValue));
  clampCardToLandscapeFateCap(card);
  const after = pos ? getEffectiveFate(card, pos.z) : Math.max(0, Number(card.currentFate ?? card.fate) || 0);
  recordFateReductionEvent(sourceOwner, before, after, options);
  playFateChangeSound(card, before, after, sourceOwner);
  return after !== before;
}

function reduceStoredCardFateBy(card, amount, sourceOwner, options) {
  if(options === true || (options && options.permanent === true)) return applyPermanentFateDebuff(card, amount, sourceOwner);
  if(typeof applyPermanentEffectImmunity === 'function') applyPermanentEffectImmunity(card);
  if(!card || (typeof isTargetImmuneToEffectOwner === 'function' ? isTargetImmuneToEffectOwner(card, sourceOwner) : (card.immuneFlag || card.id === '76'))) return false;
  const pos = typeof getBoardCardPosition === 'function' ? getBoardCardPosition(card) : null;
  const before = pos ? getEffectiveFate(card, pos.z) : Math.max(0, Number(card.currentFate ?? card.fate) || 0);
  const baseBefore = Math.max(0, Number(card.currentFate ?? card.fate) || 0);
  const baseNext = Math.max(0, baseBefore - Math.max(0, Number(amount) || 0));
  card.currentFate = baseNext;
  clampCardToLandscapeFateCap(card);
  const after = pos ? getEffectiveFate(card, pos.z) : Math.max(0, Number(card.currentFate ?? card.fate) || 0);
  recordFateReductionEvent(sourceOwner, before, after, options);
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
  // Single-player keeps the originally rolled adjacent target while it remains
  // eligible. The authoritative engine derives the deterministic "random"
  // target from the complete current board each revision. A newly adjacent
  // lower-ranked target must therefore replace the cached projection target in
  // multiplayer or the displayed Fate moves to a different card than the
  // server scores.
  if(current && G?._phase7CurrentMultiplayer !== true) return current;
  candidates.sort((a, b)=>
    (getStablePassiveTargetRank(source, a.card) - getStablePassiveTargetRank(source, b.card))
    || String(a?.card?.iid || '').localeCompare(String(b?.card?.iid || ''))
  );
  source._cookIslandsDuelistTargetIid = candidates[0].card.iid;
  return candidates[0];
}

function isDirectCardEffectSuppressed(card) {
  if(!card || isEffectImmuneSource(card)) return false;
  return !!(card._effectSuppressedByReaction || card._lydiaSuppressed || card._reactionSuppressed);
}

function isCardSuppressedByHenryDong(card, z, r, c) {
  if(!card || isEffectImmuneSource(card)) return false;
  if(String(card.type || '') !== 'Coordinator') return false;
  const targetPos = (Number.isInteger(z) && Number.isInteger(r) && Number.isInteger(c))
    ? {z, r, c}
    : (typeof findBoardPositionForCard === 'function' ? findBoardPositionForCard(card) : null);
  if(!targetPos) return false;
  let suppressed = false;
  if(typeof forEachBoardCard !== 'function') return false;
  forEachBoardCard(function(source, hz, hr, hc){
    if(suppressed || !source || !cardActsAsPassive(source, '21')) return;
    if(source.owner === card.owner || isFaceDownCard(source) || isDirectCardEffectSuppressed(source)) return;
    const sourcePos = {z:hz, r:hr, c:hc};
    normalizeHenrySuppressionSquares(source).forEach(function(square){
      if(suppressed) return;
      if(isSameBoardSquare(square, targetPos) && isAdjacentBoardSquare(sourcePos, square)) suppressed = true;
    });
  });
  return suppressed;
}

function isCardEffectSuppressed(card) {
  const z = arguments[1], r = arguments[2], c = arguments[3];
  if(!card || isEffectImmuneSource(card)) return false;
  return !!(isDirectCardEffectSuppressed(card) || isCardSuppressedByHenryDong(card, z, r, c));
}

const ONGOING_REACTION_EFFECT_IDS = new Set(['10','14','21','36','53','62','64']);
const DELAYED_REACTION_SUPPRESSION_IDS = new Set([
  '33', // West Caribbea Infantry: next Character added to hand
  '40', // Christopher Erbs: later draw empowerment
  '47', // Great Oak Infantry: later consolidation tribute bonus
  '54', // Wolf Creek Light Infantry: delayed movement picker
  '68', // Great Oak High Schooler: deferred Coordinator search
  '69', // Breakfast Republic Busser: grants future movement
  '71', // Fort Calvin Watcher: future opponent draws
  '73', // ALPINE Expeditionary: later movement action
  '78', // Chaparral Hoplite: later consolidation ambush
  '91', // Wodny Potok Villager: future landscape-change lock
  '94'  // Wodny Potok Mailman: delayed delivery
]);
function isOngoingReactionEffect(card) {
  if(!card) return false;
  const id = String(card.id || '');
  if(String(card.type || '') === 'Coordinator' || ONGOING_REACTION_EFFECT_IDS.has(id) || DELAYED_REACTION_SUPPRESSION_IDS.has(id)) return true;
  const base = typeof CARDS !== 'undefined' && Array.isArray(CARDS) ? CARDS.find(item=>String(item && item.id || '') === id) : null;
  const effect = String(card.effect || base && base.effect || '').toLowerCase();
  return /\bwhile\b[\s\S]*\b(?:field|play)\b|\bwhenever\b|\bonce per turn\b/.test(effect);
}

function isCoordinatorSuppressedAt(z, r, c) {
  const card = G && G.board && G.board[z] && G.board[z][r] ? G.board[z][r][c] : null;
  return !!(card && card.type === 'Coordinator' && isCardEffectSuppressed(card));
}

function isSupporterAuraSuppressed(card) {
  return isSupporterEffectSuppressed(card);
}

function isPlayerSupporterEffectsSuppressed(player) {
  return !!(G && G.oppSuppressedNextTurn && G.suppressTarget === player);
}

function isSupporterEffectSuppressed(card) {
  if(!card) return false;
  // Authoritative snapshots carry suppression as a public status instead of
  // the single-player-only transient flags below.  Presentation helpers such
  // as getEffectiveFate reuse this function, so omitting the canonical status
  // made suppressed passive auras (for example Greek Hoplite under Wodny
  // Potok Lumberjack) appear active in the shipping UI even though the server
  // correctly ignored them.
  if(Array.isArray(card.statuses) && card.statuses.some(function(status){
    return String(status && typeof status === 'object' ? status.type : status) === 'EFFECTS_SUPPRESSED';
  })) return true;
  if(card._lumberjackSuppressed) return true;
  if(!(typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(card, card.owner) : card.type === 'Supporter')) return false;
  if(isEffectImmuneSource(card)) return false;
  if(card._lydiaSuppressed) return true;
  if(card._reactionSuppressed) return true;
  if(isCardSuppressedByHenryDong(card)) return true;
  return isPlayerSupporterEffectsSuppressed(card.owner);
}

function isEffectImmuneSource(card) {
  if(!card || isFaceDownCard(card)) return false;
  if(typeof isOpponentEffectOnlyImmuneCard === 'function' && isOpponentEffectOnlyImmuneCard(card)) return true;
  return typeof isFullyEffectImmuneCard === 'function'
    ? isFullyEffectImmuneCard(card)
    : (String(card.id || '') === '76' || card.immuneFlag === true || card.opponentEffectImmune === true);
}

function getAlexanderSupporterFateTotal(card, z) {
  if(!card || !G || !Array.isArray(G.board) || !Array.isArray(G.board[z])) return 0;
  const controller = card.controller === 0 || card.controller === 1
    ? Number(card.controller)
    : Number(card.owner);
  let total = 0;
  G.board[z].forEach(function(row){
    (row || []).forEach(function(supporter){
      const supporterController = supporter?.controller === 0 || supporter?.controller === 1
        ? Number(supporter.controller)
        : Number(supporter?.owner);
      if(!supporter || supporter.iid === card.iid || supporterController !== controller || isFaceDownCard(supporter)) return;
      const isSupporter = typeof isCardSupporterForRules === 'function'
        ? isCardSupporterForRules(supporter, controller)
        : supporter.type === 'Supporter';
      if(!isSupporter) return;
      total += Number(typeof getEffectiveFate === 'function'
        ? getEffectiveFate(supporter, z)
        : (supporter.currentFate ?? supporter.fate ?? 0)) || 0;
    });
  });
  return Math.max(0, total);
}
if(typeof window !== 'undefined') window.getAlexanderSupporterFateTotal = getAlexanderSupporterFateTotal;

function getEffectiveFate(card, z) {
  if(!card) return 0;
  if(isFaceDownCard(card)) return 0;
  if(typeof applyPermanentEffectImmunity === 'function') applyPermanentEffectImmunity(card);
  if(typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(card)) {
    return Math.max(0, Number(card.currentFate ?? card.fate) || 0);
  }
  // ALPINE Infantry: no bonus applies, invisible to other effects
  const staticPenalty = Math.max(0, Number(card._staticFatePenalty || 0) || 0);
  if(typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(card)) return capEffectiveFateForLandscape(Math.max(0, (Number(card.currentFate ?? card.fate) || 0) - staticPenalty), z);
  if(card.noBonus) return capEffectiveFateForLandscape(Math.max(0, (Number(card.currentFate ?? card.fate) || 0) - staticPenalty), z);
  // Helper: ALPINE (76) is invisible — should not be counted by any other card's effect
  const isInvisible = (c) => c && ((typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(c)) || isFaceDownCard(c));
  // Jimmy 41: fate = 3x total damage done this game by owner
  const getContinuousDamageCount = (owner) => {
    // Phase 7 already projects the authoritative once-per-effect count through
    // damageDoneP. Combining it with legacy client transients produces phantom
    // Jimmy Fate changes while snapshots render.
    if(G && G._phase7CurrentMultiplayer === true) return 0;
    if(!G._continuousDamageSources) return 0;
    let count = 0;
    G._continuousDamageSources.forEach((key)=>{
      if(typeof key === 'string' && key.startsWith(owner+':')) count++;
    });
    return count;
  };
  let dynamicJimmyFate = null;
  if(cardActsAsPassive(card, '41')) {
    const projectedJimmyUses = Number(card._phase7JimmyReductionEffectUses);
    const reductionUses = G?._phase7CurrentMultiplayer === true && Number.isFinite(projectedJimmyUses)
      ? Math.max(0, projectedJimmyUses)
      : Math.max(0, Number(G.damageDoneP?.[card.owner]) || 0) + getContinuousDamageCount(card.owner);
    const permanentAdjustment = (Number(card.currentFate ?? card.fate) || 0) - (Number(card.fate) || 0);
    dynamicJimmyFate = Math.max(0, reductionUses * 3 + permanentAdjustment);
  }
  const dynamicAlexanderFate = cardActsAsPassive(card, '35')
    ? getAlexanderSupporterFateTotal(card, z)
      + ((Number(card.currentFate ?? card.fate) || 0) - (Number(card.fate) || 0))
    : null;
  const baseFate = dynamicJimmyFate !== null
    ? dynamicJimmyFate
    : (dynamicAlexanderFate === null
      ? (Number(card.currentFate ?? card.fate) || 0)
      : dynamicAlexanderFate);
  // Alexander (and Taylor copying Alexander) recalculates from the zone's current
  // Supporter Fate total every time effective Fate is requested.
  let bonus = 0;

  if(cardActsAsPassive(card, '85')) {
    const opponent = 1 - card.owner;
    bonus += typeof getSupportersSetCountForPlayer === 'function'
      ? getSupportersSetCountForPlayer(opponent)
      : (Number(Array.isArray(G.supportersSetP) ? G.supportersSetP[opponent] : 0) || 0);
  }
  if(cardActsAsPassive(card, '88')) {
    const projectedCharacterCount = Number(card._phase7RozsiYouthCharacterCount);
    let charCount = G?._phase7CurrentMultiplayer === true && Number.isFinite(projectedCharacterCount)
      ? Math.max(0, projectedCharacterCount)
      : 0;
    if(!(G?._phase7CurrentMultiplayer === true && Number.isFinite(projectedCharacterCount))){
      forEachBoardCard(cell=>{
        if(cell && cell.owner===card.owner && (typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(cell, card.owner) : cell.type!=='Supporter') && !isInvisible(cell)) charCount++;
      });
    }
    bonus += charCount * 2;
  }
  if(cardActsAsPassive(card, '89')) {
    const counts = Array.isArray(G._supporterEffectsActivatedP) ? G._supporterEffectsActivatedP : [0,0];
    if((Number(counts[card.owner]) || 0) < 10) bonus += 7;
  }
  if(cardActsAsPassive(card, '100') && typeof controlsNamedCard === 'function' && controlsNamedCard(card.owner, ['Felicyta', 'Kvetka', 'Květka'], {excludeIid:card.iid})) {
    bonus += 3;
  }

  // 1st West Caribbea Marines (65): legacy single-player leaves the stored
  // value at 1 and represents the documented when-set increase as +3 here.
  // Authoritative v3 stores the resolved value (4) in its snapshot, so adding
  // the legacy projection bonus again would render/score it as 7.
  if(cardActsAsPassive(card, '65')
    && !isSupporterEffectSuppressed(card)
    && G?._phase7CurrentMultiplayer !== true) bonus += 3;
  // Greek Hoplite (63): +2 Fate per copy of self in same zone, including itself
  if(cardActsAsPassive(card, '63') && !isSupporterEffectSuppressed(card)){
    let copies = 0;
    G.board[z].forEach(row=>row.forEach(cell=>{
      if(cell && cardActsAsPassive(cell, '63') && cell.owner===card.owner && !isInvisible(cell) && !isSupporterEffectSuppressed(cell)) copies++;
    }));
    bonus += copies * 2;
  }
  if(cardActsAsPassive(card, '44') && !isSupporterEffectSuppressed(card)){
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
  let jeremiahBoost = typeof getFieldWideWhisperJeremiahBoost === 'function'
    ? getFieldWideWhisperJeremiahBoost(card.owner)
    : 0;
  G.board[z].forEach((row, r)=>row.forEach((cell, c)=>{
    if(cell && cardActsAsPassive(cell, '57') && cell.owner===card.owner && !isInvisible(cell) && !isCoordinatorSuppressedAt(z, r, c)) jeremiahBoost++;
  }));
  G.board[z].forEach((row, r)=>row.forEach((cell, c)=>{
    if(!cell || isInvisible(cell)) return;
    if(cell.type==='Coordinator' && isCoordinatorSuppressedAt(z, r, c)) return;
    if(cardActsAsPassive(cell, '10') && cell.owner!==card.owner) {
      if(!G._continuousDamageSources) G._continuousDamageSources = new Set();
      G._continuousDamageSources.add(cell.owner+':10:'+cell.iid);
      bonus -= 3;
      return;
    }
    // Agent-K affects only cards its owner controls in its zone.
    if(cardActsAsPassive(cell, 'bh07') && cell.owner===card.owner) {
      const adjacentDauntless = getAdjacentCards(z, r, c).filter(function(entry){
        return entry && entry.card && !isInvisible(entry.card) && String(entry.card.type || '') === 'Dauntless';
      }).length;
      const sourceBoost = typeof getWhisperAuraPotencyBoost === 'function'
        ? getWhisperAuraPotencyBoost({card:cell, z:z, r:r, c:c})
        : 0;
      if(adjacentDauntless > 0) bonus += adjacentDauntless * (2 + sourceBoost);
    }
    if(cell.owner!==card.owner) return;
    // Felicyta (01): +4 to adjacent friendly cards
    if(cardActsAsPassive(cell, '01') && getAdjacentCards(z, r, c).some(a=>a.card.iid===card.iid)) bonus += 4 + jeremiahBoost;
    // Phil (46): no zone aura
    // Anne Stone (11): +3 to supporters in zone
    if(cardActsAsPassive(cell, '11') && (typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(card, card.owner) : card.type==='Supporter')) bonus += 3 + jeremiahBoost;
    // KvÄ›tka (19): all Coordinators in zone +2
    if(cardActsAsPassive(cell, '19') && card.type==='Coordinator') bonus += 3 + jeremiahBoost;
    // Zsofia (15): handled in its own stacking block below
    // Post-Modernist Dylan (10): -3 to all opponent cards in zone (continuous)
    // Dylan Kirby (29): Initiator â€” no continuous effect (search only)
    // Dylan Kirby (29): Initiator — no continuous effect (search only)
    // Cathy (23): +2 to all owned characters in zone
    if(cardActsAsPassive(cell, '23') && (typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(card, card.owner) : card.type!=='Supporter')) bonus += 2 + jeremiahBoost;
    // Jeremiah Jones (57): now boosts other coordinator auras' potency (handled above via jeremiahBoost)
    // Maroon Knights (59): +1 to all Supporters in zone (while on field)
    if(cardActsAsPassive(cell, '59') && (typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(card, card.owner) : card.type==='Supporter') && !isSupporterEffectSuppressed(cell)) bonus += 1;
    // Duncan Heyward (77): +4 to declared-affiliation friendly cards in zone
    if(cardActsAsPassive(cell, '77') && cell._declaredAff && card.aff===cell._declaredAff) bonus += 4 + jeremiahBoost;
  }));

  // Concrete Roads tokens keep the copied Coordinator identity while expanding
  // supported source auras from one zone to every zone on the field.
  if(typeof getActiveWhisperTokens === 'function') {
    getActiveWhisperTokens(null, null).forEach(function(sourceEntry){
      const source = sourceEntry.card;
      const copiedId = String(source._whisperCopiedEffectId || '');
      const sourceBoost = typeof getWhisperAuraPotencyBoost === 'function' ? getWhisperAuraPotencyBoost(sourceEntry) : 0;
      if(copiedId === '10' && source.owner !== card.owner) {
        if(!G._continuousDamageSources) G._continuousDamageSources = new Set();
        G._continuousDamageSources.add(source.owner + ':whisper10:' + source.iid);
        bonus -= 3 + sourceBoost;
        return;
      }
      if(copiedId === 'bh07' && source.owner === card.owner) {
        const adjacentDauntless = getAdjacentCards(sourceEntry.z, sourceEntry.r, sourceEntry.c).filter(function(entry){
          return entry && entry.card && !isInvisible(entry.card) && String(entry.card.type || '') === 'Dauntless';
        }).length;
        if(adjacentDauntless > 0) bonus += adjacentDauntless * (2 + sourceBoost);
      }
      if(source.owner !== card.owner) return;
      if(copiedId === '11' && (typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(card, card.owner) : card.type === 'Supporter')) bonus += 3 + sourceBoost;
      if(copiedId === '19' && card.type === 'Coordinator') bonus += 3 + sourceBoost;
      if(copiedId === '23' && (typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(card, card.owner) : card.type !== 'Supporter')) bonus += 2 + sourceBoost;
      if(copiedId === '77' && source._declaredAff && card.aff === source._declaredAff) bonus += 4 + sourceBoost;
    });
  }

  if(card.type==='Dauntless' && card.id!=='76'){
    G.board[z].forEach((row, r)=>row.forEach((cell, c)=>{
      if(cell && cardActsAsPassive(cell, '44') && cell.owner===card.owner && !isInvisible(cell) && !isSupporterEffectSuppressed(cell) && getAdjacentCards(z, r, c).some(a=>a.card.iid===card.iid)) {
        bonus += 3;
      }
    }));
  }

  // Bobby Jones (55): +5 Fate if all own cards in zone share same affiliation
  if(cardActsAsPassive(card, '55')){
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

  const effectiveWithAuras = capEffectiveFateForLandscape(Math.max(0, baseFate + bonus - staticPenalty), z);
  return capEffectiveFateForPermanentDebuff(card, effectiveWithAuras);
}

function countCoordinators(z, owner) {
  let n=0;
  G.board[z].forEach((row, r)=>row.forEach((cell, c)=>{
    if(cell && cell.type==='Coordinator' && cell.owner===owner && !isFaceDownCard(cell) && !isCoordinatorSuppressedAt(z, r, c)) n++;
  }));
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
  // Phase 7 projects the authority's scoring statuses verbatim. Re-running the
  // old client landscape/modifier paths here both missed authoritative zone
  // modifiers and could double-apply legacy ones, leaving the displayed Fate
  // different from the server's outcome. Single-player keeps its established
  // calculation below.
  if(G?._phase7CurrentMultiplayer === true){
    (Array.isArray(G._phase7Statuses) ? G._phase7Statuses : []).forEach(function(status){
      if(status?.type !== 'ZONE_FATE_MODIFIER') return;
      if(Number(status.zone) !== Number(z) || Number(status.playerIndex) !== Number(player)) return;
      score += Number(status.value || 0) || 0;
    });
    return Math.max(0, score);
  }
  // Deterrance (Marie L'amboure, 36): applies only to opponent's score in this zone
  const dm = G.fateModifiers['deterrance_z'+z]||0;
  // Determine if the player is the opponent of Deterrance's owner
  let deterranceOwner = -1;
  G.board[z].forEach(row=>row.forEach(cell=>{
    if(cell&&cardActsAsPassive(cell, '36')&&!isCardEffectSuppressed(cell)) deterranceOwner = cell.owner;
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
  if(G?._phase7CurrentMultiplayer === true) return score;
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
  if(typeof window.fateAIFinishLearningMatch === 'function') {
    window.fateAIFinishLearningMatch({winner, isDraw}).catch(function(){});
  }
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
  const winScreen = document.getElementById('s-win');
  const resultPerspective = Number.isInteger(G._onlinePlayerIndex)
    ? G._onlinePlayerIndex
    : (G.aiEnabled ? (1 - G.aiPlayer) : 0);
  if(winScreen){
    winScreen.classList.remove('forfeit-result-screen');
    winScreen.dataset.outcome = isDraw ? 'draw' : (winner === resultPerspective ? 'victory' : 'defeat');
  }
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
      const humanEloBefore = Math.max(0, Number(USER_PROFILE.challengerElo) || 600);
      result = recordChallengerResult(humanWon, resolvedOpponentElo, true);
      // Human-vs-AI Challenger matches also update the selected AI's public ELO.
      if(G._selectedAI){
        const aiName = G._selectedAI.name;
        const aiEloBefore = Math.max(100, Number(resolvedOpponentElo) || 600);
        const aiDidWin = !humanWon;
        const aiExpected = 1 / (1 + Math.pow(10, (humanEloBefore - aiEloBefore) / 400));
        const aiNewElo = Math.max(100, Math.round(aiEloBefore + 32 * ((aiDidWin ? 1 : 0) - aiExpected)));
        if(typeof syncAIEloEverywhere === 'function') {
          syncAIEloEverywhere(aiName, aiNewElo, aiDidWin);
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
  const winTitleEl = document.getElementById('win-title');
  winTitleEl.textContent = titleText;
  winTitleEl.classList.remove('online-forfeit-title');
  let subText;
  if(isDraw) subText = 'Both players are tied on zones and total Fate';
  else if(drawByFate) subText = 'Won by total Fate tiebreaker!';
  else if(winner>=0) subText = 'Controls '+[p0wins,p1wins][winner]+' of 3 Zones';
  else subText = 'Both players tied'
  const winSubEl = document.getElementById('win-sub');
  winSubEl.textContent = subText;
  winSubEl.classList.remove('online-forfeit-sub');
  winSubEl.style.removeProperty('color');

  // Zone breakdown
  const wz = document.getElementById('win-zones');
  wz.innerHTML='';
  zResults.forEach(({z,s0,s1,ctrl})=>{
    const el=document.createElement('div');
    el.className='win-z'+(ctrl===winner?' won':'')+(isDraw?' draw':'');
    el.dataset.controller = ctrl >= 0 ? String(ctrl) : 'tie';
    el.innerHTML=`<div class="win-zone-heading"><span>Zone</span><strong>${z+1}</strong></div>
      <div class="win-zone-score p1"><span>${escapeHtml(G.players[0].name)}</span><strong>${s0}</strong></div>
      <div class="win-zone-score p2"><span>${escapeHtml(G.players[1].name)}</span><strong>${s1}</strong></div>
      <div class="win-zone-controller">${ctrl>=0?escapeHtml(G.players[ctrl].name)+' controls':'Tied'}</div>`;
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
    fateEl.className = 'win-total-fate';
    const fateTitle = isDraw ? 'Total Fate (Tied)' : 'Total Fate Tiebreaker';
    fateEl.innerHTML = '<div class="win-total-fate-title">'+fateTitle+'</div>'+
      '<div class="win-total-fate-scores">'+
        '<div class="p1"><span>'+escapeHtml(G.players[0].name)+'</span><strong>'+p0TotalFate2+'</strong></div>'+
        '<div class="p2"><span>'+escapeHtml(G.players[1].name)+'</span><strong>'+p1TotalFate2+'</strong></div>'+
      '</div>'+
      (isDraw ? '<div class="win-total-fate-note">Official Draw</div>' :
        '<div class="win-total-fate-note won">'+escapeHtml(G.players[winner].name)+' wins by higher total Fate!</div>');
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

// Vigilantes (52): mark an opponent card in this zone for a hand discard on departure.
async function activateVigilantes(card, z, r, c, options) {
  options = options || {};
  const cp = G.currentPlayer;
  const opp = 1 - cp;
  const allowed = options.activationAlreadyCounted === true
    ? true
    : await beginManualSupporterEffectActivation(card, z, r, c, [opp]);
  if(!allowed) {
    card.vigilanteUsed = true;
    card.whenSetActivated = true;
    card.effectUsedInitial = true;
    renderGame({board:true, scores:true, topbar:true});
    return;
  }
  if(typeof showEffectActivationGlow === 'function') showEffectActivationGlow(z, r, c, card);
  pickCardInZone(z,'Vigilantes: select an opponent card in this zone to mark.',(tgt)=>{
    if(tgt.owner !== opp){toast('Must select an opponent card');return;}
    if(typeof isTargetImmuneToEffectOwner === 'function' ? isTargetImmuneToEffectOwner(tgt, cp) : (typeof isFullyEffectImmuneCard === 'function' ? isFullyEffectImmuneCard(tgt) : (tgt.immuneFlag || tgt.id==='76'))){showBlockedAnimation('this card is immune');return;}
    markCardForVigilantes(tgt, card, cp);
    card.vigilanteUsed = true;
    card.whenSetActivated = true;
    card.effectUsedInitial = true;
    toast(tgt.name+' is marked. When it leaves the field, a random card is discarded from the opponent\'s hand.');
    log(cp===0?'p1':'p2', 'Vigilantes marked '+tgt.name+' for death in Zone '+(z+1));
    playSfx('effect');
    renderEffectResolutionForPlayer(cp, {hand:false});
  }, function(cell){ return !!cell && cell.owner === opp && !(typeof isTargetImmuneToEffectOwner === 'function' ? isTargetImmuneToEffectOwner(cell, cp) : (typeof isFullyEffectImmuneCard === 'function' && isFullyEffectImmuneCard(cell))); }, null, card);
}


function startWolfCreekMove(cardToMove, fromZ, fromR, fromC, wolfCreekCard) {
  if(!cardToMove || !wolfCreekCard) return false;
  if(typeof isSupporterEffectSuppressed === 'function' && isSupporterEffectSuppressed(wolfCreekCard)) {
    toast('Wolf Creek movement was suppressed.');
    return false;
  }
  clearBoardTargetSelection();
  clearPlaceHighlights();
  const cp = typeof wolfCreekCard.owner === 'number' ? wolfCreekCard.owner : G.currentPlayer;
  const options = [];
  for(let zz=0; zz<(G.board ? G.board.length : 3); zz++){
    G.board[zz].forEach((row,rr)=>row.forEach((cell,cc)=>{
      if(cell){
        if(cell.owner === cp && cell.iid !== cardToMove.iid && !cell.cantBeMoved){
          options.push({z:zz,r:rr,c:cc,kind:'swap'});
          const el=document.querySelector('#board .cell[data-z="'+zz+'"][data-r="'+rr+'"][data-c="'+cc+'"]');
          if(el) el.classList.add('placeable','move-target','wolf-creek-swap-target');
        }
        return;
      }
      if(isWolfCreekSideOpenSquare(zz, rr, cc, cp)){
        options.push({z:zz,r:rr,c:cc,kind:'move'});
        const el=document.querySelector('#board .cell[data-z="'+zz+'"][data-r="'+rr+'"][data-c="'+cc+'"]');
        if(el) el.classList.add('placeable','move-target');
      }
    }));
  }
  if(!options.length){ toast('No Wolf Creek move or swap targets available'); return false; }
  G._wolfCreekMoving = { card:cardToMove, fromZ:fromZ, fromR:fromR, fromC:fromC, wolfCreekCard:wolfCreekCard, options:options };
  G.placing = false;
  G.selectedHandCard = null;
  if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function') {
    window.FateMatchRendererAdapter.scheduleRender('square-selection-state');
  }
  toast('Click a highlighted square or card to move '+cardToMove.name);
  if(typeof setHint === 'function') setHint('Wolf Creek: click a highlighted open square or friendly card to move '+cardToMove.name+' - press Escape to cancel');
  return true;
}

function isWolfCreekMoveCandidateCard(cell, owner, sourceIid) {
  return !!(cell && cell.owner === owner && !cell.cantBeMoved);
}

function isWolfCreekSideOpenSquare(z, r, c, owner) {
  if(!G || !Array.isArray(G.board) || !G.board[z] || !G.board[z][r]) return false;
  if(G.board[z][r][c] !== null) return false;
  if(isBlocked(z, r, c)) return false;
  if(typeof isContestedOrOwnSafeSquare === 'function') return isContestedOrOwnSafeSquare(z, r, c, owner);
  const rowOwner = typeof getSquareRowOwner === 'function' ? getSquareRowOwner(z, r) : (r === 1 ? -1 : (r === 0 ? 1 : 0));
  return rowOwner === -1 || rowOwner === owner;
}

function collectWolfCreekMoveCandidates(owner, sourceIid, sourceZone) {
  const entries = [];
  if(!G || !Array.isArray(G.board)) return entries;
  const z = Number.isInteger(Number(sourceZone)) ? Number(sourceZone) : -1;
  const zone = G.board[z];
  if(!Array.isArray(zone)) return entries;
  zone.forEach(function(row, r){
      if(!Array.isArray(row)) return;
      row.forEach(function(cell, c){
        if(!isWolfCreekMoveCandidateCard(cell, owner, sourceIid)) return;
        entries.push({card:cell, z, r, c});
      });
  });
  return entries;
}

function clearWolfCreekCandidateHighlights() {
  document.querySelectorAll('.wolf-creek-card-target').forEach(function(el){ el.classList.remove('wolf-creek-card-target'); });
}

function showWolfCreekCandidateHighlights(entries) {
  clearWolfCreekCandidateHighlights();
  (entries || []).forEach(function(entry){
    const cell = document.querySelector('#board .cell[data-z="'+entry.z+'"][data-r="'+entry.r+'"][data-c="'+entry.c+'"]');
    if(cell) cell.classList.add('wolf-creek-card-target');
    const bc = cell && cell.querySelector ? cell.querySelector('.bc') : null;
    if(bc) bc.classList.add('wolf-creek-card-target');
  });
}

function pickWolfCreekMoveCandidate(wolfCreekCard, prompt, callback, fallbackZone) {
  const owner = typeof wolfCreekCard.owner === 'number' ? wolfCreekCard.owner : G.currentPlayer;
  const entries = collectWolfCreekMoveCandidates(owner, wolfCreekCard.iid, fallbackZone);
  if(!entries.length){ toast('No cards in this zone to move'); return; }
  showWolfCreekCandidateHighlights(entries);
  const done = function(card, z, r, c){
    clearWolfCreekCandidateHighlights();
    if(callback) callback(card, z, r, c);
  };
  if(typeof showBoardTargetPicker === 'function') {
    showBoardTargetPicker({
      title:typeof getMultiplayerBoardPromptTitle === 'function' ? getMultiplayerBoardPromptTitle(wolfCreekCard) : 'Wolf Creek',
      prompt:prompt || 'Select a friendly card in this zone to move.',
      entries,
      zones:[...new Set(entries.map(function(entry){ return entry.z; }))],
      visibleZones:[0,1,2],
      maxCount:1,
      confirmLabel:'Move',
      viewerPlayerIndex:owner,
      showZoneTitles:true
    }, function(chosen){
      const picked = chosen && chosen[0];
      if(picked) done(picked.card, picked.z, picked.r, picked.c);
    });
    return;
  }
  pickCardInZone(fallbackZone, prompt, done, function(cell){ return isWolfCreekMoveCandidateCard(cell, owner, wolfCreekCard.iid); }, null, wolfCreekCard);
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
  if(card._expeditionaryActivationInFlight) return;
  var cp = G.currentPlayer;
  card._expeditionaryActivationInFlight = true;
  let allowed = false;
  try {
    if(!G._onlineRoomCode && typeof playEffectActivationCinematic === 'function') {
      await playEffectActivationCinematic(card, z, r, c, {source:'expeditionary-move'});
    }
    if(typeof G !== 'undefined' && G) G._allowImmediateEffectPickerUntil = Date.now() + 1400;
    allowed = await beginManualSupporterEffectActivation(card, z, r, c, [cp]);
  } finally {
    delete card._expeditionaryActivationInFlight;
  }
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
  if(!canUsePanaceaLandscapeMoveCard(card)){ toast('Only eligible Eventide cards can use this landscape.'); return; }
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

async function activateBusserMove(card, fromZ, fromR, fromC) {
  if(G._busserMovingCard){
    toast('Choose the highlighted Busser square first');
    return;
  }
  if(!card || card.cantBeMoved || card.immuneFlag || card.id==='76'){
    toast('This card cannot be moved');
    return;
  }
  if(card._busserActivationInFlight) return;
  var cp = typeof card._busserOwner === 'number' ? card._busserOwner : G.currentPlayer;
  if(card._busserSourceIid && isStoredEffectSourceSuppressed(card._busserSourceIid)){
    toast('Busser movement was suppressed.');
    card._busserTurnsLeft = 0;
    card._busserMoves = 0;
    card._busserOwner = null;
    card._busserSourceIid = null;
    card._busserMovedThisTurn = false;
    if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
    return;
  }
  if(getBusserTurnsLeft(card)<=0){
    toast('No Busser turns remaining');
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
        }
      }
    });
  });
  if(!options.length){
    toast('No open squares in adjacent zones!');
    G._busserMovingCard = null;
    clearPlaceHighlights();
    return;
  }
  card._busserActivationInFlight = true;
  try {
    if(!G._onlineRoomCode && typeof playEffectActivationCinematic === 'function') {
      await playEffectActivationCinematic(card, fromZ, fromR, fromC, {source:'busser-move'});
    }
    if(typeof G !== 'undefined' && G) G._allowImmediateEffectPickerUntil = Date.now() + 1400;
  } finally {
    delete card._busserActivationInFlight;
  }
  toast('Click an open square in an adjacent zone to move ' + card.name);
  G._busserMovingCard = {card:card, fromZ:fromZ, fromR:fromR, fromC:fromC, options:options};
  if(typeof fateFastShowMovementTargets === 'function') fateFastShowMovementTargets(options, ['placeable','move-target']);
  if(typeof showEffectActivationGlow === 'function') showEffectActivationGlow(fromZ, fromR, fromC, card);
  if(typeof showBusserStatusBanner === 'function') showBusserStatusBanner(card, getBusserTurnsLeft(card), cp);
  if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
  else if(typeof renderTopbarEffects === 'function') renderTopbarEffects();
}

// ══════════════════════════════════════════════════════════════
//  REACTION SYSTEM (Havano Citizen 79, Lydia 56)
// ══════════════════════════════════════════════════════════════

function isHavanoReactionSource(actionData) {
  if(!actionData) return false;
  if(Array.isArray(actionData.affectedOwners)){
    const sourceOwner = Number(actionData.sourceOwner ?? actionData.card?.owner);
    const opponent = sourceOwner === 0 || sourceOwner === 1 ? 1 - sourceOwner : null;
    if(opponent !== null && actionData.affectedOwners.map(Number).includes(opponent)) return true;
  }
  const metadata = typeof window !== 'undefined' ? window.FateEffectRuleMetadata : null;
  const refs = [
    actionData.card,
    actionData.source,
    actionData.effectCinematic,
    actionData.pendingSource
  ];
  for(const ref of refs) {
    if(!ref) continue;
    const card = ref.card || ref;
    const id = String(ref.id || ref.cardId || card.id || '');
    if(metadata && typeof metadata.canTriggerHavano === 'function' && metadata.canTriggerHavano(id)) return true;
  }
  return false;
}

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
  const affectsOpponent = new Set(['16','26','31','50','61','62','71','72','73','75','76','77','80','91','97']);
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
    '61', // Maria Song reduces copies of a revealed opponent Character
    'bh04', // Selva Island Anicka reduces a declared opponent card type
    'bh25' // Jimmy Viltrumite discards any board card
  ]);
  const bothTargets = new Set([
    '12', // Makenna can make friendly cards immune, but can target player-owned cards
    '17', // Carolyn can block any open square on the field
    '34',
    '40',
    'bh05'
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
    var explicitSourceOwner = Number(actionData && actionData.sourceOwner);
    var cp = Number.isInteger(explicitSourceOwner) && (explicitSourceOwner === 0 || explicitSourceOwner === 1)
      ? explicitSourceOwner
      : G.currentPlayer;
    var opp = 1 - cp;
    if(G._skipReactions){ resolve(true); return; }
    if(actionData && actionData.card && actionData.card._onlinePlacementReactionAllowPromptId){
      delete actionData.card._onlinePlacementReactionAllowPromptId;
      resolve(true);
      return;
    }
    if(G._onlineRoomCode && Number.isInteger(Number(G._onlinePlayerIndex))){
      const transactions = window.FateOnlineEffectTransactions || null;
      if(transactions && typeof transactions.captureReactionContext === 'function'){
        transactions.captureReactionContext(actionType, actionData || {});
      }
      resolve(true);
      return;
    }
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
        if(card2.id==='56' && (card2.usesLeft === null || card2.usesLeft === undefined)) card2.usesLeft = 3;
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

    // Havano Citizen (79): reacts only to its explicit source list.
    if(isHavanoReactionSource(actionData)){
      G.players[opp].hand.forEach(function(h) {
        if(h.id==='79' && !isSupporterEffectSuppressed(h)) reactions.push({type:'havano', card: h});
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
      var chosenReaction = typeof aiChooseReaction === 'function' ? aiChooseReaction(reactions, actionData) : reactions[0];
      if(!chosenReaction){ resolve(true); return; }
      Promise.resolve(executeReaction(chosenReaction, actionData)).then(function(result){ resolve(result === true); });
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
        ? playEffectActivationCinematic(candidate.card, candidate.z, candidate.r, candidate.c, {source:'improvisor-reaction', sfx:false, broadcast:false})
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
      reactorName+' - React? ('+_reactionCountdown+'s)',
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
        {label:'Negate & Suppress', pri:true, action:function(){
          if(_reactionTimer) clearInterval(_reactionTimer);
          if(!isCurrentReactionPrompt()) return;
          G._reactionPending = false;
          closeModal();
          const cinematic = typeof playEffectActivationCinematic === 'function'
            ? playEffectActivationCinematic(reaction.card, reaction.z, reaction.r, reaction.c, {source:'improvisor-reaction', sfx:false, broadcast:false})
            : Promise.resolve(false);
          Promise.resolve(cinematic)
            .then(function(){ return executeReaction(reaction, actionData); })
            .then(function(result){ resolve(result === true); });
        }}
      ],
      {immediate:true}
    );

    // Start countdown - auto-allow if timer expires
    _reactionTimer = setInterval(function(){
      if(!isCurrentReactionPrompt()){
        clearInterval(_reactionTimer);
        return;
      }
      _reactionCountdown--;
      var timerEl = document.getElementById('reaction-timer');
      if(timerEl) timerEl.textContent = _reactionCountdown+'s';
      var titleEl = document.getElementById('modal-title');
      if(titleEl) titleEl.textContent = reactorName+' - React? ('+_reactionCountdown+'s)';
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

function applyHavanoPlacementRules(inst, sourceCard, z, r, c, owner) {
  if(!inst) return false;
  markCardSetTurn(inst, owner);
  if(typeof applyLandscapePlacementBonuses === 'function') applyLandscapePlacementBonuses(inst, z, r, c);
  const zone = G.board?.[z] || [];
  zone.forEach(function(row){
    (row || []).forEach(function(aura){
      if(!aura || aura.owner !== owner || aura.iid === inst.iid || !cardActsAsPassive(aura, '02') || isFaceDownCard(aura)) return;
      if(typeof isCardEffectSuppressed === 'function' && isCardEffectSuppressed(aura)) return;
      modifyFate(inst, 4, 'permanent', owner);
    });
  });
  if(!Array.isArray(G.supportersSetP)) G.supportersSetP = [0, 0];
  G.supportersSetP[owner] = (Number(G.supportersSetP[owner]) || 0) + 1;
  if(!Array.isArray(G.supporterReinforcementSetP)) G.supporterReinforcementSetP = [0, 0];
  const reinforcement = typeof getSupportReinforcementValue === 'function' ? Math.max(0, Number(getSupportReinforcementValue(inst)) || 0) : 1;
  G.supporterReinforcementSetP[owner] = (Number(G.supporterReinforcementSetP[owner]) || 0) + reinforcement;
  inst._setReinforcementValue = reinforcement;
  inst._supporterSetCounted = true;
  inst._wasSetAsSupporter = true;
  inst._hasBeenOnBoard = true;
  inst._supporterSetOwner = owner;
  if(typeof noteBalladSupporterSet === 'function') noteBalladSupporterSet(owner);
  if(typeof consumePendingPlacementFlags === 'function') consumePendingPlacementFlags(sourceCard, inst);
  if(typeof applyContinuousEffects === 'function') applyContinuousEffects();
  return true;
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
      const resultWord = reaction.resolutionMode === 'suppressed' ? 'SUPPRESSED' : 'NEGATED';
      toast('Havano Citizen '+resultWord.toLowerCase()+' the effect and remains in hand because no square is open.');
      playSfx(reaction.resolutionMode === 'suppressed' ? 'effectSuppressed' : 'effectNegated');
      if(typeof showEffectNegatedBanner === 'function') showEffectNegatedBanner('EFFECT ' + resultWord + ' by Havano Citizen');
      else showBlockedAnimation(resultWord + ' by Havano Citizen!');
      renderEffectResolutionForPlayer(owner, {hand:true});
      resolve(false);
      return;
    }
    G.players[owner].hand = G.players[owner].hand.filter(function(c){return c.iid !== reaction.card.iid;});
    const inst = newInstance(reaction.card);
    inst.owner = owner;
    inst.currentFate = getPlacedCardFate(reaction.card);
    preparePlacementFateReveal(inst, reaction.card, 'set');
    if(G.aiEnabled && owner === G.aiPlayer) {
      const o = options[0];
      const commit = function(){
        G.board[o.z][o.r][o.c] = inst;
        applyHavanoPlacementRules(inst, reaction.card, o.z, o.r, o.c, owner);
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
          source:'effect',
          placementStyle:'local-square',
          target:{z:o.z, r:o.r, c:o.c},
          commit
        });
        if(started) return;
      }
      commit();
      return;
    }
    G._havanoDeploying = { inst, owner, sourceCard:reaction.card, options, resolve, resolutionMode:reaction.resolutionMode || 'negated' };
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
    applyHavanoPlacementRules(dep.inst, dep.sourceCard, z, r, c, dep.owner);
    G._havanoDeploying = null;
    G.placing = false;
    clearPlaceHighlights();
    toast('Havano Citizen deployed to Zone '+(z+1)+'!');
    playSfx(dep.resolutionMode === 'suppressed' ? 'effectSuppressed' : 'effectNegated');
    const resultWord = dep.resolutionMode === 'suppressed' ? 'SUPPRESSED' : 'NEGATED';
    if(typeof showEffectNegatedBanner === 'function') showEffectNegatedBanner('EFFECT ' + resultWord + ' by Havano Citizen');
    else showBlockedAnimation(resultWord + ' by Havano Citizen!');
    renderEffectResolutionForPlayer(dep.owner, {hand:true});
    dep.resolve(false);
  };
  const presenter = window.FateActionPresentation;
  if(presenter && typeof presenter.beginBoardPlacement === 'function'){
    const started = presenter.beginBoardPlacement({
      inst:dep.inst,
      sourceCard:dep.sourceCard,
      owner:dep.owner,
      source:'effect',
      placementStyle:'local-square',
      target:{z, r, c},
      commit
    });
    if(started) return;
  }
  commit();
}

function executeReaction(reaction, actionData) {
  var reactionOwner = Number(reaction && reaction.card && reaction.card.owner);
  var opp = Number.isInteger(reactionOwner) && (reactionOwner === 0 || reactionOwner === 1)
    ? reactionOwner
    : 1 - G.currentPlayer;
  if(isEffectImmuneSource(actionData && actionData.card)) {
    showBlockedAnimation('this card is immune');
    return true;
  }
  if(reaction.type === 'lydia'){
    reaction.card.usesLeft--;
    const resolutionMode = 'negated-and-suppressed';
    if(actionData.card) {
      delete actionData.card._effectNegatedByReaction;
      delete actionData.card._effectSuppressedByReaction;
      delete actionData.card._lydiaSuppressed;
      actionData.card._effectNegatedByReaction = true;
      actionData.card._effectSuppressedByReaction = true;
      actionData.card._lydiaSuppressed = true;
      markInitialEffectResolved(actionData.card);
    }
    const resultWord = 'negated and suppressed';
    toast('Lydia '+resultWord+' '+(actionData.card ? actionData.card.name : 'effect')+'! ('+reaction.card.usesLeft+' uses left)');
    log(opp===0?'p1':'p2', 'Lydia '+resultWord+' '+(actionData.card ? actionData.card.name : 'effect'));
    playSfx('effectSuppressed');
    if(typeof triggerMajaMischievousActivities === 'function') triggerMajaMischievousActivities(opp, {mode:resultWord, sourceCard:actionData && actionData.card});
    if(typeof showEffectNegatedBanner === 'function') showEffectNegatedBanner('EFFECT '+resultWord.toUpperCase()+' by Lydia');
    else showBlockedAnimation(resultWord.toUpperCase()+' by Lydia!');
    renderEffectResolutionForPlayer(opp, {hand:false});
  } else if(reaction.type === 'havano'){
    const resolutionMode = isOngoingReactionEffect(actionData && actionData.card) ? 'suppressed' : 'negated';
    if(actionData.card) {
      delete actionData.card._effectNegatedByReaction;
      delete actionData.card._effectSuppressedByReaction;
      delete actionData.card._reactionSuppressed;
      if(resolutionMode === 'suppressed'){
        actionData.card._effectSuppressedByReaction = true;
        actionData.card._reactionSuppressed = true;
      }else{
        actionData.card._effectNegatedByReaction = true;
      }
      markInitialEffectResolved(actionData.card);
    }
    log(opp===0?'p1':'p2', 'Havano Citizen negated and deployed');
    reaction.resolutionMode = resolutionMode;
    if(typeof triggerMajaMischievousActivities === 'function') triggerMajaMischievousActivities(opp, {mode:resolutionMode, sourceCard:actionData && actionData.card});
    return beginHavanoDeployment(reaction, opp);
  } else if(reaction.type === 'secules'){
    reaction.card.usesLeft = 0;
    reaction.card._seculesUsed = true;
    const resolutionMode = isOngoingReactionEffect(actionData && actionData.card) ? 'suppressed' : 'negated';
    if(actionData.card) {
      delete actionData.card._effectNegatedByReaction;
      delete actionData.card._effectSuppressedByReaction;
      delete actionData.card._reactionSuppressed;
      if(resolutionMode === 'suppressed'){
        actionData.card._effectSuppressedByReaction = true;
        actionData.card._reactionSuppressed = true;
      }else{
        actionData.card._effectNegatedByReaction = true;
      }
      markInitialEffectResolved(actionData.card);
    }
    const resultWord = resolutionMode === 'suppressed' ? 'suppressed' : 'negated';
    toast('Mr. Secules '+resultWord+' '+(actionData.card ? actionData.card.name : 'the effect')+'! (Effect Expended)');
    log(opp===0?'p1':'p2', 'Mr. Secules: Effect Expended after '+resultWord+' '+(actionData.card ? actionData.card.name : 'an effect'));
    playSfx(resolutionMode === 'suppressed' ? 'effectSuppressed' : 'effectNegated');
    if(typeof triggerMajaMischievousActivities === 'function') triggerMajaMischievousActivities(opp, {mode:resultWord, sourceCard:actionData && actionData.card});
    if(typeof showEffectNegatedBanner === 'function') showEffectNegatedBanner('EFFECT '+resultWord.toUpperCase()+' by Mr. Secules');
    else showBlockedAnimation(resultWord.toUpperCase()+' by Mr. Secules!');
    renderEffectResolutionForPlayer(opp, {hand:false});
  }
}// Cards with when-set effects (global so runWhenSetEffect can reference it)
const WHEN_SET_IDS = new Set(['02','03','04','05','06','07','08','12','13','14','16','17','18','22','25','26','27','29','30','31','32','33','34','35','37','38','39','40','42','43','45','46','48','50','51','52','54','56','58','60','61','62','66','68','69','71','72','73','75','76','77','80','84','91','94','96','97','bh25']);
