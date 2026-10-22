export function emeraldChildrenEligible(state,player){
 const original=state.players[player]?.originalDeck;
 return Array.isArray(original) && original.every(card=>String(card.rarity).toLowerCase()!=='star');
}
export function emeraldChildrenFreeSet(state,player,card){return String(card?.id)==='120' && emeraldChildrenEligible(state,player);}
