import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,reduceCommand} from '../../shared/engine/index.mjs';
import {command,takeFromHandToBoard} from './test-helpers.mjs';
import {collectTriggeredOperations} from '../../shared/engine/triggers.mjs';
const require=createRequire(import.meta.url);
const definitions=require('../fate-card-catalog.js').getCardCatalog().cards;
assert(definitions.some(card=>card.id==='130' && card.fate===4 && card.cost===4 && card.aff==='reality'));
let state=createInitialState({matchId:'CARD130',seed:'card130',handSize:99,activePlayer:0,
  cardDefinitions:definitions,players:[{id:'p0',deckIds:['130','32','32','32','32','32']},{id:'p1',deckIds:['40','32']}],
  gameSettings:{healthPressureSeals:true,zoneControlRework:true}});
const opponent=takeFromHandToBoard(state,1,'40',{z:0,r:0,c:0});
const opponentBefore=opponent.currentFate;
const source=state.players[0].hand.find(card=>card.id==='130');
const tributes=[0,1,2,3].map(c=>takeFromHandToBoard(state,0,'32',{z:c===3?1:0,r:2,c:c===3?0:c}));
function act(n,type,payload){
  const result=reduceCommand(state,command(state,'p0',n,type,payload),{playerIndex:0});
  assert.equal(result.ok,true,JSON.stringify(result));state=result.state;return result;
}
act(1,'CONSOLIDATE_CARD',{cardIid:source.iid,tributeIids:tributes.map(card=>card.iid),destination:{z:0,r:2,c:0}});
assert(state.pendingPrompt,'first affiliation prompt');
act(2,'ANSWER_PROMPT',{promptId:state.pendingPrompt.promptId,choice:'reality'});
assert(state.pendingPrompt,'second affiliation prompt');
assert(!state.pendingPrompt.options.some(option=>option.value==='reality'));
act(3,'ANSWER_PROMPT',{promptId:state.pendingPrompt.promptId,choice:'eventide'});
assert.equal(state.board[0][2][0].counters.elementalAffiliationA,'reality');
assert.equal(state.board[0][2][0].counters.elementalAffiliationB,'eventide');
const next=state.players[0].hand.find(card=>card.id==='32');
const result=act(4,'SET_CARD',{cardIid:next.iid,destination:{z:0,r:2,c:1}});
assert.equal(state.board[0][2][0].currentFate,5);
assert.equal(state.board[0][2][1].currentFate,2);
assert.equal(state.board[0][0][0].currentFate,opponentBefore+1);
assert(result.events.some(event=>event.type==='FATE_CHANGED'&&event.reason==='ELEMENTAL_MASTERY'));
assert(collectTriggeredOperations(state,{type:'CARD_SET',cardIid:next.iid,playerIndex:0,consolidated:true})
  .some(operation=>operation.reason==='ELEMENTAL_MASTERY'),'a consolidation placement uses the same trigger');
console.log('PASS card 130 declares two affiliations and buffs every mutable card in zone');
