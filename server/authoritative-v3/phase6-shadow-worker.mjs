#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Phase6ShadowComparator} from './phase6-shadow-core.mjs';

const SHADOW_FLAG = 'FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED';
const AUTHORITY_FLAG = 'FATE_SERVER_AUTHORITATIVE_V3_ENABLED';
const INPUT_ENV = 'FATE_SERVER_AUTHORITATIVE_V3_SHADOW_INPUT';
const OUTPUT_ENV = 'FATE_SERVER_AUTHORITATIVE_V3_SHADOW_REPORT_PATH';

function exactFlagEnabled(name){
  return process.env[name] === '1';
}

function resolvePaths(){
  const dataDir = String(process.env.FATE_WS_DATA_DIR || '').trim();
  const input = String(process.env[INPUT_ENV] || (dataDir ? path.join(dataDir, 'events.jsonl') : '')).trim();
  const output = String(
    process.env[OUTPUT_ENV]
    || (dataDir ? path.join(dataDir, 'authority-v3-shadow-comparisons.jsonl') : '')
  ).trim();
  if(!input) throw new Error(`${INPUT_ENV} or FATE_WS_DATA_DIR is required`);
  if(!output) throw new Error(`${OUTPUT_ENV} or FATE_WS_DATA_DIR is required`);
  const resolvedInput = path.resolve(input);
  const resolvedOutput = path.resolve(output);
  if(resolvedInput === resolvedOutput) throw new Error('shadow input and report paths must be different');
  return {input:resolvedInput, output:resolvedOutput};
}

export function assertShadowWorkerIsolation(){
  if(!exactFlagEnabled(SHADOW_FLAG)){
    throw new Error(`Phase 6 shadow worker is disabled; set ${SHADOW_FLAG}=1 exactly`);
  }
  if(exactFlagEnabled(AUTHORITY_FLAG)){
    throw new Error(`Phase 6 shadow worker refuses to run while ${AUTHORITY_FLAG}=1`);
  }
  const buildId = String(
    process.env.FATE_SERVER_AUTHORITATIVE_V3_SHADOW_BUILD_ID || ''
  ).trim();
  if(!buildId || /replace|placeholder|example|your[-_ ]/i.test(buildId)){
    throw new Error(
      'Phase 6 shadow worker requires an explicit immutable '
      + 'FATE_SERVER_AUTHORITATIVE_V3_SHADOW_BUILD_ID'
    );
  }
}

export function processShadowFileOnce({input, output}){
  const comparator = new Phase6ShadowComparator({
    buildId:process.env.FATE_SERVER_AUTHORITATIVE_V3_SHADOW_BUILD_ID
  });
  const source = fs.existsSync(input) ? fs.readFileSync(input, 'utf8') : '';
  const records = [];
  for(const line of source.split(/\r?\n/)){
    if(!line.trim()) continue;
    let parsed;
    try{
      parsed = JSON.parse(line);
    }catch(error){
      records.push({
        format:'fates-authority-v3-shadow-comparison-v1',
        observedAt:new Date().toISOString(),
        status:'invalid-input',
        reason:String(error?.message || error),
        legacyHash:'',
        engineHash:'',
        firstDifferingStatePath:null
      });
      continue;
    }
    const result = comparator.processRecord(parsed);
    if(result) records.push(result);
  }
  if(records.length){
    fs.mkdirSync(path.dirname(output), {recursive:true});
    fs.appendFileSync(output, records.map(record=>JSON.stringify(record)).join('\n') + '\n');
  }
  return records;
}

async function followShadowFile({input, output}){
  const comparator = new Phase6ShadowComparator({
    buildId:process.env.FATE_SERVER_AUTHORITATIVE_V3_SHADOW_BUILD_ID
  });
  let offset = 0;
  let remainder = '';
  let running = false;
  const pollMs = Math.max(
    100,
    Math.min(10000, Number(process.env.FATE_SERVER_AUTHORITATIVE_V3_SHADOW_POLL_MS || 1000) || 1000)
  );

  async function poll(){
    if(running || !fs.existsSync(input)) return;
    running = true;
    try{
      const size = fs.statSync(input).size;
      if(size < offset){
        offset = 0;
        remainder = '';
      }
      if(size === offset) return;
      const length = size - offset;
      const descriptor = fs.openSync(input, 'r');
      const buffer = Buffer.alloc(length);
      try{
        fs.readSync(descriptor, buffer, 0, length, offset);
      }finally{
        fs.closeSync(descriptor);
      }
      offset = size;
      const chunks = (remainder + buffer.toString('utf8')).split(/\r?\n/);
      remainder = chunks.pop() || '';
      const outputRecords = [];
      for(const line of chunks){
        if(!line.trim()) continue;
        try{
          const result = comparator.processRecord(JSON.parse(line));
          if(result) outputRecords.push(result);
        }catch(error){
          outputRecords.push({
            format:'fates-authority-v3-shadow-comparison-v1',
            observedAt:new Date().toISOString(),
            status:'invalid-input',
            reason:String(error?.message || error),
            legacyHash:'',
            engineHash:'',
            firstDifferingStatePath:null
          });
        }
      }
      if(outputRecords.length){
        fs.mkdirSync(path.dirname(output), {recursive:true});
        fs.appendFileSync(output, outputRecords.map(record=>JSON.stringify(record)).join('\n') + '\n');
      }
    }finally{
      running = false;
    }
  }

  await poll();
  const timer = setInterval(()=>poll().catch(error=>{
    process.stderr.write(`Phase 6 shadow poll failed: ${String(error?.message || error)}\n`);
  }), pollMs);
  process.stdout.write(
    `Phase 6 v3 shadow worker observing ${input}; reports ${output}; poll ${pollMs}ms\n`
  );
  await new Promise(resolve=>{
    const stop = ()=>{
      clearInterval(timer);
      resolve();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
}

async function main(){
  assertShadowWorkerIsolation();
  const paths = resolvePaths();
  if(process.argv.includes('--once')){
    const records = processShadowFileOnce(paths);
    process.stdout.write(JSON.stringify({
      ok:true,
      input:paths.input,
      output:paths.output,
      records:records.length,
      statusCounts:records.reduce((counts, record)=>{
        counts[record.status] = (counts[record.status] || 0) + 1;
        return counts;
      }, {})
    }, null, 2) + '\n');
    return;
  }
  await followShadowFile(paths);
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
if(invoked && invoked === fileURLToPath(import.meta.url)){
  main().catch(error=>{
    process.stderr.write(`Phase 6 shadow worker failed: ${String(error?.message || error)}\n`);
    process.exitCode = 1;
  });
}
