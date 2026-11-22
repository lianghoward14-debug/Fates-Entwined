import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,reduceCommand} from '../../shared/engine/index.mjs';
import {command,takeFromHandToBoard} from './test-helpers.mjs';
const require=createRequire(import.meta.url);
const definitions=require('../fate-card-catalog.js').getCardCatalog().cards;
for(const id of ['122','123','125','126','127','130']){
  const cost=Number(definitions.find(card=>card.id===id)?.cost);
  let state=createInitialState({matchId:'LYDIA-'+id,seed:'lydia-'+id,handSize:99,activePlayer:0,
    cardDefinitions:definitions,players:[{id:'p0',deckIds:[id,...Array(cost).fill('32')]},{id:'p1',deckIds:['56','32']}],
    gameSettings:{healthPressureSeals:true}});
  const lydia=takeFromHandToBoard(state,1,'56',{z:2,r:0,c:0});
  const source=state.players[0].hand.find(card=>card.id===id);
  const tributes=Array.from({length:cost},(_,index)=>takeFromHandToBoard(state,0,'32',
    {z:Math.floor(index/3),r:2,c:index%3}));
  const result=reduceCommand(state,command(state,'p0',1,'CONSOLIDATE_CARD',
    {cardIid:source.iid,tributeIids:tributes.map(card=>card.iid),destination:{z:0,r:2,c:0}}),{playerIndex:0});
  assert.equal(result.ok,true,id+': '+JSON.stringify(result.rejection));
  assert.equal(result.state.pendingPrompt?.type,'REACTION',id+' should offer a reaction');
  assert(result.state.pendingPrompt.options?.some(option=>option.reactionIid===lydia.iid),id+' should offer Lydia');
}
console.log('PASS Lydia can react to recent when-set effects regardless of card type');
