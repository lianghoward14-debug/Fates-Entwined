import assert from 'node:assert/strict';
import {
  applyOperation,
  assertInvariants,
  createInitialState
} from '../../shared/engine/index.mjs';

const state = createInitialState({
  matchId:'P4CONTROL',
  seed:'p4-control-seed',
  handSize:1,
  cardDefinitions:[
    {id:'32', name:'Temecula Resident', type:'Supporter', aff:'reality', fate:1, cost:0}
  ],
  players:[
    {id:'p0', deckIds:['32']},
    {id:'p1', deckIds:['32']}
  ]
});
const source = state.players[0].hand.pop();
source.controller = 0;
state.board[0][2][0] = source;
const target = state.players[1].hand.pop();
target.controller = 1;
state.board[0][0][0] = target;
const ctx = {state, events:[], ruleEvents:[]};
const changed = applyOperation(ctx, {
  type:'CHANGE_CONTROL',
  targetIid:target.iid,
  controller:0,
  sourceIid:source.iid,
  sourceController:0,
  reason:'CONTROL_FAMILY_FIXTURE'
});
assert.equal(changed.previousController, 1);
assert.equal(changed.controller, 0);
assert.equal(target.owner, 1, 'control changes must preserve permanent ownership');
assert.equal(target.controller, 0);
assert(ctx.events.some(event=>
  event.type === 'CONTROL_CHANGED'
  && event.cardIid === target.iid
  && event.owner === 1
  && event.previousController === 1
  && event.controller === 0
));
assertInvariants(state);

assert.throws(
  ()=>applyOperation(ctx, {
    type:'CHANGE_CONTROL',
    targetIid:'missing-card',
    controller:0,
    sourceIid:source.iid,
    sourceController:0
  }),
  error=>error.code === 'CARD_NOT_ON_BOARD'
);

console.log('authoritative-v3 Phase 4 control-change operation smoke test passed');
