import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const diagnosticsDir = path.join(root, 'diagnostics');
const electronExe = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const argv = new Map(process.argv.slice(2).map(value=>{
  const match = /^--([^=]+)=(.*)$/.exec(value);
  return match ? [match[1], match[2]] : [value.replace(/^--/, ''), '1'];
}));
const totalGames = Math.max(1, Math.min(1010, Number(argv.get('games')) || 1000));
const pairCount = Math.max(1, Math.min(2, Number(argv.get('pairs')) || 2));
const campaignId = String(argv.get('campaign-id') || `p7f-${Date.now().toString(36)}`)
  .replace(/[^A-Za-z0-9_-]/g, '-')
  .slice(0, 18);
const staleMs = Math.max(45_000, Math.min(300_000, Number(argv.get('stale-ms')) || 120_000));
const uiRevision = String(argv.get('ui-rev') || '1786286200');
const statePath = path.join(diagnosticsDir, `phase7-campaign-${campaignId}.json`);
const stopPath = path.join(diagnosticsDir, `phase7-campaign-${campaignId}.stop`);
const supervisorLogPath = path.join(diagnosticsDir, `phase7-campaign-${campaignId}.jsonl`);

if(process.platform !== 'win32') throw new Error('The Phase 7 Electron campaign supervisor currently requires Windows');
if(!fs.existsSync(electronExe)) throw new Error(`Electron executable not found: ${electronExe}`);
fs.mkdirSync(diagnosticsDir, {recursive:true});

const nowIso = ()=>new Date().toISOString();
const sleep = ms=>new Promise(resolve=>setTimeout(resolve, ms));
function appendSupervisorLog(type, details = {}){
  fs.appendFileSync(supervisorLogPath, JSON.stringify({at:nowIso(), type, ...details}) + '\n', 'utf8');
}
function atomicWriteJson(filePath, value){
  const temporary = `${filePath}.${process.pid}.tmp`;
  const serialized = JSON.stringify(value, null, 2);
  try{
    fs.writeFileSync(temporary, serialized, 'utf8');
    fs.renameSync(temporary, filePath);
    return true;
  }catch(error){
    // OneDrive/virus scanners can briefly hold the destination on Windows.
    // A monitoring-file write must never terminate the campaign supervisor.
    try{ fs.writeFileSync(filePath, serialized, 'utf8'); }
    catch(fallbackError){
      appendSupervisorLog('state-write-error', {error:String(error?.stack || error), fallbackError:String(fallbackError?.stack || fallbackError)});
      return false;
    }
    try{ fs.unlinkSync(temporary); }catch(_){ }
    return true;
  }
}
function diagnosticPath(runId, seat){
  return path.join(diagnosticsDir, `fate-main-menu-first-minute-phase7-e2e-${runId}-${seat}.jsonl`);
}
function latestJsonLine(filePath){
  try{
    const stat = fs.statSync(filePath);
    if(!stat.size) return null;
    const length = Math.min(stat.size, 1024 * 1024);
    const buffer = Buffer.alloc(length);
    const fd = fs.openSync(filePath, 'r');
    try{ fs.readSync(fd, buffer, 0, length, stat.size - length); }
    finally{ fs.closeSync(fd); }
    const lines = buffer.toString('utf8').trim().split(/\r?\n/);
    for(let index = lines.length - 1; index >= 0; index -= 1){
      try{
        const entry = JSON.parse(lines[index]);
        if(entry?.result?.runId) return {entry, mtimeMs:stat.mtimeMs};
      }catch(_){ }
    }
  }catch(_){ }
  return null;
}
function terminate(child){
  if(!child || child.exitCode !== null) return;
  try{ child.kill(); }catch(_){ }
}

const basePerPair = Math.floor(totalGames / pairCount);
let assigned = 0;
const pairs = Array.from({length:pairCount}, (_value, index)=>{
  const count = index === pairCount - 1 ? totalGames - assigned : basePerPair;
  const pair = {
    index:index + 1,
    baseStart:assigned,
    total:count,
    processedBase:0,
    completedBase:0,
    failedBase:0,
    restartCount:0,
    segment:null,
    statusA:null,
    statusB:null,
    done:false
  };
  assigned += count;
  return pair;
});

function runIdFor(pair){
  return `${campaignId}-p${pair.index}r${pair.restartCount}`.slice(0, 32);
}
function sessionNameFor(pair, seat){
  return `${campaignId}-p${pair.index}r${pair.restartCount}-${seat}`.slice(0, 48);
}
function launchClient(pair, seat, runId, startIndex, games){
  const sessionName = sessionNameFor(pair, seat);
  const logPath = path.join(diagnosticsDir, `phase7-campaign-${campaignId}-${sessionName}.log`);
  const logFd = fs.openSync(logPath, 'a');
  const args = [
    root,
    '--allow-multiple-instances',
    `--session=${sessionName}`,
    '--phase7-beta',
    '--phase7-test-auth',
    '--phase7-fast-ui-test',
    '--e2e-organic-card-campaign',
    '--e2e-strict-card-certification',
    '--e2e-fresh',
    '--e2e-background-run',
    `--e2e-seat=${seat}`,
    `--e2e-run-id=${runId}`,
    `--e2e-games=${games}`,
    `--e2e-start-index=${startIndex}`,
    '--e2e-stall-ms=6000',
    `--ui-rev=${uiRevision}`
  ];
  const child = spawn(electronExe, args, {
    cwd:root,
    env:{...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS:'true'},
    detached:false,
    windowsHide:false,
    stdio:['ignore', logFd, logFd]
  });
  child.on('error', error=>appendSupervisorLog('client-process-error', {pair:pair.index, seat, runId, error:String(error?.stack || error)}));
  child.once('exit', (code, signal)=>appendSupervisorLog('client-exit', {pair:pair.index, seat, runId, code, signal}));
  return {child, logFd, sessionName, logPath};
}
function launchSegment(pair, reason){
  const remaining = pair.total - pair.processedBase;
  if(remaining <= 0){ pair.done = true; return; }
  const runId = runIdFor(pair);
  const startIndex = pair.baseStart + pair.processedBase;
  const launchedAt = Date.now();
  const a = launchClient(pair, 'A', runId, startIndex, remaining);
  const b = launchClient(pair, 'B', runId, startIndex, remaining);
  pair.segment = {runId, startIndex, games:remaining, launchedAt, a, b};
  pair.segment.lastProgressAt = launchedAt;
  pair.segment.lastProgressSignature = '';
  pair.statusA = null;
  pair.statusB = null;
  appendSupervisorLog('segment-launch', {pair:pair.index, runId, startIndex, games:remaining, reason, pids:[a.child.pid, b.child.pid]});
}
function updatePairStatus(pair){
  if(!pair.segment) return;
  const statusA = latestJsonLine(diagnosticPath(pair.segment.runId, 'A'));
  const statusB = latestJsonLine(diagnosticPath(pair.segment.runId, 'B'));
  pair.statusA = statusA;
  pair.statusB = statusB;
  const a = statusA?.entry?.result;
  const b = statusB?.entry?.result;
  const signature = a && b ? [
    Number(a.completedGames || 0), Number(a.failedGames || 0), Number(a.actions || 0), String(a.lastStage || ''),
    Number(b.completedGames || 0), Number(b.failedGames || 0), Number(b.actions || 0), String(b.lastStage || '')
  ].join(':') : '';
  if(signature && signature !== pair.segment.lastProgressSignature){
    pair.segment.lastProgressSignature = signature;
    pair.segment.lastProgressAt = Date.now();
  }
}
function segmentCommon(pair){
  if(!pair.segment) return {processed:0, completed:0, failed:0};
  const a = pair.statusA?.entry?.result;
  const b = pair.statusB?.entry?.result;
  if(!a || !b) return {processed:0, completed:0, failed:0};
  const processed = Math.min(Number(a.completedGames || 0) + Number(a.failedGames || 0), Number(b.completedGames || 0) + Number(b.failedGames || 0));
  const completed = Math.min(Number(a.completedGames || 0), Number(b.completedGames || 0), processed);
  return {processed, completed, failed:Math.max(0, processed - completed)};
}
function pairSnapshot(pair){
  const common = segmentCommon(pair);
  const resultA = pair.statusA?.entry?.result || null;
  const resultB = pair.statusB?.entry?.result || null;
  return {
    pair:pair.index,
    range:[pair.baseStart, pair.baseStart + pair.total - 1],
    processed:pair.processedBase + common.processed,
    completed:pair.completedBase + common.completed,
    failed:pair.failedBase + common.failed,
    restartCount:pair.restartCount,
    done:pair.done,
    segment:pair.segment ? {runId:pair.segment.runId, startIndex:pair.segment.startIndex, games:pair.segment.games, launchedAt:pair.segment.launchedAt} : null,
    clients:{
      A:resultA ? {heartbeatAt:resultA.heartbeatAt, running:resultA.running, completed:resultA.completedGames, failed:resultA.failedGames, actions:resultA.actions, errors:resultA.errorCount, domViolations:resultA.domViolationCount, oracleViolations:resultA.oracleViolationCount, lastStage:resultA.lastStage, pid:pair.segment?.a?.child?.pid || null} : null,
      B:resultB ? {heartbeatAt:resultB.heartbeatAt, running:resultB.running, completed:resultB.completedGames, failed:resultB.failedGames, actions:resultB.actions, errors:resultB.errorCount, domViolations:resultB.domViolationCount, oracleViolations:resultB.oracleViolationCount, lastStage:resultB.lastStage, pid:pair.segment?.b?.child?.pid || null} : null
    }
  };
}
function campaignSnapshot(status){
  const pairStates = pairs.map(pairSnapshot);
  return {
    version:1,
    campaignId,
    supervisorPid:process.pid,
    startedAt:status.startedAt,
    updatedAt:Date.now(),
    status:status.value,
    totalGames,
    processedGames:pairStates.reduce((sum, pair)=>sum + pair.processed, 0),
    completedGames:pairStates.reduce((sum, pair)=>sum + pair.completed, 0),
    failedGames:pairStates.reduce((sum, pair)=>sum + pair.failed, 0),
    pairs:pairStates,
    statePath,
    stopPath,
    supervisorLogPath
  };
}
async function restartPair(pair, reason){
  const common = segmentCommon(pair);
  pair.processedBase += common.processed;
  pair.completedBase += common.completed;
  pair.failedBase += common.failed;
  terminate(pair.segment?.a?.child);
  terminate(pair.segment?.b?.child);
  try{ fs.closeSync(pair.segment?.a?.logFd); }catch(_){ }
  try{ fs.closeSync(pair.segment?.b?.logFd); }catch(_){ }
  pair.segment = null;
  pair.restartCount += 1;
  appendSupervisorLog('pair-restart', {pair:pair.index, reason, processed:pair.processedBase, remaining:pair.total - pair.processedBase});
  await sleep(2500);
  launchSegment(pair, reason);
}

const campaignStatus = {startedAt:Date.now(), value:'running'};
process.on('uncaughtException', error=>{
  appendSupervisorLog('supervisor-uncaught-exception', {error:String(error?.stack || error)});
});
process.on('unhandledRejection', error=>{
  appendSupervisorLog('supervisor-unhandled-rejection', {error:String(error?.stack || error)});
});
appendSupervisorLog('campaign-start', {campaignId, totalGames, pairCount, staleMs, supervisorPid:process.pid});
for(const pair of pairs) launchSegment(pair, 'initial');

while(campaignStatus.value === 'running'){
  await sleep(5000);
  if(fs.existsSync(stopPath)){
    campaignStatus.value = 'stopped';
    appendSupervisorLog('campaign-stop-file', {stopPath});
    break;
  }
  for(const pair of pairs){
    try{
      if(pair.done) continue;
      updatePairStatus(pair);
      const common = segmentCommon(pair);
      if(common.processed >= pair.segment.games){
        pair.processedBase += common.processed;
        pair.completedBase += common.completed;
        pair.failedBase += common.failed;
        pair.done = pair.processedBase >= pair.total;
        terminate(pair.segment?.a?.child);
        terminate(pair.segment?.b?.child);
        try{ fs.closeSync(pair.segment?.a?.logFd); }catch(_){ }
        try{ fs.closeSync(pair.segment?.b?.logFd); }catch(_){ }
        pair.segment = null;
        appendSupervisorLog('pair-complete', {pair:pair.index, processed:pair.processedBase, completed:pair.completedBase, failed:pair.failedBase});
        continue;
      }
      const exited = pair.segment.a.child.exitCode !== null || pair.segment.b.child.exitCode !== null;
      const heartbeatA = Number(pair.statusA?.entry?.result?.heartbeatAt || 0);
      const heartbeatB = Number(pair.statusB?.entry?.result?.heartbeatAt || 0);
      const oldestHeartbeat = heartbeatA && heartbeatB ? Math.min(heartbeatA, heartbeatB) : 0;
      const startupExpired = Date.now() - pair.segment.launchedAt > staleMs;
      const heartbeatStale = oldestHeartbeat ? Date.now() - oldestHeartbeat > staleMs : startupExpired;
      const progressStale = Date.now() - pair.segment.lastProgressAt > staleMs;
      if(exited || heartbeatStale || progressStale){
        await restartPair(pair, exited ? 'client-exited' : (heartbeatStale ? 'heartbeat-stale' : 'progress-stale'));
      }
    }catch(error){
      appendSupervisorLog('pair-monitor-error', {pair:pair.index, error:String(error?.stack || error)});
    }
  }
  if(pairs.every(pair=>pair.done)) campaignStatus.value = 'complete';
  atomicWriteJson(statePath, campaignSnapshot(campaignStatus));
}

for(const pair of pairs){
  terminate(pair.segment?.a?.child);
  terminate(pair.segment?.b?.child);
}
atomicWriteJson(statePath, campaignSnapshot(campaignStatus));
appendSupervisorLog('campaign-finish', {status:campaignStatus.value});
