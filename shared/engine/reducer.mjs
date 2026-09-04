import {
  COMMAND_TYPES,
  ENGINE_VERSION,
  MAX_SUPPORTERS_SET_PER_TURN,
  PROMPT_TYPES,
  RULESET_VERSION,
  RULE_EVENT_TYPES,
  SCHEMA_VERSION
} from './constants.mjs';
import {assertInvariants} from './invariants.mjs';
import {
  activeHandLimit,
  isProtectedHandLimitCard,
  refreshHandLimitRequirement
} from './hand-limits.mjs';
import {
  effectiveCardType,
  isEffectImmutable,
  isEffectSourceSuppressed,
  isImmuneToOpponentEffects,
  runtimeRuleId,
  zoneActionBlock
} from './modifiers.mjs';
import {applyOperation, emitRuleEvent} from './operations.mjs';
import {
  destinationKey,
  eligibleBoardTargets,
  eligibleCardTargets,
  eligibleDestinations,
  eligibleZones,
  openingProgramChoiceAvailable
} from './prompts.mjs';
import {
  boardEntries,
  controllerOf,
  findBoardCard,
  findCard,
  playerIndexById,
  rowOwner
} from './selectors.mjs';
import {canonicalHash, cloneSerializable, stableStringify} from './serialization.mjs';
import {calculateOutcome, zoneScore} from './scoring.mjs';
import {nextInt} from './rng.mjs';
import {
  calculateMoraleOutcome,
  MORALE_PENALTY_THRESHOLDS,
  moraleConsolidationLimit,
  moraleConsolidationsUsed,
  moralePenaltyActive,
  moralePressureEnabled,
  recordMoraleConsolidation,
  recordMoralePressureRuleEvent,
  refreshMoralePressure,
  resetMoraleTurnCounters,
  resolveMoralePressureCycle,
  shouldSkipMoraleDraw
} from './morale-pressure.mjs';
import {cloneState} from './state.mjs';
import {cardRule, hasTiming} from './cards/registry.mjs';
import {
  expireCaliforniqueHandCards,
  completeBattleOfPellaThreshold,
  landscapeChangeBlockReason,
  landscapeSupporterEffectLimitReached,
  recordLandscapeSupporterEffect,
  resetLandscapeTurnCounters,
  shouldSkipLandscapeDraw
} from './landscapes/runtime.mjs';

function reject(code, reason, details = {}){
  return {
    ok:false,
    rejection:{code, reason, details}
  };
}

function containsForbiddenSnapshot(value, seen = new Set()){
  if(!value || typeof value !== 'object') return false;
  if(seen.has(value)) return false;
  seen.add(value);
  for(const [key, item] of Object.entries(value)){
    if(key === 'postState' || key === 'baseStateHash') return true;
    if(containsForbiddenSnapshot(item, seen)) return true;
  }
  return false;
}

const PAYLOAD_FIELDS = Object.freeze({
  CHOOSE_TURN_ORDER:['goFirst'],
  DRAW_CARD:['playerIndex', 'count', 'activatedEffect', 'sourceIid'],
  SET_CARD:['cardIid', 'destination', 'faceDown'],
  SET_CARD_FROM_DECK:['cardIid', 'destination'],
  SET_ADAPTIVE_TOKEN:['cardIid', 'destination', 'declaredType', 'declaredAffiliation', 'declaredRarity', 'placementType'],
  CONSOLIDATE_CARD:['cardIid', 'tributeIids', 'destination', 'faceDown'],
  MOVE_CARD:['cardIid', 'destination', 'allowSwap'],
  FLIP_CARD:['cardIid'],
  ACTIVATE_LANDSCAPE:['sourceIid', 'discardIids', 'targetIid', 'cardIds'],
  DISCARD_CARD:['targetIid', 'sourceIid', 'reason'],
  MODIFY_FATE:['targetIid', 'amount', 'sourceIid', 'reason'],
  ACTIVATE_EFFECT:['sourceIid', 'userActivated'],
  ANSWER_PROMPT:['promptId', 'choice', 'reactionIid', 'selectedIid', 'selectedIids', 'destination', 'destinations', 'zone', 'cancel'],
  DISCARD_TO_HAND_LIMIT:['discardedIids'],
  END_TURN:[],
  CONCEDE:[]
});

function dangerousObjectKey(value, seen = new Set()){
  if(!value || typeof value !== 'object' || seen.has(value)) return '';
  seen.add(value);
  for(const [key, item] of Object.entries(value)){
    if(['__proto__', 'prototype', 'constructor'].includes(key)) return key;
    const nested = dangerousObjectKey(item, seen);
    if(nested) return nested;
  }
  return '';
}

function validateDestination(destination){
  if(!destination || typeof destination !== 'object' || Array.isArray(destination)) return 'destination must be an object';
  const extra = Object.keys(destination).filter(key=>!['z', 'r', 'c'].includes(key));
  if(extra.length) return `unknown destination field ${extra[0]}`;
  for(const coordinate of ['z', 'r', 'c']){
    if(!Number.isInteger(destination[coordinate])) return `destination ${coordinate} must be an integer`;
  }
  return '';
}

function validatePayload(type, payload){
  const allowed = PAYLOAD_FIELDS[type] || [];
  const extra = Object.keys(payload).filter(key=>!allowed.includes(key));
  if(extra.length) return `unknown ${type} payload field ${extra[0]}`;
  if(['SET_CARD', 'SET_CARD_FROM_DECK', 'SET_ADAPTIVE_TOKEN', 'CONSOLIDATE_CARD', 'MOVE_CARD'].includes(type)){
    if(!String(payload.cardIid || '')) return 'cardIid is required';
    const destinationError = validateDestination(payload.destination);
    if(destinationError) return destinationError;
  }
  if(type === 'CHOOSE_TURN_ORDER' && typeof payload.goFirst !== 'boolean'){
    return 'goFirst must be a boolean';
  }
  if(type === 'CONSOLIDATE_CARD'){
    if(!Array.isArray(payload.tributeIids)) return 'tributeIids must be an array';
    if(payload.tributeIids.length > 27) return 'tributeIids exceeds the board capacity';
    if(payload.tributeIids.some(iid=>!String(iid || ''))) return 'every tributeIid must be present';
  }
  if(type === 'ACTIVATE_EFFECT'){
    if(!String(payload.sourceIid || '')) return 'sourceIid is required';
    if(payload.userActivated !== undefined && typeof payload.userActivated !== 'boolean') return 'userActivated must be a boolean';
  }
  if(type === 'ACTIVATE_LANDSCAPE'){
    if(payload.sourceIid !== undefined && !String(payload.sourceIid || '')) return 'sourceIid must be a stable card iid';
    if(payload.targetIid !== undefined && !String(payload.targetIid || '')) return 'targetIid must be a stable card iid';
    if(payload.discardIids !== undefined
      && (!Array.isArray(payload.discardIids)
        || payload.discardIids.length > 20
        || payload.discardIids.some(iid=>!String(iid || '')))){
      return 'discardIids must be an array of stable card iids';
    }
    if(payload.cardIds !== undefined
      && (!Array.isArray(payload.cardIds)
        || payload.cardIds.length > 4
        || payload.cardIds.some(id=>!String(id || '')))){
      return 'cardIds must be an array of up to four stable card ids';
    }
  }
  if(type === 'ANSWER_PROMPT'){
    if(!String(payload.promptId || '')) return 'promptId is required';
    if(payload.destination !== undefined){
      const destinationError = validateDestination(payload.destination);
      if(destinationError) return destinationError;
    }
    if(payload.destinations !== undefined){
      if(!Array.isArray(payload.destinations) || payload.destinations.length > 27){
        return 'destinations must be an array within board capacity';
      }
      for(const destination of payload.destinations){
        const destinationError = validateDestination(destination);
        if(destinationError) return destinationError;
      }
    }
  }
  if(type === 'DISCARD_TO_HAND_LIMIT'){
    if(!Array.isArray(payload.discardedIids) || payload.discardedIids.length === 0){
      return 'discardedIids must be a non-empty array';
    }
    if(payload.discardedIids.length > 100 || payload.discardedIids.some(iid=>!String(iid || ''))){
      return 'discardedIids is invalid';
    }
  }
  if(type === 'DISCARD_CARD' && !String(payload.targetIid || '')) return 'targetIid is required';
  if(type === 'MODIFY_FATE'){
    if(!String(payload.targetIid || '')) return 'targetIid is required';
    if(!Number.isInteger(payload.amount)) return 'amount must be an integer';
  }
  if(type === 'DRAW_CARD'){
    if(payload.playerIndex !== undefined && ![0, 1].includes(payload.playerIndex)) return 'playerIndex must be 0 or 1';
    if(payload.count !== undefined && (!Number.isInteger(payload.count) || payload.count < 0 || payload.count > 100)){
      return 'count must be an integer from 0 through 100';
    }
  }
  return '';
}

export function validateCommand(command){
  if(!command || typeof command !== 'object' || Array.isArray(command)){
    return reject('INVALID_COMMAND', 'command must be an object');
  }
  const allowed = new Set(['commandId', 'matchId', 'expectedRevision', 'type', 'payload']);
  const extra = Object.keys(command).filter(key=>!allowed.has(key));
  if(extra.length) return reject('INVALID_COMMAND', `unknown command field ${extra[0]}`);
  const commandId = String(command.commandId || '');
  if(!/^[A-Za-z0-9_.:@-]{1,160}$/.test(commandId)){
    return reject('INVALID_COMMAND_ID', 'commandId must be a stable non-empty identifier');
  }
  const matchId = String(command.matchId || '');
  if(!/^[A-Za-z0-9_.:@-]{1,160}$/.test(matchId)) return reject('INVALID_MATCH_ID', 'matchId must be a stable non-empty identifier');
  if(!Number.isInteger(command.expectedRevision) || command.expectedRevision < 0){
    return reject('INVALID_REVISION', 'expectedRevision must be a non-negative integer');
  }
  const type = String(command.type || '').toUpperCase();
  if(!COMMAND_TYPES.includes(type)) return reject('UNKNOWN_COMMAND', `unsupported command type ${type || '(missing)'}`);
  if(command.payload !== undefined && (!command.payload || typeof command.payload !== 'object' || Array.isArray(command.payload))){
    return reject('INVALID_PAYLOAD', 'payload must be an object');
  }
  if(containsForbiddenSnapshot(command)){
    return reject('CLIENT_STATE_FORBIDDEN', 'v3 commands cannot upload postState or baseStateHash');
  }
  const dangerousKey = dangerousObjectKey(command);
  if(dangerousKey) return reject('INVALID_COMMAND', `dangerous object key ${dangerousKey} is not allowed`);
  const payload = command.payload === undefined ? {} : command.payload;
  const payloadError = validatePayload(type, payload);
  if(payloadError) return reject('INVALID_PAYLOAD', payloadError);
  try{
    const serialized = stableStringify(command);
    if(serialized.length > 65536) return reject('COMMAND_TOO_LARGE', 'command exceeds 65536 canonical characters');
  }catch(error){
    return reject('INVALID_COMMAND', error.message);
  }
  return {ok:true, command:{...cloneSerializable(command), type, payload:cloneSerializable(payload)}};
}

function nextId(state, kind){
  state.eventSeq += 1;
  return `${state.matchId}:${kind}:${state.revision + 1}:${state.eventSeq}`;
}

function resolveValue(value, frame){
  if(typeof value === 'string' && value.startsWith('$')){
    const key = value.slice(1);
    if(key === 'sourceIid') return frame.sourceIid;
    if(key === 'controller') return frame.controller;
    if(key === 'opponent') return frame.controller === 0 ? 1 : 0;
    if(key === 'opponentPlacementsLastTurn'){
      const opponent = frame.controller === 0 ? 1 : 0;
      return Number(frame.stateCardsPlacedLastTurn?.[opponent] || 0);
    }
    return cloneSerializable(frame.locals[key]);
  }
  if(Array.isArray(value)) return value.map(item=>resolveValue(item, frame));
  if(value && typeof value === 'object'){
    return Object.fromEntries(
      Object.entries(value).map(([key, item])=>[key, resolveValue(item, frame)])
    );
  }
  return cloneSerializable(value);
}

function resolveOperation(template, frame){
  const operation = {};
  for(const [key, value] of Object.entries(template || {})){
    operation[key] = resolveValue(value, frame);
  }
  operation.sourceIid = operation.sourceIid || frame.sourceIid;
  operation.sourceController = frame.controller;
  return operation;
}

function applyResolvedEffectOperation(ctx, operation, frame){
  if(frame?.sourceCardId && !operation.semanticSourceCardId){
    operation.semanticSourceCardId = String(frame.sourceCardId);
  }
  if(frame?.frameId && operation.type === 'DRAW_CARD' && operation.activatedEffect === true && !operation.effectActivationId){
    operation.effectActivationId = String(frame.frameId);
  }
  const eventStart = ctx.events.length;
  const ruleEventStart = ctx.ruleEvents.length;
  const result = applyOperation(ctx, operation);
  const semanticSourceCardId = String(frame?.sourceCardId || '');
  if(semanticSourceCardId){
    for(const event of ctx.events.slice(eventStart)){
      if(event && !event.semanticSourceCardId) event.semanticSourceCardId = semanticSourceCardId;
    }
    for(const event of ctx.ruleEvents.slice(ruleEventStart)){
      if(event && !event.semanticSourceCardId) event.semanticSourceCardId = semanticSourceCardId;
    }
  }
  return result;
}

function effectUses(card){
  return Number(card?.counters?.effectUses || 0) || 0;
}

function reconcileSovietGrenadierTargets(state, ctx){
  const entries = boardEntries(state);
  for(const source of entries){
    if(String(source.card?.id || '') !== '44' || source.card.faceDown === true) continue;
    const declaredType = String(source.card.counters?.sovietDeclaredType || '');
    if(!declaredType) continue;
    if(!source.card.counters || typeof source.card.counters !== 'object') source.card.counters = {};
    const candidates = entries.filter(target=>
      String(target.card?.iid || '') !== String(source.card.iid || '')
      && target.z === source.z
      && target.card.faceDown !== true
      && effectiveCardType(state, target.card) === declaredType
      && Math.abs(target.r - source.r) + Math.abs(target.c - source.c) === 1
    );
    const previousIid = String(source.card.counters.sovietTargetIid || '');
    if(previousIid && candidates.some(target=>String(target.card.iid) === previousIid)) continue;
    if(!candidates.length){
      source.card.counters.sovietTargetIid = '';
      continue;
    }
    const chosen = candidates[nextInt(state.rngState, candidates.length)];
    source.card.counters.sovietTargetIid = String(chosen.card.iid);
    source.card.counters.sovietTargetSequence = Math.max(0, Number(source.card.counters.sovietTargetSequence) || 0) + 1;
    ctx.events.push({
      type:'SOVIET_GRENADIERS_TARGET_LINKED',
      sourceIid:String(source.card.iid),
      targetIid:String(chosen.card.iid),
      previousTargetIid:previousIid || null,
      declaredType,
      sequence:source.card.counters.sovietTargetSequence,
      semanticSourceCardId:'44'
    });
  }
}

function startFieldEntryDeclaration(state, ctx, card, controller, commandId){
  if(String(card?.id || '') !== '44' || card.faceDown === true || card.counters?.sovietDeclaredType) return false;
  startEffect(state, ctx, card, controller, 'PASSIVE', commandId);
  return true;
}

function consumeEffectUse(card){
  if(!card.counters || typeof card.counters !== 'object') card.counters = {};
  card.counters.effectUses = effectUses(card) + 1;
}

function reactionUses(card){
  return Number(card?.counters?.reactionUses || 0) || 0;
}

function consumeReaction(card){
  if(!card.counters || typeof card.counters !== 'object') card.counters = {};
  card.counters.reactionUses = reactionUses(card) + 1;
}

function movementGrantFor(state, cardIid){
  return state.statuses.find(status=>
    status?.type === 'MOVEMENT_GRANT'
    && !String(status.statusId || '').startsWith('movement-grant:busser:')
    && String(status.targetIid || '') === String(cardIid || '')
    && Number(status.remainingOwnerTurns) > 0
  ) || null;
}

function sharedEffectUses(state, rule, playerIndex){
  const key = String(rule?.sharedUseLimit?.key || '').toLowerCase();
  if(!key) return 0;
  return Number(state.statuses.find(status=>
    status?.type === 'RULE_USE_COUNTER'
    && status.statusId === `rule-use:${key}:p${playerIndex}`
  )?.uses || 0) || 0;
}

function activeTimedPlayerStatus(state, statusType, playerIndex){
  return state.statuses.find(status=>
    status?.type === 'TIMED_PLAYER_STATUS'
    && status.statusType === statusType
    && Number(status.playerIndex) === Number(playerIndex)
    && Number(status.activeFromTurn) <= state.turn
    && Number(status.remainingTargetTurns) > 0
  ) || null;
}

function supporterEffectBlock(state, card, playerIndex){
  if(landscapeSupporterEffectLimitReached(state, card, playerIndex)){
    return {
      statusId:`landscape:igb15:p${playerIndex}:turn${state.turn}`,
      statusType:'LANDSCAPE_SUPPORTER_EFFECT_LIMIT',
      sourceIid:'landscape:igb15',
      sourceController:playerIndex
    };
  }
  if(effectiveCardType(state, card) === 'Supporter'){
    const status = activeTimedPlayerStatus(state, 'SUPPORTER_EFFECTS_BLOCKED', playerIndex);
    if(status){
      if(Number(status.sourceController) !== Number(playerIndex)
        && (isEffectImmutable(card) || isImmuneToOpponentEffects(card, state))){
        return null;
      }
      return status;
    }
  }
  if(String(card?.type || '') !== 'Supporter'
    || String(card.id || '') === '92'
    || isEffectImmutable(card)
    || isImmuneToOpponentEffects(card, state)){
    return null;
  }
  const target = findBoardCard(state, card.iid);
  if(!target) return null;
  const lumberjack = boardEntries(state).find(entry=>
    entry.z === target.z
    && String(entry.card.id || '') === '92'
    && String(entry.card.iid) !== String(card.iid)
    && controllerOf(entry.card) === Number(playerIndex)
    && entry.card.faceDown !== true
    && !entry.card.statuses?.includes('EFFECTS_SUPPRESSED')
  );
  return lumberjack ? {
    statusId:`lumberjack:${lumberjack.card.iid}:${card.iid}`,
    statusType:'LUMBERJACK_SUPPRESSION',
    sourceIid:lumberjack.card.iid,
    sourceController:Number(playerIndex)
  } : null;
}

function applyLumberjackSuppression(state, ctx, card, block, playerIndex){
  applyOperation(ctx, {
    type:'CREATE_STATUS',
    targetIid:card.iid,
    status:'EFFECTS_SUPPRESSED',
    sourceIid:block.sourceIid,
    sourceController:block.sourceController
  });
  applyOperation(ctx, {
    type:'CREATE_STATUS',
    targetIid:card.iid,
    status:'REINFORCEMENT:1',
    sourceIid:block.sourceIid,
    sourceController:block.sourceController
  });
  emitRuleEvent(ctx, {
    type:RULE_EVENT_TYPES.EFFECT_REACTED,
    sourceIid:card.iid,
    reactionIid:block.sourceIid,
    playerIndex:Number(block.sourceController),
    reactionKind:'LUMBERJACK',
    mode:'SUPPRESS'
  });
  ctx.events.push({
    type:'EFFECT_BLOCKED',
    sourceIid:card.iid,
    playerIndex,
    reason:block.statusType,
    statusId:block.statusId
  });
}

function expireOwnerTurnStatuses(state, endingPlayer, ctx){
  const retained = [];
  for(const status of state.statuses){
    if(!Number.isInteger(Number(status?.remainingOwnerTurns))
      || Number(status.playerIndex) !== Number(endingPlayer)){
      retained.push(status);
      continue;
    }
    const remainingOwnerTurns = Math.max(0, (Number(status.remainingOwnerTurns) || 0) - 1);
    if(remainingOwnerTurns > 0){
      retained.push({...status, remainingOwnerTurns});
    }else{
      ctx.events.push({
        type:'STATUS_EXPIRED',
        statusId:status.statusId,
        targetIid:status.targetIid || null,
        playerIndex:Number(status.playerIndex),
        statusType:status.type
      });
    }
  }
  state.statuses = retained;
  const hand = state.players[endingPlayer].hand;
  for(let index = hand.length - 1; index >= 0; index -= 1){
    const card = hand[index];
    if(card.counters?.pierogiCounter !== true
      || Number(card.counters?.pierogiCreator) !== endingPlayer
      || Number(card.counters?.createdTurn) === state.turn) continue;
    card.counters.handTurnsRemaining = Math.max(0, Number(card.counters.handTurnsRemaining || 0) - 1);
    if(card.counters.handTurnsRemaining > 0) continue;
    hand.splice(index, 1);
    ctx.events.push({type:'PIEROGI_EXPIRED', cardIid:card.iid, previousZone:'hand', playerIndex:endingPlayer});
  }
  for(const entry of [...boardEntries(state)]){
    if(entry.card.counters?.pierogiCounter !== true
      || Number(entry.card.counters?.pierogiHost) !== endingPlayer) continue;
    entry.card.counters.boardTurnsRemaining = Math.max(0, Number(entry.card.counters.boardTurnsRemaining || 0) - 1);
    if(entry.card.counters.boardTurnsRemaining > 0) continue;
    state.board[entry.z][entry.r][entry.c] = null;
    ctx.events.push({type:'PIEROGI_EXPIRED', cardIid:entry.card.iid, previousZone:'board', playerIndex:endingPlayer});
  }
}

function expireTimedPlayerStatuses(state, endingPlayer, ctx){
  const retained = [];
  for(const status of state.statuses){
    if(status?.type === 'SUPPORTERS_AS_CHARACTERS'
      && Number(status.playerIndex) === Number(endingPlayer)){
      const remainingTargetTurns = Math.max(0, (Number(status.remainingTargetTurns) || 0) - 1);
      if(remainingTargetTurns > 0){
        retained.push({...status, remainingTargetTurns});
      }else{
        ctx.events.push({
          type:'STATUS_EXPIRED',
          statusId:status.statusId,
          playerIndex:status.playerIndex,
          statusType:status.type
        });
      }
      continue;
    }
    if(status?.type !== 'TIMED_PLAYER_STATUS'
      || Number(status.playerIndex) !== Number(endingPlayer)
      || Number(status.activeFromTurn) > state.turn){
      retained.push(status);
      continue;
    }
    const remainingTargetTurns = Math.max(0, (Number(status.remainingTargetTurns) || 0) - 1);
    if(remainingTargetTurns > 0){
      retained.push({...status, remainingTargetTurns});
    }else{
      ctx.events.push({
        type:'STATUS_EXPIRED',
        statusId:status.statusId,
        playerIndex:status.playerIndex,
        statusType:status.statusType
      });
    }
  }
  state.statuses = retained;
}

function processTurnStartMechanics(state, playerIndex, ctx){
  // Opening/drawn Ali transfers must not interrupt the coin sequence or the
  // other player's turn. Activate his six-card cap at the recipient's first
  // actual turn boundary; the normal post-command hand-limit refresh then owns
  // one stable discard prompt.
  for(const card of (state.players[playerIndex]?.hand || [])){
    if(String(card?.id || '') !== 'bh03'
      || card?.counters?.aliHandLimitPendingUntilTurnStart !== true) continue;
    card.counters.aliHandLimitPendingUntilTurnStart = false;
    ctx.events.push({
      type:'ALI_HAND_LIMIT_ACTIVATED',
      playerIndex,
      sourceIid:card.iid,
      limit:6
    });
  }
  const queued = Math.max(0, Number(state.queuedExtraSupporters[playerIndex] || 0));
  if(queued){
    state.extraSupportersThisTurn[playerIndex] += queued;
    state.queuedExtraSupporters[playerIndex] = 0;
    for(const status of state.statuses){
      if(status?.type !== 'SELVA_EXTRA_SUPPORTER'
        || Number(status.playerIndex) !== Number(playerIndex)
        || status.activeNow === true) continue;
      status.activeNow = true;
      status.remainingOwnerTurns = 1;
    }
    ctx.events.push({type:'QUEUED_SUPPORTER_SETS_ACTIVATED', playerIndex, count:queued});
  }
  for(const status of state.statuses.filter(item=>
    item?.type === 'DELAYED_HAND_DELIVERY'
    && Number(item.playerIndex) === playerIndex
  )){
    status.deliveryTurnsRemaining = Math.max(0, Number(status.deliveryTurnsRemaining || 0) - 1);
    if(status.deliveryTurnsRemaining > 0) continue;
    applyOperation(ctx, {
      type:'TRANSFER_CARDS',
      targetIid:status.cardIid,
      playerIndex,
      destinationPile:'hand',
      sourceIid:status.sourceIid,
      sourceController:playerIndex,
      semanticSourceCardId:'94',
      reason:'MAIL_DELIVERY'
    });
    ctx.events.push({
      type:'DELAYED_CARD_DELIVERED',
      privateTo:[playerIndex],
      playerIndex,
      cardIid:status.cardIid,
      sourceIid:status.sourceIid || null
    });
  }
  state.statuses = state.statuses.filter(status=>
    status?.type !== 'DELAYED_HAND_DELIVERY'
    || Number(status.deliveryTurnsRemaining || 0) > 0
  );
  for(const card of [...state.players[playerIndex].hand]){
    if(String(card.id || '') !== '70' || !card.statuses?.includes('GUERILLA_INFILTRATING')) continue;
    applyOperation(ctx, {
      type:'RANDOM_HAND_FATE',
      playerIndex,
      excludeIid:card.iid,
      amount:-2,
      sourceIid:card.iid,
      sourceController:Number(card.counters?.guerillaOriginalOwner),
      reason:'WINE_COUNTRY_GUERILLA'
    });
    card.counters.guerillaTurnsRemaining = Math.max(
      0,
      Number(card.counters.guerillaTurnsRemaining || 0) - 1
    );
    const infiltrationStatusId = `wine-country-guerilla:${card.iid}`;
    const infiltrationStatus = state.statuses.find(status=>status?.statusId === infiltrationStatusId);
    if(infiltrationStatus) infiltrationStatus.remaining = card.counters.guerillaTurnsRemaining;
    if(card.counters.guerillaTurnsRemaining > 0) continue;
    card.statuses = card.statuses.filter(status=>
      !['GUERILLA_INFILTRATING', 'HAND_EFFECT_IMMUNE'].includes(status)
    );
    state.statuses = state.statuses.filter(status=>status?.statusId !== infiltrationStatusId);
    ctx.events.push({
      type:'STATUS_REMOVED',
      statusId:infiltrationStatusId,
      playerIndex,
      statusType:'WINE_COUNTRY_GUERILLA_INFILTRATION'
    });
    applyOperation(ctx, {
      type:'DISCARD_CARD',
      targetIid:card.iid,
      sourceIid:card.iid,
      sourceController:Number(card.counters?.guerillaOriginalOwner),
      reason:'GUERILLA_EXPIRED',
      disableReplacement:true
    });
  }
}

function activationReactionOptions(state, frame){
  const options = [];
  const opponent = frame.controller === 0 ? 1 : 0;
  for(const entry of boardEntries(state)){
    if(controllerOf(entry.card) !== opponent) continue;
    const rule = cardRule(entry.card.id, state);
    if(rule?.reactionKind === 'LYDIA' && reactionUses(entry.card) < Number(rule.maxUses || 0)){
      options.push({reactionIid:entry.card.iid, kind:'LYDIA', modes:['NEGATE']});
    }
    // Secules reacts to Initiator effects regardless of whether their printed
    // timing is ACTIVATE or WHEN_SET (Lina is the important WHEN_SET case), and
    // to Supporter WHEN_SET effects.
    const secWorks = String(frame.sourceType || '') === 'Initiator'
      || (frame.timing === 'WHEN_SET' && String(frame.sourceType || '') === 'Supporter');
    if(rule?.reactionKind === 'SECULES' && secWorks && reactionUses(entry.card) < Number(rule.maxUses || 0)){
      options.push({reactionIid:entry.card.iid, kind:'SECULES', modes:['NEGATE']});
    }
  }
  const sourceRule = cardRule(frame.sourceCardId, state);
  if(sourceRule?.havanoTargeting === 'OPPONENT'
    && Number(state.supportersSetForCapThisTurn?.[opponent] || 0) < MAX_SUPPORTERS_SET_PER_TURN){
    for(const card of state.players[opponent].hand){
      if(cardRule(card.id, state)?.reactionKind === 'HAVANO'){
        options.push({reactionIid:card.iid, kind:'HAVANO', modes:['NEGATE', 'SUPPRESS']});
      }
    }
  }
  return options.sort((a, b)=>a.reactionIid.localeCompare(b.reactionIid));
}

function targetReactionOptions(state, frame, operation){
  const target = findCard(state, operation.targetIid || operation.cardIid);
  const explicitTargetController = Number(operation.targetPlayerIndex);
  const targetController = target
    ? controllerOf(target.card)
    : ([0, 1].includes(explicitTargetController) ? explicitTargetController : null);
  if(targetController === null) return [];
  if(targetController === frame.controller) return [];
  if(Number(state.supportersSetForCapThisTurn?.[targetController] || 0) >= MAX_SUPPORTERS_SET_PER_TURN) return [];
  return state.players[targetController].hand
    .filter(card=>cardRule(card.id, state)?.reactionKind === 'HAVANO')
    .map(card=>({reactionIid:card.iid, kind:'HAVANO', modes:['NEGATE', 'SUPPRESS']}))
    .sort((a, b)=>a.reactionIid.localeCompare(b.reactionIid));
}

function startPassiveTargetReaction(state, ctx, source, controller, commandId){
  const rule = cardRule(source?.id, state);
  if(!source || source.faceDown === true || rule?.havanoPassiveEntry !== true) return false;
  if(isEffectSourceSuppressed(state, source)) return false;
  const reactingPlayer = controller === 0 ? 1 : 0;
  if(Number(state.supportersSetForCapThisTurn?.[reactingPlayer] || 0) >= MAX_SUPPORTERS_SET_PER_TURN) return false;
  const options = state.players[reactingPlayer].hand
    .filter(card=>cardRule(card.id, state)?.reactionKind === 'HAVANO')
    .map(card=>({reactionIid:card.iid, kind:'HAVANO', modes:['SUPPRESS']}))
    .sort((a, b)=>a.reactionIid.localeCompare(b.reactionIid));
  if(!options.length) return false;
  const frame = {
    frameId:nextId(state, 'frame'),
    kind:'PASSIVE_ENTRY_REACTION',
    sourceIid:source.iid,
    sourceCardId:String(source.id || ''),
    sourceType:String(source.type || ''),
    controller,
    timing:'PASSIVE_ENTRY',
    instructionIndex:0,
    waitingFor:null,
    locals:{},
    program:[],
    originalCommandId:commandId
  };
  state.effectStack.push(frame);
  openReactionPrompt(state, frame, options, 'PASSIVE_TARGET');
  ctx.events.push({
    type:RULE_EVENT_TYPES.CARD_TARGETED,
    sourceIid:source.iid,
    targetPlayerIndex:reactingPlayer,
    passiveEntry:true
  });
  return true;
}

function openReactionPrompt(state, frame, options, phase){
  const playerIndex = frame.controller === 0 ? 1 : 0;
  frame.waitingFor = 'REACTION';
  frame.reactionPhase = phase;
  state.pendingPrompt = {
    promptId:nextId(state, 'prompt'),
    type:PROMPT_TYPES.REACTION,
    playerIndex,
    sourceIid:frame.activeReactionSourceIid || frame.sourceIid,
    phase,
    options,
    choices:['DECLINE', 'NEGATE', 'SUPPRESS'],
    defaultChoice:'DECLINE'
  };
}

function openEffectFrame(state, source, controller, timing, commandId, ruleId = source.id){
  const rule = cardRule(ruleId, state);
  if(!rule?.program) return null;
  const frame = {
    frameId:nextId(state, 'frame'),
    kind:'CARD_EFFECT',
    sourceIid:source.iid,
    sourceCardId:String(ruleId),
    sourceType:String(source.type || ''),
    controller,
    timing,
    instructionIndex:0,
    waitingFor:null,
    locals:{},
    stateCardsPlacedLastTurn:cloneSerializable(state.cardsPlacedLastTurn),
    program:cloneSerializable(rule.program),
    originalCommandId:commandId
  };
  state.effectStack.push(frame);
  const reactions = activationReactionOptions(state, frame);
  if(reactions.length) openReactionPrompt(state, frame, reactions, 'ACTIVATION');
  return frame;
}

function recordSupporterEffectActivation(state, frame){
  if(!frame
    || frame.activationCounted === true
    || String(frame.sourceType || '') !== 'Supporter'){
    return;
  }
  state.supporterEffectsActivated[frame.controller] += 1;
  recordLandscapeSupporterEffect(state, {type:frame.sourceType}, frame.controller);
  frame.activationCounted = true;
}

function openInstructionPrompt(state, frame, instruction, ctx){
  const fizzleUnavailableWhenSet = function(){
    if(String(frame?.timing || '') !== 'WHEN_SET') return false;
    frame.instructionIndex = frame.program.length;
    return true;
  };
  if(instruction.kind === 'CHOOSE_OPTION'){
    const options = (instruction.options || []).map(option=>
      typeof option === 'object'
        ? {
            value:String(option.value),
            label:String(option.label || option.value),
            ...(Number.isInteger(option.nextInstructionIndex) ? {nextInstructionIndex:option.nextInstructionIndex} : {})
          }
        : {value:String(option), label:String(option)}
    ).filter(option=>
      instruction.landscapeChoices !== true
      || !landscapeChangeBlockReason(state, option.value)
    );
    if(!options.length){
      if(fizzleUnavailableWhenSet()) return false;
      throw Object.assign(new Error('modal choice has no options'), {code:'NO_LEGAL_CHOICES'});
    }
    const requestedDefault = String(instruction.defaultChoice || options[0].value);
    const defaultChoice = instruction.landscapeChoices === true
      && !options.some(option=>option.value === requestedDefault)
      ? String(options[0].value)
      : requestedDefault;
    if(!options.some(option=>option.value === defaultChoice)){
      throw Object.assign(new Error('modal default is not a legal option'), {code:'INVALID_PROMPT_DEFAULT'});
    }
    frame.waitingFor = 'MODAL_CHOICE';
    state.pendingPrompt = {
      promptId:nextId(state, 'prompt'),
      type:PROMPT_TYPES.MODAL_CHOICE,
      playerIndex:frame.controller,
      sourceIid:frame.sourceIid,
      options,
      local:instruction.local,
      cancellable:true,
      cancelBehavior:instruction.cancelBehavior || 'END_EFFECT',
      defaultChoice,
      timeoutPolicy:'DEFAULT'
    };
    return true;
  }
  if(instruction.kind === 'SELECT_CARDS' || instruction.kind === 'SELECT_HAND'){
    const filter = instruction.kind === 'SELECT_HAND'
      ? {...instruction.filter, locations:['hand']}
      : instruction.filter;
    const eligibleIids = eligibleCardTargets(state, frame, filter);
    const exactAvailableLimit = Number(instruction.exactUpToAvailable);
    const exactAvailable = Number.isInteger(exactAvailableLimit) && exactAvailableLimit >= 0
      ? Math.min(exactAvailableLimit, eligibleIids.length)
      : null;
    const min = exactAvailable === null
      ? Math.max(0, Number(instruction.min ?? (instruction.optional ? 0 : 1)) || 0)
      : exactAvailable;
    const max = exactAvailable === null
      ? (instruction.maxAvailable === true
        ? Math.max(min, eligibleIids.length)
        : Math.max(min, Number(instruction.max ?? 1) || 1))
      : exactAvailable;
    if(eligibleIids.length < min){
      if(fizzleUnavailableWhenSet()) return false;
      throw Object.assign(new Error('effect has too few legal card targets'), {code:'NO_LEGAL_TARGETS'});
    }
    if(!eligibleIids.length && min === 0){
      frame.locals[instruction.local] = max === 1 ? null : [];
      frame.instructionIndex = instruction.cancelBehavior === 'CONTINUE'
        ? frame.instructionIndex + 1
        : frame.program.length;
      return false;
    }
    frame.waitingFor = instruction.kind === 'SELECT_HAND' ? 'HAND_SELECTION' : 'CARD_SELECTION';
    state.pendingPrompt = {
      promptId:nextId(state, 'prompt'),
      type:instruction.kind === 'SELECT_HAND' ? PROMPT_TYPES.HAND_SELECTION : PROMPT_TYPES.CARD_SELECTION,
      playerIndex:frame.controller,
      sourceIid:frame.sourceIid,
      eligibleIids,
      eligibleCards:eligibleIids.map(iid=>{
        const card = findCard(state, iid)?.card;
        // These cards are already explicitly revealed as legal choices to
        // this prompt's owning player. Preserve their runtime state (notably
        // base/current Fate, counters, and statuses) so deck/discard/hand
        // pickers can render modified-card information consistently.
        return card ? cloneSerializable(card) : {iid};
      }),
      min,
      max,
      local:instruction.local,
      cancellable:true,
      cancelBehavior:instruction.cancelBehavior || 'END_EFFECT',
      timeoutPolicy:min === 0 ? 'CANCEL' : 'FIRST_ELIGIBLE'
    };
    if(instruction.title) state.pendingPrompt.title = String(instruction.title);
    if(instruction.prompt) state.pendingPrompt.prompt = String(instruction.prompt);
    return true;
  }
  if(instruction.kind === 'SELECT_BOARD'){
    const eligibleIids = eligibleBoardTargets(state, frame, instruction.filter);
    const min = Math.max(0, Number(instruction.min ?? (instruction.optional ? 0 : 1)) || 0);
    const max = Math.max(min, Number(instruction.max ?? 1) || 1);
    if(!eligibleIids.length && min === 0){
      frame.locals[instruction.local] = max === 1 ? null : [];
      frame.instructionIndex = instruction.cancelBehavior === 'CONTINUE'
        ? frame.instructionIndex + 1
        : frame.program.length;
      return false;
    }
    if(eligibleIids.length < min){
      if(fizzleUnavailableWhenSet()) return false;
      throw Object.assign(new Error('effect has too few legal board targets'), {code:'NO_LEGAL_TARGETS'});
    }
    frame.waitingFor = 'BOARD_TARGET';
    state.pendingPrompt = {
      promptId:nextId(state, 'prompt'),
      type:PROMPT_TYPES.BOARD_TARGET,
      playerIndex:frame.controller,
      sourceIid:frame.sourceIid,
      eligibleIids,
      min,
      max,
      local:instruction.local,
      cancellable:true,
      cancelBehavior:instruction.cancelBehavior || 'END_EFFECT',
      timeoutPolicy:min === 0 ? 'CANCEL' : 'FIRST_ELIGIBLE'
    };
    return true;
  }
  if(instruction.kind === 'SELECT_DESTINATION'){
    const eligible = eligibleDestinations(state, frame, instruction.filter);
    if(!eligible.length){
      if(fizzleUnavailableWhenSet()) return false;
      throw Object.assign(new Error('effect has no legal destinations'), {code:'NO_LEGAL_DESTINATIONS'});
    }
    frame.waitingFor = 'BOARD_DESTINATION';
    state.pendingPrompt = {
      promptId:nextId(state, 'prompt'),
      type:PROMPT_TYPES.BOARD_DESTINATION,
      playerIndex:frame.controller,
      sourceIid:frame.sourceIid,
      eligible,
      local:instruction.local,
      cancellable:true,
      cancelBehavior:instruction.cancelBehavior || 'END_EFFECT',
      timeoutPolicy:instruction.optional ? 'CANCEL' : 'FIRST_ELIGIBLE'
    };
    return true;
  }
  if(instruction.kind === 'SELECT_DESTINATIONS'){
    const eligible = eligibleDestinations(state, frame, instruction.filter);
    const min = Math.max(0, Number(instruction.min ?? (instruction.optional ? 0 : 1)) || 0);
    const max = Math.max(min, Number(instruction.max ?? 1) || 1);
    if(eligible.length < min){
      if(fizzleUnavailableWhenSet()) return false;
      throw Object.assign(new Error('effect has too few legal destinations'), {code:'NO_LEGAL_DESTINATIONS'});
    }
    frame.waitingFor = 'BOARD_DESTINATION';
    state.pendingPrompt = {
      promptId:nextId(state, 'prompt'),
      type:PROMPT_TYPES.BOARD_DESTINATION,
      playerIndex:frame.controller,
      sourceIid:frame.sourceIid,
      eligible,
      min,
      max,
      multi:true,
      local:instruction.local,
      cancellable:true,
      cancelBehavior:instruction.cancelBehavior || 'END_EFFECT',
      timeoutPolicy:min === 0 ? 'CANCEL' : 'FIRST_ELIGIBLE'
    };
    return true;
  }
  if(instruction.kind === 'SELECT_ZONE'){
    const zones = eligibleZones(state, frame, instruction.filter);
    if(!zones.length){
      if(fizzleUnavailableWhenSet()) return false;
      throw Object.assign(new Error('effect has no legal zones'), {code:'NO_LEGAL_ZONES'});
    }
    frame.waitingFor = 'ZONE_SELECTION';
    state.pendingPrompt = {
      promptId:nextId(state, 'prompt'),
      type:PROMPT_TYPES.ZONE_SELECTION,
      playerIndex:frame.controller,
      sourceIid:frame.sourceIid,
      eligibleZones:zones,
      local:instruction.local,
      cancellable:true,
      cancelBehavior:instruction.cancelBehavior || 'END_EFFECT',
      timeoutPolicy:instruction.optional ? 'CANCEL' : 'FIRST_ELIGIBLE'
    };
    return true;
  }
  return false;
}

function insertBerkeleyDiscardCost(state, frame, instruction, operation){
  let targetIids = [];
  if(operation.type === 'DISCARD_CARD' && operation.berkeleyCostPaid !== true){
    targetIids = operation.targetIid ? [String(operation.targetIid)] : [];
  }else if(operation.type === 'DISCARD_AND_GAIN_FATE'){
    const paid = new Set(
      Array.isArray(operation.berkeleyCostPaidIids)
        ? operation.berkeleyCostPaidIids.map(String)
        : []
    );
    targetIids = (Array.isArray(operation.targetIids) ? operation.targetIids : [])
      .map(String)
      .filter(iid=>!paid.has(iid));
  }
  const targetIid = targetIids.find(iid=>{
    const target = findCard(state, iid);
    return target?.zone === 'board'
      && String(target.card.id || '') === '62'
      && !isEffectSourceSuppressed(state, target)
      && controllerOf(target.card) !== Number(frame.controller);
  });
  if(!targetIid) return false;
  const local = `berkeleyDiscardCost${frame.instructionIndex}`;
  const replacementOperation = operation.type === 'DISCARD_CARD'
    ? {...operation, berkeleyCostPaid:true}
    : {
        ...operation,
        berkeleyCostPaidIids:[
          ...(Array.isArray(operation.berkeleyCostPaidIids) ? operation.berkeleyCostPaidIids : []),
          targetIid
        ]
      };
  frame.program.splice(
    frame.instructionIndex,
    1,
    {
      kind:'SELECT_HAND',
      local,
      min:2,
      max:2,
      filter:{playerIndex:'controller', targetable:'DISCARD_CARD'}
    },
    {
      kind:'OPERATION',
      operation:{
        type:'DISCARD_CARD',
        targetIids:`$${local}`,
        reason:'PEOPLES_PARK_COST',
        bypassReaction:true
      }
    },
    {...instruction, operation:replacementOperation}
  );
  return true;
}

function runEffectStack(state, ctx){
  while(state.effectStack.length && !state.pendingPrompt){
    const frame = state.effectStack[state.effectStack.length - 1];
    if(frame.waitingFor) return;
    const instruction = frame.program[frame.instructionIndex];
    if(!instruction){
      state.effectStack.pop();
      ctx.events.push({type:'EFFECT_RESOLVED', sourceIid:frame.sourceIid, frameId:frame.frameId});
      continue;
    }
    if(instruction.kind === 'COLLECT_BOARD'){
      frame.locals[instruction.local] = eligibleBoardTargets(state, frame, instruction.filter);
      frame.instructionIndex += 1;
      continue;
    }
    if(instruction.kind === 'FREE_SET'){
      const selectedIid = resolveValue(instruction.cardIid, frame);
      const destination = resolveValue(instruction.destination, frame);
      const selected = findCard(state, selectedIid);
      if(!selected || !['deck', 'discard', 'hand'].includes(selected.zone)){
        throw Object.assign(new Error('free-set card is no longer available'), {code:'CARD_NOT_AVAILABLE'});
      }
      const turnUseKey = String(instruction.turnUseKey || '');
      if(turnUseKey){
        const statusId = `turn-use:${turnUseKey.toLowerCase()}:p${frame.controller}`;
        const used = state.statuses.find(status=>
          status.statusId === statusId && Number(status.turn) === state.turn
        );
        if(used) throw Object.assign(new Error('the free-set effect was already used this turn'), {code:'USE_LIMIT_REACHED'});
        state.statuses = state.statuses.filter(status=>status.statusId !== statusId);
        state.statuses.push({
          statusId,
          type:'TURN_USE_COUNTER',
          ruleKey:turnUseKey,
          playerIndex:frame.controller,
          turn:state.turn
        });
      }
      if(selected.zone !== 'hand'){
        const pile = state.players[selected.playerIndex][selected.zone];
        const card = pile.splice(selected.index, 1)[0];
        state.players[frame.controller].hand.push(card);
        if(selected.zone === 'deck'){
          emitRuleEvent(ctx, {
            type:RULE_EVENT_TYPES.DECK_SEARCHED,
            playerIndex:frame.controller,
            count:1,
            sourceIid:frame.sourceIid,
            semanticSourceCardId:frame.sourceCardId || undefined
          });
        }
      }
      const result = applyOperation(ctx, {
        type:'SET_CARD',
        playerIndex:frame.controller,
        cardIid:selectedIid,
        destination,
        sourceIid:frame.sourceIid,
        sourceController:frame.controller,
        countTowardSupporterLimit:false
      });
      frame.instructionIndex += 1;
      const placed = findBoardCard(state, result.cardIid)?.card;
      if(placed && placed.faceDown !== true && startPassiveTargetReaction(state, ctx, placed, frame.controller, frame.originalCommandId)){
        continue;
      }
      if(placed && placed.faceDown !== true && startFieldEntryDeclaration(state, ctx, placed, frame.controller, frame.originalCommandId)){
        continue;
      }
      if(placed && placed.faceDown !== true && hasTiming(placed.id, 'WHEN_SET', state)){
        startEffect(state, ctx, placed, frame.controller, 'WHEN_SET', frame.originalCommandId);
      }
      continue;
    }
    if(instruction.kind === 'COPY_EFFECT'){
      const selectedIid = resolveValue(instruction.cardIid, frame);
      const selected = findCard(state, selectedIid)?.card;
      const source = findBoardCard(state, frame.sourceIid)?.card;
      const copiedRule = cardRule(selected?.id, state);
      if(!selected || !source || !copiedRule){
        throw Object.assign(new Error('copied effect is no longer available'), {code:'EFFECT_NOT_IMPLEMENTED'});
      }
      if(copiedRule.timings?.includes('PASSIVE')){
        source.counters.copiedPassiveId = String(selected.id);
      }else{
        source.counters.copiedEffectId = String(selected.id);
      }
      ctx.events.push({
        type:'CARD_EFFECT_COPIED',
        sourceIid:source.iid,
        copiedCardId:String(selected.id),
        copiedFromIid:selected.iid
      });
      frame.instructionIndex += 1;
      if(instruction.execute !== false && copiedRule.program){
        state.effectStack.push({
          frameId:nextId(state, 'frame'),
          kind:'COPIED_CARD_EFFECT',
          sourceIid:source.iid,
          sourceCardId:String(selected.id),
          sourceType:String(source.type || ''),
          controller:frame.controller,
          timing:'COPIED',
          instructionIndex:0,
          waitingFor:null,
          locals:{},
          program:cloneSerializable(copiedRule.program),
          originalCommandId:frame.originalCommandId
        });
      }
      continue;
    }
    if(instruction.kind === 'INHERIT_TRIGGERED_FATE'){
      const coordinatorIid = String(resolveValue(instruction.coordinatorIid, frame) || '');
      const coordinator = findBoardCard(state, coordinatorIid)?.card;
      if(!coordinator || !['15','bh02','bh08'].includes(String(coordinator.id || ''))){
        throw Object.assign(new Error('the selected Coordinator cannot provide triggered Fate history'), {code:'INVALID_TARGET'});
      }
      const amount = Math.max(0, Number(coordinator.counters?.triggeredFateHistoryTotal) || 0);
      if(amount > 0){
        applyResolvedEffectOperation(ctx, {
          type:'MODIFY_FATE',
          targetIid:frame.sourceIid,
          amount,
          sourceIid:frame.sourceIid,
          sourceController:frame.controller,
          reason:'IN_DEFENSE_OF_PACIFICA',
          bypassReaction:true
        }, frame);
      }
      const source = findBoardCard(state, frame.sourceIid)?.card;
      if(source){
        source.counters.bh23InheritedCoordinatorIid = coordinatorIid;
        source.counters.bh23InheritedFate = amount;
      }
      frame.instructionIndex += 1;
      continue;
    }
    if(instruction.kind === 'PROC_ZONE_CONDITIONAL_FATE_TRIGGERS'){
      const engineerEntry = findBoardCard(state, frame.sourceIid);
      const minimumTurn = Math.max(1, Number(instruction.minimumTurn) || 18);
      frame.instructionIndex += 1;
      if(!engineerEntry || Number(state.turn) < minimumTurn){
        ctx.events.push({type:'EFFECT_CONDITION_UNMET',sourceIid:frame.sourceIid,semanticSourceCardId:'bh25',reason:'TURN_BEFORE_18'});
        continue;
      }
      const eligibleIds = new Set(['15','46','86','95','100','bh02','bh08']);
      const sources = boardEntries(state).filter(entry=>
        entry.z === engineerEntry.z
        && String(entry.card.iid || '') !== String(frame.sourceIid || '')
        && eligibleIds.has(runtimeRuleId(entry.card))
        && entry.card.faceDown !== true
        && !isEffectSourceSuppressed(state, entry)
      );
      for(const entry of sources){
        const id = runtimeRuleId(entry.card);
        const owner = controllerOf(entry.card);
        ctx.events.push({
          type:'EFFECT_ACTIVATED',sourceIid:entry.card.iid,sourceController:owner,
          targetIid:entry.card.iid,overlayTargetIid:entry.card.iid,
          semanticSourceCardId:'bh25',triggeredCardId:id,triggeredByIid:frame.sourceIid,
          reason:'ENGINEERS_AMBITION_PROC',suppressActivationCinematic:true,
          presentationOnly:true,forceEffectOverlay:true
        });
        ctx.events.push({
          type:'EFFECT_ACTIVATED',sourceIid:entry.card.iid,sourceController:owner,
          semanticSourceCardId:id,triggeredCardId:id,triggeredByIid:frame.sourceIid,
          reason:'ENGINEERS_AMBITION_FORCED_PROC',suppressActivationCinematic:true,presentationOnly:true
          ,deferEffectOverlayMs:3500
        });
        const zoneTargets = boardEntries(state).filter(target=>
          target.z === engineerEntry.z
          && controllerOf(target.card) === owner
          && target.card.faceDown !== true
          && !isEffectImmutable(target.card)
        );
        if(['15','bh02','bh08'].includes(id)){
          const amount = id === 'bh08' ? 2 : 1;
          for(const target of zoneTargets){
            applyResolvedEffectOperation(ctx,{type:'MODIFY_FATE',targetIid:target.card.iid,amount,sourceIid:entry.card.iid,sourceController:owner,semanticSourceCardId:id,reason:'ENGINEERS_AMBITION_FORCED_PROC',bypassReaction:true,presentationDelayMs:3500},frame);
          }
        }else if(id === '86'){
          applyResolvedEffectOperation(ctx,{type:'DRAW_CARD',playerIndex:owner,count:1,activatedEffect:true,sourceIid:entry.card.iid,sourceController:owner,semanticSourceCardId:id,reason:'ENGINEERS_AMBITION_FORCED_PROC'},frame);
          applyResolvedEffectOperation(ctx,{type:'MODIFY_FATE',targetIid:entry.card.iid,amount:2,sourceIid:entry.card.iid,sourceController:owner,semanticSourceCardId:id,reason:'ENGINEERS_AMBITION_FORCED_PROC',bypassReaction:true,presentationDelayMs:3500},frame);
        }else{
          const amount = id === '46' ? 2 : id === '95' ? 1 : 2;
          applyResolvedEffectOperation(ctx,{type:'MODIFY_FATE',targetIid:entry.card.iid,amount,sourceIid:entry.card.iid,sourceController:owner,semanticSourceCardId:id,reason:'ENGINEERS_AMBITION_FORCED_PROC',bypassReaction:true,presentationDelayMs:3500},frame);
          if(id === '100'){
            const hasFamily = boardEntries(state).some(target=>controllerOf(target.card)===owner && /Felicyta|Květka/.test(String(target.card.name || '')));
            if(hasFamily) applyResolvedEffectOperation(ctx,{type:'MODIFY_FATE',targetIid:entry.card.iid,amount:3,sourceIid:entry.card.iid,sourceController:owner,semanticSourceCardId:id,reason:'ENGINEERS_AMBITION_FAMILY_BONUS',bypassReaction:true,presentationDelayMs:3500},frame);
          }
        }
        if(!entry.card.counters || typeof entry.card.counters !== 'object') entry.card.counters = {};
        entry.card.counters.alpineEngineerProcCount = Math.max(0,Number(entry.card.counters.alpineEngineerProcCount)||0)+1;
      }
      const engineer = findBoardCard(state,frame.sourceIid)?.card;
      if(engineer){
        if(!engineer.counters || typeof engineer.counters !== 'object') engineer.counters = {};
        engineer.counters.alpineEngineerTriggeredIids = sources.map(entry=>String(entry.card.iid || ''));
      }
      continue;
    }
    if(instruction.kind === 'COMPLETE_END_TURN'){
      const endingPlayer = Number(resolveValue(instruction.playerIndex, frame));
      frame.instructionIndex += 1;
      completeEndTurn(state, ctx, endingPlayer);
      continue;
    }
    if(instruction.kind === 'FINALIZE_END_TURN'){
      const endingPlayer = Number(resolveValue(instruction.playerIndex, frame));
      frame.instructionIndex += 1;
      completeEndTurn(state, ctx, endingPlayer);
      continue;
    }
    if(instruction.kind === 'OPTIONAL_OPERATION'){
      const requiredLocal = String(instruction.requiredLocal || '');
      if(frame.locals[requiredLocal]){
        const operation = resolveOperation(instruction.operation, frame);
        if(insertBerkeleyDiscardCost(state, frame, instruction, operation)) continue;
        applyResolvedEffectOperation(ctx, operation, frame);
      }
      frame.instructionIndex += 1;
      continue;
    }
    if(instruction.kind === 'COMPLETE_LANDSCAPE_THRESHOLD'){
      frame.instructionIndex += 1;
      completeBattleOfPellaThreshold(state, frame, Number(instruction.threshold));
      continue;
    }
    const instructionIndex = frame.instructionIndex;
    if(openInstructionPrompt(state, frame, instruction, ctx)) return;
    if(frame.instructionIndex !== instructionIndex) continue;
    if(instruction.kind !== 'OPERATION'){
      throw Object.assign(new Error(`unsupported effect instruction ${instruction.kind}`), {code:'UNSUPPORTED_INSTRUCTION'});
    }
    const operation = resolveOperation(instruction.operation, frame);
    if(insertBerkeleyDiscardCost(state, frame, instruction, operation)) continue;
    if(instruction.targeted && !operation.bypassReaction){
      const reactions = targetReactionOptions(state, frame, operation);
      if(reactions.length){
        frame.pendingOperation = operation;
        frame.activeReactionSourceIid = operation.sourceIid || frame.sourceIid;
        openReactionPrompt(state, frame, reactions, 'TARGET');
        ctx.events.push({
          type:RULE_EVENT_TYPES.CARD_TARGETED,
          sourceIid:frame.sourceIid,
          targetIid:operation.targetIid || operation.cardIid
        });
        return;
      }
    }
    applyResolvedEffectOperation(ctx, operation, frame);
    frame.instructionIndex += 1;
  }
}

function completeEndTurn(state, ctx, actorIndex){
  for(const targetIid of expireCaliforniqueHandCards(state, actorIndex)){
    applyOperation(ctx, {
      type:'DISCARD_CARD',
      targetIid,
      sourceIid:'landscape:igb19',
      sourceController:actorIndex,
      reason:'LANDSCAPE_IGB19_HAND_EXPIRY'
    });
  }
  resolveMoraleSupporterExpiry(state, ctx, actorIndex);
  resolveMoralePressureCycle(ctx);
  resolveMoraleLowHandDiscard(state, ctx, actorIndex);
  const moraleEnabled = moralePressureEnabled(state);
  const moraleDepleted = moraleEnabled
    && state.moralePressure?.morale?.some(value=>Number(value || 0) <= 0);
  if(moraleDepleted || state.turn >= state.maxTurns){
    state.outcome = moraleEnabled ? calculateMoraleOutcome(state) : calculateOutcome(state);
    state.phase = 'ended';
    state.players.forEach((player, index)=>{
      player.score = Number(state.outcome.totalFate?.[index] || 0);
    });
    ctx.events.push({type:RULE_EVENT_TYPES.MATCH_ENDED, outcome:cloneSerializable(state.outcome)});
    return;
  }
  expireOwnerTurnStatuses(state, actorIndex, ctx);
  expireTimedPlayerStatuses(state, actorIndex, ctx);
  state.cardsPlacedLastTurn[actorIndex] = state.cardsPlacedThisTurn[actorIndex];
  state.cardsPlacedThisTurn[actorIndex] = 0;
  state.activePlayer = actorIndex === 0 ? 1 : 0;
  state.turn += 1;
  if(state.landscapeId === 'igb24'
    && state.turn >= 20
    && state.landscapeState.resolvedTurns.igb24 !== true){
    state.landscapeState.resolvedTurns.igb24 = true;
    const affectedIids = [];
    for(const entry of boardEntries(state)){
      if(effectiveCardType(state, entry.card) !== 'Supporter' || entry.card.counters?.igb24DawnFateGranted === true) continue;
      const enteredTurn = Number(entry.card.counters?.fieldEnteredTurn);
      if(!Number.isFinite(enteredTurn) || state.turn - enteredTurn < 10) continue;
      applyOperation(ctx, {
        type:'MODIFY_FATE', targetIid:entry.card.iid, amount:6,
        sourceIid:'landscape:igb24', sourceController:controllerOf(entry.card),
        reason:'LANDSCAPE_IGB24_DAWN', bypassTargeting:true
      });
      entry.card.counters.igb24DawnFateGranted = true;
      if(!entry.card.statuses.includes('IMMUNE_TO_OPPONENT_EFFECTS')) entry.card.statuses.push('IMMUNE_TO_OPPONENT_EFFECTS');
      affectedIids.push(String(entry.card.iid));
    }
    ctx.events.push({type:'LANDSCAPE_RESOLVED',landscapeId:'igb24',turn:state.turn,affectedIids,amount:6,grantedStatus:'IMMUNE_TO_OPPONENT_EFFECTS'});
  }
  state.supportersSetThisTurn[state.activePlayer] = 0;
  state.supportersSetForCapThisTurn = [0, 0];
  state.extraSupportersThisTurn[state.activePlayer] = 0;
  resetMoraleTurnCounters(state, state.activePlayer);
  resetLandscapeTurnCounters(state, state.activePlayer);
  processTurnStartMechanics(state, state.activePlayer, ctx);
  emitRuleEvent(ctx, {type:RULE_EVENT_TYPES.TURN_STARTED, playerIndex:state.activePlayer, turn:state.turn});
  const landscapeDrawSkipped = shouldSkipLandscapeDraw(state, state.activePlayer);
  const moraleDrawSkipped = shouldSkipMoraleDraw(state, state.activePlayer);
  const drawSkipped = landscapeDrawSkipped || moraleDrawSkipped;
  if(drawSkipped){
    ctx.events.push({
      type:'DRAW_PHASE_SKIPPED',
      playerIndex:state.activePlayer,
      turn:state.turn,
      reason:landscapeDrawSkipped ? 'LANDSCAPE_IGB13_ALTERNATING_SKIP' : 'MORALE_60_ALTERNATING_DRAW'
    });
  }else{
    applyOperation(ctx, {type:'DRAW_CARD', playerIndex:state.activePlayer, count:1, activatedEffect:false});
  }
  emitRuleEvent(ctx, {
    type:RULE_EVENT_TYPES.DRAW_PHASE_COMPLETED,
    playerIndex:state.activePlayer,
    turn:state.turn
  });
  openMoraleThresholdDiscardFrame(state, ctx);
}

function openBh18EndTurnFrame(state, ctx, actorIndex, commandId){
  if(!state.players[actorIndex]?.deck?.length) return false;
  const controller = actorIndex === 0 ? 1 : 0;
  const sources = boardEntries(state).filter(entry=>
    controllerOf(entry.card) === controller
    && entry.card.faceDown !== true
    && runtimeRuleId(entry.card) === 'bh18'
    && !isEffectSourceSuppressed(state, entry)
  );
  if(!sources.length) return false;
  const program = sources.map(source=>({
    kind:'OPERATION',
    targeted:true,
    operation:{
      type:'RANDOM_DISCARD_DECK',
      playerIndex:actorIndex,
      targetPlayerIndex:actorIndex,
      sourceIid:source.card.iid,
      semanticSourceCardId:'bh18',
      sourceController:controller,
      reason:'GENESIS_OF_ALL_INCELDOM'
    }
  }));
  program.push({kind:'FINALIZE_END_TURN', playerIndex:actorIndex});
  state.effectStack.push({
    frameId:nextId(state, 'frame'),
    kind:'PASSIVE_END_TURN_EFFECT',
    sourceIid:sources[0].card.iid,
    sourceCardId:'bh18',
    sourceType:String(sources[0].card.type || 'Improvisor'),
    controller,
    timing:'TURN_ENDING',
    instructionIndex:0,
    waitingFor:null,
    locals:{},
    program,
    originalCommandId:commandId
  });
  runEffectStack(state, ctx);
  return true;
}

function resolveMoraleLowHandDiscard(state, ctx, playerIndex){
  if(!moralePressureEnabled(state) || !state?.moralePressure) return null;
  const player = Number(playerIndex);
  const morale = Math.max(0, Number(state.moralePressure.morale?.[player] || 0));
  if(morale <= 0 || !moralePenaltyActive(state, player, MORALE_PENALTY_THRESHOLDS.randomHandDiscard)) return null;
  if(!state.players?.[player]?.hand?.length) return null;
  const discarded = applyOperation(ctx, {
    type:'RANDOM_DISCARD_HAND',
    playerIndex:player,
    sourceIid:'morale:40',
    semanticSourceCardId:'MORALE_THRESHOLD_40',
    sourceController:player,
    reason:'MORALE_40_RANDOM_HAND_DISCARD',
    revealDiscard:true
  });
  if(!discarded?.discardedIid) return null;
  const event = {
    type:'MORALE_40_HAND_DISCARDED',
    playerIndex:player,
    cardIid:String(discarded.discardedIid),
    cardId:String(discarded.cardId || ''),
    cardName:String(discarded.cardName || 'Card'),
    threshold:40,
    reason:'MORALE_40_RANDOM_HAND_DISCARD'
  };
  ctx.events.push(event);
  return event;
}

function resolveMoraleSupporterExpiry(state, ctx, playerIndex){
  if(!state?.moralePressure) return [];
  const active = moralePenaltyActive(state, playerIndex, MORALE_PENALTY_THRESHOLDS.supporterExpiry);
  const owned = boardEntries(state).filter(entry=>
    controllerOf(entry.card) === Number(playerIndex)
    && effectiveCardType(state, entry.card) === 'Supporter'
  );
  const expired = [];
  for(const entry of owned){
    if(!entry.card.counters || typeof entry.card.counters !== 'object') entry.card.counters = {};
    if(isEffectImmutable(entry.card)){
      delete entry.card.counters.moraleSupporterExpiryTurns;
      delete entry.card.counters.moraleSupporterExpiryStartedTurn;
      continue;
    }
    if(!active){
      delete entry.card.counters.moraleSupporterExpiryTurns;
      delete entry.card.counters.moraleSupporterExpiryStartedTurn;
      continue;
    }
    if(!Number.isFinite(Number(entry.card.counters.moraleSupporterExpiryStartedTurn))){
      entry.card.counters.moraleSupporterExpiryStartedTurn = Number(state.turn);
      entry.card.counters.moraleSupporterExpiryTurns = 1;
      continue;
    }
    entry.card.counters.moraleSupporterExpiryTurns = Math.max(0, Number(entry.card.counters.moraleSupporterExpiryTurns || 0)) + 1;
    if(entry.card.counters.moraleSupporterExpiryTurns < 2) continue;
    expired.push(String(entry.card.iid));
  }
  for(const targetIid of expired){
    const card = findBoardCard(state, targetIid)?.card;
    if(!card) continue;
    const cardName = String(card.name || 'Supporter');
    delete card.counters.moraleSupporterExpiryTurns;
    delete card.counters.moraleSupporterExpiryStartedTurn;
    applyOperation(ctx, {
      type:'DISCARD_CARD',
      targetIid,
      sourceIid:'morale:20',
      sourceController:playerIndex,
      bypassTargeting:true,
      bypassReaction:true,
      reason:'MORALE_20_SUPPORTER_EXPIRY'
    });
    ctx.events.push({
      type:'MORALE_SUPPORTER_EXPIRED',
      playerIndex:Number(playerIndex),
      cardIid:targetIid,
      cardName,
      threshold:20
    });
  }
  return expired;
}

function openMoraleThresholdDiscardFrame(state, ctx){
  const queue = state?.moralePressure?.pendingThresholdDiscards;
  if(!Array.isArray(queue) || !queue.length) return false;
  while(queue.length){
    const pending = queue.shift();
    const targetPlayerIndex = Number(pending?.targetPlayerIndex);
    const chooserPlayerIndex = Number(pending?.chooserPlayerIndex);
    if((targetPlayerIndex !== 0 && targetPlayerIndex !== 1)
      || (chooserPlayerIndex !== 0 && chooserPlayerIndex !== 1)) continue;
    if(!boardEntries(state).some(entry=>controllerOf(entry.card) === targetPlayerIndex)) continue;
    const sourceIid = `morale-threshold-50:p${targetPlayerIndex}:t${Number(pending.turn || state.turn)}`;
    state.effectStack.push({
      frameId:nextId(state, 'frame'),
      kind:'SYSTEM_EFFECT',
      sourceIid,
      sourceCardId:'MORALE_THRESHOLD_50',
      sourceType:'SYSTEM',
      controller:chooserPlayerIndex,
      timing:'MORALE_THRESHOLD',
      instructionIndex:0,
      waitingFor:null,
      locals:{},
      program:[
        {
          kind:'SELECT_BOARD',
          local:'moraleThresholdTarget',
          min:1,
          max:1,
          filter:{opponent:true},
          title:'Morale Broken — Choose a Card',
          prompt:'Your opponent fell to 50 Morale. Choose any card on their field to discard.'
        },
        {
          kind:'OPERATION',
          operation:{
            type:'DISCARD_CARD',
            targetIid:'$moraleThresholdTarget',
            sourceIid,
            sourceController:chooserPlayerIndex,
            reason:'MORALE_50_THRESHOLD',
            bypassTargeting:true,
            bypassReaction:true
          }
        }
      ],
      originalCommandId:null
    });
    ctx.events.push({
      type:'MORALE_THRESHOLD_CHOICE_OPENED',
      playerIndex:chooserPlayerIndex,
      targetPlayerIndex,
      threshold:50
    });
    return true;
  }
  return false;
}

function openTimedLandscapeEndTurnFrame(state, ctx, actorIndex, commandId){
  const landscapeId = String(state.landscapeId || '');
  let winner = null;
  let program = null;
  if(landscapeId === 'igb2'
    && state.turn >= 14
    && state.landscapeState.resolvedTurns.igb2 !== true){
    state.landscapeState.resolvedTurns.igb2 = true;
    const [p0, p1] = state.landscapeState.consolidations;
    if(p0 !== p1){
      winner = p0 > p1 ? 0 : 1;
      program = [
        {kind:'SELECT_ZONE', local:'zone'},
        {
          kind:'OPERATION',
          operation:{
            type:'CREATE_MATCH_STATUS',
            status:{
              statusId:`landscape:igb2:reward:p${winner}`,
              type:'ZONE_FATE_MODIFIER',
              zone:'$zone',
              playerIndex:winner,
              value:16,
              sourceIid:'landscape:igb2',
              reason:'LANDSCAPE_IGB2_RESOLUTION'
            }
          }
        },
        {kind:'COMPLETE_END_TURN', playerIndex:actorIndex}
      ];
    }else{
      ctx.events.push({type:'LANDSCAPE_RESOLVED', landscapeId, turn:state.turn, tied:true});
    }
  }
  if(landscapeId === 'igb8'
    && state.turn >= 10
    && state.landscapeState.resolvedTurns.igb8 !== true){
    state.landscapeState.resolvedTurns.igb8 = true;
    const targetZone = Number(state.landscapeState.targetZone);
    const scores = [zoneScore(state, targetZone, 0), zoneScore(state, targetZone, 1)];
    if(scores[0] !== scores[1]){
      winner = scores[0] > scores[1] ? 0 : 1;
      program = [
        {kind:'SELECT_ZONE', local:'zone'},
        {
          kind:'OPERATION',
          operation:{
            type:'ADD_SAFE_ROW',
            playerIndex:winner,
            zone:'$zone',
            sourceIid:'landscape:igb8'
          }
        },
        {kind:'COMPLETE_END_TURN', playerIndex:actorIndex}
      ];
    }else{
      ctx.events.push({
        type:'LANDSCAPE_RESOLVED',
        landscapeId,
        turn:state.turn,
        targetZone,
        scores,
        tied:true
      });
    }
  }
  if(!program) return false;
  const frame = {
    frameId:nextId(state, 'frame'),
    kind:'LANDSCAPE_END_TURN',
    sourceIid:`landscape:${landscapeId}`,
    sourceCardId:landscapeId,
    sourceType:'Landscape',
    controller:winner,
    timing:'TURN_ENDING',
    instructionIndex:0,
    waitingFor:null,
    locals:{},
    program,
    originalCommandId:commandId
  };
  state.effectStack.push(frame);
  ctx.events.push({
    type:'LANDSCAPE_RESOLUTION_STARTED',
    landscapeId,
    playerIndex:winner,
    turn:state.turn
  });
  runEffectStack(state, ctx);
  return true;
}

function startEffect(state, ctx, source, controller, timing, commandId, ruleId = source.id){
  const rule = cardRule(ruleId, state);
  const sourceEntry = findBoardCard(state, source.iid);
  if(sourceEntry && isEffectSourceSuppressed(state, sourceEntry)){
    ctx.events.push({
      type:'EFFECT_SKIPPED',
      sourceIid:source.iid,
      playerIndex:controller,
      timing,
      reason:'EFFECT_SUPPRESSED'
    });
    return;
  }
  if(timing === 'WHEN_SET' && rule?.whenSetTurnUseKey){
    const statusId = `turn-use:${String(rule.whenSetTurnUseKey).toLowerCase()}:p${controller}`;
    if(state.statuses.some(status=>status.statusId === statusId && Number(status.turn) === state.turn)){
      ctx.events.push({
        type:'EFFECT_SKIPPED',
        sourceIid:source.iid,
        playerIndex:controller,
        reason:'TURN_USE_LIMIT_REACHED'
      });
      return;
    }
  }
  if(Number.isInteger(Number(rule?.minimumTurn)) && state.turn < Number(rule.minimumTurn)){
    ctx.events.push({
      type:'EFFECT_SKIPPED',
      sourceIid:source.iid,
      playerIndex:controller,
      reason:'MINIMUM_TURN_NOT_REACHED',
      minimumTurn:Number(rule.minimumTurn)
    });
    return;
  }
  if(rule?.sharedUseLimit
    && sharedEffectUses(state, rule, controller) >= Number(rule.sharedUseLimit.maxUses || 0)){
    ctx.events.push({
      type:'EFFECT_SKIPPED',
      sourceIid:source.iid,
      playerIndex:controller,
      reason:'USE_LIMIT_REACHED'
    });
    return;
  }
  if(String(timing) === 'WHEN_SET' && !openingProgramChoiceAvailable(state, {
    sourceIid:source.iid,
    controller,
    instructionIndex:0,
    locals:{},
    program:rule?.program || []
  }, rule?.program || [])){
    ctx.events.push({
      type:'EFFECT_SKIPPED',
      sourceIid:source.iid,
      playerIndex:controller,
      reason:'NO_LEGAL_TARGETS'
    });
    return;
  }
  const frame = openEffectFrame(state, source, controller, timing, commandId, ruleId);
  if(frame && timing !== 'ACTIVATE'){
    ctx.events.push({
      type:RULE_EVENT_TYPES.EFFECT_ACTIVATED,
      sourceIid:source.iid,
      playerIndex:controller,
      timing
    });
    recordMoralePressureRuleEvent(ctx, ctx.events[ctx.events.length - 1]);
  }
  if(frame && !state.pendingPrompt){
    recordSupporterEffectActivation(state, frame);
    runEffectStack(state, ctx);
  }
}

function startAutomaticActivation(state, ctx, source, controller, commandId){
  const rule = cardRule(source?.id, state);
  if(!source || !rule?.program) return false;
  // Player-timed effects must never be consumed merely because a card was
  // consolidated or flipped face up. Christopher Erbs is armed only by an
  // explicit ACTIVATE_EFFECT command carrying userActivated=true.
  if(rule.manualOnly === true) return false;
  if(isEffectSourceSuppressed(state, findBoardCard(state, source.iid) || source)) return false;
  if(rule.maxUses && effectUses(source) >= Number(rule.maxUses)) return false;
  if(rule.oncePerTurn && Number(source.counters?.lastEffectTurn) === state.turn) return false;
  if(rule.blockedWhileStatus && source.statuses?.includes(rule.blockedWhileStatus)) return false;
  if(rule.sharedUseLimit
    && sharedEffectUses(state, rule, controller) >= Number(rule.sharedUseLimit.maxUses || 0)) return false;
  if(!openingProgramChoiceAvailable(state, {
    sourceIid:source.iid,
    controller,
    instructionIndex:0,
    locals:{},
    program:rule.program
  }, rule.program)){
    ctx.events.push({
      type:'EFFECT_SKIPPED',
      sourceIid:source.iid,
      playerIndex:controller,
      timing:'ACTIVATE',
      reason:'NO_LEGAL_TARGETS'
    });
    return false;
  }
  consumeEffectUse(source);
  if(rule.oncePerTurn) source.counters.lastEffectTurn = state.turn;
  ctx.events.push({
    type:RULE_EVENT_TYPES.EFFECT_ACTIVATED,
    sourceIid:source.iid,
    playerIndex:controller,
    timing:'ACTIVATE'
  });
  recordMoralePressureRuleEvent(ctx, ctx.events[ctx.events.length - 1]);
  startEffect(state, ctx, source, controller, 'ACTIVATE', commandId);
  return true;
}

function assertActivePlayer(state, actorIndex){
  if(state.activePlayer !== actorIndex){
    throw Object.assign(new Error('command actor is not the active player'), {code:'NOT_ACTIVE_PLAYER'});
  }
}

function findReactionOption(prompt, reactionIid){
  return (prompt.options || []).find(option=>String(option.reactionIid) === String(reactionIid)) || null;
}

function addSuppression(state, sourceIid){
  const source = findCard(state, sourceIid)?.card;
  if(!source) return;
  if(!Array.isArray(source.statuses)) source.statuses = [];
  if(!source.statuses.includes('EFFECTS_SUPPRESSED')) source.statuses.push('EFFECTS_SUPPRESSED');
  source.statuses.sort();
}

function resolveReaction(state, ctx, frame, prompt, payload){
  const choice = String(payload.choice || 'DECLINE').toUpperCase();
  if(choice === 'DECLINE'){
    state.pendingPrompt = null;
    frame.waitingFor = null;
    if(frame.reactionPhase === 'TARGET'){
      const operation = cloneSerializable(frame.pendingOperation);
      delete frame.pendingOperation;
      delete frame.activeReactionSourceIid;
      delete frame.reactionPhase;
      applyOperation(ctx, operation);
      frame.instructionIndex += 1;
    }else{
      if(frame.reactionPhase === 'ACTIVATION'){
        recordSupporterEffectActivation(state, frame);
      }
      delete frame.reactionPhase;
    }
    runEffectStack(state, ctx);
    return;
  }
  if(choice !== 'NEGATE' && choice !== 'SUPPRESS'){
    throw Object.assign(new Error('reaction choice is invalid'), {code:'INVALID_CHOICE'});
  }
  const option = findReactionOption(prompt, payload.reactionIid);
  if(!option || !option.modes.includes(choice)){
    throw Object.assign(new Error('reaction card or mode is not eligible'), {code:'INVALID_REACTION'});
  }
  const reactionEntry = findCard(state, option.reactionIid);
  if(!reactionEntry) throw Object.assign(new Error('reaction card no longer exists'), {code:'REACTION_NOT_FOUND'});
  if(option.kind !== 'HAVANO') consumeReaction(reactionEntry.card);
  // Lydia has one clear response: negate this resolution and permanently
  // suppress its source. Havano retains its distinct negate/suppress choice.
  const reactedSourceIid = frame.activeReactionSourceIid || frame.sourceIid;
  if(choice === 'SUPPRESS' || option.kind === 'LYDIA' || frame.reactionPhase === 'PASSIVE_TARGET') addSuppression(state, reactedSourceIid);
  emitRuleEvent(ctx, {
    type:RULE_EVENT_TYPES.EFFECT_REACTED,
    sourceIid:reactedSourceIid,
    reactionIid:reactionEntry.card.iid,
    playerIndex:controllerOf(reactionEntry.card),
    reactionKind:option.kind,
    mode:choice
  });
  state.pendingPrompt = null;
  if(option.kind === 'HAVANO'){
    frame.havanoReactionPhase = frame.reactionPhase;
    frame.pendingOperation = null;
    frame.havanoIid = reactionEntry.card.iid;
    frame.waitingFor = 'HAVANO_DESTINATION';
    frame.reactionPhase = null;
    const eligible = eligibleDestinations(state, {...frame, controller:prompt.playerIndex}, {ownSide:true, open:true});
    if(!eligible.length) throw Object.assign(new Error('Havano has no legal destination'), {code:'NO_LEGAL_DESTINATIONS'});
    state.pendingPrompt = {
      promptId:nextId(state, 'prompt'),
      type:PROMPT_TYPES.BOARD_DESTINATION,
      playerIndex:prompt.playerIndex,
      sourceIid:frame.sourceIid,
      reactionIid:reactionEntry.card.iid,
      context:'HAVANO_SET',
      eligible,
      cancellable:false,
      timeoutPolicy:'FIRST_ELIGIBLE'
    };
    return;
  }
  state.effectStack.pop();
  runEffectStack(state, ctx);
}

function resolvePrompt(state, ctx, actorIndex, payload){
  const prompt = state.pendingPrompt;
  if(!prompt) throw Object.assign(new Error('there is no pending prompt'), {code:'NO_PENDING_PROMPT'});
  if(String(payload.promptId || '') !== String(prompt.promptId)){
    throw Object.assign(new Error('promptId does not match the active prompt'), {code:'PROMPT_MISMATCH'});
  }
  if(Number(prompt.playerIndex) !== actorIndex){
    throw Object.assign(new Error('only the prompt owner may answer it'), {code:'PROMPT_NOT_OWNED'});
  }
  const frame = state.effectStack[state.effectStack.length - 1];
  if(!frame) throw Object.assign(new Error('prompt continuation frame is missing'), {code:'MISSING_EFFECT_FRAME'});
  if(prompt.type === PROMPT_TYPES.REACTION){
    resolveReaction(state, ctx, frame, prompt, payload);
    return;
  }
  const cancelRequested = payload.cancel === true
    || (payload.selectedIid === '' && payload.selectedIids === undefined)
    || (Array.isArray(payload.selectedIids) && payload.selectedIids.length === 0);
  if(cancelRequested){
    if(!prompt.cancellable) throw Object.assign(new Error('this prompt cannot be cancelled'), {code:'PROMPT_NOT_CANCELLABLE'});
    frame.locals[prompt.local || frame.program[frame.instructionIndex]?.local] = null;
    state.pendingPrompt = null;
    frame.waitingFor = null;
    frame.instructionIndex = prompt.cancelBehavior === 'CONTINUE'
      ? frame.instructionIndex + 1
      : frame.program.length;
    ctx.events.push({type:'PROMPT_CANCELLED', promptId:prompt.promptId, sourceIid:frame.sourceIid});
    runEffectStack(state, ctx);
    return;
  }
  if(prompt.type === PROMPT_TYPES.MODAL_CHOICE){
    const choice = String(payload.choice || '');
    const option = prompt.options.find(item=>item.value === choice);
    if(!option) throw Object.assign(new Error('modal choice is not eligible'), {code:'INVALID_CHOICE'});
    frame.locals[prompt.local] = choice;
    frame.instructionIndex = Number.isInteger(option.nextInstructionIndex)
      ? option.nextInstructionIndex
      : frame.instructionIndex + 1;
    frame.waitingFor = null;
    state.pendingPrompt = null;
    ctx.events.push({type:'PROMPT_RESOLVED', promptId:prompt.promptId, choice});
    runEffectStack(state, ctx);
    return;
  }
  if([
    PROMPT_TYPES.BOARD_TARGET,
    PROMPT_TYPES.CARD_SELECTION,
    PROMPT_TYPES.HAND_SELECTION
  ].includes(prompt.type)){
    const selected = Array.isArray(payload.selectedIids)
      ? payload.selectedIids.map(String)
      : (String(payload.selectedIid || '') ? [String(payload.selectedIid)] : []);
    if(new Set(selected).size !== selected.length
      || selected.length < Number(prompt.min || 0)
      || selected.length > Number(prompt.max || 1)
      || selected.some(iid=>!prompt.eligibleIids.includes(iid))){
      throw Object.assign(new Error('selected cards are not eligible'), {code:'INVALID_CHOICE'});
    }
    frame.locals[prompt.local || frame.program[frame.instructionIndex]?.local] =
      Number(prompt.max || 1) === 1 ? (selected[0] || null) : selected;
    frame.instructionIndex += 1;
    frame.waitingFor = null;
    state.pendingPrompt = null;
    ctx.events.push({type:'PROMPT_RESOLVED', promptId:prompt.promptId, selectedIids:selected});
    runEffectStack(state, ctx);
    return;
  }
  if(prompt.type === PROMPT_TYPES.BOARD_DESTINATION){
    if(prompt.multi){
      const selected = Array.isArray(payload.destinations) ? payload.destinations : [];
      const keys = selected.map(destinationKey);
      const eligibleKeys = new Set(prompt.eligible.map(destinationKey));
      if(new Set(keys).size !== keys.length
        || selected.length < Number(prompt.min || 0)
        || selected.length > Number(prompt.max || 1)
        || keys.some(key=>!eligibleKeys.has(key))){
        throw Object.assign(new Error('selected destinations are not eligible'), {code:'INVALID_CHOICE'});
      }
      frame.locals[prompt.local] = cloneSerializable(selected);
      frame.instructionIndex += 1;
      frame.waitingFor = null;
      state.pendingPrompt = null;
      ctx.events.push({type:'PROMPT_RESOLVED', promptId:prompt.promptId, destinations:cloneSerializable(selected)});
      runEffectStack(state, ctx);
      return;
    }
    const selected = payload.destination;
    const eligibleKeys = new Set(prompt.eligible.map(destinationKey));
    if(!eligibleKeys.has(destinationKey(selected))){
      throw Object.assign(new Error('selected destination is not eligible'), {code:'INVALID_CHOICE'});
    }
    if(prompt.context === 'HAVANO_SET'){
      applyOperation(ctx, {
        type:'SET_CARD',
        playerIndex:actorIndex,
        cardIid:prompt.reactionIid,
        destination:cloneSerializable(selected),
        sourceIid:prompt.reactionIid,
        sourceController:actorIndex,
        reactionSet:true
      });
      if(frame.havanoReactionPhase === 'ACTIVATION' || frame.havanoReactionPhase === 'PASSIVE_TARGET'){
        frame.instructionIndex = frame.program.length;
      }else{
        frame.instructionIndex += 1;
      }
      delete frame.havanoIid;
      delete frame.havanoReactionPhase;
      delete frame.activeReactionSourceIid;
      frame.waitingFor = null;
      state.pendingPrompt = null;
      runEffectStack(state, ctx);
      return;
    }
    const instruction = frame.program[frame.instructionIndex];
    frame.locals[instruction.local] = cloneSerializable(selected);
    frame.instructionIndex += 1;
    frame.waitingFor = null;
    state.pendingPrompt = null;
    runEffectStack(state, ctx);
    return;
  }
  if(prompt.type === PROMPT_TYPES.ZONE_SELECTION){
    const zone = Number(payload.zone);
    if(!Number.isInteger(zone) || !prompt.eligibleZones.includes(zone)){
      throw Object.assign(new Error('selected zone is not eligible'), {code:'INVALID_CHOICE'});
    }
    frame.locals[prompt.local] = zone;
    frame.instructionIndex += 1;
    frame.waitingFor = null;
    state.pendingPrompt = null;
    ctx.events.push({type:'PROMPT_RESOLVED', promptId:prompt.promptId, zone});
    runEffectStack(state, ctx);
    return;
  }
  throw Object.assign(new Error(`unsupported prompt type ${prompt.type}`), {code:'UNSUPPORTED_PROMPT'});
}

function performCommand(state, ctx, command, actorIndex, options){
  const payload = command.payload || {};
  if(state.outcome) throw Object.assign(new Error('the match has ended'), {code:'MATCH_ENDED'});
  // Concession is always available, including while the coin winner is
  // choosing turn order or a mandatory prompt is open. Server-owned
  // disconnect forfeits must be able to terminate every active match state.
  if(command.type === 'CONCEDE'){
    if(state.warfrontMatch){
      // The first forfeit decides the competitive result permanently. The
      // remaining human may continue only to earn commendation statistics.
      if(!state.warfrontForfeit){
        const loser = state.aiTakeoverSeats?.[0] ?? actorIndex;
        state.warfrontForfeit = {winner:1-loser,loser,turn:state.turn};
      }
      if(actorIndex === state.warfrontForfeit.winner){
        state.outcome = {type:'WARFRONT_FORFEIT',...state.warfrontForfeit,commendationsEligible:false};
        state.phase = 'ended';
        state.pendingPrompt = null;
        state.pendingHandLimit = null;
        state.effectStack = [];
        return;
      }
      state.aiTakeoverSeats = [...new Set([...(state.aiTakeoverSeats || []), actorIndex])];
      ctx.events.push({type:'WARFRONT_AI_TAKEOVER',playerIndex:actorIndex});
      return;
    }
    state.outcome = {
      type:'CONCEDED',
      winner:actorIndex === 0 ? 1 : 0,
      loser:actorIndex,
      turn:state.turn
    };
    state.phase = 'ended';
    state.pendingPrompt = null;
    state.pendingHandLimit = null;
    state.effectStack = [];
    ctx.events.push({type:RULE_EVENT_TYPES.MATCH_ENDED, outcome:cloneSerializable(state.outcome)});
    return;
  }
  if(state.phase === 'coin'){
    if(command.type !== 'CHOOSE_TURN_ORDER'){
      throw Object.assign(new Error('the coin-flip winner must choose the turn order first'), {code:'TURN_ORDER_REQUIRED'});
    }
    if(Number(state.coinFlip?.winner) !== actorIndex){
      throw Object.assign(new Error('only the coin-flip winner may choose the turn order'), {code:'TURN_ORDER_NOT_OWNED'});
    }
    const goFirst = payload.goFirst === true;
    const startingPlayer = goFirst ? actorIndex : (actorIndex === 0 ? 1 : 0);
    state.coinFlip.choice = goFirst;
    state.coinFlip.startingPlayer = startingPlayer;
    if(state.moralePressure) state.moralePressure.startingPlayer = startingPlayer;
    state.activePlayer = startingPlayer;
    state.phase = 'main';
    processTurnStartMechanics(state, startingPlayer, ctx);
    ctx.events.push({
      type:'TURN_ORDER_CHOSEN',
      winner:actorIndex,
      goFirst,
      startingPlayer,
      face:state.coinFlip.face
    });
    return;
  }
  if(command.type === 'CHOOSE_TURN_ORDER'){
    throw Object.assign(new Error('turn order has already been chosen'), {code:'TURN_ORDER_ALREADY_CHOSEN'});
  }
  if(state.pendingHandLimit){
    if(command.type !== 'DISCARD_TO_HAND_LIMIT'){
      throw Object.assign(new Error('the hand limit must be resolved first'), {code:'HAND_LIMIT_REQUIRED'});
    }
    if(state.pendingHandLimit.playerIndex !== actorIndex){
      throw Object.assign(new Error('only the affected player may discard to the hand limit'), {code:'HAND_LIMIT_NOT_OWNED'});
    }
    const selected = payload.discardedIids.map(String);
    if(new Set(selected).size !== selected.length || selected.length < state.pendingHandLimit.required){
      throw Object.assign(new Error(`select at least ${state.pendingHandLimit.required} cards`), {code:'INVALID_HAND_LIMIT_SELECTION'});
    }
    const player = state.players[actorIndex];
    for(const iid of selected){
      const card = player.hand.find(item=>String(item.iid) === iid);
      if(!card || isProtectedHandLimitCard(card, actorIndex)){
        throw Object.assign(new Error('a selected hand-limit card is not discardable'), {code:'INVALID_HAND_LIMIT_SELECTION'});
      }
    }
    for(const iid of selected){
      const selectedCard = player.hand.find(item=>String(item.iid) === iid);
      applyOperation(ctx, {
        type:'DISCARD_CARD',
        targetIid:iid,
        sourceIid:iid,
        sourceController:controllerOf(selectedCard),
        reason:'HAND_LIMIT',
        // A mandatory game-rule discard is not a card effect. Cards that are
        // immune to effects remain discardable unless hand-limit rules protect
        // them explicitly (checked above and in legalCommandTemplates).
        bypassTargeting:true
      });
    }
    if(player.hand.length > activeHandLimit(state, actorIndex)){
      throw Object.assign(new Error('hand-limit discard did not return the hand to its active limit'), {code:'INVALID_HAND_LIMIT_SELECTION'});
    }
    state.pendingHandLimit = null;
    ctx.events.push({type:'HAND_LIMIT_RESOLVED', playerIndex:actorIndex, discardedIids:selected});
    return;
  }
  if(command.type === 'DISCARD_TO_HAND_LIMIT'){
    throw Object.assign(new Error('hand-limit discard is not required'), {code:'HAND_LIMIT_NOT_REQUIRED'});
  }
  if(state.pendingPrompt && command.type !== 'ANSWER_PROMPT'){
    throw Object.assign(new Error('the pending prompt must be answered first'), {code:'PROMPT_REQUIRED'});
  }
  if(!state.pendingPrompt && command.type === 'ANSWER_PROMPT'){
    throw Object.assign(new Error('there is no pending prompt'), {code:'NO_PENDING_PROMPT'});
  }
  if(command.type === 'ANSWER_PROMPT'){
    resolvePrompt(state, ctx, actorIndex, payload);
    return;
  }
  assertActivePlayer(state, actorIndex);
  if(command.type === 'ACTIVATE_LANDSCAPE'){
    if(!['igb16', 'igb17', 'igb21'].includes(state.landscapeId)){
      throw Object.assign(new Error('the active landscape has no direct v3 activation'), {code:'LANDSCAPE_ACTIVATION_NOT_AVAILABLE'});
    }
    if(state.landscapeId === 'igb21'){
      if(Number(state.landscapeState.oncePerGameUses[actorIndex] || 0) >= 1){
        throw Object.assign(new Error('Whiteboard Drawings can only be used once per game'), {code:'USE_LIMIT_REACHED'});
      }
      const cardIds = Array.isArray(payload.cardIds) ? payload.cardIds.map(String) : [];
      if(cardIds.length < 1 || cardIds.length > 4){
        throw Object.assign(new Error('Whiteboard Drawings requires between one and four cards'), {code:'INVALID_LANDSCAPE_SELECTION'});
      }
      const catalog = new Map((Array.isArray(state.cardCatalog) ? state.cardCatalog : []).map(card=>[String(card.id || ''), card]));
      const definitions = cardIds.map(id=>catalog.get(id));
      if(definitions.some(card=>!card || String(card.rarity || '').toLowerCase() === 'star')){
        throw Object.assign(new Error('Whiteboard Drawings can only add non-Star catalog cards'), {code:'INVALID_LANDSCAPE_SELECTION'});
      }
      const createdIids = [];
      for(const definition of definitions){
        state.instanceCounter += 1;
        const fate = Number(definition.fate || 0);
        const card = {
          iid:`${state.matchId}:p${actorIndex}:c${state.instanceCounter}`,
          id:String(definition.id), name:String(definition.name || definition.id), ability:String(definition.ability || ''),
          type:String(definition.type || 'Supporter'), affiliation:String(definition.affiliation || ''), rarity:String(definition.rarity || ''),
          baseFate:fate, currentFate:fate, cost:Number(definition.cost || 0), owner:actorIndex, controller:actorIndex,
          faceDown:false, statuses:[], counters:{igb21CatalogCreated:true}
        };
        state.players[actorIndex].hand.push(card);
        createdIids.push(card.iid);
      }
      state.landscapeState.oncePerGameUses[actorIndex] = 1;
      ctx.events.push({type:'LANDSCAPE_ACTIVATED', landscapeId:'igb21', playerIndex:actorIndex, cardIds, createdIids, privateTo:[actorIndex]});
      return;
    }
    if(state.landscapeId === 'igb17'){
      if(Number(state.landscapeState.oncePerGameUses[actorIndex] || 0) >= 1){
        throw Object.assign(new Error('Concrete Roads can only be used once per game'), {code:'USE_LIMIT_REACHED'});
      }
      const source = findBoardCard(state, payload.sourceIid);
      const copyableIds = new Set(['10', '11', '15', '19', '23', '34', '57', '77', 'bh02', 'bh07', 'bh08', 'bh11']);
      if(!source
        || controllerOf(source.card) !== actorIndex
        || String(source.card.counters?.bh14OriginalType || source.card.type || '') !== 'Coordinator'
        || source.card.faceDown === true
        || isEffectImmutable(source.card)
        || source.card.counters?.whisperLandscapeToken === true
        || !copyableIds.has(runtimeRuleId(source.card))){
        throw Object.assign(new Error('Concrete Roads requires a copyable controlled Coordinator'), {code:'INVALID_LANDSCAPE_SOURCE'});
      }
      const discardIids = Array.isArray(payload.discardIids) ? payload.discardIids.map(String) : [];
      if(discardIids.length !== 2 || new Set(discardIids).size !== 2){
        throw Object.assign(new Error('Concrete Roads requires exactly two hand discards'), {code:'INVALID_LANDSCAPE_COST'});
      }
      const costs = discardIids.map(iid=>findCard(state, iid));
      if(costs.some(entry=>!entry || entry.zone !== 'hand' || entry.playerIndex !== actorIndex)){
        throw Object.assign(new Error('Concrete Roads costs must be in the actor hand'), {code:'CARD_NOT_IN_HAND'});
      }
      const copiedId = runtimeRuleId(source.card);
      applyOperation(ctx, {
        type:'DISCARD_CARD',
        targetIid:source.card.iid,
        sourceIid:'landscape:igb17',
        sourceController:actorIndex,
        reason:'LANDSCAPE_IGB17_COORDINATOR_COST'
      });
      for(const cost of costs){
        applyOperation(ctx, {
          type:'DISCARD_CARD',
          targetIid:cost.card.iid,
          sourceIid:'landscape:igb17',
          sourceController:actorIndex,
          reason:'LANDSCAPE_IGB17_HAND_COST'
        });
      }
      state.instanceCounter += 1;
      const copiedRule = cardRule(copiedId, state);
      const token = {
        iid:`${state.matchId}:p${actorIndex}:c${state.instanceCounter}`,
        id:'whisper17',
        name:'Shizuku',
        ability:'Concrete Roads',
        type:'Coordinator',
        affiliation:'expanded_worlds',
        rarity:'star',
        baseFate:5,
        currentFate:5,
        cost:0,
        owner:actorIndex,
        controller:actorIndex,
        faceDown:false,
        statuses:[],
        counters:{
          whisperLandscapeToken:true,
          copiedSourceName:String(source.card.name || 'Coordinator'),
          createdTurn:state.turn,
          ...(copiedRule?.timings?.includes('PASSIVE') ? {copiedPassiveId:copiedId} : {}),
          ...(copiedRule?.timings?.some(timing=>timing !== 'PASSIVE') ? {copiedEffectId:copiedId} : {})
        }
      };
      state.players[actorIndex].hand.push(token);
      state.landscapeState.oncePerGameUses[actorIndex] = 1;
      ctx.events.push({
        type:'LANDSCAPE_ACTIVATED',
        landscapeId:'igb17',
        playerIndex:actorIndex,
        sourceIid:source.card.iid,
        discardedIids:discardIids,
        tokenIid:token.iid,
        copiedCardId:copiedId
      });
      return;
    }
    const discardIids = Array.isArray(payload.discardIids) ? payload.discardIids.map(String) : [];
    if(discardIids.length !== 1 || new Set(discardIids).size !== 1){
      throw Object.assign(new Error('Santa Anna requires exactly one hand discard'), {code:'INVALID_LANDSCAPE_COST'});
    }
    const discarded = findCard(state, discardIids[0]);
    if(!discarded || discarded.zone !== 'hand' || discarded.playerIndex !== actorIndex){
      throw Object.assign(new Error('the Santa Anna discard must be in the actor hand'), {code:'CARD_NOT_IN_HAND'});
    }
    const target = findBoardCard(state, payload.targetIid);
    if(!target || controllerOf(target.card) !== actorIndex || target.card.faceDown === true){
      throw Object.assign(new Error('Santa Anna must target a face-up card on the actor side'), {code:'INVALID_TARGET'});
    }
    applyOperation(ctx, {
      type:'DISCARD_CARD',
      targetIid:discarded.card.iid,
      sourceIid:'landscape:igb16',
      sourceController:actorIndex,
      reason:'LANDSCAPE_IGB16_COST'
    });
    applyOperation(ctx, {
      type:'MODIFY_FATE',
      targetIid:target.card.iid,
      amount:4,
      sourceIid:'landscape:igb16',
      sourceController:actorIndex,
      reason:'LANDSCAPE_IGB16_FATE_BONUS',
      bypassReaction:true
    });
    ctx.events.push({
      type:'LANDSCAPE_ACTIVATED',
      landscapeId:'igb16',
      playerIndex:actorIndex,
      discardedIid:discarded.card.iid,
      targetIid:target.card.iid
    });
    return;
  }
  if(command.type === 'SET_CARD'){
    const entry = findCard(state, payload.cardIid);
    if(!entry || entry.zone !== 'hand' || entry.playerIndex !== actorIndex){
      throw Object.assign(new Error('the selected card is not in the actor hand'), {code:'CARD_NOT_IN_HAND'});
    }
    const isPierogi = entry.card.counters?.pierogiCounter === true;
    const isWhisperToken = entry.card.counters?.whisperLandscapeToken === true;
    const defenseInDepthReady = String(entry.card.type || '') === 'Supporter'
      && state.statuses.some(status=>
        status?.type === 'NEXT_SUPPORTER_SET_EXEMPT'
        && Number(status.playerIndex) === actorIndex
        && Number(status.remaining || 0) > 0
      );
    if(!isPierogi
      && !isWhisperToken
      && (String(entry.card.type || '') !== 'Supporter' || Number(entry.card.cost || 0) !== 0)){
      throw Object.assign(new Error('this card requires the consolidation command family, which is not yet v3 eligible'), {code:'CONSOLIDATION_REQUIRED'});
    }
    if(!isPierogi && !isWhisperToken && Number(state.supportersSetForCapThisTurn?.[actorIndex] || 0) >= MAX_SUPPORTERS_SET_PER_TURN){
      throw Object.assign(new Error(`the ${MAX_SUPPORTERS_SET_PER_TURN}-Supporter hard cap has been reached`), {code:'SUPPORTER_HARD_CAP_REACHED'});
    }
    const normalSupporterAllowance = Math.min(
      MAX_SUPPORTERS_SET_PER_TURN,
      state.baseSupportersPerTurn + Number(state.extraSupportersThisTurn[actorIndex] || 0)
    );
    if(!isPierogi && !isWhisperToken && !defenseInDepthReady && state.supportersSetThisTurn[actorIndex] >= normalSupporterAllowance){
      throw Object.assign(new Error('the Supporter set limit has been reached'), {code:'SUPPORTER_SET_LIMIT_REACHED'});
    }
    const placementBlock = zoneActionBlock(state, actorIndex, payload.destination?.z);
    if(placementBlock){
      throw Object.assign(
        new Error('set actions are blocked in this zone for the turn'),
        {code:'ZONE_ACTION_BLOCKED', statusId:placementBlock.statusId}
      );
    }
    const destinationOwner = rowOwner(state, payload.destination?.z, payload.destination?.r);
    if(isPierogi){
      if(destinationOwner !== -1 && destinationOwner !== (actorIndex === 0 ? 1 : 0)){
        throw Object.assign(new Error('Pierogi Counters require a contested or opponent-owned square'), {code:'ILLEGAL_PLACEMENT'});
      }
    }else if(destinationOwner !== actorIndex && destinationOwner !== -1){
      throw Object.assign(new Error('a normal set cannot use the opponent safe row'), {code:'ILLEGAL_PLACEMENT'});
    }
    const alondraBlock = boardEntries(state).some(source=>
      source.z === Number(payload.destination?.z)
      && String(source.card.id || '') === '14'
      && controllerOf(source.card) !== actorIndex
      && source.card.faceDown !== true
      && !source.card.statuses?.includes('EFFECTS_SUPPRESSED')
      && Math.abs(source.r - Number(payload.destination?.r))
        + Math.abs(source.c - Number(payload.destination?.c)) === 1
    );
    if(!isPierogi && alondraBlock){
      throw Object.assign(new Error('Alondra blocks an adjacent opponent Supporter set'), {code:'ILLEGAL_PLACEMENT'});
    }
    const result = applyOperation(ctx, {
      type:'SET_CARD',
      playerIndex:actorIndex,
      cardIid:payload.cardIid,
      destination:payload.destination,
      sourceController:actorIndex,
      playedFromHand:true,
      countTowardSupporterLimit:!isPierogi && !isWhisperToken,
      allowOpponentSide:isPierogi
    });
    const card = findBoardCard(state, result.cardIid)?.card;
    if(isPierogi && card){
      const host = destinationOwner === -1 ? (actorIndex === 0 ? 1 : 0) : destinationOwner;
      card.counters.pierogiCreator = actorIndex;
      card.counters.pierogiHost = host;
      card.counters.boardTurnsRemaining = 3;
      card.owner = host;
      card.controller = host;
    }
    if(card){
      const effectId = isWhisperToken ? runtimeRuleId(card) : card.id;
      const hasWhenSetEffect = hasTiming(effectId, 'WHEN_SET', state);
      const block = supporterEffectBlock(state, card, actorIndex);
      if(block?.statusType === 'LUMBERJACK_SUPPRESSION'){
        applyLumberjackSuppression(state, ctx, card, block, actorIndex);
      }else if(hasWhenSetEffect && block){
        emitRuleEvent(ctx, {
          type:RULE_EVENT_TYPES.EFFECT_REACTED,
          sourceIid:card.iid,
          reactionIid:block.sourceIid || null,
          playerIndex:Number(block.sourceController),
          reactionKind:'TIMED_PERMISSION',
          mode:'SUPPRESS'
        });
        ctx.events.push({
          type:'EFFECT_BLOCKED',
          sourceIid:card.iid,
          playerIndex:actorIndex,
          reason:block.statusType,
          statusId:block.statusId
        });
      }else if(startPassiveTargetReaction(state, ctx, card, actorIndex, command.commandId)){
        // Opponent may deploy Havano before the new passive begins applying.
      }else if(startFieldEntryDeclaration(state, ctx, card, actorIndex, command.commandId)){
        // Passive field-entry declaration, intentionally not a When Set effect.
      }else if(hasWhenSetEffect){
        startEffect(state, ctx, card, actorIndex, 'WHEN_SET', command.commandId, effectId);
      }
    }
    return;
  }
  if(command.type === 'SET_CARD_FROM_DECK'){
    const entry = findCard(state, payload.cardIid);
    if(!entry || entry.zone !== 'deck' || entry.playerIndex !== actorIndex
      || !['07', '28'].includes(String(entry.card.id || ''))){
      throw Object.assign(new Error('the selected card cannot be set from the deck'), {code:'DECK_SET_NOT_AVAILABLE'});
    }
    if(String(entry.card.id || '') === '28' && Number(state.players[actorIndex].polishDeckSetTurn) === Number(state.turn)){
      throw Object.assign(new Error('The Army of Exiles can only be used once per turn'), {code:'ONCE_PER_TURN_LIMIT'});
    }
    if(String(entry.card.type || '') === 'Supporter'
      && Number(state.supportersSetForCapThisTurn?.[actorIndex] || 0) >= MAX_SUPPORTERS_SET_PER_TURN){
      throw Object.assign(new Error(`the ${MAX_SUPPORTERS_SET_PER_TURN}-Supporter hard cap has been reached`), {code:'SUPPORTER_HARD_CAP_REACHED'});
    }
    const owner = rowOwner(state, payload.destination?.z, payload.destination?.r);
    if(String(entry.card.id) === '07' ? owner !== actorIndex : ![-1, actorIndex].includes(owner)){
      throw Object.assign(new Error('the deck-set destination is illegal'), {code:'ILLEGAL_PLACEMENT'});
    }
    const card = state.players[actorIndex].deck.splice(entry.index, 1)[0];
    state.players[actorIndex].hand.push(card);
    emitRuleEvent(ctx, {
      type:RULE_EVENT_TYPES.DECK_SEARCHED,
      playerIndex:actorIndex,
      count:1,
      sourceIid:card.iid,
      semanticSourceCardId:String(card.id || '') || undefined
    });
    const result = applyOperation(ctx, {
      type:'SET_CARD',
      playerIndex:actorIndex,
      cardIid:card.iid,
      destination:payload.destination,
      sourceIid:card.iid,
      sourceController:actorIndex,
      countTowardSupporterLimit:false
    });
    const placed = findBoardCard(state, result.cardIid)?.card;
    if(String(card.id || '') === '28') state.players[actorIndex].polishDeckSetTurn = Number(state.turn);
    if(placed && startPassiveTargetReaction(state, ctx, placed, actorIndex, command.commandId)){
      // Opponent may deploy Havano before the new passive begins applying.
    }else if(placed && startFieldEntryDeclaration(state, ctx, placed, actorIndex, command.commandId)){
      // Passive field-entry declaration.
    }else if(placed && hasTiming(placed.id, 'WHEN_SET', state)){
      startEffect(state, ctx, placed, actorIndex, 'WHEN_SET', command.commandId);
    }
    return;
  }
  if(command.type === 'SET_ADAPTIVE_TOKEN'){
    const entry = findCard(state, payload.cardIid);
    if(!entry || entry.zone !== 'hand' || entry.playerIndex !== actorIndex
      || entry.card.counters?.adaptiveToken !== true){
      throw Object.assign(new Error('the selected card is not an Adaptive Tactics token'), {code:'CARD_NOT_IN_HAND'});
    }
    const declaredTypes = ['Supporter', 'Initiator', 'Improvisor', 'Coordinator', 'Dauntless'];
    const declaredAffiliations = ['reality', 'third_great_war', 'expanded_worlds', 'eventide'];
    const declaredRarities = ['circle', 'triangle', 'square', 'star'];
    if(!declaredTypes.includes(String(payload.declaredType))
      || !declaredAffiliations.includes(String(payload.declaredAffiliation))
      || !declaredRarities.includes(String(payload.declaredRarity))
      || !['SET', 'CONSOLIDATED'].includes(String(payload.placementType))){
      throw Object.assign(new Error('Adaptive Tactics declarations are invalid'), {code:'INVALID_DECLARATION'});
    }
    if(String(payload.declaredType) === 'Supporter'
      && String(payload.placementType) === 'SET'
      && Number(state.supportersSetForCapThisTurn?.[actorIndex] || 0) >= MAX_SUPPORTERS_SET_PER_TURN){
      throw Object.assign(new Error(`the ${MAX_SUPPORTERS_SET_PER_TURN}-Supporter hard cap has been reached`), {code:'SUPPORTER_HARD_CAP_REACHED'});
    }
    entry.card.type = String(payload.declaredType);
    entry.card.affiliation = String(payload.declaredAffiliation);
    entry.card.rarity = String(payload.declaredRarity);
    entry.card.counters.declaredPlacementType = String(payload.placementType);
    const result = applyOperation(ctx, {
      type:'SET_CARD',
      playerIndex:actorIndex,
      cardIid:entry.card.iid,
      destination:payload.destination,
      sourceIid:entry.card.iid,
      sourceController:actorIndex,
      playedFromHand:true,
      consolidated:payload.placementType === 'CONSOLIDATED',
      countTowardSupporterLimit:false
    });
    if(payload.placementType === 'CONSOLIDATED'){
      emitRuleEvent(ctx, {
        type:RULE_EVENT_TYPES.CARD_CONSOLIDATED,
        playerIndex:actorIndex,
        cardIid:result.cardIid,
        tributeIids:[],
        reinforcement:0,
        cost:0,
        destination:result.destination,
        adaptiveToken:true
      });
    }
    return;
  }
  if(command.type === 'CONSOLIDATE_CARD'){
    const consolidationLimit = moraleConsolidationLimit(state, actorIndex);
    if(moraleConsolidationsUsed(state, actorIndex) >= consolidationLimit){
      throw Object.assign(new Error('Morale limits this player to two consolidations this turn'), {code:'MORALE_CONSOLIDATION_LIMIT'});
    }
    const entry = findCard(state, payload.cardIid);
    if(!entry || entry.zone !== 'hand' || entry.playerIndex !== actorIndex){
      throw Object.assign(new Error('the selected card is not in the actor hand'), {code:'CARD_NOT_IN_HAND'});
    }
    if(String(entry.card.type || '') === 'Supporter'){
      throw Object.assign(new Error('Supporters cannot be consolidated'), {code:'INVALID_CONSOLIDATION_CARD'});
    }
    const consolidationBlock = zoneActionBlock(state, actorIndex, payload.destination?.z);
    if(consolidationBlock){
      throw Object.assign(
        new Error('consolidation is blocked in this zone for the turn'),
        {code:'ZONE_ACTION_BLOCKED', statusId:consolidationBlock.statusId}
      );
    }
    const faceDownPermission = state.statuses.find(status=>
      status?.type === 'FACE_DOWN_CONSOLIDATION_PERMISSION'
      && Number(status.playerIndex) === actorIndex
      && Number(status.zone) === Number(payload.destination?.z)
      && Number(status.remaining || 0) > 0
    );
    if(payload.faceDown === true && !faceDownPermission){
      throw Object.assign(new Error('there is no face-down consolidation permission in this zone'), {code:'FACE_DOWN_NOT_ALLOWED'});
    }
    const result = applyOperation(ctx, {
      type:'CONSOLIDATE_CARD',
      playerIndex:actorIndex,
      cardIid:payload.cardIid,
      tributeIids:payload.tributeIids,
      destination:payload.destination,
      faceDown:payload.faceDown === true,
      sourceController:actorIndex
    });
    recordMoraleConsolidation(state, actorIndex);
    const card = findBoardCard(state, result.cardIid)?.card;
    if(payload.faceDown === true && faceDownPermission){
      state.statuses = state.statuses.filter(status=>status.statusId !== faceDownPermission.statusId);
      ctx.events.push({type:'STATUS_REMOVED', statusId:faceDownPermission.statusId, reason:'FACE_DOWN_CONSOLIDATION_USED'});
    }
    if(card && !card.faceDown){
      const effectId = card.id;
      if(startPassiveTargetReaction(state, ctx, card, actorIndex, command.commandId)){}
      else if(startFieldEntryDeclaration(state, ctx, card, actorIndex, command.commandId)){}
      else if(hasTiming(effectId, 'WHEN_SET', state)) startEffect(state, ctx, card, actorIndex, 'WHEN_SET', command.commandId);
      else if(hasTiming(effectId, 'ACTIVATE', state)) startAutomaticActivation(state, ctx, card, actorIndex, command.commandId);
    }
    return;
  }
  if(command.type === 'FLIP_CARD'){
    const entry = findBoardCard(state, payload.cardIid);
    if(!entry || controllerOf(entry.card) !== actorIndex){
      throw Object.assign(new Error('the actor does not control the flipping card'), {code:'CARD_NOT_CONTROLLED'});
    }
    if(entry.card.faceDown !== true){
      throw Object.assign(new Error('the selected card is already face up'), {code:'CARD_ALREADY_FACE_UP'});
    }
    entry.card.faceDown = false;
    ctx.events.push({type:'CARD_FLIPPED', cardIid:entry.card.iid, playerIndex:actorIndex, faceDown:false});
    const effectId = entry.card.id;
    if(startPassiveTargetReaction(state, ctx, entry.card, actorIndex, command.commandId)){}
    else if(startFieldEntryDeclaration(state, ctx, entry.card, actorIndex, command.commandId)){}
    else if(hasTiming(effectId, 'WHEN_SET', state)) startEffect(state, ctx, entry.card, actorIndex, 'WHEN_SET', command.commandId);
    else if(hasTiming(effectId, 'ACTIVATE', state)) startAutomaticActivation(state, ctx, entry.card, actorIndex, command.commandId);
    return;
  }
  if(command.type === 'MOVE_CARD'){
    const entry = findBoardCard(state, payload.cardIid);
    if(!entry || controllerOf(entry.card) !== actorIndex){
      throw Object.assign(new Error('the actor does not control the moving card'), {code:'CARD_NOT_CONTROLLED'});
    }
    const movementGrant = movementGrantFor(state, entry.card.iid);
    const customMove = cardRule(entry.card.id, state)?.customCommand;
    const landscapeMove = !movementGrant
      && state.landscapeId === 'igb7'
      && String(entry.card.affiliation || '') === 'eventide'
      && entry.card.faceDown !== true;
    if(!['MOVE_AND_DRAW', 'EXPEDITIONARY_MOVE'].includes(customMove) && !movementGrant && !landscapeMove){
      throw Object.assign(new Error('this card has no player-facing v3 movement effect'), {code:'MOVE_NOT_AVAILABLE'});
    }
    if(landscapeMove && Number(entry.card.counters?.landscapeMoveTurn) === state.turn){
      throw Object.assign(new Error('Panacea movement can only be used once per turn'), {code:'USE_LIMIT_REACHED'});
    }
    if(movementGrant){
      if(Number(movementGrant.playerIndex) !== actorIndex){
        throw Object.assign(new Error('the movement grant belongs to another player'), {code:'MOVE_NOT_AVAILABLE'});
      }
      if(Number(movementGrant.lastMoveTurn) === state.turn){
        throw Object.assign(new Error('the granted movement can only be used once per turn'), {code:'USE_LIMIT_REACHED'});
      }
      const source = findBoardCard(state, movementGrant.sourceIid);
      if(source?.card.statuses?.includes('EFFECTS_SUPPRESSED')){
        throw Object.assign(new Error('the movement grant source is suppressed'), {code:'EFFECT_SUPPRESSED'});
      }
      const destination = payload.destination;
      const safeRow = actorIndex === 0 ? 2 : 0;
      if(Math.abs(Number(destination.z) - entry.z) !== 1
        || ![1, safeRow].includes(Number(destination.r))){
        throw Object.assign(new Error('granted movement requires an adjacent zone on the player side'), {code:'INVALID_DESTINATION'});
      }
    }
    if(String(entry.card.id) === 'bh01' && Number(entry.card.counters?.lastMoveTurn) === state.turn){
      throw Object.assign(new Error('Anička can only move once per turn'), {code:'USE_LIMIT_REACHED'});
    }
    if(state.gameSettings?.pressureCardReworks !== true && String(entry.card.id) === '73'){
      if(Number(entry.card.counters?.lastMoveTurn) === state.turn){
        throw Object.assign(new Error('ALPINE Expeditionary can only move once per turn'), {code:'USE_LIMIT_REACHED'});
      }
      const owner = rowOwner(state, payload.destination?.z, payload.destination?.r);
      if(owner !== -1 && owner !== actorIndex){
        throw Object.assign(new Error('ALPINE Expeditionary must move to its controller side'), {code:'INVALID_DESTINATION'});
      }
    }
    applyOperation(ctx, {
      type:'MOVE_CARD',
      cardIid:entry.card.iid,
      destination:payload.destination,
      sourceIid:entry.card.iid,
      sourceController:actorIndex,
      effectSourceIid:movementGrant?.sourceIid || null,
      reason:movementGrant
        ? 'MOVEMENT_GRANT'
        : (landscapeMove
          ? 'LANDSCAPE_PANACEA_MOVE'
          : (customMove === 'MOVE_AND_DRAW' ? 'MOVE_AND_DRAW' : 'EXPEDITIONARY_MOVE'))
    });
    if(String(entry.card.id) === 'bh01'){
      entry.card.counters.lastMoveTurn = state.turn;
      applyOperation(ctx, {
        type:'DRAW_CARD',
        playerIndex:actorIndex,
        count:1,
        sourceIid:entry.card.iid,
        sourceController:actorIndex,
        activatedEffect:true
      });
    }
    if(state.gameSettings?.pressureCardReworks !== true && String(entry.card.id) === '73') entry.card.counters.lastMoveTurn = state.turn;
    if(movementGrant) movementGrant.lastMoveTurn = state.turn;
    if(landscapeMove) entry.card.counters.landscapeMoveTurn = state.turn;
    return;
  }
  if(command.type === 'DISCARD_CARD'){
    const entry = findBoardCard(state, payload.targetIid);
    if(!entry || controllerOf(entry.card) !== actorIndex){
      throw Object.assign(new Error('the actor does not control the discarded card'), {code:'CARD_NOT_CONTROLLED'});
    }
    if(String(entry.card.id || '') === '76'){
      throw Object.assign(new Error('ALPINE Infantry cannot be manually discarded'), {code:'CARD_IMMUTABLE'});
    }
    applyOperation(ctx, {
      type:'DISCARD_CARD',
      targetIid:entry.card.iid,
      sourceIid:entry.card.iid,
      sourceController:actorIndex,
      reason:'MANUAL_DISCARD',
      bypassTargeting:true,
      bypassReaction:true
    });
    return;
  }
  if(command.type === 'ACTIVATE_EFFECT'){
    const entry = findBoardCard(state, payload.sourceIid);
    if(!entry || controllerOf(entry.card) !== actorIndex){
      throw Object.assign(new Error('the actor does not control the effect source'), {code:'SOURCE_NOT_CONTROLLED'});
    }
    const activationBlock = zoneActionBlock(state, actorIndex, entry.z);
    if(activationBlock){
      throw Object.assign(
        new Error('effect activation is blocked in this zone for the turn'),
        {code:'ZONE_ACTION_BLOCKED', statusId:activationBlock.statusId}
      );
    }
    const rule = cardRule(entry.card.id, state);
    if(!rule?.timings?.includes('ACTIVATE') || !rule.program){
      throw Object.assign(new Error('this card has no v3 activated effect'), {code:'EFFECT_NOT_IMPLEMENTED'});
    }
    if(rule.manualOnly === true && payload.userActivated !== true){
      throw Object.assign(
        new Error('this effect requires an explicit player activation'),
        {code:'MANUAL_ACTIVATION_REQUIRED'}
      );
    }
    if(isEffectSourceSuppressed(state, entry)){
      throw Object.assign(new Error('the source effect is suppressed'), {code:'EFFECT_SUPPRESSED'});
    }
    const permissionBlock = supporterEffectBlock(state, entry.card, actorIndex);
    if(permissionBlock){
      if(permissionBlock.statusType === 'LUMBERJACK_SUPPRESSION'){
        applyLumberjackSuppression(state, ctx, entry.card, permissionBlock, actorIndex);
        return;
      }
      throw Object.assign(
        new Error('Supporter effects are blocked for this turn'),
        {code:'EFFECT_PERMISSION_BLOCKED', statusId:permissionBlock.statusId}
      );
    }
    if(rule.maxUses && effectUses(entry.card) >= Number(rule.maxUses)){
      throw Object.assign(new Error('the effect use limit has been reached'), {code:'USE_LIMIT_REACHED'});
    }
    if(rule.oncePerTurn && Number(entry.card.counters?.lastEffectTurn) === state.turn){
      throw Object.assign(new Error('the effect can only be used once per turn'), {code:'USE_LIMIT_REACHED'});
    }
    if(rule.blockedWhileStatus && entry.card.statuses?.includes(rule.blockedWhileStatus)){
      throw Object.assign(new Error('the effect is already waiting to resolve'), {code:'EFFECT_ALREADY_PENDING'});
    }
    if(rule.sharedUseLimit
      && sharedEffectUses(state, rule, actorIndex) >= Number(rule.sharedUseLimit.maxUses || 0)){
      throw Object.assign(new Error('the shared effect use limit has been reached'), {code:'USE_LIMIT_REACHED'});
    }
    if(!openingProgramChoiceAvailable(state, {
      sourceIid:entry.card.iid,
      controller:actorIndex,
      instructionIndex:0,
      locals:{},
      program:rule.program
    }, rule.program)){
      throw Object.assign(new Error('the effect has no eligible resolution'), {code:'NO_LEGAL_TARGETS'});
    }
    consumeEffectUse(entry.card);
    if(rule.oncePerTurn) entry.card.counters.lastEffectTurn = state.turn;
    ctx.events.push({
      type:RULE_EVENT_TYPES.EFFECT_ACTIVATED,
      sourceIid:entry.card.iid,
      playerIndex:actorIndex
    });
    recordMoralePressureRuleEvent(ctx, ctx.events[ctx.events.length - 1]);
    startEffect(state, ctx, entry.card, actorIndex, 'ACTIVATE', command.commandId);
    return;
  }
  if(command.type === 'END_TURN'){
    ctx.events.push({type:RULE_EVENT_TYPES.TURN_ENDING, playerIndex:actorIndex, turn:state.turn});
    if(openTimedLandscapeEndTurnFrame(state, ctx, actorIndex, command.commandId)) return;
    completeEndTurn(state, ctx, actorIndex);
    return;
  }
  if(options.allowDebugCommands === true && ['DRAW_CARD', 'DISCARD_CARD', 'MODIFY_FATE'].includes(command.type)){
    applyOperation(ctx, {...cloneSerializable(payload), type:command.type, sourceController:actorIndex});
    return;
  }
  throw Object.assign(new Error(`command ${command.type} is not available to players`), {code:'COMMAND_NOT_PLAYER_FACING'});
}

export function reduceCommand(currentState, rawCommand, options = {}){
  const validation = validateCommand(rawCommand);
  if(!validation.ok) return validation;
  const command = validation.command;
  if(!currentState) return reject('STATE_REQUIRED', 'current state is required');
  try{
    assertInvariants(currentState);
  }catch(error){
    return reject(error.code || 'INVARIANT_FAILED', error.message, {violations:error.violations || []});
  }
  if(currentState.schemaVersion !== SCHEMA_VERSION
    || currentState.engineVersion !== ENGINE_VERSION
    || currentState.rulesetVersion !== RULESET_VERSION){
    return reject('VERSION_MISMATCH', 'match engine or ruleset version is not supported');
  }
  if(command.matchId !== currentState.matchId) return reject('MATCH_MISMATCH', 'command matchId does not match state');
  if(command.expectedRevision !== currentState.revision){
    return reject('STALE_REVISION', 'expectedRevision is stale', {latestRevision:currentState.revision});
  }
  const actorIndex = options.playerIndex ?? playerIndexById(currentState, options.playerId);
  if(actorIndex !== 0 && actorIndex !== 1) return reject('UNAUTHORIZED_PLAYER', 'command actor is not a match player');
  const state = cloneState(currentState);
  const ctx = {state, events:[], ruleEvents:[]};
  try{
    performCommand(state, ctx, command, actorIndex, options);
    if(state.effectStack.length && !state.pendingPrompt) runEffectStack(state, ctx);
    reconcileSovietGrenadierTargets(state, ctx);
    refreshMoralePressure(ctx);
    refreshHandLimitRequirement(state);
    if(state.warfrontMatch){
      state.warfrontConsolidations ||= [0,0];
      for(const event of ctx.events) if(event.type==='CARD_CONSOLIDATED' && [0,1].includes(event.playerIndex)){
        state.warfrontConsolidations[event.playerIndex]++;
      }
    }
    if(state.warfrontForfeit && state.outcome){
      state.outcome = {...state.outcome,boardWinner:state.outcome.boardWinner ?? state.outcome.winner,
        type:'WARFRONT_FORFEIT',winner:state.warfrontForfeit.winner,loser:state.warfrontForfeit.loser,
        commendationsEligible:state.outcome.commendationsEligible !== false};
    }
    state.revision += 1;
    assertInvariants(state);
    const stateHash = canonicalHash(state);
    return {
      ok:true,
      state,
      stateHash,
      revision:state.revision,
      status:state.outcome ? 'ENDED' : ((state.pendingPrompt || state.pendingHandLimit) ? 'NEEDS_CHOICE' : 'ACCEPTED'),
      prompt:state.pendingPrompt ? cloneSerializable(state.pendingPrompt) : null,
      handLimit:state.pendingHandLimit ? cloneSerializable(state.pendingHandLimit) : null,
      events:ctx.events,
      command:cloneSerializable(command)
    };
  }catch(error){
    return reject(error.code || 'COMMAND_REJECTED', error.message || 'command rejected', error.details || {});
  }
}
