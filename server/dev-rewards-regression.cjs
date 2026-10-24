const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const read=p=>fs.readFileSync('src/scripts/'+p,'utf8');
const base=read('03-profile-and-progression.js');
function fn(source,name){const start=source.indexOf('function '+name+'(');assert(start>=0,name);const end=source.indexOf('\n}',start);assert(end>start,name);return source.slice(start,end+2);}
for(const file of ['09-challenger-mode.js','09-challenger-v2.js']){
 const source=read(file),storage=new Map();let saves=0;
 const daily={challenges:[{id:'test',completed:false}]};
 const c={window:{},G:{_howardDevMode:true,_devRewardsDisabled:true},USER_PROFILE:{level:1,xp:0,totalXp:0,starlight:1500},MAX_LEVEL:100,getXpForLevel:()=>100,PACK_COST_STARLIGHT:100,
  getDailyChallengeDate:()=> 'today',getDailyChallengeProgress:()=>JSON.parse(storage.get('fate_daily_progress_today')||'{}'),getDailyChallenges:()=>daily,
  DAILY_CHALLENGE_POOL:[{id:'test',key:'wins',target:1,label:'Win',reward:{starlight:25}}],saveProfile:()=>saves++,showDailyChallengeNotification(){},toast(){},setTimeout(){},document:{getElementById:()=>null},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}};
 vm.createContext(c);
 vm.runInContext(fn(base,'isFateDevRewardBlocked')+'\nwindow.isFateDevRewardBlocked=isFateDevRewardBlocked;\n'+fn(base,'awardXp')+'\n'+fn(source,'updateDailyChallengeProgress'),c);
 const wrapper=source.indexOf('awardXp = function(amount){');
 vm.runInContext('const _origAwardXp=awardXp;\n'+source.slice(wrapper,source.indexOf('\n};',wrapper)+3),c);
 for(const name of ['awardVictoryDrops','checkDivisionReward','recordFreePlayResult','recordChallengerResult'])vm.runInContext(fn(source,name),c);
 vm.runInContext(fn(base,'claimDailyLoginReward')+'\n'+fn(base,'recordGameResult'),c);
 const before=JSON.stringify(c.USER_PROFILE);
 for(const interactive of [true,false]){
  c.G._howardDevMode=interactive;c.window.__fateHowardDevMode=interactive;
  c.updateDailyChallengeProgress('wins',1,'add');c.awardXp(1000);c.awardVictoryDrops(true);c.checkDivisionReward(5000);c.recordFreePlayResult(true,1000);c.recordChallengerResult(true,1000);c.recordGameResult(true,1000);c.claimDailyLoginReward();
  assert.equal(JSON.stringify(c.USER_PROFILE),before,file+' developer rewards blocked even after result screen clears tools');
  assert.equal(storage.size,0);assert.equal(saves,0);assert.equal(daily.challenges[0].completed,false);
 }
 c.G._devRewardsDisabled=false;
 const normalBalance=file.includes('-mode')?1575:1525;
 c.updateDailyChallengeProgress('wins',1,'add');assert.equal(c.USER_PROFILE.starlight,normalBalance,'normal mission rewards remain available');
 c.awardXp(100);assert.equal(c.USER_PROFILE.level,2);assert(c.USER_PROFILE.starlight>normalBalance,'normal level rewards remain available');
}
const setup=read('04-game-setup.js');assert(setup.includes('G._devRewardsDisabled=keepHowardDevMode;'));
const online=read('18-online-rooms.js');assert(online.includes('g._devRewardsDisabled = false;'));
const gameplay=read('05-gameplay-core.js');assert(/if\(typeof window.isFateDevRewardBlocked[^]*?result=\{eloChange:0,xpGained:0,levelsGained:0,newLevel:USER_PROFILE.level\};\s*\} else if\(G.aiEnabled/.test(gameplay));
console.log('Developer rewards: daily progress, mission/level currency, login, match, drops and division rewards blocked; result transition stays blocked; normal rewards resume.');
