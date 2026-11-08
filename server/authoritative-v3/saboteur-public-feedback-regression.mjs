import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createInitialState,reduceCommand} from '../../shared/engine/index.mjs';
import {projectStateForPlayer,projectStateForSpectator,projectEvents,projectEventsForSpectator} from '../../shared/engine/projections.mjs';
const cards=createRequire(import.meta.url)('../fate-card-catalog.js').getCardCatalog().cards;
for(const owner of [0,1]){
 let state=createInitialState({matchId:'veil-public-'+owner,seed:'public',handSize:99,activePlayer:owner,cardDefinitions:cards,gameSettings:{healthPressureSeals:true},players:[0,1].map(p=>({id:'p'+p,deckIds:['117','32']}))});
 const card=state.players[owner].hand.find(c=>c.id==='117');
 const result=reduceCommand(state,{commandId:'veil',matchId:state.matchId,expectedRevision:0,type:'SET_CARD',payload:{cardIid:card.iid,destination:{z:0,r:owner?0:2,c:0}}},{playerId:'p'+owner});assert(result.ok);state=result.state;
 state.moralePressure.morale[1-owner]=145;
 state.statuses.push({statusId:'visible-effect',type:'MERCHANT_DRAW_DENIAL',playerIndex:owner,sourceIid:card.iid,remainingDrawPhases:2});
 const own=projectStateForPlayer(state,owner);
 for(const view of [projectStateForPlayer(state,1-owner),projectStateForSpectator(state)]){
  assert.equal(view.moralePressure.morale[1-owner],145);
  assert.deepEqual(view.statuses,own.statuses);
  assert.deepEqual(view.geometry,own.geometry);
 }
 state.statuses=state.statuses.filter(x=>x.statusId!=='visible-effect');
 assert(!projectStateForPlayer(state,1-owner).statuses.some(x=>x.statusId==='visible-effect'),'expired statuses disappear during veil');
}
// Execute the actual reducer's concealment block against simultaneous public
// consequences and secret actions, including independently private events.
const source=fs.readFileSync('shared/engine/reducer.mjs','utf8');
const start=source.indexOf('    if(activeVeil && currentState.saboteurVeil');
const end=source.indexOf('    if(state.saboteurVeil &&',start);
const events=[{type:'MORALE_DAMAGED',before:200,after:145,amount:55},{type:'MORALE_CYCLE_RESOLVED'},
 {type:'PRESSURE_CHANGED'},{type:'SEALS_AWARDED'},{type:'STATUS_CREATED',status:{type:'PUBLIC'}},
 {type:'STATUS_REMOVED'},{type:'STATUS_UPDATED'}, {type:'CARD_SET',cardIid:'secret'},
 {type:'FATE_CHANGED',cardIid:'secret'}, {type:'STATUS_CREATED',privateTo:[0],status:{type:'PRIVATE'}},
 {type:'MORALE_HEALED',hiddenSource:true,sourceController:0}];
vm.runInNewContext(source.slice(start,end),{activeVeil:{owner:0},currentState:{saboteurVeil:{}},actorIndex:0,ctx:{events}});
for(const visible of [projectEvents(events,1),projectEventsForSpectator(events)]){
 assert.equal(visible.length,7);assert(visible.some(x=>x.type==='MORALE_DAMAGED'));
 assert(!visible.some(x=>x.cardIid==='secret'));assert(!visible.some(x=>x.status?.type==='PRIVATE'));
}
assert.equal(projectEvents(events,0).length,events.length);
console.log('PASS: both seats and spectators see live Morale/statuses, expiry and public feedback; concealed card actions and independently private effects stay hidden.');
