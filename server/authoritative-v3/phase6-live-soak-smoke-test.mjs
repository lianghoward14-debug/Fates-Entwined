import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  ENGINE_VERSION,
  RULESET_VERSION
} from '../../shared/engine/index.mjs';
import {
  readAcceptedEventLog,
  reconcileAcceptedEvents,
  summarizeShadowRecords
} from '../../tools/authority-v3-shadow-report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fate-v3-shadow-soak-'));
const input = path.join(tempDir, 'events.jsonl');
const interruptedReport = path.join(tempDir, 'shadow-interrupted.jsonl');
const replayReport = path.join(tempDir, 'shadow-replay.jsonl');
const workerPath = path.join(root, 'server', 'authoritative-v3', 'phase6-shadow-worker.mjs');
const lifecyclePath = path.join(root, 'server', 'fate-client-resolved-ws-smoke-test.js');
const port = 19100 + (process.pid % 500);

function delay(ms){
  return new Promise(resolve=>setTimeout(resolve, ms));
}

function outputCollector(child){
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk=>{ stdout += chunk.toString(); });
  child.stderr.on('data', chunk=>{ stderr += chunk.toString(); });
  return {
    stdout:()=>stdout,
    stderr:()=>stderr
  };
}

async function waitForExit(child, timeoutMs, label){
  if(child.exitCode !== null) return child.exitCode;
  return new Promise((resolve, reject)=>{
    const timer = setTimeout(()=>{
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.once('exit', code=>{
      clearTimeout(timer);
      resolve(code);
    });
  });
}

async function waitForReportLine(filePath, timeoutMs = 15000){
  const deadline = Date.now() + timeoutMs;
  while(Date.now() < deadline){
    if(fs.existsSync(filePath)){
      const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
      if(lines.length) return lines.map(JSON.parse);
    }
    await delay(50);
  }
  throw new Error(`timed out waiting for ${filePath}`);
}

const worker = spawn(process.execPath, [workerPath], {
  cwd:root,
  env:{
    ...process.env,
    FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED:'1',
    FATE_SERVER_AUTHORITATIVE_V3_ENABLED:'0',
    FATE_SERVER_AUTHORITATIVE_V3_SHADOW_BUILD_ID:'phase6-live-soak-test-build',
    FATE_SERVER_AUTHORITATIVE_V3_SHADOW_INPUT:input,
    FATE_SERVER_AUTHORITATIVE_V3_SHADOW_REPORT_PATH:interruptedReport,
    FATE_SERVER_AUTHORITATIVE_V3_SHADOW_POLL_MS:'100'
  },
  stdio:['ignore', 'pipe', 'pipe']
});
const workerOutput = outputCollector(worker);

const lifecycle = spawn(process.execPath, [lifecyclePath], {
  cwd:root,
  env:{
    ...process.env,
    FATE_CLIENT_RESOLVED_WS_SMOKE_PORT:String(port),
    FATE_CLIENT_RESOLVED_WS_SMOKE_DATA_DIR:tempDir,
    FATE_CLIENT_RESOLVED_WS_SMOKE_AFTER_START_DELAY_MS:'1200',
    FATE_CLIENT_RESOLVED_WS_SMOKE_TIMEOUT_MS:'45000',
    FATE_WS_APPEND_EVENT_LOG:'1'
  },
  stdio:['ignore', 'pipe', 'pipe']
});
const lifecycleOutput = outputCollector(lifecycle);

try{
  const earlyRecords = await waitForReportLine(interruptedReport);
  assert.equal(earlyRecords[0].status, 'baseline');
  assert.equal(earlyRecords[0].command.effectiveType, 'MATCH_START');
  assert.equal(lifecycle.exitCode, null, 'legacy lifecycle must still be running when observer is interrupted');

  worker.kill('SIGTERM');
  const workerExit = await waitForExit(worker, 5000, 'shadow worker shutdown');
  assert(
    workerExit === 0 || (workerExit === null && worker.signalCode === 'SIGTERM'),
    workerOutput.stderr()
  );

  const lifecycleExit = await waitForExit(lifecycle, 60000, 'legacy lifecycle');
  assert.equal(lifecycleExit, 0, lifecycleOutput.stderr() || lifecycleOutput.stdout());
  assert.match(lifecycleOutput.stdout(), /fate-client-resolved-ws smoke passed/);

  assert(fs.existsSync(input), 'legacy authority must retain its accepted-event log');
  const acceptedLines = fs.readFileSync(input, 'utf8').split(/\r?\n/).filter(Boolean);
  assert(acceptedLines.length >= 8, 'legacy match must continue accepting actions after observer shutdown');
  const acceptedTypes = acceptedLines.map(line=>{
    const record = JSON.parse(line);
    const action = record.accepted?.action || {};
    return String(
      String(action.type || '').toUpperCase() === 'ACTION_RESULT'
        ? action.payload?.actionKind || action.type
        : action.type
    ).toUpperCase();
  });
  assert.equal(acceptedTypes[0], 'MATCH_START');
  assert(acceptedTypes.includes('END_TURN'));
  assert(acceptedTypes.includes('BOARD_ACTION'));
  assert(acceptedTypes.includes('REACTION_CHOICE'));
  assert(acceptedTypes.includes('FORFEIT'));

  const replay = spawnSync(process.execPath, [workerPath, '--once'], {
    cwd:root,
    encoding:'utf8',
    timeout:60000,
    env:{
      ...process.env,
      FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED:'1',
      FATE_SERVER_AUTHORITATIVE_V3_ENABLED:'0',
      FATE_SERVER_AUTHORITATIVE_V3_SHADOW_BUILD_ID:'phase6-live-soak-test-build',
      FATE_SERVER_AUTHORITATIVE_V3_SHADOW_INPUT:input,
      FATE_SERVER_AUTHORITATIVE_V3_SHADOW_REPORT_PATH:replayReport
    }
  });
  assert.equal(replay.status, 0, replay.stderr || replay.stdout);
  const replayRecords = fs.readFileSync(replayReport, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(JSON.parse);
  const replayStatusCounts = replayRecords.reduce((counts, record)=>{
    counts[record.status] = (counts[record.status] || 0) + 1;
    return counts;
  }, {});
  const replaySummary = summarizeShadowRecords(replayRecords, replayReport);
  const acceptedLog = readAcceptedEventLog(input);
  const reconciliation = reconcileAcceptedEvents(replayRecords, acceptedLog.records, {
    invalidAcceptedLines:acceptedLog.invalidLines
  });
  assert.equal(replayRecords.length, acceptedLines.length);
  assert.equal(replaySummary.uniqueRecords, acceptedLines.length);
  assert.equal(replaySummary.duplicateRecords, 0);
  assert.equal(reconciliation.ok, true);
  assert.equal(replaySummary.openComparisonIssues, 6);
  assert.equal(replaySummary.notCompared, 7);
  assert.equal(replaySummary.untranslatedGameplay, 2);
  assert.deepEqual(replaySummary.notComparedByCoverageClass, {
    'control-baseline':4,
    'gameplay-untranslated':2,
    'presentation-only':1
  });
  assert.deepEqual(replaySummary.openIssuesByCommandType, {
    BOARD_ACTION:2,
    END_TURN:1,
    FORFEIT:1,
    HAND_LIMIT_DISCARD:1,
    PLACE_CARD:1
  });
  assert.equal(replayRecords[0].status, 'baseline');
  assert(
    Number(replayStatusCounts.mismatch || 0) + Number(replayStatusCounts['engine-rejection'] || 0) > 0,
    `soak replay must exercise v3 comparison: ${JSON.stringify(replayStatusCounts)}`
  );
  for(const record of replayRecords){
    assert.equal(record.engineVersion, ENGINE_VERSION);
    assert.equal(record.rulesetVersion, RULESET_VERSION);
    assert.equal(record.buildId, 'phase6-live-soak-test-build');
    assert(Object.hasOwn(record, 'legacyHash'));
    assert(Object.hasOwn(record, 'engineHash'));
    assert(Object.hasOwn(record, 'firstDifferingStatePath'));
  }

  console.log(
    `authoritative v3 Phase 6 live soak smoke test passed `
    + `(${acceptedLines.length} legacy actions; observer interrupted after baseline; `
    + `statuses ${JSON.stringify(replayStatusCounts)}; `
    + `${replaySummary.openComparisonIssues} synthetic open comparisons; `
    + `not-compared ${JSON.stringify(replaySummary.notComparedByCommandType)}; `
    + `coverage ${JSON.stringify(replaySummary.notComparedByCoverageClass)}; `
    + `open ${JSON.stringify(replaySummary.openIssuesByCommandType)})`
  );
}finally{
  if(worker.exitCode === null) worker.kill('SIGTERM');
  if(lifecycle.exitCode === null) lifecycle.kill('SIGTERM');
  await Promise.allSettled([
    waitForExit(worker, 3000, 'shadow worker cleanup'),
    waitForExit(lifecycle, 5000, 'legacy lifecycle cleanup')
  ]);
  fs.rmSync(tempDir, {recursive:true, force:true});
}
