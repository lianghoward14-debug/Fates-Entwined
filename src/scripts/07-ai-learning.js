(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.FateAILearning = api;
})(typeof window !== 'undefined' ? window : globalThis, function(){
  'use strict';

  const SCHEMA_VERSION = 1;
  const POLICY_VERSION = 1;
  const MAX_CLIENT_DECISIONS = 72;
  const POLICY_NAMES = Object.freeze([
    'mastermind duncan heyward',
    'field marshall achille laurent',
    'commander maja kaminska'
  ]);
  const FEATURE_KEYS = Object.freeze([
    'consolidate', 'contested', 'tempo', 'disruption', 'scaling',
    'trailing', 'concentrate', 'spread', 'fate', 'conserve'
  ]);
  const BASE_WEIGHTS = Object.freeze({
    'mastermind duncan heyward': Object.freeze({
      consolidate:0.82, contested:0.44, tempo:-0.18, disruption:0.18, scaling:0.50,
      trailing:0.36, concentrate:0.52, spread:-0.10, fate:0.62, conserve:0.70
    }),
    'field marshall achille laurent': Object.freeze({
      consolidate:0.16, contested:0.40, tempo:0.10, disruption:0.88, scaling:0.42,
      trailing:0.78, concentrate:0.12, spread:0.34, fate:0.36, conserve:0.46
    }),
    'commander maja kaminska': Object.freeze({
      consolidate:0.34, contested:0.92, tempo:0.86, disruption:0.12, scaling:0.34,
      trailing:0.48, concentrate:0.84, spread:-0.16, fate:0.58, conserve:0.12
    })
  });

  function clamp(value, min, max){
    const n = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
  }

  function normalizeName(value){
    return String(value || '').replace(/^\d{4}-Q\d+:/i, '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function isLearningAI(value){
    const name = normalizeName(value && typeof value === 'object' ? (value.name || value.username) : value);
    return POLICY_NAMES.includes(name);
  }

  function copyWeights(source){
    const result = {};
    FEATURE_KEYS.forEach(key=>{ result[key] = clamp(source && source[key], -1.5, 1.5); });
    return result;
  }

  function createBasePolicies(){
    const policies = {};
    POLICY_NAMES.forEach(name=>{
      policies[name] = {
        name,
        version:POLICY_VERSION,
        samples:0,
        selfPlayEpisodes:0,
        updatedAt:0,
        weights:copyWeights(BASE_WEIGHTS[name])
      };
    });
    return policies;
  }

  function sanitizePolicySet(value){
    const base = createBasePolicies();
    const raw = value && typeof value === 'object' ? (value.policies || value) : {};
    POLICY_NAMES.forEach(name=>{
      const incoming = raw[name];
      if(!incoming || typeof incoming !== 'object') return;
      base[name] = {
        name,
        version:Math.max(POLICY_VERSION, Math.round(Number(incoming.version) || 0)),
        samples:Math.max(0, Math.round(Number(incoming.samples) || 0)),
        selfPlayEpisodes:Math.max(0, Math.round(Number(incoming.selfPlayEpisodes) || 0)),
        updatedAt:Math.max(0, Math.round(Number(incoming.updatedAt) || 0)),
        weights:copyWeights(Object.assign({}, BASE_WEIGHTS[name], incoming.weights || {}))
      };
    });
    return base;
  }

  // Compact decision tuple (no account, player name, deck name, or match id):
  // [v, action, cardId, cardType, zone, row, turnBucket, handBucket, margin,
  //  ownCount, oppCount, flags, fate, tributeCount, result]
  function sanitizeDecision(value){
    if(!Array.isArray(value) || Number(value[0]) !== SCHEMA_VERSION) return null;
    const action = String(value[1] || '').slice(0, 1);
    if(!['p','c','e'].includes(action)) return null;
    const type = String(value[3] || 'u').slice(0, 1);
    return [
      SCHEMA_VERSION,
      action,
      String(value[2] || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 8),
      ['s','i','m','c','u'].includes(type) ? type : 'u',
      Math.round(clamp(value[4], -1, 2)),
      Math.round(clamp(value[5], -1, 9)),
      Math.round(clamp(value[6], 0, 4)),
      Math.round(clamp(value[7], 0, 4)),
      Math.round(clamp(value[8], -12, 12)),
      Math.round(clamp(value[9], 0, 9)),
      Math.round(clamp(value[10], 0, 9)),
      Math.round(clamp(value[11], 0, 31)),
      Math.round(clamp(value[12], 0, 20)),
      Math.round(clamp(value[13], 0, 9)),
      Math.round(clamp(value[14], -1, 1))
    ];
  }

  function decisionFeatures(tuple){
    const d = sanitizeDecision(tuple);
    if(!d) return null;
    const flags = d[11];
    const ending = d[1] === 'e';
    return {
      consolidate:d[1] === 'c' ? 1 : (ending ? 0 : -0.22),
      contested:(flags & 1) ? 1 : (ending ? 0 : -0.18),
      tempo:ending ? (d[7] >= 3 ? 0.45 : -0.35) : clamp(1-(d[6] / 4), 0, 1),
      disruption:(flags & 2) ? 1 : 0,
      scaling:(flags & 4) ? 1 : 0,
      trailing:d[8] < 0 ? clamp(Math.abs(d[8]) / 8, 0, 1) : -0.15,
      concentrate:d[9] >= 2 ? clamp(d[9] / 5, 0, 1) : -0.15,
      spread:d[9] === 0 ? 1 : (d[9] >= 3 ? -0.35 : 0),
      fate:ending ? 0 : clamp(d[12] / 10, 0, 1),
      conserve:d[1] === 'c' ? clamp(1-(d[13] / 5), -0.25, 1) : (ending ? clamp(d[7] / 4, 0, 1) : 0.15)
    };
  }

  function trainImitation(policiesValue, decisions, options){
    const policies = sanitizePolicySet(policiesValue);
    const opts = options || {};
    const maxSamples = Math.max(1, Math.min(50000, Number(opts.maxSamples) || 12000));
    const list = (Array.isArray(decisions) ? decisions : []).slice(-maxSamples).map(sanitizeDecision).filter(Boolean);
    const totals = FEATURE_KEYS.reduce((all,key)=>(all[key]=0,all),{});
    let weightTotal = 0;
    list.forEach(decision=>{
      const features = decisionFeatures(decision);
      if(!features) return;
      const resultWeight = decision[14] > 0 ? 1 : (decision[14] < 0 ? 0.28 : 0.55);
      FEATURE_KEYS.forEach(key=>{ totals[key] += features[key] * resultWeight; });
      weightTotal += resultWeight;
    });
    if(!weightTotal) return policies;
    const confidence = clamp(list.length / 1200, 0.05, 0.38);
    POLICY_NAMES.forEach(name=>{
      const policy = policies[name];
      const base = BASE_WEIGHTS[name];
      FEATURE_KEYS.forEach(key=>{
        const humanSignal = clamp(totals[key] / weightTotal, -1, 1);
        // Archetype remains dominant; imitation adds believable human tendencies.
        policy.weights[key] = clamp(base[key] * (1-confidence*0.35) + humanSignal * confidence, -1.5, 1.5);
      });
      policy.samples = list.length;
      policy.updatedAt = Number(opts.updatedAt) || Date.now();
    });
    return policies;
  }

  function hashSeed(value){
    let hash = 2166136261;
    const text = String(value || '');
    for(let i=0; i<text.length; i++){
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRng(seed){
    let t = hashSeed(seed) || 0x6d2b79f5;
    return function(){
      t += 0x6D2B79F5;
      let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function dot(weights, features){
    return FEATURE_KEYS.reduce((sum,key)=>sum + (Number(weights[key]) || 0) * (Number(features[key]) || 0), 0);
  }

  function randomAbstractAction(rng, state, player){
    const zone = Math.floor(rng()*3);
    const margin = state.scores[player][zone] - state.scores[1-player][zone];
    const consolidate = rng() < 0.25;
    return {
      consolidate:consolidate ? 1 : -0.22,
      contested:rng() < 0.55 ? 1 : -0.18,
      tempo:clamp(1-state.step/12, 0, 1),
      disruption:rng() < 0.22 ? 1 : 0,
      scaling:rng() < 0.24 ? 1 : 0,
      trailing:margin < 0 ? clamp(Math.abs(margin)/8, 0, 1) : -0.15,
      concentrate:state.zoneCards[player][zone] >= 2 ? 1 : -0.15,
      spread:state.zoneCards[player][zone] === 0 ? 1 : 0,
      fate:0.2 + rng()*0.8,
      conserve:consolidate ? (0.2+rng()*0.7) : 0.15,
      zone
    };
  }

  function runSelfPlay(policiesValue, options){
    const policies = sanitizePolicySet(policiesValue);
    const opts = options || {};
    const episodes = Math.max(0, Math.min(2000, Math.round(Number(opts.episodes) || 96)));
    const maxMs = Math.max(1, Math.min(250, Number(opts.maxMs) || 30));
    const rng = seededRng(opts.seed || 'fate-self-play');
    const names = POLICY_NAMES.slice();
    const deltas = names.reduce((all,name)=>(all[name]=FEATURE_KEYS.reduce((o,k)=>(o[k]=0,o),{}),all),{});
    const counts = names.reduce((all,name)=>(all[name]=0,all),{});
    const started = Date.now();
    let completed = 0;
    for(let episode=0; episode<episodes && Date.now()-started < maxMs; episode++){
      const aName = names[episode % names.length];
      const bName = names[(episode + 1 + Math.floor(episode/names.length)) % names.length];
      if(aName === bName) continue;
      const state = {scores:[[0,0,0],[0,0,0]],zoneCards:[[0,0,0],[0,0,0]],step:0};
      const traces = [[],[]];
      for(let step=0; step<12; step++){
        state.step = step;
        const player = step % 2;
        const name = player ? bName : aName;
        const candidates = Array.from({length:5},()=>randomAbstractAction(rng,state,player));
        candidates.sort((x,y)=>dot(policies[name].weights,y)-dot(policies[name].weights,x));
        const chosen = candidates[rng() < 0.91 ? 0 : 1];
        traces[player].push(chosen);
        const power = 1 + chosen.fate*5 + chosen.scaling*0.7;
        state.scores[player][chosen.zone] += power;
        state.scores[1-player][chosen.zone] = Math.max(0,state.scores[1-player][chosen.zone]-chosen.disruption*1.4);
        state.zoneCards[player][chosen.zone]++;
      }
      const zones = [0,1,2].map(z=>state.scores[0][z] === state.scores[1][z] ? -1 : (state.scores[0][z] > state.scores[1][z] ? 0 : 1));
      const wins0 = zones.filter(v=>v===0).length;
      const wins1 = zones.filter(v=>v===1).length;
      const winner = wins0 === wins1 ? -1 : (wins0 > wins1 ? 0 : 1);
      [aName,bName].forEach((name,player)=>{
        const reward = winner < 0 ? 0 : (winner === player ? 1 : -0.65);
        traces[player].forEach(features=>FEATURE_KEYS.forEach(key=>{ deltas[name][key] += reward * features[key]; }));
        counts[name] += traces[player].length;
      });
      completed++;
    }
    names.forEach(name=>{
      if(!counts[name]) return;
      FEATURE_KEYS.forEach(key=>{
        const adjustment = clamp(deltas[name][key] / counts[name] * 0.035, -0.045, 0.045);
        policies[name].weights[key] = clamp(policies[name].weights[key] + adjustment, -1.5, 1.5);
      });
      policies[name].selfPlayEpisodes += completed;
      policies[name].updatedAt = Number(opts.updatedAt) || Date.now();
    });
    return {policies, episodes:completed, elapsedMs:Date.now()-started};
  }

  function moveFeatures(value){
    const source = value || {};
    return {
      consolidate:source.type === 'consolidate' ? 1 : -0.22,
      contested:source.contested ? 1 : -0.18,
      tempo:clamp(source.tempo, 0, 1),
      disruption:source.disruption ? 1 : 0,
      scaling:source.scaling ? 1 : 0,
      trailing:Number(source.margin) < 0 ? clamp(Math.abs(Number(source.margin))/8, 0, 1) : -0.15,
      concentrate:Number(source.ownCount) >= 2 ? clamp(Number(source.ownCount)/5, 0, 1) : -0.15,
      spread:Number(source.ownCount) === 0 ? 1 : (Number(source.ownCount) >= 3 ? -0.35 : 0),
      fate:clamp(Number(source.fate)/10, 0, 1),
      conserve:source.type === 'consolidate' ? clamp(1-(Number(source.tributeCount)||0)/5, -0.25, 1) : 0.15
    };
  }

  function scoreMove(policyValue, move){
    if(!policyValue) return 0;
    const policy = policyValue.weights ? policyValue : {weights:policyValue};
    return clamp(dot(copyWeights(policy.weights), moveFeatures(move)) * 1.7, -4.5, 4.5);
  }

  function cardTypeCode(card){
    const type = String(card && card.type || '').toLowerCase();
    if(type === 'supporter') return 's';
    if(type === 'initiator') return 'i';
    if(type === 'improvisor') return 'm';
    if(type === 'coordinator') return 'c';
    return 'u';
  }

  function createDecision(input){
    const source = input || {};
    const card = source.card || {};
    const flags = (source.contested ? 1 : 0)
      | (source.disruption ? 2 : 0)
      | (source.scaling ? 4 : 0)
      | (source.draw ? 8 : 0)
      | (source.faceDown ? 16 : 0);
    return sanitizeDecision([
      SCHEMA_VERSION,
      String(source.action || 'p').slice(0,1),
      card.id || '',
      cardTypeCode(card),
      source.zone,
      source.row,
      Math.floor(clamp(source.turn,1,20)/5),
      Math.floor(clamp(source.handSize,0,12)/3),
      source.margin,
      source.ownCount,
      source.oppCount,
      flags,
      card.currentFate ?? card.fate,
      source.tributeCount,
      source.result || 0
    ]);
  }

  return {
    SCHEMA_VERSION,
    POLICY_VERSION,
    MAX_CLIENT_DECISIONS,
    POLICY_NAMES,
    FEATURE_KEYS,
    BASE_WEIGHTS,
    normalizeName,
    isLearningAI,
    createBasePolicies,
    sanitizePolicySet,
    sanitizeDecision,
    decisionFeatures,
    createDecision,
    trainImitation,
    runSelfPlay,
    scoreMove,
    seededRng
  };
});

(function(root){
  'use strict';
  if(!root || !root.FateAILearning || root.__fateAILearningClientInstalled) return;
  root.__fateAILearningClientInstalled = true;
  const AI = root.FateAILearning;
  const POLICY_KEY = 'fate_ai_learned_policy_v1';
  const QUEUE_KEY = 'fate_ai_learning_queue_v1';
  const OPT_OUT_KEY = 'fate_ai_learning_opt_out';
  let policies = AI.createBasePolicies();
  let trace = null;

  function readJson(key, fallback){
    try{ return JSON.parse(localStorage.getItem(key) || '') || fallback; }catch(e){ return fallback; }
  }

  function writeJson(key, value){
    try{ localStorage.setItem(key, JSON.stringify(value)); return true; }catch(e){ return false; }
  }

  function optedOut(){
    try{ return localStorage.getItem(OPT_OUT_KEY) === '1'; }catch(e){ return false; }
  }

  function loadLocalPolicies(){
    policies = AI.sanitizePolicySet(readJson(POLICY_KEY, policies));
    return policies;
  }

  function savePolicies(value){
    policies = AI.sanitizePolicySet(value);
    writeJson(POLICY_KEY, {version:AI.POLICY_VERSION, policies});
    return policies;
  }

  function startMatch(){
    trace = {startedAt:Date.now(), decisions:[], finished:false};
    return trace;
  }

  function isLocalHumanPlayer(player){
    if(typeof G === 'undefined' || !G || G._isSpectator) return false;
    const p = Number(player);
    if(!Number.isInteger(p)) return false;
    if(G._onlineRoomCode) return Number(G._onlinePlayerIndex) === p && !G._onlineApplyingRemoteAction;
    if(G.aiEnabled) return p !== Number(G.aiPlayer);
    return true;
  }

  function boardCounts(player, zone){
    let own = 0, opp = 0;
    const rows = typeof G !== 'undefined' && G?.board?.[zone];
    if(!Array.isArray(rows)) return {own,opp};
    rows.forEach(row=>Array.isArray(row) && row.forEach(card=>{
      if(!card) return;
      if(Number(card.owner) === Number(player)) own++;
      else opp++;
    }));
    return {own,opp};
  }

  function zoneMargin(player, zone){
    if(typeof getZoneScore !== 'function' || zone < 0) return 0;
    try{ return Number(getZoneScore(zone, player) - getZoneScore(zone, 1-player)) || 0; }catch(e){ return 0; }
  }

  function profileFlags(card){
    try{
      const profile = root.FateAIIntelligence?.profileCard?.(card);
      if(profile) return profile;
    }catch(e){}
    return {disruption:0,scaling:0,draw:0};
  }

  function recordDecision(input){
    if(optedOut() || typeof G === 'undefined' || !G || G._isSpectator || G._tutorialTurnLimit) return false;
    const source = input || {};
    const player = Number(source.player ?? G.currentPlayer);
    if(!isLocalHumanPlayer(player)) return false;
    if(!trace || trace.finished) startMatch();
    if(trace.decisions.length >= AI.MAX_CLIENT_DECISIONS) return false;
    const zone = Number.isInteger(Number(source.zone)) ? Number(source.zone) : -1;
    const counts = boardCounts(player, zone);
    const cardProfile = profileFlags(source.card);
    const tuple = AI.createDecision({
      action:source.action || 'p',
      card:source.card || {},
      zone,
      row:Number.isInteger(Number(source.row)) ? Number(source.row) : -1,
      turn:Number(G.turn) || 1,
      handSize:G.players?.[player]?.hand?.length || 0,
      margin:zoneMargin(player, zone),
      ownCount:counts.own,
      oppCount:counts.opp,
      contested:Number(source.row) === 1,
      disruption:!!cardProfile.disruption,
      scaling:!!cardProfile.scaling,
      draw:!!cardProfile.draw,
      faceDown:!!source.faceDown,
      tributeCount:Array.isArray(source.tributes) ? source.tributes.length : Number(source.tributeCount) || 0
    });
    if(!tuple) return false;
    trace.decisions.push({player, tuple});
    return true;
  }

  function pendingBatches(){
    const queue = readJson(QUEUE_KEY, []);
    return Array.isArray(queue) ? queue.slice(-8) : [];
  }

  function savePendingBatches(queue){
    writeJson(QUEUE_KEY, (Array.isArray(queue) ? queue : []).slice(-8));
  }

  async function sendBatch(batch){
    if(!batch || !Array.isArray(batch.decisions) || !batch.decisions.length) return false;
    const api = root.FateOnline;
    if(!api?.auth?.currentUser || typeof api.flyApiRequest !== 'function') return false;
    await api.flyApiRequest('/api/ai-learning/decisions', {
      method:'POST',
      body:{
        v:AI.SCHEMA_VERSION,
        mode:String(batch.mode || 'unknown').slice(0,16),
        decisions:batch.decisions.slice(0, AI.MAX_CLIENT_DECISIONS)
      }
    });
    return true;
  }

  async function flushQueue(){
    if(optedOut()) { savePendingBatches([]); return {sent:0}; }
    const queue = pendingBatches();
    if(!queue.length) return {sent:0};
    let sent = 0;
    while(queue.length){
      try{
        if(!await sendBatch(queue[0])) break;
        queue.shift();
        sent++;
      }catch(e){ break; }
    }
    savePendingBatches(queue);
    return {sent};
  }

  function currentMode(){
    try{
      const mode = String(typeof CURRENT_MODE !== 'undefined' ? CURRENT_MODE : 'unknown').toLowerCase();
      return ['challenger','freeplay','online','campaign'].includes(mode) ? mode : 'other';
    }catch(e){ return 'other'; }
  }

  function finishMatch(result){
    if(!trace || trace.finished || optedOut()) return Promise.resolve({saved:0});
    trace.finished = true;
    const winner = Number.isInteger(Number(result?.winner)) ? Number(result.winner) : -1;
    const isDraw = !!result?.isDraw || winner < 0;
    const decisions = trace.decisions.map(entry=>{
      const tuple = entry.tuple.slice();
      tuple[14] = isDraw ? 0 : (entry.player === winner ? 1 : -1);
      return AI.sanitizeDecision(tuple);
    }).filter(Boolean);
    if(!decisions.length) return Promise.resolve({saved:0});
    // Local imitation updates are deliberately small and remain useful offline.
    savePolicies(AI.trainImitation(policies, decisions, {maxSamples:AI.MAX_CLIENT_DECISIONS, updatedAt:Date.now()}));
    const batch = {v:AI.SCHEMA_VERSION, mode:currentMode(), decisions};
    const queue = pendingBatches();
    queue.push(batch);
    savePendingBatches(queue);
    return flushQueue().then(info=>({saved:decisions.length, sent:info.sent}));
  }

  function authorityBase(){
    try{
      if(root.FateOnline?.authorityHttpBaseUrl) return root.FateOnline.authorityHttpBaseUrl();
      const explicit = String(localStorage.getItem('fateFlyApiUrl') || '').trim();
      if(explicit) return explicit.replace(/\/+$/, '');
      if(String(location.hostname || '').toLowerCase() === 'fates-entwined-main.fly.dev') return location.origin.replace(/\/+$/, '');
    }catch(e){}
    return 'https://fates-entwined-main.fly.dev';
  }

  async function refreshPolicies(){
    try{
      const res = await fetch(authorityBase() + '/api/ai-learning/policy', {headers:{accept:'application/json'}});
      if(!res.ok) return policies;
      const data = await res.json();
      if(data?.policies) savePolicies(data.policies);
    }catch(e){}
    return policies;
  }

  function getPolicy(ai){
    const name = AI.normalizeName(ai && typeof ai === 'object' ? (ai.name || ai.username) : ai);
    return policies[name] || null;
  }

  loadLocalPolicies();
  root.fateAIStartLearningMatch = startMatch;
  root.fateAIRecordDecision = recordDecision;
  root.fateAIFinishLearningMatch = finishMatch;
  root.fateAIRefreshLearnedPolicies = refreshPolicies;
  root.fateAIGetLearnedPolicy = getPolicy;
  root.fateAISetLearningOptOut = function(value){
    try{
      if(value) { localStorage.setItem(OPT_OUT_KEY, '1'); localStorage.removeItem(QUEUE_KEY); }
      else localStorage.removeItem(OPT_OUT_KEY);
    }catch(e){}
    return optedOut();
  };
  setTimeout(function(){ refreshPolicies(); flushQueue(); }, 3000);
})(typeof window !== 'undefined' ? window : null);
