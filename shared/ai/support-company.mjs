import {boardEntries,controllerOf,rowOwner} from '../engine/selectors.mjs';
import {canUseAsConsolidationTribute,effectiveConsolidationCost} from '../engine/modifiers.mjs';
import {cardRule} from '../engine/cards/registry.mjs';
import {zoneScore} from '../engine/scoring.mjs';
import {supportCompanyCost,supportCompanyOffers} from '../support-company.mjs';
import {assessRecruitment} from './recruitment-timing.mjs';
import {recruitmentContext} from './recruitment-context.mjs';

// Only rank exploration here. Search still pays the real cost and must play
// the acquired card through the reducer before awarding its board effects.
export function createSupportCompanyPrior(state,player,personality='balanced'){
  const context=recruitmentContext(state,player,personality);
  const catalog=new Map((state.cardCatalog || []).map(c=>[String(c.id),c]));
  const own=boardEntries(state).filter(e=>controllerOf(e.card)===player);
  const enemy=boardEntries(state).filter(e=>controllerOf(e.card)!==player && !e.card.faceDown);
  const hand=state.players[player].hand || [];
  const placements=Math.max(0,Math.min(5-Number(state.supportersSetForCapThisTurn?.[player] || 0),
    Number(state.baseSupportersPerTurn ?? 2)+Number(state.extraSupportersThisTurn?.[player] || 0)-Number(state.supportersSetThisTurn?.[player] || 0)));
  let open=0;
  state.board.forEach((zone,z)=>zone.forEach((row,r)=>{if(rowOwner(state,z,r)!==1-player)open+=row.filter(c=>!c).length;}));
  const margins=[0,1,2].map(z=>zoneScore(state,z,player)-zoneScore(state,z,1-player));
  const late=state.maxTurns-state.turn<=1;
  const cache=new Map();
  function cardValue(id){
    if(cache.has(id))return cache.get(id);
    const card=catalog.get(String(id));
    if(!card)return -100;
    const tributes=own.filter(e=>canUseAsConsolidationTribute(state,e,player,card).ok);
    const supply=tributes.reduce((n,e)=>n+canUseAsConsolidationTribute(state,e,player,card).reinforcement,0);
    const cost=Math.min(effectiveConsolidationCost(state,card,player),...tributes.map(e=>effectiveConsolidationCost(state,card,player,e)));
    const playable=card.type==='Supporter' ? placements>0 && open>0 : supply>=cost && (open>0 || cost>0);
    const fate=Number(card.fate ?? card.baseFate ?? 0);
    const ops=cardRule(card.id,state)?.operations || [];
    let value=3+fate*.7+assessRecruitment(card,{...context,playable}).score;
    if(ops.some(op=>['DISCARD_CARD','DISCARD_CARDS','CHANGE_CONTROL'].includes(op)))value+=enemy.length?10:0;
    if(ops.some(op=>['DRAW_CARD','DRAW_CARDS','TRANSFER_CARDS'].includes(op)))value+=!late && hand.length<4?7:0;
    if(card.type==='Supporter' && hand.some(c=>Number(c.cost)>supply))value+=4;
    if(margins.some(m=>m<=0 && m+fate>0))value+=8;
    if(hand.some(c=>c.id===card.id))value-=3;
    value=playable?value+8:late?-40:value*.2-4;
    cache.set(id,value);return value;
  }
  return command=>{
    const p=command.payload || {};
    if(command.type==='SUPPORT_COMPANY'){
      const morale=Number(state.moralePressure?.morale?.[player] || 0);
      if(p.ability==='desperate' && morale-supportCompanyCost(morale)<=0)return -100000;
      return cardValue(p.cardId)-(p.ability==='desperate'?supportCompanyCost(morale)*1.5:0);
    }
    if(command.type==='ANSWER_PROMPT' && state.pendingPrompt?.title==='Call to Arms'){
      if(p.choice)return Math.max(-100,...supportCompanyOffers(state.cardCatalog || [],state.matchId,player,p.choice).map(cardValue));
      return (p.selectedIids || [p.selectedIid]).reduce((n,id)=>n+cardValue(id),0);
    }
    return 0;
  };
}
