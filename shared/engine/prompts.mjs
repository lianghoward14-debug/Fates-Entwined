import {
  boardEntries,
  controllerOf,
  findCard,
  findBoardCard,
  isBoardCoordinate,
  openBoardDestinations,
  rowOwner,
  squareStatuses
} from './selectors.mjs';
import {
  canTarget,
  effectiveCardType,
  isEffectImmutable
} from './modifiers.mjs';
import {cardRule} from './cards/registry.mjs';

function inferredTargetOperation(frame, filter){
  if(filter.targetable) return String(filter.targetable);
  const next = frame?.program?.[Number(frame.instructionIndex || 0) + 1];
  if(next?.kind === 'OPERATION' && next.targeted === true && next.operation?.type){
    return String(next.operation.type);
  }
  return '';
}

function referencesUnavailableLocal(value, unavailableLocals){
  if(typeof value === 'string' && value.startsWith('$')) return unavailableLocals.has(value.slice(1));
  if(Array.isArray(value)) return value.some(item=>referencesUnavailableLocal(item, unavailableLocals));
  if(value && typeof value === 'object') return Object.values(value).some(item=>referencesUnavailableLocal(item, unavailableLocals));
  return false;
}

export function openingProgramChoiceAvailable(state, frame, program){
  if(!Array.isArray(program) || !program.length) return false;
  const unavailableLocals = new Set();
  for(let instructionIndex = 0; instructionIndex < program.length; instructionIndex += 1){
    const instruction = program[instructionIndex];
    if(!instruction) continue;
    const copiedFrame = {...frame, instructionIndex, program, locals:{...(frame?.locals || {})}};
    let eligibleCount = null;
    let minimum = 1;
    if(instruction.kind === 'SELECT_BOARD'){
      eligibleCount = eligibleBoardTargets(state, copiedFrame, instruction.filter).length;
      minimum = Math.max(0, Number(instruction.min ?? (instruction.optional ? 0 : 1)) || 0);
    }else if(instruction.kind === 'SELECT_CARDS' || instruction.kind === 'SELECT_HAND'){
      const filter = instruction.kind === 'SELECT_HAND'
        ? {...instruction.filter, locations:['hand']}
        : instruction.filter;
      const eligible = eligibleCardTargets(state, copiedFrame, filter);
      eligibleCount = eligible.length;
      const exactLimit = Number(instruction.exactUpToAvailable);
      minimum = Number.isInteger(exactLimit) && exactLimit >= 0
        ? Math.min(exactLimit, eligible.length)
        : Math.max(0, Number(instruction.min ?? (instruction.optional ? 0 : 1)) || 0);
    }else if(instruction.kind === 'SELECT_DESTINATION'){
      eligibleCount = eligibleDestinations(state, copiedFrame, instruction.filter).length;
    }else if(instruction.kind === 'SELECT_DESTINATIONS'){
      eligibleCount = eligibleDestinations(state, copiedFrame, instruction.filter).length;
      minimum = Math.max(0, Number(instruction.min ?? (instruction.optional ? 0 : 1)) || 0);
    }else if(instruction.kind === 'SELECT_ZONE'){
      eligibleCount = eligibleZones(state, copiedFrame, instruction.filter).length;
    }else if(instruction.kind === 'CHOOSE_OPTION'){
      return Array.isArray(instruction.options) && instruction.options.length > 0;
    }else if(instruction.kind === 'OPERATION'){
      if(referencesUnavailableLocal(instruction.operation, unavailableLocals)) continue;
      return true;
    }else{
      return true;
    }
    if(eligibleCount >= minimum && eligibleCount > 0) return true;
    if(eligibleCount < minimum) return false;
    if(instruction.local) unavailableLocals.add(String(instruction.local));
    if(String(instruction.cancelBehavior || 'END_EFFECT') !== 'CONTINUE') return false;
  }
  return false;
}

function copiedEffectAvailable(state, frame, rule){
  if(rule?.program?.some(instruction=>instruction?.kind === 'COPY_EFFECT')) return false;
  const sharedKey = String(rule?.sharedUseLimit?.key || '').toLowerCase();
  if(sharedKey){
    const uses = Number(state.statuses.find(status=>
      status?.type === 'RULE_USE_COUNTER'
      && status.statusId === `rule-use:${sharedKey}:p${frame.controller}`
    )?.uses || 0) || 0;
    if(uses >= Number(rule.sharedUseLimit.maxUses || 0)) return false;
  }
  const turnUseKey = String(rule?.whenSetTurnUseKey || '').toLowerCase();
  if(turnUseKey && state.statuses.some(status=>
    status?.statusId === `turn-use:${turnUseKey}:p${frame.controller}`
    && Number(status.turn) === Number(state.turn)
  )) return false;
  return openingProgramChoiceAvailable(state, frame, rule?.program);
}

export function eligibleBoardTargets(state, frame, filter = {}){
  const source = findBoardCard(state, frame.sourceIid);
  const targetOperation = inferredTargetOperation(frame, filter);
  return boardEntries(state)
    .filter(entry=>{
      if(filter.sameZone && (!source || entry.z !== source.z)) return false;
      if(filter.adjacent && (!source || entry.z !== source.z
        || Math.abs(entry.r - source.r) + Math.abs(entry.c - source.c) !== 1)) return false;
      if(filter.adjacentOrDiagonal && (!source || entry.z !== source.z
        || Math.max(Math.abs(entry.r - source.r), Math.abs(entry.c - source.c)) !== 1)) return false;
      if(Number.isInteger(filter.row) && entry.r !== filter.row) return false;
      if(filter.controller && controllerOf(entry.card) !== frame.controller) return false;
      if(filter.opponent && controllerOf(entry.card) === frame.controller) return false;
      if(filter.supporter && effectiveCardType(state, entry.card) !== 'Supporter') return false;
      if(filter.character && effectiveCardType(state, entry.card) === 'Supporter') return false;
      if(filter.faceUp && entry.card.faceDown === true) return false;
      if(filter.effectMutable && isEffectImmutable(entry.card)) return false;
      if(filter.movable && (
        entry.card.cantBeMoved === true
        || (entry.card.statuses || []).includes('CANNOT_MOVE')
        || isEffectImmutable(entry.card)
      )) return false;
      if(targetOperation){
        const targetCheck = canTarget(state, source?.card, entry.card, {
          type:targetOperation,
          sourceController:frame.controller,
          sourceIid:frame.sourceIid,
          targetIid:entry.card.iid
        });
        if(!targetCheck.ok) return false;
        if(targetOperation === 'DISCARD_CARD'
          && String(entry.card.id || '') === '62'
          && controllerOf(entry.card) !== frame.controller){
          const costs = eligibleCardTargets(state, frame, {
            locations:['hand'],
            playerIndex:'controller',
            targetable:'DISCARD_CARD'
          });
          if(costs.length < 2) return false;
        }
      }
      if(filter.requiresDestination){
        const targetFrame = {...frame, sourceIid:entry.card.iid};
        if(!eligibleDestinations(state, targetFrame, filter.requiresDestination).length) return false;
      }
      if(filter.excludeSource && String(entry.card.iid) === String(frame.sourceIid)) return false;
      if(filter.ruleTiming && !cardRule(entry.card.id)?.timings?.includes(String(filter.ruleTiming))) return false;
      if(filter.copyEffectAvailable){
        const copiedRule = cardRule(entry.card.id);
        if(!copiedRule || !copiedEffectAvailable(state, frame, copiedRule)) return false;
      }
      return true;
    })
    .map(entry=>entry.card.iid)
    .sort();
}

export function eligibleCardTargets(state, frame, filter = {}){
  const locations = Array.isArray(filter.locations) && filter.locations.length
    ? filter.locations
    : ['hand'];
  const entries = [];
  const targetOperation = inferredTargetOperation(frame, filter);
  const source = findBoardCard(state, frame.sourceIid);
  if(locations.includes('board')) entries.push(...boardEntries(state));
  for(const playerIndex of [0, 1]){
    for(const pile of ['deck', 'hand', 'discard']){
      if(!locations.includes(pile)) continue;
      for(const card of state.players[playerIndex][pile]){
        entries.push({card, zone:pile, playerIndex});
      }
    }
  }
  return entries.filter(entry=>{
    const entryController = controllerOf(entry.card);
    const wantedPlayer = filter.playerIndex === 'opponent'
      ? (frame.controller === 0 ? 1 : 0)
      : (filter.playerIndex === 'controller' ? frame.controller : filter.playerIndex);
    if(Number.isInteger(wantedPlayer)){
      const actualPlayer = entry.zone === 'board' ? entryController : entry.playerIndex;
      if(actualPlayer !== wantedPlayer) return false;
    }
    if(filter.controller && entryController !== frame.controller) return false;
    if(filter.opponent && entryController === frame.controller) return false;
    if(filter.type && String(entry.card.type || '') !== String(filter.type)) return false;
    if(filter.cardId && String(entry.card.id || '') !== String(filter.cardId)) return false;
    if(filter.character && effectiveCardType(state, entry.card) === 'Supporter') return false;
    if(filter.affiliation && String(entry.card.affiliation || '') !== String(filter.affiliation)) return false;
    if(filter.rarity && String(entry.card.rarity || '') !== String(filter.rarity)) return false;
    if(filter.excludeRarity && String(entry.card.rarity || '') === String(filter.excludeRarity)) return false;
    if(filter.excludeSource && String(entry.card.iid) === String(frame.sourceIid)) return false;
    if(filter.excludeCardId && String(entry.card.id) === String(filter.excludeCardId)) return false;
    if(filter.ruleTiming && !cardRule(entry.card.id)?.timings?.includes(String(filter.ruleTiming))) return false;
    if(filter.copyEffectAvailable){
      const copiedRule = cardRule(entry.card.id);
      if(!copiedRule || !copiedEffectAvailable(state, frame, copiedRule)) return false;
    }
    if(targetOperation){
      const targetCheck = canTarget(state, source?.card, entry.card, {
        type:targetOperation,
        sourceController:frame.controller,
        sourceIid:frame.sourceIid,
        targetIid:entry.card.iid
      });
      if(!targetCheck.ok) return false;
    }
    return true;
  }).map(entry=>entry.card.iid).sort();
}

export function eligibleZones(_state, _frame, filter = {}){
  const requested = Array.isArray(filter.zones) ? filter.zones : [0, 1, 2];
  return [...new Set(requested.map(Number).filter(zone=>Number.isInteger(zone) && zone >= 0 && zone <= 2))].sort();
}

function ownSide(playerIndex, destination){
  return destination.r === 1 || destination.owner === Number(playerIndex);
}

export function eligibleDestinations(state, frame, filter = {}){
  const source = findBoardCard(state, frame.sourceIid);
  if(filter.safeSquareSlot){
    if(!source || ![0, 1].includes(Number(frame.controller))) return [];
    const z = Number(source.z);
    const owner = Number(frame.controller);
    const zone = state.board?.[z] || [];
    const rowOwners = state.geometry?.rowOwners?.[z] || [];
    const existing = new Set((state.geometry?.playableExtraSquares || [])
      .filter(square=>Number(square.z) === z)
      .map(square=>`${Number(square.r)}:${Number(square.c)}`));
    let r = rowOwners.findIndex((rowOwner, rowIndex)=>
      rowIndex >= 3
        && Number(rowOwner) === owner
        && [0, 1, 2].some(c=>!existing.has(`${rowIndex}:${c}`))
    );
    if(r < 0) r = zone.length;
    return [0, 1, 2]
      .filter(c=>!existing.has(`${r}:${c}`))
      .map(c=>({z, r, c}));
  }
  const nextInstruction = frame?.program?.[Number(frame.instructionIndex || 0) + 1];
  const freeSetIid = nextInstruction?.kind === 'FREE_SET'
    ? (String(nextInstruction.cardIid || '').startsWith('$')
        ? frame.locals?.[String(nextInstruction.cardIid).slice(1)]
        : nextInstruction.cardIid)
    : null;
  const freeSetCard = freeSetIid ? findCard(state, freeSetIid)?.card || null : null;
  const accept = destination=>{
    const enriched = {...destination, owner:rowOwner(state, destination.z, destination.r)};
    if(filter.sameZone && (!source || destination.z !== source.z)) return false;
    if(filter.ownSide && !ownSide(frame.controller, enriched)) return false;
    if(filter.opponentSide && enriched.owner !== (frame.controller === 0 ? 1 : 0)) return false;
    if(filter.adjacent && (!source || destination.z !== source.z
      || Math.abs(destination.r - source.r) + Math.abs(destination.c - source.c) !== 1)) return false;
    if(filter.open && state.board[destination.z][destination.r][destination.c]) return false;
    if(filter.excludePermanentlyBlocked
      && squareStatuses(state, destination, 'PERMANENTLY_BLOCKED').length) return false;
    if(freeSetCard){
      if(squareStatuses(state, destination, 'PERMANENTLY_BLOCKED').length) return false;
      if(String(freeSetCard.id || '') === '65' && Number(destination.r) !== 1) return false;
      if(String(freeSetCard.type || '') === 'Supporter'){
        const blockedByAlondra = boardEntries(state).some(entry=>
          entry.z === Number(destination.z)
          && String(entry.card.id || '') === '14'
          && controllerOf(entry.card) !== Number(frame.controller)
          && entry.card.faceDown !== true
          && !entry.card.statuses?.includes('EFFECTS_SUPPRESSED')
          && Math.abs(entry.r - Number(destination.r))
            + Math.abs(entry.c - Number(destination.c)) === 1
        );
        if(blockedByAlondra) return false;
      }
    }
    return true;
  };
  if(filter.includeOccupied){
    const result = [];
    (state.board || []).forEach((zone, z)=>{
      (zone || []).forEach((row, r)=>{
        (row || []).forEach((_card, c)=>{
          const destination = {z, r, c};
          if(isBoardCoordinate(state, destination) && accept(destination)) result.push(destination);
        });
      });
    });
    return result;
  }
  if(filter.openOrControlled){
    const destinations = [];
    (state.board || []).forEach((zone, z)=>{
      (zone || []).forEach((row, r)=>{
        (row || []).forEach((card, c)=>{
          const destination = {z, r, c};
          if(!isBoardCoordinate(state, destination) || !accept(destination)) return;
          if(!card || controllerOf(card) === frame.controller) destinations.push(destination);
        });
      });
    });
    return destinations;
  }
  return openBoardDestinations(state, destination=>{
    return accept(destination);
  });
}

export function destinationKey(destination){
  return [Number(destination?.z), Number(destination?.r), Number(destination?.c)].join(':');
}
