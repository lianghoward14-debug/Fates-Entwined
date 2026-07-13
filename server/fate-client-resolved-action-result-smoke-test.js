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

const chooseTurnOpponentFirst = reduceServerAction({
  canonicalState:initial,
  canonicalHash:initialHash
}, {
  type:'CHOOSE_TURN',
  payload:{
    playerIndex:0,
    goFirst:false
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(chooseTurnOpponentFirst.ok, true, chooseTurnOpponentFirst.reason);
assert.strictEqual(chooseTurnOpponentFirst.canonicalState.currentPlayer, 1, 'coin winner choosing not to go first should make the opponent currentPlayer');
assert.strictEqual(chooseTurnOpponentFirst.canonicalState.phase, 'main');

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

const duplicateTributeBase = baseState();
const duplicateResultCard = card('hero', 0, 'hero-duplicate-1', 'Character');
const duplicateConsumed = card('dup-sup', 0, 'dup-consumed-1');
const duplicateRemaining = card('dup-sup', 0, 'dup-remaining-1');
duplicateTributeBase.players[0].hand = [duplicateResultCard];
duplicateTributeBase.board[0][2][0] = duplicateConsumed;
duplicateTributeBase.board[0][2][1] = duplicateRemaining;
const duplicateTributeBaseHash = canonicalStateHash(duplicateTributeBase);
const duplicateTributePostState = clone(duplicateTributeBase);
duplicateTributePostState.players[0].hand = [];
duplicateTributePostState.players[0].discard = [duplicateConsumed];
duplicateTributePostState.board[0][2][0] = duplicateResultCard;
duplicateTributePostState.board[0][2][1] = duplicateRemaining;
const duplicateTributePostHash = canonicalStateHash(duplicateTributePostState);
const acceptedDuplicateTribute = reduceServerAction({
  canonicalState:duplicateTributeBase,
  canonicalHash:duplicateTributeBaseHash
}, {
  type:'SELECT_CONSOLIDATION_TRIBUTE',
  payload:{
    playerIndex:0,
    turn:1,
    z:0,
    r:2,
    c:0,
    chosenTributes:[{iid:duplicateConsumed.iid, id:duplicateConsumed.id, z:0, r:2, c:0, card:duplicateConsumed}],
    postState:duplicateTributePostState,
    stateHash:duplicateTributePostHash,
    baseStateHash:duplicateTributeBaseHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(acceptedDuplicateTribute.ok, true, acceptedDuplicateTribute.reason);

const slotOnlyLeftBehindBase = baseState();
const slotOnlyResult = card('hero', 0, 'hero-slot-only-1', 'Character');
const slotOnlyTribute = card('slot-sup', 0, 'slot-sup-1');
slotOnlyLeftBehindBase.players[0].hand = [slotOnlyResult];
slotOnlyLeftBehindBase.board[0][2][0] = slotOnlyTribute;
const slotOnlyLeftBehindHash = canonicalStateHash(slotOnlyLeftBehindBase);
const slotOnlyBadPost = clone(slotOnlyLeftBehindBase);
slotOnlyBadPost.players[0].hand = [];
slotOnlyBadPost.board[0][2][1] = slotOnlyResult;
slotOnlyBadPost.board[0][2][0] = slotOnlyTribute;
slotOnlyBadPost.players[0].discard = [slotOnlyTribute];
const slotOnlyBadPostHash = canonicalStateHash(slotOnlyBadPost);
const rejectedSlotOnlyLeftBehind = reduceServerAction({
  canonicalState:slotOnlyLeftBehindBase,
  canonicalHash:slotOnlyLeftBehindHash
}, {
  type:'SELECT_CONSOLIDATION_TRIBUTE',
  payload:{
    playerIndex:0,
    turn:1,
    z:0,
    r:2,
    c:1,
    chosenTributes:[{id:slotOnlyTribute.id, z:0, r:2, c:0, card:{id:slotOnlyTribute.id}}],
    postState:slotOnlyBadPost,
    stateHash:slotOnlyBadPostHash,
    baseStateHash:slotOnlyLeftBehindHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(rejectedSlotOnlyLeftBehind.ok, false);
assert.match(rejectedSlotOnlyLeftBehind.reason, /consolidation left a consumed supporter on the board/);

const slotOnlyDifferentCardBase = baseState();
const slotOnlyDifferentResult = card('hero', 0, 'hero-slot-only-2', 'Character');
const slotOnlyDifferentTribute = card('slot-sup', 0, 'slot-sup-2');
const replacementSupporter = card('other-sup', 0, 'other-sup-1');
slotOnlyDifferentCardBase.players[0].hand = [slotOnlyDifferentResult];
slotOnlyDifferentCardBase.board[0][2][0] = slotOnlyDifferentTribute;
const slotOnlyDifferentHash = canonicalStateHash(slotOnlyDifferentCardBase);
const slotOnlyDifferentPost = clone(slotOnlyDifferentCardBase);
slotOnlyDifferentPost.players[0].hand = [];
slotOnlyDifferentPost.players[0].discard = [slotOnlyDifferentTribute];
slotOnlyDifferentPost.board[0][2][0] = replacementSupporter;
slotOnlyDifferentPost.board[0][2][1] = slotOnlyDifferentResult;
const slotOnlyDifferentPostHash = canonicalStateHash(slotOnlyDifferentPost);
const acceptedSlotOnlyDifferentCard = reduceServerAction({
  canonicalState:slotOnlyDifferentCardBase,
  canonicalHash:slotOnlyDifferentHash
}, {
  type:'SELECT_CONSOLIDATION_TRIBUTE',
  payload:{
    playerIndex:0,
    turn:1,
    z:0,
    r:2,
    c:1,
    chosenTributes:[{id:slotOnlyDifferentTribute.id, z:0, r:2, c:0, card:{id:slotOnlyDifferentTribute.id}}],
    postState:slotOnlyDifferentPost,
    stateHash:slotOnlyDifferentPostHash,
    baseStateHash:slotOnlyDifferentHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(acceptedSlotOnlyDifferentCard.ok, true, acceptedSlotOnlyDifferentCard.reason);

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
assert.ok(!pending.options.some(option=>option.kind === 'havano'), 'pending reaction should not include Havano for sources outside the explicit Havano table');
assert.strictEqual(armed.canonicalState.board[0][2][0].currentFate, 1, 'effect result should be paused until reaction choice');
assert.strictEqual(armed.canonicalState.board[0][2][0].effectUsedInitial, true, 'armed reaction canonical state should still mark the source effect spent');
assert.strictEqual(armed.canonicalState.board[0][2][0]._effectTurnLocked, true, 'armed reaction canonical state should still lock the source effect');

const rogueCommitWhileReactionPending = clone(resolvedEffect);
rogueCommitWhileReactionPending.board[0][2][0].currentFate = 123;
const rogueCommitHash = canonicalStateHash(rogueCommitWhileReactionPending);
const blockedRogueCommit = reduceServerAction({
  canonicalState:armed.canonicalState,
  canonicalHash:armed.canonicalHash
}, {
  type:'ACTION_RESULT',
  payload:{
    playerIndex:0,
    turn:1,
    actionKind:'AUTO_CLIENT_STATE_COMMIT',
    postState:rogueCommitWhileReactionPending,
    stateHash:rogueCommitHash,
    baseStateHash:armed.canonicalHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(blockedRogueCommit.ok, false, 'generic state commits must not overwrite a pending Improvisor reaction');
assert.match(blockedRogueCommit.reason, /pending reaction must resolve first/);

const sparseSupporterReactionBase = baseState();
sparseSupporterReactionBase.players[0].hand = [];
sparseSupporterReactionBase.players[1].hand = [card('79', 1, 'havano-sparse')];
const supporterSource = card('16', 0, 'supporter-source-1', 'Supporter');
supporterSource.name = 'MINAE Death Squad';
const sparseLydia = card('56', 1, 'lydia-sparse', 'Improvisor');
sparseLydia.name = 'Lydia';
sparseLydia.usesLeft = 3;
const sparseSecules = card('67', 1, 'secules-sparse', 'Improvisor');
sparseSecules.name = 'Mr. Secules';
sparseSupporterReactionBase.board[0][2][0] = supporterSource;
sparseSupporterReactionBase.board[1][0][0] = sparseLydia;
sparseSupporterReactionBase.board[1][0][1] = sparseSecules;
const sparseSupporterBaseHash = canonicalStateHash(sparseSupporterReactionBase);
const sparseSupporterResolved = clone(sparseSupporterReactionBase);
sparseSupporterResolved.board[0][2][0].effectUsedInitial = true;
sparseSupporterResolved.board[0][2][0]._effectTurnLocked = true;
const sparseSupporterResolvedHash = canonicalStateHash(sparseSupporterResolved);
const sparseSupporterArmed = reduceServerAction({
  canonicalState:sparseSupporterReactionBase,
  canonicalHash:sparseSupporterBaseHash
}, {
  type:'BOARD_ACTION',
  payload:{
    playerIndex:0,
    turn:1,
    fn:'activatePendingWhenSetEffect',
    z:0,
    r:2,
    c:0,
    source:{z:0, r:2, c:0, card:{iid:'supporter-source-1', id:'16', name:'MINAE Death Squad'}},
    effectCinematic:{z:0, r:2, c:0, card:{iid:'supporter-source-1', id:'16', name:'MINAE Death Squad'}},
    reactionActionType:'when_set_effect',
    postState:sparseSupporterResolved,
    stateHash:sparseSupporterResolvedHash,
    baseStateHash:sparseSupporterBaseHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(sparseSupporterArmed.ok, true, sparseSupporterArmed.reason);
assert.ok(sparseSupporterArmed.reactionArmed, 'sparse Supporter when-set payload should still arm an Improvisor reaction');
const sparseSupporterPending = sparseSupporterArmed.canonicalState._serverPendingReaction;
assert.ok(sparseSupporterPending, 'sparse Supporter reaction should contain _serverPendingReaction');
assert.strictEqual(sparseSupporterPending.actionType, 'supporter_effect', 'Supporter when-set payload should be normalized to supporter_effect');
assert.ok(sparseSupporterPending.options.some(option=>option.kind === 'lydia'), 'sparse Supporter reaction should include Lydia');
assert.ok(sparseSupporterPending.options.some(option=>option.kind === 'secules'), 'sparse Supporter reaction should include Mr. Secules');
assert.ok(sparseSupporterPending.options.some(option=>option.kind === 'havano'), 'sparse Supporter reaction should include Havano without affectedOwners');

const dylanFirstSetBase = baseState();
const postModernistDylan = card('10', 0, 'dylan-first-set-1', 'Coordinator');
postModernistDylan.name = 'Post-Modernist Dylan';
const dylanHavano = card('79', 1, 'havano-dylan-first-set-1', 'Improvisor');
dylanHavano.name = 'Havano Citizen';
dylanFirstSetBase.players[0].hand = [postModernistDylan];
dylanFirstSetBase.players[1].hand = [dylanHavano];
const dylanFirstSetBaseHash = canonicalStateHash(dylanFirstSetBase);
const dylanFirstSetPost = clone(dylanFirstSetBase);
dylanFirstSetPost.players[0].hand = [];
dylanFirstSetPost.board[0][2][0] = postModernistDylan;
const dylanFirstSetPostHash = canonicalStateHash(dylanFirstSetPost);
const dylanFirstSetArmed = reduceServerAction({
  canonicalState:dylanFirstSetBase,
  canonicalHash:dylanFirstSetBaseHash
}, {
  type:'PLACE_CARD',
  payload:{
    playerIndex:0,
    turn:1,
    z:0,
    r:2,
    c:0,
    selectedHand:{iid:postModernistDylan.iid, id:postModernistDylan.id, card:postModernistDylan},
    postState:dylanFirstSetPost,
    stateHash:dylanFirstSetPostHash,
    baseStateHash:dylanFirstSetBaseHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(dylanFirstSetArmed.ok, true, dylanFirstSetArmed.reason);
assert.ok(dylanFirstSetArmed.reactionArmed, 'placing Post-Modernist Dylan must arm Havano from the first-set path');
const dylanPending = dylanFirstSetArmed.canonicalState._serverPendingReaction;
assert.ok(dylanPending, 'Dylan first-set reaction should contain _serverPendingReaction');
assert.strictEqual(dylanPending.actionType, 'first_set_effect', 'Dylan placement should be classified as first_set_effect');
assert.strictEqual(String(dylanPending.source && dylanPending.source.id), '10', 'Dylan placement source must be read from postState target square');
assert.ok(dylanPending.options.some(option=>option.kind === 'havano'), 'Dylan first-set reaction should include Havano');

const clickCellFirstSetBase = baseState();
const colomboThug = card('53', 0, 'colombo-first-set-1', 'Supporter');
colomboThug.name = 'Colombo Thug';
const clickCellHavano = card('79', 1, 'havano-click-cell-first-set-1', 'Improvisor');
clickCellHavano.name = 'Havano Citizen';
clickCellFirstSetBase.players[0].hand = [colomboThug];
clickCellFirstSetBase.players[1].hand = [clickCellHavano];
const clickCellFirstSetBaseHash = canonicalStateHash(clickCellFirstSetBase);
const clickCellFirstSetPost = clone(clickCellFirstSetBase);
clickCellFirstSetPost.players[0].hand = [];
clickCellFirstSetPost.board[1][2][1] = colomboThug;
const clickCellFirstSetPostHash = canonicalStateHash(clickCellFirstSetPost);
const clickCellFirstSetArmed = reduceServerAction({
  canonicalState:clickCellFirstSetBase,
  canonicalHash:clickCellFirstSetBaseHash
}, {
  type:'CLICK_CELL',
  payload:{
    playerIndex:0,
    turn:1,
    placing:true,
    z:1,
    r:2,
    c:1,
    selectedHand:{iid:colomboThug.iid, id:colomboThug.id, card:colomboThug},
    postState:clickCellFirstSetPost,
    stateHash:clickCellFirstSetPostHash,
    baseStateHash:clickCellFirstSetBaseHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(clickCellFirstSetArmed.ok, true, clickCellFirstSetArmed.reason);
assert.ok(clickCellFirstSetArmed.reactionArmed, 'placement-shaped CLICK_CELL must arm Havano for first-set continuous/passive sources');
const clickCellPending = clickCellFirstSetArmed.canonicalState._serverPendingReaction;
assert.ok(clickCellPending, 'CLICK_CELL first-set reaction should contain _serverPendingReaction');
assert.strictEqual(clickCellPending.actionType, 'first_set_effect', 'placement-shaped CLICK_CELL should be classified as first_set_effect');
assert.strictEqual(String(clickCellPending.source && clickCellPending.source.id), '53', 'CLICK_CELL placement source must be read from postState target square');
assert.ok(clickCellPending.options.some(option=>option.kind === 'havano'), 'CLICK_CELL first-set reaction should include Havano');

const clickCellHavanoIndex = clickCellPending.options.findIndex(option=>option.kind === 'havano');
const clickCellHavanoOption = clickCellPending.options[clickCellHavanoIndex];
const clickCellHavanoTarget = clickCellHavanoOption.deploymentOptions[0];
const clickCellHavanoNegated = reduceServerAction({
  canonicalState:clickCellFirstSetArmed.canonicalState,
  canonicalHash:clickCellFirstSetArmed.canonicalHash
}, {
  type:'REACTION_CHOICE',
  payload:{
    playerIndex:1,
    promptId:clickCellPending.promptId,
    choice:'negate',
    optionIndex:clickCellHavanoIndex,
    deployment:clickCellHavanoTarget,
    baseStateHash:clickCellFirstSetArmed.canonicalHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(clickCellHavanoNegated.ok, true, clickCellHavanoNegated.reason);
assert.strictEqual(clickCellHavanoNegated.canonicalState._serverPendingReaction, null, 'first-set Havano negate should clear the pending reaction');
assert.strictEqual(clickCellHavanoNegated.canonicalState.board[1][2][1].id, '53', 'first-set negate should keep the source card on board');
assert.strictEqual(clickCellHavanoNegated.canonicalState.board[1][2][1]._effectNegatedByReaction, true, 'first-set Havano negate should mark source negated');
assert.strictEqual(clickCellHavanoNegated.canonicalState.board[1][2][1]._reactionSuppressed, true, 'first-set Havano negate should suppress the source');
assert.strictEqual(clickCellHavanoNegated.canonicalState.board[clickCellHavanoTarget.z][clickCellHavanoTarget.r][clickCellHavanoTarget.c].id, '79', 'first-set Havano negate should deploy Havano');
assert.strictEqual(clickCellHavanoNegated.canonicalState.players[1].hand.length, 0, 'first-set Havano negate should remove Havano from hand');

const clickCellAllowed = reduceServerAction({
  canonicalState:clickCellFirstSetArmed.canonicalState,
  canonicalHash:clickCellFirstSetArmed.canonicalHash
}, {
  type:'REACTION_CHOICE',
  payload:{
    playerIndex:1,
    promptId:clickCellPending.promptId,
    choice:'decline',
    baseStateHash:clickCellFirstSetArmed.canonicalHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(clickCellAllowed.ok, true, clickCellAllowed.reason);
assert.strictEqual(clickCellAllowed.canonicalState._serverPendingReaction, null, 'first-set allow should clear the pending reaction');
assert.strictEqual(clickCellAllowed.canonicalState.board[1][2][1].id, '53', 'first-set allow should keep the placed source card');
assert.strictEqual(clickCellAllowed.canonicalState.board[1][2][1]._effectNegatedByReaction, undefined, 'first-set allow should not mark source negated');
assert.strictEqual(clickCellAllowed.canonicalState.players[1].hand.length, 1, 'first-set allow should not deploy Havano');

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
assert.strictEqual(negated.canonicalState.board[0][2][0]._effectNegatedByReaction, true, 'Lydia should mark the source as negated');
assert.strictEqual(negated.canonicalState.board[0][2][0]._lydiaSuppressed, true, 'Lydia should suppress the source effect');
assert.strictEqual(negated.canonicalState.board[0][2][0]._pendingWhenSetEffect, undefined, 'Lydia-negated source should not keep a pending when-set activation');
assert.strictEqual(negated.canonicalState.board[0][2][0]._pendingWhenSetActivationInFlight, undefined, 'Lydia-negated source should not keep a pending activation lock');
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

const havanoIndex = sparseSupporterPending.options.findIndex(option=>option.kind === 'havano');
const havanoOption = sparseSupporterPending.options[havanoIndex];
const havanoNegated = reduceServerAction({
  canonicalState:sparseSupporterArmed.canonicalState,
  canonicalHash:sparseSupporterArmed.canonicalHash
}, {
  type:'REACTION_CHOICE',
  payload:{
    playerIndex:1,
    promptId:sparseSupporterPending.promptId,
    choice:'negate',
    optionIndex:havanoIndex,
    deployment:havanoOption.deploymentOptions[0],
    baseStateHash:sparseSupporterArmed.canonicalHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(havanoNegated.ok, true, havanoNegated.reason);
assert.strictEqual(havanoNegated.canonicalState.players[1].hand.length, 0, 'Havano should leave hand');
const deployed = havanoOption.deploymentOptions[0];
assert.strictEqual(havanoNegated.canonicalState.board[deployed.z][deployed.r][deployed.c].id, '79', 'Havano should deploy to chosen square');
assert.strictEqual(havanoNegated.canonicalState.board[0][2][0].effectUsedInitial, true, 'Havano-negated source should still be spent');
assert.strictEqual(havanoNegated.canonicalState.board[0][2][0]._effectNegatedByReaction, true, 'Havano should mark the source as negated');
assert.strictEqual(havanoNegated.canonicalState.board[0][2][0]._reactionSuppressed, true, 'Havano should suppress the source effect');
assert.strictEqual(havanoNegated.canonicalState.board[0][2][0]._pendingWhenSetEffect, undefined, 'Havano-negated source should not keep a pending when-set activation');
assert.strictEqual(havanoNegated.canonicalState.board[0][2][0]._pendingWhenSetActivationInFlight, undefined, 'Havano-negated source should not keep a pending activation lock');
assert.strictEqual(havanoNegated.canonicalState.board[0][2][0].whenSetActivated, true, 'Havano-negated Supporter source should have its when-set button spent');

const seculesIndex = pending.options.findIndex(option=>option.kind === 'secules');
const seculesNegated = reduceServerAction({
  canonicalState:armed.canonicalState,
  canonicalHash:armed.canonicalHash
}, {
  type:'REACTION_CHOICE',
  payload:{
    playerIndex:1,
    promptId:pending.promptId,
    choice:'negate',
    optionIndex:seculesIndex,
    baseStateHash:armed.canonicalHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(seculesNegated.ok, true, seculesNegated.reason);
assert.strictEqual(seculesNegated.canonicalState.board[0][2][0].currentFate, 1, 'Mr. Secules negation should not apply resolved postState mutation');
assert.strictEqual(seculesNegated.canonicalState.board[0][2][0]._effectNegatedByReaction, true, 'Mr. Secules should mark the source as negated');
assert.strictEqual(seculesNegated.canonicalState.board[0][2][0]._reactionSuppressed, true, 'Mr. Secules should suppress the source effect');
assert.strictEqual(seculesNegated.canonicalState.board[0][2][0]._pendingWhenSetEffect, undefined, 'Mr. Secules-negated source should not keep a pending when-set activation');
assert.strictEqual(seculesNegated.canonicalState.board[0][2][0]._pendingWhenSetActivationInFlight, undefined, 'Mr. Secules-negated source should not keep a pending activation lock');
assert.strictEqual(seculesNegated.canonicalState.board[1][0][1].usesLeft, 0, 'Mr. Secules should spend its use');
assert.strictEqual(seculesNegated.canonicalState.board[1][0][1]._seculesUsed, true, 'Mr. Secules should be marked used');

console.log('fate-client-resolved-action-result smoke passed');
