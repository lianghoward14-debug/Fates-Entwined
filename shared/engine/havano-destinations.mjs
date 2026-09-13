import {openBoardDestinations,rowOwner,boardEntries,squareStatuses,controllerOf} from './selectors.mjs';
import {isEffectSourceSuppressed,zoneActionBlock} from './modifiers.mjs';
export function havanoDestinations(state,player){
  if(Number(state.supportersSetForCapThisTurn?.[player] || 0)>=5)return [];
  const enemies=boardEntries(state).filter(e=>e.card.id==='14' && controllerOf(e.card)!==player && !e.card.faceDown && !isEffectSourceSuppressed(state,e));
  return openBoardDestinations(state).filter(d=>{
    const owner=rowOwner(state,d.z,d.r);
    return (owner===player || owner===-1) && !zoneActionBlock(state,player,d.z)
      && !squareStatuses(state,d,'PERMANENTLY_BLOCKED').length
      && !enemies.some(e=>e.z===d.z && Math.abs(e.r-d.r)+Math.abs(e.c-d.c)===1);
  });
}
