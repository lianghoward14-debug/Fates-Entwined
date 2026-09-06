import assert from 'node:assert/strict';
import {testState} from './test-helpers.mjs';
import {collectTriggeredOperations} from '../../shared/engine/triggers.mjs';
for(const owner of [0,1])for(const row of [0,1,2,3,4]){
  const state=testState();
  const source={id:'02',iid:'anicka',owner,controller:owner,type:'Initiator',faceDown:false,statuses:[],counters:{}};
  const placed={id:'32',iid:'placed',owner,controller:owner,type:'Supporter',faceDown:false,statuses:[],counters:{}};
  state.board[0]=Array.from({length:5},()=>Array(4).fill(null));
  state.board[0][owner===0?2:0][0]=source;
  state.board[0][row][1]=placed;
  state.geometry.playableExtraSquares=[{z:0,r:3,c:1,owner,sourceIid:'anicka'},{z:0,r:4,c:1,owner,sourceIid:'other'}];
  const bonus=()=>collectTriggeredOperations(state,{type:'CARD_SET',cardIid:'placed',playerIndex:owner}).filter(op=>op.reason==='STARLIT_PATH');
  assert.equal(bonus().length,row===3?1:0,`seat ${owner}, row ${row}`);
  if(row===3)assert.equal(bonus()[0].amount,4);
  source.statuses.push('EFFECTS_SUPPRESSED');assert.equal(bonus().length,0);
}
console.log('Anicka grants +4 only in her generated row, for both seats; unrelated rows and suppressed sources excluded');
