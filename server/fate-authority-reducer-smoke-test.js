#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  canonicalStateHash,
  reduceServerAction,
  validateProposedTransition
} = require('./fate-authority-reducer');

function state(overrides){
  return Object.assign({
    v:2,
    players:[
      {name:'Host', color:'', deck:[], hand:[], discard:[]},
      {name:'Guest', color:'', deck:[], hand:[], discard:[]}
    ],
    board:[],
    currentPlayer:0,
    turn:1,
    selectedHandCard:null,
    selectedBoardCard:null,
    placing:false,
    blockingCell:false,
    pendingEffect:null
  }, overrides || {});
}

function pendingPromptIdForTest(type, state){
  const t = String(type || '');
  if(t === 'REACTION_CHOICE') return state?._serverPendingReaction?.promptId || '';
  if(t === 'MODAL_ACTION' || t === 'RESOLVE_MODAL' || t === 'PICK_AFFILIATION' || t === 'RESOLVE_AFFILIATION_PICK') return state?._serverPendingModalAction?.promptId || '';
  if(t === 'PICK_CARDS_VISUAL' || t === 'RESOLVE_CARD_PICK') return state?._serverPendingCardPick?.promptId || '';
  if(t === 'PICK_ZONE' || t === 'RESOLVE_ZONE_PICK') return state?._serverPendingZonePick?.promptId || '';
  if(t === 'CLICK_CELL' || t === 'SELECT_PENDING_MOVE_CELL' || t === 'SELECT_CONSOLIDATION_TRIBUTE' || t === 'SELECT_BOARD_TARGET') return state?._serverPendingMove?.promptId || state?._consolidating?.promptId || '';
  return '';
}

function msg(type, payload){
  const nextPayload = Object.assign({}, payload || {});
  const omitPromptIdForTest = nextPayload.omitPromptIdForTest === true;
  delete nextPayload.omitPromptIdForTest;
  if(!omitPromptIdForTest && nextPayload.promptId === undefined){
    const promptId = pendingPromptIdForTest(type, nextPayload.postState);
    if(promptId) nextPayload.promptId = promptId;
  }
  return {type, payload:nextPayload};
}

function strictEndTurnStep(resultOrState, playerIndex){
  const canonicalState = resultOrState && resultOrState.canonicalState ? resultOrState.canonicalState : resultOrState;
  const canonicalHash = resultOrState && resultOrState.canonicalHash ? resultOrState.canonicalHash : canonicalStateHash(canonicalState);
  return reduceServerAction({canonicalState, canonicalHash}, msg('END_TURN', {
    playerIndex,
    turn:canonicalState.turn,
    baseStateHash:canonicalHash,
    postState:canonicalState,
    stateHash:canonicalHash
  }), {mode:'strict', requireBaseHash:true});
}

const initial = state();
const initialHash = canonicalStateHash(initial);
const room = {canonicalState:initial, canonicalHash:initialHash};

const ended = state({currentPlayer:1, turn:2});
const endedHash = canonicalStateHash(ended);
const legalEnd = validateProposedTransition(room, msg('END_TURN', {
  playerIndex:0,
  turn:1,
  baseStateHash:initialHash,
  postState:ended,
  stateHash:endedHash
}));
assert.strictEqual(legalEnd.ok, true, legalEnd.reason);

const stale = validateProposedTransition(room, msg('END_TURN', {
  playerIndex:0,
  turn:1,
  baseStateHash:'wrong-base',
  postState:ended,
  stateHash:endedHash
}));
assert.strictEqual(stale.ok, false);
assert.match(stale.reason, /stale baseStateHash/);

const tampered = validateProposedTransition(room, msg('END_TURN', {
  playerIndex:0,
  turn:1,
  baseStateHash:initialHash,
  postState:ended,
  stateHash:'wrong-post'
}));
assert.strictEqual(tampered.ok, false);
assert.match(tampered.reason, /stateHash/);

const badEndTurn = validateProposedTransition(room, msg('END_TURN', {
  playerIndex:0,
  turn:1,
  baseStateHash:initialHash,
  postState:state({currentPlayer:0, turn:1}),
  stateHash:canonicalStateHash(state({currentPlayer:0, turn:1}))
}));
assert.strictEqual(badEndTurn.ok, false);
assert.match(badEndTurn.reason, /END_TURN/);

const noPriorHash = validateProposedTransition({canonicalState:null, canonicalHash:''}, msg('STATE_SYNC', {
  currentPlayer:0,
  postState:initial,
  stateHash:initialHash
}));
assert.strictEqual(noPriorHash.ok, true, noPriorHash.reason);

const reducedEnd = reduceServerAction(room, msg('END_TURN', {
  playerIndex:0,
  turn:1,
  baseStateHash:initialHash,
  postState:state({currentPlayer:0, turn:1}),
  stateHash:canonicalStateHash(state({currentPlayer:0, turn:1}))
}), {mode:'turns', requireBaseHash:true});
assert.strictEqual(reducedEnd.ok, true, reducedEnd.reason);
assert.strictEqual(reducedEnd.serverReduced, true);
assert.strictEqual(reducedEnd.canonicalState.currentPlayer, 1);
assert.strictEqual(reducedEnd.canonicalState.turn, 2);

const chooseBase = state({phase:'draw', currentPlayer:0, turn:1});
const chooseHash = canonicalStateHash(chooseBase);
const reducedChoose = reduceServerAction({canonicalState:chooseBase, canonicalHash:chooseHash}, msg('CHOOSE_TURN', {
  playerIndex:1,
  goFirst:false,
  turn:1,
  baseStateHash:chooseHash
}), {mode:'turns', requireBaseHash:true});
assert.strictEqual(reducedChoose.ok, true, reducedChoose.reason);
assert.strictEqual(reducedChoose.canonicalState.currentPlayer, 0);
assert.strictEqual(reducedChoose.canonicalState.phase, 'main');

const selvaChooseBase = state({
  phase:'draw',
  currentPlayer:0,
  turn:1,
  extraSupportsThisTurn:0,
  _pendingSelvaSupportBoost:[1, 0],
  _selvaSupportBoosts:[null, null]
});
const selvaChooseHash = canonicalStateHash(selvaChooseBase);
const selvaChoose = reduceServerAction({canonicalState:selvaChooseBase, canonicalHash:selvaChooseHash}, msg('CHOOSE_TURN', {
  playerIndex:0,
  goFirst:true,
  turn:1,
  baseStateHash:selvaChooseHash
}), {mode:'turns', requireBaseHash:true});
assert.strictEqual(selvaChoose.ok, true, selvaChoose.reason);
assert.strictEqual(selvaChoose.canonicalState.currentPlayer, 0);
assert.strictEqual(selvaChoose.canonicalState.phase, 'main');
assert.strictEqual(selvaChoose.canonicalState.extraSupportsThisTurn, 1);
assert.deepStrictEqual(selvaChoose.canonicalState._pendingSelvaSupportBoost, [0, 0]);
assert.strictEqual(selvaChoose.canonicalState._selvaSupportBoosts[0].extraSupports, 1);

const forfeitBase = state({
  currentPlayer:1,
  _serverPendingModalAction:{kind:'christopherErbsDrawChoice', playerIndex:1},
  _serverPendingZonePick:{kind:'makennaImmune', playerIndex:1},
  placing:true,
  selectedHandCard:0
});
const forfeitHash = canonicalStateHash(forfeitBase);
const forfeitReduced = reduceServerAction({canonicalState:forfeitBase, canonicalHash:forfeitHash}, msg('FORFEIT', {
  playerIndex:1
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(forfeitReduced.ok, true, forfeitReduced.reason);
assert.strictEqual(forfeitReduced.serverReduced, true);
assert.strictEqual(forfeitReduced.canonicalState.status, 'ended');
assert.strictEqual(forfeitReduced.canonicalState.phase, 'ended');
assert.strictEqual(forfeitReduced.canonicalState.winnerIndex, 0);
assert.strictEqual(forfeitReduced.canonicalState.loserIndex, 1);
assert.strictEqual(forfeitReduced.canonicalState.matchResult.serverFinalized, true);
assert.strictEqual(forfeitReduced.canonicalState._serverPendingModalAction, null);
assert.strictEqual(forfeitReduced.canonicalState._serverPendingZonePick, null);
assert.strictEqual(forfeitReduced.canonicalState.placing, false);

const disconnectBase = state({
  currentPlayer:0,
  _serverPendingMove:{kind:'wolfCreekMove', playerIndex:0},
  selectedBoardCard:{z:0, r:2, c:0}
});
const disconnectHash = canonicalStateHash(disconnectBase);
const disconnectReduced = reduceServerAction({canonicalState:disconnectBase, canonicalHash:disconnectHash}, msg('DISCONNECT_TIMEOUT', {
  playerIndex:0
}), {mode:'strict', requireBaseHash:false});
assert.strictEqual(disconnectReduced.ok, true, disconnectReduced.reason);
assert.strictEqual(disconnectReduced.serverReduced, true);
assert.strictEqual(disconnectReduced.canonicalState.status, 'ended');
assert.strictEqual(disconnectReduced.canonicalState.endReason, 'disconnect');
assert.strictEqual(disconnectReduced.canonicalState.winnerIndex, 1);
assert.strictEqual(disconnectReduced.canonicalState.loserIndex, 0);
assert.strictEqual(disconnectReduced.canonicalState.matchResult.type, 'disconnect');
assert.strictEqual(disconnectReduced.canonicalState.matchResult.serverFinalized, true);
assert.strictEqual(disconnectReduced.canonicalState._serverPendingMove, null);

function scoreBoard(zoneSpecs){
  return zoneSpecs.map(spec => [
    [{id:'901', iid:`z${spec.z}-p1`, owner:1, type:'Character', currentFate:spec.p1}],
    [],
    [{id:'902', iid:`z${spec.z}-p0`, owner:0, type:'Character', currentFate:spec.p0}]
  ]);
}

const prematureResultBase = state({
  turn:19,
  maxTurns:20,
  board:scoreBoard([{z:0, p0:5, p1:1}, {z:1, p0:5, p1:1}, {z:2, p0:1, p1:9}])
});
const prematureResultHash = canonicalStateHash(prematureResultBase);
const prematureResult = reduceServerAction({canonicalState:prematureResultBase, canonicalHash:prematureResultHash}, msg('MATCH_RESULT', {
  playerIndex:0,
  baseStateHash:prematureResultHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(prematureResult.ok, false);
assert.match(prematureResult.reason, /before maxTurns/);

const zoneWinBase = state({
  turn:20,
  maxTurns:20,
  board:scoreBoard([{z:0, p0:5, p1:1}, {z:1, p0:2, p1:1}, {z:2, p0:1, p1:9}])
});
const zoneWinHash = canonicalStateHash(zoneWinBase);
const zoneWin = reduceServerAction({canonicalState:zoneWinBase, canonicalHash:zoneWinHash}, msg('MATCH_RESULT', {
  playerIndex:0,
  baseStateHash:zoneWinHash,
  winnerIndex:0
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(zoneWin.ok, true, zoneWin.reason);
assert.strictEqual(zoneWin.canonicalState.status, 'ended');
assert.strictEqual(zoneWin.canonicalState.matchResult.type, 'score');
assert.strictEqual(zoneWin.canonicalState.matchResult.winnerIndex, 0);
assert.strictEqual(zoneWin.canonicalState.matchResult.p0wins, 2);
assert.strictEqual(zoneWin.canonicalState.matchResult.p1wins, 1);

const mismatchedWinner = reduceServerAction({canonicalState:zoneWinBase, canonicalHash:zoneWinHash}, msg('MATCH_RESULT', {
  playerIndex:0,
  baseStateHash:zoneWinHash,
  winnerIndex:1
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(mismatchedWinner.ok, false);
assert.match(mismatchedWinner.reason, /winner does not match/);

const fateTiebreakBase = state({
  turn:20,
  maxTurns:20,
  board:scoreBoard([{z:0, p0:10, p1:1}, {z:1, p0:1, p1:6}, {z:2, p0:2, p1:2}])
});
const fateTiebreakHash = canonicalStateHash(fateTiebreakBase);
const fateTiebreak = reduceServerAction({canonicalState:fateTiebreakBase, canonicalHash:fateTiebreakHash}, msg('MATCH_RESULT', {
  playerIndex:0,
  baseStateHash:fateTiebreakHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(fateTiebreak.ok, true, fateTiebreak.reason);
assert.strictEqual(fateTiebreak.canonicalState.matchResult.winnerIndex, 0);
assert.strictEqual(fateTiebreak.canonicalState.matchResult.drawByFate, true);
assert.strictEqual(fateTiebreak.canonicalState.matchResult.p0TotalFate, 13);
assert.strictEqual(fateTiebreak.canonicalState.matchResult.p1TotalFate, 9);

const drawResultBase = state({
  turn:20,
  maxTurns:20,
  board:scoreBoard([{z:0, p0:5, p1:1}, {z:1, p0:1, p1:5}, {z:2, p0:3, p1:3}])
});
const drawResultHash = canonicalStateHash(drawResultBase);
const drawResult = reduceServerAction({canonicalState:drawResultBase, canonicalHash:drawResultHash}, msg('MATCH_RESULT', {
  playerIndex:0,
  baseStateHash:drawResultHash,
  isDraw:true
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(drawResult.ok, true, drawResult.reason);
assert.strictEqual(drawResult.canonicalState.matchResult.isDraw, true);
assert.strictEqual(drawResult.canonicalState.matchResult.winnerIndex, -1);
assert.strictEqual(drawResult.canonicalState.winnerIndex, -1);

const frontierLandscapeBase = state({
  turn:14,
  currentPlayer:0,
  landscapeId:'igb2',
  _landscapeState:{
    id:'igb2',
    consolidations:[1, 3],
    zoneFateBonuses:[[0, 0, 0], [0, 0, 0]],
    resolvedTurns:{}
  }
});
const frontierLandscapeHash = canonicalStateHash(frontierLandscapeBase);
const frontierLandscapePicked = reduceServerAction({canonicalState:frontierLandscapeBase, canonicalHash:frontierLandscapeHash}, msg('PICK_LANDSCAPE_ZONE', {
  playerIndex:1,
  chooserIndex:1,
  zone:2,
  baseStateHash:frontierLandscapeHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(frontierLandscapePicked.ok, true, frontierLandscapePicked.reason);
assert.strictEqual(frontierLandscapePicked.canonicalState._landscapeState.resolvedTurns.igb2, true);
assert.strictEqual(frontierLandscapePicked.canonicalState._landscapeState.zoneFateBonuses[1][2], 10);
const landscapeBonusScoreBase = state({
  turn:20,
  maxTurns:20,
  currentPlayer:1,
  board:scoreBoard([{z:0, p0:5, p1:1}, {z:1, p0:1, p1:5}, {z:2, p0:5, p1:0}]),
  _landscapeState:{
    id:'igb2',
    consolidations:[1, 3],
    zoneFateBonuses:[[0, 0, 0], [0, 0, 10]],
    resolvedTurns:{igb2:true}
  }
});
const landscapeBonusScoreHash = canonicalStateHash(landscapeBonusScoreBase);
const landscapeBonusScore = reduceServerAction({canonicalState:landscapeBonusScoreBase, canonicalHash:landscapeBonusScoreHash}, msg('MATCH_RESULT', {
  playerIndex:1,
  baseStateHash:landscapeBonusScoreHash,
  winnerIndex:1
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(landscapeBonusScore.ok, true, landscapeBonusScore.reason);
assert.strictEqual(landscapeBonusScore.canonicalState.matchResult.winnerIndex, 1);
assert.strictEqual(landscapeBonusScore.canonicalState.matchResult.zones[2].s1, 10);
const frontierWrongChooser = reduceServerAction({canonicalState:frontierLandscapeBase, canonicalHash:frontierLandscapeHash}, msg('PICK_LANDSCAPE_ZONE', {
  playerIndex:0,
  chooserIndex:0,
  zone:2,
  baseStateHash:frontierLandscapeHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(frontierWrongChooser.ok, false);
assert.match(frontierWrongChooser.reason, /Frontier winner/);
const frontierRepeat = reduceServerAction({canonicalState:frontierLandscapePicked.canonicalState, canonicalHash:frontierLandscapePicked.canonicalHash}, msg('PICK_LANDSCAPE_ZONE', {
  playerIndex:1,
  chooserIndex:1,
  zone:0,
  baseStateHash:frontierLandscapePicked.canonicalHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(frontierRepeat.ok, false);
assert.match(frontierRepeat.reason, /already resolved/);

const qingdaoLandscapeBase = state({
  turn:10,
  currentPlayer:1,
  landscapeId:'igb8',
  board:scoreBoard([{z:0, p0:2, p1:9}, {z:1, p0:1, p1:1}, {z:2, p0:1, p1:1}]),
  extraRows:[0, 0, 0],
  extraRowOwners:[[], [], []],
  extraRowFullOwners:[null, null, null],
  _landscapeState:{
    id:'igb8',
    targetZone:0,
    consolidations:[0, 0],
    zoneFateBonuses:[[0, 0, 0], [0, 0, 0]],
    resolvedTurns:{}
  }
});
const qingdaoLandscapeHash = canonicalStateHash(qingdaoLandscapeBase);
const qingdaoLandscapePicked = reduceServerAction({canonicalState:qingdaoLandscapeBase, canonicalHash:qingdaoLandscapeHash}, msg('PICK_LANDSCAPE_ZONE', {
  playerIndex:1,
  chooserIndex:1,
  zone:1,
  baseStateHash:qingdaoLandscapeHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(qingdaoLandscapePicked.ok, true, qingdaoLandscapePicked.reason);
assert.strictEqual(qingdaoLandscapePicked.canonicalState._landscapeState.resolvedTurns.igb8, true);
assert.strictEqual(qingdaoLandscapePicked.canonicalState.extraRows[1], 1);
assert.strictEqual(qingdaoLandscapePicked.canonicalState.extraRowOwners[1][0], 1);
assert.strictEqual(qingdaoLandscapePicked.canonicalState.extraRowFullOwners[1], 1);
assert.strictEqual(Array.isArray(qingdaoLandscapePicked.canonicalState.board[1][3]), true);
const qingdaoWrongChooser = reduceServerAction({canonicalState:qingdaoLandscapeBase, canonicalHash:qingdaoLandscapeHash}, msg('PICK_LANDSCAPE_ZONE', {
  playerIndex:0,
  chooserIndex:0,
  zone:1,
  baseStateHash:qingdaoLandscapeHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(qingdaoWrongChooser.ok, false);
assert.match(qingdaoWrongChooser.reason, /Qingdao winner/);

function scoreResultForBoard(board){
  return scoreResultForState(state({turn:20, maxTurns:20, currentPlayer:0, board}));
}

function scoreResultForState(base){
  const hash = canonicalStateHash(base);
  const result = reduceServerAction({canonicalState:base, canonicalHash:hash}, msg('MATCH_RESULT', {
    playerIndex:0,
    baseStateHash:hash
  }), {mode:'strict', requireBaseHash:true});
  assert.strictEqual(result.ok, true, result.reason);
  return result.canonicalState.matchResult;
}

const hopliteScore = scoreResultForBoard([
  [
    [{id:'903', iid:'hoplite-opp', owner:1, type:'Dauntless', currentFate:6}],
    [],
    [
      {id:'63', iid:'hoplite-a', owner:0, type:'Dauntless', currentFate:1},
      {id:'63', iid:'hoplite-b', owner:0, type:'Dauntless', currentFate:1}
    ]
  ],
  [[{id:'904', iid:'z1-p1', owner:1, type:'Character', currentFate:1}], [], [{id:'905', iid:'z1-p0', owner:0, type:'Character', currentFate:2}]],
  [[{id:'906', iid:'z2-p1', owner:1, type:'Character', currentFate:1}], [], [{id:'907', iid:'z2-p0', owner:0, type:'Character', currentFate:2}]]
]);
assert.strictEqual(hopliteScore.zones[0].s0, 10);
assert.strictEqual(hopliteScore.zones[0].s1, 6);

const coordinatorAuraScore = scoreResultForBoard([
  [
    [{id:'908', iid:'coord-opp', owner:1, type:'Dauntless', currentFate:1}],
    [],
    [
      {id:'57', iid:'jeremiah', owner:0, type:'Coordinator', currentFate:1},
      {id:'11', iid:'anne', owner:0, type:'Coordinator', currentFate:1},
      {id:'910', iid:'buffed-supporter', owner:0, type:'Supporter', currentFate:1}
    ]
  ],
  [[{id:'911', iid:'coord-z1-p1', owner:1, type:'Character', currentFate:1}], [], [{id:'912', iid:'coord-z1-p0', owner:0, type:'Character', currentFate:2}]],
  [[{id:'913', iid:'coord-z2-p1', owner:1, type:'Character', currentFate:1}], [], [{id:'914', iid:'coord-z2-p0', owner:0, type:'Character', currentFate:2}]]
]);
assert.strictEqual(coordinatorAuraScore.zones[0].s0, 7);

const seculesSuppressionScore = scoreResultForBoard([
  [
    [],
    [null, {id:'67', iid:'secules-suppressor', owner:1, type:'Improvisor', currentFate:4}, null],
    [
      {id:'15', iid:'zsofia-near-secules', owner:0, type:'Coordinator', currentFate:1},
      {id:'11', iid:'anne-suppressed-by-secules', owner:0, type:'Coordinator', currentFate:1},
      {id:'910b', iid:'secules-buffed-supporter', owner:0, type:'Supporter', currentFate:1}
    ]
  ],
  [[{id:'911b', iid:'secules-z1-p1', owner:1, type:'Character', currentFate:1}], [], [{id:'912b', iid:'secules-z1-p0', owner:0, type:'Character', currentFate:2}]],
  [[{id:'913b', iid:'secules-z2-p1', owner:1, type:'Character', currentFate:1}], [], [{id:'914b', iid:'secules-z2-p0', owner:0, type:'Character', currentFate:2}]]
]);
assert.strictEqual(seculesSuppressionScore.zones[0].s0, 6);

const dylanPenaltyScore = scoreResultForBoard([
  [
    [{id:'10', iid:'postmodern-dylan', owner:1, type:'Coordinator', currentFate:1}],
    [],
    [{id:'915', iid:'dylan-target', owner:0, type:'Dauntless', currentFate:3}]
  ],
  [[{id:'916', iid:'dylan-z1-p1', owner:1, type:'Character', currentFate:1}], [], [{id:'917', iid:'dylan-z1-p0', owner:0, type:'Character', currentFate:2}]],
  [[{id:'918', iid:'dylan-z2-p1', owner:1, type:'Character', currentFate:1}], [], [{id:'919', iid:'dylan-z2-p0', owner:0, type:'Character', currentFate:2}]]
]);
assert.strictEqual(dylanPenaltyScore.zones[0].s0, 1);
assert.strictEqual(dylanPenaltyScore.zones[0].s1, 1);

const bobbyJonesScore = scoreResultForBoard([
  [
    [{id:'920', iid:'bobby-opp', owner:1, type:'Dauntless', currentFate:1}],
    [],
    [
      {id:'55', iid:'bobby', owner:0, type:'Dauntless', currentFate:1, aff:'reality'},
      {id:'921', iid:'bobby-a', owner:0, type:'Supporter', currentFate:1, aff:'reality'},
      {id:'922', iid:'bobby-b', owner:0, type:'Coordinator', currentFate:1, aff:'reality'},
      {id:'923', iid:'bobby-c', owner:0, type:'Dauntless', currentFate:1, aff:'reality'}
    ]
  ],
  [[{id:'924', iid:'bobby-z1-p1', owner:1, type:'Character', currentFate:1}], [], [{id:'925', iid:'bobby-z1-p0', owner:0, type:'Character', currentFate:2}]],
  [[{id:'926', iid:'bobby-z2-p1', owner:1, type:'Character', currentFate:1}], [], [{id:'927', iid:'bobby-z2-p0', owner:0, type:'Character', currentFate:2}]]
]);
assert.strictEqual(bobbyJonesScore.zones[0].s0, 9);

const faceDownNoBonusScore = scoreResultForBoard([
  [
    [{id:'928', iid:'face-opp', owner:1, type:'Dauntless', currentFate:1}],
    [],
    [
      {id:'929', iid:'hidden-score', owner:0, type:'Dauntless', currentFate:20, faceDown:true},
      {id:'76', iid:'alpine-score', owner:0, type:'Dauntless', currentFate:4, noBonus:true},
      {id:'11', iid:'anne-no-bonus', owner:0, type:'Coordinator', currentFate:1}
    ]
  ],
  [[{id:'930', iid:'face-z1-p1', owner:1, type:'Character', currentFate:1}], [], [{id:'931', iid:'face-z1-p0', owner:0, type:'Character', currentFate:2}]],
  [[{id:'932', iid:'face-z2-p1', owner:1, type:'Character', currentFate:1}], [], [{id:'933', iid:'face-z2-p0', owner:0, type:'Character', currentFate:2}]]
]);
assert.strictEqual(faceDownNoBonusScore.zones[0].s0, 5);

const cookScore = scoreResultForBoard([
  [
    [],
    [
      {id:'64', iid:'cook-islands', owner:0, type:'Supporter', currentFate:1},
      {id:'934', iid:'cook-opp', owner:1, type:'Dauntless', currentFate:5}
    ],
    []
  ],
  [[{id:'935', iid:'cook-z1-p1', owner:1, type:'Character', currentFate:1}], [], [{id:'936', iid:'cook-z1-p0', owner:0, type:'Character', currentFate:2}]],
  [[{id:'937', iid:'cook-z2-p1', owner:1, type:'Character', currentFate:1}], [], [{id:'938', iid:'cook-z2-p0', owner:0, type:'Character', currentFate:2}]]
]);
assert.strictEqual(cookScore.zones[0].s0, 4);
assert.strictEqual(cookScore.zones[0].s1, 2);

const cookStoredTarget = scoreResultForState(state({
  turn:20,
  maxTurns:20,
  currentPlayer:0,
  board:[
    [
      [],
      [
        {id:'939', iid:'cook-left-target', owner:1, type:'Dauntless', currentFate:5},
        {id:'64', iid:'cook-stored', owner:0, type:'Supporter', currentFate:1, _cookIslandsDuelistTargetIid:'cook-left-target'},
        {id:'940', iid:'cook-right-target', owner:1, type:'Dauntless', currentFate:5}
      ],
      []
    ],
    [[{id:'941', iid:'cook-store-z1-p1', owner:1, type:'Character', currentFate:1}], [], [{id:'942', iid:'cook-store-z1-p0', owner:0, type:'Character', currentFate:2}]],
    [[{id:'943', iid:'cook-store-z2-p1', owner:1, type:'Character', currentFate:1}], [], [{id:'944', iid:'cook-store-z2-p0', owner:0, type:'Character', currentFate:2}]]
  ]
}));
assert.strictEqual(cookStoredTarget.zones[0].s0, 4);
assert.strictEqual(cookStoredTarget.zones[0].s1, 7);

const cookJimmyScore = scoreResultForState(state({
  turn:20,
  maxTurns:20,
  currentPlayer:0,
  damageDoneP:[2, 0],
  board:[
    [
      [],
      [
        {id:'41', iid:'jimmy-cook-score', owner:0, type:'Dauntless', currentFate:0},
        {id:'64', iid:'cook-jimmy-source', owner:0, type:'Supporter', currentFate:1},
        {id:'945', iid:'cook-jimmy-target', owner:1, type:'Dauntless', currentFate:5}
      ],
      []
    ],
    [[{id:'946', iid:'cook-jimmy-z1-p1', owner:1, type:'Character', currentFate:1}], [], [{id:'947', iid:'cook-jimmy-z1-p0', owner:0, type:'Character', currentFate:2}]],
    [[{id:'948', iid:'cook-jimmy-z2-p1', owner:1, type:'Character', currentFate:1}], [], [{id:'949', iid:'cook-jimmy-z2-p0', owner:0, type:'Character', currentFate:2}]]
  ]
}));
assert.strictEqual(cookJimmyScore.zones[0].s0, 10);
assert.strictEqual(cookJimmyScore.zones[0].s1, 2);

const strictUnsupported = reduceServerAction(room, msg('CLICK_CELL', {
  playerIndex:0,
  baseStateHash:initialHash,
  z:0,
  r:0,
  c:0,
  placing:false,
  postState:initial,
  stateHash:initialHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(strictUnsupported.ok, false);
assert.match(strictUnsupported.reason, /not implemented/);

const boardFallbackBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[{id:'999', iid:'unsupported-effect-source', name:'Unsupported Effect', owner:0, type:'Character', currentFate:2},null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main'
});
const boardFallbackHash = canonicalStateHash(boardFallbackBase);
const boardFallbackRejected = reduceServerAction({canonicalState:boardFallbackBase, canonicalHash:boardFallbackHash}, msg('BOARD_ACTION', {
  fn:'triggerCharacterEffect',
  playerIndex:0,
  turn:1,
  z:0,
  r:0,
  c:0,
  cardIid:'unsupported-effect-source',
  cardId:'999',
  baseStateHash:boardFallbackHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(boardFallbackRejected.ok, false);
assert.match(boardFallbackRejected.reason, /not implemented/);
const boardFallbackPost = state(JSON.parse(JSON.stringify(boardFallbackBase)));
boardFallbackPost.board[0][0][0].effectUsedInitial = true;
boardFallbackPost.selectedBoardCard = null;
const boardFallbackPostHash = canonicalStateHash(boardFallbackPost);
const boardFallbackAccepted = reduceServerAction({canonicalState:boardFallbackBase, canonicalHash:boardFallbackHash}, msg('BOARD_ACTION', {
  fn:'triggerCharacterEffect',
  playerIndex:0,
  turn:1,
  z:0,
  r:0,
  c:0,
  cardIid:'unsupported-effect-source',
  cardId:'999',
  baseStateHash:boardFallbackHash,
  postState:boardFallbackPost,
  stateHash:boardFallbackPostHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(boardFallbackAccepted.ok, false);
assert.match(boardFallbackAccepted.reason, /not implemented/);

const placementBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'101', iid:'h-101', name:'Plain Character', type:'Character', fate:3, cost:0}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0
});
const placementHash = canonicalStateHash(placementBase);
const characterArmed = reduceServerAction({canonicalState:Object.assign({}, placementBase, {placing:false}), canonicalHash:canonicalStateHash(Object.assign({}, placementBase, {placing:false}))}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'h-101', id:'101'},
  baseStateHash:canonicalStateHash(Object.assign({}, placementBase, {placing:false})),
  postState:Object.assign({}, placementBase, {placing:false}),
  stateHash:canonicalStateHash(Object.assign({}, placementBase, {placing:false}))
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([['101', {id:'101', type:'Character', cost:0, effect:'', aff:''}]])}});
assert.strictEqual(characterArmed.ok, true, characterArmed.reason);
assert.strictEqual(characterArmed.serverReduced, true);
assert.strictEqual(characterArmed.canonicalState.placing, true);
assert.strictEqual(characterArmed.canonicalState.selectedHandCard, 0);
assert.strictEqual(characterArmed.canonicalState.pendingInteraction, null);
const placement = reduceServerAction({canonicalState:placementBase, canonicalHash:placementHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'h-101', id:'101'},
  baseStateHash:placementHash,
  postState:placementBase,
  stateHash:placementHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([['101', {id:'101', type:'Character', effect:'', aff:''}]])}});
assert.strictEqual(placement.ok, true, placement.reason);
assert.strictEqual(placement.serverReduced, true);
assert.strictEqual(placement.canonicalState.players[0].hand.length, 0);
assert.strictEqual(placement.canonicalState.board[0][2][0].iid, 'h-101');
assert.strictEqual(placement.canonicalState.board[0][2][0].owner, 0);
const directPlacementBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'101', iid:'h-direct-101', name:'Plain Character', type:'Character', fate:3, cost:0}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:false,
  selectedHandCard:null
});
const directPlacementHash = canonicalStateHash(directPlacementBase);
const directPlacement = reduceServerAction({canonicalState:directPlacementBase, canonicalHash:directPlacementHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:true,
  selectedHand:{index:0, iid:'h-direct-101', id:'101'},
  baseStateHash:directPlacementHash,
  postState:directPlacementBase,
  stateHash:directPlacementHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([['101', {id:'101', type:'Character', cost:0, effect:'', aff:''}]])}});
assert.strictEqual(directPlacement.ok, true, directPlacement.reason);
assert.strictEqual(directPlacement.serverReduced, true);
assert.strictEqual(directPlacement.canonicalState.players[0].hand.length, 0);
assert.strictEqual(directPlacement.canonicalState.board[0][2][1].iid, 'h-direct-101');
assert.strictEqual(directPlacement.canonicalState.placing, false);
assert.strictEqual(directPlacement.canonicalState.selectedHandCard, null);
assert.strictEqual(directPlacement.canonicalState.pendingInteraction, null);
const canonicalPlacementBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'101', iid:'h-place-101', name:'Plain Character', type:'Character', fate:3, cost:0}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:false,
  selectedHandCard:null
});
const canonicalPlacementHash = canonicalStateHash(canonicalPlacementBase);
const canonicalPlacement = reduceServerAction({canonicalState:canonicalPlacementBase, canonicalHash:canonicalPlacementHash}, msg('PLACE_CARD', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'h-place-101', id:'101'},
  baseStateHash:canonicalPlacementHash,
  postState:canonicalPlacementBase,
  stateHash:canonicalPlacementHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([['101', {id:'101', type:'Character', cost:0, effect:'', aff:''}]])}});
assert.strictEqual(canonicalPlacement.ok, true, canonicalPlacement.reason);
assert.strictEqual(canonicalPlacement.serverReduced, true);
assert.strictEqual(canonicalPlacement.canonicalState.players[0].hand.length, 0);
assert.strictEqual(canonicalPlacement.canonicalState.board[0][2][2].iid, 'h-place-101');
assert.strictEqual(canonicalPlacement.canonicalState.pendingInteraction, null);
const stalePlacementPostState = JSON.parse(JSON.stringify(canonicalPlacementBase));
const stalePlacedCard = stalePlacementPostState.players[0].hand.splice(0, 1)[0];
stalePlacedCard.owner = 0;
stalePlacedCard.currentFate = 3;
stalePlacementPostState.board[0][2][2] = stalePlacedCard;
stalePlacementPostState.placing = false;
stalePlacementPostState.selectedHandCard = null;
const stalePlacementPostHash = canonicalStateHash(stalePlacementPostState);
const stalePlacementRecovered = reduceServerAction({canonicalState:canonicalPlacementBase, canonicalHash:canonicalPlacementHash}, msg('ACTION_RESULT', {
  actionKind:'CLICK_CELL',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'h-place-101', id:'101'},
  baseStateHash:'stale-before-placement',
  postState:stalePlacementPostState,
  stateHash:stalePlacementPostHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([['101', {id:'101', type:'Character', cost:0, effect:'', aff:''}]])}});
assert.strictEqual(stalePlacementRecovered.ok, true, stalePlacementRecovered.reason);
assert.strictEqual(stalePlacementRecovered.placementRecovered, 'replayed');
assert.strictEqual(stalePlacementRecovered.canonicalState.players[0].hand.length, 0);
assert.strictEqual(stalePlacementRecovered.canonicalState.board[0][2][2].iid, 'h-place-101');
const mismatchedIidPlacementBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'101', iid:'server-iid-101', name:'Plain Character', type:'Character', fate:3, cost:0}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:false,
  selectedHandCard:null
});
const mismatchedIidPlacementHash = canonicalStateHash(mismatchedIidPlacementBase);
const mismatchedIidPlacement = reduceServerAction({canonicalState:mismatchedIidPlacementBase, canonicalHash:mismatchedIidPlacementHash}, msg('PLACE_CARD', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'browser-stale-iid-101', id:'101'},
  baseStateHash:mismatchedIidPlacementHash,
  postState:mismatchedIidPlacementBase,
  stateHash:mismatchedIidPlacementHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([['101', {id:'101', type:'Character', cost:0, effect:'', aff:''}]])}});
assert.strictEqual(mismatchedIidPlacement.ok, true, mismatchedIidPlacement.reason);
assert.strictEqual(mismatchedIidPlacement.serverReduced, true);
assert.strictEqual(mismatchedIidPlacement.canonicalState.players[0].hand.length, 0);
assert.strictEqual(mismatchedIidPlacement.canonicalState.board[0][2][0].iid, 'server-iid-101');
const canonicalSupporterBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'201', iid:'h-supporter-201', name:'Plain Supporter', type:'Supporter', fate:1, cost:0}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:false,
  selectedHandCard:null,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const canonicalSupporterHash = canonicalStateHash(canonicalSupporterBase);
const canonicalSupporterPlacement = reduceServerAction({canonicalState:canonicalSupporterBase, canonicalHash:canonicalSupporterHash}, msg('PLACE_CARD', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:true,
  selectedHand:{index:0, iid:'h-supporter-201', id:'201'},
  baseStateHash:canonicalSupporterHash,
  postState:canonicalSupporterBase,
  stateHash:canonicalSupporterHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([['201', {id:'201', type:'Supporter', cost:0, effect:'', aff:''}]])}});
assert.strictEqual(canonicalSupporterPlacement.ok, true, canonicalSupporterPlacement.reason);
assert.strictEqual(canonicalSupporterPlacement.serverReduced, true);
assert.strictEqual(canonicalSupporterPlacement.canonicalState.players[0].hand.length, 0);
assert.strictEqual(canonicalSupporterPlacement.canonicalState.board[0][2][1].iid, 'h-supporter-201');
assert.strictEqual(canonicalSupporterPlacement.canonicalState.supportsPlacedThisTurn, 1);
assert.strictEqual(canonicalSupporterPlacement.canonicalState.supportersSetP[0], 1);
const secondSupporterBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'201', iid:'h-supporter-202', name:'Second Plain Supporter', type:'Supporter', fate:1, cost:0}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'201', iid:'board-supporter-201', name:'First Plain Supporter', type:'Supporter', fate:1, currentFate:1, owner:0},null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:false,
  selectedHandCard:null,
  supportsPlacedThisTurn:1,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[1,0]
});
const secondSupporterHash = canonicalStateHash(secondSupporterBase);
const secondSupporterPlacement = reduceServerAction({canonicalState:secondSupporterBase, canonicalHash:secondSupporterHash}, msg('PLACE_CARD', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:true,
  selectedHand:{index:0, iid:'h-supporter-202', id:'201'},
  baseStateHash:secondSupporterHash,
  postState:secondSupporterBase,
  stateHash:secondSupporterHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([['201', {id:'201', type:'Supporter', cost:0, effect:'', aff:''}]])}});
assert.strictEqual(secondSupporterPlacement.ok, true, secondSupporterPlacement.reason);
assert.strictEqual(secondSupporterPlacement.serverReduced, true);
assert.strictEqual(secondSupporterPlacement.canonicalState.supportsPlacedThisTurn, 2);
assert.strictEqual(secondSupporterPlacement.canonicalState.board[0][2][1].iid, 'h-supporter-202');
const occupiedPlacementBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'101', iid:'h-occupied-101', name:'Plain Character', type:'Character', fate:3, cost:0}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,{id:'999', iid:'occupied-cell', owner:0, type:'Character', currentFate:1}]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:false,
  selectedHandCard:null
});
const occupiedPlacementHash = canonicalStateHash(occupiedPlacementBase);
const occupiedPlacementRejected = reduceServerAction({canonicalState:occupiedPlacementBase, canonicalHash:occupiedPlacementHash}, msg('PLACE_CARD', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'h-occupied-101', id:'101'},
  baseStateHash:occupiedPlacementHash,
  postState:occupiedPlacementBase,
  stateHash:occupiedPlacementHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([['101', {id:'101', type:'Character', cost:0, effect:'', aff:''}]])}});
assert.strictEqual(occupiedPlacementRejected.ok, false);
assert.match(occupiedPlacementRejected.reason, /target is occupied/);
const wrongTurnPlacementBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'101', iid:'h-wrong-turn-101', name:'Plain Character', type:'Character', fate:3, cost:0}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  currentPlayer:1,
  phase:'main',
  placing:false,
  selectedHandCard:null
});
const wrongTurnPlacementHash = canonicalStateHash(wrongTurnPlacementBase);
const wrongTurnPlacementRejected = reduceServerAction({canonicalState:wrongTurnPlacementBase, canonicalHash:wrongTurnPlacementHash}, msg('PLACE_CARD', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'h-wrong-turn-101', id:'101'},
  baseStateHash:wrongTurnPlacementHash,
  postState:wrongTurnPlacementBase,
  stateHash:wrongTurnPlacementHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([['101', {id:'101', type:'Character', cost:0, effect:'', aff:''}]])}});
assert.strictEqual(wrongTurnPlacementRejected.ok, false);
assert.match(wrongTurnPlacementRejected.reason, /does not have priority/);
const wrongPhasePlacementBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'101', iid:'h-wrong-phase-101', name:'Plain Character', type:'Character', fate:3, cost:0}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'draw',
  placing:false,
  selectedHandCard:null
});
const wrongPhasePlacementHash = canonicalStateHash(wrongPhasePlacementBase);
const wrongPhasePlacementRejected = reduceServerAction({canonicalState:wrongPhasePlacementBase, canonicalHash:wrongPhasePlacementHash}, msg('PLACE_CARD', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'h-wrong-phase-101', id:'101'},
  baseStateHash:wrongPhasePlacementHash,
  postState:wrongPhasePlacementBase,
  stateHash:wrongPhasePlacementHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([['101', {id:'101', type:'Character', cost:0, effect:'', aff:''}]])}});
assert.strictEqual(wrongPhasePlacementRejected.ok, false);
assert.match(wrongPhasePlacementRejected.reason, /requires main phase/);
const characterArmedPlacement = reduceServerAction({canonicalState:characterArmed.canonicalState, canonicalHash:characterArmed.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'h-101', id:'101'},
  baseStateHash:characterArmed.canonicalHash,
  postState:characterArmed.canonicalState,
  stateHash:characterArmed.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([['101', {id:'101', type:'Character', cost:0, effect:'', aff:''}]])}});
assert.strictEqual(characterArmedPlacement.ok, true, characterArmedPlacement.reason);
assert.strictEqual(characterArmedPlacement.canonicalState.players[0].hand.length, 0);
assert.strictEqual(characterArmedPlacement.canonicalState.board[0][2][0].iid, 'h-101');
assert.strictEqual(characterArmedPlacement.canonicalState.pendingInteraction, null);

const paidCharacterBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'102', iid:'h-102', name:'Paid Character', type:'Character', fate:4, cost:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:false,
  selectedHandCard:0
});
const paidCharacterHash = canonicalStateHash(paidCharacterBase);
const paidCharacterRejected = reduceServerAction({canonicalState:paidCharacterBase, canonicalHash:paidCharacterHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'h-102', id:'102'},
  baseStateHash:paidCharacterHash,
  postState:paidCharacterBase,
  stateHash:paidCharacterHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([['102', {id:'102', type:'Character', cost:1, effect:'', aff:''}]])}});
assert.strictEqual(paidCharacterRejected.ok, false);
assert.match(paidCharacterRejected.reason, /Need 1 reinforcement/);

const paidReadyBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'102', iid:'h-102', name:'Paid Character', type:'Character', fate:4, cost:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'201', iid:'s-201', name:'Plain Supporter', type:'Supporter', fate:1, owner:0},null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:false,
  selectedHandCard:0
});
const paidReadyHash = canonicalStateHash(paidReadyBase);
const paidReady = reduceServerAction({canonicalState:paidReadyBase, canonicalHash:paidReadyHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'h-102', id:'102'},
  baseStateHash:paidReadyHash,
  postState:paidReadyBase,
  stateHash:paidReadyHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([
  ['102', {id:'102', type:'Character', cost:1, effect:'', aff:''}],
  ['201', {id:'201', type:'Supporter', effect:'', aff:''}]
])}});
assert.strictEqual(paidReady.ok, true, paidReady.reason);
assert.strictEqual(paidReady.canonicalState.placing, false);
assert.strictEqual(paidReady.canonicalState._consolidating.phase, 'select_tributes');
assert.strictEqual(paidReady.canonicalState._consolidating.cost, 1);
assert.strictEqual(paidReady.canonicalState._consolidating.allPossible.length, 1);
assert.strictEqual(paidReady.canonicalState.pendingInteraction.kind, 'consolidation');
assert.strictEqual(paidReady.canonicalState.pendingInteraction.bucket, 'consolidation');
assert.strictEqual(paidReady.canonicalState.pendingInteraction.playerIndex, 0);
assert.match(paidReady.canonicalState.pendingInteraction.promptId, /^consolidate:/);
assert.deepStrictEqual(paidReady.canonicalState.pendingInteraction.legalTargets, [{z:0, r:2, c:0}]);
const paidPendingEndRejected = reduceServerAction({canonicalState:paidReady.canonicalState, canonicalHash:paidReady.canonicalHash}, msg('END_TURN', {
  playerIndex:0,
  turn:1,
  baseStateHash:paidReady.canonicalHash,
  postState:paidReady.canonicalState,
  stateHash:paidReady.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([
  ['102', {id:'102', type:'Character', cost:1, effect:'', aff:''}],
  ['201', {id:'201', type:'Supporter', effect:'', aff:''}]
])}});
assert.strictEqual(paidPendingEndRejected.ok, false);
assert.match(paidPendingEndRejected.reason, /END_TURN blocked by pendingInteraction=consolidation promptId=consolidate:/);
const paidReadySelectHash = paidReady.canonicalHash;
const paidCanonicalTributeSelected = reduceServerAction({canonicalState:paidReady.canonicalState, canonicalHash:paidReadySelectHash}, msg('SELECT_CONSOLIDATION_TRIBUTE', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'h-102', id:'102'},
  baseStateHash:paidReadySelectHash,
  postState:paidReady.canonicalState,
  stateHash:paidReadySelectHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([
  ['102', {id:'102', type:'Character', cost:1, effect:'', aff:''}],
  ['201', {id:'201', type:'Supporter', effect:'', aff:''}]
])}});
assert.strictEqual(paidCanonicalTributeSelected.ok, true, paidCanonicalTributeSelected.reason);
assert.deepStrictEqual(paidCanonicalTributeSelected.canonicalState._consolidating.chosenIdxs, [0]);
assert.strictEqual(paidCanonicalTributeSelected.canonicalState.board[0][2][0].iid, 's-201');
const paidTributeSelected = reduceServerAction({canonicalState:paidReady.canonicalState, canonicalHash:paidReadySelectHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'h-102', id:'102'},
  baseStateHash:paidReadySelectHash,
  postState:paidReady.canonicalState,
  stateHash:paidReadySelectHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([
  ['102', {id:'102', type:'Character', cost:1, effect:'', aff:''}],
  ['201', {id:'201', type:'Supporter', effect:'', aff:''}]
])}});
assert.strictEqual(paidTributeSelected.ok, true, paidTributeSelected.reason);
assert.deepStrictEqual(paidTributeSelected.canonicalState._consolidating.chosenIdxs, [0]);
assert.strictEqual(paidTributeSelected.canonicalState.board[0][2][0].iid, 's-201');
const paidTributeSelectedHash = paidTributeSelected.canonicalHash;
const paidFinalized = reduceServerAction({canonicalState:paidTributeSelected.canonicalState, canonicalHash:paidTributeSelectedHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'h-102', id:'102'},
  baseStateHash:paidTributeSelectedHash,
  postState:paidTributeSelected.canonicalState,
  stateHash:paidTributeSelectedHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([
  ['102', {id:'102', type:'Character', cost:1, effect:'', aff:''}],
  ['201', {id:'201', type:'Supporter', effect:'', aff:''}]
])}});
assert.strictEqual(paidFinalized.ok, true, paidFinalized.reason);
assert.strictEqual(paidFinalized.canonicalState._consolidating, null);
assert.strictEqual(paidFinalized.canonicalState.players[0].hand.length, 0);
assert.strictEqual(paidFinalized.canonicalState.players[0].discard.length, 1);
assert.strictEqual(paidFinalized.canonicalState.players[0].discard[0].iid, 's-201');
assert.strictEqual(paidFinalized.canonicalState.board[0][2][0].iid, 'h-102');
assert.strictEqual(paidFinalized.canonicalState.board[0][2][0].owner, 0);

const un5thBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'103', iid:'h-103', name:'Cost 2 Character', type:'Character', fate:5, cost:2}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'09', iid:'un5-1', name:'United Nations 5th Army', type:'Supporter', fate:1, owner:0, usesLeft:3},null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:false,
  selectedHandCard:0,
  un5thUses:[0,0]
});
const un5thHash = canonicalStateHash(un5thBase);
const un5thReady = reduceServerAction({canonicalState:un5thBase, canonicalHash:un5thHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'h-103', id:'103'},
  baseStateHash:un5thHash,
  postState:un5thBase,
  stateHash:un5thHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([
  ['103', {id:'103', type:'Character', cost:2, effect:'', aff:''}],
  ['09', {id:'09', type:'Supporter', effect:'This card counts as 2 Reinforcement.', aff:'third_great_war'}]
])}});
assert.strictEqual(un5thReady.ok, true, un5thReady.reason);
assert.strictEqual(un5thReady.canonicalState._consolidating.cost, 2);
assert.strictEqual(un5thReady.canonicalState._consolidating.allPossible[0].reinforcement, 2);
const un5thSelected = reduceServerAction({canonicalState:un5thReady.canonicalState, canonicalHash:un5thReady.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'h-103', id:'103'},
  baseStateHash:un5thReady.canonicalHash,
  postState:un5thReady.canonicalState,
  stateHash:un5thReady.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([
  ['103', {id:'103', type:'Character', cost:2, effect:'', aff:''}],
  ['09', {id:'09', type:'Supporter', effect:'This card counts as 2 Reinforcement.', aff:'third_great_war'}]
])}});
assert.strictEqual(un5thSelected.ok, true, un5thSelected.reason);
const un5thFinalized = reduceServerAction({canonicalState:un5thSelected.canonicalState, canonicalHash:un5thSelected.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'h-103', id:'103'},
  baseStateHash:un5thSelected.canonicalHash,
  postState:un5thSelected.canonicalState,
  stateHash:un5thSelected.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([
  ['103', {id:'103', type:'Character', cost:2, effect:'', aff:''}],
  ['09', {id:'09', type:'Supporter', effect:'This card counts as 2 Reinforcement.', aff:'third_great_war'}]
])}});
assert.strictEqual(un5thFinalized.ok, true, un5thFinalized.reason);
assert.strictEqual(un5thFinalized.canonicalState.board[0][2][0].iid, 'h-103');
assert.strictEqual(un5thFinalized.canonicalState.players[0].discard[0].iid, 'un5-1');
assert.strictEqual(un5thFinalized.canonicalState.players[0].discard[0].usesLeft, 2);
assert.strictEqual(un5thFinalized.canonicalState.un5thUses[0], 1);

const greatOakCatalog = {byId:new Map([
  ['104', {id:'104', type:'Character', cost:1, effect:'', aff:''}],
  ['47', {id:'47', type:'Supporter', effect:'When used in Consolidation, that card gains 3 Fate permanently.', aff:'eventide'}]
])};
const greatOakBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'104', iid:'h-104', name:'Great Oak Target', type:'Character', fate:4, cost:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'47', iid:'great-oak-1', name:'Great Oak Infantry', type:'Supporter', fate:1, owner:0},null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:false,
  selectedHandCard:0
});
const greatOakHash = canonicalStateHash(greatOakBase);
const greatOakReady = reduceServerAction({canonicalState:greatOakBase, canonicalHash:greatOakHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'h-104', id:'104'},
  baseStateHash:greatOakHash,
  postState:greatOakBase,
  stateHash:greatOakHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:greatOakCatalog});
assert.strictEqual(greatOakReady.ok, true, greatOakReady.reason);
assert.strictEqual(greatOakReady.canonicalState._consolidating.allPossible[0].reinforcement, 1);
const greatOakSelected = reduceServerAction({canonicalState:greatOakReady.canonicalState, canonicalHash:greatOakReady.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'h-104', id:'104'},
  baseStateHash:greatOakReady.canonicalHash,
  postState:greatOakReady.canonicalState,
  stateHash:greatOakReady.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:greatOakCatalog});
assert.strictEqual(greatOakSelected.ok, true, greatOakSelected.reason);
const greatOakFinalized = reduceServerAction({canonicalState:greatOakSelected.canonicalState, canonicalHash:greatOakSelected.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'h-104', id:'104'},
  baseStateHash:greatOakSelected.canonicalHash,
  postState:greatOakSelected.canonicalState,
  stateHash:greatOakSelected.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:greatOakCatalog});
assert.strictEqual(greatOakFinalized.ok, true, greatOakFinalized.reason);
assert.strictEqual(greatOakFinalized.canonicalState.board[0][2][0].iid, 'h-104');
assert.strictEqual(greatOakFinalized.canonicalState.board[0][2][0].currentFate, 7);
assert.strictEqual(greatOakFinalized.canonicalState.players[0].discard[0].iid, 'great-oak-1');

const boleslawCatalog = {byId:new Map([
  ['105', {id:'105', type:'Character', cost:3, effect:'', aff:''}],
  ['86', {id:'86', type:'Initiator', effect:'Counts as 3 Reinforcement and gives 4 Fate when used in Consolidation.', aff:'eventide'}]
])};
const boleslawBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'105', iid:'h-105', name:'Boleslaw Target', type:'Character', fate:5, cost:3}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'86', iid:'boleslaw-1', name:'Boleslaw Kopewicz', type:'Initiator', fate:1, owner:0},null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:false,
  selectedHandCard:0
});
const boleslawHash = canonicalStateHash(boleslawBase);
const boleslawReady = reduceServerAction({canonicalState:boleslawBase, canonicalHash:boleslawHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'h-105', id:'105'},
  baseStateHash:boleslawHash,
  postState:boleslawBase,
  stateHash:boleslawHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:boleslawCatalog});
assert.strictEqual(boleslawReady.ok, true, boleslawReady.reason);
assert.strictEqual(boleslawReady.canonicalState._consolidating.allPossible[0].reinforcement, 3);
const boleslawSelected = reduceServerAction({canonicalState:boleslawReady.canonicalState, canonicalHash:boleslawReady.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'h-105', id:'105'},
  baseStateHash:boleslawReady.canonicalHash,
  postState:boleslawReady.canonicalState,
  stateHash:boleslawReady.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:boleslawCatalog});
assert.strictEqual(boleslawSelected.ok, true, boleslawSelected.reason);
const boleslawFinalized = reduceServerAction({canonicalState:boleslawSelected.canonicalState, canonicalHash:boleslawSelected.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'h-105', id:'105'},
  baseStateHash:boleslawSelected.canonicalHash,
  postState:boleslawSelected.canonicalState,
  stateHash:boleslawSelected.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:boleslawCatalog});
assert.strictEqual(boleslawFinalized.ok, true, boleslawFinalized.reason);
assert.strictEqual(boleslawFinalized.canonicalState.board[0][2][0].iid, 'h-105');
assert.strictEqual(boleslawFinalized.canonicalState.board[0][2][0].currentFate, 9);
assert.strictEqual(boleslawFinalized.canonicalState.players[0].discard[0].iid, 'boleslaw-1');

const ralphCatalog = {byId:new Map([
  ['106', {id:'106', type:'Character', cost:2, effect:'', aff:''}],
  ['201', {id:'201', type:'Supporter', effect:'', aff:''}],
  ['24', {id:'24', type:'Supporter', effect:'Adjacent consolidation costs 1 less reinforcement.', aff:'reality'}]
])};
const ralphBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'106', iid:'h-106', name:'Ralph Target', type:'Character', fate:6, cost:2}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'201', iid:'plain-near-ralph', name:'Plain Supporter', type:'Supporter', fate:1, owner:0},{id:'24', iid:'ralph-1', name:"Ralph's Courtesy Clerk", type:'Supporter', fate:1, owner:0},null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:false,
  selectedHandCard:0
});
const ralphHash = canonicalStateHash(ralphBase);
const ralphReady = reduceServerAction({canonicalState:ralphBase, canonicalHash:ralphHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'h-106', id:'106'},
  baseStateHash:ralphHash,
  postState:ralphBase,
  stateHash:ralphHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:ralphCatalog});
assert.strictEqual(ralphReady.ok, true, ralphReady.reason);
assert.strictEqual(ralphReady.canonicalState._consolidating.allPossible[0].iid, undefined);
assert.strictEqual(ralphReady.canonicalState._consolidating.allPossible[0].card.iid, 'plain-near-ralph');
assert.strictEqual(ralphReady.canonicalState._consolidating.allPossible[0].reinforcement, 2);
const ralphSelected = reduceServerAction({canonicalState:ralphReady.canonicalState, canonicalHash:ralphReady.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'h-106', id:'106'},
  baseStateHash:ralphReady.canonicalHash,
  postState:ralphReady.canonicalState,
  stateHash:ralphReady.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:ralphCatalog});
assert.strictEqual(ralphSelected.ok, true, ralphSelected.reason);
const ralphFinalized = reduceServerAction({canonicalState:ralphSelected.canonicalState, canonicalHash:ralphSelected.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'h-106', id:'106'},
  baseStateHash:ralphSelected.canonicalHash,
  postState:ralphSelected.canonicalState,
  stateHash:ralphSelected.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:ralphCatalog});
assert.strictEqual(ralphFinalized.ok, true, ralphFinalized.reason);
assert.strictEqual(ralphFinalized.canonicalState.board[0][2][0].iid, 'h-106');
assert.strictEqual(ralphFinalized.canonicalState.board[0][2][1].iid, 'ralph-1');
assert.strictEqual(ralphFinalized.canonicalState.players[0].discard[0].iid, 'plain-near-ralph');

const suppressedRalphBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'106', iid:'h-106s', name:'Ralph Target', type:'Character', fate:6, cost:3}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'201', iid:'plain-near-suppressed-ralph', name:'Plain Supporter', type:'Supporter', fate:1, owner:0},{id:'24', iid:'ralph-suppressed', name:"Ralph's Courtesy Clerk", type:'Supporter', fate:1, owner:0, _lydiaSuppressed:true},null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:false,
  selectedHandCard:0
});
const suppressedRalphHash = canonicalStateHash(suppressedRalphBase);
const suppressedRalphRejected = reduceServerAction({canonicalState:suppressedRalphBase, canonicalHash:suppressedRalphHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'h-106s', id:'106'},
  baseStateHash:suppressedRalphHash,
  postState:suppressedRalphBase,
  stateHash:suppressedRalphHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:ralphCatalog});
assert.strictEqual(suppressedRalphRejected.ok, false);
assert.match(suppressedRalphRejected.reason, /Need 3 reinforcement/);

const artilleryCatalog = {byId:new Map([
  ['107', {id:'107', type:'Character', cost:1, effect:'', aff:''}],
  ['201', {id:'201', type:'Supporter', effect:'', aff:''}],
  ['202', {id:'202', type:'Supporter', effect:'', aff:''}],
  ['203', {id:'203', type:'Supporter', effect:'', aff:''}]
])};
const artilleryBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'107', iid:'h-107', name:'Artillery Target', type:'Character', fate:4, cost:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,null,null],[{id:'201', iid:'locked-support', name:'Locked Supporter', type:'Supporter', fate:1, owner:0},null,null]],
    [[null,null,null],[null,null,null],[{id:'201', iid:'open-support', name:'Open Supporter', type:'Supporter', fate:1, owner:0},null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  phase:'main',
  placing:false,
  selectedHandCard:0,
  _artilleryLockedZone:0,
  _artilleryLockOwner:0,
  _artilleryLockTurnsLeft:1
});
const artilleryHash = canonicalStateHash(artilleryBase);
const artilleryReady = reduceServerAction({canonicalState:artilleryBase, canonicalHash:artilleryHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'h-107', id:'107'},
  baseStateHash:artilleryHash,
  postState:artilleryBase,
  stateHash:artilleryHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:artilleryCatalog});
assert.strictEqual(artilleryReady.ok, true, artilleryReady.reason);
assert.strictEqual(artilleryReady.canonicalState._consolidating.allPossible.length, 1);
assert.strictEqual(artilleryReady.canonicalState._consolidating.allPossible[0].card.iid, 'open-support');

const artilleryPlacementBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'101', iid:'h-101-locked', name:'Plain Character', type:'Character', fate:3, cost:0}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  _artilleryLockedZone:0,
  _artilleryLockOwner:0,
  _artilleryLockTurnsLeft:1
});
const artilleryPlacementHash = canonicalStateHash(artilleryPlacementBase);
const artilleryPlacementRejected = reduceServerAction({canonicalState:artilleryPlacementBase, canonicalHash:artilleryPlacementHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'h-101-locked', id:'101'},
  baseStateHash:artilleryPlacementHash,
  postState:artilleryPlacementBase,
  stateHash:artilleryPlacementHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([['101', {id:'101', type:'Character', cost:0, effect:'', aff:''}]])}});
assert.strictEqual(artilleryPlacementRejected.ok, false);
assert.match(artilleryPlacementRejected.reason, /Artillery Distance/);

const colomboCatalog = {byId:new Map([
  ['108', {id:'108', type:'Character', cost:2, effect:'', aff:''}],
  ['201', {id:'201', type:'Supporter', effect:'', aff:''}],
  ['53', {id:'53', type:'Supporter', effect:'Opponent consolidations in this zone cannot use outside cards.', aff:'eventide'}]
])};
const colomboBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'108', iid:'h-108', name:'Colombo Target', type:'Character', fate:4, cost:2}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,null,null],[{id:'201', iid:'same-zone-support', name:'Same Zone Supporter', type:'Supporter', fate:1, owner:0},{id:'53', iid:'colombo-1', name:'Colombo Thug', type:'Supporter', fate:1, owner:1},null]],
    [[null,null,null],[null,null,null],[{id:'201', iid:'cross-zone-support', name:'Cross Zone Supporter', type:'Supporter', fate:1, owner:0},null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  phase:'main',
  placing:false,
  selectedHandCard:0
});
const colomboHash = canonicalStateHash(colomboBase);
const colomboReady = reduceServerAction({canonicalState:colomboBase, canonicalHash:colomboHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'h-108', id:'108'},
  baseStateHash:colomboHash,
  postState:colomboBase,
  stateHash:colomboHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:colomboCatalog});
assert.strictEqual(colomboReady.ok, true, colomboReady.reason);
assert.deepStrictEqual(colomboReady.canonicalState._consolidating.colomboRestrictionZones, [0]);
const colomboSameSelected = reduceServerAction({canonicalState:colomboReady.canonicalState, canonicalHash:colomboReady.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'h-108', id:'108'},
  baseStateHash:colomboReady.canonicalHash,
  postState:colomboReady.canonicalState,
  stateHash:colomboReady.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:colomboCatalog});
assert.strictEqual(colomboSameSelected.ok, true, colomboSameSelected.reason);
const colomboCrossSelected = reduceServerAction({canonicalState:colomboSameSelected.canonicalState, canonicalHash:colomboSameSelected.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:1,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'h-108', id:'108'},
  baseStateHash:colomboSameSelected.canonicalHash,
  postState:colomboSameSelected.canonicalState,
  stateHash:colomboSameSelected.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:colomboCatalog});
assert.strictEqual(colomboCrossSelected.ok, true, colomboCrossSelected.reason);
const colomboBlocked = reduceServerAction({canonicalState:colomboCrossSelected.canonicalState, canonicalHash:colomboCrossSelected.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'h-108', id:'108'},
  baseStateHash:colomboCrossSelected.canonicalHash,
  postState:colomboCrossSelected.canonicalState,
  stateHash:colomboCrossSelected.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:colomboCatalog});
assert.strictEqual(colomboBlocked.ok, false);
assert.match(colomboBlocked.reason, /Colombo Thug/);

const colomboSuppressedBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'108', iid:'h-108-suppressed-colombo', name:'Colombo Target', type:'Character', fate:4, cost:2}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,null,null],[{id:'201', iid:'same-zone-support-suppressed-colombo', name:'Same Zone Supporter', type:'Supporter', fate:1, owner:0},{id:'53', iid:'colombo-suppressed', name:'Colombo Thug', type:'Supporter', fate:1, owner:1, _reactionSuppressed:true},null]],
    [[null,null,null],[null,null,null],[{id:'201', iid:'cross-zone-support-suppressed-colombo', name:'Cross Zone Supporter', type:'Supporter', fate:1, owner:0},null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  phase:'main',
  placing:false,
  selectedHandCard:0
});
const colomboSuppressedHash = canonicalStateHash(colomboSuppressedBase);
const colomboSuppressedReady = reduceServerAction({canonicalState:colomboSuppressedBase, canonicalHash:colomboSuppressedHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'h-108-suppressed-colombo', id:'108'},
  baseStateHash:colomboSuppressedHash,
  postState:colomboSuppressedBase,
  stateHash:colomboSuppressedHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:colomboCatalog});
assert.strictEqual(colomboSuppressedReady.ok, true, colomboSuppressedReady.reason);
assert.deepStrictEqual(colomboSuppressedReady.canonicalState._consolidating.colomboRestrictionZones, []);

const copiedFrenchPassiveBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'109', iid:'h-109-copy', name:'Irvine Target', type:'Character', fate:4, cost:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'37', iid:'fusilier-copy-49', name:'French Fusiliers', type:'Supporter', fate:1, owner:0, _copiedPassiveId:'49'},{id:'110', iid:'french-irvine-char', name:'Plain Zone Character', type:'Character', fate:2, owner:0},null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:false,
  selectedHandCard:0
});
const copiedFrenchPassiveHash = canonicalStateHash(copiedFrenchPassiveBase);
const copiedFrenchPassiveReady = reduceServerAction({canonicalState:copiedFrenchPassiveBase, canonicalHash:copiedFrenchPassiveHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'h-109-copy', id:'109'},
  baseStateHash:copiedFrenchPassiveHash,
  postState:copiedFrenchPassiveBase,
  stateHash:copiedFrenchPassiveHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([
  ['109', {id:'109', type:'Character', cost:1, effect:'', aff:''}],
  ['110', {id:'110', type:'Character', cost:0, effect:'', aff:''}],
  ['37', {id:'37', type:'Supporter', effect:'Copy a passive Supporter effect.', aff:'third_great_war'}]
])}});
assert.strictEqual(copiedFrenchPassiveReady.ok, true, copiedFrenchPassiveReady.reason);
assert.strictEqual(copiedFrenchPassiveReady.canonicalState._consolidating.allPossible.some(item=>item?.card?.iid === 'french-irvine-char' && item.isChar), true);
const copiedFrenchSuppressedBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'109', iid:'h-109-copy-suppressed', name:'Irvine Target', type:'Character', fate:4, cost:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'37', iid:'fusilier-copy-49-suppressed', name:'French Fusiliers', type:'Supporter', fate:1, owner:0, _copiedPassiveId:'49', _reactionSuppressed:true},{id:'110', iid:'french-irvine-char-suppressed', name:'Plain Zone Character', type:'Character', fate:2, owner:0},null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:false,
  selectedHandCard:0
});
const copiedFrenchSuppressedHash = canonicalStateHash(copiedFrenchSuppressedBase);
const copiedFrenchSuppressedReady = reduceServerAction({canonicalState:copiedFrenchSuppressedBase, canonicalHash:copiedFrenchSuppressedHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'h-109-copy-suppressed', id:'109'},
  baseStateHash:copiedFrenchSuppressedHash,
  postState:copiedFrenchSuppressedBase,
  stateHash:copiedFrenchSuppressedHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([
  ['109', {id:'109', type:'Character', cost:1, effect:'', aff:''}],
  ['110', {id:'110', type:'Character', cost:0, effect:'', aff:''}],
  ['37', {id:'37', type:'Supporter', effect:'Copy a passive Supporter effect.', aff:'third_great_war'}]
])}});
assert.strictEqual(copiedFrenchSuppressedReady.ok, true, copiedFrenchSuppressedReady.reason);
assert.strictEqual(copiedFrenchSuppressedReady.canonicalState._consolidating.allPossible.some(item=>item?.card?.iid === 'french-irvine-char-suppressed' && item.isChar), false);
const copiedFrenchPassiveSelected = reduceServerAction({canonicalState:copiedFrenchPassiveReady.canonicalState, canonicalHash:copiedFrenchPassiveReady.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:false,
  selectedHand:{index:0, iid:'h-109-copy', id:'109'},
  baseStateHash:copiedFrenchPassiveReady.canonicalHash,
  postState:copiedFrenchPassiveReady.canonicalState,
  stateHash:copiedFrenchPassiveReady.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([
  ['109', {id:'109', type:'Character', cost:1, effect:'', aff:''}],
  ['110', {id:'110', type:'Character', cost:0, effect:'', aff:''}],
  ['37', {id:'37', type:'Supporter', effect:'Copy a passive Supporter effect.', aff:'third_great_war'}]
])}});
assert.strictEqual(copiedFrenchPassiveSelected.ok, true, copiedFrenchPassiveSelected.reason);
const copiedFrenchPassivePlaced = reduceServerAction({canonicalState:copiedFrenchPassiveSelected.canonicalState, canonicalHash:copiedFrenchPassiveSelected.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:false,
  selectedHand:{index:0, iid:'h-109-copy', id:'109'},
  baseStateHash:copiedFrenchPassiveSelected.canonicalHash,
  postState:copiedFrenchPassiveSelected.canonicalState,
  stateHash:copiedFrenchPassiveSelected.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([
  ['109', {id:'109', type:'Character', cost:1, effect:'', aff:''}],
  ['110', {id:'110', type:'Character', cost:0, effect:'', aff:''}],
  ['37', {id:'37', type:'Supporter', effect:'Copy a passive Supporter effect.', aff:'third_great_war'}]
])}});
assert.strictEqual(copiedFrenchPassivePlaced.ok, true, copiedFrenchPassivePlaced.reason);
assert.strictEqual(copiedFrenchPassivePlaced.canonicalState.board[0][2][1].iid, 'h-109-copy');

const irvineCatalog = {byId:new Map([
  ['109', {id:'109', type:'Character', cost:1, effect:'', aff:''}],
  ['110', {id:'110', type:'Character', cost:0, effect:'', aff:''}],
  ['49', {id:'49', type:'Supporter', effect:'Characters in this zone can be used for consolidation.', aff:'reality'}]
])};
const irvineBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'109', iid:'h-109', name:'Irvine Target', type:'Character', fate:4, cost:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,null,null],[{id:'49', iid:'irvine-1', name:'Irvine Businessman', type:'Supporter', fate:1, owner:0},{id:'110', iid:'irvine-char-1', name:'Plain Zone Character', type:'Character', fate:2, owner:0},null]],
    [[null,null,null],[null,null,null],[null,null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  phase:'main',
  placing:false,
  selectedHandCard:0
});
const irvineHash = canonicalStateHash(irvineBase);
const irvineReady = reduceServerAction({canonicalState:irvineBase, canonicalHash:irvineHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'h-109', id:'109'},
  baseStateHash:irvineHash,
  postState:irvineBase,
  stateHash:irvineHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:irvineCatalog});
assert.strictEqual(irvineReady.ok, true, irvineReady.reason);
const irvineChar = irvineReady.canonicalState._consolidating.allPossible.find(item=>item.card.iid === 'irvine-char-1');
assert.ok(irvineChar);
assert.strictEqual(irvineChar.isChar, true);
assert.strictEqual(irvineChar.reinforcement, 1);
const irvineSuppressedBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'109', iid:'h-109-irvine-suppressed', name:'Irvine Target', type:'Character', fate:4, cost:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,null,null],[{id:'49', iid:'irvine-suppressed', name:'Irvine Businessman', type:'Supporter', fate:1, owner:0, _reactionSuppressed:true},{id:'110', iid:'irvine-char-suppressed', name:'Plain Zone Character', type:'Character', fate:2, owner:0},null]],
    [[null,null,null],[null,null,null],[null,null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  phase:'main',
  placing:false,
  selectedHandCard:0
});
const irvineSuppressedHash = canonicalStateHash(irvineSuppressedBase);
const irvineSuppressedReady = reduceServerAction({canonicalState:irvineSuppressedBase, canonicalHash:irvineSuppressedHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'h-109-irvine-suppressed', id:'109'},
  baseStateHash:irvineSuppressedHash,
  postState:irvineSuppressedBase,
  stateHash:irvineSuppressedHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:irvineCatalog});
assert.strictEqual(irvineSuppressedReady.ok, true, irvineSuppressedReady.reason);
assert.strictEqual(irvineSuppressedReady.canonicalState._consolidating.allPossible.some(item=>item?.card?.iid === 'irvine-char-suppressed' && item.isChar), false);
const irvineGloballySuppressedBase = state(Object.assign({}, irvineBase, {
  oppSuppressedNextTurn:true,
  suppressTarget:0
}));
const irvineGloballySuppressedHash = canonicalStateHash(irvineGloballySuppressedBase);
const irvineGloballySuppressedReady = reduceServerAction({canonicalState:irvineGloballySuppressedBase, canonicalHash:irvineGloballySuppressedHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'h-109', id:'109'},
  baseStateHash:irvineGloballySuppressedHash,
  postState:irvineGloballySuppressedBase,
  stateHash:irvineGloballySuppressedHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:irvineCatalog});
assert.strictEqual(irvineGloballySuppressedReady.ok, true, irvineGloballySuppressedReady.reason);
assert.strictEqual(irvineGloballySuppressedReady.canonicalState._consolidating.allPossible.some(item=>item?.card?.iid === 'irvine-char-1' && item.isChar), false);
const irvineSelected = reduceServerAction({canonicalState:irvineReady.canonicalState, canonicalHash:irvineReady.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:false,
  selectedHand:{index:0, iid:'h-109', id:'109'},
  baseStateHash:irvineReady.canonicalHash,
  postState:irvineReady.canonicalState,
  stateHash:irvineReady.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:irvineCatalog});
assert.strictEqual(irvineSelected.ok, true, irvineSelected.reason);
const irvineFinalized = reduceServerAction({canonicalState:irvineSelected.canonicalState, canonicalHash:irvineSelected.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:false,
  selectedHand:{index:0, iid:'h-109', id:'109'},
  baseStateHash:irvineSelected.canonicalHash,
  postState:irvineSelected.canonicalState,
  stateHash:irvineSelected.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:irvineCatalog});
assert.strictEqual(irvineFinalized.ok, true, irvineFinalized.reason);
assert.strictEqual(irvineFinalized.canonicalState.board[0][2][1].iid, 'h-109');
assert.strictEqual(irvineFinalized.canonicalState.players[0].discard[0].iid, 'irvine-char-1');

const marieCatalog = {byId:new Map([
  ['36', {id:'36', type:'Improvisor', cost:2, effect:'Whenever your opponent would Consolidate a card in this zone, reduce the zone total Fate by 3.', aff:'third_great_war'}],
  ['201', {id:'201', type:'Supporter', effect:'', aff:''}],
  ['202', {id:'202', type:'Supporter', effect:'', aff:''}]
])};
const marieBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'36', iid:'c-36-hand', name:"Marie L'amboure", type:'Improvisor', fate:6, cost:2}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[
    {id:'201', iid:'marie-trib-1', name:'Marie Tribute A', type:'Supporter', owner:0, fate:1, currentFate:1},
    {id:'202', iid:'marie-trib-2', name:'Marie Tribute B', type:'Supporter', owner:0, fate:1, currentFate:1},
    null
  ]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  selectedHandCard:0
});
const marieHash = canonicalStateHash(marieBase);
const marieReady = reduceServerAction({canonicalState:marieBase, canonicalHash:marieHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'c-36-hand', id:'36'},
  baseStateHash:marieHash,
  postState:marieBase,
  stateHash:marieHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:marieCatalog});
assert.strictEqual(marieReady.ok, true, marieReady.reason);
assert.strictEqual(marieReady.canonicalState._consolidating.cost, 2);
const marieFirstTribute = reduceServerAction({canonicalState:marieReady.canonicalState, canonicalHash:marieReady.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'c-36-hand', id:'36'},
  baseStateHash:marieReady.canonicalHash,
  postState:marieReady.canonicalState,
  stateHash:marieReady.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:marieCatalog});
assert.strictEqual(marieFirstTribute.ok, true, marieFirstTribute.reason);
const marieSecondTribute = reduceServerAction({canonicalState:marieFirstTribute.canonicalState, canonicalHash:marieFirstTribute.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:false,
  selectedHand:{index:0, iid:'c-36-hand', id:'36'},
  baseStateHash:marieFirstTribute.canonicalHash,
  postState:marieFirstTribute.canonicalState,
  stateHash:marieFirstTribute.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:marieCatalog});
assert.strictEqual(marieSecondTribute.ok, true, marieSecondTribute.reason);
const mariePlaced = reduceServerAction({canonicalState:marieSecondTribute.canonicalState, canonicalHash:marieSecondTribute.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'c-36-hand', id:'36'},
  baseStateHash:marieSecondTribute.canonicalHash,
  postState:marieSecondTribute.canonicalState,
  stateHash:marieSecondTribute.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:marieCatalog});
assert.strictEqual(mariePlaced.ok, true, mariePlaced.reason);
assert.strictEqual(mariePlaced.canonicalState.board[0][2][0].iid, 'c-36-hand');
assert.strictEqual(mariePlaced.canonicalState.board[0][2][0].currentFate, 6);
assert.deepStrictEqual(mariePlaced.canonicalState.players[0].discard.map(card=>card.iid).sort(), ['marie-trib-1', 'marie-trib-2']);

const deterranceCatalog = {byId:new Map([
  ['111', {id:'111', type:'Character', cost:1, effect:'', aff:''}],
  ['112', {id:'112', type:'Character', cost:2, effect:'', aff:''}],
  ['201', {id:'201', type:'Supporter', effect:'', aff:''}],
  ['202', {id:'202', type:'Supporter', effect:'', aff:''}],
  ['203', {id:'203', type:'Supporter', effect:'', aff:''}]
])};
const deterranceBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'111', iid:'h-111', name:'Deterrance Target', type:'Character', fate:4, cost:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,{id:'36', iid:'deterrance-1', name:'Marie Lamboure', type:'Coordinator', fate:1, owner:1},null],[{id:'201', iid:'deterrance-support', name:'Plain Supporter', type:'Supporter', fate:1, owner:0},null,null]],
    [[null,null,null],[null,null,null],[null,null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  phase:'main',
  placing:false,
  selectedHandCard:0,
  fateModifiers:{}
});
const deterranceHash = canonicalStateHash(deterranceBase);
const deterranceReady = reduceServerAction({canonicalState:deterranceBase, canonicalHash:deterranceHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'h-111', id:'111'},
  baseStateHash:deterranceHash,
  postState:deterranceBase,
  stateHash:deterranceHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:deterranceCatalog});
assert.strictEqual(deterranceReady.ok, true, deterranceReady.reason);
const deterranceSelected = reduceServerAction({canonicalState:deterranceReady.canonicalState, canonicalHash:deterranceReady.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'h-111', id:'111'},
  baseStateHash:deterranceReady.canonicalHash,
  postState:deterranceReady.canonicalState,
  stateHash:deterranceReady.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:deterranceCatalog});
assert.strictEqual(deterranceSelected.ok, true, deterranceSelected.reason);
const deterranceFinalized = reduceServerAction({canonicalState:deterranceSelected.canonicalState, canonicalHash:deterranceSelected.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'h-111', id:'111'},
  baseStateHash:deterranceSelected.canonicalHash,
  postState:deterranceSelected.canonicalState,
  stateHash:deterranceSelected.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:deterranceCatalog});
assert.strictEqual(deterranceFinalized.ok, true, deterranceFinalized.reason);
assert.strictEqual(deterranceFinalized.canonicalState.fateModifiers.deterrance_z0, -3);

const deterranceCrossZoneBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'112', iid:'h-112-cross', name:'Cross Zone Consolidation', type:'Character', fate:4, cost:2}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,{id:'36', iid:'deterrance-cross-1', name:'Marie Lamboure', type:'Coordinator', fate:1, owner:1},null],[{id:'201', iid:'deterrance-cross-support-a', name:'Plain Supporter A', type:'Supporter', fate:1, owner:0},null,null]],
    [[null,null,null],[null,null,null],[{id:'202', iid:'deterrance-cross-support-b', name:'Plain Supporter B', type:'Supporter', fate:1, owner:0},null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  phase:'main',
  placing:false,
  selectedHandCard:0,
  fateModifiers:{}
});
const deterranceCrossZoneHash = canonicalStateHash(deterranceCrossZoneBase);
const deterranceCrossZoneReady = reduceServerAction({canonicalState:deterranceCrossZoneBase, canonicalHash:deterranceCrossZoneHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'h-112-cross', id:'112'},
  baseStateHash:deterranceCrossZoneHash,
  postState:deterranceCrossZoneBase,
  stateHash:deterranceCrossZoneHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:deterranceCatalog});
assert.strictEqual(deterranceCrossZoneReady.ok, true, deterranceCrossZoneReady.reason);
const deterranceCrossZoneFirst = reduceServerAction({canonicalState:deterranceCrossZoneReady.canonicalState, canonicalHash:deterranceCrossZoneReady.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'h-112-cross', id:'112'},
  baseStateHash:deterranceCrossZoneReady.canonicalHash,
  postState:deterranceCrossZoneReady.canonicalState,
  stateHash:deterranceCrossZoneReady.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:deterranceCatalog});
assert.strictEqual(deterranceCrossZoneFirst.ok, true, deterranceCrossZoneFirst.reason);
const deterranceCrossZoneSecond = reduceServerAction({canonicalState:deterranceCrossZoneFirst.canonicalState, canonicalHash:deterranceCrossZoneFirst.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:1,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'h-112-cross', id:'112'},
  baseStateHash:deterranceCrossZoneFirst.canonicalHash,
  postState:deterranceCrossZoneFirst.canonicalState,
  stateHash:deterranceCrossZoneFirst.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:deterranceCatalog});
assert.strictEqual(deterranceCrossZoneSecond.ok, true, deterranceCrossZoneSecond.reason);
const deterranceCrossZoneFinalized = reduceServerAction({canonicalState:deterranceCrossZoneSecond.canonicalState, canonicalHash:deterranceCrossZoneSecond.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:1,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'h-112-cross', id:'112'},
  baseStateHash:deterranceCrossZoneSecond.canonicalHash,
  postState:deterranceCrossZoneSecond.canonicalState,
  stateHash:deterranceCrossZoneSecond.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:deterranceCatalog});
assert.strictEqual(deterranceCrossZoneFinalized.ok, true, deterranceCrossZoneFinalized.reason);
assert.strictEqual(deterranceCrossZoneFinalized.canonicalState.fateModifiers.deterrance_z0, undefined);
assert.strictEqual(deterranceCrossZoneFinalized.canonicalState.fateModifiers.deterrance_z1, undefined);

const alexanderCatalog = {byId:new Map([
  ['35', {id:'35', type:'Dauntless', cost:4, xFate:true, effect:'Fate equals friendly Supporters in this zone.', aff:'third_great_war'}],
  ['201', {id:'201', type:'Supporter', effect:'', aff:''}],
  ['86', {id:'86', type:'Initiator', effect:'Counts as 3 Reinforcement and gives 4 Fate when used in Consolidation.', aff:'eventide'}]
])};
const alexanderBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'35', iid:'h-35', name:'Alexander the Magnificient', type:'Dauntless', aff:'third_great_war', fate:0, cost:4, xFate:true}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,null,null],[{id:'201', iid:'alex-tribute', name:'Plain Tribute', type:'Supporter', fate:1, owner:0},{id:'201', iid:'alex-remaining', name:'Remaining Supporter', type:'Supporter', fate:1, currentFate:3, owner:0},null]],
    [[null,null,null],[null,null,null],[{id:'86', iid:'alex-boleslaw', name:'Boleslaw Kopewicz', type:'Initiator', fate:1, owner:0},null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  phase:'main',
  placing:false,
  selectedHandCard:0
});
const alexanderHash = canonicalStateHash(alexanderBase);
const alexanderReady = reduceServerAction({canonicalState:alexanderBase, canonicalHash:alexanderHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'h-35', id:'35'},
  baseStateHash:alexanderHash,
  postState:alexanderBase,
  stateHash:alexanderHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:alexanderCatalog});
assert.strictEqual(alexanderReady.ok, true, alexanderReady.reason);
const alexanderFirst = reduceServerAction({canonicalState:alexanderReady.canonicalState, canonicalHash:alexanderReady.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'h-35', id:'35'},
  baseStateHash:alexanderReady.canonicalHash,
  postState:alexanderReady.canonicalState,
  stateHash:alexanderReady.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:alexanderCatalog});
assert.strictEqual(alexanderFirst.ok, true, alexanderFirst.reason);
const alexanderSecond = reduceServerAction({canonicalState:alexanderFirst.canonicalState, canonicalHash:alexanderFirst.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:1,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'h-35', id:'35'},
  baseStateHash:alexanderFirst.canonicalHash,
  postState:alexanderFirst.canonicalState,
  stateHash:alexanderFirst.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:alexanderCatalog});
assert.strictEqual(alexanderSecond.ok, true, alexanderSecond.reason);
const alexanderFinalized = reduceServerAction({canonicalState:alexanderSecond.canonicalState, canonicalHash:alexanderSecond.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'h-35', id:'35'},
  baseStateHash:alexanderSecond.canonicalHash,
  postState:alexanderSecond.canonicalState,
  stateHash:alexanderSecond.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:alexanderCatalog});
assert.strictEqual(alexanderFinalized.ok, true, alexanderFinalized.reason);
assert.strictEqual(alexanderFinalized.canonicalState.board[0][2][0].iid, 'h-35');
assert.strictEqual(alexanderFinalized.canonicalState.board[0][2][0].currentFate, 3);
assert.strictEqual(alexanderFinalized.canonicalState.players[0].discard.length, 2);

const chingachlookCatalog = {byId:new Map([
  ['45', {id:'45', type:'Dauntless', cost:2, effect:'Cannot be set in a zone where you control another character.', aff:'eventide'}],
  ['09', {id:'09', type:'Supporter', effect:'This card counts as 2 Reinforcement.', aff:'third_great_war'}]
])};
const chingachlookBlockedBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'45', iid:'h-45-blocked', name:'Chingachlook', type:'Dauntless', fate:10, cost:2}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,null,null],[{id:'09', iid:'ching-tribute', name:'United Nations 5th Army', type:'Supporter', fate:1, owner:0, usesLeft:3},{id:'101', iid:'friendly-character', name:'Plain Character', type:'Character', fate:3, owner:0},null]],
    [[null,null,null],[null,null,null],[null,null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  phase:'main',
  placing:false,
  selectedHandCard:0
});
const chingachlookBlockedHash = canonicalStateHash(chingachlookBlockedBase);
const chingachlookReady = reduceServerAction({canonicalState:chingachlookBlockedBase, canonicalHash:chingachlookBlockedHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'h-45-blocked', id:'45'},
  baseStateHash:chingachlookBlockedHash,
  postState:chingachlookBlockedBase,
  stateHash:chingachlookBlockedHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:chingachlookCatalog});
assert.strictEqual(chingachlookReady.ok, true, chingachlookReady.reason);
const chingachlookSelected = reduceServerAction({canonicalState:chingachlookReady.canonicalState, canonicalHash:chingachlookReady.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'h-45-blocked', id:'45'},
  baseStateHash:chingachlookReady.canonicalHash,
  postState:chingachlookReady.canonicalState,
  stateHash:chingachlookReady.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:chingachlookCatalog});
assert.strictEqual(chingachlookSelected.ok, true, chingachlookSelected.reason);
const chingachlookBlocked = reduceServerAction({canonicalState:chingachlookSelected.canonicalState, canonicalHash:chingachlookSelected.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'h-45-blocked', id:'45'},
  baseStateHash:chingachlookSelected.canonicalHash,
  postState:chingachlookSelected.canonicalState,
  stateHash:chingachlookSelected.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:chingachlookCatalog});
assert.strictEqual(chingachlookBlocked.ok, false);
assert.match(chingachlookBlocked.reason, /Chingachlook/);

const philCatalog = {byId:new Map([
  ['46', {id:'46', type:'Dauntless', cost:3, fate:1, effect:'Gains 2 Fate each draw phase after being set.', aff:'reality'}],
  ['201', {id:'201', type:'Supporter', cost:0, fate:1}]
])};
const philBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'46', iid:'h-46', name:'Phil', type:'Dauntless', aff:'reality', fate:1, cost:3}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,null,null],[
      {id:'201', iid:'phil-tribute-a', name:'Plain Supporter A', type:'Supporter', fate:1, owner:0},
      {id:'201', iid:'phil-tribute-b', name:'Plain Supporter B', type:'Supporter', fate:1, owner:0},
      {id:'201', iid:'phil-tribute-c', name:'Plain Supporter C', type:'Supporter', fate:1, owner:0}
    ]],
    [[null,null,null],[null,null,null],[null,null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  phase:'main',
  placing:false,
  selectedHandCard:0
});
const philHash = canonicalStateHash(philBase);
const philReady = reduceServerAction({canonicalState:philBase, canonicalHash:philHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'h-46', id:'46'},
  baseStateHash:philHash,
  postState:philBase,
  stateHash:philHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:philCatalog});
assert.strictEqual(philReady.ok, true, philReady.reason);
let philStep = philReady;
for(const [z, r, c] of [[0, 2, 0], [0, 2, 1], [0, 2, 2]]){
  philStep = reduceServerAction({canonicalState:philStep.canonicalState, canonicalHash:philStep.canonicalHash}, msg('CLICK_CELL', {
    playerIndex:0,
    turn:1,
    z,
    r,
    c,
    placing:false,
    selectedHand:{index:0, iid:'h-46', id:'46'},
    baseStateHash:philStep.canonicalHash,
    postState:philStep.canonicalState,
    stateHash:philStep.canonicalHash
  }), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:philCatalog});
  assert.strictEqual(philStep.ok, true, philStep.reason);
}
const philPlaced = reduceServerAction({canonicalState:philStep.canonicalState, canonicalHash:philStep.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'h-46', id:'46'},
  baseStateHash:philStep.canonicalHash,
  postState:philStep.canonicalState,
  stateHash:philStep.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:philCatalog});
assert.strictEqual(philPlaced.ok, true, philPlaced.reason);
assert.strictEqual(philPlaced.canonicalState.board[0][2][0].iid, 'h-46');
assert.strictEqual(philPlaced.canonicalState.board[0][2][0]._philSetTurn, 1);
assert.strictEqual(philPlaced.canonicalState.board[0][2][0].currentFate, 1);
const philOpponentTurn = reduceServerAction({canonicalState:philPlaced.canonicalState, canonicalHash:philPlaced.canonicalHash}, msg('END_TURN', {
  playerIndex:0,
  turn:1,
  baseStateHash:philPlaced.canonicalHash,
  postState:philPlaced.canonicalState,
  stateHash:philPlaced.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:philCatalog});
assert.strictEqual(philOpponentTurn.ok, true, philOpponentTurn.reason);
assert.strictEqual(philOpponentTurn.canonicalState.currentPlayer, 1);
assert.strictEqual(philOpponentTurn.canonicalState.board[0][2][0].currentFate, 1);
const philOwnerTurn = reduceServerAction({canonicalState:philOpponentTurn.canonicalState, canonicalHash:philOpponentTurn.canonicalHash}, msg('END_TURN', {
  playerIndex:1,
  turn:2,
  baseStateHash:philOpponentTurn.canonicalHash,
  postState:philOpponentTurn.canonicalState,
  stateHash:philOpponentTurn.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:philCatalog});
assert.strictEqual(philOwnerTurn.ok, true, philOwnerTurn.reason);
assert.strictEqual(philOwnerTurn.canonicalState.currentPlayer, 0);
assert.strictEqual(philOwnerTurn.canonicalState.board[0][2][0].currentFate, 3);
assert.strictEqual(philOwnerTurn.canonicalState.board[0][2][0]._philDrawPhaseGrowth, 2);

const wineCountryBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'70', iid:'s-70-hand', name:'Wine Country Guerilla', type:'Supporter', fate:1, aff:'expanded_worlds'}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[{id:'301', iid:'guest-target', name:'Guest Target', type:'Character', fate:4, currentFate:4}], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  currentPlayer:0,
  turn:1,
  selectedHandCard:0
});
const wineCountryHash = canonicalStateHash(wineCountryBase);
const wineCountryActivated = reduceServerAction({canonicalState:wineCountryBase, canonicalHash:wineCountryHash}, msg('HAND_ACTION', {
  fn:'activateWineCountryGuerillaFromHand',
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'s-70-hand', id:'70'},
  baseStateHash:wineCountryHash,
  postState:wineCountryBase,
  stateHash:wineCountryHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([
  ['70', {id:'70', type:'Supporter', effect:'Infiltrate opponent hand.', aff:'expanded_worlds'}],
  ['301', {id:'301', type:'Character', fate:4}]
])}});
assert.strictEqual(wineCountryActivated.ok, true, wineCountryActivated.reason);
assert.strictEqual(wineCountryActivated.canonicalState.players[0].hand.length, 0);
assert.strictEqual(wineCountryActivated.canonicalState.players[1].hand[1].iid, 's-70-hand');
assert.strictEqual(wineCountryActivated.canonicalState.players[1].hand[1].guerilla_transferred, true);
assert.strictEqual(wineCountryActivated.canonicalState.players[1].hand[1].guerilla_turnsLeft, 5);
assert.strictEqual(wineCountryActivated.canonicalState.players[1].hand[1].guerilla_owner, 0);

const selvaHandBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'74', iid:'s-74-hand', name:'Selva Islands Pirate', type:'Supporter', fate:1, aff:'eventide'}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  currentPlayer:0,
  turn:1,
  selectedHandCard:0,
  supportsPlacedThisTurn:2,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0
});
const selvaHandHash = canonicalStateHash(selvaHandBase);
const selvaActivated = reduceServerAction({canonicalState:selvaHandBase, canonicalHash:selvaHandHash}, msg('HAND_ACTION', {
  fn:'activateSelvaIslandsPirateFromHand',
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'s-74-hand', id:'74'},
  baseStateHash:selvaHandHash,
  postState:selvaHandBase,
  stateHash:selvaHandHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([
  ['74', {id:'74', type:'Supporter', effect:'When drawn, set one extra Supporter this turn.', aff:'eventide'}]
])}});
assert.strictEqual(selvaActivated.ok, true, selvaActivated.reason);
assert.strictEqual(selvaActivated.canonicalState.players[0].hand.length, 0);
assert.strictEqual(selvaActivated.canonicalState.players[0].discard[0].iid, 's-74-hand');
assert.strictEqual(selvaActivated.canonicalState.maxSupportsPerTurn, 3);
assert.strictEqual(selvaActivated.canonicalState.supportsPlacedThisTurn, 2);
assert.strictEqual(selvaActivated.canonicalState.selectedHandCard, null);

const selvaWrongCard = reduceServerAction({canonicalState:selvaHandBase, canonicalHash:selvaHandHash}, msg('HAND_ACTION', {
  fn:'activateSelvaIslandsPirateFromHand',
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'s-74-hand', id:'70'},
  baseStateHash:selvaHandHash,
  postState:selvaHandBase,
  stateHash:selvaHandHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(selvaWrongCard.ok, false);
assert.match(selvaWrongCard.reason, /id mismatch|Selva Islands Pirate/);

const wineCountryTicked = reduceServerAction({canonicalState:wineCountryActivated.canonicalState, canonicalHash:wineCountryActivated.canonicalHash}, msg('END_TURN', {
  playerIndex:0,
  turn:1,
  baseStateHash:wineCountryActivated.canonicalHash,
  postState:wineCountryActivated.canonicalState,
  stateHash:wineCountryActivated.canonicalHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(wineCountryTicked.ok, true, wineCountryTicked.reason);
assert.strictEqual(wineCountryTicked.canonicalState.currentPlayer, 1);
assert.strictEqual(wineCountryTicked.canonicalState.players[1].hand.find(card=>card.iid === 'guest-target').currentFate, 3);
assert.strictEqual(wineCountryTicked.canonicalState.players[1].hand.find(card=>card.iid === 's-70-hand').guerilla_turnsLeft, 4);
assert.strictEqual(wineCountryTicked.canonicalState._continuousDamageSources['0:70:s-70-hand'], true);

const wineCountryPlacementBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'70', iid:'s-70-place', name:'Wine Country Guerilla', type:'Supporter', fate:1, aff:'expanded_worlds'}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[{id:'301', iid:'guest-board-discard-target', name:'Guest Target', type:'Character', fate:4, currentFate:4}], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  currentPlayer:0,
  turn:1,
  selectedHandCard:0,
  placing:true,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  supportersSetP:[0, 0]
});
const wineCountryCatalog = {byId:new Map([
  ['70', {id:'70', type:'Supporter', effect:'When discarded from its own zone, infiltrate the opponent hand for five turns.', aff:'expanded_worlds'}],
  ['301', {id:'301', type:'Character', fate:4}]
])};
const wineCountryPlacementHash = canonicalStateHash(wineCountryPlacementBase);
const wineCountryPlaced = reduceServerAction({canonicalState:wineCountryPlacementBase, canonicalHash:wineCountryPlacementHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'s-70-place', id:'70'},
  baseStateHash:wineCountryPlacementHash,
  postState:wineCountryPlacementBase,
  stateHash:wineCountryPlacementHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:wineCountryCatalog});
assert.strictEqual(wineCountryPlaced.ok, true, wineCountryPlaced.reason);
assert.strictEqual(wineCountryPlaced.canonicalState.board[0][2][0].iid, 's-70-place');
assert.strictEqual(wineCountryPlaced.canonicalState.players[0].hand.length, 0);
const wineCountryBoardDiscarded = reduceServerAction({canonicalState:wineCountryPlaced.canonicalState, canonicalHash:wineCountryPlaced.canonicalHash}, msg('BOARD_ACTION', {
  fn:'discardBoardCard',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  card:{iid:'s-70-place', id:'70'},
  baseStateHash:wineCountryPlaced.canonicalHash,
  postState:wineCountryPlaced.canonicalState,
  stateHash:wineCountryPlaced.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:wineCountryCatalog});
assert.strictEqual(wineCountryBoardDiscarded.ok, true, wineCountryBoardDiscarded.reason);
assert.strictEqual(wineCountryBoardDiscarded.canonicalState.board[0][2][0], null);
assert.strictEqual(wineCountryBoardDiscarded.canonicalState.players[0].discard.length, 0);
assert.strictEqual(wineCountryBoardDiscarded.canonicalState.players[1].hand[1].iid, 's-70-place');
assert.strictEqual(wineCountryBoardDiscarded.canonicalState.players[1].hand[1].guerilla_transferred, true);
assert.strictEqual(wineCountryBoardDiscarded.canonicalState.players[1].hand[1].guerilla_turnsLeft, 5);
assert.strictEqual(wineCountryBoardDiscarded.canonicalState.players[1].hand[1].guerilla_owner, 0);
const wineCountryBoardTicked = reduceServerAction({canonicalState:wineCountryBoardDiscarded.canonicalState, canonicalHash:wineCountryBoardDiscarded.canonicalHash}, msg('END_TURN', {
  playerIndex:0,
  turn:1,
  baseStateHash:wineCountryBoardDiscarded.canonicalHash,
  postState:wineCountryBoardDiscarded.canonicalState,
  stateHash:wineCountryBoardDiscarded.canonicalHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(wineCountryBoardTicked.ok, true, wineCountryBoardTicked.reason);
assert.strictEqual(wineCountryBoardTicked.canonicalState.players[1].hand.find(card=>card.iid === 'guest-board-discard-target').currentFate, 3);
assert.strictEqual(wineCountryBoardTicked.canonicalState.players[1].hand.find(card=>card.iid === 's-70-place').guerilla_turnsLeft, 4);

const havanoPlacementBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'79', iid:'s-79-place', name:'Havano Citizen', type:'Supporter', fate:1, aff:'eventide'}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  currentPlayer:0,
  turn:1,
  selectedHandCard:0,
  placing:true,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  supportersSetP:[0, 0]
});
const havanoPlacementHash = canonicalStateHash(havanoPlacementBase);
const havanoPlaced = reduceServerAction({canonicalState:havanoPlacementBase, canonicalHash:havanoPlacementHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'s-79-place', id:'79'},
  baseStateHash:havanoPlacementHash,
  postState:havanoPlacementBase,
  stateHash:havanoPlacementHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([
  ['79', {id:'79', type:'Supporter', effect:'While in hand, can negate an opponent targeting effect and set itself at no cost.', aff:'eventide'}]
])}});
assert.strictEqual(havanoPlaced.ok, true, havanoPlaced.reason);
assert.strictEqual(havanoPlaced.canonicalState.board[0][2][0].iid, 's-79-place');
assert.strictEqual(havanoPlaced.canonicalState.players[0].hand.length, 0);

const havanoReactionCatalog = {byId:new Map([
  ['26', {id:'26', type:'Supporter', effect:'When set, reveal your opponent hand.', aff:'reality'}],
  ['79', {id:'79', type:'Supporter', effect:'While in hand, can negate an opponent targeting effect and set itself at no cost.', aff:'eventide'}],
  ['301', {id:'301', type:'Character', fate:1}]
])};
function havanoReactionBase(){
  return state({
    players:[
      {name:'Host', color:'', deck:[], hand:[{id:'26', iid:'rx-ucpd', name:'UCPD', type:'Supporter', fate:1, aff:'reality'}], discard:[]},
      {name:'Guest', color:'', deck:[], hand:[
        {id:'79', iid:'rx-havano', name:'Havano Citizen', type:'Supporter', fate:1, aff:'eventide'},
        {id:'301', iid:'guest-hidden-card', name:'Hidden Character', type:'Character', fate:1}
      ], discard:[]}
    ],
    board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
    phase:'main',
    currentPlayer:0,
    turn:1,
    selectedHandCard:0,
    placing:true,
    supportsPlacedThisTurn:0,
    maxSupportsPerTurn:2,
    supportersSetP:[0, 0]
  });
}
function runHavanoReactionToPending(){
  const base = havanoReactionBase();
  const hash = canonicalStateHash(base);
  const pending = reduceServerAction({canonicalState:base, canonicalHash:hash}, msg('CLICK_CELL', {
    playerIndex:0,
    turn:1,
    z:0,
    r:2,
    c:0,
    placing:true,
    selectedHand:{index:0, iid:'rx-ucpd', id:'26'},
    baseStateHash:hash,
    postState:base,
    stateHash:hash
  }), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:havanoReactionCatalog});
  assert.strictEqual(pending.ok, true, pending.reason);
  assert.strictEqual(pending.canonicalState._serverPendingReaction.kind, 'supporterWhenSet');
  assert.strictEqual(pending.canonicalState._serverPendingReaction.playerIndex, 1);
  const havanoOption = pending.canonicalState._serverPendingReaction.options.find(option=>option.kind === 'havano');
  assert.ok(havanoOption, 'expected Havano reaction option');
  assert.strictEqual(havanoOption.card.iid, 'rx-havano');
  assert.ok(havanoOption.deploymentOptions.length > 0, 'expected Havano deployment options');
  assert.strictEqual(pending.canonicalState._revealedCards, undefined);
  return pending;
}
const havanoReactionPending = runHavanoReactionToPending();
const havanoDeclined = reduceServerAction({canonicalState:havanoReactionPending.canonicalState, canonicalHash:havanoReactionPending.canonicalHash}, msg('REACTION_CHOICE', {
  playerIndex:1,
  promptId:havanoReactionPending.canonicalState._serverPendingReaction.promptId,
  choice:'decline',
  baseStateHash:havanoReactionPending.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:havanoReactionCatalog});
assert.strictEqual(havanoDeclined.ok, true, havanoDeclined.reason);
assert.strictEqual(havanoDeclined.canonicalState._serverPendingReaction, null);
assert.strictEqual(havanoDeclined.canonicalState._revealedCards['rx-havano'], true);
assert.strictEqual(havanoDeclined.canonicalState._revealedCards['guest-hidden-card'], true);
assert.strictEqual(havanoDeclined.canonicalState.players[1].hand.length, 2);

const havanoReactionPendingForNegate = runHavanoReactionToPending();
const havanoNegateOptionIndex = havanoReactionPendingForNegate.canonicalState._serverPendingReaction.options.findIndex(option=>option.kind === 'havano');
const havanoNegateOption = havanoReactionPendingForNegate.canonicalState._serverPendingReaction.options[havanoNegateOptionIndex];
const havanoDeployTarget = havanoNegateOption.deploymentOptions.find(option=>Number(option.z) === 0 && Number(option.r) === 0) || havanoNegateOption.deploymentOptions[0];
const havanoNegated = reduceServerAction({canonicalState:havanoReactionPendingForNegate.canonicalState, canonicalHash:havanoReactionPendingForNegate.canonicalHash}, msg('REACTION_CHOICE', {
  playerIndex:1,
  promptId:havanoReactionPendingForNegate.canonicalState._serverPendingReaction.promptId,
  choice:'negate',
  optionIndex:havanoNegateOptionIndex,
  reaction:{kind:'havano', card:{iid:'rx-havano', id:'79'}},
  deployment:havanoDeployTarget,
  baseStateHash:havanoReactionPendingForNegate.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:havanoReactionCatalog});
assert.strictEqual(havanoNegated.ok, true, havanoNegated.reason);
assert.strictEqual(havanoNegated.canonicalState._serverPendingReaction, null);
assert.strictEqual(havanoNegated.canonicalState._revealedCards, undefined);
assert.strictEqual(havanoNegated.canonicalState.players[1].hand.length, 1);
assert.strictEqual(havanoNegated.canonicalState.players[1].hand[0].iid, 'guest-hidden-card');
assert.strictEqual(havanoNegated.canonicalState.board[havanoDeployTarget.z][havanoDeployTarget.r][havanoDeployTarget.c].iid, 'rx-havano');
assert.strictEqual(havanoNegated.canonicalState.board[havanoDeployTarget.z][havanoDeployTarget.r][havanoDeployTarget.c]._serverReactionDeployed, true);
assert.strictEqual(havanoNegated.canonicalState.board[0][2][0]._reactionSuppressed, true);
assert.strictEqual(havanoNegated.canonicalState.supportsPlacedThisTurn, 1);

const havanoInitiatorReactionCatalog = {byId:new Map([
  ['03', {id:'03', type:'Initiator', cost:2, effect:'Select one card in this zone; double its current Fate permanently, then increase its Fate by another 5 permanently.', aff:'reality'}],
  ['79', {id:'79', type:'Supporter', effect:'While in hand, can negate an opponent targeting effect and set itself at no cost.', aff:'eventide'}],
  ['302', {id:'302', type:'Supporter', fate:1}],
  ['303', {id:'303', type:'Supporter', fate:1}],
  ['401', {id:'401', type:'Character', fate:3}]
])};
function havanoInitiatorReactionBase(){
  return state({
    players:[
      {name:'Host', color:'', deck:[], hand:[{id:'03', iid:'rx-howard', name:'Howard', type:'Initiator', fate:5, cost:2, aff:'reality'}], discard:[]},
      {name:'Guest', color:'', deck:[], hand:[
        {id:'79', iid:'rx-havano-init', name:'Havano Citizen', type:'Supporter', fate:1, aff:'eventide'}
      ], discard:[]}
    ],
    board:[
      [[{id:'401', iid:'howard-target', name:'Target', type:'Character', owner:1, currentFate:3}, null, null], [null,null,null], [{id:'302', iid:'howard-tribute-a', name:'Tribute A', type:'Supporter', owner:0, currentFate:1}, {id:'303', iid:'howard-tribute-b', name:'Tribute B', type:'Supporter', owner:0, currentFate:1}, null]],
      [[null,null,null], [null,null,null], [null,null,null]],
      [[null,null,null], [null,null,null], [null,null,null]]
    ],
    phase:'main',
    currentPlayer:0,
    turn:1,
    selectedHandCard:0,
    placing:false
  });
}
function runHavanoInitiatorReactionToPending(){
  const base = havanoInitiatorReactionBase();
  const hash = canonicalStateHash(base);
  const ready = reduceServerAction({canonicalState:base, canonicalHash:hash}, msg('START_CONSOLIDATE', {
    playerIndex:0,
    turn:1,
    selectedHand:{index:0, iid:'rx-howard', id:'03'},
    baseStateHash:hash,
    postState:base,
    stateHash:hash
  }), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:havanoInitiatorReactionCatalog});
  assert.strictEqual(ready.ok, true, ready.reason);
  const firstTribute = reduceServerAction({canonicalState:ready.canonicalState, canonicalHash:ready.canonicalHash}, msg('CLICK_CELL', {
    playerIndex:0,
    turn:1,
    z:0,
    r:2,
    c:0,
    placing:false,
    selectedHand:{index:0, iid:'rx-howard', id:'03'},
    baseStateHash:ready.canonicalHash,
    postState:ready.canonicalState,
    stateHash:ready.canonicalHash
  }), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:havanoInitiatorReactionCatalog});
  assert.strictEqual(firstTribute.ok, true, firstTribute.reason);
  const secondTribute = reduceServerAction({canonicalState:firstTribute.canonicalState, canonicalHash:firstTribute.canonicalHash}, msg('CLICK_CELL', {
    playerIndex:0,
    turn:1,
    z:0,
    r:2,
    c:1,
    placing:false,
    selectedHand:{index:0, iid:'rx-howard', id:'03'},
    baseStateHash:firstTribute.canonicalHash,
    postState:firstTribute.canonicalState,
    stateHash:firstTribute.canonicalHash
  }), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:havanoInitiatorReactionCatalog});
  assert.strictEqual(secondTribute.ok, true, secondTribute.reason);
  const pending = reduceServerAction({canonicalState:secondTribute.canonicalState, canonicalHash:secondTribute.canonicalHash}, msg('CLICK_CELL', {
    playerIndex:0,
    turn:1,
    z:0,
    r:2,
    c:0,
    placing:false,
    selectedHand:{index:0, iid:'rx-howard', id:'03'},
    baseStateHash:secondTribute.canonicalHash,
    postState:secondTribute.canonicalState,
    stateHash:secondTribute.canonicalHash
  }), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:havanoInitiatorReactionCatalog});
  assert.strictEqual(pending.ok, true, pending.reason);
  assert.strictEqual(pending.canonicalState._serverPendingReaction.kind, 'initiatorWhenSet');
  const havanoOption = pending.canonicalState._serverPendingReaction.options.find(option=>option.kind === 'havano');
  assert.ok(havanoOption, 'expected Havano reaction option for Initiator targeting effect');
  assert.ok(havanoOption.deploymentOptions.length > 0, 'expected Havano Initiator deployment options');
  return pending;
}
const havanoInitiatorPending = runHavanoInitiatorReactionToPending();
const havanoInitiatorDeclined = reduceServerAction({canonicalState:havanoInitiatorPending.canonicalState, canonicalHash:havanoInitiatorPending.canonicalHash}, msg('REACTION_CHOICE', {
  playerIndex:1,
  promptId:havanoInitiatorPending.canonicalState._serverPendingReaction.promptId,
  choice:'decline',
  baseStateHash:havanoInitiatorPending.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:havanoInitiatorReactionCatalog});
assert.strictEqual(havanoInitiatorDeclined.ok, true, havanoInitiatorDeclined.reason);
assert.strictEqual(havanoInitiatorDeclined.canonicalState._serverPendingReaction, null);
assert.strictEqual(havanoInitiatorDeclined.canonicalState._serverPendingZonePick.kind, 'howardFateDouble');

const havanoInitiatorPendingForNegate = runHavanoInitiatorReactionToPending();
const havanoInitiatorOptionIndex = havanoInitiatorPendingForNegate.canonicalState._serverPendingReaction.options.findIndex(option=>option.kind === 'havano');
const havanoInitiatorOption = havanoInitiatorPendingForNegate.canonicalState._serverPendingReaction.options[havanoInitiatorOptionIndex];
const havanoInitiatorDeployTarget = havanoInitiatorOption.deploymentOptions[0];
const havanoInitiatorNegated = reduceServerAction({canonicalState:havanoInitiatorPendingForNegate.canonicalState, canonicalHash:havanoInitiatorPendingForNegate.canonicalHash}, msg('REACTION_CHOICE', {
  playerIndex:1,
  promptId:havanoInitiatorPendingForNegate.canonicalState._serverPendingReaction.promptId,
  choice:'negate',
  optionIndex:havanoInitiatorOptionIndex,
  reaction:{kind:'havano', card:{iid:'rx-havano-init', id:'79'}},
  deployment:havanoInitiatorDeployTarget,
  baseStateHash:havanoInitiatorPendingForNegate.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:havanoInitiatorReactionCatalog});
assert.strictEqual(havanoInitiatorNegated.ok, true, havanoInitiatorNegated.reason);
assert.strictEqual(havanoInitiatorNegated.canonicalState._serverPendingReaction, null);
assert.strictEqual(havanoInitiatorNegated.canonicalState._serverPendingZonePick, undefined);
assert.strictEqual(havanoInitiatorNegated.canonicalState.players[1].hand.length, 0);
assert.strictEqual(havanoInitiatorNegated.canonicalState.board[havanoInitiatorDeployTarget.z][havanoInitiatorDeployTarget.r][havanoInitiatorDeployTarget.c].iid, 'rx-havano-init');
assert.strictEqual(havanoInitiatorNegated.canonicalState.board[0][2][0]._effectNegatedByReaction, true);

const serverReactionCatalog = {byId:new Map([
  ['32', {id:'32', type:'Supporter', effect:'Draw 1 card.', aff:'expanded_worlds'}],
  ['26', {id:'26', type:'Supporter', effect:'When set, reveal your opponent hand.', aff:'reality'}],
  ['60', {id:'60', type:'Supporter', effect:'Search deck for a Supporter.', aff:'third_great_war'}],
  ['56', {id:'56', type:'Improvisor', cost:2, effect:'Whenever your opponent would activate a Supporter effect, you can negate it.', aff:'expanded_worlds'}],
  ['67', {id:'67', type:'Improvisor', cost:1, effect:'Once, when your opponent would activate a character Initiator effect or a Supporter when-set effect, negate it.', aff:'reality'}],
  ['201', {id:'201', type:'Supporter', fate:1}],
  ['301', {id:'301', type:'Character', fate:1}]
])};

const globallySuppressedSupporterPlacementBase = state({
  players:[
    {name:'Host', color:'', deck:[{id:'301', iid:'suppressed-draw-card', name:'Drawn Card', type:'Character', fate:1}], hand:[{id:'32', iid:'suppressed-draw-supporter', name:'Drawing Supporter', type:'Supporter', fate:1, aff:'expanded_worlds'}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  currentPlayer:0,
  turn:1,
  selectedHandCard:0,
  placing:true,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  supportersSetP:[0, 0],
  oppSuppressedNextTurn:true,
  suppressTarget:0
});
const globallySuppressedSupporterPlacementHash = canonicalStateHash(globallySuppressedSupporterPlacementBase);
const globallySuppressedSupporterPlaced = reduceServerAction({canonicalState:globallySuppressedSupporterPlacementBase, canonicalHash:globallySuppressedSupporterPlacementHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'suppressed-draw-supporter', id:'32'},
  baseStateHash:globallySuppressedSupporterPlacementHash,
  postState:globallySuppressedSupporterPlacementBase,
  stateHash:globallySuppressedSupporterPlacementHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:serverReactionCatalog});
assert.strictEqual(globallySuppressedSupporterPlaced.ok, true, globallySuppressedSupporterPlaced.reason);
assert.strictEqual(globallySuppressedSupporterPlaced.canonicalState._serverPendingReaction, undefined);
assert.strictEqual(globallySuppressedSupporterPlaced.canonicalState._serverPendingCardPick, undefined);
assert.strictEqual(globallySuppressedSupporterPlaced.canonicalState.players[0].hand.length, 0);
assert.strictEqual(globallySuppressedSupporterPlaced.canonicalState.players[0].deck.length, 1);
assert.strictEqual(globallySuppressedSupporterPlaced.canonicalState.board[0][2][0]._effectSuppressedOnSet, true);

const globallySuppressedSearchPlacementBase = state({
  players:[
    {name:'Host', color:'', deck:[{id:'201', iid:'suppressed-search-target', name:'Searchable Supporter', type:'Supporter', fate:1}], hand:[{id:'60', iid:'suppressed-search-supporter', name:'IB Student', type:'Supporter', fate:1, aff:'third_great_war'}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  currentPlayer:0,
  turn:1,
  selectedHandCard:0,
  placing:true,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  supportersSetP:[0, 0],
  oppSuppressedNextTurn:true,
  suppressTarget:0
});
const globallySuppressedSearchPlacementHash = canonicalStateHash(globallySuppressedSearchPlacementBase);
const globallySuppressedSearchPlaced = reduceServerAction({canonicalState:globallySuppressedSearchPlacementBase, canonicalHash:globallySuppressedSearchPlacementHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'suppressed-search-supporter', id:'60'},
  baseStateHash:globallySuppressedSearchPlacementHash,
  postState:globallySuppressedSearchPlacementBase,
  stateHash:globallySuppressedSearchPlacementHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:serverReactionCatalog});
assert.strictEqual(globallySuppressedSearchPlaced.ok, true, globallySuppressedSearchPlaced.reason);
assert.strictEqual(globallySuppressedSearchPlaced.canonicalState._serverPendingCardPick, undefined);
assert.strictEqual(globallySuppressedSearchPlaced.canonicalState.players[0].deck.length, 1);
assert.strictEqual(globallySuppressedSearchPlaced.canonicalState.board[0][2][0]._effectSuppressedOnSet, true);

const globallySuppressedDeferredBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[{id:'301', iid:'deferred-hidden-card', name:'Hidden Card', type:'Character', fate:1}], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'26', iid:'deferred-suppressed-supporter', name:'UCPD', type:'Supporter', fate:1, currentFate:1, owner:0, _pendingWhenSetEffect:{owner:0, z:0, r:2, c:0, turnQueued:1}}]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  currentPlayer:0,
  turn:1,
  oppSuppressedNextTurn:true,
  suppressTarget:0
});
const globallySuppressedDeferredHash = canonicalStateHash(globallySuppressedDeferredBase);
const globallySuppressedDeferredActivated = reduceServerAction({canonicalState:globallySuppressedDeferredBase, canonicalHash:globallySuppressedDeferredHash}, msg('BOARD_ACTION', {
  fn:'activatePendingWhenSetEffect',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  card:{id:'26', iid:'deferred-suppressed-supporter'},
  baseStateHash:globallySuppressedDeferredHash,
  postState:globallySuppressedDeferredBase,
  stateHash:globallySuppressedDeferredHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:serverReactionCatalog});
assert.strictEqual(globallySuppressedDeferredActivated.ok, true, globallySuppressedDeferredActivated.reason);
assert.strictEqual(globallySuppressedDeferredActivated.canonicalState._revealedCards, undefined);
assert.strictEqual(globallySuppressedDeferredActivated.canonicalState.board[0][2][0]._pendingWhenSetEffect, undefined);
assert.strictEqual(globallySuppressedDeferredActivated.canonicalState.board[0][2][0]._effectSuppressedOnSet, true);

const lydiaReactionBase = state({
  players:[
    {name:'Host', color:'', deck:[{id:'301', iid:'rx-draw-card', name:'Drawn Card', type:'Character', fate:1}], hand:[{id:'32', iid:'rx-supporter', name:'Drawing Supporter', type:'Supporter', fate:1, aff:'expanded_worlds'}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[{id:'56', iid:'rx-lydia', name:'Lydia', type:'Improvisor', owner:1, currentFate:7, usesLeft:5}], [null,null,null], [null,null,null]],
    [[null,null,null], [null,null,null], [null,null,null]],
    [[null,null,null], [null,null,null], [null,null,null]]
  ],
  phase:'main',
  currentPlayer:0,
  turn:1,
  selectedHandCard:0,
  placing:true,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  supportersSetP:[0, 0]
});
const lydiaReactionHash = canonicalStateHash(lydiaReactionBase);
const lydiaReactionPending = reduceServerAction({canonicalState:lydiaReactionBase, canonicalHash:lydiaReactionHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'rx-supporter', id:'32'},
  baseStateHash:lydiaReactionHash,
  postState:lydiaReactionBase,
  stateHash:lydiaReactionHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:serverReactionCatalog});
assert.strictEqual(lydiaReactionPending.ok, true, lydiaReactionPending.reason);
assert.strictEqual(lydiaReactionPending.canonicalState._serverPendingReaction.kind, 'supporterWhenSet');
assert.strictEqual(lydiaReactionPending.canonicalState._serverPendingReaction.playerIndex, 1);
assert.strictEqual(lydiaReactionPending.canonicalState._serverPendingReaction.options[0].kind, 'lydia');
assert.strictEqual(lydiaReactionPending.canonicalState.players[0].hand.length, 0);
assert.strictEqual(lydiaReactionPending.canonicalState.players[0].deck.length, 1);
const reactionBlockedEnd = reduceServerAction({canonicalState:lydiaReactionPending.canonicalState, canonicalHash:lydiaReactionPending.canonicalHash}, msg('END_TURN', {
  playerIndex:0,
  turn:1,
  baseStateHash:lydiaReactionPending.canonicalHash,
  postState:lydiaReactionPending.canonicalState,
  stateHash:lydiaReactionPending.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:serverReactionCatalog});
assert.strictEqual(reactionBlockedEnd.ok, false);
assert.match(reactionBlockedEnd.reason, /END_TURN blocked by pendingInteraction=supporterWhenSet promptId=rx:/);
const reactionMissingPromptRejected = reduceServerAction({canonicalState:lydiaReactionPending.canonicalState, canonicalHash:lydiaReactionPending.canonicalHash}, msg('REACTION_CHOICE', {
  playerIndex:1,
  omitPromptIdForTest:true,
  choice:'decline',
  baseStateHash:lydiaReactionPending.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:serverReactionCatalog});
assert.strictEqual(reactionMissingPromptRejected.ok, false);
assert.match(reactionMissingPromptRejected.reason, /promptId is required/);
const reactionWrongPromptRejected = reduceServerAction({canonicalState:lydiaReactionPending.canonicalState, canonicalHash:lydiaReactionPending.canonicalHash}, msg('REACTION_CHOICE', {
  playerIndex:1,
  promptId:'rx:stale-prompt',
  choice:'decline',
  baseStateHash:lydiaReactionPending.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:serverReactionCatalog});
assert.strictEqual(reactionWrongPromptRejected.ok, false);
assert.match(reactionWrongPromptRejected.reason, /prompt mismatch/);
const lydiaReactionDeclined = reduceServerAction({canonicalState:lydiaReactionPending.canonicalState, canonicalHash:lydiaReactionPending.canonicalHash}, msg('REACTION_CHOICE', {
  playerIndex:1,
  promptId:lydiaReactionPending.canonicalState._serverPendingReaction.promptId,
  choice:'decline',
  baseStateHash:lydiaReactionPending.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:serverReactionCatalog});
assert.strictEqual(lydiaReactionDeclined.ok, true, lydiaReactionDeclined.reason);
assert.strictEqual(lydiaReactionDeclined.canonicalState._serverPendingReaction, null);
assert.strictEqual(lydiaReactionDeclined.canonicalState.players[0].hand[0].iid, 'rx-draw-card');
assert.strictEqual(lydiaReactionDeclined.canonicalState.board[0][0][0].usesLeft, 5);

const lydiaReactionNegated = reduceServerAction({canonicalState:lydiaReactionPending.canonicalState, canonicalHash:lydiaReactionPending.canonicalHash}, msg('REACTION_CHOICE', {
  playerIndex:1,
  promptId:lydiaReactionPending.canonicalState._serverPendingReaction.promptId,
  choice:'negate',
  reaction:{kind:'lydia', z:0, r:0, c:0, card:{iid:'rx-lydia', id:'56'}},
  baseStateHash:lydiaReactionPending.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:serverReactionCatalog});
assert.strictEqual(lydiaReactionNegated.ok, true, lydiaReactionNegated.reason);
assert.strictEqual(lydiaReactionNegated.canonicalState._serverPendingReaction, null);
assert.strictEqual(lydiaReactionNegated.canonicalState.players[0].hand.length, 0);
assert.strictEqual(lydiaReactionNegated.canonicalState.players[0].deck.length, 1);
assert.strictEqual(lydiaReactionNegated.canonicalState.board[0][0][0].usesLeft, 4);
assert.strictEqual(lydiaReactionNegated.canonicalState.board[0][2][0]._lydiaSuppressed, true);

const seculesReactionBase = state({
  players:[
    {name:'Host', color:'', deck:[{id:'301', iid:'secules-draw-card', name:'Drawn Card', type:'Character', fate:1}], hand:[{id:'32', iid:'secules-supporter', name:'Drawing Supporter', type:'Supporter', fate:1, aff:'expanded_worlds'}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[{id:'67', iid:'rx-secules', name:'Mr. Secules', type:'Improvisor', owner:1, currentFate:4, usesLeft:1}], [null,null,null], [null,null,null]],
    [[null,null,null], [null,null,null], [null,null,null]],
    [[null,null,null], [null,null,null], [null,null,null]]
  ],
  phase:'main',
  currentPlayer:0,
  turn:1,
  selectedHandCard:0,
  placing:true,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  supportersSetP:[0, 0]
});
const seculesReactionHash = canonicalStateHash(seculesReactionBase);
const seculesReactionPending = reduceServerAction({canonicalState:seculesReactionBase, canonicalHash:seculesReactionHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'secules-supporter', id:'32'},
  baseStateHash:seculesReactionHash,
  postState:seculesReactionBase,
  stateHash:seculesReactionHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:serverReactionCatalog});
assert.strictEqual(seculesReactionPending.ok, true, seculesReactionPending.reason);
assert.strictEqual(seculesReactionPending.canonicalState._serverPendingReaction.options[0].kind, 'secules');
const seculesReactionNegated = reduceServerAction({canonicalState:seculesReactionPending.canonicalState, canonicalHash:seculesReactionPending.canonicalHash}, msg('REACTION_CHOICE', {
  playerIndex:1,
  promptId:seculesReactionPending.canonicalState._serverPendingReaction.promptId,
  choice:'negate',
  reaction:{kind:'secules', z:0, r:0, c:0, card:{iid:'rx-secules', id:'67'}},
  baseStateHash:seculesReactionPending.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:serverReactionCatalog});
assert.strictEqual(seculesReactionNegated.ok, true, seculesReactionNegated.reason);
assert.strictEqual(seculesReactionNegated.canonicalState.players[0].hand.length, 0);
assert.strictEqual(seculesReactionNegated.canonicalState.players[0].deck.length, 1);
assert.strictEqual(seculesReactionNegated.canonicalState.board[0][0][0].usesLeft, 0);
assert.strictEqual(seculesReactionNegated.canonicalState.board[0][0][0]._seculesUsed, true);
assert.strictEqual(seculesReactionNegated.canonicalState.board[0][2][0]._reactionSuppressed, true);

const initiatorReactionCatalog = {byId:new Map([
  ['27', {id:'27', type:'Initiator', cost:1, effect:'Draw 3 cards.', aff:'eventide'}],
  ['67', {id:'67', type:'Improvisor', cost:1, effect:'Once, when your opponent would activate a character Initiator effect or a Supporter when-set effect, negate it.', aff:'reality'}],
  ['302', {id:'302', type:'Supporter', fate:1}],
  ['401', {id:'401', type:'Character', fate:1}],
  ['402', {id:'402', type:'Character', fate:1}],
  ['403', {id:'403', type:'Character', fate:1}]
])};
function kazumiSeculesReactionBase(){
  return state({
    players:[
      {
        name:'Host',
        color:'',
        deck:[
          {id:'401', iid:'kazumi-draw-a', name:'Draw A', type:'Character', fate:1},
          {id:'402', iid:'kazumi-draw-b', name:'Draw B', type:'Character', fate:1},
          {id:'403', iid:'kazumi-draw-c', name:'Draw C', type:'Character', fate:1}
        ],
        hand:[{id:'27', iid:'rx-kazumi', name:'Kazumi', type:'Initiator', fate:1, cost:1, aff:'eventide'}],
        discard:[]
      },
      {name:'Guest', color:'', deck:[], hand:[], discard:[]}
    ],
    board:[
      [[{id:'67', iid:'rx-secules-init', name:'Mr. Secules', type:'Improvisor', owner:1, currentFate:4, usesLeft:1}], [null,null,null], [{id:'302', iid:'kazumi-tribute', name:'Tribute Supporter', type:'Supporter', owner:0, currentFate:1}, null, null]],
      [[null,null,null], [null,null,null], [null,null,null]],
      [[null,null,null], [null,null,null], [null,null,null]]
    ],
    phase:'main',
    currentPlayer:0,
    turn:1,
    selectedHandCard:0,
    placing:false
  });
}
function runKazumiSeculesReactionToPending(){
  const base = kazumiSeculesReactionBase();
  const baseHash = canonicalStateHash(base);
  const ready = reduceServerAction({canonicalState:base, canonicalHash:baseHash}, msg('START_CONSOLIDATE', {
    playerIndex:0,
    turn:1,
    selectedHand:{index:0, iid:'rx-kazumi', id:'27'},
    baseStateHash:baseHash,
    postState:base,
    stateHash:baseHash
  }), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:initiatorReactionCatalog});
  assert.strictEqual(ready.ok, true, ready.reason);
  const selected = reduceServerAction({canonicalState:ready.canonicalState, canonicalHash:ready.canonicalHash}, msg('CLICK_CELL', {
    playerIndex:0,
    turn:1,
    z:0,
    r:2,
    c:0,
    placing:false,
    selectedHand:{index:0, iid:'rx-kazumi', id:'27'},
    baseStateHash:ready.canonicalHash,
    postState:ready.canonicalState,
    stateHash:ready.canonicalHash
  }), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:initiatorReactionCatalog});
  assert.strictEqual(selected.ok, true, selected.reason);
  const pending = reduceServerAction({canonicalState:selected.canonicalState, canonicalHash:selected.canonicalHash}, msg('CLICK_CELL', {
    playerIndex:0,
    turn:1,
    z:0,
    r:2,
    c:0,
    placing:false,
    selectedHand:{index:0, iid:'rx-kazumi', id:'27'},
    baseStateHash:selected.canonicalHash,
    postState:selected.canonicalState,
    stateHash:selected.canonicalHash
  }), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:initiatorReactionCatalog});
  assert.strictEqual(pending.ok, true, pending.reason);
  assert.strictEqual(pending.canonicalState.board[0][2][0].iid, 'rx-kazumi');
  assert.strictEqual(pending.canonicalState._serverPendingReaction.kind, 'initiatorWhenSet');
  assert.strictEqual(pending.canonicalState._serverPendingReaction.playerIndex, 1);
  assert.strictEqual(pending.canonicalState._serverPendingReaction.options.length, 1);
  assert.strictEqual(pending.canonicalState._serverPendingReaction.options[0].kind, 'secules');
  assert.strictEqual(pending.canonicalState.players[0].deck.length, 3);
  return pending;
}
const kazumiSeculesPending = runKazumiSeculesReactionToPending();
const kazumiSeculesDeclined = reduceServerAction({canonicalState:kazumiSeculesPending.canonicalState, canonicalHash:kazumiSeculesPending.canonicalHash}, msg('REACTION_CHOICE', {
  playerIndex:1,
  promptId:kazumiSeculesPending.canonicalState._serverPendingReaction.promptId,
  choice:'decline',
  baseStateHash:kazumiSeculesPending.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:initiatorReactionCatalog});
assert.strictEqual(kazumiSeculesDeclined.ok, true, kazumiSeculesDeclined.reason);
assert.strictEqual(kazumiSeculesDeclined.canonicalState._serverPendingReaction, null);
assert.strictEqual(kazumiSeculesDeclined.canonicalState.players[0].deck.length, 0);
assert.strictEqual(kazumiSeculesDeclined.canonicalState.players[0].hand.length, 3);
assert.strictEqual(kazumiSeculesDeclined.canonicalState.board[0][0][0].usesLeft, 1);

const kazumiSeculesPendingForNegate = runKazumiSeculesReactionToPending();
const kazumiSeculesNegated = reduceServerAction({canonicalState:kazumiSeculesPendingForNegate.canonicalState, canonicalHash:kazumiSeculesPendingForNegate.canonicalHash}, msg('REACTION_CHOICE', {
  playerIndex:1,
  promptId:kazumiSeculesPendingForNegate.canonicalState._serverPendingReaction.promptId,
  choice:'negate',
  reaction:{kind:'secules', z:0, r:0, c:0, card:{iid:'rx-secules-init', id:'67'}},
  baseStateHash:kazumiSeculesPendingForNegate.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:initiatorReactionCatalog});
assert.strictEqual(kazumiSeculesNegated.ok, true, kazumiSeculesNegated.reason);
assert.strictEqual(kazumiSeculesNegated.canonicalState._serverPendingReaction, null);
assert.strictEqual(kazumiSeculesNegated.canonicalState.players[0].deck.length, 3);
assert.strictEqual(kazumiSeculesNegated.canonicalState.players[0].hand.length, 0);
assert.strictEqual(kazumiSeculesNegated.canonicalState.board[0][0][0].usesLeft, 0);
assert.strictEqual(kazumiSeculesNegated.canonicalState.board[0][0][0]._seculesUsed, true);
assert.strictEqual(kazumiSeculesNegated.canonicalState.board[0][2][0]._effectNegatedByReaction, true);

const santaAnnaBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'301', iid:'santa-discard', name:'Harbor Pledge', type:'Character', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[{id:'302', iid:'santa-target', name:'Port Guard', type:'Character', owner:0, fate:3, currentFate:3},null,null],[null,null,null],[null,null,null]],
    [[{id:'303', iid:'santa-enemy', name:'Enemy Guard', type:'Character', owner:1, fate:4, currentFate:4},null,null],[null,null,null],[null,null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  landscapeId:'igb16',
  phase:'main',
  currentPlayer:0,
  turn:1,
  selectedHandCard:0
});
const santaAnnaHash = canonicalStateHash(santaAnnaBase);
const santaAnnaNestedTarget = reduceServerAction({canonicalState:santaAnnaBase, canonicalHash:santaAnnaHash}, msg('HAND_ACTION', {
  fn:'activateSantaAnnaProsperityFromHand',
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'santa-discard', id:'301'},
  target:{z:0, r:0, c:0, card:{iid:'santa-target', id:'302', name:'Port Guard'}, playerIndex:0},
  baseStateHash:santaAnnaHash,
  postState:santaAnnaBase,
  stateHash:santaAnnaHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(santaAnnaNestedTarget.ok, true, santaAnnaNestedTarget.reason);
assert.strictEqual(santaAnnaNestedTarget.canonicalState.board[0][0][0].currentFate, 5);
const santaAnnaTargetMismatch = reduceServerAction({canonicalState:santaAnnaBase, canonicalHash:santaAnnaHash}, msg('HAND_ACTION', {
  fn:'activateSantaAnnaProsperityFromHand',
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'santa-discard', id:'301'},
  target:{z:0, r:0, c:0, card:{iid:'wrong-santa-target', id:'302', name:'Port Guard'}, playerIndex:0},
  baseStateHash:santaAnnaHash,
  postState:santaAnnaBase,
  stateHash:santaAnnaHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(santaAnnaTargetMismatch.ok, false);
assert.match(santaAnnaTargetMismatch.reason, /target identity mismatch/);
const santaAnnaActivated = reduceServerAction({canonicalState:santaAnnaBase, canonicalHash:santaAnnaHash}, msg('HAND_ACTION', {
  fn:'activateSantaAnnaProsperityFromHand',
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'santa-discard', id:'301'},
  target:{z:0, r:0, c:0, iid:'santa-target', playerIndex:0},
  baseStateHash:santaAnnaHash,
  postState:santaAnnaBase,
  stateHash:santaAnnaHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(santaAnnaActivated.ok, true, santaAnnaActivated.reason);
assert.strictEqual(santaAnnaActivated.canonicalState.players[0].hand.length, 0);
assert.strictEqual(santaAnnaActivated.canonicalState.players[0].discard[0].iid, 'santa-discard');
assert.strictEqual(santaAnnaActivated.canonicalState.board[0][0][0].currentFate, 5);
const santaAnnaEnemyRejected = reduceServerAction({canonicalState:santaAnnaBase, canonicalHash:santaAnnaHash}, msg('HAND_ACTION', {
  fn:'activateSantaAnnaProsperityFromHand',
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'santa-discard', id:'301'},
  target:{z:1, r:0, c:0, iid:'santa-enemy', playerIndex:0},
  baseStateHash:santaAnnaHash,
  postState:santaAnnaBase,
  stateHash:santaAnnaHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(santaAnnaEnemyRejected.ok, false);
assert.match(santaAnnaEnemyRejected.reason, /controlled by player/);
const santaAnnaInactiveBase = state(Object.assign({}, santaAnnaBase, {landscapeId:'igb1'}));
const santaAnnaInactiveHash = canonicalStateHash(santaAnnaInactiveBase);
const santaAnnaInactiveRejected = reduceServerAction({canonicalState:santaAnnaInactiveBase, canonicalHash:santaAnnaInactiveHash}, msg('HAND_ACTION', {
  fn:'activateSantaAnnaProsperityFromHand',
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'santa-discard', id:'301'},
  target:{z:0, r:0, c:0, iid:'santa-target', playerIndex:0},
  baseStateHash:santaAnnaInactiveHash,
  postState:santaAnnaInactiveBase,
  stateHash:santaAnnaInactiveHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(santaAnnaInactiveRejected.ok, false);
assert.match(santaAnnaInactiveRejected.reason, /landscape is not active/);

const wineCountryReturnBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[
      {id:'301', iid:'guest-return-target', name:'Guest Target', type:'Character', fate:2, currentFate:2},
      {id:'70', iid:'s-70-return', name:'Wine Country Guerilla', type:'Supporter', fate:1, guerilla_transferred:true, guerilla_turnsLeft:1, guerilla_owner:0}
    ], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  currentPlayer:0,
  turn:3
});
const wineCountryReturnHash = canonicalStateHash(wineCountryReturnBase);
const wineCountryReturned = reduceServerAction({canonicalState:wineCountryReturnBase, canonicalHash:wineCountryReturnHash}, msg('END_TURN', {
  playerIndex:0,
  turn:3,
  baseStateHash:wineCountryReturnHash,
  postState:wineCountryReturnBase,
  stateHash:wineCountryReturnHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(wineCountryReturned.ok, true, wineCountryReturned.reason);
assert.strictEqual(wineCountryReturned.canonicalState.players[1].hand.some(card=>card.iid === 's-70-return'), false);
assert.strictEqual(wineCountryReturned.canonicalState.players[0].discard[0].iid, 's-70-return');

const frenchFusiliersCatalog = {byId:new Map([
  ['37', {id:'37', type:'Supporter', effect:'When set, copy a while-on-field Supporter passive.', aff:'third_great_war'}],
  ['59', {id:'59', type:'Supporter', effect:'While this card is on the field, all Supporters you control in this card zone gain 1 Fate.', aff:'third_great_war'}],
  ['201', {id:'201', type:'Supporter', effect:'', aff:''}]
])};
const frenchFusiliersBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'37', iid:'s-37-place', name:'6th French Fusiliers', type:'Supporter', fate:1, aff:'third_great_war'}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,null,null],[
      {id:'59', iid:'french-maroon-source', name:'Maroon Knights', type:'Supporter', fate:1, currentFate:1, owner:0, aff:'third_great_war'},
      {id:'201', iid:'french-friendly-supporter', name:'Plain Supporter', type:'Supporter', fate:1, currentFate:1, owner:0},
      null
    ]],
    [[null,null,null],[null,null,null],[null,null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  phase:'main',
  currentPlayer:0,
  turn:1,
  maxTurns:1,
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:3
});
const frenchFusiliersHash = canonicalStateHash(frenchFusiliersBase);
const frenchFusiliersSet = reduceServerAction({canonicalState:frenchFusiliersBase, canonicalHash:frenchFusiliersHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-37-place', id:'37'},
  baseStateHash:frenchFusiliersHash,
  postState:frenchFusiliersBase,
  stateHash:frenchFusiliersHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:frenchFusiliersCatalog});
assert.strictEqual(frenchFusiliersSet.ok, true, frenchFusiliersSet.reason);
assert.strictEqual(frenchFusiliersSet.canonicalState._serverPendingZonePick.kind, 'frenchFusiliersCopyPassive');
const frenchFusiliersCopied = reduceServerAction({canonicalState:frenchFusiliersSet.canonicalState, canonicalHash:frenchFusiliersSet.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[{z:0, r:2, c:0, card:{iid:'french-maroon-source', id:'59'}}],
  baseStateHash:frenchFusiliersSet.canonicalHash,
  postState:frenchFusiliersSet.canonicalState,
  stateHash:frenchFusiliersSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:frenchFusiliersCatalog});
assert.strictEqual(frenchFusiliersCopied.ok, true, frenchFusiliersCopied.reason);
assert.strictEqual(frenchFusiliersCopied.canonicalState.board[0][2][2]._copiedPassiveId, '59');
const frenchFusiliersResult = reduceServerAction({canonicalState:frenchFusiliersCopied.canonicalState, canonicalHash:frenchFusiliersCopied.canonicalHash}, msg('MATCH_RESULT', {
  playerIndex:0,
  turn:1,
  baseStateHash:frenchFusiliersCopied.canonicalHash,
  postState:frenchFusiliersCopied.canonicalState,
  stateHash:frenchFusiliersCopied.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:frenchFusiliersCatalog});
assert.strictEqual(frenchFusiliersResult.ok, true, frenchFusiliersResult.reason);
assert.strictEqual(frenchFusiliersResult.matchResult.zones[0].s0, 9);

const specialPlacementBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'45', iid:'h-45', name:'Chingachlook', type:'Character', fate:3}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0
});
const specialHash = canonicalStateHash(specialPlacementBase);
const specialRejected = reduceServerAction({canonicalState:specialPlacementBase, canonicalHash:specialHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'h-45', id:'45'},
  baseStateHash:specialHash,
  postState:specialPlacementBase,
  stateHash:specialHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([['45', {id:'45', type:'Dauntless', effect:'Special', aff:'eventide'}]])}});
assert.strictEqual(specialRejected.ok, false);
assert.match(specialRejected.reason, /dedicated server reducer/);

const supporterBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'201', iid:'s-201', name:'Plain Supporter', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const supporterHash = canonicalStateHash(supporterBase);
const supporterArmed = reduceServerAction({canonicalState:supporterBase, canonicalHash:supporterHash}, msg('HAND_ACTION', {
  fn:'placeSelected',
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'s-201', id:'201'},
  baseStateHash:supporterHash,
  postState:supporterBase,
  stateHash:supporterHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([['201', {id:'201', type:'Supporter', effect:'', aff:''}]])}});
assert.strictEqual(supporterArmed.ok, true, supporterArmed.reason);
assert.strictEqual(supporterArmed.serverReduced, true);
assert.strictEqual(supporterArmed.canonicalState.selectedHandCard, 0);
assert.strictEqual(supporterArmed.canonicalState.placing, true);
const supporterArmedHash = supporterArmed.canonicalHash;
const supporterPlacement = reduceServerAction({canonicalState:supporterBase, canonicalHash:supporterHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:true,
  selectedHand:{index:0, iid:'s-201', id:'201'},
  baseStateHash:supporterHash,
  postState:supporterBase,
  stateHash:supporterHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([['201', {id:'201', type:'Supporter', effect:'', aff:''}]])}});
assert.strictEqual(supporterPlacement.ok, true, supporterPlacement.reason);
assert.strictEqual(supporterPlacement.canonicalState.players[0].hand.length, 0);
assert.strictEqual(supporterPlacement.canonicalState.board[0][2][1].type, 'Supporter');
assert.strictEqual(supporterPlacement.canonicalState.supportsPlacedThisTurn, 1);
assert.strictEqual(supporterPlacement.canonicalState.supportersSetP[0], 1);
const supporterPlacementAfterArming = reduceServerAction({canonicalState:supporterArmed.canonicalState, canonicalHash:supporterArmedHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:true,
  selectedHand:{index:0, iid:'s-201', id:'201'},
  baseStateHash:supporterArmedHash,
  postState:supporterArmed.canonicalState,
  stateHash:supporterArmedHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([['201', {id:'201', type:'Supporter', effect:'', aff:''}]])}});
assert.strictEqual(supporterPlacementAfterArming.ok, true, supporterPlacementAfterArming.reason);
assert.strictEqual(supporterPlacementAfterArming.canonicalState.players[0].hand.length, 0);
assert.strictEqual(supporterPlacementAfterArming.canonicalState.board[0][2][1].iid, 's-201');

const realSupporterCatalog = {byId:new Map([
  ['03', {id:'03', type:'Initiator', cost:0, effect:'Select one card in this zone; double its Fate.', aff:'reality'}],
  ['01', {id:'01', type:'Coordinator', cost:0, effect:'Adjacent friendly cards gain Fate.', aff:'third_great_war'}],
  ['02', {id:'02', type:'Initiator', cost:0, effect:'Create an extra safe row and later placements in this zone gain Fate.', aff:'eventide'}],
  ['04', {id:'04', type:'Initiator', cost:0, effect:'Select a square in this zone; opponent cannot consolidate there.', aff:'reality'}],
  ['05', {id:'05', type:'Supporter', effect:'When set, select a card in this zone. It gains 3 Fate.', aff:'third_great_war'}],
  ['06', {id:'06', type:'Initiator', cost:0, effect:'Search the deck for a non-Star card.', aff:'eventide'}],
  ['07', {id:'07', type:'Initiator', cost:0, effect:'Add up to 2 Supporters from deck/discard and set unlimited Supporters this turn.', aff:'third_great_war'}],
  ['08', {id:'08', type:'Initiator', cost:0, effect:'Search for any Reality card from deck or discard and set it at no cost.', aff:'reality'}],
  ['09', {id:'09', type:'Supporter', effect:'This card counts as 2 Reinforcement.', aff:'third_great_war'}],
  ['10', {id:'10', type:'Coordinator', cost:0, effect:'Opponent cards in this zone lose Fate.', aff:'expanded_worlds'}],
  ['11', {id:'11', type:'Coordinator', cost:0, effect:'Friendly Supporters in this zone gain Fate.', aff:'eventide'}],
  ['12', {id:'12', type:'Coordinator', cost:1, effect:'When set, select up to 2 friendly cards in this zone. They become immune.', aff:'expanded_worlds'}],
  ['13', {id:'13', type:'Initiator', cost:0, effect:'Search your deck for up to two Supporters.', aff:'third_great_war'}],
  ['16', {id:'16', type:'Supporter', effect:'When set, discard an opponent Supporter in this zone.', aff:'reality'}],
  ['17', {id:'17', type:'Initiator', cost:0, effect:'Select any open square on the field; that square cannot be used for the rest of the game.', aff:'expanded_worlds'}],
  ['18', {id:'18', type:'Supporter', effect:'When set, suppress opponent supporter effects next turn.', aff:'third_great_war'}],
  ['15', {id:'15', type:'Coordinator', cost:0, effect:'Friendly cards gain Fate for Coordinators in this zone.', aff:'third_great_war'}],
  ['19', {id:'19', type:'Coordinator', cost:0, effect:'Friendly Coordinators in this zone gain Fate.', aff:'third_great_war'}],
  ['20', {id:'20', type:'Supporter', effect:'Cards in this zone cannot lose Fate and cannot be moved.', aff:'eventide'}],
  ['21', {id:'21', type:'Dauntless', cost:0, effect:'When set, discard cards from hand to gain Fate.', aff:'third_great_war'}],
  ['22', {id:'22', type:'Initiator', cost:0, effect:'Adjacent cards grant extra Supporter placements this turn.', aff:'expanded_worlds'}],
  ['23', {id:'23', type:'Coordinator', cost:0, effect:'Friendly Characters in this zone gain Fate.', aff:'reality'}],
  ['25', {id:'25', type:'Supporter', effect:'When set, set another copy from hand or deck at no cost once a turn.', aff:'third_great_war'}],
  ['26', {id:'26', type:'Supporter', effect:'When set, reveal your opponent hand.', aff:'reality'}],
  ['27', {id:'27', type:'Initiator', effect:'Draw 3 cards.', aff:'eventide'}],
  ['28', {id:'28', type:'Supporter', effect:'This card is able to be set from the deck.', aff:'third_great_war'}],
  ['29', {id:'29', type:'Initiator', cost:1, effect:'Add up to two Third Great War cards from deck or discard to hand.', aff:'third_great_war'}],
  ['30', {id:'30', type:'Initiator', cost:0, effect:'Select opponent card in this zone and halve its Fate.', aff:'eventide'}],
  ['31', {id:'31', type:'Supporter', effect:'When set, select a card in this zone. It loses 3 Fate.', aff:'eventide'}],
  ['32', {id:'32', type:'Supporter', effect:'When set, draw 1 card.', aff:'reality'}],
  ['33', {id:'33', type:'Supporter', effect:'When set, the next character added to your hand gets a bonus.', aff:'eventide'}],
  ['34', {id:'34', type:'Coordinator', cost:0, effect:'Cards moved into this zone by effects gain Fate.', aff:'third_great_war'}],
  ['36', {id:'36', type:'Improvisor', cost:2, effect:'Whenever your opponent would Consolidate a card in this zone, reduce the zone total Fate by 3.', aff:'third_great_war'}],
  ['37', {id:'37', type:'Supporter', effect:'When set, copy a while-on-field Supporter passive.', aff:'third_great_war'}],
  ['42', {id:'42', type:'Supporter', effect:'When set, draw two cards then discard two cards.', aff:'third_great_war'}],
  ['38', {id:'38', type:'Dauntless', cost:0, effect:'Discard a Supporter from hand to gain Fate once per turn.', aff:'reality'}],
  ['41', {id:'41', type:'Dauntless', cost:0, effect:'Fate scales with opponent Fate reductions.', aff:'reality'}],
  ['40', {id:'40', type:'Improvisor', effect:'The next card you draw gains 4 Fate.', aff:'expanded_worlds'}],
  ['39', {id:'39', type:'Initiator', cost:0, effect:'Move opponent card to an open square in this zone.', aff:'expanded_worlds'}],
  ['43', {id:'43', type:'Initiator', cost:0, effect:'Add a new safe square underneath the safe zone.', aff:'reality'}],
  ['44', {id:'44', type:'Supporter', effect:'Adjacent friendly Dauntless and this card gain Fate.', aff:'third_great_war'}],
  ['46', {id:'46', type:'Dauntless', cost:3, fate:1, effect:'Gains 2 Fate each draw phase after being set.', aff:'reality'}],
  ['47', {id:'47', type:'Supporter', effect:'When used in Consolidation, that card gains 3 Fate permanently.', aff:'expanded_worlds'}],
  ['48', {id:'48', type:'Initiator', cost:1, effect:'Add Expanded Worlds from deck, then discard.', aff:'expanded_worlds'}],
  ['49', {id:'49', type:'Supporter', effect:'Characters in this zone can be used for consolidation.', aff:'reality'}],
  ['50', {id:'50', type:'Supporter', effect:'When set, select any zone to lock for your opponent.', aff:'reality'}],
  ['51', {id:'51', type:'Initiator', cost:0, effect:'Declare affiliation; matching characters you set gain 4 Fate for 3 turns.', aff:'eventide'}],
  ['55', {id:'55', type:'Dauntless', cost:0, effect:'Gains Fate if same-zone friendly cards share affiliation.', aff:'expanded_worlds'}],
  ['53', {id:'53', type:'Supporter', effect:'Opponent consolidations in this zone cannot use outside cards.', aff:'eventide'}],
  ['52', {id:'52', type:'Supporter', effect:'Once per turn, select one opponent card in this zone. That card has 0 Reinforcement.', aff:'eventide'}],
  ['54', {id:'54', type:'Supporter', effect:'When set, move a friendly character in this zone.', aff:'eventide'}],
  ['56', {id:'56', type:'Improvisor', effect:'Whenever your opponent would activate a Supporter effect, you can negate it.', aff:'expanded_worlds'}],
  ['57', {id:'57', type:'Coordinator', cost:0, effect:'Friendly Coordinator auras in this zone gain potency.', aff:'expanded_worlds'}],
  ['58', {id:'58', type:'Supporter', effect:'When set, add a Supporter from the discard to your hand.', aff:'reality'}],
  ['59', {id:'59', type:'Supporter', effect:'Friendly Supporters in this zone gain Fate.', aff:'third_great_war'}],
  ['60', {id:'60', type:'Supporter', effect:'When set, search your deck for a Supporter and add it to your hand.', aff:'reality'}],
  ['61', {id:'61', type:'Dauntless', cost:3, effect:'When set, select an opponent card and discard copies from hand/deck.', aff:'eventide'}],
  ['62', {id:'62', type:'Supporter', effect:'When set, move this card to an opponent safe square.', aff:'reality'}],
  ['63', {id:'63', type:'Supporter', effect:'This card gains 2 Fate for each copy in its zone.', aff:'third_great_war'}],
  ['64', {id:'64', type:'Supporter', effect:'Adjacent opponent card loses Fate and this card gains Fate.', aff:'eventide'}],
  ['65', {id:'65', type:'Supporter', contestedOnly:true, effect:'Can only be set in contested rows and becomes 4 Fate.', aff:'eventide'}],
  ['66', {id:'66', type:'Initiator', cost:0, effect:'Declare affiliation; change owned cards in this zone and gain Fate.', aff:'reality'}],
  ['67', {id:'67', type:'Improvisor', cost:1, effect:'Once, when your opponent would activate a character Initiator effect or a Supporter when-set effect, negate it.', aff:'reality'}],
  ['68', {id:'68', type:'Supporter', effect:'When set, add a non-Star Coordinator from deck to hand.', aff:'reality'}],
  ['69', {id:'69', type:'Supporter', effect:'When set, select any card you control in this zone; for next three turns, that card can move once a turn to any zone one zone away.', aff:'reality'}],
  ['70', {id:'70', type:'Supporter', effect:'When discarded from its own zone, infiltrate the opponent hand for five turns.', aff:'expanded_worlds'}],
  ['71', {id:'71', type:'Supporter', effect:'When set, reveal the next three opponent draw-phase draws.', aff:'expanded_worlds'}],
  ['72', {id:'72', type:'Supporter', effect:'When set, steal a random card from opponent hand.', aff:'expanded_worlds'}],
  ['73', {id:'73', type:'Supporter', effect:'When set, discard friendly Initiators/Improvisors in this zone and gain Fate.', aff:'expanded_worlds'}],
  ['74', {id:'74', type:'Supporter', effect:'When drawn or added to hand, gain an extra Supporter set this turn.', aff:'eventide'}],
  ['75', {id:'75', type:'Supporter', effect:'When set, copy a Supporter when-set effect on the board.', aff:'third_great_war'}],
  ['76', {id:'76', type:'Supporter', effect:'When set, this card gains 4 Fate and is immune.', aff:'expanded_worlds'}],
  ['77', {id:'77', type:'Coordinator', cost:0, effect:'When set, declare an affiliation. Matching owned cards in zone gain 3 Fate.', aff:'eventide'}],
  ['78', {id:'78', type:'Supporter', effect:'The next consolidation in this zone may be set face down.', aff:'expanded_worlds'}],
  ['79', {id:'79', type:'Supporter', effect:'While in hand, can negate an opponent targeting effect and set itself at no cost.', aff:'eventide'}],
  ['80', {id:'80', type:'Supporter', effect:'When set, discard a friendly character in this zone to draw 2.', aff:'expanded_worlds'}],
  ['83', {id:'83', type:'Initiator', cost:0, effect:'When set, friendly characters in this zone gain 2 Fate.', aff:'expanded_worlds'}],
  ['90', {id:'90', type:'Initiator', cost:0, effect:'When set, declare an affiliation and add two random matching cards from deck.', aff:'expanded_worlds'}],
  ['91', {id:'91', type:'Supporter', effect:'For the next five turns, your opponent cannot change the landscape.', aff:'expanded_worlds'}],
  ['94', {id:'94', type:'Supporter', effect:'When set, select a Triangle card in deck. It arrives in four turns.', aff:'expanded_worlds'}],
  ['14', {id:'14', type:'Dauntless', effect:'Discard adjacent opponent Supporters and gain Fate.', aff:'eventide'}],
  ['201', {id:'201', type:'Supporter', effect:'', aff:''}],
  ['202', {id:'202', type:'Supporter', effect:'', aff:''}],
  ['203', {id:'203', type:'Supporter', effect:'', aff:''}]
])};

const ledgerImmediateBase = state({
  players:[
    {
      name:'Host',
      color:'',
      deck:[{id:'301', iid:'ledger-draw-card', name:'Ledger Draw', type:'Character', fate:1}],
      hand:[{id:'75', iid:'s-75-draw-place', name:'Ledger-keepers', type:'Supporter', fate:1, aff:'third_great_war'}],
      discard:[]
    },
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,null,null],[null,null,null]],
    [[null,null,null],[null,null,null],[{id:'32', iid:'ledger-copy-32', name:'Draw Source', type:'Supporter', fate:1, currentFate:1, owner:0}, null, null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  phase:'main',
  currentPlayer:0,
  turn:1,
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2
});
const ledgerImmediateHash = canonicalStateHash(ledgerImmediateBase);
const ledgerImmediateSet = reduceServerAction({canonicalState:ledgerImmediateBase, canonicalHash:ledgerImmediateHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'s-75-draw-place', id:'75'},
  baseStateHash:ledgerImmediateHash,
  postState:ledgerImmediateBase,
  stateHash:ledgerImmediateHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(ledgerImmediateSet.ok, true, ledgerImmediateSet.reason);
assert.strictEqual(ledgerImmediateSet.canonicalState._serverPendingZonePick.kind, 'ledgerKeepersCopyWhenSet');
const ledgerImmediateCopied = reduceServerAction({canonicalState:ledgerImmediateSet.canonicalState, canonicalHash:ledgerImmediateSet.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[{z:1, r:2, c:0, card:{iid:'ledger-copy-32', id:'32'}}],
  baseStateHash:ledgerImmediateSet.canonicalHash,
  postState:ledgerImmediateSet.canonicalState,
  stateHash:ledgerImmediateSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(ledgerImmediateCopied.ok, true, ledgerImmediateCopied.reason);
assert.strictEqual(ledgerImmediateCopied.canonicalState.board[0][2][0].id, '75');
assert.strictEqual(ledgerImmediateCopied.canonicalState.board[0][2][0]._ledgerCopiedWhenSetId, '32');
assert.deepStrictEqual(ledgerImmediateCopied.canonicalState.players[0].hand.map(card=>card.iid), ['ledger-draw-card']);
assert.strictEqual(ledgerImmediateCopied.canonicalState._serverPendingZonePick, null);

const ledgerPendingBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'75', iid:'s-75-minae-place', name:'Ledger-keepers', type:'Supporter', fate:1, aff:'third_great_war'}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,null,null],[null, {id:'201', iid:'ledger-minae-target', name:'Guest Supporter', type:'Supporter', fate:1, currentFate:1, owner:1}, null]],
    [[null,null,null],[null,null,null],[
      {id:'16', iid:'ledger-copy-16', name:'MINAE Death Squad', type:'Supporter', fate:1, currentFate:1, owner:0, aff:'reality'},
      null,
      null
    ]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  phase:'main',
  currentPlayer:0,
  turn:1,
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2
});
const ledgerPendingHash = canonicalStateHash(ledgerPendingBase);
const ledgerPendingSet = reduceServerAction({canonicalState:ledgerPendingBase, canonicalHash:ledgerPendingHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'s-75-minae-place', id:'75'},
  baseStateHash:ledgerPendingHash,
  postState:ledgerPendingBase,
  stateHash:ledgerPendingHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(ledgerPendingSet.ok, true, ledgerPendingSet.reason);
const ledgerPendingCopied = reduceServerAction({canonicalState:ledgerPendingSet.canonicalState, canonicalHash:ledgerPendingSet.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[{z:1, r:2, c:0, card:{iid:'ledger-copy-16', id:'16'}}],
  baseStateHash:ledgerPendingSet.canonicalHash,
  postState:ledgerPendingSet.canonicalState,
  stateHash:ledgerPendingSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(ledgerPendingCopied.ok, true, ledgerPendingCopied.reason);
assert.strictEqual(ledgerPendingCopied.canonicalState.board[0][2][0].id, '75');
assert.strictEqual(ledgerPendingCopied.canonicalState._serverPendingZonePick.kind, 'minaeDiscardSupporter');
assert.strictEqual(ledgerPendingCopied.canonicalState._serverPendingZonePick.z, 0);
assert.strictEqual(ledgerPendingCopied.canonicalState._serverPendingZonePick.sourceZ, 0);
assert.strictEqual(ledgerPendingCopied.canonicalState._serverPendingZonePick.copiedSourceId, '16');
const ledgerMinaeResolved = reduceServerAction({canonicalState:ledgerPendingCopied.canonicalState, canonicalHash:ledgerPendingCopied.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[{z:0, r:2, c:1, card:{iid:'ledger-minae-target', id:'201'}}],
  baseStateHash:ledgerPendingCopied.canonicalHash,
  postState:ledgerPendingCopied.canonicalState,
  stateHash:ledgerPendingCopied.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(ledgerMinaeResolved.ok, true, ledgerMinaeResolved.reason);
assert.strictEqual(ledgerMinaeResolved.canonicalState.board[0][2][1], null);
assert.strictEqual(ledgerMinaeResolved.canonicalState.players[1].discard[0].iid, 'ledger-minae-target');

const realSupporterArmingBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'49', iid:'s-49-arm', name:'Irvine Businessman', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:false,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const realSupporterArmingHash = canonicalStateHash(realSupporterArmingBase);
const realSupporterArmed = reduceServerAction({canonicalState:realSupporterArmingBase, canonicalHash:realSupporterArmingHash}, msg('HAND_ACTION', {
  fn:'placeSelected',
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'s-49-arm', id:'49'},
  baseStateHash:realSupporterArmingHash,
  postState:realSupporterArmingBase,
  stateHash:realSupporterArmingHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(realSupporterArmed.ok, true, realSupporterArmed.reason);
assert.strictEqual(realSupporterArmed.canonicalState.placing, true);
const realSupporterArmedPlacement = reduceServerAction({canonicalState:realSupporterArmed.canonicalState, canonicalHash:realSupporterArmed.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-49-arm', id:'49'},
  baseStateHash:realSupporterArmed.canonicalHash,
  postState:realSupporterArmed.canonicalState,
  stateHash:realSupporterArmed.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(realSupporterArmedPlacement.ok, true, realSupporterArmedPlacement.reason);
assert.strictEqual(realSupporterArmedPlacement.canonicalState.board[0][2][2].iid, 's-49-arm');

const un5thPlacementBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'09', iid:'s-09-place', name:'United Nations 5th Army', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const un5thPlacementHash = canonicalStateHash(un5thPlacementBase);
const un5thPlacement = reduceServerAction({canonicalState:un5thPlacementBase, canonicalHash:un5thPlacementHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-09-place', id:'09'},
  baseStateHash:un5thPlacementHash,
  postState:un5thPlacementBase,
  stateHash:un5thPlacementHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(un5thPlacement.ok, true, un5thPlacement.reason);
assert.strictEqual(un5thPlacement.canonicalState.board[0][2][2].iid, 's-09-place');
assert.strictEqual(un5thPlacement.canonicalState.board[0][2][2].usesLeft, 3);

const greatOakPlacementBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'47', iid:'s-47-place', name:'Great Oak Infantry', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const greatOakPlacementHash = canonicalStateHash(greatOakPlacementBase);
const greatOakPlacement = reduceServerAction({canonicalState:greatOakPlacementBase, canonicalHash:greatOakPlacementHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-47-place', id:'47'},
  baseStateHash:greatOakPlacementHash,
  postState:greatOakPlacementBase,
  stateHash:greatOakPlacementHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(greatOakPlacement.ok, true, greatOakPlacement.reason);
assert.strictEqual(greatOakPlacement.canonicalState.board[0][2][2].iid, 's-47-place');
assert.strictEqual(greatOakPlacement.canonicalState.board[0][2][2]._greatOakBonus, true);

const artillerySetBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'50', iid:'s-50-place', name:'Berkeley CS Major', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const artillerySetHash = canonicalStateHash(artillerySetBase);
const artillerySet = reduceServerAction({canonicalState:artillerySetBase, canonicalHash:artillerySetHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-50-place', id:'50'},
  baseStateHash:artillerySetHash,
  postState:artillerySetBase,
  stateHash:artillerySetHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(artillerySet.ok, true, artillerySet.reason);
assert.strictEqual(artillerySet.canonicalState.board[0][2][2].iid, 's-50-place');
assert.strictEqual(artillerySet.canonicalState._serverPendingModalAction.kind, 'artilleryDistance');
assert.match(artillerySet.canonicalState._serverPendingModalAction.promptId, /^modal:artilleryDistance:/);
const artilleryWrongPrompt = reduceServerAction({canonicalState:artillerySet.canonicalState, canonicalHash:artillerySet.canonicalHash}, msg('MODAL_ACTION', {
  playerIndex:0,
  turn:1,
  promptId:'modal:stale',
  actionIndex:1,
  baseStateHash:artillerySet.canonicalHash,
  postState:artillerySet.canonicalState,
  stateHash:artillerySet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(artilleryWrongPrompt.ok, false);
assert.match(artilleryWrongPrompt.reason, /prompt mismatch/);
const artilleryMissingPrompt = reduceServerAction({canonicalState:artillerySet.canonicalState, canonicalHash:artillerySet.canonicalHash}, msg('MODAL_ACTION', {
  playerIndex:0,
  turn:1,
  omitPromptIdForTest:true,
  actionIndex:1,
  baseStateHash:artillerySet.canonicalHash,
  postState:artillerySet.canonicalState,
  stateHash:artillerySet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(artilleryMissingPrompt.ok, false);
assert.match(artilleryMissingPrompt.reason, /promptId is required/);
const artilleryModal = reduceServerAction({canonicalState:artillerySet.canonicalState, canonicalHash:artillerySet.canonicalHash}, msg('MODAL_ACTION', {
  playerIndex:0,
  turn:1,
  promptId:artillerySet.canonicalState._serverPendingModalAction.promptId,
  actionIndex:1,
  baseStateHash:artillerySet.canonicalHash,
  postState:artillerySet.canonicalState,
  stateHash:artillerySet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(artilleryModal.ok, true, artilleryModal.reason);
assert.strictEqual(artilleryModal.canonicalState._artilleryLockedZone, 1);
assert.strictEqual(artilleryModal.canonicalState._artilleryLockOwner, 1);
assert.strictEqual(artilleryModal.canonicalState._artilleryLockTurnsLeft, 2);
assert.strictEqual(artilleryModal.canonicalState._serverPendingModalAction, null);
const artilleryBadModal = reduceServerAction({canonicalState:artillerySet.canonicalState, canonicalHash:artillerySet.canonicalHash}, msg('MODAL_ACTION', {
  playerIndex:0,
  turn:1,
  promptId:artillerySet.canonicalState._serverPendingModalAction.promptId,
  actionIndex:3,
  baseStateHash:artillerySet.canonicalHash,
  postState:artillerySet.canonicalState,
  stateHash:artillerySet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(artilleryBadModal.ok, false);
assert.match(artilleryBadModal.reason, /zone choice/);

const vigilantesSetBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'52', iid:'s-52-place', name:'The Vigilantes', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,{id:'201', iid:'opp-supporter-target', name:'Opponent Supporter', type:'Supporter', owner:1, fate:1},null],[null,null,null]],
    [[null,null,null],[null,{id:'202', iid:'off-zone-supporter', name:'Off Zone Supporter', type:'Supporter', owner:1, fate:1},null],[null,null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const vigilantesSetHash = canonicalStateHash(vigilantesSetBase);
const vigilantesSet = reduceServerAction({canonicalState:vigilantesSetBase, canonicalHash:vigilantesSetHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-52-place', id:'52'},
  baseStateHash:vigilantesSetHash,
  postState:vigilantesSetBase,
  stateHash:vigilantesSetHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(vigilantesSet.ok, true, vigilantesSet.reason);
assert.strictEqual(vigilantesSet.canonicalState.board[0][2][2].iid, 's-52-place');
assert.strictEqual(vigilantesSet.canonicalState._serverPendingZonePick.kind, 'vigilantesMark');
const vigilantesMissingPromptRejected = reduceServerAction({canonicalState:vigilantesSet.canonicalState, canonicalHash:vigilantesSet.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  omitPromptIdForTest:true,
  selectedEntries:[{z:0, r:1, c:1, card:{iid:'opp-vigilantes-target', id:'16', name:'Target Supporter'}}],
  baseStateHash:vigilantesSet.canonicalHash,
  postState:vigilantesSet.canonicalState,
  stateHash:vigilantesSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(vigilantesMissingPromptRejected.ok, false);
assert.match(vigilantesMissingPromptRejected.reason, /promptId is required/);
const vigilantesEndRejected = reduceServerAction({canonicalState:vigilantesSet.canonicalState, canonicalHash:vigilantesSet.canonicalHash}, msg('END_TURN', {
  playerIndex:0,
  turn:1,
  baseStateHash:vigilantesSet.canonicalHash,
  postState:vigilantesSet.canonicalState,
  stateHash:vigilantesSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(vigilantesEndRejected.ok, false);
assert.match(vigilantesEndRejected.reason, /END_TURN blocked by pendingInteraction=vigilantesMark promptId=pickZone:/);
const vigilantesMissingIdentityRejected = reduceServerAction({canonicalState:vigilantesSet.canonicalState, canonicalHash:vigilantesSet.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[{z:0, r:1, c:1}],
  baseStateHash:vigilantesSet.canonicalHash,
  postState:vigilantesSet.canonicalState,
  stateHash:vigilantesSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(vigilantesMissingIdentityRejected.ok, false);
assert.match(vigilantesMissingIdentityRejected.reason, /card identity/);
const vigilantesFlatPick = reduceServerAction({canonicalState:vigilantesSet.canonicalState, canonicalHash:vigilantesSet.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[{z:0, r:1, c:1, iid:'opp-supporter-target', id:'201', name:'Opponent Supporter'}],
  baseStateHash:vigilantesSet.canonicalHash,
  postState:vigilantesSet.canonicalState,
  stateHash:vigilantesSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(vigilantesFlatPick.ok, true, vigilantesFlatPick.reason);
assert.strictEqual(vigilantesFlatPick.canonicalState.board[0][1][1]._markedForDeath, true);
const vigilantesPick = reduceServerAction({canonicalState:vigilantesSet.canonicalState, canonicalHash:vigilantesSet.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[{z:0, r:1, c:1, card:{iid:'opp-supporter-target', id:'201', name:'Opponent Supporter'}}],
  baseStateHash:vigilantesSet.canonicalHash,
  postState:vigilantesSet.canonicalState,
  stateHash:vigilantesSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(vigilantesPick.ok, true, vigilantesPick.reason);
assert.strictEqual(vigilantesPick.canonicalState.board[0][1][1]._markedForDeath, true);
assert.strictEqual(vigilantesPick.canonicalState.board[0][1][1]._reinforcementOverride, 0);
assert.strictEqual(vigilantesPick.canonicalState.board[0][2][2].effectUsedInitial, true);
assert.strictEqual(vigilantesPick.canonicalState._serverPendingZonePick, null);
const vigilantesCanonicalPick = reduceServerAction({canonicalState:vigilantesSet.canonicalState, canonicalHash:vigilantesSet.canonicalHash}, msg('RESOLVE_ZONE_PICK', {
  playerIndex:0,
  turn:1,
  selectedEntries:[{z:0, r:1, c:1, card:{iid:'opp-supporter-target', id:'201', name:'Opponent Supporter'}}],
  baseStateHash:vigilantesSet.canonicalHash,
  postState:vigilantesSet.canonicalState,
  stateHash:vigilantesSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(vigilantesCanonicalPick.ok, true, vigilantesCanonicalPick.reason);
assert.strictEqual(vigilantesCanonicalPick.canonicalState.board[0][1][1]._markedForDeath, true);
assert.strictEqual(vigilantesCanonicalPick.canonicalState._serverPendingZonePick, null);
const canonicalCardPickBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[], discard:[{id:'301', iid:'canonical-card-pick-discard', name:'Canonical Card Pick', type:'Character', fate:3, currentFate:3}]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  currentPlayer:0,
  turn:1,
  _serverPendingCardPick:{
    kind:'cardToHand',
    promptId:'pickCards:canonical-card-pick',
    reason:'canonicalCardPickSmoke',
    playerIndex:0,
    source:'discard',
    minCount:1,
    maxCount:1
  }
});
const canonicalCardPickHash = canonicalStateHash(canonicalCardPickBase);
const canonicalCardPick = reduceServerAction({canonicalState:canonicalCardPickBase, canonicalHash:canonicalCardPickHash}, msg('RESOLVE_CARD_PICK', {
  playerIndex:0,
  turn:1,
  selectedCards:[{source:'discard', index:0, id:'301', iid:'canonical-card-pick-discard'}],
  baseStateHash:canonicalCardPickHash,
  postState:canonicalCardPickBase,
  stateHash:canonicalCardPickHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(canonicalCardPick.ok, true, canonicalCardPick.reason);
assert.strictEqual(canonicalCardPick.canonicalState._serverPendingCardPick, null);
assert.strictEqual(canonicalCardPick.canonicalState.players[0].discard.length, 0);
assert.strictEqual(canonicalCardPick.canonicalState.players[0].hand[0].iid, 'canonical-card-pick-discard');
const vigilantesManualBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,{id:'38', iid:'vigilantes-mark-target', name:'Mark Target', type:'Dauntless', owner:1, fate:4, currentFate:4},null],[
      {id:'52', iid:'vigilantes-manual-source', name:'The Vigilantes', type:'Supporter', owner:0, fate:1, currentFate:1},
      {id:'05', iid:'vigilantes-friendly-supporter', name:'Friendly Supporter', type:'Supporter', owner:0, fate:1, currentFate:1},
      null
    ]],
    [[null,null,null],[null,null,null],[null,null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  phase:'main',
  currentPlayer:0,
  turn:1,
  placing:false
});
const vigilantesManualHash = canonicalStateHash(vigilantesManualBase);
const vigilantesSuppressedBase = state(JSON.parse(JSON.stringify(vigilantesManualBase)));
vigilantesSuppressedBase.board[0][2][0]._lydiaSuppressed = true;
const vigilantesSuppressedHash = canonicalStateHash(vigilantesSuppressedBase);
const vigilantesSuppressedRejected = reduceServerAction({canonicalState:vigilantesSuppressedBase, canonicalHash:vigilantesSuppressedHash}, msg('BOARD_ACTION', {
  fn:'activateVigilantes',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  baseStateHash:vigilantesSuppressedHash,
  postState:vigilantesSuppressedBase,
  stateHash:vigilantesSuppressedHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(vigilantesSuppressedRejected.ok, false);
assert.match(vigilantesSuppressedRejected.reason, /suppressed/);
const vigilantesWrongIidRejected = reduceServerAction({canonicalState:vigilantesManualBase, canonicalHash:vigilantesManualHash}, msg('BOARD_ACTION', {
  fn:'activateVigilantes',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  cardIid:'not-the-vigilantes-source',
  cardId:'52',
  baseStateHash:vigilantesManualHash,
  postState:vigilantesManualBase,
  stateHash:vigilantesManualHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(vigilantesWrongIidRejected.ok, false);
assert.match(vigilantesWrongIidRejected.reason, /source identity mismatch/);
const vigilantesManualArmed = reduceServerAction({canonicalState:vigilantesManualBase, canonicalHash:vigilantesManualHash}, msg('BOARD_ACTION', {
  fn:'activateVigilantes',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  baseStateHash:vigilantesManualHash,
  postState:vigilantesManualBase,
  stateHash:vigilantesManualHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(vigilantesManualArmed.ok, true, vigilantesManualArmed.reason);
assert.strictEqual(vigilantesManualArmed.canonicalState._serverPendingZonePick.kind, 'vigilantesMark');
const vigilantesManualMarked = reduceServerAction({canonicalState:vigilantesManualArmed.canonicalState, canonicalHash:vigilantesManualArmed.canonicalHash}, msg('RESOLVE_ZONE_PICK', {
  playerIndex:0,
  turn:1,
  selectedEntries:[{z:0, r:1, c:1, card:{iid:'vigilantes-mark-target', id:'38'}}],
  baseStateHash:vigilantesManualArmed.canonicalHash,
  postState:vigilantesManualArmed.canonicalState,
  stateHash:vigilantesManualArmed.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(vigilantesManualMarked.ok, true, vigilantesManualMarked.reason);
assert.strictEqual(vigilantesManualMarked.canonicalState.board[0][1][1]._markedForDeath, true);
assert.strictEqual(vigilantesManualMarked.canonicalState.board[0][1][1]._reinforcementOverride, 0);
assert.strictEqual(vigilantesManualMarked.canonicalState.board[0][2][0].vigilanteUsed, true);
assert.strictEqual(vigilantesManualMarked.canonicalState.board[0][2][1].iid, 'vigilantes-friendly-supporter');
const vigilantesOffZone = reduceServerAction({canonicalState:vigilantesSet.canonicalState, canonicalHash:vigilantesSet.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[{z:1, r:1, c:1, card:{iid:'off-zone-supporter', id:'202', name:'Off Zone Supporter'}}],
  baseStateHash:vigilantesSet.canonicalHash,
  postState:vigilantesSet.canonicalState,
  stateHash:vigilantesSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(vigilantesOffZone.ok, false);
assert.match(vigilantesOffZone.reason, /same zone/);
const wolfCreekSetBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'54', iid:'s-54-place', name:'Wolf Creek', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,null,null],[{id:'301', iid:'friendly-move-target', name:'Friendly Character', type:'Character', owner:0, fate:2, currentFate:2},null,null]],
    [[null,null,null],[null,null,null],[{id:'34', iid:'rozsi-dest', name:'Rozsi Szocs', type:'Coordinator', owner:0, fate:2, currentFate:2},null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const wolfCreekSetHash = canonicalStateHash(wolfCreekSetBase);
const wolfCreekSet = reduceServerAction({canonicalState:wolfCreekSetBase, canonicalHash:wolfCreekSetHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-54-place', id:'54'},
  baseStateHash:wolfCreekSetHash,
  postState:wolfCreekSetBase,
  stateHash:wolfCreekSetHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(wolfCreekSet.ok, true, wolfCreekSet.reason);
assert.strictEqual(wolfCreekSet.canonicalState.board[0][2][2].iid, 's-54-place');
assert.strictEqual(wolfCreekSet.canonicalState._serverPendingZonePick.kind, 'wolfCreekSelectMoveTarget');
const wolfCreekPick = reduceServerAction({canonicalState:wolfCreekSet.canonicalState, canonicalHash:wolfCreekSet.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[{z:0, r:2, c:0, card:{iid:'friendly-move-target', id:'301', name:'Friendly Character'}}],
  baseStateHash:wolfCreekSet.canonicalHash,
  postState:wolfCreekSet.canonicalState,
  stateHash:wolfCreekSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(wolfCreekPick.ok, true, wolfCreekPick.reason);
assert.strictEqual(wolfCreekPick.canonicalState._serverPendingZonePick, null);
assert.strictEqual(wolfCreekPick.canonicalState._serverPendingMove.kind, 'wolfCreekMove');
assert.strictEqual(wolfCreekPick.canonicalState._wolfCreekMoving.fromZ, 0);
const wolfCreekMoveEndRejected = reduceServerAction({canonicalState:wolfCreekPick.canonicalState, canonicalHash:wolfCreekPick.canonicalHash}, msg('END_TURN', {
  playerIndex:0,
  turn:1,
  baseStateHash:wolfCreekPick.canonicalHash,
  postState:wolfCreekPick.canonicalState,
  stateHash:wolfCreekPick.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(wolfCreekMoveEndRejected.ok, false);
assert.match(wolfCreekMoveEndRejected.reason, /END_TURN blocked by pendingInteraction=wolfCreekMove promptId=pickMove:/);
const wolfCreekMoveMissingPromptRejected = reduceServerAction({canonicalState:wolfCreekPick.canonicalState, canonicalHash:wolfCreekPick.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  omitPromptIdForTest:true,
  z:1,
  r:2,
  c:1,
  placing:false,
  baseStateHash:wolfCreekPick.canonicalHash,
  postState:wolfCreekPick.canonicalState,
  stateHash:wolfCreekPick.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(wolfCreekMoveMissingPromptRejected.ok, false);
assert.match(wolfCreekMoveMissingPromptRejected.reason, /promptId is required/);
const wolfCreekMoveWrongPromptRejected = reduceServerAction({canonicalState:wolfCreekPick.canonicalState, canonicalHash:wolfCreekPick.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  promptId:'pickMove:stale',
  z:1,
  r:2,
  c:1,
  placing:false,
  baseStateHash:wolfCreekPick.canonicalHash,
  postState:wolfCreekPick.canonicalState,
  stateHash:wolfCreekPick.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(wolfCreekMoveWrongPromptRejected.ok, false);
assert.match(wolfCreekMoveWrongPromptRejected.reason, /prompt mismatch/);
const wolfCreekCanonicalMove = reduceServerAction({canonicalState:wolfCreekPick.canonicalState, canonicalHash:wolfCreekPick.canonicalHash}, msg('SELECT_PENDING_MOVE_CELL', {
  playerIndex:0,
  turn:1,
  z:1,
  r:2,
  c:1,
  placing:false,
  baseStateHash:wolfCreekPick.canonicalHash,
  postState:wolfCreekPick.canonicalState,
  stateHash:wolfCreekPick.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(wolfCreekCanonicalMove.ok, true, wolfCreekCanonicalMove.reason);
assert.strictEqual(wolfCreekCanonicalMove.canonicalState.board[0][2][0], null);
assert.strictEqual(wolfCreekCanonicalMove.canonicalState.board[1][2][1].iid, 'friendly-move-target');
assert.strictEqual(wolfCreekCanonicalMove.canonicalState._serverPendingMove, null);
const wolfCreekMove = reduceServerAction({canonicalState:wolfCreekPick.canonicalState, canonicalHash:wolfCreekPick.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:1,
  r:2,
  c:1,
  placing:false,
  baseStateHash:wolfCreekPick.canonicalHash,
  postState:wolfCreekPick.canonicalState,
  stateHash:wolfCreekPick.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(wolfCreekMove.ok, true, wolfCreekMove.reason);
assert.strictEqual(wolfCreekMove.canonicalState.board[0][2][0], null);
assert.strictEqual(wolfCreekMove.canonicalState.board[1][2][1].iid, 'friendly-move-target');
assert.strictEqual(wolfCreekMove.canonicalState.board[1][2][1].currentFate, 4);
assert.strictEqual(wolfCreekMove.canonicalState.board[0][2][2].wolfCreekUsed, true);
assert.strictEqual(wolfCreekMove.canonicalState._serverPendingMove, null);
assert.strictEqual(wolfCreekMove.canonicalState._wolfCreekMoving, null);
const wolfCreekManualUsedRejected = reduceServerAction({canonicalState:wolfCreekMove.canonicalState, canonicalHash:wolfCreekMove.canonicalHash}, msg('BOARD_ACTION', {
  fn:'activateWolfCreek',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  baseStateHash:wolfCreekMove.canonicalHash,
  postState:wolfCreekMove.canonicalState,
  stateHash:wolfCreekMove.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(wolfCreekManualUsedRejected.ok, false);
assert.match(wolfCreekManualUsedRejected.reason, /already moved/);

const wolfCreekManualBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,null,null],[
      {id:'54', iid:'wolf-manual-source', name:'Wolf Creek', type:'Supporter', owner:0, fate:1, currentFate:1},
      {id:'302', iid:'wolf-manual-target', name:'Manual Character', type:'Character', owner:0, fate:2, currentFate:2},
      null
    ]],
    [[null,null,null],[null,null,null],[{id:'34', iid:'wolf-manual-rozsi', name:'Rozsi Szocs', type:'Coordinator', owner:0, fate:2, currentFate:2},null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  phase:'main',
  currentPlayer:0,
  turn:1,
  placing:false,
  selectedBoardCard:null
});
const wolfCreekManualHash = canonicalStateHash(wolfCreekManualBase);
const wolfCreekSuppressedBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,null,null],[
      {id:'54', iid:'wolf-suppressed-source', name:'Wolf Creek', type:'Supporter', owner:0, fate:1, currentFate:1, _reactionSuppressed:true},
      {id:'302', iid:'wolf-suppressed-target', name:'Manual Character', type:'Character', owner:0, fate:2, currentFate:2},
      null
    ]],
    [[null,null,null],[null,null,null],[null,null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  phase:'main',
  currentPlayer:0,
  turn:1
});
const wolfCreekSuppressedHash = canonicalStateHash(wolfCreekSuppressedBase);
const wolfCreekSuppressedRejected = reduceServerAction({canonicalState:wolfCreekSuppressedBase, canonicalHash:wolfCreekSuppressedHash}, msg('BOARD_ACTION', {
  fn:'activateWolfCreek',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  baseStateHash:wolfCreekSuppressedHash,
  postState:wolfCreekSuppressedBase,
  stateHash:wolfCreekSuppressedHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(wolfCreekSuppressedRejected.ok, false);
assert.match(wolfCreekSuppressedRejected.reason, /suppressed/);
const wolfCreekWrongIidRejected = reduceServerAction({canonicalState:wolfCreekManualBase, canonicalHash:wolfCreekManualHash}, msg('BOARD_ACTION', {
  fn:'activateWolfCreek',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  cardIid:'not-the-wolf-source',
  cardId:'54',
  baseStateHash:wolfCreekManualHash,
  postState:wolfCreekManualBase,
  stateHash:wolfCreekManualHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(wolfCreekWrongIidRejected.ok, false);
assert.match(wolfCreekWrongIidRejected.reason, /source identity mismatch/);
const wolfCreekManualArmed = reduceServerAction({canonicalState:wolfCreekManualBase, canonicalHash:wolfCreekManualHash}, msg('BOARD_ACTION', {
  fn:'activateWolfCreek',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  baseStateHash:wolfCreekManualHash,
  postState:wolfCreekManualBase,
  stateHash:wolfCreekManualHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(wolfCreekManualArmed.ok, true, wolfCreekManualArmed.reason);
assert.strictEqual(wolfCreekManualArmed.canonicalState._serverPendingZonePick.kind, 'wolfCreekSelectMoveTarget');
const wolfCreekManualPick = reduceServerAction({canonicalState:wolfCreekManualArmed.canonicalState, canonicalHash:wolfCreekManualArmed.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[{z:0, r:2, c:1, card:{iid:'wolf-manual-target', id:'302', name:'Manual Character'}}],
  baseStateHash:wolfCreekManualArmed.canonicalHash,
  postState:wolfCreekManualArmed.canonicalState,
  stateHash:wolfCreekManualArmed.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(wolfCreekManualPick.ok, true, wolfCreekManualPick.reason);
assert.strictEqual(wolfCreekManualPick.canonicalState._serverPendingMove.kind, 'wolfCreekMove');
const wolfCreekManualMove = reduceServerAction({canonicalState:wolfCreekManualPick.canonicalState, canonicalHash:wolfCreekManualPick.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:1,
  r:2,
  c:1,
  placing:false,
  baseStateHash:wolfCreekManualPick.canonicalHash,
  postState:wolfCreekManualPick.canonicalState,
  stateHash:wolfCreekManualPick.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(wolfCreekManualMove.ok, true, wolfCreekManualMove.reason);
assert.strictEqual(wolfCreekManualMove.canonicalState.board[0][2][1], null);
assert.strictEqual(wolfCreekManualMove.canonicalState.board[1][2][1].iid, 'wolf-manual-target');
assert.strictEqual(wolfCreekManualMove.canonicalState.board[1][2][1].currentFate, 4);
assert.strictEqual(wolfCreekManualMove.canonicalState.board[0][2][0].wolfCreekUsed, true);
assert.strictEqual(wolfCreekManualMove.canonicalState._serverPendingMove, null);

const liberatorsSetBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'05', iid:'s-05-place', name:'17th British Regiment', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,{id:'301', iid:'liberators-target', name:'Fate Target', type:'Character', owner:0, fate:2, currentFate:2},null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const liberatorsSetHash = canonicalStateHash(liberatorsSetBase);
const liberatorsSet = reduceServerAction({canonicalState:liberatorsSetBase, canonicalHash:liberatorsSetHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-05-place', id:'05'},
  baseStateHash:liberatorsSetHash,
  postState:liberatorsSetBase,
  stateHash:liberatorsSetHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(liberatorsSet.ok, true, liberatorsSet.reason);
assert.strictEqual(liberatorsSet.canonicalState._serverPendingZonePick.kind, 'liberatorsFateGain');
const liberatorsPick = reduceServerAction({canonicalState:liberatorsSet.canonicalState, canonicalHash:liberatorsSet.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[{z:0, r:1, c:1, card:{iid:'liberators-target', id:'301', name:'Fate Target'}}],
  baseStateHash:liberatorsSet.canonicalHash,
  postState:liberatorsSet.canonicalState,
  stateHash:liberatorsSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(liberatorsPick.ok, true, liberatorsPick.reason);
assert.strictEqual(liberatorsPick.canonicalState.board[0][1][1].currentFate, 5);
assert.strictEqual(liberatorsPick.canonicalState._serverPendingZonePick, null);

const makennaSetBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'12', iid:'c-12-place', name:'Makenna', type:'Coordinator', fate:2, cost:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,{id:'301', iid:'makenna-friendly-a', name:'Friendly A', type:'Character', owner:0, fate:2},{id:'302', iid:'makenna-opponent', name:'Opponent', type:'Character', owner:1, fate:2}],[{id:'201', iid:'makenna-tribute', name:'Makenna Tribute', type:'Supporter', owner:0, fate:1},null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:false,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const makennaSetHash = canonicalStateHash(makennaSetBase);
const makennaReady = reduceServerAction({canonicalState:makennaSetBase, canonicalHash:makennaSetHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'c-12-place', id:'12'},
  baseStateHash:makennaSetHash,
  postState:makennaSetBase,
  stateHash:makennaSetHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(makennaReady.ok, true, makennaReady.reason);
assert.strictEqual(makennaReady.canonicalState._consolidating.cost, 1);
const makennaTribute = reduceServerAction({canonicalState:makennaReady.canonicalState, canonicalHash:makennaReady.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'c-12-place', id:'12'},
  baseStateHash:makennaReady.canonicalHash,
  postState:makennaReady.canonicalState,
  stateHash:makennaReady.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(makennaTribute.ok, true, makennaTribute.reason);
const makennaSet = reduceServerAction({canonicalState:makennaTribute.canonicalState, canonicalHash:makennaTribute.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'c-12-place', id:'12'},
  baseStateHash:makennaTribute.canonicalHash,
  postState:makennaTribute.canonicalState,
  stateHash:makennaTribute.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(makennaSet.ok, true, makennaSet.reason);
assert.strictEqual(makennaSet.canonicalState.board[0][2][0].iid, 'c-12-place');
assert.strictEqual(makennaSet.canonicalState.players[0].discard[0].iid, 'makenna-tribute');
assert.strictEqual(makennaSet.canonicalState._serverPendingZonePick.kind, 'makennaImmune');
const makennaOpponentRejected = reduceServerAction({canonicalState:makennaSet.canonicalState, canonicalHash:makennaSet.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[{z:0, r:1, c:2, card:{iid:'makenna-opponent', id:'302', name:'Opponent'}}],
  baseStateHash:makennaSet.canonicalHash,
  postState:makennaSet.canonicalState,
  stateHash:makennaSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(makennaOpponentRejected.ok, false);
assert.match(makennaOpponentRejected.reason, /friendly/);
const makennaMissingIdentityRejected = reduceServerAction({canonicalState:makennaSet.canonicalState, canonicalHash:makennaSet.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[
    {z:0, r:1, c:1},
    {z:0, r:2, c:0, card:{iid:'c-12-place', id:'12', name:'Makenna'}}
  ],
  baseStateHash:makennaSet.canonicalHash,
  postState:makennaSet.canonicalState,
  stateHash:makennaSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(makennaMissingIdentityRejected.ok, false);
assert.match(makennaMissingIdentityRejected.reason, /card identity/);
const makennaPick = reduceServerAction({canonicalState:makennaSet.canonicalState, canonicalHash:makennaSet.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[
    {z:0, r:1, c:1, card:{iid:'makenna-friendly-a', id:'301', name:'Friendly A'}},
    {z:0, r:2, c:0, card:{iid:'c-12-place', id:'12', name:'Makenna'}}
  ],
  baseStateHash:makennaSet.canonicalHash,
  postState:makennaSet.canonicalState,
  stateHash:makennaSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(makennaPick.ok, true, makennaPick.reason);
assert.strictEqual(makennaPick.canonicalState.board[0][1][1].immuneFlag, true);
assert.strictEqual(makennaPick.canonicalState.board[0][2][0].immuneFlag, true);
assert.strictEqual(makennaPick.canonicalState._serverPendingZonePick, null);

const minaeSetBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'16', iid:'s-16-place', name:'MINAE Death Squad', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[{id:'301', iid:'minae-character', name:'Opponent Character', type:'Character', owner:1, fate:2},{id:'201', iid:'minae-supporter', name:'Opponent Supporter', type:'Supporter', owner:1, fate:1},null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const minaeSetHash = canonicalStateHash(minaeSetBase);
const minaeSet = reduceServerAction({canonicalState:minaeSetBase, canonicalHash:minaeSetHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-16-place', id:'16'},
  baseStateHash:minaeSetHash,
  postState:minaeSetBase,
  stateHash:minaeSetHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(minaeSet.ok, true, minaeSet.reason);
assert.strictEqual(minaeSet.canonicalState._serverPendingZonePick.kind, 'minaeDiscardSupporter');
const minaeCharacterRejected = reduceServerAction({canonicalState:minaeSet.canonicalState, canonicalHash:minaeSet.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[{z:0, r:1, c:0, card:{iid:'minae-character', id:'301', name:'Opponent Character'}}],
  baseStateHash:minaeSet.canonicalHash,
  postState:minaeSet.canonicalState,
  stateHash:minaeSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(minaeCharacterRejected.ok, false);
assert.match(minaeCharacterRejected.reason, /opponent Supporter/);
const minaePick = reduceServerAction({canonicalState:minaeSet.canonicalState, canonicalHash:minaeSet.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[{z:0, r:1, c:1, card:{iid:'minae-supporter', id:'201', name:'Opponent Supporter'}}],
  baseStateHash:minaeSet.canonicalHash,
  postState:minaeSet.canonicalState,
  stateHash:minaeSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(minaePick.ok, true, minaePick.reason);
assert.strictEqual(minaePick.canonicalState.board[0][1][1], null);
assert.strictEqual(minaePick.canonicalState.players[1].discard.length, 1);
assert.strictEqual(minaePick.canonicalState.players[1].discard[0].iid, 'minae-supporter');

const woundSetBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'31', iid:'s-31-place', name:'Oathbound Noble Fighter', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,{id:'301', iid:'wound-target', name:'Wound Target', type:'Character', owner:1, fate:3, currentFate:3},null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0],
  damageDoneP:[0,0]
});
const woundSetHash = canonicalStateHash(woundSetBase);
const woundSet = reduceServerAction({canonicalState:woundSetBase, canonicalHash:woundSetHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-31-place', id:'31'},
  baseStateHash:woundSetHash,
  postState:woundSetBase,
  stateHash:woundSetHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(woundSet.ok, true, woundSet.reason);
assert.strictEqual(woundSet.canonicalState._serverPendingZonePick.kind, 'hemorrhagingWound');
const woundPick = reduceServerAction({canonicalState:woundSet.canonicalState, canonicalHash:woundSet.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[{z:0, r:1, c:1, card:{iid:'wound-target', id:'301', name:'Wound Target'}}],
  baseStateHash:woundSet.canonicalHash,
  postState:woundSet.canonicalState,
  stateHash:woundSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(woundPick.ok, true, woundPick.reason);
assert.strictEqual(woundPick.canonicalState.board[0][1][1].currentFate, 0);
assert.strictEqual(woundPick.canonicalState.damageDoneP[0], 1);

const woundAnneBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'31', iid:'s-31-anne-place', name:'Oathbound Noble Fighter', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[
    [null,{id:'11', iid:'anne-oath-target', name:'Anne Stone', type:'Coordinator', owner:1, fate:6, currentFate:12},null],
    [null,{id:'10', iid:'pm-dylan-oath-aura', name:'Post-Modernist Dylan', type:'Coordinator', owner:0, fate:3, currentFate:3},null],
    [null,null,null]
  ], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0],
  damageDoneP:[0,0]
});
const woundAnneHash = canonicalStateHash(woundAnneBase);
const woundAnneSet = reduceServerAction({canonicalState:woundAnneBase, canonicalHash:woundAnneHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-31-anne-place', id:'31'},
  baseStateHash:woundAnneHash,
  postState:woundAnneBase,
  stateHash:woundAnneHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(woundAnneSet.ok, true, woundAnneSet.reason);
const woundAnnePick = reduceServerAction({canonicalState:woundAnneSet.canonicalState, canonicalHash:woundAnneSet.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[{z:0, r:0, c:1, card:{iid:'anne-oath-target', id:'11', name:'Anne Stone'}}],
  baseStateHash:woundAnneSet.canonicalHash,
  postState:woundAnneSet.canonicalState,
  stateHash:woundAnneSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(woundAnnePick.ok, true, woundAnnePick.reason);
assert.strictEqual(woundAnnePick.canonicalState.board[0][0][1].currentFate, 9);
assert.strictEqual(woundAnnePick.canonicalState.damageDoneP[0], 1);

const woundOwnBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'31', iid:'s-31-own-place', name:'Oathbound Noble Fighter', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,{id:'301', iid:'wound-own-target', name:'Own Wound Target', type:'Character', owner:0, fate:5, currentFate:5},null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0],
  damageDoneP:[0,0]
});
const woundOwnHash = canonicalStateHash(woundOwnBase);
const woundOwnSet = reduceServerAction({canonicalState:woundOwnBase, canonicalHash:woundOwnHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-31-own-place', id:'31'},
  baseStateHash:woundOwnHash,
  postState:woundOwnBase,
  stateHash:woundOwnHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(woundOwnSet.ok, true, woundOwnSet.reason);
const woundOwnPick = reduceServerAction({canonicalState:woundOwnSet.canonicalState, canonicalHash:woundOwnSet.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[{z:0, r:1, c:1, card:{iid:'wound-own-target', id:'301', name:'Own Wound Target'}}],
  baseStateHash:woundOwnSet.canonicalHash,
  postState:woundOwnSet.canonicalState,
  stateHash:woundOwnSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(woundOwnPick.ok, true, woundOwnPick.reason);
assert.strictEqual(woundOwnPick.canonicalState.board[0][1][1].currentFate, 2);

const woundShieldBase = state(Object.assign({}, woundSetBase, {
  shieldWallZones:[0]
}));
const woundShieldHash = canonicalStateHash(woundShieldBase);
const woundShieldSet = reduceServerAction({canonicalState:woundShieldBase, canonicalHash:woundShieldHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-31-place', id:'31'},
  baseStateHash:woundShieldHash,
  postState:woundShieldBase,
  stateHash:woundShieldHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(woundShieldSet.ok, true, woundShieldSet.reason);
const woundShieldRejected = reduceServerAction({canonicalState:woundShieldSet.canonicalState, canonicalHash:woundShieldSet.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[{z:0, r:1, c:1, card:{iid:'wound-target', id:'301', name:'Wound Target'}}],
  baseStateHash:woundShieldSet.canonicalHash,
  postState:woundShieldSet.canonicalState,
  stateHash:woundShieldSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(woundShieldRejected.ok, false);
assert.match(woundShieldRejected.reason, /Shield Wall/);

const suppressSetBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'18', iid:'s-18-place', name:'1st US Marines', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const suppressSetHash = canonicalStateHash(suppressSetBase);
const suppressSet = reduceServerAction({canonicalState:suppressSetBase, canonicalHash:suppressSetHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-18-place', id:'18'},
  baseStateHash:suppressSetHash,
  postState:suppressSetBase,
  stateHash:suppressSetHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(suppressSet.ok, true, suppressSet.reason);
assert.strictEqual(suppressSet.canonicalState.oppSuppressedNextTurn, true);
assert.strictEqual(suppressSet.canonicalState.suppressTarget, 1);
const suppressPassToTarget = reduceServerAction({canonicalState:suppressSet.canonicalState, canonicalHash:suppressSet.canonicalHash}, msg('END_TURN', {
  playerIndex:0,
  turn:1,
  baseStateHash:suppressSet.canonicalHash,
  postState:suppressSet.canonicalState,
  stateHash:suppressSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(suppressPassToTarget.ok, true, suppressPassToTarget.reason);
assert.strictEqual(suppressPassToTarget.canonicalState.oppSuppressedNextTurn, true);
assert.strictEqual(suppressPassToTarget.canonicalState.currentPlayer, 1);
const suppressCleared = reduceServerAction({canonicalState:suppressPassToTarget.canonicalState, canonicalHash:suppressPassToTarget.canonicalHash}, msg('END_TURN', {
  playerIndex:1,
  turn:2,
  baseStateHash:suppressPassToTarget.canonicalHash,
  postState:suppressPassToTarget.canonicalState,
  stateHash:suppressPassToTarget.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(suppressCleared.ok, true, suppressCleared.reason);
assert.strictEqual(suppressCleared.canonicalState.oppSuppressedNextTurn, false);
assert.strictEqual(suppressCleared.canonicalState.suppressTarget, null);

const shieldWallBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'20', iid:'s-20-place', name:'South Wind Spearman', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'301', iid:'shielded-char', name:'Shielded Character', type:'Character', owner:0, fate:2},null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const shieldWallHash = canonicalStateHash(shieldWallBase);
const shieldWallSet = reduceServerAction({canonicalState:shieldWallBase, canonicalHash:shieldWallHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-20-place', id:'20'},
  baseStateHash:shieldWallHash,
  postState:shieldWallBase,
  stateHash:shieldWallHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(shieldWallSet.ok, true, shieldWallSet.reason);
assert.deepStrictEqual(shieldWallSet.canonicalState.shieldWallZones, [0]);
assert.strictEqual(shieldWallSet.canonicalState.board[0][2][0].cantBeMoved, true);
assert.strictEqual(shieldWallSet.canonicalState.board[0][2][2].cantBeMoved, true);

const revealSetBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'26', iid:'s-26-place', name:'UCPD', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[{id:'301', iid:'opp-hand-a', name:'Hidden A', type:'Character'}, {id:'302', iid:'opp-hand-b', name:'Hidden B', type:'Supporter'}], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const revealSetHash = canonicalStateHash(revealSetBase);
const revealSet = reduceServerAction({canonicalState:revealSetBase, canonicalHash:revealSetHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-26-place', id:'26'},
  baseStateHash:revealSetHash,
  postState:revealSetBase,
  stateHash:revealSetHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(revealSet.ok, true, revealSet.reason);
assert.strictEqual(revealSet.canonicalState._revealedCards['opp-hand-a'], true);
assert.strictEqual(revealSet.canonicalState._revealedCards['opp-hand-b'], true);

const drawSetBase = state({
  players:[
    {name:'Host', color:'', deck:[{id:'40', iid:'drawn-erbs', name:'Christopher Erbs', type:'Improvisor', fate:4}], hand:[{id:'32', iid:'s-32-place', name:'Temecula Resident', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0],
  _westCaribNext:{owner:0}
});
const drawSetHash = canonicalStateHash(drawSetBase);
const drawSet = reduceServerAction({canonicalState:drawSetBase, canonicalHash:drawSetHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-32-place', id:'32'},
  baseStateHash:drawSetHash,
  postState:drawSetBase,
  stateHash:drawSetHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(drawSet.ok, true, drawSet.reason);
assert.strictEqual(drawSet.canonicalState.players[0].deck.length, 0);
assert.strictEqual(drawSet.canonicalState.players[0].hand.length, 1);
assert.strictEqual(drawSet.canonicalState.players[0].hand[0].iid, 'drawn-erbs');
assert.strictEqual(drawSet.canonicalState.players[0].hand[0]._wciBonus, true);
assert.strictEqual(drawSet.canonicalState.players[0].hand[0]._handCostDelta, -1);
assert.strictEqual(drawSet.canonicalState._westCaribNext, false);

const handModifiedPlacementBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{
      id:'43',
      iid:'modified-hand-character',
      name:'Modified Mark Kemper',
      type:'Initiator',
      fate:4,
      currentFate:8,
      cost:0,
      aff:'reality',
      _wciBonus:true,
      _handCostDelta:-1,
      _handEffectModifiers:[{key:'test-modifier', name:'Test', text:'temporary'}]
    }], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0
});
const handModifiedPlacementHash = canonicalStateHash(handModifiedPlacementBase);
const handModifiedPlaced = reduceServerAction({canonicalState:handModifiedPlacementBase, canonicalHash:handModifiedPlacementHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'modified-hand-character', id:'43'},
  baseStateHash:handModifiedPlacementHash,
  postState:handModifiedPlacementBase,
  stateHash:handModifiedPlacementHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(handModifiedPlaced.ok, true, handModifiedPlaced.reason);
assert.strictEqual(handModifiedPlaced.canonicalState.board[0][2][0].currentFate, 10);
assert.strictEqual(handModifiedPlaced.canonicalState.board[0][2][0]._wciBonus, undefined);
assert.strictEqual(handModifiedPlaced.canonicalState.board[0][2][0]._handCostDelta, undefined);
assert.strictEqual(handModifiedPlaced.canonicalState.board[0][2][0]._handEffectModifiers, undefined);

const drawWithReadyErbsBase = state({
  players:[
    {name:'Host', color:'', deck:[{id:'301', iid:'draw-blocked-by-erbs', name:'Draw Candidate', type:'Character', fate:1}], hand:[{id:'32', iid:'s-32-erbs-place', name:'Temecula Resident', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'40', iid:'ready-erbs-board', name:'Christopher Erbs', type:'Improvisor', owner:0, fate:4, currentFate:4, usesLeft:2},null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0],
  erbsActive:[false,false]
});
const drawWithReadyErbsHash = canonicalStateHash(drawWithReadyErbsBase);
const drawWithReadyErbsPending = reduceServerAction({canonicalState:drawWithReadyErbsBase, canonicalHash:drawWithReadyErbsHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-32-erbs-place', id:'32'},
  baseStateHash:drawWithReadyErbsHash,
  postState:drawWithReadyErbsBase,
  stateHash:drawWithReadyErbsHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(drawWithReadyErbsPending.ok, true, drawWithReadyErbsPending.reason);
assert.strictEqual(drawWithReadyErbsPending.canonicalState.players[0].deck.length, 1);
assert.strictEqual(drawWithReadyErbsPending.canonicalState.players[0].hand.length, 0);
assert.strictEqual(drawWithReadyErbsPending.canonicalState.board[0][2][2].iid, 's-32-erbs-place');
assert.strictEqual(drawWithReadyErbsPending.canonicalState._serverPendingModalAction.kind, 'christopherErbsDrawChoice');
const drawWithReadyErbsDeclined = reduceServerAction({canonicalState:drawWithReadyErbsPending.canonicalState, canonicalHash:drawWithReadyErbsPending.canonicalHash}, msg('MODAL_ACTION', {
  playerIndex:0,
  turn:1,
  promptId:drawWithReadyErbsPending.canonicalState._serverPendingModalAction.promptId,
  actionIndex:0,
  baseStateHash:drawWithReadyErbsPending.canonicalHash,
  postState:drawWithReadyErbsPending.canonicalState,
  stateHash:drawWithReadyErbsPending.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(drawWithReadyErbsDeclined.ok, true, drawWithReadyErbsDeclined.reason);
assert.strictEqual(drawWithReadyErbsDeclined.canonicalState.players[0].deck.length, 0);
assert.strictEqual(drawWithReadyErbsDeclined.canonicalState.players[0].hand[0].currentFate, undefined);
assert.strictEqual(drawWithReadyErbsDeclined.canonicalState.board[0][2][0].usesLeft, 2);
assert.strictEqual(drawWithReadyErbsDeclined.canonicalState._serverPendingModalAction, null);

const drawWithReadyErbsActivateBase = state({
  players:[
    {name:'Host', color:'', deck:[{id:'301', iid:'draw-activated-by-erbs', name:'Draw Candidate', type:'Character', fate:1}], hand:[{id:'32', iid:'s-32-erbs-activate-place', name:'Temecula Resident', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'40', iid:'ready-erbs-activate-board', name:'Christopher Erbs', type:'Improvisor', owner:0, fate:4, currentFate:4, usesLeft:2},null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0],
  erbsActive:[false,false]
});
const drawWithReadyErbsActivateHash = canonicalStateHash(drawWithReadyErbsActivateBase);
const drawWithReadyErbsActivationPending = reduceServerAction({canonicalState:drawWithReadyErbsActivateBase, canonicalHash:drawWithReadyErbsActivateHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-32-erbs-activate-place', id:'32'},
  baseStateHash:drawWithReadyErbsActivateHash,
  postState:drawWithReadyErbsActivateBase,
  stateHash:drawWithReadyErbsActivateHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(drawWithReadyErbsActivationPending.ok, true, drawWithReadyErbsActivationPending.reason);
const drawWithReadyErbsActivated = reduceServerAction({canonicalState:drawWithReadyErbsActivationPending.canonicalState, canonicalHash:drawWithReadyErbsActivationPending.canonicalHash}, msg('MODAL_ACTION', {
  playerIndex:0,
  turn:1,
  promptId:drawWithReadyErbsActivationPending.canonicalState._serverPendingModalAction.promptId,
  actionIndex:1,
  baseStateHash:drawWithReadyErbsActivationPending.canonicalHash,
  postState:drawWithReadyErbsActivationPending.canonicalState,
  stateHash:drawWithReadyErbsActivationPending.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(drawWithReadyErbsActivated.ok, true, drawWithReadyErbsActivated.reason);
assert.strictEqual(drawWithReadyErbsActivated.canonicalState.players[0].hand[0].currentFate, 5);
assert.strictEqual(drawWithReadyErbsActivated.canonicalState.board[0][2][0].usesLeft, 1);
assert.strictEqual(drawWithReadyErbsActivated.canonicalState.erbsActive[0], false);
assert.strictEqual(drawWithReadyErbsActivated.canonicalState._serverPendingModalAction, null);

const drawWithArmedErbsBase = state({
  players:[
    {name:'Host', color:'', deck:[{id:'301', iid:'draw-buffed-by-erbs', name:'Buffed Draw', type:'Character', fate:1}], hand:[{id:'32', iid:'s-32-armed-erbs-place', name:'Temecula Resident', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0],
  erbsActive:[true,false]
});
const drawWithArmedErbsHash = canonicalStateHash(drawWithArmedErbsBase);
const drawWithArmedErbs = reduceServerAction({canonicalState:drawWithArmedErbsBase, canonicalHash:drawWithArmedErbsHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-32-armed-erbs-place', id:'32'},
  baseStateHash:drawWithArmedErbsHash,
  postState:drawWithArmedErbsBase,
  stateHash:drawWithArmedErbsHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(drawWithArmedErbs.ok, true, drawWithArmedErbs.reason);
assert.strictEqual(drawWithArmedErbs.canonicalState.players[0].hand[0].currentFate, 5);
assert.strictEqual(drawWithArmedErbs.canonicalState.erbsActive[0], false);

const westGermanBase = state({
  players:[
    {
      name:'Host',
      color:'',
      deck:[
        {id:'301', iid:'wg-draw-a', name:'Draw A', type:'Character', fate:1},
        {id:'302', iid:'wg-draw-b', name:'Draw B', type:'Character', fate:2},
        {id:'303', iid:'wg-deck-left', name:'Deck Left', type:'Character', fate:3}
      ],
      hand:[{id:'42', iid:'s-42-place', name:'West German Soldier', type:'Supporter', fate:1}],
      discard:[]
    },
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const westGermanHash = canonicalStateHash(westGermanBase);
const westGermanSet = reduceServerAction({canonicalState:westGermanBase, canonicalHash:westGermanHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-42-place', id:'42'},
  baseStateHash:westGermanHash,
  postState:westGermanBase,
  stateHash:westGermanHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(westGermanSet.ok, true, westGermanSet.reason);
assert.strictEqual(westGermanSet.canonicalState.players[0].deck.length, 1);
assert.deepStrictEqual(westGermanSet.canonicalState.players[0].hand.map(c=>c.iid), ['wg-draw-a', 'wg-draw-b']);
assert.strictEqual(westGermanSet.canonicalState._serverPendingCardPick.kind, 'handDiscard');
assert.strictEqual(westGermanSet.canonicalState._serverPendingCardPick.reason, 'westGermanSoldier');
const westGermanDiscard = reduceServerAction({canonicalState:westGermanSet.canonicalState, canonicalHash:westGermanSet.canonicalHash}, msg('PICK_CARDS_VISUAL', {
  playerIndex:0,
  turn:1,
  selectedCards:[
    {iid:'wg-draw-a', id:'301'},
    {iid:'wg-draw-b', id:'302'}
  ],
  baseStateHash:westGermanSet.canonicalHash,
  postState:westGermanSet.canonicalState,
  stateHash:westGermanSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(westGermanDiscard.ok, true, westGermanDiscard.reason);
assert.strictEqual(westGermanDiscard.canonicalState.players[0].hand.length, 0);
assert.deepStrictEqual(westGermanDiscard.canonicalState.players[0].discard.map(c=>c.iid), ['wg-draw-a', 'wg-draw-b']);
assert.strictEqual(westGermanDiscard.canonicalState._serverPendingCardPick, null);

const westGermanErbsBase = state({
  players:[
    {
      name:'Host',
      color:'',
      deck:[
        {id:'301', iid:'wg-erbs-a', name:'Erbs Draw A', type:'Character', fate:1},
        {id:'302', iid:'wg-erbs-b', name:'Erbs Draw B', type:'Character', fate:2}
      ],
      hand:[{id:'42', iid:'s-42-erbs-place', name:'West German Soldier', type:'Supporter', fate:1}],
      discard:[]
    },
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'40', iid:'ready-erbs-for-wg', name:'Christopher Erbs', type:'Improvisor', owner:0, fate:4, currentFate:4, usesLeft:2},null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0],
  erbsActive:[false,false]
});
const westGermanErbsHash = canonicalStateHash(westGermanErbsBase);
const westGermanErbsSet = reduceServerAction({canonicalState:westGermanErbsBase, canonicalHash:westGermanErbsHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-42-erbs-place', id:'42'},
  baseStateHash:westGermanErbsHash,
  postState:westGermanErbsBase,
  stateHash:westGermanErbsHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(westGermanErbsSet.ok, true, westGermanErbsSet.reason);
assert.strictEqual(westGermanErbsSet.canonicalState._serverPendingModalAction.kind, 'christopherErbsDrawChoice');
assert.deepStrictEqual(westGermanErbsSet.canonicalState._serverPendingModalAction.afterDraw, {kind:'westGermanDiscard', sourceIid:'s-42-erbs-place'});
const westGermanErbsDeclined = reduceServerAction({canonicalState:westGermanErbsSet.canonicalState, canonicalHash:westGermanErbsSet.canonicalHash}, msg('MODAL_ACTION', {
  playerIndex:0,
  turn:1,
  promptId:westGermanErbsSet.canonicalState._serverPendingModalAction.promptId,
  actionIndex:0,
  baseStateHash:westGermanErbsSet.canonicalHash,
  postState:westGermanErbsSet.canonicalState,
  stateHash:westGermanErbsSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(westGermanErbsDeclined.ok, true, westGermanErbsDeclined.reason);
assert.strictEqual(westGermanErbsDeclined.canonicalState._serverPendingModalAction.kind, 'christopherErbsDrawChoice');
assert.deepStrictEqual(westGermanErbsDeclined.canonicalState.players[0].hand.map(c=>c.iid), ['wg-erbs-a']);
const westGermanErbsDeclinedAgain = reduceServerAction({canonicalState:westGermanErbsDeclined.canonicalState, canonicalHash:westGermanErbsDeclined.canonicalHash}, msg('MODAL_ACTION', {
  playerIndex:0,
  turn:1,
  promptId:westGermanErbsDeclined.canonicalState._serverPendingModalAction.promptId,
  actionIndex:0,
  baseStateHash:westGermanErbsDeclined.canonicalHash,
  postState:westGermanErbsDeclined.canonicalState,
  stateHash:westGermanErbsDeclined.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(westGermanErbsDeclinedAgain.ok, true, westGermanErbsDeclinedAgain.reason);
assert.strictEqual(westGermanErbsDeclinedAgain.canonicalState._serverPendingModalAction, null);
assert.strictEqual(westGermanErbsDeclinedAgain.canonicalState._serverPendingCardPick.kind, 'handDiscard');
assert.deepStrictEqual(westGermanErbsDeclinedAgain.canonicalState.players[0].hand.map(c=>c.iid), ['wg-erbs-a', 'wg-erbs-b']);
const westGermanErbsDiscard = reduceServerAction({canonicalState:westGermanErbsDeclinedAgain.canonicalState, canonicalHash:westGermanErbsDeclinedAgain.canonicalHash}, msg('PICK_CARDS_VISUAL', {
  playerIndex:0,
  turn:1,
  selectedCards:[
    {iid:'wg-erbs-a', id:'301'},
    {iid:'wg-erbs-b', id:'302'}
  ],
  baseStateHash:westGermanErbsDeclinedAgain.canonicalHash,
  postState:westGermanErbsDeclinedAgain.canonicalState,
  stateHash:westGermanErbsDeclinedAgain.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(westGermanErbsDiscard.ok, true, westGermanErbsDiscard.reason);
assert.strictEqual(westGermanErbsDiscard.canonicalState.players[0].hand.length, 0);
assert.deepStrictEqual(westGermanErbsDiscard.canonicalState.players[0].discard.map(c=>c.iid), ['wg-erbs-a', 'wg-erbs-b']);

const crossroadsBase = state({
  players:[
    {
      name:'Host',
      color:'',
      deck:[],
      hand:[{id:'58', iid:'s-58-place', name:'Crossroads Worker', type:'Supporter', fate:1}],
      discard:[
        {id:'201', iid:'crossroads-target', name:'Discard Supporter', type:'Supporter', fate:1},
        {id:'301', iid:'crossroads-ignored-character', name:'Discard Character', type:'Dauntless', fate:2}
      ]
    },
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const crossroadsHash = canonicalStateHash(crossroadsBase);
const crossroadsSet = reduceServerAction({canonicalState:crossroadsBase, canonicalHash:crossroadsHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-58-place', id:'58'},
  baseStateHash:crossroadsHash,
  postState:crossroadsBase,
  stateHash:crossroadsHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(crossroadsSet.ok, true, crossroadsSet.reason);
assert.strictEqual(crossroadsSet.canonicalState._serverPendingCardPick.kind, 'cardToHand');
assert.strictEqual(crossroadsSet.canonicalState._serverPendingCardPick.reason, 'crossroadsWorker');
const crossroadsPick = reduceServerAction({canonicalState:crossroadsSet.canonicalState, canonicalHash:crossroadsSet.canonicalHash}, msg('PICK_CARDS_VISUAL', {
  playerIndex:0,
  turn:1,
  selectedCards:[{iid:'crossroads-target', id:'201'}],
  baseStateHash:crossroadsSet.canonicalHash,
  postState:crossroadsSet.canonicalState,
  stateHash:crossroadsSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(crossroadsPick.ok, true, crossroadsPick.reason);
assert.deepStrictEqual(crossroadsPick.canonicalState.players[0].hand.map(c=>c.iid), ['crossroads-target']);
assert.deepStrictEqual(crossroadsPick.canonicalState.players[0].discard.map(c=>c.iid), ['crossroads-ignored-character']);
assert.strictEqual(crossroadsPick.canonicalState._serverPendingCardPick, null);

const crossroadsZionBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'58', iid:'s-58-zion-place', name:'Crossroads Worker', type:'Supporter', fate:1}], discard:[{id:'201', iid:'zion-blocked-supporter', name:'Blocked Supporter', type:'Supporter', fate:1}]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0],
  landscapeId:'igb4'
});
const crossroadsZionHash = canonicalStateHash(crossroadsZionBase);
const crossroadsZionSet = reduceServerAction({canonicalState:crossroadsZionBase, canonicalHash:crossroadsZionHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-58-zion-place', id:'58'},
  baseStateHash:crossroadsZionHash,
  postState:crossroadsZionBase,
  stateHash:crossroadsZionHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(crossroadsZionSet.ok, true, crossroadsZionSet.reason);
assert.strictEqual(crossroadsZionSet.canonicalState._serverPendingCardPick, undefined);
assert.deepStrictEqual(crossroadsZionSet.canonicalState.players[0].discard.map(c=>c.iid), ['zion-blocked-supporter']);

const ibStudentBase = state({
  seed:'ib-seed',
  players:[
    {
      name:'Host',
      color:'',
      deck:[
        {id:'301', iid:'ib-ignored-character', name:'Ignored Character', type:'Dauntless', fate:2},
        {id:'201', iid:'ib-supporter-target', name:'Deck Supporter', type:'Supporter', fate:1},
        {id:'202', iid:'ib-supporter-left', name:'Deck Supporter Left', type:'Supporter', fate:1}
      ],
      hand:[{id:'60', iid:'s-60-place', name:'IB Student', type:'Supporter', fate:1}],
      discard:[]
    },
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const ibStudentHash = canonicalStateHash(ibStudentBase);
const ibStudentSet = reduceServerAction({canonicalState:ibStudentBase, canonicalHash:ibStudentHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-60-place', id:'60'},
  baseStateHash:ibStudentHash,
  postState:ibStudentBase,
  stateHash:ibStudentHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(ibStudentSet.ok, true, ibStudentSet.reason);
assert.strictEqual(ibStudentSet.canonicalState._serverPendingCardPick.kind, 'cardToHand');
assert.strictEqual(ibStudentSet.canonicalState._serverPendingCardPick.reason, 'ibStudent');
const ibStudentPick = reduceServerAction({canonicalState:ibStudentSet.canonicalState, canonicalHash:ibStudentSet.canonicalHash}, msg('PICK_CARDS_VISUAL', {
  playerIndex:0,
  turn:1,
  selectedCards:[{iid:'ib-supporter-target', id:'201'}],
  baseStateHash:ibStudentSet.canonicalHash,
  postState:ibStudentSet.canonicalState,
  stateHash:ibStudentSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(ibStudentPick.ok, true, ibStudentPick.reason);
assert.deepStrictEqual(ibStudentPick.canonicalState.players[0].hand.map(c=>c.iid), ['ib-supporter-target']);
assert.strictEqual(ibStudentPick.canonicalState.players[0].deck.length, 2);
assert.strictEqual(ibStudentPick.canonicalState.players[0].deck.some(c=>c.iid === 'ib-supporter-target'), false);
assert.strictEqual(ibStudentPick.canonicalState._serverRngCounter, 1);
assert.strictEqual(ibStudentPick.canonicalState._serverPendingCardPick, null);

const dylanKirbyBase = state({
  seed:'dylan-seed',
  players:[
    {
      name:'Host',
      color:'',
      deck:[
        {id:'201', iid:'dylan-deck-tgw', name:'Deck TGW', type:'Supporter', aff:'third_great_war', fate:1},
        {id:'301', iid:'dylan-deck-other', name:'Other Deck', type:'Dauntless', aff:'reality', fate:2}
      ],
      hand:[{id:'29', iid:'c-29-hand', name:'Dylan Kirby', type:'Initiator', aff:'third_great_war', cost:1, fate:3}],
      discard:[{id:'202', iid:'dylan-discard-tgw', name:'Discard TGW', type:'Supporter', aff:'third_great_war', fate:1}]
    },
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'201', iid:'dylan-tribute', name:'Plain Tribute', type:'Supporter', fate:1, owner:0},null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:false,
  selectedHandCard:0
});
const dylanKirbyHash = canonicalStateHash(dylanKirbyBase);
const dylanKirbyReady = reduceServerAction({canonicalState:dylanKirbyBase, canonicalHash:dylanKirbyHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'c-29-hand', id:'29'},
  baseStateHash:dylanKirbyHash,
  postState:dylanKirbyBase,
  stateHash:dylanKirbyHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(dylanKirbyReady.ok, true, dylanKirbyReady.reason);
const dylanKirbyTribute = reduceServerAction({canonicalState:dylanKirbyReady.canonicalState, canonicalHash:dylanKirbyReady.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'c-29-hand', id:'29'},
  baseStateHash:dylanKirbyReady.canonicalHash,
  postState:dylanKirbyReady.canonicalState,
  stateHash:dylanKirbyReady.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(dylanKirbyTribute.ok, true, dylanKirbyTribute.reason);
const dylanKirbyPlaced = reduceServerAction({canonicalState:dylanKirbyTribute.canonicalState, canonicalHash:dylanKirbyTribute.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'c-29-hand', id:'29'},
  baseStateHash:dylanKirbyTribute.canonicalHash,
  postState:dylanKirbyTribute.canonicalState,
  stateHash:dylanKirbyTribute.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(dylanKirbyPlaced.ok, true, dylanKirbyPlaced.reason);
assert.strictEqual(dylanKirbyPlaced.canonicalState.board[0][2][0].iid, 'c-29-hand');
assert.strictEqual(dylanKirbyPlaced.canonicalState._serverPendingCardPick.reason, 'dylanKirby');
const dylanKirbyPick = reduceServerAction({canonicalState:dylanKirbyPlaced.canonicalState, canonicalHash:dylanKirbyPlaced.canonicalHash}, msg('PICK_CARDS_VISUAL', {
  playerIndex:0,
  turn:1,
  selectedCards:[
    {iid:'dylan-deck-tgw', id:'201'},
    {iid:'dylan-discard-tgw', id:'202'}
  ],
  baseStateHash:dylanKirbyPlaced.canonicalHash,
  postState:dylanKirbyPlaced.canonicalState,
  stateHash:dylanKirbyPlaced.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(dylanKirbyPick.ok, true, dylanKirbyPick.reason);
assert.deepStrictEqual(dylanKirbyPick.canonicalState.players[0].hand.map(c=>c.iid), ['dylan-deck-tgw', 'dylan-discard-tgw']);
assert.strictEqual(dylanKirbyPick.canonicalState.players[0].deck.some(c=>c.iid === 'dylan-deck-tgw'), false);
assert.strictEqual(dylanKirbyPick.canonicalState.players[0].discard.some(c=>c.iid === 'dylan-discard-tgw'), false);
assert.strictEqual(dylanKirbyPick.canonicalState._serverPendingCardPick, null);

const cosmicGfBase = state({
  seed:'cosmic-seed',
  players:[
    {
      name:'Host',
      color:'',
      deck:[
        {id:'301', iid:'cosmic-deck-expanded', name:'Deck Expanded', type:'Dauntless', aff:'expanded_worlds', fate:2},
        {id:'302', iid:'cosmic-deck-other', name:'Other Deck', type:'Dauntless', aff:'reality', fate:2}
      ],
      hand:[{id:'48', iid:'c-48-hand', name:'Cosmic GF', type:'Initiator', aff:'expanded_worlds', cost:1, fate:2}],
      discard:[{id:'303', iid:'cosmic-discard-expanded', name:'Discard Expanded', type:'Supporter', aff:'expanded_worlds', fate:1}]
    },
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'201', iid:'cosmic-tribute', name:'Plain Tribute', type:'Supporter', fate:1, owner:0},null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:false,
  selectedHandCard:0
});
const cosmicGfHash = canonicalStateHash(cosmicGfBase);
const cosmicGfReady = reduceServerAction({canonicalState:cosmicGfBase, canonicalHash:cosmicGfHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'c-48-hand', id:'48'},
  baseStateHash:cosmicGfHash,
  postState:cosmicGfBase,
  stateHash:cosmicGfHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(cosmicGfReady.ok, true, cosmicGfReady.reason);
const cosmicGfTribute = reduceServerAction({canonicalState:cosmicGfReady.canonicalState, canonicalHash:cosmicGfReady.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'c-48-hand', id:'48'},
  baseStateHash:cosmicGfReady.canonicalHash,
  postState:cosmicGfReady.canonicalState,
  stateHash:cosmicGfReady.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(cosmicGfTribute.ok, true, cosmicGfTribute.reason);
const cosmicGfPlaced = reduceServerAction({canonicalState:cosmicGfTribute.canonicalState, canonicalHash:cosmicGfTribute.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  selectedHand:{index:0, iid:'c-48-hand', id:'48'},
  baseStateHash:cosmicGfTribute.canonicalHash,
  postState:cosmicGfTribute.canonicalState,
  stateHash:cosmicGfTribute.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(cosmicGfPlaced.ok, true, cosmicGfPlaced.reason);
assert.strictEqual(cosmicGfPlaced.canonicalState._serverPendingCardPick.reason, 'cosmicGfDeck');
assert.deepStrictEqual(cosmicGfPlaced.canonicalState._serverPendingCardPick.afterPick, {kind:'cosmicGfDiscard', sourceIid:'c-48-hand'});
const cosmicGfDeckPick = reduceServerAction({canonicalState:cosmicGfPlaced.canonicalState, canonicalHash:cosmicGfPlaced.canonicalHash}, msg('PICK_CARDS_VISUAL', {
  playerIndex:0,
  turn:1,
  selectedCards:[{iid:'cosmic-deck-expanded', id:'301'}],
  baseStateHash:cosmicGfPlaced.canonicalHash,
  postState:cosmicGfPlaced.canonicalState,
  stateHash:cosmicGfPlaced.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(cosmicGfDeckPick.ok, true, cosmicGfDeckPick.reason);
assert.strictEqual(cosmicGfDeckPick.canonicalState._serverPendingCardPick.reason, 'cosmicGfDiscard');
assert.deepStrictEqual(cosmicGfDeckPick.canonicalState.players[0].hand.map(c=>c.iid), ['cosmic-deck-expanded']);
const cosmicGfDiscardPick = reduceServerAction({canonicalState:cosmicGfDeckPick.canonicalState, canonicalHash:cosmicGfDeckPick.canonicalHash}, msg('PICK_CARDS_VISUAL', {
  playerIndex:0,
  turn:1,
  selectedCards:[{iid:'cosmic-discard-expanded', id:'303'}],
  baseStateHash:cosmicGfDeckPick.canonicalHash,
  postState:cosmicGfDeckPick.canonicalState,
  stateHash:cosmicGfDeckPick.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(cosmicGfDiscardPick.ok, true, cosmicGfDiscardPick.reason);
assert.deepStrictEqual(cosmicGfDiscardPick.canonicalState.players[0].hand.map(c=>c.iid), ['cosmic-deck-expanded', 'cosmic-discard-expanded']);
assert.strictEqual(cosmicGfDiscardPick.canonicalState._serverPendingCardPick, null);

const greatOakHighSchoolerBase = state({
  seed:'gohs-seed',
  players:[
    {
      name:'Host',
      color:'',
      deck:[
        {id:'701', iid:'gohs-star-coord', name:'Star Coordinator', type:'Coordinator', rarity:'star', fate:4},
        {id:'702', iid:'gohs-target-coord', name:'Target Coordinator', type:'Coordinator', rarity:'square', fate:2},
        {id:'703', iid:'gohs-ignored-supporter', name:'Ignored Supporter', type:'Supporter', rarity:'circle', fate:1}
      ],
      hand:[{id:'68', iid:'s-68-place', name:'Great Oak High Schooler', type:'Supporter', fate:1}],
      discard:[]
    },
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const greatOakHighSchoolerHash = canonicalStateHash(greatOakHighSchoolerBase);
const greatOakHighSchoolerSet = reduceServerAction({canonicalState:greatOakHighSchoolerBase, canonicalHash:greatOakHighSchoolerHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-68-place', id:'68'},
  baseStateHash:greatOakHighSchoolerHash,
  postState:greatOakHighSchoolerBase,
  stateHash:greatOakHighSchoolerHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(greatOakHighSchoolerSet.ok, true, greatOakHighSchoolerSet.reason);
assert.strictEqual(greatOakHighSchoolerSet.canonicalState._serverPendingCardPick.reason, 'greatOakHighSchooler');
const greatOakHighSchoolerStarRejected = reduceServerAction({canonicalState:greatOakHighSchoolerSet.canonicalState, canonicalHash:greatOakHighSchoolerSet.canonicalHash}, msg('PICK_CARDS_VISUAL', {
  playerIndex:0,
  turn:1,
  selectedCards:[{iid:'gohs-star-coord', id:'701'}],
  baseStateHash:greatOakHighSchoolerSet.canonicalHash,
  postState:greatOakHighSchoolerSet.canonicalState,
  stateHash:greatOakHighSchoolerSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(greatOakHighSchoolerStarRejected.ok, false);
assert.match(greatOakHighSchoolerStarRejected.reason, /allowed source/);
const greatOakHighSchoolerPick = reduceServerAction({canonicalState:greatOakHighSchoolerSet.canonicalState, canonicalHash:greatOakHighSchoolerSet.canonicalHash}, msg('PICK_CARDS_VISUAL', {
  playerIndex:0,
  turn:1,
  selectedCards:[{iid:'gohs-target-coord', id:'702'}],
  baseStateHash:greatOakHighSchoolerSet.canonicalHash,
  postState:greatOakHighSchoolerSet.canonicalState,
  stateHash:greatOakHighSchoolerSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(greatOakHighSchoolerPick.ok, true, greatOakHighSchoolerPick.reason);
assert.deepStrictEqual(greatOakHighSchoolerPick.canonicalState.players[0].hand.map(c=>c.iid), ['gohs-target-coord']);
assert.strictEqual(greatOakHighSchoolerPick.canonicalState.players[0].deck.some(c=>c.iid === 'gohs-target-coord'), false);

const berkeleyHomelessBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'62', iid:'s-62-place', name:'Berkeley Homeless', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const berkeleyHomelessHash = canonicalStateHash(berkeleyHomelessBase);
const berkeleyHomelessSet = reduceServerAction({canonicalState:berkeleyHomelessBase, canonicalHash:berkeleyHomelessHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-62-place', id:'62'},
  baseStateHash:berkeleyHomelessHash,
  postState:berkeleyHomelessBase,
  stateHash:berkeleyHomelessHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(berkeleyHomelessSet.ok, true, berkeleyHomelessSet.reason);
assert.strictEqual(berkeleyHomelessSet.canonicalState.board[0][2][2].berkeleyHomeless, true);
assert.strictEqual(berkeleyHomelessSet.canonicalState._serverPendingMove.kind, 'berkeleyHomelessMove');
const berkeleyHomelessMoved = reduceServerAction({canonicalState:berkeleyHomelessSet.canonicalState, canonicalHash:berkeleyHomelessSet.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:1,
  r:0,
  c:0,
  placing:false,
  baseStateHash:berkeleyHomelessSet.canonicalHash,
  postState:berkeleyHomelessSet.canonicalState,
  stateHash:berkeleyHomelessSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(berkeleyHomelessMoved.ok, true, berkeleyHomelessMoved.reason);
assert.strictEqual(berkeleyHomelessMoved.canonicalState.board[0][2][2], null);
assert.strictEqual(berkeleyHomelessMoved.canonicalState.board[1][0][0].iid, 's-62-place');
assert.strictEqual(berkeleyHomelessMoved.canonicalState._serverPendingMove, null);

const westCaribMarinesBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'65', iid:'s-65-place', name:'1st West Caribbea Marines', type:'Supporter', fate:1, contestedOnly:true}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const westCaribMarinesHash = canonicalStateHash(westCaribMarinesBase);
const westCaribMarinesSafeRejected = reduceServerAction({canonicalState:westCaribMarinesBase, canonicalHash:westCaribMarinesHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'s-65-place', id:'65'},
  baseStateHash:westCaribMarinesHash,
  postState:westCaribMarinesBase,
  stateHash:westCaribMarinesHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(westCaribMarinesSafeRejected.ok, false);
assert.match(westCaribMarinesSafeRejected.reason, /contested/i);
const westCaribMarinesSet = reduceServerAction({canonicalState:westCaribMarinesBase, canonicalHash:westCaribMarinesHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:1,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'s-65-place', id:'65'},
  baseStateHash:westCaribMarinesHash,
  postState:westCaribMarinesBase,
  stateHash:westCaribMarinesHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(westCaribMarinesSet.ok, true, westCaribMarinesSet.reason);
assert.strictEqual(westCaribMarinesSet.canonicalState.board[0][1][0].currentFate, 4);

const fortCalvinBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'71', iid:'s-71-place', name:'Fort Calvin Watcher', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const fortCalvinHash = canonicalStateHash(fortCalvinBase);
const fortCalvinSet = reduceServerAction({canonicalState:fortCalvinBase, canonicalHash:fortCalvinHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:true,
  selectedHand:{index:0, iid:'s-71-place', id:'71'},
  baseStateHash:fortCalvinHash,
  postState:fortCalvinBase,
  stateHash:fortCalvinHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(fortCalvinSet.ok, true, fortCalvinSet.reason);
assert.deepStrictEqual(fortCalvinSet.canonicalState._fortCalvinActive, [{owner:0, remaining:3}]);

const roboBase = state({
  seed:'robo-seed',
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'72', iid:'s-72-place', name:'Robo en la Noche', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[{id:'301', iid:'robo-steal-a', name:'A', type:'Dauntless', fate:1}, {id:'302', iid:'robo-steal-b', name:'B', type:'Supporter', fate:1}], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const roboHash = canonicalStateHash(roboBase);
const roboSet = reduceServerAction({canonicalState:roboBase, canonicalHash:roboHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-72-place', id:'72'},
  baseStateHash:roboHash,
  postState:roboBase,
  stateHash:roboHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(roboSet.ok, true, roboSet.reason);
assert.strictEqual(roboSet.canonicalState.players[0].hand.length, 1);
assert.strictEqual(roboSet.canonicalState.players[0].hand[0]._stolenByRobo, true);
assert.strictEqual(roboSet.canonicalState.players[0].hand[0]._roboOrigOwner, 1);
assert.strictEqual(roboSet.canonicalState.players[1].hand.length, 1);
assert.strictEqual(roboSet.canonicalState._serverRngCounter, 1);

const alpineExpeditionaryBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'73', iid:'s-73-place', name:'ALPINE Expeditionary', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'301', iid:'alpine-init', name:'Initiator', type:'Initiator', fate:2, currentFate:2, owner:0},{id:'302', iid:'alpine-improv', name:'Improvisor', type:'Improvisor', fate:3, currentFate:3, owner:0},null]], [[null,null,null],[null,null,null],[{id:'34', iid:'alpine-rozsi', name:'Rozsi Szocs', type:'Coordinator', fate:2, currentFate:2, owner:0},null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const alpineExpeditionaryHash = canonicalStateHash(alpineExpeditionaryBase);
const alpineExpeditionarySet = reduceServerAction({canonicalState:alpineExpeditionaryBase, canonicalHash:alpineExpeditionaryHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-73-place', id:'73'},
  baseStateHash:alpineExpeditionaryHash,
  postState:alpineExpeditionaryBase,
  stateHash:alpineExpeditionaryHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(alpineExpeditionarySet.ok, true, alpineExpeditionarySet.reason);
assert.strictEqual(alpineExpeditionarySet.canonicalState.board[0][2][2].currentFate, 6);
assert.strictEqual(alpineExpeditionarySet.canonicalState.board[0][2][2]._canMoveOncePerTurn, true);
assert.deepStrictEqual(alpineExpeditionarySet.canonicalState.players[0].discard.map(c=>c.iid), ['alpine-init', 'alpine-improv']);
const alpineExpeditionaryMoveArmed = reduceServerAction({canonicalState:alpineExpeditionarySet.canonicalState, canonicalHash:alpineExpeditionarySet.canonicalHash}, msg('BOARD_ACTION', {
  fn:'activateExpeditionaryMove',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  baseStateHash:alpineExpeditionarySet.canonicalHash,
  postState:alpineExpeditionarySet.canonicalState,
  stateHash:alpineExpeditionarySet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(alpineExpeditionaryMoveArmed.ok, true, alpineExpeditionaryMoveArmed.reason);
assert.strictEqual(alpineExpeditionaryMoveArmed.canonicalState._serverPendingMove.kind, 'alpineExpeditionaryMove');
const alpineExpeditionaryMoved = reduceServerAction({canonicalState:alpineExpeditionaryMoveArmed.canonicalState, canonicalHash:alpineExpeditionaryMoveArmed.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:1,
  r:2,
  c:1,
  placing:false,
  baseStateHash:alpineExpeditionaryMoveArmed.canonicalHash,
  postState:alpineExpeditionaryMoveArmed.canonicalState,
  stateHash:alpineExpeditionaryMoveArmed.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(alpineExpeditionaryMoved.ok, true, alpineExpeditionaryMoved.reason);
assert.strictEqual(alpineExpeditionaryMoved.canonicalState.board[0][2][2], null);
assert.strictEqual(alpineExpeditionaryMoved.canonicalState.board[1][2][1].iid, 's-73-place');
assert.strictEqual(alpineExpeditionaryMoved.canonicalState.board[1][2][1].currentFate, 8);
assert.strictEqual(alpineExpeditionaryMoved.canonicalState.board[1][2][1]._expMoved, true);
assert.strictEqual(alpineExpeditionaryMoved.canonicalState._serverPendingMove, null);
const alpineExpeditionaryMovedAgain = reduceServerAction({canonicalState:alpineExpeditionaryMoved.canonicalState, canonicalHash:alpineExpeditionaryMoved.canonicalHash}, msg('BOARD_ACTION', {
  fn:'activateExpeditionaryMove',
  playerIndex:0,
  turn:1,
  z:1,
  r:2,
  c:1,
  baseStateHash:alpineExpeditionaryMoved.canonicalHash,
  postState:alpineExpeditionaryMoved.canonicalState,
  stateHash:alpineExpeditionaryMoved.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(alpineExpeditionaryMovedAgain.ok, false);
assert.match(alpineExpeditionaryMovedAgain.reason, /already moved/);
const alpineExpeditionarySuppressedBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'73', iid:'alpine-suppressed', name:'ALPINE Expeditionary', type:'Supporter', fate:6, currentFate:6, owner:0, _canMoveOncePerTurn:true, _lydiaSuppressed:true},null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  currentPlayer:0,
  turn:1
});
const alpineExpeditionarySuppressedHash = canonicalStateHash(alpineExpeditionarySuppressedBase);
const alpineExpeditionarySuppressedRejected = reduceServerAction({canonicalState:alpineExpeditionarySuppressedBase, canonicalHash:alpineExpeditionarySuppressedHash}, msg('BOARD_ACTION', {
  fn:'activateExpeditionaryMove',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  baseStateHash:alpineExpeditionarySuppressedHash,
  postState:alpineExpeditionarySuppressedBase,
  stateHash:alpineExpeditionarySuppressedHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(alpineExpeditionarySuppressedRejected.ok, false);
assert.match(alpineExpeditionarySuppressedRejected.reason, /suppressed/);
const alpineExpeditionaryWrongIidRejected = reduceServerAction({canonicalState:alpineExpeditionarySet.canonicalState, canonicalHash:alpineExpeditionarySet.canonicalHash}, msg('BOARD_ACTION', {
  fn:'activateExpeditionaryMove',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  cardIid:'not-the-alpine-source',
  cardId:'73',
  baseStateHash:alpineExpeditionarySet.canonicalHash,
  postState:alpineExpeditionarySet.canonicalState,
  stateHash:alpineExpeditionarySet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(alpineExpeditionaryWrongIidRejected.ok, false);
assert.match(alpineExpeditionaryWrongIidRejected.reason, /source identity mismatch/);

const apparitionBase = state({
  players:[
    {name:'Host', color:'', deck:[{id:'401', iid:'apparition-draw-a', name:'Draw A', type:'Supporter', fate:1}, {id:'402', iid:'apparition-draw-b', name:'Draw B', type:'Dauntless', fate:1}], hand:[{id:'80', iid:'s-80-place', name:'Apparition of Berkeley', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'301', iid:'apparition-target', name:'Friendly Character', type:'Dauntless', fate:2, owner:0},null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const apparitionHash = canonicalStateHash(apparitionBase);
const apparitionSet = reduceServerAction({canonicalState:apparitionBase, canonicalHash:apparitionHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:true,
  selectedHand:{index:0, iid:'s-80-place', id:'80'},
  baseStateHash:apparitionHash,
  postState:apparitionBase,
  stateHash:apparitionHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(apparitionSet.ok, true, apparitionSet.reason);
assert.strictEqual(apparitionSet.canonicalState._serverPendingZonePick.kind, 'apparitionDiscardDraw');
const apparitionPick = reduceServerAction({canonicalState:apparitionSet.canonicalState, canonicalHash:apparitionSet.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[{z:0, r:2, c:0, card:{iid:'apparition-target', id:'301'}}],
  baseStateHash:apparitionSet.canonicalHash,
  postState:apparitionSet.canonicalState,
  stateHash:apparitionSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(apparitionPick.ok, true, apparitionPick.reason);
assert.deepStrictEqual(apparitionPick.canonicalState.players[0].discard.map(c=>c.iid), ['apparition-target']);
assert.deepStrictEqual(apparitionPick.canonicalState.players[0].hand.map(c=>c.iid), ['apparition-draw-a', 'apparition-draw-b']);
assert.strictEqual(apparitionPick.canonicalState._serverPendingZonePick, null);

const mariaSongBase = state({
  players:[
    {
      name:'Host',
      color:'',
      deck:[],
      hand:[{id:'61', iid:'c-61-hand', name:'Maria Song', type:'Dauntless', cost:3, fate:7}],
      discard:[]
    },
    {
      name:'Guest',
      color:'',
      deck:[{id:'777', iid:'maria-copy-deck', name:'Target Copy Deck', type:'Dauntless', fate:1}, {id:'778', iid:'maria-other-deck', name:'Other Deck', type:'Dauntless', fate:1}],
      hand:[{id:'777', iid:'maria-copy-hand', name:'Target Copy Hand', type:'Dauntless', fate:1}],
      discard:[]
    }
  ],
  board:[
    [[null,null,null],[{id:'777', iid:'maria-board-target', name:'Target Board', type:'Dauntless', owner:1, fate:2},null,null],[{id:'201', iid:'maria-tribute-a', name:'Tribute A', type:'Supporter', fate:1, owner:0},{id:'202', iid:'maria-tribute-b', name:'Tribute B', type:'Supporter', fate:1, owner:0},{id:'203', iid:'maria-tribute-c', name:'Tribute C', type:'Supporter', fate:1, owner:0}]],
    [[null,null,null],[null,null,null],[null,null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  phase:'main',
  placing:false,
  selectedHandCard:0
});
const mariaSongHash = canonicalStateHash(mariaSongBase);
const mariaSongReady = reduceServerAction({canonicalState:mariaSongBase, canonicalHash:mariaSongHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'c-61-hand', id:'61'},
  baseStateHash:mariaSongHash,
  postState:mariaSongBase,
  stateHash:mariaSongHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(mariaSongReady.ok, true, mariaSongReady.reason);
let mariaSongStep = mariaSongReady;
[[0,2,0], [0,2,1], [0,2,2], [0,2,0]].forEach(([z, r, c])=>{
  mariaSongStep = reduceServerAction({canonicalState:mariaSongStep.canonicalState, canonicalHash:mariaSongStep.canonicalHash}, msg('CLICK_CELL', {
    playerIndex:0,
    turn:1,
    z,
    r,
    c,
    placing:false,
    selectedHand:{index:0, iid:'c-61-hand', id:'61'},
    baseStateHash:mariaSongStep.canonicalHash,
    postState:mariaSongStep.canonicalState,
    stateHash:mariaSongStep.canonicalHash
  }), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
  assert.strictEqual(mariaSongStep.ok, true, mariaSongStep.reason);
});
assert.strictEqual(mariaSongStep.canonicalState.board[0][2][0].iid, 'c-61-hand');
assert.strictEqual(mariaSongStep.canonicalState._serverPendingZonePick.kind, 'mariaSongCopies');
const mariaSongPick = reduceServerAction({canonicalState:mariaSongStep.canonicalState, canonicalHash:mariaSongStep.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[{z:0, r:1, c:0, card:{iid:'maria-board-target', id:'777'}}],
  baseStateHash:mariaSongStep.canonicalHash,
  postState:mariaSongStep.canonicalState,
  stateHash:mariaSongStep.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(mariaSongPick.ok, true, mariaSongPick.reason);
assert.deepStrictEqual(mariaSongPick.canonicalState.players[1].hand.map(c=>c.iid), []);
assert.deepStrictEqual(mariaSongPick.canonicalState.players[1].deck.map(c=>c.iid), ['maria-other-deck']);
assert.deepStrictEqual(mariaSongPick.canonicalState.players[1].discard.map(c=>c.iid), ['maria-copy-hand', 'maria-copy-deck']);

const selvaArrivalBase = state({
  seed:'selva-seed',
  players:[
    {name:'Host', color:'', deck:[{id:'74', iid:'selva-draw', name:'Selva Islands Pirate', type:'Supporter', fate:1}], hand:[{id:'32', iid:'s-32-selva-place', name:'Temecula Resident', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const selvaArrivalHash = canonicalStateHash(selvaArrivalBase);
const selvaArrivalSet = reduceServerAction({canonicalState:selvaArrivalBase, canonicalHash:selvaArrivalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-32-selva-place', id:'32'},
  baseStateHash:selvaArrivalHash,
  postState:selvaArrivalBase,
  stateHash:selvaArrivalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(selvaArrivalSet.ok, true, selvaArrivalSet.reason);
assert.deepStrictEqual(selvaArrivalSet.canonicalState.players[0].hand.map(c=>c.iid), ['selva-draw']);
assert.strictEqual(selvaArrivalSet.canonicalState.extraSupportsThisTurn, 1);
assert.strictEqual(selvaArrivalSet.canonicalState._selvaSupportBoosts[0].extraSupports, 1);

const howardBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'03', iid:'c-03-place', name:'Howard', type:'Initiator', cost:0, fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'301', iid:'howard-target', name:'Target', type:'Dauntless', fate:3, currentFate:3, owner:0},null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0
});
const howardHash = canonicalStateHash(howardBase);
const howardSet = reduceServerAction({canonicalState:howardBase, canonicalHash:howardHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:true,
  selectedHand:{index:0, iid:'c-03-place', id:'03'},
  baseStateHash:howardHash,
  postState:howardBase,
  stateHash:howardHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(howardSet.ok, true, howardSet.reason);
assert.strictEqual(howardSet.canonicalState._serverPendingZonePick.kind, 'howardFateDouble');
const howardPick = reduceServerAction({canonicalState:howardSet.canonicalState, canonicalHash:howardSet.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[{z:0, r:2, c:0, card:{iid:'howard-target', id:'301'}}],
  baseStateHash:howardSet.canonicalHash,
  postState:howardSet.canonicalState,
  stateHash:howardSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(howardPick.ok, true, howardPick.reason);
assert.strictEqual(howardPick.canonicalState.board[0][2][0].currentFate, 6);

const zoeBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'04', iid:'c-04-place', name:'Zoe', type:'Initiator', cost:0, fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  blockedCells:[]
});
const zoeHash = canonicalStateHash(zoeBase);
const zoeSet = reduceServerAction({canonicalState:zoeBase, canonicalHash:zoeHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:true,
  selectedHand:{index:0, iid:'c-04-place', id:'04'},
  baseStateHash:zoeHash,
  postState:zoeBase,
  stateHash:zoeHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(zoeSet.ok, true, zoeSet.reason);
assert.strictEqual(zoeSet.canonicalState._serverPendingMove.kind, 'zoeBlockSquare');
const zoeBlock = reduceServerAction({canonicalState:zoeSet.canonicalState, canonicalHash:zoeSet.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:1,
  c:0,
  placing:false,
  baseStateHash:zoeSet.canonicalHash,
  postState:zoeSet.canonicalState,
  stateHash:zoeSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(zoeBlock.ok, true, zoeBlock.reason);
assert.deepStrictEqual(zoeBlock.canonicalState.blockedCells, [{z:0, r:1, c:0, type:'zoe', owner:0, blockedPlayer:1}]);

const jorgeBase = state({
  seed:'jorge-seed',
  players:[
    {
      name:'Host',
      color:'',
      deck:[
        {id:'501', iid:'jorge-star', name:'Star', type:'Coordinator', rarity:'star', fate:3},
        {id:'502', iid:'jorge-target', name:'Non Star', type:'Dauntless', rarity:'triangle', fate:2}
      ],
      hand:[{id:'06', iid:'c-06-place', name:'Jorge Alvarez', type:'Initiator', cost:0, fate:1}],
      discard:[]
    },
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0
});
const jorgeHash = canonicalStateHash(jorgeBase);
const jorgeSet = reduceServerAction({canonicalState:jorgeBase, canonicalHash:jorgeHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:true,
  selectedHand:{index:0, iid:'c-06-place', id:'06'},
  baseStateHash:jorgeHash,
  postState:jorgeBase,
  stateHash:jorgeHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(jorgeSet.ok, true, jorgeSet.reason);
assert.strictEqual(jorgeSet.canonicalState._serverPendingCardPick.reason, 'jorgeAlvarez');
const jorgeStarRejected = reduceServerAction({canonicalState:jorgeSet.canonicalState, canonicalHash:jorgeSet.canonicalHash}, msg('PICK_CARDS_VISUAL', {
  playerIndex:0,
  turn:1,
  selectedCards:[{iid:'jorge-star', id:'501'}],
  baseStateHash:jorgeSet.canonicalHash,
  postState:jorgeSet.canonicalState,
  stateHash:jorgeSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(jorgeStarRejected.ok, false);
assert.match(jorgeStarRejected.reason, /allowed source/);
const jorgePick = reduceServerAction({canonicalState:jorgeSet.canonicalState, canonicalHash:jorgeSet.canonicalHash}, msg('PICK_CARDS_VISUAL', {
  playerIndex:0,
  turn:1,
  selectedCards:[{iid:'jorge-target', id:'502'}],
  baseStateHash:jorgeSet.canonicalHash,
  postState:jorgeSet.canonicalState,
  stateHash:jorgeSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(jorgePick.ok, true, jorgePick.reason);
assert.deepStrictEqual(jorgePick.canonicalState.players[0].hand.map(c=>c.iid), ['jorge-target']);
assert.strictEqual(jorgePick.canonicalState.players[0].deck.some(c=>c.iid === 'jorge-target'), false);

const majaBase = state({
  seed:'maja-seed',
  players:[
    {
      name:'Host',
      color:'',
      deck:[{id:'201', iid:'maja-deck-supporter', name:'Deck Supporter', type:'Supporter', fate:1}, {id:'501', iid:'maja-ignored-char', name:'Ignored', type:'Dauntless', fate:1}],
      hand:[{id:'07', iid:'c-07-place', name:'Maja Kaminska', type:'Initiator', cost:0, fate:1}],
      discard:[{id:'202', iid:'maja-discard-supporter', name:'Discard Supporter', type:'Supporter', fate:1}]
    },
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0
});
const majaHash = canonicalStateHash(majaBase);
const majaSet = reduceServerAction({canonicalState:majaBase, canonicalHash:majaHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:true,
  selectedHand:{index:0, iid:'c-07-place', id:'07'},
  baseStateHash:majaHash,
  postState:majaBase,
  stateHash:majaHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(majaSet.ok, true, majaSet.reason);
assert.strictEqual(majaSet.canonicalState._serverPendingCardPick.reason, 'majaKaminska');
assert.deepStrictEqual(majaSet.canonicalState._serverPendingCardPick.afterPick, {kind:'majaKaminskaSupportLimit', sourceIid:'c-07-place'});
const majaIndexOnlyRejected = reduceServerAction({canonicalState:majaSet.canonicalState, canonicalHash:majaSet.canonicalHash}, msg('PICK_CARDS_VISUAL', {
  playerIndex:0,
  turn:1,
  selectedCards:[{index:0, id:'201'}],
  baseStateHash:majaSet.canonicalHash,
  postState:majaSet.canonicalState,
  stateHash:majaSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(majaIndexOnlyRejected.ok, false);
assert.match(majaIndexOnlyRejected.reason, /must include iid or source\/index/);
const majaSourceLocationPick = reduceServerAction({canonicalState:majaSet.canonicalState, canonicalHash:majaSet.canonicalHash}, msg('PICK_CARDS_VISUAL', {
  playerIndex:0,
  turn:1,
  selectedCards:[{source:'discard', index:0, id:'202', name:'Discard Supporter'}],
  baseStateHash:majaSet.canonicalHash,
  postState:majaSet.canonicalState,
  stateHash:majaSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(majaSourceLocationPick.ok, true, majaSourceLocationPick.reason);
assert.deepStrictEqual(majaSourceLocationPick.canonicalState.players[0].hand.map(c=>c.iid), ['maja-discard-supporter']);
assert.deepStrictEqual(majaSourceLocationPick.canonicalState.players[0].discard.map(c=>c.iid), []);
const majaSourceIdentityMismatch = reduceServerAction({canonicalState:majaSet.canonicalState, canonicalHash:majaSet.canonicalHash}, msg('PICK_CARDS_VISUAL', {
  playerIndex:0,
  turn:1,
  selectedCards:[{source:'deck', index:0, id:'202', name:'Discard Supporter'}],
  baseStateHash:majaSet.canonicalHash,
  postState:majaSet.canonicalState,
  stateHash:majaSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(majaSourceIdentityMismatch.ok, false);
assert.match(majaSourceIdentityMismatch.reason, /allowed source/);
const majaPick = reduceServerAction({canonicalState:majaSet.canonicalState, canonicalHash:majaSet.canonicalHash}, msg('PICK_CARDS_VISUAL', {
  playerIndex:0,
  turn:1,
  selectedCards:[{iid:'maja-deck-supporter', id:'201'}, {iid:'maja-discard-supporter', id:'202'}],
  baseStateHash:majaSet.canonicalHash,
  postState:majaSet.canonicalState,
  stateHash:majaSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(majaPick.ok, true, majaPick.reason);
assert.deepStrictEqual(majaPick.canonicalState.players[0].hand.map(c=>c.iid), ['maja-deck-supporter', 'maja-discard-supporter']);
assert.strictEqual(majaPick.canonicalState.majaEffectThisTurn, true);

const linaBase = state({
  players:[
    {
      name:'Host',
      color:'',
      deck:[
        {id:'32', iid:'lina-reality-supporter', name:'Reality Supporter', type:'Supporter', fate:1, aff:'reality'},
        {id:'201', iid:'lina-non-reality', name:'Ignored', type:'Supporter', fate:1, aff:'eventide'}
      ],
      hand:[{id:'08', iid:'c-08-place', name:'Lina', type:'Initiator', cost:0, fate:2, aff:'reality'}],
      discard:[{id:'43', iid:'lina-discard-reality', name:'Reality Character', type:'Initiator', cost:0, fate:4, aff:'reality'}]
    },
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:1,
  maxSupportsPerTurn:1,
  extraSupportsThisTurn:0,
  supportersSetP:[1,0]
});
const linaHash = canonicalStateHash(linaBase);
const linaSet = reduceServerAction({canonicalState:linaBase, canonicalHash:linaHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'c-08-place', id:'08'},
  baseStateHash:linaHash,
  postState:linaBase,
  stateHash:linaHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(linaSet.ok, true, linaSet.reason);
assert.strictEqual(linaSet.canonicalState._serverPendingCardPick.kind, 'linaFreeSet');
const linaPick = reduceServerAction({canonicalState:linaSet.canonicalState, canonicalHash:linaSet.canonicalHash}, msg('PICK_CARDS_VISUAL', {
  playerIndex:0,
  turn:1,
  selectedCards:[{iid:'lina-reality-supporter', id:'32'}],
  baseStateHash:linaSet.canonicalHash,
  postState:linaSet.canonicalState,
  stateHash:linaSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(linaPick.ok, true, linaPick.reason);
assert.strictEqual(linaPick.canonicalState._serverPendingCardPick, null);
assert.strictEqual(linaPick.canonicalState.placing, true);
assert.strictEqual(linaPick.canonicalState._serverFreePlacement.kind, 'linaFreeSet');
assert.deepStrictEqual(linaPick.canonicalState.players[0].deck.map(card=>card.iid), ['lina-non-reality']);
assert.deepStrictEqual(linaPick.canonicalState.players[0].hand.map(card=>card.iid), ['lina-reality-supporter']);
assert.strictEqual(linaPick.canonicalState.players[0].hand[0]._linaFree, true);
const linaFreePlaced = reduceServerAction({canonicalState:linaPick.canonicalState, canonicalHash:linaPick.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:true,
  selectedHand:{index:0, iid:'lina-reality-supporter', id:'32'},
  baseStateHash:linaPick.canonicalHash,
  postState:linaPick.canonicalState,
  stateHash:linaPick.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(linaFreePlaced.ok, true, linaFreePlaced.reason);
assert.strictEqual(linaFreePlaced.canonicalState._serverFreePlacement, null);
assert.strictEqual(linaFreePlaced.canonicalState.supportsPlacedThisTurn, 1);
assert.strictEqual(linaFreePlaced.canonicalState.board[0][2][1].iid, 'lina-reality-supporter');
assert.strictEqual(linaFreePlaced.canonicalState.board[0][2][1]._linaFree, undefined);
assert.strictEqual(linaFreePlaced.canonicalState.board[0][2][1]._serverFreePlacement, undefined);
assert.strictEqual(linaFreePlaced.canonicalState.board[0][2][1]._serverFreePlacementConsumed, 'linaFreeSet');

const staleFreeFlagBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'32', iid:'stale-free-supporter', name:'Stale Free Supporter', type:'Supporter', fate:1, aff:'reality', _serverFreePlacement:true, _linaFree:true}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:2,
  maxSupportsPerTurn:1,
  extraSupportsThisTurn:0,
  supportersSetP:[2,0],
  _serverFreePlacement:null
});
const staleFreeFlagHash = canonicalStateHash(staleFreeFlagBase);
const staleFreeFlagRejected = reduceServerAction({canonicalState:staleFreeFlagBase, canonicalHash:staleFreeFlagHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'stale-free-supporter', id:'32'},
  baseStateHash:staleFreeFlagHash,
  postState:staleFreeFlagBase,
  stateHash:staleFreeFlagHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(staleFreeFlagRejected.ok, false);
assert.match(staleFreeFlagRejected.reason, /Supporter limit/);

const linaPaidRealityBase = state({
  players:[
    {
      name:'Host',
      color:'',
      deck:[{id:'46', iid:'lina-paid-reality', name:'Phil', type:'Dauntless', cost:3, fate:1, aff:'reality'}],
      hand:[{id:'08', iid:'c-08-paid-reality', name:'Lina', type:'Initiator', cost:0, fate:2, aff:'reality'}],
      discard:[]
    },
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0
});
const linaPaidRealityHash = canonicalStateHash(linaPaidRealityBase);
const linaPaidRealitySet = reduceServerAction({canonicalState:linaPaidRealityBase, canonicalHash:linaPaidRealityHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'c-08-paid-reality', id:'08'},
  baseStateHash:linaPaidRealityHash,
  postState:linaPaidRealityBase,
  stateHash:linaPaidRealityHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(linaPaidRealitySet.ok, true, linaPaidRealitySet.reason);
assert.strictEqual(linaPaidRealitySet.canonicalState._serverPendingCardPick.kind, 'linaFreeSet');
const linaPaidRealityPick = reduceServerAction({canonicalState:linaPaidRealitySet.canonicalState, canonicalHash:linaPaidRealitySet.canonicalHash}, msg('PICK_CARDS_VISUAL', {
  playerIndex:0,
  turn:1,
  selectedCards:[{iid:'lina-paid-reality', id:'46'}],
  baseStateHash:linaPaidRealitySet.canonicalHash,
  postState:linaPaidRealitySet.canonicalState,
  stateHash:linaPaidRealitySet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(linaPaidRealityPick.ok, true, linaPaidRealityPick.reason);
const linaPaidRealityPlaced = reduceServerAction({canonicalState:linaPaidRealityPick.canonicalState, canonicalHash:linaPaidRealityPick.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:true,
  selectedHand:{index:0, iid:'lina-paid-reality', id:'46'},
  baseStateHash:linaPaidRealityPick.canonicalHash,
  postState:linaPaidRealityPick.canonicalState,
  stateHash:linaPaidRealityPick.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(linaPaidRealityPlaced.ok, true, linaPaidRealityPlaced.reason);
assert.strictEqual(linaPaidRealityPlaced.canonicalState.board[0][2][1].iid, 'lina-paid-reality');
assert.strictEqual(linaPaidRealityPlaced.canonicalState.board[0][2][1]._serverFreePlacementConsumed, 'linaFreeSet');
assert.strictEqual(linaPaidRealityPlaced.canonicalState.board[0][2][1]._philSetTurn, 1);

const busserBase = state({
  players:[
    {
      name:'Host',
      color:'',
      deck:[],
      hand:[{id:'69', iid:'s-69-place', name:'Breakfast Republic Busser', type:'Supporter', fate:1, aff:'reality'}],
      discard:[]
    },
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[
    null,
    {id:'32', iid:'busser-moving-32', name:'Temecula Resident', type:'Supporter', owner:0, fate:1, currentFate:1, aff:'reality'},
    null,
  ]], [[null,null,null],[null,null,null],[
    {id:'34', iid:'busser-rozsi', name:'Rozsi Szocs', type:'Coordinator', owner:0, fate:1, currentFate:1, aff:'third_great_war'},
    null,
    null
  ]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const busserHash = canonicalStateHash(busserBase);
const busserSet = reduceServerAction({canonicalState:busserBase, canonicalHash:busserHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'s-69-place', id:'69'},
  baseStateHash:busserHash,
  postState:busserBase,
  stateHash:busserHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(busserSet.ok, true, busserSet.reason);
assert.strictEqual(busserSet.canonicalState._serverPendingZonePick.kind, 'breakfastBusserGrantMove');
const busserPick = reduceServerAction({canonicalState:busserSet.canonicalState, canonicalHash:busserSet.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[{z:0, r:2, c:1, card:{iid:'busser-moving-32', id:'32'}}],
  baseStateHash:busserSet.canonicalHash,
  postState:busserSet.canonicalState,
  stateHash:busserSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(busserPick.ok, true, busserPick.reason);
assert.strictEqual(busserPick.canonicalState.board[0][2][1]._busserMoves, 3);
assert.strictEqual(busserPick.canonicalState.board[0][2][1]._busserOwner, 0);
const busserSuppressedState = JSON.parse(JSON.stringify(busserPick.canonicalState));
busserSuppressedState.board[0][2][1]._reactionSuppressed = true;
const busserSuppressedHash = canonicalStateHash(busserSuppressedState);
const busserSuppressedRejected = reduceServerAction({canonicalState:busserSuppressedState, canonicalHash:busserSuppressedHash}, msg('BOARD_ACTION', {
  fn:'activateBusserMove',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  cardIid:'busser-moving-32',
  cardId:'32',
  baseStateHash:busserSuppressedHash,
  postState:busserSuppressedState,
  stateHash:busserSuppressedHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(busserSuppressedRejected.ok, false);
assert.match(busserSuppressedRejected.reason, /suppressed/);
const busserArmedMove = reduceServerAction({canonicalState:busserPick.canonicalState, canonicalHash:busserPick.canonicalHash}, msg('BOARD_ACTION', {
  fn:'activateBusserMove',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  cardIid:'busser-moving-32',
  cardId:'32',
  baseStateHash:busserPick.canonicalHash,
  postState:busserPick.canonicalState,
  stateHash:busserPick.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(busserArmedMove.ok, true, busserArmedMove.reason);
assert.strictEqual(busserArmedMove.canonicalState._serverPendingMove.kind, 'busserAdjacentMove');
const busserMove = reduceServerAction({canonicalState:busserArmedMove.canonicalState, canonicalHash:busserArmedMove.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:1,
  r:2,
  c:1,
  placing:false,
  baseStateHash:busserArmedMove.canonicalHash,
  postState:busserArmedMove.canonicalState,
  stateHash:busserArmedMove.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(busserMove.ok, true, busserMove.reason);
assert.strictEqual(busserMove.canonicalState.board[0][2][1], null);
assert.strictEqual(busserMove.canonicalState.board[1][2][1].iid, 'busser-moving-32');
assert.strictEqual(busserMove.canonicalState.board[1][2][1]._busserMoves, 2);
assert.strictEqual(busserMove.canonicalState.board[1][2][1]._busserMovedThisTurn, true);
assert.strictEqual(busserMove.canonicalState.board[1][2][1].currentFate, 3);
assert.strictEqual(busserMove.canonicalState._serverPendingMove, null);
const busserRepeatRejected = reduceServerAction({canonicalState:busserMove.canonicalState, canonicalHash:busserMove.canonicalHash}, msg('BOARD_ACTION', {
  fn:'activateBusserMove',
  playerIndex:0,
  turn:1,
  z:1,
  r:2,
  c:1,
  cardIid:'busser-moving-32',
  cardId:'32',
  baseStateHash:busserMove.canonicalHash,
  postState:busserMove.canonicalState,
  stateHash:busserMove.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(busserRepeatRejected.ok, false);
assert.match(busserRepeatRejected.reason, /already moved/);
const busserGuestTurn = reduceServerAction({canonicalState:busserMove.canonicalState, canonicalHash:busserMove.canonicalHash}, msg('END_TURN', {
  playerIndex:0,
  turn:1,
  baseStateHash:busserMove.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(busserGuestTurn.ok, true, busserGuestTurn.reason);
const busserBackToHost = reduceServerAction({canonicalState:busserGuestTurn.canonicalState, canonicalHash:busserGuestTurn.canonicalHash}, msg('END_TURN', {
  playerIndex:1,
  turn:2,
  baseStateHash:busserGuestTurn.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(busserBackToHost.ok, true, busserBackToHost.reason);
assert.strictEqual(busserBackToHost.canonicalState.board[1][2][1]._busserMovedThisTurn, false);
const busserSecondArm = reduceServerAction({canonicalState:busserBackToHost.canonicalState, canonicalHash:busserBackToHost.canonicalHash}, msg('BOARD_ACTION', {
  fn:'activateBusserMove',
  playerIndex:0,
  turn:3,
  z:1,
  r:2,
  c:1,
  cardIid:'busser-moving-32',
  cardId:'32',
  baseStateHash:busserBackToHost.canonicalHash,
  postState:busserBackToHost.canonicalState,
  stateHash:busserBackToHost.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(busserSecondArm.ok, true, busserSecondArm.reason);
const busserSecondMove = reduceServerAction({canonicalState:busserSecondArm.canonicalState, canonicalHash:busserSecondArm.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:3,
  z:2,
  r:2,
  c:0,
  placing:false,
  baseStateHash:busserSecondArm.canonicalHash,
  postState:busserSecondArm.canonicalState,
  stateHash:busserSecondArm.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(busserSecondMove.ok, true, busserSecondMove.reason);
assert.strictEqual(busserSecondMove.canonicalState.board[2][2][0].iid, 'busser-moving-32');
assert.strictEqual(busserSecondMove.canonicalState.board[2][2][0]._busserMoves, 1);

const johnathanBase = state({
  seed:'johnathan-seed',
  players:[
    {
      name:'Host',
      color:'',
      deck:[{id:'201', iid:'johnathan-a', name:'A', type:'Supporter', fate:1}, {id:'202', iid:'johnathan-b', name:'B', type:'Supporter', fate:1}, {id:'501', iid:'johnathan-ignored', name:'Ignored', type:'Dauntless', fate:1}],
      hand:[{id:'13', iid:'c-13-place', name:'Johnathan Kirby', type:'Initiator', cost:0, fate:1}],
      discard:[]
    },
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0
});
const johnathanHash = canonicalStateHash(johnathanBase);
const johnathanSet = reduceServerAction({canonicalState:johnathanBase, canonicalHash:johnathanHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:true,
  selectedHand:{index:0, iid:'c-13-place', id:'13'},
  baseStateHash:johnathanHash,
  postState:johnathanBase,
  stateHash:johnathanHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(johnathanSet.ok, true, johnathanSet.reason);
assert.strictEqual(johnathanSet.canonicalState._serverPendingCardPick.reason, 'johnathanKirby');
const johnathanPick = reduceServerAction({canonicalState:johnathanSet.canonicalState, canonicalHash:johnathanSet.canonicalHash}, msg('PICK_CARDS_VISUAL', {
  playerIndex:0,
  turn:1,
  selectedCards:[{iid:'johnathan-a', id:'201'}, {iid:'johnathan-b', id:'202'}],
  baseStateHash:johnathanSet.canonicalHash,
  postState:johnathanSet.canonicalState,
  stateHash:johnathanSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(johnathanPick.ok, true, johnathanPick.reason);
assert.deepStrictEqual(johnathanPick.canonicalState.players[0].hand.map(c=>c.iid), ['johnathan-a', 'johnathan-b']);

const isaacBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'22', iid:'c-22-place', name:'Isaac Perez', type:'Initiator', cost:0, fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,{id:'301', iid:'isaac-adj-a', name:'A', type:'Dauntless', owner:0, fate:1},null],[{id:'302', iid:'isaac-adj-b', name:'B', type:'Supporter', owner:0, fate:1},null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  extraSupportsThisTurn:0
});
const isaacHash = canonicalStateHash(isaacBase);
const isaacSet = reduceServerAction({canonicalState:isaacBase, canonicalHash:isaacHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:true,
  selectedHand:{index:0, iid:'c-22-place', id:'22'},
  baseStateHash:isaacHash,
  postState:isaacBase,
  stateHash:isaacHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(isaacSet.ok, true, isaacSet.reason);
assert.strictEqual(isaacSet.canonicalState.extraSupportsThisTurn, 2);
assert.strictEqual(isaacSet.canonicalState._isaacPerezExtraSupports.extraSupports, 2);

const santiagoBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'30', iid:'c-30-place', name:'Santiago', type:'Initiator', cost:0, fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[{id:'301', iid:'santiago-target', name:'Opponent', type:'Dauntless', owner:1, fate:9, currentFate:9},null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0
});
const santiagoHash = canonicalStateHash(santiagoBase);
const santiagoSet = reduceServerAction({canonicalState:santiagoBase, canonicalHash:santiagoHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:true,
  selectedHand:{index:0, iid:'c-30-place', id:'30'},
  baseStateHash:santiagoHash,
  postState:santiagoBase,
  stateHash:santiagoHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(santiagoSet.ok, true, santiagoSet.reason);
assert.strictEqual(santiagoSet.canonicalState._serverPendingZonePick.kind, 'santiagoHalveFate');
const santiagoPick = reduceServerAction({canonicalState:santiagoSet.canonicalState, canonicalHash:santiagoSet.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[{z:0, r:1, c:0, card:{iid:'santiago-target', id:'301'}}],
  baseStateHash:santiagoSet.canonicalHash,
  postState:santiagoSet.canonicalState,
  stateHash:santiagoSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(santiagoPick.ok, true, santiagoPick.reason);
assert.strictEqual(santiagoPick.canonicalState.board[0][1][0].currentFate, 4);

const juanCarlosBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'39', iid:'c-39-place', name:'Juan Carlos', type:'Initiator', cost:0, fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,null,null],[null,null,{id:'34', iid:'juan-rozsi', name:'Rozsi', type:'Coordinator', owner:0, fate:2, currentFate:2}]],
    [[null,null,null],[{id:'301', iid:'juan-target', name:'Opponent', type:'Dauntless', owner:1, fate:3, currentFate:3},null,null],[null,null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  phase:'main',
  placing:true,
  selectedHandCard:0
});
const juanCarlosHash = canonicalStateHash(juanCarlosBase);
const juanCarlosSet = reduceServerAction({canonicalState:juanCarlosBase, canonicalHash:juanCarlosHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:true,
  selectedHand:{index:0, iid:'c-39-place', id:'39'},
  baseStateHash:juanCarlosHash,
  postState:juanCarlosBase,
  stateHash:juanCarlosHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(juanCarlosSet.ok, true, juanCarlosSet.reason);
assert.strictEqual(juanCarlosSet.canonicalState._serverPendingZonePick.kind, 'juanCarlosSelectMoveTarget');
const juanCarlosPick = reduceServerAction({canonicalState:juanCarlosSet.canonicalState, canonicalHash:juanCarlosSet.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[{z:1, r:1, c:0, card:{iid:'juan-target', id:'301'}}],
  baseStateHash:juanCarlosSet.canonicalHash,
  postState:juanCarlosSet.canonicalState,
  stateHash:juanCarlosSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(juanCarlosPick.ok, true, juanCarlosPick.reason);
assert.strictEqual(juanCarlosPick.canonicalState._serverPendingMove.kind, 'juanCarlosMove');
const juanCarlosMove = reduceServerAction({canonicalState:juanCarlosPick.canonicalState, canonicalHash:juanCarlosPick.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:1,
  c:0,
  placing:false,
  baseStateHash:juanCarlosPick.canonicalHash,
  postState:juanCarlosPick.canonicalState,
  stateHash:juanCarlosPick.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(juanCarlosMove.ok, true, juanCarlosMove.reason);
assert.strictEqual(juanCarlosMove.canonicalState.board[1][1][0], null);
assert.strictEqual(juanCarlosMove.canonicalState.board[0][1][0].iid, 'juan-target');
assert.strictEqual(juanCarlosMove.canonicalState.board[0][1][0].currentFate, 3);

const markKemperBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'43', iid:'c-43-place', name:'Mark Kemper', type:'Initiator', cost:0, fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  extraRows:[0,0,0],
  extraRowOwners:[[],[],[]],
  markSafeSquares:[]
});
const markKemperHash = canonicalStateHash(markKemperBase);
const markKemperSet = reduceServerAction({canonicalState:markKemperBase, canonicalHash:markKemperHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:true,
  selectedHand:{index:0, iid:'c-43-place', id:'43'},
  baseStateHash:markKemperHash,
  postState:markKemperBase,
  stateHash:markKemperHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(markKemperSet.ok, true, markKemperSet.reason);
assert.strictEqual(markKemperSet.canonicalState._serverPendingMove.kind, 'markKemperSafeSquare');
const markKemperClick = reduceServerAction({canonicalState:markKemperSet.canonicalState, canonicalHash:markKemperSet.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:1,
  r:3,
  c:1,
  placing:false,
  baseStateHash:markKemperSet.canonicalHash,
  postState:markKemperSet.canonicalState,
  stateHash:markKemperSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(markKemperClick.ok, true, markKemperClick.reason);
assert.strictEqual(markKemperClick.canonicalState.extraRows[1], 1);
assert.deepStrictEqual(markKemperClick.canonicalState.markSafeSquares, [{z:1, r:3, c:1, owner:0, source:'mark', sourceIid:'c-43-place'}]);

const duncanBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'77', iid:'c-77-place', name:'Duncan Heyward', type:'Coordinator', fate:3, cost:0, aff:'eventide'}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[
    null,
    null,
    null
  ], [
    null,
    null,
    null
  ], [
    {id:'301', iid:'duncan-friendly-match', name:'Friendly Match', type:'Character', owner:0, currentFate:2, aff:'third_great_war'},
    {id:'302', iid:'duncan-friendly-other', name:'Friendly Other', type:'Character', owner:0, currentFate:2, aff:'reality'},
    null
  ]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0
});
const duncanHash = canonicalStateHash(duncanBase);
const duncanSet = reduceServerAction({canonicalState:duncanBase, canonicalHash:duncanHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'c-77-place', id:'77'},
  baseStateHash:duncanHash,
  postState:duncanBase,
  stateHash:duncanHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(duncanSet.ok, true, duncanSet.reason);
assert.strictEqual(duncanSet.canonicalState._serverPendingModalAction.kind, 'affiliationChoice');
assert.strictEqual(duncanSet.canonicalState._serverPendingModalAction.cardId, '77');
const duncanInvalid = reduceServerAction({canonicalState:duncanSet.canonicalState, canonicalHash:duncanSet.canonicalHash}, msg('MODAL_ACTION', {
  playerIndex:0,
  turn:1,
  promptId:duncanSet.canonicalState._serverPendingModalAction.promptId,
  aff:'not_a_real_affiliation',
  baseStateHash:duncanSet.canonicalHash,
  postState:duncanSet.canonicalState,
  stateHash:duncanSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(duncanInvalid.ok, false);
assert.match(duncanInvalid.reason, /affiliation choice/);
const duncanPickerMissingPrompt = reduceServerAction({canonicalState:duncanSet.canonicalState, canonicalHash:duncanSet.canonicalHash}, msg('PICK_AFFILIATION', {
  playerIndex:0,
  turn:1,
  omitPromptIdForTest:true,
  aff:'eventide',
  baseStateHash:duncanSet.canonicalHash,
  postState:duncanSet.canonicalState,
  stateHash:duncanSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(duncanPickerMissingPrompt.ok, false);
assert.match(duncanPickerMissingPrompt.reason, /promptId is required/);
const duncanCanonicalPickerChoice = reduceServerAction({canonicalState:duncanSet.canonicalState, canonicalHash:duncanSet.canonicalHash}, msg('RESOLVE_AFFILIATION_PICK', {
  playerIndex:0,
  turn:1,
  aff:'eventide',
  baseStateHash:duncanSet.canonicalHash,
  postState:duncanSet.canonicalState,
  stateHash:duncanSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(duncanCanonicalPickerChoice.ok, true, duncanCanonicalPickerChoice.reason);
assert.strictEqual(duncanCanonicalPickerChoice.canonicalState._serverPendingModalAction, null);
assert.strictEqual(duncanCanonicalPickerChoice.canonicalState.board[0][2][2]._declaredAff, 'eventide');
const duncanPickerChoice = reduceServerAction({canonicalState:duncanSet.canonicalState, canonicalHash:duncanSet.canonicalHash}, msg('PICK_AFFILIATION', {
  playerIndex:0,
  turn:1,
  promptId:duncanSet.canonicalState._serverPendingModalAction.promptId,
  aff:'eventide',
  baseStateHash:duncanSet.canonicalHash,
  postState:duncanSet.canonicalState,
  stateHash:duncanSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(duncanPickerChoice.ok, true, duncanPickerChoice.reason);
assert.strictEqual(duncanPickerChoice.canonicalState._serverPendingModalAction, null);
assert.strictEqual(duncanPickerChoice.canonicalState.board[0][2][2]._declaredAff, 'eventide');
const duncanChoice = reduceServerAction({canonicalState:duncanSet.canonicalState, canonicalHash:duncanSet.canonicalHash}, msg('MODAL_ACTION', {
  playerIndex:0,
  turn:1,
  promptId:duncanSet.canonicalState._serverPendingModalAction.promptId,
  aff:'third_great_war',
  baseStateHash:duncanSet.canonicalHash,
  postState:duncanSet.canonicalState,
  stateHash:duncanSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(duncanChoice.ok, true, duncanChoice.reason);
assert.strictEqual(duncanChoice.canonicalState._serverPendingModalAction, null);
assert.strictEqual(duncanChoice.canonicalState.board[0][2][2]._declaredAff, 'third_great_war');
const duncanScore = scoreResultForState(state({
  turn:20,
  maxTurns:20,
  currentPlayer:0,
  board:duncanChoice.canonicalState.board
}));
assert.strictEqual(duncanScore.zones[0].s0, 10);

const riveraBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'51', iid:'c-51-place', name:'Rivera', type:'Initiator', fate:1, cost:0, aff:'eventide'}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0
});
const riveraHash = canonicalStateHash(riveraBase);
const riveraSet = reduceServerAction({canonicalState:riveraBase, canonicalHash:riveraHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'c-51-place', id:'51'},
  baseStateHash:riveraHash,
  postState:riveraBase,
  stateHash:riveraHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(riveraSet.ok, true, riveraSet.reason);
assert.strictEqual(riveraSet.canonicalState._serverPendingModalAction.cardId, '51');
const riveraChoice = reduceServerAction({canonicalState:riveraSet.canonicalState, canonicalHash:riveraSet.canonicalHash}, msg('MODAL_ACTION', {
  playerIndex:0,
  turn:1,
  promptId:riveraSet.canonicalState._serverPendingModalAction.promptId,
  aff:'reality',
  baseStateHash:riveraSet.canonicalHash,
  postState:riveraSet.canonicalState,
  stateHash:riveraSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(riveraChoice.ok, true, riveraChoice.reason);
assert.strictEqual(riveraChoice.canonicalState.board[0][2][0]._riveraDeclaredAff, 'reality');
assert.strictEqual(riveraChoice.canonicalState._riveraBuffs[0].turnsLeft, 3);
const riveraOpponentTurn = strictEndTurnStep(riveraChoice, 0);
assert.strictEqual(riveraOpponentTurn.ok, true, riveraOpponentTurn.reason);
assert.strictEqual(riveraOpponentTurn.canonicalState._riveraBuffs[0].turnsLeft, 3);
const riveraOwnerTurn = strictEndTurnStep(riveraOpponentTurn, 1);
assert.strictEqual(riveraOwnerTurn.ok, true, riveraOwnerTurn.reason);
assert.strictEqual(riveraOwnerTurn.canonicalState._riveraBuffs[0].turnsLeft, 2);
assert.strictEqual(riveraOwnerTurn.canonicalState.board[0][2][0]._riveraBuffTurnsLeft, 2);
const riveraFollowupBase = state(Object.assign({}, riveraChoice.canonicalState, {
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'43', iid:'rivera-followup', name:'Mark Kemper', type:'Initiator', fate:2, cost:0, aff:'reality'}], discard:[]},
    riveraChoice.canonicalState.players[1]
  ],
  placing:true,
  selectedHandCard:0,
  currentPlayer:0
}));
const riveraFollowupHash = canonicalStateHash(riveraFollowupBase);
const riveraFollowup = reduceServerAction({canonicalState:riveraFollowupBase, canonicalHash:riveraFollowupHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:true,
  selectedHand:{index:0, iid:'rivera-followup', id:'43'},
  baseStateHash:riveraFollowupHash,
  postState:riveraFollowupBase,
  stateHash:riveraFollowupHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(riveraFollowup.ok, true, riveraFollowup.reason);
assert.strictEqual(riveraFollowup.canonicalState.board[0][2][1].currentFate, 6);
assert.strictEqual(riveraFollowup.canonicalState.board[0][2][1]._riveraFateBonus, 4);

const markMenzBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'66', iid:'c-66-place', name:'Mark Menz', type:'Initiator', fate:2, cost:0, aff:'reality'}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[
    {id:'304', iid:'menz-change-a', name:'Change A', type:'Character', owner:0, currentFate:2, aff:'eventide'},
    {id:'305', iid:'menz-immune', name:'Immune Holdout', type:'Character', owner:0, currentFate:2, aff:'eventide', immuneFlag:true},
    {id:'306', iid:'menz-opponent', name:'Opponent Card', type:'Character', owner:1, currentFate:2, aff:'eventide'}
  ]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0
});
const markMenzHash = canonicalStateHash(markMenzBase);
const markMenzSet = reduceServerAction({canonicalState:markMenzBase, canonicalHash:markMenzHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:1,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'c-66-place', id:'66'},
  baseStateHash:markMenzHash,
  postState:markMenzBase,
  stateHash:markMenzHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(markMenzSet.ok, true, markMenzSet.reason);
assert.strictEqual(markMenzSet.canonicalState._serverPendingModalAction.cardId, '66');
const markMenzChoice = reduceServerAction({canonicalState:markMenzSet.canonicalState, canonicalHash:markMenzSet.canonicalHash}, msg('MODAL_ACTION', {
  playerIndex:0,
  turn:1,
  promptId:markMenzSet.canonicalState._serverPendingModalAction.promptId,
  aff:'reality',
  baseStateHash:markMenzSet.canonicalHash,
  postState:markMenzSet.canonicalState,
  stateHash:markMenzSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(markMenzChoice.ok, true, markMenzChoice.reason);
assert.strictEqual(markMenzChoice.canonicalState.board[0][2][0].aff, 'reality');
assert.strictEqual(markMenzChoice.canonicalState.board[0][2][0]._affChangedBy, 'mark_menz');
assert.strictEqual(markMenzChoice.canonicalState.board[0][2][1].aff, 'eventide');
assert.strictEqual(markMenzChoice.canonicalState.board[0][2][2].aff, 'eventide');
assert.strictEqual(markMenzChoice.canonicalState.board[0][1][0].currentFate, 3);

const carolynBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'17', iid:'c-17-place', name:'Carolyn', type:'Initiator', fate:2, cost:0, aff:'expanded_worlds'}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  blockedCells:[{z:1, r:1, c:0, type:'zoe', owner:1, blockedPlayer:0}],
  phase:'main',
  placing:true,
  selectedHandCard:0
});
const carolynHash = canonicalStateHash(carolynBase);
const carolynSet = reduceServerAction({canonicalState:carolynBase, canonicalHash:carolynHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'c-17-place', id:'17'},
  baseStateHash:carolynHash,
  postState:carolynBase,
  stateHash:carolynHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(carolynSet.ok, true, carolynSet.reason);
assert.strictEqual(carolynSet.canonicalState._serverPendingMove.kind, 'carolynBlockCell');
const carolynLock = reduceServerAction({canonicalState:carolynSet.canonicalState, canonicalHash:carolynSet.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:1,
  r:1,
  c:0,
  placing:false,
  baseStateHash:carolynSet.canonicalHash,
  postState:carolynSet.canonicalState,
  stateHash:carolynSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(carolynLock.ok, true, carolynLock.reason);
assert.strictEqual(carolynLock.canonicalState._serverPendingMove, null);
assert.deepStrictEqual(carolynLock.canonicalState.blockedCells, [{z:1, r:1, c:0, type:'carolyn', owner:0, blockedPlayer:null}]);

const passiveSupporterPlacementBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[
      {id:'63', iid:'s-63-place', name:'Greek Hoplite', type:'Supporter', fate:1, aff:'third_great_war'},
      {id:'64', iid:'s-64-place', name:'Cook Islands Duelist', type:'Supporter', fate:1, aff:'eventide'}
    ], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const passiveSupporterHash = canonicalStateHash(passiveSupporterPlacementBase);
const greekHopliteSet = reduceServerAction({canonicalState:passiveSupporterPlacementBase, canonicalHash:passiveSupporterHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'s-63-place', id:'63'},
  baseStateHash:passiveSupporterHash,
  postState:passiveSupporterPlacementBase,
  stateHash:passiveSupporterHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(greekHopliteSet.ok, true, greekHopliteSet.reason);
assert.strictEqual(greekHopliteSet.canonicalState.board[0][2][0].iid, 's-63-place');
const cookPlacementBase = state(Object.assign({}, greekHopliteSet.canonicalState, {
  placing:true,
  selectedHandCard:0
}));
const cookPlacementHash = canonicalStateHash(cookPlacementBase);
const cookDuelistSet = reduceServerAction({canonicalState:cookPlacementBase, canonicalHash:cookPlacementHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:true,
  selectedHand:{index:0, iid:'s-64-place', id:'64'},
  baseStateHash:cookPlacementHash,
  postState:cookPlacementBase,
  stateHash:cookPlacementHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(cookDuelistSet.ok, true, cookDuelistSet.reason);
assert.strictEqual(cookDuelistSet.canonicalState.board[0][2][1].iid, 's-64-place');

const chaparralBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'27', iid:'c-27-chaparral', name:'Kazumi', type:'Initiator', fate:1, cost:1, aff:'eventide'}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[
    {id:'78', iid:'chaparral-source', name:'Chaparral Hoplite', type:'Supporter', owner:0, fate:1, currentFate:1, aff:'expanded_worlds'},
    {id:'201', iid:'chaparral-tribute', name:'Plain Supporter', type:'Supporter', owner:0, fate:1, currentFate:1},
    null
  ]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  selectedHandCard:0,
  erbsActive:[false,false]
});
const chaparralHash = canonicalStateHash(chaparralBase);
const chaparralReady = reduceServerAction({canonicalState:chaparralBase, canonicalHash:chaparralHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'c-27-chaparral', id:'27'},
  baseStateHash:chaparralHash,
  postState:chaparralBase,
  stateHash:chaparralHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(chaparralReady.ok, true, chaparralReady.reason);
const chaparralSelected = reduceServerAction({canonicalState:chaparralReady.canonicalState, canonicalHash:chaparralReady.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:false,
  baseStateHash:chaparralReady.canonicalHash,
  postState:chaparralReady.canonicalState,
  stateHash:chaparralReady.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(chaparralSelected.ok, true, chaparralSelected.reason);
const chaparralPrompt = reduceServerAction({canonicalState:chaparralSelected.canonicalState, canonicalHash:chaparralSelected.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:false,
  baseStateHash:chaparralSelected.canonicalHash,
  postState:chaparralSelected.canonicalState,
  stateHash:chaparralSelected.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(chaparralPrompt.ok, true, chaparralPrompt.reason);
assert.strictEqual(chaparralPrompt.canonicalState._serverPendingModalAction.kind, 'chaparralSetMode');
assert.strictEqual(chaparralPrompt.canonicalState._consolidating.phase, 'select_placement');
const chaparralNormal = reduceServerAction({canonicalState:chaparralPrompt.canonicalState, canonicalHash:chaparralPrompt.canonicalHash}, msg('MODAL_ACTION', {
  playerIndex:0,
  turn:1,
  promptId:chaparralPrompt.canonicalState._serverPendingModalAction.promptId,
  actionIndex:0,
  baseStateHash:chaparralPrompt.canonicalHash,
  postState:chaparralPrompt.canonicalState,
  stateHash:chaparralPrompt.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(chaparralNormal.ok, true, chaparralNormal.reason);
assert.strictEqual(chaparralNormal.canonicalState.board[0][2][1].iid, 'c-27-chaparral');
assert.strictEqual(!!chaparralNormal.canonicalState.board[0][2][1].faceDown, false);
assert.strictEqual(!!chaparralNormal.canonicalState.board[0][2][0]._chaparralAmbushUsed, false);
const chaparralCanonicalNormal = reduceServerAction({canonicalState:chaparralPrompt.canonicalState, canonicalHash:chaparralPrompt.canonicalHash}, msg('RESOLVE_MODAL', {
  playerIndex:0,
  turn:1,
  actionIndex:0,
  baseStateHash:chaparralPrompt.canonicalHash,
  postState:chaparralPrompt.canonicalState,
  stateHash:chaparralPrompt.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(chaparralCanonicalNormal.ok, true, chaparralCanonicalNormal.reason);
assert.strictEqual(chaparralCanonicalNormal.canonicalState.board[0][2][1].iid, 'c-27-chaparral');
assert.strictEqual(!!chaparralCanonicalNormal.canonicalState.board[0][2][1].faceDown, false);
const chaparralFaceDown = reduceServerAction({canonicalState:chaparralPrompt.canonicalState, canonicalHash:chaparralPrompt.canonicalHash}, msg('MODAL_ACTION', {
  playerIndex:0,
  turn:1,
  promptId:chaparralPrompt.canonicalState._serverPendingModalAction.promptId,
  actionIndex:1,
  baseStateHash:chaparralPrompt.canonicalHash,
  postState:chaparralPrompt.canonicalState,
  stateHash:chaparralPrompt.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(chaparralFaceDown.ok, true, chaparralFaceDown.reason);
assert.strictEqual(chaparralFaceDown.canonicalState._serverPendingModalAction, null);
assert.strictEqual(chaparralFaceDown.canonicalState._consolidating, null);
assert.strictEqual(chaparralFaceDown.canonicalState.board[0][2][1].iid, 'c-27-chaparral');
assert.strictEqual(chaparralFaceDown.canonicalState.board[0][2][1].faceDown, true);
assert.strictEqual(chaparralFaceDown.canonicalState.board[0][2][0]._chaparralAmbushUsed, true);
assert.strictEqual(chaparralFaceDown.canonicalState.players[0].discard[0].iid, 'chaparral-tribute');

const westCaribSetBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'33', iid:'s-33-place', name:'West Caribbea Infantry', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const westCaribSetHash = canonicalStateHash(westCaribSetBase);
const westCaribSet = reduceServerAction({canonicalState:westCaribSetBase, canonicalHash:westCaribSetHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-33-place', id:'33'},
  baseStateHash:westCaribSetHash,
  postState:westCaribSetBase,
  stateHash:westCaribSetHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(westCaribSet.ok, true, westCaribSet.reason);
assert.deepStrictEqual(westCaribSet.canonicalState._westCaribNext, {owner:0});

const alpineSetBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'76', iid:'s-76-place', name:'ALPINE Infantry', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const alpineSetHash = canonicalStateHash(alpineSetBase);
const alpineSet = reduceServerAction({canonicalState:alpineSetBase, canonicalHash:alpineSetHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-76-place', id:'76'},
  baseStateHash:alpineSetHash,
  postState:alpineSetBase,
  stateHash:alpineSetHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(alpineSet.ok, true, alpineSet.reason);
assert.strictEqual(alpineSet.canonicalState.board[0][2][2].currentFate, 5);
assert.strictEqual(alpineSet.canonicalState.board[0][2][2].immuneFlag, true);
assert.strictEqual(alpineSet.canonicalState.board[0][2][2].noBonus, true);
assert.strictEqual(alpineSet.canonicalState.board[0][2][2].noConsolidate, true);

const erbsBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'40', iid:'c-40-hand', name:'Christopher Erbs', type:'Improvisor', fate:4, cost:2}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'201', iid:'erbs-trib-1', name:'Plain Supporter A', type:'Supporter', owner:0, fate:1, currentFate:1},{id:'201', iid:'erbs-trib-2', name:'Plain Supporter B', type:'Supporter', owner:0, fate:1, currentFate:1},null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  selectedHandCard:0
});
const erbsHash = canonicalStateHash(erbsBase);
const erbsReady = reduceServerAction({canonicalState:erbsBase, canonicalHash:erbsHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'c-40-hand', id:'40'},
  baseStateHash:erbsHash,
  postState:erbsBase,
  stateHash:erbsHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(erbsReady.ok, true, erbsReady.reason);
const erbsFirst = reduceServerAction({canonicalState:erbsReady.canonicalState, canonicalHash:erbsReady.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  baseStateHash:erbsReady.canonicalHash,
  postState:erbsReady.canonicalState,
  stateHash:erbsReady.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(erbsFirst.ok, true, erbsFirst.reason);
const erbsSecond = reduceServerAction({canonicalState:erbsFirst.canonicalState, canonicalHash:erbsFirst.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:false,
  baseStateHash:erbsFirst.canonicalHash,
  postState:erbsFirst.canonicalState,
  stateHash:erbsFirst.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(erbsSecond.ok, true, erbsSecond.reason);
const erbsFinal = reduceServerAction({canonicalState:erbsSecond.canonicalState, canonicalHash:erbsSecond.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:false,
  baseStateHash:erbsSecond.canonicalHash,
  postState:erbsSecond.canonicalState,
  stateHash:erbsSecond.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(erbsFinal.ok, true, erbsFinal.reason);
assert.strictEqual(erbsFinal.canonicalState.board[0][2][1].iid, 'c-40-hand');
assert.strictEqual(erbsFinal.canonicalState.board[0][2][1].usesLeft, 2);
assert.strictEqual(erbsFinal.canonicalState.players[0].discard.length, 2);

const erbsManualBase = state({
  players:[
    {name:'Host', color:'', deck:[{id:'301', iid:'erbs-manual-draw', name:'Manual Draw', type:'Character', fate:1}], hand:[], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'40', iid:'erbs-manual-source', name:'Christopher Erbs', type:'Improvisor', owner:0, fate:4, currentFate:4, usesLeft:2},null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  currentPlayer:0,
  turn:1,
  erbsActive:[false,false]
});
const erbsManualHash = canonicalStateHash(erbsManualBase);
const erbsManualWrongIid = reduceServerAction({canonicalState:erbsManualBase, canonicalHash:erbsManualHash}, msg('BOARD_ACTION', {
  fn:'triggerCharacterEffect',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  cardIid:'not-erbs-manual-source',
  cardId:'40',
  baseStateHash:erbsManualHash,
  postState:erbsManualBase,
  stateHash:erbsManualHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(erbsManualWrongIid.ok, false);
assert.match(erbsManualWrongIid.reason, /source identity mismatch/);
const erbsManualArmed = reduceServerAction({canonicalState:erbsManualBase, canonicalHash:erbsManualHash}, msg('BOARD_ACTION', {
  fn:'triggerCharacterEffect',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  card:{iid:'erbs-manual-source', id:'40'},
  baseStateHash:erbsManualHash,
  postState:erbsManualBase,
  stateHash:erbsManualHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(erbsManualArmed.ok, true, erbsManualArmed.reason);
assert.strictEqual(erbsManualArmed.canonicalState.board[0][2][0].usesLeft, 1);
assert.strictEqual(erbsManualArmed.canonicalState.erbsActive[0], true);
const erbsManualRepeat = reduceServerAction({canonicalState:erbsManualArmed.canonicalState, canonicalHash:erbsManualArmed.canonicalHash}, msg('BOARD_ACTION', {
  fn:'triggerCharacterEffect',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  card:{iid:'erbs-manual-source', id:'40'},
  baseStateHash:erbsManualArmed.canonicalHash,
  postState:erbsManualArmed.canonicalState,
  stateHash:erbsManualArmed.canonicalHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(erbsManualRepeat.ok, false);
assert.match(erbsManualRepeat.reason, /already armed/);

const manualDiscardBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,null,null],[{id:'201', iid:'manual-discard-card', name:'Plain Board Card', type:'Supporter', owner:0, fate:1, currentFate:1},null,null]],
    [[null,null,null],[null,null,null],[null,null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  phase:'main',
  currentPlayer:0,
  turn:1
});
const manualDiscardHash = canonicalStateHash(manualDiscardBase);
const manualDiscarded = reduceServerAction({canonicalState:manualDiscardBase, canonicalHash:manualDiscardHash}, msg('BOARD_ACTION', {
  fn:'discardBoardCard',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  card:{iid:'manual-discard-card', id:'201'},
  baseStateHash:manualDiscardHash,
  postState:manualDiscardBase,
  stateHash:manualDiscardHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(manualDiscarded.ok, true, manualDiscarded.reason);
assert.strictEqual(manualDiscarded.canonicalState.board[0][2][0], null);
assert.strictEqual(manualDiscarded.canonicalState.players[0].discard[0].iid, 'manual-discard-card');

const alpineManualDiscardBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,null,null],[{id:'76', iid:'manual-alpine', name:'ALPINE Infantry', type:'Supporter', owner:0, fate:5, currentFate:5, immuneFlag:true},null,null]],
    [[null,null,null],[null,null,null],[null,null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  phase:'main',
  currentPlayer:0,
  turn:1
});
const alpineManualDiscardHash = canonicalStateHash(alpineManualDiscardBase);
const alpineManualDiscardRejected = reduceServerAction({canonicalState:alpineManualDiscardBase, canonicalHash:alpineManualDiscardHash}, msg('BOARD_ACTION', {
  fn:'discardBoardCard',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  card:{iid:'manual-alpine', id:'76'},
  baseStateHash:alpineManualDiscardHash,
  postState:alpineManualDiscardBase,
  stateHash:alpineManualDiscardHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(alpineManualDiscardRejected.ok, false);
assert.match(alpineManualDiscardRejected.reason, /cannot be discarded/);

const lydiaManualDiscardBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,null,null],[
      {id:'56', iid:'manual-lydia', name:'Lydia', type:'Improvisor', owner:0, fate:2, currentFate:2, usesLeft:4},
      {id:'24', iid:'manual-suppressed-ralph', name:"Ralph's Courtesy Clerk", type:'Supporter', owner:0, fate:1, _lydiaSuppressed:true},
      null
    ]],
    [[null,null,null],[null,null,null],[null,null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  phase:'main',
  currentPlayer:0,
  turn:1
});
const lydiaManualDiscardHash = canonicalStateHash(lydiaManualDiscardBase);
const lydiaManualDiscarded = reduceServerAction({canonicalState:lydiaManualDiscardBase, canonicalHash:lydiaManualDiscardHash}, msg('BOARD_ACTION', {
  fn:'discardBoardCard',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  card:{iid:'manual-lydia', id:'56'},
  baseStateHash:lydiaManualDiscardHash,
  postState:lydiaManualDiscardBase,
  stateHash:lydiaManualDiscardHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(lydiaManualDiscarded.ok, true, lydiaManualDiscarded.reason);
assert.strictEqual(lydiaManualDiscarded.canonicalState.players[0].discard[0].iid, 'manual-lydia');
assert.strictEqual(!!lydiaManualDiscarded.canonicalState.board[0][2][1]._lydiaSuppressed, false);

const artilleryManualDiscardBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,null,null],[{id:'50', iid:'manual-artillery', name:'Artillery Distance', type:'Supporter', owner:0, fate:1},null,null]],
    [[null,null,null],[null,null,null],[null,null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  phase:'main',
  currentPlayer:0,
  turn:1,
  _artilleryLockTurnsLeft:2,
  _artilleryEffectBlockLifted:false
});
const artilleryManualDiscardHash = canonicalStateHash(artilleryManualDiscardBase);
const artilleryManualDiscarded = reduceServerAction({canonicalState:artilleryManualDiscardBase, canonicalHash:artilleryManualDiscardHash}, msg('BOARD_ACTION', {
  fn:'discardBoardCard',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  card:{iid:'manual-artillery', id:'50'},
  baseStateHash:artilleryManualDiscardHash,
  postState:artilleryManualDiscardBase,
  stateHash:artilleryManualDiscardHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(artilleryManualDiscarded.ok, true, artilleryManualDiscarded.reason);
assert.strictEqual(artilleryManualDiscarded.canonicalState._artilleryEffectBlockLifted, true);

const roboManualDiscardBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,null,null],[{id:'301', iid:'manual-robo-stolen', name:'Stolen Card', type:'Character', owner:0, fate:2, _stolenByRobo:true, _roboOrigOwner:1},null,null]],
    [[null,null,null],[null,null,null],[null,null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  phase:'main',
  currentPlayer:0,
  turn:1
});
const roboManualDiscardHash = canonicalStateHash(roboManualDiscardBase);
const roboManualDiscarded = reduceServerAction({canonicalState:roboManualDiscardBase, canonicalHash:roboManualDiscardHash}, msg('BOARD_ACTION', {
  fn:'discardBoardCard',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  card:{iid:'manual-robo-stolen', id:'301'},
  baseStateHash:roboManualDiscardHash,
  postState:roboManualDiscardBase,
  stateHash:roboManualDiscardHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(roboManualDiscarded.ok, true, roboManualDiscarded.reason);
assert.strictEqual(roboManualDiscarded.canonicalState.players[1].deck[0].iid, 'manual-robo-stolen');
assert.strictEqual(roboManualDiscarded.canonicalState.players[0].discard.length, 0);

const faceDownFlipBase = state({
  players:[
    {name:'Host', color:'', deck:[{id:'301', iid:'flip-drawn-card', name:'Flip Drawn Card', type:'Character', fate:1}], hand:[], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,null,null],[{id:'32', iid:'flip-temecula', name:'Temecula Resident', type:'Supporter', owner:0, fate:1, currentFate:1, faceDown:true},null,null]],
    [[null,null,null],[null,null,null],[null,null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  phase:'main',
  currentPlayer:0,
  turn:1
});
const faceDownFlipHash = canonicalStateHash(faceDownFlipBase);
const faceDownFlipped = reduceServerAction({canonicalState:faceDownFlipBase, canonicalHash:faceDownFlipHash}, msg('BOARD_ACTION', {
  fn:'flipFaceDownBoardCard',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  card:{iid:'flip-temecula', id:'32'},
  baseStateHash:faceDownFlipHash,
  postState:faceDownFlipBase,
  stateHash:faceDownFlipHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(faceDownFlipped.ok, true, faceDownFlipped.reason);
assert.strictEqual(!!faceDownFlipped.canonicalState.board[0][2][0].faceDown, false);
assert.strictEqual(faceDownFlipped.canonicalState.players[0].hand[0].iid, 'flip-drawn-card');
const faceDownFlipAgain = reduceServerAction({canonicalState:faceDownFlipped.canonicalState, canonicalHash:faceDownFlipped.canonicalHash}, msg('BOARD_ACTION', {
  fn:'flipFaceDownBoardCard',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  card:{iid:'flip-temecula', id:'32'},
  baseStateHash:faceDownFlipped.canonicalHash,
  postState:faceDownFlipped.canonicalState,
  stateHash:faceDownFlipped.canonicalHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(faceDownFlipAgain.ok, false);
assert.match(faceDownFlipAgain.reason, /already face up/);

const pendingWhenSetBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,null,null],[
      {id:'05', iid:'pending-liberators', name:'17th British Regiment', type:'Supporter', owner:0, fate:1, currentFate:1, _pendingWhenSetEffect:{z:0, r:2, c:0, owner:0, turnQueued:1}},
      {id:'301', iid:'pending-target', name:'Pending Target', type:'Character', owner:0, fate:2, currentFate:2},
      null
    ]],
    [[null,null,null],[null,null,null],[null,null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  phase:'main',
  currentPlayer:0,
  turn:1
});
const pendingWhenSetHash = canonicalStateHash(pendingWhenSetBase);
const pendingWhenSetActivated = reduceServerAction({canonicalState:pendingWhenSetBase, canonicalHash:pendingWhenSetHash}, msg('BOARD_ACTION', {
  fn:'activatePendingWhenSetEffect',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  card:{iid:'pending-liberators', id:'05'},
  baseStateHash:pendingWhenSetHash,
  postState:pendingWhenSetBase,
  stateHash:pendingWhenSetHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(pendingWhenSetActivated.ok, true, pendingWhenSetActivated.reason);
assert.strictEqual(pendingWhenSetActivated.canonicalState.board[0][2][0]._pendingWhenSetEffect, undefined);
assert.strictEqual(pendingWhenSetActivated.canonicalState._serverPendingZonePick.kind, 'liberatorsFateGain');
const expiredPendingWhenSetBase = state(Object.assign({}, pendingWhenSetBase, {turn:2}));
const expiredPendingWhenSetHash = canonicalStateHash(expiredPendingWhenSetBase);
const expiredPendingWhenSetRejected = reduceServerAction({canonicalState:expiredPendingWhenSetBase, canonicalHash:expiredPendingWhenSetHash}, msg('BOARD_ACTION', {
  fn:'activatePendingWhenSetEffect',
  playerIndex:0,
  turn:2,
  z:0,
  r:2,
  c:0,
  card:{iid:'pending-liberators', id:'05'},
  baseStateHash:expiredPendingWhenSetHash,
  postState:expiredPendingWhenSetBase,
  stateHash:expiredPendingWhenSetHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(expiredPendingWhenSetRejected.ok, false);
assert.match(expiredPendingWhenSetRejected.reason, /expired/);

const panaceaMoveBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,null,null],[{id:'301', iid:'panacea-mover', name:'Eventide Mover', type:'Character', aff:'eventide', owner:0, fate:2, currentFate:2},null,null]],
    [[null,null,null],[null,null,null],[null,{id:'34', iid:'panacea-rozsi', name:'Rozsi Szocs', type:'Coordinator', owner:0, fate:1, currentFate:1},null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  landscapeId:'igb7',
  phase:'main',
  currentPlayer:0,
  turn:1
});
const panaceaMoveHash = canonicalStateHash(panaceaMoveBase);
const panaceaMoveArmed = reduceServerAction({canonicalState:panaceaMoveBase, canonicalHash:panaceaMoveHash}, msg('BOARD_ACTION', {
  fn:'activateLandscapeEventideMove',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  card:{iid:'panacea-mover', id:'301'},
  baseStateHash:panaceaMoveHash,
  postState:panaceaMoveBase,
  stateHash:panaceaMoveHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(panaceaMoveArmed.ok, true, panaceaMoveArmed.reason);
assert.strictEqual(panaceaMoveArmed.canonicalState._serverPendingMove.kind, 'landscapeEventideMove');
assert(panaceaMoveArmed.canonicalState._serverPendingMove.options.some(item=>item.z === 1 && item.r === 1 && item.c === 0));
const panaceaMoved = reduceServerAction({canonicalState:panaceaMoveArmed.canonicalState, canonicalHash:panaceaMoveArmed.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:1,
  r:1,
  c:0,
  baseStateHash:panaceaMoveArmed.canonicalHash,
  postState:panaceaMoveArmed.canonicalState,
  stateHash:panaceaMoveArmed.canonicalHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(panaceaMoved.ok, true, panaceaMoved.reason);
assert.strictEqual(panaceaMoved.canonicalState.board[0][2][0], null);
assert.strictEqual(panaceaMoved.canonicalState.board[1][1][0].iid, 'panacea-mover');
assert.strictEqual(panaceaMoved.canonicalState.board[1][1][0]._landscapeEventideMovedTurn, 1);
assert.strictEqual(panaceaMoved.canonicalState.board[1][1][0].currentFate, 4);
const panaceaRepeat = reduceServerAction({canonicalState:panaceaMoved.canonicalState, canonicalHash:panaceaMoved.canonicalHash}, msg('BOARD_ACTION', {
  fn:'activateLandscapeEventideMove',
  playerIndex:0,
  turn:1,
  z:1,
  r:1,
  c:0,
  card:{iid:'panacea-mover', id:'301'},
  baseStateHash:panaceaMoved.canonicalHash,
  postState:panaceaMoved.canonicalState,
  stateHash:panaceaMoved.canonicalHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(panaceaRepeat.ok, false);
assert.match(panaceaRepeat.reason, /already used/);
const panaceaOpponentTurn = reduceServerAction({canonicalState:panaceaMoved.canonicalState, canonicalHash:panaceaMoved.canonicalHash}, msg('END_TURN', {
  playerIndex:0,
  turn:1,
  baseStateHash:panaceaMoved.canonicalHash,
  postState:panaceaMoved.canonicalState,
  stateHash:panaceaMoved.canonicalHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(panaceaOpponentTurn.ok, true, panaceaOpponentTurn.reason);
const panaceaBackToHost = reduceServerAction({canonicalState:panaceaOpponentTurn.canonicalState, canonicalHash:panaceaOpponentTurn.canonicalHash}, msg('END_TURN', {
  playerIndex:1,
  turn:2,
  baseStateHash:panaceaOpponentTurn.canonicalHash,
  postState:panaceaOpponentTurn.canonicalState,
  stateHash:panaceaOpponentTurn.canonicalHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(panaceaBackToHost.ok, true, panaceaBackToHost.reason);
assert.strictEqual(panaceaBackToHost.canonicalState.board[1][1][0]._landscapeEventideMovedTurn, null);
const panaceaInactive = state(Object.assign({}, panaceaMoveBase, {landscapeId:'igb1'}));
const panaceaInactiveHash = canonicalStateHash(panaceaInactive);
const panaceaInactiveRejected = reduceServerAction({canonicalState:panaceaInactive, canonicalHash:panaceaInactiveHash}, msg('BOARD_ACTION', {
  fn:'activateLandscapeEventideMove',
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  card:{iid:'panacea-mover', id:'301'},
  baseStateHash:panaceaInactiveHash,
  postState:panaceaInactive,
  stateHash:panaceaInactiveHash
}), {mode:'strict', requireBaseHash:true});
assert.strictEqual(panaceaInactiveRejected.ok, false);
assert.match(panaceaInactiveRejected.reason, /landscape is not active/);

const kazumiBase = state({
  players:[
    {name:'Host', color:'', deck:[
      {id:'301', iid:'kazumi-draw-1', name:'Drawn One', type:'Character', fate:1},
      {id:'302', iid:'kazumi-draw-2', name:'Drawn Two', type:'Supporter', fate:1},
      {id:'303', iid:'kazumi-draw-3', name:'Drawn Three', type:'Character', fate:1}
    ], hand:[{id:'27', iid:'c-27-hand', name:'Kazumi', type:'Initiator', fate:1, cost:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'201', iid:'kazumi-trib-1', name:'Plain Supporter', type:'Supporter', owner:0, fate:1, currentFate:1},null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  selectedHandCard:0,
  erbsActive:[false,false]
});
const kazumiHash = canonicalStateHash(kazumiBase);
const kazumiReady = reduceServerAction({canonicalState:kazumiBase, canonicalHash:kazumiHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'c-27-hand', id:'27'},
  baseStateHash:kazumiHash,
  postState:kazumiBase,
  stateHash:kazumiHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(kazumiReady.ok, true, kazumiReady.reason);
const kazumiSelected = reduceServerAction({canonicalState:kazumiReady.canonicalState, canonicalHash:kazumiReady.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  baseStateHash:kazumiReady.canonicalHash,
  postState:kazumiReady.canonicalState,
  stateHash:kazumiReady.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(kazumiSelected.ok, true, kazumiSelected.reason);
const kazumiFinal = reduceServerAction({canonicalState:kazumiSelected.canonicalState, canonicalHash:kazumiSelected.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  baseStateHash:kazumiSelected.canonicalHash,
  postState:kazumiSelected.canonicalState,
  stateHash:kazumiSelected.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(kazumiFinal.ok, true, kazumiFinal.reason);
assert.strictEqual(kazumiFinal.canonicalState.board[0][2][0].iid, 'c-27-hand');
assert.strictEqual(kazumiFinal.canonicalState.players[0].deck.length, 0);
assert.deepStrictEqual(kazumiFinal.canonicalState.players[0].hand.map(card=>card.iid), ['kazumi-draw-1', 'kazumi-draw-2', 'kazumi-draw-3']);

const polishArmyBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'28', iid:'s-28-place', name:'2nd Polish-Lithuanian Army', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const polishArmyHash = canonicalStateHash(polishArmyBase);
const polishArmySet = reduceServerAction({canonicalState:polishArmyBase, canonicalHash:polishArmyHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-28-place', id:'28'},
  baseStateHash:polishArmyHash,
  postState:polishArmyBase,
  stateHash:polishArmyHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(polishArmySet.ok, true, polishArmySet.reason);
assert.strictEqual(polishArmySet.canonicalState.board[0][2][2]._plUsesLeft, 2);

const snowyVillageBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'91', iid:'s-91-place', name:'Wodny Potok Villager', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const snowyVillageHash = canonicalStateHash(snowyVillageBase);
const snowyVillageSet = reduceServerAction({canonicalState:snowyVillageBase, canonicalHash:snowyVillageHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-91-place', id:'91'},
  baseStateHash:snowyVillageHash,
  postState:snowyVillageBase,
  stateHash:snowyVillageHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(snowyVillageSet.ok, true, snowyVillageSet.reason);
assert.strictEqual(snowyVillageSet.canonicalState._snowyVillageUses[0], 1);
assert.strictEqual(snowyVillageSet.canonicalState._landscapeChangeLocks[1], 5);
const snowyVillageTicked = strictEndTurnStep(snowyVillageSet, 0);
assert.strictEqual(snowyVillageTicked.ok, true, snowyVillageTicked.reason);
assert.strictEqual(snowyVillageTicked.canonicalState._landscapeChangeLocks[1], 4);

const sebastyenBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'83', iid:'c-83-place', name:'Sebastyen Janowicz', type:'Initiator', fate:1, cost:0, aff:'expanded_worlds'}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[
    {id:'301', iid:'seb-friendly', name:'Friendly Character', type:'Character', owner:0, currentFate:2, aff:'eventide'},
    {id:'201', iid:'seb-supporter', name:'Friendly Supporter', type:'Supporter', owner:0, currentFate:1, aff:'eventide'},
    {id:'76', iid:'seb-alpine', name:'ALPINE Infantry', type:'Supporter', owner:0, currentFate:5, aff:'expanded_worlds'}
  ]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0
});
const sebastyenHash = canonicalStateHash(sebastyenBase);
const sebastyenSet = reduceServerAction({canonicalState:sebastyenBase, canonicalHash:sebastyenHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:1,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'c-83-place', id:'83'},
  baseStateHash:sebastyenHash,
  postState:sebastyenBase,
  stateHash:sebastyenHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(sebastyenSet.ok, true, sebastyenSet.reason);
assert.strictEqual(sebastyenSet.canonicalState.board[0][2][0].currentFate, 4);
assert.strictEqual(sebastyenSet.canonicalState.board[0][2][1].currentFate, 1);
assert.strictEqual(sebastyenSet.canonicalState.board[0][2][2].currentFate, 5);
assert.strictEqual(sebastyenSet.canonicalState.board[0][1][0].currentFate, 3);
assert.strictEqual(sebastyenSet.canonicalState.board[0][1][0]._sebastyenBuff, 2);

const wojciechBase = state({
  players:[
    {name:'Host', color:'', deck:[
      {id:'401', iid:'woj-reality-a', name:'Reality A', type:'Character', fate:1, aff:'reality'},
      {id:'402', iid:'woj-eventide', name:'Eventide B', type:'Character', fate:1, aff:'eventide'},
      {id:'403', iid:'woj-reality-b', name:'Reality C', type:'Supporter', fate:1, aff:'reality'}
    ], hand:[{id:'90', iid:'c-90-place', name:'Wojciech', type:'Initiator', fate:1, cost:0, aff:'expanded_worlds'}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  roomCode:'woj-smoke'
});
const wojciechHash = canonicalStateHash(wojciechBase);
const wojciechSet = reduceServerAction({canonicalState:wojciechBase, canonicalHash:wojciechHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'c-90-place', id:'90'},
  baseStateHash:wojciechHash,
  postState:wojciechBase,
  stateHash:wojciechHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(wojciechSet.ok, true, wojciechSet.reason);
assert.strictEqual(wojciechSet.canonicalState._serverPendingModalAction.kind, 'affiliationChoice');
assert.strictEqual(wojciechSet.canonicalState._serverPendingModalAction.cardId, '90');
const wojciechChoice = reduceServerAction({canonicalState:wojciechSet.canonicalState, canonicalHash:wojciechSet.canonicalHash}, msg('MODAL_ACTION', {
  playerIndex:0,
  turn:1,
  promptId:wojciechSet.canonicalState._serverPendingModalAction.promptId,
  aff:'reality',
  baseStateHash:wojciechSet.canonicalHash,
  postState:wojciechSet.canonicalState,
  stateHash:wojciechSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(wojciechChoice.ok, true, wojciechChoice.reason);
assert.strictEqual(wojciechChoice.canonicalState._serverPendingModalAction, null);
assert.strictEqual(wojciechChoice.canonicalState.board[0][2][0]._declaredAff, 'reality');
assert.deepStrictEqual(wojciechChoice.canonicalState.players[0].hand.map(card=>card.iid).sort(), ['woj-reality-a', 'woj-reality-b']);
assert.deepStrictEqual(wojciechChoice.canonicalState.players[0].deck.map(card=>card.iid), ['woj-eventide']);

const mailmanBase = state({
  players:[
    {name:'Host', color:'', deck:[
      {id:'501', iid:'mail-square', name:'Square Card', type:'Character', rarity:'square', fate:1, aff:'eventide'},
      {id:'502', iid:'mail-triangle', name:'Triangle Card', type:'Supporter', rarity:'triangle', fate:1, aff:'reality'}
    ], hand:[{id:'94', iid:'s-94-place', name:'Wodny Potok Mailman', type:'Supporter', fate:1, aff:'expanded_worlds'}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const mailmanHash = canonicalStateHash(mailmanBase);
const mailmanSet = reduceServerAction({canonicalState:mailmanBase, canonicalHash:mailmanHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-94-place', id:'94'},
  baseStateHash:mailmanHash,
  postState:mailmanBase,
  stateHash:mailmanHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(mailmanSet.ok, true, mailmanSet.reason);
assert.strictEqual(mailmanSet.canonicalState._serverPendingCardPick.kind, 'mailDelivery');
assert.strictEqual(mailmanSet.canonicalState._serverPendingCardPick.filterRarity, 'triangle');
const mailmanPick = reduceServerAction({canonicalState:mailmanSet.canonicalState, canonicalHash:mailmanSet.canonicalHash}, msg('PICK_CARDS_VISUAL', {
  playerIndex:0,
  turn:1,
  selectedCards:[{iid:'mail-triangle', id:'502'}],
  baseStateHash:mailmanSet.canonicalHash,
  postState:mailmanSet.canonicalState,
  stateHash:mailmanSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(mailmanPick.ok, true, mailmanPick.reason);
assert.strictEqual(mailmanPick.canonicalState._serverPendingCardPick, null);
assert.deepStrictEqual(mailmanPick.canonicalState.players[0].deck.map(card=>card.iid), ['mail-square']);
assert.deepStrictEqual(mailmanPick.canonicalState.players[0].hand, []);
assert.strictEqual(mailmanPick.canonicalState._mailDeliveries.length, 1);
assert.strictEqual(mailmanPick.canonicalState._mailDeliveries[0].player, 0);
assert.strictEqual(mailmanPick.canonicalState._mailDeliveries[0].turnsLeft, 4);
assert.strictEqual(mailmanPick.canonicalState._mailDeliveries[0].card.iid, 'mail-triangle');
assert.strictEqual(mailmanPick.canonicalState.board[0][2][2].whenSetActivated, true);
let mailmanDeliveryStep = mailmanPick;
mailmanDeliveryStep = strictEndTurnStep(mailmanDeliveryStep, 0);
assert.strictEqual(mailmanDeliveryStep.ok, true, mailmanDeliveryStep.reason);
assert.strictEqual(mailmanDeliveryStep.canonicalState._mailDeliveries[0].turnsLeft, 4);
mailmanDeliveryStep = strictEndTurnStep(mailmanDeliveryStep, 1);
assert.strictEqual(mailmanDeliveryStep.ok, true, mailmanDeliveryStep.reason);
assert.strictEqual(mailmanDeliveryStep.canonicalState._mailDeliveries[0].turnsLeft, 3);
mailmanDeliveryStep = strictEndTurnStep(mailmanDeliveryStep, 0);
mailmanDeliveryStep = strictEndTurnStep(mailmanDeliveryStep, 1);
mailmanDeliveryStep = strictEndTurnStep(mailmanDeliveryStep, 0);
mailmanDeliveryStep = strictEndTurnStep(mailmanDeliveryStep, 1);
mailmanDeliveryStep = strictEndTurnStep(mailmanDeliveryStep, 0);
mailmanDeliveryStep = strictEndTurnStep(mailmanDeliveryStep, 1);
assert.strictEqual(mailmanDeliveryStep.ok, true, mailmanDeliveryStep.reason);
assert.deepStrictEqual(mailmanDeliveryStep.canonicalState._mailDeliveries, []);
assert.deepStrictEqual(mailmanDeliveryStep.canonicalState.players[0].hand.map(card=>card.iid), ['mail-triangle']);

const timedUpkeepBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,null,null],[
      {id:'95', iid:'specter-upkeep', name:'Carpathian Specter', type:'Supporter', owner:0, fate:1, currentFate:1, _specterTurnsOnField:1, _specterFateGains:0},
      {id:'100', iid:'wintertide-upkeep', name:'Felicyta and Kvetka (Youth)', type:'Dauntless', owner:0, fate:12, currentFate:12},
      null
    ]],
    [[null,null,null],[null,null,null],[null,null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  landscapeId:'igb15',
  _landscapeState:{id:'igb15', supporterEffectsThisTurn:[1,1]},
  _blameGameEffects:[{active:true, turnsLeft:1, sourceIid:'blame-source'}, null],
  currentPlayer:1,
  turn:8
});
const timedUpkeepTicked = strictEndTurnStep(timedUpkeepBase, 1);
assert.strictEqual(timedUpkeepTicked.ok, true, timedUpkeepTicked.reason);
assert.strictEqual(timedUpkeepTicked.canonicalState.currentPlayer, 0);
assert.strictEqual(timedUpkeepTicked.canonicalState._landscapeState.supporterEffectsThisTurn[0], 0);
assert.strictEqual(timedUpkeepTicked.canonicalState._blameGameEffects[0].active, false);
assert.strictEqual(timedUpkeepTicked.canonicalState.board[0][2][0].currentFate, 2);
assert.strictEqual(timedUpkeepTicked.canonicalState.board[0][2][0]._specterFateGains, 1);
assert.strictEqual(timedUpkeepTicked.canonicalState.board[0][2][1].currentFate, 13);
assert.strictEqual(timedUpkeepTicked.canonicalState.board[0][2][1]._wintertideLastTurn, 9);

const anickaBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[
      {id:'02', iid:'c-02-place', name:'Anicka Konvicka', type:'Initiator', fate:8, cost:0, aff:'eventide'},
      {id:'101', iid:'anicka-followup', name:'Plain Followup', type:'Character', fate:2, cost:0}
    ], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  extraRows:[0,0,0],
  extraRowOwners:[[],[],[]]
});
const anickaCatalog = {byId:new Map([
  ...realSupporterCatalog.byId,
  ['101', {id:'101', type:'Character', cost:0, effect:'', aff:''}]
])};
const anickaHash = canonicalStateHash(anickaBase);
const anickaSet = reduceServerAction({canonicalState:anickaBase, canonicalHash:anickaHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'c-02-place', id:'02'},
  baseStateHash:anickaHash,
  postState:anickaBase,
  stateHash:anickaHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:anickaCatalog});
assert.strictEqual(anickaSet.ok, true, anickaSet.reason);
assert.strictEqual(anickaSet.canonicalState.extraRows[0], 1);
assert.strictEqual(anickaSet.canonicalState.extraRowOwners[0][0], 0);
const anickaFollowupBase = state(Object.assign({}, anickaSet.canonicalState, {
  placing:true,
  selectedHandCard:0
}));
const anickaFollowupHash = canonicalStateHash(anickaFollowupBase);
const anickaFollowup = reduceServerAction({canonicalState:anickaFollowupBase, canonicalHash:anickaFollowupHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:3,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'anicka-followup', id:'101'},
  baseStateHash:anickaFollowupHash,
  postState:anickaFollowupBase,
  stateHash:anickaFollowupHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:anickaCatalog});
assert.strictEqual(anickaFollowup.ok, true, anickaFollowup.reason);
assert.strictEqual(anickaFollowup.canonicalState.board[0][3][0].currentFate, 5);
assert.strictEqual(anickaFollowup.canonicalState.board[0][3][0]._starlitPathBonus, 3);

const zimbabweBase = state({
  players:[
    {name:'Host', color:'', deck:[{id:'25', iid:'s-25-deck', name:'Zimbabwean Honor Guard', type:'Supporter', fate:1, aff:'third_great_war'}], hand:[{id:'25', iid:'s-25-place', name:'Zimbabwean Honor Guard', type:'Supporter', fate:1, aff:'third_great_war'}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:1,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const zimbabweHash = canonicalStateHash(zimbabweBase);
const zimbabweSet = reduceServerAction({canonicalState:zimbabweBase, canonicalHash:zimbabweHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'s-25-place', id:'25'},
  baseStateHash:zimbabweHash,
  postState:zimbabweBase,
  stateHash:zimbabweHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(zimbabweSet.ok, true, zimbabweSet.reason);
assert.strictEqual(zimbabweSet.canonicalState.placing, true);
assert.strictEqual(zimbabweSet.canonicalState._serverFreePlacement.kind, 'zimbabweHonorGuard');
assert.strictEqual(zimbabweSet.canonicalState.players[0].deck.length, 0);
assert.strictEqual(zimbabweSet.canonicalState.players[0].hand[0].iid, 's-25-deck');
assert.strictEqual(zimbabweSet.canonicalState.supportsPlacedThisTurn, 1);
const zimbabweFree = reduceServerAction({canonicalState:zimbabweSet.canonicalState, canonicalHash:zimbabweSet.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:true,
  selectedHand:{index:0, iid:'s-25-deck', id:'25'},
  baseStateHash:zimbabweSet.canonicalHash,
  postState:zimbabweSet.canonicalState,
  stateHash:zimbabweSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(zimbabweFree.ok, true, zimbabweFree.reason);
assert.strictEqual(zimbabweFree.canonicalState._serverFreePlacement, null);
assert.strictEqual(zimbabweFree.canonicalState.supportsPlacedThisTurn, 1);
assert.strictEqual(zimbabweFree.canonicalState.board[0][2][1].iid, 's-25-deck');
assert.strictEqual(zimbabweFree.canonicalState.board[0][2][1]._zimbabweFreeCopy, undefined);
assert.strictEqual(zimbabweFree.canonicalState.board[0][2][1]._serverFreePlacement, undefined);
assert.strictEqual(zimbabweFree.canonicalState.board[0][2][1]._serverFreePlacementConsumed, 'zimbabweHonorGuard');

const henryBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[
      {id:'21', iid:'c-21-place', name:'Henry Dong', type:'Dauntless', fate:5, cost:0, aff:'third_great_war'},
      {id:'301', iid:'henry-discard-a', name:'Discard A', type:'Character', fate:1},
      {id:'302', iid:'henry-discard-b', name:'Discard B', type:'Supporter', fate:1}
    ], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0
});
const henryHash = canonicalStateHash(henryBase);
const henrySet = reduceServerAction({canonicalState:henryBase, canonicalHash:henryHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'c-21-place', id:'21'},
  baseStateHash:henryHash,
  postState:henryBase,
  stateHash:henryHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(henrySet.ok, true, henrySet.reason);
assert.strictEqual(henrySet.canonicalState._serverPendingCardPick.kind, 'handDiscardBoost');
assert.strictEqual(henrySet.canonicalState._serverPendingCardPick.reason, 'henryDong');
const henryPick = reduceServerAction({canonicalState:henrySet.canonicalState, canonicalHash:henrySet.canonicalHash}, msg('PICK_CARDS_VISUAL', {
  playerIndex:0,
  turn:1,
  selectedCards:[{iid:'henry-discard-a'}, {iid:'henry-discard-b'}],
  baseStateHash:henrySet.canonicalHash,
  postState:henrySet.canonicalState,
  stateHash:henrySet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(henryPick.ok, true, henryPick.reason);
assert.strictEqual(henryPick.canonicalState.board[0][2][0].currentFate, 11);
assert.deepStrictEqual(henryPick.canonicalState.players[0].discard.map(card=>card.iid), ['henry-discard-a', 'henry-discard-b']);

const henryManualBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[
      {id:'303', iid:'henry-manual-a', name:'Manual A', type:'Character', fate:1},
      {id:'304', iid:'henry-manual-b', name:'Manual B', type:'Supporter', fate:1}
    ], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'21', iid:'henry-manual', name:'Henry Dong', type:'Dauntless', fate:5, currentFate:5, owner:0},null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  currentPlayer:0,
  turn:4
});
const henryManualHash = canonicalStateHash(henryManualBase);
const henryManualArmed = reduceServerAction({canonicalState:henryManualBase, canonicalHash:henryManualHash}, msg('BOARD_ACTION', {
  fn:'triggerCharacterEffect',
  playerIndex:0,
  turn:4,
  z:0,
  r:2,
  c:0,
  card:{id:'21', iid:'henry-manual'},
  baseStateHash:henryManualHash,
  postState:henryManualBase,
  stateHash:henryManualHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(henryManualArmed.ok, true, henryManualArmed.reason);
assert.strictEqual(henryManualArmed.canonicalState._serverPendingCardPick.kind, 'handDiscardBoost');
assert.strictEqual(henryManualArmed.canonicalState._serverPendingCardPick.reason, 'henryDong');
const henryManualPick = reduceServerAction({canonicalState:henryManualArmed.canonicalState, canonicalHash:henryManualArmed.canonicalHash}, msg('PICK_CARDS_VISUAL', {
  playerIndex:0,
  turn:4,
  selectedCards:[{iid:'henry-manual-a'}, {iid:'henry-manual-b'}],
  baseStateHash:henryManualArmed.canonicalHash,
  postState:henryManualArmed.canonicalState,
  stateHash:henryManualArmed.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(henryManualPick.ok, true, henryManualPick.reason);
assert.strictEqual(henryManualPick.canonicalState.board[0][2][0].currentFate, 11);
assert.deepStrictEqual(henryManualPick.canonicalState.players[0].discard.map(card=>card.iid), ['henry-manual-a', 'henry-manual-b']);
assert.strictEqual(henryManualPick.canonicalState.board[0][2][0].effectUsedInitial, true);
const henryManualRepeat = reduceServerAction({canonicalState:henryManualPick.canonicalState, canonicalHash:henryManualPick.canonicalHash}, msg('BOARD_ACTION', {
  fn:'triggerCharacterEffect',
  playerIndex:0,
  turn:4,
  z:0,
  r:2,
  c:0,
  card:{id:'21', iid:'henry-manual'},
  baseStateHash:henryManualPick.canonicalHash,
  postState:henryManualPick.canonicalState,
  stateHash:henryManualPick.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(henryManualRepeat.ok, false);
assert.match(henryManualRepeat.reason, /already activated/);

const henryManualNoHandBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'21', iid:'henry-no-hand', name:'Henry Dong', type:'Dauntless', fate:5, currentFate:5, owner:0},null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  currentPlayer:0,
  turn:4
});
const henryManualNoHandHash = canonicalStateHash(henryManualNoHandBase);
const henryManualNoHand = reduceServerAction({canonicalState:henryManualNoHandBase, canonicalHash:henryManualNoHandHash}, msg('BOARD_ACTION', {
  fn:'triggerCharacterEffect',
  playerIndex:0,
  turn:4,
  z:0,
  r:2,
  c:0,
  card:{id:'21', iid:'henry-no-hand'},
  baseStateHash:henryManualNoHandHash,
  postState:henryManualNoHandBase,
  stateHash:henryManualNoHandHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(henryManualNoHand.ok, false);
assert.match(henryManualNoHand.reason, /needs cards in hand/);

const jakeBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[
      {id:'38', iid:'c-38-place', name:'Jake', type:'Dauntless', fate:1, cost:0, aff:'reality'},
      {id:'301', iid:'jake-bad-character', name:'Not Supporter', type:'Character', fate:1},
      {id:'201', iid:'jake-supporter', name:'Jake Food', type:'Supporter', fate:1}
    ], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0
});
const jakeHash = canonicalStateHash(jakeBase);
const jakeSet = reduceServerAction({canonicalState:jakeBase, canonicalHash:jakeHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'c-38-place', id:'38'},
  baseStateHash:jakeHash,
  postState:jakeBase,
  stateHash:jakeHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(jakeSet.ok, true, jakeSet.reason);
assert.strictEqual(jakeSet.canonicalState._serverPendingCardPick.reason, 'jakeSupporterDiscard');
const jakeBadPick = reduceServerAction({canonicalState:jakeSet.canonicalState, canonicalHash:jakeSet.canonicalHash}, msg('PICK_CARDS_VISUAL', {
  playerIndex:0,
  turn:1,
  selectedCards:[{iid:'jake-bad-character'}],
  baseStateHash:jakeSet.canonicalHash,
  postState:jakeSet.canonicalState,
  stateHash:jakeSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(jakeBadPick.ok, false);
assert.match(jakeBadPick.reason, /Supporter/);
const jakePick = reduceServerAction({canonicalState:jakeSet.canonicalState, canonicalHash:jakeSet.canonicalHash}, msg('PICK_CARDS_VISUAL', {
  playerIndex:0,
  turn:1,
  selectedCards:[{iid:'jake-supporter'}],
  baseStateHash:jakeSet.canonicalHash,
  postState:jakeSet.canonicalState,
  stateHash:jakeSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(jakePick.ok, true, jakePick.reason);
assert.strictEqual(jakePick.canonicalState.board[0][2][0].currentFate, 4);
assert.strictEqual(jakePick.canonicalState.board[0][2][0].effectUsedThisTurn, true);
assert.deepStrictEqual(jakePick.canonicalState.players[0].discard.map(card=>card.iid), ['jake-supporter']);

const jakeManualBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'202', iid:'jake-manual-food', name:'Manual Food', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'38', iid:'jake-manual', name:'Jake', type:'Dauntless', fate:1, currentFate:4, owner:0},null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  currentPlayer:0,
  turn:3
});
const jakeManualHash = canonicalStateHash(jakeManualBase);
const jakeManualArmed = reduceServerAction({canonicalState:jakeManualBase, canonicalHash:jakeManualHash}, msg('BOARD_ACTION', {
  fn:'triggerCharacterEffect',
  playerIndex:0,
  turn:3,
  z:0,
  r:2,
  c:0,
  card:{id:'38', iid:'jake-manual'},
  baseStateHash:jakeManualHash,
  postState:jakeManualBase,
  stateHash:jakeManualHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(jakeManualArmed.ok, true, jakeManualArmed.reason);
assert.strictEqual(jakeManualArmed.canonicalState._serverPendingCardPick.kind, 'handDiscardBoost');
assert.strictEqual(jakeManualArmed.canonicalState._serverPendingCardPick.reason, 'jakeSupporterDiscard');
const jakeManualPicked = reduceServerAction({canonicalState:jakeManualArmed.canonicalState, canonicalHash:jakeManualArmed.canonicalHash}, msg('PICK_CARDS_VISUAL', {
  playerIndex:0,
  turn:3,
  selectedCards:[{iid:'jake-manual-food'}],
  baseStateHash:jakeManualArmed.canonicalHash,
  postState:jakeManualArmed.canonicalState,
  stateHash:jakeManualArmed.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(jakeManualPicked.ok, true, jakeManualPicked.reason);
assert.strictEqual(jakeManualPicked.canonicalState.board[0][2][0].currentFate, 7);
assert.strictEqual(jakeManualPicked.canonicalState.board[0][2][0].effectUsedThisTurn, true);
assert.deepStrictEqual(jakeManualPicked.canonicalState.players[0].discard.map(card=>card.iid), ['jake-manual-food']);
const jakeManualRepeat = reduceServerAction({canonicalState:jakeManualPicked.canonicalState, canonicalHash:jakeManualPicked.canonicalHash}, msg('BOARD_ACTION', {
  fn:'triggerCharacterEffect',
  playerIndex:0,
  turn:3,
  z:0,
  r:2,
  c:0,
  card:{id:'38', iid:'jake-manual'},
  baseStateHash:jakeManualPicked.canonicalHash,
  postState:jakeManualPicked.canonicalState,
  stateHash:jakeManualPicked.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(jakeManualRepeat.ok, false);
assert.match(jakeManualRepeat.reason, /already activated/);

const passiveOfficialScore = scoreResultForState(state({
  turn:20,
  maxTurns:20,
  board:[[[null,null,null],[null,null,null],[
    {id:'57', iid:'pass-57', name:'Jeremiah', type:'Coordinator', owner:0, currentFate:3},
    {id:'11', iid:'pass-11', name:'Anne', type:'Coordinator', owner:0, currentFate:6},
    {id:'59', iid:'pass-59', name:'Maroon Knights', type:'Supporter', owner:0, currentFate:1}
  ]], [[null,null,null],[
    {id:'303', iid:'pass-bobby-third', name:'Third Reality', type:'Supporter', owner:0, currentFate:1, aff:'reality'},
    null,
    null
  ],[
    {id:'44', iid:'pass-44', name:'Soviet Grenadiers', type:'Supporter', owner:0, currentFate:1, aff:'reality'},
    {id:'55', iid:'pass-55', name:'Bobby Jones', type:'Dauntless', owner:0, currentFate:5, aff:'reality'},
    {id:'301', iid:'pass-dauntless', name:'Plain Dauntless', type:'Dauntless', owner:0, currentFate:2, aff:'reality'}
  ]], [[null,null,null],[null,null,null],[
    {id:'10', iid:'pass-10', name:'Post-Modernist Dylan', type:'Coordinator', owner:0, currentFate:3},
    {id:'302', iid:'pass-opponent', name:'Opponent', type:'Character', owner:1, currentFate:5},
    null
  ]]]
}));
assert.strictEqual(passiveOfficialScore.zones[0].s0, 15);
assert.strictEqual(passiveOfficialScore.zones[1].s0, 20);
assert.strictEqual(passiveOfficialScore.zones[2].s1, 3);

const suppressedPassiveOfficialScore = scoreResultForState(state({
  turn:20,
  maxTurns:20,
  board:[[[null,null,null],[null,null,null],[
    {id:'201', iid:'suppressed-pass-target', name:'Plain Supporter', type:'Supporter', owner:0, currentFate:1},
    {id:'59', iid:'suppressed-pass-59', name:'Maroon Knights', type:'Supporter', owner:0, currentFate:1, _reactionSuppressed:true},
    null
  ]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]]
}));
assert.strictEqual(suppressedPassiveOfficialScore.zones[0].s0, 2);

const globallySuppressedPassiveOfficialScore = scoreResultForState(state({
  turn:20,
  maxTurns:20,
  oppSuppressedNextTurn:true,
  suppressTarget:0,
  board:[[[null,null,null],[null,null,null],[
    {id:'201', iid:'global-suppressed-pass-target', name:'Plain Supporter', type:'Supporter', owner:0, currentFate:1},
    {id:'59', iid:'global-suppressed-pass-59', name:'Maroon Knights', type:'Supporter', owner:0, currentFate:1},
    null
  ]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]]
}));
assert.strictEqual(globallySuppressedPassiveOfficialScore.zones[0].s0, 2);

const lydiaBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'56', iid:'c-56-hand', name:'Lydia', type:'Improvisor', fate:7, cost:2}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'201', iid:'lydia-trib-1', name:'Plain Supporter A', type:'Supporter', owner:0, fate:1, currentFate:1},{id:'201', iid:'lydia-trib-2', name:'Plain Supporter B', type:'Supporter', owner:0, fate:1, currentFate:1},null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  selectedHandCard:0
});
const lydiaHash = canonicalStateHash(lydiaBase);
const lydiaReady = reduceServerAction({canonicalState:lydiaBase, canonicalHash:lydiaHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'c-56-hand', id:'56'},
  baseStateHash:lydiaHash,
  postState:lydiaBase,
  stateHash:lydiaHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(lydiaReady.ok, true, lydiaReady.reason);
const lydiaFirst = reduceServerAction({canonicalState:lydiaReady.canonicalState, canonicalHash:lydiaReady.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  baseStateHash:lydiaReady.canonicalHash,
  postState:lydiaReady.canonicalState,
  stateHash:lydiaReady.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(lydiaFirst.ok, true, lydiaFirst.reason);
const lydiaSecond = reduceServerAction({canonicalState:lydiaFirst.canonicalState, canonicalHash:lydiaFirst.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:false,
  baseStateHash:lydiaFirst.canonicalHash,
  postState:lydiaFirst.canonicalState,
  stateHash:lydiaFirst.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(lydiaSecond.ok, true, lydiaSecond.reason);
const lydiaFinal = reduceServerAction({canonicalState:lydiaSecond.canonicalState, canonicalHash:lydiaSecond.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:false,
  baseStateHash:lydiaSecond.canonicalHash,
  postState:lydiaSecond.canonicalState,
  stateHash:lydiaSecond.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(lydiaFinal.ok, true, lydiaFinal.reason);
assert.strictEqual(lydiaFinal.canonicalState.board[0][2][1].iid, 'c-56-hand');
assert.strictEqual(lydiaFinal.canonicalState.board[0][2][1].usesLeft, 5);

const seculesBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'67', iid:'c-67-hand', name:'Mr. Secules', type:'Improvisor', fate:4, cost:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'47', iid:'secules-trib-1', name:'Great Oak High School', type:'Supporter', owner:0, fate:1, currentFate:1},null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  selectedHandCard:0
});
const seculesHash = canonicalStateHash(seculesBase);
const seculesReady = reduceServerAction({canonicalState:seculesBase, canonicalHash:seculesHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'c-67-hand', id:'67'},
  baseStateHash:seculesHash,
  postState:seculesBase,
  stateHash:seculesHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(seculesReady.ok, true, seculesReady.reason);
const seculesMissingConsolidationPrompt = reduceServerAction({canonicalState:seculesReady.canonicalState, canonicalHash:seculesReady.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  omitPromptIdForTest:true,
  z:0,
  r:2,
  c:0,
  placing:false,
  baseStateHash:seculesReady.canonicalHash,
  postState:seculesReady.canonicalState,
  stateHash:seculesReady.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(seculesMissingConsolidationPrompt.ok, false);
assert.match(seculesMissingConsolidationPrompt.reason, /consolidation promptId is required/);
const seculesTribute = reduceServerAction({canonicalState:seculesReady.canonicalState, canonicalHash:seculesReady.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  baseStateHash:seculesReady.canonicalHash,
  postState:seculesReady.canonicalState,
  stateHash:seculesReady.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(seculesTribute.ok, true, seculesTribute.reason);
const seculesFinal = reduceServerAction({canonicalState:seculesTribute.canonicalState, canonicalHash:seculesTribute.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:false,
  baseStateHash:seculesTribute.canonicalHash,
  postState:seculesTribute.canonicalState,
  stateHash:seculesTribute.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(seculesFinal.ok, true, seculesFinal.reason);
assert.strictEqual(seculesFinal.canonicalState.board[0][2][0].iid, 'c-67-hand');
assert.strictEqual(seculesFinal.canonicalState.board[0][2][0].usesLeft, 1);
assert.strictEqual(seculesFinal.canonicalState.board[0][2][0].currentFate, 7);
assert.strictEqual(seculesFinal.canonicalState.players[0].discard[0].iid, 'secules-trib-1');

const alondraSetBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'14', iid:'c-14-hand', name:'Alondra Hopkins', type:'Dauntless', fate:12, cost:4}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[
    [null,null,null],
    [{id:'201', iid:'alondra-trib-4', name:'Tribute D', type:'Supporter', owner:0, fate:1, currentFate:1},{id:'201', iid:'alondra-victim', name:'Adjacent Victim', type:'Supporter', owner:1, fate:1, currentFate:1},{id:'201', iid:'alondra-immune', name:'Immune Bystander', type:'Supporter', owner:1, fate:1, currentFate:1, immuneFlag:true}],
    [{id:'201', iid:'alondra-trib-1', name:'Tribute A', type:'Supporter', owner:0, fate:1, currentFate:1},{id:'201', iid:'alondra-trib-2', name:'Tribute B', type:'Supporter', owner:0, fate:1, currentFate:1},{id:'201', iid:'alondra-trib-3', name:'Tribute C', type:'Supporter', owner:0, fate:1, currentFate:1}]
  ], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  selectedHandCard:0
});
const alondraSetHash = canonicalStateHash(alondraSetBase);
const alondraReady = reduceServerAction({canonicalState:alondraSetBase, canonicalHash:alondraSetHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'c-14-hand', id:'14'},
  baseStateHash:alondraSetHash,
  postState:alondraSetBase,
  stateHash:alondraSetHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(alondraReady.ok, true, alondraReady.reason);
let alondraStep = alondraReady;
for(const pos of [[0,2,0], [0,2,1], [0,2,2], [0,1,0]]){
  alondraStep = reduceServerAction({canonicalState:alondraStep.canonicalState, canonicalHash:alondraStep.canonicalHash}, msg('CLICK_CELL', {
    playerIndex:0,
    turn:1,
    z:pos[0],
    r:pos[1],
    c:pos[2],
    placing:false,
    baseStateHash:alondraStep.canonicalHash,
    postState:alondraStep.canonicalState,
    stateHash:alondraStep.canonicalHash
  }), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
  assert.strictEqual(alondraStep.ok, true, alondraStep.reason);
}
const alondraFinal = reduceServerAction({canonicalState:alondraStep.canonicalState, canonicalHash:alondraStep.canonicalHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:false,
  baseStateHash:alondraStep.canonicalHash,
  postState:alondraStep.canonicalState,
  stateHash:alondraStep.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(alondraFinal.ok, true, alondraFinal.reason);
assert.strictEqual(alondraFinal.canonicalState.board[0][2][1].iid, 'c-14-hand');
assert.strictEqual(alondraFinal.canonicalState.board[0][2][1].currentFate, 13);
assert.strictEqual(alondraFinal.canonicalState.board[0][1][1], null);
assert.strictEqual(alondraFinal.canonicalState.board[0][1][2].iid, 'alondra-immune');
assert.strictEqual(alondraFinal.canonicalState.players[1].discard.length, 1);
assert.strictEqual(alondraFinal.canonicalState.players[1].discard[0].iid, 'alondra-victim');

const supporterLimitBase = state(Object.assign({}, supporterBase, {
  supportsPlacedThisTurn:2,
  maxSupportsPerTurn:2
}));
const supporterLimitHash = canonicalStateHash(supporterLimitBase);
const supporterLimitRejected = reduceServerAction({canonicalState:supporterLimitBase, canonicalHash:supporterLimitHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:true,
  selectedHand:{index:0, iid:'s-201', id:'201'},
  baseStateHash:supporterLimitHash,
  postState:supporterLimitBase,
  stateHash:supporterLimitHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([['201', {id:'201', type:'Supporter', effect:'', aff:''}]])}});
assert.strictEqual(supporterLimitRejected.ok, false);
assert.match(supporterLimitRejected.reason, /Supporter limit/);

const alondraBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'201', iid:'s-201', name:'Plain Supporter', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[{id:'14', iid:'opp-14', owner:1, type:'Character'},null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const alondraHash = canonicalStateHash(alondraBase);
const alondraRejected = reduceServerAction({canonicalState:alondraBase, canonicalHash:alondraHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:0,
  placing:true,
  selectedHand:{index:0, iid:'s-201', id:'201'},
  baseStateHash:alondraHash,
  postState:alondraBase,
  stateHash:alondraHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([['201', {id:'201', type:'Supporter', effect:'', aff:''}]])}});
assert.strictEqual(alondraRejected.ok, false);
assert.match(alondraRejected.reason, /Alondra/);

const westCoastDrawBase = state({
  players:[
    {name:'Host', color:'', deck:[{id:'301', iid:'west-coast-drawn', name:'Drawn Card', type:'Character', fate:1}], hand:[{id:'32', iid:'west-coast-temecula', name:'Temecula Resident', type:'Supporter', fate:1, aff:'reality'}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,null,null],[{id:'201', iid:'west-coast-target', name:'Target', type:'Character', owner:0, fate:4, currentFate:4},null,null]],
    [[null,null,null],[null,null,null],[null,null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  landscapeId:'igb9',
  phase:'main',
  currentPlayer:0,
  turn:1,
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const westCoastDrawHash = canonicalStateHash(westCoastDrawBase);
const westCoastArmed = reduceServerAction({canonicalState:westCoastDrawBase, canonicalHash:westCoastDrawHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:true,
  selectedHand:{index:0, iid:'west-coast-temecula', id:'32'},
  baseStateHash:westCoastDrawHash,
  postState:westCoastDrawBase,
  stateHash:westCoastDrawHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(westCoastArmed.ok, true, westCoastArmed.reason);
assert.strictEqual(westCoastArmed.canonicalState.players[0].hand[0].iid, 'west-coast-drawn');
assert.strictEqual(westCoastArmed.canonicalState._serverPendingZonePick.kind, 'westCoastDreamingBonus');
const westCoastPicked = reduceServerAction({canonicalState:westCoastArmed.canonicalState, canonicalHash:westCoastArmed.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[{z:0, r:2, c:0, card:{iid:'west-coast-target', id:'201'}}],
  baseStateHash:westCoastArmed.canonicalHash,
  postState:westCoastArmed.canonicalState,
  stateHash:westCoastArmed.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(westCoastPicked.ok, true, westCoastPicked.reason);
assert.strictEqual(westCoastPicked.canonicalState.board[0][2][0].currentFate, 7);
assert.strictEqual(westCoastPicked.canonicalState._serverPendingZonePick, null);

const westCoastContinuationBase = state({
  players:[
    {name:'Host', color:'', deck:[
      {id:'301', iid:'west-german-draw-a', name:'Draw A', type:'Character', fate:1},
      {id:'302', iid:'west-german-draw-b', name:'Draw B', type:'Character', fate:1}
    ], hand:[{id:'42', iid:'west-german-place', name:'West German Soldier', type:'Supporter', fate:1, aff:'third_great_war'}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[
    [[null,null,null],[null,null,null],[{id:'202', iid:'west-coast-cancel-target', name:'Cancel Target', type:'Character', owner:0, fate:2, currentFate:2},null,null]],
    [[null,null,null],[null,null,null],[null,null,null]],
    [[null,null,null],[null,null,null],[null,null,null]]
  ],
  landscapeId:'igb9',
  phase:'main',
  currentPlayer:0,
  turn:1,
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const westCoastContinuationHash = canonicalStateHash(westCoastContinuationBase);
const westCoastBeforeCancel = reduceServerAction({canonicalState:westCoastContinuationBase, canonicalHash:westCoastContinuationHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:1,
  placing:true,
  selectedHand:{index:0, iid:'west-german-place', id:'42'},
  baseStateHash:westCoastContinuationHash,
  postState:westCoastContinuationBase,
  stateHash:westCoastContinuationHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(westCoastBeforeCancel.ok, true, westCoastBeforeCancel.reason);
assert.strictEqual(westCoastBeforeCancel.canonicalState._serverPendingZonePick.kind, 'westCoastDreamingBonus');
assert.deepStrictEqual(westCoastBeforeCancel.canonicalState._serverPendingZonePick.afterDraw, {kind:'westGermanDiscard', sourceIid:'west-german-place'});
const westCoastCanceled = reduceServerAction({canonicalState:westCoastBeforeCancel.canonicalState, canonicalHash:westCoastBeforeCancel.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[],
  baseStateHash:westCoastBeforeCancel.canonicalHash,
  postState:westCoastBeforeCancel.canonicalState,
  stateHash:westCoastBeforeCancel.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(westCoastCanceled.ok, true, westCoastCanceled.reason);
assert.strictEqual(westCoastCanceled.canonicalState._serverPendingZonePick, null);
assert.strictEqual(westCoastCanceled.canonicalState._serverPendingCardPick.kind, 'handDiscard');
assert.strictEqual(westCoastCanceled.canonicalState._serverPendingCardPick.reason, 'westGermanSoldier');
assert.deepStrictEqual(westCoastCanceled.canonicalState.players[0].hand.map(card=>card.iid), ['west-german-draw-a', 'west-german-draw-b']);

console.log('fate-authority-reducer smoke passed');
