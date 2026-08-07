import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  cloneSerializable,
  legalCommandTemplates,
  reduceCommand
} from '../../shared/engine/index.mjs';
import {
  engineVisibleOutcomes,
  translateLegacyRecorderAction
} from '../../tools/authority-v3-legacy-normalization.mjs';
import {
  DIFFERENTIAL_CLASSIFICATIONS,
  runDifferentialCorpus
} from '../../tools/authority-v3-differential-replay.mjs';
import {testState} from './test-helpers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function engineCardToLegacy(card){
  return card ? {
    ...cloneSerializable(card),
    aff:card.affiliation,
    fate:card.baseFate
  } : null;
}

function engineStateToLegacy(state){
  return {
    players:state.players.map(player=>({
      id:player.id,
      name:player.name,
      deck:player.deck.map(engineCardToLegacy),
      hand:player.hand.map(engineCardToLegacy),
      discard:player.discard.map(engineCardToLegacy),
      limbo:player.limbo.map(engineCardToLegacy),
      score:player.score
    })),
    board:state.board.map(zone=>zone.map(row=>row.map(engineCardToLegacy))),
    currentPlayer:state.activePlayer,
    turn:state.turn,
    maxTurns:state.maxTurns,
    phase:state.phase,
    landscapeId:state.landscapeId,
    maxSupportsPerTurn:state.baseSupportersPerTurn,
    supportsPlacedThisTurn:state.supportersSetThisTurn[state.activePlayer],
    extraSupportsThisTurn:state.extraSupportersThisTurn[state.activePlayer],
    supportersSetTotal:cloneSerializable(state.supportersSetTotal),
    supporterEffectsActivated:cloneSerializable(state.supporterEffectsActivated),
    damageDoneP:cloneSerializable(state.fateReductionEffectUses),
    _wojciechTurnPlacementCounts:cloneSerializable(state.cardsPlacedThisTurn),
    _wojciechLastTurnPlacementCounts:cloneSerializable(state.cardsPlacedLastTurn),
    queuedExtraSupporters:cloneSerializable(state.queuedExtraSupporters),
    _serverRngCounter:state.rngState.counter,
    instanceCounter:state.instanceCounter
  };
}

function legacyEnvelope(state){
  return {format:'fates-legacy-canonical-state-v1', state:engineStateToLegacy(state)};
}

const preState = testState({matchId:'PHASE5DIFFERENTIAL', seed:'phase5-differential'});
const legalSet = legalCommandTemplates(preState, 0).find(template=>
  template.type === 'SET_CARD'
  && preState.players[0].hand.find(card=>
    card.iid === template.payload.cardIid && card.id === '32'
  )
);
assert(legalSet, 'fixture requires a universally legal Supporter set');
const engineCommand = {
  commandId:'phase5-differential-set',
  matchId:preState.matchId,
  expectedRevision:preState.revision,
  ...legalSet
};
const engineResult = reduceCommand(preState, engineCommand, {playerId:'p0', playerIndex:0});
assert.equal(engineResult.ok, true);

const action = {
  index:0,
  preState:legacyEnvelope(preState),
  playerId:'p0',
  playerIndex:0,
  command:{
    type:'LEGACY_SET_CARD',
    cardIid:legalSet.payload.cardIid,
    cardId:'32',
    source:'hand',
    destination:{
      zone:legalSet.payload.destination.z,
      row:legalSet.payload.destination.r,
      column:legalSet.payload.destination.c
    }
  },
  choices:[],
  rng:{
    seed:'phase5-differential',
    counterBefore:preState.rngState.counter,
    counterAfter:engineResult.state.rngState.counter,
    mathRandomSamples:[]
  },
  expectedPostState:legacyEnvelope(engineResult.state),
  visibleOutcomes:engineVisibleOutcomes(engineResult.state)
};
const corpus = {
  format:'fates-legacy-action-corpus-v2',
  engineVersion:preState.engineVersion,
  rulesetVersion:preState.rulesetVersion,
  seed:'phase5-differential',
  actions:[action]
};

const translated = translateLegacyRecorderAction(action, corpus);
assert.equal(translated.command.type, 'SET_CARD');
assert.deepEqual(translated.command.payload.destination, legalSet.payload.destination);
assert.equal(translated.actor.playerId, 'p0');

const report = runDifferentialCorpus(corpus, 'in-memory-legacy-recorder-corpus');
assert.equal(report.ok, true);
assert.equal(report.compared, 1);
assert.equal(report.matched, 1);
assert.equal(report.translationFailures.length, 0);
assert.equal(report.unexpectedMismatches.length, 0);

const classifiedCorpus = cloneSerializable(corpus);
classifiedCorpus.actions[0].visibleOutcomes.handCounts[0] += 1;
classifiedCorpus.actions[0].expectedMismatch = {
  classification:'intentional-rule-clarification',
  rationale:'fixture proves a declared mismatch is reported separately'
};
const classifiedReport = runDifferentialCorpus(classifiedCorpus, 'classified-fixture');
assert.equal(classifiedReport.ok, true);
assert.equal(classifiedReport.classifiedMismatches.length, 1);
assert.equal(classifiedReport.classifiedMismatches[0].classification, 'intentional-rule-clarification');

const unclassifiedCorpus = cloneSerializable(classifiedCorpus);
delete unclassifiedCorpus.actions[0].expectedMismatch;
const unclassifiedReport = runDifferentialCorpus(unclassifiedCorpus, 'unclassified-fixture');
assert.equal(unclassifiedReport.ok, false);
assert.equal(unclassifiedReport.unexpectedMismatches.length, 1);
assert.equal(unclassifiedReport.unexpectedMismatches[0].classification, 'unclassified');

assert.deepEqual([...DIFFERENTIAL_CLASSIFICATIONS].sort(), [
  'cosmetic-only-difference',
  'existing-single-player-defect',
  'intentional-rule-clarification',
  'new-engine-defect'
]);

const committedPath = path.join(root, 'docs', 'fixtures', 'AUTHORITY_V3_PHASE5_LEGACY_PARITY_CORPUS.json');
const committed = JSON.parse(fs.readFileSync(committedPath, 'utf8'));
const committedReport = runDifferentialCorpus(committed, committedPath);
assert.equal(committed.format, 'fates-legacy-action-corpus-v2');
assert(committed.actions.length >= 3, 'committed corpus must exercise multiple stable action boundaries');
assert.equal(committedReport.ok, true);
assert.equal(committedReport.matched, committed.actions.length);
assert.equal(committedReport.classifiedMismatches.length, 0);

console.log('authoritative v3 Phase 5 differential corpus smoke test passed');
