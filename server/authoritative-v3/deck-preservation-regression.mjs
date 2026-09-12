import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {preservationProfile,createDeckPreservationPrior} from '../../shared/ai/deck-preservation.mjs';
const require=createRequire(import.meta.url);
const decks=require('../fate-deck-catalog.js').getDeckCatalog().decks;
const catalog=require('../fate-card-catalog.js').getCardCatalog();
const names=new Set();
for(const d of decks){
  const list=d.ids.map((id,i)=>({...catalog.byId.get(id),iid:`c${i}`,owner:0,controller:0,counters:{},statuses:[]}));
  const profile=preservationProfile(list);assert(profile,d.name);assert(!names.has(profile.name),`duplicate profile ${d.name}`);names.add(profile.name);
  const engine=list.find(c=>profile.engines.includes(c.id));assert(engine);
  const entries=[{card:engine,z:0,r:2,c:0}];
  const state={players:[{hand:list.filter(c=>c!==engine),deck:[],discard:[]},{hand:[],deck:[],discard:[]}],board:[],statuses:[]};
  const prior=createDeckPreservationPrior(state,0,entries,new Map(list.map(c=>[c.iid,c])));
  assert(prior({type:'DISCARD_CARD',payload:{targetIid:engine.iid}})<0,d.name+' preserves engine');
  assert(prior({type:'CONSOLIDATE_CARD',payload:{tributeIids:[engine.iid]}})<0,d.name+' prices engine tribute');
}
assert.equal(names.size,16);
console.log('All 16 decks have distinct preservation profiles; engine disposal checks passed');
