import assert from 'node:assert/strict';
import {createInitialState, reduceCommand} from '../../shared/engine/index.mjs';

const state = createInitialState({
  matchId:'PHIL_MANIFESTO_REGRESSION',
  seed:'phil-manifesto-regression',
  handSize:99,
  maxTurns:20,
  cardDefinitions:[
    {id:'32', name:'Temecula Resident', type:'Supporter', aff:'reality', fate:1, cost:0},
    {id:'46', name:'Phil', type:'Dauntless', aff:'reality', fate:4, cost:3}
  ],
  players:[
    {id:'p0', name:'Player 0', deckIds:['32']},
    {id:'p1', name:'Player 1', deckIds:['46', '32', '32', '32']}
  ]
});

let serial = 0;
function command(currentState, playerId, type, payload = {}){
  return {
    commandId:`phil:${++serial}`,
    matchId:currentState.matchId,
    expectedRevision:currentState.revision,
    type,
    payload
  };
}

function boardCard(currentState, iid){
  return currentState.board.flat(2).find(card=>String(card?.iid || '') === String(iid || ''));
}

let current = state;
let result = reduceCommand(current, command(current, 'p0', 'END_TURN'), {playerId:'p0'});
assert.equal(result.ok, true, JSON.stringify(result.rejection));
current = result.state;

const phil = current.players[1].hand.find(card=>card.id === '46');
const tributes = current.players[1].hand.filter(card=>card.id === '32').slice(0, 3);
assert(phil, 'Phil must be available to set');
assert.equal(tributes.length, 3, 'Phil must have enough reinforcement for consolidation');

// Build Phil's three reinforcement on the board through normal Supporter sets.
for(const [index, tribute] of tributes.entries()){
  if(index === 2){
    result = reduceCommand(current, command(current, 'p1', 'END_TURN'), {playerId:'p1'});
    assert.equal(result.ok, true, JSON.stringify(result.rejection));
    current = result.state;
    result = reduceCommand(current, command(current, 'p0', 'END_TURN'), {playerId:'p0'});
    assert.equal(result.ok, true, JSON.stringify(result.rejection));
    current = result.state;
  }
  result = reduceCommand(current, command(current, 'p1', 'SET_CARD', {
    cardIid:tribute.iid,
    destination:{z:1, r:0, c:index}
  }), {playerId:'p1'});
  assert.equal(result.ok, true, JSON.stringify(result.rejection));
  current = result.state;
}

result = reduceCommand(current, command(current, 'p1', 'END_TURN'), {playerId:'p1'});
assert.equal(result.ok, true, JSON.stringify(result.rejection));
current = result.state;
result = reduceCommand(current, command(current, 'p0', 'END_TURN'), {playerId:'p0'});
assert.equal(result.ok, true, JSON.stringify(result.rejection));
current = result.state;

result = reduceCommand(current, command(current, 'p1', 'CONSOLIDATE_CARD', {
  cardIid:phil.iid,
  tributeIids:tributes.map(card=>card.iid),
  destination:{z:1, r:0, c:0}
}), {playerId:'p1'});
assert.equal(result.ok, true, JSON.stringify(result.rejection));
assert.equal(boardCard(result.state, phil.iid).counters.fieldEnteredTurn, 6);
current = result.state;

// The next controller Draw phase is two alternating turns later. Its +2 is
// shared reducer behavior, so this one regression covers local and online play.
result = reduceCommand(current, command(current, 'p1', 'END_TURN'), {playerId:'p1'});
assert.equal(result.ok, true);
current = result.state;
result = reduceCommand(current, command(current, 'p0', 'END_TURN'), {playerId:'p0'});
assert.equal(result.ok, true);
assert.equal(boardCard(result.state, phil.iid).currentFate, 6);
assert(result.events.some(event=>
  event.type === 'FATE_CHANGED'
  && event.reason === 'MONARCHIST_MANIFESTO'
  && event.cardIid === phil.iid
), 'Phil must emit a Monarchist Manifesto Fate change on the next controller Draw phase');

console.log('Phil Monarchist Manifesto regression test passed');
