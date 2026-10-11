(function(){
 'use strict';
 const seen=new Set();
 const owner=card=>Number(card.controller ?? card.owner);
 function entries(state){
  const result=[];
  (state?.board||[]).forEach((zone,z)=>zone.forEach((row,r)=>row.forEach((card,c)=>{if(card)result.push({card,z,r,c});})));
  return result;
 }
 function eligible(card){
  if(card.faceDown && card.contributesFate===false)return false;
  if(card.noBonus || ['76','bh01'].includes(String(card.id)))return false;
  if((card.statuses||[]).some(status=>['IMMUNE_TO_ALL_EFFECTS','EFFECT_IMMUTABLE','HAND_EFFECT_IMMUNE'].includes(status)))return false;
  if(typeof isFullyEffectImmuneCard==='function' && isFullyEffectImmuneCard(card))return false;
  return true;
 }
 function active(entry){
  const card=entry.card;
  const id=String(card.counters?.copiedPassiveId || card.counters?.copiedEffectId || card._bh05CopiedPassiveId || card.id);
  if(id!=='106' || card.faceDown || card.contributesAuras===false)return false;
  if(card._effectNegatedByReaction || card._effectSuppressedByReaction || card._reactionSuppressed || card._lydiaSuppressed || card._lumberjackSuppressed)return false;
  if((card.statuses||[]).includes('EFFECTS_SUPPRESSED'))return false;
  if(typeof isCoordinatorSuppressedAt==='function' && isCoordinatorSuppressedAt(entry.z,entry.r,entry.c))return false;
  return Math.floor(Number(card.counters?.joseFieldTurns ?? card._joseFieldTurns ?? 0)/3)>0;
 }
 function flash(target,tier,key){
  const identity=key+':'+target.iid;
  if(seen.has(identity))return false;
  const live=entries(window.getFateGameState?.()).find(entry=>String(entry.card.iid)===String(target.iid))?.card || target;
  const marked=window.flashCardEffect?.(live,'jose_clock',{label:'The Long Game · +'+tier+' Fate',pitchStep:tier-1,soundKey:key,onlineRemote:true,waitForConsolidationCinematic:true});
  if(marked){seen.add(identity);if(seen.size>1000)seen.delete(seen.values().next().value);}
  return !!marked;
 }
 window.presentJoseAuraArrival=function(card,key,state){
  const board=entries(state || window.getFateGameState?.());
  const target=board.find(entry=>String(entry.card.iid)===String(card?.iid));
  if(!target || !eligible(target.card))return false;
  let marked=false;
  for(const source of board){
   if(source.z!==target.z || owner(source.card)!==owner(target.card) || !active(source))continue;
   const tier=Math.floor(Number(source.card.counters?.joseFieldTurns ?? source.card._joseFieldTurns)/3);
   marked=flash(target.card,tier,String(key)+':jose-arrival:'+source.card.iid)||marked;
  }
  return marked;
 };
 window.presentJoseLongGameEvent=function(event,key,source,state){
  const current=state || window.getFateGameState?.();
  const board=entries(current);
  if(['CARD_SET','CARD_CONSOLIDATED','CARD_MOVED'].includes(event?.type)){
   if(event.type==='CARD_SET' && event.consolidated)return false;
   const target=board.find(entry=>String(entry.card.iid)===String(event.cardIid))?.card;
   return window.presentJoseAuraArrival(target,key,current);
  }
  if(event?.type!=='CARD_COUNTER_SET'||event.counterKey!=='joseFieldTurns'||!(event.value>0)||event.value%3!==0)return false;
  const origin=board.find(entry=>String(entry.card.iid)===String(event.cardIid));
  if(!origin || !active(origin))return false;
  const tier=Math.floor(Number(event.value)/3);
  const identity=String(key)+':'+event.cardIid+':'+event.value;
  let marked=false;
  for(const target of board){
   if(target.z===origin.z && owner(target.card)===owner(origin.card) && eligible(target.card))marked=flash(target.card,tier,identity)||marked;
  }
  return marked;
 };
})();
