import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,applyOperation,assertInvariants,projectStateForPlayer} from '../../shared/engine/index.mjs';
import {cardRule} from '../../shared/engine/cards/registry.mjs';
const require=createRequire(import.meta.url);const {cards,byId}=require('../fate-card-catalog.js').getCardCatalog();
assert.equal(byId.get('108').fate,4);assert.equal(byId.get('108').cost,4);assert.equal(byId.get('108').type,'Initiator');assert.equal(byId.get('103').aff,'eventide');assert.equal(byId.get('88').name,'Rozsi Szocs (Youth)');
for(const seat of [0,1]){
 const ids=['01','01','02','03','04','05','06','07'];
 const state=createInitialState({matchId:'sofia',seed:'sofia',handSize:1,players:[{id:'a',deckIds:seat===0?['108']:ids},{id:'b',deckIds:seat===1?['108']:ids}],cardDefinitions:cards});
 const opponent=state.players[1-seat];opponent.discard.push(opponent.deck.shift());opponent.deck[0].currentFate=99;
 const before=JSON.stringify(opponent);const oldHand=state.players[seat].hand.slice();const sourceIid=oldHand[0].iid;const ctx={state,events:[],ruleEvents:[]};
 for(const step of cardRule('108',state).program){applyOperation(ctx,{...step.operation,playerIndex:seat,sourceController:seat,sourceIid});}
 assert.equal(state.players[seat].hand.length,6);assert.equal(state.players[seat].deck.length,ids.length-6);assert.equal(JSON.stringify(opponent),before);
 assert(oldHand.every(c=>state.players[seat].discard.some(d=>d.iid===c.iid)));
 const copied=[...state.players[seat].hand,...state.players[seat].deck];assert.deepEqual(copied.map(c=>c.id).sort(),ids.slice().sort());assert(copied.every(c=>c.owner===seat&&c.controller===seat&&c.currentFate===c.baseFate));assert.equal(new Set(copied.map(c=>c.iid)).size,ids.length);assertInvariants(state);
 assert(!JSON.stringify(projectStateForPlayer(state,seat)).includes('originalDeck'));
}
console.log('Sofia: both seats copy full original list, preserve opponent and discard old hand, draw six, reset stats, unique instances, private snapshots; card 88 unchanged and Santiago Eventide.');
