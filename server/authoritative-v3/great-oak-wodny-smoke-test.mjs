import assert from 'node:assert/strict';
import {createInitialState,reduceCommand,applyOperation,legalCommandTemplates} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

function setup(landscapeId,definitions,deckIds){
  const state=createInitialState({matchId:`LANDSCAPE-${landscapeId}`,seed:`landscape-${landscapeId}`,
    landscapeId,handSize:99,cardDefinitions:definitions,
    players:[{id:'p0',deckIds},{id:'p1',deckIds:['32']}]});
  state.phase='main';
  return state;
}
const definitions=[
  {id:'06',name:'Jorge',type:'Initiator',aff:'eventide',effect:'Search the deck for a card and add it to your hand.',fate:1,cost:1},
  {id:'32',name:'Resident',type:'Supporter',aff:'reality',effect:'',fate:1,cost:0},
  {id:'20',name:'South Wind Spearman',type:'Supporter',aff:'eventide',effect:'Shield Wall. (2 uses)',fate:1,cost:0},
  {id:'36',name:'Marie',type:'Improvisor',aff:'third_great_war',effect:'Remove one counter to activate Deterrance.',counterResourceKey:'deterranceCounters',fate:4,cost:1}
];
let state=setup('igb6',definitions,['06','32','32']);
const source=state.players[0].hand.find(card=>card.id==='06');
const supporters=state.players[0].hand.filter(card=>card.id==='32');
state.players[0].hand=[source];
state.players[0].deck=supporters;
state.players[0].hand=[];
state.board[0][2][0]=source;
let result=reduceCommand(state,command(state,'p0',1,'ACTIVATE_EFFECT',{sourceIid:source.iid}),{playerId:'p0'});
assert.equal(result.ok,true,JSON.stringify(result.rejection));
assert.equal(result.prompt?.type,'CARD_SELECTION');
result=reduceCommand(result.state,command(result.state,'p0',2,'ANSWER_PROMPT',{
  promptId:result.state.pendingPrompt.promptId,selectedIid:supporters[0].iid
}),{playerId:'p0'});
assert.equal(result.ok,true,JSON.stringify(result.rejection));
assert.equal(result.prompt?.type,'CARD_SELECTION','Great Oak opens after the search picker');
assert.deepEqual(result.prompt.eligibleIids,[supporters[1].iid]);
result=reduceCommand(result.state,command(result.state,'p0',3,'ANSWER_PROMPT',{
  promptId:result.state.pendingPrompt.promptId,selectedIid:supporters[1].iid
}),{playerId:'p0'});
assert.equal(result.ok,true,JSON.stringify(result.rejection));
const added=result.state.players[0].hand.find(card=>card.iid===supporters[1].iid);
assert.equal(added.counters.greatOakFreeSet,true);
assert.equal(added.counters.chauffeurFreeSet,true);
result.state.supportersSetThisTurn[0]=2;
const freeSet=reduceCommand(result.state,command(result.state,'p0',4,'SET_CARD',{
  cardIid:added.iid,destination:{z:0,r:2,c:1}
}),{playerId:'p0'});
assert.equal(freeSet.ok,true,JSON.stringify(freeSet.rejection));
assert.equal(freeSet.state.supportersSetThisTurn[0],2);
assert.equal(freeSet.state.board[0][2][1].counters.greatOakFreeSet,undefined);

state=setup('igb18',definitions,['20','36','32']);
const shield=state.players[0].hand.find(card=>card.id==='20');
const marie=state.players[0].hand.find(card=>card.id==='36');
state.players[0].hand=state.players[0].hand.filter(card=>card!==shield);
state.board[0][2][0]=shield;
for(let use=0;use<3;use++){
  const activation=reduceCommand(state,command(state,'p0',use+1,'ACTIVATE_EFFECT',{
    sourceIid:shield.iid,userActivated:true
  }),{playerId:'p0'});
  assert.equal(activation.ok,true,JSON.stringify(activation.rejection));
  state=activation.state;
}
assert.equal(state.board[0][2][0].counters.wodnyExtraUseSpent,true);
state.landscapeId='igb6';
state.landscapeId='igb18';
assert.equal(legalCommandTemplates(state,0).some(item=>item.type==='ACTIVATE_EFFECT' && item.payload?.sourceIid===shield.iid),false);
const ctx={state,events:[],ruleEvents:[]};
applyOperation(ctx,{type:'SET_CARD',playerIndex:0,cardIid:marie.iid,destination:{z:1,r:2,c:0},sourceController:0});
assert.equal(state.board[1][2][0].counters.deterranceCounters,2);
assert.equal(state.board[1][2][0].counters.wodnyCounterFirstSetChecked,true);
state.landscapeId='igb6';
applyOperation(ctx,{type:'DISCARD_CARD',targetIid:marie.iid,sourceIid:marie.iid,sourceController:0});
applyOperation(ctx,{type:'TRANSFER_CARDS',targetIid:marie.iid,playerIndex:0,destinationPile:'hand',sourceController:0});
state.landscapeId='igb18';
applyOperation(ctx,{type:'SET_CARD',playerIndex:0,cardIid:marie.iid,destination:{z:1,r:2,c:1},sourceController:0});
assert.equal(state.board[1][2][1].counters.deterranceCounters,2,'first-set counters cannot be reclaimed');

state=setup('igb18',definitions,['20','32']);
const returning=state.players[0].hand.find(card=>card.id==='20');
state.players[0].hand=state.players[0].hand.filter(card=>card!==returning);
state.board[0][2][0]=returning;
result=reduceCommand(state,command(state,'p0',1,'ACTIVATE_EFFECT',{
  sourceIid:returning.iid,userActivated:true
}),{playerId:'p0'});
assert.equal(result.ok,true);
state=result.state;
state.landscapeId='igb6';
state.landscapeId='igb18';
assert.equal(state.board[0][2][0].counters.wodnyExtraUseSpent,undefined);
assert(legalCommandTemplates(state,0).some(item=>item.type==='ACTIVATE_EFFECT' && item.payload?.sourceIid===returning.iid));
console.log('Great Oak search and Wodny uses/counters smoke tests passed');
