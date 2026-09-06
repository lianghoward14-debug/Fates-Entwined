import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'marketplace-cross-account-'));
process.env.FATE_FLY_DATA_API_DIR=dir;
const originalFetch=globalThis.fetch;
const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
globalThis.fetch=async()=>({ok:true,headers:new Headers(),json:async()=>({test:publicKey.export({type:'spki',format:'pem'})})});
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
function token(uid){const project='fates-entwined-41491',input=`${encode({alg:'RS256',kid:'test'})}.${encode({sub:uid,aud:project,iss:`https://securetoken.google.com/${project}`,exp:Math.floor(Date.now()/1000)+3600})}`;return `${input}.${crypto.sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url')}`;}
let api,response;
try{
  const {createFlyDataApi}=await import('./fly-data-api.mjs');
  const makeApi=()=>createFlyDataApi({readBody:async req=>req.body||{},writeJson:(_res,status,body)=>response={status,body}});
  api=makeApi();
  async function request(uid,method,url,body){
    response=null;await api.handle({method,headers:uid?{authorization:`Bearer ${token(uid)}`}:{},body},{},new URL('http://localhost'+url));
    assert.equal(response?.status,200,JSON.stringify(response?.body));return response.body;
  }
  const created=await request('seller','POST','/api/marketplace/listings',{uid:'seller',profile:{chosenUsername:'Seller'},cardId:'32',price:125});
  assert(created.listing?.listingId);
  const anonymous=await request('', 'GET','/api/marketplace/listings?limit=80');
  const buyer=await request('buyer','GET','/api/marketplace/listings?limit=80');
  assert.equal(anonymous.listings[0].listingId,created.listing.listingId,'store feed is available while account restoration is pending');
  assert.deepEqual(buyer.listings,anonymous.listings,'a second account immediately sees the same shared listing');
  api.flush();api=makeApi();
  const restarted=await request('buyer','GET','/api/marketplace/listings?limit=80');
  assert.equal(restarted.listings[0].listingId,created.listing.listingId,'listing survives authority restart');
  const bought=await request('buyer','POST',`/api/marketplace/listings/${created.listing.listingId}/buy`,{uid:'buyer'});
  assert.equal(bought.listing.status,'sold');
  response=null;await api.handle({method:'POST',headers:{authorization:`Bearer ${token('other-buyer')}`},body:{uid:'other-buyer'}},{},new URL(`http://localhost/api/marketplace/listings/${created.listing.listingId}/buy`));
  assert.equal(response?.status,409,'a sold listing cannot be bought twice');
  console.log('Marketplace listing is immediately shared across accounts, durable after restart, and protected from duplicate purchases');
}finally{api?.flush();globalThis.fetch=originalFetch;fs.rmSync(dir,{recursive:true,force:true});}
