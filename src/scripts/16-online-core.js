
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

  function subscribeProfile(uid, cb){
    if(!uid || !FO.rtdb) return ()=>{};
    if(cache.has(uid)) setTimeout(()=>cb(cache.get(uid)),0);
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
