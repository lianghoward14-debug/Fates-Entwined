(function(){
  'use strict';

  if(typeof window === 'undefined') return;
  if(window.FateVfxRecipes) return;

  const VERSION = 1;

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
      P().cardTrail({fromRect:from, toRect:to, startOffset:20, duration:320, color:'rgba(255,232,150,.5)', priority:'low'}),
      P().cardMove({iid:p.iid, card:p.card, fromRect:from, toRect:to, startOffset:0, duration:430, easing:'out-cubic', arc:.22, lift:.34, rotate:1.2, scale:1.015}),
      P().cardGlow({rect:to, startOffset:300, duration:260, color:'rgba(255,232,150,.74)', priority:'low'}),
      P().soundCue({cue:'card_play_land', startOffset:340, priority:'high'})
    ];
  }

  function drawCard(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'deckRect', 'sourceRect']);
    const to = payloadRect(p, ['toRect', 'handRect', 'slotRect']);
    return [
      P().pilePulse({rect:from, startOffset:0, duration:260, color:'rgba(255,232,150,.58)', priority:'low'}),
      P().cardTrail({fromRect:from, toRect:to, startOffset:30, duration:280, color:'rgba(130,210,255,.45)', priority:'low'}),
      P().cardMove({iid:p.iid, card:p.card || null, faceDown:p.faceDown !== false, fromRect:from, toRect:to, startOffset:0, duration:390, easing:'out-cubic', arc:.18, lift:.28, layer:p.layer || 'effects'}),
      P().cardGlow({rect:to, startOffset:250, duration:240, color:'rgba(130,210,255,.52)', priority:'low'}),
      P().soundCue({cue:'draw_card', startOffset:90})
    ];
  }

  function discardCard(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'sourceRect']);
    const to = payloadRect(p, ['toRect', 'discardRect']);
    return [
      P().cardTrail({fromRect:from, toRect:to, startOffset:0, duration:300, color:'rgba(216,162,255,.4)', priority:'low'}),
      P().cardMove({iid:p.iid, card:p.card, fromRect:from, toRect:to, startOffset:0, duration:390, easing:'in-out-cubic', arc:.10, lift:.16, rotate:-2, scale:.82}),
      P().pilePulse({rect:to, startOffset:300, duration:240, color:'rgba(216,162,255,.5)', priority:'low'}),
      P().soundCue({cue:'discard_card', startOffset:320})
    ];
  }

  function destroyCard(payload){
    const p = payload || {};
    const from = payloadRect(p, ['fromRect', 'sourceRect', 'targetRect']);
    const to = payloadRect(p, ['toRect', 'discardRect']) || from;
    return [
      P().cardShake({iid:p.iid, rect:from, startOffset:0, duration:140, amplitude:4}),
      P().cardDissolve({iid:p.iid, card:p.card, fromRect:from, toRect:to, startOffset:90, duration:430, easing:'in-out-cubic'}),
      P().soundCue({cue:'destroy_card', startOffset:120, priority:'high'})
    ];
  }

  function fateGain(payload){
    const p = payload || {};
    const rect = payloadRect(p, ['rect', 'targetRect', 'cardRect']);
    return [
      P().cardGlow({rect, startOffset:0, duration:320, color:'rgba(255,227,122,.62)', priority:'low'}),
      P().numberPop({text:p.text || ('+' + (p.amount || 1) + ' Fate'), rect, startOffset:0, duration:420, color:'#ffe37a'}),
      P().soundCue({cue:'fate_gain', startOffset:110})
    ];
  }

  function fateLoss(payload){
    const p = payload || {};
    const rect = payloadRect(p, ['rect', 'targetRect', 'cardRect']);
    return [
      P().cardShake({iid:p.iid, rect, startOffset:0, duration:160, amplitude:3}),
      P().numberPop({text:p.text || ('-' + (p.amount || 1) + ' Fate'), rect, startOffset:40, duration:420, color:'#d8a2ff'}),
      P().soundCue({cue:'fate_loss', startOffset:85})
    ];
  }

  function consolidate(payload){
    const p = payload || {};
    const targetRect = payloadRect(p, ['targetRect', 'toRect']);
    const tributes = Array.isArray(p.tributes) ? p.tributes : [];
    const list = [
      P().cardGlow({rect:targetRect, startOffset:0, duration:360, color:'rgba(255,232,150,.68)', priority:'low'}),
      P().soundCue({cue:'consolidate_charge', startOffset:60, priority:'high'})
    ];
    tributes.forEach(function(t, index){
      const from = t && (t.rect || t.fromRect || t.cardRect);
      if(!from) return;
      const delay = 80 + index * 70;
      list.push(P().cardMove({
        iid:t.iid,
        card:t.card,
        fromRect:from,
        toRect:inset(targetRect, .12),
        startOffset:delay,
        duration:460,
        easing:'out-cubic',
        arc:.30,
        lift:.42,
        rotate:index % 2 ? -3 : 3,
        scale:.72,
        fadeOut:true,
        priority:'high'
      }));
    });
    const impact = 100 + Math.max(1, tributes.length) * 70 + 360;
    list.push(P().cardSummon({iid:p.resultCardIid || p.targetIid, card:p.resultCard || p.targetCard, rect:targetRect, startOffset:impact, duration:320, color:'rgba(255,232,150,.86)'}));
    list.push(P().soundCue({cue:'consolidate_impact', startOffset:impact, priority:'high'}));
    list.push(P().soundCue({cue:'consolidate_reveal', startOffset:impact + 120, priority:'high'}));
    return list;
  }

  function supporterActivate(payload){
    const p = payload || {};
    const from = payloadRect(p, ['sourceRect', 'fromRect', 'rect']);
    const to = payloadRect(p, ['targetRect', 'toRect']) || from;
    return [
      P().beam({from:center(from), to:center(to), startOffset:0, duration:260, color:'rgba(108,210,255,.72)', width:3, particles:false}),
      P().statusIconPop({text:p.icon || 'SUPPORT', rect:to, startOffset:120, duration:360, color:'#9ee6ff'}),
      P().soundCue({cue:'supporter_activate', startOffset:100})
    ];
  }

  function landscapeTrigger(payload){
    const p = payload || {};
    const rect = payloadRect(p, ['rect', 'zoneRect', 'targetRect']);
    return [
      P().statusIconPop({text:p.text || 'TRIGGER', rect, startOffset:0, duration:360, color:p.color || '#9ee6ff'}),
      P().soundCue({cue:'landscape_trigger', startOffset:130})
    ];
  }

  function turnStart(payload){
    const p = payload || {};
    return [
      P().handFanPulse({rect:p.handRect, startOffset:90, duration:520, color:'rgba(116,196,255,.62)'}),
      P().soundCue({cue:'turn_start', startOffset:80})
    ];
  }

  function turnEnd(payload){
    const p = payload || {};
    return [
      P().handFanPulse({rect:p.handRect, startOffset:0, duration:420, color:'rgba(255,218,118,.45)'}),
      P().soundCue({cue:'turn_end', startOffset:40})
    ];
  }

  const recipes = {
    CARD_FLIP:function(payload){
      const p = payload || {};
      const r = payloadRect(p, ['rect', 'targetRect', 'cardRect']);
      return [
        P().cardFlip({iid:p.iid, card:p.card, rect:r, startOffset:0, duration:520, glowColor:'rgba(255,232,150,.86)', revealFlash:true}),
        P().soundCue({cue:'card_flip', startOffset:240})
      ];
    },
    PLAY_CARD:playCard,
    DRAW_CARD:drawCard,
    DISCARD_CARD:discardCard,
    DESTROY_CARD:destroyCard,
    FATE_GAIN:fateGain,
    FATE_LOSS:fateLoss,
    CONSOLIDATE:consolidate,
    SUPPORTER_ACTIVATE:supporterActivate,
    LANDSCAPE_TRIGGER:landscapeTrigger,
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
