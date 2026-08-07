const EPHEMERAL_KEYS = new Set([
  '_aiAbort',
  '_aiAborted',
  '_aiRunning',
  '_aiTurnToken',
  '_effectActivationInFlight',
  '_effectFlash',
  '_onlineEffectActivationSubmitPending',
  '_onlineSetResolutionInFlight',
  '_onlineSetResolutionPending',
  '_pendingWhenSetActivationInFlight',
  '_placementFateReveal',
  '_presentationDeparting',
  'gameLog',
  'hoveredCard',
  'selectedBoardCard',
  'selectedHandCard'
]);

function normalizeLegacyValue(value, seen){
  if(value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if(typeof value === 'number') return Number.isFinite(value) ? (Object.is(value, -0) ? 0 : value) : null;
  if(typeof value === 'bigint') return value.toString();
  if(typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') return undefined;
  if(seen.has(value)) return undefined;
  seen.add(value);
  let result;
  if(Array.isArray(value)){
    result = value.map(item=>{
      const normalized = normalizeLegacyValue(item, seen);
      return normalized === undefined ? null : normalized;
    });
  }else if(value instanceof Set){
    result = [...value]
      .map(item=>normalizeLegacyValue(item, seen))
      .filter(item=>item !== undefined)
      .sort((left, right)=>JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }else if(value instanceof Map){
    result = [...value.entries()]
      .map(([key, item])=>[
        normalizeLegacyValue(key, seen),
        normalizeLegacyValue(item, seen)
      ])
      .filter(([key, item])=>key !== undefined && item !== undefined)
      .sort((left, right)=>JSON.stringify(left[0]).localeCompare(JSON.stringify(right[0])));
  }else{
    const prototype = Object.getPrototypeOf(value);
    if(prototype !== Object.prototype && prototype !== null){
      seen.delete(value);
      return undefined;
    }
    result = {};
    for(const key of Object.keys(value).sort()){
      if(EPHEMERAL_KEYS.has(key)) continue;
      const normalized = normalizeLegacyValue(value[key], seen);
      if(normalized !== undefined) result[key] = normalized;
    }
  }
  seen.delete(value);
  return result;
}

export function captureLegacyCanonicalState(gameState){
  const normalized = normalizeLegacyValue(gameState, new Set());
  if(!normalized || !Array.isArray(normalized.players) || !Array.isArray(normalized.board)){
    throw new Error('legacy recorder requires an active serializable game state');
  }
  return {
    format:'fates-legacy-canonical-state-v1',
    state:normalized
  };
}

function cardSummary(card){
  if(!card) return null;
  return {
    iid:String(card.iid || ''),
    id:String(card.id || ''),
    owner:Number.isInteger(Number(card.owner)) ? Number(card.owner) : null,
    currentFate:Math.max(0, Number(card.currentFate ?? card.fate) || 0),
    faceDown:card.faceDown === true
  };
}

export function captureLegacyVisibleOutcomes(gameState, scoreZone){
  const board = [];
  for(let zone = 0; zone < 3; zone += 1){
    const rows = Array.isArray(gameState?.board?.[zone]) ? gameState.board[zone] : [];
    for(let row = 0; row < rows.length; row += 1){
      for(let column = 0; column < (rows[row]?.length || 0); column += 1){
        const card = rows[row][column];
        if(card) board.push({zone, row, column, card:cardSummary(card)});
      }
    }
  }
  const zoneScores = [0, 1, 2].map(zone=>[0, 1].map(playerIndex=>{
    if(typeof scoreZone !== 'function') return null;
    try{
      return Number(scoreZone(zone, playerIndex)) || 0;
    }catch(_error){
      return null;
    }
  }));
  return {
    turn:Number(gameState?.turn || 0) || 0,
    currentPlayer:Number(gameState?.currentPlayer || 0) || 0,
    phase:String(gameState?.phase || ''),
    landscapeId:String(gameState?.landscapeId || ''),
    handCounts:(gameState?.players || []).map(player=>player?.hand?.length || 0),
    discardIds:(gameState?.players || []).map(player=>(player?.discard || []).map(card=>String(card?.id || ''))),
    board,
    zoneScores
  };
}

export function legacyCommandFromAIMove(move){
  const card = move?.card || {};
  const base = {
    type:move?.type === 'consolidate' ? 'LEGACY_CONSOLIDATE_CARD' : 'LEGACY_SET_CARD',
    cardIid:String(card.iid || ''),
    cardId:String(card.id || ''),
    source:move?.fromDeck ? 'deck' : 'hand',
    destination:{
      zone:Number(move?.z),
      row:Number(move?.r),
      column:Number(move?.c)
    }
  };
  if(move?.type === 'consolidate'){
    base.tributeIids = (move.tributes || []).map(tribute=>String(tribute?.card?.iid || ''));
    base.tributeLocations = (move.tributes || []).map(tribute=>({
      zone:Number(tribute?.z),
      row:Number(tribute?.r),
      column:Number(tribute?.c)
    }));
  }
  return base;
}

export function legacyChoicesFromAIMove(move){
  return [{
    kind:'AI_MOVE_SELECTION',
    moveType:String(move?.type || ''),
    destination:{
      zone:Number(move?.z),
      row:Number(move?.r),
      column:Number(move?.c)
    },
    tributeIids:(move?.tributes || []).map(tribute=>String(tribute?.card?.iid || ''))
  }];
}
