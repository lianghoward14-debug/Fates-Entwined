import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,reduceCommand} from '../../shared/engine/index.mjs';
import {command,takeFromHandToBoard} from './test-helpers.mjs';
const require=createRequire(import.meta.url);
const definitions=require('../fate-card-catalog.js').getCardCatalog().cards;
for(const id of ['123','126','127']){
  const cost=Number(definitions.find(card=>card.id===id)?.cost);
  const state=createInitialState({matchId:'HAVANO-'+id,seed:'havano-'+id,handSize:99,activePlayer:0,
    cardDefinitions:definitions,players:[{id:'p0',deckIds:[id,...Array(cost).fill('32')]},{id:'p1',deckIds:['79','32','32']}],
    gameSettings:{healthPressureSeals:true}});
  takeFromHandToBoard(state,1,'32',{z:2,r:0,c:0});
  const source=state.players[0].hand.find(card=>card.id===id);
  const tributes=Array.from({length:cost},(_,index)=>takeFromHandToBoard(state,0,'32',
    {z:Math.floor(index/3),r:2,c:index%3}));
  const result=reduceCommand(state,command(state,'p0',1,'CONSOLIDATE_CARD',
    {cardIid:source.iid,tributeIids:tributes.map(card=>card.iid),destination:{z:0,r:2,c:0}}),{playerIndex:0});
  assert.equal(result.ok,true,id+': '+JSON.stringify(result.rejection));
  assert(!result.state.pendingPrompt?.options?.some(option=>option.kind==='HAVANO'),id+' is not a Supporter effect');
}
for(const id of ['119']){
  const state=createInitialState({matchId:'SECULES-'+id,seed:'secules-'+id,handSize:99,activePlayer:0,
    cardDefinitions:definitions,players:[{id:'p0',deckIds:[id,'32']},{id:'p1',deckIds:['67','32']}],
    gameSettings:{healthPressureSeals:true}});
  const secules=takeFromHandToBoard(state,1,'67',{z:2,r:0,c:0});
  const source=state.players[0].hand.find(card=>card.id===id);
  const result=reduceCommand(state,command(state,'p0',1,'SET_CARD',
    {cardIid:source.iid,destination:{z:0,r:2,c:0}}),{playerIndex:0});
  assert.equal(result.ok,true,id+': '+JSON.stringify(result.rejection));
  assert.equal(result.state.pendingPrompt?.type,'REACTION',id+' should open a reaction');
  assert(result.state.pendingPrompt.options?.some(option=>option.kind==='SECULES'&&option.reactionIid===secules.iid),id+' should allow Mr. Secules');
}
console.log('PASS Havano ignores Initiators while Mr. Secules reacts to Supporter effects');
