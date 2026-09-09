import {legalCommandTemplates,reduceCommand} from '../engine/index.mjs';
import {evaluatePosition} from './position.mjs';
import {createCommandOrderer} from './ordering.mjs';
import {filterAiTargets} from './targeting.mjs';

// Finish a candidate through turn handoff using actual legal commands. This is
// an approximate continuation policy, not a proof of the opponent's best play.
export function completeContinuation(initial,player,{budget=48,personality,rootTurn=initial.turn,maxActions=5,maxSteps=20,turnActions=0}={}){
  let state=initial,used=0,actions=turnActions,previousTurn=state.turn;
  const variation=[];
  const trace={simulated:0,rejected:0,opponentSimulations:0,resolutionSimulations:0,completed:false};
  const actorOf=s=>Number(s.pendingPrompt?.playerIndex ?? s.pendingHandLimit?.playerIndex ?? s.activePlayer);
  const pendingOf=s=>!!(s.pendingPrompt || s.pendingHandLimit);
  function apply(s,command){
    const actor=actorOf(s);
    used++;
    const result=reduceCommand(s,{type:command.type,payload:command.payload || {},matchId:s.matchId,expectedRevision:s.revision,commandId:`continuation:${s.revision}:${used}`},{playerId:s.players[actor].id});
    if(!result.ok){trace.rejected++;return null;}
    trace.simulated++;
    if(actor!==player)trace.opponentSimulations++;
    if(pendingOf(s))trace.resolutionSimulations++;
    return result.state;
  }
  // Compare completed effects, not the transient board between an answer and
  // its destination/target prompt. Every nested choice belongs to its actual
  // controller, including a new opponent reaction opened by that answer.
  function settle(s,allowance,depth){
    const leaf=()=>({state:s,score:evaluatePosition(s,player,personality),variation:[]});
    if(!pendingOf(s) || s.outcome || allowance<1 || depth<1)return leaf();
    const actor=actorOf(s),priority=createCommandOrderer(s,actor);
    const ranked=filterAiTargets(legalCommandTemplates(s,actor),s,actor).filter(c=>c.type!=='CONCEDE')
      .sort((a,b)=>priority(b)-priority(a));
    const choices=[],seen=new Set();
    const width=Math.min(3,Math.max(1,Math.floor(allowance/3)));
    for(const command of ranked){
      const p=command.payload || {};
      const family=[p.reactionIid || '',p.choice || '',p.selectedIid || p.targetIid || '',
        [...(p.selectedIids || [])].sort().join(','),p.destination?.z ?? ''].join(':');
      if(seen.has(family))continue;
      seen.add(family);choices.push(command);
      if(choices.length>=width)break;
    }
    const decline=ranked.find(c=>c.payload?.choice==='DECLINE');
    if(decline && !choices.includes(decline)){
      if(choices.length>=allowance)choices[choices.length-1]=decline;
      else choices.push(decline);
    }
    let best=null;
    for(let i=0;i<choices.length;i++){
      const share=Math.floor(allowance/choices.length)+(i<allowance%choices.length?1:0);
      const next=apply(s,choices[i]);
      if(!next)continue;
      const tail=settle(next,share-1,depth-1);
      if(!best || (actor===player?tail.score>best.score:tail.score<best.score)){
        best={...tail,variation:[{player:actor,command:choices[i]},...tail.variation]};
      }
    }
    return best || leaf();
  }
  while(used<budget && variation.length<maxSteps && !state.outcome && state.turn<=rootTurn+1){
    if(state.turn!==previousTurn){actions=0;previousTurn=state.turn;}
    const actor=Number(state.pendingPrompt?.playerIndex ?? state.pendingHandLimit?.playerIndex ?? state.activePlayer);
    const pending=!!(state.pendingPrompt || state.pendingHandLimit);
    let legal=filterAiTargets(legalCommandTemplates(state,actor),state,actor).filter(c=>c.type!=='CONCEDE');
    const end=legal.find(c=>c.type==='END_TURN');
    if(!pending && actions>=maxActions && end)legal=[end];
    const priority=createCommandOrderer(state,actor);
    const ranked=legal.map(command=>({command,priority:priority(command)})).sort((a,b)=>b.priority-a.priority);
    const selected=[],families=new Set();
    for(const {command} of ranked){
      const p=command.payload || {};
      const family=[command.type,p.cardIid || p.sourceIid || p.reactionIid || '',p.choice || '',p.selectedIid || p.targetIid || '',
        [...(p.selectedIids || [])].sort().join(','),p.destination?.z ?? ''].join(':');
      if(families.has(family))continue;
      families.add(family);selected.push(command);
      if(selected.length>=3)break;
    }
    if(end && !selected.includes(end))selected.push(end);
    if(state.pendingPrompt?.type==='REACTION'){
      const decline=legal.find(c=>c.payload?.choice==='DECLINE');
      if(decline && !selected.includes(decline))selected.push(decline);
    }
    let best=null;
    const candidates=selected.slice(0,budget-used);
    // Reserve at most half the remaining work for this comparison, dividing
    // prompt resolution equally so the first candidate cannot starve others.
    const comparisonBudget=Math.min(budget-used,Math.max(candidates.length,Math.floor((budget-used)/2)));
    for(let i=0;i<candidates.length;i++){
      const command=candidates[i];
      const share=Math.floor(comparisonBudget/candidates.length)+(i<comparisonBudget%candidates.length?1:0);
      const next=apply(state,command);
      if(!next)continue;
      const tail=settle(next,share-1,maxSteps-variation.length-1);
      const score=tail.score;
      if(!best || (actor===player?score>best.score:score<best.score) || (score===best.score && command.type==='END_TURN'))best={command,...tail};
    }
    if(!best)break;
    variation.push({player:actor,command:best.command});
    variation.push(...best.variation);
    state=best.state;
    if(!pending)actions++;
  }
  trace.completed=!!state.outcome || state.turn>rootTurn+1;
  return {score:evaluatePosition(state,player,personality),principalVariation:variation,trace};
}
