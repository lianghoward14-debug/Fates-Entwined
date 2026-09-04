import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(),'fate-auth-test-'));
process.env.FATE_FLY_DATA_API_DIR = dataDir;
const originalFetch = globalThis.fetch;
const {privateKey,publicKey} = crypto.generateKeyPairSync('rsa',{modulusLength:2048});
globalThis.fetch = async () => ({ok:true,headers:new Headers({'cache-control':'max-age=3600'}),json:async()=>({test:publicKey.export({type:'spki',format:'pem'})})});
try {
  const target = path.resolve(process.argv[2] || 'server/authoritative-v3/fly-data-api.mjs');
  const {createFlyDataApi} = await import(pathToFileURL(target));
  let response;
  const api = createFlyDataApi({readBody:async req=>req.body,writeJson:(_res,status,body)=>{response={status,body};}});
  async function request(route,method,token,uid='local-fabricated') {
    response = null;
    const handled = await api.handle({method,headers:{authorization:token ? `Bearer ${token}` : ''},body:{uid,state:{}}},{},new URL(`http://localhost${route}?uid=${uid}`));
    assert.equal(handled,true,`${method} ${route} must exist`);
    return response;
  }
  const routes = [['/api/social/state','GET'],['/api/challenger-results','POST']];
  if(process.argv.includes('--warfront')) routes.push(['/api/warfront/state','GET'],['/api/warfront/state','POST']);
  for(const [route,method] of routes) for(const token of ['', 'session:fabricated','session:another-user','invalid']) {
    assert.equal((await request(route,method,token)).status,401,`${method} ${route} must reject fabricated or missing credentials`);
  }
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const project=process.env.FATE_FIREBASE_PROJECT_ID || 'fates-entwined-41491';
  const unsigned=`${encode({alg:'RS256',kid:'test'})}.${encode({sub:'verified-user',aud:project,iss:`https://securetoken.google.com/${project}`,exp:Math.floor(Date.now()/1000)+3600})}`;
  const token=`${unsigned}.${crypto.sign('RSA-SHA256',Buffer.from(unsigned),privateKey).toString('base64url')}`;
  assert.equal((await request('/api/social/state','GET',token,'verified-user')).status,200);
  assert.equal((await request('/api/social/state','GET',token,'someone-else')).status,403);
  assert.equal((await request('/api/social/state','GET',`${unsigned}.${Buffer.alloc(256).toString('base64url')}`)).status,401);
  console.log('Authentication regression passed: fabricated tokens rejected, signed identity accepted, UID mismatch rejected');
} finally {
  globalThis.fetch=originalFetch;
  fs.rmSync(dataDir,{recursive:true,force:true});
}
