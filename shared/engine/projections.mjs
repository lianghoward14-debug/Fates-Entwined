import {emeraldChildrenEligible} from './emerald-children.mjs';
import {cloneSerializable} from './serialization.mjs';
import {effectiveFate, isEffectSourceSuppressed} from './modifiers.mjs';
import {zoneScore} from './scoring.mjs';
import {flowerPickingStatus} from './cards/flower-picking.mjs';

function flowerPickingProjection(state, card){
  if(String(card.id)==='120')return {emeraldChildrenEligible:emeraldChildrenEligible(state,Number(card.controller ?? card.owner))};
  if(String(card.id) === '115'){
    const counts = new Map();
    for(const original of state.players[Number(card.controller ?? card.owner)]?.originalDeck || []){
      const affiliation = original.affiliation || original.aff;
      if(affiliation) counts.set(affiliation, (counts.get(affiliation) || 0) + 1);
    }
    return {loyalistEligible:[...counts.values()].some(count=>count >= 30)};
  }
  return String(card.id) === '84' ? {flowerPickingStatus:flowerPickingStatus(state, card)} : {};
}

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
    const projected = {...cloneSerializable(card), ...flowerPickingProjection(state, card), _authoritativeFate:fate};
    projected.statuses ||= [];
    if(isEffectSourceSuppressed(state, {card, z, r, c}) && !projected.statuses.includes('EFFECTS_SUPPRESSED')) projected.statuses.push('EFFECTS_SUPPRESSED');
    return projected;
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
    waitingForOpponent:true,
    ...(prompt.context==='JORGE_CALL_TO_ARMS'?{context:'JORGE_CALL_TO_ARMS'}:{})
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

function privatePlayer(player, state){
  return {
    ...publicPlayer(player),
    hand:player.hand.map(card=>({...cloneSerializable(card), ...flowerPickingProjection(state, card)}))
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

function unfrozenStateForPlayer(state, playerIndex){
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
    supportCompanyUses:cloneSerializable(state.supportCompanyUses || [0, 0]),
    supportCompanyPool:cloneSerializable(state.supportCompanyPool || []),
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
    players:state.players.map((player, index)=>({
      ...(index === viewer || state.landscapeId === 'igb12' ? privatePlayer(player, state) : publicPlayer(player)),
      ...(index === viewer ? {remainingDeck:cloneSerializable(player.deck).sort((a,b)=>
        String(a.id).localeCompare(String(b.id), 'en', {numeric:true}) || String(a.iid).localeCompare(String(b.iid)))} : {})
    })),
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

function unfrozenStateForSpectator(state, teammateIndex = null){
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
    supportCompanyUses:cloneSerializable(state.supportCompanyUses || [0, 0]),
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
    players:state.players.map((player,index)=>index === teammateIndex ? privatePlayer(player, state) : publicPlayer(player)),
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

function applySaboteurView(state,projection,viewer){
  const veil=state.saboteurVeil;
  if(!veil || state.turn>veil.untilTurn || state.outcome || viewer===veil.owner)return projection;
  const frozen=viewer==null ? veil.spectator : veil.opponent;
  const livePlayer=viewer==null ? null : cloneSerializable(projection.players[viewer]);
  const liveBoard=viewer==null ? null : cloneSerializable(projection.board);
  // Conceal individual board changes and action metadata, while keeping the
  // aggregate zone Fate totals public and current throughout the veil.
  for(const key of Object.keys(frozen))if(!['revision','phase','turn','activePlayer','pendingPrompt','pendingHandLimit','outcome','completedHands','zoneScores'].includes(key))projection[key]=cloneSerializable(frozen[key]);
  // The opponent must still see their own draws and placements during the
  // intervening turn of this three-turn effect.
  if(livePlayer){
    projection.players[viewer]=livePlayer;
    for(let z=0;z<liveBoard.length;z++)for(let r=0;r<liveBoard[z].length;r++)for(let c=0;c<liveBoard[z][r].length;c++){
      const live=liveBoard[z][r][c],old=projection.board[z][r][c];
      if(live && Number(live.controller ?? live.owner)===viewer)projection.board[z][r][c]=live;
      else if(old && Number(old.controller ?? old.owner)===viewer)projection.board[z][r][c]=null;
    }
  }
  projection.saboteurConcealment={active:true,owner:veil.owner,untilTurn:veil.untilTurn};
  if(projection.pendingPrompt && state.activePlayer===veil.owner && !projection.pendingPrompt.waitingForOpponent){
    delete projection.pendingPrompt.sourceIid;
    projection.pendingPrompt.title='Hidden card action';
    projection.pendingPrompt.prompt='An action is concealed by Anarquista Saboteur.';
  }
  return projection;
}
export function projectStateForPlayer(state,playerIndex){return applySaboteurView(state,unfrozenStateForPlayer(state,playerIndex),Number(playerIndex));}
export function projectStateForSpectator(state,teammateIndex=null){return applySaboteurView(state,unfrozenStateForSpectator(state,teammateIndex),teammateIndex);}

export function projectEvents(events, playerIndex){
  return (events || [])
    .filter(event=>(!Array.isArray(event.privateTo) || event.privateTo.includes(Number(playerIndex)))
      && (!event.hiddenSource || Number(event.sourceController) === Number(playerIndex))
      && !(String(event.semanticSourceCardId||'')==='102'
        && String(event.type||'')!=='HIDDEN_BOMB_EXPLODED'
        && !(event.type==='CARD_DISCARDED' && event.reason==='THE_BLACK_ROSE_BOMB')
        && Number(event.sourceController) !== Number(playerIndex)))
    .map(event=>{
      const clone = cloneSerializable(event);
      delete clone.privateTo;
      if(clone.type === 'FISH_COUNTER_CREATED' && Number(clone.playerIndex) !== Number(playerIndex)){
        delete clone.createdIids;
      }
      return clone;
    });
}

export function projectEventsForSpectator(events){
  return (events || []).filter(event=>!Array.isArray(event.privateTo) && !event.hiddenSource).map(event=>{
    const clone = cloneSerializable(event);
    if(clone.type === 'FISH_COUNTER_CREATED') delete clone.createdIids;
    return clone;
  });
}
