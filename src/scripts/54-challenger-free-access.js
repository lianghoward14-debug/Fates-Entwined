(function(){
  'use strict';
  let state={enabled:false,revision:-1},polling=null,toggling=false;
  const notify=message=>{if(typeof toast==='function')toast(message);};
  function owned(){return typeof USER_PROFILE==='undefined'?{}:USER_PROFILE.ownedCards||{};}
  function cards(){return typeof getChallengerCardPool==='function'?getChallengerCardPool():[];}
  function collection(){
    const actual=owned();
    if(!state.enabled)return actual;
    const access={...actual};
    for(const card of cards())access[card.id]=Math.max(Number(actual[card.id])||0,card.rarity==='star'?1:3);
    return access;
  }
  function allows(ids){
    const available=collection(),used={};
    return Array.isArray(ids)&&ids.every(id=>{used[id]=(used[id]||0)+1;return used[id]<=(Number(available[id])||0);});
  }
  function requireDeck(ids){
    if(allows(ids))return true;
    notify('This Challenger deck uses cards outside your available collection. Edit it before playing.');
    return false;
  }
  function apply(next){
    if(typeof next?.enabled!=='boolean'||!Number.isInteger(next.revision)||next.revision<state.revision)return;
    const changed=state.enabled!==next.enabled;
    state={enabled:next.enabled,revision:next.revision};
    if(!changed)return;
    if(document.getElementById('s-challenger')?.classList.contains('active')){
      if(typeof renderCdbCollection==='function')renderCdbCollection();
      if(typeof updateChTopbar==='function')updateChTopbar();
      // Refresh collection statistics without touching an unsaved deck.
      if(typeof _currentChTab!=='undefined'&&_currentChTab==='collection'&&typeof switchChTab==='function')switchChTab('collection',{force:true});
    }
    window.dispatchEvent(new CustomEvent('fate-challenger-access',{detail:{...state}}));
  }
  async function request(options){
    if(typeof window.FateOnline?.flyApiRequest!=='function')throw Error('Online services are still loading. Try again shortly.');
    return window.FateOnline.flyApiRequest('/api/challenger-access',options);
  }
  async function refresh(){
    if(polling)return polling;
    polling=request({method:'GET'}).then(result=>{apply(result.access);return result.access;}).finally(()=>{polling=null;});
    return polling;
  }
  async function toggle(){
    if(toggling)return;
    toggling=true;
    try{
      const current=await refresh();
      const result=await request({method:'POST',body:{enabled:!current.enabled,expectedRevision:current.revision}});
      apply(result.access);
      notify(result.access.enabled?'Challenger free access ON for everyone. All playable cards are available.':'Challenger free access OFF. Everyone now uses their own collection.');
    }catch(error){notify(error?.message||'Could not change Challenger access.');}
    finally{toggling=false;}
  }
  window.FateChallengerAccess={collection,allows,requireDeck,refresh,toggle,enabled:()=>state.enabled};
  const poll=()=>{if(!document.hidden)refresh().catch(()=>{});};
  setInterval(poll,10000);
  window.addEventListener('focus',poll);
  window.addEventListener('fate-online-auth',poll);
  document.addEventListener('visibilitychange',poll);
  poll();
})();
