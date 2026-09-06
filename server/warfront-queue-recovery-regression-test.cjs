const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/scripts/authoritative-v3-phase7-beta-client.mjs','utf8');
const recovery=source.slice(source.indexOf('  const recoverableRequest ='),source.indexOf('  let result = await recoverableRequest'));
async function run(statuses){
  let calls=0;const messages=[];
  const context={cancelled:()=>false,onStatus:s=>messages.push(s),setTimeout:fn=>fn(),console};
  vm.createContext(context);vm.runInContext(recovery+'\nglobalThis.recover=recoverableRequest;',context);
  const request=()=>{const status=statuses[Math.min(calls++,statuses.length-1)];if(status)throw Object.assign(new Error('server detail'),{status});return {status:'waiting'};};
  try{return {result:await context.recover(request),calls,messages};}catch(error){return {error,calls,messages};}
}
(async()=>{
  for(const status of [400,401,403,404,426]){const r=await run([status]);assert.equal(r.calls,1);assert.equal(r.error.message,'server detail');}
  const temporary=await run([503,503,0]);assert.equal(temporary.calls,3);assert.equal(temporary.result.status,'waiting');assert.equal(temporary.messages.length,2);
  const persistent=await run([503]);assert.equal(persistent.calls,6);assert.match(persistent.error.message,/server detail/);assert.match(persistent.error.message,/Please try again/);
  console.log('Queue recovery retries transient failures, surfaces authentication errors and bounds persistent failures');
})().catch(error=>{console.error(error);process.exitCode=1;});
