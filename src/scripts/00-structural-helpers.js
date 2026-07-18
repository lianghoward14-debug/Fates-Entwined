//  STRUCTURAL HELPERS
//  Shared utilities used to keep state resets, card instances, and UI cleanup
//  consistent across the game. This reduces "patches on patches" drift.

function createEmptyBoard(zoneCount = 3, rowCount = 3, colCount = 3) {
  return Array.from({ length: zoneCount }, () =>
    Array.from({ length: rowCount }, () => Array(colCount).fill(null))
  );
}

function createEmptyExtraCells(zoneCount = 3, rowCount = 3) {
  return Array.from({ length: zoneCount }, () =>
    Array.from({ length: rowCount }, () => ({ p1: 0, p2: 0 }))
  );
}

function getPerspectivePlayerIndex() {
  if (typeof G === 'undefined' || !G) return 0;
  if (typeof G.viewerPlayerIndex === 'number') return G.viewerPlayerIndex;
  if (typeof G.localPlayerIndex === 'number') return G.localPlayerIndex;
  if (typeof G._onlinePlayerIndex === 'number') return G._onlinePlayerIndex;
  if (G.aiEnabled) return 1 - G.aiPlayer;
  return typeof G.currentPlayer === 'number' ? G.currentPlayer : 0;
}

function getPerspectiveOpponentIndex() {
  return 1 - getPerspectivePlayerIndex();
}

function isPerspectivePlayer(player) {
  return getPerspectivePlayerIndex() === player;
}

function shouldShowPlayerEffectFeedback(player) {
  if (typeof G === 'undefined' || !G) return true;
  if (!G._onlineApplyingRemoteAction) return true;
  if (!Number.isInteger(G._onlinePlayerIndex) || !Number.isInteger(G._onlineRemoteActionPlayer)) return true;
  if (Number(G._onlineRemoteActionPlayer) !== Number(player)) return true;
  return Number(player) === Number(G._onlinePlayerIndex);
}

function getBoardRowCapacity(z, r) {
  if (typeof G === 'undefined' || !G || !G.board || !G.board[z] || !G.board[z][r]) {
    return 3;
  }
  let extraCols = 0;
  if (G.extraCells && G.extraCells[z] && G.extraCells[z][r]) {
    if (r === 2) extraCols = Number(G.extraCells[z][r].p1) || 0;
    else if (r === 0) extraCols = Number(G.extraCells[z][r].p2) || 0;
  }
  return Math.max(G.board[z][r].length, 3 + extraCols);
}

function getSafeRowForPlayer(player) {
  return player === 0 ? 2 : 0;
}

function getBoardRowOwner(z, r) {
  if (r === 0) return 1;
  if (r === 1) return -1;
  if (r === 2) return 0;
  if (r >= 3) return getExtraSafeRowOwner(z, r);
  return null;
}

function isZoeBlockTargetAllowed(z, r, c, owner) {
  const opponent = owner === 0 ? 1 : 0;
  if (r === 1) return true;
  if (r >= 3 && !isFullExtraSafeRow(z, r)) {
    return isMarkSafeSquare(z, r, c, opponent);
  }
  return getBoardRowOwner(z, r) === opponent;
}

function ensureMarkSafeSquareState() {
  if (typeof G === 'undefined' || !G) return [];
  if (!Array.isArray(G.markSafeSquares)) G.markSafeSquares = [];
  return G.markSafeSquares;
}

function ensureExtraRowOwnerState(z = null) {
  if (typeof G === 'undefined' || !G) return [];
  if (!Array.isArray(G.extraRows)) G.extraRows = [0, 0, 0];
  if (!Array.isArray(G.extraRowOwners)) G.extraRowOwners = [[], [], []];
  for (let zi = 0; zi < 3; zi++) {
    if (!Array.isArray(G.extraRowOwners[zi])) G.extraRowOwners[zi] = [];
    const legacyOwner = G.extraRowFullOwners && typeof G.extraRowFullOwners[zi] === 'number'
      ? G.extraRowFullOwners[zi]
      : null;
    const hasCanonicalFullOwner = G.extraRowOwners[zi].some(owner => typeof owner === 'number');
    const firstExtraRowHasMarkSquare = Array.isArray(G.markSafeSquares)
      && G.markSafeSquares.some(s => s && s.z === zi && s.r === 3);
    if (legacyOwner !== null && !hasCanonicalFullOwner && !firstExtraRowHasMarkSquare && typeof G.extraRowOwners[zi][0] !== 'number') {
      G.extraRowOwners[zi][0] = legacyOwner;
    }
    const count = Number(G.extraRows[zi]) || 0;
    while (G.extraRowOwners[zi].length < count) G.extraRowOwners[zi].push(null);
  }
  return z === null ? G.extraRowOwners : G.extraRowOwners[z];
}

function getNextExtraRowIndex(z) {
  ensureExtraRowOwnerState(z);
  return 3 + (Number(G.extraRows[z]) || 0);
}

function isFullExtraSafeRow(z, r = null) {
  if (typeof G === 'undefined' || !G) return false;
  const owners = ensureExtraRowOwnerState(z);
  if (typeof r === 'number' && r >= 3) return typeof owners[r - 3] === 'number';
  if (owners.some(owner => typeof owner === 'number')) return true;
  if (!G.board || !G.board[z]) return false;
  for (let rr = 0; rr < G.board[z].length; rr++) {
    const row = G.board[z][rr] || [];
    for (let cc = 0; cc < row.length; cc++) {
      const card = row[cc];
      if (card && card.id === '02') return true;
    }
  }
  return false;
}

function getExtraSafeRowOwner(z, r = null) {
  if (typeof G === 'undefined' || !G) return 0;
  const owners = ensureExtraRowOwnerState(z);
  if (typeof r === 'number' && r >= 3 && typeof owners[r - 3] === 'number') {
    return owners[r - 3];
  }
  if (typeof r === 'number' && r >= 3) {
    const mark = G.markSafeSquares && G.markSafeSquares.find(s => s && s.z === z && s.r === r);
    return mark && typeof mark.owner === 'number' ? mark.owner : 0;
  }
  for (let i = owners.length - 1; i >= 0; i--) {
    if (typeof owners[i] === 'number') return owners[i];
  }
  if (G.markSafeSquares) {
    const mark = G.markSafeSquares.find(s => s && s.z === z && (typeof r !== 'number' || s.r === r));
    if (mark && typeof mark.owner === 'number') return mark.owner;
  }
  if (G.board && G.board[z]) {
    for (let rr = 0; rr < G.board[z].length; rr++) {
      const row = G.board[z][rr] || [];
      for (let cc = 0; cc < row.length; cc++) {
        const card = row[cc];
        if (card && card.id === '02') return card.owner;
      }
    }
  }
  return 0;
}

function isMarkSafeSquare(z, r, c, player = null) {
  const squares = ensureMarkSafeSquareState();
  return squares.some(s => s && s.z === z && s.r === r && s.c === c && (player === null || s.owner === player));
}

function getMarkSafeSquareRowsForPlayer(z, player) {
  const squares = ensureMarkSafeSquareState();
  const rows = [];
  squares.forEach(s => {
    if (!s || s.z !== z || s.owner !== player || !Number.isInteger(s.r)) return;
    if (!rows.includes(s.r)) rows.push(s.r);
  });
  return rows.sort((a, b) => a - b);
}

function getMarkSafeSquareChoiceRow(z, player) {
  if (typeof G === 'undefined' || !G || !G.board || !G.board[z]) return -1;
  ensureExtraRowOwnerState(z);
  const rows = getMarkSafeSquareRowsForPlayer(z, player);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (isFullExtraSafeRow(z, row)) continue;
    let open = 0;
    for (let c = 0; c < 3; c++) {
      const occupied = !!(G.board[z] && G.board[z][row] && G.board[z][row][c]);
      if (!occupied && !isMarkSafeSquare(z, row, c)) open++;
    }
    if (open > 0) return row;
  }
  return rows.length ? -1 : getNextExtraRowIndex(z);
}

function addBottomSafeSquareForPlayer(z, player, c = 1) {
  if (typeof G === 'undefined' || !G || !G.board || !G.board[z]) return null;
  const col = Math.max(0, Math.min(2, Number(c) || 0));
  ensureExtraRowOwnerState(z);
  const row = getMarkSafeSquareChoiceRow(z, player);
  if (row < 3) return null;
  const neededExtraRows = row - 2;
  while ((Number(G.extraRows[z]) || 0) < neededExtraRows) {
    G.extraRows[z] = (Number(G.extraRows[z]) || 0) + 1;
    if (!Array.isArray(G.extraRowOwners[z])) G.extraRowOwners[z] = [];
    G.extraRowOwners[z][G.extraRows[z] - 1] = null;
  }
  if (!G.board[z][row]) G.board[z][row] = Array(3).fill(null);
  const squares = ensureMarkSafeSquareState();
  if (G.board[z][row][col]) return null;
  if (squares.some(s => s.z === z && s.r === row && s.c === col)) return null;
  squares.push({ z, r: row, c: col, owner: player, source: 'mark' });
  if (typeof window !== 'undefined') {
    window.FATE_RUNTIME_FORCE_DOM_BOARD = true;
    window.FATE_FORCE_DOM_BOARD_UNTIL = (typeof performance !== 'undefined' && performance.now) ? performance.now() + 3000 : Date.now() + 3000;
    document.documentElement.classList.remove('fate-canvas-board-mode');
    const canvas = document.getElementById('fate-board-canvas');
    if (canvas) canvas.style.display = 'none';
    if (typeof window.invalidateFateRenderCaches === 'function') window.invalidateFateRenderCaches();
  }
  return { z, r: row, c: col };
}

function isPlayableSafeSquare(z, r, c, player) {
  if (r < 3) return true;
  if (isFullExtraSafeRow(z, r)) return getExtraSafeRowOwner(z, r) === player;
  return isMarkSafeSquare(z, r, c, player);
}

function addSafeSquareForPlayer(z, player) {
  if (typeof G === 'undefined' || !G || !G.board || !G.board[z]) return null;
  if (!G.extraCells) G.extraCells = createEmptyExtraCells();
  const row = getSafeRowForPlayer(player);
  if (!G.extraCells[z]) G.extraCells[z] = Array.from({ length: 3 }, () => ({ p1: 0, p2: 0 }));
  if (!G.extraCells[z][row]) G.extraCells[z][row] = { p1: 0, p2: 0 };
  if (!G.board[z][row]) G.board[z][row] = Array(3).fill(null);
  const key = player === 0 ? 'p1' : 'p2';
  G.extraCells[z][row][key] = (Number(G.extraCells[z][row][key]) || 0) + 1;
  const targetLen = 3 + G.extraCells[z][row][key];
  while (G.board[z][row].length < targetLen) G.board[z][row].push(null);
  return { z, r: row, c: targetLen - 1 };
}

function getFateRng() {
  if (typeof G !== 'undefined' && G && typeof G._onlineRng === 'function') return G._onlineRng;
  return Math.random;
}

function initLandscapeForSong(song) {
  if (typeof G === 'undefined' || !G) return null;
  if ((typeof _tutorialActive !== 'undefined' && _tutorialActive) || (typeof CURRENT_MODE !== 'undefined' && CURRENT_MODE === 'tutorial')) {
    G.landscapeId = null;
    G.landscape = null;
    G.landscapeBgNum = null;
    G._landscapeState = null;
    if (typeof renderLandscapePanel === 'function') renderLandscapePanel();
    return null;
  }
  const bgNum = Math.max(1, Math.min(16, parseInt(String(song || 'board1').replace('board', ''), 10) || 1));
  const id = 'igb' + bgNum;
  const landscape = (typeof LANDSCAPES !== 'undefined' && LANDSCAPES) ? LANDSCAPES[id] : null;
  G.landscapeId = id;
  G.landscape = landscape || null;
  G.landscapeBgNum = bgNum;
  if (!G._landscapeState || G._landscapeState.id !== id) {
    const rng = getFateRng();
    G._landscapeState = {
      id,
      targetZone: (landscape && landscape.needsTargetZone) ? Math.floor(rng() * 3) : null,
      consolidations: [0, 0],
      zoneFateBonuses: [[0, 0, 0], [0, 0, 0]],
      resolvedTurns: {},
      eventideMovedIids: {},
      drawPhaseCounts: [0, 0],
      supporterEffectsThisTurn: [0, 0]
    };
  }
  if (typeof applyContinuousEffects === 'function') applyContinuousEffects();
  if (typeof renderLandscapePanel === 'function') renderLandscapePanel();
  return landscape;
}

function getCurrentLandscape() {
  if (typeof G === 'undefined' || !G) return null;
  if (G.landscape) return G.landscape;
  const id = G.landscapeId || null;
  return id && typeof LANDSCAPES !== 'undefined' ? LANDSCAPES[id] : null;
}

function isLandscapeActive(id) {
  const landscape = getCurrentLandscape();
  return !!(landscape && landscape.id === id);
}

function getLandscapeState() {
  if (typeof G === 'undefined' || !G) return null;
  if (!G._landscapeState) G._landscapeState = { id:G.landscapeId || '', consolidations:[0,0], zoneFateBonuses:[[0,0,0],[0,0,0]], resolvedTurns:{}, eventideMovedIids:{}, drawPhaseCounts:[0,0], supporterEffectsThisTurn:[0,0] };
  if (!Array.isArray(G._landscapeState.consolidations)) G._landscapeState.consolidations = [0,0];
  if (!Array.isArray(G._landscapeState.zoneFateBonuses)) G._landscapeState.zoneFateBonuses = [[0,0,0],[0,0,0]];
  if (!G._landscapeState.resolvedTurns) G._landscapeState.resolvedTurns = {};
  if (!G._landscapeState.eventideMovedIids) G._landscapeState.eventideMovedIids = {};
  if (!Array.isArray(G._landscapeState.drawPhaseCounts)) G._landscapeState.drawPhaseCounts = [0,0];
  if (!Array.isArray(G._landscapeState.supporterEffectsThisTurn)) G._landscapeState.supporterEffectsThisTurn = [0,0];
  const landscape = getCurrentLandscape();
  if (landscape && landscape.needsTargetZone && typeof G._landscapeState.targetZone !== 'number') {
    G._landscapeState.targetZone = Math.floor(getFateRng() * 3);
  }
  return G._landscapeState;
}

function getLandscapeZoneFateBonus(player, z) {
  const st = getLandscapeState();
  return Number(st && st.zoneFateBonuses && st.zoneFateBonuses[player] && st.zoneFateBonuses[player][z]) || 0;
}

function getLandscapeFateCapForZone(z) {
  return null;
}

function getLandscapeTotalFate(player) {
  if (typeof G === 'undefined' || !G || !Array.isArray(G.board)) return 0;
  let total = 0;
  G.board.forEach(function(zone, z){
    if (!Array.isArray(zone)) return;
    zone.forEach(function(row){
      if (!Array.isArray(row)) return;
      row.forEach(function(card){
        if (!card || card.owner !== player) return;
        const hidden = typeof isFaceDownCard === 'function' && isFaceDownCard(card);
        if (hidden) return;
        const value = typeof getEffectiveFate === 'function'
          ? getEffectiveFate(card, z)
          : (card.currentFate ?? card.fate ?? 0);
        total += Math.max(0, Number(value) || 0);
      });
    });
  });
  return total;
}

function getFlowingCurrentsLeader() {
  if (!isLandscapeActive('igb5')) return null;
  const p0 = getLandscapeTotalFate(0);
  const p1 = getLandscapeTotalFate(1);
  if (p0 === p1) return null;
  return p0 > p1 ? 0 : 1;
}

function addLandscapeZoneFateBonus(player, z, amount, sfxKind = 'major') {
  const st = getLandscapeState();
  if (!st) return false;
  if (!Array.isArray(st.zoneFateBonuses[player])) st.zoneFateBonuses[player] = [0,0,0];
  st.zoneFateBonuses[player][z] = (Number(st.zoneFateBonuses[player][z]) || 0) + (Number(amount) || 0);
  if (typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('Landscape effect applied', sfxKind);
  if (typeof renderGame === 'function') renderGame({scores:true, landscape:true});
  return true;
}

function addFullExtraSafeRowForPlayer(z, player, source, opts = {}) {
  if (typeof G === 'undefined' || !G || !G.board || !G.board[z]) return false;
  ensureExtraRowOwnerState(z);
  const row = getNextExtraRowIndex(z);
  const hadExtraRowStructure = row > 3 || (Array.isArray(G.markSafeSquares) && G.markSafeSquares.some(s => s && s.z === z));
  G.extraRows[z] = (Number(G.extraRows[z]) || 0) + 1;
  if (!G.board[z][row]) G.board[z][row] = Array(3).fill(null);
  G.extraRowOwners[z][row - 3] = player;
  if (!Array.isArray(G.extraRowFullOwners)) G.extraRowFullOwners = [null, null, null];
  G.extraRowFullOwners[z] = hadExtraRowStructure ? null : player;
  if (opts.landscape !== false && typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash(source || 'Landscape row created', opts.sfxKind || 'major');
  if (typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
  return true;
}

function isDiscardRecoveryBlockedByLandscape() {
  return isLandscapeActive('igb4');
}

function getRecoverableDiscardCards(player, filter) {
  if (isDiscardRecoveryBlockedByLandscape()) return [];
  const discard = G && G.players && G.players[player] ? (G.players[player].discard || []) : [];
  return typeof filter === 'function' ? discard.filter(filter) : discard.slice();
}

function applyLandscapePlacementBonuses(card, z, r, c) {
  if (!card) return 0;
  if (!Array.isArray(card._landscapeBonusIds)) card._landscapeBonusIds = [];
  if (isCardEffectImmutable(card)) return 0;
  let bonus = 0;
  let playFeedback = false;
  if (isLandscapeActive('igb6') && card.aff === 'reality' && !card._landscapeBonusIds.includes('igb6')) {
    card._landscapeBonusIds.push('igb6');
    bonus += 3;
    playFeedback = true;
  }
  if (isLandscapeActive('igb11') && card.type === 'Initiator' && !card._landscapeBonusIds.includes('igb11')) {
    card._landscapeBonusIds.push('igb11');
    bonus += 3;
    playFeedback = true;
  }
  if (isLandscapeActive('igb5') && card.owner === getFlowingCurrentsLeader() && !card._landscapeBonusIds.includes('igb5')) {
    card._landscapeBonusIds.push('igb5');
    bonus += 2;
  }
  if (bonus) {
    card._landscapeStaticFateBonus = (Number(card._landscapeStaticFateBonus) || 0) + bonus;
    const before = Math.max(0, Number(card.currentFate ?? card.fate ?? 0) || 0);
    card.currentFate = Math.max(0, before + bonus);
    if (playFeedback && typeof playFateChangeSound === 'function') playFateChangeSound(card, before, card.currentFate, card.owner);
    if (playFeedback && typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('Landscape Fate bonus', 'minor');
  }
  const cap = typeof getLandscapeFateCapForZone === 'function' ? getLandscapeFateCapForZone(z) : null;
  if (cap != null) {
    const before = Math.max(0, Number(card.currentFate ?? card.fate ?? 0) || 0);
    if (before > cap) {
      card.currentFate = cap;
      if (typeof playFateChangeSound === 'function') playFateChangeSound(card, before, cap, card.owner);
      if (typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('Landscape Fate cap', 'minor');
    }
  }
  return bonus;
}

function trackLandscapeConsolidation(player, card, z) {
  const st = getLandscapeState();
  if (!st) return 0;
  st.consolidations[player] = (Number(st.consolidations[player]) || 0) + 1;
  let bonus = 0;
  if (isLandscapeActive('igb3') && st.targetZone === z && G.turn < 10) {
    bonus = 4;
    if (card) {
      card._landscapeStaticFateBonus = (Number(card._landscapeStaticFateBonus) || 0) + bonus;
      const before = Math.max(0, Number(card.currentFate ?? card.fate ?? 0) || 0);
      card.currentFate = Math.max(0, before + bonus);
      if (typeof playFateChangeSound === 'function') playFateChangeSound(card, before, card.currentFate, player);
      if (!Array.isArray(card._landscapeBonusIds)) card._landscapeBonusIds = [];
      card._landscapeBonusIds.push('igb3');
    }
    if (typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('Anchorage landscape bonus', 'minor');
  }
  return bonus;
}

function refreshStatusEffectsNow() {
  if (typeof applyContinuousEffects === 'function') applyContinuousEffects();
  if (typeof renderTopbarEffects === 'function') renderTopbarEffects();
  if (typeof updateTopBar === 'function') updateTopBar();
}

function createCardInstance(cardDef, owner) {
  const card = { ...cardDef };
  if (typeof G !== 'undefined' && G && typeof card.iid !== 'number') {
    G.instanceCounter = (G.instanceCounter || 0) + 1;
    card.iid = G.instanceCounter;
  }
  if (typeof owner === 'number') card.owner = owner;
  else if (typeof card.owner !== 'number') card.owner = 0;
  if (card.currentFate === undefined) card.currentFate = card.fate;
  if (card.bonusFate === undefined) card.bonusFate = 0;
  if (card.usesLeft === undefined) {
    card.usesLeft = card.id === '40' ? 2 : (card.id === '67' ? 1 : null);
  }
  if (card.immuneFlag === undefined) card.immuneFlag = false;
  if (card.cantBeReduced === undefined) card.cantBeReduced = false;
  if (card.cantBeMoved === undefined) card.cantBeMoved = false;
  if (card.faceDown === undefined) card.faceDown = false;
  applyPermanentEffectImmunity(card);
  return card;
}

function isFaceDownCard(card) {
  return !!(card && card.faceDown);
}

function isAlpineInfantryCard(card) {
  return !!(card && String(card.id || '') === '76');
}

function isSouthWindSpearmanCard(card) {
  return !!(card && (String(card.id || '') === '20' || (typeof cardActsAsPassive === 'function' && cardActsAsPassive(card, '20'))));
}

function isCardEffectImmutable(card) {
  return isAlpineInfantryCard(card);
}

function isOpponentEffectOnlyImmuneCard(card) {
  return isSouthWindSpearmanCard(card);
}

function isTargetImmuneToEffectOwner(card, effectOwner) {
  if (!card || isFaceDownCard(card)) return false;
  if (isCardEffectImmutable(card) || card.immuneFlag === true || card.opponentEffectImmune === true) return true;
  return isOpponentEffectOnlyImmuneCard(card) && typeof effectOwner === 'number' && Number(card.owner) !== Number(effectOwner);
}

function isFullyEffectImmuneCard(card) {
  if (!card || isFaceDownCard(card)) return false;
  return isCardEffectImmutable(card) || card.immuneFlag === true || card.opponentEffectImmune === true;
}

function applyPermanentEffectImmunity(card) {
  if (!isCardEffectImmutable(card)) return false;
  card.immuneFlag = true;
  card.noBonus = true;
  card.noConsolidate = true;
  card.cantBeReduced = true;
  card._effectImmutable = true;
  delete card._wciBonus;
  delete card._handCostDelta;
  delete card._reinforcementBonus;
  delete card._markedForDeath;
  delete card._reinforcementOverride;
  return true;
}

function canViewerSeeFaceDownCard(card, viewerP = getPerspectivePlayerIndex()) {
  if (!card) return false;
  return !isFaceDownCard(card) || card.owner === viewerP;
}

function getLiveCardFate(card) {
  if (!card) return 0;
  if (typeof card.currentFate === 'number') return card.currentFate;
  return typeof card.fate === 'number' ? card.fate : 0;
}

function markEffectFateVisualDelta(card, beforeValue, afterValue, source = 'effect') {
  if (!card) return false;
  const before = Math.max(0, Number(beforeValue) || 0);
  const after = Math.max(0, Number(afterValue) || 0);
  if (before === after) return false;
  card._effectFateVisualSeq = (Number(card._effectFateVisualSeq) || 0) + 1;
  card._effectFateVisualDelta = {
    seq: card._effectFateVisualSeq,
    before,
    after,
    delta: after - before,
    source: String(source || 'effect'),
    at: Date.now()
  };
  return true;
}

function shouldShowEffectFateVisualDelta(card, beforeValue, afterValue) {
  if (!card || !card._effectFateVisualDelta) return false;
  const marker = card._effectFateVisualDelta;
  const before = Math.max(0, Number(beforeValue) || 0);
  const after = Math.max(0, Number(afterValue) || 0);
  if (before === after) return false;
  if (Number(marker.before) !== before || Number(marker.after) !== after) return false;
  if (Number(marker.delta) !== after - before) return false;
  return Date.now() - (Number(marker.at) || 0) <= 3500;
}

function getPrintedFateLabel(card) {
  if (!card) return '';
  return card.xFate ? 'X' : card.fate;
}

function cardNameMatchesAny(card, names) {
  if (!card || !card.name || !Array.isArray(names)) return false;
  const normalized = String(card.name).toLowerCase();
  return names.some(name => normalized.includes(String(name).toLowerCase()));
}

function controlsNamedCard(owner, names, opts = {}) {
  if (typeof owner !== 'number' || typeof forEachBoardCard !== 'function') return false;
  let found = false;
  forEachBoardCard(function(card) {
    if(found || !card || card.owner !== owner || isFaceDownCard(card)) return;
    if(opts.excludeIid != null && card.iid === opts.excludeIid) return;
    if(cardNameMatchesAny(card, names)) found = true;
  });
  return found;
}

function getPlayerForHandCard(card) {
  if (!card || typeof G === 'undefined' || !G || !Array.isArray(G.players)) return typeof card?.owner === 'number' ? card.owner : 0;
  for (let p = 0; p < G.players.length; p++) {
    if (G.players[p] && Array.isArray(G.players[p].hand) && G.players[p].hand.some(c => c && c.iid === card.iid)) return p;
  }
  return typeof card.owner === 'number' ? card.owner : 0;
}

function playerHasMoreCharactersThanSupportersInHand(owner) {
  if (typeof G === 'undefined' || !G || !G.players || !G.players[owner]) return false;
  let characters = 0, supporters = 0;
  G.players[owner].hand.forEach(function(card) {
    if(!card) return;
    if(typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(card, owner) : card.type === 'Supporter') supporters++;
    if(typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(card, owner) : card.type !== 'Supporter') characters++;
  });
  return characters > supporters;
}

function cardUsesCharacterConsolidationTributes(card) {
  return !!(card && (card.id === '99' || card.id === '100'));
}

function isBlameGameActive(owner) {
  const fx = G && Array.isArray(G._blameGameEffects) ? G._blameGameEffects[owner] : null;
  return !!(fx && fx.active && (Number(fx.turnsLeft) || 0) > 0);
}

function isCardSupporterForRules(card, owner) {
  if(!card || card.type !== 'Supporter') return false;
  const resolvedOwner = typeof owner === 'number' ? owner : card.owner;
  return !isBlameGameActive(resolvedOwner);
}

function isCardCharacterForRules(card, owner) {
  if(!card) return false;
  if(card.type !== 'Supporter') return true;
  const resolvedOwner = typeof owner === 'number' ? owner : card.owner;
  return isBlameGameActive(resolvedOwner);
}

const FELICYTA_TIMED_LANDSCAPE_TURNS = Object.freeze({igb2:14, igb8:10});

function getTimedLandscapeResolutionTurn(id) {
  return Number(FELICYTA_TIMED_LANDSCAPE_TURNS[String(id || '')]) || 0;
}

function getFelicitaLandscapeChangeBlockReason(targetId) {
  if(typeof G === 'undefined' || !G) return '';
  const turn = Math.max(1, Number(G.turn) || 1);
  const current = typeof getCurrentLandscape === 'function' ? getCurrentLandscape() : null;
  const currentId = String((current && current.id) || G.landscapeId || '');
  const nextId = String(targetId || '');
  const state = typeof getLandscapeState === 'function' ? getLandscapeState() : G._landscapeState;
  const resolvedTurns = state && state.resolvedTurns ? state.resolvedTurns : {};
  const currentResolutionTurn = getTimedLandscapeResolutionTurn(currentId);
  if(currentResolutionTurn && !resolvedTurns[currentId] && turn >= currentResolutionTurn - 4 && (!nextId || nextId !== currentId)) {
    const currentName = currentId === 'igb2' ? 'ALPINE Headquarters' : 'Qingdao';
    return currentName + ' resolves on turn ' + currentResolutionTurn + ' and cannot be changed away from during its final four turns.';
  }
  const nextResolutionTurn = getTimedLandscapeResolutionTurn(nextId);
  if(nextResolutionTurn && nextId !== currentId && turn >= nextResolutionTurn - 4) {
    const nextName = nextId === 'igb2' ? 'ALPINE Headquarters' : 'Qingdao';
    return nextName + ' resolves on turn ' + nextResolutionTurn + ' and cannot be entered during its final four turns.';
  }
  return '';
}

function showFelicitaLandscapeChangeBlockedBanner(reason) {
  const text = String(reason || 'This timed landscape cannot be changed right now.');
  if(typeof toast === 'function') toast('Landscape Change Blocked: ' + text);
  if(typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('Landscape change blocked', 'major');
  if(typeof showBlockedAnimation === 'function') showBlockedAnimation('LANDSCAPE CHANGE BLOCKED');
  else if(typeof playSfx === 'function') playSfx('blocked');
}

function ensureAdministrativeBloatEffects() {
  if(typeof G === 'undefined' || !G) return [];
  if(!Array.isArray(G._administrativeBloatEffects)) G._administrativeBloatEffects = [];
  G._administrativeBloatEffects = G._administrativeBloatEffects.filter(function(effect){
    return effect && (effect.target === 0 || effect.target === 1) && (Number(effect.remaining) || 0) > 0;
  });
  return G._administrativeBloatEffects;
}

function getAdministrativeBloatCostPenalty(owner) {
  return ensureAdministrativeBloatEffects().reduce(function(total, effect){
    if(Number(effect.target) !== Number(owner)) return total;
    return total + Math.max(0, Number(effect.amount) || 1);
  }, 0);
}

function activateAdministrativeBloat(sourceOwner, sourceCard) {
  const owner = Number(sourceOwner);
  if(owner !== 0 && owner !== 1) return false;
  ensureAdministrativeBloatEffects().push({
    target:1 - owner,
    sourceOwner:owner,
    sourceIid:sourceCard && sourceCard.iid != null ? sourceCard.iid : null,
    remaining:2,
    amount:1
  });
  return true;
}

function consumeAdministrativeBloatForPlayer(owner) {
  let consumed = 0;
  ensureAdministrativeBloatEffects().forEach(function(effect){
    if(Number(effect.target) !== Number(owner)) return;
    effect.remaining = Math.max(0, (Number(effect.remaining) || 0) - 1);
    consumed++;
  });
  ensureAdministrativeBloatEffects();
  return consumed;
}

function isSnowOnCarpathiansLandscapeActive() {
  const landscape = typeof getCurrentLandscape === 'function' ? getCurrentLandscape() : null;
  const name = String((landscape && (landscape.name || landscape.shortName)) || '').toLowerCase();
  return name.includes('snow on the carpathians') || name.includes('carpathian');
}

function getPlacedCardFate(card, options = {}) {
  if (!card) return 0;
  applyPermanentEffectImmunity(card);
  const printedFate = typeof card.fate === 'number' ? card.fate : 0;
  if (isAlpineInfantryCard(card)) return printedFate + 4;
  const tributeCount = typeof options.tributeCount === 'number' ? options.tributeCount : 0;
  const bonusFate = typeof options.bonusFate === 'number' ? options.bonusFate : 0;
  const carriedDelta = getLiveCardFate(card) - printedFate;
  const basePlacedFate = printedFate;
  let placedFate = basePlacedFate + carriedDelta;
  if (!isCardEffectImmutable(card)) {
    placedFate += bonusFate;
    if (card._wciBonus) placedFate += 2;
  }
  return placedFate;
}

function getDisplayedCardCost(card) {
  if (!card) return 0;
  applyPermanentEffectImmunity(card);
  const owner = getPlayerForHandCard(card);
  const hasConditionalFreeCost = (card.id === '86' && playerHasMoreCharactersThanSupportersInHand(owner)) ||
    (card.id === '99' && controlsNamedCard(owner, ['Rozsi', 'Zsofia']));
  const bloatPenalty = isCardCharacterForRules(card, owner) ? getAdministrativeBloatCostPenalty(owner) : 0;
  const printedCost = hasConditionalFreeCost ? 0 : (typeof card.cost === 'number' ? card.cost : 0);
  if (isCardEffectImmutable(card)) return Math.max(0, printedCost + bloatPenalty);
  return Math.max(0, printedCost + (Number(card._handCostDelta) || 0) + bloatPenalty);
}

function recordHandCardEffectModifier(card, effect) {
  if (!card || !effect) return false;
  const key = String(effect.key || effect.name || 'effect');
  if (!Array.isArray(card._handEffectModifiers)) card._handEffectModifiers = [];
  let row = card._handEffectModifiers.find(function(item){ return item && item.key === key; });
  if (!row) {
    row = {
      key,
      name: String(effect.name || 'Effect'),
      text: String(effect.text || ''),
      fateDelta: 0,
      costDelta: 0
    };
    card._handEffectModifiers.push(row);
  }
  if (effect.name) row.name = String(effect.name);
  if (effect.text) row.text = String(effect.text);
  if (Number(effect.fateDelta)) row.fateDelta = (Number(row.fateDelta) || 0) + Number(effect.fateDelta);
  if (Number(effect.costDelta)) row.costDelta = (Number(row.costDelta) || 0) + Number(effect.costDelta);
  row.at = Date.now();
  return true;
}

function getHandCardEffectModifiers(card) {
  if (!card || isCardEffectImmutable(card)) return [];
  const rows = [];
  const seen = new Set();
  function addRow(row) {
    if (!row) return;
    const key = String(row.key || row.name || rows.length);
    if (seen.has(key)) return;
    seen.add(key);
    const fateDelta = Number(row.fateDelta) || 0;
    const costDelta = Number(row.costDelta) || 0;
    let text = String(row.text || '');
    const parts = [];
    if (fateDelta) parts.push((fateDelta > 0 ? '+' : '') + fateDelta + ' Fate');
    if (costDelta) parts.push((costDelta > 0 ? '+' : '') + costDelta + ' Reinforcement cost');
    if (!text) text = parts.join(', ') || 'Card modified.';
    rows.push({ key, name:String(row.name || 'Effect'), text, fateDelta, costDelta });
  }
  if (Array.isArray(card._handEffectModifiers)) card._handEffectModifiers.forEach(addRow);
  if (card._wciBonus || Number(card._handCostDelta)) {
    addRow({
      key:'west-caribbea-infantry',
      name:'West Caribbea Infantry',
      text:'The Company\'s Finest: -1 Reinforcement cost, +2 Fate when set.',
      fateDelta:card._wciBonus ? 2 : 0,
      costDelta:Number(card._handCostDelta) || 0
    });
  }
  const printed = Number(card.fate);
  const current = Number(card.currentFate);
  if (Number.isFinite(printed) && Number.isFinite(current) && current !== printed && !rows.some(function(row){ return Number(row.fateDelta) !== 0; })) {
    addRow({
      key:'fate-modified',
      name:'Fate Modified',
      text:(current > printed ? '+' : '') + (current - printed) + ' Fate from an active effect.',
      fateDelta:current - printed
    });
  }
  return rows;
}

function getSupportReinforcementValue(card) {
  if (!card) return 0;
  applyPermanentEffectImmunity(card);
  if (isCardEffectImmutable(card)) {
    if (card.id === '86') return 3;
    if (card.id === '09') return 2;
    if (card.id === '37' && card._returnUsed) return 0.5;
    return 1;
  }
  if (card._markedForDeath) return 0; // Vigilantes: marked cards have 0 reinforcement
  let value = 1;
  if (card.id === '86') value = 3;
  if (card.id === '09') value = 2;
  if (card.id === '37' && card._returnUsed) value = 0.5;
  if (Number(card._reinforcementBonus)) value += Number(card._reinforcementBonus);
  if (isLandscapeActive('igb10') && isCardSupporterForRules(card, card.owner) && card.aff === 'third_great_war') value += 1;
  return value;
}

function ensureUsMarinesUses() {
  if (typeof G === 'undefined' || !G) return [0, 0];
  if (!Array.isArray(G.usMarinesUses)) G.usMarinesUses = [0, 0];
  G.usMarinesUses[0] = Math.max(0, Number(G.usMarinesUses[0]) || 0);
  G.usMarinesUses[1] = Math.max(0, Number(G.usMarinesUses[1]) || 0);
  return G.usMarinesUses;
}

function getUsMarinesUses(player) {
  const uses = ensureUsMarinesUses();
  return Math.max(0, Number(uses[player]) || 0);
}

function canActivateUsMarinesEffect(player) {
  return getUsMarinesUses(player) < 3;
}

function recordUsMarinesEffectUse(player) {
  const uses = ensureUsMarinesUses();
  uses[player] = Math.min(3, getUsMarinesUses(player) + 1);
  return uses[player];
}

function activateUsMarinesSuppressionEffect(player, opponent, options) {
  options = options || {};
  if (!canActivateUsMarinesEffect(player)) {
    if (!options.silent && typeof toast === 'function') toast('1st US Marines effect has already been activated three times this game.');
    return false;
  }
  const used = recordUsMarinesEffectUse(player);
  G.oppSuppressedNextTurn = true;
  G.suppressTarget = opponent;
  if (!options.silent && typeof toast === 'function') toast('Opponent supporter effects suppressed next turn! (' + used + '/3)');
  if (typeof updateTopBar === 'function') updateTopBar();
  if (typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
  return true;
}

function consumePendingPlacementFlags(sourceCard, placedCard) {
  if (sourceCard && sourceCard._wciBonus) delete sourceCard._wciBonus;
  if (placedCard && placedCard._wciBonus) delete placedCard._wciBonus;
  if (sourceCard && sourceCard._handCostDelta) delete sourceCard._handCostDelta;
  if (placedCard && placedCard._handCostDelta) delete placedCard._handCostDelta;
  if (sourceCard && sourceCard._handEffectModifiers) delete sourceCard._handEffectModifiers;
  if (placedCard && placedCard._handEffectModifiers) delete placedCard._handEffectModifiers;
}

if (typeof window !== 'undefined') {
  window.isAlpineInfantryCard = isAlpineInfantryCard;
  window.isSouthWindSpearmanCard = isSouthWindSpearmanCard;
  window.isCardEffectImmutable = isCardEffectImmutable;
  window.isOpponentEffectOnlyImmuneCard = isOpponentEffectOnlyImmuneCard;
  window.isTargetImmuneToEffectOwner = isTargetImmuneToEffectOwner;
  window.isFullyEffectImmuneCard = isFullyEffectImmuneCard;
  window.applyPermanentEffectImmunity = applyPermanentEffectImmunity;
  window.recordHandCardEffectModifier = recordHandCardEffectModifier;
  window.getHandCardEffectModifiers = getHandCardEffectModifiers;
  window.isCardSupporterForRules = isCardSupporterForRules;
  window.isCardCharacterForRules = isCardCharacterForRules;
  window.getFelicitaLandscapeChangeBlockReason = getFelicitaLandscapeChangeBlockReason;
  window.showFelicitaLandscapeChangeBlockedBanner = showFelicitaLandscapeChangeBlockedBanner;
  window.getAdministrativeBloatCostPenalty = getAdministrativeBloatCostPenalty;
  window.activateAdministrativeBloat = activateAdministrativeBloat;
  window.consumeAdministrativeBloatForPlayer = consumeAdministrativeBloatForPlayer;
}

function purgeRetiredCardSetMotion() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('#placement-anim-layer, .placement-anim-ghost, .placement-anim-card').forEach(function(el){
    el.remove();
  });
  document.querySelectorAll('#s-game .bc.place-anim, #s-game .bc[class*="place-anim-"]').forEach(function(el){
    Array.from(el.classList).forEach(function(className){
      if (className === 'place-anim' || className.indexOf('place-anim-') === 0) el.classList.remove(className);
    });
    el.style.removeProperty('animation');
    el.style.removeProperty('transform');
    el.style.removeProperty('filter');
  });
}

function triggerPlacementAnimation() {
  purgeRetiredCardSetMotion();
  return 0;
}

const FATE_ENHANCED_VISUAL_FX_KEY = 'fateEnhancedVisualFx';
let _lastDiscardSfxAt = 0;

function isEnhancedVisualFxEnabled() {
  try { return localStorage.getItem(FATE_ENHANCED_VISUAL_FX_KEY) !== '0'; } catch(e) { return true; }
}

function applyEnhancedVisualFxState() {
  const enabled = isEnhancedVisualFxEnabled();
  document.documentElement.classList.toggle('fate-enhanced-fx', enabled);
  document.documentElement.classList.toggle('fate-animations-on', enabled);
  document.documentElement.classList.toggle('fate-animations-off', !enabled);
  document.body?.classList?.toggle('fate-enhanced-fx', enabled);
  document.body?.classList?.toggle('fate-animations-on', enabled);
  document.body?.classList?.toggle('fate-animations-off', !enabled);
  syncEnhancedVisualFxControls();
  return enabled;
}

function syncEnhancedVisualFxControls() {
  const enabled = isEnhancedVisualFxEnabled();
  document.querySelectorAll('[data-enhanced-fx-toggle],#enhanced-fx-toggle-btn').forEach(function(btn){
    btn.textContent = enabled ? 'Animations On' : 'Animations Off';
    btn.classList.toggle('off', !enabled);
    btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    btn.dataset.fxState = enabled ? 'on' : 'off';
    btn.title = enabled ? 'Extra card animations and cinematic effects are enabled' : 'Extra card animations and cinematic effects are disabled';
  });
}

function setEnhancedVisualFxEnabled(enabled) {
  try { localStorage.setItem(FATE_ENHANCED_VISUAL_FX_KEY, enabled ? '1' : '0'); } catch(e) {}
  applyEnhancedVisualFxState();
}

function toggleEnhancedVisualFx() {
  setEnhancedVisualFxEnabled(!isEnhancedVisualFxEnabled());
  if(typeof playSfx === 'function') playSfx(isEnhancedVisualFxEnabled() ? 'menuOpen' : 'menuClose');
}

function playDiscardSfx() {
  const now = Date.now();
  if(now - _lastDiscardSfxAt < 80) return;
  _lastDiscardSfxAt = now;
  if(typeof playSfx === 'function') playSfx('discard');
}

function showWineCountryGuerillaSentBanner(options = {}) {
  const message = 'Wine Country Guerilla was sent to opponent\'s hand.';
  if(typeof toast === 'function') toast(message, options.durationMs || 3600);
  return message;
}

function fatePushDiscard(playerIndex, cardOrCards, options = {}) {
  if(typeof G === 'undefined' || !G || !G.players || !G.players[playerIndex]) return false;
  const cards = Array.isArray(cardOrCards) ? cardOrCards.filter(Boolean) : (cardOrCards ? [cardOrCards] : []);
  if(!cards.length) return false;
  if(!Array.isArray(G.players[playerIndex].discard)) G.players[playerIndex].discard = [];
  const discarded = [];
  cards.forEach(function(card){
    if(card && String(card.id || '') === '70' && card.guerilla_transferred !== true && options.wineCountryReturn !== true){
      const holder = Number(playerIndex) === 0 ? 1 : 0;
      if(G.players[holder] && Array.isArray(G.players[holder].hand)){
        card.guerilla_transferred = true;
        card.guerilla_turnsLeft = 5;
        card.guerilla_owner = Number(playerIndex);
        G.players[holder].hand.push(card);
        showWineCountryGuerillaSentBanner();
        return;
      }
    }
    G.players[playerIndex].discard.push(card);
    discarded.push(card);
  });
  try {
    if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.prewarmAssetImages === 'function') {
      const srcs = discarded.map(function(card){
        const visual = card && card.visual;
        return (card && card.img) || (visual && visual.img) || (card && card.runtimeImg) || (visual && visual.runtimeImg) || '';
      }).filter(Boolean);
      if(srcs.length) window.FateMatchRendererAdapter.prewarmAssetImages(srcs);
    }
  } catch(e) {}
  if(options.sound !== false) playDiscardSfx();
  return true;
}

window.isEnhancedVisualFxEnabled = isEnhancedVisualFxEnabled;
window.applyEnhancedVisualFxState = applyEnhancedVisualFxState;
window.syncEnhancedVisualFxControls = syncEnhancedVisualFxControls;
window.setEnhancedVisualFxEnabled = setEnhancedVisualFxEnabled;
window.toggleEnhancedVisualFx = toggleEnhancedVisualFx;
window.playDiscardSfx = playDiscardSfx;
window.showWineCountryGuerillaSentBanner = showWineCountryGuerillaSentBanner;
window.fatePushDiscard = fatePushDiscard;
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyEnhancedVisualFxState);
else applyEnhancedVisualFxState();

function getPlacementUiDelayMs() {
  if (typeof G === 'undefined' || !G) return 0;
  return Math.max(0, (G._placementUiLockUntil || 0) - Date.now());
}

function getCinematicUiDelayMs() {
  if (typeof G === 'undefined' || !G) return 0;
  return Math.max(0, (G._cinematicUiLockUntil || 0) - Date.now());
}

function getSetEffectModalDelayMs() {
  if (typeof G === 'undefined' || !G) return 0;
  return Math.max(0, (G._setEffectModalLockUntil || 0) - Date.now());
}

function getInteractionAnimationDelayMs() {
  return Math.max(getPlacementUiDelayMs(), getCinematicUiDelayMs(), getSetEffectModalDelayMs());
}

function runAfterPlacementAnimation(callback, extraDelay = 0) {
  const wait = getInteractionAnimationDelayMs() + Math.max(0, extraDelay || 0);
  setTimeout(() => requestAnimationFrame(() => callback()), wait);
}

function resetInteractionState() {
  if (typeof G === 'undefined' || !G) return;
  G.selectedHandCard = null;
  G.selectedBoardCard = null;
  G.placing = false;
  G.placingCellFilter = null;
  G.blockingCell = false;
  G.consolidating = false;
  G._consolidating = null;
  G._wolfCreekMoving = null;
  G._expMoving = null;
  G._berkeleyMoving = null;
  G._bh01Moving = null;
  G._landscapeMoving = null;
  G._busserMoving = null;
  G._busserMovingCard = null;
  G._markSelecting = null;
  G._boardTargeting = null;
  if (typeof document !== 'undefined') {
    document.querySelectorAll('.cell.board-target-choice,.bc.board-target-choice-card,.cell.move-target').forEach(function(el){
      el.classList.remove('board-target-choice','board-target-choice-card','move-target');
    });
  }
}

function cleanupTransientGameTimers() {
  if (typeof G === 'undefined' || !G) return;
  if (G._handLimitDiscardTimer) {
    try { clearTimeout(G._handLimitDiscardTimer); } catch (e) {}
    G._handLimitDiscardTimer = null;
  }
  if (G._cardDetailModalDelayTimer) {
    try { clearTimeout(G._cardDetailModalDelayTimer); } catch (e) {}
    G._cardDetailModalDelayTimer = null;
  }
  if (Array.isArray(G._finalZoneRevealTimers)) {
    G._finalZoneRevealTimers.forEach(function(timer){
      try { clearTimeout(timer); } catch (e) {}
    });
    G._finalZoneRevealTimers = [];
  }
  if (typeof window !== 'undefined') {
    if (window.__fateFloatingZoneBannerRaf) {
      try { cancelAnimationFrame(window.__fateFloatingZoneBannerRaf); } catch (e) {}
      window.__fateFloatingZoneBannerRaf = 0;
    }
    if (window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.teardownScene === 'function') {
      try { window.FateMatchRendererAdapter.teardownScene('match-transient-cleanup'); } catch (e) {}
    }
    if (typeof window.clearConsolidationCinematicQueues === 'function') {
      try { window.clearConsolidationCinematicQueues(); } catch (e) {}
    }
  }
  G._handLimitDiscard = null;
  G._cardDetailModalLockUntil = 0;
  G._finalZoneCanvasFlash = null;
}

function resetMatchTransientState() {
  if (typeof G === 'undefined' || !G) return;
  cleanupTransientGameTimers();
  G.board = createEmptyBoard();
  G.extraCells = createEmptyExtraCells();
  G.extraRows = [0, 0, 0];
  G.extraRowFullOwners = [null, null, null];
  G.extraRowOwners = [[], [], []];
  G.markSafeSquares = [];
  G.blockedCells = [];
  G.immuneCards = [];
  G.shieldWallZones = [];
  G.fateModifiers = {};
  G.currentPlayer = 0;
  G.turn = 1;
  G.turnNumber = 1;
  G.phase = 'draw';
  resetInteractionState();
  G.supportsPlacedThisTurn = 0;
  G.maxSupportsPerTurn = 2;
  G.extraSupportsThisTurn = 0;
  G.pendingEffect = null;
  G.gameLog = [];
  G.damageDoneP = [0, 0];
  G.supportersSetP = [0, 0];
  G.supporterReinforcementSetP = [0, 0];
  G._supporterEffectsActivatedP = [0, 0];
  G._snowyVillageUses = [0, 0];
  G._landscapeChangeLocks = [0, 0];
  G._balladEffects = [null, null];
  G._mailDeliveries = [];
  G._blameGameEffects = [null, null];
  G._administrativeBloatEffects = [];
  G._serverRngCounter = 0;
  G.usMarinesUses = [0, 0];
  G.polishArmyUses = [0, 0];
  G.oppSuppressedNextTurn = false;
  G.suppressTarget = null;
  G.majaEffectThisTurn = false;
  G.erbsActive = [false, false];
  G.instanceCounter = 0;
  G._aiAbort = false;
  G._aiAborted = false;
  G._aiRunning = false;
  G._turnInputLockUntil = 0;
  G._aiTurnToken = 0;
  G._aiOpponentMemory = null;
  G._aiTurnPlan = null;
  G._aiOpponentHandModel = null;
  G._artilleryLockedZone = null;
  G._artilleryLockOwner = null;
  G._artilleryLockTurnsLeft = 0;
  G._cardFateMap = {};
  G._cardsAnimated = new Set();
  G._coinWinner = null;
  G._continuousDamageSources = new Set();
  G._forceHandEnterIids = new Set();
  G._fortCalvinActive = [];
  G._linaFreeIids = null;
  G._aiFateMultiplier = 1;
  G._placementUiLockUntil = 0;
  G._polishUsedThisTurn = false;
  G._prevZoneCtrl = null;
  G._prevZoneScores = null;
  G._revealedCards = {};
  G._riveraBuffs = [];
  G._riveraActiveEffects = {};
  G._seenHandIids = new Set();
  G._skipFinalZoneReveal = false;
  G._finalZoneRevealActive = false;
  G._finalZoneRevealTimers = [];
  G._skipImprovisorCheck = false;
  G._skipReactions = false;
  G._reactionPending = false;
  G._suppressEffectPrompt = false;
  G._tutorialTurnLimit = null;
  G._westCaribNext = false;
  G._zimbabweUsedThisTurn = false;
  G.landscape = null;
  G.landscapeId = null;
  G.landscapeBgNum = null;
  G._landscapeState = null;
  G._landscapeDrawQueue = [];
}

function hidePassTurnOverlay() {
  const overlay = document.getElementById('pt-overlay');
  if (overlay) overlay.classList.remove('on');
}

function removeMatchingNodes(selector) {
  document.querySelectorAll(selector).forEach((node) => node.remove());
}

function cleanupTutorialAndDialogueArtifacts(options = {}) {
  const opts = options || {};
  if (opts.dismissTutorial && typeof _tutorialActive !== 'undefined' && _tutorialActive) {
    if (typeof dismissTutorial === 'function') dismissTutorial();
  }
  if (opts.resetAIDialogue && typeof resetAIDialogue === 'function') {
    resetAIDialogue();
  }
  removeMatchingNodes('#tutorial-hint-bar, #tutorial-dialogue, .tutorial-highlight-overlay, .tutorial-arrow, #ai-dialogue-bubble');
}

function cleanupFloatingGameArtifacts() {
  cleanupTransientGameTimers();
  removeMatchingNodes('.sparkle-effect, .placement-sparkle, .zone-flash, .draw-fly-card, .effect-flash-overlay, .discarding, .consolidate-visual');
  removeMatchingNodes('.card-preview-float, .hover-preview, .card-hover-preview');
  removeMatchingNodes('.placement-anim-ghost, .card-set-overlay, .consolidation-cinematic-overlay, .cc-overlay-v2, .effect-blocked-flash, .maria-discard-badge');
  removeMatchingNodes('#rivera-status-banner, #berkeley-status-banner, #last-turn-banner, #turn-timer-warning');
  if(!(typeof G !== 'undefined' && G && G._finalZoneRevealActive)){
    document.querySelectorAll('#board .zone.final-zone-board-flash').forEach(function(el){
      el.classList.remove('final-zone-board-flash','final-zone-board-p1','final-zone-board-p2','final-zone-board-tie');
      el.style.removeProperty('--final-zone-delay');
      el.removeAttribute('data-final-zone-label');
      el.removeAttribute('data-final-zone-score');
    });
  }
  if (typeof removeHoverPreview === 'function') {
    try { removeHoverPreview(); } catch (e) {}
  }
}

function cleanupLeavingGameScreenArtifacts() {
  hidePassTurnOverlay();
  cleanupTutorialAndDialogueArtifacts({dismissTutorial:true, resetAIDialogue:true});
  cleanupFloatingGameArtifacts();
  document.documentElement.classList.remove('fate-tab-hidden','fate-frame-recovery');
  if(document.body) document.body.classList.remove('fate-tab-hidden','fate-frame-recovery');
  document.querySelectorAll('[style*="will-change"]').forEach(function(el){
    try{ el.style.removeProperty('will-change'); }catch(e){}
  });
  if(window.__fatePerf){
    window.__fatePerf.lastFpsEstimate = 0;
    window.__fatePerf.rafCallsPeak = 0;
    window.__fatePerf.promiseThenPeak = 0;
  }
  closeGameModal();
  if (typeof stopTurnTimer === 'function') stopTurnTimer();
  if (typeof stopAITurnVisualTimer === 'function') stopAITurnVisualTimer();
  if (typeof clearPlaceHighlights === 'function') clearPlaceHighlights();
  if (typeof removeOpponentFound === 'function') removeOpponentFound();
  if (typeof removeInGameChat === 'function') removeInGameChat();
  if (typeof cancelPendingTargetFlow === 'function') {
    try { cancelPendingTargetFlow(); } catch (e) {}
  }
  if (typeof G !== 'undefined' && G) {
    G._reactionPending = false;
    G._finalZoneRevealActive = false;
    G._placementUiLockUntil = 0;
    G._cinematicUiLockUntil = 0;
  }
  releaseRenderedGameDom();
}

function releaseRenderedGameDom() {
  ['board','hand-cards','opp-hand','tp-status-left','tp-status-right','active-effects-panel'].forEach(function(id){
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
}

function closeGameModal() {
  const modal = document.getElementById('modal');
  if (modal) modal.classList.remove('on');
}
