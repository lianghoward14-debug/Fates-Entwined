import assert from 'node:assert/strict';
import {createInitialState, reduceCommand} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const definitions = [
  {id:'32',name:'Temecula Resident',type:'Supporter',aff:'reality',fate:1,cost:0},
  {id:'27',name:'Kazumi',type:'Initiator',aff:'eventide',fate:1,cost:1}
];
const state=createInitialState({
  matchId:'IGB24-TURN20',seed:'igb24-turn20',handSize:99,activePlayer:0,
  landscapeId:'igb24',cardDefinitions:definitions,
  players:[{id:'p0',deckIds:['32','27']},{id:'p1',deckIds:['32','27']}]
});
state.turn=19;
const supporter=state.players[0].hand.splice(state.players[0].hand.findIndex(card=>card.id==='32'),1)[0];
supporter.controller=0;
supporter.counters.fieldEnteredTurn=10;
state.board[0][2][0]=supporter;
const youngSupporter={...supporter,iid:'young-supporter',currentFate:1,statuses:[],counters:{fieldEnteredTurn:11}};
state.board[1][2][0]=youngSupporter;
const before=supporter.currentFate;
const result=reduceCommand(state,command(state,'p0',1,'END_TURN'),{playerId:'p0'});

assert.equal(result.ok,true,'ending turn 19 must not be blocked by Moscow immunity');
const live=result.state.board[0][2][0];
assert.equal(live.currentFate,before+6,'the existing Supporter gains exactly 6 Fate');
assert(live.statuses.includes('IMMUNE_TO_OPPONENT_EFFECTS'),'the Supporter gains opponent-effect immunity');
assert(!live.statuses.includes('IMMUNE_TO_ALL_EFFECTS'),'Moscow does not grant full effect immunity');
assert.equal(result.state.board[1][2][0].currentFate,1,'a Supporter with fewer than 10 turns on the field gains no Fate');
assert(!result.state.board[1][2][0].statuses.includes('IMMUNE_TO_OPPONENT_EFFECTS'),'a young Supporter gains no immunity');
assert.equal(result.events.find(event=>event.type==='LANDSCAPE_RESOLVED')?.grantedStatus,'IMMUNE_TO_OPPONENT_EFFECTS');

console.log('igb24 Moscow turn-20 smoke test passed');
