// Actual draw-producing effects. Merely searching, referencing a draw phase,
// reacting to draws, or copying another card is not itself a Draw effect.
export const DRAW_EFFECT_CARD_IDS=Object.freeze(['27','32','42','80','86','bh01']);
export function flowerPickingEligible(player){
  if(typeof player?.flowerPickingEligible==='boolean')return player.flowerPickingEligible;
  // Old saves without the original-list flag cannot become eligible just
  // because their draw cards have left the pile.
  return false;
}
