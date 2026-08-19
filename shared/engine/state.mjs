import {ENGINE_VERSION, RULESET_VERSION, SCHEMA_VERSION} from './constants.mjs';
import {createRngState, nextInt, shuffleInPlace} from './rng.mjs';
import {cloneSerializable} from './serialization.mjs';
import {
  createLandscapeState,
  initializeLandscapeHandCards
} from './landscapes/runtime.mjs';

export function createEmptyBoard(){
  return Array.from({length:3}, ()=>Array.from({length:3}, ()=>Array.from({length:3}, ()=>null)));
}

function compactDefinition(definition, owner, iid){
  if(!definition || !definition.id) throw new Error('card definition is missing an id');
  const fate = Number(definition.fate || 0);
  const cost = Number(definition.cost || 0);
  if(!Number.isInteger(fate)) throw new Error(`card ${definition.id} Fate must be an integer`);
  if(!Number.isInteger(cost) || cost < 0) throw new Error(`card ${definition.id} cost must be a non-negative integer`);
  return {
    iid,
    id:String(definition.id),
    name:String(definition.name || definition.id),
    ability:String(definition.ability || ''),
    type:String(definition.type || 'Supporter'),
    affiliation:String(definition.affiliation || definition.aff || ''),
    rarity:String(definition.rarity || ''),
    baseFate:fate,
    currentFate:fate,
    cost,
    owner,
    controller:owner,
    faceDown:false,
    statuses:[],
    counters:{}
  };
}

function makeDeck(definitionsById, deckIds, playerIndex, matchId, instanceCounter){
  return deckIds.map(id=>{
    const definition = definitionsById.get(String(id));
    if(!definition) throw new Error(`unsupported card ${id}`);
    instanceCounter.value += 1;
    return compactDefinition(
      definition,
      playerIndex,
      `${matchId}:p${playerIndex}:c${instanceCounter.value}`
    );
  });
}

export function createInitialState(input = {}){
  const matchId = String(input.matchId || '');
  if(!matchId) throw new Error('matchId is required');
  const players = Array.isArray(input.players) ? input.players : [];
  if(players.length !== 2) throw new Error('exactly two players are required');
  const playerIds = players.map((player, playerIndex)=>String(player?.id || `player-${playerIndex + 1}`));
  if(new Set(playerIds).size !== playerIds.length) throw new Error('player IDs must be unique');
  const definitions = Array.isArray(input.cardDefinitions) ? input.cardDefinitions : [];
  const definitionsById = new Map(definitions.map(card=>[String(card.id), card]));
  const rngState = createRngState(input.seed || matchId);
  const instanceCounter = {value:0};
  const requestedHandSize = Number(input.handSize ?? 6);
  if(!Number.isInteger(requestedHandSize) || requestedHandSize < 0) throw new Error('handSize must be a non-negative integer');
  const handSize = Math.min(12, requestedHandSize);
  const requestedMaxTurns = Number(input.maxTurns ?? 20);
  if(!Number.isInteger(requestedMaxTurns) || requestedMaxTurns < 1) throw new Error('maxTurns must be a positive integer');
  const playerStates = players.map((player, playerIndex)=>{
    const ids = Array.isArray(player.deckIds) ? player.deckIds.map(String) : [];
    const deck = makeDeck(definitionsById, ids, playerIndex, matchId, instanceCounter);
    shuffleInPlace(deck, rngState);
    const openingExtras = deck.filter(card=>String(card.id || '') === '98');
    for(let index = deck.length - 1; index >= 0; index -= 1){
      if(String(deck[index].id || '') === '98') deck.splice(index, 1);
    }
    const hand = deck.splice(0, handSize);
    hand.push(...openingExtras);
    return {
      id:playerIds[playerIndex],
      name:String(player.name || `Player ${playerIndex + 1}`),
      deck,
      hand,
      discard:[],
      limbo:[],
      score:0
    };
  });
  for(let playerIndex = 0; playerIndex < 2; playerIndex += 1){
    const originals = playerStates[playerIndex].hand.filter(card=>String(card.id || '') === 'bh05');
    for(const original of originals){
      instanceCounter.value += 1;
      const duplicate = cloneSerializable(original);
      duplicate.iid = `${matchId}:p${playerIndex}:c${instanceCounter.value}`;
      duplicate.counters = {...duplicate.counters, taylorArrivalDuplicate:true};
      playerStates[playerIndex].hand.push(duplicate);
    }
  }
  const openingAli = [];
  for(let playerIndex = 0; playerIndex < 2; playerIndex += 1){
    for(const card of playerStates[playerIndex].hand){
      if(String(card.id || '') === 'bh03') openingAli.push({playerIndex, card});
    }
  }
  for(const {playerIndex, card} of openingAli){
    playerStates[playerIndex].hand = playerStates[playerIndex].hand.filter(item=>item !== card);
    const recipient = playerIndex === 0 ? 1 : 0;
    card.counters = {
      ...(card.counters || {}),
      aliTransferredFrom:playerIndex,
      aliHandLimitPendingUntilTurnStart:true
    };
    card.owner = recipient;
    card.controller = recipient;
    if(!card.statuses.includes('OPPONENT_HAND_LIMIT_6')) card.statuses.push('OPPONENT_HAND_LIMIT_6');
    if(!card.statuses.includes('HAND_EFFECT_IMMUNE')) card.statuses.push('HAND_EFFECT_IMMUNE');
    card.statuses.sort();
    playerStates[recipient].hand.push(card);
  }
  const openingSelvaCards = playerStates.map(player=>
    player.hand.filter(card=>String(card.id || '') === '74')
  );
  const queuedExtraSupporters = openingSelvaCards.map(cards=>cards.length);
  const requiresTurnChoice = input.requireTurnChoice === true;
  const coinWinner = requiresTurnChoice
    ? ([0, 1].includes(Number(input.coinWinner)) ? Number(input.coinWinner) : nextInt(rngState, 2))
    : null;
  const state = {
    schemaVersion:SCHEMA_VERSION,
    engineVersion:String(input.engineVersion || ENGINE_VERSION),
    rulesetVersion:String(input.rulesetVersion || RULESET_VERSION),
    matchId,
    revision:0,
    phase:requiresTurnChoice ? 'coin' : 'main',
    turn:1,
    maxTurns:requestedMaxTurns,
    baseHandLimit:12,
    baseSupportersPerTurn:2,
    supportersSetThisTurn:[0, 0],
    supportersSetTotal:[0, 0],
    supporterEffectsActivated:[0, 0],
    cardsPlacedThisTurn:[0, 0],
    cardsPlacedLastTurn:[0, 0],
    fateReductionEffectUses:[0, 0],
    extraSupportersThisTurn:[0, 0],
    queuedExtraSupporters,
    activePlayer:Number(input.activePlayer) === 1 ? 1 : 0,
    coinFlip:requiresTurnChoice ? {
      winner:coinWinner,
      face:coinWinner === 0 ? 'HEADS' : 'TAILS',
      choice:null,
      startingPlayer:null
    } : null,
    landscapeId:String(input.landscapeId || ''),
    gameSettings:input.gameSettings && typeof input.gameSettings === 'object'
      ? cloneSerializable(input.gameSettings)
      : null,
    turnTimerSeconds:Math.max(30, Math.min(600, Math.round(Number(input.turnTimerSeconds) || 180))),
    // Test rules are accepted only by the separately authenticated organic
    // fixture route in the server. Keeping the selected policy in canonical
    // state makes the shortcut auditable by both clients and prevents a test
    // from silently claiming production-rule coverage.
    testRules:input.testRules?.zeroReinforcementCost === true
      ? {zeroReinforcementCost:true}
      : null,
    rngState,
    players:playerStates,
    board:createEmptyBoard(),
    geometry:{
      rowOwners:Array.from({length:3}, ()=>[1, -1, 0]),
      playableExtraSquares:[],
      squareStatuses:[]
    },
    statuses:[],
    effectStack:[],
    pendingPrompt:null,
    pendingHandLimit:null,
    outcome:null,
    eventSeq:0,
    instanceCounter:instanceCounter.value
  };
  // Opening-hand arrival effects are part of match construction. Selva was
  // previously represented only by a queued numeric counter, so the starting
  // player received neither the first-turn bonus nor its authoritative status
  // banner. Preserve one public status per physical Pirate and activate the
  // chosen starting player's grants immediately when no coin choice remains.
  for(let playerIndex = 0; playerIndex < 2; playerIndex += 1){
    const activeNow = !requiresTurnChoice && state.activePlayer === playerIndex;
    for(const card of openingSelvaCards[playerIndex]){
      state.statuses.push({
        statusId:`selva-support:${card.iid}:opening`,
        type:'SELVA_EXTRA_SUPPORTER',
        playerIndex,
        sourceIid:card.iid,
        extraSupports:1,
        activeNow,
        remainingOwnerTurns:activeNow ? 1 : null
      });
    }
    if(activeNow && openingSelvaCards[playerIndex].length){
      state.extraSupportersThisTurn[playerIndex] += openingSelvaCards[playerIndex].length;
      state.queuedExtraSupporters[playerIndex] = 0;
    }
  }
  state.landscapeState = createLandscapeState(state.landscapeId, state.rngState);
  initializeLandscapeHandCards(state);
  return state;
}

export function cloneState(state){
  return cloneSerializable(state);
}
