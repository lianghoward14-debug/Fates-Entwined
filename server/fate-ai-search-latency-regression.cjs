'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('src/scripts/07-ai.js','utf8');
const slice=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
async function main(){
  for(const stage of ['score','simulate','deep']){
    let now=0;
    const moves=Array.from({length:100},(_,i)=>({id:i}));
    const ctx=vm.createContext({G:{aiDifficulty:'medium',currentPlayer:1,aiPlayer:1,turn:2,_aiTurnToken:1},
      aiNowMs:()=>now,aiTurnTimeExpired:()=>false,aiHasPerfectHandKnowledge:()=>false,
      aiEvaluateMove:move=>{now+=stage==='score'?100:0;return move.id;},
      aiSimulateOutcome:()=>{now+=stage==='simulate'?100:0;return 0;},
      aiDeepEval:()=>{now+=stage==='deep'?100:0;return 0;},
      aiYieldToFrame:async()=>{},aiIntelligence:()=>null});
    vm.runInContext('const AI_SEARCH_QUEUE_FRAME_BUDGET_MS=1.75;'+slice('async function aiRunSearchQueue(', 'function aiSelectMCTSChild('),ctx);
    const result=await ctx.aiChooseMoveWithMCTS(moves,{}, {turnNumber:2,turnToken:1});
    assert(result && moves.includes(result.move),stage+' must retain a legal evaluated move');
    assert(now<=400,stage+' must stop within one evaluation of the deadline');
  }
  let now=0,visits=0;
  const ctx=vm.createContext({aiNowMs:()=>now,aiShouldAbortSearch:()=>false,
    aiSelectMCTSChild:c=>c[0],aiMCTSPlayout:()=>{visits++;now+=100;return 1;},aiYieldToFrame:async()=>{}});
  vm.runInContext(slice('async function aiRunRootMCTS(', 'function aiSelectMCTSChild('),ctx);
  await ctx.aiRunRootMCTS([{move:{},combined:1}],{budgetMs:200,minVisits:72,maxChunkMs:2},{});
  assert.equal(visits,2,'minimum visits must not override elapsed time');
  console.log('AI search latency regression passed: scoring, simulation, deep evaluation and MCTS deadlines.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
