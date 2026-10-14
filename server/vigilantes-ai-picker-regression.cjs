const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');
const start=source.indexOf('async function activateVigilantes('),end=source.indexOf('\nfunction startWolfCreekMove',start);
(async()=>{
 for(const ai of [0,1]){
  let picker=0;const marks=[];
  const card={id:'52',owner:ai},weak={iid:'weak',owner:1-ai,fate:2},strong={iid:'strong',owner:1-ai,fate:8},immune={owner:1-ai,fate:99,immune:true};
  const context={G:{aiEnabled:true,aiPlayer:ai,currentPlayer:1-ai,board:[[[card,weak,strong,immune]],[[{owner:1-ai,fate:100}]]]},
   beginManualSupporterEffectActivation:async()=>true,isTargetImmuneToEffectOwner:target=>!!target.immune,
   markCardForVigilantes:(target,source,owner)=>marks.push({target,owner}),pickCardInZone:()=>picker++,
   toast:()=>{},log:()=>{},playSfx:()=>{},renderEffectResolutionForPlayer:()=>{},renderGame:()=>{}};
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);
  await context.activateVigilantes(card,0,0,0,{activationAlreadyCounted:true});
  assert.equal(picker,0);assert.equal(marks.length,1);assert.equal(marks[0].target,strong);assert.equal(marks[0].owner,ai);assert.equal(card.vigilanteUsed,true);
  context.G.board[0]=[[card,immune]];marks.length=0;
  await context.activateVigilantes(card,0,0,0,{activationAlreadyCounted:true});
  assert.equal(picker,0);assert.equal(marks.length,0);
  context.G.aiPlayer=1-ai;
  await context.activateVigilantes(card,0,0,0,{activationAlreadyCounted:true});
  assert.equal(picker,1,'human controller keeps its picker');
 }
 console.log('PASS: both AI seats choose legal same-zone targets without prompting the human; immunity, no-target and human choice preserved.');
})().catch(error=>{console.error(error);process.exitCode=1;});
