import {boardEntries, controllerOf, findCard} from './selectors.mjs';
import {zoneScore} from './scoring.mjs';
import {
  canTarget,
  coordinatorAuraPotencyBoost,
  effectiveCardType,
  effectiveFate,
  isEffectImmutable,
  isEffectSourceSuppressed,
  runtimeRuleId
} from './modifiers.mjs';

function collectRiveraArrivalBonuses(state, event, operations){
  if(!['CARD_SET', 'AFFILIATION_CHANGED'].includes(String(event.type || ''))) return;
  const placed = boardEntries(state).find(entry=>String(entry.card.iid) === String(event.cardIid));
  if(!placed
    || String(placed.card.id || '') === '51'
    || placed.card.faceDown === true
    || effectiveCardType(state, placed.card) === 'Supporter'
    || effectiveCardType(state, placed.card) === 'Counter'
    || isEffectImmutable(placed.card)){
    return;
  }
  const playerIndex = controllerOf(placed.card);
  for(const status of state.statuses.filter(item=>
    item?.type === 'RIVERA_AFFILIATION_BONUS'
    && Number(item.playerIndex) === playerIndex
    && Number(item.remainingOwnerTurns || 0) > 0
    && String(item.affiliation || '') === String(placed.card.affiliation || '')
  )){
    const marker = `RIVERA_BONUS:${status.statusId}`;
    if(placed.card.statuses?.includes(marker)) continue;
    operations.push({
      type:'CREATE_STATUS',
      targetIid:placed.card.iid,
      status:marker,
      sourceIid:status.sourceIid
    });
    operations.push({
      type:'MODIFY_FATE',
      targetIid:placed.card.iid,
      amount:Number(status.value || 4) || 4,
      sourceIid:status.sourceIid,
      sourceController:playerIndex,
      reason:'RIVERA_AFFILIATION_BONUS',
      bypassReaction:true
    });
  }
}

export function collectTriggeredOperations(state, event){
  const operations = [];
  collectRiveraArrivalBonuses(state, event, operations);
  if(event.type === 'CARD_SET'){
    const placed = boardEntries(state).find(entry=>String(entry.card.iid) === String(event.cardIid));
    if(placed && !isEffectImmutable(placed.card)){
      for(const anicka of boardEntries(state).filter(entry=>
        entry.z === placed.z
        && String(entry.card.id || '') === '02'
        && controllerOf(entry.card) === Number(event.playerIndex)
        && String(entry.card.iid) !== String(placed.card.iid)
        && entry.card.faceDown !== true
        && !isEffectSourceSuppressed(state, entry)
      )){
        operations.push({
          type:'MODIFY_FATE',
          targetIid:placed.card.iid,
          amount:4,
          sourceIid:anicka.card.iid,
          sourceController:Number(event.playerIndex),
          reason:'STARLIT_PATH',
          bypassReaction:true
        });
      }
    }
  }
  if(event.type === 'CARD_SET' && state.landscapeId === 'igb5'){
    const placed = boardEntries(state).find(entry=>String(entry.card.iid) === String(event.cardIid));
    const totals = [0, 1].map(playerIndex=>boardEntries(state)
      .filter(entry=>controllerOf(entry.card) === playerIndex)
      .reduce((sum, entry)=>sum + effectiveFate(state, entry), 0));
    const leader = totals[0] === totals[1] ? -1 : (totals[0] > totals[1] ? 0 : 1);
    if(placed
      && controllerOf(placed.card) === leader
      && !isEffectImmutable(placed.card)
      && !placed.card.statuses?.includes('LANDSCAPE_BONUS:igb5')){
      operations.push({
        type:'CREATE_STATUS',
        targetIid:placed.card.iid,
        status:'LANDSCAPE_BONUS:igb5',
        sourceIid:'landscape:igb5'
      });
      operations.push({
        type:'MODIFY_FATE',
        targetIid:placed.card.iid,
        amount:2,
        sourceIid:'landscape:igb5',
        sourceController:Number(event.playerIndex),
        reason:'LANDSCAPE_IGB5_SET_BONUS',
        bypassReaction:true
      });
    }
  }
  if(['CARD_DISCARDED', 'CARD_TRANSFERRED'].includes(String(event.type || ''))){
    const previousZone = event.type === 'CARD_DISCARDED' ? event.previousZone : event.from;
    if(previousZone === 'board'){
      const departed = state.players.flatMap(player=>[
        ...player.deck,
        ...player.hand,
        ...player.discard
      ]).find(card=>String(card.iid) === String(event.cardIid));
      for(const marker of departed?.statuses || []){
        if(!String(marker).startsWith('VIGILANTES_MARK:')) continue;
        const parts = String(marker).split(':');
        const sourceIid = parts[1] || null;
        const sourceController = Number(parts[2]);
        operations.push({
          type:'RANDOM_DISCARD_HAND',
          playerIndex:sourceController === 0 ? 1 : 0,
          sourceIid,
          sourceController,
          reason:'MARKED_FOR_DEATH'
        });
      }
    }
  }
  if(event.type === 'DECK_SEARCHED'){
    for(const boleslaw of boardEntries(state).filter(entry=>
      String(entry.card.id || '') === '86'
      && controllerOf(entry.card) !== Number(event.playerIndex)
      && entry.card.faceDown !== true
      && !isEffectSourceSuppressed(state, entry)
    )){
      const playerIndex = controllerOf(boleslaw.card);
      operations.push({
        type:'DRAW_CARD',
        playerIndex,
        count:1,
        sourceIid:boleslaw.card.iid,
        sourceController:playerIndex,
        activatedEffect:true,
        semanticSourceCardId:'86'
      });
      if(!isEffectImmutable(boleslaw.card)){
        operations.push({
          type:'MODIFY_FATE',
          targetIid:boleslaw.card.iid,
          amount:2,
          sourceIid:boleslaw.card.iid,
          sourceController:playerIndex,
          // This passive can resolve inside the searched card's effect frame.
          // Preserve Boleslaw's own rule identity so presentation and the
          // detailed oracle do not apply the searcher's target restrictions.
          semanticSourceCardId:'86',
          reason:'A_BOMBASTIC_CHARACTER',
          bypassReaction:true
        });
      }
    }
  }
  if(event.type === 'CARD_SET' && ['igb6', 'igb11'].includes(state.landscapeId)){
    const entry = boardEntries(state).find(item=>String(item.card.iid) === String(event.cardIid));
    const marker = `LANDSCAPE_BONUS:${state.landscapeId}`;
    const eligible = state.landscapeId === 'igb6'
      ? String(entry?.card?.affiliation || '') === 'reality'
      : String(entry?.card?.type || '') === 'Initiator';
    if(entry
      && eligible
      && !isEffectImmutable(entry.card)
      && !entry.card.statuses?.includes(marker)){
      operations.push({
        type:'CREATE_STATUS',
        targetIid:entry.card.iid,
        status:marker,
        sourceIid:`landscape:${state.landscapeId}`
      });
      operations.push({
        type:'MODIFY_FATE',
        targetIid:entry.card.iid,
        amount:3,
        sourceIid:`landscape:${state.landscapeId}`,
        sourceController:Number(event.playerIndex),
        reason:`LANDSCAPE_${state.landscapeId.toUpperCase()}_SET_BONUS`,
        bypassReaction:true
      });
    }
  }
  if(event.type === 'CARD_SET'){
    const placed = boardEntries(state).find(entry=>String(entry.card.iid) === String(event.cardIid));
    if(placed && String(placed.card.type || '') === 'Supporter'){
      for(const status of state.statuses.filter(item=>
        item?.type === 'CONSOLIDATION_FATE_BONUS'
        && Number(item.playerIndex) === Number(event.playerIndex)
      )){
        operations.push({
          type:'REMOVE_MATCH_STATUS',
          statusId:status.statusId,
          reason:'SUPPORTER_SET'
        });
      }
    }
    if(placed
      && placed.card.faceDown !== true
      && String(placed.card.type || '') === 'Coordinator'){
      const playerIndex = controllerOf(placed.card);
      for(const source of boardEntries(state).filter(entry=>
        (entry.z === placed.z || entry.card.counters?.whisperLandscapeToken === true)
        && runtimeRuleId(entry.card) === '15'
        && controllerOf(entry.card) === playerIndex
        && entry.card.faceDown !== true
        && !isEffectSourceSuppressed(state, entry)
      )){
        const amount = 1 + coordinatorAuraPotencyBoost(state, source);
        for(const target of boardEntries(state).filter(entry=>
          (entry.z === source.z || source.card.counters?.whisperLandscapeToken === true)
          && controllerOf(entry.card) === playerIndex
          && !isEffectImmutable(entry.card)
        )){
          operations.push({
            type:'MODIFY_FATE',
            targetIid:target.card.iid,
            amount,
            sourceIid:source.card.iid,
            sourceController:playerIndex,
            reason:'BLUE_DANUBE_WALTZ',
            bypassReaction:true
          });
        }
      }
    }
  }
  if(event.type === 'EFFECT_REACTED' && ['NEGATE', 'SUPPRESS'].includes(String(event.mode || ''))){
    const reactingPlayer = Number(event.playerIndex);
    for(const source of boardEntries(state).filter(entry=>
      runtimeRuleId(entry.card) === 'bh08'
      && controllerOf(entry.card) === reactingPlayer
      && entry.card.faceDown !== true
      && !isEffectSourceSuppressed(state, entry)
    )){
      const amount = 2 + coordinatorAuraPotencyBoost(state, source);
      for(const target of boardEntries(state).filter(entry=>
        (entry.z === source.z || source.card.counters?.whisperLandscapeToken === true)
        && controllerOf(entry.card) === reactingPlayer
        && !isEffectImmutable(entry.card)
      )){
        operations.push({
          type:'MODIFY_FATE',
          targetIid:target.card.iid,
          amount,
          sourceIid:source.card.iid,
          sourceController:reactingPlayer,
          reason:'MISCHIEVOUS_ACTIVITIES',
          bypassReaction:true
        });
      }
    }
  }
  if(event.type === 'CARD_MOVED'){
    const destinationZone = Number(event.to?.z);
    const moved = findCard(state, event.cardIid)?.card;
    for(const entry of boardEntries(state)){
      if(entry.z !== destinationZone || String(entry.card.id || '') !== '34') continue;
      const targetCheck = canTarget(state, entry.card, moved, {
        type:'MODIFY_FATE',
        sourceIid:entry.card.iid,
        sourceController:controllerOf(entry.card),
        targetIid:event.cardIid
      });
      if(!targetCheck.ok) continue;
      operations.push({
        type:'MODIFY_FATE',
        targetIid:event.cardIid,
        amount:3,
        sourceIid:entry.card.iid,
        sourceController:controllerOf(entry.card),
        semanticSourceCardId:'34',
        reason:'ROZSI_MOVEMENT_BONUS',
        bypassReaction:true
      });
    }
  }
  if(event.type === 'DRAW_EFFECT_ACTIVATED'){
    for(const joie of boardEntries(state).filter(entry=>
      runtimeRuleId(entry.card) === 'bh02' && controllerOf(entry.card) === Number(event.playerIndex)
    )){
      for(const target of boardEntries(state).filter(entry=>
        (entry.z === joie.z || joie.card.counters?.whisperLandscapeToken === true)
        && controllerOf(entry.card) === Number(event.playerIndex)
      )){
        const targetCheck = canTarget(state, joie.card, target.card, {
          type:'MODIFY_FATE',
          sourceIid:joie.card.iid,
          sourceController:Number(event.playerIndex),
          targetIid:target.card.iid
        });
        if(!targetCheck.ok) continue;
        operations.push({
          type:'MODIFY_FATE',
          targetIid:target.card.iid,
          amount:1,
          sourceIid:joie.card.iid,
          sourceController:Number(event.playerIndex),
          reason:'JOIE_DRAW_EFFECT_BONUS',
          bypassReaction:true
        });
      }
    }
  }
  if(event.type === 'CARD_CONSOLIDATED'){
    const consolidated = boardEntries(state).find(entry=>
      String(entry.card.iid) === String(event.cardIid)
    );
    if(consolidated && !isEffectImmutable(consolidated.card)){
      const playerIndex = Number(event.playerIndex);
      const opponentIndex = playerIndex === 0 ? 1 : 0;
      const controllerTotal = [0, 1, 2].reduce((sum, z)=>sum + zoneScore(state, z, playerIndex), 0);
      const opponentTotal = [0, 1, 2].reduce((sum, z)=>sum + zoneScore(state, z, opponentIndex), 0);
      if(controllerTotal > opponentTotal){
        for(const sourceEntry of boardEntries(state).filter(entry=>
          controllerOf(entry.card) === playerIndex
          && String(entry.card.iid) !== String(event.cardIid)
          && entry.card.faceDown !== true
          && runtimeRuleId(entry.card) === 'bh17'
          && !isEffectSourceSuppressed(state, entry)
        )){
          operations.push({
            type:'MODIFY_FATE',
            targetIid:event.cardIid,
            amount:3,
            sourceIid:sourceEntry.card.iid,
            semanticSourceCardId:'bh17',
            sourceController:playerIndex,
            reason:'CRUSHING_MOMENTUM',
            bypassReaction:true
          });
        }
      }
      if(state.landscapeId === 'igb3'
        && Number(state.landscapeState.targetZone) === Number(event.destination?.z)
        && state.turn < 10
        && !consolidated.card.statuses?.includes('LANDSCAPE_BONUS:igb3')){
        operations.push({
          type:'CREATE_STATUS',
          targetIid:event.cardIid,
          status:'LANDSCAPE_BONUS:igb3',
          sourceIid:'landscape:igb3'
        });
        operations.push({
          type:'MODIFY_FATE',
          targetIid:event.cardIid,
          amount:4,
          sourceIid:'landscape:igb3',
          sourceController:Number(event.playerIndex),
          reason:'LANDSCAPE_IGB3_CONSOLIDATION_BONUS',
          bypassReaction:true
        });
      }
      for(const status of state.statuses.filter(item=>
        item?.type === 'CONSOLIDATION_FATE_BONUS'
        && Number(item.playerIndex) === Number(event.playerIndex)
      )){
        operations.push({
          type:'MODIFY_FATE',
          targetIid:event.cardIid,
          amount:Number(status.value || 0) || 0,
          sourceIid:status.sourceIid,
          sourceController:Number(event.playerIndex),
          reason:'KVETKA_BALLAD_CONSOLIDATION',
          bypassReaction:true
        });
      }
    }
    for(const entry of boardEntries(state)){
      if(entry.z !== Number(event.destination?.z)) continue;
      if(String(entry.card.id || '') !== '36') continue;
      if(controllerOf(entry.card) === Number(event.playerIndex)) continue;
      if(isEffectSourceSuppressed(state, entry)) continue;
      operations.push({
        type:'CREATE_MATCH_STATUS',
        status:{
          statusId:`deterrance:${entry.card.iid}:${event.cardIid}`,
          type:'ZONE_FATE_MODIFIER',
          zone:entry.z,
          playerIndex:Number(event.playerIndex),
          value:-4,
          sourceIid:entry.card.iid,
          reason:'MARIE_DETERRANCE'
        }
      });
    }
  }
  if(event.type === 'TURN_STARTED'){
    if(state.landscapeId === 'igb18'){
      for(const entry of boardEntries(state).filter(item=>
        controllerOf(item.card) === Number(event.playerIndex)
        && String(item.card.affiliation || '') === 'expanded_worlds'
        && effectiveCardType(state, item.card) !== 'Supporter'
        && effectiveCardType(state, item.card) !== 'Counter'
        && item.card.faceDown !== true
        && !isEffectImmutable(item.card)
      )){
        operations.push({
          type:'MODIFY_FATE',
          targetIid:entry.card.iid,
          amount:1,
          sourceIid:'landscape:igb18',
          sourceController:Number(event.playerIndex),
          reason:'LANDSCAPE_IGB18_DRAW_PHASE_BONUS',
          bypassReaction:true
        });
      }
    }
    if(state.landscapeId === 'igb15'){
      for(const entry of boardEntries(state).filter(item=>
        String(item.card.id || '') === '100'
        && controllerOf(item.card) === Number(event.playerIndex)
        && item.card.faceDown !== true
        && !isEffectSourceSuppressed(state, item)
        && !isEffectImmutable(item.card)
      )){
        operations.push({
          type:'MODIFY_FATE',
          targetIid:entry.card.iid,
          amount:2,
          sourceIid:entry.card.iid,
          sourceController:Number(event.playerIndex),
          reason:'WINTERTIDE',
          bypassReaction:true
        });
      }
    }
    for(const entry of boardEntries(state).filter(item=>
      String(item.card.id || '') === '95'
      && item.card.faceDown !== true
      && !isEffectSourceSuppressed(state, item)
    )){
      operations.push({
        type:'TICK_COUNTER_FATE',
        targetIid:entry.card.iid,
        counterKey:'specterTurnsOnField',
        triggerCounterKey:'specterFateGains',
        threshold:2,
        maxTriggers:6,
        amount:1,
        sourceIid:entry.card.iid,
        sourceController:controllerOf(entry.card),
        reason:'THOUSAND_YEAR_SORROW'
      });
    }
  }
  if(event.type === 'DRAW_PHASE_COMPLETED'){
    for(const entry of boardEntries(state).filter(item=>
      String(item.card.id || '') === '46'
      && controllerOf(item.card) === Number(event.playerIndex)
      && item.card.faceDown !== true
      && !isEffectSourceSuppressed(state, item)
    )){
      operations.push({
        type:'MODIFY_FATE',
        targetIid:entry.card.iid,
        amount:2,
        sourceIid:entry.card.iid,
        sourceController:Number(event.playerIndex),
        reason:'MONARCHIST_MANIFESTO',
        bypassReaction:true
      });
    }
  }
  return operations;
}
