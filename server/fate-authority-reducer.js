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
    const deckErr = validateCardList(player.deck || [], `player ${i} deck`, 240);
    if(deckErr) return deckErr;
    const handErr = validateCardList(player.hand || [], `player ${i} hand`, 120);
    if(handErr) return handErr;
    const discardErr = validateCardList(player.discard || [], `player ${i} discard`, 240);
    if(discardErr) return discardErr;
  }
  const boardErr = validateBoard(state.board);
  if(boardErr) return boardErr;
  if(!Number.isInteger(Number(state.currentPlayer))) return 'currentPlayer must be numeric';
  if(String(state.phase || '').length > 80) return 'phase is invalid';
  return '';
}

function validateProposedTransition(room, msg, options){
  const payload = msg && msg.payload || {};
  const postState = payload.postState;
  if(!postState) return {ok:false, reason:'client-resolved action requires postState'};
  const validationError = validateCanonicalState(postState);
  if(validationError) return {ok:false, reason:validationError};
  const actionValidationError = validateActionSpecificPostState(room, msg, postState);
  if(actionValidationError) return {ok:false, reason:actionValidationError};
  const computedHash = canonicalStateHash(postState);
  const providedHash = String(payload.stateHash || '');
  if(providedHash && providedHash !== computedHash){
    return {ok:false, reason:'stateHash does not match postState', canonicalHash:computedHash};
  }
  const expectedBase = String(payload.baseStateHash || '');
  const currentHash = String(room && room.canonicalHash || '');
  if(options && options.requireBaseHash && expectedBase && currentHash && expectedBase !== currentHash){
    return {
      ok:false,
      reason:'stale baseStateHash',
      serverStateHash:currentHash,
      serverState:room && room.canonicalState
    };
  }
  return {
    ok:true,
    canonicalState:postState,
    canonicalHash:computedHash,
    baseStateHash:expectedBase || currentHash || ''
  };
}

function cloneState(value){
  return JSON.parse(JSON.stringify(value || null));
}

function boardEntries(state){
  const entries = [];
  const board = state && state.board;
  if(!Array.isArray(board)) return entries;
  board.forEach((zone, z)=>{
    if(!Array.isArray(zone)) return;
    zone.forEach((row, r)=>{
      if(!Array.isArray(row)) return;
      row.forEach((card, c)=>{
        if(card && typeof card === 'object') entries.push({card, z, r, c});
      });
    });
  });
  return entries;
}

function cardMatchesRef(card, ref){
  if(!card || !ref) return false;
  const iid = String(ref.iid || ref.cardIid || ref?.card?.iid || '');
  if(iid) return String(card.iid || '') === iid;
  const id = String(ref.id || ref.cardId || ref?.card?.id || '');
  return !!(id && String(card.id || '') === id);
}

function boardHasCardRef(state, ref){
  return boardEntries(state).some(entry=>cardMatchesRef(entry.card, ref));
}

function boardEntriesMatchingRef(state, ref){
  return boardEntries(state).filter(entry=>cardMatchesRef(entry.card, ref));
}

function boardEntryAt(state, z, r, c){
  return state && state.board && state.board[z] && state.board[z][r] ? state.board[z][r][c] || null : null;
}

function playerDiscardHasCardRef(state, playerIndex, ref){
  const discard = state && state.players && state.players[playerIndex] && state.players[playerIndex].discard;
  return Array.isArray(discard) && discard.some(card=>cardMatchesRef(card, ref));
}

function playerHandEntries(state, playerIndex){
  const hand = state && state.players && state.players[playerIndex] && state.players[playerIndex].hand;
  if(!Array.isArray(hand)) return [];
  return hand.map((card, index)=>({card, index})).filter(entry=>entry.card && typeof entry.card === 'object');
}

function isFaceDownAuthorityCard(card){
  return !!(card && (card.faceDown || card._faceDown || card.isFaceDown));
}

function rowOwnerForAuthority(r){
  if(r === 0) return 1;
  if(r === 1) return -1;
  if(r === 2) return 0;
  return 0;
}

function isBlockedAuthorityCell(state, z, r, c){
  const blocked = state && (state.blockedCells || state._blockedCells || state.blocked);
  if(!blocked) return false;
  const key = [z, r, c].join(':');
  if(Array.isArray(blocked)) {
    return blocked.some(item=>{
      if(Array.isArray(item)) return Number(item[0]) === z && Number(item[1]) === r && Number(item[2]) === c;
      return Number(item && item.z) === z && Number(item && item.r) === r && Number(item && item.c) === c;
    });
  }
  return !!blocked[key];
}

function authorityPlacementOptionsForCard(state, playerIndex, card){
  const options = [];
  const board = state && state.board;
  if(!Array.isArray(board)) return options;
  for(let z = 0; z < board.length; z += 1){
    const zone = board[z];
    if(!Array.isArray(zone)) continue;
    for(let r = 0; r < zone.length; r += 1){
      const owner = rowOwnerForAuthority(r);
      if(owner !== -1 && owner !== playerIndex) continue;
      if(card && card.contestedOnly && r !== 1) continue;
      const row = zone[r];
      if(!Array.isArray(row)) continue;
      for(let c = 0; c < row.length; c += 1){
        if(row[c] !== null && row[c] !== undefined) continue;
        if(isBlockedAuthorityCell(state, z, r, c)) continue;
        options.push({z, r, c});
      }
    }
  }
  return options;
}

function actionSourceRef(payload){
  const refs = [
    payload && payload.source,
    payload && payload.effectCinematic,
    payload && payload.pendingSource,
    payload && payload.card,
    payload && payload.selectedHand
  ];
  for(const ref of refs){
    if(!ref || typeof ref !== 'object') continue;
    const nested = ref.card && typeof ref.card === 'object' ? ref.card : ref;
    const iid = String(ref.iid || ref.cardIid || nested.iid || '');
    const id = String(ref.id || ref.cardId || nested.id || '');
    const z = Number(ref.z), r = Number(ref.r), c = Number(ref.c);
    if(iid || id || (Number.isInteger(z) && Number.isInteger(r) && Number.isInteger(c))){
      return {iid, id, z, r, c, card:nested};
    }
  }
  return null;
}

function sourceNameForReaction(payload){
  const ref = actionSourceRef(payload);
  return String(ref && ref.card && ref.card.name || ref && ref.name || payload && payload.sourceName || payload && payload.fn || 'that effect');
}

function findBoardEntryByRef(state, ref){
  if(!ref) return null;
  const z = Number(ref.z), r = Number(ref.r), c = Number(ref.c);
  if(Number.isInteger(z) && Number.isInteger(r) && Number.isInteger(c)){
    const card = boardEntryAt(state, z, r, c);
    if(card) return {card, z, r, c};
  }
  return boardEntries(state).find(entry=>cardMatchesRef(entry.card, ref)) || null;
}

function inferReactionActionType(msg){
  const type = String(msg && msg.type || '').toUpperCase();
  const payload = msg && msg.payload || {};
  const explicit = String(payload.reactionActionType || payload.effectCinematic && payload.effectCinematic.reactionActionType || '').trim();
  if(explicit) return explicit;
  const fn = String(payload.fn || '');
  if(fn === 'activatePendingWhenSetEffect') return 'when_set_effect';
  if(fn === 'triggerCharacterEffect'){
    const source = actionSourceRef(payload);
    const sourceType = String(source && source.card && source.card.type || '');
    if(sourceType === 'Initiator') return 'initiator_effect';
    if(sourceType === 'Supporter') return 'supporter_effect';
    return 'targeting_effect';
  }
  if(/^(activateVigilantes|activateExpeditionaryMove|activateLandscapeEventideMove|activateBusserMove|activateWodnyPotokYouth)$/i.test(fn)){
    return 'targeting_effect';
  }
  if(type === 'PLACE_CARD' || (type === 'CLICK_CELL' && (payload.placing || payload.selectedHand || Number.isInteger(Number(payload.handIndex))))) return 'first_set_effect';
  return '';
}

function actionCanArmImprovisorReaction(type, payload){
  if(payload && payload.skipImprovisorReaction) return false;
  if(payload && payload.postState && payload.postState._serverPendingReaction) return false;
  return /^(BOARD_ACTION|CLICK_CELL|PLACE_CARD|ACTION_RESULT|MODAL_ACTION|PICK_CARDS_VISUAL|PICK_ZONE|PICK_AFFILIATION)$/i.test(type);
}

function isAuthorityEffectImmuneSource(card){
  if(!card || card.faceDown === true) return false;
  const id = String(card.id || '');
  return id === '20' || id === '76' || id === 'bh01' || card.immuneFlag === true || card.opponentEffectImmune === true;
}

const AUTHORITY_SUPPORTER_AFFECTS_OPPONENT = new Set(['16','20','26','31','50','53','61','62','71','72','73','75','76','77','80','91']);
const AUTHORITY_SUPPORTER_AFFECTS_BOTH = new Set(['18']);
const AUTHORITY_CHARACTER_AFFECTS_OPPONENT = new Set(['03','04','14','30','39','52','bh25']);
const AUTHORITY_CHARACTER_AFFECTS_BOTH = new Set(['12','17','34','40']);
const AUTHORITY_HAVANO_REACTION_SOURCE_IDS = new Set([
  '04', // Zoe
  '10', // Post-Modernist Dylan
  '14', // Alondra Hopkins
  '16', // MINAE Death Squad
  '17', // Carolyn
  '18', // 1st US Marines
  '26', // UCPD
  '30', // Santiago
  '31', // Oathbound Noble Fighter
  '36', // Marie L'amboure
  '39', // Juan Carlos
  '50', // Berkeley CS Major
  '52', // The Vigilantes
  '53', // Colombo Thug
  '61', // Maria Song
  '62', // Berkeley Homeless
  '64', // Cook Islands Duelist
  '71', // Fort Calvin Watcher
  '72' // Robo en la Noche
]);
const CONSOLIDATION_LEFT_BEHIND_RECOGNITION_V2 = true;

function inferAuthorityReactionAffectedOwners(preState, sourceEntry, sourcePlayer, reactionPlayer, actionType, wasTargetingEffect){
  if(wasTargetingEffect) return [reactionPlayer];
  const card = sourceEntry && sourceEntry.card;
  if(!card) return [];
  const id = String(card.id || '');
  const type = String(card.type || '');
  if(type === 'Supporter' || /^supporter_effect$/i.test(actionType)){
    if(AUTHORITY_SUPPORTER_AFFECTS_BOTH.has(id)) return [0, 1];
    if(AUTHORITY_SUPPORTER_AFFECTS_OPPONENT.has(id)) return [reactionPlayer];
    return [];
  }
  if(type === 'Initiator' || /^(initiator_effect|when_set_effect)$/i.test(actionType)){
    if(AUTHORITY_CHARACTER_AFFECTS_BOTH.has(id)) return [0, 1];
    if(AUTHORITY_CHARACTER_AFFECTS_OPPONENT.has(id)) return [reactionPlayer];
  }
  return [];
}

function sourceRefFromEntry(entry){
  if(!entry || !entry.card) return null;
  return {
    iid:String(entry.card.iid || ''),
    id:String(entry.card.id || ''),
    z:Number(entry.z),
    r:Number(entry.r),
    c:Number(entry.c),
    card:entry.card
  };
}

function collectAuthorityImprovisorOptions(preState, msg, postState){
  const payload = msg && msg.payload || {};
  const sourcePlayer = Number(payload.playerIndex);
  if(!Number.isInteger(sourcePlayer) || sourcePlayer < 0 || sourcePlayer > 1) return null;
  const reactionPlayer = sourcePlayer === 0 ? 1 : 0;
  let actionType = inferReactionActionType(msg);
  if(!actionType) return null;
  const wasTargetingEffect = actionType === 'targeting_effect';
  const msgType = String(msg && msg.type || '').toUpperCase();
  const placementLike = msgType === 'PLACE_CARD' || (msgType === 'CLICK_CELL' && (payload.placing || payload.selectedHand || Number.isInteger(Number(payload.handIndex))));
  const placementZ = Number(payload.z), placementR = Number(payload.r), placementC = Number(payload.c);
  const placementSourceRef = placementLike && Number.isInteger(placementZ) && Number.isInteger(placementR) && Number.isInteger(placementC)
    ? {z:placementZ, r:placementR, c:placementC}
    : null;
  const payloadSourceRef = placementSourceRef || actionSourceRef(payload);
  const preSourceEntry = findBoardEntryByRef(preState, payloadSourceRef);
  const postSourceEntry = findBoardEntryByRef(postState, payloadSourceRef);
  const sourceEntry = preSourceEntry || postSourceEntry;
  const sourceRef = sourceRefFromEntry(sourceEntry) || payloadSourceRef;
  const sourceCard = sourceEntry && sourceEntry.card || sourceRef && sourceRef.card || sourceRef;
  const sourceId = String(sourceCard && sourceCard.id || sourceRef && sourceRef.id || '');
  if(isAuthorityEffectImmuneSource(sourceCard)) return null;
  if(actionType === 'targeting_effect' && sourceEntry && sourceEntry.card){
    if(String(sourceEntry.card.type || '') === 'Initiator') actionType = 'initiator_effect';
    else if(String(sourceEntry.card.type || '') === 'Supporter') actionType = 'supporter_effect';
  }
  if(actionType === 'when_set_effect' && sourceEntry && sourceEntry.card){
    if(String(sourceEntry.card.type || '') === 'Supporter') actionType = 'supporter_effect';
    else if(String(sourceEntry.card.type || '') === 'Initiator') actionType = 'initiator_effect';
  }
  const options = [];
  let affectedOwners = Array.isArray(payload.affectedOwners)
    ? payload.affectedOwners.map(Number).filter(Number.isInteger)
    : [];
  if(!affectedOwners.length){
    affectedOwners = inferAuthorityReactionAffectedOwners(preState, sourceEntry, sourcePlayer, reactionPlayer, actionType, wasTargetingEffect);
  }
  const havanoListedSource = AUTHORITY_HAVANO_REACTION_SOURCE_IDS.has(sourceId);
  const affectsReactor = affectedOwners.includes(reactionPlayer) || wasTargetingEffect || havanoListedSource;
  if(/^(supporter_effect|initiator_effect|when_set_effect|targeting_effect|first_set_effect)$/i.test(actionType)){
    boardEntries(preState).forEach(entry=>{
      const card = entry.card;
      if(!card || Number(card.owner) !== reactionPlayer || isFaceDownAuthorityCard(card)) return;
      if(String(card.id || '') === '56'){
        const usesLeft = card.usesLeft === null || card.usesLeft === undefined ? 3 : Number(card.usesLeft);
        if(usesLeft > 0 && !card.immuneFlag) {
          options.push({kind:'lydia', z:entry.z, r:entry.r, c:entry.c, card:cloneState(card)});
        }
      }
      if(String(card.id || '') === '67' && /^(supporter_effect|initiator_effect)$/i.test(actionType)){
        const usesLeft = card.usesLeft === null || card.usesLeft === undefined ? (card._seculesUsed ? 0 : 1) : Number(card.usesLeft);
        if(usesLeft > 0 && !card.immuneFlag) {
          options.push({kind:'secules', z:entry.z, r:entry.r, c:entry.c, card:cloneState(card)});
        }
      }
    });
  }
  if(affectsReactor && havanoListedSource){
    playerHandEntries(preState, reactionPlayer).forEach(entry=>{
      const card = entry.card;
      if(String(card.id || '') !== '79') return;
      const deploymentOptions = authorityPlacementOptionsForCard(preState, reactionPlayer, card);
      if(deploymentOptions.length){
        options.push({kind:'havano', handIndex:entry.index, card:cloneState(card), deploymentOptions});
      }
    });
  }
  if(!options.length) return null;
  return {
    kind:'reaction',
    playerIndex:reactionPlayer,
    sourcePlayerIndex:sourcePlayer,
    sourceName:String(sourceCard && sourceCard.name || sourceNameForReaction(payload)),
    source:sourceRef,
    actionType,
    timeoutMs:15000,
    options
  };
}

function maybeArmAuthorityImprovisorReaction(room, msg, postState){
  const type = String(msg && msg.type || '').toUpperCase();
  const payload = msg && msg.payload || {};
  const preState = room && room.canonicalState;
  if(!preState || preState._serverPendingReaction) return null;
  if(!actionCanArmImprovisorReaction(type, payload)) return null;
  const pendingBase = collectAuthorityImprovisorOptions(preState, msg, postState);
  if(!pendingBase) return null;
  const state = cloneState(preState);
  copySourceSpentFlagsFromResolved(state, postState, pendingBase);
  const seq = Number(state._serverReactionSeq || 0) + 1;
  state._serverReactionSeq = seq;
  state._serverPendingReaction = Object.assign({}, pendingBase, {
    promptId:['improvisor', Date.now().toString(36), seq.toString(36), onlineStableHash(payload.clientActionId || payload.stateHash || postState)].join(':'),
    resolvedPostState:cloneState(postState)
  });
  return state;
}

function collectConsolidationTributeRefs(payload){
  const refs = [];
  function add(ref){
    if(!ref || typeof ref !== 'object') return;
    const card = ref.card || {};
    refs.push({
      iid:String(ref.iid || ref.cardIid || card.iid || ''),
      id:String(ref.id || ref.cardId || card.id || ''),
      z:Number(ref.z),
      r:Number(ref.r),
      c:Number(ref.c),
      card
    });
  }
  (Array.isArray(payload.chosenTributes) ? payload.chosenTributes : []).forEach(add);
  const presentationEvents = Array.isArray(payload.presentationEvents) ? payload.presentationEvents : [];
  presentationEvents.forEach(event=>{
    if(String(event && event.type || '').toUpperCase() === 'CONSOLIDATION_COMPLETED'){
      (Array.isArray(event.tributes) ? event.tributes : []).forEach(add);
    }
  });
  const presentation = payload.consolidationPresentation || null;
  (Array.isArray(presentation && presentation.tributes) ? presentation.tributes : []).forEach(add);
  const seen = new Set();
  return refs.filter(ref=>{
    const key = ref.iid ? 'iid:' + ref.iid : ['slot', ref.id, ref.z, ref.r, ref.c].join(':');
    if(seen.has(key)) return false;
    seen.add(key);
    return !!(ref.iid || ref.id || (Number.isInteger(ref.z) && Number.isInteger(ref.r) && Number.isInteger(ref.c)));
  });
}

function validAuthoritySlot(z, r, c){
  return Number.isInteger(Number(z)) && Number.isInteger(Number(r)) && Number.isInteger(Number(c));
}

function sameAuthoritySlot(entry, z, r, c){
  return !!(entry && Number(entry.z) === Number(z) && Number(entry.r) === Number(r) && Number(entry.c) === Number(c));
}

function consolidationSourceEntry(preState, ref){
  if(!preState || !ref) return null;
  if(ref.iid){
    const exact = boardEntriesMatchingRef(preState, ref)[0] || null;
    if(exact) return exact;
  }
  if(validAuthoritySlot(ref.z, ref.r, ref.c)){
    const card = boardEntryAt(preState, Number(ref.z), Number(ref.r), Number(ref.c));
    if(!card) return null;
    if(ref.iid && String(card.iid || '') !== ref.iid) return null;
    if(ref.id && String(card.id || '') !== ref.id) return null;
    return {card, z:Number(ref.z), r:Number(ref.r), c:Number(ref.c)};
  }
  return null;
}

function consolidationPostStateLeftConsumedSupporter(room, payload, postState, ref){
  if(!CONSOLIDATION_LEFT_BEHIND_RECOGNITION_V2){
    return !!(ref.iid && boardHasCardRef(postState, ref));
  }
  const targetZ = Number(payload.z), targetR = Number(payload.r), targetC = Number(payload.c);
  const sameTarget = Number(ref.z) === targetZ && Number(ref.r) === targetR && Number(ref.c) === targetC;
  const source = consolidationSourceEntry(room && room.canonicalState, ref);
  if(ref.iid){
    if(!source) return false;
    return boardEntriesMatchingRef(postState, ref).some(entry=>{
      if(sameAuthoritySlot(entry, targetZ, targetR, targetC)) return true;
      if(sameAuthoritySlot(entry, source.z, source.r, source.c)) return true;
      return String(entry.card && entry.card.id || '') === String(source.card && source.card.id || '');
    });
  }
  if(!validAuthoritySlot(ref.z, ref.r, ref.c) || sameTarget) return false;
  const card = boardEntryAt(postState, Number(ref.z), Number(ref.r), Number(ref.c));
  if(!card) return false;
  const expectedId = String(ref.id || source?.card?.id || ref.card?.id || '');
  return expectedId ? String(card.id || '') === expectedId : !!source;
}

function validateConsolidationPostState(room, payload, postState){
  const refs = collectConsolidationTributeRefs(payload);
  if(!refs.length) return '';
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return 'consolidation requires playerIndex';
  const targetZ = Number(payload.z), targetR = Number(payload.r), targetC = Number(payload.c);
  const targetCard = Number.isInteger(targetZ) && Number.isInteger(targetR) && Number.isInteger(targetC)
    ? boardEntryAt(postState, targetZ, targetR, targetC)
    : null;
  if(!targetCard) return 'consolidation result card is missing from target square';
  for(const ref of refs){
    const sameTarget = Number(ref.z) === targetZ && Number(ref.r) === targetR && Number(ref.c) === targetC;
    if(ref.iid && String(targetCard.iid || '') === ref.iid) return 'consolidation target still contains a consumed supporter';
    if(consolidationPostStateLeftConsumedSupporter(room, payload, postState, ref)) return 'consolidation left a consumed supporter on the board';
    if(!CONSOLIDATION_LEFT_BEHIND_RECOGNITION_V2 && !ref.iid && Number.isInteger(ref.z) && Number.isInteger(ref.r) && Number.isInteger(ref.c) && !sameTarget && boardEntryAt(postState, ref.z, ref.r, ref.c)){
      return 'consolidation left a selected support square occupied';
    }
    if(ref.iid && !playerDiscardHasCardRef(postState, playerIndex, ref)){
      return 'consolidation did not move every consumed supporter to discard';
    }
  }
  return '';
}

function validatePlacementPostState(payload, postState){
  const selected = payload.selectedHand || payload.card || null;
  const z = Number(payload.z), r = Number(payload.r), c = Number(payload.c);
  if(!selected || !Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return '';
  const target = boardEntryAt(postState, z, r, c);
  if(!target || !cardMatchesRef(target, selected)) return 'PLACE_CARD result card is missing from target square';
  return '';
}

function validatePendingMovePostState(room, payload, postState){
  const pending = room && room.canonicalState && room.canonicalState._serverPendingMove;
  if(!pending || typeof pending !== 'object') return '';
  const z = Number(payload.z), r = Number(payload.r), c = Number(payload.c);
  if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return '';
  const movingRef = {iid:String(pending.movingIid || pending.sourceIid || '')};
  if(!movingRef.iid) return '';
  const target = boardEntryAt(postState, z, r, c);
  if(!target || !cardMatchesRef(target, movingRef)) return 'movement result card is missing from target square';
  const fromZ = Number(pending.fromZ), fromR = Number(pending.fromR), fromC = Number(pending.fromC);
  if(Number.isInteger(fromZ) && Number.isInteger(fromR) && Number.isInteger(fromC)){
    const source = boardEntryAt(postState, fromZ, fromR, fromC);
    if(source && cardMatchesRef(source, movingRef)) return 'movement left the moved card in its source square';
  }
  return '';
}

function validateActionSpecificPostState(room, msg, postState){
  const type = String(msg && msg.type || '').toUpperCase();
  const payload = msg && msg.payload || {};
  if(type === 'SELECT_CONSOLIDATION_TRIBUTE' || payload.consolidationPresentation || collectConsolidationTributeRefs(payload).length){
    return validateConsolidationPostState(room, payload, postState);
  }
  if(type === 'PLACE_CARD' || (type === 'CLICK_CELL' && payload.placing)){
    return validatePlacementPostState(payload, postState);
  }
  if(type === 'SELECT_PENDING_MOVE_CELL' || payload.pendingMove === true){
    return validatePendingMovePostState(room, payload, postState);
  }
  return '';
}

function reduceDisconnectTimeout(room, msg){
  const state = cloneState(room && room.canonicalState);
  if(!state) return {ok:false, reason:'DISCONNECT_TIMEOUT requires canonical state'};
  const payload = msg && msg.payload || {};
  const loserIndex = Number(payload.playerIndex);
  if(!Number.isInteger(loserIndex) || loserIndex < 0 || loserIndex > 1) return {ok:false, reason:'DISCONNECT_TIMEOUT requires playerIndex'};
  const winnerIndex = loserIndex === 0 ? 1 : 0;
  state.phase = 'ended';
  state.matchResult = {
    winnerIndex,
    loserIndex,
    isDraw:false,
    reason:'disconnect',
    endedAt:Number(payload.endedAt || 0) || Date.now()
  };
  const validationError = validateCanonicalState(state);
  if(validationError) return {ok:false, reason:validationError};
  return {ok:true, canonicalState:state, canonicalHash:canonicalStateHash(state), serverReduced:true};
}

function reduceChooseTurn(room, msg){
  const state = cloneState(room && room.canonicalState);
  if(!state) return {ok:false, reason:'CHOOSE_TURN requires canonical state'};
  const payload = msg && msg.payload || {};
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return {ok:false, reason:'CHOOSE_TURN requires playerIndex'};
  state.currentPlayer = payload.goFirst === false ? 1 - playerIndex : playerIndex;
  state.phase = 'main';
  const validationError = validateCanonicalState(state);
  if(validationError) return {ok:false, reason:validationError};
  return {ok:true, canonicalState:state, canonicalHash:canonicalStateHash(state), serverReduced:true};
}

function removePendingReaction(state){
  if(state) state._serverPendingReaction = null;
  return state;
}

function copySourceSpentFlagsFromResolved(baseState, resolvedState, pending){
  const source = pending && pending.source;
  const baseEntry = findBoardEntryByRef(baseState, source);
  const resolvedEntry = findBoardEntryByRef(resolvedState, source);
  if(!baseEntry || !resolvedEntry) return;
  [
    'effectUsedInitial',
    '_effectTurnLocked',
    'whenSetActivated'
  ].forEach(key=>{
    if(Object.prototype.hasOwnProperty.call(resolvedEntry.card, key)){
      baseEntry.card[key] = cloneState(resolvedEntry.card[key]);
    }
  });
  delete baseEntry.card._pendingWhenSetEffect;
  delete baseEntry.card._pendingWhenSetActivationInFlight;
  delete baseEntry.card._effectActivationInFlight;
}

function markAuthoritySourceNegated(state, pending, reactionKind){
  const sourceEntry = findBoardEntryByRef(state, pending && pending.source);
  if(!sourceEntry || !sourceEntry.card) return;
  sourceEntry.card._effectNegatedByReaction = true;
  if(String(sourceEntry.card.type || '') === 'Supporter') sourceEntry.card.whenSetActivated = true;
  if(String(sourceEntry.card.type || '') === 'Initiator') sourceEntry.card.effectUsedInitial = true;
  delete sourceEntry.card._pendingWhenSetEffect;
  delete sourceEntry.card._pendingWhenSetActivationInFlight;
  delete sourceEntry.card._effectActivationInFlight;
  if(reactionKind === 'lydia'){
    sourceEntry.card._lydiaSuppressed = true;
    return;
  }
  sourceEntry.card._reactionSuppressed = true;
}

function findReactionOption(pending, payload){
  const options = Array.isArray(pending && pending.options) ? pending.options : [];
  const idx = Number(payload && payload.optionIndex);
  if(Number.isInteger(idx) && options[idx]) return options[idx];
  const reaction = payload && payload.reaction;
  if(reaction && typeof reaction === 'object'){
    const kind = String(reaction.kind || '');
    const z = Number(reaction.z), r = Number(reaction.r), c = Number(reaction.c);
    return options.find(option=>{
      if(kind && String(option.kind || '') !== kind) return false;
      if(Number.isInteger(z) && Number(option.z) !== z) return false;
      if(Number.isInteger(r) && Number(option.r) !== r) return false;
      if(Number.isInteger(c) && Number(option.c) !== c) return false;
      return true;
    }) || null;
  }
  return options[0] || null;
}

function applyLydiaAuthorityReaction(state, option, pending){
  const entry = findBoardEntryByRef(state, option);
  if(!entry || !entry.card) return 'Lydia is no longer on the board';
  entry.card.usesLeft = Math.max(0, (entry.card.usesLeft === null || entry.card.usesLeft === undefined ? 3 : Number(entry.card.usesLeft) || 0) - 1);
  markAuthoritySourceNegated(state, pending, 'lydia');
  return '';
}

function applySeculesAuthorityReaction(state, option, pending){
  const entry = findBoardEntryByRef(state, option);
  if(!entry || !entry.card) return 'Mr. Secules is no longer on the board';
  entry.card.usesLeft = 0;
  entry.card._seculesUsed = true;
  markAuthoritySourceNegated(state, pending, 'secules');
  return '';
}

function applyHavanoAuthorityReaction(state, option, payload, pending){
  const playerIndex = Number(pending && pending.playerIndex);
  const player = state && state.players && state.players[playerIndex];
  if(!player || !Array.isArray(player.hand)) return 'Havano reaction player is invalid';
  const cardRef = option && option.card || option;
  const handIndex = player.hand.findIndex(card=>cardMatchesRef(card, cardRef));
  if(handIndex < 0) return 'Havano Citizen is no longer in hand';
  const deployment = payload && payload.deployment || null;
  const legal = (Array.isArray(option.deploymentOptions) ? option.deploymentOptions : []).some(target=>
    Number(target.z) === Number(deployment && deployment.z) &&
    Number(target.r) === Number(deployment && deployment.r) &&
    Number(target.c) === Number(deployment && deployment.c)
  );
  if(!legal) return 'Havano deployment target is invalid';
  const z = Number(deployment.z), r = Number(deployment.r), c = Number(deployment.c);
  if(boardEntryAt(state, z, r, c)) return 'Havano deployment target is occupied';
  const [card] = player.hand.splice(handIndex, 1);
  const inst = cloneState(card);
  inst.owner = playerIndex;
  inst.currentFate = Number(inst.currentFate ?? inst.fate ?? 0) || 0;
  state.board[z][r][c] = inst;
  markAuthoritySourceNegated(state, pending, 'havano');
  return '';
}

function reduceReactionChoice(room, msg){
  const current = cloneState(room && room.canonicalState);
  const pending = current && current._serverPendingReaction;
  if(!pending || typeof pending !== 'object') return {ok:false, reason:'no pending reaction'};
  const payload = msg && msg.payload || {};
  if(String(payload.promptId || '') !== String(pending.promptId || '')) return {ok:false, reason:'reaction prompt mismatch'};
  if(Number(payload.playerIndex) !== Number(pending.playerIndex)) return {ok:false, reason:'reaction player mismatch'};
  const choice = String(payload.choice || '').toLowerCase();
  if(choice === 'decline' || choice === 'allow' || choice === 'timeout'){
    const resolved = removePendingReaction(cloneState(pending.resolvedPostState));
    if(!resolved) return {ok:false, reason:'pending reaction missing stored resolution'};
    const validationError = validateCanonicalState(resolved);
    if(validationError) return {ok:false, reason:validationError};
    return {ok:true, canonicalState:resolved, canonicalHash:canonicalStateHash(resolved), serverReduced:true};
  }
  if(choice !== 'negate') return {ok:false, reason:'unknown reaction choice'};
  const option = findReactionOption(pending, payload);
  if(!option) return {ok:false, reason:'reaction option is missing'};
  const isFirstSetReaction = String(pending.actionType || '') === 'first_set_effect';
  const state = removePendingReaction(cloneState(isFirstSetReaction ? pending.resolvedPostState : current));
  if(!isFirstSetReaction) copySourceSpentFlagsFromResolved(state, pending.resolvedPostState, pending);
  let error = '';
  const kind = String(option.kind || '');
  if(kind === 'lydia') error = applyLydiaAuthorityReaction(state, option, pending);
  else if(kind === 'secules') error = applySeculesAuthorityReaction(state, option, pending);
  else if(kind === 'havano') error = applyHavanoAuthorityReaction(state, option, payload, pending);
  else error = 'unsupported reaction option';
  if(error) return {ok:false, reason:error};
  const validationError = validateCanonicalState(state);
  if(validationError) return {ok:false, reason:validationError};
  return {ok:true, canonicalState:state, canonicalHash:canonicalStateHash(state), serverReduced:true};
}

function reduceServerAction(room, msg, opts){
  const type = String(msg && msg.type || '').toUpperCase();
  if(type === 'STATE_SYNC' && !(msg && msg.payload && msg.payload.postState)){
    return {ok:false, reason:'STATE_SYNC requires postState in client-resolved authority'};
  }
  if(type === 'EFFECT_CINEMATIC'){
    const state = room && room.canonicalState;
    const hash = room && room.canonicalHash || (state ? canonicalStateHash(state) : '');
    return {ok:true, canonicalState:state, canonicalHash:hash};
  }
  if(type === 'FORFEIT'){
    const state = cloneState(room && room.canonicalState);
    if(!state) return {ok:false, reason:'FORFEIT requires an active canonical match state'};
    return {
      ok:true,
      canonicalState:state,
      canonicalHash:room && room.canonicalHash || canonicalStateHash(state),
      serverReduced:true
    };
  }
  if(type !== 'REACTION_CHOICE' && room && room.canonicalState && room.canonicalState._serverPendingReaction){
    const state = room.canonicalState;
    const hash = room.canonicalHash || canonicalStateHash(state);
    return {
      ok:false,
      reason:'pending reaction must resolve first',
      serverState:state,
      serverStateHash:hash
    };
  }
  if(type === 'REACTION_CHOICE'){
    return reduceReactionChoice(room, msg);
  }
  if(type === 'CHOOSE_TURN') return reduceChooseTurn(room, msg);
  if(type === 'DISCONNECT_TIMEOUT') return reduceDisconnectTimeout(room, msg);
  const result = validateProposedTransition(room, msg, opts || {});
  if(!result.ok) return result;
  const reactionState = maybeArmAuthorityImprovisorReaction(room, msg, result.canonicalState);
  if(reactionState){
    return {
      ok:true,
      canonicalState:reactionState,
      canonicalHash:canonicalStateHash(reactionState),
      baseStateHash:result.baseStateHash,
      serverReduced:true,
      reactionArmed:true
    };
  }
  return result;
}

module.exports = {
  onlineStableHash,
  canonicalStateHash,
  validateCanonicalState,
  validateProposedTransition,
  reduceServerAction
};
