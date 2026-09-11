import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');
function extract(name){const start=code.indexOf(`function ${name}(`);return code.slice(start,code.indexOf('\n}',start)+2);}
for(const owner of [0,1]) for(const copied of ['10','11']){
  const source={id:'whisper17',iid:'token',owner,_whisperCopiedEffectId:copied,_whisperEffectActivated:true};
  const targets=[0,1,2].map(z=>({id:'05',iid:`target-${z}`,owner:copied==='10'?1-owner:owner,type:'Supporter',z}));
  const immune={iid:'immune',owner:targets[0].owner,z:2,immune:true};
  const board=Array.from({length:3},()=>[[],[],[]]);board[0][0][0]=source;
  targets.forEach(t=>board[t.z][1].push(t));board[2][1].push(immune);
  const flashes=[];
  const context=vm.createContext({window:{},G:{board,turn:2},
    COORDINATOR_PLACEMENT_FLASH_KIND_BY_ID:{'10':'coord_postmodern_dylan','11':'coord_anne_trio'},
    coordinatorPlacementFlashKeys:new Set(),isWhisperOfTheHeartToken:c=>c.id==='whisper17',
    isActiveWhisperToken:c=>c._whisperEffectActivated&&!c.suppressed,isFaceDownCard:c=>!!c.faceDown,
    forEachBoardCard:fn=>board.forEach((zone,z)=>zone.forEach((row,r)=>row.forEach((c,col)=>fn(c,z,r,col)))),
    getEffectiveFate:t=>8+(t!==source&&!t.immune&&source._whisperEffectActivated?(copied==='10'?-3:3):0),
    flashCardEffect:(t,kind)=>flashes.push({iid:t.iid,kind}),setTimeout:fn=>fn(),
    getCardRuntimeEffectId:c=>c.id,activeSupporterAuraSource:()=>false,
    cardActsAsPassive:()=>false,getActiveWhisperTokens:()=>[{card:source,z:0,r:0,c:0}]});
  vm.runInContext(['getWhisperPlacementFlashTargets','getCoordinatorPlacementFlashTargets','scheduleCoordinatorPlacementFlash','getIncomingCoordinatorEffectSources'].map(extract).join('\n'),context);
  assert(context.scheduleCoordinatorPlacementFlash(source,{z:0,r:0,c:0,delayMs:0}));
  assert.deepEqual(flashes.map(f=>f.iid),targets.map(t=>t.iid));
  assert(flashes.every(f=>f.kind===(copied==='10'?'coord_postmodern_dylan':'coord_anne_trio')));
  assert.equal(context.scheduleCoordinatorPlacementFlash(source,{z:0,r:0,c:0}),false,'no duplicate placement overlay');
  assert.equal(context.getIncomingCoordinatorEffectSources(targets[2],2,1,0)[0].kind,flashes[0].kind,'later distant arrivals inherit overlay');
  assert.equal(context.getIncomingCoordinatorEffectSources(immune,2,1,1).length,0);
  source.suppressed=true;
  assert.equal(context.getWhisperPlacementFlashTargets(source).length,0);
  assert.equal(source._whisperEffectActivated,true);
}
console.log('Shizuku overlays: copied art, all zones, both owners, later arrivals, immunity, suppression and deduplication passed');
