// Compatibility entry points for the local session and server takeover callers.
// All decisions belong to the shared replacement policy; no cached legacy plan.
import {planDecision,chooseCommand} from '../../shared/ai/policy.mjs';
import {searchWorld,diverseCommands} from '../../shared/ai/search.mjs';
import {sampleWorld} from '../../shared/ai/belief.mjs';
import {createCommandOrderer} from '../../shared/ai/ordering.mjs';
export const planStrategicV3AiTurn=planDecision;
export const chooseStrategicV3AiCommand=chooseCommand;
export const selectDiverseAiCommands=diverseCommands;
const orderingCache=new WeakMap();
export function scoreStrategicV3AiCommand(command,projection,context={}){
  const state=context.canonicalState || {...projection,players:(projection.players || []).map(p=>({...p,hand:p.hand || [],deck:[],discard:p.discard || []}))};
  const player=Number(context.playerIndex ?? projection.activePlayer ?? 0);
  if(!orderingCache.has(state))orderingCache.set(state,new Map());
  const cache=orderingCache.get(state);
  if(!cache.has(player))cache.set(player,createCommandOrderer(state,player));
  return cache.get(player)(command);
}
export function evaluateAiCounterplay(state,player,context={}){
  const result=searchWorld(sampleWorld(state,player),player,{nodeBudget:context.nodeBudget || 240,maxSteps:16,width:4});
  return {score:result.score,simulations:result.trace.simulated,trace:result.trace};
}
