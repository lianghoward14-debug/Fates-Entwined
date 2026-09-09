import {controllerOf} from '../engine/selectors.mjs';
import {effectiveFate} from '../engine/modifiers.mjs';

// Composition-scoped exploration priors. Legal reducer outcomes, morale and
// opponent replies still decide between explored lines; these are not scripts.
export function createIncelPrior(state,player,entries,cards){
  const owner=state.players[player];
  const own=entries.filter(e=>controllerOf(e.card)===player);
  const pool=[...(owner.hand || []),...(owner.deck || []),...(owner.discard || []),...own.map(e=>e.card)];
  const ids=new Set(pool.map(c=>c.id));
  if(!['41','10','13','52'].every(id=>ids.has(id)))return ()=>0;
  const hand=owner.hand || [];
  const has=id=>hand.some(c=>c.id===id)||own.some(e=>e.card.id===id);
  const reductions=Number(state.fateReductionEffectUses?.[player] || 0);
  const prompt=state.pendingPrompt;
  const source=cards.get(prompt?.sourceIid);
  const enemy=entries.filter(e=>controllerOf(e.card)!==player);
  function accessValue(card){
    if(!card)return 0;
    if(card.id==='68')return has('10')?1:8;
    if(card.id==='31')return enemy.length?7:1;
    if(card.id==='08')return reductions>=2?9:4;
    if(card.id==='41')return has('41')?1:Math.min(9,reductions*2);
    if(card.id==='10')return has('10')?2:8;
    if(card.id==='32')return 4;
    if(card.id==='70')return hand.some(c=>c.id==='42')?7:2;
    if(card.id==='58')return owner.discard?.some(c=>c.id==='31')?4:0;
    return 0;
  }
  return command=>{
    const p=command.payload || {};
    const card=cards.get(p.cardIid || p.sourceIid);
    const selected=(p.selectedIids || (p.selectedIid?[p.selectedIid]:[])).map(iid=>cards.get(iid)).filter(Boolean);
    let score=0;
    if(prompt?.ordered && source?.id==='75'){
      score+=selected.reduce((sum,c,i)=>sum+accessValue(c)/(i+1),0);
    }else if(prompt?.type==='CARD_SELECTION'){
      if(['60','13','06','58','68','08'].includes(source?.id)){
        score+=selected.reduce((sum,c)=>sum+accessValue(c),0);
        if(source.id==='68')score+=selected.filter(c=>c.id==='10').length*12;
        if(source.id==='08')score+=selected.filter(c=>c.id==='41').length*Math.min(14,reductions*3);
        if(source.id==='58'){
          const morale=state.moralePressure?.morale?.[player];
          if(state.gameSettings?.healthPressureSeals && morale<=80)score-=8;
        }
      }
    }
    const discards=p.discardedIids || (prompt?.type==='HAND_SELECTION' && source?.id==='42'
      ?p.selectedIids || (p.selectedIid?[p.selectedIid]:[]):[]);
    for(const iid of discards){
      const c=cards.get(iid);
      if(c?.id==='70')score+=12;
      else if(c?.id==='41' && hand.some(h=>h.id==='08'))score+=3;
      else score-=accessValue(c)*.5;
    }
    if(card?.id==='08' && reductions>=2)score+=7;
    if(card?.id==='68' && !has('10'))score+=6;
    if(p.destination){
      const z=Number(p.destination.z);
      const targets=enemy.filter(e=>e.z===z);
      if(card?.id==='10')score+=targets.reduce((sum,e)=>sum+Math.min(3,Math.max(0,effectiveFate(state,e))),0);
      if(card?.id==='31')score+=targets.some(e=>effectiveFate(state,e)>0)?5:-6;
      if(card?.id==='36')score+=Math.min(4,targets.filter(e=>e.card.type==='Supporter').length);
    }
    if(source?.id==='31')for(const c of selected){
      const entry=entries.find(e=>e.card.iid===c.iid);
      if(controllerOf(c)===player)score-=25;
      else if(entry)score+=Math.min(3,Math.max(0,effectiveFate(state,entry)))*2;
    }
    if(source?.id==='52')for(const c of selected){
      // Tributable opposing supporters are more likely to leave than a
      // permanent threat. Do not mistake a Fate reduction for removal.
      if(c.type==='Supporter' && !['62','76'].includes(c.id))score+=5;
    }
    return score;
  };
}
