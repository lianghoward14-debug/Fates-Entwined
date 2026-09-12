import {boardEntries,controllerOf,openBoardDestinations,rowOwner} from '../engine/selectors.mjs';
import {effectiveConsolidationCost,canUseAsConsolidationTribute,isEffectSourceSuppressed} from '../engine/modifiers.mjs';

// Reconstruct intent from the current position every decision. This survives
// turn boundaries and replans after removal without retaining stale commands.
export function comboPlan(state,player){
  const owner=state.players[player],hand=owner.hand || [];
  const own=boardEntries(state).filter(e=>controllerOf(e.card)===player);
  const all=[...hand,...(owner.deck || []),...(owner.discard || []),...own.map(e=>e.card)];
  const has=ids=>ids.every(id=>all.some(c=>c.id===id));
  const kind=has(['89','84','bh19','03'])?'patience':has(['87','bh19','bh06','07','bh24','80'])?'indie':null;
  if(!kind)return null;
  const doubled=(state.statuses || []).some(s=>s.type==='PERMANENT_FATE_GAIN_POTENCY' && Number(s.playerIndex)===player && Number(s.remainingOwnerTurns)>0);
  const live=own.filter(e=>!e.card.faceDown && !isEffectSourceSuppressed(state,e));
  const anchor=kind==='patience'?live.find(e=>e.card.id==='89'):null;
  if(kind==='patience' && all.some(c=>c.id==='03' && Number(c.counters?.effectUses)>0))return null;
  const ids=kind==='patience'?[...(!anchor?['89']:[]),...(!doubled?['bh19']:[]),'03']:[...(!doubled?['bh19']:[]),'87','bh06'];
  const reserved=new Set(),missing=[];
  let demand=0;
  for(const id of ids){
    const c=hand.find(c=>c.id===id);
    if(c){reserved.add(c.iid);demand+=effectiveConsolidationCost(state,c,player);}
    else missing.push(id);
  }
  const supply=own.reduce((n,e)=>{const t=canUseAsConsolidationTribute(state,e,player);return n+(t.ok && e.card.type==='Supporter'?t.reinforcement:0);},0);
  const free=openBoardDestinations(state,d=>rowOwner(state,d.z,d.r)===player || rowOwner(state,d.z,d.r)===-1);
  const possible=missing.every(id=> (owner.deck || []).some(c=>c.id===id));
  return {kind,ids,reserved,missing,demand,supply,anchor,doubled,possible,free,own,hand,
    phase:doubled?'executing':missing.length?'assembling':supply<demand?'funding':'ready'};
}

export function filterComboPlan(commands,state,player){
  const plan=comboPlan(state,player);if(!plan)return commands;
  const source=[...plan.hand,...(state.players[player].deck || []),...plan.own.map(e=>e.card)].find(c=>c.iid===state.pendingPrompt?.sourceIid);
  // Keep one of each required piece, but discard redundant copies normally.
  if(commands.length && commands.every(c=>Array.isArray(c.payload?.discardedIids))){
    const cost=c=>c.payload.discardedIids.reduce((n,id)=>n+(plan.reserved.has(id)?1:0),0);
    const best=Math.min(...commands.map(cost));return commands.filter(c=>cost(c)===best);
  }
  if(state.pendingPrompt){
    if(state.pendingPrompt.type==='CARD_SELECTION' && ['84','06'].includes(source?.id) && plan.missing.length){
      for(const id of plan.missing){
        const wanted=new Set((state.players[player].deck || []).filter(c=>c.id===id).map(c=>c.iid));
        const picks=commands.filter(c=>[c.payload?.selectedIid,...(c.payload?.selectedIids || [])].some(i=>wanted.has(i)));
        if(picks.length)return picks;
      }
    }
    return commands;
  }
  return commands.filter(command=>{
    const q=command.payload || {},card=plan.hand.find(c=>c.iid===q.cardIid);
    if(command.type==='DISCARD_CARD' && plan.own.some(e=>e.card.iid===q.targetIid && (e.card.id==='89' || e.card.id==='87')))return false;
    if(plan.kind==='patience' && plan.anchor && (q.tributeIids || []).includes(plan.anchor.card.iid))return false;
    // Once all pieces are held, don't spend their fuel on unrelated bodies.
    // Searches/draws remain available while assembling; reactive commands and
    // free supporters are never excluded by the funding reservation.
    if(plan.phase==='funding' || plan.phase==='ready'){
      if(card && q.destination && !plan.reserved.has(card.iid) && (q.tributeIids || []).length)return false;
    }
    if(card?.id==='bh19' && q.destination){
      const reclaimed=(q.tributeIids || []).length;
      // Indie needs room for Abed, Ukulele, Achille and all three tokens.
      // Later consolidations reclaim supporter squares as well.
      if(plan.kind==='indie' && plan.free.length+reclaimed+Math.max(0,plan.demand-effectiveConsolidationCost(state,card,player))<6)return false;
      if(plan.kind==='patience' && plan.anchor){
        const z=plan.anchor.z;
        const room=plan.free.filter(d=>d.z===z).length+plan.own.filter(e=>e.z===z && (q.tributeIids || []).includes(e.card.iid)).length;
        if(room-(Number(q.destination.z)===z?1:0)<1)return false;
      }
    }
    return true;
  });
}

export function createComboPlanPrior(state,player){
  const plan=comboPlan(state,player);if(!plan)return ()=>0;
  const source=[...plan.hand,...plan.own.map(e=>e.card)].find(c=>c.iid===state.pendingPrompt?.sourceIid);
  return command=>{
    const q=command.payload || {},card=plan.hand.find(c=>c.iid===q.cardIid);
    let value=0;
    if(card && q.destination){
      if(card.type==='Supporter' && plan.supply<plan.demand && card.id!=='79')value+=10;
      if(plan.kind==='patience' && card.id==='89' && !plan.anchor)value+=16;
      if(plan.phase==='ready' && card.id==='bh19')value+=24;
      if(plan.phase==='assembling' && ['27','32','75','84','60'].includes(card.id))value+=7;
      if(plan.kind==='patience' && plan.anchor && card.type==='Supporter' && Number(q.destination.z)===plan.anchor.z && plan.free.filter(d=>d.z===plan.anchor.z).length<=1)value-=12;
    }
    if(state.pendingPrompt?.ordered && source?.id==='75'){
      const known=[...plan.hand,...(state.players[player].deck || [])];
      value+=(q.selectedIids || []).reduce((n,iid,index)=>n+(plan.missing.includes(known.find(c=>c.iid===iid)?.id)?18:0)/(index+1),0);
    }
    return value;
  };
}
