import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,reduceCommand,legalCommandTemplates,projectEvents} from '../../shared/engine/index.mjs';
import {SUPPORT_COMPANY_CATEGORIES,supportCompanyOffers} from '../../shared/support-company.mjs';
const cards=createRequire(import.meta.url)('../fate-card-catalog.js').getCardCatalog().cards;
let n=0;
for(const ability of ['call','desperate'])for(const player of [0,1])for(const category of SUPPORT_COMPANY_CATEGORIES){
 const state=createInitialState({matchId:'royal-check',seed:'royal',gameSettings:{healthPressureSeals:true},activePlayer:player,handSize:2,cardDefinitions:cards,players:[{id:'a',deckIds:['05','05','05','05']},{id:'b',deckIds:['05','05','05','05']}]});
 state.gameSettings.healthPressureSeals=true;state.moralePressure.morale[player]=137;if(ability==='desperate')state.supportCompanyUses=[1,1];
 const offers=supportCompanyOffers(cards,ability==='desperate'?`${state.matchId}:desperate`:state.matchId,player,category.id);assert.equal(offers.length,3);assert.equal(new Set(offers).size,3);assert(offers.every(id=>cards.find(c=>c.id===id).rarity.toLowerCase()!=='star'));
 const command=legalCommandTemplates(state,player).find(c=>c.type==='SUPPORT_COMPANY'&&c.payload.category===category.id);
 const submit=payload=>reduceCommand(state,{...command,payload,commandId:'royal-'+ ++n,matchId:state.matchId,expectedRevision:state.revision},{playerIndex:player});
 assert(!submit({...command.payload,cardId:'invalid'}).ok);const result=submit(command.payload);assert(result.ok,JSON.stringify(result.rejection));if(ability==='desperate')assert.equal(result.state.moralePressure.morale[player],68);assert.equal(result.state.players[player].hand.at(-1).id,command.payload.cardId);
 for(const viewer of [0,1]){const event=projectEvents(result.events,viewer).find(e=>e.type==='SUPPORT_COMPANY_USED');assert.equal(event.category,category.id);assert(!event.cardId);}
}
assert(SUPPORT_COMPANY_CATEGORIES.find(c=>c.id==='deploy').cardIds.includes('98'));assert(SUPPORT_COMPANY_CATEGORIES.find(c=>c.id==='disrupt').cardIds.includes('bh21'));
console.log('Royal Seal: 11 categories, both seats, three non-Star offers, server validation, private card and public category passed.');
