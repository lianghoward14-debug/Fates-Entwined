import {boardEntries,controllerOf,rowOwner,squareStatuses} from '../engine/selectors.mjs';
import {effectiveFate,isEffectSourceSuppressed,runtimeRuleId} from '../engine/modifiers.mjs';
import {zoneScore} from '../engine/scoring.mjs';

const placing=c=>['SET_CARD','SET_CARD_FROM_DECK','CONSOLIDATE_CARD'].includes(c.type);
const selected=q=>q.selectedIids || [q.selectedIid || q.targetIid].filter(Boolean);
function inspect(state,player){
  const p=state.players[player],entries=boardEntries(state),own=entries.filter(e=>controllerOf(e.card)===player);
  const all=[...(p.hand || []),...(p.deck || []),...(p.discard || []),...own.map(e=>e.card)];
  const ids=new Set(all.map(c=>c.id));
  const kind=['bh17','48','43','66','04'].every(id=>ids.has(id))?'momentum':['45','63','76','bh22','33'].every(id=>ids.has(id))?'lakes':'';
  const live=own.filter(e=>!e.card.faceDown && !isEffectSourceSuppressed(state,e));
  const cards=new Map([...all,...entries.map(e=>e.card)].map(c=>[c.iid,c]));
  const lead=[0,1,2].reduce((n,z)=>n+zoneScore(state,z,player)-zoneScore(state,z,1-player),0);
  return {p,entries,own,live,cards,kind,lead,source:cards.get(state.pendingPrompt?.sourceIid)};
}

export function createLakesMomentumPrior(state,player){
  const {p,entries,own,live,cards,kind,lead,source}=inspect(state,player);
  if(!kind)return ()=>0;
  const active=id=>live.filter(e=>runtimeRuleId(e.card)===id),held=id=>(p.hand || []).some(c=>c.id===id);
  const jakobs=active('bh17').length;
  const morale=Number(state.moralePressure?.morale?.[player] ?? 200);
  const enemy=entries.filter(e=>controllerOf(e.card)!==player && !e.card.faceDown);
  function access(c){
    if(kind==='momentum'){
      if(c.id==='bh17')return jakobs<2?35:15;
      if(c.id==='48')return jakobs<2?25:7;
      if(c.id==='09')return 18;
      if(c.id==='74')return 17;
      if(c.id==='07')return 35;
      if(['43','66','04'].includes(c.id))return jakobs>=2?18:0;
      if(['27','32','75','60','98','28'].includes(c.id))return 12;
      if(c.id==='91')return held('82') || state.landscapeId==='igb5'?1:40;
      if(c.id==='82')return state.landscapeId==='igb5'?1:35;
    }else{
      if(c.id==='33')return morale<160?24:7;
      if(c.id==='63')return 14+active('63').length*3;
      if(c.id==='76')return 13;
      if(c.id==='09')return 17;
      if(c.id==='16')return enemy.some(e=>e.card.type==='Supporter')?17:3;
      if(c.id==='58')return (p.discard || []).length && morale>30?12:0;
      if(c.id==='bh22')return active('bh22').length?5:30;
      if(c.id==='45')return morale>80 && enemy.some(e=>effectiveFate(state,e)>=8)?18:0;
      if(c.id==='bh05')return 15;
      if(c.id==='40')return 12;
      if(c.id==='30')return enemy.some(e=>e.r===1 && effectiveFate(state,e)>=8)?16:2;
    }
    return 5;
  }
  return command=>{
    const q=command.payload || {},card=cards.get(q.cardIid || q.sourceIid),targets=selected(q).map(i=>cards.get(i)).filter(Boolean);
    let score=0;
    if(state.pendingPrompt && ['48','60','58','75','07','91'].includes(source?.id))score+=targets.reduce((n,c,i)=>n+access(c)/(state.pendingPrompt.ordered?i+1:1),0);
    if(placing(command) && card && q.destination){
      const d=q.destination,formation=own.filter(e=>e.z===d.z);
      score+=access(card);
      if(kind==='momentum'){
        if(card.id==='07')score+=80;
        if(card.id==='82')score+=state.landscapeId==='igb5'?-25:40;
        if(card.type==='Supporter')score+=Math.max(0,Number(card.currentFate)-Number(card.baseFate))*3+(lead<=0?12:5);
        if(card.id==='bh17')score+=jakobs<2?40:20;
        if(['43','66','04'].includes(card.id))score+=jakobs>=2 && lead>0?30:-20;
        if(card.id==='66')score+=formation.filter(e=>e.card.type!=='Supporter').length*2;
        if(card.id==='04')score+=enemy.filter(e=>e.z===d.z && effectiveFate(state,e)<=3).length*4;
        if(command.type==='CONSOLIDATE_CARD'){
          const payment=(q.tributeIids || []).reduce((n,i)=>n+effectiveFate(state,cards.get(i)),0);
          if(lead-payment<=0)score-=30;
        }
      }else{
        if(card.id==='63')score+=formation.filter(e=>e.card.id==='63').length*18;
        if(card.id==='45'){
          score+=morale>100?15:-35;
          if(rowOwner(state,d.z,d.r)===player)score+=12;
          score+=squareStatuses(state,d,'MORALE_RECOVERY_SQUARE').length*20;
        }
        // Establish recovery before paying Chingachlook's 50 Morale.
        // Jaime may mark a safe square in another zone, so keep his body
        // outside the zone reserved for the lone Chingachlook character.
        if(card.id==='bh22')score+=active('bh22').length?8:30;
        if(card.id==='76' && rowOwner(state,d.z,d.r)===player)score+=5;
        if(card.id==='30')score+=Math.max(0,...enemy.filter(e=>e.z===d.z && e.r===1).map(e=>effectiveFate(state,e)));
        if(card.type==='Supporter')score+=formation.some(e=>e.card.id==='45')?6:0;
      }
    }
    if(kind==='momentum' && source?.id==='04' && q.destination){
      const e=entries.find(e=>e.z===q.destination.z && e.r===q.destination.r && e.c===q.destination.c);
      if(e && controllerOf(e.card)!==player){
        // Pin weak bodies that the opponent would otherwise replace or use
        // as reinforcement. Do not preferentially protect their big threat.
        score+=24-effectiveFate(state,e)*4;
        if(e.card.type==='Supporter')score+=8;
      }
    }
    if(kind==='lakes'){
      if(source?.id==='bh22' && q.destination){
        const e=entries.find(e=>e.z===q.destination.z && e.r===q.destination.r && e.c===q.destination.c);
        if(e && controllerOf(e.card)===player)score+=effectiveFate(state,e)*3+(e.card.id==='45'?15:0);
        if(!e && held('45') && !own.some(x=>x.z===q.destination.z && x.card.type!=='Supporter' && x.card.type!=='Counter'))score+=30;
      }
      if(['45','30','16'].includes(source?.id))score+=targets.reduce((n,c)=>n+(controllerOf(c)!==player?15+effectiveFate(state,c)*2:-60),0);
      if(source?.id==='bh05')score+=targets.reduce((n,c)=>n+(c.id==='bh22'?30:c.id==='40'?10:c.id==='45'?-40:access(c)),0);
      if(command.type==='ACTIVATE_EFFECT' && card?.id==='40')score+=12;
    }
    for(const iid of q.tributeIids || []){
      const c=cards.get(iid);
      if(kind==='momentum' && c?.id==='bh17')score-=100;
      if(kind==='lakes' && ['63','bh22','40'].includes(c?.id))score-=20;
      if(kind==='momentum' && c && Number(c.currentFate)>Number(c.baseFate))score-=15;
    }
    return score;
  };
}

export function filterLakesMomentum(commands,state,player){
  const {kind,p,live,cards,source,entries}=inspect(state,player);
  if(kind==='lakes'){
    const high=entries.filter(e=>controllerOf(e.card)!==player && !e.card.faceDown && effectiveFate(state,e)>=8);
    if(state.pendingPrompt){
      if(['30','45'].includes(source?.id)){
        const preferred=commands.filter(c=>selected(c.payload || {}).some(i=>high.some(e=>e.card.iid===i)));
        if(preferred.length)return preferred;
      }
      return commands;
    }
    return commands.filter(command=>{
      const q=command.payload || {},card=cards.get(q.cardIid || q.sourceIid);
      if(!['30','45'].includes(card?.id) || (!placing(command) && command.type!=='ACTIVATE_EFFECT'))return true;
      const z=q.destination?.z ?? live.find(e=>e.card.iid===card.iid)?.z;
      return high.some(e=>card.id==='45' || (e.z===z && e.r===1));
    });
  }
  if(kind!=='momentum')return commands;
  const prefer=fn=>{const picks=commands.filter(fn);return picks.length?picks:commands;};
  if(state.pendingPrompt){
    if(source?.id==='82')return prefer(c=>c.payload?.choice==='igb5');
    if(source?.id==='91')return prefer(c=>selected(c.payload || {}).some(i=>cards.get(i)?.id==='82'));
    if(source?.id==='07' && !(p.hand || []).some(c=>['91','82'].includes(c.id)) && state.landscapeId!=='igb5')
      return prefer(c=>selected(c.payload || {}).some(i=>cards.get(i)?.id==='91'));
    return commands;
  }
  const maja=commands.filter(c=>placing(c) && cards.get(c.payload?.cardIid)?.id==='07');
  if(maja.length && !live.some(e=>e.card.id==='07'))return maja;
  const jakobs=live.filter(e=>e.card.id==='bh17').length;
  return commands.filter(c=>!placing(c) || !['43','66','04'].includes(cards.get(c.payload?.cardIid)?.id) || jakobs>=2);
}
