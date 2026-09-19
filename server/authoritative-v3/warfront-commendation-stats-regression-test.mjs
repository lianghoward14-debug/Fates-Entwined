import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {addWarfrontSimulatedStats} from './warfront-simulated-stats.mjs';
import {warfrontReportStats} from './warfront-report.mjs';

const participants={a:{uid:'a',name:'Alpha',isAI:true,elo:1800},b:{uid:'b',name:'Beta',isAI:true,elo:400}};
for(let i=0;i<500;i++){
  const match={id:`bounded-${i}`,simulationKind:'strength-probability',winnerTeam:i%2?'a':'b',participants,statsVersion:3,statsSource:'simulated',stats:{fateDifferential:123,consolidations:34}};
  addWarfrontSimulatedStats(match);
  assert(match.stats.fateDifferential>=1&&match.stats.fateDifferential<=100);
  for(const stats of Object.values(match.playerStats))assert(stats.consolidations>=6&&stats.consolidations<=20);
  assert.equal(match.playerStats[match.winnerTeam].totalFateGenerated-match.playerStats[match.winnerTeam==='a'?'b':'a'].totalFateGenerated,match.stats.fateDifferential);
  const saved=JSON.stringify(match);
  addWarfrontSimulatedStats(match);
  assert.equal(JSON.stringify(match),saved);
}
const real={simulationKind:'strength-probability',statsSource:'engine',stats:{fateDifferential:123,consolidations:34}};
addWarfrontSimulatedStats(real);
assert.deepEqual(real.stats,{fateDifferential:123,consolidations:34});

const rows=[{...participants.a,team:'a',fateDifferential:80,consolidations:20,durationMs:500000},{...participants.a,team:'a',fateDifferential:70,consolidations:14,durationMs:400000},{...participants.b,team:'b',fateDifferential:100,consolidations:19,durationMs:450000}];
const zones=[{matches:rows.map(row=>({winnerTeam:row.team,participants:{[row.team]:row},stats:row}))}];
const report=warfrontReportStats(zones);
assert.equal(report.achievements[0].leader.uid,'b');
assert.equal(report.achievements[0].leader.value,100);
assert.equal(report.achievements[2].leader.value,20);
assert.equal(report.playerStats('a').fate,150);
const source=fs.readFileSync(new URL('../../src/scripts/47-challenger-war-event.js',import.meta.url),'utf8');
const context=vm.createContext({telemetry:()=>rows,duration:ms=>{const s=Math.floor(ms/1000);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}});
vm.runInContext(source.match(/const TEAMS=.*;/)[0]+'\n'+source.match(/function achievements\(\).*\r?\n/)[0]+'\nthis.result=achievements();',context);
assert.deepEqual(JSON.parse(JSON.stringify(context.result)),JSON.parse(JSON.stringify(report.achievements)));
console.log('Warfront simulation bounds, migration, best-victory commendations and client/report parity passed');
