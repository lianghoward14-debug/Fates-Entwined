// Approved reactive reserve. Shared by the client picker and authoritative rules.
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
  return !!card && SUPPORT_COMPANY_IDS.includes(String(card.id))
    && String(card.rarity).toLowerCase() !== 'star'
    && !card.retired && !card.temporarilyDisabled;
}
export function supportCompanyAvailability(uses, morale, moraleEnabled = true){
  const count = Number(uses) || 0;
  return {call:count === 0, desperate:count === 1 && moraleEnabled && Number(morale) > 0,
    cost:supportCompanyCost(morale)};
}
