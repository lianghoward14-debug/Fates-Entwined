(function(){
  'use strict';

  if(typeof window === 'undefined') return;

  const SNAPSHOT_VERSION = 1;
  let lastSnapshot = null;
  let lastReport = null;
  let buildCount = 0;

  function nowMs(){
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function roundMs(ms){
    return Math.round((Number(ms) || 0) * 10) / 10;
  }

  function getGameState(){
    if(typeof window.getFateGameState === 'function') return window.getFateGameState();
    try { if(typeof G !== 'undefined') return G; } catch(e) {}
    return null;
  }

  function clonePlain(value){
    if(value == null) return value;
    try { return JSON.parse(JSON.stringify(value)); }
    catch(e) { return null; }
  }

  function stableStringify(value){
    const seen = new WeakSet();
    function normalize(v){
      if(v == null || typeof v !== 'object') return v;
      if(seen.has(v)) return '[cycle]';
      seen.add(v);
      if(Array.isArray(v)) return v.map(normalize);
      const out = {};
      Object.keys(v).sort().forEach(function(k){
        if(typeof v[k] !== 'function') out[k] = normalize(v[k]);
      });
      return out;
    }
    try { return JSON.stringify(normalize(value)); }
    catch(e) { return ''; }
  }

  function hashString(text){
    let hash = 2166136261;
    const str = String(text || '');
    for(let i = 0; i < str.length; i++){
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function getViewer(g){
    try {
      if(typeof window.getPerspectivePlayerIndex === 'function') return window.getPerspectivePlayerIndex();
    } catch(e) {}
    if(g && typeof g.viewerPlayerIndex === 'number') return g.viewerPlayerIndex;
    if(g && typeof g.localPlayerIndex === 'number') return g.localPlayerIndex;
    if(g && g.aiEnabled && typeof g.aiPlayer === 'number') return 1 - g.aiPlayer;
    return g && typeof g.currentPlayer === 'number' ? g.currentPlayer : 0;
  }

  function isCardFaceDown(card){
    try {
      if(typeof window.isFaceDownCard === 'function') return window.isFaceDownCard(card);
    } catch(e) {}
    return !!(card && card.faceDown);
  }

  function canRevealHandCard(g, card){
    if(!card) return false;
    try {
      if(typeof window.isLandscapeActive === 'function' && window.isLandscapeActive('igb12')) return true;
    } catch(e) {}
    return !!(g && g._revealedCards && card.iid != null && g._revealedCards[card.iid]);
  }

  function fallbackVisual(card, hidden){
    if(hidden) {
      return {
        isHidden:true,
        name:'Face-Down Card',
        type:'Face Down',
        aff:'hidden',
        displayFate:'-',
        img:'back.png',
        runtimeImg:'back.png'
      };
    }
    return card ? {
      isHidden:false,
      name:card.name || '',
      type:card.type || '',
      aff:card.aff || '',
      displayFate:card.currentFate != null ? card.currentFate : card.fate,
      img:card.img || '',
      runtimeImg:card.img || ''
    } : null;
  }

  function visualForCard(card, viewer, boardPos, forceHidden){
    if(!card) return null;
    const hidden = !!forceHidden || (boardPos && isCardFaceDown(card) && card.owner !== viewer);
    if(typeof window.getCardVisualData === 'function') {
      try {
        const visual = window.getCardVisualData(card, viewer, {
          forceBoardHidden:hidden,
          boardPos:boardPos || null
        });
        if(visual) {
          return {
            isHidden:!!visual.isHidden,
            name:visual.name || '',
            type:visual.type || '',
            aff:visual.aff || '',
            displayFate:visual.displayFate,
            currentFate:visual.currentFate,
            fate:visual.fate,
            img:visual.img || '',
            runtimeImg:visual.runtimeImg || visual.img || '',
            cost:visual.cost,
            xCost:!!visual.xCost
          };
        }
      } catch(e) {}
    }
    return fallbackVisual(card, hidden);
  }

  function cardPublicState(card, viewer, options){
    if(!card) return null;
    const opts = options || {};
    const boardPos = opts.boardPos || null;
    const hidden = !!opts.forceHidden || (boardPos && isCardFaceDown(card) && card.owner !== viewer);
    const visual = visualForCard(card, viewer, boardPos, hidden);
    const base = {
      iid:card.iid != null ? String(card.iid) : '',
      owner:typeof card.owner === 'number' ? card.owner : null,
      hidden:!!(visual && visual.isHidden),
      visual
    };
    if(base.hidden) return base;
    base.id = card.id != null ? String(card.id) : '';
    base.name = card.name || '';
    base.type = card.type || '';
    base.aff = card.aff || '';
    base.rarity = card.rarity || '';
    base.img = card.img || (visual && visual.img) || '';
    base.runtimeImg = card.runtimeImg || (visual && visual.runtimeImg) || base.img;
    base.fate = card.fate;
    base.currentFate = card.currentFate;
    base.cost = card.cost;
    base.handEffectModifiers = typeof window.getHandCardEffectModifiers === 'function'
      ? window.getHandCardEffectModifiers(card)
      : [];
    base.flags = {
      faceDown:!!card.faceDown,
      immune:!!card.immuneFlag,
      markedForDeath:!!card._markedForDeath,
      noConsolidate:!!card.noConsolidate,
      xFate:!!card.xFate,
      xCost:!!card.xCost,
      pendingWhenSet:!!card._pendingWhenSetEffect,
      presentationDeparting:!!card._presentationDeparting
    };
    return base;
  }

  function getExtraRowOwner(g, z, r){
    if(r === 0) return 1;
    if(r === 1) return -1;
    if(r === 2) return 0;
    const owners = g && Array.isArray(g.extraRowOwners) && Array.isArray(g.extraRowOwners[z]) ? g.extraRowOwners[z] : null;
    if(owners && typeof owners[r - 3] === 'number') return owners[r - 3];
    const markOwner = getMarkSafeRowOwner(g, z, r);
    if(typeof markOwner === 'number') return markOwner;
    if((!owners || typeof owners[r - 3] === 'undefined') && g && g.extraRowFullOwners && typeof g.extraRowFullOwners[z] === 'number') return g.extraRowFullOwners[z];
    return 0;
  }

  function isFullExtraRow(g, z, r){
    if(r < 3) return true;
    const owners = g && Array.isArray(g.extraRowOwners) && Array.isArray(g.extraRowOwners[z]) ? g.extraRowOwners[z] : null;
    if(owners && typeof owners[r - 3] === 'number') return true;
    if(owners && owners[r - 3] === null) return false;
    if(getMarkSafeRowOwner(g, z, r) !== null) return false;
    if((!owners || typeof owners[r - 3] === 'undefined') && g && g.extraRowFullOwners && typeof g.extraRowFullOwners[z] === 'number') return true;
    return false;
  }

  function getMarkSafeRowOwner(g, z, r){
    if(!g || !Array.isArray(g.markSafeSquares)) return null;
    const mark = g.markSafeSquares.find(function(s){
      return s && s.z === z && s.r === r && typeof s.owner === 'number';
    });
    return mark ? mark.owner : null;
  }

  function isMarkSafeSquare(g, z, r, c){
    return !!(g && Array.isArray(g.markSafeSquares) && g.markSafeSquares.some(function(s){
      return s && s.z === z && s.r === r && s.c === c;
    }));
  }

  function getBlock(g, z, r, c){
    const blocks = g && Array.isArray(g.blockedCells) ? g.blockedCells : [];
    return blocks.find(function(b){ return b && b.z === z && b.r === r && b.c === c; }) || null;
  }

  function getBaseExtraCols(g, z, r){
    if(!g || !g.extraCells || !g.extraCells[z] || !g.extraCells[z][r]) return 0;
    if(r === 2) return Number(g.extraCells[z][r].p1) || 0;
    if(r === 0) return Number(g.extraCells[z][r].p2) || 0;
    return 0;
  }

  function buildBoardSnapshot(g, viewer){
    const zones = [];
    let cardCount = 0;
    const board = Array.isArray(g.board) ? g.board : [];
    for(let z = 0; z < 3; z++){
      const sourceZone = board[z] || [];
      const extraRows = Number(g.extraRows && g.extraRows[z]) || 0;
      const showMarkChoiceRow = !!(g._markSelecting && (typeof g._markSelecting.zone !== 'number' || g._markSelecting.zone === z));
      const totalRows = Math.max(sourceZone.length || 0, 3 + extraRows + (showMarkChoiceRow ? 1 : 0));
      const rows = [];
      for(let r = 0; r < totalRows; r++){
        const sourceRow = sourceZone[r] || [];
        const extraCols = r < 3 ? getBaseExtraCols(g, z, r) : 0;
        const totalCols = Math.max(sourceRow.length || 0, 3 + extraCols);
        const cells = [];
        for(let c = 0; c < totalCols; c++){
          const card = sourceRow[c] || null;
          if(card) cardCount++;
          const block = getBlock(g, z, r, c);
          cells.push({
            z,
            r,
            c,
            extra:c >= 3,
            blocked:block ? {type:block.type || 'blocked', owner:block.owner} : null,
            markSafe:isMarkSafeSquare(g, z, r, c),
            card:cardPublicState(card, viewer, {boardPos:{z,r,c}})
          });
        }
        rows.push({
          z,
          r,
          owner:getExtraRowOwner(g, z, r),
          fullExtraRow:isFullExtraRow(g, z, r),
          cells
        });
      }
      zones.push({z, rows});
    }
    return {zones, cardCount};
  }

  function buildPlayerSnapshot(g, player, viewer){
    const p = g.players && g.players[player] ? g.players[player] : {};
    const isViewer = player === viewer;
    const hand = Array.isArray(p.hand) ? p.hand : [];
    const handCards = hand.map(function(card, index){
      const revealed = isViewer || canRevealHandCard(g, card);
      return revealed
        ? Object.assign({index, revealed:true}, cardPublicState(card, viewer, {forceHidden:false}))
        : {index, revealed:false, iid:card && card.iid != null ? String(card.iid) : '', hidden:true, visual:fallbackVisual(card, true)};
    });
    return {
      index:player,
      name:p.name || ('Player ' + (player + 1)),
      color:p.color || '',
      isViewer,
      handCount:hand.length,
      hand:handCards,
      deckCount:Array.isArray(p.deck) ? p.deck.length : 0,
      discardCount:Array.isArray(p.discard) ? p.discard.length : 0,
      topDiscard:Array.isArray(p.discard) && p.discard.length
        ? cardPublicState(p.discard[p.discard.length - 1], viewer, {forceHidden:false})
        : null
    };
  }

  function buildInteractionSnapshot(g, viewer){
    const maxSupports = (Number(g.maxSupportsPerTurn) || 0) + (Number(g.extraSupportsThisTurn) || 0);
    const supportsPlaced = Number(g.supportsPlacedThisTurn) || 0;
    const majaActive = !!g.majaEffectThisTurn;
    return {
      viewer,
      currentPlayer:g.currentPlayer,
      phase:g.phase || '',
      turn:g.turn,
      turnNumber:g.turnNumber,
      maxTurns:g.maxTurns,
      placing:!!g.placing,
      selectedHandCard:g.selectedHandCard,
      selectedBoardIid:g.selectedBoardCard && g.selectedBoardCard.card ? String(g.selectedBoardCard.card.iid || '') : '',
      consolidating:!!(g._consolidating || g.consolidating),
      supportsPlacedThisTurn:supportsPlaced,
      maxSupportsThisTurn:maxSupports,
      majaEffectThisTurn:majaActive,
      supporterLimitReached:!majaActive && (g.phase || '') === 'main' && supportsPlaced >= maxSupports,
      freeSetIids:g._linaFreeIids && typeof g._linaFreeIids.forEach === 'function'
        ? Array.from(g._linaFreeIids).map(function(iid){ return String(iid); })
        : [],
      markSelecting:g._markSelecting ? clonePlain(g._markSelecting) : null,
      boardTargeting:g._boardTargeting ? clonePlain(g._boardTargeting) : null,
      moving:['_wolfCreekMoving','_expMoving','_berkeleyMoving','_bh01Moving','_landscapeMoving','_busserMoving'].some(function(k){ return !!g[k]; })
    };
  }

  function buildSnapshot(options){
    const started = nowMs();
    const g = options && options.gameState ? options.gameState : getGameState();
    if(!g || !Array.isArray(g.players) || !Array.isArray(g.board)) {
      lastSnapshot = null;
      lastReport = {
        available:false,
        reason:'game-state-unavailable',
        builds:buildCount,
        lastMs:0
      };
      return null;
    }
    const viewer = typeof (options && options.viewer) === 'number' ? options.viewer : getViewer(g);
    const board = buildBoardSnapshot(g, viewer);
    const snapshot = {
      version:SNAPSHOT_VERSION,
      createdAt:Date.now(),
      viewer,
      mode:window.FateRenderV2Flags && window.FateRenderV2Flags.getMode ? window.FateRenderV2Flags.getMode() : 'snapshot',
      interaction:buildInteractionSnapshot(g, viewer),
      landscape:{
        id:g.landscapeId || null,
        bgNum:g.landscapeBgNum || null,
        state:clonePlain(g._landscapeState)
      },
      players:[
        buildPlayerSnapshot(g, 0, viewer),
        buildPlayerSnapshot(g, 1, viewer)
      ],
      board:board.zones,
      counts:{
        boardCards:board.cardCount,
        p1Hand:g.players[0] && Array.isArray(g.players[0].hand) ? g.players[0].hand.length : 0,
        p2Hand:g.players[1] && Array.isArray(g.players[1].hand) ? g.players[1].hand.length : 0
      }
    };
    snapshot.signature = hashString(stableStringify({
      viewer:snapshot.viewer,
      interaction:snapshot.interaction,
      landscape:snapshot.landscape,
      players:snapshot.players,
      board:snapshot.board
    }));
    buildCount++;
    lastSnapshot = snapshot;
    lastReport = {
      available:true,
      version:SNAPSHOT_VERSION,
      builds:buildCount,
      signature:snapshot.signature,
      viewer,
      boardCards:board.cardCount,
      zones:snapshot.board.length,
      handCounts:[snapshot.players[0].handCount, snapshot.players[1].handCount],
      lastMs:roundMs(nowMs() - started),
      mode:snapshot.mode
    };
    return snapshot;
  }

  function getReport(){
    buildSnapshot();
    return lastReport ? Object.assign({}, lastReport) : {available:false, reason:'not-built'};
  }

  window.FateRenderSnapshot = {
    version:SNAPSHOT_VERSION,
    build:buildSnapshot,
    report:getReport,
    last:function(){ return lastSnapshot; }
  };
  window.fateBuildRenderSnapshot = buildSnapshot;
  window.fateRenderSnapshotReport = getReport;
})();
