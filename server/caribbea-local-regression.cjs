const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');
const extract=name=>{const start=core.indexOf('function '+name+'(');assert(start>=0);return core.slice(core.slice(Math.max(0,start-6),start)==='async '?start-6:start,core.indexOf('\n}',start)+2);};
(async()=>{
for(const seat of [0,1]){
  let calls=0;
  const g={turn:4,players:[{deck:[],originalDeckIds:[]},{deck:[],originalDeckIds:[]}],board:[[[null,null],[null,null],[null,null]]]};
  const ctx={G:g,CARDS:[{id:'114',aff:'eventide'}],window:{resolveHopliteCallToArms:async()=>calls++},
    isFaceDownCard:c=>c.faceDown,isTargetImmuneToEffectOwner:c=>!!c.immune,
    modifyFate:(c,n)=>c.currentFate+=n,applyPairedOverlayFateGain:(c,n)=>c.currentFate+=n,scheduleCoordinatorRevealFlash(){},renderGame(){},
    cardActsAsPassive:(c,id)=>c.id===id,isCardEffectSuppressed:c=>!!c.suppressed,
    isCardEffectImmutable:()=>false,isZoeConsolidationBlockedAt:()=>false};
  vm.createContext(ctx);
  for(const name of ['resolveCaribbeaSupporter','flipFaceDownBoardCard','getMilitaryBlockadeTurns','canUseAsConsolidationTribute'])vm.runInContext(extract(name),ctx);
  const prior={owner:seat,faceDown:true,currentFate:1};ctx.flipFaceDownBoardCard(prior,0,0,0);
  await ctx.resolveCaribbeaSupporter({iid:'rev'},seat,'112');assert.equal(prior.currentFate,1);
  const future={owner:seat,faceDown:true,currentFate:1};ctx.flipFaceDownBoardCard(future,0,0,0);assert.equal(future.currentFate,5);
  ctx.flipFaceDownBoardCard(future,0,0,0);assert.equal(future.currentFate,5);
  g.turn++;const late={owner:seat,faceDown:true,currentFate:1};ctx.flipFaceDownBoardCard(late,0,0,0);assert.equal(late.currentFate,1);
  for(const count of [29,30]){g.players[seat].originalDeckIds=Array(count).fill('114');await ctx.resolveCaribbeaSupporter({},seat,'115');assert.equal(calls,count===30?1:0);}
  const target={type:'Supporter',owner:seat,_setTurn:5};g.board[0][0]=[{id:'114',owner:1-seat},{id:'114',owner:1-seat}];
  assert.equal(ctx.canUseAsConsolidationTribute(target,seat,0,2,0),false);
  g.turn=7;assert.equal(ctx.canUseAsConsolidationTribute(target,seat,0,2,0),false);
  g.board[0][0][1]=null;assert.equal(ctx.canUseAsConsolidationTribute(target,seat,0,2,0),true);
  vm.runInContext(fs.readFileSync('src/scripts/51-ledger-archive.js','utf8'),ctx);
  const deck=Array.from({length:7},(_,i)=>({iid:'c'+i,id:String(i),fate:i}));g.players[1-seat].deck=deck.slice();
  await ctx.resolveCaribbeaSupporter({iid:'oligarch'},seat,'113',true);
  assert.deepEqual(Array.from(g.players[1-seat].deck,c=>c.iid),['c0','c1','c2','c3','c4','c5','c6']);
  assert.equal(g.players[seat].deck.length,0);
}
console.log('Local Caribbea Supporters: future flips, turn expiry, live blockade, original deck condition and opponent AI ordering passed');
})().catch(e=>{console.error(e);process.exitCode=1});
