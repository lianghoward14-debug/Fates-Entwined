import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,legalCommandTemplates,reduceCommand} from '../../shared/engine/index.mjs';
import {command,takeFromHandToBoard} from './test-helpers.mjs';
const require=createRequire(import.meta.url);
const definitions=require('../fate-card-catalog.js').getCardCatalog().cards;
let state=createInitialState({matchId:'NYTRESS-ROADS',seed:'nytress-roads',handSize:99,landscapeId:'igb17',
  cardDefinitions:definitions,players:[{id:'p0',deckIds:['130','32','32']},{id:'p1',deckIds:['32']}],
  gameSettings:{healthPressureSeals:true}});
const nytress=takeFromHandToBoard(state,0,'130',{z:0,r:2,c:0});
nytress.counters.elementalAffiliationA='reality';
nytress.counters.elementalAffiliationB='eventide';
const opponent=takeFromHandToBoard(state,1,'32',{z:2,r:0,c:0});
const action=legalCommandTemplates(state,0).find(item=>item.type==='ACTIVATE_LANDSCAPE'&&item.payload.sourceIid===nytress.iid);
assert(action,'Concrete Roads should offer Nytress as a Coordinator source');
let result=reduceCommand(state,command(state,'p0',1,action.type,action.payload),{playerIndex:0});
assert.equal(result.ok,true,JSON.stringify(result.rejection));state=result.state;
const token=state.players[0].hand.find(card=>card.id==='whisper17');
assert(token&&token.counters.copiedPassiveId==='130');
assert.equal(token.counters.elementalAffiliationA,'reality');
result=reduceCommand(state,command(state,'p0',2,'SET_CARD',
  {cardIid:token.iid,destination:{z:0,r:2,c:0}}),{playerIndex:0});
assert.equal(result.ok,true,JSON.stringify(result.rejection));state=result.state;
let commandNumber=3;
while(state.pendingPrompt){
  const prompt=state.pendingPrompt;
  const choice=prompt.options?.find(option=>option.value==='reality')?.value
    || prompt.options?.find(option=>option.value==='eventide')?.value
    || prompt.options?.[0]?.value;
  result=reduceCommand(state,command(state,'p0',commandNumber++,'ANSWER_PROMPT',
    {promptId:prompt.promptId,choice}),{playerIndex:0});
  assert.equal(result.ok,true,JSON.stringify(result.rejection));state=result.state;
}
const card=state.players[0].hand.find(entry=>entry.id==='32');
result=reduceCommand(state,command(state,'p0',commandNumber,'SET_CARD',{cardIid:card.iid,destination:{z:1,r:2,c:0}}),{playerIndex:0});
assert.equal(result.ok,true,JSON.stringify(result.rejection));
assert.equal(result.state.board[0][2][0].currentFate,token.currentFate+1);
assert.equal(result.state.board[1][2][0].currentFate,card.currentFate+1);
assert.equal(result.state.board[2][0][0].currentFate,opponent.currentFate);
console.log('PASS Concrete Roads copies Nytress declarations and buffs only controlled cards');
