import {ENGINE_VERSION, PROMPT_TYPES, RULESET_VERSION, SCHEMA_VERSION} from './constants.mjs';
import {allCardEntries, boardEntries} from './selectors.mjs';
import {stableStringify} from './serialization.mjs';

function issue(path, message){
  return {path, message};
}

export function collectInvariantViolations(state){
  const violations = [];
  if(!state || typeof state !== 'object') return [issue('', 'state must be an object')];
  if(state.schemaVersion !== SCHEMA_VERSION) violations.push(issue('schemaVersion', `must equal ${SCHEMA_VERSION}`));
  if(state.engineVersion !== ENGINE_VERSION) violations.push(issue('engineVersion', `must equal ${ENGINE_VERSION}`));
  if(state.rulesetVersion !== RULESET_VERSION) violations.push(issue('rulesetVersion', `must equal ${RULESET_VERSION}`));
  if(!String(state.matchId || '')) violations.push(issue('matchId', 'must be present'));
  if(!Number.isInteger(state.revision) || state.revision < 0) violations.push(issue('revision', 'must be a non-negative integer'));
  if(!Number.isInteger(state.turn) || state.turn < 1) violations.push(issue('turn', 'must be a positive integer'));
  if(!Number.isInteger(state.maxTurns) || state.maxTurns < 1) violations.push(issue('maxTurns', 'must be a positive integer'));
  if(!Number.isInteger(state.baseHandLimit) || state.baseHandLimit < 1) violations.push(issue('baseHandLimit', 'must be a positive integer'));
  if(!Number.isInteger(state.baseSupportersPerTurn) || state.baseSupportersPerTurn < 0){
    violations.push(issue('baseSupportersPerTurn', 'must be a non-negative integer'));
  }
  if(!Array.isArray(state.supportersSetThisTurn)
    || state.supportersSetThisTurn.length !== 2
    || state.supportersSetThisTurn.some(value=>!Number.isInteger(value) || value < 0)){
    violations.push(issue('supportersSetThisTurn', 'must contain two non-negative integer counters'));
  }
  if(state.supportersSetForCapThisTurn !== undefined
    && (!Array.isArray(state.supportersSetForCapThisTurn)
      || state.supportersSetForCapThisTurn.length !== 2
      || state.supportersSetForCapThisTurn.some(value=>!Number.isInteger(value) || value < 0))){
    violations.push(issue('supportersSetForCapThisTurn', 'must contain two non-negative integer counters'));
  }
  for(const field of [
    'supportersSetTotal',
    'supporterEffectsActivated',
    'cardsPlacedThisTurn',
    'cardsPlacedLastTurn',
    'fateReductionEffectUses',
    'extraSupportersThisTurn',
    'queuedExtraSupporters'
  ]){
    if(!Array.isArray(state[field])
      || state[field].length !== 2
      || state[field].some(value=>!Number.isInteger(value) || value < 0)){
      violations.push(issue(field, 'must contain two non-negative integer counters'));
    }
  }
  if(state.activePlayer !== 0 && state.activePlayer !== 1) violations.push(issue('activePlayer', 'must be 0 or 1'));
  if(typeof state.landscapeId !== 'string') violations.push(issue('landscapeId', 'must be a string'));
  if(!state.landscapeState || typeof state.landscapeState !== 'object'){
    violations.push(issue('landscapeState', 'must be an object'));
  }else{
    for(const field of ['consolidations', 'drawPhaseCounts', 'supporterEffectsThisTurn', 'handTurnCounts', 'oncePerGameUses']){
      if(!Array.isArray(state.landscapeState[field])
        || state.landscapeState[field].length !== 2
        || state.landscapeState[field].some(value=>!Number.isInteger(value) || value < 0)){
        violations.push(issue(`landscapeState.${field}`, 'must contain two non-negative integer counters'));
      }
    }
    if(state.landscapeState.targetZone !== null
      && ![0, 1, 2].includes(state.landscapeState.targetZone)){
      violations.push(issue('landscapeState.targetZone', 'must be null or a zone index'));
    }
  }
  if(!['coin', 'main', 'ended'].includes(state.phase)) violations.push(issue('phase', 'must be coin, main, or ended'));
  if(state.phase === 'coin'){
    if(!state.coinFlip || ![0, 1].includes(state.coinFlip.winner)){
      violations.push(issue('coinFlip', 'coin phase requires a winner'));
    }
    if(!['HEADS', 'TAILS'].includes(state.coinFlip?.face)){
      violations.push(issue('coinFlip.face', 'must be HEADS or TAILS'));
    }
    if(state.coinFlip?.choice !== null || state.coinFlip?.startingPlayer !== null){
      violations.push(issue('coinFlip', 'unresolved coin phase cannot contain a turn choice'));
    }
  }
  if(state.phase !== 'coin' && state.coinFlip){
    if(![0, 1].includes(state.coinFlip.winner) || ![0, 1].includes(state.coinFlip.startingPlayer)){
      violations.push(issue('coinFlip', 'resolved coin flip must retain winner and starting player'));
    }
    if(typeof state.coinFlip.choice !== 'boolean'){
      violations.push(issue('coinFlip.choice', 'resolved coin flip choice must be boolean'));
    }
  }
  if(!Array.isArray(state.players) || state.players.length !== 2){
    violations.push(issue('players', 'must contain exactly two players'));
  }else{
    const playerIds = state.players.map(player=>String(player?.id || ''));
    if(playerIds.some(id=>!id)) violations.push(issue('players', 'each player must have an id'));
    if(new Set(playerIds).size !== playerIds.length) violations.push(issue('players', 'player ids must be unique'));
    state.players.forEach((player, playerIndex)=>{
      for(const pile of ['deck', 'hand', 'discard', 'limbo']){
        if(!Array.isArray(player?.[pile])) violations.push(issue(`players.${playerIndex}.${pile}`, 'must be an array'));
      }
    });
  }
  if(!Array.isArray(state.board) || state.board.length !== 3){
    violations.push(issue('board', 'must contain exactly three zones'));
  }else{
    state.board.forEach((zone, zoneIndex)=>{
      if(!Array.isArray(zone) || zone.length < 3){
        violations.push(issue(`board.${zoneIndex}`, 'must contain at least three rows'));
        return;
      }
      const expanded = state.gameSettings?.zoneControlRework === true
        && state.gameSettings?.expandedContestedRow === true;
      const uniformFour = expanded && state.gameSettings?.zoneLayout444 === true;
      zone.forEach((row, rowIndex)=>{
        const expectedColumns = rowIndex < 3
          ? (uniformFour ? 4 : (expanded && rowIndex === 1 ? 6 : 3))
          : 3;
        if(!Array.isArray(row) || row.length !== expectedColumns){
          violations.push(issue(`board.${zoneIndex}.${rowIndex}`, `must contain exactly ${expectedColumns} columns`));
        }
      });
    });
  }
  if(!state.geometry || typeof state.geometry !== 'object'){
    violations.push(issue('geometry', 'must be an object'));
  }else{
    if(!Array.isArray(state.geometry.rowOwners) || state.geometry.rowOwners.length !== 3){
      violations.push(issue('geometry.rowOwners', 'must contain three zone row-owner arrays'));
    }else{
      state.geometry.rowOwners.forEach((owners, zoneIndex)=>{
        if(!Array.isArray(owners)
          || owners.length !== state.board?.[zoneIndex]?.length
          || owners.some(owner=>![1, 0, -1].includes(owner))){
          violations.push(issue(`geometry.rowOwners.${zoneIndex}`, 'must match the zone rows and use owner 0, 1, or -1'));
        }
      });
    }
    if(!Array.isArray(state.geometry.playableExtraSquares)){
      violations.push(issue('geometry.playableExtraSquares', 'must be an array'));
    }
    if(!Array.isArray(state.geometry.squareStatuses)){
      violations.push(issue('geometry.squareStatuses', 'must be an array'));
    }
  }
  if(!Array.isArray(state.statuses)) violations.push(issue('statuses', 'must be an array'));
  if(state?.gameSettings?.healthPressureSeals === true){
    const system = state.moralePressure;
    if(!system || typeof system !== 'object'){
      violations.push(issue('moralePressure', 'enabled rules require canonical Morale/Pressure state'));
    }else{
      if(!Number.isInteger(system.maxMorale) || system.maxMorale < 1){
        violations.push(issue('moralePressure.maxMorale', 'must be a positive integer'));
      }
      for(const field of ['morale','shields','seals','pressure','realityReduction']){
        if(!Array.isArray(system[field]) || system[field].length !== 2
          || system[field].some(value=>!Number.isInteger(value) || value < 0)){
          violations.push(issue(`moralePressure.${field}`, 'must contain two non-negative integer values'));
        }
      }
      if(Array.isArray(system.morale) && system.morale.some(value=>value > Number(system.maxMorale || 0))){
        violations.push(issue('moralePressure.morale', 'cannot exceed maxMorale'));
      }
      for(const field of ['ledger','generated']){
        if(!Array.isArray(system[field]) || system[field].length !== 2 || system[field].some(value=>!Array.isArray(value))){
          violations.push(issue(`moralePressure.${field}`, 'must contain two contribution arrays'));
        }
      }
      if(!Array.isArray(system.realityReductionSources) || system.realityReductionSources.length !== 2
        || system.realityReductionSources.some(value=>!Array.isArray(value))){
        violations.push(issue('moralePressure.realityReductionSources', 'must contain two contribution arrays'));
      }
      if(!Array.isArray(system.moraleBrokenAwarded) || system.moraleBrokenAwarded.length !== 2
        || system.moraleBrokenAwarded.some(value=>typeof value !== 'boolean')){
        violations.push(issue('moralePressure.moraleBrokenAwarded', 'must contain two boolean values'));
      }
      if(!Array.isArray(system.checkpoints)) violations.push(issue('moralePressure.checkpoints', 'must be an array'));
      if(![0, 1].includes(Number(system.startingPlayer))) violations.push(issue('moralePressure.startingPlayer', 'must identify a player'));
      if(!Number.isInteger(system.cycle) || system.cycle < 1) violations.push(issue('moralePressure.cycle', 'must be a positive integer'));
    }
  }
  if(!Array.isArray(state.effectStack)) violations.push(issue('effectStack', 'must be an array'));
  if(Array.isArray(state.effectStack)){
    state.effectStack.forEach((frame, index)=>{
      if(!frame || !String(frame.frameId || '') || !Array.isArray(frame.program)){
        violations.push(issue(`effectStack.${index}`, 'must contain a stable frame id and serializable program'));
      }else if(!Number.isInteger(frame.instructionIndex) || frame.instructionIndex < 0){
        violations.push(issue(`effectStack.${index}.instructionIndex`, 'must be a non-negative integer'));
      }
    });
  }
  if(!Number.isInteger(state.eventSeq) || state.eventSeq < 0) violations.push(issue('eventSeq', 'must be a non-negative integer'));
  if(!Number.isInteger(state.instanceCounter) || state.instanceCounter < 0){
    violations.push(issue('instanceCounter', 'must be a non-negative integer'));
  }
  if(state.pendingPrompt && (!state.pendingPrompt.promptId || !Number.isInteger(state.pendingPrompt.playerIndex))){
    violations.push(issue('pendingPrompt', 'must be serializable and owned by a player'));
  }
  if(state.pendingPrompt && !Object.values(PROMPT_TYPES).includes(state.pendingPrompt.type)){
    violations.push(issue('pendingPrompt.type', 'must be a supported serializable prompt type'));
  }
  if(state.pendingPrompt
    && state.pendingPrompt.type !== PROMPT_TYPES.REACTION
    && !['CANCEL', 'FIRST_ELIGIBLE', 'DEFAULT'].includes(state.pendingPrompt.timeoutPolicy)){
    violations.push(issue('pendingPrompt.timeoutPolicy', 'must define a deterministic timeout'));
  }
  if(state.pendingPrompt && (!Array.isArray(state.effectStack) || !state.effectStack.length)){
    violations.push(issue('pendingPrompt', 'requires a resumable effect frame'));
  }
  if(state.pendingHandLimit){
    if(![0, 1].includes(state.pendingHandLimit.playerIndex)
      || !Number.isInteger(state.pendingHandLimit.limit)
      || !Number.isInteger(state.pendingHandLimit.required)
      || state.pendingHandLimit.required < 1){
      violations.push(issue('pendingHandLimit', 'must contain a player, limit, and positive required count'));
    }
  }
  const seen = new Map();
  for(const entry of allCardEntries(state)){
    const iid = String(entry.card?.iid || '');
    if(!iid){
      violations.push(issue(entry.zone, 'card is missing a permanent iid'));
      continue;
    }
    if(seen.has(iid)) violations.push(issue(entry.zone, `card ${iid} exists in more than one zone`));
    seen.set(iid, entry);
    if(!String(entry.card.id || '')) violations.push(issue(`card:${iid}.id`, 'must be present'));
    if(!Number.isInteger(entry.card.baseFate)) violations.push(issue(`card:${iid}.baseFate`, 'must be an integer'));
    if(!Number.isInteger(entry.card.currentFate) || entry.card.currentFate < 0){
      violations.push(issue(`card:${iid}.currentFate`, 'must be a non-negative integer'));
    }
    if(!Number.isInteger(entry.card.cost) || entry.card.cost < 0) violations.push(issue(`card:${iid}.cost`, 'must be a non-negative integer'));
    if(!Number.isInteger(entry.card.owner) || entry.card.owner < 0 || entry.card.owner > 1){
      violations.push(issue(`card:${iid}.owner`, 'must identify a player'));
    }
    if(!Number.isInteger(entry.card.controller) || entry.card.controller < 0 || entry.card.controller > 1){
      violations.push(issue(`card:${iid}.controller`, 'must identify a player'));
    }
    if(!Array.isArray(entry.card.statuses)) violations.push(issue(`card:${iid}.statuses`, 'must be an array'));
    if(!entry.card.counters || typeof entry.card.counters !== 'object' || Array.isArray(entry.card.counters)){
      violations.push(issue(`card:${iid}.counters`, 'must be an object'));
    }
  }
  for(const entry of boardEntries(state)){
    if(entry.card.controller !== 0 && entry.card.controller !== 1){
      violations.push(issue(`board:${entry.z}:${entry.r}:${entry.c}`, 'card controller must identify a player'));
    }
  }
  if(state.rngState?.algorithm !== 'xorshift32') violations.push(issue('rngState', 'unsupported deterministic RNG'));
  if(!String(state.rngState?.seed || '')) violations.push(issue('rngState.seed', 'must be present'));
  if(!Number.isInteger(state.rngState?.value) || state.rngState.value < 0 || state.rngState.value > 0xffffffff){
    violations.push(issue('rngState.value', 'must be an unsigned 32-bit integer'));
  }
  if(!Number.isInteger(state.rngState?.counter) || state.rngState.counter < 0){
    violations.push(issue('rngState.counter', 'must be a non-negative integer'));
  }
  try{
    stableStringify(state);
  }catch(error){
    violations.push(issue('', error.message));
  }
  return violations;
}

export function assertInvariants(state){
  const violations = collectInvariantViolations(state);
  if(violations.length){
    const error = new Error(`engine invariant failed at ${violations[0].path || '(root)'}: ${violations[0].message}`);
    error.code = 'INVARIANT_FAILED';
    error.violations = violations;
    throw error;
  }
  return true;
}
