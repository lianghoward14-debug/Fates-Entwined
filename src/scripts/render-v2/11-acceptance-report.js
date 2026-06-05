(function(){
  'use strict';

  if(typeof window === 'undefined') return;

  function q(sel){
    try { return document.querySelector(sel); }
    catch(e) { return null; }
  }

  function count(sel){
    try { return document.querySelectorAll(sel).length; }
    catch(e) { return 0; }
  }

  function callReport(fnName){
    try {
      const fn = window[fnName];
      return typeof fn === 'function' ? (fn() || {}) : {};
    } catch(e) {
      return {error:String(e && e.message || e || 'report failed')};
    }
  }

  function flagsReport(){
    try {
      return window.FateRenderV2Flags && typeof window.FateRenderV2Flags.report === 'function'
        ? window.FateRenderV2Flags.report()
        : {};
    } catch(e) {
      return {};
    }
  }

  function adapterReport(){
    try {
      return window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.report === 'function'
        ? window.FateMatchRendererAdapter.report()
        : callReport('fateMatchRendererV2Report');
    } catch(e) {
      return {};
    }
  }

  function oldCanvasReport(){
    return callReport('fateCanvasBoardReport');
  }

  function phase8Report(){
    return callReport('fatePhase8HandPileReport');
  }

  function dragReport(){
    return callReport('fateMatchHandDragReport');
  }

  function timelineReport(){
    try {
      return window.FateMatchAnimationTimeline && typeof window.FateMatchAnimationTimeline.report === 'function'
        ? window.FateMatchAnimationTimeline.report()
        : {};
    } catch(e) {
      return {};
    }
  }

  function textureReport(){
    try {
      return window.FateCardTextureCache && typeof window.FateCardTextureCache.getReport === 'function'
        ? window.FateCardTextureCache.getReport()
        : window.FateCardTextureCache && typeof window.FateCardTextureCache.report === 'function'
        ? window.FateCardTextureCache.report()
        : {};
    } catch(e) {
      return {};
    }
  }

  function dragUsesDomHand(){
    try {
      return !!(window.FateMatchHandDragBridge && window.FateMatchHandDragBridge.usesDomHand === true);
    } catch(e) {
      return true;
    }
  }

  function dragUsesHitMap(){
    const dr = dragReport();
    return !!(dr && dr.ownsBoard && !dragUsesDomHand());
  }

  function liveHandCounts(){
    try {
      const g = typeof window.getFateGameState === 'function' ? window.getFateGameState() : (typeof G !== 'undefined' ? G : null);
      if(!g || !Array.isArray(g.players)) return {available:false, own:null, opponent:null};
      let viewer = 0;
      try {
        if(typeof window.getPerspectivePlayerIndex === 'function') viewer = Number(window.getPerspectivePlayerIndex()) || 0;
        else if(typeof g.currentPlayer === 'number') viewer = g.currentPlayer;
      } catch(e) {}
      const opponent = viewer === 0 ? 1 : 0;
      const ownPlayer = g.players[viewer] || {};
      const opponentPlayer = g.players[opponent] || {};
      return {
        available:true,
        own:Array.isArray(ownPlayer.hand) ? ownPlayer.hand.length : 0,
        opponent:Array.isArray(opponentPlayer.hand) ? opponentPlayer.hand.length : 0
      };
    } catch(e) {
      return {available:false, own:null, opponent:null};
    }
  }

  function buildAcceptanceReport(){
    const flags = flagsReport();
    const renderer = adapterReport();
    const old = oldCanvasReport();
    const phase8 = phase8Report();
    const timeline = timelineReport();
    const texture = textureReport();
    const boardEl = q('#board');
    const oldBlocked = window.__fateOldCanvasBlocked || {};
    const canvasInfo = renderer.canvas || {};
    const expectedHands = liveHandCounts();

    const board = {
      children:boardEl ? boardEl.children.length : 0,
      canvases:count('#board canvas'),
      domCells:count('#board .cell'),
      domBoardCards:count('#board .bc'),
      oldBoardCanvasPresent:!!q('#fate-board-canvas'),
      v2CanvasPresent:!!q('#fate-match-v2-canvas'),
      hoverCanvasPresent:!!q('#fate-match-v2-hover-canvas'),
      layerCanvases:Number(renderer.layerCanvases || renderer.layers || canvasInfo.layers || count('#fate-match-scene-v2 canvas') || 2)
    };

    const hand = {
      domHandCards:count('#hand-cards .hc'),
      expectedHandCards:expectedHands.available ? expectedHands.own : null,
      v2HandCards:Number((renderer.hand && renderer.hand.v2Cards) || (renderer.hitMap && renderer.hitMap.handCards) || 0),
      dragUsesDomHand:dragUsesDomHand(),
      dragUsesHitMap:dragUsesHitMap()
    };

    const opponentHand = {
      domOpponentCards:count('#opp-hand .opp-card-back, #opp-hand .hc, #opp-hand > *'),
      expectedOpponentHandCards:expectedHands.available ? expectedHands.opponent : null,
      v2OpponentCards:Number((renderer.opponentHand && renderer.opponentHand.v2Cards) || (renderer.hitMap && renderer.hitMap.opponentHandCards) || 0)
    };

    const piles = {
      domPileSlots:count('.pile-slot'),
      domPileCanvases:count('.pile-card-canvas'),
      v2Piles:!!(renderer.piles && renderer.piles.v2Piles),
      v2PileCount:Number((renderer.piles && renderer.piles.v2PileCount) || (renderer.hitMap && renderer.hitMap.piles) || 0)
    };

    const motion = {
      domGhostCardsActive:count('.fate-v2-motion-card'),
      v2TimelineActive:!!(timeline && timeline.activeAnimations),
      activeAnimations:Number((timeline && timeline.activeAnimations) || 0)
    };

    const oldRenderer = {
      loaded:!!window.fateCanvasBoardReport,
      disabledByV2:!!old.disabledByV2,
      drawRequests:Number(old.drawRequests || 0),
      blockedDrawRequests:Number(old.blockedDrawRequests || oldBlocked.count || 0),
      lastSource:old.lastSource || oldBlocked.lastSource || '',
      fallbackForcedDomBoard:!!old.fallbackForcedDomBoard || (!old.disabledByV2 && !!window.FATE_RUNTIME_FORCE_DOM_BOARD),
      mutationObserverActive:!!old.mutationObserverActive
    };

    const canvas = {
      layers:board.layerCanvases,
      dpr:Number(canvasInfo.dpr || 0),
      maxDpr:Number(canvasInfo.maxDpr || 2),
      renderScale:Number(canvasInfo.renderScale || 1),
      effectiveDpr:Number(canvasInfo.effectiveDpr || canvasInfo.dpr || 0),
      cssWidth:Number(canvasInfo.cssW || 0),
      cssHeight:Number(canvasInfo.cssH || 0),
      pixelArea:Number(canvasInfo.pixelArea || (canvasInfo.width || 0) * (canvasInfo.height || 0)),
      totalLayerPixelArea:Number(canvasInfo.totalLayerPixelArea || canvasInfo.pixelArea || (canvasInfo.width || 0) * (canvasInfo.height || 0)),
      lastMs:Number(renderer.lastMs || 0),
      avgMs:Number(renderer.avgMs || renderer.lastMs || 0),
      maxMs:Number(renderer.maxMs || renderer.lastMs || 0),
      rafAvgGapMs:Number(renderer.rafAvgGapMs || 0),
      rafMaxGapMs:Number(renderer.rafMaxGapMs || 0),
      rafSamples:Number(renderer.rafSamples || 0),
      rafLongIdleGaps:Number(renderer.rafLongIdleGaps || 0),
      fps:Number(renderer.fps || 0),
      draws:Number(renderer.draws || 0),
      dirtyDraws:Number(renderer.dirtyDraws || 0),
      idleDrawsPerSecond:Number(renderer.idleDrawsPerSecond || 0),
      fullSceneRedraws:Number(renderer.fullSceneRedraws || renderer.draws || 0),
      backgroundLayerRedraws:Number(renderer.backgroundLayerRedraws || 0),
      cardLayerRedraws:Number(renderer.cardLayerRedraws || renderer.draws || 0),
      effectLayerRedraws:Number(renderer.effectLayerRedraws || 0),
      particleLayerRedraws:Number(renderer.particleLayerRedraws || 0),
      uiLayerRedraws:Number(renderer.uiLayerRedraws || 0),
      hoverLayerRedraws:Number(renderer.hoverLayerRedraws || 0),
      hoverOnlyDraws:Number(renderer.hoverOnlyDraws || 0),
      lastDirtyMask:Number(renderer.lastDirtyMask || 0),
      lastDirtySource:String(renderer.lastDirtySource || ''),
      hitMap:Object.assign({cards:0, cells:0, handCards:0, opponentHandCards:0, piles:0}, renderer.hitMap || {}),
      cardsDrawn:Number(renderer.cards || 0),
      expectedCards:Number(renderer.expectedCards || 0)
    };

    const textureCache = {
      entries:Number(texture.entries || texture.loaded || 0),
      hits:Number(texture.hits || 0),
      misses:Number(texture.misses || 0),
      pendingImages:Number(texture.pending || texture.pendingImages || 0),
      pixelBudget:Number(texture.pixelBudget || 0),
      prunes:Number(texture.prunes || 0)
    };

    const ownsBoard = !!renderer.ownsBoard && board.domCells === 0 && board.domBoardCards === 0 && board.v2CanvasPresent;
    const ownsHand = hand.domHandCards === 0 && (expectedHands.available ? expectedHands.own === 0 || hand.v2HandCards > 0 : hand.v2HandCards > 0);
    const ownsOpponentHand = opponentHand.domOpponentCards === 0 && (expectedHands.available ? expectedHands.opponent === 0 || opponentHand.v2OpponentCards > 0 : opponentHand.v2OpponentCards > 0);
    const ownsPiles = piles.domPileCanvases === 0 && !!piles.v2Piles;
    const ownsMotionFx = motion.domGhostCardsActive === 0 && !!window.FateMatchAnimationTimeline && !window.FateV2CardMotionFxUsesDomGhosts;
    const blockers = [];

    function block(condition, msg){
      if(condition) blockers.push(msg);
    }

    block(flags.mode !== 'scene', 'render-v2 mode is ' + (flags.mode || 'unknown') + ', not scene');
    block(!renderer.ownsBoard, 'render-v2 adapter does not own the board');
    block(board.domCells > 0, '#board .cell elements still exist');
    block(board.domBoardCards > 0, '#board .bc elements still exist');
    block(board.oldBoardCanvasPresent, 'old #fate-board-canvas is present');
    block(!board.v2CanvasPresent, 'v2 board canvas is not present');
    block(hand.domHandCards > 0, '#hand-cards .hc elements still exist');
    block(!ownsHand, 'own hand is not render-v2 owned');
    block(opponentHand.domOpponentCards > 0, 'opponent hand DOM visuals still exist');
    block(!ownsOpponentHand, 'opponent hand is not render-v2 owned');
    block(piles.domPileCanvases > 0, 'pile DOM canvases still exist');
    block(!ownsPiles, 'deck/discard piles are not render-v2 owned');
    block(hand.dragUsesDomHand, 'hand drag still uses DOM hand cards');
    block(!hand.dragUsesHitMap, 'hand drag is not fully hit-map based');
    block(motion.domGhostCardsActive > 0, 'DOM motion ghost cards are active');
    block(!ownsMotionFx, 'motion effects are not fully render-v2 timeline owned');
    block(!oldRenderer.disabledByV2, 'old board canvas renderer is not disabled by v2');
    block(oldRenderer.drawRequests > 0, 'old board canvas renderer drew during v2 mode');
    block(oldRenderer.fallbackForcedDomBoard, 'old board canvas forced DOM-board fallback');
    block(oldRenderer.mutationObserverActive, 'old board canvas mutation observer is active during v2 mode');
    block(canvas.layers < 4, 'renderer has ' + canvas.layers + ' canvas layers, expected at least 4');

    return {
      mode:flags.mode || '',
      defaultMode:flags.defaultMode || 'scene',
      ownsBoard,
      ownsHand,
      ownsOpponentHand,
      ownsPiles,
      ownsMotionFx,
      board,
      hand,
      opponentHand,
      piles,
      motion,
      oldRenderer,
      canvas,
      textureCache,
      phase8,
      pass:blockers.length === 0,
      blockers
    };
  }

  function perfMatrix(){
    const report = buildAcceptanceReport();
    const phase11 = phase11CoverageReport(report);
    return {
      generatedAt:new Date().toISOString(),
      pass:report.pass && phase11.pass,
      blockers:report.blockers.concat(phase11.blockers),
      scenarios:[
        {name:'current-state', metrics:report.canvas, dom:{boardCells:report.board.domCells, boardCards:report.board.domBoardCards, handCards:report.hand.domHandCards, motionGhosts:report.motion.domGhostCardsActive}},
        {name:'old-renderer', metrics:report.oldRenderer},
        {name:'texture-cache', metrics:report.textureCache}
      ],
      phase11,
      suggestedScenarios:scenarioList(),
      recentScenarios:scenarioLog.slice(),
      report
    };
  }

  let lastCanvasDeltaSample = null;
  let activeScenario = null;
  const scenarioLog = [];
  const SCENARIO_LOG_KEY = 'fateRendererV2Phase11ScenarioLog';

  function trimScenarioLog(){
    scenarioLog.length = Math.min(scenarioLog.length, 80);
  }

  function saveScenarioLog(){
    try {
      localStorage.setItem(SCENARIO_LOG_KEY, JSON.stringify(scenarioLog.slice(0, 80)));
    } catch(e) {}
  }

  function loadScenarioLog(){
    try {
      const raw = localStorage.getItem(SCENARIO_LOG_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if(Array.isArray(parsed)) {
        scenarioLog.length = 0;
        parsed.forEach(function(result){
          if(result && result.name) scenarioLog.push(result);
        });
        trimScenarioLog();
      }
    } catch(e) {}
  }

  function resetScenarioLog(){
    scenarioLog.length = 0;
    try { localStorage.removeItem(SCENARIO_LOG_KEY); } catch(e) {}
    return scenarioReport();
  }

  function canvasDelta(){
    const report = buildAcceptanceReport();
    const current = report.canvas || {};
    const previous = lastCanvasDeltaSample;
    lastCanvasDeltaSample = Object.assign({}, current);
    if(!previous) {
      return {
        baseline:true,
        note:'Run fateRendererV2CanvasDelta() again after one action to see deltas.',
        current
      };
    }
    const fields = [
      'draws',
      'dirtyDraws',
      'fullSceneRedraws',
      'backgroundLayerRedraws',
      'cardLayerRedraws',
      'effectLayerRedraws',
      'particleLayerRedraws',
      'uiLayerRedraws',
      'hoverLayerRedraws',
      'hoverOnlyDraws'
    ];
    const delta = {};
    fields.forEach(function(field){
      delta[field] = Number(current[field] || 0) - Number(previous[field] || 0);
    });
    return {
      baseline:false,
      delta,
      renderScaleBefore:Number(previous.renderScale || 0),
      renderScaleAfter:Number(current.renderScale || 0),
      effectiveDprBefore:Number(previous.effectiveDpr || 0),
      effectiveDprAfter:Number(current.effectiveDpr || 0),
      lastDirtySource:current.lastDirtySource || '',
      lastDirtyMask:Number(current.lastDirtyMask || 0),
      current
    };
  }

  function copyCanvas(canvas){
    return Object.assign({}, canvas || {});
  }

  function diffCanvas(before, after){
    const fields = [
      'draws',
      'dirtyDraws',
      'fullSceneRedraws',
      'backgroundLayerRedraws',
      'cardLayerRedraws',
      'effectLayerRedraws',
      'particleLayerRedraws',
      'uiLayerRedraws',
      'hoverLayerRedraws',
      'hoverOnlyDraws'
    ];
    const delta = {};
    fields.forEach(function(field){
      delta[field] = Number(after && after[field] || 0) - Number(before && before[field] || 0);
    });
    return delta;
  }

  function beginScenario(name){
    try {
      const adapter = window.FateMatchRendererAdapter;
      if(adapter && typeof adapter.resetPerformanceSamples === 'function') adapter.resetPerformanceSamples();
    } catch(e) {}
    const report = buildAcceptanceReport();
    activeScenario = {
      name:String(name || 'manual-scenario'),
      startedAt:new Date().toISOString(),
      startCanvas:copyCanvas(report.canvas),
      startReport:report
    };
    return {
      started:true,
      name:activeScenario.name,
      canvas:activeScenario.startCanvas,
      instruction:'Perform the action, then run fateEndPerfScenario().'
    };
  }

  function endScenario(name){
    if(!activeScenario) return {
      ended:false,
      error:'No active scenario. Run fateBeginPerfScenario(name) first.'
    };
    const report = buildAcceptanceReport();
    const endCanvas = copyCanvas(report.canvas);
    const result = {
      name:String(name || activeScenario.name),
      startedAt:activeScenario.startedAt,
      endedAt:new Date().toISOString(),
      pass:report.pass,
      blockers:report.blockers.slice(),
      delta:diffCanvas(activeScenario.startCanvas, endCanvas),
      renderScaleBefore:Number(activeScenario.startCanvas.renderScale || 0),
      renderScaleAfter:Number(endCanvas.renderScale || 0),
      effectiveDprBefore:Number(activeScenario.startCanvas.effectiveDpr || 0),
      effectiveDprAfter:Number(endCanvas.effectiveDpr || 0),
      lastDirtySource:endCanvas.lastDirtySource || '',
      lastDirtyMask:Number(endCanvas.lastDirtyMask || 0),
      endCanvas,
      dom:{
        boardCells:report.board.domCells,
        boardCards:report.board.domBoardCards,
        handCards:report.hand.domHandCards,
        motionGhosts:report.motion.domGhostCardsActive
      }
    };
    scenarioLog.unshift(result);
    trimScenarioLog();
    saveScenarioLog();
    activeScenario = null;
    return result;
  }

  function scenarioList(){
    return [
      'empty-board',
      '12-board-cards',
      '27-board-cards',
      '54-board-cards',
      'idle-5s',
      'hover-board-card',
      'hover-empty-cell',
      'select-board-card',
      'select-hand-card',
      'drag-hand-card',
      'place-one-card',
      'fate-pulse',
      'card-to-discard-motion',
      'draw-from-deck-motion',
      'deck-click',
      'discard-click',
      'end-turn',
      'resize-orientation-change',
      'low-effects-mode',
      'dpr-1',
      'dpr-1.5',
      'dpr-2'
    ];
  }

  function scenarioReport(){
    return {
      active:activeScenario ? {name:activeScenario.name, startedAt:activeScenario.startedAt, startCanvas:activeScenario.startCanvas} : null,
      phase11:phase11CoverageReport(),
      suggested:scenarioList(),
      recent:scenarioLog.slice()
    };
  }

  function manualScenarioInstructions(){
    return {
      'hover-board-card':'Move the pointer over a card already on the board, wait briefly, then run fateEndPerfScenario().',
      'hover-empty-cell':'Move the pointer over an empty board cell, wait briefly, then run fateEndPerfScenario().',
      'select-board-card':'Click a board card to open/select it, then run fateEndPerfScenario(). Close any modal if needed.',
      'select-hand-card':'Click one card in your hand, then run fateEndPerfScenario(). Close any modal if needed.',
      'drag-hand-card':'Drag a hand card around briefly and release it without needing to place it, then run fateEndPerfScenario().',
      'place-one-card':'Play/place one card from hand onto the board, then run fateEndPerfScenario().',
      'fate-pulse':'Trigger any action that changes a board card Fate value, wait for the pulse, then run fateEndPerfScenario().',
      'card-to-discard-motion':'Discard a board card or trigger a card moving to discard, then run fateEndPerfScenario().',
      'draw-from-deck-motion':'Trigger a draw/add-from-deck action, then run fateEndPerfScenario().',
      'deck-click':'Click a deck pile, then run fateEndPerfScenario(). Close the modal after the scenario.',
      'discard-click':'Click a discard pile, then run fateEndPerfScenario(). Close the modal after the scenario.',
      'end-turn':'Click End Turn, wait for the state to settle, then run fateEndPerfScenario().',
      'resize-orientation-change':'Resize the game window or change zoom/layout, wait for redraw, then run fateEndPerfScenario().'
    };
  }

  function manualScenarioPlan(){
    const report = phase11CoverageReport();
    const instructions = manualScenarioInstructions();
    const manualMissing = report.missing.filter(function(name){ return !!instructions[name]; });
    const next = manualMissing[0] || '';
    return {
      generatedAt:new Date().toISOString(),
      remaining:manualMissing,
      next,
      command:next ? "fateStartPhase11ManualScenario('" + next + "')" : '',
      instruction:next ? instructions[next] : 'No guided manual scenarios remain.',
      allInstructions:instructions,
      phase11:report
    };
  }

  function startManualScenario(name){
    const scenarioName = String(name || (manualScenarioPlan().next || 'manual-scenario'));
    const instructions = manualScenarioInstructions();
    const started = beginScenario(scenarioName);
    return Object.assign({}, started, {
      phase11Manual:true,
      instruction:instructions[scenarioName] || started.instruction,
      finishCommand:'fateEndPerfScenario()',
      plan:manualScenarioPlan()
    });
  }

  function latestPassingScenario(names){
    const wanted = Array.isArray(names) ? names : [names];
    return scenarioLog.find(function(result){
      return result && result.pass === true && wanted.indexOf(result.name) >= 0;
    }) || null;
  }

  function latestPassingPerfBoard(count){
    return scenarioLog.find(function(result){
      return result
        && result.pass === true
        && result.perfBoard
        && Number(result.perfBoard.requestedCards) === Number(count);
    }) || null;
  }

  function currentDprScenarioName(report){
    const dpr = Number(report && report.canvas && report.canvas.dpr || window.devicePixelRatio || 1);
    if(Math.abs(dpr - 1) < .15) return 'dpr-1';
    if(Math.abs(dpr - 1.5) < .2) return 'dpr-1.5';
    if(Math.abs(dpr - 2) < .25) return 'dpr-2';
    return 'dpr-' + Math.round(dpr * 100) / 100;
  }

  function scenarioEvidence(name){
    if(name === 'empty-board') return latestPassingPerfBoard(0);
    if(name === '12-board-cards') return latestPassingPerfBoard(12);
    if(name === '27-board-cards') return latestPassingPerfBoard(27);
    if(name === '54-board-cards') return latestPassingPerfBoard(54);
    if(name === 'resize-orientation-change') return latestPassingScenario(['resize-orientation-change', 'resize']);
    if(name === currentDprScenarioName(buildAcceptanceReport())) return latestPassingScenario(name);
    return latestPassingScenario(name);
  }

  function phase11CoverageReport(currentReport){
    const report = currentReport || buildAcceptanceReport();
    const currentDprName = currentDprScenarioName(report);
    const required = scenarioList();
    const coverage = required.map(function(name){
      const evidence = scenarioEvidence(name);
      const conditional = name === 'dpr-1.5' || name === 'dpr-2';
      const available = !conditional || name === currentDprName;
      return {
        name,
        pass:!!evidence || !available,
        available,
        conditional,
        status:evidence ? 'pass' : available ? 'missing' : 'not-available-on-current-device',
        evidence:evidence ? {
          scenario:evidence.name,
          endedAt:evidence.endedAt || '',
          delta:evidence.delta || null,
          renderScaleAfter:evidence.renderScaleAfter,
          effectiveDprAfter:evidence.effectiveDprAfter,
          lastDirtySource:evidence.lastDirtySource || ''
        } : null
      };
    });
    const missing = coverage.filter(function(item){ return item.available && !item.evidence; }).map(function(item){ return item.name; });
    const notAvailable = coverage.filter(function(item){ return !item.available; }).map(function(item){ return item.name; });
    const blockers = report.pass ? [] : report.blockers.slice();
    missing.forEach(function(name){ blockers.push('Phase 11 scenario not yet recorded: ' + name); });
    return {
      generatedAt:new Date().toISOString(),
      acceptancePass:!!report.pass,
      pass:blockers.length === 0,
      blockers,
      coverage,
      missing,
      notAvailable,
      currentDprScenario:currentDprName,
      recentScenarioCount:scenarioLog.length
    };
  }

  function wait(ms){
    return new Promise(function(resolve){ setTimeout(resolve, Math.max(0, Number(ms) || 0)); });
  }

  function clonePlain(value){
    if(value == null) return value;
    try { return JSON.parse(JSON.stringify(value)); }
    catch(e) { return null; }
  }

  function cardDefinitions(){
    try {
      if(typeof CARDS !== 'undefined' && Array.isArray(CARDS)) return CARDS;
    } catch(e) {}
    return Array.isArray(window.CARDS) ? window.CARDS : [];
  }

  function makePerfCard(index, owner){
    const defs = cardDefinitions();
    const base = clonePlain(defs[index % Math.max(1, defs.length)] || null) || {};
    return Object.assign({
      id:String(base.id || ('perf-' + index)),
      name:base.name || ('Perf Card ' + (index + 1)),
      type:base.type || (index % 4 === 0 ? 'Dauntless' : 'Supporter'),
      rarity:base.rarity || 'Common',
      aff:base.aff || (index % 3 === 0 ? 'reality' : index % 3 === 1 ? 'third_great_war' : 'expanded_worlds'),
      fate:base.fate != null ? base.fate : 1 + (index % 5),
      currentFate:base.currentFate != null ? base.currentFate : (base.fate != null ? base.fate : 1 + (index % 5)),
      cost:base.cost != null ? base.cost : 1,
      img:base.img || ''
    }, base, {
      owner,
      iid:'perf-' + index + '-' + owner,
      faceDown:false
    });
  }

  function makePerfRows(cardCount){
    const n = Math.max(0, Number(cardCount) || 0);
    const cols = n > 27 ? 6 : 3;
    const rows = [];
    let made = 0;
    for(let z = 0; z < 3; z++){
      const zone = [];
      for(let r = 0; r < 3; r++){
        const row = [];
        for(let c = 0; c < cols; c++){
          row.push(made < n ? makePerfCard(made, r === 0 ? 1 : 0) : null);
          made++;
        }
        zone.push(row);
      }
      rows.push(zone);
    }
    return rows;
  }

  function makePerfHand(owner, count, offset){
    const cards = [];
    for(let i = 0; i < count; i++) cards.push(makePerfCard((Number(offset) || 0) + i, owner));
    return cards;
  }

  function makePerfGameState(cardCount){
    return {
      players:[
        {name:'Perf Player', deck:new Array(34), hand:makePerfHand(0, 6, 1000), discard:[], color:'var(--p1)'},
        {name:'Perf Opponent', deck:new Array(34), hand:makePerfHand(1, 6, 2000), discard:[], color:'var(--p2)'}
      ],
      board:makePerfRows(cardCount),
      extraCells:[[{p1:0,p2:0},{p1:0,p2:0},{p1:0,p2:0}],[{p1:0,p2:0},{p1:0,p2:0},{p1:0,p2:0}],[{p1:0,p2:0},{p1:0,p2:0},{p1:0,p2:0}]],
      blockedCells:[],
      currentPlayer:0,
      turn:1,
      maxTurns:20,
      phase:'perf',
      selectedHandCard:null,
      selectedBoardCard:null,
      placing:false,
      _revealedCards:{}
    };
  }

  function runPerfScenario(name, options){
    const scenarioName = String(name || 'idle-5s');
    const opts = options || {};
    if(scenarioName === 'current-state') {
      return Promise.resolve({
        name:scenarioName,
        report:buildAcceptanceReport()
      });
    }
    if(scenarioName === 'idle-5s' || scenarioName === 'texture-settle') {
      const duration = Number(opts.durationMs) || (scenarioName === 'texture-settle' ? 2500 : 5000);
      beginScenario(scenarioName);
      return wait(duration).then(function(){ return endScenario(scenarioName); });
    }
    beginScenario(scenarioName);
    return Promise.resolve({
      started:true,
      name:scenarioName,
      manual:true,
      instruction:'Perform the scenario action, then run fateEndPerfScenario().',
      active:scenarioReport().active
    });
  }

  function runNamedIdleScenario(name, durationMs){
    beginScenario(name);
    return wait(durationMs).then(function(){ return endScenario(name); });
  }

  function runLowEffectsScenario(options){
    const opts = options || {};
    const duration = Number(opts.durationMs) || 1500;
    const root = document.documentElement;
    const hadLowEffects = root && root.classList.contains('fate-low-effects');
    if(root) root.classList.add('fate-low-effects');
    try {
      const adapter = window.FateMatchRendererAdapter;
      if(adapter && typeof adapter.renderFromGameState === 'function') adapter.renderFromGameState({source:'low-effects-mode', dirtyMask:65535});
    } catch(e) {}
    beginScenario('low-effects-mode');
    return wait(duration).then(function(){
      const result = endScenario('low-effects-mode');
      if(root && !hadLowEffects) root.classList.remove('fate-low-effects');
      try {
        const adapter = window.FateMatchRendererAdapter;
        if(adapter && typeof adapter.renderFromGameState === 'function') result.restore = adapter.renderFromGameState({source:'low-effects-restore', dirtyMask:65535});
      } catch(e) {}
      return result;
    });
  }

  function runCurrentDprScenario(options){
    const opts = options || {};
    const duration = Number(opts.durationMs) || 1000;
    const report = buildAcceptanceReport();
    return runNamedIdleScenario(currentDprScenarioName(report), duration);
  }

  function runPhase11AutoSuite(options){
    const opts = options || {};
    const duration = Number(opts.durationMs) || 1500;
    const results = [];
    return runPerfBoardMatrix(Object.assign({}, opts, {durationMs:duration, restore:true}))
      .then(function(matrix){
        results.push(matrix);
        return runNamedIdleScenario('idle-5s', Math.max(duration, Number(opts.idleMs) || duration));
      })
      .then(function(idle){
        results.push(idle);
        return runLowEffectsScenario(Object.assign({}, opts, {durationMs:duration}));
      })
      .then(function(lowEffects){
        results.push(lowEffects);
        return runCurrentDprScenario(Object.assign({}, opts, {durationMs:Math.min(duration, 1000)}));
      })
      .then(function(dpr){
        results.push(dpr);
        const report = phase11CoverageReport();
        return {
          name:'phase11-auto-suite',
          generatedAt:new Date().toISOString(),
          pass:report.pass,
          blockers:report.blockers.slice(),
          results,
          phase11:report
        };
      });
  }

  function createPerfBoard(cardCount, options){
    const n = Math.max(0, Number(cardCount) || 0);
    const adapter = window.FateMatchRendererAdapter;
    if(!adapter || typeof adapter.renderFromGameState !== 'function') {
      return {
        created:false,
        requestedCards:n,
        reason:'render-v2 adapter is unavailable'
      };
    }
    const gameState = makePerfGameState(n);
    const snapshot = typeof window.fateBuildRenderSnapshot === 'function'
      ? window.fateBuildRenderSnapshot({gameState, viewer:0})
      : null;
    if(!snapshot) return {
      created:false,
      requestedCards:n,
      reason:'synthetic perf snapshot could not be built'
    };
    const before = buildAcceptanceReport();
    const render = adapter.renderFromGameState({source:'perf-board-' + n, dirtyMask:65535, snapshot});
    const after = buildAcceptanceReport();
    window.__fateRendererV2PerfBoard = {cardCount:n, snapshot, renderedAt:new Date().toISOString()};
    return {
      created:true,
      synthetic:true,
      requestedCards:n,
      before:before.canvas,
      after:after.canvas,
      render,
      instruction:'Run a scenario or fateRendererV2PerfMatrix(); use fateRestoreLivePerfBoard() to redraw the live match.'
    };
  }

  function runPerfBoardScenario(cardCount, options){
    const opts = options || {};
    const duration = Number(opts.durationMs) || 1500;
    const board = createPerfBoard(cardCount, opts);
    if(!board.created) return Promise.resolve({
      name:'perf-board-' + Math.max(0, Number(cardCount) || 0),
      pass:false,
      blockers:[board.reason || 'perf board was not created'],
      board
    });
    beginScenario('perf-board-' + board.requestedCards + '-idle');
    return wait(duration).then(function(){
      const result = endScenario('perf-board-' + board.requestedCards + '-idle');
      result.perfBoard = {
        requestedCards:board.requestedCards,
        synthetic:true,
        render:board.render
      };
      if(opts.restore !== false) result.restore = restoreLivePerfBoard();
      saveScenarioLog();
      return result;
    });
  }

  function runPerfBoardMatrix(options){
    const opts = options || {};
    const counts = Array.isArray(opts.counts) && opts.counts.length
      ? opts.counts.map(function(n){ return Math.max(0, Number(n) || 0); })
      : [0, 12, 27, 54];
    const results = [];
    let chain = Promise.resolve();
    counts.forEach(function(count){
      chain = chain.then(function(){
        return runPerfBoardScenario(count, Object.assign({}, opts, {restore:false}));
      }).then(function(result){
        results.push(result);
        return wait(Number(opts.gapMs) || 120);
      });
    });
    return chain.then(function(){
      const restore = opts.restore === false ? null : restoreLivePerfBoard();
      const blockers = [];
      results.forEach(function(result){
        if(!result || result.pass !== true) {
          blockers.push((result && result.name || 'unknown') + ' failed');
          if(result && Array.isArray(result.blockers)) {
            result.blockers.forEach(function(blocker){
              blockers.push((result.name || 'scenario') + ': ' + blocker);
            });
          }
        }
      });
      return {
        name:'perf-board-matrix',
        generatedAt:new Date().toISOString(),
        pass:blockers.length === 0,
        blockers,
        counts,
        results,
        restore
      };
    });
  }

  function restoreLivePerfBoard(){
    const adapter = window.FateMatchRendererAdapter;
    window.__fateRendererV2PerfBoard = null;
    if(adapter && typeof adapter.renderFromGameState === 'function') {
      return adapter.renderFromGameState({source:'perf-board-restore', dirtyMask:65535});
    }
    return buildAcceptanceReport();
  }

  loadScenarioLog();

  window.fateRendererV2AcceptanceReport = buildAcceptanceReport;
  window.fateRendererV2PerfMatrix = perfMatrix;
  window.fateRendererV2CanvasDelta = canvasDelta;
  window.fateBeginPerfScenario = beginScenario;
  window.fateEndPerfScenario = endScenario;
  window.fateRunPerfScenario = runPerfScenario;
  window.fateRunPhase11AutoSuite = runPhase11AutoSuite;
  window.fatePhase11ManualPlan = manualScenarioPlan;
  window.fateStartPhase11ManualScenario = startManualScenario;
  window.fateResetPhase11ScenarioLog = resetScenarioLog;
  window.fateCreatePerfBoard = createPerfBoard;
  window.fateRunPerfBoardScenario = runPerfBoardScenario;
  window.fateRunPerfBoardMatrix = runPerfBoardMatrix;
  window.fateRestoreLivePerfBoard = restoreLivePerfBoard;
  window.fatePerfScenarioReport = scenarioReport;
  window.fateRendererV2Phase11Report = phase11CoverageReport;
})();
