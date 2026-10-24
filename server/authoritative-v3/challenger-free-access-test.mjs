import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fate-challenger-free-'));
process.env.FATE_FLY_DATA_API_DIR=dir;
process.env.FATE_CHALLENGER_ACCESS_ADMIN_UIDS='owner';
const oldFetch=globalThis.fetch;
const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
globalThis.fetch=async()=>({ok:true,headers:new Headers(),json:async()=>({test:publicKey.export({type:'spki',format:'pem'})})});
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
function token(uid){const project='fates-entwined-41491',data=`${encode({alg:'RS256',kid:'test'})}.${encode({sub:uid,aud:project,iss:`https://securetoken.google.com/${project}`,exp:Math.floor(Date.now()/1000)+3600})}`;return `${data}.${crypto.sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url')}`;}
const {createFlyDataApi}=await import('./fly-data-api.mjs');
const make=()=>createFlyDataApi({readBody:async req=>req.body,writeJson:(res,status,body)=>Object.assign(res,{status,body})});
let api=make();
async function request(uid,body,route='/api/challenger-access'){
 const res={};await api.handle({method:body?'POST':'GET',headers:uid?{authorization:'Bearer '+token(uid)}:{},body},res,new URL('http://test'+route));return res;
}
try{
 for(const uid of ['A','B'])assert.equal((await request(uid,{uid,data:{profile:{ownedCards:{'01':2},starlight:500}}},'/api/player-save/'+uid)).status,200);
 const before=fs.readFileSync(path.join(dir,'rooms.json'),'utf8');
 assert.equal((await request(null)).body.access.enabled,true,'starts enabled for everyone');
 assert.equal((await request('A',{uid:'owner',enabled:false,expectedRevision:0})).status,403,'body identity cannot impersonate owner');
 const disabled=await request('owner',{enabled:false,expectedRevision:0});assert.equal(disabled.status,200);assert.equal(disabled.body.access.enabled,false);
 assert.equal((await request('owner',{enabled:true,expectedRevision:0})).status,409,'stale retries cannot flip again');
 api=make();assert.equal((await request('B')).body.access.enabled,false,'setting survives restart and is shared');
 assert.equal((await request('owner',{enabled:true,expectedRevision:1})).status,200);
 await request('A',{uid:'A',data:{profile:{ownedCards:{'01':2,'119':1},starlight:450}}},'/api/player-save/A');
 assert.equal((await request('owner',{enabled:false,expectedRevision:2})).status,200);
 assert.deepEqual((await request('A',null,'/api/player-save/A')).body.data.profile.ownedCards,{'01':2,'119':1},'real acquisitions survive toggling');
 assert.deepEqual((await request('B',null,'/api/player-save/B')).body.data.profile.ownedCards,{'01':2},'other collections never changed');
 console.log('Global Challenger access: owner-only toggle, spoof rejection, shared state, durable restart, retry protection, and unchanged collections passed.');
}finally{api.flush();globalThis.fetch=oldFetch;fs.rmSync(dir,{recursive:true,force:true});}
