import {controllerOf,rowOwner,squareStatuses} from '../engine/selectors.mjs';
import {effectiveFate,effectiveCardType,isEffectSourceSuppressed,runtimeRuleId} from '../engine/modifiers.mjs';
import {zoneScore} from '../engine/scoring.mjs';

export function archiveArchetype(all){
  const ids=new Set(all.map(c=>c.id));
  const has=list=>list.every(id=>ids.has(id));
  if(has(['17','04','14','48','49']))return 'estate';
  if(has(['88','99','72','71','13']))return 'sleeve';
  if(has(['93','37','41','84','bh05']))return 'snowball';
  if(has(['bh11','01','bh12','24','bh22']))return 'adjacency';
  if(has(['15','19','57','23','49']))return 'classic';
  return '';
}

export function createArchiveExpansionPrior(state,player,entries,cards){
  const p=state.players[player],hand=p.hand || [];
  const own=entries.filter(e=>controllerOf(e.card)===player);
  const all=[...hand,...(p.deck || []),...(p.discard || []),...own.map(e=>e.card)];
  const kind=archiveArchetype(all);
  if(!kind)return ()=>0;
  const live=own.filter(e=>!e.card.faceDown && !isEffectSourceSuppressed(state,e));
  const enemy=entries.filter(e=>controllerOf(e.card)!==player && !e.card.faceDown);
  const held=id=>hand.some(c=>c.id===id);
  const active=id=>live.filter(e=>runtimeRuleId(e.card)===id);
  const source=cards.get(state.pendingPrompt?.sourceIid);
  const margins=[0,1,2].map(z=>zoneScore(state,z,player)-zoneScore(state,z,1-player));
  const adjacent=(a,b)=>a.z===b.z && Math.abs(a.r-b.r)+Math.abs(a.c-b.c)===1;
  const characters=live.filter(e=>effectiveCardType(state,e.card)!=='Supporter');
  const conversions=(state.statuses || []).some(s=>s.type==='SUPPORTERS_AS_CHARACTERS' && Number(s.playerIndex)===player && Number(s.remainingTargetTurns)>0);
  function access(c){
    if(!c)return 0;
    if(c.id==='09')return hand.some(x=>Number(x.cost)>=3)?9:5;
    if(c.id==='74')return held('74')?3:8;
    if(c.id==='79')return held('79')?1:8;
    if(c.id==='60')return 5;
    if(kind==='estate'){
      if(c.id==='49')return active('49').length?1:characters.length>=2?12:5;
      if(c.id==='14')return enemy.some(e=>e.card.type==='Supporter')?11:3;
      if(c.id==='17')return Number(state.turn)<14?9:2;
      if(c.id==='04')return enemy.some(e=>e.card.type==='Supporter')?7:1;
      if(c.id==='bh05')return held('bh05')?2:12;
      if(c.id==='48')return 8;
    }
    if(kind==='sleeve'){
      if(c.id==='72')return (state.players[1-player].hand || []).length?12:0;
      if(c.id==='58')return (p.discard || []).some(x=>x.id==='72')?9:0;
      if(c.id==='71')return 7;
      if(c.id==='88')return active('88').length?4:10;
      if(c.id==='99')return active('88').length && !conversions?12:0;
      if(c.id==='67')return 9;
    }
    if(kind==='snowball'){
      if(c.id==='93')return active('93').length?7:15;
      if(c.id==='bh05')return held('bh05')?1:14;
      if(c.id==='37')return active('93').length?10:0;
      if(c.id==='41')return Math.min(14,Number(state.fateReductionEffectUses?.[player] || 0)*2);
      if(c.id==='18')return held('18')?2:9;
      if(c.id==='84')return p.flowerPickingEligible?10:0;
    }
    if(kind==='adjacency'){
      if(c.id==='24')return active('24').length?3:12;
      if(c.id==='bh11')return active('bh11').length || held('bh11')?1:10;
      if(c.id==='01')return 10;
      if(c.id==='bh12')return active('bh12').length?2:8;
      if(c.id==='bh22')return characters.length>=2?7:1;
      if(c.id==='68')return 8;
    }
    if(kind==='classic'){
      if(c.id==='15')return active('15').length?6:15;
      if(c.id==='19')return 10;
      if(c.id==='57')return active('19').length || active('23').length?9:1;
      if(c.id==='23')return characters.length>=3?9:3;
      if(c.id==='49')return active('49').length?0:characters.length>=2?10:2;
      if(c.id==='24')return active('24').length?2:8;
      if(c.id==='68')return 9;
    }
    if(['27','32'].includes(c.id))return hand.length<5?8:2;
    return 0;
  }
  return command=>{
    const q=command.payload || {}, card=cards.get(q.cardIid || q.sourceIid);
    const targets=(q.selectedIids || [q.selectedIid || q.targetIid]).map(i=>cards.get(i)).filter(Boolean);
    let score=0;
    if(state.pendingPrompt?.type==='CARD_SELECTION' && ['06','13','60','68','29','48','84','58','91','07'].includes(source?.id))score+=targets.reduce((n,c)=>n+access(c),0);
    if(state.pendingPrompt?.ordered && source?.id==='75')score+=targets.reduce((n,c,i)=>n+access(c)/(i+1),0);
    if(source?.id==='bh05')score+=targets.reduce((n,c)=>n+(kind==='snowball'?(c.id==='93'?35:-15):kind==='estate'?(['17','14'].includes(c.id)?14:c.id==='04'?5:access(c)):access(c)),0);
    if(kind==='snowball' && source?.id==='37')score+=targets.reduce((n,c)=>n+(runtimeRuleId(c)==='93'?35:-10),0);
    if(q.destination && card && ['SET_CARD','CONSOLIDATE_CARD'].includes(command.type)){
      const d=q.destination,formation=live.filter(e=>e.z===Number(d.z));
      score+=access(card)*.6;
      if(card.id==='79')score-=12;
      if(kind==='estate'){
        if(card.id==='14')score+=enemy.filter(e=>e.z===d.z && Math.abs(e.r-d.r)<=1 && Math.abs(e.c-d.c)<=1 && e.card.type==='Supporter').length*6;
        if(card.id==='49')score+=formation.filter(e=>['06','27','48','17','04'].includes(e.card.id)).length*3;
      }
      if(kind==='sleeve'){
        if(card.id==='99')score+=active('88').length && !conversions?live.filter(e=>e.card.type==='Supporter').length*2:-16;
        if(card.id==='88')score+=Math.min(12,characters.length*2);
        if(card.id==='72' && !(state.players[1-player].hand || []).length)score-=15;
      }
      if(kind==='snowball'){
        if(card.id==='37' && !active('93').length)score-=18;
        // Taylor copies from hand/deck, whereas Fusiliers needs a board source.
        if(card.id==='93' && active('93').length && held('bh05') && [...hand,...(p.deck || [])].filter(c=>c.id==='93').length===1)score-=16;
        if(card.id==='41')score+=Math.min(12,Number(state.fateReductionEffectUses?.[player] || 0));
      }
      if(kind==='classic'){
        const coordinators=formation.filter(e=>e.card.type==='Coordinator');
        if(card.type==='Coordinator')score+=coordinators.length*2+formation.filter(e=>e.card.id==='15').length*4;
        if(card.id!=='15' && card.type==='Coordinator' && held('15') && !active('15').length)score-=6;
        if(card.id==='57')score+=formation.filter(e=>['19','23'].includes(e.card.id)).length*4;
        if(card.id==='49')score+=formation.filter(e=>['27','29'].includes(e.card.id)).length*4;
      }
      if(kind==='adjacency' || kind==='classic'){
        if(card.id==='24')score+=formation.filter(e=>e.card.type==='Supporter' && adjacent(e,d)).length*5;
        if(card.type==='Supporter')score+=formation.filter(e=>e.card.id==='24' && adjacent(e,d)).length*3;
      }
      if(kind==='adjacency'){
        if(card.id==='01')score+=formation.filter(e=>adjacent(e,d)).length*5;
        if(card.id==='bh11')score+=formation.filter(e=>['01','24','44'].includes(e.card.id)).length*4;
        score+=formation.filter(e=>e.card.id==='01' && adjacent(e,d)).length*4;
        if(card.id==='44')score+=formation.filter(e=>adjacent(e,d)).length?6:-4;
        if(card.id==='bh22')score+=Math.min(12,Math.max(0,...formation.filter(e=>rowOwner(state,e.z,e.r)===player).map(e=>effectiveFate(state,e)*.5)));
      }
    }
    if(state.pendingPrompt?.type==='BOARD_DESTINATION' && q.destination){
      const d=q.destination,e=entries.find(e=>e.z===d.z && e.r===d.r && e.c===d.c);
      if(source?.id==='17')score+=rowOwner(state,d.z,d.r)===1-player?16:rowOwner(state,d.z,d.r)===player?-25:3;
      if(source?.id==='04'){
        score+=e && controllerOf(e.card)!==player?e.card.type==='Supporter'?14:Math.max(-8,6-effectiveFate(state,e)*.5):-8;
        if(squareStatuses(state,d,'FIELD_LEAVE_LOCKED').length)score-=20;
      }
      if(source?.id==='bh22')score+=e && controllerOf(e.card)===player?effectiveFate(state,e):0;
    }
    if(command.type==='ACTIVATE_EFFECT' && card && runtimeRuleId(card)==='93')score+=12;
    if(source && runtimeRuleId(source)==='93')for(const c of targets){
      const e=enemy.find(e=>e.card.iid===c.iid);
      if(e)score+=effectiveFate(state,e)>0?5+(Math.abs(margins[e.z])<=2?5:0):-8;
    }
    for(const iid of q.tributeIids || []){
      const e=own.find(e=>e.card.iid===iid);if(!e)continue;
      if(kind==='estate' && ['06','27','48','17','04'].includes(e.card.id))score+=3;
      if(kind==='classic' && ['27','29'].includes(e.card.id))score+=3;
      if(kind==='classic' && ['15','19','57'].includes(e.card.id))score-=12;
      if(kind==='snowball' && runtimeRuleId(e.card)==='93')score-=12;
      if(kind==='sleeve' && e.card.id==='88')score-=18;
    }
    return score;
  };
}

export function filterArchiveExpansionTargets(commands,state,player){
  const p=state.players[player];
  const board=state.board.flat(3).filter(Boolean);
  const all=[...(p.hand || []),...(p.deck || []),...(p.discard || []),...board.filter(c=>controllerOf(c)===player)];
  if(archiveArchetype(all)!=='snowball')return commands;
  if(!state.pendingPrompt){
    const copyAvailable=[...(p.hand || []),...(p.deck || [])].some(c=>c.id==='93');
    const boardYouth=board.some(c=>runtimeRuleId(c)==='93');
    return commands.filter(command=>{
      const q=command.payload || {},card=all.find(c=>c.iid===q.cardIid);
      if(!q.destination)return true;
      if(card?.id==='bh05')return copyAvailable;
      if(card?.id==='37')return boardYouth;
      return true;
    });
  }
  const source=all.find(c=>c.iid===state.pendingPrompt.sourceIid);
  if(!['37','bh05'].includes(source?.id))return commands;
  const wanted=new Set([...all,...board].filter(c=>runtimeRuleId(c)==='93').map(c=>c.iid));
  const picks=commands.filter(c=>[c.payload?.selectedIid,c.payload?.targetIid,...(c.payload?.selectedIids || [])].some(i=>wanted.has(i)));
  return picks.length?picks:commands;
}
