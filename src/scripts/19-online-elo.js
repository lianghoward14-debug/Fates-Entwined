
// FATES ENTWINED ONLINE ELO V1
// Online leaderboard bridge. The authority API owns shared AI and leaderboard
// state whenever it is configured; RTDB remains the legacy fallback path.
(function(){
  const FO = window.FateOnline || {};
  let leaderboard = {};
  let lbUnsub = null;
  let sharedAISimulationTimer = null;
  let sharedAISyncTimer = null;
  let flyLeaderboardFetchInFlight = null;
  let flyLeaderboardFetchedAt = 0;
  let flyRosterSeedInFlight = null;
  let flyRosterSeededAt = 0;
  const ONLINE_LEADERBOARD_LIMIT = 100;
  const SHARED_AI_RECORD_SCHEMA_VERSION = 5;

  function esc(s){ return FO.escapeHtml ? FO.escapeHtml(s) : String(s||'').replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function user(){ return window.FATE_ONLINE?.user; }
  function authUid(){ return String(user()?.uid || FO.auth?.currentUser?.uid || ''); }
  function profile(){ return window.FATE_ONLINE?.profile || {}; }
  function localProfile(){ try{ if(typeof window.getFateLocalProfile === 'function') return window.getFateLocalProfile() || {}; }catch(e){} return window.USER_PROFILE || {}; }
  function nameOf(p){ return FO.profileName ? FO.profileName(p) : (p?.chosenUsername||p?.displayName||p?.username||p?.baseCode||'Player'); }
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
  function flyLeaderboardEnabled(){
    return !!authorityHttpBaseUrl();
  }
  function rtdbDisabledMode(){
    return localStorageFlag('fateRtdbDisabled') || window.FATE_RTDB_DISABLED === true;
  }
  function firebaseLeaderboardAllowed(){
    return !rtdbDisabledMode() && !!(FO.rtdb && FO.ref);
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
      throw new Error('Fly authority API failed: ' + res.status + (text ? ' ' + text.slice(0, 160) : ''));
    }
    return await res.json();
  }
  async function fetchFlyLeaderboard(opts={}){
    if(!flyLeaderboardEnabled()) return leaderboard;
    const force = !!(opts && opts.force);
    if(!force && flyLeaderboardFetchedAt && Date.now() - flyLeaderboardFetchedAt < 30000) return leaderboard;
    if(flyLeaderboardFetchInFlight) return flyLeaderboardFetchInFlight;
    flyLeaderboardFetchInFlight = flyApiRequest(`/api/leaderboards/challenger?limit=${ONLINE_LEADERBOARD_LIMIT}&monthKey=${encodeURIComponent(currentMonthKey())}`)
      .then(data=>{
        const next = {};
        (Array.isArray(data?.leaderboard) ? data.leaderboard : []).forEach(entry=>{
          const uid = entry?.uid || entry?.username || entry?.name;
          if(!uid) return;
          const isAI = isAIRecord(entry) || !!(entry.isAI || entry.aiId || /^monthly_|^preset_/i.test(String(uid || '')));
          const stats = isAI ? normalizedAIRecordStats(entry) : {wins:recordWins(entry), losses:recordLosses(entry), matchesPlayed:Number(entry.matchesPlayed || 0) || 0};
          const wins = stats.wins;
          const losses = stats.losses;
          next[uid] = {
            uid:entry.uid || uid,
            name:entry.name || entry.username || 'Player',
            username:entry.username || entry.name || 'Player',
            baseCode:entry.baseCode || '',
            photoURL:entry.photoURL || entry.profileImg || 'blank.png',
            profileImg:entry.profileImg || entry.photoURL || 'blank.png',
            elo:Number(entry.challengerElo ?? entry.elo ?? 600) || 600,
            wins,
            losses,
            challengerWins:wins,
            challengerLosses:losses,
            matchesPlayed:stats.matchesPlayed,
            aiId:entry.aiId || '',
            trueElo:Number(entry.trueElo || 0) || 0,
            isAI,
            isMonthly:!!entry.isMonthly,
            monthKey:entry.monthKey || '',
            seededWinRate:Number(entry.seededWinRate || 0) || 0,
            seededMatches:Number(entry.seededMatches || 0) || 0,
            generationVersion:Number(entry.generationVersion || 0) || 0,
            recordSchemaVersion:isAI ? Math.max(SHARED_AI_RECORD_SCHEMA_VERSION, Number(entry.recordSchemaVersion || 0) || 0) : (Number(entry.recordSchemaVersion || 0) || 0),
            updatedAt:Number(entry.updatedAt || Date.now()) || Date.now(),
            isOnline:true,
            source:'fly-authority'
          };
        });
        leaderboard = next;
        flyLeaderboardFetchedAt = Date.now();
        window.FATE_ONLINE_LEADERBOARD = leaderboard;
        try{ if(document.getElementById('ch-leaderboard-list') && typeof window.renderLeaderboard === 'function') window.renderLeaderboard(); }catch(e){}
        return leaderboard;
      })
      .catch(e=>{
        console.warn('Fly leaderboard fetch failed', e);
        return leaderboard;
      })
      .finally(()=>{ flyLeaderboardFetchInFlight = null; });
    return flyLeaderboardFetchInFlight;
  }
  function currentMonthKey(){
    try{ if(typeof window.getMonthKey === 'function') return window.getMonthKey(); }catch(e){}
    const d = new Date();
    return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
  }
  function currentDayKey(){ return new Date().toISOString().slice(0,10); }
  function recordWins(entry){
    if(entry && entry.challengerWins !== undefined) return Math.max(0, Number(entry.challengerWins || 0) || 0);
    return Math.max(0, Number(entry?.wins || 0) || 0);
  }
  function recordLosses(entry){
    if(entry && entry.challengerLosses !== undefined) return Math.max(0, Number(entry.challengerLosses || 0) || 0);
    return Math.max(0, Number(entry?.losses || 0) || 0);
  }
  function isAIRecord(entry){
    const uid = String(entry?.uid || entry?.aiId || entry?.username || entry?.name || '');
    return !!(entry && (entry.isAI || entry.aiId || /^monthly_|^preset_/i.test(uid)));
  }
  function hasSeedMetadata(entry){
    return !!(entry && (
      entry.isMonthly ||
      Number(entry.seededWinRate || 0) ||
      Number(entry.seededMatches || 0) ||
      Number(entry.generationVersion || 0) ||
      Number(entry.recordSchemaVersion || 0)
    ));
  }
  function hasStaleSeedRecord(entry){
    if(!isAIRecord(entry) || !hasSeedMetadata(entry)) return false;
    if(entry?.source === 'fly-authority') return false;
    const wins = recordWins(entry);
    const losses = recordLosses(entry);
    const total = wins + losses;
    const schema = Number(entry.recordSchemaVersion || 0) || 0;
    const seededMatches = Number(entry.seededMatches || 0) || 0;
    return schema < SHARED_AI_RECORD_SCHEMA_VERSION && !losses && total > 0 && total <= Math.max(6, seededMatches || 0);
  }
  function normalizedAIRecordStats(entry){
    if(hasStaleSeedRecord(entry)) return {wins:0, losses:0, matchesPlayed:0};
    const wins = recordWins(entry);
    const losses = recordLosses(entry);
    return {wins, losses, matchesPlayed:Math.max(Number(entry?.matchesPlayed || 0) || 0, wins + losses)};
  }
  function hashInt(s){
    let h = 2166136261;
    const str = String(s || '');
    for(let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function slug(s){
    return String(s || 'ai').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,48) || 'ai';
  }
  function seededRng(seed){
    let t = hashInt(seed);
    return function(){
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }
  function minEloDelta(rawChange, didWin){
    if(typeof window.applyMinimumEloDelta === 'function') return window.applyMinimumEloDelta(rawChange, didWin);
    let change = Math.round(Number(rawChange) || 0);
    if(didWin && change < 1) change = 1;
    if(!didWin && change > -1) change = -1;
    return change;
  }
  function aiIdFor(ai){
    if(ai?.aiId) return ai.aiId;
    const month = ai?.monthKey || currentMonthKey();
    return `${ai?.isMonthly ? `monthly_${month}` : 'preset'}_${slug(ai?.name || ai?.username || 'ai')}`;
  }
  function leaderboardArray(){
    try{ if(typeof LEADERBOARD !== 'undefined' && Array.isArray(LEADERBOARD)) return LEADERBOARD; }catch(e){}
    return Array.isArray(window.LEADERBOARD) ? window.LEADERBOARD : null;
  }
  function localAIList(){
    try{
      const list = typeof getRandomMatchAIOpponents === 'function'
        ? getRandomMatchAIOpponents()
        : (typeof AI_OPPONENTS !== 'undefined' ? AI_OPPONENTS : window.AI_OPPONENTS);
      return Array.isArray(list) ? list.filter(ai=>ai && ai.name) : [];
    }catch(e){ return []; }
  }
  function localAIRecord(ai){
    try{
      const id = aiIdFor(ai);
      const name = ai?.name || ai?.username || '';
      const entry = (leaderboardArray() || []).find(e=>e && (e.aiId === id || e.username === name || e.name === name));
      const stats = normalizedAIRecordStats(Object.assign({}, entry || {}, ai || {}, {aiId:id, isAI:true}));
      return { wins:stats.wins, losses:stats.losses };
    }catch(e){ return {wins:0, losses:0}; }
  }
  function aiPhoto(ai){
    try{ if(typeof window.getAIProfileImg === 'function') return window.getAIProfileImg(ai, 'circle') || ai?.img || ai?.profileImg || 'blank.png'; }catch(e){}
    return ai?.img || ai?.profileImg || 'blank.png';
  }
  function aiEntry(ai, extra={}){
    const id = extra.aiId || aiIdFor(ai);
    const rec = localAIRecord(ai);
    const hasExplicitWins = Object.prototype.hasOwnProperty.call(extra, 'wins') || Object.prototype.hasOwnProperty.call(extra, 'challengerWins');
    const hasExplicitLosses = Object.prototype.hasOwnProperty.call(extra, 'losses') || Object.prototype.hasOwnProperty.call(extra, 'challengerLosses');
    const hasAIRecordStats = !!(Number(ai?.wins ?? ai?.challengerWins ?? 0) || Number(ai?.losses ?? ai?.challengerLosses ?? 0));
    const isLocalMonthlySeed = !!(ai?.isMonthly && Number(ai?.seededWinRate || 0) && !hasExplicitWins && !hasExplicitLosses && !hasAIRecordStats);
    const rawExplicit = Object.assign({}, ai || {}, extra || {}, {aiId:id, isAI:true});
    const explicitStats = normalizedAIRecordStats(rawExplicit);
    const wins = hasExplicitWins
      ? explicitStats.wins
      : (isLocalMonthlySeed ? 0 : Math.max(Number(ai?.wins ?? 0) || 0, Number(ai?.challengerWins ?? 0) || 0, rec.wins));
    const losses = hasExplicitLosses
      ? explicitStats.losses
      : (isLocalMonthlySeed ? 0 : Math.max(Number(ai?.losses ?? 0) || 0, Number(ai?.challengerLosses ?? 0) || 0, rec.losses));
    return {
      uid:id,
      aiId:id,
      name:String(extra.name || ai?.name || ai?.username || 'AI Opponent'),
      username:String(extra.name || ai?.name || ai?.username || 'AI Opponent'),
      photoURL:extra.photoURL || aiPhoto(ai),
      profileImg:extra.profileImg || extra.photoURL || aiPhoto(ai),
      elo:Math.max(100, Math.round(Number(extra.elo ?? ai?.elo ?? 600) || 600)),
      trueElo:Math.max(100, Math.round(Number(extra.trueElo ?? ai?.trueElo ?? ((Number(ai?.elo)||600)+200)) || 800)),
      wins,
      losses,
      challengerWins:wins,
      challengerLosses:losses,
      matchesPlayed:hasStaleSeedRecord(rawExplicit) ? 0 : Math.max(Number(extra.matchesPlayed ?? ai?.matchesPlayed ?? 0) || 0, wins + losses),
      seededWinRate:Number(extra.seededWinRate ?? ai?.seededWinRate) || 0,
      seededMatches:Number(extra.seededMatches ?? ai?.seededMatches) || 0,
      generationVersion:Number(extra.generationVersion ?? ai?.generationVersion) || 0,
      recordSchemaVersion:Number(extra.recordSchemaVersion ?? ai?.recordSchemaVersion ?? SHARED_AI_RECORD_SCHEMA_VERSION) || SHARED_AI_RECORD_SCHEMA_VERSION,
      isAI:true,
      isMonthly:!!(extra.isMonthly ?? ai?.isMonthly),
      monthKey:extra.monthKey || ai?.monthKey || (ai?.isMonthly ? currentMonthKey() : ''),
      updatedAt:extra.updatedAt || Date.now()
    };
  }
  function findLocalAI(rec){
    const id = rec?.aiId || rec?.uid || '';
    const name = rec?.name || rec?.username || '';
    return localAIList().find(ai=>ai && (ai.aiId === id || ai.name === name));
  }
  function upsertLocalAILeaderboard(rec){
    const board = leaderboardArray();
    if(!board) return;
    const id = rec.aiId || rec.uid || aiIdFor(rec);
    const name = rec.name || rec.username || 'AI Opponent';
    let entry = board.find(e=>e && (e.aiId === id || e.username === name || e.name === name));
    if(!entry){
      entry = {username:name, aiId:id, isAI:true, wins:0, losses:0, profileImg:'blank.png'};
      board.push(entry);
    }
    entry.uid = id;
    entry.aiId = id;
    entry.username = name;
    entry.name = name;
    entry.elo = Math.max(100, Math.round(Number(rec.elo || 600)));
    entry.trueElo = Math.max(100, Math.round(Number(rec.trueElo || entry.trueElo || entry.elo + 200)));
    const stats = normalizedAIRecordStats(rec);
    const wins = stats.wins;
    const losses = stats.losses;
    entry.wins = wins;
    entry.losses = losses;
    entry.challengerWins = wins;
    entry.challengerLosses = losses;
    entry.matchesPlayed = stats.matchesPlayed;
    entry.seededWinRate = Number(rec.seededWinRate || 0) || 0;
    entry.seededMatches = Number(rec.seededMatches || 0) || 0;
    entry.generationVersion = Number(rec.generationVersion || 0) || 0;
    entry.recordSchemaVersion = Number(rec.recordSchemaVersion || SHARED_AI_RECORD_SCHEMA_VERSION) || SHARED_AI_RECORD_SCHEMA_VERSION;
    entry.profileImg = rec.photoURL || rec.profileImg || entry.profileImg || 'blank.png';
    entry.photoURL = entry.profileImg;
    entry.isAI = true;
    entry.isMonthly = !!rec.isMonthly;
  }
  function applySharedAIRecord(raw){
    if(!raw) return;
    const rec = aiEntry(raw, raw);
    const local = findLocalAI(rec);
    if(local){
      local.aiId = rec.aiId;
      local.elo = rec.elo;
      local.trueElo = rec.trueElo;
      local.wins = rec.wins;
      local.losses = rec.losses;
      local.challengerWins = rec.challengerWins;
      local.challengerLosses = rec.challengerLosses;
      local.matchesPlayed = rec.matchesPlayed;
      local.recordSchemaVersion = rec.recordSchemaVersion;
      local.generationVersion = rec.generationVersion;
      local.seededMatches = rec.seededMatches;
      local.seededWinRate = rec.seededWinRate;
      local.isMonthly = !!rec.isMonthly;
      if(rec.photoURL) local.profileImg = rec.photoURL;
    }
    if(typeof window.syncAIEloEverywhere === 'function'){
      window.__fateApplyingSharedAI = true;
      try{ window.syncAIEloEverywhere(rec.name, rec.elo); }catch(e){}
      window.__fateApplyingSharedAI = false;
    }
    upsertLocalAILeaderboard(rec);
    try{ if(typeof window.saveLeaderboard === 'function') window.saveLeaderboard(); }catch(e){}
    return rec;
  }
  function flySimulationMatchKey(match){
    if(!match) return '';
    if(match.matchId) return String(match.matchId);
    return [match.timestamp || match.createdAt || '', match.p1 || '', match.p2 || '', match.winner || ''].join('|');
  }
  function normalizeFlySimulationMatch(match){
    if(!match || typeof match !== 'object') return null;
    const p1 = String(match.p1 || match.p1Name || '').trim();
    const p2 = String(match.p2 || match.p2Name || '').trim();
    const winner = String(match.winner || match.winnerName || '').trim();
    if(!p1 || !p2 || !winner) return null;
    const timestamp = Number(match.timestamp || match.createdAt || Date.now()) || Date.now();
    return {
      matchId:String(match.matchId || flySimulationMatchKey({...match, p1, p2, winner, timestamp})),
      p1,
      p2,
      winner,
      p1Change:Number(match.p1Change || 0) || 0,
      p2Change:Number(match.p2Change || 0) || 0,
      p1Elo:Number(match.p1Elo || 0) || 0,
      p2Elo:Number(match.p2Elo || 0) || 0,
      p1Img:match.p1Img || match.p1PhotoURL || match.p1ProfileImg || null,
      p2Img:match.p2Img || match.p2PhotoURL || match.p2ProfileImg || null,
      simulated:true,
      timestamp
    };
  }
  function appendFlySimulationMatches(matches){
    const rows = (Array.isArray(matches) ? matches : [])
      .map(normalizeFlySimulationMatch)
      .filter(Boolean);
    if(!rows.length) return 0;
    let history = [];
    try{ history = JSON.parse(localStorage.getItem('fate_match_history') || '[]'); }catch(e){ history = []; }
    if(!Array.isArray(history)) history = [];
    const seen = new Set(history.map(flySimulationMatchKey).filter(Boolean));
    let added = 0;
    rows.forEach(row=>{
      const key = flySimulationMatchKey(row);
      if(!key || seen.has(key)) return;
      seen.add(key);
      history.push(row);
      added++;
    });
    if(!added) return 0;
    try{ localStorage.setItem('fate_match_history', JSON.stringify(history.slice(-75))); }catch(e){}
    try{ if(window.FateCloudSave) window.FateCloudSave.saveMatchHistory(); }catch(e){}
    return added;
  }
  function dailyTrueEloFor(rec, day=currentDayKey()){
    const base = Math.max(100, Number(rec.trueElo || rec.elo + 200) || 800);
    const variation = (hashInt(`${rec.name || rec.aiId}:${day}`) % 301) - 150;
    return base + variation;
  }
  function aiWinChance(a,b, day=currentDayKey()){
    const expected = 1 / (1 + Math.pow(10, (dailyTrueEloFor(b, day) - dailyTrueEloFor(a, day)) / 400));
    return clamp(expected, 0, 1);
  }
  function seasonPath(){ return `challengerAI/seasons/${currentMonthKey()}`; }
  function sharedAIQueryTarget(){
    const base = FO.ref(FO.rtdb, `${seasonPath()}/ai`);
    return (FO.query && FO.orderByChild && FO.limitToLast)
      ? FO.query(base, FO.orderByChild('elo'), FO.limitToLast(100))
      : base;
  }
  let sharedAIUnsub = null;
  let sharedAISeason = '';

  function buildLocalSharedAIRoster(){
    const records = localAIList().map(ai=>{
      const id = aiIdFor(ai);
      ai.aiId = id;
      return applySharedAIRecord(aiEntry(ai, {aiId:id, updatedAt:Date.now()}));
    }).filter(Boolean);
    window.FATE_SHARED_AI_ROSTER = records;
    try{ if(document.getElementById('ch-leaderboard-list') && typeof window.renderLeaderboard === 'function') window.renderLeaderboard(); }catch(e){}
    return records;
  }

  async function syncMyLeaderboard(){
    const u=user(); if(!u) return;
    if(flyLeaderboardEnabled()){
      await FO.syncPublicProfile?.().catch(()=>{});
      await fetchFlyLeaderboard().catch(()=>{});
      return;
    }
    await FO.syncPublicProfile?.().catch(()=>{});
  }
  async function writeAILeaderboardEntry(rec){
    if(flyLeaderboardEnabled()) return;
    if(!firebaseLeaderboardAllowed() || !rec?.aiId) return;
    await FO.update(FO.ref(FO.rtdb, `leaderboards/challenger/${rec.aiId}`), {
      uid:rec.aiId,
      aiId:rec.aiId,
      name:rec.name,
      username:rec.name,
      photoURL:rec.photoURL || rec.profileImg || 'blank.png',
      profileImg:rec.photoURL || rec.profileImg || 'blank.png',
      elo:Number(rec.elo || 600),
      trueElo:Number(rec.trueElo || rec.elo || 600),
      wins:Number(rec.wins || 0),
      losses:Number(rec.losses || 0),
      seededWinRate:Number(rec.seededWinRate || 0) || 0,
      seededMatches:Number(rec.seededMatches || 0) || 0,
      generationVersion:Number(rec.generationVersion || 0) || 0,
      recordSchemaVersion:Number(rec.recordSchemaVersion || SHARED_AI_RECORD_SCHEMA_VERSION) || SHARED_AI_RECORD_SCHEMA_VERSION,
      isAI:true,
      isMonthly:!!rec.isMonthly,
      monthKey:rec.monthKey || '',
      updatedAt:FO.serverTimestamp()
    });
  }
  async function ensureSharedAIRoster(){
    if(flyLeaderboardEnabled()) return seedFlySharedAIRoster();
    const u=user(); if(!u || !firebaseLeaderboardAllowed()) return [];
    const list = localAIList();
    if(!list.length) return [];
    const basePath = seasonPath();
    const snap = await FO.get(sharedAIQueryTarget()).catch(()=>null);
    const existing = snap?.val() || {};
    const updates = {};
    const applied = [];
    list.forEach(ai=>{
      const id = aiIdFor(ai);
      ai.aiId = id;
      const current = existing[id];
      const seeded = aiEntry(ai, {aiId:id});
      if(current){
        const currentTotal = Number(current.wins || 0) + Number(current.losses || 0);
        const currentLooksStale = hasStaleSeedRecord({...current, aiId:id, isAI:true});
        const needsMonthlySpread = !!(seeded.isMonthly && seeded.generationVersion >= 2 && (
          Number(current.recordSchemaVersion || 0) < Number(seeded.recordSchemaVersion || SHARED_AI_RECORD_SCHEMA_VERSION)
          || Number(current.generationVersion || 0) < seeded.generationVersion
          || currentTotal < 8
        ));
        const needsSeedReset = needsMonthlySpread || currentLooksStale;
        const merged = needsSeedReset ? {
          ...current,
          elo:seeded.elo,
          trueElo:seeded.trueElo,
          wins:seeded.wins,
          losses:seeded.losses,
          challengerWins:seeded.wins,
          challengerLosses:seeded.losses,
          matchesPlayed:0,
          seededWinRate:seeded.seededWinRate,
          seededMatches:seeded.seededMatches,
          generationVersion:seeded.generationVersion,
          recordSchemaVersion:seeded.recordSchemaVersion,
          isMonthly:true,
          monthKey:seeded.monthKey,
          updatedAt:FO.serverTimestamp()
        } : current;
        if(needsSeedReset){
          updates[`${basePath}/ai/${id}`] = merged;
          updates[`leaderboards/challenger/${id}`] = {...merged, updatedAt:FO.serverTimestamp()};
        }
        applied.push(applySharedAIRecord({...merged, aiId:id, uid:id}));
        return;
      }
      const rec = seeded;
      updates[`${basePath}/ai/${id}`] = {...rec, updatedAt:FO.serverTimestamp()};
      updates[`leaderboards/challenger/${id}`] = {...rec, updatedAt:FO.serverTimestamp()};
      applied.push(rec);
    });
    if(Object.keys(updates).length){
      updates[`${basePath}/meta/monthKey`] = currentMonthKey();
      updates[`${basePath}/meta/updatedAt`] = FO.serverTimestamp();
      await FO.update(FO.ref(FO.rtdb), updates).catch(e=>console.warn('Shared AI roster seed failed', e));
    }
    return applied.filter(Boolean);
  }
  function watchSharedAIRoster(){
    if(flyLeaderboardEnabled()){
      if(sharedAIUnsub){ try{ sharedAIUnsub(); }catch(e){} sharedAIUnsub = null; }
      sharedAISeason = currentMonthKey();
      buildLocalSharedAIRoster();
      return;
    }
    if(!firebaseLeaderboardAllowed()) return;
    const nextSeason = currentMonthKey();
    if(sharedAIUnsub && sharedAISeason === nextSeason) return;
    if(sharedAIUnsub){ try{ sharedAIUnsub(); }catch(e){} sharedAIUnsub = null; }
    sharedAISeason = nextSeason;
    sharedAIUnsub = FO.onValue(sharedAIQueryTarget(), snap=>{
      const records = Object.values(snap.val() || {}).map(applySharedAIRecord).filter(Boolean);
      window.FATE_SHARED_AI_ROSTER = records;
      try{ if(document.getElementById('ch-leaderboard-list') && typeof window.renderLeaderboard === 'function') window.renderLeaderboard(); }catch(e){}
    }, err=>console.warn('Shared AI watch failed', err));
  }
  async function seedFlySharedAIRoster(){
    const records = buildLocalSharedAIRoster();
    const uid = authUid();
    if(!uid || !flyLeaderboardEnabled()) return records;
    if(flyRosterSeedInFlight) return flyRosterSeedInFlight;
    if(flyRosterSeededAt && Date.now() - flyRosterSeededAt < 5 * 60 * 1000) return window.FATE_SHARED_AI_ROSTER || records;
    flyRosterSeedInFlight = flyApiRequest('/api/challenger-ai/seed', {
      method:'POST',
      body:{uid, monthKey:currentMonthKey(), roster:records}
    }).catch(e=>{
      console.warn('Fly shared AI roster seed failed', e);
      return null;
    }).finally(()=>{ flyRosterSeedInFlight = null; });
    const data = await flyRosterSeedInFlight;
    let roster = (Array.isArray(data?.roster) ? data.roster : []).map(applySharedAIRecord).filter(Boolean);
    if(roster.length){
      window.FATE_SHARED_AI_ROSTER = roster;
      flyRosterSeededAt = Date.now();
      const hasAnyMatches = roster.some(rec=>Number(rec?.wins || 0) || Number(rec?.losses || 0) || Number(rec?.matchesPlayed || 0));
      if(!hasAnyMatches){
        const pairCount = Math.max(1, Math.floor(roster.length / 2));
        const simData = await flyApiRequest('/api/challenger-ai/simulate', {
          method:'POST',
          body:{uid, monthKey:currentMonthKey(), count:pairCount}
        }).catch(e=>{
          console.warn('Fly initial shared AI simulation failed', e);
          return null;
        });
        appendFlySimulationMatches(simData?.matches);
        const simulatedRoster = (Array.isArray(simData?.roster) ? simData.roster : []).map(applySharedAIRecord).filter(Boolean);
        if(simulatedRoster.length){
          roster = simulatedRoster;
          window.FATE_SHARED_AI_ROSTER = roster;
        }
      }
    }
    await fetchFlyLeaderboard().catch(()=>{});
    return roster.length ? roster : records;
  }
  function isLiveOnlineRoom(room){
    if(!room || typeof room !== 'object') return false;
    const status = String(room.status || '').toLowerCase();
    if(!['matchup','starting','playing'].includes(status)) return false;
    const updatedAt = Number(room.updatedAt || room.startedAt || room.createdAt || 0) || 0;
    const freshEnough = !updatedAt || Date.now() - updatedAt < 45 * 60 * 1000;
    const players = room.players && typeof room.players === 'object' ? Object.values(room.players) : [];
    const connected = players.some(p=>p && p.connected !== false);
    return freshEnough || connected;
  }
  async function hasActiveOnlineMatches(){
    if(flyLeaderboardEnabled()){
      if(typeof window.fateFetchFlyLiveMatches === 'function'){
        const matches = await window.fateFetchFlyLiveMatches(16).catch(()=>[]);
        return Array.isArray(matches) && matches.some(isLiveOnlineRoom);
      }
      return false;
    }
    if(!firebaseLeaderboardAllowed() || !FO.get) return false;
    const base = FO.ref(FO.rtdb, 'liveMatches');
    const target = (FO.query && FO.orderByChild && FO.limitToLast)
      ? FO.query(base, FO.orderByChild('updatedAt'), FO.limitToLast(16))
      : base;
    const snap = await FO.get(target).catch(()=>null);
    const matches = snap?.val?.() || {};
    return Object.values(matches).some(isLiveOnlineRoom);
  }
  function buildAISimulationPairs(ids, rng){
    const shuffled = [...ids];
    for(let i=shuffled.length-1;i>0;i--){
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    if(shuffled.length % 2 === 1 && shuffled.length > 1) shuffled.push(shuffled[0]);
    const pairs = [];
    for(let i=0;i+1<shuffled.length;i+=2){
      if(shuffled[i] !== shuffled[i+1]) pairs.push([shuffled[i], shuffled[i+1]]);
    }
    return pairs;
  }
  async function claimAISimulationBatch(targetCount){
    if(flyLeaderboardEnabled()) return 0;
    const u=user(); if(!u || !firebaseLeaderboardAllowed() || !FO.runTransaction) return 0;
    const claimId = `${u.uid}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const cadenceMs = 60 * 60 * 1000;
    const count = Math.max(0, Math.min(200, Math.round(Number(targetCount) || 0)));
    if(count <= 0) return 0;
    const tx = await FO.runTransaction(FO.ref(FO.rtdb, `${seasonPath()}/simSchedule`), cur=>{
      const data = cur && typeof cur === 'object' ? cur : {};
      const lastRunAt = Number(data.lastRunAt || 0) || 0;
      if(lastRunAt && Date.now() - lastRunAt < cadenceMs) return data;
      return {
        ...data,
        count:(Number(data.count || 0) || 0) + 1,
        lastRunAt:Date.now(),
        lastClaim:{id:claimId, uid:u.uid, count, at:Date.now()},
        updatedAt:Date.now()
      };
    }).catch(()=>null);
    const val = tx?.snapshot?.val?.() || {};
    return tx?.committed && val.lastClaim?.id === claimId ? Number(val.lastClaim.count || 0) || 0 : 0;
  }
  async function runSharedAISimulations(){
    if(flyLeaderboardEnabled()){
      const uid = authUid();
      if(!uid) return 0;
      await seedFlySharedAIRoster();
      const localCount = localAIList().length;
      const rosterCount = Array.isArray(window.FATE_SHARED_AI_ROSTER) && window.FATE_SHARED_AI_ROSTER.length ? window.FATE_SHARED_AI_ROSTER.length : localCount;
      const pairCount = Math.max(1, Math.floor(rosterCount / 2));
      const data = await flyApiRequest('/api/challenger-ai/simulate', {
        method:'POST',
        body:{uid, monthKey:currentMonthKey(), count:pairCount}
      }).catch(e=>{
        console.warn('Fly shared AI simulation failed', e);
        return null;
      });
      appendFlySimulationMatches(data?.matches);
      const records = (Array.isArray(data?.roster) ? data.roster : []).map(applySharedAIRecord).filter(Boolean);
      if(records.length){
        window.FATE_SHARED_AI_ROSTER = records;
        try{ if(typeof window.saveLeaderboard === 'function') window.saveLeaderboard(); }catch(e){}
      }
      await fetchFlyLeaderboard().catch(()=>{});
      return Number(data?.ran || 0) || 0;
    }
    const u=user(); if(!u || !firebaseLeaderboardAllowed()) return 0;
    await ensureSharedAIRoster();
    if(await hasActiveOnlineMatches()) return 0;
    const basePath = seasonPath();
    const day = currentDayKey();
    const snap = await FO.get(sharedAIQueryTarget()).catch(()=>null);
    const roster = Object.values(snap?.val() || {}).map(r=>aiEntry(r, r));
    if(roster.length < 2) return 0;
    const byId = new Map(roster.map(r=>[r.aiId, {...r}]));
    const ids = [...byId.keys()];
    const rng = seededRng(`${currentMonthKey()}:${day}:${u.uid}:${Date.now()}`);
    const pairs = buildAISimulationPairs(ids, rng);
    const claimed = await claimAISimulationBatch(pairs.length);
    if(!claimed) return 0;
    const updates = {};
    let ran = 0;
    for(let i=0;i<Math.min(claimed, pairs.length);i++){
      const id1 = pairs[i][0];
      const id2 = pairs[i][1];
      if(id1 === id2) continue;
      const a = byId.get(id1);
      const b = byId.get(id2);
      const chanceA = aiWinChance(a, b, day);
      const aWins = rng() < chanceA;
      const expectedA = 1 / (1 + Math.pow(10, (Number(b.elo || 600) - Number(a.elo || 600)) / 400));
      const k = 24;
      const changeA = minEloDelta(k * ((aWins ? 1 : 0) - expectedA), aWins);
      const changeB = minEloDelta(k * ((aWins ? 0 : 1) - (1 - expectedA)), !aWins);
      a.elo = Math.max(100, Math.round(Number(a.elo || 600) + changeA));
      b.elo = Math.max(100, Math.round(Number(b.elo || 600) + changeB));
      a.wins = Number(a.wins || 0) + (aWins ? 1 : 0);
      a.losses = Number(a.losses || 0) + (aWins ? 0 : 1);
      b.wins = Number(b.wins || 0) + (aWins ? 0 : 1);
      b.losses = Number(b.losses || 0) + (aWins ? 1 : 0);
      a.challengerWins = a.wins;
      a.challengerLosses = a.losses;
      b.challengerWins = b.wins;
      b.challengerLosses = b.losses;
      a.matchesPlayed = Math.max(Number(a.matchesPlayed || 0) || 0, a.wins + a.losses);
      b.matchesPlayed = Math.max(Number(b.matchesPlayed || 0) || 0, b.wins + b.losses);
      a.updatedAt = FO.serverTimestamp();
      b.updatedAt = FO.serverTimestamp();
      byId.set(id1, a);
      byId.set(id2, b);
      updates[`${basePath}/ai/${id1}`] = a;
      updates[`${basePath}/ai/${id2}`] = b;
      updates[`leaderboards/challenger/${id1}`] = a;
      updates[`leaderboards/challenger/${id2}`] = b;
      const matchId = `${day}_${Date.now()}_${i}_${slug(id1)}_${slug(id2)}`;
      updates[`${basePath}/matches/${matchId}`] = {
        matchId,
        p1:id1,
        p2:id2,
        p1Name:a.name,
        p2Name:b.name,
        winner:aWins ? id1 : id2,
        winnerName:aWins ? a.name : b.name,
        p1Change:changeA,
        p2Change:changeB,
        p1Elo:a.elo,
        p2Elo:b.elo,
        p1TrueElo:dailyTrueEloFor(a, day),
        p2TrueElo:dailyTrueEloFor(b, day),
        p1WinChance:chanceA,
        isSimulated:true,
        createdAt:FO.serverTimestamp()
      };
      try{ if(typeof window.logMatch === 'function') window.logMatch(a.name, b.name, aWins ? a.name : b.name, changeA, changeB, a.elo, b.elo, true); }catch(e){}
      ran++;
    }
    if(ran){
      updates[`${basePath}/meta/lastSimulationAt`] = FO.serverTimestamp();
      await FO.update(FO.ref(FO.rtdb), updates).catch(e=>console.warn('Shared AI simulation update failed', e));
    }
    return ran;
  }
  async function submitSharedAIResult(aiLike, didWin){
    if(flyLeaderboardEnabled()){
      if(aiLike?.name){
        const rec = aiEntry(aiLike, {
          wins:Number(aiLike.wins || 0) + (didWin ? 1 : 0),
          losses:Number(aiLike.losses || 0) + (didWin ? 0 : 1),
          updatedAt:Date.now()
        });
        applySharedAIRecord(rec);
      }
      return;
    }
    const u=user(); if(!u || !firebaseLeaderboardAllowed() || !aiLike?.name) return;
    const local = findLocalAI(aiLike) || aiLike;
    const id = aiIdFor(local);
    const recRef = FO.ref(FO.rtdb, `${seasonPath()}/ai/${id}`);
    const tx = await FO.runTransaction(recRef, cur=>{
      const base = cur && typeof cur === 'object' ? cur : aiEntry(local, {aiId:id});
      const next = aiEntry(base, {...base, aiId:id});
      next.elo = Math.max(100, Math.round(Number(aiLike.elo ?? local.elo ?? next.elo ?? 600)));
      next.trueElo = Math.max(100, Math.round(Number(aiLike.trueElo ?? local.trueElo ?? next.trueElo ?? next.elo + 200)));
      next.wins = Number(next.wins || 0) + (didWin ? 1 : 0);
      next.losses = Number(next.losses || 0) + (didWin ? 0 : 1);
      next.updatedAt = Date.now();
      return next;
    }).catch(()=>null);
    const rec = tx?.snapshot?.val?.();
    if(rec) await writeAILeaderboardEntry(aiEntry(rec, rec)).catch(()=>{});
  }
  function scheduleSharedAISync(){
    if(sharedAISyncTimer) clearTimeout(sharedAISyncTimer);
    sharedAISyncTimer = setTimeout(async ()=>{
      await ensureSharedAIRoster().catch(e=>console.warn('Shared AI roster sync failed', e));
      watchSharedAIRoster();
    }, 1400);
  }
  function startSharedAISimulationLoop(){
    if(sharedAISimulationTimer) return;
    const tick = ()=>{
      if(user()) runSharedAISimulations().catch(e=>console.warn('Shared AI simulation failed', e));
    };
    setTimeout(tick, 2500);
    sharedAISimulationTimer = setInterval(tick, 60 * 60 * 1000);
  }
  async function submitChallengerResult({didWin, opponentUid=null, opponentElo=1000, roomCode='', source='client', oldElo:givenOldElo=null, newElo:givenNewElo=null, delta:givenDelta=null, wins:givenWins=null, losses:givenLosses=null}={}){
    const u=user(); if(!u) return;
    await FO.syncPublicProfile().catch(()=>{});
    const p=profile();
    const lp = localProfile();
    let oldElo=Number(givenOldElo);
    if(!Number.isFinite(oldElo)) oldElo=Number(lp.challengerElo || p.challengerElo || 600);
    let delta=Number(givenDelta);
    let newElo=Number(givenNewElo);
    const hasResolvedResult = Number.isFinite(delta) && Number.isFinite(newElo);
    if(!hasResolvedResult){
      const expected=1/(1+Math.pow(10,(Number(opponentElo||1000)-oldElo)/400));
      const score=didWin?1:0;
      const k=didWin?32:40;
      delta=Math.round(k*(score-expected));
      if(didWin && delta<=0) delta=1; if(!didWin && delta>=0) delta=-1;
      newElo=Math.max(0,oldElo+delta);
      if(!flyLeaderboardEnabled() && lp){
        lp.challengerElo=newElo;
        if(didWin) lp.challengerWins=(lp.challengerWins||0)+1; else lp.challengerLosses=(lp.challengerLosses||0)+1;
        lp.matchesPlayed=(Number(lp.matchesPlayed)||0)+1;
        if(source !== 'ai'){
          if(didWin) lp.humanWins=(Number(lp.humanWins)||0)+1; else lp.humanLosses=(Number(lp.humanLosses)||0)+1;
        }
        if(typeof saveProfile==='function') saveProfile();
      }
    }
    const wins = Number.isFinite(Number(givenWins)) ? Number(givenWins) : Number(localProfile().challengerWins||0);
    const losses = Number.isFinite(Number(givenLosses)) ? Number(givenLosses) : Number(localProfile().challengerLosses||0);
    if(flyLeaderboardEnabled()){
      const syncedProfile = await FO.syncPublicProfile?.().catch(()=>profile());
      const publicProfile = syncedProfile || profile();
      try{
        const data = await flyApiRequest('/api/challenger-results', {
          method:'POST',
          body:{
            uid:u.uid,
            profile:publicProfile,
            didWin,
            opponentUid,
            opponentElo,
            roomCode,
            source
          }
        });
        if(data?.profile && typeof window.fateApplyServerProfileStats === 'function'){
          window.fateApplyServerProfileStats(data.profile);
        }
        oldElo = Number(data?.result?.oldElo ?? oldElo) || oldElo;
        newElo = Number(data?.result?.newElo ?? newElo) || newElo;
        delta = Number(data?.result?.delta ?? delta) || delta;
      }catch(e){
        console.warn('Fly Challenger result submit failed', e);
      }
      await fetchFlyLeaderboard().catch(()=>{});
      return {oldElo,newElo,delta};
    }
    return {oldElo,newElo,delta};
  }
  function watchLeaderboard(){
    if(flyLeaderboardEnabled()){
      fetchFlyLeaderboard().catch(()=>{});
      return;
    }
    if(!firebaseLeaderboardAllowed() || lbUnsub) return;
    const base = FO.ref(FO.rtdb, 'leaderboards/challenger');
    const target = (FO.query && FO.orderByChild && FO.limitToLast)
      ? FO.query(base, FO.orderByChild('elo'), FO.limitToLast(ONLINE_LEADERBOARD_LIMIT))
      : base;
    lbUnsub = FO.onValue(target, snap=>{
      leaderboard=snap.val()||{};
      window.FATE_ONLINE_LEADERBOARD = leaderboard;
      // If the challenger leaderboard tab is open, refresh carefully without changing pages.
      try{ if(document.getElementById('ch-leaderboard-list') && typeof window.renderLeaderboard === 'function') window.renderLeaderboard(); }catch(e){}
    });
  }
  if(FO.onAuth) FO.onAuth(s=>{
    if(s.user){
      syncMyLeaderboard().catch(()=>{});
      scheduleSharedAISync();
      startSharedAISimulationLoop();
    }else{
      if(lbUnsub){ try{ lbUnsub(); }catch(e){} lbUnsub = null; }
      if(sharedAIUnsub){ try{ sharedAIUnsub(); }catch(e){} sharedAIUnsub = null; }
      if(sharedAISyncTimer){ clearTimeout(sharedAISyncTimer); sharedAISyncTimer = null; }
      if(sharedAISimulationTimer){ clearInterval(sharedAISimulationTimer); sharedAISimulationTimer = null; }
      leaderboard = {};
      window.FATE_ONLINE_LEADERBOARD = leaderboard;
    }
  });
  window.FateOnline = Object.assign(window.FateOnline || {}, {
    syncMyLeaderboard,
    submitChallengerResult,
    syncSharedAIRoster:ensureSharedAIRoster,
    runSharedAISimulations,
    startSharedAISimulationLoop,
    ensureSharedAILeaderboard(){
      if(flyLeaderboardEnabled()){
        seedFlySharedAIRoster().catch(()=>{});
        return window.FATE_SHARED_AI_ROSTER || buildLocalSharedAIRoster();
      }
      scheduleSharedAISync();
      return window.FATE_SHARED_AI_ROSTER || [];
    },
    getSharedAIRoster:()=>window.FATE_SHARED_AI_ROSTER || [],
    ensureOnlineLeaderboard:watchLeaderboard,
    getOnlineLeaderboard:()=>{
      watchLeaderboard();
      return leaderboard;
    },
    refreshFlyLeaderboard:fetchFlyLeaderboard
  });

  // Mirror local Challenger result calculations to cloud without changing the existing result UI.
  setTimeout(()=>{
    if(typeof window.recordChallengerResult === 'function' && !window.recordChallengerResult._onlineWrapped){
      const orig = window.recordChallengerResult;
      const wrapped = function(didWin, opponentElo, isAI){
        const beforeProfile = localProfile();
        const oldElo = Number(beforeProfile.challengerElo || 600);
        const result = orig.apply(this, arguments);
        const afterProfile = localProfile();
        const newElo = Number(afterProfile.challengerElo || oldElo);
        const delta = Number(result?.eloChange);
        if(user()) submitChallengerResult({
          didWin,
          opponentElo,
          source:isAI?'ai':'human',
          oldElo,
          newElo,
          delta:Number.isFinite(delta) ? delta : newElo - oldElo,
          wins:Number(afterProfile.challengerWins || 0),
          losses:Number(afterProfile.challengerLosses || 0)
        }).catch(e=>console.warn('Online Elo submit failed', e));
        return result;
      };
      wrapped._onlineWrapped=true;
      window.recordChallengerResult=wrapped;
    }
    if(typeof window.syncAIEloEverywhere === 'function' && !window.syncAIEloEverywhere._onlineAIWrapped){
      const origSyncAI = window.syncAIEloEverywhere;
      const wrappedSyncAI = function(aiName, newElo, didWin){
        const result = origSyncAI.apply(this, arguments);
        if(!window.__fateApplyingSharedAI && typeof didWin === 'boolean' && user()){
          submitSharedAIResult(result || {name:aiName, elo:newElo}, didWin).catch(e=>console.warn('Shared AI result submit failed', e));
        }
        return result;
      };
      wrappedSyncAI._onlineAIWrapped = true;
      window.syncAIEloEverywhere = wrappedSyncAI;
    }
  },0);
})();
