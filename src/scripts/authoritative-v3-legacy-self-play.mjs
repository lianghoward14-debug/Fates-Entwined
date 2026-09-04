const RECORDER_QUERY_FLAG = 'fateV3Recorder';
const CORPUS_QUERY_FLAG = 'fateV3LegacyCorpus';
const SINGLE_PLAYER_QUERY_FLAG = 'fateV3SinglePlayer';

function exactCorpusFlags(){
  const params = new URLSearchParams(window.location.search || '');
  return params.get(RECORDER_QUERY_FLAG) === '1'
    && params.get(CORPUS_QUERY_FLAG) === '1'
    && params.get(SINGLE_PLAYER_QUERY_FLAG) !== '1';
}

function requireFunction(name){
  const fn = window[name];
  if(typeof fn !== 'function') throw new Error(`legacy corpus driver requires ${name}()`);
  return fn;
}

function gameState(){
  const state = typeof window.getFateGameState === 'function'
    ? window.getFateGameState()
    : window.FATE_GAME_STATE;
  if(!state) throw new Error('legacy corpus driver requires the legacy game state');
  return state;
}

function activeCardDefinitions(){
  const cards = typeof window.getFateCardDefinitions === 'function'
    ? window.getFateCardDefinitions()
    : [];
  return cards.filter(card=>card
    && !card.retired
    && !card.token
    && !card.pierogiCounter
    && !card.whisperLandscapeToken);
}

function rotatedDeck(ids, offset){
  const deck = [];
  for(let index = 0; index < Math.min(40, ids.length); index += 1){
    deck.push(ids[(offset + index) % ids.length]);
  }
  if(deck.length !== 40) throw new Error('legacy corpus driver requires at least 40 active cards');
  return deck;
}

function waitFor(predicate, timeoutMs = 8000){
  const startedAt = Date.now();
  return new Promise((resolve, reject)=>{
    function poll(){
      let value = false;
      try{ value = predicate(); }catch(error){ reject(error); return; }
      if(value){ resolve(value); return; }
      if(Date.now() - startedAt >= timeoutMs){
        reject(new Error(`legacy corpus driver timed out after ${timeoutMs}ms`));
        return;
      }
      setTimeout(poll, 0);
    }
    poll();
  });
}

function chooseFallbackMove(moves){
  return moves.slice().sort((left, right)=>{
    const leftKey = [
      String(left?.type || ''),
      String(left?.card?.id || ''),
      Number(left?.z), Number(left?.r), Number(left?.c)
    ].join(':');
    const rightKey = [
      String(right?.type || ''),
      String(right?.card?.id || ''),
      Number(right?.z), Number(right?.r), Number(right?.c)
    ].join(':');
    return leftKey.localeCompare(rightKey);
  })[0] || null;
}

function chooseEvaluatedMove(moves){
  const evaluate = requireFunction('aiEvaluateMove');
  return moves.map(move=>({
    move,
    score:Number(evaluate(move)) || 0
  })).sort((left, right)=>{
    const scoreDelta = right.score - left.score;
    if(scoreDelta !== 0) return scoreDelta;
    return chooseFallbackMove([left.move, right.move]) === left.move ? -1 : 1;
  })[0]?.move || chooseFallbackMove(moves);
}

async function chooseMove(state, moves, searchMode){
  if(searchMode !== 'mcts') return chooseEvaluatedMove(moves);
  const chooseWithMcts = requireFunction('aiChooseMoveWithMCTS');
  const settings = requireFunction('getAIDifficultySettings')();
  const turnToken = (Number(state._aiTurnToken) || 0) + 1;
  state._aiTurnToken = turnToken;
  const choice = await chooseWithMcts(moves, settings, {
    turnToken,
    turnNumber:state.turn
  });
  return choice?.move || chooseFallbackMove(moves);
}

async function playLegacyAction(state, recorder, move){
  const token = recorder.beginAIAction(move);
  try{
    if(move.type === 'place') await requireFunction('aiDoPlace')(move);
    else if(move.type === 'consolidate') await requireFunction('aiDoConsolidate')(move);
    else throw new Error(`unsupported legacy AI move ${String(move.type || '')}`);
  }catch(error){
    recorder.cancelAction(token);
    throw error;
  }
  recorder.finishAction(token);
}

async function finishLegacyTurn(state, recorder){
  const previousTurn = Number(state.turn) || 0;
  state._turnInputLockUntil = 0;
  state._aiRunning = false;
  const token = recorder.beginNamedAction('LEGACY_END_TURN');
  const ended = requireFunction('endTurn')({
    skipEffectWarning:true,
    skipModalDeferral:true
  });
  if(ended !== true){
    recorder.cancelAction(token);
    throw new Error(`legacy endTurn rejected on turn ${previousTurn}`);
  }
  try{
    const transition = state._legacyCorpusTurnTransitionPromise;
    if(transition && typeof transition.then === 'function') await transition;
    else await waitFor(()=>Number(state.turn) > previousTurn || state.phase === 'end');
  }catch(error){
    recorder.cancelAction(token);
    throw error;
  }
  recorder.finishAction(token);
}

function prepareMatch(options, matchIndex, catalogIds){
  const state = gameState();
  const span = Math.max(1, catalogIds.length);
  state.p1Deck = rotatedDeck(catalogIds, (matchIndex * 17) % span);
  state.p2Deck = rotatedDeck(catalogIds, (matchIndex * 17 + 43) % span);
  state.players[0].name = `Legacy Corpus P1 M${matchIndex + 1}`;
  state.players[1].name = `Legacy Corpus P2 M${matchIndex + 1}`;
  state.seed = `${options.seed}:match:${matchIndex}`;
  state._legacyCorpusCaptureMode = 'actual-legacy-ai-self-play';
  state._legacyCorpusMatchIndex = matchIndex;
  state._selectedAI = null;
  state.aiDifficulty = 'extreme';
  state._aiOpponentElo = null;
  state._aiFateMultiplier = 1;
  state.aiEnabled = true;
  state.aiPlayer = matchIndex % 2;
  requireFunction('initGameState')();
  state.currentPlayer = matchIndex % 2;
  state.turn = 1;
  state.maxTurns = options.maxTurns;
  state.phase = 'main';
  state._turnInputLockUntil = 0;
  requireFunction('initLandscapeForSong')(`board${(matchIndex % 20) + 1}`);
  requireFunction('showScreen')('s-game');
  return state;
}

function actionCoverage(corpus){
  const cardIds = new Set();
  const landscapeIds = new Set();
  const commandTypes = {};
  for(const action of corpus.actions || []){
    const type = String(action?.command?.type || '');
    commandTypes[type] = (commandTypes[type] || 0) + 1;
    if(action?.command?.cardId) cardIds.add(String(action.command.cardId));
    if(action?.context?.landscapeId) landscapeIds.add(String(action.context.landscapeId));
  }
  return {
    actionCount:(corpus.actions || []).length,
    cardIds:[...cardIds].sort(),
    landscapeIds:[...landscapeIds].sort(),
    commandTypes
  };
}

export function installLegacySelfPlayCorpusDriver(){
  if(!exactCorpusFlags()) return null;
  if(window.FateAuthorityV3LegacySelfPlayCorpus) return window.FateAuthorityV3LegacySelfPlayCorpus;
  const recorder = window.FateAuthorityV3LegacyRecorderBridge;
  if(!recorder?.enabled || recorder.mode !== 'observe-only'){
    throw new Error('legacy corpus driver requires the observe-only recorder bridge');
  }
  let running = false;
  let stopRequested = false;
  let lastResult = null;

  const api = Object.freeze({
    enabled:true,
    mode:'actual-legacy-ai-self-play-corpus',
    authorityRoutingChanged:false,
    async start(input = {}){
      if(running) throw new Error('legacy corpus capture is already running');
      running = true;
      stopRequested = false;
      const options = {
        seed:String(input.seed || 'phase5-real-legacy-self-play-v1'),
        matches:Math.max(1, Math.min(100, Math.trunc(Number(input.matches) || 8))),
        maxTurns:Math.max(2, Math.min(20, Math.trunc(Number(input.maxTurns) || 12))),
        maxActionsPerTurn:Math.max(1, Math.min(15, Math.trunc(Number(input.maxActionsPerTurn) || 8))),
        searchMode:String(input.searchMode || 'evaluation') === 'mcts' ? 'mcts' : 'evaluation'
      };
      const definitions = activeCardDefinitions();
      const catalogIds = definitions.map(card=>String(card.id));
      const originalPresentation = window.FateActionPresentation;
      window.FateActionPresentation = null;
      recorder.resetCorpus(options.seed);
      recorder.configureDeterministicRandom(options.seed);
      const matches = [];
      try{
        for(let matchIndex = 0; matchIndex < options.matches && !stopRequested; matchIndex += 1){
          const state = prepareMatch(options, matchIndex, catalogIds);
          const actionStart = recorder.exportCorpus().actions.length;
          let completedTurns = 0;
          while(Number(state.turn) < options.maxTurns && !stopRequested){
            const actingPlayer = Number(state.currentPlayer) === 1 ? 1 : 0;
            state.aiPlayer = actingPlayer;
            state.aiEnabled = true;
            state._aiRunning = false;
            state._aiAbort = false;
            state._aiAborted = false;
            if(typeof window.aiObserveOpponentAndPlan === 'function') window.aiObserveOpponentAndPlan();
            for(let actionIndex = 0; actionIndex < options.maxActionsPerTurn; actionIndex += 1){
              const moves = requireFunction('aiGenerateAllMoves')();
              if(!moves.length) break;
              if(typeof window.aiClearZoneScoreCache === 'function') window.aiClearZoneScoreCache();
              const move = await chooseMove(state, moves, options.searchMode);
              if(!move) break;
              await playLegacyAction(state, recorder, move);
              if(Number(state.currentPlayer) !== actingPlayer) break;
            }
            if(Number(state.currentPlayer) !== actingPlayer) continue;
            await finishLegacyTurn(state, recorder);
            completedTurns += 1;
          }
          const actionEnd = recorder.exportCorpus().actions.length;
          matches.push({
            matchIndex,
            seed:state.seed,
            landscapeId:String(state.landscapeId || ''),
            completedTurns,
            actions:actionEnd - actionStart
          });
          window.dispatchEvent(new CustomEvent('fate-authority-v3-legacy-corpus-progress', {
            detail:{
              completedMatches:matches.length,
              requestedMatches:options.matches,
              actions:actionEnd,
              landscapeId:String(state.landscapeId || '')
            }
          }));
        }
        const corpus = recorder.exportCorpus();
        lastResult = {
          ...corpus,
          capture:{
            kind:'actual-legacy-ai-self-play',
            generatedAt:new Date().toISOString(),
            options,
            matches,
            coverage:actionCoverage(corpus)
          }
        };
        window.dispatchEvent(new CustomEvent('fate-authority-v3-legacy-corpus-complete', {
          detail:{
            actions:lastResult.actions.length,
            matches:lastResult.capture.matches.length,
            coverage:lastResult.capture.coverage
          }
        }));
        return structuredClone(lastResult);
      }finally{
        running = false;
        window.FateActionPresentation = originalPresentation;
      }
    },
    stop(){
      stopRequested = true;
    },
    status(){
      return {
        running,
        stopRequested,
        actions:recorder.exportCorpus().actions.length,
        result:lastResult ? {
          actions:lastResult.actions.length,
          matches:lastResult.capture.matches.length,
          coverage:lastResult.capture.coverage
        } : null
      };
    },
    exportCorpus(){
      const corpus = lastResult || recorder.exportCorpus();
      return structuredClone(corpus);
    }
  });

  window.FateAuthorityV3LegacySelfPlayCorpus = api;
  window.dispatchEvent(new CustomEvent('fate-authority-v3-legacy-corpus-ready', {
    detail:{mode:api.mode, authorityRoutingChanged:false}
  }));
  return api;
}

function installStatusPanel(){
  let panel = document.getElementById('fate-v3-legacy-corpus-status');
  if(panel) return panel;
  panel = document.createElement('output');
  panel.id = 'fate-v3-legacy-corpus-status';
  panel.dataset.state = 'ready';
  panel.textContent = 'Legacy corpus driver ready';
  panel.style.cssText = [
    'position:fixed',
    'inset:12px 12px auto auto',
    'z-index:2147483647',
    'max-width:420px',
    'padding:10px 12px',
    'border:1px solid #c9a84c',
    'border-radius:6px',
    'background:#111',
    'color:#f5e7b2',
    'font:12px/1.4 monospace',
    'white-space:pre-wrap'
  ].join(';');
  document.body.appendChild(panel);
  return panel;
}

function autoStartFromQuery(api){
  const params = new URLSearchParams(window.location.search || '');
  if(params.get('fateV3LegacyCorpusAuto') !== '1') return;
  const run = async ()=>{
    const panel = installStatusPanel();
    panel.dataset.state = 'running';
    panel.textContent = 'Legacy corpus capture running';
    const onProgress = event=>{
      const detail = event?.detail || {};
      panel.textContent = [
        'Legacy corpus capture running',
        `matches=${Number(detail.completedMatches) || 0}/${Number(detail.requestedMatches) || 0}`,
        `actions=${Number(detail.actions) || 0}`,
        `landscape=${String(detail.landscapeId || '')}`
      ].join('\n');
    };
    window.addEventListener('fate-authority-v3-legacy-corpus-progress', onProgress);
    try{
      const result = await api.start({
        seed:params.get('fateV3LegacyCorpusSeed') || undefined,
        matches:params.get('fateV3LegacyCorpusMatches') || undefined,
        maxTurns:params.get('fateV3LegacyCorpusTurns') || undefined,
        maxActionsPerTurn:params.get('fateV3LegacyCorpusActions') || undefined,
        searchMode:params.get('fateV3LegacyCorpusSearch') || undefined
      });
      window.__fateAuthorityV3LegacyCorpusResult = result;
      let payload = document.getElementById('fate-v3-legacy-corpus-result');
      if(!payload){
        payload = document.createElement('script');
        payload.id = 'fate-v3-legacy-corpus-result';
        payload.type = 'application/json';
        document.body.appendChild(payload);
      }
      payload.textContent = JSON.stringify(result);
      panel.dataset.state = 'complete';
      panel.textContent = [
        'Legacy corpus capture complete',
        `matches=${result.capture.matches.length}`,
        `actions=${result.actions.length}`,
        `cards=${result.capture.coverage.cardIds.length}`,
        `landscapes=${result.capture.coverage.landscapeIds.length}`
      ].join('\n');
    }catch(error){
      window.__fateAuthorityV3LegacyCorpusError = String(error?.stack || error);
      panel.dataset.state = 'error';
      panel.textContent = `Legacy corpus capture failed\n${String(error?.stack || error)}`;
    }finally{
      window.removeEventListener('fate-authority-v3-legacy-corpus-progress', onProgress);
    }
  };
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', run, {once:true});
  }else{
    run();
  }
}

const installedDriver = installLegacySelfPlayCorpusDriver();
if(installedDriver) autoStartFromQuery(installedDriver);
