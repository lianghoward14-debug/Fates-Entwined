import {isRetiredCard} from './card-availability.mjs';
// Previous reserve IDs retained for compatibility with older fixtures.
export const SUPPORT_COMPANY_IDS = Object.freeze([
  '16','18','21','26','30','36','39','50','52','53','61','67','79','81','86','97','bh16','bh18'
]);
export const SUPPORT_COMPANY_NAMES = Object.freeze({
  call:'Call to Arms', desperate:'Desperate Reinforcement'
});
export function supportCompanyCost(morale){
  return Math.ceil(Math.max(0, Number(morale) || 0) / 2);
}
export function supportCompanyCardEligible(card){
  return !!card && ['Supporter', 'Coordinator', 'Initiator', 'Dauntless', 'Improvisor'].includes(card.type)
    && String(card.rarity).toLowerCase() !== 'star'
    && !isRetiredCard(card);
}
export function createSupportCompanyPool(cards, random = Math.random){
  const eligible = [...new Map(cards.filter(supportCompanyCardEligible).map(card=>[String(card.id), card])).values()];
  return [['Supporter', 10], ['Character', 5]].flatMap(([type, count])=>{
    const choices = eligible.filter(card=>type === 'Supporter' ? card.type === 'Supporter' : card.type !== 'Supporter').map(card=>String(card.id));
    for(let i=choices.length-1;i>0;i--){
      const j=Math.floor(random()*(i+1));
      [choices[i],choices[j]]=[choices[j],choices[i]];
    }
    return choices.slice(0,count);
  });
}
export function supportCompanyAvailability(uses, morale, moraleEnabled = true){
  const count = Number(uses) || 0;
  return {call:count === 0, desperate:count === 1 && moraleEnabled && Number(morale) > 0,
    cost:supportCompanyCost(morale)};
}
