// FATES ENTWINED ONLINE ECONOMY V1.1
// Bridges the existing Marketplace/Public Decks UI to RTDB-backed data.
// Client-trusted alpha until Cloud Functions secure ownership and payouts.
(function(){
  const FO = window.FateOnline || {};
  let marketplaceListings = [];
  let marketplaceTransactions = [];
  let publicDecks = [];
  let publicDeckDetailCache = new Map();
  let marketplaceUnsub = null;
  let publicDecksUnsub = null;
  let publicDecksPage = 0;
  let marketplaceTxPage = 0;
  let sellCardPage = 0;
  let shareDeckPage = 0;
  let marketplaceLoaded = false;
  let publicDecksLoaded = false;
  const MARKETPLACE_FEED_LIMIT = 80;
  const PUBLIC_DECK_FEED_LIMIT = 40;

  function esc(s){ return FO.escapeHtml ? FO.escapeHtml(s) : String(s == null ? '' : s).replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]||c)); }
  function authUser(){ return FO.auth?.currentUser || window.FATE_ONLINE?.user || null; }
  function user(){ return authUser(); }
  function authUid(){ return String(authUser()?.uid || window.FATE_ONLINE?.user?.uid || ''); }
  async function waitForAuthUser(timeoutMs=1800){
    const existing = authUser();
    if(existing) return existing;
    return await new Promise(resolve=>{
      let done = false;
      let unsub = null;
      const finish = value=>{
        if(done) return;
        done = true;
        try{ if(unsub) unsub(); }catch(e){}
        resolve(value || authUser() || null);
      };
      const timer = setTimeout(()=>finish(null), timeoutMs);
      const finishWithTimer = value=>{
        clearTimeout(timer);
        finish(value);
      };
      if(FO.onAuth){
        try{
          unsub = FO.onAuth(state=>{
            if(state?.user) finishWithTimer(state.user);
            else if(state?.ready) finishWithTimer(null);
          });
        }catch(e){ finishWithTimer(null); }
      }else{
        finishWithTimer(null);
      }
    });
  }
  function profile(){ return window.FATE_ONLINE?.profile || {}; }
  function starlightIcon(){ return typeof STARLIGHT_ICON !== 'undefined' ? STARLIGHT_ICON : '<span style="color:#ffd700;">*</span>'; }
  function cardById(id){ return (typeof CARDS !== 'undefined' ? CARDS : []).find(c=>c.id===id); }
  function applyPublicDeckModalChrome(...classes){
    const modalBox = document.querySelector('#modal .modal');
    if(!modalBox) return;
    modalBox.classList.add('public-decks-modal', ...classes.filter(Boolean));
    const width = classes.includes('public-deck-preview-modal') ? 'min(1160px,96vw)' : 'min(1240px,96vw)';
    modalBox.style.width = width;
    modalBox.style.maxWidth = width;
    const body = document.getElementById('modal-body');
    if(body){
      body.style.overflow = 'hidden';
      body.style.maxHeight = '';
    }
  }
  function rarityLabel(rarity){
    const raw = String(rarity || 'card').trim();
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : 'Card';
  }
  function profileName(){
    const p = profile();
    return p.chosenUsername || p.displayName || p.username || USER_PROFILE?.username || 'Player';
  }
  function profilePhoto(){
    const p = profile();
    if(FO.profilePhoto) return FO.profilePhoto(p);
    if(typeof window.resolveProfileImgSrc === 'function'){
      try{
        const resolved = window.resolveProfileImgSrc(p.profileImg || p.photoURL, 'square') || window.resolveProfileImgSrc(p.profileImg || p.photoURL, 'circle');
        if(resolved) return resolved;
      }catch(e){}
    }
    return p.photoURL || p.profileImg || 'blank.png';
  }
  function publicDeckProfilePayload(p){
    const src = profilePhoto();
    return {
      uid:user()?.uid || p?.uid || '',
      name:p?.chosenUsername || p?.displayName || p?.username || profileName(),
      username:p?.chosenUsername || p?.username || p?.displayName || profileName(),
      displayName:p?.displayName || p?.chosenUsername || p?.username || profileName(),
      baseCode:p?.baseCode || '',
      photoURL:src,
      profileImg:src,
      profileCropFocusX:p?.profileCropFocusX,
      profileCropFocusY:p?.profileCropFocusY,
      profileCropY:p?.profileCropY,
      profileCropZoom:p?.profileCropZoom,
      challengerElo:p?.challengerElo ?? p?.elo,
      elo:p?.elo ?? p?.challengerElo
    };
  }
  function soldMarketplaceSources(){
    const sources = [
      marketplaceTransactions,
      window.FATE_ONLINE_MARKETPLACE_TRANSACTIONS,
      USER_PROFILE?.marketplace?.listings
    ].filter(Array.isArray);
    const seen = new Set();
    const sold = [];
    sources.flat().forEach((l, idx)=>{
      if(!l || String(l.status || '') !== 'sold') return;
      const key = l.listingId || `${l.sellerUid || l.seller || ''}_${l.cardId || ''}_${l.price || ''}_${l.soldAt || l.updatedAt || l.createdAt || idx}`;
      if(seen.has(key)) return;
      seen.add(key);
      sold.push(l);
    });
    return sold;
  }
  function pendingSoldListings(){
    return soldMarketplaceSources().filter(l=>isOwnSoldListing(l) && !l.sellerRedeemed && !l.redeemedAt && Number(l.price || 0) > 0);
  }
  function pendingMarketplaceStarlight(){
    return pendingSoldListings().reduce((sum,l)=>sum + Math.max(0, Number(l.price || 0) || 0), 0);
  }
  function isOwnSoldListing(l){
    const u = user();
    if(!l || String(l.status || '') !== 'sold') return false;
    if(u && l.sellerUid === u.uid) return true;
    const names = new Set([profileName(), USER_PROFILE?.username, profile()?.chosenUsername, profile()?.displayName].filter(Boolean).map(String));
    return names.has(String(l.seller || ''));
  }
  function updateMarketplaceRedeemButton(){
    const btn = document.getElementById('market-redeem-btn');
    const panel = document.getElementById('market-redeem-panel');
    const pending = pendingMarketplaceStarlight();
    if(btn){
      btn.disabled = false;
      btn.innerHTML = pending > 0 ? `Redeem ${starlightIcon()} ${pending}` : 'Collect Sold Starlight';
      btn.classList.toggle('pri', pending > 0);
    }
    if(panel){
      panel.classList.toggle('has-pending', pending > 0);
      panel.innerHTML = `
        <div class="market-redeem-copy">
          <b>${pending > 0 ? 'Sales Ready' : 'Seller Proceeds'}</b>
          <span>${pending > 0 ? `${pending} Starlight is waiting to be redeemed.` : 'Sold listings will appear here when buyers complete a purchase.'}</span>
        </div>
        <button class="btn sm ${pending > 0 ? 'pri' : ''}" onclick="redeemMarketplaceStarlight()">${pending > 0 ? `Redeem ${starlightIcon()} ${pending}` : 'Collect Sold Starlight'}</button>`;
    }
  }
  function getOwnedEntries(){
    const owned = USER_PROFILE?.ownedCards || {};
    if(Array.isArray(owned)){
      const counts = {};
      owned.forEach(id=>{ counts[id] = (counts[id] || 0) + 1; });
      return Object.entries(counts);
    }
    return Object.entries(owned);
  }
  function addOwned(cardId, amount=1){
    if(typeof addOwnedCardCount === 'function') return addOwnedCardCount(cardId, amount);
    if(!USER_PROFILE.ownedCards || Array.isArray(USER_PROFILE.ownedCards)) USER_PROFILE.ownedCards = {};
    USER_PROFILE.ownedCards[cardId] = (USER_PROFILE.ownedCards[cardId] || 0) + amount;
  }
  function removeOwned(cardId, amount=1){
    if(typeof removeOwnedCardCount === 'function') return removeOwnedCardCount(cardId, amount);
    if(!USER_PROFILE.ownedCards || !USER_PROFILE.ownedCards[cardId]) return false;
    USER_PROFILE.ownedCards[cardId] -= amount;
    if(USER_PROFILE.ownedCards[cardId] <= 0) delete USER_PROFILE.ownedCards[cardId];
    return true;
  }
  function ownedPfps(){
    if(typeof normalizeOwnedPfps === 'function') return normalizeOwnedPfps();
    return Array.isArray(USER_PROFILE?.ownedPfps) ? USER_PROFILE.ownedPfps : [];
  }
  function addOwnedPfp(pfpId){
    pfpId = Math.max(1, Math.min(80, parseInt(pfpId, 10) || 0));
    if(!pfpId) return [];
    if(typeof grantProfilePictures === 'function') return grantProfilePictures([pfpId]);
    if(!Array.isArray(USER_PROFILE.ownedPfps)) USER_PROFILE.ownedPfps = [];
    if(!USER_PROFILE.ownedPfps.some(id=>Number(id) === pfpId)) USER_PROFILE.ownedPfps.push(pfpId);
    return [pfpId];
  }
  function takeOwnedPfp(pfpId){
    pfpId = Math.max(1, Math.min(80, parseInt(pfpId, 10) || 0));
    if(!pfpId) return false;
    if(typeof removeOwnedPfp === 'function') return removeOwnedPfp(pfpId) === true;
    if(!Array.isArray(USER_PROFILE.ownedPfps) || !USER_PROFILE.ownedPfps.some(id=>Number(id) === pfpId)) return false;
    USER_PROFILE.ownedPfps = USER_PROFILE.ownedPfps.filter(id=>Number(id) !== pfpId);
    return true;
  }
  function localStorageFlag(name){
    try{ return localStorage.getItem(name) === '1'; }catch(e){ return false; }
  }
  function authorityHttpBaseUrl(){
    try{
      const explicit = String(localStorage.getItem('fateFlyApiUrl') || '').trim();
      if(explicit) return explicit.replace(/\/+$/, '');
    }catch(e){}
    const globalExplicit = String(window.FATE_FLY_API_URL || '').trim();
    if(globalExplicit) return globalExplicit.replace(/\/+$/, '');
    let wsUrl = '';
    try{ wsUrl = String(localStorage.getItem('fateWsAuthorityUrl') || '').trim(); }catch(e){}
    if(!wsUrl) wsUrl = String(window.FATE_WS_AUTHORITY_URL || '').trim();
    if(!wsUrl) {
      const host = String(location.hostname || '').toLowerCase();
      if(host === 'fates-entwined-main.fly.dev') return location.origin.replace(/\/+$/, '');
      return 'https://fates-entwined-main.fly.dev';
    }
    return wsUrl.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:').replace(/\/+$/, '');
  }
  function flyEconomyEnabled(){
    return !!authorityHttpBaseUrl();
  }
  function publicDeckApiEnabled(){
    return !!authorityHttpBaseUrl();
  }
  function rtdbDisabledMode(){
    return localStorageFlag('fateRtdbDisabled') || window.FATE_RTDB_DISABLED === true;
  }
  async function flyApiRequest(path, opts={}){
    const base = authorityHttpBaseUrl();
    if(!base) throw new Error('Fly authority API URL is not configured');
    const headers = {'accept':'application/json'};
    const token = await FO.auth?.currentUser?.getIdToken?.().catch(()=> '');
    if(token) headers.authorization = 'Bearer ' + token;
    const method = String(opts.method || 'GET').toUpperCase();
    const init = {method, headers};
    if(opts.body !== undefined){
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(opts.body || {});
    }
    const res = await fetch(base + path, init);
    if(!res.ok){
      const text = await res.text().catch(()=> '');
      throw new Error('Fly economy API failed: ' + res.status + (text ? ' ' + text.slice(0, 160) : ''));
    }
    return await res.json();
  }
  function applyFlyMarketplacePayload(data){
    marketplaceListings = Array.isArray(data?.listings) ? data.listings : [];
    marketplaceTransactions = Array.isArray(data?.transactions) ? data.transactions : [];
    marketplaceLoaded = true;
    window.FATE_ONLINE_MARKETPLACE_LISTINGS = marketplaceListings;
    window.FATE_ONLINE_MARKETPLACE_TRANSACTIONS = marketplaceTransactions;
    updateMarketplaceRedeemButton();
  }
  async function refreshFlyMarketplace(){
    if(!flyEconomyEnabled()) return null;
    const data = await flyApiRequest(`/api/marketplace/listings?limit=${MARKETPLACE_FEED_LIMIT}`);
    applyFlyMarketplacePayload(data);
    try{ if(document.getElementById('marketplace-listings')) renderMarketplaceListings(); }catch(e){ console.warn('Marketplace render failed', e); }
    return data;
  }
  async function refreshFlyPublicDecks(){
    if(!publicDeckApiEnabled()) return null;
    const data = await flyApiRequest(`/api/public-decks?limit=${PUBLIC_DECK_FEED_LIMIT}`);
    publicDecksLoaded = true;
    publicDecks = (Array.isArray(data?.decks) ? data.decks : []).map(normalizePublicDeck);
    window.FATE_ONLINE_PUBLIC_DECKS = publicDecks;
    try{
      if(document.querySelector('#modal.on .modal.public-decks-modal')) showPublicDecks(publicDecksPage);
    }catch(e){ console.warn('Public decks refresh failed', e); }
    return data;
  }
  function canUseFirebase(){
    return !flyEconomyEnabled() && !rtdbDisabledMode() && !!(FO.rtdb && FO.ref && FO.onValue && FO.set && FO.update && FO.remove && FO.push);
  }
  function cappedFeed(path, child, limit){
    const base = FO.ref(FO.rtdb, path);
    return (FO.query && FO.orderByChild && FO.limitToLast)
      ? FO.query(base, FO.orderByChild(child), FO.limitToLast(limit))
      : base;
  }
  function watchMarketplace(){
    if(flyEconomyEnabled()){
      if(!marketplaceLoaded) refreshFlyMarketplace().catch(e=>console.warn('Fly marketplace refresh failed', e));
      return;
    }
    if(!canUseFirebase() || marketplaceUnsub) return;
    marketplaceUnsub = FO.onValue(cappedFeed('marketplace/listings', 'createdAt', MARKETPLACE_FEED_LIMIT), snap=>{
      marketplaceLoaded = true;
      const raw = snap.val() || {};
      const allListings = Object.entries(raw).map(([id, value])=>({ listingId:id, ...(value || {}) }));
      marketplaceListings = allListings
        .filter(l=>String(l.status || 'active') === 'active')
        .sort((a,b)=>Number(b.createdAt || b.timestamp || 0) - Number(a.createdAt || a.timestamp || 0));
      marketplaceTransactions = allListings
        .filter(l=>String(l.status || '') === 'sold')
        .sort((a,b)=>Number(b.soldAt || b.updatedAt || b.createdAt || 0) - Number(a.soldAt || a.updatedAt || a.createdAt || 0))
        .slice(0,80);
      window.FATE_ONLINE_MARKETPLACE_LISTINGS = marketplaceListings;
      window.FATE_ONLINE_MARKETPLACE_TRANSACTIONS = marketplaceTransactions;
      updateMarketplaceRedeemButton();
      try{ if(document.getElementById('marketplace-listings')) renderMarketplaceListings(); }catch(e){ console.warn('Marketplace render failed', e); }
    }, err=>console.warn('Marketplace subscription failed', err));
  }
  function watchPublicDecks(){
    if(publicDeckApiEnabled()){
      if(!publicDecksLoaded) refreshFlyPublicDecks().catch(e=>console.warn('Fly public decks refresh failed', e));
      return;
    }
    if(!canUseFirebase() || publicDecksUnsub) return;
    publicDecksUnsub = FO.onValue(cappedFeed('publicDeckSummaries', 'updatedAt', PUBLIC_DECK_FEED_LIMIT), snap=>{
      publicDecksLoaded = true;
      const raw = snap.val() || {};
      publicDecks = Object.entries(raw)
        .map(([id, value])=>normalizePublicDeck({ deckId:id, id, ...(value || {}) }))
        .sort((a,b)=>avgRating(b) - avgRating(a) || Number(b.updatedAt || b.timestamp || 0) - Number(a.updatedAt || a.timestamp || 0));
      window.FATE_ONLINE_PUBLIC_DECKS = publicDecks;
      try{
        if(document.querySelector('#modal.on .modal.public-decks-modal')) showPublicDecks(publicDecksPage);
      }catch(e){ console.warn('Public decks refresh failed', e); }
    }, err=>console.warn('Public decks subscription failed', err));
  }
  function stopWatchers(){
    try{ if(marketplaceUnsub) marketplaceUnsub(); }catch(e){}
    try{ if(publicDecksUnsub) publicDecksUnsub(); }catch(e){}
    marketplaceUnsub = null;
    publicDecksUnsub = null;
    marketplaceLoaded = false;
    publicDecksLoaded = false;
    marketplaceListings = [];
    marketplaceTransactions = [];
    publicDecks = [];
    publicDeckDetailCache.clear();
    window.FATE_ONLINE_MARKETPLACE_LISTINGS = marketplaceListings;
    window.FATE_ONLINE_MARKETPLACE_TRANSACTIONS = marketplaceTransactions;
    window.FATE_ONLINE_PUBLIC_DECKS = publicDecks;
  }
  function ensureWatchers(scope='all'){
    if(scope === 'marketplace' || scope === 'all') watchMarketplace();
    if(scope === 'publicDecks' || scope === 'all') watchPublicDecks();
  }

  async function publishDeck(deck){
    const u = await waitForAuthUser();
    if(!u){ if(window.toast) toast('Sign in first'); return null; }
    const uid = authUid() || String(u.uid || '');
    if(!uid){ if(window.toast) toast('Sign in first'); return null; }
    if(!publicDeckApiEnabled() && !canUseFirebase()){ if(window.toast) toast('Online economy is not ready'); return null; }
    const p = await FO.syncPublicProfile().catch(()=>profile());
    const id = deck.id || deck.deckId || `${uid}_${Date.now()}`;
    const ids = Array.isArray(deck.ids) ? deck.ids.slice(0, 80) : [];
    const uniqueIds = Array.from(new Set(ids));
    const displayCardIds = (Array.isArray(deck.displayCardIds) && deck.displayCardIds.length ? deck.displayCardIds : uniqueIds).slice(0,4);
    const base = {
      id,
      deckId:id,
      ownerUid:uid,
      username:p.chosenUsername || p.displayName || profileName(),
      ownerName:p.chosenUsername || p.displayName || profileName(),
      ownerPhotoURL:profilePhoto(),
      name:String(deck.name || 'Shared Deck').slice(0,80),
      description:String(deck.description || '').slice(0,240),
      faceCardId:deck.faceCardId || displayCardIds[0] || '',
      displayCardIds,
      sourcePid:deck.sourcePid || '',
      timestamp:deck.timestamp || Date.now(),
      createdAt:deck.createdAt || FO.serverTimestamp(),
      updatedAt:FO.serverTimestamp()
    };
    const summary = {
      ...base,
      totalCards:ids.length,
      uniqueCards:uniqueIds.length,
      ratingAvg:0,
      ratingCount:0,
      commentCount:0
    };
    const detail = {
      ...base,
      ids,
      totalCards:ids.length,
      uniqueCards:uniqueIds.length
    };
    if(publicDeckApiEnabled()){
      const data = await flyApiRequest('/api/public-decks', {
        method:'POST',
        body:{uid, profile:publicDeckProfilePayload(p), deck:detail}
      });
      const saved = normalizePublicDeck(data.deck || detail);
      publicDeckDetailCache.set(saved.deckId || saved.id, saved);
      publicDecks = [saved, ...publicDecks.filter(d=>d.id !== saved.id && d.deckId !== saved.deckId)];
      publicDecksLoaded = true;
      window.FATE_ONLINE_PUBLIC_DECKS = publicDecks;
      if(window.toast) toast('Deck published');
      return saved.deckId || saved.id;
    }
    if(!FO.auth?.currentUser?.uid) throw new Error('Firebase auth is not ready for public deck publish');
    await FO.update(FO.ref(FO.rtdb), {
      [`publicDeckSummaries/${id}`]:summary,
      [`publicDeckDetails/${id}`]:detail
    });
    publicDeckDetailCache.set(id, normalizePublicDeck(detail));
    if(window.toast) toast('Deck published');
    return id;
  }
  async function listMarketplaceCard(cardId, price){
    const u = user();
    if(!u){ if(window.toast) toast('Sign in first'); return null; }
    if(!flyEconomyEnabled() && !canUseFirebase()){ if(window.toast) toast('Online marketplace is not ready'); return null; }
    const c = cardById(cardId);
    if(!c){ if(window.toast) toast('Card not found'); return null; }
    if(!removeOwned(cardId, 1)){ if(window.toast) toast('You no longer own that card'); return null; }
    const sellerProfile = await FO.syncPublicProfile().catch(()=>profile());
    if(flyEconomyEnabled()){
      try{
        const data = await flyApiRequest('/api/marketplace/listings', {
          method:'POST',
          body:{uid:u.uid, profile:sellerProfile, cardId, price:Math.max(10, Number(price || 100) || 100)}
        });
        const localListing = data.listing;
        marketplaceListings = [localListing, ...marketplaceListings.filter(l=>l.listingId !== localListing.listingId)];
        marketplaceLoaded = true;
        window.FATE_ONLINE_MARKETPLACE_LISTINGS = marketplaceListings;
        if(typeof saveProfile === 'function') saveProfile();
        if(window.toast) toast(`${c.name} listed for ${localListing.price} Starlight`);
        try{ if(document.getElementById('marketplace-listings')) renderMarketplaceListings(); }catch(e){}
        updateMarketplaceRedeemButton();
        return localListing.listingId;
      }catch(err){
        addOwned(cardId, 1);
        if(typeof saveProfile === 'function') saveProfile();
        throw err;
      }
    }
    const listing = FO.push(FO.ref(FO.rtdb, 'marketplace/listings'));
    const payload = {
      listingId:listing.key,
      type:'card',
      sellerUid:u.uid,
      seller:sellerProfile.chosenUsername || sellerProfile.displayName || profileName(),
      sellerPhotoURL:sellerProfile.photoURL || sellerProfile.profileImg || profilePhoto(),
      cardId,
      price:Math.max(10, Number(price || 100) || 100),
      status:'active',
      createdAt:FO.serverTimestamp()
    };
    try{
      await FO.set(listing, payload);
    }catch(err){
      addOwned(cardId, 1);
      if(typeof saveProfile === 'function') saveProfile();
      throw err;
    }
    const localListing = { ...payload, listingId:listing.key, createdAt:Date.now() };
    marketplaceListings = [localListing, ...marketplaceListings.filter(l=>l.listingId !== listing.key)];
    window.FATE_ONLINE_MARKETPLACE_LISTINGS = marketplaceListings;
    if(typeof saveProfile === 'function') saveProfile();
    if(window.toast) toast(`${c.name} listed for ${payload.price} Starlight`);
    try{ if(document.getElementById('marketplace-listings')) renderMarketplaceListings(); }catch(e){}
    updateMarketplaceRedeemButton();
    return listing.key;
  }

  async function listMarketplacePfp(pfpId, price){
    const u = user();
    const id = Math.max(1, Math.min(80, parseInt(pfpId, 10) || 0));
    if(!u){ if(window.toast) toast('Sign in first'); return null; }
    if(!id){ if(window.toast) toast('Profile picture not found'); return null; }
    if(!flyEconomyEnabled() && !canUseFirebase()){ if(window.toast) toast('Online marketplace is not ready'); return null; }
    if(!takeOwnedPfp(id)){ if(window.toast) toast('You no longer own that profile picture'); return null; }
    const sellerProfile = await FO.syncPublicProfile().catch(()=>profile());
    if(flyEconomyEnabled()){
      try{
        const data = await flyApiRequest('/api/marketplace/listings', {
          method:'POST',
          body:{uid:u.uid, profile:sellerProfile, type:'pfp', pfpId:id, price:Math.max(10, Number(price || 100) || 100)}
        });
        const localListing = data.listing;
        marketplaceListings = [localListing, ...marketplaceListings.filter(l=>l.listingId !== localListing.listingId)];
        marketplaceLoaded = true;
        window.FATE_ONLINE_MARKETPLACE_LISTINGS = marketplaceListings;
        if(typeof saveProfile === 'function') saveProfile();
        if(window.toast) toast(`Profile picture ${id} listed for ${localListing.price} Starlight`);
        try{ if(document.getElementById('marketplace-listings')) renderMarketplaceListings(); }catch(e){}
        updateMarketplaceRedeemButton();
        return localListing.listingId;
      }catch(err){
        addOwnedPfp(id);
        if(typeof saveProfile === 'function') saveProfile();
        throw err;
      }
    }
    const listing = FO.push(FO.ref(FO.rtdb, 'marketplace/listings'));
    const payload = {
      listingId:listing.key,
      type:'pfp',
      sellerUid:u.uid,
      seller:sellerProfile.chosenUsername || sellerProfile.displayName || profileName(),
      sellerPhotoURL:sellerProfile.photoURL || sellerProfile.profileImg || profilePhoto(),
      pfpId:id,
      price:Math.max(10, Number(price || 100) || 100),
      status:'active',
      createdAt:FO.serverTimestamp()
    };
    try{
      await FO.set(listing, payload);
    }catch(err){
      addOwnedPfp(id);
      if(typeof saveProfile === 'function') saveProfile();
      throw err;
    }
    const localListing = { ...payload, listingId:listing.key, createdAt:Date.now() };
    marketplaceListings = [localListing, ...marketplaceListings.filter(l=>l.listingId !== listing.key)];
    window.FATE_ONLINE_MARKETPLACE_LISTINGS = marketplaceListings;
    if(typeof saveProfile === 'function') saveProfile();
    if(window.toast) toast(`Profile picture ${id} listed for ${payload.price} Starlight`);
    try{ if(document.getElementById('marketplace-listings')) renderMarketplaceListings(); }catch(e){}
    updateMarketplaceRedeemButton();
    return listing.key;
  }

  window.renderMarketplaceListings = function renderMarketplaceListings(){
    ensureWatchers('marketplace');
    const el = document.getElementById('marketplace-listings');
    if(!el) return;
    updateMarketplaceRedeemButton();
    const listings = (flyEconomyEnabled() || canUseFirebase()) ? marketplaceListings : (USER_PROFILE?.marketplace?.listings || []);
    if((flyEconomyEnabled() || canUseFirebase()) && !marketplaceLoaded){
      el.innerHTML = `<div style="text-align:center;padding:1.5rem;color:var(--dim);font-style:italic;">Loading marketplace...</div>`;
      return;
    }
    if(!listings.length){
      el.innerHTML = `<div style="text-align:center;padding:1.5rem;color:var(--dim);font-style:italic;">No listings yet. List a card to get started.</div>`;
      return;
    }
    const u = user();
    el.innerHTML = listings.map((l,i)=>{
      const isPfp = String(l.type || '') === 'pfp';
      const c = isPfp ? null : cardById(l.cardId);
      if(!isPfp && !c) return '';
      const own = !!(u && l.sellerUid === u.uid) || l.seller === USER_PROFILE?.username;
      const rarityColor = isPfp ? 'rgba(232,196,82,.7)' : ((typeof RARITY_COLOR !== 'undefined' && RARITY_COLOR[c.rarity]) || 'var(--border)');
      const pfpSrc = isPfp ? (typeof PFP_PATH === 'function' ? PFP_PATH(l.pfpId, 'square') : `pfp/pfp${Number(l.pfpId || 1)}.png`) : '';
      return `<div class="market-listing online-market-listing${isPfp ? ' pfp-market-listing' : ''}" data-listing-id="${esc(l.listingId || i)}">
        <div class="market-listing-thumb${isPfp ? ' pfp-listing-thumb' : ''}" style="border-color:${rarityColor};">${isPfp ? `<span class="pfp-listing-frame"><img src="${esc(pfpSrc)}" alt="Profile picture ${Number(l.pfpId || 0)}"></span>` : (c.img ? `<img src="${esc(c.img)}" alt="${esc(c.name)}">` : '')}</div>
        <div class="market-listing-copy">
          <div class="market-listing-name">${isPfp ? `Profile Picture ${Number(l.pfpId || 0)}` : esc(c.name)}</div>
          <div class="market-listing-meta">${isPfp ? 'Profile Picture' : esc(rarityLabel(c.rarity))} - ${esc(l.seller || 'Player')}</div>
        </div>
        <div class="market-listing-actions">
          <div class="market-listing-price">${starlightIcon()} ${Number(l.price || 0)}</div>
          ${own
            ? `<button class="btn sm danger" onclick="cancelListing(${i})">Cancel</button>`
            : `<button class="btn sm pri" onclick="buyListing(${i})">Buy</button>`}
        </div>
      </div>`;
    }).join('');
  };

  window.openSellCardModal = function openSellCardModal(page=sellCardPage){
    const entries = getOwnedEntries().filter(([id,count])=>Number(count)>0 && !(typeof isRetiredChallengerCard === 'function' && isRetiredChallengerCard(id)));
    if(!entries.length){ if(window.toast) toast('No cards to sell'); return; }
    const sorted = entries
      .map(([id,count])=>({ id, count:Number(count)||0, card:cardById(id) }))
      .filter(x=>x.card)
      .sort((a,b)=>String(a.card.name || '').localeCompare(String(b.card.name || '')));
    const pageSize = 12;
    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    sellCardPage = Math.max(0, Math.min(Number(page) || 0, totalPages - 1));
    const pageItems = sorted.slice(sellCardPage * pageSize, sellCardPage * pageSize + pageSize);
    let html = `<div class="sell-card-shell">
      <div class="sell-card-intro">
        <div class="sell-card-kicker">Marketplace Listing</div>
        <div class="sell-card-heading">Choose a Card to Sell</div>
        <div class="sell-card-note">Pick one owned card. It leaves your collection while listed and returns if you cancel before it sells.</div>
      </div>
      <button class="btn sm sell-card-close" type="button" onclick="closeModal()">Close</button>
      <div class="sell-card-grid">`;
    pageItems.forEach(({id,count,card:c})=>{
      const rarityColor = (typeof RARITY_COLOR !== 'undefined' && RARITY_COLOR[c.rarity]) || 'var(--border)';
      html += `<button class="sell-card-pick" type="button" onclick="listCardForSale('${esc(id)}')" style="--rarity-color:${rarityColor};">
        <div class="sell-card-thumb" style="border-color:${rarityColor};">${c.img ? `<img src="${esc(c.img)}" alt="${esc(c.name)}">` : ''}</div>
        <div class="sell-card-pick-name">${esc(c.name)}</div>
        <div class="sell-card-pick-meta">${esc(rarityLabel(c.rarity))} &times;${Number(count)}</div>
      </button>`;
    });
    for(let i=pageItems.length; i<pageSize; i++){
      html += '<span class="sell-card-pick sell-card-pick-placeholder" aria-hidden="true"></span>';
    }
    html += `</div>
      <div class="sell-card-pager">
        <button class="btn sm" onclick="openSellCardModal(${sellCardPage-1})" ${sellCardPage<=0?'disabled':''}>Prev</button>
        <span>${sellCardPage+1} / ${totalPages} &middot; ${sorted.length} cards</span>
        <button class="btn sm" onclick="openSellCardModal(${sellCardPage+1})" ${sellCardPage>=totalPages-1?'disabled':''}>Next</button>
      </div>
    </div>`;
    showModal('Sell a Card', html, []);
    const modalBox = document.querySelector('#modal .modal');
    if(modalBox) modalBox.classList.add('sell-card-modal','sell-card-picker-modal');
  };

  window.listCardForSale = function listCardForSale(cardId){
    const c = cardById(cardId);
    if(!c) return;
    const rarityColor = (typeof RARITY_COLOR !== 'undefined' && RARITY_COLOR[c.rarity]) || 'var(--border)';
    showModal('List Card', `
      <div class="market-list-card-modal">
        <div class="market-list-card-preview" style="--rarity-color:${rarityColor};">
          <div class="market-list-card-art">${c.img ? `<img src="${esc(c.img)}" alt="${esc(c.name)}">` : ''}</div>
          <div class="market-list-card-copy">
            <div class="market-list-kicker">Marketplace Listing</div>
            <div class="market-list-name">${esc(c.name)}</div>
            <div class="market-list-meta">${esc(c.type || '')} - ${esc(rarityLabel(c.rarity))}</div>
            <div class="market-list-note">Set a Starlight price. The card leaves your collection while listed and returns if you cancel.</div>
          </div>
        </div>
        <label class="market-price-row" for="sell-price">
          <span>Price</span>
          <div class="market-price-input-wrap"><input type="number" id="sell-price" min="10" max="10000" step="5" value="100"><span>Starlight</span></div>
        </label>
      </div>`,
      [{label:'List Card', pri:true, action:async(e)=>{
        const price = parseInt(document.getElementById('sell-price')?.value, 10) || 100;
        const btn = e && e.currentTarget;
        if(btn){
          btn.disabled = true;
          btn.textContent = 'Listing...';
        }
        const listingId = await listMarketplaceCard(cardId, price).catch(err=>{
          console.error('List card failed', err);
          if(window.toast) toast('Could not list card');
          return null;
        });
        if(!listingId){
          if(btn){
            btn.disabled = false;
            btn.textContent = 'List Card';
          }
          return;
        }
        if(btn) btn.textContent = 'Listed!';
        setTimeout(function(){
          closeModal();
          if(typeof switchChTab === 'function') switchChTab('store');
        }, 900);
      }},{label:'Cancel', action:closeModal}]
    );
    const modalBox = document.querySelector('#modal .modal');
    if(modalBox) modalBox.classList.add('sell-card-modal','market-list-modal');
  };

  window.openSellPfpModal = function openSellPfpModal(){
    const pfps = ownedPfps();
    if(!pfps.length){ if(window.toast) toast('No profile pictures to sell'); return; }
    const html = `<div class="sell-card-shell">
      <div class="sell-card-intro">
        <div class="sell-card-kicker">Marketplace Listing</div>
        <div class="sell-card-heading">Choose a Profile Picture to Sell</div>
        <div class="sell-card-note">Pick one unlocked profile picture. It leaves your collection while listed and returns if you cancel before it sells.</div>
      </div>
      <button class="btn sm sell-card-close" type="button" onclick="closeModal()">Close</button>
      <div class="sell-card-grid">${pfps.map(pfpId=>{
        const src = typeof PFP_PATH === 'function' ? PFP_PATH(pfpId, 'square') : `pfp/pfp${Number(pfpId)}.png`;
        return `<button class="sell-card-pick" type="button" onclick="listPfpForSale(${Number(pfpId)})" style="--rarity-color:rgba(232,196,82,.7);">
          <div class="sell-card-thumb" style="border-color:rgba(232,196,82,.7);"><img src="${esc(src)}" alt="Profile picture ${Number(pfpId)}"></div>
          <div class="sell-card-pick-name">Profile Picture ${Number(pfpId)}</div>
          <div class="sell-card-pick-meta">Profile Picture</div>
        </button>`;
      }).join('')}</div>
    </div>`;
    showModal('Sell a Profile Picture', html, []);
    const modalBox = document.querySelector('#modal .modal');
    if(modalBox) modalBox.classList.add('sell-card-modal','sell-card-picker-modal');
  };

  window.listPfpForSale = function listPfpForSale(pfpId){
    const id = Math.max(1, Math.min(80, parseInt(pfpId, 10) || 0));
    if(!id) return;
    const src = typeof PFP_PATH === 'function' ? PFP_PATH(id, 'square') : `pfp/pfp${id}.png`;
    showModal('List Profile Picture', `
      <div class="market-list-card-modal">
        <div class="market-list-card-preview" style="--rarity-color:rgba(232,196,82,.7);">
          <div class="market-list-card-art"><img src="${esc(src)}" alt="Profile picture ${id}"></div>
          <div class="market-list-card-copy">
            <div class="market-list-kicker">Marketplace Listing</div>
            <div class="market-list-name">Profile Picture ${id}</div>
            <div class="market-list-meta">Profile Picture</div>
            <div class="market-list-note">Set a Starlight price. The profile picture leaves your collection while listed and returns if you cancel.</div>
          </div>
        </div>
        <label class="market-price-row" for="sell-price">
          <span>Price</span>
          <div class="market-price-input-wrap"><input type="number" id="sell-price" min="10" max="10000" step="5" value="100"><span>Starlight</span></div>
        </label>
      </div>`,
      [{label:'List', pri:true, action:async(e)=>{
        const price = parseInt(document.getElementById('sell-price')?.value, 10) || 100;
        const btn = e && e.currentTarget;
        if(btn){ btn.disabled = true; btn.textContent = 'Listing...'; }
        const listingId = await listMarketplacePfp(id, price).catch(err=>{
          console.error('List profile picture failed', err);
          if(window.toast) toast('Could not list profile picture');
          return null;
        });
        if(!listingId){
          if(btn){ btn.disabled = false; btn.textContent = 'List'; }
          return;
        }
        if(btn) btn.textContent = 'Listed!';
        setTimeout(function(){
          closeModal();
          if(typeof switchChTab === 'function') switchChTab('store');
        }, 900);
      }},{label:'Cancel', action:closeModal}]
    );
    const modalBox = document.querySelector('#modal .modal');
    if(modalBox) modalBox.classList.add('sell-card-modal','market-list-modal');
  };

  window.buyListing = async function buyListing(i){
    const l = marketplaceListings[i] || USER_PROFILE?.marketplace?.listings?.[i];
    if(!l) return;
    const price = Number(l.price || 0);
    if((USER_PROFILE.starlight || 0) < price){ if(window.toast) toast('Not enough Starlight'); return; }
    const isPfp = String(l.type || '') === 'pfp';
    const c = isPfp ? null : cardById(l.cardId);
    if(!isPfp && !c) return;
    if(isPfp && ownedPfps().includes(Number(l.pfpId || 0))){ if(window.toast) toast('You already own that profile picture'); return; }
    if(flyEconomyEnabled() && l.listingId){
      USER_PROFILE.starlight -= price;
      if(isPfp) addOwnedPfp(Number(l.pfpId || 0));
      else addOwned(l.cardId, 1);
      try{
        const data = await flyApiRequest(`/api/marketplace/listings/${encodeURIComponent(l.listingId)}/buy`, {
          method:'POST',
          body:{uid:user()?.uid || '', profile:profile()}
        });
        marketplaceListings = marketplaceListings.filter(item=>item.listingId !== l.listingId);
        marketplaceTransactions = [data.listing, ...marketplaceTransactions.filter(item=>item.listingId !== l.listingId)].slice(0, 80);
        window.FATE_ONLINE_MARKETPLACE_LISTINGS = marketplaceListings;
        window.FATE_ONLINE_MARKETPLACE_TRANSACTIONS = marketplaceTransactions;
      }catch(e){
        USER_PROFILE.starlight += price;
        if(isPfp) takeOwnedPfp(Number(l.pfpId || 0));
        else removeOwned(l.cardId, 1);
        console.warn('Fly marketplace buy failed', e);
        if(window.toast) toast('Marketplace purchase failed');
        return;
      }
      if(typeof saveProfile === 'function') saveProfile();
      if(typeof playSfx === 'function') playSfx('starPlace');
      if(typeof switchChTab === 'function') switchChTab('store');
      setTimeout(()=>isPfp ? showMarketplacePfpPurchaseNotice(Number(l.pfpId || 0), price) : showMarketplacePurchaseNotice(c, price), 120);
      return;
    }
    USER_PROFILE.starlight -= price;
    if(isPfp) addOwnedPfp(Number(l.pfpId || 0));
    else addOwned(l.cardId, 1);
    if(canUseFirebase() && l.listingId){
      await FO.update(FO.ref(FO.rtdb, `marketplace/listings/${l.listingId}`), {
        ...l,
        status:'sold',
        buyerUid:user()?.uid || '',
        buyer:profileName(),
        buyerPhotoURL:profilePhoto(),
        soldAt:Date.now(),
        updatedAt:FO.serverTimestamp()
      }).catch(e=>console.warn('Marketplace buy update failed', e));
    }
    if(typeof saveProfile === 'function') saveProfile();
    if(typeof playSfx === 'function') playSfx('starPlace');
    if(typeof switchChTab === 'function') switchChTab('store');
    setTimeout(()=>isPfp ? showMarketplacePfpPurchaseNotice(Number(l.pfpId || 0), price) : showMarketplacePurchaseNotice(c, price), 120);
  };

  function showMarketplacePfpPurchaseNotice(pfpId, price){
    const src = typeof PFP_PATH === 'function' ? PFP_PATH(pfpId, 'square') : `pfp/pfp${Number(pfpId || 1)}.png`;
    showModal('Purchase Complete', `
      <div class="market-purchase-notice" style="--rarity-color:rgba(232,196,82,.7);">
        <div class="market-purchase-card"><img src="${esc(src)}" alt="Profile picture ${Number(pfpId || 0)}"></div>
        <div class="market-purchase-copy">
          <div class="market-purchase-kicker">Marketplace Acquisition</div>
          <div class="market-purchase-name">Profile Picture ${Number(pfpId || 0)}</div>
          <div class="market-purchase-meta">Profile Picture &middot; ${starlightIcon()} ${Number(price || 0)} Starlight</div>
          <div class="market-purchase-note">The profile picture has been added to your collection.</div>
        </div>
      </div>`,
      [{label:'Back to Store', pri:true, action:()=>{ closeModal(); if(typeof switchChTab === 'function') switchChTab('store'); }}]
    );
    const modalBox = document.querySelector('#modal .modal');
    if(modalBox) modalBox.classList.add('market-purchase-modal');
  }

  function showMarketplacePurchaseNotice(card, price){
    const rarityColor = (typeof RARITY_COLOR !== 'undefined' && RARITY_COLOR[card.rarity]) || 'rgba(232,196,82,.55)';
    showModal('Purchase Complete', `
      <div class="market-purchase-notice" style="--rarity-color:${rarityColor};">
        <div class="market-purchase-card">${card.img ? `<img src="${esc(card.img)}" alt="${esc(card.name)}">` : ''}</div>
        <div class="market-purchase-copy">
          <div class="market-purchase-kicker">Marketplace Acquisition</div>
          <div class="market-purchase-name">${esc(card.name)}</div>
          <div class="market-purchase-meta">${esc(rarityLabel(card.rarity))} &middot; ${starlightIcon()} ${Number(price || 0)} Starlight</div>
          <div class="market-purchase-note">The card has been added to your collection and is ready for deck building.</div>
        </div>
      </div>`,
      [{label:'Back to Store', pri:true, action:()=>{ closeModal(); if(typeof switchChTab === 'function') switchChTab('store'); }}]
    );
    const modalBox = document.querySelector('#modal .modal');
    if(modalBox) modalBox.classList.add('market-purchase-modal');
    window.setTimeout(()=>{
      const activePurchaseModal = document.querySelector('#modal.on .modal.market-purchase-modal');
      if(activePurchaseModal && typeof closeModal === 'function') closeModal();
    }, 2200);
  }

  window.redeemMarketplaceStarlight = async function redeemMarketplaceStarlight(){
    ensureWatchers('marketplace');
    const u = user();
    const pending = pendingSoldListings();
    const total = pending.reduce((sum,l)=>sum + Number(l.price || 0), 0);
    if(total <= 0){ if(window.toast) toast('No sales to redeem'); updateMarketplaceRedeemButton(); return; }
    if(flyEconomyEnabled()){
      const data = await flyApiRequest('/api/marketplace/redeem', {
        method:'POST',
        body:{uid:u?.uid || ''}
      }).catch(e=>{
        console.warn('Fly marketplace redeem failed', e);
        if(window.toast) toast('Could not redeem sales');
        return null;
      });
      if(!data) return;
      const redeemedTotal = Number(data.redeemedStarlight || total) || total;
      USER_PROFILE.starlight = (USER_PROFILE.starlight || 0) + redeemedTotal;
      const redeemedIds = new Set((data.listings || []).map(l=>l.listingId));
      marketplaceTransactions.forEach(l=>{
        if(redeemedIds.has(l.listingId)){ l.sellerRedeemed = true; l.redeemedAt = l.redeemedAt || Date.now(); }
      });
      if(typeof saveProfile === 'function') saveProfile();
      if(typeof updateChTopbar === 'function') updateChTopbar();
      updateMarketplaceRedeemButton();
      if(window.toast) toast(`Redeemed ${redeemedTotal} Starlight`);
      return;
    }
    USER_PROFILE.starlight = (USER_PROFILE.starlight || 0) + total;
    if(canUseFirebase()){
      const updates = {};
      pending.forEach(l=>{
        if(!l.listingId) return;
        updates[`marketplace/listings/${l.listingId}/sellerRedeemed`] = true;
        updates[`marketplace/listings/${l.listingId}/redeemedAt`] = Date.now();
        updates[`marketplace/listings/${l.listingId}/redeemedBy`] = u?.uid || profileName();
      });
      if(Object.keys(updates).length) await FO.update(FO.ref(FO.rtdb), updates).catch(e=>console.warn('Redeem marketplace starlight failed', e));
    }
    pending.forEach(l=>{ l.sellerRedeemed = true; l.redeemedAt = l.redeemedAt || Date.now(); });
    if(typeof saveProfile === 'function') saveProfile();
    if(typeof updateChTopbar === 'function') updateChTopbar();
    updateMarketplaceRedeemButton();
    if(window.toast) toast(`Redeemed ${total} Starlight`);
  };

  window.showMarketplaceTransactions = function showMarketplaceTransactions(page=marketplaceTxPage){
    ensureWatchers('marketplace');
    const tx = (flyEconomyEnabled() || canUseFirebase())
      ? marketplaceTransactions
      : (USER_PROFILE?.marketplace?.listings || []).filter(l=>String(l.status || '') === 'sold');
    const pageSize = 10;
    const totalPages = Math.max(1, Math.ceil(tx.length / pageSize));
    marketplaceTxPage = Math.max(0, Math.min(Number(page) || 0, totalPages - 1));
    const pageItems = tx.slice(marketplaceTxPage * pageSize, marketplaceTxPage * pageSize + pageSize);
    const body = document.createElement('div');
    body.className = 'market-history-modal-body';
    const rows = pageItems.map(l=>{
      const isPfp = String(l.type || '') === 'pfp';
      const c = isPfp ? null : cardById(l.cardId);
      const pfpSrc = isPfp ? (typeof PFP_PATH === 'function' ? PFP_PATH(l.pfpId, 'square') : `pfp/pfp${Number(l.pfpId || 1)}.png`) : '';
      const when = l.soldAt || l.updatedAt || l.createdAt || l.timestamp || Date.now();
      const date = new Date(Number(when) || Date.now()).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
      return `<div class="market-history-row">
        <div class="market-history-card">${isPfp ? `<img src="${esc(pfpSrc)}" alt="Profile picture ${Number(l.pfpId || 0)}">` : (c?.img ? `<img src="${esc(c.img)}" alt="${esc(c.name)}">` : '')}</div>
        <div class="market-history-copy">
          <div class="market-history-name">${isPfp ? `Profile Picture ${Number(l.pfpId || 0)}` : esc(c?.name || 'Unknown Card')}</div>
          <div class="market-history-meta">
            <span>${esc(l.seller || 'Seller')}</span>
            <span class="market-history-arrow">to</span>
            <span>${esc(l.buyer || l.buyerName || 'Buyer')}</span>
          </div>
        </div>
        <div class="market-history-side">
          <div class="market-history-price">${starlightIcon()} ${Number(l.price || 0)}</div>
          <div class="market-history-time">${esc(date)}</div>
        </div>
      </div>`;
    }).join('');
    body.innerHTML = `
      <div class="market-history-intro">
        <button class="btn sm market-history-close" onclick="closeModal()">Close</button>
        <div class="market-history-kicker">Completed Marketplace Trades</div>
        <div class="market-history-note">Recent card purchases between players. Listings appear here after a buyer completes the transaction.</div>
      </div>
      <div class="market-history-list">
        ${rows || '<div class="market-history-empty">No completed transactions yet.</div>'}
      </div>
      <div class="market-history-pager">
        <button class="btn sm" onclick="showMarketplaceTransactions(${marketplaceTxPage-1})" ${marketplaceTxPage<=0?'disabled':''}>Prev</button>
        <span>Page ${marketplaceTxPage+1} / ${totalPages}</span>
        <button class="btn sm" onclick="showMarketplaceTransactions(${marketplaceTxPage+1})" ${marketplaceTxPage>=totalPages-1?'disabled':''}>Next</button>
      </div>`;
    showModal('Marketplace History', body.outerHTML, [{label:'Close', action:closeModal}]);
    const acts = document.getElementById('modal-acts');
    if(acts && !acts.children.length){
      const close = document.createElement('button');
      close.className = 'btn sm';
      close.textContent = 'Close';
      close.onclick = closeModal;
      acts.appendChild(close);
    }
    const modalBox = document.querySelector('#modal .modal');
    if(modalBox) modalBox.classList.add('market-history-modal');
  };

  window.cancelListing = async function cancelListing(i){
    const l = marketplaceListings[i] || USER_PROFILE?.marketplace?.listings?.[i];
    if(!l) return;
    if(flyEconomyEnabled() && l.listingId){
      const data = await flyApiRequest(`/api/marketplace/listings/${encodeURIComponent(l.listingId)}/cancel`, {
        method:'POST',
        body:{uid:user()?.uid || ''}
      }).catch(e=>{
        console.warn('Fly marketplace cancel failed', e);
        if(window.toast) toast('Could not cancel listing');
        return null;
      });
      if(!data) return;
      marketplaceListings = marketplaceListings.filter(item=>item.listingId !== l.listingId);
      window.FATE_ONLINE_MARKETPLACE_LISTINGS = marketplaceListings;
    }else if(canUseFirebase() && l.listingId){
      await FO.update(FO.ref(FO.rtdb, `marketplace/listings/${l.listingId}`), {
        ...l,
        status:'cancelled',
        cancelledAt:Date.now(),
        updatedAt:FO.serverTimestamp()
      }).catch(e=>console.warn('Marketplace cancel failed', e));
    }
    if(String(l.type || '') === 'pfp' && l.pfpId) addOwnedPfp(Number(l.pfpId || 0));
    else if(l.cardId) addOwned(l.cardId, 1);
    if(typeof saveProfile === 'function') saveProfile();
    if(window.toast) toast('Listing cancelled');
    if(typeof switchChTab === 'function') switchChTab('store');
  };

  function normalizePublicDeck(d){
    const ratingsRaw = d.ratings || {};
    const commentsRaw = d.comments || {};
    const ratings = Array.isArray(ratingsRaw) ? ratingsRaw : Object.values(ratingsRaw);
    const comments = Array.isArray(commentsRaw) ? commentsRaw : Object.values(commentsRaw);
    return {
      ...d,
      id:d.id || d.deckId,
      deckId:d.deckId || d.id,
      username:d.username || d.ownerName || 'Player',
      ids:Array.isArray(d.ids) ? d.ids : [],
      displayCardIds:Array.isArray(d.displayCardIds) ? d.displayCardIds : [],
      totalCards:Number(d.totalCards || (Array.isArray(d.ids) ? d.ids.length : 0)) || 0,
      uniqueCards:Number(d.uniqueCards || (Array.isArray(d.ids) ? new Set(d.ids).size : 0)) || 0,
      ratingAvg:Number(d.ratingAvg || 0) || 0,
      ratingCount:Number(d.ratingCount || ratings.length || 0) || 0,
      commentCount:Number(d.commentCount || comments.length || 0) || 0,
      ratings,
      comments
    };
  }
  function avgRating(deck){
    const ratings = Array.isArray(deck.ratings) ? deck.ratings : [];
    if(Number(deck?.ratingCount || 0) > 0) return Number(deck.ratingAvg || 0) || 0;
    if(!ratings.length) return 0;
    return ratings.reduce((sum,r)=>sum + Number(r.stars || 0), 0) / ratings.length;
  }
  function renderStars(r){
    const full = Math.max(0, Math.min(5, Math.round(r)));
    return '&#9733;'.repeat(full) + '&#9734;'.repeat(5 - full);
  }
  function publicDeckById(id){
    const key = String(id || '');
    return publicDeckDetailCache.get(key) || publicDecks.find(d=>d.id === key || d.deckId === key);
  }
  async function loadPublicDeckDetail(id){
    const key = String(id || '');
    if(key && publicDeckApiEnabled()){
      const data = await flyApiRequest(`/api/public-decks/${encodeURIComponent(key)}`);
      const full = normalizePublicDeck(data.deck || {});
      if(full.deckId || full.id) publicDeckDetailCache.set(full.deckId || full.id, full);
      return full;
    }
    if(!key || !canUseFirebase()) return publicDeckById(key);
    const summary = publicDecks.find(d=>d.id === key || d.deckId === key) || {};
    const [detailSnap, ratingsSnap, commentsSnap] = await Promise.all([
      FO.get(FO.ref(FO.rtdb, `publicDeckDetails/${key}`)).catch(()=>null),
      FO.get(FO.ref(FO.rtdb, `publicDeckRatings/${key}`)).catch(()=>null),
      FO.get(cappedFeed(`publicDeckComments/${key}`, 'createdAt', 80)).catch(()=>null)
    ]);
    const detail = detailSnap?.val?.() || {};
    const ratingsObj = ratingsSnap?.val?.() || {};
    const commentsObj = commentsSnap?.val?.() || {};
    const full = normalizePublicDeck({
      ...summary,
      ...detail,
      id:key,
      deckId:key,
      ratings:ratingsObj,
      comments:commentsObj
    });
    if(detail && Object.keys(detail).length) publicDeckDetailCache.set(key, full);
    return full;
  }
  function ownsPublicDeck(deck){
    const u = user();
    if(!deck || !u) return false;
    return deck.ownerUid === u.uid || deck.uid === u.uid || deck.owner === u.uid;
  }
  window.openPublicDeckCard = function openPublicDeckCard(cardId, deckId){
    const card = cardById(cardId);
    if(!card){ if(window.toast) toast('Card not found'); return; }
    if(typeof window.openCardDetail === 'function') window.openCardDetail(card);
    else if(typeof openCardDetail === 'function') openCardDetail(card);
    const closeBtn = document.querySelector('#modal-acts .btn');
    if(closeBtn && deckId){
      closeBtn.onclick = ()=>viewPublicDeck(deckId);
    }
  };

  window.showPublicDecks = function showPublicDecks(page=publicDecksPage){
    ensureWatchers('publicDecks');
    if(typeof resetModalChrome === 'function') resetModalChrome();
    applyPublicDeckModalChrome();
    const sorted = [...publicDecks].sort((a,b)=>(avgRating(b) - avgRating(a)) || ((b.timestamp || 0) - (a.timestamp || 0)));
    const pageSize = 4;
    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    publicDecksPage = Math.max(0, Math.min(page, totalPages - 1));
    const pageDecks = sorted.slice(publicDecksPage * pageSize, publicDecksPage * pageSize + pageSize);
    const totalRatings = sorted.reduce((sum,d)=>sum + (Number(d.ratingCount || 0) || (Array.isArray(d.ratings) ? d.ratings.length : 0)), 0);
    let html = `<div class="pd-hub">
      <section class="pd-hub-hero">
        <div class="pd-hub-copy">
          <div class="pd-hub-kicker">Community Library</div>
          <h2>Public Decks</h2>
          <p>Browse shared builds, inspect every card, rate favorites, and publish your own finished preset.</p>
        </div>
        <div class="pd-hub-stats">
          <span><b>${sorted.length}</b><em>Decks</em></span>
          <span><b>${totalRatings}</b><em>Ratings</em></span>
        </div>
        <div class="pd-hub-hero-actions">
          <button class="btn pri pd-share-main" onclick="openShareDeckFlow()">Share a Deck</button>
        </div>
      </section>`;
    if((publicDeckApiEnabled() || canUseFirebase()) && !publicDecksLoaded){
      html += `<div class="pd-empty-state">
        <div class="pd-empty-title">Loading public decks...</div>
        <p>Fetching the latest shared builds.</p>
      </div>`;
    }else if(!sorted.length){
      html += `<div class="pd-empty-state">
        <div class="pd-empty-title">No decks have been posted yet.</div>
        <p>Publish one of your custom presets to start the public library.</p>
      </div>`;
    }else{
      html += '<div class="pd-list pd-list-page pd-hub-grid">';
      pageDecks.forEach((d,idx)=>{
        const faceCard = d.faceCardId ? cardById(d.faceCardId) : null;
        const faceImg = faceCard && faceCard.img ? esc(faceCard.img) : '';
        const rating = avgRating(d);
        const own = ownsPublicDeck(d);
        html += `<div class="pd-hub-card" onclick="viewPublicDeck('${esc(d.id)}')">
          <span class="pd-hub-rank">#${publicDecksPage * pageSize + idx + 1}</span>
          <span class="pd-hub-art" data-public-deck-art="${esc(d.id)}">${faceImg ? `<img src="${faceImg}" alt="" decoding="async" loading="eager" draggable="false" onerror="this.style.display='none'">` : '<span>Deck</span>'}</span>
          <span class="pd-hub-info">
            <span class="pd-author">Shared by ${esc(d.username)}</span>
            <strong>${esc(d.name || 'Shared Deck')}</strong>
            <span class="pd-hub-desc">${esc(d.description || 'No description yet.')}</span>
            <span class="pd-hub-meta">
              <span class="pd-stars">${renderStars(rating)}</span>
            </span>
          </span>
          <span class="pd-hub-actions">
            ${own ? `<button type="button" class="pd-hub-delete" onclick="event.stopPropagation();deletePublicDeck('${esc(d.id)}')">Remove</button>` : ''}
            <button type="button" class="pd-hub-open" onclick="event.stopPropagation();viewPublicDeck('${esc(d.id)}')">Open</button>
          </span>
        </div>`;
      });
      html += `</div><div class="pd-pager">
        <button class="btn sm" onclick="showPublicDecks(${publicDecksPage-1})" ${publicDecksPage<=0?'disabled':''}>Prev</button>
        <span>Page ${publicDecksPage+1} / ${totalPages}</span>
        <button class="btn sm" onclick="showPublicDecks(${publicDecksPage+1})" ${publicDecksPage>=totalPages-1?'disabled':''}>Next</button>
      </div>`;
    }
    html += '</div>';
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-title').textContent = '';
    document.getElementById('modal-acts').innerHTML = '';
    const close = document.createElement('button');
    close.className = 'btn sm';
    close.textContent = 'Close';
    close.onclick = closeModal;
    document.getElementById('modal-acts').appendChild(close);
    applyPublicDeckModalChrome();
    document.getElementById('modal').classList.add('on');
  };

  window.viewPublicDeck = async function viewPublicDeck(id){
    let d = publicDeckById(id);
    if(!d) return;
    if(!Array.isArray(d.ids) || !d.ids.length){
      if(typeof resetModalChrome === 'function') resetModalChrome();
      applyPublicDeckModalChrome('public-deck-preview-modal');
      document.getElementById('modal-body').innerHTML = '<div class="pd-empty-state"><div class="pd-empty-title">Loading deck...</div><p>Opening the deck details.</p></div>';
      document.getElementById('modal-title').textContent = '';
      document.getElementById('modal-acts').innerHTML = '';
    }
    d = await loadPublicDeckDetail(id).catch(()=>d) || d;
    if(typeof resetModalChrome === 'function') resetModalChrome();
    applyPublicDeckModalChrome('public-deck-preview-modal');
    const counts = {};
    (d.ids || []).forEach(cardId=>{ counts[cardId] = (counts[cardId] || 0) + 1; });
    const uniqueCards = Object.entries(counts).map(([cardId,count])=>({card:cardById(cardId), count})).filter(x=>x.card);
    uniqueCards.sort((a,b)=>(a.card.type === 'Supporter' ? 0 : 1) - (b.card.type === 'Supporter' ? 0 : 1) || (a.card.cost||0)-(b.card.cost||0));
    const rating = avgRating(d);
    const faceCard = d.faceCardId ? cardById(d.faceCardId) : (uniqueCards[0]?.card || null);
    const ownDeck = ownsPublicDeck(d);
    let html = `<div class="pd-detail-v3 no-preview-back">
      <div class="pd-detail-top">
        <div class="pd-detail-actions">
          <button class="btn sm" type="button" onclick="loadPublicDeck('${esc(id)}')">Import</button>
          <button class="btn sm" type="button" onclick="rateDeck('${esc(id)}')">Rate Deck</button>
          ${ownDeck ? `<button class="btn sm danger" type="button" onclick="deletePublicDeck('${esc(id)}')">Remove</button>` : ''}
        </div>
      </div>
      <section class="pd-detail-hero">
        <aside class="pd-detail-poster">
          <div class="pd-detail-art">${faceCard?.img && typeof window.renderCanvasImage !== 'function' ? `<img src="${esc(faceCard.img)}" onerror="this.style.display='none'">` : '<span>Deck</span>'}</div>
          <div class="pd-detail-rating">
            <b>${rating.toFixed(1)}</b>
            <em>Rating</em>
            <span class="pd-stars">${renderStars(rating)}</span>
            <small>${d.ratingCount || d.ratings.length} vote${(d.ratingCount || d.ratings.length)!==1?'s':''}</small>
          </div>
        </aside>
        <main class="pd-detail-summary">
          <div class="pd-author">Shared by ${esc(d.username)}</div>
          <h2>${esc(d.name || 'Shared Deck')}</h2>
          <div class="pd-detail-metrics">
            <span><b>${d.totalCards || (d.ids || []).length}</b><em>Total Cards</em></span>
            <span><b>${d.uniqueCards || uniqueCards.length}</b><em>Unique Cards</em></span>
            <span><b>${d.commentCount || (d.comments || []).length}</b><em>Comments</em></span>
          </div>
          <p>${esc(d.description || 'No description yet.')}</p>
        </main>
      </section>
      <section class="pd-detail-contents">
        <div class="pd-detail-section-title">Deck Contents <span>${uniqueCards.length} unique cards</span></div>
        <div class="pd-detail-card-grid"></div></section></div>`;
    document.getElementById('modal-body').innerHTML = html;
    const poster = document.querySelector('#modal-body .pd-detail-art');
    if(poster && faceCard?.img && typeof window.renderCanvasImage === 'function') {
      poster.textContent = '';
      const canvas = document.createElement('canvas');
      canvas.className = 'pd-detail-art-canvas';
      canvas.setAttribute('aria-hidden','true');
      poster.appendChild(canvas);
      window.renderCanvasImage(canvas, faceCard.img, {mode:'cover', parent:poster, background:'transparent', maxDpr:4, cropY:.08});
    }
    const contentsGrid = document.querySelector('#modal-body .pd-detail-card-grid');
    if(contentsGrid) contentsGrid.classList.toggle('deck-preview-scroll-extra-row', uniqueCards.length >= 15);
    if(contentsGrid && typeof window.renderCanvasDeckCollection === 'function') {
      contentsGrid.style.setProperty('--dbcw', '96px');
      contentsGrid.style.setProperty('--dbch', '135px');
      window.renderCanvasDeckCollection(contentsGrid, uniqueCards.map(({card,count})=>({
        card,
        count: 0,
        ownedText: 'x' + count,
        title: card.name,
        ariaLabel: card.name
      })), {
        onClick: (card)=>window.openPublicDeckCard(card.id, id),
        onContextMenu: (card)=>showCardInfoOverlay(card)
      });
    } else if(contentsGrid) {
      uniqueCards.forEach(({card:c,count})=>{
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pd-detail-card pd-card-click';
        btn.title = c.name;
        btn.dataset.cardId = c.id;
        btn.innerHTML = `<span class="pd-detail-card-art">${c.img ? `<img src="${esc(c.img)}" alt="">` : ''}</span>
          <span class="pd-detail-card-name">${esc(c.name)}</span>
          <span class="pd-detail-count">x${count}</span>`;
        contentsGrid.appendChild(btn);
      });
    }
    document.getElementById('modal-title').textContent = 'Deck Preview';
    document.getElementById('modal-acts').innerHTML = '';
    const acts = document.getElementById('modal-acts');
    const back = document.createElement('button');
    back.className = 'btn sm';
    back.textContent = 'Back';
    back.onclick = function(){ showPublicDecks(publicDecksPage); };
    acts.appendChild(back);
    applyPublicDeckModalChrome('public-deck-preview-modal');
    document.querySelectorAll('#modal-body .pd-card-click[data-card-id]').forEach(el=>{
      el.addEventListener('click', e=>{
        e.preventDefault();
        e.stopPropagation();
        window.openPublicDeckCard(el.dataset.cardId, id);
      });
    });
  };

  window.deletePublicDeck = async function deletePublicDeck(id){
    const d = publicDeckById(id);
    if(!d || !ownsPublicDeck(d)){
      if(window.toast) toast('You can only remove your own public decks');
      return;
    }
    if(!publicDeckApiEnabled() && !canUseFirebase()){
      if(window.toast) toast('Online economy is not ready');
      return;
    }
    let removed = true;
    const deckId = d.deckId || d.id;
    if(publicDeckApiEnabled()){
      await flyApiRequest(`/api/public-decks/${encodeURIComponent(deckId)}/delete`, {
        method:'POST',
        body:{uid:authUid()}
      }).catch(e=>{
        console.error('Remove Fly public deck failed', e);
        if(window.toast) toast('Could not remove deck');
        removed = false;
      });
      if(!removed) return;
      publicDecks = publicDecks.filter(deck => deck.id !== id && deck.deckId !== id);
      publicDeckDetailCache.delete(deckId);
      if(window.toast) toast('Deck removed from Public Decks');
      showPublicDecks(publicDecksPage);
      return;
    }
    await FO.update(FO.ref(FO.rtdb), {
      [`publicDeckSummaries/${deckId}`]:null,
      [`publicDeckDetails/${deckId}`]:null,
      [`publicDeckRatings/${deckId}`]:null,
      [`publicDeckComments/${deckId}`]:null
    }).catch(e=>{
      console.error('Remove public deck failed', e);
      if(window.toast) toast('Could not remove deck');
      removed = false;
    });
    if(!removed) return;
    publicDecks = publicDecks.filter(deck => deck.id !== id && deck.deckId !== id);
    publicDeckDetailCache.delete(deckId);
    if(window.toast) toast('Deck removed from Public Decks');
    showPublicDecks(publicDecksPage);
  };

  window.viewPublicDeckComments = async function viewPublicDeckComments(id){
    const d = await loadPublicDeckDetail(id).catch(()=>publicDeckById(id));
    if(!d) return;
    const comments = Array.isArray(d.comments) ? [...d.comments] : [];
    comments.sort(function(a,b){ return (a.timestamp || 0) - (b.timestamp || 0); });
    const u = user();
    const ratings = Array.isArray(d.ratings) ? d.ratings : [];
    const myRating = u ? ratings.find(r=>r && r.uid === u.uid) : null;
    const ratingAvg = avgRating(d);
    const ratingCount = d.ratingCount || ratings.length;
    const deckDesc = d.description || 'Custom deck';
    const uniqueCount = new Set(d.ids || []).size;
    const faceCard = d.faceCardId ? cardById(d.faceCardId) : cardById((d.ids || [])[0]);
    /* Codex 2026-06-03: reversible rate banner card-art slot. Remove rd-rating-art markup to revert. */
    const rateArtHtml = faceCard && faceCard.img
      ? '<img src="' + esc(faceCard.img) + '" alt="' + esc(faceCard.name || d.name || 'Deck art') + '" onerror="this.parentElement.style.display=\'none\'">'
      : '<span>Deck</span>';
    const starHtml = [1,2,3,4,5].map(function(n){
      const filled = myRating && myRating.stars >= n;
      return '<span class="rd-star' + (filled ? ' rd-star-filled' : '') + '" onclick="submitRating(\'' + esc(id) + '\',' + n + ')">&starf;</span>';
    }).join('');
    const commentsHtml = comments.length
      ? comments.map(function(c){
          return '<div class="rd-comment"><span class="rd-comment-author">' + esc(c.username || 'Player') + '</span><span class="rd-comment-text">' + esc(c.text) + '</span></div>';
        }).join('')
      : '<div class="rd-empty">No comments yet. Be the first!</div>';
    const html = '<div class="rd-window">'
      + '<div class="rd-window-top"></div>'
      + '<div class="rd-compact-head"><span>Rate &amp; Discuss</span><em>' + esc(d.name || 'Shared Deck') + '</em></div>'
      + '<section class="rd-rating-section">'
      +   '<div class="rd-rating-art">' + rateArtHtml + '</div>'
      +   '<div class="rd-rating-copy">'
      +     '<div class="rd-kicker">Rate &amp; Review</div>'
      +     '<h2>' + esc(d.name || 'Shared Deck') + '</h2>'
      +     '<p>' + esc(deckDesc) + '</p>'
      +     '<div class="rd-deck-meta"><span>' + uniqueCount + ' unique cards</span><span>' + (d.ids || []).length + ' total cards</span></div>'
      +   '</div>'
      +   '<div class="rd-rating-controls">'
      +     '<div class="rd-rating-score"><b>' + ratingAvg.toFixed(1) + '</b><span>average</span><em>' + ratingCount + ' vote' + (ratingCount !== 1 ? 's' : '') + '</em></div>'
      +     '<div class="rd-rating-label">Your Rating</div>'
      +     '<div class="rd-stars">' + starHtml + '</div>'
      +   '</div>'
      + '</section>'
      + '<section class="rd-comments-section">'
      +   '<div class="rd-section-head"><div><span class="rd-kicker">Community Notes</span><div class="rd-section-label">Discussion</div></div><span>' + comments.length + ' comment' + (comments.length !== 1 ? 's' : '') + '</span></div>'
      +   '<div class="rd-comment-list">' + commentsHtml + '</div>'
      + '</section>'
      + '<div class="rd-compose">'
      +   '<input id="pd-comment-inp" type="text" class="rd-input" placeholder="Add a comment..." maxlength="240">'
      +   '<button class="btn sm pri rd-post-btn" onclick="postComment(\'' + esc(id) + '\')">Post</button>'
      + '</div>'
      + '</div>';
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-title').textContent = '';
    document.getElementById('modal-acts').innerHTML = '';
    const back = document.createElement('button');
    back.className = 'btn sm'; back.textContent = 'Back to Deck';
    back.onclick = function(){ viewPublicDeck(id); };
    document.getElementById('modal-acts').appendChild(back);
    applyPublicDeckModalChrome('public-deck-comments-modal');
  };

  function publicDeckImportIcon(kind){
    if(kind === 'challenger') return '<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M32 8l18 8v13c0 12-7 21-18 27-11-6-18-15-18-27V16l18-8z" stroke-width="4"/><path d="M23 31h18M32 21v22" stroke-width="4"/><path d="M23 43c5 4 13 4 18 0" stroke-width="3" opacity=".55"/></g></svg>';
    return '<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="12" y="14" width="40" height="36" rx="5" stroke-width="4"/><path d="M20 24h24M20 33h24M20 42h14" stroke-width="3.5"/><path d="M44 39l6 6-6 6" stroke-width="3"/></g></svg>';
  }

  function showPublicDeckImportChoice(id, d){
    if(!d) return;
    if(typeof resetModalChrome === 'function') resetModalChrome();
    applyPublicDeckModalChrome('public-deck-import-choice-modal');
    const total = Array.isArray(d.ids) ? d.ids.length : 0;
    const unique = new Set(d.ids || []).size;
    const body = document.getElementById('modal-body');
    body.innerHTML = '<div class="public-import-choice">'
      + '<div class="public-import-choice-head"><span>Import Destination</span><h2>' + esc(d.name || 'Shared Deck') + '</h2><p>Choose where this public deck should land.</p></div>'
      + '<div class="public-import-choice-meta"><span><b>' + total + '</b><em>cards</em></span><span><b>' + unique + '</b><em>unique</em></span></div>'
      + '<div class="public-import-choice-grid">'
      +   '<button type="button" class="public-import-option public-import-option-challenger" data-dest="challenger">'
      +     '<span class="public-import-option-icon">' + publicDeckImportIcon('challenger') + '</span>'
      +     '<span class="public-import-option-copy"><b>Challenger Deck</b><em>Save it if you own every card. Otherwise load the owned cards into the Challenger builder.</em></span>'
      +   '</button>'
      +   '<button type="button" class="public-import-option public-import-option-title" data-dest="title">'
      +     '<span class="public-import-option-icon">' + publicDeckImportIcon('title') + '</span>'
      +     '<span class="public-import-option-copy"><b>Title Deck Builder</b><em>Open this list as an unsaved title-screen builder deck.</em></span>'
      +   '</button>'
      + '</div></div>';
    document.getElementById('modal-title').textContent = '';
    const acts = document.getElementById('modal-acts');
    acts.innerHTML = '';
    const back = document.createElement('button');
    back.className = 'btn sm';
    back.textContent = 'Back';
    back.onclick = function(){ viewPublicDeck(id); };
    acts.appendChild(back);
    const close = document.createElement('button');
    close.className = 'btn sm';
    close.textContent = 'Cancel';
    close.onclick = closeModal;
    acts.appendChild(close);
    const meta = {
      publicId:id,
      name:d.name || 'Shared Deck',
      description:d.description || '',
      faceCardId:d.faceCardId || '',
      displayCardIds:Array.isArray(d.displayCardIds) ? d.displayCardIds : []
    };
    body.querySelector('[data-dest="challenger"]').onclick = function(){
      if(typeof window.importIdsToChallengerDeckBuilder !== 'function'){ if(window.toast) toast('Challenger deck builder is not ready'); return; }
      const result = window.importIdsToChallengerDeckBuilder(d.ids || [], meta);
      if(result && (result.saved || result.alreadyImported) && typeof closeModal === 'function') closeModal();
    };
    body.querySelector('[data-dest="title"]').onclick = function(){
      if(typeof window.importIdsToTitleDeckBuilder !== 'function'){ if(window.toast) toast('Deck Builder is not ready'); return; }
      window.importIdsToTitleDeckBuilder(d.ids || [], meta);
    };
    applyPublicDeckModalChrome('public-deck-import-choice-modal');
    document.getElementById('modal').classList.add('on');
  }

  window.loadPublicDeck = async function loadPublicDeck(id){
    const d = await loadPublicDeckDetail(id).catch(()=>publicDeckById(id));
    if(!d) return;
    showPublicDeckImportChoice(id, d);
  };

  window.rateDeck = function rateDeck(id){
    viewPublicDeckComments(id);
  };
  window.submitRating = async function submitRating(id, stars){
    const u = user();
    if(!u){ if(window.toast) toast('Sign in first'); return; }
    if(publicDeckApiEnabled()){
      const data = await flyApiRequest(`/api/public-decks/${encodeURIComponent(id)}/rating`, {
        method:'POST',
        body:{uid:authUid() || u.uid, username:profileName(), stars:Number(stars)}
      }).catch(e=>{
        console.warn('Fly rating failed', e);
        if(window.toast) toast('Rating failed');
        return null;
      });
      if(!data) return;
      const deck = normalizePublicDeck(data.deck || {});
      publicDeckDetailCache.set(deck.deckId || deck.id, deck);
      publicDecks = publicDecks.map(d=>(d.id === id || d.deckId === id) ? normalizePublicDeck({...d, ...deck, ids:[]}) : d);
      if(window.toast) toast('Rating submitted');
      viewPublicDeckComments(id);
      return;
    }
    if(!canUseFirebase()){ if(window.toast) toast('Online economy is not ready'); return; }
    await FO.set(FO.ref(FO.rtdb, `publicDeckRatings/${id}/${u.uid}`), { uid:u.uid, username:profileName(), stars:Number(stars), timestamp:Date.now(), createdAt:FO.serverTimestamp() }).catch(function(e){ console.warn('Rating failed', e); });
    const deck = await loadPublicDeckDetail(id).catch(()=>publicDeckById(id));
    const ratings = Array.isArray(deck?.ratings) ? deck.ratings : [];
    const ratingAvg = ratings.length ? ratings.reduce((sum,r)=>sum + Number(r.stars || 0), 0) / ratings.length : 0;
    await FO.update(FO.ref(FO.rtdb, `publicDeckSummaries/${id}`), { ratingAvg, ratingCount:ratings.length, updatedAt:FO.serverTimestamp() }).catch(()=>{});
    if(window.toast) toast('Rating submitted');
    viewPublicDeckComments(id);
  };
  window.postComment = async function postComment(id){
    const inp = document.getElementById('pd-comment-inp');
    const text = String(inp?.value || '').trim();
    if(!text){ if(window.toast) toast('Comment cannot be empty'); return; }
    const u = user();
    if(!u){ if(window.toast) toast('Sign in first'); return; }
    if(publicDeckApiEnabled()){
      const data = await flyApiRequest(`/api/public-decks/${encodeURIComponent(id)}/comments`, {
        method:'POST',
        body:{uid:authUid() || u.uid, username:profileName(), text:text.slice(0,240)}
      }).catch(e=>{
        console.warn('Fly comment failed', e);
        if(window.toast) toast('Comment failed');
        return null;
      });
      if(!data) return;
      const deck = normalizePublicDeck(data.deck || {});
      publicDeckDetailCache.set(deck.deckId || deck.id, deck);
      publicDecks = publicDecks.map(d=>(d.id === id || d.deckId === id) ? normalizePublicDeck({...d, ...deck, ids:[]}) : d);
      const inCommentWindow = !!document.querySelector('#modal .public-deck-comments-modal');
      setTimeout(()=>inCommentWindow ? viewPublicDeckComments(id) : viewPublicDeck(id), 150);
      return;
    }
    if(!canUseFirebase()){ if(window.toast) toast('Online economy is not ready'); return; }
    await FO.push(FO.ref(FO.rtdb, `publicDeckComments/${id}`), { uid:u.uid, username:profileName(), text:text.slice(0,240), timestamp:Date.now(), createdAt:FO.serverTimestamp() }).catch(e=>console.warn('Comment failed', e));
    const deck = await loadPublicDeckDetail(id).catch(()=>publicDeckById(id));
    const commentCount = Array.isArray(deck?.comments) ? deck.comments.length : Number(deck?.commentCount || 0) + 1;
    await FO.update(FO.ref(FO.rtdb, `publicDeckSummaries/${id}`), { commentCount, updatedAt:FO.serverTimestamp() }).catch(()=>{});
    const inCommentWindow = !!document.querySelector('#modal .public-deck-comments-modal');
    setTimeout(()=>inCommentWindow ? viewPublicDeckComments(id) : viewPublicDeck(id), 150);
  };
  window.openShareDeckFlow = function openShareDeckFlow(page=shareDeckPage){
    var allKeys = Object.keys(PRESET_DECKS || {});
    var starterSigs = new Set((Array.isArray(window.STARTER_DECKS) ? window.STARTER_DECKS : (typeof STARTER_DECKS !== 'undefined' ? STARTER_DECKS : []))
      .map(function(deck){ return JSON.stringify(deck?.ids || []); }));
    var isStarter = function(pid, preset){
      return !!preset?.builtin || /^builtin_starter|^ch_starter/i.test(String(pid||'')) || /^Starter\s*:/i.test(String(preset?.name||'')) || starterSigs.has(JSON.stringify(preset?.ids||[]));
    };
    var keys = allKeys.filter(function(pid){ return !isStarter(pid, PRESET_DECKS?.[pid]); });
    if(!keys.length){ if(window.toast) toast(allKeys.length ? 'Create a custom preset first' : 'Create a preset first'); return; }
    var pageSize = 6;
    var totalPages = Math.max(1, Math.ceil(keys.length / pageSize));
    shareDeckPage = Math.max(0, Math.min(Number(page) || 0, totalPages - 1));
    var pageKeys = keys.slice(shareDeckPage * pageSize, shareDeckPage * pageSize + pageSize);
    if(typeof resetModalChrome === 'function') resetModalChrome();
    applyPublicDeckModalChrome('share-deck-modal');
    var container = document.createElement('div');
    container.className = 'sd-flow';
    var topbar = document.createElement('div');
    topbar.className = 'sd-topbar';
    topbar.innerHTML = '<div><div class="share-deck-kicker">Community Library</div><h2>Share a Deck</h2></div><button class="btn sm" type="button">Back</button>';
    var topbarBack = topbar.querySelector('button');
    if(topbarBack) topbarBack.onclick = function(){ showPublicDecks(publicDecksPage); };
    container.appendChild(topbar);
    var grid = document.createElement('div');
    grid.className = 'sd-grid';
    pageKeys.forEach(function(pid){
      var p = PRESET_DECKS[pid];
      var ok = p.ids && p.ids.length === 40;
      var sampleIds = Array.from(new Set(p.ids || []));
      var sampleCards = sampleIds.map(function(id){ return typeof cardById==='function'?cardById(id):CARDS.find(function(c){return c.id===id;}); }).filter(Boolean);
      var hero = p.faceCardId ? (typeof cardById==='function'?cardById(p.faceCardId):null) : (sampleCards.sort(function(a,b){return (b.fate||0)-(a.fate||0);})[0] || null);
      var displayCards = (p.displayCardIds && p.displayCardIds.length
        ? p.displayCardIds.map(function(id){ return typeof cardById==='function'?cardById(id):null; }).filter(function(c){ return c&&c.img; })
        : sampleCards.filter(function(c){ return c.img; })
      ).slice(0,4);
      var tile = document.createElement('div');
      tile.className = 'sd-tile' + (ok ? '' : ' sd-tile-disabled');
      var heroImg = hero && hero.img ? '<img src="'+esc(hero.img)+'" onerror="this.style.display=\'none\'">' : '';
      var minis = displayCards.map(function(c){ return '<div class="sd-mini">'+(c.img?'<img src="'+esc(c.img)+'">':'')+'</div>'; }).join('');
      tile.innerHTML = '<div class="sd-tile-art">' + heroImg + '</div>'
        + '<div class="sd-tile-body">'
        +   '<div class="sd-tile-name">' + esc(p.name) + '</div>'
        +   '<div class="sd-tile-desc">' + esc(p.description || 'No description.') + '</div>'
        +   '<div class="sd-tile-footer">'
        +     '<div class="sd-tile-minis">' + minis + '</div>'
        +     '<div class="sd-tile-meta">' + sampleIds.length + ' unique &middot; ' + (p.ids||[]).length + ' cards</div>'
        +     (ok ? '<button class="btn sm pri sd-publish-btn" type="button">Publish</button>' : '<span class="sd-tile-incomplete">Incomplete</span>')
        +   '</div>'
        + '</div>';
      if(ok){
        var btn = tile.querySelector('.sd-publish-btn');
        if(btn) btn.onclick = (function(p2){ return function(e){ e.preventDefault(); e.stopPropagation(); window.shareDeck(p2, e.currentTarget); }; })(pid);
        tile.onclick = (function(p2, tileEl){ return function(e){ if(e && e.target && e.target.closest && e.target.closest('button')) return; window.shareDeck(p2, tileEl.querySelector('.sd-publish-btn')); }; })(pid, tile);
        tile.style.cursor = 'pointer';
      }
      grid.appendChild(tile);
    });
    for(var i=pageKeys.length; i<pageSize; i++){
      var ph = document.createElement('div');
      ph.className = 'sd-tile sd-placeholder';
      ph.setAttribute('aria-hidden','true');
      grid.appendChild(ph);
    }
    container.appendChild(grid);
    var pager = document.createElement('div');
    pager.className = 'sd-pager';
    pager.innerHTML = '<button class="btn sm" type="button" ' + (shareDeckPage<=0?'disabled':'') + '>Prev</button>'
      + '<span>Page ' + (shareDeckPage + 1) + ' / ' + totalPages + ' &middot; ' + keys.length + ' decks</span>'
      + '<button class="btn sm" type="button" ' + (shareDeckPage>=totalPages-1?'disabled':'') + '>Next</button>';
    var pagerBtns = pager.querySelectorAll('button');
    if(pagerBtns[0]) pagerBtns[0].onclick = function(){ openShareDeckFlow(shareDeckPage - 1); };
    if(pagerBtns[1]) pagerBtns[1].onclick = function(){ openShareDeckFlow(shareDeckPage + 1); };
    container.appendChild(pager);
    document.getElementById('modal-body').innerHTML = '';
    document.getElementById('modal-body').appendChild(container);
    document.getElementById('modal-title').textContent = '';
    document.getElementById('modal-acts').innerHTML = '';
    applyPublicDeckModalChrome('share-deck-modal');
    document.getElementById('modal').classList.add('on');
  };
  window.shareDeck = async function shareDeck(pid, trigger){
    const p = PRESET_DECKS?.[pid];
    if(!p) return;
    if(trigger){
      trigger.disabled = true;
      trigger.textContent = 'Publishing...';
    }
    let deckId = null;
    try{
      deckId = await publishDeck({
        sourcePid:pid,
        name:p.name,
        description:p.description || '',
        ids:[...(p.ids || [])],
        faceCardId:p.faceCardId || '',
        displayCardIds:p.displayCardIds || [],
        timestamp:Date.now()
      });
    }catch(e){
      console.error('Publish deck failed', e);
      if(window.toast) toast('Could not share deck');
    }
    if(!deckId && trigger){
      trigger.disabled = false;
      trigger.textContent = 'Publish';
    }
    if(!deckId) return;
    if(trigger) trigger.textContent = 'Published!';
    showPublicDecks(publicDecksPage);
  };

  if(FO.onAuth) FO.onAuth(s=>{ if(!s.user) stopWatchers(); });
  window.addEventListener('fate-online-auth', e=>{ if(!e.detail?.user) stopWatchers(); });

  window.FateOnline = Object.assign(window.FateOnline || {}, {
    publishDeck,
    listMarketplaceCard,
    listMarketplacePfp,
    ensureMarketplaceFeed:()=>ensureWatchers('marketplace'),
    ensurePublicDeckFeed:()=>ensureWatchers('publicDecks'),
    getMarketplaceListings:()=>marketplaceListings,
    getPublicDecks:()=>publicDecks
  });
})();
