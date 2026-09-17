import assert from 'node:assert/strict';
import {cardRule,createInitialState,reduceCommand} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const definitions=[
  {id:'103',name:'Santiago Alvarez (General)',ability:'Sangre Por Victoria',type:'Initiator',aff:'third_great_war',fate:4,cost:1,rarity:'triangle'},
  {id:'05',name:'Supporter',type:'Supporter',aff:'third_great_war',fate:1,cost:0}
];
let state=createInitialState({matchId:'card-103',seed:'card-103',handSize:5,activePlayer:0,
  players:[{id:'p0',deckIds:['103','05','05','05','05']},{id:'p1',deckIds:[]}],cardDefinitions:definitions,
  gameSettings:{healthPressureSeals:true,pressureCardReworks:true,zoneControlRework:true}});
const supporterIndex=state.players[0].hand.findIndex(card=>card.id==='05');
const supporter=state.players[0].hand.splice(supporterIndex,1)[0];supporter.owner=0;supporter.controller=0;state.board[0][2][0]=supporter;
const santiago=state.players[0].hand.find(card=>card.id==='103');
const fillers=state.players[0].hand.filter(card=>card!==santiago);state.players[0].hand=[santiago];state.players[0].deck=fillers;
state.moralePressure.morale[0]=50;

assert(cardRule('103').effectLabels.includes('MORALE_PAYMENT'));
let result=reduceCommand(state,command(state,'p0',1,'CONSOLIDATE_CARD',{cardIid:santiago.iid,tributeIids:[supporter.iid],destination:{z:0,r:2,c:0}}),{playerId:'p0'});
assert.equal(result.ok,true);state=result.state;
assert.deepEqual(state.pendingPrompt.options.map(option=>Number(option.value)),[15,30,45],'payments are legal 15-point increments capped by current Morale');
result=reduceCommand(state,command(state,'p0',2,'ANSWER_PROMPT',{promptId:state.pendingPrompt.promptId,choice:'30'}),{playerId:'p0'});
assert.equal(result.ok,true);state=result.state;
assert.equal(state.moralePressure.morale[0],20);
assert.equal(state.players[0].hand.length,2,'paying 30 Morale draws two cards');

console.log('card 103 Sangre Por Victoria smoke test passed');
