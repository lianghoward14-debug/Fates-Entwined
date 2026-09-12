import {stableStringify} from '../engine/index.mjs';
import {sampleWorld} from './belief.mjs';
import {searchWorld,diverseCommands} from './search.mjs';
import {createCommandOrderer} from './ordering.mjs';
import {filterAiTargets} from './targeting.mjs';
import {personalityFor} from './personality.mjs';
import {reviewPass} from './pass-review.mjs';

export function planDecision(commands,projection,context={}){
  const state=context.canonicalState;
  const player=Number(context.playerIndex ?? projection?.activePlayer ?? 0);
  if(!state)return null;
  const personality=personalityFor(context.style || context.personality);
  const integer=(value,fallback,min,max)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Math.floor(Number(value)))):fallback;
  const samples=integer(context.samples,context.difficulty==='easy'?1:3,1,8);
  const maxNodeBudget=integer(context.maxNodeBudget,4000,24,4000);
  const nodeBudget=Math.min(maxNodeBudget,integer(context.nodeBudget,context.difficulty==='easy'?240:context.difficulty==='extreme'?960:600,24,4000));
  const results=[];
  let candidates=filterAiTargets(commands,state,player).filter(c=>c.type!=='CONCEDE');
  // Makenna's protection must include an eligible friendly Alondra. Use the
  // engine's eligible set, so this never invents an out-of-zone target.
  const prompt=state.pendingPrompt;
  const board=state.board.flat(3).filter(Boolean);
  const source=board.find(c=>c.iid===prompt?.sourceIid);
  if(source?.id==='12' && Number(prompt.playerIndex)===player){
    const alondras=board.filter(c=>c.id==='14' && Number(c.controller ?? c.owner)===player
      && prompt.eligibleIids?.includes(c.iid));
    if(alondras.length){
      const protectedChoices=candidates.filter(c=>alondras.some(a=>
        c.payload?.selectedIid===a.iid || c.payload?.selectedIids?.includes(a.iid)));
      if(protectedChoices.length)candidates=protectedChoices;
    }
  }
  // Consider candidates across every plausible world before pruning. A move
  // useful against a threat in sample two must not disappear because the
  // first sampled opponent hand happened to contain no such threat.
  const worlds=Array.from({length:samples},(_,sample)=>sampleWorld(state,player,sample));
  const orderers=worlds.map(world=>createCommandOrderer(world,player));
  const priorities=new Map(candidates.map(command=>[command,orderers.map(order=>order(command))]));
  const ranked=candidates.map(command=>{
    const values=priorities.get(command);
    return {command,priority:values.reduce((a,b)=>a+b,0)/values.length};
  }).sort((a,b)=>b.priority-a.priority).map(item=>item.command);
  const requestedWidth=integer(context.width,12,2,32);
  const width=Math.min(requestedWidth,Math.max(2,Math.floor(nodeBudget/12)));
  const rootCommands=diverseCommands(ranked,width);
  // Reserve up to one slot per other sampled world for its best omitted
  // action. All retained actions still receive equal cross-world evaluation.
  for(let i=1;i<orderers.length && i<rootCommands.length-1;i++){
    const best=candidates.reduce((best,c)=>!best || priorities.get(c)[i]>priorities.get(best)[i]?c:best,null);
    if(best && !rootCommands.includes(best))rootCommands[rootCommands.length-i]=best;
  }
  for(const world of worlds){
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
  const targetingState=context.canonicalState || projection;
  if(targetingState?.board)commands=filterAiTargets(commands,targetingState,Number(context.playerIndex ?? projection?.activePlayer ?? 0));
  const actor=Number(context.playerIndex ?? projection?.activePlayer ?? 0);
  if(targetingState?.board && !targetingState.pendingPrompt && !targetingState.pendingHandLimit
    && !targetingState.board.flat(3).some(c=>c && Number(c.controller ?? c.owner)===actor)){
    const owner=targetingState.players?.[actor];
    const known=[...(owner?.hand || []),...(owner?.deck || [])];
    const fuel=commands.filter(c=>['SET_CARD','SET_CARD_FROM_DECK'].includes(c.type)
      && ['09','28','98'].includes(known.find(card=>card.iid===c.payload?.cardIid)?.id));
    if(fuel.length){
      const priority=createCommandOrderer(targetingState,actor);
      return fuel.map(command=>({command,score:priority(command)})).sort((a,b)=>b.score-a.score)[0].command;
    }
  }
  // Deliberately replan after every resolution, even if the previous intended
  // command remains legal. Legality does not prove a combo is still worthwhile.
  if(context.planCache)context.planCache.sequence=[];
  let plan=planDecision(commands,projection,context);
  // Passing is irreversible for this turn. Verify a shallow pass with a
  // larger bounded search, preserving every strategic target restriction.
  if(plan?.command?.type==='END_TURN' && context.canonicalState && !context.canonicalState.pendingPrompt
    && commands.some(c=>['SET_CARD','SET_CARD_FROM_DECK','CONSOLIDATE_CARD','ACTIVATE_EFFECT','SET_ADAPTIVE_TOKEN','FLIP_CARD'].includes(c.type))){
    const currentBudget=Number(context.nodeBudget) || (context.difficulty==='easy'?240:context.difficulty==='extreme'?960:600);
    if(currentBudget<Math.min(600,Number(context.maxNodeBudget)||4000)){
      const checked=planDecision(commands,projection,{...context,nodeBudget:600,width:Math.max(12,Number(context.width)||0),onDecision:undefined,onPlanEvaluated:undefined});
      if(checked)plan=checked;
    }
  }
  if(plan?.command?.type==='END_TURN' && context.canonicalState){
    const development=reviewPass(commands,context.canonicalState,actor,context);
    if(development)return development;
  }
  if(plan)return plan.command;
  if(projection?.board && projection?.players){
    const visible={...projection,players:projection.players.map(p=>({...p,hand:p.hand || [],deck:[],discard:p.discard || []}))};
    const priority=createCommandOrderer(visible,Number(context.playerIndex ?? projection.activePlayer ?? 0));
    return commands.filter(c=>c.type!=='CONCEDE').map(command=>({command,score:priority(command)}))
      .sort((a,b)=>b.score-a.score)[0]?.command || null;
  }
  return commands.find(c=>c.type!=='CONCEDE') || null;
}
