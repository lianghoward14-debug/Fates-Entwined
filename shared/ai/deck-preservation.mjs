import {controllerOf} from '../engine/selectors.mjs';
import {effectiveFate,isEffectSourceSuppressed,runtimeRuleId} from '../engine/modifiers.mjs';

// Each profile separates renewable fuel from the cards whose continued
// presence makes the deck function. These are exploration priors, not rules.
export const PRESERVATION_PROFILES=[
  {name:'maelstrom',signature:['14','40','73','22'],engines:['14','40'],recover:['05','73'],fuel:['06','27']},
  {name:'freeworld',signature:['34','35','65'],engines:['34','35','65'],recover:['64','18'],fuel:['06','13','29']},
  {name:'incel',signature:['41','10','52'],engines:['10','41','36'],recover:['31','52'],fuel:['06','13','08']},
  {name:'assault',signature:['11','43','63'],engines:['11','63','59'],recover:['63','16'],fuel:['06','27','43']},
  {name:'estate',signature:['17','04','49','14'],engines:['14','49'],recover:['09','32'],fuel:['17','04','06','48','27']},
  {name:'sleeve',signature:['88','99','72','71'],engines:['88','67'],recover:['72','71'],fuel:['13','27']},
  {name:'snowball',signature:['93','37','41','84'],engines:['93','41'],recover:['93','18','72'],fuel:['13','84']},
  {name:'adjacency',signature:['01','bh11','bh22'],engines:['01','bh11','24','bh12'],recover:['24','44'],fuel:['29','27','82']},
  {name:'classic',signature:['15','19','57','23'],engines:['15','19','57','23','24'],recover:['09','68'],fuel:['29','27']},
  {name:'marine',signature:['38','18','58','03'],engines:['38','12'],recover:['18','97','71'],fuel:['08','13','27','03']},
  {name:'indie',signature:['87','bh19','bh06'],engines:['87'],recover:['74','32'],fuel:['27','bh06','bh19']},
  {name:'time',signature:['46','95','bh20'],engines:['46','95'],recover:['bh25'],fuel:['08','06','27','bh20','48']},
  {name:'patience',signature:['89','84','bh19','03'],engines:['89'],recover:['64','05'],fuel:['84','03','bh19']},
  {name:'wintertide',signature:['100','88','92'],engines:['100','88','89'],recover:['97','09'],fuel:['06']},
  {name:'sea',signature:['bh16','bh04','bh09'],engines:['bh16','bh09'],recover:['31','79'],fuel:['06','27','30','bh04','61']},
  {name:'maja',signature:['bh08','67','bh23'],engines:['bh08','56','67'],recover:['18','bh23'],fuel:['06','27']}
];
export function preservationProfile(cards){
  const ids=new Set(cards.map(c=>c.id));
  return PRESERVATION_PROFILES.find(p=>p.signature.every(id=>ids.has(id)));
}
export function createDeckPreservationPrior(state,player,entries,cards){
  const owner=state.players[player],hand=owner.hand || [];
  const own=entries.filter(e=>controllerOf(e.card)===player);
  const all=[...hand,...(owner.deck || []),...(owner.discard || []),...own.map(e=>e.card)];
  const profile=preservationProfile(all);if(!profile)return ()=>0;
  const active=own.filter(e=>!e.card.faceDown && !isEffectSourceSuppressed(state,e));
  const source=cards.get(state.pendingPrompt?.sourceIid);
  const operational=e=>profile.engines.includes(runtimeRuleId(e.card)) && !isEffectSourceSuppressed(state,e) && !e.card.faceDown;
  const retained=c=>profile.engines.includes(c.id) && !active.some(e=>runtimeRuleId(e.card)===c.id);
  return command=>{
    const q=command.payload || {},card=cards.get(q.cardIid || q.sourceIid);
    const targets=(q.selectedIids || [q.targetIid || q.selectedIid]).map(i=>cards.get(i)).filter(Boolean);
    let score=0;
    // Reward recovery that restores a missing engine; stop searching redundant
    // copies while a different engine is missing. Existing combo priors decide
    // whether extra copies are worthwhile after this small diversity bias.
    if(state.pendingPrompt?.type==='CARD_SELECTION' && ['06','08','13','48','60','68','84','58'].includes(source?.id)){
      for(const c of targets){
        if(retained(c) && !hand.some(h=>h.id===c.id))score+=5;
        if(source?.id==='58'){
          const rank=profile.recover.indexOf(c.id);
          if(rank>=0)score+=Math.max(2,7-rank*2);
        }
      }
    }
    const departing=[...(q.tributeIids || []),...(q.discardedIids || [])];
    if(source?.id==='80')departing.push(...targets.map(c=>c.iid));
    for(const iid of new Set(departing)){
      const c=cards.get(iid),e=own.find(e=>e.card.iid===iid);if(!c)continue;
      if(e && operational(e))score-=10;
      if(!e && retained(c) && hand.filter(h=>h.id===c.id).length===1)score-=7;
      if(e && profile.fuel.includes(c.id))score+=Math.max(0,4-effectiveFate(state,e)*.4);
    }
    // Keep targeted protection for the actual engine, regardless of deck name.
    if(q.reactionIid){
      const op=(state.effectStack || []).findLast(f=>f.pendingOperation)?.pendingOperation;
      const affected=[op?.cardIid,op?.targetIid,...(op?.targetIids || [])];
      const harmful=op && (['DISCARD_CARD','CHANGE_CONTROL','RETURN_TO_HAND','CREATE_STATUS'].includes(op.type) || op.type==='MODIFY_FATE' && Number(op.amount)<0);
      if(harmful && active.some(e=>operational(e) && affected.includes(e.card.iid)))score+=10;
    }
    if(source?.id==='12')for(const c of targets){const e=active.find(e=>e.card.iid===c.iid);if(e && operational(e))score+=8;}
    // Don't discard an expensive engine merely to reclaim its printed fuel.
    if(command.type==='DISCARD_CARD'){
      const e=own.find(e=>e.card.iid===(q.targetIid || q.sourceIid));if(e && operational(e))score-=16;
    }
    if(card?.id==='58' && q.destination && state.landscapeId==='igb4')score-=15;
    return score;
  };
}
