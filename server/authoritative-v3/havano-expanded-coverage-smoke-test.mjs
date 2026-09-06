import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createInitialState, reduceCommand} from '../../shared/engine/index.mjs';
import {cardRule} from '../../shared/engine/cards/registry.mjs';
import {command} from './test-helpers.mjs';

const require = createRequire(import.meta.url);
const {getCardCatalog} = require('../fate-card-catalog.js');
const {HAVANO_TARGETING_SOURCE_IDS} = require('../../src/scripts/02-effect-rule-metadata.js');
const onlineRooms = fs.readFileSync(new URL('../../src/scripts/18-online-rooms.js', import.meta.url), 'utf8');
const DEFINITIONS = getCardCatalog().cards.filter(card=>
  card.retired !== true && card.temporarilyDisabled !== true
);

for(const sourceId of HAVANO_TARGETING_SOURCE_IDS){
  assert.equal(cardRule(sourceId)?.havanoTargeting, 'OPPONENT', `${sourceId} must share Havano targeting eligibility in authority and browser rules`);
}

// Authoritative counters must be projected into the legacy fields consumed by
// the same match-tracker UI used in single-player.
assert.match(onlineRooms, /rule-use:semper_fidelis:p/);
assert.match(onlineRooms, /usMarinesUses:\[0,1\]\.map/);
assert.match(onlineRooms, /rule-use:snowy_village:p/);
assert.match(onlineRooms, /_snowyVillageUses:\[0,1\]\.map/);
for(const [cardId, maxUses] of [['20', 2], ['40', 2], ['bh16', 2]]){
  assert.match(
    onlineRooms,
    new RegExp(`['"]${cardId}['"]\\s*:\\s*${maxUses}`),
    `${cardId} remaining-effect uses must be projected for multiplayer trackers`
  );
}
assert.match(onlineRooms, /_bh08ProcCount\s*=\s*Math\.max\([^;]+card\.counters\?\.bh08ProcCount/);
assert.match(onlineRooms, /_wintertideTriggerCount\s*=\s*Math\.max\([^;]+card\.counters\?\.wintertideTriggerCount/);

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

function sourceFixture(sourceId, reactorId = '79'){
  const state = createInitialState({
    matchId:`HAVANO-EXPANDED-${sourceId}`,
    seed:`havano-expanded-${sourceId}`,
    handSize:99,
    activePlayer:0,
    cardDefinitions:DEFINITIONS,
    players:[
      {id:'p0', deckIds:[sourceId, ...Array(14).fill('32')]},
      {id:'p1', deckIds:[reactorId, ...Array(14).fill('32')]}
    ]
  });
  const timing = cardRule(sourceId, state)?.timings?.includes('ACTIVATE') ? 'ACTIVATE' : 'WHEN_SET';
  const source = putOnBoard(state, 0, sourceId, {z:0,r:2,c:1}, timing === 'WHEN_SET');
  putOnBoard(state, 1, '32', {z:0,r:1,c:1});
  const reactor = reactorId === '79'
    ? takeCard(state, 1, reactorId)
    : putOnBoard(state, 1, reactorId, {z:1,r:0,c:0});
  if(reactorId === '79') state.players[1].hand.push(reactor);
  return {state, source, reactor, timing};
}

for(const sourceId of ['18', '72', '81', '93', '97', 'bh04', 'bh16']){
  const value = sourceFixture(sourceId);
  const type = value.timing === 'ACTIVATE' ? 'ACTIVATE_EFFECT' : 'FLIP_CARD';
  const payload = value.timing === 'ACTIVATE'
    ? {sourceIid:value.source.iid, ...(sourceId === 'bh16' ? {userActivated:true} : {})}
    : {cardIid:value.source.iid};
  const opened = reduceCommand(
    value.state,
    command(value.state, 'p0', 1, type, payload),
    {playerId:'p0'}
  );
  assert.equal(opened.ok, true, `${sourceId} must activate: ${JSON.stringify(opened.rejection || {})}`);
  assert.equal(opened.prompt?.type, 'REACTION', `${sourceId} must open Havano`);
  const option = opened.prompt.options.find(candidate=>candidate.kind === 'HAVANO');
  assert(option, `${sourceId} must expose Havano from hand`);
  assert.equal(option.reactionIid, value.reactor.iid);
  assert.deepEqual([...option.modes], ['NEGATE', 'SUPPRESS']);
}

// Secules also covers the newer sources that meet his narrower printed rule:
// Initiator effects and Supporter WHEN_SET effects.
for(const sourceId of ['81', '97', 'bh04']){
  const value = sourceFixture(sourceId, '67');
  const opened = reduceCommand(
    value.state,
    command(value.state, 'p0', 1, 'FLIP_CARD', {cardIid:value.source.iid}),
    {playerId:'p0'}
  );
  assert.equal(opened.ok, true);
  assert.equal(opened.prompt?.type, 'REACTION');
  const option = opened.prompt.options.find(candidate=>candidate.kind === 'SECULES');
  assert(option && option.reactionIid === value.reactor.iid, `${sourceId} must expose Secules`);
}

// Post-Cynthia Jimmy triggers at the opponent's turn ending. Havano interrupts
// each Jimmy source separately and can prevent that source's random deck discard.
{
  const state = createInitialState({
    matchId:'HAVANO-EXPANDED-BH18', seed:'havano-expanded-bh18', handSize:1, activePlayer:0,
    cardDefinitions:DEFINITIONS,
    players:[
      {id:'p0', deckIds:['79', ...Array(16).fill('32')]},
      {id:'p1', deckIds:['bh18', ...Array(8).fill('32')]}
    ]
  });
  const jimmy = putOnBoard(state, 1, 'bh18', {z:1,r:0,c:0});
  const havano = takeCard(state, 0, '79');
  state.players[0].hand.push(havano);
  let result = reduceCommand(state, command(state, 'p0', 1, 'END_TURN', {}), {playerId:'p0'});
  assert.equal(result.prompt?.type, 'REACTION');
  const option = result.prompt.options.find(candidate=>candidate.kind === 'HAVANO');
  assert(option && option.reactionIid === havano.iid, 'BH18 turn-end discard must expose Havano');
  result = reduceCommand(result.state, command(result.state, 'p0', 2, 'ANSWER_PROMPT', {
    promptId:result.state.pendingPrompt.promptId, choice:'NEGATE', reactionIid:havano.iid
  }), {playerId:'p0'});
  assert(result.events.some(event=>event.type === 'EFFECT_REACTED' && event.sourceIid === jimmy.iid));
  assert.equal(result.prompt?.context, 'HAVANO_SET');
  result = reduceCommand(result.state, command(result.state, 'p0', 3, 'ANSWER_PROMPT', {
    promptId:result.state.pendingPrompt.promptId,
    destination:result.state.pendingPrompt.eligible[0]
  }), {playerId:'p0'});
  assert.equal(result.ok, true);
  assert(!result.events.some(event=>event.reason === 'GENESIS_OF_ALL_INCELDOM'), 'negated BH18 must not discard from deck');
}

console.log('expanded Havano source coverage smoke test passed');
