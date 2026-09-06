const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const tests=[
  'warfront-sync-race-regression-test.cjs',
  'warfront-result-recovery-regression-test.cjs',
  'warfront-auth-recovery-regression-test.cjs',
  'authoritative-v3/warfront-map-reset-regression-test.mjs',
  'warfront-routing-regression-test.cjs',
  'warfront-queue-recovery-regression-test.cjs',
  'authoritative-v3/warfront-queue-entry-regression-test.mjs',
  'warfront-deployment-regression-test.cjs',
  'warfront-ui-regression-test.cjs',
  'warfront-replay-regression-test.cjs',
  'warfront-clock-regression-test.cjs',
  'authoritative-v3/warfront-two-client-regression-test.mjs',
  'authoritative-v3/warfront-state-sync-smoke-test.mjs',
  'authoritative-v3/warfront-forfeit-regression-test.mjs',
  'authoritative-v3/warfront-ai-takeover-smoke-test.mjs'
];
for(const test of tests){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'warfront-suite-'));
  try{
    const result=spawnSync(process.execPath,[path.join(__dirname,test)],{stdio:'inherit',env:{...process.env,FATE_FLY_DATA_API_DIR:dir}});
    if(result.status!==0)process.exitCode=1;
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
  if(process.exitCode)break;
}
if(!process.exitCode)console.log(`All ${tests.length} Warfront regression suites passed.`);
