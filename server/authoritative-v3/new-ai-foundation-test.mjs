import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState, stableStringify} from '../../shared/engine/index.mjs';
import {auditDeck} from '../../shared/ai/deck-audit.mjs';
import {forecastCalculation, boardDependencyImpact, inspectPosition} from '../../shared/ai/position.mjs';
import {searchWorld} from '../../shared/ai/search.mjs';
const require=createRequire(import.meta.url);
const definitions=require('../fate-card-catalog.js').getCardCatalog().cards;
function fixture(ids,enemy=[]) {
  return createInitialState({matchId:'new-ai-test',seed:'new-ai-test',handSize:12,
    cardDefinitions:definitions,players:[{id:'p0',deckIds:ids},{id:'p1',deckIds:enemy}],
    gameSettings:{healthPressureSeals:true,pressureCardReworks:true,zoneControlRework:true}});
}
function put(state,p,id,z,c=0,fate=null) {
  const hand=state.players[p].hand,index=hand.findIndex(x=>x.id===id);
  assert(index>=0);
  const card=hand.splice(index,1)[0];
  if(fate!==null)card.currentFate=fate;
  state.board[z][p===0?2:0][c]=card;
  return card;
}
const majaIds=['bh08','bh08','67','67','67','06','06','06','27','27','27','56',
  ...['60','28','74','79','18','98','bh23','bh25'].flatMap(id=>[id,id,id]),'32','32','09','09'];
const audit=auditDeck(majaIds.map(id=>definitions.find(c=>c.id===id)));
assert.equal(audit.cards,40);assert.equal(audit.reinforcementDemand,17);
assert.equal(audit.reinforcementSupply,30);assert.equal(audit.balance,13);
assert.equal(auditDeck(['76','09'].map(id=>definitions.find(c=>c.id===id))).reinforcementSupply,2);
let state=fixture(['63','63','63']);
const hoplite=put(state,0,'63',0);put(state,0,'63',0,1);put(state,0,'63',0,2);
assert.equal(boardDependencyImpact(state,hoplite.iid).scoreLoss[0][0],11);
state=fixture(['35']);put(state,0,'35',0,0,20);state.turn=4;
const snapshot=stableStringify(state),forecast=forecastCalculation(state);
assert.deepEqual(forecast.after,[200,184]);
assert.equal(stableStringify(state),snapshot,'forecast must not mutate the position');
state.landscapeId='igb1';assert.deepEqual(forecastCalculation(state).after,[200,190]);
state.turn=3;assert.equal(forecastCalculation(state).due,false);
assert.deepEqual(forecastCalculation(state).after,[200,200]);
state=fixture(['09','76']);put(state,0,'09',0);put(state,0,'76',0,1);
assert.equal(inspectPosition(state,0).resources[0].reinforcement,2);
state=fixture(['05']);put(state,0,'05',0,0,30);state.turn=24;state.moralePressure.morale[1]=1;
const before=stableStringify(state),result=searchWorld(state,0,{nodeBudget:50});
assert.equal(result.command.type,'END_TURN');assert.equal(result.score,1e6);
assert.equal(stableStringify(state),before);
assert.deepEqual(searchWorld(state,0,{nodeBudget:50}),result,'fixed budgets must reproduce decisions');
assert(result.trace.simulated<=50);
console.log('New AI foundation: resource audit, dependency impact, real calculation, immutability and terminal search passed.');
