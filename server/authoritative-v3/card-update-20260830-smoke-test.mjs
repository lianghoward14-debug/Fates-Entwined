import assert from 'node:assert/strict';
import {
  applyOperation,
  cardRule,
  createInitialState,
  effectiveConsolidationCost,
  reduceCommand
} from '../../shared/engine/index.mjs';
import {collectTriggeredOperations} from '../../shared/engine/triggers.mjs';
import {command} from './test-helpers.mjs';

const definitions = [
  {id:'02',name:'Anicka Konvicka',type:'Initiator',aff:'eventide',fate:8,cost:2},
  {id:'20',name:'South Wind Spearman',type:'Supporter',aff:'eventide',fate:1,cost:0},
  {id:'56',name:'Lydia',type:'Improvisor',aff:'expanded_worlds',fate:7,cost:2},
  {id:'67',name:'Mr. Secules',type:'Improvisor',aff:'reality',fate:4,cost:1},
  {id:'76',name:'ALPINE Infantry',type:'Supporter',aff:'expanded_worlds',fate:1,cost:0},
  {id:'95',name:'Carpathian Specters',type:'Supporter',aff:'expanded_worlds',fate:1,cost:0},
  {id:'bh08',name:'Maja Kaminska (University)',type:'Coordinator',aff:'expanded_worlds',fate:4,cost:3},
  {id:'character',name:'Test Character',type:'Initiator',aff:'reality',fate:2,cost:3}
];

function stateFor(id){
  return createInitialState({
    matchId:id,seed:id,handSize:99,activePlayer:0,cardDefinitions:definitions,
    players:[
      {id:'p0',deckIds:['02','20','95','bh08','character']},
      {id:'p1',deckIds:['56','67','character']}
    ]
  });
}

function board(state,player,id,destination){
  const index=state.players[player].hand.findIndex(card=>card.id===id);
  assert(index>=0,`missing ${id}`);
  const card=state.players[player].hand.splice(index,1)[0];
  card.controller=player;
  state.board[destination.z][destination.r][destination.c]=card;
  return card;
}

let state=stateFor('south-wind-activate');
const spearman=board(state,0,'20',{z:0,r:2,c:0});
board(state,1,'56',{z:0,r:0,c:0});
board(state,1,'67',{z:0,r:0,c:1});
assert.deepEqual(cardRule('20',state).timings,['ACTIVATE']);
let result=reduceCommand(state,command(state,'p0',1,'ACTIVATE_EFFECT',{sourceIid:spearman.iid,userActivated:true}),{playerId:'p0'});
assert.equal(result.ok,true);
assert.equal(result.prompt?.type,'REACTION');
assert.deepEqual(result.prompt.options.map(option=>option.kind),['LYDIA'],'Shield Wall exposes Lydia but not Mr. Secules');
assert.equal(result.state.board[0][2][0].counters.effectUses,1);
state=result.state;
result=reduceCommand(state,command(state,'p1',2,'ANSWER_PROMPT',{promptId:state.pendingPrompt.promptId,choice:'DECLINE'}),{playerId:'p1'});
assert.equal(result.ok,true);
state=result.state;
result=reduceCommand(state,command(state,'p0',3,'ACTIVATE_EFFECT',{sourceIid:spearman.iid,userActivated:true}),{playerId:'p0'});
assert.equal(result.ok,true);
assert.equal(result.state.board[0][2][0].counters.effectUses,2);
state=result.state;
result=reduceCommand(state,command(state,'p1',4,'ANSWER_PROMPT',{promptId:state.pendingPrompt.promptId,choice:'DECLINE'}),{playerId:'p1'});
state=result.state;
result=reduceCommand(state,command(state,'p0',5,'ACTIVATE_EFFECT',{sourceIid:spearman.iid,userActivated:true}),{playerId:'p0'});
assert.equal(result.ok,false);
assert.equal(result.rejection.code,'USE_LIMIT_REACHED');

state=stateFor('anicka-row-cost');
const anicka=board(state,0,'02',{z:0,r:2,c:0});
const ctx={state,events:[],ruleEvents:[]};
applyOperation(ctx,{type:'ADD_SAFE_ROW',playerIndex:0,sourceIid:anicka.iid});
const rowEvent=ctx.events.find(event=>event.type==='SAFE_ROW_ADDED');
assert(rowEvent);
const character=state.players[0].hand.find(card=>card.id==='character');
assert.equal(effectiveConsolidationCost(state,character,0,{z:0,r:rowEvent.row,c:0}),1);
assert.equal(effectiveConsolidationCost(state,character,0,{z:0,r:2,c:1}),3);

state=stateFor('maja-opponent-only');
const maja=board(state,0,'bh08',{z:0,r:2,c:0});
const ownSource=board(state,0,'95',{z:0,r:2,c:1});
const opponentSource=board(state,1,'character',{z:1,r:0,c:0});
assert.equal(collectTriggeredOperations(state,{type:'EFFECT_REACTED',mode:'SUPPRESS',playerIndex:0,sourceIid:ownSource.iid}).some(op=>op.reason==='MISCHIEVOUS_ACTIVITIES'),false);
assert.equal(collectTriggeredOperations(state,{type:'EFFECT_REACTED',mode:'NEGATE',playerIndex:0,sourceIid:opponentSource.iid}).filter(op=>op.reason==='MISCHIEVOUS_ACTIVITIES').length,2);
assert(maja);

assert.equal(cardRule('76').program[0].operation.amount,5);
state=stateFor('specter-eight');
const specter=board(state,0,'95',{z:0,r:2,c:0});
const tick=collectTriggeredOperations(state,{type:'TURN_STARTED',playerIndex:0}).find(op=>op.targetIid===specter.iid&&op.type==='TICK_COUNTER_FATE');
assert.equal(tick.maxTriggers,8);

console.log('2026-08-30 card updates smoke test passed');
