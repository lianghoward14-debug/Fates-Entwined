import {eligibleBoardTargets} from '../engine/prompts.mjs';
import {placementPreview} from '../engine/legal-commands.mjs';
import {cardRule} from '../engine/cards/registry.mjs';
import {effectiveCardType,isEffectSourceSuppressed,runtimeRuleId} from '../engine/modifiers.mjs';
import {controllerOf} from '../engine/selectors.mjs';

export function createPlacementPrior(state,player,entries){
  const engines=entries.filter(entry=>['109','130','15'].includes(runtimeRuleId(entry.card))
    && !entry.card.faceDown && !isEffectSourceSuppressed(state,entry));
  return (command,card)=>{
    const p=command.payload || {};
    if(!card || !p.destination || !['SET_CARD','CONSOLIDATE_CARD','SET_CARD_FROM_DECK'].includes(command.type))return 0;
    let score=0;
    const z=p.destination.z;
    for(const {card:source,z:sourceZone} of engines){
      if((p.tributeIids || []).includes(source.iid))continue;
      const id=runtimeRuleId(source),ally=controllerOf(source)===player;
      if(sourceZone!==z && !(id!=='109' && source.counters?.whisperLandscapeToken))continue;
      if(id==='109' && !ally && command.type!=='CONSOLIDATE_CARD' && effectiveCardType(state,card)==='Supporter')score-=3.5;
      if(id==='15' && ally && effectiveCardType(state,card)==='Coordinator')score+=2;
      if(id==='130' && ally && card.affiliation &&
        [source.counters?.elementalAffiliationA,source.counters?.elementalAffiliationB].includes(card.affiliation))score+=3;
    }
    const rule=cardRule(runtimeRuleId(card),state),program=rule?.program;
    if(p.faceDown || !rule?.timings?.includes('WHEN_SET') || program?.[0]?.kind!=='SELECT_BOARD')return score;
    const after=placementPreview(state,player,card,p.destination,p.tributeIids).state;
    const targets=eligibleBoardTargets(after,{controller:player,sourceIid:card.iid,program,instructionIndex:0},program[0].filter);
    const op=program[1]?.operation;
    const wanted=targets.filter(iid=>{
      if(op?.type!=='MODIFY_FATE')return true;
      const body=iid===card.iid?card:entries.find(e=>e.card.iid===iid)?.card;
      return (controllerOf(body)===player)===(Number(op.amount || 0)>=0);
    });
    return score+(wanted.length?Math.min(6,wanted.length*3):-6);
  };
}
