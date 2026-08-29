import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState, reduceCommand} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const require = createRequire(import.meta.url);
const {getCardCatalog} = require('../fate-card-catalog.js');
const DEFINITIONS = getCardCatalog().cards.filter(card=>
  card.retired !== true && card.temporarilyDisabled !== true
);

function takeCard(state, playerIndex, cardId){
  for(const pile of ['hand', 'deck', 'discard']){
    const index = state.players[playerIndex][pile].findIndex(card=>String(card.id) === String(cardId));
    if(index < 0) continue;
    return state.players[playerIndex][pile].splice(index, 1)[0];
  }
  throw new Error(`missing fixture card ${cardId}`);
}

function putOnBoard(state, playerIndex, cardId, destination, faceDown = false){
  const card = takeCard(state, playerIndex, cardId);
  card.controller = playerIndex;
  card.faceDown = faceDown;
  state.board[destination.z][destination.r][destination.c] = card;
  return card;
}

function fixture(sourceId, reactors, suffix){
  const state = createInitialState({
    matchId:`MORALE-REACTIONS-${sourceId}-${suffix}`,
    seed:`morale-reactions-${sourceId}-${suffix}`,
    handSize:99,
    activePlayer:0,
    landscapeId:'igb2',
    gameSettings:{healthPressureSeals:true, pressureCardReworks:true},
    cardDefinitions:DEFINITIONS,
    players:[
      {id:'p0', deckIds:[sourceId, ...Array(16).fill('32')]},
      {id:'p1', deckIds:[...reactors, ...Array(16).fill('32')]}
    ]
  });
  const source = putOnBoard(state, 0, sourceId, {z:0,r:2,c:1}, true);
  for(const id of reactors.filter(id=>id === '79')){
    const card = takeCard(state, 1, id);
    state.players[1].hand.push(card);
  }
  const reactorCards = reactors
    .filter(id=>id !== '79')
    .map((id, index)=>putOnBoard(state, 1, id, {z:1,r:0,c:index}));
  return {state, source, reactorCards};
}

function flip(fixtureValue, sequence = 1){
  return reduceCommand(
    fixtureValue.state,
    command(fixtureValue.state, 'p0', sequence, 'FLIP_CARD', {cardIid:fixtureValue.source.iid}),
    {playerId:'p0'}
  );
}

// The four reworked WHEN_SET cards all expose Lydia. Secules remains narrower:
// the three printed Supporters qualify, while Dauntless Chingachlook does not.
for(const sourceId of ['20', '45', '47', '64']){
  const value = fixture(sourceId, ['56', '67'], 'LYDIA-SECULES');
  const opened = flip(value);
  assert.equal(opened.ok, true, `${sourceId} must flip successfully`);
  assert.equal(opened.prompt?.type, 'REACTION', `${sourceId} must open a reaction window`);
  assert(opened.prompt.options.some(option=>option.kind === 'LYDIA'), `${sourceId} must expose Lydia`);
  assert.equal(
    opened.prompt.options.some(option=>option.kind === 'SECULES'),
    sourceId !== '45',
    `${sourceId} must obey Secules' printed Supporter boundary`
  );
}

// Lydia's negate must prevent the effect itself, not merely close the prompt
// after Great Oak has already dealt its Morale damage.
{
  const value = fixture('47', ['56'], 'LYDIA-NEGATE');
  let result = flip(value);
  const before = Number(result.state.moralePressure.morale[1]);
  const lydia = result.prompt.options.find(option=>option.kind === 'LYDIA');
  result = reduceCommand(
    result.state,
    command(result.state, 'p1', 2, 'ANSWER_PROMPT', {
      promptId:result.state.pendingPrompt.promptId,
      choice:'NEGATE',
      reactionIid:lydia.reactionIid
    }),
    {playerId:'p1'}
  );
  assert.equal(result.ok, true);
  assert.equal(Number(result.state.moralePressure.morale[1]), before);
  const source = result.state.board.flat(2).find(card=>card?.iid === value.source.iid);
  assert(source.statuses.includes('EFFECTS_SUPPRESSED'));
}

// Havano covers every card-defined Morale damage source: Rozsi's affiliation
// damage, Alexander, Great Oak, Duelist's damage multiplier, and Marines.
for(const sourceId of ['34', '35', '47', '64', '65']){
  const value = fixture(sourceId, ['79'], 'HAVANO');
  const opened = flip(value);
  assert.equal(opened.ok, true, `${sourceId} must flip successfully for Havano`);
  assert.equal(opened.prompt?.type, 'REACTION', `${sourceId} must open Havano`);
  const havano = opened.prompt.options.find(option=>option.kind === 'HAVANO');
  assert(havano, `${sourceId} must expose Havano`);
  assert.deepEqual([...havano.modes].sort(),
    sourceId === '35' || sourceId === '65' ? ['SUPPRESS'] : ['NEGATE', 'SUPPRESS']);
}

// Negating Great Oak must happen before its direct Morale damage resolves, and
// the activation frame must not continue after Havano is deployed.
{
  const value = fixture('47', ['79'], 'HAVANO-NEGATE');
  let result = flip(value);
  assert.equal(result.prompt?.type, 'REACTION', JSON.stringify({ok:result.ok, rejection:result.rejection, events:result.events}));
  const before = Number(result.state.moralePressure.morale[1]);
  const havano = result.prompt.options.find(option=>option.kind === 'HAVANO');
  result = reduceCommand(
    result.state,
    command(result.state, 'p1', 2, 'ANSWER_PROMPT', {
      promptId:result.state.pendingPrompt.promptId,
      choice:'NEGATE',
      reactionIid:havano.reactionIid
    }),
    {playerId:'p1'}
  );
  assert.equal(result.prompt?.context, 'HAVANO_SET');
  const destination = result.prompt.eligible[0];
  result = reduceCommand(
    result.state,
    command(result.state, 'p1', 3, 'ANSWER_PROMPT', {
      promptId:result.state.pendingPrompt.promptId,
      destination
    }),
    {playerId:'p1'}
  );
  assert.equal(result.ok, true);
  assert.equal(Number(result.state.moralePressure.morale[1]), before, 'negated Great Oak must deal no Morale damage');
  assert.equal(result.state.effectStack.length, 0, 'Havano must close the full activation frame');
}

console.log('Morale Lydia, Secules, and Havano reaction coverage smoke test passed');
