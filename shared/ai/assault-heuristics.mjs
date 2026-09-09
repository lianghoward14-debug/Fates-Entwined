import {controllerOf} from '../engine/selectors.mjs';
import {effectiveFate} from '../engine/modifiers.mjs';

// Mass Assault's supporters are the scoring formation, not merely fuel for
// characters. These priors preserve useful lines for the reducer-based search.
export function createAssaultPrior(state,player,entries,cards){
  const owner=state.players[player];
  const own=entries.filter(e=>controllerOf(e.card)===player);
  const ids=new Set([...own.map(e=>e.card),...(owner.hand || []),...(owner.deck || []),...(owner.discard || [])].map(c=>c.id));
  if(!['11','43','40','63','59'].every(id=>ids.has(id)))return ()=>0;
  const hand=owner.hand || [];
  const prompt=state.pendingPrompt,source=cards.get(prompt?.sourceIid);
  const active=e=>!e.card.faceDown && !e.card.statuses?.includes('EFFECTS_SUPPRESSED');
  const supporters=z=>own.filter(e=>e.z===z && e.card.type==='Supporter');
  const hasAnne=hand.some(c=>c.id==='11')||own.some(e=>e.card.id==='11' && active(e));
  const remaining=Math.max(0,5-Number(state.supportersSetForCapThisTurn?.[player] || 0));
  function access(c){
    if(!c)return 0;
    if(c.id==='11')return hasAnne?2:10;
    if(c.id==='68')return hasAnne?0:7;
    if(c.id==='74')return remaining>0 && hand.some(h=>h.type==='Supporter')?7:0;
    if(c.id==='59')return Math.min(7,Math.max(0,...[0,1,2].map(z=>supporters(z).length))*2);
    if(c.id==='63')return own.some(e=>e.card.id==='63')?6:3;
    if(c.id==='32' || c.id==='27')return hand.length<5?6:2;
    if(c.id==='16')return entries.some(e=>controllerOf(e.card)!==player && e.card.type==='Supporter')?5:0;
    if(c.id==='43')return 1;
    return 0;
  }
  return command=>{
    const p=command.payload || {};
    const card=cards.get(p.cardIid || p.sourceIid);
    const selected=(p.selectedIids || (p.selectedIid?[p.selectedIid]:[])).map(i=>cards.get(i)).filter(Boolean);
    let score=0;
    if(prompt?.type==='CARD_SELECTION' && ['68','06'].includes(source?.id)){
      score+=selected.reduce((sum,c)=>sum+access(c),0);
    }
    if(prompt?.type==='HAND_SELECTION' && source?.id==='42'){
      // Keep a useful development hand; extra tutors and slow infrastructure
      // are expendable once their job is already covered.
      for(const c of selected){
        score-=access(c);
        if(c.id==='68' && hasAnne)score+=4;
        if(['43','40'].includes(c.id) && own.some(e=>e.card.id===c.id))score+=3;
      }
    }
    if(p.destination){
      const z=Number(p.destination.z),tributes=new Set(p.tributeIids || []);
      const survivors=own.filter(e=>e.z===z && !tributes.has(e.card.iid));
      const bodies=survivors.filter(e=>e.card.type==='Supporter');
      if(card?.id==='11')score+=Math.min(12,bodies.length*3);
      if(card?.id==='59')score+=Math.min(8,bodies.length+1);
      if(card?.id==='63')score+=survivors.filter(e=>e.card.id==='63' && active(e)).length*4;
      if(card?.type==='Supporter'){
        score+=survivors.filter(e=>active(e) && e.card.id==='11').length*3;
        score+=survivors.filter(e=>active(e) && e.card.id==='59').length;
      }
      if(card?.id==='43' || source?.id==='43'){
        // Mark creates one square, not a complete row. Prefer a developed
        // formation with supporters ready to use the additional capacity.
        score+=Math.min(5,bodies.length)+Math.min(3,hand.filter(c=>c.type==='Supporter').length);
        if(bodies.length<2)score-=6;
      }
      if(card?.id==='16')score+=entries.some(e=>e.z===z && controllerOf(e.card)!==player && e.card.type==='Supporter')?5:-5;
    }
    if(['05','22'].includes(source?.id))for(const c of selected){
      const entry=own.find(e=>e.card.iid===c.iid);
      if(!entry){score-=15;continue;}
      // Buff bodies expected to remain, rather than disposable access cards.
      if(['11','59','63'].includes(c.id))score+=3;
    }
    for(const iid of p.tributeIids || []){
      const entry=own.find(e=>e.card.iid===iid);
      if(!entry)continue;
      // Generic departure scoring already prices all aura losses. Add a small
      // preservation prior for the persistent engines and invested bodies.
      if(['59','63'].includes(entry.card.id))score-=2;
      if(effectiveFate(state,entry)>=7)score-=2;
    }
    return score;
  };
}
