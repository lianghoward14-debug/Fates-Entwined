(function(){
  'use strict';

  if(typeof window === 'undefined') return;
  if(window.FateVfxRecipes) return;

  const VERSION = 53;
  const STYLE_VERSION = 'professional-tcg-motion-v49-search-fixed-size';
  const MOTION = {
    micro:96,
    snap:154,
    short:240,
    normal:360,
    travel:540,
    heavy:760,
    hold:132,
    stagger:72
  };
  const MOTION_PROFILES = {
    tributeStrike:{
      path:'s-curve',
      easing:'in-out-cubic',
      scale:1.05,
      endScale:1,
      textureScale:1.18,
      launchSquash:.030,
      landSquash:.032,
      fadeOut:true,
      skewX:1.1,
      settleMs:70
    },
    consolidationReveal:{
      path:'float',
      easing:'out-expo-soft',
      scale:1.16,
      endScale:1.06,
      textureScale:1.66,
      skewY:.55,
      settleMs:82
    },
    consolidationLanding:{
      path:'slam',
      easing:'snap-settle',
      scale:1.032,
      endScale:1,
      textureScale:1.12,
      landSquash:.042,
      wobble:1.7,
      settleMs:92
    }
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

  function leftPanelSearchRevealRect(source, target, sourceIsDiscard){
    const baseTarget = target || source;
    if(!baseTarget) return source || target || null;
    const base = scaleRect(baseTarget, sourceIsDiscard ? 1.24 : 1.42);
    if(!base) return baseTarget;
    const vw = Math.max(320, window.innerWidth || 1280);
    const vh = Math.max(320, window.innerHeight || 720);
    const sourceRight = source ? (Number(source.x) || 0) + (Number(source.w) || 0) : vw * .14;
    const x = Math.max(sourceRight + Math.max(36, base.w * .22), vw * .18);
    const y = vh * (sourceIsDiscard ? .54 : .50) - base.h / 2;
    return clampRectToViewport({x, y, w:base.w, h:base.h}, Math.max(18, base.w * .11));
  }

  function strikeRect(target, index, count, scale){
    if(!target) return null;
    const n = Math.max(1, Number(count) || 1);
    const lane = index % 2 ? -1 : 1;
    const spread = n <= 1 ? 0 : ((index - (n - 1) / 2) / Math.max(1, n - 1));
    return clampRectToViewport(offsetRect(scaleRect(target, scale || 1.34), lane * target.w * .08, spread * target.h * .12), 10);
  }

  function consolidationCollisionRect(from, target, index, count){
    if(!from || !target) return from || target || null;
    const n = Math.max(1, Number(count) || 1);
    const rc = center(from);
    const tc = center(target);
    let dx = rc.x - tc.x;
    let dy = rc.y - tc.y;
    if(Math.abs(dx) + Math.abs(dy) < 1) {
      const angle = (-80 + index * 38) * Math.PI / 180;
      dx = Math.cos(angle);
      dy = Math.sin(angle);
    }
    const len = Math.max(1, Math.hypot(dx, dy));
    const spread = n <= 1 ? 0 : ((index - (n - 1) / 2) / Math.max(1, n - 1));
    const baseDistance = Math.max(Number(target.w) || 70, Number(target.h) || 96);
    let distanceScale = 1;
    let raw = target;
    for(let tries = 0; tries < 6; tries++){
      const ringX = dx / len * Math.max(58, baseDistance * 1.18 * distanceScale) + spread * target.w * .38;
      const ringY = dy / len * Math.max(62, baseDistance * .94 * distanceScale) - target.h * .28;
      raw = offsetRect(target, ringX, ringY);
      const clamped = clampRectToViewport(raw, 10);
      if(clamped && !overlapsRect(clamped, target)) return clamped;
      if(raw && !overlapsRect(raw, target)) return raw;
      distanceScale += .34;
    }
    return raw;
  }

  function overlapsRect(a, b){
    if(!a || !b) return false;
    const ax1 = Number(a.x) || 0;
    const ay1 = Number(a.y) || 0;
    const ax2 = ax1 + (Number(a.w) || 0);
    const ay2 = ay1 + (Number(a.h) || 0);
    const bx1 = Number(b.x) || 0;
    const by1 = Number(b.y) || 0;
    const bx2 = bx1 + (Number(b.w) || 0);
    const by2 = by1 + (Number(b.h) || 0);
    return ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1;
  }

  function consolidationStartRect(from, target, index, count){
    if(!from || !target || !overlapsRect(from, target)) return from;
    const n = Math.max(1, Number(count) || 1);
    const lane = index % 2 ? -1 : 1;
    const spread = n <= 1 ? 0 : ((index - (n - 1) / 2) / Math.max(1, n - 1));
    return clampRectToViewport(offsetRect(
      from,
      lane * Math.max(28, target.w * .58),
      -Math.max(22, target.h * (.22 + Math.abs(spread) * .10))
    ), 10);
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

  function playCard(payload){
    const p = payload || {};
    const to = payloadRect(p, ['toRect', 'targetRect', 'cellRect']);
    if(!to) return [];
    const duration = Math.max(300, Math.min(420, Number(p.duration) || 340));
    const hover = scaleRect(liftRect(to, .20), 1.10);
    const list = [
      cardMove({
        iid:p.iid,
        card:p.card,
        faceDown:p.faceDown,
        fromRect:hover || to,
        toRect:to,
        targetRect:to,
        startOffset:0,
        duration,
        easing:'out-expo-soft',
        path:'direct',
        rotate:-1.8,
        startScale:1.10,
        scale:1.055,
        endScale:1,
        textureScale:1.22,
        fadeIn:true,
        holdMs:18,
        landSquash:.012,
        wobble:.22,
        settleMs:58,
        priority:'high'
      }),
      P().cardImpact({
        iid:p.iid,
        card:p.card || null,
        faceDown:p.faceDown,
        rect:to,
        startOffset:Math.max(210, duration - 40),
        duration:112,
        amplitude:.006,
        priority:'high'
      })
    ];
    if(!p.suppressMotionAudio) list.push(P().soundCue({cue:'card_play_land', startOffset:Math.max(190, duration - 44), priority:'high'}));
    return list;
  }

  function fitCardAspect(rect){
    if(!rect) return null;
    const x = Number(rect.x) || 0;
    const y = Number(rect.y) || 0;
    const sourceW = Math.max(1, Number(rect.w) || 1);
    const sourceH = Math.max(1, Number(rect.h) || 1);
    const aspect = 1.4;
    let w = sourceW;
    let h = sourceH;
    if(h / w > aspect) h = w * aspect;
    else w = h / aspect;
    return {x:x + (sourceW - w) / 2, y:y + (sourceH - h) / 2, w, h};
  }

  function clampRectToViewportMargins(rect, margins){
    if(!rect) return null;
    const opts = margins || {};
    const vw = Math.max(320, window.innerWidth || 1280);
    const vh = Math.max(320, window.innerHeight || 720);
    const left = Math.max(0, Number(opts.left != null ? opts.left : opts.margin) || 0);
    const right = Math.max(0, Number(opts.right != null ? opts.right : opts.margin) || left);
    const top = Math.max(0, Number(opts.top != null ? opts.top : opts.margin) || left);
    const bottom = Math.max(0, Number(opts.bottom != null ? opts.bottom : opts.margin) || top);
    const maxW = Math.max(1, vw - left - right);
    const maxH = Math.max(1, vh - top - bottom);
    const w = Math.min(Number(rect.w) || 1, maxW);
    const h = Math.min(Number(rect.h) || 1, maxH);
    return {
      x:clamp(Number(rect.x) || 0, left, vw - right - w),
      y:clamp(Number(rect.y) || 0, top, vh - bottom - h),
      w,
      h
    };
  }

  function setConfirm(payload){
    const p = payload || {};
    const rect = payloadRect(p, ['targetRect', 'toRect', 'rect', 'cellRect']);
    return [
      P().cardImpact({iid:p.iid, card:null, rect, startOffset:0, duration:168, amplitude:.010, color:'rgba(255,232,150,.54)', priority:'high'}),
      P().soundCue({cue:'card_play_land', startOffset:28, priority:'high'})
    ];
  }

  function setDragLand(payload){
    return setConfirm(payload);
  }

  function drawCard(payload){
    const p = payload || {};
    // Deck controls and hand hit targets are not guaranteed to share the card
    // aspect ratio. Normalize both ends so interpolation never warps the art.
    const from = fitCardAspect(payloadRect(p, ['fromRect', 'deckRect', 'sourceRect']));
    const to = fitCardAspect(payloadRect(p, ['toRect', 'handRect', 'slotRect']));
    const drawIndex = Math.max(0, Number(p.drawIndex == null ? p.index : p.drawIndex) || 0);
    const drawCount = Math.max(1, Number(p.drawCount == null ? p.count : p.drawCount) || 1);
    const lane = 0;
    const drawSequenceGap = 720;
    const start = (Number(p.startOffset) || 0) + (drawCount > 1 ? drawIndex * drawSequenceGap : 0);
    const baseId = String(p.iid || ('draw-' + drawIndex));
    const layer = p.layer || 'top';
    const w = Number((to || from || {}).w) || 70;
    const h = Number((to || from || {}).h) || 98;
    const handSafeMargin = Math.max(112, h * .92);
    const drawShowcaseScale = 1.12;
    const drawSettleScale = .82;
    const presentationLane = to
      ? clampRectToViewportMargins(
          offsetRect(scaleRect(to, drawShowcaseScale), lane * w * .40, -Math.max(78, h * .58)),
          {left:16, right:16, top:18, bottom:handSafeMargin}
        )
      : to;
    const sweepStart = from
      ? clampRectToViewportMargins(
          offsetRect(scaleRect(from, .88), lane * Math.max(8, w * .13), -Math.max(12, h * .10)),
          {left:14, right:14, top:14, bottom:handSafeMargin}
        )
      : from;
    const settleLane = presentationLane
      ? offsetRect(scaleRect(to || presentationLane, drawSettleScale), lane * w * .10, -Math.max(12, h * .08))
      : to;
    const travelRotate = lane * 6 + (drawCount <= 1 ? -4 : 0);
    const travelSide = lane * .14;
    const list = [
      cardMove({iid:p.iid || baseId, card:p.card || null, faceDown:p.faceDown === true, fromRect:sweepStart || from, toRect:presentationLane || to, startOffset:start, duration:390, easing:'out-expo-soft', path:'s-curve', arc:.30, lift:.30, sideArc:travelSide, rotate:travelRotate, bank:lane * .75, startScale:.78, scale:1.08, endScale:1.04, textureScale:1.18, holdMs:34, launchSquash:0, landSquash:0, wobble:0, settleMs:0, noShadow:true, keepInFrame:true, safeMargin:16, safeBottomMargin:handSafeMargin, layer, priority:'high'}),
      cardMove({iid:p.iid || baseId, card:p.card || null, faceDown:p.faceDown === true, fromRect:presentationLane || from, toRect:settleLane || presentationLane || to, startOffset:start + 380, duration:220, easing:'out-quint', path:'float', arc:.04, lift:.05, sideArc:0, rotate:-lane * 1.2, bank:0, startScale:1.04, scale:.96, endScale:.86, textureScale:1.10, fadeOutLate:true, holdMs:0, launchSquash:0, landSquash:0, wobble:0, settleMs:0, noShadow:true, keepInFrame:true, safeMargin:16, safeBottomMargin:handSafeMargin, layer, priority:'high'}),
      P().cardImpact({iid:p.iid || baseId, card:null, rect:settleLane || presentationLane || to, startOffset:start + 500, duration:60, amplitude:.003, layer, priority:'normal'})
    ];
    if(!p.suppressMotionAudio) list.push(P().soundCue({cue:p.cue || 'draw_card', startOffset:start + 76}));
    return list;
  }

  function searchToHand(payload){
    const p = payload || {};
    const from = fitCardAspect(payloadRect(p, ['fromRect', 'deckRect', 'discardRect', 'sourceRect']));
    const to = fitCardAspect(payloadRect(p, ['toRect', 'handRect', 'slotRect']));
    const sourceIsDiscard = p.source === 'discard';
    const baseId = String(p.iid || 'search');
    const layer = p.layer || 'top';
    const h = Number((to || from || {}).h) || 98;
    const start = Math.max(0, Number(p.startOffset) || 0);
    const destination = to ? offsetRect(to, 0, 14) : to;
    const reveal = clampRectToViewport(leftPanelSearchRevealRect(from, destination || to, sourceIsDiscard) || destination || to || from, 18);
    // Keep one physical card size for the complete search flight. Changing the
    // rectangle dimensions between phases made the selected card visibly shrink.
    const fixedSize = {w:Number(reveal?.w || from?.w || to?.w) || 70, h:Number(reveal?.h || from?.h || to?.h) || 98};
    const flightFrom = resizeRectAroundCenter(from, fixedSize);
    const flightTo = resizeRectAroundCenter(destination || to, fixedSize);
    // Flip & catch: wind up, flick into a readable reveal, then catch with
    // one small rebound. The complete 1700ms motion fits the 1750ms gate.
    const recoil = offsetRect(flightFrom, 0, Math.min(10, h * .07));
    const catchRect = offsetRect(flightTo, 0, Math.min(8, h * .055));
    const rebound = offsetRect(flightTo, 0, -Math.min(6, h * .04));
    const common = {iid:p.iid || baseId, card:p.card || null, faceDown:p.faceDown === true,
      scale:1, startScale:1, endScale:1, textureScale:1.18, overshoot:0,
      launchSquash:0, landSquash:0, wobble:0, settleMs:0, rotate:0,
      noShadow:true, keepInFrame:true, safeMargin:12, safeBottomMargin:12, layer, priority:'high'};
    const move = options => cardMove(Object.assign({}, common, options));
    return [
      move({fromRect:flightFrom, toRect:recoil, startOffset:start, duration:140, easing:'in-out-cubic', path:'direct', arc:0, lift:0, endRotate:-8, faceDown:!sourceIsDiscard || common.faceDown}),
      move({fromRect:recoil, toRect:reveal, startOffset:start + 140, duration:800, holdMs:280, easing:'out-cubic', path:'s-curve', arc:.32, lift:.32, sideArc:-.08, startRotate:-8, rotate:-14, flipStart:sourceIsDiscard ? 0 : 180, flipEnd:360}),
      move({fromRect:reveal, toRect:catchRect, startOffset:start + 940, duration:500, easing:'in-quart', path:'s-curve', arc:.18, lift:.18, sideArc:.06, rotate:-9, endRotate:6}),
      move({fromRect:catchRect, toRect:rebound, startOffset:start + 1440, duration:130, easing:'out-cubic', path:'direct', arc:0, lift:0, startRotate:6, endRotate:-3}),
      move({fromRect:rebound, toRect:flightTo, startOffset:start + 1570, duration:130, easing:'in-out-cubic', path:'direct', arc:0, lift:0, startRotate:-3, endRotate:0}),
      P().soundCue({cue:'search_found', startOffset:start + 640, priority:'high'})
    ].filter(Boolean);
  }

  function discardCard(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'sourceRect']);
    const to = payloadRect(p, ['toRect', 'discardRect']);
    return [
      cardMove({iid:p.iid, card:p.card, faceDown:p.faceDown === true || p.card?.faceDown === true, fromRect:from, toRect:from, startOffset:0, duration:1500, fracture:true, noShadow:true, priority:'high'}),
      P().soundCue({cue:'discard_fracture', startOffset:720, priority:'high'})
    ];
  }

  function resizeRectAroundCenter(rect, size){
    if(!rect || !size) return rect || null;
    const point = center(rect);
    const w = Math.max(1, Number(size.w) || Number(rect.w) || 1);
    const h = Math.max(1, Number(size.h) || Number(rect.h) || 1);
    return {x:point.x - w / 2, y:point.y - h / 2, w, h};
  }

  function destroyCard(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'sourceRect', 'targetRect']);
    const to = payloadRect(p, ['toRect', 'discardRect']) || from;
    const recoil = from ? offsetRect(from, 0, -Math.max(12, from.h * .12)) : from;
    return [
      cardMove({iid:p.iid, card:p.card, fromRect:from, toRect:recoil || from, startOffset:0, duration:142, easing:'out-quint', path:'direct', rotate:6, bank:3.5, scale:1.05, launchSquash:.024, priority:'high'}),
      cardMove({iid:p.iid, card:p.card, fromRect:recoil || from, toRect:to, startOffset:116, duration:360, easing:'in-quart', path:'drop', arc:.22, lift:.10, sideArc:.30, rotate:20, bank:8, scale:1, fadeOut:true, priority:'high'}),
      P().soundCue({cue:'destroy_card', startOffset:140, priority:'high'})
    ];
  }

  function fateGain(payload){
    if(payload && payload.suppressMotionAudio) return [];
    return [
      P().soundCue({cue:'fate_gain', startOffset:90})
    ];
  }

  function fateLoss(payload){
    return [
      P().soundCue({cue:'fate_loss', startOffset:72})
    ];
  }

  function moveCard(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'sourceRect']);
    const to = payloadRect(p, ['toRect', 'targetRect', 'cellRect']);
    const travelMs = Math.max(120, Math.min(240, Number(p.duration) || 170));
    const list = [
      cardMove({iid:p.iid, card:p.card, faceDown:p.faceDown === true || p.card?.faceDown === true || p.card?.hidden === true, fromRect:from, toRect:to, startOffset:0, duration:travelMs, easing:p.easing || 'out-cubic', path:p.path || 'direct', arc:Number.isFinite(Number(p.arc)) ? Number(p.arc) : 0, lift:Number.isFinite(Number(p.lift)) ? Number(p.lift) : 0, sideArc:Number.isFinite(Number(p.sideArc)) ? Number(p.sideArc) : 0, rotate:Number.isFinite(Number(p.rotate)) ? Number(p.rotate) : 0, bank:Number.isFinite(Number(p.bank)) ? Number(p.bank) : 0, scale:Number.isFinite(Number(p.scale)) ? Number(p.scale) : 1, textureScale:Number.isFinite(Number(p.textureScale)) ? Number(p.textureScale) : 1, overshoot:Number(p.overshoot) || 0, holdMs:0, landSquash:0, wobble:0, settleMs:0, noShadow:p.noShadow !== false, fastBoardMove:p.fastBoardMove !== false, priority:p.priority || 'normal'})
    ];
    if(!p.suppressMotionAudio) list.push(P().soundCue({cue:p.cue || 'card_move', startOffset:Math.max(40, travelMs - 44)}));
    return list;
  }

  function swapCards(payload){
    const p = payload || {};
    const a = p.a || {};
    const b = p.b || {};
    const aTo = a.toRect || b.fromRect;
    const bTo = b.toRect || a.fromRect;
    const travelMs = Math.max(130, Math.min(260, Number(p.duration) || 190));
    return [
      cardMove({iid:a.iid, card:a.card, faceDown:a.faceDown === true || a.card?.faceDown === true || a.card?.hidden === true, fromRect:a.fromRect, toRect:aTo, startOffset:0, duration:travelMs, easing:p.easing || 'out-cubic', path:'direct', arc:0, lift:0, sideArc:0, rotate:0, bank:0, scale:1, textureScale:1, overshoot:0, holdMs:0, landSquash:0, wobble:0, settleMs:0, noShadow:true, fastBoardMove:true, priority:p.priority || 'normal'}),
      cardMove({iid:b.iid, card:b.card, faceDown:b.faceDown === true || b.card?.faceDown === true || b.card?.hidden === true, fromRect:b.fromRect, toRect:bTo, startOffset:0, duration:travelMs, easing:p.easing || 'out-cubic', path:'direct', arc:0, lift:0, sideArc:0, rotate:0, bank:0, scale:1, textureScale:1, overshoot:0, holdMs:0, landSquash:0, wobble:0, settleMs:0, noShadow:true, fastBoardMove:true, priority:p.priority || 'normal'}),
      P().soundCue({cue:p.cue || 'card_move', startOffset:Math.max(40, travelMs - 44)})
    ];
  }

  function consolidate(payload){
    const p=payload||{},targetRect=payloadRect(p,['targetRect','toRect']);
    const tributes=Array.isArray(p.tributes)?p.tributes:[],resultCard=p.resultCard||p.targetCard||null;
    const multi=tributes.length>1,duration=multi?2700:1800,consolidationStyle=multi?'crown':'prism';
    const list=[P().soundCue({cue:'consolidate_charge',startOffset:42,priority:'high'})];
    tributes.forEach(function(t,index){const from=t&&(t.rect||t.fromRect||t.cardRect);if(!from)return;
      list.push(cardMove({iid:t.iid,card:t.card,faceDown:t.faceDown===true||t.card?.faceDown===true,fromRect:from,toRect:targetRect,startOffset:0,duration,consolidationStyle,tribute:true,tributeIndex:index,tributeCount:tributes.length,rarity:resultCard?.rarity,priority:'high'}));
    });
    list.push(cardMove({iid:p.resultMotionIid||p.targetIid||p.resultCardIid,card:resultCard,faceDown:p.faceDown,fromRect:targetRect,toRect:targetRect,startOffset:0,duration,consolidationStyle,rarity:resultCard?.rarity,priority:'high'}));
    list.push(P().soundCue({cue:String(resultCard?.id||'')==='whisper17'?'whisper_consolidate':'consolidate_impact',startOffset:Math.round(duration*(multi?.70:.53)),priority:'high'}));
    return list;
  }

  function supporterActivate(payload){
    const p = payload || {};
    const from = payloadRect(p, ['sourceRect', 'fromRect', 'rect']);
    const to = payloadRect(p, ['targetRect', 'toRect']) || from;
    const show = featuredRect(from || to, 1.24, {lift:.20}) || from;
    return [
      cardMove({iid:p.iid || p.sourceIid, card:p.card || p.sourceCard, fromRect:from, toRect:show || from, startOffset:0, duration:260, easing:'out-expo-soft', path:'float', arc:.14, lift:.15, rotate:2.0, scale:1.06, textureScale:1.18, holdMs:72, priority:'normal'}),
      cardMove({iid:p.proxyIid || p.sourceIid, card:p.card || p.sourceCard || null, fromRect:show || from, toRect:liftRect(to, .08) || to, startOffset:286, duration:238, easing:'out-expo-soft', path:'s-curve', arc:.13, lift:.13, rotate:2.8, scale:1, fadeOut:true, priority:'normal'}),
      P().soundCue({cue:'supporter_activate', startOffset:108})
    ];
  }

  function landscapeTrigger(payload){
    const p = payload || {};
    const rect = payloadRect(p, ['rect', 'zoneRect', 'targetRect']);
    return [
      P().cardLift({iid:p.iid, card:p.card || null, rect, fromRect:rect, toRect:rect, startOffset:0, duration:160, easing:'out-quint', lift:.045, rotate:.25, scale:1.012, priority:'normal'}),
      impact(p.iid, rect, 118, .014),
      P().soundCue({cue:'landscape_trigger', startOffset:106})
    ];
  }

  function zoneControlShift(payload){
    const p = payload || {};
    const rect = payloadRect(p, ['rect', 'zoneRect', 'targetRect']);
    return [
      impact(p.iid, rect, 72, .018),
      P().soundCue({cue:'zone_control_shift', startOffset:48, priority:'high'})
    ];
  }

  function zoneControlLock(payload){
    const p = payload || {};
    const rect = payloadRect(p, ['rect', 'zoneRect', 'targetRect']);
    return [
      impact(p.iid, rect, 88, .024),
      P().soundCue({cue:'zone_control_lock', startOffset:64, priority:'high'})
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
      snapMove({iid:p.iid, card:p.card, fromRect:rect, toRect:nudge || rect, startOffset:0, duration:74, rotate:.8, scale:1.006, priority:'high'}),
      snapMove({iid:p.iid, card:p.card, fromRect:nudge || rect, toRect:rect, startOffset:70, duration:92, rotate:-.6, scale:1.0, priority:'high'}),
      P().soundCue({cue:'invalid_action', startOffset:24})
    ];
  }

  function cardReveal(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'sourceRect']);
    const to = payloadRect(p, ['toRect', 'targetRect', 'rect']) || from;
    const hang = featuredRect(to, 1.32, {lift:.24}) || liftRect(to, .16);
    return [
      cardMove({iid:p.iid, card:p.card, fromRect:from || to, toRect:hang || to, startOffset:0, duration:386, easing:'out-expo-soft', path:'showcase', arc:.20, lift:.23, rotate:2.6, scale:1.08, textureScale:1.24, overshoot:.018, holdMs:80, fadeIn:!from, priority:'high'}),
      cardMove({iid:p.iid, card:p.card, fromRect:hang || from || to, toRect:to, startOffset:474, duration:142, easing:'snap-settle', path:'direct', rotate:-.8, landSquash:.010, priority:'high'}),
      P().soundCue({cue:'card_reveal', startOffset:122})
    ];
  }

  const recipes = {
    CARD_FLIP:function(payload){
      const p = payload || {};
      const r = payloadRect(p, ['rect', 'targetRect', 'cardRect']);
      let viewer = null;
      try { viewer = typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : G.currentPlayer; } catch(e) {}
      return [
        P().cardFlip({
          iid:p.iid,
          card:p.card,
          rect:r,
          startOffset:0,
          duration:Number(p.duration) || 950,
          orbitReveal:true,
          startFaceDown:p.startFaceDown != null ? !!p.startFaceDown : !(viewer != null && p.card?.owner != null && Number(p.card.owner) === Number(viewer)),
          easing:'in-out-cubic',
          revealAt:Number(p.revealAt) || .68,
          lift:.036,
          scalePulse:.024,
          rotate:.85,
          textureScale:1.18,
          noGlow:true,
          priority:'high'
        }),
        P().soundCue({cue:'card_flip', startOffset:360}),
        P().soundCue({cue:'card_reveal', startOffset:520})
      ];
    },
    PLAY_CARD:playCard,
    SET_CONFIRM:setConfirm,
    SET_DRAG_LAND:setDragLand,
    DRAW_CARD:drawCard,
    DISCARD_CARD:discardCard,
    DESTROY_CARD:destroyCard,
    MOVE_CARD:moveCard,
    SWAP_CARDS:swapCards,
    RETURN_TO_HAND:function(payload){ return moveCard(Object.assign({cue:'return_to_hand', path:'withdraw', rotate:-2.0, scale:1, duration:MOTION.normal}, payload || {})); },
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
    ZONE_SHIFT:zoneControlShift,
    ZONE_SCORE:zoneControlShift,
    ZONE_WIN_FLIP:zoneControlLock,
    MATCH_START:turnStart,
    MATCH_RESULT:cardReveal,
    INVALID_ACTION:invalidAction,
    TURN_START:turnStart,
    TURN_END:turnEnd
  };
  const RETIRED_BOARD_PLACEMENT_RECIPES = new Set(['PLAY_CARD', 'DECK_TO_BOARD', 'SET_CONFIRM', 'SET_DRAG_LAND']);

  window.FateVfxRecipes = {
    version:VERSION,
    names:function(){ return Object.keys(recipes); },
    has:function(name){ return !!recipes[String(name || '').toUpperCase()]; },
    expand:function(name, payload){
      const recipeName = String(name || '').toUpperCase();
      // This is the lowest public expansion boundary. Keep the retired set
      // motion inert even if a stale caller bypasses both the event bridge and
      // director and asks the recipe registry for primitives directly.
      if(RETIRED_BOARD_PLACEMENT_RECIPES.has(recipeName)) return [];
      const fn = recipes[recipeName];
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
        motionLanguage:{
          profiles:Object.keys(MOTION_PROFILES),
          compositorOnly:true,
          particles:false,
          domMotion:false,
          texturePreflightScale:true
        },
        mode:'motion-only',
        particles:false,
        recipes:Object.keys(recipes),
        recipeKinds
      };
    }
  };
  window.fateVfxRecipesReport = window.FateVfxRecipes.report;
})();
