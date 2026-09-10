import {controllerOf} from '../engine/selectors.mjs';
import {effectiveFate,isEffectSourceSuppressed,canUseAsConsolidationTribute} from '../engine/modifiers.mjs';
import {zoneScore} from '../engine/scoring.mjs';

export function createEndlessSeaPrior(state,player,entries,cards){
  const owner=state.players[player],hand=owner.hand || [];
  const own=entries.filter(e=>controllerOf(e.card)===player),enemy=entries.filter(e=>controllerOf(e.card)!==player);
  const all=[...hand,...(owner.deck || []),...(owner.discard || []),...own.map(e=>e.card)];
  if(!['bh16','bh04','bh09','49','30'].every(id=>all.some(c=>c.id===id)))return ()=>0;
  const live=e=>!e.card.faceDown && !isEffectSourceSuppressed(state,e);
  const margin=z=>zoneScore(state,z,player)-zoneScore(state,z,1-player);
  const eventides=own.filter(e=>!e.card.faceDown && (e.card.affiliation || e.card.aff)==='eventide').length;
  const pressure=e=>effectiveFate(state,e)+(['bh08','46','100','bh16'].includes(e.card.id)?8:0);
  const source=cards.get(state.pendingPrompt?.sourceIid);
  const sourceEntry=entries.find(e=>e.card.iid===source?.iid);
  const resources=own.reduce((n,e)=>{const t=canUseAsConsolidationTribute(state,e,player);return n+(t.ok?t.reinforcement:0);},0);
  const removalTargets=enemy.filter(e=>e.r===1);
  function access(c){
    if(!c)return 0;
    if(c.id==='09')return resources<4?12:4;
    if(c.id==='79')return hand.some(h=>h.id==='79')?2:9;
    if(c.id==='74')return hand.filter(h=>h.type==='Supporter').length>=2?8:3;
    if(c.id==='49')return own.some(e=>e.card.type!=='Supporter') && !own.some(e=>e.card.id==='49' && live(e))?8:2;
    if(c.id==='30')return removalTargets.length?Math.min(12,Math.max(...removalTargets.map(pressure))*.4):0;
    if(c.id==='bh16')return eventides>=3?10:3;
    if(c.id==='bh04')return enemy.length>=3 && resources>=4?8:1;
    if(c.id==='bh09')return Math.max(0,Math.min(10,Math.max(...[0,1,2].map(margin))*.4));
    if(c.id==='31')return enemy.some(e=>effectiveFate(state,e)>0)?6:1;
    if(c.id==='27')return hand.length<5?8:3;
    return 0;
  }
  return command=>{
    const p=command.payload || {},card=cards.get(p.cardIid || p.sourceIid);
    const selected=(p.selectedIids || (p.selectedIid?[p.selectedIid]:[])).map(id=>cards.get(id)).filter(Boolean);
    let score=0;
    if(['06','07'].includes(source?.id) && state.pendingPrompt?.type==='CARD_SELECTION')score+=selected.reduce((n,c)=>n+access(c),0);
    if(state.pendingPrompt?.ordered)score+=selected.reduce((n,c,i)=>n+access(c)/(i+1),0);
    if(source?.id==='61' && selected.length){
      // Inspect revealed hand and public board only, never presumed deck copies.
      score+=selected.reduce((n,c)=>n+enemy.filter(e=>e.card.id===c.id).reduce((v,e)=>v+Math.min(9,effectiveFate(state,e)),0)
        +Math.min(9,Number(c.currentFate ?? c.baseFate ?? 0)),0);
    }
    if(source?.id==='bh04' && sourceEntry && p.choice){
      const targets=enemy.filter(e=>e.z===sourceEntry.z && e.card.type===p.choice);
      const loss=targets.length?Math.round(24/targets.length):0;
      score+=targets.reduce((n,e)=>n+Math.min(loss,effectiveFate(state,e)),0)*.5;
    }
    if(source?.id==='bh09' && Number.isInteger(Number(p.zone)))score+=Math.max(-12,Math.min(20,margin(Number(p.zone))));
    const target=entries.find(e=>e.card.iid===(p.targetIid || p.selectedIid));
    if(target && controllerOf(target.card)!==player){
      if(source?.id==='30')score+=Math.min(20,pressure(target)*.6);
      if(source?.id==='31')score+=Math.min(4,effectiveFate(state,target))+ (Math.abs(margin(target.z))<=4?4:0);
    }
    if(p.destination && card){
      const z=Number(p.destination.z);
      if(card.id==='79' && !state.pendingPrompt?.reactionIid)score-=14;
      if(card.id==='bh16')score+=eventides>=3?7:0;
      if(card.id==='30')score+=enemy.some(e=>e.z===z && e.r===1)?8:-10;
      if(card.id==='bh04')score+=enemy.filter(e=>e.z===z).length>=2?6:-8;
      if(card.id==='49')score+=own.filter(e=>e.z===z && e.card.type!=='Supporter' && !['bh16','bh09'].includes(e.card.id)).length*2;
    }
    if(command.type==='ACTIVATE_EFFECT' && card?.id==='bh16'){
      const e=own.find(e=>e.card.iid===card.iid);
      if(e){const m=margin(e.z);score+=eventides===0?-20:m<=0 && m+eventides>0?16:m>10?-6:3;
        if(hand.some(c=>c.type==='Supporter' && (c.affiliation || c.aff)==='eventide'))score-=4;}
    }
    for(const iid of p.tributeIids || []){
      const e=own.find(e=>e.card.iid===iid);if(!e)continue;
      if(e.card.id==='bh16' && Number(e.card.counters?.effectUses || 0)<2)score-=12;
      if(e.card.id==='bh09')score-=Math.min(12,effectiveFate(state,e)*.4);
      if((e.card.affiliation || e.card.aff)==='eventide' && own.some(x=>x.card.id==='bh16' && live(x)))score-=3;
    }
    // Counter only when the actual pending operation warrants spending reserve.
    if(p.reactionIid && cards.get(p.reactionIid)?.id==='79'){
      const op=(state.effectStack || []).findLast(f=>f.pendingOperation)?.pendingOperation;
      const victim=own.find(e=>[op?.targetIid,...(op?.targetIids || [])].includes(e.card.iid));
      if(victim)score+=Math.min(15,pressure(victim)*.5);
      else score-=5;
    }
    return score;
  };
}
