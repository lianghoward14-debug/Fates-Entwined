import {legalCommandTemplates, reduceCommand, stableStringify} from '../engine/index.mjs';
import {evaluatePosition} from './position.mjs';
import {createCommandOrderer} from './ordering.mjs';
import {filterAiTargets} from './targeting.mjs';
import {personalityFor} from './personality.mjs';
import {completeContinuation} from './continuation.mjs';
import {turnActionHorizon} from './turn-horizon.mjs';

export function diverseCommands(commands, limit) {
  const buckets = new Map();
  for (const command of commands) {
    const p = command.payload || {};
    const key = [command.type,p.cardIid || p.sourceIid || p.reactionIid || '',
      p.choice || p.cancel || '',p.selectedIid || p.targetIid || '',
      [...(p.selectedIids || [])].sort().join(',')].join(':');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(command);
  }
  const groups = [...buckets.values()];
  // Try a card in different zones before spending the budget on several
  // equivalent squares in its highest-ranked zone.
  for(let index=0;index<groups.length;index++){
    const first=[],rest=[],seen=new Set();
    for(const command of groups[index]){
      const p=command.payload || {};
      const key=p.destination ? `${p.destination.z}:${p.faceDown===true}` : stableStringify(p);
      if(!seen.has(key)){seen.add(key);first.push(command);}else rest.push(command);
    }
    groups[index]=[...first,...rest];
  }
  const end = groups.findIndex(group=>group[0].type === 'END_TURN');
  if (end > 0) groups.unshift(groups.splice(end,1)[0]);
  const result = [];
  for (let round=0; result.length<limit; round++) {
    let added = false;
    for (const group of groups) if (group[round] && result.length<limit) {
      result.push(group[round]); added=true;
    }
    if (!added) break;
  }
  return result;
}

// This entry point searches hypothetical worlds. Live callers must use the
// observation/belief boundary in policy.mjs, never pass a live hidden state.
export function searchWorld(world, player, {nodeBudget=480,maxSteps=16,width=6,rootCommands,personality=personalityFor()}={}) {
  if (![0,1].includes(player)) throw new RangeError('Invalid player');
  if (![nodeBudget,maxSteps,width].every(n=>Number.isInteger(n)&&n>0)) throw new RangeError('Positive integer search limits required');
  const trace={generated:0,simulated:0,rejected:0,pruned:0,budgetExhausted:false,maxDepth:0,opponentSimulations:0,resolutionSimulations:0,completedContinuations:0,incompleteContinuations:0};
  const rootTurn=world.turn;
  const values=new WeakMap();
  const evaluate=state=>{
    if(!values.has(state))values.set(state,evaluatePosition(state,player,personality));
    return values.get(state);
  };
  function visit(state,steps,budget,turnActions=0) {
    const score=evaluate(state);
    trace.maxDepth=Math.max(trace.maxDepth,steps);
    if (state.outcome || steps>=maxSteps || state.turn>rootTurn+1 || budget<1) {
      if(budget<1)trace.budgetExhausted=true;
      return {score,principalVariation:[]};
    }
    // Recursive width otherwise divides the remaining budget until every
    // leaf ends mid-combo. Spend the last branch budget finishing the turn
    // and a reply instead of opening another shallow layer.
    if(steps>0 && budget<=48){
      const continuation=completeContinuation(state,player,{budget,personality,rootTurn,maxSteps:maxSteps-steps,turnActions});
      for(const key of ['simulated','rejected','opponentSimulations','resolutionSimulations'])trace[key]+=continuation.trace[key];
      trace[continuation.trace.completed?'completedContinuations':'incompleteContinuations']++;
      trace.maxDepth=Math.max(trace.maxDepth,steps+continuation.principalVariation.length);
      return continuation;
    }
    const current=Number(state.pendingPrompt?.playerIndex ?? state.pendingHandLimit?.playerIndex ?? state.activePlayer);
    const maximizing=current===player;
    let legal=filterAiTargets(steps===0 && rootCommands ? rootCommands : legalCommandTemplates(state,current),state,current).filter(c=>c.type!=='CONCEDE');
    const resolving=!!(state.pendingPrompt || state.pendingHandLimit);
    // Complete each hypothetical turn so a long solitaire sequence cannot
    // consume the entire horizon before any opponent reply is considered.
    if(steps>0 && !resolving && turnActions>=turnActionHorizon(legal)){
      const end=legal.find(c=>c.type==='END_TURN');
      if(end)legal=[end];
    }
    trace.generated+=legal.length;
    // Reserve work for continuations; hundreds of placements must not consume
    // the whole budget before a single opponent reaction can be examined.
    const priority=createCommandOrderer(state,current);
    const ranked=legal.map(command=>({command,priority:priority(command)}))
      .sort((a,b)=>b.priority-a.priority).map(item=>item.command);
    const branchWidth=steps===0 ? width : resolving || current!==player || steps<3 ? 2 : 1;
    const candidates=steps===0 && rootCommands ? ranked.slice(0,budget)
      : diverseCommands(ranked,Math.min(branchWidth*3,Math.max(1,Math.floor(budget/3))));
    trace.pruned+=legal.length-candidates.length;
    const children=[];
    const settlementBudget=Math.min(12,Math.max(0,Math.floor((budget-candidates.length)/Math.max(1,candidates.length*2))));
    for (const command of candidates) {
      budget--;
      const payload=command.manualOnly === true
        ? {...(command.payload || {}), userActivated:true}
        : (command.payload || {});
      const result=reduceCommand(state,{type:command.type,payload,
        matchId:state.matchId,expectedRevision:state.revision,commandId:`new-ai:${trace.simulated+trace.rejected}:${steps}`},
        {playerId:state.players[current].id});
      if(!result.ok){trace.rejected++;continue;}
      trace.simulated++;
      if(current!==player)trace.opponentSimulations++;
      if(state.pendingPrompt || state.pendingHandLimit)trace.resolutionSimulations++;
      let childState=result.state,settlement=[];
      // Compare resolved effects, not the cost paid before their target or
      // search picker. Opponent reactions are chosen by their own controller.
      if(settlementBudget>0 && (childState.pendingPrompt || childState.pendingHandLimit)){
        const resolved=completeContinuation(childState,player,{budget:Math.min(budget,settlementBudget),personality,maxSteps:Math.max(1,maxSteps-steps-1),resolutionOnly:true});
        const spent=resolved.trace.simulated+resolved.trace.rejected;
        budget-=spent;
        for(const key of ['simulated','rejected','opponentSimulations','resolutionSimulations'])trace[key]+=resolved.trace[key];
        childState=resolved.state;settlement=resolved.principalVariation;
      }
      children.push({command,executableCommand:payload === command.payload ? command : {...command,payload},state:childState,settlement,score:evaluate(childState)});
    }
    children.sort((a,b)=>(maximizing?b.score-a.score:a.score-b.score)||stableStringify(a.command).localeCompare(stableStringify(b.command)));
    if(children[0]?.state.outcome && (maximizing ? children[0].score>=1e6 : children[0].score<=-1e6)){
      const alternatives=children.map(child=>({command:child.command,score:child.score,principalVariation:[{player:current,command:child.executableCommand},...child.settlement]}));
      return {...alternatives[0],alternatives:steps===0?alternatives:undefined};
    }
    const selectedCommands=children.slice(0,steps===0 ? children.length : branchWidth).map(c=>c.command);
    // Immediate board valuation cannot price an unresolved negate correctly.
    // Keep both accepting the effect and spending a reaction until resolution.
    if(steps>0 && state.pendingPrompt?.type==='REACTION'){
      // NEGATE and SUPPRESS have different future costs. Keep each available
      // reaction source/mode, rather than only the first response to decline.
      const responses=new Set();
      for(const child of children){
        const p=child.command.payload || {};
        const key=`${p.reactionIid || ''}:${p.choice || ''}`;
        if(responses.has(key))continue;
        responses.add(key);
        if(!selectedCommands.includes(child.command))selectedCommands.push(child.command);
      }
    }
    // Preserve one different source at early setup nodes. Otherwise two
    // placements of the same immediate-value card can erase the engine line.
    if(steps>0 && steps<4 && !resolving && children.length>branchWidth){
      const family=command=>command.type+':'+(command.payload?.cardIid || command.payload?.sourceIid || '');
      const families=new Set(selectedCommands.map(family));
      const setup=children.find(child=>child.command.type!=='END_TURN' && !families.has(family(child.command)));
      if(setup)selectedCommands.push(setup.command);
    }
    const selected=selectedCommands.map(command=>children.find(child=>child.command===command));
    const alternatives=[];
    for(let index=0;index<selected.length;index++){
      const child=selected[index];
      const share=Math.floor(budget/selected.length)+(index<budget%selected.length?1:0);
      const nextActions=child.state.turn!==state.turn?0:turnActions+(resolving?0:1);
      const tail=visit(child.state,steps+1+child.settlement.length,share,nextActions);
      alternatives.push({command:child.command,score:tail.score,principalVariation:[{player:current,command:child.executableCommand},...child.settlement,...tail.principalVariation]});
    }
    alternatives.sort((a,b)=>(maximizing?b.score-a.score:a.score-b.score)||stableStringify(a.command).localeCompare(stableStringify(b.command)));
    return alternatives.length ? {...alternatives[0],alternatives:steps===0?alternatives:undefined} : {score,principalVariation:[]};
  }
  const result=visit(world,0,nodeBudget);
  return {...result,command:result.command || null,sequence:result.principalVariation.map(step=>step.command),trace};
}
