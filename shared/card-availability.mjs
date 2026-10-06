// Keep retired rules defined for saved games, but exclude them from live pools.
export const TEMPORARILY_RETIRED_CARD_IDS = Object.freeze(['101', '102', '103']);
export function isRetiredCard(card){
  return TEMPORARILY_RETIRED_CARD_IDS.includes(String(card?.id ?? card))
    || card?.retired === true || card?.temporarilyDisabled === true;
}
