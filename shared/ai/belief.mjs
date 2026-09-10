import {projectStateForPlayer,stableStringify} from '../engine/index.mjs';
import {createRngState,nextInt,shuffleInPlace} from '../engine/rng.mjs';

function instance(definition,owner,iid){
  return {iid,id:definition.id,name:definition.name || definition.id,ability:definition.ability || '',
    effect:definition.effect || '',
    type:definition.type,affiliation:definition.affiliation || definition.aff || '',rarity:definition.rarity || '',
    baseFate:Number(definition.fate || 0),currentFate:Number(definition.fate || 0),cost:Number(definition.cost || 0),
    owner,controller:owner,faceDown:false,statuses:[],counters:{}};
}

// Preserve public rule state and our own known remaining deck composition;
// replace hidden identities *before* any evaluator, ordering or search runs.
// No actual opposing deck list or live random generator seeds the belief.
export function sampleWorld(state,player,sample=0){
  const view=projectStateForPlayer(state,player),enemy=1-player;
  const rng=createRngState(`belief:${view.turn}:${view.revision}:${player}:${sample}`);
  const catalog=state.cardCatalog || [];
  const publicCards=[...view.board.flat(3).filter(c=>c && !c.faceDown),...view.players.flatMap(p=>p.discard || [])];
  const affiliations=new Set(publicCards.filter(c=>Number(c.controller ?? c.owner)===enemy).map(c=>c.affiliation));
  const candidates=catalog;
  const counts=new Map();
  let stars=0;
  for(const card of publicCards.filter(c=>Number(c.owner)===enemy)){
    counts.set(card.id,(counts.get(card.id) || 0)+1);
    if(card.rarity==='star')stars++;
  }
  const unknown=new Map();
  function sampled(owner,iid){
    const eligible=candidates.filter(c=>(counts.get(c.id) || 0)<3 && !(c.rarity==='star' && stars>0));
    const pool=eligible.length?eligible:candidates;
    const supporter=nextInt(rng,100)<65;
    const typed=pool.filter(c=>(c.type==='Supporter')===supporter);
    const preferred=typed.filter(c=>affiliations.has(c.affiliation || c.aff));
    const selection=preferred.length && nextInt(rng,100)<70 ? preferred : typed.length?typed:pool;
    const definition=selection.length ? selection[nextInt(rng,selection.length)] : {id:'ai-unknown',type:'Supporter',fate:1,cost:0};
    counts.set(definition.id,(counts.get(definition.id) || 0)+1);
    if(definition.rarity==='star')stars++;
    return instance(definition,owner,iid);
  }
  const sorted=cards=>cards.slice().sort((a,b)=>String(a.iid).localeCompare(String(b.iid)));
  if(!Array.isArray(view.players[enemy].hand))for(const card of sorted(state.players[enemy].hand))unknown.set(card.iid,sampled(enemy,card.iid));
  for(const card of sorted(state.players[enemy].deck))unknown.set(card.iid,sampled(enemy,card.iid));
  for(const card of state.players[enemy].limbo || [])unknown.set(card.iid,sampled(enemy,card.iid));
  for(const card of state.board.flat(3).filter(Boolean))if(card.faceDown && Number(card.controller ?? card.owner)===enemy){
    unknown.set(card.iid,{...sampled(enemy,card.iid),faceDown:true});
  }
  function sanitize(value){
    if(!value || typeof value!=='object')return value;
    if(value.iid && value.id && unknown.has(value.iid))return structuredClone(unknown.get(value.iid));
    if(Array.isArray(value))return value.map(sanitize);
    return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,sanitize(item)]));
  }
  const world=sanitize(state);
  // An opponent-owned reaction prompt contains private hand options. Never
  // carry the real hidden Havano option into a sampled continuation.
  if(world.pendingPrompt?.type==='REACTION' && Number(world.pendingPrompt.playerIndex)===enemy){
    const prompt=world.pendingPrompt;
    prompt.options=(prompt.options || []).filter(option=>!unknown.has(option.reactionIid));
    // Preserve only public reaction options here. Fresh simulated activations
    // use the reducer, which generates hand reactions from the sampled hand.
  }
  // Sorting before shuffling removes any dependence on actual next-draw order.
  for(const owner of [0,1]){
    world.players[owner].deck.sort((a,b)=>String(a.iid).localeCompare(String(b.iid)));
    shuffleInPlace(world.players[owner].deck,rng);
  }
  world.rngState=rng;
  return world;
}

export function observationFingerprint(state,player){
  const view=projectStateForPlayer(state,player);
  view.board=view.board.map(zone=>zone.map(row=>row.map(card=>card?.faceDown && Number(card.controller ?? card.owner)!==player
    ? {iid:card.iid,owner:card.owner,controller:card.controller,faceDown:true}:card)));
  return stableStringify(view);
}
