import {boardEntries,controllerOf,rowOwner} from '../engine/selectors.mjs';
import {canUseAsConsolidationTribute,effectiveConsolidationCost} from '../engine/modifiers.mjs';
import {cardRule} from '../engine/cards/registry.mjs';

// A discounted estimate of usable access, not a promise that a consolidation
// is legal. The reducer remains responsible for squares, restrictions and costs.
export function resourcePotential(state,player){
  const entries=boardEntries(state).filter(e=>controllerOf(e.card)===player);
  const hand=state.players[player].hand || [];
  const supporters=hand.filter(c=>c.type==='Supporter');
  const futureTurns=Math.max(0,Math.ceil((state.maxTurns-state.turn)/2));
  const placements=Math.max(0,Math.min(5-Number(state.supportersSetForCapThisTurn?.[player] || 0),Math.min(5,Number(state.baseSupportersPerTurn ?? 2)+Number(state.extraSupportersThisTurn?.[player] || 0))-Number(state.supportersSetThisTurn?.[player] || 0)));
  let access=0,stranded=0;
  let open=0;
  state.board.forEach((zone,z)=>zone.forEach((row,r)=>{
    if(rowOwner(state,z,r)===1-player)return;
    open+=row.filter(c=>!c).length;
  }));
  const routes=[];
  for(const card of hand.filter(c=>c.type!=='Supporter')){
    const tributes=entries.map(e=>({e,result:canUseAsConsolidationTribute(state,e,player,card)})).filter(x=>x.result.ok);
    const available=tributes.reduce((n,x)=>n+x.result.reinforcement,0);
    const costs=tributes.map(x=>effectiveConsolidationCost(state,card,player,x.e));
    const cost=costs.length?Math.min(...costs):effectiveConsolidationCost(state,card,player);
    const deficit=Math.max(0,cost-available);
    const nearSupply=supporters.filter(c=>!['62','76'].includes(c.id)).map(c=>c.id==='09'?2:1).sort((a,b)=>b-a).slice(0,placements).reduce((a,b)=>a+b,0);
    const delay=deficit===0?0:deficit<=nearSupply?1:2+Math.max(0,deficit-nearSupply)/2;
    const value=Math.min(8,Math.max(0,Number(card.currentFate ?? card.baseFate ?? 0))*.4+2);
    const discount=delay===0?.8:delay===1?.4:futureTurns>=delay?.12:0;
    if(delay>futureTurns+1)stranded+=1;
    routes.push({iid:card.iid,cost,available,deficit,estimatedDelay:delay,potential:value*discount});
  }
  // These are competing uses of the same tribute pool. Give full credit to
  // the best affordable route, then sharply discount overlapping alternatives.
  // Having three expensive characters does not create three sets of tributes.
  const ranked=routes.slice().sort((a,b)=>b.potential-a.potential);
  let committed=0;
  for(const route of ranked){
    const uncommitted=Math.max(0,route.available-committed);
    const fraction=route.cost===0?1:Math.min(1,uncommitted/route.cost);
    access+=route.potential*(committed===0?1:.2+.8*fraction);
    committed+=Math.min(route.cost,uncommitted);
  }
  let interaction=0;
  for(const {card} of entries){
    if(card.faceDown || card.statuses?.includes('EFFECTS_SUPPRESSED'))continue;
    const rule=cardRule(card.id,state);
    if(rule?.reactionKind){
      const remaining=Math.max(0,Number(rule.maxUses ?? 1)-Number(card.counters?.reactionUses || 0));
      interaction+=Math.min(3,remaining)*2;
    }
  }
  // Hand reactions consume placement capacity, so they lose reserve value when
  // the global cap prevents their use. They are not free extra board bodies.
  if(Number(state.supportersSetForCapThisTurn?.[player] || 0)<5){
    interaction+=Math.min(2,hand.filter(c=>cardRule(c.id,state)?.reactionKind==='HAVANO').length)*2;
  }
  // Extra hand bodies have little immediate utility without a square or
  // placement allowance. Retain some future value rather than valuing all
  // twelve cards like twelve currently available actions.
  const deployableSupporters=Math.min(supporters.length,placements,open);
  const reserveSupporters=Math.min(Math.max(0,supporters.length-deployableSupporters),Math.max(0,futureTurns)*2);
  const readiness=deployableSupporters*2+reserveSupporters*.4;
  const congestion=open===0 && supporters.length?Math.min(6,supporters.length):0;
  return {access,stranded,interaction,routes,readiness,congestion};
}
