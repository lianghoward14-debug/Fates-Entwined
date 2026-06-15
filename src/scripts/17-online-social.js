// FATES ENTWINED ONLINE SOCIAL V1.8
// Stable Social integration over RTDB publicProfiles/friends/presence.
// Wires RTDB friends/profiles plus existing World Chat and DM UI; does not add new panels.
(function(){
  const FO = window.FateOnline || {};
  let friends = {};
  let requests = {};
  let onlineUids = [];
  let threads = {};
  let onlineParty = null;
  let partyInvites = {};
  let activePartyId = '';
  let dmPeerUid = null;
  let profileMap = new Map();
  let unsubFriends = null, unsubReq = null, unsubPresence = null, unsubThreads = null;
  let unsubPartyInvites = null, unsubUserParty = null, unsubPartyState = null;
  let currentUid = null;
  let profileUnsubs = new Map();
  let renderTimer = null;
  let renderPendingWhileHidden = false;
  let socialRenderDirty = true;
  let renderSeq = 0;
  let lastHtml = '';
  let onlinePage = 0;
  let lastPartyMemberCount = -1;
  const ONLINE_PAGE_SIZE = 40;

  function esc(s){ return FO.escapeHtml ? FO.escapeHtml(s) : String(s||'').replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]||c)); }
  function getUser(){ try{return FO.requireUser();}catch(e){ return null; } }
  function nameOf(p){ return FO.profileName ? FO.profileName(p) : (p?.chosenUsername || p?.displayName || p?.username || p?.baseCode || 'Player'); }
  function photoOf(p){ return FO.profilePhoto ? FO.profilePhoto(p) : (p?.photoURL || p?.profileImg || 'blank.png'); }
  function fallback(uid){ return { uid, chosenUsername:'Player', displayName:'Player', username:'Player', baseCode:FO.makeBaseCode?FO.makeBaseCode(uid):uid, photoURL:'blank.png', level:1, challengerElo:600, bio:'' }; }
  function profileOf(uid){ return profileMap.get(uid) || (FO.profileCache && FO.profileCache.get(uid)) || fallback(uid); }
  function socialSfx(type){
    try{
      if(typeof window.playSfx === 'function') window.playSfx(type || 'uiClick');
      else if(typeof playSfx === 'function') playSfx(type || 'uiClick');
    }catch(e){}
  }

  // Tell the base game's existing chat code not to persist or simulate world chat locally.
  window.FATE_ONLINE_CHAT_MODE = true;
  window.FATE_ONLINE_WORLD_CHAT = Array.isArray(window.FATE_ONLINE_WORLD_CHAT) ? window.FATE_ONLINE_WORLD_CHAT : [];

  // Small approved notification banner for incoming chat/messages.
  let lastOnlineNoticeAt = 0;
  let threadsInitialLoaded = false;
  let partyInvitesInitialLoaded = false;
  let seenPartyInviteIds = new Set();
  let partyDisconnectArmedFor = '';
  let suppressPartyDisbandNoticeUntil = 0;
  let lastPartySystemNotice = { text:'', at:0 };
  let lastThreadSeenAt = new Map();
  function showOnlineNotice(title, text, photo){
    const now = Date.now();
    if(now - lastOnlineNoticeAt < 10000) return; // one banner max per 10 seconds
    lastOnlineNoticeAt = now;
    let wrap = document.getElementById('fate-online-notices');
    if(!wrap){
      wrap = document.createElement('div');
      wrap.id = 'fate-online-notices';
      wrap.className = 'fate-online-notices';
      document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    el.className = 'fate-online-notice';
    el.innerHTML = `<div class="fate-online-notice-pic"><img src="${esc(photo||'blank.png')}" onerror="this.onerror=null;this.src='blank.png';"></div><div class="fate-online-notice-copy"><div class="fate-online-notice-title">${esc(title)}</div><div class="fate-online-notice-text">${esc(text)}</div></div>`;
    wrap.appendChild(el);
    requestAnimationFrame(()=>el.classList.add('show'));
    setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(), 350); }, 4200);
  }
  function showPartyInviteNotice(fromUid){
    const p = profileOf(fromUid);
    let wrap = document.getElementById('fate-online-notices');
    if(!wrap){
      wrap = document.createElement('div');
      wrap.id = 'fate-online-notices';
      wrap.className = 'fate-online-notices';
      document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    el.className = 'fate-online-notice fate-party-invite-notice';
    el.innerHTML = `<div class="fate-online-notice-pic"><img src="${esc(photoOf(p)||'blank.png')}" onerror="this.onerror=null;this.src='blank.png';"></div>
      <div class="fate-online-notice-copy">
        <div class="fate-online-notice-title">Party Request</div>
        <div class="fate-online-notice-text">${esc(nameOf(p))} invited you to a party.</div>
        <div class="fate-party-invite-actions">
          <button type="button" class="btn sm pri" onclick="event.stopPropagation();window.acceptOnlinePartyInvite('${esc(fromUid)}');this.closest('.fate-online-notice')?.remove();">Accept</button>
          <button type="button" class="btn sm" onclick="event.stopPropagation();window.declineOnlinePartyInvite('${esc(fromUid)}');this.closest('.fate-online-notice')?.remove();">Decline</button>
        </div>
      </div>`;
    wrap.appendChild(el);
    requestAnimationFrame(()=>el.classList.add('show'));
    setTimeout(()=>{ if(el.isConnected){ el.classList.remove('show'); setTimeout(()=>el.remove(), 350); } }, 15000);
  }
  function showPartySystemNotice(text){
    const now = Date.now();
    const msg = text || 'Your party was disbanded.';
    if(now < suppressPartyDisbandNoticeUntil) return;
    if(lastPartySystemNotice.text === msg && now - lastPartySystemNotice.at < 3000) return;
    lastPartySystemNotice = { text:msg, at:now };
    let wrap = document.getElementById('fate-online-notices');
    if(!wrap){
      wrap = document.createElement('div');
      wrap.id = 'fate-online-notices';
      wrap.className = 'fate-online-notices';
      document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    el.className = 'fate-online-notice fate-party-system-notice';
    el.innerHTML = `<div class="fate-online-notice-pic fate-party-system-mark">!</div><div class="fate-online-notice-copy"><div class="fate-online-notice-title">Party Disbanded</div><div class="fate-online-notice-text">${esc(msg)}</div></div>`;
    wrap.appendChild(el);
    requestAnimationFrame(()=>el.classList.add('show'));
    setTimeout(()=>{ if(el.isConnected){ el.classList.remove('show'); setTimeout(()=>el.remove(), 350); } }, 5200);
  }
  function handleThreadNotifications(nextThreads){
    const u = window.FATE_ONLINE?.user;
    if(!u) return;
    Object.entries(nextThreads || {}).forEach(([peerUid, t])=>{
      const lastAt = Number(t?.lastAt || 0) || 0;
      const unread = Number(t?.unread || 0) || 0;
      const prevAt = lastThreadSeenAt.get(peerUid) || 0;
      lastThreadSeenAt.set(peerUid, Math.max(prevAt, lastAt));
      if(!threadsInitialLoaded || unread <= 0 || lastAt <= prevAt || peerUid === dmPeerUid) return;
      const p = profileOf(peerUid);
      showOnlineNotice(`Message from ${nameOf(p)}`, String(t?.lastText || 'New message').slice(0,80), photoOf(p));
    });
    threadsInitialLoaded = true;
  }

  function scheduleRender(){
    socialRenderDirty = true;
    if(window.FateMenuViews) window.FateMenuViews.invalidate('onlineSocial');
    syncTopPendingBadge();
    if(document.hidden || window.__fatePageHidden){
      renderPendingWhileHidden = true;
      return;
    }
    if(!document.getElementById('s-social')?.classList.contains('active')) return;
    clearTimeout(renderTimer);
    renderTimer = setTimeout(()=>renderSocialPage(), 120);
  }
  function forceSocialRender(){
    syncTopPendingBadge();
    clearTimeout(renderTimer);
    socialRenderDirty = true;
    if(window.FateMenuViews) window.FateMenuViews.invalidate('onlineSocial');
    lastHtml = '';
    if(document.getElementById('s-social')?.classList.contains('active')) renderSocialPage();
  }
  function friendRequestsBody(){
    const reqUids = Object.keys(requests || {});
    return reqUids.length
      ? `<div class="online-request-modal-list">${reqUids.map(requestRow).join('')}</div>`
      : '<div class="online-empty online-request-empty">No pending requests.</div>';
  }
  function refreshFriendRequestsModal(){
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    if(!title || !body || !/^Friend Requests/.test(title.textContent || '')) return;
    const reqUids = Object.keys(requests || {});
    title.textContent = `Friend Requests (${reqUids.length})`;
    body.innerHTML = friendRequestsBody();
  }
  document.addEventListener('visibilitychange', ()=>{
    if(!document.hidden && renderPendingWhileHidden){
      renderPendingWhileHidden = false;
      scheduleRender();
    }
  });
  function syncTopPendingBadge(){
    window.FATE_ONLINE_PENDING_FRIEND_REQUEST_COUNT = Object.keys(requests || {}).length;
    if(typeof window.updatePendingBadge === 'function') {
      try{ window.updatePendingBadge(); }catch(e){}
    }
  }
  function socialStateSig(){
    const u = window.FATE_ONLINE?.user;
    const partyMembers = onlineParty?.members ? Object.keys(onlineParty.members).sort().join(',') : '';
    return [
      u?.uid || 'signed-out',
      onlinePage,
      Object.keys(friends || {}).sort().join(','),
      Object.keys(requests || {}).sort().join(','),
      onlineUids.slice().sort().join(','),
      activePartyId || '',
      partyMembers,
      Object.keys(partyInvites || {}).sort().join(',')
    ].join('|');
  }
  function ensureOnlineSocialView(){
    if(!window.FateMenuViews) return;
    window.FateMenuViews.register('onlineSocial', {
      root:'#social-content',
      signature:socialStateSig,
      render:()=>renderSocialPage()
    });
  }
  function cleanupProfileSubs(keepSet){
    for(const [uid, unsub] of profileUnsubs.entries()){
      if(keepSet && keepSet.has(uid)) continue;
      try{ unsub(); }catch(e){}
      profileUnsubs.delete(uid);
    }
  }
  function ensureProfileSub(uid){
    if(!uid || profileUnsubs.has(uid)) return;
    // Put a placeholder in the map before subscribing. Some RTDB listeners
    // can invoke their first callback immediately, and without this guard the
    // callback can re-enter renderSocialPage() -> ensureProfileSub() recursively.
    profileUnsubs.set(uid, ()=>{});
    if(FO.subscribeProfile){
      const unsub = FO.subscribeProfile(uid, p=>{
        profileMap.set(uid, p || fallback(uid));
        scheduleRender();
      });
      profileUnsubs.set(uid, unsub || (()=>{}));
    }else if(FO.getPublicProfile){
      FO.getPublicProfile(uid).then(p=>{ profileMap.set(uid, p || fallback(uid)); scheduleRender(); }).catch(()=>{});
    }
  }
  function resetWatchers(){
    try{ if(unsubFriends) unsubFriends(); }catch(e){}
    try{ if(unsubReq) unsubReq(); }catch(e){}
    try{ if(unsubPresence) unsubPresence(); }catch(e){}
    try{ if(unsubThreads) unsubThreads(); }catch(e){}
    try{ if(unsubPartyInvites) unsubPartyInvites(); }catch(e){}
    try{ if(unsubUserParty) unsubUserParty(); }catch(e){}
    try{ if(unsubPartyState) unsubPartyState(); }catch(e){}
    unsubFriends = unsubReq = unsubPresence = unsubThreads = null;
    unsubPartyInvites = unsubUserParty = unsubPartyState = null;
    cleanupProfileSubs();
    friends = {}; requests = {}; onlineUids = []; threads = {}; partyInvites = {}; onlineParty = null; activePartyId = ''; profileMap = new Map(); lastHtml = ''; socialRenderDirty = true;
    syncTopPendingBadge();
    window.FATE_ONLINE_PARTY = null;
    partyDisconnectArmedFor = '';
    partyInvitesInitialLoaded = false;
    seenPartyInviteIds = new Set();
    lastPartyMemberCount = -1;
  }
  function armPartyDisconnect(partyId, partyData){
    const u = window.FATE_ONLINE?.user;
    if(!u || !partyId || !FO.rtdb || !FO.ref || !FO.onDisconnect || partyDisconnectArmedFor === partyId) return;
    partyDisconnectArmedFor = partyId;
    FO.onDisconnect(FO.ref(FO.rtdb, `userParties/${u.uid}`)).remove().catch(()=>{});
    FO.onDisconnect(FO.ref(FO.rtdb, `parties/${partyId}`)).remove().catch(()=>{});
  }
  function partyMemberUids(partyData, extraUid){
    const members = { ...(partyData?.members || {}) };
    if(extraUid) members[extraUid] = members[extraUid] || { uid:extraUid };
    return Object.keys(members).filter(Boolean);
  }
  function partyCleanupUpdates(partyId, partyData, extraUid){
    const members = partyMemberUids(partyData, extraUid);
    const updates = { [`parties/${partyId}`]: null };
    members.forEach(uid=>{ updates[`userParties/${uid}`] = null; });
    members.forEach(a=>{
      members.forEach(b=>{
        if(a === b) return;
        updates[`partyInvites/${a}/${b}`] = null;
        updates[`sentPartyInvites/${b}/${a}`] = null;
      });
    });
    return updates;
  }
  function clearLocalPartyState(){
    if(onlineParty && Object.keys(onlineParty.members || {}).length > 0) socialSfx('menuClose');
    try{ if(unsubPartyState) unsubPartyState(); }catch(e){}
    unsubPartyState = null;
    onlineParty = null;
    activePartyId = '';
    partyDisconnectArmedFor = '';
    window.FATE_ONLINE_PARTY = null;
    lastPartyMemberCount = 0;
  }
  async function disbandParty(partyId, partyData, reason, opts={}){
    const u = window.FATE_ONLINE?.user;
    const id = String(partyId || activePartyId || onlineParty?.partyId || '');
    const data = partyData || onlineParty || {};
    if(!id){
      clearLocalPartyState();
      forceSocialRender();
      return;
    }
    if(opts.silent) suppressPartyDisbandNoticeUntil = Date.now() + 1800;
    if(id && FO.rtdb && FO.update){
      await FO.update(FO.ref(FO.rtdb), partyCleanupUpdates(id, data, u?.uid)).catch(e=>console.warn('Party disband failed', e));
    }
    clearLocalPartyState();
    forceSocialRender();
    if(!opts.silent) showPartySystemNotice(reason || 'Your party was disbanded.');
  }
  function handlePartyInviteNotifications(nextInvites){
    Object.keys(nextInvites || {}).forEach(fromUid=>{
      ensureProfileSub(fromUid);
      if(seenPartyInviteIds.has(fromUid)) return;
      seenPartyInviteIds.add(fromUid);
      if(!partyInvitesInitialLoaded) return;
      showPartyInviteNotice(fromUid);
    });
    partyInvitesInitialLoaded = true;
  }
  function watchActiveParty(partyId){
    try{ if(unsubPartyState) unsubPartyState(); }catch(e){}
    unsubPartyState = null;
    activePartyId = partyId || '';
    if(!partyId){
      onlineParty = null;
      window.FATE_ONLINE_PARTY = null;
      scheduleRender();
      return;
    }
    unsubPartyState = FO.onValue(FO.ref(FO.rtdb, `parties/${partyId}`), snap=>{
      const data = snap.val();
      const u = window.FATE_ONLINE?.user;
      if(!data || !u || !data.members || !data.members[u.uid]){
        const hadParty = !!(onlineParty || activePartyId);
        clearLocalPartyState();
        if(u && FO.update) FO.update(FO.ref(FO.rtdb), { [`userParties/${u.uid}`]: null }).catch(()=>{});
        if(hadParty) showPartySystemNotice('Your party was disbanded because a player left.');
      }else{
        const memberUids = Object.keys(data.members || {});
        if(memberUids.length < 2 && (data.paired || lastPartyMemberCount >= 2)){
          disbandParty(partyId, data, 'Party disbanded because a player left.').catch(()=>{});
          return;
        }
        onlineParty = { partyId, ...data };
        Object.keys(onlineParty.members || {}).forEach(ensureProfileSub);
        window.FATE_ONLINE_PARTY = onlineParty;
        armPartyDisconnect(partyId, data);
        const memberCount = Object.keys(onlineParty.members || {}).length;
        if(lastPartyMemberCount >= 0 && memberCount !== lastPartyMemberCount) socialSfx(memberCount > lastPartyMemberCount ? 'menuOpen' : 'menuClose');
        lastPartyMemberCount = memberCount;
      }
      scheduleRender();
    }, err=>console.warn('Party subscription failed', err));
  }
  function watchSocial(){
    const u = window.FATE_ONLINE?.user;
    if(!u || !FO.rtdb){
      if(currentUid){ resetWatchers(); currentUid = null; }
      scheduleRender();
      return;
    }
    if(currentUid === u.uid && unsubFriends && unsubReq && unsubPresence && unsubPartyInvites && unsubUserParty) return;
    resetWatchers();
    currentUid = u.uid;
    ensureProfileSub(u.uid);
    unsubFriends = FO.onValue(FO.ref(FO.rtdb, `friends/${u.uid}`), snap=>{
      friends = snap.val() || {};
      Object.keys(friends).forEach(ensureProfileSub);
      scheduleRender();
    });
    unsubReq = FO.onValue(FO.ref(FO.rtdb, `friendRequests/${u.uid}`), snap=>{
      requests = snap.val() || {};
      Object.keys(requests).forEach(ensureProfileSub);
      syncTopPendingBadge();
      scheduleRender();
    });
    unsubPresence = FO.onValue(FO.query(FO.ref(FO.rtdb, 'presence'), FO.orderByChild('online'), FO.equalTo(true), FO.limitToFirst(40)), snap=>{
      const pres = snap.val() || {};
      onlineUids = Object.keys(pres);
      const keep = new Set([u.uid, ...Object.keys(friends), ...Object.keys(requests), ...onlineUids]);
      keep.forEach(ensureProfileSub);
      cleanupProfileSubs(keep);
      scheduleRender();
    });
    unsubThreads = FO.onValue(FO.ref(FO.rtdb, `privateThreads/${u.uid}`), snap=>{
      const nextThreads = snap.val() || {};
      handleThreadNotifications(nextThreads);
      threads = nextThreads;
      scheduleRender();
    }, err=>console.warn('Private thread subscription failed', err));
    unsubPartyInvites = FO.onValue(FO.ref(FO.rtdb, `partyInvites/${u.uid}`), snap=>{
      const nextInvites = snap.val() || {};
      handlePartyInviteNotifications(nextInvites);
      partyInvites = nextInvites;
      Object.keys(partyInvites).forEach(ensureProfileSub);
      scheduleRender();
    }, err=>console.warn('Party invite subscription failed', err));
    unsubUserParty = FO.onValue(FO.ref(FO.rtdb, `userParties/${u.uid}`), snap=>{
      const partyId = String(snap.val() || '');
      if(partyId !== activePartyId) watchActiveParty(partyId);
    }, err=>console.warn('User party subscription failed', err));
  }
  if(FO.onAuth) FO.onAuth(watchSocial);
  window.addEventListener('fate-online-auth', watchSocial);

  async function lookupPlayer(term){
    const raw = String(term||'').trim();
    if(!raw) return null;
    const up = raw.toUpperCase();
    if(up.startsWith('FATE-')){
      const uid = (await FO.get(FO.ref(FO.rtdb, `friendInviteCodes/${up}`))).val();
      if(uid) return { uid, profile: await FO.getPublicProfile(uid).catch(()=>null) };
    }
    const lower = FO.normalizeUsername ? FO.normalizeUsername(raw) : raw.toLowerCase();
    const qsnap = await FO.get(FO.query(FO.ref(FO.rtdb, 'publicProfiles'), FO.orderByChild('usernameLower'), FO.equalTo(lower), FO.limitToFirst(5)));
    const val = qsnap.val() || {};
    const uid = Object.keys(val)[0];
    return uid ? { uid, profile: val[uid] } : null;
  }

  async function addFriendFromInput(){
    const inp = document.getElementById('social-add-input');
    const term = inp?.value || '';
    const u = getUser(); if(!u) return;
    const found = await lookupPlayer(term).catch(e=>{ console.error(e); return null; });
    if(!found || !found.uid){ if(window.toast) toast('Player not found'); return; }
    if(found.uid === u.uid){ if(window.toast) toast('That is your own player ID'); return; }
    const payload = { fromUid:u.uid, toUid:found.uid, status:'pending', createdAt:FO.serverTimestamp(), fromName:nameOf(window.FATE_ONLINE?.profile), fromCode:window.FATE_ONLINE?.baseCode || '' };
    await FO.update(FO.ref(FO.rtdb), {
      [`friendRequests/${found.uid}/${u.uid}`]: payload,
      [`sentFriendRequests/${u.uid}/${found.uid}`]: payload
    });
    if(inp) inp.value='';
    if(window.toast) toast('Friend request sent');
  }
  async function acceptFriend(fromUid){
    const u = getUser(); if(!u) return;
    const now = FO.serverTimestamp();
    delete requests[fromUid];
    friends[fromUid] = { uid:fromUid, createdAt:Date.now() };
    refreshFriendRequestsModal();
    forceSocialRender();
    await FO.update(FO.ref(FO.rtdb), {
      [`friends/${u.uid}/${fromUid}`]: { uid:fromUid, createdAt:now },
      [`friends/${fromUid}/${u.uid}`]: { uid:u.uid, createdAt:now },
      [`friendRequests/${u.uid}/${fromUid}`]: null,
      [`sentFriendRequests/${fromUid}/${u.uid}`]: null
    });
    if(window.toast) toast('Friend added');
  }
  async function declineFriend(fromUid){
    const u = getUser(); if(!u) return;
    delete requests[fromUid];
    refreshFriendRequestsModal();
    forceSocialRender();
    await FO.update(FO.ref(FO.rtdb), { [`friendRequests/${u.uid}/${fromUid}`]: null, [`sentFriendRequests/${fromUid}/${u.uid}`]: null });
  }
  async function removeFriend(friendUid){
    const u = getUser(); if(!u) return;
    await FO.update(FO.ref(FO.rtdb), { [`friends/${u.uid}/${friendUid}`]: null, [`friends/${friendUid}/${u.uid}`]: null });
    if(window.toast) toast('Friend removed');
  }

  async function inspectOnlineProfile(uid){
    ensureProfileSub(uid);
    const p = profileOf(uid);
    const code = p.baseCode || (FO.makeBaseCode ? FO.makeBaseCode(uid) : uid);
    const isFriend = !!friends[uid];
    const elo = Number(p.challengerElo || 600) || 600;
    const level = Number(p.level || 1) || 1;
    const humanWins = Number(p.humanWins ?? p.wins ?? 0) || 0;
    const humanLosses = Number(p.humanLosses ?? p.losses ?? 0) || 0;
    const matchesPlayed = Number(p.matchesPlayed ?? ((Number(p.challengerWins||0)||0) + (Number(p.challengerLosses||0)||0) + (Number(p.wins||0)||0) + (Number(p.losses||0)||0))) || 0;
    const rankFrame = typeof window.getRankFrameStyle === 'function' ? window.getRankFrameStyle(elo, 'icon') : '';
    const rankHtml = typeof window.renderRankBadge === 'function' ? window.renderRankBadge(elo, 'lg') : `<span class="rank-badge rank-lg"><span class="rank-badge-label">${esc(p.rank || 'Footman')}</span></span>`;
    const levelHtml = typeof window.renderLevelBadge === 'function'
      ? window.renderLevelBadge(level).replace('level-badge','level-badge profile-level-badge')
      : `<span class="level-badge profile-level-badge"><span class="lb-copy"><span class="lb-core"><span class="lb-label">LEVEL</span><span class="lb-lv">${level}</span></span></span></span>`;
    showModal('Player Profile', `
      <div class="profile-wrap title-profile-modal-v2 inspected-profile-stable">
        <div class="profile-left-col">
          <div class="profile-img-wrap" style="${rankFrame}">
            <img src="${esc(photoOf(p))}" alt="" onerror="this.onerror=null;this.src='blank.png';">
          </div>
        </div>
        <div class="profile-info">
          <div class="inspected-profile-headline">
            <div class="profile-name">${esc(nameOf(p))}</div>
            <div class="online-profile-code-chip">${esc(code)}</div>
          </div>
          <div class="profile-rank-row profile-rank-level-row">${rankHtml}${levelHtml}</div>
          <div class="profile-bio${p.bio ? '' : ' empty'}">${esc(p.bio || 'No bio set yet.')}</div>
          <div class="profile-stats">
            <div class="profile-stat elo"><div class="ps-label">Challenger ELO</div><div class="ps-value">${elo}</div></div>
            <div class="profile-stat"><div class="ps-label">Human Record</div><div class="ps-value" style="font-size:.9rem;">${humanWins}W / ${humanLosses}L</div></div>
            <div class="profile-stat"><div class="ps-label">Matches Played</div><div class="ps-value">${matchesPlayed}</div></div>
          </div>
        </div>
      </div>`, [
      ...(isFriend ? [{label:'Message', pri:true, action:()=>{ closeModal(); window.openOnlineDirectMessage(uid); }}] : []),
      {label:'Close', action:closeModal}
    ]);
    const modalBox = document.querySelector('#modal .modal');
    if(modalBox) modalBox.classList.add('title-profile-modal','inspected-profile-modal-stable');
  }

  function friendRow(uid){
    const p = profileOf(uid);
    const unread = Number(threads?.[uid]?.unread || 0) || 0;
    const elo = Number(p.challengerElo || 600) || 600;
    const frameStyle = typeof window.getRankFrameStyle === 'function' ? window.getRankFrameStyle(elo, 'icon') : '';
    return `<div class="social-friend-row" onclick="window.inspectOnlineProfile('${esc(uid)}')">
      <div class="social-friend-pic" style="${frameStyle}"><img src="${esc(photoOf(p))}" style="width:100%;height:100%;object-fit:cover;" onerror="this.onerror=null;this.src='blank.png';"></div>
      <div class="social-friend-info"><div class="social-friend-name">${esc(nameOf(p))}</div><div class="social-friend-meta">${Number(p.challengerElo||600)} ELO · ${esc(p.baseCode||'')}</div></div>
      <div class="social-friend-actions"><button class="btn sm online-dm-button" onclick="event.stopPropagation();window.openOnlineDirectMessage('${esc(uid)}');" title="Message">💬${unread>0?`<span class="online-dm-unread-dot">${unread>9?'9+':unread}</span>`:''}</button><button class="btn sm" onclick="event.stopPropagation();window.inviteOnlineParty('${esc(uid)}');" title="Invite to Party">🎮</button><button class="btn sm danger" onclick="event.stopPropagation();window.removeOnlineFriend('${esc(uid)}')">×</button></div>
    </div>`;
  }
  function requestRow(uid){
    const p = profileOf(uid);
    return `<div class="social-online-row online-request-row"><div class="social-online-pic"><img src="${esc(photoOf(p))}" onerror="this.onerror=null;this.src='blank.png';"></div><div class="social-online-info"><div>${esc(nameOf(p))}</div><div>${esc(p.baseCode||'')}</div></div><button class="btn sm pri" onclick="event.stopPropagation();this.closest('.online-request-row')?.classList.add('is-resolving');window.acceptOnlineFriend('${esc(uid)}')">Accept</button><button class="btn sm" onclick="event.stopPropagation();this.closest('.online-request-row')?.classList.add('is-resolving');window.declineOnlineFriend('${esc(uid)}')">Decline</button></div>`;
  }
  function onlineCard(uid){
    const p = profileOf(uid);
    const isSelf = uid === window.FATE_ONLINE?.user?.uid;
    const elo = Number(p.challengerElo || 600) || 600;
    const rankHtml = typeof window.renderRankBadge === 'function'
      ? window.renderRankBadge(elo, 'md')
      : `<span class="rank-badge rank-md"><span class="rank-badge-label">${esc(p.rank || 'Footman')}</span></span>`;
    const frameStyle = typeof window.getRankFrameStyle === 'function' ? window.getRankFrameStyle(elo, 'icon') : '';
    const code = p.baseCode || (FO.makeBaseCode ? FO.makeBaseCode(uid) : '');
    return `<div class="social-online-card" onclick="window.inspectOnlineProfile('${esc(uid)}')">
      ${isSelf
        ? `<div class="social-online-card-self">You</div>`
        : `<button class="social-online-card-add" onclick="event.stopPropagation();document.getElementById('social-add-input').value='${esc(p.baseCode||'')}';window.socialAddFriendFromInput();" title="Add Friend">+</button>`}
      <div class="social-online-card-pic" style="${frameStyle}"><img src="${esc(photoOf(p))}" onerror="this.onerror=null;this.src='blank.png';"><span class="social-status-dot"></span></div>
      <div class="social-online-card-title"><span class="social-online-card-name">${esc(nameOf(p))}</span></div>
      <div class="social-online-card-meta"><span>${elo} ELO</span><span>${esc(code)}</span></div>
      <div class="social-online-card-rank">${rankHtml}</div>
    </div>`;
  }

  function partyMemberRow(uid, status){
    const p = profileOf(uid);
    const leader = onlineParty && uid === onlineParty.leaderUid;
    return `<div class="party-member-clean">
      <div class="party-member-avatar"><img src="${esc(photoOf(p))}" onerror="this.onerror=null;this.src='blank.png';"></div>
      <div class="party-member-copy"><strong>${esc(nameOf(p))}</strong><span>${esc(status || (leader ? 'Leader' : 'Ready'))}</span></div>
      ${leader ? '<div class="party-member-tag">Leader</div>' : ''}
    </div>`;
  }
  function partyInviteRow(uid){
    const p = profileOf(uid);
    return `<div class="social-online-row online-party-request">
      <div class="social-online-pic"><img src="${esc(photoOf(p))}" onerror="this.onerror=null;this.src='blank.png';"></div>
      <div class="social-online-info"><div>${esc(nameOf(p))}</div><div>Party request</div></div>
      <button type="button" class="btn sm pri" onclick="event.stopPropagation();window.acceptOnlinePartyInvite('${esc(uid)}')">Accept</button>
      <button type="button" class="btn sm" onclick="event.stopPropagation();window.declineOnlinePartyInvite('${esc(uid)}')">Decline</button>
    </div>`;
  }
  function renderOnlinePartyPanel(){
    const u = window.FATE_ONLINE?.user;
    if(!u){
      return '<div class="online-empty">Sign in to use parties.</div>';
    }
    const inviteHtml = '';
    if(!onlineParty){
      return `<div class="party-panel-clean party-empty-clean">
        ${inviteHtml}
        <div class="party-empty-mark">II</div>
        <div class="party-status-clean">No active party</div>
        <div class="party-copy-clean">Create a two-player party, then enter the same queue to match only with that party member.</div>
      <div class="party-actions-clean"><button type="button" class="btn sm pri" onclick="window.createOnlineParty()">Create Party</button></div>
      </div>`;
    }
    const members = { ...(onlineParty.members || {}) };
    if(u && activePartyId && !members[u.uid]){
      members[u.uid] = { uid:u.uid, status:onlineParty.leaderUid === u.uid ? 'Leader' : 'Ready', joinedAt:Date.now() };
    }
    const memberRows = Object.keys(members).map(uid=>partyMemberRow(uid, members[uid]?.status));
    while(memberRows.length < 2){
      memberRows.push(`<div class="party-member-clean party-member-empty">
        <div class="party-member-avatar party-member-avatar-empty"></div>
        <div class="party-member-copy"><strong>Open Seat</strong><span>Invite a friend</span></div>
      </div>`);
    }
    const rows = memberRows.join('');
    return `<div class="party-panel-clean party-active-clean">
      <div class="party-roster-clean">${rows}</div>
      ${inviteHtml}
      <div class="party-actions-clean"><button type="button" class="btn sm danger online-party-leave" onclick="window.leaveOnlineParty()">Leave Party</button></div>
    </div>`;
  }
  async function createOnlineParty(){
    socialSfx('uiClick');
    const u = getUser(); if(!u) return;
    if(!FO.rtdb || !FO.ref || !FO.set){ if(window.toast) toast('Party service is not ready'); return null; }
    const partyId = `party_${u.uid}`;
    const partyData = {
      leaderUid:u.uid,
      members:{ [u.uid]:{uid:u.uid,status:'Leader', joinedAt:FO.serverTimestamp ? FO.serverTimestamp() : Date.now()} },
      createdAt:FO.serverTimestamp ? FO.serverTimestamp() : Date.now(),
      updatedAt:FO.serverTimestamp ? FO.serverTimestamp() : Date.now()
    };
    try{
      await FO.set(FO.ref(FO.rtdb, `parties/${partyId}`), partyData);
    }catch(e){
      console.warn('Party create failed', e);
      if(window.toast) toast('Could not create party - Firebase party permissions need updating');
      return null;
    }
    if(FO.update){
      const updates = { [`userParties/${u.uid}`]: partyId };
      Object.keys(partyInvites || {}).forEach(fromUid=>{
        updates[`partyInvites/${u.uid}/${fromUid}`] = null;
        updates[`sentPartyInvites/${fromUid}/${u.uid}`] = null;
      });
      FO.update(FO.ref(FO.rtdb), updates).catch(e=>console.warn('Party bookkeeping update failed', e));
    }
    onlineParty = { partyId, ...partyData, members:{ [u.uid]:{uid:u.uid,status:'Leader', joinedAt:Date.now()} } };
    window.FATE_ONLINE_PARTY = onlineParty;
    activePartyId = partyId;
    lastPartyMemberCount = 1;
    watchActiveParty(partyId);
    armPartyDisconnect(partyId, onlineParty);
    forceSocialRender();
    if(window.toast) toast('Party created');
    return onlineParty;
  }
  async function ensureOnlineParty(){
    if(onlineParty && activePartyId) return onlineParty;
    return await createOnlineParty();
  }
  async function inviteOnlineParty(uid){
    socialSfx('uiClick');
    const u = getUser(); if(!u) return;
    uid = String(uid || '');
    if(!uid || uid === u.uid) return;
    const party = await ensureOnlineParty();
    if(!party) return;
    const memberCount = Object.keys(party.members || {}).length;
    if(!party.members[uid] && memberCount >= 2){ if(window.toast) toast('Party is full'); return; }
    const senderProfile = window.FATE_ONLINE?.profile || {};
    const payload = {
      fromUid:u.uid,
      toUid:uid,
      partyId:party.partyId || activePartyId,
      fromName:nameOf(senderProfile),
      fromPhotoURL:photoOf(senderProfile),
      status:'pending',
      createdAt:FO.serverTimestamp ? FO.serverTimestamp() : Date.now()
    };
    if(!FO.rtdb || !FO.ref || !FO.set){
      if(window.toast) toast('Party service is not ready');
      return;
    }
    try{
      await FO.set(FO.ref(FO.rtdb, `partyInvites/${uid}/${u.uid}`), payload);
    }catch(e){
      console.warn('Party invite failed', e);
      if(window.toast) toast('Party request failed - Firebase party permissions need updating');
      return;
    }
    if(FO.update){
      FO.update(FO.ref(FO.rtdb), {
        [`sentPartyInvites/${u.uid}/${uid}`]: payload,
        [`parties/${payload.partyId}/updatedAt`]: FO.serverTimestamp ? FO.serverTimestamp() : Date.now()
      }).catch(e=>console.warn('Party invite bookkeeping failed', e));
    }
    forceSocialRender();
    if(window.toast) toast('Party request sent');
  }
  async function acceptOnlinePartyInvite(fromUid){
    socialSfx('menuOpen');
    const u = getUser(); if(!u) return;
    const invite = partyInvites?.[fromUid];
    const partyId = invite?.partyId;
    if(!partyId){ if(window.toast) toast('Party request expired'); return; }
    const party = (await FO.get(FO.ref(FO.rtdb, `parties/${partyId}`)).catch(()=>null))?.val();
    if(!party || !party.members){ if(window.toast) toast('Party no longer exists'); return; }
    const members = party.members || {};
    if(!members[u.uid] && Object.keys(members).length >= 2){ if(window.toast) toast('Party is full'); return; }
    if(activePartyId && activePartyId !== partyId) await leaveOnlineParty({silent:true});
    const cleanup = {};
    Object.keys(partyInvites || {}).forEach(uid=>{
      cleanup[`partyInvites/${u.uid}/${uid}`] = null;
      cleanup[`sentPartyInvites/${uid}/${u.uid}`] = null;
    });
    if(!FO.rtdb || !FO.update){ if(window.toast) toast('Party service is not ready'); return; }
    let joined = true;
    await FO.update(FO.ref(FO.rtdb), {
      [`parties/${partyId}/members/${u.uid}`]: { uid:u.uid, status:'Ready', joinedAt:FO.serverTimestamp ? FO.serverTimestamp() : Date.now() },
      [`parties/${partyId}/paired`]: true,
      [`parties/${partyId}/updatedAt`]: FO.serverTimestamp ? FO.serverTimestamp() : Date.now()
    }).catch(e=>{ joined = false; console.warn('Party accept failed', e); });
    if(!joined){ if(window.toast) toast('Could not join party - Firebase party permissions need updating'); return; }
    FO.update(FO.ref(FO.rtdb), {
      ...cleanup,
      [`userParties/${u.uid}`]: partyId,
      [`partyInvites/${u.uid}/${fromUid}`]: null,
      [`sentPartyInvites/${fromUid}/${u.uid}`]: null
    }).catch(e=>console.warn('Party accept bookkeeping failed', e));
    delete partyInvites[fromUid];
    activePartyId = partyId;
    onlineParty = { partyId, ...party, members:{ ...members, [u.uid]:{ uid:u.uid, status:'Ready', joinedAt:Date.now() } } };
    window.FATE_ONLINE_PARTY = onlineParty;
    watchActiveParty(partyId);
    armPartyDisconnect(partyId, onlineParty);
    forceSocialRender();
    if(window.toast) toast('Joined party');
  }
  async function declineOnlinePartyInvite(fromUid){
    socialSfx('menuClose');
    const u = getUser(); if(!u) return;
    await FO.update(FO.ref(FO.rtdb), {
      [`partyInvites/${u.uid}/${fromUid}`]: null,
      [`sentPartyInvites/${fromUid}/${u.uid}`]: null
    }).catch(e=>console.warn('Party decline failed', e));
    delete partyInvites[fromUid];
    forceSocialRender();
  }
  async function leaveOnlineParty(opts={}){
    if(!opts.silent) socialSfx('menuClose');
    const u = getUser();
    const party = onlineParty;
    const partyId = party?.partyId || activePartyId;
    if(partyId){
      await disbandParty(partyId, party, 'Party disbanded because a player left.', opts);
      if(!opts.silent && window.toast) toast('Left party');
      return;
    }
    clearLocalPartyState();
    forceSocialRender();
  }
  function resetPartyBeforePageExit(){
    const u = window.FATE_ONLINE?.user;
    const party = onlineParty;
    const partyId = party?.partyId || activePartyId;
    if(!u || !partyId || !FO.rtdb || !FO.update) return;
    FO.update(FO.ref(FO.rtdb), partyCleanupUpdates(partyId, party, u.uid)).catch(()=>{});
  }
  window.addEventListener('pagehide', resetPartyBeforePageExit);
  window.addEventListener('beforeunload', resetPartyBeforePageExit);

  function shiftOnlinePlayersPage(delta){
    const u = window.FATE_ONLINE?.user;
    const count = Array.from(new Set([u?.uid, ...onlineUids].filter(Boolean))).length;
    const totalPages = Math.max(1, Math.ceil(count / ONLINE_PAGE_SIZE));
    onlinePage = Math.max(0, Math.min(totalPages - 1, onlinePage + delta));
    scheduleRender();
  }

  async function renderSocialPage(){
    const seq = ++renderSeq;
    const content = document.getElementById('social-content');
    if(!content) return;
    watchWorldChat();
    if(content.dataset.socialMounted === '1' && !socialRenderDirty && lastHtml) return;
    const u = window.FATE_ONLINE?.user;
    if(!u){
      const html = `<div class="social-signin-stage"><div class="social-signin-card"><div class="social-signin-orb">G</div><div class="social-signin-title">Google Sign-In Required</div><div class="social-signin-copy">Sign into a Google account to use friends, parties, online players, world chat, and shared decks.</div><button class="btn pri social-signin-btn" onclick="window.fateSignInWithGoogle()">Sign In With Google</button></div></div>`;
      if(lastHtml !== html){ content.innerHTML = html; lastHtml = html; }
      content.dataset.socialMounted = '1';
      socialRenderDirty = false;
      if(window.FateMenuViews) window.FateMenuViews.markFresh('onlineSocial', socialStateSig());
      return;
    }
    watchSocial();
    const friendUids = Object.keys(friends || {});
    const reqUids = Object.keys(requests || {});
    syncTopPendingBadge();
    friendUids.forEach(ensureProfileSub); reqUids.forEach(ensureProfileSub); onlineUids.forEach(ensureProfileSub);
    ensureProfileSub(u.uid);
    const visibleOnlineUids = Array.from(new Set([u.uid, ...onlineUids].filter(Boolean)))
      .sort((a,b)=>{
        if(a === u.uid) return -1;
        if(b === u.uid) return 1;
        return nameOf(profileOf(a)).localeCompare(nameOf(profileOf(b)));
      });
    const totalOnlinePages = Math.max(1, Math.ceil(visibleOnlineUids.length / ONLINE_PAGE_SIZE));
    if(onlinePage > totalOnlinePages - 1) onlinePage = totalOnlinePages - 1;
    if(onlinePage < 0) onlinePage = 0;
    const onlineSlice = visibleOnlineUids.slice(onlinePage * ONLINE_PAGE_SIZE, (onlinePage + 1) * ONLINE_PAGE_SIZE);
    const onlineCards = onlineSlice.map(onlineCard).join('');
    const onlinePager = visibleOnlineUids.length > ONLINE_PAGE_SIZE
      ? `<div class="social-online-pagination"><button class="btn sm" ${onlinePage<=0?'disabled':''} onclick="window.shiftOnlinePlayersPage(-1)">Prev</button><div class="social-online-page-indicator">Page ${onlinePage + 1} / ${totalOnlinePages}</div><button class="btn sm" ${onlinePage>=totalOnlinePages-1?'disabled':''} onclick="window.shiftOnlinePlayersPage(1)">Next</button></div>`
      : `<div class="social-online-page-indicator social-online-page-indicator-static">${visibleOnlineUids.length ? `${visibleOnlineUids.length} online` : 'Only you online'}</div>`;
    const accountChip = `<div class="social-account-chip"><span class="social-account-orb">G</span><span class="social-account-copy"><span>Google Account</span><strong>${esc(window.FATE_ONLINE?.baseCode||'')}</strong></span><button class="btn sm" onclick="window.fateSignOut()">Sign Out</button></div>`;
    const partyCount = onlineParty?.members ? Object.keys(onlineParty.members).length : 0;
    const html = `
      <div class="social-command-center online-social-layout-v20">
        <div class="social-command-hero">
          <div class="social-command-title">
            <span class="social-command-kicker">Online Command</span>
            <strong>${esc(nameOf(window.FATE_ONLINE?.profile || {}))}</strong>
            <span>${esc(window.FATE_ONLINE?.baseCode || '')}</span>
          </div>
          <div class="social-command-stats">
            <div><b>${friendUids.length}</b><span>Friends</span></div>
            <div><b>${visibleOnlineUids.length}</b><span>Online</span></div>
            <div><b>${partyCount}/2</b><span>Party</span></div>
            <div><b>${reqUids.length}</b><span>Requests</span></div>
          </div>
          ${accountChip}
        </div>
        <div class="social-command-grid">
          <section class="social-command-panel social-friends-command">
            <div class="social-panel-head">
              <div><span>Roster</span><strong>Friends</strong></div>
            </div>
            <div class="social-add-console">
              <input type="text" id="social-add-input" placeholder="Friend ID or exact username" maxlength="32">
              <button class="btn sm pri" onclick="window.socialAddFriendFromInput()">Add Friend</button>
            </div>
            <div class="social-friends-list-v20">${friendUids.map(friendRow).join('') || '<div class="online-empty">No friends yet.</div>'}</div>
          </section>
          <aside class="social-command-panel social-online-command online-social-online-panel">
            <div class="social-panel-head">
              <div><span>Live</span><strong>Online Players</strong></div>
              <em>${visibleOnlineUids.length ? `${visibleOnlineUids.length} active` : 'Quiet'}</em>
            </div>
            <div class="social-online-card-grid">${onlineCards || '<div class="online-empty social-online-empty-wide">No one else online.</div>'}</div>
            ${onlinePager}
          </aside>
          <aside class="social-command-panel social-party-command online-social-party-panel">
            <div class="social-panel-head">
              <div><span>Squad</span><strong>Party</strong></div>
              <em>${partyCount ? `${partyCount} joined` : ''}</em>
            </div>
            ${renderOnlinePartyPanel()}
          </aside>
        </div>
      </div>`;
    if(seq !== renderSeq) return;
    if(lastHtml !== html){
      const active = document.activeElement;
      const oldVal = active && active.id === 'social-add-input' ? active.value : null;
      content.innerHTML = html;
      lastHtml = html;
      const inp = document.getElementById('social-add-input');
      if(inp){
        if(oldVal != null){ inp.value = oldVal; inp.focus(); }
        inp.onkeydown = e=>{ if(e.key==='Enter') addFriendFromInput(); };
      }
    }
    content.dataset.socialMounted = '1';
    socialRenderDirty = false;
    if(window.FateMenuViews) window.FateMenuViews.markFresh('onlineSocial', socialStateSig());
  }

  function showOnlineFriendRequests(){
    const reqUids = Object.keys(requests || {});
    showModal(`Friend Requests (${reqUids.length})`, friendRequestsBody(), [{label:'Close', action:closeModal}]);
    document.getElementById('modal')?.querySelector('.modal')?.classList.add('friend-requests-modal');
  }

  window.renderSocialPage = renderSocialPage;
  window.showSocial = function(){
    if(typeof showScreen==='function') showScreen('s-social');
    watchSocial();
    ensureOnlineSocialView();
    const content = document.getElementById('social-content');
    if(content?.dataset.socialMounted === '1' && !socialRenderDirty && lastHtml) return;
    if(window.FateMenuViews) window.FateMenuViews.render('onlineSocial');
    else renderSocialPage();
  };
  window.socialAddFriendFromInput = addFriendFromInput;
  window.acceptOnlineFriend = acceptFriend;
  window.declineOnlineFriend = declineFriend;
  window.removeOnlineFriend = removeFriend;
  window.inspectOnlineProfile = inspectOnlineProfile;
  window.showOnlineFriendRequests = showOnlineFriendRequests;
  window.createOnlineParty = createOnlineParty;
  window.inviteOnlineParty = inviteOnlineParty;
  window.acceptOnlinePartyInvite = acceptOnlinePartyInvite;
  window.declineOnlinePartyInvite = declineOnlinePartyInvite;
  window.leaveOnlineParty = leaveOnlineParty;
  window.disbandOnlineParty = function(reason, opts){
    return disbandParty(activePartyId || onlineParty?.partyId, onlineParty, reason || 'Party disbanded.', opts || {});
  };
  window.shiftOnlinePlayersPage = shiftOnlinePlayersPage;
  // ─────────────────────────────────────────────────────────────
  // Existing UI chat bridge
  // Uses the base game's pre-existing World Chat widget and DM modal/classes.
  // No new visible panels are created here.
  // ─────────────────────────────────────────────────────────────
  let unsubWorldChat = null;
  let dmMessages = [];
  let unsubDm = null;
  let unsubDmProfile = null;
  let dmShellOpen = false;
  let worldInitialLoaded = false;
  let seenWorldIds = new Set();

  function timestampOf(m){
    const t = m && (m.timestamp || m.clientTime || m.createdAt || 0);
    return typeof t === 'number' ? t : Date.now();
  }
  function currentProfile(){ return window.FATE_ONLINE?.profile || fallback(window.FATE_ONLINE?.user?.uid || ''); }
  function currentName(){ return nameOf(currentProfile()); }
  function currentPhoto(){ return photoOf(currentProfile()); }
  let fpsOverlayRaf = 0;
  let fpsOverlayLast = 0;
  let fpsOverlayFrames = 0;
  let fpsOverlayValue = 0;
  let fpsOverlayWorst = 0;

  function ensureFpsOverlay(){
    let el = document.getElementById('fate-fps-overlay');
    if(!el){
      el = document.createElement('div');
      el.id = 'fate-fps-overlay';
      el.setAttribute('aria-live', 'off');
      el.innerHTML = '<span class="ffo-label">FPS</span><strong class="ffo-value">--</strong><span class="ffo-detail">worst --ms</span>';
      document.body.appendChild(el);
    }
    return el;
  }

  function stopFpsOverlay(){
    if(fpsOverlayRaf) cancelAnimationFrame(fpsOverlayRaf);
    fpsOverlayRaf = 0;
    fpsOverlayLast = 0;
    fpsOverlayFrames = 0;
    fpsOverlayValue = 0;
    fpsOverlayWorst = 0;
    const el = document.getElementById('fate-fps-overlay');
    if(el) el.remove();
    try{ localStorage.setItem('fateShowFpsOverlay', '0'); }catch(e){}
  }

  function startFpsOverlay(){
    const el = ensureFpsOverlay();
    el.classList.add('on');
    try{ localStorage.setItem('fateShowFpsOverlay', '1'); }catch(e){}
    fpsOverlayLast = performance.now();
    fpsOverlayFrames = 0;
    fpsOverlayWorst = 0;
    const tick = function(now){
      const gap = now - fpsOverlayLast;
      fpsOverlayLast = now;
      fpsOverlayFrames += 1;
      if(gap > fpsOverlayWorst) fpsOverlayWorst = gap;
      if(!fpsOverlayValue || now - (window.__fateFpsOverlayWindowStart || 0) >= 500){
        const start = window.__fateFpsOverlayWindowStart || now;
        const elapsed = Math.max(1, now - start);
        fpsOverlayValue = Math.round(fpsOverlayFrames * 1000 / elapsed);
        window.__fateFpsOverlayWindowStart = now;
        fpsOverlayFrames = 0;
        const perf = window.FATE_PERF || {};
        const shownFps = perf.lastFpsEstimate || fpsOverlayValue;
        const worst = Math.max(fpsOverlayWorst, Number(perf.worstFrameMs || 0) || 0);
        el.querySelector('.ffo-value').textContent = String(shownFps);
        el.querySelector('.ffo-detail').textContent = 'worst ' + Math.round(worst) + 'ms';
        el.classList.toggle('bad', shownFps > 0 && shownFps < 25);
        el.classList.toggle('ok', shownFps >= 50);
        fpsOverlayWorst = 0;
      }
      fpsOverlayRaf = requestAnimationFrame(tick);
    };
    if(fpsOverlayRaf) cancelAnimationFrame(fpsOverlayRaf);
    window.__fateFpsOverlayWindowStart = performance.now();
    fpsOverlayRaf = requestAnimationFrame(tick);
  }

  function toggleFpsOverlay(){
    if(document.getElementById('fate-fps-overlay')) {
      stopFpsOverlay();
      if(window.toast) toast('FPS counter off');
      return;
    }
    startFpsOverlay();
    if(window.toast) toast('FPS counter on');
  }

  function worldChatIsOpen(){
    const widget = document.getElementById('world-chat-widget');
    const panel = document.getElementById('world-chat-panel');
    return !!(widget?.classList.contains('is-open') || (panel && panel.style.display !== 'none' && panel.getAttribute('aria-hidden') !== 'true'));
  }

  let worldChatRenderTimer = 0;
  function scheduleWorldChatRender(force=false){
    if(typeof window.renderWorldChatMessages !== 'function') return;
    const socialOpen = document.getElementById('s-social')?.classList.contains('active');
    if(!force && !worldChatIsOpen() && !socialOpen) return;
    if(worldChatRenderTimer) return;
    worldChatRenderTimer = setTimeout(function(){
      worldChatRenderTimer = 0;
      try{ window.renderWorldChatMessages(); }catch(e){ console.warn('world chat render failed', e); }
    }, 120);
  }

  function clearLocalFakeWorldChat(){
    window.FATE_ONLINE_CHAT_MODE = true;
    window.FATE_ONLINE_WORLD_CHAT = Array.isArray(window.FATE_ONLINE_WORLD_CHAT) ? window.FATE_ONLINE_WORLD_CHAT : [];
    if(window.SOCIAL){
      window.SOCIAL.worldChat = [];
      try{ if(typeof window.saveSocial === 'function') window.saveSocial(); }catch(e){}
    }
    try{
      const stored = JSON.parse(localStorage.getItem('fate_social') || '{}');
      if(Array.isArray(stored.worldChat) && stored.worldChat.length){
        stored.worldChat = [];
        localStorage.setItem('fate_social', JSON.stringify(stored));
      }
    }catch(e){}
    scheduleWorldChatRender(true);
  }

  function watchWorldChat(){
    const u = window.FATE_ONLINE?.user;
    if(!u || !FO.rtdb){
      try{ if(unsubWorldChat) unsubWorldChat(); }catch(e){}
      unsubWorldChat = null;
      worldInitialLoaded = false;
      seenWorldIds = new Set();
      return;
    }
    if(unsubWorldChat) return;
    clearLocalFakeWorldChat();
    unsubWorldChat = FO.onValue(FO.query(FO.ref(FO.rtdb, 'worldChat'), FO.orderByChild('createdAt'), FO.limitToLast(100)), snap=>{
      const val = snap.val() || {};
      const arr = Object.entries(val).map(([id,m])=>({
        id,
        uid: m.uid || m.fromUid || '',
        from: m.from || m.name || m.chosenUsername || 'Player',
        text: String(m.text || '').slice(0,240),
        timestamp: timestampOf(m),
        photoURL: m.photoURL || m.profileImg || null
      })).filter(m=>m.text);
      arr.sort((a,b)=>a.timestamp-b.timestamp);

      if(worldInitialLoaded){
        for(const m of arr){
          if(seenWorldIds.has(m.id)) continue;
          seenWorldIds.add(m.id);
          if(false && m.uid && m.uid !== window.FATE_ONLINE?.user?.uid && !worldChatIsOpen()){
            showOnlineNotice(`World Chat · ${m.from}`, m.text.slice(0,80), m.photoURL || 'blank.png');
            break;
          }
        }
      }else{
        arr.forEach(m=>seenWorldIds.add(m.id));
        worldInitialLoaded = true;
      }

      if(seenWorldIds.size > 500) seenWorldIds = new Set(arr.slice(-100).map(m=>m.id));
      window.FATE_ONLINE_WORLD_CHAT = arr.slice(-100);
      if(window.SOCIAL) window.SOCIAL.worldChat = [];
      scheduleWorldChatRender();
    }, err=>console.warn('World chat subscription failed', err));
  }

  async function sendWorldChatOnline(){
    watchWorldChat();
    const sideInput = document.getElementById('sp-wc-input');
    const inp = document.getElementById('wc-input');
    if(sideInput && sideInput.value.trim() && inp){
      inp.value = sideInput.value;
      sideInput.value = '';
    }
    if(!inp) return;
    const text = String(inp.value || '').trim();
    if(!text) return;
    if(typeof window.handleFateChatCommand === 'function' && window.handleFateChatCommand(text)){
      inp.value = '';
      return;
    }
    const u = getUser();
    if(!u) return;
    if(text.toLowerCase() === '/run' && typeof window.runAISimulations === 'function'){
      inp.value = '';
      window.runAISimulations();
      return;
    }
    if(text.toLowerCase() === '/fps'){
      inp.value = '';
      toggleFpsOverlay();
      return;
    }
    const p = currentProfile();
    const payload = {
      uid: u.uid,
      fromUid: u.uid,
      from: nameOf(p),
      name: nameOf(p),
      photoURL: photoOf(p),
      text: text.slice(0,240),
      timestamp: Date.now(),
      createdAt: FO.serverTimestamp()
    };
    const oldText = inp.value;
    inp.value = '';
    window.FATE_WORLD_CHAT_FORCE_BOTTOM_ON_NEXT_RENDER = true;
    try{
      await FO.push(FO.ref(FO.rtdb, 'worldChat'), payload);
      if(typeof window.playSfx === 'function') window.playSfx('uiClick');
    }catch(e){
      window.FATE_WORLD_CHAT_FORCE_BOTTOM_ON_NEXT_RENDER = false;
      inp.value = oldText;
      console.error('World chat send failed', e);
      if(window.toast) toast('World chat failed to send');
    }
  }

  function closeDmSub(){
    try{ if(unsubDm) unsubDm(); }catch(e){}
    try{ if(unsubDmProfile) unsubDmProfile(); }catch(e){}
    unsubDm = unsubDmProfile = null;
    dmPeerUid = null;
    dmMessages = [];
    dmShellOpen = false;
  }

  function dmMessageHtml(m, peer){
    const isMe = m.uid === window.FATE_ONLINE?.user?.uid || m.fromUid === window.FATE_ONLINE?.user?.uid;
    const senderName = isMe ? currentName() : (m.from || nameOf(peer));
    const senderPic = isMe ? currentPhoto() : (m.photoURL || photoOf(peer));
    return `<div class="social-dm ${isMe ? 'social-dm-me' : 'social-dm-them'}">
      <div class="social-dm-avatar"><img src="${esc(senderPic || 'blank.png')}" style="width:100%;height:100%;object-fit:cover;" onerror="this.onerror=null;this.src='blank.png';"></div>
      <div class="social-dm-bubble">
        <div class="social-dm-name">${esc(senderName)}</div>
        <div class="social-dm-text">${esc(m.text || '')}</div>
        <div class="social-dm-time">${new Date(timestampOf(m)).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
      </div>
    </div>`;
  }

  function renderDmMessagesOnly(){
    if(!dmPeerUid) return;
    const box = document.getElementById('social-dm-box');
    if(!box) return;
    const peer = profileOf(dmPeerUid);
    box.innerHTML = dmMessages.length
      ? dmMessages.map(m=>dmMessageHtml(m, peer)).join('')
      : '<div style="text-align:center;padding:2rem;color:var(--dim);font-style:italic;">No messages yet. Say hello!</div>';
    box.scrollTop = box.scrollHeight;
    const headerName = document.querySelector('.social-dm-header-name');
    const headerMeta = document.querySelector('.social-dm-header-meta');
    const headerPic = document.querySelector('.social-dm-header-pic img');
    if(headerName) headerName.textContent = nameOf(peer);
    if(headerMeta) headerMeta.textContent = `${Number(peer.challengerElo || 600)} ELO · ${peer.baseCode || ''}`;
    if(headerPic) headerPic.src = photoOf(peer);
  }

  function renderDirectMessageModal(forceShell=false){
    if(!dmPeerUid) return;
    const peer = profileOf(dmPeerUid);
    const peerName = nameOf(peer);
    const peerPic = photoOf(peer);
    const peerElo = Number(peer.challengerElo || 600);
    const modal = document.getElementById('modal');
    const bodyEl = document.getElementById('modal-body');
    const titleEl = document.getElementById('modal-title');
    const actsEl = document.getElementById('modal-acts');
    if(!modal || !bodyEl || !titleEl || !actsEl) return;

    if(!dmShellOpen || forceShell || !document.getElementById('dm-input')){
      bodyEl.innerHTML = `
        <div class="social-dm-header">
          <div class="social-dm-header-pic" style="${typeof window.getRankFrameStyle==='function'?window.getRankFrameStyle(peerElo,'icon'):''}"><img src="${esc(peerPic)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.onerror=null;this.src='blank.png';"></div>
          <div class="social-dm-header-info">
            <div class="social-dm-header-name">${esc(peerName)}</div>
            <div class="social-dm-header-meta">${peerElo} ELO · ${peer.baseCode ? esc(peer.baseCode) : ''}</div>
          </div>
        </div>
        <div class="social-chat-box" id="social-dm-box"></div>
        <div class="social-chat-input-row">
          <button class="social-emoji-toggle" id="dm-emoji-toggle" title="Emoji">😀</button>
          <input type="text" class="social-chat-input" id="dm-input" placeholder="Type a message..." maxlength="200" autocomplete="off">
          <button class="btn sm pri" id="dm-send-btn" type="button">Send</button>
        </div>
        <div id="dm-emoji-container" style="display:none;"></div>`;
      titleEl.textContent = `Chat with ${peerName}`;
      actsEl.innerHTML = '';
      const close = document.createElement('button');
      close.className = 'btn sm';
      close.textContent = 'Close';
      close.onclick = ()=>{ closeDmSub(); closeModal(); };
      actsEl.appendChild(close);
      const dmModal = document.querySelector('#modal .modal');
      if(dmModal) Object.assign(dmModal.style, {maxWidth:'820px'});
      modal.classList.add('on');
      const inp = document.getElementById('dm-input');
      const sendBtn = document.getElementById('dm-send-btn');
      if(inp) inp.onkeydown = e=>{ if(e.key==='Enter'){ e.preventDefault(); window.sendDirectMessage(); } };
      if(sendBtn) sendBtn.onclick = ()=>window.sendDirectMessage();
      const emojiToggle = document.getElementById('dm-emoji-toggle');
      const emojiContainer = document.getElementById('dm-emoji-container');
      if(emojiToggle && emojiContainer && typeof window.renderEmojiPicker === 'function'){
        emojiToggle.onclick = ()=>{
          if(emojiContainer.style.display === 'none'){
            emojiContainer.style.display = 'block';
            emojiContainer.innerHTML = '';
            emojiContainer.appendChild(window.renderEmojiPicker(emoji=>{
              const i = document.getElementById('dm-input');
              if(i) i.value += emoji;
              emojiContainer.style.display = 'none';
              if(i) i.focus();
            }));
          }else emojiContainer.style.display = 'none';
        };
      }
      dmShellOpen = true;
      if(inp) setTimeout(()=>inp.focus(),0);
    }
    renderDmMessagesOnly();
  }

  function openOnlineDirectMessage(peerUid){
    const u = getUser(); if(!u || !peerUid) return;
    socialSfx('menuOpen');
    closeDmSub();
    dmPeerUid = peerUid;
    dmShellOpen = false;
    ensureProfileSub(peerUid);
    FO.update(FO.ref(FO.rtdb, `privateThreads/${u.uid}/${peerUid}`), { unread:0 }).catch(()=>{});
    unsubDmProfile = FO.subscribeProfile ? FO.subscribeProfile(peerUid, p=>{ profileMap.set(peerUid, p || fallback(peerUid)); renderDmMessagesOnly(); }) : null;
    const dmRef = FO.ref(FO.rtdb, `privateMessages/${u.uid}/${peerUid}/messages`);
    const dmTarget = (FO.query && FO.orderByChild && FO.limitToLast)
      ? FO.query(dmRef, FO.orderByChild('createdAt'), FO.limitToLast(80))
      : dmRef;
    unsubDm = FO.onValue(dmTarget, snap=>{
      const val = snap.val() || {};
      dmMessages = Object.entries(val).map(([id,m])=>Object.assign({id}, m)).filter(m=>m.text);
      dmMessages.sort((a,b)=>timestampOf(a)-timestampOf(b));
      dmMessages = dmMessages.slice(-80);
      renderDirectMessageModal(false);
      const threadUnread = Number(threads?.[peerUid]?.unread || 0) || 0;
      if(threadUnread > 0) FO.update(FO.ref(FO.rtdb, `privateThreads/${u.uid}/${peerUid}`), { unread:0 }).catch(()=>{});
    }, err=>console.warn('Private message subscription failed', err));
    renderDirectMessageModal(true);
  }

  async function sendDirectMessageOnline(){
    const u = getUser(); if(!u || !dmPeerUid) return;
    const inp = document.getElementById('dm-input');
    const text = String(inp?.value || '').trim();
    if(!text) return;
    const p = currentProfile();
    const msgId = FO.push(FO.ref(FO.rtdb, `privateMessages/${u.uid}/${dmPeerUid}/messages`)).key;
    const now = Date.now();
    const payload = {
      id: msgId,
      uid: u.uid,
      fromUid: u.uid,
      toUid: dmPeerUid,
      from: nameOf(p),
      photoURL: photoOf(p),
      text: text.slice(0,240),
      timestamp: now,
      createdAt: FO.serverTimestamp()
    };
    if(inp) inp.value = '';
    try{
      const peerUnread = Number(threads?.[dmPeerUid]?.unread || 0) || 0;
      await FO.update(FO.ref(FO.rtdb), {
        [`privateMessages/${u.uid}/${dmPeerUid}/messages/${msgId}`]: payload,
        [`privateMessages/${dmPeerUid}/${u.uid}/messages/${msgId}`]: payload,
        [`privateThreads/${u.uid}/${dmPeerUid}`]: { peerUid:dmPeerUid, lastText:payload.text, lastAt:now, unread:0 },
        [`privateThreads/${dmPeerUid}/${u.uid}`]: { peerUid:u.uid, lastText:payload.text, lastAt:now, unread:peerUnread + 1 }
      });
      if(typeof window.playSfx === 'function') window.playSfx('uiClick');
    }catch(e){
      if(inp) inp.value = text;
      console.error('Private message send failed', e);
      if(window.toast) toast('Message failed to send');
    }
  }

  function installWorldChatHandlers(){
    const inp = document.getElementById('wc-input');
    if(inp){
      inp._fateOnlineChatBound = true;
      inp.onkeydown = e=>{ if(e.key==='Enter'){ e.preventDefault(); window.sendWorldChat(); } };
    }
    const panel = document.getElementById('world-chat-panel');
    if(panel){
      const sendBtn = Array.from(panel.querySelectorAll('button')).find(b=>(b.textContent||'').trim().toLowerCase()==='send');
      if(sendBtn){
        sendBtn._fateOnlineChatBound = true;
        sendBtn.onclick = ()=>window.sendWorldChat();
      }
    }
  }

  function patchExistingChatUi(){
    // Keep the existing functions/buttons, only replace their data source.
    window.FATE_ONLINE_SEND_WORLD_CHAT = sendWorldChatOnline;
    window.sendWorldChat = sendWorldChatOnline;
    window.openOnlineDirectMessage = openOnlineDirectMessage;
    window.sendDirectMessage = sendDirectMessageOnline;
    if(!window._fateOnlineBaseOpenDirectMessage && typeof window.openDirectMessage === 'function' && !window.openDirectMessage._fateOnlineWrapped){
      window._fateOnlineBaseOpenDirectMessage = window.openDirectMessage;
    }
    const wrappedOpen = function(identifier){
      const text = String(identifier || '');
      const friendUid = Object.keys(friends || {}).find(uid=>{
        const p = profileOf(uid);
        return uid === text || nameOf(p) === text || p.baseCode === text;
      });
      if(friendUid) return openOnlineDirectMessage(friendUid);
      const base = window._fateOnlineBaseOpenDirectMessage;
      if(typeof base === 'function') return base(identifier);
      if(window.toast) toast('Player not found');
    };
    wrappedOpen._fateOnlineWrapped = true;
    window.openDirectMessage = wrappedOpen;
    clearLocalFakeWorldChat();
    if(!window._fateOnlineBaseToggleWorldChat && typeof window.toggleWorldChat === 'function' && !window.toggleWorldChat._fateOnlineWrapped){
      window._fateOnlineBaseToggleWorldChat = window.toggleWorldChat;
      window.toggleWorldChat = function(){
        watchWorldChat();
        return window._fateOnlineBaseToggleWorldChat.apply(this, arguments);
      };
      window.toggleWorldChat._fateOnlineWrapped = true;
    }
    installWorldChatHandlers();
  }

  // Repatch after auth and after DOM-created existing world chat widget is available.
  let _chatPatchScheduled = false;
  function scheduleChatPatch(){
    if(_chatPatchScheduled) return;
    _chatPatchScheduled = true;
    setTimeout(()=>{ patchExistingChatUi(); _chatPatchScheduled = false; }, 0);
    setTimeout(patchExistingChatUi, 300);
    setTimeout(patchExistingChatUi, 1200);
  }
  if(FO.onAuth) FO.onAuth(s=>{
    if(!s?.user) watchWorldChat();
    scheduleChatPatch();
  });
  window.addEventListener('DOMContentLoaded', scheduleChatPatch);
  scheduleChatPatch();

})();
