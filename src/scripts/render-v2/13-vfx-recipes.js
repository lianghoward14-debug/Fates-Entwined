(function(){
  'use strict';

  if(typeof window === 'undefined') return;
  if(window.FateVfxRecipes) return;

  const VERSION = 7;
  const STYLE_VERSION = 'professional-tcg-motion-v1';
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

  function clamp(value, min, max){
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function clampRectToViewport(rect, margin){
    if(!rect) return null;
    const m = Number(margin) || 10;
    const vw = Math.max(320, window.innerWidth || 1280);
    const vh = Math.max(320, window.innerHeight || 720);
    const w = Math.min(Number(rect.w) || 1, Math.max(1, vw - m * 2));
    const h = Math.min(Number(rect.h) || 1, Math.max(1, vh - m * 2));
    return {
      x:clamp(Number(rect.x) || 0, m, vw - w - m),
      y:clamp(Number(rect.y) || 0, m, vh - h - m),
      w,
      h
    };
  }

  function featuredRect(target, scale, options){
    if(!target) return null;
    const opts = options || {};
    const base = scaleRect(target, Number(scale) || 1.8);
    if(!base) return null;
    const yLift = Math.max(12, (Number(target.h) || 80) * Number(opts.lift == null ? .74 : opts.lift));
    const xBias = (Number(target.w) || 70) * Number(opts.xBias || 0);
    return clampRectToViewport(offsetRect(base, xBias, -yLift), Math.max(12, (Number(target.w) || 70) * .12));
  }

  function strikeRect(target, index, count, scale){
    if(!target) return null;
    const n = Math.max(1, Number(count) || 1);
    const lane = index % 2 ? -1 : 1;
    const spread = n <= 1 ? 0 : ((index - (n - 1) / 2) / Math.max(1, n - 1));
    return clampRectToViewport(offsetRect(scaleRect(target, scale || 1.34), lane * target.w * .08, spread * target.h * .12), 10);
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

  function fateNumberPop(payload, sign, color, theme){
    const p = payload || {};
    const amount = Math.max(1, Math.abs(Number(p.amount != null ? p.amount : p.fateDelta) || 1));
    const countMs = 1;
    const holdMs = 2350;
    const exitMs = 180;
    const duration = countMs + holdMs + exitMs;
    return P().numberPop({
      text:fateDeltaText(p, sign),
      sign,
      endValue:amount,
      rect:payloadRect(p, ['rect', 'targetRect', 'cardRect']),
      startOffset:18,
      duration,
      rise:Math.max(10, (Number((payloadRect(p, ['rect', 'targetRect', 'cardRect']) || {}).h) || 90) * .10),
      countPortion:countMs / duration,
      holdEnd:(countMs + holdMs) / duration,
      emphasisPortion:.01,
      color,
      theme,
      fontScale:1.24,
      priority:'high'
    });
  }

  function playCard(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'sourceRect', 'handRect']);
    const to = payloadRect(p, ['toRect', 'targetRect', 'cellRect']);
    if(p.placementStyle === 'target-snap'){
      const above = scaleRect(liftRect(to, .18), .98);
      const list = [
        cardMove({iid:p.iid, card:p.card, faceDown:p.faceDown, fromRect:above || to || from, toRect:to, startOffset:0, duration:132, easing:'snap-settle', path:'direct', rotate:-5.2, scale:1.028, bank:4, landSquash:.045, wobble:3.2, settleMs:46, priority:'high'})
      ];
      if(!p.suppressMotionAudio) list.push(P().soundCue({cue:'card_play_land', startOffset:82, priority:'high'}));
      return list;
    }
    const featureScale = clamp(Number(p.featureScale) || 1.86, 1.34, 2.45);
    const inspect = featuredRect(to, featureScale, {
      lift:Number(p.featureLift == null ? .78 : p.featureLift),
      xBias:Number(p.featureXBias) || 0
    }) || liftRect(scaleRect(to, featureScale), .22) || to;
    const load = from && inspect ? sideStep(awayFrom(from, inspect, Math.max(10, (from.h || 80) * .075)), inspect, Math.max(10, (from.w || 70) * .20)) : from;
    const settleAbove = featuredRect(to, Math.max(1.18, featureScale * .72), {lift:.28, xBias:Number(p.featureXBias) * .38 || 0}) || liftRect(to, .20);
    const duration = Math.max(320, Math.min(520, Number(p.duration) || 420));
    const travelMs = Math.round(duration * .46);
    const inspectMs = Math.round(duration * .22);
    const settleStart = 54 + travelMs + inspectMs;
    const list = [
      cardMove({iid:p.iid, card:p.card, faceDown:p.faceDown, fromRect:from, toRect:load || from, startOffset:0, duration:54, easing:'in-quart', path:'direct', rotate:-7.0, bank:-4, scale:1.02, launchSquash:.035, priority:'high'}),
      cardMove({iid:p.iid, card:p.card, faceDown:p.faceDown, fromRect:load || from, toRect:inspect || to, startOffset:42, duration:travelMs, easing:'out-expo-soft', path:'overshoot', arc:Number(p.arc) || .20, lift:Number(p.lift) || .18, sideArc:Number(p.sideArc == null ? .32 : p.sideArc), rotate:Number(p.rotate) || 7.5, bank:8, scale:1.035, overshoot:.055, holdMs:inspectMs, priority:'high'}),
      cardMove({iid:p.iid, card:p.card, faceDown:p.faceDown, fromRect:inspect || load || from, toRect:settleAbove || to, startOffset:settleStart, duration:96, easing:'in-out-cubic', path:'direct', rotate:-2.2, scale:1.0, bank:-2, priority:'high'}),
      cardMove({iid:p.iid, card:p.card, faceDown:p.faceDown, fromRect:settleAbove || inspect || from, toRect:to, startOffset:settleStart + 78, duration:88, easing:'snap-settle', path:'direct', rotate:-4.2, scale:1.012, bank:-2, landSquash:.055, wobble:3.6, settleMs:44, priority:'high'})
    ];
    if(!p.suppressMotionAudio) {
      list.push(P().soundCue({cue:'card_play_land', startOffset:settleStart + 102, priority:'high'}));
    }
    return list;
  }

  function drawCard(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'deckRect', 'sourceRect']);
    const to = payloadRect(p, ['toRect', 'handRect', 'slotRect']);
    const start = Number(p.startOffset) || 0;
    const peek = from && to ? sideStep(awayFrom(from, to, Math.max(12, (from.h || 80) * .10)), to, Math.max(12, (from.w || 70) * .20)) : from;
    const hang = liftRect(to, .12);
    return [
      cardMove({iid:p.iid, card:p.card || null, faceDown:p.faceDown !== false, fromRect:from, toRect:peek || from, startOffset:start, duration:86, easing:'in-quart', path:'direct', rotate:-8.0, bank:-4, scale:1.035, launchSquash:.042, layer:p.layer || 'effects'}),
      cardMove({iid:p.iid, card:p.card || null, faceDown:p.faceDown !== false, fromRect:peek || from, toRect:hang || to, startOffset:start + 62, duration:358, easing:'out-expo-soft', path:'withdraw', arc:.26, lift:.28, sideArc:-.34, rotate:-12.5, bank:-9, scale:1.068, holdMs:44, layer:p.layer || 'effects'}),
      cardMove({iid:p.iid, card:p.card || null, faceDown:p.faceDown !== false, fromRect:hang || peek || from, toRect:to, startOffset:start + 414, duration:82, easing:'snap-settle', path:'direct', rotate:3.0, scale:1.006, landSquash:.035, wobble:2.6, layer:p.layer || 'effects'}),
      P().soundCue({cue:'draw_card', startOffset:start + 96})
    ];
  }

  function searchToHand(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'deckRect', 'discardRect', 'sourceRect']);
    const to = payloadRect(p, ['toRect', 'handRect', 'slotRect']);
    const scan = from && to ? sideStep(liftRect(from, .20), to, Math.max(18, (from.w || 70) * .34)) : from;
    const hover = liftRect(to, .15);
    return [
      cardMove({iid:p.iid, card:p.card || null, faceDown:p.faceDown === true, fromRect:from, toRect:scan || from, startOffset:0, duration:128, easing:'out-quint', path:'direct', rotate:p.source === 'discard' ? -12 : 12, bank:p.source === 'discard' ? -5 : 5, scale:1.065, launchSquash:.045, layer:p.layer || 'effects', priority:'high'}),
      cardMove({iid:p.iid, card:p.card || null, faceDown:p.faceDown === true, fromRect:scan || from, toRect:hover || to, startOffset:104, duration:456, easing:'out-expo-soft', path:'overshoot', arc:.34, lift:.36, sideArc:p.source === 'discard' ? -.48 : .48, rotate:p.source === 'discard' ? -16 : 16, bank:p.source === 'discard' ? -12 : 12, scale:1.09, overshoot:.090, holdMs:78, layer:p.layer || 'effects', priority:'high'}),
      cardMove({iid:p.iid, card:p.card || null, faceDown:p.faceDown === true, fromRect:hover || scan || from, toRect:to, startOffset:624, duration:88, easing:'snap-settle', path:'direct', rotate:-3.4, landSquash:.045, wobble:3.2, layer:p.layer || 'effects', priority:'high'}),
      P().soundCue({cue:'search_found', startOffset:116, priority:'high'})
    ];
  }

  function discardCard(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'sourceRect']);
    const to = payloadRect(p, ['toRect', 'discardRect']);
    const recoil = from && to ? sideStep(awayFrom(from, to, Math.max(18, (from.h || 80) * .12)), to, Math.max(8, (from.w || 70) * .10)) : from;
    const dive = to ? liftRect(to, .10) : to;
    return [
      cardMove({iid:p.iid, card:p.card, fromRect:from, toRect:recoil || from, startOffset:0, duration:86, easing:'in-quart', path:'direct', rotate:-12.0, bank:-7, scale:1.045, launchSquash:.040, priority:'normal'}),
      cardMove({iid:p.iid, card:p.card, fromRect:recoil || from, toRect:dive || to, startOffset:68, duration:326, easing:'out-expo-soft', path:'drop', arc:.24, lift:.13, sideArc:-.26, rotate:-24, bank:-11, scale:.72, overshoot:.055, fadeOut:true, priority:'high'}),
      P().soundCue({cue:'discard_card', startOffset:304, priority:'high'})
    ];
  }

  function destroyCard(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'sourceRect', 'targetRect']);
    const to = payloadRect(p, ['toRect', 'discardRect']) || from;
    const recoil = from ? offsetRect(from, 0, -Math.max(8, from.h * .075)) : from;
    return [
      cardMove({iid:p.iid, card:p.card, fromRect:from, toRect:recoil || from, startOffset:0, duration:90, easing:'out-quint', path:'direct', rotate:10, bank:7, scale:1.05, launchSquash:.04, priority:'high'}),
      cardMove({iid:p.iid, card:p.card, fromRect:recoil || from, toRect:to, startOffset:70, duration:286, easing:'in-quart', path:'drop', arc:.20, lift:.08, sideArc:.30, rotate:28, bank:13, scale:.62, fadeOut:true, priority:'high'}),
      P().soundCue({cue:'destroy_card', startOffset:88, priority:'high'})
    ];
  }

  function fateGain(payload){
    const p = payload || {};
    return [
      fateNumberPop(p, '+', '#55e68a', 'fate-delta'),
      P().soundCue({cue:'fate_gain', startOffset:90})
    ];
  }

  function fateLoss(payload){
    const p = payload || {};
    return [
      fateNumberPop(p, '-', '#ff6f7d', 'fate-loss'),
      P().soundCue({cue:'fate_loss', startOffset:72})
    ];
  }

  function moveCard(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'sourceRect']);
    const to = payloadRect(p, ['toRect', 'targetRect', 'cellRect']);
    const pull = from && to ? awayFrom(from, to, Math.max(7, (from.h || 80) * .045)) : from;
    const hang = liftRect(to, .13);
    const travelMs = Math.max(230, Math.min(390, Number(p.duration) || 318));
    return [
      cardMove({iid:p.iid, card:p.card, faceDown:p.faceDown, fromRect:from, toRect:pull || from, startOffset:0, duration:60, easing:'in-quart', path:'direct', rotate:-4.0, bank:-4, scale:1.028, launchSquash:.034, priority:p.priority || 'normal'}),
      cardMove({iid:p.iid, card:p.card, faceDown:p.faceDown, fromRect:pull || from, toRect:hang || to, startOffset:46, duration:travelMs, easing:p.easing || 'out-expo-soft', path:p.path || 'overshoot', arc:Number.isFinite(Number(p.arc)) ? Number(p.arc) : .24, lift:Number.isFinite(Number(p.lift)) ? Number(p.lift) : .24, sideArc:Number.isFinite(Number(p.sideArc)) ? Number(p.sideArc) : .30, rotate:Number.isFinite(Number(p.rotate)) ? Number(p.rotate) : 8.0, bank:Number.isFinite(Number(p.bank)) ? Number(p.bank) : 8, scale:Number(p.scale) || 1.06, overshoot:Number(p.overshoot) || .065, holdMs:46, priority:p.priority || 'high'}),
      cardMove({iid:p.iid, card:p.card, faceDown:p.faceDown, fromRect:hang || pull || from, toRect:to, startOffset:46 + travelMs + 34, duration:82, easing:'snap-settle', path:'direct', rotate:-2.4, landSquash:.042, wobble:3.4, priority:p.priority || 'high'}),
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
      cardMove({iid:a.iid, card:a.card, fromRect:a.fromRect, toRect:liftRect(aTo, .18) || aTo, startOffset:0, duration:326, easing:'out-expo-soft', path:'overshoot', arc:.30, lift:.32, sideArc:.52, rotate:13.0, bank:12, scale:1.07, overshoot:.078, priority:'high'}),
      cardMove({iid:b.iid, card:b.card, fromRect:b.fromRect, toRect:liftRect(bTo, .18) || bTo, startOffset:38, duration:326, easing:'out-expo-soft', path:'overshoot', arc:.30, lift:.32, sideArc:-.52, rotate:-13.0, bank:-12, scale:1.07, overshoot:.078, priority:'high'}),
      cardMove({iid:a.iid, card:a.card, fromRect:liftRect(aTo, .18) || a.fromRect, toRect:aTo, startOffset:368, duration:78, easing:'snap-settle', path:'direct', rotate:-3.0, landSquash:.040, wobble:3.0, priority:'high'}),
      cardMove({iid:b.iid, card:b.card, fromRect:liftRect(bTo, .18) || b.fromRect, toRect:bTo, startOffset:392, duration:78, easing:'snap-settle', path:'direct', rotate:3.0, landSquash:.040, wobble:3.0, priority:'high'}),
      P().soundCue({cue:'card_move', startOffset:MOTION.normal + 44})
    ];
  }

  function consolidate(payload){
    const p = payload || {};
    const targetRect = payloadRect(p, ['targetRect', 'toRect']);
    const tributes = Array.isArray(p.tributes) ? p.tributes : [];
    const core = inset(targetRect, .09) || targetRect;
    const focus = featuredRect(targetRect, tributes.length > 1 ? 1.72 : 1.54, {lift:.62}) || scaleRect(core || targetRect, 1.45) || core;
    const list = [P().soundCue({cue:'consolidate_charge', startOffset:34, priority:'high'})];
    if(tributes.length === 1){
      const t = tributes[0] || {};
      const from = t.rect || t.fromRect || t.cardRect;
      const rise = featuredRect(core || targetRect, 1.48, {lift:.56}) || liftRect(core || targetRect, .28);
      if(from){
        list.push(cardMove({
          iid:t.iid,
          card:t.card,
          fromRect:from,
          toRect:rise || core || targetRect,
          startOffset:44,
          duration:156,
          easing:'out-quint',
          path:'arc',
          arc:.12,
          lift:.18,
          rotate:6.0,
          bank:6,
          sideArc:.22,
          scale:1.02,
          holdMs:58,
          launchSquash:.035,
          priority:'high'
        }));
        list.push(cardMove({
          iid:t.iid,
          card:t.card,
          fromRect:rise || from,
          toRect:core || targetRect,
          startOffset:212,
          duration:96,
          easing:'snap-settle',
          path:'direct',
          rotate:-2.4,
          scale:1.012,
          landSquash:.054,
          wobble:3.8,
          priority:'high'
        }));
        list.push(cardMove({iid:p.targetIid || t.iid, card:p.resultCard || p.targetCard || t.card, fromRect:core || targetRect, toRect:focus || targetRect, startOffset:300, duration:116, easing:'out-quint', path:'direct', rotate:2.4, scale:1.012, priority:'high'}));
        list.push(cardMove({iid:p.targetIid || t.iid, card:p.resultCard || p.targetCard || t.card, fromRect:focus || targetRect, toRect:targetRect, startOffset:404, duration:96, easing:'snap-settle', path:'direct', rotate:-2.0, landSquash:.044, wobble:2.8, priority:'high'}));
        list.push(P().cardImpact({iid:p.targetIid || t.iid, card:p.resultCard || p.targetCard || t.card, rect:targetRect, startOffset:404, duration:118, amplitude:.052, priority:'high'}));
        list.push(P().soundCue({cue:'consolidate_impact', startOffset:392, priority:'high'}));
      }
      return list;
    }
    const gap = tributes.length > 1 ? 58 : 30;
    const collideMs = tributes.length > 1 ? 166 : 150;
    tributes.forEach(function(t, index){
      const from = t && (t.rect || t.fromRect || t.cardRect);
      if(!from) return;
      const start = 44 + index * (collideMs + gap);
      const lane = index % 2 ? -1 : 1;
      const pull = sideStep(awayFrom(from, focus || targetRect, Math.max(18, (from.h || 80) * .11)), focus || targetRect, lane * Math.max(10, (from.w || 70) * .22));
      const strike = strikeRect(focus || core, index, tributes.length, 1.0) || core;
      list.push(cardMove({
        iid:t.iid,
        card:t.card,
        fromRect:pull || from,
        toRect:strike || core,
        startOffset:start,
        duration:collideMs,
        easing:'in-out-cubic',
        path:'overshoot',
        arc:.18 + Math.min(.06, index * .012),
        lift:.18 + Math.min(.05, index * .010),
        sideArc:lane * (.24 + Math.min(.08, index * .012)),
        rotate:lane * (tributes.length > 1 ? 18 : 12),
        bank:lane * 10,
        scale:.92,
        launchSquash:.040,
        landSquash:.040,
        overshoot:.10,
        fadeOut:true,
        priority:'high'
      }));
      list.push(P().cardImpact({iid:t.iid, card:p.resultCard || p.targetCard || t.card, rect:focus || targetRect, startOffset:start + collideMs - 18, duration:64, amplitude:.030 + Math.min(.025, index * .004), priority:'high'}));
    });
    const hitAt = 44 + Math.max(0, tributes.length - 1) * (collideMs + gap) + collideMs;
    list.push(cardMove({iid:p.targetIid, card:p.resultCard || p.targetCard, fromRect:focus || targetRect, toRect:focus || targetRect, startOffset:Math.max(0, hitAt - 34), duration:72, easing:'out-quint', path:'direct', rotate:1.8, scale:1.018, priority:'high'}));
    list.push(cardMove({iid:p.targetIid, card:p.resultCard || p.targetCard, fromRect:focus || targetRect, toRect:targetRect, startOffset:hitAt + 52, duration:112, easing:'snap-settle', path:'direct', rotate:-2.2, landSquash:.052, wobble:3.2, priority:'high'}));
    list.push(P().cardImpact({iid:p.targetIid, card:p.resultCard || p.targetCard, rect:targetRect, startOffset:hitAt + 52, duration:126, amplitude:tributes.length > 1 ? .070 : .050, priority:'high'}));
    list.push(P().soundCue({cue:'consolidate_impact', startOffset:hitAt, priority:'high'}));
    return list;
  }

  function supporterActivate(payload){
    const p = payload || {};
    const from = payloadRect(p, ['sourceRect', 'fromRect', 'rect']);
    const to = payloadRect(p, ['targetRect', 'toRect']) || from;
    return [
      P().cardLift({iid:p.iid || p.sourceIid, card:p.card || p.sourceCard, rect:from, fromRect:from, toRect:from, startOffset:0, duration:138, easing:'out-quint', lift:.12, rotate:2.2, scale:1.032, priority:'normal'}),
      cardMove({iid:p.proxyIid || p.sourceIid, card:p.card || p.sourceCard || null, fromRect:from, toRect:liftRect(to, .08) || to, startOffset:60, duration:154, easing:'out-expo-soft', path:'overshoot', arc:.16, lift:.16, rotate:5.2, scale:.88, fadeOut:true, priority:'normal'}),
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
    const hang = liftRect(to, .14);
    return [
      cardMove({iid:p.iid, card:p.card, fromRect:from || scaleRect(to, .86), toRect:hang || to, startOffset:0, duration:330, easing:'out-expo-soft', path:'overshoot', arc:.18, lift:.20, rotate:4.2, scale:1.058, overshoot:.045, holdMs:52, fadeIn:!from, priority:'high'}),
      cardMove({iid:p.iid, card:p.card, fromRect:hang || from || to, toRect:to, startOffset:360, duration:80, easing:'snap-settle', path:'direct', rotate:-1.6, priority:'high'}),
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
        P().cardImpact({iid:p.iid, card:p.card, rect:r, startOffset:316, duration:92, amplitude:.026, priority:'normal'}),
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
        styleVersion:STYLE_VERSION,
        mode:'motion-only',
        particles:false,
        recipes:Object.keys(recipes),
        recipeKinds
      };
    }
  };
  window.fateVfxRecipesReport = window.FateVfxRecipes.report;
})();
