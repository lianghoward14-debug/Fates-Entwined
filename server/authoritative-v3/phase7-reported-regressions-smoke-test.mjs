import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {
  assertInvariants,
  createInitialState,
  effectiveFate,
  legalCommandTemplates,
  projectStateForPlayer,
  reduceCommand
} from '../../shared/engine/index.mjs';
import {expectedEffectiveFateFromOracle} from '../../shared/engine/rules-oracle.mjs';
import {command} from './test-helpers.mjs';

const require = createRequire(import.meta.url);
const {getCardCatalog} = require('../fate-card-catalog.js');
const DEFINITIONS = getCardCatalog().cards.filter(card=>
  card.retired !== true && card.temporarilyDisabled !== true
).map(card=>({...card}));

function take(state, playerIndex, id){
  for(const pile of ['hand','deck','discard']){
    const index = state.players[playerIndex][pile].findIndex(card=>String(card.id) === String(id));
    if(index >= 0) return state.players[playerIndex][pile].splice(index, 1)[0];
  }
  throw new Error(`missing ${id}`);
}

function put(state, playerIndex, id, destination){
  const card = take(state, playerIndex, id);
  card.controller = playerIndex;
  state.board[destination.z][destination.r][destination.c] = card;
  return card;
}

function submit(state, playerId, sequence, type, payload){
  return reduceCommand(state, command(state, playerId, sequence, type, payload), {playerId});
}

// 17th British Regiment: the displayed +3 must be a committed permanent Fate
// change in both players' projections, not a presentation-only number.
{
  let state = createInitialState({
    matchId:'P7REGRESSIONBRITISH',
    seed:'p7-regression-british',
    handSize:99,
    activePlayer:0,
    cardDefinitions:DEFINITIONS,
    players:[
      {id:'p0', deckIds:['05','32','32','32']},
      {id:'p1', deckIds:['32','32','32','32']}
    ]
  });
  const target = put(state, 0, '32', {z:0,r:2,c:0});
  const regiment = state.players[0].hand.find(card=>card.id === '05');
  const set = legalCommandTemplates(state, 0).find(item=>
    item.type === 'SET_CARD'
      && item.payload.cardIid === regiment.iid
      && item.payload.destination.z === 0
  );
  assert(set, 'British Regiment must have a legal Zone 1 set command');
  let result = submit(state, 'p0', 1, set.type, set.payload);
  assert.equal(result.ok, true);
  assert.equal(result.state.pendingPrompt?.type, 'BOARD_TARGET');
  state = result.state;
  result = submit(state, 'p0', 2, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIid:target.iid
  });
  assert.equal(result.ok, true);
  assert.equal(result.state.board[0][2][0].currentFate, 4);
  assert(result.events.some(event=>
    event.type === 'FATE_CHANGED'
      && event.sourceIid === regiment.iid
      && event.cardIid === target.iid
      && event.before === 1
      && event.after === 4
  ));
  for(const viewer of [0,1]){
    const projected = projectStateForPlayer(result.state, viewer);
    assert.equal(projected.board[0][2][0].currentFate, 4, `viewer ${viewer} must receive committed +3 Fate`);
  }
  assertInvariants(result.state);
}

// A permanent Fate reduction caps the entire effective value in single-player,
// including Rozsi Youth's field-wide Character bonus. Permanent gains lift the
// ceiling by their exact amount; merely adding/removing aura sources does not.
{
  let state = createInitialState({
    matchId:'P7REGRESSIONPERMANENTFATECEILING',
    seed:'p7-regression-permanent-fate-ceiling',
    handSize:99,
    activePlayer:0,
    cardDefinitions:DEFINITIONS,
    players:[
      {id:'p0', deckIds:['88','03','22','41','32']},
      {id:'p1', deckIds:['31','32','32','32']}
    ]
  });
  const rozsi = put(state, 0, '88', {z:1,r:2,c:0});
  put(state, 0, '03', {z:0,r:2,c:0});
  put(state, 0, '22', {z:1,r:2,c:1});
  put(state, 0, '41', {z:2,r:2,c:0});
  assert.equal(effectiveFate(state, rozsi), 9, 'Rozsi must initially count all four controlled Characters, including herself');

  let result = reduceCommand(
    state,
    command(state, 'p0', 901, 'MODIFY_FATE', {targetIid:rozsi.iid, amount:5}),
    {playerId:'p0', allowDebugCommands:true}
  );
  assert.equal(result.ok, true);
  state = result.state;
  assert.equal(effectiveFate(state, state.board[1][2][0]), 14);

  result = reduceCommand(
    state,
    command(state, 'p0', 902, 'MODIFY_FATE', {targetIid:rozsi.iid, amount:-4}),
    {playerId:'p0', allowDebugCommands:true}
  );
  assert.equal(result.ok, true);
  state = result.state;
  const reducedRozsi = state.board[1][2][0];
  assert.equal(reducedRozsi.currentFate, 2);
  assert.equal(reducedRozsi.counters.permanentFateCeiling, 2);
  assert.equal(effectiveFate(state, reducedRozsi), 2, 'the permanent debuff must cap Rozsi below her live +8 aura bonus');
  assert.equal(expectedEffectiveFateFromOracle(state, reducedRozsi.iid), 2, 'the independent oracle must enforce the same single-player ceiling');
  assert.equal(projectStateForPlayer(state, 1).board[1][2][0].counters.permanentFateCeiling, 2);

  result = reduceCommand(
    state,
    command(state, 'p0', 903, 'MODIFY_FATE', {targetIid:rozsi.iid, amount:3}),
    {playerId:'p0', allowDebugCommands:true}
  );
  assert.equal(result.ok, true);
  state = result.state;
  assert.equal(state.board[1][2][0].counters.permanentFateCeiling, 5);
  assert.equal(effectiveFate(state, state.board[1][2][0]), 5, 'a later permanent +3 must lift the ceiling from 2 to 5');
  assert.equal(expectedEffectiveFateFromOracle(state, rozsi.iid), 5);
  assertInvariants(state);
}

// Consumed Secules must project reactionUses=1. The UI adapter converts this
// authoritative counter into zero remaining uses and removes its ready banner.
{
  let state = createInitialState({
    matchId:'P7REGRESSIONSECULESLINA',
    seed:'p7-regression-secules-lina',
    handSize:99,
    activePlayer:0,
    cardDefinitions:DEFINITIONS,
    players:[
      {id:'p0', deckIds:['08',...Array(16).fill('32'),'35','33']},
      {id:'p1', deckIds:['67',...Array(16).fill('32'),'35','33']}
    ]
  });
  const secules = put(state, 1, '67', {z:1,r:0,c:0});
  const lina = put(state, 0, '08', {z:0,r:2,c:0});
  lina.faceDown = true;
  let result = submit(state, 'p0', 1, 'FLIP_CARD', {cardIid:lina.iid});
  assert.equal(result.ok, true);
  assert.equal(result.state.pendingPrompt?.type, 'REACTION');
  const option = result.state.pendingPrompt.options.find(item=>item.kind === 'SECULES');
  assert(option, 'Secules must react to Lina');
  state = result.state;
  result = submit(state, 'p1', 2, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    choice:'NEGATE',
    reactionIid:secules.iid
  });
  assert.equal(result.ok, true);
  assert.equal(result.state.board[1][0][0].counters.reactionUses, 1);
  assert.equal(projectStateForPlayer(result.state, 0).board[1][0][0].counters.reactionUses, 1);
  assertInvariants(result.state);
}

// Mark Kemper must pause on an explicit three-position square choice, honor
// the selected column, and offer only the two remaining positions next time.
{
  let state = createInitialState({
    matchId:'P7REGRESSIONMARKCHOICE',
    seed:'p7-regression-mark-choice',
    handSize:99,
    activePlayer:0,
    cardDefinitions:DEFINITIONS,
    players:[
      {id:'p0', deckIds:['43','43','32','32']},
      {id:'p1', deckIds:['32','32','32','32']}
    ]
  });
  const firstMark = put(state, 0, '43', {z:1,r:2,c:0});
  firstMark.faceDown = true;
  let result = submit(state, 'p0', 1, 'FLIP_CARD', {cardIid:firstMark.iid});
  assert.equal(result.ok, true);
  assert.equal(result.state.pendingPrompt?.type, 'BOARD_DESTINATION');
  assert.deepEqual(result.state.pendingPrompt.eligible, [
    {z:1,r:3,c:0},
    {z:1,r:3,c:1},
    {z:1,r:3,c:2}
  ]);
  state = result.state;
  result = submit(state, 'p0', 2, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    destination:{z:1,r:3,c:2}
  });
  assert.equal(result.ok, true);
  assert(result.events.some(event=>
    event.type === 'SAFE_SQUARE_ADDED'
      && event.zone === 1
      && event.row === 3
      && event.column === 2
  ));
  assert.deepEqual(result.state.geometry.playableExtraSquares, [{z:1,r:3,c:2,owner:0}]);

  state = result.state;
  const secondMark = put(state, 0, '43', {z:1,r:2,c:1});
  secondMark.faceDown = true;
  result = submit(state, 'p0', 3, 'FLIP_CARD', {cardIid:secondMark.iid});
  assert.equal(result.ok, true);
  assert.deepEqual(result.state.pendingPrompt?.eligible, [
    {z:1,r:3,c:0},
    {z:1,r:3,c:1}
  ]);
  assertInvariants(result.state);
}

// Visegrad's authority status must survive unrelated snapshots/turn changes,
// decrement only on the affected opponent's consolidations, and disappear
// exactly after the second one.
{
  let state = createInitialState({
    matchId:'P7REGRESSIONVISEGRADLIFETIME',
    seed:'p7-regression-visegrad-lifetime',
    handSize:99,
    activePlayer:0,
    cardDefinitions:DEFINITIONS,
    players:[
      {id:'p0', deckIds:['97','32','32','32']},
      {id:'p1', deckIds:['03','22','05','32','32','32','32']}
    ]
  });
  const politician = state.players[0].hand.find(card=>card.id === '97');
  const set = legalCommandTemplates(state, 0).find(item=>item.type === 'SET_CARD' && item.payload.cardIid === politician.iid);
  let result = submit(state, 'p0', 1, set.type, set.payload);
  assert.equal(result.ok, true);
  let status = result.state.statuses.find(item=>item.type === 'CONSOLIDATION_COST_MODIFIER');
  assert.equal(status?.remaining, 2);
  assert.equal(status?.playerIndex, 1);
  for(const viewer of [0,1]){
    const projected = projectStateForPlayer(result.state, viewer);
    assert.equal(projected.statuses.find(item=>item.type === 'CONSOLIDATION_COST_MODIFIER')?.remaining, 2);
  }
  state = result.state;
  result = submit(state, 'p0', 2, 'END_TURN');
  assert.equal(result.ok, true);
  status = result.state.statuses.find(item=>item.type === 'CONSOLIDATION_COST_MODIFIER');
  assert.equal(status?.remaining, 2, 'turn changes must not consume Administrative Bloat');
  assertInvariants(result.state);
}

// Copied effect mutations retain the copied card's semantic identity so the
// presentation layer can use the copied overlay (British here), not Ledger's.
{
  let state = createInitialState({
    matchId:'P7REGRESSIONCOPYOVERLAY',
    seed:'p7-regression-copy-overlay',
    handSize:99,
    activePlayer:0,
    cardDefinitions:DEFINITIONS,
    players:[
      {id:'p0', deckIds:['75','05','32','32']},
      {id:'p1', deckIds:['32','32','32','32']}
    ]
  });
  const british = put(state, 0, '05', {z:0,r:2,c:0});
  const target = put(state, 0, '32', {z:0,r:2,c:1});
  const ledger = state.players[0].hand.find(card=>card.id === '75');
  const set = legalCommandTemplates(state, 0).find(item=>
    item.type === 'SET_CARD'
      && item.payload.cardIid === ledger.iid
      && item.payload.destination.z === 0
  );
  let result = submit(state, 'p0', 1, set.type, set.payload);
  assert.equal(result.ok, true);
  assert.equal(result.state.pendingPrompt?.type, 'BOARD_TARGET');
  state = result.state;
  result = submit(state, 'p0', 2, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIid:british.iid
  });
  assert.equal(result.ok, true);
  assert.equal(result.state.pendingPrompt?.type, 'BOARD_TARGET');
  state = result.state;
  result = submit(state, 'p0', 3, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIid:target.iid
  });
  assert.equal(result.ok, true);
  assert(result.events.some(event=>
    event.type === 'FATE_CHANGED'
      && event.sourceIid === ledger.iid
      && event.semanticSourceCardId === '05'
      && event.cardIid === target.iid
      && event.after === event.before + 3
  ));
  assertInvariants(result.state);
}

// Boleslaw's passive resolves inside the opponent searcher's effect frame. Its
// self-Fate mutation must retain Boleslaw's identity rather than inheriting the
// searched card's Supporter-target contract.
{
  let state = createInitialState({
    matchId:'P7REGRESSIONBOLESLAWSEARCH',
    seed:'p7-regression-boleslaw-search',
    handSize:99,
    activePlayer:0,
    cardDefinitions:DEFINITIONS,
    players:[
      {id:'p0', deckIds:['13','31','32','32']},
      {id:'p1', deckIds:['86','32','32','32']}
    ]
  });
  const boleslaw = put(state, 1, '86', {z:0,r:0,c:0});
  put(state, 0, '32', {z:0,r:2,c:0});
  const oathbound = take(state, 0, '31');
  state.players[0].deck.push(oathbound);
  const johnathan = state.players[0].hand.find(card=>card.id === '13');
  const set = legalCommandTemplates(state, 0).find(item=>
    ['SET_CARD','CONSOLIDATE_CARD'].includes(item.type)
      && item.payload.cardIid === johnathan.iid
  );
  assert(set, 'Johnathan must have a legal set command for the search trigger regression');
  let result = submit(state, 'p0', 1, set.type, set.payload);
  assert.equal(result.ok, true);
  assert.equal(result.state.pendingPrompt?.type, 'CARD_SELECTION');
  const selectedIid = String(result.state.pendingPrompt.eligibleIids?.find(iid=>String(iid) === String(oathbound.iid)) || '');
  assert.equal(selectedIid, oathbound.iid, 'Johnathan search must expose Oathbound by its canonical IID');
  state = result.state;
  result = submit(state, 'p0', 2, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIids:[selectedIid]
  });
  assert.equal(result.ok, true);
  assert(result.state.players[0].hand.some(card=>card.iid === oathbound.iid), 'Johnathan must accept the exact Oathbound selection');
  assert(result.events.some(event=>
    event.type === 'FATE_CHANGED'
      && event.sourceIid === boleslaw.iid
      && event.cardIid === boleslaw.iid
      && event.semanticSourceCardId === '86'
      && event.reason === 'A_BOMBASTIC_CHARACTER'
      && event.after === event.before + 2
  ));
  assertInvariants(result.state);
}

console.log('authoritative-v3 reported regression smoke test passed');
