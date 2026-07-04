//  BUILT-IN STARTER PRESET DECKS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const RETIRED_CHALLENGER_CARD_IDS = new Set(['bh01','bh25']);

function isRetiredChallengerCard(cardOrId) {
  const id = typeof cardOrId === 'string' ? cardOrId : cardOrId?.id;
  if(typeof TEMP_DISABLED_CARD_IDS !== 'undefined' && TEMP_DISABLED_CARD_IDS.has(String(id))) return true;
  return RETIRED_CHALLENGER_CARD_IDS.has(id) || !!cardOrId?.retired;
}

function jsString(value) {
  return JSON.stringify(String(value ?? '')).replace(/</g, '\\u003c').replace(/'/g, '\\u0027');
}

function getChallengerCardPool() {
  return CARDS.filter(c=>!isRetiredChallengerCard(c));
}

function seedBuiltInPresets() {
  let changed = false;
  const aiOnlyBuiltins = (Array.isArray(AI_ONLY_RANDOM_DECKS) ? AI_ONLY_RANDOM_DECKS : []).map(deck=>`builtin_${deck.id}`);
  aiOnlyBuiltins.forEach(id=>{
    if(PRESET_DECKS[id]){
      delete PRESET_DECKS[id];
      changed = true;
    }
  });
  STARTER_DECKS.forEach((deck, idx)=>{
    const id = `builtin_${deck.id}`;
    const builtInPreset = {
      name: `Starter: ${deck.name}`,
      description: deck.description,
      theme: deck.theme,
      ids: [...deck.ids],
      faceCardId: deck.faceCardId,
      displayCardIds: [...deck.displayCardIds],
      builtin: true,
      sortOrder: idx
    };
    const prev = PRESET_DECKS[id];
    if(
      !prev ||
      JSON.stringify(prev.ids) !== JSON.stringify(builtInPreset.ids) ||
      JSON.stringify(prev.displayCardIds||[]) !== JSON.stringify(builtInPreset.displayCardIds||[]) ||
      prev.faceCardId !== builtInPreset.faceCardId ||
      prev.name !== builtInPreset.name ||
      prev.description !== builtInPreset.description ||
      prev.theme !== builtInPreset.theme
    ){
      PRESET_DECKS[id] = builtInPreset;
      changed = true;
    }
  });
  if(changed) savePresetsToStorage();
}

function syncStarterPresetMetadata() {
  if(!USER_PROFILE.challengerPresets) return;
  let changed = false;
  STARTER_DECKS.forEach(deck => {
    Object.values(USER_PROFILE.challengerPresets).forEach((preset)=>{
      if(!preset || !Array.isArray(preset.ids)) return;
      if(
        preset.name === deck.name &&
        JSON.stringify(preset.ids) === JSON.stringify(deck.ids) &&
        (
          preset.faceCardId !== deck.faceCardId ||
          JSON.stringify(preset.displayCardIds||[]) !== JSON.stringify(deck.displayCardIds||[]) ||
          preset.description !== deck.description ||
          preset.theme !== deck.theme ||
          preset.starter !== true ||
          preset.lockedStarter !== true ||
          preset.starterId !== deck.id
        )
      ){
        preset.faceCardId = deck.faceCardId;
        preset.displayCardIds = [...deck.displayCardIds];
        preset.description = deck.description;
        preset.theme = deck.theme;
        preset.starter = true;
        preset.lockedStarter = true;
        preset.starterId = deck.id;
        changed = true;
      }
    });
  });
  if(changed) saveProfile();
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  CHALLENGER MODE
//
//  Self-contained progression system. All state lives on USER_PROFILE
//  as plain JSON so it can be synced to a backend later for multiplayer.
//
//  Pure functions (no DOM mutations) are kept separate from UI functions
//  so they can be called server-side once multiplayer lands.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const STARLIGHT_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" style="display:inline-block;vertical-align:-3px;filter:drop-shadow(0 0 4px rgba(255,215,0,.8));"><defs><linearGradient id="sl-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fff8c4"/><stop offset="50%" stop-color="#ffd700"/><stop offset="100%" stop-color="#c9a84c"/></linearGradient></defs><path d="M12 2 L14 9 L21 10 L15.5 14.5 L17 21 L12 17.5 L7 21 L8.5 14.5 L3 10 L10 9 Z" fill="url(#sl-grad)" stroke="#fff8c4" stroke-width=".3"/></svg>';

// â”€â”€â”€ PACK GENERATION (pure, multiplayer-safe) â”€â”€â”€
// Pack uses card IDs 1-80. Not all IDs exist in the CARDS array (some are reserved for expansion).
// We filter to existing cards only.
function getPackCardPool() {
  return getChallengerCardPool();
}

// Generate a booster pack. Returns array of card IDs (length = 8).
// Rules:
// - 8 cards per pack
// - Base composition: 3 supporters, 4 triangle, 1 square
// - 33% chance of additional square (replaces one supporter)
// - 5% chance of a star card (replaces one triangle)
// - When rendered on client, rarest cards appear last.
function generatePack() {
  const pool = getPackCardPool();
  const byRarity = {
    star:    pool.filter(c=>c.rarity==='star'),
    square:  pool.filter(c=>c.rarity==='square'),
    triangle:pool.filter(c=>c.rarity==='triangle'),
    circle:  pool.filter(c=>c.rarity==='circle'),
  };
  // Supporters are circle rarity in the main set (some are triangle but most are circle).
  // For pack balance, use all circle cards for the "supporter slot".
  const supporterPool = byRarity.circle.filter(c=>c.type==='Supporter');
  const fallbackSupporter = byRarity.circle; // fallback if supporter pool empty

  const pickRandom = (arr)=>arr.length?arr[Math.floor(Math.random()*arr.length)]:null;

  const pick = [];
  // Determine composition
  let numStar = Math.random()<0.05?1:0;
  let numSquare = (Math.random()<0.33?1:0) + 1; // 1 guaranteed, 33% extra
  // Start with base: 4 triangle, 3 supporter, 1 square
  let numTriangle = 4;
  let numSupporter = 3;
  // If extra square, replace a supporter
  if(numSquare>1) numSupporter--;
  // If star, replace a triangle
  if(numStar>0) numTriangle--;

  // Pick cards
  for(let i=0;i<numTriangle;i++){
    const c = pickRandom(byRarity.triangle);
    if(c) pick.push(c.id);
  }
  for(let i=0;i<numSquare;i++){
    const c = pickRandom(byRarity.square);
    if(c) pick.push(c.id);
  }
  for(let i=0;i<numStar;i++){
    const c = pickRandom(byRarity.star);
    if(c) pick.push(c.id);
  }
  for(let i=0;i<numSupporter;i++){
    const c = pickRandom(supporterPool.length?supporterPool:fallbackSupporter);
    if(c) pick.push(c.id);
  }
  // Pad to 8 with random circles if short (shouldn't happen, but safe)
  while(pick.length<8){
    const c = pickRandom(byRarity.circle);
    if(c) pick.push(c.id); else break;
  }
  // Sort rarest last: circle → triangle → square → star
  const rarityRank = {circle:0, triangle:1, square:2, star:3};
  pick.sort((a,b)=>{
    const ca = CARDS.find(c=>c.id===a);
    const cb = CARDS.find(c=>c.id===b);
    return (rarityRank[ca.rarity]||0) - (rarityRank[cb.rarity]||0);
  });
  return pick;
}

// Add owned cards to profile (called when opening a pack). Returns list of {cardId, isNew}.
function grantCardsToProfile(cardIds) {
  if(!USER_PROFILE.ownedCards) USER_PROFILE.ownedCards = {};
  const results = [];
  cardIds.forEach(cid=>{
    if(isRetiredChallengerCard(cid)) return;
    const had = USER_PROFILE.ownedCards[cid] || 0;
    USER_PROFILE.ownedCards[cid] = had + 1;
    results.push({cardId:cid, isNew: had===0});
  });
  saveProfile();
  return results;
}

// â”€â”€â”€ STARLIGHT ECONOMY â”€â”€â”€
// Pack cost and reward tuning.
const PACK_COST_STARLIGHT = 100;

// Starlight earned for winning a game. Human opponents give 3x vs AI of same ELO.
// Base ~20 + scaled by opponent ELO. At equal ELO 1000, AI gives ~33, human gives 100 (enough for pack).
function calculateStarlight(opponentElo, isAI) {
  const base = 20;
  const eloScaling = Math.max(0, Math.round((opponentElo - 600) / 15)); // ~27 at elo 1000
  let amount = base + eloScaling;
  if(isAI) amount = Math.max(1, Math.round(amount / 2));
  else amount *= 3;
  return Math.round(amount);
}

// Independent post-win drop rolls
function freePackChance(opponentElo) {
  return 0.10;
}

function favoredPackChance() {
  return 0.025;
}

function profilePackChance() {
  return 0.15;
}

function awardVictoryDrops(didWin) {
  if(!didWin) return [];
  const drops = [];
  if(Math.random() < freePackChance()){
    USER_PROFILE.unopenedPacks = (USER_PROFILE.unopenedPacks||0) + 1;
    drops.push('Fates Entwined booster');
  }
  if(Math.random() < favoredPackChance()){
    USER_PROFILE.unopenedFavoredPacks = (USER_PROFILE.unopenedFavoredPacks||0) + 1;
    drops.push('Favored Fates Entwined booster');
  }
  if(Math.random() < profilePackChance()){
    USER_PROFILE.unopenedProfilePacks = (USER_PROFILE.unopenedProfilePacks||0) + 1;
    drops.push('Profile Picture Booster');
  }
  return drops;
}

function showDropBar(drops) {
  clearTimeout(window._fateDropBarTimer);
  var existing = document.getElementById('fate-drop-bar');
  if(existing) existing.remove();
  var bar = document.createElement('div');
  bar.id = 'fate-drop-bar';
  bar.className = 'fate-drop-bar';
  bar.innerHTML = '<span class="drop-bar-icon">&#127873;</span><span class="drop-bar-text">' + 
    drops.map(function(d){ return '<strong>' + d + '</strong>'; }).join(' &middot; ') + 
    ' dropped!</span>';
  document.body.appendChild(bar);
  requestAnimationFrame(function(){ bar.classList.add('on'); });
  window._fateDropBarTimer = setTimeout(function(){
    bar.classList.remove('on');
    bar.classList.add('out');
    setTimeout(function(){ if(bar.parentNode) bar.remove(); }, 450);
  }, 5200);
}
window.showDropBar = showDropBar;
window.clearDropBar = function(){
  clearTimeout(window._fateDropBarTimer);
  var el = document.getElementById('fate-drop-bar');
  if(el) el.remove();
};

// â”€â”€â”€ MATCH RESULT RECORDING (mode-aware) â”€â”€â”€
function normalizeResultOptions(opts){
  return opts && typeof opts === 'object' ? opts : {};
}
function zeroXpResult(){
  return { xpGained:0, levelsGained:0, newLevel:USER_PROFILE.level };
}

// Free Play: XP only, no ELO change and no permanent win/loss tracking.
function recordFreePlayResult(didWin, opponentElo=1000, opts={}) {
  opts = normalizeResultOptions(opts);
  const xpAmount = Math.floor(calculateXpReward(didWin, opponentElo) * 0.5); // Half XP in free play
  const xpResult = (opts.forfeit || opts.skipXp) ? zeroXpResult() : awardXp(xpAmount);
  const drops = (opts.forfeit || opts.skipDrops) ? [] : awardVictoryDrops(didWin);
  USER_PROFILE.matchesPlayed = (Number(USER_PROFILE.matchesPlayed) || 0) + 1;
  saveProfile();
  if(drops.length) showDropBar(drops);
  return {eloChange:0, xpGained:xpResult.xpGained, levelsGained:xpResult.levelsGained, newLevel:xpResult.newLevel};
}

// Challenger: uses challengerElo, separate win/loss counters. AI and human matches
// use the same ELO/XP curve; Starlight rewards stay tuned separately.
function recordChallengerResult(didWin, opponentElo=1000, isAI=false, opts={}) {
  if(isAI && typeof isAI === 'object'){
    opts = isAI;
    isAI = !!opts.isAI;
  }
  opts = normalizeResultOptions(opts);
  if(isAI && !(opts && opts.forfeit) && typeof window.clearPendingAiChallengeForfeit === 'function') window.clearPendingAiChallengeForfeit();
  if(!USER_PROFILE.challengerElo) USER_PROFILE.challengerElo = 600;
  const myElo = USER_PROFILE.challengerElo;
  const K = didWin ? 32 : 40; // losses sting more
  const expected = 1 / (1 + Math.pow(10, (opponentElo - myElo) / 400));
  const actual = didWin ? 1 : 0;
  let change = K * (actual - expected);
  change = typeof applyMinimumEloDelta === 'function' ? applyMinimumEloDelta(change, didWin) : Math.round(change);
  USER_PROFILE.challengerElo = Math.max(0, myElo + change);
  if(didWin) USER_PROFILE.challengerWins = (USER_PROFILE.challengerWins||0)+1;
  else USER_PROFILE.challengerLosses = (USER_PROFILE.challengerLosses||0)+1;
  USER_PROFILE.matchesPlayed = (Number(USER_PROFILE.matchesPlayed) || 0) + 1;
  if(!isAI) {
    if(didWin) USER_PROFILE.humanWins = (Number(USER_PROFILE.humanWins) || 0) + 1;
    else USER_PROFILE.humanLosses = (Number(USER_PROFILE.humanLosses) || 0) + 1;
  }
  // Check for new division reward
  if(typeof checkDivisionReward === 'function') checkDivisionReward(USER_PROFILE.challengerElo);
  // Log match to history
  const oppName = G._selectedAI ? G._selectedAI.name : 'Opponent';
  if(typeof logMatch === 'function') logMatch(USER_PROFILE.username, oppName, didWin?USER_PROFILE.username:oppName, change, -change, USER_PROFILE.challengerElo, opponentElo + (didWin?-Math.abs(change):Math.abs(change)), false);
  // XP still awarded unless this match ended by forfeit.
  const xpAmount = calculateXpReward(didWin, opponentElo);
  const xpResult = (opts.forfeit || opts.skipXp) ? zeroXpResult() : awardXp(xpAmount);
  const drops = (opts.forfeit || opts.skipDrops) ? [] : awardVictoryDrops(didWin);
  saveProfile();
  if(drops.length) showDropBar(drops);
  return {eloChange:change, xpGained:xpResult.xpGained, levelsGained:xpResult.levelsGained, newLevel:xpResult.newLevel};
}

const FATE_PENDING_AI_CHALLENGE_FORFEIT_KEY = 'fate.pendingAiChallengeForfeit.v1';

function getPendingAiChallengeForfeit() {
  try {
    const raw = localStorage.getItem(FATE_PENDING_AI_CHALLENGE_FORFEIT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e) {
    return null;
  }
}

function markPendingAiChallengeForfeit(ai) {
  if(!ai || CURRENT_MODE !== 'challenger') return;
  try {
    const entry = {
      id:'ai-' + Date.now() + '-' + Math.random().toString(36).slice(2),
      createdAt:Date.now(),
      name:String(ai.name || 'AI Opponent'),
      elo:Number(ai.elo || ai.trueElo || 600) || 600,
      img:ai.img || ai.profileImg || 'blank.png',
      username:USER_PROFILE?.username || 'Player'
    };
    localStorage.setItem(FATE_PENDING_AI_CHALLENGE_FORFEIT_KEY, JSON.stringify(entry));
  } catch(e) {}
}

function clearPendingAiChallengeForfeit() {
  try { localStorage.removeItem(FATE_PENDING_AI_CHALLENGE_FORFEIT_KEY); } catch(e) {}
}

function processPendingAiChallengeForfeit() {
  const pending = getPendingAiChallengeForfeit();
  if(!pending || !pending.name) return;
  clearPendingAiChallengeForfeit();
  const prevMode = CURRENT_MODE;
  const prevSelected = G._selectedAI;
  const prevElo = G._aiOpponentElo;
  try {
    CURRENT_MODE = 'challenger';
    G._selectedAI = {name:pending.name, elo:Number(pending.elo || 600) || 600, img:pending.img || 'blank.png'};
    G._aiOpponentElo = Number(pending.elo || 600) || 600;
    recordChallengerResult(false, G._aiOpponentElo, true, {forfeit:true, skipXp:true, skipDrops:true});
    if(typeof toast === 'function') toast('AI challenge forfeited: ELO deducted');
  } catch(e) {
    console.warn('Failed to apply pending AI challenge forfeit', e);
  } finally {
    CURRENT_MODE = prevMode;
    G._selectedAI = prevSelected || null;
    G._aiOpponentElo = prevElo;
  }
}

window.markPendingAiChallengeForfeit = markPendingAiChallengeForfeit;
window.clearPendingAiChallengeForfeit = clearPendingAiChallengeForfeit;
window.processPendingAiChallengeForfeit = processPendingAiChallengeForfeit;
setTimeout(processPendingAiChallengeForfeit, 0);

// Hook into awardXp: grant starlight on level-up (enough for ~2 packs, scales up)
const _origAwardXp = awardXp;
awardXp = function(amount){
  const before = USER_PROFILE.level;
  const result = _origAwardXp(amount);
  if(typeof updateDailyChallengeProgress === 'function' && amount > 0){
    updateDailyChallengeProgress('xpEarned', amount, 'add');
  }
  if(result.levelsGained > 0){
    // Distribute starlight for each level gained. Scales: ~200 at low levels, more at higher.
    let totalStarlight = 0;
    for(let i=0;i<result.levelsGained;i++){
      const lvl = before + i + 1;
      const reward = PACK_COST_STARLIGHT * 2 + Math.floor(lvl*8); // 2 packs + bonus
      totalStarlight += reward;
    }
    USER_PROFILE.starlight = (USER_PROFILE.starlight||0) + totalStarlight;
    if(typeof updateDailyChallengeProgress === 'function') updateDailyChallengeProgress('starlightEarned', totalStarlight, 'add');
    saveProfile();
    toast(`Level ${result.newLevel}! +${totalStarlight} Starlight`);
  }
  return result;
};

// â”€â”€â”€ STARTER DECKS (no Star cards) â”€â”€â”€
// Each uses 40 cards. Multiplayer-safe: ids only, resolved via CARDS array at runtime.
const STARTER_DECKS = [
  {
    id: 'starter_maelstrom',
    name: 'Relentless Maelstrom',
    description: 'Consolidate for Alondra Hopkins, then stack Fate on her with recycled buff supporters.',
    theme: 'Concentrated Fate',
    faceCardId: '14',
    displayCardIds: ['14','06','27','76','44','65','20'],
    ids: [
      '14','14','14','06','06','27','27','13','13','13',
      '47','47','47','05','05','05','58','58','58','60','60','60',
      '75','75','75','32','32','32','44','44','44','76','76','76',
      '65','65','65','20','20','20'
    ]
  },
  {
    id: 'starter_freeworld',
    name: 'The Free World',
    description: 'Flood the board with Third Great War cards, then declare the affiliation with Duncan Heyward for massive bonuses.',
    theme: 'Affiliation',
    faceCardId: '29',
    displayCardIds: ['29','77','01','13','42','59','28'],
    ids: [
      '77','77','77','29','29','29','13','13','13','01','01',
      '22','22','06','06','18','18','18','37','37','37',
      '42','42','42','59','59','59','28','28','09','09','09',
      '63','63','32','32','32','60','60','60'
    ]
  },
  {
    id: 'starter_incel',
    name: 'Reign of the Furious Incel',
    description: "Recycle Oathbound Noble Fighter procs to supercharge Jimmy's passive Fate gain. Use Lina to search out Jimmy.",
    theme: 'Fate Leech',
    faceCardId: '41',
    displayCardIds: ['41','10','08','70','36','31','58'],
    ids: [
      '41','41','41','10','10','10','06','06','13','13','13',
      '70','36','36','08','08','31','31','31','58','58','58',
      '75','75','75','60','60','60','09','09','09','32','32','32',
      '42','42','42','52','52','52'
    ]
  },
  {
    id: 'starter_assault',
    name: 'Mass Assault Doctrine',
    description: 'Stack Czechoslovak Maroon Knights, Greek Hoplites and Anne Stone in the same zone for huge supporter bonuses.',
    theme: 'Supporters',
    faceCardId: '11',
    displayCardIds: ['11','63','43','59','25','16','05'],
    ids: [
      '11','11','11','13','13','13','22','22','43','43','28',
      '63','63','63','28','25','25','59','59','59','09','09','09',
      '05','05','05','68','68','68','16','16','16','60','60','60',
      '32','32','32','42','42'
    ]
  }
];

const AI_ONLY_RANDOM_DECKS = [
  {
    id: 'starter_maelstrom_2',
    baseStrategy: 'starter_maelstrom',
    name: 'Relentless Maelstrom 2',
    description: 'A sharper Maelstrom shell with stronger supporter recursion, movement pressure and consolidation ambushes.',
    theme: 'Concentrated Fate',
    faceCardId: '14',
    displayCardIds: ['14','06','27','69','54','44','20'],
    ids: [
      '14','14','14','06','06','06','27','27','27','13','13','13',
      '47','47','47','05','05','05','58','58','58','75','75','75',
      '69','69','69','20','20','20','44','44','44','54','54','54',
      '65','65','76','76'
    ]
  },
  {
    id: 'starter_freeworld_2',
    baseStrategy: 'starter_freeworld',
    name: 'Free World 2',
    description: 'A stronger Third Great War list that floods the board, digs harder for Duncan, and protects its zone plan.',
    theme: 'Affiliation',
    faceCardId: '29',
    displayCardIds: ['29','77','01','71','59','37','28'],
    ids: [
      '77','77','77','29','29','29','13','13','13','01','01','01',
      '22','22','22','60','60','60','42','42','42','59','59','59',
      '28','28','28','09','09','09','37','37','37','18','18','18',
      '63','63','71','71'
    ]
  },
  {
    id: 'starter_incel_2',
    baseStrategy: 'starter_incel',
    name: 'Furious Incel 2',
    description: "A nastier Reality shell that loops more pressure, hand disruption and Fate-loss triggers into Jimmy's scaling.",
    theme: 'Fate Leech',
    faceCardId: '41',
    displayCardIds: ['41','10','08','30','31','69','72'],
    ids: [
      '41','41','41','10','10','10','08','08','08','30','30','30',
      '31','31','31','58','58','58','75','75','75','60','60','60',
      '42','42','42','69','69','69','72','72','72','32','32','18',
      '18','68','68','61'
    ]
  },
  {
    id: 'starter_assault_2',
    baseStrategy: 'starter_assault',
    name: 'Mass Assault 2',
    description: 'A heavier supporter swarm that snowballs Anne, Jeremiah and the Maroon Knights while keeping pressure on the board.',
    theme: 'Supporters',
    faceCardId: '11',
    displayCardIds: ['11','57','59','63','25','16','69'],
    ids: [
      '11','11','11','57','57','57','59','59','59','63','63','63',
      '25','25','25','16','16','16','05','05','05','60','60','60',
      '69','69','69','75','75','75','43','43','28','28','42','42',
      '68','68','71','32'
    ]
  },
  {
    id: 'starter_soft_suppression',
    baseStrategy: 'starter_soft_suppression',
    name: 'Soft Suppression',
    description: 'Searches hard for Carolyn and Zoe to lock cells, builds a Hoplite control zone, and uses Maria as secondary pressure.',
    theme: 'Reality',
    faceCardId: '17',
    displayCardIds: ['17','04','63','61','06','60','71'],
    ids: [
      '17','17','17','04','04','04','61','61','61','63','63','63',
      '06','06','06','13','13','13','60','60','60','16','16','16',
      '18','18','18','71','71','71','42','42','42','62','62','64',
      '64','58','58','32'
    ]
  },
  {
    id: 'ai_blitz',
    baseStrategy: 'ai_blitz',
    name: 'Blitz',
    description: 'AI-only contested-row pressure deck built around Polish-Lithuanian Infantry, Zimbabwean Honor Guard, Maja and Hoplites.',
    theme: 'AI Only - Third Great War',
    faceCardId: '07',
    displayCardIds: ['07','25','28','63','45','76','65'],
    ids: [
      '07','79','25','25','25','28','28','28','63','63',
      '63','45','45','65','65','65','76','76','76','06',
      '06','06','13','13','13','29','29','60','60','60',
      '05','05','05','59','59','42','42','09','09','68'
    ]
  },
  {
    id: 'ai_coordinators_dream',
    baseStrategy: 'ai_coordinators_dream',
    name: "Coordinator's Dream",
    description: 'AI-only stacked-coordinator deck that keeps Zsofia, Kvetka, Cathy and Alexander together in one zone.',
    theme: 'AI Only - Coordinators',
    faceCardId: '23',
    displayCardIds: ['23','15','19','35','08','68','24'],
    ids: [
      '15','15','15','19','19','19','23','23','23','35',
      '35','08','08','08','68','68','68','24','24','24',
      '60','60','60','32','32','32','58','58','58','75',
      '75','75','69','69','05','05','05','59','59','09'
    ]
  },
  {
    id: 'ai_henrys_conviction',
    baseStrategy: 'ai_henrys_conviction',
    name: "Henry's Conviction",
    description: 'AI-only draw-and-recycle deck that digs for Henry, keeps cards in hand, then feeds his effect.',
    theme: 'AI Only - Third Great War',
    faceCardId: '21',
    displayCardIds: ['21','29','06','27','32','63','58'],
    ids: [
      '21','21','21','29','29','29','06','06','06','27',
      '27','27','32','32','32','58','58','58','75','75',
      '75','69','69','69','13','13','13','63','63','63',
      '60','60','60','42','42','42','05','05','09','09'
    ]
  },
  {
    id: 'ai_howards_choice',
    baseStrategy: 'ai_howards_choice',
    name: "Howard's Choice",
    description: 'AI-only reactive deck that prioritizes Chingachlook and Phil, with Lydia/Carolyn disruption and Hoplite pressure.',
    theme: 'AI Only - Reactive',
    faceCardId: '03',
    displayCardIds: ['03','45','46','56','17','67','76'],
    ids: [
      '03','03','63','63','63','76','76','76','45','45',
      '45','56','56','17','17','08','08','08','46','46',
      '46','67','67','06','06','06','60','60','68','68',
      '24','24','32','32','58','58','75','75','05','05'
    ]
  },
  {
    id: 'ai_investing_future',
    baseStrategy: 'ai_investing_future',
    name: 'Investing in the Future',
    description: 'AI-only Phil acceleration deck that searches all three copies early, then recycles supporter boosts.',
    theme: 'AI Only - Reality',
    faceCardId: '46',
    displayCardIds: ['46','08','06','47','05','76','65'],
    ids: [
      '46','46','46','08','08','08','06','06','06','47',
      '47','47','05','05','05','58','58','58','75','75',
      '75','69','69','69','03','03','76','76','76','65',
      '65','65','60','60','60','32','32','32','13','13'
    ]
  },
  {
    id: 'ai_royal_flush',
    baseStrategy: 'ai_royal_flush',
    name: 'Royal Flush',
    description: 'AI-only royal coordinator deck that assembles Kvetka, Zsofia, Felicyta, Jeremiah and Duncan in one zone.',
    theme: 'AI Only - Royal',
    faceCardId: '77',
    displayCardIds: ['77','19','15','01','57','24','68'],
    ids: [
      '19','19','19','15','15','15','01','01','01','57',
      '57','57','77','77','77','24','24','24','68','68',
      '68','60','60','60','32','32','32','05','05','05',
      '58','58','58','75','75','75','69','69','59','59'
    ]
  },
  {
    id: 'ai_fat_jake',
    baseStrategy: 'ai_fat_jake',
    name: 'Fat Jake',
    description: 'AI-only Jake deck copied from the posted preview. It feeds Jake with supporter density, draw, recursion and broad set pressure.',
    theme: 'Custom',
    faceCardId: '38',
    displayCardIds: ['38','25','28','32','58','75','76'],
    ids: [
      '25','25','28','28','32','32','32','44','44','44',
      '47','47','47','58','58','58','60','60','60','75',
      '75','75','76','76','76','05','05','05','13','13',
      '13','27','27','27','06','06','03','38','38','38'
    ]
  },
  {
    id: 'ai_hand_leech',
    baseStrategy: 'ai_hand_leech',
    name: 'Hand Leech',
    description: 'AI-only hand disruption deck copied from the posted preview. It stacks reveal, discard and steal effects behind sturdy supporter setup.',
    theme: 'Custom',
    faceCardId: '14',
    displayCardIds: ['14','16','20','72','75','61','06'],
    ids: [
      '16','16','16','20','28','28','32','32','32','58',
      '58','58','60','60','60','71','71','71','72','72',
      '72','75','75','75','05','05','05','09','09','09',
      '06','06','06','56','61','61','61','14','14','14'
    ]
  },
  {
    id: 'ai_movement',
    baseStrategy: 'ai_movement',
    name: 'Movement',
    description: 'AI-only movement deck copied from the posted preview. It leans on Busser, Expeditionary and Juan Carlos to keep cards shifting into better squares.',
    theme: 'Custom',
    faceCardId: '39',
    displayCardIds: ['39','25','28','69','73','27','15'],
    ids: [
      '25','25','28','28','31','31','32','32','32','60',
      '60','60','69','69','69','70','70','70','73','73',
      '73','05','05','05','27','27','27','13','13','13',
      '06','06','06','15','15','15','39','39','39','03'
    ]
  }
];

function getAIDeckPoolForOpponent(opp) {
  const starterPool = Array.isArray(STARTER_DECKS) ? STARTER_DECKS : [];
  const advancedPool = Array.isArray(AI_ONLY_RANDOM_DECKS) ? AI_ONLY_RANDOM_DECKS : [];
  if(!advancedPool.length) return starterPool;
  const protectedRanks = new Set(['Footman']);
  if(opp && protectedRanks.has(opp.rank)) return starterPool;
  return advancedPool;
}

let _challengerAssetWarmupStarted = false;
const _challengerAssetWarmupImages = [];
function preloadChallengerAssets() {
  if(_challengerAssetWarmupStarted) return;
  _challengerAssetWarmupStarted = true;
  const srcs = new Set([
    'optimized/backgrounds/titlscreenbackgrounds_bg2.jpg',
    'optimized/backgrounds/titlscreenbackgrounds_bg3.jpg',
    'play1.png',
    'play2.png',
    'Illustration3.png',
    'pfpbooster.png',
    'booster1.png',
    'blank.png',
    'optimized/backgrounds/ingamebackgrouds_igb1.jpg',
    'optimized/backgrounds/ingamebackgrouds_igb4.jpg',
    'optimized/backgrounds/ingamebackgrouds_igb9.jpg'
  ]);
  try {
    if(typeof getChallengerCardPool === 'function') {
      getChallengerCardPool().slice(0, 32).forEach(card => {
        if(card && card.img) {
          srcs.add(typeof getRuntimeCardImageSrc === 'function' ? getRuntimeCardImageSrc(card.img, 'thumb') : card.img);
        }
      });
    }
  } catch(e) {}

  const list = [...srcs].filter(Boolean).map(src => (
    typeof FATE_BACKGROUND_URL === 'function' && /backgrounds|titlscreenbackgrounds|ingamebackgrouds/.test(src)
      ? FATE_BACKGROUND_URL(src)
      : src
  ));
  const loadBatch = (start=0) => {
    const end = Math.min(start + 8, list.length);
    for(let i = start; i < end; i++) {
      const img = new Image();
      img.decoding = 'async';
      img.loading = 'eager';
      img.src = list[i];
      _challengerAssetWarmupImages.push(img);
      if(i < 14 && typeof img.decode === 'function') img.decode().catch(()=>{});
    }
    if(end < list.length) {
      const schedule = window.requestIdleCallback || ((fn)=>setTimeout(fn, 60));
      schedule(()=>loadBatch(end));
    }
  };
  loadBatch();
}

try {
  window.fateWarmChallengerMenuAssets = preloadChallengerAssets;
} catch(e) {}

// â”€â”€â”€ TITLE SCREEN ENTRY POINTS â”€â”€â”€
let _freePlayMenuOpeningAt = 0;
let _freePlayMenuHtmlCache = '';
let _freePlayWarmupPromise = null;

const FREE_PLAY_MENU_IMAGES = [
  {
    key:'chosen',
    src:'optimized/backgrounds/ingamebackgrouds_igb9.jpg',
    fallback:'ingamebackgrouds/igb9.png?v=bg20260510d'
  },
  {
    key:'random',
    src:'optimized/backgrounds/ingamebackgrouds_igb4.jpg',
    fallback:'ingamebackgrouds/igb4.png?v=bg20260510d'
  },
  {
    key:'human',
    src:'optimized/backgrounds/ingamebackgrouds_igb1.jpg',
    fallback:'ingamebackgrouds/igb1.png?v=bg20260510d'
  }
];

function getFreePlayImageSrc(path) {
  return typeof FATE_BACKGROUND_URL === 'function' ? FATE_BACKGROUND_URL(path) : path;
}

function getFreePlayMenuImage(key) {
  return FREE_PLAY_MENU_IMAGES.find(img => img.key === key) || FREE_PLAY_MENU_IMAGES[0];
}

function renderFreePlayArt(key) {
  const img = getFreePlayMenuImage(key);
  return `<span class="freeplay-mode-art"><img src="${getFreePlayImageSrc(img.src)}" alt="" loading="eager" decoding="async" fetchpriority="high" draggable="false" onerror="this.onerror=null;this.src='${img.fallback}';"></span>`;
}

function buildFreePlayMenuHtml() {
  if(_freePlayMenuHtmlCache) return _freePlayMenuHtmlCache;
  _freePlayMenuHtmlCache = `<div class="freeplay-mode-shell">
      <section class="freeplay-mode-hero">
        <div>
          <div class="freeplay-mode-kicker">Practice Table</div>
          <h2>Choose a Free Play Match</h2>
          <p>Pick a controlled AI duel, roll a random opponent, or queue into a human match with your title-screen presets.</p>
        </div>
        <div class="freeplay-mode-mark"><img class="freeplay-mode-mark-icon" src="blank.png" alt="" loading="eager" decoding="async" draggable="false"></div>
      </section>
      <div class="freeplay-mode-grid">
        <button class="freeplay-mode-card chosen" type="button" onclick="closeModal();setTimeout(()=>showAIDifficultyPicker(),140);">
          ${renderFreePlayArt('chosen')}
          <span class="freeplay-mode-copy">
            <span class="freeplay-mode-label">Chosen AI</span>
            <b>Select Your Rival</b>
            <em>Choose an AI opponent.</em>
          </span>
          <span class="freeplay-mode-cta">Choose AI</span>
        </button>
        <button class="freeplay-mode-card random" type="button" onclick="closeModal();setTimeout(()=>startRandomAiFreePlay(),140);">
          ${renderFreePlayArt('random')}
          <span class="freeplay-mode-copy">
            <span class="freeplay-mode-label">Random AI</span>
            <b>Quick Skirmish</b>
            <em>Get an instant opponent roll and jump into a practice match with less setup.</em>
          </span>
          <span class="freeplay-mode-cta">Roll Opponent</span>
        </button>
        <button class="freeplay-mode-card human" type="button" onclick="closeModal();setTimeout(()=>startFreePlayMatchmaking(),140);">
          ${renderFreePlayArt('human')}
          <span class="freeplay-mode-copy">
            <span class="freeplay-mode-label">Free Play Vs Human</span>
            <b>Human Queue</b>
            <em>Match with another player using a title-screen deck builder preset.</em>
          </span>
          <span class="freeplay-mode-cta">Find Player</span>
        </button>
      </div>
    </div>`;
  return _freePlayMenuHtmlCache;
}

function warmFreePlayMenuAssets() {
  if(_freePlayWarmupPromise) return _freePlayWarmupPromise;
  buildFreePlayMenuHtml();
  const sources = ['blank.png', ...FREE_PLAY_MENU_IMAGES.map(img => getFreePlayImageSrc(img.src))];
  _freePlayWarmupPromise = Promise.all(sources.map(src => new Promise(resolve => {
    const img = new Image();
    let done = false;
    const finish = () => {
      if(done) return;
      done = true;
      resolve(src);
    };
    const timer = setTimeout(finish, 1800);
    img.onload = () => { clearTimeout(timer); finish(); };
    img.onerror = () => { clearTimeout(timer); finish(); };
    try { img.decoding = 'async'; } catch(e) {}
    try { img.loading = 'eager'; } catch(e) {}
    img.src = src;
    if(typeof img.decode === 'function') img.decode().then(() => {
      clearTimeout(timer);
      finish();
    }).catch(() => {});
  })));
  return _freePlayWarmupPromise;
}

try {
  window.fateBuildFreePlayMenuHtml = buildFreePlayMenuHtml;
  window.fateWarmFreePlayMenuAssets = warmFreePlayMenuAssets;
} catch(e) {}

function openFreePlayMenu(options) {
  const opts = options || {};
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  if(!opts.force && now - _freePlayMenuOpeningAt < 220) return;
  _freePlayMenuOpeningAt = now;
  CURRENT_MODE = 'free';
  closeAllOverlays();
  seedBuiltInPresets();
  syncStarterPresetMetadata();
  warmFreePlayMenuAssets();
  showModal(
    'Free Play',
    buildFreePlayMenuHtml(),
    [{label:'Cancel', action:closeModal}],
    {immediate:true, skipDecorate:true}
  );
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox) modalBox.classList.add('freeplay-mode-modal');
}


// ─── OPPONENT FOUND OVERLAY (standalone, no modal) ───
function showOpponentFound(ai, aiWins, aiLosses, onContinue) {
  playSfx('starPlace');
  removeOpponentFound(); // clean up any existing
  const aiImg = typeof getAIProfileImg === 'function' ? getAIProfileImg(ai, 'circle') : (ai.img || ai.profileImg || null);
  const el = document.createElement('div');
  el.id = 'opponent-found-overlay';
  el.className = 'opp-found-overlay';
  el.innerHTML = `
    <div class="ai-found-card">
      <div class="ai-found-label">OPPONENT FOUND</div>
      <div class="ai-found-pic">
        ${aiImg?'<img src="'+aiImg+'">':'<span>AI</span>'}
      </div>
      <div class="ai-found-name">${escapeHtml(ai.name)}</div>
      <div style="margin:.2rem auto;">${renderRankBadge(ai.elo)}</div>
      <div class="ai-found-elo">${ai.elo} ELO</div>
      <div class="ai-found-stats">
        <div><span class="ai-found-w">${aiWins}</span><span class="ai-found-lbl">W</span></div>
        <div><span class="ai-found-l">${aiLosses}</span><span class="ai-found-lbl">L</span></div>
      </div>
      <button class="btn sm pri ai-found-btn" id="opp-found-btn">Continue</button>
    </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(()=> el.classList.add('on'));
  document.getElementById('opp-found-btn').onclick = () => {
    removeOpponentFound();
    onContinue();
  };
}
function removeOpponentFound() {
  const el = document.getElementById('opponent-found-overlay');
  if(el) el.remove();
}
window.removeOpponentFound = removeOpponentFound;

window.startRandomAiFreePlay = function(){
  const aiList = typeof getRandomMatchAIOpponents === 'function' ? getRandomMatchAIOpponents() : AI_OPPONENTS;
  if(!Array.isArray(aiList) || aiList.length===0){
    toast('No AI opponents available');
    return;
  }
  CURRENT_MODE = 'free';
  const ai = aiList[Math.floor(Math.random() * aiList.length)];
  const lbEntry = LEADERBOARD.find(e=>e.username===ai.name);
  const aiWins = lbEntry?.wins || 0;
  const aiLosses = lbEntry?.losses || 0;
  showOpponentFound(ai, aiWins, aiLosses, ()=> selectAIOpponent(ai));
};

window.startFreePlayMatchmaking = function(){
  CURRENT_MODE = 'free';
  G._aiRewardMultiplier = 1;
  const presets = getDeckPickPresetsForCurrentMode();
  const keys = Object.keys(presets);
  if(keys.length > 0){
    G._pickDeckAfterMatchmaking = true;
    renderChallengerDeckPickModal(0);
  } else if(G.p1Deck && G.p1Deck.length === 40){
    // Use title screen deck directly
    window.FATE_ONLINE_PENDING_ROOM_DECK = {
      selectedDeckKey:'custom',
      selectedDeckName:'Current Custom Deck',
      deckIds:[...G.p1Deck]
    };
    showMatchmakingScreen({onlineQueue:true, queueMode:'freeplay'});
  } else {
    toast('Build a deck first in the Deck Builder or Challenger mode');
  }
};

function openChallengerMenu() {
  CURRENT_MODE = 'challenger';
  closeAllOverlays();
  seedBuiltInPresets();
  syncStarterPresetMetadata();
  preloadChallengerAssets();
  if(!USER_PROFILE.starterChosen){
    showStarterPick();
  } else {
    showScreen('s-challenger');
    switchChTab('play');
  }
}

// â”€â”€â”€ STARTER PICK â”€â”€â”€
function showStarterPick() {
  showScreen('s-starter-pick');
  const grid = document.getElementById('starter-deck-grid');
  grid.innerHTML = '';
  STARTER_DECKS.forEach(deck=>{
    const face = CARDS.find(c=>c.id===deck.faceCardId);
    const useCanvasPreview = false;
    const el = document.createElement('div');
    el.className = 'starter-deck-card';
    el.innerHTML = `
      <div class="starter-deck-art">${useCanvasPreview ? '<canvas class="canvas-deck-preview-hero" aria-hidden="true"></canvas>' : (face?.img ? `<img src="${face.img}" alt="" onerror="this.style.display='none'">` : '')}</div>
      <div class="starter-deck-body">
        <div class="starter-deck-title">${escapeHtml(deck.name)}</div>
        <div class="starter-deck-desc">${escapeHtml(deck.description)}</div>
        <button class="btn pri starter-deck-pick-btn">Choose This Deck</button>
      </div>`;
    el.querySelector('button').onclick = ()=>pickStarterDeck(deck.id);
    grid.appendChild(el);
    if(useCanvasPreview) scheduleCanvasDeckPreviewTile(el, {hero: face, minis: []});
  });
}

function pickStarterDeck(starterId) {
  const deck = STARTER_DECKS.find(d=>d.id===starterId);
  if(!deck) return;
  // Grant all cards in the starter deck to the profile
  if(!USER_PROFILE.ownedCards) USER_PROFILE.ownedCards = {};
  deck.ids.forEach(id=>{
    USER_PROFILE.ownedCards[id] = (USER_PROFILE.ownedCards[id]||0) + 1;
  });
  // Save deck as a challenger preset
  if(!USER_PROFILE.challengerPresets) USER_PROFILE.challengerPresets = {};
  const pid = createChallengerDeckId('ch_'+starterId);
  USER_PROFILE.challengerPresets[pid] = {
    name: deck.name,
    description: deck.description,
    theme: deck.theme,
    ids: [...deck.ids],
    faceCardId: deck.faceCardId,
    displayCardIds: deck.displayCardIds,
    starter: true,
    lockedStarter: true,
    starterId: deck.id
  };
  USER_PROFILE.unopenedProfilePacks = (USER_PROFILE.unopenedProfilePacks||0) + 3;
  USER_PROFILE.unopenedPacks = (USER_PROFILE.unopenedPacks||0) + 3;
  G.p1Deck = [...deck.ids];
  G.dbCurrentPlayer = 0;
  USER_PROFILE.starterChosen = true;
  saveProfile();
  toast(`${deck.name} chosen! 3 Profile Boosters + 3 Fates Entwined Boosters added.`);
  setTimeout(()=>{
    showScreen('s-challenger');
    switchChTab('play');
  },700);
}

// â”€â”€â”€ CHALLENGER HUB UI â”€â”€â”€
let _currentChTab = 'play';
const _chTabDomState = {};

function cleanupChTabPaneBeforeDetach(pane) {
  if(!pane) return;
  try {
    const tab = pane.dataset && pane.dataset.tab;
    if(tab) {
      _chTabDomState[tab] = _chTabDomState[tab] || {};
      _chTabDomState[tab].scrollTop = pane.scrollTop || 0;
      const scroller = pane.querySelector('.cdb-collection,.cdb-decklist,.collection-grid,[data-preserve-scroll]');
      if(scroller) _chTabDomState[tab].innerScrollTop = scroller.scrollTop || 0;
      if(window.FateMenuViews && typeof window.FateMenuViews.markDetached === 'function') {
        window.FateMenuViews.markDetached('challenger:' + tab);
      }
    }
    pane.querySelectorAll('.canvas-card-grid-mode').forEach(node=>{
      if(typeof node.__fateCanvasGridCleanup === 'function') node.__fateCanvasGridCleanup();
    });
  } catch(e) {}
}

function getChTabPane(tab, create=true) {
  const content = document.getElementById('ch-content');
  if(!content) return null;
  if(create && content.dataset.persistentTabs !== '1') {
    content.innerHTML = '';
    content.dataset.persistentTabs = '1';
  }
  let pane = content.querySelector(':scope > .ch-tab-pane[data-tab="'+tab+'"]');
  if(!pane && create) {
    pane = document.createElement('div');
    pane.className = 'ch-tab-pane';
    pane.dataset.tab = tab;
    pane.hidden = true;
    pane.style.display = 'none';
    content.appendChild(pane);
  }
  if(pane) pane.classList.toggle('ch-cdb-content', tab === 'deckbuilder');
  return pane;
}

function getChRendererForTab(tab) {
  return {
    play:renderChPlayTab,
    campaign:window.renderChCampaignTab,
    lore:window.renderChLoreTab,
    store:renderChStoreTab,
    collection:renderChCollectionTab,
    deckbuilder:renderChDeckBuilderTab
  }[tab] || null;
}

function getChTabStateSig(tab) {
  const p = typeof USER_PROFILE !== 'undefined' ? USER_PROFILE : {};
  const presets = p.challengerPresets || {};
  const owned = p.ownedCards || {};
  const cdbDeck = typeof _cdbDeck !== 'undefined' && Array.isArray(_cdbDeck) ? _cdbDeck.join(',') : '';
  const cdbSaved = typeof _cdbCurrentDeckId !== 'undefined' ? (_cdbCurrentDeckId || '') : '';
  const base = [
    tab,
    p.starlight || 0,
    p.unopenedPacks || 0,
    p.unopenedProfilePacks || 0,
    p.challengerElo || 600,
    Object.keys(presets).sort().map(k=>{
      const deck = presets[k] || {};
      return k + ':' + (deck.name || '') + ':' + (deck.ids || []).join(',');
    }).join('|')
  ];
  if(tab === 'store' || tab === 'collection') {
    base.push(Object.keys(owned).sort().map(k=>k+':' + owned[k]).join(','));
  }
  if(tab === 'deckbuilder') base.push(cdbSaved, cdbDeck);
  return base.join('||');
}

function ensureChTabMenuView(tab) {
  if(!window.FateMenuViews) return;
  window.FateMenuViews.register('challenger:' + tab, {
    root:()=>getChTabPane(tab),
    signature:()=>getChTabStateSig(tab),
    render:({root})=>{
      const render = getChRendererForTab(tab);
      if(typeof render !== 'function') return false;
      render(root);
      root.dataset.mounted = '1';
      return true;
    },
    onFresh:({root})=>{
      if(root) root.dataset.mounted = '1';
    }
  });
}

function resolveChRenderTarget(content, tab) {
  const parent = document.getElementById('ch-content');
  if(content === parent) return getChTabPane(tab);
  return content;
}

function setChTabPaneVisibility(content, activePane) {
  if(!content || !activePane) return;
  Array.from(content.querySelectorAll(':scope > .ch-tab-pane')).forEach(node=>{
    const active = node === activePane;
    node.hidden = false;
    node.removeAttribute('hidden');
    node.style.display = '';
    node.classList.toggle('active', active);
    node.setAttribute('aria-hidden', active ? 'false' : 'true');
    if(active) {
      node.removeAttribute('inert');
    } else {
      node.setAttribute('inert', '');
    }
  });
}

function restoreChTabScroll(tab, pane) {
  const state = _chTabDomState[tab];
  if(!state || !pane) return;
  requestAnimationFrame(function(){
    try {
      pane.scrollTop = state.scrollTop || 0;
      const scroller = pane.querySelector('.cdb-collection,.cdb-decklist,.collection-grid,[data-preserve-scroll]');
      if(scroller) scroller.scrollTop = state.innerScrollTop || 0;
    } catch(e) {}
  });
}

function switchChTab(tab, opts) {
  const options = opts || {};
  const previousTab = _currentChTab;
  if(typeof window.closeLoreWindow === 'function') window.closeLoreWindow();
  if(typeof window.dismissCardInfoOverlay === 'function') window.dismissCardInfoOverlay();
  if(!options.warmup) {
    if(typeof window.closeModal === 'function') window.closeModal();
    else document.getElementById('modal')?.classList.remove('on');
  }
  const forceLoreArchive = tab === 'lore';
  if(typeof window.fateResetChallengerLoreState === 'function' && (forceLoreArchive || previousTab === 'lore')) {
    window.fateResetChallengerLoreState({render:false});
  } else if(previousTab === 'lore') {
    document.getElementById('s-challenger')?.classList.remove('ch-lore-reading');
  }
  const sameTab = _currentChTab === tab;
  _currentChTab = tab;
  document.querySelectorAll('.ch-tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===tab));
  updateChTopbar();
  const lightweightTabs = !!(
    window.__fateStartupWarmupActive ||
    window.__fateMenusWarmed ||
    document.documentElement.classList.contains('fate-low-effects') ||
    document.documentElement.classList.contains('fate-performance-mode') ||
    document.documentElement.classList.contains('fate-performance-plus-mode')
  );
  // Set tab-specific background
  const bgEl = document.querySelector('#s-challenger .screen-bg img');
  if(bgEl){
  const tabBg = {play:TITLE_BG_PATH(2), campaign:TITLE_BG_PATH(4), lore:INGAME_BG_PATH(15), store:TITLE_BG_PATH(3), collection:TITLE_BG_PATH(4), deckbuilder:TITLE_BG_PATH(5)};
  bgEl.src = tabBg[tab] || TITLE_BG_PATH(2);
  }
  const content = document.getElementById('ch-content');
  if(!content) return;
  content.classList.toggle('ch-cdb-content', tab === 'deckbuilder');
  const pane = getChTabPane(tab);
  if(!pane) return;
  ensureChTabMenuView(tab);
  const renderTab = function(){
    setChTabPaneVisibility(content, pane);
    const render = getChRendererForTab(tab);
    const shouldRender = options.force === true || forceLoreArchive || sameTab || pane.dataset.mounted !== '1' || pane.childElementCount === 0;
    if(window.FateMenuViews) {
      window.FateMenuViews.render('challenger:' + tab, {force:shouldRender});
      pane.dataset.mounted = '1';
    } else if(shouldRender && typeof render === 'function') {
      render(pane);
      pane.dataset.mounted = '1';
    }
    setChTabPaneVisibility(content, pane);
    content.dataset.renderedTab = tab;
    content.dataset.activeTab = tab;
    content.style.opacity='1';
    restoreChTabScroll(tab, pane);
  };
  if(lightweightTabs) {
    content.style.transition='none';
    content.style.opacity='1';
    renderTab();
    return;
  }
  // Quick fade transition
  content.style.opacity='0';
  content.style.transition='opacity .2s ease';
  setTimeout(renderTab, 200);
}

function updateChTopbar() {
  const slVal = document.getElementById('ch-starlight-val');
  const pkVal = document.getElementById('ch-packs-val');
  const eloVal = document.getElementById('ch-elo-val');
  const slIcon = document.getElementById('ch-starlight-icon');
  if(slVal) slVal.textContent = USER_PROFILE.starlight || 0;
  if(pkVal) pkVal.textContent = USER_PROFILE.unopenedPacks || 0;
  if(eloVal) eloVal.textContent = USER_PROFILE.challengerElo || 600;
  if(slIcon) slIcon.innerHTML = STARLIGHT_ICON;
}

// â”€â”€â”€ CHALLENGER PLAY TAB â”€â”€â”€
function renderChPlayTab(content) {
  content = resolveChRenderTarget(content, 'play');
  if(!content) return;
  const presets = USER_PROFILE.challengerPresets || {};
  const keys = Object.keys(presets);
  const elo = USER_PROFILE.challengerElo || 600;
  const rank = getRank(elo);
  const rankInfo = typeof getRankProgressInfo === 'function' ? getRankProgressInfo(elo) : null;
  const progressPct = rankInfo ? rankInfo.progressPct : 0;
  const divisionCopy = rankInfo ? `Division Rank ${rankInfo.divisionRank} / ${rankInfo.divisionSize}` : '';
  const nextRankCopy = rankInfo?.nextRank ? `${rankInfo.pointsToNext} ELO to ${rankInfo.nextRank.name}` : 'Top rank reached';
  content.innerHTML = `
    <div class="ch-play-panel ch-play-v5" style="--rank-color:${rank.color};">
      <section class="ch-v5-rank">
        <div class="ch-v5-rank-combined">
          <div class="ch-v5-rank-title"><span>Rank</span></div>
          <div class="ch-v5-rank-badge">${renderRankBadge(elo,'lg')}</div>
          <div class="ch-v5-elo-card">
            <div class="ch-v5-elo">${elo}</div>
            <div class="ch-v5-elo-label">ELO</div>
          </div>
        </div>
        <div class="ch-v5-rank-meter">
          <div class="ch-v5-meter-head"><span>Division Progress</span><b>${Math.round(progressPct)}%</b></div>
          <div class="ch-v5-progress"><i style="width:${progressPct}%;"></i></div>
          <div class="ch-v5-next">${nextRankCopy}</div>
        </div>
      </section>
      <section class="ch-v5-main">
        <div class="ch-v5-head">
          <div>
            <div class="ch-v5-kicker">Choose Your Match</div>
            <h2>Enter the Queue</h2>
          </div>
        </div>
        <div class="ch-v5-match-grid">
          <button class="ch-v5-match ch-v5-human" type="button" onclick="chStartMatchmaking()">
            <span class="ch-v5-match-art"><img src="play2.png" alt="" loading="eager" decoding="async" draggable="false" onerror="this.style.display='none'"></span>
            <span class="ch-v5-match-copy">
              <b>Ranked Human</b>
              <em>Random human queue with ELO, rewards, and ladder movement.</em>
            </span>
            <span class="ch-v5-match-cta">Find Match</span>
          </button>
          <button class="ch-v5-match ch-v5-ai" type="button" onclick="chStartVsAI()">
            <span class="ch-v5-match-art"><img src="play1.png" alt="" loading="eager" decoding="async" draggable="false" onerror="this.style.display='none'"></span>
            <span class="ch-v5-match-copy">
              <b>AI Challenge</b>
              <em>Roll straight into a random AI fight for Challenger progress.</em>
            </span>
            <span class="ch-v5-match-cta">Random AI</span>
          </button>
        </div>
      </section>
      <section class="ch-v5-intel">
        <button type="button" onclick="showLeaderboard()"><i class="ch-intel-icon" aria-hidden="true">&#9812;</i><b>Leaderboard</b><span>View the top ladder.</span></button>
        <button type="button" onclick="showDivisionPage()"><i class="ch-intel-icon ch-intel-divisions" aria-hidden="true"><span></span><span></span><span></span></i><b>Divisions</b><span>${divisionCopy || 'Rank placement'}</span></button>
        <button type="button" onclick="showMatchHistory()"><i class="ch-intel-icon" aria-hidden="true">&#9716;</i><b>Recent Matches</b><span>${(USER_PROFILE.challengerWins||0)}W / ${(USER_PROFILE.challengerLosses||0)}L</span></button>
        <button type="button" onclick="switchChTab('deckbuilder')"><i class="ch-intel-icon ch-intel-decks" aria-hidden="true"><span></span><span></span><span></span></i><b>My Decks</b><span>Build and tune presets.</span></button>
      </section>
    </div>`;
}

function getOrderedChallengerDeckKeys() {
  const presets = USER_PROFILE.challengerPresets || {};
  return Object.keys(presets).sort((a,b)=>{
    const pa = presets[a] || {};
    const pb = presets[b] || {};
    const sa = typeof pa.sortOrder === 'number' ? pa.sortOrder : 1000;
    const sb = typeof pb.sortOrder === 'number' ? pb.sortOrder : 1000;
    if(sa !== sb) return sa - sb;
    return String(pa.name || a).localeCompare(String(pb.name || b));
  });
}

function getDeckPickPresetsForCurrentMode() {
  if(CURRENT_MODE === 'free') return (typeof PRESET_DECKS !== 'undefined' && PRESET_DECKS) ? PRESET_DECKS : {};
  return USER_PROFILE.challengerPresets || {};
}

function getOrderedDeckPickKeysForCurrentMode() {
  if(CURRENT_MODE !== 'free') return getOrderedChallengerDeckKeys();
  const presets = getDeckPickPresetsForCurrentMode();
  return Object.keys(presets).sort((a,b)=>String(presets[a]?.name || a).localeCompare(String(presets[b]?.name || b)));
}

function markPresetTitleLineClasses(container) {
  if(!container) return;
  requestAnimationFrame(function(){
    container.querySelectorAll('.preset-browse-tile, .preset-card').forEach(function(tile){
      const nameEl = tile.querySelector('.preset-name');
      if(!nameEl || !window.getComputedStyle) return;
      let lines = 1;
      try {
        const range = document.createRange();
        range.selectNodeContents(nameEl);
        const tops = [];
        Array.from(range.getClientRects()).forEach(function(rect){
          if(rect.width < 1 || rect.height < 1) return;
          const top = Math.round(rect.top);
          if(!tops.some(function(existing){ return Math.abs(existing - top) <= 2; })) tops.push(top);
        });
        range.detach();
        lines = Math.max(1, tops.length);
      } catch(e) {
        const lineHeight = parseFloat(getComputedStyle(nameEl).lineHeight) || nameEl.getBoundingClientRect().height || 1;
        lines = Math.max(1, Math.round(nameEl.getBoundingClientRect().height / lineHeight));
      }
      tile.classList.toggle('preset-title-single-line', lines <= 1);
      tile.classList.toggle('preset-title-two-line', lines > 1);
    });
  });
}

function resequenceChallengerDeckOrder(orderKeys) {
  const presets = USER_PROFILE.challengerPresets || {};
  orderKeys.forEach((pid, idx)=>{
    if(presets[pid]) presets[pid].sortOrder = idx;
  });
  saveProfile();
}

let _challengerDeckPickPage = 0;

window.returnFromChallengerDeckOrderEditor = function(){
  renderChallengerDeckPickModal(_challengerDeckPickPage);
};
window.closeChallengerDeckOrderEditor = window.returnFromChallengerDeckOrderEditor;

window.moveChallengerDeckOrder = function(pid, dir){
  const keys = getOrderedChallengerDeckKeys();
  const idx = keys.indexOf(pid);
  if(idx < 0) return;
  const swapIdx = idx + dir;
  if(swapIdx < 0 || swapIdx >= keys.length) return;
  const tmp = keys[idx];
  keys[idx] = keys[swapIdx];
  keys[swapIdx] = tmp;
  resequenceChallengerDeckOrder(keys);
  renderChallengerDeckOrderEditor();
};

function renderChallengerDeckOrderEditor() {
  const presets = USER_PROFILE.challengerPresets || {};
  const keys = getOrderedChallengerDeckKeys();
  const body = document.createElement('div');
  body.innerHTML = `<p style="font-size:.84rem;color:var(--dim);font-style:italic;margin-bottom:.8rem;">Choose which Challenger decks appear first in the deck selection screen.</p>`;
  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '.65rem';
  keys.forEach((pid, index)=>{
    const p = presets[pid];
    const sampleIds = [...new Set(p.ids)];
    const sampleCards = sampleIds.map(id=>CARDS.find(c=>c.id===id)).filter(Boolean);
    const hero = p.faceCardId ? CARDS.find(c=>c.id===p.faceCardId) : ([...sampleCards].sort((a,b)=>(b.fate||0)-(a.fate||0))[0] || sampleCards[0]);
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '.8rem';
    row.style.padding = '.7rem .8rem';
    row.style.border = '1px solid var(--border)';
    row.style.borderRadius = '10px';
    row.style.background = 'rgba(0,0,0,.28)';
    row.innerHTML = `
      <div style="width:72px;height:96px;border-radius:8px;overflow:hidden;background:#0a0a0f;flex-shrink:0;border:1px solid rgba(255,255,255,.08);">
        ${hero?.img ? `<img src="${hero.img}" alt="${escapeHtml(hero.name)}" style="width:100%;height:100%;object-fit:cover;object-position:center 20%;">` : ''}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-family:'Cinzel',serif;color:var(--gold);font-size:1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(p.name)}</div>
        <div style="font-size:.72rem;color:var(--dim);letter-spacing:.08em;text-transform:uppercase;">Position ${index + 1}</div>
      </div>`;
    const moveWrap = document.createElement('div');
    moveWrap.style.display = 'flex';
    moveWrap.style.gap = '.35rem';
    moveWrap.style.flexShrink = '0';
    const earlierBtn = document.createElement('button');
    earlierBtn.className = 'btn sm';
    earlierBtn.textContent = 'Earlier';
    earlierBtn.disabled = index === 0;
    earlierBtn.onclick = ()=>window.moveChallengerDeckOrder(pid,-1);
    const laterBtn = document.createElement('button');
    laterBtn.className = 'btn sm';
    laterBtn.textContent = 'Later';
    laterBtn.disabled = index === keys.length - 1;
    laterBtn.onclick = ()=>window.moveChallengerDeckOrder(pid,1);
    moveWrap.appendChild(earlierBtn);
    moveWrap.appendChild(laterBtn);
    row.appendChild(moveWrap);
    list.appendChild(row);
  });
  body.appendChild(list);
  document.getElementById('modal-body').innerHTML = '';
  document.getElementById('modal-body').appendChild(body);
  document.getElementById('modal-title').textContent = 'Edit Challenger Deck Order';
  const acts = document.getElementById('modal-acts');
  acts.innerHTML = '';
  const back = document.createElement('button');
  back.className = 'btn sm';
  back.textContent = 'Back';
  back.onclick = window.returnFromChallengerDeckOrderEditor;
  const close = document.createElement('button');
  close.className = 'btn sm';
  close.textContent = 'Close';
  close.onclick = closeModal;
  const done = document.createElement('button');
  done.className = 'btn sm pri';
  done.textContent = 'Done';
  done.onclick = window.returnFromChallengerDeckOrderEditor;
  acts.appendChild(back);
  acts.appendChild(close);
  acts.appendChild(done);
  document.getElementById('modal').classList.add('on');
}

function openDeckPickModalChrome(title, actions, extraClasses) {
  if(typeof resetModalChrome === 'function') resetModalChrome();
  const modalEl = document.getElementById('modal');
  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');
  const actsEl = document.getElementById('modal-acts');
  const modalBox = document.querySelector('#modal .modal');
  if(titleEl) titleEl.textContent = title || '';
  if(bodyEl){
    bodyEl.innerHTML = '';
    bodyEl.style.overflow = 'hidden';
    bodyEl.style.maxHeight = 'none';
  }
  if(actsEl){
    actsEl.innerHTML = '';
    (actions || []).forEach(a=>{
      const btn = document.createElement('button');
      btn.className = 'btn sm' + (a.danger ? ' danger' : '') + (a.pri ? ' pri' : '');
      btn.textContent = a.label;
      btn.onclick = function(e){
        if(typeof playSfx === 'function'){
          const label = String(a.label || '').toLowerCase();
          const cancelLike = a.danger || /cancel|close|back|skip|decline|no|leave/.test(label);
          playSfx(a.sfx || (cancelLike ? 'modalCancel' : 'modalConfirm'));
        }
        if(typeof a.action === 'function') return a.action(e);
      };
      actsEl.appendChild(btn);
    });
  }
  if(modalBox){
    modalBox.classList.add('title-my-decks-modal', 'choose-deck-canonical-modal', 'choose-deck-runtime-modal', ...(extraClasses || []));
    modalBox.dataset.chooseDeckModal = '1';
  }
  if(modalEl){
    modalEl.dataset.chooseDeckOpen = '1';
    modalEl.classList.add('on', 'no-edge-corners-modal');
  }
  if(document.body) document.body.classList.add('choose-deck-open');
  if(typeof playSfx === 'function') playSfx('menuOpen');
}

function renderChallengerDeckPickModal(page=0) {
  if(CURRENT_MODE === 'free') return renderFreePlayTitlePresetDeckPickModal(page);
  const presets = getDeckPickPresetsForCurrentMode();
  const keys = getOrderedDeckPickKeysForCurrentMode();
  const pageSize = 3;
  const totalPages = Math.max(1, Math.ceil(keys.length / pageSize));
  _challengerDeckPickPage = Math.max(0, Math.min(page, totalPages - 1));
  const pageKeys = keys.slice(_challengerDeckPickPage * pageSize, _challengerDeckPickPage * pageSize + pageSize);
  const body = document.createElement('div');
  body.className = 'freeplay-title-preset-body challenger-runtime-title-preset-body';
  body.innerHTML = `<p class="choose-deck-canonical-subtitle">Playing Challenger - pick a preset deck</p>`;
  const grid = document.createElement('div');
  grid.className = 'freeplay-title-preset-grid challenger-runtime-title-preset-grid';
  pageKeys.forEach(pid=>{
    const p = presets[pid];
    const ok = p.ids.length===40;
    const sampleIds = [...new Set(p.ids)];
    const sampleCards = sampleIds.map(id=>CARDS.find(c=>c.id===id)).filter(Boolean);
    const hero = p.faceCardId ? CARDS.find(c=>c.id===p.faceCardId) : ([...sampleCards].sort((a,b)=>(b.fate||0)-(a.fate||0))[0] || sampleCards[0]);
    const displayCards = (p.displayCardIds && p.displayCardIds.length
      ? p.displayCardIds.map(id=>CARDS.find(c=>c.id===id)).filter(c=>c&&c.img)
      : sampleCards.filter(c=>c.img)
    ).slice(0,7);
    const tile = document.createElement('div');
    tile.className = 'preset-card freeplay-title-preset-card challenger-runtime-title-preset-card';
    tile.style.animationDelay = '0s';
    tile.style.opacity = ok ? '1' : '.5';
    const useCanvasPreview = false;
    const heroSrc = hero?.img ? (typeof getRuntimeCardImageSrc === 'function' ? getRuntimeCardImageSrc(hero.img, 'thumb') : hero.img) : '';
    const heroArt = heroSrc ? `<img src="${heroSrc}" alt="${escapeHtml(hero.name)}" loading="lazy" decoding="async" draggable="false" onerror="this.parentElement.style.display='none'">` : '';
    tile.innerHTML = `
      <div class="preset-card-art">
        ${useCanvasPreview ? '<canvas class="canvas-deck-preview-hero" aria-hidden="true"></canvas>' : heroArt}
        <div class="preset-card-overlay"></div>
      </div>
      <div class="preset-card-body">
        <div class="preset-name">${escapeHtml(p.name)}</div>
        <div class="preset-desc">${escapeHtml(p.description||'')}</div>
        <div class="preset-minis">
          ${useCanvasPreview ? '<canvas class="canvas-deck-preview-minis" aria-hidden="true"></canvas>' : displayCards.map(c=>`<div class="preset-mini-art">${c.img?`<img src="${typeof getRuntimeCardImageSrc === 'function' ? getRuntimeCardImageSrc(c.img, 'thumb') : c.img}" alt="${escapeHtml(c.name)}" loading="lazy" decoding="async" draggable="false">`:''}</div>`).join('')}
        </div>
        <div class="preset-action-row">
          <button class="btn sm" type="button">Preview</button>
          <button class="btn sm pri" type="button" ${ok?'':`disabled`}>Play</button>
        </div>
      </div>`;
    if(useCanvasPreview) scheduleCanvasDeckPreviewTile(tile, {hero, minis:displayCards});
    const [previewBtn, playBtn] = tile.querySelectorAll('.preset-action-row .btn');
    if(previewBtn) previewBtn.onclick = (e)=>{ e.stopPropagation(); viewChallengerDeckContents(pid); };
    if(playBtn) playBtn.onclick = (e)=>{ e.stopPropagation(); if(ok) chPickDeckAndStart(pid); };
    if(ok) tile.onclick = ()=>viewChallengerDeckContents(pid);
    grid.appendChild(tile);
  });
  body.appendChild(grid);
  markPresetTitleLineClasses(grid);
  const footer = document.createElement('div');
  footer.className = 'freeplay-title-preset-footer challenger-runtime-title-preset-footer';
  footer.innerHTML = `
    <div class="freeplay-title-preset-nav">
      <button class="btn sm" onclick="renderChallengerDeckPickModal(${_challengerDeckPickPage-1})" ${_challengerDeckPickPage<=0?'disabled':''}>Prev</button>
      <button class="btn sm" onclick="renderChallengerDeckOrderEditor()" ${(keys.length<=1 || CURRENT_MODE === 'free')?'disabled':''}>Edit Order</button>
      <button class="btn sm" onclick="renderChallengerDeckPickModal(${_challengerDeckPickPage+1})" ${_challengerDeckPickPage>=totalPages-1?'disabled':''}>Next</button>
      ${CURRENT_MODE === 'free' ? `<button class="btn sm" onclick="closeModal()">Close</button>` : ''}
    </div>
    <span>Page ${_challengerDeckPickPage+1} / ${totalPages}</span>`;
  body.appendChild(footer);
  const isRandomCommitted = G._aiRewardMultiplier === 1.5 && G._pickDeckAfterAi;
  const modalTitle = isRandomCommitted ? 'Choose Your Deck - Random Opponent Locked In' : 'Choose Your Deck';
  const modalActions = (isRandomCommitted || CURRENT_MODE === 'free') ? [] : [{label:'Cancel', action:closeModal}];
  openDeckPickModalChrome(modalTitle, modalActions, ['freeplay-title-preset-modal', 'challenger-runtime-title-preset-modal']);
  const modalEl = document.getElementById('modal');
  if(modalEl) {
    if(isRandomCommitted) modalEl.dataset.escapeLocked = '1';
    else delete modalEl.dataset.escapeLocked;
  }
  document.getElementById('modal-body').appendChild(body);
}

function renderFreePlayTitlePresetDeckPickModal(page=0) {
  const presets = (typeof PRESET_DECKS !== 'undefined' && PRESET_DECKS) ? PRESET_DECKS : {};
  const keys = Object.keys(presets).sort((a,b)=>String(presets[a]?.name || a).localeCompare(String(presets[b]?.name || b)));
  const pageSize = 3;
  const totalPages = Math.max(1, Math.ceil(keys.length / pageSize));
  _challengerDeckPickPage = Math.max(0, Math.min(page, totalPages - 1));
  const pageKeys = keys.slice(_challengerDeckPickPage * pageSize, _challengerDeckPickPage * pageSize + pageSize);
  const body = document.createElement('div');
  body.className = 'freeplay-title-preset-body';
  body.innerHTML = `<p class="choose-deck-canonical-subtitle">Playing Free Play Human - pick a title deck preset</p>`;
  const grid = document.createElement('div');
  grid.className = 'freeplay-title-preset-grid';
  if(!keys.length){
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--dim);font-style:italic;">No saved presets. Go to the title Deck Builder to create one.</div>`;
  }
  pageKeys.forEach((pid,i)=>{
    const p = presets[pid];
    const sampleIds = [...new Set((p.ids || []).filter(id=>!(typeof isRetiredCardForBuilder === 'function' && isRetiredCardForBuilder(id))))];
    const sampleCards = sampleIds.map(id=>CARDS.find(c=>c.id===id)).filter(Boolean);
    const hero = p.faceCardId ? CARDS.find(c=>c.id===p.faceCardId) : ([...sampleCards].sort((a,b)=>(b.fate||0)-(a.fate||0))[0] || sampleCards[0]);
    const previews = (p.displayCardIds && p.displayCardIds.length>0)
      ? p.displayCardIds.filter(id=>!(typeof isRetiredCardForBuilder === 'function' && isRetiredCardForBuilder(id))).map(id=>CARDS.find(c=>c.id===id)).filter(c=>c&&c.img).slice(0,7)
      : sampleCards.filter(c=>c.img).slice(0,5);
    const ok = Array.isArray(p.ids) && p.ids.length === 40;
    const el = document.createElement('div');
    el.className = 'preset-card freeplay-title-preset-card';
    el.style.animationDelay = '0s';
    const useCanvasPreview = false;
    const heroSrc = hero?.img ? (typeof getRuntimeCardImageSrc === 'function' ? getRuntimeCardImageSrc(hero.img, 'thumb') : hero.img) : '';
    const heroArt = heroSrc ? `<img src="${heroSrc}" alt="${escapeHtml(hero.name)}" loading="lazy" decoding="async" draggable="false" onerror="this.parentElement.style.display='none'">` : '';
    el.innerHTML = `
      <div class="preset-card-art">
        ${useCanvasPreview ? '<canvas class="canvas-deck-preview-hero" aria-hidden="true"></canvas>' : heroArt}
        <div class="preset-card-overlay"></div>
      </div>
      <div class="preset-card-body">
        <div class="preset-name">${escapeHtml(p.name)}</div>
        <div class="preset-desc">${escapeHtml(p.description||'')}</div>
        <div class="preset-minis">
          ${useCanvasPreview ? '<canvas class="canvas-deck-preview-minis" aria-hidden="true"></canvas>' : previews.map(c=>`<div class="preset-mini-art">${c.img?`<img src="${typeof getRuntimeCardImageSrc === 'function' ? getRuntimeCardImageSrc(c.img, 'thumb') : c.img}" alt="${escapeHtml(c.name)}" loading="lazy" decoding="async" draggable="false">`:''}</div>`).join('')}
        </div>
        <div class="preset-action-row">
          <button class="btn sm" type="button">Preview</button>
          <button class="btn sm pri" type="button" ${ok?'':`disabled`}>Play</button>
        </div>
      </div>`;
    if(useCanvasPreview) scheduleCanvasDeckPreviewTile(el, {hero, minis:previews});
    const [previewBtn, playBtn] = el.querySelectorAll('.preset-action-row .btn');
    if(previewBtn) previewBtn.onclick = (e)=>{ e.stopPropagation(); viewChallengerDeckContents(pid); };
    if(playBtn) playBtn.onclick = (e)=>{ e.stopPropagation(); if(ok) chPickDeckAndStart(pid); };
    if(ok) el.onclick = ()=>viewChallengerDeckContents(pid);
    grid.appendChild(el);
  });
  body.appendChild(grid);
  markPresetTitleLineClasses(grid);
  const footer = document.createElement('div');
  footer.className = 'freeplay-title-preset-footer';
  footer.innerHTML = `
    <div class="freeplay-title-preset-nav">
      <button class="btn sm" onclick="renderChallengerDeckPickModal(${_challengerDeckPickPage-1})" ${_challengerDeckPickPage<=0?'disabled':''}>Prev</button>
      <button class="btn sm" onclick="renderChallengerDeckPickModal(${_challengerDeckPickPage+1})" ${_challengerDeckPickPage>=totalPages-1?'disabled':''}>Next</button>
    </div>
    <span>Page ${_challengerDeckPickPage+1} / ${totalPages}</span>
    <button class="btn sm" onclick="closeModal()">Close</button>`;
  body.appendChild(footer);
  openDeckPickModalChrome('Choose Your Deck', CURRENT_MODE === 'free' ? [] : [{label:'Cancel', action:closeModal}], ['freeplay-title-preset-modal']);
  const modalEl = document.getElementById('modal');
  if(modalEl) delete modalEl.dataset.escapeLocked;
  document.getElementById('modal-body').appendChild(body);
}

function chStartVsAI() {
  CURRENT_MODE = 'challenger';
  const presets = USER_PROFILE.challengerPresets || {};
  const keys = Object.keys(presets);
  if(keys.length === 0){
    toast('Build a deck first in the Deck Builder tab');
    switchChTab('deckbuilder');
    return;
  }
  G._pickDeckAfterAi = true;
  G._aiRewardMultiplier = 1;
  startRandomAiChallenge();
}

window.startRandomAiChallenge = function(){
  const aiList = typeof getRandomMatchAIOpponents === 'function' ? getRandomMatchAIOpponents() : AI_OPPONENTS;
  if(!Array.isArray(aiList) || aiList.length===0){
    toast('No AI opponents available');
    return;
  }
  const ai = aiList[Math.floor(Math.random() * aiList.length)];
  if(typeof markPendingAiChallengeForfeit === 'function') markPendingAiChallengeForfeit(ai);
  G._pickDeckAfterAi = true;
  G._aiRewardMultiplier = 1.5;
  // Find leaderboard entry for wins/losses
  const lbEntry = LEADERBOARD.find(e=>e.username===ai.name);
  const aiWins = lbEntry?.wins || 0;
  const aiLosses = lbEntry?.losses || 0;
  showOpponentFound(ai, aiWins, aiLosses, ()=> selectAIOpponent(ai));
};

window.chPickDeckAndStart = function(pid){
  const preset = getDeckPickPresetsForCurrentMode()?.[pid];
  if(!preset) return;
  G.p1Deck = [...preset.ids];
  closeModal();
  if(G._pickDeckAfterMatchmaking){
    G._pickDeckAfterMatchmaking = false;
    window.FATE_ONLINE_PENDING_ROOM_DECK = {
      selectedDeckKey:pid,
      selectedDeckName:preset.name || 'Challenger Deck',
      deckIds:[...preset.ids]
    };
    showMatchmakingScreen({onlineQueue:true, queueMode:CURRENT_MODE === 'free' ? 'freeplay' : 'ranked'});
    return;
  }
  if(G._pickDeckAfterAi && G._selectedAI){
    G._pickDeckAfterAi = false;
    startGame(true);
    return;
  }
  showAIDifficultyPicker();
};

function chStartWithDeck(pid) {
  const preset = USER_PROFILE.challengerPresets?.[pid];
  if(!preset){toast('Deck not found');return;}
  if(preset.ids.length!==40){toast('Deck must have 40 cards');return;}
  CURRENT_MODE = 'challenger';
  // Load as P1 deck then go to difficulty picker
  G.p1Deck = [...preset.ids];
  showAIDifficultyPicker();
}

// â”€â”€â”€ CHALLENGER STORE TAB â”€â”€â”€
function renderChStoreTab(content) {
  content = resolveChRenderTarget(content, 'store');
  if(!content) return;
  const packs = USER_PROFILE.unopenedPacks || 0;
  const favoredPacks = USER_PROFILE.unopenedFavoredPacks || 0;
  const profilePacks = USER_PROFILE.unopenedProfilePacks || 0;
  const starlight = USER_PROFILE.starlight || 0;
  const canBuy = starlight >= PACK_COST_STARLIGHT;
  const canBuyFavored = starlight >= 500;
  const canBuyProfile = starlight >= 50;
  content.innerHTML = `
    <div style="text-align:center;margin-bottom:1.5rem;">
      <h2 style="font-family:'Cinzel',serif;color:#ffd700;font-size:1.6rem;letter-spacing:.1em;margin-bottom:.3rem;">THE STORE</h2>
      <p style="color:var(--dim);font-style:italic;">Spend Starlight to acquire new cards. ${STARLIGHT_ICON} ${starlight} available</p>
    </div>
    ${(packs+favoredPacks)>0 ? `<div style="text-align:center;margin-bottom:1.5rem;padding:1rem;background:rgba(255,215,0,.1);border:1px solid rgba(255,215,0,.4);border-radius:6px;max-width:500px;margin-left:auto;margin-right:auto;">
      <div style="font-family:'Cinzel',serif;color:#ffd700;font-size:1rem;">
        ${packs>0?`<strong>${packs}</strong> Standard pack${packs!==1?'s':''}`:''} 
        ${packs>0&&favoredPacks>0?' | ':''} 
        ${favoredPacks>0?`<strong>${favoredPacks}</strong> Favored pack${favoredPacks!==1?'s':''}`:''} 
        unopened!
      </div>
      <div style="display:flex;gap:.5rem;justify-content:center;margin-top:.5rem;">
        ${packs>0?'<button class="btn pri" onclick="openNextPack()">Open Standard</button>':''}
        ${favoredPacks>0?'<button class="btn pri" style="background:linear-gradient(135deg,rgba(255,215,0,.3),rgba(201,168,76,.2));border:1px solid rgba(255,215,0,.5);color:#ffd700;" onclick="openNextFavoredPack()">Open Favored</button>':''}
      </div>
    </div>`:''}
    <div class="ch-store-layout" style="display:grid;grid-template-columns:minmax(0,1.55fr) minmax(320px,.95fr);gap:1.5rem;max-width:1220px;margin:0 auto;align-items:start;">
      <div>
        <div class="store-grid" style="display:flex;gap:1.2rem;flex-wrap:wrap;justify-content:center;">
      <div class="booster-tile standard-booster" style="border-color:rgba(155,89,182,.5);">
        <div class="booster-art standard-booster-art" style="background:linear-gradient(135deg,rgba(155,89,182,.2),rgba(142,68,173,.1));">
          <img src="Illustration3.png" alt="Standard Booster" onerror="this.style.display='none';this.parentElement.innerHTML='<div style=\\'font-size:5rem;opacity:.3;color:#b388ff;\\'>PACK</div>'">
        </div>
        <div class="booster-info">
          <div class="booster-name" style="color:#b388ff;">Fates Entwined Booster</div>
          <div class="booster-desc">All 80 cards from the base set of the game</div>
          <div class="booster-contents">8 cards - 4 Triangles, 1+ Squares, 3 Supporters, 5% chance at a Star</div>
          <div class="booster-price-row">
            <div class="booster-price" style="color:#b388ff;">${STARLIGHT_ICON} ${PACK_COST_STARLIGHT}</div>
            <button class="btn-buy" style="border-color:#b388ff;color:#b388ff;background:linear-gradient(135deg,rgba(155,89,182,.2),rgba(142,68,173,.12));" onclick="buyPack()" ${canBuy?'':'disabled'}>${canBuy?'Buy':'Need '+PACK_COST_STARLIGHT}</button>
          </div>
        </div>
      </div>
      <div class="booster-tile favored-booster-gold" style="border-color:rgba(255,215,0,.5);">
        <div class="booster-art favored-gold-art" style="background:linear-gradient(135deg,rgba(255,215,0,.15),rgba(201,168,76,.08));">
          <img src="Illustration3.png" alt="Favored Booster" onerror="this.style.display='none';this.parentElement.innerHTML='<div style=\\'font-size:5rem;opacity:.3;color:#ffd700;\\'>F</div>'">
        </div>
        <div class="booster-info">
          <div class="booster-name" style="color:#ffd700;">Favored Fates Entwined</div>
          <div class="booster-desc">Premium pack for Fates Entwined - higher rarity, better odds</div>
          <div class="booster-contents">5 cards - 2 Triangles, 3 Squares, ~33% chance at a Star</div>
          <div class="booster-price-row">
            <div class="booster-price">${STARLIGHT_ICON} 500</div>
            <button class="btn-buy" onclick="buyFavoredPack()" ${canBuyFavored?'':'disabled'}>${canBuyFavored?'Buy':'Need 500'}</button>
          </div>
        </div>
      </div>
        </div>
      <div class="marketplace-panel marketplace-pill" style="padding:1.2rem 1.05rem 1.05rem;background:rgba(0,0,0,.32);border:1px solid var(--border);border-radius:10px;max-width:440px;justify-self:end;width:100%;">
      <h3 style="font-family:'Cinzel',serif;color:var(--gold);font-size:1.1rem;text-align:center;margin-bottom:.8rem;">Marketplace</h3>
      <p style="color:var(--dim);text-align:center;font-style:italic;font-size:.82rem;margin-bottom:1rem;">Buy and sell cards with other players</p>
      <div id="market-redeem-panel" class="market-redeem-panel"></div>
      <div id="marketplace-listings" style="max-height:420px;overflow-y:auto;padding-right:.55rem;display:flex;flex-direction:column;gap:.72rem;"></div>
      <div style="display:flex;gap:.5rem;justify-content:center;margin-top:.8rem;">
        <button class="btn sm" onclick="renderMarketplaceListings()">Refresh</button>
        <button class="btn sm pri" onclick="openSellCardModal()">Sell a Card</button>
        <button class="btn sm" onclick="showMarketplaceTransactions()">Transactions</button>
      </div>
      </div>
    </div>`;
  renderMarketplaceListings();
}

function buyPack() {
  if((USER_PROFILE.starlight||0) < PACK_COST_STARLIGHT){toast('Not enough Starlight');return;}
  USER_PROFILE.starlight -= PACK_COST_STARLIGHT;
  USER_PROFILE.unopenedPacks = (USER_PROFILE.unopenedPacks||0) + 1;
  saveProfile();
  toast('Pack purchased!');
  updateChTopbar();
  switchChTab('store');
}

function buyFavoredPack() {
  if((USER_PROFILE.starlight||0) < 500){toast('Not enough Starlight');return;}
  USER_PROFILE.starlight -= 500;
  USER_PROFILE.unopenedFavoredPacks = (USER_PROFILE.unopenedFavoredPacks||0) + 1;
  saveProfile();
  toast('Favored Pack purchased!');
  updateChTopbar();
  switchChTab('store');
}

function openNextFavoredPack() {
  if((USER_PROFILE.unopenedFavoredPacks||0)<=0){toast('No Favored packs');return;}
  USER_PROFILE.unopenedFavoredPacks--;
  if(typeof updateDailyChallengeProgress === 'function'){
    updateDailyChallengeProgress('packsOpened', 1, 'add');
    updateDailyChallengeProgress('favoredPacksOpened', 1, 'add');
  }
  const pack = generateFavoredPack();
  const results = grantCardsToProfile(pack.map(c=>c.id));
  saveProfile();
  showPackOpening(results, 'favored');
}

function generateFavoredPack() {
  const pool = getChallengerCardPool().filter(c=>c.id!=='76');
  const tri = pool.filter(c=>c.rarity==='triangle');
  const sq = pool.filter(c=>c.rarity==='square');
  const st = pool.filter(c=>c.rarity==='star');
  const cards = [];
  for(let i=0;i<2;i++) cards.push(tri[Math.floor(Math.random()*tri.length)]);
  for(let i=0;i<3;i++) cards.push(sq[Math.floor(Math.random()*sq.length)]);
  if(Math.random()<1/3 && st.length>0) cards[0]=st[Math.floor(Math.random()*st.length)];
  const ro={circle:0,triangle:1,square:2,star:3};
  cards.sort((a,b)=>(ro[a.rarity]||0)-(ro[b.rarity]||0));
  return cards;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  MARKETPLACE — Multiplayer-ready auction/buyout system
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function getMarketplace(){
  if(!USER_PROFILE.marketplace) USER_PROFILE.marketplace={listings:[]};
  return USER_PROFILE.marketplace;
}
function renderMarketplaceListings(){
  const el=document.getElementById('marketplace-listings');
  if(!el) return;
  const mp=getMarketplace();
  if(!mp.listings.length){
    el.innerHTML=`<div style="text-align:center;padding:1.5rem;color:var(--dim);font-style:italic;">No listings yet. List a card to get started!</div>`;
    return;
  }
  el.innerHTML=mp.listings.map((l,i)=>{
    const c=CARDS.find(x=>x.id===l.cardId);
    if(!c) return '';
    return `<div style="display:flex;align-items:center;gap:.5rem;padding:.4rem;border:1px solid var(--border);border-radius:4px;margin-bottom:.3rem;background:rgba(0,0,0,.3);">
      <div style="width:32px;height:44px;border-radius:2px;overflow:hidden;border:1px solid ${RARITY_COLOR[c.rarity]||'var(--border)'};flex-shrink:0;">
        ${c.img?`<img src="${c.img}" style="width:100%;height:100%;object-fit:contain;">`:''}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:.72rem;color:var(--text);font-weight:600;">${escapeHtml(c.name)}</div>
        <div style="font-size:.55rem;color:var(--dim);">${c.rarity} - ${escapeHtml(l.seller||'You')}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-size:.72rem;color:#ffd700;">${STARLIGHT_ICON} ${l.price}</div>
        ${l.seller===USER_PROFILE.username
          ?`<button class="btn sm danger" style="font-size:.5rem;margin-top:.15rem;" onclick="cancelListing(${i})">Cancel</button>`
          :`<button class="btn sm pri" style="font-size:.5rem;margin-top:.15rem;" onclick="buyListing(${i})">Buy</button>`}
      </div>
    </div>`;
  }).join('');
}
function openSellCardModal(){
  const owned=USER_PROFILE.ownedCards||[];
  if(!owned.length){toast('No cards to sell');return;}
  const uniq=[...new Set(owned)].filter(id=>!isRetiredChallengerCard(id));
  let html=`<p style="color:var(--dim);margin-bottom:.8rem;font-size:.82rem;text-align:center;">Select a card to list on the marketplace</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:.4rem;max-height:240px;overflow-y:auto;padding:.3rem;">`;
  uniq.forEach(id=>{
    const c=CARDS.find(x=>x.id===id);
    if(!c) return;
    const cnt=owned.filter(x=>x===id).length;
    const rarCol=RARITY_COLOR[c.rarity]||'var(--border)';
    html+=`<div style="cursor:pointer;text-align:center;transition:transform .15s,box-shadow .15s;border-radius:6px;padding:4px;" 
      onmouseenter="this.style.transform='scale(1.06)';this.style.boxShadow='0 4px 16px rgba(0,0,0,.4)'" 
      onmouseleave="this.style.transform='';this.style.boxShadow=''" 
      onclick="listCardForSale('${id}')">
      <div style="width:100%;aspect-ratio:5/7;border:2px solid ${rarCol};border-radius:5px;overflow:hidden;background:#0a0a0f;box-shadow:0 0 8px ${rarCol}33;">
        ${c.img?`<img src="${c.img}" style="width:100%;height:100%;object-fit:cover;">`:`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:.6rem;color:var(--dim);">${escapeHtml(c.name)}</div>`}
      </div>
      <div style="font-size:.58rem;color:var(--text);margin-top:.25rem;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(c.name)}</div>
      <div style="font-size:.5rem;color:${rarCol};opacity:.8;">x${cnt}</div>
    </div>`;
  });
  html+='</div>';
  showModal('Sell a Card',html,[{label:'Cancel',action:closeModal}]);
  const modalBox=document.querySelector('#modal .modal');
  if(modalBox) modalBox.classList.add('sell-card-modal');
}
function listCardForSale(cardId){
  closeModal();
  const c=CARDS.find(x=>x.id===cardId);
  if(!c || isRetiredChallengerCard(c)) return;
  const rarCol=RARITY_COLOR[c.rarity]||'var(--border)';
  showModal('Set Price',`
    <div style="display:flex;align-items:center;gap:1.2rem;margin-bottom:1rem;padding:.6rem;background:rgba(0,0,0,.25);border-radius:8px;border:1px solid rgba(255,255,255,.06);">
      <div style="width:82px;height:115px;border:2px solid ${rarCol};border-radius:6px;overflow:hidden;background:#0a0a0f;flex-shrink:0;box-shadow:0 4px 16px rgba(0,0,0,.5),0 0 12px ${rarCol}22;">
        ${c.img?`<img src="${c.img}" style="width:100%;height:100%;object-fit:cover;">`:''}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-family:'Cinzel',serif;font-size:.95rem;color:var(--gold);margin-bottom:.3rem;">${escapeHtml(c.name)}</div>
        <div style="font-size:.72rem;color:var(--dim);margin-bottom:.15rem;">${escapeHtml(c.type)} · <span style="color:${rarCol}">${c.rarity}</span></div>
        <div style="font-size:.68rem;color:var(--dim);opacity:.7;">${escapeHtml(c.ability||'')}</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:.6rem;justify-content:center;">
      <label style="font-size:.8rem;color:var(--dim);">Price:</label>
      <div style="display:flex;align-items:center;gap:.35rem;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:.35rem .6rem;">
        <span style="font-size:.7rem;color:var(--gold);">✦</span>
        <input type="number" id="sell-price" min="10" max="10000" value="100" style="padding:.2rem;background:transparent;border:none;color:var(--text);font-size:.9rem;width:80px;outline:none;font-family:inherit;">
      </div>
      <span style="font-size:.7rem;color:var(--dim);">Starlight</span>
    </div>`,
  [{label:'List for Sale',pri:true,action:()=>{
    const price=parseInt(document.getElementById('sell-price')?.value)||100;
    const mp=getMarketplace();
    const idx=(USER_PROFILE.ownedCards||[]).indexOf(cardId);
    if(idx>=0) USER_PROFILE.ownedCards.splice(idx,1);
    mp.listings.push({cardId,seller:USER_PROFILE.username,price,timestamp:Date.now()});
    saveProfile();toast(`${c.name} listed for ${price} Starlight`);closeModal();switchChTab('store');
  }},{label:'Cancel',action:closeModal}]);
  const modalBox=document.querySelector('#modal .modal');
  if(modalBox) modalBox.classList.add('sell-card-modal');
}
function buyListing(i){
  const mp=getMarketplace();const l=mp.listings[i];if(!l) return;
  if((USER_PROFILE.starlight||0)<l.price){toast('Not enough Starlight');return;}
  USER_PROFILE.starlight-=l.price;
  if(!USER_PROFILE.ownedCards) USER_PROFILE.ownedCards=[];
  USER_PROFILE.ownedCards.push(l.cardId);
  mp.listings.splice(i,1);saveProfile();
  toast('Purchased!');playSfx('purchase');switchChTab('store');
}
function cancelListing(i){
  const mp=getMarketplace();const l=mp.listings[i];if(!l) return;
  if(!USER_PROFILE.ownedCards) USER_PROFILE.ownedCards=[];
  USER_PROFILE.ownedCards.push(l.cardId);
  mp.listings.splice(i,1);saveProfile();toast('Listing cancelled');switchChTab('store');
}

function addOwnedCardCount(cardId, amount=1) {
  if(!USER_PROFILE.ownedCards) USER_PROFILE.ownedCards = {};
  USER_PROFILE.ownedCards[cardId] = (USER_PROFILE.ownedCards[cardId] || 0) + amount;
}

function removeOwnedCardCount(cardId, amount=1) {
  if(!USER_PROFILE.ownedCards || !USER_PROFILE.ownedCards[cardId]) return false;
  USER_PROFILE.ownedCards[cardId] -= amount;
  if(USER_PROFILE.ownedCards[cardId] <= 0) delete USER_PROFILE.ownedCards[cardId];
  return true;
}

function showProfilePackOpening(pfpIds) {
  if(!pfpIds.length){
    showModal('Profile Picture Booster', '<p style="color:var(--dim);text-align:center;">You already own every profile picture.</p>', [{label:'Close', action:closeModal}]);
    return;
  }
  const overlay = document.getElementById('pack-opening-overlay');
  const stage = document.getElementById('pack-stage-content');
  const sparkleLayer = document.getElementById('pack-sparkle-layer');
  overlay.classList.add('on');
  sparkleLayer.innerHTML = '';
  stage.innerHTML = `
    <div class="pack-stage">
      <div class="pack-art-container">
        <div class="pack-art" id="profile-pack-art-el" style="border-color:rgba(127,182,255,.75);box-shadow:0 16px 34px rgba(0,0,0,.58);">
          <img src="pfpbooster.png" alt="Profile Picture Booster" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display='none';this.parentElement.innerHTML='<div style=&quot;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 28%,rgba(255,255,255,.12),transparent 36%),linear-gradient(160deg,rgba(74,138,212,.92),rgba(36,94,168,.94));font-family:Cinzel,serif;font-size:1.1rem;letter-spacing:.14em;color:#eff6ff;text-align:center;padding:0 1rem;&quot;>PROFILE PICTURE BOOSTER</div>'">
        </div>
      </div>
      <div class="pack-prompt" style="color:#7fb6ff;text-shadow:0 0 24px rgba(127,182,255,.75);">Rewards opened!</div>
    </div>`;
  const packEl = document.getElementById('profile-pack-art-el');
  setTimeout(()=>{
    packEl.classList.add('opening');
    playSfx('effect');
    setTimeout(()=>renderProfilePackReveal(pfpIds), 760);
  }, 480);
}

function buyProfilePack() {
  if((USER_PROFILE.starlight||0) < 50){ toast('Not enough Starlight'); return; }
  if(getUnownedPfpIds().length === 0){ toast('You already own every profile picture'); return; }
  USER_PROFILE.starlight -= 50;
  USER_PROFILE.unopenedProfilePacks = (USER_PROFILE.unopenedProfilePacks||0) + 1;
  saveProfile();
  toast('Profile Picture Booster purchased!');
  updateChTopbar();
  switchChTab('store');
}

function openNextProfilePack() {
  if((USER_PROFILE.unopenedProfilePacks||0) <= 0){ toast('No Profile Picture Boosters'); return; }
  const pack = generateProfilePack();
  if(!pack.length){ toast('You already own every profile picture'); return; }
  USER_PROFILE.unopenedProfilePacks--;
  if(typeof updateDailyChallengeProgress === 'function'){
    updateDailyChallengeProgress('packsOpened', 1, 'add');
    updateDailyChallengeProgress('profilePacksOpened', 1, 'add');
  }
  const granted = grantProfilePictures(pack);
  saveProfile();
  updateChTopbar();
  if(document.getElementById('s-challenger').classList.contains('active') && _currentChTab==='store'){
    renderChStoreTab(document.getElementById('ch-content'));
  }
  showProfilePackOpening(granted);
}

function renderMarketplaceListings(){
  const el=document.getElementById('marketplace-listings');
  if(!el) return;
  const mp=getMarketplace();
  if(!mp.listings.length){
    el.innerHTML=`<div style="text-align:center;padding:1.5rem;color:var(--dim);font-style:italic;">No listings yet. List a card or profile picture to get started!</div>`;
    return;
  }
  el.innerHTML = mp.listings.map((l,i)=>{
    if(l.type === 'pfp'){
      return `<div style="display:flex;align-items:center;gap:.75rem;padding:.6rem;border:1px solid rgba(74,138,212,.35);border-radius:8px;margin-bottom:.45rem;background:rgba(0,0,0,.3);">
        <div style="width:56px;height:56px;border-radius:8px;overflow:hidden;border:2px solid #4a8ad4;background:#0a0a0f;flex-shrink:0;">
            <img src="${PFP_PATH(l.pfpId, 'square')}" style="width:100%;height:100%;object-fit:cover;">
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:.82rem;color:var(--text);font-weight:600;">Profile Picture ${l.pfpId}</div>
          <div style="font-size:.62rem;color:var(--dim);">profile picture - ${escapeHtml(l.seller||'You')}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:.8rem;color:#7fb6ff;">${STARLIGHT_ICON} ${l.price}</div>
          ${l.seller===USER_PROFILE.username
            ?`<button class="btn sm danger" style="font-size:.55rem;margin-top:.2rem;" onclick="cancelListing(${i})">Cancel</button>`
            :`<button class="btn sm pri" style="font-size:.55rem;margin-top:.2rem;" onclick="buyListing(${i})">Buy</button>`}
        </div>
      </div>`;
    }
    const c=CARDS.find(x=>x.id===l.cardId);
    if(!c) return '';
    return `<div style="display:flex;align-items:center;gap:.75rem;padding:.6rem;border:1px solid var(--border);border-radius:8px;margin-bottom:.45rem;background:rgba(0,0,0,.3);">
      <div style="width:42px;height:58px;border-radius:3px;overflow:hidden;border:1px solid ${RARITY_COLOR[c.rarity]||'var(--border)'};flex-shrink:0;background:#0a0a0f;">
        ${c.img?`<img src="${c.img}" style="width:100%;height:100%;object-fit:contain;">`:''}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:.78rem;color:var(--text);font-weight:600;">${escapeHtml(c.name)}</div>
        <div style="font-size:.6rem;color:var(--dim);">${c.rarity} - ${escapeHtml(l.seller||'You')}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-size:.78rem;color:#ffd700;">${STARLIGHT_ICON} ${l.price}</div>
        ${l.seller===USER_PROFILE.username
          ?`<button class="btn sm danger" style="font-size:.55rem;margin-top:.2rem;" onclick="cancelListing(${i})">Cancel</button>`
          :`<button class="btn sm pri" style="font-size:.55rem;margin-top:.2rem;" onclick="buyListing(${i})">Buy</button>`}
      </div>
    </div>`;
  }).join('');
}

function openSellCardModal(){
  const owned = USER_PROFILE.ownedCards || {};
  const entries = Object.entries(owned).filter(([id,count])=>count>0 && !isRetiredChallengerCard(id));
  if(!entries.length){toast('No cards to sell');return;}
  let html='<p style="color:var(--dim);margin-bottom:.5rem;font-size:.8rem;">Select a card to list:</p><div class="sell-card-grid">';
  entries.forEach(([id,count])=>{
    const c=CARDS.find(x=>x.id===id);
    if(!c) return;
    html+=`<div class="sell-card-pick" style="cursor:pointer;" onclick="listCardForSale('${id}')">
      <div class="sell-card-thumb" style="border:1px solid ${RARITY_COLOR[c.rarity]||'var(--border)'};overflow:hidden;background:#0a0a0f;">
        ${c.img?`<img src="${c.img}" style="width:100%;height:100%;object-fit:contain;">`:''}
      </div>
      <div style="font-size:.55rem;color:var(--text);margin-top:.15rem;">${escapeHtml(c.name)} x${count}</div>
    </div>`;
  });
  html+='</div>';
  showModal('Sell a Card',html,[{label:'Cancel',action:closeModal}]);
  const modalBox=document.querySelector('#modal .modal');
  if(modalBox) modalBox.classList.add('sell-card-modal');
}

function listCardForSale(cardId){
  closeModal();
  const c=CARDS.find(x=>x.id===cardId);
  if(!c || isRetiredChallengerCard(c)) return;
  const affLabel = escapeHtml(AFF_LABEL[c.aff] || c.aff || 'Neutral');
  const rarity = escapeHtml(c.rarity || 'common');
  const art = c.img ? `<img src="${c.img}" alt="${escapeHtml(c.name)}">` : `<div class="market-list-card-fallback">${getAffIcon(c.aff)}</div>`;
  showModal('List Card',`
    <div class="market-list-card-modal">
      <div class="market-list-card-preview" style="--rarity-color:${RARITY_COLOR[c.rarity]||'var(--border)'};">
        <div class="market-list-card-art">${art}</div>
        <div class="market-list-card-copy">
          <div class="market-list-kicker">Marketplace Listing</div>
          <div class="market-list-name">${escapeHtml(c.name)}</div>
          <div class="market-list-meta">${escapeHtml(c.type)}${c.cost>0?` • Cost ${c.xCost?'X':c.cost}`:''} • ${affLabel} • ${rarity}</div>
          <div class="market-list-note">Set a Starlight price. The card leaves your collection while listed and returns if you cancel the listing.</div>
        </div>
      </div>
      <label class="market-price-row" for="sell-price">
        <span>Price</span>
        <div class="market-price-input-wrap">
          <input type="number" id="sell-price" min="10" max="10000" value="100" step="5">
          <span>Starlight</span>
        </div>
      </label>
    </div>`,
  [{label:'List Card',pri:true,action:()=>{
    const price=parseInt(document.getElementById('sell-price')?.value)||100;
    if(!removeOwnedCardCount(cardId)){ toast('You no longer own that card'); closeModal(); return; }
    const mp=getMarketplace();
    mp.listings.push({type:'card', cardId, seller:USER_PROFILE.username, price, timestamp:Date.now()});
    saveProfile(); toast(`${c.name} listed for ${price} Starlight`); closeModal(); switchChTab('store');
  }},{label:'Cancel',action:closeModal}]);
  const modalBox=document.querySelector('#modal .modal');
  if(modalBox) modalBox.classList.add('sell-card-modal','market-list-modal');
}


function openSellPfpModal(){
  const ownedPfps = normalizeOwnedPfps();
  if(!ownedPfps.length){ toast('No profile pictures to sell'); return; }
  let html='<p style="color:var(--dim);margin-bottom:.6rem;font-size:.82rem;">Select a profile picture to list:</p><div style="display:flex;flex-wrap:wrap;gap:.6rem;max-height:250px;overflow-y:auto;">';
  ownedPfps.forEach(pfpId=>{
    html += `<div style="width:96px;cursor:pointer;text-align:center;" onclick="listPfpForSale(${pfpId})">
      <div style="width:96px;height:96px;border:2px solid #4a8ad4;border-radius:10px;overflow:hidden;background:#0a0a0f;">
        <img src="${PFP_PATH(pfpId, 'square')}" style="width:100%;height:100%;object-fit:cover;">
      </div>
      <div style="font-size:.6rem;color:var(--text);margin-top:.2rem;">PFP ${pfpId}</div>
    </div>`;
  });
  html+='</div>';
  showModal('Sell a Profile Picture', html, [{label:'Cancel', action:closeModal}]);
}

function listPfpForSale(pfpId){
  closeModal();
  showModal('Set Price',`
    <div style="display:flex;align-items:center;gap:1rem;margin-bottom:.7rem;">
      <div style="width:96px;height:96px;border:2px solid #4a8ad4;border-radius:10px;overflow:hidden;background:#0a0a0f;flex-shrink:0;">
          <img src="${PFP_PATH(pfpId, 'square')}" style="width:100%;height:100%;object-fit:cover;">
      </div>
      <div>
        <p style="margin:0 0 .2rem 0;">Listing <strong>Profile Picture ${pfpId}</strong></p>
        <div style="font-size:.72rem;color:var(--dim);">Profile picture listing preview</div>
      </div>
    </div>
    <div style="margin:.45rem 0 .2rem;">
      <label style="font-size:.75rem;color:var(--dim);">Price (Starlight):</label>
      <input type="number" id="sell-price" min="10" max="10000" value="50" style="padding:.3rem;background:var(--bg3);border:1px solid var(--border);color:var(--text);border-radius:3px;width:100px;margin-left:.4rem;">
    </div>`,
  [{label:'List',pri:true,action:()=>{
    const price=parseInt(document.getElementById('sell-price')?.value)||50;
    removeOwnedPfp(pfpId);
    const mp=getMarketplace();
    mp.listings.push({type:'pfp', pfpId, seller:USER_PROFILE.username, price, timestamp:Date.now()});
    saveProfile(); toast(`Profile picture ${pfpId} listed for ${price} Starlight`); closeModal(); switchChTab('store');
  }},{label:'Cancel',action:closeModal}]);
  const modalBox=document.querySelector('#modal .modal');
  if(modalBox) modalBox.classList.add('sell-card-modal');
}

function buyListing(i){
  const mp=getMarketplace();
  const l=mp.listings[i];
  if(!l) return;
  if((USER_PROFILE.starlight||0)<l.price){toast('Not enough Starlight');return;}
  if(l.type === 'pfp' && normalizeOwnedPfps().includes(l.pfpId)){ toast('You already own that profile picture'); return; }
  USER_PROFILE.starlight-=l.price;
  if(l.type === 'pfp') grantProfilePictures([l.pfpId]);
  else addOwnedCardCount(l.cardId, 1);
  mp.listings.splice(i,1);
  saveProfile();
  toast('Purchased!');
  playSfx('starPlace');
  switchChTab('store');
}

function cancelListing(i){
  const mp=getMarketplace();
  const l=mp.listings[i];
  if(!l) return;
  if(l.type === 'pfp') grantProfilePictures([l.pfpId]);
  else addOwnedCardCount(l.cardId, 1);
  mp.listings.splice(i,1);
  saveProfile();
  toast('Listing cancelled');
  switchChTab('store');
}

function renderChStoreTab(content) {
  content = resolveChRenderTarget(content, 'store');
  if(!content) return;
  const packs = USER_PROFILE.unopenedPacks || 0;
  const favoredPacks = USER_PROFILE.unopenedFavoredPacks || 0;
  const profilePacks = USER_PROFILE.unopenedProfilePacks || 0;
  const starlight = USER_PROFILE.starlight || 0;
  const canBuy = starlight >= PACK_COST_STARLIGHT;
  const canBuyFavored = starlight >= 500;
  const canBuyProfile = starlight >= 50;
  content.innerHTML = `
    <section class="ch-store-v3">
      <div class="ch-store-hero">
        <div class="ch-store-hero-copy">
          <div class="ch-store-kicker">Challenger Store</div>
          <h2>The Store</h2>
          <p>Acquire cards, profile pictures, and trade with other players using Starlight.</p>
        </div>
        <div class="ch-store-bank">
          <div class="ch-store-bank-label">Starlight Balance</div>
          <div class="ch-store-bank-value">${STARLIGHT_ICON}<span>${starlight}</span></div>
          <div class="ch-store-bank-sub">Spend on packs or marketplace trades</div>
        </div>
      </div>
      ${(packs+favoredPacks+profilePacks)>0 ? `<div class="ch-store-unopened">
        <div>
          <div class="ch-store-unopened-kicker">Ready to Open</div>
          <div class="ch-store-unopened-title">
            ${packs>0?`<span><strong>${packs}</strong> Standard</span>`:''}
            ${favoredPacks>0?`<span><strong>${favoredPacks}</strong> Favored</span>`:''}
            ${profilePacks>0?`<span><strong>${profilePacks}</strong> Profile Booster</span>`:''}
          </div>
        </div>
        <div class="ch-store-unopened-actions">
          ${packs>0?'<button class="btn pri" onclick="openNextPack()">Open Standard</button>':''}
          ${favoredPacks>0?'<button class="btn pri" onclick="openNextFavoredPack()">Open Favored</button>':''}
          ${profilePacks>0?'<button class="btn pri" onclick="openNextProfilePack()">Open Profile Booster</button>':''}
        </div>
      </div>`:''}
      <div class="ch-store-layout">
        <div class="ch-store-products">
          <div class="store-grid">
            <div class="booster-tile standard-booster ch-store-product ch-store-product-standard">
              <div class="booster-art standard-booster-art ch-store-product-art">
                <img src="Illustration3.png" alt="Standard Booster" loading="eager" decoding="async" draggable="false" onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'ch-store-pack-fallback\\'>PACK</div>'">
              </div>
              <div class="booster-info ch-store-product-info">
                <div class="ch-store-product-kicker">Base Set</div>
                <div class="booster-name">Fates Entwined Booster</div>
                <div class="booster-desc">All 80 cards from the base set of the game.</div>
                <div class="booster-contents">8 cards - 4 Triangles, 1+ Squares, 3 Supporters, 5% chance at a Star</div>
                <div class="booster-price-row">
                  <div class="booster-price">${STARLIGHT_ICON} ${PACK_COST_STARLIGHT}</div>
                  <button class="btn-buy" onclick="buyPack()" ${canBuy?'':'disabled'}>${canBuy?'Buy Pack':'Need '+PACK_COST_STARLIGHT}</button>
                </div>
              </div>
            </div>
            <div class="booster-tile favored-booster-gold ch-store-product ch-store-product-favored">
              <div class="booster-art favored-gold-art ch-store-product-art">
                <img src="Illustration3.png" alt="Favored Booster" loading="eager" decoding="async" draggable="false" onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'ch-store-pack-fallback\\'>FAVORED</div>'">
              </div>
              <div class="booster-info ch-store-product-info">
                <div class="ch-store-product-kicker">Premium Odds</div>
                <div class="booster-name">Favored Fates Entwined</div>
                <div class="booster-desc">Higher rarity and better Star odds for collection building.</div>
                <div class="booster-contents">5 cards - 2 Triangles, 3 Squares, ~33% chance at a Star</div>
                <div class="booster-price-row">
                  <div class="booster-price">${STARLIGHT_ICON} 500</div>
                  <button class="btn-buy" onclick="buyFavoredPack()" ${canBuyFavored?'':'disabled'}>${canBuyFavored?'Buy Pack':'Need 500'}</button>
                </div>
              </div>
            </div>
            <div class="booster-tile ch-store-product ch-store-product-profile">
              <div class="booster-art ch-store-product-art">
                <img src="pfpbooster.png" alt="Profile Picture Booster" loading="eager" decoding="async" draggable="false" onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'ch-store-pack-fallback\\'>PROFILE</div>'">
              </div>
              <div class="booster-info ch-store-product-info">
                <div class="ch-store-product-kicker">Profile</div>
                <div class="booster-name">Profile Picture Booster</div>
                <div class="booster-desc">Unlock two profile pictures for your account.</div>
                <div class="booster-contents">2 profile pictures - guaranteed no duplicates - selling removes them from your collection</div>
                <div class="booster-price-row">
                  <div class="booster-price">${STARLIGHT_ICON} 50</div>
                  <button class="btn-buy" onclick="buyProfilePack()" ${canBuyProfile?'':'disabled'}>${canBuyProfile?'Buy Pack':'Need 50'}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <aside class="marketplace-panel marketplace-pill ch-store-market">
          <div class="ch-store-market-head">
            <div>
              <div class="ch-store-kicker">Trading Floor</div>
              <h3>Marketplace</h3>
            </div>
            <button class="btn sm" onclick="renderMarketplaceListings()">Refresh</button>
          </div>
          <p>Buy and sell cards and profile pictures with other players.</p>
          <div id="market-redeem-panel" class="market-redeem-panel"></div>
          <div id="marketplace-listings"></div>
          <div class="ch-store-market-actions">
            <button class="btn sm pri" onclick="openSellCardModal()">Sell a Card</button>
            <button class="btn sm pri" onclick="openSellPfpModal()">Sell Profile Picture</button>
            <button class="btn sm" onclick="showMarketplaceTransactions()">Transactions</button>
          </div>
        </aside>
      </div>
    </section>`;
  renderMarketplaceListings();
}

function openNextPack(){
  playSfx('packOpen');
  _openNextPack();
}
function _openNextPack() {
  if((USER_PROFILE.unopenedPacks||0) <= 0){toast('No packs to open');return;}
  USER_PROFILE.unopenedPacks--;
  if(typeof updateDailyChallengeProgress === 'function') updateDailyChallengeProgress('packsOpened', 1, 'add');
  const ids = generatePack();
  const results = grantCardsToProfile(ids);
  saveProfile();
  showPackOpening(results);
}

// â”€â”€â”€ PACK OPENING ANIMATION â”€â”€â”€
function showPackOpening(results, packType) {
  const overlay = document.getElementById('pack-opening-overlay');
  const stage = document.getElementById('pack-stage-content');
  const sparkleLayer = document.getElementById('pack-sparkle-layer');
  const isFavored = packType === 'favored';
  overlay.classList.add('on');
  if(isFavored) overlay.classList.add('favored-opening');
  else overlay.classList.remove('favored-opening');
  sparkleLayer.innerHTML = '';
  // Stage 1: show the pack, prompt to click
  const packBorder = isFavored ? 'border-color:rgba(255,215,0,.8);box-shadow:0 16px 34px rgba(0,0,0,.58);' : '';
  stage.innerHTML = `
    <div class="pack-stage">
      <div class="pack-art-container">
        <div class="pack-art ${isFavored?'pack-art-favored':''}" id="pack-art-el" style="${packBorder}">
          <img src="Illustration3.png" alt="Booster Pack" onerror="this.parentElement.innerHTML='<div style=\\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:7rem;color:#ffd700;\\'>PACK</div>'">
        </div>
      </div>
      <div class="pack-prompt">CLICK TO OPEN</div>
    </div>`;
  const packEl = document.getElementById('pack-art-el');
  const onClick = ()=>{
    packEl.classList.add('opening');
    playSfx('starPlace');
    setTimeout(()=>{
      renderPackReveal(results);
    }, 620);
    packEl.removeEventListener('click', onClick);
  };
  packEl.addEventListener('click', onClick);
}

function renderPackReveal(results) {
  const stage = document.getElementById('pack-stage-content');
  stage.innerHTML = `
    <div class="pack-reveal-stage">
      <div style="font-family:'Cinzel',serif;color:#ffd700;font-size:1.3rem;letter-spacing:.12em;text-shadow:0 0 16px rgba(255,215,0,.6);margin-bottom:.5rem;">YOUR CARDS</div>
      <div style="color:var(--dim);font-size:.82rem;font-style:italic;">Click each card to reveal</div>
      <div class="pack-cards-grid" id="pack-cards-grid"></div>
      <button class="btn pri pack-done-btn" id="pack-done-btn" style="display:none;" onclick="closePackOpening()">Done</button>
    </div>`;
  const grid = document.getElementById('pack-cards-grid');
  results.forEach((r,idx)=>{
    const card = CARDS.find(c=>c.id===r.cardId);
    if(!card) return;
    const wrap = document.createElement('div');
    wrap.className = 'pack-card-wrap';
    const rarityClass = `rarity-${card.rarity}`;
    const badgeCls = `rb-${card.rarity}`;
    const rarityLabel = card.rarity==='star'?'Star':card.rarity==='square'?'Square':card.rarity==='triangle'?'Triangle':'Circle';
    wrap.innerHTML = `
      <div class="pack-card-inner">
        <div class="pack-card-face pack-card-back"></div>
        <div class="pack-card-face pack-card-front ${rarityClass}">
          ${card.img?`<img src="${card.img}" alt="${escapeHtml(card.name)}" onerror="this.style.display='none'">`:''}
          <div class="pack-card-rarity-badge ${badgeCls}">${rarityLabel}</div>
          ${r.isNew?'<div class="pack-card-new-badge">NEW</div>':''}
          <div class="pack-card-name">${escapeHtml(card.name)}</div>
        </div>
      </div>`;
    // Stagger entrance
    setTimeout(()=>wrap.classList.add('show'), 80*idx);
    wrap.addEventListener('click', ()=>{
      if(wrap.classList.contains('flipped')) return;
      wrap.classList.add('flipped');
      // Rarity-appropriate sound
      const rar = card.rarity;
      playSfx(rar==='star'?'starPlace':rar==='square'?'squarePlace':rar==='triangle'?'trianglePlace':'cardReveal');
      // Check all flipped
      const allFlipped = [...grid.querySelectorAll('.pack-card-wrap')].every(w=>w.classList.contains('flipped'));
      if(allFlipped){
        document.getElementById('pack-done-btn').style.display = 'inline-block';
      }
    });
    grid.appendChild(wrap);
  });
  // Auto-reveal button (skip click-one-by-one)
  const skipBtn = document.createElement('button');
  skipBtn.className='btn sm';
  skipBtn.textContent='Reveal All';
  skipBtn.style.marginTop='.6rem';
  skipBtn.onclick=()=>{
    const wraps = [...grid.querySelectorAll('.pack-card-wrap')];
    wraps.forEach((w,i)=>{
      setTimeout(()=>{
        if(!w.classList.contains('flipped')) w.click();
      }, i*120);
    });
    skipBtn.disabled = true;
    skipBtn.style.display = 'none';
    // Show done button after all reveals
    setTimeout(()=>{
      document.getElementById('pack-done-btn').style.display = 'inline-block';
    }, wraps.length * 120 + 200);
  };
  document.querySelector('.pack-reveal-stage').insertBefore(skipBtn, document.getElementById('pack-done-btn'));
}

function renderProfilePackReveal(pfpIds) {
  const stage = document.getElementById('pack-stage-content');
  stage.innerHTML = `
    <div class="pack-reveal-stage">
      <div style="font-family:'Cinzel',serif;color:#7fb6ff;font-size:1.28rem;letter-spacing:.12em;text-shadow:0 0 16px rgba(127,182,255,.6);margin-bottom:.5rem;">NEW PROFILE PICTURES</div>
      <div style="color:var(--dim);font-size:.82rem;font-style:italic;">Your rewards jump straight into view.</div>
      <div class="pack-cards-grid" id="pack-cards-grid"></div>
      <button class="btn pri pack-done-btn" id="pack-done-btn" style="display:none;background:linear-gradient(135deg,#4a8ad4,#245ea8);border-color:#7fb6ff;">Done</button>
    </div>`;
  const grid = document.getElementById('pack-cards-grid');
  const doneBtn = document.getElementById('pack-done-btn');
  doneBtn.onclick = closePackOpening;
  pfpIds.forEach((pfpId, idx)=>{
    const wrap = document.createElement('div');
    wrap.className = 'pack-card-wrap profile-pack-card';
    wrap.innerHTML = `
      <div class="pack-card-face pack-card-front rarity-circle" style="border-color:#7fb6ff;box-shadow:0 8px 18px rgba(0,0,0,.42);">
      <img src="${PFP_PATH(pfpId, 'square')}" alt="Profile picture ${pfpId}" style="object-fit:cover;object-position:center;">
        <div class="pack-card-name">Profile Picture ${pfpId}</div>
      </div>`;
    setTimeout(()=>wrap.classList.add('show'), 80*idx);
    grid.appendChild(wrap);
    setTimeout(()=>{
      playSfx('trianglePlace');
      if(idx === pfpIds.length - 1){
        setTimeout(()=>{ doneBtn.style.display = 'inline-block'; }, 260);
      }
    }, 360 + idx*180);
  });
}

function closePackOpening() {
  const ov = document.getElementById('pack-opening-overlay');
  const stage = document.getElementById('pack-stage-content');
  const sparkleLayer = document.getElementById('pack-sparkle-layer');
  ov.classList.remove('on');
  ov.classList.remove('favored-opening');
  clearTimeout(window.__fatePackCloseCleanupTimer);
  window.__fatePackCloseCleanupTimer = setTimeout(function(){
    if(!ov.classList.contains('on')){
      if(stage) stage.innerHTML = '';
      if(sparkleLayer) sparkleLayer.innerHTML = '';
    }
  }, 360);
  // Refresh current tab if in challenger hub
  if(document.getElementById('s-challenger').classList.contains('active')){
    updateChTopbar();
    switchChTab(_currentChTab);
  }
}

// â”€â”€â”€ CHALLENGER COLLECTION TAB â”€â”€â”€
let _collFilter = 'all';
function renderChCollectionTab(content) {
  content = resolveChRenderTarget(content, 'collection');
  if(!content) return;
  const owned = USER_PROFILE.ownedCards || {};
  const collectionPool = getChallengerCardPool();
  const collectionIds = new Set(collectionPool.map(c=>c.id));
  const totalCards = collectionPool.length;
  const ownedCount = Object.keys(owned).filter(id=>collectionIds.has(id) && owned[id]>0).length;
  const totalCopies = Object.entries(owned).reduce((sum,[id,count])=>sum + (collectionIds.has(id) ? count : 0), 0);
  content.innerHTML = `
    <div class="collection-stats">
      <div class="coll-stat"><div class="coll-stat-lbl">Unique</div><div class="coll-stat-val">${ownedCount}/${totalCards}</div></div>
      <div class="coll-stat"><div class="coll-stat-lbl">Total Copies</div><div class="coll-stat-val">${totalCopies}</div></div>
      <div class="coll-stat"><div class="coll-stat-lbl">Completion</div><div class="coll-stat-val">${Math.round(ownedCount/totalCards*100)}%</div></div>
    </div>
    <div class="ch-filter-bar">
      <button class="db-filter ${_collFilter==='all'?'active':''}" onclick="setCollFilter('all')">All</button>
      <button class="db-filter ${_collFilter==='owned'?'active':''}" onclick="setCollFilter('owned')">Owned</button>
      <button class="db-filter ${_collFilter==='missing'?'active':''}" onclick="setCollFilter('missing')">Missing</button>
      <span style="width:1px;height:20px;background:var(--border);margin:0 .2rem;"></span>
      <button class="db-filter ${_collFilter==='star'?'active':''}" style="color:#d4c44a;border-color:rgba(255,215,0,.4);" onclick="setCollFilter('star')">Star</button>
      <button class="db-filter ${_collFilter==='square'?'active':''}" style="color:#b36ce0;border-color:rgba(160,100,220,.4);" onclick="setCollFilter('square')">Square</button>
      <button class="db-filter ${_collFilter==='triangle'?'active':''}" style="color:#d48a4a;border-color:rgba(212,138,74,.4);" onclick="setCollFilter('triangle')">Triangle</button>
      <button class="db-filter ${_collFilter==='circle'?'active':''}" style="color:#4a8ad4;border-color:rgba(74,138,212,.4);" onclick="setCollFilter('circle')">Circle</button>
    </div>
    <div class="collection-grid" id="coll-grid"></div>`;
  const grid = document.getElementById('coll-grid');
  const cards = sortCardsByArtNumber(collectionPool.filter(c=>{
    const ct = owned[c.id] || 0;
    if(_collFilter==='owned') return ct>0;
    if(_collFilter==='missing') return ct===0;
    if(['star','square','triangle','circle'].includes(_collFilter)) return c.rarity===_collFilter;
    return true;
  }));
  if(typeof renderCanvasDeckCollection === 'function') {
    const entries = cards.map(c=>{
      const ct = owned[c.id] || 0;
      return {
        card:c,
        count:0,
        ownedText:ct>0 ? `x${ct}` : '',
        locked:ct <= 0,
        title:`${c.name} - ${ct>0 ? `Owned: ${ct}` : 'Not owned'}`,
        ariaLabel:c.name
      };
    });
    if(renderCanvasDeckCollection(grid, entries, {
      align:'left',
      virtualize:false,
      lowScroll:true,
      maxDpr:1,
      hoverRedraw:false,
      suppressLockedGlyph:true,
      onClick:(card)=>openCardDetail(card)
    })) return;
  }
  cards.forEach(c=>{
    const ct = owned[c.id] || 0;
    const el = document.createElement('div');
    el.className = `coll-card ${ct>0?'owned':'not-owned'} rarity-${c.rarity}`;
    el.innerHTML = `
      ${c.img?`<img src="${c.img}" alt="${escapeHtml(c.name)}" loading="lazy" decoding="async" draggable="false" onerror="this.style.display='none'">`:''}
      ${ct>0?`<div class="coll-count">x${ct}</div>`:''}`;
    el.onclick = ()=>openCardDetail(c);
    el.title = `${c.name} - ${ct>0?`Owned: ${ct}`:'Not owned'}`;
    grid.appendChild(el);
  });
}

function setCollFilter(f) {
  _collFilter = f;
  renderChCollectionTab(document.getElementById('ch-content'));
}

// â”€â”€â”€ CHALLENGER DECK BUILDER TAB â”€â”€â”€
let _cdbFilter = 'all';
let _cdbSearch = '';
let _cdbCurrentDeckId = null; // null = building a new deck
let _cdbCurrentDeckIds = [];
let _cdbCurrentName = 'New Deck';
let _cdbCurrentDesc = '';
let _cdbCurrentTheme = 'Hybrid';
let _challengerDeckBrowsePage = 0;

function createChallengerDeckId(prefix='ch_user') {
  const cryptoApi = typeof crypto !== 'undefined' ? crypto : (typeof window !== 'undefined' ? window.crypto : null);
  if(cryptoApi && typeof cryptoApi.randomUUID === 'function'){
    return `${prefix}_${cryptoApi.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
}

function getMatchingStarterDeckForPreset(preset, pid) {
  if(!preset) return null;
  if(preset.lockedStarter || preset.starter || preset.builtin) {
    return STARTER_DECKS.find(deck => preset.starterId === deck.id || preset.name === deck.name || preset.name === `Starter: ${deck.name}`) || null;
  }
  if(pid) {
    const byId = STARTER_DECKS.find(deck => String(pid).startsWith(`ch_${deck.id}_`) || String(pid) === `ch_${deck.id}`);
    if(byId) return byId;
  }
  return STARTER_DECKS.find(deck =>
    (preset.name === deck.name || preset.name === `Starter: ${deck.name}`) &&
    Array.isArray(preset.ids) &&
    JSON.stringify(preset.ids) === JSON.stringify(deck.ids)
  ) || null;
}

function isChallengerStarterPreset(preset, pid) {
  return !!getMatchingStarterDeckForPreset(preset, pid);
}

function showChallengerStarterDeckWarning(name) {
  const deckName = name || 'Starter deck';
  if(typeof showDeckOverwriteBanner === 'function') showDeckOverwriteBanner(deckName, 'Starter deck locked');
  toast('Starter decks cannot be overwritten. Use Save as new to make an editable copy.');
}
window.showChallengerStarterDeckWarning = showChallengerStarterDeckWarning;

function renderChDeckBuilderTab(content) {
  content = resolveChRenderTarget(content, 'deckbuilder');
  if(!content) return;
  const owned = USER_PROFILE.ownedCards || {};
  const presets = USER_PROFILE.challengerPresets || {};
  const presetKeys = Object.keys(presets);
  const currentPreset = _cdbCurrentDeckId ? presets[_cdbCurrentDeckId] : null;
  const currentIsStarter = isChallengerStarterPreset(currentPreset, _cdbCurrentDeckId);

  content.innerHTML = `
    <div class="cdb-command-panel">
      <div class="cdb-command-search">
        <input type="text" id="cdb-search" class="db-search cdb-search-inline" value="${escapeHtml(_cdbSearch)}" maxlength="40" placeholder="Search names or card text..." oninput="setCdbSearch(this.value)">
      </div>
      <div class="cdb-command-title">
        <h3>YOUR DECKS (${presetKeys.length})</h3>
      </div>
      <div class="cdb-command-actions">
        <button class="btn sm" onclick="browseChallengerDecks()">My Decks</button>
        <button class="btn sm pri" onclick="cdbSaveDeck()">Save as new</button>
        ${_cdbCurrentDeckId ? (currentIsStarter
          ? `<button class="btn sm cdb-starter-locked-btn" style="border-color:rgba(232,196,82,.46);color:#e8c452;" onclick="showChallengerStarterDeckWarning(${jsString(currentPreset?.name || 'Starter deck')})">Starter Locked</button>`
          : `<button class="btn sm" style="border-color:var(--gold);color:var(--gold);" onclick="cdbOverwriteDeck()">Overwrite Current</button>`) : ''}
        ${_cdbCurrentDeckId ? `<button class="btn sm danger" onclick="cdbDeleteDeck()">Delete</button>` : ''}
      </div>
    </div>
    <div class="ch-filter-bar">
      <button class="db-filter ${_cdbFilter==='all'?'active':''}" onclick="setCdbFilter('all')">All Owned</button>
      <button class="db-filter ${_cdbFilter==='Supporter'?'active':''}" onclick="setCdbFilter('Supporter')">Supporters</button>
      <button class="db-filter ${_cdbFilter==='Initiator'?'active':''}" onclick="setCdbFilter('Initiator')">Initiators</button>
      <button class="db-filter ${_cdbFilter==='Coordinator'?'active':''}" onclick="setCdbFilter('Coordinator')">Coordinators</button>
      <button class="db-filter ${_cdbFilter==='Dauntless'?'active':''}" onclick="setCdbFilter('Dauntless')">Dauntless</button>
      <button class="db-filter ${_cdbFilter==='Improvisor'?'active':''}" onclick="setCdbFilter('Improvisor')">Improvisors</button>
      <span style="width:1px;height:20px;background:var(--border);margin:0 .2rem;"></span>
      <button class="db-filter ${_cdbFilter==='third_great_war'?'active':''}" onclick="setCdbFilter('third_great_war')">Third Great War</button>
      <button class="db-filter ${_cdbFilter==='reality'?'active':''}" onclick="setCdbFilter('reality')">Reality</button>
      <button class="db-filter ${_cdbFilter==='expanded_worlds'?'active':''}" onclick="setCdbFilter('expanded_worlds')">Expanded Worlds</button>
      <button class="db-filter ${_cdbFilter==='eventide'?'active':''}" onclick="setCdbFilter('eventide')">Eventide</button>
      <span style="width:1px;height:20px;background:var(--border);margin:0 .2rem;"></span>
      <button class="db-filter ${_cdbFilter==='star'?'active':''}" style="color:#d4c44a;border-color:rgba(255,215,0,.4);" onclick="setCdbFilter('star')">Star</button>
      <button class="db-filter ${_cdbFilter==='square'?'active':''}" style="color:#b36ce0;border-color:rgba(160,100,220,.4);" onclick="setCdbFilter('square')">Square</button>
      <button class="db-filter ${_cdbFilter==='triangle'?'active':''}" style="color:#d48a4a;border-color:rgba(212,138,74,.4);" onclick="setCdbFilter('triangle')">Triangle</button>
      <button class="db-filter ${_cdbFilter==='circle'?'active':''}" style="color:#4a8ad4;border-color:rgba(74,138,212,.4);" onclick="setCdbFilter('circle')">Circle</button>
    </div>
    <div class="cdb-wrap">
      <div class="cdb-left">
        <div class="cdb-collection" id="cdb-collection"></div>
      </div>
      <div class="cdb-right">
        ${currentIsStarter ? `<div class="cdb-starter-warning">This is a starter deck. It cannot be overwritten; use Save as new to create an editable copy.</div>` : ''}
        <div style="font-family:'Cinzel',serif;font-size:.85rem;color:#ffd700;letter-spacing:.08em;padding:.3rem 0 .5rem;border-bottom:1px solid var(--border);">
          CURRENT DECK (<span id="cdb-count">${_cdbCurrentDeckIds.length}</span>/40)
        </div>
        <div class="cdb-decklist" id="cdb-decklist"></div>
        <div style="display:flex;gap:.3rem;margin-top:.5rem;">
          <button class="btn sm danger" onclick="cdbClear()">Clear</button>
        </div>
      </div>
    </div>`;
  renderCdbCollection();
  renderCdbDecklist();
}

function setCdbSearch(value) {
  _cdbSearch = String(value || '').trim().toLowerCase();
  renderCdbCollection();
}

function browseChallengerDecks(selectedPid=null, page=_challengerDeckBrowsePage) {
  if(typeof resetModalChrome === 'function') resetModalChrome();
  const presets = USER_PROFILE.challengerPresets || {};
  const keys = Object.keys(presets);
  const pageSize = 3;
  const body = document.createElement('div');
  if(!keys.length){
    body.innerHTML = `<div style="text-align:center;padding:2rem 1rem;color:var(--dim);font-style:italic;">No Challenger decks yet. Build one in the Deck Builder tab.</div>`;
    document.getElementById('modal-body').innerHTML='';
    document.getElementById('modal-body').appendChild(body);
    document.getElementById('modal-title').textContent='My Challenger Decks';
    document.getElementById('modal-acts').innerHTML='';
    const close=document.createElement('button');
    close.className='btn sm';
    close.textContent='Close';
    close.onclick=closeModal;
    document.getElementById('modal-acts').appendChild(close);
    document.getElementById('modal').classList.add('on');
    return;
  }

  const totalPages = Math.max(1, Math.ceil(keys.length / pageSize));
  if(selectedPid && keys.includes(selectedPid)){
    _challengerDeckBrowsePage = Math.floor(keys.indexOf(selectedPid) / pageSize);
  } else {
    _challengerDeckBrowsePage = Math.max(0, Math.min(page, totalPages - 1));
  }
  const pageKeys = keys.slice(_challengerDeckBrowsePage * pageSize, _challengerDeckBrowsePage * pageSize + pageSize);

  body.innerHTML = `<div class="my-decks-modal-topbar"><p style="font-size:.85rem;color:var(--dim);font-style:italic;margin:0;">Choose a deck to preview, load, or customize for Challenger.</p></div>`;
  const grid = document.createElement('div');
  grid.className = 'preset-browse-grid deck-pick-grid challenger-deck-browse-grid fixed-deck-tile-grid my-presets-as-choose-deck';
  grid.style.gridAutoRows = '480px';
  pageKeys.forEach(pid=>{
    const preset = presets[pid];
    const sampleIds = [...new Set(preset.ids)];
    const sampleCards = sampleIds.map(id=>CARDS.find(c=>c.id===id)).filter(Boolean);
    const hero = preset.faceCardId ? CARDS.find(c=>c.id===preset.faceCardId) : ([...sampleCards].sort((a,b)=>(b.fate||0)-(a.fate||0))[0] || sampleCards[0]);
    const displayCards = (preset.displayCardIds && preset.displayCardIds.length
      ? preset.displayCardIds.map(id=>CARDS.find(c=>c.id===id)).filter(c=>c&&c.img)
      : sampleCards.filter(c=>c.img)
    ).slice(0,7);
    const tile = document.createElement('div');
    tile.className = 'preset-browse-tile fixed-deck-tile';
    tile.style.height = '480px';
    tile.style.minHeight = '480px';
    tile.style.maxHeight = '480px';
    if(selectedPid===pid) tile.style.borderColor = 'var(--gold)';
    const useCanvasPreview = false;
    tile.innerHTML = `
      <div class="preset-tile-art">
        ${useCanvasPreview ? '<canvas class="canvas-deck-preview-hero" aria-hidden="true"></canvas>' : (hero?.img ? `<img src="${hero.img}" alt="${escapeHtml(hero.name)}" loading="lazy" decoding="async" draggable="false" onerror="this.style.display='none'">` : '')}
        <div class="preset-tile-overlay"></div>
      </div>
      <div class="preset-tile-info">
        <div class="preset-name">${escapeHtml(preset.name)}</div>
        <div class="preset-desc">${escapeHtml(preset.description||'')}</div>
        <div class="preset-minis">
          ${useCanvasPreview ? '<canvas class="canvas-deck-preview-minis" aria-hidden="true"></canvas>' : displayCards.map(c=>`<div class="preset-mini-art">${c.img?`<img src="${typeof getRuntimeCardImageSrc === 'function' ? getRuntimeCardImageSrc(c.img, 'thumb') : c.img}" alt="${escapeHtml(c.name)}" loading="lazy" decoding="async" draggable="false">`:''}</div>`).join('')}
        </div>
        <div class="preset-action-row">
          <button class="btn sm pri" onclick="event.stopPropagation();cdbEditDeck('${pid}');closeModal();">Edit Deck</button>
          <button class="btn sm" onclick="event.stopPropagation();cdbEditAppearance('${pid}')">Edit Art</button>
        </div>
      </div>`;
    if(useCanvasPreview) scheduleCanvasDeckPreviewTile(tile, {hero, minis:displayCards});
    tile.onclick = ()=>viewChallengerDeckContents(pid);
    grid.appendChild(tile);
  });
  body.appendChild(grid);
  requestAnimationFrame(function(){
    grid.querySelectorAll('.preset-browse-tile').forEach(function(tile){
      const nameEl = tile.querySelector('.preset-name');
      if(!nameEl || !window.getComputedStyle) return;
      const lineHeight = parseFloat(getComputedStyle(nameEl).lineHeight) || nameEl.getBoundingClientRect().height || 1;
      const lines = Math.max(1, Math.round(nameEl.getBoundingClientRect().height / lineHeight));
      tile.classList.toggle('preset-title-single-line', lines <= 1);
      tile.classList.toggle('preset-title-two-line', lines > 1);
    });
  });
  const footer = document.createElement('div');
  footer.style.display = 'flex';
  footer.style.justifyContent = 'space-between';
  footer.style.alignItems = 'center';
  footer.style.gap = '.75rem';
  footer.style.flexWrap = 'wrap';
  footer.style.marginTop = '1rem';
  footer.innerHTML = `
    <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">
      <button class="btn sm" onclick="browseChallengerDecks(null, ${_challengerDeckBrowsePage-1})" ${_challengerDeckBrowsePage<=0?'disabled':''}>Prev</button>
      <button class="btn sm" onclick="renderChallengerDeckOrderEditor()" ${keys.length<=1?'disabled':''}>Edit Order</button>
      <button class="btn sm" onclick="browseChallengerDecks(null, ${_challengerDeckBrowsePage+1})" ${_challengerDeckBrowsePage>=totalPages-1?'disabled':''}>Next</button>
    </div>
    <div style="font-family:'Cinzel',serif;font-size:.68rem;color:var(--dim);letter-spacing:.08em;">Page ${_challengerDeckBrowsePage+1} / ${totalPages}</div>`;
  body.appendChild(footer);
  document.getElementById('modal-body').innerHTML='';
  document.getElementById('modal-body').appendChild(body);
  document.getElementById('modal-body').style.overflow = 'hidden';
  document.getElementById('modal-body').style.maxHeight = 'none';
  document.getElementById('modal-title').textContent='My Challenger Decks';
  document.getElementById('modal-acts').innerHTML='';
  const close=document.createElement('button');
  close.className='btn sm';
  close.textContent='Close';
  close.onclick=closeModal;
  document.getElementById('modal-acts').appendChild(close);
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox) modalBox.classList.add('challenger-my-decks-modal');
  document.getElementById('modal')?.classList.add('no-edge-corners-modal');
  document.getElementById('modal').classList.add('on');
}

function viewChallengerDeckContents(pid) {
  const preset = getDeckPickPresetsForCurrentMode()?.[pid] || USER_PROFILE.challengerPresets?.[pid];
  if(!preset) return;
  const cameFromDeckPick = !!document.querySelector('#modal .modal[data-choose-deck-modal="1"], #modal .choose-deck-canonical-modal') ||
    !!(typeof G !== 'undefined' && G && (G._pickDeckAfterMatchmaking || G._pickDeckAfterAi)) ||
    CURRENT_MODE === 'free';
  const counts = {};
  (preset.ids || []).forEach(id=>{ counts[id] = (counts[id]||0)+1; });
  const deckCards = Object.keys(counts)
    .map(id=>CARDS.find(c=>c.id===id))
    .filter(Boolean)
    .sort((a,b)=>getCardOrderNumber(a)-getCardOrderNumber(b) || a.name.localeCompare(b.name));
  const body = document.createElement('div');
  body.className = 'deck-inspect-view title-deck-inspect-view';
  const hero = preset.faceCardId ? CARDS.find(c=>c.id===preset.faceCardId) : deckCards[0];
  const totalCards = (preset.ids || []).length;
  const theme = preset.theme || 'Challenger';
  body.innerHTML = `
    <div class="deck-inspect-topbar">
      <div>
        <div class="deck-inspect-name">${escapeHtml(preset.name)}</div>
      </div>
    </div>
    <div class="deck-inspect-summary">
      <div class="deck-inspect-brief">
        <p>${escapeHtml(preset.description||'')}</p>
        <div class="deck-inspect-metrics">
          <span><b>${totalCards}</b><em>Total Cards</em></span>
          <span><b>${deckCards.length}</b><em>Unique Cards</em></span>
          <span class="deck-inspect-theme-metric${typeof deckThemeFitClass === 'function' ? deckThemeFitClass(theme) : ''}"><b>${escapeHtml(theme)}</b><em>Theme</em></span>
        </div>
      </div>
      <div class="deck-inspect-hero">${hero?.img ? `<img src="${hero.img}" alt="${escapeHtml(hero.name)}">` : ''}</div>
    </div>
    <section class="deck-inspect-contents">
      <div class="deck-inspect-section-title">Deck Contents <span>${deckCards.length} unique cards</span></div>
      <div class="preset-view-grid"></div>
    </section>`;
  const goBack = ()=>{
    if(CURRENT_MODE === 'free') return renderFreePlayTitlePresetDeckPickModal(_challengerDeckPickPage || 0);
    return cameFromDeckPick
      ? renderChallengerDeckPickModal(_challengerDeckPickPage || 0)
      : browseChallengerDecks(pid, _challengerDeckBrowsePage || 0);
  };
  const inlineBack = body.querySelector('.deck-inspect-back-inline');
  if(inlineBack) inlineBack.onclick = goBack;
  const grid = body.querySelector('.preset-view-grid');
  if(grid) grid.classList.toggle('deck-preview-scroll-extra-row', deckCards.length >= 15);
  document.getElementById('modal-body').innerHTML='';
  document.getElementById('modal-body').appendChild(body);
  const heroBox = body.querySelector('.deck-inspect-hero');
  if(heroBox && hero?.img && typeof window.renderCanvasImage === 'function') {
    heroBox.textContent = '';
    const canvas = document.createElement('canvas');
    canvas.className = 'deck-inspect-hero-canvas';
    canvas.setAttribute('aria-hidden','true');
    heroBox.appendChild(canvas);
    window.renderCanvasImage(canvas, hero.img, {mode:'cover', parent:heroBox, background:'transparent', maxDpr:4, cropY:.08});
  }
  if(false && grid && typeof window.renderCanvasDeckCollection === 'function') {
    grid.style.setProperty('--dbcw', '82px');
    grid.style.setProperty('--dbch', '115px');
    window.renderCanvasDeckCollection(grid, deckCards.map(c=>({
      card: c,
      count: 0,
      ownedText: 'x' + (counts[c.id] || 1),
      title: c.name,
      ariaLabel: c.name
    })), {
      onClick: (card)=>openCardDetailFromDeckPreview(card, ()=>viewChallengerDeckContents(pid)),
      onContextMenu: (card)=>showCardInfoOverlay(card)
    });
  } else if(grid) {
    deckCards.forEach(c=>{
      const count = counts[c.id] || 0;
      const el = document.createElement('div');
      el.className='mc visual-mc preset-view-card';
      el.title = c.name;
      el.innerHTML = `
        <div class="mc-art">${c.img?`<img src="${c.img}" alt="${escapeHtml(c.name)}">`:`<span class="mc-ico">${getAffIcon(c.aff)}</span>`}</div>
        <div class="visual-name">${escapeHtml(c.name)}</div>
        ${count>1?`<div class="preset-card-count">×${count}</div>`:`<div class="preset-card-count" style="opacity:.7;">×1</div>`}`;
      el.onclick = ()=>openCardDetailFromDeckPreview(c, ()=>viewChallengerDeckContents(pid));
      grid.appendChild(el);
    });
  }
  document.getElementById('modal-title').textContent = `${preset.name} - ${totalCards} Cards`;
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox){
    modalBox.classList.remove('choose-deck-canonical-modal','choose-deck-runtime-modal','challenger-my-decks-modal');
    delete modalBox.dataset.chooseDeckModal;
    modalBox.classList.add('deck-inspect-compact-modal','title-deck-preview-modal');
  }
  const acts = document.getElementById('modal-acts');
  acts.innerHTML='';
  const backBtn = document.createElement('button');
  backBtn.className='btn sm';
  backBtn.textContent='Back';
  backBtn.onclick = goBack;
  if(CURRENT_MODE === 'free'){
    acts.appendChild(backBtn);
    document.getElementById('modal').classList.add('on');
    return;
  }
  acts.appendChild(backBtn);
  document.getElementById('modal').classList.add('on');
}

function cdbEditAppearance(pid=null){
  if(typeof resetModalChrome === 'function') resetModalChrome();
  const targetId = pid || _cdbCurrentDeckId;
  const presets = USER_PROFILE.challengerPresets || {};
  const p = presets[targetId];
  if(!p){ toast('Save this Challenger deck first'); return; }
  const uniqueIds = [...new Set(p.ids)];
  const deckCards = uniqueIds.map(id=>CARDS.find(c=>c.id===id)).filter(Boolean);
  let currentFace = p.faceCardId || deckCards[0]?.id;
  let currentDisplay = [...(p.displayCardIds || deckCards.slice(0,7).map(c=>c.id))];

  const renderEditor = ()=>{
    const body = document.createElement('div');
    body.className = 'deck-art-editor challenger-deck-art-editor deck-art-editor-v2';
    body.innerHTML = `
      <div class="deck-art-editor-main">
        <aside class="deck-art-preview-panel">
          <div class="deck-art-preview-label">Selected Preview</div>
          <div class="deck-art-face-preview" id="ch-face-preview"></div>
          <div class="deck-art-display-preview" id="ch-display-preview"></div>
        </aside>
        <div class="deck-art-picker-stack">
        <section class="deck-art-editor-section">
          <div class="deck-art-editor-title">Face Card</div>
          <div class="face-picker-grid" id="ch-face-picker"></div>
        </section>
        <section class="deck-art-editor-section">
          <div class="deck-art-editor-title">Display Cards (up to 7) - <span id="ch-display-count">${currentDisplay.length}/7</span></div>
          <div class="face-picker-grid" id="ch-display-picker"></div>
        </section>
        </div>
      </div>`;
    document.getElementById('modal-body').innerHTML='';
    document.getElementById('modal-body').appendChild(body);
    const renderPreview = ()=>{
      const faceCard = deckCards.find(c=>c.id===currentFace) || deckCards[0];
      const facePreview = body.querySelector('#ch-face-preview');
      if(facePreview) {
        facePreview.innerHTML = faceCard?.img
          ? `<img src="${faceCard.img}" alt="${escapeHtml(faceCard.name)}"><span>${escapeHtml(faceCard.name)}</span>`
          : '';
      }
      const strip = body.querySelector('#ch-display-preview');
      if(strip) {
        strip.innerHTML = currentDisplay.map(id=>{
          const c = deckCards.find(card=>card.id===id);
          return c?.img ? `<div><img src="${c.img}" alt="${escapeHtml(c.name)}"></div>` : '';
        }).join('');
      }
    };
    const renderPickers = ()=>{
      const faceGrid = body.querySelector('#ch-face-picker');
      const displayGrid = body.querySelector('#ch-display-picker');
      if(false && typeof window.renderCanvasSelectableCardGrid === 'function') {
        window.renderCanvasSelectableCardGrid(faceGrid, deckCards, {
          isSelected: c=>c.id===currentFace,
          selectedLabel:'FACE',
          onSelect: c=>{ currentFace = c.id; renderPickers(); }
        });
        window.renderCanvasSelectableCardGrid(displayGrid, deckCards, {
          isSelected: c=>currentDisplay.includes(c.id),
          selectedLabel: c=>'#'+(currentDisplay.indexOf(c.id)+1),
          onSelect: c=>{
            const idx = currentDisplay.indexOf(c.id);
            if(idx>=0) currentDisplay.splice(idx,1);
            else {
              if(currentDisplay.length>=7){ toast('Max 7 display cards'); return; }
              currentDisplay.push(c.id);
            }
            const countEl = document.getElementById('ch-display-count');
            if(countEl) countEl.textContent = currentDisplay.length+'/7';
            renderPickers();
          }
        });
        return;
      }
      const setBadge = function(el, text, gold){
        let badge = el.querySelector('.fp-badge');
        if(!text){
          if(badge) badge.remove();
          return;
        }
        if(!badge){
          badge = document.createElement('div');
          badge.className = 'fp-badge';
          el.appendChild(badge);
        }
        badge.textContent = text;
        badge.style.color = gold ? 'var(--gold)' : '';
      };
      const syncPickerState = function(){
        faceGrid.querySelectorAll('.face-picker-card').forEach(function(el){
          const selected = el.dataset.cardId === currentFace;
          el.classList.toggle('face-sel', selected);
          setBadge(el, selected ? 'FACE' : '', false);
        });
        displayGrid.querySelectorAll('.face-picker-card').forEach(function(el){
          const idx = currentDisplay.indexOf(el.dataset.cardId);
          const selected = idx >= 0;
          el.classList.toggle('display-sel', selected);
          setBadge(el, selected ? '#' + (idx + 1) : '', true);
        });
        const countEl = document.getElementById('ch-display-count');
        if(countEl) countEl.textContent = currentDisplay.length + '/7';
        renderPreview();
      };
      if(faceGrid.childElementCount || displayGrid.childElementCount){
        syncPickerState();
        return;
      }
      faceGrid.innerHTML=''; displayGrid.innerHTML='';
      deckCards.forEach(c=>{
        const faceEl = document.createElement('div');
        faceEl.className = 'face-picker-card';
        faceEl.dataset.cardId = c.id;
        faceEl.innerHTML = `${c.img?`<img src="${c.img}" alt="${escapeHtml(c.name)}">`:''}`;
        faceEl.title = c.name;
        faceEl.onclick = ()=>{ currentFace = c.id; syncPickerState(); };
        faceGrid.appendChild(faceEl);

        const displayEl = document.createElement('div');
        displayEl.className = 'face-picker-card';
        displayEl.dataset.cardId = c.id;
        displayEl.innerHTML = `${c.img?`<img src="${c.img}" alt="${escapeHtml(c.name)}">`:''}`;
        displayEl.title = c.name;
        displayEl.onclick = ()=>{
          const idx = currentDisplay.indexOf(c.id);
          if(idx>=0) currentDisplay.splice(idx,1);
          else {
            if(currentDisplay.length>=7){ toast('Max 7 display cards'); return; }
            currentDisplay.push(c.id);
          }
          syncPickerState();
        };
        displayGrid.appendChild(displayEl);
      });
      syncPickerState();
    };
    renderPickers();
    document.getElementById('modal-title').textContent = 'Edit Challenger Deck Art';
    const acts = document.getElementById('modal-acts');
    acts.innerHTML='';
    const cancel = document.createElement('button');
    cancel.className='btn sm';
    cancel.textContent='Back';
    cancel.onclick = ()=>browseChallengerDecks(targetId, _challengerDeckBrowsePage || 0);
    const save = document.createElement('button');
    save.className='btn sm pri';
    save.textContent='Save';
    save.onclick = ()=>{
      p.faceCardId = currentFace;
      p.displayCardIds = currentDisplay;
      saveProfile();
      if(targetId===_cdbCurrentDeckId) renderChDeckBuilderTab(document.getElementById('ch-content'));
      toast('Challenger deck art updated');
      browseChallengerDecks(targetId, _challengerDeckBrowsePage || 0);
    };
    acts.appendChild(cancel);
    acts.appendChild(save);
    const modalBox = document.querySelector('#modal .modal');
    if(modalBox) modalBox.classList.add('deck-art-editor-modal','challenger-deck-art-editor-modal');
    document.getElementById('modal').classList.add('on');
  };
  renderEditor();
}

function renderCdbCollection() {
  const col = document.getElementById('cdb-collection');
  if(!col) return;
  col.innerHTML = '';
  const searchEl = document.getElementById('cdb-search');
  if(searchEl && searchEl.value !== _cdbSearch) searchEl.value = _cdbSearch;
  const owned = USER_PROFILE.ownedCards || {};
  const rarities = ['star','square','triangle','circle'];
  const cards = sortCardsByArtNumber(getChallengerCardPool().filter(c=>{
    const ct = owned[c.id] || 0;
    if(ct <= 0) return false; // only owned
    if(_cdbFilter==='all') return true;
    if(['Supporter','Initiator','Coordinator','Dauntless','Improvisor'].includes(_cdbFilter)) return c.type===_cdbFilter;
    if(rarities.includes(_cdbFilter)) return c.rarity===_cdbFilter;
    return c.aff===_cdbFilter;
  }).filter(c=>typeof window.cardMatchesDeckBuilderSearch === 'function'
    ? window.cardMatchesDeckBuilderSearch(c, _cdbSearch)
    : (!_cdbSearch || c.name.toLowerCase().includes(_cdbSearch))));
  if(cards.length===0){
    col.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.2rem;padding:4rem 2rem;width:100%;min-height:360px;text-align:center;"><div style="font-family:\'Cinzel\',serif;font-size:2.2rem;color:rgba(255,246,191,.72);letter-spacing:.12em;line-height:1.2;text-shadow:0 0 30px rgba(232,196,82,.15);">No Owned Cards Match</div><div style="font-size:1.05rem;color:rgba(255,255,255,.38);line-height:1.6;max-width:400px;font-family:\'Cinzel\',serif;letter-spacing:.04em;">Open booster packs to expand your collection and unlock more cards for this filter.</div></div>';
    return;
  }
  if(typeof renderCanvasDeckCollection === 'function') {
    const entries = cards.map(c=>{
      const owned_n = USER_PROFILE.ownedCards[c.id] || 0;
      const inDeck = _cdbCurrentDeckIds.filter(id=>id===c.id).length;
      const avail = owned_n - inDeck;
      return {
        card:c,
        count:inDeck,
        ownedText:`${avail}/${owned_n}`,
        title:`Owned: ${owned_n} • In deck: ${inDeck} • Right-click to add`,
        ariaLabel:c.name
      };
    });
    if(renderCanvasDeckCollection(col, entries, {
      align:'left',
      virtualize:true,
      lowScroll:true,
      maxDpr:1,
      hoverRedraw:false,
      onClick:(card)=>openCardDetail(card),
      onContextMenu:(card)=>cdbAdd(card.id)
    })) return;
  }
  cards.forEach(c=>{
    const owned_n = USER_PROFILE.ownedCards[c.id] || 0;
    const inDeck = _cdbCurrentDeckIds.filter(id=>id===c.id).length;
    const avail = owned_n - inDeck;
    const el = document.createElement('div');
    el.className='mc db-mc'+(inDeck>0?' in-deck':'')+(c.rarity==='star'?' star-card-db':'')+(c.rarity==='square'?' square-card-db':'');
    el.dataset.cardId = c.id;
    el.innerHTML=renderCardHTML(c, inDeck);
    // Owned count badge
    const ownedBadge = document.createElement('div');
    ownedBadge.className = 'cdb-owned-badge';
    ownedBadge.style.cssText='position:absolute;top:4px;right:4px;z-index:4;font-family:Cinzel,serif;font-size:.65rem;color:#fff;background:rgba(0,0,0,.8);border:1px solid var(--gold);padding:.1rem .3rem;border-radius:2px;';
    ownedBadge.textContent = `${avail}/${owned_n}`;
    el.appendChild(ownedBadge);
    el.onclick = ()=>openCardDetail(c);
    el.oncontextmenu = (e)=>{e.preventDefault();cdbAdd(c.id);};
    el.title = `Owned: ${owned_n} • In deck: ${inDeck} • Right-click to add`;
    col.appendChild(el);
  });
}

function refreshCdbCollectionCounts() {
  const owned = USER_PROFILE.ownedCards || {};
  if(typeof refreshCanvasDeckCollectionCounts === 'function' && refreshCanvasDeckCollectionCounts(document.getElementById('cdb-collection'), function(entry){
    const id = entry.card.id;
    const owned_n = owned[id] || 0;
    const inDeck = _cdbCurrentDeckIds.filter(x=>x===id).length;
    entry.count = inDeck;
    entry.ownedText = `${owned_n - inDeck}/${owned_n}`;
    entry.title = `Owned: ${owned_n} • In deck: ${inDeck} • Right-click to add`;
  })) return;
  document.querySelectorAll('#cdb-collection .db-mc[data-card-id]').forEach(el=>{
    const id = el.dataset.cardId;
    const c = CARDS.find(x=>x.id===id);
    if(!c) return;
    const owned_n = owned[id] || 0;
    const inDeck = _cdbCurrentDeckIds.filter(x=>x===id).length;
    const avail = owned_n - inDeck;
    el.classList.toggle('in-deck', inDeck > 0);
    let limit = el.querySelector('.mc-limit');
    if(inDeck > 0){
      if(!limit){
        limit = document.createElement('div');
        limit.className = 'mc-limit';
        el.appendChild(limit);
      }
      limit.textContent = 'x' + inDeck;
    } else if(limit) {
      limit.remove();
    }
    const badge = el.querySelector('.cdb-owned-badge');
    if(badge) badge.textContent = `${avail}/${owned_n}`;
  });
}

function renderCdbDecklist() {
  const list = document.getElementById('cdb-decklist');
  const cntEl = document.getElementById('cdb-count');
  if(!list) return;
  if(cntEl) cntEl.textContent = _cdbCurrentDeckIds.length;
  const counts = {};
  _cdbCurrentDeckIds.forEach(id=>{counts[id]=(counts[id]||0)+1;});
  const entries = Object.entries(counts);
  if(typeof renderCanvasDeckList === 'function' && window.FATE_USE_CANVAS_CHALLENGER_DECK_LIST === true) {
    list.innerHTML = '';
    const canvasEntries = entries.map(([id,n])=>{
      const c = CARDS.find(x=>x.id===id);
      if(!c) return null;
      return {
        id,
        card:c,
        count:n,
        subtitle:`${c.type}${c.cost>0?` (${c.xCost?'X':c.cost})`:''}`,
        title:'Click to view details'
      };
    }).filter(Boolean);
    if(renderCanvasDeckList(list, canvasEntries, {
      compact:true,
      removeLabel:'Remove',
      onOpen:(card)=>openCardDetail(card),
      onRemove:(id)=>cdbRemove(id)
    })) return;
  }
  const existingRows = Array.from(list.children);
  const existingById = new Map();
  existingRows.forEach(row=>{
    const rowId = row._deckCardId || row.dataset?.deckCardId || '';
    if(rowId) existingById.set(rowId, row);
    else row.remove();
  });
  const newIds = new Set(entries.map(e=>e[0]));
  for(const [id, row] of existingById){
    if(!newIds.has(id)) row.remove();
  }
  entries.forEach(([id,n])=>{
    const c = CARDS.find(x=>x.id===id);
    if(!c) return;
    const existing = existingById.get(id);
    if(existing){
      const badge = existing.querySelector('.db-row-qty') || existing.querySelector('.rm')?.previousElementSibling;
      if(badge && badge.textContent !== 'x'+n) badge.textContent = 'x'+n;
      if(!list.contains(existing)) list.appendChild(existing);
      return;
    }
    const row = document.createElement('div');
    row.className='cdb-deck-entry';
    row._deckCardId = id;
    row.dataset.deckCardId = id;
    row.innerHTML=`
      <div class="cdb-deck-thumb">
        ${c.img?`<img src="${c.img}" alt="${escapeHtml(c.name)}" decoding="async" loading="eager" onerror="this.style.display='none'">`:''}
      </div>
      <div class="cdb-deck-meta">
        <div class="cdb-deck-name">${escapeHtml(c.name)}</div>
        <div class="cdb-deck-sub">${escapeHtml(c.type)}${c.cost>0?` (${c.xCost?'X':c.cost})`:''}</div>
      </div>
      <span class="db-row-actions">
        <span class="db-row-qty">x${n}</span>
        <span class="rm" onclick="event.stopPropagation();cdbRemove('${id}')" title="Remove">Remove</span>
      </span>`;
    row.onclick = ()=>openCardDetail(c);
    list.appendChild(row);
  });
}

function setCdbFilter(f) {
  _cdbFilter = f;
  document.querySelectorAll('.ch-filter-bar .db-filter').forEach(btn=>{
    btn.classList.toggle('active', btn.getAttribute('onclick')===`setCdbFilter('${f}')`);
  });
  renderCdbCollection();
}

function cdbNewDeck() {
  _cdbCurrentDeckId = null;
  _cdbCurrentDeckIds = [];
  _cdbCurrentName = 'New Deck';
  _cdbCurrentDesc = '';
  _cdbCurrentTheme = 'Hybrid';
  _cdbFilter = 'all';
  renderChDeckBuilderTab(document.getElementById('ch-content'));
}

function buildChallengerImportDeck(ids) {
  const rawIds = Array.isArray(ids) ? ids : [];
  const owned = USER_PROFILE.ownedCards || {};
  const deck = [];
  let missingOwned = 0;
  let skipped = 0;
  let starUsed = false;
  rawIds.forEach(id=>{
    if(deck.length >= 40) { skipped++; return; }
    const c = CARDS.find(card=>card.id===id);
    if(!c || (typeof isRetiredChallengerCard === 'function' && isRetiredChallengerCard(c))) { skipped++; return; }
    const ownedCount = Number(owned[id] || 0) || 0;
    const inDeck = deck.filter(x=>x===id).length;
    if(inDeck >= ownedCount) { missingOwned++; return; }
    const limit = c.rarity === 'star' ? 1 : 3;
    if(inDeck >= limit) { skipped++; return; }
    if(c.rarity === 'star' && starUsed) { skipped++; return; }
    deck.push(id);
    if(c.rarity === 'star') starUsed = true;
  });
  return {ids:deck, missingOwned, skipped, requested:rawIds.length};
}

function importIdsToChallengerDeckBuilder(ids, meta = {}) {
  const result = buildChallengerImportDeck(ids);
  const importName = (meta.name || 'Shared Deck') + ' (imported)';
  const complete = result.ids.length === Math.min(40, result.requested) && result.missingOwned === 0 && result.skipped === 0 && result.ids.length === 40;

  if(complete) {
    if(!USER_PROFILE.challengerPresets) USER_PROFILE.challengerPresets = {};
    const alreadyImportedKey = Object.keys(USER_PROFILE.challengerPresets).find(pid=>{
      const p = USER_PROFILE.challengerPresets[pid] || {};
      return p._importedFromPublicId === meta.publicId ||
        (p.name === importName && JSON.stringify(p.ids || []) === JSON.stringify(result.ids));
    });
    if(alreadyImportedKey) {
      toast('Already imported this deck to Challenger');
      return Object.assign({saved:false, alreadyImported:true}, result);
    }
    const pid = createChallengerDeckId('ch_public');
    USER_PROFILE.challengerPresets[pid] = {
      name: importName,
      description: meta.description || '',
      theme: 'Imported',
      ids: result.ids.slice(),
      faceCardId: meta.faceCardId || '',
      displayCardIds: Array.isArray(meta.displayCardIds) ? meta.displayCardIds.slice(0, 7) : [],
      _importedFromPublicId: meta.publicId || ''
    };
    saveProfile();
    if(typeof playSfx === 'function') playSfx('deckComplete');
    toast('Deck imported to My Challenger Decks');
    return Object.assign({saved:true, presetId:pid}, result);
  }

  _cdbCurrentDeckId = null;
  _cdbCurrentDeckIds = result.ids.slice(0, 40);
  _cdbCurrentName = importName;
  _cdbCurrentDesc = meta.description || '';
  _cdbCurrentTheme = normalizeDeckTheme(meta.theme || 'Hybrid');
  _cdbFilter = 'all';
  _cdbSearch = '';
  if(typeof closeModal === 'function') closeModal();
  CURRENT_MODE = 'challenger';
  if(typeof seedBuiltInPresets === 'function') seedBuiltInPresets();
  if(typeof syncStarterPresetMetadata === 'function') syncStarterPresetMetadata();
  if(typeof showScreen === 'function') showScreen('s-challenger');
  switchChTab('deckbuilder', {force:true});
  const missing = result.missingOwned + result.skipped;
  if(missing > 0) toast(`Missing ${missing} card${missing===1?'':'s'}; imported ${result.ids.length} cards to the Challenger builder.`);
  else toast(`Imported ${result.ids.length} cards to the Challenger builder.`);
  return Object.assign({saved:false}, result);
}
window.importIdsToChallengerDeckBuilder = importIdsToChallengerDeckBuilder;

function cdbEditDeck(pid) {
  const presets = USER_PROFILE.challengerPresets || {};
  const p = presets[pid];
  if(!p) return;
  if(typeof playSfx==='function') playSfx('deckComplete');
  _cdbCurrentDeckId = pid;
  _cdbCurrentDeckIds = [...p.ids];
  _cdbCurrentName = p.name;
  _cdbCurrentDesc = p.description || '';
  _cdbCurrentTheme = normalizeDeckTheme(p.theme || 'Hybrid');
  renderChDeckBuilderTab(document.getElementById('ch-content'));
}

function cdbAdd(id) {
  if(_cdbCurrentDeckIds.length >= 40){toast('Deck is full (40 cards)');return;}
  const c = CARDS.find(x=>x.id===id);
  if(!c) return;
  const owned_n = USER_PROFILE.ownedCards[id] || 0;
  const inDeck = _cdbCurrentDeckIds.filter(x=>x===id).length;
  if(inDeck >= owned_n){toast(`You don't own any more copies of ${c.name}`);return;}
  // Rarity copy limits match the main deck builder: Star cards are singleton, every other rarity can use up to 3 owned copies.
  const lim = c.rarity==='star' ? 1 : 3;
  if(inDeck >= lim){toast(`Max ${lim} copies of this card allowed`);return;}
  // Star rarity: only 1 star card total in deck
  if(c.rarity==='star'){
    const totalStars = _cdbCurrentDeckIds.filter(did=>{ const cd=CARDS.find(x=>x.id===did); return cd&&cd.rarity==='star'; }).length;
    if(totalStars>=1){toast('Only 1 Star card allowed per deck');return;}
  }
  const wasComplete = _cdbCurrentDeckIds.length === 39;
  _cdbCurrentDeckIds.push(id);
  if(typeof playSfx==='function') playSfx('deckAdd');
  refreshCdbCollectionCounts();
  renderCdbDecklist();
  if(wasComplete && _cdbCurrentDeckIds.length === 40 && typeof playSfx==='function') playSfx('deckComplete');
}

function cdbRemove(id) {
  const idx = _cdbCurrentDeckIds.lastIndexOf(id);
  if(idx>-1) _cdbCurrentDeckIds.splice(idx,1);
  if(typeof playSfx==='function') playSfx('deckRemove');
  refreshCdbCollectionCounts();
  renderCdbDecklist();
}

function cdbClear() {
  if(_cdbCurrentDeckIds.length===0) return;
  _cdbCurrentDeckIds = [];
  _cdbCurrentDeckId = null;
  _cdbCurrentName = 'Unsaved Deck';
  _cdbCurrentDesc = '';
  _cdbCurrentTheme = 'Hybrid';
  renderCdbCollection();
  renderCdbDecklist();
  renderChDeckBuilderTab(document.getElementById('ch-content'));
}

function cdbSaveDeck() {
  if(_cdbCurrentDeckIds.length !== 40){toast(`Deck must be exactly 40 cards (currently ${_cdbCurrentDeckIds.length})`);return;}
  openCdbSaveAsNewDialog();
}

function openCdbSaveAsNewDialog() {
  const deckCards = [...new Set(_cdbCurrentDeckIds)].map(id=>CARDS.find(c=>c.id===id)).filter(Boolean);
  if(!deckCards.length){ toast('Add cards before saving'); return; }
  const defaultFace = deckCards.filter(c=>c.type!=='Supporter').sort((a,b)=>(b.fate||0)-(a.fate||0))[0] || deckCards[0];
  let currentFace = defaultFace?.id || deckCards[0]?.id;
  let currentDisplay = deckCards.filter(c=>c.img).slice(0,7).map(c=>c.id);
  const defaultName = (_cdbCurrentName && !/^new deck$/i.test(_cdbCurrentName) && !/^unsaved deck$/i.test(_cdbCurrentName))
    ? `${_cdbCurrentName} Copy`
    : `Challenger Deck ${Object.keys(USER_PROFILE.challengerPresets || {}).length + 1}`;

  showModal('Save Challenger Deck', '', []);
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox) modalBox.classList.add('cdb-save-modal');
  const body = document.createElement('div');
  body.className = 'cdb-save-shell';
  body.innerHTML = `
    <div class="cdb-save-top">
      <div class="cdb-save-preview">
        <div class="cdb-save-face" id="cdb-save-face"></div>
      </div>
      <div class="cdb-save-form">
        <label>Deck Name<input id="cdb-save-name" maxlength="36" value="${escapeHtml(defaultName)}"></label>
        <label>Description<textarea id="cdb-save-desc" maxlength="120">${escapeHtml(_cdbCurrentDesc || '')}</textarea></label>
        ${renderDeckThemeSelector(_cdbCurrentTheme || 'Hybrid', 'cdb-save-theme')}
      </div>
    </div>
    <div class="cdb-save-section">
      <div class="cdb-save-section-title">Card Art</div>
      <div class="face-picker-grid cdb-save-picker" id="cdb-save-face-picker"></div>
    </div>
    <div class="cdb-save-section">
      <div class="cdb-save-section-title">Display Cards <span id="cdb-save-display-count">${currentDisplay.length}/7</span></div>
      <div class="face-picker-grid cdb-save-picker" id="cdb-save-display-picker"></div>
    </div>`;
  const modalBody = document.getElementById('modal-body');
  modalBody.innerHTML = '';
  modalBody.appendChild(body);

  const renderPreview = () => {
    const faceCard = deckCards.find(c=>c.id===currentFace) || deckCards[0];
    const faceEl = body.querySelector('#cdb-save-face');
    if(faceEl) {
      if(faceCard?.img && typeof window.renderCanvasImage === 'function') {
        faceEl.innerHTML = '<canvas class="cdb-save-face-canvas" aria-hidden="true"></canvas><span>'+escapeHtml(faceCard.name)+'</span>';
        window.renderCanvasImage(faceEl.querySelector('canvas'), faceCard.img, {mode:'contain', parent:faceEl, background:'#080910'});
      } else {
        faceEl.innerHTML = faceCard?.img ? `<img src="${faceCard.img}" alt="${escapeHtml(faceCard.name)}"><span>${escapeHtml(faceCard.name)}</span>` : '';
      }
    }
    const count = body.querySelector('#cdb-save-display-count');
    if(count) count.textContent = `${currentDisplay.length}/7`;
  };
  const renderPickers = () => {
    const faceGrid = body.querySelector('#cdb-save-face-picker');
    const displayGrid = body.querySelector('#cdb-save-display-picker');
    faceGrid.classList.remove('canvas-card-grid-mode');
    displayGrid.classList.remove('canvas-card-grid-mode');
    faceGrid.innerHTML = '';
    displayGrid.innerHTML = '';
    const refreshPickerSelections = () => {
      faceGrid.querySelectorAll('.face-picker-card').forEach(el=>{
        const isFace = el.dataset.cardId === currentFace;
        el.classList.toggle('face-sel', isFace);
        el.querySelector('.fp-badge')?.remove();
        if(isFace) {
          const badge = document.createElement('div');
          badge.className = 'fp-badge';
          badge.textContent = 'FACE';
          el.appendChild(badge);
        }
      });
      displayGrid.querySelectorAll('.face-picker-card').forEach(el=>{
        const idx = currentDisplay.indexOf(el.dataset.cardId);
        const selected = idx >= 0;
        el.classList.toggle('display-sel', selected);
        el.querySelector('.fp-badge')?.remove();
        if(selected) {
          const badge = document.createElement('div');
          badge.className = 'fp-badge';
          badge.textContent = '#'+(idx+1);
          el.appendChild(badge);
        }
      });
    };
    deckCards.forEach(c=>{
      const faceEl = document.createElement('div');
      faceEl.className = 'face-picker-card'+(c.id===currentFace?' face-sel':'');
      faceEl.dataset.cardId = c.id;
      faceEl.innerHTML = `${c.img?`<img src="${c.img}" alt="${escapeHtml(c.name)}" decoding="async" loading="lazy">`:''}${c.id===currentFace?'<div class="fp-badge">FACE</div>':''}`;
      faceEl.title = c.name;
      faceEl.onclick = ()=>{ currentFace = c.id; refreshPickerSelections(); renderPreview(); };
      faceGrid.appendChild(faceEl);

      const displayEl = document.createElement('div');
      const selected = currentDisplay.includes(c.id);
      displayEl.className = 'face-picker-card'+(selected?' display-sel':'');
      displayEl.dataset.cardId = c.id;
      displayEl.innerHTML = `${c.img?`<img src="${c.img}" alt="${escapeHtml(c.name)}" decoding="async" loading="lazy">`:''}${selected?`<div class="fp-badge">#${currentDisplay.indexOf(c.id)+1}</div>`:''}`;
      displayEl.title = c.name;
      displayEl.onclick = ()=>{
        const idx = currentDisplay.indexOf(c.id);
        if(idx >= 0) currentDisplay.splice(idx, 1);
        else {
          if(currentDisplay.length >= 7){ toast('Max 7 display cards'); return; }
          currentDisplay.push(c.id);
        }
        refreshPickerSelections();
        renderPreview();
      };
      displayGrid.appendChild(displayEl);
    });
    renderPreview();
  };
  renderPickers();

  const acts = document.getElementById('modal-acts');
  acts.innerHTML = '';
  const cancel = document.createElement('button');
  cancel.className = 'btn sm';
  cancel.textContent = 'Cancel';
  cancel.onclick = closeModal;
  const save = document.createElement('button');
  save.className = 'btn sm pri';
  save.textContent = 'Save Deck';
  save.onclick = () => {
    const name = (body.querySelector('#cdb-save-name')?.value || '').trim();
    const desc = (body.querySelector('#cdb-save-desc')?.value || '').trim();
    const theme = normalizeDeckTheme(body.querySelector('#cdb-save-theme')?.value || _cdbCurrentTheme || 'Hybrid');
    if(!name){ toast('Please enter a deck name'); return; }
    if(!USER_PROFILE.challengerPresets) USER_PROFILE.challengerPresets = {};
    const pid = createChallengerDeckId();
    USER_PROFILE.challengerPresets[pid] = {
      name,
      description: desc || 'Custom challenger deck',
      theme,
      ids: [..._cdbCurrentDeckIds],
      faceCardId: currentFace,
      displayCardIds: currentDisplay.slice(0,7)
    };
    _cdbCurrentDeckId = pid;
    _cdbCurrentName = name;
    _cdbCurrentDesc = desc;
    _cdbCurrentTheme = theme;
    saveProfile();
    if(typeof updateDailyChallengeProgress === 'function') updateDailyChallengeProgress('decksSaved', 1, 'add');
    if(typeof playSfx==='function') playSfx('starPlace');
    closeModal();
    toast(`Deck "${name}" saved`);
    renderChDeckBuilderTab(document.getElementById('ch-content'));
  };
  acts.appendChild(cancel);
  acts.appendChild(save);
}

function cdbOverwriteDeck() {
  const existing = USER_PROFILE.challengerPresets?.[_cdbCurrentDeckId] || {};
  const name = (_cdbCurrentName || existing.name || '').trim();
  const desc = (_cdbCurrentDesc || existing.description || '').trim();
  if(isChallengerStarterPreset(existing, _cdbCurrentDeckId)){
    showChallengerStarterDeckWarning(existing.name || name || 'Starter deck');
    return;
  }
  const theme = normalizeDeckTheme(_cdbCurrentTheme || existing.theme || 'Hybrid');
  if(!name){toast('Please enter a deck name');return;}
  if(_cdbCurrentDeckIds.length !== 40){toast(`Deck must be exactly 40 cards (currently ${_cdbCurrentDeckIds.length})`);return;}
  if(!_cdbCurrentDeckId){toast('No current deck to overwrite');return;}
  if(!USER_PROFILE.challengerPresets) USER_PROFILE.challengerPresets = {};
  const deckCards = [...new Set(_cdbCurrentDeckIds)].map(id=>CARDS.find(c=>c.id===id)).filter(Boolean);
  const face = (existing.faceCardId && deckCards.find(c=>c.id===existing.faceCardId))
    || deckCards.filter(c=>c.type!=='Supporter').sort((a,b)=>(b.fate||0)-(a.fate||0))[0] || deckCards[0];
  const display = (existing.displayCardIds && existing.displayCardIds.length
    ? existing.displayCardIds.map(id=>deckCards.find(c=>c.id===id)).filter(Boolean)
    : deckCards.filter(c=>c.img).slice(0,7)).slice(0,7);
  USER_PROFILE.challengerPresets[_cdbCurrentDeckId] = {
    name, description: desc || 'Custom challenger deck', theme,
      ids: [..._cdbCurrentDeckIds], faceCardId: face?.id, displayCardIds: display.map(c=>c.id)
  };
  _cdbCurrentName = name; _cdbCurrentDesc = desc; _cdbCurrentTheme = theme;
  saveProfile();
  if(typeof updateDailyChallengeProgress === 'function') updateDailyChallengeProgress('decksSaved', 1, 'add');
  if(typeof playSfx==='function') playSfx('deckComplete');
  if(typeof showDeckOverwriteBanner === 'function') showDeckOverwriteBanner(name, 'Challenger deck overwritten');
  toast(`Deck "${name}" overwritten`);
  renderChDeckBuilderTab(document.getElementById('ch-content'));
}
window.cdbOverwriteDeck = cdbOverwriteDeck;

function cdbDeleteDeck() {
  if(!_cdbCurrentDeckId) return;
  const presets = USER_PROFILE.challengerPresets || {};
  const p = presets[_cdbCurrentDeckId];
  if(!p) return;
  showModal('Delete Deck?',
    `Delete "${escapeHtml(p.name)}"? This cannot be undone.`,
    [{label:'Cancel',action:closeModal},
     {label:'Delete',danger:true,action:()=>{
       delete presets[_cdbCurrentDeckId];
       saveProfile();
       closeModal();
       toast('Deck deleted');
       cdbNewDeck();
     }}]);
}

function syncAIOpponentLeaderboardEntries() {
  LEADERBOARD = LEADERBOARD.filter(entry=>!entry.isAI && !entry.isSimPlayer && !String(entry.username||'').startsWith('AI Bot -'));
  const history = getMatchHistory();
  const aiList = typeof getRandomMatchAIOpponents === 'function' ? getRandomMatchAIOpponents() : AI_OPPONENTS;
  aiList.forEach(ai=>{
    const rawWins = Math.max(0, Number(ai.challengerWins ?? ai.wins ?? 0) || 0);
    const rawLosses = Math.max(0, Number(ai.challengerLosses ?? ai.losses ?? 0) || 0);
    const seededRecord = isStaleSeededLeaderboardEntry(Object.assign({}, ai, {isAI:true}));
    let aiWins = seededRecord ? 0 : rawWins;
    let aiLosses = seededRecord ? 0 : rawLosses;
    history.forEach(m => {
      if(m && m.simulated) return;
      if(m.p1 === ai.name){ if(m.winner === ai.name) aiWins++; else aiLosses++; }
      if(m.p2 === ai.name){ if(m.winner === ai.name) aiWins++; else aiLosses++; }
    });
    LEADERBOARD.push({
      username: ai.name,
      aiId: ai.aiId || ai.id || '',
      elo: ai.elo,
      wins: aiWins,
      losses: aiLosses,
      profileImg: (typeof getAIProfileImg === 'function' ? getAIProfileImg(ai, 'circle') : (ai.img || ai.profileImg || 'blank.png')),
      isAI: true,
      isMonthly: !!ai.isMonthly,
      monthKey: ai.monthKey || (ai.isMonthly && typeof getMonthKey === 'function' ? getMonthKey() : ''),
      trueElo: ai.trueElo || ai.elo,
      seededWinRate: ai.seededWinRate,
      seededMatches: ai.seededMatches || 0,
      generationVersion: ai.generationVersion || 0,
      recordSchemaVersion: ai.recordSchemaVersion || 5,
    });
  });
  saveLeaderboard();
}

let _leaderboardPage = 0;
function isStaleSeededLeaderboardEntry(entry){
  if(!entry || !(entry.isAI || entry.aiId || /^monthly_|^preset_/i.test(String(entry.uid || entry.username || entry.name || '')))) return false;
  if(entry.source === 'fly-authority') return false;
  const hasSeedMeta = !!(entry.isMonthly || Number(entry.seededWinRate || 0) || Number(entry.seededMatches || 0) || Number(entry.generationVersion || 0) || Number(entry.recordSchemaVersion || 0));
  if(!hasSeedMeta) return false;
  const wins = entry && entry.challengerWins !== undefined ? Math.max(0, Number(entry.challengerWins || 0) || 0) : Math.max(0, Number(entry?.wins || 0) || 0);
  const losses = entry && entry.challengerLosses !== undefined ? Math.max(0, Number(entry.challengerLosses || 0) || 0) : Math.max(0, Number(entry?.losses || 0) || 0);
  const total = wins + losses;
  return Number(entry.recordSchemaVersion || 0) < 5 && !losses && total > 0 && total <= Math.max(6, Number(entry.seededMatches || 0) || 0);
}
function getLeaderboardRecordWins(entry){
  if(isStaleSeededLeaderboardEntry(entry)) return 0;
  if(entry && entry.challengerWins !== undefined) return Math.max(0, Number(entry.challengerWins || 0) || 0);
  return Math.max(0, Number(entry?.wins || 0) || 0);
}
function getLeaderboardRecordLosses(entry){
  if(isStaleSeededLeaderboardEntry(entry)) return 0;
  if(entry && entry.challengerLosses !== undefined) return Math.max(0, Number(entry.challengerLosses || 0) || 0);
  return Math.max(0, Number(entry?.losses || 0) || 0);
}
function getProfileCropStyleForEntry(entry, fallback='center 22%'){
  if(entry && entry.username === USER_PROFILE?.username && typeof getProfileCropStyle === 'function') return getProfileCropStyle();
  const profile = Object.assign({}, entry || {}, {profileImg:entry?.profileImg || entry?.photoURL || entry?.img || null});
  if(window.FateOnline?.profilePhotoCropStyle) return window.FateOnline.profilePhotoCropStyle(profile, fallback);
  return `width:100%;height:100%;object-fit:cover;object-position:${fallback};`;
}
function getMergedChallengerLeaderboardEntries() {
  updateLeaderboardEntry();
  syncAIOpponentLeaderboardEntries();
  const merged = new Map();
  const currentUid = window.FATE_ONLINE?.user?.uid || '';
  const currentBaseCode = window.FATE_ONLINE?.baseCode || window.FATE_ONLINE?.profile?.baseCode || '';
  const currentNames = new Set([
    USER_PROFILE?.username,
    window.FATE_ONLINE?.profile?.chosenUsername,
    window.FATE_ONLINE?.profile?.displayName,
    window.FATE_ONLINE?.profile?.username
  ].filter(Boolean).map(v=>String(v).trim().toLowerCase()));
  const currentAICycleKey = typeof getMonthKey === 'function' ? getMonthKey() : '';
  const isRetiredMonthlyEntry = entry => !!(entry && entry.isMonthly && currentAICycleKey && entry.monthKey !== currentAICycleKey);
  const entryIsAI = entry => !!(entry && (entry.isAI || entry.aiId || /^monthly_|^preset_/i.test(String(entry.uid || ''))));
  const aiMergeKey = entry => {
    const rawName = entry?.username || entry?.name || '';
    if(rawName) return 'ai:name:' + String(rawName).trim().toLowerCase();
    const rawId = entry?.aiId || entry?.uid || '';
    return 'ai:id:' + String(rawId || '').trim().toLowerCase();
  };
  const onlineSource = (window.FateOnline && typeof window.FateOnline.getOnlineLeaderboard === 'function')
    ? window.FateOnline.getOnlineLeaderboard()
    : (window.FATE_ONLINE_LEADERBOARD || {});
  const sharedAIEntries = Array.isArray(window.FATE_SHARED_AI_ROSTER) ? window.FATE_SHARED_AI_ROSTER : [];
  const onlineEntries = sharedAIEntries.concat(Object.values(onlineSource || {}));
  const hasAuthoritativeAI = onlineEntries.some(entry=>entryIsAI(entry) && !isRetiredMonthlyEntry(entry));
  LEADERBOARD.forEach(entry=>{
    if(isRetiredMonthlyEntry(entry)) return;
    if(hasAuthoritativeAI && entryIsAI(entry)) return;
    const rawName = entry.username || entry.name || '';
    const isCurrentUserEntry = !!currentUid && (
      entry.uid === currentUid ||
      (currentBaseCode && entry.baseCode === currentBaseCode) ||
      currentNames.has(String(rawName).trim().toLowerCase())
    );
    const key = entryIsAI(entry) ? aiMergeKey(entry) : (isCurrentUserEntry ? currentUid : (entry.uid || rawName || Math.random().toString(36)));
    const prev = merged.get(key) || {};
    merged.set(key, {...prev, ...entry, uid:isCurrentUserEntry ? currentUid : (entry.uid || prev.uid), username:rawName || prev.username || 'Player'});
  });
  onlineEntries.forEach(entry=>{
    if(isRetiredMonthlyEntry(entry)) return;
    const key = entryIsAI(entry) ? aiMergeKey(entry) : (entry.uid || entry.username || entry.name);
    if(!key) return;
    const local = merged.get(key) || {};
    const onlineWins = getLeaderboardRecordWins(entry);
    const onlineLosses = getLeaderboardRecordLosses(entry);
    const localWins = getLeaderboardRecordWins(local);
    const localLosses = getLeaderboardRecordLosses(local);
    const wins = entryIsAI(entry) ? onlineWins : Math.max(onlineWins, localWins);
    const losses = entryIsAI(entry) ? onlineLosses : Math.max(onlineLosses, localLosses);
    merged.set(key, {
      ...local,
      uid:entry.uid || local.uid || key,
      username:entry.name || entry.username || local.username || 'Player',
      aiId:entry.aiId || local.aiId || '',
      elo:Number(entry.elo ?? local.elo ?? 600),
      wins,
      losses,
      challengerWins:wins,
      challengerLosses:losses,
      matchesPlayed:Math.max(Number(entry.matchesPlayed || local.matchesPlayed || 0) || 0, wins + losses),
      profileImg:entry.photoURL || entry.profileImg || local.profileImg || 'blank.png',
      baseCode:entry.baseCode || local.baseCode || '',
      isAI:!!(entryIsAI(entry) || entryIsAI(local)),
      isMonthly:!!(entry.isMonthly || local.isMonthly),
      monthKey:entry.monthKey || local.monthKey || '',
      isOnline:true
    });
  });
  return [...merged.values()].filter((entry, index, all)=>{
    if(!currentUid) return true;
    const rawName = String(entry.username || entry.name || '').trim().toLowerCase();
    const isCurrent = entry.uid === currentUid || (currentBaseCode && entry.baseCode === currentBaseCode) || currentNames.has(rawName);
    if(!isCurrent) return true;
    return all.findIndex(other=>{
      const otherName = String(other.username || other.name || '').trim().toLowerCase();
      return other.uid === currentUid || (currentBaseCode && other.baseCode === currentBaseCode) || currentNames.has(otherName);
    }) === index;
  });
}
showLeaderboard = async function(page=0, opts={}) {
  const modalAlreadyOpen = !!document.getElementById('modal')?.classList.contains('on');
  if(!(opts && opts.skipFresh) && !modalAlreadyOpen && typeof window.FateOnlineReady === 'function') {
    try { await window.FateOnlineReady(); } catch(e) {}
  }
  if(!(opts && opts.skipFresh) && !modalAlreadyOpen && window.FateOnline && typeof window.FateOnline.syncSharedAIRoster === 'function') {
    try { await window.FateOnline.syncSharedAIRoster(); } catch(e) {}
  }
  if(!(opts && opts.skipFresh) && !modalAlreadyOpen && window.FateOnline && typeof window.FateOnline.refreshFlyLeaderboard === 'function') {
    try { await window.FateOnline.refreshFlyLeaderboard({force:true}); } catch(e) {}
  }
  if(typeof resetModalChrome === 'function') resetModalChrome();
  const sorted = getMergedChallengerLeaderboardEntries().sort((a,b)=>b.elo-a.elo);
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  _leaderboardPage = Math.max(0, Math.min(page, totalPages-1));
  const start = _leaderboardPage * pageSize;
  const pageEntries = sorted.slice(start, start + pageSize);
  const getFrameColor = entry=>{
    const rankName = getRank(entry.elo).name;
    return ({
      'High Marshall':'#9b59b6',
      'Commander-General':'#e74c3c',
      'Sergeant of the Guard':'#2ec4a6',
      'Lieutenant at Arms':'#4a8ad4',
      'Captain-Officer':'#c0c0c0',
      'Footman':'#b98954'
    })[rankName] || getRank(entry.elo).color;
  };
  const body = document.createElement('div');
  if(sorted.length===0){
    body.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--dim);font-style:italic;">Leaderboard is empty.</div>`;
  } else {
    let html = `<div style="display:flex;gap:.4rem;margin-bottom:.8rem;flex-wrap:wrap;">
      <button class="btn sm pri" onclick="showLeaderboard()">Rankings</button>
      <button class="btn sm" onclick="showMatchHistory()">Recent Matches</button>
      <button class="btn sm" onclick="showDivisionPage()">Divisions</button>
    </div>`;
    html += `<div style="display:flex;align-items:center;justify-content:space-between;gap:.8rem;margin-bottom:.8rem;">
      <button class="btn sm" ${_leaderboardPage<=0?'disabled':''} onclick="showLeaderboard(${_leaderboardPage-1})">Prev</button>
      <div style="text-align:center;color:var(--dim);font-size:.82rem;font-style:italic;">Page ${_leaderboardPage+1} / ${totalPages}</div>
      <button class="btn sm" ${_leaderboardPage>=totalPages-1?'disabled':''} onclick="showLeaderboard(${_leaderboardPage+1})">Next</button>
    </div>`;
    html += '<div class="lb-list" style="padding-right:0;max-height:none;overflow:visible;">';
    for(let i = 0; i < pageSize; i++){
      const entry = pageEntries[i];
      const overallIndex = start + i;
      if(!entry){
        html += `<div class="lb-row lb-row-empty" style="display:flex;align-items:center;gap:1rem;padding:1rem 1.1rem;border:1px solid var(--border);border-radius:10px;margin-bottom:0;background:rgba(0,0,0,.22);">
          <div style="width:52px;text-align:center;font-weight:700;flex-shrink:0;font-size:1.15rem;">#${overallIndex+1}</div>
          <div style="width:78px;height:78px;border-radius:10px;overflow:hidden;background:#0a0a0f;flex-shrink:0;display:flex;align-items:center;justify-content:center;border:1px solid rgba(218,185,82,.26);">
            <img src="blank.png" style="width:100%;height:100%;object-fit:cover;object-position:center center;opacity:.42;" onerror="this.style.display='none'">
          </div>
          <div style="flex:1;min-width:0;"></div>
          <div style="width:74px;flex-shrink:0;"></div>
        </div>`;
        continue;
      }
      const isMe = entry.username===USER_PROFILE.username;
      const rankSym = overallIndex===0?'🥇':overallIndex===1?'🥈':overallIndex===2?'🥉':`#${overallIndex+1}`;
      const imgSrc = resolveProfileImgSrc(entry.profileImg || entry.photoURL, 'square') || (typeof getDefaultProfileImgSrc === 'function' ? getDefaultProfileImgSrc() : 'blank.png');
      const imgCrop = getProfileCropStyleForEntry(entry, 'center center');
      const frameColor = getFrameColor(entry);
      html += `<div class="lb-row" style="display:flex;align-items:center;gap:1rem;padding:1rem 1.1rem;border:1px solid var(--border);border-radius:10px;margin-bottom:0;background:${isMe?'rgba(201,168,76,.08)':'rgba(0,0,0,.35)'};">
        <div style="width:52px;text-align:center;font-weight:700;flex-shrink:0;font-size:1.15rem;">${rankSym}</div>
        <div style="width:78px;height:78px;border-radius:10px;overflow:hidden;background:#0a0a0f;flex-shrink:0;display:flex;align-items:center;justify-content:center;${typeof getRankFrameStyle === 'function' ? getRankFrameStyle(entry.elo,'icon') : `border:2px solid ${frameColor};box-shadow:0 0 18px ${frameColor}33;`}">
          ${imgSrc?`<img src="${imgSrc}" decoding="async" loading="eager" fetchpriority="high" style="${imgCrop}">`:'<span style="font-size:1.8rem;color:var(--dim);">P</span>'}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-family:'Cinzel',serif;font-size:1rem;color:${isMe?'var(--gold)':'var(--text)'};font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(entry.username)}${isMe?' <span style="color:var(--gold);font-size:.72rem;">(YOU)</span>':''}</div>
          <div style="margin-top:.35rem;">${renderRankBadge(entry.elo,'md')}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;font-family:'Cinzel',serif;">
          <div style="font-size:.86rem;color:var(--dim);margin-bottom:.2rem;">${getLeaderboardRecordWins(entry)}W / ${getLeaderboardRecordLosses(entry)}L</div>
          <div style="font-size:1.15rem;color:${getRank(entry.elo).color};font-weight:700;">${entry.elo}</div>
        </div>
      </div>`;
    }
    html += '</div>';
    body.innerHTML = html;
  }
  document.getElementById('modal-body').innerHTML='';
  document.getElementById('modal-body').appendChild(body);
  document.getElementById('modal-title').textContent = 'Global Leaderboard';
  document.getElementById('modal-acts').innerHTML='';
  const close=document.createElement('button');
  close.className='btn sm';
  close.textContent='Close';
  close.onclick=closeModal;
  document.getElementById('modal-acts').appendChild(close);
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox) modalBox.classList.add('leaderboard-modal');
  document.getElementById('modal').classList.add('on');
};


// ─── MATCHMAKING WAITING SCREEN ───
let _matchmakingTimer = null;
let _matchmakingBgTimer = null;
let _matchmakingBgIdx = 1;
let _matchmakingMatchTimeout = null;
let _matchmakingAutoStartTimeout = null;

function clearMatchmakingTimers() {
  if(_matchmakingTimer){ clearInterval(_matchmakingTimer); _matchmakingTimer = null; }
  if(_matchmakingBgTimer){ clearInterval(_matchmakingBgTimer); _matchmakingBgTimer = null; }
  if(_matchmakingMatchTimeout){ clearTimeout(_matchmakingMatchTimeout); _matchmakingMatchTimeout = null; }
  if(_matchmakingAutoStartTimeout){ clearTimeout(_matchmakingAutoStartTimeout); _matchmakingAutoStartTimeout = null; }
}

function chStartMatchmaking() {
  CURRENT_MODE = 'challenger';
  const presets = USER_PROFILE.challengerPresets || {};
  const keys = Object.keys(presets);
  if(keys.length === 0){
    toast('Build a deck first in the Deck Builder tab');
    switchChTab('deckbuilder');
    return;
  }
  // Pick deck first, then queue
  G._pickDeckAfterMatchmaking = true;
  G._aiRewardMultiplier = 1;
  renderChallengerDeckPickModal(0);
}

window.chStartMatchmaking = chStartMatchmaking;

window.chPickDeckAndStartMatchmaking = function(pid){
  const preset = USER_PROFILE.challengerPresets?.[pid];
  if(!preset) return;
  G.p1Deck = [...preset.ids];
  G._aiRewardMultiplier = 1;
  window.FATE_ONLINE_PENDING_ROOM_DECK = {
    selectedDeckKey:pid,
    selectedDeckName:preset.name || 'Challenger Deck',
    deckIds:[...preset.ids]
  };
  closeModal();
  showMatchmakingScreen({onlineQueue:true, queueMode:CURRENT_MODE === 'free' ? 'freeplay' : 'ranked'});
};

function setMatchmakingStatus(text) {
  const el = document.getElementById('mm-status') || document.querySelector('#s-matchmaking .mm-status');
  if(el) el.textContent = text || 'Ranked Matchmaking';
}

function queueFunctionForMode(queueMode) {
  return queueMode === 'freeplay' ? window.fateStartFreePlayRandomQueue : window.fateStartChallengerRandomQueue;
}

async function getOnlineQueueFunction(queueMode, timeoutMs=20000) {
  if(typeof window.FateOnlineReady === 'function') {
    await window.FateOnlineReady().catch(()=>{});
  }
  const started = Date.now();
  while(Date.now() - started < Math.max(1500, Number(timeoutMs) || 20000)) {
    const queueFn = queueFunctionForMode(queueMode);
    if(window.FATE_ONLINE?.user && typeof queueFn === 'function') return queueFn;
    await new Promise(resolve=>setTimeout(resolve, 120));
  }
  throw new Error('Online queue did not become ready');
}

function startHumanMatchmakingQueue(queueMode, queueFn) {
  const deckChoice = window.FATE_ONLINE_PENDING_ROOM_DECK || null;
  return queueFn(deckChoice, {
    onStatus(detail){
      if(detail?.message) setMatchmakingStatus(detail.message);
    }
  }).catch(e=>{
    console.error('Random online queue failed', e);
    setMatchmakingStatus('Queue failed. Try again.');
    if(window.toast) toast('Random queue failed');
  });
}

function showMatchmakingScreen(opts={}) {
  clearMatchmakingTimers();
  showScreen('s-matchmaking');
  const queueMode = opts.queueMode || (CURRENT_MODE === 'free' ? 'freeplay' : 'ranked');
  const wantsOnlineQueue = !!opts.onlineQueue;
  setMatchmakingStatus(queueMode === 'freeplay' ? 'Free Play Human Queue' : 'Random Human Queue');
  _matchmakingBgIdx = 1;
  updateMatchmakingBg();
  _matchmakingBgTimer = setInterval(()=>{
    _matchmakingBgIdx++;
    if(_matchmakingBgIdx > 8) _matchmakingBgIdx = 1;
    updateMatchmakingBg();
  }, 10000);

  let elapsed = 0;
  const timerEl = document.getElementById('mm-timer');
  if(timerEl) timerEl.textContent = '0:00';
  _matchmakingTimer = setInterval(()=>{
    elapsed++;
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    if(timerEl) timerEl.textContent = m + ':' + s.toString().padStart(2,'0');
  }, 1000);

  if(wantsOnlineQueue){
    getOnlineQueueFunction(queueMode).then(queueFn => {
      startHumanMatchmakingQueue(queueMode, queueFn);
    }).catch(e=>{
      console.error('Online queue startup failed', e);
      clearMatchmakingTimers();
      setMatchmakingStatus('Queue failed. Try again.');
      if(window.toast) toast('Random queue failed');
    });
    return;
  }

  clearMatchmakingTimers();
  setMatchmakingStatus('Queue failed. Try again.');
  if(window.toast) toast('Random queue failed');
}


function updateMatchmakingBg() {
  const bgImg = document.querySelector('#s-matchmaking .screen-bg img');
  if(bgImg) {
    bgImg.style.opacity = '0';
    bgImg.style.transition = 'opacity 1s ease';
    setTimeout(()=>{
      bgImg.src = INGAME_BG_PATH(_matchmakingBgIdx);
      bgImg.style.opacity = '.5';
    }, 500);
  }
}

function cancelMatchmaking() {
  clearMatchmakingTimers();
  if(typeof window.fateCancelChallengerRandomQueue === 'function'){
    window.fateCancelChallengerRandomQueue({silent:true}).catch(()=>{});
  }
  if(CURRENT_MODE === 'challenger'){
    showScreen('s-challenger');
    switchChTab('play');
  } else {
    showScreen('s-title');
  }
}
window.cancelMatchmaking = cancelMatchmaking;
window.showMatchmakingScreen = showMatchmakingScreen;
// ═══════════════════════════════════════════════════════════════
//  SOCIAL SYSTEM
//  Friends, chat, online players, parties, emoji, world chat
//  All data stored in localStorage for now; designed for backend sync.
// ═══════════════════════════════════════════════════════════════

// ─── DATA ───
let SOCIAL = {
  friends: [],           // [{username, profileImg, elo, status:'online'|'offline'|'in-game', addedAt}]
  friendRequests: [],    // [{from, profileImg, elo, sentAt}]
  blocked: [],           // [username]
  conversations: {},     // {username: [{from, text, timestamp, emoji}]}
  party: null,           // {id, leader, members:[{username, profileImg, elo, ready}]}
  worldChat: [],         // [{from, text, timestamp, emoji}]
};
// Expose the existing local Social object so the online bridge can reuse the
// base game's world-chat/DM UI without creating new panels.
window.SOCIAL = SOCIAL;

// Simulated online players (will be replaced with real server data)
const SIMULATED_ONLINE_PLAYERS = [];

function loadSocial() {
  try {
    const stored = localStorage.getItem('fate_social');
    if(stored) SOCIAL = {...SOCIAL, ...JSON.parse(stored)};
  } catch(e){}
  if(window.FATE_ONLINE_CHAT_MODE){
    // Online mode keeps world chat in RTDB, not localStorage.
    SOCIAL.worldChat = [];
  }
  window.SOCIAL = SOCIAL;
  // Seed simulated online players if empty
  if(SIMULATED_ONLINE_PLAYERS.length === 0) seedOnlinePlayers();
}

function saveSocial() {
  try {
    const toSave = window.FATE_ONLINE_CHAT_MODE ? {...SOCIAL, worldChat: []} : SOCIAL;
    localStorage.setItem('fate_social', JSON.stringify(toSave));
  } catch(e){}
  window.SOCIAL = SOCIAL;
  if(window.FateCloudSave) window.FateCloudSave.saveSocial();
}

function seedOnlinePlayers() {
  SIMULATED_ONLINE_PLAYERS.length = 0;
  const monthly = typeof getMonthlyAIOpponents === 'function' ? getMonthlyAIOpponents() : [];
  monthly.forEach((ai, idx)=>{
    SIMULATED_ONLINE_PLAYERS.push({
      username: ai.name,
      profileImg: (typeof getAIProfileImg === 'function' ? getAIProfileImg(ai, 'circle') : (ai.img || ai.profileImg || 'blank.png')),
      elo: ai.elo || 600,
      status: idx % 4 === 0 ? 'in-game' : 'online',
      isAI: true,
      isMonthly: true,
    });
  });
}

function findLiveAIPlayer(username) {
  const aiList = typeof getRandomMatchAIOpponents === 'function' ? getRandomMatchAIOpponents() : AI_OPPONENTS;
  return (Array.isArray(aiList) ? aiList : []).find(ai=>ai && ai.name === username) || null;
}

// ─── EMOJI SUPPORT ───
const EMOJI_LIST = [
  '😀','😂','😎','🤔','😤','🔥','💀','👑','⚔️','🛡️',
  '🃏','🎴','✨','💫','🌟','❤️','💔','👊','🤝','👋',
  '🎉','🏆','💪','😈','🙏','👀','💯','⭐','🎯','🗡️',
  '🙂','😁','😅','🤣','😊','😇','😉','😍','😘','😜',
  '🤪','😐','😑','🙄','😬','😮','😱','😭','😡','🤯',
  '🫡','🫠','🥲','🥹','😴','🤓','🥳','🤩','😏','😵',
  '🥶','🥵','🤫','🤭','🤗','😶','😶‍🌫️','🫥','😔','😞',
  '😢','😿','😾','😼','😺','😸','😹','😻','😽','🙀',
  '👏','🙌','🫶','🤲','🤌','🤙','🤟','✌️','🤞','🫰',
  '👍','👎','✊','🤜','🤛','💅','🧠','🫀','🦾','🦿',
  '🩷','🧡','💛','💚','💙','💜','🤎','🖤','🤍','❤️‍🔥',
  '💥','💢','💨','💦','💤','🕳️','💣','🧨','🪦','🧿',
  '🔮','🪄','🧪','🧬','🧲','⚙️','🧭','🗺️','🏰','🏯'
];

function renderEmojiPicker(onSelect) {
  const wrap = document.createElement('div');
  wrap.className = 'social-emoji-picker';
  EMOJI_LIST.forEach(emoji => {
    const btn = document.createElement('span');
    btn.className = 'social-emoji-btn';
    btn.textContent = emoji;
    btn.onclick = () => onSelect(emoji);
    wrap.appendChild(btn);
  });
  return wrap;
}

// ─── FRIEND SYSTEM ───
function addFriend(username) {
  if(username === USER_PROFILE.username) { toast('Cannot add yourself'); return; }
  if(SOCIAL.blocked.includes(username)) { toast('This user is blocked'); return; }
  if(SOCIAL.friends.find(f => f.username === username)) { toast('Already friends'); return; }
  if(SOCIAL.pendingOutgoing && SOCIAL.pendingOutgoing.includes(username)) { toast('Request already sent'); return; }
  // Send friend request
  if(!SOCIAL.pendingOutgoing) SOCIAL.pendingOutgoing = [];
  SOCIAL.pendingOutgoing.push(username);
  saveSocial();
  toast(`Friend request sent to ${username}`);
  playSfx('uiClick');
  renderSocialPage();
  // Simulate them accepting after a delay
  const player = SIMULATED_ONLINE_PLAYERS.find(p => p.username === username);
  setTimeout(() => {
    if(!SOCIAL.friends.find(f => f.username === username)) {
      SOCIAL.friends.push({
        username,
        profileImg: player?.profileImg || null,
        elo: player?.elo || 600,
        status: player?.status || 'offline',
        addedAt: Date.now()
      });
      SOCIAL.pendingOutgoing = (SOCIAL.pendingOutgoing||[]).filter(u=>u!==username);
      saveSocial();
      toast(`${username} accepted your friend request!`);
      playSfx('uiClick');
      renderSocialPage();
    }
  }, 3000 + Math.random() * 4000);
}

// Accept an incoming friend request
function acceptFriendRequest(username) {
  const req = (SOCIAL.pendingIncoming||[]).find(r=>r.username===username);
  if(!req) return;
  const player = SIMULATED_ONLINE_PLAYERS.find(p=>p.username===username);
  SOCIAL.friends.push({
    username,
    profileImg: req.profileImg || player?.profileImg || null,
    elo: req.elo || player?.elo || 600,
    status: player?.status || 'offline',
    addedAt: Date.now()
  });
  SOCIAL.pendingIncoming = (SOCIAL.pendingIncoming||[]).filter(r=>r.username!==username);
  saveSocial();
  toast(`${username} added as friend!`);
  playSfx('uiClick');
  renderSocialPage();
}

function declineFriendRequest(username) {
  SOCIAL.pendingIncoming = (SOCIAL.pendingIncoming||[]).filter(r=>r.username!==username);
  saveSocial();
  toast(`Request from ${username} declined`);
  renderSocialPage();
}
window.acceptFriendRequest = acceptFriendRequest;
window.declineFriendRequest = declineFriendRequest;

function removeFriend(username) {
  SOCIAL.friends = SOCIAL.friends.filter(f => f.username !== username);
  saveSocial();
  toast(`${username} removed from friends`);
}

function blockUser(username) {
  if(!SOCIAL.blocked.includes(username)) SOCIAL.blocked.push(username);
  removeFriend(username);
  saveSocial();
  toast(`${username} blocked`);
}

function unblockUser(username) {
  SOCIAL.blocked = SOCIAL.blocked.filter(u => u !== username);
  saveSocial();
  toast(`${username} unblocked`);
}

// ─── INSPECT PROFILE ───
function inspectProfile(username) {
  const friend = SOCIAL.friends.find(f => f.username === username);
  const online = SIMULATED_ONLINE_PLAYERS.find(p => p.username === username);
  const liveAI = findLiveAIPlayer(username);
  const player = friend || online || liveAI;
  if(!player) { toast('Player not found'); return; }

  const lbEntry = LEADERBOARD.find(e=>e.username===username);
  const elo = liveAI?.elo || lbEntry?.elo || player.elo || 600;
  if(friend) friend.elo = elo;
  if(online) online.elo = elo;
  const rank = getRank(elo);
  const statusColors = {online:'#7fffa0', 'in-game':'#ffd700', offline:'#888'};
  const statusLabel = player.status || 'offline';
  const isFriend = SOCIAL.friends.some(f => f.username === username);
  const pWins = lbEntry?.wins || 0;
  const pLosses = lbEntry?.losses || 0;
  const pHumanWins = Number(player.humanWins ?? player.wins ?? pWins) || 0;
  const pHumanLosses = Number(player.humanLosses ?? player.losses ?? pLosses) || 0;
  const pMatchesPlayed = Number(player.matchesPlayed ?? ((Number(pWins)||0) + (Number(pLosses)||0))) || 0;
  const displayLevel = Math.max(1, parseInt(player.level || lbEntry?.level || (liveAI ? Math.round((elo - 500) / 100) : 1), 10) || 1);
  const rankFrame = typeof getRankFrameStyle==='function' ? getRankFrameStyle(elo,'icon') : '';
  const profileImg = (typeof resolveProfileImgSrc === 'function' ? resolveProfileImgSrc(player.profileImg || player.img) : null) || player.profileImg || player.img || null;
  const bio = player.bio || lbEntry?.bio || '';

  const body = `
    <div class="profile-wrap">
      <div class="profile-img-wrap" style="${rankFrame};cursor:default;">
        ${profileImg ? `<img src="${profileImg}" style="width:100%;height:100%;object-fit:cover;object-position:center 20%;" alt="">` : `<span class="pi-placeholder">${username.charAt(0).toUpperCase()}</span>`}
      </div>
      <div class="profile-info">
        <div class="profile-name">${escapeHtml(username)}</div>
        <div class="profile-rank-row">${renderRankBadge(elo,'lg')}</div>
        <div style="margin-bottom:.7rem;">${renderLevelBadge(displayLevel).replace('level-badge','level-badge profile-level-badge')}</div>
        <div style="display:inline-flex;align-items:center;gap:.4rem;margin-bottom:.55rem;">
          <span style="width:9px;height:9px;border-radius:50%;background:${statusColors[statusLabel]};display:inline-block;flex-shrink:0;"></span>
          <span style="font-size:.8rem;color:${statusColors[statusLabel]};text-transform:capitalize;font-family:'Cinzel',serif;letter-spacing:.04em;">${statusLabel}</span>
        </div>
        <div class="profile-stats">
          <div class="profile-stat elo"><div class="ps-label">Challenger ELO</div><div class="ps-value">${elo}</div></div>
          <div class="profile-stat"><div class="ps-label">Human Record</div><div class="ps-value" style="font-size:.9rem;">${pHumanWins}W / ${pHumanLosses}L</div></div>
          <div class="profile-stat"><div class="ps-label">vs AI</div><div class="ps-value" style="font-size:.9rem;">0W / 0L</div></div>
          <div class="profile-stat"><div class="ps-label">Matches Played</div><div class="ps-value">${pMatchesPlayed}</div></div>
        </div>
        <div class="profile-bio${bio?'':' empty'}">${bio ? escapeHtml(bio) : 'No bio set. Click Edit to add one.'}</div>
      </div>
    </div>`;

  const actions = [];
  if(liveAI){
    actions.push({
      label:'Challenge AI',
      pri:true,
      action:()=>{
        closeModal();
        CURRENT_MODE = 'challenger';
        const presets = USER_PROFILE.challengerPresets || {};
        if(Object.keys(presets).length === 0){
          toast('Build a deck first in the Deck Builder tab');
          showScreen('s-challenger');
          switchChTab('deckbuilder');
          return;
        }
        G._pickDeckAfterAi = true;
        G._aiRewardMultiplier = liveAI.isMonthly ? 1.5 : 1;
        selectAIOpponent(liveAI);
      }
    });
  }
  if(!isFriend) {
    actions.push({label:'Add Friend', pri:true, action:()=>{ addFriend(username); closeModal(); }});
  } else {
    actions.push({label:'Message', pri:true, action:()=>{ closeModal(); openDirectMessage(username); }});
    actions.push({label:'Invite to Party', action:()=>{ inviteToParty(username); closeModal(); }});
    actions.push({label:'Remove Friend', danger:true, action:()=>{ removeFriend(username); closeModal(); }});
  }
  actions.push({label:'Close', action:closeModal});
  showModal('Profile', body, actions);
  saveSocial();
}

// ─── DIRECT MESSAGES ───
function openDirectMessage(username) {
  if(!SOCIAL.conversations[username]) SOCIAL.conversations[username] = [];
  const msgs = SOCIAL.conversations[username];
  const friend = SOCIAL.friends.find(f => f.username === username);
  const friendPic = friend?.profileImg || null;
  const friendElo = friend?.elo || 600;

  const renderChat = () => {
    const chatHtml = msgs.map(m => {
      const isMe = m.from === USER_PROFILE.username;
      const senderPic = isMe ? getProfileImgSrc() : friendPic;
      return `<div class="social-dm ${isMe ? 'social-dm-me' : 'social-dm-them'}">
        <div class="social-dm-avatar">
          ${senderPic ? `<img src="${senderPic}" style="width:100%;height:100%;object-fit:cover;">` : `<span>${m.from.charAt(0).toUpperCase()}</span>`}
        </div>
        <div class="social-dm-bubble">
          <div class="social-dm-name">${escapeHtml(m.from)}</div>
          <div class="social-dm-text">${escapeHtml(m.text)}</div>
          <div class="social-dm-time">${new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
        </div>
      </div>`;
    }).join('');

    const headerPic = friendPic
      ? `<img src="${friendPic}" style="width:100%;height:100%;object-fit:cover;">`
      : `<span style="font-size:1.4rem;color:var(--dim);">${username.charAt(0).toUpperCase()}</span>`;

    const body = `
      <div class="social-dm-header">
        <div class="social-dm-header-pic" style="${typeof getRankFrameStyle==='function'?getRankFrameStyle(friendElo,'icon'):''}">${headerPic}</div>
        <div class="social-dm-header-info">
          <div class="social-dm-header-name">${escapeHtml(username)}</div>
          <div class="social-dm-header-meta">${friendElo} ELO · ${renderRankBadge(friendElo,'sm')}</div>
        </div>
      </div>
      <div class="social-chat-box" id="social-dm-box">
        ${chatHtml || '<div style="text-align:center;padding:2rem;color:var(--dim);font-style:italic;">No messages yet. Say hello!</div>'}
      </div>
      <div class="social-chat-input-row">
        <button class="social-emoji-toggle" id="dm-emoji-toggle" title="Emoji">😀</button>
        <input type="text" class="social-chat-input" id="dm-input" placeholder="Type a message..." maxlength="200" autocomplete="off">
        <button class="btn sm pri" onclick='sendDirectMessage(${jsString(username)})'>Send</button>
      </div>
      <div id="dm-emoji-container" style="display:none;"></div>`;

    document.getElementById('modal-body').innerHTML = body;
    document.getElementById('modal-title').textContent = `Chat with ${username}`;
    document.getElementById('modal-acts').innerHTML = '';
    const dmModal = document.querySelector('#modal .modal');
    if(dmModal) Object.assign(dmModal.style, {maxWidth:'820px'});
    const close = document.createElement('button');
    close.className='btn sm'; close.textContent='Close'; close.onclick=closeModal;
    document.getElementById('modal-acts').appendChild(close);
    document.getElementById('modal').classList.add('on');

    // Scroll to bottom
    const box = document.getElementById('social-dm-box');
    if(box) box.scrollTop = box.scrollHeight;

    // Enter key
    const inp = document.getElementById('dm-input');
    if(inp) {
      inp.focus();
      inp.onkeydown = (e) => { if(e.key === 'Enter') sendDirectMessage(username); };
    }

    // Emoji toggle
    const emojiToggle = document.getElementById('dm-emoji-toggle');
    const emojiContainer = document.getElementById('dm-emoji-container');
    if(emojiToggle && emojiContainer) {
      emojiToggle.onclick = () => {
        if(emojiContainer.style.display === 'none') {
          emojiContainer.style.display = 'block';
          emojiContainer.innerHTML = '';
          emojiContainer.appendChild(renderEmojiPicker(emoji => {
            const inp = document.getElementById('dm-input');
            if(inp) inp.value += emoji;
            emojiContainer.style.display = 'none';
            inp.focus();
          }));
        } else {
          emojiContainer.style.display = 'none';
        }
      };
    }
  };

  renderChat();
  // Store render function for refresh
  window._refreshDM = renderChat;
}

function sendDirectMessage(username) {
  const inp = document.getElementById('dm-input');
  if(!inp) return;
  const text = inp.value.trim();
  if(!text) return;
  if(!SOCIAL.conversations[username]) SOCIAL.conversations[username] = [];
  SOCIAL.conversations[username].push({
    from: USER_PROFILE.username,
    text,
    timestamp: Date.now()
  });
  saveSocial();
  inp.value = '';

  // Simulate a reply after a short delay
  setTimeout(() => {
    const replies = [
      'GG!', 'Nice deck!', 'Want to play?', 'Good luck!', '😎',
      'Let\'s go!', 'Ready when you are', 'Cool!', '👊', 'Interesting strategy...'
    ];
    SOCIAL.conversations[username].push({
      from: username,
      text: replies[Math.floor(Math.random() * replies.length)],
      timestamp: Date.now()
    });
    saveSocial();
    if(typeof window._refreshDM === 'function') window._refreshDM();
  }, 1500 + Math.random() * 2000);

  if(typeof window._refreshDM === 'function') window._refreshDM();
  playSfx('uiClick');
}

// ─── PARTY SYSTEM ───
function createParty() {
  SOCIAL.party = {
    id: 'party_' + Date.now(),
    leader: USER_PROFILE.username,
    members: [{
      username: USER_PROFILE.username,
      profileImg: getProfileImgSrc(),
      elo: USER_PROFILE.challengerElo || 600,
      ready: true
    }]
  };
  saveSocial();
  toast('Party created! Invite friends to join.');
  showPartyPanel();
}

function inviteToParty(username) {
  if(!SOCIAL.party) createParty();
  if(SOCIAL.party.members.length >= 2) { toast('Party is full (2 players max)'); return; }
  if(SOCIAL.party.members.find(m => m.username === username)) { toast('Already in party'); return; }
  const friend = SOCIAL.friends.find(f => f.username === username);
  SOCIAL.party.members.push({
    username,
    profileImg: friend?.profileImg || null,
    elo: friend?.elo || 600,
    ready: false
  });
  saveSocial();
  toast(`${username} invited to party!`);

  // Simulate them becoming ready
  setTimeout(() => {
    const member = SOCIAL.party?.members?.find(m => m.username === username);
    if(member) {
      member.ready = true;
      saveSocial();
      toast(`${username} is ready!`);
      if(document.getElementById('social-party-panel')) showPartyPanel();
    }
  }, 2000 + Math.random() * 3000);
}

function leaveParty() {
  SOCIAL.party = null;
  saveSocial();
  toast('Left the party');
}

function showPartyPanel() {
  if(!SOCIAL.party) { toast('No active party'); return; }
  const p = SOCIAL.party;
  const membersHtml = p.members.map(m => {
    const isLeader = m.username === p.leader;
    const readyColor = m.ready ? '#7fffa0' : '#ff6b6b';
    return `<div class="social-party-member">
      <div class="social-party-pic">
        ${m.profileImg ? `<img src="${m.profileImg}" style="width:100%;height:100%;object-fit:cover;">` : `<span style="font-size:1.2rem;color:var(--dim);">${m.username.charAt(0).toUpperCase()}</span>`}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-family:'Cinzel',serif;font-size:.9rem;color:${isLeader?'var(--gold)':'var(--text)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(m.username)} ${isLeader?'<span style="font-size:.6rem;color:var(--gold);">★ LEADER</span>':''}</div>
        <div style="font-size:.7rem;color:var(--dim);">${m.elo} ELO</div>
      </div>
      <span style="width:10px;height:10px;border-radius:50%;background:${readyColor};flex-shrink:0;" title="${m.ready?'Ready':'Not Ready'}"></span>
    </div>`;
  }).join('');

  const allReady = p.members.every(m => m.ready);
  const body = `
    <div id="social-party-panel">
      <div style="font-size:.78rem;color:var(--dim);margin-bottom:.8rem;">Party members (${p.members.length}/2):</div>
      <div style="display:flex;flex-direction:column;gap:.5rem;margin-bottom:1rem;">${membersHtml}</div>
      ${p.members.length < 2 ? `<div style="text-align:center;padding:.8rem;border:1px dashed var(--border);border-radius:6px;color:var(--dim);font-size:.82rem;margin-bottom:.8rem;">Waiting for second player... Invite a friend!</div>` : ''}
      ${allReady && p.members.length === 2 ? `<button class="btn pri" onclick="toast('Matchmaking starting...');closeModal();" style="width:100%;margin-bottom:.5rem;">Start Match</button>` : ''}
    </div>`;

  const actions = [
    {label:'Close', action:closeModal},
    {label:'Leave Party', danger:true, action:()=>{ leaveParty(); closeModal(); }}
  ];
  showModal('Party', body, actions);
}

// ─── SOCIAL SCREEN (merged single page) ───
let _socialTab = 'friends';
let _socialMenuWarmupPromise = null;

function warmSocialMenuAssets() {
  if(_socialMenuWarmupPromise) return _socialMenuWarmupPromise;
  const sources = new Set(['blank.png']);
  try {
    (SOCIAL?.friends || []).forEach(p => { if(p && p.profileImg) sources.add(p.profileImg); });
    (SOCIAL?.party?.members || []).forEach(p => { if(p && p.profileImg) sources.add(p.profileImg); });
    (SIMULATED_ONLINE_PLAYERS || []).forEach(p => { if(p && p.profileImg) sources.add(p.profileImg); });
    if(typeof getProfileImgSrc === 'function') {
      const own = getProfileImgSrc();
      if(own) sources.add(own);
    }
  } catch(e) {}
  _socialMenuWarmupPromise = Promise.all(Array.from(sources).filter(Boolean).map(src => new Promise(resolve => {
    const img = new Image();
    let done = false;
    const finish = () => {
      if(done) return;
      done = true;
      resolve(src);
    };
    const timer = setTimeout(finish, 1400);
    img.onload = () => { clearTimeout(timer); finish(); };
    img.onerror = () => { clearTimeout(timer); finish(); };
    try { img.decoding = 'async'; } catch(e) {}
    try { img.loading = 'eager'; } catch(e) {}
    img.src = src;
    if(typeof img.decode === 'function') img.decode().then(() => {
      clearTimeout(timer);
      finish();
    }).catch(() => {});
  })));
  return _socialMenuWarmupPromise;
}

try {
  window.fateWarmSocialMenuAssets = warmSocialMenuAssets;
} catch(e) {}

function showSocial() {
  warmSocialMenuAssets();
  if(typeof showScreen === 'function') showScreen('s-social');
  else { document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); document.getElementById('s-social').classList.add('active'); }
  renderSocialPage();
}

function switchSocialTab(tab) {
  _socialTab = tab;
  renderSocialPage();
}

function isInternalOnlinePlayerProfile(player){
  const p = player || {};
  const uid = String(p.uid || p.id || '').toLowerCase();
  const name = String(p.username || p.name || p.displayName || p.chosenUsername || '').toLowerCase();
  const baseCode = String(p.baseCode || '').toLowerCase();
  if(/(^|[-_])(smoke|codex|test|diagnostic|client-resolved|authority)([-_]|$)/.test(uid)) return true;
  if(/^(fly\s+smoke|smoke\s+|codex\b|test\s+)/.test(name)) return true;
  if(/\b(smoke|codex|test)\b/.test(name)) return true;
  if(/(smoke|codex|test)/.test(baseCode)) return true;
  return false;
}
function renderSocialPage() {
  const content = document.getElementById('social-content');
  if(!content) return;

  const friends = SOCIAL.friends;
  const statusColors = {online:'#7fffa0', 'in-game':'#ffd700', offline:'#888'};

  // Randomize online player statuses slightly
  SIMULATED_ONLINE_PLAYERS.forEach(p => {
    if(Math.random() < 0.1) p.status = p.status === 'online' ? 'in-game' : 'online';
  });
  const onlinePlayers = SIMULATED_ONLINE_PLAYERS.filter(p => p.status !== 'offline' && !isInternalOnlinePlayerProfile(p));

  // Sort friends: online first
  const sortedFriends = [...friends].sort((a,b) => {
    const order = {online:0, 'in-game':1, offline:2};
    return (order[a.status]||2) - (order[b.status]||2);
  });

  // Paginate friends (8 per page)
  const FRIENDS_PER_PAGE = 8;
  if(typeof window._socialFriendPage === 'undefined') window._socialFriendPage = 0;
  const totalFriendPages = Math.max(1, Math.ceil(sortedFriends.length / FRIENDS_PER_PAGE));
  window._socialFriendPage = Math.max(0, Math.min(window._socialFriendPage, totalFriendPages - 1));
  const pageFriends = sortedFriends.slice(window._socialFriendPage * FRIENDS_PER_PAGE, (window._socialFriendPage + 1) * FRIENDS_PER_PAGE);

  // Party info
  const party = SOCIAL.party;
  const partyHtml = party ? party.members.map(m => {
    const isLeader = m.username === party.leader;
    const readyColor = m.ready ? '#7fffa0' : '#ff6b6b';
    return `<div class="social-party-member">
      <div class="social-party-pic">
        ${m.profileImg ? `<img src="${m.profileImg}" loading="eager" decoding="async" draggable="false" style="width:100%;height:100%;object-fit:cover;">` : `<span style="font-size:1rem;color:var(--dim);">${m.username.charAt(0).toUpperCase()}</span>`}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-family:'Cinzel',serif;font-size:.82rem;color:${isLeader?'var(--gold)':'var(--text)'};">${escapeHtml(m.username)} ${isLeader?'<span style="font-size:.55rem;color:var(--gold);">★</span>':''}</div>
        <div style="font-size:.65rem;color:var(--dim);">${m.elo} ELO · <span style="color:${readyColor};">${m.ready?'Ready':'Waiting'}</span></div>
      </div>
    </div>`;
  }).join('') : '';

  const allReady = party && party.members.every(m => m.ready) && party.members.length === 2;

  content.innerHTML = `
    <div class="social-live-matches-banner" onclick="if(typeof fateOpenLiveMatches==='function')fateOpenLiveMatches();else if(typeof toast==='function')toast('Online not ready');">
      <div class="slm-icon" aria-hidden="true">👁</div>
      <div class="slm-copy">
        <div class="slm-label">LIVE MATCHES</div>
        <div class="slm-desc">Watch ongoing human vs human games in real-time</div>
      </div>
      <div class="slm-arrow" aria-hidden="true">›</div>
    </div>
    <div class="social-merged-layout">
      <!-- LEFT: Main area (add friend + friend list) -->
      <div class="social-main-col">
        <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.8rem;flex-wrap:wrap;">
          <input type="text" id="social-add-input" placeholder="Add friend by username..." maxlength="24"
            style="flex:1;min-width:160px;background:#0a0a0f;border:1px solid var(--border);color:var(--text);padding:.45rem .65rem;font-family:'Crimson Pro',serif;font-size:.88rem;border-radius:6px;">
          <button class="btn sm pri" onclick="socialAddFriendFromInput()">Add Friend</button>
        </div>
        <div class="social-section-header">FRIENDS (${friends.length})</div>
        ${friends.length === 0
          ? `<div style="text-align:center;padding:2.5rem 1.5rem;color:#c8ccd8;font-size:1.3rem;line-height:1.6;font-family:Cinzel,serif;">No friends yet.<br><span style="font-size:1rem;color:#a0a8b8;">Add someone or browse online players.</span></div>`
          : `<div class="social-friend-list" style="overflow:hidden;">${pageFriends.map(f => `
            <div class="social-friend-row" onclick='inspectProfile(${jsString(f.username)})'>
              <div class="social-friend-pic">
                ${f.profileImg ? `<img src="${f.profileImg}" loading="eager" decoding="async" draggable="false" style="width:100%;height:100%;object-fit:cover;">` : `<span style="font-size:1rem;color:var(--dim);">${f.username.charAt(0).toUpperCase()}</span>`}
                <span class="social-status-dot" style="background:${statusColors[f.status]||'#888'};"></span>
              </div>
              <div class="social-friend-info">
                <div class="social-friend-name">${escapeHtml(f.username)}</div>
                <div class="social-friend-meta">${f.elo} ELO · <span style="color:${statusColors[f.status]||'#888'};text-transform:capitalize;">${f.status||'offline'}</span></div>
              </div>
              <div class="social-friend-actions">
                <button class="btn sm" onclick='event.stopPropagation();openDirectMessage(${jsString(f.username)})' title="Message">💬</button>
                <button class="btn sm" onclick='event.stopPropagation();inviteToParty(${jsString(f.username)})' title="Invite to Party">🎮</button>
              </div>
            </div>`).join('')}</div>
            ${totalFriendPages > 1 ? `<div style="display:flex;justify-content:center;align-items:center;gap:.6rem;margin-top:.5rem;">
              <button class="btn sm" onclick="window._socialFriendPage--;renderSocialPage();" ${window._socialFriendPage<=0?'disabled':''}>‹ Prev</button>
              <span style="font-family:'Cinzel',serif;font-size:.68rem;color:var(--dim);letter-spacing:.06em;">Page ${window._socialFriendPage+1} / ${totalFriendPages}</span>
              <button class="btn sm" onclick="window._socialFriendPage++;renderSocialPage();" ${window._socialFriendPage>=totalFriendPages-1?'disabled':''}>Next ›</button>
            </div>` : ''}`}
      </div>

      <!-- RIGHT: Online players (top) + Party (bottom) -->
      <div class="social-side-col">
        <!-- Online Players -->
        <div class="social-side-panel social-online-window">
          <div class="social-section-header" style="display:flex;align-items:center;gap:.4rem;">
            <span style="width:7px;height:7px;border-radius:50%;background:#7fffa0;display:inline-block;"></span>
            ONLINE (${onlinePlayers.length})
          </div>
          <div class="social-online-list">
            ${onlinePlayers.slice(0,10).map(p => {
              const isFriend = SOCIAL.friends.some(f => f.username === p.username);
              return `<div class="social-online-row" onclick='inspectProfile(${jsString(p.username)})'>
                <div class="social-online-pic">
                  <span>${p.username.charAt(0).toUpperCase()}</span>
                  <span class="social-status-dot" style="background:${statusColors[p.status]};width:7px;height:7px;"></span>
                </div>
                <div class="social-online-info">
                  <div style="font-size:.78rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(p.username)}</div>
                  <div style="font-size:.6rem;color:var(--dim);">${p.elo} ELO</div>
                </div>
                ${isFriend
                  ? '<span style="font-size:.6rem;color:var(--gold);">★</span>'
                  : `<button class="btn sm" style="font-size:.6rem;padding:.2rem .4rem;" onclick='event.stopPropagation();addFriend(${jsString(p.username)});renderSocialPage();'>+</button>`}
              </div>`;
            }).join('')}
            ${onlinePlayers.length > 10 ? `<div style="font-size:.65rem;color:var(--dim);text-align:center;padding:.3rem;">+${onlinePlayers.length - 10} more</div>` : ''}
          </div>
        </div>

        <!-- Party -->
        <div class="social-side-panel social-party-window">
          <div class="social-section-header">PARTY</div>
          ${!party
            ? `<div style="text-align:center;padding:.8rem;">
                <div style="font-size:.78rem;color:var(--dim);margin-bottom:.5rem;">No active party</div>
                <button class="btn sm pri" onclick="createParty();renderSocialPage();">Create Party</button>
              </div>`
            : `<div style="display:flex;flex-direction:column;gap:.3rem;margin-bottom:.5rem;">${partyHtml}</div>
               ${party.members.length < 2 ? '<div style="font-size:.68rem;color:var(--dim);text-align:center;padding:.3rem;border:1px dashed var(--border);border-radius:4px;">Waiting for 2nd player...</div>' : ''}
               ${allReady ? '<button class="btn sm pri" onclick="toast(\'Matchmaking starting...\')" style="width:100%;margin-top:.3rem;">Start Match</button>' : ''}
               <button class="btn sm danger" onclick="leaveParty();renderSocialPage();" style="margin-top:.4rem;width:100%;">Leave Party</button>`}
        </div>
      </div>
    </div>`;

  const inp = document.getElementById('social-add-input');
  if(inp) inp.onkeydown = (e) => { if(e.key === 'Enter') socialAddFriendFromInput(); };
}

function socialAddFriendFromInput() {
  const inp = document.getElementById('social-add-input');
  if(!inp) return;
  const name = inp.value.trim();
  if(!name) { toast('Enter a username'); return; }
  addFriend(name);
  inp.value = '';
  renderSocialPage();
}

// ─── WORLD CHAT (bottom-right of title screen) ───
let _worldChatOpen = false;
let _worldChatUnread = 0;

function installFateCornerDock(){
  // FPS fix: bail early when side panel is active — chat lives in panel, dock is irrelevant
  const sidePanelActive = !!document.getElementById('s-title')?.classList.contains('fate-side-panel');
  const inGameActive = document.body.classList.contains('in-game') || !!document.getElementById('s-game')?.classList.contains('active');
  if(sidePanelActive && !inGameActive){
    const existingDock = document.getElementById('fate-corner-dock');
    if(existingDock) existingDock.classList.remove('dock-visible');
    const existingChat = document.getElementById('world-chat-widget');
    if(existingChat) existingChat.style.display = 'none';
    return existingDock;
  }
  let dock = document.getElementById('fate-corner-dock');
  if(!dock){
    dock = document.createElement('div');
    dock.id = 'fate-corner-dock';
    dock.className = 'fate-corner-dock';
    document.body.appendChild(dock);
  }
  const chat = document.getElementById('world-chat-widget');
  const inGameChat = document.getElementById('ingame-chat-widget');
  const account = document.getElementById('fate-online-account');
  const titleActive = !!document.getElementById('s-title')?.classList.contains('active') && !inGameActive;
  const showDock = titleActive || inGameActive;
  if(chat) {
    chat.style.display = (showDock && !inGameActive) ? '' : 'none';
    if(inGameActive && chat.parentElement !== document.body) document.body.appendChild(chat);
    if(!inGameActive && chat.parentElement !== dock) dock.appendChild(chat);
  }
  if(inGameChat && inGameChat.parentElement !== dock) dock.appendChild(inGameChat);
  if(account && account.parentElement === dock) document.body.appendChild(account);
  dock.classList.toggle('has-chat', !!chat);
  dock.classList.toggle('has-ingame-chat', !!inGameChat && inGameActive);
  dock.classList.toggle('game-chat-dock', !!inGameActive);
  dock.classList.remove('has-account');
  const chatVisible = !!(showDock && ((chat && chat.style.display !== 'none') || (!!inGameChat && inGameActive)));
  dock.classList.toggle('dock-visible', chatVisible);
  return dock;
}

function scheduleFateCornerDock(){
  installFateCornerDock();
  if(window.__fateCornerDockScheduled) return;
  window.__fateCornerDockScheduled = true;
  const settle = function(done){
    installFateCornerDock();
    if(done) window.__fateCornerDockScheduled = false;
  };
  if(typeof requestAnimationFrame === 'function') requestAnimationFrame(function(){ settle(false); });
  setTimeout(function(){ settle(false); }, 80);
  setTimeout(function(){ settle(true); }, 260);
}

function bindCornerChatDelegates(){
  if(window.__fateCornerChatDelegatesBound) return;
  window.__fateCornerChatDelegatesBound = true;
  document.addEventListener('click', e=>{
    const toggle = e.target?.closest?.('#world-chat-toggle,.world-chat-toggle');
    if(!toggle || !toggle.closest?.('#world-chat-widget')) return;
    e.preventDefault();
    e.stopPropagation();
    if(typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    toggleWorldChat();
  }, true);
  document.addEventListener('keydown', e=>{
    const toggle = e.target?.closest?.('#world-chat-toggle,.world-chat-toggle');
    if(!toggle || !toggle.closest?.('#world-chat-widget')) return;
    if(e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    toggleWorldChat();
  }, true);
}

function initWorldChat() {
  // Online rebuild: keep the existing world chat UI, but do not seed fake local messages.
  bindCornerChatDelegates();
  if(document.getElementById('world-chat-widget')){
    scheduleFateCornerDock();
    return;
  }
  // Seed some initial messages
  if(false && SOCIAL.worldChat.length === 0) {
    const msgs = [
      {from:'CardMaster99', text:'Anyone want to duel? 🔥', timestamp:Date.now()-120000},
      {from:'AceOfFates', text:'Just pulled a Star card from a pack!!! ✨', timestamp:Date.now()-90000},
      {from:'ZoneControl', text:'GG everyone', timestamp:Date.now()-60000},
      {from:'FateStar', text:'New player here, any tips?', timestamp:Date.now()-30000},
      {from:'DeckSlinger', text:'Shield Wall decks are OP lol', timestamp:Date.now()-15000},
    ];
    SOCIAL.worldChat = msgs;
    saveSocial();
  }

  // Create the world chat widget
  const widget = document.createElement('div');
  widget.id = 'world-chat-widget';
  widget.className = 'world-chat-widget';
  widget.innerHTML = `
    <div class="world-chat-toggle" id="world-chat-toggle">
      <span class="world-chat-icon" aria-hidden="true">💬</span>
      <span class="world-chat-label">World Chat</span>
      <span class="world-chat-badge" id="world-chat-badge" style="display:none;">0</span>
    </div>
    <div class="world-chat-panel" id="world-chat-panel" style="display:none;">
      <div class="world-chat-header">
        <span style="font-family:'Cinzel',serif;font-size:.82rem;color:var(--gold);letter-spacing:.08em;">WORLD CHAT</span>
        <button class="world-chat-close" onclick="toggleWorldChat()">✕</button>
      </div>
      <div class="world-chat-messages" id="world-chat-messages"></div>
      <div class="world-chat-input-row">
        <button class="social-emoji-toggle" id="wc-emoji-toggle" title="Emoji" onclick="toggleWorldChatEmoji()">😀</button>
        <input type="text" class="social-chat-input" id="wc-input" placeholder="Say something..." maxlength="200" autocomplete="off" onkeydown="if(event.key==='Enter')sendWorldChat()">
        <button class="btn sm pri" onclick="sendWorldChat()">Send</button>
      </div>
      <div id="wc-emoji-container" style="display:none;"></div>
    </div>`;
  document.body.appendChild(widget);
  const toggle = widget.querySelector('#world-chat-toggle');
  if(toggle){
    toggle.setAttribute('role','button');
    toggle.setAttribute('tabindex','0');
    toggle.addEventListener('click', e=>{ e.preventDefault(); e.stopPropagation(); toggleWorldChat(); });
    toggle.addEventListener('keydown', e=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); toggleWorldChat(); } });
  }
  scheduleFateCornerDock();

  // Online rebuild: realtime messages are supplied by 17-online-social.js.
  // Do not simulate local-only world chat messages in online mode.
}

function toggleWorldChat() {
  _worldChatOpen = !_worldChatOpen;
  if(_worldChatOpen && _inGameChatOpen && typeof toggleInGameChat === 'function') toggleInGameChat();
  const widget = document.getElementById('world-chat-widget');
  const panel = document.getElementById('world-chat-panel');
  if(widget) widget.classList.toggle('is-open', _worldChatOpen);
  if(panel){
    panel.style.display = _worldChatOpen ? 'flex' : 'none';
    panel.setAttribute('aria-hidden', _worldChatOpen ? 'false' : 'true');
  }
  if(_worldChatOpen) {
    _worldChatUnread = 0;
    updateWorldChatBadge();
    renderWorldChatMessages({forceBottom:true});
    const inp = document.getElementById('wc-input');
    if(inp) inp.focus();
  }
}

function toggleWorldChatEmoji() {
  const container = document.getElementById('wc-emoji-container');
  if(!container) return;
  if(container.style.display === 'none') {
    container.style.display = 'block';
    container.innerHTML = '';
    container.appendChild(renderEmojiPicker(emoji => {
      const inp = document.getElementById('wc-input');
      if(inp) inp.value += emoji;
      container.style.display = 'none';
      inp.focus();
    }));
  } else {
    container.style.display = 'none';
  }
}

function renderWorldChatMessages(options = {}) {
  const el = document.getElementById('world-chat-messages');
  const forceBottom = !!options.forceBottom || !!window.FATE_WORLD_CHAT_FORCE_BOTTOM_ON_NEXT_RENDER;
  if(el) {
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const wasNearBottom = distanceFromBottom <= 48;
    const previousScrollTop = el.scrollTop;
    el.innerHTML = getWorldChatMessagesHtml();
    if(forceBottom || wasNearBottom) {
      el.scrollTop = el.scrollHeight;
    } else {
      el.scrollTop = Math.min(previousScrollTop, Math.max(0, el.scrollHeight - el.clientHeight));
    }
  }
  window.FATE_WORLD_CHAT_FORCE_BOTTOM_ON_NEXT_RENDER = false;
  renderInGameWorldMessages({forceBottom});
  // Also update the side panel embedded chat if active
  if(typeof renderSidePanelChat === 'function') renderSidePanelChat();
}

function getWorldChatMessagesHtml() {
  const source = Array.isArray(window.FATE_ONLINE_WORLD_CHAT) ? window.FATE_ONLINE_WORLD_CHAT : SOCIAL.worldChat;
  const msgs = source.slice(-50); // last 50 messages
  return msgs.map(m => {
    const myUid = window.FATE_ONLINE?.user?.uid || '';
    const isMe = (m.uid && m.uid === myUid) || m.from === USER_PROFILE.username;
    const time = new Date(m.timestamp || Date.now()).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    const inspectTarget = m.uid || m.from || '';
    return `<div class="wc-msg ${isMe ? 'wc-msg-me' : ''}">
      <span class="wc-msg-name" style="color:${isMe?'var(--gold)':'var(--p1)'};" onclick='event.stopPropagation();${m.uid ? `window.inspectOnlineProfile && window.inspectOnlineProfile(${jsString(m.uid)})` : `inspectProfile(${jsString(m.from)})`}'>${escapeHtml(m.from)}</span>
      <span class="wc-msg-text">${escapeHtml(m.text)}</span>
      <span class="wc-msg-time">${time}</span>
    </div>`;
  }).join('');
}

function sendWorldChat() {
  // Check side panel input first — copy its value to the main input
  const spInput = document.getElementById('sp-wc-input');
  const mainInput = document.getElementById('wc-input');
  if(spInput && spInput.value.trim()){
    if(mainInput) mainInput.value = spInput.value;
    spInput.value = '';
  }
  if(window.FATE_ONLINE_SEND_WORLD_CHAT){
    const commandText = mainInput ? mainInput.value.trim() : '';
    if(commandText && typeof handleFateChatCommand === 'function' && handleFateChatCommand(commandText)){
      if(mainInput) mainInput.value = '';
      return;
    }
    var result = window.FATE_ONLINE_SEND_WORLD_CHAT();
    // Sync side panel chat after sending
    if(typeof renderSidePanelChat === 'function') setTimeout(renderSidePanelChat, 150);
    return result;
  }
  const inp = document.getElementById('wc-input');
  if(!inp) return;
  const text = inp.value.trim();
  if(!text) return;
  if(typeof handleFateChatCommand === 'function' && handleFateChatCommand(text)){
    inp.value = '';
    return;
  }
  // /run command: simulate AI vs AI matches
  if(text.toLowerCase() === '/run') {
    inp.value = '';
    runAISimulations();
    return;
  }
  SOCIAL.worldChat.push({
    from: USER_PROFILE.username,
    text,
    timestamp: Date.now()
  });
  saveSocial();
  inp.value = '';
  renderWorldChatMessages({forceBottom:true});
  playSfx('uiClick');
}

function runAISimulations() {
  let simCount = 0;
  const aiList = typeof getRandomMatchAIOpponents === 'function' ? getRandomMatchAIOpponents() : AI_OPPONENTS;
  if(aiList.length < 2){ toast('Need at least 2 AI opponents'); return; }
  const shuffled = aiList.slice();
  for(let i=shuffled.length-1; i>0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const NUM_SIMS = Math.floor(shuffled.length / 2);
  toast('Running '+NUM_SIMS+' AI simulations...');
  for(let s=0; s<NUM_SIMS; s++){
    const a1 = shuffled[s * 2], a2 = shuffled[s * 2 + 1];
    if(!a1 || !a2) continue;
    const expected = 1 / (1 + Math.pow(10, (a2.elo - a1.elo) / 400));
    const a1Wins = Math.random() < expected;
    const winner = a1Wins ? a1.name : a2.name;
    const K = 24;
    const a1Change = typeof applyMinimumEloDelta === 'function' ? applyMinimumEloDelta(K * ((a1Wins?1:0) - expected), a1Wins) : Math.round(K * ((a1Wins?1:0) - expected));
    const a2Change = typeof applyMinimumEloDelta === 'function' ? applyMinimumEloDelta(K * ((a1Wins?0:1) - (1 - expected)), !a1Wins) : -a1Change;
    // Actually update AI ELO
    const a1NewElo = Math.max(100, a1.elo + a1Change);
    const a2NewElo = Math.max(100, a2.elo + a2Change);
    if(typeof logMatch === 'function') {
      logMatch(a1.name, a2.name, winner, a1Change, a2Change, a1NewElo, a2NewElo, true);
    }
    a1.elo = a1NewElo;
    a2.elo = a2NewElo;
    if(typeof syncAIEloEverywhere === 'function'){
      syncAIEloEverywhere(a1.name, a1NewElo, a1Wins);
      syncAIEloEverywhere(a2.name, a2NewElo, !a1Wins);
    }
    simCount++;
  }
  syncAIOpponentLeaderboardEntries();
  SOCIAL.worldChat.push({
    from: 'SYSTEM',
    text: 'Simulated '+simCount+' AI matches. ELO and records updated!',
    timestamp: Date.now()
  });
  saveSocial();
  renderWorldChatMessages();
  playSfx('effect');
}
window.runAISimulations = runAISimulations;

function simulateWorldChatMessage() {
  if(window.FATE_ONLINE_CHAT_MODE) return;
  const senders = SIMULATED_ONLINE_PLAYERS.filter(p => p.status === 'online');
  if(senders.length === 0) return;
  const sender = senders[Math.floor(Math.random() * senders.length)];
  const messages = [
    'Anyone up for a game?', 'GG!', 'Just hit Captain-Officer rank! 🎉', 'Shield Wall is so strong',
    'Need tips for Eventide decks', 'Looking for a challenge ⚔️', 'Hello everyone 👋',
    'That was a close match!', 'Love the new cards', 'Trading cards anyone?',
    'Just opened a Star card! 🌟', 'Best Coordinator?', 'Third Great War decks are fire 🔥',
    'Any new players need help?', 'Party up?', 'Let\'s gooo 💪', '😎', 'Wow', 'Nice!',
  ];
  SOCIAL.worldChat.push({
    from: sender.username,
    text: messages[Math.floor(Math.random() * messages.length)],
    timestamp: Date.now()
  });
  // Trim to last 100
  if(SOCIAL.worldChat.length > 100) SOCIAL.worldChat = SOCIAL.worldChat.slice(-100);
  saveSocial();

  if(_worldChatOpen) {
    renderWorldChatMessages();
  } else {
    _worldChatUnread++;
    updateWorldChatBadge();
  }
}

function updateWorldChatBadge() {
  const badge = document.getElementById('world-chat-badge');
  if(badge && _worldChatUnread > 0) {
    badge.style.display = 'inline-flex';
    badge.textContent = _worldChatUnread > 99 ? '99+' : _worldChatUnread;
  } else if(badge) {
    badge.style.display = 'none';
  }
  if(document.body.classList.contains('in-game') && typeof updateInGameChatBadge === 'function') updateInGameChatBadge();
}

// ─── EXPOSE GLOBALS ───
window.showSocial = showSocial;
window.switchSocialTab = switchSocialTab;
window.inspectProfile = inspectProfile;
window.openDirectMessage = openDirectMessage;
window.sendDirectMessage = sendDirectMessage;
window.renderWorldChatMessages = renderWorldChatMessages;
window.addFriend = addFriend;
window.removeFriend = removeFriend;
window.createParty = createParty;
window.inviteToParty = inviteToParty;
window.leaveParty = leaveParty;
window.showPartyPanel = showPartyPanel;
window.toggleWorldChat = toggleWorldChat;
window.sendWorldChat = sendWorldChat;
window.socialAddFriendFromInput = socialAddFriendFromInput;
window.toggleWorldChatEmoji = toggleWorldChatEmoji;
window.installFateCornerDock = installFateCornerDock;
window.scheduleFateCornerDock = scheduleFateCornerDock;
window.renderSocialPage = renderSocialPage;

// ─── IN-GAME CHAT (popup during matches) ───
let _inGameChatOpen = false;
let _inGameChatTab = 'lobby';
let _inGameMessages = [];
let _inGameChatUnread = 0;
let _inGameKnownMessageIds = new Set();

function initInGameChat() {
  _inGameMessages = [];
  _inGameChatUnread = 0;
  _inGameKnownMessageIds = new Set();
  _inGameChatTab = 'lobby';
  // Remove existing widget if any
  const existing = document.getElementById('ingame-chat-widget');
  if(existing) existing.remove();

  // Keep world chat available during games; the shared chat dock places it beside match chat.
  if(typeof initWorldChat === 'function') initWorldChat();
  if(typeof scheduleFateCornerDock === 'function') scheduleFateCornerDock();

  const widget = document.createElement('div');
  widget.id = 'ingame-chat-widget';
  widget.className = 'ingame-chat-widget';

  // Build lobby with player info + match chat
  const onlineProfiles = G.playerProfiles || {};
  const p1Profile = onlineProfiles[0] || {};
  const p2Profile = onlineProfiles[1] || {};
  const p1Name = p1Profile.name || G.players[0].name || 'Player 1';
  const p2Name = p2Profile.name || G.players[1].name || 'Player 2';
  const p1Elo = p1Profile.elo || USER_PROFILE.elo || 1000;
  const p2Elo = p2Profile.elo || G._aiOpponentElo || (G._selectedAI ? G._selectedAI.elo : 1000);
  const p1Img = p1Profile.img || (typeof getProfileImgSrc === 'function' ? getProfileImgSrc() : null);
  const p2Img = p2Profile.img || (G._selectedAI && typeof getAIProfileImg === 'function' ? getAIProfileImg(G._selectedAI, 'circle') : (G._selectedAI && G._selectedAI.img ? G._selectedAI.img : null));

  widget.innerHTML = `
    <div class="ingame-chat-toggle">
      <span class="ingame-chat-icon" aria-hidden="true">💬</span>
      <span class="ingame-chat-label">Chat</span>
      <span class="ingame-chat-badge" id="ingame-chat-badge" style="display:none;">0</span>
    </div>
    <div class="ingame-chat-panel" id="ingame-chat-panel" style="display:none;">
      <div class="ingame-chat-header">
        <span style="font-family:'Cinzel',serif;font-size:.76rem;color:var(--gold);letter-spacing:.06em;">MATCH CHAT</span>
        <button class="world-chat-close" onclick="toggleInGameChat()">✕</button>
      </div>
      <div class="ingame-chat-switch" role="tablist" aria-label="Chat channel">
        <button id="ig-chat-tab-lobby" class="active" type="button" onclick="switchInGameChatTab('lobby')" role="tab" aria-selected="true">${G._isSpectator ? 'Spectator' : 'Lobby'}</button>
        <button id="ig-chat-tab-world" type="button" onclick="switchInGameChatTab('world')" role="tab" aria-selected="false">World</button>
      </div>
      <div class="ingame-chat-view active" id="ingame-chat-view-lobby" data-chat-view="lobby">
        <div class="ingame-chat-matchup">
          <div class="ingame-chat-player-card">
            <div class="ingame-chat-pic p1">
              ${p1Img ? '<img src="'+p1Img+'" width="96" height="96" decoding="async" loading="eager" fetchpriority="high" style="width:100%;height:100%;object-fit:cover;object-position:center 22%;">' : '<span style="font-size:.8rem;color:var(--dim);">P1</span>'}
            </div>
            <div class="ingame-chat-name p1">${escapeHtml(p1Name)}</div>
          </div>
          <div class="ingame-chat-versus">VS</div>
          <div class="ingame-chat-player-card">
            <div class="ingame-chat-pic p2">
              ${p2Img ? '<img src="'+p2Img+'" width="96" height="96" decoding="async" loading="eager" fetchpriority="high" style="width:100%;height:100%;object-fit:cover;object-position:center 22%;">' : '<span style="font-size:.8rem;color:var(--dim);">P2</span>'}
            </div>
            <div class="ingame-chat-name p2">${escapeHtml(p2Name)}</div>
          </div>
        </div>
        <div class="ingame-chat-messages" id="ingame-chat-messages"></div>
        <div class="world-chat-input-row ingame-chat-input-row">
          <button class="social-emoji-toggle ingame-emoji-toggle" onclick="toggleInGameEmoji()" title="Emoji"><span class="emoji-face-icon" aria-hidden="true"></span></button>
          <input type="text" class="social-chat-input" id="igc-input" placeholder="${G._isSpectator ? 'Chat as spectator...' : 'Chat...'}" maxlength="150" autocomplete="off" onkeydown="if(event.key==='Enter')sendInGameChat()">
          <button class="btn sm pri ingame-chat-send" onclick="sendInGameChat()">SEND</button>
        </div>
        <div id="igc-emoji-container" style="display:none;"></div>
      </div>
      <div class="ingame-chat-view" id="ingame-chat-view-world" data-chat-view="world">
        <div class="ingame-world-chat-messages world-chat-messages" id="ingame-world-chat-messages"></div>
        <div class="world-chat-input-row ingame-world-chat-input-row">
          <input type="text" class="social-chat-input" id="igwc-input" placeholder="World chat..." maxlength="200" autocomplete="off" onkeydown="if(event.key==='Enter')sendInGameWorldChat()">
          <button class="btn sm pri ingame-chat-send" onclick="sendInGameWorldChat()">SEND</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(widget);
  const toggle = widget.querySelector('.ingame-chat-toggle');
  if(toggle){
    toggle.setAttribute('role','button');
    toggle.setAttribute('tabindex','0');
    toggle.addEventListener('click', e=>{ e.preventDefault(); e.stopPropagation(); toggleInGameChat(); });
    toggle.addEventListener('keydown', e=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); toggleInGameChat(); } });
  }
  if(typeof scheduleFateCornerDock === 'function') scheduleFateCornerDock();
}

function switchInGameChatTab(tab) {
  _inGameChatTab = tab === 'world' ? 'world' : 'lobby';
  const lobbyView = document.getElementById('ingame-chat-view-lobby');
  const worldView = document.getElementById('ingame-chat-view-world');
  const lobbyTab = document.getElementById('ig-chat-tab-lobby');
  const worldTab = document.getElementById('ig-chat-tab-world');
  const worldActive = _inGameChatTab === 'world';
  if(lobbyView) lobbyView.classList.toggle('active', !worldActive);
  if(worldView) worldView.classList.toggle('active', worldActive);
  if(lobbyTab) {
    lobbyTab.classList.toggle('active', !worldActive);
    lobbyTab.setAttribute('aria-selected', worldActive ? 'false' : 'true');
  }
  if(worldTab) {
    worldTab.classList.toggle('active', worldActive);
    worldTab.setAttribute('aria-selected', worldActive ? 'true' : 'false');
  }
  if(worldActive) {
    _worldChatUnread = 0;
    updateWorldChatBadge();
    renderInGameWorldMessages({forceBottom:true});
    const inp = document.getElementById('igwc-input');
    if(inp) inp.focus();
  } else {
    renderInGameMessages();
    const inp = document.getElementById('igc-input');
    if(inp) inp.focus();
  }
}

function renderInGameWorldMessages(options = {}) {
  const el = document.getElementById('ingame-world-chat-messages');
  if(!el) return;
  const forceBottom = !!options.forceBottom;
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  const wasNearBottom = distanceFromBottom <= 48;
  const previousScrollTop = el.scrollTop;
  el.innerHTML = typeof getWorldChatMessagesHtml === 'function' ? getWorldChatMessagesHtml() : '';
  if(forceBottom || wasNearBottom) el.scrollTop = el.scrollHeight;
  else el.scrollTop = Math.min(previousScrollTop, Math.max(0, el.scrollHeight - el.clientHeight));
}

function sendInGameWorldChat() {
  const mirrorInput = document.getElementById('igwc-input');
  const mainInput = document.getElementById('wc-input');
  if(!mirrorInput) return;
  const text = mirrorInput.value.trim();
  if(!text) return;
  if(mainInput) mainInput.value = text;
  mirrorInput.value = '';
  sendWorldChat();
  renderInGameWorldMessages({forceBottom:true});
}

function toggleInGameChat() {
  _inGameChatOpen = !_inGameChatOpen;
  if(_inGameChatOpen && _worldChatOpen && typeof toggleWorldChat === 'function') toggleWorldChat();
  const widget = document.getElementById('ingame-chat-widget');
  const panel = document.getElementById('ingame-chat-panel');
  if(widget) widget.classList.toggle('is-open', _inGameChatOpen);
  if(panel){
    panel.style.display = _inGameChatOpen ? 'flex' : 'none';
    panel.setAttribute('aria-hidden', _inGameChatOpen ? 'false' : 'true');
  }
  if(_inGameChatOpen) {
    _inGameChatUnread = 0;
    updateInGameChatBadge();
    switchInGameChatTab(_inGameChatTab);
    const inp = document.getElementById(_inGameChatTab === 'world' ? 'igwc-input' : 'igc-input');
    if(inp) inp.focus();
  }
}

function toggleInGameEmoji() {
  const container = document.getElementById('igc-emoji-container');
  if(!container) return;
  if(container.style.display === 'none') {
    container.style.display = 'block';
    container.innerHTML = '';
    container.appendChild(renderEmojiPicker(emoji => {
      const inp = document.getElementById('igc-input');
      if(inp) inp.value += emoji;
      container.style.display = 'none';
      inp.focus();
    }));
  } else {
    container.style.display = 'none';
  }
}

function renderInGameMessages() {
  const el = document.getElementById('ingame-chat-messages');
  if(!el) return;
  // Count spectator messages for the "X spectators" label
  const spectatorUids = new Set();
  _inGameMessages.forEach(m=>{ if(m.isSpectator || m.player === -1) spectatorUids.add(m.uid); });
  const specCount = spectatorUids.size;
  el.innerHTML = _inGameMessages.map(m => {
    if(m.isSpectator || m.player === -1){
      // Spectator messages: show as "X spectator(s)" with dim styling, no real name
      const specLabel = specCount === 1 ? '1 spectator' : specCount + ' spectators';
      return `<div class="wc-msg wc-msg-spectator">
        <span class="wc-msg-name" style="color:var(--dim);font-style:italic;">&#128065; ${escapeHtml(specLabel)}</span>
        <span class="wc-msg-text" style="color:rgba(255,255,255,.55);">${escapeHtml(m.text)}</span>
      </div>`;
    }
    const isP1 = m.player === 0;
    return `<div class="wc-msg">
      <span class="wc-msg-name" style="color:${isP1?'var(--p1)':'var(--p2)'};">${escapeHtml(m.from)}</span>
      <span class="wc-msg-text">${escapeHtml(m.text)}</span>
    </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

function updateInGameChatBadge() {
  const badge = document.getElementById('ingame-chat-badge');
  if(!badge) return;
  const totalUnread = _inGameChatUnread + _worldChatUnread;
  if(totalUnread > 0) {
    badge.style.display = 'inline-flex';
    badge.textContent = totalUnread > 9 ? '9+' : String(totalUnread);
    badge.classList.add('has-new');
  } else {
    badge.style.display = 'none';
    badge.textContent = '0';
    badge.classList.remove('has-new');
  }
}

function showInGameChatNotice(message) {
  const widget = document.getElementById('ingame-chat-widget');
  if(!widget || !message) return;
  const old = document.getElementById('ingame-chat-notice');
  if(old) old.remove();
  const notice = document.createElement('div');
  notice.id = 'ingame-chat-notice';
  notice.className = 'ingame-chat-notice';
  notice.innerHTML = '<div class="igcn-from">'+escapeHtml(message.from || 'Opponent')+'</div><div class="igcn-text">'+escapeHtml(message.text || '')+'</div>';
  widget.appendChild(notice);
  setTimeout(()=>notice.classList.add('out'), 2100);
  setTimeout(()=>{ if(notice.parentNode) notice.remove(); }, 2550);
}

function fateSetOnlineInGameMessages(messages) {
  const list = Array.isArray(messages) ? messages : [];
  const localUid = window.FATE_ONLINE?.user?.uid || '';
  let newestRemote = null;
  list.forEach(msg => {
    if(msg && msg.id && !_inGameKnownMessageIds.has(msg.id)){
      _inGameKnownMessageIds.add(msg.id);
      if(msg.uid && msg.uid !== localUid) newestRemote = msg;
    }
  });
  _inGameMessages = list;
  if(_inGameChatOpen){
    renderInGameMessages();
  }else if(newestRemote){
    _inGameChatUnread += 1;
    updateInGameChatBadge();
    if(typeof playSfx === 'function') playSfx('menuOpen');
  }
}

function sendInGameChat() {
  const inp = document.getElementById('igc-input');
  if(!inp) return;
  const text = inp.value.trim();
  if(!text) return;
  if(G._onlineRoomCode && typeof window.fateSendRoomChat === 'function') {
    window.fateSendRoomChat(G._onlineRoomCode, text);
    inp.value = '';
    if(typeof playSfx === 'function') playSfx('uiClick');
    return;
  }
  _inGameMessages.push({
    from: G.players[G.currentPlayer]?.name || 'Player',
    player: G.currentPlayer,
    text,
    timestamp: Date.now()
  });
  inp.value = '';
  renderInGameMessages();
  playSfx('uiClick');

  // AI auto-reply if playing vs AI
  if(G.aiEnabled) {
    setTimeout(() => {
      const aiReplies = ['GG','Nice move!','Hmm...','🤔','Interesting...','👊','Good luck!','😎','Well played'];
      _inGameMessages.push({
        from: G.players[G.aiPlayer]?.name || 'AI',
        player: G.aiPlayer,
        text: aiReplies[Math.floor(Math.random()*aiReplies.length)],
        timestamp: Date.now()
      });
      if(_inGameChatOpen) {
        renderInGameMessages();
      } else {
        _inGameChatUnread += 1;
        updateInGameChatBadge();
      }
    }, 1500 + Math.random()*3000);
  }
}

function removeInGameChat() {
  const el = document.getElementById('ingame-chat-widget');
  if(el) el.remove();
  if(typeof scheduleFateCornerDock === 'function') scheduleFateCornerDock();
  _inGameChatOpen = false;
  _inGameMessages = [];
  _inGameChatUnread = 0;
  _inGameKnownMessageIds = new Set();
}

window.toggleInGameChat = toggleInGameChat;
window.switchInGameChatTab = switchInGameChatTab;
window.sendInGameWorldChat = sendInGameWorldChat;
window.sendInGameChat = sendInGameChat;
window.fateSetOnlineInGameMessages = fateSetOnlineInGameMessages;
window.toggleInGameEmoji = toggleInGameEmoji;
window.initInGameChat = initInGameChat;
window.removeInGameChat = removeInGameChat;

// ─── NOTIFICATION POPUP SYSTEM (top-left) ───
let _notifQueue = [];
let _notifShowing = false;

function showNotifPopup(opts) {
  // opts: {username, profileImg, text, duration, size, sfx}
  _notifQueue.push(opts);
  if(!_notifShowing) processNotifQueue();
}

function processNotifQueue() {
  if(_notifQueue.length === 0) { _notifShowing = false; return; }
  _notifShowing = true;
  const opts = _notifQueue.shift();
  const dur = opts.duration || 5000;
  const isLarge = opts.size === 'large';
  if(opts.sfx) playSfx(opts.sfx);

  const el = document.createElement('div');
  el.className = 'notif-popup' + (isLarge ? ' notif-large' : '');
  el.innerHTML = `
    <div class="notif-pic">
      ${opts.profileImg ? `<img src="${opts.profileImg}" style="width:100%;height:100%;object-fit:cover;">` : `<span>${(opts.username||'?').charAt(0).toUpperCase()}</span>`}
    </div>
    <div class="notif-body">
      <div class="notif-user">${escapeHtml(opts.username||'')}</div>
      <div class="notif-text">${escapeHtml(opts.text||'')}</div>
      ${opts.actions ? `<div class="notif-actions">${opts.actions}</div>` : ''}
    </div>`;
  document.body.appendChild(el);

  // Animate in
  requestAnimationFrame(() => el.classList.add('notif-show'));

  setTimeout(() => {
    el.classList.remove('notif-show');
    el.classList.add('notif-hide');
    setTimeout(() => {
      el.remove();
      processNotifQueue();
    }, 400);
  }, dur);
}

// Simulate incoming friend requests periodically
let _fateSimFriendReqInterval = null;
let _fateSimPartyInviteInterval = null;
window._fateStopOfflineSimulations = function(){
  if(_fateSimFriendReqInterval){ clearInterval(_fateSimFriendReqInterval); _fateSimFriendReqInterval = null; }
  if(_fateSimPartyInviteInterval){ clearInterval(_fateSimPartyInviteInterval); _fateSimPartyInviteInterval = null; }
};
function fateOnlineLayerLoaded(){
  const online = window.FateOnline;
  return !!(online && (online.rtdb || online.auth || typeof online.rtdbDisabledMode === 'function' || typeof online.rtdbAvailable === 'function'));
}
function simulateIncomingFriendRequests() {
  if(_fateSimFriendReqInterval) return;
  // Skip entirely if the online layer is loaded — these simulations are pure
  // overhead for online users and were leaking forever even though the inner
  // body early-returns when signed in.
  if(fateOnlineLayerLoaded()) return;
  _fateSimFriendReqInterval = setInterval(() => {
    if(fateOnlineLayerLoaded() || window.FATE_ONLINE?.user){
      // User came online after sim started — shut it down for good
      window._fateStopOfflineSimulations();
      return;
    }
    if(document.hidden || document.getElementById('s-game')?.classList.contains('active')) return;
    if(Math.random() > 0.15) return; // 15% chance each cycle
    const senders = SIMULATED_ONLINE_PLAYERS.filter(p =>
      p.status === 'online' &&
      !SOCIAL.friends.some(f=>f.username===p.username) &&
      !(SOCIAL.pendingIncoming||[]).some(r=>r.username===p.username)
    );
    if(senders.length === 0) return;
    const sender = senders[Math.floor(Math.random() * senders.length)];
    if(!SOCIAL.pendingIncoming) SOCIAL.pendingIncoming = [];
    SOCIAL.pendingIncoming.push({
      username: sender.username,
      profileImg: sender.profileImg || null,
      elo: sender.elo || 600,
      sentAt: Date.now()
    });
    saveSocial();
    updatePendingBadge();
    showNotifPopup({
      username: sender.username,
      profileImg: sender.profileImg,
      text: 'sent you a friend request',
      duration: 5000,
      sfx: 'uiClick'
    });
  }, 20000);
}

// Simulate incoming party invites
function simulatePartyInvites() {
  if(_fateSimPartyInviteInterval) return;
  if(fateOnlineLayerLoaded()) return;
  _fateSimPartyInviteInterval = setInterval(() => {
    if(fateOnlineLayerLoaded() || window.FATE_ONLINE?.user){
      window._fateStopOfflineSimulations();
      return;
    }
    if(document.hidden || document.getElementById('s-game')?.classList.contains('active')) return;
    if(Math.random() > 0.05) return; // 5% chance
    if(SOCIAL.party) return; // Already in a party
    const inviters = SOCIAL.friends.filter(f => f.status === 'online');
    if(inviters.length === 0) return;
    const inviter = inviters[Math.floor(Math.random() * inviters.length)];
    showNotifPopup({
      username: inviter.username,
      profileImg: inviter.profileImg,
      text: 'invited you to a party!',
      duration: 10000,
      size: 'large',
      sfx: 'starPlace',
      actions: `<button class="btn sm pri" onclick='acceptPartyInviteFromNotif(${jsString(inviter.username)});this.closest(".notif-popup").remove();'>Join</button>
                <button class="btn sm" onclick="this.closest('.notif-popup').remove();">Decline</button>`
    });
  }, 30000);
}

window.acceptPartyInviteFromNotif = function(username) {
  if(!SOCIAL.party) {
    createParty();
  }
  inviteToParty(username);
  toast(`Joined party with ${username}!`);
};

function updatePendingBadge() {
  const badge = document.getElementById('pending-friends-badge');
  const onlineCount = Number(window.FATE_ONLINE_PENDING_FRIEND_REQUEST_COUNT || 0) || 0;
  const localCount = (SOCIAL.pendingIncoming||[]).length;
  const count = window.FATE_ONLINE?.user ? onlineCount : localCount;
  if(badge) {
    badge.textContent = '';
    badge.style.display = 'none';
    const btn = badge.closest('button');
    if(btn) {
      btn.classList.toggle('pending-has-requests', count > 0);
      btn.setAttribute('aria-label', count > 0 ? `Pending friend requests: ${count}` : 'Pending friend requests');
    }
  }
}

function showPendingFriends() {
  if(window.FATE_ONLINE?.user && typeof window.showOnlineFriendRequests === 'function') {
    window.showOnlineFriendRequests();
    updatePendingBadge();
    return;
  }
  const pending = SOCIAL.pendingIncoming || [];
  if(pending.length === 0) { toast('No pending friend requests'); return; }
  const body = pending.map(r => `
    <div class="social-friend-row" style="margin-bottom:.4rem;">
      <div class="social-friend-pic">
        ${r.profileImg ? `<img src="${r.profileImg}" style="width:100%;height:100%;object-fit:cover;">` : `<span style="font-size:1rem;color:var(--dim);">${r.username.charAt(0).toUpperCase()}</span>`}
      </div>
      <div class="social-friend-info">
        <div class="social-friend-name">${escapeHtml(r.username)}</div>
        <div class="social-friend-meta">${r.elo} ELO</div>
      </div>
      <div class="social-friend-actions">
        <button class="btn sm pri" onclick='acceptFriendRequest(${jsString(r.username)});closeModal();'>Accept</button>
        <button class="btn sm danger" onclick='declineFriendRequest(${jsString(r.username)});closeModal();'>Decline</button>
      </div>
    </div>`).join('');
  showModal('Pending Friend Requests', body, [{label:'Close', action:closeModal}]);
}
window.showPendingFriends = showPendingFriends;
window.updatePendingBadge = updatePendingBadge;

// Start simulations on load
if(typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    simulateIncomingFriendRequests();
    simulatePartyInvites();
    setTimeout(updatePendingBadge, 500);
  });
}

// ─── MATCH HISTORY ───
function getMatchHistory() {
  try { return JSON.parse(localStorage.getItem('fate_match_history') || '[]'); } catch(e){ return []; }
}
function saveMatchHistory(history) {
  try { localStorage.setItem('fate_match_history', JSON.stringify(history.slice(-75))); } catch(e){}
  if(window.FateCloudSave) window.FateCloudSave.saveMatchHistory();
}
function logMatch(p1, p2, winnerName, p1EloChange, p2EloChange, p1NewElo, p2NewElo, isSimulated) {
  const history = getMatchHistory();
  // Look up profile images
  const p1Lb = LEADERBOARD.find(e=>e.username===p1);
  const p2Lb = LEADERBOARD.find(e=>e.username===p2);
  const aiList = typeof getRandomMatchAIOpponents === 'function' ? getRandomMatchAIOpponents() : AI_OPPONENTS;
  const p1Ai = aiList.find(a=>a.name===p1);
  const p2Ai = aiList.find(a=>a.name===p2);
  const p1Img = p1Lb?.profileImg || p1Ai?.img || null;
  const p2Img = p2Lb?.profileImg || p2Ai?.img || null;
  history.push({
    p1, p2, winner: winnerName,
    p1Change: p1EloChange, p2Change: p2EloChange,
    p1Elo: p1NewElo, p2Elo: p2NewElo,
    p1Img: typeof p1Img==='string'?p1Img:(p1Img?.dataUrl||p1Img?.cardImg||null),
    p2Img: typeof p2Img==='string'?p2Img:(p2Img?.dataUrl||p2Img?.cardImg||null),
    simulated: !!isSimulated,
    timestamp: Date.now()
  });
  saveMatchHistory(history);
}
window.logMatch = logMatch;

let _matchHistPage = 0;
function _fmtMatchTime(ts){
  if(!ts) return '';
  var d = new Date(ts);
  var mon = d.getMonth()+1, day = d.getDate();
  var h = d.getHours(), m = d.getMinutes();
  var ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return mon+'/'+day+' '+h+':'+(m<10?'0':'')+m+ampm;
}
function showMatchHistory(page) {
  const modalAlreadyOpen = !!document.getElementById('modal')?.classList.contains('on');
  if(typeof page === 'number') _matchHistPage = page;
  const history = getMatchHistory().reverse();
  const PER_PAGE = 5;
  const totalPages = Math.max(1, Math.ceil(history.length / PER_PAGE));
  _matchHistPage = Math.max(0, Math.min(_matchHistPage, totalPages - 1));
  const pageItems = history.slice(_matchHistPage * PER_PAGE, (_matchHistPage + 1) * PER_PAGE);

  let html = `<div style="display:flex;gap:.4rem;margin-bottom:.8rem;flex-wrap:wrap;">
    <button class="btn sm" onclick="showLeaderboard()">Rankings</button>
    <button class="btn sm pri" onclick="showMatchHistory()">Recent Matches</button>
    <button class="btn sm" onclick="showDivisionPage()">Divisions</button>
  </div>`;
  if(history.length === 0) {
    html += '<div style="text-align:center;padding:2rem;color:var(--dim);">No matches recorded yet.</div>';
  } else {
    html += '<div style="display:flex;flex-direction:column;gap:.55rem;">';
    pageItems.forEach(function(m){
      var p1Won = m.winner === m.p1;
      var p1Arrow = m.p1Change > 0 ? '▲' : m.p1Change < 0 ? '▼' : '–';
      var p2Arrow = m.p2Change > 0 ? '▲' : m.p2Change < 0 ? '▼' : '–';
      var p1EloColor = m.p1Change > 0 ? '#7fffa0' : m.p1Change < 0 ? '#ff6b6b' : 'var(--dim)';
      var p2EloColor = m.p2Change > 0 ? '#7fffa0' : m.p2Change < 0 ? '#ff6b6b' : 'var(--dim)';
      var p1Img = m.p1Img || null;
      var p2Img = m.p2Img || null;
      var timeStr = _fmtMatchTime(m.timestamp);
      html += '<div style="display:flex;align-items:center;gap:.8rem;padding:.75rem 1rem;border:1px solid var(--border);border-radius:10px;background:rgba(0,0,0,.3);">'
        // P1
        + '<div style="width:46px;height:46px;border-radius:10px;overflow:hidden;background:#0a0a0f;flex-shrink:0;display:flex;align-items:center;justify-content:center;border:1.5px solid '+(p1Won?'#7fffa050':'#ff6b6b40')+'">'
        + (p1Img?'<img src="'+p1Img+'" style="width:100%;height:100%;object-fit:cover;">':'<span style="font-size:.85rem;color:var(--dim);">'+(m.p1||'?').charAt(0)+'</span>')
        + '</div>'
        + '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:.15rem;">'
        + '<div style="display:flex;align-items:baseline;gap:.35rem;min-width:0;">'
        + '<span style="font-family:Cinzel,serif;font-size:.92rem;color:'+(p1Won?'#7fffa0':'#ff6b6b')+';font-weight:'+(p1Won?'700':'600')+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:clamp(80px,12vw,180px);">'+escapeHtml(m.p1)+(p1Won?' ★':'')+'</span>'
        + '<span class="match-history-elo-change" style="font-family:Cinzel,serif;font-size:.72rem;line-height:1;color:'+p1EloColor+';font-weight:800;flex-shrink:0;text-shadow:0 0 8px rgba(0,0,0,.6);">'+p1Arrow+Math.abs(m.p1Change||0)+'</span>'
        + '<span style="font-family:Cinzel,serif;font-size:1.05rem;color:#5fb5ff;font-weight:900;line-height:1;flex-shrink:0;margin-left:.42rem;">'+m.p1Elo+'</span>'
        + '</div>'
        + '</div>'
        // VS
        + '<div style="font-family:Cinzel,serif;font-size:1.1rem;color:var(--gold);letter-spacing:.08em;flex-shrink:0;font-weight:700;padding:0 .35rem;">VS</div>'
        // P2
        + '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:.15rem;align-items:flex-end;">'
        + '<div style="display:flex;align-items:baseline;gap:.35rem;flex-direction:row-reverse;min-width:0;">'
        + '<span style="font-family:Cinzel,serif;font-size:.92rem;color:'+(!p1Won?'#7fffa0':'#ff6b6b')+';font-weight:'+(!p1Won?'700':'600')+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:clamp(80px,12vw,180px);">'+escapeHtml(m.p2)+(!p1Won?' ★':'')+'</span>'
        + '<span class="match-history-elo-change" style="font-family:Cinzel,serif;font-size:.72rem;line-height:1;color:'+p2EloColor+';font-weight:800;flex-shrink:0;text-shadow:0 0 8px rgba(0,0,0,.6);">'+p2Arrow+Math.abs(m.p2Change||0)+'</span>'
        + '<span style="font-family:Cinzel,serif;font-size:1.05rem;color:#5fb5ff;font-weight:900;line-height:1;flex-shrink:0;margin-right:.42rem;">'+m.p2Elo+'</span>'
        + '</div>'
        + '</div>'
        + '<div style="width:46px;height:46px;border-radius:10px;overflow:hidden;background:#0a0a0f;flex-shrink:0;display:flex;align-items:center;justify-content:center;border:1.5px solid '+(!p1Won?'#7fffa050':'#ff6b6b40')+'">'
        + (p2Img?'<img src="'+p2Img+'" style="width:100%;height:100%;object-fit:cover;">':'<span style="font-size:.85rem;color:var(--dim);">'+(m.p2||'?').charAt(0)+'</span>')
        + '</div>'
        // Timestamp + simulated tag
        + '<div style="flex-shrink:0;text-align:right;min-width:58px;">'
        + (m.simulated?'<div style="font-size:.5rem;color:rgba(255,255,255,.25);letter-spacing:.06em;">SIM</div>':'')
        + '<div style="font-size:.55rem;color:rgba(255,255,255,.3);">'+timeStr+'</div>'
        + '</div>'
        + '</div>';
    });
    html += '</div>';
    html += `<div style="display:flex;justify-content:center;align-items:center;gap:.8rem;margin-top:.8rem;">
      <button class="btn sm" onclick="showMatchHistory(${_matchHistPage-1})" ${_matchHistPage<=0?'disabled':''}>◀ Prev</button>
      <span style="font-family:Cinzel,serif;font-size:.7rem;color:var(--dim);">Page ${_matchHistPage+1} / ${totalPages}</span>
      <button class="btn sm" onclick="showMatchHistory(${_matchHistPage+1})" ${_matchHistPage>=totalPages-1?'disabled':''}>Next ▶</button>
    </div>`;
  }
  showModal('Recent Matches', html, [{label:'Close', action:closeModal}], {silentOpen:!!document.getElementById('modal')?.classList.contains('on')});
  const matchModal = document.querySelector('#modal .modal');
  if(matchModal) matchModal.classList.add('recent-matches-modal');
}
window.showMatchHistory = showMatchHistory;

// ─── DIVISION PAGE ───
const DIVISION_DESCRIPTIONS = {
  'Footman': 'New recruits learning the basics of fate and strategy. Every journey begins here.',
  'Captain-Officer': 'Competent strategists who understand zone control and supporter placement.',
  'Lieutenant at Arms': 'Skilled tacticians who can read the board and plan consolidations effectively.',
  'Sergeant of the Guard': 'Elite players who combine deck synergy with precise timing and positioning.',
  'Commander-General': 'Masters of the game who dominate through disruption, denial, and superior strategy.',
  'High Marshall': 'The pinnacle of competitive play. Legends who shape the meta itself.'
};

let _divisionPageIdx = 0;
let _divisionMemberPageIdx = 0;
function showDivisionPage(page, memberPage) {
  const modalAlreadyOpen = !!document.getElementById('modal')?.classList.contains('on');
  if(typeof page === 'number'){
    if(page !== _divisionPageIdx) _divisionMemberPageIdx = 0;
    _divisionPageIdx = page;
  }
  const reversedRanks = [...RANKS].reverse();
  _divisionPageIdx = Math.max(0, Math.min(_divisionPageIdx, reversedRanks.length - 1));
  const rank = reversedRanks[_divisionPageIdx];
  const desc = DIVISION_DESCRIPTIONS[rank.name] || '';
  const divisionSource = typeof getMergedChallengerLeaderboardEntries === 'function' ? getMergedChallengerLeaderboardEntries() : LEADERBOARD;
  const members = divisionSource.filter(e => getRank(e.elo).name === rank.name).sort((a,b) => b.elo - a.elo);
  const memberPageSize = 8;
  const memberPages = Math.max(1, Math.ceil(members.length / memberPageSize));
  if(typeof memberPage === 'number') _divisionMemberPageIdx = memberPage;
  _divisionMemberPageIdx = Math.max(0, Math.min(_divisionMemberPageIdx, memberPages - 1));
  const memberStart = _divisionMemberPageIdx * memberPageSize;
  const pageMembers = members.slice(memberStart, memberStart + memberPageSize);
  const myRank = getRank(USER_PROFILE.challengerElo || 600);
  const isMyDiv = myRank.name === rank.name;
  const rankIconId = getRankIconIdByName(rank.name);

  let html = '';

  // Division header with nav
  html += `<div class="division-pro-head" style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:.6rem;">
    <button class="btn sm" onclick="showDivisionPage(${_divisionPageIdx-1})" ${_divisionPageIdx<=0?'disabled':''}>Prev</button>
    <div class="division-pro-rank" style="--division-rank-color:${rank.color};--division-rank-bg:${rank.bg};flex:0 1 344px;text-align:center;padding:.35rem .6rem;border:1px solid ${rank.color}55;border-radius:12px;background:${rank.bg};margin:0 auto;">
      <div style="display:flex;align-items:center;justify-content:center;gap:.4rem;">
        ${rankIconId ? `<img src="rankicons/${rankIconId}.png" style="width:24px;height:24px;object-fit:contain;" onerror="this.style.display='none'">` : `<div style="width:22px;height:22px;">${rank.icon}</div>`}
        <span class="division-pro-rank-name" style="font-family:Cinzel,serif;font-size:1rem;color:${rank.color};font-weight:700;">${rank.name}</span>
        ${isMyDiv?'<span style="font-size:.55rem;color:var(--gold);">★ YOU</span>':''}
      </div>
      <div style="font-size:.62rem;color:var(--dim);margin-top:.05rem;">${rank.minElo}+ ELO · ${members.length} player${members.length!==1?'s':''}</div>
    </div>
    <button class="btn sm" onclick="showDivisionPage(${_divisionPageIdx+1})" ${_divisionPageIdx>=reversedRanks.length-1?'disabled':''}>Next</button>
  </div>`;

  // Description
  html += `<div class="division-pro-desc" style="font-size:.78rem;color:var(--dim);line-height:1.5;margin-bottom:.7rem;text-align:center;font-style:italic;">${desc}</div>`;

  // Member list: fixed eight-slot page so sparse division pages keep the same shape.
  html += '<div class="division-pro-list" style="display:flex;flex-direction:column;gap:.5rem;max-height:45vh;overflow-y:auto;padding-right:.3rem;">';
  for(let i = 0; i < memberPageSize; i++) {
    const entry = pageMembers[i];
    const rowRank = memberStart + i + 1;
    if(entry) {
      const isMe = entry.username === USER_PROFILE.username;
      const imgSrc = (typeof resolveProfileImgSrc === 'function' ? resolveProfileImgSrc(entry.profileImg || entry.photoURL, 'square') : null)
        || (entry.profileImg ? (typeof entry.profileImg==='string'?entry.profileImg:(entry.profileImg.dataUrl||entry.profileImg.cardImg)) : null);
      const imgCrop = getProfileCropStyleForEntry(entry, 'center 22%');
      const wins = getLeaderboardRecordWins(entry);
      const losses = getLeaderboardRecordLosses(entry);
      const wr = wins + losses > 0 ? Math.round(wins * 100 / (wins + losses)) : 0;
      html += `<div class="division-pro-row ${isMe?'is-me':''}" style="display:flex;align-items:center;gap:.8rem;padding:.7rem .9rem;border:1.5px solid ${isMe?'var(--gold)':'var(--border)'};border-radius:10px;background:${isMe?'rgba(201,168,76,.08)':'rgba(0,0,0,.3)'};">
        <div style="width:24px;text-align:center;font-family:Cinzel,serif;font-size:.75rem;color:var(--dim);flex-shrink:0;">#${rowRank}</div>
        <div style="width:52px;height:52px;border-radius:10px;overflow:hidden;background:#0a0a0f;flex-shrink:0;display:flex;align-items:center;justify-content:center;${typeof getRankFrameStyle==='function'?getRankFrameStyle(entry.elo,'icon'):'border:1.5px solid '+rank.color+';'}">
          ${imgSrc?`<img src="${imgSrc}" decoding="async" loading="eager" fetchpriority="high" style="${imgCrop}">`:(entry.isAI?'<span style="font-size:1.3rem;">AI</span>':'<span style="font-size:1.2rem;color:var(--dim);">P</span>')}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;">
            <span style="font-family:Cinzel,serif;font-size:.9rem;color:${isMe?'var(--gold)':'var(--text)'};font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(entry.username)}${isMe?' <span style="font-size:.55rem;color:var(--gold);">(YOU)</span>':''}</span>
            <span style="font-family:Cinzel,serif;font-size:.6rem;color:${rank.color};background:${rank.bg};padding:.12rem .4rem;border-radius:999px;border:1px solid ${rank.color}40;">${entry.elo} ELO</span>
          </div>
          <div style="font-size:.72rem;color:var(--dim);margin-top:.2rem;">${getRank(entry.elo).name}</div>
        </div>
        <div class="division-record" style="text-align:right;flex:0 0 118px;font-family:Cinzel,serif;">
          <div style="font-size:.8rem;color:var(--dim);">${wins}W / ${losses}L</div>
          <div style="font-size:.68rem;color:${rank.color};margin-top:.12rem;">${wr}% WR</div>
        </div>
      </div>`;
    } else {
      html += `<div class="division-pro-row is-empty" style="display:flex;align-items:center;gap:.8rem;padding:.7rem .9rem;border:1.5px solid var(--border);border-radius:10px;background:rgba(0,0,0,.3);">
        <div style="width:24px;text-align:center;font-family:Cinzel,serif;font-size:.75rem;color:var(--dim);flex-shrink:0;">#${rowRank}</div>
        <div class="division-empty-avatar" style="width:52px;height:52px;border-radius:10px;overflow:hidden;background:#0a0a0f;flex-shrink:0;display:flex;align-items:center;justify-content:center;border:1.5px solid ${rank.color}35;">
          <img src="blank.png" style="width:100%;height:100%;object-fit:cover;opacity:.45;" onerror="this.style.display='none'">
        </div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;">
            <span style="font-family:Cinzel,serif;font-size:.9rem;color:var(--dim);font-weight:700;">Open Seat</span>
            <span style="font-family:Cinzel,serif;font-size:.6rem;color:${rank.color};background:${rank.bg};padding:.12rem .4rem;border-radius:999px;border:1px solid ${rank.color}30;">0 ELO</span>
          </div>
          <div style="font-size:.72rem;color:var(--dim);margin-top:.2rem;">${rank.name}</div>
        </div>
        <div class="division-record" style="text-align:right;flex:0 0 118px;font-family:Cinzel,serif;">
          <div style="font-size:.8rem;color:var(--dim);">0W / 0L</div>
          <div style="font-size:.68rem;color:${rank.color};margin-top:.12rem;">0% WR</div>
        </div>
      </div>`;
    }
  }
  html += '</div>';
  html += `<div class="division-member-footer" style="display:flex;align-items:center;justify-content:flex-start;gap:.55rem;margin-top:.65rem;">
    <button class="btn sm" onclick="showDivisionPage(${_divisionPageIdx}, ${_divisionMemberPageIdx-1})" ${_divisionMemberPageIdx<=0?'disabled':''}>Prev Members</button>
    <button class="btn sm" onclick="showDivisionPage(${_divisionPageIdx}, ${_divisionMemberPageIdx+1})" ${_divisionMemberPageIdx>=memberPages-1?'disabled':''}>Next Members</button>
    <div class="division-member-page-copy" style="font-family:Cinzel,serif;color:var(--dim);font-size:.68rem;letter-spacing:.08em;margin-left:.25rem;">Members ${members.length ? memberStart + 1 : 0}-${Math.min(memberStart + memberPageSize, members.length)} / ${members.length} · Page ${_divisionMemberPageIdx + 1} / ${memberPages}</div>
  </div>`;

  const titleHtml = `<div style="display:flex;align-items:center;justify-content:space-between;width:100%;">
    <span>ELO Divisions</span>
    <div style="display:flex;gap:.35rem;">
      <button class="btn sm" onclick="showLeaderboard()" style="font-size:.6rem;padding:.2rem .5rem;">Rankings</button>
      <button class="btn sm" onclick="showMatchHistory()" style="font-size:.6rem;padding:.2rem .5rem;">Matches</button>
      <button class="btn sm pri" onclick="showDivisionPage()" style="font-size:.6rem;padding:.2rem .5rem;">Divisions</button>
    </div>
  </div>`;
  showModal(titleHtml, `<div class="division-pro-shell">${html}</div>`, [{label:'Close', action:closeModal}], {silentOpen:!!document.getElementById('modal')?.classList.contains('on')});
  const divisionModal = document.querySelector('#modal .modal');
  if(divisionModal) divisionModal.classList.add('division-pro-modal');
}
window.showDivisionPage = showDivisionPage;

// ─── DIVISION REWARDS (first-time achievement) ───
function checkDivisionReward(elo) {
  const rank = getRank(elo);
  if(!USER_PROFILE._achievedDivisions) USER_PROFILE._achievedDivisions = [];
  if(USER_PROFILE._achievedDivisions.includes(rank.name)) return;
  if(rank.name === 'Footman') return; // No reward for starting division
  USER_PROFILE._achievedDivisions.push(rank.name);
  USER_PROFILE.starlight = (USER_PROFILE.starlight || 0) + 500;
  USER_PROFILE.unopenedFavoredPacks = (USER_PROFILE.unopenedFavoredPacks || 0) + 1;
  saveProfile();
  toast(`New division: ${rank.name}! +500 Starlight + 1 Favored Pack`, 4200);
  playSfx('starPlace');
}
window.checkDivisionReward = checkDivisionReward;


// ═══════════════════════════════════════════════════════════════
//  DAILY CHALLENGES
// ═══════════════════════════════════════════════════════════════
const DAILY_CHALLENGE_POOL = [
  { id:'win_any',       label:'First Victory',         desc:'Win any match.',                          target:1,  key:'wins',       reward:{starlight:25},  icon:'⚔️' },
  { id:'win_3',         label:'Hat Trick',             desc:'Win 3 matches.',                          target:3,  key:'wins',       reward:{starlight:60}, icon:'🎯' },
  { id:'win_5',         label:'Warpath',               desc:'Win 5 matches.',                          target:5,  key:'wins',       reward:{starlight:100}, icon:'🗡️' },
  { id:'place_10',      label:'Field Commander',       desc:'Place 10 cards in one match.',            target:10, key:'cardsPlaced',reward:{starlight:30},  icon:'🃏' },
  { id:'place_20',      label:'Full Deployment',       desc:'Place 20 cards total.',                   target:20, key:'cardsPlaced',reward:{starlight:45},  icon:'📋' },
  { id:'consolidate_1', label:'Power Play',            desc:'Consolidate once.',                       target:1,  key:'consolidations',reward:{starlight:20},icon:'⚡' },
  { id:'consolidate_3', label:'Chain Reaction',        desc:'Consolidate 3 times.',                    target:3,  key:'consolidations',reward:{starlight:50},icon:'🔗' },
  { id:'zone_sweep',    label:'Domination',            desc:'Win all 3 zones in one match.',           target:3,  key:'zonesWon',   reward:{starlight:75}, icon:'🏆' },
  { id:'use_effect_1',  label:'Spark',                 desc:'Activate a card effect.',                 target:1,  key:'effects',    reward:{starlight:15},  icon:'✨' },
  { id:'use_effect_5',  label:'Tactician',             desc:'Activate 5 effects.',                     target:5,  key:'effects',    reward:{starlight:40},  icon:'🔮' },
  { id:'use_effect_10', label:'Mastermind',            desc:'Activate 10 effects.',                    target:10, key:'effects',    reward:{starlight:70}, icon:'🧠' },
  { id:'play_match',    label:'Ready for Duty',        desc:'Complete a match.',                       target:1,  key:'matches',    reward:{starlight:15},  icon:'🎮' },
  { id:'play_3',        label:'Marathon',              desc:'Complete 3 matches.',                     target:3,  key:'matches',    reward:{starlight:35},  icon:'🏃' },
  { id:'play_5',        label:'Iron Will',             desc:'Complete 5 matches.',                     target:5,  key:'matches',    reward:{starlight:55}, icon:'💎' },
  { id:'supporter_5',   label:'Supply Line',           desc:'Place 5 supporters.',                     target:5,  key:'supporters', reward:{starlight:25},  icon:'🛡️' },
  { id:'supporter_10',  label:'Army Builder',          desc:'Place 10 supporters.',                    target:10, key:'supporters', reward:{starlight:45},  icon:'🏰' },
  { id:'char_3',        label:'Summon the Heroes',     desc:'Place 3 characters.',                     target:3,  key:'characters', reward:{starlight:35},  icon:'👑' },
  { id:'char_5',        label:'Council of War',        desc:'Place 5 characters.',                     target:5,  key:'characters', reward:{starlight:55}, icon:'⭐' },
  { id:'star_place',    label:'Star Power',            desc:'Place a star-rarity card.',                target:1,  key:'starPlaced', reward:{starlight:40},  icon:'🌟' },
  { id:'square_place',  label:'Rare Find',             desc:'Place 2 square-rarity cards.',             target:2,  key:'squarePlaced',reward:{starlight:30}, icon:'🟪' },
  { id:'open_pack',     label:'Collector',             desc:'Open a booster pack.',                     target:1,  key:'packsOpened',reward:{starlight:20},  icon:'🎁' },
  { id:'open_3_packs',  label:'Unboxing Spree',        desc:'Open 3 booster packs.',                   target:3,  key:'packsOpened',reward:{starlight:50}, icon:'📦' },
  { id:'zone_control_2',label:'Strategist',            desc:'Control 2 zones at once.',                 target:2,  key:'zonesControlled',reward:{starlight:30},icon:'🗺️' },
  { id:'first_blood',   label:'First Blood',           desc:'Win the first zone scored.',               target:1,  key:'firstZone',  reward:{starlight:22},  icon:'🩸' },
  { id:'play_eventide', label:'Eventide Rising',       desc:'Place 3 Eventide cards.',                  target:3,  key:'affEventide',reward:{starlight:27},  icon:'🌙' },
  { id:'play_war',      label:'To Arms!',              desc:'Place 3 Third Great War cards.',            target:3,  key:'affWar',     reward:{starlight:27},  icon:'⚔️' },
  { id:'play_expanded', label:'New Horizons',          desc:'Place 3 Expanded Worlds cards.',            target:3,  key:'affExpanded',reward:{starlight:27},  icon:'🌍' },
  { id:'play_reality',  label:'Face the Truth',        desc:'Place 3 Reality cards.',                    target:3,  key:'affReality', reward:{starlight:27},  icon:'👁️' },
  { id:'earn_xp',       label:'Growth Spurt',          desc:'Earn 50 XP.',                              target:50, key:'xpEarned',   reward:{starlight:30},  icon:'📈' },
  { id:'earn_100xp',    label:'Level Grind',           desc:'Earn 100 XP.',                             target:100,key:'xpEarned',   reward:{starlight:55}, icon:'📊' },
  { id:'earn_starlight',label:'Shining Bright',        desc:'Earn 100 Starlight total.',                 target:100,key:'starlightEarned',reward:{starlight:25},icon:'💰' },
  { id:'deck_build',    label:'Architect',             desc:'Save a deck in the deck builder.',          target:1,  key:'decksSaved', reward:{starlight:20},  icon:'🔧' },
  { id:'close_zone',    label:'Nail Biter',            desc:'Win a zone by 2 or fewer fate.',            target:1,  key:'closeZone',  reward:{starlight:35},  icon:'😰' },
  { id:'win_fast',      label:'Blitz',                 desc:'Win a match in 6 turns or fewer.',          target:1,  key:'fastWin',    reward:{starlight:60}, icon:'⏱️' },
  { id:'play_variety',  label:'Diverse Arsenal',       desc:'Place cards from 3 different affiliations.', target:3, key:'affVariety', reward:{starlight:32},  icon:'🎨' },
  { id:'triad_advance', label:'Triangle Advance',      desc:'Place 5 triangle-rarity cards.',            target:5,  key:'trianglePlaced',reward:{starlight:36},icon:'△' },
  { id:'circle_line',   label:'Circle Line',           desc:'Place 6 circle-rarity cards.',              target:6,  key:'circlePlaced',reward:{starlight:30}, icon:'○' },
  { id:'hold_safe_row', label:'Hold the Line',          desc:'Place 5 cards in your safe rows.',          target:5,  key:'safePlaced', reward:{starlight:34},  icon:'▣' },
  { id:'contest_mid',   label:'Contest the Center',     desc:'Place 3 cards in contested rows.',          target:3,  key:'contestedPlaced',reward:{starlight:34},icon:'◇' },
  { id:'heavy_hitters', label:'Heavy Hitters',          desc:'Place 3 cards with 7 or more Fate.',        target:3,  key:'highFatePlaced',reward:{starlight:42},icon:'◆' },
  { id:'cheap_orders',  label:'Efficient Orders',       desc:'Place 4 cards that cost 1 or less.',        target:4,  key:'lowCostPlaced',reward:{starlight:32},icon:'1' },
  { id:'effect_support',label:'Support Network',        desc:'Activate 2 supporter effects.',             target:2,  key:'supporterEffects',reward:{starlight:38},icon:'S' },
  { id:'zone_pair_win', label:'Two-Front Victory',      desc:'Win exactly 2 zones in a match.',           target:1,  key:'twoZoneWins',reward:{starlight:40}, icon:'2' },
  { id:'fate_total_25', label:'Fate Overflow',          desc:'Finish a match with 25 total Fate.',        target:25, key:'totalFateBest',reward:{starlight:45},icon:'25' },
  { id:'open_favored',  label:'Favored Reveal',         desc:'Open a Favored pack.',                      target:1,  key:'favoredPacksOpened',reward:{starlight:35},icon:'★' },
];

function getDailyChallengeDate() {
  var d = new Date();
  return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
}

function getDailyChallenges() {
  var today = getDailyChallengeDate();
  var stored = null;
  try { stored = JSON.parse(localStorage.getItem('fate_daily_challenges') || 'null'); } catch(e){}
  if(stored && stored.date === today) return stored;
  // Generate new daily set: pick 3 challenges seeded by date
  var seed = parseInt(today.replace(/-/g,''), 10);
  var pool = DAILY_CHALLENGE_POOL.slice();
  // Simple seeded shuffle
  for(var i = pool.length-1; i > 0; i--){
    var j = (seed * (i+7) + 13) % (i+1);
    var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    seed = (seed * 1664525 + 1013904223) >>> 0;
  }
  var challenges = pool.slice(0,3).map(function(c){ return {id:c.id, progress:0, completed:false}; });
  var fresh = { date:today, challenges:challenges };
  try { localStorage.setItem('fate_daily_challenges', JSON.stringify(fresh)); } catch(e){}
  return fresh;
}

function getDailyChallengeProgress(key) {
  try { return JSON.parse(localStorage.getItem('fate_daily_progress_' + getDailyChallengeDate()) || '{}'); } catch(e){ return {}; }
}

function updateDailyChallengeProgress(key, value, mode) {
  // mode: 'add' | 'max' | 'set'
  var today = getDailyChallengeDate();
  var prog = getDailyChallengeProgress();
  if(mode === 'add') prog[key] = (prog[key] || 0) + value;
  else if(mode === 'max') prog[key] = Math.max(prog[key] || 0, value);
  else prog[key] = value;
  try { localStorage.setItem('fate_daily_progress_' + today, JSON.stringify(prog)); } catch(e){}
  if(window.FateCloudSave) window.FateCloudSave.saveDailyChallenges();
  // Check completions
  var daily = getDailyChallenges();
  var changed = false;
  daily.challenges.forEach(function(ch){
    if(ch.completed) return;
    var def = DAILY_CHALLENGE_POOL.find(function(c){ return c.id === ch.id; });
    if(!def) return;
    var curProg = prog[def.key] || 0;
    if(curProg >= def.target){
      ch.completed = true;
      changed = true;
      // Award reward
      if(def.reward.starlight){
        USER_PROFILE.starlight = (USER_PROFILE.starlight || 0) + def.reward.starlight;
        if(def.key !== 'starlightEarned'){
          prog.starlightEarned = (prog.starlightEarned || 0) + def.reward.starlight;
          try { localStorage.setItem('fate_daily_progress_' + today, JSON.stringify(prog)); } catch(e){}
        }
        if(typeof saveProfile === 'function') saveProfile();
        if(typeof playSfx === 'function') playSfx('starPlace');
        showDailyChallengeNotification(def.label, def.reward.starlight, def.icon);
      }
    }
  });
  if(changed){
    try { localStorage.setItem('fate_daily_challenges', JSON.stringify(daily)); } catch(e){}
    // Check if ALL 3 challenges are now complete — award bonus
    var allDone = daily.challenges.every(function(ch){ return ch.completed; });
    var bonusKey = 'fate_daily_bonus_' + today;
    if(allDone && !localStorage.getItem(bonusKey)){
      localStorage.setItem(bonusKey, '1');
      USER_PROFILE.starlight = (USER_PROFILE.starlight || 0) + 50;
      USER_PROFILE.dailyMissionBonusClaims = (USER_PROFILE.dailyMissionBonusClaims || 0) + 1;
      localStorage.setItem('fate_daily_bonus_claims_total', String(USER_PROFILE.dailyMissionBonusClaims));
      prog.starlightEarned = (prog.starlightEarned || 0) + 50;
      try { localStorage.setItem('fate_daily_progress_' + today, JSON.stringify(prog)); } catch(e){}
      if(typeof saveProfile === 'function') saveProfile();
      setTimeout(function(){
        showDailyChallengeNotification('All Missions Complete!', 50, '🏆');
        if(typeof playSfx === 'function') playSfx('starPlace');
      }, 1800);
    }
  }
  // Refresh panel if visible
  if(document.getElementById('daily-challenges-panel')) renderDailyChallengesPanel();
  if(document.getElementById('mission-control-window')?.classList.contains('on') && typeof renderMissionDaily === 'function') renderMissionDaily();
}

function trackDailyCardPlacement(inst, z, r, c) {
  if(typeof updateDailyChallengeProgress !== 'function' || !inst) return;
  if(typeof G !== 'undefined' && G){
    if(G._isSpectator) return;
    if(G.aiEnabled && G.currentPlayer === G.aiPlayer) return;
  }
  updateDailyChallengeProgress('cardsPlaced', 1, 'add');
  if(inst.type === 'Supporter') updateDailyChallengeProgress('supporters', 1, 'add');
  else updateDailyChallengeProgress('characters', 1, 'add');
  var rarity = String(inst.rarity || '').toLowerCase();
  if(rarity === 'star') updateDailyChallengeProgress('starPlaced', 1, 'add');
  if(rarity === 'square') updateDailyChallengeProgress('squarePlaced', 1, 'add');
  if(rarity === 'triangle') updateDailyChallengeProgress('trianglePlaced', 1, 'add');
  if(rarity === 'circle') updateDailyChallengeProgress('circlePlaced', 1, 'add');
  if(r === 1) updateDailyChallengeProgress('contestedPlaced', 1, 'add');
  if(r !== 1) updateDailyChallengeProgress('safePlaced', 1, 'add');
  if(Number(inst.currentFate || inst.fate || 0) >= 7) updateDailyChallengeProgress('highFatePlaced', 1, 'add');
  if(Number(inst.cost || 0) <= 1) updateDailyChallengeProgress('lowCostPlaced', 1, 'add');
  var aff = String(inst.aff || '');
  var affKey = {eventide:'affEventide', third_great_war:'affWar', expanded_worlds:'affExpanded', reality:'affReality'}[aff];
  if(affKey) updateDailyChallengeProgress(affKey, 1, 'add');
  if(aff){
    var date = typeof getDailyChallengeDate === 'function' ? getDailyChallengeDate() : '';
    var setKey = 'fate_daily_aff_variety_' + date;
    var affs = [];
    try { affs = JSON.parse(localStorage.getItem(setKey) || '[]'); } catch(e){}
    if(!affs.includes(aff)){
      affs.push(aff);
      try { localStorage.setItem(setKey, JSON.stringify(affs)); } catch(e){}
    }
    updateDailyChallengeProgress('affVariety', affs.length, 'max');
  }
  if(typeof getZoneScore === 'function' && typeof G !== 'undefined' && G){
    var controlled = 0;
    for(var zi=0; zi<3; zi++){
      var sMe = getZoneScore(zi, G.currentPlayer);
      var sOpp = getZoneScore(zi, 1 - G.currentPlayer);
      if(sMe > sOpp) controlled++;
    }
    updateDailyChallengeProgress('zonesControlled', controlled, 'max');
  }
}

window.trackDailyCardPlacement = trackDailyCardPlacement;

function showDailyChallengeNotification(label, starlight, icon) {
  var note = document.createElement('div');
  note.className = 'dc-completion-notify';
  note.innerHTML = '<div class="dc-cn-icon">'+(icon||'⭐')+'</div>'
    + '<div class="dc-cn-body">'
    + '<div class="dc-cn-title">Mission Complete</div>'
    + '<div class="dc-cn-label">'+String(label)+'</div>'
    + '<div class="dc-cn-reward">+'+starlight+' Starlight ★</div>'
    + '</div>';
  document.body.appendChild(note);
  requestAnimationFrame(function(){ requestAnimationFrame(function(){ note.classList.add('dc-cn-show'); }); });
  setTimeout(function(){ note.classList.remove('dc-cn-show'); note.classList.add('dc-cn-hide'); }, 4200);
  setTimeout(function(){ note.remove(); }, 4900);
}

function renderDailyChallengesPanel() {
  var el = document.getElementById('daily-challenges-panel');
  if(!el) return;
  var daily = getDailyChallenges();
  var prog = getDailyChallengeProgress();
  var today = getDailyChallengeDate();
  var doneCount = daily.challenges.filter(function(ch){ return ch.completed; }).length;
  var html = '<div class="dc-header">'
    + '<div class="dc-header-left"><span class="dc-title">Daily Missions</span><span class="dc-date">' + today.slice(5).replace('-','/') + '</span></div>'
    + '<div class="dc-header-progress">' + doneCount + '/3</div>'
    + '</div><div class="dc-list">';
  daily.challenges.forEach(function(ch, idx){
    var def = DAILY_CHALLENGE_POOL.find(function(c){ return c.id === ch.id; });
    if(!def) return;
    var cur = Math.min(prog[def.key] || 0, def.target);
    var pct = Math.round((cur / def.target) * 100);
    var done = ch.completed;
    html += '<div class="dc-item' + (done ? ' dc-done' : '') + '">'
      + '<div class="dc-item-icon-wrap"><span class="dc-icon">' + def.icon + '</span></div>'
      + '<div class="dc-item-center">'
      + '<div class="dc-item-label">' + def.label + '</div>'
      + '<div class="dc-item-desc">' + def.desc + '</div>'
      + '<div class="dc-bar-wrap"><div class="dc-bar" style="width:' + pct + '%"></div><span class="dc-bar-text">' + (done ? '✓ Complete' : cur + '/' + def.target) + '</span></div>'
      + '</div>'
      + '<div class="dc-reward-badge">+' + def.reward.starlight + ' ★</div>'
      + '</div>';
  });
  // All-missions bonus row
  var allDone = doneCount >= 3;
  var bonusClaimed = !!localStorage.getItem('fate_daily_bonus_' + today);
  html += '<div class="dc-item dc-bonus-row' + (allDone ? ' dc-done' : '') + '" style="border-color:rgba(255,215,0,.2)!important;background:linear-gradient(135deg,rgba(255,215,0,.04),rgba(255,215,0,.01))!important;margin-top:.15rem;">'
    + '<div class="dc-item-icon-wrap" style="background:rgba(255,215,0,.1)!important;border-color:rgba(255,215,0,.25)!important;"><span class="dc-icon">🏆</span></div>'
    + '<div class="dc-item-center">'
    + '<div class="dc-item-label" style="color:#ffd700!important;">Complete All Missions</div>'
    + '<div class="dc-item-desc">Finish all 3 daily missions for a bonus</div>'
    + '<div class="dc-bar-wrap"><div class="dc-bar" style="width:' + Math.round((doneCount/3)*100) + '%;background:linear-gradient(90deg,rgba(255,215,0,.7),rgba(255,215,0,.4))!important;"></div><span class="dc-bar-text">' + (bonusClaimed ? '✓ Claimed' : doneCount + '/3') + '</span></div>'
    + '</div>'
    + '<div class="dc-reward-badge" style="color:#ffd700!important;border-color:rgba(255,215,0,.3)!important;">+50 ★</div>'
    + '</div>';
  html += '</div>';
  el.innerHTML = html;
}

window.getDailyChallenges = getDailyChallenges;
window.updateDailyChallengeProgress = updateDailyChallengeProgress;
window.renderDailyChallengesPanel = renderDailyChallengesPanel;


// ═══════════════════════════════════════════════════════════════
//  MATCH SUMMARY
// ═══════════════════════════════════════════════════════════════
