const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/scripts/15-online-auth.js','utf8');
const fn=source.slice(source.indexOf('async function flyApiRequest('),source.indexOf('// Compatibility shims'));
(async()=>{
  let url,init;
  const c={auth:{currentUser:{getIdToken:async()=> 'test-token'}},safe:String,identity:'test',window:{},authorityHttpBaseUrl:()=> 'https://old-test-server.invalid',fetch:async(u,i)=>{url=u;init=i;return {ok:true,json:async()=>({ok:true})};}};
  vm.createContext(c);vm.runInContext(fn,c);
  await c.flyApiRequest('/api/warfront/state');
  assert.equal(url,'https://fates-entwined-main.fly.dev/api/warfront/state');assert.equal(init.cache,'no-store');
  c.window.fateAuthorityV3Beta={apiBaseUrl:'http://127.0.0.1:8787'};
  const signal=new AbortController().signal;
  await c.flyApiRequest('/api/warfront/deploy',{method:'POST',signal,body:{uid:'test'}});
  assert.equal(url,'http://127.0.0.1:8787/api/warfront/deploy');assert.equal(init.signal,signal);
  await c.flyApiRequest('/api/profiles/test');assert.equal(url,'https://old-test-server.invalid/api/profiles/test');
  console.log('Warfront canonical authority, explicit isolated test authority, cache and cancellation routing passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
