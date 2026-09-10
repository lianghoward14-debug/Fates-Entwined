import {controllerOf} from '../engine/selectors.mjs';
import {effectiveFate,isEffectSourceSuppressed} from '../engine/modifiers.mjs';

export function createWintertidePrior(state,player,entries,cards){
  const owner=state.players[player],hand=owner.hand || [];
  const own=entries.filter(e=>controllerOf(e.card)===player);
  const all=[...hand,...(owner.deck || []),...(owner.discard || []),...own.map(e=>e.card)];
  if(!['100','82','84','88','92'].every(id=>all.some(c=>c.id===id)))return ()=>0;
  const live=own.filter(e=>!e.card.faceDown && !isEffectSourceSuppressed(state,e));
  const winter=live.filter(e=>e.card.id==='100');
  const has=id=>hand.some(c=>c.id===id) || live.some(e=>e.card.id===id);
  const source=cards.get(state.pendingPrompt?.sourceIid);
  const youthIds=new Set(['100','88','89']);
  const zones=[0,1,2].map(z=>({z,weight:own.filter(e=>e.z===z).reduce((n,e)=>n+(youthIds.has(e.card.id)?5:1),0)}))
    .sort((a,b)=>b.weight-a.weight || a.z-b.z).slice(0,2).map(e=>e.z);
  function access(c){
    if(!c)return 0;
    if(c.id==='84')return owner.flowerPickingEligible===true?10:0;
    if(c.id==='bh05')return hand.some(c=>c.id==='bh05')?2:16;
    if(c.id==='100')return 10;
    if(c.id==='82')return state.landscapeId==='igb15'?1:has('82')?2:9;
    if(c.id==='09')return 8;
    if(c.id==='89')return Number(state.supporterEffectsActivated?.[player] || 0)<10?7:2;
    if(c.id==='88')return Math.min(8,own.filter(e=>e.card.type!=='Supporter').length*2);
    if(c.id==='97')return 7;
    if(c.id==='60')return 6;
    return 0;
  }
  return command=>{
    const p=command.payload || {},card=cards.get(p.cardIid || p.sourceIid);
    const selected=(p.selectedIids || (p.selectedIid?[p.selectedIid]:[])).map(id=>cards.get(id)).filter(Boolean);
    let score=0;
    if(source?.id==='bh05')score+=selected.reduce((n,c)=>n+(c.id==='100'?20:['88','89'].includes(c.id)?12:-8),0);
    if(['84','06','60','58','bh05'].includes(source?.id) && state.pendingPrompt?.type==='CARD_SELECTION')score+=selected.reduce((n,c)=>n+access(c),0);
    if(state.pendingPrompt?.ordered)score+=selected.reduce((n,c,i)=>n+access(c)/(i+1),0);
    if(source?.id==='82' && p.choice==='igb15')score+=15;
    if(p.destination && card){
      if(card.id==='100')score+=state.landscapeId==='igb15'?9:3;
      if(card.id==='82')score+=state.landscapeId!=='igb15'?Number(state.turn)<=10?14:10:0;
      if(youthIds.has(card.id) || card.id==='bh05')score+=zones.includes(Number(p.destination.z))?7:-6;
      // Prefer compact payment for Felicyta: spare reinforcement bodies stay
      // available for the Youth formation rather than occupying every square.
      if(card.id==='82')score-=Math.max(0,(p.tributeIids || []).length-1)*2;
      if(card.id==='97')score+=5;
      // Search/recovery must resolve outside Lumberjack's suppression zone.
      if(['60','58','75','97'].includes(card.id) && live.some(e=>e.z===Number(p.destination.z) && e.card.id==='92'))score-=12;
    }
    const tributes=new Set(p.tributeIids || []);
    for(const e of own.filter(e=>tributes.has(e.card.iid))){
      if(e.card.id==='100')score-=15;
      if(card?.id==='100')score-=Math.min(10,effectiveFate(state,e)*.4);
      if(['82','84'].includes(e.card.id) && (winter.length || card?.id==='100')
        && !own.some(other=>other.card.iid!==e.card.iid && !tributes.has(other.card.iid) && ['82','84'].includes(other.card.id)))score-=8;
    }
    return score;
  };
}
