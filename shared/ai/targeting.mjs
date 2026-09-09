import {boardEntries,controllerOf} from '../engine/selectors.mjs';
import {canUseAsConsolidationTribute,effectiveConsolidationCost,isEffectSourceSuppressed} from '../engine/modifiers.mjs';
// Strategic restrictions belong to the AI, not the game's legal rules.
export function filterAiTargets(commands,state,player){
  commands=keepPatienceBurstTogether(commands,state,player);
  commands=keepAssaultHoplitesTogether(commands,state,player);
  const prompt=state.pendingPrompt;
  if(!prompt || Number(prompt.playerIndex)!==player)return commands;
  const board=state.board.flat(3).filter(Boolean);
  const source=board.find(c=>c.iid===prompt.sourceIid);
  if(source?.id==='34' && prompt.type==='MODAL_CHOICE'){
    const owner=state.players[player];
    const ids=new Set([...(owner.hand || []),...(owner.deck || []),...(owner.discard || []),
      ...board.filter(c=>Number(c.controller ?? c.owner)===player)].map(c=>c.id));
    if(['29','34','35','64','65'].every(id=>ids.has(id))){
      const tgw=commands.filter(c=>c.type==='ANSWER_PROMPT' && c.payload?.choice==='third_great_war');
      if(tgw.length)return tgw;
    }
  }
  if(source?.id!=='31')return commands;
  const opponents=new Set(board.filter(c=>Number(c.controller ?? c.owner)!==player).map(c=>c.iid));
  return commands.filter(command=>{
    if(command.type!=='ANSWER_PROMPT')return true;
    const p=command.payload || {};
    if(p.cancel===true)return true;
    const targets=p.selectedIids || (p.selectedIid?[p.selectedIid]:p.targetIid?[p.targetIid]:[]);
    return targets.every(iid=>opponents.has(iid));
  });
}

function keepPatienceBurstTogether(commands,state,player){
  const owner=state.players[player],hand=owner.hand || [];
  const own=boardEntries(state).filter(e=>controllerOf(e.card)===player);
  const cards=[...hand,...(owner.deck || []),...(owner.discard || []),...own.map(e=>e.card)];
  if(!['89','84','bh19','03'].every(id=>cards.some(c=>c.id===id)))return commands;
  const live=e=>!e.card.faceDown && !isEffectSourceSuppressed(state,e);
  const zsofia=own.find(e=>e.card.id==='89' && live(e));
  if(state.pendingPrompt){
    // Use only legal reactions supplied by the engine. A targeted operation is
    // stronger evidence than the source card merely being capable of harm.
    if(zsofia && state.pendingPrompt.type==='REACTION' && Number(state.pendingPrompt.playerIndex)===player){
      const frame=(state.effectStack || []).findLast(f=>f.pendingOperation);
      const op=frame?.pendingOperation;
      const targets=[op?.targetIid,op?.cardIid,...(op?.targetIids || [])];
      const harmful=op && (['DISCARD_CARD','CHANGE_CONTROL','RETURN_TO_HAND','MOVE_CARD','CREATE_STATUS'].includes(op.type)
        || (op.type==='MODIFY_FATE' && (Number(op.amount)<0 || Number(op.multiplier ?? 1)<1)));
      if(harmful && targets.includes(zsofia.card.iid)){
        const havano=new Set(hand.filter(c=>c.id==='79').map(c=>c.iid));
        const protect=commands.filter(c=>havano.has(c.payload?.reactionIid) && ['NEGATE','SUPPRESS'].includes(c.payload?.choice));
        if(protect.length)return protect;
      }
    }
    const source=cards.find(c=>c.iid===state.pendingPrompt.sourceIid);
    if(zsofia && ['03','05'].includes(source?.id) && state.pendingPrompt.type==='BOARD_TARGET'){
      const targets=commands.filter(c=>{
        const p=c.payload || {};
        return [p.targetIid,p.selectedIid,...(p.selectedIids || [])].includes(zsofia.card.iid);
      });
      if(targets.length)return targets;
    }
    return commands;
  }
  const buffs=(state.statuses || []).filter(s=>s.type==='PERMANENT_FATE_GAIN_POTENCY' && Number(s.playerIndex)===player && Number(s.remainingOwnerTurns)>0).length;
  const abeds=hand.filter(c=>c.id==='bh19');
  const howard=hand.find(c=>c.id==='03');
  const fieldHoward=own.find(e=>e.card.id==='03' && live(e));
  const remainingAbeds=Math.max(0,2-buffs);
  const supply=own.reduce((n,e)=>{const t=canUseAsConsolidationTribute(state,e,player);return n+(t.ok && e.card.type==='Supporter'?t.reinforcement:0);},0);
  const demand=abeds.slice(0,remainingAbeds).reduce((n,c)=>n+effectiveConsolidationCost(state,c,player),0)+(howard?effectiveConsolidationCost(state,howard,player):0);
  const ready=!!zsofia && !!(howard || fieldHoward) && abeds.length>=remainingAbeds && supply>=demand;
  return commands.filter(c=>{
    const p=c.payload || {},card=cards.find(x=>x.iid===(p.cardIid || p.sourceIid));
    if(card?.id==='79' && p.destination)return false;
    if(card?.id==='bh19' && p.destination)return ready;
    if(card?.id==='03' && c.type==='ACTIVATE_EFFECT')return buffs>=2 && !!zsofia && fieldHoward?.z===zsofia.z;
    if(card?.id==='03' && p.destination)return ready && buffs>=2 && Number(p.destination.z)===zsofia.z;
    if(buffs>0 && buffs<2 && ready && c.type==='END_TURN')return false;
    if(buffs>=2 && c.type==='END_TURN' && commands.some(x=>x.type==='ACTIVATE_EFFECT' && x.payload?.sourceIid===fieldHoward?.card.iid))return false;
    return true;
  });
}

function keepAssaultHoplitesTogether(commands,state,player){
  const entries=[];
  state.board.forEach((zone,z)=>zone.forEach(row=>row.forEach(card=>{
    if(card && Number(card.controller ?? card.owner)===player)entries.push({card,z});
  })));
  const owner=state.players[player];
  const ownCards=[...entries.map(e=>e.card),...(owner.hand || []),...(owner.deck || []),...(owner.discard || [])];
  const ids=new Set(ownCards.map(c=>c.id));
  if(!['11','43','40','63','59'].every(id=>ids.has(id)))return commands;
  const hoplites=entries.filter(e=>e.card.id==='63');
  if(!hoplites.length)return commands;
  const counts=[0,1,2].map(z=>hoplites.filter(e=>e.z===z).length);
  // First Hoplite establishes the zone. If an opponent has split them, use
  // the largest existing group (stable zone tie-break) for new deployments.
  const anchor=counts.indexOf(Math.max(...counts));
  const cards=new Map(ownCards.map(c=>[c.iid,c]));
  return commands.filter(command=>{
    const p=command.payload || {};
    if(cards.get(p.cardIid)?.id!=='63' || !p.destination)return true;
    // Hold the card if its shared zone has no legal square; never silently
    // relax the user's formation rule to deploy it in a different zone.
    return Number(p.destination.z)===anchor;
  });
}
