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
 ['power','Power','Recruit strong units and build their own Fate.','14 21 38 41 44 45 46 55 63 65 66 76 85 86 88 89 95 100 101 104 107 109 bh09 bh23'],
 ['empower','Empower','Strengthen your other cards and amplify Fate bonuses.','01 05 11 15 19 22 23 25 40 44 51 57 59 73 77 83 87 90 106 112 bh02 bh07 bh08 bh11 bh12 bh13 bh15 bh17 bh19 bh24 bh25'],
 ['weaken','Weaken','Reduce enemy Fate and zone strength.','10 31 36 61 70 93 bh04 bh16'],
 ['lockdown','Lockdown','Restrict squares, deployment, and consolidation.','04 14 17 50 53 62 81 97 114'],
 ['sabotage','Sabotage','Remove cards, negate effects, and disrupt enemy resources.','16 18 30 52 61 67 70 72 79 118 bh03 bh18'],
 ['protect','Protect & Recover','Protect cards and restore Morale.','12 20 33 76 79 bh01 bh22'],
 ['draw','Draw','Draw cards to refill your hand.','27 32 42 80 86 103 108 bh01'],
 ['search','Search','Find, recover, or recruit cards for your hand.','06 07 08 13 29 48 58 60 68 69 72 78 84 90 91 94 105 115 118 119 120 bh05 bh10'],
 ['recycle','Recycle','Recover discarded resources.','08 29 48 58 69 96'],
 ['deploy','Deploy','Gain Reinforcement and deployment options.','02 07 08 09 24 28 49 73 74 79 81 91 92 98 99 100 110 116 120 bh06 bh10 bh14 bh24'],
 ['position','Position & Terrain','Move cards and reshape the battlefield.','02 17 39 43 54 62 81 82 111 bh01'],
 ['morale','Morale Pressure','Deal or amplify Morale damage.','34 35 47 64'],
 ['intelligence','Intelligence','Reveal hands, inspect decks, and shape upcoming draws.','26 61 71 75 113'],
 ['subterfuge','Subterfuge','Conceal your plans, prepare traps, and predict enemy actions.','102 104 105 107 116 117 bh21'],
 ['adaptation','Adaptation','Copy effects, transform cards, and change the rules of engagement.','37 66 99 108 bh06 bh14 bh20']
].map(([id,name,description,ids])=>Object.freeze({id,name,description,cardIds:Object.freeze(ids.split(' '))})));
export function supportCompanyOffers(cards, seed, player, category, callIndex=0){
 const group=SUPPORT_COMPANY_CATEGORIES.find(c=>c.id===category);
 if(!group)return [];
 const choices=[...new Set(cards.filter(supportCompanyCardEligible).filter(c=>group.cardIds.includes(String(c.id))).map(c=>String(c.id)))].sort();
 // Each call gets a fresh deterministic shuffle. The same set may recur by chance.
 let value=2166136261;
 for(const ch of `${seed}:${player}:${category}:${callIndex}`)value=Math.imul(value^ch.charCodeAt(0),16777619)>>>0;
 const random=()=>{value=(value+0x6D2B79F5)|0;let t=Math.imul(value^(value>>>15),1|value);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};
 for(let i=choices.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[choices[i],choices[j]]=[choices[j],choices[i]];}
 return choices.slice(0,3);
}
