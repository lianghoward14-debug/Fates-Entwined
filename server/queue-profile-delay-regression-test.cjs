const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/scripts/18-online-rooms.js','utf8');
const fn=source.slice(source.indexOf('  async function profile(){'),source.indexOf('  function hasUsableProfilePhoto'));
const c={window:{USER_PROFILE:{profileImg:'local.png'},FATE_ONLINE:{profile:{profileImg:'blank.png'}}},FO:{syncPublicProfile:()=>new Promise(()=>{})},pPhoto:p=>p.profileImg||'blank.png'};
vm.createContext(c);vm.runInContext(fn,c);
(async()=>{const result=await Promise.race([c.profile(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('queue blocked on cloud profile')),100))]);assert.equal(result.profileImg,'local.png');console.log('Queue uses saved portrait without waiting for cloud profile synchronization');})().catch(e=>{console.error(e);process.exitCode=1;});
