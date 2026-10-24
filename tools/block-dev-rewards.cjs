const fs=require('node:fs');
function edit(p,fn){fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8')));}
const guard="typeof window.isFateDevRewardBlocked === 'function' && window.isFateDevRewardBlocked()";
const zero="{eloChange:0,xpGained:0,levelsGained:0,newLevel:USER_PROFILE.level}";
edit('src/scripts/03-profile-and-progression.js',s=>s.replace('// Award XP and handle level-ups.',`// Keep developer-match provenance through the result-screen transition, which
// clears the interactive developer tools before reward callbacks run.
function isFateDevRewardBlocked(){
  return !!(window.__fateHowardDevMode || window.__fateHowardDevLaunchPending
    || (typeof G !== 'undefined' && G && (G._howardDevMode || G._devRewardsDisabled)));
}
window.isFateDevRewardBlocked=isFateDevRewardBlocked;

// Award XP and handle level-ups.`).replace('function awardXp(amount){','function awardXp(amount){\n  if(isFateDevRewardBlocked())return '+zero+';').replace('function claimDailyLoginReward() {','function claimDailyLoginReward() {\n  if(isFateDevRewardBlocked())return false;').replace('function recordGameResult(didWin, opponentElo=1000) {','function recordGameResult(didWin, opponentElo=1000) {\n  if(isFateDevRewardBlocked())return '+zero+';'));
edit('src/scripts/04-game-setup.js',s=>s.replace('  const keepHowardDevMode = !!window.__fateHowardDevLaunchPending;','  const keepHowardDevMode = !!window.__fateHowardDevLaunchPending;\n  G._devRewardsDisabled=keepHowardDevMode;').replace('  G._howardDevMode = true;','  G._howardDevMode = true;\n  G._devRewardsDisabled = true;'));
for(const p of ['src/scripts/09-challenger-mode.js','src/scripts/09-challenger-v2.js'])edit(p,s=>{
 s=s.replace(/(function updateDailyChallengeProgress\(key, value, mode\) \{)/,'$1\n  if('+guard+')return;');
 s=s.replace('awardXp = function(amount){','awardXp = function(amount){\n  if('+guard+')return '+zero+';');
 s=s.replace('function checkDivisionReward(elo) {','function checkDivisionReward(elo) {\n  if('+guard+')return;');
 s=s.replace('function awardVictoryDrops(didWin) {','function awardVictoryDrops(didWin) {\n  if('+guard+')return [];');
 s=s.replace(/(function record(?:FreePlay|Challenger)Result\([^\n]+\) \{)/g,'$1\n  if('+guard+')return '+zero+';');
 return s;
});
edit('src/scripts/05-gameplay-core.js',s=>{
 const a=s.indexOf('  // Record results based on mode'),b=s.indexOf('  // Let the result screen reveal',a);
 let block=s.slice(a,b);block=block.replace('  if(G.aiEnabled && winner >= 0){','  if('+guard+'){\n    result='+zero+';\n  } else if(G.aiEnabled && winner >= 0){');
 return s.slice(0,a)+block+s.slice(b);
});
edit('src/scripts/47-challenger-war-event.js',s=>s.replace('function reward(r){','function reward(r){if(window.isFateDevRewardBlocked?.())return null;'));
edit('index.html',s=>s.replace(/((?:03-profile-and-progression|04-game-setup|05-gameplay-core|09-challenger-mode|09-challenger-v2|47-challenger-war-event)\.js\?v=)[^"']+/g,'$1'+'20261024-dev-rewards'));
