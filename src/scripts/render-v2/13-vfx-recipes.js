(function(){
  'use strict';

  if(typeof window === 'undefined') return;
  if(window.FateVfxRecipes) return;

  const VERSION = 1;
  const MOTION = {
    quick:210,
    normal:360,
    heavy:560,
    marquee:940,
    stagger:42,
    shortStagger:28
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
    return [
      P().cardMove({iid:p.iid, card:p.card, fromRect:from, toRect:to, startOffset:0, duration:MOTION.heavy, easing:'in-out-cubic', path:'overshoot', arc:.27, lift:.24, rotate:4.2, scale:1.06, overshoot:.058, settleMs:142, priority:'high'}),
      P().cardImpact({iid:p.iid, card:p.card, rect:to, startOffset:MOTION.heavy - 36, duration:150, amplitude:.046, priority:'normal'}),
      P().soundCue({cue:'card_play_land', startOffset:MOTION.heavy - 78, priority:'high'})
    ];
  }

  function drawCard(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'deckRect', 'sourceRect']);
    const to = payloadRect(p, ['toRect', 'handRect', 'slotRect']);
    return [
      P().cardMove({iid:p.iid, card:p.card || null, faceDown:p.faceDown !== false, fromRect:from, toRect:to, startOffset:Number(p.startOffset) || 0, duration:MOTION.normal + 105, easing:'in-out-cubic', path:'withdraw', arc:.18, lift:.16, rotate:-3.2, scale:1.04, overshoot:.026, settleMs:112, layer:p.layer || 'effects'}),
      P().soundCue({cue:'draw_card', startOffset:112})
    ];
  }

  function searchToHand(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'deckRect', 'discardRect', 'sourceRect']);
    const to = payloadRect(p, ['toRect', 'handRect', 'slotRect']);
    return [
      P().cardMove({iid:p.iid, card:p.card || null, faceDown:p.faceDown === true, fromRect:from, toRect:to, startOffset:0, duration:MOTION.heavy + 60, easing:'in-out-cubic', path:'overshoot', arc:.34, lift:.27, rotate:p.source === 'discard' ? -5.8 : 5.8, scale:1.075, overshoot:.075, settleMs:150, holdMs:48, layer:p.layer || 'effects', priority:'high'}),
      P().cardImpact({iid:p.iid, card:p.faceDown ? null : p.card, faceDown:p.faceDown === true, rect:to, startOffset:MOTION.heavy + 16, duration:146, amplitude:.045, priority:'normal'}),
      P().soundCue({cue:'search_found', startOffset:150, priority:'high'})
    ];
  }

  function discardCard(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'sourceRect']);
    const to = payloadRect(p, ['toRect', 'discardRect']);
    return [
      P().cardMove({iid:p.iid, card:p.card, fromRect:from, toRect:from, startOffset:0, duration:92, easing:'out-cubic', path:'direct', lift:.10, rotate:-1.4, scale:1.04, priority:'normal'}),
      P().cardMove({iid:p.iid, card:p.card, fromRect:from, toRect:to, startOffset:56, duration:MOTION.normal + 92, easing:'in-out-cubic', path:'withdraw', arc:.16, lift:.18, rotate:-7.2, scale:.68, fadeOut:true, priority:'high'}),
      P().soundCue({cue:'discard_card', startOffset:338})
    ];
  }

  function destroyCard(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'sourceRect', 'targetRect']);
    const to = payloadRect(p, ['toRect', 'discardRect']) || from;
    return [
      P().cardShake({iid:p.iid, rect:from, startOffset:0, duration:118, amplitude:4, priority:'high'}),
      P().cardMove({iid:p.iid, card:p.card, fromRect:from, toRect:to, startOffset:80, duration:MOTION.heavy - 80, easing:'in-out-cubic', path:'drop', arc:.04, lift:.03, rotate:7, scale:.72, fadeOut:true, priority:'high'}),
      P().soundCue({cue:'destroy_card', startOffset:120, priority:'high'})
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
      P().cardImpact({iid:p.iid, card:p.card, rect, startOffset:0, duration:150, amplitude:.045, priority:'normal'}),
      P().numberPop({text:fateDeltaText(p, '+'), rect, startOffset:20, duration:760, rise:50, color:'#7fff90', theme:'fate-delta', priority:'high'}),
      P().soundCue({cue:'fate_gain', startOffset:110})
    ];
  }

  function fateLoss(payload){
    const p = payload || {};
    const rect = payloadRect(p, ['rect', 'targetRect', 'cardRect']);
    return [
      P().cardShake({iid:p.iid, rect, startOffset:0, duration:160, amplitude:3}),
      P().numberPop({text:fateDeltaText(p, '-'), rect, startOffset:18, duration:760, rise:50, color:'#ff6060', theme:'fate-loss', priority:'high'}),
      P().soundCue({cue:'fate_loss', startOffset:85})
    ];
  }

  function moveCard(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'sourceRect']);
    const to = payloadRect(p, ['toRect', 'targetRect', 'cellRect']);
    return [
      P().cardMove({iid:p.iid, card:p.card, fromRect:from, toRect:to, startOffset:0, duration:Number(p.duration) || MOTION.normal + 70, easing:p.easing || 'in-out-cubic', path:p.path || 'arc', arc:Number.isFinite(Number(p.arc)) ? Number(p.arc) : .16, lift:Number.isFinite(Number(p.lift)) ? Number(p.lift) : .12, rotate:Number.isFinite(Number(p.rotate)) ? Number(p.rotate) : 2.8, scale:Number(p.scale) || 1.025, overshoot:Number(p.overshoot) || .018, settleMs:Number(p.settleMs) || 96, priority:p.priority || 'high'}),
      P().cardImpact({iid:p.iid, card:p.card, rect:to, startOffset:(Number(p.duration) || MOTION.normal + 70) - 28, duration:120, amplitude:.028, priority:'normal'}),
      P().soundCue({cue:p.cue || 'card_move', startOffset:(Number(p.duration) || MOTION.normal + 70) - 46})
    ];
  }

  function swapCards(payload){
    const p = payload || {};
    const a = p.a || {};
    const b = p.b || {};
    return [
      P().cardMove({iid:a.iid, card:a.card, fromRect:a.fromRect, toRect:a.toRect || b.fromRect, startOffset:0, duration:MOTION.normal + 90, easing:'in-out-cubic', path:'arc', arc:.18, lift:.16, rotate:4, scale:1.025, overshoot:.012, settleMs:100, priority:'high'}),
      P().cardMove({iid:b.iid, card:b.card, fromRect:b.fromRect, toRect:b.toRect || a.fromRect, startOffset:34, duration:MOTION.normal + 90, easing:'in-out-cubic', path:'arc', arc:.18, lift:.16, rotate:-4, scale:1.025, overshoot:.012, settleMs:100, priority:'high'}),
      P().soundCue({cue:'card_move', startOffset:MOTION.normal})
    ];
  }

  function consolidate(payload){
    const p = payload || {};
    const targetRect = payloadRect(p, ['targetRect', 'toRect']);
    const tributes = Array.isArray(p.tributes) ? p.tributes : [];
    const targetCore = inset(targetRect, .13);
    const collideGap = 94;
    const collideDuration = 310;
    const firstCollide = 70;
    const combineStart = firstCollide + Math.max(1, tributes.length) * collideGap + collideDuration + 34;
    const list = [
      P().soundCue({cue:'consolidate_charge', startOffset:42, priority:'high'})
    ];
    tributes.forEach(function(t, index){
      const from = t && (t.rect || t.fromRect || t.cardRect);
      if(!from) return;
      const collideAt = firstCollide + index * collideGap;
      list.push(P().cardMove({
        iid:t.iid,
        card:t.card,
        fromRect:from,
        toRect:targetCore,
        startOffset:collideAt,
        duration:collideDuration,
        easing:'in-out-cubic',
        path:'overshoot',
        arc:.34,
        lift:.30,
        rotate:index % 2 ? -10 : 10,
        scale:.74,
        overshoot:.07,
        fadeOut:true,
        priority:'high'
      }));
      list.push(P().cardImpact({iid:t.iid, card:t.card, rect:targetRect, startOffset:collideAt + collideDuration - 38, duration:112, amplitude:.035, priority:'normal'}));
    });
    list.push(P().cardImpact({iid:p.targetIid, card:p.targetCard || p.resultCard, rect:targetRect, startOffset:combineStart - 28, duration:172, amplitude:.064, priority:'high'}));
    const targetCenter = center(targetRect);
    list.push(P().shockwaveRing({x:targetCenter.x, y:targetCenter.y, radiusStart:Math.max(8, targetRect.w * .18), radiusEnd:Math.max(48, targetRect.w * .62), startOffset:combineStart - 8, duration:240, color:'rgba(255,232,150,.48)', lineWidth:3, priority:'normal'}));
    list.push(P().soundCue({cue:'consolidate_impact', startOffset:combineStart - 18, priority:'high'}));
    return list;
  }

  function supporterActivate(payload){
    const p = payload || {};
    const from = payloadRect(p, ['sourceRect', 'fromRect', 'rect']);
    const to = payloadRect(p, ['targetRect', 'toRect']) || from;
    return [
      P().cardLift({iid:p.iid || p.sourceIid, card:p.card || p.sourceCard, rect:from, fromRect:from, toRect:from, startOffset:0, duration:190, easing:'out-cubic', lift:.16, rotate:2, scale:1.025, priority:'normal'}),
      P().cardMove({iid:p.proxyIid || p.sourceIid, card:p.card || p.sourceCard || null, fromRect:from, toRect:inset(to, .08), startOffset:70, duration:260, easing:'out-cubic', path:'snap', arc:.10, lift:.10, rotate:3, scale:.72, fadeOut:true, priority:'normal'}),
      P().cardImpact({iid:p.targetIid, card:p.targetCard || null, rect:to, startOffset:260, duration:130, amplitude:.036, priority:'normal'}),
      P().soundCue({cue:'supporter_activate', startOffset:100})
    ];
  }

  function landscapeTrigger(payload){
    const p = payload || {};
    const rect = payloadRect(p, ['rect', 'zoneRect', 'targetRect']);
    return [
      P().cardImpact({iid:p.iid, card:p.card || null, rect, startOffset:0, duration:190, amplitude:.032, priority:'normal'}),
      P().soundCue({cue:'landscape_trigger', startOffset:130})
    ];
  }

  function turnStart(payload){
    const p = payload || {};
    return [
      P().handFanPulse({rect:p.handRect, startOffset:90, duration:260, color:'rgba(116,196,255,.38)', priority:'low'}),
      P().soundCue({cue:'turn_start', startOffset:80})
    ];
  }

  function turnEnd(payload){
    const p = payload || {};
    return [
      P().handFanPulse({rect:p.handRect, startOffset:0, duration:220, color:'rgba(255,218,118,.30)', priority:'low'}),
      P().soundCue({cue:'turn_end', startOffset:40})
    ];
  }

  function invalidAction(payload){
    const p = payload || {};
    const rect = payloadRect(p, ['rect', 'targetRect', 'cardRect']);
    return [
      P().cardShake({iid:p.iid, rect, startOffset:0, duration:150, amplitude:4, priority:'high'}),
      P().soundCue({cue:'invalid_action', startOffset:30})
    ];
  }

  function cardReveal(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'sourceRect']);
    const to = payloadRect(p, ['toRect', 'targetRect', 'rect']) || from;
    return [
      P().cardMove({iid:p.iid, card:p.card, fromRect:from || to, toRect:to, startOffset:0, duration:MOTION.heavy - 90, easing:'out-cubic', path:'arc', arc:.16, lift:.14, rotate:2, scale:1.04, fadeIn:!from, settleMs:120, priority:'high'}),
      P().cardImpact({iid:p.iid, card:p.card, rect:to, startOffset:MOTION.heavy - 136, duration:140, amplitude:.034, priority:'normal'}),
      P().soundCue({cue:'card_reveal', startOffset:120})
    ];
  }

  const recipes = {
    CARD_FLIP:function(payload){
      const p = payload || {};
      const r = payloadRect(p, ['rect', 'targetRect', 'cardRect']);
      return [
        P().cardFlip({iid:p.iid, card:p.card, rect:r, startOffset:0, duration:430, glowColor:'rgba(255,232,150,.42)', revealFlash:false, noGlow:true}),
        P().cardImpact({iid:p.iid, card:p.card, rect:r, startOffset:350, duration:110, amplitude:.028}),
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
