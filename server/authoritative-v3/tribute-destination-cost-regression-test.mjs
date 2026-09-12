import assert from 'node:assert/strict';
import {testState,takeFromHandToBoard,command} from './test-helpers.mjs';
import {legalCommandTemplates,reduceCommand} from '../../shared/engine/index.mjs';
for(const owner of [0,1])for(const taxed of [false,true]){
 const state=testState({activePlayer:owner,player0:['40','32','32','32'],player1:['40','32','32','32']});
 if(taxed){state.landscapeId='igb22';state.landscapeState.targetZones=[0,1];}
 const row=owner===0?2:0;
 const tributes=[0,1,2].map(z=>takeFromHandToBoard(state,owner,'32',{z,r:row,c:0}));
 const card=state.players[owner].hand.find(c=>c.id==='40');
 const destination={z:0,r:row,c:0};
 const tributeIids=tributes.slice(0,taxed?3:2).map(c=>c.iid);
 const payload={cardIid:card.iid,tributeIids,destination};
 const result=reduceCommand(state,command(state,'p'+owner,1,'CONSOLIDATE_CARD',payload),{playerId:'p'+owner});
 assert.equal(result.ok,true,JSON.stringify(result.rejection));
 assert(legalCommandTemplates(state,owner).some(c=>c.type==='CONSOLIDATE_CARD'&&c.payload.destination.z===0&&c.payload.tributeIids.length===tributeIids.length&&tributeIids.every(iid=>c.payload.tributeIids.includes(iid))),'picker must expose reducer-legal '+tributeIids.length+' tribute payment');
}
console.log('Both seats: normal two-tribute and mixed-destination three-tribute commands agree with reducer.');
