(function(){
  'use strict';
  const active = new Map(), duration = 480;
  let frameId = 0;
  function reduced(){
    return ['fate-animations-off','fate-super-performance-mode','fate-reduced-motion'].some(function(name){
      return document.documentElement.classList.contains(name) || (document.body && document.body.classList.contains(name));
    }) || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      || (function(){try{return localStorage.getItem('fateReducedMotion') === '1';}catch(e){return false;}})();
  }
  function key(target){return [target.z,target.r,target.c].join(':');}
  function tick(now){
    frameId = 0;
    if(reduced()) active.clear();
    active.forEach(function(value,k){if(now-value.start >= duration) active.delete(k);});
    const adapter = window.FateMatchRendererAdapter;
    if(adapter && adapter.scheduleRender) adapter.scheduleRender('heavy-drop-board');
    if(active.size) frameId = requestAnimationFrame(tick);
  }
  function play(target){
    if(!target || reduced()) return false;
    const adapter = window.FateMatchRendererAdapter;
    if(!adapter || !adapter.scheduleRender) return false;
    const hits = adapter.getHitMap ? adapter.getHitMap() : null;
    const hit = hits && (hits.cards || []).find(function(item){return key(item) === key(target);});
    active.set(key(target),{start:performance.now(),iid:hit && hit.card && hit.card.iid});
    adapter.scheduleRender('heavy-drop-board');
    if(!frameId) frameId = requestAnimationFrame(tick);
    return true;
  }
  function pose(entry){
    if(!entry || reduced()) return null;
    const item = active.get(key(entry));
    if(!item) return null;
    if(item.iid != null && String(item.iid) !== String(entry.card && entry.card.iid)) return null;
    const t = Math.max(0,(performance.now()-item.start)/duration);
    if(t >= 1) return null;
    // Match the selected preview: y, height, angle and perspective at each stop.
    const keys = [[0,98,0,.10,1],[.34,5,25,-.045,.96],[.66,0,0,0,1],[.79,0,3,.013,.99],[1,0,0,0,1]];
    let j=1;
    while(j<keys.length-1 && t>keys[j][0]) j++;
    const a=keys[j-1],b=keys[j];
    let q=(t-a[0])/(b[0]-a[0]);
    q=j===2?q*q:q*q*(3-2*q);
    return {y:a[1]+(b[1]-a[1])*q,height:a[2]+(b[2]-a[2])*q,
      angle:a[3]+(b[3]-a[3])*q,perspective:a[4]+(b[4]-a[4])*q,
      size:(42+6*Math.min(1,t*3))/48};
  }
  // Compatibility with the existing set and post-cinematic callers.
  window.FateGildedSetBoardFx = {play,pose,style:'heavy-drop',duration};
})();
