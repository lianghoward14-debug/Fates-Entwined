// Explicit one-time account maintenance. Uses only this game's existing login,
// never logs or stores credentials, and verifies the authenticated account first.
const fs=require('fs'),path=require('path');
const uid='nNbfvYwsoDfnvTHQhK4lwN5a2B22';
const dir=path.join(process.env.APPDATA,'fates-entwined','IndexedDB','http_localhost_47891.indexeddb.leveldb');
const apiKey=fs.readFileSync('src/scripts/15-online-auth.js','utf8').match(/apiKey:'([^']+)'/)[1];
const candidates=new Set();
for(const file of fs.readdirSync(dir).filter(f=>/\.(log|ldb)$/.test(f))){
 const bytes=fs.readFileSync(path.join(dir,file));
 for(const encoding of ['utf8','utf16le']){
  const text=bytes.toString(encoding);
  for(const match of text.matchAll(/refreshToken/g)){
   const tail=text.slice(match.index+12,match.index+2500);
   for(const token of tail.matchAll(/[A-Za-z0-9_-]{100,}/g))candidates.add(token[0]);
  }
 }
}
(async()=>{
 let idToken;
 for(const refreshToken of candidates){
  const response=await fetch('https://securetoken.googleapis.com/v1/token?key='+apiKey,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshToken})});
  const auth=await response.json();
  if(response.ok&&auth.user_id===uid){idToken=auth.id_token;break;}
 }
 if(!idToken)throw Error('No valid existing game login for the requested account. No data changed.');
 const url='https://fates-entwined-main.fly.dev/api/player-save/'+uid;
 const headers={Authorization:'Bearer '+idToken,'Content-Type':'application/json'};
 const read=async()=>{const r=await fetch(url,{headers});if(!r.ok)throw Error('Account read failed: '+r.status);return (await r.json()).data;};
 const data=await read(),profile=data?.profile;
 if(!profile||!Object.values(profile).includes("Netanyahu's 1st Guard"))throw Error('Profile identity mismatch. No data changed.');
 const packKeys=['unopenedPacks','unopenedProfilePacks','unopenedFavoredPacks','unopenedBooster2Packs','unopenedBooster3Packs'];
 const before=Object.fromEntries(['starlight',...packKeys].map(k=>[k,profile[k]||0]));
 const updated={...profile,starlight:1500,_clientUpdatedAt:Date.now()};
 for(const key of packKeys)updated[key]=0;
 const response=await fetch(url,{method:'POST',headers,body:JSON.stringify({uid,data:{profile:updated}})});
 if(!response.ok)throw Error('Account update failed: '+response.status);
 const result=(await read()).profile;
 if(result.starlight!==1500||packKeys.some(k=>result[k]!==0))throw Error('Account verification failed.');
 for(const key of Object.keys(profile))if(!['starlight','_clientUpdatedAt',...packKeys].includes(key)&&JSON.stringify(result[key])!==JSON.stringify(profile[key]))throw Error('Unexpected profile change: '+key);
 console.log(JSON.stringify({player:"Netanyahu's 1st Guard",before,after:Object.fromEntries(['starlight',...packKeys].map(k=>[k,result[k]])),verified:true}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
