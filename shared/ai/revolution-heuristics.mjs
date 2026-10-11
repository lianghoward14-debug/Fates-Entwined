import {boardEntries,controllerOf,rowOwner,squareStatuses} from '../engine/selectors.mjs';
import {effectiveFate,effectiveReinforcement,isEffectSourceSuppressed,runtimeRuleId} from '../engine/modifiers.mjs';
import {zoneScore} from '../engine/scoring.mjs';

const placing=c=>['SET_CARD','SET_CARD_FROM_DECK','CONSOLIDATE_CARD'].includes(c.type);
const selected=p=>p.selectedIids || [p.selectedIid || p.targetIid].filter(Boolean);
export function revolutionContext(state,player){
  const owner=state.players[player],entries=boardEntries(state),own=entries.filter(e=>controllerOf(e.card)===player);
  const all=[...(owner.hand || []),...(owner.deck || []),...(owner.discard || []),...own.map(e=>e.card)];
  const ids=new Set(all.map(c=>c.id));
  const kind=['21','38','08','80','bh24'].every(id=>ids.has(id))?'oaf':['102','104','105','50','97'].every(id=>ids.has(id))?'black':'';
  if(!kind)return {kind};
  const live=own.filter(e=>!e.card.faceDown && !isEffectSourceSuppressed(state,e));
  const cards=new Map([...all,...entries.map(e=>e.card)].map(c=>[c.iid,c]));
  const enemy=entries.filter(e=>controllerOf(e.card)!==player && !e.card.faceDown);
  const margins=[0,1,2].map(z=>zoneScore(state,z,player)-zoneScore(state,z,1-player));
  // Never read the opposing hand/deck or the identity of a face-down card.
  const revealed=[...enemy.map(e=>e.card),...(state.players[1-player].discard || [])];
  const future=Number(state.turn)<Number(state.maxTurns);
  const blocked=z=>(state.statuses || []).some(s=>s.statusType==='ZONE_ACTIONS_BLOCKED' && Number(s.playerIndex)===1-player && Number(s.zone)===z && Number(s.remainingTargetTurns)>0);
  return {owner,entries,own,live,cards,enemy,margins,revealed,kind,future,blocked};
}

// Forecasts rank plausible replies using public development, not hidden hands.
export function revolutionTrapValue(state,player,d,ctx=revolutionContext(state,player)){
  if(!d || ctx.blocked(Number(d.z)))return -20;
  const side=rowOwner(state,Number(d.z),Number(d.r));
  if(side===player)return -20;
  if(squareStatuses(state,d,'HIDDEN_BOMB_TRAP').some(s=>Number(s.owner ?? s.playerIndex)===player))return -20;
  const e=ctx.entries.find(e=>e.z===Number(d.z)&&e.r===Number(d.r)&&e.c===Number(d.c));
  if(e && (controllerOf(e.card)===player || e.card.faceDown || e.card.type!=='Supporter'))return -12;
  if(e && effectiveReinforcement(state,e,1-player)<=0)return -12;
  const contested=Number(d.r)===1;
  return (e?8:12)+(contested?5:0)+Math.max(0,10-Math.abs(ctx.margins[d.z]))*.5;
}

export function createRevolutionPrior(state,player){
  const ctx=revolutionContext(state,player),{owner,own,live,cards,enemy,margins,kind,future,blocked}=ctx;
  if(!kind)return ()=>0;
  const hand=owner.hand || [],deck=owner.deck || [],grave=owner.discard || [];
  const held=id=>hand.some(c=>c.id===id),active=id=>live.filter(e=>runtimeRuleId(e.card)===id);
  const source=cards.get(state.pendingPrompt?.sourceIid),rule=runtimeRuleId(source);
  const fuel=own.filter(e=>e.card.type==='Supporter').reduce((n,e)=>n+effectiveReinforcement(state,e,player),0);
  const slots=Math.max(0,5-Number(state.supportersSetForCapThisTurn?.[player] || 0));
  const morale=Number(state.moralePressure?.morale?.[player] ?? 200);
  const spent=e=>['08','13','29','03','27'].includes(runtimeRuleId(e.card)) && Number(e.card.counters?.effectUses || 0)>0;
  function access(c){
    if(!c)return 0;
    if(c.id==='28')return -10; // Keep the free deck-set route intact.
    if(c.id==='74')return slots>0 && hand.some(x=>x.type==='Supporter' && x.id!=='74')?18:3;
    if(c.id==='60')return deck.some(x=>x.type==='Supporter' && x.id!=='28')?10:0;
    if(c.id==='32')return hand.length<6 && deck.length?10:3;
    if(kind==='oaf'){
      if(c.id==='09')return fuel<3?20:7;
      if(c.id==='08')return !active('21').length && grave.length>=5?25:!active('38').length?22:8;
      if(c.id==='21')return grave.length>=5?20:held('08')?8:-8;
      if(c.id==='38')return active('38').length?3:18;
      if(c.id==='03')return Math.max(0,...live.filter(e=>['21','38'].includes(e.card.id)).map(e=>Math.min(22,effectiveFate(state,e))));
      if(c.id==='42')return deck.length>=3?12+(active('21').length?5:0):-12;
      if(c.id==='13')return deck.some(c=>c.type==='Supporter')?14:0;
      if(c.id==='29')return [...deck,...grave].some(x=>(x.affiliation || x.aff)==='third_great_war')?12:0;
      if(c.id==='80')return own.some(spent)&&deck.length>=2?12:-8;
      if(c.id==='bh24')return morale>30 && slots>=2 && hand.some(x=>x.type==='Supporter'&&x.id!=='bh24')?10:-15;
    }else{
      if(c.id==='16')return enemy.some(e=>e.card.type==='Supporter')?15:0;
      if(c.id==='30')return enemy.some(e=>e.r===1)?15:-8;
      if(['102','104','105'].includes(c.id))return future?({102:15,104:12,105:11}[c.id]):0;
      if(c.id==='50')return future && [0,1,2].some(z=>!blocked(z))?18:0;
      if(c.id==='97')return future && enemy.some(e=>e.card.type==='Supporter')?12:1;
      if(c.id==='76')return fuel<1 && hand.some(x=>x.type!=='Supporter')?2:12;
      if(c.id==='58')return morale>30 && grave.some(x=>x.type==='Supporter' && x.id!=='58')?12:-10;
      if(c.id==='27')return hand.length<6 && deck.length?15:1;
      if(c.id==='bh05')return 18;
    }
    return 2;
  }
  function sacrifice(c){
    const e=own.find(e=>e.card.iid===c.iid);if(!e)return -50;
    let value=8-effectiveFate(state,e)*2;
    if(['21','38','104'].includes(c.id))value-=35;
    if(c.id==='09' && fuel<4)value-=10;
    if(spent(e))value+=10;
    if(c.type==='Supporter' && ['32','42','60','74','98','28'].includes(c.id))value+=5;
    return value;
  }
  return command=>{
    const p=command.payload || {},card=cards.get(p.cardIid || p.sourceIid),targets=selected(p).map(i=>cards.get(i)).filter(Boolean);
    let score=0;
    if(state.pendingPrompt?.type==='CARD_SELECTION' && ['08','13','29','60','58'].includes(rule)){
      score+=targets.reduce((n,c)=>n+access(c),0);
      if(rule==='08')for(const c of targets){
        if(c.id==='21')score+=grave.length>=5?25:-10;
        if(c.id==='38')score+=!active('38').length?20:0;
      }
      // Repeated copies are weaker than one Pirate plus live reinforcement.
      if(targets.length>1 && new Set(targets.map(c=>c.id)).size<targets.length)score-=6;
    }
    if(state.pendingPrompt?.type==='HAND_SELECTION' && rule==='42'){
      for(const c of targets){score-=access(c);if(['21','38'].includes(c.id) && (hand.filter(x=>x.id===c.id).length>1 || active(c.id).length))score+=12;}
    }
    if(placing(command) && card && p.destination){
      const z=Number(p.destination.z);score+=access(card);
      if(card.id==='28' && command.type==='SET_CARD_FROM_DECK')score+=35;
      if(kind==='oaf'){
        if(card.id==='03' && live.some(e=>e.z===z && e.card.id==='38' && Number(e.card.counters?.lastEffectTurn)!==Number(state.turn)) && own.some(e=>e.card.type==='Supporter' && effectiveFate(state,e)<=2))score-=14;
        if(card.id==='03')score+=Math.max(-12,...live.filter(e=>e.z===z && ['21','38'].includes(e.card.id)).map(e=>Math.min(30,effectiveFate(state,e)*1.5)));
        if(['21','38'].includes(card.id) && rowOwner(state,z,Number(p.destination.r))===player)score+=8;
        if(card.id==='80')score+=own.some(e=>e.z===z && spent(e)) && deck.length>=2?16:-18;
        // Do not pay Henry's full price before the discard engine is ready.
        if(card.id==='21' && grave.length<4)score-=18;
      }else{
        if(['102','104','105'].includes(card.id)){
          if(rowOwner(state,z,Number(p.destination.r))===player)score+=8;
          if(p.faceDown===true && future)score+=5;
        }
        if(card.id==='16')score+=Math.max(-15,...enemy.filter(e=>e.z===z && e.card.type==='Supporter').map(e=>8+effectiveFate(state,e)));
        if(card.id==='30')score+=Math.max(-20,...enemy.filter(e=>e.z===z && e.r===1).map(e=>6+effectiveFate(state,e)));
      }
    }
    if(kind==='oaf'){
      if(command.type==='ACTIVATE_EFFECT' && card?.id==='38')score+=10;
      if(['38','80'].includes(rule))score+=targets.reduce((n,c)=>n+sacrifice(c),0);
      if(rule==='03')score+=targets.reduce((n,c)=>n+(controllerOf(c)===player?effectiveFate(state,c)*2+(['21','38'].includes(c.id)?12:0):-80),0);
    }else{
      if(command.type==='ACTIVATE_EFFECT' && ['102','104','105'].includes(runtimeRuleId(card)))score+=future?24:-25;
      if(rule==='102' && (p.destinations || p.destination)){
        const ds=p.destinations || [p.destination];score+=ds.reduce((n,d)=>n+revolutionTrapValue(state,player,d,ctx),0);
        score+=new Set(ds.filter(d=>revolutionTrapValue(state,player,d,ctx)>0).map(d=>d.z)).size*3;
      }
      if(rule==='50' && p.zone!=null){
        const z=Number(p.zone);score+=blocked(z)?-30:future?12+Math.max(0,12-Math.abs(margins[z]))+enemy.filter(e=>e.z===z).length*2:0;
        // Blocking a zone already mined prevents the trap from ever firing.
        score-=ownBombs(state,player).filter(s=>Number(s.z)===z).length*10;
      }
      if(rule==='105' && p.choice && ['Initiator','Improvisor','Coordinator','Dauntless'].includes(p.choice)){
        const seen=ctx.revealed.filter(c=>c.type===p.choice).length;
        score+=seen*5+(p.choice==='Initiator'?3:0);
      }
      if(rule==='bh05')for(const c of targets){
        score+=access(c);
        if(c.id==='50')score+=future?15:-15;
        if(c.id==='27')score+=hand.length<4?18:0;
        if(c.id==='76')score-=fuel<2?20:5; // Copying immunity strands reinforcement.
        if(c.id==='58' && !grave.some(x=>x.type==='Supporter'))score-=20;
      }
      if(['16','30'].includes(rule))score+=targets.reduce((n,c)=>n+(controllerOf(c)!==player?effectiveFate(state,c)*2+5:-50),0);
    }
    for(const iid of p.tributeIids || []){
      const c=cards.get(iid);if(!c)continue;
      score+=sacrifice(c)*.4;
      if(['21','38','104'].includes(c.id))score-=20;
    }
    return score;
  };
}
function ownBombs(state,player){return (state.geometry?.squareStatuses || []).filter(s=>s.type==='HIDDEN_BOMB_TRAP' && Number(s.playerIndex ?? s.owner)===player);}

// Next-turn investments need modest residual value after their activation;
// command ordering alone disappears when the reducer evaluates the leaf.
export function revolutionFutureValue(state,player){
  if(Number(state.turn)>=Number(state.maxTurns))return 0;
  const owner=state.players[player];
  const known=[...(owner.hand || []),...(owner.deck || []),...(owner.discard || []),...state.board.flat(3).filter(c=>c && controllerOf(c)===player)];
  const ids=new Set(known.map(c=>c.id));
  if(!['102','104','105','50','97'].every(id=>ids.has(id)))return 0;
  const ctx=revolutionContext(state,player);
  let value=0;
  for(const e of ctx.own){
    if(isEffectSourceSuppressed(state,e))continue;
    if(Number(e.card.counters?.jorgeTriggerTurn)>Number(state.turn))value+=5;
  }
  for(const s of state.statuses || [])if(s.statusType==='RIVERA_FATE_TRANSFER' && Number(s.sourceController)===player && Number(s.remainingTargetTurns)>0
    && ctx.own.some(e=>e.card.iid===s.sourceIid && !isEffectSourceSuppressed(state,e)))value+=6;
  for(const s of ownBombs(state,player))if(Number(s.triggerTurn)>Number(state.turn) && !ctx.blocked(Number(s.z)))value+=3;
  return Math.min(24,value);
}

// Anne's up-to-three-square picker can produce thousands of combinations.
// Retain the strongest legal patterns before running reducer continuations.
export function filterRevolutionTargets(commands,state,player){
  if(state.pendingPrompt?.type!=='BOARD_DESTINATION' || !state.pendingPrompt.multi)return commands;
  const ctx=revolutionContext(state,player);
  if(ctx.kind!=='black' || runtimeRuleId(ctx.cards.get(state.pendingPrompt.sourceIid))!=='102')return commands;
  const rank=createRevolutionPrior(state,player);
  return commands.map(command=>({command,score:rank(command)})).sort((a,b)=>b.score-a.score).slice(0,12).map(x=>x.command);
}
