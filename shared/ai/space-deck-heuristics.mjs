import {boardEntries,controllerOf,rowOwner} from '../engine/selectors.mjs';
import {effectiveFate,isEffectSourceSuppressed} from '../engine/modifiers.mjs';

const MOSCOW='igb24';
const placements=new Set(['SET_CARD','SET_CARD_FROM_DECK','CONSOLIDATE_CARD','SET_ADAPTIVE_TOKEN']);
const picks=q=>q.selectedIids || [q.selectedIid || q.targetIid].filter(Boolean);
const adjacent=(a,b)=>a.z===b.z && Math.abs(a.r-b.r)+Math.abs(a.c-b.c)===1;
const gain=c=>Math.max(0,Number(c.currentFate || 0)-Number(c.baseFate || 0));

function context(state,player,entries=boardEntries(state)){
  const p=state.players[player];
  const own=entries.filter(e=>controllerOf(e.card)===player);
  const live=own.filter(e=>!e.card.faceDown && !isEffectSourceSuppressed(state,e));
  const enemy=entries.filter(e=>controllerOf(e.card)!==player);
  const cards=new Map([...entries.map(e=>e.card),...state.players.flatMap(p=>[...(p.hand || []),...(p.deck || []),...(p.discard || [])])].map(c=>[c.iid,c]));
  const source=cards.get(state.pendingPrompt?.sourceIid);
  const open=[];
  state.board.forEach((zone,z)=>zone.forEach((row,r)=>row.forEach((c,col)=>{if(!c)open.push({z,r,c:col});})));
  return {p,own,live,enemy,cards,source,open};
}

export function createSpaceDeckPrior(state,player,entries,_cards,kind){
  const {p,own,live,enemy,cards,source,open}=context(state,player,entries);
  const held=id=>(p.hand || []).some(c=>c.id===id);
  const active=id=>live.filter(e=>e.card.id===id);
  const supporters=own.filter(e=>e.card.type==='Supporter');
  const targetsIn=z=>enemy.filter(e=>e.z===z && e.r===1 && !e.card.faceDown);
  const denial=d=>{
    const ownership=rowOwner(state,d.z,d.r);
    if(ownership===player)return -20;
    const enemyHere=enemy.filter(e=>e.z===d.z).length;
    const available=open.filter(e=>e.z===d.z && rowOwner(state,e.z,e.r)!==player).length;
    return 12+enemyHere*2+Math.max(0,8-available)*2+(d.r===1?4:0);
  };
  function access(c){
    if(kind==='perez'){
      if(c.id==='91')return state.landscapeId===MOSCOW || held('82')?2:24;
      if(c.id==='82')return state.landscapeId===MOSCOW?0:24;
      if(c.id==='74')return 18;
      if(c.id==='60')return 13;
      if(c.id==='44')return 12;
      if(c.id==='bh24')return 11;
      if(c.id==='22')return active('22').length?4:14;
      if(c.id==='40')return active('40').length?3:10;
      if(c.id==='11')return 12;
      if(c.id==='95')return Number(state.turn)>=14?14:6;
      return 3;
    }
    if(c.id==='bh07')return active('bh07').length?5:18;
    if(c.id==='bh06')return Number(state.turn)>=6?15:4;
    if(c.id==='62')return 13;
    if(c.id==='bh01')return 15;
    if(c.id==='30')return enemy.some(e=>e.r===1 && effectiveFate(state,e)>=8)?13:0;
    if(c.id==='16')return targetsIn(0).length+targetsIn(1).length+targetsIn(2).length?10:3;
    if(c.id==='81')return Number(state.moralePressure?.consolidationsThisTurn?.[1-player] || 0)>=2?14:1;
    if(['60','68','06','90'].includes(c.id))return 11;
    return 4;
  }
  return command=>{
    const q=command.payload || {},card=cards.get(q.cardIid || q.sourceIid);
    const selected=picks(q).map(i=>cards.get(i)).filter(Boolean);
    let score=0;
    if(state.pendingPrompt && ['07','60','68','06','13','90','91'].includes(source?.id))score+=selected.reduce((n,c)=>n+access(c),0);
    if(kind==='perez'){
      if(source?.id==='82')score+=q.choice===MOSCOW?60:-30;
      if(source?.id==='22')score+=selected.reduce((n,c)=>n+(c.type==='Supporter'?16+gain(c)*2:0),0);
      if(command.type==='ACTIVATE_EFFECT' && card?.id==='22')score+=20;
      if(command.type==='ACTIVATE_EFFECT' && card?.id==='40')score+=12;
      if(q.destination && card && placements.has(command.type)){
        const d=q.destination,formation=supporters.filter(e=>e.z===d.z);
        score+=access(card);
        if(card.id==='07')score+=100+(rowOwner(state,d.z,d.r)===player?15:-15);
        if(card.type==='Supporter'){
          // Claim five of the nine contested squares before investing in
          // expensive characters; deploy Maja/Chris-buffed bodies first.
          const occupied=supporters.filter(e=>e.r===1).length;
          score+=d.r===1?(occupied<5?35:12):0;
          score+=gain(card)*2;
          score+=live.filter(e=>e.card.id==='22' && e.z===d.z).length*8;
        }
        if(card.id==='44')score+=own.filter(e=>adjacent(e,d)).length*7;
        if(card.id==='22')score+=formation.reduce((n,e)=>n+5+gain(e.card),0);
        if(card.id==='11')score+=formation.length*5;
        if(card.id==='82')score+=state.landscapeId===MOSCOW?-30:35;
      }
      for(const iid of q.tributeIids || []){
        const c=cards.get(iid);
        if(c?.type==='Supporter')score-=12+gain(c)*3;
        if(['22','40','11'].includes(c?.id))score-=20;
      }
    }else{
      if(source?.id==='30')score+=selected.reduce((n,c)=>n+effectiveFate(state,c)*2,0);
      if(source?.id==='16')score+=selected.reduce((n,c)=>n+(controllerOf(c)!==player?10+effectiveFate(state,c): -20),0);
      if(source?.id==='62' && q.destination)score+=denial(q.destination);
      if(q.destination && card){
        const d=q.destination,formation=own.filter(e=>e.z===d.z);
        if(placements.has(command.type))score+=access(card);
        if(card.id==='token1')score+=denial(d);
        if(card.id==='bh01' && ['MOVE_CARD','SET_CARD','CONSOLIDATE_CARD'].includes(command.type))score+=denial(d);
        if(card.id==='30')score+=Math.max(0,...targetsIn(d.z).map(e=>effectiveFate(state,e)))*2;
        if(card.id==='16')score+=enemy.filter(e=>e.z===d.z && e.card.type==='Supporter').reduce((n,e)=>Math.max(n,8+effectiveFate(state,e)+(e.r===1?8:0)),0);
        if(card.id==='bh07'){
          score+=formation.length*4;
          score+=own.filter(e=>e.card.type==='Dauntless' && adjacent(e,d)).length*20;
          score+=open.filter(e=>adjacent(e,d) && rowOwner(state,e.z,e.r)!==1-player).length*5;
        }
        if(card.counters?.adaptiveToken){
          score+=q.declaredType==='Dauntless'?30:-100;
          score+=active('bh07').filter(e=>adjacent(e,d)).length*(25+formation.length*3);
        }
        if(card.id==='bh06')score+=active('bh07').length?20:0;
      }
      for(const iid of q.tributeIids || []){
        const c=cards.get(iid);
        if(c?.id==='bh07' || c?.counters?.adaptiveToken)score-=35;
      }
    }
    return score;
  };
}

export function filterSpaceDeckTargets(commands,state,player,kind){
  const {p,live,enemy,cards,source}=context(state,player);
  const prefer=predicate=>{const chosen=commands.filter(predicate);return chosen.length?chosen:commands;};
  if(state.pendingPrompt){
    if(kind==='perez' && source?.id==='82')return prefer(c=>c.payload?.choice===MOSCOW);
    if(kind==='perez' && source?.id==='91' && !(p.hand || []).some(c=>c.id==='82'))return prefer(c=>picks(c.payload || {}).some(i=>cards.get(i)?.id==='82'));
    if(kind==='pierogi' && source?.id==='30')return prefer(c=>picks(c.payload || {}).some(i=>effectiveFate(state,cards.get(i))>=8));
    return commands;
  }
  if(kind==='perez'){
    // Both seats get this opening, even when the AI starts on global turn 2.
    const maja=commands.filter(c=>cards.get(c.payload?.cardIid)?.id==='07' && placements.has(c.type));
    if(maja.length && !live.some(e=>e.card.id==='07'))return maja;
    return commands;
  }
  const consolidations=Number(state.moralePressure?.consolidationsThisTurn?.[1-player] || 0);
  const adjacentTokens=new Set(commands.filter(c=>c.type==='SET_ADAPTIVE_TOKEN' && c.payload?.declaredType==='Dauntless'
    && live.some(e=>e.card.id==='bh07' && adjacent(e,c.payload.destination))).map(c=>c.payload.cardIid));
  return commands.filter(command=>{
    const q=command.payload || {},card=cards.get(q.cardIid || q.sourceIid);
    if(card?.id==='81' && placements.has(command.type))return consolidations>=2;
    if(card?.id==='30' && (placements.has(command.type) || command.type==='ACTIVATE_EFFECT')){
      const zone=q.destination?.z ?? live.find(e=>e.card.iid===card.iid)?.z;
      return enemy.some(e=>e.z===zone && e.r===1 && !e.card.faceDown && effectiveFate(state,e)>=8);
    }
    if(command.type==='SET_ADAPTIVE_TOKEN')return q.declaredType==='Dauntless'
      && (!adjacentTokens.has(q.cardIid) || live.some(e=>e.card.id==='bh07' && adjacent(e,q.destination)));
    return true;
  });
}
