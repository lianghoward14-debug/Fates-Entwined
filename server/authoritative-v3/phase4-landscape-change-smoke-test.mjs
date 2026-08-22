import assert from 'node:assert/strict';
import {
  assertInvariants,
  createInitialState,
  multiplayerEligibleCardIds,
  multiplayerEligibleLandscapeIds,
  reduceCommand,
  stableStringify
} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const DEFINITIONS = [
  {id:'26', name:'UCPD', type:'Supporter', aff:'reality', fate:1, cost:0},
  {id:'27', name:'Kazumi', type:'Initiator', aff:'eventide', fate:1, cost:1},
  {id:'82', name:'Felicyta Janowicz (Youth)', type:'Initiator', aff:'expanded_worlds', fate:4, cost:3}
];

function makeState(landscapeId, matchId){
  const state = createInitialState({
    matchId,
    seed:matchId,
    handSize:99,
    maxTurns:20,
    landscapeId,
    cardDefinitions:DEFINITIONS,
    players:[
      {id:'p0', deckIds:['82', '27', '26', '26', '26']},
      {id:'p1', deckIds:['26']}
    ]
  });
  const supporters = [];
  for(let column = 0; column < 3; column += 1){
    const index = state.players[0].hand.findIndex(card=>card.id === '26');
    const supporter = state.players[0].hand.splice(index, 1)[0];
    supporter.controller = 0;
    state.board[0][2][column] = supporter;
    supporters.push(supporter);
  }
  return {state, supporters};
}

assert.equal(multiplayerEligibleCardIds().length, 114);
assert(multiplayerEligibleCardIds().includes('82'));
assert.equal(multiplayerEligibleLandscapeIds().length, 20);

// Card 82 exposes every authoritative landscape through one serialized choice.
let fixture = makeState('igb1', 'P4CARD82');
let state = fixture.state;
const youth = state.players[0].hand.find(card=>card.id === '82');
const waitingCharacter = state.players[0].hand.find(card=>card.id === '27');
let result = reduceCommand(
  state,
  command(state, 'p0', 1, 'CONSOLIDATE_CARD', {
    cardIid:youth.iid,
    tributeIids:fixture.supporters.map(card=>card.iid),
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'MODAL_CHOICE');
assert.equal(result.prompt.options.length, 20);
assert.deepEqual(
  result.prompt.options.map(option=>option.value),
  Array.from({length:20}, (_value, index)=>`igb${index + 1}`)
);
state = JSON.parse(stableStringify(result.state));
result = reduceCommand(
  state,
  command(state, 'p0', 2, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    choice:'igb19'
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.landscapeId, 'igb19');
assert.equal(result.state.landscapeState.id, 'igb19');
assert.equal(
  result.state.players[0].hand.find(card=>card.iid === waitingCharacter.iid)
    .counters.igb19HandTurnsRemaining,
  3
);
assert(result.events.some(event=>
  event.type === 'LANDSCAPE_CHANGED'
  && event.previousLandscapeId === 'igb1'
  && event.landscapeId === 'igb19'
));
assertInvariants(result.state);

// Timed landscapes cannot be escaped or entered in their protected final-four-turn window.
fixture = makeState('igb2', 'P4CARD82-TIMED');
state = fixture.state;
state.turn = 10;
state.landscapeState.consolidations = [5, 1];
const lockedYouth = state.players[0].hand.find(card=>card.id === '82');
result = reduceCommand(
  state,
  command(state, 'p0', 1, 'CONSOLIDATE_CARD', {
    cardIid:lockedYouth.iid,
    tributeIids:fixture.supporters.map(card=>card.iid),
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.deepEqual(result.prompt.options.map(option=>option.value), ['igb2']);
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 2, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    choice:'igb2'
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.landscapeId, 'igb2');
assert.deepEqual(
  result.state.landscapeState.consolidations,
  [6, 1],
  'choosing the current locked landscape must not reset its accumulated resolution state'
);

console.log('authoritative-v3 Phase 4 card 82 landscape-change smoke test passed');
