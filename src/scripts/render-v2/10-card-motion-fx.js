(function(){
  'use strict';

  if(typeof window === 'undefined') return;
  if(window.FateV2CardMotionFx) return;

  const VERSION = 7;
  window.FateV2CardMotionFxUsesDomGhosts = false;
  const BOARD_PLACEMENT_RECIPES = new Set(['PLAY_CARD', 'DECK_TO_BOARD', 'SET_CONFIRM', 'SET_DRAG_LAND']);
  const CARD_ACTION_RECIPES = new Set([
    'DRAW_CARD',
    'DISCARD_CARD',
    'DESTROY_CARD',
    'MOVE_CARD',
    'SWAP_CARDS',
    'RETURN_TO_HAND',
    'HAND_DISCARD',
    'DECK_TO_HAND',
    'DISCARD_TO_HAND',
    'SEARCH_TO_HAND',
    'CONSOLIDATE',
    'CARD_REVEAL',
    'CARD_FLIP'
  ]);

  function canvas(){
    return document.getElementById('fate-match-v2-canvas');
  }

  function scene(){
    return window.FateMatchRendererAdapter || null;
  }

  function animationsOff(){
    const root = document.documentElement;
    const body = document.body;
    return !!((root && root.classList && root.classList.contains('fate-animations-off')) ||
      (body && body.classList && body.classList.contains('fate-animations-off')));
  }

  function hitMap(){
    const s = scene();
    return s && typeof s.getHitMap === 'function' ? s.getHitMap() : null;
  }

  function boardPointFromViewportRect(vr){
    const cnv = canvas();
    if(!cnv || !vr || !cnv.getBoundingClientRect) return null;
    const cr = cnv.getBoundingClientRect();
    const sx = (cnv.clientWidth || cr.width || 1) / Math.max(1, cr.width || 1);
    const sy = (cnv.clientHeight || cr.height || 1) / Math.max(1, cr.height || 1);
    return {
      x:(Number(vr.x != null ? vr.x : vr.left) - cr.left) * sx,
      y:(Number(vr.y != null ? vr.y : vr.top) - cr.top) * sy,
      w:Number(vr.w != null ? vr.w : vr.width) * sx,
      h:Number(vr.h != null ? vr.h : vr.height) * sy
    };
  }

  function boardCardRect(z, r, c){
    const map = hitMap();
    const cards = map && Array.isArray(map.cards) ? map.cards : [];
    const hit = cards.find(function(item){
      return item && item.z === z && item.r === r && item.c === c;
    });
    return hit && hit.rect ? Object.assign({}, hit.rect) : null;
  }

  function boardCellRect(z, r, c){
    const map = hitMap();
    const cells = map && Array.isArray(map.cells) ? map.cells : [];
    const hit = cells.find(function(item){
      return item && item.z === z && item.r === r && item.c === c;
    });
    return hit && (hit.cardRect || hit.visualRect || hit.rect) ? Object.assign({}, hit.cardRect || hit.visualRect || hit.rect) : null;
  }

  function boardCardRectByIid(iid){
    const key = String(iid == null ? '' : iid);
    if(!key) return null;
    const map = hitMap();
    const cards = map && Array.isArray(map.cards) ? map.cards : [];
    const hit = cards.find(function(item){
      return String(item && item.iid) === key;
    });
    return hit && hit.rect ? Object.assign({}, hit.rect) : null;
  }

  function pileRect(playerIndex, pileName){
    const map = hitMap();
    const piles = map && Array.isArray(map.piles) ? map.piles : [];
    const pile = piles.find(function(item){
      if(!item || item.pile !== pileName) return false;
      return playerIndex == null || Number(item.playerIndex) === Number(playerIndex);
    }) || piles.find(function(item){ return item && item.pile === pileName; });
    return pile && pile.rect ? boardPointFromViewportRect(pile.rect) : null;
  }

  function handSlotRect(index){
    const map = hitMap();
    const cards = map && Array.isArray(map.handCards) ? map.handCards : [];
    if(!cards.length) return null;
    const idx = Math.max(0, Math.min(cards.length - 1, Number(index) || 0));
    return boardPointFromViewportRect(cards[idx] && cards[idx].rect);
  }

  function fallbackHandRect(owner, basisRect){
    const cnv = canvas();
    const w = Math.max(54, Math.min(96, Number(basisRect && basisRect.w) || 78));
    const h = Math.round(w * 1.4);
    const cssW = Number(cnv && (cnv.clientWidth || cnv.__fateCssW)) || window.innerWidth || 1280;
    const cssH = Number(cnv && (cnv.clientHeight || cnv.__fateCssH)) || window.innerHeight || 720;
    const viewer = currentViewer();
    if(Number(owner) === Number(viewer)) return {x:cssW / 2 - w / 2, y:Math.max(24, cssH - h - 82), w, h};
    return {x:34, y:150, w:Math.max(36, w * .62), h:Math.max(50, h * .62)};
  }

  function opponentHandSlotRect(index, playerIndex){
    const map = hitMap();
    const cards = map && Array.isArray(map.opponentHandCards) ? map.opponentHandCards : [];
    const filtered = playerIndex == null ? cards : cards.filter(function(item){ return Number(item && item.playerIndex) === Number(playerIndex); });
    const list = filtered.length ? filtered : cards;
    if(!list.length) return null;
    const idx = Math.max(0, Math.min(list.length - 1, Number(index) || 0));
    return boardPointFromViewportRect(list[idx] && list[idx].rect);
  }

  function handCardRectByIid(iid){
    const key = String(iid == null ? '' : iid);
    if(!key) return null;
    const map = hitMap();
    const cards = map && Array.isArray(map.handCards) ? map.handCards : [];
    const hit = cards.find(function(item){
      return String(item && item.iid) === key;
    });
    return boardPointFromViewportRect(hit && hit.rect);
  }

  function anyHandRectByIid(iid){
    const own = handCardRectByIid(iid);
    if(own) return own;
    const key = String(iid == null ? '' : iid);
    if(!key) return null;
    const map = hitMap();
    const cards = map && Array.isArray(map.opponentHandCards) ? map.opponentHandCards : [];
    const hit = cards.find(function(item){
      return String(item && item.iid) === key;
    });
    return boardPointFromViewportRect(hit && hit.rect);
  }

  function rectForBoardTarget(z, r, c){
    return boardCardRect(z, r, c) || boardCellRect(z, r, c);
  }

  function currentViewer(){
    try {
      if(typeof getPerspectivePlayerIndex === 'function') return getPerspectivePlayerIndex();
    } catch(e) {}
    return typeof G !== 'undefined' && G ? G.currentPlayer : 0;
  }

  function play(type, payload){
    if(animationsOff()) return false;
    const recipe = String(type || '').toUpperCase();
    if(BOARD_PLACEMENT_RECIPES.has(recipe)) return false;
    const presenter = window.FateActionPresentation;
    if(presenter && typeof presenter.beginMotionOnly === 'function' &&
      !(typeof presenter.isActive === 'function' && presenter.isActive())) {
      return !!presenter.beginMotionOnly(recipe, payload || {});
    }
    if(!CARD_ACTION_RECIPES.has(recipe)) {
      const bridge = window.FateVfxEventBridge;
      if(bridge && typeof bridge.onAcceptedGameEvent === 'function'){
        return !!bridge.onAcceptedGameEvent({type:recipe, payload:payload || {}});
      }
    }
    const director = window.FateVfxDirector;
    if(!director || typeof director.play !== 'function') return false;
    return !!director.play(recipe, payload || {}, {allowMatchActionMotion:CARD_ACTION_RECIPES.has(recipe)});
  }

  function fly(card, from, to, opts){
    const options = opts || {};
    const kind = String(options.kind || 'play').toLowerCase();
    const fromRect = from && from.x != null ? from : boardPointFromViewportRect(from);
    const toRect = to && to.x != null ? to : boardPointFromViewportRect(to);
    if(kind === 'draw') return play('DRAW_CARD', {card, fromRect, toRect, layer:'effects'});
    if(kind === 'discard') return play('DISCARD_CARD', {card, iid:card && card.iid, fromRect, toRect});
    if(kind === 'destroy') return play('DESTROY_CARD', {card, iid:card && card.iid, fromRect, toRect});
    return false;
  }

  function flyBoardCard(card, z, r, c, kind){
    const motionKind = String(kind || 'discard').toLowerCase();
    const fromRect = boardCardRect(z, r, c);
    const owner = card && card.owner != null ? card.owner : currentViewer();
    const toRect = pileRect(owner, 'discard') || pileRect(null, 'discard') || fromRect;
    if(motionKind === 'destroy') return play('DESTROY_CARD', {card, iid:card && card.iid, fromRect, toRect});
    return play('DISCARD_CARD', {card, iid:card && card.iid, fromRect, toRect});
  }

  function flipBoardCard(card, z, r, c){
    if(animationsOff()) return false;
    const rect = boardCardRect(z, r, c);
    const iid = card && card.iid;
    const adapter = scene();
    if(adapter && typeof adapter.hideBoardCardForVfx === 'function') {
      adapter.hideBoardCardForVfx(iid, 820);
    }
    return play('CARD_FLIP', {card, iid, rect, duration:620, revealAt:.68});
  }

  function boardNotice(card, z, r, c, text, opts){
    if(animationsOff()) return false;
    const rect = rectForBoardTarget(z, r, c);
    if(!rect) return false;
    const options = opts || {};
    const type = String(options.type || '').toUpperCase();
    if(type === 'SUPPORTER_ACTIVATE') {
      return play('SUPPORTER_ACTIVATE', Object.assign({
        sourceIid:card && card.iid,
        sourceCard:card,
        sourceRect:rect,
        targetRect:rect,
        text
      }, options));
    }
    if(type === 'INVALID_ACTION') {
      return play('INVALID_ACTION', Object.assign({iid:card && card.iid, card, rect, text}, options));
    }
    return play('CARD_REVEAL', Object.assign({iid:card && card.iid, card, rect, toRect:rect, text}, options));
  }

  function drawFromPile(delayIdx, owner, opts){
    if(animationsOff()) return false;
    const options = opts || {};
    const viewer = currentViewer();
    const playerIndex = owner == null ? viewer : owner;
    const fromRect = pileRect(playerIndex, 'deck') || pileRect(null, 'deck');
    const toRect = (Number(playerIndex) === Number(viewer) ? handSlotRect(delayIdx) : opponentHandSlotRect(delayIdx, playerIndex))
      || fallbackHandRect(playerIndex, fromRect)
      || fromRect;
    if(!fromRect || !toRect) return false;
    return play('DRAW_CARD', Object.assign({
      iid:options.card && options.card.iid,
      card:options.card || null,
      fromRect,
      toRect,
      faceDown:options.faceDown != null ? !!options.faceDown : Number(playerIndex) !== Number(viewer),
      drawIndex:Number.isFinite(Number(options.drawIndex)) ? Number(options.drawIndex) : Math.max(0, Number(delayIdx) || 0),
      drawCount:Math.max(1, Number(options.drawCount || options.count || 1) || 1),
      layer:'effects'
    }, options));
  }

  function moveBoardCard(card, from, to, opts){
    const options = opts || {};
    const fromRect = from && from.x != null ? from : rectForBoardTarget(from && from.z, from && from.r, from && from.c);
    const toRect = to && to.x != null ? to : rectForBoardTarget(to && to.z, to && to.r, to && to.c);
    if(!fromRect || !toRect) return false;
    return play('MOVE_CARD', Object.assign({
      iid:card && card.iid,
      card,
      fromRect,
      toRect
    }, options));
  }

  function swapBoardCards(a, b, opts){
    if(animationsOff()) return false;
    const options = opts || {};
    const aRect = a && a.rect ? a.rect : rectForBoardTarget(a && a.z, a && a.r, a && a.c);
    const bRect = b && b.rect ? b.rect : rectForBoardTarget(b && b.z, b && b.r, b && b.c);
    if(!aRect || !bRect) return false;
    return play('SWAP_CARDS', Object.assign({
      a:{iid:a && a.card && a.card.iid, card:a && a.card, fromRect:aRect, toRect:bRect},
      b:{iid:b && b.card && b.card.iid, card:b && b.card, fromRect:bRect, toRect:aRect}
    }, options));
  }

  function returnBoardCardToHand(card, z, r, c, owner, opts){
    if(animationsOff()) return false;
    const fromRect = rectForBoardTarget(z, r, c);
    const viewer = currentViewer();
    const toRect = (Number(owner) === Number(viewer) ? (handSlotRect(999) || handSlotRect(0)) : opponentHandSlotRect(999, owner)) || fallbackHandRect(owner, fromRect);
    if(!fromRect || !toRect) return false;
    return play('RETURN_TO_HAND', Object.assign({iid:card && card.iid, card, fromRect, toRect}, opts || {}));
  }

  function sendHandCardToDiscard(card, owner, handIndex, opts){
    const fromRect = anyHandRectByIid(card && card.iid) || (Number(owner) === Number(currentViewer()) ? handSlotRect(handIndex) : opponentHandSlotRect(handIndex, owner));
    const toRect = pileRect(owner, 'discard') || pileRect(null, 'discard');
    if(!fromRect || !toRect) return false;
    return play('HAND_DISCARD', Object.assign({iid:card && card.iid, card, fromRect, toRect}, opts || {}));
  }

  function sendBoardCardToDeck(card, z, r, c, owner, opts){
    const fromRect = rectForBoardTarget(z, r, c);
    const toRect = pileRect(owner, 'deck') || pileRect(null, 'deck');
    if(!fromRect || !toRect) return false;
    return play('DISCARD_CARD', Object.assign({iid:card && card.iid, card, fromRect, toRect, path:'withdraw'}, opts || {}));
  }

  function sendDeckCardToBoard(card, owner, z, r, c, opts){
    return false;
  }

  function sendDeckCardToHand(card, owner, handIndex, opts){
    const fromRect = pileRect(owner, 'deck') || pileRect(null, 'deck');
    const toRect = (Number(owner) === Number(currentViewer()) ? handSlotRect(handIndex) : opponentHandSlotRect(handIndex, owner)) || fallbackHandRect(owner, fromRect);
    if(!fromRect || !toRect) return false;
    return play('DECK_TO_HAND', Object.assign({iid:card && card.iid, card, fromRect, toRect, faceDown:Number(owner) !== Number(currentViewer())}, opts || {}));
  }

  function sendDiscardCardToHand(card, owner, handIndex, opts){
    const fromRect = pileRect(owner, 'discard') || pileRect(null, 'discard');
    const toRect = (Number(owner) === Number(currentViewer()) ? handSlotRect(handIndex) : opponentHandSlotRect(handIndex, owner)) || fallbackHandRect(owner, fromRect);
    if(!fromRect || !toRect) return false;
    return play('DISCARD_TO_HAND', Object.assign({iid:card && card.iid, card, fromRect, toRect, faceDown:Number(owner) !== Number(currentViewer())}, opts || {}));
  }

  function searchCardToHand(card, owner, source, opts){
    const options = opts || {};
    const pileName = String(source || options.source || 'deck').toLowerCase() === 'discard' ? 'discard' : 'deck';
    const fromRect = pileRect(owner, pileName) || pileRect(null, pileName);
    const handIndex = options.handIndex != null ? options.handIndex : 999;
    const toRect = (Number(owner) === Number(currentViewer()) ? handSlotRect(handIndex) : opponentHandSlotRect(handIndex, owner)) || fallbackHandRect(owner, fromRect);
    if(!fromRect || !toRect) return false;
    return play('SEARCH_TO_HAND', Object.assign({
      iid:card && card.iid,
      card,
      fromRect,
      toRect,
      source:pileName,
      faceDown:Number(owner) !== Number(currentViewer())
    }, options));
  }

  function transferHandCard(card, fromOwner, toOwner, opts){
    const fromRect = anyHandRectByIid(card && card.iid) || (Number(fromOwner) === Number(currentViewer()) ? handSlotRect(0) : opponentHandSlotRect(0, fromOwner));
    const toRect = Number(toOwner) === Number(currentViewer()) ? handSlotRect(999) : opponentHandSlotRect(999, toOwner);
    if(!fromRect || !toRect) return false;
    return play('MOVE_CARD', Object.assign({iid:card && card.iid, card, fromRect, toRect, faceDown:Number(toOwner) !== Number(currentViewer())}, opts || {}));
  }

  function revealCard(card, rectSource, rectTarget, opts){
    if(animationsOff()) return false;
    const fromRect = rectSource && rectSource.x != null ? rectSource : rectSource || pileRect(currentViewer(), 'deck') || pileRect(null, 'deck');
    const toRect = rectTarget && rectTarget.x != null ? rectTarget : rectTarget || fromRect;
    if(!toRect) return false;
    return play('CARD_REVEAL', Object.assign({iid:card && card.iid, card, fromRect, toRect}, opts || {}));
  }

  function fateChange(card, z, r, c, before, after, opts){
    const from = Math.max(0, Number(before) || 0);
    const to = Math.max(0, Number(after) || 0);
    if(to === from) return false;
    const rect = rectForBoardTarget(z, r, c);
    if(!rect) return false;
    const amount = Math.abs(to - from);
    const type = to > from ? 'FATE_GAIN' : 'FATE_LOSS';
    return play(type, Object.assign({
      iid:card && card.iid,
      card,
      rect,
      targetRect:rect,
      z,
      r,
      c,
      before:from,
      after:to,
      amount,
      fateDelta:to - from
    }, opts || {}));
  }

  function supporterEffect(sourceCard, sourcePos, targets, opts){
    if(animationsOff()) return false;
    const sourceRect = sourcePos && sourcePos.x != null ? sourcePos : rectForBoardTarget(sourcePos && sourcePos.z, sourcePos && sourcePos.r, sourcePos && sourcePos.c);
    const list = Array.isArray(targets) ? targets : (targets ? [targets] : []);
    const first = list[0] || sourcePos;
    const targetRect = first && first.x != null ? first : rectForBoardTarget(first && first.z, first && first.r, first && first.c);
    if(!sourceRect || !targetRect) return false;
    return play('SUPPORTER_ACTIVATE', Object.assign({
      sourceIid:sourceCard && sourceCard.iid,
      sourceCard,
      sourceRect,
      targetRect,
      targets:list
    }, opts || {}));
  }

  function zoneMotion(zoneIndex, kind, opts){
    if(animationsOff()) return false;
    const options = opts || {};
    const map = hitMap();
    const cells = map && Array.isArray(map.cells) ? map.cells.filter(function(cell){ return Number(cell && cell.z) === Number(zoneIndex); }) : [];
    if(!cells.length) return false;
    const minX = Math.min.apply(null, cells.map(function(c){ return Number((c.rect || {}).x) || 0; }));
    const minY = Math.min.apply(null, cells.map(function(c){ return Number((c.rect || {}).y) || 0; }));
    const maxX = Math.max.apply(null, cells.map(function(c){ const r = c.rect || {}; return (Number(r.x) || 0) + (Number(r.w) || 0); }));
    const maxY = Math.max.apply(null, cells.map(function(c){ const r = c.rect || {}; return (Number(r.y) || 0) + (Number(r.h) || 0); }));
    return play(String(kind || 'ZONE_SHIFT').toUpperCase(), Object.assign({zoneIndex, rect:{x:minX, y:minY, w:Math.max(1, maxX - minX), h:Math.max(1, maxY - minY)}}, options));
  }

  function turnHandoff(fromPlayer, toPlayer, opts){
    if(animationsOff()) return false;
    const viewer = currentViewer();
    const handRect = Number(toPlayer) === Number(viewer) ? handSlotRect(0) : opponentHandSlotRect(0, toPlayer);
    return play('TURN_START', Object.assign({fromPlayer, toPlayer, handRect}, opts || {}));
  }

  function scoreResolve(zoneIndex, winner, opts){
    if(animationsOff()) return false;
    return zoneMotion(zoneIndex, 'ZONE_SCORE', Object.assign({winner}, opts || {}));
  }

  function queuePlacementFromHand(sourceCard, placedCard){
    return false;
  }

  function setCardFromHand(sourceCard, placedCard, target){
    return 0;
  }

  function handRectForCard(card){
    return anyHandRectByIid(card && card.iid);
  }

  function targetRectForBoardTarget(target){
    if(!target) return null;
    return target.x != null ? target : rectForBoardTarget(target.z, target.r, target.c);
  }

  function playRecipe(type, payload){
    return play(type, payload || {});
  }

  function crashTributes(tributes, target){
    const list = Array.isArray(tributes) ? tributes : [];
    if(!target) return false;
    const targetRect = boardCardRect(target.z, target.r, target.c);
    if(!targetRect) return false;
    const payload = {
      targetRect,
      targetIid:target.card && target.card.iid,
      targetCard:target.card || null,
      resultCard:target.resultCard || target.card || null,
      resultCardIid:(target.resultCard && target.resultCard.iid) || (target.card && target.card.iid),
      resultMotionIid:'consolidate-result:fallback:' + Math.round(nowMs()),
      faceDown:!!target.faceDown,
      tributes:list.map(function(t){
        return {
          iid:t && t.card && t.card.iid,
          card:t && t.card,
          rect:boardCardRect(t.z, t.r, t.c),
          reinforcementValue:t && (t.reinforcementValue || t.reinforcement),
          index:t && t.index
        };
      }).filter(function(item){ return !!item.rect; })
    };
    const animatedTributes = Math.min(10, payload.tributes.length);
    const revealDelay = animatedTributes > 1
      ? 90 + Math.max(0, animatedTributes - 1) * 390 + 760 + 620 + 210 + 180
      : 1180;
    const adapter = scene();
    if(payload.resultCardIid && adapter && typeof adapter.suppressInitialPlacementMotion === 'function') {
      adapter.suppressInitialPlacementMotion(payload.resultCardIid, revealDelay + 170);
    }
    if(adapter && typeof adapter.hideBoardCardForVfx === 'function') {
      const seen = new Set();
      payload.tributes.forEach(function(t){
        const iid = t && t.iid;
        if(iid == null) return;
        const key = String(iid);
        if(!key || seen.has(key)) return;
        seen.add(key);
        adapter.hideBoardCardForVfx(key, revealDelay + 260);
      });
      if(payload.resultCardIid) adapter.hideBoardCardForVfx(payload.resultCardIid, revealDelay + 260);
      if(typeof adapter.scheduleRender === 'function') adapter.scheduleRender('consolidation-hide-tributes-fallback');
    }
    play('CONSOLIDATE', payload);
    return revealDelay;
  }

  function report(){
    return {
      available:true,
      version:VERSION,
      animationsOff:animationsOff(),
      usesDomGhosts:false,
      usesVfxDirector:!!window.FateVfxDirector,
      usesActionPresentation:!!window.FateActionPresentation,
      createsDomGhosts:false,
      ownsPlacementFromHand:true,
      ownsBoardNotice:true,
      ownsDrawFromPile:true,
      ownsDiscard:true,
      ownsDestroy:true,
      ownsFlip:true,
      ownsConsolidation:true,
      ownsBoardMove:true,
      ownsSwap:true,
      ownsReturnToHand:true,
      ownsHandDiscard:true,
      ownsDeckToBoard:true,
      ownsDeckToHand:true,
      ownsDiscardToHand:true,
      ownsSearchToHand:true,
      ownsReveal:true,
      ownsFateChange:true,
      ownsSupporterEffect:true,
      ownsZoneMotion:true,
      ownsExplicitSet:true,
      usesHitMapRects:true
    };
  }

  window.FateV2CardMotionFx = {
    version:VERSION,
    fly,
    flyBoardCard,
    flipBoardCard,
    boardNotice,
    drawFromPile,
    moveBoardCard,
    swapBoardCards,
    returnBoardCardToHand,
    sendHandCardToDiscard,
    sendBoardCardToDeck,
    sendDeckCardToBoard,
    sendDeckCardToHand,
    sendDiscardCardToHand,
    searchCardToHand,
    transferHandCard,
    revealCard,
    fateChange,
    supporterEffect,
    zoneMotion,
    turnHandoff,
    scoreResolve,
    setCardFromHand,
    queuePlacementFromHand,
    pileRect,
    handRectForCard,
    targetRectForBoardTarget,
    playRecipe,
    crashTributes,
    report
  };
  window.fateV2MotionFlyBoardCard = flyBoardCard;
  window.fateV2MotionFlipBoardCard = flipBoardCard;
  window.fateV2MotionSetCardFromHand = setCardFromHand;
  window.fateV2MotionCrashTributes = crashTributes;
  window.fateV2MotionFxReport = report;
})();
