#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildPhase7SourceIdentity} from './authority-v3-phase7-build-id.mjs';

function parseValue(raw){
  const value = String(raw || '').trim();
  const quoted = value.match(/^(['"])([\s\S]*)\1$/);
  return quoted ? quoted[2] : value;
}

// Phase 7 is independently deployable after removal of the retired shadow
// multiplayer system, so its release gate must not import a deleted legacy
// predeploy module merely to parse this small TOML subset.
function parseDeploymentToml(text){
  const tables = {root:{}};
  const duplicateKeys = [];
  let tableName = 'root';
  for(const rawLine of String(text || '').split(/\r?\n/)){
    const line = rawLine.replace(/\s+#.*$/, '').trim();
    if(!line) continue;
    const arrayHeader = line.match(/^\[\[([^\]]+)\]\]$/);
    const tableHeader = line.match(/^\[([^\]]+)\]$/);
    if(arrayHeader || tableHeader){
      tableName = String((arrayHeader || tableHeader)[1]).trim();
      tables[tableName] ||= {};
      continue;
    }
    const assignment = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if(!assignment) continue;
    const key = assignment[1];
    tables[tableName] ||= {};
    if(Object.hasOwn(tables[tableName], key)) duplicateKeys.push(`${tableName}.${key}`);
    tables[tableName][key] = parseValue(assignment[2]);
  }
  return {tables, duplicateKeys};
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.resolve(process.argv[2] || path.join(root, 'fly.authority-v3-phase7-beta.toml'));
const errors = [];

if(!fs.existsSync(configPath)){
  errors.push(`Phase 7 config does not exist: ${configPath}`);
}else{
  const parsed = parseDeploymentToml(fs.readFileSync(configPath, 'utf8'));
  const tables = parsed.tables;
  const expectedBuild = buildPhase7SourceIdentity(root).buildId;
  const defaultFly = parseDeploymentToml(fs.readFileSync(path.join(root, 'fly.toml'), 'utf8')).tables;
  const shadowPath = path.join(root, 'fly.authority-v3-shadow.toml');
  const shadowFly = fs.existsSync(shadowPath)
    ? parseDeploymentToml(fs.readFileSync(shadowPath, 'utf8')).tables
    : {root:{}, mounts:{}};
  const requireEqual = (actual, expected, label)=>{
    if(String(actual ?? '') !== String(expected)) errors.push(`${label} must be ${JSON.stringify(expected)}`);
  };
  if(parsed.duplicateKeys.length) errors.push(`duplicate keys: ${parsed.duplicateKeys.join(', ')}`);
  const conflictingApps = [defaultFly.root?.app, shadowFly.root?.app].filter(Boolean);
  if(conflictingApps.includes(tables.root?.app)){
    errors.push('Phase 7 app must be separate from legacy production and Phase 6 shadow');
  }
  // Fly volume names are scoped to an app. Reusing the descriptive source
  // name in two distinct apps is not shared storage; only reject it when the
  // app itself also conflicts. Ignore absent retired-shadow values entirely.
  const storageConflicts = [defaultFly, shadowFly].some(function(candidate){
    return candidate.root?.app
      && candidate.root.app === tables.root?.app
      && candidate.mounts?.source
      && candidate.mounts.source === tables.mounts?.source;
  });
  if(storageConflicts){
    errors.push('Phase 7 volume must be separate from legacy production and Phase 6 shadow');
  }
  requireEqual(tables.build?.dockerfile, 'Dockerfile.authority-v3-phase7-beta', 'build.dockerfile');
  requireEqual(
    tables.processes?.app,
    'node server/authoritative-v3/phase7-beta-server.mjs',
    'processes.app'
  );
  for(const [key, expected] of Object.entries({
    FATE_SERVER_AUTHORITATIVE_V3_PHASE7_BETA_ENABLED:'1',
    FATE_SERVER_AUTHORITATIVE_V3_ENABLED:'0',
    FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED:'0',
    FATE_AUTHORITY_V3_PHASE7_CLIENT_VERSION:'1.39.0-phase7-beta.1',
    FATE_AUTHORITY_V3_PHASE7_BUILD_ID:expectedBuild,
    FATE_AUTHORITY_V3_ALLOW_TEST_MATCHES:'0',
    FATE_AUTHORITY_V3_PHASE7_ALLOW_TEST_IDENTITIES:'0',
    FATE_AUTHORITY_V3_RETAINED_MATCHES:'50',
    FATE_AUTHORITY_V3_DATA_DIR:'/data/authority-v3-phase7'
  })){
    requireEqual(tables.env?.[key], expected, `env.${key}`);
  }
  requireEqual(tables.mounts?.destination, '/data', 'mounts.destination');
  requireEqual(tables.http_service?.internal_port, '8787', 'http_service.internal_port');
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile.authority-v3-phase7-beta'), 'utf8');
  if(!/ENV FATE_SERVER_AUTHORITATIVE_V3_PHASE7_BETA_ENABLED=1/.test(dockerfile)){
    errors.push('Phase 7 Dockerfile must set only its exact entry flag');
  }
  if(/ENV FATE_SERVER_AUTHORITATIVE_V3_ENABLED=1/.test(dockerfile)){
    errors.push('Phase 7 Dockerfile must not pre-enable the generic authority flag');
  }
  if(!/CMD \["node", "server\/authoritative-v3\/phase7-beta-server\.mjs"\]/.test(dockerfile)){
    errors.push('Phase 7 Dockerfile must start the Phase 7 wrapper');
  }
  for(const requiredCopy of [
    'COPY server/fate-card-catalog.js ./server/fate-card-catalog.js',
    'COPY src/scripts/01-data-and-state.js ./src/scripts/01-data-and-state.js'
  ]){
    if(!dockerfile.includes(requiredCopy)) errors.push(`Phase 7 Dockerfile is missing ${requiredCopy}`);
  }
  // The retired client-authoritative deployment has been physically removed.
  // The default app may now name the Phase 7 runtime, while this isolated beta
  // config must still use its own app identity above.
}

const result = {ok:errors.length === 0, configPath, errors};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if(!result.ok) process.exitCode = 1;
