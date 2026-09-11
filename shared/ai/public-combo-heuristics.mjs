import {controllerOf} from '../engine/selectors.mjs';
import {effectiveFate,effectiveReinforcement,isEffectSourceSuppressed} from '../engine/modifiers.mjs';

// Recognize compositions rather than public titles, including imported copies.
export function createPublicComboPrior(state,player,entries,cards){
  const owner=state.players[player], hand=owner.hand || [];
  const own=entries.filter(e=>controllerOf(e.card)===player);
  const all=[...hand,...(owner.deck || []),...(owner.discard || []),...own.map(e=>e.card)];
  const hasIds=ids=>ids.every(id=>all.some(c=>c.id===id));
  const marine=hasIds(['38','08','03','18','58','13','97']);
  const indie=hasIds(['87','bh19','bh06','07','bh24','80']);
  if(!marine && !indie)return ()=>0;
  const live=own.filter(e=>!e.card.faceDown && !isEffectSourceSuppressed(state,e));
  const jakes=live.filter(e=>e.card.id==='38');
  const held=id=>hand.some(c=>c.id===id);
  const source=cards.get(state.pendingPrompt?.sourceIid);
  const ballads=(state.statuses || []).filter(s=>s.type==='CONSOLIDATION_FATE_BONUS' && Number(s.playerIndex)===player).length;
  const doubled=(state.statuses || []).some(s=>s.type==='PERMANENT_FATE_GAIN_POTENCY' && Number(s.playerIndex)===player && Number(s.remainingOwnerTurns)>0);
  const fuel=own.filter(e=>e.card.type==='Supporter').reduce((n,e)=>n+effectiveReinforcement(state,e,player),0);
  const indieFollowup=hand.some(c=>['87','bh06'].includes(c.id) && (c.id!=='bh06' || Number(state.turn)>=6));
  const enemyHandCount=(state.players[1-player].hand || []).length;
  function access(c){
    if(!c)return 0;
    if(c.id==='74')return 7;
    if(c.id==='60')return 5;
    if(marine){
      if(c.id==='38')return jakes.length?2:14;
      if(c.id==='08')return jakes.length?3:held('38')?3:12;
      if(c.id==='18')return held('18')?4:12;
      if(c.id==='79')return held('79')?1:9;
      if(c.id==='97')return 7;
      if(c.id==='12')return jakes.length && !live.some(e=>e.card.id==='12')?10:2;
      if(c.id==='58')return (owner.discard || []).some(x=>x.id==='18')?9:0;
      if(c.id==='03')return jakes.some(e=>effectiveFate(state,e)>=13)?9:0;
      if(c.id==='71')return enemyHandCount<5?7:3;
    }
    if(indie){
      if(c.id==='87')return held('87')?3:11;
      if(c.id==='bh19')return doubled || held('bh19')?0:indieFollowup?9:2;
      if(c.id==='bh06')return Number(state.turn)>=6?10:2;
      if(['27','32'].includes(c.id))return hand.length<6?9:4;
      if(c.id==='42')return hand.length>4?4:0;
      if(c.id==='bh24')return ballads?-8:4;
    }
    return 0;
  }
  return command=>{
    const p=command.payload || {}, card=cards.get(p.cardIid || p.sourceIid);
    const targets=(p.selectedIids || [p.selectedIid || p.targetIid]).map(iid=>cards.get(iid)).filter(Boolean);
    let score=0;
    if(state.pendingPrompt?.type==='CARD_SELECTION' && ['08','13','60','58','07'].includes(source?.id))score+=targets.reduce((n,c)=>n+access(c),0);
    if(state.pendingPrompt?.ordered && source?.id==='75')score+=targets.reduce((n,c,i)=>n+access(c)/(i+1),0);
    if(marine){
      if(p.destination && card){
        if(card.id==='08')score+=jakes.length?3:12;
        if(card.id==='38')score+=jakes.length?3:10;
        if(card.id==='18')score+=11;
        if(card.id==='97')score+=6;
        if(card.id==='79')score-=10;
        if(card.id==='12')score+=jakes.some(e=>e.z===Number(p.destination.z))?10:-3;
        if(card.id==='03')score+=Math.min(15,Math.max(0,...jakes.filter(e=>e.z===Number(p.destination.z)).map(e=>effectiveFate(state,e)*.5)));
        if(card.id==='58')score+=(owner.discard || []).some(c=>c.id==='18')?8:-7;
        // Grow Jake before applying Howard's multiplier when a feed is legal.
        if(card.id==='03' && jakes.some(e=>e.z===Number(p.destination.z) && Number(e.card.counters?.lastEffectTurn)!==Number(state.turn)) && own.some(e=>e.card.type==='Supporter' && effectiveFate(state,e)<=2))score-=6;
      }
      if(command.type==='ACTIVATE_EFFECT' && card?.id==='38')score+=6;
      if(source?.id==='38')for(const c of targets){
        const e=own.find(e=>e.card.iid===c.iid);
        if(e)score+=6-effectiveFate(state,e)*1.5+(['18','32','60','97','71','58'].includes(c.id)?4:0);
      }
      if(['03','12'].includes(source?.id))for(const c of targets)if(c.id==='38')score+=12;
      for(const iid of p.tributeIids || [])if(jakes.some(e=>e.card.iid===iid))score-=18;
      if(p.reactionIid && hand.some(c=>c.iid===p.reactionIid && c.id==='79')){
        const op=(state.effectStack || []).findLast(f=>f.pendingOperation)?.pendingOperation;
        const affected=[op?.targetIid,op?.cardIid,...(op?.targetIids || [])];
        if(jakes.some(e=>affected.includes(e.card.iid)))score+=18;
      }
    }
    if(indie && p.destination && card){
      // Abed does not stack in the current engine. Fund a real follow-up
      // before spending its one-turn bonus; do not wait for three copies.
      if(card.id==='bh19')score+=doubled?-12:indieFollowup && fuel>=Number(card.cost || 2)+2?14:-10;
      if(card.id==='87')score+=doubled?16:held('bh19') && fuel>=4?-5:8;
      if(card.id==='bh06')score+=Number(state.turn)<6?-24:ballads?16:held('87')?-7:6;
      if(card.id==='27')score+=ballads?8:hand.length<6?7:2;
      // A supporter ends ALL active Ballad bonuses. Keep it as a soft
      // penalty so search can still refill an exhausted board or win now.
      if(card.type==='Supporter' && ballads)score-=fuel>=1 && hand.some(c=>c.type!=='Supporter' && Number(c.cost)<=fuel)?24:7;
      if(card.id==='07' && ballads)score-=8;
      if(command.type==='SET_ADAPTIVE_TOKEN')score+=ballads?10:4;
    }
    if(indie && source?.id==='80')for(const c of targets){
      const e=own.find(e=>e.card.iid===c.iid);
      if(e)score+=5-effectiveFate(state,e)*1.2;
    }
    if(indie)for(const iid of p.discardedIids || [])score-=Math.max(0,access(cards.get(iid)));
    return score;
  };
}
