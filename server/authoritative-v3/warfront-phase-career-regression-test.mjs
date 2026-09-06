import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WARFRONT_PHASE_MS as DAY,startWarfrontBattle,warfrontDueMatch} from './warfront-lifecycle.mjs';

// Clock/record tests only: never launch a simulated game or a worker.
const now=1000000000;
const event=()=>({version:2,sequence:1,mapCode:'WF-CLOCK-TEST',createdAt:now,status:'enrollment',archives:[],
  teams:{a:{name:'A'},b:{name:'B'}},zones:Array.from({length:5},(_,i)=>({id:'zone-'+i,a:null,b:null,
    matches:[],landscape:{id:'igb1'},bans:{a:[],b:[]},bansLocked:{a:false,b:false}}))});
const empty=event();empty.zones[0].a={uid:'human'};
startWarfrontBattle(empty,now,()=>.5);
assert.equal(empty.endsAt-now,DAY);
assert.equal(empty.zones.flatMap(z=>[z.a,z.b]).length,10);
assert.equal(empty.zones.flatMap(z=>[z.a,z.b]).filter(p=>p.isAI).length,9);
assert.deepEqual(empty.zones[0].aiSchedule,[]);
assert.equal(warfrontDueMatch(empty,now),null);
assert.equal(warfrontDueMatch(empty,now+DAY/5).zone.id,'zone-1');
for(const zone of empty.zones.slice(1))zone.matches=Array.from({length:5},(_,i)=>({id:String(i),winnerTeam:'a'}));
assert.equal(warfrontDueMatch(empty,now+DAY-1),null,'human fronts must not be auto-played');
assert.equal(warfrontDueMatch(empty,now+DAY).deadline,true);
empty.zones[0].matches=[{id:'played',winnerTeam:'a'}];
assert.equal(warfrontDueMatch(empty,now+DAY).index,1,'preserve played matches at deadline');

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'warfront-phase-career-'));
process.env.FATE_FLY_DATA_API_DIR=dir;
const humans=event();
for(const z of humans.zones)for(const team of ['a','b'])z[team]={uid:z.id+team,name:z.id+team};
fs.writeFileSync(path.join(dir,'rooms.json'),JSON.stringify({warfrontEvent:humans}));
const {createFlyDataApi}=await import('./fly-data-api.mjs');
const realNow=Date.now;
let api;
try{
  Date.now=()=>now+DAY-1;
  api=createFlyDataApi({readBody:async()=>({}),writeJson(){}});
  const read=()=>{api.flush();return JSON.parse(fs.readFileSync(path.join(dir,'rooms.json'),'utf8'));};
  await api.tickWarfront();assert.equal(read().warfrontEvent.status,'enrollment');
  Date.now=()=>now+DAY;await api.tickWarfront();assert.equal(read().warfrontEvent.status,'active');
  assert.equal(read().warfrontEvent.endsAt,now+2*DAY);
  Date.now=()=>now+2*DAY;await api.tickWarfront();assert.equal(read().warfrontEvent.status,'results');
  const resultMap=read().warfrontEvent.mapCode;
  assert.equal(read().warfrontEvent.postWarUntil,now+3*DAY);
  await api.tickWarfront();assert.equal(read().warfrontEvent.archives.length,1);
  Date.now=()=>now+3*DAY;await api.tickWarfront();assert.equal(read().warfrontEvent.status,'enrollment');
  assert.notEqual(read().warfrontEvent.mapCode,resultMap);
  assert.equal(read().warfrontEvent.zones.every(z=>!z.a&&!z.b),true);

  const record=(source,id,didWin,isAI=false)=>api.testApplyChallengerResult('career',{source,roomCode:id,didWin,isAI,opponentElo:600});
  record('human','challenger-human',true);record('ai','challenger-ai',false);
  record('warfront','war-human',true);record('warfront','war-ai',false,true);
  const duplicate=record('warfront','war-human',true);
  assert.equal(duplicate.idempotent,true);
  const p=duplicate.profile;
  assert.equal(p.challengerWins,1);assert.equal(p.challengerLosses,1);
  assert.equal(p.challengerHumanWins,1);assert.equal(p.challengerAILosses,1);
  assert.equal(p.warfrontMatchWins,1);assert.equal(p.warfrontMatchLosses,1);
  assert.equal(p.warfrontHumanWins,1);assert.equal(p.warfrontHumanLosses,0);
  assert.equal(p.matchesPlayed,4);
  api.close();
  const aiEvent=event();aiEvent.zones[0].a={uid:'human',name:'Human'};
  startWarfrontBattle(aiEvent,Date.now(),()=>.5);
  fs.writeFileSync(path.join(dir,'rooms.json'),JSON.stringify({warfrontEvent:aiEvent}));
  const opponent=aiEvent.zones[0].b;
  const key=[aiEvent.mapCode,'zone-0',...['human',opponent.uid].sort()].join('|');
  const match={matchId:'AI_PLAYED',warfrontMatch:true,warfrontMatchmakingKey:key,warfrontAiSeats:[0],
    players:[{id:opponent.uid},{id:'human@session'}]};
  api=createFlyDataApi({readBody:async()=>({}),writeJson(){},resolveMatchState:id=>id===match.matchId?match:null});
  assert.equal(api.warfrontAiOpponent(key,'human').uid,opponent.uid);
  assert.equal(api.bindWarfrontAiMatch(match.matchId,'human','human@session',key),true);
  assert.equal(api.warfrontAiOpponent(key,'human'),null,'a reserved zone cannot start another match');
  match.outcome={winner:1,totalFate:[12,20]};
  assert.equal(api.settleWarfrontForfeit(match),true);
  assert.equal(api.settleWarfrontForfeit(match),true);
  const completed=read();
  assert.equal(completed.warfrontEvent.zones[0].matches.length,1);
  const human=completed.playerStats.find(p=>p.uid==='human');
  assert.equal(human.warfrontMatchWins,1);
  assert.equal(human.warfrontHumanWins||0,0);
  assert.equal(human.challengerWins||0,0);
  console.log('Warfront clock, AI scheduling and career counter checks passed (no games simulated)');
}finally{Date.now=realNow;api?.close();}
