import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fate-preset-durability-'));
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
  async function request(uid,data){
    const output={};
    await api.handle({method:data?'POST':'GET',headers:{authorization:`Bearer ${token(uid)}`},body:{uid,data}},output,new URL('http://test/api/player-save/'+uid));
    assert.equal(output.status,200,JSON.stringify(output.body));return output.body;
  }
  const deck=(name,time)=>({name,ids:Array(40).fill('01'),_presetUpdatedAt:time});
  await request('A',{presets:{one:deck('one',10),two:deck('two',10)},profile:{ownedCards:{'01':3}}});
  await request('A',{presets:{one:deck('changed',20)}});
  let result=await request('A',{presets:{one:deck('old client',10)}});
  assert.equal(result.data.presets.one.name,'changed');assert.ok(result.data.presets.two);
  result=await request('A',{presets:{},presetTombstones:{one:30}});
  assert.equal(result.data.presets.one,undefined);assert.ok(result.data.presets.two);
  await request('A',{presets:{one:deck('stale resurrect',20)}});
  assert.equal((await request('A')).data.presets.one,undefined);
  const disk=JSON.parse(fs.readFileSync(path.join(dir,'rooms.json'),'utf8'));
  const saved=disk.playerSaves.find(x=>x.uid==='A');
  assert.ok(saved.data.presets.two,'acknowledged preset must already be on disk');
  assert.ok(saved.presetHistory.some(x=>x.presets.one?.name==='changed'),'deleted version is recoverable');
  assert.deepEqual(saved.data.profile.ownedCards,{'01':3},'collection must remain untouched');
  await request('B',{presets:{other:deck('B private deck',40)}});
  assert.equal((await request('A')).data.presets.other,undefined);
  for(let i=0;i<12;i++)await request('A',{presets:{two:deck('revision '+i,100+i)}});
  assert.equal((await request('A')).save.presetHistory.length,10);
  api.flush();api=makeApi();
  result=await request('A');
  assert.equal(result.data.presets.two.name,'revision 11');assert.equal(result.data.presets.one,undefined);
  console.log('PASS: authenticated cloud writes merge across clients, preserve deletions and collection, keep 10 backups, and survive server restart.');
}finally{
  api?.flush();globalThis.fetch=originalFetch;
  assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));
  assert.ok(path.basename(dir).startsWith('fate-preset-durability-'));
  fs.rmSync(dir,{recursive:true,force:true});
}
