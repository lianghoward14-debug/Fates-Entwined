import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const core=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');
const ai=fs.readFileSync('src/scripts/07-ai.js','utf8');
for(const seat of [0,1]) for(const animated of [false,true]) for(const sameZone of [false,true]) for(const fromDeck of [false,true]){
 const julio={id:'109',iid:'julio',owner:1-seat,currentFate:2};
 const support={id:'32',iid:'support',type:'Supporter',name:'Support',fate:1};
 const G={currentPlayer:seat,aiPlayer:seat,_onlineRng:()=>.5,players:[{hand:[],deck:[]},{hand:[],deck:[]}],board:Array.from({length:3},()=>Array.from({length:3},()=>[null,null,null])),supportsPlacedThisTurn:0};
 G.players[seat][fromDeck?'deck':'hand'].push(support);G.board[0][seat?2:0][0]=julio;
 const rolls=[],runtime={G,window:{presentDonJulioDieRoll:e=>rolls.push(e)},isFishCounter:()=>false,newInstance:c=>({...c}),getPlacedCardFate:c=>c.fate,consumePendingPlacementFlags(){},isFaceDownCard:()=>false,playCardSetAudio(){},log(){},renderGame(){},resolveSetCardAfterPlacement:async inst=>{assert.equal(rolls.length,0);await runtime.resolveDonJulioSupporterArrival(inst)},aiSleep:async()=>{},AI_VISUAL_PAUSE_PLACE:0,isCardEffectSuppressed:()=>false,modifyFate:(c,n)=>{c.currentFate+=n},forEachBoardCard:fn=>G.board.forEach((zone,z)=>zone.forEach((row,r)=>row.forEach((c,col)=>{if(c)fn(c,z,r,col)})))};
 if(animated)runtime.window.FateActionPresentation={beginSetCard:opts=>{opts.commit();return true}};
 vm.createContext(runtime);vm.runInContext(core.slice(0,core.indexOf('function hasNoSuppressibleFieldEffect')),runtime);
 vm.runInContext(ai.slice(ai.indexOf('async function aiDoPlace('),ai.indexOf('async function aiDoConsolidate(')),runtime);
 await runtime.aiDoPlace({card:support,z:sameZone?0:1,r:seat?0:2,c:1,fromDeck});
 assert.equal(G.players[seat][fromDeck?'deck':'hand'].length,0);
 assert.equal(julio.currentFate,sameZone?6:2);assert.equal(rolls.length,sameZone?1:0);
 if(sameZone)assert.equal(rolls[0].roll,4);
}
console.log('Don Julio actual AI placement: both seats, animated/direct commits, hand/deck placement and zone exclusion passed.');
for(const seat of [0,1]){
 const julio={id:'109',owner:1-seat,currentFate:2,iid:'julio'},placed={id:'79',owner:seat,iid:'support'},rolls=[];
 const runtime={G:{board:[[[julio,placed]]],_onlineRng:()=>0},window:{presentDonJulioDieRoll:e=>rolls.push(e)},markCardSetTurn(){},cardActsAsPassive:()=>false,isCardEffectSuppressed:()=>false,modifyFate:(c,n)=>{c.currentFate+=n},forEachBoardCard:fn=>fn(julio,0,0,0)};
 vm.createContext(runtime);vm.runInContext(core.slice(0,core.indexOf('function hasNoSuppressibleFieldEffect')),runtime);
 vm.runInContext(core.slice(core.indexOf('function applyHavanoPlacementRules('),core.indexOf('function showHavanoDeploymentOptions(')),runtime);
 assert.equal(runtime.applyHavanoPlacementRules(placed,placed,0,0,1,seat),true);assert.equal(julio.currentFate,3);assert.equal(rolls.length,0);await runtime.resolveDonJulioSupporterArrival(placed);assert.equal(rolls.length,1);
}
console.log('Don Julio Havano deployment: both seats passed.');
