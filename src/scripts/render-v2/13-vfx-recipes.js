(function(){
  'use strict';

  if(typeof window === 'undefined') return;
  if(window.FateVfxRecipes) return;

  const VERSION = 1;
  const MOTION = {
    quick:190,
    normal:330,
    heavy:520,
    marquee:880,
    spike:118,
    hold:72,
    stagger:36,
    shortStagger:24
  };

  function P(){
    return window.FateVfxPrimitives || {};
  }

  function center(rect){
    const r = rect || {};
    return {
      x:(Number(r.x) || 0) + (Number(r.w) || 0) / 2,
      y:(Number(r.y) || 0) + (Number(r.h) || 0) / 2
    };
  }

  function inset(rect, pct){
    const r = rect || {};
    const p = Number(pct) || 0;
    const dx = (Number(r.w) || 0) * p;
    const dy = (Number(r.h) || 0) * p;
    return {
      x:(Number(r.x) || 0) + dx,
      y:(Number(r.y) || 0) + dy,
      w:Math.max(1, (Number(r.w) || 1) - dx * 2),
      h:Math.max(1, (Number(r.h) || 1) - dy * 2)
    };
  }

  function offsetRect(rect, dx, dy){
    if(!rect) return null;
    return {
      x:(Number(rect.x) || 0) + (Number(dx) || 0),
      y:(Number(rect.y) || 0) + (Number(dy) || 0),
      w:Number(rect.w) || 0,
      h:Number(rect.h) || 0
    };
  }

  function scaleRect(rect, sx, sy){
    if(!rect) return null;
    const w = Number(rect.w) || 0;
    const h = Number(rect.h) || 0;
    const nw = Math.max(1, w * (Number(sx) || 1));
    const nh = Math.max(1, h * (Number(sy == null ? sx : sy) || 1));
    return {
      x:(Number(rect.x) || 0) + (w - nw) / 2,
      y:(Number(rect.y) || 0) + (h - nh) / 2,
      w:nw,
      h:nh
    };
  }

  function awayFrom(rect, target, amount){
    if(!rect || !target) return rect;
    const rc = center(rect);
    const tc = center(target);
    let dx = rc.x - tc.x;
    let dy = rc.y - tc.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const dist = Number(amount) || 16;
    return offsetRect(rect, dx / len * dist, dy / len * dist);
  }

  function endHoldMove(opts){
    const o = opts || {};
    return P().cardMove(Object.assign({
      easing:'out-quint',
      path:'arc',
      arc:.16,
      lift:.14,
      rotate:3,
      scale:1.04,
      overshoot:.018,
      holdMs:MOTION.hold,
      priority:'high'
    }, o));
  }

  function spikeMove(opts){
    const o = opts || {};
    return P().cardMove(Object.assign({
      duration:MOTION.spike,
      easing:'in-quart',
      path:'direct',
      arc:0,
      lift:0,
      rotate:-1.6,
      scale:1.012,
      overshoot:.018,
      priority:'high'
    }, o));
  }

  function lightImpact(iid, rect, startOffset, amplitude){
    return P().cardImpact({iid, rect, startOffset:Number(startOffset) || 0, duration:112, amplitude:Number(amplitude) || .045, priority:'normal'});
  }

  function payloadRect(payload, names){
    for(let i = 0; i < names.length; i++){
      const r = payload && payload[names[i]];
      if(r && Number(r.w) > 0 && Number(r.h) > 0) return r;
    }
    return null;
  }

  function playCard(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'sourceRect', 'handRect']);
    const to = payloadRect(p, ['toRect', 'targetRect', 'cellRect']);
    const hover = offsetRect(to, 0, to ? -Math.max(10, to.h * .08) : 0);
    const duration = Math.max(180, Math.min(360, Number(p.duration) || 300));
    return [
      P().cardMove({iid:p.iid, card:p.card, fromRect:from, toRect:hover || to, startOffset:0, duration:Math.round(duration * .72), easing:'out-quint', path:'arc', arc:Number(p.arc) || .10, lift:Number(p.lift) || .10, rotate:Number(p.rotate) || 2, scale:1.035, priority:'high'}),
      P().cardMove({iid:p.iid, card:p.card, fromRect:hover || from, toRect:to, startOffset:Math.round(duration * .70), duration:Math.max(54, Math.round(duration * .30)), easing:'in-quart', path:'direct', arc:0, lift:0, rotate:-1.5, scale:1.01, priority:'high'}),
      P().soundCue({cue:'card_play_land', startOffset:Math.max(60, duration - 56), priority:'high'})
    ];
  }

  function drawCard(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'deckRect', 'sourceRect']);
    const to = payloadRect(p, ['toRect', 'handRect', 'slotRect']);
    const start = Number(p.startOffset) || 0;
    const peek = from && to ? awayFrom(from, to, Math.max(12, (to && to.h || 90) * .08)) : from;
    const hover = offsetRect(to, 0, to ? -Math.max(8, to.h * .06) : 0);
    return [
      P().cardMove({iid:p.iid, card:p.card || null, faceDown:p.faceDown !== false, fromRect:from, toRect:peek || from, startOffset:start, duration:66, easing:'out-quint', path:'direct', lift:.02, rotate:-2.4, scale:1.025, layer:p.layer || 'effects', priority:'normal'}),
      endHoldMove({iid:p.iid, card:p.card || null, faceDown:p.faceDown !== false, fromRect:peek || from, toRect:hover || to, startOffset:start + 54, duration:MOTION.normal + 90, holdMs:64, path:'withdraw', arc:.18, lift:.18, rotate:-6.2, scale:1.06, overshoot:.026, layer:p.layer || 'effects'}),
      spikeMove({iid:p.iid, card:p.card || null, faceDown:p.faceDown !== false, fromRect:hover || peek || from, toRect:to, startOffset:start + MOTION.normal + 190, duration:92, rotate:2.2, layer:p.layer || 'effects'}),
      P().soundCue({cue:'draw_card', startOffset:start + 112})
    ];
  }

  function searchToHand(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'deckRect', 'discardRect', 'sourceRect']);
    const to = payloadRect(p, ['toRect', 'handRect', 'slotRect']);
    const lift = offsetRect(from, 0, from ? -Math.max(14, from.h * .12) : 0);
    const hover = offsetRect(to, 0, to ? -Math.max(10, to.h * .07) : 0);
    return [
      P().cardMove({iid:p.iid, card:p.card || null, faceDown:p.faceDown === true, fromRect:from, toRect:lift || from, startOffset:0, duration:92, easing:'out-quint', path:'direct', lift:.04, rotate:p.source === 'discard' ? -4.2 : 4.2, scale:1.045, layer:p.layer || 'effects', priority:'high'}),
      endHoldMove({iid:p.iid, card:p.card || null, faceDown:p.faceDown === true, fromRect:lift || from, toRect:hover || to, startOffset:80, duration:MOTION.heavy + 18, holdMs:84, path:'overshoot', arc:.32, lift:.28, rotate:p.source === 'discard' ? -8.4 : 8.4, scale:1.085, overshoot:.086, layer:p.layer || 'effects'}),
      spikeMove({iid:p.iid, card:p.card || null, faceDown:p.faceDown === true, fromRect:hover || lift || from, toRect:to, startOffset:MOTION.heavy + 164, duration:104, rotate:-2.2, layer:p.layer || 'effects'}),
      lightImpact(p.iid, to, MOTION.heavy + 232, .048),
      P().soundCue({cue:'search_found', startOffset:142, priority:'high'})
    ];
  }

  function discardCard(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'sourceRect']);
    const to = payloadRect(p, ['toRect', 'discardRect']);
    const pull = from && to ? awayFrom(from, to, Math.max(24, from.h * .15)) : from;
    const near = to ? offsetRect(to, 0, -Math.max(18, to.h * .16)) : to;
    return [
      P().cardMove({iid:p.iid, card:p.card, fromRect:from, toRect:pull || from, startOffset:0, duration:92, easing:'out-quint', path:'direct', lift:.08, rotate:-7.5, scale:1.055, priority:'normal'}),
      P().cardTrail({fromRect:pull || from, toRect:near || to, startOffset:92, duration:MOTION.normal + 40, steps:5, color:'rgba(255,142,116,.46)', priority:'low'}),
      endHoldMove({iid:p.iid, card:p.card, fromRect:pull || from, toRect:near || to, startOffset:70, duration:MOTION.normal + 120, holdMs:76, path:'withdraw', arc:.32, lift:.30, rotate:-17.5, scale:.88, overshoot:.072, priority:'high'}),
      spikeMove({iid:p.iid, card:p.card, fromRect:near || pull || from, toRect:to, startOffset:MOTION.normal + 210, duration:122, rotate:-12, scale:.66, fadeOutLate:true, priority:'high'}),
      lightImpact(p.iid, to, MOTION.normal + 282, .060),
      P().soundCue({cue:'discard_card', startOffset:MOTION.normal + 190, priority:'high'})
    ];
  }

  function destroyCard(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'sourceRect', 'targetRect']);
    const to = payloadRect(p, ['toRect', 'discardRect']) || from;
    const recoil = from ? offsetRect(from, 0, -Math.max(8, from.h * .06)) : from;
    return [
      P().cardShake({iid:p.iid, rect:from, startOffset:0, duration:86, amplitude:5, priority:'high'}),
      P().cardMove({iid:p.iid, card:p.card, fromRect:from, toRect:recoil || from, startOffset:48, duration:76, easing:'out-quint', path:'direct', lift:.08, rotate:5, scale:1.05, priority:'high'}),
      endHoldMove({iid:p.iid, card:p.card, fromRect:recoil || from, toRect:to, startOffset:108, duration:MOTION.normal + 92, holdMs:54, path:'drop', arc:.10, lift:.06, rotate:12, scale:.74, fadeOut:true, priority:'high'}),
      P().soundCue({cue:'destroy_card', startOffset:104, priority:'high'})
    ];
  }

  function fateDeltaText(payload, sign){
    const p = payload || {};
    if(p.text != null) return String(p.text).replace(/\s*Fate\b/ig, '').trim();
    return sign + (p.amount || 1);
  }

  function fateGain(payload){
    const p = payload || {};
    const rect = payloadRect(p, ['rect', 'targetRect', 'cardRect']);
    return [
      P().cardLift({iid:p.iid, card:p.card, rect, fromRect:rect, toRect:rect, startOffset:0, duration:140, easing:'out-quint', lift:.09, rotate:1.2, scale:1.022, priority:'normal'}),
      lightImpact(p.iid, rect, 116, .038),
      P().numberPop({text:fateDeltaText(p, '+'), rect, startOffset:42, duration:700, rise:46, color:'#7fff90', theme:'fate-delta', priority:'high'}),
      P().soundCue({cue:'fate_gain', startOffset:104})
    ];
  }

  function fateLoss(payload){
    const p = payload || {};
    const rect = payloadRect(p, ['rect', 'targetRect', 'cardRect']);
    return [
      P().cardShake({iid:p.iid, rect, startOffset:0, duration:118, amplitude:4.4}),
      lightImpact(p.iid, rect, 96, .034),
      P().numberPop({text:fateDeltaText(p, '-'), rect, startOffset:34, duration:700, rise:46, color:'#ff6060', theme:'fate-loss', priority:'high'}),
      P().soundCue({cue:'fate_loss', startOffset:78})
    ];
  }

  function moveCard(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'sourceRect']);
    const to = payloadRect(p, ['toRect', 'targetRect', 'cellRect']);
    const pull = from && to ? awayFrom(from, to, Math.max(8, from.h * .055)) : from;
    const hover = offsetRect(to, 0, to ? -Math.max(8, to.h * .055) : 0);
    const travelMs = Number(p.duration) || MOTION.normal + 54;
    return [
      P().cardMove({iid:p.iid, card:p.card, fromRect:from, toRect:pull || from, startOffset:0, duration:58, easing:'out-quint', path:'direct', lift:.02, rotate:-1.6, scale:1.018, priority:'normal'}),
      endHoldMove({iid:p.iid, card:p.card, fromRect:pull || from, toRect:hover || to, startOffset:48, duration:travelMs, holdMs:58, easing:p.easing || 'out-quint', path:p.path || 'arc', arc:Number.isFinite(Number(p.arc)) ? Number(p.arc) : .18, lift:Number.isFinite(Number(p.lift)) ? Number(p.lift) : .15, rotate:Number.isFinite(Number(p.rotate)) ? Number(p.rotate) : 4.2, scale:Number(p.scale) || 1.04, overshoot:Number(p.overshoot) || .026, priority:p.priority || 'high'}),
      spikeMove({iid:p.iid, card:p.card, fromRect:hover || pull || from, toRect:to, startOffset:48 + travelMs - 2, duration:94, rotate:-1.8, priority:p.priority || 'high'}),
      lightImpact(p.iid, to, 48 + travelMs + 58, .042),
      P().soundCue({cue:p.cue || 'card_move', startOffset:48 + travelMs + 26})
    ];
  }

  function swapCards(payload){
    const p = payload || {};
    const a = p.a || {};
    const b = p.b || {};
    const aTo = a.toRect || b.fromRect;
    const bTo = b.toRect || a.fromRect;
    const aHover = offsetRect(aTo, 0, aTo ? -Math.max(8, aTo.h * .07) : 0);
    const bHover = offsetRect(bTo, 0, bTo ? -Math.max(8, bTo.h * .07) : 0);
    return [
      endHoldMove({iid:a.iid, card:a.card, fromRect:a.fromRect, toRect:aHover || aTo, startOffset:0, duration:MOTION.normal + 40, holdMs:50, arc:.22, lift:.20, rotate:7, scale:1.045, overshoot:.024, priority:'high'}),
      endHoldMove({iid:b.iid, card:b.card, fromRect:b.fromRect, toRect:bHover || bTo, startOffset:MOTION.shortStagger, duration:MOTION.normal + 40, holdMs:50, arc:.22, lift:.20, rotate:-7, scale:1.045, overshoot:.024, priority:'high'}),
      spikeMove({iid:a.iid, card:a.card, fromRect:aHover || a.fromRect, toRect:aTo, startOffset:MOTION.normal + 88, duration:90, rotate:-2, priority:'high'}),
      spikeMove({iid:b.iid, card:b.card, fromRect:bHover || b.fromRect, toRect:bTo, startOffset:MOTION.normal + 106, duration:90, rotate:2, priority:'high'}),
      P().soundCue({cue:'card_move', startOffset:MOTION.normal + 72})
    ];
  }

  function consolidate(payload){
    const p = payload || {};
    const targetRect = payloadRect(p, ['targetRect', 'toRect']);
    const tributes = Array.isArray(p.tributes) ? p.tributes : [];
    const targetCore = inset(targetRect, .08);
    const multi = tributes.length > 1;
    const collideGap = multi ? Math.max(20, Math.min(44, 112 / Math.max(1, tributes.length))) : 36;
    const collideDuration = multi ? 230 : 210;
    const firstCollide = 54;
    const list = [
      P().soundCue({cue:'consolidate_charge', startOffset:36, priority:'high'})
    ];
    tributes.forEach(function(t, index){
      const from = t && (t.rect || t.fromRect || t.cardRect);
      if(!from) return;
      const collideAt = firstCollide + index * collideGap;
      const side = index % 2 ? -1 : 1;
      const lane = Math.floor(index / 2) + 1;
      const pull = awayFrom(from, targetRect, Math.max(multi ? 26 : 10, from.h * (multi ? .14 : .05)));
      const strikeRect = offsetRect(
        targetCore,
        side * Math.max(3, targetCore.w * (multi ? .14 / lane : .018)),
        ((index % 3) - 1) * Math.max(2, targetCore.h * (multi ? .04 : .012))
      );
      list.push(P().cardMove({
        iid:t.iid,
        card:t.card,
        fromRect:pull || from,
        toRect:strikeRect || targetCore,
        startOffset:collideAt,
        duration:collideDuration,
        easing:'in-quart',
        path:'overshoot',
        arc:(multi ? .48 : .38) + Math.min(.16, index * .025),
        lift:(multi ? .46 : .36) + Math.min(.12, index * .020),
        rotate:side * (multi ? 36 : 24),
        scale:multi ? .76 : .70,
        overshoot:multi ? .27 : .18,
        holdMs:multi ? 24 : 36,
        fadeOut:true,
        priority:'high'
      }));
      list.push(lightImpact(t.iid, targetRect, collideAt + collideDuration - 24, multi ? .090 : .060));
    });
    const impactAt = firstCollide + Math.max(0, tributes.length - 1) * collideGap + collideDuration - 22;
    list.push(P().cardImpact({iid:p.targetIid, rect:targetRect, startOffset:impactAt, duration:128, amplitude:multi ? .10 : .07, priority:'high'}));
    list.push(P().soundCue({cue:'consolidate_impact', startOffset:impactAt, priority:'high'}));
    return list;
  }

  function supporterActivate(payload){
    const p = payload || {};
    const from = payloadRect(p, ['sourceRect', 'fromRect', 'rect']);
    const to = payloadRect(p, ['targetRect', 'toRect']) || from;
    const signal = offsetRect(to, 0, to ? -Math.max(6, to.h * .05) : 0);
    return [
      P().cardLift({iid:p.iid || p.sourceIid, card:p.card || p.sourceCard, rect:from, fromRect:from, toRect:from, startOffset:0, duration:138, easing:'out-quint', lift:.12, rotate:2.8, scale:1.035, priority:'normal'}),
      endHoldMove({iid:p.proxyIid || p.sourceIid, card:p.card || p.sourceCard || null, fromRect:from, toRect:signal || inset(to, .08), startOffset:66, duration:248, holdMs:46, path:'snap', arc:.12, lift:.13, rotate:5.8, scale:.78, fadeOut:true, priority:'normal'}),
      lightImpact(p.targetIid, to, 292, .052),
      P().soundCue({cue:'supporter_activate', startOffset:92})
    ];
  }

  function landscapeTrigger(payload){
    const p = payload || {};
    const rect = payloadRect(p, ['rect', 'zoneRect', 'targetRect']);
    return [
      P().cardLift({iid:p.iid, card:p.card || null, rect, fromRect:rect, toRect:rect, startOffset:0, duration:126, easing:'out-quint', lift:.06, rotate:.8, scale:1.012, priority:'normal'}),
      lightImpact(p.iid, rect, 96, .034),
      P().soundCue({cue:'landscape_trigger', startOffset:104})
    ];
  }

  function turnStart(payload){
    const p = payload || {};
    return [
      P().handFanPulse({rect:p.handRect, startOffset:60, duration:210, color:'rgba(116,196,255,.32)', priority:'low'}),
      P().soundCue({cue:'turn_start', startOffset:80})
    ];
  }

  function turnEnd(payload){
    const p = payload || {};
    return [
      P().handFanPulse({rect:p.handRect, startOffset:0, duration:180, color:'rgba(255,218,118,.24)', priority:'low'}),
      P().soundCue({cue:'turn_end', startOffset:40})
    ];
  }

  function invalidAction(payload){
    const p = payload || {};
    const rect = payloadRect(p, ['rect', 'targetRect', 'cardRect']);
    return [
      P().cardShake({iid:p.iid, rect, startOffset:0, duration:118, amplitude:5, priority:'high'}),
      P().soundCue({cue:'invalid_action', startOffset:30})
    ];
  }

  function cardReveal(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'sourceRect']);
    const to = payloadRect(p, ['toRect', 'targetRect', 'rect']) || from;
    const hover = offsetRect(to, 0, to ? -Math.max(8, to.h * .06) : 0);
    return [
      endHoldMove({iid:p.iid, card:p.card, fromRect:from || scaleRect(to, .82), toRect:hover || to, startOffset:0, duration:MOTION.normal + 110, holdMs:74, path:'arc', arc:.16, lift:.14, rotate:3.8, scale:1.055, fadeIn:!from, priority:'high'}),
      spikeMove({iid:p.iid, card:p.card, fromRect:hover || from || to, toRect:to, startOffset:MOTION.normal + 164, duration:96, rotate:-1.4, priority:'high'}),
      lightImpact(p.iid, to, MOTION.normal + 236, .040),
      P().soundCue({cue:'card_reveal', startOffset:120})
    ];
  }

  const recipes = {
    CARD_FLIP:function(payload){
      const p = payload || {};
      const r = payloadRect(p, ['rect', 'targetRect', 'cardRect']);
      return [
        P().cardLift({iid:p.iid, card:p.card, rect:r, fromRect:r, toRect:r, startOffset:0, duration:82, easing:'out-quint', lift:.08, rotate:-1.8, scale:1.025, priority:'normal'}),
        P().cardFlip({iid:p.iid, card:p.card, rect:r, startOffset:58, duration:330, glowColor:'rgba(255,232,150,.34)', revealFlash:false, noGlow:true}),
        lightImpact(p.iid, r, 360, .038),
        P().soundCue({cue:'card_flip', startOffset:240})
      ];
    },
    PLAY_CARD:playCard,
    DRAW_CARD:drawCard,
    DISCARD_CARD:discardCard,
    DESTROY_CARD:destroyCard,
    MOVE_CARD:moveCard,
    SWAP_CARDS:swapCards,
    RETURN_TO_HAND:function(payload){ return moveCard(Object.assign({cue:'return_to_hand', path:'withdraw', rotate:-2.2, scale:.96, duration:MOTION.normal + 20}, payload || {})); },
    HAND_DISCARD:discardCard,
    DECK_TO_BOARD:playCard,
    DECK_TO_HAND:drawCard,
    DISCARD_TO_HAND:function(payload){ return drawCard(Object.assign({cue:'discard_to_hand'}, payload || {})); },
    SEARCH_TO_HAND:searchToHand,
    CARD_REVEAL:cardReveal,
    CARD_SUPPRESS:invalidAction,
    CARD_NEGATE:invalidAction,
    CARD_IMMUNE:fateGain,
    FATE_GAIN:fateGain,
    FATE_LOSS:fateLoss,
    CONSOLIDATE:consolidate,
    SUPPORTER_ACTIVATE:supporterActivate,
    LANDSCAPE_TRIGGER:landscapeTrigger,
    ZONE_SHIFT:landscapeTrigger,
    ZONE_SCORE:landscapeTrigger,
    ZONE_WIN_FLIP:landscapeTrigger,
    MATCH_START:turnStart,
    MATCH_RESULT:cardReveal,
    INVALID_ACTION:invalidAction,
    TURN_START:turnStart,
    TURN_END:turnEnd
  };

  window.FateVfxRecipes = {
    version:VERSION,
    names:function(){ return Object.keys(recipes); },
    has:function(name){ return !!recipes[String(name || '').toUpperCase()]; },
    expand:function(name, payload){
      const fn = recipes[String(name || '').toUpperCase()];
      return fn ? fn(payload || {}) : [];
    },
    describe:function(){
      const out = {};
      Object.keys(recipes).forEach(function(name){
        const primitives = recipes[name]({}) || [];
        out[name] = primitives.map(function(p){ return p && p.kind || ''; }).filter(Boolean);
      });
      return out;
    },
    report:function(){
      const recipeKinds = window.FateVfxRecipes.describe();
      return {
        available:true,
        version:VERSION,
        recipes:Object.keys(recipes),
        recipeKinds
      };
    }
  };
  window.fateVfxRecipesReport = window.FateVfxRecipes.report;
})();
