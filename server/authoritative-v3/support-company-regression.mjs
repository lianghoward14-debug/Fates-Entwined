import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState, reduceCommand, legalCommandTemplates, projectStateForPlayer, projectStateForSpectator, projectEvents, canonicalHash} from '../../shared/engine/index.mjs';
import {projectEventsForSpectator} from '../../shared/engine/projections.mjs';
import {SUPPORT_COMPANY_IDS} from '../../shared/support-company.mjs';
import {AuthoritativeRoomActor} from './room-actor.mjs';
const require=createRequire(import.meta.url);
const definitions=require('../fate-card-catalog.js').getCardCatalog().cards;
function initial(morale=true){return createInitialState({matchId:'support-test',seed:'support',handSize:2,
  landscapeId:'igb1',gameSettings:{healthPressureSeals:morale},cardDefinitions:definitions,
  players:[{id:'p0',deckIds:['05','05','05','05']},{id:'p1',deckIds:['05','05','05','05']}]});}
let sequence=0;
function use(state,ability,cardId,player=state.activePlayer){return reduceCommand(state,{
  commandId:`support-${++sequence}`,matchId:state.matchId,expectedRevision:state.revision,
  type:'SUPPORT_COMPANY',payload:{ability,cardId}},{playerIndex:player});}
assert.equal(SUPPORT_COMPANY_IDS.length,18);
for(const id of SUPPORT_COMPANY_IDS){
  const definition=definitions.find(c=>c.id===id);assert(definition);assert.notEqual(definition.rarity,'star');
  const result=use(initial(),'call',id);assert(result.ok,`${id}: ${result.rejection?.reason}`);
  assert.equal(result.state.players[0].hand.at(-1).id,id);
}
for(const id of ['20','56','14','04','17','85','bh01','82','12','71','54','31','93','bh04','10','bh20']){
  const state=initial(),hash=canonicalHash(state),result=use(state,'call',id);
  assert.equal(result.ok,false,`${id} excluded`);assert.equal(canonicalHash(state),hash);
}
let state=initial();
assert.equal(legalCommandTemplates(state,0).filter(c=>c.type==='SUPPORT_COMPANY').length,18);
assert.equal(legalCommandTemplates(state,1).filter(c=>c.type==='SUPPORT_COMPANY').length,0);
assert.equal(use(state,'call','26',1).ok,false);
assert.equal(use(state,'desperate','26').ok,false,'paid use requires free use first');
let result=use(state,'call','26');assert(result.ok);state=result.state;
assert.deepEqual(state.supportCompanyUses,[1,0]);assert.equal(state.moralePressure.morale[0],200);
const publicEvent=projectEvents(result.events,1).find(e=>e.type==='SUPPORT_COMPANY_USED');
assert.deepEqual(publicEvent,{type:'SUPPORT_COMPANY_USED',playerIndex:0,ability:'call',moraleCost:0});
assert(projectEvents(result.events,0).some(e=>e.type==='SUPPORT_COMPANY_CARD_ADDED'));
for(const events of [projectEvents(result.events,1),projectEventsForSpectator(result.events)]){
  assert(!JSON.stringify(events).includes('UCPD'));assert(!events.some(e=>e.cardId || e.cardIid));
}
assert.equal(projectStateForPlayer(state,1).players[0].hand,undefined);
assert.equal(projectStateForSpectator(state).players[0].hand,undefined);
assert.equal(projectStateForPlayer(state,0).players[0].hand.at(-1).id,'26');
assert.deepEqual(projectStateForPlayer(state,1).supportCompanyUses,[1,0]);
assert.equal(use(state,'call','26').ok,false,'cannot repeat free call');
state.moralePressure.morale[0]=137;
result=use(state,'desperate','30');assert(result.ok);state=result.state;
assert.equal(state.moralePressure.morale[0],68);assert.deepEqual(state.supportCompanyUses,[2,0]);
assert.equal(state.players[0].hand.at(-1).cost,3,'normal consolidation cost retained');
assert.equal(use(state,'desperate','30').ok,false);assert.equal(use(state,'call','26').ok,false);
assert.equal(legalCommandTemplates(state,0).filter(c=>c.type==='SUPPORT_COMPANY').length,0);
state.activePlayer=1;assert(use(state,'call','67').ok,'other seat has independent free call');
state=initial(false);result=use(state,'call','26');assert(result.ok);assert.equal(use(result.state,'desperate','26').ok,false);
state=initial();state.pendingPrompt={promptId:'pending',type:'MODAL_CHOICE',playerIndex:0,options:[]};
assert.equal(use(state,'call','26').ok,false);
state=initial();state.baseHandLimit=2;result=use(state,'call','26');assert(result.ok);assert.equal(result.state.pendingHandLimit.required,1);
assert.equal(use(result.state,'desperate','26').ok,false,'resolve hand limit before another call');
state=initial();state=use(state,'call','26').state;state.moralePressure.morale[0]=1;
result=use(state,'desperate','26');assert(result.ok);assert.equal(result.state.outcome.winner,1,'paying last Morale ends match');
state=initial();state.cardCatalog.find(c=>c.id==='26').rarity='star';assert.equal(use(state,'call','26').ok,false);
state=initial();delete state.supportCompanyUses;assert(use(state,'call','26').ok,'existing snapshots default to unused');
// Verify the actual multiplayer response envelope, including replay safety.
const recorded=new Map();
const actor=new AuthoritativeRoomActor({state:initial(),store:{
  commandResponse:(_match,id)=>recorded.get(id),
  appendAccepted:entry=>recorded.set(entry.command.commandId,entry)
}});
const packet={commandId:'private-support',matchId:actor.state.matchId,expectedRevision:0,
  type:'SUPPORT_COMPANY',payload:{ability:'call',cardId:'26'}};
const accepted=await actor.dispatch('p0',packet);
assert.equal(accepted.response.kind,'accepted');
const opponent=accepted.broadcasts.find(item=>item.playerId==='p1').message;
assert(!JSON.stringify(opponent).includes('UCPD'),'network broadcast never includes selected card name');
assert.equal(opponent.state.players[0].hand,undefined);
assert.equal(opponent.command,undefined);
const duplicate=await actor.dispatch('p0',packet);assert.equal(duplicate.idempotentReplay,true);
assert.equal(actor.state.players[0].hand.length,3);assert.equal(actor.state.supportCompanyUses[0],1);
const reconnected=projectStateForPlayer(JSON.parse(JSON.stringify(actor.state)),0);
assert.equal(reconnected.supportCompanyUses[0],1,'reconnect retains spent use');
console.log('Support Company passed: pool/exclusions, both seats, use limits, Morale rounding/death, hand limits, privacy including network packets, duplicate replay, snapshot persistence.');
