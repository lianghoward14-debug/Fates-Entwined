import {boardEntries,controllerOf,rowOwner,squareStatuses} from '../engine/selectors.mjs';
import {effectiveFate,canUseAsConsolidationTribute,effectiveConsolidationCost,isEffectSourceSuppressed,runtimeRuleId} from '../engine/modifiers.mjs';
import {zoneScore} from '../engine/scoring.mjs';
import {SUPPORT_COMPANY_CATEGORIES,supportCompanyOffers,supportCompanyCost} from '../support-company.mjs';
import {recruitmentContext} from './recruitment-context.mjs';

// Recognize the original composition even after recruitment, theft, or discards.
export function havanoViajeContext(state,player){
  const owner=state.players[player], entries=boardEntries(state);
  const own=entries.filter(e=>controllerOf(e.card)===player);
  const known=[...(owner.originalDeck || []),...(owner.hand || []),...(owner.deck || []),...(owner.discard || []),...own.map(e=>e.card)];
  const ids=new Set(known.map(c=>String(c.id || c)));
  const kind=['114','37','34','66','07'].every(id=>ids.has(id))?'havano':
    ['101','bh22','119','120','33'].every(id=>ids.has(id))?'viaje':'';
  if(!kind)return {kind};
  const live=own.filter(e=>!e.card.faceDown && !isEffectSourceSuppressed(state,e));
  const enemy=entries.filter(e=>controllerOf(e.card)!==player && !e.card.faceDown);
  // No opposing hand, deck, or face-down identity enters this model.
  const cards=new Map([...known.filter(c=>c && typeof c==='object'),...own.map(e=>e.card),...enemy.map(e=>e.card)].map(c=>[c.iid,c]));
  for(const card of state.pendingPrompt?.eligibleCards || [])cards.set(card.iid,card);
  const morale=Number(state.moralePressure?.morale?.[player] ?? 200);
  const cap=Number(state.moralePressure?.maxMorale || 200);
  const future=Number(state.turn)<Number(state.maxTurns);
  const heals=(state.geometry?.squareStatuses || []).filter(s=>s.type==='MORALE_RECOVERY_SQUARE' && Number(s.playerIndex)===player);
  return {kind,owner,own,live,enemy,cards,morale,cap,future,heals};
}

export function createHavanoViajePrior(state,player){
  const ctx=havanoViajeContext(state,player);
  if(!ctx.kind)return ()=>0;
  const {kind,owner,own,live,enemy,cards,morale,cap,future,heals}=ctx;
  const hand=owner.hand || [], deck=owner.deck || [], grave=owner.discard || [];
  const active=id=>live.filter(e=>runtimeRuleId(e.card)===id);
  const held=id=>hand.some(c=>c.id===id);
  const blockades=active('114').length;
  const denial=(state.statuses || []).filter(s=>s.type==='MERCHANT_DRAW_DENIAL' && Number(s.playerIndex)===player)
    .reduce((n,s)=>n+Number(s.remainingDrawPhases || 0),0);
  const slots=Math.max(0,Number(state.maxSupportsPerTurn || 2)+Number(state.extraSupportsThisTurn || 0)-Number(state.supportersSetForCapThisTurn?.[player] || 0));
  const source=cards.get(state.pendingPrompt?.sourceIid), rule=runtimeRuleId(source);
  const sourceEntry=own.find(e=>e.card.iid===source?.iid);
  const formation=z=>live.filter(e=>e.z===z);
  const missing=id=>!held(id) && !active(id).length;
  const recruitment=kind==='viaje'?recruitmentContext(state,player):null;
  const catalog=new Map((state.cardCatalog || []).map(c=>[String(c.id),c]));
  const recruitCache=new Map();
  // Rank real offers, not a fixed category order. These are the same visible,
  // stable offers that the player can inspect in Call to Arms.
  function recruitValue(id){
    if(recruitCache.has(id))return recruitCache.get(id);
    const c=catalog.get(String(id));if(!c || !recruitment)return 0;
    const tributes=own.filter(e=>canUseAsConsolidationTribute(state,e,player,c).ok);
    const supply=tributes.reduce((n,e)=>n+canUseAsConsolidationTribute(state,e,player,c).reinforcement,0);
    const cost=Math.min(effectiveConsolidationCost(state,c,player),...tributes.map(e=>effectiveConsolidationCost(state,c,player,e)));
    const ready=c.type==='Supporter'?recruitment.placements>0 && recruitment.open>0:supply>=cost && (recruitment.open>0 || cost>0);
    const late=Number(state.maxTurns)-Number(state.turn)<=2;
    const threatened=recruitment.margins.filter(m=>m<0).length;
    let value=0;
    if(c.id==='101')value+=missing('101')?24:heals.length?8:0;
    if(c.id==='bh22')value+=heals.length?2:active('101').length?26:16;
    if(c.id==='12')value+=active('101').some(e=>!e.card.statuses?.includes('IMMUNE_TO_OPPONENT_EFFECTS'))?20:2;
    if(c.id==='33')value+=Math.min(22,(cap-morale)*.35)+(active('101').length?5:0);
    if(c.id==='79'||c.id==='56')value+=held(c.id)?-8:active('101').length?16:6;
    const vulnerable=enemy.filter(e=>!e.card.statuses?.includes('IMMUNE_TO_OPPONENT_EFFECTS'));
    if(c.id==='16')value+=Math.max(-10,...vulnerable.filter(e=>e.card.type==='Supporter').map(e=>Math.min(22,effectiveFate(state,e)+8)));
    if(c.id==='30')value+=Math.max(-12,...vulnerable.filter(e=>e.r===1).map(e=>Math.min(24,effectiveFate(state,e)+10)));
    if(['61','bh16','10','36'].includes(c.id))value+=Math.min(18,vulnerable.length*3+threatened*4);
    if(['50','114','18','67'].includes(c.id))value+=future && enemy.length?8+threatened*3:-6;
    if(c.id==='58')value+=grave.some(x=>['33','120','60'].includes(x.id)) && morale>35?12:-10;
    if(['09','28','74','60','13','07'].includes(c.id))value+=supply<3 && hand.some(x=>Number(x.cost)>supply)?16:hand.length<4?7:1;
    if(['84','60','72','118'].includes(c.id))value+=denial>0 && hand.length<5?10:0;
    if(c.id==='120')value+=12;
    // Do not recruit another Merchant just to generate an endless recruit loop.
    if(c.id==='119')value-=denial>0?16:6;
    if(c.id==='bh20')value+=heals.length && active('101').length && morale>40 && threatened>0?10:-14;
    if(held(c.id))value-=8;
    if(recruitment.hand.length>=recruitment.handLimit)value-=14;
    if(!ready && !['79','56'].includes(c.id))value=late?-28:value*.3-7;
    else if(ready)value+=6;
    // An answer can require sacrificing the engine: price that explicitly.
    const expendable=tributes.filter(e=>e.card.id!=='101' && !heals.some(s=>s.z===e.z && s.r===e.r && s.c===e.c))
      .reduce((n,e)=>n+canUseAsConsolidationTribute(state,e,player,c).reinforcement,0);
    if(c.type!=='Supporter' && cost>expendable && cost<=supply)value-=16;
    recruitCache.set(id,value);return value;
  }
  let bestRecruit;
  function recruitmentUpside(){
    if(bestRecruit==null)bestRecruit=Math.max(0,...SUPPORT_COMPANY_CATEGORIES.flatMap(category=>
      supportCompanyOffers(state.cardCatalog || [],state.matchId,player,category.id).map(recruitValue)));
    return bestRecruit;
  }
  function access(card){
    if(!card)return 0;
    const id=String(card.id);
    if(id==='28')return -5; // Prefer its free deck placement, not tutoring it into hand.
    if(id==='79')return held(id)?1:11; // Retain an answer instead of setting it proactively.
    if(id==='60')return deck.some(c=>c.type==='Supporter' && c.id!=='28')?9:0;
    if(kind==='havano'){
      if(id==='114')return future?Math.max(5,25-blockades*6):0;
      if(id==='37')return blockades?20:enemy.some(e=>runtimeRuleId(e.card)==='114')?16:0;
      if(id==='74')return slots<3 && hand.some(c=>c.type==='Supporter' && c.id!=='74')?15:3;
      if(id==='68')return deck.some(c=>['34','66'].includes(c.id))?13:1;
      if(id==='34')return missing('34')?18:6;
      if(id==='66')return active('34').length?18:7;
      if(id==='07')return deck.filter(c=>c.type==='Supporter').length>=3?24:5;
      if(id==='13')return deck.some(c=>c.type==='Supporter')?12:0;
      if(['27','32'].includes(id))return hand.length<5 && deck.length?12:3;
      if(id==='16')return enemy.some(e=>e.card.type==='Supporter')?12:0;
    }else{
      if(id==='101')return missing(id)?24:8;
      if(id==='bh22')return heals.length?5:22;
      if(id==='84')return deck.length?20:0;
      if(id==='120')return 14+Math.min(18,recruitmentUpside()*.6);
      if(id==='119'){
        // Repeated calls remain worthwhile when they find a timely answer.
        // The penalty is the marginal lost draws left in this match, not a veto.
        const futureDraws=Math.ceil(Math.max(0,state.maxTurns-state.turn)/2);
        const lost=Math.min(3,Math.max(0,futureDraws-denial));
        return 6+Math.min(24,recruitmentUpside()*.8)-lost*(hand.length<4?5:2);
      }
      if(id==='33')return Math.min(18,(cap-morale)*.3)+(active('101').length?8:0);
      if(id==='58')return morale<=30?-20:grave.some(c=>['33','120','60'].includes(c.id))?14:-8;
      if(id==='12')return active('101').length?16:3;
      if(id==='bh20')return heals.length && active('101').length && morale>35?12:-12;
      if(['72','118'].includes(id))return hand.length<6?9:3;
    }
    return 0;
  }
  function preserve(card){
    const id=runtimeRuleId(card);
    if(kind==='havano' && id==='114')return future?24:4;
    if(kind==='havano' && ['34','66'].includes(id))return 18;
    if(kind==='viaje' && id==='101')return 30;
    const e=own.find(e=>e.card.iid===card.iid);
    if(e && heals.some(s=>s.z===e.z && s.r===e.r && s.c===e.c))return 20;
    return 0;
  }
  return command=>{
    const p=command.payload || {}, card=cards.get(p.cardIid || p.sourceIid);
    const targets=(p.selectedIids || [p.selectedIid || p.targetIid].filter(Boolean)).map(i=>cards.get(i)).filter(Boolean);
    let score=0;
    if(kind==='viaje' && command.type==='SUPPORT_COMPANY'){
      const answer=recruitValue(p.cardId);
      if(p.ability==='desperate'){
        const remaining=morale-supportCompanyCost(morale);
        return remaining<=Math.max(15,recruitment.incoming)?-60:answer*.5;
      }
      return answer+Math.min(12,recruitmentUpside()*.4);
    }
    if(kind==='viaje' && command.type==='ANSWER_PROMPT' && state.pendingPrompt?.title==='Call to Arms'){
      if(p.choice)return Math.max(-30,...supportCompanyOffers(state.cardCatalog || [],state.matchId,player,p.choice).map(recruitValue));
      return (p.selectedIids || [p.selectedIid].filter(Boolean)).reduce((n,id)=>n+recruitValue(id),0);
    }
    if(state.pendingPrompt?.type==='CARD_SELECTION' && ['60','13','07','68','58','84','119','120'].includes(rule)){
      score+=targets.reduce((n,c)=>n+access(c),0);
      if(targets.length>1)score-=Math.max(0,targets.length-new Set(targets.map(c=>c.id)).size)*5;
    }
    // Recruitment offers often encode a catalog ID rather than an instance IID.
    if(['119','120'].includes(rule) && p.choice){
      const chosen=[...cards.values()].find(c=>c.id===String(p.choice));
      if(chosen)score+=access(chosen);
    }
    if(state.pendingPrompt?.type==='HAND_SELECTION')score-=targets.reduce((n,c)=>n+access(c),0);
    if(['SET_CARD','SET_CARD_FROM_DECK','CONSOLIDATE_CARD'].includes(command.type) && card && p.destination){
      const d=p.destination,z=Number(d.z),id=runtimeRuleId(card),safe=rowOwner(state,z,Number(d.r))===player;
      score+=access(card);
      if(card.id==='28' && command.type==='SET_CARD_FROM_DECK')score+=28;
      if(card.id==='79')score-=held('79') && hand.filter(c=>c.id==='79').length===1?20:4;
      if(kind==='havano'){
        if(['114','37'].includes(id))score+=safe?8:-4;
        if(['34','66'].includes(id))score+=formation(z).length*3+formation(z).filter(e=>['34','66'].includes(runtimeRuleId(e.card))).length*8;
        if(card.type==='Supporter' && active('34').length)score+=formation(z).some(e=>e.card.id==='34')?5:0;
        if(id==='16')score+=Math.max(-12,...enemy.filter(e=>e.z===z && e.card.type==='Supporter').map(e=>effectiveFate(state,e)+6));
      }else{
        if(id==='101')score+=(safe?12:-8)+heals.filter(s=>s.z===z).length*14;
        if(id==='33')score+=formation(z).filter(e=>e.card.id==='101').length*10;
        if(id==='12')score+=formation(z).some(e=>e.card.id==='101')?14:-6;
        if(heals.some(s=>s.z===z && s.r===d.r && s.c===d.c))score+=Math.min(18,effectiveFate(state,card));
        if(id==='bh20'){
          const lead=[0,1,2].reduce((n,z)=>n+zoneScore(state,z,player)-zoneScore(state,z,1-player),0);
          if(Number(state.maxTurns)-Number(state.turn)<=2 && lead>12)score-=20;
        }
      }
    }
    if(rule==='37')score+=targets.reduce((n,c)=>n+(runtimeRuleId(c)==='114' && future?25:0),0);
    if(rule==='16')score+=targets.reduce((n,c)=>n+(controllerOf(c)!==player?effectiveFate(state,c)+8:-40),0);
    if(['34','66'].includes(rule) && p.choice && sourceEntry){
      const allies=formation(sourceEntry.z);
      score+=allies.filter(e=>(e.card.affiliation || e.card.aff)===p.choice).length*5;
      if(rule==='66')score+=allies.some(e=>e.card.id==='34' && e.card.counters?.moraleAffiliation===p.choice)?24:0;
      if(rule==='34')score+=allies.some(e=>e.card.id==='66' && (e.card.counters?.lastDeclaredAffiliation || e.card.counters?.declaredAffiliation)===p.choice)?16:0;
    }
    if(rule==='bh22' && p.destination){
      const d=p.destination,e=own.find(e=>e.z===d.z && e.r===d.r && e.c===d.c);
      score+=e?effectiveFate(state,e)*1.5+(e.card.id==='101'?18:0):held('101')?4:-5;
      if(squareStatuses(state,d,'MORALE_RECOVERY_SQUARE').length)score-=35;
      score+=formation(d.z).some(e=>e.card.id==='101')?10:0;
    }
    if(rule==='12')score+=targets.reduce((n,c)=>n+(controllerOf(c)===player?preserve(c)+effectiveFate(state,c)*.4:-40),0);
    for(const iid of p.tributeIids || []){const c=cards.get(iid);if(c)score-=preserve(c);}
    return score;
  };
}

export function havanoViajeFutureValue(state,player){
  const ctx=havanoViajeContext(state,player);
  if(!ctx.kind || !ctx.future)return 0;
  const {live,enemy,heals,kind}=ctx;
  if(kind==='havano')return Math.min(3,live.filter(e=>runtimeRuleId(e.card)==='114').length)*
    (3+Math.min(4,enemy.filter(e=>e.card.type==='Supporter').length));
  return live.filter(e=>e.card.id==='101').reduce((n,e)=>n+heals.filter(s=>s.z===e.z).reduce((sum,s)=>{
    const occupant=live.find(x=>x.z===s.z && x.r===s.r && x.c===s.c);
    return sum+(occupant?Math.min(12,effectiveFate(state,occupant)/3):0);
  },0),0);
}
