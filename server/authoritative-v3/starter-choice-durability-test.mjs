import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fate-starter-durability-'));
process.env.FATE_FLY_DATA_API_DIR=dir;
const originalFetch=globalThis.fetch;
const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
globalThis.fetch=async()=>({ok:true,headers:new Headers(),json:async()=>({test:publicKey.export({type:'spki',format:'pem'})})});
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
function token(uid){
  const project='fates-entwined-41491';
  const data=`${encode({alg:'RS256',kid:'test'})}.${encode({sub:uid,aud:project,iss:`https://securetoken.google.com/${project}`,exp:Math.floor(Date.now()/1000)+3600})}`;
  return `${data}.${crypto.sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url')}`;
}
let api;
try{
  const {createFlyDataApi}=await import('./fly-data-api.mjs');
  const makeApi=()=>createFlyDataApi({readBody:async req=>req.body,writeJson:(res,status,body)=>Object.assign(res,{status,body})});
  api=makeApi();
  async function request(uid,data,claimStarter=false){
    const output={};
    await api.handle({method:data?'POST':'GET',headers:{authorization:`Bearer ${token(uid)}`},body:{uid,data,claimStarter}},output,new URL('http://test/api/player-save/'+uid));
    assert.equal(output.status,200,JSON.stringify(output.body));return output.body;
  }
  const profile={_fateAccountUid:'A',cardCollectionResetVersion:'20260908a',starterChosen:true,starterDeckId:'starter_a',ownedCards:{'01':2},unopenedPacks:3,_clientUpdatedAt:100,challengerPresets:{chosen:{starter:true,starterId:'starter_a',ids:['01','01']}}};
  await request('A',{profile},true);
  const disk=JSON.parse(fs.readFileSync(path.join(dir,'rooms.json'),'utf8'));
  assert.equal(disk.playerSaves.find(x=>x.uid==='A').data.profile.starterDeckId,'starter_a','acknowledgment must mean written to disk');
  await request('A',{profile:{starterChosen:false,cardCollectionResetVersion:'20260908a',_clientUpdatedAt:999}});
  let result=await request('A');
  assert.equal(result.data.profile.starterDeckId,'starter_a');
  assert.deepEqual(result.data.profile.ownedCards,{'01':2});
  result=await request('A',{profile:{...profile,starterDeckId:'starter_b',unopenedPacks:6,_clientUpdatedAt:1000}},true);
  assert.equal(result.data.profile.starterDeckId,'starter_a');
  assert.equal(result.data.profile.unopenedPacks,3,'second device must not duplicate starter rewards');
  result=await request('A',{profile:{...profile,unopenedPacks:6,_clientUpdatedAt:1001}},true);
  assert.equal(result.data.profile.unopenedPacks,3,'same-choice retry must not duplicate rewards');
  await request('A',{profile:{...profile,unopenedPacks:1,_clientUpdatedAt:1002}});
  assert.equal((await request('A')).data.profile.unopenedPacks,1,'ordinary progression still saves');
  await request('B',{profile:{starterChosen:false}});
  assert.equal((await request('B')).data.profile.starterChosen,false);
  api.flush();api=makeApi();
  assert.equal((await request('A')).data.profile.starterDeckId,'starter_a','fresh client after server restart recovers choice');
  await request('legacy',{profile:{cardCollectionResetVersion:'20260908a',challengerPresets:profile.challengerPresets}});
  assert.equal((await request('legacy')).data.profile.starterDeckId,'starter_a','recover legacy selection from its chosen preset');
  await request('A',{profile:{starterChosen:false,cardCollectionResetVersion:'20261005a'}});
  assert.equal((await request('A')).data.profile.starterChosen,false,'explicit future collection reset remains supported');
  await request('A',{profile});
  assert.equal((await request('A')).data.profile.cardCollectionResetVersion,'20261005a','old device cannot undo collection migration');
  console.log('PASS: starter choice persists before acknowledgment, survives restart, rejects stale saves and duplicate claims, supports legacy recovery and isolates accounts.');
}finally{
  api?.flush();globalThis.fetch=originalFetch;
  assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));
  assert.ok(path.basename(dir).startsWith('fate-starter-durability-'));
  fs.rmSync(dir,{recursive:true,force:true});
}
