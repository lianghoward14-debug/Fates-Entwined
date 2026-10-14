const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/scripts/render-v2/04-match-renderer-adapter.js', 'utf8');
function extract(name) {
  const start = source.indexOf('  function ' + name + '(');
  assert(start >= 0);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
}
function scenario(lockName, releaseEarly) {
  let now = 1000, nextId = 0;
  const timers = new Map(), feedback = [];
  const card = {iid:'support', id:'32', fate:1, _placementFateReveal:{createdAt:1000, mode:'set', fromValue:1, majaBoost:true}};
  const game = {board:[[[card]]], [lockName]:6000};
  const ctx = {
    G:game, Date:{now:()=>now},
    window:{flashCardEffect:()=>feedback.push(['overlay', now])},
    setTimeout:(fn, delay)=>{const id=++nextId; timers.set(id,{fn, at:now+delay}); return id;},
    clearTimeout:id=>timers.delete(id),
    deferredPlacementFatePulseByIid:new Map(), completedPlacementFateRevealAtByIid:new Map(),
    pendingBh07OverclockByPlacedIid:new Map(),
    postConsolidationAnimationUntil:()=>Math.max(game._effectActivationPresentationLockUntil||0,game._coordinatorSignatureUntil||0),
    getCardIid:c=>c.iid, getTimeline:()=>({clearForCardKind(){}}),
    presentFateDelta:()=>feedback.push(['fate',now]), scheduleRender(){}
  };
  vm.createContext(ctx);
  for(const name of ['placementFateRevealUntil','clearLivePlacementFateReveal','schedulePlacementFateReveal','deferPlacementFateReveal']) vm.runInContext(extract(name),ctx);
  ctx.deferPlacementFateReveal(card,5);
  function advance(until) {
    while(true) {
      const entry=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];
      if(!entry || entry[1].at>until) break;
      timers.delete(entry[0]); now=entry[1].at; entry[1].fn();
    }
    now=until;
  }
  advance(1400);
  assert.equal(feedback.length,0,'active presentation must still block reveal');
  if(releaseEarly) {
    game[lockName]=0;
    advance(1500);
    assert.equal(feedback.length,2,'released reservation must not leave a five-second idle gap');
  } else {
    advance(5999);
    assert.equal(feedback.length,0,'do not skip an ongoing presentation');
    advance(6200);
    assert.equal(feedback.length,2);
  }
  assert.equal(feedback[0][1],feedback[1][1],'overlay and Fate start together');
  advance(7000);
  assert.equal(feedback.length,2,'present exactly once');
}
for(const lock of ['_cinematicUiLockUntil','_actionPresentationLockUntil','_effectActivationPresentationLockUntil','_coordinatorSignatureUntil']) {
  scenario(lock,true);
  scenario(lock,false);
}
console.log('Maja placement: early lock release, active lock preservation, synchronized single reveal passed');
