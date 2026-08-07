function isOpponentAli(card, playerIndex){
  return String(card?.id || '') === 'bh03'
    && (Number(card.owner) !== Number(playerIndex)
      || card.statuses?.includes('OPPONENT_HAND_LIMIT_6'));
}

function isSelfReplacingOpponentGuerilla(card, playerIndex){
  return String(card?.id || '') === '70'
    && Number(card.owner) !== Number(playerIndex)
    && !card.statuses?.includes('GUERILLA_INFILTRATING');
}

export function activeHandLimit(state, playerIndex){
  const player = state?.players?.[Number(playerIndex)];
  if(!player) return 0;
  const nominal = player.hand.some(card=>isOpponentAli(card, playerIndex))
    ? 6
    : Math.max(1, Number(state.baseHandLimit || 12) || 12);
  const protectedCount = player.hand.filter(card=>isProtectedHandLimitCard(card, playerIndex)).length;
  return Math.max(nominal, protectedCount);
}

export function isProtectedHandLimitCard(card, playerIndex){
  return isOpponentAli(card, playerIndex)
    || isSelfReplacingOpponentGuerilla(card, playerIndex)
    || card?.counters?.pierogiCounter === true
    || card?.statuses?.includes('HAND_EFFECT_IMMUNE');
}

export function refreshHandLimitRequirement(state){
  if(state.pendingPrompt || state.effectStack?.length){
    state.pendingHandLimit = null;
    return null;
  }
  const order = [state.activePlayer, state.activePlayer === 0 ? 1 : 0];
  for(const playerIndex of order){
    const player = state.players[playerIndex];
    const limit = activeHandLimit(state, playerIndex);
    const required = Math.max(0, player.hand.length - limit);
    if(required > 0){
      state.pendingHandLimit = {playerIndex, limit, required};
      return state.pendingHandLimit;
    }
  }
  state.pendingHandLimit = null;
  return null;
}
