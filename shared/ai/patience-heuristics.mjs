import {controllerOf} from '../engine/selectors.mjs';
import {cardRule} from '../engine/cards/registry.mjs';
import {effectiveFate,isEffectSourceSuppressed} from '../engine/modifiers.mjs';

export function createPatiencePrior(state,player,entries,cards){
  const owner=state.players[player],hand=owner.hand || [];
  const own=entries.filter(e=>controllerOf(e.card)===player);
  const all=[...hand,...(owner.deck || []),...(owner.discard || []),...own.map(e=>e.card)];
  if(!['89','84','bh19','03'].every(id=>all.some(c=>c.id===id)))return ()=>0;
  const live=own.filter(e=>!e.card.faceDown && !isEffectSourceSuppressed(state,e));
  const zsofia=live.filter(e=>e.card.id==='89');
  const uses=Number(state.supporterEffectsActivated?.[player] || 0);
  const highT=(state.statuses || []).filter(s=>s.type==='PERMANENT_FATE_GAIN_POTENCY' && Number(s.playerIndex)===player && Number(s.remainingOwnerTurns)>0).length;
  const source=cards.get(state.pendingPrompt?.sourceIid);
  const available=id=>hand.some(c=>c.id===id) || live.some(e=>e.card.id===id);
  const burstDone=all.some(c=>c.id==='03' && Number(c.counters?.effectUses || 0)>0);
  function access(c){
    if(!c)return 0;
    if(burstDone){
      if(c.id==='64')return 14;
      if(c.id==='58')return (owner.discard || []).some(x=>x.id==='64')?12:2;
      if(c.id==='05')return 10;
    }
    if(c.id==='89')return available('89')?1:12;
    if(c.id==='03')return available('03')?1:available('89')?10:5;
    if(c.id==='bh19'){
      const held=hand.filter(x=>x.id==='bh19').length;
      if(held+highT>=1)return 1;
      return available('89') && available('03')?14:7;
    }
    if(c.id==='09')return 7;
    if(c.id==='05')return highT?9:4;
    if(c.id==='64')return zsofia.length?7:1;
    if(c.id==='79')return hand.some(c=>c.id==='79')?1:6;
    if(c.id==='84')return owner.flowerPickingEligible===true?8:0;
    return 0;
  }
  return command=>{
    const p=command.payload || {},card=cards.get(p.cardIid || p.sourceIid);
    const selected=(p.selectedIids || (p.selectedIid?[p.selectedIid]:[])).map(id=>cards.get(id)).filter(Boolean);
    let score=0;
    if(['84','60','58'].includes(source?.id) && state.pendingPrompt?.type==='CARD_SELECTION')score+=selected.reduce((n,c)=>n+access(c),0);
    if(p.destination && card){
      if(card.id==='89')score+=uses<10?10:1;
      if(card.id==='89' && Number(state.turn)<=10)score+=5;
      if(burstDone && card.id==='64')score+=12;
      if(burstDone && card.id==='58' && (owner.discard || []).some(x=>x.id==='64'))score+=10;
      if(card.id==='bh19')score+=available('03') && available('89')?14:-8;
      if(card.id==='05')score+=highT?8:hand.some(c=>c.id==='bh19')?-4:2;
      if(card.id==='79' && !state.pendingPrompt?.reactionIid)score-=8;
      const formation=live.filter(e=>e.z===Number(p.destination.z));
      if(['03','05'].includes(card.id))score+=Math.min(8,Math.max(0,...formation.map(e=>effectiveFate(state,e)*.3)));
      // This is a soft cost: lethal and necessary disruption can still win search.
      if(card.type==='Supporter' && cardRule(card.id,state)?.timings?.includes('WHEN_SET') && uses===9 && zsofia.length)score-=8;
    }
    if(command.type==='ACTIVATE_EFFECT' && card?.id==='03')score+=highT?10:hand.some(c=>c.id==='bh19')?-6:2;
    if(state.pendingPrompt?.type==='BOARD_TARGET' && ['03','05'].includes(source?.id)){
      const target=cards.get(p.targetIid || p.selectedIid);
      const e=own.find(e=>e.card.iid===target?.iid);
      if(e)score+=Math.min(16,effectiveFate(state,e)*.4);
    }
    for(const id of p.tributeIids || [])if(live.some(e=>e.card.iid===id && ['89','03'].includes(e.card.id)))score-=12;
    return score;
  };
}
