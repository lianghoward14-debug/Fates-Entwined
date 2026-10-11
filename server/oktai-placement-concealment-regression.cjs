const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=p=>fs.readFileSync(p,'utf8');
const adapter=read('src/scripts/render-v2/04-match-renderer-adapter.js');
const helpers=read('src/scripts/06-rendering-and-helpers.js');
const ctx={G:{turn:8},getPerspectivePlayerIndex:()=>0,getCardIid:c=>c.iid,deferredPlacementFatePulseByIid:new Map(),completedPlacementFateRevealAtByIid:new Map(),deferredCoordinatorFatePulseByIid:new Map()};ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(helpers.slice(helpers.indexOf('function getBh21ViewerConcealmentState('),helpers.indexOf('function getBh21ConcealedNumericLabel(')),ctx);
vm.runInContext(adapter.slice(adapter.indexOf('  function coordinatorFatePresentationVisual('),adapter.indexOf('  function drawFateBadge(')),ctx);
const card={iid:'new-card',fate:5,_placementFateReveal:{createdAt:100,fromValue:5},_sequentialFateDisplayActive:true,_sequentialFateDisplayValue:7};
const visual={displayFate:9,currentFate:9,fate:5};
for(const mode of ['singleplayer','multiplayer']){
 ctx.G._bh21Concealment=mode==='singleplayer'?{targetPlayer:0,activeFromTurn:8,remainingTargetTurns:4}:null;
 ctx.G._phase7Statuses=mode==='multiplayer'?[{type:'TIMED_PLAYER_STATUS',statusType:'BH21_FATE_MORALE_CONCEALMENT',playerIndex:0,activeFromTurn:8,remainingTargetTurns:4}]:[];
 for(const phase of ['first-frame','pending-placement','sequential','coordinator']){
  const testCard={...card};ctx.deferredPlacementFatePulseByIid.clear();ctx.deferredCoordinatorFatePulseByIid.clear();
  if(phase==='pending-placement')ctx.deferredPlacementFatePulseByIid.set(card.iid,{fromValue:5});
  if(phase==='sequential')delete testCard._placementFateReveal;
  if(phase==='coordinator'){delete testCard._placementFateReveal;delete testCard._sequentialFateDisplayActive;ctx.deferredCoordinatorFatePulseByIid.set(card.iid,{fromValue:4});}
  assert.match(ctx.coordinatorFatePresentationVisual(testCard,visual).displayFate,/bh21-concealed-fate-icon/,mode+' '+phase);
 }
 ctx.G.turn=7;assert.equal(ctx.coordinatorFatePresentationVisual(card,visual).displayFate,'5','not active before target turn');ctx.G.turn=8;
}
ctx.G._phase7Statuses=[];ctx.G._bh21Concealment=null;
assert.equal(ctx.coordinatorFatePresentationVisual(card,visual).displayFate,'5','normal placement timing preserved');
assert.match(ctx.coordinatorFatePresentationVisual(card,{...visual,displayFate:'bh21-concealed-fate-icon'}).displayFate,/bh21-concealed-fate-icon/,'concealed snapshots preserved');
console.log('Oktai first-frame concealment passed: single-player and multiplayer, placement holds, staged values, coordinator holds, expiry and normal timing.');
