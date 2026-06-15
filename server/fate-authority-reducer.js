'use strict';

function onlineStableHash(value){
  const json = typeof value === 'string' ? value : JSON.stringify(value || null);
  let h = 2166136261;
  for(let i = 0; i < json.length; i += 1){
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function canonicalStateHash(state){
  return onlineStableHash(JSON.stringify(state || null));
}

function isPlainObject(value){
  return !!(value && typeof value === 'object' && !Array.isArray(value));
}

function validateCardList(list, label, maxLength){
  if(!Array.isArray(list)) return `${label} must be an array`;
  if(list.length > maxLength) return `${label} is too large`;
  for(const card of list){
    if(!card || typeof card !== 'object') return `${label} contains an invalid card`;
    if(String(card.id || '').length > 160) return `${label} contains an invalid card id`;
    if(String(card.iid || '').length > 160) return `${label} contains an invalid card iid`;
  }
  return '';
}

function validateBoard(board){
  if(!Array.isArray(board)) return 'board must be an array';
  if(board.length > 12) return 'board has too many zones';
  for(let z = 0; z < board.length; z += 1){
    const zone = board[z];
    if(!Array.isArray(zone)) return `board zone ${z} must be an array`;
    if(zone.length > 12) return `board zone ${z} has too many rows`;
    for(let r = 0; r < zone.length; r += 1){
      const row = zone[r];
      if(!Array.isArray(row)) return `board row ${z}:${r} must be an array`;
      if(row.length > 12) return `board row ${z}:${r} has too many cells`;
      for(const card of row){
        if(card !== null && (!card || typeof card !== 'object')) return `board row ${z}:${r} contains an invalid card`;
      }
    }
  }
  return '';
}

function validateCanonicalState(state){
  if(!isPlainObject(state)) return 'canonical state must be an object';
  if(Number(state.v || 0) !== 2) return 'unsupported canonical state version';
  if(!Array.isArray(state.players) || state.players.length !== 2) return 'canonical state must contain two players';
  for(let i = 0; i < 2; i += 1){
    const player = state.players[i];
    if(!isPlainObject(player)) return `player ${i} must be an object`;
    const deckErr = validateCardList(player.deck || [], `player ${i} deck`, 120);
    if(deckErr) return deckErr;
    const handErr = validateCardList(player.hand || [], `player ${i} hand`, 80);
    if(handErr) return handErr;
    const discardErr = validateCardList(player.discard || [], `player ${i} discard`, 160);
    if(discardErr) return discardErr;
  }
  const boardErr = validateBoard(state.board || []);
  if(boardErr) return boardErr;
  if(!Number.isInteger(Number(state.currentPlayer)) || Number(state.currentPlayer) < 0 || Number(state.currentPlayer) > 1){
    return 'currentPlayer must be 0 or 1';
  }
  if(!Number.isInteger(Number(state.turn)) || Number(state.turn) < 0 || Number(state.turn) > 500){
    return 'turn is out of range';
  }
  if(state.selectedHandCard !== null && state.selectedHandCard !== undefined && !Number.isInteger(Number(state.selectedHandCard))){
    return 'selectedHandCard must be numeric or null';
  }
  return '';
}

function validateActionSpecificTransition(type, payload, postState){
  const playerIndex = Number(payload.playerIndex);
  const postCurrent = Number(postState.currentPlayer);
  const postTurn = Number(postState.turn || 0) || 0;
  const claimedTurn = Number(payload.turn || 0) || 0;
  if(type !== 'STATE_SYNC' && type !== 'FORFEIT' && (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1)){
    return 'payload.playerIndex must be 0 or 1';
  }
  if(type === 'END_TURN'){
    if(postCurrent === playerIndex) return 'END_TURN did not pass priority to opponent';
    if(claimedTurn && postTurn < claimedTurn) return 'END_TURN moved turn backwards';
  }
  if(type === 'CHOOSE_TURN'){
    const winner = playerIndex;
    const expected = payload.goFirst ? winner : (winner === 0 ? 1 : 0);
    if(postCurrent !== expected) return 'CHOOSE_TURN postState currentPlayer does not match choice';
  }
  if(type === 'STATE_SYNC'){
    if(payload.currentPlayer !== undefined && Number(payload.currentPlayer) !== postCurrent){
      return 'STATE_SYNC currentPlayer mismatch';
    }
  }
  return '';
}

function validateProposedTransition(room, msg, opts){
  const options = opts || {};
  const type = String(msg.type || '').toUpperCase();
  const payload = msg.payload || {};
  if(type === 'FORFEIT') return {ok:true, canonicalState:room.canonicalState || null, canonicalHash:room.canonicalHash || ''};
  const postState = payload.postState;
  if(!postState) return {ok:false, reason:'accepted actions must include postState'};
  const stateErr = validateCanonicalState(postState);
  if(stateErr) return {ok:false, reason:stateErr};
  const claimedHash = String(payload.stateHash || '');
  const computedHash = canonicalStateHash(postState);
  if(!claimedHash) return {ok:false, reason:'missing stateHash'};
  if(claimedHash !== computedHash) return {ok:false, reason:'stateHash does not match postState'};
  const baseHash = String(payload.baseStateHash || payload.preStateHash || '');
  const currentHash = String(room.canonicalHash || '');
  if(currentHash){
    if(!baseHash && options.requireBaseHash !== false) return {ok:false, reason:'missing baseStateHash'};
    if(baseHash && baseHash !== currentHash) return {ok:false, reason:'stale baseStateHash'};
  }
  const actionErr = validateActionSpecificTransition(type, payload, postState);
  if(actionErr) return {ok:false, reason:actionErr};
  return {ok:true, canonicalState:postState, canonicalHash:computedHash, baseStateHash:baseHash};
}

function cloneState(state){
  return state ? JSON.parse(JSON.stringify(state)) : null;
}

function finalizeStateForForfeit(state, loserIndex, endedAt){
  const winnerIndex = loserIndex === 0 ? 1 : 0;
  state.phase = 'ended';
  state.status = 'ended';
  state.gameOver = true;
  state.winner = winnerIndex;
  state.winnerIndex = winnerIndex;
  state.loser = loserIndex;
  state.loserIndex = loserIndex;
  state.endReason = 'forfeit';
  state.endedAt = endedAt || Date.now();
  state.matchResult = {
    type:'forfeit',
    reason:'forfeit',
    winner:winnerIndex,
    winnerIndex,
    loser:loserIndex,
    loserIndex,
    endedAt:state.endedAt,
    serverFinalized:true
  };
  state._serverFinalized = true;
  state._serverPendingModalAction = null;
  state._serverPendingZonePick = null;
  state._serverPendingMove = null;
  state._consolidating = null;
  state.placing = false;
  state.selectedHandCard = null;
  state.selectedBoardCard = null;
  state.blockingCell = false;
  state.pendingEffect = null;
}

function verifyBaseHash(room, payload, options){
  const baseHash = String(payload.baseStateHash || payload.preStateHash || '');
  const currentHash = String(room.canonicalHash || '');
  if(currentHash){
    if(!baseHash && options.requireBaseHash !== false) return {ok:false, reason:'missing baseStateHash'};
    if(baseHash && baseHash !== currentHash) return {ok:false, reason:'stale baseStateHash'};
  }
  return {ok:true, baseStateHash:baseHash};
}

function reducedResult(state, extra){
  const canonicalState = cloneState(state);
  const canonicalHash = canonicalStateHash(canonicalState);
  return Object.assign({ok:true, canonicalState, canonicalHash, serverReduced:true}, extra || {});
}

function reduceStateSync(room, msg, options){
  const payload = msg.payload || {};
  if(room.canonicalHash && options.allowStateSyncAfterBootstrap === false){
    return {ok:false, reason:'STATE_SYNC is only allowed before server canonical state is initialized'};
  }
  return validateProposedTransition(room, msg, options);
}

function reduceChooseTurn(room, msg, options){
  const payload = msg.payload || {};
  const base = verifyBaseHash(room, payload, options);
  if(!base.ok) return base;
  const state = cloneState(room.canonicalState);
  if(!state){
    if(options.allowClientBootstrap) return validateProposedTransition(room, msg, options);
    return {ok:false, reason:'server canonical state is not initialized'};
  }
  const winner = Number(payload.playerIndex);
  if(!Number.isInteger(winner) || winner < 0 || winner > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  state.currentPlayer = payload.goFirst ? winner : (winner === 0 ? 1 : 0);
  state.turn = Number(state.turn || 1) || 1;
  return reducedResult(state, {baseStateHash:base.baseStateHash});
}

function reduceEndTurn(room, msg, options){
  const payload = msg.payload || {};
  const base = verifyBaseHash(room, payload, options);
  if(!base.ok) return base;
  const state = cloneState(room.canonicalState);
  if(!state){
    if(options.allowClientBootstrap) return validateProposedTransition(room, msg, options);
    return {ok:false, reason:'server canonical state is not initialized'};
  }
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  if(Number(state.currentPlayer) !== playerIndex) return {ok:false, reason:'END_TURN player does not have priority'};
  if(hasTruthy(state._serverPendingModalAction) || hasTruthy(state._serverPendingZonePick) || hasTruthy(state._serverPendingMove)){
    return {ok:false, reason:'END_TURN has an unresolved server interaction'};
  }
  if(state.oppSuppressedNextTurn && Number(state.suppressTarget) === playerIndex){
    state.oppSuppressedNextTurn = false;
    state.suppressTarget = null;
  }
  state.currentPlayer = playerIndex === 0 ? 1 : 0;
  state.turn = Math.max(Number(state.turn || 0) + 1, Number(payload.turn || 0) + 1, 1);
  state.selectedHandCard = null;
  state.selectedBoardCard = null;
  state.placing = false;
  state.blockingCell = false;
  state.pendingEffect = null;
  return reducedResult(state, {baseStateHash:base.baseStateHash});
}

function hasTruthy(value){
  if(value instanceof Set) return value.size > 0;
  if(Array.isArray(value)) return value.length > 0;
  return !!value;
}

function isComplexClickState(state){
  return !!(
    hasTruthy(state._consolidating) ||
    hasTruthy(state._serverPendingModalAction) ||
    hasTruthy(state._serverPendingZonePick) ||
    hasTruthy(state._serverPendingMove) ||
    hasTruthy(state._havanoDeploying) ||
    hasTruthy(state._boardTargeting) ||
    hasTruthy(state.blockingCell) ||
    hasTruthy(state._markSelecting) ||
    hasTruthy(state._busserMoving) ||
    hasTruthy(state._berkeleyMoving) ||
    hasTruthy(state._bh01Moving) ||
    hasTruthy(state._wolfCreekMoving) ||
    hasTruthy(state._busserMovingCard) ||
    hasTruthy(state._expMoving) ||
    hasTruthy(state._landscapeMoving)
  );
}

function isBlockedCell(state, z, r, c){
  const blocked = Array.isArray(state.blockedCells) ? state.blockedCells : [];
  return blocked.some(item =>
    item &&
    Number(item.z) === z &&
    Number(item.r) === r &&
    Number(item.c) === c &&
    String(item.type || '') === 'carolyn'
  );
}

function isBlockedForConsolidate(state, z, r, c, playerIndex){
  const blocked = Array.isArray(state.blockedCells) ? state.blockedCells : [];
  return blocked.some(item =>
    item &&
    Number(item.z) === z &&
    Number(item.r) === r &&
    Number(item.c) === c &&
    (
      String(item.type || '') === 'carolyn' ||
      Number(item.blockedPlayer) === playerIndex ||
      typeof item.blockedPlayer !== 'number'
    )
  );
}

function isBlockedByAlondra(state, z, r, c, playerIndex){
  const opp = playerIndex === 0 ? 1 : 0;
  const zone = state.board?.[z] || [];
  for(let rr = 0; rr < zone.length; rr += 1){
    const row = zone[rr] || [];
    for(let cc = 0; cc < row.length; cc += 1){
      const cell = row[cc];
      if(cell && String(cell.id || '') === '14' && Number(cell.owner) === opp){
        const dr = Math.abs(rr - r);
        const dc = Math.abs(cc - c);
        if(dr + dc === 1) return true;
      }
    }
  }
  return false;
}

function isEffectImmuneSource(card){
  return !!(card && !card.faceDown && (String(card.id || '') === '76' || card.immuneFlag === true || card.opponentEffectImmune === true));
}

function isPlayerSupporterEffectsSuppressed(state, playerIndex){
  return !!(state && state.oppSuppressedNextTurn && Number(state.suppressTarget) === Number(playerIndex));
}

function isSupporterEffectSuppressedForState(state, card){
  if(!card || String(card.type || '') !== 'Supporter') return false;
  if(isEffectImmuneSource(card)) return false;
  if(card._lydiaSuppressed || card._reactionSuppressed) return true;
  return isPlayerSupporterEffectsSuppressed(state, card.owner);
}

function ensureBoardCell(state, z, r, c){
  if(!Array.isArray(state.board)) state.board = [];
  while(state.board.length <= z) state.board.push([]);
  while(!Array.isArray(state.board[z]) || state.board[z].length <= r){
    if(!Array.isArray(state.board[z])) state.board[z] = [];
    state.board[z].push([]);
  }
  while(!Array.isArray(state.board[z][r]) || state.board[z][r].length <= c){
    if(!Array.isArray(state.board[z][r])) state.board[z][r] = [];
    state.board[z][r].push(null);
  }
}

function rowOwnerForState(state, z, r){
  if(r === 0) return 1;
  if(r === 1) return -1;
  if(r === 2) return 0;
  const owners = state.extraRowOwners || state.extraRowFullOwners || {};
  const key = `${z}:${r}`;
  const owner = owners[key] ?? owners[z]?.[r];
  return Number.isInteger(Number(owner)) ? Number(owner) : 0;
}

function catalogCardFor(card, options){
  const catalog = options?.cardCatalog;
  if(!catalog || !card?.id) return null;
  if(catalog.byId && typeof catalog.byId.get === 'function') return catalog.byId.get(String(card.id)) || null;
  if(catalog.byId && typeof catalog.byId === 'object') return catalog.byId[String(card.id)] || null;
  return null;
}

function isBasicPlacementCard(card, options){
  if(!card || typeof card !== 'object') return false;
  const meta = catalogCardFor(card, options);
  if(options?.requireCatalogForCards && !meta) return false;
  const effective = meta || card;
  const specialIds = new Set(['02','34','45','46','50','70','76']);
  if(specialIds.has(String(effective.id || card.id || ''))) return false;
  if(effective.contestedOnly || card.contestedOnly) return false;
  if(effective.effect || card.effect) return false;
  if(effective.aff || card.aff) return false;
  if(effective.whenSet || effective.onSet || effective.activated || effective.effectKey || effective.requiresTarget) return false;
  if(card.whenSet || card.onSet || card.activated || card.effectKey || card.requiresTarget) return false;
  return true;
}

function isSupportedSupporterPlacementCard(card, options){
  if(isBasicPlacementCard(card, options)) return true;
  if(!card || String(card.type || '') !== 'Supporter') return false;
  const meta = catalogCardFor(card, options);
  if(options?.requireCatalogForCards && !meta) return false;
  const id = String((meta || card).id || card.id || '');
  return ['05','09','12','16','18','20','24','26','28','31','32','33','47','49','50','52','53','54','76','91'].includes(id);
}

function isSupportedNonSupporterPlacementCard(card, options){
  if(isBasicPlacementCard(card, options)) return true;
  if(!card || String(card.type || '') === 'Supporter') return false;
  const meta = catalogCardFor(card, options);
  if(options?.requireCatalogForCards && !meta) return false;
  return false;
}

function isSupportedConsolidatingCard(card, options){
  if(isBasicPlacementCard(card, options)) return true;
  if(!card || !['14','27','35','40','45','56'].includes(String(card.id || ''))) return false;
  const meta = catalogCardFor(card, options);
  if(options?.requireCatalogForCards && !meta) return false;
  return ['14','27','35','40','45','56'].includes(String((meta || card).id || ''));
}

function applyWestCaribHandArrival(state, playerIndex, card){
  if(!state?._westCaribNext || !card || String(card.id || '') === '70' || String(card.type || '') === 'Supporter') return;
  const owner = isPlainObject(state._westCaribNext) ? Number(state._westCaribNext.owner) : playerIndex;
  if(owner !== playerIndex) return;
  card._wciBonus = true;
  card._handCostDelta = (Number(card._handCostDelta || 0) || 0) - 1;
  state._westCaribNext = false;
}

function erbsActiveForState(state, playerIndex){
  if(Array.isArray(state?.erbsActive)) return !!state.erbsActive[playerIndex];
  return !!state?.erbsActive;
}

function setErbsActiveForState(state, playerIndex, value){
  if(Array.isArray(state.erbsActive)) state.erbsActive[playerIndex] = !!value;
  else state.erbsActive = !!value;
}

function readyChristopherErbsEntryForState(state, playerIndex, sourceIid){
  const zones = Array.isArray(state?.board) ? state.board : [];
  for(let z = 0; z < zones.length; z += 1){
    const zone = zones[z];
    if(!Array.isArray(zone)) continue;
    for(let r = 0; r < zone.length; r += 1){
      const row = zone[r];
      if(!Array.isArray(row)) continue;
      for(let c = 0; c < row.length; c += 1){
        const card = row[c];
        if(card && String(card.id || '') === '40' && Number(card.owner) === playerIndex && Number(card.usesLeft || 0) > 0 && !card.faceDown){
          if(sourceIid && String(card.iid || '') !== String(sourceIid)) continue;
          return {card, z, r, c};
        }
      }
    }
  }
  return null;
}

function readyChristopherErbsForState(state, playerIndex){
  const entry = readyChristopherErbsEntryForState(state, playerIndex);
  return entry ? entry.card : null;
}

function setPendingChristopherErbsDrawChoice(state, playerIndex, erbsEntry, remainingDrawCount){
  state._serverPendingModalAction = {
    kind:'christopherErbsDrawChoice',
    playerIndex,
    sourceIid:erbsEntry?.card?.iid || null,
    z:erbsEntry?.z,
    r:erbsEntry?.r,
    c:erbsEntry?.c,
    remainingDrawCount:Math.max(1, Number(remainingDrawCount || 1) || 1)
  };
}

function drawCardsForState(state, playerIndex, count, options){
  const player = state?.players?.[playerIndex];
  if(!player || !Array.isArray(player.deck) || !Array.isArray(player.hand)) return {ok:false, reason:'draw state is invalid'};
  let drawn = 0;
  let skipNextErbsChoice = !!options?.skipNextErbsChoice;
  for(let i = 0; i < count; i += 1){
    if(!player.deck.length) break;
    const erbsActive = erbsActiveForState(state, playerIndex);
    if(!erbsActive && !skipNextErbsChoice){
      const readyErbs = readyChristopherErbsEntryForState(state, playerIndex);
      if(readyErbs){
        setPendingChristopherErbsDrawChoice(state, playerIndex, readyErbs, count - i);
        return {ok:true, drawn, pending:true};
      }
    }
    skipNextErbsChoice = false;
    const card = player.deck.shift();
    applyWestCaribHandArrival(state, playerIndex, card);
    player.hand.push(card);
    if(erbsActive && String(card.id || '') !== '70'){
      card.currentFate = (Number(card.currentFate ?? card.fate ?? 0) || 0) + 4;
      setErbsActiveForState(state, playerIndex, false);
    }
    drawn += 1;
  }
  return {ok:true, drawn};
}

function applyShieldWallForZone(state, z){
  if(!Array.isArray(state.shieldWallZones)) state.shieldWallZones = [];
  if(!state.shieldWallZones.includes(z)) state.shieldWallZones.push(z);
  const zone = state?.board?.[z] || [];
  zone.forEach(row=>{
    if(!Array.isArray(row)) return;
    row.forEach(cell=>{
      if(cell) cell.cantBeMoved = true;
    });
  });
}

function adjacentAndDiagonalEntries(state, z, r, c){
  const entries = [];
  const zone = state?.board?.[z] || [];
  const deltas = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1], [0, 1],
    [1, -1], [1, 0], [1, 1]
  ];
  deltas.forEach(([dr, dc])=>{
    const rr = r + dr;
    const cc = c + dc;
    const row = zone[rr];
    if(row && row[cc]) entries.push({card:row[cc], z, r:rr, c:cc});
  });
  return entries;
}

function applyAlondraWhenSet(state, inst, playerIndex, z, r, c){
  const opponent = playerIndex === 0 ? 1 : 0;
  let gained = 0;
  adjacentAndDiagonalEntries(state, z, r, c).forEach(entry=>{
    const card = entry.card;
    if(!card || Number(card.owner) !== opponent || String(card.type || '') !== 'Supporter') return;
    if(String(card.id || '') === '76' || card.immuneFlag === true) return;
    if(!Array.isArray(state.players?.[opponent]?.discard)) state.players[opponent].discard = [];
    state.players[opponent].discard.push(cloneState(card));
    state.board[entry.z][entry.r][entry.c] = null;
    gained += 1;
  });
  if(gained) inst.currentFate = (Number(inst.currentFate ?? inst.fate ?? 0) || 0) + gained;
}

function applySupportedWhenSetState(state, inst, playerIndex, z, r, c){
  const id = String(inst?.id || '');
  if(id === '09' && inst.usesLeft === undefined) inst.usesLeft = 3;
  if(id === '14') applyAlondraWhenSet(state, inst, playerIndex, z, r, c);
  if(id === '18'){
    state.oppSuppressedNextTurn = true;
    state.suppressTarget = playerIndex === 0 ? 1 : 0;
  }
  if(id === '20') applyShieldWallForZone(state, z);
  if(id === '26'){
    const opponent = playerIndex === 0 ? 1 : 0;
    const hand = state.players?.[opponent]?.hand || [];
    if(!isPlainObject(state._revealedCards)) state._revealedCards = {};
    hand.forEach(card=>{
      if(card?.iid) state._revealedCards[card.iid] = true;
    });
  }
  if(id === '27'){
    const drawn = drawCardsForState(state, playerIndex, 3);
    if(!drawn.ok) return drawn;
  }
  if(id === '32'){
    const drawn = drawCardsForState(state, playerIndex, 1);
    if(!drawn.ok) return drawn;
  }
  if(id === '33') state._westCaribNext = {owner:playerIndex};
  if(id === '28' && !inst._plUsesLeft) inst._plUsesLeft = 2;
  if(id === '47') inst._greatOakBonus = true;
  if(id === '56') inst.usesLeft = 5;
  if(id === '76'){
    inst.currentFate = 5;
    inst.immuneFlag = true;
    inst.noBonus = true;
    inst.noConsolidate = true;
  }
  if(id === '91'){
    const opponent = playerIndex === 0 ? 1 : 0;
    if(!Array.isArray(state._snowyVillageUses)) state._snowyVillageUses = [0, 0];
    if(!Array.isArray(state._landscapeChangeLocks)) state._landscapeChangeLocks = [0, 0];
    state._snowyVillageUses[playerIndex] = (Number(state._snowyVillageUses[playerIndex] || 0) || 0) + 1;
    state._landscapeChangeLocks[opponent] = Math.max(Number(state._landscapeChangeLocks[opponent] || 0) || 0, 5);
  }
  if(id === '40') inst.usesLeft = 2;
  return {ok:true};
}

function setPendingArtilleryModal(state, inst, playerIndex, z, r, c){
  if(String(inst?.id || '') !== '50') return;
  state._serverPendingModalAction = {
    kind:'artilleryDistance',
    playerIndex,
    z,
    r,
    c,
    iid:inst.iid || null
  };
}

function boardCardEntriesInZone(state, z, predicate){
  const entries = [];
  const zone = state?.board?.[z] || [];
  for(let r = 0; r < zone.length; r += 1){
    const row = zone[r] || [];
    for(let c = 0; c < row.length; c += 1){
      const card = row[c];
      if(card && (!predicate || predicate(card, z, r, c))) entries.push({card, z, r, c});
    }
  }
  return entries;
}

function setPendingSameZoneWhenSetPick(state, inst, playerIndex, z, r, c){
  const id = String(inst?.id || '');
  let kind = '';
  let maxCount = 1;
  let hasTarget = false;
  if(id === '05'){
    kind = 'liberatorsFateGain';
    hasTarget = boardCardEntriesInZone(state, z).length > 0;
  } else if(id === '12'){
    kind = 'makennaImmune';
    maxCount = 2;
    hasTarget = boardCardEntriesInZone(state, z, card=>Number(card.owner) === playerIndex).length > 0;
  } else if(id === '16'){
    kind = 'minaeDiscardSupporter';
    const opponent = playerIndex === 0 ? 1 : 0;
    hasTarget = boardCardEntriesInZone(state, z, card=>Number(card.owner) === opponent && String(card.type || '') === 'Supporter').length > 0;
  } else if(id === '31'){
    kind = 'hemorrhagingWound';
    hasTarget = boardCardEntriesInZone(state, z).length > 0;
  }
  if(!kind || !hasTarget) return;
  state._serverPendingZonePick = {
    kind,
    playerIndex,
    z,
    r,
    c,
    iid:inst.iid || null,
    maxCount
  };
}

function isVigilantesTarget(card, playerIndex){
  if(!card || typeof card !== 'object') return false;
  const opponent = playerIndex === 0 ? 1 : 0;
  return Number(card.owner) === opponent &&
    String(card.type || '') === 'Supporter' &&
    String(card.id || '') !== '76' &&
    card.immuneFlag !== true;
}

function setPendingVigilantesPick(state, inst, playerIndex, z, r, c){
  if(String(inst?.id || '') !== '52') return;
  const zone = state?.board?.[z] || [];
  let hasTarget = false;
  for(let rr = 0; rr < zone.length; rr += 1){
    const row = zone[rr] || [];
    for(let cc = 0; cc < row.length; cc += 1){
      if(isVigilantesTarget(row[cc], playerIndex)){
        hasTarget = true;
        break;
      }
    }
    if(hasTarget) break;
  }
  if(!hasTarget) return;
  state._serverPendingZonePick = {
    kind:'vigilantesMark',
    playerIndex,
    z,
    r,
    c,
    iid:inst.iid || null
  };
}

function isWolfCreekMoveCandidate(card, playerIndex, sourceIid){
  if(!card || typeof card !== 'object') return false;
  return Number(card.owner) === playerIndex &&
    String(card.type || '') !== 'Supporter' &&
    (!sourceIid || card.iid !== sourceIid) &&
    card.cantBeMoved !== true;
}

function isContestedOrOwnSafeSquareForState(state, z, r, playerIndex){
  const owner = rowOwnerForState(state, z, r);
  return owner === -1 || owner === playerIndex;
}

function collectWolfCreekMoveOptions(state, playerIndex){
  const options = [];
  const zones = Array.isArray(state?.board) ? state.board : [];
  for(let z = 0; z < zones.length; z += 1){
    const zone = zones[z] || [];
    for(let r = 0; r < zone.length; r += 1){
      const row = zone[r] || [];
      for(let c = 0; c < row.length; c += 1){
        if(row[c] !== null) continue;
        if(isBlockedCell(state, z, r, c)) continue;
        if(!isContestedOrOwnSafeSquareForState(state, z, r, playerIndex)) continue;
        options.push({z, r, c});
      }
    }
  }
  return options;
}

function hasWolfCreekMoveCandidateInZone(state, playerIndex, z, sourceIid){
  const zone = state?.board?.[z] || [];
  for(let r = 0; r < zone.length; r += 1){
    const row = zone[r] || [];
    for(let c = 0; c < row.length; c += 1){
      if(isWolfCreekMoveCandidate(row[c], playerIndex, sourceIid)) return true;
    }
  }
  return false;
}

function setPendingWolfCreekPick(state, inst, playerIndex, z, r, c){
  if(String(inst?.id || '') !== '54') return;
  if(!hasWolfCreekMoveCandidateInZone(state, playerIndex, z, inst.iid || null)) return;
  if(!collectWolfCreekMoveOptions(state, playerIndex).length) return;
  state._serverPendingZonePick = {
    kind:'wolfCreekSelectMoveTarget',
    playerIndex,
    z,
    r,
    c,
    iid:inst.iid || null
  };
}

function applyRozsiPassiveForMove(state, movedCard, destZ){
  if(!movedCard) return;
  const zone = state?.board?.[destZ] || [];
  let bonus = 0;
  zone.forEach(row=>{
    if(!Array.isArray(row)) return;
    row.forEach(cell=>{
      if(cell && String(cell.id || '') === '34' && Number(cell.owner) === Number(movedCard.owner) && !isSupporterEffectSuppressedForState(state, cell)){
        bonus += 2;
      }
    });
  });
  if(bonus) movedCard.currentFate = (Number(movedCard.currentFate ?? movedCard.fate ?? 0) || 0) + bonus;
}

function alexanderFateForState(state, z, playerIndex){
  let total = 0;
  const zone = state?.board?.[z] || [];
  zone.forEach(row=>{
    if(!Array.isArray(row)) return;
    row.forEach(cell=>{
      if(cell && Number(cell.owner) === playerIndex && String(cell.type || '') === 'Supporter'){
        total += Number(cell.currentFate ?? cell.fate ?? 0) || 0;
      }
    });
  });
  return total;
}

function isCharacterForPlacementRules(card){
  return !!(card && String(card.type || '') !== 'Supporter');
}

function zoneHasFriendlyCharacterForState(state, z, owner, excludeIids){
  const excluded = excludeIids instanceof Set ? excludeIids : new Set();
  const zone = state?.board?.[z] || [];
  return zone.some(row=>Array.isArray(row) && row.some(cell=>
    cell &&
    Number(cell.owner) === owner &&
    isCharacterForPlacementRules(cell) &&
    !excluded.has(cell.iid)
  ));
}

function zoneHasFriendlyChingachlookForState(state, z, owner, excludeIids){
  const excluded = excludeIids instanceof Set ? excludeIids : new Set();
  const zone = state?.board?.[z] || [];
  return zone.some(row=>Array.isArray(row) && row.some(cell=>
    cell &&
    String(cell.id || '') === '45' &&
    Number(cell.owner) === owner &&
    !excluded.has(cell.iid)
  ));
}

function chingachlookPlacementBlockReason(state, card, z, owner, excludeIids){
  if(!isCharacterForPlacementRules(card)) return '';
  if(String(card.id || '') === '45' && zoneHasFriendlyCharacterForState(state, z, owner, excludeIids)){
    return 'Chingachlook can only be set in a zone with no other friendly characters';
  }
  if(String(card.id || '') !== '45' && zoneHasFriendlyChingachlookForState(state, z, owner, excludeIids)){
    return 'Chingachlook forbids other characters in this zone';
  }
  return '';
}

function validateSupporterPlacement(state, card, playerIndex, z, r, c){
  if(String(card.type || '') !== 'Supporter') return '';
  const maxSupports = (Number(state.maxSupportsPerTurn || 0) || 0) + (Number(state.extraSupportsThisTurn || 0) || 0);
  const placed = Number(state.supportsPlacedThisTurn || 0) || 0;
  if(!state.majaEffectThisTurn && placed >= Math.max(0, maxSupports || 0)){
    return 'Supporter limit reached';
  }
  if(String(card.id || '') !== '76' && isBlockedByAlondra(state, z, r, c, playerIndex)){
    return 'Supporter placement is blocked by Alondra';
  }
  return '';
}

function hasBasicPlacementTarget(state, card, playerIndex){
  for(let z = 0; z < 3; z += 1){
    const zone = state.board?.[z] || [];
    for(let r = 0; r < Math.min(zone.length, 9); r += 1){
      const row = zone[r] || [];
      const rowOwner = rowOwnerForState(state, z, r);
      if(rowOwner !== -1 && rowOwner !== playerIndex) continue;
      for(let c = 0; c < Math.min(row.length, 9); c += 1){
        if(row[c] !== null) continue;
        if(isBlockedCell(state, z, r, c)) continue;
        if(isArtilleryLockedConsolidationZone(state, z, playerIndex)) continue;
        if(chingachlookPlacementBlockReason(state, card, z, playerIndex)) continue;
        if(validateSupporterPlacement(state, card, playerIndex, z, r, c)) continue;
        return true;
      }
    }
  }
  return false;
}

function selectedHandCardForState(state, payload, playerIndex){
  const selected = payload.selectedHand || {};
  const hand = state.players?.[playerIndex]?.hand || [];
  let handIndex = Number.isInteger(Number(selected.index)) ? Number(selected.index) : Number(state.selectedHandCard);
  if(!Number.isInteger(handIndex) || handIndex < 0 || handIndex >= hand.length) return {error:'selected hand card is invalid'};
  let card = hand[handIndex];
  if(selected.iid && card?.iid !== selected.iid){
    handIndex = hand.findIndex(item=>item && item.iid === selected.iid);
    card = hand[handIndex];
  }
  if(!card) return {error:'selected hand card was not found'};
  if(selected.id && String(card.id || '') !== String(selected.id)) return {error:'selected hand card id mismatch'};
  return {hand, handIndex, card, selected};
}

function countFriendlyRalphAdjacencyForState(state, z, r, c, owner){
  let count = 0;
  const zone = state?.board?.[z];
  if(!Array.isArray(zone)) return 0;
  zone.forEach((row, rr)=>{
    if(!Array.isArray(row)) return;
    row.forEach((cell, cc)=>{
      if(!cell || String(cell.id || '') !== '24' || Number(cell.owner) !== owner || cell.faceDown || isSupporterEffectSuppressedForState(state, cell)) return;
      const dr = Math.abs(Number(rr) - Number(r));
      const dc = Math.abs(Number(cc) - Number(c));
      if(dr <= 1 && dc <= 1 && (dr + dc) > 0) count += 1;
    });
  });
  return count;
}

function isSupporterAuraSuppressed(card){
  return !!(card && String(card.type || '') === 'Supporter' && card._lydiaSuppressed);
}

function copiedFrenchPassiveId(card){
  if(!card || String(card.id || '') !== '37') return '';
  const copied = card._copiedPassiveId ?? card.copiedPassiveId;
  return copied == null ? '' : String(copied);
}

function hasUnsupportedFrenchConsolidationPassive(state){
  if(!Array.isArray(state?.board)) return false;
  return state.board.some(zone=>Array.isArray(zone) && zone.some(row=>Array.isArray(row) && row.some(cell=>{
    const copied = copiedFrenchPassiveId(cell);
    return !!(copied && ['49','53'].includes(copied) && !isSupporterAuraSuppressed(cell));
  })));
}

function colomboRestrictionZonesForState(state, playerIndex){
  const zones = [];
  const opp = playerIndex === 0 ? 1 : 0;
  if(!Array.isArray(state?.board)) return zones;
  state.board.forEach((zone, z)=>{
    if(!Array.isArray(zone)) return;
    zone.forEach(row=>{
      if(!Array.isArray(row)) return;
      row.forEach(cell=>{
        if(cell && String(cell.id || '') === '53' && Number(cell.owner) === opp && !isSupporterAuraSuppressed(cell)){
          if(!zones.includes(z)) zones.push(z);
        }
      });
    });
  });
  return zones;
}

function irvineZonesForState(state, playerIndex){
  const zones = [];
  if(!Array.isArray(state?.board)) return zones;
  state.board.forEach((zone, z)=>{
    if(!Array.isArray(zone)) return;
    zone.forEach(row=>{
      if(!Array.isArray(row)) return;
      row.forEach(cell=>{
        if(cell && String(cell.id || '') === '49' && Number(cell.owner) === playerIndex && !isSupporterAuraSuppressed(cell)){
          if(!zones.includes(z)) zones.push(z);
        }
      });
    });
  });
  return zones;
}

function isArtilleryLockedConsolidationZone(state, z, playerIndex){
  return (
    Number.isInteger(Number(state?._artilleryLockedZone)) &&
    Number(state._artilleryLockedZone) === Number(z) &&
    Number(state._artilleryLockOwner) === Number(playerIndex) &&
    Number(state._artilleryLockTurnsLeft) > 0
  );
}

function tributeReinforcementValue(card, state, z, r, c, owner){
  if(!card) return 0;
  let value = 1;
  if(String(card.id || '') === '86') value = 3;
  if(String(card.id || '') === '09' && (card.usesLeft === null || card.usesLeft === undefined || Number(card.usesLeft) > 0)) value = 2;
  return value + countFriendlyRalphAdjacencyForState(state, z, r, c, owner);
}

function tributeBonusFate(card){
  if(!card) return 0;
  const id = String(card.id || '');
  if(id === '47') return 3;
  if(id === '86') return 4;
  return 0;
}

function isSupportedBasicTributeCard(card, options){
  if(!card) return false;
  const id = String(card.id || '');
  if(card.noConsolidate || card.faceDown || card._markedForDeath || card._reinforcementBonus) return false;
  if(card._returnUsed) return false;
  if(['09','24','47','49','86'].includes(id)) return true;
  if(String(card.type || '') !== 'Supporter') return false;
  if(['24','37','76'].includes(id)) return false;
  return isBasicPlacementCard(card, options);
}

function basicTributeOptionsForState(state, card, playerIndex, options){
  if(!Array.isArray(state.board)) return {ok:false, reason:'board is unavailable'};
  if(hasUnsupportedFrenchConsolidationPassive(state)){
    return {ok:false, reason:'French Fusiliers copied consolidation passives require a dedicated server reducer'};
  }
  if(card.xCost || (card.xFate && String(card.id || '') !== '35') || card._handCostDelta || card._wciBonus){
    return {ok:false, reason:'paid consolidation modifiers require a dedicated server reducer'};
  }
  if(card.id === '99' || card.id === '100') return {ok:false, reason:'character-tribute consolidation requires a dedicated server reducer'};
  if(Array.isArray(state._blameGameEffects) && state._blameGameEffects.some(item=>item && item.active)){
    return {ok:false, reason:'Blame Game consolidation state requires a dedicated server reducer'};
  }
  const colomboRestrictionZones = colomboRestrictionZonesForState(state, playerIndex);
  const irvineZones = irvineZonesForState(state, playerIndex);
  const allPossible = [];
  for(let z = 0; z < state.board.length; z += 1){
    if(isArtilleryLockedConsolidationZone(state, z, playerIndex)) continue;
    const zone = state.board[z] || [];
    for(let r = 0; r < zone.length; r += 1){
      const row = zone[r] || [];
      for(let c = 0; c < row.length; c += 1){
        const cell = row[c];
        if(!cell || Number(cell.owner) !== playerIndex) continue;
        if(String(cell.type || '') !== 'Supporter' && String(cell.id || '') !== '86') continue;
        if(!isSupportedBasicTributeCard(cell, options)) return {ok:false, reason:'tribute card requires a dedicated server reducer'};
        allPossible.push({
          card:cloneState(cell),
          z,
          r,
          c,
          zoneIdx:z,
          reinforcement:tributeReinforcementValue(cell, state, z, r, c, playerIndex)
        });
      }
    }
  }
  let irvineError = '';
  irvineZones.forEach(z=>{
    if(irvineError || isArtilleryLockedConsolidationZone(state, z, playerIndex)) return;
    const zone = state.board[z] || [];
    for(let r = 0; r < zone.length; r += 1){
      const row = zone[r] || [];
      for(let c = 0; c < row.length; c += 1){
        const cell = row[c];
        if(!cell || Number(cell.owner) !== playerIndex || String(cell.type || '') === 'Supporter') continue;
        if(cell.noConsolidate || cell.faceDown || String(cell.id || '') === '76') continue;
        if(!isBasicPlacementCard(cell, options)){
          irvineError = 'Irvine Businessman character tribute requires a dedicated server reducer';
          return;
        }
        allPossible.push({
          card:cloneState(cell),
          z,
          r,
          c,
          zoneIdx:z,
          isChar:true,
          reinforcement:1
        });
      }
    }
  });
  if(irvineError) return {ok:false, reason:irvineError};
  return {ok:true, allPossible, colomboRestrictionZones};
}

function reducePlaceSelected(room, msg, options){
  const payload = msg.payload || {};
  const base = verifyBaseHash(room, payload, options);
  if(!base.ok) return base;
  const state = cloneState(room.canonicalState);
  if(!state) return {ok:false, reason:'server canonical state is not initialized'};
  if(isComplexClickState(state)) return {ok:false, reason:'HAND_ACTION has an unsupported pending interaction'};
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  if(Number(state.currentPlayer) !== playerIndex) return {ok:false, reason:'HAND_ACTION player does not have priority'};
  if(String(state.phase || '') !== 'main') return {ok:false, reason:'HAND_ACTION placeSelected requires main phase'};
  const selected = selectedHandCardForState(state, payload, playerIndex);
  if(selected.error) return {ok:false, reason:selected.error};
  const card = selected.card;
  if(String(card.id || '') === '70' && card.guerilla_transferred) return {ok:false, reason:'Wine Country Guerilla cannot be set from hand'};
  if(String(card.type || '') !== 'Supporter') return {ok:false, reason:'placeSelected is only implemented for Supporter placement'};
  if(!isSupportedSupporterPlacementCard(card, options)) return {ok:false, reason:'HAND_ACTION card requires a dedicated server reducer'};
  const supporterErr = validateSupporterPlacement(state, card, playerIndex, 0, 0, 0);
  if(supporterErr && /limit/i.test(supporterErr)) return {ok:false, reason:supporterErr};
  if(!hasBasicPlacementTarget(state, card, playerIndex)) return {ok:false, reason:'No open squares available for selected card'};
  state.selectedHandCard = selected.handIndex;
  state.selectedBoardCard = null;
  state.placing = true;
  state.blockingCell = false;
  return reducedResult(state, {baseStateHash:base.baseStateHash});
}

function reduceStartConsolidate(room, msg, options){
  const payload = msg.payload || {};
  const base = verifyBaseHash(room, payload, options);
  if(!base.ok) return base;
  const state = cloneState(room.canonicalState);
  if(!state) return {ok:false, reason:'server canonical state is not initialized'};
  if(isComplexClickState(state)) return {ok:false, reason:'START_CONSOLIDATE has an unsupported pending interaction'};
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  if(Number(state.currentPlayer) !== playerIndex) return {ok:false, reason:'START_CONSOLIDATE player does not have priority'};
  if(String(state.phase || '') !== 'main') return {ok:false, reason:'START_CONSOLIDATE requires main phase'};
  const selected = selectedHandCardForState(state, payload, playerIndex);
  if(selected.error) return {ok:false, reason:selected.error};
  const card = selected.card;
  if(String(card.type || '') === 'Supporter') return {ok:false, reason:'START_CONSOLIDATE requires a character card'};
  if(card.xCost || (card.xFate && String(card.id || '') !== '35')) return {ok:false, reason:'START_CONSOLIDATE variable-cost cards require a dedicated server reducer'};
  if(!isSupportedConsolidatingCard(card, options)) return {ok:false, reason:'START_CONSOLIDATE card requires a dedicated server reducer'};
  const cost = Math.max(0, (Number(card.cost || 0) || 0) + (Number(card._handCostDelta || 0) || 0));
  if(cost > 0){
    const tributes = basicTributeOptionsForState(state, card, playerIndex, options);
    if(!tributes.ok) return tributes;
    const totalReinforcement = tributes.allPossible.reduce((sum, item)=>sum + (Number(item.reinforcement || 0) || 0), 0);
    if(totalReinforcement < cost) return {ok:false, reason:`Need ${cost} reinforcement on the field`};
    state.selectedHandCard = selected.handIndex;
    state.selectedBoardCard = null;
    state.placing = false;
    state.blockingCell = false;
    state._consolidating = {
      card:cloneState(card),
      cost,
      baseCost:cost,
      allPossible:tributes.allPossible,
      chosenIdxs:[],
      phase:'select_tributes',
      colomboRestrictionZones:tributes.colomboRestrictionZones || []
    };
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(!hasBasicPlacementTarget(state, card, playerIndex)) return {ok:false, reason:'No open squares available for selected card'};
  state.selectedHandCard = selected.handIndex;
  state.selectedBoardCard = null;
  state.placing = true;
  state.blockingCell = false;
  state._consolidating = null;
  return reducedResult(state, {baseStateHash:base.baseStateHash});
}

function liveTributeMatches(state, tribute, playerIndex, options){
  if(!tribute || !Number.isInteger(Number(tribute.z)) || !Number.isInteger(Number(tribute.r)) || !Number.isInteger(Number(tribute.c))){
    return false;
  }
  const live = state.board?.[tribute.z]?.[tribute.r]?.[tribute.c] || null;
  if(!live || Number(live.owner) !== playerIndex) return false;
  if(tribute.card?.iid && live.iid !== tribute.card.iid) return false;
  if(isArtilleryLockedConsolidationZone(state, tribute.z, playerIndex)) return false;
  if(tribute.isChar){
    if(String(live.type || '') === 'Supporter') return false;
    if(live.noConsolidate || live.faceDown || String(live.id || '') === '76') return false;
    if(!irvineZonesForState(state, playerIndex).includes(Number(tribute.z))) return false;
    if(!isBasicPlacementCard(live, options)) return false;
    return (Number(tribute.reinforcement || 0) || 0) === 1;
  }
  if(!isSupportedBasicTributeCard(live, options)) return false;
  return tributeReinforcementValue(live, state, tribute.z, tribute.r, tribute.c, playerIndex) === (Number(tribute.reinforcement || 0) || 0);
}

function consolidationRunningTotal(con){
  const chosen = Array.isArray(con?.chosenIdxs) ? con.chosenIdxs : [];
  const allPossible = Array.isArray(con?.allPossible) ? con.allPossible : [];
  return chosen.reduce((sum, idx)=>{
    const item = allPossible[idx];
    return sum + (Number(item?.reinforcement || 0) || 0);
  }, 0);
}

function applyDeterranceForTributeZones(state, chosenTributes, playerIndex){
  const affectedZones = [];
  chosenTributes.forEach(tribute=>{
    const z = Number(tribute?.z);
    if(Number.isInteger(z) && !affectedZones.includes(z)) affectedZones.push(z);
  });
  affectedZones.forEach(z=>{
    const zone = state.board?.[z] || [];
    zone.forEach(row=>{
      if(!Array.isArray(row)) return;
      row.forEach(cell=>{
        if(cell && String(cell.id || '') === '36' && Number(cell.owner) !== playerIndex){
          if(!state.fateModifiers || typeof state.fateModifiers !== 'object') state.fateModifiers = {};
          const key = `deterrance_z${z}`;
          state.fateModifiers[key] = (Number(state.fateModifiers[key] || 0) || 0) - 2;
        }
      });
    });
  });
}

function finalizeBasicConsolidation(state, con, targetIdx, playerIndex, options){
  const allPossible = Array.isArray(con.allPossible) ? con.allPossible : [];
  const chosenIdxs = Array.isArray(con.chosenIdxs) ? con.chosenIdxs : [];
  if(!chosenIdxs.includes(targetIdx)) return {ok:false, reason:'selected tribute is not armed for placement'};
  const cost = Number(con.cost || 0) || 0;
  if(consolidationRunningTotal(con) < cost) return {ok:false, reason:'not enough selected reinforcement'};
  const target = allPossible[targetIdx];
  if(!target) return {ok:false, reason:'consolidation target was not found'};
  if(isArtilleryLockedConsolidationZone(state, target.z, playerIndex)){
    return {ok:false, reason:'Artillery Distance locks this zone'};
  }
  if(isBlockedForConsolidate(state, target.z, target.r, target.c, playerIndex)){
    return {ok:false, reason:'consolidation target is blocked'};
  }
  const colomboZones = Array.isArray(con.colomboRestrictionZones) ? con.colomboRestrictionZones.map(Number) : [];
  if(colomboZones.includes(Number(target.z))){
    const crossZone = chosenIdxs.some(idx=>{
      const tribute = allPossible[idx];
      return tribute && Number(tribute.z) !== Number(target.z);
    });
    if(crossZone) return {ok:false, reason:'Colombo Thug restricts consolidation to tributes from the target zone'};
  }
  const removedIids = new Set(chosenIdxs.map(idx=>allPossible[idx]?.card?.iid).filter(Boolean));
  const chingachlookBlock = chingachlookPlacementBlockReason(state, con.card, target.z, playerIndex, removedIids);
  if(chingachlookBlock) return {ok:false, reason:chingachlookBlock};
  for(const idx of chosenIdxs){
    const tribute = allPossible[idx];
    if(!liveTributeMatches(state, tribute, playerIndex, options)){
      return {ok:false, reason:'selected tribute no longer matches board state'};
    }
  }
  const hand = state.players?.[playerIndex]?.hand || [];
  const handIndex = hand.findIndex(item=>item && con.card && item.iid === con.card.iid);
  if(handIndex < 0) return {ok:false, reason:'consolidating card is no longer in hand'};
  const card = hand[handIndex];
  if(!isSupportedConsolidatingCard(card, options)) return {ok:false, reason:'consolidating card requires a dedicated server reducer'};
  const inst = cloneState(card);
  inst.owner = playerIndex;
  inst.currentFate = Number(inst.currentFate ?? inst.fate ?? 0) || 0;
  let bonusFate = 0;
  const chosenTributes = chosenIdxs.map(idx=>allPossible[idx]).filter(Boolean);
  applyDeterranceForTributeZones(state, chosenTributes, playerIndex);
  chosenIdxs.forEach(idx=>{
    const tribute = allPossible[idx];
    const live = state.board?.[tribute.z]?.[tribute.r]?.[tribute.c] || tribute.card;
    const spent = cloneState(live);
    bonusFate += tributeBonusFate(spent);
    if(String(spent.id || '') === '09' && Number(spent.usesLeft) > 0){
      spent.usesLeft = Math.max(0, Number(spent.usesLeft) - 1);
      if(!Array.isArray(state.un5thUses)) state.un5thUses = [0, 0];
      state.un5thUses[playerIndex] = (Number(state.un5thUses[playerIndex] || 0) || 0) + 1;
    }
    if(!Array.isArray(state.players[playerIndex].discard)) state.players[playerIndex].discard = [];
    state.players[playerIndex].discard.push(spent);
    if(state.board?.[tribute.z]?.[tribute.r]) state.board[tribute.z][tribute.r][tribute.c] = null;
  });
  if(String(inst.id || '') === '35') inst.currentFate = alexanderFateForState(state, target.z, playerIndex);
  else if(bonusFate) inst.currentFate = (Number(inst.currentFate || 0) || 0) + bonusFate;
  ensureBoardCell(state, target.z, target.r, target.c);
  state.board[target.z][target.r][target.c] = inst;
  hand.splice(handIndex, 1);
  const whenSet = applySupportedWhenSetState(state, inst, playerIndex, target.z, target.r, target.c);
  if(whenSet && whenSet.ok === false) return whenSet;
  state._consolidating = null;
  state.placing = false;
  state.blockingCell = false;
  state.selectedHandCard = null;
  state.selectedBoardCard = null;
  return {ok:true};
}

function reduceConsolidationClick(room, msg, options){
  const payload = msg.payload || {};
  const base = verifyBaseHash(room, payload, options);
  if(!base.ok) return base;
  const state = cloneState(room.canonicalState);
  if(!state) return {ok:false, reason:'server canonical state is not initialized'};
  const con = state._consolidating;
  if(!con || typeof con !== 'object') return {ok:false, reason:'CLICK_CELL consolidation state is not initialized'};
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  if(Number(state.currentPlayer) !== playerIndex) return {ok:false, reason:'CLICK_CELL player does not have priority'};
  const z = Number(payload.z), r = Number(payload.r), c = Number(payload.c);
  const allPossible = Array.isArray(con.allPossible) ? con.allPossible : [];
  let idx = allPossible.findIndex(item=>item && Number(item.z) === z && Number(item.r) === r && Number(item.c) === c);
  if(idx < 0) return {ok:false, reason:'CLICK_CELL target is not a valid consolidation tribute'};
  if(!liveTributeMatches(state, allPossible[idx], playerIndex, options)){
    return {ok:false, reason:'CLICK_CELL tribute no longer matches board state'};
  }
  if(!Array.isArray(con.chosenIdxs)) con.chosenIdxs = [];
  const phase = String(con.phase || 'select_tributes');
  if(phase === 'select_placement'){
    const done = finalizeBasicConsolidation(state, con, idx, playerIndex, options);
    if(!done.ok) return done;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(phase !== 'select_tributes') return {ok:false, reason:'unsupported consolidation phase'};
  const running = consolidationRunningTotal(con);
  const selected = con.chosenIdxs.includes(idx);
  if(running >= (Number(con.cost || 0) || 0) && selected){
    con.phase = 'select_placement';
    const done = finalizeBasicConsolidation(state, con, idx, playerIndex, options);
    if(!done.ok) return done;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(selected) con.chosenIdxs = con.chosenIdxs.filter(item=>item !== idx);
  else con.chosenIdxs.push(idx);
  con.phase = 'select_tributes';
  return reducedResult(state, {baseStateHash:base.baseStateHash});
}

function reduceBasicClickCell(room, msg, options){
  const payload = msg.payload || {};
  if(!payload.placing){
    if(room.canonicalState && room.canonicalState._serverPendingMove) return reducePendingMoveClick(room, msg, options);
    if(room.canonicalState && room.canonicalState._consolidating) return reduceConsolidationClick(room, msg, options);
    if(String(options.mode || '').toLowerCase() === 'strict') return {ok:false, reason:'server reducer is not implemented for non-placement CLICK_CELL'};
    return validateProposedTransition(room, msg, options);
  }
  const base = verifyBaseHash(room, payload, options);
  if(!base.ok) return base;
  const state = cloneState(room.canonicalState);
  if(!state) return {ok:false, reason:'server canonical state is not initialized'};
  if(isComplexClickState(state)) return {ok:false, reason:'CLICK_CELL has an unsupported pending interaction'};
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  if(Number(state.currentPlayer) !== playerIndex) return {ok:false, reason:'CLICK_CELL player does not have priority'};
  if(!state.placing) return {ok:false, reason:'CLICK_CELL placement was not armed'};
  const selected = selectedHandCardForState(state, payload, playerIndex);
  if(selected.error) return {ok:false, reason:selected.error};
  const hand = selected.hand;
  const handIndex = selected.handIndex;
  const card = selected.card;
  if(String(card.type || '') === 'Supporter'){
    if(!isSupportedSupporterPlacementCard(card, options)) return {ok:false, reason:'CLICK_CELL card requires a dedicated server reducer'};
  } else if(!isSupportedNonSupporterPlacementCard(card, options)) return {ok:false, reason:'CLICK_CELL card requires a dedicated server reducer'};
  const z = Number(payload.z), r = Number(payload.r), c = Number(payload.c);
  if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return {ok:false, reason:'CLICK_CELL target must be numeric'};
  if(z < 0 || z > 2 || r < 0 || r > 8 || c < 0 || c > 8) return {ok:false, reason:'CLICK_CELL target out of range'};
  ensureBoardCell(state, z, r, c);
  if(state.board[z][r][c] !== null) return {ok:false, reason:'CLICK_CELL target is occupied'};
  if(isBlockedCell(state, z, r, c)) return {ok:false, reason:'CLICK_CELL target is blocked'};
  if(isArtilleryLockedConsolidationZone(state, z, playerIndex)) return {ok:false, reason:'Artillery Distance locks this zone'};
  const rowOwner = rowOwnerForState(state, z, r);
  if(rowOwner !== -1 && rowOwner !== playerIndex) return {ok:false, reason:'CLICK_CELL target row is not playable by this player'};
  const chingachlookBlock = chingachlookPlacementBlockReason(state, card, z, playerIndex);
  if(chingachlookBlock) return {ok:false, reason:chingachlookBlock};
  const supporterErr = validateSupporterPlacement(state, card, playerIndex, z, r, c);
  if(supporterErr) return {ok:false, reason:supporterErr};
  const inst = cloneState(card);
  inst.owner = playerIndex;
  inst.currentFate = Number(inst.currentFate ?? inst.fate ?? 0) || 0;
  if(!inst.iid) inst.iid = `${String(inst.id || 'card')}:server:${Date.now()}`;
  state.board[z][r][c] = inst;
  hand.splice(handIndex, 1);
  if(String(inst.type || '') === 'Supporter'){
    state.supportsPlacedThisTurn = (Number(state.supportsPlacedThisTurn || 0) || 0) + 1;
    if(!Array.isArray(state.supportersSetP)) state.supportersSetP = [0, 0];
    state.supportersSetP[playerIndex] = (Number(state.supportersSetP[playerIndex] || 0) || 0) + 1;
    inst._supporterSetCounted = true;
    inst._wasSetAsSupporter = true;
    inst._hasBeenOnBoard = true;
    inst._supporterSetOwner = playerIndex;
  }
  const whenSet = applySupportedWhenSetState(state, inst, playerIndex, z, r, c);
  if(whenSet && whenSet.ok === false) return whenSet;
  setPendingArtilleryModal(state, inst, playerIndex, z, r, c);
  setPendingSameZoneWhenSetPick(state, inst, playerIndex, z, r, c);
  setPendingVigilantesPick(state, inst, playerIndex, z, r, c);
  setPendingWolfCreekPick(state, inst, playerIndex, z, r, c);
  state.placing = false;
  state.selectedHandCard = null;
  state.selectedBoardCard = null;
  return reducedResult(state, {baseStateHash:base.baseStateHash});
}

function reducePendingMoveClick(room, msg, options){
  const payload = msg.payload || {};
  const base = verifyBaseHash(room, payload, options);
  if(!base.ok) return base;
  const state = cloneState(room.canonicalState);
  if(!state) return {ok:false, reason:'server canonical state is not initialized'};
  const pending = state._serverPendingMove;
  if(!pending || typeof pending !== 'object') return {ok:false, reason:'CLICK_CELL has no server pending move'};
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  if(Number(pending.playerIndex) !== playerIndex) return {ok:false, reason:'CLICK_CELL player does not own pending move'};
  if(Number(state.currentPlayer) !== playerIndex) return {ok:false, reason:'CLICK_CELL player does not have priority'};
  const kind = String(pending.kind || '');
  if(kind !== 'wolfCreekMove') return {ok:false, reason:`server reducer is not implemented for pending move ${kind || '(unknown)'}`};
  const z = Number(payload.z), r = Number(payload.r), c = Number(payload.c);
  if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return {ok:false, reason:'CLICK_CELL target must be numeric'};
  if(z < 0 || z > 2 || r < 0 || r > 8 || c < 0 || c > 8) return {ok:false, reason:'CLICK_CELL target out of range'};
  ensureBoardCell(state, z, r, c);
  if(state.board[z][r][c] !== null) return {ok:false, reason:'Wolf Creek target cell is occupied'};
  if(isBlockedCell(state, z, r, c)) return {ok:false, reason:'Wolf Creek target cell is blocked'};
  if(!isContestedOrOwnSafeSquareForState(state, z, r, playerIndex)){
    return {ok:false, reason:'Wolf Creek can only move into contested rows or own safe squares'};
  }
  const source = state.board?.[pending.sourceZ]?.[pending.sourceR]?.[pending.sourceC] || null;
  if(!source || String(source.id || '') !== '54' || Number(source.owner) !== playerIndex){
    return {ok:false, reason:'Wolf Creek source is no longer on board'};
  }
  if(pending.sourceIid && source.iid !== pending.sourceIid) return {ok:false, reason:'Wolf Creek source mismatch'};
  const moving = state.board?.[pending.fromZ]?.[pending.fromR]?.[pending.fromC] || null;
  if(!isWolfCreekMoveCandidate(moving, playerIndex, pending.sourceIid || null)){
    return {ok:false, reason:'Wolf Creek moving card is no longer valid'};
  }
  if(pending.movingIid && moving.iid !== pending.movingIid) return {ok:false, reason:'Wolf Creek moving card mismatch'};
  state.board[pending.fromZ][pending.fromR][pending.fromC] = null;
  state.board[z][r][c] = moving;
  source.wolfCreekUsed = true;
  applyRozsiPassiveForMove(state, moving, z);
  state._serverPendingMove = null;
  state._wolfCreekMoving = null;
  state.placing = false;
  state.selectedHandCard = null;
  state.selectedBoardCard = null;
  return reducedResult(state, {baseStateHash:base.baseStateHash});
}

function reduceForfeit(room, msg){
  const payload = msg.payload || {};
  const state = cloneState(room.canonicalState);
  if(!state) return {ok:false, reason:'server canonical state is not initialized'};
  const loserIndex = Number(payload.playerIndex);
  if(!Number.isInteger(loserIndex) || loserIndex < 0 || loserIndex > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  if(String(state.status || state.phase || '').toLowerCase() === 'ended' || state.matchResult?.serverFinalized){
    return reducedResult(state, {matchResult:state.matchResult || null});
  }
  finalizeStateForForfeit(state, loserIndex, Number(payload.endedAt || 0) || Date.now());
  return reducedResult(state, {matchResult:state.matchResult});
}

function reduceVisualOnly(room, msg, options){
  const payload = msg.payload || {};
  const base = verifyBaseHash(room, payload, options || {});
  if(!base.ok) return base;
  const state = room.canonicalState ? cloneState(room.canonicalState) : cloneState(payload.postState);
  if(!state) return {ok:false, reason:'server canonical state is not initialized'};
  return reducedResult(state, {baseStateHash:base.baseStateHash});
}

function reduceHandAction(room, msg, options){
  const payload = msg.payload || {};
  const fn = String(payload.fn || '');
  if(fn === 'placeSelected') return reducePlaceSelected(room, msg, options);
  if(String(options.mode || '').toLowerCase() === 'strict') return {ok:false, reason:`server reducer is not implemented for HAND_ACTION ${fn || '(unknown)'}`};
  return validateProposedTransition(room, msg, options);
}

function reduceModalAction(room, msg, options){
  const payload = msg.payload || {};
  const base = verifyBaseHash(room, payload, options);
  if(!base.ok) return base;
  const state = cloneState(room.canonicalState);
  if(!state) return {ok:false, reason:'server canonical state is not initialized'};
  const pending = state._serverPendingModalAction;
  if(!pending || typeof pending !== 'object') return {ok:false, reason:'MODAL_ACTION has no server pending modal'};
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  if(Number(pending.playerIndex) !== playerIndex) return {ok:false, reason:'MODAL_ACTION player does not own pending modal'};
  if(Number(state.currentPlayer) !== playerIndex) return {ok:false, reason:'MODAL_ACTION player does not have priority'};
  const kind = String(pending.kind || '');
  if(kind === 'christopherErbsDrawChoice'){
    const actionIndex = payload.actionIndex === undefined ? null : Number(payload.actionIndex);
    if(actionIndex !== null && (!Number.isInteger(actionIndex) || actionIndex < 0 || actionIndex > 1)){
      return {ok:false, reason:'Christopher Erbs choice is invalid'};
    }
    const activate = payload.activate === true || String(payload.choice || payload.action || '').toLowerCase() === 'activate' || actionIndex === 1;
    const erbsEntry = readyChristopherErbsEntryForState(state, playerIndex, pending.sourceIid || null);
    if(!erbsEntry) return {ok:false, reason:'Christopher Erbs source is no longer ready'};
    if(pending.sourceIid && String(erbsEntry.card.iid || '') !== String(pending.sourceIid)){
      return {ok:false, reason:'Christopher Erbs source mismatch'};
    }
    if(activate){
      if(erbsActiveForState(state, playerIndex)) return {ok:false, reason:'Christopher Erbs is already armed'};
      erbsEntry.card.usesLeft = Math.max(0, (Number(erbsEntry.card.usesLeft || 0) || 0) - 1);
      setErbsActiveForState(state, playerIndex, true);
    }
    state._serverPendingModalAction = null;
    const remainingDrawCount = Math.max(1, Number(pending.remainingDrawCount || 1) || 1);
    const drawn = drawCardsForState(state, playerIndex, remainingDrawCount, {skipNextErbsChoice:!activate});
    if(!drawn.ok) return drawn;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(kind !== 'artilleryDistance') return {ok:false, reason:`server reducer is not implemented for MODAL_ACTION ${kind || '(unknown)'}`};
  const actionIndex = Number(payload.actionIndex);
  if(!Number.isInteger(actionIndex) || actionIndex < 0 || actionIndex > 2) return {ok:false, reason:'Artillery Distance zone choice is invalid'};
  const live = state.board?.[pending.z]?.[pending.r]?.[pending.c] || null;
  if(!live || String(live.id || '') !== '50' || Number(live.owner) !== playerIndex) return {ok:false, reason:'Artillery Distance source is no longer on board'};
  if(pending.iid && live.iid !== pending.iid) return {ok:false, reason:'Artillery Distance source mismatch'};
  state._artilleryLockedZone = actionIndex;
  state._artilleryLockOwner = playerIndex === 0 ? 1 : 0;
  state._artilleryLockTurnsLeft = 2;
  state._artilleryEffectBlockLifted = false;
  state._serverPendingModalAction = null;
  return reducedResult(state, {baseStateHash:base.baseStateHash});
}

function selectedZoneEntryPayload(payload){
  const entries = Array.isArray(payload.selectedEntries) ? payload.selectedEntries : [];
  if(entries.length !== 1) return {error:'PICK_ZONE requires exactly one selected entry'};
  const entry = entries[0] || {};
  const z = Number(entry.z), r = Number(entry.r), c = Number(entry.c);
  if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)){
    return {error:'PICK_ZONE selected entry must include numeric z/r/c'};
  }
  return {z, r, c, card:entry.card || null};
}

function selectedZoneEntriesPayload(payload, minCount, maxCount){
  const entries = Array.isArray(payload.selectedEntries) ? payload.selectedEntries : [];
  if(entries.length < minCount || entries.length > maxCount){
    return {error:`PICK_ZONE requires ${minCount === maxCount ? minCount : `${minCount}-${maxCount}`} selected entries`};
  }
  const parsed = [];
  const seen = new Set();
  for(const entry of entries){
    const item = entry || {};
    const z = Number(item.z), r = Number(item.r), c = Number(item.c);
    if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)){
      return {error:'PICK_ZONE selected entry must include numeric z/r/c'};
    }
    const key = `${z}:${r}:${c}`;
    if(seen.has(key)) return {error:'PICK_ZONE selected entries must be unique'};
    seen.add(key);
    parsed.push({z, r, c, card:item.card || null});
  }
  return {entries:parsed};
}

function cardMatchesPayloadIdentity(card, identity){
  if(!identity) return true;
  if(!card) return false;
  if(identity.iid && card.iid !== identity.iid) return false;
  if(identity.id && String(card.id || '') !== String(identity.id)) return false;
  if(identity.name && String(card.name || '') !== String(identity.name)) return false;
  return true;
}

function validatePendingSource(state, pending, playerIndex, expectedId, label){
  const source = state.board?.[pending.z]?.[pending.r]?.[pending.c] || null;
  if(!source || String(source.id || '') !== expectedId || Number(source.owner) !== playerIndex){
    return {error:`${label} source is no longer on board`};
  }
  if(pending.iid && source.iid !== pending.iid) return {error:`${label} source mismatch`};
  return {source};
}

function liveSelectedZoneTarget(state, selected, pending, label){
  if(selected.z !== Number(pending.z)) return {error:`${label} target must be in the same zone`};
  const target = state.board?.[selected.z]?.[selected.r]?.[selected.c] || null;
  if(!target) return {error:`${label} target is no longer on board`};
  if(!cardMatchesPayloadIdentity(target, selected.card)) return {error:`${label} target identity mismatch`};
  return {target};
}

function currentFate(card){
  return Math.max(0, Number(card?.currentFate ?? card?.fate ?? 0) || 0);
}

function addFate(card, amount){
  if(!card || card.immuneFlag === true) return false;
  const before = currentFate(card);
  card.currentFate = Math.max(0, before + amount);
  return card.currentFate !== before;
}

function reduceFateToValue(state, card, targetValue, sourceOwner, z){
  if(!card || card.immuneFlag === true || String(card.id || '') === '76') return {ok:false, reason:'target is immune'};
  const before = currentFate(card);
  const next = Math.max(0, Number(targetValue) || 0);
  if(next < before && Array.isArray(state.shieldWallZones) && state.shieldWallZones.includes(z)){
    return {ok:false, reason:'Shield Wall prevents Fate loss'};
  }
  card.currentFate = next;
  if(next < before && (sourceOwner === 0 || sourceOwner === 1)){
    if(!Array.isArray(state.damageDoneP)) state.damageDoneP = [0, 0];
    state.damageDoneP[sourceOwner] = (Number(state.damageDoneP[sourceOwner] || 0) || 0) + 1;
  }
  return {ok:true, changed:next !== before};
}

function discardBoardCardForState(state, z, r, c){
  const card = state.board?.[z]?.[r]?.[c] || null;
  if(!card) return null;
  const owner = Number.isInteger(Number(card.owner)) ? Number(card.owner) : 0;
  if(!state.players?.[owner]) return null;
  if(!Array.isArray(state.players[owner].discard)) state.players[owner].discard = [];
  state.players[owner].discard.push(cloneState(card));
  state.board[z][r][c] = null;
  return card;
}

function reducePickZoneAction(room, msg, options){
  const payload = msg.payload || {};
  const base = verifyBaseHash(room, payload, options);
  if(!base.ok) return base;
  const state = cloneState(room.canonicalState);
  if(!state) return {ok:false, reason:'server canonical state is not initialized'};
  const pending = state._serverPendingZonePick;
  if(!pending || typeof pending !== 'object') return {ok:false, reason:'PICK_ZONE has no server pending picker'};
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  if(Number(pending.playerIndex) !== playerIndex) return {ok:false, reason:'PICK_ZONE player does not own pending picker'};
  if(Number(state.currentPlayer) !== playerIndex) return {ok:false, reason:'PICK_ZONE player does not have priority'};
  const kind = String(pending.kind || '');
  if(kind === 'makennaImmune'){
    const sourceResult = validatePendingSource(state, pending, playerIndex, '12', 'Makenna');
    if(sourceResult.error) return {ok:false, reason:sourceResult.error};
    const selectedMany = selectedZoneEntriesPayload(payload, 1, 2);
    if(selectedMany.error) return {ok:false, reason:selectedMany.error};
    for(const selected of selectedMany.entries){
      const live = liveSelectedZoneTarget(state, selected, pending, 'Makenna');
      if(live.error) return {ok:false, reason:live.error};
      if(Number(live.target.owner) !== playerIndex) return {ok:false, reason:'Makenna target must be friendly'};
    }
    selectedMany.entries.forEach(selected=>{
      state.board[selected.z][selected.r][selected.c].immuneFlag = true;
    });
    state._serverPendingZonePick = null;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  const selected = selectedZoneEntryPayload(payload);
  if(selected.error) return {ok:false, reason:selected.error};
  if(kind === 'liberatorsFateGain'){
    const sourceResult = validatePendingSource(state, pending, playerIndex, '05', 'Liberators of Rwanda');
    if(sourceResult.error) return {ok:false, reason:sourceResult.error};
    const live = liveSelectedZoneTarget(state, selected, pending, 'Liberators of Rwanda');
    if(live.error) return {ok:false, reason:live.error};
    addFate(live.target, 2);
    state._serverPendingZonePick = null;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(kind === 'hemorrhagingWound'){
    const sourceResult = validatePendingSource(state, pending, playerIndex, '31', 'Hemorrhaging Wound');
    if(sourceResult.error) return {ok:false, reason:sourceResult.error};
    const live = liveSelectedZoneTarget(state, selected, pending, 'Hemorrhaging Wound');
    if(live.error) return {ok:false, reason:live.error};
    const reduced = reduceFateToValue(state, live.target, currentFate(live.target) - 2, playerIndex, selected.z);
    if(!reduced.ok) return {ok:false, reason:reduced.reason};
    state._serverPendingZonePick = null;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(kind === 'minaeDiscardSupporter'){
    const sourceResult = validatePendingSource(state, pending, playerIndex, '16', 'MINAE Death Squad');
    if(sourceResult.error) return {ok:false, reason:sourceResult.error};
    const live = liveSelectedZoneTarget(state, selected, pending, 'MINAE Death Squad');
    if(live.error) return {ok:false, reason:live.error};
    const opponent = playerIndex === 0 ? 1 : 0;
    if(Number(live.target.owner) !== opponent || String(live.target.type || '') !== 'Supporter'){
      return {ok:false, reason:'MINAE Death Squad target must be an opponent Supporter'};
    }
    discardBoardCardForState(state, selected.z, selected.r, selected.c);
    state._serverPendingZonePick = null;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(kind === 'vigilantesMark'){
    const source = state.board?.[pending.z]?.[pending.r]?.[pending.c] || null;
    if(!source || String(source.id || '') !== '52' || Number(source.owner) !== playerIndex){
      return {ok:false, reason:'Vigilantes source is no longer on board'};
    }
    if(pending.iid && source.iid !== pending.iid) return {ok:false, reason:'Vigilantes source mismatch'};
    if(selected.z !== Number(pending.z)) return {ok:false, reason:'Vigilantes target must be in the same zone'};
    const target = state.board?.[selected.z]?.[selected.r]?.[selected.c] || null;
    if(!target) return {ok:false, reason:'Vigilantes target is no longer on board'};
    if(!cardMatchesPayloadIdentity(target, selected.card)) return {ok:false, reason:'Vigilantes target identity mismatch'};
    if(!isVigilantesTarget(target, playerIndex)) return {ok:false, reason:'Vigilantes target is invalid'};
    target._markedForDeath = true;
    target._reinforcementOverride = 0;
    source.effectUsedInitial = true;
    state._serverPendingZonePick = null;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(kind === 'wolfCreekSelectMoveTarget'){
    const source = state.board?.[pending.z]?.[pending.r]?.[pending.c] || null;
    if(!source || String(source.id || '') !== '54' || Number(source.owner) !== playerIndex){
      return {ok:false, reason:'Wolf Creek source is no longer on board'};
    }
    if(pending.iid && source.iid !== pending.iid) return {ok:false, reason:'Wolf Creek source mismatch'};
    if(selected.z !== Number(pending.z)) return {ok:false, reason:'Wolf Creek target must be in the same zone'};
    const target = state.board?.[selected.z]?.[selected.r]?.[selected.c] || null;
    if(!target) return {ok:false, reason:'Wolf Creek target is no longer on board'};
    if(!cardMatchesPayloadIdentity(target, selected.card)) return {ok:false, reason:'Wolf Creek target identity mismatch'};
    if(!isWolfCreekMoveCandidate(target, playerIndex, source.iid || null)) return {ok:false, reason:'Wolf Creek target is invalid'};
    const moveOptions = collectWolfCreekMoveOptions(state, playerIndex);
    if(!moveOptions.length) return {ok:false, reason:'No open squares available for Wolf Creek'};
    state._serverPendingZonePick = null;
    state._serverPendingMove = {
      kind:'wolfCreekMove',
      playerIndex,
      sourceZ:pending.z,
      sourceR:pending.r,
      sourceC:pending.c,
      sourceIid:source.iid || null,
      fromZ:selected.z,
      fromR:selected.r,
      fromC:selected.c,
      movingIid:target.iid || null
    };
    state._wolfCreekMoving = {
      card:cloneState(target),
      fromZ:selected.z,
      fromR:selected.r,
      fromC:selected.c,
      wolfCreekCard:cloneState(source),
      options:moveOptions
    };
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  return {ok:false, reason:`server reducer is not implemented for PICK_ZONE ${kind || '(unknown)'}`};
}

function reduceServerAction(room, msg, opts){
  const options = opts || {};
  const mode = String(options.mode || 'lineage').toLowerCase();
  const type = String(msg.type || '').toUpperCase();
  if(mode === 'lineage') return validateProposedTransition(room, msg, options);
  if(type === 'STATE_SYNC') return reduceStateSync(room, msg, options);
  if(type === 'CHOOSE_TURN') return reduceChooseTurn(room, msg, options);
  if(type === 'END_TURN') return reduceEndTurn(room, msg, options);
  if(type === 'START_CONSOLIDATE') return reduceStartConsolidate(room, msg, options);
  if(type === 'HAND_ACTION') return reduceHandAction(room, msg, options);
  if(type === 'CLICK_CELL') return reduceBasicClickCell(room, msg, options);
  if(type === 'MODAL_ACTION') return reduceModalAction(room, msg, options);
  if(type === 'PICK_ZONE') return reducePickZoneAction(room, msg, options);
  if(type === 'EFFECT_CINEMATIC') return reduceVisualOnly(room, msg, options);
  if(type === 'FORFEIT') return reduceForfeit(room, msg, options);
  if(mode === 'strict') return {ok:false, reason:`server reducer is not implemented for ${type}`};
  return validateProposedTransition(room, msg, options);
}

module.exports = {
  onlineStableHash,
  canonicalStateHash,
  validateCanonicalState,
  validateProposedTransition,
  reduceServerAction
};
