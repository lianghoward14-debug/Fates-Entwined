import {MAX_SUPPORTERS_SET_PER_TURN, OPERATION_TYPES, RULE_EVENT_TYPES} from './constants.mjs';
import {
  canUseAsConsolidationTribute,
  effectiveFate,
  effectiveConsolidationCost,
  inspectOperation,
  isEffectImmutable,
  isEffectSourceSuppressed,
  runtimeRuleId,
  structuralCardType
} from './modifiers.mjs';
import {
  boardEntries,
  boardCardAt,
  controllerOf,
  findBoardCard,
  findCard,
  isBoardCoordinate,
  rowOwner,
  squareKey,
  squareStatuses
} from './selectors.mjs';
import {nextInt, shuffleInPlace} from './rng.mjs';
import {collectTriggeredOperations} from './triggers.mjs';
import {
  recordLandscapeRuleEvent,
  queueLandscapeRuleEventFrame,
  replaceLandscapeState,
  stampCaliforniqueHandCard
} from './landscapes/runtime.mjs';
import {cloneSerializable} from './serialization.mjs';
import {zoneScore} from './scoring.mjs';
import {modifyCardPressure, modifyMorale, recordMoralePressureRuleEvent, refreshMoralePressure} from './morale-pressure.mjs';

function operationError(code, reason, details = {}){
  const error = new Error(reason);
  error.code = code;
  error.details = details;
  return error;
}

export function emitRuleEvent(ctx, event){
  ctx.ruleEvents.push(event);
  ctx.events.push(event);
  recordMoralePressureRuleEvent(ctx, event);
  recordLandscapeRuleEvent(ctx.state, event);
  const followUps = collectTriggeredOperations(ctx.state, event);
  for(const operation of followUps) applyOperation(ctx, operation);
  queueLandscapeRuleEventFrame(ctx.state, event);
}

const emit = emitRuleEvent;

function cardSource(ctx, operation){
  return operation.sourceIid ? findCard(ctx.state, operation.sourceIid)?.card || null : null;
}

function applyHandArrivalModifiers(ctx, playerIndex, card){
  if(!card || String(card.id || '') === '70' || ['Supporter', 'Counter'].includes(String(card.type || ''))){
    return;
  }
  const pending = ctx.state.statuses.find(status=>
    status?.type === 'NEXT_CHARACTER_HAND_ARRIVAL'
    && Number(status.playerIndex) === playerIndex
  );
  if(!pending) return;
  ctx.state.statuses = ctx.state.statuses.filter(status=>status.statusId !== pending.statusId);
  const source = pending.sourceIid ? findCard(ctx.state, pending.sourceIid)?.card : null;
  if(source && isEffectSourceSuppressed(ctx.state, source)){
    ctx.events.push({type:'STATUS_REMOVED', statusId:pending.statusId, reason:'SOURCE_SUPPRESSED'});
    return;
  }
  const fateBonus = Number(pending.fateBonus || 0) || 0;
  const costDelta = Number(pending.costDelta || 0) || 0;
  const before = Number(card.currentFate) || 0;
  if(fateBonus && !isEffectImmutable(card)) commitPermanentFate(card, before + fateBonus);
  card.counters.handCostDelta = (Number(card.counters.handCostDelta) || 0) + costDelta;
  ctx.events.push({
    type:'HAND_ARRIVAL_MODIFIED',
    privateTo:[playerIndex],
    playerIndex,
    cardIid:card.iid,
    sourceIid:pending.sourceIid || null,
    fateAmount:card.currentFate - before,
    costDelta
  });
}

function applySpecialHandArrival(ctx, playerIndex, card){
  if(!card) return playerIndex;
  if(String(card.id || '') === '74'){
    const activeNow = ctx.state.activePlayer === playerIndex;
    if(activeNow){
      ctx.state.extraSupportersThisTurn[playerIndex] += 1;
    }else{
      ctx.state.queuedExtraSupporters[playerIndex] += 1;
    }
    // Keep the source-specific presentation contract authoritative.  The
    // numeric counter is also changed by Maja, so it cannot by itself tell the
    // client that A New Pacifica is the active bonus.  Pending grants become
    // active on their controller's next turn and active grants expire at that
    // turn's end through the normal owner-turn status lifecycle.
    ctx.state.statuses.push({
      statusId:`selva-support:${card.iid}:t${ctx.state.turn}:e${ctx.events.length}`,
      type:'SELVA_EXTRA_SUPPORTER',
      playerIndex,
      sourceIid:card.iid,
      extraSupports:1,
      activeNow,
      remainingOwnerTurns:activeNow ? 1 : null
    });
    ctx.events.push({
      type:'EXTRA_SUPPORTER_SET_GRANTED',
      playerIndex,
      activeNow,
      sourceIid:card.iid
    });
  }
  if(String(card.id || '') === 'bh05' && card.counters?.taylorArrivalDuplicate !== true){
    ctx.state.instanceCounter += 1;
    const duplicate = cloneSerializable(card);
    duplicate.iid = `${ctx.state.matchId}:p${playerIndex}:c${ctx.state.instanceCounter}`;
    duplicate.counters = {...duplicate.counters, taylorArrivalDuplicate:true};
    ctx.state.players[playerIndex].hand.push(duplicate);
    ctx.events.push({
      type:'CARD_COPIED_TO_HAND',
      privateTo:[playerIndex],
      playerIndex,
      sourceIid:card.iid,
      cardIid:duplicate.iid
    });
  }
  if(String(card.id || '') === 'bh03'){
    const hand = ctx.state.players[playerIndex].hand;
    const index = hand.findIndex(item=>String(item.iid) === String(card.iid));
    if(index >= 0) hand.splice(index, 1);
    const recipient = playerIndex === 0 ? 1 : 0;
    card.counters = {
      ...(card.counters || {}),
      aliTransferredFrom:playerIndex,
      aliHandLimitPendingUntilTurnStart:true
    };
    card.owner = recipient;
    card.controller = recipient;
    if(!card.statuses.includes('OPPONENT_HAND_LIMIT_6')) card.statuses.push('OPPONENT_HAND_LIMIT_6');
    if(!card.statuses.includes('HAND_EFFECT_IMMUNE')) card.statuses.push('HAND_EFFECT_IMMUNE');
    card.statuses.sort();
    ctx.state.players[recipient].hand.push(card);
    ctx.events.push({
      type:'CARD_TRANSFERRED',
      playerIndex:recipient,
      fromPlayerIndex:playerIndex,
      from:'hand',
      to:'hand',
      cardIid:card.iid,
      card:cloneSerializable(card),
      privateTo:[playerIndex, recipient],
      reason:'ALI_INDOMITABLE'
    });
    return recipient;
  }
  return playerIndex;
}

function drawCards(ctx, operation){
  const playerIndex = Number(operation.playerIndex);
  const player = ctx.state.players[playerIndex];
  if(!player) throw operationError('PLAYER_NOT_FOUND', 'draw player is invalid');
  const count = Math.max(0, Number(operation.count || 1) || 0);
  const drawn = [];
  if(operation.activatedEffect === true){
    emit(ctx, {
      type:RULE_EVENT_TYPES.DRAW_EFFECT_ACTIVATED,
      playerIndex,
      sourceIid:operation.sourceIid || null,
      semanticSourceCardId:operation.semanticSourceCardId || undefined
    });
  }
  for(let index = 0; index < count; index += 1){
    const card = player.deck.shift();
    if(!card) break;
    const watcherStatuses = operation.activatedEffect === false
      ? ctx.state.statuses.filter(status=>
          status?.type === 'FORT_CALVIN_WATCHER'
          && Number(status.playerIndex) === playerIndex
          && Number(status.remaining || 0) > 0
        )
      : [];
    let redirected = false;
    for(const status of watcherStatuses){
      status.remaining = Math.max(0, Number(status.remaining) - 1);
      const isCharacter = !['Supporter', 'Counter'].includes(String(card.type || ''));
      ctx.events.push({
        type:'DRAW_REVEALED',
        playerIndex,
        cardIid:card.iid,
        cardId:card.id,
        name:card.name,
        sourceIid:status.sourceIid || null
      });
      if(isCharacter && status.characterRedirected !== true){
        status.characterRedirected = true;
        redirected = true;
      }
    }
    ctx.state.statuses = ctx.state.statuses.filter(status=>
      status?.type !== 'FORT_CALVIN_WATCHER' || Number(status.remaining || 0) > 0
    );
    if(redirected){
      player.deck.push(card);
      emit(ctx, {
        type:RULE_EVENT_TYPES.CARD_DRAWN,
        playerIndex,
        cardIid:card.iid,
        sourceIid:operation.sourceIid || null,
        semanticSourceCardId:operation.semanticSourceCardId || undefined,
        activatedEffect:false,
        redirectedToDeckBottom:true
      });
      continue;
    }
    player.hand.push(card);
    applyHandArrivalModifiers(ctx, playerIndex, card);
    applySpecialHandArrival(ctx, playerIndex, card);
    stampCaliforniqueHandCard(ctx.state, playerIndex, card);
    drawn.push(card.iid);
    const erbsSources = boardEntries(ctx.state).filter(entry=>
      controllerOf(entry.card) === playerIndex
      && String(entry.card.id || '') === '40'
      && (entry.card.statuses || []).includes('NEXT_DRAW_GAINS_6')
    );
    for(const source of erbsSources){
      changeStatus(ctx, {
        type:OPERATION_TYPES.REMOVE_STATUS,
        targetIid:source.card.iid,
        status:'NEXT_DRAW_GAINS_6',
        sourceIid:source.card.iid
      }, true);
      if(!isEffectImmutable(card)){
        changeFate(ctx, {
          type:OPERATION_TYPES.MODIFY_FATE,
          targetIid:card.iid,
          amount:6,
          sourceIid:source.card.iid,
          sourceController:playerIndex,
          reason:'CHRISTOPHER_ERBS_NEXT_DRAW'
        }, false);
      }
    }
    emit(ctx, {
      type:RULE_EVENT_TYPES.CARD_DRAWN,
      playerIndex,
      cardIid:card.iid,
      sourceIid:operation.sourceIid || null,
      semanticSourceCardId:operation.semanticSourceCardId || undefined,
      activatedEffect:operation.activatedEffect === true
    });
  }
  return {drawnIids:drawn};
}

function setCard(ctx, operation){
  const playerIndex = Number(operation.playerIndex);
  const player = ctx.state.players[playerIndex];
  if(!player) throw operationError('PLAYER_NOT_FOUND', 'set player is invalid');
  const handIndex = player.hand.findIndex(card=>String(card.iid) === String(operation.cardIid));
  if(handIndex < 0) throw operationError('CARD_NOT_IN_HAND', 'the card is not in the player hand');
  if(!isBoardCoordinate(ctx.state, operation.destination)){
    throw operationError('INVALID_DESTINATION', 'the destination is not a board square');
  }
  if(boardCardAt(ctx.state, operation.destination)){
    throw operationError('DESTINATION_OCCUPIED', 'the destination is occupied');
  }
  if(!Array.isArray(ctx.state.supportersSetForCapThisTurn)){
    ctx.state.supportersSetForCapThisTurn = [0, 0];
  }
  const settingPrintedSupporter = structuralCardType(ctx.state, player.hand[handIndex]) === 'Supporter'
    && operation.consolidated !== true;
  if(settingPrintedSupporter
    && Number(ctx.state.supportersSetForCapThisTurn[playerIndex] || 0) >= MAX_SUPPORTERS_SET_PER_TURN){
    throw operationError(
      'SUPPORTER_HARD_CAP_REACHED',
      `no player may set more than ${MAX_SUPPORTERS_SET_PER_TURN} Supporters in one turn`,
      {cap:MAX_SUPPORTERS_SET_PER_TURN}
    );
  }
  const {z, r, c} = operation.destination;
  if(squareStatuses(ctx.state, operation.destination, 'PERMANENTLY_BLOCKED').length){
    throw operationError('SQUARE_BLOCKED', 'the destination square is permanently blocked');
  }
  if(ctx.state.gameSettings?.pressureCardReworks !== true && String(player.hand[handIndex].id || '') === '65' && Number(r) !== 1){
    throw operationError('ILLEGAL_PLACEMENT', '1st West Caribbea Marines must be set in a contested row');
  }
  const destinationOwner = rowOwner(ctx.state, z, r);
  if(operation.allowOpponentSide !== true
    && destinationOwner !== -1
    && destinationOwner !== playerIndex){
    throw operationError('ILLEGAL_PLACEMENT', 'the destination is not on the player side');
  }
  if(String(player.hand[handIndex].type || '') === 'Supporter'){
    const alondraBlock = boardEntries(ctx.state).some(source=>
      source.z === z
      && String(source.card.id || '') === '14'
      && controllerOf(source.card) !== playerIndex
      && source.card.faceDown !== true
      && !isEffectSourceSuppressed(ctx.state, source)
      && Math.abs(source.r - r) + Math.abs(source.c - c) === 1
    );
    if(alondraBlock){
      throw operationError('ILLEGAL_PLACEMENT', 'Alondra blocks an adjacent opponent Supporter set');
    }
  }
  const card = player.hand.splice(handIndex, 1)[0];
  card.controller = playerIndex;
  card.faceDown = operation.faceDown === true;
  ctx.state.board[z][r][c] = card;
  if(String(card.type || '') === 'Supporter'){
    ctx.state.supportersSetTotal[playerIndex] += 1;
  }
  if(String(card.id || '') === 'bh03'){
    card.statuses = card.statuses.filter(status=>
      !['OPPONENT_HAND_LIMIT_6', 'HAND_EFFECT_IMMUNE'].includes(status)
    );
  }
  if(String(card.id || '') === '70' && card.statuses.includes('GUERILLA_INFILTRATING')){
    throw operationError('CARD_CANNOT_BE_SET', 'Wine Country Guerilla cannot be set while infiltrating a hand');
  }
  ctx.state.cardsPlacedThisTurn[playerIndex] += 1;
  if(settingPrintedSupporter){
    ctx.state.supportersSetForCapThisTurn[playerIndex] += 1;
    if(ctx.state.supportersSetForCapThisTurn[playerIndex] === MAX_SUPPORTERS_SET_PER_TURN){
      emit(ctx, {
        type:'SUPPORTER_HARD_CAP_REACHED',
        playerIndex,
        cap:MAX_SUPPORTERS_SET_PER_TURN
      });
    }
  }
  if(operation.countTowardSupporterLimit === true){
    ctx.state.supportersSetThisTurn[playerIndex] += 1;
  }
  emit(ctx, {
    type:RULE_EVENT_TYPES.CARD_SET,
    playerIndex,
    cardIid:card.iid,
    destination:{z, r, c},
    playedFromHand:operation.playedFromHand === true,
    consolidated:operation.consolidated === true
  });
  return {cardIid:card.iid, destination:{z, r, c}};
}

function consolidateCard(ctx, operation){
  const playerIndex = Number(operation.playerIndex);
  const player = ctx.state.players[playerIndex];
  if(!player) throw operationError('PLAYER_NOT_FOUND', 'consolidating player is invalid');
  const handEntry = findCard(ctx.state, operation.cardIid);
  if(!handEntry || handEntry.zone !== 'hand' || handEntry.playerIndex !== playerIndex){
    throw operationError('CARD_NOT_IN_HAND', 'the consolidated card is not in the player hand');
  }
  if(String(handEntry.card.type || '') === 'Supporter'){
    throw operationError('INVALID_CONSOLIDATION_CARD', 'only Character cards can be consolidated');
  }
  const tributeIids = Array.isArray(operation.tributeIids) ? operation.tributeIids.map(String) : [];
  if(!tributeIids.length) throw operationError('TRIBUTES_REQUIRED', 'consolidation requires at least one tribute');
  if(new Set(tributeIids).size !== tributeIids.length){
    throw operationError('DUPLICATE_TRIBUTE', 'a tribute cannot be selected twice');
  }
  const tributes = tributeIids.map(iid=>findBoardCard(ctx.state, iid));
  if(tributes.some(entry=>!entry)) throw operationError('TRIBUTE_NOT_FOUND', 'a selected tribute is no longer on the board');
  let reinforcement = 0;
  for(const entry of tributes){
    const eligibility = canUseAsConsolidationTribute(ctx.state, entry, playerIndex, handEntry.card);
    if(!eligibility.ok){
      throw operationError(eligibility.rejection.code, eligibility.rejection.reason, eligibility.rejection.details);
    }
    reinforcement += eligibility.reinforcement;
  }
  const cost = effectiveConsolidationCost(ctx.state, handEntry.card, playerIndex);
  if(reinforcement < cost){
    throw operationError('INSUFFICIENT_REINFORCEMENT', `consolidation requires ${cost} reinforcement`, {cost, reinforcement});
  }
  const destinationEntry = tributes.find(entry=>
    entry.z === Number(operation.destination?.z)
    && entry.r === Number(operation.destination?.r)
    && entry.c === Number(operation.destination?.c)
  );
  if(!destinationEntry){
    throw operationError('INVALID_DESTINATION', 'the consolidated card must occupy a selected tribute square');
  }
  const blockedSquare = [destinationEntry, ...tributes].find(entry=>
    squareStatuses(ctx.state, entry, 'CONSOLIDATION_BLOCKED').some(status=>
      Number(status.blockedPlayer) === playerIndex
    )
  );
  if(blockedSquare){
    throw operationError('CONSOLIDATION_SQUARE_BLOCKED', 'Zoe prevents consolidation on or from this square');
  }
  const characterEntries = boardEntries(ctx.state).filter(entry=>
    entry.z === destinationEntry.z
    && controllerOf(entry.card) === playerIndex
    && !tributeIids.includes(String(entry.card.iid))
    && String(entry.card.type || '') !== 'Supporter'
  );
  if(String(handEntry.card.id || '') === '45'){
    if(characterEntries.length){
      throw operationError('CHINGACHLOOK_ZONE_RESTRICTED', 'Chingachlook requires a zone with no other friendly Character');
    }
    if(ctx.state.gameSettings?.pressureCardReworks !== true && boardEntries(ctx.state).some(entry=>
      String(entry.card.id || '') === '45'
      && Number(entry.card.owner) === playerIndex
      && !tributeIids.includes(String(entry.card.iid))
    )){
      throw operationError('UNIQUE_CARD_ALREADY_PLAYED', 'only one Chingachlook copy can be played');
    }
  }else if(characterEntries.some(entry=>
    String(entry.card.id || '') === '45'
    && entry.card.faceDown !== true
    && !isEffectSourceSuppressed(ctx.state, entry)
  )){
    throw operationError('CHINGACHLOOK_ZONE_RESTRICTED', 'Chingachlook forbids another friendly Character in this zone');
  }
  const colomboRestricted = boardEntries(ctx.state).some(entry=>
    entry.z === destinationEntry.z
    && runtimeRuleId(entry.card) === '53'
    && controllerOf(entry.card) !== playerIndex
    && !isEffectSourceSuppressed(ctx.state, entry)
  );
  if(colomboRestricted && tributes.some(entry=>entry.z !== destinationEntry.z)){
    throw operationError('CROSS_ZONE_TRIBUTE_PREVENTED', 'Colombo Thug requires all tributes to come from the destination zone');
  }
  const pressureReworks = ctx.state.gameSettings?.pressureCardReworks === true;
  const consolidationBonusCardId = pressureReworks ? '73' : '47';
  const greatOakCount = tributes.reduce((sum, entry)=>sum + (String(entry.card.id || '') === consolidationBonusCardId && !isEffectSourceSuppressed(ctx.state, entry) ? 1 : 0), 0);
  const greatOakBonus = greatOakCount * (pressureReworks ? 4 : 3);
  const reservedIndex = player.hand.findIndex(card=>String(card.iid) === String(handEntry.card.iid));
  const reservedCard = player.hand.splice(reservedIndex, 1)[0];
  for(const entry of tributes){
    discardCard(ctx, {
      type:OPERATION_TYPES.DISCARD_CARD,
      targetIid:entry.card.iid,
      sourceIid:handEntry.card.iid,
      sourceController:playerIndex,
      bypassReaction:true,
      reason:'CONSOLIDATION_TRIBUTE'
    });
  }
  player.hand.splice(Math.min(reservedIndex, player.hand.length), 0, reservedCard);
  const placement = setCard(ctx, {
    type:OPERATION_TYPES.SET_CARD,
    playerIndex,
    cardIid:handEntry.card.iid,
    destination:{
      z:destinationEntry.z,
      r:destinationEntry.r,
      c:destinationEntry.c
    },
    faceDown:operation.faceDown === true,
    consolidated:true,
    playedFromHand:true
  });
  const placedCard = findBoardCard(ctx.state, placement.cardIid)?.card;
  if(greatOakBonus > 0 && !isEffectImmutable(placedCard)){
    changeFate(ctx, {
      type:OPERATION_TYPES.MODIFY_FATE,
      targetIid:placement.cardIid,
      amount:greatOakBonus,
      sourceIid:tributes.find(entry=>String(entry.card.id || '') === consolidationBonusCardId)?.card.iid,
      sourceController:playerIndex,
      reason:pressureReworks ? 'ALPINE_GLOBAL_MISSIONS_CONSOLIDATION' : 'GREAT_OAK_CONSOLIDATION'
    }, false);
  }
  emit(ctx, {
    type:RULE_EVENT_TYPES.CARD_CONSOLIDATED,
    playerIndex,
    cardIid:placement.cardIid,
    tributeIids,
    reinforcement,
    cost,
    destination:placement.destination,
    faceDown:operation.faceDown === true
  });
  for(const status of ctx.state.statuses){
    if(status?.type !== 'CONSOLIDATION_COST_MODIFIER') continue;
    if(Number(status.playerIndex) !== playerIndex) continue;
    status.remaining = Math.max(0, (Number(status.remaining) || 0) - 1);
    ctx.events.push({
      type:'STATUS_UPDATED',
      statusId:status.statusId,
      remaining:status.remaining,
      reason:'CONSOLIDATION_COMPLETED'
    });
  }
  ctx.state.statuses = ctx.state.statuses.filter(status=>
    status?.type !== 'CONSOLIDATION_COST_MODIFIER'
    || Number(status.remaining || 0) > 0
  );
  return {
    ...placement,
    tributeIids,
    reinforcement,
    cost,
    greatOakBonus
  };
}

function moveCard(ctx, operation){
  const entry = findBoardCard(ctx.state, operation.cardIid);
  if(!entry) throw operationError('CARD_NOT_ON_BOARD', 'the moving card is not on the board');
  const check = inspectOperation(ctx.state, {
    ...operation,
    sourceCard:cardSource(ctx, operation)
  });
  if(!check.ok) throw operationError(check.rejection.code, check.rejection.reason, check.rejection.details);
  const {z, r, c} = operation.destination;
  const destinationCard = boardCardAt(ctx.state, operation.destination);
  ctx.state.board[entry.z][entry.r][entry.c] = destinationCard || null;
  ctx.state.board[z][r][c] = entry.card;
  emit(ctx, {
    type:RULE_EVENT_TYPES.CARD_MOVED,
    cardIid:entry.card.iid,
    controller:controllerOf(entry.card),
    from:{z:entry.z, r:entry.r, c:entry.c},
    to:{z, r, c},
    swappedIid:destinationCard?.iid || null,
    sourceIid:operation.sourceIid || null,
    effectSourceIid:operation.effectSourceIid || null,
    reason:operation.reason || ''
  });
  return {cardIid:entry.card.iid, destination:{z, r, c}, swappedIid:destinationCard?.iid || null};
}

function discardCard(ctx, operation){
  const entry = findCard(ctx.state, operation.targetIid);
  if(!entry) throw operationError('CARD_NOT_FOUND', 'the discarded card no longer exists');
  if(operation.bypassTargeting !== true){
    const check = inspectOperation(ctx.state, {
      ...operation,
      sourceCard:cardSource(ctx, operation)
    });
    if(!check.ok) throw operationError(check.rejection.code, check.rejection.reason, check.rejection.details);
  }
  if(entry.zone === 'discard') throw operationError('ALREADY_DISCARDED', 'the card is already discarded');
  if(entry.zone === 'board'
    && String(entry.card.id || '') === '62'
    && !isEffectSourceSuppressed(ctx.state, entry)
    && Number(operation.sourceController) !== controllerOf(entry.card)
    && operation.berkeleyCostPaid !== true){
    throw operationError('ADDITIONAL_DISCARD_REQUIRED', 'discarding Berkeley Homeless with an opponent effect requires two hand discards');
  }
  if(String(entry.card.id || '') === '70'
    && !entry.card.statuses?.includes('GUERILLA_INFILTRATING')
    && operation.disableReplacement !== true){
    let card;
    if(entry.zone === 'board'){
      card = ctx.state.board[entry.z][entry.r][entry.c];
      ctx.state.board[entry.z][entry.r][entry.c] = null;
    }else{
      card = ctx.state.players[entry.playerIndex][entry.zone].splice(entry.index, 1)[0];
    }
    const originalOwner = Number(card.owner);
    const recipient = originalOwner === 0 ? 1 : 0;
    if(!card.statuses.includes('GUERILLA_INFILTRATING')) card.statuses.push('GUERILLA_INFILTRATING');
    if(!card.statuses.includes('HAND_EFFECT_IMMUNE')) card.statuses.push('HAND_EFFECT_IMMUNE');
    card.statuses.sort();
    card.counters.guerillaOriginalOwner = originalOwner;
    card.counters.guerillaTurnsRemaining = 5;
    ctx.state.players[recipient].hand.push(card);
    const infiltrationStatus = {
      statusId:`wine-country-guerilla:${card.iid}`,
      type:'WINE_COUNTRY_GUERILLA_INFILTRATION',
      playerIndex:recipient,
      sourceController:originalOwner,
      sourceIid:card.iid,
      // This decrements at the infiltrated player's turn start, alongside the
      // hidden card counter. Do not use remainingOwnerTurns: the generic end-
      // turn expiry pass would otherwise count each turn twice.
      remaining:5
    };
    ctx.state.statuses = ctx.state.statuses.filter(status=>status?.statusId !== infiltrationStatus.statusId);
    ctx.state.statuses.push(infiltrationStatus);
    ctx.events.push({type:'STATUS_CREATED', status:cloneSerializable(infiltrationStatus)});
    emit(ctx, {
      type:RULE_EVENT_TYPES.CARD_TRANSFERRED,
      cardIid:card.iid,
      from:entry.zone,
      to:'hand',
      playerIndex:recipient,
      privateTo:[recipient, originalOwner],
      sourceIid:operation.sourceIid || null,
      // This replacement belongs to the Guerilla being discarded, even when
      // another action (such as consolidation) supplied the grouping source.
      effectSourceIid:card.iid,
      reason:'WINE_COUNTRY_GUERILLA'
    });
    return {cardIid:card.iid, replacedBy:'OPPONENT_HAND'};
  }
  let card;
  if(entry.zone === 'board'){
    card = ctx.state.board[entry.z][entry.r][entry.c];
    ctx.state.board[entry.z][entry.r][entry.c] = null;
  }else{
    card = ctx.state.players[entry.playerIndex][entry.zone].splice(entry.index, 1)[0];
  }
  const owner = Number(card.owner);
  card.controller = owner;
  ctx.state.players[owner].discard.push(card);
  emit(ctx, {
    type:RULE_EVENT_TYPES.CARD_DISCARDED,
    cardIid:card.iid,
    owner,
    previousZone:entry.zone,
    ...(operation.revealDiscard === true ? {cardId:String(card.id || ''), cardName:String(card.name || 'Card')} : {}),
    sourceIid:operation.sourceIid || null,
    semanticSourceCardId:operation.semanticSourceCardId || undefined,
    // Preserve why the discard happened.  In particular, consolidation
    // tributes are a command cost, not the consolidating card's printed
    // discard effect.  Presentation/rules auditing must be able to tell those
    // two semantically different mutations apart without consulting reducer
    // internals.
    reason:operation.reason || ''
  });
  return {cardIid:card.iid};
}

function discardCards(ctx, operation){
  const targetIids = Array.isArray(operation.targetIids)
    ? operation.targetIids.map(String)
    : (String(operation.targetIid || '') ? [String(operation.targetIid)] : []);
  if(new Set(targetIids).size !== targetIids.length){
    throw operationError('DUPLICATE_TARGET', 'a discarded card cannot be selected twice');
  }
  if(operation.bypassTargeting !== true){
    const sourceCard = cardSource(ctx, operation);
    for(const targetIid of targetIids){
      const entry = findCard(ctx.state, targetIid);
      if(!entry) throw operationError('CARD_NOT_FOUND', 'a discarded card no longer exists');
      const check = inspectOperation(ctx.state, {...operation, targetIid, sourceCard});
      if(!check.ok) throw operationError(check.rejection.code, check.rejection.reason, check.rejection.details);
    }
  }
  const discarded = targetIids.map(targetIid=>discardCard(ctx, {...operation, targetIid}));
  return discarded.length === 1
    ? discarded[0]
    : {cardIids:discarded.map(item=>item.cardIid)};
}

function fateTargetIids(operation){
  const targetIids = Array.isArray(operation.targetIids)
    ? operation.targetIids.map(String)
    : (String(operation.targetIid || '') ? [String(operation.targetIid)] : []);
  if(new Set(targetIids).size !== targetIids.length){
    throw operationError('DUPLICATE_TARGET', 'a Fate target cannot be selected twice');
  }
  return targetIids;
}

function commitPermanentFate(card, nextValue){
  const before = Math.max(0, Number(card?.currentFate) || 0);
  const requested = Number(nextValue) || 0;
  const after = Math.max(0, requested);
  if(!card || !Number.isInteger(after)) throw operationError('INVALID_FATE', 'gameplay Fate must remain an integer');
  if(!card.counters || typeof card.counters !== 'object') card.counters = {};
  const oldCeiling = Number(card.counters.permanentFateCeiling);
  const overflowLoss = Math.max(0, -requested);
  if(requested < before){
    card.counters.permanentFateCeiling = Number.isFinite(oldCeiling)
      ? Math.min(Math.max(0, oldCeiling), after)
      : after;
    card.counters.permanentFateDebuffAmount = Math.max(0, Number(card.counters.permanentFateDebuffAmount) || 0) + (before - after) + overflowLoss;
    card.counters.permanentFateOverflowDebuff = Math.max(0, Number(card.counters.permanentFateOverflowDebuff) || 0) + overflowLoss;
  }else if(after > before && Number.isFinite(oldCeiling)){
    // Retain the legacy ceiling field for old serialized matches. Effective
    // Fate no longer uses it to erase continuous bonuses.
    card.counters.permanentFateCeiling = Math.max(0, oldCeiling) + (after - before);
  }
  card.currentFate = after;
  return {before, after};
}

function changeFate(ctx, operation, absolute){
  const targetIids = fateTargetIids(operation);
  if(!targetIids.length) return {cardIids:[], changes:[]};
  const amount = absolute ? 0 : Number(operation.amount ?? 0);
  const multiplier = absolute ? 1 : Number(operation.multiplier ?? 1);
  const value = absolute ? Number(operation.value) : 0;
  if(!Number.isInteger(amount) || !Number.isInteger(multiplier) || (absolute && !Number.isInteger(value))){
    throw operationError('INVALID_FATE', 'gameplay Fate transforms must use integers');
  }
  const sourceCard = cardSource(ctx, operation);
  for(const targetIid of targetIids){
    const entry = findCard(ctx.state, targetIid);
    const check = inspectOperation(ctx.state, {
      ...operation,
      targetIid,
      sourceCard
    });
    if(!check.ok) throw operationError(check.rejection.code, check.rejection.reason, check.rejection.details);
    if(!entry) throw operationError('CARD_NOT_FOUND', 'the Fate target no longer exists');
  }
  const changes = [];
  for(const targetIid of targetIids){
    const entry = findCard(ctx.state, targetIid);
    const beforeStored = Number(entry.card.currentFate) || 0;
    const before = entry.zone === 'board' ? effectiveFate(ctx.state, entry) : beforeStored;
    const baseTransformed = absolute ? value : (beforeStored * multiplier) + amount;
    const highTPlayer = Number.isInteger(Number(operation.sourceController))
      ? Number(operation.sourceController)
      : controllerOf(entry.card);
    const highTSources = !absolute && baseTransformed > beforeStored
      ? ctx.state.statuses.filter(status=>
          status?.type === 'PERMANENT_FATE_GAIN_POTENCY'
          && Number(status.playerIndex) === highTPlayer
          && Number(status.remainingOwnerTurns || 0) > 0
        )
      : [];
    const highTBonus = !absolute ? Math.max(0, baseTransformed - beforeStored) * highTSources.length : 0;
    const transformed = baseTransformed + highTBonus;
    if(!Number.isInteger(transformed)){
      throw operationError('INVALID_FATE', 'gameplay Fate must remain an integer');
    }
    const targetController = controllerOf(entry.card);
    const chineseMacArthurSources = transformed > beforeStored
      && String(operation.reason || '').toUpperCase() !== 'CHINESE_MACARTHUR_BONUS'
      ? boardEntries(ctx.state).filter(sourceEntry=>
          controllerOf(sourceEntry.card) === targetController
          && sourceEntry.card.faceDown !== true
          && runtimeRuleId(sourceEntry.card) === 'bh15'
          && !isEffectSourceSuppressed(ctx.state, sourceEntry)
        )
      : [];
    const chineseMacArthurBaseBonus = chineseMacArthurSources.length;
    const chineseMacArthurBonus = chineseMacArthurBaseBonus * (1 + highTSources.length);
    const chineseMacArthurPresentationSourceIids = chineseMacArthurSources.flatMap(sourceEntry=>
      Array.from({length:1 + highTSources.length}, ()=>String(sourceEntry.card.iid || ''))
    );
    commitPermanentFate(entry.card, transformed + chineseMacArthurBonus);
    const after = entry.zone === 'board'
      ? effectiveFate(ctx.state, findCard(ctx.state, targetIid))
      : Math.max(0, Number(entry.card.currentFate) || 0);
    emit(ctx, {
      type:RULE_EVENT_TYPES.FATE_CHANGED,
      cardIid:entry.card.iid,
      before,
      after,
      amount:after - before,
      sourceIid:operation.sourceIid || null,
      semanticSourceCardId:operation.semanticSourceCardId || undefined,
      reason:operation.reason || '',
      highTBonus,
      highTSourceIids:highTSources.map(status=>String(status.sourceIid || '')),
      bh15Bonus:chineseMacArthurBonus,
      bh15SourceIids:chineseMacArthurPresentationSourceIids
    });
    changes.push({cardIid:entry.card.iid, before, after, highTBonus, bh15Bonus:chineseMacArthurBonus});
  }
  if(!absolute && amount < 0 && Number.isInteger(Number(operation.sourceController))){
    const sourceController = Number(operation.sourceController);
    const reducedOpponent = changes.some(change=>{
      const target = findCard(ctx.state, change.cardIid)?.card;
      return target && controllerOf(target) !== sourceController && change.after < change.before;
    });
    if(reducedOpponent) ctx.state.fateReductionEffectUses[sourceController] += 1;
  }
  return changes.length === 1
    ? changes[0]
    : {cardIids:changes.map(change=>change.cardIid), changes};
}

function changeCardType(ctx, operation){
  const playerIndex = Number(operation.playerIndex);
  if(!ctx.state.players[playerIndex]) throw operationError('PLAYER_NOT_FOUND', 'card-type controller is invalid');
  const declaredTypes = ['Supporter', 'Initiator', 'Improvisor', 'Coordinator', 'Dauntless'];
  const cardType = String(operation.cardType || '');
  if(!declaredTypes.includes(cardType)) throw operationError('INVALID_CARD_TYPE', 'declared card type is invalid');
  const targetIids = Array.from(new Set((Array.isArray(operation.targetIids)
    ? operation.targetIids
    : [operation.targetIid]).map(value=>String(value || '')).filter(Boolean)));
  const entries = targetIids.map(targetIid=>{
    const entry = findCard(ctx.state, targetIid);
    if(!entry || entry.zone !== 'hand' || Number(entry.playerIndex) !== playerIndex){
      throw operationError('CARD_NOT_IN_HAND', 'card-type target is not in the controller hand', {targetIid});
    }
    if(isEffectImmutable(entry.card)) throw operationError('TARGET_IMMUNE', 'card-type target is effect immutable', {targetIid});
    return entry;
  });
  const changes = entries.map(entry=>{
    const beforeType = String(entry.card.type || '');
    if(!entry.card.counters || typeof entry.card.counters !== 'object') entry.card.counters = {};
    if(!entry.card.counters.bh14OriginalType) entry.card.counters.bh14OriginalType = beforeType;
    entry.card.counters.bh14DeclaredType = cardType;
    if(!Array.isArray(entry.card._handEffectModifiers)) entry.card._handEffectModifiers = [];
    const modifierText = `Charter of the United Nations: this card became a ${cardType === 'Improvisor' ? 'Improviser' : cardType}.`;
    const existingModifier = entry.card._handEffectModifiers.find(item=>item?.key === 'chloe-kirk-charter');
    if(existingModifier){
      existingModifier.name = 'Charter of the United Nations';
      existingModifier.text = modifierText;
    }else{
      entry.card._handEffectModifiers.push({
        key:'chloe-kirk-charter',
        name:'Charter of the United Nations',
        text:modifierText,
        fateDelta:0,
        costDelta:0
      });
    }
    emit(ctx, {
      type:RULE_EVENT_TYPES.CARD_TYPE_CHANGED,
      privateTo:[playerIndex],
      playerIndex,
      cardIid:entry.card.iid,
      beforeType,
      afterType:cardType,
      sourceIid:operation.sourceIid || null,
      semanticSourceCardId:operation.semanticSourceCardId || 'bh14',
      reason:operation.reason || 'CHARTER_OF_THE_UNITED_NATIONS'
    });
    return {cardIid:entry.card.iid, beforeType, afterType:cardType};
  });
  return {cardIids:changes.map(change=>change.cardIid), changes};
}

function revealHand(ctx, operation){
  const viewer = Number(operation.viewerPlayerIndex);
  const target = Number(operation.targetPlayerIndex);
  if(!ctx.state.players[viewer] || !ctx.state.players[target]){
    throw operationError('PLAYER_NOT_FOUND', 'reveal hand player is invalid');
  }
  ctx.events.push({
    type:'HAND_REVEALED',
    privateTo:[viewer],
    viewerPlayerIndex:viewer,
    targetPlayerIndex:target,
    cards:ctx.state.players[target].hand.map(card=>({
      iid:card.iid,
      id:card.id,
      name:card.name,
      type:card.type,
      currentFate:card.currentFate
    }))
  });
  return {revealedCount:ctx.state.players[target].hand.length};
}

function transferCards(ctx, operation){
  const targetIids = Array.isArray(operation.targetIids)
    ? operation.targetIids.map(String)
    : (String(operation.targetIid || '') ? [String(operation.targetIid)] : []);
  if(new Set(targetIids).size !== targetIids.length){
    throw operationError('DUPLICATE_TARGET', 'a transferred card cannot be selected twice');
  }
  const playerIndex = Number(operation.playerIndex);
  const destinationPile = String(operation.destinationPile || 'hand');
  if(!ctx.state.players[playerIndex]) throw operationError('PLAYER_NOT_FOUND', 'transfer destination player is invalid');
  if(!['hand', 'discard', 'deckTop', 'deckBottom'].includes(destinationPile)){
    throw operationError('INVALID_DESTINATION', 'transfer destination pile is invalid');
  }
  const entries = targetIids.map(iid=>findCard(ctx.state, iid));
  if(entries.some(entry=>!entry)) throw operationError('CARD_NOT_FOUND', 'a transferred card no longer exists');
  if(ctx.state.landscapeId === 'igb4'
    && destinationPile !== 'discard'
    && entries.some(entry=>entry.zone === 'discard')){
    ctx.events.push({
      type:'TRANSFER_BLOCKED',
      reason:'LANDSCAPE_IGB4_DISCARD_RECOVERY_BLOCK',
      targetIids
    });
    return {transferredIids:[], blocked:true};
  }
  const searchedDeck = entries.some(entry=>entry.zone === 'deck');
  const transferred = [];
  for(const iid of targetIids){
    const entry = findCard(ctx.state, iid);
    let card;
    if(entry.zone === 'board'){
      card = ctx.state.board[entry.z][entry.r][entry.c];
      ctx.state.board[entry.z][entry.r][entry.c] = null;
    }else{
      card = ctx.state.players[entry.playerIndex][entry.zone].splice(entry.index, 1)[0];
    }
    const destination = ctx.state.players[playerIndex];
    if(destinationPile === 'deckTop') destination.deck.unshift(card);
    else if(destinationPile === 'deckBottom') destination.deck.push(card);
    else destination[destinationPile].push(card);
    if(destinationPile === 'hand') applyHandArrivalModifiers(ctx, playerIndex, card);
    if(destinationPile === 'hand') applySpecialHandArrival(ctx, playerIndex, card);
    if(destinationPile === 'hand') stampCaliforniqueHandCard(ctx.state, playerIndex, card);
    const fateBonus = Number(operation.fateBonus || 0);
    if(destinationPile === 'hand' && fateBonus && !isEffectImmutable(card)){
      changeFate(ctx, {
        type:OPERATION_TYPES.MODIFY_FATE,
        targetIid:card.iid,
        amount:fateBonus,
        sourceIid:operation.sourceIid,
        sourceController:operation.sourceController,
        reason:operation.reason || 'HAND_TRANSFER_BONUS',
        bypassReaction:true
      }, false);
    }
    transferred.push(card.iid);
    emit(ctx, {
      type:RULE_EVENT_TYPES.CARD_TRANSFERRED,
      cardIid:card.iid,
      from:entry.zone,
      // Preserve the pre-transfer pile holder. A post-state observer cannot
      // otherwise prove that an opponent-hand effect targeted the opponent;
      // after this event the card is already in the recipient's pile.
      fromPlayerIndex:Number.isInteger(Number(entry.playerIndex)) ? Number(entry.playerIndex) : null,
      to:destinationPile,
      playerIndex,
      privateTo:[playerIndex],
      sourceIid:operation.sourceIid || null,
      // Delayed and copied effects must be audited against the controller who
      // actually created the effect, not a source card's later controller.
      // Mail Delivery can resolve four owner turns after its source changed
      // control, while single-player correctly keeps the original recipient.
      sourceController:Number.isInteger(Number(operation.sourceController))
        ? Number(operation.sourceController)
        : null,
      semanticSourceCardId:operation.semanticSourceCardId || undefined,
      reason:operation.reason || ''
    });
  }
  if(operation.shuffleDeckAfter === true && (destinationPile === 'deckTop' || destinationPile === 'deckBottom')){
    shuffleInPlace(ctx.state.players[playerIndex].deck, ctx.state.rngState);
    ctx.events.push({
      type:'DECK_SHUFFLED',
      playerIndex,
      sourceIid:operation.sourceIid || null,
      reason:operation.reason || ''
    });
  }
  if(searchedDeck){
    emit(ctx, {
      type:RULE_EVENT_TYPES.DECK_SEARCHED,
      playerIndex,
      count:transferred.length,
      sourceIid:operation.sourceIid || null,
      semanticSourceCardId:operation.semanticSourceCardId || undefined
    });
  }
  return {transferredIids:transferred};
}

function changeStatus(ctx, operation, remove){
  const targetIids = Array.isArray(operation.targetIids)
    ? operation.targetIids.map(String)
    : (String(operation.targetIid || '') ? [String(operation.targetIid)] : []);
  if(new Set(targetIids).size !== targetIids.length){
    throw operationError('DUPLICATE_TARGET', 'a status target cannot be selected twice');
  }
  const entries = targetIids.map(targetIid=>findCard(ctx.state, targetIid));
  if(entries.some(entry=>!entry)) throw operationError('CARD_NOT_FOUND', 'status target no longer exists');
  const status = String(operation.status || '');
  if(!status) throw operationError('INVALID_STATUS', 'status is required');
  const changed = [];
  for(const entry of entries){
    if(!Array.isArray(entry.card.statuses)) entry.card.statuses = [];
    if(remove){
      entry.card.statuses = entry.card.statuses.filter(item=>item !== status);
    }else if(!entry.card.statuses.includes(status)){
      entry.card.statuses.push(status);
      entry.card.statuses.sort();
    }
    const statusEvent = {
      type:remove ? 'STATUS_REMOVED' : 'STATUS_CREATED',
      cardIid:entry.card.iid,
      status,
      sourceIid:operation.sourceIid || null
    };
    ctx.events.push(statusEvent);
    recordMoralePressureRuleEvent(ctx, statusEvent);
    changed.push(entry.card.iid);
  }
  return changed.length === 1
    ? {cardIid:changed[0], status}
    : {cardIids:changed, status};
}

function createMovementGrant(ctx, operation){
  const target = findBoardCard(ctx.state, operation.targetIid);
  if(!target) throw operationError('CARD_NOT_ON_BOARD', 'movement grant target is not on the board');
  const playerIndex = Number(operation.playerIndex ?? operation.sourceController);
  if(controllerOf(target.card) !== playerIndex){
    throw operationError('CARD_NOT_CONTROLLED', 'movement grant target is not controlled by the player');
  }
  if(isEffectImmutable(target.card)
    || target.card.cantBeMoved === true
    || (target.card.statuses || []).includes('CANNOT_MOVE')){
    throw operationError('MOVE_PREVENTED', 'movement grant target cannot be moved');
  }
  const duration = Math.max(1, Number(operation.ownerTurns || 3) || 3);
  if(!Number.isInteger(duration)) throw operationError('INVALID_DURATION', 'movement grant duration must be an integer');
  const statusId = `movement-grant:busser:${target.card.iid}`;
  let status = ctx.state.statuses.find(item=>item.statusId === statusId);
  const refreshed = !!status;
  if(status){
    status.sourceIid = operation.sourceIid || status.sourceIid || null;
    status.playerIndex = playerIndex;
    status.remainingOwnerTurns = Math.max(Number(status.remainingOwnerTurns) || 0, duration);
    status.lastMoveTurn = null;
  }else{
    status = {
      statusId,
      type:'MOVEMENT_GRANT',
      kind:'ADJACENT_ZONE_ONCE_PER_TURN',
      targetIid:target.card.iid,
      sourceIid:operation.sourceIid || null,
      playerIndex,
      remainingOwnerTurns:duration,
      lastMoveTurn:null
    };
    ctx.state.statuses.push(status);
    ctx.state.statuses.sort((a, b)=>String(a.statusId).localeCompare(String(b.statusId)));
  }
  ctx.events.push({
    type:'STATUS_CREATED',
    status:JSON.parse(JSON.stringify(status)),
    refreshed
  });
  return {statusId, targetIid:target.card.iid, remainingOwnerTurns:status.remainingOwnerTurns};
}

function createTimedPlayerStatus(ctx, operation){
  const statusType = String(operation.statusType || '').toUpperCase();
  if(!/^[A-Z][A-Z0-9_]{1,79}$/.test(statusType)){
    throw operationError('INVALID_STATUS', 'timed player status requires a stable statusType');
  }
  const playerIndex = Number(operation.playerIndex);
  if(![0, 1].includes(playerIndex)){
    throw operationError('PLAYER_NOT_FOUND', 'timed player status target is invalid');
  }
  const targetTurns = Number(operation.targetTurns);
  if(!Number.isInteger(targetTurns) || targetTurns < 1 || targetTurns > 100){
    throw operationError('INVALID_DURATION', 'timed player status duration must be from 1 through 100 target turns');
  }
  const sourceController = Number(operation.sourceController);
  const useCounterKey = String(operation.useCounterKey || '').toUpperCase();
  const maxUses = Number(operation.maxUses || 0);
  let useCounter = null;
  if(useCounterKey){
    if(!/^[A-Z][A-Z0-9_]{1,79}$/.test(useCounterKey)
      || ![0, 1].includes(sourceController)
      || !Number.isInteger(maxUses)
      || maxUses < 1
      || maxUses > 100){
      throw operationError('INVALID_USE_LIMIT', 'timed player status use limit is invalid');
    }
    const counterId = `rule-use:${useCounterKey.toLowerCase()}:p${sourceController}`;
    useCounter = ctx.state.statuses.find(item=>item.statusId === counterId);
    const uses = Number(useCounter?.uses || 0);
    if(uses >= maxUses){
      throw operationError('USE_LIMIT_REACHED', 'the shared effect use limit has been reached');
    }
    if(useCounter){
      useCounter.uses = uses + 1;
    }else{
      useCounter = {
        statusId:counterId,
        type:'RULE_USE_COUNTER',
        ruleKey:useCounterKey,
        playerIndex:sourceController,
        uses:1,
        maxUses
      };
      ctx.state.statuses.push(useCounter);
    }
  }
  const zone = operation.zone === undefined ? null : Number(operation.zone);
  if(zone !== null && (!Number.isInteger(zone) || zone < 0 || zone > 2)){
    throw operationError('INVALID_ZONE', 'timed player status zone is invalid');
  }
  const scopeSuffix = zone === null ? '' : `:z${zone}`;
  const statusId = `timed-player:${statusType.toLowerCase()}:p${playerIndex}${scopeSuffix}`;
  const nextTargetTurn = operation.startsNextTargetTurn === true
    ? ctx.state.turn + (ctx.state.activePlayer === playerIndex ? 2 : 1)
    : ctx.state.turn;
  let status = ctx.state.statuses.find(item=>item.statusId === statusId);
  const refreshed = !!status;
  if(status){
    status.sourceIid = operation.sourceIid || status.sourceIid || null;
    status.sourceController = sourceController;
    if(zone !== null) status.zone = zone;
    status.activeFromTurn = Math.min(Number(status.activeFromTurn) || nextTargetTurn, nextTargetTurn);
    status.remainingTargetTurns = Math.max(Number(status.remainingTargetTurns) || 0, targetTurns);
  }else{
    status = {
      statusId,
      type:'TIMED_PLAYER_STATUS',
      statusType,
      playerIndex,
      sourceIid:operation.sourceIid || null,
      sourceController,
      ...(zone === null ? {} : {zone}),
      createdTurn:ctx.state.turn,
      activeFromTurn:nextTargetTurn,
      remainingTargetTurns:targetTurns
    };
    ctx.state.statuses.push(status);
  }
  ctx.state.statuses.sort((a, b)=>String(a.statusId).localeCompare(String(b.statusId)));
  ctx.events.push({
    type:'STATUS_CREATED',
    status:JSON.parse(JSON.stringify(status)),
    refreshed,
    sharedUses:useCounter ? useCounter.uses : null
  });
  return {
    statusId,
    playerIndex,
    activeFromTurn:status.activeFromTurn,
    remainingTargetTurns:status.remainingTargetTurns,
    sharedUses:useCounter ? useCounter.uses : null
  };
}

function changeControl(ctx, operation){
  const entry = findBoardCard(ctx.state, operation.targetIid);
  if(!entry) throw operationError('CARD_NOT_ON_BOARD', 'control-change target is not on the board');
  const controller = Number(operation.controller);
  if(![0, 1].includes(controller)) throw operationError('INVALID_CONTROLLER', 'controller must identify a player');
  const check = inspectOperation(ctx.state, {
    ...operation,
    sourceCard:cardSource(ctx, operation)
  });
  if(!check.ok) throw operationError(check.rejection.code, check.rejection.reason, check.rejection.details);
  const previousController = controllerOf(entry.card);
  entry.card.controller = controller;
  emit(ctx, {
    type:RULE_EVENT_TYPES.CONTROL_CHANGED,
    cardIid:entry.card.iid,
    owner:Number(entry.card.owner),
    previousController,
    controller,
    sourceIid:operation.sourceIid || null,
    reason:operation.reason || ''
  });
  return {cardIid:entry.card.iid, previousController, controller};
}

function createMatchStatus(ctx, operation){
  const input = operation?.status;
  if(!input || typeof input !== 'object' || !String(input.type || '')){
    throw operationError('INVALID_STATUS', 'match status requires a stable type');
  }
  const sourceIid = String(input.sourceIid || operation.sourceIid || '');
  const playerIndex = Number(input.playerIndex);
  if(!sourceIid || ![0, 1].includes(playerIndex)){
    throw operationError('INVALID_STATUS', 'match status requires a source and player');
  }
  const type = String(input.type).toUpperCase();
  const sourceEntry = findBoardCard(ctx.state, sourceIid);
  const countedAffiliation = String(input.countControlledAffiliation || '');
  const countedEntries = countedAffiliation
    ? boardEntries(ctx.state).filter(entry=>
        controllerOf(entry.card) === Number(operation.sourceController)
        && String(entry.card.affiliation || entry.card.aff || '') === countedAffiliation
      )
    : [];
  const sourceUse = Math.max(1, Number(sourceEntry?.card?.counters?.effectUses || 1));
  const statusId = String(input.statusId || (
    type === 'NEXT_CHARACTER_HAND_ARRIVAL'
      ? `rule:${type.toLowerCase()}:p${playerIndex}`
      : (input.stackPerUse === true
          ? `rule:${type.toLowerCase()}:${sourceIid}:p${playerIndex}:use${sourceUse}`
          : `rule:${type.toLowerCase()}:${sourceIid}:p${playerIndex}`)
  ));
  const inferredZone = input.inferSourceZone === true
    ? findBoardCard(ctx.state, sourceIid)?.z
    : input.zone;
  const status = JSON.parse(JSON.stringify({
    ...input,
    ...(countedAffiliation ? {
      value:countedEntries.length * Number(input.valuePerControlledCard || 0),
      countedCardIids:countedEntries.map(entry=>String(entry.card.iid || ''))
    } : {}),
    ...(Number.isInteger(Number(inferredZone)) ? {zone:Number(inferredZone)} : {}),
    type,
    statusId,
    sourceIid,
    playerIndex
  }));
  delete status.inferSourceZone;
  delete status.countControlledAffiliation;
  delete status.valuePerControlledCard;
  delete status.stackPerUse;
  const existingIndex = ctx.state.statuses.findIndex(item=>item.statusId === statusId);
  if(existingIndex >= 0){
    ctx.state.statuses[existingIndex] = status;
    ctx.events.push({type:'STATUS_CREATED', status:JSON.parse(JSON.stringify(status)), refreshed:true});
    return {statusId, refreshed:true};
  }
  ctx.state.statuses.push(status);
  ctx.state.statuses.sort((a, b)=>String(a.statusId).localeCompare(String(b.statusId)));
  ctx.events.push({type:'STATUS_CREATED', status:JSON.parse(JSON.stringify(status))});
  return {statusId};
}

function removeMatchStatus(ctx, operation){
  const statusId = String(operation.statusId || '');
  if(!statusId) throw operationError('INVALID_STATUS', 'statusId is required');
  const before = ctx.state.statuses.length;
  ctx.state.statuses = ctx.state.statuses.filter(status=>status.statusId !== statusId);
  if(ctx.state.statuses.length !== before){
    ctx.events.push({type:'STATUS_REMOVED', statusId, reason:operation.reason || ''});
  }
  return {statusId, removed:ctx.state.statuses.length !== before};
}

function tickCounterFate(ctx, operation){
  const entry = findBoardCard(ctx.state, operation.targetIid);
  if(!entry) throw operationError('CARD_NOT_ON_BOARD', 'counter tick target is not on the board');
  const counterKey = String(operation.counterKey || '');
  const triggerCounterKey = String(operation.triggerCounterKey || '');
  const threshold = Number(operation.threshold);
  const maxTriggers = Number(operation.maxTriggers);
  const amount = Number(operation.amount);
  if(!/^[A-Za-z][A-Za-z0-9_]{1,79}$/.test(counterKey)
    || !/^[A-Za-z][A-Za-z0-9_]{1,79}$/.test(triggerCounterKey)
    || !Number.isInteger(threshold)
    || threshold < 1
    || !Number.isInteger(maxTriggers)
    || maxTriggers < 1
    || !Number.isInteger(amount)){
    throw operationError('INVALID_COUNTER_TICK', 'counter Fate tick parameters are invalid');
  }
  const triggers = Number(entry.card.counters[triggerCounterKey]) || 0;
  if(triggers >= maxTriggers) return {cardIid:entry.card.iid, triggered:false, capped:true};
  const ticks = (Number(entry.card.counters[counterKey]) || 0) + 1;
  if(ticks < threshold){
    entry.card.counters[counterKey] = ticks;
    return {cardIid:entry.card.iid, triggered:false, ticks};
  }
  entry.card.counters[counterKey] = 0;
  entry.card.counters[triggerCounterKey] = triggers + 1;
  const change = changeFate(ctx, {
    type:OPERATION_TYPES.MODIFY_FATE,
    targetIid:entry.card.iid,
    amount,
    sourceIid:operation.sourceIid || entry.card.iid,
    sourceController:operation.sourceController ?? controllerOf(entry.card),
    reason:operation.reason || 'COUNTER_TICK'
  }, false);
  return {
    cardIid:entry.card.iid,
    triggered:true,
    triggerCount:entry.card.counters[triggerCounterKey],
    change
  };
}

function setCardCounter(ctx, operation){
  const entry = findCard(ctx.state, operation.targetIid);
  if(!entry) throw operationError('CARD_NOT_FOUND', 'counter target no longer exists');
  const counterKey = String(operation.counterKey || '');
  if(!/^[A-Za-z][A-Za-z0-9_]{1,79}$/.test(counterKey)){
    throw operationError('INVALID_COUNTER', 'counterKey must be a stable identifier');
  }
  const value = operation.value;
  if(!['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))){
    throw operationError('INVALID_COUNTER', 'counter value must be a finite scalar');
  }
  if(!entry.card.counters || typeof entry.card.counters !== 'object') entry.card.counters = {};
  entry.card.counters[counterKey] = value;
  ctx.events.push({
    type:'CARD_COUNTER_SET',
    cardIid:entry.card.iid,
    counterKey,
    value,
    sourceIid:operation.sourceIid || null
  });
  return {cardIid:entry.card.iid, counterKey, value};
}

function ensureExtraRow(ctx, zone, owner){
  const z = Number(zone);
  const playerIndex = Number(owner);
  if(!ctx.state.board[z] || ![0, 1].includes(playerIndex)){
    throw operationError('INVALID_GEOMETRY', 'extra safe row requires a valid zone and owner');
  }
  let r = ctx.state.geometry.rowOwners[z].findIndex((rowOwner, index)=>
    index >= 3 && rowOwner === playerIndex
  );
  if(r < 0){
    r = ctx.state.board[z].length;
    ctx.state.board[z].push([null, null, null]);
    ctx.state.geometry.rowOwners[z].push(playerIndex);
  }
  return r;
}

function addSafeRow(ctx, operation){
  const owner = Number(operation.playerIndex);
  const z = Number.isInteger(Number(operation.zone))
    ? Number(operation.zone)
    : findBoardCard(ctx.state, operation.sourceIid)?.z;
  const r = ensureExtraRow(ctx, z, owner);
  for(let c = 0; c < 3; c += 1){
    const key = squareKey({z, r, c});
    if(!ctx.state.geometry.playableExtraSquares.some(square=>squareKey(square) === key)){
      ctx.state.geometry.playableExtraSquares.push({z, r, c, owner});
    }
  }
  ctx.state.geometry.playableExtraSquares.sort((a, b)=>
    (a.z - b.z) || (a.r - b.r) || (a.c - b.c)
  );
  ctx.events.push({type:'SAFE_ROW_ADDED', playerIndex:owner, zone:z, row:r, sourceIid:operation.sourceIid || null});
  return {zone:z, row:r};
}

function addSafeSquare(ctx, operation){
  const owner = Number(operation.playerIndex);
  const z = Number.isInteger(Number(operation.zone))
    ? Number(operation.zone)
    : findBoardCard(ctx.state, operation.sourceIid)?.z;
  if(!ctx.state.board[z] || ![0, 1].includes(owner)){
    throw operationError('INVALID_GEOMETRY', 'extra safe square requires a valid zone and owner');
  }
  const rowOwners = ctx.state.geometry.rowOwners[z];
  const playable = ctx.state.geometry.playableExtraSquares;
  const incompleteOwnedRow = rowOwners.findIndex((rowOwner, rowIndex)=>
    rowIndex >= 3
      && rowOwner === owner
      && [0, 1, 2].some(column=>!playable.some(square=>
        square.z === z && square.r === rowIndex && square.c === column
      ))
  );
  const expectedRow = incompleteOwnedRow >= 0 ? incompleteOwnedRow : ctx.state.board[z].length;
  const requested = operation.destination && typeof operation.destination === 'object'
    ? operation.destination
    : null;
  const r = requested ? Number(requested.r) : expectedRow;
  const c = requested
    ? Number(requested.c)
    : [0, 1, 2].find(column=>!playable.some(square=>
        square.z === z && square.r === r && square.c === column
      ));
  if(requested && Number(requested.z) !== z){
    throw operationError('INVALID_DESTINATION', 'safe square must remain in the source zone');
  }
  if(r !== expectedRow || ![0, 1, 2].includes(c)){
    throw operationError('INVALID_DESTINATION', 'safe square destination is not an available extra-row slot');
  }
  if(r === ctx.state.board[z].length){
    ctx.state.board[z].push([null, null, null]);
    rowOwners.push(owner);
  }else if(rowOwners[r] !== owner){
    throw operationError('INVALID_DESTINATION', 'safe square row belongs to the wrong player');
  }
  if(playable.some(square=>square.z === z && square.r === r && square.c === c)){
    throw operationError('INVALID_DESTINATION', 'safe square destination is already available');
  }
  if(c === undefined) return {zone:z, row:r, added:false};
  ctx.state.geometry.playableExtraSquares.push({z, r, c, owner});
  ctx.state.geometry.playableExtraSquares.sort((a, b)=>
    (a.z - b.z) || (a.r - b.r) || (a.c - b.c)
  );
  ctx.events.push({type:'SAFE_SQUARE_ADDED', playerIndex:owner, zone:z, row:r, column:c, sourceIid:operation.sourceIid || null});
  return {zone:z, row:r, column:c, added:true};
}

function createSquareStatus(ctx, operation){
  if(Array.isArray(operation.destinations)){
    return {
      statuses:operation.destinations.map(destination=>
        createSquareStatus(ctx, {...operation, destinations:undefined, destination})
      )
    };
  }
  const destination = operation.destination;
  if(!isBoardCoordinate(ctx.state, destination)){
    throw operationError('INVALID_DESTINATION', 'square status requires a playable board square');
  }
  const type = String(operation.statusType || '');
  if(!['PERMANENTLY_BLOCKED', 'CONSOLIDATION_BLOCKED', 'COORDINATOR_SUPPRESSED', 'FLOWER_KING_BLESSED'].includes(type)){
    throw operationError('INVALID_STATUS', 'unsupported square status');
  }
  if(type === 'PERMANENTLY_BLOCKED' && boardCardAt(ctx.state, destination)){
    throw operationError('DESTINATION_OCCUPIED', 'a permanent block requires an open square');
  }
  const status = {
    z:Number(destination.z),
    r:Number(destination.r),
    c:Number(destination.c),
    type,
    sourceIid:operation.sourceIid || null,
    sourceController:Number(operation.sourceController),
    blockedPlayer:Number.isInteger(Number(operation.blockedPlayer))
      ? Number(operation.blockedPlayer)
      : null
  };
  if(type === 'FLOWER_KING_BLESSED'){
    ctx.state.geometry.squareStatuses = ctx.state.geometry.squareStatuses.filter(existing=>
      !(existing?.type === type && String(existing.sourceIid || '') === String(status.sourceIid || ''))
    );
  }
  const duplicate = ctx.state.geometry.squareStatuses.some(existing=>
    squareKey(existing) === squareKey(status)
    && existing.type === status.type
    && String(existing.sourceIid || '') === String(status.sourceIid || '')
  );
  if(!duplicate) ctx.state.geometry.squareStatuses.push(status);
  ctx.events.push({type:'SQUARE_STATUS_CREATED', ...status});
  return status;
}

function discardAndGainFate(ctx, operation){
  const targetIids = Array.isArray(operation.targetIids) ? operation.targetIids.map(String) : [];
  const berkeleyCostPaidIids = new Set(
    Array.isArray(operation.berkeleyCostPaidIids) ? operation.berkeleyCostPaidIids.map(String) : []
  );
  for(const targetIid of targetIids){
    const check = inspectOperation(ctx.state, {
      type:OPERATION_TYPES.DISCARD_CARD,
      targetIid,
      sourceIid:operation.sourceIid,
      sourceCard:cardSource(ctx, operation),
      sourceController:operation.sourceController
    });
    if(!check.ok) throw operationError(check.rejection.code, check.rejection.reason, check.rejection.details);
  }
  const discarded = targetIids.map(targetIid=>discardCard(ctx, {
    type:OPERATION_TYPES.DISCARD_CARD,
    targetIid,
    sourceIid:operation.sourceIid,
    sourceController:operation.sourceController,
    berkeleyCostPaid:berkeleyCostPaidIids.has(targetIid),
    reason:operation.reason || ''
  }));
  if(discarded.length && operation.sourceIid){
    changeFate(ctx, {
      type:OPERATION_TYPES.MODIFY_FATE,
      targetIid:operation.sourceIid,
      amount:discarded.length * (Number(operation.fatePerCard || 1) || 1),
      sourceIid:operation.sourceIid,
      sourceController:operation.sourceController,
      bypassReaction:true,
      reason:operation.reason || ''
    }, false);
  }
  return {discardedIids:discarded.map(item=>item.cardIid), fateGained:discarded.length};
}

function createCardMark(ctx, operation){
  const target = findBoardCard(ctx.state, operation.targetIid);
  if(!target) throw operationError('CARD_NOT_ON_BOARD', 'the marked card is not on the board');
  const check = inspectOperation(ctx.state, {
    type:OPERATION_TYPES.CREATE_STATUS,
    targetIid:target.card.iid,
    sourceIid:operation.sourceIid,
    sourceCard:cardSource(ctx, operation),
    sourceController:operation.sourceController
  });
  if(!check.ok) throw operationError(check.rejection.code, check.rejection.reason, check.rejection.details);
  const mark = `VIGILANTES_MARK:${operation.sourceIid}:${Number(operation.sourceController)}`;
  if(!target.card.statuses.includes(mark)) target.card.statuses.push(mark);
  target.card.statuses.sort();
  ctx.events.push({type:'CARD_MARKED', cardIid:target.card.iid, sourceIid:operation.sourceIid || null});
  return {cardIid:target.card.iid, mark};
}

function massModifyMatchingCard(ctx, operation){
  const selected = findCard(ctx.state, operation.selectedIid)?.card;
  if(!selected) throw operationError('CARD_NOT_FOUND', 'the selected card no longer exists');
  const targetIids = [];
  for(const entry of boardEntries(ctx.state)){
    if(String(entry.card.id) === String(selected.id)
      && controllerOf(entry.card) === Number(operation.targetPlayerIndex)
      && !isEffectImmutable(entry.card)) targetIids.push(entry.card.iid);
  }
  for(const pile of ['hand', 'deck']){
    for(const card of ctx.state.players[Number(operation.targetPlayerIndex)]?.[pile] || []){
      if(String(card.id) === String(selected.id) && !isEffectImmutable(card)) targetIids.push(card.iid);
    }
  }
  return changeFate(ctx, {
    type:OPERATION_TYPES.MODIFY_FATE,
    targetIids,
    amount:Number(operation.amount || 0),
    sourceIid:operation.sourceIid,
    sourceController:operation.sourceController,
    bypassReaction:true,
    reason:operation.reason || ''
  }, false);
}

function randomDiscardHand(ctx, operation){
  const playerIndex = Number(operation.playerIndex);
  const player = ctx.state.players[playerIndex];
  if(!player) throw operationError('PLAYER_NOT_FOUND', 'random discard player is invalid');
  const source = cardSource(ctx, operation);
  const eligible = player.hand.filter(card=>
    inspectOperation(ctx.state, {
      type:OPERATION_TYPES.DISCARD_CARD,
      targetIid:card.iid,
      sourceIid:operation.sourceIid,
      sourceCard:source,
      sourceController:operation.sourceController
    }).ok
  );
  if(!eligible.length) return {discardedIid:null};
  eligible.sort((a, b)=>String(a.iid).localeCompare(String(b.iid)));
  const card = eligible[nextInt(ctx.state.rngState, eligible.length)];
  discardCard(ctx, {
    type:OPERATION_TYPES.DISCARD_CARD,
    targetIid:card.iid,
    sourceIid:operation.sourceIid,
    semanticSourceCardId:operation.semanticSourceCardId,
    sourceController:operation.sourceController,
    revealDiscard:operation.revealDiscard === true,
    reason:operation.reason || ''
  });
  return {discardedIid:card.iid, cardId:String(card.id || ''), cardName:String(card.name || 'Card')};
}

function randomDiscardDeck(ctx, operation){
  const playerIndex = Number(operation.playerIndex);
  const player = ctx.state.players[playerIndex];
  if(!player) throw operationError('PLAYER_NOT_FOUND', 'random deck discard player is invalid');
  const source = cardSource(ctx, operation);
  const eligible = player.deck.filter(card=>
    inspectOperation(ctx.state, {
      type:OPERATION_TYPES.DISCARD_CARD,
      targetIid:card.iid,
      sourceIid:operation.sourceIid,
      sourceCard:source,
      sourceController:operation.sourceController
    }).ok
  );
  if(!eligible.length) return {discardedIid:null};
  const card = eligible[nextInt(ctx.state.rngState, eligible.length)];
  discardCard(ctx, {
    type:OPERATION_TYPES.DISCARD_CARD,
    targetIid:card.iid,
    sourceIid:operation.sourceIid,
    sourceController:operation.sourceController,
    semanticSourceCardId:operation.semanticSourceCardId || 'bh18',
    revealDiscard:true,
    reason:operation.reason || 'GENESIS_OF_ALL_INCELDOM'
  });
  return {discardedIid:card.iid, cardId:String(card.id || ''), cardName:String(card.name || 'Card')};
}

function randomStealHand(ctx, operation){
  const fromPlayer = Number(operation.fromPlayerIndex);
  const toPlayer = Number(operation.toPlayerIndex);
  const source = cardSource(ctx, operation);
  const candidates = (ctx.state.players[fromPlayer]?.hand || []).filter(card=>
    inspectOperation(ctx.state, {
      type:OPERATION_TYPES.TRANSFER_CARDS,
      targetIid:card.iid,
      sourceIid:operation.sourceIid,
      sourceCard:source,
      sourceController:operation.sourceController
    }).ok
  );
  if(!candidates.length) return {transferredIids:[]};
  candidates.sort((a, b)=>String(a.iid).localeCompare(String(b.iid)));
  const card = candidates[nextInt(ctx.state.rngState, candidates.length)];
  card.counters.originalOwner = Number(card.owner);
  return transferCards(ctx, {
    type:OPERATION_TYPES.TRANSFER_CARDS,
    targetIid:card.iid,
    playerIndex:toPlayer,
    destinationPile:'hand',
    sourceIid:operation.sourceIid,
    sourceController:operation.sourceController
  });
}

function discardTypesAndGainFate(ctx, operation){
  const source = findBoardCard(ctx.state, operation.sourceIid);
  if(!source) throw operationError('SOURCE_NOT_FOUND', 'discard-and-gain source is not on the board');
  const types = new Set((operation.cardTypes || []).map(String));
  const targets = boardEntries(ctx.state).filter(entry=>
    entry.z === source.z
    && controllerOf(entry.card) === Number(operation.sourceController)
    && String(entry.card.iid) !== String(source.card.iid)
    && types.has(String(entry.card.type || ''))
  );
  let total = 0;
  for(const target of targets){
    const check = inspectOperation(ctx.state, {
      type:OPERATION_TYPES.DISCARD_CARD,
      targetIid:target.card.iid,
      sourceIid:operation.sourceIid,
      sourceCard:source.card,
      sourceController:operation.sourceController
    });
    if(!check.ok) continue;
    total += Math.max(0, Number(target.card.currentFate) || 0);
    discardCard(ctx, {
      type:OPERATION_TYPES.DISCARD_CARD,
      targetIid:target.card.iid,
      sourceIid:operation.sourceIid,
      sourceController:operation.sourceController,
      reason:operation.reason || ''
    });
  }
  if(total){
    changeFate(ctx, {
      type:OPERATION_TYPES.MODIFY_FATE,
      targetIid:source.card.iid,
      amount:total,
      sourceIid:source.card.iid,
      sourceController:operation.sourceController,
      bypassReaction:true,
      reason:operation.reason || ''
    }, false);
  }
  return {discardedIids:targets.map(entry=>entry.card.iid), fateGained:total};
}

function scheduleCard(ctx, operation){
  const entry = findCard(ctx.state, operation.targetIid);
  const playerIndex = Number(operation.playerIndex);
  if(!entry || entry.zone !== 'deck' || entry.playerIndex !== playerIndex){
    throw operationError('CARD_NOT_IN_DECK', 'scheduled card must be in the player deck');
  }
  const card = ctx.state.players[playerIndex].deck.splice(entry.index, 1)[0];
  ctx.state.players[playerIndex].limbo.push(card);
  const status = {
    statusId:`delivery:${operation.sourceIid}:${card.iid}`,
    type:'DELAYED_HAND_DELIVERY',
    playerIndex,
    cardIid:card.iid,
    sourceIid:operation.sourceIid || null,
    deliveryTurnsRemaining:Math.max(1, Number(operation.ownerTurns || 1) || 1)
  };
  ctx.state.statuses.push(status);
  ctx.events.push({
    type:'CARD_SCHEDULED',
    privateTo:[playerIndex],
    playerIndex,
    cardIid:card.iid,
    remainingOwnerTurns:status.deliveryTurnsRemaining,
    sourceIid:operation.sourceIid || null
  });
  return {statusId:status.statusId, cardIid:card.iid};
}

const ADAPTIVE_TOKEN_BASES = Object.freeze([
  {id:'token2', name:'A Crown of Silver and Thorns'},
  {id:'token3', name:"Howard's Fit"},
  {id:'token4', name:'The Heart of the Sea'},
  {id:'token5', name:"Soviet Captain's Badge"}
]);

function createTokens(ctx, operation){
  const playerIndex = Number(operation.playerIndex);
  const count = Math.max(0, Number(operation.count || 0) || 0);
  const createdIids = [];
  for(let index = 0; index < count; index += 1){
    const pierogi = String(operation.tokenKind || '') === 'PIEROGI';
    const base = pierogi
      ? {id:'token1', name:"Wojciech's Pierogi"}
      : ADAPTIVE_TOKEN_BASES[index % ADAPTIVE_TOKEN_BASES.length];
    ctx.state.instanceCounter += 1;
    const card = {
      iid:`${ctx.state.matchId}:p${playerIndex}:c${ctx.state.instanceCounter}`,
      id:base.id,
      name:base.name,
      ability:pierogi ? 'A Fine Delicacy' : 'Adaptive Tactics',
      type:pierogi ? 'Counter' : 'Token',
      affiliation:pierogi ? 'expanded_worlds' : 'reality',
      rarity:'circle',
      baseFate:pierogi ? 0 : 2,
      currentFate:pierogi ? 0 : 2,
      cost:0,
      owner:playerIndex,
      controller:playerIndex,
      faceDown:false,
      statuses:pierogi
        ? ['EFFECT_IMMUTABLE', 'CANNOT_CONSOLIDATE']
        : ['ADAPTIVE_TOKEN'],
      counters:pierogi
        ? {
            pierogiCounter:true,
            pierogiCreator:playerIndex,
            handTurnsRemaining:6,
            createdTurn:ctx.state.turn
          }
        : {adaptiveToken:true}
    };
    ctx.state.players[playerIndex].hand.push(card);
    createdIids.push(card.iid);
  }
  ctx.events.push({type:'TOKENS_CREATED', privateTo:[playerIndex], playerIndex, createdIids, sourceIid:operation.sourceIid || null});
  return {createdIids};
}

function changePlayerCounter(ctx, operation){
  const field = String(operation.field || '');
  if(!['extraSupportersThisTurn', 'queuedExtraSupporters'].includes(field)){
    throw operationError('INVALID_COUNTER', 'player counter is not mutable by card rules');
  }
  const playerIndex = Number(operation.playerIndex);
  const amount = Number(operation.amount || 0);
  if(!ctx.state.players[playerIndex] || !Number.isInteger(amount)){
    throw operationError('INVALID_COUNTER', 'player counter change is invalid');
  }
  ctx.state[field][playerIndex] = Math.max(0, Number(ctx.state[field][playerIndex] || 0) + amount);
  if(field === 'extraSupportersThisTurn'
    && String(operation.semanticSourceCardId || '') === '07'
    && amount > 0){
    ctx.state.statuses.push({
      statusId:`maja-support:${operation.sourceIid || 'maja'}:t${ctx.state.turn}:e${ctx.events.length}`,
      type:'MAJA_EXTRA_SUPPORTERS',
      playerIndex,
      sourceIid:operation.sourceIid || null,
      extraSupports:amount,
      remainingOwnerTurns:1
    });
  }
  ctx.events.push({type:'PLAYER_COUNTER_CHANGED', field, playerIndex, amount, sourceIid:operation.sourceIid || null});
  return {field, playerIndex, value:ctx.state[field][playerIndex]};
}

function randomHandFate(ctx, operation){
  const playerIndex = Number(operation.playerIndex);
  const source = cardSource(ctx, operation);
  const candidates = (ctx.state.players[playerIndex]?.hand || []).filter(card=>
    String(card.iid) !== String(operation.excludeIid || '')
    && inspectOperation(ctx.state, {
      type:OPERATION_TYPES.MODIFY_FATE,
      targetIid:card.iid,
      sourceIid:operation.sourceIid,
      sourceCard:source,
      sourceController:operation.sourceController
    }).ok
  );
  if(!candidates.length) return {cardIid:null};
  candidates.sort((a, b)=>String(a.iid).localeCompare(String(b.iid)));
  const card = candidates[nextInt(ctx.state.rngState, candidates.length)];
  const result = changeFate(ctx, {
    type:OPERATION_TYPES.MODIFY_FATE,
    targetIid:card.iid,
    amount:Number(operation.amount || 0),
    sourceIid:operation.sourceIid,
    sourceController:operation.sourceController,
    reason:operation.reason || ''
  }, false);
  return {cardIid:card.iid, result};
}

function changeZoneAffiliation(ctx, operation){
  const source = findBoardCard(ctx.state, operation.sourceIid);
  if(!source) throw operationError('SOURCE_NOT_ON_BOARD', 'affiliation-change source is not on the board');
  const playerIndex = Number(operation.playerIndex ?? operation.sourceController);
  if(![0, 1].includes(playerIndex)){
    throw operationError('PLAYER_NOT_FOUND', 'affiliation-change player is invalid');
  }
  const affiliation = String(operation.affiliation || '');
  if(!affiliation) throw operationError('INVALID_AFFILIATION', 'declared affiliation is required');
  const changedIids = [];
  for(const entry of boardEntries(ctx.state)){
    if(entry.z !== source.z || controllerOf(entry.card) !== playerIndex) continue;
    if(isEffectImmutable(entry.card) || String(entry.card.affiliation || '') === affiliation) continue;
    const previousAffiliation = String(entry.card.affiliation || '');
    entry.card.affiliation = affiliation;
    changedIids.push(entry.card.iid);
    emit(ctx, {
      type:RULE_EVENT_TYPES.AFFILIATION_CHANGED,
      cardIid:entry.card.iid,
      playerIndex,
      previousAffiliation,
      affiliation,
      sourceIid:operation.sourceIid || null,
      semanticSourceCardId:String(source.card?.id || source.id || '')
    });
  }
  // One presentation fact for the chosen affiliation. Individual card-change
  // events remain available to rules and auditing without duplicating Mark's
  // visible declaration on every affected card.
  emit(ctx, {
    type:RULE_EVENT_TYPES.AFFILIATION_DECLARED,
    sourceIid:operation.sourceIid || null,
    semanticSourceCardId:String(source.card?.id || source.id || ''),
    playerIndex,
    affiliation,
    changedIids:[...changedIids]
  });
  if(changedIids.length){
    changeFate(ctx, {
      type:OPERATION_TYPES.MODIFY_FATE,
      targetIid:operation.sourceIid,
      amount:changedIids.length,
      sourceIid:operation.sourceIid,
      sourceController:playerIndex,
      reason:operation.reason || 'MARK_MENZ_AFFILIATION_CHANGE',
      bypassReaction:true
    }, false);
  }
  return {changedIids, affiliation};
}

function randomTransferCards(ctx, operation){
  const playerIndex = Number(operation.playerIndex);
  const player = ctx.state.players[playerIndex];
  if(!player) throw operationError('PLAYER_NOT_FOUND', 'random-transfer player is invalid');
  const sourcePile = String(operation.sourcePile || '');
  const destinationPile = String(operation.destinationPile || '');
  if(!['deck', 'discard'].includes(sourcePile)){
    throw operationError('INVALID_SOURCE', 'random transfer source must be deck or discard');
  }
  if(ctx.state.landscapeId === 'igb4' && sourcePile === 'discard'){
    ctx.events.push({
      type:'TRANSFER_BLOCKED',
      reason:'LANDSCAPE_IGB4_DISCARD_RECOVERY_BLOCK',
      playerIndex,
      sourcePile,
      destinationPile
    });
    return {selectedIids:[], sourcePile, destinationPile, blocked:true};
  }
  if(!['hand', 'deckTop', 'deckBottom', 'deckRandom'].includes(destinationPile)){
    throw operationError('INVALID_DESTINATION', 'random transfer destination is invalid');
  }
  const count = Number(operation.count);
  const fateBonus = Number(operation.fateBonus || 0);
  if(!Number.isInteger(count) || count < 0 || count > 100 || !Number.isInteger(fateBonus)){
    throw operationError('INVALID_RANDOM_TRANSFER', 'random transfer count and Fate bonus must be integers');
  }
  if(operation.activatedDrawEffect === true){
    emit(ctx, {
      type:RULE_EVENT_TYPES.DRAW_EFFECT_ACTIVATED,
      playerIndex,
      sourceIid:operation.sourceIid || null
    });
  }
  const candidates = player[sourcePile].filter(card=>{
    if(operation.affiliation !== undefined
      && String(card.affiliation || '') !== String(operation.affiliation || '')) return false;
    if(operation.typeFilter !== undefined
      && String(card.type || '') !== String(operation.typeFilter || '')) return false;
    if(operation.excludeRarity !== undefined
      && String(card.rarity || '') === String(operation.excludeRarity || '')) return false;
    return true;
  });
  const selected = [];
  if(destinationPile === 'deckRandom'){
    while(candidates.length && selected.length < count){
      const index = nextInt(ctx.state.rngState, candidates.length);
      const card = candidates.splice(index, 1)[0];
      const sourceIndex = player[sourcePile].findIndex(item=>String(item.iid) === String(card.iid));
      if(sourceIndex < 0) throw operationError('CARD_NOT_FOUND', 'random-transfer card no longer exists');
      player[sourcePile].splice(sourceIndex, 1);
      if(fateBonus && !isEffectImmutable(card)){
        commitPermanentFate(card, (Number(card.currentFate) || 0) + fateBonus);
      }
      const insertIndex = nextInt(ctx.state.rngState, player.deck.length + 1);
      player.deck.splice(insertIndex, 0, card);
      selected.push(card);
      emit(ctx, {
        type:RULE_EVENT_TYPES.CARD_TRANSFERRED,
        cardIid:card.iid,
        // This event is private to the affected player. Preserve the exact
        // returned cards for the Snow Shoveler result gallery after they have
        // been randomized back into the otherwise-hidden deck.
        card:cloneSerializable(card),
        from:sourcePile,
        to:destinationPile,
        playerIndex,
        privateTo:[playerIndex],
        sourceIid:operation.sourceIid || null
      });
    }
  }else{
    while(candidates.length && selected.length < count){
      const index = nextInt(ctx.state.rngState, candidates.length);
      selected.push(candidates.splice(index, 1)[0]);
    }
    if(fateBonus){
      for(const card of selected){
        if(isEffectImmutable(card)) continue;
        commitPermanentFate(card, (Number(card.currentFate) || 0) + fateBonus);
      }
    }
    const selectedIids = selected.map(card=>card.iid);
    if(selectedIids.length){
      transferCards(ctx, {
        type:OPERATION_TYPES.TRANSFER_CARDS,
        targetIids:selectedIids,
        playerIndex,
        destinationPile,
        sourceIid:operation.sourceIid || null
      });
    }
  }
  const selectedIids = selected.map(card=>card.iid);
  if(operation.shuffleDeckAfter === true){
    shuffleInPlace(player.deck, ctx.state.rngState);
    ctx.events.push({
      type:'DECK_SHUFFLED',
      playerIndex,
      sourceIid:operation.sourceIid || null
    });
  }
  ctx.events.push({
    type:'RANDOM_TRANSFER_RESOLVED',
    privateTo:[playerIndex],
    playerIndex,
    sourcePile,
    destinationPile,
    selectedIids,
    fateBonus,
    sourceIid:operation.sourceIid || null
  });
  return {selectedIids, sourcePile, destinationPile};
}

function splitFateLossByType(ctx, operation){
  const source = findBoardCard(ctx.state, operation.sourceIid);
  if(!source) throw operationError('SOURCE_NOT_ON_BOARD', 'split-loss source is not on the board');
  const sourceController = Number(operation.sourceController);
  const declaredType = String(operation.cardType || '');
  const total = Number(operation.total ?? 20);
  if(!declaredType || !Number.isInteger(total) || total < 0){
    throw operationError('INVALID_SPLIT_FATE', 'split Fate loss requires a card type and non-negative integer total');
  }
  const targets = boardEntries(ctx.state).filter(entry=>
    entry.z === source.z
    && controllerOf(entry.card) !== sourceController
    && entry.card.faceDown !== true
    && String(entry.card.type || '') === declaredType
    && inspectOperation(ctx.state, {
      type:OPERATION_TYPES.MODIFY_FATE,
      targetIid:entry.card.iid,
      sourceIid:source.card.iid,
      sourceController,
      sourceCard:source.card
    }).ok
  );
  const lossEach = targets.length ? Math.round(total / targets.length) : 0;
  if(targets.length && lossEach){
    changeFate(ctx, {
      type:OPERATION_TYPES.MODIFY_FATE,
      targetIids:targets.map(entry=>entry.card.iid),
      amount:-lossEach,
      sourceIid:operation.sourceIid,
      sourceController,
      reason:operation.reason || 'DESTRUCTION_OF_PARADISE',
      bypassReaction:true
    }, false);
  }
  ctx.events.push({
    type:'SPLIT_FATE_LOSS_RESOLVED',
    sourceIid:operation.sourceIid || null,
    cardType:declaredType,
    targetIids:targets.map(entry=>entry.card.iid),
    total,
    lossEach
  });
  return {targetIids:targets.map(entry=>entry.card.iid), total, lossEach};
}

function changeLandscape(ctx, operation){
  const landscapeId = String(operation.landscapeId || '');
  if(!/^igb(?:[1-9]|1[0-9]|20)$/.test(landscapeId)){
    throw operationError('INVALID_LANDSCAPE', 'landscape change target is invalid');
  }
  const result = replaceLandscapeState(ctx.state, landscapeId);
  ctx.events.push({
    type:'LANDSCAPE_CHANGED',
    previousLandscapeId:result.previousLandscapeId,
    landscapeId:result.landscapeId,
    playerIndex:Number(operation.sourceController),
    sourceIid:operation.sourceIid || null
  });
  return result;
}

function setMaxTurns(ctx, operation){
  const previousMaxTurns = Math.max(1, Number(ctx.state.maxTurns) || 24);
  const amount = Number(operation.amount);
  if(Number.isInteger(amount) && amount > 0){
    ctx.state.maxTurns = previousMaxTurns + amount;
  }else{
    const requested = Number(operation.maxTurns);
    if(!Number.isInteger(requested) || requested < 1){
      throw operationError('INVALID_MAX_TURNS', 'match turn limit must be a positive integer');
    }
    ctx.state.maxTurns = Math.max(previousMaxTurns, requested);
  }
  const result = {previousMaxTurns, maxTurns:ctx.state.maxTurns};
  ctx.events.push({
    type:'MATCH_TURN_LIMIT_CHANGED',
    previousMaxTurns,
    maxTurns:ctx.state.maxTurns,
    playerIndex:Number(operation.sourceController),
    sourceIid:operation.sourceIid || null,
    reason:operation.reason || null
  });
  return result;
}

function gainZoneFateDifference(ctx, operation){
  const source = findBoardCard(ctx.state, operation.sourceIid);
  if(!source) throw operationError('CARD_NOT_ON_BOARD', 'The Child of War source is no longer on the board');
  const zone = Number(operation.zone);
  if(!Number.isInteger(zone) || zone < 0 || zone > 2){
    throw operationError('INVALID_ZONE', 'The Child of War requires a valid selected zone');
  }
  const controller = Number(operation.sourceController);
  if(controller !== 0 && controller !== 1){
    throw operationError('PLAYER_NOT_FOUND', 'The Child of War controller is invalid');
  }
  const ownFate = zoneScore(ctx.state, zone, controller);
  const opponentFate = zoneScore(ctx.state, zone, controller === 0 ? 1 : 0);
  const amount = Math.max(0, ownFate - opponentFate);
  if(amount > 0){
    changeFate(ctx, {
      type:OPERATION_TYPES.MODIFY_FATE,
      targetIid:source.card.iid,
      amount,
      sourceIid:source.card.iid,
      sourceController:controller,
      reason:'CHILD_OF_WAR'
    }, false);
  }
  return {zone, ownFate, opponentFate, amount};
}

function redrawHand(ctx, operation){
  const playerIndex = Number(operation.playerIndex);
  const player = ctx.state.players[playerIndex];
  if(!player) throw operationError('PLAYER_NOT_FOUND', 'Chauffeur controller is invalid');
  const sourceCard = cardSource(ctx, operation);
  const snapshot = player.hand.map(card=>String(card.iid));
  const discardedIids = [];
  for(const targetIid of snapshot){
    const entry = findCard(ctx.state, targetIid);
    if(!entry || entry.zone !== 'hand' || Number(entry.playerIndex) !== playerIndex) continue;
    const discardOperation = {
      type:OPERATION_TYPES.DISCARD_CARD,
      targetIid,
      sourceIid:operation.sourceIid || null,
      sourceController:Number(operation.sourceController),
      semanticSourceCardId:operation.semanticSourceCardId,
      reason:'CHAUFFEUR_REDRAW'
    };
    const check = inspectOperation(ctx.state, {...discardOperation, sourceCard});
    if(!check.ok) continue;
    discardCard(ctx, discardOperation);
    if(!player.hand.some(card=>String(card.iid) === targetIid)) discardedIids.push(targetIid);
  }
  const drawResult = discardedIids.length
    ? drawCards(ctx, {
        type:OPERATION_TYPES.DRAW_CARD,
        playerIndex,
        count:discardedIids.length,
        activatedEffect:true,
        sourceIid:operation.sourceIid || null,
        sourceController:Number(operation.sourceController),
        semanticSourceCardId:operation.semanticSourceCardId || 'bh10'
      })
    : {drawnIids:[]};
  return {discardedIids, drawnIids:drawResult.drawnIids};
}

function captureBoardFateState(state){
  const snapshot = new Map();
  for(const entry of boardEntries(state)){
    const iid = String(entry.card?.iid || '');
    if(!iid) continue;
    snapshot.set(iid, {
      stored:Math.max(0, Number(entry.card.currentFate) || 0),
      effective:Math.max(0, Number(effectiveFate(state, entry)) || 0)
    });
  }
  return snapshot;
}

function applyChineseMacArthurToDerivedAuraGains(ctx, beforeSnapshot){
  if(ctx._resolvingBh15DerivedAura || !(beforeSnapshot instanceof Map)) return;
  const pending = [];
  for(const entry of boardEntries(ctx.state)){
    const card = entry.card;
    const iid = String(card?.iid || '');
    if(!iid) continue;
    const afterStored = Math.max(0, Number(card.currentFate) || 0);
    const afterEffective = Math.max(0, Number(effectiveFate(ctx.state, entry)) || 0);
    const previous = beforeSnapshot.get(iid) || {stored:afterStored, effective:afterStored};
    const derivedGain = (afterEffective - previous.effective) - (afterStored - previous.stored);
    if(derivedGain <= 0) continue;
    const controller = controllerOf(card);
    const sources = boardEntries(ctx.state).filter(sourceEntry=>
      controllerOf(sourceEntry.card) === controller
      && sourceEntry.card.faceDown !== true
      && runtimeRuleId(sourceEntry.card) === 'bh15'
      && !isEffectSourceSuppressed(ctx.state, sourceEntry)
    );
    if(sources.length) pending.push({entry, afterEffective, sources});
  }
  if(!pending.length) return;
  ctx._resolvingBh15DerivedAura = true;
  try{
    for(const item of pending){
      const before = item.afterEffective;
      commitPermanentFate(item.entry.card, Math.max(0, Number(item.entry.card.currentFate) || 0) + item.sources.length);
      const after = Math.max(0, Number(effectiveFate(ctx.state, findCard(ctx.state, item.entry.card.iid))) || 0);
      emit(ctx, {
        type:RULE_EVENT_TYPES.FATE_CHANGED,
        cardIid:item.entry.card.iid,
        before,
        after,
        amount:after - before,
        sourceIid:item.sources[0]?.card?.iid || null,
        semanticSourceCardId:'bh15',
        reason:'CHINESE_MACARTHUR_AURA_BONUS',
        bh15Bonus:item.sources.length,
        bh15SourceIids:item.sources.map(sourceEntry=>String(sourceEntry.card.iid || ''))
      });
    }
  }finally{
    ctx._resolvingBh15DerivedAura = false;
  }
}

function dispatchOperation(ctx, operation){
  if(!ctx?.state || !Array.isArray(ctx.events) || !Array.isArray(ctx.ruleEvents)){
    throw new TypeError('operation context is invalid');
  }
  switch(operation?.type){
    case OPERATION_TYPES.DRAW_CARD: return drawCards(ctx, operation);
    case OPERATION_TYPES.SET_CARD: return setCard(ctx, operation);
    case OPERATION_TYPES.CONSOLIDATE_CARD: return consolidateCard(ctx, operation);
    case OPERATION_TYPES.MOVE_CARD: return moveCard(ctx, operation);
    case OPERATION_TYPES.DISCARD_CARD: return discardCards(ctx, operation);
    case OPERATION_TYPES.MODIFY_FATE: return changeFate(ctx, operation, false);
    case OPERATION_TYPES.SET_FATE: return changeFate(ctx, operation, true);
    case OPERATION_TYPES.CHANGE_CARD_TYPE: return changeCardType(ctx, operation);
    case OPERATION_TYPES.REVEAL_HAND: return revealHand(ctx, operation);
    case OPERATION_TYPES.TRANSFER_CARDS: return transferCards(ctx, operation);
    case OPERATION_TYPES.CHANGE_CONTROL: return changeControl(ctx, operation);
    case OPERATION_TYPES.CREATE_MOVEMENT_GRANT: return createMovementGrant(ctx, operation);
    case OPERATION_TYPES.CREATE_TIMED_PLAYER_STATUS: return createTimedPlayerStatus(ctx, operation);
    case OPERATION_TYPES.CREATE_STATUS: return changeStatus(ctx, operation, false);
    case OPERATION_TYPES.REMOVE_STATUS: return changeStatus(ctx, operation, true);
    case OPERATION_TYPES.CREATE_MATCH_STATUS: return createMatchStatus(ctx, operation);
    case OPERATION_TYPES.REMOVE_MATCH_STATUS: return removeMatchStatus(ctx, operation);
    case OPERATION_TYPES.TICK_COUNTER_FATE: return tickCounterFate(ctx, operation);
    case OPERATION_TYPES.SET_CARD_COUNTER: return setCardCounter(ctx, operation);
    case OPERATION_TYPES.ADD_SAFE_ROW: return addSafeRow(ctx, operation);
    case OPERATION_TYPES.ADD_SAFE_SQUARE: return addSafeSquare(ctx, operation);
    case OPERATION_TYPES.CREATE_SQUARE_STATUS: return createSquareStatus(ctx, operation);
    case OPERATION_TYPES.DISCARD_AND_GAIN_FATE: return discardAndGainFate(ctx, operation);
    case OPERATION_TYPES.CREATE_CARD_MARK: return createCardMark(ctx, operation);
    case OPERATION_TYPES.MASS_MODIFY_MATCHING_CARD: return massModifyMatchingCard(ctx, operation);
    case OPERATION_TYPES.RANDOM_DISCARD_HAND: return randomDiscardHand(ctx, operation);
    case OPERATION_TYPES.RANDOM_DISCARD_DECK: return randomDiscardDeck(ctx, operation);
    case OPERATION_TYPES.RANDOM_STEAL_HAND: return randomStealHand(ctx, operation);
    case OPERATION_TYPES.DISCARD_TYPES_AND_GAIN_FATE: return discardTypesAndGainFate(ctx, operation);
    case OPERATION_TYPES.SCHEDULE_CARD: return scheduleCard(ctx, operation);
    case OPERATION_TYPES.CREATE_TOKENS: return createTokens(ctx, operation);
    case OPERATION_TYPES.CHANGE_PLAYER_COUNTER: return changePlayerCounter(ctx, operation);
    case OPERATION_TYPES.RANDOM_HAND_FATE: return randomHandFate(ctx, operation);
    case OPERATION_TYPES.CHANGE_ZONE_AFFILIATION: return changeZoneAffiliation(ctx, operation);
    case OPERATION_TYPES.RANDOM_TRANSFER_CARDS: return randomTransferCards(ctx, operation);
    case OPERATION_TYPES.SPLIT_FATE_LOSS_BY_TYPE: return splitFateLossByType(ctx, operation);
    case OPERATION_TYPES.GAIN_ZONE_FATE_DIFFERENCE: return gainZoneFateDifference(ctx, operation);
    case OPERATION_TYPES.REDRAW_HAND: return redrawHand(ctx, operation);
    case OPERATION_TYPES.CHANGE_LANDSCAPE: return changeLandscape(ctx, operation);
    case OPERATION_TYPES.SET_MAX_TURNS: return setMaxTurns(ctx, operation);
    case OPERATION_TYPES.MODIFY_PRESSURE: return modifyCardPressure(ctx, operation);
    case OPERATION_TYPES.MODIFY_MORALE: return modifyMorale(ctx, operation);
    default: throw operationError('UNSUPPORTED_OPERATION', `unsupported operation ${operation?.type || '(missing)'}`);
  }
}

export function applyOperation(ctx, operation){
  if(!ctx?.state || !Array.isArray(ctx.events) || !Array.isArray(ctx.ruleEvents)){
    throw new TypeError('operation context is invalid');
  }
  const depth = Math.max(0, Number(ctx._operationDepth) || 0);
  const beforeSnapshot = depth === 0 && !ctx._resolvingBh15DerivedAura
    ? captureBoardFateState(ctx.state)
    : null;
  ctx._operationDepth = depth + 1;
  let result;
  try{
    result = dispatchOperation(ctx, operation);
  }finally{
    ctx._operationDepth = depth;
  }
  if(depth === 0 && beforeSnapshot) applyChineseMacArthurToDerivedAuraGains(ctx, beforeSnapshot);
  if(depth === 0) refreshMoralePressure(ctx);
  return result;
}
