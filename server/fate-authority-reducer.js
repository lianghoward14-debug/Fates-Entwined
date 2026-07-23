'use strict';

const FateEffectRuleMetadata = require('../src/scripts/02-effect-rule-metadata.js');

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
  for(const key of ['_wojciechTurnPlacementCounts','_wojciechLastTurnPlacementCounts']){
    if(!Object.prototype.hasOwnProperty.call(state, key)) continue;
    if(!Array.isArray(state[key]) || state[key].length < 2) return `${key} must be an array`;
    for(let i = 0; i < 2; i += 1){
      const count = Number(state[key][i]);
      if(!Number.isFinite(count) || count < 0 || count > 120) return `${key} contains an invalid count`;
    }
  }
  if(Object.prototype.hasOwnProperty.call(state, '_whisperLandscapeUses')){
    if(!Array.isArray(state._whisperLandscapeUses) || state._whisperLandscapeUses.length < 2) return '_whisperLandscapeUses must be an array';
    for(let i = 0; i < 2; i += 1){
      const uses = Number(state._whisperLandscapeUses[i]);
      if(!Number.isFinite(uses) || uses < 0 || uses > 1) return 'Concrete Roads can only be used once per player';
    }
  }
  if(!Number.isInteger(Number(state.currentPlayer))) return 'currentPlayer must be numeric';
  if(String(state.phase || '').length > 80) return 'phase is invalid';
  return '';
}

function validateProposedTransition(room, msg, options){
  const payload = msg && msg.payload || {};
  const postState = payload.postState;
  const rejection = reason=>({
    ok:false,
    reason,
    serverStateHash:String(room && room.canonicalHash || ''),
    serverState:room && room.canonicalState || null
  });
  if(!postState) return rejection('client-resolved action requires postState');
  const validationError = validateCanonicalState(postState);
  if(validationError) return rejection(validationError);
  const actionValidationError = validateActionSpecificPostState(room, msg, postState);
  if(actionValidationError) return rejection(actionValidationError);
  const computedHash = canonicalStateHash(postState);
  const providedHash = String(payload.stateHash || '');
  if(providedHash && providedHash !== computedHash){
    return Object.assign(rejection('stateHash does not match postState'), {canonicalHash:computedHash});
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

function playerPileCardMatchingRef(state, playerIndex, pileName, ref){
  const pile = state && state.players && state.players[playerIndex] && state.players[playerIndex][pileName];
  return Array.isArray(pile) ? pile.find(card=>cardMatchesRef(card, ref)) || null : null;
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
      return Number(item && item.z) === z && Number(item && item.r) === r && Number(item && item.c) === c && String(item && item.type || 'carolyn') !== 'zoe';
    });
  }
  return !!blocked[key];
}

function authorityConsolidationBlockedAt(state, z, r, c, playerIndex){
  const blocked = state && (state.blockedCells || state._blockedCells || state.blocked);
  if(!blocked) return false;
  const matchesPlayer = item=>{
    if(!item || Array.isArray(item)) return true;
    if(String(item.type || 'carolyn') !== 'zoe') return true;
    if(typeof item.blockedPlayer === 'number' && Number.isInteger(item.blockedPlayer)) return item.blockedPlayer === Number(playerIndex);
    if(typeof item.owner === 'number' && Number.isInteger(item.owner)) return item.owner !== Number(playerIndex);
    return true;
  };
  if(Array.isArray(blocked)) {
    return blocked.some(item=>{
      const matchesCell = Array.isArray(item)
        ? Number(item[0]) === z && Number(item[1]) === r && Number(item[2]) === c
        : Number(item && item.z) === z && Number(item && item.r) === r && Number(item && item.c) === c;
      return matchesCell && matchesPlayer(item);
    });
  }
  return !!blocked[[z, r, c].join(':')];
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
  if(type === 'BOARD_ACTION'){
    const declared = String(payload.reactionActionType || '');
    if(/^(?:supporter_effect|initiator_effect)$/i.test(declared)) return declared.toLowerCase();
    const activationClass = FateEffectRuleMetadata.boardActivationClass(payload.fn);
    if(activationClass) return activationClass;
  }
  return '';
}

function actionCanArmImprovisorReaction(type, payload){
  if(payload && payload.skipImprovisorReaction) return false;
  if(payload && payload.postState && payload.postState._serverPendingReaction) return false;
  return /^(CLICK_CELL|PLACE_CARD|SELECT_CONSOLIDATION_TRIBUTE|HAND_ACTION|BOARD_ACTION|PICK_CARDS_VISUAL|RESOLVE_CARD_PICK|ACTION_RESULT)$/i.test(type);
}

function isAuthorityEffectImmuneSource(card){
  if(!card) return false;
  if(card.faceDown === true || card._faceDown === true || card.isFaceDown === true) return true;
  const id = String(card.id || '');
  return id === '20' || id === '70' || id === '76' || id === 'bh01' || card.immuneFlag === true || card.opponentEffectImmune === true;
}

function isAuthorityFullyEffectImmuneCard(card){
  if(!card) return false;
  const id = String(card.id || '');
  return id === '76'
    || id === 'bh01'
    || id === 'token1'
    || card.pierogiCounter === true
    || card.immuneFlag === true
    || card.opponentEffectImmune === true;
}

const AUTHORITY_SUPPORTER_AFFECTS_OPPONENT = new Set(['16','20','26','31','50','53','61','62','71','72','73','75','76','77','80','91','97']);
const AUTHORITY_SUPPORTER_AFFECTS_BOTH = new Set(['18']);
const AUTHORITY_CHARACTER_AFFECTS_OPPONENT = new Set(['03','04','14','30','39','52','61','bh25']);
const AUTHORITY_CHARACTER_AFFECTS_BOTH = new Set(['12','17','34','40']);
const AUTHORITY_SECULES_WHEN_SET_IDS = new Set([
  '02','03','04','05','06','07','08','12','13','14','16','17','18','21','22','25','26','27','29','30','31','32','33','34','35','37','38','39','40','42','43','45','46','48','50','51','52','54','56','58','60','61','62','66','68','69','71','72','73','75','76','77','80','84','91','94','96','97','bh25'
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
  if(kind === 'havano') return FateEffectRuleMetadata.canTriggerHavano(id);
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

function inferAuthorityReactionAffectedOwners(sourceEntry, reactionPlayer, sourceIdOverride, sourceTypeOverride){
  const card = sourceEntry && sourceEntry.card;
  if(!card) return [];
  const id = String(sourceIdOverride || card.id || '');
  const type = String(sourceTypeOverride || card.type || '');
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
  const transactionalEffect = /^(?:supporter_effect|initiator_effect)$/i.test(actionType);
  const sourceId = String(
    transactionalEffect && payload.effectSourceId ||
    sourceCard && sourceCard.id ||
    sourceRef && sourceRef.id ||
    ''
  );
  const sourceType = String(sourceCard && sourceCard.type || payload.effectSourceType || '');
  const effectRuleType = String(transactionalEffect && payload.effectRuleType || sourceType);
  const manualEffectReaction = transactionalEffect;
  if(isAuthorityEffectImmuneSource(sourceCard)) return null;
  if(sourceCard && (sourceCard._skipOnlinePlacementImprovisorReactionOnce || sourceCard._skipOnlinePlacementImprovisorReactionPromptId)) return null;
  const options = [];
  let affectedOwners = Array.isArray(payload.affectedOwners)
    ? payload.affectedOwners.map(Number).filter(Number.isInteger)
    : [];
  if(!affectedOwners.length){
    affectedOwners = inferAuthorityReactionAffectedOwners(sourceEntry, reactionPlayer, sourceId, effectRuleType);
  }
  const havanoListedSource = FateEffectRuleMetadata.canTriggerHavano(sourceId);
  const affectsReactor = affectedOwners.includes(reactionPlayer) || havanoListedSource;
  const firstSetReaction = actionType === 'first_set_effect';
  const deckSetReaction = actionType === 'set_from_deck_effect';
  if(firstSetReaction || deckSetReaction || manualEffectReaction){
    boardEntries(preState).forEach(entry=>{
      const card = entry.card;
      if(!card || Number(card.owner) !== reactionPlayer || isFaceDownAuthorityCard(card)) return;
      if(String(card.id || '') === '56' && (deckSetReaction || authorityFirstSetOptionEligible('lydia', sourceCard))){
        const usesLeft = card.usesLeft === null || card.usesLeft === undefined ? 3 : Number(card.usesLeft);
        if(usesLeft > 0 && !card.immuneFlag) {
          options.push({kind:'lydia', z:entry.z, r:entry.r, c:entry.c, card:cloneState(card)});
        }
      }
      const seculesAction = (firstSetReaction || manualEffectReaction) && authorityFirstSetOptionEligible('secules', Object.assign({}, sourceCard, {id:sourceId}));
      if(String(card.id || '') === '67' && seculesAction){
        const usesLeft = card.usesLeft === null || card.usesLeft === undefined ? (card._seculesUsed ? 0 : 1) : Number(card.usesLeft);
        if(usesLeft > 0 && !card.immuneFlag) {
          options.push({kind:'secules', z:entry.z, r:entry.r, c:entry.c, card:cloneState(card)});
        }
      }
    });
  }
  if((firstSetReaction || manualEffectReaction) && affectsReactor && havanoListedSource && authorityFirstSetOptionEligible('havano', Object.assign({}, sourceCard, {id:sourceId}))){
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

function authorityCardActsAsPassive(card, sourceId){
  if(!card) return false;
  const wanted = String(sourceId || '');
  const id = String(card.id || '');
  const copiedPassiveId = String(card._copiedPassiveId || card.copiedPassiveId || '');
  const isFrenchCopyShell = id === '37'
    || (id === 'bh05' && String(card._bh05CopiedPassiveId || '') === '37')
    || (id === '75' && String(card._ledgerCopiedSourceId || '') === '37');
  return id === wanted
    || (isFrenchCopyShell && copiedPassiveId === wanted)
    || (id === 'bh05' && String(card._bh05CopiedPassiveId || '') === wanted)
    || (id === '75' && String(card._ledgerCopiedSourceId || '') === wanted);
}

function authorityCardIsReadyBoleslaw(card, owner){
  if(!card || !authorityCardActsAsPassive(card, '86') || Number(card.owner) !== Number(owner)) return false;
  if(isFaceDownAuthorityCard(card)) return false;
  return !(card._effectNegatedByReaction || card._effectSuppressedByReaction || card._reactionSuppressed || card._lydiaSuppressed || card._lumberjackSuppressed);
}

function authorityCardEffectIsSuppressed(card){
  return !!(card && (card._effectNegatedByReaction || card._effectSuppressedByReaction || card._reactionSuppressed || card._lydiaSuppressed || card._lumberjackSuppressed));
}

function authorityZsofiaSetSources(state, owner, z){
  const entries = boardEntries(state);
  return entries.filter(entry=>{
    const card = entry.card;
    if(!card || Number(card.owner) !== owner || isFaceDownAuthorityCard(card) || authorityCardEffectIsSuppressed(card)) return false;
    if(String(card.id || '') === '15') return Number(entry.z) === Number(z);
    return String(card._whisperCopiedEffectId || '') === '15';
  });
}

function authorityZsofiaSetPotency(state, source){
  if(!state || !source || !source.card) return 1;
  if(String(source.card.type || '') !== 'Coordinator') return 1;
  const owner = Number(source.card.owner);
  const entries = boardEntries(state);
  const whisperJeremiah = entries.filter(entry=>
    Number(entry.card && entry.card.owner) === owner &&
    String(entry.card && entry.card._whisperCopiedEffectId || '') === '57' &&
    !isFaceDownAuthorityCard(entry.card) &&
    !authorityCardEffectIsSuppressed(entry.card)
  ).length;
  const localJeremiah = entries.filter(entry=>
    Number(entry.z) === Number(source.z) &&
    Number(entry.card && entry.card.owner) === owner &&
    authorityCardActsAsPassive(entry.card, '57') &&
    !isFaceDownAuthorityCard(entry.card) &&
    !authorityCardEffectIsSuppressed(entry.card)
  ).length;
  return 1 + whisperJeremiah + localJeremiah;
}

function appendAuthorityCardEffectFlash(presentationEvents, state, source, target, kind, label, soundKey){
  if(!Array.isArray(presentationEvents) || !target || !target.card) return false;
  const sourceKey = String(source && source.card && (source.card.iid || source.card.id) || 'source');
  const targetKey = String(target.card.iid || target.card.id || [target.z, target.r, target.c].join('-'));
  presentationEvents.push({
    type:'CARD_EFFECT_FLASH',
    eventId:['authority-card-effect', Number(state && state.turn) || 0, sourceKey, targetKey, kind, presentationEvents.length].join(':'),
    playerIndex:Number(source && source.card && source.card.owner),
    target:{
      z:Number(target.z),
      r:Number(target.r),
      c:Number(target.c),
      iid:String(target.card.iid || ''),
      cardId:String(target.card.id || '')
    },
    kind:String(kind || ''),
    label:String(label || kind || 'card effect'),
    duration:3500,
    pitchStep:0,
    waitForConsolidationCinematic:false,
    localActorAlreadyPresented:false,
    soundKey:String(soundKey || '')
  });
  return true;
}

function applyAuthorityPermanentFateGain(card, amount){
  if(!card || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return 0;
  const gain = Number(amount);
  const before = Math.max(0, Number(card.currentFate ?? card.fate) || 0);
  card.currentFate = before + gain;
  if(Number.isFinite(Number(card._permanentFateCeiling))){
    card._permanentFateCeiling = Math.max(0, Number(card._permanentFateCeiling) || 0) + gain;
  }
  return card.currentFate - before;
}

function validateAuthorityZsofiaCoordinatorSetTrigger(preState, postState, playerIndex, placedEntry){
  const placedCard = placedEntry && placedEntry.card;
  if(!preState || !postState || !placedCard || String(placedCard.type || '') !== 'Coordinator' || isFaceDownAuthorityCard(placedCard)) return '';
  const owner = Number(placedCard.owner);
  if(owner !== Number(playerIndex) || (owner !== 0 && owner !== 1)) return '';
  const sources = authorityZsofiaSetSources(postState, owner, Number(placedEntry.z));
  if(!sources.length) return '';
  const beforeEntries = boardEntries(preState).filter(entry=>entry.card && Number(entry.card.owner) === owner);
  for(const before of beforeEntries){
    const after = findBoardEntryByRef(postState, before.card);
    if(!after || !after.card) continue;
    let required = 0;
    sources.forEach(source=>{
      const fieldWide = String(source.card && source.card._whisperCopiedEffectId || '') === '15';
      if(fieldWide || Number(after.z) === Number(source.z)) required += authorityZsofiaSetPotency(postState, source);
    });
    if(required <= 0) continue;
    const beforeFate = Number(before.card.currentFate ?? before.card.fate) || 0;
    const afterFate = Number(after.card.currentFate ?? after.card.fate) || 0;
    if(afterFate < beforeFate + required) return 'Blue Danube Waltz must apply when a Coordinator is set in Zsofia\'s zone';
  }
  return '';
}

function applyAuthorityJoieDrawEffectPassive(state, playerIndex, sourceCard, presentationEvents){
  if(!state || !Array.isArray(state.board) || (playerIndex !== 0 && playerIndex !== 1)) return 0;
  const entries = boardEntries(state);
  const whisperJeremiah = entries.filter(entry=>
    Number(entry.card && entry.card.owner) === playerIndex &&
    String(entry.card && entry.card._whisperCopiedEffectId || '') === '57' &&
    !isFaceDownAuthorityCard(entry.card) &&
    !authorityCardEffectIsSuppressed(entry.card)
  ).length;
  const sources = entries.filter(entry=>{
    const card = entry.card;
    if(!card || Number(card.owner) !== playerIndex || isFaceDownAuthorityCard(card) || authorityCardEffectIsSuppressed(card)) return false;
    return authorityCardActsAsPassive(card, 'bh02') || String(card._whisperCopiedEffectId || '') === 'bh02';
  });
  if(!sources.length) return 0;
  const eventKey = ['joie-authority', playerIndex, Number(state.turn) || 0, String(sourceCard && (sourceCard.iid || sourceCard.id) || 'draw')].join(':');
  let total = 0;
  sources.forEach(source=>{
    source.card._joieProcCount = Math.max(0, Math.floor(Number(source.card._joieProcCount) || 0)) + 1;
    const fieldWide = String(source.card._whisperCopiedEffectId || '') === 'bh02';
    const localJeremiah = String(source.card.type || '') === 'Coordinator'
      ? entries.filter(entry=>
        entry.z === source.z &&
        Number(entry.card && entry.card.owner) === playerIndex &&
        authorityCardActsAsPassive(entry.card, '57') &&
        !isFaceDownAuthorityCard(entry.card) &&
        !authorityCardEffectIsSuppressed(entry.card)
      ).length
      : 0;
    const amount = 1 + (String(source.card.type || '') === 'Coordinator' ? whisperJeremiah : 0) + localJeremiah;
    entries.forEach(target=>{
      if(!target.card || Number(target.card.owner) !== playerIndex || (!fieldWide && target.z !== source.z)) return;
      if(isAuthorityFullyEffectImmuneCard(target.card)) return;
      const gained = applyAuthorityPermanentFateGain(target.card, amount);
      if(gained <= 0) return;
      appendAuthorityCardEffectFlash(presentationEvents, state, source, target, 'joie_thousand_reel', 'Thousand Reel Stare', eventKey);
      total += gained;
    });
  });
  return total;
}

function applyAuthorityMajaMischievousActivities(state, playerIndex, presentationEvents){
  if(!state || !Array.isArray(state.board) || (playerIndex !== 0 && playerIndex !== 1)) return 0;
  const entries = boardEntries(state);
  const whisperJeremiah = entries.filter(entry=>
    Number(entry.card && entry.card.owner) === playerIndex &&
    String(entry.card && entry.card._whisperCopiedEffectId || '') === '57' &&
    !isFaceDownAuthorityCard(entry.card) &&
    !authorityCardEffectIsSuppressed(entry.card)
  ).length;
  const sources = entries.filter(entry=>{
    const card = entry.card;
    return card && Number(card.owner) === playerIndex && (authorityCardActsAsPassive(card, 'bh08') || String(card._whisperCopiedEffectId || '') === 'bh08') &&
      !isFaceDownAuthorityCard(card) && !authorityCardEffectIsSuppressed(card);
  });
  if(!sources.length) return 0;
  const eventKey = ['bh08-authority', playerIndex, Number(state.turn) || 0, Number(state._serverReactionSeq || 0)].join(':');
  let total = 0;
  sources.forEach(source=>{
    source.card._bh08ProcCount = Math.max(0, Math.floor(Number(source.card._bh08ProcCount) || 0)) + 1;
    const localJeremiah = String(source.card.type || '') === 'Coordinator'
      ? entries.filter(entry=>
        entry.z === source.z && Number(entry.card && entry.card.owner) === playerIndex &&
        authorityCardActsAsPassive(entry.card, '57') && !isFaceDownAuthorityCard(entry.card) &&
        !authorityCardEffectIsSuppressed(entry.card)
      ).length
      : 0;
    const amount = 2 + (String(source.card.type || '') === 'Coordinator' ? whisperJeremiah : 0) + localJeremiah;
    const fieldWide = String(source.card && source.card._whisperCopiedEffectId || '') === 'bh08';
    entries.forEach(target=>{
      if(!target.card || Number(target.card.owner) !== playerIndex || (!fieldWide && target.z !== source.z) || isAuthorityFullyEffectImmuneCard(target.card)) return;
      const gained = applyAuthorityPermanentFateGain(target.card, amount);
      if(gained <= 0) return;
      appendAuthorityCardEffectFlash(presentationEvents, state, source, target, 'bh08_mischief', 'Mischievous Activities', eventKey);
      total += gained;
    });
  });
  return total;
}

function resolveAuthorityBoleslawSearch(preState, msg, postState){
  const payload = msg && msg.payload || {};
  const type = effectiveAuthorityActionType(msg);
  const transactionalSearch = type === 'BOARD_ACTION' && Number(payload.effectTransactionVersion) === 1;
  if(type !== 'RESOLVE_CARD_PICK' && type !== 'PICK_CARDS_VISUAL' && !transactionalSearch) return null;
  if(payload.opponentSearch !== true) return null;
  if(payload.searchCompleted === false) return null;
  const searchingPlayer = Number(payload.playerIndex);
  if(!Number.isInteger(searchingPlayer) || searchingPlayer < 0 || searchingPlayer > 1) return null;
  const sourceId = String(payload.searchSourceCardId || '');
  if(!sourceId) return null;
  const beforeHand = playerHandEntries(preState, searchingPlayer);
  const afterHand = playerHandEntries(postState, searchingPlayer);
  const beforeIids = new Set(beforeHand.map(entry=>String(entry.card && entry.card.iid || '')));
  const addedToHand = afterHand.filter(entry=>!beforeIids.has(String(entry.card && entry.card.iid || '')));
  const selectedIids = Array.isArray(payload.searchedCardIids) ? payload.searchedCardIids.map(String).filter(Boolean) : [];
  const selectedWasAdded = selectedIids.length
    ? selectedIids.some(iid=>addedToHand.some(entry=>String(entry.card && entry.card.iid || '') === iid))
    : addedToHand.length > 0;
  if(!selectedWasAdded) return null;
  const sourceEntry = boardEntries(preState).find(entry=>
    Number(entry.card && entry.card.owner) === searchingPlayer && authorityCardActsAsPassive(entry.card, sourceId)
  ) || boardEntries(postState).find(entry=>
    Number(entry.card && entry.card.owner) === searchingPlayer && authorityCardActsAsPassive(entry.card, sourceId)
  ) || null;
  if(!sourceEntry || isFaceDownAuthorityCard(sourceEntry.card)) return null;
  const boleslawOwner = 1 - searchingPlayer;
  const boleslaws = boardEntries(postState)
    .filter(entry=>authorityCardIsReadyBoleslaw(entry.card, boleslawOwner));
  if(!boleslaws.length) return null;

  const resolvedState = cloneState(postState);
  const resolvedPresentationEvents = [];
  boleslaws.forEach(entry=>{
    applyBoleslawSearchAuthorityReaction(resolvedState, entry, {playerIndex:boleslawOwner}, resolvedPresentationEvents);
  });

  const lydiaOptions = boardEntries(postState).filter(entry=>{
    const card = entry.card;
    if(!card || String(card.id || '') !== '56' || Number(card.owner) !== searchingPlayer) return false;
    if(isFaceDownAuthorityCard(card) || card.immuneFlag) return false;
    const usesLeft = card.usesLeft === null || card.usesLeft === undefined ? 3 : Number(card.usesLeft);
    return usesLeft > 0;
  }).map(entry=>({kind:'lydia', z:entry.z, r:entry.r, c:entry.c, card:cloneState(entry.card)}));
  if(!lydiaOptions.length) return {
    state:resolvedState,
    pendingBase:null,
    resolvedPostState:resolvedState,
    presentationEvents:resolvedPresentationEvents
  };

  // Other copies trigger automatically; Lydia's single reaction window is against the first ready Boleslaw.
  const baseState = cloneState(postState);
  const negatedPresentationEvents = [];
  boleslaws.slice(1).forEach(entry=>{
    applyBoleslawSearchAuthorityReaction(baseState, entry, {playerIndex:boleslawOwner}, negatedPresentationEvents);
  });
  const boleslawSource = boleslaws[0];
  return {
    state:baseState,
    resolvedPostState:resolvedState,
    pendingBase:{
      kind:'reaction',
      playerIndex:searchingPlayer,
      sourcePlayerIndex:boleslawOwner,
      sourceName:String(boleslawSource.card.name || 'Boleslaw Kopewicz'),
      source:sourceRefFromEntry(boleslawSource),
      resolutionMode:'suppressed',
      actionType:'boleslaw_trigger',
      timeoutMs:15000,
      options:lydiaOptions,
      allowedPresentationEvents:resolvedPresentationEvents,
      negatedPresentationEvents
    }
  };
}

function maybeArmAuthorityImprovisorReaction(room, msg, postState){
  const type = String(msg && msg.type || '').toUpperCase();
  const payload = msg && msg.payload || {};
  const preState = room && room.canonicalState;
  if(!preState || preState._serverPendingReaction) return null;
  if(!actionCanArmImprovisorReaction(type, payload)) return null;
  const boleslawResolution = resolveAuthorityBoleslawSearch(preState, msg, postState);
  if(boleslawResolution && !boleslawResolution.pendingBase) {
    return {
      state:boleslawResolution.state,
      presentationEvents:Array.isArray(boleslawResolution.presentationEvents) ? boleslawResolution.presentationEvents : []
    };
  }
  const pendingBase = boleslawResolution && boleslawResolution.pendingBase
    ? boleslawResolution.pendingBase
    : collectAuthorityImprovisorOptions(preState, msg, postState);
  if(!pendingBase) return null;
  const firstSetReaction = String(pendingBase.actionType || '') === 'first_set_effect';
  const manualEffectReaction = /^(?:supporter_effect|initiator_effect)$/i.test(String(pendingBase.actionType || ''));
  const state = cloneState(boleslawResolution ? boleslawResolution.state : ((firstSetReaction || manualEffectReaction) ? postState : preState));
  if(!firstSetReaction && !manualEffectReaction && !boleslawResolution) copySourceSpentFlagsFromResolved(state, postState, pendingBase);
  const seq = Number(state._serverReactionSeq || 0) + 1;
  state._serverReactionSeq = seq;
  const pending = Object.assign({}, pendingBase, {
    promptId:['improvisor', Date.now().toString(36), seq.toString(36), onlineStableHash(payload.clientActionId || payload.stateHash || postState)].join(':'),
    openedAt:Date.now()
  });
  if(manualEffectReaction){
    pending.preEffectState = cloneState(preState);
  }else{
    pending.resolvedPostState = cloneState(boleslawResolution ? boleslawResolution.resolvedPostState : postState);
  }
  const clientPresentationEvents = Array.isArray(payload.presentationEvents) ? cloneState(payload.presentationEvents) : [];
  const allowedAuthorityEvents = Array.isArray(pending.allowedPresentationEvents) ? cloneState(pending.allowedPresentationEvents) : [];
  const negatedAuthorityEvents = Array.isArray(pending.negatedPresentationEvents) ? cloneState(pending.negatedPresentationEvents) : [];
  pending.presentationEvents = clientPresentationEvents.concat(allowedAuthorityEvents);
  // Client-captured overlays describe the effect being challenged. If Lydia
  // negates that effect, only overlays produced by the reaction itself survive.
  pending.negatedPresentationEvents = negatedAuthorityEvents;
  delete pending.allowedPresentationEvents;
  state._serverPendingReaction = pending;
  return {state, presentationEvents:[]};
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

function consolidationConsumedCardReachedLegalDestination(preState, postState, playerIndex, ref){
  if(playerDiscardHasCardRef(postState, playerIndex, ref)) return true;
  const source = consolidationSourceEntry(preState, ref);
  const sourceCard = source && source.card;
  if(!sourceCard) return false;

  if(String(sourceCard.id || '') === '70'){
    const infiltrating = playerPileCardMatchingRef(postState, 1 - playerIndex, 'hand', ref);
    if(infiltrating
      && infiltrating.guerilla_transferred === true
      && Number(infiltrating.guerilla_owner) === playerIndex){
      return true;
    }
  }

  if(sourceCard._stolenByRobo){
    const originalOwner = Number(sourceCard._roboOrigOwner);
    if((originalOwner === 0 || originalOwner === 1)
      && playerPileCardMatchingRef(postState, originalOwner, 'discard', ref)){
      return true;
    }
  }
  return false;
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

function authorityBlameGameActive(state, owner){
  const effects = state && Array.isArray(state._blameGameEffects) ? state._blameGameEffects : [];
  const effect = effects[owner];
  return !!(effect && effect.active && (Number(effect.turnsLeft) || 0) > 0);
}

function authorityCardIsCharacterForRules(state, card, owner){
  if(!card) return false;
  if(card.pierogiCounter === true || String(card.id || '') === 'token1' || String(card.type || '') === 'Counter') return false;
  if(String(card.type || '') !== 'Supporter') return true;
  return authorityBlameGameActive(state, owner);
}

function validateConsolidationPostState(room, payload, postState){
  const refs = collectConsolidationTributeRefs(payload);
  if(!refs.length) return '';
  const playerIndex = Number(payload.playerIndex);
  if(!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return 'consolidation requires playerIndex';
  const preState = room && room.canonicalState;
  const declaredTarget = payload && payload.consolidationPresentation && payload.consolidationPresentation.target || payload || {};
  const targetZ = Number(declaredTarget.z), targetR = Number(declaredTarget.r), targetC = Number(declaredTarget.c);
  if(authorityConsolidationBlockedAt(preState, targetZ, targetR, targetC, playerIndex)) {
    return 'consolidation cannot be placed onto a square blocked by Zoe or Carolyn';
  }
  const targetCard = Number.isInteger(targetZ) && Number.isInteger(targetR) && Number.isInteger(targetC)
    ? boardEntryAt(postState, targetZ, targetR, targetC)
    : null;
  if(!targetCard) return 'consolidation result card is missing from target square';
  const resultUsesCharacterTributes = String(targetCard.id || '') === '99' || String(targetCard.id || '') === '100';
  for(const ref of refs){
    if(authorityConsolidationBlockedAt(preState, Number(ref.z), Number(ref.r), Number(ref.c), playerIndex)) {
      return 'consolidation cannot use a card from a square blocked by Zoe or Carolyn';
    }
    if(resultUsesCharacterTributes){
      const source = consolidationSourceEntry(preState, ref);
      if(!source || Number(source.card && source.card.owner) !== playerIndex) return '99 and 100 require the player\'s own Character tributes';
      if(!authorityCardIsCharacterForRules(room && room.canonicalState, source.card, playerIndex)) return '99 and 100 can only consume Character tributes';
    }
    const sameTarget = Number(ref.z) === targetZ && Number(ref.r) === targetR && Number(ref.c) === targetC;
    if(ref.iid && String(targetCard.iid || '') === ref.iid) return 'consolidation target still contains a consumed supporter';
    if(consolidationPostStateLeftConsumedSupporter(room, payload, postState, ref)) return 'consolidation left a consumed supporter on the board';
    if(!CONSOLIDATION_LEFT_BEHIND_RECOGNITION_V2 && !ref.iid && Number.isInteger(ref.z) && Number.isInteger(ref.r) && Number.isInteger(ref.c) && !sameTarget && boardEntryAt(postState, ref.z, ref.r, ref.c)){
      return 'consolidation left a selected support square occupied';
    }
    if(ref.iid && !consolidationConsumedCardReachedLegalDestination(preState, postState, playerIndex, ref)){
      return 'consolidation did not move every consumed supporter to discard or its required destination';
    }
  }
  const zsofiaErr = validateAuthorityZsofiaCoordinatorSetTrigger(preState, postState, playerIndex, {z:targetZ, r:targetR, c:targetC, card:targetCard});
  if(zsofiaErr) return zsofiaErr;
  return '';
}

function authorityPierogiPlacementSquareAllowed(state, z, r, c, playerIndex){
  if(!state || !Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) return false;
  const row = state.board && state.board[z] && state.board[z][r];
  if(!Array.isArray(row) || c < 0 || c >= row.length || row[c] !== null) return false;
  const host = 1 - playerIndex;
  if(r === 1) return true;
  if(r === 0 || r === 2) return (r === 0 ? 1 : 0) === host;
  if(r < 3) return false;
  const rawCanonicalOwner = state.extraRowOwners && state.extraRowOwners[z] && state.extraRowOwners[z][r - 3];
  const canonicalOwner = Number(rawCanonicalOwner);
  if(rawCanonicalOwner !== null && rawCanonicalOwner !== undefined && Number.isInteger(canonicalOwner)) return canonicalOwner === host;
  const markSquare = Array.isArray(state.markSafeSquares) && state.markSafeSquares.some(square=>square
    && Number(square.z) === z && Number(square.r) === r && Number(square.c) === c && Number(square.owner) === host);
  if(markSquare) return true;
  const rowHasMarkSquares = Array.isArray(state.markSafeSquares) && state.markSafeSquares.some(square=>square
    && Number(square.z) === z && Number(square.r) === r);
  const rawLegacyOwner = r === 3 && state.extraRowFullOwners && state.extraRowFullOwners[z];
  const legacyOwner = Number(rawLegacyOwner);
  return !rowHasMarkSquares && rawLegacyOwner !== null && rawLegacyOwner !== undefined && Number.isInteger(legacyOwner) && legacyOwner === host;
}

function validatePlacementPostState(room, payload, postState){
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
  if(String(selected.id || target.id || '') === 'token1'){
    const playerIndex = Number(payload.playerIndex);
    if(!authorityPierogiPlacementSquareAllowed(room && room.canonicalState, z, r, c, playerIndex)) return 'Pierogi Counters can only be placed in a contested or opponent-owned square';
    if(Number(target.owner) !== (1 - playerIndex)) return 'Pierogi Counter field ownership must belong to the opponent';
    if(target.pierogiCounter !== true || target.immuneFlag !== true || Number(target._pierogiTurnsRemaining) !== 3) return 'Pierogi Counter placement state is invalid';
  }
  if(String(selected.id || target.id || '') === 'whisper17'){
    const copiedId = String(target._whisperCopiedEffectId || selected._whisperCopiedEffectId || '');
    if(Number(target.owner) !== Number(payload.playerIndex)) return 'Shizuku Token field ownership must belong to the acting player';
    if(target.whisperLandscapeToken !== true || target.type !== 'Coordinator' || Number(target.currentFate ?? target.fate) !== 5) return 'Shizuku Token placement state is invalid';
    if(!/^(?:10|11|15|19|23|57|77|bh02|bh07|bh08)$/.test(copiedId)) return 'Shizuku Token copied an invalid Coordinator effect';
  }
  const zsofiaErr = validateAuthorityZsofiaCoordinatorSetTrigger(room && room.canonicalState, postState, Number(payload.playerIndex), {z, r, c, card:target});
  if(zsofiaErr) return zsofiaErr;
  return '';
}

function authorityCardIdentity(card){
  if(!card) return '';
  const iid = String(card.iid == null ? '' : card.iid);
  return iid ? `iid:${iid}` : `id:${String(card.id || '')}`;
}

function authorityCardSequenceMatches(actual, expected){
  if(!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) return false;
  return actual.every((card, index)=>authorityCardIdentity(card) === authorityCardIdentity(expected[index]));
}

function authorityAnickaVoyagerMoveOptions(state, source){
  const options = [];
  if(!state || !source) return options;
  (state.board || []).forEach((zone, z)=>{
    (zone || []).forEach((row, r)=>{
      (row || []).forEach((card, c)=>{
        if(card !== null && card !== undefined) return;
        if(isBlockedAuthorityCell(state, z, r, c)) return;
        options.push({z, r, c});
      });
    });
  });
  return options;
}

function authorityMoveOptionsMatch(actual, expected){
  if(!Array.isArray(actual) || actual.length !== expected.length) return false;
  const keys = new Set(actual.map(option=>`${Number(option && option.z)}:${Number(option && option.r)}:${Number(option && option.c)}`));
  return expected.every(option=>keys.has(`${option.z}:${option.r}:${option.c}`));
}

function validateAnickaVoyagerMovePostState(room, payload, postState){
  const preState = room && room.canonicalState;
  const pending = preState && preState._bh01Moving;
  if(!pending || String(pending.kind || '') !== 'anickaVoyagerMove') return '';
  const playerIndex = Number(payload.playerIndex);
  if(playerIndex !== Number(preState.currentPlayer) || playerIndex !== Number(pending.playerIndex)) return 'Brave Horizons move belongs to the active player';
  if(Number(postState.currentPlayer) !== Number(preState.currentPlayer) || Number(postState.turn) !== Number(preState.turn)) return 'Brave Horizons cannot advance the turn';
  const fromZ = Number(pending.fromZ), fromR = Number(pending.fromR), fromC = Number(pending.fromC);
  const z = Number(payload.z), r = Number(payload.r), c = Number(payload.c);
  if(![fromZ, fromR, fromC, z, r, c].every(Number.isInteger)) return 'Brave Horizons move coordinates are invalid';
  const source = boardEntryAt(preState, fromZ, fromR, fromC);
  if(!source || String(source.id || '') !== 'bh01' || Number(source.owner) !== playerIndex) return 'Brave Horizons source is missing or uncontrolled';
  if(String(pending.sourceIid || '') && String(source.iid || '') !== String(pending.sourceIid)) return 'Brave Horizons source identity changed';
  if(source.bh01MovedThisTurn === true || Number(source._braveHorizonsLastMoveTurn) === Number(preState.turn)) return 'Brave Horizons was already used this turn';
  const legalOptions = authorityAnickaVoyagerMoveOptions(preState, source);
  if(!legalOptions.some(option=>option.z === z && option.r === r && option.c === c)) return 'Brave Horizons target is not an open square';
  if(Array.isArray(pending.options) && !authorityMoveOptionsMatch(pending.options, legalOptions)) return 'Brave Horizons move options are stale';
  const moved = boardEntryAt(postState, z, r, c);
  if(!moved || !cardMatchesRef(moved, source)) return 'Brave Horizons result card is missing from target square';
  if(Number(moved.owner) !== playerIndex || moved.bh01MovedThisTurn !== true || Number(moved._braveHorizonsLastMoveTurn) !== Number(preState.turn)) return 'Brave Horizons result did not record its once-per-turn use';
  if(Number(moved.currentFate ?? moved.fate) !== Number(source.currentFate ?? source.fate)) return 'Brave Horizons cannot change Ani\u010dka\'s Fate';
  const oldSquare = boardEntryAt(postState, fromZ, fromR, fromC);
  if(oldSquare && cardMatchesRef(oldSquare, source)) return 'Brave Horizons left Ani\u010dka in her source square';
  if(postState._bh01Moving) return 'Brave Horizons move remained pending after resolution';
  if(postState.placing) return 'Brave Horizons left placement mode active';

  const preBoard = preState.board || [];
  const postBoard = postState.board || [];
  if(preBoard.length !== postBoard.length) return 'Brave Horizons cannot resize the board';
  for(let bz = 0; bz < preBoard.length; bz += 1){
    if(!Array.isArray(preBoard[bz]) || !Array.isArray(postBoard[bz]) || preBoard[bz].length !== postBoard[bz].length) return 'Brave Horizons cannot resize board zones';
    for(let br = 0; br < preBoard[bz].length; br += 1){
      if(!Array.isArray(preBoard[bz][br]) || !Array.isArray(postBoard[bz][br]) || preBoard[bz][br].length !== postBoard[bz][br].length) return 'Brave Horizons cannot resize board rows';
      for(let bc = 0; bc < preBoard[bz][br].length; bc += 1){
        if(bz === fromZ && br === fromR && bc === fromC){
          if(postBoard[bz][br][bc] !== null) return 'Brave Horizons source square must become empty';
          continue;
        }
        if(bz === z && br === r && bc === c) continue;
        if(authorityCardIdentity(preBoard[bz][br][bc]) !== authorityCardIdentity(postBoard[bz][br][bc])) return 'Brave Horizons moved an unrelated board card';
      }
    }
  }

  const beforePlayer = preState.players && preState.players[playerIndex];
  const afterPlayer = postState.players && postState.players[playerIndex];
  if(!beforePlayer || !afterPlayer) return 'Brave Horizons player state is invalid';
  if(!authorityCardSequenceMatches(afterPlayer.discard || [], beforePlayer.discard || [])) return 'Brave Horizons cannot change the discard pile';
  const beforeDeck = beforePlayer.deck || [];
  const beforeHand = beforePlayer.hand || [];
  const drewOne = beforeDeck.length > 0
    && authorityCardSequenceMatches(afterPlayer.deck || [], beforeDeck.slice(1))
    && authorityCardSequenceMatches(afterPlayer.hand || [], beforeHand.concat([beforeDeck[0]]));
  const emptyDeckNoDraw = beforeDeck.length === 0
    && authorityCardSequenceMatches(afterPlayer.deck || [], beforeDeck)
    && authorityCardSequenceMatches(afterPlayer.hand || [], beforeHand);
  if(!drewOne && !emptyDeckNoDraw) return 'Brave Horizons must automatically draw exactly the top card of the deck';
  const other = 1 - playerIndex;
  for(const pile of ['deck','hand','discard']){
    if(!authorityCardSequenceMatches(postState.players?.[other]?.[pile] || [], preState.players?.[other]?.[pile] || [])) return 'Brave Horizons changed the opponent\'s cards';
  }
  return '';
}

function validatePendingMovePostState(room, payload, postState){
  const anickaError = validateAnickaVoyagerMovePostState(room, payload, postState);
  if(anickaError) return anickaError;
  if(room && room.canonicalState && room.canonicalState._bh01Moving) return '';
  const pending = room && room.canonicalState && room.canonicalState._serverPendingMove;
  if(!pending || typeof pending !== 'object') return '';
  const z = Number(payload.z), r = Number(payload.r), c = Number(payload.c);
  if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return '';
  const movingRef = {iid:String(pending.movingIid || pending.sourceIid || '')};
  if(!movingRef.iid) return '';
  const preMoveEntry = findBoardEntryByRef(room && room.canonicalState, movingRef);
  if(preMoveEntry && isAuthorityFullyEffectImmuneCard(preMoveEntry.card)) return 'Fully immune cards cannot be moved by Panacea or another landscape effect';
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

function validateWhisperLandscapeUsesTransition(room, msg, postState){
  const baseState = room && room.canonicalState;
  if(!baseState || !postState) return '';
  const before = Array.isArray(baseState._whisperLandscapeUses) ? baseState._whisperLandscapeUses : [0, 0];
  const after = Array.isArray(postState._whisperLandscapeUses) ? postState._whisperLandscapeUses : [0, 0];
  for(let player = 0; player < 2; player += 1){
    const oldUses = Math.max(0, Number(before[player]) || 0);
    const newUses = Math.max(0, Number(after[player]) || 0);
    if(newUses < oldUses) return 'Concrete Roads uses cannot decrease during a match';
    if(newUses - oldUses > 1) return 'Concrete Roads can only spend one use at a time';
    if(newUses === oldUses) continue;
    if(String(baseState.landscapeId || '') !== 'igb17') return 'Concrete Roads is not the current landscape';
    if(Number(msg && msg.payload && msg.payload.playerIndex) !== player) return 'Concrete Roads use belongs to the acting player';
    const beforeHand = playerHandEntries(baseState, player);
    const afterHand = playerHandEntries(postState, player);
    const beforeTokens = beforeHand.filter(entry=>String(entry.card.id || '') === 'whisper17').length;
    const afterTokens = afterHand.filter(entry=>String(entry.card.id || '') === 'whisper17');
    if(afterTokens.length !== beforeTokens + 1) return 'Concrete Roads must create exactly one Shizuku Token';
    const token = afterTokens.find(entry=>!beforeHand.some(old=>String(old.card.iid || '') === String(entry.card.iid || '')))?.card;
    if(!token || token.type !== 'Coordinator' || Number(token.currentFate ?? token.fate) !== 5 || token.whisperLandscapeToken !== true) return 'Concrete Roads created an invalid Shizuku Token';
    if(!/^(?:10|11|15|19|23|57|77|bh02|bh07|bh08)$/.test(String(token._whisperCopiedEffectId || ''))) return 'Shizuku Token copied an invalid Coordinator effect';
    const beforeBoard = boardEntries(baseState).filter(entry=>Number(entry.card.owner) === player);
    const afterBoard = boardEntries(postState).filter(entry=>Number(entry.card.owner) === player);
    const removedBoard = beforeBoard.filter(entry=>!afterBoard.some(next=>String(next.card.iid || '') === String(entry.card.iid || '')));
    if(removedBoard.length !== 1) return 'Concrete Roads must discard exactly one controlled Coordinator';
    const source = removedBoard[0].card;
    if(source.type !== 'Coordinator' || source.faceDown === true || String(source.id || '') === 'whisper17') return 'Concrete Roads source must be a face-up non-token Coordinator';
    if(String(source.id || '') !== String(token._whisperCopiedEffectId || '')) return 'Shizuku Token must copy the discarded Coordinator';
    const removedHand = beforeHand.filter(entry=>!afterHand.some(next=>String(next.card.iid || '') === String(entry.card.iid || '')));
    if(removedHand.length !== 2) return 'Concrete Roads must discard exactly two cards from hand';
    const postDiscard = postState.players?.[player]?.discard;
    if(!Array.isArray(postDiscard)) return 'Concrete Roads discard pile is invalid';
    const allDiscarded = [source].concat(removedHand.map(entry=>entry.card));
    if(!allDiscarded.every(card=>postDiscard.some(discarded=>String(discarded && discarded.iid || '') === String(card && card.iid || '')))) {
      return 'Concrete Roads costs must reach the acting player discard pile';
    }
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
  if(baseEntry && String(baseEntry.card && baseEntry.card.id || '') === 'bh01' && String(fn) === 'triggerCharacterEffect'){
    const preState = room && room.canonicalState;
    const playerIndex = Number(payload.playerIndex);
    if(playerIndex !== Number(preState && preState.currentPlayer) || playerIndex !== Number(baseEntry.card.owner)) return 'Only Ani\u010dka\'s controller can activate Brave Horizons';
    if(Number(postState.currentPlayer) !== Number(preState.currentPlayer) || Number(postState.turn) !== Number(preState.turn)) return 'Brave Horizons activation cannot advance the turn';
    if(baseEntry.card.bh01MovedThisTurn === true || Number(baseEntry.card._braveHorizonsLastMoveTurn) === Number(preState.turn)) return 'Brave Horizons was already used this turn';
    const pending = postState && postState._bh01Moving;
    if(!pending || String(pending.kind || '') !== 'anickaVoyagerMove') return 'Brave Horizons activation did not create a movement choice';
    if(Number(pending.playerIndex) !== playerIndex || Number(pending.fromZ) !== baseEntry.z || Number(pending.fromR) !== baseEntry.r || Number(pending.fromC) !== baseEntry.c) return 'Brave Horizons movement source is invalid';
    if(String(pending.sourceIid || '') !== String(baseEntry.card.iid || '')) return 'Brave Horizons movement source identity is invalid';
    const legalOptions = authorityAnickaVoyagerMoveOptions(preState, baseEntry.card);
    if(!legalOptions.length || !authorityMoveOptionsMatch(pending.options, legalOptions)) return 'Brave Horizons movement choices are invalid';
  }
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

function isCaliforniqueAuthorityCharacter(card){
  if(!card || isAuthorityFullyEffectImmuneCard(card)) return false;
  const type = String(card.type || '');
  return !!type && type !== 'Supporter' && type !== 'Counter';
}

function validateCaliforniqueEndTurnTransition(preState, postState){
  if(!preState || !postState || String(preState.landscapeId || '') !== 'igb19') return '';
  const player = Number(preState.currentPlayer);
  if(player !== 0 && player !== 1) return 'Californique ending player is invalid';
  const beforeLandscape = preState._landscapeState || {};
  const afterLandscape = postState._landscapeState || {};
  const beforeCounts = Array.isArray(beforeLandscape.handTurnCounts) ? beforeLandscape.handTurnCounts : [0, 0];
  const afterCounts = Array.isArray(afterLandscape.handTurnCounts) ? afterLandscape.handTurnCounts : [];
  const beforeOwnerTurns = Math.max(0, Number(beforeCounts[player]) || 0);
  const completedOwnerTurn = beforeOwnerTurns + 1;
  if(Number(afterCounts[player]) !== completedOwnerTurn) return 'Californique player hand-turn count is invalid';
  if((Number(afterCounts[1 - player]) || 0) !== (Number(beforeCounts[1 - player]) || 0)) return 'Californique counted the wrong player turn';
  const afterResolvedTurns = Array.isArray(afterLandscape.handLastResolvedGameTurns) ? afterLandscape.handLastResolvedGameTurns : [];
  if(Number(afterResolvedTurns[player]) !== Math.max(1, Number(preState.turn) || 1)) return 'Californique resolved against the wrong game turn';
  const beforeHand = playerHandEntries(preState, player);
  const afterHand = playerHandEntries(postState, player);
  for(const entry of beforeHand){
    const card = entry.card;
    if(!isCaliforniqueAuthorityCharacter(card)) continue;
    const sameOwner = Number(card._igb19HandOwner) === player;
    const stored = Number(card._igb19HandTurnsRemaining);
    const remaining = sameOwner && Number.isFinite(stored)
      ? Math.max(1, Math.min(3, Math.floor(stored)))
      : 3;
    const lastCountedOwnerTurn = sameOwner
      ? Math.max(0, Number(card._igb19LastCountedHandTurn) || 0)
      : beforeOwnerTurns;
    const expected = lastCountedOwnerTurn < completedOwnerTurn ? remaining - 1 : remaining;
    const after = afterHand.find(next=>String(next.card.iid || '') === String(card.iid || ''));
    if(expected <= 0){
      if(after) return 'Californique expired Character remained in hand';
      const wineCountryTransfer = String(card.id || '') === '70'
        ? playerPileCardMatchingRef(postState, 1 - player, 'hand', card)
        : null;
      const reachedRequiredDestination = playerDiscardHasCardRef(postState, player, card)
        || !!(wineCountryTransfer
          && wineCountryTransfer.guerilla_transferred === true
          && Number(wineCountryTransfer.guerilla_owner) === player);
      if(!reachedRequiredDestination) return 'Californique expired Character did not reach discard or its required destination';
      continue;
    }
    if(!after) return 'Californique Character left hand before its countdown expired';
    if(Number(after.card._igb19HandTurnsRemaining) !== expected
      || Number(after.card._igb19HandOwner) !== player
      || Number(after.card._igb19LastCountedHandTurn) !== completedOwnerTurn){
      return 'Californique Character countdown is invalid';
    }
  }
  return '';
}

function exactAuthorityCardSnapshot(left, right){
  return JSON.stringify(left || null) === JSON.stringify(right || null);
}

function authorityCardIid(card){
  return String(card && card.iid || '');
}

function validateHandLimitDiscardPostState(room, payload, postState){
  const preState = room && room.canonicalState;
  const playerIndex = Number(payload && payload.playerIndex);
  if(!preState || !postState || (playerIndex !== 0 && playerIndex !== 1)) return 'Hand-limit discard player is invalid';
  const beforePlayer = preState.players && preState.players[playerIndex];
  const afterPlayer = postState.players && postState.players[playerIndex];
  if(!beforePlayer || !afterPlayer) return 'Hand-limit discard player state is invalid';
  const beforeHand = Array.isArray(beforePlayer.hand) ? beforePlayer.hand : [];
  const afterHand = Array.isArray(afterPlayer.hand) ? afterPlayer.hand : [];
  const handLimit = beforeHand.some(card=>
    card
    && String(card.id || '') === 'bh03'
    && card._bh03OpponentHand === true
  ) ? 6 : 12;
  const excess = Math.max(0, beforeHand.length - handLimit);
  if(excess <= 0) return 'Hand-limit discard is not required';
  if(afterHand.length !== beforeHand.length - excess || afterHand.length !== handLimit) return 'Hand-limit discard must return the hand to its active limit';
  const afterHandIids = new Set(afterHand.map(authorityCardIid));
  const removed = beforeHand.filter(card=>!afterHandIids.has(authorityCardIid(card)));
  if(removed.length !== excess) return 'Hand-limit discard removed an invalid number of cards';
  if(removed.some(card=>String(card.id || '') === 'bh03' && card._bh03OpponentHand === true)) return 'Ali cannot be discarded from the opponent hand';
  if(afterHand.some(card=>{
    const original = beforeHand.find(entry=>authorityCardIid(entry) === authorityCardIid(card));
    return !original || !exactAuthorityCardSnapshot(original, card);
  })) return 'Hand-limit discard changed a card that remained in hand';
  const requestedIids = Array.isArray(payload && payload.discardedIids)
    ? payload.discardedIids.map(String).sort()
    : [];
  const removedIids = removed.map(authorityCardIid).sort();
  if(requestedIids.length && JSON.stringify(requestedIids) !== JSON.stringify(removedIids)) return 'Hand-limit discard selection does not match the submitted cards';

  const expected = cloneState(preState);
  expected.players[playerIndex].hand = cloneState(afterHand);
  for(const sourceCard of removed){
    const ref = {iid:authorityCardIid(sourceCard), id:String(sourceCard.id || '')};
    if(String(sourceCard.id || '') === '70' && sourceCard.guerilla_transferred !== true){
      const holder = 1 - playerIndex;
      const transferred = playerPileCardMatchingRef(postState, holder, 'hand', ref);
      if(!transferred
        || transferred.guerilla_transferred !== true
        || Number(transferred.guerilla_owner) !== playerIndex
        || Number(transferred.guerilla_turnsLeft) !== 5){
        return 'Wine Country Guerilla must enter the opponent hand after a hand-limit discard';
      }
      expected.players[holder].hand.push(cloneState(transferred));
      continue;
    }
    if(sourceCard._stolenByRobo === true){
      const originalOwner = Number(sourceCard._roboOrigOwner);
      const returned = (originalOwner === 0 || originalOwner === 1)
        ? playerPileCardMatchingRef(postState, originalOwner, 'discard', ref)
        : null;
      if(!returned || returned._stolenByRobo === true || Number(returned.owner) !== originalOwner){
        return 'Robo en la Noche stolen card must return to its original owner discard';
      }
      expected.players[originalOwner].discard.push(cloneState(returned));
      continue;
    }
    const discarded = playerPileCardMatchingRef(postState, playerIndex, 'discard', ref);
    if(!discarded) return 'Hand-limit discard did not reach a legal discard destination';
    expected.players[playerIndex].discard.push(cloneState(discarded));
  }
  if(canonicalStateHash(expected) !== canonicalStateHash(postState)) {
    return 'Hand-limit discard changed state outside its legal card destinations';
  }
  return '';
}

function validateAliIndomitableTransferPostState(room, payload, postState){
  const preState = room && room.canonicalState;
  const sourcePlayer = Number(payload && payload.playerIndex);
  if(!preState || !postState || (sourcePlayer !== 0 && sourcePlayer !== 1)) return 'Ali transfer player is invalid';
  const recipient = 1 - sourcePlayer;
  const beforeSourceHand = preState.players?.[sourcePlayer]?.hand || [];
  const afterSourceHand = postState.players?.[sourcePlayer]?.hand || [];
  const beforeRecipientHand = preState.players?.[recipient]?.hand || [];
  const afterRecipientHand = postState.players?.[recipient]?.hand || [];
  const cardIid = String(payload && payload.cardIid || '');
  const sourceCard = beforeSourceHand.find(card=>
    card
    && String(card.id || '') === 'bh03'
    && card._bh03TransferPending === true
    && (!cardIid || authorityCardIid(card) === cardIid)
  );
  if(!sourceCard) return 'Ali transfer source is no longer pending';
  const iid = authorityCardIid(sourceCard);
  if(afterSourceHand.length !== beforeSourceHand.length - 1 || afterSourceHand.some(card=>authorityCardIid(card) === iid)) return 'Ali must leave the source hand';
  if(afterRecipientHand.length !== beforeRecipientHand.length + 1) return 'Ali must enter the opponent hand';
  const transferred = afterRecipientHand.find(card=>authorityCardIid(card) === iid);
  if(!transferred || String(transferred.id || '') !== 'bh03') return 'Ali transfer card identity is invalid';
  if(Number(transferred.owner) !== recipient
    || transferred._bh03OpponentHand !== true
    || Number(transferred._bh03TransferredFrom) !== sourcePlayer
    || transferred.immuneFlag !== true
    || transferred.cantBeReduced !== true
    || transferred._bh03TransferPending === true
    || transferred.noConsolidate === true){
    return 'Ali transfer state is invalid';
  }
  const expectedSource = beforeSourceHand.filter(card=>authorityCardIid(card) !== iid);
  if(!exactAuthorityCardSnapshot(expectedSource, afterSourceHand)) return 'Ali transfer changed other source-hand cards';
  if(beforeRecipientHand.some((card, index)=>!exactAuthorityCardSnapshot(card, afterRecipientHand[index]))) return 'Ali transfer changed other opponent-hand cards';
  const expected = cloneState(preState);
  expected.players[sourcePlayer].hand = cloneState(afterSourceHand);
  expected.players[recipient].hand = cloneState(afterRecipientHand);
  if(canonicalStateHash(expected) !== canonicalStateHash(postState)) return 'Ali transfer can only move Ali between hands';
  return '';
}

function validateTaylorOpeningCopyPostState(room, payload, postState){
  const preState = room && room.canonicalState;
  const playerIndex = Number(payload && payload.playerIndex);
  if(!preState || !postState || (playerIndex !== 0 && playerIndex !== 1)) return 'Taylor opening copy player is invalid';
  const beforeHand = preState.players?.[playerIndex]?.hand || [];
  const afterHand = postState.players?.[playerIndex]?.hand || [];
  const sourceIid = String(payload && payload.cardIid || '');
  const source = beforeHand.find(card=>
    card
    && String(card.id || '') === 'bh05'
    && card._bh05GeneratedCopy !== true
    && card._bh05OpeningCopyPending === true
    && (!sourceIid || authorityCardIid(card) === sourceIid)
  );
  if(!source) return 'Taylor opening copy source is no longer pending';
  if(afterHand.length !== beforeHand.length + 1) return 'Taylor opening copy must add exactly one card';
  const expectedIid = Math.max(0, Math.floor(Number(preState.instanceCounter) || 0)) + 1;
  const expectedSource = cloneState(source);
  delete expectedSource._bh05OpeningCopyPending;
  const retained = afterHand.find(card=>authorityCardIid(card) === authorityCardIid(source));
  if(!exactAuthorityCardSnapshot(expectedSource, retained)) return 'Taylor opening copy changed its source card';
  const generated = afterHand.find(card=>
    card
    && card._bh05GeneratedCopy === true
    && String(card._bh05GeneratedFromIid || '') === authorityCardIid(source)
  );
  const expectedGenerated = Object.assign({}, cloneState(expectedSource), {
    iid:expectedIid,
    owner:playerIndex,
    _bh05GeneratedCopy:true,
    _bh05GeneratedFromIid:source.iid
  });
  if(!generated || !exactAuthorityCardSnapshot(expectedGenerated, generated)) return 'Taylor opening copy card is invalid';
  const expectedHand = beforeHand.map(card=>
    authorityCardIid(card) === authorityCardIid(source) ? expectedSource : cloneState(card)
  );
  expectedHand.push(expectedGenerated);
  if(!exactAuthorityCardSnapshot(expectedHand, afterHand)) return 'Taylor opening copy changed another hand card';
  const expected = cloneState(preState);
  expected.instanceCounter = expectedIid;
  expected.players[playerIndex].hand = expectedHand;
  if(canonicalStateHash(expected) !== canonicalStateHash(postState)) return 'Taylor opening copy can only add its linked copy';
  return '';
}

function validateActionSpecificPostState(room, msg, postState){
  const type = effectiveAuthorityActionType(msg);
  const payload = msg && msg.payload || {};
  const preState = room && room.canonicalState;
  if(preState && postState){
    const braveHorizonsMove = !!preState._bh01Moving || String(payload.moveKind || '') === 'anickaVoyagerMove';
    for(const beforeEntry of boardEntries(preState).filter(entry=>isAuthorityFullyEffectImmuneCard(entry.card))){
      const afterEntry = findBoardEntryByRef(postState, beforeEntry.card);
      if(!afterEntry) return 'Fully immune cards cannot be discarded or removed by landscape effects';
      if(Number(afterEntry.card.currentFate ?? afterEntry.card.fate) !== Number(beforeEntry.card.currentFate ?? beforeEntry.card.fate)) return 'Fully immune cards cannot gain or lose Fate from landscape effects';
      const moved = afterEntry.z !== beforeEntry.z || afterEntry.r !== beforeEntry.r || afterEntry.c !== beforeEntry.c;
      const isAnicka = String(beforeEntry.card && beforeEntry.card.id || '') === 'bh01';
      if(moved && !(isAnicka && braveHorizonsMove)) return 'Fully immune cards cannot be moved by landscape effects';
    }
  }
  const timedLandscapeErr = validateTimedLandscapeTransition(room && room.canonicalState, postState);
  if(timedLandscapeErr) return timedLandscapeErr;
  const usMarinesErr = validateUsMarinesUsesTransition(room, postState);
  if(usMarinesErr) return usMarinesErr;
  const whisperErr = validateWhisperLandscapeUsesTransition(room, msg, postState);
  if(whisperErr) return whisperErr;
  if(type === 'HAND_LIMIT_DISCARD') return validateHandLimitDiscardPostState(room, payload, postState);
  if(type === 'ALI_INDOMITABLE_TRANSFER') return validateAliIndomitableTransferPostState(room, payload, postState);
  if(type === 'TAYLOR_OPENING_COPY') return validateTaylorOpeningCopyPostState(room, payload, postState);
  if(type === 'END_TURN'){
    const californiqueErr = validateCaliforniqueEndTurnTransition(room && room.canonicalState, postState);
    if(californiqueErr) return californiqueErr;
  }
  if(type === 'SELECT_CONSOLIDATION_TRIBUTE' || payload.consolidationPresentation || collectConsolidationTributeRefs(payload).length){
    return validateConsolidationPostState(room, payload, postState);
  }
  if(type === 'PLACE_CARD' || (type === 'CLICK_CELL' && payload.placing)){
    return validatePlacementPostState(room, payload, postState);
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

function applyLydiaAuthorityReaction(state, option, pending, presentationEvents){
  const entry = findBoardEntryByRef(state, option);
  if(!entry || !entry.card) return 'Lydia is no longer on the board';
  entry.card.usesLeft = Math.max(0, (entry.card.usesLeft === null || entry.card.usesLeft === undefined ? 3 : Number(entry.card.usesLeft) || 0) - 1);
  markAuthoritySourceNegated(state, pending, 'lydia');
  applyAuthorityMajaMischievousActivities(state, Number(pending && pending.playerIndex), presentationEvents);
  return '';
}

function applySeculesAuthorityReaction(state, option, pending, presentationEvents){
  const entry = findBoardEntryByRef(state, option);
  if(!entry || !entry.card) return 'Mr. Secules is no longer on the board';
  entry.card.usesLeft = 0;
  entry.card._seculesUsed = true;
  markAuthoritySourceNegated(state, pending, 'secules');
  applyAuthorityMajaMischievousActivities(state, Number(pending && pending.playerIndex), presentationEvents);
  return '';
}

function authorityBoardTotalFate(state, owner){
  return boardEntries(state).reduce((total, entry)=>{
    if(!entry.card || Number(entry.card.owner) !== Number(owner)) return total;
    return total + Math.max(0, Number(entry.card.currentFate ?? entry.card.fate) || 0);
  }, 0);
}

function applyAuthorityHavanoPlacementRules(state, inst, sourceCard, z, playerIndex){
  if(!state || !inst) return;
  inst._setTurn = Number(state.turn) || 0;
  inst._setOwner = playerIndex;
  const p0 = authorityBoardTotalFate(state, 0);
  const p1 = authorityBoardTotalFate(state, 1);
  if(String(state.landscapeId || '') === 'igb5' && p0 !== p1 && (p0 > p1 ? 0 : 1) === playerIndex){
    if(!Array.isArray(inst._landscapeBonusIds)) inst._landscapeBonusIds = [];
    if(!inst._landscapeBonusIds.includes('igb5')){
      inst._landscapeBonusIds.push('igb5');
      inst._landscapeStaticFateBonus = (Number(inst._landscapeStaticFateBonus) || 0) + 2;
      applyAuthorityPermanentFateGain(inst, 2);
    }
  }
  boardEntries(state).forEach(entry=>{
    const aura = entry.card;
    if(!aura || Number(entry.z) !== Number(z) || Number(aura.owner) !== playerIndex || isFaceDownAuthorityCard(aura)) return;
    if(!authorityCardActsAsPassive(aura, '02') || authorityCardEffectIsSuppressed(aura)) return;
    applyAuthorityPermanentFateGain(inst, 4);
  });
  delete inst._wciBonus;
  delete inst._handCostDelta;
  delete inst._handEffectModifiers;
  delete inst._igb19HandTurnsRemaining;
  delete inst._igb19HandOwner;
  delete inst._igb19LastCountedHandTurn;
  if(!Array.isArray(state.supportersSetP)) state.supportersSetP = [0, 0];
  state.supportersSetP[playerIndex] = (Number(state.supportersSetP[playerIndex]) || 0) + 1;
  if(!Array.isArray(state.supporterReinforcementSetP)) state.supporterReinforcementSetP = [0, 0];
  state.supporterReinforcementSetP[playerIndex] = (Number(state.supporterReinforcementSetP[playerIndex]) || 0) + 1;
  inst._setReinforcementValue = 1;
  inst._supporterSetCounted = true;
  inst._wasSetAsSupporter = true;
  inst._hasBeenOnBoard = true;
  inst._supporterSetOwner = playerIndex;
}

function applyHavanoAuthorityReaction(state, option, payload, pending, presentationEvents){
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
  applyAuthorityHavanoPlacementRules(state, inst, card, z, playerIndex);
  state.board[z][r][c] = inst;
  markAuthoritySourceNegated(state, pending, 'havano');
  applyAuthorityMajaMischievousActivities(state, Number(pending && pending.playerIndex), presentationEvents);
  return '';
}

function appendAuthorityTaylorSelfCopy(state, playerIndex, drawn){
  if(!state || !drawn || String(drawn.id || '') !== 'bh05' || drawn._bh05GeneratedCopy === true) return null;
  const player = state.players && state.players[playerIndex];
  if(!player || !Array.isArray(player.hand)) return null;
  state.instanceCounter = Math.max(0, Math.floor(Number(state.instanceCounter) || 0)) + 1;
  const secondCopy = cloneState(drawn);
  secondCopy.iid = state.instanceCounter;
  secondCopy.owner = playerIndex;
  secondCopy._bh05GeneratedCopy = true;
  secondCopy._bh05GeneratedFromIid = drawn.iid;
  delete secondCopy._igb19HandTurnsRemaining;
  delete secondCopy._igb19HandOwner;
  delete secondCopy._igb19LastCountedHandTurn;
  delete secondCopy._fateHandArrivalKind;
  player.hand.push(secondCopy);
  return secondCopy;
}

function authorityResetHandTenure(state, playerIndex, card){
  if(!card) return;
  delete card._igb19HandTurnsRemaining;
  delete card._igb19HandOwner;
  delete card._igb19LastCountedHandTurn;
  const type = String(card.type || '');
  if(String(state && state.landscapeId || '') !== 'igb19'
    || type === 'Supporter'
    || type === 'Counter'
    || isAuthorityFullyEffectImmuneCard(card)) return;
  const landscapeState = state._landscapeState || {};
  card._igb19HandTurnsRemaining = 3;
  card._igb19HandOwner = playerIndex;
  card._igb19LastCountedHandTurn = Math.max(0, Number(landscapeState.handTurnCounts && landscapeState.handTurnCounts[playerIndex]) || 0);
}

function authorityApplyWestCaribHandArrival(state, playerIndex, card){
  const pending = state && state._westCaribNext;
  if(!pending || !card || String(card.id || '') === '70') return;
  const owner = typeof pending === 'object' ? Number(pending.owner) : playerIndex;
  const type = String(card.type || '');
  if(owner !== playerIndex || type === 'Supporter' || type === 'Counter') return;
  card._wciBonus = true;
  card._handCostDelta = (Number(card._handCostDelta) || 0) - 1;
  if(!Array.isArray(card._handEffectModifiers)) card._handEffectModifiers = [];
  card._handEffectModifiers.push({
    key:'west-caribbea-infantry',
    name:'West Caribbea Infantry',
    text:'The Company\'s Finest: -1 Reinforcement cost, +2 Fate when set.',
    fateDelta:2,
    costDelta:-1
  });
  state._westCaribNext = false;
}

function authorityApplySelvaHandArrival(state, playerIndex, card){
  if(!card || String(card.id || '') !== '74') return;
  if(Number(state.currentPlayer) === playerIndex && String(state.phase || '') === 'main'){
    card._selvaArrivalTurn = Number(state.turn) || 0;
    state.extraSupportsThisTurn = (Number(state.extraSupportsThisTurn) || 0) + 1;
    if(!Array.isArray(state._selvaSupportBoosts)) state._selvaSupportBoosts = [null, null];
    const previous = state._selvaSupportBoosts[playerIndex];
    const previousExtra = previous && Number(previous.turn) === Number(state.turn)
      ? Math.max(0, Number(previous.extraSupports) || 0)
      : 0;
    state._selvaSupportBoosts[playerIndex] = {
      owner:playerIndex,
      turn:Number(state.turn) || 0,
      extraSupports:previousExtra + 1,
      sourceIid:card.iid || null,
      sourceName:card.name || 'Selva Islands Pirate'
    };
    return;
  }
  card._selvaOpeningQueued = true;
  if(!Array.isArray(state._pendingSelvaSupportBoost)) state._pendingSelvaSupportBoost = [0, 0];
  state._pendingSelvaSupportBoost[playerIndex] = (Number(state._pendingSelvaSupportBoost[playerIndex]) || 0) + 1;
}

function authorityApplyErbsDrawBonus(state, playerIndex, card){
  const active = Array.isArray(state.erbsActive) ? !!state.erbsActive[playerIndex] : !!state.erbsActive;
  if(!active || !card || String(card.id || '') === '70') return;
  if(!isAuthorityFullyEffectImmuneCard(card)){
    applyAuthorityPermanentFateGain(card, 4);
    if(!Array.isArray(card._handEffectModifiers)) card._handEffectModifiers = [];
    card._handEffectModifiers.push({
      key:'christopher-erbs',
      name:'Card Empowered',
      text:'Hard Times, Strong Men: this card gained +4 Fate.',
      fateDelta:4
    });
  }
  if(Array.isArray(state.erbsActive)) state.erbsActive[playerIndex] = false;
  else state.erbsActive = false;
}

function authorityResolveDrawnCardArrival(state, playerIndex, card, presentationEvents, options){
  const player = state && state.players && state.players[playerIndex];
  if(!player || !Array.isArray(player.hand) || !card) return;
  const opts = options || {};
  card.owner = playerIndex;
  card._fateHandArrivalKind = 'draw';
  authorityResetHandTenure(state, playerIndex, card);
  authorityApplyWestCaribHandArrival(state, playerIndex, card);
  authorityApplyErbsDrawBonus(state, playerIndex, card);
  if(String(card.id || '') === 'bh03'){
    const recipient = 1 - playerIndex;
    delete card._igb19HandTurnsRemaining;
    delete card._igb19HandOwner;
    delete card._igb19LastCountedHandTurn;
    delete card._fateHandArrivalKind;
    card.owner = recipient;
    card._bh03OpponentHand = true;
    card._bh03TransferredFrom = playerIndex;
    card.immuneFlag = true;
    card.cantBeReduced = true;
    state.players[recipient].hand.push(card);
    return;
  }
  player.hand.push(card);
  appendAuthorityTaylorSelfCopy(state, playerIndex, card);
  authorityApplySelvaHandArrival(state, playerIndex, card);
  delete card._fateHandArrivalKind;
  if(opts.outsideDraw === true && String(state.landscapeId || '') === 'igb9' && Array.isArray(presentationEvents)){
    presentationEvents.push({
      type:'LANDSCAPE_OUTSIDE_DRAW_BONUS',
      eventId:['authority-outside-draw', Number(state.turn) || 0, playerIndex, String(card.iid || card.id || 'card')].join(':'),
      playerIndex,
      cardName:String(card.name || 'a card')
    });
  }
}

function applyBoleslawSearchAuthorityReaction(state, option, pending, presentationEvents){
  const playerIndex = Number(pending && pending.playerIndex);
  const player = state && state.players && state.players[playerIndex];
  if(!player || !Array.isArray(player.deck) || !Array.isArray(player.hand)) return 'Boleslaw owner is invalid';
  const entry = findBoardEntryByRef(state, option);
  if(!entry || !authorityCardIsReadyBoleslaw(entry.card, playerIndex)) return 'Boleslaw is no longer ready on the board';
  const before = Number(entry.card.currentFate ?? entry.card.fate ?? 0) || 0;
  entry.card.currentFate = before + 3;
  applyAuthorityJoieDrawEffectPassive(state, playerIndex, entry.card, presentationEvents);
  appendAuthorityCardEffectFlash(
    presentationEvents,
    state,
    entry,
    entry,
    'boleslaw_exclaim',
    '!!!',
    ['boleslaw-authority', playerIndex, Number(state.turn) || 0, String(entry.card.iid || entry.card.id || 'card')].join(':')
  );
  const drawn = player.deck.shift() || null;
  if(drawn){
    authorityResolveDrawnCardArrival(state, playerIndex, drawn, presentationEvents, {outsideDraw:true});
  }
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
  const manualEffectReaction = /^(?:supporter_effect|initiator_effect)$/i.test(String(pending.actionType || ''));
  if(choice === 'decline' || choice === 'allow' || choice === 'timeout'){
    const resolved = cloneState(manualEffectReaction ? current : pending.resolvedPostState);
    if(!resolved) return {ok:false, reason:'pending reaction missing stored resolution'};
    const presentationEvents = Array.isArray(pending.presentationEvents) ? cloneState(pending.presentationEvents) : [];
    applyAuthorityReactionTimerPause(resolved, pending);
    removePendingReaction(resolved);
    markAuthorityPlacementReactionAllowed(resolved, pending);
    markAuthorityDeckSetReactionAllowed(resolved, pending);
    const validationError = validateCanonicalState(resolved);
    if(validationError) return {ok:false, reason:validationError};
    return {
      ok:true,
      canonicalState:resolved,
      canonicalHash:canonicalStateHash(resolved),
      serverReduced:true,
      presentationEvents
    };
  }
  if(choice !== 'negate') return {ok:false, reason:'unknown reaction choice'};
  const option = findReactionOption(pending, payload);
  if(!option) return {ok:false, reason:'reaction option is missing'};
  const isFirstSetReaction = String(pending.actionType || '') === 'first_set_effect';
  const isDeckSetReaction = String(pending.actionType || '') === 'set_from_deck_effect';
  const resolvedForSpentFlags = manualEffectReaction ? current : pending.resolvedPostState;
  const state = cloneState(
    isFirstSetReaction
      ? pending.resolvedPostState
      : (manualEffectReaction ? pending.preEffectState : current)
  );
  if(!state) return {ok:false, reason:'pending reaction missing rollback state'};
  const presentationEvents = Array.isArray(pending.negatedPresentationEvents)
    ? cloneState(pending.negatedPresentationEvents)
    : [];
  if(manualEffectReaction && current._serverReactionSeq !== undefined){
    state._serverReactionSeq = cloneState(current._serverReactionSeq);
  }
  applyAuthorityReactionTimerPause(state, pending);
  removePendingReaction(state);
  if(isDeckSetReaction) applyAuthorityDeckSetNegation(state, pending);
  else if(!isFirstSetReaction) copySourceSpentFlagsFromResolved(state, resolvedForSpentFlags, pending);
  let error = '';
  const kind = String(option.kind || '');
  if(kind === 'lydia') error = applyLydiaAuthorityReaction(state, option, pending, presentationEvents);
  else if(kind === 'secules') error = applySeculesAuthorityReaction(state, option, pending, presentationEvents);
  else if(kind === 'havano') error = applyHavanoAuthorityReaction(state, option, payload, pending, presentationEvents);
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
    },
    presentationEvents
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
  const reactionResolution = maybeArmAuthorityImprovisorReaction(room, msg, result.canonicalState);
  if(reactionResolution){
    const reactionState = reactionResolution.state;
    return {
      ok:true,
      canonicalState:reactionState,
      canonicalHash:canonicalStateHash(reactionState),
      baseStateHash:result.baseStateHash,
      serverReduced:true,
      reactionArmed:!!reactionState._serverPendingReaction,
      suppressPresentationEvents:!!reactionState._serverPendingReaction,
      presentationEvents:Array.isArray(reactionResolution.presentationEvents) ? reactionResolution.presentationEvents : []
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
