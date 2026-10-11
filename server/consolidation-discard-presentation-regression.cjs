const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/scripts/18-online-rooms.js','utf8');
const start=source.indexOf("      if(type === 'CARD_DISCARDED' && target){"),end=source.indexOf("      if(type === 'CARD_TRANSFERRED'",start);assert(start>=0&&end>start);
for(const reason of ['CONSOLIDATION_TRIBUTE','SANTIAGO_CALL_TO_ARMS_COST','OTHER_EFFECT'])for(const faceDown of [true,false]){
 const motions=[],sounds=[];const target={iid:'tribute',owner:0,faceDown};const context={type:'CARD_DISCARDED',target,event:{reason,cardIid:'tribute'},events:[],view:{},targetLocation:{zone:'board',z:1,r:2,c:0},resultMotionStarted:false,phase7DiscardPresentationCard:()=>target,window:{FateV2CardMotionFx:{flyBoardCard:(...args)=>{motions.push(args);return true;}},playDiscardSfx:()=>sounds.push('discard')}};
 vm.createContext(context);vm.runInContext('(function(){'+source.slice(start,end)+'})()',context);
 assert.equal(motions.length,reason==='CONSOLIDATION_TRIBUTE'?0:1);assert.equal(sounds.length,motions.length);
}
console.log('Consolidation tributes never replay a late discard; effect discards retain motion and sound for face-up/down cards');
