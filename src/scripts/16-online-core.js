
// FATES ENTWINED ONLINE CORE V1.3
// Shared UI helpers and profile subscription cache. No gameplay writes here.
(function(){
  const FO = window.FateOnline || {};
  const cache = new Map();
  const subs = new Map();

  function esc(s){ return (FO.escapeHtml ? FO.escapeHtml(s) : String(s||'').replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))); }
  function fallbackProfile(uid){ return { uid, chosenUsername:'Player', displayName:'Player', username:'Player', baseCode: FO.makeBaseCode?FO.makeBaseCode(uid):uid, photoURL:'blank.png', level:1, challengerElo:600, bio:'' }; }
  function profileName(p){ return p?.chosenUsername || p?.displayName || p?.username || p?.baseCode || 'Player'; }
  function profilePhoto(p){ return p?.photoURL || p?.profileImg || 'blank.png'; }
  function localStorageFlag(name){
    try{ return localStorage.getItem(name) === '1'; }catch(e){ return false; }
  }
  function flyProfileReadsEnabled(){
    if(typeof FO.flyProfilesEnabled === 'function') return !!FO.flyProfilesEnabled();
    return typeof FO.getPublicProfile === 'function' && (
      localStorageFlag('fateFlyRoomsEnabled') ||
      localStorageFlag('fateRtdbDisabled') ||
      window.FATE_FLY_ROOMS_ENABLED === true ||
      window.FATE_RTDB_DISABLED === true
    );
  }
  function rtdbDisabledMode(){
    return localStorageFlag('fateRtdbDisabled') || window.FATE_RTDB_DISABLED === true;
  }

  function subscribeProfile(uid, cb){
    if(!uid) return ()=>{};
    if(cache.has(uid)) setTimeout(()=>cb(cache.get(uid)),0);
    if(flyProfileReadsEnabled()){
      let cancelled = false;
      FO.getPublicProfile(uid)
        .then(p=>{
          if(cancelled) return;
          const profile = p || fallbackProfile(uid);
          cache.set(uid, profile);
          try{ cb(profile); }catch(e){ console.warn('profile callback failed', e); }
        })
        .catch(err=>{
          if(cancelled) return;
          console.warn('Fly profile read failed', err);
          const profile = fallbackProfile(uid);
          cache.set(uid, profile);
          try{ cb(profile); }catch(e){ console.warn('profile callback failed', e); }
        });
      return ()=>{ cancelled = true; };
    }
    if(rtdbDisabledMode() || !FO.rtdb) return ()=>{};
    const key = uid + ':' + Math.random().toString(36).slice(2);
    const r = FO.ref(FO.rtdb, `publicProfiles/${uid}`);
    const unsub = FO.onValue(r, snap=>{
      const p = snap.val() || fallbackProfile(uid);
      cache.set(uid, p);
      try{ cb(p); }catch(e){ console.warn('profile callback failed', e); }
    }, err=>console.warn('profile subscribe failed', err));
    subs.set(key, unsub);
    return ()=>{ try{ if(typeof unsub === 'function') unsub(); }catch(e){} subs.delete(key); };
  }

  window.FateOnline = Object.assign(window.FateOnline || {}, {
    profileCache: cache,
    subscribeProfile,
    profileName,
    profilePhoto,
    renderTinyProfile(p){
      return `<div class="fo-profile-tiny"><img src="${esc(profilePhoto(p))}" onerror="this.onerror=null;this.src='blank.png';"><span>${esc(profileName(p))}</span></div>`;
    }
  });
})();
