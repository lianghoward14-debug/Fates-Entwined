#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRECT_FILES = [
  '.dockerignore',
  'Dockerfile.authority-v3-phase7-beta',
  'index.html',
  'server/fate-card-catalog.js',
  'src/scripts/18-online-rooms.js',
  'src/scripts/01-data-and-state.js',
  'src/scripts/authoritative-v3-phase7-beta-client.mjs',
  'src/scripts/authoritative-v3-single-player-screen.mjs'
];

function normalize(value){
  return String(value).replaceAll('\\', '/');
}

function collect(directory){
  return fs.readdirSync(directory, {withFileTypes:true}).flatMap(entry=>{
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? collect(target) : (entry.isFile() ? [target] : []);
  });
}

export function digestPhase7SourceEntries(entries){
  const hash = createHash('sha256');
  for(const entry of [...entries].sort((a, b)=>a.relativePath.localeCompare(b.relativePath))){
    const bytes = Buffer.isBuffer(entry.bytes) ? entry.bytes : Buffer.from(entry.bytes);
    hash.update(normalize(entry.relativePath));
    hash.update('\0');
    hash.update(String(bytes.length));
    hash.update('\0');
    hash.update(bytes);
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function buildPhase7SourceIdentity(workspaceRoot = root){
  const resolvedRoot = path.resolve(workspaceRoot);
  const serverFiles = collect(path.join(resolvedRoot, 'server', 'authoritative-v3'))
    .filter(filePath=>{
      const name = path.basename(filePath);
      return /\.(?:mjs|json)$/i.test(name)
        && !/(?:smoke|test|harness|soak)/i.test(name)
        && !/^phase6-/i.test(name);
    });
  const sharedFiles = collect(path.join(resolvedRoot, 'shared'))
    .filter(filePath=>/\.(?:mjs|json)$/i.test(filePath));
  const files = [
    ...DIRECT_FILES.map(relative=>path.join(resolvedRoot, relative)),
    ...serverFiles,
    ...sharedFiles
  ];
  const missing = files.filter(filePath=>!fs.existsSync(filePath));
  if(missing.length) throw new Error(`Phase 7 runtime source is incomplete: ${missing.join(', ')}`);
  const entries = files.map(filePath=>({
    relativePath:normalize(path.relative(resolvedRoot, filePath)),
    bytes:fs.readFileSync(filePath)
  }));
  const sourceDigest = digestPhase7SourceEntries(entries);
  return {
    format:'fates-authority-v3-phase7-source-identity-v1',
    buildId:`phase7-${sourceDigest}`,
    sourceDigest,
    fileCount:entries.length,
    files:entries.map(entry=>entry.relativePath).sort()
  };
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
if(invoked && invoked === fileURLToPath(import.meta.url)){
  const identity = buildPhase7SourceIdentity(root);
  process.stdout.write(process.argv.includes('--value-only')
    ? `${identity.buildId}\n`
    : `${JSON.stringify(identity, null, 2)}\n`);
}
