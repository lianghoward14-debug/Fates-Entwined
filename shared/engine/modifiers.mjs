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
  if(globalOverride && String(card?.type || '') === 'Supporter') return 'Character';
  const override = (card?.statuses || []).find(status=>String(status).startsWith('TYPE:'));
  return override ? String(override).slice(5) : String(card?.type || '');
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

function activeAuraSource(state, entry){
  if(!entry?.card
    || entry.card.faceDown === true
    || entry.card.statuses?.includes('EFFECTS_SUPPRESSED')) return false;
  if(String(entry.card.type || '') === 'Coordinator'){
    const suppressed = squareStatuses(state, entry, 'COORDINATOR_SUPPRESSED').some(status=>{
      if(Number(status.blockedPlayer) !== controllerOf(entry.card)) return false;
      const source = findBoardCard(state, status.sourceIid);
      return !!source
        && String(source.card.id || '') === '21'
        && source.card.faceDown !== true
        && !source.card.statuses?.includes('EFFECTS_SUPPRESSED');
    });
    if(suppressed) return false;
  }
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
  if(!activeAuraSource(state, sourceEntry) || runtimeRuleId(sourceEntry.card) !== '64') return null;
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

export function effectiveFate(state, entryOrCard){
  const entry = entryOrCard?.card
    ? entryOrCard
    : findCard(state, entryOrCard?.iid);
  const card = entry?.card || entryOrCard;
  if(!card || entry?.zone !== 'board' || card.faceDown === true) return 0;
  const stored = Math.max(0, Number(card.currentFate) || 0);
  if(isEffectImmutable(card)) return stored;
  const targetController = controllerOf(card);
  const targetType = effectiveCardType(state, card);
  const selfId = runtimeRuleId(card);
  const permanentAdjustment = (Number(card.currentFate) || 0) - (Number(card.baseFate) || 0);
  // Jimmy's own passive establishes his dynamic base Fate. It does not make
  // him immune to other cards: ordinary auras and penalties (including an
  // adjacent Soviet Grenadier) are applied to that base below.
  const derived = activeAuraSource(state, entry) && selfId === '41'
    ? Math.max(0, Number(state.fateReductionEffectUses[targetController] || 0) * 3 + permanentAdjustment)
    : (activeAuraSource(state, entry) && selfId === '35'
      ? boardEntries(state)
        .filter(source=>
          source.z === entry.z
          && String(source.card.iid) !== String(card.iid)
          && controllerOf(source.card) === targetController
          && source.card.faceDown !== true
          && effectiveCardType(state, source.card) === 'Supporter'
        )
        .reduce((sum, source)=>sum + effectiveFate(state, source), 0) + permanentAdjustment
      : stored);
  let modifier = 0;
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
      modifier += 4 + coordinatorAuraPotencyBoost(state, source);
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
      modifier += adjacentDauntless * (2 + coordinatorAuraPotencyBoost(state, source));
    }
  }
  if(activeAuraSource(state, entry) && selfId === '44'){
    const hasAdjacentDauntless = boardEntries(state).some(peer=>
      peer.z === entry.z
      && controllerOf(peer.card) === targetController
      && peer.card.faceDown !== true
      && effectiveCardType(state, peer.card) === 'Dauntless'
      && Math.abs(peer.r - entry.r) + Math.abs(peer.c - entry.c) === 1
    );
    if(hasAdjacentDauntless) modifier += 3;
  }
  if(targetType === 'Dauntless'){
    const grenadiers = boardEntries(state).filter(source=>
      source.z === entry.z
      && controllerOf(source.card) === targetController
      && runtimeRuleId(source.card) === '44'
      && activeAuraSource(state, source)
      && Math.abs(source.r - entry.r) + Math.abs(source.c - entry.c) === 1
    ).length;
    modifier += grenadiers * 3;
  }
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
  if(activeAuraSource(state, entry) && selfId === '64' && duelistTarget(state, entry)){
    modifier += 3;
  }
  for(const duelist of boardEntries(state)){
    if(runtimeRuleId(duelist.card) !== '64') continue;
    const target = duelistTarget(state, duelist);
    if(target && String(target.card.iid) === String(card.iid)) modifier -= 3;
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
  const effective = Math.max(0, derived + modifier);
  const permanentCeiling = Number(card.counters?.permanentFateCeiling);
  // Match the shipping single-player rule: a permanent Fate reduction caps
  // the card's complete effective value, including continuous bonuses, until
  // later permanent gains lift that ceiling.
  return Number.isFinite(permanentCeiling)
    ? Math.min(effective, Math.max(0, permanentCeiling))
    : effective;
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
    if(isAdjacent(entry, ralph)) value += 1;
  }
  return Math.max(0, value);
}

export function canUseAsConsolidationTribute(state, entry, playerIndex, consolidationCard = null){
  const card = entry?.card;
  if(!card || entry.zone !== 'board') return rejection('INVALID_TRIBUTE', 'tribute must be on the board');
  if(controllerOf(card) !== Number(playerIndex)) return rejection('INVALID_TRIBUTE', 'tribute is not controlled by the consolidating player');
  const cardType = effectiveCardType(state, card);
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
  if(['62', '76'].includes(String(card.id || ''))
    || card.noConsolidate === true
    || (card.statuses || []).includes('CANNOT_CONSOLIDATE')){
    return rejection('TRIBUTE_PREVENTED', 'the selected card cannot be used for consolidation');
  }
  return {ok:true, reinforcement:effectiveReinforcement(state, entry, playerIndex)};
}

export function effectiveConsolidationCost(state, card, playerIndex){
  if(state?.testRules?.zeroReinforcementCost === true) return 0;
  let cost = effectiveCost(state, card);
  for(const status of state?.statuses || []){
    if(status?.type !== 'CONSOLIDATION_COST_MODIFIER') continue;
    if(Number(status.playerIndex) !== Number(playerIndex)) continue;
    if(Number(status.remaining || 0) <= 0) continue;
    cost += Number(status.value || 0) || 0;
  }
  return Math.max(0, cost);
}

export function isImmuneToOpponentEffects(card, state = null){
  if(!card) return false;
  if(runtimeRuleId(card) === '20'){
    return state ? findCard(state, card.iid)?.zone === 'board' : true;
  }
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
