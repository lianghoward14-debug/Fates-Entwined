(function(){
  'use strict';

  if(typeof window === 'undefined') return;
  if(window.FateV2CardMotionFx) return;

  const VERSION = 1;
  window.FateV2CardMotionFxUsesDomGhosts = false;

  function q(sel){ return document.querySelector(sel); }

  function canvas(){
    return document.getElementById('fate-match-v2-canvas');
  }

  function cardImg(card, role){
    if(!card) return 'back.png';
    const src = card.img || (card.visual && (card.visual.runtimeImg || card.visual.img)) || 'back.png';
    try {
      if(typeof getRuntimeCardImageSrc === 'function') return getRuntimeCardImageSrc(src, role || 'board');
    } catch(e) {}
    return src;
  }

  function cardName(card){
    return (card && (card.name || (card.visual && card.visual.name))) || 'Card';
  }

  function fixedRectFromBoardRect(r){
    const cnv = canvas();
    if(!cnv || !r || !cnv.getBoundingClientRect) return null;
    const cr = cnv.getBoundingClientRect();
    const sx = cr.width / Math.max(1, cnv.clientWidth || cr.width || 1);
    const sy = cr.height / Math.max(1, cnv.clientHeight || cr.height || 1);
    return {
      left:cr.left + r.x * sx,
      top:cr.top + r.y * sy,
      width:r.w * sx,
      height:r.h * sy
    };
  }

  function boardCardRect(z, r, c){
    const scene = window.FateMatchRendererAdapter;
    const map = scene && typeof scene.getHitMap === 'function' ? scene.getHitMap() : null;
    const cards = map && Array.isArray(map.cards) ? map.cards : [];
    const hit = cards.find(function(item){
      return item && item.z === z && item.r === r && item.c === c;
    });
    return fixedRectFromBoardRect(hit && hit.rect);
  }

  function targetRectFor(kind, card){
    let el = null;
    if(kind === 'discard'){
      const mine = typeof isPerspectivePlayer === 'function' ? isPerspectivePlayer(card && card.owner) : true;
      el = q(mine ? '#my-discard' : '#opp-hand');
    } else if(kind === 'draw') {
      el = q('#hand-cards');
    }
    if(el && el.getBoundingClientRect) {
      const r = el.getBoundingClientRect();
      return {left:r.left + r.width / 2 - 36, top:r.top + r.height / 2 - 50, width:72, height:100};
    }
    return {left:window.innerWidth - 110, top:window.innerHeight - 120, width:72, height:100};
  }

  function makeCardGhost(card, rect, className){
    if(!rect) return null;
    const el = document.createElement('div');
    el.className = 'fate-v2-motion-card ' + (className || '');
    el.style.left = rect.left + 'px';
    el.style.top = rect.top + 'px';
    el.style.width = rect.width + 'px';
    el.style.height = rect.height + 'px';
    el.innerHTML =
      '<img src="' + cardImg(card, 'board') + '" alt="' + String(cardName(card)).replace(/"/g, '&quot;') + '" draggable="false">'+
      '<span class="fate-v2-motion-glint"></span>';
    document.body.appendChild(el);
    return el;
  }

  function timeline(){
    return window.FateMatchAnimationTimeline || null;
  }

  function scheduleRender(reason){
    const scene = window.FateMatchRendererAdapter;
    if(scene && typeof scene.scheduleRender === 'function') scene.scheduleRender(reason || 'motion-fx');
  }

  function queueMotion(kind, card, from, to, opts){
    const tl = timeline();
    if(!tl || typeof tl.add !== 'function') return false;
    const options = opts || {};
    tl.add({
      kind:'motion-fx',
      subtype:kind || 'card-motion',
      iid:card && card.iid != null ? String(card.iid) : '',
      cardName:cardName(card),
      fromRect:from || null,
      toRect:to || null,
      start:(window.performance && performance.now) ? performance.now() + (Number(options.delay) || 0) : Date.now() + (Number(options.delay) || 0),
      duration:Number(options.duration) || 760,
      easing:options.easing || 'out-cubic'
    });
    scheduleRender('motion-fx-' + (kind || 'card-motion'));
    return true;
  }

  function fly(card, from, to, opts){
    const options = opts || {};
    return queueMotion(options.kind || 'fly', card, from, to, options);
  }

  function flyBoardCard(card, z, r, c, kind){
    const from = boardCardRect(z, r, c);
    const to = targetRectFor(kind || 'discard', card);
    return fly(card, from, to, {className:'to-' + (kind || 'discard'), kind:kind || 'discard', duration:880});
  }

  function flipBoardCard(card, z, r, c){
    const from = boardCardRect(z, r, c);
    const el = makeCardGhost(card, from, 'is-flipping');
    if(!el) return false;
    setTimeout(function(){ if(el.parentNode) el.remove(); }, 740);
    return true;
  }

  function drawFromPile(delayIdx){
    const deck = q('#my-deck');
    const hand = q('#hand-cards');
    if(!deck || !hand || !deck.getBoundingClientRect || !hand.getBoundingClientRect) return false;
    const d = deck.getBoundingClientRect();
    const h = hand.getBoundingClientRect();
    const from = {left:d.left + d.width / 2 - 44, top:d.top + d.height / 2 - 62, width:88, height:124};
    const to = {left:h.left + Math.min(h.width - 110, Math.max(0, 42 + (Number(delayIdx) || 0) * 24)), top:h.top + h.height - 146, width:110, height:154};
    return fly(null, from, to, {className:'from-deck', kind:'draw', delay:(Number(delayIdx) || 0) * 45, duration:760, scale:1.08});
  }

  function crashTributes(tributes, target){
    const list = Array.isArray(tributes) ? tributes : [];
    if(!target) return false;
    const to = boardCardRect(target.z, target.r, target.c);
    if(!to) return false;
    list.forEach(function(t, i){
      const from = boardCardRect(t.z, t.r, t.c);
      if(!from) return;
      fly(t.card, from, {
        left:to.left + to.width * .12,
        top:to.top + to.height * .12,
        width:to.width * .78,
        height:to.height * .78
      }, {className:'tribute-crash', kind:'crash', delay:i * 75, duration:980, scale:.72});
    });
    return true;
  }

  window.FateV2CardMotionFx = {
    version:VERSION,
    fly,
    flyBoardCard,
    flipBoardCard,
    drawFromPile,
    crashTributes
  };
  window.fateV2MotionFlyBoardCard = flyBoardCard;
  window.fateV2MotionFlipBoardCard = flipBoardCard;
  window.fateV2MotionCrashTributes = crashTributes;
})();
