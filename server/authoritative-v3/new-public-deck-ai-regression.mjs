import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createNewPublicDeckPrior} from '../../shared/ai/new-public-deck-heuristics.mjs';
const require=createRequire(import.meta.url);
const {getDeckCatalog}=require('../fate-deck-catalog.js');
const {getCardCatalog}=require('../fate-card-catalog.js');
const catalog=new Map(getCardCatalog().cards.map(card=>[card.id,card]));
const decks=getDeckCatalog().byId;
const elite=decks.get('ai_oppression_old_elite');
const bubble=decks.get('ai_ai_bubble_2026');
for(const deck of [elite,bubble])assert.equal(deck?.ids.length,40,'new public decks must enter the server AI pool');
assert.equal(elite.ids.filter(id=>(catalog.get(id)?.affiliation||catalog.get(id)?.aff)==='eventide').length,30,
  'Old Elite Loyalist must have its Call to Arms threshold');
assert(!bubble.ids.some(id=>String(catalog.get(id)?.rarity).toLowerCase()==='star'),
  'Emerald Eyed Children must qualify for the free Call to Arms');

function fixture(deck,handIds,statuses=[]){
  const originalDeck=deck.ids.map((id,i)=>({id,iid:'original:'+i}));
  const hand=handIds.map((id,i)=>({id,iid:'hand:'+i,type:catalog.get(id)?.type||'Supporter',fate:catalog.get(id)?.fate||1}));
  const state={turn:12,maxTurns:24,statuses,players:[{originalDeck,hand,deck:[],discard:[]},{hand:[],deck:[{id:'32'}],discard:[]}]};
  const cards=new Map(hand.map(card=>[card.iid,card]));
  return {state,hand,cards,prior:createNewPublicDeckPrior(state,0,[],cards)};
}
const e=fixture(elite,['109','117','115','119']);
const score=(f,id)=>f.prior({type:'SET_CARD',payload:{cardIid:f.hand.find(c=>c.id===id).iid,destination:{z:0,r:2,c:0}}});
assert(score(e,'115')>score(e,'119'),'AI must prefer the active Loyalist recruitment to Merchant draw denial');
const hidden=fixture(elite,['109','117'],[{type:'SABOTEUR_FIELD_VEIL',playerIndex:0}]);
assert(score(hidden,'109')>score(e,'109'),
  'AI must favor Don Julio consolidation while Covert Operations conceals it');
const b=fixture(bubble,['bh19','bh13','120'],[{type:'PERMANENT_FATE_GAIN_POTENCY',playerIndex:0,remainingOwnerTurns:1}]);
assert(score(b,'bh13')>score(b,'bh19'),'AI must follow active Abed with Hugh Roberts');
assert(score(b,'120')>0,'AI must value the free recruitment');
console.log('New public deck pools and strategy priorities passed');
