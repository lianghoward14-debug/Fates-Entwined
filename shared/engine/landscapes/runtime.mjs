import {nextInt} from '../rng.mjs';
import {effectiveCardType, isEffectImmutable} from '../modifiers.mjs';
import {boardEntries, controllerOf} from '../selectors.mjs';
import {zoneScore} from '../scoring.mjs';

const RANDOM_ZONE_LANDSCAPES = new Set(['igb3', 'igb8']);

export function createLandscapeState(landscapeId, rngState){
  const id = String(landscapeId || '');
  return {
    id,
    targetZone:RANDOM_ZONE_LANDSCAPES.has(id) ? nextInt(rngState, 3) : null,
    consolidations:[0, 0],
    resolvedTurns:{},
    drawPhaseCounts:[0, 0],
    supporterEffectsThisTurn:[0, 0],
    handTurnCounts:[0, 0],
    fateThresholdClaims:{},
    oncePerGameUses:[0, 0]
  };
}

export function isLandscapeCharacter(state, card){
  return !['Supporter', 'Counter'].includes(effectiveCardType(state, card));
}

export function stampCaliforniqueHandCard(state, playerIndex, card){
  if(state.landscapeId !== 'igb19' || !card) return false;
  delete card.counters.igb19HandTurnsRemaining;
  delete card.counters.igb19HandOwner;
  delete card.counters.igb19LastCountedOwnerTurn;
  if(!isLandscapeCharacter(state, card) || isEffectImmutable(card)) return false;
  card.counters.igb19HandTurnsRemaining = 3;
  card.counters.igb19HandOwner = Number(playerIndex);
  card.counters.igb19LastCountedOwnerTurn = Number(state.landscapeState?.handTurnCounts?.[playerIndex] || 0);
  return true;
}

export function initializeLandscapeHandCards(state){
  if(state.landscapeId !== 'igb19') return;
  state.players.forEach((player, playerIndex)=>{
    player.hand.forEach(card=>stampCaliforniqueHandCard(state, playerIndex, card));
  });
}

export function recordLandscapeRuleEvent(state, event){
  if(event?.type === 'CARD_CONSOLIDATED'){
    const playerIndex = Number(event.playerIndex);
    if(playerIndex === 0 || playerIndex === 1){
      state.landscapeState.consolidations[playerIndex] += 1;
    }
  }
}

export function resetLandscapeTurnCounters(state, playerIndex){
  const player = Number(playerIndex);
  if(player !== 0 && player !== 1) return;
  state.landscapeState.supporterEffectsThisTurn[player] = 0;
}

export function landscapeSupporterEffectLimitReached(state, card, playerIndex){
  return state.landscapeId === 'igb15'
    && effectiveCardType(state, card) === 'Supporter'
    && Number(state.landscapeState.supporterEffectsThisTurn[playerIndex] || 0) >= 1;
}

export function recordLandscapeSupporterEffect(state, card, playerIndex){
  if(state.landscapeId !== 'igb15' || effectiveCardType(state, card) !== 'Supporter') return;
  state.landscapeState.supporterEffectsThisTurn[playerIndex] += 1;
}

export function shouldSkipLandscapeDraw(state, playerIndex){
  if(state.landscapeId !== 'igb13') return false;
  state.landscapeState.drawPhaseCounts[playerIndex] += 1;
  return state.landscapeState.drawPhaseCounts[playerIndex] % 2 === 0;
}

export function expireCaliforniqueHandCards(state, playerIndex){
  if(state.landscapeId !== 'igb19') return [];
  const player = Number(playerIndex);
  state.landscapeState.handTurnCounts[player] += 1;
  const completedOwnerTurn = state.landscapeState.handTurnCounts[player];
  const expired = [];
  for(const card of state.players[player].hand){
    if(!isLandscapeCharacter(state, card) || isEffectImmutable(card)){
      delete card.counters.igb19HandTurnsRemaining;
      delete card.counters.igb19HandOwner;
      delete card.counters.igb19LastCountedOwnerTurn;
      continue;
    }
    const sameOwner = Number(card.counters.igb19HandOwner) === player;
    const remaining = sameOwner
      ? Math.max(1, Math.min(3, Number(card.counters.igb19HandTurnsRemaining) || 3))
      : 3;
    const lastCounted = sameOwner
      ? Math.max(0, Number(card.counters.igb19LastCountedOwnerTurn) || 0)
      : completedOwnerTurn - 1;
    const nextRemaining = lastCounted < completedOwnerTurn ? remaining - 1 : remaining;
    card.counters.igb19HandOwner = player;
    card.counters.igb19LastCountedOwnerTurn = completedOwnerTurn;
    card.counters.igb19HandTurnsRemaining = nextRemaining;
    if(nextRemaining <= 0) expired.push(card.iid);
  }
  return expired;
}

function nextLandscapeFrameId(state, kind){
  state.eventSeq += 1;
  return `${state.matchId}:${kind}:${state.revision + 1}:${state.eventSeq}`;
}

function landscapeFrame(state, landscapeId, controller, timing, program){
  return {
    frameId:nextLandscapeFrameId(state, 'frame'),
    kind:'LANDSCAPE_TRIGGER',
    sourceIid:`landscape:${landscapeId}`,
    sourceCardId:landscapeId,
    sourceType:'Landscape',
    controller,
    timing,
    instructionIndex:0,
    waitingFor:null,
    locals:{},
    program,
    originalCommandId:`landscape:${landscapeId}:turn${state.turn}`
  };
}

function totalFate(state, playerIndex){
  return [0, 1, 2].reduce((sum, zone)=>sum + zoneScore(state, zone, playerIndex), 0);
}

export function queueBattleOfPellaFrame(state){
  if(state.landscapeId !== 'igb20') return false;
  const unresolved = Object.values(state.landscapeState.fateThresholdClaims)
    .some(claim=>claim && claim.choiceResolved !== true);
  if(unresolved) return false;
  const totals = [totalFate(state, 0), totalFate(state, 1)];
  const threshold = [20, 35, 50].find(value=>
    !state.landscapeState.fateThresholdClaims[String(value)]
    && (totals[0] >= value || totals[1] >= value)
  );
  if(!threshold) return false;
  const reached = [0, 1].filter(playerIndex=>totals[playerIndex] >= threshold);
  const winner = reached.includes(state.activePlayer) ? state.activePlayer : reached[0];
  const claim = {
    threshold,
    winner,
    winningTotal:totals[winner],
    choiceResolved:false,
    declined:false,
    discardedIid:null
  };
  state.landscapeState.fateThresholdClaims[String(threshold)] = claim;
  const eligible = boardEntries(state).filter(entry=>
    entry.card.faceDown !== true && !isEffectImmutable(entry.card)
  );
  if(!eligible.length){
    claim.choiceResolved = true;
    claim.declined = true;
    return queueBattleOfPellaFrame(state);
  }
  state.effectStack.push(landscapeFrame(state, 'igb20', winner, 'FATE_THRESHOLD', [
    {
      kind:'SELECT_BOARD',
      local:'targetIid',
      min:0,
      max:1,
      optional:true,
      cancelBehavior:'CONTINUE',
      filter:{faceUp:true, effectMutable:true}
    },
    {
      kind:'OPTIONAL_OPERATION',
      requiredLocal:'targetIid',
      operation:{
        type:'DISCARD_CARD',
        targetIid:'$targetIid',
        sourceIid:'landscape:igb20',
        sourceController:winner,
        reason:'LANDSCAPE_IGB20_FATE_THRESHOLD',
        bypassReaction:true
      }
    },
    {kind:'COMPLETE_LANDSCAPE_THRESHOLD', threshold}
  ]));
  return true;
}

export function completeBattleOfPellaThreshold(state, frame, threshold){
  const claim = state.landscapeState.fateThresholdClaims[String(threshold)];
  if(!claim) return false;
  const targetIid = frame.locals.targetIid || null;
  claim.choiceResolved = true;
  claim.declined = !targetIid;
  claim.discardedIid = targetIid;
  return queueBattleOfPellaFrame(state);
}

export function queueLandscapeRuleEventFrame(state, event){
  if(state.landscapeId === 'igb9'
    && event?.type === 'CARD_DRAWN'
    && event.activatedEffect === true
    && event.redirectedToDeckBottom !== true
    && boardEntries(state).some(entry=>entry.card.faceDown !== true && !isEffectImmutable(entry.card))){
    state.effectStack.push(landscapeFrame(state, 'igb9', Number(event.playerIndex), 'OUTSIDE_DRAW_PHASE', [
      {
        kind:'SELECT_BOARD',
        local:'targetIid',
        min:0,
        max:1,
        optional:true,
        cancelBehavior:'CONTINUE',
        filter:{faceUp:true, effectMutable:true, targetable:'MODIFY_FATE'}
      },
      {
        kind:'OPTIONAL_OPERATION',
        requiredLocal:'targetIid',
        operation:{
          type:'MODIFY_FATE',
          targetIid:'$targetIid',
          amount:3,
          sourceIid:'landscape:igb9',
          sourceController:Number(event.playerIndex),
          reason:'LANDSCAPE_IGB9_OUTSIDE_DRAW_BONUS',
          bypassReaction:true
        }
      }
    ]));
  }
  if(['FATE_CHANGED', 'CARD_SET', 'CARD_CONSOLIDATED', 'CARD_MOVED', 'CONTROL_CHANGED'].includes(String(event?.type || ''))){
    queueBattleOfPellaFrame(state);
  }
}

const TIMED_LANDSCAPE_TURNS = Object.freeze({igb2:14, igb8:10});

export function landscapeChangeBlockReason(state, targetLandscapeId){
  const currentId = String(state.landscapeId || '');
  const targetId = String(targetLandscapeId || '');
  if(currentId === targetId) return '';
  const currentTurn = Number(TIMED_LANDSCAPE_TURNS[currentId] || 0);
  if(currentTurn
    && state.landscapeState.resolvedTurns[currentId] !== true
    && state.turn >= currentTurn - 4){
    return `${currentId} cannot be changed during its final four turns`;
  }
  const targetTurn = Number(TIMED_LANDSCAPE_TURNS[targetId] || 0);
  if(targetTurn && state.turn >= targetTurn - 4){
    return `${targetId} cannot be entered during its final four turns`;
  }
  return '';
}

export function replaceLandscapeState(state, targetLandscapeId){
  const targetId = String(targetLandscapeId || '');
  const previousLandscapeId = String(state.landscapeId || '');
  if(targetId === previousLandscapeId){
    return {previousLandscapeId, landscapeId:targetId, changed:false};
  }
  state.landscapeId = targetId;
  state.landscapeState = createLandscapeState(targetId, state.rngState);
  if(targetId === 'igb19') initializeLandscapeHandCards(state);
  if(targetId === 'igb20'){
    const totals = [totalFate(state, 0), totalFate(state, 1)];
    const highestAlreadyReached = Math.max(...totals);
    for(const threshold of [20, 35, 50]){
      if(highestAlreadyReached < threshold) continue;
      state.landscapeState.fateThresholdClaims[String(threshold)] = {
        threshold,
        winner:null,
        winningTotal:null,
        choiceResolved:true,
        declined:false,
        discardedIid:null,
        ignored:true,
        ignoredOnEntry:true
      };
    }
  }
  return {previousLandscapeId, landscapeId:targetId, changed:true};
}
