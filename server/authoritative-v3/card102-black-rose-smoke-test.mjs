import assert from 'node:assert/strict';
import {applyOperation,cardRule,createInitialState,projectStateForPlayer} from '../../shared/engine/index.mjs';

const definitions=[
  {id:'102',name:'Anne Stone (Anarchist)',ability:'The Black Rose',type:'Improvisor',aff:'eventide',fate:4,cost:1,rarity:'square'},
  {id:'05',name:'Placement Victim',type:'Supporter',aff:'third_great_war',fate:1,cost:0}
];
const state=createInitialState({matchId:'black-rose',seed:'black-rose',handSize:1,activePlayer:1,
  players:[{id:'p0',deckIds:['102']},{id:'p1',deckIds:['05']}],cardDefinitions:definitions,
  gameSettings:{healthPressureSeals:true,pressureCardReworks:true,zoneControlRework:true}});
const anne=state.players[0].hand[0];
anne.owner=0;anne.controller=0;anne.faceDown=true;anne.statuses=[];anne.counters={};
state.players[0].hand=[];state.board[0][0][0]=anne;state.turn=2;
const ctx={state,events:[],ruleEvents:[]};

assert.deepEqual(cardRule('102').timings,['ACTIVATE']);
assert(cardRule('102').effectLabels.includes('HIDDEN_NEXT_OPPONENT_TURN_SQUARE_TRAP'));
applyOperation(ctx,{type:'CREATE_SQUARE_STATUS',destination:{z:0,r:1,c:1},statusType:'HIDDEN_BOMB_TRAP',sourceIid:anne.iid,sourceController:0,playerIndex:0,targetPlayer:1,triggerTurnOffset:1,privateToOwner:true});
state.turn=3;
assert.equal(projectStateForPlayer(state,0).geometry.squareStatuses.length,1,'owner sees armed bomb square');
assert.equal(projectStateForPlayer(state,1).geometry.squareStatuses.length,0,'opponent cannot see armed bomb square');

const victim=state.players[1].hand[0];
applyOperation(ctx,{type:'SET_CARD',playerIndex:1,cardIid:victim.iid,destination:{z:0,r:1,c:1},playedFromHand:true,countTowardSupporterLimit:true});
assert.equal(state.board[0][1][1],null,'bomb discards the card immediately');
assert(state.players[1].discard.some(card=>card.iid===victim.iid));
assert(!state.geometry.squareStatuses.some(status=>status.type==='HIDDEN_BOMB_TRAP'),'bomb is consumed');
assert(ctx.events.some(event=>event.type==='HIDDEN_BOMB_EXPLODED'&&event.semanticSourceCardId==='102'));

console.log('card 102 The Black Rose smoke test passed');
