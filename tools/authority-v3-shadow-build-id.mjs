#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNTIME_FILES = [
  '.dockerignore',
  'Dockerfile.authority-v3-shadow',
  'tools/authority-v3-differential-replay.mjs',
  'tools/authority-v3-legacy-normalization.mjs'
];
const RUNTIME_DIRECTORIES = [
  'server',
  'shared'
];

function normalizedRelative(filePath){
  return String(filePath).replaceAll('\\', '/');
}

function collectFiles(directory){
  const files = [];
  for(const entry of fs.readdirSync(directory, {withFileTypes:true})){
    const target = path.join(directory, entry.name);
    if(entry.isDirectory()){
      files.push(...collectFiles(target));
    }else if(entry.isFile()){
      files.push(target);
    }
  }
  return files;
}

function isRuntimeSource(workspaceRoot, filePath){
  const relativePath = normalizedRelative(path.relative(workspaceRoot, filePath));
  if(!/\.(?:js|mjs|json)$/i.test(relativePath)) return false;
  if(relativePath.startsWith('server/authoritative-v3/')){
    return [
      'server/authoritative-v3/phase6-shadow-core.mjs',
      'server/authoritative-v3/phase6-shadow-supervisor.mjs',
      'server/authoritative-v3/phase6-shadow-worker.mjs'
    ].includes(relativePath);
  }
  return !/(?:^|\/)[^/]*(?:smoke|test|harness)[^/]*$/i.test(relativePath);
}

export function digestShadowSourceEntries(entries){
  const hash = createHash('sha256');
  const normalized = entries.map(entry=>({
    relativePath:normalizedRelative(entry.relativePath),
    bytes:Buffer.isBuffer(entry.bytes) ? entry.bytes : Buffer.from(entry.bytes)
  })).sort((left, right)=>left.relativePath.localeCompare(right.relativePath));
  for(const entry of normalized){
    hash.update(entry.relativePath);
    hash.update('\0');
    hash.update(String(entry.bytes.length));
    hash.update('\0');
    hash.update(entry.bytes);
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function buildShadowSourceIdentity(workspaceRoot = root){
  const resolvedRoot = path.resolve(workspaceRoot);
  const absoluteFiles = [
    ...RUNTIME_FILES.map(relativePath=>path.join(resolvedRoot, relativePath)),
    ...RUNTIME_DIRECTORIES.flatMap(relativePath=>
      collectFiles(path.join(resolvedRoot, relativePath))
        .filter(filePath=>isRuntimeSource(resolvedRoot, filePath))
    )
  ];
  const missing = absoluteFiles.filter(filePath=>!fs.existsSync(filePath));
  if(missing.length){
    throw new Error(
      `shadow runtime source is incomplete: ${missing.map(filePath=>
        normalizedRelative(path.relative(resolvedRoot, filePath))
      ).join(', ')}`
    );
  }
  const entries = absoluteFiles.map(filePath=>({
    relativePath:normalizedRelative(path.relative(resolvedRoot, filePath)),
    bytes:fs.readFileSync(filePath)
  }));
  const sourceDigest = digestShadowSourceEntries(entries);
  return {
    format:'fates-authority-v3-shadow-source-identity-v1',
    buildId:`phase6-${sourceDigest}`,
    sourceDigest,
    fileCount:entries.length,
    files:entries.map(entry=>entry.relativePath).sort()
  };
}

function main(){
  const identity = buildShadowSourceIdentity(root);
  if(process.argv.includes('--value-only')){
    process.stdout.write(identity.buildId + '\n');
  }else{
    process.stdout.write(JSON.stringify(identity, null, 2) + '\n');
  }
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
if(invoked && invoked === fileURLToPath(import.meta.url)) main();
