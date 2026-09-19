'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/scripts/05-gameplay-core.js'), 'utf8');
const endTurn = source.slice(source.indexOf('function endTurn(opts)'), source.indexOf('\nfunction showPassTurn('));
const winStart = source.indexOf('function checkWin()');
// Stop at the reward boundary so these tests exercise real outcome selection
// and reveal routing without profile writes or a browser DOM.
const win = source.slice(winStart, source.indexOf('  cleanupTutorialAndDialogueArtifacts({dismissTutorial:true});', winStart))
  + ' captured.push({winner,isDraw});\n}\n';
function fixture(morale, enabled = true) {
  const ctx = vm.createContext({
    G: {turn:8, maxTurns:24, currentPlayer:0, players:[{name:'P1'},{name:'P2'}], _moralePressure:{morale}},
    window:{FATE_MORALE_PRESSURE_RULES_ENABLED:enabled},
    _tutorialActive:false, captured:[], reveals:[], timers:[],
    hidePassTurnOverlay(){}, stopTurnTimer(){}, renderGame(){},
    getZoneScore:(z,p)=>p===1?10:0,
    setTimeout(fn){ctx.timers.push(fn);},
    showFinalZoneReveal(z,opts){ctx.reveals.push(opts);},
    // Any ordinary turn processing is a failure for an already defeated match.
    isCardInformationWindowOpen(){throw Error('ordinary turn processing');}
  });
  vm.runInContext(win + endTurn,ctx);
  return ctx;
}
for(const [morale,winner] of [[[100,0],0],[[0,100],1],[[0,0],-1]]) {
  const ctx=fixture(morale);
  assert.equal(ctx.endTurn(),false);
  assert.equal(ctx.captured.length,1);
  assert.equal(ctx.captured[0].winner,winner);
  assert.equal(ctx.captured[0].isDraw,winner===-1);
  assert.equal(ctx.G._endgameResolved,true);
  assert.equal(ctx.timers.length,0,'morale defeat must not wait on zone reveal');
  ctx.endTurn(); ctx.checkWin();
  assert.equal(ctx.captured.length,1,'repeated clicks must not award a second result');
}
const normal=fixture([100,100]);
normal.G.turn=24;
normal.checkWin();
assert.equal(normal.captured.length,0);
assert.equal(normal.G._finalZoneRevealActive,true);
assert.equal(normal.endTurn(),false,'no turn effects during final reveal');
normal.timers.shift()();
assert.equal(normal.reveals.length,1);
normal.reveals[0].onComplete();
assert.equal(normal.captured.length,1);
assert.equal(normal.captured[0].winner,1);
for(const ctx of [fixture([100,0],false),fixture([100,0])]) {
  if(ctx.window.FATE_MORALE_PRESSURE_RULES_ENABLED) ctx.G._freePlayGameSettings={healthPressureSeals:false};
  assert.throws(()=>ctx.endTurn(),/ordinary turn processing/,'disabled morale must not end the match');
}
console.log('Zero-morale End Turn regression passed: both seats, draw, repeat clicks, final reveal, disabled rules');
