import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,reduceCommand} from '../../shared/engine/index.mjs';
import {command,takeFromHandToBoard} from './test-helpers.mjs';
const require=createRequire(import.meta.url);
const definitions=require('../fate-card-catalog.js').getCardCatalog().cards;
assert(definitions.some(card=>card.id==='123' && card.fate===9 && card.cost===3 && card.aff==='reality'));
let state=createInitialState({matchId:'CARD123',seed:'card123',handSize:99,activePlayer:0,
  cardDefinitions:definitions,players:[{id:'p0',deckIds:['123','32','32','32']},{id:'p1',deckIds:['40','32']}],
  gameSettings:{healthPressureSeals:true,zoneControlRework:true}});
const target=takeFromHandToBoard(state,1,'40',{z:0,r:0,c:0});
target.currentFate=6;
const tributes=[0,1,2].map(c=>takeFromHandToBoard(state,0,'32',{z:0,r:2,c}));
const source=state.players[0].hand.find(card=>card.id==='123');
let result=reduceCommand(state,command(state,'p0',1,'CONSOLIDATE_CARD',{cardIid:source.iid,tributeIids:tributes.map(card=>card.iid),destination:{z:0,r:2,c:0}}),{playerIndex:0});
assert.equal(result.ok,true,JSON.stringify(result));state=result.state;
assert(state.pendingPrompt,'card 123 asks for an opponent field card');
result=reduceCommand(state,command(state,'p0',2,'ANSWER_PROMPT',{promptId:state.pendingPrompt.promptId,selectedIid:target.iid}),{playerIndex:0});
assert.equal(result.ok,true,JSON.stringify(result));state=result.state;
assert.equal(state.board[0][0][0].currentFate,0);
assert.equal(state.board[0][2][0].currentFate,15);
console.log('PASS card 123 transfers current Fate from opponent field card');
