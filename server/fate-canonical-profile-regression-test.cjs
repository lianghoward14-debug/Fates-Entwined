const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = name => fs.readFileSync(require('node:path').join(__dirname,'../src/scripts',name),'utf8');

async function main(){
  const local = {username:'Brutal Mog',profileImg:'old.png'};
  let stored = {uid:'google-uid',username:'FOT Predtor',chosenUsername:'FOT Predtor',profileImg:'new.png',updatedAt:1};
  const requests = [];
  const account = {uid:'google-uid'};
  const context = vm.createContext({
    window:{FateOnline:{profileCache:new Map()},fateApplyServerProfileStats(){}},
    auth:{currentUser:account},state:{user:account},
    getLocalProfile:()=>local,makeBaseCode:uid=>uid,safe:String,normalizeUsername:s=>s.toLowerCase(),
    buildLocalProfile:active=>({...local,uid:active.uid,chosenUsername:local.username,displayName:local.username}),
    emit(){},
    async flyApiRequest(route,opts={}){
      requests.push(opts);
      if(opts.body) stored={...stored,...opts.body.profile};
      return {profile:{...stored}};
    }
  });
  const source=read('15-online-auth.js');
  vm.runInContext(source.slice(source.indexOf('let accountProfileGeneration'),source.indexOf('async function getPublicProfile')),context);
  await context.syncPublicProfile();
  assert.equal(requests.length,0,'no writes before hydration');
  await context.hydrateAccountProfile(account,0);
  assert.equal(local.username,'FOT Predtor');
  assert.equal(local.profileImg,'new.png');
  assert.ok(requests.every(r=>!r.body),'sign-in must not upload stale cosmetics');
  local.username='Renamed';
  await context.syncPublicProfile();
  assert.equal(stored.username,'Renamed');
  stored={...stored,username:'Other device',chosenUsername:'Other device'};
  await context.syncPublicProfile();
  assert.equal(local.username,'Other device','unchanged saves read current server identity');
  context.auth.currentUser={uid:'different-account'};
  assert.equal(context.applyCanonicalProfile(stored),false,'late responses cannot replace another account');

  const leaderboard=read('09-challenger-mode.js');
  const ctx=vm.createContext({window:{FATE_ONLINE:{user:account},FATE_ONLINE_LEADERBOARD:{
    one:{uid:account.uid,name:'FOT Predtor',wins:2,losses:1,elo:700},
    two:{uid:'other',name:'FOT Predtor',wins:1,losses:0,elo:650}
  }},USER_PROFILE:{username:'FOT Predtor'},LEADERBOARD:[
    {username:'Brutal Mog',wins:99}, {uid:account.uid,username:'FOT Predtor',wins:100}
  ],updateLeaderboardEntry(){},syncAIOpponentLeaderboardEntries(){},saveLeaderboard(){},
  isInternalLeaderboardEntry:()=>false,applyAIBalanceOverrideToLeaderboardEntry:e=>e,
  getLeaderboardRecordWins:e=>e.wins||0,getLeaderboardRecordLosses:e=>e.losses||0,
  getLeaderboardDisplayName:e=>e.name||e.username});
  vm.runInContext(leaderboard.slice(leaderboard.indexOf('function getMergedChallengerLeaderboardEntries()'),leaderboard.indexOf('\nshowLeaderboard =',leaderboard.indexOf('function getMergedChallengerLeaderboardEntries()'))),ctx);
  let entries=ctx.getMergedChallengerLeaderboardEntries();
  assert.equal(entries.length,2,'same names with different UIDs remain distinct');
  assert.equal(entries.find(e=>e.uid===account.uid).wins,2,'local stats cannot override server stats');
  ctx.window.FATE_ONLINE_LEADERBOARD={};
  assert.equal(ctx.getMergedChallengerLeaderboardEntries().length,0,'pending server fetch cannot resurrect local aliases');
  console.log('Canonical profile and renamed-account leaderboard regression checks passed');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
