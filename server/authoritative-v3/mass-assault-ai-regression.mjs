import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,legalCommandTemplates,reduceCommand} from '../../shared/engine/index.mjs';
import {createCommandOrderer} from '../../shared/ai/ordering.mjs';
const require=createRequire(import.meta.url);
const cards=require('../fate-card-catalog.js').getCardCatalog().cards;
const deck=require('../fate-deck-catalog.js').getDeckCatalog().byId.get('starter_assault');
assert.equal(deck.ids.length,40);
for(const id of ['28','60'])assert.equal(deck.ids.filter(c=>c===id).length,3);
for(const id of ['42','43'])assert(!deck.ids.includes(id));
for(const player of [0,1]){
 const state=createInitialState({matchId:'assault',seed:'assault',activePlayer:player,handSize:0,cardDefinitions:cards,players:[{id:'p0',deckIds:deck.ids},{id:'p1',deckIds:deck.ids}]});
 const owner=state.players[player];
 const student=owner.deck.find(c=>c.id==='60');owner.deck=owner.deck.filter(c=>c.iid!==student.iid);owner.hand.push(student);
 let legal=legalCommandTemplates(state,player),rank=createCommandOrderer(state,player);
 const army=legal.filter(c=>c.type==='SET_CARD_FROM_DECK' && owner.deck.find(x=>x.iid===c.payload.cardIid)?.id==='28').sort((a,b)=>rank(b)-rank(a))[0];
 assert(army,'Army must be available on both seats');
 const ib=legal.find(c=>c.type==='SET_CARD' && c.payload.cardIid===student.iid);
 assert(ib);assert(rank(army)>rank(ib),'free Army deployment has early priority');
 let result=reduceCommand(state,{type:army.type,payload:army.payload,matchId:state.matchId,expectedRevision:state.revision,commandId:'army'},{playerIndex:player});
 assert(result.ok,JSON.stringify(result.rejection));
 assert(!legalCommandTemplates(result.state,player).some(c=>c.type==='SET_CARD_FROM_DECK' && result.state.players[player].deck.find(x=>x.iid===c.payload.cardIid)?.id==='28'),'respect once per turn');
 result=reduceCommand(state,{type:ib.type,payload:ib.payload,matchId:state.matchId,expectedRevision:state.revision,commandId:'student'},{playerIndex:player});
 assert(result.ok,JSON.stringify(result.rejection));
 assert(result.state.pendingPrompt,'IB Student should search');
 legal=legalCommandTemplates(result.state,player);rank=createCommandOrderer(result.state,player);
 const choices=legal.filter(c=>c.type==='ANSWER_PROMPT').sort((a,b)=>rank(b)-rank(a));
 const choice=choices[0];assert(choice);
 const selected=choice.payload.selectedIid || choice.payload.selectedIids?.[0];
 assert.notEqual(result.state.players[player].deck.find(c=>c.iid===selected)?.id,'28','leave Army in deck');
 const searched=reduceCommand(result.state,{type:choice.type,payload:choice.payload,matchId:state.matchId,expectedRevision:result.state.revision,commandId:'search'},{playerIndex:player});
 assert(searched.ok,JSON.stringify(searched.rejection));
 assert(searched.state.players[player].hand.some(c=>c.iid===selected && c.type==='Supporter'),'search puts a supporter in hand');
}
console.log('Mass Assault deck and AI regression passed');

