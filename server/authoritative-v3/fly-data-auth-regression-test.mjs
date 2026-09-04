import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

// Isolated storage and a local signing key: never use production data or credentials.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fate-auth-regression-'));
process.env.FATE_FLY_DATA_API_DIR = dataDir;
const originalFetch = globalThis.fetch;
const {privateKey, publicKey} = crypto.generateKeyPairSync('rsa', {modulusLength:2048});
globalThis.fetch = async () => ({
  ok:true, headers:new Headers({'cache-control':'max-age=3600'}),
  json:async () => ({regression:publicKey.export({type:'spki',format:'pem'})})
});
try {
  const {createFlyDataApi} = await import('./fly-data-api.mjs');
  let response;
  const api = createFlyDataApi({
    readBody:async req => req.body,
    writeJson:(_res,status,body) => { response = {status,body}; }
  });
  async function request(method, token, uid='local-fabricated') {
    response = null;
    await api.handle({method,headers:{authorization:token ? `Bearer ${token}` : ''},body:{uid,state:{}}}, {}, new URL('http://localhost/api/warfront/state'));
    return response;
  }
  for (const token of ['', 'session:fabricated', 'session:another-user', 'invalid']) {
    for (const method of ['GET','POST']) {
      assert.equal((await request(method,token)).status,401,`${method} must reject ${token || 'missing token'}`);
    }
  }
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const project = process.env.FATE_FIREBASE_PROJECT_ID || 'fates-entwined-41491';
  const input = `${encode({alg:'RS256',kid:'regression'})}.${encode({sub:'verified-user',aud:project,iss:`https://securetoken.google.com/${project}`,exp:Math.floor(Date.now()/1000)+3600})}`;
  const token = `${input}.${crypto.sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url')}`;
  assert.equal((await request('GET',token)).status,200,'verified signed identity remains accepted');
  assert.equal((await request('POST',token,'another-user')).status,403,'verified identity cannot claim another UID');
  const forged = `${input}.${Buffer.alloc(256).toString('base64url')}`;
  assert.equal((await request('GET',forged)).status,401,'invalid signature must be rejected');
  assert.equal((await request('GET','session:fabricated')).status,401,'session identity must remain rejected after authenticated requests');
  console.log('Fly data authentication regression test passed');
} finally {
  globalThis.fetch = originalFetch;
  // Only remove the dedicated temporary directory created by this test.
  fs.rmSync(dataDir,{recursive:true,force:true});
}
