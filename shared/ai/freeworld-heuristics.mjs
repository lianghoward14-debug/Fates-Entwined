import {controllerOf} from '../engine/selectors.mjs';
import {effectiveFate} from '../engine/modifiers.mjs';

// Free World's new plan is repeated Morale pressure, not assembling a court.
// These bounded priors select promising branches; calculation prevention,
// actual damage and opponent reactions remain the reducer search's decision.
export function createFreeWorldPrior(state,player,entries,cards){
  const owner=state.players[player],hand=owner.hand || [];
  const own=entries.filter(e=>controllerOf(e.card)===player);
  const pool=[...hand,...(owner.deck || []),...(owner.discard || []),...own.map(e=>e.card)];
  const ids=new Set(pool.map(c=>c.id));
  if(!['29','34','35','64','65'].every(id=>ids.has(id)))return ()=>0;
  const active=e=>!e.card.faceDown && !e.card.statuses?.includes('EFFECTS_SUPPRESSED');
  const affiliation=c=>String(c.affiliation || c.aff || '').toLowerCase();
  const has=id=>hand.some(c=>c.id===id)||own.some(e=>e.card.id===id && active(e));
  const pressure=own.filter(e=>['34','35'].includes(e.card.id) && active(e));
  const prompt=state.pendingPrompt,source=cards.get(prompt?.sourceIid);
  const sourceEntry=own.find(e=>e.card.iid===source?.iid);
  const calculationNear=Number(state.turn)>=3;
  function access(c){
    if(!c)return 0;
    if(c.id==='34')return has('34')?5:16;
    if(c.id==='35')return has('35')?2:6;
    if(c.id==='18')return 7;
    if(c.id==='64')return pressure.length && calculationNear?8:1;
    if(c.id==='65')return state.maxTurns-state.turn>=4?5:0;
    if(c.id==='28')return 4;
    if(c.id==='59')return own.filter(e=>e.card.type==='Supporter').length>=3?5:1;
    if(c.id==='63')return own.some(e=>e.card.id==='63')?5:2;
    if(c.id==='42')return hand.length<5?4:1;
    if(c.id==='77')return own.filter(e=>affiliation(e.card)==='third_great_war').length>=4?3:0;
    return 0;
  }
  return command=>{
    const p=command.payload || {};
    const card=cards.get(p.cardIid || p.sourceIid);
    const selected=(p.selectedIids || (p.selectedIid?[p.selectedIid]:[])).map(i=>cards.get(i)).filter(Boolean);
    let score=0;
    if(prompt?.type==='CARD_SELECTION' && ['29','13','06'].includes(source?.id)){
      score+=selected.reduce((sum,c)=>sum+access(c)
        +(c.type==='Supporter' && affiliation(c)==='third_great_war'?6:0),0);
      // Two searches should advance different needs, not collect redundant
      // expensive threats while the hand has no usable reinforcement.
      if(selected.length>1 && selected.every(c=>c.type!=='Supporter'))score-=4;
    }
    if(prompt?.type==='HAND_SELECTION' && source?.id==='42'){
      for(const c of selected){
        score-=access(c);
        if(['35','34','77'].includes(c.id) && hand.filter(h=>h.id===c.id).length>1)score+=3;
      }
    }
    if(prompt?.type==='MODAL_CHOICE' && ['34','77'].includes(source?.id) && sourceEntry){
      const matches=own.filter(e=>e.z===sourceEntry.z && active(e) && affiliation(e.card)===p.choice);
      score+=matches.length*(source.id==='34'?2:4);
    }
    if(card?.id==='18')score+=5;
    if(card?.id==='34')score+=8;
    if(card?.id==='64')score+=pressure.length && calculationNear?6:-3;
    if(card?.id==='65' && state.gameSettings?.pressureCardReworks)score+=Math.min(5,Math.max(0,Math.floor((state.maxTurns-state.turn)/2)));
    if(p.destination){
      const z=Number(p.destination.z),tributes=new Set(p.tributeIids || []);
      const survivors=own.filter(e=>e.z===z && !tributes.has(e.card.iid));
      if(card?.id==='34' || card?.id==='77'){
        const counts=new Map();
        for(const e of survivors)counts.set(affiliation(e.card),(counts.get(affiliation(e.card)) || 0)+1);
        score+=Math.min(12,Math.max(0,...counts.values())*(card.id==='34'?2:3));
      }
      if(card?.id==='63')score+=survivors.filter(e=>e.card.id==='63').length*4;
      if(card?.id==='59')score+=survivors.filter(e=>e.card.type==='Supporter').length;
      if(card && affiliation(card)==='third_great_war')score+=survivors.filter(e=>e.card.id==='34' && active(e) && e.card.counters?.moraleAffiliation==='third_great_war').length*(card.type==='Supporter'?8:3);
    }
    if(source?.id==='05')for(const c of selected){
      const entry=own.find(e=>e.card.iid===c.iid);
      if(!entry)score-=20;
      else if(c.id==='35' && active(entry))score+=6;
    }
    for(const iid of p.tributeIids || []){
      const entry=own.find(e=>e.card.iid===iid);
      if(!entry)continue;
      if(entry.card.id==='64' && entry.card.counters?.doubleNextMoraleDamage)score-=10;
      if(entry.card.id==='65' && active(entry))score-=3;
      if(entry.card.id==='63' || entry.card.id==='59')score-=2;
      if(effectiveFate(state,entry)>=7)score-=2;
    }
    return score;
  };
}
