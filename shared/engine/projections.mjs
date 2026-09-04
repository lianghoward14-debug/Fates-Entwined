import {cloneSerializable} from './serialization.mjs';

function promptProjection(prompt, viewerIndex){
  if(!prompt) return null;
  if(Number(prompt.playerIndex) === Number(viewerIndex)) return cloneSerializable(prompt);
  return {
    promptId:prompt.promptId,
    type:prompt.type,
    playerIndex:prompt.playerIndex,
    waitingForOpponent:true
  };
}

function publicPlayer(player){
  return {
    id:player.id,
    name:player.name,
    rankElo:Math.max(0, Math.round(Number(player.rankElo) || 600)),
    deckCount:player.deck.length,
    handCount:player.hand.length,
    discard:cloneSerializable(player.discard),
    limboCount:player.limbo.length,
    score:player.score
  };
}

function privatePlayer(player){
  return {
    ...publicPlayer(player),
    hand:cloneSerializable(player.hand)
  };
}

function handLimitProjection(requirement, viewerIndex){
  if(!requirement) return null;
  return {
    playerIndex:requirement.playerIndex,
    limit:requirement.limit,
    required:requirement.required,
    waitingForOpponent:Number(requirement.playerIndex) !== Number(viewerIndex)
  };
}

export function projectStateForPlayer(state, playerIndex){
  const viewer = Number(playerIndex);
  if(viewer !== 0 && viewer !== 1) throw new Error('player projection requires player index 0 or 1');
  const projection = {
    schemaVersion:state.schemaVersion,
    engineVersion:state.engineVersion,
    rulesetVersion:state.rulesetVersion,
    matchId:state.matchId,
    revision:state.revision,
    phase:state.phase,
    turn:state.turn,
    maxTurns:state.maxTurns,
    makennaBirdCultActivated:state._makennaBirdCultActivated === true,
    activePlayer:state.activePlayer,
    coinFlip:cloneSerializable(state.coinFlip),
    baseHandLimit:state.baseHandLimit,
    baseSupportersPerTurn:state.baseSupportersPerTurn,
    supportersSetThisTurn:cloneSerializable(state.supportersSetThisTurn),
    supportersSetForCapThisTurn:cloneSerializable(state.supportersSetForCapThisTurn || state.supportersSetThisTurn || [0, 0]),
    supportersSetTotal:cloneSerializable(state.supportersSetTotal),
    supporterEffectsActivated:cloneSerializable(state.supporterEffectsActivated),
    cardsPlacedThisTurn:cloneSerializable(state.cardsPlacedThisTurn),
    cardsPlacedLastTurn:cloneSerializable(state.cardsPlacedLastTurn),
    fateReductionEffectUses:cloneSerializable(state.fateReductionEffectUses),
    extraSupportersThisTurn:cloneSerializable(state.extraSupportersThisTurn),
    queuedExtraSupporters:cloneSerializable(state.queuedExtraSupporters),
    testRules:cloneSerializable(state.testRules ?? null),
    landscapeId:state.landscapeId,
    gameSettings:cloneSerializable(state.gameSettings ?? null),
    turnTimerSeconds:state.turnTimerSeconds,
    landscapeState:cloneSerializable(state.landscapeState ?? null),
    aiTakeoverSeats:cloneSerializable(state.aiTakeoverSeats || []),
    warfrontForfeit:cloneSerializable(state.warfrontForfeit || null),
    moralePressure:cloneSerializable(state.moralePressure ?? null),
    players:state.players.map((player, index)=>
      index === viewer || state.landscapeId === 'igb12'
        ? privatePlayer(player)
        : publicPlayer(player)
    ),
    board:cloneSerializable(state.board),
    geometry:cloneSerializable(state.geometry),
    statuses:cloneSerializable(state.statuses),
    pendingPrompt:promptProjection(state.pendingPrompt, viewer),
    pendingHandLimit:handLimitProjection(state.pendingHandLimit, viewer),
    outcome:cloneSerializable(state.outcome ?? null),
    // Once the match is over there is no remaining competitive hand secrecy.
    // Participants may use this terminal-only reveal to build a complete replay
    // without weakening the live projection used during the match.
    completedHands:state.outcome
      ? state.players.map(player=>cloneSerializable(player.hand))
      : null
  };
  return projection;
}

export function projectStateForSpectator(state, teammateIndex = null){
  return {
    schemaVersion:state.schemaVersion,
    engineVersion:state.engineVersion,
    rulesetVersion:state.rulesetVersion,
    matchId:state.matchId,
    revision:state.revision,
    phase:state.phase,
    turn:state.turn,
    maxTurns:state.maxTurns,
    makennaBirdCultActivated:state._makennaBirdCultActivated === true,
    activePlayer:state.activePlayer,
    coinFlip:cloneSerializable(state.coinFlip),
    baseHandLimit:state.baseHandLimit,
    baseSupportersPerTurn:state.baseSupportersPerTurn,
    supportersSetThisTurn:cloneSerializable(state.supportersSetThisTurn),
    supportersSetForCapThisTurn:cloneSerializable(state.supportersSetForCapThisTurn || state.supportersSetThisTurn || [0, 0]),
    supportersSetTotal:cloneSerializable(state.supportersSetTotal),
    supporterEffectsActivated:cloneSerializable(state.supporterEffectsActivated),
    cardsPlacedThisTurn:cloneSerializable(state.cardsPlacedThisTurn),
    cardsPlacedLastTurn:cloneSerializable(state.cardsPlacedLastTurn),
    fateReductionEffectUses:cloneSerializable(state.fateReductionEffectUses),
    extraSupportersThisTurn:cloneSerializable(state.extraSupportersThisTurn),
    queuedExtraSupporters:cloneSerializable(state.queuedExtraSupporters),
    testRules:cloneSerializable(state.testRules ?? null),
    landscapeId:state.landscapeId,
    gameSettings:cloneSerializable(state.gameSettings ?? null),
    turnTimerSeconds:state.turnTimerSeconds,
    landscapeState:cloneSerializable(state.landscapeState ?? null),
    moralePressure:cloneSerializable(state.moralePressure ?? null),
    players:state.players.map((player,index)=>index === teammateIndex ? privatePlayer(player) : publicPlayer(player)),
    board:cloneSerializable(state.board),
    geometry:cloneSerializable(state.geometry),
    statuses:cloneSerializable(state.statuses),
    pendingPrompt:state.pendingPrompt ? {
      promptId:state.pendingPrompt.promptId,
      type:state.pendingPrompt.type,
      playerIndex:state.pendingPrompt.playerIndex
    } : null,
    pendingHandLimit:state.pendingHandLimit ? {
      playerIndex:state.pendingHandLimit.playerIndex,
      limit:state.pendingHandLimit.limit,
      required:state.pendingHandLimit.required
    } : null,
    outcome:cloneSerializable(state.outcome ?? null)
  };
}

export function projectEvents(events, playerIndex){
  return (events || [])
    .filter(event=>!Array.isArray(event.privateTo) || event.privateTo.includes(Number(playerIndex)))
    .map(event=>{
      const clone = cloneSerializable(event);
      delete clone.privateTo;
      return clone;
    });
}

export function projectEventsForSpectator(events){
  return (events || []).filter(event=>!Array.isArray(event.privateTo)).map(cloneSerializable);
}
