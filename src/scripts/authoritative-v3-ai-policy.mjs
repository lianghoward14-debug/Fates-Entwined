import {
  legalCommandTemplates,
  projectStateForPlayer,
  reduceCommand,
  stableStringify
} from '../../shared/engine/index.mjs';

function controllerOf(card){
  return Number.isInteger(Number(card?.controller)) ? Number(card.controller) : Number(card?.owner);
}

function visibleCards(projection){
  return [
    ...(projection?.board || []).flat(3).filter(Boolean),
    ...(projection?.players || []).flatMap(player=>[
      ...(player.hand || []),
      ...(player.discard || [])
    ])
  ];
}

function cardByIid(projection, iid){
  const wanted = String(iid || '');
  return visibleCards(projection).find(card=>String(card?.iid || '') === wanted) || null;
}

function cardLocation(projection, iid){
  const wanted = String(iid || '');
  for(let z = 0; z < (projection?.board?.length || 0); z += 1){
    for(let r = 0; r < (projection.board[z]?.length || 0); r += 1){
      for(let c = 0; c < (projection.board[z][r]?.length || 0); c += 1){
        if(String(projection.board[z][r][c]?.iid || '') === wanted) return {z,r,c,card:projection.board[z][r][c]};
      }
    }
  }
  return null;
}

function cardFate(card){
  return Number(card?.currentFate ?? card?.fate ?? 0);
}

function selectedCards(command, projection){
  const payload = command?.payload || {};
  const iids = [
    payload.cardIid,
    payload.sourceIid,
    payload.targetIid,
    payload.reactionIid,
    payload.selectedIid,
    ...(payload.selectedIids || []),
    ...(payload.tributeIids || []),
    ...(payload.discardIids || []),
    ...(payload.discardedIids || [])
  ].filter(Boolean);
  return iids.map(iid=>cardByIid(projection, iid)).filter(Boolean);
}

function zoneBalance(projection, zone, playerIndex){
  const player = Number(playerIndex);
  const opponent = player === 0 ? 1 : 0;
  let own = 0;
  let rival = 0;
  for(const card of projection?.board?.[Number(zone)]?.flat(2).filter(Boolean) || []){
    if(card.faceDown === true) continue;
    if(controllerOf(card) === player) own += cardFate(card);
    if(controllerOf(card) === opponent) rival += cardFate(card);
  }
  return {own, rival, margin:own - rival};
}

function zoneScores(projection, playerIndex){
  return [0,1,2].map(zone=>zoneBalance(projection, zone, playerIndex).own);
}

function moraleStyle(context = {}){
  const key = String(context.style || context.personality || '').toLowerCase();
  if(['cautious','defensive','turtle','hoarder','methodical','disciplined','calculating'].includes(key)) return {preservation:1.3,aggression:.88};
  if(['reckless','relentless','overwhelming','aggro','blitz','bully','sacrificial'].includes(key)) return {preservation:.82,aggression:1.35};
  if(['control','lockdown','disruptive','sniper','opportunist'].includes(key)) return {preservation:1,aggression:1.2};
  return {preservation:1,aggression:1};
}

function thresholdBurden(morale, maxMorale){
  const ratio = Math.max(0, Number(morale) || 0) / Math.max(1, Number(maxMorale) || 200);
  return (ratio <= .8 ? 7 : 0)
    + (ratio <= .6 ? 18 : 0)
    + (ratio <= .4 ? 25 : 0)
    + (ratio <= .2 ? 30 : 0)
    + (ratio <= 0 ? 600 : 0);
}

function moraleCycle(scores, enemyScores){
  let incoming = 0;
  let outgoing = 0;
  for(let zone = 0; zone < 3; zone += 1){
    const margin = Number(scores?.[zone] || 0)-Number(enemyScores?.[zone] || 0);
    if(margin < 0) incoming += Math.abs(margin);
    else outgoing += margin;
  }
  return {incoming,outgoing};
}

function moralePositionScore(projection, playerIndex, scores, enemyScores, context = {}){
  const system = projection?.gameSettings?.healthPressureSeals === true ? projection?.moralePressure : null;
  if(!system || projection?.landscapeId === 'igb1') return 0;
  const player = Number(playerIndex);
  const opponent = player === 0 ? 1 : 0;
  const maxMorale = Math.max(1, Number(system.maxMorale || 200));
  const style = moraleStyle(context);
  const cycle = moraleCycle(scores, enemyScores);
  const incoming = Math.max(0, cycle.incoming-Number(system.shields?.[player] || 0));
  const outgoing = Math.max(0, cycle.outgoing-Number(system.shields?.[opponent] || 0));
  const ownAfter = Math.max(0, Number(system.morale?.[player] || 0)-incoming);
  const opponentAfter = Math.max(0, Number(system.morale?.[opponent] || 0)-outgoing);
  const turn = Math.max(1, Number(projection?.turn) || 1);
  const cadence = turn < 6 ? .34 : (turn % 2 === 0 ? 1.42 : .72);
  return cadence * (
    outgoing*1.8*style.aggression-incoming*1.9*style.preservation
    + thresholdBurden(opponentAfter,maxMorale)*style.aggression
    - thresholdBurden(ownAfter,maxMorale)*style.preservation
  );
}

function commandMoralePositionScore(command, projection, playerIndex, context = {}){
  const system = projection?.gameSettings?.healthPressureSeals === true ? projection?.moralePressure : null;
  if(!system) return 0;
  const player = Number(playerIndex);
  const opponent = player === 0 ? 1 : 0;
  const before = zoneScores(projection, player);
  const enemy = zoneScores(projection, opponent);
  const after = before.slice();
  const payload = command?.payload || {};
  const destination = payload.destination;
  if(destination && ['SET_CARD','SET_CARD_FROM_DECK','CONSOLIDATE_CARD'].includes(command?.type)){
    const played = cardByIid(projection, payload.cardIid);
    after[Number(destination.z)] += cardFate(played);
    if(command.type === 'CONSOLIDATE_CARD'){
      for(const iid of payload.tributeIids || []){
        const tribute = cardLocation(projection, iid);
        if(tribute) after[tribute.z] = Math.max(0, after[tribute.z]-cardFate(tribute.card));
      }
    }
  }else if(destination && command?.type === 'MOVE_CARD'){
    const source = cardLocation(projection, payload.cardIid);
    if(source){
      after[source.z] = Math.max(0, after[source.z]-cardFate(source.card));
      after[Number(destination.z)] += cardFate(source.card);
    }
  }
  return moralePositionScore(projection, player, after, enemy, context)
    - moralePositionScore(projection, player, before, enemy, context);
}

function destinationScore(command, projection, playerIndex){
  const destination = command?.payload?.destination;
  if(!destination) return 0;
  const balance = zoneBalance(projection, destination.z, playerIndex);
  const row = Number(destination.r);
  const rowOwner = projection?.geometry?.rowOwners?.[Number(destination.z)]?.[row]
    ?? (row === 0 ? 1 : (row === 1 ? -1 : (row === 2 ? 0 : null)));
  const rowValue = Number(rowOwner) === -1
    ? 18
    : (Number(rowOwner) === Number(playerIndex) ? 10 : -18);
  // Prefer contestable zones that are close enough to swing. Stable command
  // ordering resolves exact ties, so this never introduces nondeterminism.
  const swingValue = 30 - Math.min(30, Math.abs(balance.margin) * 3);
  const behindBonus = balance.margin < 0 ? Math.min(24, Math.abs(balance.margin) * 4) : 0;
  return swingValue + behindBonus + rowValue
    - Number(destination.r || 0) * 0.01
    - Number(destination.c || 0) * 0.001;
}

function declarationScore(payload){
  const rarity = {circle:1, triangle:2, square:3, star:4}[String(payload?.declaredRarity || '')] || 0;
  const type = {
    Supporter:1,
    Initiator:3,
    Improvisor:4,
    Coordinator:5,
    Dauntless:6
  }[String(payload?.declaredType || '')] || 0;
  return rarity + type + (payload?.placementType === 'CONSOLIDATED' ? 2 : 0);
}

function supporterDevelopmentScore(projection, playerIndex){
  const player = Number(playerIndex);
  const capacity = Number(projection?.baseSupportersPerTurn || 0)
    + Number(projection?.extraSupportersThisTurn?.[player] || 0);
  const used = Number(projection?.supportersSetThisTurn?.[player] || 0);
  const system = projection?.gameSettings?.healthPressureSeals === true ? projection?.moralePressure : null;
  const maxMorale = Math.max(1, Number(system?.maxMorale || 200));
  const expiring = !!system && Number(system.morale?.[player] || 0) / maxMorale <= .20;
  return Math.max(0, capacity - used) * (expiring ? 16 : 50);
}

function cardPressureDevelopment(card){
  if(!card || card.faceDown === true) return 0;
  const type = String(card.type || '');
  const affiliation = String(card.affiliation || card.aff || '').toLowerCase();
  let value = type === 'Initiator' ? 3 : (type === 'Dauntless' ? 5 : 0);
  if(affiliation === 'third_great_war') value += 1;
  // A point of shield prevents a point of cycle damage, so value it close to
  // Pressure without teaching the AI to abandon zone development entirely.
  if(affiliation === 'expanded_worlds') value += 2;
  return value;
}

function pressureUrgency(projection, playerIndex){
  const system = projection?.moralePressure;
  // Preserve the calibrated legacy policy exactly when the reversible
  // Morale/Pressure ruleset is disabled.
  if(!system) return 0;
  const player = Number(playerIndex);
  const opponent = player === 0 ? 1 : 0;
  const morale = Number(system.morale?.[player] || 0);
  const maxMorale = Math.max(1, Number(system.maxMorale || 200));
  const moraleRatio = morale/maxMorale;
  const pressureGap = Number(system.pressure?.[opponent] || 0) - Number(system.pressure?.[player] || 0);
  return 1 + Math.max(0, pressureGap) * .08 + (moraleRatio <= .20 ? .7 : (moraleRatio <= .40 ? .4 : (moraleRatio <= .60 ? .18 : 0)));
}

function moraleCardScore(card, projection, playerIndex, context = {}, destination = null){
  const system = projection?.gameSettings?.healthPressureSeals === true ? projection?.moralePressure : null;
  if(!system || projection?.gameSettings?.pressureCardReworks !== true || !card || card.faceDown === true) return 0;
  const player = Number(playerIndex);
  const opponent = player === 0 ? 1 : 0;
  const style = moraleStyle(context);
  const maxMorale = Math.max(1, Number(system.maxMorale || 200));
  const ownMorale = Math.max(0, Number(system.morale?.[player] || 0));
  const opponentMorale = Math.max(0, Number(system.morale?.[opponent] || 0));
  const ownScores = zoneScores(projection, player);
  const enemyScores = zoneScores(projection, opponent);
  const cycle = moraleCycle(ownScores, enemyScores);
  const id = String(card.id || '');
  let value = 0;
  if(id === '20') value += Math.min(ownMorale, cycle.incoming)*2.2*style.preservation;
  if(id === '33') value += Math.min(16, maxMorale-ownMorale)*1.55*style.preservation;
  if(id === '47') value += Math.min(10, opponentMorale)*1.7*style.aggression + (opponentMorale <= 10 ? 500 : 0);
  if(id === '64') value += cycle.outgoing*1.5*style.aggression;
  if(id === '65') value += Math.min(2, opponentMorale)*2.1*style.aggression;
  if(id === '45'){
    value -= 50*1.35*style.preservation;
    if(ownMorale <= 50) value -= 700;
    else value -= Math.max(0, thresholdBurden(ownMorale-50,maxMorale)-thresholdBurden(ownMorale,maxMorale))*style.preservation;
  }
  const zone = Number(destination?.z);
  if(Number.isInteger(zone) && zone >= 0 && zone <= 2){
    const zoneCards = projection?.board?.[zone]?.flat(2).filter(Boolean) || [];
    if(id === '34'){
      const affiliation = String(card.affiliation || card.aff || '').toLowerCase();
      value += zoneCards.filter(entry=>controllerOf(entry) === player && String(entry.affiliation || entry.aff || '').toLowerCase() === affiliation).length*2.4*style.aggression;
    }
    if(id === '35') value += Math.floor(cardFate(card)/2)*2.5*style.aggression;
    if(id === '44') value += zoneCards.filter(entry=>controllerOf(entry) === player && String(entry.type || '') === 'Dauntless').length*2.2*style.aggression;
  }
  return value;
}

export function scoreStrategicV3AiCommand(command, projection, context = {}){
  const payload = command?.payload || {};
  const playerIndex = Number(context.playerIndex ?? projection?.activePlayer ?? 0);
  const cards = selectedCards(command, projection);
  const totalFate = cards.reduce((total, card)=>total + cardFate(card), 0);
  const destination = destinationScore(command, projection, playerIndex);
  const moralePosition = commandMoralePositionScore(command, projection, playerIndex, context);
  if(command?.type === 'CONCEDE') return Number.NEGATIVE_INFINITY;
  if(command?.type === 'ANSWER_PROMPT'){
    if(payload.cancel) return 850;
    if(payload.choice === 'DECLINE') return 900;
    return 1000 + totalFate * 0.01;
  }
  if(command?.type === 'DISCARD_TO_HAND_LIMIT') return 980 - totalFate * 10;
  if(command?.type === 'ACTIVATE_EFFECT'){
    const source = cardByIid(projection, payload.sourceIid);
    const pressureBonus = String(source?.type || '') === 'Improvisor' ? 22 * pressureUrgency(projection, playerIndex) : 0;
    return 806 + totalFate + pressureBonus + moralePosition;
  }
  if(command?.type === 'ACTIVATE_LANDSCAPE') return 780 - Number(payload.discardIids?.length || 0) * 8 + totalFate * 0.1;
  if(command?.type === 'FLIP_CARD') return 740 + totalFate;
  if(command?.type === 'CONSOLIDATE_CARD'){
    const played = cardByIid(projection, payload.cardIid);
    const tributeFate = (payload.tributeIids || [])
      .map(iid=>cardByIid(projection, iid))
      .reduce((total, card)=>total + cardFate(card), 0);
    const pressureValue = payload.faceDown ? 0 : cardPressureDevelopment(played) * 9 * pressureUrgency(projection, playerIndex);
    const moraleCard = payload.faceDown ? 0 : moraleCardScore(played, projection, playerIndex, context, payload.destination);
    return 700 + cardFate(played) * 8 - tributeFate * 2 + destination + pressureValue + moralePosition + moraleCard + (payload.faceDown ? -5 : 0);
  }
  if(command?.type === 'SET_ADAPTIVE_TOKEN'){
    return 660 + declarationScore(payload) + destination;
  }
  // A deck-origin set is useful, but legacy self-play strongly prefers
  // developing a known hand card when both options are otherwise comparable.
  if(command?.type === 'SET_CARD_FROM_DECK') return 590 + destination + moralePosition;
  if(command?.type === 'SET_CARD'){
    const played = cardByIid(projection, payload.cardIid);
    return 620
      + cardFate(played) * 6
      + cardPressureDevelopment(played) * 9 * pressureUrgency(projection, playerIndex)
      + moraleCardScore(played, projection, playerIndex, context, payload.destination)
      + supporterDevelopmentScore(projection, playerIndex)
      + destination
      + moralePosition;
  }
  if(command?.type === 'MOVE_CARD') return 560 + destination + moralePosition;
  if(command?.type === 'END_TURN') return 0;
  return 100 + destination;
}

const RESOLUTION_COMMANDS = new Set([
  'ANSWER_PROMPT',
  'DISCARD_TO_HAND_LIMIT',
  'CHOOSE_TURN_ORDER'
]);

const PLANNING_CONFIG = Object.freeze({
  easy:Object.freeze({depth:2, beamWidth:3, branchWidth:4}),
  medium:Object.freeze({depth:3, beamWidth:4, branchWidth:5}),
  hard:Object.freeze({depth:4, beamWidth:5, branchWidth:6}),
  extreme:Object.freeze({depth:4, beamWidth:6, branchWidth:7})
});

function planningConfig(context = {}){
  const difficulty = String(context.difficulty || 'medium').toLowerCase();
  const base = PLANNING_CONFIG[difficulty] || PLANNING_CONFIG.medium;
  const requestedDepth = Number(context.planningDepth);
  return {
    ...base,
    depth:Number.isFinite(requestedDepth)
      ? Math.max(2, Math.min(4, Math.round(requestedDepth)))
      : base.depth
  };
}

function commandKey(command){
  return stableStringify(command || {});
}

function compareRankedCommands(left, right, projection, context){
  return scoreStrategicV3AiCommand(right, projection, context)
    - scoreStrategicV3AiCommand(left, projection, context)
    || stableStringify(left).localeCompare(stableStringify(right));
}

function boardPositionScore(projection, playerIndex, context = {}){
  const player = Number(playerIndex);
  const opponent = player === 0 ? 1 : 0;
  const ownScores = zoneScores(projection, player);
  const enemyScores = zoneScores(projection, opponent);
  let score = 0;
  let won = 0;
  let lost = 0;
  for(let zone = 0; zone < 3; zone += 1){
    const margin = ownScores[zone] - enemyScores[zone];
    score += margin * 6;
    if(margin > 0){
      won += 1;
      score += 24 + Math.min(20, margin * 2);
    }else if(margin < 0){
      lost += 1;
      score -= 20 + Math.min(18, Math.abs(margin) * 1.6);
    }else{
      score += 5;
    }
  }
  if(won >= 2) score += 70;
  if(won === 3) score += 24;
  if(lost >= 2) score -= 62;
  score += moralePositionScore(projection, player, ownScores, enemyScores, context);

  const own = projection?.players?.[player] || {};
  const enemy = projection?.players?.[opponent] || {};
  const ownHandCount = Array.isArray(own.hand) ? own.hand.length : Number(own.handCount || 0);
  const enemyHandCount = Array.isArray(enemy.hand) ? enemy.hand.length : Number(enemy.handCount || 0);
  score += (ownHandCount - enemyHandCount) * 2.5;

  for(const card of projection?.board?.flat(3).filter(Boolean) || []){
    if(card.faceDown === true) continue;
    const sign = controllerOf(card) === player ? 1 : (controllerOf(card) === opponent ? -1 : 0);
    if(!sign) continue;
    const type = String(card.type || '');
    const development = type === 'Supporter' ? 1.1
      : (type === 'Initiator' ? 2.4
        : (type === 'Improvisor' ? 3.2
          : (type === 'Coordinator' ? 3.8 : (type === 'Dauntless' ? 4.5 : 0))));
    score += sign * development;
  }

  if(projection?.outcome){
    const winner = Number(projection.outcome.winner);
    if(winner === player) score += 100000;
    else if(winner === opponent) score -= 100000;
  }
  return score;
}

function nodeSort(left, right){
  return right.score - left.score
    || right.actions - left.actions
    || stableStringify(left.sequence).localeCompare(stableStringify(right.sequence));
}

function actorOwnsResolution(state, playerIndex){
  return Number(state?.pendingPrompt?.playerIndex) === Number(playerIndex)
    || Number(state?.pendingHandLimit?.playerIndex) === Number(playerIndex);
}

function opponentOwnsResolution(state, playerIndex){
  const pendingPlayer = state?.pendingPrompt?.playerIndex ?? state?.pendingHandLimit?.playerIndex;
  return pendingPlayer !== undefined
    && pendingPlayer !== null
    && Number(pendingPlayer) !== Number(playerIndex);
}

function commandAdvancesPlan(command){
  return !RESOLUTION_COMMANDS.has(String(command?.type || ''));
}

function simulateCommand(state, command, context, serial){
  const actorId = String(context.playerId || state?.players?.[Number(context.playerIndex)]?.id || '');
  if(!actorId) return null;
  const result = reduceCommand(state, {
    ...command,
    commandId:`ai-plan:${state.revision}:${serial}`,
    matchId:state.matchId,
    expectedRevision:state.revision,
    payload:command?.payload || {}
  }, {playerId:actorId});
  return result.ok ? result.state : null;
}

/**
 * Build a deterministic, reversible 2-4 action turn plan with the same legal
 * command generator and reducer used by an authoritative match. Only player
 * projections are scored, so hidden hands are never read by the evaluator.
 */
export function planStrategicV3AiTurn(commands = [], projection, context = {}){
  const rootState = context.canonicalState;
  const playerIndex = Number(context.playerIndex ?? projection?.activePlayer ?? 0);
  if(!rootState || (playerIndex !== 0 && playerIndex !== 1)) return null;
  const config = planningConfig(context);
  const rootScore = boardPositionScore(projection, playerIndex, context);
  let serial = 0;
  let frontier = [{
    state:rootState,
    projection,
    sequence:[],
    actions:0,
    steps:0,
    score:rootScore,
    ended:false
  }];
  const completed = [];
  const maxReducerSteps = config.depth * 3 + 4;

  for(let pass = 0; pass < maxReducerSteps && frontier.length; pass += 1){
    const next = [];
    for(const node of frontier){
      const mustResolve = actorOwnsResolution(node.state, playerIndex);
      const stopped = node.ended
        || node.state?.outcome
        || opponentOwnsResolution(node.state, playerIndex)
        || (!mustResolve && Number(node.state?.activePlayer) !== playerIndex);
      if(stopped){
        completed.push(node);
        continue;
      }

      const legal = (node.sequence.length ? legalCommandTemplates(node.state, playerIndex) : commands)
        .filter(command=>command?.type !== 'CONCEDE');
      if(!legal.length){
        completed.push(node);
        continue;
      }
      const strategic = legal.filter(command=>command?.type !== 'END_TURN');
      const endings = legal.filter(command=>command?.type === 'END_TURN');
      const permitted = mustResolve
        ? legal
        : (node.actions >= config.depth
          ? endings
          : (strategic.length
            ? [...strategic, ...(node.actions >= 2 ? endings : [])]
            : legal));
      if(!permitted.length){
        completed.push(node);
        continue;
      }
      const ranked = permitted
        .sort((left, right)=>compareRankedCommands(left, right, node.projection, context));
      const candidates = !mustResolve && node.actions >= 2 && node.actions < config.depth && endings.length
        ? [
            ...ranked.filter(command=>command.type !== 'END_TURN').slice(0, Math.max(1, config.branchWidth - 1)),
            endings.sort((left, right)=>commandKey(left).localeCompare(commandKey(right)))[0]
          ]
        : ranked.slice(0, config.branchWidth);

      for(const command of candidates){
        const state = simulateCommand(node.state, command, context, ++serial);
        if(!state) continue;
        const nextProjection = projectStateForPlayer(state, playerIndex);
        const actionIncrement = commandAdvancesPlan(command) && command.type !== 'END_TURN' ? 1 : 0;
        const actions = node.actions + actionIncrement;
        const sequence = [...node.sequence, command];
        const prior = scoreStrategicV3AiCommand(command, node.projection, context);
        const score = boardPositionScore(nextProjection, playerIndex, context)
          + Math.max(-20, Math.min(20, prior * .02))
          + Math.min(actions, config.depth) * .35;
        const child = {
          state,
          projection:nextProjection,
          sequence,
          actions,
          steps:node.steps + 1,
          score,
          ended:command.type === 'END_TURN'
        };
        const childMustResolve = actorOwnsResolution(state, playerIndex);
        if(child.ended
          || state.outcome
          || opponentOwnsResolution(state, playerIndex)
          || (!childMustResolve && Number(state.activePlayer) !== playerIndex)){
          completed.push(child);
        }else{
          next.push(child);
        }
      }
    }
    next.sort(nodeSort);
    frontier = next.slice(0, config.beamWidth);
  }

  completed.push(...frontier);
  const viable = completed.filter(node=>node.sequence.length > 0);
  if(!viable.length) return null;
  viable.sort(nodeSort);
  const best = viable[0];
  return {
    command:best.sequence[0],
    sequence:best.sequence,
    score:best.score,
    actions:best.actions,
    depth:config.depth
  };
}

// This v3-only policy reads one player projection and returns one of the exact
// templates it was given. The adapter re-validates that template before the
// local session submits it to the shared reducer.
export function chooseStrategicV3AiCommand(commands = [], projection, context = {}){
  const cache = context.planCache;
  if(cache && Array.isArray(cache.sequence) && cache.sequence.length){
    const expected = cache.sequence[0];
    const matching = commands.find(command=>commandKey(command) === commandKey(expected));
    if(matching){
      cache.sequence.shift();
      return matching;
    }
    cache.sequence.length = 0;
  }
  const plan = planStrategicV3AiTurn(commands, projection, context);
  if(plan?.command){
    if(cache) cache.sequence = plan.sequence.slice(1);
    return plan.command;
  }
  return [...commands]
    .filter(command=>command?.type !== 'CONCEDE')
    .sort((left, right)=>compareRankedCommands(left, right, projection, context))[0] || null;
}
