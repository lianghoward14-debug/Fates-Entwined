import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,reduceCommand} from '../../shared/engine/index.mjs';
import {command,takeFromHandToBoard} from './test-helpers.mjs';

const require=createRequire(import.meta.url);
const definitions=require('../fate-card-catalog.js').getCardCatalog().cards;
assert(definitions.some(card=>card.id==='126'&&card.fate===3&&card.cost===1&&card.aff==='reality'));
let state=createInitialState({matchId:'CARD126',seed:'card126',handSize:99,activePlayer:0,
  cardDefinitions:definitions,
  players:[{id:'p0',deckIds:['126','32','32','32','32','39','40']},{id:'p1',deckIds:['32','39','40']}],
  gameSettings:{healthPressureSeals:true,zoneControlRework:true}});
const source=state.players[0].hand.find(card=>card.id==='126');
const tributes=[takeFromHandToBoard(state,0,'32',{z:0,r:2,c:0})];
const ownDeckCards=state.players[0].hand.filter(card=>['39','40'].includes(card.id));
ownDeckCards.forEach(card=>{
  state.players[0].hand.splice(state.players[0].hand.indexOf(card),1);
  state.players[0].deck.push(card);
});
let result=reduceCommand(state,command(state,'p0',1,'CONSOLIDATE_CARD',{
  cardIid:source.iid,tributeIids:tributes.map(card=>card.iid),destination:{z:0,r:2,c:0}
}),{playerIndex:0});
assert.equal(result.ok,true,JSON.stringify(result));state=result.state;
assert(state.pendingPrompt,'deck selection opens');
assert.equal(state.pendingPrompt.min,2);
assert.equal(state.pendingPrompt.max,2);
result=reduceCommand(state,command(state,'p0',2,'ANSWER_PROMPT',{
  promptId:state.pendingPrompt.promptId,selectedIids:ownDeckCards.map(card=>card.iid)
}),{playerIndex:0});
assert.equal(result.ok,true,JSON.stringify(result));state=result.state;
for(const card of ownDeckCards) assert(state.players[0].discard.some(item=>item.iid===card.iid));
assert.equal(state.players[1].hand.length,1);
assert.equal(state.players[1].discard.length,2);
console.log('PASS card 126 discards two chosen deck cards and two random opponent hand cards');
