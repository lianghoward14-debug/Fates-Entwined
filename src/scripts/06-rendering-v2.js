//  RENDER
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
let _renderGameScheduled = false;
let _renderGameDirty = null;
let _lastBoardRenderSignature = '';
let _lastHandRenderSignature = '';
let _lastOppHandRenderSignature = '';
let _lastPileRenderSignature = '';
let _lastBoardStructureSignature = '';
let _lastBoardCellSignatures = null;
let _renderCalcCache = null;
const RENDER_ALL_PARTS = Object.freeze({
  board:true,
  hand:true,
  scores:true,
  piles:true,
  oppHand:true,
  blocks:true,
  topbar:true
});
function normalizeRenderParts(parts) {
  if(!parts || parts === true || parts === 'all') return {...RENDER_ALL_PARTS};
  if(typeof parts === 'string') return {...RENDER_ALL_PARTS, [parts]:true};
  return {...parts};
}
function mergeRenderParts(a, b) {
  const out = {...(a || {})};
  Object.keys(b || {}).forEach(k=>{ if(b[k]) out[k] = true; });
  return out;
}
function invalidateRenderCaches() {
  _renderGameScheduled = false;
  _renderGameDirty = null;
  _lastBoardRenderSignature = '';
  _lastHandRenderSignature = '';
  _lastOppHandRenderSignature = '';
  _lastPileRenderSignature = '';
  _lastBoardStructureSignature = '';
  _lastBoardCellSignatures = null;
  _renderCalcCache = null;
}
window.invalidateFateRenderCaches = invalidateRenderCaches;
function replaceElementChildren(el, childOrFrag) {
  if(!el) return;
  if(typeof el.replaceChildren === 'function') el.replaceChildren(childOrFrag);
  else {
    el.innerHTML = '';
    if(childOrFrag) el.appendChild(childOrFrag);
  }
}
function isElectronCardImageRuntime() {
  try {
    return location.protocol === 'file:' || /Electron/i.test(navigator.userAgent || '') || /\belectron=1\b/i.test(location.search || '');
  } catch(e) {
    return false;
  }
}
function getRuntimeCardImageSrc(src, role) {
  if(!src) return src;
  const raw = String(src);
  const m = raw.match(/^([A-Za-z0-9_-]+)\.png$/);
  if(!m) return raw;
  if(isElectronCardImageRuntime() && (role === 'hand' || role === 'detail' || role === 'full')) return raw;
  return 'optimized/card-thumbs/' + m[1] + '.jpg';
}
function beginRenderCalculationFrame() {
  _renderCalcCache = { effectiveFate:new Map(), zoneScores:new Map(), baseScores:new Map() };
}
function getCachedEffectiveFate(card, z) {
  if(!card) return 0;
  if(!_renderCalcCache || typeof getEffectiveFate !== 'function') return getEffectiveFate(card, z);
  const key = String(z) + ':' + String(card.iid || card.id || '') + ':' + String(card.currentFate) + ':' + (card.faceDown ? 1 : 0) + ':' + (card.immuneFlag ? 1 : 0) + ':' + (card._markedForDeath ? 1 : 0) + ':' + (card.usesLeft || 0);
  if(_renderCalcCache.effectiveFate.has(key)) return _renderCalcCache.effectiveFate.get(key);
  const value = getEffectiveFate(card, z);
  _renderCalcCache.effectiveFate.set(key, value);
  return value;
}
function getCachedBaseZoneScore(z, player) {
  if(!_renderCalcCache || typeof getBaseZoneScore !== 'function') return getBaseZoneScore(z, player);
  const key = z + ':' + player;
  if(_renderCalcCache.baseScores.has(key)) return _renderCalcCache.baseScores.get(key);
  let score = 0;
  const zone = G.board?.[z] || [];
  zone.forEach((row)=> {
    if(!row) return;
    row.forEach((cell)=>{ if(cell && cell.owner === player) score += getCachedEffectiveFate(cell, z); });
  });
  const dm = G.fateModifiers?.['deterrance_z'+z] || 0;
  let deterranceOwner = -1;
  zone.forEach(row=>row && row.forEach(cell=>{ if(cell && cell.id === '36') deterranceOwner = cell.owner; }));
  if(deterranceOwner >= 0 && deterranceOwner !== player && dm < 0) score = Math.max(0, score + dm);
  _renderCalcCache.baseScores.set(key, score);
  return score;
}
function getCachedZoneScore(z, player) {
  if(!_renderCalcCache || typeof getZoneScore !== 'function') return getZoneScore(z, player);
  const key = z + ':' + player;
  if(_renderCalcCache.zoneScores.has(key)) return _renderCalcCache.zoneScores.get(key);
  let score = getCachedBaseZoneScore(z, player);
  const multiplier = typeof getPlayerZoneFateMultiplier === 'function' ? getPlayerZoneFateMultiplier(player) : 1;
  if(multiplier > 1) score = Math.ceil(score * multiplier);
  _renderCalcCache.zoneScores.set(key, score);
  return score;
}
function getBoardScrollSnapshot() {
  const board = document.getElementById('board');
  if(!board) return null;
  return { el: board, left: board.scrollLeft || 0, top: board.scrollTop || 0 };
}
function restoreBoardScrollSnapshot(snap) {
  if(!snap || !snap.el || !document.body.contains(snap.el)) return;
  snap.el.scrollLeft = snap.left;
  snap.el.scrollTop = snap.top;
}
let _zoneRowManualScroll = [false, false, false];
let _zoneRowScrollTops = [0, 0, 0];
function captureZoneRowScrollSnapshots(root) {
  const board = root || document.getElementById('board');
  if(!board) return [];
  return Array.from(board.querySelectorAll('.zone')).map(function(zoneEl, idx){
    const z = Number(zoneEl.dataset.zone || idx);
    const rows = zoneEl.querySelector('.zone-rows');
    return {
      z,
      top: rows ? rows.scrollTop || 0 : 0,
      manual: !!_zoneRowManualScroll[z]
    };
  });
}
function restoreZoneRowScrollSnapshots(root, snaps) {
  const board = root || document.getElementById('board');
  if(!board) return;
  const byZone = {};
  (snaps || []).forEach(function(snap){ if(snap) byZone[snap.z] = snap; });
  Array.from(board.querySelectorAll('.zone')).forEach(function(zoneEl, idx){
    const z = Number(zoneEl.dataset.zone || idx);
    const rows = zoneEl.querySelector('.zone-rows');
    if(!rows) return;
    const snap = byZone[z] || {};
    const top = snap.manual ? (snap.top || _zoneRowScrollTops[z] || 0) : 0;
    rows.dataset.restoringScroll = '1';
    rows.scrollTop = top;
    _zoneRowScrollTops[z] = top;
    const finish = function(){
      if(!document.body.contains(rows)) return;
      rows.scrollTop = top;
      rows.dataset.restoringScroll = '0';
    };
    if(typeof requestAnimationFrame === 'function') requestAnimationFrame(finish);
    else setTimeout(finish, 0);
  });
}
function installZoneRowScrollGuard(rowsEl, z) {
  if(!rowsEl) return;
  rowsEl.dataset.zone = z;
  rowsEl.dataset.manualScroll = _zoneRowManualScroll[z] ? '1' : '0';
  const markManual = function(){
    _zoneRowManualScroll[z] = true;
    rowsEl.dataset.manualScroll = '1';
  };
  rowsEl.addEventListener('wheel', markManual, {passive:true});
  rowsEl.addEventListener('touchmove', markManual, {passive:true});
  rowsEl.addEventListener('pointerdown', markManual, {passive:true});
  rowsEl.addEventListener('keydown', markManual, {passive:true});
  rowsEl.addEventListener('scroll', function(){
    if(rowsEl.dataset.restoringScroll === '1') return;
    _zoneRowScrollTops[z] = rowsEl.scrollTop || 0;
  }, {passive:true});
}
let _boardViewportLock = null;
function hasMarkExtraBoardGeometry() {
  if(typeof G === 'undefined' || !G) return false;
  if(Array.isArray(G.markSafeSquares) && G.markSafeSquares.length) return true;
  return Array.isArray(G.extraRows) && G.extraRows.some(v => Number(v || 0) > 0);
}
function captureBoardViewportLock() {
  const board = document.getElementById('board');
  if(!board || !hasMarkExtraBoardGeometry()) return null;
  _boardViewportLock = {
    el: board,
    left: board.scrollLeft || 0,
    top: board.scrollTop || 0,
    zoneRows: captureZoneRowScrollSnapshots(board)
  };
  return _boardViewportLock;
}
function restoreBoardViewportLockSoon() {
  const snap = _boardViewportLock;
  if(!snap || !snap.el || !document.body.contains(snap.el)) return;
  restoreBoardScrollSnapshot(snap);
  restoreZoneRowScrollSnapshots(snap.el, snap.zoneRows);
  if(typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(function(){
      restoreBoardScrollSnapshot(snap);
      restoreZoneRowScrollSnapshots(snap.el, snap.zoneRows);
      requestAnimationFrame(function(){
        restoreBoardScrollSnapshot(snap);
        restoreZoneRowScrollSnapshots(snap.el, snap.zoneRows);
      });
    });
  } else {
    setTimeout(function(){
      restoreBoardScrollSnapshot(snap);
      restoreZoneRowScrollSnapshots(snap.el, snap.zoneRows);
    }, 0);
  }
}
window.captureFateBoardViewportLock = captureBoardViewportLock;
window.restoreFateBoardViewportLockSoon = restoreBoardViewportLockSoon;
function performGameRender(parts) {
  const dirty = normalizeRenderParts(parts);
  beginRenderCalculationFrame();
  const boardScrollSnap = dirty.board ? getBoardScrollSnapshot() : null;
  if(dirty.board) {
    const nextBoardSig = getBoardRenderSignature();
    const nextStructureSig = getBoardStructureSignature();
    const nextCellSigs = collectBoardCellSignatures();
    const boardEl = document.getElementById('board');
    if(nextBoardSig !== _lastBoardRenderSignature || !boardEl || !boardEl.children.length){
      const patched = boardEl && boardEl.children.length && nextStructureSig === _lastBoardStructureSignature && _lastBoardCellSignatures
        ? patchChangedBoardCells(nextCellSigs, _lastBoardCellSignatures)
        : false;
      if(!patched) renderBoard();
      _lastBoardRenderSignature = nextBoardSig;
      _lastBoardStructureSignature = nextStructureSig;
      _lastBoardCellSignatures = nextCellSigs;
      restoreBoardScrollSnapshot(boardScrollSnap);
      if(boardScrollSnap && (boardScrollSnap.left || boardScrollSnap.top) && typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function(){ restoreBoardScrollSnapshot(boardScrollSnap); });
      }
    }
  }
  if(dirty.hand) renderHand();
  const localConsolidationActive = typeof isLocalConsolidationActive === 'function' ? isLocalConsolidationActive() : !!G._consolidating;
  // Show/hide the cancel consolidation button
  const cancelBtn = document.getElementById('cancel-consolidate-btn');
  if(cancelBtn) cancelBtn.style.display = localConsolidationActive ? '' : 'none';
  if(dirty.scores) renderZoneScores();
  if(dirty.piles) renderPiles();
  if(dirty.oppHand) renderOppHand();
  if(localConsolidationActive) highlightTributeCards();
  if(dirty.blocks && typeof refreshBlockOverlays === 'function') refreshBlockOverlays();
  if(dirty.topbar && typeof updateTopBar === 'function') updateTopBar();
  restoreBoardViewportLockSoon();
  _renderCalcCache = null;
}

function cardRenderSignature(card, z) {
  if(!card) return '0';
  let eff = '';
  try{ eff = z == null ? getLiveCardFate(card) : getCachedEffectiveFate(card, z); }catch(e){}
  return [
    card.iid, card.id, card.owner, card.type, card.rarity, card.aff,
    card.fate, card.currentFate, eff, card.faceDown ? 1 : 0,
    card.immuneFlag ? 1 : 0, card._markedForDeath ? 1 : 0,
    card.noConsolidate ? 1 : 0, card.usesLeft || 0,
    card.vigilanteUsed ? 1 : 0, card.wolfCreekUsed ? 1 : 0,
    card._expMoved ? 1 : 0, card._busserMovedThisTurn ? 1 : 0
  ].join(':');
}

function safeInteractionStateSignature(value) {
  try{
    const seen = new WeakSet();
    return JSON.stringify(value, function(key, val){
      if(key === 'card' && val && typeof val === 'object') return val.iid || val.id || 'card';
      if(val && typeof val === 'object'){
        if(seen.has(val)) return '[cycle]';
        seen.add(val);
      }
      return val;
    });
  }catch(e){
    return String(value && (value.iid || value.id || value.type || value.constructor?.name) || 'state');
  }
}

function getBoardRenderSignature() {
  if(typeof G === 'undefined' || !G) return '';
  const viewer = typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : 0;
  const parts = ['viewer', viewer, 'cur', G.currentPlayer, 'placing', G.placing ? 1 : 0, 'selH', G.selectedHandCard ?? '', 'con', G._consolidating ? 1 : 0];
  if(G.selectedBoardCard?.card) parts.push('selB', G.selectedBoardCard.card.iid);
  if(G._markSelecting) parts.push('mark', G._markSelecting.player, G._markSelecting.zone ?? '');
  ['_boardTargeting','_wolfCreekMoving','_expMoving','_berkeleyMoving','_bh01Moving','_busserMoving','_busserMovingCard'].forEach(k=>{
    if(G[k]) parts.push(k, safeInteractionStateSignature(G[k]));
  });
  parts.push('extraRows', JSON.stringify(G.extraRows || []));
  parts.push('extraCells', JSON.stringify(G.extraCells || []));
  parts.push('blocked', JSON.stringify(G.blockedCells || []));
  for(let z=0; z<3; z++){
    parts.push('z', z);
    const zone = G.board?.[z] || [];
    for(let r=0; r<zone.length; r++){
      const row = zone[r] || [];
      parts.push('r', r, 'len', row.length);
      for(let c=0; c<row.length; c++) parts.push(c, cardRenderSignature(row[c], z));
    }
  }
  return parts.join('|');
}

function getBoardStructureSignature() {
  if(typeof G === 'undefined' || !G) return '';
  const viewer = typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : 0;
  const parts = ['viewer', viewer, 'cur', G.currentPlayer, 'placing', G.placing ? 1 : 0, 'selH', G.selectedHandCard ?? '', 'con', G._consolidating ? 1 : 0];
  if(G.selectedBoardCard?.card) parts.push('selB', G.selectedBoardCard.card.iid);
  if(G._markSelecting) parts.push('mark', G._markSelecting.player, G._markSelecting.zone ?? '');
  ['_boardTargeting','_wolfCreekMoving','_expMoving','_berkeleyMoving','_bh01Moving','_busserMoving','_busserMovingCard'].forEach(k=>{
    if(G[k]) parts.push(k, safeInteractionStateSignature(G[k]));
  });
  parts.push('extraRows', JSON.stringify(G.extraRows || []));
  parts.push('extraCells', JSON.stringify(G.extraCells || []));
  parts.push('blocked', JSON.stringify(G.blockedCells || []));
  for(let z=0; z<3; z++){
    const zone = G.board?.[z] || [];
    parts.push('z', z, 'rows', zone.length);
    for(let r=0; r<zone.length; r++) parts.push('r', r, 'len', (zone[r] || []).length);
  }
  return parts.join('|');
}

function collectBoardCellSignatures() {
  const out = new Map();
  if(typeof G === 'undefined' || !G || !G.board) return out;
  for(let z=0; z<3; z++){
    const zone = G.board[z] || [];
    for(let r=0; r<zone.length; r++){
      const row = zone[r] || [];
      for(let c=0; c<row.length; c++) out.set(z + ':' + r + ':' + c, cardRenderSignature(row[c], z));
    }
  }
  return out;
}

function getHandRenderSignature() {
  if(typeof G === 'undefined' || !G) return '';
  const cp = getPerspectivePlayerIndex();
  const viewingOwn = (cp === G.currentPlayer);
  const force = G._forceHandEnterIids ? Array.from(G._forceHandEnterIids).sort().join(',') : '';
  const hand = G.players?.[cp]?.hand || [];
  return [
    cp, G.currentPlayer, G.phase, viewingOwn ? 1 : 0, G.selectedHandCard ?? '',
    G.supportsPlacedThisTurn, G.maxSupportsPerTurn, G.extraSupportsThisTurn,
    G.majaEffectThisTurn ? 1 : 0, force,
    hand.map(card=>[
      card.iid, card.id, card.owner, card.type, card.rarity, card.aff,
      card.fate, card.currentFate, card._wciBonus ? 1 : 0,
      card._handCostDelta || 0, card.guerilla_transferred ? 1 : 0
    ].join(':')).join(',')
  ].join('|');
}

function getOppHandRenderSignature() {
  if(typeof G === 'undefined' || !G) return '';
  const oppP = getPerspectiveOpponentIndex();
  const oppHand = G.players?.[oppP]?.hand || [];
  const revealed = G._revealedCards || {};
  return [oppP, oppHand.map(card=>card.iid + ':' + card.id + ':' + (revealed[card.iid] ? 1 : 0)).join(',')].join('|');
}

function renderGame(parts) {
  _renderGameDirty = mergeRenderParts(_renderGameDirty, normalizeRenderParts(parts));
  if(_renderGameScheduled) return;
  _renderGameScheduled = true;
  requestAnimationFrame(function(){
    _renderGameScheduled = false;
    const dirty = _renderGameDirty || {...RENDER_ALL_PARTS};
    _renderGameDirty = null;
    performGameRender(dirty);
  });
}
// Immediate render for critical moments (game start, turn change)
function renderGameImmediate(parts) {
  _renderGameScheduled = false;
  _renderGameDirty = null;
  performGameRender(parts);
}
function renderGameParts(parts) {
  renderGame(parts);
}

function renderPiles() {
  if(typeof G === 'undefined' || !G || !G.players) return;
  // Determine "my" and "opp" perspective (in AI mode, you're always P1)
  const myP = getPerspectivePlayerIndex();
  const oppP = getPerspectiveOpponentIndex();
  const myDeck = G.players[myP].deck.length;
  const oppDeck = G.players[oppP].deck.length;
  const myDisc = G.players[myP].discard.length;
  const oppDisc = G.players[oppP].discard.length;
  const lastDisc = G.players[myP].discard[G.players[myP].discard.length - 1];
  const nextSig = [myP, oppP, myDeck, oppDeck, myDisc, oppDisc, lastDisc && lastDisc.img || ''].join('|');
  if(nextSig === _lastPileRenderSignature) return;
  _lastPileRenderSignature = nextSig;
  const set = (id,n,slotId)=>{
    const el=document.getElementById(id);
    if(el) el.textContent=n;
    const slot=document.getElementById(slotId);
    if(slot) slot.classList.toggle('empty', n===0);
  };
  set('my-deck-count',myDeck,'my-deck');
  set('my-discard-count',myDisc,'my-discard');
  set('opp-discard-count',oppDisc,'opp-discard');
  
  // Show latest discarded card on the discard pile
  const myDiscSlot = document.querySelector('#my-discard .pile-cards');
  if(myDiscSlot) {
    if(lastDisc && lastDisc.img) {
      myDiscSlot.style.background = `url('${lastDisc.img}') center/cover no-repeat`;
    } else {
      myDiscSlot.style.background = 'linear-gradient(135deg,#1a1a2a,#0a0a12)';
    }
  }
}

function renderOppHand() {
  // Show opponent's hand — revealed cards face-up, others face-down
  const container = document.getElementById('opp-hand');
  if(!container) return;
  const nextSig = getOppHandRenderSignature();
  if(nextSig === _lastOppHandRenderSignature && container.children.length) return;
  _lastOppHandRenderSignature = nextSig;
  const oppP = getPerspectiveOpponentIndex();
  const oppHand = G.players[oppP].hand;
  const revealed = G._revealedCards || {};
  const hasRevealed = oppHand.some(c => revealed[c.iid]);
  const frag = document.createDocumentFragment();
  oppHand.forEach((card,i)=>{
    const el=document.createElement('div');
    if(revealed[card.iid]) {
      // Show face-up with card art
      el.className='opp-card-back opp-revealed';
      el.style.cssText='width:60px;height:84px;border-radius:5px;flex-shrink:0;overflow:hidden;position:relative;border:1.5px solid rgba(255,180,50,.6);box-shadow:0 3px 10px rgba(0,0,0,.6),0 0 8px rgba(255,180,50,.25);cursor:pointer;transition:transform .15s;';
      const oppImg = getRuntimeCardImageSrc(card.img, 'thumb');
      el.innerHTML=(oppImg?'<img src="'+oppImg+'" style="width:100%;height:100%;object-fit:cover;object-position:center 25%;">':'<div style="display:flex;align-items:center;justify-content:center;height:100%;background:#0a0a0f;font-size:.6rem;color:var(--dim);">'+escapeHtml(card.name)+'</div>');
      el.onclick=()=>openCardDetail(card);
      el.title=card.name+' (revealed)';
    } else {
      el.className='opp-card-back';
    }
    frag.appendChild(el);
  });
  replaceElementChildren(container, frag);
  // Make entire opponent hand area clickable to view revealed cards
  if(hasRevealed) {
    container.style.cursor = 'pointer';
    container.onclick = () => { if(typeof showRevealedHandWindow==='function') showRevealedHandWindow(oppP); };
  } else {
    container.style.cursor = '';
    container.onclick = null;
  }
  // Update label
  const lbl=document.getElementById('opp-hand-lbl');
  if(lbl) lbl.innerHTML=G.players[oppP].name+"'s Hand <span style='color:var(--dim);font-family:\"Crimson Pro\",serif;font-weight:400;font-size:.65rem;'>("+oppHand.length+")</span>";
}

// Show deck info (count + no content reveal — this is hidden info)
function showDeckInfo(player) {
  const perspectivePlayer = typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : (G && typeof G.currentPlayer === 'number' ? G.currentPlayer : 0);
  const isDevDeckOwner = isPerspectivePlayer(player) || Number(player) === Number(perspectivePlayer) || (typeof G !== 'undefined' && G && typeof G.localPlayerIndex === 'number' && Number(player) === Number(G.localPlayerIndex));
  if(typeof isHowardDevMode === 'function' && isHowardDevMode() && isDevDeckOwner){
    if(typeof window.showHowardDevDeckList === 'function'){
      window.showHowardDevDeckList(player);
      return;
    }
    const devCards = (typeof CARDS !== 'undefined' && Array.isArray(CARDS)) ? CARDS.filter(c=>c && c.id) : [];
    pickCardsVisual(devCards, {
      title:'Howard Dev Deck List',
      subtitle:'Select any card in the game to add to your hand.',
      maxCount:devCards.length,
      minCount:0,
      confirmLabel:'Add to Hand',
      viewerPlayerIndex:player,
      immediate:true
    }, function(chosen){
      (chosen || []).forEach(function(card){
        const moved = typeof createCardInstance === 'function' ? createCardInstance(card, player) : Object.assign({}, card, {owner:player, iid:'dev-' + Date.now() + '-' + Math.random().toString(36).slice(2)});
        G.players[player].hand.push(moved);
      });
      if(typeof renderGame === 'function') renderGame({hand:true, piles:true, topbar:true});
    });
    return;
  }
  const deck = G.players[player].deck;
  const hand = G.players[player].hand;
  const discard = G.players[player].discard;
  const isOwn = isPerspectivePlayer(player);
  const title = (isOwn ? 'Your' : G.players[player].name+"'s") + ' Deck';
  let boardCount = 0;
  G.board.forEach(function(zone){ zone.forEach(function(row){ if(row) row.forEach(function(cell){ if(cell && cell.owner === player) boardCount++; }); }); });
  const polishCards = isOwn ? deck.filter(c=>c.id==='28') : [];
  const polishUses = Array.isArray(G.polishArmyUses) ? (G.polishArmyUses[player]||0) : 0;
  const canSetPolish = polishCards.length>0 && !G._polishUsedThisTurn && polishUses<2 && G.phase==='main';
  let polishHtml = '';
  if(canSetPolish){
    polishHtml = '<div class="di-action-panel"><div class="di-action-title">2nd Polish-Lithuanian Army</div><div class="di-action-desc">Set directly from deck (' + (2-polishUses) + ' game use' + ((2-polishUses)!==1?'s':'') + ' left)</div><button class="btn sm pri" onclick="setPolishFromDeck()">Set from Deck</button></div>';
  }
  const totalCards = deck.length + hand.length + discard.length + boardCount;
  showModal(title,
    '<div class="di-window">'
    + '<div class="di-count-row">'
    +   '<div class="di-count-main"><span class="di-count-num">' + deck.length + '</span><span class="di-count-label">in deck</span></div>'
    +   '<div class="di-count-stats">'
    +     '<div class="di-stat"><span>' + (isOwn ? hand.length : '?') + '</span>in hand</div>'
    +     '<div class="di-stat"><span>' + boardCount + '</span>on board</div>'
    +     '<div class="di-stat"><span>' + discard.length + '</span>discarded</div>'
    +   '</div>'
    + '</div>'
    + '<div class="di-progress-wrap"><div class="di-progress-bar" style="width:' + Math.round((deck.length / Math.max(1,totalCards)) * 100) + '%"></div><div class="di-progress-label">' + deck.length + ' / ' + totalCards + ' cards remaining</div></div>'
    + (isOwn ? '<p class="di-note">Deck contents are hidden — use search effects to look through specific cards.</p>' : '<p class="di-note">Opponent deck contents are hidden.</p>')
    + polishHtml
    + '</div>',
    [{label:'Close',action:closeModal}]);
}

window.setPolishFromDeck = function() {
  const cp = G.currentPlayer;
  const deck = G.players[cp].deck;
  const idx = deck.findIndex(c=>c.id==='28');
  if(idx===-1){toast('No Polish-Lithuanian Army in deck');closeModal();return;}
  const card = deck[idx];
  deck.splice(idx,1);
  if(typeof addCardToHand==='function') addCardToHand(cp, card, { announce:false });
  else G.players[cp].hand.push(card);
  if(typeof beginImmediateFreePlacement==='function') {
    beginImmediateFreePlacement(cp, card, 'Place ' + card.name + ' for free from your deck.');
  }
  G._polishUsedThisTurn = true;
  if(!Array.isArray(G.polishArmyUses)) G.polishArmyUses = [0,0];
  G.polishArmyUses[cp] = (G.polishArmyUses[cp]||0)+1;
  closeModal();
  toast('2nd Polish-Lithuanian Army is ready to set immediately for free!');
  renderGame();
};

// Show discard pile as a grid of card images
function showDiscard(player) {
  const disc = G.players[player].discard;
  const isOwn = isPerspectivePlayer(player);
  const title = (isOwn ? 'Your' : G.players[player].name+"'s") + ' Discard Pile';
  if(disc.length===0){
    showModal(title,
      '<div style="text-align:center;padding:2rem;color:var(--dim);font-style:italic;">Discard pile is empty</div>',
      [{label:'Close',action:closeModal}]);
    return;
  }
  // Build a clean grid of discard images without hover name overlays.
  const grid = disc.map((c,i)=>`
    <div class="mc discard-card discard-card-clean" onclick="showCardFromDiscard(${player},${i})" title="${escapeHtml(c.name)}" aria-label="${escapeHtml(c.name)}" style="cursor:pointer;">
      <div class="mc-art">${c.img?`<img src="${c.img}" alt="${c.name}">`:`<span class="mc-ico">${getAffIcon(c.aff)}</span>`}</div>
      <div class="mc-fate">${c.fate}</div>
    </div>`).join('');
  showModal(title,
    `<div style="display:flex;flex-wrap:wrap;gap:.4rem;justify-content:center;max-height:65vh;overflow-y:auto;padding:.3rem;">${grid}</div>
     <p style="font-size:.75rem;color:var(--dim);text-align:center;margin-top:.5rem;">${disc.length} card${disc.length!==1?'s':''}</p>`,
    [{label:'Close',action:closeModal}]);
}

window.showCardFromDiscard = function(player, idx) {
  const c = G.players[player].discard[idx];
  if(c) openCardDetail(c);
};

function renderZoneScoreMarkup(z, s0, s1, ctrl) {
  const total = s0 + s1 || 1;
  const p1pct = Math.round((s0 / total) * 100);
  const p2pct = 100 - p1pct;
  return `<span class="zone-score p1">${s0}</span>
        <span class="zone-score-vs">vs</span>
        <span class="zone-score p2">${s1}</span>
        <span class="zone-score-bar"><span class="zone-score-bar-p1" style="width:${p1pct}%"></span><span class="zone-score-bar-p2" style="width:${p2pct}%"></span></span>`;
}

function getZoneScoreTooltip(z, s0, s1) {
  const base0 = typeof getBaseZoneScore === 'function' ? getCachedBaseZoneScore(z, 0) : s0;
  const base1 = typeof getBaseZoneScore === 'function' ? getCachedBaseZoneScore(z, 1) : s1;
  const mult0 = typeof getPlayerZoneFateMultiplier === 'function' ? getPlayerZoneFateMultiplier(0) : 1;
  const mult1 = typeof getPlayerZoneFateMultiplier === 'function' ? getPlayerZoneFateMultiplier(1) : 1;
  const fmt = typeof formatFateMultiplier === 'function' ? formatFateMultiplier : function(n){ return (Number(n) || 1) + 'x'; };
  return 'Base Fate: P1 ' + base0 + ' / P2 ' + base1 + '\n' +
    'AI Fate Bonus: P1 ' + fmt(mult0) + ' / P2 ' + fmt(mult1) + '\n' +
    'Displayed Fate: P1 ' + s0 + ' / P2 ' + s1;
}

function installBoardClickDelegation(board) {
  if(!board || board.__fateBoardClickDelegated) return;
  board.__fateBoardClickDelegated = true;
  board.addEventListener('pointerdown', function(e){
    const cell = e.target && e.target.closest ? e.target.closest('.cell[data-z][data-r][data-c]') : null;
    if(cell && board.contains(cell)) captureBoardViewportLock();
  }, {passive:true});
  board.addEventListener('click', function(e){
    const cell = e.target && e.target.closest ? e.target.closest('.cell[data-z][data-r][data-c]') : null;
    if(!cell || !board.contains(cell)) return;
    // Allow board-card clicks to pass through to clickCell when in cell-targeting modes
    // (Zoe blocking, Carolyn locking, board targeting), so occupied cells can be targeted.
    const isCellTargetingMode = (typeof G !== 'undefined' && G && (G.blockingCell || G._boardTargeting || G._consolidating));
    if(!isCellTargetingMode && e.target.closest && e.target.closest('.bc')) return;
    captureBoardViewportLock();
    clickCell(Number(cell.dataset.z), Number(cell.dataset.r), Number(cell.dataset.c));
    restoreBoardViewportLockSoon();
  });
}

function patchChangedBoardCells(nextCellSigs, prevCellSigs) {
  if(!nextCellSigs || !prevCellSigs || nextCellSigs.size !== prevCellSigs.size) return false;
  let changed = 0;
  nextCellSigs.forEach(function(sig, key){
    if(prevCellSigs.get(key) !== sig) changed++;
  });
  if(changed === 0) return true;
  if(changed > 18) return false;
  nextCellSigs.forEach(function(sig, key){
    if(prevCellSigs.get(key) === sig) return;
    const parts = key.split(':').map(Number);
    const z = parts[0], r = parts[1], c = parts[2];
    const cellEl = document.querySelector('[data-z="'+z+'"][data-r="'+r+'"][data-c="'+c+'"]');
    if(!cellEl) return;
    const card = G.board?.[z]?.[r]?.[c] || null;
    Array.from(cellEl.querySelectorAll('.bc')).forEach(el=>el.remove());
    if(card) cellEl.appendChild(createBoardCardEl(card, z, r, c));
  });
  return true;
}

function renderBoard() {
  const board = document.getElementById('board');
  if(!board || typeof G === 'undefined' || !G || !G.board) return;
  installBoardClickDelegation(board);
  const zoneRowScrollSnap = captureZoneRowScrollSnapshots(board);
  const frag = document.createDocumentFragment();
  const viewerP = typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : 0;
  const carolynBlockedCells = new Set();
  const zoeBlockedCells = new Set();
  (G.blockedCells || []).forEach(function(b){
    if(!b) return;
    const key = b.z + ':' + b.r + ':' + b.c;
    if(b.type === 'carolyn') carolynBlockedCells.add(key);
    if(b.type === 'zoe') zoeBlockedCells.add(key);
  });
  for(let z=0;z<3;z++){
    const s0=getCachedZoneScore(z,0), s1=getCachedZoneScore(z,1);
    const ctrl=s0>s1?0:s1>s0?1:-1;
    const scoreTip = escapeHtml(getZoneScoreTooltip(z, s0, s1));
    const zoneEl=document.createElement('div');
    zoneEl.className='zone'+(ctrl===0?' zone-p1':ctrl===1?' zone-p2':' zone-tied');
    zoneEl.dataset.zone=z;
    zoneEl.innerHTML=`<div class="zone-banner-over" aria-hidden="true">
      <span class="zone-hdr-ornament">◆</span><span class="zone-title">Zone ${z+1}</span><span class="zone-hdr-ornament">◆</span>
    </div>
    <div class="zone-hdr">
      <span class="zone-hdr-main"><span class="zone-hdr-ornament">◆</span><span class="zone-title">Zone ${z+1}</span><span class="zone-hdr-ornament">◆</span></span>
      <span class="zone-score-card${ctrl>=0?' ctrl':''}" data-zone="${z}" title="${scoreTip}" data-tooltip="${scoreTip}">
        ${renderZoneScoreMarkup(z,s0,s1,ctrl)}
      </span>
    </div>`;
    const rowsEl=document.createElement('div');
    rowsEl.className='zone-rows' + (((G.extraRows && G.extraRows[z]) || 0) > 0 ? ' has-extra-rows' : '');
    installZoneRowScrollGuard(rowsEl, z);
    const baseRowClasses=['p2safe','contested','p1safe'];
    const extraRowCount = (G.extraRows && G.extraRows[z]) || 0;
    const showMarkChoiceRow = !!(G._markSelecting && !(typeof isFullExtraSafeRow === 'function' && isFullExtraSafeRow(z)));
    const totalRows = 3 + Math.max(extraRowCount, showMarkChoiceRow ? 1 : 0);
    const extraRowOwner = typeof getExtraSafeRowOwner === 'function' ? getExtraSafeRowOwner(z) : 0;
    const fullExtraRow = typeof isFullExtraSafeRow === 'function' && isFullExtraSafeRow(z);
    const displayRows = viewerP === 1 ? [2,1,0] : [0,1,2];
    for(let r=3;r<totalRows;r++){
      if(extraRowOwner === viewerP) displayRows.push(r);
      else displayRows.unshift(r);
    }
    for(const r of displayRows){
      const rowEl=document.createElement('div');
      let rowLabel, rowClass;
      if(r<3){
        const rowOwner = r===0 ? 1 : (r===2 ? 0 : -1);
        rowLabel = rowOwner < 0 ? 'Contested' : (rowOwner === viewerP ? 'Your Side' : 'Opponent');
        rowClass = rowOwner < 0 ? 'contested' : (rowOwner === viewerP ? 'p1safe' : 'p2safe');
      }
      else { rowLabel=(extraRowOwner===viewerP?'Your':'Opponent')+(fullExtraRow?' Extra Safe':' Safe Square'); rowClass=extraRowOwner===viewerP?'p1safe':'p2safe'; }
      rowEl.className='brow '+rowClass;
      rowEl.innerHTML='<div class="rl">'+rowLabel+'</div>';
      const cells=document.createElement('div');
      cells.className='rcells';
      if(!G.board[z][r]) G.board[z][r]=Array(3).fill(null);
      const extraRow = r<3 ? (G.extraCells?.[z]?.[r] || null) : null;
      const extraCols = extraRow?(r===2?extraRow.p1:(r===0?extraRow.p2:0)):0;
      const totalCols = 3+extraCols;
      for(let c=0;c<totalCols;c++){
        const cellEl=document.createElement('div');
        const blockKey = z + ':' + r + ':' + c;
        const carolynBlocked = carolynBlockedCells.has(blockKey);
        const zoeBlocked = zoeBlockedCells.has(blockKey);
        cellEl.className='cell'+(carolynBlocked?' blocked':'')+(zoeBlocked?' no-consolidate':'');
        if(c>=3) cellEl.classList.add('extra-safe');
        if(r>=3 && !fullExtraRow){
          if(typeof isMarkSafeSquare === 'function' && isMarkSafeSquare(z,r,c)) cellEl.classList.add('mark-safe-square');
          else if(G._markSelecting && G._markSelecting.player === G.currentPlayer) cellEl.classList.add('mark-safe-choice');
          else cellEl.classList.add('mark-safe-inactive');
        }
        cellEl.dataset.z=z;cellEl.dataset.r=r;cellEl.dataset.c=c;
        const card=G.board[z][r][c];
        if(card){ cellEl.appendChild(createBoardCardEl(card,z,r,c)); }
        else { /* cell labels removed */ }
        cells.appendChild(cellEl);
      }
      rowEl.appendChild(cells);
      rowsEl.appendChild(rowEl);
    }
    zoneEl.appendChild(rowsEl);
    ['tl','tr','bl','br'].forEach(function(pos){
      const corner = document.createElement('span');
      corner.className = 'zone-edge-corner '+pos;
      zoneEl.appendChild(corner);
    });
    frag.appendChild(zoneEl);
  }
  replaceElementChildren(board, frag);
  restoreZoneRowScrollSnapshots(board, zoneRowScrollSnap);
  syncFloatingZoneBanners();
}

function syncFloatingZoneBanners(){
  const center = document.querySelector('#s-game .game-center');
  const board = document.getElementById('board');
  if(!center || !board) return;
  let layer = document.getElementById('zone-floating-banners');
  if(!layer){
    layer = document.createElement('div');
    layer.id = 'zone-floating-banners';
    layer.className = 'zone-floating-banners';
    center.appendChild(layer);
  }
  if(window.__fateFloatingZoneBannerRaf) cancelAnimationFrame(window.__fateFloatingZoneBannerRaf);
  window.__fateFloatingZoneBannerRaf = requestAnimationFrame(function(){
    window.__fateFloatingZoneBannerRaf = 0;
    if(!document.body.contains(layer)) return;
    const centerRect = center.getBoundingClientRect();
    const zones = Array.from(board.querySelectorAll('.zone'));
    zones.forEach(function(zoneEl, idx){
      const zoneRect = zoneEl.getBoundingClientRect();
      if(!zoneRect.width || !zoneRect.height) return;
      let banner = layer.children[idx];
      if(!banner){
        banner = document.createElement('div');
        banner.className = 'zone-floating-banner';
        banner.textContent = 'Zone ' + (idx + 1);
        layer.appendChild(banner);
      }
      banner.style.left = (zoneRect.left - centerRect.left + zoneRect.width / 2) + 'px';
      banner.style.top = (zoneRect.top - centerRect.top - 18) + 'px';
    });
    while(layer.children.length > zones.length) layer.removeChild(layer.lastElementChild);
  });
}

if(!window.__fateFloatingZoneBannerResize){
  window.__fateFloatingZoneBannerResize = true;
  window.addEventListener('resize', function(){
    if(document.getElementById('zone-floating-banners')) syncFloatingZoneBanners();
  }, {passive:true});
}

function getBoardCardPosition(card) {
  let found = null;
  if(!card) return found;
  forEachBoardCard((cell, z, r, c)=>{
    if(!found && cell && cell.iid===card.iid) found = {z, r, c};
  });
  return found;
}

function getCardVisualData(card, viewerP = getPerspectivePlayerIndex(), options = {}) {
  if(!card) return null;
  const boardPos = options.boardPos || getBoardCardPosition(card);
  const hiddenOnBoard = !!(boardPos && isFaceDownCard(card) && (options.forceBoardHidden || card.owner !== viewerP));
  if(!hiddenOnBoard){
    const handCost = typeof getDisplayedCardCost === 'function' ? getDisplayedCardCost(card) : card.cost;
    const handBonusFate = card._wciBonus ? 2 : 0;
    const liveFate = getLiveCardFate(card) + (!boardPos ? handBonusFate : 0);
    return {
      card,
      isHidden: false,
      name: card.name,
      ability: card.ability,
      effect: card.effect,
      type: card.type,
      aff: card.aff,
      fate: card.fate,
      currentFate: liveFate,
      displayFate: boardPos ? getCachedEffectiveFate(card, boardPos.z) : liveFate,
      img: getRuntimeCardImageSrc(card.img, 'detail'),
      runtimeImg: getRuntimeCardImageSrc(card.img, boardPos ? 'board' : 'hand'),
      cost: handCost,
      xCost: card.xCost
    };
  }
  return {
    card,
    isHidden: true,
    name: 'Face-Down Card',
    ability: 'Hidden',
    effect: 'This card is face down. Its effect is inactive and its Fate is not counted until it is flipped face up.',
    type: 'Face Down',
    aff: 'hidden',
    fate: 0,
    currentFate: 0,
    displayFate: '—',
    img: 'back.png',
    runtimeImg: 'back.png',
    cost: 0,
    xCost: false
  };
}


function getAffIconImageSrc(aff) {
  return (typeof AFF_ICON_IMG !== 'undefined' && AFF_ICON_IMG && AFF_ICON_IMG[aff]) ? AFF_ICON_IMG[aff] : '';
}

function getStatusEffectIcon(kind) {
  const icons = {
    buff: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M32 10v44M10 32h44" stroke-width="5"/><path d="M20 20l24 24M44 20L20 44" stroke-width="3" opacity=".35"/></g></svg>`,
    debuff: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M14 32h36" stroke-width="6"/><path d="M44 18l8 14-8 14" stroke-width="4"/></g></svg>`,
    protection: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 8l18 8v14c0 12-7.2 20.4-18 26-10.8-5.6-18-14-18-26V16l18-8z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M24 32l5 5 11-12" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    movement: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 32h36"/><path d="M34 18l14 14-14 14"/><circle cx="14" cy="32" r="6"/></g></svg>`,
    movement_debuff: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 32h28" opacity=".45"/><path d="M56 14L14 56"/><circle cx="18" cy="32" r="6"/><path d="M34 18l14 14-14 14" opacity=".45"/></g></svg>`,
    zone_lock: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"><rect x="12" y="18" width="40" height="34" rx="5"/><path d="M22 18v-4a10 10 0 0 1 20 0v4"/><circle cx="32" cy="35" r="4"/><path d="M32 39v7" stroke-linecap="round"/></g></svg>`,
    scout: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><circle cx="28" cy="28" r="12"/><path d="M37 37l13 13"/><path d="M28 22v12M22 28h12" opacity=".7"/></g></svg>`,
    unlimited: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M9 37c4-9 10-13 16-13 8 0 10 8 16 8 4 0 8-2 14-9" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 27c4 9 10 13 16 13 8 0 10-8 16-8 4 0 8 2 14 9" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    ready: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><circle cx="32" cy="32" r="20"/><path d="M32 20v14l9 6"/><path d="M48 16l4-4"/></g></svg>`,
    erbs_ready: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M24 31c-6-6-6-15 0-21 6-6 16-6 22 0l4 4" stroke-width="4.2"/><path d="M40 33c6 6 6 15 0 21-6 6-16 6-22 0l-4-4" stroke-width="4.2"/><path d="M23 42L42 23" stroke-width="5"/><path d="M18 20l-5-5M46 49l5 5" stroke-width="2.8" opacity=".48"/></g></svg>`,
    affiliation_buff: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><circle cx="32" cy="32" r="18"/><path d="M32 18v28M18 32h28"/><path d="M20 20l8 8M44 20l-8 8" opacity=".35"/></g></svg>`,
    selva: `<svg viewBox="0 0 64 64" aria-hidden="true"><g stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M13 44c6-4 12-6 19-6s13 2 19 6" fill="none" stroke-width="4.5"/><path d="M14 51c6 2 12 2 18 0s12-2 18 0" fill="none" stroke-width="3" opacity=".55"/><path d="M32 15v28" fill="none" stroke-width="4"/><path d="M30 18c-7 3-12 9-15 18h15V18z" fill="currentColor" stroke="none"/><path d="M36 20c6 4 10 9 12 16H36V20z" fill="currentColor" stroke="none" opacity=".62"/><circle cx="48" cy="16" r="4" fill="currentColor" stroke="none" opacity=".75"/></g></svg>`,
    guerilla: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M16 27h28l7 4-7 4H16z" stroke-width="2.8"/><path d="M16 28l-6-4v13l6-4" stroke-width="2.6"/><path d="M46 31h9" stroke-width="2.6"/><path d="M24 23h17" stroke-width="2.4"/><path d="M30 36h7l-2 10h-9z" stroke-width="2.6"/><path d="M40 36l7 8" stroke-width="2.6"/><circle cx="24" cy="31" r="1.8" stroke-width="2.4"/></g></svg>`,
    lydia: `<svg class="lydia-berknomaly-icon" viewBox="0 0 64 64" aria-hidden="true"><g transform="translate(32 27) scale(.48)" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M-45 11C-37-31-8-47 0-47C8-47 37-31 45 11" stroke-width="7.5"/><path d="M-30 32L-47 50L-30 67" stroke-width="7.5"/><path d="M30 32L47 50L30 67" stroke-width="7.5"/><path d="M-17 5L0-14L17 5L0 24Z" stroke-width="6"/><path d="M0 31V76" stroke-width="7.5"/></g></svg>`
  };
  return icons[kind] || icons.buff;
}

function renderAffBadgeHTML(aff, extraClass) {
  if(!aff || aff === 'hidden') return '';
  const label = (typeof AFF_LABEL !== 'undefined' && AFF_LABEL[aff]) ? AFF_LABEL[aff] : aff;
  const classes = String(extraClass || '');
  const isEffectBadge = classes.indexOf('aff-effect-badge') >= 0;
  const src = isEffectBadge ? '' : getAffIconImageSrc(aff);
  const svg = typeof getAffIcon === 'function' ? getAffIcon(aff) : '';
  const icon = src
    ? '<img src="' + src + '" alt="' + escapePlacementAnimHtml(label) + '" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">'
    : '';
  return '<div class="aff-badge ' + classes + ' aff-' + String(aff).replace(/[^a-z0-9_-]/gi,'') + '" title="' + escapePlacementAnimHtml(label) + '">' +
    icon + '<span class="aff-badge-fallback" style="' + (src ? 'display:none;' : 'display:flex;') + '">' + svg + '</span>' +
    '</div>';
}

function escapePlacementAnimHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
  });
}

function ensurePlacementAnimationLayer() {
  let layer = document.getElementById('placement-anim-layer');
  if(layer) return layer;
  const center = document.querySelector('#s-game .game-center');
  if(!center) return null;
  layer = document.createElement('div');
  layer.id = 'placement-anim-layer';
  center.appendChild(layer);
  return layer;
}

function playPlacementAnimation(card, z, r, c) {
  if(!card || z == null || r == null || c == null) return 0;
  const layer = ensurePlacementAnimationLayer();
  if(!layer) return 0;

  const rarity = card.rarity || 'circle';
  const ms = typeof getPlacementAnimationDurationMs === 'function' ? getPlacementAnimationDurationMs(card) : 560;
  const maxAttempts = 10;

  function draw(attempt) {
    if(!document.body.contains(layer)) return;
    const cellEl = document.querySelector('#board .cell[data-z="'+z+'"][data-r="'+r+'"][data-c="'+c+'"]');
    if(!cellEl || !cellEl.isConnected) {
      if(attempt < maxAttempts) requestAnimationFrame(function(){ draw(attempt + 1); });
      return;
    }

    const cellRect = cellEl.getBoundingClientRect();
    const layerRect = layer.getBoundingClientRect();
    if(cellRect.width <= 0 || cellRect.height <= 0 || layerRect.width <= 0 || layerRect.height <= 0) {
      if(attempt < maxAttempts) requestAnimationFrame(function(){ draw(attempt + 1); });
      return;
    }

    const viewerP = typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : 0;
    const visual = typeof getCardVisualData === 'function'
      ? getCardVisualData(card, viewerP, {forceBoardHidden:true, boardPos:{z,r,c}})
      : null;
    const name = escapePlacementAnimHtml((visual && visual.name) || card.name || '');
    const fate = escapePlacementAnimHtml((visual && visual.displayFate != null) ? visual.displayFate : (card.currentFate || card.fate || ''));
    const aff = visual && visual.aff ? visual.aff : card.aff;
    const icon = typeof getAffIcon === 'function' ? getAffIcon(aff) : '';
    const img = visual && (visual.runtimeImg || visual.img) ? escapePlacementAnimHtml(visual.runtimeImg || visual.img) : '';

    const ghost = document.createElement('div');
    ghost.className = 'placement-anim-ghost place-anim-' + rarity + ' own-' + (card.owner === 0 ? 'p1' : 'p2');
    ghost.dataset.iid = String(card.iid || '');
    ghost.style.left = (cellRect.left - layerRect.left) + 'px';
    ghost.style.top = (cellRect.top - layerRect.top) + 'px';
    ghost.style.width = cellRect.width + 'px';
    ghost.style.height = cellRect.height + 'px';
    ghost.innerHTML = '<div class="placement-anim-card rarity-' + rarity + '">' +
      '<div class="placement-anim-art">' +
        (img ? '<img src="' + img + '" alt="">' : '<span class="placement-anim-icon">' + icon + '</span>') +
      '</div>' +
      '<div class="placement-anim-fate">' + fate + '</div>' +
      '<div class="placement-anim-name">' + name + '</div>' +
    '</div>';

    layer.appendChild(ghost);
    const removeGhost = function(){ if(ghost.parentNode) ghost.remove(); };
    ghost.addEventListener('animationend', removeGhost, {once:true});
    setTimeout(removeGhost, ms + 220);
  }

  requestAnimationFrame(function(){
    requestAnimationFrame(function(){ draw(0); });
  });
  return ms;
}

function createBoardCardEl(card, z, r, c) {
  const el=document.createElement('div');
  const rarity = card.rarity || 'circle';
  const perspectivePlayer = getPerspectivePlayerIndex();
  const visual = getCardVisualData(card, perspectivePlayer, {forceBoardHidden:true, boardPos:{z,r,c}});
  const isHidden = !!visual?.isHidden;
  el.dataset.owner=String(card.owner);
  // Check if this card is suppressed by reaction effects.
  const isSuppressedBySecules = card.type==='Coordinator' && typeof isCoordinatorSuppressedAt==='function' && isCoordinatorSuppressedAt(z,r,c);
  const isSuppressedByLydia = card.type==='Supporter' && (card._lydiaSuppressed || card._reactionSuppressed);
  const isSuppressed = isSuppressedBySecules || isSuppressedByLydia;
  el.className='bc own-'+(card.owner===0?'p1':'p2')
    +(card.immuneFlag?' immune':'')
    +(card.type==='Supporter'?' supporter-card':'')
    +(rarity==='star'?' star-card':'')
    +(rarity==='square'?' square-card':'')
    +(card.owner!==perspectivePlayer?' opponent-card':'')
    +(isSuppressed?' fate-suppressed':'');
  if(G.selectedBoardCard&&G.selectedBoardCard.card.iid===card.iid) el.classList.add('sel');
  const eff=isHidden ? 0 : getCachedEffectiveFate(card,z);
  // Determine buff/debuff state — compare effective fate vs base (printed) fate
  const baseFate = card.fate;
  let fateStateCls = '';
  if(!isHidden){
    if(eff > baseFate) fateStateCls = ' buffed';
    else if(eff < baseFate) fateStateCls = ' debuffed';
  }
  // Track prior effective fate to pulse on change
  if(!G._cardFateMap) G._cardFateMap = {};
  const prev = G._cardFateMap[card.iid];
  const changed = !isHidden && prev!==undefined && prev!==eff;
  const delta = changed ? (eff - prev) : 0;
  G._cardFateMap[card.iid] = eff;
  // Mark Menz still changes affiliation, but no longer renders a persistent icon badge.
  const affBadge = '';
  if(card._markedForDeath) el.classList.add('vigilante-muted'); else el.classList.remove('vigilante-muted');
  el.innerHTML=`
    <div class="bc-art">${visual.runtimeImg?`<img src="${visual.runtimeImg}" alt="${visual.name}" decoding="async" loading="eager" onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='';">`:''}<span class="bc-ico" style="${visual.runtimeImg?'display:none':''}">${getAffIcon(visual.aff)}</span></div>
    ${affBadge}
    <div class="bc-fate${fateStateCls}${changed?' pulse':''}">${visual.displayFate}</div>`;
  // Spawn mini floater on the card if fate changed
  if(changed){
    // Trigger damage/buff visual + sfx
    if(delta<0){
      el.classList.add('shake-damage');
      playSfx('debuff');
    } else if(delta>0){
      playSfx('buff');
    }
    setTimeout(()=>{el.classList.remove('shake-damage');},360);
    setTimeout(()=>{
      const f = document.createElement('div');
      f.className = 'card-fate-floater '+(delta>0?'up':'down');
      f.textContent = (delta>0?'+':'')+delta;
      el.appendChild(f);
      setTimeout(()=>f.remove(), 1400);
    },0);
  }
  el.onclick=(e)=>{
    e.stopPropagation();
    captureBoardViewportLock();
    // If consolidation is active, route to consolidation handler
    if(G._consolidating){
      clickCell(z,r,c);
      restoreBoardViewportLockSoon();
      return;
    }
    activateBoardCard(card,z,r,c);
    restoreBoardViewportLockSoon();
  };
  return el;
}

function renderHand() {
  const cp = getPerspectivePlayerIndex();
  const viewingOwn = (cp === G.currentPlayer);
  const hand = G.players[cp].hand;
  const hc = document.getElementById('hand-cards');
  if(!hc) return;
  const nextSig = getHandRenderSignature();
  if(nextSig === _lastHandRenderSignature && hc.children.length) return;
  _lastHandRenderSignature = nextSig;
  const frag = document.createDocumentFragment();
  hand.forEach((card,i)=>{
    const el=document.createElement('div');
    const canPlay = viewingOwn && canPlayCard(card);
    const forceEnter = !!(G._forceHandEnterIids && G._forceHandEnterIids.has(card.iid));
    const isNew = forceEnter || !G._seenHandIids || !G._seenHandIids.has(card.iid);
    if(!G._seenHandIids) G._seenHandIids = new Set();
    G._seenHandIids.add(card.iid);
    if(forceEnter) G._forceHandEnterIids.delete(card.iid);
    el.className='hc'+(G.selectedHandCard===i && viewingOwn?' sel':'')+(canPlay?'':' dim')+(isNew?' hc-entering':'')+(card.rarity==='star'?' star-card':'')+(card.rarity==='square'?' square-card':'');
    el.dataset.iid = String(card.iid);
    if(isNew){ el.addEventListener('animationend',function(){el.classList.remove('hc-entering');},{once:true}); }
    const fate = getLiveCardFate(card);
    el.innerHTML=`
      <div class="bc-art">${card.img?`<img src="${getRuntimeCardImageSrc(card.img, 'hand')}" alt="${card.name}" decoding="async" loading="eager" onerror="this.onerror=null;this.src=this.getAttribute('src');">`:''}<span class="bc-ico" style="${card.img?'display:none':''}">${getAffIcon(card.aff)}</span></div>
      <div class="bc-fate">${fate}</div>
      <div class="bc-name">${card.name}</div>`;
    frag.appendChild(el);
  });
  replaceElementChildren(hc, frag);
  const countEl = document.getElementById('hand-count');
  if(countEl) countEl.textContent=`(${hand.length})`;
  const lblEl = document.getElementById('hand-lbl');
  if(lblEl) {
    const nameStr = viewingOwn ? G.players[cp].name+'\'s Hand' : G.players[cp].name+'\'s Hand (AI thinking)';
    const countSpan = countEl ? countEl.outerHTML : '';
    lblEl.innerHTML = nameStr + ' ' + countSpan;
  }
}

function canPlayCard(card) {
  if(G.phase!=='main') return false;
  if(card && card.id==='70' && card.guerilla_transferred) return false;
  // Lina free-set: always playable
  if(G._linaFreeIids && G._linaFreeIids.has(card.iid)) return true;
  if(card.type==='Supporter') {
    const max=G.maxSupportsPerTurn+G.extraSupportsThisTurn;
    if(!G.majaEffectThisTurn && G.supportsPlacedThisTurn>=max) return false;
  }
  return true;
}

function renderZoneScores() {
  const zs=document.getElementById('zscore');
  if(zs) zs.innerHTML='';
  if(!G._prevZoneScores) G._prevZoneScores = {};
  for(let z=0;z<3;z++){
    const s0=getCachedZoneScore(z,0),s1=getCachedZoneScore(z,1);
    const ctrl=s0>s1?0:s1>s0?1:-1;
    const el=document.querySelector('.zone[data-zone="'+z+'"] .zone-score-card');
    const zoneEl=document.querySelector('.zone[data-zone="'+z+'"]');
    if(el){
      el.className='zone-score-card'+(ctrl>=0?' ctrl':'');
      const scoreTip = getZoneScoreTooltip(z, s0, s1);
      el.title = scoreTip;
      el.dataset.tooltip = scoreTip;
      el.innerHTML=renderZoneScoreMarkup(z,s0,s1,ctrl);
    }
    if(zoneEl){
      zoneEl.classList.toggle('zone-p1', ctrl===0);
      zoneEl.classList.toggle('zone-p2', ctrl===1);
      zoneEl.classList.toggle('zone-tied', ctrl<0);
    }
    // Check for control change
    if(!G._prevZoneCtrl) G._prevZoneCtrl = {};
    const prevCtrl = G._prevZoneCtrl[z];
    if(prevCtrl !== undefined && prevCtrl !== ctrl && ctrl >= 0){
      // Control just gained — trigger flash
      if(el){
        el.classList.add('control-gained');
        setTimeout(()=>el.classList.remove('control-gained'), 1000);
      }
    }
    G._prevZoneCtrl[z] = ctrl;
    // Check for change vs previous
    const prev0 = G._prevZoneScores['z'+z+'_0'];
    const prev1 = G._prevZoneScores['z'+z+'_1'];
    if(el && prev0!==undefined && prev0!==s0){
      const delta = s0 - prev0;
      spawnFloater(el, delta, 'p1');
    }
    if(el && prev1!==undefined && prev1!==s1){
      const delta = s1 - prev1;
      spawnFloater(el, delta, 'p2');
    }
    G._prevZoneScores['z'+z+'_0']=s0;
    G._prevZoneScores['z'+z+'_1']=s1;
  }
}

function spawnFloater(parentEl, delta, color){
  if(delta===0) return;
  const f = document.createElement('div');
  f.className='fate-floater '+(color||'');
  f.textContent = (delta>0?'+':'')+delta;
  const rect = parentEl.getBoundingClientRect();
  f.style.position = 'fixed';
  f.style.left = (rect.left + rect.width / 2) + 'px';
  f.style.top = (rect.top + rect.height / 2) + 'px';
  f.style.zIndex = '9999';
  document.body.appendChild(f);
  setTimeout(()=>f.remove(), 1600);
}

function updateTopBar() {
  const cp=G.currentPlayer;
  const isAITurn = G.aiEnabled && (G.currentPlayer===G.aiPlayer || G._aiRunning);
  const perspectivePlayer = typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : 0;
  const isOwnTurn = cp === perspectivePlayer;
  const gameScreen = document.getElementById('s-game');
  if(gameScreen){
    gameScreen.classList.toggle('ai-turn', isAITurn);
    gameScreen.classList.toggle('human-turn', !isAITurn);
    gameScreen.classList.toggle('own-turn', isOwnTurn);
    gameScreen.classList.toggle('opponent-turn', !isOwnTurn);
  }
  const curEl = document.getElementById('tp-cur');
  if(curEl) {
    const displayName = isOwnTurn ? (G.players[cp].name || 'Player') : 'Opponent';
    const turnText = "Turn "+G.turn+"/"+G.maxTurns+" - "+displayName+"'s Turn";
    curEl.textContent = turnText;
    curEl.classList.toggle('turn-title-long', turnText.length > 34);
    curEl.classList.toggle('turn-title-xlong', turnText.length > 46);
  }
  const hudTurn = document.getElementById('turn-hud-turn');
  if(hudTurn) hudTurn.textContent = 'Turn '+G.turn+'/'+G.maxTurns;
  const hudPlayer = document.getElementById('turn-hud-player');
  if(hudPlayer) hudPlayer.textContent = isOwnTurn ? "It's Your Turn!" : "Opponent's Turn";
  const phaseEl = document.getElementById('tp-phase');
  if(phaseEl) phaseEl.textContent='';
  const endBtn = document.getElementById('btn-end-turn');
  if(endBtn){
    endBtn.disabled = isAITurn;
    endBtn.textContent = isAITurn ? 'AI Thinking...' : 'End Turn';
  }
  updatePlayerBanners();
  normalizeActionBarLayout();
  renderTopbarEffects();
}


function showRiveraStatusBanner(aff, turnsLeft, owner) {
  const existing = document.getElementById('rivera-status-banner');
  if(existing) existing.remove();
  return; // Rivera should use only the existing golden topbar status pill.
}


function showBerkeleyStatusBanner(zone, owner) {
  // No floating popup; Berkeley is represented by the existing topbar status pill.
}

function showBusserStatusBanner(card, moves, owner) {
  const turns = Math.max(0, Number(moves) || 0);
  const effectCard = (typeof CARDS !== 'undefined' && Array.isArray(CARDS)) ? CARDS.find(c => c.id === '69') : null;
  const name = card && card.name ? card.name : 'Selected card';
  if(typeof renderTopbarEffects === 'function') renderTopbarEffects();
  if(typeof toast === 'function') toast(name + ' can move to adjacent zones' + (turns ? ' (' + turns + ' moves)' : '') + '.');
  try {
    window.__fateLastBusserStatusBanner = {
      cardName:name,
      cardId:String(card && card.id || ''),
      sourceName:effectCard ? effectCard.name : 'Breakfast Republic Busser',
      moves:turns,
      owner:coerceStatusOwner(owner, typeof G !== 'undefined' && G ? G.currentPlayer : 0),
      at:Date.now()
    };
  } catch(e) {}
}

function coerceStatusOwner(value, fallback) {
  const num = Number(value);
  if(Number.isFinite(num) && (num === 0 || num === 1)) return num;
  return fallback;
}

let _topbarEffectsLastHtml = '';
function renderTopbarEffects() {
  const bar = document.getElementById('topbar-effects');
  const leftBar = document.getElementById('tp-status-left');
  const rightBar = document.getElementById('tp-status-right');
  const statusDock = document.getElementById('game-status-dock');
  const statusLeft = document.getElementById('game-status-left');
  const statusRight = document.getElementById('game-status-right');
  // Clear old central effects bar; effects now live in left/right.
  if(bar) bar.innerHTML = '';

  if(!leftBar || !rightBar) return;

  // Determine who "I" am and who the opponent is
  const myP = getPerspectivePlayerIndex();
  const oppP = 1 - myP;

  // Collect all active effects with ownership
  if(typeof normalizeRiveraEffects === 'function') normalizeRiveraEffects();
  const allEffects = [];

  // Suppression — applied BY suppressor TO suppressTarget
  if(G.oppSuppressedNextTurn && G.suppressTarget !== undefined) {
    const appliedBy = (G.suppressTarget === oppP) ? myP : oppP;
    const card = CARDS.find(c=>c.id==='18');
    allEffects.push({
      icon: getStatusEffectIcon('debuff'), label: 'Suppressed',
      cardName: card ? card.name : '1st US Marines',
      cardAbility: card ? card.ability : 'Semper Fidelis',
      cardEffect: card ? card.effect : 'Opponent cannot activate supporter when-set effects next turn.',
      owner: appliedBy
    });
  }

  // Blocked cells — determine owner from the card that caused each block
  if(G.blockedCells && G.blockedCells.length > 0) {
    const carolynBlocks = G.blockedCells.filter(b => b.type === 'carolyn');
    const zoeBlocks = G.blockedCells.filter(b => b.type === 'zoe');
    if(carolynBlocks.length > 0) {
      let cOwner = typeof carolynBlocks[0].owner === 'number' ? carolynBlocks[0].owner : oppP;
      const card = CARDS.find(c => c.id === '17');
      allEffects.push({
        icon: getStatusEffectIcon('zone_lock'), label: carolynBlocks.length + ' Locked',
        cardName: card ? card.name : 'Carolyn',
        cardAbility: card ? card.ability : '',
        cardEffect: card ? card.effect : 'Permanently locked cells. No cards can be placed there.',
        owner: cOwner
      });
    }
    if(zoeBlocks.length > 0) {
      let zOwner = typeof zoeBlocks[0].owner === 'number' ? zoeBlocks[0].owner : oppP;
      const card = CARDS.find(c => c.id === '04');
      allEffects.push({
        icon: getStatusEffectIcon('debuff'), label: zoeBlocks.length + ' Blocked',
        cardName: card ? card.name : 'Zoe',
        cardAbility: card ? card.ability : 'INTJ Stare',
        cardEffect: card ? card.effect : 'Consolidation blocked on these cells.',
        owner: zOwner
      });
    }
  }

  // WCI Bonus — benefits the player who placed it (current player context)
  if(G._westCaribNext) {
    const card = CARDS.find(c => c.id === '33');
    const wciOwner = typeof G._westCaribNext === 'object' && typeof G._westCaribNext.owner === 'number' ? G._westCaribNext.owner : myP;
    allEffects.push({
      icon: getStatusEffectIcon('buff'), label: 'WCI Bonus',
      cardName: card ? card.name : 'West Caribbea Infantry',
      cardAbility: card ? card.ability : '',
      cardEffect: card ? card.effect : 'Next character added to your hand costs 1 less Reinforcement and gains 2 Fate.',
      owner: wciOwner
    });
  }

  const wineCountryCard = CARDS.find(c => c.id === '70');
  if(G && Array.isArray(G.players)) {
    G.players.forEach(function(player, holder){
      const hand = player && Array.isArray(player.hand) ? player.hand : [];
      const infiltrators = hand.filter(function(c){
        return c && String(c.id) === '70' && c.guerilla_transferred && (Number(c.guerilla_turnsLeft) || 0) > 0;
      });
      if(!infiltrators.length) return;
      const turns = Math.max(0, Math.max.apply(null, infiltrators.map(function(c){ return Number(c.guerilla_turnsLeft) || 0; })));
      const count = infiltrators.length;
      const sourceOwner = coerceStatusOwner(infiltrators[0].guerilla_owner, 1 - holder);
      allEffects.push({
        icon:getStatusEffectIcon('guerilla'),
        label:'A Gun Behind Every Grapevine',
        cardName:wineCountryCard ? wineCountryCard.name : 'Wine Country Guerilla',
        cardAbility:wineCountryCard ? wineCountryCard.ability : 'A Gun Behind Every Grapevine',
        cardEffect:'Wine Country Guerilla is infiltrating the opposing hand. At the start of that opponent\'s turn, it reduces a random eligible card in their hand by 2 Fate. ' + turns + ' turn' + (turns === 1 ? '' : 's') + ' remaining.',
        owner:sourceOwner,
        extraClass:'effect-pill-guerilla',
        turnsLeft:turns
      });
    });
  }

  const shieldWallOwnerCounts = {};
  forEachBoardCard(c => {
    if(c.id === '20' && !isFaceDownCard(c)) shieldWallOwnerCounts[c.owner] = (shieldWallOwnerCounts[c.owner] || 0) + 1;
  });
  if(Object.keys(shieldWallOwnerCounts).length){
    const swCard = CARDS.find(c => c.id === '20');
    Object.entries(shieldWallOwnerCounts).forEach(([owner, count]) => {
      allEffects.push({
        icon: getStatusEffectIcon('protection'),
        label: count + ' Shield Wall',
        cardName: swCard ? swCard.name : 'South Wind Spearman',
        cardAbility: swCard ? swCard.ability : 'Shield Wall',
        cardEffect: swCard ? swCard.effect : 'Cards in this zone cannot have their Fate reduced and cannot be moved while this card remains on the field.',
        owner: Number(owner)
      });
    });
  }

  // Maja unlimited supporters
  if(G.majaEffectThisTurn) {
    let majaOwner = myP;
    forEachBoardCard(c => { if(c.id === '07') majaOwner = c.owner; });
    const card = CARDS.find(c => c.id === '07');
    allEffects.push({
      icon: getStatusEffectIcon('unlimited'), label: 'Unlimited',
      cardName: card ? card.name : 'Maja Kaminska',
      cardAbility: card ? card.ability : '',
      cardEffect: card ? card.effect : 'Unlimited supporters this turn.',
      owner: majaOwner
    });
  }

  // Fort Calvin Watcher — reveals opponent's next draws
  if(G._fortCalvinActive && G._fortCalvinActive.length > 0) {
    G._fortCalvinActive.filter(w => w.remaining > 0).forEach(w => {
      const card = CARDS.find(c => c.id === '71');
      allEffects.push({
        icon: getStatusEffectIcon('scout'), label: 'Scouting',
        cardName: card ? card.name : 'Fort Calvin Watcher',
        cardAbility: card ? card.ability : 'All Eyes on the I-15',
        cardEffect: card ? card.effect : 'Next ' + w.remaining + ' opponent draw-phase cards will be revealed.',
        owner: w.owner
      });
    });
  }

  // Artillery Lock — Berkeley CS Major zone lock
  if(typeof G._artilleryLockedZone === 'number' && G._artilleryLockTurnsLeft > 0) {
    const sourceOwner = 1 - G._artilleryLockOwner;
    const card = CARDS.find(c => c.id === '50');
    allEffects.push({
      icon: getStatusEffectIcon('zone_lock'), label: 'Berkeley: Zone ' + (G._artilleryLockedZone + 1),
      cardName: card ? card.name : 'Berkeley CS Major',
      cardAbility: card ? card.ability : 'Artillery Distance',
      cardEffect: 'Zone ' + (G._artilleryLockedZone + 1) + ' is locked for opponent\'s next turn.',
      owner: sourceOwner,
      extraClass: 'effect-pill-berkeley',
      turnsLeft: G._artilleryLockTurnsLeft
    });
  }

  // Christopher Erbs — waiting for next draw
  if(G.erbsActive) {
    for(let p = 0; p < 2; p++) {
      if(G.erbsActive[p]) {
        const card = CARDS.find(c => c.id === '40');
        allEffects.push({
          icon: getStatusEffectIcon('erbs_ready'), label: 'Erbs Ready',
          cardName: card ? card.name : 'Christopher Erbs',
          cardAbility: card ? card.ability : 'Hard Times, Strong Men',
          cardEffect: card ? card.effect : 'Waiting — will activate on next draw phase.',
          owner: p
        });
      }
    }
  }

  // Rivera — 3 of owner's turns affiliation buff
  if(G._riveraActiveEffects) {
    Object.keys(G._riveraActiveEffects).forEach(iid => {
      const eff = G._riveraActiveEffects[iid];
      if(eff && eff.turnsLeft > 0) {
        const card = CARDS.find(c => c.id === '51');
        const affLabel = AFF_LABEL[eff.aff] || eff.aff;
        allEffects.push({
          icon: getStatusEffectIcon('affiliation_buff'),
          label: 'Rivera: ' + affLabel + ' chars +4',
          cardName: card ? card.name : 'Rivera',
          cardAbility: card ? card.ability : 'Jorge\'s Right Hand Man',
          cardEffect: 'Character cards you set with ' + affLabel + ' gain 3 Fate. ' + eff.turnsLeft + ' of your turns remaining.',
          owner: coerceStatusOwner(eff.owner, myP),
          extraClass: 'effect-pill-rivera aff-' + String(eff.aff || '').replace(/[^a-z0-9_-]/gi,''),
          turnsLeft: eff.turnsLeft
        });
      }
    });
  }

  const busserMovesByOwner = {0:0, 1:0};
  if(typeof forEachBoardCard === 'function') {
    forEachBoardCard(function(c){
      if(!c || isFaceDownCard(c) || c.cantBeMoved || c.immuneFlag || String(c.id || '') === '76') return;
      const moves = Math.max(0, Number(c._busserMoves || 0) || 0);
      if(moves <= 0) return;
      const owner = coerceStatusOwner(c._busserOwner == null ? c.owner : c._busserOwner, c.owner);
      busserMovesByOwner[owner] = (Number(busserMovesByOwner[owner]) || 0) + moves;
    });
  }
  const busserCard = CARDS.find(c => c.id === '69');
  [0,1].forEach(function(owner){
    const moves = Math.max(0, Number(busserMovesByOwner[owner]) || 0);
    if(!moves) return;
    allEffects.push({
      icon: getStatusEffectIcon('movement'),
      label: busserCard ? busserCard.ability : 'Corner! Behind!',
      cardName: busserCard ? busserCard.name : 'Breakfast Republic Busser',
      cardAbility: busserCard ? busserCard.ability : 'Corner! Behind!',
      cardEffect: 'Friendly cards have ' + moves + ' Busser movement ' + (moves === 1 ? 'use' : 'uses') + ' remaining.',
      owner: owner,
      extraClass: 'effect-pill-busser',
      turnsLeft: moves
    });
  });

  // Split effects by ownership
  const myEffects = allEffects.filter(e => coerceStatusOwner(e.owner, myP) === myP);
  const oppEffects = allEffects.filter(e => coerceStatusOwner(e.owner, oppP) === oppP);

  function buildBannerHTML(effects, side) {
    if(effects.length === 0) return '';
    return effects.map(e => {
      const sideClass = side === 'left' ? 'effect-pill-mine' : 'effect-pill-opp';
      const extraClass = e.extraClass ? ' ' + e.extraClass : '';
      return '<div class="effect-pill ' + sideClass + extraClass + '">' +
        '<span class="effect-pill-icon">' + e.icon + '</span>' +
        '<span class="effect-pill-label">' + e.label + '</span>' +
        '<div class="effect-pill-tooltip">' +
          '<div class="ept-header">' +
            '<span class="ept-name">' + escapeHtml(e.cardName) + '</span>' +
            (e.cardAbility ? '<span class="ept-ability">' + escapeHtml(e.cardAbility) + '</span>' : '') +
          '</div>' +
          '<div class="ept-effect">' + escapeHtml(e.cardEffect) + '</div>' +
          '<div class="ept-owner">' + (side === 'left' ? 'Your effect' : "Opponent's effect") + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  const myHtml = buildBannerHTML(myEffects, 'left');
  const oppHtml = buildBannerHTML(oppEffects, 'right');
  const nextHtml = myHtml + '::' + oppHtml;
  if(_topbarEffectsLastHtml === nextHtml && leftBar.innerHTML === myHtml && rightBar.innerHTML === oppHtml) {
    return;
  }
  _topbarEffectsLastHtml = nextHtml;
  leftBar.innerHTML = myHtml;
  rightBar.innerHTML = oppHtml;


  // Position tooltips directly below each pill on hover using fixed position
  function attachTooltipPositioning(container) {
    container.querySelectorAll('.effect-pill').forEach(function(pill) {
      pill.addEventListener('mouseenter', function() {
        var tip = pill.querySelector('.effect-pill-tooltip');
        if(!tip) return;
        var rect = pill.getBoundingClientRect();
        var tipW = 260;
        // Place directly below the pill
        var t = rect.bottom + 6;
        var l = rect.left;
        // Right-side pills: anchor right
        if(container.id === 'tp-status-right') l = rect.right - tipW;
        // Clamp
        if(l + tipW > window.innerWidth - 8) l = window.innerWidth - tipW - 8;
        if(l < 8) l = 8;
        if(t + 200 > window.innerHeight) t = rect.top - 200;
        tip.style.top = t + 'px';
        tip.style.left = l + 'px';
      });
    });
  }
  attachTooltipPositioning(leftBar);
  attachTooltipPositioning(rightBar);

  if(statusDock) {
    statusDock.classList.remove('active','has-both-sides');
    statusDock.style.display = 'none';
  }
  if(statusLeft) statusLeft.innerHTML = '';
  if(statusRight) statusRight.innerHTML = '';
}

function applyWinScreenGameBackground() {
  const winScreen = document.getElementById('s-win');
  const gameScreen = document.getElementById('s-game');
  if(!winScreen) return;
  let gameBgVar = gameScreen ? gameScreen.style.getPropertyValue('--game-bg-img') : '';
  const lastBg = window.__fateLastGameBackground || null;
  if(!gameBgVar && typeof _lastGameSong !== 'undefined' && typeof INGAME_BG_PATH === 'function') {
    const bgNum = Math.max(1, Math.min(12, parseInt(String(_lastGameSong || 'board1').replace('board',''), 10) || 1));
    gameBgVar = `url(${INGAME_BG_PATH(bgNum)})`;
  }
  if(!gameBgVar && lastBg?.cssVar) gameBgVar = lastBg.cssVar;
  if(gameBgVar) {
    winScreen.style.setProperty('--game-bg-img', gameBgVar);
    winScreen.style.setProperty('background-image', `linear-gradient(rgba(3,3,6,.58),rgba(3,3,6,.78)), ${gameBgVar}`, 'important');
    winScreen.style.setProperty('background-size', 'cover, cover', 'important');
    winScreen.style.setProperty('background-position', 'center, center', 'important');
    winScreen.style.setProperty('background-repeat', 'no-repeat, no-repeat', 'important');
  } else if(gameScreen) {
    const gameBg = getComputedStyle(gameScreen).backgroundImage;
    if(gameBg && gameBg !== 'none') winScreen.style.setProperty('background-image', gameBg, 'important');
  } else if(lastBg?.backgroundImage) {
    winScreen.style.setProperty('background-image', lastBg.backgroundImage, 'important');
  }
  winScreen.classList.add('win-screen-game-bg');
}

function renderLevelBadge(level, opts={}){
  const safeLevel = Math.max(1, parseInt(level,10) || 1);
  const badge = getBadgeForLevel(safeLevel) || LEVEL_BADGES[0];
  const sm = opts.small ? ' sm' : '';
  const badgeLabel = opts.small ? badge.name.replace(/[^A-Za-z]/g,'').slice(0,3).toUpperCase() : badge.name.toUpperCase();
  return `<span class="level-badge${sm}" title="${escapeHtml(badge.name)} Tier" style="--badge-color:${badge.color};--badge-glow:${badge.glow};--badge-bg:linear-gradient(180deg,${badge.color},#1a1d27);">
    <span class="lb-crest"><span class="lb-icon">${badge.image?`<img src="${badge.image}" alt="${escapeHtml(badge.name)}">`:escapeHtml(badge.name.slice(0,1))}</span></span>
    <span class="lb-copy"><span class="lb-core"><span class="lb-label">${badgeLabel}</span><span class="lb-lv">${safeLevel}</span></span></span>
  </span>`;
}

function positionOnlineAccountBadgeNearTitleProfile() {
  const badge = document.getElementById('fate-online-account');
  if(!badge) return;
  if(document.getElementById('fate-corner-dock') && typeof window.scheduleFateCornerDock === 'function'){
    window.scheduleFateCornerDock();
    return;
  }
  badge.style.setProperty('position', 'fixed', 'important');
  badge.style.setProperty('left', 'auto', 'important');
  badge.style.setProperty('top', 'auto', 'important');
  badge.style.setProperty('right', '18px', 'important');
  badge.style.setProperty('bottom', '18px', 'important');
  badge.style.setProperty('transform', 'none', 'important');
  badge.style.setProperty('width', 'min(300px, calc(100vw - 24px))', 'important');
  badge.style.setProperty('max-width', '300px', 'important');
}
if(typeof window !== 'undefined') window.positionOnlineAccountBadgeNearTitleProfile = positionOnlineAccountBadgeNearTitleProfile;

function renderTitleProfile(){
  const el = document.getElementById('title-profile');
  if(!el) return;
  el.classList.remove('title-profile-fallback');
  const fallbackSrc = typeof getDefaultProfileImgSrc === 'function' ? getDefaultProfileImgSrc() : 'blank.png';
  const src = typeof getProfileImgSrc === 'function' ? (getProfileImgSrc() || fallbackSrc) : fallbackSrc;
  const cropStyle = typeof getProfileCropStyle==='function' ? getProfileCropStyle() : 'object-fit:cover;object-position:center 20%;';
  const elo = USER_PROFILE.challengerElo||600;
  const rank = typeof getRank === 'function' ? getRank(elo) : null;
  const picFrame = typeof getRankFrameStyle === 'function' ? getRankFrameStyle(elo,'icon') : '';
  const nextLevelXp = USER_PROFILE.level >= MAX_LEVEL ? 0 : getXpForLevel(USER_PROFILE.level+1);
  const xpPct = USER_PROFILE.level >= MAX_LEVEL ? 100 : Math.max(0, Math.min(100, Math.round(((USER_PROFILE.xp||0) / nextLevelXp) * 100)));
  const rankColor = rank && rank.color ? rank.color : '#c9a84c';
  const idx = typeof getRankTierIndex === 'function' && rank ? getRankTierIndex(rank) : 0;
  const rgb = typeof hexToRgb === 'function' ? hexToRgb(rankColor) : {r:201,g:168,b:76};
  const borderW = 2.5 + idx * 0.3;
  const glowR = 16 + idx * 6;
  const glowA = (0.18 + idx * 0.04).toFixed(2);
  const spreadW = (1.2 + idx * 0.25).toFixed(1);
  const spreadA = (0.06 + idx * 0.015).toFixed(3);
  const panelStyle = `border:${borderW.toFixed(1)}px solid ${rankColor}!important;box-shadow:0 14px 36px rgba(0,0,0,.6),0 0 ${glowR}px rgba(${rgb.r},${rgb.g},${rgb.b},${glowA}),0 0 0 ${spreadW}px rgba(${rgb.r},${rgb.g},${rgb.b},${spreadA}),inset 0 0 0 1px rgba(255,255,255,${(0.04+idx*0.01).toFixed(2)})!important;`;
  el.style.cssText = panelStyle + '--title-profile-rank-color:'+rankColor+';--title-profile-rank-r:'+rgb.r+';--title-profile-rank-g:'+rgb.g+';--title-profile-rank-b:'+rgb.b+';';
  el.innerHTML = `
    <div class="tp-pic" style="${picFrame}">${src?`<img src="${src}" style="${cropStyle}" alt="" onerror="this.onerror=null;this.src='${fallbackSrc}';">`:'<span class="pi-placeholder">Profile</span>'}</div>
    <div class="tp-info">
      <div class="tp-head">
        <div class="tp-name">${escapeHtml(USER_PROFILE.username||'Player')}</div>
      </div>
      <div class="tp-rank-block">
        <div class="tp-rank-row">${renderRankBadge(elo,'lg')}</div>
      </div>
      <div class="tp-bottom">
        <div class="tp-stat-row">
          ${renderLevelBadge(USER_PROFILE.level).replace('level-badge','level-badge title-level-badge')}
        </div>
        <div class="tp-xp-wrap">
          <div class="tp-xp"><div class="tp-xp-fill" style="width:${xpPct}%;"></div></div>
          <div class="tp-xp-copy">${USER_PROFILE.level >= MAX_LEVEL ? 'MAX LEVEL' : `${USER_PROFILE.xp||0} / ${nextLevelXp} XP`}</div>
        </div>
      </div>
    </div>`;
  positionOnlineAccountBadgeNearTitleProfile();
  setTimeout(positionOnlineAccountBadgeNearTitleProfile, 80);
  setTimeout(positionOnlineAccountBadgeNearTitleProfile, 260);
}

if(typeof window !== 'undefined' && !window.__fateTitleAccountPositionerInstalled){
  window.__fateTitleAccountPositionerInstalled = true;
  window.addEventListener('resize', ()=>setTimeout(positionOnlineAccountBadgeNearTitleProfile, 40));
  window.addEventListener('fate-online-auth', ()=>setTimeout(positionOnlineAccountBadgeNearTitleProfile, 40));
}

function updatePlayerBanners() {
  // Determine player indices
  const myP = getPerspectivePlayerIndex();
  const oppP = 1 - myP;
  const getBannerProfile = (playerIndex) => {
    const matchProfile = G.playerProfiles && G.playerProfiles[playerIndex];
    if(matchProfile) return matchProfile;
    if(playerIndex === 0) {
      return {
        name: USER_PROFILE.username || G.players[0].name || 'Player 1',
        img: getProfileImgSrc(),
        crop: getProfileCropStyle(),
        elo: CURRENT_MODE==='challenger' ? (USER_PROFILE.challengerElo||600) : (USER_PROFILE.elo||600),
        wins: CURRENT_MODE==='challenger' ? (USER_PROFILE.challengerWins||0) : (USER_PROFILE.wins||0),
        losses: CURRENT_MODE==='challenger' ? (USER_PROFILE.challengerLosses||0) : (USER_PROFILE.losses||0)
      };
    }
    return {
      name: G.players[playerIndex]?.name || `Player ${playerIndex + 1}`,
      img: null,
      crop: '',
      elo: null,
      wins: null,
      losses: null
    };
  };
  const myProfile = getBannerProfile(myP);
  const myPicEl = document.getElementById('my-pic');
  const myNameEl = document.getElementById('my-name');
  const myStatEl = document.getElementById('my-stat');
  if(myPicEl){
    myPicEl.style.cssText = (myProfile.elo != null && typeof getRankFrameStyle === 'function') ? getRankFrameStyle(myProfile.elo,'icon') : '';
    myPicEl.innerHTML = myProfile.img ? `<img src="${myProfile.img}" style="${myProfile.crop || ''}" alt="">` : '<span class="pi-placeholder">ðŸ‘¤</span>';
  }
  if(myNameEl) myNameEl.textContent = myProfile.name || 'You';
  if(myStatEl){
    if(myProfile.elo != null){
      myStatEl.innerHTML = `${renderRankBadge(myProfile.elo, 'sm')}
        <div class="pb-elo-line">ELO ${myProfile.elo} &bull; ${myProfile.wins||0}W ${myProfile.losses||0}L</div>`;
    } else {
      myStatEl.textContent = 'Local Player';
    }
  }
  // Opponent banner
  const oppPicEl = document.getElementById('opp-pic');
  const oppNameEl = document.getElementById('opp-name');
  const oppStatEl = document.getElementById('opp-stat');
  if(G.aiEnabled){
    const ai = G._selectedAI;
    const d = G.aiDifficulty || 'medium';
    const aiName = ai ? ai.name : G.players[1].name;
    const aiElo = ai ? ai.elo : ({easy:800,medium:1000,hard:1200,extreme:1400}[d]||1000);
    if(oppPicEl){
      oppPicEl.style.cssText = typeof getRankFrameStyle === 'function' ? getRankFrameStyle(aiElo,'icon') : '';
      const aiImg = ai && typeof getAIProfileImg === 'function' ? getAIProfileImg(ai, 'circle') : (ai&&ai.img ? ai.img : 'blank.png');
      oppPicEl.innerHTML = `<img src="${aiImg}" style="width:100%;height:100%;object-fit:cover;object-position:center 25%;" alt="" onerror="this.onerror=null;this.src='blank.png';">`;
    }
    if(oppNameEl) oppNameEl.innerHTML = escapeHtml(aiName);
    if(oppStatEl){
      oppStatEl.innerHTML = `${renderRankBadge(aiElo,'sm')}
        <div class="pb-elo-line">ELO ${aiElo}</div>`;
    }
  } else {
    const oppProfile = getBannerProfile(oppP);
    if(oppPicEl){
      oppPicEl.style.cssText = (oppProfile.elo != null && typeof getRankFrameStyle === 'function') ? getRankFrameStyle(oppProfile.elo,'icon') : '';
      oppPicEl.innerHTML = oppProfile.img ? `<img src="${oppProfile.img}" style="${oppProfile.crop || ''}" alt="">` : '<span class="pi-placeholder">ðŸ‘¤</span>';
    }
    if(oppNameEl) oppNameEl.textContent = oppProfile.name || `Player ${oppP + 1}`;
    if(oppStatEl){
      if(oppProfile.elo != null){
        oppStatEl.innerHTML = `${renderRankBadge(oppProfile.elo, 'sm')}
          <div class="pb-elo-line">ELO ${oppProfile.elo} &bull; ${oppProfile.wins||0}W ${oppProfile.losses||0}L</div>`;
      } else {
        oppStatEl.textContent = 'Local Player';
      }
    }
  }
  // Active turn highlight
  const myBanner = document.querySelector('.my-banner');
  const oppBanner = document.querySelector('.opp-banner');
  if(myBanner) myBanner.classList.toggle('active-turn', G.currentPlayer===myP);
  if(oppBanner) oppBanner.classList.toggle('active-turn', G.currentPlayer===oppP);
  // Auto-shrink long names
  fitBannerNames();
}

function fitBannerNames(){
  document.querySelectorAll('#s-game .pb-name').forEach(function(el){
    el.classList.remove('pb-name-fit-long');
    el.classList.remove('pb-name-wrap');
    el.style.fontSize = '';
    el.style.letterSpacing = '';
    el.style.maxWidth = '';
    el.style.transform = '';
    el.style.transformOrigin = '';
    el.style.webkitLineClamp = '';
    var text = (el.textContent || '').trim();
    if(!text) return;
    var computed = window.getComputedStyle ? getComputedStyle(el) : null;
    var maxSize = computed ? (parseFloat(computed.fontSize) || 13.6) : 13.6;
    var minSize = 6.75;
    var size = maxSize;
    el.style.fontSize = size + 'px';
    var parent = el.parentElement;
    if(!parent) return;
    var maxW = parent.clientWidth - 2;
    var banner = el.closest ? el.closest('.player-banner') : null;
    var pic = banner && banner.querySelector ? banner.querySelector('.pb-pic') : null;
    if(banner && pic && banner.getBoundingClientRect && pic.getBoundingClientRect){
      var br = banner.getBoundingClientRect();
      var pr = pic.getBoundingClientRect();
      var bs = window.getComputedStyle ? getComputedStyle(banner) : null;
      var gap = bs ? (parseFloat(bs.columnGap || bs.gap) || 12) : 12;
      var padR = bs ? (parseFloat(bs.paddingRight) || 0) : 0;
      maxW = Math.max(44, br.width - pr.width - gap - padR - 6);
    }
    if(maxW <= 0) return;
    var naturalWidth = el.scrollWidth;
    if(naturalWidth <= maxW + 1) {
      el.style.fontSize = '';
      el.style.maxWidth = '';
      return;
    }
    el.classList.add('pb-name-fit-long');
    el.classList.add('pb-name-wrap');
    el.style.maxWidth = maxW + 'px';
    el.style.letterSpacing = '0';
    var lineHeight = computed ? (parseFloat(computed.lineHeight) || size * 1.08) : size * 1.08;
    var maxH = Math.ceil(lineHeight * 2.22);
    while(el.scrollHeight > maxH && size > minSize){
      size -= 0.25;
      el.style.fontSize = size + 'px';
      lineHeight = computed ? (parseFloat(getComputedStyle(el).lineHeight) || size * 1.08) : size * 1.08;
      maxH = Math.ceil(lineHeight * 2.22);
    }
  });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  CARD DETAIL MODAL
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function activateSelvaIslandsPirateFromHand(card) {
  if(!card || card.id !== '74') return;
  closeModal();
  const cp=G.currentPlayer;
  const idx=G.players[cp].hand.findIndex(c=>c.iid===card.iid);
  if(idx>-1){
    G.players[cp].hand.splice(idx,1);
    G.players[cp].discard.push(card);
    G.maxSupportsPerTurn = 3; // override for this turn
    G.selectedHandCard=null;
    toast('Selva Islands Pirate discarded - you can set 3 supporters this turn!');
    log(cp===0?'p1':'p2','Selva Islands Pirate: 3 supporters allowed this turn');
    playSfx('effect');
    renderGame({hand:true, topbar:true});
  }
}

function playEffectActivationButtonSound() {
  if(typeof window !== 'undefined' && typeof window.playEffectActivationClickSfx === 'function') {
    return window.playEffectActivationClickSfx();
  }
  if(typeof playSfx === 'function') playSfx('effectActivate');
  return true;
}

function openCardDetail(card, fromHand=false, fromBoard=false) {
  if(!card){
    if(G.selectedHandCard!==null) card=G.players[G.currentPlayer].hand[G.selectedHandCard];
    if(!card) return;
  }
  const viewerP = getPerspectivePlayerIndex();
  const hideCard = !!(fromBoard && isFaceDownCard(card) && card.owner !== viewerP);
  const aff=AFF_COLOR[card.aff]||'#2a2a3a';
  const body=document.getElementById('modal-body');
  if(!body) return;
  const boardPos = getBoardCardPosition(card);
  const visual = getCardVisualData(card, viewerP, {boardPos});
  const cardArt = visual.img
    ? `<img src="${visual.img}" alt="${escapeHtml(visual.name)}" decoding="async" loading="eager">`
    : `<span class="cd-fallback">${getAffIcon(visual.aff)}</span>`;
  const voiceButton = (!hideCard && visual.type !== 'Supporter')
    ? `<button type="button" class="card-voice-btn" title="Play voiceline" onclick="event.stopPropagation(); if(typeof playCardSound==='function') playCardSound('${escapeHtml(card.id)}');">♪</button>`
    : '';
  body.innerHTML=`
    <div class="cd-wrap">
      <div class="cd-img">
        ${cardArt}
      </div>
      <div class="cd-info">
        <div class="cd-name cd-name-with-audio">
          <span>${visual.name}</span>
          ${voiceButton}
        </div>
        <div class="cd-ability">${visual.ability}</div>
        <div class="cd-pills">
          <span class="pill type">${visual.type}${visual.cost>0?` (${visual.xCost?'X':visual.cost})`:''}</span>
          <span class="pill fate">${visual.fate} Fate</span>
          <span class="pill">${AFF_LABEL[visual.aff]||visual.aff}</span>
        </div>
        <div class="cd-eff">${visual.effect}</div>
        ${!hideCard && card.flavor?`<div class="cd-flavor">${card.flavor}</div>`:''}
      </div>
    </div>`;
  document.getElementById('modal-title').textContent=visual.name;
  const acts=document.getElementById('modal-acts');
  acts.innerHTML='';
  const close=document.createElement('button');
  close.className='btn sm';close.textContent='Close';close.onclick=closeModal;
  if(!hideCard && typeof window.hasCardLorePage === 'function' && window.hasCardLorePage(card) && typeof window.openCardLoreFromInfo === 'function'){
    const lore=document.createElement('button');
    lore.className='btn sm';
    lore.textContent='Lore';
    lore.onclick=(ev)=>{
      if(ev){
        ev.preventDefault();
        ev.stopPropagation();
      }
      window.openCardLoreFromInfo(card);
    };
    acts.appendChild(lore);
  }
  acts.appendChild(close);
  if(hideCard){
    document.getElementById('modal').classList.add('on');
    return;
  }
  if((fromHand||G.selectedHandCard!==null) && !fromBoard){
    if(card.id==='70'){
      if(!card.guerilla_transferred){
        const guer=document.createElement('button');
        guer.className='btn sm pri';guer.textContent='Activate Effect';
        guer.onclick=()=>{
          playEffectActivationButtonSound();
          if(typeof activateWineCountryGuerillaFromHand === 'function') activateWineCountryGuerillaFromHand(card);
        };
        acts.appendChild(guer);
      }
      document.getElementById('modal').classList.add('on');
      return;
    }
    if(card.type==='Supporter'){
      // Selva Islands Pirate (74): discard from hand to set 3 supporters this turn
      if(card.id==='74'){
        const selva=document.createElement('button');
        selva.className='btn sm pri';selva.textContent='Discard — Set 3 Supporters';
        selva.onclick=()=>{
          if(G._onlineRoomCode && typeof activateSelvaIslandsPirateFromHand === 'function'){
            activateSelvaIslandsPirateFromHand(card);
            return;
          }
          closeModal();
          const cp=G.currentPlayer;
          const idx=G.players[cp].hand.findIndex(c=>c.iid===card.iid);
          if(idx>-1){
            G.players[cp].hand.splice(idx,1);
            G.players[cp].discard.push(card);
            G.maxSupportsPerTurn = 3; // override for this turn
            G.selectedHandCard=null;
            toast('Selva Islands Pirate discarded — you can set 3 supporters this turn!');
            log(cp===0?'p1':'p2','Selva Islands Pirate: 3 supporters allowed this turn');
            playSfx('effect');
            renderGame({hand:true, topbar:true});
          }
        };
        acts.appendChild(selva);
      }
      const place=document.createElement('button');
      // Keep both input methods: modal Place on Board for precise selection,
      // plus hold/drag placement for faster play. Multiplayer-safe because
      // both routes use the same selected-hand-card placement state.
      place.className='btn sm pri'; place.dataset.placeFromHand='1'; place.textContent='Place on Board';
      place.onclick=()=>placeSelected();
      acts.appendChild(place);
    } else {
      const con=document.createElement('button');
      con.className='btn sm pri';con.textContent='Consolidate';
      con.onclick=()=>initiateConsolidate();
      acts.appendChild(con);
    }
  }
  if(fromBoard && G.selectedBoardCard){
    const {card:bc,z,r,c}=G.selectedBoardCard;
    const boardActionPlayer = G._onlineRoomCode
      ? (Number.isInteger(G.localPlayerIndex) ? G.localPlayerIndex : null)
      : getPerspectivePlayerIndex();
    const canUseBoardCard = Number.isInteger(boardActionPlayer)
      && bc.owner===boardActionPlayer
      && G.currentPlayer===boardActionPlayer
      && G.phase==='main'
      && !G._isSpectator
      && G._onlineRole !== 'spectator';
    const canActivateDeferredSetEffect = Number.isInteger(boardActionPlayer)
      && !isFaceDownCard(bc)
      && typeof canActivatePendingWhenSetEffect === 'function'
      && canActivatePendingWhenSetEffect(bc, z, r, c, boardActionPlayer);
    if(isFaceDownCard(bc) && canUseBoardCard){
      const flip=document.createElement('button');
      flip.className='btn sm pri';
      flip.textContent='Flip Face Up';
      flip.onclick=()=>{
        closeModal();
        playEffectActivationButtonSound();
        const delay = flipFaceDownBoardCard(bc, z, r, c);
      };
      acts.appendChild(flip);
    }
    if(canActivateDeferredSetEffect){
      const setAct=document.createElement('button');
      setAct.className='btn sm pri';
      setAct.textContent='Activate Effect';
      setAct.onclick=()=>{playEffectActivationButtonSound(); closeModal(); activatePendingWhenSetEffect(bc,z,r,c);};
      acts.appendChild(setAct);
    }
    const canActivateManualCharacterEffect = typeof shouldShowManualCharacterEffectButton === 'function'
      ? shouldShowManualCharacterEffectButton(bc)
      : ['21', '38', '40'].includes(String(bc.id || ''));
    if(!canActivateDeferredSetEffect && canUseBoardCard && canActivateManualCharacterEffect && bc.type!=='Supporter' && !isFaceDownCard(bc)){
      // Coordinators: passive, no manual activation needed
      if(bc.type==='Coordinator'){
        // No button needed — coordinators are automatic
      } else if(bc.type==='Initiator' && bc.effectUsedInitial){
        // Initiator already fired — no button
      } else if(bc.type==='Improvisor' && String(bc.id || '') !== '40'){
        // Improvisors are conditional/reactive and should not show a manual activation button.
      } else {
        const act=document.createElement('button');
        act.className='btn sm pri';act.textContent='Activate Effect';
        act.onclick=()=>{playEffectActivationButtonSound();closeModal();triggerCharacterEffect(bc,z,r,c);};
        acts.appendChild(act);
      }
    }
    // Show Discard button for your own board cards (except ALPINE Infantry)
    if(canUseBoardCard && bc.id!=='76'){
      // Supporter active abilities — specific cards with board-activated effects
      if(!canActivateDeferredSetEffect && bc.type==='Supporter' && !isFaceDownCard(bc)){
        const supporterActionsSuppressed = typeof isSupporterEffectSuppressed === 'function' && isSupporterEffectSuppressed(bc);
        // Vigilantes (52): mark an opponent card in this zone as 0 Reinforcement (once per turn)
        if(!supporterActionsSuppressed && bc.id==='52' && !bc.vigilanteUsed){
          const vigBtn=document.createElement('button');
          vigBtn.className='btn sm pri';vigBtn.textContent='Marked for Death';
          vigBtn.onclick=()=>{playEffectActivationButtonSound();closeModal();activateVigilantes(bc,z,r,c);};
          acts.appendChild(vigBtn);
        }
        // Wolf Creek (54): move a card you control to any open square or swap (once per turn)
        if(!supporterActionsSuppressed && bc.id==='54' && !bc.wolfCreekUsed){
          const wcBtn=document.createElement('button');
          wcBtn.className='btn sm pri';wcBtn.textContent='Elusive Movements';
          wcBtn.onclick=()=>{playEffectActivationButtonSound();closeModal();activateWolfCreek(bc,z,r,c);};
          acts.appendChild(wcBtn);
        }
        // ALPINE Expeditionary (73): move once per turn
        if(!supporterActionsSuppressed && bc.id==='73' && bc._canMoveOncePerTurn && !bc._expMoved){
          const expBtn=document.createElement('button');
          expBtn.className='btn sm pri';expBtn.textContent='Move (once/turn)';
          expBtn.onclick=()=>{playEffectActivationButtonSound();closeModal();activateExpeditionaryMove(bc,z,r,c);};
          acts.appendChild(expBtn);
        }
        // Busser movement: any card with _busserMoves can move to adjacent zone
        if(!supporterActionsSuppressed && bc._busserMoves > 0 && !bc._busserMovedThisTurn && !bc.cantBeMoved && !bc.immuneFlag && bc.id!=='76'){
          const busBtn=document.createElement('button');
          busBtn.className='btn sm pri';busBtn.textContent='Move to Adjacent Zone ('+bc._busserMoves+' left)';
          busBtn.onclick=()=>{closeModal();activateBusserMove(bc,z,r,c);};
          acts.appendChild(busBtn);
        }
      }
      const disc=document.createElement('button');
      disc.className='btn sm danger';disc.textContent='Discard';
      disc.onclick=()=>{
        closeModal();
        discardBoardCard(bc, z, r, c);
        log(bc.owner===0?'p1':'p2',`Discarded ${bc.name} from Zone ${z+1}`);
        G.selectedBoardCard=null;
        renderGame();
      };
      acts.appendChild(disc);
    }
  }
  document.getElementById('modal').classList.add('on');
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  HELPER MODALS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function resetModalChrome() {
  const modalEl = document.getElementById('modal');
  if(modalEl) modalEl.classList.remove('match-overview-modal', 'online-match-overview-modal', 'no-edge-corners-modal');
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox){
    modalBox.classList.remove(
      'leaderboard-modal',
      'social-profile-modal',
      'sell-card-modal',
      'online-room-deck-picker-modal',
      'choose-deck-canonical-modal',
      'challenger-my-decks-modal',
      'deck-inspect-compact-modal',
      'market-history-modal',
      'market-list-modal',
      'market-purchase-modal',
      'freeplay-mode-modal',
      'freeplay-title-preset-modal',
      'public-decks-modal',
      'public-deck-preview-modal',
      'public-deck-comments-modal',
      'public-deck-import-choice-modal',
      'share-deck-modal',
      'online-profile-modal-v17',
      'online-profile-modal-v18',
      'online-profile-modal-v19',
      'title-profile-modal',
      'inspected-profile-modal-stable',
      'title-my-decks-modal',
      'daily-login-modal'
    );
    modalBox.removeAttribute('style');
  }
  const titleEl = document.getElementById('modal-title');
  if(titleEl) titleEl.removeAttribute('style');
  const actsEl = document.getElementById('modal-acts');
  if(actsEl) actsEl.removeAttribute('style');
  const bodyEl = document.getElementById('modal-body');
  if(bodyEl){
    bodyEl.style.overflow = '';
    bodyEl.style.maxHeight = '';
  }
}

function showModal(title, bodyHtml, actions, opts) {
  const wait = (typeof getInteractionAnimationDelayMs === 'function' ? getInteractionAnimationDelayMs() : getPlacementUiDelayMs());
  if(wait > 0){
    setTimeout(()=>showModal(title, bodyHtml, actions, opts), wait);
    return;
  }
  resetModalChrome();
  const titleEl = document.getElementById('modal-title');
  const titleStr = typeof title === 'string' ? title : String(title||'');
  const effectModalTitles = new Set(['Variable Cost','Over-Reinforcement','Chaparral Hoplite','Artillery Distance','Left Hook of the Incel','Rearrange Top 5']);
  const effectModal = effectModalTitles.has(titleStr);
  if(titleStr.includes('<')) titleEl.innerHTML = titleStr;
  else titleEl.textContent = titleStr;
  document.getElementById('modal-body').innerHTML=bodyHtml;
  const acts=document.getElementById('modal-acts');
  acts.innerHTML='';
  (actions||[]).forEach(a=>{
    const btn=document.createElement('button');
    btn.className='btn sm'+(a.danger?' danger':'')+(a.pri?' pri':'');
    btn.textContent=a.label;
    btn.onclick=function(e){
      const label = String(a.label || '').toLowerCase();
      const cancelLike = a.danger || /cancel|close|back|skip|decline|no|leave/.test(label);
      if(effectModal && !cancelLike) playEffectActivationButtonSound();
      if(typeof a.action === 'function') return a.action(e);
    };
    acts.appendChild(btn);
  });
  document.getElementById('modal').classList.add('on');
  if(typeof FateSVG !== 'undefined' && FateSVG && typeof FateSVG.decorate === 'function'){
    const modalNode = document.getElementById('modal');
    requestAnimationFrame(function(){ FateSVG.decorate(modalNode); });
  }
  if(!(opts && opts.silentOpen)) playSfx('menuOpen');
}

function closeModal() {
  document.getElementById('modal').classList.remove('on');
  resetModalChrome();
  if(typeof dismissCardInfoOverlay === 'function') dismissCardInfoOverlay();
}

function pickAnyBoardCard(owner, callback) {
  const entries=[];
  forEachBoardCard((card,z,r,c)=>entries.push({card,z,r,c}));
  if(!entries.length){toast('No cards on the field');return;}
  // For any-board selection, fall back to the grid picker
  pickCardsVisual(entries.map(e=>e.card), {
    title: 'Select Target',
    subtitle: 'Any card on the field',
    maxCount: 1,
    confirmLabel: 'Confirm'
  }, (chosen)=>{
    if(!chosen.length) return;
    const picked = entries.find(e=>e.card===chosen[0]);
    if(picked && callback) callback(picked.card, picked.z, picked.r, picked.c);
  });
}

function pickCardInZone(z, prompt, callback, filter=null) {
  const viewerP = G.currentPlayer;
  const entries=[];
  G.board[z].forEach((row,r)=>row.forEach((cell,c)=>{
    if(cell&&(!filter||filter(cell))) entries.push({card:cell,z,r,c});
  }));
  if(entries.length===0){toast('No valid targets in this zone');return;}
  showZonePicker(z, prompt, entries, 1, viewerP, (chosen)=>{
    if(!chosen.length) return;
    const picked = chosen[0];
    callback(picked.card, picked.z, picked.r, picked.c);
  }, filter);
}

function pickMultipleInZone(z, max, prompt, callback, filter=null) {
  const viewerP = G.currentPlayer;
  const entries=[];
  G.board[z].forEach((row,r)=>row.forEach((cell,c)=>{
    if(cell&&(!filter||filter(cell))) entries.push({card:cell,z,r,c});
  }));
  if(!entries.length){toast('No valid targets in this zone');return;}
  showZonePicker(z, prompt, entries, max, viewerP, callback, filter);
}

// Zone-shaped picker: shows the 3x3 zone with ownership colouring so you can
// easily target a card by position.
function showZonePicker(z, prompt, entries, maxCount, viewerP, onConfirm, filter) {
  const wait = (typeof getInteractionAnimationDelayMs === 'function' ? getInteractionAnimationDelayMs() : getPlacementUiDelayMs());
  if(wait > 0){
    setTimeout(()=>showZonePicker(z, prompt, entries, maxCount, viewerP, onConfirm, filter), wait);
    return;
  }
  const body = document.createElement('div');
  body.innerHTML = `
    <p style="font-size:.85rem;color:var(--dim);font-style:italic;margin-bottom:.3rem;">${prompt}</p>
    <p style="font-size:.72rem;color:var(--dim);margin-bottom:.5rem;">
      <span style="color:var(--p1)">Blue = your cards</span>
      <span style="color:var(--p2);margin-left:1rem;">Red = opponent</span>
      <span style="color:#777;margin-left:1rem;">Grey = not targetable</span>
    </p>
    <div id="zp-count" style="font-family:'Cinzel',serif;color:var(--gold);font-size:.85rem;margin-bottom:.5rem;">0/${maxCount} selected</div>
    <div class="zone-picker-wrap"></div>`;
  const wrap = body.querySelector('.zone-picker-wrap');

  // Build a 3x3 grid of cells with ownership colour classes
  const rowLabels = ['Opponent','Contested','Yours'];
  // Orientation: if viewerP is P1 (0), row 0 = opp safe, row 2 = mine (as normal)
  // if viewerP is P2 (1), flip so row 0 = mine, row 2 = opp -- but keep rendering consistent
  let chosen = [];
  for(let r=0;r<3;r++){
    const rowEl = document.createElement('div');
    rowEl.className = 'zp-row';
    const rowLbl = document.createElement('div');
    rowLbl.className = 'zp-row-lbl';
    // Adjust labels based on viewer perspective
    const isViewerP1 = viewerP===0;
    const displayRow = isViewerP1 ? r : 2-r;
    rowLbl.textContent = '';
    rowEl.appendChild(rowLbl);
    const cells = document.createElement('div');
    cells.className = 'zp-cells';
    // Actual row in data: we iterate displayRow
    const dataRow = displayRow;
    for(let c=0;c<3;c++){
      const cell = G.board[z]?.[dataRow]?.[c] || null;
      const cellEl = document.createElement('div');
      cellEl.className = 'zp-cell';
      if(!cell){
        cellEl.classList.add('zp-empty');
        cellEl.innerHTML = '<span style="color:#333;font-family:Cinzel,serif;font-size:.6rem;">empty</span>';
      } else {
        const ownClass = cell.owner===viewerP ? 'zp-mine' : 'zp-enemy';
        cellEl.classList.add(ownClass);
        const isTargetable = !filter || filter(cell);
        if(!isTargetable){
          cellEl.classList.add('zp-notarget');
        } else {
          cellEl.classList.add('zp-targetable');
        }
        const entry = entries.find(e=>e.card===cell);
        const visual = getCardVisualData(cell, viewerP, {boardPos:{z, r:dataRow, c}});
        cellEl.innerHTML = `
          <div class="zp-card-art">${visual.img?`<img src="${visual.img}" alt="${visual.name}">`:`<span style="font-size:2rem;opacity:.4;">${getAffIcon(visual.aff)}</span>`}</div>
          <div class="zp-card-fate">${visual.displayFate}</div>
          <div class="zp-card-name">${visual.name}</div>`;
        if(isTargetable && entry){
          cellEl.onclick = ()=>{
            if(cellEl.classList.contains('sel')){
              cellEl.classList.remove('sel');
              chosen = chosen.filter(x=>x!==entry);
            } else {
              if(maxCount===1){
                // Single-select: replace
                wrap.querySelectorAll('.zp-cell.sel').forEach(x=>x.classList.remove('sel'));
                chosen=[entry];
              } else if(chosen.length<maxCount){
                chosen.push(entry);
              } else {
                toast(`Max ${maxCount} selected`);return;
              }
              cellEl.classList.add('sel');
            }
            const cntEl = document.getElementById('zp-count');
            if(cntEl) cntEl.textContent = `${chosen.length}/${maxCount} selected`;
          };
        }
      }
      cells.appendChild(cellEl);
    }
    rowEl.appendChild(cells);
    wrap.appendChild(rowEl);
  }

  if(typeof resetModalChrome === 'function') resetModalChrome();
  document.getElementById('modal-body').innerHTML='';
  document.getElementById('modal-body').appendChild(body);
  document.getElementById('modal-title').textContent = 'Zone '+(z+1)+' - Select Target';
  document.getElementById('modal-acts').innerHTML='';
  const ok = document.createElement('button');
  ok.className='btn sm pri';ok.textContent='Confirm';
  ok.onclick = ()=>{closeModal();onConfirm(chosen);};
  const cancel = document.createElement('button');
  cancel.className='btn sm';cancel.textContent='Cancel';cancel.onclick=closeModal;
  document.getElementById('modal-acts').appendChild(cancel);
  document.getElementById('modal-acts').appendChild(ok);
  document.getElementById('modal').classList.add('on');
  // Trim the modal tightly around the zone picker content
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox) Object.assign(modalBox.style, {maxWidth:'520px', width:'auto', padding:'1.2rem 1.4rem'});
}

function pickCardsFromHand(player, maxCount, prompt, callback) {
  const hand = G.players[player].hand;
  if(!hand.length){toast('Hand is empty');callback([]);return;}
  const effectiveMax = Math.min(maxCount, hand.length);
  pickCardsVisual(hand, {
    title: prompt,
    subtitle: maxCount>=999 ? `From your hand (any number)` : `From your hand — up to ${effectiveMax}`,
    maxCount: maxCount>=999 ? hand.length : effectiveMax,
    confirmLabel: 'Confirm'
  }, callback);
}

// Image-based card picker with pagination
function pickCardsVisual(cards, opts, onConfirm) {
  opts = opts || {};
  const allowAfterEffectCinematic = typeof G !== 'undefined' && G && G._allowImmediateEffectPickerUntil && Date.now() < G._allowImmediateEffectPickerUntil;
  const wait = (opts.immediate || allowAfterEffectCinematic) ? 0 : (typeof getInteractionAnimationDelayMs === 'function' ? getInteractionAnimationDelayMs() : getPlacementUiDelayMs());
  if(wait > 0){
    setTimeout(()=>pickCardsVisual(cards, opts, onConfirm), wait);
    return;
  }
  if(!cards.length){toast('No matching cards found');if(onConfirm) onConfirm([]); return;}
  const maxCount = opts.maxCount || 1;
  const minCount = opts.minCount || 0;
  const viewerP = typeof opts.viewerPlayerIndex === 'number' ? opts.viewerPlayerIndex : getPerspectivePlayerIndex();
  const CARDS_PER_PAGE = 8;
  let selected=[];
  let page = 0;
  const totalPages = Math.ceil(cards.length / CARDS_PER_PAGE);

  const body=document.createElement('div');
  const sub = opts.subtitle || (maxCount>1?`Select up to ${maxCount}`:'Select one');
  body.innerHTML=`
    <p style="font-size:.82rem;margin-bottom:.4rem;color:var(--dim);font-style:italic;">${sub}</p>
    <div id="visual-count" style="font-family:'Cinzel',serif;color:var(--gold);font-size:.8rem;margin-bottom:.4rem;">0/${maxCount} selected</div>
    <div class="visual-grid" id="visual-page-grid"></div>
    ${totalPages>1?`<div id="visual-pagination" style="display:flex;align-items:center;justify-content:center;gap:.6rem;margin-top:.5rem;">
      <button class="btn sm" id="vp-prev" style="font-size:.6rem;padding:.2rem .5rem;">◀ Prev</button>
      <span id="vp-page" style="font-family:'Cinzel',serif;font-size:.65rem;color:var(--dim);">1 / ${totalPages}</span>
      <button class="btn sm" id="vp-next" style="font-size:.6rem;padding:.2rem .5rem;">Next ▶</button>
    </div>`:''}`;

  function renderPage() {
    const grid = body.querySelector('#visual-page-grid');
    grid.innerHTML = '';
    const start = page * CARDS_PER_PAGE;
    const end = Math.min(start + CARDS_PER_PAGE, cards.length);
    for(let i=start; i<end; i++) {
      const c = cards[i];
      const visual = getCardVisualData(c, viewerP);
      const el = document.createElement('div');
      el.className = 'mc visual-mc' + (selected.includes(i)?' sel':'');
      el.innerHTML=`
        <div class="mc-art">${visual.img?`<img src="${visual.img}" alt="${visual.name}" loading="lazy" decoding="async">`:`<span class="mc-ico">${getAffIcon(visual.aff)}</span>`}</div>
        <div class="mc-fate">${visual.displayFate}</div>
        <div class="visual-name">${visual.name}</div>
        <button type="button" class="mc-info-btn" title="View card details" aria-label="View ${visual.name} details">i</button>`;
      el.title = visual.ability+' — '+visual.effect;
      el.onmouseenter=(ev)=>showHoverPreview(visual,ev);
      el.onmousemove=(ev)=>positionHoverPreview(ev);
      el.onmouseleave=()=>removeHoverPreview();
      // Info button opens card detail overlay without triggering selection
      (function(_c){ var infoBtn = el.querySelector('.mc-info-btn'); if(infoBtn) infoBtn.onclick = function(ev){ ev.stopPropagation(); removeHoverPreview(); showCardInfoOverlay(_c); }; })(c);
      (function(_i, _el){
        _el.onclick=()=>{
          if(_el.classList.contains('sel')){
            _el.classList.remove('sel');
            selected=selected.filter(x=>x!==_i);
          } else if(selected.length<maxCount){
            _el.classList.add('sel');
            selected.push(_i);
          } else if(maxCount===1){
            grid.querySelectorAll('.visual-mc.sel').forEach(x=>x.classList.remove('sel'));
            selected=[_i];
            _el.classList.add('sel');
          }
          document.getElementById('visual-count').textContent=`${selected.length}/${maxCount} selected`;
          if(minCount > 0){
            const okBtn = document.getElementById('modal-acts').querySelector('.btn.pri');
            if(okBtn){ okBtn.disabled = selected.length < minCount; okBtn.style.opacity = selected.length < minCount ? '.4' : '1'; }
          }
        };
      })(i, el);
      grid.appendChild(el);
    }
    const pageLabel = body.querySelector('#vp-page');
    if(pageLabel) pageLabel.textContent = `${page+1} / ${totalPages}`;
    const prevBtn = body.querySelector('#vp-prev');
    const nextBtn = body.querySelector('#vp-next');
    if(prevBtn) prevBtn.disabled = page === 0;
    if(nextBtn) nextBtn.disabled = page >= totalPages - 1;
  }

  if(typeof resetModalChrome === 'function') resetModalChrome();
  document.getElementById('modal-body').innerHTML='';
  document.getElementById('modal-body').appendChild(body);
  renderPage();

  // Wire pagination
  const prevBtn = body.querySelector('#vp-prev');
  const nextBtn = body.querySelector('#vp-next');
  if(prevBtn) prevBtn.onclick = ()=>{ if(page>0){page--;renderPage();} };
  if(nextBtn) nextBtn.onclick = ()=>{ if(page<totalPages-1){page++;renderPage();} };

  document.getElementById('modal-title').textContent=opts.title||'Select a Card';
  document.getElementById('modal-acts').innerHTML='';
  const ok=document.createElement('button');
  ok.className='btn sm pri';ok.textContent=opts.confirmLabel||'Confirm';
  if(minCount > 0){ ok.disabled = true; ok.style.opacity = '.4'; }
  ok.onclick=()=>{
    if(minCount > 0 && selected.length < minCount){ toast('You must select at least '+minCount+' card(s)'); return; }
    closeModal();onConfirm(selected.map(i=>cards[i]));
  };
  const cl=document.createElement('button');
  cl.className='btn sm';cl.textContent='Cancel';
  cl.onclick=()=>{closeModal();if(opts.onCancel) opts.onCancel();};
  if(minCount <= 0) document.getElementById('modal-acts').appendChild(cl);
  document.getElementById('modal-acts').appendChild(ok);
  document.getElementById('modal').classList.add('on');
  // Wider modal for card picker
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox) {
    modalBox.classList.add('visual-card-picker-modal');
    modalBox.style.maxWidth = '780px';
  }
}

function searchDeckForType(player, type, prompt, maxCount=1) {
  const matches=G.players[player].deck.filter(c=>c.type===type);
  pickCardsVisual(matches, {title:prompt, subtitle:`From your deck — up to ${maxCount} ${type}(s)`, maxCount, confirmLabel:'Add to Hand', immediate:true},
    (chosen)=>{
      chosen.forEach(c=>{
        if(typeof addCardToHand==='function') addCardToHand(player, c);
        else G.players[player].hand.push(c);
        G.players[player].deck = G.players[player].deck.filter(x=>x.iid!==c.iid);
      });
      shuffle(G.players[player].deck);
      if(chosen.length && typeof playSfx === 'function') playSfx('searchFound');
      renderGame();
      if(chosen.length) toast(`Added ${chosen.length} card(s) to hand`);
    });
}

function searchDeckForCard(player, filter, prompt, callback) {
  const matches=G.players[player].deck.filter(filter);
  pickCardsVisual(matches, {title:prompt, subtitle:'Search your deck', maxCount:1, confirmLabel:'Choose', immediate:true},
    (chosen)=>{
      if(!chosen.length) return;
      const c=chosen[0];
      G.players[player].deck = G.players[player].deck.filter(x=>x.iid!==c.iid);
      shuffle(G.players[player].deck);
      if(typeof playSfx === 'function') playSfx('searchFound');
      if(callback) callback(c);
      renderGame();
    });
}

function searchAnySource(player, filter, prompt, callback) {
  const matches=[...G.players[player].deck,...G.players[player].discard].filter(filter);
  pickCardsVisual(matches, {title:prompt, subtitle:'Search deck and discard', maxCount:1, confirmLabel:'Choose', immediate:true},
    (chosen)=>{
      if(!chosen.length) return;
      const c=chosen[0];
      G.players[player].deck = G.players[player].deck.filter(x=>x.iid!==c.iid);
      G.players[player].discard = G.players[player].discard.filter(x=>x.iid!==c.iid);
      if(typeof playSfx === 'function') playSfx('searchFound');
      if(callback) callback(c);
    });
}

function pickFromDiscard(player, type, prompt, callback) {
  const matches=G.players[player].discard.filter(c=>!type||c.type===type);
  pickCardsVisual(matches, {title:prompt, subtitle:'Pick from discard pile', maxCount:1, confirmLabel:'Choose', immediate:true},
    (chosen)=>{
      if(!chosen.length) return;
      if(callback) callback(chosen[0]);
    });
}

function drawAffiliated(player, aff, count) {
  const from=[...G.players[player].deck,...G.players[player].discard].filter(c=>c.aff===aff);
  if(!from.length){toast('No '+AFF_LABEL[aff]+' cards available');return;}
  let added=0;
  for(const c of from){
    if(added>=count) break;
    G.players[player].hand.push(c);
    G.players[player].deck=G.players[player].deck.filter(x=>x.iid!==c.iid);
    G.players[player].discard=G.players[player].discard.filter(x=>x.iid!==c.iid);
    added++;
  }
  toast(`Added ${added} card(s) to hand`);renderHand();
}

function drawSupportersFromDeckOrDiscard(player, count, cb) {
  const matches=[...G.players[player].deck,...G.players[player].discard].filter(c=>c.type==='Supporter');
  if(!matches.length){toast('No supporters available');if(cb)cb();return;}
  let added=0;
  for(const c of matches){
    if(added>=count) break;
    if(typeof addCardToHand==='function') addCardToHand(player, c);
    else G.players[player].hand.push(c);
    G.players[player].deck=G.players[player].deck.filter(x=>x.iid!==c.iid);
    G.players[player].discard=G.players[player].discard.filter(x=>x.iid!==c.iid);
    added++;
  }
  toast(`Added ${added} supporter(s) to hand`);renderHand();if(cb)cb();
}

function addAffFromDeckDiscard(player, aff) {
  const fromDeck=G.players[player].deck.filter(c=>c.aff===aff);
  const fromDiscard=G.players[player].discard.filter(c=>c.aff===aff);
  const label = AFF_LABEL[aff] || aff;
  let added = 0;
  const addChosen = (card, source) => {
    if(!card) return;
    if(typeof addCardToHand==='function') addCardToHand(player, card);
    else G.players[player].hand.push(card);
    if(source === 'deck') G.players[player].deck=G.players[player].deck.filter(x=>x.iid!==card.iid);
    else G.players[player].discard=G.players[player].discard.filter(x=>x.iid!==card.iid);
    added++;
  };
  const finish = () => {
    if(G.players[player].deck.length) shuffle(G.players[player].deck);
    if(added && typeof playSfx === 'function') playSfx('searchFound');
    toast(`Added ${added} ${label} card(s) to hand`);
    renderGame();
  };
  const chooseDiscard = () => {
    if(!fromDiscard.length){ finish(); return; }
    pickCardsVisual(fromDiscard, {
      title:'Cosmic GF - Discard Search',
      subtitle:`Choose one ${label} card from your discard pile`,
      maxCount:1,
      confirmLabel:'Add to Hand',
      immediate:true
    }, (picked)=>{
      if(picked.length) addChosen(picked[0], 'discard');
      finish();
    });
  };
  if(fromDeck.length){
    pickCardsVisual(fromDeck, {
      title:'Cosmic GF - Deck Search',
      subtitle:`Choose one ${label} card from your deck`,
      maxCount:1,
      confirmLabel:'Add to Hand',
      immediate:true
    }, (picked)=>{
      if(picked.length) addChosen(picked[0], 'deck');
      chooseDiscard();
    });
  } else if(fromDiscard.length){
    chooseDiscard();
  } else {
    toast(`No ${label} cards available`);
  }
}

function showTop5Rearrange(player) {
  const top5=G.players[player].deck.slice(0,5);
  let order=[...top5];
  let html=`<p style="font-size:.82rem;margin-bottom:.5rem">Drag to rearrange (simplified — click to move to top):</p>
    <div style="display:flex;flex-direction:column;gap:.25rem;" id="top5list">`;
  top5.forEach((c,i)=>html+=`<div class="tgt-item" style="cursor:pointer" onclick="moveTop5(${i})">${i+1}. ${c.name}</div>`);
  html+='</div>';
  window._top5=top5;window._top5Player=player;
  showModal('Rearrange Top 5',html,[
    {label:'Done (keep order)',action:()=>{
      G.players[player].deck=[...window._top5,...G.players[player].deck.slice(5)];
      closeModal();toast('Top 5 arranged.');
    }},{label:'Cancel',action:closeModal}]);
}
window.moveTop5=function(i){
  const c=window._top5.splice(i,1)[0];
  window._top5.unshift(c);
  const list=document.getElementById('top5list');
  if(list) list.innerHTML=window._top5.map((c,j)=>`<div class="tgt-item" style="cursor:pointer" onclick="moveTop5(${j})">${j+1}. ${c.name}</div>`).join('');
};

function showAffiliationPicker(callback) {
  // Use the icon-based picker everywhere an affiliation is declared.
  // This keeps Rivera, Duncan, Mark Menz, and any older text-picker callers consistent.
  return showAffiliationPickerVisual(callback);
}

// Visual affiliation picker with 4 icon squares (used by Duncan Heyward)
function showAffiliationPickerVisual(callback) {
  const wait = (typeof getInteractionAnimationDelayMs === 'function' ? getInteractionAnimationDelayMs() : (typeof getPlacementUiDelayMs === 'function' ? getPlacementUiDelayMs() : 0));
  if(wait > 0){ setTimeout(()=>showAffiliationPickerVisual(callback), wait); return; }
  const affs = [
    {key:'reality', label:'Reality', note:'Anchors and anomalies', accent:'#e2c657', glow:'226,198,87'},
    {key:'third_great_war', label:'Third Great War', note:'Front lines and banners', accent:'#e25a4f', glow:'226,90,79'},
    {key:'expanded_worlds', label:'Expanded Worlds', note:'Maps beyond the map', accent:'#49bf69', glow:'73,191,105'},
    {key:'eventide', label:'Eventide', note:'Twilight courts and oaths', accent:'#58c4f0', glow:'88,196,240'}
  ];
  const body = document.getElementById('modal-body');
  document.getElementById('modal-title').textContent = 'Declare Affiliation';
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox) {
    modalBox.classList.add('affiliation-picker-modal');
    modalBox.style.maxWidth = '458px';
  }
  if(body) body.style.overflow = 'visible';
  body.innerHTML = `
    <div class="aff-pick-shell">
      <div class="aff-pick-herald">
        <span class="aff-pick-herald-line"></span>
        <span class="aff-pick-herald-copy">Choose the banner this effect will name</span>
        <span class="aff-pick-herald-line"></span>
      </div>
      <div class="aff-pick-grid">
      ${affs.map(a=>`
        <button class="aff-pick-square" data-aff="${a.key}" type="button" style="--aff-accent:${a.accent};--aff-glow:${a.glow};" aria-label="Declare ${a.label}">
          <span class="aff-pick-icon-frame">
            ${typeof getAffIcon==='function' ? getAffIcon(a.key) : ''}
          </span>
          <span class="aff-pick-label">${a.label}</span>
          <span class="aff-pick-note">${a.note}</span>
        </button>
      `).join('')}
      </div>
    </div>`;
  body.querySelectorAll('.aff-pick-square').forEach(sq=>{
    sq.onclick=()=>{
      closeModal();
      if(typeof playSfx==='function') playSfx('effect');
      callback(sq.dataset.aff);
    };
  });
  document.getElementById('modal-acts').innerHTML = '';
  document.getElementById('modal').classList.add('on');
}


function showZonePickerVisual(options, callback) {
  options = options || {};
  const zoneCount = Array.isArray(G.board) ? G.board.length : 3;
  const title = options.title || 'Choose a Zone';
  const subtitle = options.subtitle || 'Select the zone for this effect.';
  const zoneNames = options.zoneNames || ['Left Zone','Center Zone','Right Zone','Zone 4','Zone 5'];
  const body = document.getElementById('modal-body');
  document.getElementById('modal-title').textContent = title;
  body.innerHTML = `
    <p class="zone-picker-subtitle">${escapePlacementAnimHtml(subtitle)}</p>
    <div class="zone-picker-grid" style="--zone-count:${zoneCount};">
      ${Array.from({length:zoneCount}, function(_, z){
        const hasCards = G.board[z] && G.board[z].some(row=>row.some(Boolean));
        return `
          <button class="zone-picker-tile ${hasCards?'has-cards':''}" data-zone="${z}" type="button">
            <span class="zone-picker-num">Zone ${z+1}</span>
            <span class="zone-picker-name">${escapePlacementAnimHtml(zoneNames[z] || ('Zone '+(z+1)))}</span>
            <span class="zone-picker-count">${countCardsInZone(z)} card${countCardsInZone(z)===1?'':'s'}</span>
          </button>`;
      }).join('')}
    </div>`;
  body.querySelectorAll('.zone-picker-tile').forEach(tile=>{
    tile.onclick = function(){
      const zone = Number(tile.dataset.zone);
      closeModal();
      if(typeof playSfx==='function') playSfx('effect');
      callback(zone);
    };
  });
  document.getElementById('modal-acts').innerHTML = '<button class="btn sm" onclick="closeModal()">Cancel</button>';
  document.getElementById('modal').classList.add('on');
}

function countCardsInZone(z) {
  let count = 0;
  if(!G.board || !G.board[z]) return 0;
  G.board[z].forEach(row=>row.forEach(cell=>{ if(cell) count++; }));
  return count;
}

// Show affiliation change overlay: circular icon faintly flashing over a card
function showAffChangeOverlay(cardInstance, newAff) {
  if(cardInstance){
    cardInstance._affChanged = newAff;
    cardInstance._affChangedBy = cardInstance._affChangedBy || 'affiliation_effect';
  }
  // Find the card's cell element on the board
  let cellEl = null;
  forEachBoardCard((c, z, r, col)=>{
    if(c.iid===cardInstance.iid) {
      cellEl = document.querySelector(`[data-z="${z}"][data-r="${r}"][data-c="${col}"]`);
    }
  });
  if(!cellEl) return;

  // Remove any existing overlays
  cellEl.querySelectorAll('.aff-change-overlay').forEach(e=>e.remove());

  const color = AFF_COLOR[newAff]||'#ccc';
  const svgMarkup = typeof getAffIcon==='function' ? getAffIcon(newAff) : '';

  // Flash overlay: use the stable inline SVG icon, not PNG assets that can flicker/half-render.
  const overlay = document.createElement('div');
  overlay.className = 'aff-change-overlay aff-' + String(newAff).replace(/[^a-z0-9_-]/gi,'');
  if(svgMarkup){
    const colored = svgMarkup.replace('<svg ', '<svg width="24" height="24" style="color:'+color+'" ');
    overlay.innerHTML = '<span class="aff-badge-fallback" style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;color:'+color+';">' + colored + '</span>';
  } else return;
  overlay.style.cssText = 'position:absolute;top:34px;right:5px;width:30px;height:30px;border-radius:999px;overflow:hidden;display:flex;align-items:center;justify-content:center;opacity:0;z-index:54;pointer-events:none;animation:affChangeFlashCorner 1.65s ease forwards;filter:drop-shadow(0 0 10px '+color+');background:linear-gradient(180deg,rgba(12,14,22,.96),rgba(2,3,7,.92));border:1.5px solid rgba(255,232,154,.78);';
  cellEl.style.position = 'relative';
  cellEl.appendChild(overlay);

  setTimeout(()=>{ if(overlay.parentNode) overlay.remove(); }, 2600);
}

// Inject CSS for affiliation change flash animation
(function(){
  const style = document.createElement('style');
  style.textContent = `
    @keyframes affChangeFlash {
      0% { opacity:0; transform:scale(0.5); }
      20% { opacity:0.7; transform:scale(1.12); }
      40% { opacity:0.3; transform:scale(1); }
      60% { opacity:0.65; transform:scale(1.06); }
      80% { opacity:0.25; transform:scale(1); }
      100% { opacity:0; transform:scale(0.9); }
    }
    @keyframes affChangeFlashCorner {
      0% { opacity:0; transform:scale(.55); }
      18% { opacity:.95; transform:scale(1.16); }
      48% { opacity:.62; transform:scale(1); }
      72% { opacity:.88; transform:scale(1.08); }
      100% { opacity:0; transform:scale(.94); }
    }
  `;
  document.head.appendChild(style);
})();

function activateLedgerCopiedSupporterEffect(player, ledgerZone, sourceSupporterInfo) {
  const sourceSupporter = sourceSupporterInfo?.card || sourceSupporterInfo;
  if(!sourceSupporter) return;
  let ledger = null, ledgerRow = -1, ledgerCol = -1;
  G.board[ledgerZone].forEach((row, r)=>row.forEach((cell, c)=>{
    if(cell && cell.id === '75' && cell.owner === player){
      ledger = cell;
      ledgerRow = r;
      ledgerCol = c;
    }
  }));
  if(!ledger || isFaceDownCard(ledger)) return;

  const previousPlayer = G.currentPlayer;
  const previousSuppressPrompt = !!G._suppressEffectPrompt;
  const originalId = ledger.id;
  const originalWhenSetActivated = ledger.whenSetActivated;

  G.currentPlayer = player;
  G._suppressEffectPrompt = true;
  try {
    ledger.id = sourceSupporter.id;
    ledger.whenSetActivated = false;
    runWhenSetEffect(ledger, ledgerZone, ledgerRow, ledgerCol);
  } finally {
    ledger.id = originalId;
    ledger.whenSetActivated = originalWhenSetActivated;
    G._suppressEffectPrompt = previousSuppressPrompt;
    G.currentPlayer = previousPlayer;
  }
}

function pickBoardSupporterEffect(player, z) {
  // Ledger-keepers: copy a supporter effect — visual card picker
  const whenSetIds = ['02','05','14','16','17','18','22','25','26','27','32','33','42','43','51','58','60','68','69','71','72','73','76','80'];
  const supporters=[];
  forEachBoardCard((card,bz,r,c)=>{if(card.type==='Supporter' && whenSetIds.includes(card.id) && !isFaceDownCard(card)) supporters.push({card,z:bz,r,c});});
  if(!supporters.length){toast('No supporters on field');return;}
  window._ledgerSups=supporters;window._ledgerZ=z;window._ledgerPlayer=player;
  const cards = supporters.map(s=>s.card);
  pickCardsVisual(cards, {
    title:'Ledger-keepers: Copy Effect',
    subtitle:'Choose a Supporter on the field to copy its effect',
    maxCount:1,
    showOpponentOverlay:false,
    confirmLabel:'Copy Effect'
  }, (chosen)=>{
    if(!chosen.length) return;
    const idx = cards.indexOf(chosen[0]);
    if(idx<0) return;
    activateLedgerCopiedSupporterEffect(player, z, supporters[idx]);
  });
}
window.ledgerCopy=function(i){
  const s=window._ledgerSups[i];
  closeModal();
  activateLedgerCopiedSupporterEffect(window._ledgerPlayer, window._ledgerZ, s);
};

function showMoveTarget(card, fromZ, fromR, fromC, targetZ, options={}) {
  const open=[];
  const disallowRows = Array.isArray(options.disallowRows) ? new Set(options.disallowRows) : new Set();
  G.board[targetZ].forEach((row,r)=>row.forEach((cell,c)=>{
    if(!cell&&!isBlocked(targetZ,r,c) && !disallowRows.has(r)) open.push({r,c});
  }));
  if(!open.length){toast('No open cells in Zone '+(targetZ+1));return;}
  const openKey = new Set(open.map(p=>`${p.r}:${p.c}`));
  const zoneRows = (G.board[targetZ]||[]).length || 3;
  const gridCols = options.horizontalZones ? 'repeat(3,minmax(90px,1fr))' : 'repeat(3,minmax(64px,1fr))';
  const maxWidth = options.horizontalZones ? '640px' : '320px';
  const body = `
    <p style="font-size:.82rem;margin-bottom:.5rem;">${options.prompt || `Move ${card.name} to an open square in Zone ${targetZ+1}:`}</p>
    <div style="font-family:Cinzel,serif;font-size:.72rem;color:var(--gold);letter-spacing:.08em;text-transform:uppercase;margin-bottom:.5rem;text-align:center;">Zone ${targetZ+1}</div>
    <div style="display:grid;grid-template-columns:${gridCols};gap:6px;max-width:${maxWidth};margin:0 auto;">
      ${Array.from({length: zoneRows * 3}, (_, idx)=>{
        const r = Math.floor(idx / 3);
        const c = idx % 3;
        const row = G.board[targetZ] && G.board[targetZ][r];
        if(!row || c >= row.length){
          return '<div style="aspect-ratio:3/4;border-radius:6px;background:rgba(255,255,255,.03);opacity:.2;"></div>';
        }
        const cell = row[c];
        if(cell){
          const visual = getCardVisualData(cell, getPerspectivePlayerIndex(), {boardPos:{z:targetZ,r,c}});
          return `<div style="aspect-ratio:3/4;border-radius:6px;overflow:hidden;position:relative;border:1px solid rgba(255,255,255,.08);background:#0a0a0f;">
            ${visual.img?`<img src="${visual.img}" alt="" style="width:100%;height:100%;object-fit:cover;object-position:center 25%;">`:`<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.35);font-size:1.4rem;">${getAffIcon(visual.aff)}</div>`}
            <div style="position:absolute;bottom:0;left:0;right:0;padding:5px 3px 3px;background:linear-gradient(to top,rgba(0,0,0,.92),transparent);font-family:Cinzel,serif;font-size:.5rem;text-align:center;">${escapeHtml(visual.name)}</div>
          </div>`;
        }
        const key = `${r}:${c}`;
        if(!openKey.has(key)){
          return '<div style="aspect-ratio:3/4;border-radius:6px;border:1px dashed rgba(255,255,255,.08);background:rgba(255,255,255,.03);"></div>';
        }
        const openIndex = open.findIndex(p=>p.r===r&&p.c===c);
        return `<button class="btn sm pri" onclick="doMove(${openIndex})" style="aspect-ratio:3/4;padding:.4rem;display:flex;align-items:center;justify-content:center;font-family:Cinzel,serif;font-size:.72rem;">Open</button>`;
      }).join('')}
    </div>`;
  window._moveCard=card;window._moveFrom={z:fromZ,r:fromR,c:fromC};window._moveDests=open;window._moveTargetZ=targetZ;
  showModal(options.title || 'Move Card',body,[{label:'Cancel',action:closeModal}]);
}
window.doMove=function(i){
  const dest=window._moveDests[i];const from=window._moveFrom;
  if(window._moveCard.cantBeMoved){toast('This card cannot be moved (Shield Wall)');closeModal();return;}
  G.board[from.z][from.r][from.c]=null;
  G.board[window._moveTargetZ][dest.r][dest.c]=window._moveCard;
  closeModal();toast('Card moved');renderGame();
};

function highlightForBlock(z) {
  toast('Click any square in this zone (empty or occupied) to block consolidation on it');
  G.placing=true;
  G.blockingCell=true;
  const totalRows = G.board[z]?G.board[z].length:3;
  for(let r=0;r<totalRows;r++) {
    const rowCap = typeof getBoardRowCapacity === 'function' ? getBoardRowCapacity(z, r) : 3;
    for(let c=0;c<rowCap;c++){
    // Skip cells already blocked by either Carolyn or Zoe
    const anyBlock = G.blockedCells.some(b=>b.z===z&&b.r===r&&b.c===c);
    if(!anyBlock){
      const el=document.querySelector(`[data-z="${z}"][data-r="${r}"][data-c="${c}"]`);
      if(el) el.classList.add('placeable');
    }
    }
  }
  window._blockZone=z;
}

function highlightAllOpenCells() {
  clearPlaceHighlights();
  for(let z=0;z<3;z++){
    const totalRows = G.board[z]?G.board[z].length:3;
    for(let r=0;r<totalRows;r++) for(let c=0;c<3;c++){
      if(G.board[z][r]&&G.board[z][r][c]===null && !isBlocked(z,r,c)){
        const el=document.querySelector(`[data-z="${z}"][data-r="${r}"][data-c="${c}"]`);
        if(el) el.classList.add('placeable');
      }
    }
  }
}

function renderHandPreview(player) {
  const hand=G.players[player].hand;
  if(!hand.length) return '<em>Empty hand</em>';
  return `<div style="font-size:.82rem">${hand.map(c=>`<div style="padding:.15rem 0;border-bottom:1px solid rgba(255,255,255,.06)">${c.name} (${c.type}, Fate:${c.fate})</div>`).join('')}</div>`;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  HELPERS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function forEachBoardCard(cb) {
  G.board.forEach((zone,z)=>zone.forEach((row,r)=>{
    if(!row) return;
    row.forEach((cell,c)=>{if(cell) cb(cell,z,r,c);});
  }));
}

function getAdjacentCards(z,r,c) {
  // Orthogonal adjacency only (up/down/left/right) — this is the default "adjacent"
  const adj=[];
  const maxRow = G.board[z]?G.board[z].length:3;
  [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc])=>{
    const nr=r+dr,nc=c+dc;
    const rowCapacity = getBoardRowCapacity(z, nr);
    if(nr>=0&&nr<maxRow&&nc>=0&&nc<rowCapacity&&G.board[z][nr]&&G.board[z][nr][nc]) adj.push({card:G.board[z][nr][nc],r:nr,c:nc,z});
  });
  return adj;
}

function getAdjacentAndDiagonalCards(z,r,c) {
  // All 8 surrounding cells — for cards that specify "adjacent or diagonal"
  const adj=[];
  const maxRow = G.board[z]?G.board[z].length:3;
  [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr,dc])=>{
    const nr=r+dr,nc=c+dc;
    const rowCapacity = getBoardRowCapacity(z, nr);
    if(nr>=0&&nr<maxRow&&nc>=0&&nc<rowCapacity&&G.board[z][nr]&&G.board[z][nr][nc]) adj.push({card:G.board[z][nr][nc],r:nr,c:nc,z});
  });
  return adj;
}

function getAffIcon(aff) {
  return ({
    third_great_war: `<svg viewBox="0 0 64 64" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="32" cy="32" r="22" stroke-width="3" opacity=".22"/>
        <path d="M32 13l4 8-4 4-4-4 4-8z" stroke-width="2.8"/>
        <path d="M32 25v21" stroke-width="4"/>
        <path d="M24 31h16" stroke-width="3.2"/>
        <path d="M28 46h8" stroke-width="3.2"/>
        <path d="M18 22l6 6M46 22l-6 6M18 42l6-6M46 42l-6-6" stroke-width="2.8" opacity=".85"/>
      </g>
    </svg>`,
    reality: `<svg viewBox="0 0 64 64" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="32" cy="32" r="12" stroke-width="3.2"/>
        <path d="M32 8v10M32 46v10M8 32h10M46 32h10M15 15l7 7M42 42l7 7M49 15l-7 7M22 42l-7 7" stroke-width="3"/>
      </g>
    </svg>`,
    expanded_worlds: `<svg viewBox="0 0 64 64" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" transform="translate(0,-1.5)">
        <path d="M32 8L56 52H8Z" stroke-width="3.6"/>
        <path d="M32 50L19.5 33H44.5Z" stroke-width="3"/>
        <circle cx="32" cy="39.5" r="4" stroke-width="2.2"/>
      </g>
    </svg>`,
    eventide: `<svg viewBox="0 0 64 64" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path d="M32 8l5 19 19 5-19 5-5 19-5-19-19-5 19-5z" stroke-width="3.2"/>
        <circle cx="32" cy="32" r="7" stroke-width="2.6"/>
      </g>
    </svg>`
  })[aff] || `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="14" fill="none" stroke="currentColor" stroke-width="3.2"/></svg>`;
}

function renderCardHTML(card, count) {
  const aff=AFF_COLOR[card.aff]||'#2a2a3a';
  return `
    <div class="mc-bg" style="background:linear-gradient(160deg,${aff}dd,${aff}44)"></div>
    <div class="mc-top">
      <div class="mc-name">${card.name}</div>
      <div class="mc-fate">${card.fate}</div>
    </div>
    <div class="mc-art">${card.img?`<img src="${card.img}" alt="${card.name}" onerror="this.style.display='none'">`:''}</div>
    <div class="mc-bot">
      <div class="mc-type">${card.type}${card.cost>0?` (${card.xCost?'X':card.cost})`:''}</div>
      <div class="mc-eff">${card.effect}</div>
    </div>
    ${count>0?`<div class="mc-limit">x${count}</div>`:''}`;
}

function log(type, msg) {
  const maxLogEntries = 180;
  G.gameLog.push({type,msg,turn:G.turn});
  if(G.gameLog.length > maxLogEntries) G.gameLog.splice(0, G.gameLog.length - maxLogEntries);
  const panel=document.getElementById('log-panel');
  if(!panel) return;
  const el=document.createElement('div');
  el.className='le '+type;
  el.textContent=`T${G.turn}: ${msg}`;
  panel.appendChild(el);
  while(panel.children.length > maxLogEntries) panel.removeChild(panel.firstElementChild);
  panel.scrollTop=panel.scrollHeight;
}

function toast(msg) {
  if(G._aiAbort) return;
  const el=document.getElementById('toast');
  if(!el) return;
  el.textContent=msg;el.classList.add('on');
  clearTimeout(window._toast);
  window._toast=setTimeout(()=>el.classList.remove('on'),2500);
}

function toggleLog() {
  document.getElementById('log-panel').classList.toggle('on');
}


function normalizeActionBarLayout() {
  const bar = document.getElementById('actbar');
  if(!bar) return;
  // Remove the legacy View Selected button wherever older cached HTML left it.
  Array.from(bar.querySelectorAll('button')).forEach(btn=>{
    const attr = (btn.getAttribute('onclick') || '').replace(/\s+/g,'');
    const label = (btn.textContent || '').trim().toLowerCase();
    if(attr === 'openCardDetail(null)' || label === 'view selected') btn.remove();
  });
  let actions = bar.querySelector('.act-actions');
  if(!actions){
    actions = document.createElement('div');
    actions.className = 'act-actions';
    actions.id = 'act-actions';
    bar.appendChild(actions);
  }
  Array.from(bar.children).forEach(child=>{
    if(child.id === 'act-hint' || child === actions) return;
    if(child.tagName === 'BUTTON' || child.classList.contains('btn')) actions.appendChild(child);
  });
}

function setHint(msg) {
  if(typeof cleanupActionBar === 'function') cleanupActionBar();
  const el = document.getElementById('act-hint');
  if(!el) return;
  el.textContent = msg;
  el.title = msg || '';
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  DISCARD HELPER (handles French Fusiliers return)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function discardBoardCard(card, z, r, c) {
  if(G._aiAbort) return;
  // ALPINE Infantry cannot be discarded
  if(card.id==='76'){toast(card.name+' cannot be discarded');return;}
  // Berkeley Homeless (62): opponent can only discard by expending a hand card
  if(card.berkeleyHomeless && card.owner !== G.currentPlayer){
    const oppHand = G.players[G.currentPlayer].hand;
    if(oppHand.length === 0){
      toast('Cannot discard Berkeley Homeless — you have no cards in hand to expend');
      return;
    }
    pickCardsVisual(oppHand, {
      title: 'Discard a hand card to remove Berkeley Homeless',
      subtitle: 'You must expend a card from your hand to discard this card',
      maxCount: 1,
      minCount: 1,
      confirmLabel: 'Expend & Discard'
    }, (chosen)=>{
      if(chosen.length === 0) return;
      G.players[G.currentPlayer].hand = G.players[G.currentPlayer].hand.filter(c=>c.iid!==chosen[0].iid);
      G.players[G.currentPlayer].discard.push(chosen[0]);
      G.board[z][r][c] = null;
      G.players[card.owner].discard.push(card);
      toast(chosen[0].name+' expended to remove Berkeley Homeless');
      playSfx('discard');
      renderGame();
    });
    return;
  }
  // Try to play discard animation on the DOM element before removing
  const cellEl = document.querySelector(`[data-z="${z}"][data-r="${r}"][data-c="${c}"] .bc`);
  if(cellEl){
    // Fly toward the opponent's discard pile (roughly offscreen for now)
    const isMine = isPerspectivePlayer(card.owner);
    cellEl.style.setProperty('--dx', (isMine?'-200px':'200px'));
    cellEl.style.setProperty('--dy', '250px');
    cellEl.classList.add('discarding');
  }
  G.board[z][r][c] = null;
  playSfx('discard');
  // Berkeley CS Major (50): zone lock persists for its duration,
  // but effect activation suppression stops when Berkeley leaves the field.
  if(card.id==='50' && typeof G._artilleryLockTurnsLeft==='number' && G._artilleryLockTurnsLeft>0){
    G._artilleryEffectBlockLifted = true;
    toast('Berkeley CS Major left the field — effect suppression lifted, but zone lock remains.');
  }
  // Lydia (56): when removed from the field, unsuppress all cards she suppressed
  if(card.id==='56'){
    let unsuppressCount = 0;
    if(typeof forEachBoardCard === 'function') forEachBoardCard(function(bc){
      if(bc && bc._lydiaSuppressed){
        bc._lydiaSuppressed = false;
        unsuppressCount++;
      }
    });
    if(unsuppressCount > 0){
      toast('Lydia left the field — '+unsuppressCount+' Supporter aura(s) restored');
    }
  }
  // French Fusiliers (37): when discarded, return to hand once
  if(card.id==='37' && !card._returnUsed){
    card._returnUsed = true;
    G.players[card.owner].hand.push(card);
    toast(card.name+' returned to hand! Reinforcement is now 0.5.');
    log(card.owner===0?'p1':'p2', card.name+' returned to hand instead of discard');
    renderHand();
  } else if(card._stolenByRobo) {
    // Robo en la Noche stolen cards return to opponent's deck
    const origOwner = card._roboOrigOwner;
    card._stolenByRobo = false;
    G.players[origOwner].deck.push(card);
    shuffleDeck(origOwner);
    toast(`${card.name} returned to opponent's deck`);
  } else {
    G.players[card.owner].discard.push(card);
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  HOVER PREVIEW (for picker/search cards)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
let _hoverPreviewEl = null;
let _hoverPreviewSize = null;
let _hoverPreviewRaf = null;
let _hoverPreviewPoint = null;
let _hoverPreviewAnchorRect = null;
function showHoverPreview(card, e) {
  removeHoverPreview();
  try {
    const game = document.getElementById('s-game');
    const v2Owns = typeof rendererV2OwnsBoardScene === 'function' && rendererV2OwnsBoardScene();
    if(game && game.classList && game.classList.contains('active') && v2Owns) return;
  } catch(_e) {}
  const el = document.createElement('div');
  el.className = 'card-hover-preview';
  el.innerHTML = `
    <div class="chp-art">${card.img?`<img src="${card.img}" alt="${card.name}">`:`<span style="font-size:2.5rem;opacity:.3">${getAffIcon(card.aff)}</span>`}</div>
    <div class="chp-info">
      <div class="chp-name">${card.name}</div>
      <div class="chp-ability">${card.ability}</div>
      <div class="chp-pills">
        <span class="chp-pill">${card.type}${card.cost>0?` (${card.xCost?'X':card.cost})`:''}</span>
        <span class="chp-pill" style="border-color:var(--fate);color:var(--fate);">⭐ ${card.fate}</span>
        <span class="chp-pill">${AFF_LABEL[card.aff]||card.aff}</span>
      </div>
      <div class="chp-eff">${card.effect}</div>
    </div>`;
  document.body.appendChild(el);
  _hoverPreviewEl = el;
  _hoverPreviewSize = null;
  positionHoverPreview(e);
}
function positionHoverPreview(e) {
  if(!_hoverPreviewEl) return;
  _hoverPreviewPoint = { x:e.clientX, y:e.clientY };
  const anchorEl = e && e.target && e.target.closest ? e.target.closest('.bc,.opp-card-back,.deck-slot,.discard-slot,.preset-browse-tile') : null;
  const currentEl = e && e.currentTarget && e.currentTarget.getBoundingClientRect ? e.currentTarget : null;
  const rectEl = anchorEl || currentEl;
  _hoverPreviewAnchorRect = rectEl && rectEl.getBoundingClientRect ? rectEl.getBoundingClientRect() : null;
  if(_hoverPreviewRaf) return;
  _hoverPreviewRaf = requestAnimationFrame(()=>{
    _hoverPreviewRaf = null;
    if(!_hoverPreviewEl || !_hoverPreviewPoint) return;
    if(!_hoverPreviewSize){
      const rect = _hoverPreviewEl.getBoundingClientRect();
      _hoverPreviewSize = { w:rect.width || 280, h:rect.height || 360 };
    }
    const p = _hoverPreviewPoint;
    const w = _hoverPreviewSize.w, h = _hoverPreviewSize.h;
    const anchor = _hoverPreviewAnchorRect;
    let x = anchor ? anchor.left - w - 34 : p.x - w - 96, y = p.y - 20;
    if(x < 10) x = p.x + 16;
    if(x + w > window.innerWidth - 10) x = window.innerWidth - w - 10;
    if(y + h > window.innerHeight - 10) y = window.innerHeight - h - 10;
    if(y < 10) y = 10;
    _hoverPreviewEl.style.transform = `translate3d(${Math.round(x)}px,${Math.round(y)}px,0)`;
  });
}
function removeHoverPreview() {
  if(_hoverPreviewRaf) { cancelAnimationFrame(_hoverPreviewRaf); _hoverPreviewRaf = null; }
  if(_hoverPreviewEl) { _hoverPreviewEl.remove(); _hoverPreviewEl = null; }
  _hoverPreviewSize = null;
  _hoverPreviewPoint = null;
  _hoverPreviewAnchorRect = null;
}

// ── CARD INFO OVERLAY (shows card detail on top of an open modal) ──
function showCardInfoOverlay(card) {
  if(!card) return;
  dismissCardInfoOverlay();
  var visual = getCardVisualData(card, typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : 0);
  var cardArt = visual.img
    ? '<img src="'+visual.img+'" alt="'+escapeHtml(visual.name)+'" decoding="async" loading="eager">'
    : '<span style="font-size:3rem;opacity:.3">'+getAffIcon(visual.aff)+'</span>';
  var voiceButton = (visual.type !== 'Supporter')
    ? '<button type="button" class="card-voice-btn" title="Play voiceline" onclick="event.stopPropagation(); if(typeof playCardSound===\'function\') playCardSound(\''+escapeHtml(card.id)+'\');">&#9835;</button>'
    : '';
  var loreButton = (typeof window.hasCardLorePage === 'function' && window.hasCardLorePage(card))
    ? '<button type="button" class="btn sm card-info-overlay-lore">Lore</button>'
    : '';
  var overlay = document.createElement('div');
  overlay.className = 'card-info-overlay';
  overlay.innerHTML =
    '<div class="card-info-overlay-backdrop"></div>'+
    '<div class="card-info-overlay-panel">'+
      '<div class="cd-wrap">'+
        '<div class="cd-img">'+cardArt+'</div>'+
        '<div class="cd-info">'+
          '<div class="cd-name cd-name-with-audio"><span>'+visual.name+'</span>'+voiceButton+'</div>'+
          '<div class="cd-ability">'+visual.ability+'</div>'+
          '<div class="cd-pills">'+
            '<span class="pill type">'+visual.type+(visual.cost>0?' ('+(visual.xCost?'X':visual.cost)+')':'')+'</span>'+
            '<span class="pill fate">'+visual.fate+' Fate</span>'+
            '<span class="pill">'+(AFF_LABEL[visual.aff]||visual.aff)+'</span>'+
          '</div>'+
          '<div class="cd-eff">'+visual.effect+'</div>'+
          (card.flavor?'<div class="cd-flavor">'+card.flavor+'</div>':'')+
        '</div>'+
      '</div>'+
      '<div class="cio-acts">'+loreButton+'<button type="button" class="btn sm card-info-overlay-close">Close</button></div>'+
    '</div>';
  overlay.querySelector('.card-info-overlay-backdrop').onclick = dismissCardInfoOverlay;
  overlay.querySelector('.card-info-overlay-close').onclick = dismissCardInfoOverlay;
  overlay.querySelectorAll('.card-info-overlay-lore').forEach(function(btn){
    btn.onclick = function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      if(typeof window.openCardLoreFromInfo === 'function') window.openCardLoreFromInfo(card);
    };
  });
  overlay.querySelector('.card-info-overlay-panel').onclick = function(ev){ ev.stopPropagation(); };
  document.body.appendChild(overlay);
  requestAnimationFrame(function(){ overlay.classList.add('on'); });
}
function dismissCardInfoOverlay() {
  var el = document.querySelector('.card-info-overlay');
  if(el) el.remove();
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  EFFECT ACTIVATION FLASH
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function showFinalZoneReveal(zResults, opts) {
  opts = opts || {};
  const zones = Array.isArray(zResults) ? zResults : [];
  document.querySelectorAll('#board .zone.final-zone-board-flash').forEach(function(el){
    el.classList.remove('final-zone-board-flash','final-zone-board-p1','final-zone-board-p2','final-zone-board-tie');
    el.style.removeProperty('--final-zone-delay');
    el.removeAttribute('data-final-zone-label');
    el.removeAttribute('data-final-zone-score');
  });
  zones.forEach(function(zr, i){
    const z = Number(zr.z);
    const ctrl = Number.isInteger(zr.ctrl) ? zr.ctrl : -1;
    const zoneEl = document.querySelector('#board .zone[data-zone="'+z+'"]');
    if(!zoneEl) return;
    zoneEl.style.setProperty('--final-zone-delay', (i * 280) + 'ms');
    const label = ctrl === 0 ? (G.players?.[0]?.name || 'Player 1') : ctrl === 1 ? (G.players?.[1]?.name || 'Player 2') : 'Tied';
    zoneEl.dataset.finalZoneLabel = ctrl >= 0 ? (label + ' controls') : 'Zone tied';
    zoneEl.dataset.finalZoneScore = String(zr.s0 || 0) + ' - ' + String(zr.s1 || 0);
    zoneEl.classList.add('final-zone-board-flash', ctrl === 0 ? 'final-zone-board-p1' : ctrl === 1 ? 'final-zone-board-p2' : 'final-zone-board-tie');
  });
  if(typeof playSfx === 'function') zones.forEach(function(_, i){ setTimeout(function(){ playSfx('hover'); }, 180 + i * 280); });
  setTimeout(function(){
    document.querySelectorAll('#board .zone.final-zone-board-flash').forEach(function(el){
      el.classList.remove('final-zone-board-flash','final-zone-board-p1','final-zone-board-p2','final-zone-board-tie');
      el.style.removeProperty('--final-zone-delay');
      el.removeAttribute('data-final-zone-label');
      el.removeAttribute('data-final-zone-score');
    });
    if(typeof opts.onComplete === 'function') opts.onComplete();
  }, 2180);
}

function showBlockedAnimation(msg) {
  if(G._aiAbort) return;
  playSfx('zoneBlock');
  const flash = document.createElement('div');
  flash.className = 'effect-blocked-flash';
  const text = String(msg || 'BLOCKED').replace(/^\s*!\s*/, '').replace(/\s*!+\s*$/, '');
  flash.innerHTML = `<div class="ebf-inner">${escapeHtml(text)}!</div>`;
  document.body.appendChild(flash);
  setTimeout(()=>flash.remove(), 4500);
}

function showEffectFlash(card) {
  return;
}

// Consolidation visual — golden energy swirl on the target cell
function showConsolidateVisual(z,r,c) {
  if(G._aiAbort) return;
  const cellEl = document.querySelector(`[data-z="${z}"][data-r="${r}"][data-c="${c}"]`);
  if(!cellEl) return;
  const fx = document.createElement('div');
  fx.style.cssText='position:absolute;inset:-6px;z-index:20;pointer-events:none;border-radius:6px;'+
    'background:radial-gradient(circle,rgba(201,168,76,.5),rgba(201,168,76,0) 70%);'+
    'box-shadow:0 0 30px rgba(201,168,76,.6),0 0 60px rgba(201,168,76,.3);'+
    'animation:consolidate-burst .9s ease-out forwards;';
  cellEl.appendChild(fx);
  setTimeout(()=>fx.remove(),950);
}


function showMariaDiscardBadge(targetCard, count, z, r, c) {
  if(typeof document === 'undefined') return;
  const safeCount = Math.max(0, Number(count) || 0);
  const cardName = targetCard && targetCard.name ? targetCard.name : 'card';
  let host = null;
  const cellEl = (z != null && r != null && c != null)
    ? document.querySelector('#board .cell[data-z="'+z+'"][data-r="'+r+'"][data-c="'+c+'"]')
    : null;
  const badge = document.createElement('div');
  badge.className = 'maria-discard-badge';
  badge.innerHTML = '<div class="mdb-count">×'+safeCount+'</div><div class="mdb-label">'+escapeHtml(cardName)+' discarded</div>';
  if(cellEl){
    const rect = cellEl.getBoundingClientRect();
    badge.style.left = (rect.left + rect.width / 2) + 'px';
    badge.style.top = Math.max(72, rect.top - 10) + 'px';
    badge.classList.add('anchored');
  } else {
    badge.style.left = '50%';
    badge.style.top = '26%';
  }
  document.body.appendChild(badge);
  if(typeof playSfx === 'function') playSfx('discard');
  setTimeout(function(){ badge.classList.add('out'); }, 1650);
  setTimeout(function(){ if(badge.parentNode) badge.remove(); }, 2150);
}


const CINEMATIC_VOICELINES = Object.freeze({
  "1": "Duty to one's country first",
  "2": "To the ends of the world",
  "3": "This reminds me of that one time we played the card game",
  "4": "You\u2019re very concerning",
  "6": "In caribbea, the sun never sets",
  "7": "Hey look over there, your divisions are encircled",
  "8": "I got fired from my job over Chinese lesbians",
  "10": "Eternity draws ever closer to nothingless",
  "11": "Agree to these terms, or you might find an exploding pineapple on your doorstep one day",
  "12": "A robbery in the night...we must rescue the birds",
  "13": "The commonwealth will unite against this threat",
  "14": "you look exactly like the last 97 men I decapitated!",
  "15": "The sword of King Stephen I will fall upon you!",
  "17": "Ummmm....Lydia...I may have accidentally gave sentience to this chocolate chip cookie from croads.",
  "19": "Czechoslovakia, a lovers quarrel in a nation",
  "21": "All that is solid melts into air, all that is holy is profaned",
  "22": "Yeah, science is pretty dang cool",
  "23": "Riiiight",
  "27": "I wonder what happened in the old age...",
  "29": "Liberty, equality, and the pursuit of happiness",
  "30": "Cowards sink",
  "34": "I have a legacy, a country, to protect",
  "35": "The armies of Greece welcome you with open arms!",
  "36": "France will not fall this day",
  "38": "Hahahahahahahaaaaaa",
  "39": "Show no mercy to the tyrants!",
  "41": "I'm lagging, I'm lagging bro!",
  "43": "Anyone wanna fill me in on who this Hitler guy was",
  "45": "There is no more frontier, nowhere I can run",
  "46": "Which is more evil, the banker, or the money?",
  "48": "Before me, reality bows, darkness flees",
  "51": "Everything I do is to protect the one I love",
  "55": "Ahaha...every swing of my blade leaves a chasm in the cosmic fabric",
  "56": "Your godlike powers, versus my rusty sword and undeeeniable face card",
  "57": "We have things in these mountains you'd never dream of",
  "40": "I know it sucks watching me dismemeber, decapitate, and disembowel your mother like that, but for Christ's sake, she was a zombie!",
  "61": "There's no point trying to run. I'll just put a bullet through your skull.",
  "66": "Look at Curry man, so inspirational",
  "67": "You just said nothing",
  "77": "My heart no longer sings...I've walked a thousand lives of men"
});

function getCinematicVoiceline(card) {
  if(!card) return '';
  const rawId = card.id != null ? String(card.id).trim() : '';
  const imgId = card.img ? String(card.img).split('/').pop().replace(/\.[^.]+$/, '') : '';
  const candidates = [rawId, rawId.replace(/^0+/, ''), imgId, imgId.replace(/^0+/, '')]
    .map(function(v){ return String(v || '').trim(); })
    .filter(Boolean);
  for(const id of candidates){
    if(CINEMATIC_VOICELINES[id]) return CINEMATIC_VOICELINES[id];
    const digits = id.match(/\d+/);
    if(digits){
      const numericId = String(parseInt(digits[0], 10));
      if(CINEMATIC_VOICELINES[numericId]) return CINEMATIC_VOICELINES[numericId];
    }
  }
  return '';
}

function showCinematicSubtitle(cardOrLine, durationMs, rarity) {
  const line = typeof cardOrLine === 'string' ? cardOrLine : getCinematicVoiceline(cardOrLine);
  if(!line) return null;
  if(document.body && document.body.classList.contains('modal-open')) return null;
  document.querySelectorAll('.cinematic-subtitle-live').forEach(function(el){ el.remove(); });
  const el = document.createElement('div');
  el.className = 'cinematic-subtitle-live rarity-' + String(rarity || (cardOrLine && cardOrLine.rarity) || 'circle').toLowerCase();
  el.setAttribute('aria-live', 'polite');
  el.textContent = '“' + line + '”';
  // Inline visibility is intentional: older patches hide cinematic text elements.
  el.style.cssText = 'display:block!important;visibility:visible!important;position:fixed!important;left:50%!important;bottom:27vh!important;transform:translateX(-50%)!important;z-index:2147483000!important;width:min(84vw,960px)!important;max-width:960px!important;text-align:center!important;pointer-events:none!important;opacity:1!important;';
  document.body.appendChild(el);
  try {
    const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
    const lineHeight = style ? (parseFloat(style.lineHeight) || (parseFloat(style.fontSize) * 1.18)) : 0;
    const h = el.getBoundingClientRect ? el.getBoundingClientRect().height : 0;
    if(lineHeight > 0 && h > lineHeight * 1.45) {
      el.classList.add('multi-line');
      el.style.setProperty('bottom', '6vh', 'important');
    }
  } catch(e) {}
  const ttl = Math.max(900, Number(durationMs) || 2200);
  setTimeout(function(){ el.classList.add('fade-out'); }, Math.max(400, ttl - 520));
  setTimeout(function(){ if(el.parentNode) el.remove(); }, ttl + 120);
  return el;
}

let _consolidationCinematicQueue = [];
let _consolidationCinematicShowing = false;
if(typeof window !== 'undefined' && !window.__fateRenderV2ConsolidationQueueCleanupInstalled) {
  const previousConsolidationQueueCleanup = window.clearConsolidationCinematicQueues;
  window.clearConsolidationCinematicQueues = function(){
    if(typeof previousConsolidationQueueCleanup === 'function') previousConsolidationQueueCleanup();
    _consolidationCinematicQueue.length = 0;
    _consolidationCinematicShowing = false;
  };
  window.__fateRenderV2ConsolidationQueueCleanupInstalled = true;
}
function showConsolidationCinematic(card, opts) {
  if(typeof G !== 'undefined' && G && G._aiAbort) return;
  if(!card) return;
  opts = opts || {};
  const activeOverlay = document.querySelector('.consolidation-cinematic-overlay');
  if(activeOverlay || _consolidationCinematicShowing){
    _consolidationCinematicQueue.push({card: card, opts: Object.assign({}, opts)});
    return;
  }
  _consolidationCinematicShowing = true;
  const rarity = String(card.rarity || 'circle').toLowerCase();
  const colorMap = {
    star: '#e6a51f',      // star = deeper gold
    square: '#d67fff',    // square = purple
    triangle: '#5ee37a',  // triangle = green
    circle: '#f7f3e8'     // circle = white
  };
  const color = colorMap[rarity] || colorMap.circle;
  const label = rarity ? rarity.toUpperCase() : 'CONSOLIDATED';
  const img = card.img ? '<img src="' + escapeHtml(card.img) + '" alt="' + escapeHtml(card.name || 'Consolidated card') + '">' : '<div class="consolidation-cinematic-fallback">' + (typeof getAffIcon === 'function' ? getAffIcon(card.aff) : '◆') + '</div>';
  const subtitle = getCinematicVoiceline(card);
  const overlay = document.createElement('div');
  overlay.className = 'consolidation-cinematic-overlay rarity-' + rarity;
  overlay.style.setProperty('--cc-color', color);
  const starExtras = rarity === 'star'
    ? '<div class="cc-star-ribbons" aria-hidden="true"><span></span><span></span></div>'
    : '';
  overlay.innerHTML = '<div class="consolidation-cinematic-vignette"></div>' +
    starExtras +
    '<div class="cc-particles" aria-hidden="true"><span></span><span></span></div>' +
    '' +
    '<div class="consolidation-cinematic-card">' + img + '</div>';
  document.body.appendChild(overlay);
  const cinematicImg = overlay.querySelector('.consolidation-cinematic-card img');
  if(cinematicImg){
    cinematicImg.onerror = function(){
      const fallback = document.createElement('div');
      fallback.className = 'consolidation-cinematic-fallback';
      fallback.textContent = typeof getAffIcon === 'function' ? getAffIcon(card.aff) : '*';
      cinematicImg.replaceWith(fallback);
    };
  }
  if(subtitle && typeof showCinematicSubtitle === 'function') setTimeout(function(){
    var subEl = showCinematicSubtitle(subtitle, 2850, rarity);
    if(subEl && overlay && overlay.isConnected){
      overlay.appendChild(subEl);
      subEl.classList.add('inside-consolidation-cinematic');
      subEl.style.setProperty('position', 'absolute', 'important');
      subEl.style.setProperty('left', '50%', 'important');
      subEl.style.setProperty('bottom', '27vh', 'important');
      subEl.style.setProperty('transform', 'translateX(-50%)', 'important');
      subEl.style.setProperty('z-index', '6', 'important');
    }
  }, 360);
  document.body.classList.add('cinematic-lock');
  if(typeof G !== 'undefined' && G) G._cinematicUiLockUntil = Math.max(G._cinematicUiLockUntil || 0, Date.now() + 2350);

  // Play the on-set voiceline and summon SFX with the full-screen cinematic, not before it.
  if(opts.playVoice !== false && typeof playCardSound === 'function') playCardSound(card.id);
  if(opts.playSfx !== false && typeof playSfx === 'function') {
    const sfx = rarity === 'star' ? 'starPlace' : (rarity === 'square' ? 'squarePlace' : (rarity === 'triangle' ? 'trianglePlace' : 'charSummon'));
    playSfx(sfx);
  }

  setTimeout(function(){ overlay.classList.add('fade-out'); }, 1850);
  setTimeout(function(){
    overlay.remove();
    if(!document.querySelector('.consolidation-cinematic-overlay')) document.body.classList.remove('cinematic-lock');
    _consolidationCinematicShowing = false;
    const next = _consolidationCinematicQueue.shift();
    if(next) setTimeout(function(){ showConsolidationCinematic(next.card, next.opts); }, 90);
  }, 2350);

  // Safety: if the flag is still stuck after 4 seconds, force cleanup
  setTimeout(function(){
    if(_consolidationCinematicShowing){
      _consolidationCinematicShowing = false;
      document.querySelectorAll('.consolidation-cinematic-overlay').forEach(function(el){ el.remove(); });
      document.body.classList.remove('cinematic-lock');
      var next = _consolidationCinematicQueue.shift();
      if(next) showConsolidationCinematic(next.card, next.opts);
    }
  }, 4000);
}

// Effect activation glow — subtle on-field pulse for manually/reactively activated characters.
function showEffectActivationGlow(z, r, c, card) {
  if(typeof document === 'undefined') return;
  const cellEl = document.querySelector('#board .cell[data-z="'+z+'"][data-r="'+r+'"][data-c="'+c+'"]');
  if(!cellEl) return;
  const cardEl = cellEl.querySelector('.bc');
  if(!cardEl) return;
  const rarity = String((card && card.rarity) || '').toLowerCase() || 'circle';
  const aff = String((card && card.aff) || '').replace(/[^a-z0-9_-]/gi,'');
  cardEl.classList.remove('effect-activate-onfield','effect-activate-star','effect-activate-square','effect-activate-triangle','effect-activate-circle');
  void cardEl.offsetWidth;
  cardEl.classList.add('effect-activate-onfield','effect-activate-' + rarity);
  const pulse = document.createElement('div');
  pulse.className = 'effect-activation-aura rarity-' + rarity + (aff ? ' aff-' + aff : '');
  pulse.innerHTML = '<span class="eaa-ring"></span><span class="eaa-spark eaa-s1"></span><span class="eaa-spark eaa-s2"></span><span class="eaa-spark eaa-s3"></span>';
  cardEl.appendChild(pulse);
  const cleanup = function(){
    cardEl.classList.remove('effect-activate-onfield','effect-activate-star','effect-activate-square','effect-activate-triangle','effect-activate-circle');
    if(pulse.parentNode) pulse.remove();
  };
  setTimeout(cleanup, 780);
}


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


// ═══════════════════════════════════════════════════════════════
//  ACTIVE EFFECTS PANEL — shows persistent effects on screen
// ═══════════════════════════════════════════════════════════════
function updateActiveEffectsPanel() {
  // Effects now rendered in topbar via renderTopbarEffects()
}

// ═══════════════════════════════════════════════════════════════
//  LAST TURN BANNER — large brief announcement

// ═══════════════════════════════════════════════════════════════
//  BLOCK VISUAL — Carolyn lock / Zoe no-consolidation overlay
// ═══════════════════════════════════════════════════════════════


// ===================================================================
//  REVEALED HAND WINDOW — shows all revealed cards in opponent hand
// ===================================================================
function showRevealedHandWindow(playerIdx) {
  const hand = G.players[playerIdx].hand;
  const revealed = G._revealedCards || {};
  const revealedCards = hand.filter(c => revealed[c.iid]);

  if(revealedCards.length === 0) {
    toast('No revealed cards in ' + G.players[playerIdx].name + "'s hand");
    return;
  }

  const body = document.createElement('div');
  body.innerHTML = '<p style="font-size:.82rem;color:var(--dim);font-style:italic;margin-bottom:.7rem;">' +
    revealedCards.length + ' of ' + hand.length + ' cards revealed in ' + escapeHtml(G.players[playerIdx].name) + "'s hand</p>" +
    '<div class="visual-grid"></div>';
  const grid = body.querySelector('.visual-grid');

  revealedCards.forEach(c => {
    const el = document.createElement('div');
    el.className = 'mc visual-mc';
    el.innerHTML = '<div class="mc-art">' + (c.img ? '<img src="' + c.img + '" alt="' + escapeHtml(c.name) + '">' : '<span class="mc-ico">' + getAffIcon(c.aff) + '</span>') + '</div>' +
      '<div class="mc-fate">' + c.fate + '</div>' +
      '<div class="visual-name">' + escapeHtml(c.name) + '</div>';
    el.onclick = () => openCardDetail(c);
    el.title = c.name + ' - Click for details';
    grid.appendChild(el);
  });

  // Also show count of hidden cards
  const hiddenCount = hand.length - revealedCards.length;
  if(hiddenCount > 0) {
    const hiddenEl = document.createElement('div');
    hiddenEl.style.cssText = 'grid-column:1/-1;text-align:center;padding:.5rem;color:var(--dim);font-size:.72rem;font-style:italic;border-top:1px solid var(--border);margin-top:.4rem;padding-top:.6rem;';
    hiddenEl.textContent = '+ ' + hiddenCount + ' hidden card' + (hiddenCount > 1 ? 's' : '');
    grid.appendChild(hiddenEl);
  }

  showModal(G.players[playerIdx].name + "'s Revealed Cards", '', [{label: 'Close', action: closeModal}]);
  document.getElementById('modal-body').innerHTML = '';
  document.getElementById('modal-body').appendChild(body);
}

function normalizeBlockedCells() {
  if(!G || !Array.isArray(G.blockedCells)) { if(G) G.blockedCells = []; return []; }
  const seen = new Map();
  G.blockedCells.forEach(function(b){
    if(!b) return;
    const z = Number(b.z), r = Number(b.r), c = Number(b.c);
    if(!Number.isFinite(z) || !Number.isFinite(r) || !Number.isFinite(c)) return;
    const type = b.type === 'carolyn' ? 'carolyn' : 'zoe';
    const key = z + ':' + r + ':' + c;
    const prev = seen.get(key);
    // Carolyn is stronger; keep her if duplicate blocks ever exist.
    if(!prev || type === 'carolyn') seen.set(key, Object.assign({}, b, {z,r,c,type}));
  });
  G.blockedCells = Array.from(seen.values());
  return G.blockedCells;
}

function showBlockVisual(z, r, c, blockType) {
  const cellEl = document.querySelector('[data-z="'+z+'"][data-r="'+r+'"][data-c="'+c+'"]');
  if(!cellEl) return;

  // Remove every old block overlay on this cell. A single querySelector only
  // removed the first one, which could leave Zoe markers stacking after renders.
  cellEl.querySelectorAll('.block-overlay').forEach(function(el){ el.remove(); });

  const overlay = document.createElement('div');
  overlay.className = 'block-overlay block-' + blockType;
  overlay.dataset.blockKey = z + ':' + r + ':' + c;

  if(blockType === 'carolyn') {
    overlay.innerHTML = '<div class="block-icon carolyn-lock-icon" aria-label="Carolyn lock"></div>';
    overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:80;border-radius:4px;';
  } else {
    overlay.innerHTML = '<div class="block-icon">−</div><div class="block-label">NO CONSOLIDATE</div>';
    overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:82;border-radius:7px;';
  }

  cellEl.style.position = 'relative';
  cellEl.appendChild(overlay);
}

// Re-render block overlays after each renderGame
function refreshBlockOverlays() {
  // Clear old overlays everywhere first so persistent effects never stack.
  document.querySelectorAll('.block-overlay').forEach(function(el){ el.remove(); });
  const blocks = normalizeBlockedCells();
  blocks.forEach(function(b){ showBlockVisual(b.z, b.r, b.c, b.type); });
}

// ═══════════════════════════════════════════════════════════════
function showLastTurnBanner(playerName, isFinalTurn) {
  const existing = document.getElementById('last-turn-banner');
  if(existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'last-turn-banner';
  const text = isFinalTurn ? 'FINAL TURN' : (playerName + '\'s LAST TURN');
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;z-index:9000;pointer-events:none;animation:lastTurnIn .6s ease;';
  banner.innerHTML = '<div style="font-family:Cinzel,serif;font-size:2.4rem;font-weight:900;color:#f6fbff;text-shadow:0 0 26px rgba(105,190,255,.75),0 0 62px rgba(255,80,80,.35),0 4px 12px rgba(0,0,0,.85);letter-spacing:.15em;text-transform:uppercase;animation:lastTurnPulse 1.5s ease;">' + text + '</div>';

  document.body.appendChild(banner);

  if(typeof playSfx === 'function') playSfx('lastTurn');

  setTimeout(() => {
    if(banner.parentNode) {
      banner.style.animation = 'lastTurnOut .5s ease forwards';
      setTimeout(() => { if(banner.parentNode) banner.remove(); }, 500);
    }
  }, 2000);
}

// Pick a card from ANY zone (for effects like Juan Carlos)
function pickCardFromAnyZone(prompt, callback, filter) {
  const wait = (typeof getInteractionAnimationDelayMs === 'function' ? getInteractionAnimationDelayMs() : (typeof getPlacementUiDelayMs === 'function' ? getPlacementUiDelayMs() : 0));
  if(wait > 0){
    setTimeout(function(){ pickCardFromAnyZone(prompt, callback, filter); }, wait);
    return;
  }
  const cp = G.currentPlayer;
  const viewerP = getPerspectivePlayerIndex();
  const body = document.createElement('div');
  body.className = 'maria-any-zone-picker any-zone-picker-board';
  body.innerHTML = '<p style="font-size:.82rem;color:var(--dim);font-style:italic;margin-bottom:.5rem;">'+prompt+'</p>' +
    '<p style="font-size:.68rem;color:var(--dim);margin-bottom:.6rem;">' +
      '<span style="color:var(--p1)">● Your cards</span>' +
      '<span style="color:var(--p2);margin-left:1rem;">● Opponent</span>' +
      '<span style="color:#444;margin-left:1rem;">● Not targetable</span>' +
    '</p>';
  
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:row;gap:.8rem;align-items:flex-start;justify-content:center;flex-wrap:wrap;';
  
  let chosen = null;
  let chosenEl = null;
  
  for(let z=0;z<3;z++){
    const zoneWrap = document.createElement('div');
    zoneWrap.style.cssText = 'display:flex;flex-direction:column;gap:.35rem;align-items:center;flex:1 1 220px;max-width:260px;';
    const zLabel = document.createElement('div');
    zLabel.style.cssText = 'font-family:Cinzel,serif;font-size:.7rem;color:var(--gold);letter-spacing:.1em;text-transform:uppercase;';
    zLabel.textContent = 'Zone '+(z+1);
    zoneWrap.appendChild(zLabel);
    
    // Build the full visible zone, including extra safe rows from effects.
    const zoneGrid = document.createElement('div');
    zoneGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:5px;width:100%;max-width:360px;';
    const totalRows = G.board[z] ? G.board[z].length : 3;
    
    for(let r=0;r<totalRows;r++){
      const rowCap = typeof getBoardRowCapacity === 'function' ? getBoardRowCapacity(z, r) : 3;
      for(let c=0;c<rowCap;c++){
        var cell = G.board[z]&&G.board[z][r]?G.board[z][r][c]:null;
        var cellEl = document.createElement('div');
        cellEl.style.cssText = 'width:100%;aspect-ratio:3/4;background:rgba(0,0,0,.5);border:1.5px solid rgba(255,255,255,.1);border-radius:4px;overflow:hidden;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:border-color .15s,box-shadow .15s,transform .12s;position:relative;contain:layout style paint;';
        
        if(!cell){
          cellEl.innerHTML = '<span style="font-size:.5rem;color:#333;font-family:Cinzel,serif;">empty</span>';
          cellEl.style.cursor = 'default';
          cellEl.style.background = 'rgba(0,0,0,.3)';
        } else {
          var ok = !filter || filter(cell);
          var visual = getCardVisualData(cell, viewerP, {boardPos:{z,r,c}});
          cellEl.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#0a0a0f;">' +
            (visual.img?'<img src="'+visual.img+'" style="width:100%;height:100%;object-fit:cover;object-position:center 25%;" loading="lazy" decoding="async">':'<span style="font-size:1.4rem;opacity:.4;">'+getAffIcon(visual.aff)+'</span>') +
            '</div>' +
            '<div style="position:absolute;top:2px;right:2px;z-index:2;background:rgba(0,0,0,.85);border:1px solid var(--fate);color:var(--fate);font-family:Cinzel,serif;font-size:.6rem;font-weight:700;padding:.05rem .22rem;border-radius:2px;min-width:14px;text-align:center;">'+visual.displayFate+'</div>' +
            '<div style="position:absolute;bottom:0;left:0;right:0;z-index:2;background:linear-gradient(to top,rgba(0,0,0,.9),transparent);padding:6px 3px 3px;text-align:center;"><span style="font-family:Cinzel,serif;font-size:.5rem;color:#fff;font-weight:600;text-shadow:0 1px 2px #000;">'+visual.name+'</span></div>';
          if(!ok){
            cellEl.style.opacity = '.3';
            cellEl.style.cursor = 'not-allowed';
          } else {
            cellEl.style.borderColor = cell.owner===cp?'rgba(58,143,217,.6)':'rgba(217,74,74,.6)';
            cellEl.style.boxShadow = cell.owner===cp?'0 0 6px rgba(58,143,217,.2)':'0 0 6px rgba(217,74,74,.2)';
            (function(_cell,_z,_r,_c,_el){
              _el.onmouseenter = function(){ if(_el!==chosenEl) _el.style.transform='translateY(-2px)'; };
              _el.onmouseleave = function(){ if(_el!==chosenEl) _el.style.transform=''; };
              _el.onclick = function(){
                if(chosenEl){ chosenEl.style.boxShadow = chosenEl.dataset.origShadow||''; chosenEl.style.transform=''; }
                chosen = {card:_cell,z:_z,r:_r,c:_c};
                _el.dataset.origShadow = _el.style.boxShadow;
                chosenEl = _el;
                _el.style.boxShadow = '0 0 0 2px var(--gold),0 0 14px rgba(201,168,76,.4)';
                _el.style.transform = 'translateY(-2px)';
              };
            })(cell,z,r,c,cellEl);
          }
        }
        zoneGrid.appendChild(cellEl);
      }
    }
    zoneWrap.appendChild(zoneGrid);
    wrap.appendChild(zoneWrap);
  }
  body.appendChild(wrap);
  
  showModal('Select Target','',
    [{label:'Cancel',action:closeModal},
     {label:'Confirm',pri:true,action:function(){
       if(!chosen){toast('Select a card first');return;}
       closeModal();
       callback(chosen.card,chosen.z,chosen.r,chosen.c);
     }}]);
  document.getElementById('modal-body').innerHTML='';
  document.getElementById('modal-body').appendChild(body);
  // Trim modal width for a tighter fit
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox) Object.assign(modalBox.style, {maxWidth:'920px', padding:'1.2rem 1.4rem'});
}
