import {controllerOf} from '../engine/selectors.mjs';
import {isEffectSourceSuppressed} from '../engine/modifiers.mjs';

// Composition recognition also works for imported public decks and copied lists.
export function createTimePrior(state,player,entries,cards){
  const p=state.players[player], hand=p.hand || [];
  const own=entries.filter(e=>controllerOf(e.card)===player);
  const list=[...hand,...(p.deck || []),...(p.discard || []),...own.map(e=>e.card)];
  if(!['46','95','bh20'].every(id=>list.some(c=>c.id===id)))return ()=>0;
  const active=e=>!e.card.faceDown && !isEffectSourceSuppressed(state,e);
  const engines=own.filter(e=>['46','95'].includes(e.card.id) && active(e));
  const enemyEngines=entries.filter(e=>controllerOf(e.card)!==player && ['46','95'].includes(e.card.id) && active(e));
  const growth=es=>es.reduce((n,e)=>n+(e.card.id==='46'?2:Number(state.turn)>=12?1:0),0);
  const advantage=growth(engines)-growth(enemyEngines);
  const remaining=Math.max(0,Number(state.maxTurns || 20)-Number(state.turn));
  const hasPhil=engines.some(e=>e.card.id==='46') || hand.some(c=>c.id==='46');
  const source=cards.get(state.pendingPrompt?.sourceIid);
  function access(c){
    if(!c)return 0;
    if(c.id==='46')return hasPhil?4:12;
    if(c.id==='08')return 9;
    if(c.id==='09')return 6;
    if(['60','27'].includes(c.id))return hand.length<6?7:3;
    if(c.id==='95')return Number(state.turn)>=12?7:2;
    if(c.id==='bh20')return advantage>0?7:1;
    if(c.id==='bh25')return Number(state.turn)>=16 && engines.length?9:1;
    if(c.id==='74')return hand.filter(x=>x.type==='Supporter').length>=2?5:1;
    return 0;
  }
  return command=>{
    const q=command.payload || {},card=cards.get(q.cardIid || q.sourceIid);
    const selected=(q.selectedIids || (q.selectedIid?[q.selectedIid]:[])).map(id=>cards.get(id)).filter(Boolean);
    let score=0;
    if(source?.id==='bh05')score+=selected.reduce((n,c)=>n+(c.id==='bh20'?Math.max(-6,Math.min(10,advantage*2)):c.id==='bh25'?(Number(state.turn)>=18?Math.min(12,growth(engines)*2):-5):access(c)),0);
    if(state.pendingPrompt?.type==='CARD_SELECTION' && ['06','08','48','60','94'].includes(source?.id))score+=selected.reduce((n,c)=>n+access(c),0);
    if(state.pendingPrompt?.ordered)score+=selected.reduce((n,c,i)=>n+access(c)/(i+1),0);
    if(q.destination && card){
      if(card.id==='46')score+=Math.min(12,remaining*1.5);
      if(card.id==='95')score+=Number(state.turn)>=14?7:1;
      if(card.id==='bh20')score+=Math.max(-8,Math.min(10,advantage*2));
      if(card.id==='bh25')score+=Number(state.turn)>=18?Math.min(12,growth(engines)*2):-5;
    }
    // Preserve established growth instead of sacrificing it for another setup card.
    for(const id of q.tributeIids || [])if(engines.some(e=>e.card.iid===id))score-=12;
    return score;
  };
}
