import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {
  ENGINE_VERSION,
  RULESET_VERSION
} from '../../shared/engine/index.mjs';
import {
  legacyRecorderStateToEngine
} from '../../tools/authority-v3-legacy-normalization.mjs';
import {
  PHASE6_SHADOW_FORMAT,
  Phase6ShadowComparator
} from './phase6-shadow-core.mjs';
import {
  applyShadowEvidenceRequirements,
  parseShadowReport,
  readAcceptedEventLog,
  readEvidenceSnapshot,
  reconcileAcceptedEvents,
  reviewShadowIssues,
  sha256File,
  summarizeShadowRecords
} from '../../tools/authority-v3-shadow-report.mjs';
import {
  buildShadowSourceIdentity
} from '../../tools/authority-v3-shadow-build-id.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const corpus = JSON.parse(fs.readFileSync(
  path.join(root, 'docs', 'fixtures', 'AUTHORITY_V3_PHASE5_REAL_LEGACY_SELF_PLAY_CORPUS.json'),
  'utf8'
));
const statusCounts = {};
const observedComparisons = [];
const observedAcceptedRecords = [];
const phase6BuildId = buildShadowSourceIdentity(root).buildId;

function acceptedRecordFor(action, code, actor){
  const payload = {
    playerIndex:action.playerIndex,
    postState:action.expectedPostState.state,
    stateHash:action.expectedPostStateHash || `legacy-hash-${action.index}`
  };
  if(action.command.type === 'LEGACY_SET_CARD'){
    payload.actionKind = 'PLACE_CARD';
    payload.selectedHand = {iid:action.command.cardIid, id:action.command.cardId};
    Object.assign(payload, {
      z:action.command.destination.zone,
      r:action.command.destination.row,
      c:action.command.destination.column
    });
  }else if(action.command.type === 'LEGACY_CONSOLIDATE_CARD'){
    payload.actionKind = 'SELECT_CONSOLIDATION_TRIBUTE';
    payload.selectedHand = {iid:action.command.cardIid, id:action.command.cardId};
    payload.tributeIids = action.command.tributeIids;
    Object.assign(payload, {
      z:action.command.destination.zone,
      r:action.command.destination.row,
      c:action.command.destination.column
    });
  }else{
    payload.actionKind = 'END_TURN';
  }
  return {
    schemaVersion:1,
    code,
    accepted:{
      roomCode:code,
      serverStateHash:payload.stateHash,
      action:{
        seq:2,
        uid:actor,
        type:'ACTION_RESULT',
        clientActionId:`legacy-${action.index}`,
        payload
      }
    }
  };
}

for(const action of corpus.actions){
  const comparator = new Phase6ShadowComparator({buildId:phase6BuildId});
  const code = `S${String(action.index).padStart(5, '0')}`;
  const actor = String(action.playerId || `player-${action.playerIndex}`);
  const other = `other-${action.index}`;
  const order = action.playerIndex === 0 ? [actor, other] : [other, actor];
  const baseline = comparator.processRecord({
    schemaVersion:1,
    code,
    accepted:{
      roomCode:code,
      action:{
        seq:1,
        uid:order[0],
        type:'MATCH_START',
        payload:{
          hostUid:order[0],
          guestUid:order[1],
          seed:corpus.seed,
          stateHash:`baseline-${action.index}`,
          postState:action.preState.state
        }
      }
    }
  });
  assert.equal(baseline.status, 'baseline');
  const acceptedRecord = acceptedRecordFor(action, code, actor);
  observedAcceptedRecords.push(acceptedRecord);
  const result = comparator.processRecord(acceptedRecord);
  observedComparisons.push(result);
  statusCounts[result.status] = (statusCounts[result.status] || 0) + 1;
  assert.equal(result.format, PHASE6_SHADOW_FORMAT);
  assert.equal(result.legacyHash, action.expectedPostStateHash || `legacy-hash-${action.index}`);
  assert.equal(result.engineVersion, ENGINE_VERSION);
  assert.equal(result.rulesetVersion, RULESET_VERSION);
  assert(result.command.inferred, `action ${action.index} must record the inferred command`);
  if(result.status === 'mismatch'){
    assert(result.engineHash, 'mismatches must record the engine hash');
    assert(result.firstDifferingStatePath, 'mismatches must record the first differing path');
  }
}

assert.deepEqual(statusCounts, {match:178, mismatch:2});
const reviewedIssueLedger = JSON.parse(fs.readFileSync(
  path.join(root, 'docs', 'fixtures', 'AUTHORITY_V3_PHASE6_REVIEWED_SHADOW_ISSUES.json'),
  'utf8'
));
const corpusSummary = summarizeShadowRecords(observedComparisons, 'phase6-real-corpus-shadow');
const corpusReview = reviewShadowIssues(observedComparisons, reviewedIssueLedger);
assert.equal(corpusSummary.matches, 178);
assert.equal(corpusSummary.openComparisonIssues, 2);
assert.equal(corpusReview.reviewedCount, 2);
assert.equal(corpusReview.unreviewedCount, 0);
assert.equal(corpusReview.ok, true);

function emptyLegacyBoard(){
  return Array.from({length:3}, ()=>Array.from({length:3}, ()=>Array(3).fill(null)));
}

function legacyReactionCard(id, iid, owner, type, fate, cost){
  return {
    id,
    iid,
    owner,
    controller:owner,
    name:id,
    type,
    aff:'expanded_worlds',
    fate,
    currentFate:fate,
    cost,
    usesLeft:id === '56' ? 3 : null
  };
}

const reactionBoard = emptyLegacyBoard();
const reactionLydia = legacyReactionCard('56', 'shadow-lydia', 0, 'Improvisor', 7, 2);
const reactionKazumi = legacyReactionCard('27', 'shadow-kazumi', 1, 'Initiator', 1, 1);
reactionBoard[0][2][0] = reactionLydia;
reactionBoard[1][0][0] = reactionKazumi;
const reactionLegacyBase = {
  seed:'phase6-stateful-reaction',
  turn:1,
  maxTurns:20,
  phase:'main',
  currentPlayer:1,
  maxSupportsPerTurn:2,
  supportsPlacedThisTurn:0,
  supportersSetTotal:[0, 0],
  supporterEffectsActivated:[0, 0],
  damageDoneP:[0, 0],
  queuedExtraSupporters:[0, 0],
  landscapeId:'igb1',
  instanceCounter:2,
  players:[
    {name:'reaction-p0', deck:[], hand:[], discard:[], limbo:[], score:0},
    {name:'reaction-p1', deck:[], hand:[], discard:[], limbo:[], score:0}
  ],
  board:reactionBoard,
  blockedCells:[],
  extraCells:[[], [], []]
};
const statefulComparator = new Phase6ShadowComparator();
const statefulCode = 'REACT1';
assert.equal(statefulComparator.processRecord({
  code:statefulCode,
  accepted:{action:{
    seq:1,
    uid:'reaction-p1',
    type:'MATCH_START',
    payload:{
      hostUid:'reaction-p0',
      guestUid:'reaction-p1',
      seed:reactionLegacyBase.seed,
      stateHash:'reaction-baseline',
      postState:structuredClone(reactionLegacyBase)
    }
  }}
}).status, 'baseline');
const reactionArmedState = structuredClone(reactionLegacyBase);
reactionArmedState._serverPendingReaction = {
  kind:'reaction',
  playerIndex:0,
  promptId:'legacy-reaction-prompt',
  options:[{
    kind:'lydia',
    z:0,
    r:2,
    c:0,
    card:structuredClone(reactionLydia)
  }]
};
const armedComparison = statefulComparator.processRecord({
  code:statefulCode,
  accepted:{action:{
    seq:2,
    uid:'reaction-p1',
    type:'ACTION_RESULT',
    payload:{
      playerIndex:1,
      actionKind:'BOARD_ACTION',
      source:{z:1, r:0, c:0, card:structuredClone(reactionKazumi)},
      stateHash:'reaction-armed',
      postState:reactionArmedState
    }
  }}
});
assert.equal(armedComparison.status, 'match');
const resolvedComparison = statefulComparator.processRecord({
  code:statefulCode,
  accepted:{action:{
    seq:3,
    uid:'reaction-p0',
    type:'REACTION_CHOICE',
    payload:{
      playerIndex:0,
      promptId:'legacy-reaction-prompt',
      choice:'negate',
      optionIndex:0,
      stateHash:'reaction-resolved',
      postState:structuredClone(reactionLegacyBase)
    }
  }}
});
assert.equal(resolvedComparison.status, 'match');
assert.equal(
  resolvedComparison.command.translationMethod,
  'stateful-v3-reaction-prompt'
);
for(const [choice, code] of [['decline', 'REACT2'], ['suppress', 'REACT3']]){
  const comparator = new Phase6ShadowComparator();
  comparator.processRecord({
    code,
    accepted:{action:{
      seq:1,
      uid:'reaction-p1',
      type:'MATCH_START',
      payload:{
        hostUid:'reaction-p0',
        guestUid:'reaction-p1',
        seed:reactionLegacyBase.seed,
        stateHash:`${code}-baseline`,
        postState:structuredClone(reactionLegacyBase)
      }
    }}
  });
  assert.equal(comparator.processRecord({
    code,
    accepted:{action:{
      seq:2,
      uid:'reaction-p1',
      type:'ACTION_RESULT',
      payload:{
        playerIndex:1,
        actionKind:'BOARD_ACTION',
        source:{z:1, r:0, c:0, card:structuredClone(reactionKazumi)},
        stateHash:`${code}-armed`,
        postState:structuredClone(reactionArmedState)
      }
    }}
  }).status, 'match');
  const resolved = comparator.processRecord({
    code,
    accepted:{action:{
      seq:3,
      uid:'reaction-p0',
      type:'REACTION_CHOICE',
      payload:{
        playerIndex:0,
        promptId:'legacy-reaction-prompt',
        choice,
        optionIndex:0,
        stateHash:`${code}-resolved`,
        postState:structuredClone(reactionLegacyBase)
      }
    }}
  });
  assert.equal(resolved.status, 'match');
  assert.equal(resolved.command.translationMethod, 'stateful-v3-reaction-prompt');
}

function legacyHandCard(index){
  return {
    id:String(index + 1),
    iid:`limit-card-${index}`,
    owner:0,
    controller:0,
    name:`Limit card ${index}`,
    type:'Supporter',
    aff:'expanded_worlds',
    fate:index + 1,
    currentFate:index + 1,
    cost:1
  };
}

function handLimitLegacyState(){
  return {
    seed:'phase6-stateful-hand-limit',
    turn:1,
    maxTurns:20,
    phase:'main',
    currentPlayer:0,
    baseHandLimit:6,
    maxSupportsPerTurn:2,
    supportsPlacedThisTurn:0,
    supportersSetTotal:[0, 0],
    supporterEffectsActivated:[0, 0],
    damageDoneP:[0, 0],
    queuedExtraSupporters:[0, 0],
    landscapeId:'igb1',
    instanceCounter:7,
    players:[
      {
        name:'limit-p0',
        deck:[],
        hand:Array.from({length:7}, (_, index)=>legacyHandCard(index)),
        discard:[],
        limbo:[],
        score:0
      },
      {name:'limit-p1', deck:[], hand:[], discard:[], limbo:[], score:0}
    ],
    board:emptyLegacyBoard(),
    blockedCells:[],
    extraCells:[[], [], []]
  };
}

function armHandLimitShadow(comparator, code){
  const legacyState = handLimitLegacyState();
  assert.equal(comparator.processRecord({
    code,
    accepted:{action:{
      seq:1,
      uid:'limit-p0',
      type:'MATCH_START',
      payload:{
        hostUid:'limit-p0',
        guestUid:'limit-p1',
        seed:legacyState.seed,
        stateHash:`${code}-baseline`,
        postState:structuredClone(legacyState)
      }
    }}
  }).status, 'baseline');
  const shadowState = legacyRecorderStateToEngine({
    format:'fates-legacy-canonical-state-v1',
    state:legacyState
  }, {
    index:1,
    playerId:'limit-p0',
    playerIndex:0,
    seed:legacyState.seed
  });
  shadowState.pendingHandLimit = {playerIndex:0, limit:6, required:1};
  comparator.rooms.get(code).shadowState = shadowState;
  return legacyState;
}

function handLimitPostState(preState, discardedIid = 'limit-card-0'){
  const postState = structuredClone(preState);
  const cardIndex = postState.players[0].hand
    .findIndex(card=>String(card.iid) === discardedIid);
  const [discarded] = postState.players[0].hand.splice(cardIndex, 1);
  postState.players[0].discard.push(discarded);
  return postState;
}

const handLimitComparator = new Phase6ShadowComparator();
const handLimitPreState = armHandLimitShadow(handLimitComparator, 'LIMIT1');
const handLimitMatch = handLimitComparator.processRecord({
  code:'LIMIT1',
  accepted:{action:{
    seq:2,
    uid:'limit-p0',
    type:'HAND_LIMIT_DISCARD',
    payload:{
      playerIndex:0,
      discardedIids:['limit-card-0'],
      stateHash:'LIMIT1-resolved',
      postState:handLimitPostState(handLimitPreState)
    }
  }}
});
assert.equal(handLimitMatch.status, 'match');
assert.equal(handLimitMatch.command.translationMethod, 'stateful-v3-hand-limit');
assert.equal(handLimitComparator.rooms.get('LIMIT1').shadowState.pendingHandLimit, null);

const unauthorizedHandLimitComparator = new Phase6ShadowComparator();
const unauthorizedPreState = armHandLimitShadow(unauthorizedHandLimitComparator, 'LIMIT2');
const unauthorizedHandLimit = unauthorizedHandLimitComparator.processRecord({
  code:'LIMIT2',
  accepted:{action:{
    seq:2,
    uid:'limit-p1',
    type:'HAND_LIMIT_DISCARD',
    payload:{
      playerIndex:1,
      discardedIids:['limit-card-0'],
      stateHash:'LIMIT2-unauthorized',
      postState:handLimitPostState(unauthorizedPreState)
    }
  }}
});
assert.equal(unauthorizedHandLimit.status, 'engine-rejection');
assert.equal(unauthorizedHandLimit.command.translationMethod, undefined);
assert.equal(unauthorizedHandLimitComparator.rooms.get('LIMIT2').shadowState, null);

const staleHandLimitComparator = new Phase6ShadowComparator();
const stalePreState = armHandLimitShadow(staleHandLimitComparator, 'LIMIT3');
assert.equal(staleHandLimitComparator.processRecord({
  code:'LIMIT3',
  accepted:{action:{
    seq:2,
    uid:'limit-p0',
    type:'STATE_SYNC',
    payload:{
      playerIndex:0,
      stateHash:'LIMIT3-sync',
      postState:structuredClone(stalePreState)
    }
  }}
}).status, 'not-compared');
const staleHandLimit = staleHandLimitComparator.processRecord({
  code:'LIMIT3',
  accepted:{action:{
    seq:3,
    uid:'limit-p0',
    type:'HAND_LIMIT_DISCARD',
    payload:{
      playerIndex:0,
      discardedIids:['limit-card-0'],
      stateHash:'LIMIT3-stale',
      postState:handLimitPostState(stalePreState)
    }
  }}
});
assert.equal(staleHandLimit.status, 'engine-rejection');
assert.equal(staleHandLimit.command.translationMethod, undefined);
assert.equal(staleHandLimitComparator.rooms.get('LIMIT3').shadowState, null);

const duplicateComparator = new Phase6ShadowComparator();
const sample = corpus.actions[0];
const sampleCode = 'DUP001';
const sampleActor = String(sample.playerId);
const sampleOther = 'other-duplicate';
const sampleOrder = sample.playerIndex === 0
  ? [sampleActor, sampleOther]
  : [sampleOther, sampleActor];
duplicateComparator.processRecord({
  code:sampleCode,
  accepted:{action:{seq:1, type:'MATCH_START', payload:{
    hostUid:sampleOrder[0],
    guestUid:sampleOrder[1],
    postState:sample.preState.state
  }}}
});
const acceptedSample = acceptedRecordFor(sample, sampleCode, sampleActor);
assert.equal(duplicateComparator.processRecord(acceptedSample).status, 'match');
assert.equal(duplicateComparator.processRecord(acceptedSample).status, 'duplicate');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fate-v3-shadow-'));
const input = path.join(tempDir, 'events.jsonl');
const output = path.join(tempDir, 'shadow.jsonl');
const reviewInput = path.join(tempDir, 'review-input.jsonl');
const acceptedInput = path.join(tempDir, 'accepted-input.jsonl');
const reportToolPath = path.join(root, 'tools', 'authority-v3-shadow-report.mjs');
const reviewedLedgerPath = path.join(
  root,
  'docs',
  'fixtures',
  'AUTHORITY_V3_PHASE6_REVIEWED_SHADOW_ISSUES.json'
);
const shadowDeploymentExample = fs.readFileSync(
  path.join(root, 'fly.authority-v3-shadow.toml.example'),
  'utf8'
);
const deploymentConfig = path.join(tempDir, 'fly.phase6-shadow-soak.toml');
fs.writeFileSync(
  deploymentConfig,
  shadowDeploymentExample
    .replace('replace-with-separate-shadow-app', 'fates-entwined-phase6-shadow-audit')
    .replace('replace-with-separate-shadow-volume', 'fate_phase6_shadow_audit_data')
    .replace('replace-with-shadow-build-id', phase6BuildId)
);
fs.writeFileSync(
  reviewInput,
  observedComparisons.map(record=>JSON.stringify(record)).join('\n') + '\n'
);
fs.writeFileSync(
  acceptedInput,
  observedAcceptedRecords.map(record=>JSON.stringify(record)).join('\n') + '\n'
);
const snapshotRaceInput = path.join(tempDir, 'snapshot-race.jsonl');
fs.copyFileSync(reviewInput, snapshotRaceInput);
const immutableSnapshot = readEvidenceSnapshot(snapshotRaceInput);
assert.equal(parseShadowReport(immutableSnapshot.bytes.toString('utf8')).length, 180);
fs.appendFileSync(snapshotRaceInput, JSON.stringify(observedComparisons[0]) + '\n');
assert.equal(parseShadowReport(immutableSnapshot.bytes.toString('utf8')).length, 180);
assert(immutableSnapshot.sizeBytes < fs.statSync(snapshotRaceInput).size);
assert.notEqual(immutableSnapshot.sha256, sha256File(snapshotRaceInput));

const auditOutput = path.join(tempDir, 'phase6-audit.json');
const reviewedCliArgs = [
  reportToolPath,
  reviewInput,
  '--review-ledger',
  reviewedLedgerPath,
  '--min-unique-records',
  '180',
  '--min-matches',
  '178',
  '--min-rooms',
  '180',
  '--require-engine-version',
  ENGINE_VERSION,
  '--require-ruleset-version',
  RULESET_VERSION,
  '--require-build-id',
  phase6BuildId,
  '--accepted-log',
  acceptedInput,
  '--deployment-config',
  deploymentConfig,
  '--write-audit',
  auditOutput,
  '--fail-on-open'
];
const reviewedCli = spawnSync(
  process.execPath,
  reviewedCliArgs,
  {cwd:root, encoding:'utf8'}
);
assert.equal(reviewedCli.status, 0, reviewedCli.stderr || reviewedCli.stdout);
const reviewedCliSummary = JSON.parse(reviewedCli.stdout);
assert.equal(reviewedCliSummary.review.reviewedCount, 2);
assert.equal(reviewedCliSummary.review.unreviewedCount, 0);
assert.deepEqual(reviewedCliSummary.evidenceFailures, []);
assert.equal(reviewedCliSummary.roomCount, 180);
assert.equal(reviewedCliSummary.missingEngineVersions, 0);
assert.equal(reviewedCliSummary.missingRulesetVersions, 0);
assert.equal(reviewedCliSummary.missingBuildIds, 0);
assert.deepEqual(reviewedCliSummary.buildIds, [phase6BuildId]);
assert.equal(reviewedCliSummary.reconciliation.ok, true);
assert.equal(reviewedCliSummary.reconciliation.acceptedActionRecords, 180);
assert.match(reviewedCliSummary.evidenceFiles.shadowReport.sha256, /^[a-f0-9]{64}$/);
assert.match(reviewedCliSummary.evidenceFiles.reviewLedger.sha256, /^[a-f0-9]{64}$/);
assert.match(reviewedCliSummary.evidenceFiles.acceptedLog.sha256, /^[a-f0-9]{64}$/);
assert.match(reviewedCliSummary.evidenceFiles.deploymentConfig.sha256, /^[a-f0-9]{64}$/);
assert.equal(reviewedCliSummary.deploymentValidation.ok, true);
assert.equal(reviewedCliSummary.deploymentBuildIdAgreement.ok, true);
assert.equal(
  reviewedCliSummary.deploymentValidation.app,
  'fates-entwined-phase6-shadow-audit'
);
assert.equal(
  reviewedCliSummary.evidenceFiles.shadowReport.sizeBytes,
  fs.statSync(reviewInput).size
);
assert.equal(
  reviewedCliSummary.evidenceFiles.reviewLedger.sizeBytes,
  fs.statSync(reviewedLedgerPath).size
);
assert.equal(
  reviewedCliSummary.evidenceFiles.acceptedLog.sizeBytes,
  fs.statSync(acceptedInput).size
);
assert.equal(
  reviewedCliSummary.evidenceFiles.deploymentConfig.sizeBytes,
  fs.statSync(deploymentConfig).size
);
assert.match(reviewedCliSummary.auditDigest, /^[a-f0-9]{64}$/);
assert.deepEqual(JSON.parse(fs.readFileSync(auditOutput, 'utf8')), reviewedCliSummary);
const originalAuditBytes = fs.readFileSync(auditOutput);
const overwriteAuditCli = spawnSync(
  process.execPath,
  reviewedCliArgs,
  {cwd:root, encoding:'utf8'}
);
assert.notEqual(overwriteAuditCli.status, 0);
assert.match(overwriteAuditCli.stderr, /EEXIST|file already exists/i);
assert.deepEqual(fs.readFileSync(auditOutput), originalAuditBytes);
const evidenceCollisionCli = spawnSync(process.execPath, [
  reportToolPath,
  reviewInput,
  '--deployment-config',
  deploymentConfig,
  '--write-audit',
  deploymentConfig
], {cwd:root, encoding:'utf8'});
assert.notEqual(evidenceCollisionCli.status, 0);
assert.match(evidenceCollisionCli.stderr, /different from every evidence input/);

const invalidDeploymentConfig = path.join(tempDir, 'fly.phase6-invalid.toml');
fs.writeFileSync(
  invalidDeploymentConfig,
  shadowDeploymentExample
    .replace('replace-with-separate-shadow-app', 'fates-entwined-main')
    .replace('replace-with-separate-shadow-volume', 'fate_authority_data')
    .replace('replace-with-shadow-build-id', phase6BuildId)
);
const invalidDeploymentCli = spawnSync(process.execPath, [
  reportToolPath,
  reviewInput,
  '--review-ledger',
  reviewedLedgerPath,
  '--deployment-config',
  invalidDeploymentConfig,
  '--fail-on-open'
], {cwd:root, encoding:'utf8'});
assert.notEqual(invalidDeploymentCli.status, 0);
const invalidDeploymentSummary = JSON.parse(invalidDeploymentCli.stdout);
assert.equal(invalidDeploymentSummary.deploymentValidation.ok, false);
assert(
  invalidDeploymentSummary.deploymentValidation.errors
    .some(error=>/separate from the default legacy app/.test(error))
);
assert(
  invalidDeploymentSummary.deploymentValidation.errors
    .some(error=>/separate from the default legacy volume/.test(error))
);
const mutatedDeploymentConfig = path.join(tempDir, 'fly.phase6-shadow-soak-mutated.toml');
fs.writeFileSync(
  mutatedDeploymentConfig,
  fs.readFileSync(deploymentConfig, 'utf8') + '\n# evidence mutation\n'
);
const mutatedDeploymentCli = spawnSync(process.execPath, [
  reportToolPath,
  reviewInput,
  '--review-ledger',
  reviewedLedgerPath,
  '--deployment-config',
  mutatedDeploymentConfig,
  '--fail-on-open'
], {cwd:root, encoding:'utf8'});
assert.equal(mutatedDeploymentCli.status, 0, mutatedDeploymentCli.stderr);
const mutatedDeploymentSummary = JSON.parse(mutatedDeploymentCli.stdout);
assert.equal(mutatedDeploymentSummary.deploymentValidation.ok, true);
assert.notEqual(
  mutatedDeploymentSummary.evidenceFiles.deploymentConfig.sha256,
  reviewedCliSummary.evidenceFiles.deploymentConfig.sha256
);
assert.notEqual(mutatedDeploymentSummary.auditDigest, reviewedCliSummary.auditDigest);

const mismatchedBuildConfig = path.join(tempDir, 'fly.phase6-shadow-build-mismatch.toml');
fs.writeFileSync(
  mismatchedBuildConfig,
  fs.readFileSync(deploymentConfig, 'utf8').replace(
    phase6BuildId,
    'different-phase6-shadow-build'
  )
);
const mismatchedBuildCli = spawnSync(process.execPath, [
  reportToolPath,
  reviewInput,
  '--review-ledger',
  reviewedLedgerPath,
  '--deployment-config',
  mismatchedBuildConfig,
  '--fail-on-open'
], {cwd:root, encoding:'utf8'});
assert.notEqual(mismatchedBuildCli.status, 0);
const mismatchedBuildSummary = JSON.parse(mismatchedBuildCli.stdout);
assert.equal(mismatchedBuildSummary.deploymentValidation.ok, false);
assert.equal(mismatchedBuildSummary.deploymentBuildIdAgreement.ok, false);
assert.equal(
  mismatchedBuildSummary.deploymentBuildIdAgreement.configBuildId,
  'different-phase6-shadow-build'
);

const insufficientEvidenceCli = spawnSync(process.execPath, [
  reportToolPath,
  reviewInput,
  '--review-ledger',
  reviewedLedgerPath,
  '--min-unique-records',
  '181',
  '--min-matches',
  '179',
  '--min-rooms',
  '181',
  '--fail-on-open'
], {cwd:root, encoding:'utf8'});
assert.notEqual(insufficientEvidenceCli.status, 0);
const insufficientEvidenceSummary = JSON.parse(insufficientEvidenceCli.stdout);
assert.equal(insufficientEvidenceSummary.evidenceFailures.length, 3);

const mixedVersionRecords = structuredClone(observedComparisons);
mixedVersionRecords[0].engineVersion = 'unexpected-engine-version';
mixedVersionRecords[1].rulesetVersion = 'unexpected-ruleset-version';
const mixedVersionSummary = summarizeShadowRecords(mixedVersionRecords, 'mixed-version-test');
applyShadowEvidenceRequirements(mixedVersionSummary, {
  engineVersion:ENGINE_VERSION,
  rulesetVersion:RULESET_VERSION
});
assert.equal(mixedVersionSummary.evidenceFailures.length, 2);
assert.deepEqual(
  mixedVersionSummary.engineVersions,
  [ENGINE_VERSION, 'unexpected-engine-version'].sort()
);
const mixedVersionReportPath = path.join(tempDir, 'review-mixed-version.jsonl');
fs.writeFileSync(
  mixedVersionReportPath,
  mixedVersionRecords.map(record=>JSON.stringify(record)).join('\n') + '\n'
);
const mixedVersionCli = spawnSync(process.execPath, [
  reportToolPath,
  mixedVersionReportPath,
  '--review-ledger',
  reviewedLedgerPath,
  '--require-engine-version',
  ENGINE_VERSION,
  '--require-ruleset-version',
  RULESET_VERSION,
  '--fail-on-open'
], {cwd:root, encoding:'utf8'});
assert.notEqual(mixedVersionCli.status, 0);
const mixedVersionCliSummary = JSON.parse(mixedVersionCli.stdout);
assert.equal(mixedVersionCliSummary.evidenceFailures.length, 2);
assert.notEqual(
  mixedVersionCliSummary.evidenceFiles.shadowReport.sha256,
  reviewedCliSummary.evidenceFiles.shadowReport.sha256
);
assert.notEqual(mixedVersionCliSummary.auditDigest, reviewedCliSummary.auditDigest);

const missingVersionRecords = structuredClone(observedComparisons);
delete missingVersionRecords[0].engineVersion;
delete missingVersionRecords[0].rulesetVersion;
const missingVersionSummary = summarizeShadowRecords(missingVersionRecords, 'missing-version-test');
applyShadowEvidenceRequirements(missingVersionSummary, {
  engineVersion:ENGINE_VERSION,
  rulesetVersion:RULESET_VERSION
});
assert.equal(missingVersionSummary.missingEngineVersions, 1);
assert.equal(missingVersionSummary.missingRulesetVersions, 1);
assert.equal(missingVersionSummary.evidenceFailures.length, 2);

const mixedBuildRecords = structuredClone(observedComparisons);
mixedBuildRecords[0].buildId = 'different-phase6-shadow-build';
const mixedBuildSummary = summarizeShadowRecords(mixedBuildRecords, 'mixed-build-test');
applyShadowEvidenceRequirements(mixedBuildSummary, {buildId:phase6BuildId});
assert.equal(mixedBuildSummary.evidenceFailures.length, 1);
assert.deepEqual(
  mixedBuildSummary.buildIds,
  ['different-phase6-shadow-build', phase6BuildId].sort()
);

const missingBuildRecords = structuredClone(observedComparisons);
delete missingBuildRecords[0].buildId;
const missingBuildSummary = summarizeShadowRecords(missingBuildRecords, 'missing-build-test');
applyShadowEvidenceRequirements(missingBuildSummary, {buildId:phase6BuildId});
assert.equal(missingBuildSummary.missingBuildIds, 1);
assert.equal(missingBuildSummary.evidenceFailures.length, 1);

const acceptedLog = readAcceptedEventLog(acceptedInput);
assert.deepEqual(acceptedLog.invalidLines, []);
assert.equal(
  reconcileAcceptedEvents(observedComparisons.slice(1), acceptedLog.records).missingComparisons.length,
  1
);
const incompleteReportPath = path.join(tempDir, 'review-incomplete.jsonl');
fs.writeFileSync(
  incompleteReportPath,
  observedComparisons.slice(1).map(record=>JSON.stringify(record)).join('\n') + '\n'
);
const incompleteReportCli = spawnSync(process.execPath, [
  reportToolPath,
  incompleteReportPath,
  '--review-ledger',
  reviewedLedgerPath,
  '--accepted-log',
  acceptedInput,
  '--fail-on-open'
], {cwd:root, encoding:'utf8'});
assert.notEqual(incompleteReportCli.status, 0);
assert.equal(JSON.parse(incompleteReportCli.stdout).reconciliation.missingComparisons.length, 1);
const unexpectedComparison = structuredClone(observedComparisons[0]);
unexpectedComparison.roomCode = 'UNEXPECTED';
unexpectedComparison.sequence = 777;
assert.equal(
  reconcileAcceptedEvents(
    [...observedComparisons, unexpectedComparison],
    acceptedLog.records
  ).unexpectedComparisons.length,
  1
);
const hashMismatchComparisons = structuredClone(observedComparisons);
hashMismatchComparisons[0].legacyHash = 'wrong-legacy-hash';
assert.equal(
  reconcileAcceptedEvents(hashMismatchComparisons, acceptedLog.records).hashMismatches.length,
  1
);
const malformedAcceptedPath = path.join(tempDir, 'accepted-malformed.jsonl');
fs.writeFileSync(
  malformedAcceptedPath,
  fs.readFileSync(acceptedInput, 'utf8') + '{malformed-json\n'
);
const malformedAcceptedLog = readAcceptedEventLog(malformedAcceptedPath);
assert.equal(malformedAcceptedLog.invalidLines.length, 1);
assert.equal(
  reconcileAcceptedEvents(observedComparisons, malformedAcceptedLog.records, {
    invalidAcceptedLines:malformedAcceptedLog.invalidLines
  }).ok,
  false
);

fs.appendFileSync(reviewInput, JSON.stringify({
  status:'mismatch',
  roomCode:'UNKNOWN',
  sequence:999,
  legacyHash:'unknown',
  command:{
    effectiveType:'PLACE_CARD',
    inferred:{type:'LEGACY_SET_CARD', cardId:'not-reviewed'}
  },
  firstDifferingStatePath:'board[0]'
}) + '\n');
const unreviewedCli = spawnSync(process.execPath, [
  reportToolPath,
  reviewInput,
  '--review-ledger',
  reviewedLedgerPath,
  '--fail-on-open'
], {cwd:root, encoding:'utf8'});
assert.notEqual(unreviewedCli.status, 0);
const unreviewedCliSummary = JSON.parse(unreviewedCli.stdout);
assert.equal(unreviewedCliSummary.review.unreviewedCount, 1);

fs.writeFileSync(input, [
  JSON.stringify({
    code:sampleCode,
    accepted:{action:{seq:1, type:'MATCH_START', payload:{
      hostUid:sampleOrder[0],
      guestUid:sampleOrder[1],
      postState:sample.preState.state,
      stateHash:'baseline'
    }}}
  }),
  JSON.stringify(acceptedSample)
].join('\n') + '\n');

const workerPath = path.join(root, 'server', 'authoritative-v3', 'phase6-shadow-worker.mjs');
const disabled = spawnSync(process.execPath, [workerPath, '--once'], {
  cwd:root,
  encoding:'utf8',
  env:{
    ...process.env,
    FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED:'0',
    FATE_SERVER_AUTHORITATIVE_V3_SHADOW_INPUT:input,
    FATE_SERVER_AUTHORITATIVE_V3_SHADOW_REPORT_PATH:output
  }
});
assert.notEqual(disabled.status, 0);
assert.match(disabled.stderr, /shadow worker is disabled/);
assert.equal(fs.existsSync(output), false, 'disabled worker must not write a report');

const authorityConflict = spawnSync(process.execPath, [workerPath, '--once'], {
  cwd:root,
  encoding:'utf8',
  env:{
    ...process.env,
    FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED:'1',
    FATE_SERVER_AUTHORITATIVE_V3_ENABLED:'1',
    FATE_SERVER_AUTHORITATIVE_V3_SHADOW_INPUT:input,
    FATE_SERVER_AUTHORITATIVE_V3_SHADOW_REPORT_PATH:output
  }
});
assert.notEqual(authorityConflict.status, 0);
assert.match(authorityConflict.stderr, /refuses to run/);
assert.equal(fs.existsSync(output), false, 'authority-flag conflict must not write a report');

const missingBuildId = spawnSync(process.execPath, [workerPath, '--once'], {
  cwd:root,
  encoding:'utf8',
  env:{
    ...process.env,
    FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED:'1',
    FATE_SERVER_AUTHORITATIVE_V3_ENABLED:'0',
    FATE_SERVER_AUTHORITATIVE_V3_SHADOW_BUILD_ID:'',
    FATE_SERVER_AUTHORITATIVE_V3_SHADOW_INPUT:input,
    FATE_SERVER_AUTHORITATIVE_V3_SHADOW_REPORT_PATH:output
  }
});
assert.notEqual(missingBuildId.status, 0);
assert.match(missingBuildId.stderr, /requires an explicit immutable/);
assert.equal(fs.existsSync(output), false, 'missing build ID must not write a report');

const enabled = spawnSync(process.execPath, [workerPath, '--once'], {
  cwd:root,
  encoding:'utf8',
  env:{
    ...process.env,
    FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED:'1',
    FATE_SERVER_AUTHORITATIVE_V3_ENABLED:'0',
    FATE_SERVER_AUTHORITATIVE_V3_SHADOW_BUILD_ID:phase6BuildId,
    FATE_SERVER_AUTHORITATIVE_V3_SHADOW_INPUT:input,
    FATE_SERVER_AUTHORITATIVE_V3_SHADOW_REPORT_PATH:output
  }
});
assert.equal(enabled.status, 0, enabled.stderr);
const outputRecords = fs.readFileSync(output, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
assert.deepEqual(outputRecords.map(record=>record.status), ['baseline', 'match']);
assert.deepEqual(outputRecords.map(record=>record.buildId), [phase6BuildId, phase6BuildId]);

const legacyServer = fs.readFileSync(path.join(root, 'server', 'fate-ws-authority.js'), 'utf8');
const workerSource = fs.readFileSync(workerPath, 'utf8');
const coreSource = fs.readFileSync(
  path.join(root, 'server', 'authoritative-v3', 'phase6-shadow-core.mjs'),
  'utf8'
);
assert.doesNotMatch(
  legacyServer,
  /phase6-shadow|FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED/,
  'legacy authority must not import or start the Phase 6 worker'
);
assert.doesNotMatch(
  workerSource + coreSource,
  /fate-ws-authority|fate-authority-reducer/,
  'Phase 6 worker must not import or call the legacy authority'
);
assert.doesNotMatch(
  workerSource + coreSource,
  /\b(?:listen|connect|fetch)\s*\(/,
  'Phase 6 worker must not open a network control path'
);
fs.rmSync(tempDir, {recursive:true, force:true});

console.log(
  `authoritative v3 Phase 6 shadow smoke test passed `
  + `(${statusCounts.match} matches; ${statusCounts.mismatch} observed mismatches)`
);
