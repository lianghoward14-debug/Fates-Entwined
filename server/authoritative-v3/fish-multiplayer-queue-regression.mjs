import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const rooms=fs.readFileSync('src/scripts/18-online-rooms.js','utf8');
const fish=fs.readFileSync('src/scripts/28-don-julio-dice.js','utf8');
let modalOpen=true,now=1000;const timers=[],flashes=[];
const rt={window:{flashCardEffect:(...args)=>flashes.push(args),renderGame(){}},
 document:{querySelector:()=>modalOpen?{}:null},Date:{now:()=>now},setTimeout:fn=>timers.push(fn),
 console,phase7CurrentUiSession:{view:{state:{}},presentationBusy:false},batchId:'fish-batch',
 phase7RecordPresentationStage(){},phase7SyncInteractionUi(){modalOpen=false;}};
vm.createContext(rt);vm.runInContext(fish,rt);
rt.window.queueSebastianFishOverlay({id:'110',iid:'sebastian'},'created',['fish']);
assert(rt.window.isSebastianFishHidden({iid:'fish'}));
const start=rooms.indexOf("          phase7RecordPresentationStage('modal-gate:open'");
const end=rooms.indexOf('          phase7PresentOutcomeAfterQueue',start);
assert(start>=0&&end>start);
// Execute the actual multiplayer finalizer: it closes the resolved prompt
// before initiating the reveal, without blocking future snapshot delivery.
vm.runInContext(rooms.slice(start,end),rt);
for(let n=0;n<12;n++){
 now+=50;timers.splice(0).forEach(fn=>fn());await Promise.resolve();
}
assert.equal(modalOpen,false);
assert.equal(flashes.length,1);
assert.equal(rt.window.isSebastianFishHidden({iid:'fish'}),false);
const queueStart=rooms.indexOf('    const task = async function(){',rooms.indexOf('function phase7PresentCardSetAuraOverlays'));
const queueEnd=rooms.indexOf('    phase7CurrentUiSession.presentationTail =',queueStart);
assert(queueStart>=0&&queueEnd>queueStart);
assert(!rooms.slice(queueStart,queueEnd).includes('await window.flushSebastianFishOverlays'), 'Fish reveal must not block the queue that closes its picker');
console.log('PASS: multiplayer closes resolved picker, releases Fish into hand and does not deadlock snapshot delivery');
