import assert from 'node:assert/strict';
import {testState,command} from './test-helpers.mjs';
import {applyOperation} from '../../shared/engine/operations.mjs';
import {legalCommandTemplates} from '../../shared/engine/legal-commands.mjs';
import {reduceCommand} from '../../shared/engine/reducer.mjs';
for(const owner of [0,1])for(const cardId of ['32','34']){
 const state=testState({activePlayer:owner,player0:['32','34'],player1:['32','34']});
 const source={baseFate:1,currentFate:1,cost:1,id:'02',iid:'anicka',owner,controller:owner,type:'Initiator',faceDown:false,statuses:[],counters:{}};
 state.board[0][owner===0?2:0][0]=source;
 applyOperation({state,events:[],ruleEvents:[]},{type:'ADD_SAFE_ROW',playerIndex:owner,zone:0,sourceIid:source.iid});
 assert.equal(state.board[0][3].length,4);
 const card=state.players[owner].hand.find(c=>c.id===cardId);
 const legal=legalCommandTemplates(state,owner).find(c=>c.payload?.cardIid===card.iid&&c.payload?.destination?.z===0&&c.payload?.destination?.r===3&&c.payload?.destination?.c===3);
 assert.ok(legal,`seat ${owner} card ${cardId}: fourth slot must be legal`);
 const result=reduceCommand(state,command(state,'p'+owner,1,legal.type,legal.payload),{playerId:'p'+owner});
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.state.board[0][3][3].iid,card.iid);
}
console.log('Both seats can set Supporters and zero-tribute Characters in Anicka fourth slot through the shared authority.');



