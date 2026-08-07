import {
  ENGINE_VERSION,
  RULESET_VERSION,
  SCHEMA_VERSION,
  createLandscapeState,
  createRngState,
  nextUint32,
  zoneScore
} from '../shared/engine/index.mjs';

const ENGINE_COMMAND_TYPES = new Set([
  'SET_CARD',
  'SET_CARD_FROM_DECK',
  'SET_ADAPTIVE_TOKEN',
  'CONSOLIDATE_CARD',
  'MOVE_CARD',
  'FLIP_CARD',
  'ACTIVATE_EFFECT',
  'ACTIVATE_LANDSCAPE',
  'ANSWER_PROMPT',
  'DISCARD_TO_HAND_LIMIT',
  'END_TURN',
  'CONCEDE'
]);

function nonNegativeInteger(value, fallback = 0){
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function pair(value, fallback = 0){
  return [0, 1].map(index=>nonNegativeInteger(value?.[index], fallback));
}

function legacyCardToEngine(card, fallbackOwner){
  if(!card) return null;
  const owner = [0, 1].includes(Number(card.owner)) ? Number(card.owner) : Number(fallbackOwner);
  const controller = [0, 1].includes(Number(card.controller)) ? Number(card.controller) : owner;
  const baseFate = Number.isInteger(Number(card.baseFate))
    ? Number(card.baseFate)
    : (Number.isInteger(Number(card.fate)) ? Number(card.fate) : 0);
  const currentFate = Math.max(0, Number(card.currentFate ?? card.fate ?? baseFate) || 0);
  const counters = card.counters && typeof card.counters === 'object' && !Array.isArray(card.counters)
    ? {...card.counters}
    : {};
  for(const key of [
    'bonusFate',
    'usesLeft',
    'lastMoveTurn',
    'effectUses',
    'pierogiCounter',
    'adaptiveToken',
    'whisperLandscapeToken'
  ]){
    if(card[key] !== undefined && counters[key] === undefined) counters[key] = card[key];
  }
  if(card._specterTurnsOnField !== undefined && counters.specterTurnsOnField === undefined){
    counters.specterTurnsOnField = card._specterTurnsOnField;
  }
  if(card._specterFateGains !== undefined && counters.specterFateGains === undefined){
    counters.specterFateGains = card._specterFateGains;
  }
  const statuses = Array.isArray(card.statuses) ? [...card.statuses].map(String) : [];
  if(card._bh03OpponentHand === true && !statuses.includes('OPPONENT_HAND_LIMIT_6')){
    statuses.push('OPPONENT_HAND_LIMIT_6');
  }
  if(card.cantBeReduced === true && !statuses.includes('FATE_REDUCTION_IMMUNE')){
    statuses.push('FATE_REDUCTION_IMMUNE');
  }
  if(card.cantBeMoved === true && !statuses.includes('MOVEMENT_IMMUNE')) statuses.push('MOVEMENT_IMMUNE');
  return {
    iid:String(card.iid || ''),
    id:String(card.id || ''),
    name:String(card.name || card.id || ''),
    ability:String(card.ability || ''),
    type:String(card.type || 'Supporter'),
    affiliation:String(card.affiliation || card.aff || ''),
    rarity:String(card.rarity || ''),
    baseFate,
    currentFate,
    cost:nonNegativeInteger(card.cost, 0),
    owner,
    controller,
    faceDown:card.faceDown === true,
    statuses:[...new Set(statuses)].sort(),
    counters
  };
}

function legacyBoardToEngine(board){
  const normalized = Array.from({length:3}, (_, z)=>{
    const sourceZone = Array.isArray(board?.[z]) ? board[z] : [];
    const rowCount = Math.max(3, sourceZone.length);
    return Array.from({length:rowCount}, (_, r)=>
      Array.from({length:3}, (_, c)=>legacyCardToEngine(sourceZone?.[r]?.[c], null))
    );
  });
  normalized.forEach(zone=>zone.forEach(row=>row.forEach(card=>{
    if(card?.id === '65') card.currentFate = Math.max(4, Number(card.currentFate) || 0);
  })));
  return normalized;
}

function reconstructedBoardStatuses(board){
  const statuses = [];
  board.forEach((zone, z)=>zone.forEach(row=>row.forEach(card=>{
    if(card?.id !== '78') return;
    statuses.push({
      statusId:`legacy-card-78:${card.iid}`,
      type:'FACE_DOWN_CONSOLIDATION_PERMISSION',
      playerIndex:card.controller,
      sourceIid:card.iid,
      zone:z,
      remaining:1
    });
  })));
  return statuses;
}

function rowOwner(legacy, zone, row){
  if(row === 0) return 1;
  if(row === 1) return -1;
  if(row === 2) return 0;
  const explicit = legacy?.rowOwners?.[zone]?.[row]
    ?? legacy?._rowOwners?.[zone]?.[row]
    ?? legacy?.extraCells?.[zone]?.[row]?.owner;
  return [0, 1].includes(Number(explicit)) ? Number(explicit) : (row % 2);
}

function geometryFromLegacy(legacy, board){
  const rowOwners = board.map((zone, z)=>zone.map((_row, r)=>rowOwner(legacy, z, r)));
  const playableExtraSquares = [];
  board.forEach((zone, z)=>zone.forEach((row, r)=>{
    if(r < 3) return;
    row.forEach((_card, c)=>playableExtraSquares.push({z, r, c, owner:rowOwners[z][r]}));
  }));
  const squareStatuses = (legacy?.blockedCells || []).map(cell=>({
    z:Number(cell.z ?? cell.zone),
    r:Number(cell.r ?? cell.row),
    c:Number(cell.c ?? cell.column),
    type:'PERMANENTLY_BLOCKED'
  })).filter(status=>[status.z, status.r, status.c].every(Number.isInteger));
  return {rowOwners, playableExtraSquares, squareStatuses};
}

function rngAtCounter(seed, counter){
  const rngState = createRngState(seed);
  for(let index = 0; index < nonNegativeInteger(counter, 0); index += 1) nextUint32(rngState);
  return rngState;
}

function uniquePlayerIds(players, actorIndex, actorId){
  const ids = players.map((player, index)=>String(player?.id || player?.name || `legacy-player-${index}`));
  if([0, 1].includes(Number(actorIndex)) && actorId) ids[Number(actorIndex)] = String(actorId);
  if(ids[0] === ids[1]) ids[1] = `${ids[1]}:p1`;
  return ids;
}

export function legacyRecorderStateToEngine(envelope, options = {}){
  const legacy = envelope?.format === 'fates-legacy-canonical-state-v1'
    ? envelope.state
    : envelope?.state || envelope;
  if(!legacy || !Array.isArray(legacy.players) || !Array.isArray(legacy.board)){
    throw Object.assign(new Error('legacy corpus entry is missing a captured game state'), {
      code:'LEGACY_STATE_UNTRANSLATABLE'
    });
  }
  const board = legacyBoardToEngine(legacy.board);
  const playerIds = uniquePlayerIds(legacy.players, options.playerIndex, options.playerId);
  const players = legacy.players.slice(0, 2).map((player, playerIndex)=>({
    id:playerIds[playerIndex],
    name:String(player?.name || `Player ${playerIndex + 1}`),
    deck:(player?.deck || []).map(card=>legacyCardToEngine(card, playerIndex)),
    hand:(player?.hand || []).map(card=>legacyCardToEngine(card, playerIndex)),
    discard:(player?.discard || []).map(card=>legacyCardToEngine(card, playerIndex)),
    limbo:(player?.limbo || []).map(card=>legacyCardToEngine(card, playerIndex)),
    score:nonNegativeInteger(player?.score, 0)
  }));
  if(players.length !== 2){
    throw Object.assign(new Error('legacy corpus state must contain two players'), {
      code:'LEGACY_STATE_UNTRANSLATABLE'
    });
  }
  const seed = String(options.seed || legacy.seed || legacy.matchSeed || 'legacy-unseeded');
  const rngState = rngAtCounter(seed, options.rngCounter ?? legacy._serverRngCounter);
  const activePlayer = Number(legacy.currentPlayer) === 1 ? 1 : 0;
  const landscapeId = String(legacy.landscapeId || '');
  const state = {
    schemaVersion:SCHEMA_VERSION,
    engineVersion:ENGINE_VERSION,
    rulesetVersion:RULESET_VERSION,
    matchId:String(options.matchId || legacy.matchId || `legacy-corpus-${options.index ?? 0}`),
    revision:0,
    phase:'main',
    coinFlip:null,
    turn:Math.max(1, nonNegativeInteger(legacy.turn, 1)),
    maxTurns:Math.max(1, nonNegativeInteger(legacy.maxTurns, 20)),
    baseHandLimit:Math.max(1, nonNegativeInteger(legacy.baseHandLimit, 12)),
    baseSupportersPerTurn:nonNegativeInteger(legacy.maxSupportsPerTurn, 2),
    supportersSetThisTurn:[0, 0],
    supportersSetTotal:pair(legacy.supportersSetTotal),
    supporterEffectsActivated:pair(legacy.supporterEffectsActivated),
    cardsPlacedThisTurn:pair(legacy._wojciechTurnPlacementCounts),
    cardsPlacedLastTurn:pair(legacy._wojciechLastTurnPlacementCounts),
    fateReductionEffectUses:pair(legacy.damageDoneP),
    extraSupportersThisTurn:[0, 0],
    queuedExtraSupporters:pair(legacy.queuedExtraSupporters),
    activePlayer,
    landscapeId,
    rngState,
    players,
    board,
    geometry:geometryFromLegacy(legacy, board),
    statuses:reconstructedBoardStatuses(board),
    effectStack:[],
    pendingPrompt:null,
    pendingHandLimit:null,
    outcome:null,
    eventSeq:0,
    instanceCounter:nonNegativeInteger(legacy.instanceCounter, 0)
  };
  state.supportersSetThisTurn[activePlayer] = nonNegativeInteger(legacy.supportsPlacedThisTurn, 0);
  state.extraSupportersThisTurn[activePlayer] = nonNegativeInteger(legacy.extraSupportsThisTurn, 0);
  state.landscapeState = createLandscapeState(landscapeId, state.rngState);
  return state;
}

function destinationFromLegacy(destination = {}){
  return {
    z:Number(destination.z ?? destination.zone),
    r:Number(destination.r ?? destination.row),
    c:Number(destination.c ?? destination.column)
  };
}

function legacyCardByIid(envelope, iid){
  const legacy = envelope?.format === 'fates-legacy-canonical-state-v1'
    ? envelope.state
    : envelope?.state || envelope;
  const needle = String(iid || '');
  for(const zone of legacy?.board || []){
    for(const row of zone || []){
      for(const card of row || []){
        if(String(card?.iid || '') === needle) return card;
      }
    }
  }
  return null;
}

export function legacyRecorderCommandToEngine(legacyCommand, state, action = {}){
  const source = legacyCommand || {};
  const type = String(source.type || '');
  let engineType = type;
  let payload = source.payload && typeof source.payload === 'object' ? {...source.payload} : {};
  if(type === 'LEGACY_SET_CARD'){
    engineType = source.source === 'deck' ? 'SET_CARD_FROM_DECK' : 'SET_CARD';
    payload = {cardIid:String(source.cardIid || ''), destination:destinationFromLegacy(source.destination)};
  }else if(type === 'LEGACY_CONSOLIDATE_CARD'){
    engineType = 'CONSOLIDATE_CARD';
    payload = {
      cardIid:String(source.cardIid || ''),
      tributeIids:(source.tributeIids || []).map(String),
      destination:destinationFromLegacy(source.destination)
    };
    const expectedCard = legacyCardByIid(action?.expectedPostState, source.cardIid);
    if(expectedCard?.faceDown === true) payload.faceDown = true;
  }else if(type.startsWith('LEGACY_')){
    engineType = type.slice('LEGACY_'.length);
    if(payload.destination) payload.destination = destinationFromLegacy(payload.destination);
  }
  if(!ENGINE_COMMAND_TYPES.has(engineType)){
    throw Object.assign(new Error(`legacy command ${type || '(missing)'} has no v3 translation`), {
      code:'LEGACY_COMMAND_UNTRANSLATABLE'
    });
  }
  return {
    commandId:String(source.commandId || `legacy-corpus:${action.index ?? 0}`),
    matchId:state.matchId,
    expectedRevision:state.revision,
    type:engineType,
    payload
  };
}

function cardSummary(card){
  if(!card) return null;
  return {
    iid:String(card.iid || ''),
    id:String(card.id || ''),
    owner:[0, 1].includes(Number(card.owner)) ? Number(card.owner) : null,
    currentFate:Math.max(0, Number(card.currentFate ?? card.fate) || 0),
    faceDown:card.faceDown === true
  };
}

export function engineVisibleOutcomes(state){
  const board = [];
  for(let zone = 0; zone < 3; zone += 1){
    for(let row = 0; row < (state?.board?.[zone]?.length || 0); row += 1){
      for(let column = 0; column < (state?.board?.[zone]?.[row]?.length || 0); column += 1){
        const card = state.board[zone][row][column];
        if(card) board.push({zone, row, column, card:cardSummary(card)});
      }
    }
  }
  return {
    turn:Number(state?.turn || 0) || 0,
    currentPlayer:Number(state?.activePlayer || 0) || 0,
    phase:String(state?.phase || ''),
    landscapeId:String(state?.landscapeId || ''),
    handCounts:(state?.players || []).map(player=>player?.hand?.length || 0),
    discardIds:(state?.players || []).map(player=>(player?.discard || []).map(card=>String(card?.id || ''))),
    board,
    zoneScores:[0, 1, 2].map(zone=>[0, 1].map(playerIndex=>zoneScore(state, zone, playerIndex)))
  };
}

export function normalizeLegacyExpectedOutcomes(action){
  const visible = action?.visibleOutcomes;
  if(visible && typeof visible === 'object' && Object.keys(visible).length){
    const normalized = structuredClone(visible);
    if(normalized.phase === 'draw' || normalized.phase === 'end') normalized.phase = 'main';
    if(Array.isArray(normalized.zoneScores)
      && normalized.zoneScores.flat().some(score=>score === null || score === undefined)){
      delete normalized.zoneScores;
    }
    for(const entry of normalized.board || []){
      if(entry?.card?.id === '65'){
        entry.card.currentFate = Math.max(4, Number(entry.card.currentFate) || 0);
      }
    }
    return normalized;
  }
  return engineVisibleOutcomes(legacyRecorderStateToEngine(action?.expectedPostState, {
    index:action?.index,
    playerId:action?.playerId,
    playerIndex:action?.playerIndex,
    seed:action?.rng?.seed,
    rngCounter:action?.rng?.counterAfter
  }));
}

function legacyEnvelopeState(envelope){
  return envelope?.format === 'fates-legacy-canonical-state-v1'
    ? envelope.state
    : envelope?.state || envelope;
}

function applyCompletedLegacyAliTransfers(state, action){
  const pre = legacyEnvelopeState(action?.preState);
  const post = legacyEnvelopeState(action?.expectedPostState);
  for(let playerIndex = 0; playerIndex < 2; playerIndex += 1){
    const recipient = playerIndex === 0 ? 1 : 0;
    for(const legacyCard of pre?.players?.[playerIndex]?.hand || []){
      if(String(legacyCard?.id || '') !== 'bh03' || legacyCard?._bh03OpponentHand === true) continue;
      const iid = String(legacyCard?.iid || '');
      const transferred = (post?.players?.[recipient]?.hand || []).some(card=>
        String(card?.iid || '') === iid && card?._bh03OpponentHand === true
      );
      if(!transferred) continue;
      const sourceHand = state.players[playerIndex].hand;
      const index = sourceHand.findIndex(card=>String(card?.iid || '') === iid);
      if(index < 0) continue;
      const card = sourceHand.splice(index, 1)[0];
      card.owner = recipient;
      card.controller = recipient;
      card.statuses.push('OPPONENT_HAND_LIMIT_6', 'HAND_EFFECT_IMMUNE');
      card.statuses = [...new Set(card.statuses)].sort();
      state.players[recipient].hand.push(card);
    }
  }
}

function inferredLegacyFollowupChoices(action){
  const choices = (action?.choices || []).filter(choice=>
    String(choice?.kind || '').startsWith('AI_RESOLVED_')
  );
  const pre = legacyEnvelopeState(action?.preState);
  const post = legacyEnvelopeState(action?.expectedPostState);
  const playerIndex = Number(action?.playerIndex) === 1 ? 1 : 0;
  const knownSelected = new Set(choices.map(choice=>String(choice?.selectedIid || '')).filter(Boolean));
  const preHand = new Set((pre?.players?.[playerIndex]?.hand || []).map(card=>String(card?.iid || '')));
  const postHand = new Set((post?.players?.[playerIndex]?.hand || []).map(card=>String(card?.iid || '')));
  const opponentIndex = playerIndex === 0 ? 1 : 0;
  const preOpponentHand = new Set((pre?.players?.[opponentIndex]?.hand || []).map(card=>String(card?.iid || '')));
  const postOpponentHand = new Set((post?.players?.[opponentIndex]?.hand || []).map(card=>String(card?.iid || '')));
  const preHandCards = new Map((pre?.players?.[playerIndex]?.hand || []).map(card=>[String(card?.iid || ''), card]));
  const playedIid = String(action?.command?.cardIid || '');
  const removedHandIids = [...preHand].filter(iid=>{
    if(iid === playedIid || postHand.has(iid)) return false;
    const card = preHandCards.get(iid);
    const transferredAli = String(card?.id || '') === 'bh03'
      && postOpponentHand.has(iid);
    return !transferredAli;
  });
  if(removedHandIids.length === 1){
    choices.push({kind:'AI_RESOLVED_CARD_SELECTION', selectedIid:removedHandIids[0]});
    knownSelected.add(removedHandIids[0]);
  }else if(removedHandIids.length > 1){
    choices.push({kind:'AI_RESOLVED_CARD_SELECTION', selectedIids:removedHandIids});
    removedHandIids.forEach(iid=>knownSelected.add(iid));
  }
  for(const card of post?.players?.[playerIndex]?.hand || []){
    const iid = String(card?.iid || '');
    const transferredAli = String(card?.id || '') === 'bh03'
      && card?._bh03OpponentHand === true
      && preOpponentHand.has(iid);
    if(iid && !preHand.has(iid) && !knownSelected.has(iid) && !transferredAli){
      choices.push({kind:'AI_RESOLVED_CARD_SELECTION', selectedIid:iid});
      knownSelected.add(iid);
    }
  }
  const commandCardId = String(action?.command?.cardId || '');
  if(commandCardId === '58'){
    const preDiscard = new Set((pre?.players?.[playerIndex]?.discard || []).map(card=>String(card?.iid || '')));
    const postDiscard = new Set((post?.players?.[playerIndex]?.discard || []).map(card=>String(card?.iid || '')));
    if([...preDiscard].every(iid=>postDiscard.has(iid))){
      choices.unshift({kind:'AI_RESOLVED_PROMPT_CHOICE', cancel:true});
    }
  }
  if(commandCardId === '06'){
    const preDeck = new Set((pre?.players?.[playerIndex]?.deck || []).map(card=>String(card?.iid || '')));
    const postDeck = new Set((post?.players?.[playerIndex]?.deck || []).map(card=>String(card?.iid || '')));
    if([...preDeck].every(iid=>postDeck.has(iid))){
      choices.unshift({kind:'AI_RESOLVED_PROMPT_CHOICE', cancel:true});
    }
  }
  if(commandCardId === '90'){
    const added = (post?.players?.[playerIndex]?.hand || []).filter(card=>
      !preHand.has(String(card?.iid || ''))
    );
    const declaredAffiliation = String(added[0]?.aff || added[0]?.affiliation || '');
    if(declaredAffiliation){
      choices.unshift({kind:'AI_RESOLVED_DECLARATION', choice:declaredAffiliation});
    }
  }
  if(commandCardId === '05' || commandCardId === '31'){
    const preCards = new Map();
    for(const zone of pre?.board || []) for(const row of zone || []) for(const card of row || []){
      if(card?.iid) preCards.set(String(card.iid), card);
    }
    const changed = [];
    for(const zone of post?.board || []) for(const row of zone || []) for(const card of row || []){
      const iid = String(card?.iid || '');
      const before = preCards.get(iid);
      if(!before && iid !== playedIid) continue;
      const beforeFate = before
        ? Number(before.currentFate ?? before.fate)
        : Number(card.baseFate ?? card.fate);
      const delta = Number(card.currentFate ?? card.fate) - beforeFate;
      if((commandCardId === '05' && delta > 0) || (commandCardId === '31' && delta < 0)){
        changed.push(iid);
      }
    }
    if(changed.length) choices.unshift({kind:'AI_RESOLVED_BOARD_TARGET', selectedIid:changed[0]});
  }
  return choices;
}

export function translateLegacyRecorderAction(action, corpus = {}){
  const state = legacyRecorderStateToEngine(action?.preState, {
    index:action?.index,
    playerId:action?.playerId,
    playerIndex:action?.playerIndex,
    seed:action?.rng?.seed || corpus?.seed,
    rngCounter:action?.rng?.counterBefore
  });
  applyCompletedLegacyAliTransfers(state, action);
  const command = legacyRecorderCommandToEngine(action?.command, state, action);
  return {
    state,
    command,
    actor:{
      playerId:state.players[Number(action?.playerIndex) === 1 ? 1 : 0].id,
      playerIndex:Number(action?.playerIndex) === 1 ? 1 : 0
    },
    followupChoices:inferredLegacyFollowupChoices(action),
    expected:normalizeLegacyExpectedOutcomes(action),
    normalizeActual:engineVisibleOutcomes
  };
}
