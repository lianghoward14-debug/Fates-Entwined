import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {SUPPORT_COMPANY_CATEGORIES,supportCompanyCardEligible} from '../../shared/support-company.mjs';
const require=createRequire(import.meta.url);
const cards=require('../fate-card-catalog.js').getCardCatalog().cards;
const categories=new Map(SUPPORT_COMPANY_CATEGORIES.map(group=>[group.id,new Set(group.cardIds)]));
const expected={
  '120':['utility'],'121':['sabotage','morale'],'122':['recycle','deploy'],
  '124':['protect'],'125':['power','intelligence'],'126':['sabotage'],
  '127':['position','subterfuge'],'130':['empower']
};
for(const [id,groups] of Object.entries(expected)){
  const card=cards.find(candidate=>candidate.id===id);
  assert(card&&supportCompanyCardEligible(card),`${id} must be eligible for Call to Arms`);
  for(const group of groups)assert(categories.get(group)?.has(id),`${id} missing from ${group}`);
}
assert(!categories.get('search').has('120'),'card 120 no longer triggers Call to Arms');
assert(!categories.get('deploy').has('120'),'card 120 no longer grants deployment');
assert(!categories.get('empower').has('120'),'card 120 is utility, not a Fate amplifier');
assert(!categories.get('draw').has('bh01'),'Voyager no longer draws');
assert(!categories.get('protect').has('bh01'),'Voyager no longer has immunity');
assert(!supportCompanyCardEligible(cards.find(card=>card.id==='123')),'star rarity remains excluded');
assert(!supportCompanyCardEligible(cards.find(card=>card.id==='bh01')),'Voyager star rarity remains excluded');
console.log('PASS recent Call to Arms categories and card 120 placement');
