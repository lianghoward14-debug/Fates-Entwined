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

function aiIntelligence(){
  return typeof window !== 'undefined' ? window.FateAIIntelligence : null;
}

function aiHasPerfectHandKnowledge(){
  const intelligence = aiIntelligence();
  return !!(intelligence && intelligence.hasPerfectHandKnowledge(G._selectedAI));
}

function aiIsPublicBoardCard(card){
  return !!(card && !(typeof isFaceDownCard === 'function' ? isFaceDownCard(card) : card.faceDown));
}

function aiOpponentCardDecisionFate(card, z){
  if(!aiIsPublicBoardCard(card)) return 0;
  return typeof getEffectiveFate === 'function'
    ? Math.max(0, Number(getEffectiveFate(card, z)) || 0)
    : Math.max(0, Number(card.currentFate ?? card.fate) || 0);
}

function aiChooseReaction(reactions, actionData){
  const candidates = Array.isArray(reactions) ? reactions.slice() : [];
  if(!candidates.length) return null;
  const intelligence = aiIntelligence();
  const source = actionData && actionData.card;
  const sourceProfile = intelligence && source ? intelligence.profileCard(source) : {responsePower:4,disruption:0,scaling:0};
  const perfect = aiHasPerfectHandKnowledge();
  const difficulty = G.aiDifficulty || 'medium';
  const threshold = perfect ? 0 : (difficulty === 'extreme' ? 3.5 : difficulty === 'hard' ? 4.5 : difficulty === 'easy' ? 7 : 5.5);
  const affectsAI = !!(actionData && (
    (Array.isArray(actionData.affectedOwners) && actionData.affectedOwners.includes(G.aiPlayer)) ||
    (actionData.target && actionData.target.owner === G.aiPlayer)
  ));
  const ranked = candidates.map(reaction=>{
    let score = Number(sourceProfile.responsePower) || 0;
    if(affectsAI) score += 5;
    if(sourceProfile.disruption) score += 3;
    if(sourceProfile.scaling) score += 2;
    if(reaction.type === 'havano') score += 7;
    else if(reaction.type === 'secules') score += 3;
    else if(reaction.type === 'lydia') score += Math.max(0, Number(reaction.card?.usesLeft) || 0);
    return {reaction,score};
  }).sort((a,b)=>b.score-a.score);
  if(!perfect && ranked[0].score < threshold) return null;
  return ranked[0].reaction;
}

function aiShouldActivateOptionalDrawEffect(player, card, context){
  if(player !== G.aiPlayer || !card || (Number(card.usesLeft) || 0) <= 0) return false;
  if(aiHasPerfectHandKnowledge()) return true;
  const ctx = context || {};
  if(ctx.drawPhase) return true;
  const handSize = G.players?.[player]?.hand?.length || 0;
  const lateGame = Number(G.turn) >= Math.max(1, (Number(G.maxTurns) || 20)-5);
  const style = G._selectedAI?.style || '';
  return lateGame || handSize <= 3 || ['resourceful','efficient','visionary','inevitable'].includes(style);
}

function aiCollectObservedOpponentCards(){
  const opp = 1-G.aiPlayer;
  const cards = [];
  if(G.players?.[opp]?.discard) cards.push(...G.players[opp].discard);
  if(Array.isArray(G.board)){
    G.board.forEach(zone=>zone?.forEach(row=>row?.forEach(card=>{
      const hidden = card && (typeof isFaceDownCard === 'function' ? isFaceDownCard(card) : !!card.faceDown);
      if(card && card.owner === opp && !hidden) cards.push(card);
    })));
  }
  return cards;
}

function aiBuildOpponentHandModel(){
  const intelligence = aiIntelligence();
  const opp = 1-G.aiPlayer;
  const handSize = G.players?.[opp]?.hand?.length || 0;
  if(!intelligence){
    return {mode:'belief',handSize,cards:Array.from({length:handSize},()=>({id:'belief',fate:2,responsePower:2,type:'Supporter',cost:0,disruption:0,draw:0,scaling:0}))};
  }
  const perfect = aiHasPerfectHandKnowledge();
  const revealedCards = perfect ? [] : (G.players?.[opp]?.hand || []).filter(card=>card && G._revealedCards?.[card.iid]);
  const model = intelligence.buildHandModel({
    ai:G._selectedAI,
    allowPerfect:perfect,
    hiddenCards:perfect ? G.players[opp].hand : undefined,
    handSize:perfect ? handSize : Math.max(0, handSize-revealedCards.length),
    observedCards:aiCollectObservedOpponentCards(),
    catalogue:typeof CARDS !== 'undefined' ? CARDS : [],
    seed:(G.players?.[opp]?.name || 'opponent')+':'+G.turn
  });
  if(revealedCards.length){
    model.mode = 'mixed';
    model.handSize = handSize;
    model.cards = [...revealedCards.map(card=>intelligence.profileCard(card)), ...model.cards];
  }
  return model;
}

function aiObserveOpponentAndPlan(){
  const intelligence = aiIntelligence();
  if(!intelligence) return;
  const cp = G.aiPlayer;
  const opp = 1-cp;
  const zoneCounts = [0,0,0];
  let contestedCount = 0;
  for(let z=0; z<3; z++){
    G.board?.[z]?.forEach((row,r)=>row?.forEach(card=>{
      if(card && card.owner === opp){
        zoneCounts[z]++;
        if(r === 1) contestedCount++;
      }
    }));
  }
  if(!G._aiOpponentMemory) G._aiOpponentMemory = intelligence.createOpponentMemory();
  G._aiOpponentMemory = intelligence.updateOpponentMemory(G._aiOpponentMemory, {
    turn:G.turn,
    zoneCounts,
    contestedCount,
    handSize:G.players?.[opp]?.hand?.length || 0,
    discardCount:G.players?.[opp]?.discard?.length || 0
  });
  G._aiOpponentHandModel = aiBuildOpponentHandModel();
  const myScores = [0,1,2].map(z=>getZoneScore(z,cp));
  const oppScores = [0,1,2].map(z=>getZoneScore(z,opp));
  G._aiTurnPlan = intelligence.makeTurnPlan({
    myScores,
    oppScores,
    memory:G._aiOpponentMemory,
    style:G._selectedAI?.style || '',
    turn:G.turn,
    handModelMode:G._aiOpponentHandModel.mode,
    moraleSystem:aiMoraleSystem(),
    playerIndex:cp,
    landscapeId:G.landscapeId
  });
}

function aiTurnPlanMoveBonus(move){
  const intelligence = aiIntelligence();
  if(!intelligence || !G._aiTurnPlan || !move) return 0;
  const cp = G.aiPlayer, opp = 1-cp;
  const myScores = [0,1,2].map(z=>aiCachedZoneScore(z,cp));
  const oppScores = [0,1,2].map(z=>aiCachedZoneScore(z,opp));
  return intelligence.scoreMoveForPlan(G._aiTurnPlan, {
    z:move.z,
    projectedFate:aiProjectedMoveFate(move)
  }, myScores, oppScores);
}

function aiProjectedOpponentAction(hypoMy, hypoOp){
  const intelligence = aiIntelligence();
  const model = G._aiOpponentHandModel || aiBuildOpponentHandModel();
  if(!intelligence || !model?.cards?.length) return {zone:0,addFate:2,reduceEnemy:0};
  return intelligence.chooseProjectedAction({
    cards:model.cards,
    ownScores:hypoOp,
    enemyScores:hypoMy,
    memory:G._aiOpponentMemory,
    mode:model.mode
  });
}

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
  // Abort state belongs to the previous controller lifecycle. A newly
  // scheduled AI turn must always begin clean or it exits before endTurn().
  G._aiAbort = false;
  G._aiAborted = false;
  log('p2','AI thinking...');

    try {
      const settings = getAIDifficultySettings();
      aiObserveOpponentAndPlan();
      if(typeof activateWhisperOfTheHeartLandscape === 'function') {
        await activateWhisperOfTheHeartLandscape({auto:true, playerIndex:G.aiPlayer});
      }
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
      const canSetPolishFromDeck = G.players[G.aiPlayer].deck.some(c=>c.id==='28') && !G._polishUsedThisTurn;
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
      // Search is time-sliced and may occasionally yield without a result on
      // a busy frame. A legal turn must not become an accidental pass: fall
      // back to the best immediate evaluation from the already-legal list.
      let bestMove = choice ? choice.move : null;
      let bestScore = choice ? choice.score : -Infinity;
      if(!bestMove && !aiShouldAbortSearch({turnToken:aiTurnToken, turnNumber:aiTurnNumber})){
        const fallback = moves.reduce(function(best, move){
          let score = -Infinity;
          try { score = Number(aiEvaluateMove(move)); } catch(e) {}
          return !best || score > best.score ? {move, score} : best;
        }, null);
        if(fallback){
          bestMove = fallback.move;
          bestScore = fallback.score;
        }
      }
      if(!bestMove) break;
      // Only skip if score is catastrophically bad AND we've already placed at least one card
      if(bestScore < -200 && actionsThisTurn > 1) break;

      aiInvalidateZoneScoreCache();

      // Phase 0 legacy recorder: observe only when ?fateV3Recorder=1 loaded
      // the separate bridge. It never changes gameplay authority or routing.
      if(G.currentPlayer !== G.aiPlayer || G.turn !== aiTurnNumber || G._aiTurnToken !== aiTurnToken) { G._aiRunning = false; return; }
      const recorderBridge = window.FateAuthorityV3LegacyRecorderBridge;
      const recorderToken = recorderBridge ? recorderBridge.beginAIAction(bestMove) : null;
      try {
        if(bestMove.type==='place') await aiDoPlace(bestMove);
        else if(bestMove.type==='consolidate') await aiDoConsolidate(bestMove);
        else break;
      } finally {
        if(recorderBridge) recorderBridge.finishAction(recorderToken);
      }
      }

      if(G.currentPlayer !== G.aiPlayer || G.turn !== aiTurnNumber || G._aiTurnToken !== aiTurnToken) { G._aiRunning = false; return; }
      const effectsRecorderBridge = window.FateAuthorityV3LegacyRecorderBridge;
      const effectsRecorderToken = effectsRecorderBridge
        ? effectsRecorderBridge.beginNamedAction('LEGACY_AI_ACTIVATE_EFFECTS')
        : null;
      try {
        await aiActivateEffects();
      } finally {
        if(effectsRecorderBridge) effectsRecorderBridge.finishAction(effectsRecorderToken);
      }
      await aiSleep(AI_VISUAL_PAUSE_ENDTURN);
      await aiWaitForInteractionAnimations(180);
      if(G.currentPlayer !== G.aiPlayer || G.turn !== aiTurnNumber || G._aiTurnToken !== aiTurnToken) { G._aiRunning = false; return; }
      log('p2','AI ends turn.');
      G._aiRunning = false;
      const endTurnRecorderBridge = window.FateAuthorityV3LegacyRecorderBridge;
      const endTurnRecorderToken = endTurnRecorderBridge
        ? endTurnRecorderBridge.beginNamedAction('LEGACY_END_TURN')
        : null;
      try {
        endTurn({aiCompletion:true, skipEffectWarning:true, skipModalDeferral:true});
      } finally {
        if(endTurnRecorderBridge) endTurnRecorderBridge.finishAction(endTurnRecorderToken);
      }
  } catch(e) {
    // An expired/replaced AI task must never wake during the following human
    // turn and call the shared endTurn() a second time.
    if(G._aiAbort || G.currentPlayer !== G.aiPlayer || G.turn !== aiTurnNumber || G._aiTurnToken !== aiTurnToken) {
      G._aiRunning = false;
      return;
    }
    console.error('AI error:',e);
    G._aiRunning = false;
    try{ await aiWaitForInteractionAnimations(120); }catch(_e){}
    endTurn({aiCompletion:true, skipEffectWarning:true, skipModalDeferral:true});
  }
}

function aiSleep(ms){
  const corpusParams = new URLSearchParams(window.location.search || '');
  if(corpusParams.get('fateV3LegacyCorpus') === '1'
    && corpusParams.get('fateV3Recorder') === '1'
    && corpusParams.get('fateV3SinglePlayer') !== '1'){
    return Promise.resolve();
  }
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
  if(aiHasPerfectHandKnowledge()) return {enabled:true, budgetMs:620, maxCandidates:10, maxChunkMs:2.25, minVisits:72, exploration:0.92, depth:7};
  if(d === 'extreme') return {enabled:true, budgetMs:430, maxCandidates:9, maxChunkMs:2.25, minVisits:42, exploration:1.08, depth:5};
  if(d === 'hard') return {enabled:true, budgetMs:310, maxCandidates:8, maxChunkMs:2, minVisits:28, exploration:1.2, depth:4};
  if(d === 'medium') return {enabled:true, budgetMs:200, maxCandidates:6, maxChunkMs:1.75, minVisits:18, exploration:1.34, depth:3};
  return {enabled:true, budgetMs:115, maxCandidates:5, maxChunkMs:1.5, minVisits:10, exploration:1.55, depth:2};
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
  const finalCandidates = [];
  for(const ms of candidates){
    const mctsScore = ms.mctsVisits ? (ms.mctsValue / ms.mctsVisits) : 0;
    const finalScore = ms.combined + mctsScore;
    finalCandidates.push({move:ms.move,finalScore,search:ms});
    if(finalScore > bestScore){
      bestScore = finalScore;
      best = ms.move;
    }
  }
  const intelligence = aiIntelligence();
  if(intelligence){
    const selected = intelligence.selectCandidate(finalCandidates, {
      mistakeChance:Math.max(0, (Number(settings.mistakeChance) || 0) + (Number(settings.mistakeChanceMod) || 0)),
      perfect:aiHasPerfectHandKnowledge()
    });
    if(selected){
      best = selected.move;
      bestScore = selected.finalScore;
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
    handOptions: [aiMCTSHandOptions(0), aiMCTSHandOptions(1)],
    memory:G._aiOpponentMemory || null,
    handKnowledgeMode:aiHasPerfectHandKnowledge() ? 'perfect' : 'belief'
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

function aiMCTSHandOptions(player) {
  const intelligence = aiIntelligence();
  const cp = G.aiPlayer;
  const hand = G.players?.[player]?.hand || [];
  if(player !== cp){
    const model = G._aiOpponentHandModel || aiBuildOpponentHandModel();
    return (model.cards || []).map(card=>({...card}));
  }
  if(intelligence) return hand.map(card=>intelligence.profileCard(card)).sort((a,b)=>b.responsePower-a.responsePower).slice(0,12);
  return hand.map(card=>({id:card.id,iid:card.iid,fate:Math.max(1,Number(card.currentFate ?? card.fate)||1),responsePower:Math.max(1,Number(card.currentFate ?? card.fate)||1),type:card.type,cost:card.cost||0,disruption:0,draw:0,scaling:0})).slice(0,12);
}

function aiMCTSConsumeHandCard(state, player, card) {
  const options = state.handOptions?.[player];
  if(!card || !options) return;
  const fate = Math.max(1, Number(card.currentFate ?? card.fate) || 1);
  let idx = options.findIndex(option=>card.iid && option.iid === card.iid);
  if(idx < 0) idx = options.findIndex(option=>card.id && option.id === card.id);
  if(idx < 0) idx = options.findIndex(option=>Math.abs((Number(option.fate)||1)-fate)<=1);
  if(idx >= 0) options.splice(idx, 1);
}

function aiApplyAbstractMCTSMove(state, player) {
  const cp = G.aiPlayer;
  const opp = 1 - cp;
  const intelligence = aiIntelligence();
  const options = state.handOptions?.[player] || [];
  if(intelligence && options.length){
    const action = intelligence.chooseProjectedAction({
      cards:options,
      ownScores:state.score[player],
      enemyScores:state.score[player === cp ? opp : cp],
      memory:player === opp ? state.memory : null,
      mode:player === opp ? state.handKnowledgeMode : 'known'
    });
    if(action){
      state.score[player][action.zone] += action.addFate;
      state.score[player === cp ? opp : cp][action.zone] = Math.max(0, state.score[player === cp ? opp : cp][action.zone]-action.reduceEnemy);
      if(action.cardIndex >= 0 && action.cardIndex < options.length) options.splice(action.cardIndex,1);
      return;
    }
  }
  const values = options.map(option=>Math.max(1,Number(option.fate)||1));
  const fate = values.length ? values[Math.floor(Math.random() * Math.min(values.length, 4))] : (2 + Math.floor(Math.random() * 3));
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
  if(options.length) options.splice(0,1);
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

// Generate all legal moves for AI this action
function aiGenerateAllMoves() {
  const cp = G.aiPlayer, opp = 1-cp;
  const hand = G.players[cp].hand;
  const moves = [];
  const maxSup = Math.min(SUPPORTER_HARD_TURN_CAP, G.maxSupportsPerTurn + G.extraSupportsThisTurn);
  const canPlaceSup = G.majaEffectThisTurn || G.supportsPlacedThisTurn < maxSup;
  const hardCapAvailable = !(typeof isSupporterHardCapReached === 'function' && isSupporterHardCapReached(cp));
  const isArtilleryLockedForAI = (z) => typeof G._artilleryLockedZone === 'number' && G._artilleryLockedZone === z && G._artilleryLockOwner === cp && G._artilleryLockTurnsLeft > 0;

  hand.filter(function(card){ return typeof isWojciechPierogiCounter === 'function' && isWojciechPierogiCounter(card); }).forEach(function(counter){
    const options = typeof getValidPlacementOptionsForCard === 'function' ? getValidPlacementOptionsForCard(counter, cp) : [];
    options.forEach(function(option){
      moves.push({type:'place', card:counter, z:option.z, r:option.r, c:option.c, contested:option.r===1, pierogiCounter:true});
    });
  });

  // Maja Kaminska can be set directly from the deck at no cost.
  const majaFromDeck = G.players[cp].deck.find(c=>c.id==='07');
  if(majaFromDeck){
    for(let z=0;z<3;z++){
      if(isArtilleryLockedForAI(z)) continue;
      const rowOrder = [cp===0?2:0];
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
  {
    const supporters = hand.filter(c=>{
      const isSupporter = typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(c, cp) : c.type==='Supporter';
      const ignoresSetLimit = (typeof isAchillesAdaptiveToken === 'function' && isAchillesAdaptiveToken(c))
        || !!(G._linaFreeIids && G._linaFreeIids.has(c.iid));
      return hardCapAvailable && isSupporter && c.id!=='70' && (canPlaceSup || ignoresSetLimit);
    }).map(card=>({card, fromDeck:false}));
    const polishFromDeck = G.players[cp].deck.find(c=>c.id==='28');
    if(hardCapAvailable && polishFromDeck && !G._polishUsedThisTurn) supporters.push({card:polishFromDeck, fromDeck:true});
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
            if(sup.id!=='76' && sup.id!=='20' && isBlockedByAlondra(z,r,c,cp)) continue;
            moves.push({type:'place', card:sup, z, r, c, contested:r===1, fromDeck:candidate.fromDeck});
          }
        }
      }
    }
  }

  // 1b. Free character placements from card effects/conditional costs.
  const freeCharacters = hand.filter(c=>{
    const isEffectFree = !!(G._linaFreeIids && G._linaFreeIids.has(c.iid));
    if(!hardCapAvailable && typeof isStructurallySupporterCard === 'function' && isStructurallySupporterCard(c)) return false;
    return isEffectFree || ((typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(c, cp) : c.type !== 'Supporter') && (typeof getDisplayedCardCost === 'function' ? getDisplayedCardCost(c) : c.cost) <= 0);
  });
  for(const ch of freeCharacters){
    for(let z=0;z<3;z++){
      if(isArtilleryLockedForAI(z)) continue;
      if(typeof getChingachlookPlacementBlockReason === 'function' && getChingachlookPlacementBlockReason(ch, z, cp)) continue;
      const rowOrder = [1, cp===0?2:0];
      for(const r of rowOrder){
        if(typeof requiresOwnSafeRowPlacement === 'function' && requiresOwnSafeRowPlacement(ch) && !(typeof isOwnSafeRowSquare === 'function' && isOwnSafeRowSquare(z, r, 0, cp))) continue;
        if(!G.board[z][r]) continue;
        for(let c=0;c<getBoardRowCapacity(z,r);c++){
          if(G.board[z][r][c]!==null || isBlocked(z,r,c)) continue;
          moves.push({type:'place', card:ch, z, r, c, contested:r===1});
        }
      }
    }
  }

  // 2. Consolidation moves
  const chars = hand.filter(c=>typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(c, cp) : c.type!=='Supporter');
  if(chars.length){
    const mySups = [];
    const irvineZones = new Set();
    forEachBoardCard((card,z)=>{
      if(card && card.owner === cp && typeof cardActsAsPassive === 'function' && cardActsAsPassive(card, '49')
        && !(typeof isSupporterAuraSuppressed === 'function' && isSupporterAuraSuppressed(card))) irvineZones.add(z);
    });
    forEachBoardCard((card,z,r,c)=>{
      const canTribute = typeof canUseAsConsolidationTribute === 'function'
        ? canUseAsConsolidationTribute(card, cp, z, r, c)
        : (card && card.owner===cp && !card.noConsolidate && card.id!=='76');
      if(!card || !canTribute) return;
      if(isArtilleryLockedForAI(z)) return;
      const ralphBonus = typeof countFriendlyRalphAdjacency === 'function' ? countFriendlyRalphAdjacency(z, r, c, cp) : 0;
      const reinforcement = getSupportReinforcementValue(card) + ralphBonus;
      const isCharacter = typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(card, cp) : card.type !== 'Supporter';
      if(card.type === 'Supporter') mySups.push({card,z,r,c,reinforcement, kind:'supporter'});
      if(isCharacter) mySups.push({card,z,r,c,reinforcement, kind:'character'});
      // Irvine Businessman lets ordinary Characters pay normal consolidation
      // costs in his zone. Keep this second role separate from cards such as
      // Wintertide that explicitly require Character tributes.
      if(isCharacter && card.type !== 'Supporter' && irvineZones.has(z)) {
        mySups.push({card,z,r,c,reinforcement:1, kind:'supporter', viaIrvine:true});
      }
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
        if(typeof requiresOwnSafeRowPlacement === 'function' && requiresOwnSafeRowPlacement(ch) && !(typeof isOwnSafeRowSquare === 'function' && isOwnSafeRowSquare(target.z, target.r, target.c, cp))) continue;
        const targetCost = typeof getConsolidationCostForZone === 'function' ? getConsolidationCostForZone(ch, target.z, cp, cost) : cost;
        if(totalReinforcement < targetCost) continue;
        const tributes = aiPickTributes(uniquePool, targetCost, target);
        if(!tributes) continue;
        if(typeof getChingachlookPlacementBlockReason === 'function'){
          const removedIids = new Set(tributes.map(t=>t.card?.iid).filter(Boolean));
          if(getChingachlookPlacementBlockReason(ch, target.z, cp, removedIids)) continue;
        }
        moves.push({
          type:'consolidate',
          card:ch,
          cost:targetCost,
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
  const protectRalph = ['ai_royal_flush','ai_coordinators_dream','ai_crown_of_five'].includes(strat);
  const preservationPenalty = function(entry){
    const id = String(entry?.card?.id || '');
    const onlyCopy = aiOwnBoardCardsById(id).length <= 1;
    if(strat === 'ai_crown_of_five') {
      if(onlyCopy && ['15','19','57','01','77'].includes(id)) return 5000;
      if(id === '24') return onlyCopy ? 1700 : 650;
      if(id === '49') return onlyCopy ? 1300 : 480;
      if(id === '09') return onlyCopy ? 900 : 260;
      if(id === '92') return onlyCopy ? 500 : 120;
    }
    if(strat === 'ai_snowball_fight_club') {
      const copiesSnowball = typeof cardActsAsPassive === 'function' && cardActsAsPassive(entry.card, '93');
      if(copiesSnowball) return onlyCopy ? 2600 : 1050;
      if(id === '31') return onlyCopy ? 650 : 180;
      if(id === '58') return onlyCopy && G.players[G.aiPlayer].discard.some(c=>c.id === '31') ? 520 : 80;
    }
    if(strat === 'ai_wintertide_family_reunion') {
      const conversionActive = typeof isBlameGameActive === 'function' && isBlameGameActive(G.aiPlayer);
      if(id === '99' && conversionActive) return onlyCopy ? 6000 : 2200;
      if(onlyCopy && ['84','88','89','100'].includes(id)) return 2800;
      if(id === '82') return onlyCopy ? 1800 : 450;
      if(id === '90') return onlyCopy ? 900 : 220;
      if(id === '92') return onlyCopy ? 700 : 180;
    }
    return 0;
  };
  // Sort by least valuable first (sacrifice cheap supporters from zones we're winning)
  const sorted = [...mySups].sort((a,b)=>{
    if(protectRalph && a.card.id !== b.card.id){
      if(a.card.id === '24') return 1;
      if(b.card.id === '24') return -1;
    }
    const preserveDiff = preservationPenalty(a) - preservationPenalty(b);
    if(preserveDiff) return preserveDiff;
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
      penalty += preservationPenalty(t);
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
    if(G.turn < 10 && targetZone === move.z) bonus += 4;
  }
  return bonus;
}

function aiProjectedMoveFate(move) {
  if(!move || !move.card) return 0;
  const base = move.type === 'consolidate'
    ? (Number(move.card.fate) || 0)
    : (Number(move.card.currentFate ?? move.card.fate) || 1);
  const projected = base + aiProjectedLandscapeFateBonus(move.card, move);
  return projected;
}

function aiMoraleSystem(){
  if(typeof window === 'undefined' || window.FATE_MORALE_PRESSURE_RULES_ENABLED !== true) return null;
  if(G?._freePlayGameSettings?.healthPressureSeals === false) return null;
  return G?._moralePressure || null;
}

function aiMoraleMoveBonus(move){
  const intelligence = aiIntelligence();
  const system = aiMoraleSystem();
  if(!intelligence || !system || !move || typeof move.z !== 'number') return 0;
  const cp = G.aiPlayer;
  const opp = 1-cp;
  const ownScores = [0,1,2].map(z=>aiCachedZoneScore(z,cp));
  const enemyScores = [0,1,2].map(z=>aiCachedZoneScore(z,opp));
  const afterOwnScores = ownScores.slice();
  const afterEnemyScores = enemyScores.slice();
  afterOwnScores[move.z] += aiProjectedMoveFate(move);
  if(move.type === 'consolidate'){
    for(const tribute of move.tributes || []){
      const tributeFate = Math.max(0, Number(tribute.card?.currentFate ?? tribute.card?.fate) || 0);
      afterOwnScores[tribute.z] = Math.max(0, afterOwnScores[tribute.z]-tributeFate);
    }
  }
  const context = {
    system,
    playerIndex:cp,
    ownScores,
    enemyScores,
    afterOwnScores,
    afterEnemyScores,
    turn:G.turn,
    landscapeId:G.landscapeId,
    style:G._selectedAI?.style || ''
  };
  let bonus = intelligence.scoreMoralePositionDelta(context);
  if(window.FATE_PRESSURE_CARD_REWORKS_ENABLED === true){
    bonus += intelligence.scoreMoraleCard(move.card, context);
    const id = String(move.card?.id || '');
    const cycle = intelligence.moraleCycleDamage(ownScores, enemyScores);
    const style = intelligence.moraleStyleProfile(G._selectedAI?.style || '');
    if(id === '34'){
      let matching = 0;
      const aff = String(move.card?.aff || move.card?.affiliation || '');
      G.board?.[move.z]?.forEach(row=>row?.forEach(card=>{
        if(card && card.owner === cp && !isFaceDownCard(card) && String(card.aff || card.affiliation || '') === aff) matching++;
      }));
      bonus += matching * 2.2 * style.aggression;
    }else if(id === '35'){
      bonus += Math.floor(aiProjectedMoveFate(move)/2) * 2.4 * style.aggression;
    }else if(id === '44'){
      let dauntless = String(move.card.type || '') === 'Dauntless' ? 1 : 0;
      G.board?.[move.z]?.forEach(row=>row?.forEach(card=>{
        if(card && card.owner === cp && !isFaceDownCard(card) && card.type === 'Dauntless') dauntless++;
      }));
      bonus += dauntless * 2.1 * style.aggression;
    }else if(id === '64'){
      bonus += cycle.outgoing * 1.1 * style.aggression;
    }
  }
  const max = Math.max(1, Number(system.maxMorale) || 200);
  const ownMorale = Math.max(0, Number(system.morale?.[cp]) || 0);
  if(ownMorale / max <= .40 && move.type === 'place' && move.card?.type === 'Supporter'){
    const profile = intelligence.profileCard(move.card);
    const durableMoraleValue = profile.moraleHeal || profile.moraleDamage || profile.moraleShield || profile.moraleDouble;
    if(!durableMoraleValue) bonus -= 5.5 * intelligence.moraleStyleProfile(G._selectedAI?.style || '').supporterPatience;
  }
  return bonus;
}

function aiMoraleProjectedBoardBonus(afterOwnScores, afterEnemyScores){
  const intelligence = aiIntelligence();
  const system = aiMoraleSystem();
  if(!intelligence || !system) return 0;
  const cp = G.aiPlayer;
  const opp = 1-cp;
  return intelligence.scoreMoralePositionDelta({
    system,
    playerIndex:cp,
    ownScores:[0,1,2].map(z=>aiCachedZoneScore(z,cp)),
    enemyScores:[0,1,2].map(z=>aiCachedZoneScore(z,opp)),
    afterOwnScores,
    afterEnemyScores,
    turn:G.turn,
    landscapeId:G.landscapeId,
    style:G._selectedAI?.style || ''
  });
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
    if(String(card.id || '') === 'bh02') {
      const futureDrawEffects = (G.players?.[cp]?.hand || []).concat(G.players?.[cp]?.deck || []).filter(function(candidate){
        return candidate && /\bdraw\b/i.test(String(candidate.effect || ''));
      }).length;
      bonus += ownCardsHere * 3 + Math.min(9, futureDrawEffects * .75);
    }
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

function aiLearnedMoveBonus(move) {
  const learning = typeof window !== 'undefined' ? window.FateAILearning : null;
  const policy = typeof window !== 'undefined' && typeof window.fateAIGetLearnedPolicy === 'function'
    ? window.fateAIGetLearnedPolicy(G._selectedAI)
    : null;
  if(!learning || !policy || !move || !move.card || !G._selectedAI) return 0;
  const z = Number.isInteger(Number(move.z)) ? Number(move.z) : 1;
  const cp = G.aiPlayer;
  const opp = 1-cp;
  let ownCount = 0;
  if(Array.isArray(G.board?.[z])) {
    G.board[z].forEach(row=>Array.isArray(row) && row.forEach(card=>{ if(card && card.owner === cp) ownCount++; }));
  }
  const profile = aiIntelligence()?.profileCard?.(move.card) || {};
  return learning.scoreMove(policy, {
    type:move.type,
    contested:!!move.contested,
    tempo:Math.max(0, Math.min(1, 1-(Number(G.turn)||1)/Math.max(1, Number(G.maxTurns)||20))),
    disruption:!!profile.disruption,
    scaling:!!profile.scaling,
    margin:aiCachedZoneScore(z,cp)-aiCachedZoneScore(z,opp),
    ownCount,
    fate:aiProjectedMoveFate(move),
    tributeCount:Array.isArray(move.tributes) ? move.tributes.length : 0
  });
}

// Evaluate a move's immediate value
function aiEvaluateMove(move) {
  let score = 0;
  if(move.type==='place'){
    const card = move.card;
    if(typeof isWojciechPierogiCounter === 'function' && isWojciechPierogiCounter(card)) score += 45;
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
  score += aiMoraleMoveBonus(move);
  score += aiLearnedMoveBonus(move);
  score += aiTurnPlanMoveBonus(move);

  return score;
}

function aiDeckSearchPriority(deckId, kind) {
  const priorities = {
    starter_freeworld: {
      supporter: ['59','25','63','28','68','42','05'],
      character: ['34','77','01','35','29','06','13'],
      jorge: ['34','77','01','35','29','59','25','63','28','68','42','05','13'],
      lina: [],
      dylan: ['34','77','01','35','59','25','63','28','42','05'],
      coordinator: ['34','77','01']
    },
    starter_assault: {
      supporter: ['68','59','63','74','16','42','32','05'],
      character: ['11','43','40','22','27','06'],
      jorge: ['11','43','40','22','27','68','59','63','74','16','42','32','05'],
      lina: [],
      dylan: ['11','43','40','22','59','63','05'],
      coordinator: ['11']
    },
    starter_maelstrom: {
      supporter: ['05','47','58','75','60','32','95','63','76','94'],
      character: ['14','22','27','06'],
      jorge: ['14','22','27','05','47','58','75','60','32','95','63','76','94'],
      lina: [], dylan: ['14','22','27','05','47','58','75','60','32','95'], coordinator: []
    },
    ai_wintertide_family_reunion: {
      supporter: ['94','92','28','60','98'],
      character: ['84','82','99','100','88','89','90','27','06'],
      jorge: ['84','82','99','100','88','89','90','27','94','92','28','60','98'],
      lina: [],
      dylan: [],
      coordinator: []
    },
    ai_snowball_fight_club: {
      supporter: ['93','37','31','58','60','05','71','32','42'],
      character: ['bh05','41','08','48','13'],
      jorge: ['41','93','37','31','48','13'],
      lina: ['41'],
      dylan: ['41','93','37','31','05','71'],
      coordinator: []
    },
    ai_crown_of_five: {
      supporter: ['09','24','49','92','28','68','74','60'],
      character: ['15','19','57','01','77','07'],
      jorge: ['15','19','57','01','77','09','24','49'],
      lina: [],
      dylan: ['15','19','57','01','77','09','24','49','92'],
      coordinator: ['15','19','57','01','77']
    },
    ai_last_mohicans_ledger: {
      supporter: ['33','20','60','75','47','64','58','05','65','32','42'],
      character: ['45','03','27'],
      jorge: ['45','33','20','75','47','64'],
      lina: ['45'],
      dylan: ['45','33','20','47','64','65'],
      coordinator: []
    },
    ai_hellenic_heartbreaker: {
      supporter: ['05','60','75','47','64','58','33','20','32','42'],
      character: ['35','03','22','27'],
      jorge: ['35','05','22','47','64','75'],
      lina: [],
      dylan: ['35','05','22','47','64'],
      coordinator: []
    },
    ai_hungarian_war_dance: {
      supporter: ['68','25','44','47','64','60','58'],
      character: ['34','66','77','19','29','07'],
      jorge: ['34','66','77','19','25','44'],
      lina: [],
      dylan: ['34','66','77','19','25','44'],
      coordinator: ['34','77','19']
    },
    ai_great_oak_salvo: {
      supporter: ['47','65','64','20','33','75','58','60','69','32'],
      character: ['35','bh22','07','13'],
      jorge: ['47','65','64','20','33','75','58','69'],
      lina: [],
      dylan: ['35','47','65','64','20','33','bh22','69'],
      coordinator: []
    },
    ai_adjacency_doctrine: {
      supporter: ['68','25','44','47','64'],
      character: ['35','bh07','bh11','01','19','15','bh12','66','07'],
      jorge: ['35','bh07','bh11','01','19','15'],
      lina: [],
      dylan: ['35','bh07','bh11','01','19','15','25','44'],
      coordinator: ['bh11','bh07','01','19','15']
    },
    ai_hand_quarantine: {
      supporter: ['70','72','71','50','42','58','60','52','33','32'],
      character: ['bh03','61','56','31'],
      jorge: ['bh03','61','72','71','50','70'],
      lina: ['61'],
      dylan: ['bh03','61','72','71','50','31'],
      coordinator: []
    },
    ai_high_t_draw_mill: {
      supporter: ['32','42','47','64','58','05'],
      character: ['bh02','bh19','bh15','40','27','bh13','bh10','03'],
      jorge: ['bh02','bh19','bh15','40','27','bh13'],
      lina: ['bh02','bh19'],
      dylan: ['bh02','bh19','bh15','40','27','bh13'],
      coordinator: ['bh02']
    },
    ai_university_counterbattery: {
      supporter: ['68','18','79','50','71','60','58','47','32'],
      character: ['bh08','56','67','21','17','04'],
      jorge: ['bh08','56','67','21','17','04'],
      lina: ['67','04'],
      dylan: ['bh08','56','67','21','18','79','50'],
      coordinator: ['bh08']
    },
    ai_selva_tidal_strike: {
      supporter: ['33','74','75','47','64','65','58'],
      character: ['bh04','06','51','77','bh16','30','02'],
      jorge: ['bh04','51','77','bh16','30','33'],
      lina: [],
      dylan: ['bh04','51','77','bh16','30','47','64'],
      coordinator: ['77']
    },
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
    },
    ai_kvetka_chain: {
      supporter: ['68','09','47','60','24','05','58','32'],
      character: ['84','100','88','86','81','03'],
      jorge: [],
      lina: [],
      dylan: ['84','100','86','09','47','05'],
      coordinator: ['81']
    },
    ai_total_blackout: {
      supporter: ['50','16','71','75','60','58','32','09'],
      character: ['17','04','21','61','30','56'],
      jorge: [],
      lina: [],
      dylan: ['21','17','04','61','50','16'],
      coordinator: []
    },
    ai_living_formation: {
      supporter: ['68','24','59','63','60','32','05','09'],
      character: ['35','11','57','23','22','02'],
      jorge: [],
      lina: [],
      dylan: ['35','11','57','23','59','63'],
      coordinator: ['11','57','23']
    },
    ai_snowbound_wintertide: {
      supporter: ['98','91','47','94','97','80','96'],
      character: ['82','84','100','99','87','90','bh05'],
      jorge: [],
      lina: [],
      dylan: ['82','84','100','99','87','90'],
      coordinator: []
    },
    ai_overclocked_dauntless: {
      supporter: ['68','60','98','47','54','44','95'],
      character: ['84','100','bh07','89','88','83','bh01'],
      jorge: [],
      lina: [],
      dylan: ['84','100','bh07','89','88','83'],
      coordinator: ['bh07']
    },
    ai_thousand_reel_drawstorm: {
      supporter: ['68','60','32','42','80','75','74','47','58'],
      character: ['08','bh02','27','40','bh01'],
      jorge: [],
      lina: ['bh02'],
      dylan: [],
      coordinator: ['bh02']
    },
    ai_university_mischief: {
      supporter: ['68','60','92','18','79','37','75','05','09','58'],
      character: ['bh08','56','67','21'],
      jorge: [],
      lina: [],
      dylan: ['bh08','21','18','92'],
      coordinator: ['bh08']
    },
    ai_alis_handcuffs: {
      supporter: ['42','70','72','71','75','50','52','58','60','74'],
      character: ['bh03','61','31','56'],
      jorge: [],
      lina: [],
      dylan: ['61','31','50','72','71'],
      coordinator: []
    },
    ai_destruction_paradise: {
      supporter: ['33','74','75','65','64','79'],
      character: ['51','77','bh04','06','30','27','bh01'],
      jorge: ['bh04','77','51','30','27'],
      lina: [],
      dylan: ['bh04','77','51','30','33','65'],
      coordinator: ['77']
    },
    ai_taylors_perfect_mimic: {
      supporter: ['32','60','47','75','05'],
      character: ['bh05','84','14','bh04','100','90','48'],
      jorge: ['bh04','100','84','14','90','48'],
      lina: [],
      dylan: ['bh05','84','14','bh04','100','90'],
      coordinator: []
    },
    ai_adaptive_formation: {
      supporter: ['68','60','44','59','63','47','05'],
      character: ['07','bh06','bh07','15','19','01','77'],
      jorge: [],
      lina: [],
      dylan: ['07','bh06','bh07','15','19','01','77','44','59'],
      coordinator: ['bh07','15','19','01','77']
    },
    ai_pierogi_siege: {
      supporter: ['97','50','91','93','94','75','60'],
      character: ['81','82','bh04','17','04','56'],
      jorge: ['81','82','bh04','17','04','97'],
      lina: [],
      dylan: ['81','82','bh04','17','04','97','50'],
      coordinator: []
    },
    ai_bombastic_search_punisher: {
      supporter: ['68','60','94','97','71','32','42'],
      character: ['bh02','86','08','bh03','40','27','bh01'],
      jorge: [],
      lina: ['bh02'],
      dylan: ['bh02','86','bh03','40','71','97'],
      coordinator: ['bh02']
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

function aiCountOpponentCardsInZone(z, predicate) {
  let count = 0;
  const opponent = 1 - G.aiPlayer;
  G.board[z]?.forEach(row=>row?.forEach(cell=>{
    if(cell && cell.owner === opponent && (!predicate || predicate(cell))) count++;
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
    // RELENTLESS MAELSTROM: anchor Alondra, recycle disposable supporters, and compound draw/buff engines.
    const safeRow = typeof getSafeRowForPlayer === 'function' ? getSafeRowForPlayer(cp) : (cp === 0 ? 2 : 0);
    let anchorZone=null, anchorValue=-1;
    for(let zi=0;zi<3;zi++) { const a=aiCountOwnCardsInZone(zi,c=>String(c.id||'')==='14'); const e=aiCountOwnCardsInZone(zi,c=>['58','60','75'].includes(String(c.id||''))); const s=aiCountOwnCardsInZone(zi,c=>c.type==='Supporter'); const v=a*180+e*90+s*18; if(v>anchorValue&&v>0){anchorValue=v;anchorZone=zi;} }
    const alondraHere=aiCountOwnCardsInZone(move.z,c=>String(c.id||'')==='14');
    const supportersHere=aiCountOwnCardsInZone(move.z,c=>c.type==='Supporter');
    if(move.type === 'place') {
      const id=String(move.card.id||'');
      if(anchorZone!==null&&['05','47','58','60','75','32','95','63','76','94'].includes(id)) bonus+=move.z===anchorZone?155:-120;
      if(id==='05') bonus+=alondraHere?280:-40;
      if(id==='47') bonus+=170+alondraHere*70;
      if(id==='58'||id==='75') bonus+=(G.players[cp].discard.some(c=>c.id==='05')?300:170);
      if(id==='60'||id==='32') bonus+=G.players[cp].hand.length<=5?230:90;
      if(id==='95') bonus+=180+G.turn*18;
      if(id==='63') bonus+=210+aiCountOwnCardsInZone(move.z,c=>String(c.id||'')==='63')*85;
      if(id==='76') bonus+=130;
      if(id==='94') bonus+=G.players[cp].deck.some(c=>['14','22','27','06'].includes(String(c.id||'')))?270:80;
    }
    if(move.type==='consolidate') {
      const id=String(move.card.id||''); if(anchorZone!==null) bonus+=move.z===anchorZone?185:-230; if(move.r===safeRow) bonus+=65;
      if(id==='14') bonus+=780+supportersHere*95; if(id==='22') bonus+=supportersHere>=2?390:120; if(id==='27') bonus+=G.players[cp].hand.length<=5?420:150; if(id==='06') bonus+=aiOwnBoardCardsById('14').length||G.players[cp].hand.some(c=>c.id==='14')?140:510;
       for(const t of move.tributes||[]) { const tid=String(t?.card?.id||''); if(['05','47','58','60','75','95','63'].includes(tid)){const copies=aiCountOwnCardsInZone(move.z,c=>String(c.id||'')===tid); bonus-=copies<=1?2600:650;} if(['32','76','94'].includes(tid)) bonus+=75; }
    }
  }

  else if(deckId === 'starter_freeworld') {
    // THE FREE WORLD: build one protected TGW formation, tutor missing engines, then cash in its Fate.
    const coreIds = ['34','77','01','35'];
    const formationSupporters = ['59','25','63'];
    const safeRow = typeof getSafeRowForPlayer === 'function' ? getSafeRowForPlayer(cp) : (cp === 0 ? 2 : 0);
    let formationZone = null;
    let formationValue = -1;
    for(let zi=0; zi<3; zi++) {
      const coreCount = aiCountOwnCardsInZone(zi,c=>coreIds.includes(String(c.id || '')));
      const tgwCount = aiCountOwnCardsInZone(zi,c=>String(c.aff || c.affiliation || '') === 'third_great_war');
      const engineCount = aiCountOwnCardsInZone(zi,c=>formationSupporters.includes(String(c.id || '')));
      const value = coreCount * 100 + engineCount * 30 + tgwCount * 12;
      if(value > formationValue && (coreCount || engineCount || tgwCount)) { formationValue = value; formationZone = zi; }
    }
    const tgwHere = aiCountOwnCardsInZone(move.z,c=>String(c.aff || c.affiliation || '') === 'third_great_war');
    const coreHere = aiCountOwnCardsInZone(move.z,c=>coreIds.includes(String(c.id || '')));
    const supporterFateHere = (G.board[move.z] || []).reduce((sum,row)=>sum + (row || []).reduce((rowSum,c)=>{
      if(!c || c.owner !== cp || c.type !== 'Supporter' || isFaceDownCard(c)) return rowSum;
      return rowSum + Math.max(0, Number(c.currentFate ?? c.fate) || 0);
    },0),0);
    const adjacent = typeof getAdjacentCards === 'function' ? getAdjacentCards(move.z,move.r,move.c) : [];
    const friendlyAdjacent = adjacent.filter(entry=>entry.card && entry.card.owner === cp);

    if(move.type === 'place') {
      const id = String(move.card.id || '');
      if(formationZone !== null && ['59','25','63','05'].includes(id)) bonus += move.z === formationZone ? 180 : -150;
      if(id === '28') bonus += move.fromDeck ? 520 + (move.contested ? 140 : 0) : 145;
      if(id === '59') bonus += 255 + aiCountOwnCardsInZone(move.z,c=>c.type === 'Supporter') * 38;
      if(id === '63') bonus += 210 + aiCountOwnCardsInZone(move.z,c=>String(c.id || '') === '63') * 85;
      if(id === '25') {
        bonus += 235 + friendlyAdjacent.filter(entry=>String(entry.card.aff || entry.card.affiliation || '') === 'third_great_war').length * 55;
        if(move.c === 1) bonus += 35;
      }
      if(id === '42') bonus += G.players[cp].hand.length <= 5 ? 245 : 90;
      if(id === '05') bonus += coreHere ? 190 + coreHere * 45 : -75;
      if(id === '68') {
        const heldOrControlled = new Set(G.players[cp].hand.map(c=>String(c.id || '')));
        forEachBoardCard(c=>{ if(c && c.owner === cp) heldOrControlled.add(String(c.id || '')); });
        bonus += ['34','77','01'].some(coreId=>!heldOrControlled.has(coreId)) ? 430 : 80;
      }
    }

    if(move.type === 'consolidate') {
      const id = String(move.card.id || '');
      if(coreIds.includes(id)) {
        if(formationZone !== null) bonus += move.z === formationZone ? 230 : -310;
        if(move.r === safeRow) bonus += 95;
      }
      if(id === '34') bonus += aiOwnBoardCardsById('34').length ? 210 : 620;
      if(id === '77') bonus += 330 + tgwHere * 58;
      if(id === '01') bonus += 300 + friendlyAdjacent.length * 72 + tgwHere * 25;
      if(id === '35') bonus += supporterFateHere >= 6 ? 680 + supporterFateHere * 28 : -220;
      if(id === '29') {
        const searchPool = [...G.players[cp].deck,...G.players[cp].discard];
        bonus += searchPool.some(c=>coreIds.includes(String(c.id || ''))) ? 470 : 165;
      }
      if(id === '13') bonus += G.players[cp].hand.filter(c=>c.type === 'Supporter').length < 2 ? 410 : 145;
      if(id === '06') {
        const heldOrControlled = new Set(G.players[cp].hand.map(c=>String(c.id || '')));
        forEachBoardCard(c=>{ if(c && c.owner === cp) heldOrControlled.add(String(c.id || '')); });
        bonus += coreIds.some(coreId=>!heldOrControlled.has(coreId)) ? 455 : 120;
      }
      for(const tribute of move.tributes || []) {
        const tributeId = String(tribute?.card?.id || '');
        if(formationSupporters.includes(tributeId)) {
          const copiesHere = aiCountOwnCardsInZone(move.z,c=>String(c.id || '') === tributeId);
          bonus -= copiesHere <= 1 ? 3600 : 850;
        }
        if(['28','42','05','68'].includes(tributeId)) bonus += 80;
      }
    }
  }

  else if(deckId === 'starter_incel') {
    // REIGN OF THE FURIOUS INCEL: recycle Oathbound procs to feed Jimmy's passive
    const safeRow = typeof getSafeRowForPlayer === 'function' ? getSafeRowForPlayer(cp) : (cp === 0 ? 2 : 0);
    const jimmyZone = aiFirstOwnCardZone(c=>c.id === '41');
    if(move.type === 'consolidate' && move.card.id === '41') { bonus += 620; if(move.r === safeRow) bonus += 140; }
    if(move.type === 'place') {
      // Oathbound Noble Fighter: always valuable (feeds Jimmy)
      if(move.card.id === '31') bonus += 210 + (jimmyZone === move.z ? 150 : 0);
      // Crossroads/Ledger-keepers: recycle Oathbound from discard
      if(move.card.id === '58' || move.card.id === '75') {
        const discardHas31 = G.players[cp].discard.some(c => c.id === '31');
        if(discardHas31) bonus += 260;
      }
      // Post-Modernist Dylan: debuff opponent zone — good board control
      if(move.card.id === '10') bonus += 3;
      // Santiago: remove opponent threats
      if(move.card.id === '30') bonus += 3;
      if(move.card.id === '70') bonus += 165;
      if(move.card.id === '36') bonus += jimmyZone === move.z ? 120 : 35;
    }
    // Lina: if she searches for Jimmy, always search for Jimmy
    if(move.type === 'consolidate' && move.card.id === '08') bonus += aiOwnBoardCardsById('41').length ? 120 : 520;
  }

  else if(deckId === 'starter_assault') {
    // MASS ASSAULT DOCTRINE: expand one safe row, establish Anne, then pack it with scaling supporters.
    const engineIds = ['11','43','59','63'];
    const disposableSupporters = ['32','42','16','74','68','05'];
    const safeRow = typeof getSafeRowForPlayer === 'function' ? getSafeRowForPlayer(cp) : (cp === 0 ? 2 : 0);
    let formationZone = null;
    let formationValue = -1;
    for(let zi=0; zi<3; zi++) {
      const anneCount = aiCountOwnCardsInZone(zi,c=>String(c.id || '') === '11');
      const markCount = aiCountOwnCardsInZone(zi,c=>String(c.id || '') === '43');
      const auraCount = aiCountOwnCardsInZone(zi,c=>['59','63'].includes(String(c.id || '')));
      const supporterCount = aiCountOwnCardsInZone(zi,c=>c.type === 'Supporter');
      const value = anneCount * 140 + markCount * 75 + auraCount * 55 + supporterCount * 15;
      if(value > formationValue && value > 0) { formationValue = value; formationZone = zi; }
    }
    const anneHere = aiCountOwnCardsInZone(move.z,c=>String(c.id || '') === '11');
    const supportersHere = aiCountOwnCardsInZone(move.z,c=>c.type === 'Supporter');
    const auraHere = aiCountOwnCardsInZone(move.z,c=>['59','63'].includes(String(c.id || '')));

    if(move.type === 'place') {
      const id = String(move.card.id || '');
      if(formationZone !== null && ['59','63','05','32','42','74'].includes(id)) bonus += move.z === formationZone ? 195 : -155;
      if(id === '59') bonus += 270 + supportersHere * 48 + anneHere * 110;
      if(id === '63') bonus += 225 + aiCountOwnCardsInZone(move.z,c=>String(c.id || '') === '63') * 95 + anneHere * 85;
      if(id === '68') bonus += aiOwnBoardCardsById('11').length || G.players[cp].hand.some(c=>c.id === '11') ? 85 : 480;
      if(id === '74') bonus += 245 + (G.players[cp].hand.filter(c=>c.type === 'Supporter').length * 18);
      if(id === '32') bonus += G.players[cp].hand.length <= 5 ? 255 : 120;
      if(id === '42') bonus += G.players[cp].hand.length <= 5 ? 270 : 105;
      if(id === '16') {
        const opposingSupporters = aiCountOpponentCardsInZone(move.z,c=>c.type === 'Supporter');
        bonus += opposingSupporters ? 190 + opposingSupporters * 75 : -45;
      }
      if(id === '05') bonus += anneHere ? 230 : (aiCountOwnCardsInZone(move.z,c=>c.type !== 'Supporter') ? 100 : -65);
    }

    if(move.type === 'consolidate') {
      const id = String(move.card.id || '');
      if(['11','43','40','22'].includes(id) && formationZone !== null) bonus += move.z === formationZone ? 245 : -270;
      if(id === '11') {
        bonus += 620 + supportersHere * 92;
        if(move.r === safeRow) bonus += 115;
      }
      if(id === '43') {
        const marksHere = aiCountOwnCardsInZone(move.z,c=>String(c.id || '') === '43');
        bonus += 410 + marksHere * 125 + supportersHere * 24;
      }
      if(id === '40') bonus += G.players[cp].deck.length >= 3 ? 430 : 135;
      if(id === '27') bonus += G.players[cp].hand.length <= 5 ? 385 : 145;
      if(id === '22') bonus += supportersHere + auraHere >= 2 ? 390 + auraHere * 90 : 105;
      if(id === '06') bonus += aiOwnBoardCardsById('11').length || G.players[cp].hand.some(c=>c.id === '11') ? 145 : 455;
      for(const tribute of move.tributes || []) {
        const tributeId = String(tribute?.card?.id || '');
        if(['59','63'].includes(tributeId)) {
          const copiesHere = aiCountOwnCardsInZone(move.z,c=>String(c.id || '') === tributeId);
          bonus -= copiesHere <= 1 ? 3800 : 1000;
        }
        if(tributeId === '68' && !aiOwnBoardCardsById('11').length && !G.players[cp].hand.some(c=>c.id === '11')) bonus -= 2600;
        if(disposableSupporters.includes(tributeId)) bonus += 75;
      }
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

  else if(deckId === 'ai_wintertide_family_reunion') {
    const snowActive = typeof isLandscapeActive === 'function'
      ? isLandscapeActive('igb15')
      : String(G.landscapeId || '') === 'igb15';
    const conversionActive = typeof isBlameGameActive === 'function' && isBlameGameActive(cp);
    const supporterEffectsUsed = Math.max(0, Number(G._supporterEffectsActivatedP?.[cp]) || 0);
    const safeRow = typeof getSafeRowForPlayer === 'function' ? getSafeRowForPlayer(cp) : (cp === 0 ? 2 : 0);
    const boardCount = function(id){ return aiOwnBoardCardsById(id).length; };
    const available = function(id){
      return boardCount(id) > 0 || G.players[cp].hand.some(c=>c.id === id) || G.players[cp].deck.some(c=>c.id === id);
    };
    const familyControlled = ['82','84','88','89','99'].some(id=>boardCount(id) > 0);
    let effectiveCharacters = 0;
    forEachBoardCard(card=>{
      if(card && card.owner === cp && (typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(card, cp) : card.type !== 'Supporter')) effectiveCharacters++;
    });

    if(move.type === 'place') {
      if(move.card.id === '98') bonus += G.turn <= 2 ? 290 : (conversionActive ? 165 : 35);
      if(move.card.id === '94') {
        const mailNeeded = !boardCount('99') && !G.players[cp].hand.some(c=>c.id === '99');
        bonus += conversionActive ? 45 : (mailNeeded ? 330 : 145);
      }
      if(move.card.id === '92') {
        const printedSupportersHere = aiCountOwnCardsInZone(move.z,c=>c.type === 'Supporter' && c.id !== '92');
        bonus += conversionActive ? 235 + printedSupportersHere * 28 : 95 + printedSupportersHere * 22;
        if(!conversionActive && ['94','28','60'].some(id=>G.players[cp].hand.some(c=>c.id === id))) bonus -= 70;
      }
      if(move.card.id === '28') bonus += move.fromDeck ? (conversionActive ? 610 : 390) : (conversionActive ? 220 : 125);
      if(move.card.id === '60') bonus += conversionActive ? 85 : (supporterEffectsUsed < 9 ? 245 : 35);
      if(conversionActive && move.card.type === 'Supporter') {
        bonus += 150 + effectiveCharacters * 7;
        if(move.r === safeRow) bonus += 45;
      }
    }

    if(move.type === 'consolidate') {
      if(move.card.id === '82') {
        bonus += snowActive ? 115 : 900;
        if(move.r === safeRow) bonus += 90;
      }
      if(move.card.id === '84') {
        const missingEngine = (!snowActive && available('82')) || (!conversionActive && available('99')) || !boardCount('100');
        bonus += missingEngine ? 720 : 310;
        if(move.r === safeRow) bonus += 80;
      }
      if(move.card.id === '99') {
        const freeFromFamily = boardCount('88') > 0 || boardCount('89') > 0;
        bonus += conversionActive ? -520 : (freeFromFamily ? 980 : 510);
        if(move.r === safeRow) bonus += 100;
      }
      if(move.card.id === '88') {
        bonus += 360 + effectiveCharacters * (conversionActive ? 34 : 17);
        if(move.r === safeRow) bonus += 105;
      }
      if(move.card.id === '89') {
        bonus += supporterEffectsUsed < 10 ? 640 : 175;
        if(move.r === safeRow) bonus += 95;
      }
      if(move.card.id === '100') {
        const winterReady = snowActive && familyControlled;
        bonus += winterReady ? 890 + effectiveCharacters * 20 : (snowActive ? 430 : -420);
        if(move.r === safeRow && !move.contested) bonus += 45;
      }
      if(move.card.id === '90') bonus += G.turn <= 8 ? 390 : 180;
      if(move.card.id === '27') bonus += G.players[cp].hand.length <= 5 ? 330 : 125;
      if(move.card.id === '06') {
        const missingEngine = (!snowActive && available('82')) || (!conversionActive && available('99')) || !boardCount('84');
        bonus += missingEngine ? 440 : 170;
      }
      for(const tribute of move.tributes || []) {
        const tributeId = String(tribute?.card?.id || '');
        const onlyCopy = boardCount(tributeId) <= 1;
        if(tributeId === '99' && conversionActive && onlyCopy) bonus -= 7000;
        if(onlyCopy && ['84','88','89','100'].includes(tributeId)) bonus -= 3600;
        if(tributeId === '82' && onlyCopy) bonus -= 2200;
        if(conversionActive && ['98','28','60','94'].includes(tributeId)) bonus += 90;
      }
    }
  }

  else if(deckId === 'ai_snowball_fight_club') {
    const jimmyZone = aiFirstOwnCardZone(c=>c.id === '41');
    const safeRow = typeof getSafeRowForPlayer === 'function' ? getSafeRowForPlayer(cp) : (cp === 0 ? 2 : 0);
    const snowballSources = aiOwnBoardCardsById('93').length
      + aiOwnBoardCardsById('37').filter(entry=>String(entry.card._copiedPassiveId || entry.card.copiedPassiveId || '') === '93').length
      + aiOwnBoardCardsById('bh05').filter(entry=>String(entry.card._bh05CopiedPassiveId || '') === '93').length;
    if(move.type === 'place') {
      if(move.card.id === '93') {
        bonus += 285 + snowballSources * 35;
        bonus += move.r === safeRow ? 135 : -45;
      }
      if(move.card.id === '37') {
        bonus += aiOwnBoardCardsById('93').length ? 310 : -180;
        bonus += move.r === safeRow ? 115 : -35;
      }
      if(move.card.id === '31') bonus += 205;
      if(move.card.id === '58') bonus += G.players[cp].discard.some(c=>c.id === '31') ? 235 : 75;
      if(move.card.id === '60') bonus += aiOwnBoardCardsById('93').length ? 170 : 240;
      if(move.card.id === '05') bonus += jimmyZone === move.z ? 185 : 30;
      if(move.card.id === '71') bonus += 115;
      if(['32','42'].includes(move.card.id)) bonus += 85;
    }
    if(move.type === 'consolidate') {
      if(move.card.id === '41') {
        bonus += 560 + snowballSources * 95;
        if(move.r === safeRow) bonus += 190;
      }
      if(move.card.id === '08') bonus += aiOwnBoardCardsById('41').length ? 70 : 500;
      if(move.card.id === '48') {
        const taylorAvailable = G.players[cp].deck.some(c=>c.id === 'bh05') || G.players[cp].hand.some(c=>c.id === 'bh05');
        bonus += taylorAvailable ? 390 : 135;
      }
      if(move.card.id === 'bh05') {
        bonus += aiOwnBoardCardsById('93').length ? 475 : 70;
        if(move.r === safeRow) bonus += 130;
      }
      if(move.card.id === '13') bonus += 150;
      for(const tribute of move.tributes || []) {
        const copiedSnowball = typeof cardActsAsPassive === 'function' && cardActsAsPassive(tribute?.card, '93');
        if(copiedSnowball) bonus -= aiOwnBoardCardsById(String(tribute.card.id)).length <= 1 ? 4200 : 1500;
        if(tribute?.card?.id === '31' && aiOwnBoardCardsById('31').length <= 1) bonus -= 700;
      }
    }
  }

  else if(deckId === 'ai_crown_of_five') {
    const crownIds = ['15','19','57','01','77'];
    let formationZone = null;
    let formationValue = 0;
    for(let zi=0; zi<3; zi++) {
      const crownCount = aiCountOwnCardsInZone(zi,c=>crownIds.includes(c.id));
      const engineCount = aiCountOwnCardsInZone(zi,c=>['09','24','49'].includes(c.id));
      const value = crownCount * 100 + engineCount * 18;
      if(crownCount > 0 && value > formationValue) { formationValue = value; formationZone = zi; }
    }
    const majaZone = aiFirstOwnCardZone(c=>c.id === '07');
    const anchorZone = formationZone === null ? majaZone : formationZone;
    const crownHere = aiCountOwnCardsInZone(move.z,c=>crownIds.includes(c.id));
    const adjacent = typeof getAdjacentCards === 'function' ? getAdjacentCards(move.z,move.r,move.c) : [];
    const friendlyAdjacent = adjacent.filter(entry=>entry.card && entry.card.owner === cp);
    if(move.type === 'place') {
      if(move.card.id === '07') bonus += G.turn <= 2 ? 9999 : 270;
      if(move.card.id === '68') {
        const distinctCrown = crownIds.filter(id=>aiOwnBoardCardsById(id).length > 0).length;
        bonus += distinctCrown < crownIds.length ? 235 : 55;
      }
      if(move.card.id === '09') {
        const besideRalph = friendlyAdjacent.some(entry=>entry.card.id === '24');
        bonus += besideRalph ? 285 : 185;
        if(anchorZone !== null) bonus += move.z === anchorZone ? 145 : -105;
      }
      if(move.card.id === '24') {
        const adjacentSupporters = friendlyAdjacent.filter(entry=>entry.card.type === 'Supporter').length;
        bonus += 180 + adjacentSupporters * 65;
        if(move.c === 1) bonus += 55;
        if(anchorZone !== null) bonus += move.z === anchorZone ? 155 : -115;
      }
      if(move.card.id === '49') bonus += anchorZone === null || anchorZone === move.z ? 265 : 20;
      if(move.card.id === '92') {
        const setupPieces = aiCountOwnCardsInZone(move.z,c=>['09','24','49'].includes(c.id));
        bonus += setupPieces >= 2 ? 245 + setupPieces * 55 : -130;
      }
      if(move.card.id === '28') bonus += move.fromDeck ? 420 + (move.contested ? 120 : 0) : 115;
      if(move.card.id === '74') bonus += G.players[cp].hand.filter(c=>c.type === 'Supporter').length >= 2 ? 180 : 70;
      if(move.card.id === '60') bonus += 145;
    }
    if(move.type === 'consolidate' && crownIds.includes(move.card.id)) {
      const order = {'15':520,'19':455,'57':405,'01':355,'77':325};
      bonus += order[move.card.id] || 0;
      bonus += crownHere * 105;
      if(formationZone !== null && formationZone !== move.z) bonus -= 260;
      if(formationZone === null && anchorZone !== null && anchorZone !== move.z) bonus -= 145;
      if(move.card.id === '57' && crownHere < 1) bonus -= 140;
      if(move.card.id === '01') bonus += friendlyAdjacent.length * 75;
      if(move.card.id === '77') bonus += aiCountOwnCardsInZone(move.z,c=>String(c.aff||'') === 'third_great_war') * 38;
      for(const tribute of move.tributes || []) {
        const tributeId = String(tribute?.card?.id || '');
        if(crownIds.includes(tributeId) && aiOwnBoardCardsById(tributeId).length <= 1) bonus -= 3000;
        if(['24','49'].includes(tributeId) && aiOwnBoardCardsById(tributeId).length <= 1) bonus -= 2400;
        if(tributeId === '09' && aiOwnBoardCardsById('09').length <= 1) bonus -= 1400;
      }
    }
  }

  else if(deckId === 'ai_last_mohicans_ledger') {
    const moraleSystem = G._moralePressure;
    const ownMorale = Number(moraleSystem?.morale?.[cp] ?? moraleSystem?.maxMorale ?? 200);
    const maxMorale = Math.max(1, Number(moraleSystem?.maxMorale || 200));
    const chingEntry = aiOwnBoardCardsById('45')[0] || null;
    const chingZone = chingEntry ? chingEntry.z : null;
    const handHasChing = G.players[cp].hand.some(c=>c.id === '45');
    const chingAvailable = handHasChing || G.players[cp].deck.some(c=>c.id === '45');
    const westCaribArmed = !!(G._westCaribNext && G._westCaribNext.owner === cp);
    const safeRow = typeof getSafeRowForPlayer === 'function' ? getSafeRowForPlayer(cp) : (cp === 0 ? 2 : 0);
    if(move.type === 'place') {
      if(move.card.id === '33') bonus += westCaribArmed ? 20 : (chingAvailable ? 335 : 105);
      if(move.card.id === '20') {
        bonus += ownMorale < maxMorale * .55 ? 310 : 105;
        if(chingZone !== null) bonus += move.z === chingZone ? 155 : -70;
      }
      if(move.card.id === '75') bonus += G.players[cp].discard.some(c=>['33','47','05'].includes(c.id)) ? 245 : 100;
      if(move.card.id === '58') bonus += G.players[cp].discard.some(c=>['33','20','47','05'].includes(c.id)) ? 255 : 70;
      if(move.card.id === '60') bonus += !westCaribArmed && chingAvailable ? 235 : 95;
      if(move.card.id === '47') bonus += handHasChing ? 230 : 100;
      if(move.card.id === '64') {
        const adjacent = typeof getAdjacentCards === 'function' ? getAdjacentCards(move.z,move.r,move.c) : [];
        bonus += adjacent.some(entry=>entry.card && entry.card.owner === cp && entry.card.id === '45') ? 320 : 95;
      }
      if(move.card.id === '65') bonus += move.contested ? 175 : 35;
      if(move.card.id === '05') bonus += chingZone === move.z ? 285 : 15;
    }
    if(move.type === 'consolidate') {
      if(move.card.id === '45') {
        const otherCharacters = aiCountOwnCardsInZone(move.z,c=>c.type !== 'Supporter' && c.id !== '45');
        const greatOakTribute = (move.tributes || []).some(t=>t?.card?.id === '47');
        bonus += !chingEntry && ownMorale >= maxMorale * .42 && !otherCharacters ? 760 : -10000;
        if(move.r === safeRow) bonus += 180;
        if(westCaribArmed) bonus += 210;
        if(greatOakTribute) bonus += 190;
      }
      if(move.card.id === '03') {
        const bestLegalTarget = Math.max(0, ...[].concat(...(G.board[move.z] || [])).filter(c=>c&&c.owner===cp&&c.id!=='45').map(c=>Number(c.currentFate ?? c.fate)||0));
        bonus += bestLegalTarget >= 7 ? 420 + bestLegalTarget * 12 : -260;
      }
      if(move.card.id === '27') bonus += G.players[cp].hand.length <= 5 ? 260 : 90;
      for(const tribute of move.tributes || []) {
        if(tribute?.card?.id === '20' && tribute.z === chingZone) bonus -= 900;
        if(tribute?.card?.id === '64' && tribute.z === chingZone) bonus -= 850;
      }
    }
  }

  else if(deckId === 'ai_hellenic_heartbreaker') {
    const alexanders = aiOwnBoardCardsById('35');
    const alexanderZone = alexanders.length ? alexanders.slice().sort((a,b)=>(Number(b.card.currentFate ?? b.card.fate)||0)-(Number(a.card.currentFate ?? a.card.fate)||0))[0].z : null;
    const supporterFateHere = aiCountOwnCardsInZone(move.z,c=>c.type === 'Supporter')
      ? (G.board[move.z] || []).reduce((sum,row)=>sum+(row || []).reduce((inner,c)=>inner+(c&&c.owner===cp&&c.type==='Supporter' ? Math.max(0,Number(c.currentFate ?? c.fate)||0) : 0),0),0)
      : 0;
    const safeRow = typeof getSafeRowForPlayer === 'function' ? getSafeRowForPlayer(cp) : (cp === 0 ? 2 : 0);
    if(move.type === 'place') {
      if(move.card.id === '05') bonus += alexanderZone === move.z ? 340 : (supporterFateHere >= 3 ? 175 : 45);
      if(move.card.id === '47') bonus += G.players[cp].hand.some(c=>c.id === '35') ? 255 : 105;
      if(move.card.id === '64') {
        const adjacent = typeof getAdjacentCards === 'function' ? getAdjacentCards(move.z,move.r,move.c) : [];
        bonus += adjacent.some(entry=>entry.card && entry.card.owner === cp && entry.card.id === '35') ? 315 : (alexanderZone === move.z ? 165 : 80);
      }
      if(move.card.id === '75') bonus += G.players[cp].discard.some(c=>['05','47','60'].includes(c.id)) ? 220 : 95;
      if(move.card.id === '58') bonus += G.players[cp].discard.some(c=>['05','47','64'].includes(c.id)) ? 230 : 65;
      if(move.card.id === '60') bonus += alexanderZone === null ? 215 : 105;
      if(['32','42'].includes(move.card.id)) bonus += G.players[cp].hand.length <= 5 ? 145 : 65;
      if(move.card.id === '33') bonus += G.players[cp].deck.some(c=>c.id === '35') ? 185 : 70;
      if(move.card.id === '20') bonus += alexanderZone === move.z ? 155 : 70;
    }
    if(move.type === 'consolidate') {
      if(move.card.id === '35') {
        bonus += supporterFateHere >= 4 ? 650 + supporterFateHere * 32 : -320;
        if(move.r === safeRow) bonus += 120;
        if((move.tributes || []).some(t=>t?.card?.id === '47')) bonus += 210;
      }
      if(move.card.id === '22') bonus += alexanderZone === move.z ? 370 : 65;
      if(move.card.id === '03') {
        const alexander = aiOwnBoardCardsById('35').find(entry=>entry.z === move.z);
        const fate = Number(alexander?.card?.currentFate ?? alexander?.card?.fate ?? 0);
        bonus += alexander && fate >= 10 ? 690 + fate * 12 : -420;
      }
      if(move.card.id === '27') bonus += G.players[cp].hand.length <= 5 ? 260 : 95;
      for(const tribute of move.tributes || []) {
        if(tribute?.card?.id === '64' && tribute.z === alexanderZone) bonus -= 900;
        if(tribute?.card?.id === '20' && tribute.z === alexanderZone) bonus -= 500;
      }
    }
  }

  else if(deckId === 'ai_hungarian_war_dance') {
    const formationIds = ['34','66','77','19'];
    let formationZone = null, bestFormation = 0;
    for(let zi=0; zi<3; zi++) {
      const scoreHere = aiCountOwnCardsInZone(zi,c=>formationIds.includes(c.id)) * 100
        + aiCountOwnCardsInZone(zi,c=>String(c.aff||'') === 'third_great_war') * 20;
      if(scoreHere > bestFormation) { bestFormation = scoreHere; formationZone = zi; }
    }
    const piecesHere = aiCountOwnCardsInZone(move.z,c=>formationIds.includes(c.id));
    const tgwHere = aiCountOwnCardsInZone(move.z,c=>String(c.aff||'') === 'third_great_war');
    const safeRow = typeof getSafeRowForPlayer === 'function' ? getSafeRowForPlayer(cp) : (cp === 0 ? 2 : 0);
    if(move.type === 'place') {
      if(move.card.id === '07') bonus += G.turn <= 2 ? 9999 : 250;
      if(move.card.id === '68') {
        const missingCore = ['34','19','77'].some(id=>!aiOwnBoardCardsById(id).length&&!G.players[cp].hand.some(c=>c.id===id));
        bonus += missingCore ? 310 : 95;
      }
      if(['25','44','47','64'].includes(move.card.id)) {
        bonus += formationZone === move.z ? 230 : 75;
        if(formationZone !== null && formationZone !== move.z) bonus -= 150;
      }
      if(move.card.id === '44') {
        const adjacent = typeof getAdjacentCards === 'function' ? getAdjacentCards(move.z,move.r,move.c) : [];
        bonus += adjacent.some(entry=>entry.card&&entry.card.owner===cp&&entry.card.type==='Dauntless') ? 250 : 0;
      }
      if(move.card.id === '25') bonus += tgwHere * 35;
      if(move.card.id === '58') bonus += G.players[cp].discard.some(c=>['25','44','47','64'].includes(c.id)) ? 190 : 75;
      if(move.card.id === '60') bonus += 155;
      if(move.card.id === '13') bonus += G.players[cp].hand.filter(c=>c.type==='Supporter').length <= 2 ? 215 : 90;
    }
    if(move.type === 'consolidate') {
      if(formationIds.includes(move.card.id)) {
        bonus += 310 + piecesHere * 115;
        if(formationZone !== null && formationZone !== move.z) bonus -= 300;
        if(move.r === safeRow) bonus += 55;
      }
      if(move.card.id === '34') bonus += aiOwnBoardCardsById('34').length ? 170 : 430;
      if(move.card.id === '66') bonus += tgwHere * 55;
      if(move.card.id === '77') bonus += tgwHere * 65;
      if(move.card.id === '19') bonus += piecesHere * 60;
      if(move.card.id === '29') bonus += ['34','19','77'].some(id=>G.players[cp].deck.some(c=>c.id===id)) ? 280 : 80;
      for(const tribute of move.tributes || []) {
        if(tribute?.card?.id === '44' && tribute.z === formationZone) bonus -= 950;
      }
    }
  }

  else if(deckId === 'ai_great_oak_salvo') {
    const discardHasOak = G.players[cp].discard.some(c=>c.id === '47');
    const handHasPayoff = G.players[cp].hand.some(c=>['13','35','bh22'].includes(c.id));
    const discardHasMoraleInitiator = G.players[cp].discard.some(c=>['07','13','bh22'].includes(c.id));
    const safeRow = typeof getSafeRowForPlayer === 'function' ? getSafeRowForPlayer(cp) : (cp === 0 ? 2 : 0);
    if(move.type === 'place') {
      if(move.card.id === '07') bonus += G.turn <= 2 ? 9999 : 280;
      if(move.card.id === '47') bonus += handHasPayoff ? 355 : 245;
      if(move.card.id === '75') {
        const copyableRecovery = aiOwnBoardCardsById('58').length || aiOwnBoardCardsById('60').length;
        bonus += discardHasOak && copyableRecovery ? 330 : (copyableRecovery ? 190 : 95);
      }
      if(move.card.id === '58') bonus += discardHasOak ? 370 : 80;
      if(move.card.id === '60') bonus += G.players[cp].deck.some(c=>c.id === '47') ? 280 : 95;
      if(move.card.id === '64') {
        const adjacent = typeof getAdjacentCards === 'function' ? getAdjacentCards(move.z,move.r,move.c) : [];
        bonus += adjacent.some(entry=>entry.card&&entry.card.owner!==cp) ? 285 : 145;
      }
      if(move.card.id === '65') bonus += move.r === 1 ? 330 : 40;
      if(move.card.id === '20') bonus += 245;
      if(move.card.id === '69') bonus += discardHasMoraleInitiator ? 285 : 45;
      if(move.card.id === '33') bonus += handHasPayoff ? 245 : 90;
      if(move.card.id === '32') bonus += G.players[cp].hand.length <= 5 ? 165 : 75;
      if(move.card.id === '35') bonus += move.r === safeRow ? 420 : 350;
      if(move.card.id === 'bh22') bonus += move.r === safeRow ? 390 : 210;
    }
    if(move.type === 'consolidate' && ['13','35','bh22'].includes(move.card.id)) {
      const oakTributes = (move.tributes || []).filter(t=>t?.card?.id === '47').length;
      bonus += 210 + oakTributes * 310;
      if(move.r === safeRow) bonus += 65;
      if(move.card.id === '35') bonus += 260;
      if(move.card.id === 'bh22' && move.r === safeRow) bonus += 280;
      for(const tribute of move.tributes || []) {
        if(['20','64','65'].includes(tribute?.card?.id)) bonus -= 850;
        if(['58','60','75'].includes(tribute?.card?.id) && discardHasOak) bonus -= 220;
      }
    }
  }

  else if(deckId === 'ai_adjacency_doctrine') {
    const formationIds = ['35','bh07','bh11','01','19','15'];
    let formationZone = null, bestFormation = 0;
    for(let zi=0; zi<3; zi++) {
      const scoreHere = aiCountOwnCardsInZone(zi,c=>formationIds.includes(c.id)) * 100
        + aiCountOwnCardsInZone(zi,c=>['25','44','bh12'].includes(c.id)) * 24;
      if(scoreHere > bestFormation) { bestFormation = scoreHere; formationZone = zi; }
    }
    const adjacent = typeof getAdjacentCards === 'function' ? getAdjacentCards(move.z,move.r,move.c) : [];
    const friendlyAdjacent = adjacent.filter(entry=>entry.card && entry.card.owner === cp);
    const dauntlessAdjacent = friendlyAdjacent.filter(entry=>entry.card.type === 'Dauntless').length;
    const adjacencySourcesHere = aiCountOwnCardsInZone(move.z,c=>['44','bh07','bh11','bh12','01'].includes(c.id));
    if(move.type === 'place') {
      if(move.card.id === '07') bonus += G.turn <= 2 ? 9999 : 260;
      if(move.card.id === '68') {
        const missing = ['bh11','bh07','01','19','15'].some(id=>!aiOwnBoardCardsById(id).length&&!G.players[cp].hand.some(c=>c.id===id));
        bonus += missing ? 320 : 85;
      }
      if(move.card.id === '25') bonus += friendlyAdjacent.some(entry=>String(entry.card.aff||'') === 'third_great_war') ? 310 : 95;
      if(move.card.id === '44') bonus += dauntlessAdjacent ? 365 + dauntlessAdjacent * 60 : 30;
      if(move.card.id === '47') bonus += G.players[cp].hand.some(c=>['35','bh07','bh11','01'].includes(c.id)) ? 210 : 90;
      if(move.card.id === '64') bonus += formationZone === move.z && adjacent.some(entry=>entry.card&&entry.card.owner!==cp) ? 265 : 90;
      if(formationZone !== null && move.z !== formationZone && ['25','44','47','64'].includes(move.card.id)) bonus -= 190;
    }
    if(move.type === 'consolidate') {
      if(formationIds.includes(move.card.id)) {
        bonus += 300 + friendlyAdjacent.length * 115 + adjacencySourcesHere * 45;
        if(formationZone !== null && formationZone !== move.z) bonus -= 330;
      }
      if(move.card.id === 'bh11') {
        bonus += friendlyAdjacent.length * 190;
        if(move.c === 1) bonus += 85;
      }
      if(move.card.id === 'bh07') bonus += dauntlessAdjacent * 250;
      if(move.card.id === '35') bonus += friendlyAdjacent.some(entry=>entry.card.id === '44') ? 330 : -110;
      if(move.card.id === '01') bonus += friendlyAdjacent.length * 125;
      if(move.card.id === 'bh12') bonus += friendlyAdjacent.length ? 245 : -80;
      if(move.card.id === '66') bonus += aiCountOwnCardsInZone(move.z,()=>true) * 45;
      for(const tribute of move.tributes || []) {
        if(tribute?.card?.id === '44' && tribute.z === formationZone) bonus -= 1500;
        if(tribute?.card?.id === '25' && tribute.z === formationZone) bonus -= 650;
      }
    }
  }

  else if(deckId === 'ai_hand_quarantine') {
    const opponentHandSize = Number(G.players[1-cp]?.hand?.length || 0);
    const guerillaInHand = G.players[cp].hand.some(c=>c.id === '70');
    const westGermanAvailable = G.players[cp].hand.some(c=>c.id === '42') || G.players[cp].deck.some(c=>c.id === '42');
    const fortCalvinActive = Array.isArray(G._fortCalvinActive) && G._fortCalvinActive.some(fx=>fx&&fx.owner===cp&&fx.remaining>0);
    if(move.type === 'place') {
      if(move.card.id === '42') bonus += guerillaInHand ? 620 : (G.players[cp].hand.length <= 4 ? 220 : 80);
      if(move.card.id === '70') bonus += westGermanAvailable ? -650 : -180;
      if(move.card.id === '72') bonus += opponentHandSize >= 5 ? 390 : (opponentHandSize >= 3 ? 245 : 35);
      if(move.card.id === '71') bonus += fortCalvinActive ? 25 : 260;
      if(move.card.id === '50') bonus += 290;
      if(move.card.id === '52') bonus += aiCountOpponentCardsInZone(move.z) ? 215 + aiCountOpponentCardsInZone(move.z) * 25 : -90;
      if(move.card.id === '58') bonus += G.players[cp].discard.some(c=>['72','71','50','42'].includes(c.id)) ? 235 : 65;
      if(move.card.id === '60') bonus += guerillaInHand && !G.players[cp].hand.some(c=>c.id==='42') ? 300 : 115;
      if(move.card.id === '33') bonus += G.players[cp].deck.some(c=>['61','56'].includes(c.id)) ? 140 : 55;
    }
    if(move.type === 'consolidate') {
      if(move.card.id === 'bh03') bonus -= 10000;
      if(move.card.id === '61') {
        const visibleCharacterFamilies = new Set(G.players[1-cp].hand.filter(c=>c&&c.type!=='Supporter').map(c=>c.id)).size;
        bonus += visibleCharacterFamilies ? 420 + visibleCharacterFamilies * 45 : 70;
      }
      if(move.card.id === '56') bonus += aiOwnBoardCardsById('56').length ? 140 : 420;
      if(move.card.id === '31') bonus += aiCountOpponentCardsInZone(move.z) ? 280 : 90;
      for(const tribute of move.tributes || []) {
        if(tribute?.card?.id === '70') bonus += 420; // discarding it is the payoff
      }
    }
  }

  else if(deckId === 'ai_high_t_draw_mill') {
    const joieZone = aiFirstOwnCardZone(c=>c.id === 'bh02');
    const drawIds = ['27','32','42','bh10'];
    const highTActive = typeof getHighTPotencyCount === 'function' ? getHighTPotencyCount(cp) > 0 : false;
    const hseiActive = aiOwnBoardCardsById('bh15').length > 0;
    const erbsArmed = !!(Array.isArray(G.erbsActive) ? G.erbsActive[cp] : G.erbsActive);
    const engineZone = joieZone;
    const safeRow = typeof getSafeRowForPlayer === 'function' ? getSafeRowForPlayer(cp) : (cp === 0 ? 2 : 0);
    if(move.type === 'place') {
      if(drawIds.includes(move.card.id)) {
        const engineReady = joieZone !== null && (highTActive || hseiActive);
        bonus += joieZone === move.z ? (engineReady ? 380 : 210) : 45;
        if(joieZone !== null && joieZone !== move.z) bonus -= 220;
        if(move.card.id === '42' && G.players[cp].hand.length < 3) bonus -= 80;
        if(move.card.id === 'bh10') {
          const weakHand = G.players[cp].hand.filter(c=>Math.max(0,Number(c.currentFate ?? c.fate)||0)<=2).length;
          bonus += weakHand >= 3 ? 210 : -170;
        }
      }
      if(move.card.id === '47') bonus += G.players[cp].hand.some(c=>['bh02','bh19','bh15','40'].includes(c.id)) ? 240 : 90;
      if(move.card.id === '64') bonus += engineZone === move.z ? 220 : 80;
      if(move.card.id === '58') bonus += G.players[cp].discard.some(c=>drawIds.includes(c.id)||c.id==='47') ? 260 : 70;
      if(move.card.id === '05') bonus += engineZone === move.z ? (highTActive ? 330 : 210) : 45;
    }
    if(move.type === 'consolidate') {
      if(move.card.id === 'bh02') {
        bonus += aiOwnBoardCardsById('bh02').length ? 250 : 850;
        if(move.r === safeRow) bonus += 180;
      }
      if(move.card.id === 'bh15') bonus += joieZone === move.z ? (hseiActive ? 180 : 560) : 120;
      if(move.card.id === 'bh19') {
        const queuedGains = G.players[cp].hand.some(c=>['32','42','05','bh13','27'].includes(c.id));
        bonus += joieZone === move.z && queuedGains ? 620 : (queuedGains ? 330 : 90);
        if(highTActive) bonus -= 520;
      }
      if(move.card.id === '40') bonus += joieZone === move.z ? (erbsArmed ? 80 : 390) : 105;
      if(move.card.id === 'bh13') bonus += G.players[cp].hand.length >= 5 && (highTActive || hseiActive) ? 520 : (G.players[cp].hand.length >= 4 ? 230 : -120);
      if(move.card.id === '03') {
        const grownTarget = Math.max(0,...[].concat(...(G.board[move.z]||[])).filter(c=>c&&c.owner===cp).map(c=>Number(c.currentFate ?? c.fate)||0));
        bonus += grownTarget >= 12 ? 590 + grownTarget * 10 : -280;
      }
      for(const tribute of move.tributes || []) {
        if(tribute?.card?.id === '64' && tribute.z === joieZone) bonus -= 800;
        if(tribute?.card?.id === '47') bonus += 170;
      }
    }
  }

  else if(deckId === 'ai_university_counterbattery') {
    const majaZone = aiFirstOwnCardZone(c=>c.id === 'bh08');
    const safeRow = typeof getSafeRowForPlayer === 'function' ? getSafeRowForPlayer(cp) : (cp === 0 ? 2 : 0);
    const counterCount = aiOwnBoardCardsById('56').length + aiOwnBoardCardsById('67').length;
    const reactiveHavanoInHand = G.players[cp].hand.some(c=>c.id === '79');
    if(move.type === 'place') {
      if(['18','50','71'].includes(move.card.id)) {
        bonus += majaZone === move.z ? 290 : 85;
        if(majaZone !== null && majaZone !== move.z) bonus -= 185;
      }
      if(move.card.id === '79') bonus -= reactiveHavanoInHand ? 900 : 500; // keep it in hand for its free reactive set
      if(move.card.id === '18') bonus += G.oppSuppressedNextTurn && G.suppressTarget === 1-cp ? -260 : 210;
      if(move.card.id === '50') bonus += 165 + aiCountOpponentCardsInZone(move.z) * 25;
      if(move.card.id === '71') {
        const active = Array.isArray(G._fortCalvinActive) && G._fortCalvinActive.some(fx=>fx&&fx.owner===cp&&fx.remaining>0);
        bonus += active ? -120 : 150;
      }
      if(move.card.id === '60') bonus += majaZone === null ? 190 : 105;
      if(move.card.id === '58') bonus += G.players[cp].discard.some(c=>['18','50','71'].includes(c.id)) ? 240 : 65;
      if(move.card.id === '47') bonus += G.players[cp].hand.some(c=>['bh08','56','67','21'].includes(c.id)) ? 215 : 80;
      if(move.card.id === '32') bonus += G.players[cp].hand.length <= 4 ? 150 : 60;
    }
    if(move.type === 'consolidate') {
      if(move.card.id === 'bh08') {
        bonus += aiOwnBoardCardsById('bh08').length ? 240 : 820;
        if(move.r === safeRow) bonus += 160;
      }
      if(move.card.id === '56') bonus += majaZone === move.z ? (counterCount ? 330 : 580) : 205;
      if(move.card.id === '67') bonus += majaZone === move.z ? (counterCount ? 320 : 520) : 170;
      if(move.card.id === '21') {
        const adjacentOppCoordinators = (typeof getAdjacentCards === 'function' ? getAdjacentCards(move.z,move.r,move.c) : [])
          .filter(entry=>entry.card&&entry.card.owner===1-cp&&entry.card.type==='Coordinator').length;
        bonus += majaZone === move.z ? 380 + adjacentOppCoordinators * 230 : 145;
      }
      if(move.card.id === '17') bonus += 310;
      if(move.card.id === '04') bonus += aiCountOpponentCardsInZone(move.z) ? 350 : 105;
      for(const tribute of move.tributes || []) {
        if(tribute?.card?.id === '79') bonus -= 1200;
      }
    }
  }

  else if(deckId === 'ai_selva_tidal_strike') {
    let strikeZone = null, strikeValue = -Infinity;
    for(let zi=0; zi<3; zi++) {
      const eventides = aiCountOwnCardsInZone(zi,c=>String(c.aff||'') === 'eventide');
      const enemies = aiCountOpponentCardsInZone(zi);
      const value = eventides * 55 + enemies * 42 + (getZoneScore(zi,1-cp)-getZoneScore(zi,cp));
      if(value > strikeValue) { strikeValue = value; strikeZone = zi; }
    }
    const eventideCount = aiCountOwnCardsInZone(move.z,c=>String(c.aff||'') === 'eventide');
    const opponentCount = aiCountOpponentCardsInZone(move.z);
    const westCaribArmed = !!(G._westCaribNext && G._westCaribNext.owner === cp);
    const bh04Ready = G.players[cp].hand.some(c=>c.id === 'bh04') || G.players[cp].deck.some(c=>c.id === 'bh04');
    if(move.type === 'place') {
      if(move.card.id === '33') bonus += bh04Ready && !westCaribArmed ? 390 : 70;
      if(move.card.id === '74') bonus += 215;
      if(move.card.id === '75') bonus += aiOwnBoardCardsById('33').length||G.players[cp].discard.some(c=>['33','58'].includes(c.id)) ? 245 : 100;
      if(move.card.id === '47') bonus += G.players[cp].hand.some(c=>['bh04','51','77','bh16'].includes(c.id)) ? 245 : 95;
      if(move.card.id === '64') {
        const adjacentEnemy = (typeof getAdjacentCards === 'function' ? getAdjacentCards(move.z,move.r,move.c) : []).some(entry=>entry.card&&entry.card.owner===1-cp);
        bonus += adjacentEnemy ? 270 : 105;
      }
      if(move.card.id === '65') bonus += move.contested ? 260 : -100;
      if(move.card.id === '58') bonus += G.players[cp].discard.some(c=>['33','47','64','65'].includes(c.id)) ? 255 : 70;
      if(strikeZone !== null && move.z === strikeZone && ['47','64','65','74','75','58'].includes(move.card.id)) bonus += 120;
    }
    if(move.type === 'consolidate') {
      if(move.card.id === 'bh04') {
        const enemyTypes = {};
        (G.board[move.z]||[]).forEach(row=>(row||[]).forEach(c=>{ if(c&&c.owner===1-cp) enemyTypes[c.type]=(enemyTypes[c.type]||0)+1; }));
        const largestTypeCluster = Math.max(0,...Object.values(enemyTypes));
        bonus += opponentCount >= 2 ? 520 + opponentCount * 105 + largestTypeCluster * 95 : -260;
        if(westCaribArmed) bonus += 180;
      }
      if(move.card.id === '51') bonus += strikeZone === move.z ? 430 : 180;
      if(move.card.id === '77') bonus += strikeZone === move.z ? 340 + eventideCount * 70 : 120;
      if(move.card.id === 'bh16') bonus += strikeZone === move.z && eventideCount >= 3 ? 520 + eventideCount * 85 : 80;
      if(move.card.id === '30') bonus += G.board[move.z]?.[1]?.some(c=>c&&c.owner!==cp) ? 390 : 20;
      if(move.card.id === '06') bonus += westCaribArmed && bh04Ready ? 390 : (bh04Ready ? 245 : 120);
      if(move.card.id === '02') bonus += strikeZone === move.z ? 360 : 180;
      for(const tribute of move.tributes || []) {
        if(tribute?.card?.id === '64' && tribute.z === strikeZone) bonus -= 900;
        if(tribute?.card?.id === '65' && tribute.z === strikeZone) bonus -= 550;
        if(tribute?.card?.id === '47') bonus += 170;
      }
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
      const handSupporters = G.players[cp].hand.filter(c=>typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(c, cp) : c.type === 'Supporter').length;
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
        G.board[move.z]?.forEach(row=>row?.forEach(cell=>{ if(cell && cell.owner === 1-cp && aiIsPublicBoardCard(cell) && (typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(cell, 1-cp) : cell.type === 'Supporter')) hasOppSupporter = true; }));
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

  else if(deckId === 'ai_kvetka_chain') {
    const kvetkas = aiOwnBoardCardsById('84');
    if(move.type === 'place') {
      if(move.card.id === '68') bonus += aiOwnBoardCardsById('81').length ? 35 : 140;
      if(['09','47','60','24','58','32'].includes(move.card.id)) bonus += 45;
      if(move.card.id === '05') {
        const hasPayoff = aiCountOwnCardsInZone(move.z, c => ['100','88','84'].includes(c.id)) > 0;
        bonus += hasPayoff ? 95 : 20;
      }
    }
    if(move.type === 'consolidate') {
      if(move.card.id === '84') bonus += kvetkas.length ? 260 : 540;
      if(move.card.id === '100') {
        const namedPieceReady = kvetkas.length || aiOwnBoardCardsById('88').length;
        bonus += namedPieceReady ? 310 : 145;
      }
      if(move.card.id === '88') bonus += 190;
      if(move.card.id === '86') bonus += 185;
      if(move.card.id === '81') bonus += 115;
      if(move.card.id === '03') {
        const hasPayoff = aiCountOwnCardsInZone(move.z, c => ['100','88','84'].includes(c.id)) > 0;
        bonus += hasPayoff ? 260 : -55;
      }
    }
  }

  else if(deckId === 'ai_total_blackout') {
    if(move.type === 'place') {
      if(move.card.id === '50') bonus += 230;
      if(move.card.id === '16') {
        const hasTarget = G.board[move.z]?.some(row=>row?.some(c=>c && c.owner===1-cp && aiIsPublicBoardCard(c) && (typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(c, 1-cp) : c.type==='Supporter')));
        bonus += hasTarget ? 175 : -25;
      }
      if(move.card.id === '71') bonus += 90;
      if(['75','60','58','32','09'].includes(move.card.id)) bonus += 45;
    }
    if(move.type === 'consolidate') {
      const priority = {'17':330,'04':290,'21':260,'56':240,'61':185,'30':150};
      bonus += priority[move.card.id] || 0;
      if(move.card.id === '21') {
        const opposingCoordinator = G.board[move.z]?.some(row=>row?.some(c=>c && c.owner===1-cp && aiIsPublicBoardCard(c) && c.type==='Coordinator'));
        if(opposingCoordinator) bonus += 110;
      }
    }
  }

  else if(deckId === 'ai_living_formation') {
    const formationIds = ['35','11','57','23','59','63'];
    const formationZone = aiFirstOwnCardZone(c => formationIds.includes(c.id));
    const supportCount = aiCountOwnCardsInZone(move.z, c => typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(c, cp) : c.type === 'Supporter');
    if(move.type === 'place') {
      if(formationZone !== null && move.z !== formationZone && ['24','59','63','05'].includes(move.card.id)) bonus -= 115;
      if(move.card.id === '68') bonus += 120;
      if(move.card.id === '24') bonus += 80;
      if(move.card.id === '59') bonus += 95 + supportCount * 20;
      if(move.card.id === '63') {
        const copies = aiCountOwnCardsInZone(move.z, c => c.id === '63');
        bonus += 90 + copies * 70;
      }
      if(['60','32','05','09'].includes(move.card.id)) bonus += 45;
    }
    if(move.type === 'consolidate') {
      if(formationZone !== null && move.z !== formationZone && formationIds.includes(move.card.id)) bonus -= 150;
      const auraPieces = aiCountOwnCardsInZone(move.z, c => ['11','57','23'].includes(c.id));
      if(move.card.id === '11') bonus += 230 + supportCount * 25 + auraPieces * 35;
      if(move.card.id === '57') bonus += 205 + auraPieces * 45;
      if(move.card.id === '23') bonus += 180 + auraPieces * 35;
      if(move.card.id === '35') bonus += supportCount >= 3 ? 360 + supportCount * 35 : -90;
      if(move.card.id === '22') bonus += 70;
    }
  }

  else if(deckId === 'ai_snowbound_wintertide') {
    const snowActive = String(G.landscapeId || '') === 'igb15';
    const winterIds = ['84','87','99','100'];
    const winterZone = aiFirstOwnCardZone(c => winterIds.includes(c.id));
    if(move.type === 'place') {
      if(move.card.id === '98') bonus += G.turn <= 3 ? 155 : 55;
      if(move.card.id === '91') bonus += snowActive ? 230 : 20;
      if(move.card.id === '47') bonus += 95;
      if(move.card.id === '94') bonus += 85;
      if(move.card.id === '97') bonus += 80;
      if(move.card.id === '80') bonus += aiCountOwnCardsInZone(move.z, c => c.type !== 'Supporter') ? 75 : -25;
      if(move.card.id === '96') bonus += G.players[cp].discard.length >= 3 ? 135 : -45;
      if(move.card.id === '100') {
        const namedReady = aiOwnBoardCardsById('82').length || aiOwnBoardCardsById('84').length || aiOwnBoardCardsById('87').length;
        bonus += (snowActive ? 430 : 170) + (namedReady ? 135 : 0);
      }
      if(move.card.id === '87') bonus += 285;
      if(move.card.id === '99') bonus += 165;
      if(move.card.id === 'bh05') bonus += 360;
      if(winterZone !== null && move.z !== winterZone && winterIds.includes(move.card.id)) bonus -= 95;
    }
    if(move.type === 'consolidate') {
      if(move.card.id === '82') bonus += snowActive ? 35 : 520;
      if(move.card.id === '84') bonus += 540;
      if(move.card.id === '100') {
        const namedReady = aiOwnBoardCardsById('82').length || aiOwnBoardCardsById('84').length || aiOwnBoardCardsById('87').length;
        bonus += (snowActive ? 430 : 170) + (namedReady ? 135 : 0);
      }
      if(move.card.id === '99') {
        const supporters = aiCountOwnCardsInZone(move.z, c => typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(c, cp) : c.type === 'Supporter');
        bonus += 165 + supporters * 32;
      }
      if(move.card.id === '87') bonus += 285;
      if(move.card.id === '90') bonus += 180;
      if(move.card.id === 'bh05') bonus += 360;
      if(winterZone !== null && move.z !== winterZone && winterIds.includes(move.card.id)) bonus -= 95;
    }
  }

  else if(deckId === 'ai_overclocked_dauntless') {
    const agentZone = aiFirstOwnCardZone(c => c.id === 'bh07');
    const dauntlessInZone = aiCountOwnCardsInZone(move.z, c => c.type === 'Dauntless');
    const adjacent = typeof getAdjacentCards === 'function' ? getAdjacentCards(move.z, move.r, move.c) : [];
    const adjacentAgent = adjacent.some(entry => entry.card && entry.card.owner === cp && entry.card.id === 'bh07');
    const adjacentDauntless = adjacent.filter(entry => entry.card && entry.card.owner === cp && entry.card.type === 'Dauntless').length;
    if(move.type === 'place') {
      if(move.card.id === '68') bonus += aiOwnBoardCardsById('bh07').length ? 55 : 190;
      if(move.card.id === '60') bonus += 90;
      if(move.card.id === '54') bonus += aiOwnBoardCardsById('bh07').length && aiOwnBoardCardsById('84').length ? 185 : 75;
      if(move.card.id === '44') bonus += adjacent.some(entry => entry.card && entry.card.owner === cp && entry.card.type === 'Dauntless') ? 180 : 55;
      if(['47','95','98'].includes(move.card.id)) bonus += 65;
      if(move.card.type === 'Dauntless') bonus += 170 + (adjacentAgent ? 260 : 0) + (agentZone === move.z ? 90 : 0);
      if(move.card.id === '100') bonus += 345;
      if(move.card.id === '89') bonus += 290;
      if(move.card.id === '88') bonus += 260;
    }
    if(move.type === 'consolidate') {
      if(move.card.id === 'bh07') bonus += 390 + adjacentDauntless * 145 + dauntlessInZone * 45;
      if(move.card.type === 'Dauntless') bonus += 170 + (adjacentAgent ? 260 : 0) + (agentZone === move.z ? 90 : 0);
      if(move.card.id === '84') bonus += 480;
      if(move.card.id === '100') bonus += 345;
      if(move.card.id === '89') bonus += 290;
      if(move.card.id === '88') bonus += 260;
      if(move.card.id === '83') bonus += 125 + aiCountOwnCardsInZone(move.z, c => c.type !== 'Supporter') * 28;
    }
  }

  else if(deckId === 'ai_thousand_reel_drawstorm') {
    const joieZone = aiFirstOwnCardZone(c => c.id === 'bh02');
    const drawIds = ['32','42','80','27','bh01'];
    if(move.type === 'place') {
      if(move.card.id === '68') bonus += aiOwnBoardCardsById('bh02').length ? 45 : 215;
      if(move.card.id === '60') bonus += 105;
      if(drawIds.includes(move.card.id)) {
        bonus += joieZone === move.z ? 190 : 70;
        if(joieZone !== null && joieZone !== move.z) bonus -= 115;
      }
      if(move.card.id === '74') bonus += 115;
      if(move.card.id === '75') bonus += joieZone === move.z ? 130 : 65;
      if(move.card.id === '80') {
        const hasCharacter = aiCountOwnCardsInZone(move.z, c => c.type !== 'Supporter') > 0;
        bonus += hasCharacter ? 115 : -85;
      }
    }
    if(move.type === 'consolidate') {
      if(move.card.id === '08') bonus += aiOwnBoardCardsById('bh02').length ? 65 : 345;
      if(move.card.id === 'bh02') bonus += 560 + aiCountOwnCardsInZone(move.z, ()=>true) * 28;
      if(move.card.id === '27') bonus += joieZone === move.z ? 285 : 135;
      if(move.card.id === '40') bonus += joieZone === move.z ? 225 : 105;
      if(move.card.id === 'bh01') bonus += 300;
    }
  }

  else if(deckId === 'ai_university_mischief') {
    const majaZone = aiFirstOwnCardZone(c => c.id === 'bh08');
    const suppressionIds = ['92','18','79','37'];
    if(move.type === 'place') {
      if(move.card.id === '68') bonus += aiOwnBoardCardsById('bh08').length ? 45 : 235;
      if(move.card.id === '60') bonus += 100;
      if(suppressionIds.includes(move.card.id)) {
        bonus += majaZone === move.z ? 205 : 55;
        if(majaZone !== null && majaZone !== move.z) bonus -= 120;
      }
      if(move.card.id === '92') bonus += majaZone === move.z ? 180 : -145;
      if(move.card.id === '75') bonus += majaZone === move.z ? 115 : 45;
      if(['05','09','58'].includes(move.card.id)) bonus += 55;
    }
    if(move.type === 'consolidate') {
      if(move.card.id === 'bh08') bonus += 570 + aiCountOwnCardsInZone(move.z, ()=>true) * 22;
      if(move.card.id === '56') bonus += majaZone === move.z ? 330 : 215;
      if(move.card.id === '67') bonus += majaZone === move.z ? 245 : 125;
      if(move.card.id === '21') bonus += majaZone === move.z ? 275 : 160;
    }
  }

  else if(deckId === 'ai_alis_handcuffs') {
    if(move.type === 'place') {
      const guerillaInHand = G.players[cp].hand.some(c => c && c.id === '70');
      if(move.card.id === '42') bonus += guerillaInHand ? 310 : 115;
      if(move.card.id === '70') bonus -= guerillaInHand ? 190 : 80;
      if(move.card.id === '72') bonus += 265;
      if(move.card.id === '71') bonus += 175;
      if(move.card.id === '52') bonus += 125;
      if(move.card.id === '50') bonus += 205;
      if(move.card.id === '75') bonus += 135;
      if(['58','60','74'].includes(move.card.id)) bonus += 75;
    }
    if(move.type === 'consolidate') {
      if(move.card.id === '61') bonus += 315;
      if(move.card.id === '31') bonus += 180;
      if(move.card.id === '56') bonus += 235;
      if(move.card.id === 'bh03') bonus -= 250;
    }
  }

  else if(deckId === 'ai_destruction_paradise') {
    const eventideCount = aiCountOwnCardsInZone(move.z, c => c.aff === 'eventide');
    const opponentCount = aiCountOpponentCardsInZone(move.z);
    if(move.type === 'place') {
      if(move.card.id === '33') {
        const hasSelvaToFind = G.players[cp].deck.some(c => c.id === 'bh04') || G.players[cp].hand.some(c => c.id === 'bh04');
        bonus += hasSelvaToFind ? 275 : 75;
      }
      if(move.card.id === '06') bonus += G._westCaribNext && G._westCaribNext.owner === cp ? 330 : 175;
      if(move.card.id === '74') bonus += 130;
      if(move.card.id === '75') bonus += 120;
      if(['65','64','79'].includes(move.card.id)) bonus += 85;
    }
    if(move.type === 'consolidate') {
      if(move.card.id === 'bh04') bonus += 360 + opponentCount * 85;
      if(move.card.id === '51') bonus += 285;
      if(move.card.id === '77') bonus += 235 + eventideCount * 48;
      if(move.card.id === '30') {
        const contestedTarget = G.board[move.z]?.[1]?.some(c => c && c.owner !== cp);
        bonus += contestedTarget ? 260 : 70;
      }
      if(move.card.id === '27') bonus += 135;
      if(move.card.id === 'bh01') bonus += 280;
    }
  }

  else if(deckId === 'ai_taylors_perfect_mimic') {
    const taylorAvailable = G.players[cp].deck.some(c => c.id === 'bh05') || G.players[cp].hand.some(c => c.id === 'bh05');
    if(move.card.id === 'bh05') bonus += 575;
    if(move.type === 'place') {
      if(move.card.id === '32') bonus += taylorAvailable ? 145 : 65;
      if(move.card.id === '60') bonus += 95;
      if(['47','58','75','05'].includes(move.card.id)) bonus += 75;
    }
    if(move.type === 'consolidate') {
      if(move.card.id === '48') bonus += taylorAvailable ? 465 : 155;
      if(move.card.id === '84') bonus += taylorAvailable ? 520 : 335;
      if(move.card.id === '14') bonus += 330;
      if(move.card.id === 'bh04') bonus += 285 + aiCountOpponentCardsInZone(move.z) * 65;
      if(move.card.id === '100') bonus += 250;
      if(move.card.id === '90') bonus += 180;
      if(move.card.id === '06') bonus += 145;
    }
  }

  else if(deckId === 'ai_adaptive_formation') {
    const formationIds = ['bh07','15','19','01','77'];
    const formationZone = aiFirstOwnCardZone(c => formationIds.includes(c.id));
    if(move.card.id === 'bh06' && G.turn < 6) bonus -= 10000;
    if(move.type === 'place') {
      if(move.card.id === '07') bonus += G.turn <= 2 ? 9999 : 285;
      if(move.card.id === '68') bonus += 175;
      if(move.card.id === '60') bonus += 105;
      if(['44','59','63','47','05'].includes(move.card.id)) {
        bonus += formationZone === move.z ? 145 : 65;
        if(formationZone !== null && formationZone !== move.z) bonus -= 85;
      }
    }
    if(move.type === 'consolidate') {
      if(move.card.id === 'bh06' && G.turn >= 6) bonus += 720;
      if(formationIds.includes(move.card.id)) {
        bonus += 235 + aiCountOwnCardsInZone(move.z, c => formationIds.includes(c.id)) * 60;
        if(formationZone !== null && formationZone !== move.z) bonus -= 145;
      }
      if(move.card.id === 'bh07') bonus += 175 + aiCountOwnCardsInZone(move.z, c => c.type === 'Dauntless') * 90;
    }
  }

  else if(deckId === 'ai_pierogi_siege') {
    const snowActive = String(G.landscapeId || '') === 'igb15';
    if(move.type === 'place') {
      if(move.card.id === '97') bonus += 205;
      if(move.card.id === '50') bonus += 245;
      if(move.card.id === '91') bonus += snowActive ? 220 : 35;
      if(move.card.id === '93') bonus += 105;
      if(move.card.id === '94') bonus += 95;
      if(move.card.id === '75') bonus += 125;
      if(move.card.id === '60') bonus += 85;
    }
    if(move.type === 'consolidate') {
      if(move.card.id === '82') bonus += snowActive ? 45 : 510;
      if(move.card.id === '81') {
        const counts = G._wojciechLastTurnPlacementCounts || [0,0];
        bonus += 235 + (Number(counts[1-cp]) || 0) * 95;
      }
      if(move.card.id === '17') bonus += 315;
      if(move.card.id === '04') bonus += 285;
      if(move.card.id === 'bh04') bonus += 315 + aiCountOpponentCardsInZone(move.z) * 80;
      if(move.card.id === '56') bonus += 220;
      if(move.card.id === '06') bonus += 155;
    }
  }

  else if(deckId === 'ai_bombastic_search_punisher') {
    const boleslawZone = aiFirstOwnCardZone(c => c.id === '86');
    const joieZone = aiFirstOwnCardZone(c => c.id === 'bh02');
    if(move.type === 'place') {
      if(move.card.id === '68') bonus += aiOwnBoardCardsById('bh02').length ? 55 : 225;
      if(move.card.id === '60') bonus += 105;
      if(['32','42','71','94','97'].includes(move.card.id)) bonus += joieZone === move.z ? 145 : 80;
    }
    if(move.type === 'consolidate') {
      if(move.card.id === '86') bonus += 475 + (joieZone === move.z ? 125 : 0);
      if(move.card.id === 'bh02') bonus += 490 + (boleslawZone === move.z ? 155 : 0);
      if(move.card.id === '08') bonus += aiOwnBoardCardsById('bh02').length ? 65 : 330;
      if(move.card.id === 'bh03') bonus += 90;
      if(move.card.id === '40') bonus += joieZone === move.z ? 215 : 110;
      if(move.card.id === '27') bonus += joieZone === move.z ? 250 : 125;
      if(move.card.id === 'bh01') bonus += 265;
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

  // Model the opponent's most plausible response. Only the three built-in High
  // Marshalls receive exact hand profiles; all other opponents use public evidence.
  const response = aiProjectedOpponentAction(hypoMy, hypoOp);
  hypoOp[response.zone] += response.addFate;
  hypoMy[response.zone] = Math.max(0, hypoMy[response.zone]-response.reduceEnemy);

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
  score += aiMoraleProjectedBoardBonus(hypoMy, hypoOp) * .55;

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

  const response = aiProjectedOpponentAction(hypoMy, hypoOp);
  hypoOp[response.zone] += response.addFate;
  hypoMy[response.zone] = Math.max(0, hypoMy[response.zone]-response.reduceEnemy);

  // Count zones after opponent response
  let zonesWon = 0;
  for(let z = 0; z < 3; z++){
    if(hypoMy[z] > hypoOp[z]) zonesWon++;
  }
  // Reward moves that maintain both zone control and a survivable Morale line
  // after the opponent's best public-information response.
  return (zonesWon >= 2 ? 3 : (zonesWon === 1 ? 0 : -2))
    + aiMoraleProjectedBoardBonus(hypoMy, hypoOp) * .28;
}

let _aiPickerPage = 0;
const AI_DIVISIONS = ['Footman','Captain-Officer','Lieutenant at Arms','Sergeant of the Guard','Commander-General','High Marshall'];
const _aiPickerHtmlCache = new Map();
let _aiPickerWarmupPromise = null;
let _aiPickerUseDefaultFateMultiplier = false;

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

function aiPickerUsesDefaultValues(){
  return !!_aiPickerUseDefaultFateMultiplier;
}

function aiPickerDisplayElo(ai){
  if(aiPickerUsesDefaultValues()) return Math.max(100, Math.round(Number(ai?.defaultElo || ai?.elo || 600) || 600));
  return Math.max(100, Math.round(Number(ai?.elo || ai?.defaultElo || 600) || 600));
}

function aiPickerDisplayRank(ai){
  if(aiPickerUsesDefaultValues()) return ai?.defaultRank || ai?.rank || (typeof getRank === 'function' ? getRank(aiPickerDisplayElo(ai)).name : '');
  return ai?.rank || ai?.defaultRank || (typeof getRank === 'function' ? getRank(aiPickerDisplayElo(ai)).name : '');
}

function buildAIDifficultyPickerHtml(page) {
  const targetPage = Math.max(0, Math.min(Number(page) || 0, AI_DIVISIONS.length-1));
  const cacheKey = targetPage + ':' + (aiPickerUsesDefaultValues() ? 'default' : 'live');
  if(_aiPickerHtmlCache.has(cacheKey)) return _aiPickerHtmlCache.get(cacheKey);
  const rank = AI_DIVISIONS[targetPage];
  const opponents = AI_OPPONENTS.filter(a=>aiPickerDisplayRank(a)===rank);
  let html = `
    <div class="ai-picker-header">
      <div class="ai-picker-title-row">
        <div class="ai-picker-title">Choose Opponent</div>
        <button class="btn sm ai-picker-back" onclick="closeAllOverlays()">Back</button>
      </div>
    </div>`;
  if(opponents.length){
    const rankData = getAIDivisionRankData(rank);
    html += `
      <div class="ai-division-hero" style="--ai-rank-color:${rankData.color};--ai-rank-bg:${rankData.bg};">
        <button class="btn sm ai-division-nav ai-division-prev" onclick="showAIDifficultyPicker(${targetPage-1})" ${targetPage<=0?'disabled':''}>Prev</button>
        <div class="ai-division-rank-card">
          <div class="ai-division-rank-badge">
            <span style="line-height:0;">${renderRankBadge(rankData.minElo || opponents[0].elo,'lg')}</span>
          </div>
          <div class="ai-division-meta">${getAIDivisionEloRange(rank)} ELO · ${opponents.length} opponent${opponents.length!==1?'s':''}</div>
        </div>
        <button class="btn sm ai-division-nav ai-division-next" onclick="showAIDifficultyPicker(${targetPage+1})" ${targetPage>=AI_DIVISIONS.length-1?'disabled':''}>Next</button>
      </div>
      <p class="ai-picker-subcopy">Page through the rank banners and pick the AI you want to face.</p>
      <div style="display:flex;flex-direction:column;gap:.55rem;max-height:68vh;overflow-y:auto;padding-right:.3rem;">`;
    opponents.forEach(opp=>{
      const displayElo = aiPickerDisplayElo(opp);
      const aiIndex = AI_OPPONENTS.indexOf(opp);
      const avatar = opp.img
        ? '<div class="ai-avatar ai-avatar-lg"><img src="'+opp.img+'" alt="" loading="eager" decoding="async" draggable="false" onerror="this.style.display=&quot;none&quot;"></div>'
        : '<div class="ai-avatar ai-avatar-lg"><span style="font-size:1.25rem;opacity:.72;font-family:Cinzel,serif;">AI</span></div>';
      html += '<div class="ai-diff-option" data-ai-index="'+aiIndex+'" style="cursor:pointer;padding:.85rem 1rem;border:1.5px solid var(--border);border-radius:12px;background:rgba(0,0,0,.35);transition:all .18s;display:flex;align-items:center;gap:1rem;">'
        + avatar
        + '<div style="flex:1;min-width:0;"><div style="display:flex;align-items:center;gap:.45rem;flex-wrap:wrap;"><span style="font-family:Cinzel,serif;font-size:1.02rem;color:var(--gold);font-weight:800;letter-spacing:.03em;">'+escapeHtml(opp.name)+'</span><span style="font-family:Cinzel,serif;font-size:.66rem;color:'+rankData.color+';background:'+rankData.bg+';padding:.14rem .45rem;border-radius:999px;border:1px solid '+rankData.color+'40;">'+displayElo+' ELO</span></div><div style="font-size:.79rem;color:var(--text);font-style:italic;margin-top:.22rem;line-height:1.42;opacity:.92;">'+escapeHtml(opp.desc)+'</div></div>'
        + '<button class="btn sm pri ai-pick-btn" type="button" data-ai-index="'+aiIndex+'" style="flex-shrink:0;">Play</button></div>';
    });
    html += '</div>';
  } else {
    html += '<div style="text-align:center;color:var(--dim);padding:2rem 0;">No AI opponents found for this division.</div>';
  }
  _aiPickerHtmlCache.set(cacheKey, html);
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

function showAIDifficultyPicker(page=_aiPickerPage, options={}) {
  if(!G.aiDifficulty) G.aiDifficulty = 'medium';
  if(options && Object.prototype.hasOwnProperty.call(options, 'defaultFateMultiplier')) {
    _aiPickerUseDefaultFateMultiplier = !!options.defaultFateMultiplier;
  } else if(typeof CURRENT_MODE !== 'undefined' && CURRENT_MODE === 'free') {
    _aiPickerUseDefaultFateMultiplier = true;
  } else {
    _aiPickerUseDefaultFateMultiplier = false;
  }
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
  selectAIOpponent(opp, {defaultFateMultiplier:_aiPickerUseDefaultFateMultiplier});
}

function pickAIOpponent(aiName) {
  const opp = AI_OPPONENTS.find(a=>a.name===aiName);
  if(!opp) return;
  selectAIOpponent(opp, {defaultFateMultiplier:_aiPickerUseDefaultFateMultiplier});
}

function selectAIOpponent(opp, options={}) {
  if(!opp) return;
  const skipFollowup = !!options.skipFollowup;
  const currentOpp = typeof resolveCurrentAIOpponentState === 'function' ? resolveCurrentAIOpponentState(opp) : opp;
  const difficultyElo = options.defaultFateMultiplier
    ? (Number(opp.defaultElo || currentOpp.defaultElo || opp.elo || currentOpp.elo || 600) || 600)
    : (Number(currentOpp.elo || opp.elo || 600) || 600);
  G.aiDifficulty = difficultyElo>=1400?'extreme':difficultyElo>=1200?'hard':difficultyElo>=800?'medium':'easy';

  // Explicit named decks take precedence and are resolved fresh each match, so
  // opponent profiles immediately pick up edits to their current built-in deck.
  let resolvedOpp = currentOpp;
  const namedDeck = currentOpp.deckRef && typeof resolveAIDeckRef === 'function'
    ? resolveAIDeckRef(currentOpp.deckRef)
    : null;
  if(Array.isArray(namedDeck) && namedDeck.length >= 40) {
    const knownDecks = [
      ...(typeof STARTER_DECKS !== 'undefined' && Array.isArray(STARTER_DECKS) ? STARTER_DECKS : []),
      ...(typeof AI_ONLY_RANDOM_DECKS !== 'undefined' && Array.isArray(AI_ONLY_RANDOM_DECKS) ? AI_ONLY_RANDOM_DECKS.filter(deck => typeof isAIDeckEnabled !== 'function' || isAIDeckEnabled(deck)) : [])
    ];
    const namedDefinition = knownDecks.find(deck => deck && String(deck.id || '') === String(currentOpp.deckRef));
    resolvedOpp = {
      ...currentOpp,
      deck:[...namedDeck],
      _deckStrategy:namedDefinition?.baseStrategy || namedDefinition?.id || currentOpp.deckRef
    };
  } else if(currentOpp.deckPool === 'starter') {
    const pool = typeof getAIDeckPoolForOpponent === 'function'
      ? getAIDeckPoolForOpponent(currentOpp)
      : (typeof STARTER_DECKS !== 'undefined' ? STARTER_DECKS : []);
    if(pool.length > 0){
      const picked = pool[Math.floor(Math.random() * pool.length)];
      resolvedOpp = {...currentOpp, deck: [...picked.ids], _deckStrategy: picked.baseStrategy || picked.id};
    }
  }
  if(!resolvedOpp._deckStrategy && Array.isArray(resolvedOpp.deck) && resolvedOpp.deck.length >= 40) {
    const signature = ids => ids.slice(0, 40).map(String).sort().join('|');
    const targetSignature = signature(resolvedOpp.deck);
    const knownDecks = [
      ...(typeof STARTER_DECKS !== 'undefined' && Array.isArray(STARTER_DECKS) ? STARTER_DECKS : []),
      ...(typeof AI_ONLY_RANDOM_DECKS !== 'undefined' && Array.isArray(AI_ONLY_RANDOM_DECKS) ? AI_ONLY_RANDOM_DECKS.filter(deck => typeof isAIDeckEnabled !== 'function' || isAIDeckEnabled(deck)) : [])
    ];
    const match = knownDecks.find(deck => deck && Array.isArray(deck.ids) && signature(deck.ids) === targetSignature);
    if(match) resolvedOpp = {...resolvedOpp, _deckStrategy:match.baseStrategy || match.id};
  }
  if(options.defaultFateMultiplier) {
    const fixedElo = Number(opp.defaultElo || currentOpp.defaultElo || opp.elo || currentOpp.elo || 600) || 600;
    const fixedRank = opp.defaultRank || opp.rank || currentOpp.defaultRank || currentOpp.rank || (typeof getRank === 'function' ? getRank(fixedElo).name : '');
    resolvedOpp = {
      ...resolvedOpp,
      elo:fixedElo,
      rank:fixedRank,
      _useDefaultFateMultiplier:true,
      _defaultRank:fixedRank,
      _defaultElo:fixedElo
    };
  }

  const playableDeck = typeof getPlayableAIDeck === 'function' ? getPlayableAIDeck(resolvedOpp, G.aiDifficulty) : (Array.isArray(resolvedOpp.deck) ? resolvedOpp.deck.slice(0,40) : []);
  G._selectedAI = {...resolvedOpp, deck:[...playableDeck]};
  G.p2Deck = [...playableDeck];
  G.players[1].name = resolvedOpp.name || currentOpp.name;
  G._aiOpponentElo = resolvedOpp.elo;
  const diffOverlay = document.getElementById('s-difficulty-overlay');
  if(diffOverlay) diffOverlay.classList.remove('on');
  if(skipFollowup) return;

  // Always show deck picker in challenger mode
  if(CURRENT_MODE === 'challenger'){
    setTimeout(()=>renderChallengerDeckPickModal(0), 180);
    return;
  }

  // AI matches always pass through the deck picker, even if a previous deck is still loaded.
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
    return {
      ...comp,
      ...styleModifiers,
      opponentElo:customElo || G._selectedAI.elo,
      handKnowledge:aiHasPerfectHandKnowledge() ? 'perfect' : 'belief'
    };
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
  if(typeof isStructurallySupporterCard === 'function'
    && isStructurallySupporterCard(card)
    && isSupporterHardCapReached(cp)) {
    if(typeof showSupporterHardCapBanner === 'function') showSupporterHardCapBanner(cp);
    return;
  }
  if(typeof isWojciechPierogiCounter === 'function' && isWojciechPierogiCounter(card)) {
    placeWojciechPierogiCounter(card, choice.z, choice.r, choice.c, cp);
    await aiSleep(AI_VISUAL_PAUSE_PLACE);
    return;
  }
  const isAchillesToken = typeof isAchillesAdaptiveToken === 'function' && isAchillesAdaptiveToken(card);
  const isEffectFree = !!(G._linaFreeIids && G._linaFreeIids.has(card.iid)) || isAchillesToken;
  const cardIsSupporterForRules = typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(card, cp) : card.type === 'Supporter';
  const inst = newInstance(card);
  inst.owner = cp;
  inst.currentFate = getPlacedCardFate(card);
  if(typeof preparePlacementFateReveal === 'function') preparePlacementFateReveal(inst, card, 'set');
  if(typeof applyLandscapePlacementBonuses === 'function') applyLandscapePlacementBonuses(inst, choice.z, choice.r, choice.c);
  consumePendingPlacementFlags(card, inst);
  const commitAiPlace = function(){
    if(!isFaceDownCard(inst)) inst._onlineSetResolutionPending = true;
    G.board[choice.z][choice.r][choice.c] = inst;
    if(typeof window.recordLegacyMoralePressureCardSet === 'function') {
      window.recordLegacyMoralePressureCardSet(inst);
    }
    if(typeof markCardSetTurn === 'function') markCardSetTurn(inst, cp);
    if(typeof applyRiveraBuffToPlacedCard === 'function') applyRiveraBuffToPlacedCard(inst, inst.owner);
    const characterSetCinematic = card.type !== 'Supporter' && typeof requestCharacterSetCinematic === 'function';
    if(characterSetCinematic) requestCharacterSetCinematic(inst, {z:choice.z, r:choice.r, c:choice.c, delayMs:90, source:'ai-set'});
    sourceList.splice(idx,1);
    if(typeof recordSupporterHardCapSet === 'function') recordSupporterHardCapSet(inst, cp);
    if(cardIsSupporterForRules) {
      if(!isEffectFree) G.supportsPlacedThisTurn++;
      if(!Array.isArray(G.supportersSetP)) G.supportersSetP = [0,0];
      G.supportersSetP[cp] = (Number(G.supportersSetP[cp]) || 0) + 1;
      if(!Array.isArray(G.supporterReinforcementSetP)) G.supporterReinforcementSetP = [0,0];
      const setReinforcementValue = Math.max(0, Number(typeof getSupportReinforcementValue === 'function' ? getSupportReinforcementValue(inst) : 1) || 0);
      G.supporterReinforcementSetP[cp] = (Number(G.supporterReinforcementSetP[cp]) || 0) + setReinforcementValue;
      inst._supporterSetCounted = true;
      inst._wasSetAsSupporter = true;
      inst._hasBeenOnBoard = true;
      inst._supporterSetOwner = cp;
      inst._setReinforcementValue = setReinforcementValue;
      if(typeof noteBalladSupporterSet === 'function') noteBalladSupporterSet(cp);
    }
    if(isEffectFree && G._linaFreeIids) G._linaFreeIids.delete(card.iid);
    if(choice.fromDeck && card.id==='28'){
      G._polishUsedThisTurn = true;
      if(!Array.isArray(G.polishArmyUses)) G.polishArmyUses = [0,0];
      G.polishArmyUses[cp] = (G.polishArmyUses[cp] || 0) + 1;
    }
    // Anicka Konvicka (02) Starlit Path: any card placed in her zone by her controller gains 4 Fate.
    G.board[choice.z].forEach(row=>row.forEach(cell=>{
      if(cell && (typeof cardActsAsPassive === 'function' ? cardActsAsPassive(cell, '02') : cell.id==='02') && cell.owner===cp && cell.iid!==inst.iid && !isFaceDownCard(cell)){
        modifyFate(inst,4,'permanent');
      }
    }));
    if(!characterSetCinematic) {
      if(typeof playCardSetAudio === 'function') playCardSetAudio(card);
      else {
        if(typeof playCardSoundDeferred === 'function') playCardSoundDeferred(card.id, 0);
        else setTimeout(function(){ playCardSound(card.id); }, 0);
        const aiSetSfx = cardIsSupporterForRules ? 'supporterSet' : (typeof getCharacterSetSfxType === 'function' ? getCharacterSetSfxType(card) : 'characterSet');
        if(typeof playSfxDeferred === 'function') playSfxDeferred(aiSetSfx, 0);
        else setTimeout(function(){ playSfx(aiSetSfx); }, 0);
      }
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

  const bonusFate = typeof getGreatOakConsolidationBonus === 'function'
    ? getGreatOakConsolidationBonus(choice.tributes)
    : choice.tributes.reduce((total, t)=>total + (t.card && t.card.id==='47' ? 3 : 0), 0);

  const inst = newInstance(choice.card);
  inst.owner = cp;
  inst.currentFate = getPlacedCardFate(choice.card, {bonusFate:0, tributeCount: choice.tributes.length});
  if(typeof applyGreatOakConsolidationBonus === 'function') applyGreatOakConsolidationBonus(inst, bonusFate);
  else inst.currentFate = Math.max(0, Number(inst.currentFate ?? inst.fate) || 0) + bonusFate;
  if(typeof preparePlacementFateReveal === 'function') preparePlacementFateReveal(inst, choice.card, 'consolidation');
  if(typeof applyLandscapePlacementBonuses === 'function') applyLandscapePlacementBonuses(inst, target.z, target.r, target.c);
  if(typeof trackLandscapeConsolidation === 'function') trackLandscapeConsolidation(cp, inst, target.z);
  inst.faceDown = useFaceDown;
  if(useFaceDown) {
    inst._suppressPlacementAnimation = true;
    inst._suppressCinematicSubtitle = true;
  }
  consumePendingPlacementFlags(choice.card, inst);
  let deterranceApplied = false;
  const commitAiConsolidation = function(presentationDelay){
    const motionMs = Math.max(0, Number(presentationDelay) || 0);
    if(!deterranceApplied && typeof applyMarieDeterranceForConsolidation === 'function') {
      deterranceApplied = true;
      applyMarieDeterranceForConsolidation(cp, target.z, inst);
    }
    try {
      choice.tributes.forEach(t=>{
        if(t && t.card) t.card._suppressDiscardVfx = true;
        discardBoardCard(t.card, t.z, t.r, t.c);
      });
    } catch(err) {
      console.error('AI consolidation tribute spend failed after validation', err);
    } finally {
      G.board[target.z][target.r][target.c] = inst;
    }
    if(typeof markCardSetTurn === 'function') markCardSetTurn(inst, cp);
    if(typeof consumeAdministrativeBloatForPlayer === 'function') consumeAdministrativeBloatForPlayer(cp);
    if(typeof noteBalladConsolidation === 'function') noteBalladConsolidation(cp, inst);
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
  const instIsSupporterForRules = typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(inst, inst.owner) : inst.type === 'Supporter';

  if(typeof applyRiveraBuffToPlacedCard === 'function') applyRiveraBuffToPlacedCard(inst, inst.owner);

  if(G.oppSuppressedNextTurn && G.suppressTarget===cp && instIsSupporterForRules) {
    if(typeof triggerMajaMischievousActivities === 'function') triggerMajaMischievousActivities(opp, {mode:'suppressed', sourceCard:inst});
    showBlockedAnimation('Effect SUPPRESSED - Semper Fidelis');
    return;
  }

  if(inst.type === 'Supporter' && inst.id !== '92' && !isEffectImmuneSource(inst)) {
    let lumberjack = null;
    if(G.board && G.board[z]) G.board[z].forEach(function(row){ row.forEach(function(cell){
      if(!lumberjack && cell && cell.owner === cp && cell.iid !== inst.iid && typeof cardActsAsPassive === 'function' && cardActsAsPassive(cell, '92') && !isFaceDownCard(cell) && !isSupporterEffectSuppressed(cell)) lumberjack = cell;
    }); });
    if(lumberjack) {
      if(typeof applyWodnyPotokLumberjackSuppression === 'function') {
        applyWodnyPotokLumberjackSuppression(inst, z, cp);
      } else {
        inst._lumberjackSuppressed = true;
        inst.whenSetActivated = true;
        inst.effectUsedInitial = true;
        if(!inst._lumberjackReinforcementGranted) {
          inst._lumberjackReinforcementGranted = true;
          inst._reinforcementBonus = (Number(inst._reinforcementBonus) || 0) + 1;
        }
      }
      if(typeof triggerMajaMischievousActivities === 'function') triggerMajaMischievousActivities(cp, {mode:'suppressed', sourceCard:inst});
      showBlockedAnimation('Effect SUPPRESSED - Wood for the Hearth');
      return;
    }
  }

  if(instIsSupporterForRules && typeof canActivateLandscapeSupporterEffect === 'function' && !canActivateLandscapeSupporterEffect(cp)) return;

  const hasAutomaticSetActivation = typeof hasAuthoritativeWhenSetEffect === 'function'
    ? hasAuthoritativeWhenSetEffect(inst)
    : (typeof AUTHORITATIVE_WHEN_SET_EFFECT_IDS !== 'undefined' && AUTHORITATIVE_WHEN_SET_EFFECT_IDS.has(String(id || '')));
  const hasPersistentSetRegistration = instIsSupporterForRules
    && typeof isPersistentSupporterEffectOnSet === 'function'
    && isPersistentSupporterEffectOnSet(inst);
  if(!hasAutomaticSetActivation && !hasPersistentSetRegistration) return;
  if(hasAutomaticSetActivation && typeof playEffectActivationCinematic === 'function') {
    await playEffectActivationCinematic(inst, z, r, c, {
      source:'ai-when-set',
      broadcast:false,
      activationId:'when-set:' + String(inst.iid || inst.id) + ':' + String(G.turn || 0)
    });
  }

  if(hasPersistentSetRegistration) {
    if(!G._suppressEffectPrompt) {
      const affectedOwners = typeof getSupporterEffectAffectedOwners === 'function' ? getSupporterEffectAffectedOwners(inst, z, r, c, cp, opp) : [];
      const proceed = await checkReactions('supporter_effect', {card:inst, z, r, c, sourceOwner:cp, affectedOwners});
      if(!proceed) return;
    }
    if(typeof recordSupporterEffectActivation === 'function') recordSupporterEffectActivation(cp, inst);
    return;
  }

  if(instIsSupporterForRules && hasAutomaticSetActivation){
    inst.whenSetActivated = true;
    inst.effectUsedInitial = true;
  }

  if(instIsSupporterForRules && hasAutomaticSetActivation && !G._suppressEffectPrompt){
    const affectedOwners = typeof getSupporterEffectAffectedOwners === 'function'
      ? getSupporterEffectAffectedOwners(inst, z, r, c, cp, opp)
      : [];
    const proceed = await checkReactions('supporter_effect', {card:inst, z, r, c, sourceOwner:cp, affectedOwners});
    if(!proceed) return;
    if(typeof recordSupporterEffectActivation === 'function') recordSupporterEffectActivation(cp, inst);
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
  if(!instIsSupporterForRules && inst.type!=='Initiator' && !G._suppressEffectPrompt && typeof getCharacterEffectAffectedOwners === 'function'){
    const affectedOwners = getCharacterEffectAffectedOwners(inst, z, r, c, cp, opp);
    if(affectedOwners.includes(opp)){
      const proceed = await checkReactions('targeting_effect', {card:inst, z, r, c, sourceOwner:cp, affectedOwners});
      if(!proceed) return;
    }
  }

  if(typeof pressureCardReworkTimingActive === 'function'
    && pressureCardReworkTimingActive()
    && new Set(['20','33','47','64']).has(String(id || ''))
    && typeof window.recordLegacyMoralePressureCardSet === 'function') {
    window.recordLegacyMoralePressureCardSet(inst, {resolveWhenSetEffects:true});
  }

  switch(id) {
    case 'bh10': {
      if(typeof resolveChauffeurRedraw === 'function') await resolveChauffeurRedraw(inst, cp);
      inst.effectUsedInitial = true;
      inst._effectTurnLocked = true;
      break;
    }
    case 'bh12': {
      if(typeof chooseFlowerKingTarget === 'function') await chooseFlowerKingTarget(inst, z, r, c, cp);
      inst.effectUsedInitial = true;
      inst._effectTurnLocked = true;
      break;
    }
    case 'bh13': {
      if(typeof resolveSmartInvestments === 'function') await resolveSmartInvestments(inst, cp);
      inst.effectUsedInitial = true;
      inst._effectTurnLocked = true;
      break;
    }
    case 'bh19': {
      if(typeof activateHighTForTurn === 'function') activateHighTForTurn(inst, cp);
      inst.effectUsedInitial = true;
      inst._effectTurnLocked = true;
      break;
    }
    case 'bh04': {
      const declaredTypes = typeof BRAVE_HORIZONS_DECLARABLE_CARD_TYPES !== 'undefined'
        ? Array.from(BRAVE_HORIZONS_DECLARABLE_CARD_TYPES)
        : ['Supporter','Initiator','Coordinator','Dauntless','Improvisor'];
      let bestType = declaredTypes[0];
      let bestValue = -1;
      declaredTypes.forEach(function(type){
        const targets = [];
        (G.board[z] || []).forEach(function(row){ (row || []).forEach(function(target){
          if(!target || target.owner !== opp || String(target.type || '') !== type || isFaceDownCard(target)) return;
          if(typeof isTargetImmuneToEffectOwner === 'function' && isTargetImmuneToEffectOwner(target, cp)) return;
          targets.push(target);
        }); });
        const lossEach = targets.length ? Math.round(20 / targets.length) : 0;
        const value = targets.reduce(function(sum, target){ return sum + Math.min(lossEach, Math.max(0, Number(target.currentFate ?? target.fate) || 0)); }, 0);
        if(value > bestValue) { bestValue = value; bestType = type; }
      });
      if(typeof applyDestructionOfParadise === 'function') applyDestructionOfParadise(inst, z, cp, bestType);
      inst.effectUsedInitial = true;
      inst._effectTurnLocked = true;
      break;
    }
    case 'bh05': {
      const strat = G._selectedAI?._deckStrategy || '';
      const mimicPriority = strat === 'ai_snowball_fight_club'
        ? ['93']
        : strat === 'ai_taylors_perfect_mimic'
        ? ['14','bh04','100','84']
        : strat === 'ai_snowbound_wintertide'
          ? ['100','84','87','99']
          : [];
      const candidates = [].concat(G.players[cp].hand || [], G.players[cp].deck || []).filter(function(candidate){
        return candidate && String(candidate.id || '') !== 'bh05';
      }).sort(function(a,b){
        const ap = aiPriorityIndex(a, mimicPriority);
        const bp = aiPriorityIndex(b, mimicPriority);
        if(ap !== bp) return ap - bp;
        return ((Number(b.cost)||0) * 4 + (Number(b.fate)||0)) - ((Number(a.cost)||0) * 4 + (Number(a.fate)||0));
      });
      if(candidates[0] && typeof resolveTaylorCopiedEffect === 'function') await resolveTaylorCopiedEffect(inst, z, r, c, candidates[0]);
      inst.effectUsedInitial = true;
      inst._effectTurnLocked = true;
      break;
    }
    case 'bh06': {
      if(typeof activateAchillesAdaptiveTactics === 'function') activateAchillesAdaptiveTactics(inst, cp);
      inst.effectUsedInitial = true;
      inst._effectTurnLocked = true;
      break;
    }
    case '81': { // Wojciech: counters equal opponent placements last turn
      if(typeof ensureWojciechPlacementCounts === 'function') ensureWojciechPlacementCounts();
      const count = Math.max(0, Number(G._wojciechLastTurnPlacementCounts && G._wojciechLastTurnPlacementCounts[opp]) || 0);
      const added = typeof grantWojciechPierogiCounters === 'function' ? grantWojciechPierogiCounters(cp, count, inst) : 0;
      inst.effectUsedInitial = true;
      inst._effectTurnLocked = true;
      log('p2','AI: Wojciech created ' + added + ' Pierogi Counter' + (added === 1 ? '' : 's'));
      break;
    }
    case '82': { // Felicyta Janowicz (Youth): choose a legal replacement landscape
      const currentId = String(G.landscapeId || '');
      const leavingBlock = typeof getFelicitaLandscapeChangeBlockReason === 'function' ? getFelicitaLandscapeChangeBlockReason('') : '';
      if(!leavingBlock) {
        const strat = G._selectedAI?._deckStrategy || '';
        const preferredByStrategy = {
          ai_wintertide_family_reunion:['igb15','igb18','igb2','igb8','igb1'],
          ai_snowbound_wintertide:['igb15','igb18','igb2','igb8','igb1'],
          ai_pierogi_siege:['igb15','igb14','igb8','igb2','igb1']
        };
        const preferredIds = preferredByStrategy[strat] || ['igb15','igb8','igb2','igb10','igb1'];
        const targetId = preferredIds.find(function(candidate){
          if(candidate === currentId || !(typeof LANDSCAPES !== 'undefined' && LANDSCAPES[candidate])) return false;
          return !(typeof getFelicitaLandscapeChangeBlockReason === 'function' && getFelicitaLandscapeChangeBlockReason(candidate));
        });
        if(targetId && typeof transitionGameLandscape === 'function') {
          transitionGameLandscape('board' + targetId.replace('igb',''), {player:cp, sourceCard:inst});
          log('p2','AI: Felicyta changed the landscape to ' + (LANDSCAPES[targetId].name || targetId));
        }
      }
      inst.effectUsedInitial = true;
      inst._effectTurnLocked = true;
      break;
    }
    case '83': { // Sebastyen: all friendly Characters in the zone gain 2 Fate permanently
      let boosted = 0;
      G.board[z].forEach(function(row){ row.forEach(function(cell){
        if(cell && cell.owner === cp && !isFaceDownCard(cell) && (typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(cell, cp) : cell.type !== 'Supporter')) {
          if(typeof applyPairedOverlayFateGain === 'function'){
            applyPairedOverlayFateGain(cell, 2, cp, {
              kind:'sebastyen_visegrad',
              label:'Visegrad',
              sourceIid:String(inst.iid || inst.id || '83'),
              soundKey:['sebastyen-visegrad-ai', String(inst.iid || inst.id), String(cell.iid || cell.id), Number(G.turn), boosted].join(':')
            });
          }else modifyFate(cell, 2, 'permanent');
          boosted++;
        }
      }); });
      inst.effectUsedInitial = true;
      inst._effectTurnLocked = true;
      if(boosted) log('p2','AI: Sebastyen gave ' + boosted + ' Character card(s) +2 Fate');
      break;
    }
    case '87': { // Kvetka Ukulele: start the immediate consolidation ballad
      const pitchStep = typeof nextKvetkaBalladPitchStep === 'function' ? nextKvetkaBalladPitchStep(cp) : 0;
      if(typeof ensureBalladState === 'function') ensureBalladState()[cp].push({active:true, ended:false, sourceIid:inst.iid, activatedTurn:G.turn, pitchStep});
      if(typeof flashCardEffect === 'function') flashCardEffect(inst, 'kvetka_ballad', {
        label:'A Noble Effort at a Ballad',
        soundKey:'kvetka-ballad-ai:' + String(cp) + ':' + String(G.turn || 0) + ':' + String(inst.iid || inst.id),
        pitchStep,
        waitForConsolidationCinematic:true
      });
      inst.effectUsedInitial = true;
      inst._effectTurnLocked = true;
      break;
    }
    case '90': { // Wojciech Fisherman: choose the affiliation with the largest deck pool and give those cards +3 Fate
      if(typeof triggerJoieDrawEffectPassive === 'function') triggerJoieDrawEffectPassive(cp, {sourceCard:inst});
      const pools = {};
      G.players[cp].deck.forEach(function(deckCard){ if(deckCard && deckCard.aff) (pools[deckCard.aff] || (pools[deckCard.aff] = [])).push(deckCard); });
      const strat = G._selectedAI?._deckStrategy || '';
      const affiliation = strat === 'ai_wintertide_family_reunion' && pools.expanded_worlds
        ? 'expanded_worlds'
        : Object.keys(pools).sort(function(a,b){ return pools[b].length - pools[a].length; })[0];
      const candidates = affiliation ? pools[affiliation].slice() : [];
      const chosen = [];
      while(candidates.length && chosen.length < 2) {
        const onlineIndex = typeof deterministicOnlineRandomIndex === 'function' ? deterministicOnlineRandomIndex(candidates.length, 'aiWojciechFisherman:' + affiliation + ':' + chosen.length, cp) : -1;
        const index = onlineIndex >= 0 ? onlineIndex : Math.floor(Math.random() * candidates.length);
        chosen.push(candidates.splice(index, 1)[0]);
      }
      chosen.forEach(function(found){
        G.players[cp].deck = G.players[cp].deck.filter(function(deckCard){ return deckCard.iid !== found.iid; });
        const beforeFate = Math.max(0, Number(found.currentFate ?? found.fate) || 0);
        found.currentFate = beforeFate + 3;
        if(typeof applyChineseMacArthurFateRider === 'function') applyChineseMacArthurFateRider(found, beforeFate, found.currentFate);
        if(typeof recordHandCardEffectModifier === 'function' && !(typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(found))) {
          recordHandCardEffectModifier(found, {
            key:'wojciech-fisherman:' + (inst.iid || inst.id || 'source'),
            name:'Catch of the Day',
            text:'Catch of the Day: this card gained 3 Fate when Wojciech caught it.',
            fateDelta:3
          });
        }
        if(typeof addCardToHand === 'function') addCardToHand(cp, found, {announce:false, arrivalKind:'search'});
        else G.players[cp].hand.push(found);
      });
      inst.effectUsedInitial = true;
      inst._effectTurnLocked = true;
      break;
    }
    case '91': {
      if(!Array.isArray(G._snowyVillageUses)) G._snowyVillageUses = [0,0];
      if(!Array.isArray(G._landscapeChangeLocks)) G._landscapeChangeLocks = [0,0];
      if((Number(G._snowyVillageUses[cp]) || 0) < 2) {
        G._snowyVillageUses[cp] = (Number(G._snowyVillageUses[cp]) || 0) + 1;
        G._landscapeChangeLocks[opp] = Math.max(Number(G._landscapeChangeLocks[opp]) || 0, 6);
      }
      break;
    }
    case '94': {
      const strat = G._selectedAI?._deckStrategy || '';
      const conversionActive = typeof isBlameGameActive === 'function' && isBlameGameActive(cp);
      const winterPriority = [];
      if(strat === 'ai_wintertide_family_reunion') {
        if(!conversionActive && !G.players[cp].hand.some(c=>c.id === '99') && !aiOwnBoardCardsById('99').length) winterPriority.push('99');
        if(!G.players[cp].hand.some(c=>c.id === '89') && !aiOwnBoardCardsById('89').length) winterPriority.push('89');
        winterPriority.push('90','99','89');
      }
      const triangles = G.players[cp].deck.filter(function(deckCard){ return deckCard.rarity === 'triangle'; }).sort(function(a,b){
        const ap = aiPriorityIndex(a, winterPriority);
        const bp = aiPriorityIndex(b, winterPriority);
        if(ap !== bp) return ap - bp;
        return (Number(b.fate)||0) - (Number(a.fate)||0);
      });
      const found = triangles[0];
      if(found) {
        G.players[cp].deck = G.players[cp].deck.filter(function(deckCard){ return deckCard.iid !== found.iid; });
        found._fateHandArrivalKind = 'search';
        if(typeof ensureMailDeliveryState === 'function') ensureMailDeliveryState().push({player:cp, card:found, turnsLeft:4, sourceIid:inst.iid});
      }
      break;
    }
    case '96': {
      if(typeof returnRandomDiscardCardsToDeck === 'function') returnRandomDiscardCardsToDeck(cp, 4, 'aiWodnyPotokSnowShoveler:' + (inst.iid || inst.id), function(card){ return card && card.rarity !== 'star'; });
      break;
    }
    case '97': {
      if(typeof activateAdministrativeBloat === 'function') activateAdministrativeBloat(cp, inst);
      break;
    }
    case '99': {
      if(typeof activateBlameGameEffect === 'function') activateBlameGameEffect(cp, inst);
      inst.effectUsedInitial = true;
      inst._effectTurnLocked = true;
      break;
    }
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
      own.slice(0,2).forEach(card=>{ card.immuneFlag = true; card._immuneByMakenna = true; });
      if(own.length) log('p2','AI: Makenna made '+Math.min(2, own.length)+' card(s) immune');
      break;
    }
    case '14': { // Alondra Hopkins: discard adjacent/diagonal opposing supporters, gain Fate
      const targets = getAdjacentAndDiagonalCards(z,r,c).filter(a=>a.card.owner===opp && (typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(a.card, opp) : a.card.type==='Supporter') && a.card.id!=='76' && !a.card.immuneFlag);
      let gained = 0;
      targets.forEach(t=>{
        G.board[t.z][t.r][t.c] = null;
        fatePushDiscard(opp, t.card);
        gained++;
      });
      if(gained) {
        const before = Math.max(0, Number(inst.currentFate ?? inst.fate) || 0);
        inst.currentFate = before + gained;
        if(typeof applyChineseMacArthurFateRider === 'function') applyChineseMacArthurFateRider(inst, before, inst.currentFate);
        log('p2','AI: Alondra discarded '+gained+' adjacent supporter(s)');
      }
      break;
    }
    case '05': { // Liberators of Rwanda: +3 Fate to any card; AI prefers its own
      const own = [];
      G.board[z].forEach((row,rr)=>row.forEach((cell,cc)=>{
        if(cell && cell.owner===cp && !(typeof isTargetImmuneToEffectOwner === 'function' && isTargetImmuneToEffectOwner(cell, cp))) own.push(cell);
      }));
      if(own.length){
        // Deck-aware: Maelstrom prioritizes Alondra (14)
        const strat = G._selectedAI?._deckStrategy || '';
        let target = null;
        if(strat === 'starter_maelstrom') target = own.find(c => c.id === '14');
        if(strat === 'ai_hand_leech') target = own.find(c => c.id === '14');
        if(strat === 'ai_movement') target = own.find(c => c.id === '73');
        if(strat === 'ai_snowball_fight_club') {
          target = own.find(c => c.id === '41')
            || own.find(c => typeof cardActsAsPassive === 'function' && cardActsAsPassive(c, '93'));
        }
        if(!target) target = aiPickByPriority(own, aiDeckSearchPriority(strat, 'character'));
        if(!target) { own.sort((a,b)=>b.currentFate - a.currentFate); target = own[0]; }
        modifyFate(target, 3, 'permanent');
        if(typeof flashCardEffect === 'function') {
          flashCardEffect(target, 'british_union_jack', {
            label:'Liberators of Rwanda',
            soundKey:'british-regiment-ai:' + String(inst && (inst.iid || inst.id) || 'card') + ':' + String(target && (target.iid || target.id) || 'target') + ':' + String(G.turn || 0)
          });
        }
        log('p2', `AI: Liberators of Rwanda +3 Fate to ${target.name}`);
      } break;
    }
    case '25': { // Zimbabwean Honor Guard: continuous +1 Fate affiliation-adjacency aura
      if(window.FATE_PRESSURE_CARD_REWORKS_ENABLED === true){
        break;
      }
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
      if(typeof preparePlacementFateReveal === 'function') preparePlacementFateReveal(extra, copy, 'set');
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
    case '32': await drawCard(cp,1,{afterSetOrCinematic:true, activatedDrawEffect:true, effectSource:inst}); break;
    case '42': { // draw 2, discard 2
      await drawCard(cp,2,{afterSetOrCinematic:true, activatedDrawEffect:true, effectSource:inst, deferJoiePassive:true});
      const h = G.players[cp].hand;
      // Discard worst 2 cards (lowest fate supporters)
      const strat = G._selectedAI?._deckStrategy || '';
      const sorted = [...h].sort((a,b)=>{
        if(strat === 'ai_alis_handcuffs' || strat === 'ai_hand_quarantine') {
          const aGuerilla = a && a.id === '70' ? 1 : 0;
          const bGuerilla = b && b.id === '70' ? 1 : 0;
          if(aGuerilla !== bGuerilla) return bGuerilla - aGuerilla;
        }
        if(strat === 'ai_high_t_draw_mill') {
          const engineIds = ['bh02','bh19','bh15','40','bh13','03'];
          const aEngine = engineIds.includes(String(a?.id || '')) ? 1 : 0;
          const bEngine = engineIds.includes(String(b?.id || '')) ? 1 : 0;
          if(aEngine !== bEngine) return aEngine - bEngine;
        }
        if(strat === 'ai_hungarian_war_dance') {
          const engineIds = ['34','66','77','19','29'];
          const aEngine = engineIds.includes(String(a?.id || '')) ? 1 : 0;
          const bEngine = engineIds.includes(String(b?.id || '')) ? 1 : 0;
          if(aEngine !== bEngine) return aEngine - bEngine;
        }
        if(strat === 'starter_freeworld') {
          const engineIds = ['34','77','01','35','29','06','13'];
          const aEngine = engineIds.includes(String(a?.id || '')) ? 1 : 0;
          const bEngine = engineIds.includes(String(b?.id || '')) ? 1 : 0;
          if(aEngine !== bEngine) return aEngine - bEngine;
        }
        if(strat === 'starter_assault') {
          const assaultEngines = ['11','43','40','22','27','06'];
          const aEngine = assaultEngines.includes(String(a?.id || '')) ? 1 : 0;
          const bEngine = assaultEngines.includes(String(b?.id || '')) ? 1 : 0;
          if(aEngine !== bEngine) return aEngine - bEngine;
        }
        return (a.fate||0)-(b.fate||0);
      });
      for(let i=0;i<2&&sorted[i];i++){
        const c = sorted[i];
        G.players[cp].hand = G.players[cp].hand.filter(x=>x.iid!==c.iid);
        fatePushDiscard(cp, c);
      }
      if(typeof triggerJoieDrawEffectPassive === 'function') {
        triggerJoieDrawEffectPassive(cp, {sourceCard:inst, sourceId:String(inst && inst.id || '42')});
      }
      break;
    }
    case '31': { // Hemorrhaging Wound: -3 Fate to any card; prefer an opponent
      const opponents=[];
      const friendly=[];
      G.board[z].forEach(row=>row.forEach(cell=>{
        if(!cell || (typeof isTargetImmuneToEffectOwner === 'function' && isTargetImmuneToEffectOwner(cell, cp))) return;
        (cell.owner===opp ? opponents : friendly).push(cell);
      }));
      opponents.sort((a,b)=>aiOpponentCardDecisionFate(b,z)-aiOpponentCardDecisionFate(a,z));
      friendly.sort((a,b)=>(Number(a.currentFate ?? a.fate)||0)-(Number(b.currentFate ?? b.fate)||0));
      const target = opponents[0] || friendly[0];
      if(target){
        const before = target.currentFate || target.fate || 0;
        const changed = typeof reduceStoredCardFateBy === 'function'
          ? reduceStoredCardFateBy(target, 3, cp, {permanent:true})
          : setCardFateValue(target, before - 3, cp);
        if(changed || before <= 0){
          log('p2', `AI: Hemorrhaging Wound -3 Fate to ${target.name}`);
          if(typeof flashCardEffect === 'function') flashCardEffect(target, 'oathbound_crescent', {
            label:'oathbound blade',
            soundKey:'oathbound-ai:' + String(inst && (inst.iid || inst.id) || 'card') + ':' + String(target && (target.iid || target.id) || 'target') + ':' + String(G.turn || 0)
          });
        }
      } break;
    }
    case '16': { // MINAE: discard opp supporter in zone
      const opps=[];
      G.board[z].forEach((row,rr)=>row.forEach((cell,cc)=>{
        if(cell&&cell.owner===opp&&(typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(cell, opp) : cell.type==='Supporter')&&!(typeof isTargetImmuneToEffectOwner === 'function' && isTargetImmuneToEffectOwner(cell, cp))) opps.push({card:cell,r:rr,c:cc});
      }));
      if(opps.length){
        opps.sort((a,b)=>aiOpponentCardDecisionFate(b.card,z)-aiOpponentCardDecisionFate(a.card,z));
        const t = opps[0];
        G.board[z][t.r][t.c]=null;
        fatePushDiscard(opp, t.card);
        log('p2', `AI: MINAE discarded ${t.card.name}`);
      } break;
    }
    case '18':
      if(typeof activateUsMarinesSuppressionEffect === 'function') activateUsMarinesSuppressionEffect(cp, opp, {silent:true});
      else { G.oppSuppressedNextTurn=true; G.suppressTarget=opp; }
      break;
    case '33': // West Caribbea Infantry: next character added to hand gets boosted
      if(window.FATE_PRESSURE_CARD_REWORKS_ENABLED === true) break;
      G._westCaribNext = { owner: cp };
      if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
      break;
    case '34': // Rozsi Szocs: passive movement trigger is handled by triggerRozsiPassive.
      if(window.FATE_PRESSURE_CARD_REWORKS_ENABLED === true){
        const counts={};(G.board[z]||[]).forEach(row=>row.forEach(card=>{if(card&&card.owner===cp&&!isFaceDownCard(card)){const aff=String(card.aff||card.affiliation||'');counts[aff]=(counts[aff]||0)+1;}}));
        const strat = G._selectedAI?._deckStrategy || '';
        inst._moraleAffiliation=(strat === 'starter_freeworld' || strat === 'ai_hungarian_war_dance')
          ? 'third_great_war'
          : Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0]||'reality';
      }
      break;
    case '35': { // Alexander: initialize from the same live effective-Fate total used by all modes
      if(window.FATE_PRESSURE_CARD_REWORKS_ENABLED === true) break;
      const total = typeof getAlexanderSupporterFateTotal === 'function'
        ? getAlexanderSupporterFateTotal(inst, z)
        : 0;
      inst.currentFate = total;
      log('p2','AI: Alexander entered with '+total+' Fate from Supporters');
      break;
    }
    case '45': { // Chingachlook: placement restriction is enforced before setting.
      const pressureReworks=typeof pressureCardReworkTimingActive==='function'
        ? pressureCardReworkTimingActive()
        : window.FATE_PRESSURE_CARD_REWORKS_ENABLED===true;
      if(pressureReworks){
        const system=G._moralePressure;
        if(system){
          const before=Math.max(0,Number(system.morale[cp]||0));
          system.morale[cp]=Math.max(0,before-50);
          if(typeof window.presentLegacyMoraleDelta==='function')window.presentLegacyMoraleDelta({playerIndex:cp,before:before,after:system.morale[cp],sourceIid:String(inst.iid||''),semanticSourceCardId:'45',reason:'THE_LAST_MOHICAN_COST'});
          else if(typeof window.refreshLegacyMoralePressure==='function')window.refreshLegacyMoralePressure({announce:true});
        }
        const targets=[];
        forEachBoardCard(function(target,tz,tr,tc){
          if(!target) return;
          if(typeof isWojciechPierogiCounter==='function'&&isWojciechPierogiCounter(target)) return;
          if(typeof isTargetImmuneToEffectOwner==='function'&&isTargetImmuneToEffectOwner(target,cp)) return;
          targets.push({card:target,z:tz,r:tr,c:tc});
        });
        targets.sort(function(a,b){
          const aOpponent=a.card.owner===opp?1:0,bOpponent=b.card.owner===opp?1:0;
          if(aOpponent!==bOpponent) return bOpponent-aOpponent;
          const aValue=aiOpponentCardDecisionFate(a.card,a.z),bValue=aiOpponentCardDecisionFate(b.card,b.z);
          return aOpponent?bValue-aValue:aValue-bValue;
        });
        const target=targets[0];
        if(target&&typeof discardBoardCard==='function')discardBoardCard(target.card,target.z,target.r,target.c);
      }
      break;
    }
    case '46': // Phil: begins gaining Fate on future draw phases
      inst._philSetTurn = G.turn;
      break;
    case '48': { // Cosmic GF: add Expanded Worlds from deck, then non-Star Expanded Worlds from discard
      const strat = G._selectedAI?._deckStrategy || '';
      const priority = aiDeckSearchPriority(strat, 'character');
      const searchedCardsAdded = [];
      ['deck','discard'].forEach(zoneName=>{
        const list = G.players[cp][zoneName];
        const expanded = list.filter(c=>c && c.aff==='expanded_worlds' && (zoneName !== 'discard' || String(c.rarity || '').toLowerCase() !== 'star'));
        const pick = aiPickByPriority(expanded, priority) || expanded[0];
        if(!pick) return;
        if(typeof addCardToHand==='function') addCardToHand(cp, pick, { announce:false, arrivalKind:'search' });
        else G.players[cp].hand.push(pick);
        G.players[cp][zoneName] = list.filter(c=>c.iid!==pick.iid);
        searchedCardsAdded.push(pick);
      });
      shuffle(G.players[cp].deck);
      if(typeof renderBoardActionForPlayer === 'function') renderBoardActionForPlayer(cp, {hand:true, piles:true, blocks:false, topbar:false, effects:false, hover:false});
      else renderGame({board:true, scores:true, oppHand:true, piles:true, blocks:true, topbar:true});
      if(searchedCardsAdded.length && typeof resolveBoleslawAfterSearchSelection === 'function') {
        await resolveBoleslawAfterSearchSelection(cp, searchedCardsAdded, {sourceCardId:'48'});
      }
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
    case '51': { // Rivera: declare an affiliation for the +4 Fate buff
      const pool = [...G.players[cp].hand, ...G.players[cp].deck].filter(c => {
        if(!c || !c.aff || c.id === '51') return false;
        return typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(Object.assign({owner:cp}, c), cp) : c.type !== 'Supporter';
      });
      const counts = {reality:0, third_great_war:0, expanded_worlds:0, eventide:0};
      pool.forEach(c => { if(counts[c.aff] !== undefined) counts[c.aff] += 1; });
      const strat = G._selectedAI?._deckStrategy || '';
      const aff = strat === 'ai_selva_tidal_strike'
        ? 'eventide'
        : (Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0] || inst.aff || 'eventide');
      if(typeof startRiveraBuff === 'function') startRiveraBuff(inst, aff, inst.owner != null ? inst.owner : cp);
      inst.effectUsedInitial = true;
      log('p2', 'AI: Rivera declared ' + ((typeof AFF_LABEL !== 'undefined' && AFF_LABEL[aff]) || aff) + ' for matching characters for 3 turns');
      if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
      break;
    }
    case '54': { // Wolf Creek: reposition the formation without opening a human picker
      const candidates = [];
      (G.board[z] || []).forEach((row, rr)=>row && row.forEach((fieldCard, cc)=>{
        if(!fieldCard || fieldCard.owner !== cp || fieldCard.iid === inst.iid || fieldCard.cantBeMoved) return;
        candidates.push({card:fieldCard, z, r:rr, c:cc});
      }));
      if(!candidates.length) break;
      const strat = G._selectedAI?._deckStrategy || '';
      candidates.sort((a,b)=>{
        if(strat === 'ai_overclocked_dauntless') {
          const value = entry => entry.card.id === 'bh07' ? 3 : entry.card.type === 'Dauntless' ? 2 : 0;
          const delta = value(b) - value(a);
          if(delta) return delta;
        }
        return (Number(b.card.currentFate ?? b.card.fate) || 0) - (Number(a.card.currentFate ?? a.card.fate) || 0);
      });
      const source = candidates[0];
      const options = [];
      G.board.forEach((zone, zz)=>zone && zone.forEach((row, rr)=>row && row.forEach((cell, cc)=>{
        if(cell) return;
        const legal = typeof isWolfCreekSideOpenSquare === 'function'
          ? isWolfCreekSideOpenSquare(zz, rr, cc, cp)
          : !isBlocked(zz, rr, cc) && (rr === 1 || rr === getSafeRowForPlayer(cp));
        if(!legal) return;
        let score = (getZoneScore(zz, opp) || 0) - (getZoneScore(zz, cp) || 0);
        const adjacent = typeof getAdjacentCards === 'function' ? getAdjacentCards(zz, rr, cc) : [];
        if(strat === 'ai_overclocked_dauntless') {
          if(source.card.id === 'bh07') score += adjacent.filter(entry=>entry.card && entry.card.owner === cp && entry.card.type === 'Dauntless' && entry.card.iid !== source.card.iid).length * 260;
          if(source.card.type === 'Dauntless') score += adjacent.some(entry=>entry.card && entry.card.owner === cp && entry.card.id === 'bh07') ? 300 : 0;
        }
        options.push({z:zz, r:rr, c:cc, score});
      })));
      if(!options.length) break;
      options.sort((a,b)=>b.score-a.score);
      const destination = options[0];
      G.board[source.z][source.r][source.c] = null;
      G.board[destination.z][destination.r][destination.c] = source.card;
      if(typeof markMovementEffectFlash === 'function') markMovementEffectFlash(source.card, 'movement:wolf-creek-ai:' + String(source.card.iid || source.card.id) + ':' + String(G.turn || 0));
      if(typeof triggerRozsiPassive === 'function') triggerRozsiPassive(source.card, destination.z);
      log('p2','AI: Wolf Creek repositioned ' + source.card.name + ' into Zone ' + (destination.z + 1));
      break;
    }
    case '58': { // Crossroads: add supporter from discard
      const sups = typeof getRecoverableDiscardCards === 'function' ? getRecoverableDiscardCards(cp, c=>(typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(c, cp) : c.type==='Supporter')) : G.players[cp].discard.filter(c=>(typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(c, cp) : c.type==='Supporter'));
      if(sups.length){
        // Deck-aware: prioritize recycling key supporters
        const strat = G._selectedAI?._deckStrategy || '';
        const priorities = aiDeckSearchPriority(strat, 'supporter').length ? aiDeckSearchPriority(strat, 'supporter')
          : strat === 'starter_maelstrom' ? ['05','47'] // 17th British, Great Oak
          : strat === 'starter_incel' ? ['31'] // Oathbound Noble Fighter
          : strat === 'starter_assault' ? ['59','05'] // Maroon Knights, 17th British
          : strat === 'starter_soft_suppression' ? ['63','18','16','71','42','62','64']
          : [];
        let best = aiPickByPriority(sups, priorities);
        if(!best) { sups.sort((a,b)=>(b.fate||0)-(a.fate||0)); best = sups[0]; }
        if(typeof addCardToHand==='function') addCardToHand(cp, best, { announce:false, arrivalKind:'search' });
        else G.players[cp].hand.push(best);
        G.players[cp].discard = G.players[cp].discard.filter(c=>c.iid!==best.iid);
        if(typeof resolveBoleslawAfterSearchSelection === 'function') {
          await resolveBoleslawAfterSearchSelection(cp, [best], {sourceCardId:'58'});
        }
        log('p2', `AI: Crossroads recycled ${best.name}`);
      } break;
    }
    case '60': { // IB Student: search deck for supporter
      const sups = G.players[cp].deck.filter(c=>typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(c, cp) : c.type==='Supporter');
      if(sups.length){
        const strat = G._selectedAI?._deckStrategy || '';
        const priorities = aiDeckSearchPriority(strat, 'supporter').length ? aiDeckSearchPriority(strat, 'supporter')
          : strat === 'starter_soft_suppression'
          ? ['63','18','16','71','42','62','64']
          : [];
        let pick = aiPickByPriority(sups, priorities);
        if(!pick) pick = sups[0];
        if(typeof addCardToHand==='function') addCardToHand(cp, pick, { announce:false, arrivalKind:'search' });
        else G.players[cp].hand.push(pick);
        G.players[cp].deck = G.players[cp].deck.filter(c=>c.iid!==pick.iid);
        shuffle(G.players[cp].deck);
        if(typeof resolveBoleslawAfterSearchSelection === 'function') {
          await resolveBoleslawAfterSearchSelection(cp, [pick], {sourceCardId:'60'});
        }
      } break;
    }
    case '61': { // Maria Song: choose a revealed Character family and reduce every copy
      const candidates = G.players[opp].hand.filter(function(target){
        return typeof isMariaSongHandCandidate === 'function'
          ? isMariaSongHandCandidate(target, opp, cp)
          : target && target.type !== 'Supporter' && !target.immuneFlag;
      });
      const familyValue = function(target){
        let value = 0;
        ['hand','deck'].forEach(function(location){
          G.players[opp][location].forEach(function(copy){
            if(copy && copy.id === target.id && !copy.immuneFlag) value += Math.min(7, Math.max(0, Number(copy.currentFate ?? copy.fate) || 0));
          });
        });
        forEachBoardCard(function(copy, zone){
          if(copy && copy.owner === opp && copy.id === target.id && !copy.immuneFlag) value += Math.min(7, aiOpponentCardDecisionFate(copy, zone));
        });
        return value;
      };
      candidates.sort(function(a,b){ return familyValue(b) - familyValue(a); });
      const best = candidates[0];
      if(best && typeof applyMariaSongPreciseShot === 'function') {
        const result = applyMariaSongPreciseShot(inst, best, cp);
        log('p2','AI: Maria Song reduced ' + result.affected + ' copies of ' + best.name + ' by 7 Fate');
      }
      break;
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
              if(typeof markMovementEffectFlash === 'function') markMovementEffectFlash(inst, 'movement:berkeley-ai:' + String(inst.iid || inst.id) + ':' + String(G.turn || 0));
              if(typeof triggerRozsiPassive === 'function') triggerRozsiPassive(inst, zi);
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
      const strat = G._selectedAI?._deckStrategy || '';
      const bestAff = strat === 'ai_hungarian_war_dance'
        ? ['third_great_war', Number(affCounts.third_great_war || 0)]
        : Object.entries(affCounts).sort((a,b)=>b[1]-a[1])[0];
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
        let priority = aiDeckSearchPriority(strat, 'coordinator');
        const stagingPlans = {
          starter_freeworld:['34','77','01'],
          starter_assault:['11'],
          ai_crown_of_five:['15','19','57','01','77'],
          ai_hungarian_war_dance:['34','19','77'],
          ai_adjacency_doctrine:['bh11','bh07','01','19','15']
        };
        const stagingOrder = stagingPlans[strat] || [];
        if(stagingOrder.length) {
          const heldOrControlled = new Set();
          G.players[cp].hand.forEach(c=>heldOrControlled.add(String(c.id)));
          forEachBoardCard(c=>{ if(c && c.owner === cp) heldOrControlled.add(String(c.id)); });
          priority = stagingOrder.filter(id=>!heldOrControlled.has(id)).concat(stagingOrder.filter(id=>heldOrControlled.has(id)));
        }
        const pick = aiPickByPriority(coords, priority) || coords[0];
        if(typeof addCardToHand==='function') addCardToHand(cp, pick, { announce:false, arrivalKind:'search' });
        else G.players[cp].hand.push(pick);
        G.players[cp].deck = G.players[cp].deck.filter(c=>c.iid!==pick.iid);
        shuffle(G.players[cp].deck);
        if(typeof renderBoardActionForPlayer === 'function') renderBoardActionForPlayer(cp, {hand:true, piles:true, blocks:false, topbar:false, effects:false, hover:false});
        else renderGame({board:true, scores:true, oppHand:true, piles:true, blocks:true, topbar:true});
        if(typeof resolveBoleslawAfterSearchSelection === 'function') {
          await resolveBoleslawAfterSearchSelection(cp, [pick], {sourceCardId:'68'});
        }
      } break;
    }
    case '69': {
      if(typeof resolveBreakfastRepublicBusser==='function')resolveBreakfastRepublicBusser(inst,cp,{auto:true});
      break;
    }
    case '71': // Fort Calvin Watcher: set reveal flag
      if(!G._fortCalvinActive) G._fortCalvinActive=[];
      G._fortCalvinActive.push({owner:cp,remaining:3,characterSent:false,sourceIid:inst.iid||null,lastRevealedName:null,lastRevealedWasCharacter:false,sentCharacterName:null}); break;
    case '72': { // Robo: steal random eligible card from opp hand
      const oh=G.players[opp].hand;
      const eligible=oh.filter(function(target){ return !(typeof isTargetImmuneToEffectOwner === 'function' && isTargetImmuneToEffectOwner(target, cp)); });
      if(eligible.length){const i=Math.floor(Math.random()*eligible.length);const s=eligible[i];oh.splice(oh.indexOf(s),1);s._stolenByRobo=true;s._roboOrigOwner=opp;if(typeof addCardToHand==='function') addCardToHand(cp,s,{announce:false});else G.players[cp].hand.push(s);log('p2',`AI: Robo stole ${s.name}`);}
      break;
    }
    case '73': { // ALPINE Expeditionary: discard non-Dauntless/Coordinator chars
      if(window.FATE_PRESSURE_CARD_REWORKS_ENABLED === true) break;
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
        if((typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(card, card.owner) : card.type==='Supporter') && card.iid!==inst.iid && copyableIds.includes(card.id) && !isFaceDownCard(card)){
          candidates.push({card,z:bz,r:br,c:bc});
        }
      });
      if(candidates.length){
        const strat = G._selectedAI?._deckStrategy || '';
        const deckPriority = aiDeckSearchPriority(strat, 'supporter');
        let priority = deckPriority.length
          ? deckPriority.concat(['68','60','58','05','25','50','42','32','72','16','31','64','73','80','76','71','33','69'])
          : ['68','60','58','05','25','50','42','32','72','16','31','64','73','80','76','71','33','69'];
        if(strat === 'ai_last_mohicans_ledger') {
          const westArmed = !!(G._westCaribNext && G._westCaribNext.owner === cp);
          const chingAvailable = G.players[cp].hand.some(c=>c.id==='45') || G.players[cp].deck.some(c=>c.id==='45');
          priority = !westArmed && chingAvailable ? ['33','58','05','60','32','42'] : ['58','05','60','32','42','33'];
        }
        if(strat === 'ai_great_oak_salvo') {
          priority = G.players[cp].discard.some(c=>c.id==='47') ? ['58','60','05','32','42','33'] : ['60','58','05','32','42','33'];
        }
        if(strat === 'ai_selva_tidal_strike') {
          const westArmed = !!(G._westCaribNext && G._westCaribNext.owner === cp);
          const selvaAvailable = G.players[cp].hand.some(c=>c.id==='bh04') || G.players[cp].deck.some(c=>c.id==='bh04');
          priority = !westArmed && selvaAvailable ? ['33','58','05','32'] : ['58','33','05','32'];
        }
        candidates.sort((a,b)=>{
          const ap = priority.indexOf(a.card.id);
          const bp = priority.indexOf(b.card.id);
          return (ap<0?999:ap) - (bp<0?999:bp);
        });
        if(typeof activateLedgerCopiedSupporterEffect === 'function') {
          await activateLedgerCopiedSupporterEffect(cp, z, candidates[0], inst);
        } else {
          const originalId = inst.id;
          inst._ledgerCopiedSourceId = String(candidates[0].card.id || '');
          inst.id = candidates[0].card.id;
          await aiTriggerWhenSet(inst, z, r, c);
          inst.id = originalId;
        }
        log('p2','AI: Ledger-keepers copied '+candidates[0].card.name);
      }
      break;
    }
    case '80': { // Apparition: discard a character, draw 2
      const chars=[];
      G.board[z].forEach((row,ri)=>row.forEach((cell,ci)=>{
        if(cell&&cell.owner===cp&&(typeof isCardCharacterForRules === 'function' ? isCardCharacterForRules(cell, cp) : cell.type!=='Supporter')&&cell.iid!==inst.iid) chars.push({r:ri,c:ci,card:cell});
      }));
      if(chars.length){const t=chars[0];G.board[z][t.r][t.c]=null;fatePushDiscard(cp, t.card);await drawCard(cp,2,{activatedDrawEffect:true, effectSource:inst});log('p2',`AI: Apparition discarded ${t.card.name}, drew 2`);}
      break;
    }
    case '84': { // Kvetka Svoboda: set an Expanded Worlds character from deck for free
      const matches = G.players[cp].deck.filter(c=>{
        const base = (typeof CARDS !== 'undefined' && Array.isArray(CARDS)) ? CARDS.find(x=>String(x.id) === String(c.id)) : null;
        const aff = String((c.aff || (base && base.aff) || '')).toLowerCase().replace(/\s+/g, '_');
        const type = String(c.type || (base && base.type) || '').toLowerCase();
        const effectiveCard = Object.assign({}, base || {}, c || {}, {owner: cp});
        return aff === 'expanded_worlds' &&
          type && (type !== 'supporter' || (typeof isCardCharacterForRules === 'function' && isCardCharacterForRules(effectiveCard, cp))) &&
          String(c.id) !== '84';
      });
      if(matches.length) {
        const strat = G._selectedAI?._deckStrategy || '';
        const priorityByStrategy = {
          ai_snowbound_wintertide:['100','bh05','87','99','82','90'],
          ai_overclocked_dauntless:['100','89','88','bh07','83'],
          ai_taylors_perfect_mimic:['bh05','100','bh04','90']
        };
        let priority = priorityByStrategy[strat] || [];
        if(strat === 'ai_wintertide_family_reunion') {
          const snowActive = typeof isLandscapeActive === 'function' ? isLandscapeActive('igb15') : String(G.landscapeId || '') === 'igb15';
          const conversionActive = typeof isBlameGameActive === 'function' && isBlameGameActive(cp);
          const hasWintertide = aiOwnBoardCardsById('100').length || G.players[cp].hand.some(c=>c.id === '100');
          priority = !snowActive
            ? ['82','99','100','88','89','90']
            : !conversionActive
              ? ['99','100','88','89','82','90']
              : !hasWintertide
                ? ['100','88','89','82','90','99']
                : ['88','89','100','82','90','99'];
        }
        matches.sort((a,b)=>{
          const ap = aiPriorityIndex(a, priority);
          const bp = aiPriorityIndex(b, priority);
          if(ap !== bp) return ap - bp;
          return (Number(b.fate)||0)-(Number(a.fate)||0);
        });
        const picked = matches[0];
        G.players[cp].deck = G.players[cp].deck.filter(c=>c.iid!==picked.iid);
        if(typeof addCardToHand === 'function') addCardToHand(cp, picked, {announce:false, arrivalKind:'search'});
        else G.players[cp].hand.push(picked);
        if(typeof resolveBoleslawAfterSearchSelection === 'function') {
          await resolveBoleslawAfterSearchSelection(cp, [picked], {sourceCardId:'84'});
        }
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
    case '37':
      delete inst.opponentEffectImmune;
      delete inst.immuneFlag;
      if(typeof chooseFrenchFusiliersPassive === 'function') chooseFrenchFusiliersPassive(inst, z, {autoPick:true});
      break;
    case '76': inst.currentFate=5; inst.immuneFlag=true; inst.noBonus=true; inst.noConsolidate=true; break;
    case '20':
      if(window.FATE_PRESSURE_CARD_REWORKS_ENABLED === true) break;
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
  // Collect only genuine ACTIVATE characters. WHEN_SET and passive cards have
  // already resolved from placement and must not receive a second AI action.
  const toActivate = [];
  forEachBoardCard((card,z,r,c)=>{
    if(card.owner===cp && card.type!=='Supporter' && !activated.has(card.iid) && !isFaceDownCard(card)
      && typeof shouldShowManualCharacterEffectButton === 'function'
      && shouldShowManualCharacterEffectButton(card)){
      toActivate.push({card,z,r,c});
    }
  });
  // Sort: activate high-impact effects first (doublers, halvers, buff-all)
  const effectPriority = {'40':13,'bh16':12,'07':12,'21':11,'03':10,'bh01':10,'30':9,'01':8,'46':8,'57':8,'29':7,'27':7,'08':7,'06':7,'38':7,'23':6,'11':6,'15':6,'19':6,'10':5,'bh25':9};
  // Easier AIs process in random order (miss optimal sequencing)
  if(Math.random() < settings.mistakeChance){
    toActivate.sort(()=>Math.random()-0.5);
  } else {
    toActivate.sort((a,b)=>{
      const aId = typeof getCardRuntimeEffectId === 'function' ? getCardRuntimeEffectId(a.card) : String(a.card.id || '');
      const bId = typeof getCardRuntimeEffectId === 'function' ? getCardRuntimeEffectId(b.card) : String(b.card.id || '');
      return (effectPriority[bId]||0)-(effectPriority[aId]||0);
    });
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
    const copiedSnowball = typeof cardActsAsPassive === 'function' && cardActsAsPassive(card, '93');
    const copiedExpeditionary = typeof cardActsAsPassive === 'function' && cardActsAsPassive(card, '73');
    const supporterForRules = typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(card, cp) : card.type==='Supporter';
    if(card.owner===cp && (supporterForRules || copiedSnowball || copiedExpeditionary) && !isFaceDownCard(card) && (['26','73','93'].includes(card.id) || copiedSnowball || copiedExpeditionary)){
      supporterActions.push({card,z,r,c});
    }
  });
  supporterActions.sort((a,b)=>{
    const priority = function(entry){
      if(typeof cardActsAsPassive === 'function' && cardActsAsPassive(entry.card, '93')) return 3;
      if(typeof cardActsAsPassive === 'function' && cardActsAsPassive(entry.card, '73')) return 2;
      return ({'52':4,'54':1}[entry.card.id]||0);
    };
    return priority(b) - priority(a);
  });
  for(const action of supporterActions){
    await aiRunSupporterBoardAbility(action.card, action.z, action.r, action.c);
    await aiSleep(AI_VISUAL_PAUSE_EFFECTS);
  }
}

async function aiRunSupporterBoardAbility(card, z, r, c) {
  if(G.currentPlayer !== G.aiPlayer) return;
  const cp = G.aiPlayer;
  const opp = 1 - cp;
  if(String(card.id || '') === '26') {
    if(card.effectUsedInitial) return;
    if(typeof triggerCharacterEffect === 'function') await triggerCharacterEffect(card, z, r, c, {aiActivation:true});
    return;
  }
  if(typeof cardActsAsPassive === 'function' ? cardActsAsPassive(card, '93') : card.id === '93') {
    if(card.effectUsedThisTurn) return;
    const allowed = typeof beginManualSupporterEffectActivation === 'function' ? await beginManualSupporterEffectActivation(card, z, r, c, [opp]) : true;
    if(!allowed) return;
    const targets = [];
    (G.board || []).forEach(function(zone, targetZone){ (zone || []).forEach(function(row){ (row || []).forEach(function(target){
      if(!target || target.owner !== opp || isFaceDownCard(target)) return;
      if(typeof isTargetImmuneToEffectOwner === 'function' && isTargetImmuneToEffectOwner(target, cp)) return;
      targets.push({card:target,z:targetZone});
    }); }); });
    const strat = G._selectedAI?._deckStrategy || '';
    let remainingSnowballs = 1;
    if(strat === 'ai_snowball_fight_club') {
      remainingSnowballs = 0;
      forEachBoardCard(function(source){
        if(source && source.owner === cp && !source.effectUsedThisTurn && !isFaceDownCard(source)
          && typeof cardActsAsPassive === 'function' && cardActsAsPassive(source, '93')) remainingSnowballs++;
      });
      remainingSnowballs = Math.max(1, remainingSnowballs);
    }
    targets.sort(function(a,b){
      if(strat === 'ai_snowball_fight_club') {
        const af = Math.max(0, Number(a.card.currentFate ?? a.card.fate) || 0);
        const bf = Math.max(0, Number(b.card.currentFate ?? b.card.fate) || 0);
        const as = (af <= remainingSnowballs ? 10000 - af * 60 : 0) + aiOpponentCardDecisionFate(a.card,a.z);
        const bs = (bf <= remainingSnowballs ? 10000 - bf * 60 : 0) + aiOpponentCardDecisionFate(b.card,b.z);
        return bs - as;
      }
      return aiOpponentCardDecisionFate(b.card,b.z) - aiOpponentCardDecisionFate(a.card,a.z);
    });
    const target = targets[0] && targets[0].card;
    if(!target) return;
    const before = Math.max(0, Number(target.currentFate == null ? target.fate : target.currentFate) || 0);
    if(typeof setCardFateValue === 'function') setCardFateValue(target, before - 1, cp, {countOncePerSourceEffect:card});
    else target.currentFate = Math.max(0, before - 1);
    card.effectUsedThisTurn = true;
    if(typeof markSnowballFightHit === 'function') markSnowballFightHit(target);
    if(typeof playSfx === 'function') playSfx('snowballFight');
    log('p2','AI: Snowball Fight reduced ' + target.name + ' by 1 Fate');
    renderGame({board:true, scores:true, topbar:true});
    return;
  }
  if(card.id==='52' && card._pendingWhenSetEffect && card.whenSetActivated !== true){
    const targets = [];
    G.board[z].forEach((row,br)=>row.forEach((bc,bc2)=>{ if(bc && bc.owner===opp && !(typeof isTargetImmuneToEffectOwner === 'function' ? isTargetImmuneToEffectOwner(bc, cp) : (bc.immuneFlag || bc.id==='76'))) targets.push({card:bc,z,br,c:bc2}); }));
    if(!targets.length) return;
    targets.sort((a,b)=>aiOpponentCardDecisionFate(b.card,z)-aiOpponentCardDecisionFate(a.card,z));
    const target = targets[0];
    if(typeof markCardForVigilantes === 'function') markCardForVigilantes(target.card, card, cp);
    card.vigilanteUsed = true;
    log('p2','AI: Vigilantes marked '+target.card.name+' for death');
    if(typeof renderBoardActionForPlayer === 'function') renderBoardActionForPlayer(cp, {hand:false, piles:false, blocks:false, topbar:false, effects:false, hover:false});
    else renderGame({board:true, scores:true, piles:true, blocks:true, topbar:true});
    return;
  }
  if((typeof cardActsAsPassive === 'function' ? cardActsAsPassive(card, '73') : card.id==='73') && card._canMoveOncePerTurn && !card._expMoved && !card.cantBeMoved){
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
    if(typeof markMovementEffectFlash === 'function') markMovementEffectFlash(card, 'movement:expeditionary-ai:' + String(card.iid || card.id) + ':' + String(G.turn || 0));
    if(typeof triggerRozsiPassive === 'function') triggerRozsiPassive(card, dest.z);
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
  const effectId = typeof getCardRuntimeEffectId === 'function'
    ? getCardRuntimeEffectId(card)
    : String(card.id || '');
  const reusableCopiedEffect = String(card.id || '') === 'bh05' && (effectId === '38' || effectId === '40');
  // Skip if this character's effect was already used
  if(effectId === '21' && card.effectUsedInitial) return;
  if(card.effectUsedInitial && card.type!=='Dauntless' && card.type!=='Improvisor' && !reusableCopiedEffect) return;
  // Admission must happen before the first await. AI scheduling can revisit the
  // same pending effect while reactions or presentation are still resolving.
  if(card._aiEffectResolutionInFlight) return;
  card._aiEffectResolutionInFlight = true;
  try {
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
    switch(effectId){
    case '03': { // Howard: double highest-fate own card, then +5
      const own=[]; G.board[z].forEach(row=>row.forEach(cell=>{
        if(cell && cell.owner===cp && !(typeof isTargetImmuneToEffectOwner === 'function' && isTargetImmuneToEffectOwner(cell, cp))) own.push(cell);
      }));
      if(own.length){
        const strat = G._selectedAI?._deckStrategy || '';
        let target = strat === 'ai_fat_jake' ? own.find(c => c.id === '38') : null;
        if(strat === 'ai_last_mohicans_ledger') target = own.find(c => c.id === '45') || target;
        if(strat === 'ai_hellenic_heartbreaker') target = own.find(c => c.id === '35') || target;
        if(strat === 'ai_high_t_draw_mill') {
          target = own.slice().sort((a,b)=>(Number(b.currentFate ?? b.fate)||0)-(Number(a.currentFate ?? a.fate)||0))[0] || target;
        }
        if(!target) {
          own.sort((a,b)=>(b.currentFate||b.fate||0)-(a.currentFate||a.fate||0));
          target = own[0];
        }
        const before = Number(target.currentFate ?? target.fate ?? 0) || 0;
        target.currentFate = Math.max(0, Math.ceil(before * 2) + 5);
        if(typeof applyChineseMacArthurFateRider === 'function') applyChineseMacArthurFateRider(target, before, target.currentFate);
        log('p2',`AI: Howard boosted ${target.name} to ${target.currentFate} Fate`);
      }
      break;
    }
    case '04': { // Zoe: block opponent consolidation on or from one square in this zone
      const targetCells = [];
      const totalRows = G.board[z] ? G.board[z].length : 3;
      const opponentSafeRow = typeof getSafeRowForPlayer === 'function' ? getSafeRowForPlayer(opp) : (cp === 0 ? 0 : 2);
      for(let rr=0; rr<totalRows; rr++){
        const rowCap = getBoardRowCapacity(z, rr);
        for(let cc=0; cc<rowCap; cc++){
          if(G.board[z][rr] && !G.blockedCells.some(b=>b.z===z&&b.r===rr&&b.c===cc)){
            const occupant = G.board[z][rr][cc];
            let score = 0;
            if(occupant && occupant.owner === opp) score += 20 + Math.max(1, Number(getSupportReinforcementValue(occupant)) || 1) * 4;
            else if(occupant && occupant.owner === cp) score += 2;
            getAdjacentAndDiagonalCards(z, rr, cc).forEach(adj=>{
              if(adj.card.owner===opp) score += 3;
              else if(adj.card.owner===cp) score += 1;
            });
            if(rr === opponentSafeRow) score += 10;
            else if(rr === 1) score += 1;
            if(cc === 1) score += 1;
            targetCells.push({r:rr,c:cc,score});
          }
        }
      }
      if(targetCells.length){
        targetCells.sort((a,b)=>b.score-a.score);
        const best = targetCells[0];
        G.blockedCells.push({z,r:best.r,c:best.c,type:'zoe',owner:cp,blockedPlayer:opp,sourceIid:card.iid});
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
        let priorities = aiDeckSearchPriority(strat, 'jorge');
        if(strat === 'ai_wintertide_family_reunion') {
          const snowActive = typeof isLandscapeActive === 'function' ? isLandscapeActive('igb15') : String(G.landscapeId || '') === 'igb15';
          const conversionActive = typeof isBlameGameActive === 'function' && isBlameGameActive(cp);
          priorities = !snowActive
            ? ['84','82','99','100','88','89','90','27','94','92','28','60']
            : !conversionActive
              ? ['84','99','100','88','89','90','82','27','94','92','28','60']
              : ['100','88','89','84','90','27','82','92','28','60','94'];
        }
        pick = aiPickByPriority(deckCards, priorities);
        if(strat === 'starter_freeworld') {
          const heldOrControlled = new Set(G.players[cp].hand.map(c=>String(c.id || '')));
          forEachBoardCard(c=>{ if(c && c.owner === cp) heldOrControlled.add(String(c.id || '')); });
          const staged = ['34','77','01','35'].filter(id=>!heldOrControlled.has(id));
          pick = aiPickByPriority(deckCards, staged.concat(priorities));
        }
        if(strat === 'starter_soft_suppression') pick = deckCards.find(c => c.id === '17') || deckCards.find(c => c.id === '04') || deckCards.find(c => c.id === '61');
        if(!pick) pick = deckCards.sort((a,b)=>(b.fate||0)-(a.fate||0))[0];
        if(typeof addCardToHand==='function') addCardToHand(cp, pick, { announce:false, arrivalKind:'search' });
        else G.players[cp].hand.push(pick);
        G.players[cp].deck = G.players[cp].deck.filter(c=>c.iid!==pick.iid);
        shuffle(G.players[cp].deck);
        if(typeof resolveBoleslawAfterSearchSelection === 'function') {
          await resolveBoleslawAfterSearchSelection(cp, [pick], {sourceCardId:'06'});
        }
        log('p2', `AI: Jorge searched for ${pick.name}`);
      }
      break;
    }
    case '10': // Dylan: passive-only, continuous aura handled in getEffectiveFate
      break;
    case '11': // Anne Stone: passive-only, handled in getEffectiveFate
      break;
    case '15': // Zsofia: automatic Coordinator-set trigger handled in placement resolution
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
        opps.sort((a,b)=>aiOpponentCardDecisionFate(b.card,z)-aiOpponentCardDecisionFate(a.card,z));
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
        targets.sort((a,b)=>aiOpponentCardDecisionFate(b.card,b.z)-aiOpponentCardDecisionFate(a.card,a.z));
        const dest = openCells[0];
        const target = targets[0];
        G.board[target.z][target.r][target.c] = null;
        G.board[z][dest.r][dest.c] = target.card;
        if(typeof markMovementEffectFlash === 'function') markMovementEffectFlash(target.card, 'movement:juan-ai:' + String(target.card.iid || target.card.id) + ':' + String(G.turn || 0));
        if(typeof triggerRozsiPassive === 'function') triggerRozsiPassive(target.card, z);
        log('p2',`AI: Juan Carlos moved ${target.card.name} into Zone ${z+1}`);
      }
      break;
    }
    case '27': await drawCard(cp,3,{afterSetOrCinematic:true, activatedDrawEffect:true, effectSource:card}); log('p2','AI: Kazumi drew 3'); break;
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
      const diversifiedPlans = {
        ai_crown_of_five:['09','24','49'],
        ai_hungarian_war_dance:['25','44','68'],
        ai_great_oak_salvo:['47','65','20'],
        ai_adjacency_doctrine:['25','44','68']
      };
      const diversifiedPlan = diversifiedPlans[strat] || [];
      if(diversifiedPlan.length) {
        const diversified = [];
        diversifiedPlan.forEach(function(id){
          const found = sources.find(c=>c.id === id && !diversified.some(chosen=>chosen.iid === c.iid));
          if(found) diversified.push(found);
        });
        sources.forEach(function(source){ if(!diversified.some(chosen=>chosen.iid === source.iid)) diversified.push(source); });
        sources.splice(0, sources.length, ...diversified);
      }
      let added = 0;
      const searchedCardsAdded = [];
      for(const c of sources) {
        if(added >= 3) break;
        if(typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(c)) continue;
        const beforeFate = Math.max(0, Number(c.currentFate ?? c.fate) || 0);
        c.currentFate = beforeFate + 4;
        if(typeof applyChineseMacArthurFateRider === 'function') applyChineseMacArthurFateRider(c, beforeFate, c.currentFate);
        if(typeof recordHandCardEffectModifier === 'function') {
          recordHandCardEffectModifier(c, {
            key:'maja-kaminska-oblique-order',
            name:'Maja Kaminska',
            text:'Oblique Order: this Supporter gained +4 Fate permanently.',
            fateDelta:4
          });
        }
        if(typeof addCardToHand==='function') addCardToHand(cp, c, { announce:false, arrivalKind:'search' });
        else G.players[cp].hand.push(c);
        G.players[cp].deck = G.players[cp].deck.filter(x=>x.iid!==c.iid);
        searchedCardsAdded.push(c);
        added++;
      }
      G.extraSupportsThisTurn = (Number(G.extraSupportsThisTurn) || 0) + 2;
      G._majaSupportBoost = {owner:cp, turn:Number(G.turn), extraSupports:2, sourceIid:String(inst.iid || '')};
      if(added) shuffle(G.players[cp].deck);
      if(searchedCardsAdded.length && typeof resolveBoleslawAfterSearchSelection === 'function') {
        await resolveBoleslawAfterSearchSelection(cp, searchedCardsAdded, {sourceCardId:'07'});
      }
      log('p2', `AI: Maja searched ${added} supporter${added===1?'':'s'}, gave them +4 Fate, and unlocked 2 extra supporters`);
      if(typeof refreshStatusEffectsNow === 'function') refreshStatusEffectsNow();
      break;
    }
    case '43': { // Mark Kemper: add one extra safe cell
      const row = typeof getMarkSafeSquareChoiceRow === 'function' ? getMarkSafeSquareChoiceRow(z, cp) : 3;
      if(row < 3) {
        log('p2', `AI: Mark Kemper had no safe-square slots left in Zone ${z+1}`);
        break;
      }
      const colOrder = [1, 0, 2];
      let col = 1;
      for(let i = 0; i < colOrder.length; i++){
        const c = colOrder[i];
        const taken = typeof isMarkSafeSquare === 'function' && isMarkSafeSquare(z, row, c);
        const occupied = !!(G.board && G.board[z] && G.board[z][row] && G.board[z][row][c]);
        if(!taken && !occupied){ col = c; break; }
      }
      if(typeof addBottomSafeSquareForPlayer === 'function') addBottomSafeSquareForPlayer(z, cp, col);
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
      const searchedCardsAdded = [];
      for(const c of from){
        if(added>=2) break;
        if(typeof addCardToHand==='function') addCardToHand(cp, c, { announce:false, arrivalKind:'search' });
        else G.players[cp].hand.push(c);
        G.players[cp].deck=G.players[cp].deck.filter(x=>x.iid!==c.iid);
        G.players[cp].discard=G.players[cp].discard.filter(x=>x.iid!==c.iid);
        searchedCardsAdded.push(c);
        added++;
      }
      if(searchedCardsAdded.length && typeof resolveBoleslawAfterSearchSelection === 'function') {
        await resolveBoleslawAfterSearchSelection(cp, searchedCardsAdded, {sourceCardId:'29'});
      }
      if(added) log('p2',`AI: Leader of Free World added ${added} cards`);
      break;
    }
    case 'bh22': {
      const safeRow=cp===0?2:0;
      const choices=[];
      for(let zz=0;zz<3;zz++)for(let cc=0;cc<3;cc++){
        if((G.blockedCells||[]).some(b=>b.z===zz&&b.r===safeRow&&b.c===cc))continue;
        const occupant=G.board?.[zz]?.[safeRow]?.[cc]||null;
        const fate=occupant?(typeof getEffectiveFate==='function'?getEffectiveFate(occupant,zz):Number(occupant.currentFate??occupant.fate??0)):0;
        choices.push({z:zz,r:safeRow,c:cc,score:Number(fate)||0});
      }
      if(choices.length){
        choices.sort((a,b)=>b.score-a.score);
        const best=choices[0];
        G.blockedCells.push({...best,type:'jamie',owner:cp,blockedPlayer:null,sourceIid:card.iid});
        effectNeedsBlocks=true;
        if(typeof showBlockVisual==='function')showBlockVisual(best.z,best.r,best.c,'jamie');
        if(typeof refreshStatusEffectsNow==='function')refreshStatusEffectsNow();
      }
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
                if(typeof preparePlacementFateReveal === 'function') preparePlacementFateReveal(placedCard, pick, 'set');
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
                if(placedCard.type !== 'Supporter' && typeof requestCharacterSetCinematic === 'function') {
                  requestCharacterSetCinematic(placedCard, {z:zi, r:ri, c:ci, delayMs:Math.max(0, placementDelay || 0) + 90, source:'ai-effect-free-set'});
                }
                if(typeof aiTriggerWhenSet === 'function' && WHEN_SET_IDS.has(placedCard.id)) await aiTriggerWhenSet(placedCard, zi, ri, ci);
                placed = true;
              }
            }
          }
        }
        if(!placed){
          if(typeof addCardToHand==='function') addCardToHand(cp, pick, { announce:false, arrivalKind:'search' });
          else G.players[cp].hand.push(pick);
          if(typeof resolveBoleslawAfterSearchSelection === 'function') {
            await resolveBoleslawAfterSearchSelection(cp, [pick], {sourceCardId:'08'});
          }
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
        : strat === 'starter_soft_suppression' ? ['63','18','16','71','42','62','64']
        : [];
      // Sort: priority cards first, then by fate descending
      deckSups.sort((a,b) => {
        const aP = aiPriorityIndex(a, priorityIds);
        const bP = aiPriorityIndex(b, priorityIds);
        if(aP !== bP) return aP - bP;
        return (b.fate||0) - (a.fate||0);
      });
      if(priorityIds.length) {
        const diversified = [];
        priorityIds.forEach(function(id){
          const found = deckSups.find(c=>c.id === id && !diversified.some(chosen=>chosen.iid === c.iid));
          if(found) diversified.push(found);
        });
        deckSups.forEach(function(source){ if(!diversified.some(chosen=>chosen.iid === source.iid)) diversified.push(source); });
        deckSups.splice(0, deckSups.length, ...diversified);
      }
      let added = 0;
      const searchedCardsAdded = [];
      for(const c of deckSups) {
        if(added >= 2) break;
        if(typeof addCardToHand==='function') addCardToHand(cp, c, { announce:false, arrivalKind:'search' });
        else G.players[cp].hand.push(c);
        G.players[cp].deck = G.players[cp].deck.filter(x=>x.iid!==c.iid);
        searchedCardsAdded.push(c);
        added++;
      }
      if(searchedCardsAdded.length && typeof resolveBoleslawAfterSearchSelection === 'function') {
        await resolveBoleslawAfterSearchSelection(cp, searchedCardsAdded, {sourceCardId:'13'});
      }
      if(added) { shuffle(G.players[cp].deck); log('p2',`AI: Kirby searched ${added} supporters`); }
      break;
    }
    case '21': { // Henry Dong: choose adjacent suppression squares
      if(typeof activateHenryDongSuppression === 'function') {
        const applied = await activateHenryDongSuppression(card, z, r, c, {auto:true});
        if(applied) log('p2', 'AI: Henry Dong selected adjacent suppression squares');
      }
      break;
    }
    case '38': { // Jake: discard a field Supporter once per turn for +4 Fate
      if(card.effectUsedThisTurn) break;
      const supporters = [];
      (G.board || []).forEach((zone,z)=>zone.forEach((row,r)=>row.forEach((fieldCard,c)=>{
        if(!fieldCard || fieldCard.owner !== cp || String(fieldCard.id || '') === '76') return;
        if(typeof isCardSupporterForRules === 'function' ? isCardSupporterForRules(fieldCard, cp) : fieldCard.type === 'Supporter') supporters.push({card:fieldCard,z,r,c});
      })));
      if(!supporters.length) break;
      supporters.sort((a,b)=>(getEffectiveFate(a.card,a.z)||0)-(getEffectiveFate(b.card,b.z)||0));
      const spent = supporters[0];
      discardBoardCard(spent.card, spent.z, spent.r, spent.c);
      modifyFate(card, 4, 'permanent', cp);
      card.effectUsedThisTurn = true;
      log('p2','AI: Jake discarded '+spent.card.name+' from Zone '+(spent.z+1)+' and gained 4 Fate');
      break;
    }
    case 'bh01': { // Ani\u010dka Voyager: reposition anywhere and take the optional draw
      if(typeof hasAnickaVoyagerMovedThisTurn !== 'function' || hasAnickaVoyagerMovedThisTurn(card)) break;
      const options = typeof getAnickaVoyagerMoveOptions === 'function' ? getAnickaVoyagerMoveOptions(card, z, r, c) : [];
      if(!options.length) break;
      options.sort(function(a, b){
        const aNeed = (getZoneScore(a.z, opp) || 0) - (getZoneScore(a.z, cp) || 0) + (a.r === 1 ? 2 : 0) + (a.c === 1 ? 1 : 0);
        const bNeed = (getZoneScore(b.z, opp) || 0) - (getZoneScore(b.z, cp) || 0) + (b.r === 1 ? 2 : 0) + (b.c === 1 ? 1 : 0);
        return bNeed - aNeed;
      });
      const destination = options[0];
      if(typeof beginAnickaVoyagerMove === 'function' && beginAnickaVoyagerMove(card, z, r, c)) {
        const hadCardToDraw = Array.isArray(G.players?.[cp]?.deck) && G.players[cp].deck.length > 0;
        await resolveAnickaVoyagerMove(destination.z, destination.r, destination.c);
        log('p2','AI: Ani\u010dka crossed to Zone '+(destination.z+1)+(hadCardToDraw ? ' and drew 1 card' : ''));
      }
      break;
    }
    case '40': { // Christopher Erbs: arm the next draw for +6 Fate
      if(!Array.isArray(G.erbsActive)) G.erbsActive = [false, false];
      if((card.usesLeft || 0) <= 0 || G.erbsActive[cp]) break;
      if(!aiShouldActivateOptionalDrawEffect(cp, card, {drawPhase:false, manualActivation:true})) break;
      card.usesLeft--;
      G.erbsActive[cp] = true;
      log('p2','AI: Christopher Erbs empowered the next drawn card');
      break;
    }
    case 'bh16': {
      const strat = G._selectedAI?._deckStrategy || '';
      if(strat === 'ai_selva_tidal_strike') {
        const eventideCount = aiCountOwnCardsInZone(z, function(source){ return String(source.aff || '') === 'eventide'; });
        if(eventideCount < 3 && Number(G.turn || 0) < Number(G.maxTurns || 20) - 1) break;
      }
      if(typeof activateLiHuaStormOfTenThousandBlades === 'function'){
        await activateLiHuaStormOfTenThousandBlades(card, z, cp);
      }
      break;
    }
    case '22': { // Isaac Perez: buff up to 2 friendly cards in this zone
      const targets = [];
      G.board[z]?.forEach(row=>row?.forEach(cell=>{
        if(cell && cell.owner===cp) targets.push(cell);
      }));
      const strat = G._selectedAI?._deckStrategy || '';
      targets.sort((a,b)=>{
        if(strat === 'ai_hellenic_heartbreaker') {
          const aAlexander = a.id === '35' ? 1 : 0;
          const bAlexander = b.id === '35' ? 1 : 0;
          if(aAlexander !== bAlexander) return bAlexander - aAlexander;
        }
        return (b.currentFate||b.fate||0)-(a.currentFate||a.fate||0);
      });
      const chosen = targets.slice(0,2);
      chosen.forEach(function(target, idx){
        modifyFate(target,3,'permanent');
        if(typeof flashCardEffect === 'function') flashCardEffect(target, 'isaac_beaker', {
            label:'scientific inquiry',
            soundKey:'isaac-ai:' + String(card && (card.iid || card.id) || 'card') + ':' + String(target && (target.iid || target.id) || idx) + ':' + String(G.turn || 0)
          });
      });
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
      if(strat === 'ai_hungarian_war_dance' || strat === 'ai_crown_of_five') {
        declaredAff = 'third_great_war';
      } else if(strat === 'ai_selva_tidal_strike') {
        declaredAff = 'eventide';
      } else if(strat !== 'starter_freeworld') {
        // For other decks, pick the most common affiliation on board
        let best = 'third_great_war', bestCount = 0;
        for(const [aff, count] of Object.entries(affCounts)) {
          if(count > bestCount) { bestCount = count; best = aff; }
        }
        declaredAff = best;
      }
      card._declaredAff = declaredAff;
      if(typeof scheduleCoordinatorPlacementFlash === 'function') scheduleCoordinatorPlacementFlash(card, {
        z,
        r,
        c,
        source:'heyward-ai-affiliation',
        delayMs:0,
        label:'declared affiliation',
        soundKey:'heyward-ai:' + String(card && (card.iid || card.id) || 'card') + ':' + String(G.turn || 0)
      });
      log('p2', `AI: Duncan Heyward declared ${AFF_LABEL[declaredAff]||declaredAff}`);
      if(typeof renderBoardActionForPlayer === 'function') renderBoardActionForPlayer(cp, {hand:false, blocks:false, topbar:false, effects:false, hover:false});
      else renderGame({board:true, scores:true, blocks:true, topbar:true});
      break;
    }
    }
    card.effectUsedInitial = true;
    if(typeof renderBoardActionForPlayer === 'function') renderBoardActionForPlayer(cp, {hand:false, piles:true, blocks:effectNeedsBlocks, topbar:false, effects:false, hover:false});
    else renderGame({board:true, scores:true, piles:true, blocks:true, topbar:true});
  } finally {
    delete card._aiEffectResolutionInFlight;
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
