import {cloneSerializable} from './serialization.mjs';
import {effectiveFate} from './modifiers.mjs';
import {zoneScore} from './scoring.mjs';

function hiddenSource(state, iid, viewer){
  const source = state.board.flat(2).find(card=>card && String(card.iid) === String(iid));
  return source?.faceDown === true && (viewer == null || Number(source.controller ?? source.owner) !== Number(viewer));
}
function boardProjection(state, viewer){
  return state.board.map((zone,z)=>zone.map((row,r)=>row.map((card,c)=>{
    if(!card) return null;
    const fate = effectiveFate(state, {card, zone:'board', z, r, c});
    if(hiddenSource(state, card.iid, viewer)) return {
      iid:card.iid, owner:card.owner, controller:card.controller, faceDown:true, hidden:true,
      name:'Face-down card', img:'back.png', statuses:[], counters:{}, _authoritativeFate:fate
    };
    return {...cloneSerializable(card), _authoritativeFate:fate};
  })));
}
function statusesProjection(state, viewer){
  return cloneSerializable(state.statuses.filter(status=>(!status.hiddenSource || (viewer != null && Number(status.sourceController) === Number(viewer))) && !hiddenSource(state, status.sourceIid, viewer)));
}

function geometryProjection(state,viewer){
  const result=cloneSerializable(state.geometry);
  result.squareStatuses=(result.squareStatuses||[]).filter(status=>
    status?.privateToOwner!==true||Number(status.playerIndex)===Number(viewer)
  );
  return result;
}


function promptProjection(prompt, viewerIndex, state){
  if(!prompt) return null;
  if(Number(prompt.playerIndex) === Number(viewerIndex)){
    const result = cloneSerializable(prompt);
    if(hiddenSource(state, prompt.sourceIid, viewerIndex) || state.board.flat(2).some(card=>card && String(card.iid)===String(prompt.sourceIid) && String(card.id)==='102' && Number(card.controller??card.owner)!==Number(viewerIndex))){
      delete result.sourceIid;
      result.hiddenSource = true;
      result.title = 'Hidden effect activated';
      result.prompt = 'Your opponent activated a face-down card. Its identity and effect details are hidden. You may still negate the effect.';
    }
    return result;
  }
  const promptSource=state.board.flat(2).find(card=>card&&String(card.iid)===String(prompt.sourceIid));
  if(String(promptSource?.id||'')==='102') return null;
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
    photoURL:player.photoURL || 'blank.png',
    rankElo:Math.max(0, Math.round(Number(player.rankElo) || 600)),
    flowerPickingEligible:player.flowerPickingEligible ?? null,
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
    board:boardProjection(state, viewer),
    zoneScores:state.board.map((_, z)=>[zoneScore(state,z,0), zoneScore(state,z,1)]),
    geometry:geometryProjection(state,viewer),
    statuses:statusesProjection(state, viewer),
    pendingPrompt:promptProjection(state.pendingPrompt, viewer, state),
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
  const viewer = teammateIndex;
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
    board:boardProjection(state, viewer),
    zoneScores:state.board.map((_,z)=>[zoneScore(state,z,0),zoneScore(state,z,1)]),
    geometry:geometryProjection(state,viewer),
    statuses:statusesProjection(state, viewer),
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
    .filter(event=>(!Array.isArray(event.privateTo) || event.privateTo.includes(Number(playerIndex)))
      && (!event.hiddenSource || Number(event.sourceController) === Number(playerIndex))
      && !(String(event.semanticSourceCardId||'')==='102'
        && String(event.type||'')!=='HIDDEN_BOMB_EXPLODED'
        && Number(event.sourceController) !== Number(playerIndex)))
    .map(event=>{
      const clone = cloneSerializable(event);
      delete clone.privateTo;
      return clone;
    });
}

export function projectEventsForSpectator(events){
  return (events || []).filter(event=>!Array.isArray(event.privateTo) && !event.hiddenSource).map(cloneSerializable);
}
