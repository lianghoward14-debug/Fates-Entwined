const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
const source=fs.readFileSync('src/scripts/18-online-rooms.js','utf8');
const start=source.indexOf('  async function phase7PlayActivationCinematics(');
const end=source.indexOf('\n  function ',start);
const asyncEnd=source.indexOf('\n  async function ',start+10);
const code=source.slice(start,Math.min(end<0?Infinity:end,asyncEnd<0?Infinity:asyncEnd));
for(const viewer of [0,1]){
 const hidden={id:viewer===0?'bh18':'',iid:'source',owner:0,faceDown:true,hidden:viewer===1};
 const revealed={id:'bh18',iid:'source',owner:0,faceDown:false};
 const calls=[];
 const context={phase7FastPresentationMode:()=>false,phase7FindAnyCard:()=>hidden,phase7PresentationCard:c=>c,
 phase7FindProjectedEntry:()=>({card:revealed}),phase7RecordPresentationStage:()=>{},phase7WaitForPresentationIdle:async()=>{},
 window:{showEffectActivationCinematic:async card=>{assert.equal(card.faceDown,false);assert.equal(card.id,'bh18');calls.push(card);}}};
 vm.createContext(context);vm.runInContext(code,context);
 await context.phase7PlayActivationCinematics({playerIndex:viewer,presentationBatch:{id:'flip'}},[
 {type:'CARD_FLIPPED',cardIid:'source',faceDown:false},{type:'EFFECT_ACTIVATED',sourceIid:'source',playerIndex:0}]);
 assert.equal(calls.length,1,'both seats must present the revealed activation');
}
const task=source.slice(source.indexOf('    const task = async function(){'),source.indexOf('    phase7CurrentUiSession.presentationTail = Promise.resolve'));
assert.ok(task.indexOf('await phase7PresentBatch(view, flipEvents)')<task.indexOf('await phase7PlayActivationCinematics(view, events)'));
assert.ok(!task.includes('await phase7PresentBatch(view, events)'),'flip reveal must not replay with results');
console.log('Opponent flip activation uses public identity after reveal, once, for both seats.');
})().catch(error=>{console.error(error);process.exitCode=1;});
