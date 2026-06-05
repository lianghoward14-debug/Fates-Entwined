(function(){
  'use strict';

  if(typeof window === 'undefined') return;
  if(window.FateV2CardMotionFx) return;

  const VERSION = 2;
  window.FateV2CardMotionFxUsesDomGhosts = false;

  function canvas(){
    return document.getElementById('fate-match-v2-canvas');
  }

  function scene(){
    return window.FateMatchRendererAdapter || null;
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

  function currentViewer(){
    try {
      if(typeof getPerspectivePlayerIndex === 'function') return getPerspectivePlayerIndex();
    } catch(e) {}
    return typeof G !== 'undefined' && G ? G.currentPlayer : 0;
  }

  function play(type, payload){
    const bridge = window.FateVfxEventBridge;
    if(bridge && typeof bridge.onAcceptedGameEvent === 'function'){
      return !!bridge.onAcceptedGameEvent({type, payload:payload || {}});
    }
    const director = window.FateVfxDirector;
    if(!director || typeof director.play !== 'function') return false;
    return !!director.play(type, payload || {});
  }

  function fly(card, from, to, opts){
    const options = opts || {};
    const kind = String(options.kind || 'play').toLowerCase();
    const fromRect = from && from.x != null ? from : boardPointFromViewportRect(from);
    const toRect = to && to.x != null ? to : boardPointFromViewportRect(to);
    if(kind === 'draw') return play('DRAW_CARD', {card, fromRect, toRect, layer:'effects'});
    if(kind === 'discard') return play('DISCARD_CARD', {card, iid:card && card.iid, fromRect, toRect});
    if(kind === 'destroy') return play('DESTROY_CARD', {card, iid:card && card.iid, fromRect, toRect});
    return play('PLAY_CARD', {card, iid:card && card.iid, fromRect, toRect});
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
    const rect = boardCardRect(z, r, c);
    return play('CARD_FLIP', {card, iid:card && card.iid, rect});
  }

  function boardNotice(card, z, r, c, text, opts){
    const options = opts || {};
    const rect = boardCardRect(z, r, c) || boardCardRectByIid(card && card.iid);
    if(!rect) return false;
    return play(options.type || 'LANDSCAPE_TRIGGER', {
      card,
      iid:card && card.iid,
      rect,
      targetRect:rect,
      text:String(text || 'TRIGGER'),
      color:options.color || '#ffe89a'
    });
  }

  function drawFromPile(delayIdx){
    const viewer = currentViewer();
    const fromRect = pileRect(viewer, 'deck') || pileRect(null, 'deck');
    const toRect = handSlotRect(delayIdx) || fromRect;
    if(!fromRect || !toRect) return false;
    return play('DRAW_CARD', {fromRect, toRect, layer:'effects'});
  }

  function queuePlacementFromHand(sourceCard, placedCard){
    const adapter = scene();
    if(!adapter || typeof adapter.queuePlacementMotion !== 'function') return false;
    if(!adapter.ownsBoard || !adapter.ownsBoard()) return false;
    const sourceIid = sourceCard && sourceCard.iid;
    const placedIid = placedCard && placedCard.iid;
    const fromRect = handCardRectByIid(sourceIid);
    if(!fromRect || placedIid == null) return false;
    return !!adapter.queuePlacementMotion(placedIid, fromRect);
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
      tributes:list.map(function(t){
        return {
          iid:t && t.card && t.card.iid,
          card:t && t.card,
          rect:boardCardRect(t.z, t.r, t.c)
        };
      }).filter(function(item){ return !!item.rect; })
    };
    return play('CONSOLIDATE', payload);
  }

  function report(){
    return {
      available:true,
      version:VERSION,
      usesDomGhosts:false,
      usesVfxDirector:!!window.FateVfxDirector,
      createsDomGhosts:false,
      ownsPlacementFromHand:true,
      ownsBoardNotice:true,
      ownsDrawFromPile:true,
      ownsDiscard:true,
      ownsDestroy:true,
      ownsFlip:true,
      ownsConsolidation:true,
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
    queuePlacementFromHand,
    crashTributes,
    report
  };
  window.fateV2MotionFlyBoardCard = flyBoardCard;
  window.fateV2MotionFlipBoardCard = flipBoardCard;
  window.fateV2MotionCrashTributes = crashTributes;
  window.fateV2MotionFxReport = report;
})();
