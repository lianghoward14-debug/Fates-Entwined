import assert from 'node:assert/strict';
import {createInitialState,reduceCommand} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

function setup(landscapeId){
  const state=createInitialState({matchId:`BERKELEY-${landscapeId}`,seed:`berkeley-${landscapeId}`,
    handSize:99,landscapeId,cardDefinitions:[
      {id:'39',name:'Juan Carlos',type:'Initiator',aff:'expanded_worlds',fate:4,cost:2},
      {id:'27',name:'Kazumi',type:'Initiator',aff:'eventide',fate:1,cost:1}
    ],players:[{id:'p0',deckIds:['39','27']},{id:'p1',deckIds:['27']}]});
  state.phase='main';
  const tribute=state.players[0].hand.find(card=>card.id==='39');
  state.players[0].hand=state.players[0].hand.filter(card=>card !== tribute);
  tribute.currentFate=8;
  state.board[0][2][0]=tribute;
  const arriving=state.players[0].hand.find(card=>card.id==='27');
  return {state,tribute,arriving};
}

let {state,tribute,arriving}=setup('igb11');
let result=reduceCommand(state,command(state,'p0',1,'CONSOLIDATE_CARD',{
  cardIid:arriving.iid,tributeIids:[tribute.iid],destination:{z:0,r:2,c:0}
}),{playerId:'p0'});
assert.equal(result.ok,true,JSON.stringify(result.rejection));
assert.equal(result.state.board[0][2][0].currentFate,5,'the Initiator transfers 8 minus its base 4');

({state,tribute,arriving}=setup('igb6'));
result=reduceCommand(state,command(state,'p0',1,'CONSOLIDATE_CARD',{
  cardIid:arriving.iid,tributeIids:[tribute.iid],destination:{z:0,r:2,c:0}
}),{playerId:'p0'});
assert.equal(result.ok,false,'Great Oak no longer permits an Initiator as a tribute');
console.log('Berkeley Initiator Fate transfer smoke test passed');
