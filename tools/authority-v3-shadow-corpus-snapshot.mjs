#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const prefix = 'phase6-real-corpus-v1:';

function sha256(bytes){
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function parseJsonl(filePath){
  const bytes = fs.readFileSync(filePath);
  const records = [];
  for(const [lineIndex, line] of bytes.toString('utf8').split(/\r?\n/).entries()){
    if(!line.trim()) continue;
    try{
      records.push(JSON.parse(line));
    }catch(error){
      throw new Error(`${filePath}:${lineIndex + 1} is not valid JSON: ${error.message}`);
    }
  }
  return {bytes, records};
}

function option(name){
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : '';
  if(!value) throw new Error(`${name} is required`);
  return path.resolve(value);
}

function corpusIndex(record){
  const clientActionId = String(
    record?.command?.clientActionId
    || record?.accepted?.action?.clientActionId
    || ''
  );
  const match = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+):action$`).exec(clientActionId);
  return match ? Number(match[1]) : null;
}

const comparisonPath = option('--comparisons');
const acceptedPath = option('--accepted-log');
const outputDir = option('--output-dir');
const comparisonInput = parseJsonl(comparisonPath);
const acceptedInput = parseJsonl(acceptedPath);

const comparisonByIndex = new Map();
for(const record of comparisonInput.records){
  const index = corpusIndex(record);
  if(index === null) continue;
  comparisonByIndex.set(index, record);
}

const missingIndices = Array.from({length:180}, (_, index)=>index)
  .filter(index=>!comparisonByIndex.has(index));
if(missingIndices.length){
  throw new Error(`comparison log is missing corpus indices: ${missingIndices.join(', ')}`);
}

const comparisons = Array.from({length:180}, (_, index)=>comparisonByIndex.get(index));
const acceptedByIdentity = new Map();
for(const record of acceptedInput.records){
  const index = corpusIndex(record);
  if(index === null) continue;
  const roomCode = String(record?.code || record?.accepted?.roomCode || '').toUpperCase();
  const sequence = Number(record?.accepted?.action?.seq || 0) || 0;
  const key = `${index}:${roomCode}:${sequence}`;
  acceptedByIdentity.set(key, record);
}

const accepted = comparisons.map((comparison, index)=>{
  const roomCode = String(comparison?.roomCode || '').toUpperCase();
  const sequence = Number(comparison?.sequence || 0) || 0;
  const record = acceptedByIdentity.get(`${index}:${roomCode}:${sequence}`);
  if(!record){
    throw new Error(`accepted log is missing corpus index ${index} at ${roomCode}:${sequence}`);
  }
  return record;
});

const comparisonBytes = Buffer.from(comparisons.map(record=>JSON.stringify(record)).join('\n') + '\n');
const acceptedBytes = Buffer.from(accepted.map(record=>JSON.stringify(record)).join('\n') + '\n');
const statuses = {};
for(const record of comparisons){
  const status = String(record?.status || 'unknown');
  statuses[status] = (statuses[status] || 0) + 1;
}

fs.mkdirSync(outputDir, {recursive:true});
const comparisonOutput = path.join(outputDir, 'authority-v3-shadow-corpus-comparisons.jsonl');
const acceptedOutput = path.join(outputDir, 'authority-v3-shadow-corpus-accepted.jsonl');
const manifestOutput = path.join(outputDir, 'authority-v3-shadow-corpus-snapshot.json');
const manifest = {
  format:'fates-authority-v3-shadow-corpus-snapshot-v1',
  createdAt:new Date().toISOString(),
  selector:{
    clientActionIdPrefix:prefix,
    oneLatestRecordPerCorpusIndex:true,
    firstIndex:0,
    lastIndex:179
  },
  records:comparisons.length,
  statuses,
  inputs:{
    comparisons:{path:comparisonPath, sizeBytes:comparisonInput.bytes.length, sha256:sha256(comparisonInput.bytes)},
    acceptedLog:{path:acceptedPath, sizeBytes:acceptedInput.bytes.length, sha256:sha256(acceptedInput.bytes)}
  },
  outputs:{
    comparisons:{path:comparisonOutput, sizeBytes:comparisonBytes.length, sha256:sha256(comparisonBytes)},
    acceptedLog:{path:acceptedOutput, sizeBytes:acceptedBytes.length, sha256:sha256(acceptedBytes)}
  }
};

fs.writeFileSync(comparisonOutput, comparisonBytes, {flag:'wx'});
fs.writeFileSync(acceptedOutput, acceptedBytes, {flag:'wx'});
fs.writeFileSync(manifestOutput, JSON.stringify(manifest, null, 2) + '\n', {flag:'wx'});
console.log(JSON.stringify(manifest, null, 2));
