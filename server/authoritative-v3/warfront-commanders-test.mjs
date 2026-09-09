import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assignWarfrontCommanderProfiles,warfrontCommanderProfiles} from './warfront-commanders.mjs';
import {startWarfrontBattle} from './warfront-lifecycle.mjs';

const event={mapCode:'WF-PROFILES',zones:Array.from({length:5},(_,i)=>({id:String(i),matches:[{id:`match-${i}`}]}))};
const human={uid:'human',name:'Player',photo:'pfp/custom.png',elo:1036};
event.zones[0].a={...human};
startWarfrontBattle(event,100,()=>.5);
assert.deepEqual(event.zones[0].a,human);
const seats=event.zones.flatMap(z=>[z.a,z.b]).filter(p=>p.isAI);
assert.equal(new Set(seats.map(p=>p.aiProfileId)).size,9);
for(const seat of seats){
  const profile=warfrontCommanderProfiles().find(p=>p.aiProfileId===seat.aiProfileId);
  assert.equal(seat.name,profile.name);
  assert.equal(seat.photo,profile.photo);
  assert.equal(seat.elo,profile.elo);
  assert(fs.existsSync(new URL('../../'+seat.photo,import.meta.url)));
  assert(seat.uid.startsWith('warfront-ai:'));
}
const snapshot=JSON.stringify(event);
assert.equal(assignWarfrontCommanderProfiles(event),false);
assert.equal(JSON.stringify(event),snapshot);
const legacy={mapCode:'WF-OLD',zones:[{id:'old',a:{uid:'keep-seat',isAI:true,name:'AI Commander 1A',elo:600},matches:[{id:'keep-match'}]}]};
assert.equal(assignWarfrontCommanderProfiles(legacy),true);
assert.equal(legacy.zones[0].a.uid,'keep-seat');
assert.equal(legacy.zones[0].matches[0].id,'keep-match');
assert(!legacy.zones[0].a.name.startsWith('AI Commander'));
console.log('Warfront commander identity, portrait, persistence and migration checks passed');
