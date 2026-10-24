import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import {SUPPORT_COMPANY_CATEGORIES as categories,supportCompanyOffers,supportCompanyCardEligible} from '../../shared/support-company.mjs';
import {createInitialState,reduceCommand} from '../../shared/engine/index.mjs';
const {cards,byId}=createRequire(import.meta.url)('../fate-card-catalog.js').getCardCatalog();
const eligible=cards.filter(supportCompanyCardEligible);
for(const group of categories){
 assert.equal(new Set(group.cardIds).size,group.cardIds.length,group.id+' duplicate');
 for(const id of group.cardIds)assert(byId.has(id),group.id+' unknown '+id);
}
for(const card of cards)assert(categories.some(g=>g.cardIds.includes(card.id)),card.id+' lacks a category');
const expected={
 '21':['power'],'101':['power'],'103':['draw'],'104':['power','tactics'],
 '105':['draw','tactics'],'106':['power'],'107':['power','tactics'],
 '108':['draw','tactics'],'109':['power'],'110':['deploy'],'111':['position'],
 '112':['power'],'113':['disrupt','tactics'],'114':['disrupt'],'115':['draw','tactics'],
 '116':['deploy','tactics'],'117':['tactics'],'118':['disrupt','draw'],'120':['draw','deploy','tactics'],
 'bh18':['disrupt']
};
for(const [id,groups] of Object.entries(expected))assert.deepEqual(categories.filter(g=>g.cardIds.includes(id)).map(g=>g.id).sort(),groups.sort(),id);
assert.equal(byId.get('119').name,'Havano Merchant');
const localSource=fs.readFileSync(new URL('../../src/scripts/support-company.mjs',import.meta.url),'utf8');
const localResolver=localSource.slice(localSource.indexOf('window.resolveHopliteCallToArms = async'));
let recruited=0;
for(const player of [0,1]){
 const found=new Map();
 for(let n=0;n<2000&&found.size<eligible.length;n++){
  const seed='catalog-audit-'+n;
  for(const category of categories)for(const id of supportCompanyOffers(cards,seed,player,category.id)){
   assert(supportCompanyCardEligible(byId.get(id)),id+' must be eligible');
   if(!found.has(id))found.set(id,{seed,category:category.id});
  }
 }
 assert.equal(found.size,eligible.length,'Every eligible card must be reachable at seat '+player);
 for(const card of eligible){
  const {seed,category}=found.get(card.id);
  const state=createInitialState({matchId:seed,seed,activePlayer:player,handSize:1,cardDefinitions:cards,players:[0,1].map(p=>({id:'p'+p,deckIds:['32','32']}))});
  const result=reduceCommand(state,{type:'SUPPORT_COMPANY',commandId:'recruit',matchId:seed,expectedRevision:state.revision,payload:{ability:'call',category,cardId:card.id}},{playerIndex:player});
  assert(result.ok,card.id+': '+JSON.stringify(result.rejection));
  assert(result.state.players[player].hand.some(c=>c.id===card.id),card.id+' authoritative arrival');
  // Exercise the actual single-player card-triggered picker and arrival path.
  const added=[];
  const sandbox={G:{_supportCompanyOfferSeed:seed,players:[{},{}]},window:{},CARDS:cards,SUPPORT_COMPANY_CATEGORIES:categories,supportCompanyOffers,context:()=>null,closeModal(){},createCardInstance:c=>({...c}),addCardToHand:(p,c)=>added.push({p,id:c.id}),renderEffectResolutionForPlayer(){},pickRoyalSeal:(offered,opts,choose)=>{assert(offered.some(c=>c.id===card.id));choose([offered.find(c=>c.id===card.id)]);}};
  sandbox.window.showSupportCompanyCategoryWindow=opts=>opts.onSelect(category);
  sandbox.window.presentSupportCompanyUse=async()=>{};
  vm.createContext(sandbox);vm.runInContext(localResolver,sandbox);
  assert(await sandbox.window.resolveHopliteCallToArms({id:'120'},player));
  assert.deepEqual(added,[{p:player,id:card.id}]);
  recruited++;
 }
}
console.log(`Call to Arms audit: ${cards.length} cards classified; all ${eligible.length} eligible cards successfully recruited in both seats through authoritative and single-player paths (${recruited} cases per path). Star exclusions preserved.`);
