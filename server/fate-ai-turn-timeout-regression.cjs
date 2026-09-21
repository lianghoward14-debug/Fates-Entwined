'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = fs.readFileSync('src/scripts/05-gameplay-core.js', 'utf8');
const ai = fs.readFileSync('src/scripts/07-ai.js', 'utf8');
const slice = (source, start, end)=>source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

async function main(){
  // Real timer implementation: both 30-second and ordinary turns, paused
  // interactions, delayed callbacks, and stale callbacks after handoff.
  for(const limit of [30, 180]){
    let now = 0, tick, paused = false;
    const G = {turn:2, currentPlayer:1, aiPlayer:1, aiEnabled:true};
    const ctx = vm.createContext({G, Date:{now:()=>now},
      getTurnTimeLimit:()=>limit, isTurnTimerInteractionPaused:()=>paused,
      updateAITurnVisualTimerDisplay(){}, stopAITurnVisualTimer(){},
      setInterval:fn=>(tick=fn, 1)});
    vm.runInContext('let _aiTurnVisualSeconds, _aiTurnVisualTimerInterval;'+slice(core,
      'function startAITurnVisualTimer()', '// Stop all game-related timers'), ctx);
    ctx.startAITurnVisualTimer();
    paused=true; now=10000; tick();
    assert.equal(G._aiTimedOutTurn,null);
    paused=false; now+=limit*1000-1; tick();
    assert.equal(G._aiTimedOutTurn,null);
    now++; tick();
    assert.equal(G._aiTimedOutTurn,2);
    G.turn=3; G.currentPlayer=0; G._aiTimedOutTurn=null;
    tick(); assert.equal(G._aiTimedOutTurn,null);
  }

  for(const mode of ['normal','already-expired','search-expiry','pacing-expiry','resolution-expiry']){
    const G={turn:2,currentPlayer:1,aiPlayer:1,aiEnabled:true,players:[{hand:[],deck:[]},{hand:[{}],deck:[]}]};
    let ends=0, placements=0, resolved=false;
    if(mode==='already-expired')G._aiTimedOutTurn=2;
    const ctx=vm.createContext({G,window:{},console,Date,
      log(){},getAIDifficultySettings:()=>({}),aiObserveOpponentAndPlan(){},
      aiResolveAutomaticBoardEffects:async()=>{},aiClearZoneScoreCache(){},aiInvalidateZoneScoreCache(){},
      aiGenerateAllMoves:()=>mode==='normal'?[]:[{type:'place'}],
      aiChooseMoveWithMCTS:async()=>{
        if(mode==='search-expiry')G._aiTimedOutTurn=G.turn;
        return {move:{type:'place'},score:1};
      },
      aiSleep:async ms=>{if(mode==='pacing-expiry'&&ms===1100)G._aiTimedOutTurn=G.turn;},
      aiDoPlace:async()=>{placements++;G._aiTimedOutTurn=G.turn;await Promise.resolve();resolved=true;},
      aiActivateEffects:async()=>{},aiWaitForInteractionAnimations:async()=>{},
      AI_VISUAL_PAUSE_THINK:1100,AI_VISUAL_PAUSE_ENDTURN:700,
      endTurn:opts=>{
        assert.equal(opts.aiCompletion,true);
        if(mode==='resolution-expiry')assert.equal(resolved,true);
        ends++;G.currentPlayer=0;G.turn++;return true;
      }});
    vm.runInContext(slice(ai,'function aiTurnTimeExpired()', '// A backgrounded renderer'),ctx);
    await ctx.runAITurn();
    assert.equal(ends,1,mode+' hands back control exactly once');
    assert.equal(placements,mode==='resolution-expiry'?1:0,mode+' cannot start a late card');
    assert.equal(G._aiRunning,false);
  }

  // A suspended renderer never supplies the requested animation frame.
  const ctx=vm.createContext({setTimeout,clearTimeout,requestAnimationFrame:()=>1,
    cancelAnimationFrame(){},aiRecordSearchQueueYield(){}});
  vm.runInContext(slice(ai,'function aiYieldToFrame(', 'async function aiRunSearchQueue('),ctx);
  let timeout;
  try{
    await Promise.race([ctx.aiYieldToFrame('test',1),new Promise((_,reject)=>{
      timeout=setTimeout(()=>reject(Error('Search stayed stuck waiting for animation frame')),1000);
    })]);
  }finally{clearTimeout(timeout);}
  console.log('AI turn regression passed: normal completion, both timers, pauses, stale callbacks, search/pacing/resolution expiry, suspended animation frames.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
