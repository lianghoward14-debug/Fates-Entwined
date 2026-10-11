/* Compatibility for legacy matches; authoritative matches use the shared rules. */
(function(){
  'use strict';
  const seenStatuses=new WeakMap();
  let resolving=false;
  function game(){
    const state=window.getFateGameState?.();
    return state && !state._phase7CurrentMultiplayer && !window.FateAuthorityV3SinglePlayer?.currentScreen?.() ? state : null;
  }
  function entries(state){
    const result=[];
    (state.board||[]).forEach((zone,z)=>zone.forEach((row,r)=>row.forEach((card,c)=>{if(card)result.push({card,z,r,c});})));
    return result;
  }
  function notify(action,player){
    const state=game();if(!state||resolving||Number(player)!==Number(state.currentPlayer))return;
    resolving=true;
    try{
      for(const {card} of entries(state)){
        if(String(card.id)!=='107')continue;
        card._anneDeclarations=(card._anneDeclarations||[]).filter(item=>item.turn>=Number(state.turn));
        if(Number(card.owner)===Number(player) || window.isCardEffectSuppressed?.(card)
          || card.statuses?.includes('EFFECTS_SUPPRESSED'))continue;
        const matching=card._anneDeclarations.filter(item=>item.action===action&&item.turn===Number(state.turn)&&item.opponent===Number(player));
        card._anneDeclarations=card._anneDeclarations.filter(item=>!matching.includes(item));
        for(const item of matching){
          const before=Number(card.currentFate)||0;
          modifyFate(card,8,'permanent',card.owner);
          card._anneFateGained=Number(card._anneFateGained||0)+Math.max(0,(Number(card.currentFate)||0)-before);
        }
      }
    }finally{resolving=false;}
  }
  // Rendering only expires old declarations; state changes are not evidence of an effect.
  function observe(){
    const state=game();if(!state)return;
    for(const {card} of entries(state)){
      if(card._anneDeclarations)card._anneDeclarations=card._anneDeclarations.filter(item=>item.turn>=Number(state.turn));
    }
  }
  window.FateAnnePlanning=Object.freeze({notify,observe,
    arm(card,action){
      const state=game();if(!state)return;
      (card._anneDeclarations||=[]).push({action,turn:Number(state.turn)+1,opponent:1-Number(card.owner)});
      card._anneEffectUses=Number(card._anneEffectUses||0)+1;
      card._anneLastActivatedTurn=Number(state.turn);
    },
    statuses(effects){
      const state=game();if(!state)return;
      const next=new Set(effects.filter(effect=>effect.sourceIid).map(effect=>effect.owner+':'+(effect.statusInstanceKey || effect.sourceIid+':'+effect.label)));
      const previous=seenStatuses.get(state);seenStatuses.set(state,next);
      if(previous && [...next].some(key=>key.startsWith(state.currentPlayer+':') && !previous.has(key)))notify('STATUS',state.currentPlayer);
    }
  });
})();
