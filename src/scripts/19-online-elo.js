
// FATES ENTWINED ONLINE ELO V1
// Realtime leaderboard mirror over RTDB. Client-trusted alpha until Cloud Functions are added.
(function(){
  const FO = window.FateOnline || {};
  let leaderboard = {};
  let lbUnsub = null;
  let sharedAISimulationTimer = null;
  let sharedAISyncTimer = null;
  const ONLINE_LEADERBOARD_LIMIT = 100;

  function esc(s){ return FO.escapeHtml ? FO.escapeHtml(s) : String(s||'').replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function user(){ return window.FATE_ONLINE?.user; }
  function profile(){ return window.FATE_ONLINE?.profile || {}; }
  function localProfile(){ try{ if(typeof window.getFateLocalProfile === 'function') return window.getFateLocalProfile() || {}; }catch(e){} return window.USER_PROFILE || {}; }
  function nameOf(p){ return FO.profileName ? FO.profileName(p) : (p?.chosenUsername||p?.displayName||p?.username||p?.baseCode||'Player'); }
  function currentMonthKey(){
    try{ if(typeof window.getMonthKey === 'function') return window.getMonthKey(); }catch(e){}
    const d = new Date();
    return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
  }
  function currentDayKey(){ return new Date().toISOString().slice(0,10); }
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
      return { wins:Number(entry?.wins || 0) || 0, losses:Number(entry?.losses || 0) || 0 };
    }catch(e){ return {wins:0, losses:0}; }
  }
  function aiPhoto(ai){
    try{ if(typeof window.getAIProfileImg === 'function') return window.getAIProfileImg(ai, 'circle') || ai?.img || ai?.profileImg || 'blank.png'; }catch(e){}
    return ai?.img || ai?.profileImg || 'blank.png';
  }
  function aiEntry(ai, extra={}){
    const id = extra.aiId || aiIdFor(ai);
    const rec = localAIRecord(ai);
    const wins = Number(extra.wins ?? ai?.wins ?? rec.wins) || 0;
    const losses = Number(extra.losses ?? ai?.losses ?? rec.losses) || 0;
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
      seededWinRate:Number(extra.seededWinRate ?? ai?.seededWinRate) || 0,
      generationVersion:Number(extra.generationVersion ?? ai?.generationVersion) || 0,
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
    entry.wins = Number(rec.wins || 0) || 0;
    entry.losses = Number(rec.losses || 0) || 0;
    entry.seededWinRate = Number(rec.seededWinRate || 0) || 0;
    entry.generationVersion = Number(rec.generationVersion || 0) || 0;
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
  let sharedAIUnsub = null;
  let sharedAISeason = '';

  async function syncMyLeaderboard(){
    const u=user(); if(!u || !FO.rtdb) return;
    const p = await FO.syncPublicProfile().catch(()=>profile());
    await FO.update(FO.ref(FO.rtdb, `leaderboards/challenger/${u.uid}`), {
      uid:u.uid,
      name:nameOf(p),
      baseCode:p.baseCode || window.FATE_ONLINE?.baseCode || '',
      photoURL:p.photoURL || p.profileImg || 'blank.png',
      elo:Number(p.challengerElo || localProfile().challengerElo || 600),
      wins:Number(localProfile().challengerWins || 0),
      losses:Number(localProfile().challengerLosses || 0),
      updatedAt:FO.serverTimestamp()
    });
  }
  async function writeAILeaderboardEntry(rec){
    if(!FO.rtdb || !rec?.aiId) return;
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
      generationVersion:Number(rec.generationVersion || 0) || 0,
      isAI:true,
      isMonthly:!!rec.isMonthly,
      monthKey:rec.monthKey || '',
      updatedAt:FO.serverTimestamp()
    });
  }
  async function ensureSharedAIRoster(){
    const u=user(); if(!u || !FO.rtdb) return [];
    const list = localAIList();
    if(!list.length) return [];
    const basePath = seasonPath();
    const snap = await FO.get(FO.ref(FO.rtdb, `${basePath}/ai`)).catch(()=>null);
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
        const needsMonthlySpread = !!(seeded.isMonthly && seeded.generationVersion >= 2 && (Number(current.generationVersion || 0) < seeded.generationVersion || currentTotal < 8));
        const merged = needsMonthlySpread ? {
          ...current,
          elo:seeded.elo,
          trueElo:seeded.trueElo,
          wins:seeded.wins,
          losses:seeded.losses,
          seededWinRate:seeded.seededWinRate,
          generationVersion:seeded.generationVersion,
          isMonthly:true,
          monthKey:seeded.monthKey,
          updatedAt:FO.serverTimestamp()
        } : current;
        if(needsMonthlySpread){
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
    if(!FO.rtdb) return;
    const nextSeason = currentMonthKey();
    if(sharedAIUnsub && sharedAISeason === nextSeason) return;
    if(sharedAIUnsub){ try{ sharedAIUnsub(); }catch(e){} sharedAIUnsub = null; }
    sharedAISeason = nextSeason;
    sharedAIUnsub = FO.onValue(FO.ref(FO.rtdb, `${seasonPath()}/ai`), snap=>{
      const records = Object.values(snap.val() || {}).map(applySharedAIRecord).filter(Boolean);
      window.FATE_SHARED_AI_ROSTER = records;
      try{ if(document.getElementById('ch-leaderboard-list') && typeof window.renderLeaderboard === 'function') window.renderLeaderboard(); }catch(e){}
    }, err=>console.warn('Shared AI watch failed', err));
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
    if(!FO.rtdb || !FO.get) return false;
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
    const u=user(); if(!u || !FO.rtdb || !FO.runTransaction) return 0;
    const claimId = `${u.uid}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const cadenceMs = 10 * 60 * 1000;
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
    const u=user(); if(!u || !FO.rtdb) return 0;
    await ensureSharedAIRoster();
    if(await hasActiveOnlineMatches()) return 0;
    const basePath = seasonPath();
    const day = currentDayKey();
    const snap = await FO.get(FO.ref(FO.rtdb, `${basePath}/ai`)).catch(()=>null);
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
    const u=user(); if(!u || !FO.rtdb || !aiLike?.name) return;
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
    sharedAISimulationTimer = setInterval(()=>{
      if(user()) runSharedAISimulations().catch(e=>console.warn('Shared AI simulation failed', e));
    }, 10 * 60 * 1000);
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
      if(lp){
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
    const matchId = `${Date.now()}_${u.uid}_${Math.random().toString(36).slice(2,7)}`;
    await FO.update(FO.ref(FO.rtdb), {
      [`matchResults/${matchId}`]: { matchId, uid:u.uid, opponentUid, roomCode, didWin, oldElo, newElo, delta, source, createdAt:FO.serverTimestamp() },
      [`leaderboards/challenger/${u.uid}`]: { uid:u.uid, name:nameOf(p), baseCode:p.baseCode||window.FATE_ONLINE?.baseCode||'', photoURL:p.photoURL||p.profileImg||'blank.png', elo:newElo, wins, losses, updatedAt:FO.serverTimestamp() },
      [`publicProfiles/${u.uid}/challengerElo`]: newElo,
      [`publicProfiles/${u.uid}/challengerWins`]: Number(localProfile().challengerWins || wins || 0) || 0,
      [`publicProfiles/${u.uid}/challengerLosses`]: Number(localProfile().challengerLosses || losses || 0) || 0,
      [`publicProfiles/${u.uid}/humanWins`]: Number(localProfile().humanWins ?? localProfile().wins ?? 0) || 0,
      [`publicProfiles/${u.uid}/humanLosses`]: Number(localProfile().humanLosses ?? localProfile().losses ?? 0) || 0,
      [`publicProfiles/${u.uid}/matchesPlayed`]: Number(localProfile().matchesPlayed || 0) || 0,
      [`publicProfiles/${u.uid}/updatedAt`]: FO.serverTimestamp()
    });
    return {oldElo,newElo,delta};
  }
  function watchLeaderboard(){
    if(!FO.rtdb || lbUnsub) return;
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
      scheduleSharedAISync();
      return window.FATE_SHARED_AI_ROSTER || [];
    },
    getSharedAIRoster:()=>window.FATE_SHARED_AI_ROSTER || [],
    ensureOnlineLeaderboard:watchLeaderboard,
    getOnlineLeaderboard:()=>{
      watchLeaderboard();
      return leaderboard;
    }
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
