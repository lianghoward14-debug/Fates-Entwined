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

function msg(type, payload){
  return {type, payload:payload || {}};
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
const paidReadySelectHash = paidReady.canonicalHash;
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
  ['201', {id:'201', type:'Supporter', effect:'', aff:''}]
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

const copiedFrenchPassiveBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'109', iid:'h-109-copy', name:'Irvine Target', type:'Character', fate:4, cost:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[{id:'37', iid:'fusilier-copy-49', name:'French Fusiliers', type:'Supporter', fate:1, owner:0, _copiedPassiveId:'49'},null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:false,
  selectedHandCard:0
});
const copiedFrenchPassiveHash = canonicalStateHash(copiedFrenchPassiveBase);
const copiedFrenchPassiveRejected = reduceServerAction({canonicalState:copiedFrenchPassiveBase, canonicalHash:copiedFrenchPassiveHash}, msg('START_CONSOLIDATE', {
  playerIndex:0,
  turn:1,
  selectedHand:{index:0, iid:'h-109-copy', id:'109'},
  baseStateHash:copiedFrenchPassiveHash,
  postState:copiedFrenchPassiveBase,
  stateHash:copiedFrenchPassiveHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:{byId:new Map([
  ['109', {id:'109', type:'Character', cost:1, effect:'', aff:''}],
  ['37', {id:'37', type:'Supporter', effect:'Copy a passive Supporter effect.', aff:'third_great_war'}]
])}});
assert.strictEqual(copiedFrenchPassiveRejected.ok, false);
assert.match(copiedFrenchPassiveRejected.reason, /French Fusiliers/);

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

const deterranceCatalog = {byId:new Map([
  ['111', {id:'111', type:'Character', cost:1, effect:'', aff:''}],
  ['201', {id:'201', type:'Supporter', effect:'', aff:''}]
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
assert.strictEqual(deterranceFinalized.canonicalState.fateModifiers.deterrance_z0, -2);

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

const specialPlacementBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'45', iid:'h-45', name:'Chingachlook', type:'Character', fate:3}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
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
  ['05', {id:'05', type:'Supporter', effect:'When set, select a card in this zone. It gains 2 Fate.', aff:'third_great_war'}],
  ['09', {id:'09', type:'Supporter', effect:'This card counts as 2 Reinforcement.', aff:'third_great_war'}],
  ['12', {id:'12', type:'Supporter', effect:'When set, select up to 2 friendly cards in this zone. They become immune.', aff:'reality'}],
  ['16', {id:'16', type:'Supporter', effect:'When set, discard an opponent Supporter in this zone.', aff:'reality'}],
  ['18', {id:'18', type:'Supporter', effect:'When set, suppress opponent supporter effects next turn.', aff:'third_great_war'}],
  ['20', {id:'20', type:'Supporter', effect:'Cards in this zone cannot lose Fate and cannot be moved.', aff:'eventide'}],
  ['26', {id:'26', type:'Supporter', effect:'When set, reveal your opponent hand.', aff:'reality'}],
  ['27', {id:'27', type:'Initiator', effect:'Draw 3 cards.', aff:'eventide'}],
  ['28', {id:'28', type:'Supporter', effect:'This card is able to be set from the deck.', aff:'third_great_war'}],
  ['31', {id:'31', type:'Supporter', effect:'When set, select a card in this zone. It loses 2 Fate.', aff:'eventide'}],
  ['32', {id:'32', type:'Supporter', effect:'When set, draw 1 card.', aff:'reality'}],
  ['33', {id:'33', type:'Supporter', effect:'When set, the next character added to your hand gets a bonus.', aff:'eventide'}],
  ['40', {id:'40', type:'Improvisor', effect:'The next card you draw gains 4 Fate.', aff:'expanded_worlds'}],
  ['47', {id:'47', type:'Supporter', effect:'When used in Consolidation, that card gains 3 Fate permanently.', aff:'expanded_worlds'}],
  ['49', {id:'49', type:'Supporter', effect:'Characters in this zone can be used for consolidation.', aff:'reality'}],
  ['50', {id:'50', type:'Supporter', effect:'When set, select any zone to lock for your opponent.', aff:'reality'}],
  ['53', {id:'53', type:'Supporter', effect:'Opponent consolidations in this zone cannot use outside cards.', aff:'eventide'}],
  ['52', {id:'52', type:'Supporter', effect:'When set, select an opponent supporter in this zone.', aff:'eventide'}],
  ['54', {id:'54', type:'Supporter', effect:'When set, move a friendly character in this zone.', aff:'eventide'}],
  ['56', {id:'56', type:'Improvisor', effect:'Whenever your opponent would activate a Supporter effect, you can negate it.', aff:'expanded_worlds'}],
  ['76', {id:'76', type:'Supporter', effect:'When set, this card gains 4 Fate and is immune.', aff:'expanded_worlds'}],
  ['91', {id:'91', type:'Supporter', effect:'For the next five turns, your opponent cannot change the landscape.', aff:'expanded_worlds'}],
  ['14', {id:'14', type:'Dauntless', effect:'Discard adjacent opponent Supporters and gain Fate.', aff:'eventide'}],
  ['201', {id:'201', type:'Supporter', effect:'', aff:''}]
])};
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
const artilleryModal = reduceServerAction({canonicalState:artillerySet.canonicalState, canonicalHash:artillerySet.canonicalHash}, msg('MODAL_ACTION', {
  playerIndex:0,
  turn:1,
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
const vigilantesEndRejected = reduceServerAction({canonicalState:vigilantesSet.canonicalState, canonicalHash:vigilantesSet.canonicalHash}, msg('END_TURN', {
  playerIndex:0,
  turn:1,
  baseStateHash:vigilantesSet.canonicalHash,
  postState:vigilantesSet.canonicalState,
  stateHash:vigilantesSet.canonicalHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(vigilantesEndRejected.ok, false);
assert.match(vigilantesEndRejected.reason, /unresolved server interaction/);
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
assert.match(wolfCreekMoveEndRejected.reason, /unresolved server interaction/);
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
const wolfCreekManualActiveRejected = reduceServerAction({canonicalState:wolfCreekMove.canonicalState, canonicalHash:wolfCreekMove.canonicalHash}, msg('BOARD_ACTION', {
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
assert.strictEqual(wolfCreekManualActiveRejected.ok, false);
assert.match(wolfCreekManualActiveRejected.reason, /BOARD_ACTION/);

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
assert.strictEqual(liberatorsPick.canonicalState.board[0][1][1].currentFate, 4);
assert.strictEqual(liberatorsPick.canonicalState._serverPendingZonePick, null);

const makennaSetBase = state({
  players:[
    {name:'Host', color:'', deck:[], hand:[{id:'12', iid:'s-12-place', name:'Makenna', type:'Supporter', fate:1}], discard:[]},
    {name:'Guest', color:'', deck:[], hand:[], discard:[]}
  ],
  board:[[[null,null,null],[null,{id:'301', iid:'makenna-friendly-a', name:'Friendly A', type:'Character', owner:0, fate:2},{id:'302', iid:'makenna-opponent', name:'Opponent', type:'Character', owner:1, fate:2}],[{id:'303', iid:'makenna-friendly-b', name:'Friendly B', type:'Character', owner:0, fate:2},null,null]], [[null,null,null],[null,null,null],[null,null,null]], [[null,null,null],[null,null,null],[null,null,null]]],
  phase:'main',
  placing:true,
  selectedHandCard:0,
  supportsPlacedThisTurn:0,
  maxSupportsPerTurn:2,
  extraSupportsThisTurn:0,
  supportersSetP:[0,0]
});
const makennaSetHash = canonicalStateHash(makennaSetBase);
const makennaSet = reduceServerAction({canonicalState:makennaSetBase, canonicalHash:makennaSetHash}, msg('CLICK_CELL', {
  playerIndex:0,
  turn:1,
  z:0,
  r:2,
  c:2,
  placing:true,
  selectedHand:{index:0, iid:'s-12-place', id:'12'},
  baseStateHash:makennaSetHash,
  postState:makennaSetBase,
  stateHash:makennaSetHash
}), {mode:'strict', requireBaseHash:true, requireCatalogForCards:true, cardCatalog:realSupporterCatalog});
assert.strictEqual(makennaSet.ok, true, makennaSet.reason);
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
const makennaPick = reduceServerAction({canonicalState:makennaSet.canonicalState, canonicalHash:makennaSet.canonicalHash}, msg('PICK_ZONE', {
  playerIndex:0,
  turn:1,
  selectedEntries:[
    {z:0, r:1, c:1, card:{iid:'makenna-friendly-a', id:'301', name:'Friendly A'}},
    {z:0, r:2, c:0, card:{iid:'makenna-friendly-b', id:'303', name:'Friendly B'}}
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
assert.strictEqual(woundPick.canonicalState.board[0][1][1].currentFate, 1);
assert.strictEqual(woundPick.canonicalState.damageDoneP[0], 1);

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

console.log('fate-authority-reducer smoke passed');
