import {stableStringify} from '../engine/index.mjs';
import {sampleWorld} from './belief.mjs';
import {searchWorld,diverseCommands} from './search.mjs';
import {createCommandOrderer} from './ordering.mjs';
import {personalityFor} from './personality.mjs';

export function planDecision(commands,projection,context={}){
  const state=context.canonicalState;
  const player=Number(context.playerIndex ?? projection?.activePlayer ?? 0);
  if(!state)return null;
  const personality=personalityFor(context.style || context.personality);
  const integer=(value,fallback,min,max)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Math.floor(Number(value)))):fallback;
  const samples=integer(context.samples,context.difficulty==='easy'?1:3,1,8);
  const nodeBudget=integer(context.nodeBudget,context.difficulty==='easy'?240:context.difficulty==='extreme'?960:600,24,4000);
  const results=[];
  const candidates=commands.filter(c=>c.type!=='CONCEDE');
  // Each sample uses the same root candidates, allowing like-for-like estimates.
  let rootCommands=null;
  for(let sample=0;sample<samples;sample++){
    const world=sampleWorld(state,player,sample);
    if(!rootCommands){
      const priority=createCommandOrderer(world,player);
      const ranked=candidates.map(command=>({command,priority:priority(command)}))
        .sort((a,b)=>b.priority-a.priority).map(item=>item.command);
      const requestedWidth=integer(context.width,12,2,32);
      rootCommands=diverseCommands(ranked,Math.min(requestedWidth,Math.max(2,Math.floor(nodeBudget/12))));
    }
    results.push(searchWorld(world,player,{nodeBudget,maxSteps:20,width:rootCommands.length || 1,rootCommands,personality}));
  }
  const aggregate=new Map();
  for(const result of results)for(const option of result.alternatives || []){
    const key=stableStringify(option.command);
    if(!aggregate.has(key))aggregate.set(key,{command:option.command,scores:[],principalVariation:option.principalVariation,variationScore:option.score});
    const row=aggregate.get(key);
    row.scores.push(option.score);
    if(option.score<row.variationScore){row.variationScore=option.score;row.principalVariation=option.principalVariation;}
  }
  const alternatives=[...aggregate.values()].filter(row=>row.scores.length===samples).map(row=>{
    const mean=row.scores.reduce((a,b)=>a+b,0)/samples;
    const worst=Math.min(...row.scores);
    const score=worst<=-900000 ? -2000000+mean : mean*(1-personality.risk)+worst*personality.risk;
    return {...row,mean,worst,score};
  }).sort((a,b)=>b.score-a.score || a.principalVariation.length-b.principalVariation.length || stableStringify(a.command).localeCompare(stableStringify(b.command)));
  const best=alternatives[0];
  if(!best)return null;
  const sequence=[];
  for(const step of best.principalVariation){if(step.player!==player)break;sequence.push(step.command);if(step.command.type==='END_TURN')break;}
  const trace={policy:'rules-search-v1',personality,samples,simulations:results.reduce((n,r)=>n+r.trace.simulated,0),
    opponentSimulations:results.reduce((n,r)=>n+r.trace.opponentSimulations,0),
    resolutionSimulations:results.reduce((n,r)=>n+r.trace.resolutionSimulations,0),
    completedContinuations:results.reduce((n,r)=>n+(r.trace.completedContinuations || 0),0),
    incompleteContinuations:results.reduce((n,r)=>n+(r.trace.incompleteContinuations || 0),0),
    maxDepth:Math.max(...results.map(r=>r.trace.maxDepth)),alternatives:alternatives.map(({command,score,mean,worst})=>({command,score,mean,worst}))};
  context.onPlanEvaluated?.(alternatives.map(row=>({score:row.score,sequence:row.principalVariation.map(step=>step.command)})));
  context.onDecision?.(trace);
  const exactCommand=candidates.find(command=>stableStringify(command)===stableStringify(best.command));
  if(!exactCommand)return null;
  return {command:exactCommand,sequence,score:best.score,principalVariation:best.principalVariation,
    actions:sequence.filter(c=>!['ANSWER_PROMPT','END_TURN','DISCARD_TO_HAND_LIMIT'].includes(c.type)).length,
    depth:trace.maxDepth,replySimulations:trace.opponentSimulations,trace};
}

export function chooseCommand(commands,projection,context={}){
  // Deliberately replan after every resolution, even if the previous intended
  // command remains legal. Legality does not prove a combo is still worthwhile.
  if(context.planCache)context.planCache.sequence=[];
  const plan=planDecision(commands,projection,context);
  if(plan)return plan.command;
  if(projection?.board && projection?.players){
    const visible={...projection,players:projection.players.map(p=>({...p,hand:p.hand || [],deck:[],discard:p.discard || []}))};
    const priority=createCommandOrderer(visible,Number(context.playerIndex ?? projection.activePlayer ?? 0));
    return commands.filter(c=>c.type!=='CONCEDE').map(command=>({command,score:priority(command)}))
      .sort((a,b)=>b.score-a.score)[0]?.command || null;
  }
  return commands.find(c=>c.type!=='CONCEDE') || null;
}
