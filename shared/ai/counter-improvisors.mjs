import {cardRule} from '../engine/cards/registry.mjs';
import {eligibleBoardTargets} from '../engine/prompts.mjs';
import {effectiveCardType,effectiveFate,isEffectSourceSuppressed,runtimeRuleId} from '../engine/modifiers.mjs';
import {controllerOf} from '../engine/selectors.mjs';

export function canChargeSantiago(state,player,entries){
  return entries.some(e=>runtimeRuleId(e.card)==='103' && controllerOf(e.card)===player &&
    Number(e.card.counters?.santiagoCounterGainTurn)!==Number(state.turn) && !isEffectSourceSuppressed(state,e));
}

export function counterImprovisorPrior(state,player,entries,cards){
  const own=entries.filter(e=>controllerOf(e.card)===player);
  const boleslaws=own.filter(e=>runtimeRuleId(e.card)==='86' && !isEffectSourceSuppressed(state,e));
  const frame=state.effectStack?.findLast(f=>f.sourceIid===state.pendingPrompt?.sourceIid);
  const damage=entry=>Math.floor(1.5*Math.max(0,effectiveFate(state,entry)));
  return (command,card)=>{
    const p=command.payload || {};
    if(state.pendingPrompt?.local==='santiagoTarget' && command.type==='ANSWER_PROMPT'){
      const target=own.find(e=>e.card.iid===p.selectedIid);
      return target?damage(target):0;
    }
    if(command.type==='ACTIVATE_EFFECT' && runtimeRuleId(card)==='103'){
      const eligible=eligibleBoardTargets(state,{sourceIid:card.iid,controller:player},{controller:true,santiagoUnused:true});
      return Math.max(0,...own.filter(e=>eligible.includes(e.card.iid)).map(damage));
    }
    if(command.type==='ACTIVATE_EFFECT' && runtimeRuleId(card)==='86'){
      const history=state.successfulWhenSetHistory || [];
      if(!history.length)return 0;
      // Weight repeated effects by their actual frequency in the public pool.
      const sum=history.reduce((total,h)=>{
        const program=cardRule(h.cardId,state)?.program || [];
        const first=program[0];
        if(first?.kind==='SELECT_BOARD' && !eligibleBoardTargets(state,{sourceIid:card.iid,controller:player,program,instructionIndex:0},first.filter).length)return total-3;
        const morale=program.reduce((n,step)=>n+(step.operation?.type==='MODIFY_MORALE' && step.operation.playerIndex==='$controller'?Number(step.operation.amount)||0:0),0);
        return total+5+Math.min(0,morale)*.35;
      },0);
      return sum/history.length;
    }
    if(!p.destination || !boleslaws.length)return 0;
    const placed=command.type==='ANSWER_PROMPT' && state.pendingPrompt?.type==='BOARD_DESTINATION'
      ? cards.get(frame?.locals?.targetIid) : cards.get(p.cardIid);
    if(!placed || (placed.affiliation || placed.aff)!=='expanded_worlds' || ['Supporter','Counter'].includes(effectiveCardType(state,placed)))return 0;
    return boleslaws.filter(e=>e.z===p.destination.z && e.card.iid!==placed.iid && !(p.tributeIids || []).includes(e.card.iid))
      .reduce((n,e)=>n+(Number(e.card.counters?.boleslawCounters || 0)%2?5:2),0);
  };
}
