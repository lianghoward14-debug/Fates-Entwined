import {
  boardCardAt,
  boardEntries,
  controllerOf,
  findBoardCard,
  findCard,
  isBoardCoordinate,
  squareStatuses
} from './selectors.mjs';

function rejection(code, reason, details = {}){
  return {ok:false, rejection:{code, reason, details}};
}

export function runtimeRuleId(card){
  return String(
    card?.counters?.copiedPassiveId
    || card?.counters?.copiedEffectId
    || card?.id
    || ''
  );
}

export function effectiveCardType(_state, card){
  const globalOverride = (_state?.statuses || []).find(status=>
    status?.type === 'SUPPORTERS_AS_CHARACTERS'
    && Number(status.playerIndex) === controllerOf(card)
    && Number(status.remainingTargetTurns || 0) > 0
  );
  const structuralType = String(card?.counters?.bh14OriginalType || card?.type || '');
  const declaredType = String(card?.counters?.bh14DeclaredType || '');
  if(globalOverride && structuralType === 'Supporter') return 'Character';
  const override = (card?.statuses || []).find(status=>String(status).startsWith('TYPE:'));
  return override ? String(override).slice(5) : (declaredType || structuralType);
}

export function structuralCardType(_state, card){
  // Structural rules use the physical printed card type. Rozsi and Chloe only
  // change effect-facing classification, so a printed Supporter remains a
  // valid consolidation tribute under either effect.
  return String(card?.counters?.bh14OriginalType || card?.type || '');
}

export function effectiveCost(_state, card){
  if(isEffectImmutable(card)) return Math.max(0, Number(card?.cost) || 0);
  const modifiers = (card?.statuses || [])
    .filter(status=>String(status).startsWith('COST:'))
    .reduce((sum, status)=>sum + (Number(String(status).slice(5)) || 0), 0);
  let cost = Math.max(
    0,
    (Number(card?.cost) || 0)
      + modifiers
      + (Number(card?.counters?.handCostDelta) || 0)
  );
  if(String(card?.id || '') === '99'){
    const owner = Number(card?.owner);
    const relatedIds = new Set(['15', '34', '88', '89', '99']);
    if(boardEntries(_state).some(entry=>
      controllerOf(entry.card) === owner && relatedIds.has(String(entry.card.id || ''))
    )) cost = 0;
  }
  return cost;
}

export function isEffectSourceSuppressed(state, value){
  const entry = value?.card
    ? value
    : (value?.iid ? findBoardCard(state, value.iid) : null);
  const card = entry?.card || value;
  if(!card) return false;
  if(card.statuses?.includes('EFFECTS_SUPPRESSED')) return true;
  if(!entry || String(card.type || '') !== 'Coordinator') return false;
  if(isEffectImmutable(card) || isImmuneToOpponentEffects(card, state)) return false;
  return squareStatuses(state, entry, 'COORDINATOR_SUPPRESSED').some(status=>{
    if(Number(status.blockedPlayer) !== controllerOf(card)) return false;
    const source = findBoardCard(state, status.sourceIid);
    return !!source
      && runtimeRuleId(source.card) === '21'
      && controllerOf(source.card) !== controllerOf(card)
      && source.card.faceDown !== true
      && !source.card.statuses?.includes('EFFECTS_SUPPRESSED');
  });
}

function activeAuraSource(state, entry){
  if(!entry?.card
    || entry.card.faceDown === true
    || isEffectSourceSuppressed(state, entry)) return false;
  return true;
}

function stablePassiveRank(source, target){
  const key = `${String(source?.iid || source?.id || '')}:${String(target?.iid || target?.id || '')}`;
  let hash = 2166136261;
  for(let index = 0; index < key.length; index += 1){
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function duelistTarget(state, sourceEntry){
  if(state?.gameSettings?.pressureCardReworks === true || !activeAuraSource(state, sourceEntry) || runtimeRuleId(sourceEntry.card) !== '64') return null;
  return boardEntries(state)
    .filter(entry=>
      entry.z === sourceEntry.z
      && controllerOf(entry.card) !== controllerOf(sourceEntry.card)
      && entry.card.faceDown !== true
      && !isEffectImmutable(entry.card)
      && Math.abs(entry.r - sourceEntry.r) + Math.abs(entry.c - sourceEntry.c) === 1
    )
    .sort((a, b)=>
      (stablePassiveRank(sourceEntry.card, a.card) - stablePassiveRank(sourceEntry.card, b.card))
      || String(a.card.iid).localeCompare(String(b.card.iid))
    )[0] || null;
}

function sovietGrenadierTarget(state, sourceEntry){
  if(!activeAuraSource(state, sourceEntry) || runtimeRuleId(sourceEntry.card) !== '44') return null;
  const declaredType = String(sourceEntry.card.counters?.sovietDeclaredType || '');
  const targetIid = String(sourceEntry.card.counters?.sovietTargetIid || '');
  if(!declaredType || !targetIid) return null;
  return boardEntries(state).find(target=>
    String(target.card.iid || '') === targetIid
    && target.z === sourceEntry.z
    && target.card.faceDown !== true
    && effectiveCardType(state, target.card) === declaredType
    && Math.abs(target.r - sourceEntry.r) + Math.abs(target.c - sourceEntry.c) === 1
  ) || null;
}

export function coordinatorAuraPotencyBoost(state, sourceEntry){
  if(!sourceEntry?.card || String(sourceEntry.card.type || '') !== 'Coordinator') return 0;
  const controller = controllerOf(sourceEntry.card);
  return boardEntries(state).filter(entry=>
    (entry.z === sourceEntry.z || entry.card.counters?.whisperLandscapeToken === true)
    && controllerOf(entry.card) === controller
    && runtimeRuleId(entry.card) === '57'
    && activeAuraSource(state, entry)
  ).length;
}

export function adjacencyBonusMultiplier(state, zone, playerIndex){
  const z = Number(zone);
  const controller = Number(playerIndex);
  const superiorMarksSources = boardEntries(state).filter(source=>
    controllerOf(source.card) === controller
    && runtimeRuleId(source.card) === 'bh11'
    && (source.z === z || source.card.counters?.whisperLandscapeToken === true)
    && activeAuraSource(state, source)
  ).length;
  return Math.pow(2, superiorMarksSources);
}

export function effectiveFate(state, entryOrCard){
  const entry = entryOrCard?.card
    ? entryOrCard
    : findCard(state, entryOrCard?.iid);
  const card = entry?.card || entryOrCard;
  if(!card || entry?.zone !== 'board' || card.faceDown === true) return 0;
  const stored = Math.max(0, Number(card.currentFate) || 0);
  const targetController = controllerOf(card);
  const moraleCardPenalty = 0;
  if(isEffectImmutable(card)) return Math.max(0, stored - moraleCardPenalty);
  const targetType = effectiveCardType(state, card);
  const selfId = runtimeRuleId(card);
  const adjacencyMultiplier = adjacencyBonusMultiplier(state, entry.z, targetController);
  const permanentAdjustment = (Number(card.currentFate) || 0) - (Number(card.baseFate) || 0);
  // Jimmy's own passive establishes his dynamic base Fate. It does not make
  // him immune to other cards: ordinary auras and penalties (including an
  // adjacent Soviet Grenadier) are applied to that base below.
  const derived = activeAuraSource(state, entry) && selfId === '41'
    ? Math.max(0, Number(state.fateReductionEffectUses[targetController] || 0) * 3 + permanentAdjustment)
    : stored;
  let modifier = 0;
  if(state?.gameSettings?.pressureCardReworks === true){
    const honorGuardActive=boardEntries(state).some(source=>controllerOf(source.card)===targetController&&runtimeRuleId(source.card)==='25'&&activeAuraSource(state,source));
    const sameAffAdjacent=boardEntries(state).some(peer=>peer.z===entry.z&&controllerOf(peer.card)===targetController&&String(peer.card.iid)!==String(card.iid)&&peer.card.faceDown!==true&&String(peer.card.affiliation||'')===String(card.affiliation||'')&&Math.abs(peer.r-entry.r)+Math.abs(peer.c-entry.c)===1);
    if(honorGuardActive&&sameAffAdjacent)modifier+=1;
  }
  for(const source of boardEntries(state)){
    const fieldWide = source.card.counters?.whisperLandscapeToken === true;
    if((source.z !== entry.z && !fieldWide) || !activeAuraSource(state, source)) continue;
    const sourceController = controllerOf(source.card);
    const sourceId = runtimeRuleId(source.card);
    if(sourceId === '10' && sourceController !== targetController){
      modifier -= 3;
      continue;
    }
    if(sourceController !== targetController) continue;
    if(sourceId === '01'
      && Math.abs(source.r - entry.r) + Math.abs(source.c - entry.c) === 1){
      modifier += (4 + coordinatorAuraPotencyBoost(state, source)) * adjacencyMultiplier;
    }else if(sourceId === '11' && targetType === 'Supporter'){
      modifier += 3 + coordinatorAuraPotencyBoost(state, source);
    }else if(sourceId === '19' && targetType === 'Coordinator'){
      modifier += 3 + coordinatorAuraPotencyBoost(state, source);
    }else if(sourceId === '23' && targetType !== 'Supporter'){
      modifier += 2 + coordinatorAuraPotencyBoost(state, source);
    }else if(sourceId === '77'
      && String(source.card.counters?.declaredAffiliation || '')
        === String(card.affiliation || '')){
      modifier += 4 + coordinatorAuraPotencyBoost(state, source);
    }else if(sourceId === '59' && targetType === 'Supporter'){
      modifier += 1;
    }else if(sourceId === 'bh07'){
      const adjacentDauntless = boardEntries(state).filter(peer=>
        peer.z === source.z
        && peer.card.faceDown !== true
        && effectiveCardType(state, peer.card) === 'Dauntless'
        && Math.abs(peer.r - source.r) + Math.abs(peer.c - source.c) === 1
      ).length;
      modifier += adjacentDauntless * (2 + coordinatorAuraPotencyBoost(state, source)) * adjacencyMultiplier;
    }
  }
  if(activeAuraSource(state, entry) && selfId === '44' && sovietGrenadierTarget(state, entry)){
    modifier += 3 * adjacencyMultiplier;
  }
  const linkedGrenadiers = boardEntries(state).filter(source=>{
    if(runtimeRuleId(source.card) !== '44') return false;
    const selected = sovietGrenadierTarget(state, source);
    return selected && String(selected.card.iid) === String(card.iid);
  }).length;
  modifier += linkedGrenadiers * 3 * adjacencyMultiplier;
  if(activeAuraSource(state, entry) && selfId === '55'){
    const peers = boardEntries(state).filter(source=>
      source.z === entry.z
      && String(source.card.iid) !== String(card.iid)
      && controllerOf(source.card) === targetController
      && source.card.faceDown !== true
      // Single-player treats ALPINE and other effect-immutable cards as
      // invisible to every other card effect. They cannot satisfy Bobby's
      // three-card affiliation prerequisite merely by sharing an affiliation.
      && !isEffectImmutable(source.card)
    );
    const peerAffiliation = String(peers[0]?.card?.affiliation || '');
    if(peers.length >= 3
      && peerAffiliation
      && peers.every(source=>String(source.card.affiliation || '') === peerAffiliation)){
      modifier += 5;
    }
  }
  if(activeAuraSource(state, entry) && selfId === '63'){
    const copies = boardEntries(state).filter(source=>
      source.z === entry.z
      && controllerOf(source.card) === targetController
      && runtimeRuleId(source.card) === '63'
      && activeAuraSource(state, source)
      && !isEffectImmutable(source.card)
    ).length;
    modifier += copies * 2;
  }
  if(activeAuraSource(state, entry) && selfId === '88'){
    const characters = boardEntries(state).filter(source=>
      controllerOf(source.card) === targetController
      && source.card.faceDown !== true
      // ALPINE Infantry and any other effect-immutable card are invisible to
      // other cards' conditions. Temporary Supporter reclassification must
      // not make them count toward Rozsi (Youth)'s Character total.
      && !isEffectImmutable(source.card)
      && effectiveCardType(state, source.card) !== 'Supporter'
    ).length;
    modifier += characters * 2;
  }
  if(activeAuraSource(state, entry) && selfId === '85'){
    modifier += Number(state.supportersSetTotal[targetController === 0 ? 1 : 0]) || 0;
  }
  if(activeAuraSource(state, entry)
    && selfId === '89'
    && (Number(state.supporterEffectsActivated[targetController]) || 0) < 10){
    modifier += 7;
  }
  if(state?.gameSettings?.pressureCardReworks !== true && activeAuraSource(state, entry) && selfId === '64' && duelistTarget(state, entry)){
    modifier += 3 * adjacencyMultiplier;
  }
  if(state?.gameSettings?.pressureCardReworks !== true){
    for(const duelist of boardEntries(state)){
      if(runtimeRuleId(duelist.card) !== '64') continue;
      const target = duelistTarget(state, duelist);
      if(target && String(target.card.iid) === String(card.iid)) modifier -= 3;
    }
  }
  for(const flowerKing of boardEntries(state)){
    if(runtimeRuleId(flowerKing.card) !== 'bh12' || !activeAuraSource(state, flowerKing)) continue;
    if(controllerOf(flowerKing.card) !== targetController || isEffectImmutable(card)) continue;
    const blessed = (state?.geometry?.squareStatuses || []).some(status=>
      status?.type === 'FLOWER_KING_BLESSED'
      && String(status.sourceIid || '') === String(flowerKing.card.iid || '')
      && Number(status.z) === Number(entry.z)
      && Number(status.r) === Number(entry.r)
      && Number(status.c) === Number(entry.c)
    );
    if(!blessed || flowerKing.z !== entry.z || Math.abs(flowerKing.r - entry.r) + Math.abs(flowerKing.c - entry.c) !== 1) continue;
    modifier += 6 * adjacencyBonusMultiplier(state, entry.z, controllerOf(flowerKing.card));
  }
  if(activeAuraSource(state, entry) && selfId === '100'){
    // Every printed Felicyta/Květka card qualifies. Keep this explicit so a
    // copied effect or a coincidental name cannot satisfy Wintertide, but do
    // include Květka (Ukulele), whose card id is 87.
    const relatedIds = new Set(['01', '19', '82', '84', '85', '87', '100']);
    if(boardEntries(state).some(source=>
      controllerOf(source.card) === targetController
      && String(source.card.iid || '') !== String(card.iid || '')
      && relatedIds.has(String(source.card.id || ''))
    )) modifier += 3;
  }
  const overflowDebuff = Math.max(0, Number(card.counters?.permanentFateOverflowDebuff) || 0);
  // A permanent loss consumes stored Fate first. Any remainder continues into
  // continuous bonuses, so an 8-Fate card always becomes 5 after a -3 effect,
  // without deleting the underlying Louis aura.
  return Math.max(0, derived + modifier - overflowDebuff - moraleCardPenalty);
}

export function zoneActionBlock(state, playerIndex, zone){
  const player = Number(playerIndex);
  const targetZone = Number(zone);
  return state?.statuses?.find(status=>
    status?.type === 'TIMED_PLAYER_STATUS'
    && status.statusType === 'ZONE_ACTIONS_BLOCKED'
    && Number(status.playerIndex) === player
    && Number(status.zone) === targetZone
    && Number(status.activeFromTurn) <= Number(state.turn)
    && Number(status.remainingTargetTurns) > 0
  ) || null;
}

function isAdjacent(a, b){
  return a.z === b.z && Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

export function effectiveReinforcement(state, entry, playerIndex){
  const card = entry?.card;
  if(!card || controllerOf(card) !== Number(playerIndex)) return 0;
  let value = runtimeRuleId(card) === '09' ? 2 : 1;
  value += Number(card.counters?.reinforcementBonus || 0) || 0;
  for(const status of card.statuses || []){
    if(String(status).startsWith('REINFORCEMENT:')) value += Number(String(status).slice(14)) || 0;
  }
  if(state?.landscapeId === 'igb10'
    && effectiveCardType(state, card) === 'Supporter'
    && String(card.affiliation || '') === 'third_great_war'
    && !isEffectImmutable(card)){
    value += 1;
  }
  for(const ralph of boardEntries(state)){
    if(runtimeRuleId(ralph.card) !== '24' || controllerOf(ralph.card) !== Number(playerIndex)) continue;
    if(isAdjacent(entry, ralph)) value += adjacencyBonusMultiplier(state, entry.z, playerIndex);
  }
  return Math.max(0, value);
}

export function canUseAsConsolidationTribute(state, entry, playerIndex, consolidationCard = null){
  const card = entry?.card;
  if(!card || entry.zone !== 'board') return rejection('INVALID_TRIBUTE', 'tribute must be on the board');
  if(controllerOf(card) !== Number(playerIndex)) return rejection('INVALID_TRIBUTE', 'tribute is not controlled by the consolidating player');
  // Chloe changes the card's effect-facing label, not how its physical card is
  // played. A printed Supporter remains a reinforcement tribute, while a
  // printed Character declared Supporter does not become one.
  const cardType = structuralCardType(state, card);
  if(cardType !== 'Supporter'){
    if(['99', '100'].includes(String(consolidationCard?.id || ''))){
      if(isEffectImmutable(card)){
        return rejection('INVALID_TRIBUTE_TYPE', 'an immutable Character cannot be used for this consolidation');
      }
      return {ok:true, reinforcement:1};
    }
    const irvinePermission = boardEntries(state).some(source=>
      source.z === entry.z
      && runtimeRuleId(source.card) === '49'
      && controllerOf(source.card) === Number(playerIndex)
      && source.card.faceDown !== true
      && !source.card.statuses?.includes('EFFECTS_SUPPRESSED')
    );
    if(!irvinePermission || isEffectImmutable(card)){
      return rejection('INVALID_TRIBUTE_TYPE', 'only Supporters are eligible for this consolidation');
    }
    return {ok:true, reinforcement:1};
  }
  if(((String(card.id || '') === '62' && !isEffectSourceSuppressed(state, entry))
      || String(card.id || '') === '76')
    || card.noConsolidate === true
    || (card.statuses || []).includes('CANNOT_CONSOLIDATE')){
    return rejection('TRIBUTE_PREVENTED', 'the selected card cannot be used for consolidation');
  }
  return {ok:true, reinforcement:effectiveReinforcement(state, entry, playerIndex)};
}

export function effectiveConsolidationCost(state, card, playerIndex, destination = null){
  if(state?.testRules?.zeroReinforcementCost === true) return 0;
  let cost = effectiveCost(state, card);
  for(const status of state?.statuses || []){
    if(status?.type !== 'CONSOLIDATION_COST_MODIFIER') continue;
    if(Number(status.playerIndex) !== Number(playerIndex)) continue;
    if(Number(status.remaining || 0) <= 0) continue;
    cost += Number(status.value || 0) || 0;
  }
  if(destination){
    if(state?.landscapeId === 'igb22'
      && Array.isArray(state.landscapeState?.targetZones)
      && state.landscapeState.targetZones.map(Number).includes(Number(destination.z))) cost += 1;
    const generatedSquare = (state?.geometry?.playableExtraSquares || []).find(square=>
      Number(square.z) === Number(destination.z)
      && Number(square.r) === Number(destination.r)
      && Number(square.c) === Number(destination.c)
      && Number(square.owner) === Number(playerIndex)
      && String(findCard(state, square.sourceIid)?.card?.id || '') === '02'
    );
    if(generatedSquare) cost -= 2;
  }
  return Math.max(0, cost);
}

export function isImmuneToOpponentEffects(card, state = null){
  if(!card) return false;
  if(['bh01', '76'].includes(String(card.id || ''))) return true;
  return (card.statuses || []).includes('IMMUNE_TO_OPPONENT_EFFECTS');
}

export function isEffectImmutable(card){
  if(!card) return false;
  if(['bh01', '76'].includes(String(card.id || ''))) return true;
  return (card.statuses || []).some(status=>
    status === 'IMMUNE_TO_ALL_EFFECTS'
    || status === 'EFFECT_IMMUTABLE'
    || status === 'HAND_EFFECT_IMMUNE'
  );
}

export function canTarget(state, source, target, operation){
  if(!target) return rejection('TARGET_NOT_FOUND', 'the target card no longer exists');
  const intrinsicSelfEffect = String(source?.iid || '') === String(target.iid || '');
  if(isEffectImmutable(target) && !intrinsicSelfEffect){
    return rejection('TARGET_IMMUNE', 'the target is immune to card effects', {targetIid:target.iid});
  }
  const sourceController = Number(operation?.sourceController ?? controllerOf(source));
  const targetController = controllerOf(target);
  if(sourceController !== targetController && isImmuneToOpponentEffects(target, state)){
    return rejection('TARGET_IMMUNE', 'the target is immune to opponent effects', {targetIid:target.iid});
  }
  return {ok:true};
}

export function canMove(state, card, destination, operation = {}){
  if(!card) return rejection('CARD_NOT_FOUND', 'the moving card no longer exists');
  if((card.statuses || []).includes('CANNOT_MOVE') || card.cantBeMoved === true){
    return rejection('MOVE_PREVENTED', 'the card cannot be moved', {cardIid:card.iid});
  }
  if(!isBoardCoordinate(state, destination)){
    return rejection('INVALID_DESTINATION', 'the destination is not a board square');
  }
  const occupied = boardCardAt(state, destination);
  if(occupied && !operation.allowSwap){
    return rejection('DESTINATION_OCCUPIED', 'the destination is occupied');
  }
  return {ok:true};
}

export function inspectOperation(state, operation){
  const targetEntry = operation.targetIid ? findCard(state, operation.targetIid) : null;
  if([
    'DISCARD_CARD',
    'MODIFY_FATE',
    'SET_FATE',
    'CHANGE_CARD_TYPE',
    'CHANGE_CONTROL',
    'CREATE_CARD_MARK',
    'TRANSFER_CARDS'
  ].includes(operation.type)){
    const targetCheck = canTarget(state, operation.sourceCard, targetEntry?.card, operation);
    if(!targetCheck.ok) return targetCheck;
  }
  if(operation.type === 'MOVE_CARD'){
    const sourceEntry = findCard(state, operation.cardIid);
    const targetCheck = canTarget(state, operation.sourceCard, sourceEntry?.card, operation);
    if(!targetCheck.ok) return targetCheck;
    return canMove(state, sourceEntry?.card, operation.destination, operation);
  }
  return {ok:true, operation};
}
