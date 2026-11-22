export function emeraldChildrenEligible(state,player){
 const original=state.players[player]?.originalDeck;
 return Array.isArray(original) && original.every(card=>String(card.rarity).toLowerCase()!=='star');
}
export function emeraldChildrenFreeSet(){return false;}
