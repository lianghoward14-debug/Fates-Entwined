(function(){
  'use strict';

  if(typeof window === 'undefined') return;
  if(window.FateVfxRecipes) return;

  const VERSION = 2;
  const MOTION = {
    micro:72,
    snap:118,
    short:180,
    normal:260,
    travel:340,
    heavy:460,
    hold:42,
    stagger:28
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
    if(!rect) return null;
    const p = Number(pct) || 0;
    const dx = (Number(rect.w) || 0) * p;
    const dy = (Number(rect.h) || 0) * p;
    return {
      x:(Number(rect.x) || 0) + dx,
      y:(Number(rect.y) || 0) + dy,
      w:Math.max(1, (Number(rect.w) || 1) - dx * 2),
      h:Math.max(1, (Number(rect.h) || 1) - dy * 2)
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

  function payloadRect(payload, names){
    for(let i = 0; i < names.length; i++){
      const r = payload && payload[names[i]];
      if(r && Number(r.w) > 0 && Number(r.h) > 0) return r;
    }
    return null;
  }

  function awayFrom(rect, target, amount){
    if(!rect || !target) return rect;
    const rc = center(rect);
    const tc = center(target);
    const dx = rc.x - tc.x;
    const dy = rc.y - tc.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const dist = Number(amount) || 14;
    return offsetRect(rect, dx / len * dist, dy / len * dist);
  }

  function sideStep(rect, target, amount){
    if(!rect || !target) return rect;
    const rc = center(rect);
    const tc = center(target);
    const dx = tc.x - rc.x;
    const dy = tc.y - rc.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const dist = Number(amount) || 8;
    return offsetRect(rect, -dy / len * dist, dx / len * dist);
  }

  function liftRect(rect, amount){
    if(!rect) return null;
    return offsetRect(rect, 0, -Math.max(6, (Number(rect.h) || 0) * (Number(amount) || .06)));
  }

  function cardMove(opts){
    return P().cardMove(Object.assign({
      duration:MOTION.normal,
      easing:'out-quint',
      path:'arc',
      arc:.12,
      lift:.12,
      rotate:2,
      scale:1.025,
      overshoot:.018,
      holdMs:0,
      priority:'normal'
    }, opts || {}));
  }

  function snapMove(opts){
    return P().cardMove(Object.assign({
      duration:MOTION.snap,
      easing:'in-quart',
      path:'direct',
      arc:0,
      lift:0,
      rotate:-1.2,
      scale:1.006,
      overshoot:.012,
      priority:'high'
    }, opts || {}));
  }

  function impact(iid, rect, startOffset, amplitude){
    return P().cardImpact({
      iid,
      rect,
      startOffset:Number(startOffset) || 0,
      duration:104,
      amplitude:Number(amplitude) || .036,
      priority:'normal'
    });
  }

  function fateDeltaText(payload, sign){
    const p = payload || {};
    if(p.text != null) return String(p.text).replace(/\s*Fate\b/ig, '').trim();
    return sign + (p.amount || 1);
  }

  function playCard(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'sourceRect', 'handRect']);
    const to = payloadRect(p, ['toRect', 'targetRect', 'cellRect']);
    if(p.placementStyle === 'target-snap'){
      const above = scaleRect(liftRect(to, .18), .98);
      return [
        snapMove({iid:p.iid, card:p.card, faceDown:p.faceDown, fromRect:above || to || from, toRect:to, startOffset:0, duration:132, rotate:-5.2, scale:1.028, priority:'high'}),
        P().soundCue({cue:'card_play_land', startOffset:82, priority:'high'})
      ];
    }
    const load = from && to ? sideStep(awayFrom(from, to, Math.max(8, (from.h || 80) * .055)), to, Math.max(8, (from.w || 70) * .12)) : from;
    const hang = liftRect(to, .105);
    const duration = Math.max(190, Math.min(300, Number(p.duration) || 258));
    return [
      snapMove({iid:p.iid, card:p.card, faceDown:p.faceDown, fromRect:from, toRect:load || from, startOffset:0, duration:58, rotate:-3.2, scale:1.028, priority:'high'}),
      cardMove({iid:p.iid, card:p.card, faceDown:p.faceDown, fromRect:load || from, toRect:hang || to, startOffset:44, duration:Math.round(duration * .74), arc:Number(p.arc) || .16, lift:Number(p.lift) || .16, rotate:Number(p.rotate) || 4.2, scale:1.05, holdMs:MOTION.hold, priority:'high'}),
      snapMove({iid:p.iid, card:p.card, faceDown:p.faceDown, fromRect:hang || load || from, toRect:to, startOffset:44 + Math.round(duration * .70), duration:Math.max(64, Math.round(duration * .28)), rotate:-2.4, scale:1.012, priority:'high'}),
      impact(p.iid, to, duration + 50, .050),
      P().soundCue({cue:'card_play_land', startOffset:Math.max(72, duration - 20), priority:'high'})
    ];
  }

  function drawCard(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'deckRect', 'sourceRect']);
    const to = payloadRect(p, ['toRect', 'handRect', 'slotRect']);
    const start = Number(p.startOffset) || 0;
    const peek = from && to ? awayFrom(from, to, Math.max(10, (from.h || 80) * .08)) : from;
    const hang = liftRect(to, .075);
    return [
      snapMove({iid:p.iid, card:p.card || null, faceDown:p.faceDown !== false, fromRect:from, toRect:peek || from, startOffset:start, duration:70, rotate:-2.8, scale:1.018, layer:p.layer || 'effects'}),
      cardMove({iid:p.iid, card:p.card || null, faceDown:p.faceDown !== false, fromRect:peek || from, toRect:hang || to, startOffset:start + 56, duration:MOTION.travel, path:'withdraw', arc:.18, lift:.18, rotate:-5.6, scale:1.045, holdMs:34, layer:p.layer || 'effects'}),
      snapMove({iid:p.iid, card:p.card || null, faceDown:p.faceDown !== false, fromRect:hang || peek || from, toRect:to, startOffset:start + MOTION.travel + 74, duration:82, rotate:1.8, layer:p.layer || 'effects'}),
      P().soundCue({cue:'draw_card', startOffset:start + 88})
    ];
  }

  function searchToHand(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'deckRect', 'discardRect', 'sourceRect']);
    const to = payloadRect(p, ['toRect', 'handRect', 'slotRect']);
    const scan = from && to ? sideStep(liftRect(from, .16), to, Math.max(16, (from.w || 70) * .28)) : from;
    const hang = liftRect(to, .11);
    return [
      snapMove({iid:p.iid, card:p.card || null, faceDown:p.faceDown === true, fromRect:from, toRect:scan || from, startOffset:0, duration:96, rotate:p.source === 'discard' ? -5 : 5, scale:1.045, layer:p.layer || 'effects', priority:'high'}),
      cardMove({iid:p.iid, card:p.card || null, faceDown:p.faceDown === true, fromRect:scan || from, toRect:hang || to, startOffset:82, duration:MOTION.heavy, path:'overshoot', arc:.24, lift:.24, rotate:p.source === 'discard' ? -7 : 7, scale:1.07, overshoot:.055, holdMs:48, layer:p.layer || 'effects', priority:'high'}),
      snapMove({iid:p.iid, card:p.card || null, faceDown:p.faceDown === true, fromRect:hang || scan || from, toRect:to, startOffset:MOTION.heavy + 124, duration:88, rotate:-1.8, layer:p.layer || 'effects', priority:'high'}),
      impact(p.iid, to, MOTION.heavy + 188, .044),
      P().soundCue({cue:'search_found', startOffset:116, priority:'high'})
    ];
  }

  function discardCard(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'sourceRect']);
    const to = payloadRect(p, ['toRect', 'discardRect']);
    const recoil = from && to ? awayFrom(from, to, Math.max(18, (from.h || 80) * .10)) : from;
    const dive = to ? liftRect(to, .13) : to;
    return [
      snapMove({iid:p.iid, card:p.card, fromRect:from, toRect:recoil || from, startOffset:0, duration:76, rotate:-5.4, scale:1.034, priority:'normal'}),
      cardMove({iid:p.iid, card:p.card, fromRect:recoil || from, toRect:dive || to, startOffset:58, duration:MOTION.normal + 68, path:'drop', arc:.12, lift:.08, rotate:-12, scale:.78, overshoot:.035, fadeOut:true, priority:'high'}),
      impact(p.iid, to, MOTION.normal + 104, .050),
      P().soundCue({cue:'discard_card', startOffset:MOTION.normal + 78, priority:'high'})
    ];
  }

  function destroyCard(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'sourceRect', 'targetRect']);
    const to = payloadRect(p, ['toRect', 'discardRect']) || from;
    const recoil = from ? offsetRect(from, 0, -Math.max(6, from.h * .05)) : from;
    return [
      snapMove({iid:p.iid, card:p.card, fromRect:from, toRect:recoil || from, startOffset:0, duration:82, rotate:5.5, scale:1.032, priority:'high'}),
      cardMove({iid:p.iid, card:p.card, fromRect:recoil || from, toRect:to, startOffset:72, duration:MOTION.normal + 42, path:'drop', arc:.08, lift:.04, rotate:13, scale:.70, fadeOut:true, priority:'high'}),
      P().soundCue({cue:'destroy_card', startOffset:88, priority:'high'})
    ];
  }

  function fateGain(payload){
    const p = payload || {};
    const rect = payloadRect(p, ['rect', 'targetRect', 'cardRect']);
    return [
      P().cardLift({iid:p.iid, card:p.card, rect, fromRect:rect, toRect:rect, startOffset:0, duration:126, easing:'out-quint', lift:.075, rotate:.8, scale:1.016, priority:'normal'}),
      P().numberPop({text:fateDeltaText(p, '+'), rect, startOffset:34, duration:660, rise:44, color:'#7fff90', theme:'fate-delta', priority:'high'}),
      P().soundCue({cue:'fate_gain', startOffset:90})
    ];
  }

  function fateLoss(payload){
    const p = payload || {};
    const rect = payloadRect(p, ['rect', 'targetRect', 'cardRect']);
    const nudge = offsetRect(rect, rect ? -Math.max(2, rect.w * .018) : 0, 0);
    return [
      snapMove({iid:p.iid, card:p.card, fromRect:rect, toRect:nudge || rect, startOffset:0, duration:54, rotate:-1.2, scale:1.01, priority:'normal'}),
      snapMove({iid:p.iid, card:p.card, fromRect:nudge || rect, toRect:rect, startOffset:50, duration:70, rotate:.8, scale:1.0, priority:'normal'}),
      P().numberPop({text:fateDeltaText(p, '-'), rect, startOffset:30, duration:660, rise:44, color:'#ff6060', theme:'fate-loss', priority:'high'}),
      P().soundCue({cue:'fate_loss', startOffset:72})
    ];
  }

  function moveCard(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'sourceRect']);
    const to = payloadRect(p, ['toRect', 'targetRect', 'cellRect']);
    const pull = from && to ? awayFrom(from, to, Math.max(7, (from.h || 80) * .045)) : from;
    const hang = liftRect(to, .075);
    const travelMs = Math.max(200, Math.min(360, Number(p.duration) || MOTION.normal + 36));
    return [
      snapMove({iid:p.iid, card:p.card, faceDown:p.faceDown, fromRect:from, toRect:pull || from, startOffset:0, duration:58, rotate:-1.5, scale:1.014, priority:p.priority || 'normal'}),
      cardMove({iid:p.iid, card:p.card, faceDown:p.faceDown, fromRect:pull || from, toRect:hang || to, startOffset:44, duration:travelMs, easing:p.easing || 'out-quint', path:p.path || 'arc', arc:Number.isFinite(Number(p.arc)) ? Number(p.arc) : .16, lift:Number.isFinite(Number(p.lift)) ? Number(p.lift) : .15, rotate:Number.isFinite(Number(p.rotate)) ? Number(p.rotate) : 3.2, scale:Number(p.scale) || 1.032, overshoot:Number(p.overshoot) || .022, holdMs:34, priority:p.priority || 'high'}),
      snapMove({iid:p.iid, card:p.card, faceDown:p.faceDown, fromRect:hang || pull || from, toRect:to, startOffset:44 + travelMs - 4, duration:84, rotate:-1.3, priority:p.priority || 'high'}),
      impact(p.iid, to, 44 + travelMs + 52, .036),
      P().soundCue({cue:p.cue || 'card_move', startOffset:44 + travelMs + 18})
    ];
  }

  function swapCards(payload){
    const p = payload || {};
    const a = p.a || {};
    const b = p.b || {};
    const aTo = a.toRect || b.fromRect;
    const bTo = b.toRect || a.fromRect;
    return [
      cardMove({iid:a.iid, card:a.card, fromRect:a.fromRect, toRect:liftRect(aTo, .08) || aTo, startOffset:0, duration:MOTION.normal + 20, arc:.18, lift:.18, rotate:5.5, scale:1.035, priority:'high'}),
      cardMove({iid:b.iid, card:b.card, fromRect:b.fromRect, toRect:liftRect(bTo, .08) || bTo, startOffset:MOTION.stagger, duration:MOTION.normal + 20, arc:.18, lift:.18, rotate:-5.5, scale:1.035, priority:'high'}),
      snapMove({iid:a.iid, card:a.card, fromRect:liftRect(aTo, .08) || a.fromRect, toRect:aTo, startOffset:MOTION.normal + 50, duration:82, rotate:-1.6, priority:'high'}),
      snapMove({iid:b.iid, card:b.card, fromRect:liftRect(bTo, .08) || b.fromRect, toRect:bTo, startOffset:MOTION.normal + 68, duration:82, rotate:1.6, priority:'high'}),
      P().soundCue({cue:'card_move', startOffset:MOTION.normal + 44})
    ];
  }

  function consolidate(payload){
    const p = payload || {};
    const targetRect = payloadRect(p, ['targetRect', 'toRect']);
    const tributes = Array.isArray(p.tributes) ? p.tributes : [];
    const core = inset(targetRect, .09) || targetRect;
    const list = [P().soundCue({cue:'consolidate_charge', startOffset:34, priority:'high'})];
    if(tributes.length === 1){
      const t = tributes[0] || {};
      const from = t.rect || t.fromRect || t.cardRect;
      const rise = liftRect(core || targetRect, .28);
      if(from){
        list.push(cardMove({
          iid:t.iid,
          card:t.card,
          fromRect:from,
          toRect:rise || core || targetRect,
          startOffset:44,
          duration:188,
          easing:'out-quint',
          path:'arc',
          arc:.10,
          lift:.26,
          rotate:4.5,
          scale:1.045,
          holdMs:44,
          priority:'high'
        }));
        list.push(snapMove({
          iid:t.iid,
          card:t.card,
          fromRect:rise || from,
          toRect:core || targetRect,
          startOffset:230,
          duration:104,
          rotate:-2.4,
          scale:1.012,
          priority:'high'
        }));
        list.push(P().cardImpact({iid:p.targetIid || t.iid, rect:targetRect, startOffset:318, duration:118, amplitude:.058, priority:'high'}));
        list.push(P().soundCue({cue:'consolidate_impact', startOffset:300, priority:'high'}));
      }
      return list;
    }
    const gap = tributes.length > 1 ? 76 : 30;
    const collideMs = tributes.length > 1 ? 186 : 170;
    tributes.forEach(function(t, index){
      const from = t && (t.rect || t.fromRect || t.cardRect);
      if(!from) return;
      const start = 54 + index * (collideMs + gap);
      const lane = index % 2 ? -1 : 1;
      const pull = awayFrom(from, targetRect, Math.max(18, (from.h || 80) * .11));
      const strike = offsetRect(core, lane * Math.max(3, core.w * .10), ((index % 3) - 1) * Math.max(2, core.h * .035));
      list.push(cardMove({
        iid:t.iid,
        card:t.card,
        fromRect:pull || from,
        toRect:strike || core,
        startOffset:start,
        duration:collideMs,
        easing:'in-quart',
        path:'overshoot',
        arc:.30 + Math.min(.10, index * .018),
        lift:.32 + Math.min(.08, index * .014),
        rotate:lane * (tributes.length > 1 ? 28 : 18),
        scale:.74,
        overshoot:.18,
        fadeOut:true,
        priority:'high'
      }));
      list.push(impact(t.iid, targetRect, start + collideMs - 18, tributes.length > 1 ? .078 : .052));
    });
    const hitAt = 54 + Math.max(0, tributes.length - 1) * (collideMs + gap) + collideMs - 18;
    list.push(P().cardImpact({iid:p.targetIid, rect:targetRect, startOffset:hitAt, duration:126, amplitude:tributes.length > 1 ? .090 : .060, priority:'high'}));
    list.push(P().soundCue({cue:'consolidate_impact', startOffset:hitAt, priority:'high'}));
    return list;
  }

  function supporterActivate(payload){
    const p = payload || {};
    const from = payloadRect(p, ['sourceRect', 'fromRect', 'rect']);
    const to = payloadRect(p, ['targetRect', 'toRect']) || from;
    return [
      P().cardLift({iid:p.iid || p.sourceIid, card:p.card || p.sourceCard, rect:from, fromRect:from, toRect:from, startOffset:0, duration:130, easing:'out-quint', lift:.10, rotate:1.8, scale:1.026, priority:'normal'}),
      snapMove({iid:p.proxyIid || p.sourceIid, card:p.card || p.sourceCard || null, fromRect:from, toRect:liftRect(to, .06) || to, startOffset:54, duration:128, rotate:3.8, scale:.86, fadeOut:true, priority:'normal'}),
      impact(p.targetIid, to, 174, .038),
      P().soundCue({cue:'supporter_activate', startOffset:76})
    ];
  }

  function landscapeTrigger(payload){
    const p = payload || {};
    const rect = payloadRect(p, ['rect', 'zoneRect', 'targetRect']);
    return [
      P().cardLift({iid:p.iid, card:p.card || null, rect, fromRect:rect, toRect:rect, startOffset:0, duration:120, easing:'out-quint', lift:.045, rotate:.6, scale:1.01, priority:'normal'}),
      impact(p.iid, rect, 86, .030),
      P().soundCue({cue:'landscape_trigger', startOffset:86})
    ];
  }

  function turnStart(payload){
    return [P().soundCue({cue:'turn_start', startOffset:48})];
  }

  function turnEnd(payload){
    return [P().soundCue({cue:'turn_end', startOffset:32})];
  }

  function invalidAction(payload){
    const p = payload || {};
    const rect = payloadRect(p, ['rect', 'targetRect', 'cardRect']);
    const nudge = offsetRect(rect, rect ? Math.max(2, rect.w * .018) : 0, 0);
    return [
      snapMove({iid:p.iid, card:p.card, fromRect:rect, toRect:nudge || rect, startOffset:0, duration:46, rotate:1.0, scale:1.006, priority:'high'}),
      snapMove({iid:p.iid, card:p.card, fromRect:nudge || rect, toRect:rect, startOffset:44, duration:64, rotate:-.8, scale:1.0, priority:'high'}),
      P().soundCue({cue:'invalid_action', startOffset:24})
    ];
  }

  function cardReveal(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'sourceRect']);
    const to = payloadRect(p, ['toRect', 'targetRect', 'rect']) || from;
    const hang = liftRect(to, .085);
    return [
      cardMove({iid:p.iid, card:p.card, fromRect:from || scaleRect(to, .86), toRect:hang || to, startOffset:0, duration:MOTION.travel, arc:.14, lift:.15, rotate:3.0, scale:1.045, holdMs:42, fadeIn:!from, priority:'high'}),
      snapMove({iid:p.iid, card:p.card, fromRect:hang || from || to, toRect:to, startOffset:MOTION.travel - 2, duration:86, rotate:-1.4, priority:'high'}),
      impact(p.iid, to, MOTION.travel + 54, .034),
      P().soundCue({cue:'card_reveal', startOffset:104})
    ];
  }

  const recipes = {
    CARD_FLIP:function(payload){
      const p = payload || {};
      const r = payloadRect(p, ['rect', 'targetRect', 'cardRect']);
      return [
        P().cardLift({iid:p.iid, card:p.card, rect:r, fromRect:r, toRect:r, startOffset:0, duration:82, easing:'out-quint', lift:.065, rotate:-1.2, scale:1.018, priority:'normal'}),
        P().cardFlip({iid:p.iid, card:p.card, rect:r, startOffset:54, duration:280, glowColor:'rgba(255,232,150,.20)', revealFlash:false, noGlow:true}),
        impact(p.iid, r, 316, .032),
        P().soundCue({cue:'card_flip', startOffset:196})
      ];
    },
    PLAY_CARD:playCard,
    DRAW_CARD:drawCard,
    DISCARD_CARD:discardCard,
    DESTROY_CARD:destroyCard,
    MOVE_CARD:moveCard,
    SWAP_CARDS:swapCards,
    RETURN_TO_HAND:function(payload){ return moveCard(Object.assign({cue:'return_to_hand', path:'withdraw', rotate:-2.0, scale:.97, duration:MOTION.normal}, payload || {})); },
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
        mode:'motion-only',
        particles:false,
        recipes:Object.keys(recipes),
        recipeKinds
      };
    }
  };
  window.fateVfxRecipesReport = window.FateVfxRecipes.report;
})();
