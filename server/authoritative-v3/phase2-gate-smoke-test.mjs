import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  activeHandLimit,
  cardRule,
  canonicalHash,
  isProtectedHandLimitCard,
  legalCommandTemplates,
  reduceCommand,
  refreshHandLimitRequirement,
  zoneScore
} from '../../shared/engine/index.mjs';
import {command, takeFromHandToBoard, testState} from './test-helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const legacyGameplay = fs.readFileSync(path.join(root, 'src/scripts/05-gameplay-core.js'), 'utf8');
const legacyRendering = fs.readFileSync(path.join(root, 'src/scripts/06-rendering-and-helpers.js'), 'utf8');
const legacyAI = fs.readFileSync(path.join(root, 'src/scripts/07-ai.js'), 'utf8');

for(const cardId of ['06', '13', '27', '29', '30', '39', '48']){
  assert.equal(cardRule(cardId)?.maxUses, 1, `${cardId} initial Character effect must not be repeatable`);
}

assert.match(
  legacyAI,
  /const requestedTarget = choice\.tributes\.find[\s\S]*const target = requestedTarget \|\| scored\[0\]\.t/,
  'legacy consolidation must continue to place on a selected tribute square'
);
assert.match(
  legacyGameplay,
  /if\(G\.turn >= G\.maxTurns\)[\s\S]*checkWin\(\)/,
  'legacy victory must continue to resolve before advancing past maxTurns'
);
assert.match(
  legacyGameplay,
  /p0wins>=2\?0:p1wins>=2\?1:-1[\s\S]*p0TotalFate > p1TotalFate[\s\S]*isDraw = true/,
  'legacy victory must remain two zones, then total Fate, then exact draw'
);
assert.match(
  legacyRendering,
  /function getActiveHandLimit[\s\S]*_bh03OpponentHand === true; \}\) \? 6 : 12/,
  'legacy hand limits must remain 12 normally and 6 under opponent Ali'
);

let state = testState({
  matchId:'PHASE2CONSOLIDATE',
  player0:['34', '32'],
  player1:['32']
});
const coordinator = state.players[0].hand.find(card=>card.id === '34');
const tribute = takeFromHandToBoard(state, 0, '32', {z:0, r:2, c:0});
const beforeRejectedHash = canonicalHash(state);
let result = reduceCommand(
  state,
  command(state, 'p0', 1, 'CONSOLIDATE_CARD', {
    cardIid:coordinator.iid,
    tributeIids:[tribute.iid],
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, false);
assert.equal(result.rejection.code, 'INSUFFICIENT_REINFORCEMENT');
assert.equal(canonicalHash(state), beforeRejectedHash, 'failed consolidation must be atomic');

state = testState({
  matchId:'PHASE2CONSOLIDATEOK',
  player0:['34', '32', '31'],
  player1:['32']
});
const character = state.players[0].hand.find(card=>card.id === '34');
const tributeA = takeFromHandToBoard(state, 0, '32', {z:0, r:2, c:0});
const tributeB = takeFromHandToBoard(state, 0, '31', {z:1, r:2, c:0});
const identityBefore = new Set([
  ...state.players.flatMap(player=>[...player.deck, ...player.hand, ...player.discard]),
  ...state.board.flat(2).filter(Boolean)
].map(card=>card.iid));
const consolidationTemplates = legalCommandTemplates(state, 0)
  .filter(template=>template.type === 'CONSOLIDATE_CARD');
assert(consolidationTemplates.length > 0, 'legal command generation must expose base consolidation');
result = reduceCommand(
  state,
  command(state, 'p0', 2, 'CONSOLIDATE_CARD', {
    cardIid:character.iid,
    tributeIids:[tributeA.iid, tributeB.iid],
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.board[0][2][0].iid, character.iid);
assert.deepStrictEqual(
  new Set(result.state.players[0].discard.map(card=>card.iid)),
  new Set([tributeA.iid, tributeB.iid])
);
const identityAfter = [
  ...result.state.players.flatMap(player=>[...player.deck, ...player.hand, ...player.discard]),
  ...result.state.board.flat(2).filter(Boolean)
].map(card=>card.iid);
assert.equal(identityAfter.length, identityBefore.size);
assert.deepStrictEqual(new Set(identityAfter), identityBefore);
assert(result.events.some(event=>event.type === 'CARD_CONSOLIDATED'));

state = testState({
  matchId:'PHASE2SETLIMIT',
  player0:['26', '79', '32'],
  player1:['32']
});
for(let setIndex = 0; setIndex < 2; setIndex += 1){
  const card = state.players[0].hand.find(item=>['26', '79'].includes(item.id));
  result = reduceCommand(
    state,
    command(state, 'p0', 20 + setIndex, 'SET_CARD', {
      cardIid:card.iid,
      destination:{z:setIndex, r:2, c:0}
    }),
    {playerId:'p0'}
  );
  assert.equal(result.ok, true);
  state = result.state;
}
const thirdSupporter = state.players[0].hand.find(card=>card.id === '32');
result = reduceCommand(
  state,
  command(state, 'p0', 22, 'SET_CARD', {
    cardIid:thirdSupporter.iid,
    destination:{z:2, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, false);
assert.equal(result.rejection.code, 'SUPPORTER_SET_LIMIT_REACHED');

state = testState({
  matchId:'PHASE2MOVEFATE',
  player0:['bh01'],
  player1:['32']
});
const voyager = takeFromHandToBoard(state, 0, 'bh01', {z:0, r:2, c:0});
result = reduceCommand(
  state,
  command(state, 'p0', 3, 'MOVE_CARD', {
    cardIid:voyager.iid,
    destination:{z:2, r:2, c:2}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.board[2][2][2].iid, voyager.iid);

const manyCards = Array.from({length:13}, ()=> '32');
state = testState({
  matchId:'PHASE2HANDLIMIT',
  player0:manyCards,
  player1:['32']
});
assert.equal(state.players[0].hand.length, 12);
assert.equal(state.players[0].deck.length, 1);
result = reduceCommand(
  state,
  command(state, 'p0', 4, 'DRAW_CARD', {playerIndex:0, count:1}),
  {playerId:'p0', allowDebugCommands:true}
);
assert.equal(result.ok, true);
assert.equal(result.status, 'NEEDS_CHOICE');
assert.deepStrictEqual(result.state.pendingHandLimit, {playerIndex:0, limit:12, required:1});
const discardIid = result.state.players[0].hand[0].iid;
const handLimitTemplates = legalCommandTemplates(result.state, 0);
assert(handLimitTemplates.some(template=>template.type === 'DISCARD_TO_HAND_LIMIT'));
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 5, 'DISCARD_TO_HAND_LIMIT', {discardedIids:[discardIid]}),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.players[0].hand.length, 12);
assert.equal(result.state.players[0].discard.some(card=>card.iid === discardIid), true);
assert.equal(result.state.pendingHandLimit, null);

state = testState({
  matchId:'PHASE2STOLENGUERILLAHANDLIMIT',
  player0:['70'],
  player1:Array.from({length:12}, ()=> '32')
});
const stolenGuerilla = state.players[0].hand.shift();
state.players[1].hand.push(stolenGuerilla);
state.activePlayer = 1;
assert.equal(stolenGuerilla.statuses.includes('GUERILLA_INFILTRATING'), false);
assert.equal(isProtectedHandLimitCard(stolenGuerilla, 1), true);
assert.equal(activeHandLimit(state, 1), 12);
assert.deepStrictEqual(refreshHandLimitRequirement(state), {playerIndex:1, limit:12, required:1});
const stolenGuerillaTemplates = legalCommandTemplates(state, 1)
  .filter(template=>template.type === 'DISCARD_TO_HAND_LIMIT');
assert(stolenGuerillaTemplates.length > 0);
assert.equal(
  stolenGuerillaTemplates.some(template=>template.payload.discardedIids.includes(stolenGuerilla.iid)),
  false,
  'an opponent-held Wine Country Guerilla that would replace itself must not be a hand-limit discard choice'
);
result = reduceCommand(
  state,
  command(state, 'p1', 6, 'DISCARD_TO_HAND_LIMIT', stolenGuerillaTemplates[0].payload),
  {playerId:'p1'}
);
assert.equal(result.ok, true);
assert.equal(result.state.players[1].hand.length, 12);
assert(result.state.players[1].hand.some(card=>card.iid === stolenGuerilla.iid));
assert.equal(result.state.pendingHandLimit, null);

const immutableHandCards = ['bh01', ...Array.from({length:12}, ()=> '32')];
state = testState({
  matchId:'PHASE2IMMUTABLEHANDLIMIT',
  player0:immutableHandCards,
  player1:['32']
});
let immutableCard = state.players[0].hand.find(card=>card.id === 'bh01');
if(!immutableCard){
  const immutableIndex = state.players[0].deck.findIndex(card=>card.id === 'bh01');
  immutableCard = state.players[0].deck.splice(immutableIndex, 1)[0];
  state.players[0].deck.push(state.players[0].hand.pop());
  state.players[0].hand.push(immutableCard);
}
result = reduceCommand(
  state,
  command(state, 'p0', 6, 'DRAW_CARD', {playerIndex:0, count:1}),
  {playerId:'p0', allowDebugCommands:true}
);
assert.equal(result.ok, true);
const immutableDiscard = legalCommandTemplates(result.state, 0).find(template=>
  template.type === 'DISCARD_TO_HAND_LIMIT'
  && template.payload.discardedIids.includes(immutableCard.iid)
);
assert(immutableDiscard, 'intrinsically immutable cards still count as discardable hand-limit choices');
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 7, 'DISCARD_TO_HAND_LIMIT', immutableDiscard.payload),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert(result.state.players[0].discard.some(card=>card.iid === immutableCard.iid));

const alpineHandCards = ['76', ...Array.from({length:12}, ()=> '32')];
state = testState({
  matchId:'PHASE2ALPINEHANDLIMIT',
  player0:alpineHandCards,
  player1:['32']
});
let alpineCard = state.players[0].hand.find(card=>card.id === '76');
if(!alpineCard){
  const alpineIndex = state.players[0].deck.findIndex(card=>card.id === '76');
  alpineCard = state.players[0].deck.splice(alpineIndex, 1)[0];
  state.players[0].deck.push(state.players[0].hand.pop());
  state.players[0].hand.push(alpineCard);
}
result = reduceCommand(
  state,
  command(state, 'p0', 8, 'DRAW_CARD', {playerIndex:0, count:1}),
  {playerId:'p0', allowDebugCommands:true}
);
assert.equal(result.ok, true);
const alpineDiscard = legalCommandTemplates(result.state, 0).find(template=>
  template.type === 'DISCARD_TO_HAND_LIMIT'
  && template.payload.discardedIids.includes(alpineCard.iid)
);
assert(alpineDiscard, 'effect-immune ALPINE Infantry remains discardable by the mandatory hand-limit rule');
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 9, 'DISCARD_TO_HAND_LIMIT', alpineDiscard.payload),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert(result.state.players[0].discard.some(card=>card.iid === alpineCard.iid));

state = testState({
  matchId:'PHASE2VICTORY',
  player0:['27', '34'],
  player1:['32']
});
const winnerCardA = takeFromHandToBoard(state, 0, '27', {z:0, r:2, c:0});
const winnerCardB = takeFromHandToBoard(state, 0, '34', {z:1, r:2, c:0});
winnerCardA.currentFate = 3;
winnerCardB.currentFate = 4;
state.maxTurns = 1;
assert.equal(zoneScore(state, 0, 0), 3);
assert.equal(zoneScore(state, 1, 0), 4);
result = reduceCommand(state, command(state, 'p0', 6, 'END_TURN'), {playerId:'p0'});
assert.equal(result.ok, true);
assert.equal(result.status, 'ENDED');
assert.equal(result.state.phase, 'ended');
assert.equal(result.state.outcome.type, 'VICTORY');
assert.equal(result.state.outcome.winner, 0);
assert.equal(result.state.outcome.reason, 'ZONES');
assert(result.events.some(event=>event.type === 'MATCH_ENDED'));

state = testState({matchId:'PHASE2DRAW', player0:[], player1:[]});
state.maxTurns = 1;
result = reduceCommand(state, command(state, 'p0', 7, 'END_TURN'), {playerId:'p0'});
assert.equal(result.ok, true);
assert.equal(result.state.outcome.type, 'DRAW');
assert.equal(result.state.outcome.winner, null);
assert.equal(result.state.outcome.reason, 'EXACT_TIE');

console.log('authoritative-v3 Phase 2 gate smoke test passed');
