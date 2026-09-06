import assert from 'node:assert/strict';
import {createFlyDataApi} from './fly-data-api.mjs';

const api=createFlyDataApi({readBody:async()=>({}),writeJson:()=>{}});
const zoneIds=['north-gate','silver-crossing','heartland','sunken-road','crown-reach'];
const fresh=(sequence=1)=>({
  version:2,sequence,mapCode:`WF-${sequence}-SYNC`,status:'enrollment',createdAt:1,startedAt:0,endsAt:0,nextTeam:null,
  teams:{a:{name:'Team I'},b:{name:'Team II'}},archives:[],lastResult:null,
  zones:zoneIds.map((id,index)=>({id,a:null,b:null,matches:[],landscape:{id:`igb${index+1}`},bans:{a:[],b:[]},bansLocked:{a:false,b:false}}))
});

const left=fresh();
left.zones[0].a={uid:'alpha',name:'Alpha',photo:'pfp/pfp1.png'};
const right=fresh();
right.zones[0].b={uid:'bravo',name:'Bravo',photo:'pfp/pfp2.png'};
let merged=api.testMergeWarfrontState(left,right);
assert.equal(merged.zones[0].a.uid,'alpha','concurrent merge must retain the first claimed seat');
assert.equal(merged.zones[0].b.uid,'bravo','concurrent merge must add the opposite claimed seat');

left.zones[0].matches=[{id:'match-a',winnerTeam:'a',completedAt:10,replay:{actions:[{secret:true}]}}];
left.zones[0].bans={a:['1'],b:['2']};left.zones[0].bansLocked={a:true,b:true};
right.zones[0].matches=[{id:'match-b',winnerTeam:'b',completedAt:20,replay:{actions:[{secret:true}]}}];
right.zones[0].bans={a:[],b:[]};right.zones[0].bansLocked={a:false,b:false};
merged=api.testMergeWarfrontState(left,right);
assert.deepEqual(merged.zones[0].matches.map(match=>match.id),['match-a','match-b'],'different concurrent match reports must both survive');
assert.equal(merged.zones[0].matches.every(match=>Array.isArray(match.replay?.actions)),true,'completed Warfront replays must survive shared campaign storage');
assert.equal(merged.zones[0].matches.some(match=>Object.hasOwn(match.replay.actions[0],'view')),false,'private full-view payloads must be removed from shared replays');
assert.deepEqual(merged.zones[0].bans,{a:[],b:[]},'a newly merged match must reset the next-match bans');

const completed=fresh();
completed.archives=[{mapCode:'WF-0-OLD',localReward:{packs:5},zones:[{matches:[{id:'archived',replay:{actions:[1]}}]}]}];
const sanitized=api.testSanitizeWarfrontState(completed);
assert.equal(Object.hasOwn(sanitized.archives[0],'localReward'),false,'personal rewards must never be synchronized to another account');
assert.equal(Array.isArray(sanitized.archives[0].zones[0].matches[0].replay.actions),true,'archive replays must remain replayable');

const longReplay=fresh();
longReplay.zones[0].matches=[{id:'long-replay',replay:{version:6,teamASeat:1,recordedPerspective:'b',actions:Array.from({length:650},(_,i)=>({atMs:i*1500,view:{playerIndex:0,state:{revision:i},presentationBatch:{id:String(i),events:[{type:'CARD_DRAWN'}]}}}))}}];
const preserved=api.testSanitizeWarfrontState(longReplay).zones[0].matches[0].replay;
assert.equal(preserved.actions.length,650,'shared storage must not truncate full matches after 500 actions');
assert.equal(preserved.actions.at(-1).atMs,649*1500,'preserve original replay timing');
assert.equal(preserved.actions.at(-1).view.presentationBatch.events[0].type,'CARD_DRAWN','retain the normal presentation payload');
assert.equal(preserved.teamASeat,1,'retain team-to-seat mapping');

const next=fresh(2);
next.archives=[{mapCode:'WF-1-SYNC',zones:[]}];
merged=api.testMergeWarfrontState(completed,next);
assert.equal(merged.sequence,2,'a completed campaign must advance every client to the next event');
assert.equal(merged.mapCode,next.mapCode);

const receiptUid=`warfront-receipt-${Date.now()}`;
const firstResult=api.testApplyChallengerResult(receiptUid,{didWin:true,opponentElo:600,source:'warfront',roomCode:'authoritative-match-1',eloGainMultiplier:3});
const repeatedResult=api.testApplyChallengerResult(receiptUid,{didWin:true,opponentElo:600,source:'warfront',roomCode:'authoritative-match-1',eloGainMultiplier:3});
assert.equal(firstResult.idempotent,false,'the first authoritative match result must be applied');
assert.equal(repeatedResult.idempotent,true,'a repeated authoritative match result must return its stored receipt');
assert.equal(repeatedResult.profile.challengerElo,firstResult.profile.challengerElo,'a duplicate result must not grant ELO twice');
assert.equal(repeatedResult.profile.challengerWins,1,'a duplicate result must not increment wins twice');
const secondResult=api.testApplyChallengerResult(receiptUid,{didWin:true,opponentElo:600,source:'warfront',roomCode:'authoritative-match-2',eloGainMultiplier:3});
assert.equal(secondResult.profile.challengerWins,2,'a different authoritative match id must still grant its result');

console.log('Warfront shared-state synchronization smoke test passed');
