//  AI PLAYER (Smart Strategy)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Strategy:
//  1. Analyze zone control — identify which 2 zones to fight for
//  2. Prioritize supporters with good effects (draw, discard opp, etc.)
//  3. Place supporters strategically to prepare for consolidation
//  4. Consolidate high-value characters into contested/losing zones
//  5. Activate effects intelligently
//  6. Don't waste resources on zones already dominated

// ─── ZONE SCORE CACHE ───
// Avoids redundant getZoneScore() calls during evaluation (board doesn't change mid-eval).
let _aiZoneScoreCache = null;
function aiCachedZoneScore(z, p) {
  if (!_aiZoneScoreCache) return getZoneScore(z, p);
  const key = z * 2 + p;
  if (_aiZoneScoreCache[key] !== undefined) return _aiZoneScoreCache[key];
  const val = getZoneScore(z, p);
  _aiZoneScoreCache[key] = val;
  return val;
}
function aiClearZoneScoreCache() { _aiZoneScoreCache = [undefined,undefined,undefined,undefined,undefined,undefined]; }
function aiInvalidateZoneScoreCache() { _aiZoneScoreCache = null; }

async function runAITurn() {
  if(G.currentPlayer !== G.aiPlayer) return;
  if(G._aiRunning) return;
  if(typeof _tutorialActive !== 'undefined' && _tutorialActive && typeof runTutorialAITurn === 'function') {
    await runTutorialAITurn();
    return;
  }
  const aiTurnToken = (G._aiTurnToken || 0) + 1;
  G._aiTurnToken = aiTurnToken;
  const aiTurnNumber = G.turn;
  G._aiRunning = true;
  G._aiAborted = false;
  log('p2','AI thinking...');

    try {
      const settings = getAIDifficultySettings();
    const thinkTime = G.aiDifficulty==='extreme'?280:G.aiDifficulty==='hard'?240:G.aiDifficulty==='easy'?380:320;
    let actionsThisTurn = 0;
    const maxActions = 15;

      while(actionsThisTurn < maxActions){
      if(G._aiAborted || G._aiAbort) { G._aiRunning = false; return; }
      if(G.currentPlayer !== G.aiPlayer || G.turn !== aiTurnNumber || G._aiTurnToken !== aiTurnToken) { G._aiRunning = false; return; }
      actionsThisTurn++;
      await aiSleep(Math.max(thinkTime, AI_VISUAL_PAUSE_THINK));
      if(G._aiAborted || G._aiAbort) { G._aiRunning = false; return; }
      if(G.currentPlayer !== G.aiPlayer || G.turn !== aiTurnNumber || G._aiTurnToken !== aiTurnToken) { G._aiRunning = false; return; }
      const hand = G.players[G.aiPlayer].hand;
      const polishUses = Array.isArray(G.polishArmyUses) ? (G.polishArmyUses[G.aiPlayer] || 0) : 0;
      const canSetPolishFromDeck = G.players[G.aiPlayer].deck.some(c=>c.id==='28') && !G._polishUsedThisTurn && polishUses < 2;
      const canSetMajaFromDeck = G.players[G.aiPlayer].deck.some(c=>c.id==='07');
      if(hand.length===0 && !canSetPolishFromDeck && !canSetMajaFromDeck) break;

      // Generate all legal moves
      const moves = aiGenerateAllMoves();
      if(moves.length===0) break;

      aiClearZoneScoreCache();
      const choice = await aiChooseMoveWithMCTS(moves, settings, {
        turnToken: aiTurnToken,
        turnNumber: aiTurnNumber
      });
      const bestMove = choice ? choice.move : null;
      const bestScore = choice ? choice.score : -Infinity;
      if(!bestMove) break;
      // Only skip if score is catastrophically bad AND we've already placed at least one card
      if(bestScore < -200 && actionsThisTurn > 1) break;

      aiInvalidateZoneScoreCache();

      // Execute the best move
      if(G.currentPlayer !== G.aiPlayer || G.turn !== aiTurnNumber || G._aiTurnToken !== aiTurnToken) { G._aiRunning = false; return; }
      if(bestMove.type==='place') await aiDoPlace(bestMove);
      else if(bestMove.type==='consolidate') await aiDoConsolidate(bestMove);
      else break;
      }

      if(G.currentPlayer !== G.aiPlayer || G.turn !== aiTurnNumber || G._aiTurnToken !== aiTurnToken) { G._aiRunning = false; return; }
      await aiActivateEffects();
      await aiSleep(AI_VISUAL_PAUSE_ENDTURN);
      await aiWaitForInteractionAnimations(180);
      if(G.currentPlayer !== G.aiPlayer || G.turn !== aiTurnNumber || G._aiTurnToken !== aiTurnToken) { G._aiRunning = false; return; }
      log('p2','AI ends turn.');
      G._aiRunning = false;
      if(!G._aiAbort) endTurn();
  } catch(e) {
    if(G._aiAbort) {
      G._aiRunning = false;
      return;
    }
    console.error('AI error:',e);
    G._aiRunning = false;
    try{ await aiWaitForInteractionAnimations(120); }catch(_e){}
    endTurn();
  }
}

function aiSleep(ms){
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if(G._aiAbort) reject(new Error('AI aborted'));
      else resolve();
    }, ms);
  });
}

// Keep AI work visible without holding the frame loop hostage during board operations.
const AI_VISUAL_PAUSE_THINK = 1100;
const AI_VISUAL_PAUSE_PLACE = 1650;
const AI_VISUAL_PAUSE_CONSOLIDATE = 3100;
const AI_VISUAL_PAUSE_EFFECTS = 900;
const AI_VISUAL_PAUSE_ENDTURN = 700;

async function aiWaitForInteractionAnimations(extraMs=0){
  const wait = typeof getInteractionAnimationDelayMs === 'function'
    ? getInteractionAnimationDelayMs()
    : (typeof getPlacementUiDelayMs === 'function' ? getPlacementUiDelayMs() : 0);
  const total = Math.max(0, wait || 0) + Math.max(0, extraMs || 0);
  if(total > 0) await aiSleep(Math.min(total, 3200));
}

function aiNowMs() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

const AI_SEARCH_QUEUE_FRAME_BUDGET_MS = 1.75;

function aiRecordSearchQueueYield(reason, elapsedMs) {
  try {
    const perf = window.__fatePerf = window.__fatePerf || {};
    perf.aiSearchQueueYields = (Number(perf.aiSearchQueueYields) || 0) + 1;
    perf.aiSearchQueueLastYield = {
      reason: reason || 'ai-search',
      elapsedMs: Math.round((Number(elapsedMs) || 0) * 100) / 100,
      at: Math.round(aiNowMs())
    };
  } catch(e) {}
}

function aiYieldToFrame(reason, elapsedMs) {
  aiRecordSearchQueueYield(reason, elapsedMs);
  return new Promise(resolve => {
    if(typeof requestAnimationFrame === 'function') requestAnimationFrame(()=>setTimeout(resolve, 0));
    else setTimeout(resolve, 0);
  });
}

async function aiRunSearchQueue(items, worker, ctx, reason, budgetMs) {
  const list = Array.isArray(items) ? items : [];
  const maxMs = Math.max(0.75, Number(budgetMs) || AI_SEARCH_QUEUE_FRAME_BUDGET_MS);
  let chunkStart = aiNowMs();
  for(let i = 0; i < list.length; i++){
    if(aiShouldAbortSearch(ctx)) return false;
    worker(list[i], i);
    const elapsed = aiNowMs() - chunkStart;
    if(elapsed >= maxMs){
      await aiYieldToFrame(reason, elapsed);
      chunkStart = aiNowMs();
    }
  }
  return true;
}

function aiShouldAbortSearch(ctx) {
  return !!(G._aiAborted || G._aiAbort ||
    (ctx && (G.currentPlayer !== G.aiPlayer || G.turn !== ctx.turnNumber || G._aiTurnToken !== ctx.turnToken)));
}

function aiGetMCTSConfig() {
  const d = G.aiDifficulty || 'medium';
  if(d === 'extreme') return {enabled:true, budgetMs:360, maxCandidates:8, maxChunkMs:2.25, minVisits:28, exploration:1.18, depth:3};
  if(d === 'hard') return {enabled:true, budgetMs:260, maxCandidates:7, maxChunkMs:2, minVisits:22, exploration:1.28, depth:3};
  if(d === 'medium') return {enabled:true, budgetMs:180, maxCandidates:6, maxChunkMs:1.75, minVisits:16, exploration:1.38, depth:2};
  return {enabled:true, budgetMs:110, maxCandidates:5, maxChunkMs:1.5, minVisits:10, exploration:1.55, depth:2};
}

async function aiChooseMoveWithMCTS(moves, settings, ctx) {
  const cfg = aiGetMCTSConfig();
  const moveScores = [];
  let bestBaseScore = -Infinity;

  const scored = await aiRunSearchQueue(moves, function(move){
    const baseScore = aiEvaluateMove(move);
    moveScores.push({ move, baseScore, combined: 0 });
    if(baseScore > bestBaseScore) bestBaseScore = baseScore;
  }, ctx, 'score-moves', cfg.maxChunkMs);
  if(!scored) return null;

  const pruneThreshold = bestBaseScore - 25;
  const viable = moveScores.filter(ms => ms.baseScore >= pruneThreshold);
  if(!viable.length) return null;

  let bestCombined = -Infinity;
  const simulated = await aiRunSearchQueue(viable, function(ms){
    ms.combined = ms.baseScore + aiSimulateOutcome(ms.move);
    if(ms.combined > bestCombined) bestCombined = ms.combined;
  }, ctx, 'simulate-moves', cfg.maxChunkMs);
  if(!simulated) return null;

  if(viable.length > 1){
    const deepThreshold = bestCombined - 5;
    const deepEvaluated = await aiRunSearchQueue(viable, function(ms){
      if(ms.combined >= deepThreshold) ms.combined += aiDeepEval(ms.move);
    }, ctx, 'deep-eval-moves', cfg.maxChunkMs);
    if(!deepEvaluated) return null;
  }

  viable.sort((a,b)=>b.combined-a.combined);
  const candidates = viable.slice(0, Math.min(cfg.maxCandidates, viable.length));
  if(cfg.enabled && candidates.length > 1){
    await aiRunRootMCTS(candidates, cfg, ctx);
  }

  let best = null;
  let bestScore = -Infinity;
  for(const ms of candidates){
    const mctsScore = ms.mctsVisits ? (ms.mctsValue / ms.mctsVisits) : 0;
    const noise = (Math.random()-0.5) * settings.mistakeChance * 20;
    const finalScore = ms.combined + mctsScore + noise;
    if(finalScore > bestScore){
      bestScore = finalScore;
      best = ms.move;
    }
  }
  return best ? {move:best, score:bestScore} : null;
}

async function aiRunRootMCTS(candidates, cfg, ctx) {
  const started = aiNowMs();
  let totalVisits = 0;
  let chunkStart = started;
  candidates.forEach((ms, idx)=>{
    ms.mctsVisits = 0;
    ms.mctsValue = 0;
    ms.mctsPrior = Number(ms.combined) || 0;
    ms.mctsIndex = idx;
  });

  while(!aiShouldAbortSearch(ctx)){
    if(aiNowMs() - started >= cfg.budgetMs && totalVisits >= cfg.minVisits) break;
    const child = aiSelectMCTSChild(candidates, totalVisits, cfg.exploration);
    const reward = aiMCTSPlayout(child.move, cfg.depth);
    child.mctsVisits++;
    child.mctsValue += reward;
    totalVisits++;
    if(aiNowMs() - chunkStart >= cfg.maxChunkMs){
      await aiYieldToFrame('mcts-root', aiNowMs() - chunkStart);
      chunkStart = aiNowMs();
    }
  }
}

function aiSelectMCTSChild(candidates, totalVisits, exploration) {
  for(const child of candidates) if(!child.mctsVisits) return child;
  const logVisits = Math.log(Math.max(2, totalVisits));
  let best = candidates[0];
  let bestScore = -Infinity;
  for(const child of candidates){
    const avg = child.mctsValue / Math.max(1, child.mctsVisits);
    const prior = Math.max(-12, Math.min(12, (child.mctsPrior || 0) / 18));
    const ucb = avg + prior + exploration * Math.sqrt(logVisits / child.mctsVisits);
    if(ucb > bestScore){
      bestScore = ucb;
      best = child;
    }
  }
  return best;
}

function aiMCTSPlayout(rootMove, depth) {
  const state = aiMCTSStateAfterMove(rootMove);
  const cp = G.aiPlayer;
  const opp = 1 - cp;
  let player = opp;
  const steps = Math.max(1, depth || 2);
  for(let i=0; i<steps; i++){
    aiApplyAbstractMCTSMove(state, player);
    player = player === cp ? opp : cp;
  }
  return aiEvaluateMCTSState(state);
}

function aiMCTSStateAfterMove(move) {
  const cp = G.aiPlayer;
  const opp = 1 - cp;
  const state = {
    score: [[0,0,0],[0,0,0]],
    handFate: [aiMCTSHandFates(0), aiMCTSHandFates(1)]
  };
  for(let z=0; z<3; z++){
    state.score[cp][z] = aiCachedZoneScore(z, cp);
    state.score[opp][z] = aiCachedZoneScore(z, opp);
  }
  if(move.type === 'place'){
    state.score[cp][move.z] += aiProjectedMoveFate(move);
    aiMCTSConsumeHandCard(state, cp, move.card);
  } else if(move.type === 'consolidate'){
    state.score[cp][move.z] += aiProjectedMoveFate(move);
    for(const t of move.tributes || []) state.score[cp][t.z] -= Math.max(1, Number(t.card?.currentFate ?? t.card?.fate) || 1);
    aiMCTSConsumeHandCard(state, cp, move.card);
  }
  return state;
}

function aiMCTSHandFates(player) {
  const hand = G.players?.[player]?.hand || [];
  return hand.map(c=>Math.max(1, Number(c.currentFate ?? c.fate) || 1)).sort((a,b)=>b-a).slice(0, 8);
}

function aiMCTSConsumeHandCard(state, player, card) {
  if(!card || !state.handFate[player]) return;
  const fate = Math.max(1, Number(card.currentFate ?? card.fate) || 1);
  const idx = state.handFate[player].findIndex(v=>Math.abs(v - fate) <= 1);
  if(idx >= 0) state.handFate[player].splice(idx, 1);
}

function aiApplyAbstractMCTSMove(state, player) {
  const cp = G.aiPlayer;
  const opp = 1 - cp;
  const values = state.handFate[player] || [];
  const fate = values.length ? values.splice(Math.floor(Math.random() * Math.min(values.length, 4)), 1)[0] : (2 + Math.floor(Math.random() * 3));
  let bestZone = 0;
  let bestWeight = -Infinity;
  for(let z=0; z<3; z++){
    const my = state.score[player][z];
    const enemy = state.score[player === cp ? opp : cp][z];
    const diff = my - enemy;
    const flipBonus = diff <= 0 && diff + fate > 0 ? 10 : 0;
    const contestBonus = Math.max(0, 7 - Math.abs(diff));
    const twoZoneBonus = aiMCTSZonesWon(state, player) < 2 ? 2 : 0;
    const weight = flipBonus + contestBonus + twoZoneBonus + Math.random() * 4;
    if(weight > bestWeight){
      bestWeight = weight;
      bestZone = z;
    }
  }
  state.score[player][bestZone] += fate;
}

function aiMCTSZonesWon(state, player) {
  const other = 1 - player;
  let won = 0;
  for(let z=0; z<3; z++) if(state.score[player][z] > state.score[other][z]) won++;
  return won;
}

function aiEvaluateMCTSState(state) {
  const cp = G.aiPlayer;
  const opp = 1 - cp;
  let score = 0;
  let won = 0;
  let lost = 0;
  for(let z=0; z<3; z++){
    const diff = state.score[cp][z] - state.score[opp][z];
    score += diff * 0.8;
    if(diff > 0) won++;
    else if(diff < 0) lost++;
    if(Math.abs(diff) <= 2) score += 1.5;
  }
  if(won >= 2) score += 18;
  if(won === 3) score += 7;
  if(lost >= 2) score -= 16;
  return score;
}

// Board evaluation heuristic — returns score from AI perspective
function aiEvalBoard() {
  const cp = G.aiPlayer, opp = 1-cp;
  let score = 0;
  let zonesWon = 0, zonesLost = 0;
  for(let z=0;z<3;z++){
    const my = aiCachedZoneScore(z,cp), op = aiCachedZoneScore(z,opp);
    const diff = my - op;
    if(diff > 0) zonesWon++;
    else if(diff < 0) zonesLost++;
    // Zone score differential
    score += diff * 3;
    // Contested row presence is hugely important
    if(G.board[z][1]){
      for(let c=0;c<3;c++){
        const cell = G.board[z][1][c];
        if(cell){
          const fate = getEffectiveFate(cell, z);
          if(cell.owner===cp) score += fate * 2;
          else score -= fate * 2;
        }
      }
    }
    // Safe row presence matters too
    const safeRow = cp===0?2:0;
    if(G.board[z][safeRow]){
      for(let c=0;c<3;c++){
        const cell = G.board[z][safeRow][c];
        if(cell && cell.owner===cp) score += getEffectiveFate(cell, z);
      }
    }
  }
  // Winning 2+ zones = huge bonus
  if(zonesWon>=2) score += 40;
  if(zonesLost>=2) score -= 40;
  // Hand size advantage
  score += (G.players[cp].hand.length - G.players[opp].hand.length) * 0.5;
  return score;
}

// Generate all legal moves for AI this action
function aiGenerateAllMoves() {
  const cp = G.aiPlayer, opp = 1-cp;
  const hand = G.players[cp].hand;
  const moves = [];
  const maxSup = G.maxSupportsPerTurn + G.extraSupportsThisTurn;
  const canPlaceSup = G.majaEffectThisTurn || G.supportsPlacedThisTurn < maxSup;
  const isArtilleryLockedForAI = (z) => typeof G._artilleryLockedZone === 'number' && G._artilleryLockedZone === z && G._artilleryLockOwner === cp && G._artilleryLockTurnsLeft > 0;

  // Maja Kaminska can be set directly from the deck at no cost.
  const majaFromDeck = G.players[cp].deck.find(c=>c.id==='07');
  if(majaFromDeck){
    for(let z=0;z<3;z++){
      if(isArtilleryLockedForAI(z)) continue;
      const rowOrder = [1, cp===0?2:0];
      for(const r of rowOrder){
        if(!G.board[z][r]) continue;
        if(typeof getChingachlookPlacementBlockReason === 'function' && getChingachlookPlacementBlockReason(majaFromDeck, z, cp)) continue;
        for(let c=0;c<getBoardRowCapacity(z,r);c++){
          if(G.board[z][r][c]!==null || isBlocked(z,r,c)) continue;
          moves.push({type:'place', card:majaFromDeck, z, r, c, contested:r===1, fromDeck:true, freeMajaFromDeck:true});
        }
      }
    }
  }

  // 1. Supporter placements — prioritize contested row (1), then safe, then extra
  if(canPlaceSup){
    const supporters = hand.filter(c=>c.type==='Supporter' && c.id!=='70').map(card=>({card, fromDeck:false}));
    const polishUses = Array.isArray(G.polishArmyUses) ? (G.polishArmyUses[cp] || 0) : 0;
    const polishFromDeck = G.players[cp].deck.find(c=>c.id==='28');
    if(polishFromDeck && !G._polishUsedThisTurn && polishUses < 2) supporters.push({card:polishFromDeck, fromDeck:true});
    for(const candidate of supporters){
      const sup = candidate.card;
      // Try contested row FIRST (row 1) — most impactful
      for(let z=0;z<3;z++){
        if(isArtilleryLockedForAI(z)) continue;
        const rowOrder = [1, cp===0?2:0]; // contested > own safe only
        for(const r of rowOrder){
          if(sup.contestedOnly && r!==1) continue;
          if(!G.board[z][r]) continue;
          for(let c=0;c<3;c++){
            if(G.board[z][r][c]!==null) continue;
            if(isBlocked(z,r,c)) continue;
            if(sup.id!=='76' && isBlockedByAlondra(z,r,c,cp)) continue;
            moves.push({type:'place', card:sup, z, r, c, contested:r===1, fromDeck:candidate.fromDeck});
          }
        }
      }
    }
  }

  // 1b. Free character placements from card effects/conditional costs.
  const freeCharacters = hand.filter(c=>{
    const isEffectFree = !!(G._linaFreeIids && G._linaFreeIids.has(c.iid));
    return isEffectFree || (c.type !== 'Supporter' && (typeof getDisplayedCardCost === 'function' ? getDisplayedCardCost(c) : c.cost) <= 0);
  });
  for(const ch of freeCharacters){
    for(let z=0;z<3;z++){
      if(isArtilleryLockedForAI(z)) continue;
      if(typeof getChingachlookPlacementBlockReason === 'function' && getChingachlookPlacementBlockReason(ch, z, cp)) continue;
      const rowOrder = [1, cp===0?2:0];
      for(const r of rowOrder){
        if(!G.board[z][r]) continue;
        for(let c=0;c<getBoardRowCapacity(z,r);c++){
          if(G.board[z][r][c]!==null || isBlocked(z,r,c)) continue;
          moves.push({type:'place', card:ch, z, r, c, contested:r===1});
        }
      }
    }
  }

  // 2. Consolidation moves
  const chars = hand.filter(c=>c.type!=='Supporter');
  if(chars.length){
    const mySups = [];
    forEachBoardCard((card,z,r,c)=>{
      const canTribute = typeof canUseAsConsolidationTribute === 'function'
        ? canUseAsConsolidationTribute(card, cp)
        : (card && card.owner===cp && !card.noConsolidate && card.id!=='76');
      if(!card || !canTribute) return;
      if(isArtilleryLockedForAI(z)) return;
      const ralphBonus = typeof countFriendlyRalphAdjacency === 'function' ? countFriendlyRalphAdjacency(z, r, c, cp) : 0;
      const reinforcement = getSupportReinforcementValue(card) + ralphBonus;
      const isCharacter = typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(card, cp) : card.type !== 'Supporter';
      if(card.type === 'Supporter' || card.id === '86') mySups.push({card,z,r,c,reinforcement, kind:'supporter'});
      if(isCharacter) mySups.push({card,z,r,c,reinforcement, kind:'character'});
    });

    for(const ch of chars){
      const pool = (typeof cardUsesCharacterConsolidationTributes === 'function' && cardUsesCharacterConsolidationTributes(ch))
        ? mySups.filter(t=>t.kind === 'character')
        : mySups.filter(t=>t.kind === 'supporter');
      const uniquePool = [];
      const seenIids = new Set();
      pool.forEach(t=>{ if(!seenIids.has(t.card.iid)){ seenIids.add(t.card.iid); uniquePool.push(t); } });
      const cost = typeof getDisplayedCardCost === 'function' ? getDisplayedCardCost(ch) : ch.cost;
      const totalReinforcement = uniquePool.reduce((s,t)=>s+t.reinforcement,0);
      if(cost===0 || totalReinforcement < cost) continue;
      for(const target of uniquePool){
        if(isArtilleryLockedForAI(target.z)) continue;
        if(typeof isBlockedForConsolidate === 'function' && isBlockedForConsolidate(target.z, target.r, target.c)) continue;
        const tributes = aiPickTributes(uniquePool, cost, target);
        if(!tributes) continue;
        if(typeof getChingachlookPlacementBlockReason === 'function'){
          const removedIids = new Set(tributes.map(t=>t.card?.iid).filter(Boolean));
          if(getChingachlookPlacementBlockReason(ch, target.z, cp, removedIids)) continue;
        }
        moves.push({
          type:'consolidate',
          card:ch,
          cost,
          tributes,
          z:target.z,
          r:target.r,
          c:target.c,
          contested:target.r===1
        });
      }
    }
  }
  return moves;
}

// Pick tributes for consolidation — sacrifice from lowest-value zones
function aiPickTributes(mySups, cost, preferredTarget=null) {
  const strat = G._selectedAI?._deckStrategy || '';
  const protectRalph = ['ai_royal_flush','ai_coordinators_dream'].includes(strat);
  // Sort by least valuable first (sacrifice cheap supporters from zones we're winning)
  const sorted = [...mySups].sort((a,b)=>{
    if(protectRalph && a.card.id !== b.card.id){
      if(a.card.id === '24') return 1;
      if(b.card.id === '24') return -1;
    }
    const za = aiCachedZoneScore(a.z, G.aiPlayer) - aiCachedZoneScore(a.z, 1-G.aiPlayer);
    const zb = aiCachedZoneScore(b.z, G.aiPlayer) - aiCachedZoneScore(b.z, 1-G.aiPlayer);
    // Sacrifice from zones we're winning big, keep supporters in contested zones
    return zb - za; // higher diff = less needed = sacrifice first
  });

  // Try multiple tribute combinations and pick the one with lowest sacrifice penalty.
  // The preferredTarget (placement cell) is always included since the character lands there.
  const others = sorted.filter(t => !preferredTarget || t.card.iid !== preferredTarget.card.iid);
  const secondStarts = others.slice(0, Math.min(3, others.length));
  const attempts = [null, ...secondStarts];
  let bestTributes = null, bestPenalty = Infinity;

  for(const forcedSecond of attempts){
    const selected = [];
    let remaining = cost;
    if(preferredTarget){ selected.push(preferredTarget); remaining -= preferredTarget.reinforcement; }
    if(forcedSecond && remaining > 0){ selected.push(forcedSecond); remaining -= forcedSecond.reinforcement; }
    for(const t of sorted){
      if(remaining <= 0) break;
      if(selected.some(s => s.card.iid === t.card.iid)) continue;
      selected.push(t);
      remaining -= t.reinforcement;
    }
    if(remaining > 0) continue;
    // Trim to exact cost
    const trimmed = [];
    let rem2 = cost;
    if(preferredTarget){ trimmed.push(preferredTarget); rem2 -= preferredTarget.reinforcement; }
    if(forcedSecond && rem2 > 0){ trimmed.push(forcedSecond); rem2 -= forcedSecond.reinforcement; }
    for(const t of selected){
      if(rem2 <= 0) break;
      if(trimmed.some(s => s.card.iid === t.card.iid)) continue;
      trimmed.push(t);
      rem2 -= t.reinforcement;
    }
    // Score this combination
    let penalty = 0;
    for(const t of trimmed){
      if(preferredTarget && t.card.iid === preferredTarget.card.iid) continue;
      const diff = aiCachedZoneScore(t.z, G.aiPlayer) - aiCachedZoneScore(t.z, 1-G.aiPlayer);
      if(diff <= 2) penalty += 3;
      if(diff <= 0) penalty += 2;
    }
    if(penalty < bestPenalty){ bestPenalty = penalty; bestTributes = trimmed; }
  }
  return bestTributes;
}

function aiLandscapeTargetZone() {
  const st = typeof getLandscapeState === 'function' ? getLandscapeState() : null;
  return st && typeof st.targetZone === 'number' ? st.targetZone : null;
}

function aiProjectedLandscapeFateBonus(card, move) {
  if(!card) return 0;
  let bonus = 0;
  if(typeof isLandscapeActive === 'function' && isLandscapeActive('igb6') && card.aff === 'reality') bonus += 3;
  if(typeof isLandscapeActive === 'function' && isLandscapeActive('igb11') && card.type === 'Initiator') bonus += 3;
  if(move && move.type === 'consolidate' && typeof isLandscapeActive === 'function' && isLandscapeActive('igb3')) {
    const targetZone = aiLandscapeTargetZone();
    if(G.turn < 10 && targetZone === move.z) bonus += 3;
  }
  return bonus;
}

function aiProjectedMoveFate(move) {
  if(!move || !move.card) return 0;
  const base = move.type === 'consolidate'
    ? (Number(move.card.fate) || 0)
    : (Number(move.card.currentFate ?? move.card.fate) || 1);
  return base + aiProjectedLandscapeFateBonus(move.card, move);
}

function aiLandscapeMoveBonus(move) {
  if(!move || typeof isLandscapeActive !== 'function') return 0;
  let bonus = 0;
  const cp = G.aiPlayer;
  const opp = 1 - cp;
  const targetZone = aiLandscapeTargetZone();

  if(isLandscapeActive('igb2') && G.turn <= 14 && move.type === 'consolidate') {
    const st = typeof getLandscapeState === 'function' ? getLandscapeState() : null;
    const myCon = Number(st && st.consolidations && st.consolidations[cp]) || 0;
    const opCon = Number(st && st.consolidations && st.consolidations[opp]) || 0;
    bonus += myCon <= opCon ? 14 : 7;
  }

  if(isLandscapeActive('igb3') && G.turn < 10 && move.type === 'consolidate' && targetZone === move.z) {
    bonus += 16;
  }

  if(isLandscapeActive('igb8') && G.turn < 10 && targetZone === move.z) {
    const my = aiCachedZoneScore(move.z, cp);
    const op = aiCachedZoneScore(move.z, opp);
    const projected = aiProjectedMoveFate(move);
    bonus += 7;
    if(my <= op && my + projected > op) bonus += 11;
    else if(my < op) bonus += 5;
  }

  if(isLandscapeActive('igb6') && move.card && move.card.aff === 'reality') bonus += 4;
  if(isLandscapeActive('igb11') && move.card && move.card.type === 'Initiator') bonus += 4;

  return bonus;
}

function aiPersonalityMoveBonus(move, mods) {
  if(!move || !move.card || !mods) return 0;
  const card = move.card;
  const cp = G.aiPlayer;
  const opp = 1 - cp;
  const z = typeof move.z === 'number' ? move.z : 1;
  const my = aiCachedZoneScore(z, cp);
  const op = aiCachedZoneScore(z, opp);
  const lead = my - op;
  const projected = aiProjectedMoveFate(move);
  let ownCardsHere = 0;
  let oppCardsHere = 0;
  if(G.board && G.board[z]) {
    for(const row of G.board[z]) for(const cell of row) {
      if(!cell) continue;
      if(cell.owner === cp) ownCardsHere++;
      else if(cell.owner === opp) oppCardsHere++;
    }
  }

  let bonus = 0;
  if(move.type === 'place') {
    if(card.type === 'Supporter') bonus += 2.5 * (mods.supporterBonus || 0);
    if(card.type === 'Initiator' || card.type === 'Improvisor' || card.type === 'Coordinator') bonus += 1.8 * (mods.effectBonus || 0);
    if(ownCardsHere <= 1) bonus += 2.2 * (mods.zoneSpreadBonus || 0);
    if(ownCardsHere >= 2) bonus += 2.2 * (mods.zoneCommitBonus || 0);
    if(oppCardsHere > ownCardsHere) bonus += 2.4 * (mods.opponentZoneBonus || 0);
    if(['31','50','61','72','16','30','10','17','04','56','67'].includes(card.id)) bonus += 3.4 * (mods.debuffBonus || 0);
    if(['13','27','29','32','42','58','60','68','75'].includes(card.id)) bonus += 3.0 * (mods.futureValueBonus || 0);
    if(['05','09','28','59','63','76'].includes(card.id)) bonus += 2.2 * (mods.tempoBonus || 0);
  } else if(move.type === 'consolidate') {
    bonus += 3.0 * (mods.consolidateBonus || 0);
    bonus += projected * 0.35 * (mods.highFateBonus || 0);
    if(mods.earlyConsolidate && G.turn <= 8) bonus += 5;
    if(move.tributes && move.tributes.length) {
      const tributeFate = move.tributes.reduce((sum, t) => sum + (Number(t.card?.currentFate ?? t.card?.fate) || 0), 0);
      bonus -= tributeFate * 0.18 * (mods.riskAversion || 0);
      bonus += move.tributes.length * 1.5 * (mods.sacrificialBonus || 0);
    }
  }

  if(move.contested) bonus += 3.0 * (mods.contestedZoneBonus || 0);
  if(lead < 0) bonus += Math.min(8, Math.abs(lead)) * 0.8 * (mods.trailingZoneBonus || 0);
  if(Math.abs(lead) <= 2) bonus += 2.0 * (mods.balancedZoneBonus || 0);
  if(lead <= -4) bonus -= 1.8 * (mods.riskAversion || 0);
  if(lead >= 5 && mods.bullyBonus) bonus += 2.0 * mods.bullyBonus;
  if(mods.randomnessMod) bonus += (Math.random() - 0.5) * 10 * mods.randomnessMod;
  return bonus;
}

// Evaluate a move's immediate value
function aiEvaluateMove(move) {
  let score = 0;
  if(move.type==='place'){
    const card = move.card;
    score += (card.currentFate||card.fate||1);
    // HUGE bonus for contested row — this is the key to winning
    if(move.contested) score += 8;
    // Bonus for zones where we're behind or tied
    const my = aiCachedZoneScore(move.z, G.aiPlayer);
    const op = aiCachedZoneScore(move.z, 1-G.aiPlayer);
    if(op >= my) score += 5;
    // Supporter-specific bonuses
    const effectBonus = {'76':8,'16':5,'09':5,'31':4,'32':4,'05':3,'18':4,'59':3,'63':3,'68':4,'72':5};
    score += (effectBonus[card.id]||0);
  } else if(move.type==='consolidate'){
    const card = move.card;
    score += (card.fate||0) * 1.5;
    if(move.contested) score += 12;
    const charBonus = {'01':10,'46':10,'57':10,'03':8,'14':7,'30':10,'77':9,'10':8,'29':5,'04':5,'02':8};
    score += (charBonus[card.id]||0);
    let sacrificePenalty = 0;
    for(const t of move.tributes){
      const diff = aiCachedZoneScore(t.z,G.aiPlayer) - aiCachedZoneScore(t.z,1-G.aiPlayer);
      if(diff <= 2) sacrificePenalty += 3;
    }
    score -= sacrificePenalty;
    const my = aiCachedZoneScore(move.z, G.aiPlayer);
    const op = aiCachedZoneScore(move.z, 1-G.aiPlayer);
    if(op > my) score += 8;
    else if(op === my) score += 4;
  }

  // ─── ZONE OVER-COMMITMENT PENALTY ───
  // Discourage piling into a zone the AI is already winning comfortably.
  // Redirect resources toward zones that are losing or tied instead.
  {
    const cp = G.aiPlayer, opp = 1 - cp;
    const myZ = aiCachedZoneScore(move.z, cp);
    const opZ = aiCachedZoneScore(move.z, opp);
    const lead = myZ - opZ;
    if(lead >= 6){
      // Already winning this zone by a large margin — check if another zone needs help
      let needyZones = 0;
      for(let z = 0; z < 3; z++){
        if(z === move.z) continue;
        const d = aiCachedZoneScore(z, cp) - aiCachedZoneScore(z, opp);
        if(d <= 0) needyZones++;
      }
      // Penalty scales with how far ahead we are and how many zones need help
      if(needyZones > 0) score -= Math.min(lead - 4, 12) * needyZones;
    }
  }

  // ─── DECK-SPECIFIC STRATEGY BONUSES ───
  // The AI adjusts its priorities based on which starter deck it's playing.
  // This makes each deck play correctly according to its intended strategy.
  const deckStrat = G._selectedAI?._deckStrategy || '';
  score += aiDeckStrategyBonus(move, deckStrat);
  score += aiLandscapeMoveBonus(move);
  score += aiPersonalityMoveBonus(move, getAIStyleModifiers(G._selectedAI?.style || ''));

  return score;
}

function aiDeckSearchPriority(deckId, kind) {
  const priorities = {
    ai_blitz: {
      supporter: ['25','28','63','76','65','05','59','09','42','79'],
      character: ['07','45','29','06','13'],
      jorge: ['25','45','63','76','65','28'],
      lina: [],
      dylan: ['07','25','28','63','05','59','09'],
      coordinator: []
    },
    ai_coordinators_dream: {
      supporter: ['68','24','05','59','32','58','75','69'],
      character: ['23','15','19','35','08'],
      jorge: ['23','19','15','35','68','24'],
      lina: ['23'],
      dylan: ['15','19','35','05','59','09'],
      coordinator: ['23','15','19']
    },
    ai_henrys_conviction: {
      supporter: ['32','58','75','69','63','05','09','42'],
      character: ['21','29','06','27','13'],
      jorge: ['21','63','32','58','75','69'],
      lina: [],
      dylan: ['21','63','05','09','42'],
      coordinator: []
    },
    ai_howards_choice: {
      supporter: ['76','63','24','05','32','58','75'],
      character: ['45','46','03','56','17','67','08'],
      jorge: ['45','46','17','67','63','76'],
      lina: ['46'],
      dylan: ['63','05'],
      coordinator: []
    },
    ai_investing_future: {
      supporter: ['47','05','58','75','69','76','65','32','60'],
      character: ['46','08','06','03','13'],
      jorge: ['46','47','05','58','75','69','76','65'],
      lina: ['46'],
      dylan: ['05'],
      coordinator: []
    },
    ai_royal_flush: {
      supporter: ['24','68','05','59','32','58','75','69'],
      character: ['77','57','19','15','01'],
      jorge: ['77','57','19','15','01','24','68'],
      lina: [],
      dylan: ['01','15','19','57','77','05','59'],
      coordinator: ['19','15','01','57','77']
    },
    ai_movement: {
      supporter: ['28','60','73','69','05','25','32','58','76','70'],
      character: ['34','29','06','39','27','15','03'],
      jorge: ['34','73','69','60','05','29','39'],
      lina: ['03'],
      dylan: ['34','28','05','09'],
      coordinator: ['34','15']
    },
    ai_fat_jake: {
      supporter: ['32','60','58','75','69','80','05','25','28','44','47','76'],
      character: ['38','08','03','27','06','13'],
      jorge: ['38','32','60','58','75','69','03'],
      lina: ['38'],
      dylan: ['05','28'],
      coordinator: []
    },
    ai_hand_leech: {
      supporter: ['72','58','75','16','05','28','60','71','20','09'],
      character: ['14','06','61','56'],
      jorge: ['14','72','58','75','16','05','61'],
      lina: ['56'],
      dylan: ['28','05','09'],
      coordinator: []
    }
  };
  return priorities[deckId]?.[kind] || [];
}

function aiPickByPriority(cards, priorityIds) {
  if(!cards || !cards.length) return null;
  for(const id of priorityIds || []) {
    const found = cards.find(c => c.id === id);
    if(found) return found;
  }
  return null;
}

function aiPriorityIndex(card, priorityIds) {
  const idx = (priorityIds || []).indexOf(card?.id);
  return idx >= 0 ? idx : 999;
}

function aiCountOwnCardsInZone(z, predicate) {
  let count = 0;
  G.board[z]?.forEach(row=>row?.forEach(cell=>{
    if(cell && cell.owner === G.aiPlayer && predicate(cell)) count++;
  }));
  return count;
}

function aiFirstOwnCardZone(predicate) {
  for(let z=0; z<3; z++){
    if(aiCountOwnCardsInZone(z, predicate) > 0) return z;
  }
  return null;
}

function aiOwnBoardCardsById(id) {
  const cards = [];
  forEachBoardCard((card,z,r,c)=>{
    if(card && card.owner === G.aiPlayer && card.id === id) cards.push({card,z,r,c});
  });
  return cards;
}

function aiBestRozsiZone() {
  const rozsis = aiOwnBoardCardsById('34');
  if(!rozsis.length) return null;
  const center = rozsis.find(entry => entry.z === 1);
  if(center) return 1;
  rozsis.sort((a,b)=>getZoneScore(b.z, G.aiPlayer)-getZoneScore(a.z, G.aiPlayer));
  return rozsis[0].z;
}

// Deck-specific strategy bonuses — teaches the AI HOW to pilot each deck
function aiDeckStrategyBonus(move, deckId) {
  let bonus = 0;
  const cp = G.aiPlayer;

  if(deckId === 'starter_maelstrom') {
    // RELENTLESS MAELSTROM: consolidate for Alondra, buff her, protect her
    if(move.type === 'consolidate' && move.card.id === '14') bonus += 20; // Alondra is the #1 consolidation target
    if(move.type === 'place') {
      // Great Oak Infantry is primarily consolidation fodder for Alondra
      if(move.card.id === '47') bonus += 3;
      // 17th British (05): bonus if Alondra is already on the board in this zone
      if(move.card.id === '05') {
        const hasAlondra = G.board[move.z]?.some(row => row?.some(c => c && c.id === '14' && c.owner === cp));
        if(hasAlondra) bonus += 12;
      }
      // Crossroads/Ledger-keepers: bonus for recycling 17th British
      if(move.card.id === '58' || move.card.id === '75') {
        const discardHas05 = G.players[cp].discard.some(c => c.id === '05');
        if(discardHas05) bonus += 8;
      }
      // South Wind Spearman: bonus if Alondra is on the board (protect her)
      if(move.card.id === '20') {
        const alondraOnBoard = G.board.some(z => z?.some(row => row?.some(c => c && c.id === '14' && c.owner === cp)));
        if(alondraOnBoard) bonus += 6;
      }
      // High-fate supporters (ALPINE, Soviet, West Carib): place for zone control, not just fodder
      if(['76','44','65'].includes(move.card.id)) bonus += 4;
    }
  }

  else if(deckId === 'starter_freeworld') {
    // THE FREE WORLD: flood Third Great War cards, then Duncan declares TGW
    if(move.type === 'consolidate' && move.card.id === '77') bonus += 18; // Duncan is key
    if(move.type === 'consolidate' && move.card.id === '01') bonus += 14; // Felicyta is secondary
    if(move.type === 'place') {
      // Third Great War supporters get a bonus — more on board = more Duncan value
      const tgwIds = ['18','37','42','59','28','09','63'];
      if(tgwIds.includes(move.card.id)) bonus += 3;
      // Dylan Kirby searches for Felicyta — high priority consolidation target
      if(move.card.id === '29') bonus += 4;
      // Jorge searches for Duncan
      if(move.card.id === '06') bonus += 4;
    }
    // Felicyta placement: prefer zones with most TGW allies already
    if(move.type === 'consolidate' && move.card.id === '01') {
      let tgwCount = 0;
      G.board[move.z]?.forEach(row => row?.forEach(c => {
        if(c && c.owner === cp && c.aff === 'third_great_war') tgwCount++;
      }));
      bonus += tgwCount * 3;
    }
  }

  else if(deckId === 'starter_incel') {
    // REIGN OF THE FURIOUS INCEL: recycle Oathbound procs to feed Jimmy's passive
    if(move.type === 'consolidate' && move.card.id === '41') bonus += 15; // Jimmy
    if(move.type === 'place') {
      // Oathbound Noble Fighter: always valuable (feeds Jimmy)
      if(move.card.id === '31') bonus += 8;
      // Crossroads/Ledger-keepers: recycle Oathbound from discard
      if(move.card.id === '58' || move.card.id === '75') {
        const discardHas31 = G.players[cp].discard.some(c => c.id === '31');
        if(discardHas31) bonus += 10;
      }
      // Post-Modernist Dylan: debuff opponent zone — good board control
      if(move.card.id === '10') bonus += 3;
      // Santiago: remove opponent threats
      if(move.card.id === '30') bonus += 3;
    }
    // Lina: if she searches for Jimmy, always search for Jimmy
    if(move.type === 'consolidate' && move.card.id === '08') bonus += 12;
  }

  else if(deckId === 'starter_assault') {
    // MASS ASSAULT DOCTRINE: stack Anne Stone + Jeremiah + Maroon Knights in same zone
    if(move.type === 'consolidate') {
      // Anne Stone, Jeremiah Jones, Mark — all want to be in the same zone
      if(['11','57','43'].includes(move.card.id)) {
        // Bonus if one of the other key pieces is already in this zone
        const keyIds = ['11','57','59'];
        let synergy = 0;
        G.board[move.z]?.forEach(row => row?.forEach(c => {
          if(c && c.owner === cp && keyIds.includes(c.id)) synergy++;
        }));
        bonus += synergy * 6;
        bonus += 8; // base bonus for placing key pieces
      }
    }
    if(move.type === 'place') {
      // Czechoslovak Maroon Knights: place in same zone as Anne Stone/Jeremiah
      if(move.card.id === '59') {
        let synergy = 0;
        G.board[move.z]?.forEach(row => row?.forEach(c => {
          if(c && c.owner === cp && (c.id === '11' || c.id === '57')) synergy++;
        }));
        bonus += synergy * 5;
      }
      // Zimbabwean Honor Guard: self-replicating — always good
      if(move.card.id === '25') bonus += 5;
      // MINAE: remove opponent supporters
      if(move.card.id === '16') bonus += 3;
    }
  }

  else if(deckId === 'starter_soft_suppression') {
    if(move.type === 'consolidate') {
      if(move.card.id === '17') bonus += 20;
      if(move.card.id === '04') bonus += 18;
      if(move.card.id === '61') {
        let greekCount = 0;
        G.board[move.z]?.forEach(row=>row?.forEach(c=>{ if(c && c.owner===cp && c.id === '63') greekCount++; }));
        bonus += greekCount > 0 ? -4 : 10;
      }
    }
    if(move.type === 'place') {
      if(['06','13','60'].includes(move.card.id)) bonus += 9;
      if(move.card.id === '63') {
        let copies = 0;
        G.board[move.z]?.forEach(row=>row?.forEach(c=>{ if(c && c.owner===cp && c.id === '63') copies++; }));
        bonus += 8 + (copies * 8);
      }
      if(move.card.id === '61') {
        let greekCount = 0;
        G.board[move.z]?.forEach(row=>row?.forEach(c=>{ if(c && c.owner===cp && c.id === '63') greekCount++; }));
        bonus += greekCount > 0 ? -6 : 7;
      }
      if(['16','18','42','58','62','64','71'].includes(move.card.id)) bonus += 5;
    }
  }

  else if(deckId === 'ai_blitz') {
    if(move.type === 'place') {
      // Maja Kaminska is the centrepiece — always play her immediately on turn 1
      if(move.card.id === '07') bonus += (G.turn <= 1 ? 9999 : 30);
      if(['25','28'].includes(move.card.id)) bonus += move.contested ? 18 : 10;
      if(['76','65'].includes(move.card.id)) bonus += move.contested ? 10 : 4;
      if(['06','13','29','60'].includes(move.card.id)) bonus += 8;
      if(move.card.id === '63') {
        const greekZone = aiFirstOwnCardZone(c => c.id === '63');
        const copies = aiCountOwnCardsInZone(move.z, c => c.id === '63');
        bonus += 12 + copies * 10;
        if(greekZone !== null && greekZone !== move.z) bonus -= 60;
      }
    }
    if(move.type === 'consolidate') {
      // Maja consolidation also unconditional on turn 1
      if(move.card.id === '07') bonus += (G.turn <= 1 ? 9999 : 24);
      if(move.card.id === '45') {
        const greekZone = aiFirstOwnCardZone(c => c.id === '63');
        bonus += greekZone !== null && greekZone !== move.z ? 22 : 8;
      }
      if(['06','13','29'].includes(move.card.id)) bonus += 8;
    }
  }

  else if(deckId === 'ai_coordinators_dream') {
    if(move.type === 'place') {
      if(['68','24','32','58','75','69'].includes(move.card.id)) bonus += 5;
    }
    if(move.type === 'consolidate') {
      if(move.card.id === '08') bonus += 18;
      if(['15','19','23','35'].includes(move.card.id)) {
        const keyIds = ['15','19','23','35'];
        const synergy = aiCountOwnCardsInZone(move.z, c => keyIds.includes(c.id));
        bonus += 12 + synergy * 12;
      }
    }
  }

  else if(deckId === 'ai_henrys_conviction') {
    if(move.type === 'place') {
      if(['27','32','58','75','69','13','60'].includes(move.card.id)) bonus += 9;
      if(move.card.id === '63') {
        const greekZone = aiFirstOwnCardZone(c => c.id === '63');
        const copies = aiCountOwnCardsInZone(move.z, c => c.id === '63');
        bonus += 10 + copies * 10;
        if(greekZone !== null && greekZone !== move.z) bonus -= 60;
      }
    }
    if(move.type === 'consolidate') {
      if(['29','06'].includes(move.card.id)) bonus += 12;
      if(move.card.id === '21') {
        const handSize = G.players[cp].hand.length;
        bonus += handSize >= 4 ? 28 : -35;
      }
    }
  }

  else if(deckId === 'ai_howards_choice') {
    if(move.type === 'place') {
      if(move.card.id === '76') bonus += 8;
      if(move.card.id === '63') {
        const greekZone = aiFirstOwnCardZone(c => c.id === '63');
        const copies = aiCountOwnCardsInZone(move.z, c => c.id === '63');
        bonus += 10 + copies * 10;
        if(greekZone !== null && greekZone !== move.z) bonus -= 60;
      }
      if(['06','60','68','24'].includes(move.card.id)) bonus += 7;
    }
    if(move.type === 'consolidate') {
      if(move.card.id === '45') bonus += 30;
      if(move.card.id === '46') bonus += 24;
      if(['17','56','03'].includes(move.card.id)) bonus += 14;
      if(move.card.id === '67') bonus += 14;
    }
  }

  else if(deckId === 'ai_investing_future') {
    if(move.type === 'place') {
      if(['47','05','58','75','69','76','65','60','32'].includes(move.card.id)) bonus += 7;
    }
    if(move.type === 'consolidate') {
      if(move.card.id === '46') bonus += 32;
      if(move.card.id === '08') bonus += 18;
      if(move.card.id === '03') bonus += 10;
    }
  }

  else if(deckId === 'ai_royal_flush') {
    if(move.type === 'place') {
      if(move.card.id === '24') bonus += 10;
      if(['68','32','58','75','69'].includes(move.card.id)) bonus += 6;
    }
    if(move.type === 'consolidate') {
      if(['19','15','01','57','77'].includes(move.card.id)) {
        const keyIds = ['19','15','01','57','77'];
        const synergy = aiCountOwnCardsInZone(move.z, c => keyIds.includes(c.id));
        bonus += 14 + synergy * 14;
        const ralphAdj = getAdjacentAndDiagonalCards(move.z, move.r, move.c)
          .some(a => a.card.owner === cp && a.card.id === '24');
        if(ralphAdj) bonus += 12;
      }
    }
  }

  else if(deckId === 'ai_movement') {
    const rozsiZone = aiBestRozsiZone();
    if(move.type === 'place') {
      if(move.card.id === '28' && move.fromDeck) bonus += 1000 + (move.contested ? 240 : -120) + (move.z === 1 ? 140 : 0);
      if(move.card.id === '60') bonus += 95;
      if(move.card.id === '73') {
        const zoneHasRozsi = aiCountOwnCardsInZone(move.z, c => c.id === '34') > 0;
        bonus += 110;
        if(zoneHasRozsi) bonus -= 260;
        if(rozsiZone !== null && move.z !== rozsiZone) bonus += 35;
      }
      if(move.card.id === '69') {
        const alpineInZone = aiCountOwnCardsInZone(move.z, c => c.id === '73') > 0;
        bonus += alpineInZone ? 120 : 25;
      }
      if(move.card.id === '05') {
        const alpineInZone = aiCountOwnCardsInZone(move.z, c => c.id === '73') > 0;
        bonus += alpineInZone ? 100 : -20;
      }
      if(['29','06','13'].includes(move.card.id)) bonus += aiOwnBoardCardsById('34').length < 3 ? 120 : 25;
    }
    if(move.type === 'consolidate') {
      if(move.card.id === '34') {
        bonus += 420;
        if(move.z === 1) bonus += 180;
        const centerOppControl = getZoneScore(1, 1-cp) - getZoneScore(1, cp);
        if(move.z === 1 && centerOppControl > 9) bonus -= 60;
        bonus += aiCountOwnCardsInZone(move.z, c => c.id === '34') * 60;
      }
      if(['29','06','13'].includes(move.card.id)) bonus += aiOwnBoardCardsById('34').length < 3 ? 130 : 20;
      if(move.card.id === '39') bonus += 35;
    }
  }

  else if(deckId === 'ai_fat_jake') {
    const jakes = aiOwnBoardCardsById('38');
    if(move.type === 'consolidate') {
      if(move.card.id === '38') bonus += 520;
      if(move.card.id === '08') bonus += jakes.length < 3 ? 260 : 20;
      if(move.card.id === '03') {
        const closeZone = Math.abs(getZoneScore(move.z, cp) - getZoneScore(move.z, 1-cp)) <= 8;
        const hasJake = aiCountOwnCardsInZone(move.z, c => c.id === '38') > 0;
        bonus += hasJake && closeZone ? 160 : -80;
      }
      if(move.card.id === '27') bonus += 70;
    }
    if(move.type === 'place') {
      const handSupporters = G.players[cp].hand.filter(c=>c.type === 'Supporter').length;
      if(['32','42','60','58','75','80'].includes(move.card.id)) bonus += 85;
      else if(handSupporters <= Math.max(2, jakes.length + 1)) bonus -= 45;
      if(move.card.id === '54') bonus += jakes.length ? 80 : 0;
      if(move.card.id === '05') bonus += aiCountOwnCardsInZone(move.z, c => c.id === '38') ? 65 : -15;
    }
  }

  else if(deckId === 'ai_hand_leech') {
    if(move.type === 'place') {
      if(move.card.id === '28' && move.fromDeck) bonus += 900 + (move.contested ? 220 : -120) + (move.z === 1 ? 100 : 0);
      if(move.card.id === '72') bonus += 260;
      if(['58','75'].includes(move.card.id)) {
        const discardHasRobo = G.players[cp].discard.some(c => c.id === '72');
        bonus += discardHasRobo ? 180 : 60;
      }
      if(move.card.id === '16') {
        let hasOppSupporter = false;
        G.board[move.z]?.forEach(row=>row?.forEach(cell=>{ if(cell && cell.owner === 1-cp && cell.type === 'Supporter') hasOppSupporter = true; }));
        bonus += hasOppSupporter ? 130 : -30;
      }
      if(move.card.id === '05') bonus += aiCountOwnCardsInZone(move.z, c => c.id === '14') ? 115 : -20;
      if(['06','60'].includes(move.card.id)) bonus += aiOwnBoardCardsById('14').length < 3 ? 120 : 35;
    }
    if(move.type === 'consolidate') {
      if(move.card.id === '14') bonus += 420;
      if(move.card.id === '06') bonus += aiOwnBoardCardsById('14').length < 3 ? 150 : 20;
      if(move.card.id === '61') bonus += 55;
    }
  }

  return bonus;
}

// Deterministic 1-ply outcome simulation — estimates position quality after this move.
// Builds hypothetical zone scores without modifying the board, then evaluates zone control.
function aiSimulateOutcome(move) {
  const cp = G.aiPlayer, opp = 1 - cp;
  // Build hypothetical zone scores
  const hypoMy = [0, 0, 0], hypoOp = [0, 0, 0];
  for(let z = 0; z < 3; z++){
    hypoMy[z] = aiCachedZoneScore(z, cp);
    hypoOp[z] = aiCachedZoneScore(z, opp);
  }

  if(move.type === 'place'){
    hypoMy[move.z] += aiProjectedMoveFate(move);
  } else if(move.type === 'consolidate'){
    hypoMy[move.z] += aiProjectedMoveFate(move);
    for(const t of move.tributes){
      hypoMy[t.z] -= (t.card.currentFate || t.card.fate || 1);
    }
  }

  // Opponent threat: assume opponent responds in zone where they gain most advantage
  let bestOppZone = 0, bestOppGain = -Infinity;
  for(let z = 0; z < 3; z++){
    const diff = hypoMy[z] - hypoOp[z];
    // Opponent targets zones they can flip or closely contest
    const gain = (diff > 0 && diff <= 4) ? 5 : (diff <= 0) ? 3 : 1;
    if(gain > bestOppGain){ bestOppGain = gain; bestOppZone = z; }
  }
  hypoOp[bestOppZone] += 2; // average opponent supporter placement

  // Evaluate resulting position
  let zonesWon = 0, zonesLost = 0, totalMargin = 0;
  for(let z = 0; z < 3; z++){
    const diff = hypoMy[z] - hypoOp[z];
    if(diff > 0) zonesWon++;
    else if(diff < 0) zonesLost++;
    totalMargin += diff;
  }

  let score = totalMargin * 0.5;
  if(zonesWon >= 2) score += 15;
  else if(zonesLost >= 2) score -= 10;

  // Bonus for flipping a zone from losing/tied to winning
  const curMy = aiCachedZoneScore(move.z, cp);
  const curOp = aiCachedZoneScore(move.z, opp);
  if(curMy <= curOp && hypoMy[move.z] > hypoOp[move.z]) score += 6;

  return score;
}

// 2-ply deep evaluation for top-tier moves — estimates if the position holds
// after the opponent's best response.
function aiDeepEval(move) {
  const cp = G.aiPlayer, opp = 1 - cp;
  const hypoMy = [0, 0, 0], hypoOp = [0, 0, 0];
  for(let z = 0; z < 3; z++){
    hypoMy[z] = aiCachedZoneScore(z, cp);
    hypoOp[z] = aiCachedZoneScore(z, opp);
  }

  if(move.type === 'place'){
    hypoMy[move.z] += aiProjectedMoveFate(move);
  } else if(move.type === 'consolidate'){
    hypoMy[move.z] += aiProjectedMoveFate(move);
    for(const t of move.tributes) hypoMy[t.z] -= (t.card.currentFate || t.card.fate || 1);
  }

  // Opponent's best response: place ~3 fate in the zone that gains them the most
  let bestOppZone = 0, bestOppValue = -Infinity;
  for(let z = 0; z < 3; z++){
    const diff = hypoMy[z] - hypoOp[z];
    // Value of opponent placing here: flip potential > reinforce > waste
    const value = (diff > 0 && diff <= 5) ? (6 - diff) * 2 : // can flip or narrow
                  (diff <= 0) ? 3 : 0;                        // reinforce lead
    if(value > bestOppValue){ bestOppValue = value; bestOppZone = z; }
  }
  hypoOp[bestOppZone] += 3;

  // Count zones after opponent response
  let zonesWon = 0;
  for(let z = 0; z < 3; z++){
    if(hypoMy[z] > hypoOp[z]) zonesWon++;
  }
  // Reward moves that maintain a winning position even after opponent's best response
  return zonesWon >= 2 ? 3 : (zonesWon === 1 ? 0 : -2);
}

let _aiPickerPage = 0;
const AI_DIVISIONS = ['Footman','Captain-Officer','Lieutenant at Arms','Sergeant of the Guard','Commander-General','High Marshall'];
const _aiPickerHtmlCache = new Map();
let _aiPickerWarmupPromise = null;

function getAIDivisionRankData(rankName) {
  const ranks = (typeof RANKS !== 'undefined' && Array.isArray(RANKS)) ? RANKS : [];
  return ranks.find(r=>r && r.name === rankName) || (typeof getRank === 'function' ? getRank(600) : {minElo:0,name:rankName,color:'var(--gold)',bg:'rgba(201,168,76,.14)'});
}

function getAIDivisionEloRange(rankName) {
  const ranks = (typeof RANKS !== 'undefined' && Array.isArray(RANKS)) ? RANKS : [];
  const idx = ranks.findIndex(r=>r && r.name === rankName);
  if(idx < 0) return '';
  const min = ranks[idx].minElo || 0;
  const next = ranks[idx + 1];
  return next ? (min + '-' + (next.minElo - 1)) : (min + '+');
}

function buildAIDifficultyPickerHtml(page) {
  const targetPage = Math.max(0, Math.min(Number(page) || 0, AI_DIVISIONS.length-1));
  if(_aiPickerHtmlCache.has(targetPage)) return _aiPickerHtmlCache.get(targetPage);
  const rank = AI_DIVISIONS[targetPage];
  const opponents = AI_OPPONENTS.filter(a=>a.rank===rank);
  let html = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;padding-bottom:.6rem;border-bottom:1px solid var(--border);">
      <div style="font-family:'Cinzel',serif;font-size:1.4rem;color:var(--gold);">Choose Opponent</div>
      <button class="btn sm" onclick="closeAllOverlays()">Back</button>
    </div>
    <p style="color:var(--dim);font-style:italic;font-size:.82rem;margin-bottom:1rem;text-align:center;">Page through the divisions and pick the AI you want to face.</p>`;
  if(opponents.length){
    const rankData = getAIDivisionRankData(rank);
    html += `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:.7rem;margin-bottom:1rem;">
        <button class="btn sm" onclick="showAIDifficultyPicker(${targetPage-1})" ${targetPage<=0?'disabled':''}>Prev</button>
        <div class="ai-division-rank-card" style="flex:0 0 auto;text-align:center;margin:0 auto;display:flex;align-items:center;justify-content:center;background:transparent;border:0;padding:0;">
          <div class="ai-division-rank-badge" style="display:flex;align-items:center;justify-content:center;gap:.55rem;margin-bottom:0;">
            <span style="line-height:0;">${renderRankBadge(rankData.minElo || opponents[0].elo,'lg')}</span>
          </div>
        </div>
        <button class="btn sm" onclick="showAIDifficultyPicker(${targetPage+1})" ${targetPage>=AI_DIVISIONS.length-1?'disabled':''}>Next</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:.55rem;max-height:68vh;overflow-y:auto;padding-right:.3rem;">`;
    opponents.forEach(opp=>{
      const aiIndex = AI_OPPONENTS.indexOf(opp);
      const avatar = opp.img
        ? '<div class="ai-avatar ai-avatar-lg"><img src="'+opp.img+'" alt="" loading="eager" decoding="async" draggable="false" onerror="this.style.display=&quot;none&quot;"></div>'
        : '<div class="ai-avatar ai-avatar-lg"><span style="font-size:1.25rem;opacity:.72;font-family:Cinzel,serif;">AI</span></div>';
      html += '<div class="ai-diff-option" data-ai-index="'+aiIndex+'" style="cursor:pointer;padding:.85rem 1rem;border:1.5px solid var(--border);border-radius:12px;background:rgba(0,0,0,.35);transition:all .18s;display:flex;align-items:center;gap:1rem;">'
        + avatar
        + '<div style="flex:1;min-width:0;"><div style="display:flex;align-items:center;gap:.45rem;flex-wrap:wrap;"><span style="font-family:Cinzel,serif;font-size:1.02rem;color:var(--gold);font-weight:800;letter-spacing:.03em;">'+escapeHtml(opp.name)+'</span><span style="font-family:Cinzel,serif;font-size:.66rem;color:'+rankData.color+';background:'+rankData.bg+';padding:.14rem .45rem;border-radius:999px;border:1px solid '+rankData.color+'40;">'+opp.elo+' ELO</span></div><div style="font-size:.79rem;color:var(--text);font-style:italic;margin-top:.22rem;line-height:1.42;opacity:.92;">'+escapeHtml(opp.desc)+'</div></div>'
        + '<button class="btn sm pri ai-pick-btn" type="button" data-ai-index="'+aiIndex+'" style="flex-shrink:0;">Play</button></div>';
    });
    html += '</div>';
  } else {
    html += '<div style="text-align:center;color:var(--dim);padding:2rem 0;">No AI opponents found for this division.</div>';
  }
  _aiPickerHtmlCache.set(targetPage, html);
  return html;
}

function bindAIDifficultyPickerEvents() {
  document.querySelectorAll('.ai-diff-option').forEach(el=>{
    el.onmouseenter = ()=>{
      if(window.__fateMenusWarmed || window.__fateStartupWarmupActive) return;
      el.style.borderColor='var(--gold)';
      el.style.background='rgba(201,168,76,.1)';
      el.style.transform='translateX(3px)';
    };
    el.onmouseleave = ()=>{
      el.style.borderColor='var(--border)';
      el.style.background='rgba(0,0,0,.3)';
      el.style.transform='none';
    };
    el.onclick = (e)=>{
      const btn = e.target.closest('.ai-pick-btn');
      const host = e.currentTarget;
      const idx = parseInt((btn?.dataset.aiIndex || host.dataset.aiIndex || '-1'), 10);
      if(Number.isInteger(idx) && idx >= 0) pickAIOpponentByIndex(idx);
    };
  });
}

function warmAIDifficultyPickerAssets() {
  if(_aiPickerWarmupPromise) return _aiPickerWarmupPromise;
  for(let page = 0; page < AI_DIVISIONS.length; page++) buildAIDifficultyPickerHtml(page);
  const sources = Array.from(new Set((AI_OPPONENTS || []).map(ai => ai && ai.img).filter(Boolean)));
  _aiPickerWarmupPromise = Promise.all(sources.map(src => new Promise(resolve => {
    const img = new Image();
    let done = false;
    const finish = () => {
      if(done) return;
      done = true;
      resolve(src);
    };
    const timer = setTimeout(finish, 1500);
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
  return _aiPickerWarmupPromise;
}

try {
  window.fateWarmAIPickerAssets = warmAIDifficultyPickerAssets;
} catch(e) {}

function showAIDifficultyPicker(page=_aiPickerPage) {
  if(!G.aiDifficulty) G.aiDifficulty = 'medium';
  _aiPickerPage = Math.max(0, Math.min(page, AI_DIVISIONS.length-1));
  const panel = document.getElementById('difficulty-panel');
  panel.innerHTML = buildAIDifficultyPickerHtml(_aiPickerPage);
  const overlay = document.getElementById('s-difficulty-overlay');
  overlay.classList.add('on','no-edge-corners-modal');
  bindAIDifficultyPickerEvents();
}

function pickAIOpponentByIndex(aiIndex) {
  const opp = AI_OPPONENTS[aiIndex];
  if(!opp) return;
  selectAIOpponent(opp);
}

function pickAIOpponent(aiName) {
  const opp = AI_OPPONENTS.find(a=>a.name===aiName);
  if(!opp) return;
  selectAIOpponent(opp);
}

function selectAIOpponent(opp, options={}) {
  if(!opp) return;
  const skipFollowup = !!options.skipFollowup;
  G.aiDifficulty = opp.elo>=1400?'extreme':opp.elo>=1200?'hard':opp.elo>=800?'medium':'easy';

  // For AI with deckPool='starter', randomly pick one of the 4 starter decks each match
  let resolvedOpp = opp;
  if(opp.deckPool === 'starter') {
    const pool = typeof getAIDeckPoolForOpponent === 'function'
      ? getAIDeckPoolForOpponent(opp)
      : (typeof STARTER_DECKS !== 'undefined' ? STARTER_DECKS : []);
    if(pool.length > 0){
      const picked = pool[Math.floor(Math.random() * pool.length)];
      resolvedOpp = {...opp, deck: [...picked.ids], _deckStrategy: picked.baseStrategy || picked.id};
    }
  }

  const playableDeck = typeof getPlayableAIDeck === 'function' ? getPlayableAIDeck(resolvedOpp, G.aiDifficulty) : (Array.isArray(resolvedOpp.deck) ? resolvedOpp.deck.slice(0,40) : []);
  G._selectedAI = {...resolvedOpp, deck:[...playableDeck]};
  G.p2Deck = [...playableDeck];
  G.players[1].name = opp.name;
  G._aiOpponentElo = opp.elo;
  const diffOverlay = document.getElementById('s-difficulty-overlay');
  if(diffOverlay) diffOverlay.classList.remove('on');
  if(skipFollowup) return;

  // Always show deck picker in challenger mode
  if(CURRENT_MODE === 'challenger'){
    setTimeout(()=>renderChallengerDeckPickModal(0), 180);
    return;
  }

  // If deck is already set (e.g. from free play with pre-selected deck), start immediately
  if(G.p1Deck && G.p1Deck.length === 40 && G._pickDeckAfterAi) {
    G._pickDeckAfterAi = false;
    setTimeout(()=>startGame(true), 180);
    return;
  }

  G._pickDeckAfterAi = true;
  setTimeout(()=>renderChallengerDeckPickModal(0), 180);
}

function closeAllOverlays() {
  document.getElementById('s-difficulty-overlay').classList.remove('on');
  document.getElementById('s-preset-overlay').classList.remove('on');
  if(document.body) document.body.classList.remove('ai-preset-overlay-open');
}

function closePresetOverlay() {
  document.getElementById('s-preset-overlay').classList.remove('on');
  if(document.body) document.body.classList.remove('ai-preset-overlay-open');
  // Show difficulty picker again so player can change if desired
  setTimeout(()=>showAIDifficultyPicker(), 200);
}

// Overlay version of preset picker (renders over title screen background)
let _presetOverlayPage = 0;
window._presetOverlayVsAI = false;

function showPresetOverlay(vsAI, page=_presetOverlayPage) {
  const overlay = document.getElementById('s-preset-overlay');
  const isChallenger = CURRENT_MODE === 'challenger';
  overlay?.classList.add('no-edge-corners-modal');
  window._presetOverlayVsAI = !!vsAI;
  document.getElementById('preset-mode-label-ov').textContent = isChallenger
    ? 'Pick the AI opponent deck - you will use the deck you selected from your collection'
    : (vsAI ? 'Playing vs AI - pick a preset deck' : 'Select a preset deck to play with');
  const container = document.getElementById('preset-cards-ov');
  container.innerHTML = '';
  const keys = typeof getOrderedPresetKeys === 'function' ? getOrderedPresetKeys() : Object.keys(PRESET_DECKS);
  const pageSize = 3;
  const totalPages = Math.max(1, Math.ceil(keys.length / pageSize));
  _presetOverlayPage = Math.max(0, Math.min(page, totalPages - 1));
  const pageKeys = keys.slice(_presetOverlayPage * pageSize, _presetOverlayPage * pageSize + pageSize);
  if(keys.length===0){
    container.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--dim);font-style:italic;">
        No saved presets. Go to the Deck Builder to create one.
      </div>`;
  } else {
    pageKeys.forEach((pid, i)=>{
      const p = PRESET_DECKS[pid];
      const sampleIds = [...new Set(p.ids)];
      const sampleCards = sampleIds.map(id=>CARDS.find(c=>c.id===id)).filter(Boolean);
      const hero = p.faceCardId ? CARDS.find(c=>c.id===p.faceCardId) : ([...sampleCards].sort((a,b)=>(b.fate||0)-(a.fate||0))[0] || sampleCards[0]);
      const previews = (p.displayCardIds && p.displayCardIds.length>0)
        ? p.displayCardIds.map(id=>CARDS.find(c=>c.id===id)).filter(c=>c&&c.img).slice(0,7)
        : sampleCards.filter(c=>c.img).slice(0,5);
      const el = document.createElement('div');
      el.className = 'preset-browse-tile';
      el.style.animationDelay = '0s';
      const useCanvasPreview = false;
      const heroArt = hero?.img ? `<img src="${hero.img}" alt="${hero.name}" loading="lazy" decoding="async" draggable="false" onerror="this.parentElement.style.background='#0a0a0f'">` : '';
      el.innerHTML = `
        <div class="preset-tile-art">
          ${useCanvasPreview ? '<canvas class="canvas-deck-preview-hero" aria-hidden="true"></canvas>' : heroArt}
          <div class="preset-tile-overlay"></div>
        </div>
        <div class="preset-tile-info">
          <div class="preset-name">${escapeHtml(p.name)}</div>
        <div class="preset-desc">${escapeHtml(p.description||'')}</div>
          <div class="preset-minis">${useCanvasPreview ? '<canvas class="canvas-deck-preview-minis" aria-hidden="true"></canvas>' : previews.map(c=>`<div class="preset-mini-art">${c.img?`<img src="${typeof getRuntimeCardImageSrc === 'function' ? getRuntimeCardImageSrc(c.img, 'thumb') : c.img}" alt="" loading="lazy" decoding="async" draggable="false">`:''}
          </div>`).join('')}</div>
          <div class="preset-action-row">
            <button class="btn sm" onclick="event.stopPropagation();viewPresetContents('${pid}','overlay')">Preview</button>
            <button class="btn sm pri" onclick="event.stopPropagation();loadPresetAndStartOverlay('${pid}',${vsAI})">Play</button>
          </div>
        </div>`;
      container.appendChild(el);
      if(useCanvasPreview) window.scheduleCanvasDeckPreviewTile(el, {hero, minis: previews});
    });
  }
  const pageControls = document.getElementById('preset-page-controls-ov');
  if(pageControls){
    pageControls.innerHTML = `
      <button class="btn sm" onclick="showPresetOverlay(${vsAI},${_presetOverlayPage-1})" ${_presetOverlayPage<=0?'disabled':''}>Prev</button>
      <button class="btn sm" onclick="editPresetOrder('overlay')" ${keys.length<=1?'disabled':''}>Edit Order</button>
      <span style="font-family:'Cinzel',serif;font-size:.68rem;color:var(--dim);letter-spacing:.08em;">Page ${_presetOverlayPage+1} / ${totalPages}</span>
      <button class="btn sm" onclick="showPresetOverlay(${vsAI},${_presetOverlayPage+1})" ${_presetOverlayPage>=totalPages-1?'disabled':''}>Next</button>`;
  }
  const customBtn = document.getElementById('preset-custom-btn-ov');
  if(customBtn){
    customBtn.style.display = 'none';
    customBtn.disabled = true;
    customBtn.onclick = null;
    customBtn.textContent = '';
    customBtn.title = '';
    customBtn.setAttribute('aria-hidden','true');
  }
  if(document.body) document.body.classList.add('ai-preset-overlay-open');
  overlay.classList.add('on');
}

function loadPresetAndStartOverlay(pid, vsAI) {
  closeAllOverlays();
  if(document.body) document.body.classList.remove('ai-preset-overlay-open');
  // Small delay so overlays fade out before game starts
  setTimeout(()=>loadPresetAndStart(pid, vsAI), 320);
}

// Difficulty-aware settings — used by AI picks to introduce error/bias
function getAIStyleModifiers(style) {
  // Each style modifies weights to reflect personality described in AI profiles
  switch(style) {
    case 'cautious':    return { zoneSpreadBonus:1.8, riskAversion:1.7, supporterBonus:1.0, consolidateThresholdMod:2 };
    case 'reckless':    return { consolidateBonus:2.0, mistakeChanceMod:0.08, zoneCommitBonus:1.8, riskAversion:0.35, randomnessMod:0.05 };
    case 'distracted':  return { skipEffectChanceMod:0.15, randomnessMod:0.18, handHoardBonus:1.4, zoneSpreadBonus:0.8 };
    case 'methodical':  return { supporterBonus:1.8, futureValueBonus:1.3, consolidateThresholdMod:1, earlyConsolidate:true };
    case 'adaptive':    return { trailingZoneBonus:2.0, reactiveBonus:1.4, balancedZoneBonus:1.0, handHoardBonus:1.2 };
    case 'disciplined': return { highFateBonus:1.7, zoneEfficiencyBonus:1.5, tempoBonus:0.9, mistakeChanceMod:-0.03 };
    case 'disruptive':  return { debuffBonus:2.2, opponentZoneBonus:1.9, consolidateBonus:1.1, randomnessMod:0.04 };
    case 'diplomatic':  return { effectBonus:1.8, balancedZoneBonus:1.7, supporterBonus:1.4, zoneSpreadBonus:0.8 };
    case 'resourceful': return { handHoardBonus:1.7, lateGameBonus:1.8, futureValueBonus:1.5, effectBonus:1.2 };
    case 'commanding':  return { contestedZoneBonus:2.2, highFateBonus:1.5, consolidateBonus:1.5, bullyBonus:0.8 };
    case 'calculating': return { futureValueBonus:2.0, effectBonus:1.1, consolidateThresholdMod:-1, mistakeChanceMod:-0.05 };
    case 'relentless':  return { zoneCommitBonus:2.3, consolidateBonus:1.8, contestedZoneBonus:1.2, riskAversion:0.45 };
    case 'efficient':   return { highFateBonus:2.0, supporterBonus:1.2, tempoBonus:1.2, handHoardBonus:0.7 };
    case 'elusive':     return { faceDownBonus:2.0, debuffBonus:1.7, opponentZoneBonus:1.5, futureValueBonus:1.0 };
    case 'visionary':   return { futureValueBonus:2.3, effectBonus:2.0, consolidateBonus:1.4, zoneSpreadBonus:0.7 };
    case 'inevitable':  return { highFateBonus:2.2, consolidateBonus:2.2, contestedZoneBonus:2.0, riskAversion:0.4 };
    case 'omniscient':  return { futureValueBonus:2.5, reactiveBonus:2.0, trailingZoneBonus:2.0, effectBonus:1.6, mistakeChanceMod:-0.06 };
    case 'overwhelming': return { highFateBonus:2.4, contestedZoneBonus:2.4, consolidateBonus:2.1, tempoBonus:1.5, riskAversion:0.25 };
    case 'aggro':       return { contestedZoneBonus:1.7, tempoBonus:1.6, zoneCommitBonus:1.2, riskAversion:0.55 };
    case 'control':     return { debuffBonus:1.8, opponentZoneBonus:1.5, futureValueBonus:1.2, riskAversion:1.1 };
    case 'defensive':   return { zoneSpreadBonus:1.6, riskAversion:1.8, balancedZoneBonus:1.1, consolidateThresholdMod:1 };
    case 'balanced':    return { balancedZoneBonus:1.7, zoneSpreadBonus:1.1, supporterBonus:0.9, highFateBonus:0.8 };
    case 'tempo':       return { tempoBonus:2.2, contestedZoneBonus:1.0, effectBonus:1.1, consolidateThresholdMod:-1 };
    case 'blitz':       return { tempoBonus:2.5, contestedZoneBonus:1.5, zoneCommitBonus:1.5, mistakeChanceMod:0.04, riskAversion:0.35 };
    case 'lockdown':    return { zoneCommitBonus:2.0, debuffBonus:1.4, opponentZoneBonus:1.3, riskAversion:0.8 };
    case 'zone_specialist': return { contestedZoneBonus:1.7, trailingZoneBonus:1.7, balancedZoneBonus:1.5, highFateBonus:0.8 };
    case 'hoarder':     return { handHoardBonus:2.2, futureValueBonus:1.5, riskAversion:1.4, consolidateThresholdMod:2 };
    case 'gambler':     return { randomnessMod:0.3, consolidateBonus:1.7, highFateBonus:1.2, riskAversion:0.25, mistakeChanceMod:0.05 };
    case 'bully':       return { bullyBonus:2.2, opponentZoneBonus:1.8, zoneCommitBonus:1.4, debuffBonus:0.9 };
    case 'turtle':      return { riskAversion:2.2, zoneSpreadBonus:1.9, handHoardBonus:1.3, consolidateThresholdMod:3 };
    case 'combo':       return { futureValueBonus:2.4, effectBonus:2.0, supporterBonus:1.4, skipEffectChanceMod:-0.04 };
    case 'swarm':       return { supporterBonus:1.9, zoneSpreadBonus:1.7, tempoBonus:1.3, consolidateThresholdMod:1 };
    case 'sniper':      return { opponentZoneBonus:2.2, debuffBonus:1.8, contestedZoneBonus:0.9, zoneSpreadBonus:0.4 };
    case 'collector':   return { futureValueBonus:1.9, supporterBonus:1.5, handHoardBonus:1.1, zoneSpreadBonus:0.9 };
    case 'sacrificial': return { sacrificialBonus:2.2, consolidateBonus:2.0, riskAversion:0.3, highFateBonus:1.0 };
    case 'opportunist': return { trailingZoneBonus:1.8, contestedZoneBonus:1.5, tempoBonus:1.2, randomnessMod:0.08 };
    case 'chaotic':     return { randomnessMod:0.35, tempoBonus:1.2, consolidateBonus:1.2, mistakeChanceMod:0.08, riskAversion:0.6 };
    default:            return {};
  }
}

function getAIDifficultySettings() {
  const d = G.aiDifficulty || 'medium';
  const customElo = G._aiOpponentElo || null;

  // If playing against a specific AI opponent in challenger/free play, use true ELO competence
  if(G._selectedAI && typeof getDailyTrueElo === 'function' && CURRENT_MODE !== 'title') {
    const trueElo = getDailyTrueElo(G._selectedAI);
    const comp = getAICompetenceFromTrueElo(trueElo);
    const styleModifiers = getAIStyleModifiers(G._selectedAI.style || '');
    return {...comp, ...styleModifiers, opponentElo: customElo || G._selectedAI.elo};
  }

  // Title screen free play uses fixed ELO = true ELO (no boost)
  switch(d){
    case 'easy':    return {mistakeChance:0.35, skipEffectChance:0.2, consolidateThreshold:10, opponentElo:customElo||800};
    case 'medium':  return {mistakeChance:0.15, skipEffectChance:0.08, consolidateThreshold:8, opponentElo:customElo||1000};
    case 'hard':    return {mistakeChance:0.05, skipEffectChance:0.02, consolidateThreshold:6, opponentElo:customElo||1200};
    case 'extreme': return {mistakeChance:0, skipEffectChance:0, consolidateThreshold:5, opponentElo:customElo||1400};
    default:        return {mistakeChance:0.15, skipEffectChance:0.08, consolidateThreshold:8, opponentElo:customElo||1000};
  }
}

async function aiDoPlace(choice) {
  if(G.currentPlayer !== G.aiPlayer) return;
  const hand = G.players[G.aiPlayer].hand;
  const cp = G.aiPlayer;
  const sourceList = choice.fromDeck ? G.players[cp].deck : hand;
  const idx = sourceList.indexOf(choice.card);
  if(idx<0) return;
  const card = sourceList[idx];
  const isEffectFree = !!(G._linaFreeIids && G._linaFreeIids.has(card.iid));
  const inst = newInstance(card);
  inst.owner = cp;
  inst.currentFate = getPlacedCardFate(card);
  if(typeof applyLandscapePlacementBonuses === 'function') applyLandscapePlacementBonuses(inst, choice.z, choice.r, choice.c);
  consumePendingPlacementFlags(card, inst);
  const commitAiPlace = function(){
    G.board[choice.z][choice.r][choice.c] = inst;
    if(typeof applyRiveraBuffToPlacedCard === 'function') applyRiveraBuffToPlacedCard(inst, inst.owner);
    const majaDeckCinematic = !!choice.freeMajaFromDeck && card.id === '07' && typeof showConsolidationCinematic === 'function';
    if(majaDeckCinematic) {
      G._cinematicUiLockUntil = Math.max(G._cinematicUiLockUntil || 0, Date.now() + 90 + 2350);
      setTimeout(function(){ showConsolidationCinematic(inst, {playVoice:true, playSfx:true}); }, 90);
    }
    sourceList.splice(idx,1);
    if(card.type==='Supporter') {
      if(!isEffectFree) G.supportsPlacedThisTurn++;
      if(!Array.isArray(G.supportersSetP)) G.supportersSetP = [0,0];
      G.supportersSetP[cp] = (Number(G.supportersSetP[cp]) || 0) + 1;
      inst._supporterSetCounted = true;
      inst._wasSetAsSupporter = true;
      inst._hasBeenOnBoard = true;
      inst._supporterSetOwner = cp;
      if(typeof noteBalladSupporterSet === 'function') noteBalladSupporterSet(cp);
    }
    if(isEffectFree && G._linaFreeIids) G._linaFreeIids.delete(card.iid);
    if(choice.fromDeck && card.id==='28'){
      G._polishUsedThisTurn = true;
      if(!Array.isArray(G.polishArmyUses)) G.polishArmyUses = [0,0];
      G.polishArmyUses[cp] = (G.polishArmyUses[cp] || 0) + 1;
    }
    // Anicka Konvicka (02) Starlit Path: any card placed in her zone by her controller gains 3 Fate.
    G.board[choice.z].forEach(row=>row.forEach(cell=>{
      if(cell && cell.id==='02' && cell.owner===cp && cell.iid!==inst.iid && !isFaceDownCard(cell)){
        modifyFate(inst,3,'permanent');
      }
    }));
    if(!majaDeckCinematic) {
      if(typeof playCardSoundDeferred === 'function') playCardSoundDeferred(card.id, 0);
      else setTimeout(function(){ playCardSound(card.id); }, 0);
      const aiSetSfx = card.rarity === 'star' ? 'starPlace' : 'place';
      if(typeof playSfxDeferred === 'function') playSfxDeferred(aiSetSfx, 0);
      else setTimeout(function(){ playSfx(aiSetSfx); }, 0);
    }
    log('p2', `AI placed ${card.name} in Zone ${choice.z+1}`);
    if(typeof renderBoardActionForPlayer === 'function') renderBoardActionForPlayer(cp, {hand:true, blocks:false, topbar:false, effects:false, hover:false});
    else renderGame({board:true, scores:true, oppHand:true});
  };
  const presenter = window.FateActionPresentation;
  let presented = false;
  if(presenter && typeof presenter.beginSetCard === 'function'){
    presented = await new Promise(resolve=>{
      const started = presenter.beginSetCard({
        sourceCard:card,
        inst,
        target:{z:choice.z, r:choice.r, c:choice.c},
        commit:function(){ commitAiPlace(); resolve(true); },
        rollback:function(){
          delete card._presentationDeparting;
          if(typeof renderBoardActionForPlayer === 'function') renderBoardActionForPlayer(cp, {hand:true, blocks:false, topbar:false, effects:false, hover:false});
          else renderGame({board:true, scores:true, oppHand:true});
          resolve(false);
        }
      });
      if(!started) resolve(false);
    });
  }
  if(!presented) commitAiPlace();
  await resolveSetCardAfterPlacement(inst, choice.z, choice.r, choice.c);
  if(typeof renderBoardActionForPlayer === 'function') renderBoardActionForPlayer(cp, {hand:false, blocks:false, topbar:false, effects:false, hover:false});
  else renderGame({board:true, scores:true});
  await aiSleep(AI_VISUAL_PAUSE_PLACE);
}

async function aiDoConsolidate(choice) {
  if(G.currentPlayer !== G.aiPlayer) return;
  const cp = G.aiPlayer;
  const hand = G.players[cp].hand;
  const idx = hand.indexOf(choice.card);
  if(idx<0) return;

  // Check Deterrance in affected zones
  const affectedZones = [...new Set(choice.tributes.map(t=>t.z))];
  affectedZones.forEach(tz=>{
    G.board[tz].forEach(row=>row.forEach(cell=>{
      if(cell&&cell.id==='36'&&cell.owner!==cp){
        G.fateModifiers['deterrance_z'+tz] = (G.fateModifiers['deterrance_z'+tz]||0) - 3;
      }
    }));
  });

  // Pick target tribute slot: prefer AI's safe row (row 0), then contested, then opponent's side
  const aiSafeRow = cp===0?2:0;
  const scored = choice.tributes.map(t=>{
    let score = 0;
    if(t.r === aiSafeRow) score += 10;
    else if(t.r === 1) score += 5;
    return {t, score};
  }).sort((a,b)=>b.score - a.score);
  const requestedTarget = choice.tributes.find(t=>t.z===choice.z && t.r===choice.r && t.c===choice.c);
  const target = requestedTarget || scored[0].t;
  const chaparralSource = getUnusedChaparralAmbusherInZone(target.z, cp);
  const useFaceDown = !!chaparralSource && (
    choice.card.type === 'Dauntless' ||
    WHEN_SET_IDS.has(choice.card.id) ||
    (choice.card.fate||0) >= 3
  );

  let bonusFate = 0;
  choice.tributes.forEach(t=>{
    if(t.card.id==='47') bonusFate+=3;
    if(t.card.id==='86') bonusFate+=4;
  });

  const inst = newInstance(choice.card);
  inst.owner = cp;
  inst.currentFate = getPlacedCardFate(choice.card, {bonusFate, tributeCount: choice.tributes.length});
  if(typeof applyLandscapePlacementBonuses === 'function') applyLandscapePlacementBonuses(inst, target.z, target.r, target.c);
  if(typeof trackLandscapeConsolidation === 'function') trackLandscapeConsolidation(cp, inst, target.z);
  inst.faceDown = useFaceDown;
  if(useFaceDown) {
    inst._suppressPlacementAnimation = true;
    inst._suppressCinematicSubtitle = true;
  }
  consumePendingPlacementFlags(choice.card, inst);
  const commitAiConsolidation = function(presentationDelay){
    const motionMs = Math.max(0, Number(presentationDelay) || 0);
    try {
      choice.tributes.forEach(t=>{
        if(t.card && t.card.id === '09' && t.card.usesLeft > 0) {
          t.card.usesLeft--;
          if(!Array.isArray(G.un5thUses)) G.un5thUses = [0,0];
          G.un5thUses[cp] = (Number(G.un5thUses[cp]) || 0) + 1;
        }
      });
      choice.tributes.forEach(t=>{
        if(t && t.card) t.card._suppressDiscardVfx = true;
        discardBoardCard(t.card, t.z, t.r, t.c);
      });
    } catch(err) {
      console.error('AI consolidation tribute spend failed after validation', err);
    } finally {
      G.board[target.z][target.r][target.c] = inst;
    }
    if(typeof applyRiveraBuffToPlacedCard === 'function') applyRiveraBuffToPlacedCard(inst, inst.owner);
    const placementDelay = motionMs ? 0 : Math.min(360, 180 + choice.tributes.length * 40);
    if(useFaceDown && chaparralSource?.card) chaparralSource.card._chaparralAmbushUsed = true;
    let cinematicRequested = false;
    const requestConsolidationCinematic = function(){
      if(cinematicRequested || typeof showConsolidationCinematic !== 'function') return;
      const shown = showConsolidationCinematic(inst, {playVoice:true, playSfx:true, allowRenderV2Cinematic:true});
      if(shown !== false) cinematicRequested = true;
    };
    if(!useFaceDown && typeof showConsolidationCinematic === 'function') {
      G._cinematicUiLockUntil = Math.max(G._cinematicUiLockUntil || 0, Date.now() + Math.max(0, placementDelay || 0) + 90 + 2350);
      setTimeout(requestConsolidationCinematic, Math.max(0, placementDelay || 0) + 90);
    }

    hand.splice(idx,1);
    log('p2', `AI consolidated ${choice.card.name} into Zone ${target.z+1}${useFaceDown ? ' face down' : ''}`);
    if(typeof renderBoardActionForPlayer === 'function') renderBoardActionForPlayer(cp, {hand:true, piles:true, blocks:false, topbar:false, effects:false, hover:false});
    else renderGame({board:true, scores:true, piles:true, oppHand:true, blocks:true, topbar:true});
  };
  const presenter = window.FateActionPresentation;
  let presented = false;
  if(presenter && typeof presenter.beginConsolidation === 'function'){
    presented = await new Promise(resolve=>{
      const started = presenter.beginConsolidation({
        tributes:choice.tributes,
        card:choice.card,
        inst,
        faceDown:useFaceDown,
        target:{z:target.z, r:target.r, c:target.c},
        present:function(){
          if(window.FateV2CardMotionFx && typeof window.FateV2CardMotionFx.crashTributes === 'function'){
            return window.FateV2CardMotionFx.crashTributes(choice.tributes, {
              card:inst,
              resultCard:inst,
              z:target.z,
              r:target.r,
              c:target.c,
              faceDown:useFaceDown
            }) || 0;
          }
          return 0;
        },
        commit:function(tx, delay){ commitAiConsolidation(delay); resolve(true); },
        rollback:function(){
          if(typeof renderBoardActionForPlayer === 'function') renderBoardActionForPlayer(cp, {hand:true, piles:true, blocks:false, topbar:false, effects:false, hover:false});
          else renderGame({board:true, scores:true, piles:true, oppHand:true, blocks:true, topbar:true});
          resolve(false);
        }
      });
      if(!started) resolve(false);
    });
  }
  if(!presented) commitAiConsolidation(0);
  await resolveSetCardAfterPlacement(inst, target.z, target.r, target.c);
  if(typeof renderBoardActionForPlayer === 'function') renderBoardActionForPlayer(cp, {hand:false, piles:false, blocks:false, topbar:false, effects:false, hover:false});
  else renderGame({board:true, scores:true});
  await aiSleep(AI_VISUAL_PAUSE_CONSOLIDATE);
}

async function aiRunBoardPlacementPresentation(opts) {
  const options = opts || {};
  if(typeof options.commit !== 'function') return false;
  const presenter = window.FateActionPresentation;
  if(presenter && typeof presenter.beginBoardPlacement === 'function'){
    const presented = await new Promise(resolve=>{
      const started = presenter.beginBoardPlacement(Object.assign({}, options, {
        commit:function(tx){ options.commit(tx); resolve(true); },
        rollback:function(tx, err){
          try{ if(typeof options.rollback === 'function') options.rollback(tx, err); }catch(e){}
          resolve(false);
        }
      }));
      if(!started) resolve(false);
    });
    if(presented) return true;
  }
  options.commit(null);
  return false;
}

// â”€â”€ AI-friendly trigger for 'when set' (auto-picks targets) â”€â”€
async function aiTriggerWhenSet(inst, z, r, c) {
  if(!inst || isFaceDownCard(inst)) return;
  const cp = G.currentPlayer;
  const opp = 1-cp;
  const id = inst.id;

  if(typeof applyRiveraBuffToPlacedCard === 'function') applyRiveraBuffToPlacedCard(inst, inst.owner);

  if(G.oppSuppressedNextTurn && G.suppressTarget===cp && inst.type==='Supporter') {
    showBlockedAnimation('Effect SUPPRESSED - Semper Fidelis');
    return;
  }

  if(inst.type==='Supporter' && typeof WHEN_SET_IDS !== 'undefined' && WHEN_SET_IDS.has(inst.id) && !G._suppressEffectPrompt){
    const affectedOwners = typeof getSupporterEffectAffectedOwners === 'function'
      ? getSupporterEffectAffectedOwners(inst, z, r, c, cp, opp)
      : [];
    const proceed = await checkReactions('supporter_effect', {card:inst, z, r, c, sourceOwner:cp, affectedOwners});
    if(!proceed) return;
  }
  if(inst.type==='Initiator' && !G._suppressEffectPrompt){
    const affectedOwners = typeof getCharacterEffectAffectedOwners === 'function'
      ? getCharacterEffectAffectedOwners(inst, z, r, c, cp, opp)
      : [];
    const proceed = await checkReactions('initiator_effect', {card:inst, z, r, c, sourceOwner:cp, affectedOwners});
    if(!proceed){
      inst.effectUsedInitial = true;
      inst._effectTurnLocked = true;
      return;
    }
  }
  if(inst.type!=='Supporter' && inst.type!=='Initiator' && !G._suppressEffectPrompt && typeof getCharacterEffectAffectedOwners === 'function'){
    const affectedOwners = getCharacterEffectAffectedOwners(inst, z, r, c, cp, opp);
    if(affectedOwners.includes(opp)){
      const proceed = await checkReactions('targeting_effect', {card:inst, z, r, c, sourceOwner:cp, affectedOwners});
      if(!proceed) return;
    }
  }

  switch(id) {
    case '02': { // Anicka Konvicka: create extra safe row in this zone
      if(typeof addFullExtraSafeRowForPlayer === 'function') addFullExtraSafeRowForPlayer(z, cp, 'Starlit Path', {landscape:false});
      else {
        if(!G.extraRows) G.extraRows=[0,0,0];
        if(!G.extraRowOwners) G.extraRowOwners=[[],[],[]];
        if(!G.extraRowFullOwners) G.extraRowFullOwners=[null,null,null];
        const nextRow = 3 + (Number(G.extraRows[z]) || 0);
        G.extraRows[z]++;
        if(!G.extraRowOwners[z]) G.extraRowOwners[z] = [];
        G.extraRowOwners[z][nextRow - 3] = cp;
        G.extraRowFullOwners[z] = cp;
        if(!G.board[z][nextRow]) G.board[z][nextRow] = Array(3).fill(null);
      }
      log('p2','AI: Anicka created an extra safe row in Zone '+(z+1));
      break;
    }
    case '12': { // Makenna: make up to 2 friendly cards in the zone immune
      inst.effectUsedInitial = true;
      const own = [];
      G.board[z].forEach(row=>row.forEach(cell=>{
        if(cell && cell.owner===cp && !cell.immuneFlag) own.push(cell);
      }));
      own.sort((a,b)=>(b.currentFate||b.fate||0)-(a.currentFate||a.fate||0));
      own.slice(0,2).forEach(card=>{ card.immuneFlag = true; });
      if(own.length) log('p2','AI: Makenna made '+Math.min(2, own.length)+' card(s) immune');
      break;
    }
    case '14': { // Alondra Hopkins: discard adjacent/diagonal opposing supporters, gain Fate
      const targets = getAdjacentAndDiagonalCards(z,r,c).filter(a=>a.card.owner===opp && a.card.type==='Supporter' && a.card.id!=='76' && !a.card.immuneFlag);
      let gained = 0;
      targets.forEach(t=>{
        G.board[t.z][t.r][t.c] = null;
        fatePushDiscard(opp, t.card);
        gained++;
      });
      if(gained) {
        inst.currentFate = (inst.currentFate || inst.fate || 0) + gained;
        log('p2','AI: Alondra discarded '+gained+' adjacent supporter(s)');
      }
      break;
    }
    case '05': { // Liberators of Rwanda: +3 fate to own card in zone
      const own = [];
      G.board[z].forEach((row,rr)=>row.forEach((cell,cc)=>{if(cell&&cell.owner===cp&&cell.iid!==inst.iid) own.push(cell);}));
      if(own.length){
        // Deck-aware: Maelstrom prioritizes Alondra (14)
        const strat = G._selectedAI?._deckStrategy || '';
        let target = null;
        if(strat === 'starter_maelstrom') target = own.find(c => c.id === '14');
        if(strat === 'ai_hand_leech') target = own.find(c => c.id === '14');
        if(strat === 'ai_movement') target = own.find(c => c.id === '73');
        if(!target) target = aiPickByPriority(own, aiDeckSearchPriority(strat, 'character'));
        if(!target) { own.sort((a,b)=>b.currentFate - a.currentFate); target = own[0]; }
        modifyFate(target, 3, 'permanent');
        log('p2', `AI: Liberators of Rwanda +3 Fate to ${target.name}`);
      } break;
    }
    case '25': { // Zimbabwean Honor Guard: set another copy from hand/deck for free
      if(G._zimbabweUsedThisTurn) break;
      const handCopy = G.players[cp].hand.find(c=>c.id==='25');
      const deckCopy = G.players[cp].deck.find(c=>c.id==='25');
      const copy = handCopy || deckCopy;
      if(!copy) break;
      const rows = [1, getSafeRowForPlayer(cp)];
      const zones = [z, 0, 1, 2].filter((value, index, arr)=>arr.indexOf(value)===index);
      const slots = [];
      zones.forEach(zi=>{
        rows.forEach(ri=>{
          const row = G.board[zi]?.[ri];
          if(!row) return;
          const cap = getBoardRowCapacity(zi, ri);
          for(let ci=0; ci<cap; ci++){
            if(!row[ci] && !isBlocked(zi, ri, ci)) slots.push({z:zi,r:ri,c:ci});
          }
        });
      });
      if(!slots.length) break;
      G._zimbabweUsedThisTurn = true;
      G.players[cp].hand = G.players[cp].hand.filter(c=>c.iid!==copy.iid);
      G.players[cp].deck = G.players[cp].deck.filter(c=>c.iid!==copy.iid);
      const extra = newInstance(copy);
      extra.owner = cp;
      extra.currentFate = getPlacedCardFate(extra);
      const slot = slots[0];
      await aiRunBoardPlacementPresentation({
        sourceCard:copy,
        inst:extra,
        owner:cp,
        source:handCopy ? 'hand' : 'deck',
        recipe:handCopy ? 'PLAY_CARD' : 'DECK_TO_BOARD',
        target:{z:slot.z, r:slot.r, c:slot.c},
        commit:function(){
          G.board[slot.z][slot.r][slot.c] = extra;
          log('p2','AI: Zimbabwean Honor Guard set another copy for free');
          if(typeof renderBoardActionForPlayer === 'function') renderBoardActionForPlayer(cp, {hand:!!handCopy, blocks:false, topbar:false, effects:false, hover:false});
          else renderGame({board:true, scores:true, oppHand:!!handCopy, blocks:true, topbar:true});
        }
      });
      await aiTriggerWhenSet(extra, slot.z, slot.r, slot.c);
      break;
    }
    case '32': await drawCard(cp,1); break;
    case '42': { // draw 2, discard 2
      await drawCard(cp,2);
      const h = G.players[cp].hand;
      // Discard worst 2 cards (lowest fate supporters)
      const sorted = [...h].sort((a,b)=>(a.fate||0)-(b.fate||0));
      for(let i=0;i<2&&sorted[i];i++){
        const c = sorted[i];
        G.players[cp].hand = G.players[cp].hand.filter(x=>x.iid!==c.iid);
        fatePushDiscard(cp, c);
      }
      break;
    }
    case '31': { // Hemorrhaging Wound: -3 fate opp card in zone
      const opps=[];
      G.board[z].forEach(row=>row.forEach(cell=>{if(cell&&cell.owner===opp) opps.push(cell);}));
      if(opps.length){
        opps.sort((a,b)=>b.currentFate - a.currentFate);
        const target = opps[0];
        const before = target.currentFate || target.fate || 0;
        const changed = setCardFateValue(target, before - 3, cp);
        if(changed || before <= 0){
          log('p2', `AI: Hemorrhaging Wound -3 Fate to ${target.name}`);
        }
      } break;
    }
    case '16': { // MINAE: discard opp supporter in zone
      const opps=[];
      G.board[z].forEach((row,rr)=>row.forEach((cell,cc)=>{
        if(cell&&cell.owner===opp&&cell.type==='Supporter') opps.push({card:cell,r:rr,c:cc});
      }));
      if(opps.length){
        opps.sort((a,b)=>b.card.currentFate - a.card.currentFate);
        const t = opps[0];
        G.board[z][t.r][t.c]=null;
        fatePushDiscard(opp, t.card);
        log('p2', `AI: MINAE discarded ${t.card.name}`);
      } break;
    }
    case '18': G.oppSuppressedNextTurn=true; G.suppressTarget=opp; break;
    case '33': // West Caribbea Infantry: next character added to hand gets boosted
      G._westCaribNext = { owner: cp };
      if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
      break;
    case '34': { // Rozsi Szocs: declare best affiliation in zone, +2 Fate
      const counts = {};
      G.board[z].forEach(row=>row.forEach(cell=>{
        if(cell && cell.owner===cp) counts[cell.aff] = (counts[cell.aff]||0)+1;
      }));
      const best = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
      if(best){
        let boosted = 0;
        G.board[z].forEach(row=>row.forEach(cell=>{
          if(cell && cell.owner===cp && cell.aff===best[0]){
            modifyFate(cell, 2, 'permanent');
            boosted++;
          }
        }));
        log('p2','AI: Rozsi boosted '+boosted+' '+(AFF_LABEL[best[0]]||best[0])+' card(s)');
      }
      break;
    }
    case '35': { // Alexander: snapshot Fate from friendly Supporters in zone
      let total = 0;
      G.board[z].forEach(row=>row.forEach(cell=>{
        if(cell && cell.owner===cp && cell.iid!==inst.iid && cell.type==='Supporter'){
          total += Number(cell.currentFate ?? cell.fate ?? 0) || 0;
        }
      }));
      inst.currentFate = total;
      log('p2','AI: Alexander set with '+total+' Fate from Supporters');
      break;
    }
    case '45': { // Chingachlook: placement restriction is enforced before setting.
      break;
    }
    case '46': // Phil: begins gaining Fate on future draw phases
      inst._philSetTurn = G.turn;
      break;
    case '48': { // Cosmic GF: add Expanded Worlds from deck and discard
      ['deck','discard'].forEach(zoneName=>{
        const list = G.players[cp][zoneName];
        const pick = list.find(c=>c.aff==='expanded_worlds');
        if(!pick) return;
        if(typeof addCardToHand==='function') addCardToHand(cp, pick, { announce:false });
        else G.players[cp].hand.push(pick);
        G.players[cp][zoneName] = list.filter(c=>c.iid!==pick.iid);
      });
      shuffle(G.players[cp].deck);
      if(typeof renderBoardActionForPlayer === 'function') renderBoardActionForPlayer(cp, {hand:true, piles:true, blocks:false, topbar:false, effects:false, hover:false});
      else renderGame({board:true, scores:true, oppHand:true, piles:true, blocks:true, topbar:true});
      break;
    }
    case '50': { // Berkeley CS Major: lock the opponent out of their best-looking zone
      let bestZone = 1;
      let bestScore = -Infinity;
      for(let zi=0; zi<3; zi++){
        let occupied = 0;
        G.board[zi].forEach(row=>row.forEach(cell=>{ if(cell && cell.owner===opp) occupied++; }));
        const score = getZoneScore(zi, opp) * 2 + occupied;
        if(score > bestScore){ bestScore = score; bestZone = zi; }
      }
      applyArtilleryLock(bestZone, cp);
      break;
    }
    case '51': { // Rivera: declare an affiliation for the +3 Fate buff
      const pool = [...G.players[cp].hand, ...G.players[cp].deck].filter(c => {
        if(!c || !c.aff || c.id === '51') return false;
        return typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(Object.assign({owner:cp}, c), cp) : c.type !== 'Supporter';
      });
      const counts = {reality:0, third_great_war:0, expanded_worlds:0, eventide:0};
      pool.forEach(c => { if(counts[c.aff] !== undefined) counts[c.aff] += 1; });
      const aff = Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0] || inst.aff || 'eventide';
      if(typeof startRiveraBuff === 'function') startRiveraBuff(inst, aff, inst.owner != null ? inst.owner : cp);
      inst.effectUsedInitial = true;
      log('p2', 'AI: Rivera declared ' + ((typeof AFF_LABEL !== 'undefined' && AFF_LABEL[aff]) || aff) + ' for matching characters for 3 turns');
      if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
      break;
    }
    case '58': { // Crossroads: add supporter from discard
      const sups = typeof getRecoverableDiscardCards === 'function' ? getRecoverableDiscardCards(cp, c=>c.type==='Supporter') : G.players[cp].discard.filter(c=>c.type==='Supporter');
      if(sups.length){
        // Deck-aware: prioritize recycling key supporters
        const strat = G._selectedAI?._deckStrategy || '';
        const priorities = aiDeckSearchPriority(strat, 'supporter').length ? aiDeckSearchPriority(strat, 'supporter')
          : strat === 'starter_maelstrom' ? ['05','47'] // 17th British, Great Oak
          : strat === 'starter_incel' ? ['31'] // Oathbound Noble Fighter
          : strat === 'starter_assault' ? ['59','05'] // Maroon Knights, 17th British
          : strat === 'starter_soft_suppression' ? ['63','18','16','71','42','62','64']
          : [];
        let best = sups.find(c => priorities.includes(c.id));
        if(!best) { sups.sort((a,b)=>(b.fate||0)-(a.fate||0)); best = sups[0]; }
        if(typeof addCardToHand==='function') addCardToHand(cp, best, { announce:false });
        else G.players[cp].hand.push(best);
        G.players[cp].discard = G.players[cp].discard.filter(c=>c.iid!==best.iid);
        log('p2', `AI: Crossroads recycled ${best.name}`);
      } break;
    }
    case '60': { // IB Student: search deck for supporter
      const sups = G.players[cp].deck.filter(c=>c.type==='Supporter');
      if(sups.length){
        const strat = G._selectedAI?._deckStrategy || '';
        const priorities = aiDeckSearchPriority(strat, 'supporter').length ? aiDeckSearchPriority(strat, 'supporter')
          : strat === 'starter_soft_suppression'
          ? ['63','18','16','71','42','62','64']
          : [];
        let pick = sups.find(c=>priorities.includes(c.id));
        if(!pick) pick = sups[0];
        if(typeof addCardToHand==='function') addCardToHand(cp, pick, { announce:false });
        else G.players[cp].hand.push(pick);
        G.players[cp].deck = G.players[cp].deck.filter(c=>c.iid!==pick.iid);
        shuffle(G.players[cp].deck);
      } break;
    }
    case '61': { // Maria Song: pick highest-fate opp card, discard copies
      let best=null, bestFate=-1;
      G.board.forEach(zone=>zone.forEach(row=>row.forEach(cell=>{
        if(cell && cell.owner===opp && (cell.currentFate||cell.fate) > bestFate){
          bestFate = cell.currentFate||cell.fate;
          best = cell;
        }
      })));
      if(best){
        const targetId = best.id;
        let discarded = 0;
        ['hand','deck'].forEach(zone=>{
          const list = G.players[opp][zone];
          const stillThere = [];
          list.forEach(c=>{
            if(c.id===targetId){ fatePushDiscard(opp, c); discarded++; }
            else stillThere.push(c);
          });
          G.players[opp][zone] = stillThere;
        });
        if(typeof showMariaDiscardBadge === 'function') {
          let pos = null;
          if(typeof forEachBoardCard === 'function') forEachBoardCard(function(cell,z,r,c){ if(!pos && cell && cell.iid === best.iid) pos = {z,r,c}; });
          showMariaDiscardBadge(best, discarded, pos && pos.z, pos && pos.r, pos && pos.c);
        }
        if(discarded) log('p2',`AI: Maria Song discarded ${discarded} ${best.name}`);
      } break;
    }
    case '62': // Berkeley Homeless: pick any open cell
      inst.noConsolidate = true;
      inst.berkeleyHomeless = true;
      const opponentSafeRow = cp===0 ? 0 : 2;
      for(let zi=0;zi<3;zi++){
        for(let ri=0;ri<G.board[zi].length;ri++){
          for(let ci=0;ci<3;ci++){
            if(ri===opponentSafeRow && !G.board[zi][ri][ci] && !G.blockedCells.some(b=>b.z===zi&&b.r===ri&&b.c===ci)){
              G.board[z][r][c] = null;
              G.board[zi][ri][ci] = inst;
              log('p2','AI: Berkeley Homeless moved to an open square');
              return; // exit runAIWhenSet
            }
          }
        }
      }
      break;
    case '64': // Cook Islands Duelist: passive handled in getEffectiveFate
      break;
    case '66': { // Mark Menz: pick majority own affiliation in zone
      const affCounts = {};
      G.board[z].forEach(row=>row.forEach(cell=>{
        if(cell && cell.owner===cp && cell.iid!==inst.iid) affCounts[cell.aff] = (affCounts[cell.aff]||0)+1;
      }));
      const bestAff = Object.entries(affCounts).sort((a,b)=>b[1]-a[1])[0];
      if(bestAff){
        let changed = 0;
        G.board[z].forEach(row=>row.forEach(cell=>{
          if(cell && cell.owner===cp && cell.iid!==inst.iid && !cell.immuneFlag && cell.aff!==bestAff[0]){
            cell.aff = bestAff[0];
            if(typeof applyRiveraBuffToPlacedCard === 'function') applyRiveraBuffToPlacedCard(cell, cp);
            changed++;
          }
        }));
        if(changed) modifyFate(inst, changed, 'permanent');
        log('p2',`AI: Mark Menz changed ${changed} cards`);
      } break;
    }
    case '68': { // Great Oak High Schooler: add Coordinator from deck
      const coords = G.players[cp].deck.filter(c=>c.type==='Coordinator' && c.rarity!=='star');
      if(coords.length){
        const strat = G._selectedAI?._deckStrategy || '';
        const pick = aiPickByPriority(coords, aiDeckSearchPriority(strat, 'coordinator')) || coords[0];
        if(typeof addCardToHand==='function') addCardToHand(cp, pick, { announce:false });
        else G.players[cp].hand.push(pick);
        G.players[cp].deck = G.players[cp].deck.filter(c=>c.iid!==pick.iid);
        shuffle(G.players[cp].deck);
        if(typeof renderBoardActionForPlayer === 'function') renderBoardActionForPlayer(cp, {hand:true, piles:true, blocks:false, topbar:false, effects:false, hover:false});
        else renderGame({board:true, scores:true, oppHand:true, piles:true, blocks:true, topbar:true});
      } break;
    }
    case '69': { // Breakfast Republic Busser: find any friendly supporter, move & re-activate
      const friendlySupporters = [];
      G.board.forEach((zone,zi)=>zone.forEach((row,ri)=>row.forEach((cell,ci)=>{
        if(cell && cell.owner===cp && cell.type==='Supporter' && cell.iid!==inst.iid){
          friendlySupporters.push({card:cell,z:zi,r:ri,c:ci});
        }
      })));
      const strat = G._selectedAI?._deckStrategy || '';
      const busserTargets = strat === 'ai_movement'
        ? friendlySupporters.filter(entry => entry.card.id === '73')
        : friendlySupporters;
      if(busserTargets.length){
        const src = busserTargets[0];
        // Find an open contested or friendly safe square in this zone
        const ownerSafeRow = cp === 0 ? 2 : 0;
        for(let rr=0;rr<G.board[z].length;rr++){
          if(rr !== 1 && rr !== ownerSafeRow) continue;
          for(let cc=0;cc<3;cc++){
            if(!G.board[z][rr][cc] && !G.blockedCells.some(b=>b.z===z&&b.r===rr&&b.c===cc) && !(rr===r&&cc===c)){
              G.board[src.z][src.r][src.c] = null;
              G.board[z][rr][cc] = src.card;
              src.card.whenSetActivated = false;
              aiTriggerWhenSet(src.card, z, rr, cc);
              src.card.whenSetActivated = true;
              log('p2',`AI: Corner! Behind! moved ${src.card.name} and re-activated`);
              return;
            }
          }
        }
      }
      break;
    }
    case '71': // Fort Calvin Watcher: set reveal flag
      if(!G._fortCalvinActive) G._fortCalvinActive=[];
      G._fortCalvinActive.push({owner:cp,remaining:3}); break;
    case '72': { // Robo: steal random card from opp hand
      const oh=G.players[opp].hand;
      if(oh.length){const i=Math.floor(Math.random()*oh.length);const s=oh.splice(i,1)[0];s._stolenByRobo=true;s._roboOrigOwner=opp;if(typeof addCardToHand==='function') addCardToHand(cp,s,{announce:false});else G.players[cp].hand.push(s);log('p2',`AI: Robo stole ${s.name}`);}
      break;
    }
    case '73': { // ALPINE Expeditionary: discard non-Dauntless/Coordinator chars
      let tf=0;const td=[];
      G.board[z].forEach((row,ri)=>row.forEach((cell,ci)=>{
        if(cell&&cell.owner===cp&&cell.type!=='Supporter'&&cell.type!=='Dauntless'&&cell.type!=='Coordinator'&&cell.iid!==inst.iid){td.push({r:ri,c:ci,card:cell});tf+=(cell.currentFate||cell.fate);}
      }));
      td.forEach(x=>{G.board[z][x.r][x.c]=null;fatePushDiscard(cp, x.card);});
      if(tf>0) modifyFate(inst,tf,'permanent');
      inst._canMoveOncePerTurn=true; break;
    }
    case '75': { // Ledger-keepers: copy a useful supporter when-set effect
      const copyableIds = ['05','16','25','31','32','33','42','43','50','58','60','68','69','71','72','73','76','80'];
      const candidates = [];
      forEachBoardCard((card,bz,br,bc)=>{
        if(card.type==='Supporter' && card.iid!==inst.iid && copyableIds.includes(card.id) && !isFaceDownCard(card)){
          candidates.push({card,z:bz,r:br,c:bc});
        }
      });
      if(candidates.length){
        const strat = G._selectedAI?._deckStrategy || '';
        const deckPriority = aiDeckSearchPriority(strat, 'supporter');
        const priority = deckPriority.length
          ? deckPriority.concat(['68','60','58','05','25','50','42','32','72','16','31','64','73','80','76','71','33','69'])
          : ['68','60','58','05','25','50','42','32','72','16','31','64','73','80','76','71','33','69'];
        candidates.sort((a,b)=>{
          const ap = priority.indexOf(a.card.id);
          const bp = priority.indexOf(b.card.id);
          return (ap<0?999:ap) - (bp<0?999:bp);
        });
        const originalId = inst.id;
        inst.id = candidates[0].card.id;
        aiTriggerWhenSet(inst, z, r, c);
        inst.id = originalId;
        log('p2','AI: Ledger-keepers copied '+candidates[0].card.name);
      }
      break;
    }
    case '80': { // Apparition: discard a character, draw 2
      const chars=[];
      G.board[z].forEach((row,ri)=>row.forEach((cell,ci)=>{
        if(cell&&cell.owner===cp&&(typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(cell, cp) : cell.type!=='Supporter')&&cell.iid!==inst.iid) chars.push({r:ri,c:ci,card:cell});
      }));
      if(chars.length){const t=chars[0];G.board[z][t.r][t.c]=null;fatePushDiscard(cp, t.card);await drawCard(cp,2);log('p2',`AI: Apparition discarded ${t.card.name}, drew 2`);}
      break;
    }
    case '84': { // Kvetka Svoboda: set an Expanded Worlds character from deck for free
      const matches = G.players[cp].deck.filter(c=>{
        const base = (typeof CARDS !== 'undefined' && Array.isArray(CARDS)) ? CARDS.find(x=>String(x.id) === String(c.id)) : null;
        const aff = String((c.aff || (base && base.aff) || '')).toLowerCase().replace(/\s+/g, '_');
        const type = String(c.type || (base && base.type) || '').toLowerCase();
        const rarity = String(c.rarity || (base && base.rarity) || '').toLowerCase();
        const effectiveCard = Object.assign({}, base || {}, c || {}, {owner: cp});
        return aff === 'expanded_worlds' &&
          type && (type !== 'supporter' || (typeof isCardCharacterForRules === 'function' && isCardCharacterForRules(effectiveCard, cp))) &&
          rarity !== 'star' &&
          String(c.id) !== '84';
      });
      if(matches.length) {
        matches.sort((a,b)=>(Number(b.fate)||0)-(Number(a.fate)||0));
        const picked = matches[0];
        G.players[cp].deck = G.players[cp].deck.filter(c=>c.iid!==picked.iid);
        if(typeof addCardToHand === 'function') addCardToHand(cp, picked, {announce:false});
        else G.players[cp].hand.push(picked);
        if(!G._linaFreeIids) G._linaFreeIids = new Set();
        G._linaFreeIids.add(picked.iid);
        if(typeof recordHandCardEffectModifier === 'function' && !(typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(picked))) {
          recordHandCardEffectModifier(picked, {
            key:'kvetka-svoboda-free-set',
            name:'Kvetka Svoboda',
            text:'Flower Picking: this card can be set immediately for free.'
          });
        }
        log('p2','AI: Kvetka prepared '+picked.name+' for free placement');
      }
      inst.effectUsedInitial = true;
      break;
    }
    case '37': inst.opponentEffectImmune = true; inst.immuneFlag = true; break;
    case '76': inst.currentFate=5; inst.immuneFlag=true; inst.noBonus=true; inst.noConsolidate=true; break;
    case '20':
      if(!G.shieldWallZones.includes(z)) G.shieldWallZones.push(z);
      if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
      break;
  }
}

// â”€â”€ Activate useful character effects â”€â”€
async function aiActivateEffects() {
  if(G.currentPlayer !== G.aiPlayer) return;
  const cp = G.aiPlayer;
  const activated = new Set();
  const settings = getAIDifficultySettings();
  // Style personality modifiers
  const _style = G._selectedAI ? (G._selectedAI.style || '') : '';
  const _sm = typeof getAIStyleModifiers === 'function' ? getAIStyleModifiers(_style) : {};

  const faceDownCards = [];
  forEachBoardCard((card,z,r,c)=>{
    if(card.owner===cp && isFaceDownCard(card)) faceDownCards.push({card,z,r,c});
  });
  for(const hidden of faceDownCards){
    const delay = flipFaceDownBoardCard(hidden.card, hidden.z, hidden.r, hidden.c);
    await aiSleep((delay || 0) + 60);
  }
  // Collect all own characters on board
  const toActivate = [];
  forEachBoardCard((card,z,r,c)=>{
    if(card.owner===cp && card.type!=='Supporter' && !activated.has(card.iid) && !isFaceDownCard(card)){
      if(String(card.id) === '21' && card.effectUsedInitial) return;
      toActivate.push({card,z,r,c});
    }
  });
  // Sort: activate high-impact effects first (doublers, halvers, buff-all)
  const effectPriority = {'40':13,'07':12,'21':11,'03':10,'30':9,'01':8,'46':8,'57':8,'29':7,'27':7,'08':7,'06':7,'38':7,'23':6,'11':6,'15':6,'19':6,'10':5,'bh25':9};
  // Easier AIs process in random order (miss optimal sequencing)
  if(Math.random() < settings.mistakeChance){
    toActivate.sort(()=>Math.random()-0.5);
  } else {
    toActivate.sort((a,b)=>(effectPriority[b.card.id]||0)-(effectPriority[a.card.id]||0));
  }
  for(const {card,z,r,c} of toActivate){
    activated.add(card.iid);
    // Easier AIs sometimes skip activating a useful effect
    const mustUseMajaOpening = card.id === '07' && G.turn <= 2;
    if(!mustUseMajaOpening && Math.random() < settings.skipEffectChance){
      log('p2',`AI skipped ${card.name}'s effect`);
      continue;
    }
    if(typeof shouldShowManualCharacterEffectButton === 'function'
      && shouldShowManualCharacterEffectButton(card)
      && typeof playEffectActivationCinematic === 'function') {
      await playEffectActivationCinematic(card, z, r, c, {source:'ai-manual-character'});
    }
    await aiRunEffect(card, z, r, c);
    await aiSleep(AI_VISUAL_PAUSE_EFFECTS);
  }

  const supporterActions = [];
  forEachBoardCard((card,z,r,c)=>{
    if(card.owner===cp && card.type==='Supporter' && !isFaceDownCard(card) && ['52','54','73'].includes(card.id)){
      supporterActions.push({card,z,r,c});
    }
  });
  supporterActions.sort((a,b)=>({'52':3,'73':2,'54':1}[b.card.id]||0)-({'52':3,'73':2,'54':1}[a.card.id]||0));
  for(const action of supporterActions){
    await aiRunSupporterBoardAbility(action.card, action.z, action.r, action.c);
    await aiSleep(AI_VISUAL_PAUSE_EFFECTS);
  }
}

async function aiRunSupporterBoardAbility(card, z, r, c) {
  if(G.currentPlayer !== G.aiPlayer) return;
  const cp = G.aiPlayer;
  const opp = 1 - cp;
  if(card.id==='52' && !card.vigilanteUsed){
    const sacrifices = [];
    forEachBoardCard((bc,bz,br,bc2)=>{
      if(bc.owner===cp && bc.type==='Supporter' && bc.iid!==card.iid && !bc.noConsolidate && bc.id!=='76'){
        sacrifices.push({card:bc,z:bz,r:br,c:bc2});
      }
    });
    if(sacrifices.length < 3) return;
    const targets = [];
    forEachBoardCard((bc,bz,br,bc2)=>{ if(bc.owner===opp && !bc.immuneFlag) targets.push({card:bc,z:bz,r:br,c:bc2}); });
    if(!targets.length) return;
    sacrifices.sort((a,b)=>(a.card.currentFate||a.card.fate||0)-(b.card.currentFate||b.card.fate||0));
    targets.sort((a,b)=>(b.card.currentFate||b.card.fate||0)-(a.card.currentFate||a.card.fate||0));
    sacrifices.slice(0,3).forEach(s=>{ G.board[s.z][s.r][s.c]=null; fatePushDiscard(cp, s.card); });
    const target = targets[0];
    G.board[target.z][target.r][target.c]=null;
    fatePushDiscard(opp, target.card);
    card.vigilanteUsed = true;
    log('p2','AI: Vigilantes destroyed '+target.card.name);
    if(typeof renderBoardActionForPlayer === 'function') renderBoardActionForPlayer(cp, {hand:false, piles:true, blocks:false, topbar:false, effects:false, hover:false});
    else renderGame({board:true, scores:true, piles:true, blocks:true, topbar:true});
    return;
  }
  if(card.id==='54' && !card.wolfCreekUsed){
    const movable = [];
    G.board[z].forEach((row,ri)=>row.forEach((cell,ci)=>{
      if(cell && cell.owner===cp && cell.iid!==card.iid && !cell.cantBeMoved) movable.push({card:cell,z,r:ri,c:ci});
    }));
    if(!movable.length) return;
    const open = [];
    const safeRow = getSafeRowForPlayer(cp);
    for(let zi=0; zi<3; zi++){
      [1, safeRow].forEach(ri=>{
        const row = G.board[zi]?.[ri];
        if(!row) return;
        for(let ci=0; ci<getBoardRowCapacity(zi,ri); ci++){
          if(!row[ci] && !isBlocked(zi,ri,ci)) open.push({z:zi,r:ri,c:ci});
        }
      });
    }
    if(!open.length) return;
    movable.sort((a,b)=>(b.card.currentFate||b.card.fate||0)-(a.card.currentFate||a.card.fate||0));
    open.sort((a,b)=>(getZoneScore(a.z,opp)-getZoneScore(a.z,cp))-(getZoneScore(b.z,opp)-getZoneScore(b.z,cp)));
    const src = movable[0], dest = open[open.length-1];
    G.board[src.z][src.r][src.c] = null;
    G.board[dest.z][dest.r][dest.c] = src.card;
    card.wolfCreekUsed = true;
    log('p2','AI: Wolf Creek moved '+src.card.name);
    if(typeof renderBoardActionForPlayer === 'function') renderBoardActionForPlayer(cp, {hand:false, blocks:false, topbar:false, effects:false, hover:false});
    else renderGame({board:true, scores:true, blocks:true, topbar:true});
    return;
  }
  if(card.id==='73' && card._canMoveOncePerTurn && !card._expMoved && !card.cantBeMoved){
    const safeRow = getSafeRowForPlayer(cp);
    const open = [];
    for(let zi=0; zi<3; zi++){
      const row = G.board[zi]?.[safeRow];
      if(!row) continue;
      for(let ci=0; ci<getBoardRowCapacity(zi,safeRow); ci++){
        if(!row[ci] && !isBlocked(zi,safeRow,ci)) open.push({z:zi,r:safeRow,c:ci});
      }
    }
    if(!open.length) return;
    const strat = G._selectedAI?._deckStrategy || '';
    let dest = null;
    if(strat === 'ai_movement') {
      const rozsiZone = aiBestRozsiZone();
      if(rozsiZone !== null && z !== rozsiZone) {
        dest = open.find(slot => slot.z === rozsiZone);
      } else if(rozsiZone !== null && z === rozsiZone) {
        const outside = open.filter(slot => slot.z !== rozsiZone);
        outside.sort((a,b)=>(getZoneScore(b.z,opp)-getZoneScore(b.z,cp))-(getZoneScore(a.z,opp)-getZoneScore(a.z,cp)));
        dest = outside[0] || null;
      }
    }
    if(!dest) {
      open.sort((a,b)=>(getZoneScore(a.z,opp)-getZoneScore(a.z,cp))-(getZoneScore(b.z,opp)-getZoneScore(b.z,cp)));
      dest = open[open.length-1];
    }
    G.board[z][r][c] = null;
    G.board[dest.z][dest.r][dest.c] = card;
    card._expMoved = true;
    log('p2','AI: ALPINE Expeditionary redeployed');
    if(typeof renderBoardActionForPlayer === 'function') renderBoardActionForPlayer(cp, {hand:false, blocks:false, topbar:false, effects:false, hover:false});
    else renderGame({board:true, scores:true, blocks:true, topbar:true});
  }
}

async function aiRunEffect(card, z, r, c) {
  if(G.currentPlayer !== G.aiPlayer) return;
  const cp = G.aiPlayer;
  const opp = 1-cp;
  let effectNeedsBlocks = false;
  // Skip if this character's effect was already used
  if(String(card.id) === '21' && card.effectUsedInitial) return;
  if(card.effectUsedInitial && card.type!=='Dauntless' && card.type!=='Improvisor') return;
  if(card.type==='Initiator' && !G._suppressEffectPrompt){
    const affectedOwners = typeof getCharacterEffectAffectedOwners === 'function'
      ? getCharacterEffectAffectedOwners(card, z, r, c, cp, opp)
      : [];
    const proceed = await checkReactions('initiator_effect', {card, z, r, c, sourceOwner:cp, affectedOwners});
    if(!proceed){
      card.effectUsedInitial = true;
      card._effectTurnLocked = true;
      return;
    }
  }
  switch(card.id){
    case '03': { // Howard: double highest-fate own card, then +5
      const own=[]; G.board[z].forEach(row=>row.forEach(cell=>{if(cell&&cell.owner===cp&&cell.iid!==card.iid&&!cell.immuneFlag) own.push(cell);}));
      if(own.length){
        const strat = G._selectedAI?._deckStrategy || '';
        let target = strat === 'ai_fat_jake' ? own.find(c => c.id === '38') : null;
        if(!target) {
          own.sort((a,b)=>(b.currentFate||b.fate||0)-(a.currentFate||a.fate||0));
          target = own[0];
        }
        const before = Number(target.currentFate ?? target.fate ?? 0) || 0;
        target.currentFate = Math.max(0, Math.ceil(before * 2) + 5);
        log('p2',`AI: Howard boosted ${target.name} to ${target.currentFate} Fate`);
      }
      break;
    }
    case '04': { // Zoe: lock one open square in this zone against consolidation
      const openCells = [];
      const totalRows = G.board[z] ? G.board[z].length : 3;
      const ownSafeRow = typeof getSafeRowForPlayer === 'function' ? getSafeRowForPlayer(cp) : (cp === 0 ? 2 : 0);
      const opponentSafeRow = typeof getSafeRowForPlayer === 'function' ? getSafeRowForPlayer(opp) : (cp === 0 ? 0 : 2);
      for(let rr=0; rr<totalRows; rr++){
        if(rr === ownSafeRow) continue;
        const rowCap = getBoardRowCapacity(z, rr);
        for(let cc=0; cc<rowCap; cc++){
          if(G.board[z][rr] && !G.board[z][rr][cc] && !G.blockedCells.some(b=>b.z===z&&b.r===rr&&b.c===cc)){
            let score = 0;
            getAdjacentAndDiagonalCards(z, rr, cc).forEach(adj=>{
              if(adj.card.owner===opp) score += 3;
              else if(adj.card.owner===cp) score += 1;
            });
            if(rr === opponentSafeRow) score += 10;
            else if(rr === 1) score += 1;
            if(cc === 1) score += 1;
            openCells.push({r:rr,c:cc,score});
          }
        }
      }
      if(openCells.length){
        openCells.sort((a,b)=>b.score-a.score);
        const best = openCells[0];
        G.blockedCells.push({z,r:best.r,c:best.c,type:'zoe',owner:cp,blockedPlayer:opp});
        effectNeedsBlocks = true;
        if(typeof showBlockVisual === 'function') showBlockVisual(z,best.r,best.c,'zoe');
        if(typeof playSfx === 'function') playSfx('zoeBlock');
        if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
        log('p2',`AI: Zoe locked Zone ${z+1} row ${best.r+1} col ${best.c+1}`);
      }
      break;
    }
    case '06': { // Jorge: search deck for a non-star card
      const deckCards = G.players[cp].deck.filter(c=>c.rarity!=='star');
      if(deckCards.length){
        const strat = G._selectedAI?._deckStrategy || '';
        let pick = null;
        pick = aiPickByPriority(deckCards, aiDeckSearchPriority(strat, 'jorge'));
        if(strat === 'starter_freeworld') pick = deckCards.find(c => c.id === '77');
        if(strat === 'starter_soft_suppression') pick = deckCards.find(c => c.id === '17') || deckCards.find(c => c.id === '04') || deckCards.find(c => c.id === '61');
        if(!pick) pick = deckCards.sort((a,b)=>(b.fate||0)-(a.fate||0))[0];
        if(typeof addCardToHand==='function') addCardToHand(cp, pick, { announce:false });
        else G.players[cp].hand.push(pick);
        G.players[cp].deck = G.players[cp].deck.filter(c=>c.iid!==pick.iid);
        shuffle(G.players[cp].deck);
        log('p2', `AI: Jorge searched for ${pick.name}`);
      }
      break;
    }
    case '10': // Dylan: passive-only, continuous aura handled in getEffectiveFate
      break;
    case '11': // Anne Stone: passive-only, handled in getEffectiveFate
      break;
    case '15': // Zsofia: passive-only, handled in getEffectiveFate
      break;
    case '19': // Kvetka: passive-only, handled in getEffectiveFate
      break;
    case '23': // Cathy: passive-only, handled in getEffectiveFate
      break;
    case '01': // Felicyta: passive-only, handled in getEffectiveFate
      break;
    case '46': // Phil: initialized on set, no manual activation
      if(card.effectUsedInitial) return;
      card._philSetTurn = G.turn;
      break;
    case '86':
    case '100':
      break;
    case '99':
      if(typeof activateBlameGameEffect === 'function') activateBlameGameEffect(cp, card);
      card.effectUsedInitial = true;
      break;
    case '17': { // Carolyn: permanently lock any open square
      const openCells = [];
      const ownSafeRow = typeof getSafeRowForPlayer === 'function' ? getSafeRowForPlayer(cp) : (cp === 0 ? 2 : 0);
      const opponentSafeRow = typeof getSafeRowForPlayer === 'function' ? getSafeRowForPlayer(opp) : (cp === 0 ? 0 : 2);
      for(let zz=0; zz<3; zz++){
        const totalRows = G.board[zz] ? G.board[zz].length : 3;
        for(let rr=0; rr<totalRows; rr++){
          const rowCap = getBoardRowCapacity(zz, rr);
          for(let cc=0; cc<rowCap; cc++){
            if(typeof isOwnSafeRowSquare === 'function' && isOwnSafeRowSquare(zz, rr, cc, cp)) continue;
            if(G.board[zz][rr] && !G.board[zz][rr][cc] && !G.blockedCells.some(b=>b.z===zz&&b.r===rr&&b.c===cc&&b.type==='carolyn')){
              let score = 0;
              getAdjacentAndDiagonalCards(zz, rr, cc).forEach(adj=>{
                if(adj.card.owner===opp) score += 3;
                else if(adj.card.owner===cp) score += 1;
              });
              if(zz === z) score += 1;
              if(rr === opponentSafeRow) score += 11;
              else if(rr === 1) score += 1;
              if(cc === 1) score += 1;
              openCells.push({z:zz,r:rr,c:cc,score});
            }
          }
        }
      }
      if(openCells.length){
        openCells.sort((a,b)=>b.score-a.score);
        const best = openCells[0];
        const existing = G.blockedCells.find(b=>b.z===best.z&&b.r===best.r&&b.c===best.c);
        if(existing) { existing.type = 'carolyn'; existing.owner = cp; existing.blockedPlayer = null; }
        else G.blockedCells.push({z:best.z,r:best.r,c:best.c,type:'carolyn',owner:cp,blockedPlayer:null});
        effectNeedsBlocks = true;
        if(typeof showBlockVisual === 'function') showBlockVisual(best.z,best.r,best.c,'carolyn');
        log('p2',`AI: Carolyn permanently locked Zone ${best.z+1} row ${best.r+1} col ${best.c+1}`);
      }
      break;
    }
    case '30': { // Santiago: discard opponent card in this zone's contested row
      const opps=[];
      const contested = G.board[z]?.[1] || [];
      contested.forEach((cell, cc)=>{ if(cell&&cell.owner===opp&&!cell.immuneFlag&&cell.id!=='76') opps.push({card:cell,c:cc}); });
      if(opps.length){
        opps.sort((a,b)=>(b.card.currentFate||b.card.fate||0)-(a.card.currentFate||a.card.fate||0));
        const target = opps[0];
        discardBoardCard(target.card, z, 1, target.c);
        log('p2',`AI: El Matador discarded ${target.card.name}`);
      }
      break;
    }
    case '39': { // Juan Carlos: move strongest enemy card into this zone
      const openCells = [];
      const forbiddenRow = cp===0 ? 2 : 0;
      const totalRows = G.board[z] ? G.board[z].length : 3;
      for(let rr=0; rr<totalRows; rr++){
        const rowCap = getBoardRowCapacity(z, rr);
        for(let cc=0; cc<rowCap; cc++){
          if(rr!==forbiddenRow && G.board[z][rr] && !G.board[z][rr][cc] && !isBlocked(z, rr, cc)) openCells.push({r:rr,c:cc});
        }
      }
      if(!openCells.length) break;
      const targets = [];
      G.board.forEach((zone,zz)=>zone.forEach((row,rr)=>row.forEach((cell,cc)=>{
        if(cell && cell.owner===opp && !cell.cantBeMoved) targets.push({card:cell,z:zz,r:rr,c:cc});
      })));
      if(targets.length){
        targets.sort((a,b)=>(b.card.currentFate||b.card.fate||0)-(a.card.currentFate||a.card.fate||0));
        const dest = openCells[0];
        const target = targets[0];
        G.board[target.z][target.r][target.c] = null;
        G.board[z][dest.r][dest.c] = target.card;
        log('p2',`AI: Juan Carlos moved ${target.card.name} into Zone ${z+1}`);
      }
      break;
    }
    case '27': await drawCard(cp,3); log('p2','AI: Kazumi drew 3'); break;
    case '07': { // Maja Kaminska: search up to 3 deck supporters, buff them, then +2 supporter plays
      const sources = G.players[cp].deck.filter(c=>c.type==='Supporter');
      const strat = G._selectedAI?._deckStrategy || '';
      const priorities = aiDeckSearchPriority(strat, 'supporter');
      sources.sort((a,b)=>{
        const ap = aiPriorityIndex(a, priorities);
        const bp = aiPriorityIndex(b, priorities);
        if(ap !== bp) return ap - bp;
        return (b.fate||0) - (a.fate||0);
      });
      let added = 0;
      for(const c of sources) {
        if(added >= 3) break;
        if(typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(c)) continue;
        c.currentFate = Math.max(0, Number(c.currentFate ?? c.fate) || 0) + 4;
        if(typeof recordHandCardEffectModifier === 'function') {
          recordHandCardEffectModifier(c, {
            key:'maja-kaminska-oblique-order',
            name:'Maja Kaminska',
            text:'Oblique Order: this Supporter gained +4 Fate permanently.',
            fateDelta:4
          });
        }
        if(typeof addCardToHand==='function') addCardToHand(cp, c, { announce:false });
        else G.players[cp].hand.push(c);
        G.players[cp].deck = G.players[cp].deck.filter(x=>x.iid!==c.iid);
        added++;
      }
      G.extraSupportsThisTurn = (Number(G.extraSupportsThisTurn) || 0) + 2;
      if(added) shuffle(G.players[cp].deck);
      log('p2', `AI: Maja searched ${added} supporter${added===1?'':'s'}, gave them +4 Fate, and unlocked 2 extra supporters`);
      if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
      break;
    }
    case '43': { // Mark Kemper: add one extra safe cell
      if(typeof addBottomSafeSquareForPlayer === 'function') addBottomSafeSquareForPlayer(z, cp, 1);
      effectNeedsBlocks = true;
      log('p2', `AI: Mark Kemper added one safe square in Zone ${z+1}`);
      if(typeof renderBoardActionForPlayer === 'function') renderBoardActionForPlayer(cp, {hand:false, blocks:true, topbar:false, effects:false, hover:false});
      else renderGame({board:true, scores:true});
      if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
      break;
    }
    case '29': { // Dylan Kirby: add 2 Third Great War
      const recoverableTgw = typeof getRecoverableDiscardCards === 'function' ? getRecoverableDiscardCards(cp, c=>c.aff==='third_great_war') : G.players[cp].discard.filter(c=>c.aff==='third_great_war');
      const from=[...G.players[cp].deck.filter(c=>c.aff==='third_great_war'),...recoverableTgw];
      const strat = G._selectedAI?._deckStrategy || '';
      const priorities = aiDeckSearchPriority(strat, 'dylan');
      from.sort((a,b)=>{
        const ap = aiPriorityIndex(a, priorities);
        const bp = aiPriorityIndex(b, priorities);
        if(ap !== bp) return ap - bp;
        return (b.fate||0) - (a.fate||0);
      });
      let added=0;
      for(const c of from){
        if(added>=2) break;
        if(typeof addCardToHand==='function') addCardToHand(cp, c, { announce:false });
        else G.players[cp].hand.push(c);
        G.players[cp].deck=G.players[cp].deck.filter(x=>x.iid!==c.iid);
        G.players[cp].discard=G.players[cp].discard.filter(x=>x.iid!==c.iid);
        added++;
      }
      if(added) log('p2',`AI: Leader of Free World added ${added} cards`);
      break;
    }
    case '08': { // Lina: search for a Reality card from deck/discard, set for free
      // Deck strategy: Incel deck always searches for Jimmy (41)
      const recoverableReality = typeof getRecoverableDiscardCards === 'function' ? getRecoverableDiscardCards(cp, c=>c.aff==='reality') : G.players[cp].discard.filter(c=>c.aff==='reality');
      const sources = [...G.players[cp].deck.filter(c=>c.aff==='reality'), ...recoverableReality];
      if(sources.length) {
        const strat = G._selectedAI?._deckStrategy || '';
        // Prioritize Jimmy (41) for Incel deck, otherwise pick highest fate
        let pick = aiPickByPriority(sources, aiDeckSearchPriority(strat, 'lina'));
        if(!pick) pick = strat === 'starter_soft_suppression'
          ? (sources.find(c => c.id === '17') || sources.find(c => c.id === '04') || sources.find(c => c.id === '61'))
          : sources.find(c => c.id === '41');
        if(!pick) {
          sources.sort((a,b) => (b.fate||0) - (a.fate||0));
          pick = sources[0];
        }
        const fromDiscard = recoverableReality.some(x=>x && x.iid===pick.iid);
        G.players[cp].deck = G.players[cp].deck.filter(x=>x.iid!==pick.iid);
        G.players[cp].discard = G.players[cp].discard.filter(x=>x.iid!==pick.iid);
        let placed = false;
        for(let zi=0; zi<3 && !placed; zi++){
          if(typeof G._artilleryLockedZone==='number' && G._artilleryLockedZone===zi && G._artilleryLockOwner===cp && G._artilleryLockTurnsLeft>0) continue;
          if(typeof getChingachlookPlacementBlockReason === 'function' && getChingachlookPlacementBlockReason(pick, zi, cp)) continue;
          for(let ri=0; ri<G.board[zi].length && !placed; ri++){
            for(let ci=0; ci<getBoardRowCapacity(zi, ri) && !placed; ci++){
              const legalRow = typeof isContestedOrOwnSafeSquare === 'function'
                ? isContestedOrOwnSafeSquare(zi, ri, ci, cp)
                : (ri === 1 || ri === (cp === 0 ? 2 : 0));
              if(!legalRow) continue;
              if(!G.board[zi][ri][ci] && !isBlocked(zi, ri, ci)){
                const placedCard = newInstance(pick);
                placedCard.owner = cp;
                placedCard.currentFate = getPlacedCardFate(pick);
                if(typeof applyLandscapePlacementBonuses === 'function') applyLandscapePlacementBonuses(placedCard, zi, ri, ci);
                consumePendingPlacementFlags(pick, placedCard);
                let placementDelay = 0;
                await aiRunBoardPlacementPresentation({
                  sourceCard:pick,
                  inst:placedCard,
                  owner:cp,
                  source:fromDiscard ? 'discard' : 'deck',
                  recipe:fromDiscard ? 'PLAY_CARD' : 'DECK_TO_BOARD',
                  target:{z:zi, r:ri, c:ci},
                  commit:function(tx){
                    G.board[zi][ri][ci] = placedCard;
                    placementDelay = tx && tx.presentMs ? Math.max(0, Number(tx.presentMs) || 0) : 0;
                    if(typeof renderBoardActionForPlayer === 'function') renderBoardActionForPlayer(cp, {hand:false, blocks:false, topbar:false, effects:false, hover:false});
                    else renderGame({board:true, scores:true, blocks:true, topbar:true});
                  }
                });
                if(placedCard.type !== 'Supporter' && typeof showConsolidationCinematic === 'function') {
                  G._cinematicUiLockUntil = Math.max(G._cinematicUiLockUntil || 0, Date.now() + Math.max(0, placementDelay || 0) + 90 + 2300);
                  setTimeout(function(){ showConsolidationCinematic(placedCard, {playVoice:true, playSfx:true, allowRenderV2Cinematic:true}); }, Math.max(0, placementDelay || 0) + 90);
                }
                if(typeof aiTriggerWhenSet === 'function' && WHEN_SET_IDS.has(placedCard.id)) await aiTriggerWhenSet(placedCard, zi, ri, ci);
                placed = true;
              }
            }
          }
        }
        if(!placed){
          if(typeof addCardToHand==='function') addCardToHand(cp, pick, { announce:false });
          else G.players[cp].hand.push(pick);
        }
        log('p2', `AI: Lina searched for ${pick.name}`);
      }
      break;
    }
    case '13': { // Johnathan Kirby: search deck for 2 supporters
      const deckSups = G.players[cp].deck.filter(c=>c.type==='Supporter');
      // Deck strategy: Maelstrom prioritizes Great Oak Infantry (47) for consolidation fodder
      // Incel prioritizes Oathbound Noble Fighter (31)
      // Assault prioritizes Czechoslovak Maroon Knights (59)
      const strat = G._selectedAI?._deckStrategy || '';
      const priorityIds = aiDeckSearchPriority(strat, 'supporter').length ? aiDeckSearchPriority(strat, 'supporter')
        : strat === 'starter_maelstrom' ? ['47','05']
        : strat === 'starter_incel' ? ['31','58']
        : strat === 'starter_assault' ? ['59','05']
        : strat === 'starter_freeworld' ? ['59','42','37']
        : strat === 'starter_soft_suppression' ? ['63','18','16','71','42','62','64']
        : [];
      // Sort: priority cards first, then by fate descending
      deckSups.sort((a,b) => {
        const aP = priorityIds.indexOf(a.id) >= 0 ? 1 : 0;
        const bP = priorityIds.indexOf(b.id) >= 0 ? 1 : 0;
        if(bP !== aP) return bP - aP;
        return (b.fate||0) - (a.fate||0);
      });
      let added = 0;
      for(const c of deckSups) {
        if(added >= 2) break;
        if(typeof addCardToHand==='function') addCardToHand(cp, c, { announce:false });
        else G.players[cp].hand.push(c);
        G.players[cp].deck = G.players[cp].deck.filter(x=>x.iid!==c.iid);
        added++;
      }
      if(added) { shuffle(G.players[cp].deck); log('p2',`AI: Kirby searched ${added} supporters`); }
      break;
    }
    case '21': { // Henry Dong: discard hand cards for Fate
      if(card._henryAiUsed) break;
      const hand = G.players[cp].hand;
      if(hand.length) {
        const strat = G._selectedAI?._deckStrategy || '';
        const protectedIds = strat === 'ai_henrys_conviction' ? ['63','32','58','75','69'] : [];
        const discardCount = strat === 'ai_henrys_conviction'
          ? (hand.length >= 3 ? Math.min(hand.length, Math.max(3, hand.length - 1)) : hand.length)
          : Math.min(hand.length, Math.max(1, Math.floor(hand.length / 2)));
        const sorted = [...hand].sort((a,b)=>{
          const ap = protectedIds.includes(a.id) ? 1 : 0;
          const bp = protectedIds.includes(b.id) ? 1 : 0;
          if(ap !== bp) return ap - bp;
          return (a.fate||0) - (b.fate||0);
        });
        const chosen = sorted.slice(0, discardCount);
        chosen.forEach(c=>{
          G.players[cp].hand = G.players[cp].hand.filter(h=>h.iid!==c.iid);
          fatePushDiscard(cp, c);
          card.currentFate += 3;
        });
        log('p2', `AI: Henry Dong discarded ${chosen.length} card${chosen.length===1?'':'s'} and gained ${chosen.length*3} Fate`);
      }
      card._henryAiUsed = true;
      break;
    }
    case '38': { // Jake: discard a supporter once per turn for +3 Fate
      if(card.effectUsedThisTurn) break;
      const supporters = G.players[cp].hand.filter(c=>c.type==='Supporter');
      if(!supporters.length) break;
      supporters.sort((a,b)=>(a.fate||0)-(b.fate||0));
      const spent = supporters[0];
      G.players[cp].hand = G.players[cp].hand.filter(c=>c.iid!==spent.iid);
      fatePushDiscard(cp, spent);
      card.currentFate += 3;
      card.effectUsedThisTurn = true;
      log('p2','AI: Jake discarded '+spent.name+' and gained 3 Fate');
      break;
    }
    case '40': { // Christopher Erbs: arm the next draw for +4 Fate
      if(!Array.isArray(G.erbsActive)) G.erbsActive = [false, false];
      if((card.usesLeft || 0) <= 0 || G.erbsActive[cp]) break;
      card.usesLeft--;
      G.erbsActive[cp] = true;
      log('p2','AI: Christopher Erbs empowered the next drawn card');
      break;
    }
    case '22': { // Isaac Perez: buff up to 2 friendly cards in this zone
      const targets = [];
      G.board[z]?.forEach(row=>row?.forEach(cell=>{
        if(cell && cell.owner===cp) targets.push(cell);
      }));
      targets.sort((a,b)=>(b.currentFate||b.fate||0)-(a.currentFate||a.fate||0));
      const chosen = targets.slice(0,2);
      chosen.forEach(target=>modifyFate(target,3,'permanent'));
      log('p2', `AI: Isaac Perez increased ${chosen.length} card${chosen.length===1?'':'s'} by +3 Fate`);
      break;
    }
    case '77': { // Duncan Heyward: declare affiliation — ALWAYS pick third_great_war for Free World deck
      // Count affiliation presence on board to pick the best declaration
      const affCounts = {};
      G.board.forEach(zone => zone.forEach(row => row.forEach(cell => {
        if(cell && cell.owner === cp) affCounts[cell.aff] = (affCounts[cell.aff]||0) + 1;
      })));
      // Free World deck: unconditionally declare third_great_war
      const strat = G._selectedAI?._deckStrategy || '';
      let declaredAff = 'third_great_war';
      if(strat !== 'starter_freeworld') {
        // For other decks, pick the most common affiliation on board
        let best = 'third_great_war', bestCount = 0;
        for(const [aff, count] of Object.entries(affCounts)) {
          if(count > bestCount) { bestCount = count; best = aff; }
        }
        declaredAff = best;
      }
      card._declaredAff = declaredAff;
      if(typeof showAffChangeOverlay === 'function') showAffChangeOverlay(card, declaredAff);
      log('p2', `AI: Duncan Heyward declared ${AFF_LABEL[declaredAff]||declaredAff}`);
      if(typeof renderBoardActionForPlayer === 'function') renderBoardActionForPlayer(cp, {hand:false, blocks:false, topbar:false, effects:false, hover:false});
      else renderGame({board:true, scores:true, blocks:true, topbar:true});
      break;
    }
  }
  card.effectUsedInitial = true;
  if(typeof renderBoardActionForPlayer === 'function') renderBoardActionForPlayer(cp, {hand:false, piles:true, blocks:effectNeedsBlocks, topbar:false, effects:false, hover:false});
  else renderGame({board:true, scores:true, piles:true, blocks:true, topbar:true});
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
