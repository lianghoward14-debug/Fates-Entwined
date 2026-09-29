import assert from 'node:assert/strict';
import {createDeltaEncoder,createDeltaDecoder} from '../../shared/multiplayer-delta.mjs';
import {AuthoritativeRoomActor} from './room-actor.mjs';
import {testState} from './test-helpers.mjs';

const actor=new AuthoritativeRoomActor({state:testState(),store:{}});
let fullBytes=0,wireBytes=0;
for(const seat of [0,1]){
  const encode=createDeltaEncoder(),decode=createDeltaDecoder();
  const initial=actor.snapshotForPlayer(seat);
  assert.deepEqual(decode(JSON.parse(encode(initial))),initial);
  for(let revision=1;revision<=20;revision++){
    const next=structuredClone(initial);
    Object.assign(next,{kind:'accepted',revision,commandId:`move-${revision}`,events:[{type:'turn-ended'}]});
    next.state.revision=revision;next.state.turn=revision;
    next.state.players[seat].hand=revision%2?initial.state.players[seat].hand:[];
    if(revision%3===0)next.state.pendingPrompt={playerIndex:seat,type:'REACTION'};
    else delete next.state.pendingPrompt;
    const wire=encode(next);
    fullBytes+=Buffer.byteLength(JSON.stringify(next));wireBytes+=Buffer.byteLength(wire);
    const reconstructed=decode(JSON.parse(wire));
    assert.deepEqual(reconstructed,next);
    assert.equal(reconstructed.state.players[1-seat].hand,undefined);
    // UI changes cannot corrupt the decoder's retained baseline.
    reconstructed.state.players[seat].hand.push({iid:'ui-only'});
  }
  assert.deepEqual(decode(JSON.parse(encode(initial))),initial,'full snapshot resets the baseline');
}
assert(wireBytes<fullBytes*0.5);
const encode=createDeltaEncoder(),decode=createDeltaDecoder();
const snapshot=actor.snapshotForPlayer(0);
const first=JSON.parse(encode(snapshot));decode(first);
const next={...snapshot,kind:'accepted',revision:1};
const second=JSON.parse(encode(next));
const third=JSON.parse(encode({...next,revision:2}));
assert.equal(second.kind,'view-delta');
assert.throws(()=>decode(third),/resync/);
assert.deepEqual(decode(second),next);
assert.throws(()=>decode(second),/resync/,'duplicate transport delta cannot apply twice');
const resumed=createDeltaDecoder();
assert.throws(()=>resumed(second),/resync/);
assert.deepEqual(resumed(JSON.parse(createDeltaEncoder()(snapshot))),snapshot);
assert.deepEqual(createDeltaDecoder()(snapshot),snapshot,'new client accepts old-server messages');
const ping={kind:'ping',time:1};
assert.deepEqual(decode(JSON.parse(encode(ping))),ping);
const hostile={kind:'view-delta',base:second.sequence,sequence:second.sequence+1,changes:[[['__proto__','polluted'],true]]};
assert.throws(()=>decode(hostile),/Unsafe/);
assert.equal({}.polluted,undefined);
console.log(JSON.stringify({fullBytes,wireBytes,reductionPercent:Math.round((1-wireBytes/fullBytes)*100)}));
console.log('Multiplayer delta passed: exact reconstruction, both private seats, additions/deletions, arrays, mutation isolation, reconnect, dropped/duplicate packets, legacy messages and unsafe paths.');
