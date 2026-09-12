import assert from 'node:assert/strict';
import {startWarfrontBattle,warfrontDueMatch,WARFRONT_PHASE_MS} from './warfront-lifecycle.mjs';
const now=1000000000;
const event={mapCode:'hourly',zones:Array.from({length:5},(_,i)=>({id:`z${i}`,matches:[]}))};
startWarfrontBattle(event,now);
const times=event.zones.flatMap(z=>z.aiSchedule).sort((a,b)=>a-b);
assert.equal(times.length,25);
for(let i=0;i<25;i++)assert.equal(times[i],now+(i+1)*WARFRONT_PHASE_MS/25);
assert.equal(warfrontDueMatch(event,times[0]-1),null);
for(let i=0;i<25;i++){
  const due=warfrontDueMatch(event,times[i]);
  assert(due);assert.equal(due.deadline,false);
  due.zone.matches.push({id:`m${i}`,winnerTeam:'a'});
  assert.equal(warfrontDueMatch(event,times[i]),null);
}
assert(event.zones.every(z=>z.matches.length===5));
// Existing campaigns migrate without replaying matches or releasing a backlog.
event.aiScheduleVersion=1;event.zones[0].matches.pop();
const before=event.zones.reduce((n,z)=>n+z.matches.length,0);
assert.equal(warfrontDueMatch(event,now+WARFRONT_PHASE_MS/2),null);
assert.equal(event.zones.reduce((n,z)=>n+z.matches.length,0),before);
assert(event.zones[0].aiSchedule[4]>now+WARFRONT_PHASE_MS/2);
console.log('Hourly Warfront schedule: 25 staggered matches, caps and active migration passed');
