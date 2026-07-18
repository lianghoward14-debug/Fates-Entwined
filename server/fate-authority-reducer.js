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
  if(Object.prototype.hasOwnProperty.call(state, 'usMarinesUses')){
    if(!Array.isArray(state.usMarinesUses) || state.usMarinesUses.length < 2) return 'usMarinesUses must be an array';
    for(let i = 0; i < 2; i += 1){
      const uses = Number(state.usMarinesUses[i]);
      if(!Number.isFinite(uses) || uses < 0 || uses > 3) return '1st US Marines uses must be between 0 and 3';
    }
  }
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
    const hasIdentity = !!String(ref.iid || ref.cardIid || ref.card && ref.card.iid || ref.id || ref.cardId || ref.card && ref.card.id || '');
    if(card && (!hasIdentity || cardMatchesRef(card, ref))) return {card, z, r, c};
  }
  return boardEntries(state).find(entry=>cardMatchesRef(entry.card, ref)) || null;
}

function effectiveAuthorityActionType(msg){
  const rawType = String(msg && msg.type || '').toUpperCase();
  const actionKind = String(msg && msg.payload && msg.payload.actionKind || '').toUpperCase();
  return rawType === 'ACTION_RESULT' && actionKind ? actionKind : rawType;
}

function inferReactionActionType(msg){
  const type = effectiveAuthorityActionType(msg);
  const payload = msg && msg.payload || {};
  if(payload.deckSetAction === true && type === 'HAND_ACTION') return 'set_from_deck_effect';
  if(type === 'PLACE_CARD' || type === 'SELECT_CONSOLIDATION_TRIBUTE' || (type === 'CLICK_CELL' && (payload.placing || payload.selectedHand || Number.isInteger(Number(payload.handIndex))))) return 'first_set_effect';
  return '';
}

function actionCanArmImprovisorReaction(type, payload){
  if(payload && payload.skipImprovisorReaction) return false;
  if(payload && payload.postState && payload.postState._serverPendingReaction) return false;
  return /^(CLICK_CELL|PLACE_CARD|SELECT_CONSOLIDATION_TRIBUTE|HAND_ACTION|ACTION_RESULT)$/i.test(type);
}

function isAuthorityEffectImmuneSource(card){
  if(!card) return false;
  if(card.faceDown === true || card._faceDown === true || card.isFaceDown === true) return true;
  const id = String(card.id || '');
  return id === '20' || id === '70' || id === '76' || id === 'bh01' || card.immuneFlag === true || card.opponentEffectImmune === true;
}

const AUTHORITY_SUPPORTER_AFFECTS_OPPONENT = new Set(['16','20','26','31','50','53','61','62','71','72','73','75','76','77','80','91','97']);
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
  '21', // Henry Dong
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
  '72', // Robo en la Noche
  '97' // Visegrad Politician
]);
const AUTHORITY_SECULES_WHEN_SET_IDS = new Set([
  '02','03','04','05','06','07','08','12','13','14','16','17','18','21','22','25','26','27','29','30','31','32','33','34','35','37','38','39','40','42','43','45','46','48','50','51','52','54','56','58','60','61','62','66','68','69','71','72','73','75','76','77','80','84','91','94','96','97','bh01','bh25'
]);
const AUTHORITY_ONGOING_FIRST_SET_EFFECT_IDS = new Set([
  '10','14','21','36','53','62','64',
  '33','40','47','54','68','69','71','73','78','91','94'
]);
const CONSOLIDATION_LEFT_BEHIND_RECOGNITION_V2 = true;

function authorityFirstSetOptionEligible(kind, sourceCard){
  if(!sourceCard || isAuthorityEffectImmuneSource(sourceCard)) return false;
  if(sourceCard._skipOnlinePlacementImprovisorReactionOnce || sourceCard._skipOnlinePlacementImprovisorReactionPromptId) return false;
  const id = String(sourceCard.id || '');
  const type = String(sourceCard.type || '');
  if(kind === 'lydia') return !!id;
  if(kind === 'secules'){
    return type === 'Initiator' || (type === 'Supporter' && AUTHORITY_SECULES_WHEN_SET_IDS.has(id));
  }
  if(kind === 'havano') return AUTHORITY_HAVANO_REACTION_SOURCE_IDS.has(id);
  return false;
}

function authorityReactionResolutionMode(sourceCard, actionType){
  if(String(actionType || '') === 'set_from_deck_effect') return 'negated';
  if(!sourceCard) return 'negated';
  const id = String(sourceCard.id || '');
  const type = String(sourceCard.type || '');
  if(type === 'Coordinator' || AUTHORITY_ONGOING_FIRST_SET_EFFECT_IDS.has(id)) return 'suppressed';
  return 'negated';
}

function authorityConsolidationSourceRef(payload, postState){
  const presentation = payload && payload.consolidationPresentation || {};
  const target = presentation && presentation.target || {};
  const z = Number(target.z), r = Number(target.r), c = Number(target.c);
  if(Number.isInteger(z) && Number.isInteger(r) && Number.isInteger(c)){
    const targetEntry = findBoardEntryByRef(postState, {z, r, c});
    if(targetEntry) return sourceRefFromEntry(targetEntry);
  }
  const resultRef = presentation.resultCard || payload && payload.selectedHand || null;
  const resultEntry = findBoardEntryByRef(postState, resultRef);
  return sourceRefFromEntry(resultEntry) || (resultRef ? actionSourceRef({card:resultRef}) : null);
}

function inferAuthorityReactionAffectedOwners(sourceEntry, reactionPlayer){
  const card = sourceEntry && sourceEntry.card;
  if(!card) return [];
  const id = String(card.id || '');
  const type = String(card.type || '');
  if(type === 'Supporter'){
    if(AUTHORITY_SUPPORTER_AFFECTS_BOTH.has(id)) return [0, 1];
    if(AUTHORITY_SUPPORTER_AFFECTS_OPPONENT.has(id)) return [reactionPlayer];
    return [];
  }
  if(type === 'Initiator'){
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
  const msgType = effectiveAuthorityActionType(msg);
  const placementLike = msgType === 'PLACE_CARD' || msgType === 'SELECT_CONSOLIDATION_TRIBUTE' || (msgType === 'CLICK_CELL' && (payload.placing || payload.selectedHand || Number.isInteger(Number(payload.handIndex))));
  const placementZ = Number(payload.z), placementR = Number(payload.r), placementC = Number(payload.c);
  const placementSourceRef = msgType === 'SELECT_CONSOLIDATION_TRIBUTE'
    ? authorityConsolidationSourceRef(payload, postState)
    : (placementLike && Number.isInteger(placementZ) && Number.isInteger(placementR) && Number.isInteger(placementC)
      ? {z:placementZ, r:placementR, c:placementC}
      : null);
  const payloadSourceRef = placementSourceRef || actionSourceRef(payload);
  const postSourceEntry = findBoardEntryByRef(postState, payloadSourceRef);
  const preSourceEntry = findBoardEntryByRef(preState, payloadSourceRef);
  const sourceEntry = placementLike ? (postSourceEntry || preSourceEntry) : (preSourceEntry || postSourceEntry);
  const sourceRef = sourceRefFromEntry(sourceEntry) || payloadSourceRef;
  const sourceCard = sourceEntry && sourceEntry.card || sourceRef && sourceRef.card || sourceRef;
  const sourceId = String(sourceCard && sourceCard.id || sourceRef && sourceRef.id || '');
  if(isAuthorityEffectImmuneSource(sourceCard)) return null;
  if(sourceCard && (sourceCard._skipOnlinePlacementImprovisorReactionOnce || sourceCard._skipOnlinePlacementImprovisorReactionPromptId)) return null;
  const options = [];
  let affectedOwners = Array.isArray(payload.affectedOwners)
    ? payload.affectedOwners.map(Number).filter(Number.isInteger)
    : [];
  if(!affectedOwners.length){
    affectedOwners = inferAuthorityReactionAffectedOwners(sourceEntry, reactionPlayer);
  }
  const havanoListedSource = AUTHORITY_HAVANO_REACTION_SOURCE_IDS.has(sourceId);
  const affectsReactor = affectedOwners.includes(reactionPlayer) || havanoListedSource;
  const firstSetReaction = actionType === 'first_set_effect';
  const deckSetReaction = actionType === 'set_from_deck_effect';
  if(firstSetReaction || deckSetReaction){
    boardEntries(preState).forEach(entry=>{
      const card = entry.card;
      if(!card || Number(card.owner) !== reactionPlayer || isFaceDownAuthorityCard(card)) return;
      if(String(card.id || '') === '56' && (deckSetReaction || authorityFirstSetOptionEligible('lydia', sourceCard))){
        const usesLeft = card.usesLeft === null || card.usesLeft === undefined ? 3 : Number(card.usesLeft);
        if(usesLeft > 0 && !card.immuneFlag) {
          options.push({kind:'lydia', z:entry.z, r:entry.r, c:entry.c, card:cloneState(card)});
        }
      }
      const seculesAction = firstSetReaction && authorityFirstSetOptionEligible('secules', sourceCard);
      if(String(card.id || '') === '67' && seculesAction){
        const usesLeft = card.usesLeft === null || card.usesLeft === undefined ? (card._seculesUsed ? 0 : 1) : Number(card.usesLeft);
        if(usesLeft > 0 && !card.immuneFlag) {
          options.push({kind:'secules', z:entry.z, r:entry.r, c:entry.c, card:cloneState(card)});
        }
      }
    });
  }
  if(firstSetReaction && affectsReactor && havanoListedSource && authorityFirstSetOptionEligible('havano', sourceCard)){
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
    resolutionMode:authorityReactionResolutionMode(sourceCard, actionType),
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
  const firstSetReaction = String(pendingBase.actionType || '') === 'first_set_effect';
  const state = cloneState(firstSetReaction ? postState : preState);
  if(!firstSetReaction) copySourceSpentFlagsFromResolved(state, postState, pendingBase);
  const seq = Number(state._serverReactionSeq || 0) + 1;
  state._serverReactionSeq = seq;
  state._serverPendingReaction = Object.assign({}, pendingBase, {
    promptId:['improvisor', Date.now().toString(36), seq.toString(36), onlineStableHash(payload.clientActionId || payload.stateHash || postState)].join(':'),
    openedAt:Date.now(),
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
  const declaredTarget = payload && payload.consolidationPresentation && payload.consolidationPresentation.target || payload || {};
  const targetZ = Number(declaredTarget.z), targetR = Number(declaredTarget.r), targetC = Number(declaredTarget.c);
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
  const declaredTarget = payload && payload.consolidationPresentation && payload.consolidationPresentation.target || payload || {};
  const targetZ = Number(declaredTarget.z), targetR = Number(declaredTarget.r), targetC = Number(declaredTarget.c);
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
  if(String(selected.id || target.id || '') === '07'){
    const playerIndex = Number.isInteger(Number(payload.playerIndex))
      ? Number(payload.playerIndex)
      : (Number.isInteger(Number(target.owner)) ? Number(target.owner) : null);
    const safeRow = playerIndex === 0 ? 2 : (playerIndex === 1 ? 0 : null);
    if(safeRow === null || r !== safeRow) return 'Maja Kaminska can only be placed in her owner safe row';
  }
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

function normalizeAuthorityUsMarinesUses(state){
  const uses = Array.isArray(state && state.usMarinesUses) ? state.usMarinesUses : [0, 0];
  return [
    Math.max(0, Number(uses[0]) || 0),
    Math.max(0, Number(uses[1]) || 0)
  ];
}

function validateUsMarinesUsesTransition(room, postState){
  const baseState = room && room.canonicalState;
  if(!baseState || !postState) return '';
  const before = normalizeAuthorityUsMarinesUses(baseState);
  const after = normalizeAuthorityUsMarinesUses(postState);
  for(let i = 0; i < 2; i += 1){
    if(after[i] > 3) return '1st US Marines cannot be activated more than three times per game';
    if(after[i] < before[i]) return '1st US Marines uses cannot decrease during a match';
    if(after[i] - before[i] > 1) return '1st US Marines can only spend one activation at a time';
    if(before[i] >= 3 && after[i] > before[i]) return '1st US Marines has no activations remaining';
  }
  return '';
}

function isBoardEffectActivation(payload){
  const fn = String(payload && payload.fn || '');
  return /^(triggerCharacterEffect|activatePendingWhenSetEffect)$/i.test(fn);
}

function isSpentBoardEffectSource(fn, card){
  if(!card) return false;
  if(String(fn || '') === 'activatePendingWhenSetEffect'){
    return card.whenSetActivated === true || card.effectUsedInitial === true;
  }
  if(String(fn || '') === 'triggerCharacterEffect'){
    if(String(card.id || '') === '21') return card.effectUsedInitial === true || (Array.isArray(card._henrySuppressionSquares) && card._henrySuppressionSquares.length > 0);
    return String(card.type || '') === 'Initiator' && card.effectUsedInitial === true && card._effectTurnLocked === true;
  }
  return false;
}

function validateBoardEffectActivationPostState(room, payload, postState){
  if(!isBoardEffectActivation(payload)) return '';
  const fn = String(payload.fn || '');
  const sourceRef = actionSourceRef(payload);
  const baseEntry = findBoardEntryByRef(room && room.canonicalState, sourceRef);
  if(baseEntry && isSpentBoardEffectSource(fn, baseEntry.card)){
    return 'effect already activated';
  }
  const postEntry = findBoardEntryByRef(postState, sourceRef);
  if(!postEntry) return '';
  if(String(fn) === 'activatePendingWhenSetEffect'){
    if(postEntry.card._pendingWhenSetEffect) return 'when-set effect still pending after activation';
    if(postEntry.card.whenSetActivated !== true && postEntry.card.effectUsedInitial !== true){
      return 'when-set activation did not mark the source spent';
    }
  }
  if(String(fn) === 'triggerCharacterEffect' && String(postEntry.card.type || '') === 'Initiator'){
    if(postEntry.card.effectUsedInitial !== true) return 'initiator activation did not mark the source spent';
  }
  return '';
}

function validateActionSpecificPostState(room, msg, postState){
  const type = effectiveAuthorityActionType(msg);
  const payload = msg && msg.payload || {};
  const timedLandscapeErr = validateTimedLandscapeTransition(room && room.canonicalState, postState);
  if(timedLandscapeErr) return timedLandscapeErr;
  const usMarinesErr = validateUsMarinesUsesTransition(room, postState);
  if(usMarinesErr) return usMarinesErr;
  if(type === 'SELECT_CONSOLIDATION_TRIBUTE' || payload.consolidationPresentation || collectConsolidationTributeRefs(payload).length){
    return validateConsolidationPostState(room, payload, postState);
  }
  if(type === 'PLACE_CARD' || (type === 'CLICK_CELL' && payload.placing)){
    return validatePlacementPostState(payload, postState);
  }
  if(type === 'SELECT_PENDING_MOVE_CELL' || payload.pendingMove === true){
    return validatePendingMovePostState(room, payload, postState);
  }
  if(type === 'BOARD_ACTION'){
    return validateBoardEffectActivationPostState(room, payload, postState);
  }
  return '';
}

function validateTimedLandscapeTransition(preState, postState){
  if(!preState || !postState) return '';
  const currentId = String(preState.landscapeId || '');
  const targetId = String(postState.landscapeId || '');
  if(!currentId || !targetId || currentId === targetId) return '';
  const resolutionTurns = {igb2:14, igb8:10};
  const turn = Math.max(1, Number(preState.turn) || 1);
  const currentResolutionTurn = Number(resolutionTurns[currentId]) || 0;
  const targetResolutionTurn = Number(resolutionTurns[targetId]) || 0;
  const resolvedTurns = preState._landscapeState && preState._landscapeState.resolvedTurns || {};
  if(currentResolutionTurn && !resolvedTurns[currentId] && turn >= currentResolutionTurn - 4){
    return 'timed landscape cannot be changed away from during its final four turns';
  }
  if(targetResolutionTurn && turn >= targetResolutionTurn - 4){
    return 'timed landscape cannot be entered during its final four turns';
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

function applyAuthorityReactionTimerPause(state, pending){
  if(!state || !pending) return state;
  const openedAt = Number(pending.openedAt);
  const turnStartedAt = Number(state._turnStartedAt);
  if(!Number.isFinite(openedAt) || !Number.isFinite(turnStartedAt)) return state;
  const timeoutMs = Math.max(0, Number(pending.timeoutMs || 15000) || 15000);
  const pauseMs = Math.min(timeoutMs + 2000, Math.max(0, Date.now() - openedAt));
  state._turnStartedAt = turnStartedAt + pauseMs;
  return state;
}

function markAuthorityPlacementReactionAllowed(state, pending){
  if(String(pending && pending.actionType || '') !== 'first_set_effect') return;
  const sourceEntry = findBoardEntryByRef(state, pending && pending.source);
  if(!sourceEntry || !sourceEntry.card) return;
  sourceEntry.card._onlinePlacementReactionAllowPromptId = String(pending.promptId || '');
}

function findAuthorityPlayerPileCard(state, playerIndex, pileName, ref){
  const pile = state && state.players && state.players[playerIndex] && state.players[playerIndex][pileName];
  if(!Array.isArray(pile)) return null;
  return pile.find(card=>cardMatchesRef(card, ref)) || null;
}

function markAuthorityDeckSetReactionAllowed(state, pending){
  if(String(pending && pending.actionType || '') !== 'set_from_deck_effect') return;
  const sourcePlayer = Number(pending.sourcePlayerIndex);
  const card = findAuthorityPlayerPileCard(state, sourcePlayer, 'hand', pending.source);
  if(card) card._skipOnlinePlacementImprovisorReactionPromptId = String(pending.promptId || '');
}

function applyAuthorityDeckSetNegation(state, pending){
  if(String(pending && pending.actionType || '') !== 'set_from_deck_effect') return;
  const sourcePlayer = Number(pending.sourcePlayerIndex);
  const card = findAuthorityPlayerPileCard(state, sourcePlayer, 'deck', pending.source);
  if(card) card._deckSetNegatedByReaction = true;
  const resolved = pending && pending.resolvedPostState;
  if(Array.isArray(resolved && resolved.polishArmyUses)) state.polishArmyUses = cloneState(resolved.polishArmyUses);
  if(Array.isArray(resolved && resolved.usMarinesUses)) state.usMarinesUses = cloneState(resolved.usMarinesUses);
  if(resolved && Object.prototype.hasOwnProperty.call(resolved, '_polishUsedThisTurn')){
    state._polishUsedThisTurn = !!resolved._polishUsedThisTurn;
  }
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
  if(Array.isArray(resolvedState && resolvedState.usMarinesUses)){
    baseState.usMarinesUses = cloneState(resolvedState.usMarinesUses);
  }
}

function markAuthoritySourceNegated(state, pending, reactionKind){
  const sourceEntry = findBoardEntryByRef(state, pending && pending.source);
  if(!sourceEntry || !sourceEntry.card) return;
  const resolutionMode = String(pending && pending.resolutionMode || 'negated');
  delete sourceEntry.card._effectNegatedByReaction;
  delete sourceEntry.card._effectSuppressedByReaction;
  delete sourceEntry.card._lydiaSuppressed;
  delete sourceEntry.card._reactionSuppressed;
  if(resolutionMode === 'suppressed'){
    sourceEntry.card._effectSuppressedByReaction = true;
    if(reactionKind === 'lydia') sourceEntry.card._lydiaSuppressed = true;
    else sourceEntry.card._reactionSuppressed = true;
  }else{
    sourceEntry.card._effectNegatedByReaction = true;
  }
  if(String(sourceEntry.card.type || '') === 'Supporter') sourceEntry.card.whenSetActivated = true;
  if(String(sourceEntry.card.type || '') === 'Initiator') sourceEntry.card.effectUsedInitial = true;
  delete sourceEntry.card._pendingWhenSetEffect;
  delete sourceEntry.card._pendingWhenSetActivationInFlight;
  delete sourceEntry.card._effectActivationInFlight;
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
    const resolved = cloneState(pending.resolvedPostState);
    if(!resolved) return {ok:false, reason:'pending reaction missing stored resolution'};
    applyAuthorityReactionTimerPause(resolved, pending);
    removePendingReaction(resolved);
    markAuthorityPlacementReactionAllowed(resolved, pending);
    markAuthorityDeckSetReactionAllowed(resolved, pending);
    const validationError = validateCanonicalState(resolved);
    if(validationError) return {ok:false, reason:validationError};
    return {ok:true, canonicalState:resolved, canonicalHash:canonicalStateHash(resolved), serverReduced:true};
  }
  if(choice !== 'negate') return {ok:false, reason:'unknown reaction choice'};
  const option = findReactionOption(pending, payload);
  if(!option) return {ok:false, reason:'reaction option is missing'};
  const isFirstSetReaction = String(pending.actionType || '') === 'first_set_effect';
  const isDeckSetReaction = String(pending.actionType || '') === 'set_from_deck_effect';
  const state = cloneState(isFirstSetReaction ? pending.resolvedPostState : current);
  applyAuthorityReactionTimerPause(state, pending);
  removePendingReaction(state);
  if(isDeckSetReaction) applyAuthorityDeckSetNegation(state, pending);
  else if(!isFirstSetReaction) copySourceSpentFlagsFromResolved(state, pending.resolvedPostState, pending);
  let error = '';
  const kind = String(option.kind || '');
  if(kind === 'lydia') error = applyLydiaAuthorityReaction(state, option, pending);
  else if(kind === 'secules') error = applySeculesAuthorityReaction(state, option, pending);
  else if(kind === 'havano') error = applyHavanoAuthorityReaction(state, option, payload, pending);
  else error = 'unsupported reaction option';
  if(error) return {ok:false, reason:error};
  const validationError = validateCanonicalState(state);
  if(validationError) return {ok:false, reason:validationError};
  return {
    ok:true,
    canonicalState:state,
    canonicalHash:canonicalStateHash(state),
    serverReduced:true,
    reactionResolution:{
      mode:String(pending.resolutionMode || 'negated'),
      kind,
      sourceName:String(pending.sourceName || 'that effect'),
      source:cloneState(pending.source)
    }
  };
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
