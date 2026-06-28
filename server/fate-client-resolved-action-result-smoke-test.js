#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  canonicalStateHash,
  reduceServerAction
} = require('./fate-authority-reducer');

function card(id, owner, iid){
  return {
    id:String(id),
    iid:String(iid),
    name:`Card ${id}`,
    type:'Supporter',
    owner:Number(owner),
    fate:1,
    currentFate:1
  };
}

function emptyBoard(){
  return Array.from({length:3}, () => Array.from({length:3}, () => Array.from({length:3}, () => null)));
}

function baseState(){
  return {
    v:2,
    phase:'main',
    turn:1,
    currentPlayer:0,
    players:[
      {hand:[card('05', 0, 'p0-hand-1')], deck:[], discard:[]},
      {hand:[card('05', 1, 'p1-hand-1')], deck:[], discard:[]}
    ],
    board:emptyBoard(),
    selectedHandCard:null,
    selectedBoardCard:null,
    placing:false,
    blockingCell:false,
    pendingEffect:null,
    pendingInteraction:null
  };
}

function clone(value){
  return JSON.parse(JSON.stringify(value));
}

function reduce(room, payload){
  return reduceServerAction(room, {
    type:'ACTION_RESULT',
    payload:Object.assign({
      playerIndex:0,
      turn:1,
      actionKind:'END_TURN'
    }, payload)
  }, {
    mode:'strict',
    requireBaseHash:true
  });
}

const initial = baseState();
const initialHash = canonicalStateHash(initial);
const postState = clone(initial);
postState.turn = 2;
postState.currentPlayer = 1;
const postHash = canonicalStateHash(postState);

const accepted = reduce({
  canonicalState:initial,
  canonicalHash:initialHash
}, {
  baseStateHash:initialHash,
  postState,
  stateHash:postHash
});
assert.strictEqual(accepted.ok, true, accepted.reason);
assert.deepStrictEqual(accepted.canonicalState, postState);
assert.strictEqual(accepted.canonicalHash, postHash);

const stale = reduce({
  canonicalState:initial,
  canonicalHash:'server-newer-hash'
}, {
  baseStateHash:initialHash,
  postState,
  stateHash:postHash
});
assert.strictEqual(stale.ok, false);
assert.match(stale.reason, /stale baseStateHash/);

const wrongHash = reduce({
  canonicalState:initial,
  canonicalHash:initialHash
}, {
  baseStateHash:initialHash,
  postState,
  stateHash:'wrong-hash'
});
assert.strictEqual(wrongHash.ok, false);
assert.match(wrongHash.reason, /stateHash does not match postState/);

const missingPostState = reduce({
  canonicalState:initial,
  canonicalHash:initialHash
}, {
  baseStateHash:initialHash,
  stateHash:postHash
});
assert.strictEqual(missingPostState.ok, false);
assert.match(missingPostState.reason, /postState/);

const badEndTurn = reduce({
  canonicalState:initial,
  canonicalHash:initialHash
}, {
  baseStateHash:initialHash,
  postState:Object.assign(clone(initial), {turn:2, currentPlayer:0}),
  stateHash:canonicalStateHash(Object.assign(clone(initial), {turn:2, currentPlayer:0}))
});
assert.strictEqual(badEndTurn.ok, false);
assert.match(badEndTurn.reason, /END_TURN did not pass priority/);

console.log('fate-client-resolved-action-result smoke passed');
