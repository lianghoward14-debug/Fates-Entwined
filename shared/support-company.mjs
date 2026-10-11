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

export const SUPPORT_COMPANY_CATEGORIES = Object.freeze([
 ['power','Fate & Power','Build strength and amplify bonuses.','01 02 03 05 07 11 15 19 22 23 25 38 40 41 44 45 46 51 55 57 59 63 65 66 73 76 77 83 85 86 87 88 89 90 95 100 101 bh02 bh07 bh08 bh09 bh11 bh12 bh13 bh15 bh17 bh19 bh23 bh25'],
 ['weaken','Weaken','Reduce enemy Fate and zone strength.','10 31 36 61 70 93 104 bh04 bh16 bh18'],
 ['remove','Remove','Discard opposing cards from the field.','14 16 30 102'],
 ['disrupt','Disrupt','Stop effects and interfere with enemy plans.','04 14 18 21 50 52 53 56 61 62 67 70 71 72 79 81 97 102 104 bh03 bh21'],
 ['protect','Protect & Recover','Protect cards and restore Morale.','12 20 33 79 101 106 bh01 bh22'],
 ['draw','Draw & Search','Find the cards you need.','06 07 08 13 27 29 32 42 48 60 68 72 80 84 86 90 91 94 103 bh01 bh05 bh10'],
 ['recycle','Recycle','Recover discarded resources.','08 29 48 58 69 96'],
 ['deploy','Deploy','Gain Reinforcement and deployment options.','02 07 08 09 24 28 49 73 74 91 92 98 bh06 bh10 bh24'],
 ['position','Position & Terrain','Move cards and reshape the battlefield.','02 17 39 43 54 62 81 82 bh01'],
 ['morale','Morale Pressure','Deal or amplify Morale damage.','34 35 47 64 106'],
 ['tactics','Special Tactics','Copy effects, gather intelligence, and adapt.','26 37 66 71 75 78 99 bh05 bh06 bh14 bh20']
].map(([id,name,description,ids])=>Object.freeze({id,name,description,cardIds:Object.freeze(ids.split(' '))})));
export function supportCompanyOffers(cards, seed, player, category){
 const group=SUPPORT_COMPANY_CATEGORIES.find(c=>c.id===category);
 if(!group)return [];
 const choices=[...new Set(cards.filter(supportCompanyCardEligible).filter(c=>group.cardIds.includes(String(c.id))).map(c=>String(c.id)))].sort();
 // Stable per match and seat; reopening cannot reroll an offer.
 let value=2166136261;
 for(const ch of `${seed}:${player}:${category}`)value=Math.imul(value^ch.charCodeAt(0),16777619)>>>0;
 const random=()=>{value=(value+0x6D2B79F5)|0;let t=Math.imul(value^(value>>>15),1|value);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};
 for(let i=choices.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[choices[i],choices[j]]=[choices[j],choices[i]];}
 return choices.slice(0,3);
}
