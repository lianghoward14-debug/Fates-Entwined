import {controllerOf} from '../engine/selectors.mjs';
import {cardRule} from '../engine/cards/registry.mjs';
import {canUseAsConsolidationTribute} from '../engine/modifiers.mjs';

// Recognize the Maja engine by cards, not a public-deck name or an assumed
// exact list. Work only with cards available in the supplied belief world.
export function createMajaPrior(state,player,entries,cards){
  const owner=state.players[player],hand=owner.hand || [];
  const own=entries.filter(e=>controllerOf(e.card)===player);
  if(![...hand,...(owner.deck || []),...(owner.discard || []),...own.map(e=>e.card)].some(c=>c.id==='bh08'))return ()=>0;
  const active=e=>!e.card.faceDown && !e.card.statuses?.includes('EFFECTS_SUPPRESSED');
  const majas=own.filter(e=>e.card.id==='bh08' && active(e));
  const hasMaja=majas.length>0 || hand.some(c=>c.id==='bh08');
  const readyCounters=own.filter(e=>active(e) && ['56','67'].includes(e.card.id)
    && Number(e.card.counters?.reactionUses || 0)<Number(cardRule(e.card.id,state)?.maxUses || 1));
  const reinforcement=own.reduce((sum,e)=>{
    const result=canUseAsConsolidationTribute(state,e,player);
    return sum+(result.ok?result.reinforcement:0);
  },0);
  const cap=Math.max(0,5-Number(state.supportersSetForCapThisTurn?.[player] || 0));
  const source=cards.get(state.pendingPrompt?.sourceIid);
  function access(c){
    if(!c)return 0;
    if(c.id==='bh08')return hasMaja?2:10;
    if(c.id==='06')return hasMaja?2:6;
    if(c.id==='68')return hasMaja?1:8;
    if(c.id==='09')return hasMaja && reinforcement<3?9:3;
    if(c.id==='79')return hand.some(h=>h.id==='79')?2:7;
    if(c.id==='18')return 7;
    if(['56','67'].includes(c.id))return readyCounters.length?2:(reinforcement>=Number(c.cost || 0)?8:3);
    if(c.id==='28')return 5;
    if(c.id==='bh25')return Number(state.turn)>=18 && majas.length?8:0;
    if(c.id==='74')return cap>0 && hand.filter(h=>h.type==='Supporter').length>=2?6:1;
    if(['27','32','60'].includes(c.id))return hand.length<5?7:3;
    if(c.id==='bh23')return Math.min(9,Math.max(0,...majas.map(e=>Number(e.card.counters?.bh08ProcCount || 0)))*2);
    return 0;
  }
  return command=>{
    const p=command.payload || {};
    const card=cards.get(p.cardIid || p.sourceIid);
    const selected=(p.selectedIids || (p.selectedIid?[p.selectedIid]:[])).map(i=>cards.get(i)).filter(Boolean);
    let score=0;
    if(state.pendingPrompt?.type==='CARD_SELECTION' && ['06','60','68','13'].includes(source?.id))score+=selected.reduce((n,c)=>n+access(c),0);
    if(state.pendingPrompt?.ordered)score+=selected.reduce((n,c,i)=>n+access(c)/(i+1),0);
    if(card?.id==='79' && !p.reactionIid && hand.some(c=>c.iid===card.iid))score-=8;
    if(card?.id==='18')score+=majas.length?7:4;
    if(card?.id==='bh08')score+=majas.length?1:6;
    if(['56','67'].includes(card?.id))score+=readyCounters.length?1:7;
    if(card?.id==='bh25')score+=Number(state.turn)>=18 && majas.length?7:-5;
    if(p.destination){
      const z=Number(p.destination.z),tributes=new Set(p.tributeIids || []);
      const survivors=own.filter(e=>e.z===z && !tributes.has(e.card.iid));
      if(card?.id==='bh08')score+=Math.min(12,survivors.length*2);
      // A cheap counter is useful before Maja too; do not wait for the combo.
      if(['56','67'].includes(card?.id))score+=survivors.some(e=>e.card.id==='bh08' && active(e))?4:0;
      if(card?.id==='bh25' && Number(state.turn)>=18)score+=Math.min(12,survivors.filter(e=>e.card.id==='bh08' && active(e)).length*survivors.length);
      if(card?.type==='Supporter')score+=survivors.filter(e=>e.card.id==='bh08' && active(e)).length*3;
      if(card?.id==='bh23')score+=Math.min(14,Math.max(0,...survivors.filter(e=>e.card.id==='bh08' && active(e)).map(e=>Number(e.card.counters?.bh08ProcCount || 0)*2)));
      if(state.pendingPrompt?.reactionIid){
        // Havano's free placement should join a live Maja formation when useful.
        score+=survivors.filter(e=>e.card.id==='bh08' && active(e)).length*3;
      }
    }
    for(const iid of p.tributeIids || []){
      const entry=own.find(e=>e.card.iid===iid);
      if(entry && majas.some(m=>m.z===entry.z))score-=2;
      if(entry && ['bh08','56','67'].includes(entry.card.id) && active(entry))score-=10;
    }
    // No unconditional bonus for answering a reaction: the search must compare
    // spending it with declining, resolving the effect and Maja's actual gain.
    const discards=p.discardedIids || (state.pendingPrompt?.type==='HAND_SELECTION' && source?.id==='42'?p.selectedIids || []:[]);
    for(const iid of discards)score-=access(cards.get(iid));
    return score;
  };
}

// Small, capped option value for an established formation with real remaining
// responses. Do not assume every response will fire or add this as actual Fate.
export function majaResponsePotential(state,player,entries){
  const own=entries.filter(e=>controllerOf(e.card)===player);
  const active=own.filter(e=>!e.card.faceDown && !e.card.statuses?.includes('EFFECTS_SUPPRESSED'));
  const majas=active.filter(e=>e.card.id==='bh08');
  if(!majas.length)return 0;
  let responses=active.reduce((sum,e)=>{
    const rule=cardRule(e.card.id,state);
    return sum+(rule?.reactionKind?Math.max(0,Number(rule.maxUses ?? 1)-Number(e.card.counters?.reactionUses || 0)):0);
  },0);
  if(Number(state.supportersSetForCapThisTurn?.[player] || 0)<5)responses+=(state.players[player].hand || []).filter(c=>cardRule(c.id,state)?.reactionKind==='HAVANO').length;
  const formation=majas.reduce((sum,m)=>sum+own.filter(e=>e.z===m.z && !e.card.faceDown && e.card.id!=='76').length,0);
  return Math.min(8,formation*Math.min(2,responses)*.5);
}
