import assert from 'node:assert/strict';
import {
  applyOperation,
  canUseAsConsolidationTribute,
  createInitialState,
  findBoardCard,
  legalCommandTemplates,
  reduceCommand
} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const DEFINITIONS = [
  {id:'10', name:'Post-Modernist Dylan', type:'Coordinator', aff:'expanded_worlds', fate:5, cost:1},
  {id:'32', name:'Temecula Resident', type:'Supporter', aff:'reality', fate:1, cost:0},
  {id:'79', name:'Havano Citizen', type:'Supporter', aff:'eventide', fate:1, cost:0}
];

function takeCard(state, playerIndex, cardId){
  for(const pile of ['hand', 'deck', 'discard']){
    const index = state.players[playerIndex][pile].findIndex(card=>String(card.id) === String(cardId));
    if(index < 0) continue;
    return state.players[playerIndex][pile].splice(index, 1)[0];
  }
  throw new Error(`missing fixture card ${cardId}`);
}

function putOnBoard(state, playerIndex, cardId, destination){
  const card = takeCard(state, playerIndex, cardId);
  card.controller = playerIndex;
  state.board[destination.z][destination.r][destination.c] = card;
  return card;
}

// Rozsi's global classification and Chloe's per-card declaration must remain
// effect-facing only. Printed Supporters still pay consolidation costs.
let state = createInitialState({
  matchId:'SUPPORTER-STRUCTURAL-TYPE',
  seed:'supporter-structural-type',
  handSize:99,
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['32', '32', '32']},
    {id:'p1', deckIds:['79']}
  ]
});
const rozsiSupporter = putOnBoard(state, 0, '32', {z:0, r:2, c:0});
state.statuses.push({
  statusId:'rozsi-test',
  type:'SUPPORTERS_AS_CHARACTERS',
  playerIndex:0,
  sourceIid:'rozsi-source',
  remainingTargetTurns:5
});
let eligibility = canUseAsConsolidationTribute(state, findBoardCard(state, rozsiSupporter.iid), 0);
assert.equal(eligibility.ok, true, 'Rozsi-classified printed Supporters must remain valid tributes');

const chloeSupporter = putOnBoard(state, 0, '32', {z:0, r:2, c:1});
chloeSupporter.counters.bh14OriginalType = 'Supporter';
chloeSupporter.counters.bh14DeclaredType = 'Character';
eligibility = canUseAsConsolidationTribute(state, findBoardCard(state, chloeSupporter.iid), 0);
assert.equal(eligibility.ok, true, 'Chloe-declared Characters retain printed Supporter placement rules');

const chloeCharacter = putOnBoard(state, 0, '32', {z:0, r:2, c:2});
chloeCharacter.type = 'Coordinator';
chloeCharacter.counters.bh14OriginalType = 'Coordinator';
chloeCharacter.counters.bh14DeclaredType = 'Supporter';
eligibility = canUseAsConsolidationTribute(state, findBoardCard(state, chloeCharacter.iid), 0);
assert.equal(eligibility.ok, false, 'Chloe cannot turn a printed Character into a physical Supporter tribute');

// Every Supporter set contributes to the hard cap, including operations that
// deliberately do not consume the ordinary Supporter allowance.
state = createInitialState({
  matchId:'SUPPORTER-HARD-CAP',
  seed:'supporter-hard-cap',
  handSize:99,
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['32', '32', '32', '32', '32', '32']},
    {id:'p1', deckIds:['79']}
  ]
});
const freeDestinations = [
  {z:0, r:2, c:0}, {z:0, r:2, c:1}, {z:0, r:2, c:2},
  {z:1, r:2, c:0}, {z:1, r:2, c:1}, {z:1, r:2, c:2}
];
const capCtx = {state, events:[], ruleEvents:[]};
for(let index = 0; index < 5; index += 1){
  const supporter = state.players[0].hand.find(card=>card.id === '32');
  applyOperation(capCtx, {
    type:'SET_CARD',
    playerIndex:0,
    cardIid:supporter.iid,
    destination:freeDestinations[index],
    sourceController:0,
    countTowardSupporterLimit:false
  });
}
assert.deepEqual(state.supportersSetThisTurn, [0, 0], 'free sets must retain their ordinary-limit exemption');
assert.deepEqual(state.supportersSetForCapThisTurn, [5, 0]);
assert(capCtx.events.some(event=>event.type === 'SUPPORTER_HARD_CAP_REACHED' && event.playerIndex === 0));
const sixth = state.players[0].hand.find(card=>card.id === '32');
assert.throws(
  ()=>applyOperation(capCtx, {
    type:'SET_CARD',
    playerIndex:0,
    cardIid:sixth.iid,
    destination:freeDestinations[5],
    sourceController:0,
    countTowardSupporterLimit:false
  }),
  error=>error?.code === 'SUPPORTER_HARD_CAP_REACHED'
);
assert(!legalCommandTemplates(state, 0).some(template=>
  template.type === 'SET_CARD' && template.payload.cardIid === sixth.iid
));

// Dylan's face-up passive entry targets the opposing side and therefore opens
// Havano in multiplayer. Resolving Havano suppresses the ongoing aura.
state = createInitialState({
  matchId:'DYLAN-HAVANO-PASSIVE',
  seed:'dylan-havano-passive',
  handSize:99,
  cardDefinitions:DEFINITIONS,
  players:[
    {id:'p0', deckIds:['10', '32']},
    {id:'p1', deckIds:['79']}
  ]
});
const tribute = putOnBoard(state, 0, '32', {z:0, r:2, c:0});
const dylan = state.players[0].hand.find(card=>card.id === '10');
const havano = state.players[1].hand.find(card=>card.id === '79');
let result = reduceCommand(
  state,
  command(state, 'p0', 1, 'CONSOLIDATE_CARD', {
    cardIid:dylan.iid,
    tributeIids:[tribute.iid],
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt?.type, 'REACTION');
assert.equal(result.prompt?.phase, 'PASSIVE_TARGET');
assert(result.prompt.options.some(option=>
  option.kind === 'HAVANO'
  && option.reactionIid === havano.iid
  && option.modes.includes('SUPPRESS')
));
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p1', 2, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    choice:'SUPPRESS',
    reactionIid:havano.iid
  }),
  {playerId:'p1'}
);
assert.equal(result.prompt?.context, 'HAVANO_SET');
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p1', 3, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    destination:{z:2, r:0, c:0}
  }),
  {playerId:'p1'}
);
assert.equal(result.ok, true);
assert(result.state.board[0][2][0].statuses.includes('EFFECTS_SUPPRESSED'));
assert.equal(result.state.board[2][0][0].iid, havano.iid);
assert.equal(result.state.supportersSetForCapThisTurn[1], 1, 'Havano deployment counts toward the hard cap');

console.log('supporter cap, Dylan/Havano, and structural consolidation smoke test passed');
