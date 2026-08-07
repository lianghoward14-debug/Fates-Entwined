import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {
  assertInvariants,
  createInitialState,
  legalCommandTemplates,
  reduceCommand,
  stableStringify
} from '../../shared/engine/index.mjs';
import {
  cardCoverageInventory,
  cardRule
} from '../../shared/engine/cards/registry.mjs';
import {command} from './test-helpers.mjs';

const require = createRequire(import.meta.url);
const {getCardCatalog} = require('../fate-card-catalog.js');

const ACTIVE_CARDS = getCardCatalog().cards.filter(card=>
  card.retired !== true && card.temporarilyDisabled !== true
);
const DEFINITIONS = ACTIVE_CARDS.map(card=>({...card}));
const INVENTORY = cardCoverageInventory(ACTIVE_CARDS);
const REACTION_CARD_IDS = ['56', '67', '79'];
const INTERRUPTIBLE_SOURCE_IDS = [
  '14', '16', '30', '39', '51', '52',
  '61', '66', '90', '93', '96', 'bh04'
];

const reactionCards = INVENTORY.filter(item=>item.abilityTiming.includes('REACTION'));
const reactionPromptCards = INVENTORY.filter(item=>item.promptTypes.includes('REACTION'));
const interruptibleSources = reactionPromptCards.filter(item=>
  !item.abilityTiming.includes('REACTION')
);

assert.deepEqual(
  reactionCards.map(item=>item.cardId).sort(),
  [...REACTION_CARD_IDS].sort(),
  'the coverage inventory must enumerate every Improvisor reaction rule'
);
assert.deepEqual(
  interruptibleSources.map(item=>item.cardId).sort(),
  [...INTERRUPTIBLE_SOURCE_IDS].sort(),
  'the reaction batch must enumerate every non-Improvisor effect declaring a reaction window'
);
assert.equal(reactionPromptCards.length, 15);

function snapshot(value){
  return JSON.parse(stableStringify(value));
}

function takeCard(state, playerIndex, cardId){
  for(const pile of ['hand', 'deck', 'discard']){
    const index = state.players[playerIndex][pile].findIndex(card=>String(card.id) === String(cardId));
    if(index < 0) continue;
    return state.players[playerIndex][pile].splice(index, 1)[0];
  }
  throw new Error(`missing fixture card ${cardId} for player ${playerIndex}`);
}

function putOnBoard(state, playerIndex, cardId, destination, options = {}){
  const card = takeCard(state, playerIndex, cardId);
  card.controller = playerIndex;
  card.faceDown = options.faceDown === true;
  state.board[destination.z][destination.r][destination.c] = card;
  return card;
}

function findCard(state, iid){
  for(const player of state.players){
    for(const pile of ['hand', 'deck', 'discard']){
      const card = player[pile].find(item=>String(item.iid) === String(iid));
      if(card) return card;
    }
  }
  return state.board.flat(2).find(card=>card && String(card.iid) === String(iid)) || null;
}

function makeFixture(sourceId, reactorIds = [], suffix = ''){
  const state = createInitialState({
    matchId:`P7REACTION${String(sourceId).toUpperCase()}${suffix}`,
    seed:`p7-reaction-${sourceId}-${suffix}`,
    handSize:99,
    activePlayer:0,
    cardDefinitions:DEFINITIONS,
    players:[
      {id:'p0', deckIds:[sourceId, ...Array(12).fill('32'), '35', '33']},
      {id:'p1', deckIds:[...reactorIds, '35', ...Array(24).fill('32'), '33']}
    ]
  });
  const timing = cardRule(sourceId)?.timings?.includes('ACTIVATE') ? 'ACTIVATE' : 'WHEN_SET';
  const source = putOnBoard(state, 0, sourceId, {z:0, r:2, c:1}, {faceDown:timing === 'WHEN_SET'});
  const target = putOnBoard(state, 1, '32', {z:0, r:1, c:1});
  const reactors = reactorIds.map((id, index)=>
    putOnBoard(state, 1, id, {z:1 + Math.floor(index / 3), r:0, c:index % 3})
  );
  return {state, source, target, reactors, timing};
}

function triggerFixture(fixture, sequence = 1){
  const type = fixture.timing === 'ACTIVATE' ? 'ACTIVATE_EFFECT' : 'FLIP_CARD';
  const payload = fixture.timing === 'ACTIVATE'
    ? {sourceIid:fixture.source.iid}
    : {cardIid:fixture.source.iid};
  return reduceCommand(
    fixture.state,
    command(fixture.state, 'p0', sequence, type, payload),
    {playerId:'p0'}
  );
}

function answerReaction(state, choice, reactionIid, sequence = 2, playerId = 'p1'){
  const payload = {promptId:state.pendingPrompt.promptId, choice};
  if(reactionIid) payload.reactionIid = reactionIid;
  return reduceCommand(
    state,
    command(state, playerId, sequence, 'ANSWER_PROMPT', payload),
    {playerId}
  );
}

function assertReacted(result, kind, mode, reactionIid){
  assert.equal(result.ok, true);
  assert(result.events.some(event=>
    event.type === 'EFFECT_REACTED'
      && event.reactionKind === kind
      && event.mode === mode
      && String(event.reactionIid) === String(reactionIid)
  ));
  assert.notEqual(result.state.pendingPrompt?.type, 'REACTION');
  assertInvariants(result.state);
}

const coverage = {
  activeCards:ACTIVE_CARDS.length,
  reactionCards:reactionCards.map(item=>({cardId:item.cardId, name:item.name})),
  interruptibleSources:interruptibleSources.map(item=>({
    cardId:item.cardId,
    name:item.name,
    timings:item.abilityTiming,
    prompts:item.promptTypes
  })),
  cases:[]
};

// Lydia: every declared interruptible source must expose DECLINE, NEGATE and
// SUPPRESS. Each branch is reduced from the same immutable authoritative state.
for(const item of interruptibleSources){
  const fixture = makeFixture(item.cardId, ['56'], 'LYDIA');
  const opened = triggerFixture(fixture);
  assert.equal(opened.ok, true, `${item.name} must activate in the Lydia fixture`);
  assert.equal(opened.prompt?.type, 'REACTION', `${item.name} must open the reaction window`);
  const lydia = opened.prompt.options.find(option=>option.kind === 'LYDIA');
  assert(lydia, `${item.name} must expose Lydia`);
  assert.deepEqual([...lydia.modes].sort(), ['NEGATE', 'SUPPRESS']);
  const reactionState = snapshot(opened.state);

  const declined = answerReaction(snapshot(reactionState), 'DECLINE', null, 2);
  assert.equal(declined.ok, true, `${item.name} must resume after Lydia is declined`);
  assert.notEqual(declined.state.pendingPrompt?.type, 'REACTION');
  assertInvariants(declined.state);

  for(const mode of ['NEGATE', 'SUPPRESS']){
    const resolved = answerReaction(snapshot(reactionState), mode, lydia.reactionIid, mode === 'NEGATE' ? 3 : 4);
    assertReacted(resolved, 'LYDIA', mode, lydia.reactionIid);
    assert.equal(resolved.state.effectStack.length, 0, `${mode} must close ${item.name}'s effect frame`);
    assert.equal(findCard(resolved.state, lydia.reactionIid)?.counters?.reactionUses, 1);
    assert.equal(
      findCard(resolved.state, fixture.source.iid)?.statuses?.includes('EFFECTS_SUPPRESSED'),
      mode === 'SUPPRESS'
    );
  }

  coverage.cases.push({sourceCardId:item.cardId, reactorCardId:'56', branches:['DECLINE', 'NEGATE', 'SUPPRESS']});
}

// Mr. Secules is deliberately narrower: activated Initiators and when-set
// Supporters only. Assert both the positive and negative eligibility boundary.
const seculesEligible = [];
const seculesIneligible = [];
for(const item of interruptibleSources){
  const printed = ACTIVE_CARDS.find(card=>String(card.id) === item.cardId);
  const timing = cardRule(item.cardId)?.timings?.includes('ACTIVATE') ? 'ACTIVATE' : 'WHEN_SET';
  const expected = timing === 'ACTIVATE'
    ? printed?.type === 'Initiator'
    : printed?.type === 'Supporter';
  const fixture = makeFixture(item.cardId, ['67'], 'SECULES');
  const opened = triggerFixture(fixture, 10);
  assert.equal(opened.ok, true);
  const option = opened.prompt?.type === 'REACTION'
    ? opened.prompt.options.find(candidate=>candidate.kind === 'SECULES')
    : null;
  assert.equal(!!option, expected, `${item.name} Mr. Secules eligibility must match its printed type and timing`);
  if(expected){
    seculesEligible.push(item.cardId);
    const resolved = answerReaction(snapshot(opened.state), 'NEGATE', option.reactionIid, 11);
    assertReacted(resolved, 'SECULES', 'NEGATE', option.reactionIid);
    assert.equal(findCard(resolved.state, option.reactionIid)?.counters?.reactionUses, 1);
  }else{
    seculesIneligible.push(item.cardId);
  }
}
assert.deepEqual(seculesEligible.sort(), ['16', '30', '39', '52', '96'].sort());

// Multiple Improvisors must produce separate legal commands, including the
// common decline command, without collapsing the identity of either card.
{
  const fixture = makeFixture('30', ['56', '67'], 'MULTI');
  const opened = triggerFixture(fixture, 20);
  assert.equal(opened.prompt?.type, 'REACTION');
  const lydia = opened.prompt.options.find(option=>option.kind === 'LYDIA');
  const secules = opened.prompt.options.find(option=>option.kind === 'SECULES');
  assert(lydia && secules);
  const commands = legalCommandTemplates(opened.state, 1).filter(item=>item.type === 'ANSWER_PROMPT');
  assert(commands.some(item=>item.payload.choice === 'DECLINE'));
  assert(commands.some(item=>item.payload.choice === 'NEGATE' && item.payload.reactionIid === lydia.reactionIid));
  assert(commands.some(item=>item.payload.choice === 'SUPPRESS' && item.payload.reactionIid === lydia.reactionIid));
  assert(commands.some(item=>item.payload.choice === 'NEGATE' && item.payload.reactionIid === secules.reactionIid));
  assert.equal(commands.some(item=>item.payload.choice === 'SUPPRESS' && item.payload.reactionIid === secules.reactionIid), false);

  const invalidMode = answerReaction(snapshot(opened.state), 'SUPPRESS', secules.reactionIid, 21);
  assert.equal(invalidMode.ok, false);
  assert.equal(invalidMode.rejection.code, 'INVALID_REACTION');

  const wrongOwner = answerReaction(snapshot(opened.state), 'NEGATE', lydia.reactionIid, 22, 'p0');
  assert.equal(wrongOwner.ok, false);
  assert.equal(wrongOwner.rejection.code, 'PROMPT_NOT_OWNED');

  const bogusCard = answerReaction(snapshot(opened.state), 'NEGATE', 'not-an-option', 23);
  assert.equal(bogusCard.ok, false);
  assert.equal(bogusCard.rejection.code, 'INVALID_REACTION');

  const removedState = snapshot(opened.state);
  for(const zone of removedState.board){
    for(const row of zone){
      const index = row.findIndex(card=>String(card?.iid || '') === String(lydia.reactionIid));
      if(index >= 0) row[index] = null;
    }
  }
  const missingCard = answerReaction(removedState, 'NEGATE', lydia.reactionIid, 24);
  assert.equal(missingCard.ok, false);
  assert.equal(missingCard.rejection.code, 'REACTION_NOT_FOUND');
}

// Exhausted Improvisors must not advertise another reaction.
for(const [cardId, used] of [['56', 3], ['67', 1]]){
  const fixture = makeFixture('30', [cardId], `EXHAUST${cardId}`);
  fixture.reactors[0].counters.reactionUses = used;
  const opened = triggerFixture(fixture, 30 + used);
  assert.equal(opened.ok, true);
  const kind = cardId === '56' ? 'LYDIA' : 'SECULES';
  assert.equal(opened.prompt?.options?.some(option=>option.kind === kind) || false, false);
}

function openHavanoReaction(suffix = ''){
  const fixture = makeFixture('30', ['79'], `HAVANO${suffix}`);
  const havano = fixture.reactors[0];
  fixture.state.board[1][0][0] = null;
  havano.faceDown = false;
  fixture.state.players[1].hand.push(havano);
  fixture.reactors = [];
  let result = triggerFixture(fixture, 40);
  assert.equal(result.prompt?.type, 'BOARD_TARGET');
  result = reduceCommand(
    result.state,
    command(result.state, 'p0', 41, 'ANSWER_PROMPT', {
      promptId:result.state.pendingPrompt.promptId,
      selectedIid:fixture.target.iid
    }),
    {playerId:'p0'}
  );
  assert.equal(result.ok, true);
  assert.equal(result.prompt?.type, 'REACTION');
  const option = result.prompt.options.find(candidate=>candidate.kind === 'HAVANO');
  assert(option && option.reactionIid === havano.iid);
  return {fixture, havano, option, reactionState:snapshot(result.state)};
}

// Havano decline: the original targeted operation resumes and the card stays
// private in hand.
{
  const opened = openHavanoReaction('DECLINE');
  const result = answerReaction(snapshot(opened.reactionState), 'DECLINE', null, 42);
  assert.equal(result.ok, true);
  assert.equal(
    result.state.players[1].discard.some(card=>String(card.iid) === String(opened.fixture.target.iid)),
    true,
    'declining Havano must resume Santiago and discard the selected target'
  );
  assert.equal(findCard(result.state, opened.havano.iid)?.iid, opened.havano.iid);
  assert.equal(result.state.effectStack.length, 0);
  assertInvariants(result.state);
  coverage.cases.push({sourceCardId:'30', reactorCardId:'79', branches:['DECLINE']});
}

// Havano negate and suppress both enter the resumable destination prompt. The
// target survives, Havano becomes public on board, and the effect frame closes.
for(const mode of ['NEGATE', 'SUPPRESS']){
  const opened = openHavanoReaction(mode);
  let result = answerReaction(snapshot(opened.reactionState), mode, opened.havano.iid, mode === 'NEGATE' ? 43 : 44);
  assert.equal(result.ok, true);
  assert.equal(result.prompt?.type, 'BOARD_DESTINATION');
  assert.equal(result.prompt?.context, 'HAVANO_SET');
  const destination = result.prompt.eligible[0];
  result = reduceCommand(
    result.state,
    command(result.state, 'p1', mode === 'NEGATE' ? 45 : 46, 'ANSWER_PROMPT', {
      promptId:result.state.pendingPrompt.promptId,
      destination
    }),
    {playerId:'p1'}
  );
  assert.equal(result.ok, true);
  assert.equal(findCard(result.state, opened.fixture.target.iid)?.iid, opened.fixture.target.iid);
  assert.equal(result.state.board[destination.z][destination.r][destination.c]?.iid, opened.havano.iid);
  assert.equal(result.state.effectStack.length, 0);
  assert.equal(
    findCard(result.state, opened.fixture.source.iid)?.statuses?.includes('EFFECTS_SUPPRESSED'),
    mode === 'SUPPRESS'
  );
  assertInvariants(result.state);
  coverage.cases.push({sourceCardId:'30', reactorCardId:'79', branches:[mode, 'BOARD_DESTINATION']});
}

// Removing Havano from hand while its server prompt is open must reject the
// stale choice and preserve the prompt for a valid decline/recovery.
{
  const opened = openHavanoReaction('REMOVED');
  const stale = snapshot(opened.reactionState);
  const handIndex = stale.players[1].hand.findIndex(card=>card.iid === opened.havano.iid);
  stale.players[1].hand.splice(handIndex, 1);
  const rejected = answerReaction(stale, 'NEGATE', opened.havano.iid, 47);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.rejection.code, 'REACTION_NOT_FOUND');
  assert.equal(stale.pendingPrompt.type, 'REACTION');
}

coverage.summary = {
  reactionCardCount:reactionCards.length,
  interruptibleSourceCount:interruptibleSources.length,
  lydiaSourceBranches:interruptibleSources.length * 3,
  seculesEligibleSources:seculesEligible.sort(),
  seculesIneligibleSources:seculesIneligible.sort(),
  deterministicCases:coverage.cases.reduce((total, item)=>total + item.branches.length, 0)
};

console.log(JSON.stringify(coverage, null, 2));
console.log('authoritative-v3 Phase 7 reaction coverage smoke test passed');
