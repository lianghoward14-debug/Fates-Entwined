#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  canonicalStateHash,
  validateProposedTransition
} = require('./fate-authority-reducer');

function card(iid){
  return {
    id:'101',
    iid,
    name:'Smoke Character',
    type:'Character',
    owner:0,
    fate:3,
    currentFate:3
  };
}

function baseState(){
  return {
    v:2,
    players:[
      {name:'P1', color:'', deck:[], hand:[], discard:[]},
      {name:'P2', color:'', deck:[], hand:[], discard:[]}
    ],
    board:[
      [[null,null,null], [null,null,null], [null,null,null]],
      [[null,null,null], [null,null,null], [null,null,null]],
      [[null,null,null], [null,null,null], [null,null,null]]
    ],
    currentPlayer:0,
    turn:1,
    selectedHandCard:null
  };
}

const current = baseState();
current.board[0][2][0] = card('smoke-board-1');
const currentHash = canonicalStateHash(current);

const smaller = baseState();
smaller.players[0].hand.push(card('smoke-board-1'));
const smallerHash = canonicalStateHash(smaller);

const result = validateProposedTransition({
  canonicalState:current,
  canonicalHash:currentHash
}, {
  type:'ACTION_RESULT',
  payload:{
    playerIndex:0,
    actionKind:'AUTO_CLIENT_STATE_COMMIT',
    postState:smaller,
    stateHash:smallerHash,
    baseStateHash:currentHash
  }
}, {
  requireBaseHash:true
});

assert.strictEqual(result.ok, true, result.reason || 'expected repaired transition');
assert.strictEqual(result.serverReduced, true, 'repaired state must be broadcast as server-reduced canonical state');
assert.strictEqual(result.boardPreferenceRepaired, true, 'expected board preference repair flag');
assert.strictEqual(result.boardCardsRestored, 1, 'expected one restored board card');
assert(result.canonicalState.board[0][2][0], 'missing board card was not restored');
assert.strictEqual(result.canonicalState.board[0][2][0].iid, 'smoke-board-1');
assert.strictEqual(result.canonicalState.players[0].hand.length, 0, 'restored board card must not remain duplicated in hand');
assert.strictEqual(canonicalStateHash(result.canonicalState), result.canonicalHash, 'repaired canonical hash mismatch');
assert.notStrictEqual(result.canonicalHash, smallerHash, 'repaired hash should differ from smaller incoming hash');

console.log(JSON.stringify({
  ok:true,
  boardPreferenceRepaired:result.boardPreferenceRepaired,
  boardCardsRestored:result.boardCardsRestored,
  canonicalHash:result.canonicalHash
}, null, 2));
