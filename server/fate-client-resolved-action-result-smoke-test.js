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
assert.strictEqual(armed.reactionArmed, undefined, 'BOARD_ACTION must never reopen an Improvisor reaction after first-set adjudication');
assert.strictEqual(armed.canonicalState._serverPendingReaction, undefined, 'activation-time actions must not create stale Improvisor prompts');
assert.strictEqual(armed.canonicalState.board[0][2][0].currentFate, 99, 'activation-time actions should apply their client-resolved result immediately');

const duplicateEffectResolved = clone(resolvedEffect);
duplicateEffectResolved.board[0][2][0].currentFate = 123;
const duplicateEffect = reduceServerAction({
  canonicalState:resolvedEffect,
  canonicalHash:resolvedHash
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
    postState:duplicateEffectResolved,
    stateHash:canonicalStateHash(duplicateEffectResolved),
    baseStateHash:resolvedHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(duplicateEffect.ok, false, 'already-spent board effects must not be accepted a second time');
assert.match(duplicateEffect.reason, /already activated/);

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
assert.strictEqual(sparseSupporterArmed.reactionArmed, undefined, 'activatePendingWhenSetEffect must not reopen the first-set Improvisor path');
assert.strictEqual(sparseSupporterArmed.canonicalState._serverPendingReaction, undefined, 'Supporter activate buttons must not create a second Improvisor prompt');
assert.strictEqual(sparseSupporterArmed.canonicalState.board[0][2][0].effectUsedInitial, true, 'allowed Supporter effects should proceed normally after first-set adjudication');

const ordinaryPlacementBase = baseState();
const ordinaryKazumi = card('27', 0, 'ordinary-kazumi-1', 'Initiator');
ordinaryKazumi.name = 'Kazumi';
ordinaryPlacementBase.players[0].hand = [ordinaryKazumi];
ordinaryPlacementBase.players[1].hand = [];
const ordinaryPlacementBaseHash = canonicalStateHash(ordinaryPlacementBase);
const ordinaryPlacementPost = clone(ordinaryPlacementBase);
ordinaryPlacementPost.players[0].hand = [];
ordinaryPlacementPost.board[0][2][0] = ordinaryKazumi;
const ordinaryPlacementPostHash = canonicalStateHash(ordinaryPlacementPost);
const ordinaryPlacementAccepted = reduceServerAction({
  canonicalState:ordinaryPlacementBase,
  canonicalHash:ordinaryPlacementBaseHash
}, {
  type:'ACTION_RESULT',
  payload:{
    actionKind:'PLACE_CARD',
    playerIndex:0,
    turn:1,
    z:0,
    r:2,
    c:0,
    selectedHand:{iid:ordinaryKazumi.iid, id:ordinaryKazumi.id, card:ordinaryKazumi},
    postState:ordinaryPlacementPost,
    stateHash:ordinaryPlacementPostHash,
    baseStateHash:ordinaryPlacementBaseHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(ordinaryPlacementAccepted.ok, true, ordinaryPlacementAccepted.reason);
assert.strictEqual(ordinaryPlacementAccepted.reactionArmed, undefined, 'ordinary placement must not enter the Improvisor path');
assert.deepStrictEqual(ordinaryPlacementAccepted.canonicalState, ordinaryPlacementPost, 'ordinary placement state must remain untouched');

const seculesPlacementBase = baseState();
const seculesKazumi = card('27', 0, 'secules-kazumi-1', 'Initiator');
seculesKazumi.name = 'Kazumi';
const placementSecules = card('67', 1, 'secules-placement-1', 'Improvisor');
placementSecules.name = 'Mr. Secules';
seculesPlacementBase.players[0].hand = [seculesKazumi];
seculesPlacementBase.players[1].hand = [];
seculesPlacementBase.board[1][0][0] = placementSecules;
const seculesPlacementBaseHash = canonicalStateHash(seculesPlacementBase);
const seculesPlacementPost = clone(seculesPlacementBase);
seculesPlacementPost.players[0].hand = [];
seculesPlacementPost.board[0][2][0] = seculesKazumi;
const seculesPlacementPostHash = canonicalStateHash(seculesPlacementPost);
const seculesPlacementArmed = reduceServerAction({
  canonicalState:seculesPlacementBase,
  canonicalHash:seculesPlacementBaseHash
}, {
  type:'ACTION_RESULT',
  payload:{
    actionKind:'PLACE_CARD',
    playerIndex:0,
    turn:1,
    z:0,
    r:2,
    c:0,
    selectedHand:{iid:seculesKazumi.iid, id:seculesKazumi.id, card:seculesKazumi},
    postState:seculesPlacementPost,
    stateHash:seculesPlacementPostHash,
    baseStateHash:seculesPlacementBaseHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(seculesPlacementArmed.ok, true, seculesPlacementArmed.reason);
assert.ok(seculesPlacementArmed.reactionArmed, 'placing an Initiator such as Kazumi must arm Secules before its automatic effect');
assert.strictEqual(seculesPlacementArmed.canonicalState.board[0][2][0].iid, seculesKazumi.iid, 'placement reaction must keep the newly set card on board');
assert.ok(seculesPlacementArmed.canonicalState._serverPendingReaction.options.some(option=>option.kind === 'secules'), 'Kazumi placement reaction must include Secules');

const passiveSupporterBase = clone(seculesPlacementBase);
const passiveSupporter = card('53', 0, 'passive-supporter-1', 'Supporter');
passiveSupporter.name = 'Colombo Thug';
passiveSupporterBase.players[0].hand = [passiveSupporter];
const passiveSupporterBaseHash = canonicalStateHash(passiveSupporterBase);
const passiveSupporterPost = clone(passiveSupporterBase);
passiveSupporterPost.players[0].hand = [];
passiveSupporterPost.board[0][2][0] = passiveSupporter;
const passiveSupporterAccepted = reduceServerAction({canonicalState:passiveSupporterBase, canonicalHash:passiveSupporterBaseHash}, {
  type:'ACTION_RESULT',
  payload:{
    actionKind:'PLACE_CARD',
    playerIndex:0,
    turn:1,
    z:0,
    r:2,
    c:0,
    selectedHand:{iid:passiveSupporter.iid, id:passiveSupporter.id, card:passiveSupporter},
    postState:passiveSupporterPost,
    stateHash:canonicalStateHash(passiveSupporterPost),
    baseStateHash:passiveSupporterBaseHash
  }
}, {mode:'client-resolved', requireBaseHash:true});
assert.strictEqual(passiveSupporterAccepted.ok, true, passiveSupporterAccepted.reason);
assert.strictEqual(passiveSupporterAccepted.reactionArmed, undefined, 'Secules must not react to a Supporter without a when-set effect');

const immunePlacementBase = baseState();
const alpineInfantry = card('76', 0, 'immune-placement-1', 'Supporter');
alpineInfantry.name = 'ALPINE Infantry';
const immuneLydia = card('56', 1, 'immune-lydia-1', 'Improvisor');
immuneLydia.usesLeft = 3;
immunePlacementBase.players[0].hand = [alpineInfantry];
immunePlacementBase.players[1].hand = [card('79', 1, 'immune-havano-1', 'Improvisor')];
immunePlacementBase.board[1][0][0] = immuneLydia;
const immunePlacementBaseHash = canonicalStateHash(immunePlacementBase);
const immunePlacementPost = clone(immunePlacementBase);
immunePlacementPost.players[0].hand = [];
immunePlacementPost.board[0][2][0] = alpineInfantry;
const immunePlacementAccepted = reduceServerAction({canonicalState:immunePlacementBase, canonicalHash:immunePlacementBaseHash}, {
  type:'ACTION_RESULT',
  payload:{
    actionKind:'PLACE_CARD',
    playerIndex:0,
    turn:1,
    z:0,
    r:2,
    c:0,
    selectedHand:{iid:alpineInfantry.iid, id:alpineInfantry.id, card:alpineInfantry},
    postState:immunePlacementPost,
    stateHash:canonicalStateHash(immunePlacementPost),
    baseStateHash:immunePlacementBaseHash
  }
}, {mode:'client-resolved', requireBaseHash:true});
assert.strictEqual(immunePlacementAccepted.ok, true, immunePlacementAccepted.reason);
assert.strictEqual(immunePlacementAccepted.reactionArmed, undefined, 'effect-immune placements must bypass every Improvisor');

const dylanFirstSetBase = baseState();
const postModernistDylan = card('10', 0, 'dylan-first-set-1', 'Coordinator');
postModernistDylan.name = 'Post-Modernist Dylan';
const dylanHavano = card('79', 1, 'havano-dylan-first-set-1', 'Improvisor');
dylanHavano.name = 'Havano Citizen';
const dylanTribute = card('90', 0, 'dylan-tribute-1', 'Supporter');
dylanTribute.name = 'Dylan Consolidation Tribute';
dylanFirstSetBase.players[0].hand = [postModernistDylan];
dylanFirstSetBase.players[1].hand = [dylanHavano];
dylanFirstSetBase.board[0][2][0] = dylanTribute;
const dylanFirstSetBaseHash = canonicalStateHash(dylanFirstSetBase);
const dylanFirstSetPost = clone(dylanFirstSetBase);
dylanFirstSetPost.players[0].hand = [];
dylanFirstSetPost.players[0].discard = [dylanTribute];
dylanFirstSetPost.board[0][2][0] = postModernistDylan;
const dylanFirstSetPostHash = canonicalStateHash(dylanFirstSetPost);
const dylanFirstSetArmed = reduceServerAction({
  canonicalState:dylanFirstSetBase,
  canonicalHash:dylanFirstSetBaseHash
}, {
  type:'ACTION_RESULT',
  payload:{
    actionKind:'SELECT_CONSOLIDATION_TRIBUTE',
    playerIndex:0,
    turn:1,
    z:0,
    r:2,
    c:0,
    selectedHand:{iid:postModernistDylan.iid, id:postModernistDylan.id, card:postModernistDylan},
    chosenTributes:[{iid:dylanTribute.iid, id:dylanTribute.id, z:0, r:2, c:0, card:dylanTribute}],
    consolidationPresentation:{
      target:{z:0, r:2, c:0},
      resultCard:{iid:postModernistDylan.iid, id:postModernistDylan.id, card:postModernistDylan},
      tributes:[{iid:dylanTribute.iid, id:dylanTribute.id, z:0, r:2, c:0, card:dylanTribute}]
    },
    postState:dylanFirstSetPost,
    stateHash:dylanFirstSetPostHash,
    baseStateHash:dylanFirstSetBaseHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(dylanFirstSetArmed.ok, true, dylanFirstSetArmed.reason);
assert.ok(dylanFirstSetArmed.reactionArmed, 'consolidating Post-Modernist Dylan must arm Havano from the first-set path');
const dylanPending = dylanFirstSetArmed.canonicalState._serverPendingReaction;
assert.ok(dylanPending, 'Dylan first-set reaction should contain _serverPendingReaction');
assert.strictEqual(dylanPending.actionType, 'first_set_effect', 'Dylan consolidation should be classified as first_set_effect');
assert.strictEqual(String(dylanPending.source && dylanPending.source.id), '10', 'Dylan consolidation source must come from the declared result target, never the final tribute click');
assert.strictEqual(dylanPending.sourceName, 'Post-Modernist Dylan', 'Dylan consolidation prompt must never name the consumed tribute');
assert.ok(dylanPending.options.some(option=>option.kind === 'havano'), 'Dylan first-set reaction should include Havano');

const carolynFirstSetBase = baseState();
const carolyn = card('17', 0, 'carolyn-first-set-1', 'Initiator');
carolyn.name = 'Carolyn';
const carolynHavano = card('79', 1, 'havano-carolyn-first-set-1', 'Improvisor');
carolynHavano.name = 'Havano Citizen';
const unFifthTribute = card('09', 0, 'un-fifth-carolyn-tribute-1', 'Supporter');
unFifthTribute.name = 'UN 5th Army';
carolynFirstSetBase.players[0].hand = [carolyn];
carolynFirstSetBase.players[1].hand = [carolynHavano];
carolynFirstSetBase.board[1][2][1] = unFifthTribute;
const carolynFirstSetBaseHash = canonicalStateHash(carolynFirstSetBase);
const carolynFirstSetPost = clone(carolynFirstSetBase);
carolynFirstSetPost.players[0].hand = [];
carolynFirstSetPost.players[0].discard = [unFifthTribute];
carolynFirstSetPost.board[1][2][1] = carolyn;
const carolynFirstSetArmed = reduceServerAction({
  canonicalState:carolynFirstSetBase,
  canonicalHash:carolynFirstSetBaseHash
}, {
  type:'ACTION_RESULT',
  payload:{
    actionKind:'CLICK_CELL',
    playerIndex:0,
    turn:1,
    z:1,
    r:2,
    c:1,
    selectedHand:{iid:carolyn.iid, id:carolyn.id, card:carolyn},
    chosenTributes:[{iid:unFifthTribute.iid, id:unFifthTribute.id, z:1, r:2, c:1, card:unFifthTribute}],
    consolidationPresentation:{
      target:{z:1, r:2, c:1},
      resultCard:{iid:carolyn.iid, id:carolyn.id, card:carolyn},
      tributes:[{iid:unFifthTribute.iid, id:unFifthTribute.id, z:1, r:2, c:1, card:unFifthTribute}]
    },
    postState:carolynFirstSetPost,
    stateHash:canonicalStateHash(carolynFirstSetPost),
    baseStateHash:carolynFirstSetBaseHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(carolynFirstSetArmed.ok, true, carolynFirstSetArmed.reason);
assert.ok(carolynFirstSetArmed.reactionArmed, 'consolidating Carolyn over UN 5th Army must arm Havano');
const carolynPending = carolynFirstSetArmed.canonicalState._serverPendingReaction;
assert.strictEqual(String(carolynPending.source && carolynPending.source.id), '17', 'Carolyn must be the reaction source instead of UN 5th Army');
assert.strictEqual(carolynPending.sourceName, 'Carolyn', 'Carolyn consolidation prompt must name Carolyn');
assert.ok(carolynPending.options.some(option=>option.kind === 'havano'), 'Carolyn first-set reaction should include Havano');

const clickCellFirstSetBase = baseState();
clickCellFirstSetBase._turnStartedAt = Date.now() - 10000;
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
assert.ok(Number.isFinite(Number(clickCellPending.openedAt)), 'authority reaction must record when the timer pause began');
assert.strictEqual(clickCellFirstSetArmed.canonicalState.board[1][2][1].iid, colomboThug.iid, 'pending first-set reaction must preserve the placed source on board');
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
assert.strictEqual(clickCellHavanoNegated.canonicalState.board[1][2][1]._effectNegatedByReaction, undefined, 'ongoing first-set effects must not use the one-shot negation visual');
assert.strictEqual(clickCellHavanoNegated.canonicalState.board[1][2][1]._effectSuppressedByReaction, true, 'ongoing first-set effects must use the deep-red suppression visual');
assert.strictEqual(clickCellHavanoNegated.canonicalState.board[1][2][1]._reactionSuppressed, true, 'first-set Havano negate should suppress the source');
assert.strictEqual(clickCellHavanoNegated.reactionResolution.mode, 'suppressed', 'ongoing first-set reactions must announce suppression');
assert.strictEqual(clickCellHavanoNegated.canonicalState.board[clickCellHavanoTarget.z][clickCellHavanoTarget.r][clickCellHavanoTarget.c].id, '79', 'first-set Havano negate should deploy Havano');
assert.strictEqual(clickCellHavanoNegated.canonicalState.players[1].hand.length, 0, 'first-set Havano negate should remove Havano from hand');

const henryFirstSetBase = baseState();
const henryDong = card('21', 0, 'henry-first-set-1', 'Dauntless');
henryDong.name = 'Henry Dong';
const henryHavano = card('79', 1, 'havano-henry-first-set-1', 'Improvisor');
henryHavano.name = 'Havano Citizen';
henryFirstSetBase.players[0].hand = [henryDong];
henryFirstSetBase.players[1].hand = [henryHavano];
const henryFirstSetBaseHash = canonicalStateHash(henryFirstSetBase);
const henryFirstSetPost = clone(henryFirstSetBase);
henryFirstSetPost.players[0].hand = [];
henryFirstSetPost.board[1][2][1] = henryDong;
const henryFirstSetPostHash = canonicalStateHash(henryFirstSetPost);
const henryFirstSetArmed = reduceServerAction({
  canonicalState:henryFirstSetBase,
  canonicalHash:henryFirstSetBaseHash
}, {
  type:'CLICK_CELL',
  payload:{
    playerIndex:0,
    turn:1,
    placing:true,
    z:1,
    r:2,
    c:1,
    selectedHand:{iid:henryDong.iid, id:henryDong.id, card:henryDong},
    postState:henryFirstSetPost,
    stateHash:henryFirstSetPostHash,
    baseStateHash:henryFirstSetBaseHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(henryFirstSetArmed.ok, true, henryFirstSetArmed.reason);
assert.ok(henryFirstSetArmed.reactionArmed, 'setting Henry must arm Havano from the first-set path');
const henryPending = henryFirstSetArmed.canonicalState._serverPendingReaction;
assert.ok(henryPending.options.some(option=>option.kind === 'havano'), 'Henry first-set reaction should include Havano');
assert.strictEqual(henryPending.resolutionMode, 'suppressed', 'Henry first-set Havano reaction must suppress instead of one-shot negate');
const henryHavanoIndex = henryPending.options.findIndex(option=>option.kind === 'havano');
const henryHavanoOption = henryPending.options[henryHavanoIndex];
const henryHavanoTarget = henryHavanoOption.deploymentOptions[0];
const henryHavanoSuppressed = reduceServerAction({
  canonicalState:henryFirstSetArmed.canonicalState,
  canonicalHash:henryFirstSetArmed.canonicalHash
}, {
  type:'REACTION_CHOICE',
  payload:{
    playerIndex:1,
    promptId:henryPending.promptId,
    choice:'negate',
    optionIndex:henryHavanoIndex,
    deployment:henryHavanoTarget,
    baseStateHash:henryFirstSetArmed.canonicalHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(henryHavanoSuppressed.ok, true, henryHavanoSuppressed.reason);
assert.strictEqual(henryHavanoSuppressed.canonicalState.board[1][2][1]._effectSuppressedByReaction, true, 'Havano must persistently suppress Henry after first-set reaction');
assert.strictEqual(henryHavanoSuppressed.canonicalState.board[1][2][1]._reactionSuppressed, true, 'Havano suppression must make Henry inert instead of leaving an activation button path');
assert.strictEqual(henryHavanoSuppressed.canonicalState.board[1][2][1]._effectNegatedByReaction, undefined, 'Henry Havano response must not use one-shot negation');

const timedAllowState = clone(clickCellFirstSetArmed.canonicalState);
timedAllowState._serverPendingReaction.openedAt -= 4200;
const timedAllowHash = canonicalStateHash(timedAllowState);
const clickCellAllowed = reduceServerAction({
  canonicalState:timedAllowState,
  canonicalHash:timedAllowHash
}, {
  type:'REACTION_CHOICE',
  payload:{
    playerIndex:1,
    promptId:clickCellPending.promptId,
    choice:'decline',
    baseStateHash:timedAllowHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(clickCellAllowed.ok, true, clickCellAllowed.reason);
assert.strictEqual(clickCellAllowed.canonicalState._serverPendingReaction, null, 'first-set allow should clear the pending reaction');
assert.strictEqual(clickCellAllowed.canonicalState.board[1][2][1].id, '53', 'first-set allow should keep the placed source card');
assert.strictEqual(clickCellAllowed.canonicalState.board[1][2][1]._effectNegatedByReaction, undefined, 'first-set allow should not mark source negated');
assert.strictEqual(clickCellAllowed.canonicalState.board[1][2][1]._onlinePlacementReactionAllowPromptId, clickCellPending.promptId, 'first-set allow should mark exactly one placement-effect resume');
assert.strictEqual(clickCellAllowed.canonicalState.players[1].hand.length, 1, 'first-set allow should not deploy Havano');
assert.ok(
  clickCellAllowed.canonicalState._turnStartedAt >= clickCellFirstSetPost._turnStartedAt + 4000,
  'authority must move the turn start forward by the time spent in the Improvisor prompt'
);

const placementPending = seculesPlacementArmed.canonicalState._serverPendingReaction;
const placementSeculesIndex = placementPending.options.findIndex(option=>option.kind === 'secules');
const seculesNegated = reduceServerAction({
  canonicalState:seculesPlacementArmed.canonicalState,
  canonicalHash:seculesPlacementArmed.canonicalHash
}, {
  type:'REACTION_CHOICE',
  payload:{
    playerIndex:1,
    promptId:placementPending.promptId,
    choice:'negate',
    optionIndex:placementSeculesIndex,
    baseStateHash:seculesPlacementArmed.canonicalHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(seculesNegated.ok, true, seculesNegated.reason);
assert.strictEqual(seculesNegated.canonicalState.board[0][2][0]._effectNegatedByReaction, true, 'one-shot first-set effects must use the negated state');
assert.strictEqual(seculesNegated.canonicalState.board[0][2][0]._effectSuppressedByReaction, undefined, 'one-shot first-set effects must not use the ongoing suppression state');
assert.strictEqual(seculesNegated.canonicalState.board[0][2][0]._reactionSuppressed, undefined, 'one-shot negation must not leak into the suppression visual predicate');
assert.strictEqual(seculesNegated.canonicalState.board[1][0][0].usesLeft, 0, 'Mr. Secules should spend its use');
assert.strictEqual(seculesNegated.canonicalState.board[1][0][0]._seculesUsed, true, 'Mr. Secules should be marked used');
assert.strictEqual(seculesNegated.reactionResolution.mode, 'negated', 'one-shot first-set reactions must announce negation');

const deckSetBase = baseState();
const polishArmy = card('28', 0, 'polish-deck-set-1', 'Supporter');
polishArmy.name = '2nd Polish-Lithuanian Army';
const deckSetLydia = card('56', 1, 'lydia-deck-set-1', 'Improvisor');
deckSetLydia.name = 'Lydia';
deckSetLydia.usesLeft = 3;
deckSetBase.players[0].hand = [];
deckSetBase.players[0].deck = [polishArmy];
deckSetBase.players[1].hand = [];
deckSetBase.board[1][0][0] = deckSetLydia;
deckSetBase.polishArmyUses = [0, 0];
deckSetBase._polishUsedThisTurn = false;
const deckSetBaseHash = canonicalStateHash(deckSetBase);
const deckSetPost = clone(deckSetBase);
deckSetPost.players[0].deck = [];
deckSetPost.players[0].hand = [polishArmy];
deckSetPost.selectedHandCard = 0;
deckSetPost.placing = true;
deckSetPost.polishArmyUses = [1, 0];
deckSetPost._polishUsedThisTurn = true;
const deckSetPostHash = canonicalStateHash(deckSetPost);
const deckSetArmed = reduceServerAction({
  canonicalState:deckSetBase,
  canonicalHash:deckSetBaseHash
}, {
  type:'ACTION_RESULT',
  payload:{
    actionKind:'HAND_ACTION',
    playerIndex:0,
    turn:1,
    fn:'setPolishFromDeck',
    deckSetAction:true,
    sourceName:polishArmy.name,
    source:{card:polishArmy},
    postState:deckSetPost,
    stateHash:deckSetPostHash,
    baseStateHash:deckSetBaseHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(deckSetArmed.ok, true, deckSetArmed.reason);
assert.ok(deckSetArmed.reactionArmed, 'direct Set from Deck must let Lydia react before placement');
const deckSetPending = deckSetArmed.canonicalState._serverPendingReaction;
assert.ok(deckSetPending, 'direct deck set must create one pending Lydia prompt');
assert.strictEqual(deckSetPending.actionType, 'set_from_deck_effect');
assert.deepStrictEqual(deckSetPending.options.map(option=>option.kind), ['lydia'], 'deck-set interception is Lydia-only');
assert.strictEqual(deckSetArmed.canonicalState.players[0].deck[0].iid, polishArmy.iid, 'card must remain in its deck while Lydia decides');

const rogueDeckCommit = clone(deckSetPost);
rogueDeckCommit.currentPlayer = 1;
const blockedRogueCommit = reduceServerAction({
  canonicalState:deckSetArmed.canonicalState,
  canonicalHash:deckSetArmed.canonicalHash
}, {
  type:'ACTION_RESULT',
  payload:{
    playerIndex:0,
    turn:1,
    actionKind:'AUTO_CLIENT_STATE_COMMIT',
    postState:rogueDeckCommit,
    stateHash:canonicalStateHash(rogueDeckCommit),
    baseStateHash:deckSetArmed.canonicalHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(blockedRogueCommit.ok, false, 'generic state commits must not overwrite a pending Improvisor reaction');
assert.match(blockedRogueCommit.reason, /pending reaction must resolve first/);

const deckSetLydiaIndex = deckSetPending.options.findIndex(option=>option.kind === 'lydia');
const deckSetNegated = reduceServerAction({
  canonicalState:deckSetArmed.canonicalState,
  canonicalHash:deckSetArmed.canonicalHash
}, {
  type:'REACTION_CHOICE',
  payload:{
    playerIndex:1,
    promptId:deckSetPending.promptId,
    choice:'negate',
    optionIndex:deckSetLydiaIndex,
    baseStateHash:deckSetArmed.canonicalHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(deckSetNegated.ok, true, deckSetNegated.reason);
assert.strictEqual(deckSetNegated.canonicalState.players[0].hand.length, 0, 'negated direct-set card must not remain ready to place');
assert.strictEqual(deckSetNegated.canonicalState.players[0].deck[0].iid, polishArmy.iid, 'negated direct-set card must return to its original deck');
assert.strictEqual(deckSetNegated.canonicalState.players[0].deck[0]._deckSetNegatedByReaction, true, 'returned card instance must be permanently spent for its direct-set button');
assert.deepStrictEqual(deckSetNegated.canonicalState.polishArmyUses, [1, 0], 'a negated Polish deck-set attempt must still spend its game use');
assert.strictEqual(deckSetNegated.canonicalState._polishUsedThisTurn, true, 'a negated Polish deck-set attempt must still spend its turn use');
assert.strictEqual(deckSetNegated.canonicalState.board[1][0][0].usesLeft, 2, 'Lydia must spend one use when returning the card');
assert.strictEqual(deckSetNegated.reactionResolution.mode, 'negated');

const deckSetAllowed = reduceServerAction({
  canonicalState:deckSetArmed.canonicalState,
  canonicalHash:deckSetArmed.canonicalHash
}, {
  type:'REACTION_CHOICE',
  payload:{
    playerIndex:1,
    promptId:deckSetPending.promptId,
    choice:'allow',
    baseStateHash:deckSetArmed.canonicalHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(deckSetAllowed.ok, true, deckSetAllowed.reason);
assert.strictEqual(deckSetAllowed.canonicalState.players[0].deck.length, 0, 'allowed direct-set card must leave the deck');
assert.strictEqual(deckSetAllowed.canonicalState.players[0].hand[0].iid, polishArmy.iid, 'allowed direct-set card must remain ready for placement');
assert.strictEqual(deckSetAllowed.canonicalState.players[0].hand[0]._skipOnlinePlacementImprovisorReactionPromptId, deckSetPending.promptId, 'allowed direct-set card must carry a one-placement adjudication token');

const deckSetPlaced = clone(deckSetAllowed.canonicalState);
deckSetPlaced.players[0].hand = [];
deckSetPlaced.selectedHandCard = null;
deckSetPlaced.placing = false;
deckSetPlaced.board[0][2][0] = deckSetAllowed.canonicalState.players[0].hand[0];
const deckSetPlacedResult = reduceServerAction({
  canonicalState:deckSetAllowed.canonicalState,
  canonicalHash:deckSetAllowed.canonicalHash
}, {
  type:'ACTION_RESULT',
  payload:{
    actionKind:'PLACE_CARD',
    playerIndex:0,
    turn:1,
    z:0,
    r:2,
    c:0,
    skipImprovisorReaction:true,
    selectedHand:{
      iid:polishArmy.iid,
      id:polishArmy.id,
      skipImprovisorReaction:true,
      skipImprovisorReactionPromptId:deckSetPending.promptId,
      card:deckSetAllowed.canonicalState.players[0].hand[0]
    },
    postState:deckSetPlaced,
    stateHash:canonicalStateHash(deckSetPlaced),
    baseStateHash:deckSetAllowed.canonicalHash
  }
}, {
  mode:'client-resolved',
  requireBaseHash:true
});
assert.strictEqual(deckSetPlacedResult.ok, true, deckSetPlacedResult.reason);
assert.strictEqual(deckSetPlacedResult.reactionArmed, undefined, 'placing an already allowed direct-set card must not ask Lydia a second time');
assert.strictEqual(deckSetPlacedResult.canonicalState.board[0][2][0].iid, polishArmy.iid);

console.log('fate-client-resolved-action-result smoke passed');
