#!/usr/bin/env node

if(process.env.FATE_SERVER_AUTHORITATIVE_V3_PHASE7_BETA_ENABLED !== '1'){
  throw new Error(
    'Phase 7 unranked beta is isolated and disabled. '
    + 'Set FATE_SERVER_AUTHORITATIVE_V3_PHASE7_BETA_ENABLED=1 to run this separate server.'
  );
}
if(process.env.FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED === '1'){
  throw new Error('Phase 7 beta cannot share a process with the Phase 6 shadow observer');
}
if(process.env.FATE_SERVER_AUTHORITATIVE_V3_ENABLED === '1'){
  throw new Error(
    'Phase 7 beta owns its authority route; do not pre-enable '
    + 'FATE_SERVER_AUTHORITATIVE_V3_ENABLED'
  );
}
if(!String(process.env.FATE_AUTHORITY_V3_PHASE7_CLIENT_VERSION || '').trim()){
  throw new Error('FATE_AUTHORITY_V3_PHASE7_CLIENT_VERSION is required');
}
if(!String(process.env.FATE_AUTHORITY_V3_PHASE7_BUILD_ID || '').trim()){
  throw new Error('FATE_AUTHORITY_V3_PHASE7_BUILD_ID is required');
}

process.env.FATE_SERVER_AUTHORITATIVE_V3_ENABLED = '1';
process.env.FATE_AUTHORITY_V3_BETA_MODE = 'unranked';

await import('./server.mjs');
