#!/usr/bin/env node
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const SHADOW_FLAG = 'FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED';
const AUTHORITY_FLAG = 'FATE_SERVER_AUTHORITATIVE_V3_ENABLED';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const legacyPath = path.join(root, 'server', 'fate-ws-authority.js');
const shadowPath = path.join(root, 'server', 'authoritative-v3', 'phase6-shadow-worker.mjs');

function assertSupervisorIsolation(){
  if(process.env[SHADOW_FLAG] !== '1'){
    throw new Error(`Phase 6 shadow supervisor is disabled; set ${SHADOW_FLAG}=1 exactly`);
  }
  if(process.env[AUTHORITY_FLAG] === '1'){
    throw new Error(`Phase 6 shadow supervisor refuses to run while ${AUTHORITY_FLAG}=1`);
  }
}

function terminate(child, signal){
  if(!child || child.exitCode !== null || child.signalCode) return;
  try{ child.kill(signal); }catch{}
}

async function main(){
  assertSupervisorIsolation();
  const legacy = spawn(process.execPath, [legacyPath], {
    cwd:root,
    env:process.env,
    stdio:'inherit'
  });
  const shadow = spawn(process.execPath, [shadowPath], {
    cwd:root,
    env:process.env,
    stdio:'inherit'
  });
  let stopping = false;
  let shadowEnded = false;

  shadow.once('error', error=>{
    shadowEnded = true;
    process.stderr.write(
      `Phase 6 shadow observer failed to start; legacy authority remains active: `
      + `${String(error?.message || error)}\n`
    );
  });
  shadow.once('exit', (code, signal)=>{
    shadowEnded = true;
    if(stopping) return;
    process.stderr.write(
      `Phase 6 shadow observer stopped (code=${String(code)}, signal=${String(signal)}); `
      + `legacy authority remains active\n`
    );
  });
  legacy.once('error', error=>{
    process.stderr.write(`Legacy authority failed to start: ${String(error?.message || error)}\n`);
    terminate(shadow, 'SIGTERM');
    process.exitCode = 1;
  });

  const forwardSignal = signal=>{
    if(stopping) return;
    stopping = true;
    terminate(shadow, signal);
    terminate(legacy, signal);
  };
  process.once('SIGTERM', ()=>forwardSignal('SIGTERM'));
  process.once('SIGINT', ()=>forwardSignal('SIGINT'));

  const legacyExit = await new Promise(resolve=>{
    legacy.once('exit', (code, signal)=>resolve({code, signal}));
  });
  stopping = true;
  if(!shadowEnded) terminate(shadow, 'SIGTERM');
  if(legacyExit.signal){
    process.stderr.write(`Legacy authority stopped by ${legacyExit.signal}\n`);
  }
  process.exitCode = Number.isInteger(legacyExit.code) ? legacyExit.code : 0;
}

main().catch(error=>{
  process.stderr.write(`Phase 6 shadow supervisor failed: ${String(error?.message || error)}\n`);
  process.exitCode = 1;
});
