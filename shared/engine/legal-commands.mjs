import {cardRule} from './cards/registry.mjs';
import {MAX_SUPPORTERS_SET_PER_TURN} from './constants.mjs';
import {
  canUseAsConsolidationTribute,
  effectiveCardType,
  effectiveConsolidationCost,
  isEffectImmutable,
  isEffectSourceSuppressed,
  isImmuneToOpponentEffects,
  runtimeRuleId,
  structuralCardType,
  zoneActionBlock
} from './modifiers.mjs';
import {landscapeSupporterEffectLimitReached} from './landscapes/runtime.mjs';
import {isProtectedHandLimitCard} from './hand-limits.mjs';
import {
  eligibleBoardTargets,
  eligibleCardTargets,
  eligibleDestinations,
  eligibleZones,
  openingProgramChoiceAvailable
} from './prompts.mjs';
import {boardEntries, controllerOf, findBoardCard, openBoardDestinations, rowOwner, squareStatuses} from './selectors.mjs';
import {moraleConsolidationLimit, moraleConsolidationsUsed} from './morale-pressure.mjs';

function ownSetDestination(state, playerIndex, destination){
  const owner = rowOwner(state, destination.z, destination.r);
  return owner === -1 || owner === playerIndex;
}

function opponentAlondraBlocksSupporterSet(state, playerIndex, destination){
  return boardEntries(state).some(entry=>
    entry.z === Number(destination.z)
    && String(entry.card.id || '') === '14'
    && controllerOf(entry.card) !== Number(playerIndex)
    && entry.card.faceDown !== true
    && !entry.card.statuses?.includes('EFFECTS_SUPPRESSED')
    && Math.abs(entry.r - Number(destination.r))
      + Math.abs(entry.c - Number(destination.c)) === 1
  );
}

function ruleForCard(card, state){
  // copiedEffectId is retained as public presentation/oracle evidence for a
  // one-shot Taylor/Ledger copy. It must not replace the physical card's
  // player-facing timing: single-player executes the copied program once and
  // restores the copier, so it never gains a permanent ACTIVATE button.
  return cardRule(card?.id, state);
}

function supporterActivationAvailable(state, card, playerIndex){
  if(landscapeSupporterEffectLimitReached(state, card, playerIndex)) return false;
  if(effectiveCardType(state, card) !== 'Supporter') return true;
  const block = state.statuses.find(status=>
    status?.type === 'TIMED_PLAYER_STATUS'
    && status.statusType === 'SUPPORTER_EFFECTS_BLOCKED'
    && Number(status.playerIndex) === Number(playerIndex)
    && Number(status.activeFromTurn) <= Number(state.turn)
    && Number(status.remainingTargetTurns) > 0
  );
  if(!block) return true;
  return Number(block.sourceController) !== Number(playerIndex)
    && (isEffectImmutable(card) || isImmuneToOpponentEffects(card, state));
}

function movementGrantFor(state, cardIid){
  return state.statuses.find(status=>
    status?.type === 'MOVEMENT_GRANT'
    && !String(status.statusId || '').startsWith('movement-grant:busser:')
    && String(status.targetIid || '') === String(cardIid || '')
    && Number(status.remainingOwnerTurns) > 0
  ) || null;
}

function availableMovementGrant(state, entry, playerIndex){
  const grant = movementGrantFor(state, entry.card.iid);
  if(!grant || Number(grant.playerIndex) !== Number(playerIndex)) return null;
  if(Number(grant.lastMoveTurn) === Number(state.turn)) return null;
  if(Number(entry.card.counters?.lastMoveTurn) === Number(state.turn)) return null;
  const source = findBoardCard(state, grant.sourceIid);
  if(source?.card.statuses?.includes('EFFECTS_SUPPRESSED')) return null;
  return grant;
}

function openingChoiceAvailable(state, card, playerIndex, timing){
  const rule = ruleForCard(card, state);
  if(!rule?.timings?.includes(String(timing)) || !Array.isArray(rule.program)) return true;
  // A card is still legal to set when its WHEN_SET effect currently has no
  // eligible target.  The shipping single-player rules let that effect fizzle;
  // target availability must never turn an otherwise legal placement into an
  // "illegal square" error.
  if(String(timing) === 'WHEN_SET') return true;
  const frame = {
    sourceIid:card.iid,
    controller:Number(playerIndex),
    instructionIndex:0,
    locals:{},
    program:rule.program
  };
  return openingProgramChoiceAvailable(state, frame, rule.program);
}

function placementPreview(state, playerIndex, card, destination, tributeIids = []){
  const tributeSet = new Set((tributeIids || []).map(String));
  const board = state.board.map(zone=>zone.map(row=>row.slice()));
  for(let z = 0; z < board.length; z += 1){
    for(let r = 0; r < board[z].length; r += 1){
      for(let c = 0; c < board[z][r].length; c += 1){
        if(board[z][r][c] && tributeSet.has(String(board[z][r][c].iid))) board[z][r][c] = null;
      }
    }
  }
  const previewCard = {...card, controller:playerIndex, faceDown:false};
  board[destination.z][destination.r][destination.c] = previewCard;
  const players = state.players.map((entry, index)=>({
    ...entry,
    hand:index === playerIndex ? entry.hand.filter(item=>String(item.iid) !== String(card.iid)) : entry.hand
  }));
  return {state:{...state, board, players}, card:previewCard};
}

export function legalCommandTemplates(state, playerIndex){
  const player = Number(playerIndex);
  if(player !== 0 && player !== 1) return [];
  const commands = [];
  if(state.phase === 'coin'){
    if(Number(state.coinFlip?.winner) !== player) return commands;
    return [
      {type:'CHOOSE_TURN_ORDER', payload:{goFirst:true}},
      {type:'CHOOSE_TURN_ORDER', payload:{goFirst:false}}
    ];
  }
  if(state.pendingHandLimit){
    if(Number(state.pendingHandLimit.playerIndex) !== player) return [];
    const eligible = state.players[player].hand.filter(card=>!isProtectedHandLimitCard(card, player));
    const required = Number(state.pendingHandLimit.required);
    const combinations = [];
    function choose(start, selected){
      if(selected.length === required){
        combinations.push(selected.map(card=>card.iid));
        return;
      }
      for(let index = start; index <= eligible.length - (required - selected.length); index += 1){
        choose(index + 1, [...selected, eligible[index]]);
      }
    }
    choose(0, []);
    return combinations.map(discardedIids=>({
      type:'DISCARD_TO_HAND_LIMIT',
      payload:{discardedIids}
    }));
  }
  const prompt = state.pendingPrompt;
  if(prompt){
    if(Number(prompt.playerIndex) !== player) return [];
    if(prompt.type === 'REACTION'){
      commands.push({type:'ANSWER_PROMPT', payload:{promptId:prompt.promptId, choice:'DECLINE'}});
      for(const option of prompt.options || []){
        for(const mode of option.modes || []){
          commands.push({
            type:'ANSWER_PROMPT',
            payload:{promptId:prompt.promptId, choice:mode, reactionIid:option.reactionIid}
          });
        }
      }
    }else if(prompt.type === 'MODAL_CHOICE'){
      for(const option of prompt.options || []){
        commands.push({type:'ANSWER_PROMPT', payload:{promptId:prompt.promptId, choice:option.value}});
      }
      if(prompt.cancellable) commands.push({type:'ANSWER_PROMPT', payload:{promptId:prompt.promptId, cancel:true}});
    }else if(['BOARD_TARGET', 'CARD_SELECTION', 'HAND_SELECTION'].includes(prompt.type)){
      const eligible = prompt.eligibleIids || [];
      const min = Number(prompt.min || 0);
      const max = Number(prompt.max || 1);
      if(max === 1){
        for(const selectedIid of eligible){
          commands.push({type:'ANSWER_PROMPT', payload:{promptId:prompt.promptId, selectedIid}});
        }
      }else{
        function choose(start, selected){
          // Optional multi-select effects (for example Johnathan Kirby's
          // "up to 2" deck search) must expose every combination from min
          // through max. The previous min-only base case emitted only [] when
          // min was zero, despite projecting selectable cards to the client.
          if(selected.length >= min){
            commands.push({type:'ANSWER_PROMPT', payload:{promptId:prompt.promptId, selectedIids:selected}});
          }
          if(selected.length >= max) return;
          for(let index = start; index < eligible.length; index += 1){
            choose(index + 1, [...selected, eligible[index]]);
          }
        }
        choose(0, []);
      }
      if(prompt.cancellable) commands.push({type:'ANSWER_PROMPT', payload:{promptId:prompt.promptId, cancel:true}});
    }else if(prompt.type === 'BOARD_DESTINATION'){
      if(prompt.multi){
        const eligible = prompt.eligible || [];
        const min = Number(prompt.min || 0);
        const max = Number(prompt.max || 1);
        function chooseDestinations(start, selected){
          if(selected.length >= min){
            commands.push({type:'ANSWER_PROMPT', payload:{promptId:prompt.promptId, destinations:selected}});
          }
          if(selected.length >= max) return;
          for(let index = start; index < eligible.length; index += 1){
            chooseDestinations(index + 1, [...selected, eligible[index]]);
          }
        }
        chooseDestinations(0, []);
      }else{
        for(const destination of prompt.eligible || []){
          commands.push({type:'ANSWER_PROMPT', payload:{promptId:prompt.promptId, destination}});
        }
      }
      if(prompt.cancellable) commands.push({type:'ANSWER_PROMPT', payload:{promptId:prompt.promptId, cancel:true}});
    }else if(prompt.type === 'ZONE_SELECTION'){
      for(const zone of prompt.eligibleZones || []){
        commands.push({type:'ANSWER_PROMPT', payload:{promptId:prompt.promptId, zone}});
      }
      if(prompt.cancellable) commands.push({type:'ANSWER_PROMPT', payload:{promptId:prompt.promptId, cancel:true}});
    }
    return commands;
  }
  if(state.outcome || state.activePlayer !== player) return commands;
  for(const card of state.players[player].deck){
    if(!['07', '28'].includes(String(card.id || ''))) continue;
    if(String(card.type || '') === 'Supporter'
      && Number(state.supportersSetForCapThisTurn?.[player] || 0) >= MAX_SUPPORTERS_SET_PER_TURN) continue;
    if(String(card.id || '') === '28' && Number(state.players[player].polishDeckSetTurn) === Number(state.turn)) continue;
    for(const destination of openBoardDestinations(state, candidate=>{
      const owner = rowOwner(state, candidate.z, candidate.r);
      if(String(card.id) === '07') return owner === player;
      return [-1, player].includes(owner)
        && !opponentAlondraBlocksSupporterSet(state, player, candidate);
    })){
      // cardId is safe to disclose only because this command is sent to the
      // owning player. Keeping it beside the opaque iid makes the shipping
      // deck controls independent of a second private-card payload arriving
      // in exactly the same render tick.
      commands.push({type:'SET_CARD_FROM_DECK', cardId:String(card.id || ''), payload:{cardIid:card.iid, destination}});
    }
  }
  for(const card of state.players[player].hand){
    if(card.counters?.pierogiCounter === true){
      for(const destination of openBoardDestinations(state, candidate=>{
        const owner = rowOwner(state, candidate.z, candidate.r);
        return owner === -1 || owner === (player === 0 ? 1 : 0);
      })){
        if(zoneActionBlock(state, player, destination.z)) continue;
        commands.push({type:'SET_CARD', payload:{cardIid:card.iid, destination}});
      }
    }
    if(card.counters?.adaptiveToken === true){
      const destinations = openBoardDestinations(state, candidate=>{
        const owner = rowOwner(state, candidate.z, candidate.r);
        return owner === -1 || owner === player;
      });
      for(const destination of destinations){
        if(zoneActionBlock(state, player, destination.z)) continue;
        for(const declaredType of ['Supporter', 'Initiator', 'Improvisor', 'Coordinator', 'Dauntless']){
          for(const declaredAffiliation of ['reality', 'third_great_war', 'expanded_worlds', 'eventide']){
            for(const declaredRarity of ['circle', 'triangle', 'square', 'star']){
              for(const placementType of ['SET', 'CONSOLIDATED']){
                if(declaredType === 'Supporter'
                  && placementType === 'SET'
                  && Number(state.supportersSetForCapThisTurn?.[player] || 0) >= MAX_SUPPORTERS_SET_PER_TURN) continue;
                commands.push({
                  type:'SET_ADAPTIVE_TOKEN',
                  payload:{
                    cardIid:card.iid,
                    destination,
                    declaredType,
                    declaredAffiliation,
                    declaredRarity,
                    placementType
                  }
                });
              }
            }
          }
        }
      }
    }
  }
  const setDestinations = openBoardDestinations(state, destination=>ownSetDestination(state, player, destination));
  for(const card of state.players[player].hand){
    if(card.counters?.adaptiveToken === true) continue;
    if(Number(state.supportersSetForCapThisTurn?.[player] || 0) >= MAX_SUPPORTERS_SET_PER_TURN) break;
    if(state.supportersSetThisTurn[player]
      >= Math.min(MAX_SUPPORTERS_SET_PER_TURN, state.baseSupportersPerTurn + Number(state.extraSupportersThisTurn[player] || 0))) break;
    if(String(card.type || '') !== 'Supporter' || Number(card.cost || 0) !== 0) continue;
    if(String(card.id || '') === '70' && card.statuses?.includes('GUERILLA_INFILTRATING')) continue;
    for(const destination of setDestinations){
      if(zoneActionBlock(state, player, destination.z)) continue;
      if(state.gameSettings?.pressureCardReworks !== true && String(card.id) === '65' && destination.r !== 1) continue;
      const blockedByAlondra = opponentAlondraBlocksSupporterSet(state, player, destination);
      if(blockedByAlondra && String(card.type || '') === 'Supporter') continue;
      const preview = placementPreview(state, player, card, destination);
      if(!openingChoiceAvailable(preview.state, preview.card, player, 'WHEN_SET')) continue;
      commands.push({type:'SET_CARD', payload:{cardIid:card.iid, destination}});
    }
  }
  const moraleAllowsConsolidation = moraleConsolidationsUsed(state, player) < moraleConsolidationLimit(state, player);
  for(const card of state.players[player].hand){
    if(!moraleAllowsConsolidation) continue;
    if(String(card.type || '') === 'Supporter') continue;
    const tributeCandidates = boardEntries(state)
      .map(entry=>({entry, eligibility:canUseAsConsolidationTribute(state, entry, player, card)}))
      .filter(item=>item.eligibility.ok)
      .map(item=>({...item.entry, reinforcement:item.eligibility.reinforcement}));
    const cost = effectiveConsolidationCost(state, card, player);
    const combinations = [];
    function collect(start, selected, reinforcement){
      // A zero reinforcement amount still uses a real tribute square. The
      // isolated fixture waives only the numeric cost, not consolidation's
      // consume/replace interaction or its production presentation path.
      if(selected.length > 0 && reinforcement >= cost){
        combinations.push(selected);
        return;
      }
      for(let index = start; index < tributeCandidates.length; index += 1){
        collect(
          index + 1,
          [...selected, tributeCandidates[index]],
          reinforcement + tributeCandidates[index].reinforcement
        );
        if(combinations.length >= 512) return;
      }
    }
    collect(0, [], 0);
    for(const tributes of combinations){
      for(const destination of tributes){
        if(zoneActionBlock(state, player, destination.z)) continue;
        if(!ownSetDestination(state, player, destination)) continue;
        if(squareStatuses(state, destination, 'CONSOLIDATION_BLOCKED').some(status=>
          Number(status.blockedPlayer) === player
        )) continue;
        if(squareStatuses(state,destination,'FIELD_LEAVE_LOCKED').some(status=>Number(status.blockedPlayer)===player)
          && !isEffectImmutable(destination.card)&&!isImmuneToOpponentEffects(destination.card,state))continue;
        if(tributes.some(tribute=>squareStatuses(state, tribute, 'CONSOLIDATION_BLOCKED').some(status=>
          Number(status.blockedPlayer) === player
        ))) continue;
        if(tributes.some(tribute=>squareStatuses(state,tribute,'FIELD_LEAVE_LOCKED').some(status=>Number(status.blockedPlayer)===player)
          && !isEffectImmutable(tribute.card)&&!isImmuneToOpponentEffects(tribute.card,state)))continue;
        const colomboRestricted = boardEntries(state).some(entry=>
          entry.z === destination.z
          && runtimeRuleId(entry.card) === '53'
          && controllerOf(entry.card) !== player
          && !entry.card.statuses?.includes('EFFECTS_SUPPRESSED')
        );
        if(colomboRestricted && tributes.some(entry=>entry.z !== destination.z)) continue;
        const remainingCharacters = boardEntries(state).filter(entry=>
          entry.z === destination.z
          && controllerOf(entry.card) === player
          && structuralCardType(state, entry.card) !== 'Supporter'
          && !tributes.some(tribute=>String(tribute.card.iid) === String(entry.card.iid))
        );
        if(String(card.id || '') === '45'){
          if(remainingCharacters.length) continue;
          if(state.gameSettings?.pressureCardReworks !== true && boardEntries(state).some(entry=>
            String(entry.card.id || '') === '45'
            && Number(entry.card.owner) === player
            && !tributes.some(tribute=>String(tribute.card.iid) === String(entry.card.iid))
          )) continue;
        }else if(remainingCharacters.some(entry=>
          String(entry.card.id || '') === '45'
          && entry.card.faceDown !== true
          && !entry.card.statuses?.includes('EFFECTS_SUPPRESSED')
        )) continue;
        const preview = placementPreview(
          state,
          player,
          card,
          {z:destination.z, r:destination.r, c:destination.c},
          tributes.map(entry=>entry.card.iid)
        );
        // Placement legality is independent of whether an auto-activated
        // effect currently has a legal target. The card is consolidated first;
        // an unavailable optional/activate effect then cleanly fizzles, exactly
        // as it does in the shipping single-player flow.
        commands.push({
          type:'CONSOLIDATE_CARD',
          payload:{
            cardIid:card.iid,
            tributeIids:tributes.map(entry=>entry.card.iid),
            destination:{z:destination.z, r:destination.r, c:destination.c}
          }
        });
        const permission = state.statuses.some(status=>
          status?.type === 'FACE_DOWN_CONSOLIDATION_PERMISSION'
          && Number(status.playerIndex) === player
          && Number(status.zone) === destination.z
          && Number(status.remaining || 0) > 0
        );
        if(permission){
          commands.push({
            type:'CONSOLIDATE_CARD',
            payload:{
              cardIid:card.iid,
              tributeIids:tributes.map(entry=>entry.card.iid),
              destination:{z:destination.z, r:destination.r, c:destination.c},
              faceDown:true
            }
          });
        }
      }
    }
  }
  for(const entry of state.board.flatMap((zone, z)=>
    zone.flatMap((row, r)=>row.map((card, c)=>card ? {card, z, r, c} : null).filter(Boolean))
  )){
    if(controllerOf(entry.card) !== player) continue;
    // Single-player parity: during the active main phase a player may manually
    // discard any controlled board card except immutable ALPINE Infantry.
    if(String(entry.card.id || '') !== '76'){
      commands.push({
        type:'DISCARD_CARD',
        payload:{targetIid:entry.card.iid, sourceIid:entry.card.iid, reason:'MANUAL_DISCARD'}
      });
    }
    if(entry.card.faceDown === true){
      commands.push({type:'FLIP_CARD', payload:{cardIid:entry.card.iid}});
      continue;
    }
    const rule = ruleForCard(entry.card, state);
    if(rule?.timings?.includes('ACTIVATE')
      && rule.program
      && !isEffectSourceSuppressed(state, entry)
      && !zoneActionBlock(state, player, entry.z)){
      if(!rule.maxUses || Number(entry.card.counters?.effectUses || 0) < Number(rule.maxUses)){
        if(rule.oncePerTurn && Number(entry.card.counters?.lastEffectTurn) === state.turn) continue;
        if(rule.blockedWhileStatus && entry.card.statuses?.includes(rule.blockedWhileStatus)) continue;
        if(!supporterActivationAvailable(state, entry.card, player)) continue;
        if(!openingChoiceAvailable(state, entry.card, player, 'ACTIVATE')) continue;
        commands.push({
          type:'ACTIVATE_EFFECT',
          cardId:runtimeRuleId(entry.card),
          manualOnly:rule.manualOnly === true,
          payload:{sourceIid:entry.card.iid}
        });
      }
    }
    const movementGrant = movementGrantFor(state, entry.card.iid);
    if(movementGrant){
      if(availableMovementGrant(state, entry, player)){
        const safeRow = player === 0 ? 2 : 0;
        for(const destination of openBoardDestinations(state, candidate=>
          Math.abs(Number(candidate.z) - Number(entry.z)) === 1
          && [1, safeRow].includes(Number(candidate.r))
        )){
          commands.push({type:'MOVE_CARD', payload:{cardIid:entry.card.iid, destination}});
        }
      }
    }else{
      if(rule?.customCommand === 'MOVE_AND_DRAW'
        && Number(entry.card.counters?.lastMoveTurn) !== state.turn){
        for(const destination of openBoardDestinations(state)){
          commands.push({type:'MOVE_CARD', payload:{cardIid:entry.card.iid, destination}});
        }
      }
      if(rule?.customCommand === 'EXPEDITIONARY_MOVE'
        && Number(entry.card.counters?.lastMoveTurn) !== state.turn){
        for(const destination of openBoardDestinations(state, candidate=>{
          const owner = rowOwner(state, candidate.z, candidate.r);
          return owner === -1 || owner === player;
        })){
          commands.push({type:'MOVE_CARD', payload:{cardIid:entry.card.iid, destination}});
        }
      }
      if(state.landscapeId === 'igb7'
        && String(entry.card.affiliation || '') === 'eventide'
        && entry.card.faceDown !== true
        && Number(entry.card.counters?.landscapeMoveTurn) !== state.turn
        && Number(entry.card.counters?.lastMoveTurn) !== state.turn){
        for(const destination of openBoardDestinations(state)){
          commands.push({type:'MOVE_CARD', payload:{cardIid:entry.card.iid, destination}});
        }
      }
    }
  }
  if(state.landscapeId === 'igb16'){
    const handIids = state.players[player].hand.filter(card=>!isEffectImmutable(card)).map(card=>card.iid);
    const targets = boardEntries(state).filter(entry=>
      controllerOf(entry.card) === player && entry.card.faceDown !== true && !isEffectImmutable(entry.card)
    );
    for(const discardIid of handIids){
      for(const target of targets){
        commands.push({
          type:'ACTIVATE_LANDSCAPE',
          payload:{discardIids:[discardIid], targetIid:target.card.iid}
        });
      }
    }
  }
  if(state.landscapeId === 'igb17'
    && Number(state.landscapeState.oncePerGameUses[player] || 0) < 1){
    const copyableIds = new Set(['10', '11', '15', '19', '23', '57', '77', 'bh02', 'bh07', 'bh08', 'bh11']);
    const sources = boardEntries(state).filter(entry=>
      controllerOf(entry.card) === player
      && effectiveCardType(state, entry.card) === 'Coordinator'
      && entry.card.faceDown !== true
      && entry.card.counters?.whisperLandscapeToken !== true
      && copyableIds.has(runtimeRuleId(entry.card))
    );
    const hand = state.players[player].hand.filter(card=>!isEffectImmutable(card));
    for(const source of sources){
      for(let first = 0; first < hand.length; first += 1){
        for(let second = first + 1; second < hand.length; second += 1){
          commands.push({
            type:'ACTIVATE_LANDSCAPE',
            payload:{
              sourceIid:source.card.iid,
              discardIids:[hand[first].iid, hand[second].iid]
            }
          });
        }
      }
    }
  }
  commands.push({type:'END_TURN', payload:{}});
  commands.push({type:'CONCEDE', payload:{}});
  return commands;
}
