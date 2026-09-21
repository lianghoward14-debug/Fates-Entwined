(function(root){
  'use strict';
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const copy = value => JSON.parse(JSON.stringify(value));
  const stamp = value => Math.max(0, Number(value) || 0);
  function merge(existing, incoming){
    const a=object(existing), b=object(incoming), presets=Object.create(null), presetTombstones=Object.create(null);
    const ap=object(a.presets), bp=object(b.presets), at=object(a.presetTombstones), bt=object(b.presetTombstones);
    for(const id of new Set([...Object.keys(ap),...Object.keys(bp),...Object.keys(at),...Object.keys(bt)])){
      const left=ap[id], right=bp[id];
      const selected=!left ? right : !right ? left : stamp(right._presetUpdatedAt)>stamp(left._presetUpdatedAt) ? right : left;
      const deletedAt=Math.max(stamp(at[id]),stamp(bt[id]));
      if(deletedAt) presetTombstones[id]=deletedAt;
      if(selected && typeof selected==='object' && (!deletedAt || stamp(selected._presetUpdatedAt)>deletedAt)) presets[id]=copy(selected);
    }
    return {presets,presetTombstones};
  }
  function recordEdit(previous, current, tombstones, now){
    const old=object(previous), next=copy(object(current)), deleted=copy(object(tombstones));
    for(const id of new Set([...Object.keys(old),...Object.keys(next)])){
      if(JSON.stringify(old[id])===JSON.stringify(next[id])) continue;
      const time=Math.max(stamp(now),stamp(old[id]?._presetUpdatedAt)+1,stamp(next[id]?._presetUpdatedAt)+1,stamp(deleted[id])+1);
      if(next[id]) next[id]._presetUpdatedAt=time;
      else deleted[id]=time;
    }
    return {presets:next,presetTombstones:deleted};
  }
  const api={merge,recordEdit};
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.FatePresetSync=api;
})(typeof globalThis!=='undefined'?globalThis:this);
