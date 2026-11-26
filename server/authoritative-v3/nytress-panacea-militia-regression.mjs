import assert from 'node:assert/strict';
import {createInitialState,reduceCommand} from '../../shared/engine/index.mjs';
import {collectTriggeredOperations} from '../../shared/engine/triggers.mjs';
import {isTriggeredFateCoordinator} from '../../shared/engine/modifiers.mjs';
import {command,takeFromHandToBoard} from './test-helpers.mjs';
import {createRequire} from 'node:module';

const catalog=createRequire(import.meta.url)('../fate-card-catalog.js').getCardCatalog().cards;
const triggeredCoordinators=catalog.filter(card=>card.type==='Coordinator'
  && /(?:each time|when you set or consolidate)/i.test(card.effect||'')
  && /(?:all cards you control).*gain \d+ Fate/i.test(card.effect||''));
assert.deepEqual(triggeredCoordinators.map(card=>card.id).sort(),['15','130','bh02','bh08'].sort());
for(const definition of triggeredCoordinators){
  assert(isTriggeredFateCoordinator({}, {id:definition.id,type:'Coordinator'}),
    definition.name+' must be eligible for Panacea Militia');
}

const cards=[
  {id:'130',name:'Nytress',type:'Coordinator',aff:'reality',fate:4,cost:4},
  {id:'bh23',name:'Panacea Militia',type:'Supporter',aff:'eventide',fate:1,cost:0},
  {id:'32',name:'Eventide Scout',type:'Supporter',aff:'eventide',fate:1,cost:0}
];
let state=createInitialState({matchId:'NYTRESS-PANACEA',seed:'NYTRESS-PANACEA',handSize:99,
  cardDefinitions:cards,players:[{id:'p0',deckIds:['130','bh23','32']},{id:'p1',deckIds:['32']}]});
const nytress=takeFromHandToBoard(state,0,'130',{z:0,r:2,c:0});
nytress.counters.elementalAffiliationA='eventide';
nytress.counters.elementalAffiliationB='reality';
assert(isTriggeredFateCoordinator(state,nytress));
const scout=takeFromHandToBoard(state,0,'32',{z:0,r:2,c:2});
const triggered=collectTriggeredOperations(state,{type:'CARD_SET',playerIndex:0,cardIid:scout.iid});
assert(triggered.some(op=>op.sourceIid===nytress.iid&&op.counterKey==='triggeredFateHistoryTotal'&&op.value===1));
nytress.counters.triggeredFateHistoryTotal=1;
const militia=state.players[0].hand.find(card=>card.id==='bh23');
let result=reduceCommand(state,command(state,'p0',1,'SET_CARD',{cardIid:militia.iid,destination:{z:0,r:2,c:1}}),{playerId:'p0'});
assert.equal(result.ok,true);
assert(result.prompt.eligibleIids.includes(nytress.iid));
state=result.state;
result=reduceCommand(state,command(state,'p0',2,'ANSWER_PROMPT',{
  promptId:state.pendingPrompt.promptId,selectedIids:[nytress.iid]}),{playerId:'p0'});
assert.equal(result.ok,true);
assert.equal(result.state.board[0][2][1].counters.bh23InheritedFate,1);
console.log('PASS Panacea Militia can inherit Nytress Eventide trigger history');
