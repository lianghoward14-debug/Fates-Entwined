import {flowerPickingEligible} from './draw-effects.mjs';
import {isEffectSourceSuppressed} from '../modifiers.mjs';

// The activation gate and its public status must use the same live conditions.
export function flowerPickingBlockReason(state, controller, source){
  const player = state.players[controller];
  if(!flowerPickingEligible(player)) return typeof player?.flowerPickingEligible === 'boolean'
    ? 'ORIGINAL_DECK_CONTAINS_DRAW_EFFECT' : 'ORIGINAL_DECK_ELIGIBILITY_UNKNOWN';
  if(isEffectSourceSuppressed(state, source)) return 'EFFECT_SUPPRESSED';
  if(!player.deck.length) return 'NO_LEGAL_TARGETS';
  return null;
}

export function flowerPickingStatus(state, card){
  const controller = Number(card.controller ?? card.owner);
  if(state.pendingPrompt?.sourceIid === card.iid || state.effectStack?.some(frame=>frame.sourceIid === card.iid)) return 'RESOLVING';
  if(card.counters?.whenSetResolved) return 'RESOLVED';
  return flowerPickingBlockReason(state, controller, card) || 'ELIGIBLE';
}
