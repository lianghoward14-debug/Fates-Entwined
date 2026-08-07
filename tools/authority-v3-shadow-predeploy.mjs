#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  buildShadowSourceIdentity
} from './authority-v3-shadow-build-id.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CONFIG = path.join(root, 'fly.toml');
const SHADOW_DOCKERFILE = 'Dockerfile.authority-v3-shadow';
const SHADOW_PROCESS = 'node server/authoritative-v3/phase6-shadow-supervisor.mjs';

function parseValue(raw){
  const value = String(raw || '').trim();
  const quoted = value.match(/^(['"])([\s\S]*)\1$/);
  return quoted ? quoted[2] : value;
}

export function parseDeploymentToml(text){
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

function requiredEqual(actual, expected, label, errors){
  if(String(actual ?? '') !== String(expected)){
    errors.push(`${label} must be ${JSON.stringify(String(expected))}`);
  }
}

function nonPlaceholder(value){
  const normalized = String(value || '').trim();
  return normalized
    && !/replace|placeholder|example|your[-_ ]/i.test(normalized);
}

export function validateShadowDeploymentText(configText, options = {}){
  const configPath = String(options.configPath || '');
  const resolvedConfig = path.resolve(configPath || '');
  const defaultConfig = path.resolve(options.defaultConfigPath || DEFAULT_CONFIG);
  const workspaceRoot = path.resolve(options.root || root);
  const errors = [];
  if(!configPath) errors.push('a separate shadow Fly config path is required');
  if(resolvedConfig === defaultConfig){
    errors.push('the default fly.toml is legacy-only and cannot be used for the Phase 6 shadow soak');
  }
  const parsed = parseDeploymentToml(configText);
  const {tables} = parsed;
  if(parsed.duplicateKeys.length){
    errors.push(`duplicate deployment keys are not allowed: ${parsed.duplicateKeys.join(', ')}`);
  }

  let defaultParsed = {tables:{root:{}, mounts:{}}};
  if(options.defaultConfigText !== undefined){
    defaultParsed = parseDeploymentToml(options.defaultConfigText);
  }else if(fs.existsSync(defaultConfig)){
    defaultParsed = parseDeploymentToml(fs.readFileSync(defaultConfig, 'utf8'));
  }
  const app = String(tables.root?.app || '');
  const defaultApp = String(defaultParsed.tables.root?.app || '');
  const volume = String(tables.mounts?.source || '');
  const defaultVolume = String(defaultParsed.tables.mounts?.source || '');
  if(!nonPlaceholder(app)) errors.push('shadow app must be an explicit non-placeholder app name');
  if(app && defaultApp && app === defaultApp){
    errors.push('shadow soak app must be separate from the default legacy app');
  }
  if(!nonPlaceholder(volume)) errors.push('shadow volume must be an explicit non-placeholder volume name');
  if(volume && defaultVolume && volume === defaultVolume){
    errors.push('shadow soak volume must be separate from the default legacy volume');
  }

  requiredEqual(tables.build?.dockerfile, SHADOW_DOCKERFILE, 'build.dockerfile', errors);
  requiredEqual(tables.processes?.app, SHADOW_PROCESS, 'processes.app', errors);
  const requiredEnv = {
    FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED:'1',
    FATE_SERVER_AUTHORITATIVE_V3_ENABLED:'0',
    FATE_WS_FLY_STORE:'1',
    FATE_WS_REQUIRE_FLY_STORE:'1',
    FATE_WS_APPEND_EVENT_LOG:'1',
    FATE_WS_REQUIRE_TOKEN:'1',
    FATE_WS_DISABLE_FIREBASE_RTDB:'1',
    FATE_RTDB_DISABLED:'1',
    FATE_WS_STATE_GATE:'1',
    FATE_WS_REDUCER_MODE:'client-resolved',
    FATE_WS_GAMEPLAY_AUTHORITY:'client-resolved'
  };
  for(const [key, expected] of Object.entries(requiredEnv)){
    requiredEqual(tables.env?.[key], expected, `env.${key}`, errors);
  }
  const buildId = String(tables.env?.FATE_SERVER_AUTHORITATIVE_V3_SHADOW_BUILD_ID || '');
  if(!nonPlaceholder(buildId)){
    errors.push(
      'env.FATE_SERVER_AUTHORITATIVE_V3_SHADOW_BUILD_ID must be an explicit immutable build identifier'
    );
  }
  if(options.expectedBuildId
    && buildId !== String(options.expectedBuildId)){
    errors.push(
      `env.FATE_SERVER_AUTHORITATIVE_V3_SHADOW_BUILD_ID must match current source build `
      + `${JSON.stringify(String(options.expectedBuildId))}`
    );
  }
  requiredEqual(tables.mounts?.destination, '/data', 'mounts.destination', errors);
  const dataDir = String(tables.env?.FATE_WS_DATA_DIR || '');
  if(!dataDir.startsWith('/data/')){
    errors.push('env.FATE_WS_DATA_DIR must be below the separate /data volume mount');
  }

  const dockerfilePath = path.join(workspaceRoot, SHADOW_DOCKERFILE);
  if(options.dockerfileText !== undefined){
    const dockerfile = String(options.dockerfileText);
    if(!/ENV FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED=1/.test(dockerfile)){
      errors.push(`${SHADOW_DOCKERFILE} must set the exact shadow flag`);
    }
    if(!/CMD \["node", "server\/authoritative-v3\/phase6-shadow-supervisor\.mjs"\]/.test(dockerfile)){
      errors.push(`${SHADOW_DOCKERFILE} must start only the Phase 6 shadow supervisor`);
    }
  }else if(!fs.existsSync(dockerfilePath)){
    errors.push(`${SHADOW_DOCKERFILE} is missing`);
  }else{
    const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');
    if(!/ENV FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED=1/.test(dockerfile)){
      errors.push(`${SHADOW_DOCKERFILE} must set the exact shadow flag`);
    }
    if(!/CMD \["node", "server\/authoritative-v3\/phase6-shadow-supervisor\.mjs"\]/.test(dockerfile)){
      errors.push(`${SHADOW_DOCKERFILE} must start only the Phase 6 shadow supervisor`);
    }
  }
  const dockerignorePath = path.join(workspaceRoot, '.dockerignore');
  const dockerignore = options.dockerignoreText !== undefined
    ? String(options.dockerignoreText)
    : (fs.existsSync(dockerignorePath)
      ? fs.readFileSync(dockerignorePath, 'utf8')
      : '');
  for(const requiredInclude of [
    '!Dockerfile.authority-v3-shadow',
    '!shared/',
    '!shared/**',
    '!tools/',
    '!tools/**'
  ]){
    if(!dockerignore.split(/\r?\n/).includes(requiredInclude)){
      errors.push(`.dockerignore must include ${requiredInclude}`);
    }
  }

  return {
    ok:errors.length === 0,
    configPath:resolvedConfig,
    defaultConfigPath:defaultConfig,
    app,
    defaultApp,
    volume,
    defaultVolume,
    buildId,
    dockerfile:String(tables.build?.dockerfile || ''),
    process:String(tables.processes?.app || ''),
    errors
  };
}

export function validateShadowDeploymentConfig(configPath, options = {}){
  const resolvedConfig = path.resolve(configPath || '');
  if(!configPath || !fs.existsSync(resolvedConfig)){
    return {
      ok:false,
      configPath:resolvedConfig,
      errors:[
        !configPath
          ? 'a separate shadow Fly config path is required'
          : `shadow Fly config does not exist: ${resolvedConfig}`
      ]
    };
  }
  return validateShadowDeploymentText(fs.readFileSync(resolvedConfig, 'utf8'), {
    ...options,
    configPath:resolvedConfig
  });
}

function main(){
  const configPath = process.argv.slice(2).find(argument=>!argument.startsWith('--'));
  const result = validateShadowDeploymentConfig(configPath, {
    expectedBuildId:buildShadowSourceIdentity(root).buildId
  });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if(!result.ok) process.exitCode = 1;
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
if(invoked && invoked === fileURLToPath(import.meta.url)) main();
