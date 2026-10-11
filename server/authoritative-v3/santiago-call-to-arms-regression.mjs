import assert from 'node:assert/strict';
import {createInitialState,reduceCommand} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';
const defs=[{id:'103',name:'Santiago General',type:'Initiator',fate:2,cost:2,rarity:'triangle'},{id:'05',name:'Soldier',type:'Supporter',fate:1,cost:0,rarity:'circle'}];
for(const seat of [0,1]) for(const high of [false,true]) for(const selfHigh of [false,true]){
 let state=createInitialState({matchId:`santiago-${seat}-${high}-${selfHigh}`,seed:'santiago',activePlayer:seat,handSize:99,players:[0,1].map(i=>({id:'p'+i,deckIds:['103','05','05','05']})),cardDefinitions:defs,gameSettings:{healthPressureSeals:true}});
 const place=(p,id,z,r,c,fate)=>{const hand=state.players[p].hand,card=hand.splice(hand.findIndex(c=>c.id===id),1)[0];card.currentFate=fate;state.board[z][r][c]=card;return card;};
 const row=seat===0?2:0,enemyRow=seat===0?0:2;
 const a=place(seat,'05',0,row,0,1),b=place(seat,'05',0,row,1,1),target=place(seat,'05',1,row,0,high?7:6),enemy=place(1-seat,'05',1,enemyRow,0,9);
 const general=state.players[seat].hand.find(c=>c.id==='103');if(selfHigh)general.currentFate=8;
 const morale=structuredClone(state.moralePressure.morale);let n=0;
 const send=(type,payload)=>{const result=reduceCommand(state,command(state,'p'+seat,++n,type,payload),{playerId:'p'+seat});assert.equal(result.ok,true,JSON.stringify(result));state=result.state;};
 send('CONSOLIDATE_CARD',{cardIid:general.iid,tributeIids:[a.iid,b.iid],destination:{z:0,r:row,c:0}});
 assert.equal(state.pendingPrompt?.type,'MODAL_CHOICE');
 assert.equal(state.players[seat].discard.some(c=>c.iid===target.iid),high);
 assert.equal(state.players[seat].discard.some(c=>c.iid===general.iid),selfHigh);
 assert.equal(state.board[1][enemyRow][0].iid,enemy.iid);
 send('ANSWER_PROMPT',{promptId:state.pendingPrompt.promptId,choice:state.pendingPrompt.options[0].value});
 assert.equal(state.pendingPrompt?.type,'CARD_SELECTION');const chosen=state.pendingPrompt.eligibleIids[0],before=state.players[seat].hand.length;
 send('ANSWER_PROMPT',{promptId:state.pendingPrompt.promptId,selectedIids:[chosen]});
 assert.equal(state.players[seat].hand.length,before+1);assert.equal(state.players[seat].hand.at(-1).id,chosen);assert.equal(state.pendingPrompt,null);assert.equal(state.effectStack.length,0);assert.deepEqual(state.moralePressure.morale,morale);
}
console.log('Santiago full Call to Arms flow passed for both seats: no 7+ targets, qualifying targets, self-discard, enemy exclusion and free card delivery');
