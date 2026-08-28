import {cloneSerializable} from './serialization.mjs';
import {boardEntries, controllerOf, findBoardCard, findCard} from './selectors.mjs';
import {effectiveCardType, effectiveFate, isEffectSourceSuppressed} from './modifiers.mjs';
import {zoneScore} from './scoring.mjs';

export const MORALE_PRESSURE_RULESET_FLAG = 'healthPressureSeals';
export const ZONE_CONTROL_REWORK_FLAG = 'zoneControlRework';
export const STARTING_MORALE = 200;
export const MORALE_PENALTY_THRESHOLDS = Object.freeze({
  consolidation:80,
  alternatingDraw:60,
  supporterExpiry:40,
  randomHandDiscard:20
});

export function moralePressureEnabled(state){
  return state?.gameSettings?.[MORALE_PRESSURE_RULESET_FLAG] === true;
}

export function zoneControlReworkEnabled(state){
  return state?.gameSettings?.[ZONE_CONTROL_REWORK_FLAG] === true;
}

export function sealObjectivesEnabled(state){
  // Retained as a compatibility name for callers that need the optional
  // match-resource state. Seals are no longer an objective: the reversible
  // experiment now contains Morale only, while 4/4/4 remains independent.
  return moralePressureEnabled(state);
}

export function createMoralePressureState(startingPlayer = 0){
  return {
    version:1,
    maxMorale:STARTING_MORALE,
    morale:[STARTING_MORALE, STARTING_MORALE],
    shields:[0, 0],
    seals:[0, 0],
    pressure:[0, 0],
    ledger:[[], []],
    generated:[[], []],
    realityReduction:[0, 0],
    realityReductionSources:[[], []],
    startingPlayer:Number(startingPlayer) === 1 ? 1 : 0,
    cycle:1,
    nextEntry:1,
    moraleBrokenAwarded:[false, false],
    checkpoints:[],
    pendingThresholdDiscards:[],
    consolidationsThisTurn:[0, 0],
    drawAlternation:[0, 0]
    ,lastPressureWinner:null
  };
}

export function moralePercent(state, playerIndex){
  if(!moralePressureEnabled(state) || !state?.moralePressure) return 100;
  const max = Math.max(1, Number(state.moralePressure.maxMorale || STARTING_MORALE));
  const morale = Math.max(0, Number(state.moralePressure.morale?.[Number(playerIndex)] || 0));
  return morale / max * 100;
}

export function moralePenaltyActive(state, playerIndex, threshold){
  return moralePressureEnabled(state)
    && !!state?.moralePressure
    && moralePercent(state, playerIndex) <= Number(threshold);
}

export function moraleConsolidationLimit(state, playerIndex){
  return moralePenaltyActive(state, playerIndex, MORALE_PENALTY_THRESHOLDS.consolidation) ? 2 : Infinity;
}

export function moraleConsolidationsUsed(state, playerIndex){
  return Math.max(0, Number(state?.moralePressure?.consolidationsThisTurn?.[Number(playerIndex)] || 0));
}

export function recordMoraleConsolidation(state, playerIndex){
  if(!moralePressureEnabled(state) || !state?.moralePressure) return 0;
  if(!Array.isArray(state.moralePressure.consolidationsThisTurn)) state.moralePressure.consolidationsThisTurn = [0, 0];
  const player = Number(playerIndex);
  state.moralePressure.consolidationsThisTurn[player] = moraleConsolidationsUsed(state, player) + 1;
  return state.moralePressure.consolidationsThisTurn[player];
}

export function resetMoraleTurnCounters(state, playerIndex){
  if(!state?.moralePressure) return;
  if(!Array.isArray(state.moralePressure.consolidationsThisTurn)) state.moralePressure.consolidationsThisTurn = [0, 0];
  state.moralePressure.consolidationsThisTurn[Number(playerIndex)] = 0;
}

export function shouldSkipMoraleDraw(state, playerIndex){
  if(!moralePressureEnabled(state) || !state?.moralePressure) return false;
  if(!Array.isArray(state.moralePressure.drawAlternation)) state.moralePressure.drawAlternation = [0, 0];
  const player = Number(playerIndex);
  if(!moralePenaltyActive(state, player, MORALE_PENALTY_THRESHOLDS.alternatingDraw)){
    state.moralePressure.drawAlternation[player] = 0;
    return false;
  }
  const opportunity = Math.max(0, Number(state.moralePressure.drawAlternation[player] || 0)) + 1;
  state.moralePressure.drawAlternation[player] = opportunity;
  // A player still receives the first draw after crossing the threshold; the
  // next normal draw phase is skipped, then the pattern repeats.
  return opportunity % 2 === 0;
}

function pushEvent(ctx, event){
  if(!ctx?.events) return;
  ctx.events.push({
    ...event,
    moralePressureEvent:true,
    turn:Number(ctx.state?.turn || 1)
  });
}

function cardAffiliation(card){
  return String(card?.affiliation || card?.aff || '').trim().toLowerCase();
}

function sourceName(state, sourceIid, fallback = ''){
  return String(findCard(state, sourceIid)?.card?.name || fallback || 'Card');
}

function addGenerated(ctx, playerIndex, amount, reason, sourceIid, details = {}){
  const state = ctx.state;
  const system = state.moralePressure;
  const value = Math.max(0, Number(amount) || 0);
  if(!value || !system) return;
  const player = Number(playerIndex);
  const entry = {
    key:`generated:${system.cycle}:${system.nextEntry++}`,
    playerIndex:player,
    amount:value,
    reason:String(reason || 'CARD_EFFECT'),
    sourceIid:sourceIid ? String(sourceIid) : null,
    sourceName:sourceName(state, sourceIid, details.sourceName),
    affectedIids:Array.isArray(details.affectedIids) ? details.affectedIids.map(String) : [],
    temporary:true
  };
  system.generated[player].push(entry);
  pushEvent(ctx, {
    type:'PRESSURE_CHANGED',
    playerIndex:player,
    amount:value,
    pressureDirection:'GAIN',
    reason:entry.reason,
    sourceIid:entry.sourceIid,
    sourceName:entry.sourceName,
    affectedIids:entry.affectedIids,
    presentation:'CARD_BLUE_NUMBER_AFTER_CARD_SEQUENCE'
  });
}

function addShield(ctx, playerIndex, amount, sourceIid){
  const system = ctx.state.moralePressure;
  const player = Number(playerIndex);
  const value = Math.max(0, Number(amount) || 0);
  if(!system || !value) return;
  const before = Number(system.shields[player] || 0);
  system.shields[player] = before + value;
  pushEvent(ctx, {
    type:'MORALE_SHIELD_GAINED',
    playerIndex:player,
    amount:value,
    before,
    after:system.shields[player],
    sourceIid:sourceIid ? String(sourceIid) : null,
    sound:'morale-shield-gain'
  });
}

export function recordMoralePressureRuleEvent(ctx, event){
  const state = ctx?.state;
  if(!moralePressureEnabled(state) || state?.gameSettings?.pressureCardReworks !== true || !state.moralePressure || !event) return;
  const type = String(event.type || '').toUpperCase();
  if(type === 'CARD_SET'){
    return;
  }
  if(type === 'EFFECT_ACTIVATED'){
    const entry = findBoardCard(state, event.sourceIid);
    if(!entry || entry.card.faceDown === true || isEffectSourceSuppressed(state, entry)) return;
    const cardType = effectiveCardType(state, entry.card);
    if(cardType === 'Initiator'){
      addGenerated(ctx, controllerOf(entry.card), 3, 'INITIATOR_ACTIVATED', entry.card.iid);
    }
    if(cardType === 'Improvisor'){
      addGenerated(ctx, controllerOf(entry.card), 1, 'IMPROVISOR_ACTIVATED', entry.card.iid);
    }
    return;
  }
  if(type === 'CARD_DRAWN' && event.redirectedToDeckBottom !== true){
    return;
  }
  if(['FATE_CHANGED','STATUS_CREATED','STATUS_REMOVED'].includes(type)){
    const sourceEntry = findBoardCard(state, event.sourceIid);
    const targetEntry = findBoardCard(state, event.cardIid);
    if(!sourceEntry || !targetEntry || sourceEntry.card.iid === targetEntry.card.iid) return;
    if(sourceEntry.card.faceDown === true || isEffectSourceSuppressed(state, sourceEntry)) return;
    if(effectiveCardType(state, sourceEntry.card) !== 'Coordinator' || !adjacent(sourceEntry, targetEntry)) return;
    addGenerated(ctx, controllerOf(sourceEntry.card), 1, 'COORDINATOR_IMPACT', sourceEntry.card.iid, {
      affectedIids:[targetEntry.card.iid]
    });
  }
}

export function modifyCardPressure(ctx, operation = {}){
  const state = ctx?.state;
  if(!moralePressureEnabled(state) || state?.gameSettings?.pressureCardReworks !== true || !state.moralePressure) return null;
  const targets = Array.isArray(operation.targetIids) ? operation.targetIids : null;
  if(targets) return targets.map(targetIid=>modifyCardPressure(ctx, {...operation,targetIids:undefined,targetIid}));
  const found = findCard(state, operation.targetIid);
  if(!found?.card) return null;
  refreshMoralePressure(ctx, {silent:true});
  const card = found.card;
  const iid = String(card.iid || '');
  const controller = controllerOf(card);
  const ledger = state.moralePressure.ledger?.[controller] || [];
  const current = Math.max(0, ledger.reduce((sum, entry)=>{
    const target = String(entry.cardIid || entry.targetIid || entry.sourceIid || '');
    return target === iid ? sum + Number(entry.amount || 0) : sum;
  }, 0));
  const multiplier = Number.isFinite(Number(operation.multiplier)) ? Number(operation.multiplier) : 1;
  const requested = current * (multiplier - 1) + Number(operation.amount || 0);
  if(!requested) return {cardIid:iid, before:current, after:current, amount:0};
  if(!card.counters || typeof card.counters !== 'object') card.counters = {};
  if(operation.temporaryTurn === true){
    card.counters.pressureTurnBonus = Number(card.counters.pressureTurnBonus || 0) + requested;
    card.counters.pressureTurn = Number(state.turn);
  }else{
    card.counters.pressureModifier = Number(card.counters.pressureModifier || 0) + requested;
  }
  refreshMoralePressure(ctx);
  return {cardIid:iid, before:current, after:Math.max(0,current+requested), amount:requested};
}

export function modifyMorale(ctx, operation = {}){
  const state = ctx?.state;
  if(!moralePressureEnabled(state) || !state.moralePressure) return null;
  const player = Number(operation.playerIndex ?? operation.sourceController);
  if(player !== 0 && player !== 1) return null;
  const system = state.moralePressure;
  const before = Number(system.morale[player] || 0);
  let requestedAmount = Number(operation.amount || 0);
  const perMatchingCard = Number(operation.amountPerMatchingZoneCard || 0);
  if(perMatchingCard && operation.sourceIid){
    const source = findBoardCard(state, operation.sourceIid);
    if(source){
      const affiliation = String(operation.affiliation || '').trim().toLowerCase();
      const matching = boardEntries(state).filter(entry=>
        entry.z === source.z
        && controllerOf(entry.card) === player
        && entry.card.faceDown !== true
        && cardAffiliation(entry.card) === affiliation
      ).length;
      requestedAmount += matching * perMatchingCard;
    }
  }
  const pacificaPreventsDamage = String(state.landscapeId || '') === 'igb1' && requestedAmount < 0;
  const after = pacificaPreventsDamage
    ? before
    : Math.max(0, Math.min(Number(system.maxMorale || STARTING_MORALE), before + requestedAmount));
  system.morale[player] = after;
  const amount = after - before;
  if(amount < 0 && operation.sourceIid){
    const source = findCard(state, operation.sourceIid)?.card;
    if(source && ['34','35','65'].includes(String(source.id || ''))){
      if(!source.counters || typeof source.counters !== 'object') source.counters = {};
      source.counters.moraleDamageInflicted = Math.max(0, Math.floor(Number(source.counters.moraleDamageInflicted) || 0)) + Math.abs(amount);
    }
  }
  if(amount) pushEvent(ctx, {type:amount > 0 ? 'MORALE_HEALED' : 'MORALE_DAMAGED',playerIndex:player,amount:Math.abs(amount),before,after,sourceIid:operation.sourceIid || null,overlayTargetIid:operation.overlayTargetIid || null,semanticSourceCardId:operation.semanticSourceCardId || undefined,reason:operation.reason || undefined,sound:amount > 0 ? 'morale-heal' : 'morale-damage'});
  return {playerIndex:player,before,after,amount};
}

function adjacent(left, right){
  return left.z === right.z && Math.abs(left.r - right.r) + Math.abs(left.c - right.c) === 1;
}

function coordinatorAffectedCards(state, sourceEntry){
  const candidates = boardEntries(state).filter(entry=>
    entry.card.faceDown !== true && entry.card.iid !== sourceEntry.card.iid && adjacent(sourceEntry, entry)
  );
  if(!candidates.length) return [];
  const suppressedState = cloneSerializable(state);
  const suppressedSource = findBoardCard(suppressedState, sourceEntry.card.iid);
  if(!suppressedSource) return [];
  if(!suppressedSource.card.statuses.includes('EFFECTS_SUPPRESSED')){
    suppressedSource.card.statuses.push('EFFECTS_SUPPRESSED');
  }
  return candidates.filter(entry=>{
    const suppressedTarget = findBoardCard(suppressedState, entry.card.iid);
    if(!suppressedTarget) return false;
    return effectiveFate(state, entry) !== effectiveFate(suppressedState, suppressedTarget);
  });
}

function persistentEntries(state, playerIndex){
  const player = Number(playerIndex);
  const entries = [];
  for(const entry of boardEntries(state)){
    const card = entry.card;
    if(controllerOf(card) !== player || card.faceDown === true) continue;
    const type = effectiveCardType(state, card);
    if(type === 'Dauntless' && !isEffectSourceSuppressed(state, entry)){
      entries.push({
        key:`dauntless:${card.iid}`,
        playerIndex:player,
        amount:3,
        reason:'DAUNTLESS_UNSUPPRESSED',
        sourceIid:String(card.iid),
        sourceName:String(card.name || 'Dauntless'),
        affectedIids:[]
      });
    }
    const pressureModifier = Number(card.counters?.pressureModifier || 0);
    if(pressureModifier){
      entries.push({key:`card-pressure-modifier:${card.iid}`,playerIndex:player,amount:pressureModifier,reason:'CARD_PRESSURE_MODIFIER',sourceIid:String(card.iid),cardIid:String(card.iid),sourceName:String(card.name || 'Card'),affectedIids:[String(card.iid)]});
    }
    const pressureTurnBonus = Number(card.counters?.pressureTurn) === Number(state.turn) ? Number(card.counters?.pressureTurnBonus || 0) : 0;
    if(pressureTurnBonus){
      entries.push({key:`card-pressure-turn:${card.iid}:t${state.turn}`,playerIndex:player,amount:pressureTurnBonus,reason:'CARD_TURN_PRESSURE',sourceIid:String(card.iid),cardIid:String(card.iid),sourceName:String(card.name || 'Card'),affectedIids:[String(card.iid)]});
    }
    if(type === 'Coordinator' && !isEffectSourceSuppressed(state, entry)){
      const affected = coordinatorAffectedCards(state, entry);
      if(affected.length){
        entries.push({
          key:`coordinator:${card.iid}`,
          playerIndex:player,
          amount:affected.length,
          reason:'COORDINATOR_ADJACENCY',
          sourceIid:String(card.iid),
          sourceName:String(card.name || 'Coordinator'),
          affectedIids:affected.map(item=>String(item.card.iid))
        });
      }
    }
  }
  return entries;
}

function mapByKey(entries){
  return new Map((entries || []).map(entry=>[String(entry.key), entry]));
}

export function refreshMoralePressure(ctx, options = {}){
  const state = ctx?.state;
  if(!moralePressureEnabled(state) || !state.moralePressure) return;
  const system = state.moralePressure;
  if(state.gameSettings?.pressureCardReworks !== true){
    system.pressure = [0, 0];
    system.ledger = [[], []];
    system.generated = [[], []];
    system.realityReduction = [0, 0];
    system.realityReductionSources = [[], []];
    return;
  }
  const pressureBefore = system.pressure.slice(0, 2).map(value=>Math.max(0, Number(value) || 0));
  for(let player = 0; player < 2; player += 1){
    const oldLedger = Array.isArray(system.ledger[player]) ? system.ledger[player] : [];
    const persistent = persistentEntries(state, player);
    const positiveWithoutInitiative = persistent.reduce((sum, entry)=>sum + entry.amount, 0)
      + system.generated[player].reduce((sum, entry)=>sum + entry.amount, 0);
    if(player === Number(system.startingPlayer) && positiveWithoutInitiative > 0){
      persistent.push({
        key:`initiative:${system.cycle}:p${player}`,
        playerIndex:player,
        amount:2,
        reason:'STARTING_PLAYER_INITIATIVE',
        sourceIid:null,
        sourceName:'Initiative',
        affectedIids:[]
      });
    }
    const deductions = (system.realityReductionSources[player] || []).map(entry=>({...entry, playerIndex:player}));
    const nextLedger = [...system.generated[player], ...persistent, ...deductions];
    const oldMap = mapByKey(oldLedger);
    const nextMap = mapByKey(nextLedger);
    if(options.silent !== true){
      for(const entry of nextLedger){
        const previous = oldMap.get(entry.key);
        const delta = Number(entry.amount) - Number(previous?.amount || 0);
        if(!delta || String(entry.key).startsWith('generated:')) continue;
        pushEvent(ctx, {
          type:'PRESSURE_CHANGED',
          playerIndex:player,
          amount:delta,
          pressureDirection:delta > 0 ? 'GAIN' : 'LOSS',
          reason:entry.reason,
          sourceIid:entry.sourceIid,
          sourceName:entry.sourceName,
          affectedIids:entry.affectedIids,
          presentation:'CARD_BLUE_NUMBER_AFTER_CARD_SEQUENCE'
        });
      }
      for(const entry of oldLedger){
        if(nextMap.has(entry.key) || String(entry.key).startsWith('generated:')) continue;
        if(Number(entry.amount) > 0){
          pushEvent(ctx, {
            type:'PRESSURE_CHANGED',
            playerIndex:player,
            amount:-Number(entry.amount),
            pressureDirection:'LOSS',
            reason:entry.reason,
            sourceIid:entry.sourceIid,
            sourceName:entry.sourceName,
            affectedIids:entry.affectedIids,
            presentation:'CARD_BLUE_NUMBER_AFTER_CARD_SEQUENCE'
          });
        }
      }
    }
    system.ledger[player] = nextLedger;
    system.pressure[player] = Math.max(0, nextLedger.reduce((sum, entry)=>sum + Number(entry.amount || 0), 0));
  }
  const running = pressureBefore.slice();
  for(const event of ctx.events || []){
    if(String(event?.type || '').toUpperCase() !== 'PRESSURE_CHANGED' || event.beforePressure !== undefined) continue;
    const player = Number(event.playerIndex);
    if(player !== 0 && player !== 1) continue;
    event.beforePressure = running[player];
    running[player] = Math.max(0, running[player] + Number(event.amount || 0));
    event.afterPressure = running[player];
  }
}

export function pressureDamageForDifference(difference){
  return Math.max(0, Number(difference) || 0);
}

function awardSeals(ctx, playerIndex, amount, reason, checkpointTurn, details = {}){
  const system = ctx.state.moralePressure;
  const player = Number(playerIndex);
  const value = Math.max(0, Number(amount) || 0);
  if(!value) return;
  const before = Number(system.seals[player] || 0);
  system.seals[player] = before + value;
  pushEvent(ctx, {
    type:'SEALS_AWARDED',
    playerIndex:player,
    amount:value,
    before,
    after:system.seals[player],
    reason,
    checkpointTurn:Number(checkpointTurn || ctx.state.turn),
    sound:'seal-award',
    ...details
  });
}

function resolveMoraleDamage(ctx){
  const system = ctx.state.moralePressure;
  const pressure = system.pressure.map(value=>Math.max(0, Number(value) || 0));
  const difference = Math.abs(pressure[0] - pressure[1]);
  const incoming = pressureDamageForDifference(difference);
  const winner = pressure[0] === pressure[1] ? null : (pressure[0] > pressure[1] ? 0 : 1);
  system.lastPressureWinner = winner;
  const loser = winner === null ? null : (winner === 0 ? 1 : 0);
  pushEvent(ctx, {
    type:'PRESSURE_RESOLVED',
    playerIndex:winner,
    pressure:cloneSerializable(pressure),
    difference,
    incomingDamage:incoming,
    winnerPlayerIndex:winner,
    loserPlayerIndex:loser,
    sound:'pressure-cycle-reset'
  });
  if(String(ctx.state.landscapeId || '') === 'igb1') return;
  if(winner === null) return;
  const prevention = boardEntries(ctx.state).find(entry=>controllerOf(entry.card) === loser && entry.card.counters?.preventNextMoraleDamage === true && !isEffectSourceSuppressed(ctx.state, entry));
  if(prevention){
    prevention.card.counters.preventNextMoraleDamage = false;
    pushEvent(ctx,{type:'MORALE_DAMAGE_PREVENTED',playerIndex:loser,sourceIid:prevention.card.iid,amount:incoming});
    return;
  }
  let shieldUsed = Math.min(Number(system.shields[loser] || 0), incoming);
  const shieldBefore = Number(system.shields[loser] || 0);
  system.shields[loser] = shieldBefore - shieldUsed;
  const damage = incoming - shieldUsed;
  const before = Number(system.morale[loser] || 0);
  system.morale[loser] = Math.max(0, before - damage);
  if(shieldUsed){
    pushEvent(ctx, {
      type:'MORALE_SHIELD_BROKEN',
      playerIndex:loser,
      amount:shieldUsed,
      before:shieldBefore,
      after:system.shields[loser],
      sound:'morale-shield-break'
    });
  }
  if(damage){
    pushEvent(ctx, {
      type:'MORALE_DAMAGED',
      playerIndex:loser,
      sourcePlayerIndex:winner,
      amount:damage,
      before,
      after:system.morale[loser],
      pressure:cloneSerializable(pressure),
      difference,
      sound:'morale-damage'
    });
    const halfway = Number(system.maxMorale || STARTING_MORALE) * .5;
    if(before > halfway && system.morale[loser] <= halfway){
      const eligible = boardEntries(ctx.state).some(entry=>controllerOf(entry.card) === loser);
      if(eligible){
        if(!Array.isArray(system.pendingThresholdDiscards)) system.pendingThresholdDiscards = [];
        system.pendingThresholdDiscards.push({
          targetPlayerIndex:loser,
          chooserPlayerIndex:winner,
          threshold:50,
          turn:Number(ctx.state.turn)
        });
        pushEvent(ctx, {
          type:'MORALE_THRESHOLD_TRIGGERED',
          playerIndex:loser,
          sourcePlayerIndex:winner,
          threshold:50,
          consequence:'OPPONENT_DISCARDS_BOARD_CARD'
        });
      }
    }
  }
  if(before > 0 && system.morale[loser] === 0 && system.moraleBrokenAwarded[loser] !== true){
    system.moraleBrokenAwarded[loser] = true;
    pushEvent(ctx, {
      type:'MORALE_BROKEN',
      playerIndex:loser,
      sourcePlayerIndex:winner,
      sound:'morale-break'
    });
    awardSeals(ctx, winner, 4, 'MORALE_BROKEN', ctx.state.turn);
  }
}

function zoneFateMoraleResolution(state){
  const zoneResults = [0, 1, 2].map(zone=>{
    const scores = [zoneScore(state, zone, 0), zoneScore(state, zone, 1)];
    const controller = scores[0] > scores[1] ? 0 : (scores[1] > scores[0] ? 1 : null);
    return {
      zone,
      scores,
      controller,
      difference:Math.abs(scores[0] - scores[1]),
      damagedPlayer:controller === null ? null : 1 - controller
    };
  });
  const damage = [0, 0];
  for(const result of zoneResults){
    if(result.damagedPlayer === 0 || result.damagedPlayer === 1){
      damage[result.damagedPlayer] += result.difference;
    }
  }
  return {zoneResults, damage};
}

function resolveZoneFateMoraleDamage(ctx){
  const state = ctx.state;
  const system = state.moralePressure;
  const resolution = zoneFateMoraleResolution(state);
  const outgoing = [0, 0];
  const outgoingSources = [[], []];
  const pressureReworks = state.gameSettings?.pressureCardReworks === true;
  const entries = boardEntries(state).filter(entry=>
    entry.card.faceDown !== true && !isEffectSourceSuppressed(state, entry)
  );
  for(const entry of entries){
      const source = entry.card;
      const owner = controllerOf(source);
      const id = String(source.id || '');
      let sourceDamage = 0;
      let affectedIids = [];
      if(pressureReworks && id === '34' && source.counters?.moraleAffiliation){
        const affiliation = String(source.counters.moraleAffiliation).toLowerCase();
        const affected = entries.filter(target=>
          controllerOf(target.card) === owner
          && target.z === entry.z
          && cardAffiliation(target.card) === affiliation
        );
        sourceDamage = affected.length * 2;
        affectedIids = affected.map(target=>String(target.card?.iid || '')).filter(Boolean);
      }else if(id === '35'){
        sourceDamage = Math.floor(Math.max(0, Number(effectiveFate(state, entry)) || 0) / 2);
      }
      if(sourceDamage > 0){
        outgoing[owner] += sourceDamage;
        outgoingSources[owner].push({card:source, amount:sourceDamage, affectedIids});
      }
  }
  if(pressureReworks){
    for(let owner = 0; owner < 2; owner += 1){
      const doublers = entries.filter(entry=>
        controllerOf(entry.card) === owner
        && String(entry.card.id || '') === '64'
        && entry.card.counters?.doubleNextMoraleDamage === true
      );
      if(doublers.length){
        const multiplier = Math.pow(2, doublers.length);
        outgoing[owner] *= multiplier;
        for(const source of outgoingSources[owner]) source.amount *= multiplier;
        for(const entry of doublers) entry.card.counters.doubleNextMoraleDamage = false;
      }
      const shields = entries.filter(entry=>
        controllerOf(entry.card) === owner
        && String(entry.card.id || '') === '20'
        && entry.card.counters?.preventNextMoraleDamage === true
      );
      if(shields.length){
        resolution.damage[owner] = 0;
        for(const entry of shields) entry.card.counters.preventNextMoraleDamage = false;
      }
    }
  }
  for(let owner = 0; owner < 2; owner += 1) resolution.damage[1 - owner] += outgoing[owner];
  if(String(state.landscapeId || '') === 'igb1'){
    resolution.damage = [0, 0];
  }
  pushEvent(ctx, {
    type:'MORALE_CYCLE_RESOLVED',
    zoneResults:cloneSerializable(resolution.zoneResults),
    damage:cloneSerializable(resolution.damage),
    moraleDamageSources:cloneSerializable(outgoingSources.map(sources=>sources.map(source=>({
      sourceIid:String(source.card?.iid || ''),
      sourceCardId:String(source.card?.id || ''),
      amount:Math.max(0, Number(source.amount) || 0),
      affectedIids:cloneSerializable(source.affectedIids || [])
    })))),
    moraleBefore:cloneSerializable(system.morale),
    sound:'morale-cycle'
  });
  for(let player = 0; player < 2; player += 1){
    const incoming = Math.max(0, Number(resolution.damage[player]) || 0);
    if(!incoming) continue;
    const before = Math.max(0, Number(system.morale[player]) || 0);
    const after = Math.max(0, before - incoming);
    system.morale[player] = after;
    if(state.gameSettings?.pressureCardReworks === true){
      const sourceOwner = 1 - player;
      const baseDamage = Math.max(0, incoming - Number(outgoing[sourceOwner] || 0));
      let attributable = Math.max(0, (before - after) - Math.min(before - after, baseDamage));
      for(const source of outgoingSources[sourceOwner]){
        const credited = Math.min(attributable, Math.max(0, Number(source.amount) || 0));
        if(credited > 0){
          if(!source.card.counters || typeof source.card.counters !== 'object') source.card.counters = {};
          source.card.counters.moraleDamageInflicted = Math.max(0, Math.floor(Number(source.card.counters.moraleDamageInflicted) || 0)) + credited;
          attributable -= credited;
        }
      }
    }
    pushEvent(ctx, {
      type:'MORALE_DAMAGED',
      playerIndex:player,
      sourcePlayerIndex:1 - player,
      amount:before - after,
      incomingDamage:incoming,
      before,
      after,
      moraleDamageSources:cloneSerializable(outgoingSources[1 - player].map(source=>({
        sourceIid:String(source.card?.iid || ''),
        sourceCardId:String(source.card?.id || ''),
        amount:Math.max(0, Number(source.amount) || 0),
        affectedIids:cloneSerializable(source.affectedIids || [])
      }))),
      zoneResults:cloneSerializable(resolution.zoneResults),
      sound:'morale-damage'
    });
    if(before > 0 && after === 0){
      pushEvent(ctx, {
        type:'MORALE_BROKEN',
        playerIndex:player,
        sourcePlayerIndex:1 - player,
        sound:'morale-break'
      });
    }
  }
  return resolution;
}

function healEventide(ctx){
  const state = ctx.state;
  const system = state.moralePressure;
  for(let player = 0; player < 2; player += 1){
    const sources = boardEntries(state).filter(entry=>
      controllerOf(entry.card) === player
      && entry.card.faceDown !== true
      && cardAffiliation(entry.card) === 'eventide'
    );
    const amount = Math.min(sources.length, system.maxMorale - Number(system.morale[player] || 0));
    if(!amount) continue;
    const before = Number(system.morale[player] || 0);
    system.morale[player] = before + amount;
    pushEvent(ctx, {
      type:'MORALE_HEALED',
      playerIndex:player,
      amount,
      before,
      after:system.morale[player],
      sourceIids:sources.slice(0, amount).map(entry=>String(entry.card.iid)),
      sound:'morale-heal'
    });
  }
}

function checkpointValues(turn, maxTurns, zoneControlRework = true){
  const currentTurn = Number(turn);
  const finalTurn = Math.max(1, Number(maxTurns) || 24);
  if(!zoneControlRework){
    if(currentTurn === 6) return {morale:0, zones:3};
    if(currentTurn === 12) return {morale:0, zones:5};
    if(currentTurn === finalTurn) return {morale:0, zones:8};
    return null;
  }
  if(currentTurn === 6) return {morale:0, zones:1};
  if(currentTurn === 12) return {morale:0, zones:3};
  if(currentTurn === 18) return {morale:0, zones:2};
  if(currentTurn === finalTurn) return {morale:0, zones:6};
  return null;
}

export function resolveSealCheckpoint(ctx){
  const state = ctx?.state;
  if(!sealObjectivesEnabled(state) || !state.moralePressure) return null;
  const awards = checkpointValues(state.turn, state.maxTurns, state.gameSettings?.zoneControlRework !== false);
  if(!awards) return null;
  const zoneResults = [0, 1, 2].map(zone=>{
    const scores = [zoneScore(state, zone, 0), zoneScore(state, zone, 1)];
    return {zone, scores, controller:scores[0] > scores[1] ? 0 : (scores[1] > scores[0] ? 1 : null)};
  });
  const zoneWins = [0, 1].map(player=>zoneResults.filter(result=>result.controller === player).length);
  const zoneLeader = zoneWins[0] === zoneWins[1] ? null : (zoneWins[0] > zoneWins[1] ? 0 : 1);
  const morale = state.moralePressure.morale;
  const moraleLeader = morale[0] === morale[1] ? null : (morale[0] > morale[1] ? 0 : 1);
  if(zoneLeader !== null) awardSeals(ctx, zoneLeader, awards.zones, 'ZONE_CONTROL', state.turn, {zoneWins:cloneSerializable(zoneWins)});
  const report = {
    turn:Number(state.turn),
    awards:cloneSerializable(awards),
    zoneWins,
    zoneLeader,
    morale:cloneSerializable(morale),
    moraleLeader,
    moraleEnabled:moralePressureEnabled(state),
    moraleBonus:0,
    seals:cloneSerializable(state.moralePressure.seals),
    zoneResults
  };
  state.moralePressure.checkpoints.push(report);
  pushEvent(ctx, {type:'SEAL_CHECKPOINT', report:cloneSerializable(report), sound:'seal-checkpoint'});
  return report;
}

export function resolveMoralePressureCycle(ctx){
  const state = ctx?.state;
  const turn = Number(state?.turn);
  // Morale has an opening grace period. The normal two-turn cadence begins at
  // the end of Turn 4, then continues on Turns 6, 8, 10, and so on.
  if(!moralePressureEnabled(state) || !state.moralePressure || turn < 4 || turn % 2 !== 0) return null;
  const resolution = resolveZoneFateMoraleDamage(ctx);
  state.moralePressure.cycle += 1;
  return resolution;
}

export function calculateMoraleOutcome(state){
  const morale = cloneSerializable(state.moralePressure?.morale || [STARTING_MORALE, STARTING_MORALE]);
  const resolution = zoneFateMoraleResolution(state);
  const zoneResults = resolution.zoneResults;
  const zoneWins = [0, 1].map(player=>zoneResults.filter(result=>result.controller === player).length);
  const totalFate = [0, 1].map(player=>zoneResults.reduce((total, result)=>total + Number(result.scores[player] || 0), 0));
  const depleted = [0, 1].filter(player=>Number(morale[player] || 0) <= 0);
  let winner = null;
  let reason = 'NO_ZONE_MAJORITY';
  if(depleted.length){
    winner = depleted.length === 2 ? null : 1 - depleted[0];
    reason = winner === null ? 'MORALE_DOUBLE_KO' : 'MORALE_DEPLETED';
  }else if(zoneWins[0] >= 2 || zoneWins[1] >= 2){
    winner = zoneWins[0] >= 2 ? 0 : 1;
    reason = 'ZONES';
  }else if(totalFate[0] !== totalFate[1]){
    winner = totalFate[0] > totalFate[1] ? 0 : 1;
    reason = 'TOTAL_FATE';
  }else{
    reason = 'EXACT_TIE';
  }
  return {
    type:winner === null ? 'DRAW' : 'VICTORY',
    winner,
    reason,
    turn:state.turn,
    morale,
    zoneWins,
    totalFate,
    zoneResults
  };
}

export function calculateSealOutcome(state){
  const seals = cloneSerializable(state.moralePressure?.seals || [0, 0]);
  const morale = cloneSerializable(state.moralePressure?.morale || [0, 0]);
  const moraleEnabled = moralePressureEnabled(state);
  const moraleLeader = !moraleEnabled || morale[0] === morale[1] ? null : (morale[0] > morale[1] ? 0 : 1);
  const cardBonus = 0;
  if(moraleLeader !== null) seals[moraleLeader] += 3;
  const winner = seals[0] === seals[1] ? null : (seals[0] > seals[1] ? 0 : 1);
  const zoneResults = [0, 1, 2].map(zone=>{
    const scores = [zoneScore(state, zone, 0), zoneScore(state, zone, 1)];
    return {zone, scores, controller:scores[0] > scores[1] ? 0 : (scores[1] > scores[0] ? 1 : null)};
  });
  return {
    type:winner === null ? 'DRAW' : 'VICTORY',
    winner,
    reason:winner === null ? 'SEAL_TIE' : 'SEALS',
    turn:state.turn,
    seals,
    morale,
    finalMoraleAward:{leader:moraleLeader, base:moraleLeader === null ? 0 : 3, cardBonus, total:moraleLeader === null ? 0 : 3 + cardBonus},
    pressure:cloneSerializable(state.moralePressure.pressure),
    zoneWins:[0, 1].map(player=>zoneResults.filter(result=>result.controller === player).length),
    totalFate:[0, 1].map(player=>zoneResults.reduce((total, result)=>total + result.scores[player], 0)),
    zoneResults,
    checkpoints:cloneSerializable(state.moralePressure.checkpoints)
  };
}
