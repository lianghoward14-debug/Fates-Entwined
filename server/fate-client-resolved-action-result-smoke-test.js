#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  canonicalStateHash,
  reduceActionResult,
  reduceServerAction
} = require('./fate-authority-reducer');

function clone(value){
  return JSON.parse(JSON.stringify(value));
}

function baseState(){
  return {
    v:2,
    players:[
      {deck:[], hand:[{id:'server-gap-host-card', iid:'host-hand-1'}], discard:[]},
      {deck:[], hand:[{id:'guest-card', iid:'guest-hand-1'}], discard:[]}
    ],
    board:[
      [[null, null, null], [null, null, null], [null, null, null]],
      [[null, null, null], [null, null, null], [null, null, null]],
      [[null, null, null], [null, null, null], [null, null, null]]
    ],
    currentPlayer:0,
    turn:1,
    phase:'main',
    selectedHandCard:null
  };
}

function roomWithState(state){
  const hash = canonicalStateHash(state);
  return {
    canonicalState:state,
    canonicalHash:hash,
    lastStateHash:hash,
    playerOrder:['host-uid', 'guest-uid']
  };
}

function actionResult(room, overrides){
  const postState = clone(overrides.postState || room.canonicalState);
  const payload = Object.assign({
    playerIndex:0,
    turn:1,
    actionKind:'BOARD_ACTION',
    clientActionId:'client-resolved-smoke',
    baseStateHash:room.canonicalHash,
    postState,
    stateHash:canonicalStateHash(postState),
    summary:{
      cardId:'server-gap-host-card',
      cardName:'Client-Resolved Smoke Effect',
      source:{z:0, r:0, c:0},
      target:{z:1, r:1, c:1}
    }
  }, overrides.payload || {});
  return {type:'ACTION_RESULT', payload};
}

function expectReject(label, room, msg, fragment){
  const result = reduceActionResult(room, msg, {requireBaseHash:true, mode:'strict'});
  assert.strictEqual(result.ok, false, `${label} should reject`);
  assert.match(String(result.reason || ''), new RegExp(fragment), `${label} reason`);
}

const state = baseState();
const room = roomWithState(state);

expectReject('missing postState', room, {type:'ACTION_RESULT', payload:{
  playerIndex:0,
  actionKind:'BOARD_ACTION',
  baseStateHash:room.canonicalHash,
  stateHash:'missing'
}}, 'postState');

expectReject('wrong player', room, actionResult(room, {
  payload:{playerIndex:1}
}), 'priority');

expectReject('stale base hash', room, actionResult(room, {
  payload:{baseStateHash:'stale-hash'}
}), 'stale baseStateHash');

expectReject('bad state hash', room, actionResult(room, {
  payload:{stateHash:'bad-hash'}
}), 'stateHash does not match');

const malformed = clone(state);
malformed.board = {not:'an array'};
expectReject('malformed board', room, actionResult(room, {
  postState:malformed
}), 'board must be an array');

const committed = clone(state);
committed.board[1][1][1] = {
  id:'server-gap-host-card',
  iid:'server-gap-board-1',
  name:'Client-Resolved Smoke Effect',
  owner:0,
  type:'Initiator'
};
committed.players[0].hand = [];
const accepted = reduceServerAction(room, actionResult(room, {
  postState:committed
}), {
  mode:'strict',
  requireBaseHash:true,
  gameplayAuthority:'client-resolved'
});
assert.strictEqual(accepted.ok, true, `valid ACTION_RESULT should accept: ${accepted.reason || ''}`);
assert.strictEqual(accepted.canonicalHash, canonicalStateHash(committed), 'accepted hash should match committed state');
assert.strictEqual(accepted.canonicalState.board[1][1][1].iid, 'server-gap-board-1', 'accepted state should preserve client-resolved effect result');

const endTurnState = clone(committed);
const endTurnRoom = roomWithState(committed);
endTurnState.currentPlayer = 1;
endTurnState.turn = 2;
const endTurnAccepted = reduceActionResult(endTurnRoom, actionResult(endTurnRoom, {
  postState:endTurnState,
  payload:{actionKind:'END_TURN', turn:1}
}), {requireBaseHash:true, mode:'strict'});
assert.strictEqual(endTurnAccepted.ok, true, `END_TURN ACTION_RESULT should transfer priority: ${endTurnAccepted.reason || ''}`);

console.log('fate-client-resolved-action-result smoke passed');
