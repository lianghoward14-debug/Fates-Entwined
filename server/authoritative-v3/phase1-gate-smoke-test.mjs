import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  canonicalHash,
  collectInvariantViolations,
  createInitialState,
  createRngState,
  nextUint32,
  reduceCommand,
  replayCommands,
  stableStringify,
  validateCommand
} from '../../shared/engine/index.mjs';
import {command, testState} from './test-helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const engineRoot = path.resolve(here, '..', '..', 'shared', 'engine');

const rng = createRngState('phase1-known');
assert.equal(rng.value, 1714129569);
assert.deepStrictEqual(
  [nextUint32(rng), nextUint32(rng), nextUint32(rng), nextUint32(rng)],
  [4169892574, 2463158390, 2467616569, 932023232],
  'the pinned RNG sequence must not change without a ruleset version change'
);
assert.equal(rng.counter, 4);

const stateA = testState({matchId:'PHASE1', seed:'same-seed'});
const stateB = testState({matchId:'PHASE1', seed:'same-seed'});
assert.equal(canonicalHash(stateA), canonicalHash(stateB));
assert.equal(
  stableStringify({z:3, a:{right:2, left:1}}),
  stableStringify({a:{left:1, right:2}, z:3}),
  'canonical serialization must ignore object insertion order'
);

const allIids = [
  ...stateA.players.flatMap(player=>[...player.deck, ...player.hand, ...player.discard]),
  ...stateA.board.flat(2).filter(Boolean)
].map(card=>card.iid);
assert.equal(new Set(allIids).size, allIids.length, 'every initial card must receive a permanent unique iid');
assert(allIids.every(iid=>iid.startsWith('PHASE1:p')));

assert.throws(()=>createInitialState({
  matchId:'BADPLAYERS',
  cardDefinitions:[],
  players:[{id:'same', deckIds:[]}, {id:'same', deckIds:[]}]
}), /player IDs must be unique/);
assert.throws(()=>createInitialState({
  matchId:'BADFATE',
  cardDefinitions:[{id:'x', fate:1.5, cost:0}],
  players:[{id:'p0', deckIds:['x']}, {id:'p1', deckIds:[]}]
}), /Fate must be an integer/);
assert.throws(()=>createInitialState({
  matchId:'BADTURNS',
  maxTurns:2.5,
  cardDefinitions:[],
  players:[{id:'p0', deckIds:[]}, {id:'p1', deckIds:[]}]
}), /maxTurns must be a positive integer/);

const malformed = structuredClone(stateA);
malformed.board[0][0].push(null);
malformed.rngState.value = -1;
const malformedViolations = collectInvariantViolations(malformed);
assert(malformedViolations.some(item=>item.path === 'board.0.0'));
assert(malformedViolations.some(item=>item.path === 'rngState.value'));
assert.doesNotThrow(()=>collectInvariantViolations({...stateA, players:'invalid'}), 'invariant collection itself must be total');

const unknownPayload = validateCommand({
  commandId:'p0:unknown',
  matchId:stateA.matchId,
  expectedRevision:0,
  type:'END_TURN',
  payload:{surprise:true}
});
assert.equal(unknownPayload.ok, false);
assert.equal(unknownPayload.rejection.code, 'INVALID_PAYLOAD');
const invalidCoordinate = validateCommand({
  commandId:'p0:coordinate',
  matchId:stateA.matchId,
  expectedRevision:0,
  type:'SET_CARD',
  payload:{cardIid:'card', destination:{z:0, r:2, c:1.5}}
});
assert.equal(invalidCoordinate.ok, false);
assert.equal(invalidCoordinate.rejection.code, 'INVALID_PAYLOAD');
const oversized = validateCommand({
  commandId:'p0:oversized',
  matchId:stateA.matchId,
  expectedRevision:0,
  type:'ANSWER_PROMPT',
  payload:{promptId:'prompt', selectedIid:'x'.repeat(70000)}
});
assert.equal(oversized.ok, false);
assert.equal(oversized.rejection.code, 'COMMAND_TOO_LARGE');

const replayInitial = testState({
  matchId:'PHASE1REPLAY',
  seed:'phase1-replay',
  player0:['32'],
  player1:['32']
});
const resident = replayInitial.players[0].hand[0];
const firstCommand = command(
  replayInitial,
  'p0',
  1,
  'SET_CARD',
  {cardIid:resident.iid, destination:{z:0, r:2, c:0}}
);
const firstResult = reduceCommand(replayInitial, firstCommand, {playerId:'p0'});
assert.equal(firstResult.ok, true);
assert.equal(firstResult.revision, 1);
const secondCommand = command(firstResult.state, 'p0', 2, 'END_TURN');
const secondResult = reduceCommand(firstResult.state, secondCommand, {playerId:'p0'});
assert.equal(secondResult.ok, true);
assert.equal(secondResult.revision, 2);
const replay = replayCommands(replayInitial, [
  {command:firstCommand, playerId:'p0', stateHash:firstResult.stateHash},
  {command:secondCommand, playerId:'p0', stateHash:secondResult.stateHash}
]);
assert.equal(replay.ok, true);
assert.deepStrictEqual(replay.hashes, [
  canonicalHash(replayInitial),
  firstResult.stateHash,
  secondResult.stateHash
]);

const beforeStaleHash = canonicalHash(firstResult.state);
const stale = reduceCommand(firstResult.state, firstCommand, {playerId:'p0'});
assert.equal(stale.ok, false);
assert.equal(stale.rejection.code, 'STALE_REVISION');
assert.equal(canonicalHash(firstResult.state), beforeStaleHash, 'rejected commands must not mutate current state');

const engineSources = fs.readdirSync(engineRoot, {recursive:true})
  .filter(name=>String(name).endsWith('.mjs'))
  .map(name=>fs.readFileSync(path.join(engineRoot, name), 'utf8'))
  .join('\n');
assert.doesNotMatch(engineSources, /\bMath\.random\s*\(/, 'rules must never use ambient randomness');
assert.doesNotMatch(engineSources, /\bsetTimeout\s*\(/, 'rules must never store browser-timer behavior');

console.log('authoritative-v3 Phase 1 gate smoke test passed');
