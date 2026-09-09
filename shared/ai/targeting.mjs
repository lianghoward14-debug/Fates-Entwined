// Strategic restrictions belong to the AI, not the game's legal rules.
export function filterAiTargets(commands,state,player){
  commands=keepAssaultHoplitesTogether(commands,state,player);
  const prompt=state.pendingPrompt;
  if(!prompt || Number(prompt.playerIndex)!==player)return commands;
  const board=state.board.flat(3).filter(Boolean);
  const source=board.find(c=>c.iid===prompt.sourceIid);
  if(source?.id==='34' && prompt.type==='MODAL_CHOICE'){
    const owner=state.players[player];
    const ids=new Set([...(owner.hand || []),...(owner.deck || []),...(owner.discard || []),
      ...board.filter(c=>Number(c.controller ?? c.owner)===player)].map(c=>c.id));
    if(['29','34','35','64','65'].every(id=>ids.has(id))){
      const tgw=commands.filter(c=>c.type==='ANSWER_PROMPT' && c.payload?.choice==='third_great_war');
      if(tgw.length)return tgw;
    }
  }
  if(source?.id!=='31')return commands;
  const opponents=new Set(board.filter(c=>Number(c.controller ?? c.owner)!==player).map(c=>c.iid));
  return commands.filter(command=>{
    if(command.type!=='ANSWER_PROMPT')return true;
    const p=command.payload || {};
    if(p.cancel===true)return true;
    const targets=p.selectedIids || (p.selectedIid?[p.selectedIid]:p.targetIid?[p.targetIid]:[]);
    return targets.every(iid=>opponents.has(iid));
  });
}

function keepAssaultHoplitesTogether(commands,state,player){
  const entries=[];
  state.board.forEach((zone,z)=>zone.forEach(row=>row.forEach(card=>{
    if(card && Number(card.controller ?? card.owner)===player)entries.push({card,z});
  })));
  const owner=state.players[player];
  const ownCards=[...entries.map(e=>e.card),...(owner.hand || []),...(owner.deck || []),...(owner.discard || [])];
  const ids=new Set(ownCards.map(c=>c.id));
  if(!['11','43','40','63','59'].every(id=>ids.has(id)))return commands;
  const hoplites=entries.filter(e=>e.card.id==='63');
  if(!hoplites.length)return commands;
  const counts=[0,1,2].map(z=>hoplites.filter(e=>e.z===z).length);
  // First Hoplite establishes the zone. If an opponent has split them, use
  // the largest existing group (stable zone tie-break) for new deployments.
  const anchor=counts.indexOf(Math.max(...counts));
  const cards=new Map(ownCards.map(c=>[c.iid,c]));
  return commands.filter(command=>{
    const p=command.payload || {};
    if(cards.get(p.cardIid)?.id!=='63' || !p.destination)return true;
    // Hold the card if its shared zone has no legal square; never silently
    // relax the user's formation rule to deploy it in a different zone.
    return Number(p.destination.z)===anchor;
  });
}
