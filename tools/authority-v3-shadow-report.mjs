#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {
  validateShadowDeploymentText
} from './authority-v3-shadow-predeploy.mjs';
import {
  buildShadowSourceIdentity
} from './authority-v3-shadow-build-id.mjs';

const OPEN_STATUSES = new Set([
  'mismatch',
  'engine-rejection',
  'translation-failure',
  'invalid-input'
]);

function sha256Bytes(bytes){
  return createHash('sha256').update(bytes).digest('hex');
}

export function readEvidenceSnapshot(filePath){
  const resolved = path.resolve(filePath);
  const bytes = fs.readFileSync(resolved);
  return {
    path:resolved,
    bytes,
    sizeBytes:bytes.length,
    sha256:sha256Bytes(bytes)
  };
}

export function sha256File(filePath){
  return readEvidenceSnapshot(filePath).sha256;
}

function sha256Json(value){
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function increment(target, key){
  const normalized = String(key || '(missing)');
  target[normalized] = (target[normalized] || 0) + 1;
}

function recordIdentity(record, index){
  const roomCode = String(record?.roomCode || '');
  const sequence = Number(record?.sequence || 0);
  const legacyHash = String(record?.legacyHash || '');
  if(roomCode && sequence) return `${roomCode}:${sequence}:${legacyHash}`;
  return `unkeyed:${index}`;
}

export function summarizeShadowRecords(records, source = '(memory)'){
  const unique = [];
  const seen = new Set();
  let duplicates = 0;
  records.forEach((record, index)=>{
    const identity = recordIdentity(record, index);
    if(seen.has(identity)){
      duplicates += 1;
      return;
    }
    seen.add(identity);
    unique.push(record);
  });

  const summary = {
    format:'fates-authority-v3-shadow-summary-v1',
    source,
    inputRecords:records.length,
    uniqueRecords:unique.length,
    duplicateRecords:duplicates,
    statusCounts:{},
    commandTypeCounts:{},
    notComparedByCommandType:{},
    notComparedByCoverageClass:{},
    openIssuesByStatus:{},
    openIssuesByCommandType:{},
    engineVersions:[],
    rulesetVersions:[],
    buildIds:[],
    missingEngineVersions:0,
    missingRulesetVersions:0,
    missingBuildIds:0,
    roomCount:0,
    openComparisonIssues:0,
    notCompared:0,
    untranslatedGameplay:0,
    matches:0
  };
  const engineVersions = new Set();
  const rulesetVersions = new Set();
  const buildIds = new Set();
  const rooms = new Set();
  for(const record of unique){
    const status = String(record?.status || '(missing)');
    const commandType = String(
      record?.command?.effectiveType
      || record?.command?.acceptedType
      || '(missing)'
    );
    increment(summary.statusCounts, status);
    increment(summary.commandTypeCounts, commandType);
    const roomCode = String(record?.roomCode || '').toUpperCase();
    if(roomCode) rooms.add(roomCode);
    if(record?.engineVersion){
      engineVersions.add(String(record.engineVersion));
    }else{
      summary.missingEngineVersions += 1;
    }
    if(record?.rulesetVersion){
      rulesetVersions.add(String(record.rulesetVersion));
    }else{
      summary.missingRulesetVersions += 1;
    }
    if(record?.buildId){
      buildIds.add(String(record.buildId));
    }else{
      summary.missingBuildIds += 1;
    }
    if(status === 'match') summary.matches += 1;
    if(status === 'not-compared'){
      summary.notCompared += 1;
      increment(summary.notComparedByCommandType, commandType);
      const coverageClass = String(record?.coverageClass || 'unclassified');
      increment(summary.notComparedByCoverageClass, coverageClass);
      if(coverageClass === 'gameplay-untranslated') summary.untranslatedGameplay += 1;
    }
    if(OPEN_STATUSES.has(status)){
      summary.openComparisonIssues += 1;
      increment(summary.openIssuesByStatus, status);
      increment(summary.openIssuesByCommandType, commandType);
    }
  }
  summary.engineVersions = [...engineVersions].sort();
  summary.rulesetVersions = [...rulesetVersions].sort();
  summary.buildIds = [...buildIds].sort();
  summary.roomCount = rooms.size;
  summary.ok = summary.openComparisonIssues === 0 && summary.untranslatedGameplay === 0;
  return summary;
}

function issueMatches(record, match){
  const inferred = record?.command?.inferred || {};
  const checks = {
    status:String(record?.status || ''),
    effectiveType:String(record?.command?.effectiveType || ''),
    inferredCommandType:String(inferred.type || ''),
    inferredCardId:String(inferred.cardId || inferred.payload?.cardId || ''),
    firstDifferingStatePath:String(record?.firstDifferingStatePath || ''),
    errorCode:String(record?.errorCode || '')
  };
  return Object.entries(match || {}).every(([key, expected])=>{
    if(key.endsWith('Pattern')){
      const targetKey = key.slice(0, -'Pattern'.length);
      if(!Object.hasOwn(checks, targetKey)) return false;
      return new RegExp(String(expected)).test(checks[targetKey]);
    }
    return Object.hasOwn(checks, key) && checks[key] === String(expected);
  });
}

export function reviewShadowIssues(records, ledger = {}){
  const entries = Array.isArray(ledger?.issues) ? ledger.issues : [];
  const reviewedIssues = [];
  const unreviewedIssues = [];
  for(const record of records){
    if(!OPEN_STATUSES.has(String(record?.status || ''))) continue;
    const review = entries.find(entry=>issueMatches(record, entry.match));
    const issue = {
      roomCode:String(record?.roomCode || ''),
      sequence:Number(record?.sequence || 0) || 0,
      status:String(record?.status || ''),
      effectiveType:String(record?.command?.effectiveType || ''),
      inferredCommand:record?.command?.inferred || null,
      firstDifferingStatePath:record?.firstDifferingStatePath || null,
      errorCode:String(record?.errorCode || '')
    };
    if(review){
      reviewedIssues.push({
        ...issue,
        reviewId:String(review.id || ''),
        classification:String(review.classification || ''),
        rationale:String(review.rationale || '')
      });
    }else{
      unreviewedIssues.push(issue);
    }
  }
  return {
    ledgerFormat:String(ledger?.format || ''),
    reviewedIssues,
    unreviewedIssues,
    reviewedCount:reviewedIssues.length,
    unreviewedCount:unreviewedIssues.length,
    ok:unreviewedIssues.length === 0
  };
}

export function parseShadowReport(text){
  const records = [];
  for(const [index, line] of String(text || '').split(/\r?\n/).entries()){
    if(!line.trim()) continue;
    try{
      records.push(JSON.parse(line));
    }catch(error){
      records.push({
        status:'invalid-input',
        reason:`line ${index + 1}: ${String(error?.message || error)}`
      });
    }
  }
  return records;
}

export function readShadowReport(reportPath){
  return parseShadowReport(readEvidenceSnapshot(reportPath).bytes.toString('utf8'));
}

export function parseAcceptedEventLog(text){
  const records = [];
  const invalidLines = [];
  for(const [index, line] of String(text || '').split(/\r?\n/).entries()){
    if(!line.trim()) continue;
    try{
      records.push(JSON.parse(line));
    }catch(error){
      invalidLines.push({
        line:index + 1,
        reason:String(error?.message || error)
      });
    }
  }
  return {records, invalidLines};
}

export function readAcceptedEventLog(eventLogPath){
  return parseAcceptedEventLog(
    readEvidenceSnapshot(eventLogPath).bytes.toString('utf8')
  );
}

function acceptedEventIdentity(record){
  const action = record?.accepted?.action;
  if(!action) return null;
  const roomCode = String(record?.code || record?.accepted?.roomCode || '').toUpperCase();
  const sequence = Number(action.seq || 0) || 0;
  if(!roomCode || !sequence) return null;
  return {
    key:`${roomCode}:${sequence}`,
    legacyHash:String(
      action?.payload?.stateHash
      || record?.accepted?.serverStateHash
      || ''
    )
  };
}

function comparisonIdentity(record){
  const roomCode = String(record?.roomCode || '').toUpperCase();
  const sequence = Number(record?.sequence || 0) || 0;
  if(!roomCode || !sequence) return null;
  return {
    key:`${roomCode}:${sequence}`,
    legacyHash:String(record?.legacyHash || '')
  };
}

function identitiesByKey(records, identityFor, invalidEntries){
  const byKey = new Map();
  records.forEach((record, index)=>{
    const identity = identityFor(record);
    if(!identity){
      invalidEntries.push({index:index + 1});
      return;
    }
    const hashes = byKey.get(identity.key) || [];
    hashes.push(identity.legacyHash);
    byKey.set(identity.key, hashes);
  });
  return byKey;
}

export function reconcileAcceptedEvents(
  comparisonRecords,
  acceptedRecords,
  options = {}
){
  const invalidAcceptedEntries = [];
  const invalidComparisonEntries = [];
  const acceptedByKey = identitiesByKey(
    acceptedRecords,
    acceptedEventIdentity,
    invalidAcceptedEntries
  );
  const comparisonsByKey = identitiesByKey(
    comparisonRecords,
    comparisonIdentity,
    invalidComparisonEntries
  );
  const missingComparisons = [];
  const unexpectedComparisons = [];
  const hashMismatches = [];
  const keys = new Set([...acceptedByKey.keys(), ...comparisonsByKey.keys()]);
  for(const key of [...keys].sort()){
    const acceptedHashes = acceptedByKey.get(key) || [];
    const comparisonHashes = comparisonsByKey.get(key) || [];
    if(comparisonHashes.length < acceptedHashes.length){
      missingComparisons.push({
        key,
        count:acceptedHashes.length - comparisonHashes.length
      });
    }
    if(comparisonHashes.length > acceptedHashes.length){
      unexpectedComparisons.push({
        key,
        count:comparisonHashes.length - acceptedHashes.length
      });
    }
    if(acceptedHashes.length === comparisonHashes.length
      && acceptedHashes.length
      && [...acceptedHashes].sort().some(
        (hash, index)=>hash !== [...comparisonHashes].sort()[index]
      )){
      hashMismatches.push({
        key,
        acceptedHashes:[...acceptedHashes].sort(),
        comparisonHashes:[...comparisonHashes].sort()
      });
    }
  }
  const invalidAcceptedLines = options.invalidAcceptedLines || [];
  const ok = missingComparisons.length === 0
    && unexpectedComparisons.length === 0
    && hashMismatches.length === 0
    && invalidAcceptedLines.length === 0
    && invalidAcceptedEntries.length === 0
    && invalidComparisonEntries.length === 0;
  return {
    format:'fates-authority-v3-shadow-reconciliation-v1',
    acceptedActionRecords:acceptedRecords.length,
    comparisonRecords:comparisonRecords.length,
    missingComparisons,
    unexpectedComparisons,
    hashMismatches,
    invalidAcceptedLines,
    invalidAcceptedEntries,
    invalidComparisonEntries,
    ok
  };
}

function optionValue(args, name){
  const index = args.indexOf(name);
  if(index < 0) return null;
  const value = args[index + 1];
  if(value === undefined || String(value).startsWith('--')){
    throw new Error(`${name} requires a value`);
  }
  return String(value);
}

function positiveIntegerOption(args, name){
  const raw = optionValue(args, name);
  if(raw === null) return null;
  const value = Number(raw);
  if(!Number.isInteger(value) || value < 1){
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

export function applyShadowEvidenceRequirements(summary, requirements = {}){
  const minUniqueRecords = requirements.minUniqueRecords ?? null;
  const minMatches = requirements.minMatches ?? null;
  const minRooms = requirements.minRooms ?? null;
  const engineVersion = requirements.engineVersion ?? null;
  const rulesetVersion = requirements.rulesetVersion ?? null;
  const buildId = requirements.buildId ?? null;
  const failures = [];
  if(minUniqueRecords !== null && summary.uniqueRecords < minUniqueRecords){
    failures.push(`unique records ${summary.uniqueRecords} is below required ${minUniqueRecords}`);
  }
  if(minMatches !== null && summary.matches < minMatches){
    failures.push(`matches ${summary.matches} is below required ${minMatches}`);
  }
  if(minRooms !== null && summary.roomCount < minRooms){
    failures.push(`rooms ${summary.roomCount} is below required ${minRooms}`);
  }
  if(engineVersion !== null){
    if(summary.missingEngineVersions > 0){
      failures.push(`${summary.missingEngineVersions} records are missing engineVersion`);
    }
    if(summary.engineVersions.length !== 1 || summary.engineVersions[0] !== engineVersion){
      failures.push(
        `engine versions ${JSON.stringify(summary.engineVersions)} do not exactly match ${JSON.stringify(engineVersion)}`
      );
    }
  }
  if(rulesetVersion !== null){
    if(summary.missingRulesetVersions > 0){
      failures.push(`${summary.missingRulesetVersions} records are missing rulesetVersion`);
    }
    if(summary.rulesetVersions.length !== 1 || summary.rulesetVersions[0] !== rulesetVersion){
      failures.push(
        `ruleset versions ${JSON.stringify(summary.rulesetVersions)} do not exactly match ${JSON.stringify(rulesetVersion)}`
      );
    }
  }
  if(buildId !== null){
    if(summary.missingBuildIds > 0){
      failures.push(`${summary.missingBuildIds} records are missing buildId`);
    }
    if(summary.buildIds.length !== 1 || summary.buildIds[0] !== buildId){
      failures.push(
        `build IDs ${JSON.stringify(summary.buildIds)} do not exactly match ${JSON.stringify(buildId)}`
      );
    }
  }
  summary.evidenceRequirements = {
    minUniqueRecords,
    minMatches,
    minRooms,
    engineVersion,
    rulesetVersion,
    buildId
  };
  summary.evidenceFailures = failures;
  return failures;
}

function main(){
  const args = process.argv.slice(2);
  const reportPath = args[0] && !args[0].startsWith('--') ? args[0] : '';
  if(!reportPath){
    throw new Error(
      'usage: node tools/authority-v3-shadow-report.mjs <report.jsonl> '
      + '[--review-ledger <ledger.json>] [--min-unique-records <n>] '
      + '[--min-matches <n>] [--min-rooms <n>] '
      + '[--require-engine-version <version>] [--require-ruleset-version <version>] '
      + '[--require-build-id <immutable-build-id>] '
      + '[--accepted-log <events.jsonl>] [--deployment-config <shadow-fly.toml>] '
      + '[--write-audit <audit.json>] [--fail-on-open]'
    );
  }
  const resolved = path.resolve(reportPath);
  const reportSnapshot = readEvidenceSnapshot(resolved);
  const records = parseShadowReport(reportSnapshot.bytes.toString('utf8'));
  const summary = summarizeShadowRecords(records, resolved);
  summary.evidenceFiles = {
    shadowReport:{
      path:reportSnapshot.path,
      sizeBytes:reportSnapshot.sizeBytes,
      sha256:reportSnapshot.sha256
    }
  };
  applyShadowEvidenceRequirements(summary, {
    minUniqueRecords:positiveIntegerOption(args, '--min-unique-records'),
    minMatches:positiveIntegerOption(args, '--min-matches'),
    minRooms:positiveIntegerOption(args, '--min-rooms'),
    engineVersion:optionValue(args, '--require-engine-version'),
    rulesetVersion:optionValue(args, '--require-ruleset-version'),
    buildId:optionValue(args, '--require-build-id')
  });
  const ledgerIndex = args.indexOf('--review-ledger');
  if(ledgerIndex >= 0){
    const ledgerPath = args[ledgerIndex + 1];
    if(!ledgerPath) throw new Error('--review-ledger requires a JSON path');
    const resolvedLedger = path.resolve(ledgerPath);
    const ledgerSnapshot = readEvidenceSnapshot(resolvedLedger);
    const ledger = JSON.parse(ledgerSnapshot.bytes.toString('utf8'));
    summary.reviewLedger = resolvedLedger;
    summary.evidenceFiles.reviewLedger = {
      path:ledgerSnapshot.path,
      sizeBytes:ledgerSnapshot.sizeBytes,
      sha256:ledgerSnapshot.sha256
    };
    summary.review = reviewShadowIssues(records, ledger);
    summary.ok = summary.review.ok
      && summary.untranslatedGameplay === 0
      && summary.evidenceFailures.length === 0;
  }else{
    summary.ok = summary.ok && summary.evidenceFailures.length === 0;
  }
  const acceptedLogPath = optionValue(args, '--accepted-log');
  if(acceptedLogPath !== null){
    const resolvedAcceptedLog = path.resolve(acceptedLogPath);
    const acceptedSnapshot = readEvidenceSnapshot(resolvedAcceptedLog);
    const acceptedLog = parseAcceptedEventLog(acceptedSnapshot.bytes.toString('utf8'));
    summary.acceptedLog = resolvedAcceptedLog;
    summary.evidenceFiles.acceptedLog = {
      path:acceptedSnapshot.path,
      sizeBytes:acceptedSnapshot.sizeBytes,
      sha256:acceptedSnapshot.sha256
    };
    summary.reconciliation = reconcileAcceptedEvents(records, acceptedLog.records, {
      invalidAcceptedLines:acceptedLog.invalidLines
    });
    summary.ok = summary.ok && summary.reconciliation.ok;
  }
  const deploymentConfigPath = optionValue(args, '--deployment-config');
  if(deploymentConfigPath !== null){
    const deploymentSnapshot = readEvidenceSnapshot(deploymentConfigPath);
    summary.deploymentConfig = deploymentSnapshot.path;
    summary.evidenceFiles.deploymentConfig = {
      path:deploymentSnapshot.path,
      sizeBytes:deploymentSnapshot.sizeBytes,
      sha256:deploymentSnapshot.sha256
    };
    summary.deploymentValidation = validateShadowDeploymentText(
      deploymentSnapshot.bytes.toString('utf8'),
      {
        configPath:deploymentSnapshot.path,
        expectedBuildId:buildShadowSourceIdentity(
          path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
        ).buildId
      }
    );
    summary.deploymentBuildIdAgreement = {
      configBuildId:String(summary.deploymentValidation.buildId || ''),
      telemetryBuildIds:[...summary.buildIds],
      missingTelemetryBuildIds:summary.missingBuildIds,
      ok:summary.deploymentValidation.ok
        && summary.missingBuildIds === 0
        && summary.buildIds.length === 1
        && summary.buildIds[0] === summary.deploymentValidation.buildId
    };
    summary.ok = summary.ok
      && summary.deploymentValidation.ok
      && summary.deploymentBuildIdAgreement.ok;
  }
  const auditProjection = structuredClone(summary);
  delete auditProjection.source;
  delete auditProjection.reviewLedger;
  delete auditProjection.acceptedLog;
  delete auditProjection.deploymentConfig;
  if(auditProjection.deploymentValidation){
    delete auditProjection.deploymentValidation.configPath;
    delete auditProjection.deploymentValidation.defaultConfigPath;
  }
  auditProjection.evidenceFiles = Object.fromEntries(
    Object.entries(summary.evidenceFiles).map(([name, evidence])=>[
      name,
      {sizeBytes:evidence.sizeBytes, sha256:evidence.sha256}
    ])
  );
  summary.auditFormat = 'fates-authority-v3-shadow-audit-v1';
  summary.auditDigest = sha256Json(auditProjection);
  const auditPath = optionValue(args, '--write-audit');
  if(auditPath !== null){
    const resolvedAudit = path.resolve(auditPath);
    const evidencePaths = Object.values(summary.evidenceFiles)
      .map(evidence=>path.resolve(evidence.path));
    if(evidencePaths.includes(resolvedAudit)){
      throw new Error('--write-audit path must be different from every evidence input');
    }
    summary.auditPath = resolvedAudit;
    fs.mkdirSync(path.dirname(resolvedAudit), {recursive:true});
    fs.writeFileSync(resolvedAudit, JSON.stringify(summary, null, 2) + '\n', {
      encoding:'utf8',
      flag:'wx'
    });
  }
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  if(process.argv.includes('--fail-on-open') && !summary.ok) process.exitCode = 1;
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
if(invoked && invoked === fileURLToPath(import.meta.url)) main();
