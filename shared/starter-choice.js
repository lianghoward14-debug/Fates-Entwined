(function(root){
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value || {}));
  function normalize(profile){
    const result = copy(profile);
    const starters = Object.values(result.challengerPresets || {}).filter(p => p && p.starter === true && p.starterId && !p.builtin);
    if(result.starterChosen === true || starters.length){
      result.starterChosen = true;
      if(!result.starterDeckId && starters.length === 1) result.starterDeckId = starters[0].starterId;
    }
    return result;
  }
  function merge(existing, incoming){
    const saved = normalize(existing), next = normalize(incoming);
    // Collection resets are explicit, versioned migrations. An unversioned
    // or stale client must never undo a choice from a newer collection.
    const oldVersion = String(saved.cardCollectionResetVersion || '');
    const newVersion = String(next.cardCollectionResetVersion || '');
    if(oldVersion > newVersion) return saved;
    if(oldVersion === newVersion && saved.starterChosen){
      if(!next.starterChosen || (saved.starterDeckId && next.starterDeckId && saved.starterDeckId !== next.starterDeckId)) return saved;
      if(Number(saved._clientUpdatedAt || 0) > Number(next._clientUpdatedAt || 0)) return saved;
      next.starterChosen = true;
      if(saved.starterDeckId) next.starterDeckId = saved.starterDeckId;
    }
    return next;
  }
  const api = {normalize, merge};
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FateStarterChoice = api;
})(typeof window !== 'undefined' ? window : globalThis);
