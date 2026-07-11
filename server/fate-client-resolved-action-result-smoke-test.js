#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  canonicalStateHash,
  reduceServerAction
} = require('./fate-authority-reducer');

function card(id, owner, iid, type = 'Supporter'){
  return {
    id:String(id),
    iid:String(iid),
    name:`Card ${id}`,
    type,
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
    mode:'client-resolved',
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

const consolidationBase = baseState();
const resultCard = card('hero', 0, 'hero-1', 'Character');
const tributeA = card('sup-a', 0, 'sup-a-1');
const tributeB = card('sup-b', 0, 'sup-b-1');
consolidationBase.players[0].hand = [resultCard];
consolidationBase.board[0][2][0] = tributeA;
consolidationBase.board[0][2][1] = tributeB;
const consolidationBaseHash = canonicalStateHash(consolidationBase);
const chosenTributes = [
  {iid:tributeA.iid, id:tributeA.id, z:0, r:2, c:0, card:tributeA},
  {iid:tributeB.iid, id:tributeB.id, z:0, r:2, c:1, card:tributeB}
];

const badConsolidation = clone(consolidationBase);
badConsolidation.players[0].hand = [];
badConsolidation.players[0].discard = [tributeA];
badConsolidation.board[0][2][0] = resultCard;
badConsolidation.board[0][2][1] = tributeB;
const badConsolidationHash = canonicalStateHash(badConsolidation);
const rejectedConsolidation = reduceServerAction({
  canonicalState:consolidationBase,
  canonicalHash:consolidationBaseHash
}, {
  type:'SELECT_CONSOLIDATION_TRIBUTE',
  payload:{
    playerIndex:0,
    turn:1,
    z:0,
    r:2,
    c:0,
    chosenTributes,
    postState:badConsolidation,
    stateHash:badConsolidationHash,
    baseStateHash:consolidationBaseHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(rejectedConsolidation.ok, false);
assert.match(rejectedConsolidation.reason, /consolidation left a consumed supporter on the board|consolidation did not move every consumed supporter to discard/);

const goodConsolidation = clone(consolidationBase);
goodConsolidation.players[0].hand = [];
goodConsolidation.players[0].discard = [tributeA, tributeB];
goodConsolidation.board[0][2][0] = resultCard;
goodConsolidation.board[0][2][1] = null;
const goodConsolidationHash = canonicalStateHash(goodConsolidation);
const acceptedConsolidation = reduceServerAction({
  canonicalState:consolidationBase,
  canonicalHash:consolidationBaseHash
}, {
  type:'SELECT_CONSOLIDATION_TRIBUTE',
  payload:{
    playerIndex:0,
    turn:1,
    z:0,
    r:2,
    c:0,
    chosenTributes,
    postState:goodConsolidation,
    stateHash:goodConsolidationHash,
    baseStateHash:consolidationBaseHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(acceptedConsolidation.ok, true, acceptedConsolidation.reason);

const reactionBase = baseState();
reactionBase.players[0].hand = [];
reactionBase.players[1].hand = [card('79', 1, 'havano-1')];
const source = card('03', 0, 'source-1', 'Initiator');
source.name = 'Howard Walsh';
const lydia = card('56', 1, 'lydia-1', 'Improvisor');
lydia.name = 'Lydia';
lydia.usesLeft = 3;
const secules = card('67', 1, 'secules-1', 'Improvisor');
secules.name = 'Mr. Secules';
reactionBase.board[0][2][0] = source;
reactionBase.board[1][0][0] = lydia;
reactionBase.board[1][0][1] = secules;
const reactionBaseHash = canonicalStateHash(reactionBase);
const resolvedEffect = clone(reactionBase);
resolvedEffect.board[0][2][0].effectUsedInitial = true;
resolvedEffect.board[0][2][0]._effectTurnLocked = true;
resolvedEffect.board[0][2][0].currentFate = 99;
const resolvedHash = canonicalStateHash(resolvedEffect);
const armed = reduceServerAction({
  canonicalState:reactionBase,
  canonicalHash:reactionBaseHash
}, {
  type:'BOARD_ACTION',
  payload:{
    playerIndex:0,
    turn:1,
    fn:'triggerCharacterEffect',
    z:0,
    r:2,
    c:0,
    source:{z:0, r:2, c:0, card:{iid:'source-1', id:'03', name:'Howard Walsh', type:'Initiator'}},
    effectCinematic:{z:0, r:2, c:0, card:{iid:'source-1', id:'03', name:'Howard Walsh', type:'Initiator'}},
    reactionActionType:'targeting_effect',
    affectedOwners:[1],
    postState:resolvedEffect,
    stateHash:resolvedHash,
    baseStateHash:reactionBaseHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(armed.ok, true, armed.reason);
assert.ok(armed.reactionArmed, 'BOARD_ACTION should arm an Improvisor reaction');
const pending = armed.canonicalState._serverPendingReaction;
assert.ok(pending, 'armed state should contain _serverPendingReaction');
assert.strictEqual(Number(pending.playerIndex), 1);
assert.ok(pending.options.some(option=>option.kind === 'lydia'), 'pending reaction should include Lydia');
assert.ok(pending.options.some(option=>option.kind === 'secules'), 'pending reaction should include Mr. Secules');
assert.ok(pending.options.some(option=>option.kind === 'havano'), 'pending reaction should include Havano');
assert.strictEqual(armed.canonicalState.board[0][2][0].currentFate, 1, 'effect result should be paused until reaction choice');

const lydiaIndex = pending.options.findIndex(option=>option.kind === 'lydia');
const negated = reduceServerAction({
  canonicalState:armed.canonicalState,
  canonicalHash:armed.canonicalHash
}, {
  type:'REACTION_CHOICE',
  payload:{
    playerIndex:1,
    promptId:pending.promptId,
    choice:'negate',
    optionIndex:lydiaIndex,
    baseStateHash:armed.canonicalHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(negated.ok, true, negated.reason);
assert.strictEqual(negated.canonicalState._serverPendingReaction, null);
assert.strictEqual(negated.canonicalState.board[0][2][0].currentFate, 1, 'negated effect should not apply resolved postState mutation');
assert.strictEqual(negated.canonicalState.board[0][2][0].effectUsedInitial, true, 'negated source should still be spent');
assert.strictEqual(negated.canonicalState.board[1][0][0].usesLeft, 2, 'Lydia should spend one use');

const declined = reduceServerAction({
  canonicalState:armed.canonicalState,
  canonicalHash:armed.canonicalHash
}, {
  type:'REACTION_CHOICE',
  payload:{
    playerIndex:1,
    promptId:pending.promptId,
    choice:'decline',
    baseStateHash:armed.canonicalHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(declined.ok, true, declined.reason);
assert.strictEqual(declined.canonicalState._serverPendingReaction, null);
assert.strictEqual(declined.canonicalState.board[0][2][0].currentFate, 99, 'decline should apply stored effect result');

const havanoIndex = pending.options.findIndex(option=>option.kind === 'havano');
const havanoOption = pending.options[havanoIndex];
const havanoNegated = reduceServerAction({
  canonicalState:armed.canonicalState,
  canonicalHash:armed.canonicalHash
}, {
  type:'REACTION_CHOICE',
  payload:{
    playerIndex:1,
    promptId:pending.promptId,
    choice:'negate',
    optionIndex:havanoIndex,
    deployment:havanoOption.deploymentOptions[0],
    baseStateHash:armed.canonicalHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(havanoNegated.ok, true, havanoNegated.reason);
assert.strictEqual(havanoNegated.canonicalState.players[1].hand.length, 0, 'Havano should leave hand');
const deployed = havanoOption.deploymentOptions[0];
assert.strictEqual(havanoNegated.canonicalState.board[deployed.z][deployed.r][deployed.c].id, '79', 'Havano should deploy to chosen square');

console.log('fate-client-resolved-action-result smoke passed');
