
// FATES ENTWINED ONLINE CORE V1.3
// Shared UI helpers and profile subscription cache. No gameplay writes here.
(function(){
  const FO = window.FateOnline || {};
  const cache = new Map();
  const subs = new Map();

  function esc(s){ return (FO.escapeHtml ? FO.escapeHtml(s) : String(s||'').replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))); }
  function fallbackProfile(uid){ return { uid, chosenUsername:'Player', displayName:'Player', username:'Player', baseCode: FO.makeBaseCode?FO.makeBaseCode(uid):uid, photoURL:'blank.png', level:1, challengerElo:600, bio:'' }; }
  function profileName(p){ return p?.chosenUsername || p?.displayName || p?.username || p?.baseCode || 'Player'; }
  function resolvePhotoValue(value){
    if(!value) return '';
    if(value && typeof value === 'object'){
      if(value.dataUrl) return String(value.dataUrl);
      if(value.pfpId) return 'pfp/pfp' + (Math.max(1, parseInt(value.pfpId, 10) || 1)) + '.png';
      if(value.cardImg) return value.cardImg;
      if(value.cardId && Array.isArray(window.CARDS)){
        const card = window.CARDS.find(c=>String(c.id) === String(value.cardId));
        if(card && card.img) return card.img;
      }
      if(value.src) return String(value.src);
    }
    try{
      if(typeof window.resolveProfileImgSrc === 'function'){
        const resolved = window.resolveProfileImgSrc(value, 'square') || window.resolveProfileImgSrc(value, 'circle');
        if(resolved) return String(resolved);
      }
    }catch(e){}
    if(typeof value === 'string'){
      const text = value.trim();
      return text && text !== '[object Object]' ? text : '';
    }
    return '';
  }
  function profilePhoto(p){
    const candidates = [p?.profileImg, p?.photoURL, p?.img, p?.pfp];
    for(const value of candidates){
      const resolved = resolvePhotoValue(value);
      if(resolved) return resolved;
    }
    return 'blank.png';
  }
  function profilePhotoCropStyle(p, fallback='center 22%'){
    const src = profilePhoto(p);
    const base = 'width:100%;height:100%;object-fit:cover;';
    if(/^data:image\//i.test(String(src || ''))) return base + 'object-position:center center;transform:none;';
    const match = String(src || '').match(/[?&]fc=([0-9]{1,4}),([0-9]{1,4}),([0-9]{2,4})/);
    const imgCrop = p?.profileImg && typeof p.profileImg === 'object'
      ? p.profileImg
      : (p?.photoURL && typeof p.photoURL === 'object' ? p.photoURL : null);
    const cropFocusX = p?.profileCropFocusX ?? imgCrop?.cropFocusX;
    const cropFocusY = p?.profileCropFocusY ?? imgCrop?.cropFocusY;
    const cropZoom = p?.profileCropZoom ?? imgCrop?.cropZoom;
    const cropY = p?.profileCropY ?? imgCrop?.cropY;
    if(!match && (cropFocusX !== undefined || cropFocusY !== undefined || cropZoom !== undefined)){
      const fx = Math.max(0, Math.min(100, Number(cropFocusX ?? 0.5) * 100));
      const fy = Math.max(0, Math.min(100, Number(cropFocusY ?? 0.5) * 100));
      const zoom = Math.max(1, Math.min(4, Number(cropZoom || 1)));
      return base + `object-position:${fx}% ${fy}%;transform:scale(${zoom});transform-origin:${fx}% ${fy}%;`;
    }
    if(!match && cropY !== undefined){
      const y = Math.max(0, Math.min(100, Number(cropY) || 0));
      return base + `object-position:center ${y}%;`;
    }
    if(!match) return base + `object-position:${fallback};`;
    const fx = Math.max(0, Math.min(100, (Number(match[1]) || 500) / 10));
    const fy = Math.max(0, Math.min(100, (Number(match[2]) || 500) / 10));
    const zoom = Math.max(1, Math.min(4, (Number(match[3]) || 100) / 100));
    return base + `object-position:${fx}% ${fy}%;transform:scale(${zoom});transform-origin:${fx}% ${fy}%;`;
  }
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
    if(flyProfileReadsEnabled()){
      let cancelled = false;
      let timer = 0;
      const refresh = ()=>FO.getPublicProfile(uid)
        .then(p=>{
          if(cancelled) return;
          const profile = p || fallbackProfile(uid);
          cache.set(uid, profile);
          try{ cb(profile); }catch(e){ console.warn('profile callback failed', e); }
        })
        .catch(err=>{
          if(cancelled) return;
          console.warn('Fly profile read failed', err);
          const profile = cache.get(uid) || fallbackProfile(uid);
          try{ cb(profile); }catch(e){ console.warn('profile callback failed', e); }
        }).finally(()=>{
          if(!cancelled) timer = setTimeout(refresh,15000);
        });
      refresh();
      return ()=>{ cancelled = true; if(timer) clearTimeout(timer); };
    }
    if(cache.has(uid)) setTimeout(()=>cb(cache.get(uid)),0);
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
    profilePhotoCropStyle,
    renderTinyProfile(p){
      return `<div class="fo-profile-tiny"><img src="${esc(profilePhoto(p))}" onerror="this.onerror=null;this.src='blank.png';"><span>${esc(profileName(p))}</span></div>`;
    }
  });
})();
