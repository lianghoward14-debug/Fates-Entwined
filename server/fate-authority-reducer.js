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

function hashSeed(str){
  let h = 2166136261;
  const s = String(str || 'fates');
  for(let i = 0; i < s.length; i += 1){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeSeededRng(seed){
  let a = hashSeed(seed) || 0x9e3779b9;
  return function seededRng(){
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace(arr, rng){
  for(let i = arr.length - 1; i > 0; i -= 1){
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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

function numericFate(card){
  return Math.max(0, Number(card?.currentFate ?? card?.fate ?? 0) || 0);
}

function isFaceDownServerCard(card){
  return !!(card && (card.faceDown === true || card.isFaceDown === true || card._faceDown === true));
}

function isInvisibleScoreCard(card){
  return !!(card && (String(card.id || '') === '76' || isFaceDownServerCard(card)));
}

function cardType(card){
  return String(card?.type || '');
}

function countContinuousDamageSourcesForState(state, owner){
  const source = state?._continuousDamageSources;
  if(!source) return 0;
  const prefix = `${owner}:`;
  if(Array.isArray(source)) return source.filter(key=>String(key || '').startsWith(prefix)).length;
  if(source instanceof Set){
    let count = 0;
    source.forEach(key=>{ if(String(key || '').startsWith(prefix)) count += 1; });
    return count;
  }
  if(typeof source === 'object') return Object.keys(source).filter(key=>String(key || '').startsWith(prefix) && source[key] !== false).length;
  return 0;
}

function findBoardCardPosition(state, target, zHint){
  if(!target) return null;
  const targetIid = target.iid == null ? '' : String(target.iid);
  const scanZone = (z)=>{
    const zone = state?.board?.[z];
    if(!Array.isArray(zone)) return null;
    for(let r = 0; r < zone.length; r += 1){
      const row = zone[r];
      if(!Array.isArray(row)) continue;
      for(let c = 0; c < row.length; c += 1){
        const cell = row[c];
        if(!cell) continue;
        if(targetIid && String(cell.iid || '') === targetIid) return {z, r, c};
        if(!targetIid && cell === target) return {z, r, c};
      }
    }
    return null;
  };
  if(Number.isInteger(Number(zHint))){
    const found = scanZone(Number(zHint));
    if(found) return found;
  }
  for(let z = 0; z < 3; z += 1){
    const found = scanZone(z);
    if(found) return found;
  }
  return null;
}

function findBoardCardByIid(state, iid){
  const key = iid == null ? '' : String(iid);
  if(!key || !Array.isArray(state?.board)) return null;
  for(let z = 0; z < state.board.length; z += 1){
    const zone = state.board[z];
    if(!Array.isArray(zone)) continue;
    for(let r = 0; r < zone.length; r += 1){
      const row = zone[r];
      if(!Array.isArray(row)) continue;
      for(let c = 0; c < row.length; c += 1){
        const card = row[c];
        if(card && String(card.iid || '') === key) return card;
      }
    }
  }
  return null;
}

function countServerCoordinators(state, z, owner){
  let count = 0;
  const zone = state?.board?.[z];
  if(!Array.isArray(zone)) return 0;
  zone.forEach((row, r)=>{
    if(!Array.isArray(row)) return;
    row.forEach((cell, c)=>{
      if(cell && cardType(cell) === 'Coordinator' && Number(cell.owner) === Number(owner) && !isFaceDownServerCard(cell) && !isCoordinatorSuppressedAtServer(state, z, r, c)) count += 1;
    });
  });
  return count;
}

function isCoordinatorSuppressedAtServer(state, z, r, c){
  const card = state?.board?.[z]?.[r]?.[c] || null;
  if(!card || cardType(card) !== 'Coordinator' || isFaceDownServerCard(card)) return false;
  const owner = Number(card.owner);
  return orthogonalAdjacentEntries(state, z, r, c).some(entry=>{
    const adj = entry.card;
    return adj && String(adj.id || '') === '67' && Number(adj.owner) !== owner && !isFaceDownServerCard(adj);
  });
}

const FRENCH_FUSILIERS_SERVER_COPYABLE_PASSIVE_IDS = new Set(['20','49','53','59','64']);
const LEDGER_KEEPERS_SERVER_COPYABLE_WHEN_SET_IDS = new Set([
  '05','16','18','25','26','31','32','33','42','50','58','60','68','69','71','72','73','76','80'
]);
const SERVER_DEFERRED_WHEN_SET_IDS = new Set([
  '03','04','05','06','07','08','12','13','16','17','21','22','26','29','30','31','39','42','43','48',
  '50','51','52','54','58','60','61','62','66','68','69','75','77','80','90','94'
]);

function serverCopiedFrenchPassiveId(card){
  if(!card || String(card.id || '') !== '37') return '';
  const copied = card._copiedPassiveId ?? card.copiedPassiveId;
  return copied == null ? '' : String(copied);
}

function serverCardActsAsPassive(card, sourceId, state){
  if(!card || isFaceDownServerCard(card) || isSupporterAuraSuppressed(card, state)) return false;
  const wanted = String(sourceId || '');
  return String(card.id || '') === wanted || serverCopiedFrenchPassiveId(card) === wanted;
}

function canFrenchFusiliersCopyPassiveForState(card, state){
  if(!card || String(card.type || '') !== 'Supporter') return false;
  if(isFaceDownServerCard(card) || isSupporterAuraSuppressed(card, state)) return false;
  const id = String(card.id || '');
  if(id === '37') return false;
  return FRENCH_FUSILIERS_SERVER_COPYABLE_PASSIVE_IDS.has(id);
}

function canLedgerKeepersCopyWhenSetForState(card, sourceIid, state){
  if(!card || String(card.type || '') !== 'Supporter') return false;
  if(isFaceDownServerCard(card) || isSupporterAuraSuppressed(card, state)) return false;
  if(sourceIid && String(card.iid || '') === String(sourceIid)) return false;
  return LEDGER_KEEPERS_SERVER_COPYABLE_WHEN_SET_IDS.has(String(card.id || ''));
}

function stablePassiveTargetRank(source, target){
  const key = `${String(source && (source.iid || source.id) || '')}:${String(target && (target.iid || target.id) || '')}`;
  let hash = 2166136261;
  for(let i = 0; i < key.length; i += 1){
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function markContinuousDamageSourceForState(state, owner, id, sourceKey){
  if(owner !== 0 && owner !== 1) return;
  const key = `${owner}:${id}:${sourceKey || 'source'}`;
  const source = state?._continuousDamageSources;
  if(Array.isArray(source)){
    if(!source.includes(key)) source.push(key);
    return;
  }
  if(source && typeof source === 'object'){
    source[key] = true;
    return;
  }
  state._continuousDamageSources = {[key]:true};
}

function getCookIslandsDuelistTargetForState(state, source, zHint){
  if(!source || !serverCardActsAsPassive(source, '64', state)) return null;
  const pos = findBoardCardPosition(state, source, zHint);
  if(!pos) return null;
  const candidates = orthogonalAdjacentEntries(state, pos.z, pos.r, pos.c).filter(entry=>{
    const target = entry?.card;
    if(!target || Number(target.owner) === Number(source.owner) || isFaceDownServerCard(target)) return false;
    return !(target.immuneFlag === true || String(target.id || '') === '76');
  });
  if(!candidates.length){
    delete source._cookIslandsDuelistTargetIid;
    return null;
  }
  const current = candidates.find(entry=>String(entry.card.iid) === String(source._cookIslandsDuelistTargetIid));
  if(current) return current;
  candidates.sort((a, b)=>stablePassiveTargetRank(source, a.card) - stablePassiveTargetRank(source, b.card));
  source._cookIslandsDuelistTargetIid = candidates[0].card.iid;
  return candidates[0];
}

function hydrateContinuousScoreSources(state){
  if(!Array.isArray(state?.board)) return;
  state.board.forEach((zone, z)=>{
    if(!Array.isArray(zone)) return;
    zone.forEach(row=>{
      if(!Array.isArray(row)) return;
      row.forEach(cell=>{
        if(!cell || !serverCardActsAsPassive(cell, '64', state)) return;
        const target = getCookIslandsDuelistTargetForState(state, cell, z);
        if(target) markContinuousDamageSourceForState(state, Number(cell.owner), '64', cell.iid || cell.id || 'source');
      });
    });
  });
}

function serverEffectiveFate(state, card, z, r, c){
  if(!card || isFaceDownServerCard(card)) return 0;
  if(card.noBonus) return numericFate(card);
  const owner = Number(card.owner);
  const id = String(card.id || '');
  const zone = Array.isArray(state?.board?.[z]) ? state.board[z] : [];
  if(id === '41'){
    const damageDone = Number(state?.damageDoneP?.[owner] || 0) || 0;
    return Math.max(0, (damageDone + countContinuousDamageSourcesForState(state, owner)) * 2);
  }

  const pos = Number.isInteger(Number(r)) && Number.isInteger(Number(c))
    ? {z:Number(z), r:Number(r), c:Number(c)}
    : findBoardCardPosition(state, card, z);
  let bonus = 0;

  if(serverCardActsAsPassive(card, '65', state)) bonus += 3;
  if(id === '63'){
    let copies = 0;
    zone.forEach(row=>{
      if(!Array.isArray(row)) return;
      row.forEach(cell=>{
        if(cell && String(cell.id || '') === '63' && Number(cell.owner) === owner && !isInvisibleScoreCard(cell)) copies += 1;
      });
    });
    bonus += copies * 2;
  }

  if(id === '44' && pos && !isSupporterAuraSuppressed(card, state)){
    const hasAdjacentDauntless = orthogonalAdjacentEntries(state, pos.z, pos.r, pos.c).some(entry=>{
      const adj = entry.card;
      return adj && Number(adj.owner) === owner && cardType(adj) === 'Dauntless' && String(adj.id || '') !== '76';
    });
    if(hasAdjacentDauntless) bonus += 3;
  }
  if(serverCardActsAsPassive(card, '64', state)){
    const target = getCookIslandsDuelistTargetForState(state, card, z);
    if(target){
      bonus += 3;
      markContinuousDamageSourceForState(state, owner, '64', card.iid || card.id || 'source');
    }
  }
  zone.forEach(row=>{
    if(!Array.isArray(row)) return;
    row.forEach(cell=>{
      if(!cell || isInvisibleScoreCard(cell) || !serverCardActsAsPassive(cell, '64', state)) return;
      const target = getCookIslandsDuelistTargetForState(state, cell, z);
      if(target?.card && String(target.card.iid || '') === String(card.iid || '')){
        bonus -= 3;
        markContinuousDamageSourceForState(state, Number(cell.owner), '64', cell.iid || cell.id || 'source');
      }
    });
  });

  let jeremiahBoost = 0;
  zone.forEach((row, rr)=>{
    if(!Array.isArray(row)) return;
    row.forEach((cell, cc)=>{
      if(cell && String(cell.id || '') === '57' && Number(cell.owner) === owner && !isInvisibleScoreCard(cell) && !isCoordinatorSuppressedAtServer(state, z, rr, cc)){
        jeremiahBoost += 1;
      }
    });
  });

  zone.forEach((row, rr)=>{
    if(!Array.isArray(row)) return;
    row.forEach((cell, cc)=>{
      if(!cell || isInvisibleScoreCard(cell)) return;
      if(String(cell.id || '') === '10' && Number(cell.owner) !== owner){
        bonus -= 2;
        return;
      }
      if(cardType(cell) === 'Coordinator' && isCoordinatorSuppressedAtServer(state, z, rr, cc)) return;
      if(Number(cell.owner) !== owner) return;
      const cellId = String(cell.id || '');
      if(cellId === '01' && orthogonalAdjacentEntries(state, z, rr, cc).some(entry=>entry.card && String(entry.card.iid || '') === String(card.iid || ''))) bonus += 3 + jeremiahBoost;
      if(cellId === '11' && cardType(card) === 'Supporter') bonus += 3 + jeremiahBoost;
      if(cellId === '19' && cardType(card) === 'Coordinator') bonus += 2 + jeremiahBoost;
      if(cellId === '23' && cardType(card) !== 'Supporter') bonus += 2 + jeremiahBoost;
      if(serverCardActsAsPassive(cell, '59', state) && cardType(card) === 'Supporter') bonus += 1;
      if(cellId === '77' && cell._declaredAff && card.aff === cell._declaredAff) bonus += 3 + jeremiahBoost;
    });
  });

  let zsofiaCount = 0;
  zone.forEach((row, rr)=>{
    if(!Array.isArray(row)) return;
    row.forEach((cell, cc)=>{
      if(cell && String(cell.id || '') === '15' && Number(cell.owner) === owner && !isCoordinatorSuppressedAtServer(state, z, rr, cc)) zsofiaCount += 1;
    });
  });
  if(zsofiaCount > 0) bonus += Math.min(3, zsofiaCount * (countServerCoordinators(state, z, owner) + jeremiahBoost));

  if(cardType(card) === 'Dauntless' && id !== '76'){
    zone.forEach((row, rr)=>{
      if(!Array.isArray(row)) return;
      row.forEach((cell, cc)=>{
        if(cell && String(cell.id || '') === '44' && Number(cell.owner) === owner && !isInvisibleScoreCard(cell) && !isSupporterAuraSuppressed(cell, state)){
          if(orthogonalAdjacentEntries(state, z, rr, cc).some(entry=>entry.card && String(entry.card.iid || '') === String(card.iid || ''))) bonus += 3;
        }
      });
    });
  }

  if(id === '55'){
    let allSameAff = true;
    let ownAff = null;
    let ownCount = 0;
    zone.forEach(row=>{
      if(!Array.isArray(row)) return;
      row.forEach(cell=>{
        if(cell && Number(cell.owner) === owner && String(cell.iid || '') !== String(card.iid || '') && !isInvisibleScoreCard(cell)){
          ownCount += 1;
          if(!ownAff) ownAff = cell.aff;
          else if(cell.aff !== ownAff) allSameAff = false;
        }
      });
    });
    if(allSameAff && ownAff && ownCount >= 3) bonus += 5;
  }

  return Math.max(0, numericFate(card) + bonus);
}

function stateLandscapeZoneFateBonus(state, playerIndex, z){
  const sources = [
    state?.landscapeZoneFateBonus,
    state?._landscapeZoneFateBonus,
    state?.zoneFateBonus,
    state?._zoneFateBonus,
    state?._landscapeState?.zoneFateBonuses
  ];
  for(const source of sources){
    if(!source) continue;
    if(Array.isArray(source)){
      const direct = source[playerIndex]?.[z] ?? source[z]?.[playerIndex];
      if(direct !== undefined) return Number(direct || 0) || 0;
    }else if(typeof source === 'object'){
      const direct = source[`${playerIndex}:${z}`] ?? source[`${z}:${playerIndex}`] ?? source[playerIndex]?.[z] ?? source[z]?.[playerIndex];
      if(direct !== undefined) return Number(direct || 0) || 0;
    }
  }
  return 0;
}

function statePlayerZoneMultiplier(state, playerIndex){
  const sources = [state?.playerZoneFateMultiplier, state?._playerZoneFateMultiplier, state?.zoneFateMultiplier, state?._zoneFateMultiplier];
  for(const source of sources){
    if(!source) continue;
    const value = Array.isArray(source) ? source[playerIndex] : source[playerIndex];
    if(value !== undefined) return Math.max(1, Number(value || 1) || 1);
  }
  return 1;
}

function serverZoneScore(state, z, playerIndex){
  const zone = Array.isArray(state?.board?.[z]) ? state.board[z] : [];
  let score = 0;
  let deterranceOwner = -1;
  for(let r = 0; r < zone.length; r += 1){
    const row = zone[r];
    if(!Array.isArray(row)) continue;
    for(let c = 0; c < row.length; c += 1){
      const card = row[c];
      if(!card) continue;
      if(String(card.id || '') === '36') deterranceOwner = Number(card.owner);
      if(Number(card.owner) === playerIndex) score += serverEffectiveFate(state, card, z, r, c);
    }
  }
  const fateModifiers = state?.fateModifiers || {};
  const dm = Number(fateModifiers[`deterrance_z${z}`] || 0) || 0;
  if(deterranceOwner >= 0 && deterranceOwner !== playerIndex && dm < 0){
    score = Math.max(0, score + dm);
  }
  score = Math.max(0, score + stateLandscapeZoneFateBonus(state, playerIndex, z));
  const multiplier = statePlayerZoneMultiplier(state, playerIndex);
  if(multiplier > 1) score = Math.ceil(score * multiplier);
  return score;
}

function computeServerMatchResult(state, endedAt){
  hydrateContinuousScoreSources(state);
  let p0wins = 0;
  let p1wins = 0;
  const zones = [];
  for(let z = 0; z < 3; z += 1){
    const s0 = serverZoneScore(state, z, 0);
    const s1 = serverZoneScore(state, z, 1);
    const ctrl = s0 > s1 ? 0 : (s1 > s0 ? 1 : -1);
    if(ctrl === 0) p0wins += 1;
    else if(ctrl === 1) p1wins += 1;
    zones.push({z, s0, s1, ctrl});
  }
  let winnerIndex = p0wins >= 2 ? 0 : (p1wins >= 2 ? 1 : -1);
  let drawByFate = false;
  let isDraw = false;
  const p0TotalFate = zones.reduce((sum, zone)=>sum + zone.s0, 0);
  const p1TotalFate = zones.reduce((sum, zone)=>sum + zone.s1, 0);
  if(winnerIndex < 0){
    if(p0TotalFate > p1TotalFate){ winnerIndex = 0; drawByFate = true; }
    else if(p1TotalFate > p0TotalFate){ winnerIndex = 1; drawByFate = true; }
    else isDraw = true;
  }
  return {
    type:'score',
    reason:'score',
    winner:winnerIndex,
    winnerIndex,
    loser:winnerIndex >= 0 ? (winnerIndex === 0 ? 1 : 0) : -1,
    loserIndex:winnerIndex >= 0 ? (winnerIndex === 0 ? 1 : 0) : -1,
    isDraw,
    drawByFate,
    p0wins,
    p1wins,
    p0TotalFate,
    p1TotalFate,
    zones,
    endedAt:endedAt || Date.now(),
    serverFinalized:true
  };
}

function clearFinalizedInteractionState(state){
  state._serverPendingModalAction = null;
  state._serverPendingZonePick = null;
  state._serverPendingMove = null;
  state._serverPendingCardPick = null;
  state._consolidating = null;
  state.placing = false;
  state.selectedHandCard = null;
  state.selectedBoardCard = null;
  state.blockingCell = false;
  state.pendingEffect = null;
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
  clearFinalizedInteractionState(state);
}

function finalizeStateForDisconnect(state, loserIndex, endedAt){
  const winnerIndex = loserIndex === 0 ? 1 : 0;
  state.phase = 'ended';
  state.status = 'ended';
  state.gameOver = true;
  state.winner = winnerIndex;
  state.winnerIndex = winnerIndex;
  state.loser = loserIndex;
  state.loserIndex = loserIndex;
  state.endReason = 'disconnect';
  state.endedAt = endedAt || Date.now();
  state.matchResult = {
    type:'disconnect',
    reason:'disconnect',
    winner:winnerIndex,
    winnerIndex,
    loser:loserIndex,
    loserIndex,
    endedAt:state.endedAt,
    serverFinalized:true
  };
  state._serverFinalized = true;
  clearFinalizedInteractionState(state);
}

function finalizeStateForScoreResult(state, result){
  state.phase = 'ended';
  state.status = 'ended';
  state.gameOver = true;
  state.winner = result.winnerIndex;
  state.winnerIndex = result.winnerIndex;
  state.loser = result.loserIndex;
  state.loserIndex = result.loserIndex;
  state.isDraw = !!result.isDraw;
  state.drawByFate = !!result.drawByFate;
  state.endReason = 'score';
  state.endedAt = result.endedAt || Date.now();
  state.matchResult = result;
  state._serverFinalized = true;
  clearFinalizedInteractionState(state);
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

function promptSafeSegment(value, fallback){
  const raw = String(value || fallback || 'prompt');
  return raw.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48) || String(fallback || 'prompt');
}

function nextServerPromptId(state, bucket, pending){
  if(!state || !pending || typeof pending !== 'object') return '';
  const seq = (Number(state._serverPromptSeq || 0) || 0) + 1;
  state._serverPromptSeq = seq;
  return `${promptSafeSegment(bucket, 'prompt')}:${Number(state.turn || 0) || 0}:${Number(pending.playerIndex ?? state.currentPlayer ?? -1)}:${promptSafeSegment(pending.kind || pending.reason || bucket, bucket)}:${seq}`;
}

function stampServerPendingPromptIds(state){
  if(!state || typeof state !== 'object') return;
  [
    ['pickCards', state._serverPendingCardPick],
    ['pickZone', state._serverPendingZonePick],
    ['pickMove', state._serverPendingMove],
    ['consolidate', state._consolidating],
    ['modal', state._serverPendingModalAction],
    ['reaction', state._serverPendingReaction]
  ].forEach(([bucket, pending])=>{
    if(pending && typeof pending === 'object' && !pending.promptId){
      pending.promptId = nextServerPromptId(state, bucket, pending);
    }
  });
}

function reducedResult(state, extra){
  stampServerPendingPromptIds(state);
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
  if(hasTruthy(state._serverPendingModalAction) || hasTruthy(state._serverPendingZonePick) || hasTruthy(state._serverPendingMove) || hasTruthy(state._serverPendingCardPick)){
    return {ok:false, reason:'END_TURN has an unresolved server interaction'};
  }
  if(state.oppSuppressedNextTurn && Number(state.suppressTarget) === playerIndex){
    state.oppSuppressedNextTurn = false;
    state.suppressTarget = null;
  }
  state.currentPlayer = playerIndex === 0 ? 1 : 0;
  state.turn = Math.max(Number(state.turn || 0) + 1, Number(payload.turn || 0) + 1, 1);
  state.supportsPlacedThisTurn = 0;
  state.extraSupportsThisTurn = 0;
  state.majaEffectThisTurn = false;
  state._zimbabweUsedThisTurn = false;
  if(Array.isArray(state.board)){
    state.board.forEach(zone=>{
      if(!Array.isArray(zone)) return;
      zone.forEach(row=>{
        if(!Array.isArray(row)) return;
        row.forEach(card=>{
          if(card && Number(card.owner) === Number(state.currentPlayer)){
            card.effectUsedThisTurn = false;
            if(String(card.id || '') === '52') card.vigilanteUsed = false;
            if(String(card.id || '') === '54') card.wolfCreekUsed = false;
            if(String(card.id || '') === '73') card._expMoved = false;
            if(Number(card._busserMoves || 0) > 0) card._busserMovedThisTurn = false;
            card._landscapeEventideMovedTurn = null;
          }
        });
      });
    });
  }
  applyPhilDrawPhaseGrowth(state, Number(state.currentPlayer));
  applyWineCountryGuerillaTurnTick(state, Number(state.currentPlayer));
  state.selectedHandCard = null;
  state.selectedBoardCard = null;
  state.placing = false;
  state.blockingCell = false;
  state.pendingEffect = null;
  return reducedResult(state, {baseStateHash:base.baseStateHash});
}

function applyWineCountryGuerillaTurnTick(state, playerIndex){
  const holder = state?.players?.[playerIndex];
  if(!holder || !Array.isArray(holder.hand)) return;
  const guerillas = holder.hand.filter(card =>
    card &&
    String(card.id || '') === '70' &&
    card.guerilla_transferred === true &&
    Number(card.guerilla_turnsLeft || 0) > 0
  );
  guerillas.forEach(gc=>{
    const candidates = holder.hand.filter(card =>
      card &&
      String(card.iid || '') !== String(gc.iid || '') &&
      String(card.id || '') !== '70'
    );
    if(candidates.length > 0){
      const pick = serverRandomIndex(state, playerIndex, candidates.length, `wineCountryGuerilla:${gc.iid || gc.id || 'source'}`);
      const target = candidates[pick] || candidates[0];
      const before = Math.max(0, Number(target.currentFate ?? target.fate ?? 0) || 0);
      target.currentFate = Math.max(0, before - 1);
      if(target.currentFate < before){
        const sourceOwner = (Number(gc.guerilla_owner) === 0 || Number(gc.guerilla_owner) === 1) ? Number(gc.guerilla_owner) : (playerIndex === 0 ? 1 : 0);
        markContinuousDamageSourceForState(state, sourceOwner, '70', gc.iid || gc.id || 'source');
      }
    }
    gc.guerilla_turnsLeft = Math.max(0, (Number(gc.guerilla_turnsLeft || 0) || 0) - 1);
    if(gc.guerilla_turnsLeft <= 0){
      const idx = holder.hand.findIndex(card=>card && String(card.iid || '') === String(gc.iid || ''));
      if(idx >= 0){
        const [returned] = holder.hand.splice(idx, 1);
        const originalOwner = (Number(returned.guerilla_owner) === 0 || Number(returned.guerilla_owner) === 1) ? Number(returned.guerilla_owner) : (playerIndex === 0 ? 1 : 0);
        const originalPlayer = state.players?.[originalOwner];
        if(originalPlayer){
          if(!Array.isArray(originalPlayer.discard)) originalPlayer.discard = [];
          originalPlayer.discard.push(returned);
        }
      }
    }
  });
}

function applyPhilDrawPhaseGrowth(state, playerIndex){
  if(!Array.isArray(state?.board)) return;
  state.board.forEach(zone=>{
    if(!Array.isArray(zone)) return;
    zone.forEach(row=>{
      if(!Array.isArray(row)) return;
      row.forEach(card=>{
        if(!card || String(card.id || '') !== '46' || Number(card.owner) !== playerIndex) return;
        if(typeof card._philSetTurn !== 'number') return;
        card.currentFate = Math.max(0, (Number(card.currentFate ?? card.fate ?? 0) || 0) + 2);
        card._philDrawPhaseGrowth = (Number(card._philDrawPhaseGrowth || 0) || 0) + 2;
      });
    });
  });
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
    hasTruthy(state._serverPendingReaction) ||
    hasTruthy(state._serverPendingMove) ||
    hasTruthy(state._serverPendingCardPick) ||
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

function serverReactionCardIdentity(card){
  return card ? {iid:card.iid || null, id:card.id || null, name:card.name || ''} : null;
}

function serverReactionOptionForBoardCard(kind, card, z, r, c){
  return {
    kind,
    z,
    r,
    c,
    card:serverReactionCardIdentity(card),
    label:kind === 'lydia' ? 'Lydia' : (kind === 'secules' ? 'Mr. Secules' : 'Reaction')
  };
}

function serverReactionOptionForHandCard(kind, card, handIndex, deploymentOptions){
  return {
    kind,
    handIndex,
    card:serverReactionCardIdentity(card),
    label:kind === 'havano' ? 'Havano Citizen' : 'Hand Reaction',
    deploymentOptions:Array.isArray(deploymentOptions) ? deploymentOptions : []
  };
}

const SERVER_REACTIONABLE_SUPPORTER_WHEN_SET_IDS = new Set([
  '05','06','07','08','09','13','16','18','20','22','25','26','28','31','32','33',
  '37','42','47','50','52','54','58','60','62','65','68','69','71','72','73','75',
  '76','80','91','94'
]);

const SERVER_REACTIONABLE_INITIATOR_WHEN_SET_IDS = new Set([
  '02','03','04','06','07','08','13','17','22','27','29','30','39','43','48','51',
  '66','90'
]);

const SERVER_SUPPORTER_EFFECT_AFFECTS_OPPONENT_IDS = new Set([
  '16','26','31','50','53','61','62','71','72','73','75','76','77','80','91'
]);

const SERVER_INITIATOR_EFFECT_AFFECTS_OPPONENT_IDS = new Set([
  '03','04','17','30','39'
]);

function serverWhenSetEffectAffectsPlayer(state, sourceCard, sourceOwner, targetPlayer, z, family){
  if(!sourceCard || sourceOwner === targetPlayer) return false;
  const id = String(sourceCard.id || '');
  if(String(family || '') === 'supporterWhenSet'){
    if(SERVER_SUPPORTER_EFFECT_AFFECTS_OPPONENT_IDS.has(id)) return true;
    if(id === '18') return true;
    if(id === '20'){
      return boardCardEntriesInZone(state, z, card=>Number(card.owner) === targetPlayer).length > 0;
    }
    return false;
  }
  if(String(family || '') === 'initiatorWhenSet'){
    if(SERVER_INITIATOR_EFFECT_AFFECTS_OPPONENT_IDS.has(id)) return true;
    return false;
  }
  return false;
}

function collectHavanoDeploymentOptions(state, playerIndex, card){
  const options = [];
  if(!state || !card || String(card.id || '') !== '79') return options;
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
        if(isBlockedByAlondra(state, z, r, c, playerIndex)) continue;
        options.push({z, r, c});
      }
    }
  }
  return options;
}

function collectHavanoReactionOptions(state, sourceCard, sourceOwner, family, z){
  const reactor = sourceOwner === 0 ? 1 : 0;
  if(!serverWhenSetEffectAffectsPlayer(state, sourceCard, sourceOwner, reactor, z, family)) return [];
  const hand = state.players?.[reactor]?.hand || [];
  const options = [];
  hand.forEach((card, handIndex)=>{
    if(!card || String(card.id || '') !== '79') return;
    if(isSupporterEffectSuppressedForState(state, card)) return;
    const deploymentOptions = collectHavanoDeploymentOptions(state, reactor, card);
    if(deploymentOptions.length) options.push(serverReactionOptionForHandCard('havano', card, handIndex, deploymentOptions));
  });
  return options;
}

function collectServerReactionOptions(state, sourceCard, sourceOwner, family, sourceZ){
  const options = [];
  if(!state || !sourceCard || isEffectImmuneSource(sourceCard)) return options;
  const reactor = sourceOwner === 0 ? 1 : 0;
  const sourceType = String(sourceCard.type || '');
  const isSupporterWhenSet = String(family || '') === 'supporterWhenSet' && sourceType === 'Supporter';
  const isInitiatorWhenSet = String(family || '') === 'initiatorWhenSet' && sourceType === 'Initiator';
  if(!isSupporterWhenSet && !isInitiatorWhenSet) return options;
  for(let z = 0; z < 3; z += 1){
    const zone = state.board?.[z] || [];
    for(let r = 0; r < zone.length; r += 1){
      const row = zone[r] || [];
      for(let c = 0; c < row.length; c += 1){
        const card = row[c];
        if(!card || Number(card.owner) !== reactor || isFaceDownServerCard(card) || card.immuneFlag === true) continue;
        if(isSupporterWhenSet && String(card.id || '') === '56'){
          if(card.usesLeft === null || card.usesLeft === undefined) card.usesLeft = 5;
          if(Number(card.usesLeft || 0) > 0) options.push(serverReactionOptionForBoardCard('lydia', card, z, r, c));
        }
        if(String(card.id || '') === '67'){
          if(card.usesLeft === null || card.usesLeft === undefined) card.usesLeft = card._seculesUsed ? 0 : 1;
          if(Number(card.usesLeft || 0) > 0) options.push(serverReactionOptionForBoardCard('secules', card, z, r, c));
        }
      }
    }
  }
  collectHavanoReactionOptions(state, sourceCard, sourceOwner, family, Number(sourceZ)).forEach(option=>options.push(option));
  return options;
}

function armServerReactionWindowForWhenSet(state, inst, playerIndex, z, r, c){
  if(!state || !inst) return false;
  const sourceType = String(inst.type || '');
  const id = String(inst.id || '');
  let kind = '';
  if(sourceType === 'Supporter' && SERVER_REACTIONABLE_SUPPORTER_WHEN_SET_IDS.has(id)) kind = 'supporterWhenSet';
  if(sourceType === 'Initiator' && SERVER_REACTIONABLE_INITIATOR_WHEN_SET_IDS.has(id)) kind = 'initiatorWhenSet';
  if(!kind) return false;
  if(isSupporterEffectSuppressedForState(state, inst)) return false;
  const options = collectServerReactionOptions(state, inst, playerIndex, kind, z);
  if(!options.length) return false;
  const seq = (Number(state._serverReactionSeq || 0) || 0) + 1;
  state._serverReactionSeq = seq;
  state._serverPendingReaction = {
    kind,
    promptId:`rx:${Number(state.turn || 0) || 0}:${playerIndex}:${inst.iid || inst.id || 'card'}:${z}:${r}:${c}:${seq}`,
    playerIndex:playerIndex === 0 ? 1 : 0,
    triggerPlayerIndex:playerIndex,
    source:{
      z,
      r,
      c,
      card:serverReactionCardIdentity(inst)
    },
    sourceType:String(inst.type || ''),
    sourceName:inst.name || 'Supporter',
    options,
    timeoutMs:15000
  };
  state.selectedBoardCard = null;
  state.placing = false;
  state.blockingCell = false;
  return true;
}

function pendingReactionSource(state, pending){
  const source = pending?.source || {};
  const z = Number(source.z), r = Number(source.r), c = Number(source.c);
  if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return {error:'pending reaction source is invalid'};
  const card = state.board?.[z]?.[r]?.[c] || null;
  if(!card) return {error:'pending reaction source is no longer on board'};
  if(!cardMatchesPayloadIdentity(card, source.card)) return {error:'pending reaction source identity mismatch'};
  return {card, z, r, c};
}

function completePendingReactionOriginalEffect(state, pending, options){
  const source = pendingReactionSource(state, pending);
  if(source.error) return {ok:false, reason:source.error};
  const owner = Number(source.card.owner);
  if(owner !== Number(pending.triggerPlayerIndex)) return {ok:false, reason:'pending reaction source owner mismatch'};
  state._serverPendingReaction = null;
  const whenSet = applySupportedWhenSetState(state, source.card, owner, source.z, source.r, source.c);
  if(whenSet && whenSet.ok === false) return whenSet;
  armPostWhenSetInteractionHooks(state, source.card, owner, source.z, source.r, source.c);
  return {ok:true};
}

function selectedReactionOption(state, pending, payload){
  const options = Array.isArray(pending?.options) ? pending.options : [];
  let candidate = null;
  const idx = Number(payload.optionIndex);
  if(Number.isInteger(idx) && idx >= 0 && idx < options.length) candidate = options[idx];
  const reaction = payload.reaction || payload.option || {};
  if(!candidate && reaction && typeof reaction === 'object'){
    candidate = options.find(option =>
      (!reaction.kind || String(option.kind || '') === String(reaction.kind || '')) &&
      (reaction.z === undefined || Number(option.z) === Number(reaction.z)) &&
      (reaction.r === undefined || Number(option.r) === Number(reaction.r)) &&
      (reaction.c === undefined || Number(option.c) === Number(reaction.c)) &&
      (!reaction.card || cardMatchesPayloadIdentity(option.card, reaction.card))
    ) || null;
  }
  if(!candidate && options.length === 1 && !payload.optionIndex && !payload.reaction && !payload.option) candidate = options[0];
  if(!candidate) return {error:'REACTION_CHOICE option is not available'};
  if(String(candidate.kind || '') === 'havano'){
    const hand = state.players?.[pending.playerIndex]?.hand || [];
    let handIndex = Number.isInteger(Number(candidate.handIndex)) ? Number(candidate.handIndex) : -1;
    let card = handIndex >= 0 ? hand[handIndex] : null;
    if(!cardMatchesPayloadIdentity(card, candidate.card)){
      handIndex = hand.findIndex(item=>item && cardMatchesPayloadIdentity(item, candidate.card));
      card = handIndex >= 0 ? hand[handIndex] : null;
    }
    if(!card) return {error:'Havano Citizen is no longer in hand'};
    if(String(card.id || '') !== '79') return {error:'REACTION_CHOICE hand source is not Havano Citizen'};
    if(isSupporterEffectSuppressedForState(state, card)) return {error:'Havano Citizen reaction is suppressed'};
    return {option:candidate, card, handIndex};
  }
  const z = Number(candidate.z), r = Number(candidate.r), c = Number(candidate.c);
  const card = state.board?.[z]?.[r]?.[c] || null;
  if(!card) return {error:'REACTION_CHOICE source is no longer on board'};
  if(!cardMatchesPayloadIdentity(card, candidate.card)) return {error:'REACTION_CHOICE source identity mismatch'};
  if(Number(card.owner) !== Number(pending.playerIndex)) return {error:'REACTION_CHOICE source owner mismatch'};
  if(String(card.id || '') === '56' && String(candidate.kind || '') === 'lydia'){
    if(Number(card.usesLeft ?? 5) <= 0) return {error:'Lydia has no uses remaining'};
    return {option:candidate, card, z, r, c};
  }
  if(String(card.id || '') === '67' && String(candidate.kind || '') === 'secules'){
    if(Number(card.usesLeft ?? (card._seculesUsed ? 0 : 1)) <= 0) return {error:'Mr. Secules has no uses remaining'};
    return {option:candidate, card, z, r, c};
  }
  return {error:'REACTION_CHOICE source cannot use this reaction'};
}

function selectedHavanoDeploymentPayload(payload){
  const raw = payload.deployment || payload.deploy || payload.target || {};
  const z = Number(raw.z), r = Number(raw.r), c = Number(raw.c);
  if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return {error:'Havano deployment target must include numeric z/r/c'};
  return {z, r, c};
}

function deployHavanoReaction(state, selected, payload, playerIndex){
  const deployment = selectedHavanoDeploymentPayload(payload);
  if(deployment.error) return {ok:false, reason:deployment.error};
  const allowed = Array.isArray(selected.option.deploymentOptions) && selected.option.deploymentOptions.some(option =>
    Number(option.z) === deployment.z &&
    Number(option.r) === deployment.r &&
    Number(option.c) === deployment.c
  );
  if(!allowed) return {ok:false, reason:'Havano deployment target was not in the server options'};
  const z = deployment.z, r = deployment.r, c = deployment.c;
  if(z < 0 || z > 2 || r < 0 || r > 8 || c < 0 || c > 8) return {ok:false, reason:'Havano deployment target out of range'};
  ensureBoardCell(state, z, r, c);
  if(state.board[z][r][c] !== null) return {ok:false, reason:'Havano deployment target is occupied'};
  const rowOwner = rowOwnerForState(state, z, r);
  if(rowOwner !== -1 && rowOwner !== playerIndex) return {ok:false, reason:'Havano deployment row is not playable by this player'};
  if(isBlockedCell(state, z, r, c)) return {ok:false, reason:'Havano deployment target is blocked'};
  if(isArtilleryLockedConsolidationZone(state, z, playerIndex)) return {ok:false, reason:'Artillery Distance locks this zone'};
  if(isBlockedByAlondra(state, z, r, c, playerIndex)) return {ok:false, reason:'Havano deployment is blocked by Alondra'};
  const hand = state.players?.[playerIndex]?.hand || [];
  const handIndex = Number(selected.handIndex);
  if(handIndex < 0 || handIndex >= hand.length || !cardMatchesPayloadIdentity(hand[handIndex], selected.option.card)){
    return {ok:false, reason:'Havano Citizen hand source changed before deployment'};
  }
  const [sourceCard] = hand.splice(handIndex, 1);
  const inst = cloneState(sourceCard);
  inst.owner = playerIndex;
  inst.currentFate = serverPlacedCardFate(sourceCard);
  if(!inst.iid) inst.iid = `${String(inst.id || '79')}:server:${Date.now()}`;
  inst._serverReactionDeployed = true;
  consumeServerHandPlacementModifiers(sourceCard, inst);
  state.board[z][r][c] = inst;
  applyAnickaStarlitPathPlacementBonus(state, inst, playerIndex, z);
  return {ok:true, inst, z, r, c};
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
  const owner = owners[key] ?? owners[z]?.[r - 3] ?? owners[z]?.[r];
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
  return ['05','09','16','18','20','24','25','26','28','31','32','33','37','42','44','47','49','50','52','53','54','58','59','60','62','63','64','65','68','69','70','71','72','73','74','75','76','78','79','80','91','94'].includes(id);
}

function isSupportedNonSupporterPlacementCard(card, options){
  if(isBasicPlacementCard(card, options)) return true;
  if(!card || String(card.type || '') === 'Supporter') return false;
  const meta = catalogCardFor(card, options);
  if(options?.requireCatalogForCards && !meta) return false;
  const id = String((meta || card).id || '');
  const effectiveCost = Math.max(0, (Number(card.cost ?? (meta || {}).cost ?? 0) || 0) + (Number(card._handCostDelta || 0) || 0));
  return ['01','02','03','04','06','07','08','10','11','13','15','17','19','21','22','23','29','30','34','38','39','41','43','48','51','55','57','66','77','83','90'].includes(id) && effectiveCost <= 0;
}

function isSupportedConsolidatingCard(card, options){
  if(isBasicPlacementCard(card, options)) return true;
  if(!card || !['01','02','03','04','06','07','08','10','11','12','13','14','15','17','19','21','22','23','27','29','30','34','35','36','38','39','40','41','43','45','46','48','51','55','56','57','61','66','67','77','83','90'].includes(String(card.id || ''))) return false;
  const meta = catalogCardFor(card, options);
  if(options?.requireCatalogForCards && !meta) return false;
  return ['01','02','03','04','06','07','08','10','11','12','13','14','15','17','19','21','22','23','27','29','30','34','35','36','38','39','40','41','43','45','46','48','51','55','56','57','61','66','67','77','83','90'].includes(String((meta || card).id || ''));
}

function applyWestCaribHandArrival(state, playerIndex, card){
  if(!state?._westCaribNext || !card || String(card.id || '') === '70' || String(card.type || '') === 'Supporter') return;
  const owner = isPlainObject(state._westCaribNext) ? Number(state._westCaribNext.owner) : playerIndex;
  if(owner !== playerIndex) return;
  card._wciBonus = true;
  card._handCostDelta = (Number(card._handCostDelta || 0) || 0) - 1;
  state._westCaribNext = false;
}

function serverPlacedCardFate(card, options){
  if(!card) return 0;
  const printed = Number(card.fate ?? 0) || 0;
  const live = Number.isFinite(Number(card.currentFate)) ? Number(card.currentFate) : printed;
  let placed = printed + (live - printed);
  if(!isEffectImmuneSource(card)){
    placed += Number(options?.bonusFate || 0) || 0;
    if(card._wciBonus) placed += 2;
  }
  return Math.max(0, placed);
}

function consumeServerHandPlacementModifiers(sourceCard, placedCard){
  [sourceCard, placedCard].forEach(card=>{
    if(!card) return;
    delete card._wciBonus;
    delete card._handCostDelta;
    delete card._handEffectModifiers;
  });
}

function serverShufflePlayerDeck(state, playerIndex, reason){
  const player = state?.players?.[playerIndex];
  if(!player || !Array.isArray(player.deck) || player.deck.length <= 1) return;
  const counter = Math.max(0, Number(state._serverRngCounter || 0) || 0);
  state._serverRngCounter = counter + 1;
  const seed = `${state.seed || state.matchSeed || state.roomSeed || 'fates'}:${reason || 'shuffle'}:${playerIndex}:${counter}`;
  shuffleInPlace(player.deck, makeSeededRng(seed));
}

function serverRandomIndex(state, playerIndex, length, reason){
  const max = Math.max(0, Number(length || 0) || 0);
  if(max <= 0) return -1;
  const counter = Math.max(0, Number(state._serverRngCounter || 0) || 0);
  state._serverRngCounter = counter + 1;
  const seed = `${state.seed || state.matchSeed || state.roomSeed || 'fates'}:${reason || 'random'}:${playerIndex}:${counter}`;
  return Math.floor(makeSeededRng(seed)() * max);
}

function noteSelvaSupportBoostForState(state, playerIndex, count, card){
  const added = Math.max(0, Number(count || 0) || 0);
  if(added <= 0) return;
  if(!Array.isArray(state._selvaSupportBoosts)) state._selvaSupportBoosts = [null, null];
  const prev = state._selvaSupportBoosts[playerIndex];
  const prevExtra = prev && Number(prev.turn) === Number(state.turn) ? Math.max(0, Number(prev.extraSupports || 0) || 0) : 0;
  state._selvaSupportBoosts[playerIndex] = {
    owner:playerIndex,
    turn:Number(state.turn || 0) || 0,
    extraSupports:prevExtra + added,
    sourceIid:card?.iid || null,
    sourceName:card?.name || 'Selva Islands Pirate'
  };
}

function applySelvaIslandsPirateHandArrival(state, playerIndex, card, options){
  if(!card || String(card.id || '') !== '74') return false;
  const currentTurn = Number(state.turn || 0) || 0;
  if(options?.openingHand || Number(state.currentPlayer) !== playerIndex || String(state.phase || '') !== 'main'){
    if(card._selvaOpeningQueued) return false;
    card._selvaOpeningQueued = true;
    if(!Array.isArray(state._pendingSelvaSupportBoost)) state._pendingSelvaSupportBoost = [0, 0];
    state._pendingSelvaSupportBoost[playerIndex] = (Number(state._pendingSelvaSupportBoost[playerIndex] || 0) || 0) + 1;
    return true;
  }
  if(Number(card._selvaArrivalTurn) === currentTurn) return false;
  if(isSupporterEffectSuppressedForState(state, card)) return false;
  card._selvaArrivalTurn = currentTurn;
  state.extraSupportsThisTurn = (Number(state.extraSupportsThisTurn || 0) || 0) + 1;
  noteSelvaSupportBoostForState(state, playerIndex, 1, card);
  return true;
}

function isDiscardRecoveryBlockedForState(state){
  return String(state?.landscape?.id || state?.landscapeId || state?._landscapeState?.id || '') === 'igb4';
}

function isLandscapeActiveForState(state, landscapeId){
  const active = String(state?.landscape?.id || state?.landscapeId || state?._landscapeState?.id || '');
  return !!landscapeId && active === String(landscapeId);
}

function collectWestCoastDreamingTargets(state){
  const entries = [];
  for(let z = 0; z < 3; z += 1){
    boardCardEntriesInZone(state, z, card=>card && !isFaceDownServerCard(card)).forEach(entry=>entries.push(entry));
  }
  return entries;
}

function armWestCoastDreamingBonus(state, playerIndex, drawnCard, afterDraw){
  if(!isLandscapeActiveForState(state, 'igb9')) return {ok:true, armed:false};
  const entries = collectWestCoastDreamingTargets(state);
  if(!entries.length) return {ok:true, armed:false};
  state._serverPendingZonePick = {
    kind:'westCoastDreamingBonus',
    playerIndex,
    maxCount:1,
    optional:true,
    drawnCardName:drawnCard?.name || 'a card',
    options:entries.map(entry=>({
      z:entry.z,
      r:entry.r,
      c:entry.c,
      card:{iid:entry.card?.iid || null, id:entry.card?.id || null}
    }))
  };
  if(afterDraw && typeof afterDraw === 'object') state._serverPendingZonePick.afterDraw = cloneState(afterDraw);
  return {ok:true, armed:true};
}

function cardMatchesPendingFilter(card, pending){
  if(!card) return false;
  if(pending.filterType && String(card.type || '') !== String(pending.filterType)) return false;
  if(pending.filterAff && String(card.aff || '') !== String(pending.filterAff)) return false;
  if(pending.filterRarity && String(card.rarity || '') !== String(pending.filterRarity)) return false;
  if(pending.excludeRarity && String(card.rarity || '') === String(pending.excludeRarity)) return false;
  return true;
}

function pendingCardPickCandidates(state, pending, playerIndex){
  const player = state?.players?.[playerIndex];
  if(!player) return [];
  const sources = String(pending.source || '').split('+').filter(Boolean);
  const candidates = [];
  sources.forEach(source=>{
    if(source === 'discard' && isDiscardRecoveryBlockedForState(state)) return;
    const pile = source === 'discard' ? player.discard : (source === 'deck' ? player.deck : null);
    if(!Array.isArray(pile)) return;
    pile.forEach((card, index)=>{
      if(cardMatchesPendingFilter(card, pending)) candidates.push({source, index, card});
    });
  });
  return candidates;
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

function setPendingChristopherErbsDrawChoice(state, playerIndex, erbsEntry, remainingDrawCount, afterDraw){
  state._serverPendingModalAction = {
    kind:'christopherErbsDrawChoice',
    promptId:`modal:christopherErbsDrawChoice:${Number(state.turn || 0) || 0}:${playerIndex}:${erbsEntry?.card?.iid || 'erbs'}:${erbsEntry?.z}:${erbsEntry?.r}:${erbsEntry?.c}`,
    playerIndex,
    sourceIid:erbsEntry?.card?.iid || null,
    z:erbsEntry?.z,
    r:erbsEntry?.r,
    c:erbsEntry?.c,
    remainingDrawCount:Math.max(1, Number(remainingDrawCount || 1) || 1)
  };
  if(afterDraw && typeof afterDraw === 'object') state._serverPendingModalAction.afterDraw = cloneState(afterDraw);
}

function drawCardsForState(state, playerIndex, count, options){
  const player = state?.players?.[playerIndex];
  if(!player || !Array.isArray(player.deck) || !Array.isArray(player.hand)) return {ok:false, reason:'draw state is invalid'};
  let drawn = 0;
  let skipNextErbsChoice = !!options?.skipNextErbsChoice;
  const afterDraw = options?.afterDraw && typeof options.afterDraw === 'object' ? options.afterDraw : null;
  let outsideDrawLandscapeCard = null;
  for(let i = 0; i < count; i += 1){
    if(!player.deck.length) break;
    const erbsActive = erbsActiveForState(state, playerIndex);
    if(!erbsActive && !skipNextErbsChoice){
      const readyErbs = readyChristopherErbsEntryForState(state, playerIndex);
      if(readyErbs){
        setPendingChristopherErbsDrawChoice(state, playerIndex, readyErbs, count - i, afterDraw);
        return {ok:true, drawn, pending:true};
      }
    }
    skipNextErbsChoice = false;
    const card = player.deck.shift();
    applyWestCaribHandArrival(state, playerIndex, card);
    player.hand.push(card);
    applySelvaIslandsPirateHandArrival(state, playerIndex, card, options);
    if(options?.drawPhase && Array.isArray(state._fortCalvinActive)){
      const watcher = state._fortCalvinActive.find(item=>item && Number(item.remaining || 0) > 0 && Number(item.owner) !== playerIndex);
      if(watcher){
        watcher.remaining = Math.max(0, (Number(watcher.remaining || 0) || 0) - 1);
        if(!isPlainObject(state._revealedCards)) state._revealedCards = {};
        if(card.iid) state._revealedCards[card.iid] = true;
        if(String(card.type || '') !== 'Supporter'){
          player.hand = player.hand.filter(item=>item && item.iid !== card.iid);
          player.deck.push(card);
        }
        state._fortCalvinActive = state._fortCalvinActive.filter(item=>item && Number(item.remaining || 0) > 0);
      }
    }
    if(erbsActive && String(card.id || '') !== '70'){
      card.currentFate = (Number(card.currentFate ?? card.fate ?? 0) || 0) + 4;
      setErbsActiveForState(state, playerIndex, false);
    }
    if(!options?.drawPhase && !options?.openingHand && !outsideDrawLandscapeCard){
      outsideDrawLandscapeCard = card;
    }
    drawn += 1;
  }
  if(outsideDrawLandscapeCard){
    const westCoast = armWestCoastDreamingBonus(state, playerIndex, outsideDrawLandscapeCard, afterDraw);
    if(!westCoast.ok) return westCoast;
    if(westCoast.armed) return {ok:true, drawn, pending:true};
  }
  return {ok:true, drawn};
}

function armPendingHandDiscard(state, playerIndex, source, maxCount, reason){
  const player = state?.players?.[playerIndex];
  if(!player || !Array.isArray(player.hand)) return {ok:false, reason:'hand discard state is invalid'};
  const count = Math.min(Math.max(0, Number(maxCount || 0) || 0), player.hand.length);
  if(count <= 0) return {ok:true, armed:false};
  state._serverPendingCardPick = {
    kind:'handDiscard',
    reason:reason || 'handDiscard',
    playerIndex,
    sourceIid:source?.iid || null,
    sourceId:source?.id || null,
    minCount:count,
    maxCount:count,
    zone:source?._serverPlacementZone
  };
  return {ok:true, armed:true};
}

function armPendingHandDiscardBoost(state, playerIndex, source, config){
  const player = state?.players?.[playerIndex];
  if(!player || !Array.isArray(player.hand)) return {ok:false, reason:'hand discard boost state is invalid'};
  const maxAvailable = player.hand.filter(card=>{
    if(!card) return false;
    if(config?.filterType && String(card.type || '') !== String(config.filterType)) return false;
    return true;
  }).length;
  const maxCount = Math.min(Math.max(0, Number(config?.maxCount ?? maxAvailable) || 0), maxAvailable);
  const minCount = Math.min(Math.max(0, Number(config?.minCount || 0) || 0), maxCount);
  if(maxCount <= 0) return {ok:true, armed:false};
  state._serverPendingCardPick = {
    kind:'handDiscardBoost',
    reason:config?.reason || 'handDiscardBoost',
    playerIndex,
    sourceIid:source?.iid || null,
    sourceId:source?.id || null,
    minCount,
    maxCount,
    filterType:config?.filterType || '',
    fatePerCard:Math.max(0, Number(config?.fatePerCard || 0) || 0),
    oncePerTurn:!!config?.oncePerTurn
  };
  return {ok:true, armed:true};
}

function armPendingCardToHand(state, playerIndex, source, config){
  const pending = {
    kind:'cardToHand',
    reason:config?.reason || 'cardToHand',
    playerIndex,
    sourceIid:source?.iid || null,
    sourceId:source?.id || null,
    source:config?.source || 'deck',
    filterType:config?.filterType || '',
    filterAff:config?.filterAff || '',
    excludeRarity:config?.excludeRarity || '',
    minCount:Math.max(0, Number(config?.minCount || 0) || 0),
    maxCount:Math.max(0, Number(config?.maxCount || 1) || 1),
    shuffleDeck:config?.shuffleDeck !== false
  };
  if(pending.maxCount < pending.minCount) pending.maxCount = pending.minCount;
  const candidates = pendingCardPickCandidates(state, pending, playerIndex);
  if(!candidates.length){
    if(pending.minCount > 0) return {ok:false, reason:`${pending.reason} has no valid cards to choose`};
    return {ok:true, armed:false};
  }
  state._serverPendingCardPick = pending;
  return {ok:true, armed:true};
}

function armPendingLinaFreeSet(state, playerIndex, source){
  const pending = {
    kind:'linaFreeSet',
    reason:'linaFreeSet',
    playerIndex,
    sourceIid:source?.iid || null,
    sourceId:source?.id || null,
    source:'deck+discard',
    filterAff:'reality',
    minCount:1,
    maxCount:1,
    shuffleDeck:false
  };
  const candidates = pendingCardPickCandidates(state, pending, playerIndex);
  if(!candidates.length) return {ok:true, armed:false};
  state._serverPendingCardPick = pending;
  if(source) source.effectUsedInitial = true;
  return {ok:true, armed:true};
}

function armCosmicGfNextStep(state, playerIndex, source, step){
  const sourceKey = step === 'discard' ? 'discard' : 'deck';
  const pending = armPendingCardToHand(state, playerIndex, source, {
    reason:step === 'discard' ? 'cosmicGfDiscard' : 'cosmicGfDeck',
    source:sourceKey,
    filterAff:'expanded_worlds',
    minCount:0,
    maxCount:1,
    shuffleDeck:step !== 'discard'
  });
  if(!pending.ok) return pending;
  if(pending.armed && step === 'deck') state._serverPendingCardPick.afterPick = {kind:'cosmicGfDiscard', sourceIid:source?.iid || null};
  return pending;
}

function completeAfterPickContinuation(state, playerIndex, afterPick){
  if(!afterPick || typeof afterPick !== 'object') return {ok:true};
  const kind = String(afterPick.kind || '');
  if(kind === 'cosmicGfDiscard'){
    const source = findBoardCardByIid(state, afterPick.sourceIid) || {id:'48', iid:afterPick.sourceIid};
    return armCosmicGfNextStep(state, playerIndex, source, 'discard');
  }
  if(kind === 'majaKaminskaSupportLimit'){
    state.majaEffectThisTurn = true;
    return {ok:true};
  }
  return {ok:false, reason:`server reducer is not implemented for after-pick continuation ${kind || '(unknown)'}`};
}

function completeAfterDrawContinuation(state, playerIndex, afterDraw){
  if(!afterDraw || typeof afterDraw !== 'object') return {ok:true};
  const kind = String(afterDraw.kind || '');
  if(kind === 'westGermanDiscard'){
    const source = findBoardCardByIid(state, afterDraw.sourceIid) || {id:'42', iid:afterDraw.sourceIid};
    return armPendingHandDiscard(state, playerIndex, source, 2, 'westGermanSoldier');
  }
  return {ok:false, reason:`server reducer is not implemented for after-draw continuation ${kind || '(unknown)'}`};
}

function applyAnickaStarlitPathPlacementBonus(state, inst, playerIndex, z){
  if(!inst || inst.faceDown) return 0;
  let applied = 0;
  boardCardEntriesInZone(state, z, card=>
    card &&
    String(card.id || '') === '02' &&
    Number(card.owner) === playerIndex &&
    String(card.iid || '') !== String(inst.iid || '') &&
    !card.faceDown
  ).forEach(entry=>{
    inst.currentFate = Math.max(0, (Number(inst.currentFate ?? inst.fate ?? 0) || 0) + 3);
    inst._starlitPathBonus = (Number(inst._starlitPathBonus || 0) || 0) + 3;
    inst._lastStarlitPathSource = entry.card.iid || null;
    applied += 1;
  });
  return applied;
}

function applyAnickaExtraSafeRow(state, inst, playerIndex, z){
  if(!Array.isArray(state.extraRows)) state.extraRows = [0, 0, 0];
  if(!Array.isArray(state.extraRowOwners)) state.extraRowOwners = [[], [], []];
  if(!Array.isArray(state.extraRowOwners[z])) state.extraRowOwners[z] = [];
  const nextRow = 3 + (Number(state.extraRows[z] || 0) || 0);
  state.extraRows[z] = (Number(state.extraRows[z] || 0) || 0) + 1;
  state.extraRowOwners[z][nextRow - 3] = playerIndex;
  ensureBoardCell(state, z, nextRow, 2);
  if(inst){
    inst._starlitPathZone = z;
    inst.effectUsedInitial = true;
  }
  return {ok:true, row:nextRow};
}

function serverLandscapeState(state){
  if(!state._landscapeState || typeof state._landscapeState !== 'object') state._landscapeState = {};
  const st = state._landscapeState;
  const activeId = String(state?.landscape?.id || state?.landscapeId || st.id || '');
  st.id = activeId;
  if(!Array.isArray(st.consolidations)) st.consolidations = [0, 0];
  if(!Array.isArray(st.zoneFateBonuses)) st.zoneFateBonuses = [[0, 0, 0], [0, 0, 0]];
  if(!Array.isArray(st.zoneFateBonuses[0])) st.zoneFateBonuses[0] = [0, 0, 0];
  if(!Array.isArray(st.zoneFateBonuses[1])) st.zoneFateBonuses[1] = [0, 0, 0];
  if(!st.resolvedTurns || typeof st.resolvedTurns !== 'object') st.resolvedTurns = {};
  return st;
}

function addServerLandscapeZoneFateBonus(state, playerIndex, z, amount){
  const st = serverLandscapeState(state);
  if(!Array.isArray(st.zoneFateBonuses[playerIndex])) st.zoneFateBonuses[playerIndex] = [0, 0, 0];
  st.zoneFateBonuses[playerIndex][z] = (Number(st.zoneFateBonuses[playerIndex][z] || 0) || 0) + (Number(amount || 0) || 0);
}

function addServerFullExtraSafeRowForPlayer(state, z, playerIndex){
  if(!Array.isArray(state.extraRows)) state.extraRows = [0, 0, 0];
  if(!Array.isArray(state.extraRowOwners)) state.extraRowOwners = [[], [], []];
  if(!Array.isArray(state.extraRowOwners[z])) state.extraRowOwners[z] = [];
  if(!Array.isArray(state.extraRowFullOwners)) state.extraRowFullOwners = [null, null, null];
  const row = 3 + (Number(state.extraRows[z] || 0) || 0);
  const hadExtraRowStructure = row > 3 || (Array.isArray(state.markSafeSquares) && state.markSafeSquares.some(item=>item && Number(item.z) === z));
  state.extraRows[z] = (Number(state.extraRows[z] || 0) || 0) + 1;
  ensureBoardCell(state, z, row, 2);
  state.extraRowOwners[z][row - 3] = playerIndex;
  state.extraRowFullOwners[z] = hadExtraRowStructure ? null : playerIndex;
  return {ok:true, row};
}

function armZimbabweHonorGuardFreeCopy(state, inst, playerIndex){
  if(state._zimbabweUsedThisTurn) return {ok:true, armed:false};
  const player = state?.players?.[playerIndex];
  if(!player || !Array.isArray(player.hand) || !Array.isArray(player.deck)) return {ok:false, reason:'Zimbabwean Honor Guard pile state is invalid'};
  const handIndex = player.hand.findIndex(card=>card && String(card.id || '') === '25');
  const deckIndex = player.deck.findIndex(card=>card && String(card.id || '') === '25');
  let card = null;
  let source = '';
  if(handIndex >= 0){
    card = player.hand.splice(handIndex, 1)[0];
    source = 'hand';
  }else if(deckIndex >= 0){
    card = player.deck.splice(deckIndex, 1)[0];
    source = 'deck';
  }
  if(!card) return {ok:true, armed:false};
  card._serverFreePlacement = true;
  card._zimbabweFreeCopy = true;
  player.hand.push(card);
  state._zimbabweUsedThisTurn = true;
  state.placing = true;
  state.selectedHandCard = player.hand.length - 1;
  state._serverFreePlacement = {
    kind:'zimbabweHonorGuard',
    playerIndex,
    cardIid:card.iid || null,
    source,
    sourceIid:inst?.iid || null
  };
  if(inst) inst.effectUsedInitial = true;
  return {ok:true, armed:true};
}

function collectBerkeleyHomelessMoveOptions(state, playerIndex){
  const options = [];
  const targetRow = playerIndex === 0 ? 0 : 2;
  const zones = Array.isArray(state?.board) ? state.board : [];
  for(let z = 0; z < zones.length; z += 1){
    const row = zones[z]?.[targetRow] || [];
    for(let c = 0; c < row.length; c += 1){
      if(row[c] !== null) continue;
      if(isBlockedCell(state, z, targetRow, c)) continue;
      options.push({z, r:targetRow, c});
    }
  }
  return options;
}

function setPendingBerkeleyHomelessMove(state, inst, playerIndex, z, r, c){
  if(String(inst?.id || '') !== '62') return;
  const options = collectBerkeleyHomelessMoveOptions(state, playerIndex);
  if(!options.length) return;
  state._serverPendingMove = {
    kind:'berkeleyHomelessMove',
    playerIndex,
    fromZ:z,
    fromR:r,
    fromC:c,
    movingIid:inst.iid || null,
    options
  };
}

function hasMariaSongTarget(state, playerIndex){
  const opponent = playerIndex === 0 ? 1 : 0;
  return Array.isArray(state?.board) && state.board.some(zone=>Array.isArray(zone) && zone.some(row=>Array.isArray(row) && row.some(cell=>
    cell && Number(cell.owner) === opponent
  )));
}

function setPendingMariaSongPick(state, inst, playerIndex, z, r, c){
  if(String(inst?.id || '') !== '61') return;
  if(!hasMariaSongTarget(state, playerIndex)) return;
  state._serverPendingZonePick = {
    kind:'mariaSongCopies',
    playerIndex,
    z,
    r,
    c,
    iid:inst.iid || null
  };
}

function applyRoboEnLaNocheWhenSet(state, playerIndex){
  const opponent = playerIndex === 0 ? 1 : 0;
  const oppHand = state.players?.[opponent]?.hand;
  const player = state.players?.[playerIndex];
  if(!Array.isArray(oppHand) || !player || !Array.isArray(player.hand) || oppHand.length <= 0) return {ok:true, stolen:false};
  const idx = serverRandomIndex(state, playerIndex, oppHand.length, 'roboEnLaNoche');
  if(idx < 0 || idx >= oppHand.length) return {ok:true, stolen:false};
  const stolen = oppHand.splice(idx, 1)[0];
  if(!stolen) return {ok:true, stolen:false};
  stolen._stolenByRobo = true;
  stolen._roboOrigOwner = opponent;
  applyWestCaribHandArrival(state, playerIndex, stolen);
  player.hand.push(stolen);
  applySelvaIslandsPirateHandArrival(state, playerIndex, stolen);
  return {ok:true, stolen:true};
}

function applyAlpineExpeditionaryWhenSet(state, inst, playerIndex, z){
  const zone = state?.board?.[z] || [];
  let totalFate = 0;
  const toDiscard = [];
  zone.forEach((row, r)=>{
    if(!Array.isArray(row)) return;
    row.forEach((cell, c)=>{
      if(!cell || Number(cell.owner) !== playerIndex || cell.iid === inst.iid) return;
      if(String(cell.type || '') !== 'Initiator' && String(cell.type || '') !== 'Improvisor') return;
      toDiscard.push({card:cell, r, c});
      totalFate += currentFate(cell);
    });
  });
  if(!Array.isArray(state.players?.[playerIndex]?.discard)) state.players[playerIndex].discard = [];
  toDiscard.forEach(item=>{
    state.players[playerIndex].discard.push(cloneState(item.card));
    if(state.board?.[z]?.[item.r]) state.board[z][item.r][item.c] = null;
  });
  if(totalFate > 0) inst.currentFate = (Number(inst.currentFate ?? inst.fate ?? 0) || 0) + totalFate;
  inst._canMoveOncePerTurn = true;
  return {ok:true};
}

function collectAlpineExpeditionaryMoveOptions(state, playerIndex){
  const options = [];
  const zones = Array.isArray(state?.board) ? state.board : [];
  for(let z = 0; z < zones.length; z += 1){
    const zone = zones[z] || [];
    for(let r = 0; r < zone.length; r += 1){
      const row = zone[r] || [];
      const owner = rowOwnerForState(state, z, r);
      if(owner !== -1 && owner !== playerIndex) continue;
      for(let c = 0; c < row.length; c += 1){
        if(row[c] !== null) continue;
        if(isBlockedCell(state, z, r, c)) continue;
        options.push({z, r, c});
      }
    }
  }
  return options;
}

function isPlayableExtraSafeCellForState(state, z, r, c, playerIndex){
  if(Number(r) < 3) return false;
  if(isMarkSafeSquareForState(state, z, r, c, playerIndex)) return true;
  const owners = Array.isArray(state?.extraRowOwners?.[z]) ? state.extraRowOwners[z] : [];
  const rowOwner = owners[Number(r) - 3];
  if(Number(rowOwner) === Number(playerIndex)) return true;
  const fullOwners = state?.extraRowFullOwners;
  if(Array.isArray(fullOwners) && Number(fullOwners[z]) === Number(playerIndex)) return true;
  return false;
}

function isLandscapeEventideMoveTargetForState(state, card, playerIndex, fromZ, fromR, fromC, z, r, c){
  if(Number(z) === Number(fromZ) && Number(r) === Number(fromR) && Number(c) === Number(fromC)) return false;
  if(!card || String(card.aff || '') !== 'eventide') return false;
  if(card.contestedOnly && Number(r) !== 1) return false;
  if(Number(r) >= 3){
    if(!isPlayableExtraSafeCellForState(state, z, r, c, playerIndex)) return false;
  }else{
    const owner = rowOwnerForState(state, z, r);
    if(owner !== -1 && owner !== playerIndex) return false;
  }
  if(isBlockedCell(state, z, r, c)) return false;
  return true;
}

function collectLandscapeEventideMoveOptions(state, card, playerIndex, fromZ, fromR, fromC){
  const options = [];
  const zones = Array.isArray(state?.board) ? state.board : [];
  for(let z = 0; z < zones.length; z += 1){
    const zone = zones[z] || [];
    for(let r = 0; r < zone.length; r += 1){
      const row = zone[r] || [];
      for(let c = 0; c < row.length; c += 1){
        if(row[c] !== null) continue;
        if(!isLandscapeEventideMoveTargetForState(state, card, playerIndex, fromZ, fromR, fromC, z, r, c)) continue;
        options.push({z, r, c});
      }
    }
  }
  return options;
}

function isVigilantesExpendCandidate(card, playerIndex, sourceIid){
  if(!card || typeof card !== 'object') return false;
  return Number(card.owner) === playerIndex &&
    String(card.type || '') === 'Supporter' &&
    String(card.iid || '') !== String(sourceIid || '') &&
    String(card.id || '') !== '76' &&
    card.noConsolidate !== true &&
    !isFaceDownServerCard(card);
}

function collectVigilantesExpendCandidates(state, playerIndex, sourceIid){
  const candidates = [];
  if(!Array.isArray(state?.board)) return candidates;
  state.board.forEach((zone, z)=>{
    if(!Array.isArray(zone)) return;
    zone.forEach((row, r)=>{
      if(!Array.isArray(row)) return;
      row.forEach((card, c)=>{
        if(!isVigilantesExpendCandidate(card, playerIndex, sourceIid)) return;
        candidates.push({z, r, c, card});
      });
    });
  });
  return candidates;
}

function setPendingJuanCarlosPick(state, inst, playerIndex, z, r, c){
  if(String(inst?.id || '') !== '39') return;
  const opponent = playerIndex === 0 ? 1 : 0;
  const hasTarget = Array.isArray(state?.board) && state.board.some(zone=>Array.isArray(zone) && zone.some(row=>Array.isArray(row) && row.some(cell=>
    cell && Number(cell.owner) === opponent && cell.cantBeMoved !== true
  )));
  if(!hasTarget) return;
  state._serverPendingZonePick = {
    kind:'juanCarlosSelectMoveTarget',
    playerIndex,
    z,
    r,
    c,
    iid:inst.iid || null
  };
}

function collectBreakfastBusserMoveOptions(state, playerIndex, destZ){
  const options = [];
  const zone = state?.board?.[destZ] || [];
  for(let r = 0; r < zone.length; r += 1){
    const row = zone[r] || [];
    const rowOwner = rowOwnerForState(state, destZ, r);
    if(rowOwner !== -1 && rowOwner !== playerIndex) continue;
    for(let c = 0; c < row.length; c += 1){
      if(row[c] !== null) continue;
      if(isBlockedCell(state, destZ, r, c)) continue;
      options.push({z:destZ, r, c});
    }
  }
  return options;
}

function isBusserMovementGrantCandidate(card, playerIndex){
  return !!(card &&
    Number(card.owner) === playerIndex &&
    !isFaceDownServerCard(card) &&
    card.cantBeMoved !== true &&
    card.immuneFlag !== true &&
    String(card.id || '') !== '76');
}

function isBusserAdjacentMoveTargetForState(state, playerIndex, fromZ, z, r, c){
  if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return false;
  if(Math.abs(Number(z) - Number(fromZ)) !== 1) return false;
  const ownerSafeRow = playerIndex === 0 ? 2 : 0;
  if(r !== 1 && r !== ownerSafeRow) return false;
  ensureBoardCell(state, z, r, c);
  if(state.board?.[z]?.[r]?.[c] !== null) return false;
  if(isBlockedCell(state, z, r, c)) return false;
  return true;
}

function collectBusserAdjacentMoveOptions(state, playerIndex, fromZ){
  const options = [];
  const zones = [Number(fromZ) - 1, Number(fromZ) + 1].filter(z=>z >= 0 && z <= 2);
  const rows = [1, playerIndex === 0 ? 2 : 0];
  zones.forEach(z=>{
    rows.forEach(r=>{
      const row = state?.board?.[z]?.[r] || [];
      for(let c = 0; c < row.length; c += 1){
        if(isBusserAdjacentMoveTargetForState(state, playerIndex, Number(fromZ), z, r, c)) options.push({z, r, c});
      }
    });
  });
  return options;
}

function setPendingBreakfastBusserPick(state, inst, playerIndex, z, r, c){
  if(String(inst?.id || '') !== '69') return;
  const hasTarget = boardCardEntriesInZone(state, z, card=>isBusserMovementGrantCandidate(card, playerIndex)).length > 0;
  if(!hasTarget) return;
  state._serverPendingZonePick = {
    kind:'breakfastBusserGrantMove',
    playerIndex,
    z,
    r,
    c,
    iid:inst.iid || null
  };
}

function collectJuanCarlosMoveOptions(state, playerIndex, destZ){
  const options = [];
  const zone = state?.board?.[destZ] || [];
  for(let r = 0; r < zone.length; r += 1){
    const row = zone[r] || [];
    for(let c = 0; c < row.length; c += 1){
      if(row[c] !== null) continue;
      if(isBlockedCell(state, destZ, r, c)) continue;
      if(rowOwnerForState(state, destZ, r) === playerIndex) continue;
      options.push({z:destZ, r, c});
    }
  }
  return options;
}

function collectMarkKemperSafeOptions(state, playerIndex){
  const options = [];
  for(let z = 0; z < 3; z += 1){
    const safeRow = 3 + (Number(state?.extraRows?.[z] || 0) || 0);
    const width = Math.max(3, state?.board?.[z]?.[2]?.length || state?.board?.[z]?.[0]?.length || 3);
    for(let c = 0; c < width; c += 1){
      if(isBlockedCell(state, z, safeRow, c)) continue;
      if(state?.board?.[z]?.[safeRow]?.[c] !== undefined && state.board[z][safeRow][c] !== null) continue;
      options.push({z, r:safeRow, c});
    }
  }
  return options;
}

function setPendingMarkKemperSafeSquare(state, inst, playerIndex, z, r, c){
  if(String(inst?.id || '') !== '43') return;
  const options = collectMarkKemperSafeOptions(state, playerIndex);
  if(!options.length) return;
  state._serverPendingMove = {
    kind:'markKemperSafeSquare',
    playerIndex,
    sourceZ:z,
    sourceR:r,
    sourceC:c,
    sourceIid:inst.iid || null,
    options
  };
}

function isMarkSafeSquareForState(state, z, r, c, playerIndex){
  const squares = Array.isArray(state?.markSafeSquares) ? state.markSafeSquares : [];
  return squares.some(square =>
    square &&
    Number(square.z) === Number(z) &&
    Number(square.r) === Number(r) &&
    Number(square.c) === Number(c) &&
    (playerIndex === null || playerIndex === undefined || Number(square.owner) === Number(playerIndex))
  );
}

function isZoeBlockTargetAllowedForState(state, z, r, c, owner){
  const opponent = owner === 0 ? 1 : 0;
  if(Number(r) === 1) return true;
  if(Number(r) >= 3) return isMarkSafeSquareForState(state, z, r, c, opponent);
  return rowOwnerForState(state, z, r) === opponent;
}

function collectZoeBlockOptions(state, owner, sourceZ){
  const options = [];
  const zone = state?.board?.[sourceZ] || [];
  for(let r = 0; r < zone.length; r += 1){
    const row = zone[r] || [];
    for(let c = 0; c < row.length; c += 1){
      if(!isZoeBlockTargetAllowedForState(state, sourceZ, r, c, owner)) continue;
      const existing = (Array.isArray(state.blockedCells) ? state.blockedCells : []).find(block =>
        block && Number(block.z) === Number(sourceZ) && Number(block.r) === r && Number(block.c) === c
      );
      if(existing && String(existing.type || '') === 'carolyn') continue;
      options.push({z:sourceZ, r, c});
    }
  }
  return options;
}

function setPendingZoeBlockSquare(state, inst, playerIndex, z, r, c){
  if(String(inst?.id || '') !== '04') return;
  const options = collectZoeBlockOptions(state, playerIndex, z);
  if(!options.length) return;
  state._serverPendingMove = {
    kind:'zoeBlockSquare',
    playerIndex,
    sourceZ:z,
    sourceR:r,
    sourceC:c,
    sourceIid:inst.iid || null,
    options
  };
}

function collectCarolynBlockOptions(state){
  const options = [];
  const zones = Array.isArray(state?.board) ? state.board : [];
  for(let z = 0; z < zones.length; z += 1){
    const zone = zones[z] || [];
    for(let r = 0; r < zone.length; r += 1){
      const row = zone[r] || [];
      for(let c = 0; c < row.length; c += 1){
        if(row[c] !== null) continue;
        if(isBlockedCell(state, z, r, c)) continue;
        options.push({z, r, c});
      }
    }
  }
  return options;
}

function setPendingCarolynBlockCell(state, inst, playerIndex, z, r, c){
  if(String(inst?.id || '') !== '17') return;
  const options = collectCarolynBlockOptions(state);
  if(!options.length) return;
  state._serverPendingMove = {
    kind:'carolynBlockCell',
    playerIndex,
    sourceZ:z,
    sourceR:r,
    sourceC:c,
    sourceIid:inst.iid || null,
    options
  };
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

function orthogonalAdjacentEntries(state, z, r, c){
  const entries = [];
  const zone = state?.board?.[z] || [];
  [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dr, dc])=>{
    const rr = r + dr;
    const cc = c + dc;
    const row = zone[rr];
    if(row && row[cc]) entries.push({card:row[cc], z, r:rr, c:cc});
  });
  return entries;
}

const SERVER_AFFILIATIONS = ['third_great_war', 'eventide', 'expanded_worlds', 'reality'];

function affiliationChoiceFromPayload(payload){
  if(!payload || typeof payload !== 'object') return null;
  const raw = payload.affiliation ?? payload.aff ?? payload.choice ?? payload.value ?? payload.action;
  if(raw !== undefined && raw !== null){
    const normalized = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
    if(SERVER_AFFILIATIONS.includes(normalized)) return normalized;
    if(normalized === 'third_great_war' || normalized === 'thirdgreatwar' || normalized === 'tgw') return 'third_great_war';
    if(normalized === 'expanded_worlds' || normalized === 'expandedworlds' || normalized === 'ew') return 'expanded_worlds';
    if(normalized === 'eventide') return 'eventide';
    if(normalized === 'reality') return 'reality';
  }
  const actionIndex = payload.actionIndex === undefined ? null : Number(payload.actionIndex);
  if(Number.isInteger(actionIndex) && actionIndex >= 0 && actionIndex < SERVER_AFFILIATIONS.length){
    return SERVER_AFFILIATIONS[actionIndex];
  }
  return null;
}

function setPendingAffiliationChoiceModal(state, inst, playerIndex, z, r, c){
  const id = String(inst?.id || '');
  if(!['51', '66', '77', '90'].includes(id)) return;
  state._serverPendingModalAction = {
    kind:'affiliationChoice',
    promptId:`modal:affiliationChoice:${Number(state.turn || 0) || 0}:${playerIndex}:${id}:${inst.iid || 'card'}:${z}:${r}:${c}`,
    cardId:id,
    playerIndex,
    z,
    r,
    c,
    iid:inst.iid || null
  };
}

function normalizeServerRiveraEffects(state){
  const raw = [];
  if(Array.isArray(state?._riveraBuffs)) state._riveraBuffs.forEach(item=>{ if(item) raw.push(Object.assign({}, item)); });
  if(state?._riveraActiveEffects && typeof state._riveraActiveEffects === 'object'){
    Object.keys(state._riveraActiveEffects).forEach(key=>{
      const item = state._riveraActiveEffects[key];
      if(item) raw.push(Object.assign({sourceIid:key}, item));
    });
  }
  const byKey = new Map();
  raw.forEach(item=>{
    const owner = Number(item.owner);
    const aff = String(item.aff || '');
    if(!Number.isInteger(owner) || owner < 0 || owner > 1 || !SERVER_AFFILIATIONS.includes(aff)) return;
    const turnsLeft = Number(item.turnsLeft ?? item.remainingTurns ?? 3);
    if(!Number.isFinite(turnsLeft) || turnsLeft <= 0) return;
    const sourceIid = item.sourceIid != null ? String(item.sourceIid) : `${owner}:${aff}`;
    const normalized = Object.assign({}, item, {
      sourceIid,
      owner,
      aff,
      turnsLeft,
      lastTickTurn:Number(item.lastTickTurn ?? item.startedTurn ?? item.startTurn ?? state?.turn ?? 1) || (Number(state?.turn) || 1)
    });
    const prev = byKey.get(sourceIid);
    if(!prev || Number(normalized.turnsLeft) >= Number(prev.turnsLeft)) byKey.set(sourceIid, normalized);
  });
  const buffs = Array.from(byKey.values());
  state._riveraBuffs = buffs;
  state._riveraActiveEffects = {};
  buffs.forEach((item, idx)=>{
    const key = item.sourceIid != null ? String(item.sourceIid) : String(idx);
    state._riveraActiveEffects[key] = item;
  });
  return buffs;
}

function startServerRiveraBuff(state, sourceCard, aff, owner){
  const ownerNum = Number(owner);
  if(!sourceCard || !SERVER_AFFILIATIONS.includes(aff) || !Number.isInteger(ownerNum)) return {ok:false, reason:'Rivera affiliation choice is invalid'};
  const sourceIid = sourceCard.iid != null ? String(sourceCard.iid) : `rivera_${ownerNum}_${Number(state?.turn || 1) || 1}`;
  const currentTurn = Number(state?.turn) || 1;
  normalizeServerRiveraEffects(state);
  state._riveraBuffs = (state._riveraBuffs || []).filter(item=>String(item?.sourceIid || '') !== sourceIid);
  const buff = {sourceIid, aff, owner:ownerNum, turnsLeft:3, lastTickTurn:currentTurn};
  state._riveraBuffs.push(buff);
  sourceCard.owner = ownerNum;
  sourceCard._riveraDeclaredAff = aff;
  sourceCard.riveraDeclaredAff = aff;
  sourceCard.declaredAff = aff;
  sourceCard._riveraBuffTurnsLeft = 3;
  sourceCard.riveraTurnsLeft = 3;
  sourceCard._riveraStartedTurn = currentTurn;
  sourceCard._riveraLastTickTurn = currentTurn;
  sourceCard._riveraOwner = ownerNum;
  sourceCard.effectUsedInitial = true;
  normalizeServerRiveraEffects(state);
  return {ok:true};
}

function applyServerRiveraBuffToPlacedCard(state, inst, owner){
  if(!inst || String(inst.id || '') === '51' || String(inst.type || '') === 'Supporter' || inst.noBonus) return false;
  const ownerNum = Number(owner);
  if(!Number.isInteger(ownerNum)) return false;
  const buffs = normalizeServerRiveraEffects(state).filter(item=>
    item &&
    Number(item.owner) === ownerNum &&
    Number(item.turnsLeft) > 0 &&
    String(item.aff || '') === String(inst.aff || '')
  );
  let applied = false;
  buffs.forEach(buff=>{
    if(!inst._riveraAppliedBuffs || typeof inst._riveraAppliedBuffs !== 'object') inst._riveraAppliedBuffs = {};
    const key = String(buff.sourceIid || buff.aff || 'rivera');
    if(inst._riveraAppliedBuffs[key]) return;
    inst.currentFate = Math.max(0, (Number(inst.currentFate ?? inst.fate ?? 0) || 0) + 3);
    inst._riveraAppliedBuffs[key] = true;
    inst._riveraFateBonus = (Number(inst._riveraFateBonus || 0) || 0) + 3;
    applied = true;
  });
  return applied;
}

function applyMarkMenzAffiliationChoice(state, sourceCard, playerIndex, z, aff){
  let changed = 0;
  const entries = boardCardEntriesInZone(state, z, card=>
    card &&
    Number(card.owner) === playerIndex &&
    String(card.iid || '') !== String(sourceCard?.iid || '') &&
    card.immuneFlag !== true &&
    String(card.id || '') !== '76' &&
    String(card.aff || '') !== aff
  );
  entries.forEach(entry=>{
    entry.card.aff = aff;
    entry.card._affChanged = aff;
    entry.card._affChangedAtTurn = Number(state.turn || 0) || 0;
    entry.card._lastAffEffectSource = sourceCard?.iid || null;
    entry.card._affChangedBy = 'mark_menz';
    changed += 1;
  });
  if(changed > 0 && sourceCard){
    sourceCard.currentFate = (Number(sourceCard.currentFate ?? sourceCard.fate ?? 0) || 0) + changed;
  }
  if(sourceCard) sourceCard.effectUsedInitial = true;
  return changed;
}

function applySebastyenJanowiczWhenSet(state, inst, playerIndex, z){
  let changed = 0;
  boardCardEntriesInZone(state, z, card=>
    card &&
    Number(card.owner) === playerIndex &&
    String(card.type || '') !== 'Supporter' &&
    !card.faceDown &&
    String(card.id || '') !== '76'
  ).forEach(entry=>{
    entry.card.currentFate = Math.max(0, (Number(entry.card.currentFate ?? entry.card.fate ?? 0) || 0) + 2);
    entry.card._sebastyenBuff = (Number(entry.card._sebastyenBuff || 0) || 0) + 2;
    entry.card._lastSebastyenSource = inst?.iid || null;
    changed += 1;
  });
  if(inst) inst.effectUsedInitial = true;
  return changed;
}

function setPendingMailDeliveryPick(state, inst, playerIndex, z, r, c){
  if(String(inst?.id || '') !== '94') return {ok:true};
  const pending = {
    kind:'mailDelivery',
    playerIndex,
    z,
    r,
    c,
    iid:inst.iid || null,
    source:'deck',
    filterRarity:'triangle',
    minCount:0,
    maxCount:1,
    reason:'mailDelivery'
  };
  if(!pendingCardPickCandidates(state, pending, playerIndex).length) return {ok:true, armed:false};
  state._serverPendingCardPick = pending;
  return {ok:true, armed:true};
}

function applyWojciechFishermanChoice(state, sourceCard, playerIndex, aff){
  const player = state?.players?.[playerIndex];
  if(!player || !Array.isArray(player.deck) || !Array.isArray(player.hand)) return {ok:false, reason:'Wojciech deck state is invalid'};
  const added = [];
  while(added.length < 2){
    const matchingIndexes = [];
    player.deck.forEach((card, index)=>{
      if(card && String(card.aff || '') === aff) matchingIndexes.push(index);
    });
    if(!matchingIndexes.length) break;
    const pickSlot = serverRandomIndex(state, playerIndex, matchingIndexes.length, `wojciechFisherman:${aff}:${added.length}`);
    const deckIndex = matchingIndexes[pickSlot];
    if(!Number.isInteger(deckIndex) || deckIndex < 0 || deckIndex >= player.deck.length) break;
    const [card] = player.deck.splice(deckIndex, 1);
    if(!card) break;
    applyWestCaribHandArrival(state, playerIndex, card);
    player.hand.push(card);
    applySelvaIslandsPirateHandArrival(state, playerIndex, card);
    added.push(card);
  }
  if(sourceCard){
    sourceCard._declaredAff = aff;
    sourceCard.declaredAff = aff;
    sourceCard.affDeclared = aff;
    sourceCard.effectUsedInitial = true;
  }
  return {ok:true, added};
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

function collectFrenchFusiliersCopyOptions(state, sourceIid){
  const options = [];
  if(!Array.isArray(state?.board)) return options;
  state.board.forEach((zone, z)=>{
    if(!Array.isArray(zone)) return;
    zone.forEach((row, r)=>{
      if(!Array.isArray(row)) return;
      row.forEach((card, c)=>{
        if(!card || String(card.iid || '') === String(sourceIid || '')) return;
        if(!canFrenchFusiliersCopyPassiveForState(card, state)) return;
        options.push({z, r, c, card:cloneState(card), copiedPassiveId:String(card.id || '')});
      });
    });
  });
  return options;
}

function collectLedgerKeepersCopyOptions(state, sourceIid){
  const options = [];
  if(!Array.isArray(state?.board)) return options;
  state.board.forEach((zone, z)=>{
    if(!Array.isArray(zone)) return;
    zone.forEach((row, r)=>{
      if(!Array.isArray(row)) return;
      row.forEach((card, c)=>{
        if(!canLedgerKeepersCopyWhenSetForState(card, sourceIid, state)) return;
        options.push({z, r, c, card:cloneState(card), copiedWhenSetId:String(card.id || '')});
      });
    });
  });
  return options;
}

function setPendingLedgerKeepersCopy(state, inst, playerIndex, z, r, c){
  if(String(inst?.id || '') !== '75') return;
  const options = collectLedgerKeepersCopyOptions(state, inst.iid || null);
  if(!options.length) return;
  state._serverPendingZonePick = {
    kind:'ledgerKeepersCopyWhenSet',
    playerIndex,
    z,
    r,
    c,
    iid:inst.iid || null,
    options
  };
}

function setPendingFrenchFusiliersCopy(state, inst, playerIndex, z, r, c){
  if(String(inst?.id || '') !== '37') return;
  const options = collectFrenchFusiliersCopyOptions(state, inst.iid || null);
  if(!options.length) return;
  state._serverPendingZonePick = {
    kind:'frenchFusiliersCopyPassive',
    playerIndex,
    z,
    r,
    c,
    iid:inst.iid || null,
    options
  };
}

function suppressSupportedWhenSetForState(state, inst){
  if(!inst || String(inst.type || '') !== 'Supporter') return false;
  if(!isSupporterEffectSuppressedForState(state, inst)) return false;
  inst._effectSuppressedOnSet = true;
  inst._serverSuppressedWhenSetTurn = Number(state?.turn || 0) || 0;
  inst.whenSetActivated = true;
  inst.effectUsedInitial = true;
  return true;
}

function applySupportedWhenSetState(state, inst, playerIndex, z, r, c){
  const id = String(inst?.id || '');
  if(suppressSupportedWhenSetForState(state, inst)) return {ok:true, suppressed:true};
  if(id === '02') applyAnickaExtraSafeRow(state, inst, playerIndex, z);
  if(id === '06'){
    const pending = armPendingCardToHand(state, playerIndex, inst, {
      reason:'jorgeAlvarez',
      source:'deck',
      excludeRarity:'star',
      minCount:0,
      maxCount:1,
      shuffleDeck:true
    });
    if(!pending.ok) return pending;
  }
  if(id === '07'){
    const pending = armPendingCardToHand(state, playerIndex, inst, {
      reason:'majaKaminska',
      source:'deck+discard',
      filterType:'Supporter',
      minCount:0,
      maxCount:2,
      shuffleDeck:true
    });
    if(!pending.ok) return pending;
    if(pending.armed) state._serverPendingCardPick.afterPick = {kind:'majaKaminskaSupportLimit', sourceIid:inst.iid || null};
    else state.majaEffectThisTurn = true;
  }
  if(id === '08'){
    const pending = armPendingLinaFreeSet(state, playerIndex, inst);
    if(pending && pending.ok === false) return pending;
  }
  if(id === '09' && inst.usesLeft === undefined) inst.usesLeft = 3;
  if(id === '13'){
    const pending = armPendingCardToHand(state, playerIndex, inst, {
      reason:'johnathanKirby',
      source:'deck',
      filterType:'Supporter',
      minCount:0,
      maxCount:2,
      shuffleDeck:true
    });
    if(!pending.ok) return pending;
  }
  if(id === '14') applyAlondraWhenSet(state, inst, playerIndex, z, r, c);
  if(id === '18'){
    state.oppSuppressedNextTurn = true;
    state.suppressTarget = playerIndex === 0 ? 1 : 0;
  }
  if(id === '22'){
    const adjacent = orthogonalAdjacentEntries(state, z, r, c).filter(entry=>entry.card && entry.card.iid !== inst.iid).length;
    if(adjacent > 0){
      state.extraSupportsThisTurn = (Number(state.extraSupportsThisTurn || 0) || 0) + adjacent;
      state._isaacPerezExtraSupports = {
        owner:playerIndex,
        turn:Number(state.turn || 0) || 0,
        sourceIid:inst.iid || null,
        extraSupports:adjacent
      };
    }
  }
  if(id === '04') setPendingZoeBlockSquare(state, inst, playerIndex, z, r, c);
  if(id === '17') setPendingCarolynBlockCell(state, inst, playerIndex, z, r, c);
  if(id === '20') applyShieldWallForZone(state, z);
  if(id === '21'){
    const pending = armPendingHandDiscardBoost(state, playerIndex, inst, {
      reason:'henryDong',
      minCount:0,
      maxCount:state.players?.[playerIndex]?.hand?.length || 0,
      fatePerCard:3
    });
    if(!pending.ok) return pending;
  }
  if(id === '25'){
    const pending = armZimbabweHonorGuardFreeCopy(state, inst, playerIndex);
    if(pending && pending.ok === false) return pending;
  }
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
  if(id === '29'){
    const pending = armPendingCardToHand(state, playerIndex, inst, {
      reason:'dylanKirby',
      source:'deck+discard',
      filterAff:'third_great_war',
      minCount:0,
      maxCount:2,
      shuffleDeck:true
    });
    if(!pending.ok) return pending;
  }
  if(id === '32'){
    const drawn = drawCardsForState(state, playerIndex, 1);
    if(!drawn.ok) return drawn;
  }
  if(id === '42'){
    inst._serverPlacementZone = z;
    const drawn = drawCardsForState(state, playerIndex, 2, {
      afterDraw:{kind:'westGermanDiscard', sourceIid:inst.iid || null}
    });
    if(!drawn.ok) return drawn;
    if(!drawn.pending){
      const discard = armPendingHandDiscard(state, playerIndex, inst, 2, 'westGermanSoldier');
      if(!discard.ok) return discard;
    }
  }
  if(id === '46') inst._philSetTurn = Number(state.turn || 0) || 0;
  if(id === '33') state._westCaribNext = {owner:playerIndex};
  if(id === '37') setPendingFrenchFusiliersCopy(state, inst, playerIndex, z, r, c);
  if(id === '75') setPendingLedgerKeepersCopy(state, inst, playerIndex, z, r, c);
  if(id === '38'){
    const pending = armPendingHandDiscardBoost(state, playerIndex, inst, {
      reason:'jakeSupporterDiscard',
      minCount:1,
      maxCount:1,
      filterType:'Supporter',
      fatePerCard:3,
      oncePerTurn:true
    });
    if(pending && pending.ok === false) return pending;
  }
  if(id === '48'){
    const pending = armCosmicGfNextStep(state, playerIndex, inst, 'deck');
    if(!pending.ok) return pending;
    if(!pending.armed){
      const discardPending = armCosmicGfNextStep(state, playerIndex, inst, 'discard');
      if(!discardPending.ok) return discardPending;
    }
  }
  if(id === '51' || id === '66' || id === '77' || id === '90') setPendingAffiliationChoiceModal(state, inst, playerIndex, z, r, c);
  if(id === '58'){
    const pending = armPendingCardToHand(state, playerIndex, inst, {
      reason:'crossroadsWorker',
      source:'discard',
      filterType:'Supporter',
      minCount:0,
      maxCount:1,
      shuffleDeck:false
    });
    if(!pending.ok) return pending;
  }
  if(id === '60'){
    const pending = armPendingCardToHand(state, playerIndex, inst, {
      reason:'ibStudent',
      source:'deck',
      filterType:'Supporter',
      minCount:0,
      maxCount:1,
      shuffleDeck:true
    });
    if(!pending.ok) return pending;
  }
  if(id === '61') setPendingMariaSongPick(state, inst, playerIndex, z, r, c);
  if(id === '62'){
    inst.noConsolidate = true;
    inst.berkeleyHomeless = true;
    setPendingBerkeleyHomelessMove(state, inst, playerIndex, z, r, c);
  }
  if(id === '65') inst.currentFate = 4;
  if(id === '68'){
    const pending = armPendingCardToHand(state, playerIndex, inst, {
      reason:'greatOakHighSchooler',
      source:'deck',
      filterType:'Coordinator',
      excludeRarity:'star',
      minCount:0,
      maxCount:1,
      shuffleDeck:true
    });
    if(!pending.ok) return pending;
  }
  if(id === '69') setPendingBreakfastBusserPick(state, inst, playerIndex, z, r, c);
  if(id === '71'){
    if(!Array.isArray(state._fortCalvinActive)) state._fortCalvinActive = [];
    state._fortCalvinActive.push({owner:playerIndex, remaining:3});
  }
  if(id === '72'){
    const stolen = applyRoboEnLaNocheWhenSet(state, playerIndex);
    if(stolen && stolen.ok === false) return stolen;
  }
  if(id === '73'){
    const alpine = applyAlpineExpeditionaryWhenSet(state, inst, playerIndex, z);
    if(alpine && alpine.ok === false) return alpine;
  }
  if(id === '39') setPendingJuanCarlosPick(state, inst, playerIndex, z, r, c);
  if(id === '43') setPendingMarkKemperSafeSquare(state, inst, playerIndex, z, r, c);
  if(id === '28' && !inst._plUsesLeft) inst._plUsesLeft = 2;
  if(id === '47') inst._greatOakBonus = true;
  if(id === '56') inst.usesLeft = 5;
  if(id === '67' && (inst.usesLeft === null || inst.usesLeft === undefined)) inst.usesLeft = inst._seculesUsed ? 0 : 1;
  if(id === '76'){
    inst.currentFate = 5;
    inst.immuneFlag = true;
    inst.noBonus = true;
    inst.noConsolidate = true;
  }
  if(id === '83') applySebastyenJanowiczWhenSet(state, inst, playerIndex, z);
  if(id === '91'){
    const opponent = playerIndex === 0 ? 1 : 0;
    if(!Array.isArray(state._snowyVillageUses)) state._snowyVillageUses = [0, 0];
    if(!Array.isArray(state._landscapeChangeLocks)) state._landscapeChangeLocks = [0, 0];
    state._snowyVillageUses[playerIndex] = (Number(state._snowyVillageUses[playerIndex] || 0) || 0) + 1;
    state._landscapeChangeLocks[opponent] = Math.max(Number(state._landscapeChangeLocks[opponent] || 0) || 0, 5);
  }
  if(id === '94'){
    const pending = setPendingMailDeliveryPick(state, inst, playerIndex, z, r, c);
    if(pending && pending.ok === false) return pending;
  }
  if(id === '40') inst.usesLeft = 2;
  return {ok:true};
}

function setPendingArtilleryModal(state, inst, playerIndex, z, r, c){
  if(String(inst?.id || '') !== '50') return;
  state._serverPendingModalAction = {
    kind:'artilleryDistance',
    promptId:`modal:artilleryDistance:${Number(state.turn || 0) || 0}:${playerIndex}:${inst.iid || 'artillery'}:${z}:${r}:${c}`,
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
  } else if(id === '03'){
    kind = 'howardFateDouble';
    hasTarget = boardCardEntriesInZone(state, z, card=>!(card.immuneFlag === true || String(card.id || '') === '76')).length > 0;
  } else if(id === '30'){
    kind = 'santiagoHalveFate';
    const opponent = playerIndex === 0 ? 1 : 0;
    hasTarget = boardCardEntriesInZone(state, z, card=>Number(card.owner) === opponent && !(card.immuneFlag === true || String(card.id || '') === '76')).length > 0;
  } else if(id === '80'){
    kind = 'apparitionDiscardDraw';
    hasTarget = boardCardEntriesInZone(state, z, card=>Number(card.owner) === playerIndex && String(card.type || '') !== 'Supporter' && card.iid !== inst.iid).length > 0;
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

function armPostWhenSetInteractionHooks(state, inst, playerIndex, z, r, c){
  setPendingArtilleryModal(state, inst, playerIndex, z, r, c);
  setPendingSameZoneWhenSetPick(state, inst, playerIndex, z, r, c);
  setPendingVigilantesPick(state, inst, playerIndex, z, r, c);
  setPendingWolfCreekPick(state, inst, playerIndex, z, r, c);
  setPendingBreakfastBusserPick(state, inst, playerIndex, z, r, c);
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
  if(isServerFreePlacementCard(state, card, playerIndex)) return '';
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

function serverFreePlacementKindForCard(state, card, playerIndex){
  if(!card) return '';
  const pending = state?._serverFreePlacement;
  if(!pending || Number(pending.playerIndex) !== playerIndex || !pending.cardIid) return '';
  if(String(pending.cardIid) !== String(card.iid || '')) return '';
  const kind = String(pending.kind || '');
  if(kind === 'linaFreeSet') return card._serverFreePlacement === true && card._linaFree === true ? kind : '';
  if(kind === 'zimbabweHonorGuard') return card._serverFreePlacement === true && card._zimbabweFreeCopy === true ? kind : '';
  if(kind === 'havanoReaction') return card._serverFreePlacement === true ? kind : '';
  return '';
}

function isServerFreePlacementCard(state, card, playerIndex){
  return !!serverFreePlacementKindForCard(state, card, playerIndex);
}

function isSupportedFreePlacementNonSupporterCard(card, options){
  if(!card || String(card.type || '') === 'Supporter') return false;
  if(card.xCost || (card.xFate && String(card.id || '') !== '35')) return false;
  return isSupportedConsolidatingCard(card, options);
}

function consumeServerFreePlacementForCard(state, sourceCard, placedCard, playerIndex){
  const kind = serverFreePlacementKindForCard(state, sourceCard, playerIndex);
  if(!kind) return '';
  [sourceCard, placedCard].forEach(card=>{
    if(!card) return;
    delete card._serverFreePlacement;
    delete card._zimbabweFreeCopy;
    delete card._linaFree;
    card._serverFreePlacementConsumed = kind;
  });
  state._serverFreePlacement = null;
  return kind;
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
        if(card.contestedOnly && r !== 1) continue;
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

function isSupporterAuraSuppressed(card, state){
  if(!card || String(card.type || '') !== 'Supporter') return false;
  if(state) return isSupporterEffectSuppressedForState(state, card);
  if(isEffectImmuneSource(card)) return false;
  return !!(card._lydiaSuppressed || card._reactionSuppressed);
}

function copiedFrenchPassiveId(card){
  return serverCopiedFrenchPassiveId(card);
}

function hasUnsupportedFrenchConsolidationPassive(state){
  if(!Array.isArray(state?.board)) return false;
  return state.board.some(zone=>Array.isArray(zone) && zone.some(row=>Array.isArray(row) && row.some(cell=>{
    const copied = copiedFrenchPassiveId(cell);
    return !!(copied && !FRENCH_FUSILIERS_SERVER_COPYABLE_PASSIVE_IDS.has(copied) && !isSupporterAuraSuppressed(cell, state));
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
        if(cell && serverCardActsAsPassive(cell, '53', state) && Number(cell.owner) === opp){
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
        if(cell && serverCardActsAsPassive(cell, '49', state) && Number(cell.owner) === playerIndex){
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
  if(['09','24','37','47','49','63','64','78','86'].includes(id)) return true;
  if(String(card.type || '') !== 'Supporter') return false;
  if(['24','76'].includes(id)) return false;
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
          state.fateModifiers[key] = (Number(state.fateModifiers[key] || 0) || 0) - 3;
        }
      });
    });
  });
}

function findUnusedChaparralAmbusherInZone(state, z, owner){
  const zone = state?.board?.[z] || [];
  for(let r = 0; r < zone.length; r += 1){
    const row = zone[r] || [];
    for(let c = 0; c < row.length; c += 1){
      const cell = row[c];
      if(
        cell &&
        String(cell.id || '') === '78' &&
        Number(cell.owner) === Number(owner) &&
        !cell._chaparralAmbushUsed &&
        !cell.faceDown &&
        !isSupporterEffectSuppressedForState(state, cell)
      ){
        return {card:cell, z, r, c};
      }
    }
  }
  return null;
}

function setPendingChaparralConsolidationChoice(state, playerIndex, con, targetIdx, chaparral){
  state._serverPendingModalAction = {
    kind:'chaparralSetMode',
    promptId:`modal:chaparralSetMode:${Number(state.turn || 0) || 0}:${playerIndex}:${con?.card?.iid || 'card'}:${chaparral?.card?.iid || 'chaparral'}:${targetIdx}`,
    playerIndex,
    targetIdx,
    cardIid:con?.card?.iid || null,
    sourceZ:chaparral?.z,
    sourceR:chaparral?.r,
    sourceC:chaparral?.c,
    sourceIid:chaparral?.card?.iid || null
  };
}

function chaparralFaceDownChoiceFromPayload(payload){
  const actionIndex = payload?.actionIndex === undefined ? null : Number(payload.actionIndex);
  if(actionIndex !== null && Number.isInteger(actionIndex)){
    if(actionIndex === 0) return false;
    if(actionIndex === 1) return true;
  }
  const raw = String(payload?.choice ?? payload?.mode ?? payload?.action ?? '').toLowerCase().trim();
  if(['facedown', 'face_down', 'set_face_down', 'hidden', 'ambush'].includes(raw)) return true;
  if(['normal', 'faceup', 'face_up', 'set_normal'].includes(raw)) return false;
  if(payload?.faceDown === true || payload?.useFaceDown === true) return true;
  if(payload?.faceDown === false || payload?.useFaceDown === false) return false;
  return null;
}

function finalizeBasicConsolidation(state, con, targetIdx, playerIndex, options, finalizeOptions){
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
  const chaparral = findUnusedChaparralAmbusherInZone(state, target.z, playerIndex);
  if(chaparral && !finalizeOptions?.skipChaparralPrompt){
    setPendingChaparralConsolidationChoice(state, playerIndex, con, targetIdx, chaparral);
    return {ok:true, pending:true};
  }
  const hand = state.players?.[playerIndex]?.hand || [];
  const handIndex = hand.findIndex(item=>item && con.card && item.iid === con.card.iid);
  if(handIndex < 0) return {ok:false, reason:'consolidating card is no longer in hand'};
  const card = hand[handIndex];
  if(!isSupportedConsolidatingCard(card, options)) return {ok:false, reason:'consolidating card requires a dedicated server reducer'};
  const inst = cloneState(card);
  inst.owner = playerIndex;
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
  else inst.currentFate = serverPlacedCardFate(card, {bonusFate});
  consumeServerHandPlacementModifiers(card, inst);
  applyServerRiveraBuffToPlacedCard(state, inst, playerIndex);
  if(finalizeOptions?.faceDown === true) inst.faceDown = true;
  ensureBoardCell(state, target.z, target.r, target.c);
  state.board[target.z][target.r][target.c] = inst;
  if(!inst.faceDown) applyAnickaStarlitPathPlacementBonus(state, inst, playerIndex, target.z);
  if(finalizeOptions?.faceDown === true && chaparral?.card){
    chaparral.card._chaparralAmbushUsed = true;
  }
  hand.splice(handIndex, 1);
  if(!inst.faceDown){
    const suppressedWhenSet = suppressSupportedWhenSetForState(state, inst);
    if(!suppressedWhenSet && armServerReactionWindowForWhenSet(state, inst, playerIndex, target.z, target.r, target.c)){
      state._consolidating = null;
      state.selectedHandCard = null;
      state.selectedBoardCard = null;
      return {ok:true};
    }
    if(!suppressedWhenSet){
      const whenSet = applySupportedWhenSetState(state, inst, playerIndex, target.z, target.r, target.c);
      if(whenSet && whenSet.ok === false) return whenSet;
      armPostWhenSetInteractionHooks(state, inst, playerIndex, target.z, target.r, target.c);
    }
  }
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
  const expectedPromptId = String(con.promptId || '');
  if(expectedPromptId && !payload.promptId) return {ok:false, reason:'CLICK_CELL consolidation promptId is required'};
  if(expectedPromptId && String(payload.promptId || '') !== expectedPromptId) return {ok:false, reason:'CLICK_CELL consolidation prompt mismatch'};
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
  const freePlacementKind = serverFreePlacementKindForCard(state, card, playerIndex);
  const freePlacement = !!freePlacementKind;
  if(String(card.type || '') === 'Supporter'){
    if(!isSupportedSupporterPlacementCard(card, options)) return {ok:false, reason:'CLICK_CELL card requires a dedicated server reducer'};
  } else if(freePlacement){
    if(!isSupportedFreePlacementNonSupporterCard(card, options)) return {ok:false, reason:'CLICK_CELL free-placement card requires a dedicated server reducer'};
  } else if(!isSupportedNonSupporterPlacementCard(card, options)) return {ok:false, reason:'CLICK_CELL card requires a dedicated server reducer'};
  const z = Number(payload.z), r = Number(payload.r), c = Number(payload.c);
  if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return {ok:false, reason:'CLICK_CELL target must be numeric'};
  if(z < 0 || z > 2 || r < 0 || r > 8 || c < 0 || c > 8) return {ok:false, reason:'CLICK_CELL target out of range'};
  ensureBoardCell(state, z, r, c);
  if(state.board[z][r][c] !== null) return {ok:false, reason:'CLICK_CELL target is occupied'};
  if(isBlockedCell(state, z, r, c)) return {ok:false, reason:'CLICK_CELL target is blocked'};
  if(isArtilleryLockedConsolidationZone(state, z, playerIndex)) return {ok:false, reason:'Artillery Distance locks this zone'};
  if(card.contestedOnly && r !== 1) return {ok:false, reason:'CLICK_CELL contested-only card must be placed in a contested row'};
  const rowOwner = rowOwnerForState(state, z, r);
  if(rowOwner !== -1 && rowOwner !== playerIndex) return {ok:false, reason:'CLICK_CELL target row is not playable by this player'};
  const chingachlookBlock = chingachlookPlacementBlockReason(state, card, z, playerIndex);
  if(chingachlookBlock) return {ok:false, reason:chingachlookBlock};
  const supporterErr = validateSupporterPlacement(state, card, playerIndex, z, r, c);
  if(supporterErr) return {ok:false, reason:supporterErr};
  const inst = cloneState(card);
  inst.owner = playerIndex;
  inst.currentFate = serverPlacedCardFate(card);
  if(!inst.iid) inst.iid = `${String(inst.id || 'card')}:server:${Date.now()}`;
  consumeServerHandPlacementModifiers(card, inst);
  applyServerRiveraBuffToPlacedCard(state, inst, playerIndex);
  state.board[z][r][c] = inst;
  applyAnickaStarlitPathPlacementBonus(state, inst, playerIndex, z);
  hand.splice(handIndex, 1);
  if(String(inst.type || '') === 'Supporter' && !freePlacement){
    state.supportsPlacedThisTurn = (Number(state.supportsPlacedThisTurn || 0) || 0) + 1;
    if(!Array.isArray(state.supportersSetP)) state.supportersSetP = [0, 0];
    state.supportersSetP[playerIndex] = (Number(state.supportersSetP[playerIndex] || 0) || 0) + 1;
    inst._supporterSetCounted = true;
    inst._wasSetAsSupporter = true;
    inst._hasBeenOnBoard = true;
    inst._supporterSetOwner = playerIndex;
  }
  if(freePlacement){
    consumeServerFreePlacementForCard(state, card, inst, playerIndex);
  }
  const suppressedWhenSet = suppressSupportedWhenSetForState(state, inst);
  if(!suppressedWhenSet && armServerReactionWindowForWhenSet(state, inst, playerIndex, z, r, c)){
    state.selectedHandCard = null;
    state.selectedBoardCard = null;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(!suppressedWhenSet){
    const whenSet = applySupportedWhenSetState(state, inst, playerIndex, z, r, c);
    if(whenSet && whenSet.ok === false) return whenSet;
    armPostWhenSetInteractionHooks(state, inst, playerIndex, z, r, c);
  }
  if(!state._serverFreePlacement){
    state.placing = false;
    state.selectedHandCard = null;
  }
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
  const expectedPromptId = String(pending.promptId || '');
  if(expectedPromptId && !payload.promptId) return {ok:false, reason:'CLICK_CELL pending move promptId is required'};
  if(expectedPromptId && String(payload.promptId || '') !== expectedPromptId) return {ok:false, reason:'CLICK_CELL pending move prompt mismatch'};
  const kind = String(pending.kind || '');
  if(kind === 'alpineExpeditionaryMove'){
    const z = Number(payload.z), r = Number(payload.r), c = Number(payload.c);
    if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return {ok:false, reason:'CLICK_CELL target must be numeric'};
    const valid = Array.isArray(pending.options) && pending.options.some(item=>Number(item.z) === z && Number(item.r) === r && Number(item.c) === c);
    if(!valid) return {ok:false, reason:'ALPINE Expeditionary target must be an open contested row or friendly safe row'};
    ensureBoardCell(state, z, r, c);
    if(state.board[z][r][c] !== null) return {ok:false, reason:'ALPINE Expeditionary target cell is occupied'};
    if(isBlockedCell(state, z, r, c)) return {ok:false, reason:'ALPINE Expeditionary target cell is blocked'};
    const owner = rowOwnerForState(state, z, r);
    if(owner !== -1 && owner !== playerIndex) return {ok:false, reason:'ALPINE Expeditionary target must be contested or friendly'};
    const moving = state.board?.[pending.fromZ]?.[pending.fromR]?.[pending.fromC] || null;
    if(!moving || String(moving.id || '') !== '73' || Number(moving.owner) !== playerIndex){
      return {ok:false, reason:'ALPINE Expeditionary source is no longer on board'};
    }
    if(pending.movingIid && moving.iid !== pending.movingIid) return {ok:false, reason:'ALPINE Expeditionary source mismatch'};
    if(moving._expMoved === true) return {ok:false, reason:'ALPINE Expeditionary already moved this turn'};
    state.board[pending.fromZ][pending.fromR][pending.fromC] = null;
    state.board[z][r][c] = moving;
    moving._expMoved = true;
    applyRozsiPassiveForMove(state, moving, z);
    state._serverPendingMove = null;
    state._expMoving = null;
    state.placing = false;
    state.selectedHandCard = null;
    state.selectedBoardCard = null;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(kind === 'berkeleyHomelessMove'){
    const z = Number(payload.z), r = Number(payload.r), c = Number(payload.c);
    if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return {ok:false, reason:'CLICK_CELL target must be numeric'};
    if(z < 0 || z > 2 || r < 0 || r > 8 || c < 0 || c > 8) return {ok:false, reason:'CLICK_CELL target out of range'};
    const valid = Array.isArray(pending.options) && pending.options.some(item=>Number(item.z) === z && Number(item.r) === r && Number(item.c) === c);
    if(!valid) return {ok:false, reason:'Berkeley Homeless target must be an opponent safe square'};
    ensureBoardCell(state, z, r, c);
    if(state.board[z][r][c] !== null) return {ok:false, reason:'Berkeley Homeless target cell is occupied'};
    if(isBlockedCell(state, z, r, c)) return {ok:false, reason:'Berkeley Homeless target cell is blocked'};
    const moving = state.board?.[pending.fromZ]?.[pending.fromR]?.[pending.fromC] || null;
    if(!moving || String(moving.id || '') !== '62' || Number(moving.owner) !== playerIndex){
      return {ok:false, reason:'Berkeley Homeless source is no longer on board'};
    }
    if(pending.movingIid && moving.iid !== pending.movingIid) return {ok:false, reason:'Berkeley Homeless source mismatch'};
    state.board[pending.fromZ][pending.fromR][pending.fromC] = null;
    state.board[z][r][c] = moving;
    state._serverPendingMove = null;
    state.placing = false;
    state.selectedHandCard = null;
    state.selectedBoardCard = null;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(kind === 'zoeBlockSquare'){
    const z = Number(payload.z), r = Number(payload.r), c = Number(payload.c);
    if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return {ok:false, reason:'CLICK_CELL target must be numeric'};
    const valid = Array.isArray(pending.options) && pending.options.some(item=>Number(item.z) === z && Number(item.r) === r && Number(item.c) === c);
    if(!valid) return {ok:false, reason:'Zoe target must be in her zone on a valid opponent consolidation square'};
    const source = state.board?.[pending.sourceZ]?.[pending.sourceR]?.[pending.sourceC] || null;
    if(!source || String(source.id || '') !== '04' || Number(source.owner) !== playerIndex){
      return {ok:false, reason:'Zoe source is no longer on board'};
    }
    if(pending.sourceIid && source.iid !== pending.sourceIid) return {ok:false, reason:'Zoe source mismatch'};
    if(!isZoeBlockTargetAllowedForState(state, z, r, c, playerIndex)){
      return {ok:false, reason:'Zoe target is no longer legal'};
    }
    const existing = (Array.isArray(state.blockedCells) ? state.blockedCells : []).find(block =>
      block && Number(block.z) === z && Number(block.r) === r && Number(block.c) === c
    );
    if(existing && String(existing.type || '') === 'carolyn') return {ok:false, reason:'Zoe cannot override a Carolyn lock'};
    if(!Array.isArray(state.blockedCells)) state.blockedCells = [];
    if(!existing){
      state.blockedCells.push({z, r, c, type:'zoe', owner:playerIndex, blockedPlayer:playerIndex === 0 ? 1 : 0});
    }
    state._serverPendingMove = null;
    state.placing = false;
    state.selectedHandCard = null;
    state.selectedBoardCard = null;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(kind === 'carolynBlockCell'){
    const z = Number(payload.z), r = Number(payload.r), c = Number(payload.c);
    if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return {ok:false, reason:'CLICK_CELL target must be numeric'};
    const valid = Array.isArray(pending.options) && pending.options.some(item=>Number(item.z) === z && Number(item.r) === r && Number(item.c) === c);
    if(!valid) return {ok:false, reason:'Carolyn target must be an open non-Carolyn-locked square'};
    ensureBoardCell(state, z, r, c);
    if(state.board[z][r][c] !== null) return {ok:false, reason:'Carolyn target cell is occupied'};
    if(isBlockedCell(state, z, r, c)) return {ok:false, reason:'Carolyn target is already locked'};
    const source = state.board?.[pending.sourceZ]?.[pending.sourceR]?.[pending.sourceC] || null;
    if(!source || String(source.id || '') !== '17' || Number(source.owner) !== playerIndex){
      return {ok:false, reason:'Carolyn source is no longer on board'};
    }
    if(pending.sourceIid && source.iid !== pending.sourceIid) return {ok:false, reason:'Carolyn source mismatch'};
    if(!Array.isArray(state.blockedCells)) state.blockedCells = [];
    const existing = state.blockedCells.find(block =>
      block && Number(block.z) === z && Number(block.r) === r && Number(block.c) === c
    );
    if(existing){
      existing.type = 'carolyn';
      existing.owner = playerIndex;
      existing.blockedPlayer = null;
    } else {
      state.blockedCells.push({z, r, c, type:'carolyn', owner:playerIndex, blockedPlayer:null});
    }
    state._serverPendingMove = null;
    state.placing = false;
    state.selectedHandCard = null;
    state.selectedBoardCard = null;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(kind === 'markKemperSafeSquare'){
    const z = Number(payload.z), r = Number(payload.r), c = Number(payload.c);
    if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return {ok:false, reason:'CLICK_CELL target must be numeric'};
    const valid = Array.isArray(pending.options) && pending.options.some(item=>Number(item.z) === z && Number(item.r) === r && Number(item.c) === c);
    if(!valid) return {ok:false, reason:'Mark Kemper target must be an available extra safe-square slot'};
    const source = state.board?.[pending.sourceZ]?.[pending.sourceR]?.[pending.sourceC] || null;
    if(!source || String(source.id || '') !== '43' || Number(source.owner) !== playerIndex){
      return {ok:false, reason:'Mark Kemper source is no longer on board'};
    }
    if(pending.sourceIid && source.iid !== pending.sourceIid) return {ok:false, reason:'Mark Kemper source mismatch'};
    if(isMarkSafeSquareForState(state, z, r, c, playerIndex)) return {ok:false, reason:'Mark Kemper safe square already exists'};
    if(!Array.isArray(state.extraRows)) state.extraRows = [0, 0, 0];
    if(!Array.isArray(state.extraRowOwners)) state.extraRowOwners = [[], [], []];
    if(!Array.isArray(state.extraRowOwners[z])) state.extraRowOwners[z] = [];
    const nextRow = 3 + (Number(state.extraRows[z] || 0) || 0);
    if(r !== nextRow) return {ok:false, reason:'Mark Kemper must add the next extra safe row'};
    state.extraRows[z] = (Number(state.extraRows[z] || 0) || 0) + 1;
    state.extraRowOwners[z][r - 3] = null;
    ensureBoardCell(state, z, r, c);
    if(!Array.isArray(state.markSafeSquares)) state.markSafeSquares = [];
    state.markSafeSquares.push({z, r, c, owner:playerIndex, source:'mark', sourceIid:source.iid || null});
    state._serverPendingMove = null;
    state.placing = false;
    state.selectedHandCard = null;
    state.selectedBoardCard = null;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(kind === 'juanCarlosMove'){
    const z = Number(payload.z), r = Number(payload.r), c = Number(payload.c);
    if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return {ok:false, reason:'CLICK_CELL target must be numeric'};
    const valid = Array.isArray(pending.options) && pending.options.some(item=>Number(item.z) === z && Number(item.r) === r && Number(item.c) === c);
    if(!valid) return {ok:false, reason:'Juan Carlos target must be an open square in his zone'};
    ensureBoardCell(state, z, r, c);
    if(state.board[z][r][c] !== null) return {ok:false, reason:'Juan Carlos target cell is occupied'};
    if(isBlockedCell(state, z, r, c)) return {ok:false, reason:'Juan Carlos target cell is blocked'};
    const source = state.board?.[pending.sourceZ]?.[pending.sourceR]?.[pending.sourceC] || null;
    if(!source || String(source.id || '') !== '39' || Number(source.owner) !== playerIndex){
      return {ok:false, reason:'Juan Carlos source is no longer on board'};
    }
    if(pending.sourceIid && source.iid !== pending.sourceIid) return {ok:false, reason:'Juan Carlos source mismatch'};
    const moving = state.board?.[pending.fromZ]?.[pending.fromR]?.[pending.fromC] || null;
    const opponent = playerIndex === 0 ? 1 : 0;
    if(!moving || Number(moving.owner) !== opponent || moving.cantBeMoved === true){
      return {ok:false, reason:'Juan Carlos moving card is no longer valid'};
    }
    if(pending.movingIid && moving.iid !== pending.movingIid) return {ok:false, reason:'Juan Carlos moving card mismatch'};
    state.board[pending.fromZ][pending.fromR][pending.fromC] = null;
    state.board[z][r][c] = moving;
    applyRozsiPassiveForMove(state, moving, z);
    state._serverPendingMove = null;
    state._juanCarlosMoving = null;
    state.placing = false;
    state.selectedHandCard = null;
    state.selectedBoardCard = null;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(kind === 'breakfastBusserMove'){
    const z = Number(payload.z), r = Number(payload.r), c = Number(payload.c);
    if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return {ok:false, reason:'CLICK_CELL target must be numeric'};
    const valid = Array.isArray(pending.options) && pending.options.some(item=>Number(item.z) === z && Number(item.r) === r && Number(item.c) === c);
    if(!valid) return {ok:false, reason:'Breakfast Republic Busser target must be an open square in its zone'};
    ensureBoardCell(state, z, r, c);
    if(state.board[z][r][c] !== null) return {ok:false, reason:'Breakfast Republic Busser target cell is occupied'};
    if(isBlockedCell(state, z, r, c)) return {ok:false, reason:'Breakfast Republic Busser target cell is blocked'};
    const source = state.board?.[pending.sourceZ]?.[pending.sourceR]?.[pending.sourceC] || null;
    if(!source || !pendingSourceActsAsId(source, pending, '69') || Number(source.owner) !== playerIndex){
      return {ok:false, reason:'Breakfast Republic Busser source is no longer on board'};
    }
    if(pending.sourceIid && source.iid !== pending.sourceIid) return {ok:false, reason:'Breakfast Republic Busser source mismatch'};
    const moving = state.board?.[pending.fromZ]?.[pending.fromR]?.[pending.fromC] || null;
    if(!moving || Number(moving.owner) !== playerIndex || String(moving.type || '') !== 'Supporter'){
      return {ok:false, reason:'Breakfast Republic Busser moving Supporter is no longer valid'};
    }
    if(pending.movingIid && moving.iid !== pending.movingIid) return {ok:false, reason:'Breakfast Republic Busser moving Supporter mismatch'};
    if(!isSupportedSupporterPlacementCard(moving, options)){
      return {ok:false, reason:'Breakfast Republic Busser moving Supporter requires a dedicated server reducer'};
    }
    state.board[pending.fromZ][pending.fromR][pending.fromC] = null;
    state.board[z][r][c] = moving;
    applyRozsiPassiveForMove(state, moving, z);
    source.effectUsedInitial = true;
    state._serverPendingMove = null;
    state.placing = false;
    state.selectedHandCard = null;
    state.selectedBoardCard = null;
    const whenSet = applySupportedWhenSetState(state, moving, playerIndex, z, r, c);
    if(whenSet && whenSet.ok === false) return whenSet;
    armPostWhenSetInteractionHooks(state, moving, playerIndex, z, r, c);
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(kind === 'busserAdjacentMove'){
    const z = Number(payload.z), r = Number(payload.r), c = Number(payload.c);
    if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return {ok:false, reason:'CLICK_CELL target must be numeric'};
    const valid = Array.isArray(pending.options) && pending.options.some(item=>Number(item.z) === z && Number(item.r) === r && Number(item.c) === c);
    if(!valid) return {ok:false, reason:'Busser movement target must be an adjacent-zone contested or safe square'};
    ensureBoardCell(state, z, r, c);
    if(state.board[z][r][c] !== null) return {ok:false, reason:'Busser movement target cell is occupied'};
    if(isBlockedCell(state, z, r, c)) return {ok:false, reason:'Busser movement target cell is blocked'};
    const moving = state.board?.[pending.fromZ]?.[pending.fromR]?.[pending.fromC] || null;
    if(!moving || Number(moving.owner) !== playerIndex){
      return {ok:false, reason:'Busser moving card is no longer valid'};
    }
    if(pending.movingIid && String(moving.iid || '') !== String(pending.movingIid)) return {ok:false, reason:'Busser moving card mismatch'};
    if(!isBusserMovementGrantCandidate(moving, playerIndex)) return {ok:false, reason:'Busser moving card cannot be moved'};
    if(Number(moving._busserMoves || 0) <= 0) return {ok:false, reason:'Busser moving card has no moves remaining'};
    if(moving._busserMovedThisTurn === true) return {ok:false, reason:'Busser moving card already moved this turn'};
    if(!isBusserAdjacentMoveTargetForState(state, playerIndex, Number(pending.fromZ), z, r, c)){
      return {ok:false, reason:'Busser movement target is no longer legal'};
    }
    state.board[pending.fromZ][pending.fromR][pending.fromC] = null;
    state.board[z][r][c] = moving;
    moving._busserMovedThisTurn = true;
    moving._busserMoves = Math.max(0, (Number(moving._busserMoves || 0) || 0) - 1);
    if(moving._busserMoves <= 0){
      moving._busserMoves = 0;
      moving._busserOwner = null;
      moving._busserSourceIid = null;
    }
    applyRozsiPassiveForMove(state, moving, z);
    state._serverPendingMove = null;
    state._busserMovingCard = null;
    state.placing = false;
    state.selectedHandCard = null;
    state.selectedBoardCard = null;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(kind === 'landscapeEventideMove'){
    const z = Number(payload.z), r = Number(payload.r), c = Number(payload.c);
    if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return {ok:false, reason:'CLICK_CELL target must be numeric'};
    const valid = Array.isArray(pending.options) && pending.options.some(item=>Number(item.z) === z && Number(item.r) === r && Number(item.c) === c);
    if(!valid) return {ok:false, reason:'Panacea movement target must be a highlighted open square'};
    ensureBoardCell(state, z, r, c);
    if(state.board[z][r][c] !== null) return {ok:false, reason:'Panacea movement target cell is occupied'};
    if(isBlockedCell(state, z, r, c)) return {ok:false, reason:'Panacea movement target cell is blocked'};
    if(!isLandscapeActiveForState(state, 'igb7')) return {ok:false, reason:'Panacea landscape is not active'};
    const moving = state.board?.[pending.fromZ]?.[pending.fromR]?.[pending.fromC] || null;
    if(!moving || Number(moving.owner) !== playerIndex || String(moving.aff || '') !== 'eventide'){
      return {ok:false, reason:'Panacea movement source is no longer valid'};
    }
    if(pending.movingIid && moving.iid !== pending.movingIid) return {ok:false, reason:'Panacea movement source mismatch'};
    if(moving.cantBeMoved === true) return {ok:false, reason:'Panacea movement source cannot be moved'};
    if(Number(moving._landscapeEventideMovedTurn) === Number(state.turn || 0)) return {ok:false, reason:'Panacea movement already used this turn'};
    if(!isLandscapeEventideMoveTargetForState(state, moving, playerIndex, pending.fromZ, pending.fromR, pending.fromC, z, r, c)){
      return {ok:false, reason:'Panacea movement target is no longer legal'};
    }
    state.board[pending.fromZ][pending.fromR][pending.fromC] = null;
    state.board[z][r][c] = moving;
    moving._landscapeEventideMovedTurn = Number(state.turn || 0) || 0;
    applyRozsiPassiveForMove(state, moving, z);
    state._serverPendingMove = null;
    state._landscapeMoving = null;
    state.placing = false;
    state.selectedHandCard = null;
    state.selectedBoardCard = null;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
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

function reduceDisconnectTimeout(room, msg){
  const payload = msg.payload || {};
  const state = cloneState(room.canonicalState);
  if(!state) return {ok:false, reason:'server canonical state is not initialized'};
  const loserIndex = Number(payload.playerIndex);
  if(!Number.isInteger(loserIndex) || loserIndex < 0 || loserIndex > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  if(String(state.status || state.phase || '').toLowerCase() === 'ended' || state.matchResult?.serverFinalized){
    return reducedResult(state, {matchResult:state.matchResult || null});
  }
  finalizeStateForDisconnect(state, loserIndex, Number(payload.endedAt || 0) || Date.now());
  return reducedResult(state, {matchResult:state.matchResult});
}

function reduceMatchResult(room, msg, options){
  const payload = msg.payload || {};
  const base = verifyBaseHash(room, payload, options);
  if(!base.ok) return base;
  const state = cloneState(room.canonicalState);
  if(!state) return {ok:false, reason:'server canonical state is not initialized'};
  if(hasTruthy(state._serverPendingModalAction) || hasTruthy(state._serverPendingZonePick) || hasTruthy(state._serverPendingMove) || hasTruthy(state._serverPendingCardPick)){
    return {ok:false, reason:'MATCH_RESULT has an unresolved server interaction'};
  }
  if(String(state.status || state.phase || '').toLowerCase() === 'ended' || state.matchResult?.serverFinalized){
    return reducedResult(state, {baseStateHash:base.baseStateHash, matchResult:state.matchResult || null});
  }
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  if(Number(state.currentPlayer) !== playerIndex) return {ok:false, reason:'MATCH_RESULT player does not have priority'};
  const maxTurns = Math.max(1, Number(state.maxTurns || 20) || 20);
  const turn = Math.max(0, Number(state.turn || 0) || 0);
  if(turn < maxTurns) return {ok:false, reason:'MATCH_RESULT is not available before maxTurns'};
  const result = computeServerMatchResult(state, Number(payload.endedAt || 0) || Date.now());
  if(payload.winnerIndex !== undefined && Number(payload.winnerIndex) !== Number(result.winnerIndex)){
    return {ok:false, reason:'MATCH_RESULT winner does not match server score'};
  }
  if(payload.isDraw !== undefined && !!payload.isDraw !== !!result.isDraw){
    return {ok:false, reason:'MATCH_RESULT draw flag does not match server score'};
  }
  finalizeStateForScoreResult(state, result);
  return reducedResult(state, {baseStateHash:base.baseStateHash, matchResult:result});
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
  if(fn === 'activateWineCountryGuerillaFromHand') return reduceActivateWineCountryGuerillaFromHand(room, msg, options);
  if(fn === 'activateSelvaIslandsPirateFromHand') return reduceActivateSelvaIslandsPirateFromHand(room, msg, options);
  if(fn === 'activateSantaAnnaProsperityFromHand') return reduceActivateSantaAnnaProsperityFromHand(room, msg, options);
  if(String(options.mode || '').toLowerCase() === 'strict') return {ok:false, reason:`server reducer is not implemented for HAND_ACTION ${fn || '(unknown)'}`};
  return validateProposedTransition(room, msg, options);
}

function reduceBoardAction(room, msg, options){
  const payload = msg.payload || {};
  const fn = String(payload.fn || '');
  if(fn === 'triggerCharacterEffect') return reduceTriggerCharacterEffect(room, msg, options);
  if(fn === 'activatePendingWhenSetEffect') return reduceActivatePendingWhenSetEffect(room, msg, options);
  if(fn === 'discardBoardCard') return reduceDiscardBoardCardAction(room, msg, options);
  if(fn === 'flipFaceDownBoardCard') return reduceFlipFaceDownBoardCardAction(room, msg, options);
  if(fn === 'activateVigilantes') return reduceActivateVigilantes(room, msg, options);
  if(fn === 'activateWolfCreek') return reduceActivateWolfCreek(room, msg, options);
  if(fn === 'activateExpeditionaryMove') return reduceActivateExpeditionaryMove(room, msg, options);
  if(fn === 'activateBusserMove') return reduceActivateBusserMove(room, msg, options);
  if(fn === 'activateLandscapeEventideMove') return reduceActivateLandscapeEventideMove(room, msg, options);
  if(String(options.mode || '').toLowerCase() === 'strict') return {ok:false, reason:`server reducer is not implemented for BOARD_ACTION ${fn || '(unknown)'}`};
  return validateProposedTransition(room, msg, options);
}

function boardActionSourceForState(state, payload, playerIndex, label){
  const z = Number(payload.z);
  const r = Number(payload.r);
  const c = Number(payload.c);
  if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return {error:`${label} source coordinates are invalid`};
  const source = state.board?.[z]?.[r]?.[c] || null;
  if(!source) return {error:`${label} source is no longer on board`};
  if(payload.card && !cardMatchesPayloadIdentity(source, payload.card)) return {error:`${label} source identity mismatch`};
  if(payload.cardIid && String(source.iid || '') !== String(payload.cardIid)) return {error:`${label} source identity mismatch`};
  if(payload.cardId && String(source.id || '') !== String(payload.cardId)) return {error:`${label} source id mismatch`};
  if(Number(source.owner) !== playerIndex) return {error:`${label} source must be controlled by player`};
  return {source, z, r, c};
}

function reduceTriggerCharacterEffect(room, msg, options){
  const payload = msg.payload || {};
  const base = verifyBaseHash(room, payload, options);
  if(!base.ok) return base;
  const state = cloneState(room.canonicalState);
  if(!state) return {ok:false, reason:'server canonical state is not initialized'};
  if(isComplexClickState(state)) return {ok:false, reason:'Character effect has an unsupported pending interaction'};
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  if(Number(state.currentPlayer) !== playerIndex) return {ok:false, reason:'Character effect player does not have priority'};
  if(String(state.phase || '') !== 'main') return {ok:false, reason:'Character effect requires main phase'};
  const src = boardActionSourceForState(state, payload, playerIndex, 'Character effect');
  if(src.error) return {ok:false, reason:src.error};
  const source = src.source;
  if(isFaceDownServerCard(source)) return {ok:false, reason:'Character effect source must be face up'};
  const id = String(source.id || '');
  if(id === '40'){
    if(Number(source.usesLeft || 0) <= 0) return {ok:false, reason:'Christopher Erbs has no uses remaining'};
    if(erbsActiveForState(state, playerIndex)) return {ok:false, reason:'Christopher Erbs is already armed'};
    if(!Array.isArray(state.erbsActive)) state.erbsActive = [false, false];
    source.usesLeft = Math.max(0, (Number(source.usesLeft || 0) || 0) - 1);
    source.effectUsedInitial = true;
    setErbsActiveForState(state, playerIndex, true);
    state.selectedBoardCard = null;
    state.placing = false;
    state.blockingCell = false;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(id === '21'){
    if(source.effectUsedInitial) return {ok:false, reason:'Henry Dong already activated'};
    const handCount = state.players?.[playerIndex]?.hand?.length || 0;
    const pending = armPendingHandDiscardBoost(state, playerIndex, source, {
      reason:'henryDong',
      minCount:0,
      maxCount:handCount,
      fatePerCard:3
    });
    if(pending && pending.ok === false) return pending;
    if(!pending.armed) return {ok:false, reason:'Henry Dong needs cards in hand'};
    state.selectedBoardCard = null;
    state.placing = false;
    state.blockingCell = false;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(id === '38'){
    if(source.effectUsedThisTurn) return {ok:false, reason:'Jake already activated this turn'};
    const pending = armPendingHandDiscardBoost(state, playerIndex, source, {
      reason:'jakeSupporterDiscard',
      minCount:1,
      maxCount:1,
      filterType:'Supporter',
      fatePerCard:3,
      oncePerTurn:true
    });
    if(pending && pending.ok === false) return pending;
    if(!pending.armed) return {ok:false, reason:'Jake needs a Supporter in hand'};
    state.selectedBoardCard = null;
    state.placing = false;
    state.blockingCell = false;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(String(options.mode || '').toLowerCase() === 'strict') return {ok:false, reason:`server reducer is not implemented for triggerCharacterEffect ${id || '(unknown)'}`};
  return validateProposedTransition(room, msg, options);
}

function reduceActivatePendingWhenSetEffect(room, msg, options){
  const payload = msg.payload || {};
  const base = verifyBaseHash(room, payload, options);
  if(!base.ok) return base;
  const state = cloneState(room.canonicalState);
  if(!state) return {ok:false, reason:'server canonical state is not initialized'};
  if(isComplexClickState(state)) return {ok:false, reason:'Pending when-set effect has an unsupported pending interaction'};
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  if(Number(state.currentPlayer) !== playerIndex) return {ok:false, reason:'Pending when-set effect player does not have priority'};
  if(String(state.phase || '') !== 'main') return {ok:false, reason:'Pending when-set effect requires main phase'};
  const src = boardActionSourceForState(state, payload, playerIndex, 'Pending when-set effect');
  if(src.error) return {ok:false, reason:src.error};
  if(isFaceDownServerCard(src.source)) return {ok:false, reason:'Pending when-set effect source must be face up'};
  const pending = src.source._pendingWhenSetEffect;
  if(!pending || typeof pending !== 'object') return {ok:false, reason:'Pending when-set effect source has no pending effect'};
  if(Number(pending.owner) !== playerIndex) return {ok:false, reason:'Pending when-set effect owner mismatch'};
  if(Number.isFinite(Number(pending.turnQueued)) && Number(pending.turnQueued) !== Number(state.turn || 0)){
    delete src.source._pendingWhenSetEffect;
    if(String(src.source.type || '') === 'Supporter') src.source.whenSetActivated = true;
    return {ok:false, reason:'Pending when-set effect has expired'};
  }
  if(Number.isFinite(Number(pending.z)) && (Number(pending.z) !== src.z || Number(pending.r) !== src.r || Number(pending.c) !== src.c)){
    return {ok:false, reason:'Pending when-set effect source location mismatch'};
  }
  const id = String(src.source.id || '');
  if(!SERVER_DEFERRED_WHEN_SET_IDS.has(id)) return {ok:false, reason:`server reducer is not implemented for deferred when-set ${id || '(unknown)'}`};
  delete src.source._pendingWhenSetEffect;
  src.source._effectNegatedByReaction = false;
  if(suppressSupportedWhenSetForState(state, src.source)){
    state.selectedBoardCard = null;
    state.placing = false;
    state.blockingCell = false;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(armServerReactionWindowForWhenSet(state, src.source, playerIndex, src.z, src.r, src.c)){
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  const whenSet = applySupportedWhenSetState(state, src.source, playerIndex, src.z, src.r, src.c);
  if(whenSet && whenSet.ok === false) return whenSet;
  armPostWhenSetInteractionHooks(state, src.source, playerIndex, src.z, src.r, src.c);
  state.selectedBoardCard = null;
  state.placing = false;
  state.blockingCell = false;
  return reducedResult(state, {baseStateHash:base.baseStateHash});
}

function manuallyDiscardBoardCardForState(state, playerIndex, z, r, c){
  const card = state.board?.[z]?.[r]?.[c] || null;
  if(!card) return {ok:false, reason:'Discard target is no longer on board'};
  if(String(card.id || '') === '76') return {ok:false, reason:'ALPINE Infantry cannot be discarded'};
  const owner = Number(card.owner);
  state.board[z][r][c] = null;
  if(String(card.id || '') === '50' && Number(state._artilleryLockTurnsLeft || 0) > 0){
    state._artilleryEffectBlockLifted = true;
  }
  if(String(card.id || '') === '56' && Array.isArray(state.board)){
    state.board.forEach(zone=>{
      if(!Array.isArray(zone)) return;
      zone.forEach(row=>{
        if(!Array.isArray(row)) return;
        row.forEach(cell=>{
          if(cell && cell._lydiaSuppressed) cell._lydiaSuppressed = false;
        });
      });
    });
  }
  if(String(card.id || '') === '70' && card.guerilla_transferred !== true){
    const holder = owner === 0 ? 1 : 0;
    if(!Array.isArray(state.players?.[holder]?.hand)) return {ok:false, reason:'Wine Country Guerilla holder hand is invalid'};
    card.guerilla_transferred = true;
    card.guerilla_turnsLeft = 5;
    card.guerilla_owner = owner;
    state.players[holder].hand.push(card);
  }else if(card._stolenByRobo){
    const originalOwner = Number(card._roboOrigOwner);
    if(!Number.isInteger(originalOwner) || originalOwner < 0 || originalOwner > 1) return {ok:false, reason:'Robo stolen card original owner is invalid'};
    if(!Array.isArray(state.players?.[originalOwner]?.deck)) return {ok:false, reason:'Robo stolen card original deck is invalid'};
    card._stolenByRobo = false;
    state.players[originalOwner].deck.push(card);
    serverShufflePlayerDeck(state, originalOwner, `manualDiscardRobo:${card.iid || card.id || 'card'}`);
  }else{
    if(!Array.isArray(state.players?.[owner]?.discard)) return {ok:false, reason:'Discard owner pile is invalid'};
    state.players[owner].discard.push(card);
  }
  return {ok:true, card};
}

function reduceDiscardBoardCardAction(room, msg, options){
  const payload = msg.payload || {};
  const base = verifyBaseHash(room, payload, options);
  if(!base.ok) return base;
  const state = cloneState(room.canonicalState);
  if(!state) return {ok:false, reason:'server canonical state is not initialized'};
  if(isComplexClickState(state)) return {ok:false, reason:'Discard board card has an unsupported pending interaction'};
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  if(Number(state.currentPlayer) !== playerIndex) return {ok:false, reason:'Discard board card player does not have priority'};
  if(String(state.phase || '') !== 'main') return {ok:false, reason:'Discard board card requires main phase'};
  const src = boardActionSourceForState(state, payload, playerIndex, 'Discard board card');
  if(src.error) return {ok:false, reason:src.error};
  if(src.source.berkeleyHomeless && Number(src.source.owner) !== playerIndex){
    return {ok:false, reason:'Berkeley Homeless opponent discard requires a dedicated server picker'};
  }
  const discarded = manuallyDiscardBoardCardForState(state, playerIndex, src.z, src.r, src.c);
  if(!discarded.ok) return discarded;
  state.selectedBoardCard = null;
  state.placing = false;
  state.blockingCell = false;
  return reducedResult(state, {baseStateHash:base.baseStateHash});
}

function reduceFlipFaceDownBoardCardAction(room, msg, options){
  const payload = msg.payload || {};
  const base = verifyBaseHash(room, payload, options);
  if(!base.ok) return base;
  const state = cloneState(room.canonicalState);
  if(!state) return {ok:false, reason:'server canonical state is not initialized'};
  if(isComplexClickState(state)) return {ok:false, reason:'Flip face-down card has an unsupported pending interaction'};
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  if(Number(state.currentPlayer) !== playerIndex) return {ok:false, reason:'Flip face-down card player does not have priority'};
  if(String(state.phase || '') !== 'main') return {ok:false, reason:'Flip face-down card requires main phase'};
  const src = boardActionSourceForState(state, payload, playerIndex, 'Flip face-down card');
  if(src.error) return {ok:false, reason:src.error};
  if(!isFaceDownServerCard(src.source)) return {ok:false, reason:'Flip face-down card source is already face up'};
  src.source.faceDown = false;
  src.source.isFaceDown = false;
  src.source._faceDown = false;
  if(Array.isArray(state.shieldWallZones) && state.shieldWallZones.includes(src.z)) src.source.cantBeMoved = true;
  const whenSet = applySupportedWhenSetState(state, src.source, playerIndex, src.z, src.r, src.c);
  if(whenSet && whenSet.ok === false) return whenSet;
  armPostWhenSetInteractionHooks(state, src.source, playerIndex, src.z, src.r, src.c);
  state.selectedBoardCard = null;
  state.placing = false;
  state.blockingCell = false;
  return reducedResult(state, {baseStateHash:base.baseStateHash});
}

function reduceActivateVigilantes(room, msg, options){
  const payload = msg.payload || {};
  const base = verifyBaseHash(room, payload, options);
  if(!base.ok) return base;
  const state = cloneState(room.canonicalState);
  if(!state) return {ok:false, reason:'server canonical state is not initialized'};
  if(hasTruthy(state._serverPendingModalAction) || hasTruthy(state._serverPendingZonePick) || hasTruthy(state._serverPendingMove) || hasTruthy(state._serverPendingCardPick)){
    return {ok:false, reason:'Vigilantes has an unresolved server interaction'};
  }
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  if(Number(state.currentPlayer) !== playerIndex) return {ok:false, reason:'Vigilantes player does not have priority'};
  if(String(state.phase || '') !== 'main') return {ok:false, reason:'Vigilantes requires main phase'};
  const src = boardActionSourceForState(state, payload, playerIndex, 'Vigilantes');
  if(src.error) return {ok:false, reason:src.error};
  const source = src.source;
  const z = src.z, r = src.r, c = src.c;
  if(String(source.id || '') !== '52' || isFaceDownServerCard(source)){
    return {ok:false, reason:'Vigilantes source is no longer on board'};
  }
  if(isSupporterEffectSuppressedForState(state, source)) return {ok:false, reason:'Vigilantes source is suppressed'};
  if(source.vigilanteUsed === true) return {ok:false, reason:'Vigilantes already activated this turn'};
  const candidates = collectVigilantesExpendCandidates(state, playerIndex, source.iid || null);
  if(candidates.length < 3) return {ok:false, reason:'Vigilantes needs 3 expendable friendly Supporters'};
  const hasTarget = boardCardEntriesInZone(state, z, card=>card && String(card.id || '') !== '76' && card.immuneFlag !== true).length > 0;
  if(!hasTarget) return {ok:false, reason:'Vigilantes has no valid same-zone target'};
  state._serverPendingCardPick = {
    kind:'vigilantesExpendSupporters',
    reason:'vigilantesExpendSupporters',
    playerIndex,
    sourceZ:z,
    sourceR:r,
    sourceC:c,
    sourceIid:source.iid || null,
    minCount:3,
    maxCount:3
  };
  state.selectedBoardCard = null;
  state.placing = false;
  return reducedResult(state, {baseStateHash:base.baseStateHash});
}

function reduceActivateExpeditionaryMove(room, msg, options){
  const payload = msg.payload || {};
  const base = verifyBaseHash(room, payload, options);
  if(!base.ok) return base;
  const state = cloneState(room.canonicalState);
  if(!state) return {ok:false, reason:'server canonical state is not initialized'};
  if(hasTruthy(state._serverPendingModalAction) || hasTruthy(state._serverPendingZonePick) || hasTruthy(state._serverPendingMove) || hasTruthy(state._serverPendingCardPick)){
    return {ok:false, reason:'ALPINE Expeditionary has an unresolved server interaction'};
  }
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  if(Number(state.currentPlayer) !== playerIndex) return {ok:false, reason:'ALPINE Expeditionary player does not have priority'};
  if(String(state.phase || '') !== 'main') return {ok:false, reason:'ALPINE Expeditionary requires main phase'};
  const src = boardActionSourceForState(state, payload, playerIndex, 'ALPINE Expeditionary');
  if(src.error) return {ok:false, reason:src.error};
  const source = src.source;
  const z = src.z, r = src.r, c = src.c;
  if(String(source.id || '') !== '73' || isFaceDownServerCard(source)){
    return {ok:false, reason:'ALPINE Expeditionary source is no longer on board'};
  }
  if(isSupporterEffectSuppressedForState(state, source)) return {ok:false, reason:'ALPINE Expeditionary source is suppressed'};
  if(source._canMoveOncePerTurn !== true) return {ok:false, reason:'ALPINE Expeditionary is not armed to move'};
  if(source._expMoved === true) return {ok:false, reason:'ALPINE Expeditionary already moved this turn'};
  const moveOptions = collectAlpineExpeditionaryMoveOptions(state, playerIndex);
  if(!moveOptions.length) return {ok:false, reason:'No open squares available for ALPINE Expeditionary'};
  state._serverPendingMove = {
    kind:'alpineExpeditionaryMove',
    playerIndex,
    fromZ:z,
    fromR:r,
    fromC:c,
    movingIid:source.iid || null,
    options:moveOptions
  };
  state._expMoving = {
    card:cloneState(source),
    fromZ:z,
    fromR:r,
    fromC:c,
    options:moveOptions
  };
  state.selectedBoardCard = null;
  state.placing = false;
  return reducedResult(state, {baseStateHash:base.baseStateHash});
}

function reduceActivateBusserMove(room, msg, options){
  const payload = msg.payload || {};
  const base = verifyBaseHash(room, payload, options);
  if(!base.ok) return base;
  const state = cloneState(room.canonicalState);
  if(!state) return {ok:false, reason:'server canonical state is not initialized'};
  if(hasTruthy(state._serverPendingModalAction) || hasTruthy(state._serverPendingZonePick) || hasTruthy(state._serverPendingMove) || hasTruthy(state._serverPendingCardPick)){
    return {ok:false, reason:'Busser movement has an unresolved server interaction'};
  }
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  if(Number(state.currentPlayer) !== playerIndex) return {ok:false, reason:'Busser movement player does not have priority'};
  if(String(state.phase || '') !== 'main') return {ok:false, reason:'Busser movement requires main phase'};
  const src = boardActionSourceForState(state, payload, playerIndex, 'Busser movement');
  if(src.error) return {ok:false, reason:src.error};
  const source = src.source;
  if(payload.cardIid && String(source.iid || '') !== String(payload.cardIid)) return {ok:false, reason:'Busser movement source identity mismatch'};
  if(payload.cardId && String(source.id || '') !== String(payload.cardId)) return {ok:false, reason:'Busser movement source id mismatch'};
  if(isSupporterEffectSuppressedForState(state, source)) return {ok:false, reason:'Busser movement source is suppressed'};
  if(!isBusserMovementGrantCandidate(source, playerIndex)) return {ok:false, reason:'Busser movement source cannot be moved'};
  if(Number(source._busserOwner ?? playerIndex) !== playerIndex) return {ok:false, reason:'Busser movement source belongs to another player'};
  if(Number(source._busserMoves || 0) <= 0) return {ok:false, reason:'Busser movement source has no moves remaining'};
  if(source._busserMovedThisTurn === true) return {ok:false, reason:'Busser movement source already moved this turn'};
  const moveOptions = collectBusserAdjacentMoveOptions(state, playerIndex, src.z);
  if(!moveOptions.length) return {ok:false, reason:'No adjacent Busser movement squares available'};
  state._serverPendingMove = {
    kind:'busserAdjacentMove',
    playerIndex,
    fromZ:src.z,
    fromR:src.r,
    fromC:src.c,
    movingIid:source.iid || null,
    options:moveOptions
  };
  state._busserMovingCard = {
    card:cloneState(source),
    fromZ:src.z,
    fromR:src.r,
    fromC:src.c,
    options:moveOptions
  };
  state.placing = false;
  state.selectedHandCard = null;
  state.selectedBoardCard = {z:src.z, r:src.r, c:src.c, card:cloneState(source)};
  return reducedResult(state, {baseStateHash:base.baseStateHash});
}

function reduceActivateLandscapeEventideMove(room, msg, options){
  const payload = msg.payload || {};
  const base = verifyBaseHash(room, payload, options);
  if(!base.ok) return base;
  const state = cloneState(room.canonicalState);
  if(!state) return {ok:false, reason:'server canonical state is not initialized'};
  if(hasTruthy(state._serverPendingModalAction) || hasTruthy(state._serverPendingZonePick) || hasTruthy(state._serverPendingMove) || hasTruthy(state._serverPendingCardPick)){
    return {ok:false, reason:'Panacea movement has an unresolved server interaction'};
  }
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  if(Number(state.currentPlayer) !== playerIndex) return {ok:false, reason:'Panacea movement player does not have priority'};
  if(String(state.phase || '') !== 'main') return {ok:false, reason:'Panacea movement requires main phase'};
  if(!isLandscapeActiveForState(state, 'igb7')) return {ok:false, reason:'Panacea landscape is not active'};
  const src = boardActionSourceForState(state, payload, playerIndex, 'Panacea movement');
  if(src.error) return {ok:false, reason:src.error};
  const source = src.source;
  if(isFaceDownServerCard(source)) return {ok:false, reason:'Panacea movement source must be face up'};
  if(String(source.aff || '') !== 'eventide') return {ok:false, reason:'Panacea movement source must be Eventide'};
  if(source.cantBeMoved === true) return {ok:false, reason:'Panacea movement source cannot be moved'};
  if(Number(source._landscapeEventideMovedTurn) === Number(state.turn || 0)) return {ok:false, reason:'Panacea movement already used this turn'};
  const moveOptions = collectLandscapeEventideMoveOptions(state, source, playerIndex, src.z, src.r, src.c);
  if(!moveOptions.length) return {ok:false, reason:'No open squares available for Panacea movement'};
  state._serverPendingMove = {
    kind:'landscapeEventideMove',
    playerIndex,
    fromZ:src.z,
    fromR:src.r,
    fromC:src.c,
    movingIid:source.iid || null,
    options:moveOptions
  };
  state._landscapeMoving = {
    card:cloneState(source),
    fromZ:src.z,
    fromR:src.r,
    fromC:src.c,
    options:moveOptions
  };
  state.selectedBoardCard = null;
  state.placing = false;
  return reducedResult(state, {baseStateHash:base.baseStateHash});
}

function reduceActivateWolfCreek(room, msg, options){
  const payload = msg.payload || {};
  const base = verifyBaseHash(room, payload, options);
  if(!base.ok) return base;
  const state = cloneState(room.canonicalState);
  if(!state) return {ok:false, reason:'server canonical state is not initialized'};
  if(hasTruthy(state._serverPendingModalAction) || hasTruthy(state._serverPendingZonePick) || hasTruthy(state._serverPendingMove) || hasTruthy(state._serverPendingCardPick)){
    return {ok:false, reason:'Wolf Creek has an unresolved server interaction'};
  }
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  if(Number(state.currentPlayer) !== playerIndex) return {ok:false, reason:'Wolf Creek player does not have priority'};
  if(String(state.phase || '') !== 'main') return {ok:false, reason:'Wolf Creek requires main phase'};
  const src = boardActionSourceForState(state, payload, playerIndex, 'Wolf Creek');
  if(src.error) return {ok:false, reason:src.error};
  const source = src.source;
  const z = src.z, r = src.r, c = src.c;
  if(String(source.id || '') !== '54' || isFaceDownServerCard(source)){
    return {ok:false, reason:'Wolf Creek source is no longer on board'};
  }
  if(isSupporterEffectSuppressedForState(state, source)) return {ok:false, reason:'Wolf Creek source is suppressed'};
  if(source.wolfCreekUsed === true) return {ok:false, reason:'Wolf Creek already moved a card this turn'};
  if(!hasWolfCreekMoveCandidateInZone(state, playerIndex, z, source.iid || null)){
    return {ok:false, reason:'Wolf Creek has no friendly character to move in this zone'};
  }
  const moveOptions = collectWolfCreekMoveOptions(state, playerIndex);
  if(!moveOptions.length) return {ok:false, reason:'No open squares available for Wolf Creek'};
  setPendingWolfCreekPick(state, source, playerIndex, z, r, c);
  if(!state._serverPendingZonePick || String(state._serverPendingZonePick.kind || '') !== 'wolfCreekSelectMoveTarget'){
    return {ok:false, reason:'Wolf Creek could not arm movement picker'};
  }
  state.selectedBoardCard = null;
  state.placing = false;
  return reducedResult(state, {baseStateHash:base.baseStateHash});
}

function reduceActivateWineCountryGuerillaFromHand(room, msg, options){
  const payload = msg.payload || {};
  const base = verifyBaseHash(room, payload, options);
  if(!base.ok) return base;
  const state = cloneState(room.canonicalState);
  if(!state) return {ok:false, reason:'server canonical state is not initialized'};
  if(isComplexClickState(state)) return {ok:false, reason:'Wine Country Guerilla has an unsupported pending interaction'};
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  if(Number(state.currentPlayer) !== playerIndex) return {ok:false, reason:'Wine Country Guerilla player does not have priority'};
  if(String(state.phase || '') !== 'main') return {ok:false, reason:'Wine Country Guerilla requires main phase'};
  const selected = selectedHandCardForState(state, payload, playerIndex);
  if(selected.error) return {ok:false, reason:selected.error};
  const card = selected.card;
  if(String(card.id || '') !== '70') return {ok:false, reason:'HAND_ACTION selected card is not Wine Country Guerilla'};
  if(card.guerilla_transferred === true) return {ok:false, reason:'Wine Country Guerilla is already infiltrating'};
  const opponent = playerIndex === 0 ? 1 : 0;
  const opponentPlayer = state.players?.[opponent];
  if(!opponentPlayer || !Array.isArray(opponentPlayer.hand)) return {ok:false, reason:'opponent hand state is invalid'};
  const [moving] = selected.hand.splice(selected.handIndex, 1);
  moving.guerilla_transferred = true;
  moving.guerilla_turnsLeft = 5;
  moving.guerilla_owner = playerIndex;
  opponentPlayer.hand.push(moving);
  state.selectedHandCard = null;
  state.selectedBoardCard = null;
  state.placing = false;
  state.blockingCell = false;
  return reducedResult(state, {baseStateHash:base.baseStateHash});
}

function reduceActivateSelvaIslandsPirateFromHand(room, msg, options){
  const payload = msg.payload || {};
  const base = verifyBaseHash(room, payload, options);
  if(!base.ok) return base;
  const state = cloneState(room.canonicalState);
  if(!state) return {ok:false, reason:'server canonical state is not initialized'};
  if(isComplexClickState(state)) return {ok:false, reason:'Selva Islands Pirate has an unsupported pending interaction'};
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  if(Number(state.currentPlayer) !== playerIndex) return {ok:false, reason:'Selva Islands Pirate player does not have priority'};
  if(String(state.phase || '') !== 'main') return {ok:false, reason:'Selva Islands Pirate requires main phase'};
  const selected = selectedHandCardForState(state, payload, playerIndex);
  if(selected.error) return {ok:false, reason:selected.error};
  const card = selected.card;
  if(String(card.id || '') !== '74') return {ok:false, reason:'HAND_ACTION selected card is not Selva Islands Pirate'};
  const [discarded] = selected.hand.splice(selected.handIndex, 1);
  if(!discarded) return {ok:false, reason:'Selva Islands Pirate discard card was not found'};
  if(!Array.isArray(state.players?.[playerIndex]?.discard)) state.players[playerIndex].discard = [];
  state.players[playerIndex].discard.push(discarded);
  state.maxSupportsPerTurn = Math.max(3, Number(state.maxSupportsPerTurn || 0) || 0);
  state.selectedHandCard = null;
  state.selectedBoardCard = null;
  state.placing = false;
  state.blockingCell = false;
  return reducedResult(state, {baseStateHash:base.baseStateHash});
}

function reduceActivateSantaAnnaProsperityFromHand(room, msg, options){
  const payload = msg.payload || {};
  const base = verifyBaseHash(room, payload, options);
  if(!base.ok) return base;
  const state = cloneState(room.canonicalState);
  if(!state) return {ok:false, reason:'server canonical state is not initialized'};
  if(isComplexClickState(state)) return {ok:false, reason:'Santa Anna has an unsupported pending interaction'};
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  if(Number(state.currentPlayer) !== playerIndex) return {ok:false, reason:'Santa Anna player does not have priority'};
  if(String(state.phase || '') !== 'main') return {ok:false, reason:'Santa Anna requires main phase'};
  if(!isLandscapeActiveForState(state, 'igb16')) return {ok:false, reason:'Santa Anna landscape is not active'};
  const selected = selectedHandCardForState(state, payload, playerIndex);
  if(selected.error) return {ok:false, reason:selected.error};
  const targetPayload = payload.target || {};
  const z = Number(targetPayload.z);
  const r = Number(targetPayload.r);
  const c = Number(targetPayload.c);
  if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return {ok:false, reason:'Santa Anna target coordinates are invalid'};
  const target = state.board?.[z]?.[r]?.[c] || null;
  if(!target) return {ok:false, reason:'Santa Anna target was not found'};
  const targetIdentity = cardIdentityFromPayload(targetPayload);
  if(hasCardIdentityPayload(targetIdentity) && !cardMatchesPayloadIdentity(target, targetIdentity)){
    return {ok:false, reason:'Santa Anna target identity mismatch'};
  }
  if(Number(target.owner) !== playerIndex) return {ok:false, reason:'Santa Anna target must be controlled by player'};
  if(isFaceDownServerCard(target)) return {ok:false, reason:'Santa Anna target must be face up'};
  const [discarded] = selected.hand.splice(selected.handIndex, 1);
  if(!discarded) return {ok:false, reason:'Santa Anna discard card was not found'};
  if(!Array.isArray(state.players?.[playerIndex]?.discard)) state.players[playerIndex].discard = [];
  state.players[playerIndex].discard.push(discarded);
  target.currentFate = numericFate(target) + 2;
  state.selectedHandCard = null;
  state.selectedBoardCard = null;
  state.placing = false;
  state.blockingCell = false;
  return reducedResult(state, {baseStateHash:base.baseStateHash});
}

function applyPendingAffiliationChoice(state, pending, playerIndex, payload){
  const aff = affiliationChoiceFromPayload(payload);
  if(!aff) return {ok:false, reason:'affiliation choice is invalid'};
  const live = state.board?.[pending.z]?.[pending.r]?.[pending.c] || null;
  const cardId = String(pending.cardId || live?.id || '');
  if(!live || String(live.id || '') !== cardId || Number(live.owner) !== playerIndex){
    return {ok:false, reason:'affiliation choice source is no longer on board'};
  }
  if(pending.iid && String(live.iid || '') !== String(pending.iid)){
    return {ok:false, reason:'affiliation choice source mismatch'};
  }
  if(cardId === '77'){
    live._declaredAff = aff;
    live.declaredAff = aff;
    live.affDeclared = aff;
    live.effectUsedInitial = true;
  } else if(cardId === '51'){
    const started = startServerRiveraBuff(state, live, aff, playerIndex);
    if(started && started.ok === false) return started;
  } else if(cardId === '66'){
    live.declaredAff = aff;
    live._declaredAff = aff;
    applyMarkMenzAffiliationChoice(state, live, playerIndex, Number(pending.z), aff);
  } else if(cardId === '90'){
    live.declaredAff = aff;
    live._declaredAff = aff;
    live.affDeclared = aff;
    const applied = applyWojciechFishermanChoice(state, live, playerIndex, aff);
    if(applied && applied.ok === false) return applied;
  } else {
    return {ok:false, reason:`server reducer is not implemented for affiliation source ${cardId || '(unknown)'}`};
  }
  state._serverPendingModalAction = null;
  return {ok:true};
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
  const expectedPromptId = String(pending.promptId || '');
  if(expectedPromptId && !payload.promptId) return {ok:false, reason:'MODAL_ACTION promptId is required'};
  if(expectedPromptId && String(payload.promptId || '') !== expectedPromptId) return {ok:false, reason:'MODAL_ACTION prompt mismatch'};
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
    const drawn = drawCardsForState(state, playerIndex, remainingDrawCount, {
      skipNextErbsChoice:!activate,
      afterDraw:pending.afterDraw || null
    });
    if(!drawn.ok) return drawn;
    if(!drawn.pending && pending.afterDraw){
      const continued = completeAfterDrawContinuation(state, playerIndex, pending.afterDraw);
      if(!continued.ok) return continued;
    }
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(kind === 'affiliationChoice'){
    const applied = applyPendingAffiliationChoice(state, pending, playerIndex, payload);
    if(applied && applied.ok === false) return applied;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(kind === 'chaparralSetMode'){
    const faceDown = chaparralFaceDownChoiceFromPayload(payload);
    if(faceDown === null) return {ok:false, reason:'Chaparral Hoplite set mode choice is invalid'};
    const con = state._consolidating;
    if(!con || typeof con !== 'object') return {ok:false, reason:'Chaparral consolidation state is missing'};
    if(pending.cardIid && String(con.card?.iid || '') !== String(pending.cardIid)){
      return {ok:false, reason:'Chaparral consolidating card mismatch'};
    }
    const source = state.board?.[pending.sourceZ]?.[pending.sourceR]?.[pending.sourceC] || null;
    if(!source || String(source.id || '') !== '78' || Number(source.owner) !== playerIndex || source.faceDown){
      return {ok:false, reason:'Chaparral Hoplite source is no longer ready'};
    }
    if(pending.sourceIid && String(source.iid || '') !== String(pending.sourceIid)){
      return {ok:false, reason:'Chaparral Hoplite source mismatch'};
    }
    const targetIdx = Number(pending.targetIdx);
    if(!Number.isInteger(targetIdx)) return {ok:false, reason:'Chaparral consolidation target is invalid'};
    state._serverPendingModalAction = null;
    const done = finalizeBasicConsolidation(state, con, targetIdx, playerIndex, options, {
      skipChaparralPrompt:true,
      faceDown
    });
    if(!done.ok) return done;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(kind !== 'artilleryDistance') return {ok:false, reason:`server reducer is not implemented for MODAL_ACTION ${kind || '(unknown)'}`};
  const actionIndex = Number(payload.actionIndex);
  if(!Number.isInteger(actionIndex) || actionIndex < 0 || actionIndex > 2) return {ok:false, reason:'Artillery Distance zone choice is invalid'};
  const loc = pendingSourceLocation(pending);
  const live = state.board?.[loc.z]?.[loc.r]?.[loc.c] || null;
  if(!live || !pendingSourceActsAsId(live, pending, '50') || Number(live.owner) !== playerIndex) return {ok:false, reason:'Artillery Distance source is no longer on board'};
  if(pending.iid && live.iid !== pending.iid) return {ok:false, reason:'Artillery Distance source mismatch'};
  state._artilleryLockedZone = actionIndex;
  state._artilleryLockOwner = playerIndex === 0 ? 1 : 0;
  state._artilleryLockTurnsLeft = 2;
  state._artilleryEffectBlockLifted = false;
  state._serverPendingModalAction = null;
  return reducedResult(state, {baseStateHash:base.baseStateHash});
}

function reducePickAffiliationAction(room, msg, options){
  const payload = msg.payload || {};
  const base = verifyBaseHash(room, payload, options);
  if(!base.ok) return base;
  const state = cloneState(room.canonicalState);
  if(!state) return {ok:false, reason:'server canonical state is not initialized'};
  const pending = state._serverPendingModalAction;
  if(!pending || typeof pending !== 'object') return {ok:false, reason:'PICK_AFFILIATION has no server pending modal'};
  if(String(pending.kind || '') !== 'affiliationChoice') return {ok:false, reason:`PICK_AFFILIATION cannot resolve ${pending.kind || '(unknown)'}`};
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  if(Number(pending.playerIndex) !== playerIndex) return {ok:false, reason:'PICK_AFFILIATION player does not own pending picker'};
  if(Number(state.currentPlayer) !== playerIndex) return {ok:false, reason:'PICK_AFFILIATION player does not have priority'};
  const expectedPromptId = String(pending.promptId || '');
  if(expectedPromptId && !payload.promptId) return {ok:false, reason:'PICK_AFFILIATION promptId is required'};
  if(expectedPromptId && String(payload.promptId || '') !== expectedPromptId) return {ok:false, reason:'PICK_AFFILIATION prompt mismatch'};
  const applied = applyPendingAffiliationChoice(state, pending, playerIndex, payload);
  if(applied && applied.ok === false) return applied;
  return reducedResult(state, {baseStateHash:base.baseStateHash});
}

function reducePickLandscapeZoneAction(room, msg, options){
  const payload = msg.payload || {};
  const base = verifyBaseHash(room, payload, options);
  if(!base.ok) return base;
  const state = cloneState(room.canonicalState);
  if(!state) return {ok:false, reason:'server canonical state is not initialized'};
  if(hasTruthy(state._serverPendingModalAction) || hasTruthy(state._serverPendingZonePick) || hasTruthy(state._serverPendingMove) || hasTruthy(state._serverPendingCardPick) || hasTruthy(state._serverPendingReaction)){
    return {ok:false, reason:'PICK_LANDSCAPE_ZONE has an unresolved server interaction'};
  }
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  const chooserIndex = payload.chooserIndex === undefined ? playerIndex : Number(payload.chooserIndex);
  if(!Number.isInteger(chooserIndex) || chooserIndex < 0 || chooserIndex > 1) return {ok:false, reason:'PICK_LANDSCAPE_ZONE chooserIndex must be 0 or 1'};
  if(chooserIndex !== playerIndex) return {ok:false, reason:'PICK_LANDSCAPE_ZONE player must be the chooser'};
  const z = Number(payload.zone);
  if(!Number.isInteger(z) || z < 0 || z > 2) return {ok:false, reason:'PICK_LANDSCAPE_ZONE zone must be 0, 1, or 2'};
  const st = serverLandscapeState(state);
  const landscapeId = String(state?.landscape?.id || state?.landscapeId || st.id || '');
  if(landscapeId === 'igb2'){
    if(Number(state.turn || 0) < 14) return {ok:false, reason:'The Frontier of Innovation is not ready to resolve'};
    if(st.resolvedTurns.igb2) return {ok:false, reason:'The Frontier of Innovation has already resolved'};
    const c0 = Number(st.consolidations?.[0] || 0) || 0;
    const c1 = Number(st.consolidations?.[1] || 0) || 0;
    if(c0 === c1) return {ok:false, reason:'The Frontier of Innovation is tied'};
    const winner = c0 > c1 ? 0 : 1;
    if(playerIndex !== winner) return {ok:false, reason:'PICK_LANDSCAPE_ZONE chooser is not the Frontier winner'};
    st.resolvedTurns.igb2 = true;
    addServerLandscapeZoneFateBonus(state, winner, z, 10);
    state.selectedHandCard = null;
    state.selectedBoardCard = null;
    state.placing = false;
    state.blockingCell = false;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(landscapeId === 'igb8'){
    if(Number(state.turn || 0) < 10) return {ok:false, reason:'Qingdao Breakthrough is not ready to resolve'};
    if(st.resolvedTurns.igb8) return {ok:false, reason:'Qingdao Breakthrough has already resolved'};
    const sourceZ = Number.isInteger(Number(st.targetZone)) ? Number(st.targetZone) : 0;
    if(sourceZ < 0 || sourceZ > 2) return {ok:false, reason:'Qingdao target zone is invalid'};
    const s0 = serverZoneScore(state, sourceZ, 0);
    const s1 = serverZoneScore(state, sourceZ, 1);
    if(s0 === s1) return {ok:false, reason:'Qingdao Breakthrough is tied'};
    const winner = s0 > s1 ? 0 : 1;
    if(playerIndex !== winner) return {ok:false, reason:'PICK_LANDSCAPE_ZONE chooser is not the Qingdao winner'};
    st.resolvedTurns.igb8 = true;
    addServerFullExtraSafeRowForPlayer(state, z, winner);
    state.selectedHandCard = null;
    state.selectedBoardCard = null;
    state.placing = false;
    state.blockingCell = false;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(String(options.mode || '').toLowerCase() === 'strict') return {ok:false, reason:`server reducer is not implemented for landscape zone pick ${landscapeId || '(unknown)'}`};
  return validateProposedTransition(room, msg, options);
}

function selectedZoneEntryPayload(payload){
  const entries = Array.isArray(payload.selectedEntries) ? payload.selectedEntries : [];
  if(entries.length !== 1) return {error:'PICK_ZONE requires exactly one selected entry'};
  const entry = entries[0] || {};
  const z = Number(entry.z), r = Number(entry.r), c = Number(entry.c);
  if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)){
    return {error:'PICK_ZONE selected entry must include numeric z/r/c'};
  }
  const card = cardIdentityFromPayload(entry);
  if(!hasCardIdentityPayload(card)) return {error:'PICK_ZONE selected entry must include card identity'};
  return {z, r, c, card};
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
    const card = cardIdentityFromPayload(item);
    if(!hasCardIdentityPayload(card)) return {error:'PICK_ZONE selected entry must include card identity'};
    parsed.push({z, r, c, card});
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

function cardIdentityFromPayload(payload){
  const source = payload && typeof payload.card === 'object' && payload.card ? payload.card : payload;
  return {
    iid:source?.iid || payload?.cardIid || '',
    id:source?.id || payload?.cardId || '',
    name:source?.name || ''
  };
}

function hasCardIdentityPayload(identity){
  return !!(identity && (identity.iid || identity.id || identity.name));
}

function pendingSourceLocation(pending){
  return {
    z:pending.sourceZ !== undefined ? Number(pending.sourceZ) : Number(pending.z),
    r:pending.sourceR !== undefined ? Number(pending.sourceR) : Number(pending.r),
    c:pending.sourceC !== undefined ? Number(pending.sourceC) : Number(pending.c)
  };
}

function pendingSourceActsAsId(source, pending, expectedId){
  const wanted = String(expectedId || '');
  if(String(source?.id || '') === wanted) return true;
  return String(pending?.copiedSourceId || '') === wanted;
}

function markPendingAsLedgerCopied(state, ledger, copiedId, ledgerPos, target){
  const ledgerIid = String(ledger?.iid || '');
  if(!ledgerIid) return;
  const copied = String(copiedId || '');
  const stamp = pending=>{
    if(!pending || typeof pending !== 'object') return;
    const refsLedger =
      String(pending.iid || '') === ledgerIid ||
      String(pending.sourceIid || '') === ledgerIid ||
      String(pending.movingIid || '') === ledgerIid;
    if(!refsLedger) return;
    pending.copiedSourceId = copied;
    pending.originalSourceId = '75';
    pending.sourceZ = ledgerPos.z;
    pending.sourceR = ledgerPos.r;
    pending.sourceC = ledgerPos.c;
    pending.ledgerCopySourceIid = ledgerIid;
    pending.ledgerCopiedFromIid = target?.iid || null;
    pending.ledgerCopiedFromId = copied;
  };
  stamp(state._serverPendingZonePick);
  stamp(state._serverPendingModalAction);
  stamp(state._serverPendingCardPick);
  stamp(state._serverPendingMove);
  stamp(state._serverFreePlacement);
}

function runLedgerKeepersCopiedWhenSet(state, ledger, playerIndex, ledgerPos, targetEntry){
  const target = targetEntry?.card;
  const copiedId = String(target?.id || '');
  if(!canLedgerKeepersCopyWhenSetForState(target, ledger?.iid || null, state)){
    return {ok:false, reason:'Ledger-keepers target is not a supported server when-set Supporter'};
  }
  const original = {
    id:ledger.id,
    name:ledger.name,
    effect:ledger.effect,
    aff:ledger.aff,
    type:ledger.type
  };
  ledger._ledgerCopiedWhenSetId = copiedId;
  ledger._ledgerCopiedWhenSetName = target.name || 'Supporter';
  ledger._ledgerCopiedWhenSetEffect = target.effect || '';
  ledger._ledgerCopiedFromIid = target.iid || null;
  ledger.effectUsedInitial = true;
  ledger.id = copiedId;
  if(target.name !== undefined) ledger.name = target.name;
  if(target.effect !== undefined) ledger.effect = target.effect;
  if(target.aff !== undefined) ledger.aff = target.aff;
  try{
    const whenSet = applySupportedWhenSetState(state, ledger, playerIndex, targetEntry.z, targetEntry.r, targetEntry.c);
    if(whenSet && whenSet.ok === false) return whenSet;
    armPostWhenSetInteractionHooks(state, ledger, playerIndex, targetEntry.z, targetEntry.r, targetEntry.c);
    markPendingAsLedgerCopied(state, ledger, copiedId, ledgerPos, target);
  } finally {
    ledger.id = original.id;
    ledger.name = original.name;
    ledger.effect = original.effect;
    ledger.aff = original.aff;
    ledger.type = original.type;
  }
  return {ok:true};
}

function selectedHandCardsPayload(payload, hand, minCount, maxCount){
  const selected = Array.isArray(payload.selectedCards) ? payload.selectedCards : [];
  if(selected.length < minCount || selected.length > maxCount){
    return {error:`PICK_CARDS_VISUAL requires ${minCount === maxCount ? minCount : `${minCount}-${maxCount}`} selected cards`};
  }
  const picked = [];
  const seen = new Set();
  selected.forEach(identity=>{
    if(!identity || typeof identity !== 'object'){
      picked.push({error:'PICK_CARDS_VISUAL selected card identity is invalid'});
      return;
    }
    let idx = -1;
    if(identity.iid) idx = hand.findIndex(card=>card && String(card.iid || '') === String(identity.iid));
    if(idx < 0 && Number.isInteger(Number(identity.index))) idx = Number(identity.index);
    if(idx < 0 || idx >= hand.length || !cardMatchesPayloadIdentity(hand[idx], identity)){
      picked.push({error:'PICK_CARDS_VISUAL selected card is not in hand'});
      return;
    }
    if(seen.has(idx)){
      picked.push({error:'PICK_CARDS_VISUAL selected cards must be unique'});
      return;
    }
    seen.add(idx);
    picked.push({idx, card:hand[idx], identity});
  });
  const bad = picked.find(item=>item && item.error);
  if(bad) return {error:bad.error};
  return {picked};
}

function selectedCandidateCardsPayload(payload, candidates, minCount, maxCount){
  const selected = Array.isArray(payload.selectedCards) ? payload.selectedCards : [];
  if(selected.length < minCount || selected.length > maxCount){
    return {error:`PICK_CARDS_VISUAL requires ${minCount === maxCount ? minCount : `${minCount}-${maxCount}`} selected cards`};
  }
  const picked = [];
  const seen = new Set();
  selected.forEach(identity=>{
    if(!identity || typeof identity !== 'object'){
      picked.push({error:'PICK_CARDS_VISUAL selected card identity is invalid'});
      return;
    }
    const hasIid = !!identity.iid;
    const hasSource = typeof identity.source === 'string' && identity.source.length > 0;
    const indexNumber = Number(identity.index);
    const hasIndex = Number.isInteger(indexNumber);
    const hasCardFingerprint = !!(identity.id || identity.name);
    if(!hasIid && !(hasSource && hasIndex && hasCardFingerprint)){
      picked.push({error:'PICK_CARDS_VISUAL selected card must include iid or source/index with card id'});
      return;
    }
    const idx = candidates.findIndex(candidate=>{
      if(!candidate) return false;
      if(hasSource && String(candidate.source || '') !== String(identity.source || '')) return false;
      if(hasIndex && Number(candidate.index) !== indexNumber) return false;
      return cardMatchesPayloadIdentity(candidate.card, identity);
    });
    if(idx < 0){
      picked.push({error:'PICK_CARDS_VISUAL selected card is not in the allowed source'});
      return;
    }
    const candidate = candidates[idx];
    const key = `${candidate.source}:${candidate.index}`;
    if(seen.has(key)){
      picked.push({error:'PICK_CARDS_VISUAL selected cards must be unique'});
      return;
    }
    seen.add(key);
    picked.push(candidate);
  });
  const bad = picked.find(item=>item && item.error);
  if(bad) return {error:bad.error};
  return {picked};
}

function selectedBoardCandidateCardsPayload(payload, candidates, minCount, maxCount){
  const selected = Array.isArray(payload.selectedCards) ? payload.selectedCards : [];
  if(selected.length < minCount || selected.length > maxCount){
    return {error:`PICK_CARDS_VISUAL requires ${minCount === maxCount ? minCount : `${minCount}-${maxCount}`} selected cards`};
  }
  const picked = [];
  const seen = new Set();
  selected.forEach(identity=>{
    if(!identity || typeof identity !== 'object'){
      picked.push({error:'PICK_CARDS_VISUAL selected card identity is invalid'});
      return;
    }
    const hasIid = !!identity.iid;
    const zNumber = Number(identity.z);
    const rNumber = Number(identity.r);
    const cNumber = Number(identity.c);
    const hasLocation = Number.isInteger(zNumber) && Number.isInteger(rNumber) && Number.isInteger(cNumber);
    const hasCardFingerprint = !!(identity.id || identity.name);
    if(!hasIid && !(hasLocation && hasCardFingerprint)){
      picked.push({error:'PICK_CARDS_VISUAL selected board card must include iid or z/r/c with card id'});
      return;
    }
    const idx = candidates.findIndex(item=>{
      if(!item) return false;
      if(hasLocation && (Number(item.z) !== zNumber || Number(item.r) !== rNumber || Number(item.c) !== cNumber)) return false;
      return cardMatchesPayloadIdentity(item.card, identity);
    });
    if(idx < 0){
      picked.push({error:'PICK_CARDS_VISUAL selected card is not in the allowed board candidates'});
      return;
    }
    const item = candidates[idx];
    const key = `${item.z}:${item.r}:${item.c}`;
    if(seen.has(key)){
      picked.push({error:'PICK_CARDS_VISUAL selected cards must be unique'});
      return;
    }
    seen.add(key);
    picked.push(item);
  });
  const bad = picked.find(item=>item && item.error);
  if(bad) return {error:bad.error};
  return {picked};
}

function validatePendingSource(state, pending, playerIndex, expectedId, label){
  const loc = pendingSourceLocation(pending);
  const source = state.board?.[loc.z]?.[loc.r]?.[loc.c] || null;
  if(!source || !pendingSourceActsAsId(source, pending, expectedId) || Number(source.owner) !== playerIndex){
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

function reducePickCardsVisualAction(room, msg, options){
  const payload = msg.payload || {};
  const base = verifyBaseHash(room, payload, options);
  if(!base.ok) return base;
  const state = cloneState(room.canonicalState);
  if(!state) return {ok:false, reason:'server canonical state is not initialized'};
  const pending = state._serverPendingCardPick;
  if(!pending || typeof pending !== 'object') return {ok:false, reason:'PICK_CARDS_VISUAL has no server pending card picker'};
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  if(Number(pending.playerIndex) !== playerIndex) return {ok:false, reason:'PICK_CARDS_VISUAL player does not own pending picker'};
  if(Number(state.currentPlayer) !== playerIndex) return {ok:false, reason:'PICK_CARDS_VISUAL player does not have priority'};
  const expectedPromptId = String(pending.promptId || '');
  if(expectedPromptId && !payload.promptId) return {ok:false, reason:'PICK_CARDS_VISUAL promptId is required'};
  if(expectedPromptId && String(payload.promptId || '') !== expectedPromptId) return {ok:false, reason:'PICK_CARDS_VISUAL prompt mismatch'};
  const kind = String(pending.kind || '');
  const afterPick = pending.afterPick && typeof pending.afterPick === 'object' ? cloneState(pending.afterPick) : null;
  const player = state.players?.[playerIndex];
  const minCount = Math.max(0, Number(pending.minCount || 0) || 0);
  const maxCount = Math.max(minCount, Number(pending.maxCount || minCount) || minCount);
  if(kind === 'handDiscard'){
    if(!player || !Array.isArray(player.hand)) return {ok:false, reason:'PICK_CARDS_VISUAL hand state is invalid'};
    if(!Array.isArray(player.discard)) player.discard = [];
    const selected = selectedHandCardsPayload(payload, player.hand, minCount, maxCount);
    if(selected.error) return {ok:false, reason:selected.error};
    const discardedByIndex = new Map();
    selected.picked
      .slice()
      .sort((a, b)=>b.idx - a.idx)
      .forEach(item=>{
        const discarded = player.hand.splice(item.idx, 1)[0];
        if(discarded) discardedByIndex.set(item.idx, cloneState(discarded));
      });
    selected.picked.forEach(item=>{
      const discarded = discardedByIndex.get(item.idx);
      if(discarded) player.discard.push(discarded);
    });
  }else if(kind === 'handDiscardBoost'){
    if(!player || !Array.isArray(player.hand)) return {ok:false, reason:'PICK_CARDS_VISUAL hand state is invalid'};
    if(!Array.isArray(player.discard)) player.discard = [];
    const source = findBoardCardByIid(state, pending.sourceIid);
    if(!source || String(source.id || '') !== String(pending.sourceId || '') || Number(source.owner) !== playerIndex){
      return {ok:false, reason:'PICK_CARDS_VISUAL boost source is no longer on board'};
    }
    if(pending.oncePerTurn && source.effectUsedThisTurn) return {ok:false, reason:'PICK_CARDS_VISUAL boost source already acted this turn'};
    const selected = selectedHandCardsPayload(payload, player.hand, minCount, maxCount);
    if(selected.error) return {ok:false, reason:selected.error};
    if(pending.filterType){
      const bad = selected.picked.find(item=>String(item.card?.type || '') !== String(pending.filterType));
      if(bad) return {ok:false, reason:`PICK_CARDS_VISUAL selected card must be a ${pending.filterType}`};
    }
    const discardedByIndex = new Map();
    selected.picked
      .slice()
      .sort((a, b)=>b.idx - a.idx)
      .forEach(item=>{
        const discarded = player.hand.splice(item.idx, 1)[0];
        if(discarded) discardedByIndex.set(item.idx, cloneState(discarded));
      });
    selected.picked.forEach(item=>{
      const discarded = discardedByIndex.get(item.idx);
      if(discarded) player.discard.push(discarded);
    });
    const gained = selected.picked.length * (Math.max(0, Number(pending.fatePerCard || 0) || 0));
    source.effectUsedInitial = true;
    if(gained > 0){
      source.currentFate = Math.max(0, (Number(source.currentFate ?? source.fate ?? 0) || 0) + gained);
      source._handDiscardBoostFate = (Number(source._handDiscardBoostFate || 0) || 0) + gained;
      if(pending.oncePerTurn) source.effectUsedThisTurn = true;
    }
  }else if(kind === 'vigilantesExpendSupporters'){
    const sourceResult = validatePendingSource(state, pending, playerIndex, '52', 'Vigilantes');
    if(sourceResult.error) return {ok:false, reason:sourceResult.error};
    if(sourceResult.source.vigilanteUsed === true) return {ok:false, reason:'Vigilantes already activated this turn'};
    const candidates = collectVigilantesExpendCandidates(state, playerIndex, sourceResult.source.iid || null);
    const selected = selectedBoardCandidateCardsPayload(payload, candidates, 3, 3);
    if(selected.error) return {ok:false, reason:selected.error};
    const sameSource = selected.picked.find(item=>String(item.card?.iid || '') === String(sourceResult.source.iid || ''));
    if(sameSource) return {ok:false, reason:'Vigilantes cannot expend itself'};
    state._serverPendingCardPick = null;
    state._serverPendingZonePick = {
      kind:'vigilantesDestroyTarget',
      playerIndex,
      z:Number(pending.sourceZ),
      r:Number(pending.sourceR),
      c:Number(pending.sourceC),
      iid:sourceResult.source.iid || null,
      expend:selected.picked.map(item=>({
        z:item.z,
        r:item.r,
        c:item.c,
        iid:item.card?.iid || null,
        id:item.card?.id || null
      }))
    };
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }else if(kind === 'cardToHand'){
    if(!player || !Array.isArray(player.hand)) return {ok:false, reason:'PICK_CARDS_VISUAL hand state is invalid'};
    const candidates = pendingCardPickCandidates(state, pending, playerIndex);
    const selected = selectedCandidateCardsPayload(payload, candidates, minCount, maxCount);
    if(selected.error) return {ok:false, reason:selected.error};
    const removals = {deck:[], discard:[]};
    selected.picked.forEach(item=>{
      if(!removals[item.source]) removals[item.source] = [];
      removals[item.source].push(item);
    });
    const moved = new Map();
    Object.keys(removals).forEach(source=>{
      const pile = source === 'discard' ? player.discard : player.deck;
      if(!Array.isArray(pile)) return;
      removals[source]
        .slice()
        .sort((a, b)=>b.index - a.index)
        .forEach(item=>{
          const card = pile.splice(item.index, 1)[0];
          if(card) moved.set(`${item.source}:${item.index}`, cloneState(card));
        });
    });
    selected.picked.forEach(item=>{
      const card = moved.get(`${item.source}:${item.index}`);
      if(!card) return;
      applyWestCaribHandArrival(state, playerIndex, card);
      player.hand.push(card);
      applySelvaIslandsPirateHandArrival(state, playerIndex, card);
    });
    if(pending.shuffleDeck && String(pending.source || '').split('+').includes('deck')) serverShufflePlayerDeck(state, playerIndex, pending.reason || 'search');
  }else if(kind === 'linaFreeSet'){
    if(!player || !Array.isArray(player.hand)) return {ok:false, reason:'PICK_CARDS_VISUAL hand state is invalid'};
    const source = findBoardCardByIid(state, pending.sourceIid);
    if(!source || String(source.id || '') !== '08' || Number(source.owner) !== playerIndex){
      return {ok:false, reason:'Lina source is no longer on board'};
    }
    const candidates = pendingCardPickCandidates(state, pending, playerIndex);
    const selected = selectedCandidateCardsPayload(payload, candidates, 1, 1);
    if(selected.error) return {ok:false, reason:selected.error};
    const pick = selected.picked[0];
    const pile = pick.source === 'discard' ? player.discard : player.deck;
    if(!Array.isArray(pile)) return {ok:false, reason:'Lina selected pile is invalid'};
    const card = pile.splice(pick.index, 1)[0];
    if(!card || String(card.aff || '') !== 'reality') return {ok:false, reason:'Lina selected card must be Reality affiliation'};
    applyWestCaribHandArrival(state, playerIndex, card);
    card._serverFreePlacement = true;
    card._linaFree = true;
    card._linaFreeSourceIid = source.iid || null;
    player.hand.push(card);
    applySelvaIslandsPirateHandArrival(state, playerIndex, card);
    state.placing = true;
    state.selectedHandCard = player.hand.length - 1;
    state._serverFreePlacement = {
      kind:'linaFreeSet',
      playerIndex,
      cardIid:card.iid || null,
      source:pick.source,
      sourceIid:source.iid || null
    };
    source.effectUsedInitial = true;
  }else if(kind === 'mailDelivery'){
    if(!player || !Array.isArray(player.deck)) return {ok:false, reason:'PICK_CARDS_VISUAL deck state is invalid'};
    const sourceResult = validatePendingSource(state, pending, playerIndex, '94', 'Wodny Potok Mailman');
    if(sourceResult.error) return {ok:false, reason:sourceResult.error};
    const candidates = pendingCardPickCandidates(state, pending, playerIndex);
    const selected = selectedCandidateCardsPayload(payload, candidates, minCount, maxCount);
    if(selected.error) return {ok:false, reason:selected.error};
    const deckPicks = selected.picked.filter(item=>item.source === 'deck');
    if(deckPicks.length !== selected.picked.length) return {ok:false, reason:'Wodny Potok Mailman can only select from deck'};
    const delivered = [];
    deckPicks
      .slice()
      .sort((a, b)=>b.index - a.index)
      .forEach(item=>{
        const card = player.deck.splice(item.index, 1)[0];
        if(card) delivered.push(cloneState(card));
      });
    if(delivered.length){
      if(!Array.isArray(state._mailDeliveries)) state._mailDeliveries = [];
      delivered.reverse().forEach(card=>{
        state._mailDeliveries.push({
          player:playerIndex,
          card,
          turnsLeft:4,
          sourceIid:sourceResult.source.iid || null
        });
      });
      sourceResult.source.whenSetActivated = true;
      sourceResult.source.effectUsedInitial = true;
    }
  }else{
    return {ok:false, reason:`server reducer is not implemented for PICK_CARDS_VISUAL ${kind || '(unknown)'}`};
  }
  state._serverPendingCardPick = null;
  if(afterPick){
    const continued = completeAfterPickContinuation(state, playerIndex, afterPick);
    if(!continued.ok) return continued;
  }
  if(!state._serverFreePlacement) state.selectedHandCard = null;
  return reducedResult(state, {baseStateHash:base.baseStateHash});
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
  const expectedPromptId = String(pending.promptId || '');
  if(expectedPromptId && !payload.promptId) return {ok:false, reason:'PICK_ZONE promptId is required'};
  if(expectedPromptId && String(payload.promptId || '') !== expectedPromptId) return {ok:false, reason:'PICK_ZONE prompt mismatch'};
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
  if(kind === 'westCoastDreamingBonus'){
    if(!isLandscapeActiveForState(state, 'igb9')) return {ok:false, reason:'West Coast Dreaming landscape is not active'};
    const selectedMany = selectedZoneEntriesPayload(payload, 0, 1);
    if(selectedMany.error) return {ok:false, reason:selectedMany.error};
    if(selectedMany.entries.length){
      const selected = selectedMany.entries[0];
      const target = state.board?.[selected.z]?.[selected.r]?.[selected.c] || null;
      if(!target) return {ok:false, reason:'West Coast Dreaming target is no longer on board'};
      if(isFaceDownServerCard(target)) return {ok:false, reason:'West Coast Dreaming target must be face up'};
      if(!cardMatchesPayloadIdentity(target, selected.card)) return {ok:false, reason:'West Coast Dreaming target identity mismatch'};
      const allowed = Array.isArray(pending.options) && pending.options.some(option =>
        Number(option.z) === selected.z &&
        Number(option.r) === selected.r &&
        Number(option.c) === selected.c &&
        cardMatchesPayloadIdentity(target, option.card)
      );
      if(!allowed) return {ok:false, reason:'West Coast Dreaming target was not in the server options'};
      addFate(target, 3);
    }
    const afterDraw = pending.afterDraw && typeof pending.afterDraw === 'object' ? pending.afterDraw : null;
    state._serverPendingZonePick = null;
    if(afterDraw){
      const continued = completeAfterDrawContinuation(state, playerIndex, afterDraw);
      if(!continued.ok) return continued;
    }
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  const selected = selectedZoneEntryPayload(payload);
  if(selected.error) return {ok:false, reason:selected.error};
  if(kind === 'ledgerKeepersCopyWhenSet'){
    const source = state.board?.[pending.z]?.[pending.r]?.[pending.c] || null;
    if(!source || String(source.id || '') !== '75' || Number(source.owner) !== playerIndex){
      return {ok:false, reason:'Ledger-keepers source is no longer on board'};
    }
    if(pending.iid && source.iid !== pending.iid) return {ok:false, reason:'Ledger-keepers source mismatch'};
    const target = state.board?.[selected.z]?.[selected.r]?.[selected.c] || null;
    if(!target) return {ok:false, reason:'Ledger-keepers target is no longer on board'};
    if(!cardMatchesPayloadIdentity(target, selected.card)) return {ok:false, reason:'Ledger-keepers target identity mismatch'};
    if(!canLedgerKeepersCopyWhenSetForState(target, source.iid || null, state)){
      return {ok:false, reason:'Ledger-keepers target is not a supported server when-set Supporter'};
    }
    const allowed = Array.isArray(pending.options) && pending.options.some(option =>
      Number(option.z) === selected.z &&
      Number(option.r) === selected.r &&
      Number(option.c) === selected.c &&
      String(option.copiedWhenSetId || option.card?.id || '') === String(target.id || '')
    );
    if(!allowed) return {ok:false, reason:'Ledger-keepers target was not in the server copy options'};
    state._serverPendingZonePick = null;
    const copied = runLedgerKeepersCopiedWhenSet(state, source, playerIndex, {z:pending.z, r:pending.r, c:pending.c}, {z:selected.z, r:selected.r, c:selected.c, card:target});
    if(!copied.ok) return copied;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(kind === 'liberatorsFateGain'){
    const sourceResult = validatePendingSource(state, pending, playerIndex, '05', 'Liberators of Rwanda');
    if(sourceResult.error) return {ok:false, reason:sourceResult.error};
    const live = liveSelectedZoneTarget(state, selected, pending, 'Liberators of Rwanda');
    if(live.error) return {ok:false, reason:live.error};
    addFate(live.target, 3);
    state._serverPendingZonePick = null;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(kind === 'howardFateDouble'){
    const sourceResult = validatePendingSource(state, pending, playerIndex, '03', 'Howard');
    if(sourceResult.error) return {ok:false, reason:sourceResult.error};
    const live = liveSelectedZoneTarget(state, selected, pending, 'Howard');
    if(live.error) return {ok:false, reason:live.error};
    if(live.target.immuneFlag === true || String(live.target.id || '') === '76') return {ok:false, reason:'Howard target is immune'};
    live.target.currentFate = Math.ceil(currentFate(live.target) * 2);
    state._serverPendingZonePick = null;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(kind === 'hemorrhagingWound'){
    const sourceResult = validatePendingSource(state, pending, playerIndex, '31', 'Hemorrhaging Wound');
    if(sourceResult.error) return {ok:false, reason:sourceResult.error};
    const live = liveSelectedZoneTarget(state, selected, pending, 'Hemorrhaging Wound');
    if(live.error) return {ok:false, reason:live.error};
    const reduced = reduceFateToValue(state, live.target, currentFate(live.target) - 3, playerIndex, selected.z);
    if(!reduced.ok) return {ok:false, reason:reduced.reason};
    state._serverPendingZonePick = null;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(kind === 'santiagoHalveFate'){
    const sourceResult = validatePendingSource(state, pending, playerIndex, '30', 'Santiago');
    if(sourceResult.error) return {ok:false, reason:sourceResult.error};
    const live = liveSelectedZoneTarget(state, selected, pending, 'Santiago');
    if(live.error) return {ok:false, reason:live.error};
    const opponent = playerIndex === 0 ? 1 : 0;
    if(Number(live.target.owner) !== opponent) return {ok:false, reason:'Santiago target must be an opponent card'};
    if(live.target.immuneFlag === true || String(live.target.id || '') === '76') return {ok:false, reason:'Santiago target is immune'};
    const reduced = reduceFateToValue(state, live.target, Math.floor(currentFate(live.target) / 2), playerIndex, selected.z);
    if(!reduced.ok) return {ok:false, reason:reduced.reason};
    state._serverPendingZonePick = null;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(kind === 'mariaSongCopies'){
    const sourceResult = validatePendingSource(state, pending, playerIndex, '61', 'Maria Song');
    if(sourceResult.error) return {ok:false, reason:sourceResult.error};
    const target = state.board?.[selected.z]?.[selected.r]?.[selected.c] || null;
    if(!target) return {ok:false, reason:'Maria Song target is no longer on board'};
    if(!cardMatchesPayloadIdentity(target, selected.card)) return {ok:false, reason:'Maria Song target identity mismatch'};
    const opponent = playerIndex === 0 ? 1 : 0;
    if(Number(target.owner) !== opponent) return {ok:false, reason:'Maria Song target must be an opponent card'};
    const targetId = String(target.id || '');
    const opp = state.players?.[opponent];
    if(!opp || !Array.isArray(opp.hand) || !Array.isArray(opp.deck) || !Array.isArray(opp.discard)){
      return {ok:false, reason:'Maria Song opponent piles are invalid'};
    }
    const moveCopies = pileName=>{
      const pile = opp[pileName];
      const remaining = [];
      pile.forEach(card=>{
        if(card && String(card.id || '') === targetId) opp.discard.push(cloneState(card));
        else remaining.push(card);
      });
      opp[pileName] = remaining;
    };
    moveCopies('hand');
    moveCopies('deck');
    state._serverPendingZonePick = null;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(kind === 'breakfastBusserGrantMove'){
    const sourceLoc = pendingSourceLocation(pending);
    const source = state.board?.[sourceLoc.z]?.[sourceLoc.r]?.[sourceLoc.c] || null;
    if(!source || !pendingSourceActsAsId(source, pending, '69') || Number(source.owner) !== playerIndex){
      return {ok:false, reason:'Breakfast Republic Busser source is no longer on board'};
    }
    if(pending.iid && source.iid !== pending.iid) return {ok:false, reason:'Breakfast Republic Busser source mismatch'};
    const live = liveSelectedZoneTarget(state, selected, pending, 'Breakfast Republic Busser');
    if(live.error) return {ok:false, reason:live.error};
    if(!isBusserMovementGrantCandidate(live.target, playerIndex)){
      return {ok:false, reason:'Breakfast Republic Busser target must be a movable friendly face-up card'};
    }
    live.target._busserMoves = Math.max(3, Number(live.target._busserMoves || 0) || 0);
    live.target._busserOwner = playerIndex;
    live.target._busserMovedThisTurn = false;
    live.target._busserSourceIid = source.iid || null;
    source.effectUsedInitial = true;
    source.whenSetActivated = true;
    state._serverPendingZonePick = null;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(kind === 'breakfastBusserSelectSupporter'){
    const sourceLoc = pendingSourceLocation(pending);
    const source = state.board?.[sourceLoc.z]?.[sourceLoc.r]?.[sourceLoc.c] || null;
    if(!source || !pendingSourceActsAsId(source, pending, '69') || Number(source.owner) !== playerIndex){
      return {ok:false, reason:'Breakfast Republic Busser source is no longer on board'};
    }
    if(pending.iid && source.iid !== pending.iid) return {ok:false, reason:'Breakfast Republic Busser source mismatch'};
    const target = state.board?.[selected.z]?.[selected.r]?.[selected.c] || null;
    if(!target) return {ok:false, reason:'Breakfast Republic Busser target is no longer on board'};
    if(!cardMatchesPayloadIdentity(target, selected.card)) return {ok:false, reason:'Breakfast Republic Busser target identity mismatch'};
    if(Number(target.owner) !== playerIndex || String(target.type || '') !== 'Supporter' || String(target.iid || '') === String(source.iid || '')){
      return {ok:false, reason:'Breakfast Republic Busser target must be another friendly Supporter'};
    }
    if(!isSupportedSupporterPlacementCard(target, options)){
      return {ok:false, reason:'Breakfast Republic Busser target Supporter requires a dedicated server reducer'};
    }
    const moveOptions = collectBreakfastBusserMoveOptions(state, playerIndex, pending.z);
    if(!moveOptions.length) return {ok:false, reason:'No open square available for Breakfast Republic Busser'};
    state._serverPendingZonePick = null;
    state._serverPendingMove = {
      kind:'breakfastBusserMove',
      playerIndex,
      sourceZ:sourceLoc.z,
      sourceR:sourceLoc.r,
      sourceC:sourceLoc.c,
      sourceIid:source.iid || null,
      fromZ:selected.z,
      fromR:selected.r,
      fromC:selected.c,
      movingIid:target.iid || null,
      options:moveOptions
    };
    if(pending.copiedSourceId){
      state._serverPendingMove.copiedSourceId = pending.copiedSourceId;
      state._serverPendingMove.originalSourceId = pending.originalSourceId || '75';
      state._serverPendingMove.ledgerCopySourceIid = pending.ledgerCopySourceIid || source.iid || null;
      state._serverPendingMove.ledgerCopiedFromIid = pending.ledgerCopiedFromIid || null;
      state._serverPendingMove.ledgerCopiedFromId = pending.ledgerCopiedFromId || pending.copiedSourceId;
    }
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(kind === 'frenchFusiliersCopyPassive'){
    const source = state.board?.[pending.z]?.[pending.r]?.[pending.c] || null;
    if(!source || String(source.id || '') !== '37' || Number(source.owner) !== playerIndex){
      return {ok:false, reason:'French Fusiliers source is no longer on board'};
    }
    if(pending.iid && source.iid !== pending.iid) return {ok:false, reason:'French Fusiliers source mismatch'};
    const target = state.board?.[selected.z]?.[selected.r]?.[selected.c] || null;
    if(!target) return {ok:false, reason:'French Fusiliers target is no longer on board'};
    if(!cardMatchesPayloadIdentity(target, selected.card)) return {ok:false, reason:'French Fusiliers target identity mismatch'};
    if(!canFrenchFusiliersCopyPassiveForState(target, state)){
      return {ok:false, reason:'French Fusiliers target is not a supported while-on-field Supporter passive'};
    }
    source._copiedPassiveId = String(target.id || '');
    source._copiedPassiveName = target.name || 'Supporter';
    source._copiedPassiveEffect = target.effect || '';
    source.copiedPassiveId = source._copiedPassiveId;
    source.copiedPassiveName = source._copiedPassiveName;
    source.effectUsedInitial = true;
    if(source._copiedPassiveId === '20') applyShieldWallForZone(state, pending.z);
    state._serverPendingZonePick = null;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(kind === 'juanCarlosSelectMoveTarget'){
    const source = state.board?.[pending.z]?.[pending.r]?.[pending.c] || null;
    if(!source || String(source.id || '') !== '39' || Number(source.owner) !== playerIndex){
      return {ok:false, reason:'Juan Carlos source is no longer on board'};
    }
    if(pending.iid && source.iid !== pending.iid) return {ok:false, reason:'Juan Carlos source mismatch'};
    const target = state.board?.[selected.z]?.[selected.r]?.[selected.c] || null;
    if(!target) return {ok:false, reason:'Juan Carlos target is no longer on board'};
    if(!cardMatchesPayloadIdentity(target, selected.card)) return {ok:false, reason:'Juan Carlos target identity mismatch'};
    const opponent = playerIndex === 0 ? 1 : 0;
    if(Number(target.owner) !== opponent || target.cantBeMoved === true) return {ok:false, reason:'Juan Carlos target is invalid'};
    const moveOptions = collectJuanCarlosMoveOptions(state, playerIndex, pending.z);
    if(!moveOptions.length) return {ok:false, reason:'No open squares available for Juan Carlos'};
    state._serverPendingZonePick = null;
    state._serverPendingMove = {
      kind:'juanCarlosMove',
      playerIndex,
      sourceZ:pending.z,
      sourceR:pending.r,
      sourceC:pending.c,
      sourceIid:source.iid || null,
      fromZ:selected.z,
      fromR:selected.r,
      fromC:selected.c,
      movingIid:target.iid || null,
      options:moveOptions
    };
    state._juanCarlosMoving = {
      card:cloneState(target),
      fromZ:selected.z,
      fromR:selected.r,
      fromC:selected.c,
      options:moveOptions
    };
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(kind === 'apparitionDiscardDraw'){
    const sourceResult = validatePendingSource(state, pending, playerIndex, '80', 'Apparition of Berkeley');
    if(sourceResult.error) return {ok:false, reason:sourceResult.error};
    const live = liveSelectedZoneTarget(state, selected, pending, 'Apparition of Berkeley');
    if(live.error) return {ok:false, reason:live.error};
    if(Number(live.target.owner) !== playerIndex || String(live.target.type || '') === 'Supporter' || live.target.iid === sourceResult.source.iid){
      return {ok:false, reason:'Apparition of Berkeley target must be a friendly character'};
    }
    discardBoardCardForState(state, selected.z, selected.r, selected.c);
    state._serverPendingZonePick = null;
    const drawn = drawCardsForState(state, playerIndex, 2);
    if(!drawn.ok) return drawn;
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
  if(kind === 'vigilantesDestroyTarget'){
    const source = state.board?.[pending.z]?.[pending.r]?.[pending.c] || null;
    if(!source || String(source.id || '') !== '52' || Number(source.owner) !== playerIndex){
      return {ok:false, reason:'Vigilantes source is no longer on board'};
    }
    if(pending.iid && source.iid !== pending.iid) return {ok:false, reason:'Vigilantes source mismatch'};
    if(source.vigilanteUsed === true) return {ok:false, reason:'Vigilantes already activated this turn'};
    if(selected.z !== Number(pending.z)) return {ok:false, reason:'Vigilantes target must be in the same zone'};
    const target = state.board?.[selected.z]?.[selected.r]?.[selected.c] || null;
    if(!target) return {ok:false, reason:'Vigilantes target is no longer on board'};
    if(!cardMatchesPayloadIdentity(target, selected.card)) return {ok:false, reason:'Vigilantes target identity mismatch'};
    if(target.immuneFlag === true || String(target.id || '') === '76') return {ok:false, reason:'Vigilantes target is immune'};
    const expend = Array.isArray(pending.expend) ? pending.expend : [];
    if(expend.length !== 3) return {ok:false, reason:'Vigilantes expend selection is invalid'};
    for(const item of expend){
      const live = state.board?.[item.z]?.[item.r]?.[item.c] || null;
      if(!isVigilantesExpendCandidate(live, playerIndex, source.iid || null)){
        return {ok:false, reason:'Vigilantes expend Supporter is no longer valid'};
      }
      if(item.iid && String(live.iid || '') !== String(item.iid)) return {ok:false, reason:'Vigilantes expend Supporter mismatch'};
    }
    expend.forEach(item=>{
      discardBoardCardForState(state, item.z, item.r, item.c);
    });
    const remainingTarget = state.board?.[selected.z]?.[selected.r]?.[selected.c] || null;
    if(remainingTarget && cardMatchesPayloadIdentity(remainingTarget, selected.card)){
      discardBoardCardForState(state, selected.z, selected.r, selected.c);
    }
    source.vigilanteUsed = true;
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

function reduceReactionChoice(room, msg, options){
  const payload = msg.payload || {};
  const base = verifyBaseHash(room, payload, options);
  if(!base.ok) return base;
  const state = cloneState(room.canonicalState);
  if(!state) return {ok:false, reason:'server canonical state is not initialized'};
  const pending = state._serverPendingReaction;
  if(!pending || typeof pending !== 'object') return {ok:false, reason:'REACTION_CHOICE has no server pending reaction'};
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return {ok:false, reason:'payload.playerIndex must be 0 or 1'};
  if(Number(pending.playerIndex) !== playerIndex) return {ok:false, reason:'REACTION_CHOICE player does not own pending reaction'};
  const expectedPromptId = String(pending.promptId || '');
  if(expectedPromptId && !payload.promptId) return {ok:false, reason:'REACTION_CHOICE promptId is required'};
  if(expectedPromptId && String(payload.promptId || '') !== expectedPromptId) return {ok:false, reason:'REACTION_CHOICE prompt mismatch'};
  const choice = String(payload.choice ?? payload.action ?? payload.decision ?? '').toLowerCase().trim();
  if(choice === 'decline' || choice === 'allow' || choice === 'pass' || choice === 'timeout' || choice === 'skip'){
    const applied = completePendingReactionOriginalEffect(state, pending, options);
    if(!applied.ok) return applied;
    return reducedResult(state, {baseStateHash:base.baseStateHash});
  }
  if(choice !== 'negate' && choice !== 'accept' && choice !== 'use'){
    return {ok:false, reason:'REACTION_CHOICE must be negate or decline'};
  }
  const selected = selectedReactionOption(state, pending, payload);
  if(selected.error) return {ok:false, reason:selected.error};
  const source = pendingReactionSource(state, pending);
  if(source.error) return {ok:false, reason:source.error};
  if(Number(source.card.owner) !== Number(pending.triggerPlayerIndex)) return {ok:false, reason:'REACTION_CHOICE source owner mismatch'};
  if(String(selected.option.kind || '') === 'havano'){
    const deployed = deployHavanoReaction(state, selected, payload, playerIndex);
    if(!deployed.ok) return deployed;
    if(String(source.card.type || '') === 'Supporter') source.card._reactionSuppressed = true;
    source.card._effectNegatedByReaction = true;
  } else if(String(selected.option.kind || '') === 'lydia'){
    selected.card.usesLeft = Math.max(0, (Number(selected.card.usesLeft ?? 5) || 0) - 1);
    if(String(source.card.type || '') === 'Supporter') source.card._lydiaSuppressed = true;
    source.card._effectNegatedByReaction = true;
  } else if(String(selected.option.kind || '') === 'secules'){
    selected.card.usesLeft = 0;
    selected.card._seculesUsed = true;
    if(String(source.card.type || '') === 'Supporter') source.card._reactionSuppressed = true;
    source.card._effectNegatedByReaction = true;
  } else {
    return {ok:false, reason:'REACTION_CHOICE option is not supported'};
  }
  state._serverPendingReaction = null;
  state.selectedBoardCard = null;
  state.placing = false;
  state.blockingCell = false;
  return reducedResult(state, {baseStateHash:base.baseStateHash});
}

function reduceServerAction(room, msg, opts){
  const options = opts || {};
  const mode = String(options.mode || 'lineage').toLowerCase();
  const type = String(msg.type || '').toUpperCase();
  if(mode === 'lineage') return validateProposedTransition(room, msg, options);
  if(room?.canonicalState?._serverPendingReaction && !['REACTION_CHOICE','FORFEIT','DISCONNECT_TIMEOUT'].includes(type)){
    return {ok:false, reason:'pending reaction must resolve before the next action'};
  }
  if(type === 'STATE_SYNC') return reduceStateSync(room, msg, options);
  if(type === 'CHOOSE_TURN') return reduceChooseTurn(room, msg, options);
  if(type === 'END_TURN') return reduceEndTurn(room, msg, options);
  if(type === 'START_CONSOLIDATE') return reduceStartConsolidate(room, msg, options);
  if(type === 'HAND_ACTION') return reduceHandAction(room, msg, options);
  if(type === 'BOARD_ACTION') return reduceBoardAction(room, msg, options);
  if(type === 'CLICK_CELL') return reduceBasicClickCell(room, msg, options);
  if(type === 'MODAL_ACTION') return reduceModalAction(room, msg, options);
  if(type === 'PICK_CARDS_VISUAL') return reducePickCardsVisualAction(room, msg, options);
  if(type === 'PICK_AFFILIATION') return reducePickAffiliationAction(room, msg, options);
  if(type === 'PICK_LANDSCAPE_ZONE') return reducePickLandscapeZoneAction(room, msg, options);
  if(type === 'PICK_ZONE') return reducePickZoneAction(room, msg, options);
  if(type === 'REACTION_CHOICE') return reduceReactionChoice(room, msg, options);
  if(type === 'EFFECT_CINEMATIC') return reduceVisualOnly(room, msg, options);
  if(type === 'FORFEIT') return reduceForfeit(room, msg, options);
  if(type === 'DISCONNECT_TIMEOUT') return reduceDisconnectTimeout(room, msg, options);
  if(type === 'MATCH_RESULT') return reduceMatchResult(room, msg, options);
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
